import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
delete globalThis.MissionControlModules;
require('../public/app/core/contract.js');
require('../public/app/core/registry.js');
const registry = globalThis.MissionControlModules.podRegistry;

let releaseInit;
const initGate = new Promise((resolve) => { releaseInit = resolve; });
const phases = [];
registry.register({
  id: 'async-pod',
  render: () => phases.push('render'),
  lifecycle: {
    init: async () => { await initGate; phases.push('init'); },
    refresh: async () => phases.push('refresh'),
    mount: async () => phases.push('mount'),
    unmount: async () => phases.push('unmount'),
    destroy: async () => phases.push('destroy'),
  },
});
const mounting = registry.mount('async-pod');
assert.equal(registry.getRuntime('async-pod').initialized, false, 'Initialization cannot complete before its promise resolves.');
releaseInit();
assert.equal((await mounting).ok, true);
assert.deepEqual(phases, ['init', 'refresh', 'mount']);
assert.equal(registry.getRuntime('async-pod').mounted, true);
assert.equal((await registry.destroy('async-pod')).ok, true);
assert.deepEqual(phases, ['init', 'refresh', 'mount', 'unmount', 'destroy']);
assert.throws(() => registry.register({ id: 'async-pod', render: () => {} }), /already registered/);
console.log('pod-registry-lifecycle: PASS');
