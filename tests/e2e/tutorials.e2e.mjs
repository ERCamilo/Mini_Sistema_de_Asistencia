// tests/e2e/tutorials.e2e.mjs — `npm run test:e2e` (and CI on every PR).
// Runs every tutorial script fast on the real app and requires its captions to
// be exactly the ones of the recorded video, so a tutorial can never go stale.
// Also checks the in-app player and each "Hazlo conmigo" tour.
// While writing a script: TUTORIALS_DRAFT=1 skips the recorded-video check.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, serve, runTutorial, readRecorded, PHONE, Tutorials } from '../tutorials/lib.mjs';
import { loadTutorials } from '../tutorials/index.mjs';

const DRAFT = process.env.TUTORIALS_DRAFT === '1';
let browser, server, base;

before(async () => {
  const { chromium } = await loadPlaywright();
  server = await serve();
  base = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

for (const tutorial of await loadTutorials()) {
  test(`tutorial "${tutorial.id}": every step works and matches the recorded video`, async () => {
    const { captions } = await runTutorial(tutorial, { browser, base, mode: 'test' });
    if (DRAFT) return;
    const diff = Tutorials.compareScripts(captions.map(c => c.text), readRecorded(tutorial.id));
    assert.ok(diff.ok, `El video de "${tutorial.id}" quedó viejo (subtítulo ${diff.index + 1}: guion ${JSON.stringify(diff.expected)} ≠ video ${JSON.stringify(diff.recorded)}). Corré: TUTORIALS=${tutorial.id} npm run tutorials`);
  });
}

async function namedPhone(seed, { firstRun = false } = {}) {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  if (seed) await page.evaluate(seed);
  if (!firstRun) await page.evaluate(() => localStorage.setItem('tutorialsSeen', JSON.stringify(['marcar-asistencia'])));
  await page.evaluate(() => localStorage.setItem('storageHelpSnoozedUntil', String(Date.now() + 864e5)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.fill('#mini-welcome-name', 'Mini E2E');
  await page.click('.mini-welcome-submit');
  await page.waitForTimeout(300);
  return { context, page, errors };
}

test('a new device opens "Marcar asistencia" once, right after the welcome screen', { skip: DRAFT }, async () => {
  const { context, page, errors } = await namedPhone(null, { firstRun: true });
  try {
    await page.waitForSelector('#modal-tutorials.active #tutorials-player-view:not([hidden])', { timeout: 5000 });
    assert.equal(await page.textContent('#tutorials-title'), 'Marcar asistencia');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('tutorialsSeen'))), ['marcar-asistencia']);
    await page.evaluate(() => closeModal('modal-tutorials'));
    await page.waitForTimeout(500); // let the back-navigation guard settle before reloading
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    assert.equal(await page.isVisible('#modal-tutorials.active'), false, 'only the first time');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Tutoriales menu: player shows captions below the video and a step bar that seeks', { skip: DRAFT }, async () => {
  const { context, page, errors } = await namedPhone();
  try {
    await page.click('#nav-more');
    await page.click('#btn-tutorials');
    await page.waitForSelector('#modal-tutorials.active [data-tutorial-id="marcar-asistencia"]');
    assert.equal(await page.locator('#modal-tutorials [data-tutorial-id]').count(), Tutorials.LIST.length);
    await page.click('[data-tutorial-id="marcar-asistencia"]');
    await page.waitForFunction(() => document.querySelector('#modal-tutorials .tutorial-player video')?.readyState >= 1);
    const recorded = readRecorded('marcar-asistencia');
    const steps = Tutorials.stepSegments(recorded);
    assert.equal(await page.locator('#modal-tutorials .tutorial-steps button').count(), steps.length);
    await page.click(`#modal-tutorials .tutorial-steps button[data-step="${steps[1].step}"]`);
    await page.waitForFunction(text => document.querySelector('#modal-tutorials .tutorial-caption')?.textContent.includes(text), steps[1].text);
    const time = await page.evaluate(() => document.querySelector('#modal-tutorials .tutorial-player video').currentTime);
    assert.ok(Math.abs(time - steps[1].start) < 0.6, `seeked to step 2 (${time} vs ${steps[1].start})`);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('without the video the player lists the steps as text', { skip: DRAFT }, async () => {
  const { context, page } = await namedPhone();
  try {
    await page.route('**/*.webm', route => route.abort());
    await page.click('#nav-more');
    await page.click('#btn-tutorials');
    await page.click('[data-tutorial-id="agregar-empleado"]');
    await page.waitForSelector('#modal-tutorials .tutorial-fallback:not([hidden]) li');
    const items = await page.locator('#modal-tutorials .tutorial-fallback li').count();
    assert.equal(items, Tutorials.stepSegments(readRecorded('agregar-empleado')).length);
  } finally {
    await context.close();
  }
});

test('"Guardar para ver sin señal" stores every video and the player uses the saved copy', { skip: DRAFT }, async () => {
  const { context, page, errors } = await namedPhone();
  try {
    await page.click('#nav-more');
    await page.click('#btn-tutorials');
    await page.click('#btn-tutorials-offline');
    await page.waitForFunction(() => /guardados/i.test(document.getElementById('tutorials-offline-status')?.textContent || ''), null, { timeout: 20000 });
    const keys = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname + new URL(r.url).search), Tutorials.OFFLINE_CACHE);
    for (const t of Tutorials.LIST) {
      const expected = Tutorials.offlineKey(t.id, readRecorded(t.id).recordedAt).replace('./', '/');
      assert.ok(keys.includes(expected), `${t.id} saved (${keys.join(', ')})`);
    }
    await page.route('**/*.webm', route => route.abort());
    await page.click('[data-tutorial-id="liberar-espacio"]');
    await page.waitForFunction(() => document.querySelector('#modal-tutorials .tutorial-player video')?.readyState >= 1);
    assert.match(await page.evaluate(() => document.querySelector('#modal-tutorials .tutorial-player video').src), /^blob:/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

for (const entry of Tutorials.LIST) {
  test(`"Hazlo conmigo" for "${entry.id}": each tour target shows up when the user follows it`, { skip: DRAFT }, async () => {
    const tutorial = (await loadTutorials(entry.id))[0];
    const seed = tutorial.seed;
    const { context, page, errors } = await namedPhone(seed ? new Function(`return (${seed.fn.toString()})(${JSON.stringify(seed.arg ?? null)})`) : null);
    try {
      await page.evaluate(() => { document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); document.body.classList.remove('big-open'); });
      await page.evaluate(id => window.openTutorial(id), entry.id);
      await page.click('#btn-tutorial-tour');
      for (let i = 0; i < entry.tour.length; i++) {
        const step = entry.tour[i];
        await page.waitForFunction(n => document.querySelector('.guided-tour [data-tour-count]')?.textContent.startsWith(`Paso ${n}`), i + 1);
        const target = page.locator(step.target).first();
        await target.waitFor({ state: 'visible', timeout: 5000 });
        if (entry.id === 'agregar-empleado' && step.target.includes('submit')) {
          await page.fill('#user-name', 'Tour Uno');
          await page.fill('#user-position', 'Oficial');
        }
        if (step.target === '.archive-keep-pills') await page.click('#btn-archive-keep-3');
        else if (step.target === '#btn-download-backup' || step.target === '#btn-archive-run') {
          const dl = page.waitForEvent('download');
          await target.click();
          await dl;
        } else await target.click();
      }
      await page.waitForFunction(() => !document.querySelector('.guided-tour'));
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
