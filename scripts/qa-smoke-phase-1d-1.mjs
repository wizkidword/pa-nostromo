#!/usr/bin/env node
const baseUrl = process.env.MC_BASE_URL || 'http://localhost:4187';
const checks = [];

async function run(name, fn){
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (err) {
    checks.push({ name, ok: false, error: String(err?.message || err) });
  }
}

await run('state endpoint reachable', async () => {
  const res = await fetch(`${baseUrl}/api/state`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

await run('crypto proxy route reachable', async () => {
  const res = await fetch(`${baseUrl}/api/crypto/coins/list?include_platform=false`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Expected array from proxy coins/list');
});

await run('rss fetch endpoint validates missing feeds', async () => {
  const res = await fetch(`${baseUrl}/api/rss/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeds: [] }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} - ${c.name}${c.ok ? '' : ` :: ${c.error}`}`);
}

if (failed.length) process.exit(1);
console.log('Phase 1D.1 smoke script checks passed.');
