'use strict';

function createCameraSnapshotApiHandler({
  sendJson,
  isCameraProxyTargetAllowed,
  createClientAbortSignal,
  fetchCameraSnapshot,
  maxBytes,
}) {
  return async function handleApiCameraSnapshot(req, res) {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/camera-snapshot?url=...' });
    }

    const requestUrl = new URL(req.url || '/api/camera-snapshot', 'http://localhost');
    const targetUrl = String(requestUrl.searchParams.get('url') || '').trim();
    if (!targetUrl) {
      return sendJson(res, 400, { ok: false, error: 'missing_url', message: 'Query parameter "url" is required.' });
    }

    const targetCheck = isCameraProxyTargetAllowed(targetUrl);
    if (!targetCheck.ok) {
      return sendJson(res, 403, { ok: false, error: targetCheck.code, message: targetCheck.message });
    }

    let upstream;
    const clientRequest = createClientAbortSignal(req, res);
    try {
      upstream = await fetchCameraSnapshot(targetCheck.url, clientRequest.signal);
    } catch (err) {
      const status = Number(err?.status || 0) || (err?.code === 'response_too_large' ? 413 : err?.code === 'blocked_address' ? 403 : 502);
      return sendJson(res, status, { ok: false, error: err?.code || 'upstream_fetch_failed', message: 'Camera source could not be fetched safely.' });
    } finally {
      clientRequest.dispose();
    }

    if (!upstream.ok) {
      return sendJson(res, 502, {
        ok: false,
        error: 'upstream_http_error',
        message: `Camera source returned HTTP ${upstream.status}.`,
      });
    }

    const contentType = String(upstream.headers.get('content-type') || 'application/octet-stream');
    if (!/^image\/(?:jpeg|png|webp|gif)$/i.test(contentType.split(';', 1)[0].trim())) {
      return sendJson(res, 415, {
        ok: false,
        error: 'unsupported_media_type',
        message: 'Camera proxy only returns JPEG, PNG, WebP, or GIF images.',
      });
    }
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength && contentLength > maxBytes) {
      return sendJson(res, 413, {
        ok: false,
        error: 'payload_too_large',
        message: `Snapshot exceeds CAMERA_PROXY_MAX_BYTES (${maxBytes}).`,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    if (body.length > maxBytes) {
      return sendJson(res, 413, {
        ok: false,
        error: 'payload_too_large',
        message: `Snapshot exceeds CAMERA_PROXY_MAX_BYTES (${maxBytes}).`,
      });
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  };
}

module.exports = { createCameraSnapshotApiHandler };
