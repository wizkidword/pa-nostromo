import { chromium } from 'playwright';

const baseUrl = process.env.MC_BASE_URL || 'http://localhost:4199';
const idleMs = Number(process.env.IDLE_MS || 5 * 60 * 1000);

function keyFor(msg){
  return `${msg.type}::${msg.text}`;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const messages = [];
page.on('console', (m) => {
  messages.push({ type: m.type(), text: m.text(), ts: Date.now() });
});
page.on('pageerror', (e) => {
  messages.push({ type: 'pageerror', text: String(e?.message || e), ts: Date.now() });
});

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(10000);

// Start 5-minute idle sanity window
const idleStart = Date.now();
await page.waitForTimeout(idleMs);
const idleEnd = Date.now();

const idleMessages = messages.filter((m) => m.ts >= idleStart && m.ts <= idleEnd);
const byType = {};
const byKey = {};
for (const m of idleMessages) {
  byType[m.type] = (byType[m.type] || 0) + 1;
  const k = keyFor(m);
  byKey[k] = (byKey[k] || 0) + 1;
}

const repetitive = Object.entries(byKey)
  .filter(([, count]) => count >= 5)
  .sort((a,b) => b[1]-a[1])
  .slice(0, 10)
  .map(([k, count]) => ({ key: k, count }));

// Transient failure/backoff checks
const checks = [];
async function expectContains(selector, needle, label){
  const txt = ((await page.locator(selector).first().textContent()) || '').trim();
  const ok = txt.toLowerCase().includes(needle.toLowerCase());
  checks.push({ label, ok, text: txt });
}

// Network fault injection
await page.route('https://api.open-meteo.com/**', route => route.abort('failed'));
await page.route('https://nominatim.openstreetmap.org/**', route => route.abort('failed'));
await page.route('https://site.api.espn.com/**', route => route.abort('failed'));
await page.route('**/api/rss/fetch**', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok:false, error:'simulated_rss_fail' }) }));
await page.route('**/api/crypto/**', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok:false, error:'simulated_crypto_fail' }) }));

// Add one RSS feed so refresh path executes
await page.click('#openSettingsBtn');
await page.fill('#rssFeedUrlInput', 'https://hnrss.org/frontpage');
await page.fill('#rssFeedTagInput', 'QA');
await page.click('#addRssFeedBtn');
await page.click('#closeSettingsBtn');

// Trigger manual refreshes
for (const id of ['#weatherRefreshBtn','#nbaRefreshBtn','#cryptoRefreshBtn','#rssRefreshBtn']) {
  const el = page.locator(id);
  if (await el.count()) await el.click();
}
await page.waitForTimeout(2500);

await expectContains('#weatherUpdatedAt', 'retry in', 'weather backoff user messaging');
await expectContains('#nbaUpdatedAt', 'retry in', 'nba backoff user messaging');
await expectContains('#cryptoUpdatedAt', 'retry in', 'crypto backoff user messaging');
await expectContains('#rssUpdatedAt', 'retry in', 'rss backoff user messaging');

const syncDebug = await page.evaluate(() => window.__MISSION_CONTROL_QA__?.syncDebug?.() || null);

const result = {
  baseUrl,
  idleWindowSec: Math.round((idleEnd - idleStart)/1000),
  idleCountsByType: byType,
  idleTotalMessages: idleMessages.length,
  repetitiveTop: repetitive,
  transientChecks: checks,
  syncDebug,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
