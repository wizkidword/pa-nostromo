import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:4191';
const results = [];

function ok(name, detail='') { results.push({ name, pass: true, detail }); console.log(`PASS: ${name}${detail ? ` :: ${detail}` : ''}`); }
function fail(name, detail='') { results.push({ name, pass: false, detail }); console.error(`FAIL: ${name}${detail ? ` :: ${detail}` : ''}`); }
function assert(cond, name, detail='') { if (cond) ok(name, detail); else fail(name, detail); }

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  return { status: res.status, ok: res.ok, json, text: txt };
}

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
async function mutateState(mutator) {
  const current = (await api('/api/state')).json;
  if (!current || typeof current !== 'object') throw new Error('unable to load shared state');
  mutator(current);
  current.__writeControl = { overrideDowngrade: true, source: 'qa_script', explicitLiveOverride: true };
  const res = await api('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(current) });
  if (!res.ok) throw new Error(`mutateState failed (${res.status}) ${res.text?.slice(0, 120)}`);
}

async function clickDom(page, selector){ await page.$eval(selector, (el) => el.click()); }
async function projectCount(page){ return page.locator('#projectDirectory .project-item').count(); }
async function ensureNotesFilterAll(page){
  await page.$eval('#notesFilter', (el) => {
    el.value = 'all';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function setFirstNoteTitle(page, value){
  await ensureNotesFilterAll(page);
  for (let i = 0; i < 8; i += 1) {
    const input = page.locator('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(value);
    const isSet = await input.inputValue().then((v) => v === value).catch(() => false);
    if (isSet) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`Unable to set first note title to: ${value}`);
}

(async () => {
  // 1) npm run check
  try {
    const out = execSync('npm run check', { cwd: process.cwd(), stdio: 'pipe' }).toString();
    ok('1) npm run check', out.split('\n').slice(-4).join(' | '));
  } catch (e) {
    fail('1) npm run check', String(e?.stdout || e?.message || e));
  }

  // 6a) qa-reset blocked on live without allow-live
  try {
    execSync('npm run qa:reset-state', { cwd: process.cwd(), stdio: 'pipe' });
    fail('6a) qa-reset blocked on live without allow-live', 'command unexpectedly succeeded');
  } catch (e) {
    const out = `${e.stdout || ''}\n${e.stderr || ''}`;
    assert(/Refusing to target live default state endpoint/.test(out), '6a) qa-reset blocked on live without allow-live', out.trim().split('\n').slice(-2).join(' | '));
  }

  // seed isolated instance deterministically
  const fixture = await import('node:fs/promises').then(fs => fs.readFile(new URL('../data/qa-reset-state.json', import.meta.url), 'utf8'));
  const payload = JSON.parse(fixture);
  payload.__writeControl = { overrideDowngrade: true, source: 'qa_script', explicitLiveOverride: true };
  const seed = await api('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert(seed.ok, '2) Start isolated app instance on PORT=4191 and target base URL', `POST /api/state status=${seed.status}`);

  // 6b) qa_script rejected without explicit override at API level
  const rejectPayload = structuredClone(payload);
  rejectPayload.__writeControl = { overrideDowngrade: true, source: 'qa_script', explicitLiveOverride: false };
  const rej = await api('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rejectPayload) });
  assert(rej.status === 409 && (rej.json?.error === 'qa_override_requires_explicit_opt_in'), '6b) qa_script rejected without explicit override', `status=${rej.status} error=${rej.json?.error}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  const dialogLog = [];
  for (const p of [page1, page2]) {
    p.on('dialog', async (d) => {
      dialogLog.push(`${d.type()}:${d.message().slice(0,120)}`);
      await d.accept();
    });
  }

  await Promise.all([
    page1.goto(BASE, { waitUntil: 'domcontentloaded' }),
    page2.goto(BASE, { waitUntil: 'domcontentloaded' }),
  ]);
  await page1.waitForSelector('#openSettingsBtn');
  await page2.waitForSelector('#openSettingsBtn');

  // create baseline entities
  await page1.click('#addProjectBtn');
  await page1.fill('#projectForm input[name="name"]', 'QA Project');
  await page1.fill('#projectForm input[name="summary"]', 'Phase 1E QA');
  await page1.click('#projectForm button.btn.primary');

  await page1.click('#addTaskBtn');
  await page1.fill('#taskForm input[name="title"]', 'QA Task Alpha');
  await page1.fill('#taskForm input[name="nextAction"]', 'Validate undo and restore');
  await page1.click('#taskForm button.btn.primary');

  await mutateState((draft) => {
    draft.notes = Array.isArray(draft.notes) ? draft.notes : [];
    draft.notes.unshift({ id: 'qa-note-alpha', title: 'QA Note Alpha', body: '', projectId: draft.projects?.[0]?.id || '', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });

  await page1.fill('#calendarReminderText', 'QA Reminder Alpha');
  await page1.fill('#calendarReminderTime', '09:30');
  await page1.click('#addCalendarReminderBtn');

  await page1.click('#openSettingsBtn');
  await clickDom(page1, '#addShortcutBtn');
  await page1.fill('#shortcutForm input[name="title"]', 'QA Shortcut Alpha');
  await page1.fill('#shortcutForm input[name="url"]', 'https://example.com');
  await page1.fill('#shortcutForm input[name="category"]', 'QA');
  await page1.click('#shortcutForm button.btn.primary');

  await page1.fill('#rssFeedUrlInput', 'https://hnrss.org/frontpage');
  await page1.fill('#rssFeedTagInput', 'QA');
  await clickDom(page1, '#addRssFeedBtn');

  await page1.waitForTimeout(600);
  await page2.waitForTimeout(600);

  // 3) State Safety metadata renders
  await clickDom(page1, '#refreshBackupsBtn');
  await page1.waitForTimeout(600);
  const backupsText = await page1.locator('#stateSafetyBackupsList').innerText();
  assert(/rev\s+\d+/i.test(backupsText) && /checksum/i.test(backupsText) && /pre_write|api_state_post|note_|task_|calendar_/i.test(backupsText), '3) Settings > State Safety shows backup metadata', backupsText.split('\n').slice(0,3).join(' | '));
  await page1.click('#closeSettingsBtn');

  // 8a) cross-tab delete+undo behavior (notes)
  await page2.reload({ waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('#openSettingsBtn');
  const noteSelector = '#notesBoardToday .note-card:has(input[value="QA Note Alpha"]), #notesBoardBacklog .note-card:has(input[value="QA Note Alpha"])';
  try {
    await page1.locator(noteSelector).locator('[data-action="delete"]').click();
    await page2.waitForFunction(() => ![...document.querySelectorAll('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]')].some(x => x.value === 'QA Note Alpha'), null, { timeout: 30000 });
    await clickDom(page1, '#stateSafetyUndoBtn');
    await page2.waitForFunction(() => [...document.querySelectorAll('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]')].some(x => x.value === 'QA Note Alpha'), null, { timeout: 30000 });
    ok('8a) Cross-tab delete+undo syncs', 'QA Note Alpha disappeared then restored in tab2');
  } catch (err) {
    fail('8a) Cross-tab delete+undo syncs', String(err?.message || err));
  }

  async function testUndoFlow(name, doDelete, existsCheck) {
    await doDelete();
    await page1.waitForSelector('#stateSafetyUndoBar:not([hidden])', { timeout: 5000 });
    await clickDom(page1, '#stateSafetyUndoBtn');
    await wait(300);
    const restored = await existsCheck();
    assert(restored, `5) ${name} undo restore`, 'restored after clicking Undo');

    await doDelete();
    await page1.waitForSelector('#stateSafetyUndoBar:not([hidden])', { timeout: 5000 });
    await wait(12500);
    const barHidden = await page1.locator('#stateSafetyUndoBar').evaluate(el => el.hidden === true);
    const stillDeleted = !(await existsCheck());
    assert(barHidden && stillDeleted, `5) ${name} undo expiry at ~12s`, `barHidden=${barHidden} stillDeleted=${stillDeleted}`);
  }

  // 5) undo flows
  await testUndoFlow('task delete', async () => {
    await page1.locator('.task-edit-btn').first().click();
    await page1.click('#editTaskDeleteBtn');
  }, async () => (await page1.locator('.task strong', { hasText: 'QA Task Alpha' }).count()) > 0);

  await testUndoFlow('note delete', async () => {
    await page1.locator(noteSelector).locator('[data-action="delete"]').click();
  }, async () => (await page1.locator(noteSelector).count()) > 0);

  await page1.locator(noteSelector).locator('[data-action="delete"]').click();
  await page1.waitForSelector('#stateSafetyUndoBar:not([hidden])', { timeout: 5000 });
  await wait(12500);
  await page2.waitForFunction(() => ![...document.querySelectorAll('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]')].some(x => x.value === 'QA Note Alpha'), null, { timeout: 30000 });
  const noteRestoredByRace = await page2.evaluate(() => [...document.querySelectorAll('#notesBoardToday .note-card input[data-field="title"], #notesBoardBacklog .note-card input[data-field="title"]')].some(x => x.value === 'QA Note Alpha'));
  assert(!noteRestoredByRace, '5) note delete undo expiry does not implicitly restore cross-tab', `restored=${noteRestoredByRace}`);

  await testUndoFlow('reminder delete', async () => {
    const remBtn = page1.locator('#calendarDayReminders [data-rem-del]').first();
    await remBtn.click();
  }, async () => (await page1.locator('#calendarDayReminders .change-log-item', { hasText: 'QA Reminder Alpha' }).count()) > 0);

  await testUndoFlow('shortcut delete', async () => {
    await page1.click('#openSettingsBtn');
    await clickDom(page1, '[data-shortcut-delete]');
  }, async () => (await page1.locator('#settingsShortcutsList .change-log-item strong', { hasText: 'QA Shortcut Alpha' }).count()) > 0);

  await testUndoFlow('RSS feed remove', async () => {
    await clickDom(page1, '[data-rss-feed-remove]');
  }, async () => (await page1.locator('#settingsRssFeedsList .change-log-item', { hasText: 'hnrss.org/frontpage' }).count()) > 0);
  await page1.click('#closeSettingsBtn');

  // Recreate one feed/shortcut/task/note for regression checks
  await page1.click('#addTaskBtn');
  await page1.fill('#taskForm input[name="title"]', 'QA Task Beta');
  await page1.fill('#taskForm input[name="nextAction"]', 'Regression sanity');
  await page1.click('#taskForm button.btn.primary');
  await mutateState((draft) => {
    draft.notes = Array.isArray(draft.notes) ? draft.notes : [];
    draft.notes.unshift({ id: 'qa-note-beta', title: 'QA Note Beta', body: '', projectId: draft.projects?.[0]?.id || '', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  await page1.click('#openSettingsBtn');
  await clickDom(page1, '#addShortcutBtn');
  await page1.fill('#shortcutForm input[name="title"]', 'QA Shortcut Beta');
  await page1.fill('#shortcutForm input[name="url"]', 'https://example.org');
  await page1.click('#shortcutForm button.btn.primary');
  await page1.fill('#rssFeedUrlInput', 'https://xkcd.com/rss.xml');
  await clickDom(page1, '#addRssFeedBtn');

  // 4) restore flow from latest + pre-restore snapshot + refresh
  const backupsBefore = await api('/api/state/backups');
  const latestFile = backupsBefore.json?.backups?.[0]?.backupFile;
  const countBefore = backupsBefore.json?.backups?.length || 0;
  assert(!!latestFile, '4) restore precondition latest backup exists', latestFile || 'none');

  // cross-tab restore observability via revision
  const revBefore = (await api('/api/state')).json?.__integrity?.revision;

  // make a change before restore so revision definitely advances
  await page1.click('#closeSettingsBtn');
  await mutateState((draft) => {
    draft.notes = Array.isArray(draft.notes) ? draft.notes : [];
    draft.notes.unshift({ id: 'restore-temp-marker', title: 'Restore Temp Marker', body: '', projectId: draft.projects?.[0]?.id || '', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  await page1.click('#openSettingsBtn');

  await clickDom(page1, '#refreshBackupsBtn');
  await page1.waitForTimeout(700);
  await page1.locator(`[data-state-restore="${latestFile}"]`).first().click();
  await page1.waitForTimeout(1200);

  const backupsAfter = await api('/api/state/backups');
  const countAfter = backupsAfter.json?.backups?.length || 0;
  const hasPreRestore = (backupsAfter.json?.backups || []).some(b => b?.snapshotMeta?.reason === 'pre_restore');
  assert(countAfter >= countBefore && hasPreRestore, '4) restore creates pre-restore snapshot + refreshable list', `before=${countBefore} after=${countAfter} preRestore=${hasPreRestore}`);

  const markerStillThere = await page1.locator('#notesBoardToday .note-card input[data-field="title"][value="Restore Temp Marker"], #notesBoardBacklog .note-card input[data-field="title"][value="Restore Temp Marker"]').count();
  assert(markerStillThere === 0, '4) restore applied state (temp marker rolled back)', `markerCount=${markerStillThere}`);

  const revAfter = (await api('/api/state')).json?.__integrity?.revision;
  assert(Number(revAfter) > Number(revBefore), '8b) Cross-tab restore sync (state revision advanced)', `revBefore=${revBefore} revAfter=${revAfter}`);

  await page2.waitForFunction(() => document.querySelectorAll('#projectDirectory .project-item').length > 0, null, { timeout: 30000 });
  const p1Projects = await projectCount(page1);
  const p2Projects = await projectCount(page2);
  assert(p1Projects > 0 && p2Projects > 0 && p1Projects === p2Projects, '8c) Post-restore project render count deterministic across tabs', `p1=${p1Projects} p2=${p2Projects}`);

  // 7) integrity metadata checks
  const stateRes = await api('/api/state');
  const backupsRes = await api('/api/state/backups');
  const i = stateRes.json?.__integrity || {};
  const b0 = backupsRes.json?.backups?.[0]?.snapshotMeta || {};
  assert(!!i.revision && !!i.checksum && !!i.savedAt && (!!i.stateSchemaVersion || !!i.schemaVersion), '7) /api/state integrity metadata present', JSON.stringify({ revision: i.revision, schemaVersion: i.stateSchemaVersion || i.schemaVersion, checksum: String(i.checksum).slice(0,10) }));
  assert(!!b0.revision && !!b0.checksum && !!b0.reason && !!b0.timestamp, '7) /api/state/backups snapshot metadata present', JSON.stringify({ revision: b0.revision, reason: b0.reason, checksum: String(b0.checksum).slice(0,10) }));

  // 9) regressions board/projects/notes normal behavior
  const projectVisible = await page1.locator('#projectDirectory .project-item', { hasText: 'QA Project' }).count();
  const taskVisible = await page1.locator('.task strong', { hasText: 'QA Task Beta' }).count();
  const noteVisible = await page1.locator('#notesBoardToday .note-card input[data-field="title"][value="QA Note Beta"], #notesBoardBacklog .note-card input[data-field="title"][value="QA Note Beta"]').count();
  assert(projectVisible > 0 && taskVisible > 0 && noteVisible > 0, '9) regression sanity board/projects/notes', `project=${projectVisible} task=${taskVisible} note=${noteVisible}`);

  // 10) docs rollback adequacy
  const patchText = await import('node:fs/promises').then(fs => fs.readFile(new URL('../docs/patch-notes/2026-03-12-phase-1e-data-safety.md', import.meta.url), 'utf8'));
  const docsAdequate = /## Rollback[\s\S]*Revert commit[\s\S]*Restart server[\s\S]*\/api\/state/.test(patchText);
  assert(docsAdequate, '10) docs rollback adequacy', 'Phase 1E patch note includes explicit rollback procedure');

  await browser.close();

  console.log('\n--- QA SUMMARY ---');
  const failed = results.filter(r => !r.pass);
  console.log(`Total checks: ${results.length}`);
  console.log(`Failed: ${failed.length}`);
  if (dialogLog.length) console.log(`Dialogs handled: ${dialogLog.join(' || ')}`);
  if (failed.length) {
    for (const f of failed) console.log(`FAIL_ITEM: ${f.name} :: ${f.detail}`);
    process.exit(1);
  }
})();