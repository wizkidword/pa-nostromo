'use strict';

function createCameraSnapshotService({ workCoordinator, safeFetch, timeoutMs, maxBytes, allowedHosts }) {
  return async function fetchCameraSnapshot(targetUrl, signal) {
    const normalizedUrl = targetUrl.toString();
    return workCoordinator.run({
      key: `camera:${normalizedUrl}`,
      integration: 'camera',
      host: targetUrl.hostname,
      signal,
      timeoutMs,
    }, ({ signal: coordinatedSignal }) => safeFetch(normalizedUrl, {
      method: 'GET',
      signal: coordinatedSignal,
      timeoutMs,
      firstByteTimeoutMs: timeoutMs,
      maxBytes,
      maxRedirects: 0,
      allowedHosts,
      headers: {
        'User-Agent': 'mission-control-lite-camera-proxy/1.0',
        'Accept': 'image/jpeg,image/png,image/webp,image/gif;q=0.9',
      },
    }));
  };
}

module.exports = { createCameraSnapshotService };
