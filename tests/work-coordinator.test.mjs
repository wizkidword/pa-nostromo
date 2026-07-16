import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WorkCoordinatorError, createWorkCoordinator } = require('../lib/work-coordinator.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const coordinator = createWorkCoordinator({ globalLimit: 2, perIntegrationLimit: 1, perHostLimit: 1 });

let releaseShared;
const sharedGate = new Promise((resolve) => { releaseShared = resolve; });
let sharedStarts = 0;
const first = coordinator.run({ key: 'rss:example', integration: 'rss', host: 'example.test' }, async () => {
  sharedStarts += 1;
  await sharedGate;
  return 'shared-result';
});
const duplicate = coordinator.run({ key: 'rss:example', integration: 'rss', host: 'example.test' }, async () => 'must-not-run');
assert.strictEqual(first, duplicate, 'Identical work must share one in-flight promise.');
releaseShared();
assert.equal(await first, 'shared-result');
assert.equal(sharedStarts, 1);

let releaseFirst;
const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
const starts = [];
const sequentialA = coordinator.run({ key: 'social:a', integration: 'social', host: 'a.test' }, async () => {
  starts.push('a');
  await firstGate;
  return 'a';
});
const sequentialB = coordinator.run({ key: 'social:b', integration: 'social', host: 'b.test' }, async () => {
  starts.push('b');
  return 'b';
});
await wait(20);
assert.deepEqual(starts, ['a'], 'Per-integration concurrency must be one.');
releaseFirst();
assert.deepEqual(await Promise.all([sequentialA, sequentialB]), ['a', 'b']);
assert.deepEqual(starts, ['a', 'b']);

const abortController = new AbortController();
const cancelled = coordinator.run({ key: 'camera:cancel', integration: 'camera', host: 'camera.test', signal: abortController.signal }, ({ signal }) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(new Error('aborted'));
  signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
}));
await wait(10);
abortController.abort();
await assert.rejects(cancelled, (error) => error instanceof WorkCoordinatorError && error.code === 'work_cancelled');

coordinator.close();

const childCoordinator = createWorkCoordinator({ globalLimit: 1, perIntegrationLimit: 1, perHostLimit: 1 });
const childAbort = new AbortController();
const childWork = childCoordinator.runChild({
  key: 'child:cancel',
  integration: 'speed-test',
  command: process.execPath,
  args: ['-e', 'setTimeout(() => {}, 5000)'],
  signal: childAbort.signal,
});
await wait(20);
childAbort.abort();
await assert.rejects(childWork, (error) => error instanceof WorkCoordinatorError && error.code === 'work_cancelled');
childCoordinator.close();
console.log('work-coordinator: PASS');
