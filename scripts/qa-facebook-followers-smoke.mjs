const BASE = process.env.MISSION_CONTROL_BASE_URL || 'http://127.0.0.1:4287';

async function run(){
  const getRes = await fetch(`${BASE}/api/facebook-followers`);
  const getJson = await getRes.json().catch(() => ({}));

  const healthRes = await fetch(`${BASE}/api/facebook-followers/health`);
  const healthJson = await healthRes.json().catch(() => ({}));

  const refreshRes = await fetch(`${BASE}/api/facebook-followers/refresh?source=qa`, { method: 'POST' });
  const refreshJson = await refreshRes.json().catch(() => ({}));

  console.log(JSON.stringify({
    base: BASE,
    get: { status: getRes.status, ok: getJson.ok, staleLevel: getJson?.status?.staleLevel, lastError: getJson?.status?.lastError || '' },
    health: { status: healthRes.status, ok: healthJson.ok, staleLevel: healthJson?.status?.staleLevel },
    refresh: { status: refreshRes.status, ok: refreshJson.ok, staleLevel: refreshJson?.status?.staleLevel, lastError: refreshJson?.status?.lastError || '' }
  }, null, 2));
}

run().catch((err) => {
  console.error('qa-facebook-followers-smoke failed:', err?.message || err);
  process.exitCode = 1;
});
