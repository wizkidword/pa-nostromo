import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHomeDevicesApiHandlers } = require('../server/routes/devices.js');

function createResponse() {
  return { status: 0, payload: null };
}

function sendJson(res, status, payload) {
  res.status = status;
  res.payload = payload;
}

let body = '';
const executions = [];
const diagnostics = [];
const handlers = createHomeDevicesApiHandlers({
  sendJson,
  readBody: async () => body,
  parseJsonSafely(raw, source) {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch (error) {
      return { ok: false, error: `${source}_json_parse_failed`, message: String(error.message) };
    }
  },
  isPrivateOrLocalHost: (host) => host === '192.168.1.20' || host.endsWith('.local'),
  runExecFile: async (tool, args, timeoutMs) => {
    executions.push({ tool, args, timeoutMs });
    return { ok: tool === 'ping' || tool === 'etherwake' };
  },
  buildPingArgs: (host) => ['-c', '1', host],
  timeoutMs: 2500,
  logDiagnostic: (event, detail) => diagnostics.push({ event, detail }),
});

{
  body = JSON.stringify({ host: '192.168.1.20' });
  const res = createResponse();
  await handlers.handleApiHomeDevicePing({ method: 'POST' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.reachable, true);
  assert.deepEqual(executions[0], { tool: 'ping', args: ['-c', '1', '192.168.1.20'], timeoutMs: 2500 });
}

{
  body = JSON.stringify({ host: '8.8.8.8' });
  const res = createResponse();
  await handlers.handleApiHomeDevicePing({ method: 'POST' }, res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, 'host_not_local');
  assert.equal(executions.length, 1, 'invalid ping targets cannot run a command');
}

{
  body = JSON.stringify({ macAddress: 'aa-bb-cc-dd-ee-ff', host: 'office.local' });
  const res = createResponse();
  await handlers.handleApiHomeDeviceWake({ method: 'POST' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.tool, 'etherwake');
  assert.equal(res.payload.macAddress, 'AA:BB:CC:DD:EE:FF');
  assert.deepEqual(executions.slice(1), [
    { tool: 'wakeonlan', args: ['AA:BB:CC:DD:EE:FF'], timeoutMs: 2500 },
    { tool: 'etherwake', args: ['AA:BB:CC:DD:EE:FF'], timeoutMs: 2500 },
  ]);
}

assert.deepEqual(diagnostics, []);
console.log('devices-api-route: PASS');
