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
    if (child.exitCode != null) throw new Error('Accessibility test server exited before it could connect.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Accessibility test server did not become ready within 15 seconds.');
}

const runtime = await createTempRuntime('nostromo-a11y-');
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
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });

  const baseline = await page.evaluate(() => {
    const visible = (element) => !element.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(element).display !== 'none';
    const unnamedButtons = [...document.querySelectorAll('button')]
      .filter((element) => visible(element) && !element.disabled)
      .filter((element) => !String(element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim())
      .map((element) => element.id || element.outerHTML.slice(0, 80));
    const unlabeledInputs = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')]
      .filter((element) => visible(element) && !element.disabled)
      .filter((element) => !String(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || '').trim() && !element.labels?.length)
      .map((element) => element.id || element.outerHTML.slice(0, 80));
    return {
      unnamedButtons,
      unlabeledInputs,
      mainCount: document.querySelectorAll('main').length,
      settingsRole: document.getElementById('settingsPanel')?.getAttribute('role'),
      settingsModal: document.getElementById('settingsPanel')?.getAttribute('aria-modal'),
      announcementRole: document.getElementById('appAnnouncements')?.getAttribute('role'),
      statusCount: document.querySelectorAll('[role="status"]').length,
      labelledDialogs: document.querySelectorAll('dialog[aria-labelledby]').length,
      untitledFrames: [...document.querySelectorAll('iframe')].filter((frame) => !String(frame.getAttribute('title') || '').trim()).length,
      boardScrollbarWidth: getComputedStyle(document.getElementById('board')).scrollbarWidth,
    };
  });
  assert.equal(baseline.mainCount, 1);
  assert.equal(baseline.settingsRole, 'dialog');
  assert.equal(baseline.settingsModal, 'true');
  assert.equal(baseline.announcementRole, 'status');
  assert.ok(baseline.statusCount >= 2);
  assert.ok(baseline.labelledDialogs >= 4);
  assert.equal(baseline.untitledFrames, 0);
  assert.equal(baseline.boardScrollbarWidth, 'thin');
  assert.deepEqual(baseline.unnamedButtons, []);
  assert.deepEqual(baseline.unlabeledInputs, []);

  await page.keyboard.press('Control+K');
  assert.equal(await page.locator('#commandPaletteDialog').evaluate((dialog) => dialog.open), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'commandPaletteInput');
  assert.equal(await page.locator('#commandPaletteResults [role="option"]').count(), 4);
  await page.locator('#commandPaletteInput').fill('Mission Control Dashboard');
  await page.locator('#commandPaletteInput').press('Enter');
  assert.equal(await page.locator('#commandPaletteDialog').evaluate((dialog) => dialog.open), false);
  assert.equal(await page.locator('[data-project-id]').filter({ hasText: 'Mission Control Dashboard' }).evaluate((element) => document.activeElement === element), true);

  await page.getByRole('button', { name: /new task/i }).press('Enter');
  assert.equal(await page.locator('#taskDialog').evaluate((dialog) => dialog.open), true);
  await page.locator('#taskForm [name="title"]').fill('Keyboard accessibility task');
  await page.locator('#taskForm [name="nextAction"]').fill('Move this task with keyboard controls.');
  await page.locator('#taskForm button[value="default"]').press('Enter');
  await page.getByRole('button', { name: 'Edit task: Keyboard accessibility task' }).press('Enter');
  assert.equal(await page.locator('#editTaskDialog').evaluate((dialog) => dialog.open), true);
  const taskColumn = page.locator('#editTaskForm select[name="column"]');
  await taskColumn.focus();
  await taskColumn.press('End');
  await page.locator('#editTaskForm button[value="default"]').press('Enter');
  await page.waitForFunction(() => state.tasks.some((task) => task.title === 'Keyboard accessibility task' && task.column === 'done'));

  await page.getByRole('button', { name: /new note/i }).press('Enter');
  const noteBody = page.locator('#notesBoardToday textarea[data-field="body"]').first();
  await noteBody.focus();
  await noteBody.fill('This draft keeps keyboard focus while it saves.');
  await page.waitForTimeout(100);
  assert.equal(await noteBody.evaluate((element) => document.activeElement === element), true);

  const focusTaskSelect = page.locator('#todayFocusPinTaskSelect');
  await focusTaskSelect.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Pin task' }).press('Enter');
  assert.ok(await page.locator('#todayFocusList .today-focus-item').count() >= 1);
  assert.equal(await page.locator('#todayFocusList').textContent().then((text) => text.includes('Pinned')), true);

  await page.getByRole('button', { name: /settings/i }).press('Enter');
  assert.equal(await page.locator('#settingsPanel').evaluate((panel) => panel.classList.contains('open')), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'closeSettingsBtn');
  await page.getByRole('button', { name: 'Profiles' }).press('Enter');
  await page.getByRole('radio', { name: /seller/i }).press('Enter');
  assert.equal(await page.locator('#productProfileSummary').textContent().then((text) => text.includes('Seller')), true);
  await page.getByRole('button', { name: 'Integration Health' }).press('Enter');
  assert.equal(await page.locator('#integrationHealthList .integration-health-card').count(), 2);
  await page.locator('[data-integration-health-id="unread-email"] [data-integration-health-configure]').press('Enter');
  assert.equal(await page.locator('[data-integration-health-id="unread-email"] details').evaluate((details) => details.open), true);
  await page.getByRole('button', { name: 'Pods & Layout' }).press('Enter');
  const moveButton = page.locator('#settingsPodVisibilityList [data-pod-move="down"]:not(:disabled)').first();
  await moveButton.focus();
  await moveButton.press('Enter');
  await page.waitForFunction(() => document.getElementById('appAnnouncements')?.textContent?.startsWith('Moved '));

  await page.getByRole('button', { name: /new task/i }).focus();
  const focusIndicator = await page.getByRole('button', { name: /new task/i }).evaluate((element) => ({
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth,
  }));
  assert.notEqual(focusIndicator.outlineStyle, 'none');
  assert.notEqual(focusIndicator.outlineWidth, '0px');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotion = await page.locator('.board').evaluate((element) => ({
    scrollBehavior: getComputedStyle(element).scrollBehavior,
    transitionDuration: getComputedStyle(document.querySelector('.settings-panel')).transitionDuration,
  }));
  assert.equal(reducedMotion.scrollBehavior, 'auto');
  assert.ok(parseFloat(reducedMotion.transitionDuration) <= 0.01);
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  if (child.exitCode == null) await new Promise((resolve) => child.once('exit', resolve));
  await runtime.cleanup();
}

console.log('accessibility-smoke: PASS');
