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

  // The dashboard starts recurring integration and system-monitor requests at
  // boot, so network idle is not a reliable definition of page readiness.
  const pageResponse = await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  assert.equal(pageResponse?.status(), 200);
  assert.match(await page.title(), /Nostromo|Mission Control/i);
  const csp = pageResponse?.headers()['content-security-policy'] || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' https:\/\/www\.youtube\.com/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);

  const disabledProfileRoute = await page.evaluate(async () => {
    const response = await fetch('/api/email-unread', { cache: 'no-store' });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(disabledProfileRoute.status, 403);
  assert.equal(disabledProfileRoute.body.error, 'product_profile_disabled');

  const legacyProfileMigration = await page.evaluate(() => {
    const legacy = { ...state };
    delete legacy.settings;
    applyIncomingState(legacy);
    return {
      profile: state.settings.productProfile,
      cameraEnabled: state.settings.customProfilePodIds.includes('camera-feed'),
      emailEnabled: state.settings.customProfilePodIds.includes('unread-email'),
    };
  });
  assert.equal(legacyProfileMigration.profile, 'custom');
  assert.equal(legacyProfileMigration.cameraEnabled, true);
  assert.equal(legacyProfileMigration.emailEnabled, true);

  const stateResult = await page.evaluate(async () => {
    const read = async () => {
      const response = await fetch('/api/state');
      return { status: response.status, body: await response.json() };
    };
    const write = async (state, revision) => {
      const headers = { 'Content-Type': 'application/json' };
      if (Number.isSafeInteger(revision) && revision >= 0) headers['If-Match'] = `"${revision}"`;
      const response = await fetch('/api/state', {
        method: 'POST',
        headers,
        body: JSON.stringify(state),
      });
      return { status: response.status, body: await response.json() };
    };

    const writeWithCurrentRevision = async (tasks) => {
      let result = { status: 428, body: null };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const current = await read();
        let revision = Number(current.body?.__integrity?.revision);
        if (current.status !== 200 || !Number.isSafeInteger(revision) || revision < 0) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        const payload = { ...current.body, tasks };
        delete payload.__integrity;
        result = await write(payload, revision);
        if (result.status !== 409) return result;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return result;
    };

    const created = await writeWithCurrentRevision([{ id: 'smoke-task', title: 'Created by smoke test', column: 'inbox' }]);
    const afterCreate = await read();
    const updated = await writeWithCurrentRevision([{ id: 'smoke-task', title: 'Updated by smoke test', column: 'inbox' }]);
    const afterUpdate = await read();
    const removed = await writeWithCurrentRevision([]);
    const afterRemove = await read();
    return { created, afterCreate, updated, afterUpdate, removed, afterRemove };
  });

  assert.equal(stateResult.created.status, 200);
  assert.equal(stateResult.afterCreate.body.tasks[0].title, 'Created by smoke test');
  assert.equal(stateResult.updated.status, 200);
  assert.equal(stateResult.afterUpdate.body.tasks[0].title, 'Updated by smoke test');
  assert.equal(stateResult.removed.status, 200);
  assert.deepEqual(stateResult.afterRemove.body.tasks, []);

  const conflictResult = await page.evaluate(async () => {
    state.tasks = [...state.tasks, { id: 'local-conflict-task', title: 'Preserved local draft', column: 'inbox' }];
    const saved = await pushStateToSharedApi('smoke_conflict');
    return {
      saved,
      conflictVisible: Boolean(document.getElementById('sharedStateConflictNotice')),
      draftPreserved: Array.isArray(sharedStateConflictDraft?.tasks)
        && sharedStateConflictDraft.tasks.some((task) => task.id === 'local-conflict-task'),
    };
  });
  assert.equal(conflictResult.saved, false);
  assert.equal(conflictResult.conflictVisible, true);
  assert.equal(conflictResult.draftPreserved, true);

  await page.evaluate(async () => {
    state.settings.productProfile = 'custom';
    state.settings.customProfilePodIds = ['rss-feed', 'unread-email', 'ebay-traffic', 'social-followers'];
    ['rss-feed', 'unread-email', 'ebay-traffic', 'social-followers'].forEach((podId) => {
      const card = document.querySelector(`[data-pod-id="${podId}"]`);
      card?.classList.remove('is-hidden');
      card?.setAttribute('aria-hidden', 'false');
      if (card) card.inert = false;
    });
    state.rss = {
      ...state.rss,
      items: [{ id: 'rss-signal-1', title: 'RSS source action', link: 'https://example.test/rss-source-action', feedTitle: 'Signal Feed', publishedAt: new Date().toISOString() }],
      readItemIds: [],
    };
    renderRssListFromState();
    unreadEmailLastPayload = {
      ok: true,
      accounts: [{
        id: 'account-signal', label: 'Signal inbox', account: 'signal@example.test', unreadCount: 1,
        entries: [{ uid: '4242', mailbox: 'INBOX', title: 'Email source action', counterpartyName: 'Not retained', issuedAt: new Date().toISOString() }],
      }],
    };
    renderUnreadEmailWidget(unreadEmailLastPayload);
    renderEbayTrafficWidget({
      ok: true,
      stores: [{
        id: 'store-signal', label: 'Signal Store', marketplaceId: 'EBAY_US', status: 'ok', summary: {}, dailySnapshot: { label: '2026-07-17', metrics: {} },
        topListings: [{ listingId: 'listing-signal-1', title: 'eBay source action', views: 1, transactions: 0 }],
      }],
    });
    state.facebookFollowers = { followersCount: 12, staleLevel: 'stale', pageName: 'Signal Page', delta: -1, source: 'fixture' };
    await renderSocialFollowersPod({ skipFetch: true });
  });

  async function createSourceAction(locator, collection, type, externalId) {
    await locator.click();
    assert.equal(await page.locator('#signalActionDialog').evaluate((dialog) => dialog.open), true);
    await page.locator('#signalActionProject').selectOption({ index: 0 });
    await page.locator('#signalActionCreateBtn').click();
    await page.waitForFunction(({ collection, type, externalId }) => state[collection].some((item) => item.sourceRef?.type === type && item.sourceRef?.externalId === externalId), { collection, type, externalId });
  }

  await createSourceAction(page.locator('[data-signal-type="rss"][data-signal-action="note"]').first(), 'notes', 'rss', 'rss-signal-1');
  await createSourceAction(page.locator('[data-signal-type="email"][data-signal-external-id="account-signal:INBOX:4242"]'), 'tasks', 'email', 'account-signal:INBOX:4242');
  await createSourceAction(page.locator('[data-signal-type="ebay"][data-signal-action="task"]').first(), 'tasks', 'ebay', 'listing-signal-1');
  await createSourceAction(page.locator('[data-signal-type="social"][data-signal-action="reminder"]').first(), 'reminders', 'social', 'facebook');

  const hostileContentResult = await page.evaluate(async () => {
    window.__nostromoStoredXss = 0;
    const payload = '<img src=x onerror="window.__nostromoStoredXss=1">';
    applyIncomingState({
      settings: { productProfile: 'home' },
      projects: [{
        id: 'project-x',
        name: payload,
        summary: payload,
        status: 'active',
        appLink: 'javascript:alert(1)',
        repoLink: 'data:text/html,blocked',
      }],
      tasks: [{
        id: 'task-x',
        title: payload,
        column: 'inbox',
        projectId: 'project-x',
        nextAction: payload,
        owner: payload,
      }],
      notes: [{
        id: 'note-x',
        title: payload,
        body: `${payload}\n**safe formatting**`,
        projectId: 'project-x',
        updatedAt: new Date().toISOString(),
      }],
      shortcuts: [{ id: 'shortcut-x', title: payload, category: payload, url: 'javascript:alert(1)', enabled: true }],
      rss: {
        feeds: [{ id: 'feed-x', url: 'https://example.com/rss.xml', tag: payload }],
        items: [{ id: 'rss-x', link: 'javascript:alert(1)', title: payload, summary: payload }],
      },
      cameraFeed: { mode: 'stream', active: true, sourceUrl: 'javascript:alert(1)' },
      liveStreams: {
        sourceType: 'generic',
        inputs: { generic: 'javascript:alert(1)' },
        active: true,
        status: 'loading',
        renderMode: 'iframe',
        embedUrl: 'javascript:alert(1)',
        externalUrl: 'javascript:alert(1)',
      },
    }, { render: true });

    const forcedLink = document.createElement('a');
    forcedLink.setAttribute('href', 'javascript:window.__nostromoStoredXss=2');
    forcedLink.setAttribute('onclick', 'window.__nostromoStoredXss=3');
    document.body.append(forcedLink);
    const nestedEvent = document.createElement('div');
    nestedEvent.innerHTML = '<span onmouseover="window.__nostromoStoredXss=4">nested event</span>';
    document.body.append(nestedEvent);
    const inlineScript = document.createElement('script');
    inlineScript.textContent = 'window.__nostromoInlineScriptRan = true';
    window.__nostromoInlineScriptRan = false;
    document.body.append(inlineScript);

    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      xssValue: window.__nostromoStoredXss,
      inlineScriptRan: window.__nostromoInlineScriptRan,
      hasEventAttributes: Boolean(document.querySelector('[onerror], [onclick], [onload]')),
      hasUnsafeHref: [...document.querySelectorAll('a[href]')]
        .some((link) => /^(?:javascript|data|file|vbscript):/i.test(link.getAttribute('href') || '')),
      projectTextWasEscaped: document.querySelector('#projectDirectory')?.textContent.includes(payload) || false,
      notePreviewWasEscaped: document.querySelector('.md-preview')?.textContent.includes(payload) || false,
      shortcutWasBlocked: document.querySelector('#shortcutsWidget .shortcut-link.is-disabled')?.textContent.includes('Blocked unsafe URL') || false,
      cameraFrameWasBlanked: document.querySelector('[data-camera-role="stream-frame"]')?.getAttribute('src') === 'about:blank',
      liveFrameWasBlanked: document.querySelector('[data-live-role="frame"]')?.getAttribute('src') === 'about:blank',
      frameSandboxed: document.querySelector('[data-live-role="frame"]')?.getAttribute('sandbox') === 'allow-scripts allow-same-origin allow-presentation',
    };
  });
  assert.equal(hostileContentResult.xssValue, 0);
  assert.equal(hostileContentResult.inlineScriptRan, false);
  assert.equal(hostileContentResult.hasEventAttributes, false);
  assert.equal(hostileContentResult.hasUnsafeHref, false);
  assert.equal(hostileContentResult.projectTextWasEscaped, true);
  assert.equal(hostileContentResult.notePreviewWasEscaped, true);
  assert.equal(hostileContentResult.shortcutWasBlocked, true);
  assert.equal(hostileContentResult.cameraFrameWasBlanked, true);
  assert.equal(hostileContentResult.liveFrameWasBlanked, true);
  assert.equal(hostileContentResult.frameSandboxed, true);
  assert.deepEqual(pageErrors, []);
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  if (child.exitCode == null) await new Promise((resolve) => child.once('exit', resolve));
  await runtime.cleanup();
}

console.log('dashboard-smoke: PASS');
