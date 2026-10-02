// tests/e2e/sheet-import.e2e.mjs — "Importar planilla de días": the user's real
// sheet pasted into Mini updates only existing employees, then can be undone.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright, serve, PHONE } from '../tutorials/lib.mjs';

const SHEET = fs.readFileSync(new URL('../fixtures/sheet-2026-09.tsv', import.meta.url), 'utf8');

let browser, server, base;
before(async () => {
  const { chromium } = await loadPlaywright();
  server = await serve();
  base = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function device() {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block', locale: 'es-ES' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(() => {
    localStorage.setItem('users', JSON.stringify([
      { id: 'u1', name: 'Ramón Gutiérrez', number: '001', position: 'Albañil', extraPositions: [{ name: 'Plomero' }] },
      { id: 'u2', name: 'Marysol Betancourt', number: '002', position: 'Capataz' },
      { id: 'u4', name: 'Elena Paredes', number: '004', position: 'Ayudante' },
      { id: 'u5', name: 'María López', number: '005', position: 'Ayudante' }
    ]));
    localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.waitForSelector('#mini-welcome-name', { timeout: 4000 }).then(() => true, () => false)) {
    await page.fill('#mini-welcome-name', 'Obra Planilla'); await page.click('.mini-welcome-submit');
  }
  await page.waitForFunction(() => typeof attendanceRepository !== 'undefined');
  await page.waitForTimeout(400);
  return { context, page, errors };
}

async function openSheetImport(page) {
  await page.click('#nav-more');
  await page.click('#btn-more-tab-data');
  await page.click('#btn-sheet-import');
  await page.waitForSelector('#modal-sheet-import.active');
  await page.fill('#sheet-import-textarea', SHEET);
  await page.click('#btn-sheet-import-review');
}

test('pasted sheet: preview, only confirmed employees, doubles halved, then undo', async () => {
  const { context, page, errors } = await device();
  try {
    // An earlier mark on another position, and one that the sheet's 0.00 clears.
    await page.evaluate(() => {
      attendanceRepository.setRecord('u1', '2026-09-11', 'present', 8);
      attendanceRepository.setRecord('u1', '2026-09-20', 'present', 8);
      attendanceRepository.setDayPosition('u1', '2026-09-20', 'Plomero');
    });
    await openSheetImport(page);
    const summary = await page.textContent('.sheet-summary');
    assert.match(summary, /11\/9/);
    assert.match(summary, /1\/10/);
    assert.match(summary, /21 días · 1\.00 = 8h/);
    assert.deepEqual(await page.locator('.sheet-day.is-on').allTextContents(), ['dom 13/9', 'dom 20/9', 'jue 24/9', 'dom 27/9']);
    assert.equal(await page.locator('.sheet-rows li').count(), 4);
    assert.equal(await page.locator('.sheet-rows li', { hasText: 'Julio' }).locator('input').isChecked(), false, 'number 005 is María in Mini');
    assert.match(await page.textContent('.sheet-rows li:has-text("Julio")'), /En Mini el 005 es María López/);
    assert.match(await page.textContent('.sheet-hint'), /3\. Tomas Rivera Luna/);
    assert.match(await page.textContent('#btn-sheet-import-run'), /Actualizar \d+ días de 3 empleados/);

    await page.click('#btn-sheet-import-run');
    await page.waitForSelector('#modal-sheet-import.active', { state: 'detached' }).catch(() => {});
    const records = await page.evaluate(() => ({
      cleared: getRecord('u1', '2026-09-11'),
      sunday: getRecord('u1', '2026-09-20'),
      holiday: getRecord('u1', '2026-09-24'),
      wadne: getRecord('u4', '2026-09-27'),
      maria: getRecord('u5', '2026-09-11')
    }));
    assert.equal(records.cleared, null, '0.00 cleared the mark');
    assert.equal(records.sunday.hours, 8, '2.00 on Sunday = one day');
    assert.equal('position' in records.sunday, false, 'back on the principal position');
    assert.equal(records.holiday.hours, 4, '1.00 on the holiday = half a day');
    assert.equal(records.wadne.hours, 8);
    assert.equal(records.maria, null, 'unconfirmed row not imported');

    await page.click('#btn-undo-import');
    await page.click('#modal-confirm.active #confirm-ok');
    await page.waitForTimeout(300);
    const undone = await page.evaluate(() => ({ a: getRecord('u1', '2026-09-11'), b: getRecord('u1', '2026-09-20'), c: getRecord('u4', '2026-09-27') }));
    assert.equal(undone.a.hours, 8);
    assert.equal(undone.b.position, 'Plomero');
    assert.equal(undone.c, null);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('toggling a double day and confirming a row change the plan before applying', async () => {
  const { context, page, errors } = await device();
  try {
    await openSheetImport(page);
    await page.click('.sheet-day:has-text("jue 24/9")');
    await page.locator('.sheet-rows li', { hasText: 'Julio' }).locator('input').check();
    assert.match(await page.textContent('#btn-sheet-import-run'), /de 4 empleados/);
    await page.click('#btn-sheet-import-run');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => [getRecord('u1', '2026-09-24').hours, getRecord('u5', '2026-09-26').hours]);
    assert.deepEqual(r, [8, 4], 'holiday off: 1.00 = 8h; confirmed row imported (0.50 = 4h)');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a text that is not a sheet shows what is wrong and enables nothing', async () => {
  const { context, page, errors } = await device();
  try {
    await page.click('#nav-more');
    await page.click('#btn-more-tab-data');
    await page.click('#btn-sheet-import');
    await page.fill('#sheet-import-textarea', 'Ramón 8 horas');
    await page.click('#btn-sheet-import-review');
    assert.match(await page.textContent('.sheet-problems'), /tabulaciones/);
    assert.equal(await page.isDisabled('#btn-sheet-import-run'), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function openSheetExport(page, from, to) {
  await page.click('#nav-more');
  await page.click('#btn-more-tab-data');
  await page.click('#btn-sheet-export');
  await page.waitForSelector('#modal-sheet-export.active');
  await page.fill('#sheet-export-from', from);
  await page.fill('#sheet-export-to', to);
  await page.dispatchEvent('#sheet-export-to', 'change');
}

test('export: the sheet the office uses, holidays remembered, copied to the clipboard', async () => {
  const { context, page, errors } = await device();
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.evaluate(() => {
      attendanceRepository.setRecord('u4', '2026-09-23', 'present', 9);
      attendanceRepository.setRecord('u4', '2026-09-24', 'present', 8);
      attendanceRepository.setRecord('u4', '2026-09-27', 'present', 8);
      attendanceRepository.setRecord('u2', '2026-09-25', 'present', 4);
    });
    await openSheetExport(page, '2026-09-23', '2026-09-27');
    assert.deepEqual(await page.locator('#modal-sheet-export .sheet-day.is-on').allTextContents(), ['dom 27/9'], 'only Sundays by default');
    await page.click('#modal-sheet-export .sheet-day:has-text("jue 24/9")');
    const lines = (await page.inputValue('#sheet-export-text')).split('\n');
    assert.deepEqual(lines.slice(0, 1), ['No.\tDescripcion\tOCUPACION\tS23\tS24\tS25\tS26\tS27']);
    assert.ok(lines.includes('2\tMarysol Betancourt\tCapataz\t\t\t0.50\t\t'));
    assert.ok(lines.includes('4\tElena Paredes\tAyudante\t1.125\t2.00\t\t\t2.00'));
    assert.match(await page.textContent('#sheet-export-preview .sheet-summary'), /4 empleados · 5 días/);
    await page.click('#btn-sheet-export-copy');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), lines.join('\n'));

    // The holiday is remembered: opening again doubles it by default.
    await page.evaluate(() => closeModal('modal-sheet-export'));
    await page.click('#btn-sheet-export');
    await page.fill('#sheet-export-from', '2026-09-23');
    await page.fill('#sheet-export-to', '2026-09-27');
    await page.dispatchEvent('#sheet-export-to', 'change');
    assert.deepEqual(await page.locator('#modal-sheet-export .sheet-day.is-on').allTextContents(), ['jue 24/9', 'dom 27/9']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('export -> import round trip in the app: nothing to update', async () => {
  const { context, page, errors } = await device();
  try {
    await page.evaluate(() => {
      attendanceRepository.setRecord('u1', '2026-09-26', 'present', 10);
      attendanceRepository.setRecord('u4', '2026-09-27', 'present', 8);
    });
    await openSheetExport(page, '2026-09-21', '2026-09-27');
    const text = await page.inputValue('#sheet-export-text');
    await page.evaluate(() => closeModal('modal-sheet-export'));
    await page.click('#btn-sheet-import');
    await page.waitForSelector('#modal-sheet-import.active');
    await page.fill('#sheet-import-textarea', text);
    await page.click('#btn-sheet-import-review');
    assert.match(await page.textContent('#btn-sheet-import-run'), /No hay días para actualizar/);
    assert.equal(await page.isDisabled('#btn-sheet-import-run'), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
