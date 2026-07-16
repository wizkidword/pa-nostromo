import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createTempRuntime } from './helpers/temp-runtime.mjs';

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error('State API server exited before the test connected.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('State API server did not become ready within 15 seconds.');
}

async function writeState(origin, csrfToken, state, revision) {
  const headers = { 'Content-Type': 'application/json', 'x-pa-nostromo-csrf': csrfToken };
  if (revision != null) headers['If-Match'] = `"${revision}"`;
  const response = await fetch(`${origin}/api/state`, { method: 'POST', headers, body: JSON.stringify(state) });
  return { status: response.status, body: await response.json() };
}

const runtime = await createTempRuntime('nostromo-state-api-');
const port = await getAvailablePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    DATA_DIR: runtime.dataDir,
    LOG_DIR: runtime.logDir,
    NOSTROMO_DISABLE_BACKGROUND_SERVICES: '1',
    STATE_BACKUP_MIN_INTERVAL_MS: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForServer(`${origin}/`, child);
  const csrfToken = (await fetch(`${origin}/api/security/bootstrap`).then((response) => response.json())).csrfToken;
  const created = await writeState(origin, csrfToken, { tasks: [{ id: 'api-task', title: 'Initial', column: 'inbox' }] });
  assert.equal(created.status, 200, 'the documented empty-store first write may omit a revision');
  assert.equal(created.body.revision, 1);

  const updated = await writeState(origin, csrfToken, { tasks: [{ id: 'api-task', title: 'Updated', column: 'inbox' }] }, 1);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.revision, 2);

  const stale = await writeState(origin, csrfToken, { tasks: [{ id: 'api-task', title: 'Stale overwrite', column: 'inbox' }] }, 1);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'state_revision_conflict');
  assert.equal(stale.body.currentRevision, 2);
  assert.equal('state' in stale.body, false, 'conflict responses must not return a stale/full state payload');

  const missing = await writeState(origin, csrfToken, { tasks: [{ id: 'api-task', title: 'Missing revision', column: 'inbox' }] });
  assert.equal(missing.status, 428);
  assert.equal(missing.body.error, 'state_revision_required');

  const invalid = await writeState(origin, csrfToken, { tasks: 'not-an-array' }, 2);
  assert.equal(invalid.status, 422);
  const current = await fetch(`${origin}/api/state`).then((response) => response.json());
  assert.equal(current.tasks[0].title, 'Updated', 'invalid input cannot reach disk');
  assert.equal(current.__integrity.revision, 2);
} finally {
  child.kill('SIGTERM');
  if (child.exitCode == null) await new Promise((resolve) => child.once('exit', resolve));
  await runtime.cleanup();
}

console.log('state-api-concurrency: PASS');
