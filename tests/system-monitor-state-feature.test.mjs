import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifySeverity,
  formatRateBytesPerSec,
  formatUptime,
  getPresetAllowlist,
  getPresetState,
  normalizeState,
} = require('../public/app/features/system-monitor-state.js');

assert.deepEqual(normalizeState({ allowlist: [' Node ', 'node', 'PYTHON'], settingsOpen: 1 }), {
  allowlist: ['node', 'python'],
  settingsOpen: true,
});
assert.equal(formatRateBytesPerSec(1536), '1.5 KB/s');
assert.equal(formatUptime(90061), '1d 1h');
assert.equal(classifySeverity(59.9), 'good');
assert.equal(classifySeverity(60), 'warn');
assert.equal(classifySeverity(85), 'danger');
assert.deepEqual(getPresetAllowlist('minimal'), ['node', 'openclaw', 'code']);
assert.deepEqual(getPresetState(['node', 'openclaw', 'code']), { dev: false, media: false, minimal: true });

console.log('system-monitor-state-feature: PASS');
