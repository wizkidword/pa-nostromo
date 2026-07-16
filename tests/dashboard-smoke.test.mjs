import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
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
    if (child.exitCode != null) throw new Error('Dashboard server exited before the smoke test could connect.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Dashboard server did not become ready within 15 seconds.');
}

const runtime = await createTempRuntime('nostromo-browser-smoke-');
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
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let browser;
try {
  await waitForServer(`${origin}/`, child);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const pageResponse = await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  assert.equal(pageResponse?.status(), 200);
  assert.match(await page.title(), /Nostromo|Mission Control/i);

  const stateResult = await page.evaluate(async () => {
    const read = async () => (await fetch('/api/state')).json();
    const write = async (state) => {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      return { status: response.status, body: await response.json() };
    };

    const created = await write({ tasks: [{ id: 'smoke-task', title: 'Created by smoke test' }] });
    const afterCreate = await read();
    const updated = await write({ tasks: [{ id: 'smoke-task', title: 'Updated by smoke test' }] });
    const afterUpdate = await read();
    const removed = await write({ tasks: [] });
    const afterRemove = await read();
    return { created, afterCreate, updated, afterUpdate, removed, afterRemove };
  });

  assert.equal(stateResult.created.status, 200);
  assert.equal(stateResult.afterCreate.tasks[0].title, 'Created by smoke test');
  assert.equal(stateResult.updated.status, 200);
  assert.equal(stateResult.afterUpdate.tasks[0].title, 'Updated by smoke test');
  assert.equal(stateResult.removed.status, 200);
  assert.deepEqual(stateResult.afterRemove.tasks, []);
  assert.deepEqual(pageErrors, []);
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  if (child.exitCode == null) await new Promise((resolve) => child.once('exit', resolve));
  await runtime.cleanup();
}

console.log('dashboard-smoke: PASS');
