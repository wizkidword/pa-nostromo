import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPingArgs } = require('../server.js');

const args = buildPingArgs('192.168.1.10');

if (process.platform === 'win32') {
  assert.deepEqual(args, ['-n', '1', '-w', '1000', '192.168.1.10']);
} else {
  assert.deepEqual(args, ['-c', '1', '-W', '1', '192.168.1.10']);
}

console.log('system-platform-adapters: PASS');
