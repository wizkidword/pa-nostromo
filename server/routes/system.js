'use strict';

function createSystemResourcesApiHandler({ sendJson, parseAllowlistInput, sampleSystemResources }) {
  return async function handleApiSystemResources(req, res) {
    const requestUrl = new URL(req.url || '/api/system-resources', 'http://localhost');
    const allowlist = parseAllowlistInput(requestUrl.searchParams.get('allowlist') || '');
    return sendJson(res, 200, await sampleSystemResources({ allowlist }));
  };
}

function createSystemSpeedTestApiHandler({ sendJson, createClientAbortSignal, runSpeedTest, now = () => new Date() }) {
  return async function handleApiSpeedTest(req, res) {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/speed-test.' });
    }

    const clientRequest = createClientAbortSignal(req, res);
    try {
      const run = await runSpeedTest(clientRequest.signal);
      if (!run.ok) {
        return sendJson(res, 200, {
          ok: true,
          mode: 'fallback_required',
          sampledAt: now().toISOString(),
          reason: run.reason,
          message: run.message,
          checkedTools: run.checked,
        });
      }

      return sendJson(res, 200, {
        ok: true,
        mode: 'backend',
        sampledAt: now().toISOString(),
        backendTool: run.tool,
        checkedTools: run.checked,
        metrics: run.metrics,
      });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        error: 'speed_test_failed',
        message: String(err?.message || err || 'Speed test failed').slice(0, 180),
      });
    } finally {
      clientRequest.dispose();
    }
  };
}

module.exports = { createSystemResourcesApiHandler, createSystemSpeedTestApiHandler };
