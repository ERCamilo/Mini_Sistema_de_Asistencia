// tests/e2e/theme.e2e.mjs — theme quick button and no-flash start (real browser).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, serve, PHONE } from '../tutorials/lib.mjs';

let browser, server, base;
before(async () => {
  const { chromium } = await loadPlaywright();
  server = await serve();
  base = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function namedDevice(theme) {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Record the theme the browser has when the HTML is parsed (before app scripts finish).
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { window.__themeAtParse = document.documentElement.getAttribute('data-theme'); }));
  await page.goto(base + 'manifest.json');
  await page.evaluate(t => { localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]'); if (t) localStorage.setItem('appTheme', t); }, theme);
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.isVisible('#mini-welcome-name')) { await page.fill('#mini-welcome-name', 'Tema'); await page.click('.mini-welcome-submit'); }
  await page.waitForTimeout(400);
  return { context, page, errors };
}
const theme = page => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// Network readiness and the synchronous theme cache are not persistence acknowledgements.
async function waitForThemePersistence(page, expected) {
  await page.waitForFunction(() => usingMiniDataV2() && localDbReady);
  const saved = await page.evaluate(async () => {
    await localDbWriteQueue;
    if (!localDbReady || !MiniLocalDb.isEnabled(localStorage)) {
      throw new Error('Theme snapshot persistence failed');
    }
    const snapshot = await localDb.readState();
    if (!snapshot) throw new Error('Theme snapshot is missing');
    return snapshot.settings.appTheme || 'dark';
  });
  assert.equal(saved, expected, 'the real IndexedDB snapshot contains the expected theme');
}

test('no flash: a saved light theme is already applied when the HTML is parsed', async () => {
  const { context, page } = await namedDevice('light');
  try {
    assert.equal(await page.evaluate(() => window.__themeAtParse), 'light');
    assert.equal(await page.getAttribute('meta[name="theme-color"]', 'content'), '#f3f4f6', 'status bar follows the theme');
  } finally { await context.close(); }
});

test('header button: Original <-> Sol by default, remembered after reload', async () => {
  const { context, page, errors } = await namedDevice(null);
  try {
    await waitForThemePersistence(page, 'dark');
    assert.equal(await theme(page), 'dark');
    assert.match(await page.getAttribute('#btn-theme-quick', 'aria-label'), /Sol/);
    await page.click('#btn-theme-quick');
    assert.equal(await theme(page), 'sol');
    assert.match(await page.getAttribute('#btn-theme-quick', 'aria-label'), /Original/);
    await waitForThemePersistence(page, 'sol');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__themeAtParse), 'sol', 'no flash after reload either');
    await waitForThemePersistence(page, 'sol');
    assert.equal(await theme(page), 'sol', 'the restored snapshot still matches the parse-time theme');
    await page.click('#btn-theme-quick');
    assert.equal(await theme(page), 'dark');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('header button: persistence barrier waits for a controlled pending snapshot write', async () => {
  const { context, page, errors } = await namedDevice(null);
  try {
    await page.waitForFunction(() => usingMiniDataV2() && localDbReady);
    await page.evaluate(async () => {
      await localDbWriteQueue;
      const write = localDb.writeState;
      const gate = new Promise(resolve => { window.__releaseThemeWrite = resolve; });
      localDb.writeState = async snapshot => {
        window.__heldThemeWrite = true;
        await gate;
        return write(snapshot);
      };
    });
    await page.click('#btn-theme-quick');
    await page.waitForFunction(() => window.__heldThemeWrite === true);
    assert.equal(await theme(page), 'sol');
    assert.equal(await page.evaluate(() => localStorage.getItem('appTheme')), 'sol');

    let settled = false;
    let failure;
    const completion = waitForThemePersistence(page, 'sol').then(
      () => { settled = true; },
      error => { settled = true; failure = error; }
    );
    try {
      const saved = await page.evaluate(async () => (await localDb.readState()).settings.appTheme || 'dark');
      assert.equal(saved, 'dark', 'the held write has not reached the real IndexedDB snapshot');
      assert.equal(settled, false, 'document readiness and localStorage must not release the persistence barrier');
    } finally {
      await page.evaluate(() => window.__releaseThemeWrite());
      await completion;
    }
    if (failure) throw failure;
    assert.equal(settled, true, 'the barrier completes after the actual write');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__themeAtParse), 'sol');
    await waitForThemePersistence(page, 'sol');
    assert.equal(await theme(page), 'sol', 'hydration keeps the acknowledged theme');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Apariencia: the chosen pair drives the button; two equal themes are refused', async () => {
  const { context, page, errors } = await namedDevice(null);
  try {
    await page.evaluate(() => { switchView('more'); setMoreTab('settings'); openModal('theme-menu'); });
    await page.selectOption('#quick-theme-a', 'ocean');
    await page.selectOption('#quick-theme-b', 'light');
    await page.evaluate(() => closeModal('theme-menu'));
    await page.click('#btn-theme-quick');
    assert.equal(await theme(page), 'ocean', 'from Original (not in the pair) it goes to the first');
    await page.click('#btn-theme-quick');
    assert.equal(await theme(page), 'light');
    await page.evaluate(() => { openModal('theme-menu'); });
    await page.selectOption('#quick-theme-b', 'ocean');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('themeQuickPair'))), ['ocean', 'light'], 'refused, previous pair kept');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a setting changed while storage is still starting is not undone by the startup restore', async () => {
  const { context, page, errors } = await namedDevice(null);
  try {
    await page.click('#btn-theme-quick'); // Original -> Sol, saved in the local snapshot too
    await page.waitForTimeout(1500);
    // A slow phone: storage takes 1.5 s to open, so the next tap lands mid-boot.
    await page.addInitScript(() => {
      let md;
      Object.defineProperty(window, 'MiniData', { configurable: true, get: () => md, set: v => { const open = v.openIdbBackend; v.openIdbBackend = async (...a) => { await new Promise(r => setTimeout(r, 1500)); return open(...a); }; md = v; } });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('#btn-theme-quick'); // Sol -> Original, while booting
    assert.equal(await page.evaluate(() => usingMiniDataV2()), false, 'the tap really happened mid-boot');
    assert.equal(await theme(page), 'dark');
    await page.waitForTimeout(3000);
    assert.equal(await theme(page), 'dark', 'the startup restore must not undo it');
    assert.equal(await page.evaluate(() => localStorage.getItem('appTheme')), 'dark');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    assert.equal(await theme(page), 'dark', 'and it is what the snapshot keeps');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
