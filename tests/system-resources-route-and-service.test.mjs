import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSystemResourcesApiHandler } = require('../server/routes/system.js');
const { createSystemResourcesService } = require('../server/services/system-resources.js');

let cpuReads = 0;
let networkReads = 0;
const sampleSystemResources = createSystemResourcesService({
  os: {
    totalmem: () => 1000,
    freemem: () => 250,
    uptime: () => 99.8,
    cpus: () => {
      cpuReads += 1;
      return [{ times: cpuReads === 1
        ? { user: 20, nice: 0, sys: 10, irq: 0, idle: 70 }
        : { user: 35, nice: 0, sys: 15, irq: 0, idle: 75 } }];
    },
  },
  platform: 'linux',
  readNetTotals: () => {
    networkReads += 1;
    return networkReads === 1 ? { rxBytes: 100, txBytes: 200 } : { rxBytes: 200, txBytes: 250 };
  },
  readDiskUsagePercent: async () => 42.5,
  readTopProcesses: async () => [
    { pid: 1, name: 'worker', cpuPercent: 15, memPercent: 10 },
    { pid: 2, name: 'database', cpuPercent: 8, memPercent: 30 },
  ],
  delay: async () => {},
  now: () => new Date('2026-07-16T12:00:00.000Z'),
});

const sample = await sampleSystemResources({ allowlist: ['work'] });
assert.equal(sample.host.cpuPercent, 80);
assert.equal(sample.host.memoryPercent, 75);
assert.deepEqual(sample.host.network, { downBytesPerSec: 400, upBytesPerSec: 200 });
assert.equal(sample.host.diskPercent, 42.5);
assert.equal(sample.host.uptimeSec, 99);
assert.deepEqual(sample.processes.topCpu.map((proc) => proc.name), ['worker', 'database']);
assert.deepEqual(sample.processes.topMemory.map((proc) => proc.name), ['database', 'worker']);
assert.deepEqual(sample.processes.allowlistMatches.map((proc) => proc.name), ['worker']);

const response = { status: 0, payload: null };
let routeAllowlist = null;
const handler = createSystemResourcesApiHandler({
  sendJson: (res, status, payload) => {
    res.status = status;
    res.payload = payload;
  },
  parseAllowlistInput: (value) => value.split(',').filter(Boolean),
  sampleSystemResources: async ({ allowlist }) => {
    routeAllowlist = allowlist;
    return { ok: true, source: 'test' };
  },
});

await handler({ url: '/api/system-resources?allowlist=worker,database' }, response);
assert.equal(response.status, 200);
assert.deepEqual(response.payload, { ok: true, source: 'test' });
assert.deepEqual(routeAllowlist, ['worker', 'database']);

console.log('system-resources-route-and-service: PASS');
