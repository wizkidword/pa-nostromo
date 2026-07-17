'use strict';

function createHomeDevicesApiHandlers({
  sendJson,
  readBody,
  parseJsonSafely,
  isPrivateOrLocalHost,
  runExecFile,
  buildPingArgs,
  timeoutMs,
  logDiagnostic,
}) {
  async function handleApiHomeDevicePing(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/home-devices/ping.' });
    const bodyRaw = await readBody(req);
    const parsed = parseJsonSafely(bodyRaw || '{}', 'home_device_ping');
    if (!parsed.ok) return sendJson(res, 400, { ok: false, error: parsed.error, message: parsed.message });
    const host = String(parsed.value?.host || '').trim();
    if (!host) return sendJson(res, 400, { ok: false, error: 'missing_host', message: 'host is required.' });
    if (!isPrivateOrLocalHost(host)) return sendJson(res, 400, { ok: false, error: 'host_not_local', message: 'host must be local/private IP or .local hostname.' });

    const start = Date.now();
    const out = await runExecFile('ping', buildPingArgs(host), timeoutMs);
    const latencyMs = Date.now() - start;
    if (out.ok) return sendJson(res, 200, { ok: true, reachable: true, host, latencyMs, message: 'Host reachable.' });
    logDiagnostic('home_device_ping_failed', { host, error: out.error, exitCode: out.code ?? out.exitCode });
    return sendJson(res, 200, { ok: true, reachable: false, host, latencyMs: null, message: 'Host did not respond.' });
  }

  async function handleApiHomeDeviceWake(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/home-devices/wake.' });
    const bodyRaw = await readBody(req);
    const parsed = parseJsonSafely(bodyRaw || '{}', 'home_device_wake');
    if (!parsed.ok) return sendJson(res, 400, { ok: false, error: parsed.error, message: parsed.message });
    const macAddress = String(parsed.value?.macAddress || '').trim().replace(/-/g, ':').toUpperCase();
    const host = String(parsed.value?.host || '').trim();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(macAddress)) {
      return sendJson(res, 400, { ok: false, error: 'invalid_mac', message: 'macAddress must be AA:BB:CC:DD:EE:FF.' });
    }
    if (host && !isPrivateOrLocalHost(host)) {
      return sendJson(res, 400, { ok: false, error: 'host_not_local', message: 'host must be local/private IP or .local hostname.' });
    }

    const attempts = [
      { tool: 'wakeonlan', args: [macAddress] },
      { tool: 'etherwake', args: [macAddress] },
    ];
    for (const attempt of attempts) {
      const out = await runExecFile(attempt.tool, attempt.args, timeoutMs);
      if (out.ok) return sendJson(res, 200, { ok: true, tool: attempt.tool, macAddress, message: 'Wake packet sent.' });
    }

    return sendJson(res, 503, { ok: false, error: 'wake_unavailable', message: 'No wake utility available (install wakeonlan or etherwake).' });
  }

  return { handleApiHomeDevicePing, handleApiHomeDeviceWake };
}

module.exports = { createHomeDevicesApiHandlers };
