import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  getActionAvailability,
  normalizeMacAddress,
  normalizeState,
  normalizeTags,
} = require('../public/app/features/home-device-state.js');

const state = normalizeState({
  devices: [
    { id: 'studio', name: ' Studio PC ', type: ' workstation ', host: ' 192.168.1.20 ', tags: [' office ', 'office', ''], macAddress: 'aa-bb-cc-dd-ee-ff' },
    { name: '   ', host: 'ignored' },
  ],
  settingsOpen: 1,
  pingByDevice: { studio: { status: 'up' } },
  toast: 'x'.repeat(250),
});

assert.equal(state.devices.length, 1);
assert.deepEqual(state.devices[0], {
  id: 'studio',
  name: 'Studio PC',
  type: 'workstation',
  host: '192.168.1.20',
  uiUrl: '',
  sshTarget: '',
  rdpUrl: '',
  macAddress: 'aa-bb-cc-dd-ee-ff',
  notes: '',
  tags: ['office'],
  lastWakeStatus: '',
  lastWakeAt: '',
});
assert.equal(state.settingsOpen, true);
assert.deepEqual(state.pingByDevice, { studio: { status: 'up' } });
assert.equal(state.toast.length, 200);
assert.deepEqual(normalizeTags(' lab, lab, servers '), ['lab', 'servers']);
assert.equal(normalizeMacAddress('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');

const unavailable = getActionAvailability({});
assert.equal(unavailable.remote.enabled, false);
assert.equal(unavailable.remote.reason, 'Add rdpUrl, sshTarget, or uiUrl.');
assert.equal(unavailable.wake.reason, 'Missing macAddress.');
const available = getActionAvailability({ host: '192.168.1.20', sshTarget: 'admin@studio', macAddress: 'AA:BB:CC:DD:EE:FF' });
assert.equal(available.remote.enabled, true);
assert.equal(available.ping.enabled, true);
assert.equal(available.copySsh.enabled, true);
assert.equal(available.wake.enabled, true);

console.log('home-device-state-feature: PASS');
