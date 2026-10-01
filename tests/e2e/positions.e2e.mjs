// tests/e2e/positions.e2e.mjs — up to 3 positions: chips on the card, the day's
// position in the WhatsApp text, and the employee form.
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

async function device() {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block', locale: 'es-ES' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(() => {
    localStorage.setItem('users', JSON.stringify([
      { id: 'u1', name: 'Franklin Henrriquez', number: '001', position: 'Albañil', positionSaId: 'POS-1', extraPositions: [{ name: 'Plomero', saPositionId: 'POS-7' }] },
      { id: 'u2', name: 'Pauliny Buchamps', number: '002', position: 'Ayudante' },
      { id: 'u3', name: 'Jean Michel', number: '018', position: 'Albañil', extraPositions: [{ name: 'Pintor' }] }
    ]));
    localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
    localStorage.setItem('lastUpdateTimestamp', '12:05 a. m.');
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.waitForSelector('#mini-welcome-name', { timeout: 4000 }).then(() => true, () => false)) {
    await page.fill('#mini-welcome-name', 'Obra Posiciones'); await page.click('.mini-welcome-submit');
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__sent = []; window.open = url => { window.__sent.push(url); return null; }; });
  return { context, page, errors };
}
const card = (page, name) => page.locator('.user-card', { hasText: name });
const sent = page => page.evaluate(() => window.__sent.map(u => decodeURIComponent(u.replace('https://wa.me/?text=', ''))));

test('chips: only for employees with more than one position; tapping one marks present with that position', async () => {
  const { context, page, errors } = await device();
  try {
    assert.equal(await card(page, 'Pauliny').locator('.pos-chip').count(), 0, 'one position: plain role text');
    assert.deepEqual(await card(page, 'Franklin').locator('.pos-chip').allTextContents(), ['Albañil', 'Plomero']);
    await card(page, 'Franklin').locator('.pos-chip', { hasText: 'Plomero' }).click();
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => { const r = getRecord('u1'); return [r.hours, r.position]; }), [8, 'Plomero']);
    assert.equal(await card(page, 'Franklin').locator('.pos-chip.is-on').textContent(), 'Plomero');
    await card(page, 'Franklin').locator('.pos-chip', { hasText: 'Albañil' }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => 'position' in getRecord('u1')), false, 'principal = no stored override');
    await card(page, 'Franklin').locator('.pos-chip', { hasText: 'Plomero' }).click();
    // Storage v2 writes the day to IndexedDB asynchronously: reload only once it landed.
    await page.waitForFunction(async () => {
      const all = await (await window.MiniData.openIdbBackend(indexedDB)).readAll();
      const day = all.days[selectedDate] || {};
      return (day.u1 || {}).position === 'Plomero';
    }, null, { timeout: 5000 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.equal(await card(page, 'Franklin').locator('.pos-chip.is-on').textContent(), 'Plomero', 'survives reload');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('WhatsApp: " _Position_" after the hours for multi-position employees (principal included); others unchanged', async () => {
  const { context, page, errors } = await device();
  try {
    await card(page, 'Franklin').locator('.pos-chip', { hasText: 'Plomero' }).click();
    await card(page, 'Pauliny').locator('.check-box').click();
    await card(page, 'Jean').locator('.check-box').click();
    await page.waitForTimeout(200);
    await page.click('.whatsapp-cta');
    await page.waitForTimeout(200);
    const [message] = await sent(page);
    const lines = message.split('\n');
    assert.match(lines[0], /^\*Asistencia de hoy .+\*$/);
    assert.match(lines[1], /^_Última actualización: \d{1,2}:\d{2}\s[ap]\.\sm\._$/);
    assert.deepEqual(lines.slice(3, 6), [
      '001. Franklin Henrriquez  *8h* _Plomero_',
      '002. Pauliny Buchamps  *8h*',
      '018. Jean Michel  *8h* _Albañil_'
    ]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('form: add and remove extra positions; the SA id of an unchanged principal is kept', async () => {
  const { context, page, errors } = await device();
  try {
    await page.evaluate(() => editUser('u1'));
    assert.deepEqual(await page.evaluate(() => ['user-position', 'user-position-2', 'user-position-3'].map(f => document.getElementById(f).value)), ['Albañil', 'Plomero', '']);
    await page.fill('#user-position-3', 'Pintor');
    await page.click('#user-form button[type="submit"]');
    await page.waitForTimeout(200);
    let u1 = await page.evaluate(() => users.find(u => u.id === 'u1'));
    assert.equal(u1.positionSaId, 'POS-1');
    assert.deepEqual(u1.extraPositions, [{ name: 'Plomero', saPositionId: 'POS-7' }, { name: 'Pintor' }]);
    assert.equal(await card(page, 'Franklin').locator('.pos-chip').count(), 3);

    await page.evaluate(() => editUser('u1'));
    await page.fill('#user-position-2', '');
    await page.fill('#user-position-3', '');
    await page.click('#user-form button[type="submit"]');
    await page.waitForTimeout(200);
    u1 = await page.evaluate(() => users.find(u => u.id === 'u1'));
    assert.deepEqual(u1.extraPositions, []);
    assert.equal(await card(page, 'Franklin').locator('.pos-chip').count(), 0, 'back to one position');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
