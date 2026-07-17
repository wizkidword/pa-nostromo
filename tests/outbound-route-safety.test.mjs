import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createTempRuntime } from './helpers/temp-runtime.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error('Server exited before outbound safety test began.');
    try {
      if ((await fetch(`${origin}/`)).ok) return;
    } catch {}
    await wait(100);
  }
  throw new Error('Server did not start for outbound safety test.');
}

const runtime = await createTempRuntime('nostromo-outbound-safety-');
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
    CAMERA_PROXY_ALLOWLIST: '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForServer(origin, child);
  const bootstrap = await fetch(`${origin}/api/security/bootstrap`);
  const { csrfToken } = await bootstrap.json();
  assert.ok(csrfToken);

  const rss = await fetch(`${origin}/api/rss/fetch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PA-Nostromo-CSRF': csrfToken,
    },
    body: JSON.stringify({ feeds: ['http://127.0.0.1:9/private-feed'] }),
  });
  assert.equal(rss.status, 200);
  const rssPayload = await rss.json();
  assert.equal(rssPayload.errors[0]?.error, 'blocked_address');
  assert.equal(rssPayload.integration?.status, 'error');
  assert.equal(rssPayload.integration?.data, null);
  assert.equal(rssPayload.integration?.errorCode, 'blocked_address');

  const camera = await fetch(`${origin}/api/camera-snapshot?url=${encodeURIComponent('http://127.0.0.1:9/snapshot')}`);
  assert.equal(camera.status, 403);
  const cameraPayload = await camera.json();
  assert.equal(cameraPayload.error, 'blocked_address');

  console.log('outbound-route-safety: PASS');
} finally {
  child.kill('SIGTERM');
  if (child.exitCode == null) await new Promise((resolve) => child.once('exit', resolve));
  await runtime.cleanup();
}
