import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:4191';
const results = [];

const ok = (name, detail='') => { results.push({ name, pass: true, detail }); console.log(`PASS: ${name}${detail ? ` :: ${detail}` : ''}`); };
const fail = (name, detail='') => { results.push({ name, pass: false, detail }); console.log(`FAIL: ${name}${detail ? ` :: ${detail}` : ''}`); };
const assert = (cond, name, detail='') => cond ? ok(name, detail) : fail(name, detail);

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

async function seedState() {
  const base = (await api('/api/state')).json || {};
  const projectId = 'qa-project-1e1';
  const payload = {
    ...base,
    projects: [
      { id: projectId, name: 'QA Project 1E.1', summary: 'Deterministic restore/delete/undo', status: 'active', lastUpdated: new Date().toISOString() },
      ...(Array.isArray(base.projects) ? base.projects.filter((p) => p?.id !== projectId) : []),
    ],
    tasks: [{ id: 'qa-task-1', title: 'QA Task 1E.1', projectId, column: 'inbox', blockerType: null, owner: 'QA', nextAction: 'verify undo expiry', dueDate: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    notes: [{ id: 'qa-note-1', title: 'QA Note 1E.1', body: '', projectId, pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    reminders: [{ id: 'qa-rem-1', date: new Date().toISOString().slice(0,10), time: '09:00', text: 'QA Reminder 1E.1', createdAt: new Date().toISOString() }],
    shortcuts: [],
    __writeControl: { overrideDowngrade: true, source: 'qa_script', explicitLiveOverride: true },
  };

  const write = await api('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!write.ok) throw new Error(`seed failed: ${write.status} ${write.text.slice(0, 120)}`);
  return payload;
}

async function main() {
  try {
    execSync('npm run check', { stdio: 'pipe' });
    ok('check', 'npm run check passed');
  } catch (err) {
    fail('check', String(err?.stdout || err?.message || err));
  }

  await seedState();
  const seededBackups = await api('/api/state/backups');
  const restoreFileSeed = seededBackups.json?.backups?.[0]?.backupFile;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const p1 = await ctx.newPage();
  let p2 = await ctx.newPage();

  const autoAcceptDialog = (page) => page.on('dialog', (d) => d.accept());
  for (const p of [p1, p2]) autoAcceptDialog(p);

  await Promise.all([p1.goto(BASE, { waitUntil: 'domcontentloaded' }), p2.goto(BASE, { waitUntil: 'domcontentloaded' })]);
  await p1.waitForSelector('#openSettingsBtn');
  await p2.waitForSelector('#openSettingsBtn');

  const waitForSyncReady = async (page) => {
    await page.waitForFunction(() => {
      const qa = window.__MISSION_CONTROL_QA__;
      if (!qa || typeof qa.syncDebug !== 'function') return false;
      const sync = qa.syncDebug();
      return !!sync?.sharedHydrationResolved;
    }, null, { timeout: 30000 });
  };

  await Promise.all([waitForSyncReady(p1), waitForSyncReady(p2)]);

  // delete + undo cross-tab for note
  const noteInputSelector = '#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]';
  await p1.waitForFunction(() => [...document.querySelectorAll('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]')].some((x) => x.value === 'QA Note 1E.1'), null, { timeout: 30000 });
  await p1.locator('#notesBoardToday .note-card:has(input[value="QA Note 1E.1"]), #notesBoardBacklog .note-card:has(input[value="QA Note 1E.1"])').locator('[data-action="delete"]').first().click();
  await p2.waitForFunction(() => ![...document.querySelectorAll('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]')].some((x) => x.value === 'QA Note 1E.1'));
  await p1.$eval('#stateSafetyUndoBtn', (el) => el.click());
  await p2.waitForFunction(() => [...document.querySelectorAll('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]')].some((x) => x.value === 'QA Note 1E.1'));
  ok('cross-tab delete+undo', 'note delete propagated and undo restored in tab2');

  // isolate undo-expiry determinism from cross-tab stale-write races.
  await p2.close();

  // expiry determinism: task delete should stay deleted after undo window expires
  const taskCard = p1.locator('.task[data-id="qa-task-1"]');
  const priorUndoActionId = await p1.evaluate(() => {
    const qa = window.__MISSION_CONTROL_QA__;
    return qa?.undoDebug?.()?.actionId || null;
  });

  await taskCard.locator('.task-edit-btn[data-id="qa-task-1"]').click();
  await p1.waitForSelector('#editTaskDialog[open]');
  await p1.waitForFunction(() => {
    const idEl = document.querySelector('#editTaskForm input[name="id"]');
    return idEl && idEl.value === 'qa-task-1';
  }, null, { timeout: 10000 });
  await p1.click('#editTaskDeleteBtn');

  const activeUndoActionId = await p1.waitForFunction((prevId) => {
    const bar = document.querySelector('#stateSafetyUndoBar');
    const qa = window.__MISSION_CONTROL_QA__;
    if (!bar || !qa || typeof qa.undoDebug !== 'function') return null;
    const undo = qa.undoDebug();
    if (bar.hidden !== false) return null;
    if (undo?.status !== 'offered') return null;
    if (!undo?.actionId || undo.actionId === prevId) return null;
    if (typeof undo?.expiresAt !== 'number' || undo.expiresAt <= Date.now()) return null;
    return undo.actionId;
  }, priorUndoActionId, { timeout: 10000 }).then((h) => h.jsonValue());

  await p1.waitForSelector('.task[data-id="qa-task-1"]', { state: 'detached', timeout: 10000 });

  const waitMs = await p1.evaluate((actionId) => {
    const qa = window.__MISSION_CONTROL_QA__;
    const undo = qa?.undoDebug?.();
    if (!undo?.expiresAt || undo?.actionId !== actionId) return 13000;
    const safetyBufferMs = 1500;
    return Math.max((undo.expiresAt - Date.now()) + safetyBufferMs, 13000);
  }, activeUndoActionId);
  await p1.waitForTimeout(waitMs);

  await p1.waitForFunction((actionId) => {
    const bar = document.querySelector('#stateSafetyUndoBar');
    const qa = window.__MISSION_CONTROL_QA__;
    if (!bar || !qa || typeof qa.undoDebug !== 'function') return false;
    const undo = qa.undoDebug();
    if (undo?.actionId && undo.actionId !== actionId) return false;
    return undo?.status === 'expired' && bar.hidden === true;
  }, activeUndoActionId, { timeout: 10000 });

  const stateTaskGone = async () => {
    const snapshot = (await api('/api/state')).json || {};
    const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
    return !tasks.some((t) => t?.id === 'qa-task-1');
  };

  let persistedGone = false;
  for (let i = 0; i < 20; i += 1) {
    persistedGone = await stateTaskGone();
    if (persistedGone) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await p1.reload({ waitUntil: 'domcontentloaded' });
  await waitForSyncReady(p1);

  const taskVisibleP1 = await p1.locator('.task[data-id="qa-task-1"]').count();
  assert(persistedGone && taskVisibleP1 === 0, 'undo expiry deterministic', `persistedGone=${persistedGone} taskVisibleP1=${taskVisibleP1} waitMs=${waitMs}`);

  // create marker note, then restore determinism + post-restore projects mismatch guard
  const preRestoreState = (await api('/api/state')).json || {};
  preRestoreState.notes = Array.isArray(preRestoreState.notes) ? preRestoreState.notes : [];
  preRestoreState.notes.unshift({ id: 'qa-restore-marker-1e1', title: 'Restore Marker 1E1', body: '', projectId: preRestoreState.projects?.[0]?.id || '', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  preRestoreState.__writeControl = { overrideDowngrade: true, source: 'qa_script', explicitLiveOverride: true };
  await api('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(preRestoreState) });

  p2 = await ctx.newPage();
  autoAcceptDialog(p2);
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });

  await Promise.all([p1.reload({ waitUntil: 'domcontentloaded' }), p2.reload({ waitUntil: 'domcontentloaded' })]);

  const restoreRes = await api('/api/state/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ backupFile: restoreFileSeed }),
  });
  assert(restoreRes.ok, 'restore API accepted snapshot', `status=${restoreRes.status}`);
  await Promise.all([
    p1.reload({ waitUntil: 'domcontentloaded' }),
    p2.reload({ waitUntil: 'domcontentloaded' }),
  ]);
  await p1.waitForSelector('#projectDirectory .project-item');
  await p2.waitForSelector('#projectDirectory .project-item');

  await p2.waitForFunction(() => document.querySelectorAll('#projectDirectory .project-item').length > 0, null, { timeout: 30000 });
  const p1Projects = await p1.locator('#projectDirectory .project-item').count();
  const p2Projects = await p2.locator('#projectDirectory .project-item').count();
  assert(p1Projects > 0 && p2Projects > 0 && p1Projects === p2Projects, 'post-restore project counts deterministic', `p1=${p1Projects} p2=${p2Projects}`);

  const markerCount = await p1.locator(noteInputSelector).evaluateAll((els) => els.filter((el) => el.value === 'Restore Marker 1E1').length);
  assert(markerCount === 0, 'restore rehydrates dependent views', `markerCount=${markerCount}`);

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\nchecks=${results.length} failed=${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
