import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, 'data', 'facebook-followers.json');

async function wait(ms){ return new Promise((r) => setTimeout(r, ms)); }

async function waitForServer(port, timeoutMs = 8000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/facebook-followers`);
      if (res.ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error('server did not start in time');
}

async function main(){
  await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
  const staleSuccessAt = new Date(Date.now() - (5 * 60 * 1000)).toISOString();
  const staleFetchedAt = new Date(Date.now() - (5 * 60 * 1000)).toISOString();
  await fsp.writeFile(DATA_PATH, JSON.stringify({
    schemaVersion: 1,
    page: { id: '123', name: 'QA Page' },
    latest: {
      followersCount: 12345,
      fanCount: 12000,
      fetchedAt: staleFetchedAt,
      source: 'graph_api',
      requestId: 'qa_seed',
      latencyMs: 10,
      stale: true
    },
    status: {
      ok: true,
      lastSuccessAt: staleSuccessAt,
      lastAttemptAt: staleSuccessAt,
      consecutiveFailures: 0,
      lastError: ''
    },
    history: [{ followersCount: 12345, fetchedAt: staleFetchedAt }],
    updatedAt: new Date().toISOString()
  }, null, 2));

  const port = 4797;
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      META_GRAPH_PAGE_ID: '',
      META_GRAPH_PAGE_ACCESS_TOKEN: '',
      META_GRAPH_ALLOW_REMOTE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(port);

    const getRes = await fetch(`http://127.0.0.1:${port}/api/facebook-followers`);
    assert.equal(getRes.status, 200);
    const getPayload = await getRes.json();
    assert.equal(getPayload.ok, true);
    assert.equal(getPayload.latest.followersCount, 12345);
    assert.equal(getPayload.latest.source, 'graph_api');
    assert.equal(getPayload.status.staleLevel, 'stale');

    const refreshRes = await fetch(`http://127.0.0.1:${port}/api/facebook-followers/refresh?source=qa`, { method: 'POST' });
    assert.equal(refreshRes.status, 200);
    const refreshPayload = await refreshRes.json();
    assert.equal(refreshPayload.ok, true);
    assert.match(String(refreshPayload.status.lastError || ''), /graph_disabled|graph_unavailable_using_fallback|public_scrape/i);

    const healthRes = await fetch(`http://127.0.0.1:${port}/api/facebook-followers/health`);
    assert.equal(healthRes.status, 200);
    const healthPayload = await healthRes.json();
    assert.equal(healthPayload.ok, true);
    const expectedHealthStaleLevel = refreshPayload.latest?.source === 'public_scrape_estimate'
      ? 'fresh'
      : 'stale';
    assert.equal(healthPayload.status.staleLevel, expectedHealthStaleLevel);

    console.log('facebook-followers-api: PASS');
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('facebook-followers-api: FAIL', err);
  process.exitCode = 1;
});
