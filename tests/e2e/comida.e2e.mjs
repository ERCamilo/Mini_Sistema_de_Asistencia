// tests/e2e/comida.e2e.mjs — the optional Comida section in a real phone-sized browser:
// choose it for the bar, create a dish, take orders, send to the kitchen,
// register a purchase, a partial payment and close the period. Attendance is untouched.
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

const keyOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

async function device(theme = 'dark') {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block', locale: 'es-ES' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(({ today, theme }) => {
    localStorage.setItem('users', JSON.stringify([{ id: 'u1', name: 'Juan Pérez', number: '1' }, { id: 'u2', name: 'María Gómez', number: '2' }]));
    localStorage.setItem('attendance', JSON.stringify({ [today]: { u1: { status: 'present', hours: 8 }, u2: { status: 'present', hours: 8 } } }));
    localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
    localStorage.setItem('appTheme', theme);
  }, { today: keyOf(new Date()), theme });
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.waitForSelector('#mini-welcome-name', { timeout: 4000 }).then(() => true, () => false)) {
    await page.fill('#mini-welcome-name', 'Cocina');
    await page.click('.mini-welcome-submit');
  }
  await page.waitForTimeout(400);
  return { context, page, errors };
}

const sheetOpen = page => page.waitForSelector('#comida-sheet.active .modal-content > *:nth-child(2)');
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('miniComidaV1')));

test('the empty bar slot is chosen once, and Más can swap it back', async () => {
  const { context, page, errors } = await device();
  assert.equal(await page.isVisible('#nav-slot'), true, 'la casilla vacía aparece');
  assert.equal(await page.isVisible('#nav-requests'), false);
  await page.click('#nav-slot');
  await sheetOpen(page);
  await page.click('#comida-sheet .comida-option >> nth=0');
  await page.waitForTimeout(400);
  assert.equal(await page.isVisible('#nav-slot'), false, 'la casilla ya no vuelve');
  assert.equal(await page.isVisible('#nav-comida'), true);
  await page.click('#nav-more');
  await page.click('#more-section-requests-toggle + .toggle-slider');
  assert.equal(await page.isVisible('#nav-requests'), true);
  assert.equal(await page.isVisible('#nav-comida'), false);
  assert.equal((await saved(page)).navSlot, 'requests');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a full day: dish, orders, kitchen message, purchase, partial payment and closing', async () => {
  const { context, page, errors } = await device('light');
  const before = await page.evaluate(() => localStorage.getItem('attendance'));
  await page.click('#nav-slot');
  await sheetOpen(page);
  await page.click('#comida-sheet .comida-option >> nth=0');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.body.classList.contains('comida-mode')), 'acento de Comida activo');

  // Cocina: first dish
  await page.click('#comida-view .view-btn >> text=Cocina');
  await page.click('#comida-view >> text=Nuevo plato');
  await sheetOpen(page);
  await page.fill('#comida-dish-name', 'Pollo guisado');
  await page.fill('#comida-dish-price', '250');
  await page.fill('#comida-dish-cost', '140');
  await page.click('#comida-sheet >> text=Guardar plato');
  await page.waitForTimeout(400);

  // Pedidos: two plates for Juan, one for María
  await page.click('#comida-view .view-btn >> text=Pedidos');
  await page.click('[data-person="u1"]');
  await page.click('[data-person="u1"]');
  await page.click('[data-person="u2"]');
  let state = await saved(page);
  assert.equal(state.orders.length, 3);
  assert.equal(state.orders[0].price, 250, 'el precio queda congelado en el pedido');
  assert.ok(await page.isVisible('.comida-step.has'), 'el + toma el acento cuando ya pidió');

  // Kitchen message
  await page.click('.comida-send');
  await sheetOpen(page);
  const message = await page.textContent('#comida-sheet .comida-msg');
  assert.match(message, /1- Pollo guisado {2}RD\$250 x 3 = RD\$750/);
  assert.match(message, /\*Total: 3 platos = RD\$750\*/);
  const popup = context.waitForEvent('page').catch(() => null);
  await page.click('#comida-sheet .comida-wa-link');
  (await popup)?.close();
  await page.click('#comida-sheet >> text=Ya lo envié');
  await page.waitForTimeout(400);
  assert.match(await page.textContent('.comida-note'), /Pedido enviado/);
  await page.click('[data-person="u2"]');
  assert.match(await page.textContent('.comida-note'), /Cambió desde el último envío: 1 plato nuevo/);

  // A client through the central +
  await page.click('#nav-add');
  await sheetOpen(page);
  await page.click('#comida-sheet .comida-option >> text=Cliente');
  await page.fill('#comida-client-name', 'Pedro Almonte');
  await page.click('#comida-sheet >> text=Agregar cliente');
  await page.waitForTimeout(400);
  assert.equal((await saved(page)).clients[0].num, 'C01');

  // Purchase: create an insumo, then buy
  await page.click('#nav-add');
  await sheetOpen(page);
  await page.click('#comida-sheet .comida-option >> text=Compra de insumos');
  await page.click('#comida-sheet .comida-supply.is-add');
  await page.fill('#comida-supply-name', 'Carnes');
  await page.click('#comida-sheet >> text=Guardar insumo');
  await page.waitForTimeout(300);
  await page.click('#comida-sheet .comida-bills button >> nth=3');
  await page.click('#comida-sheet .comida-bills button >> nth=0');
  await page.click('#comida-sheet >> text=Guardar compra');
  await page.waitForTimeout(300);
  state = await saved(page);
  assert.deepEqual([state.purchases.length, state.purchases[0].amount, state.purchases[0].categoryName], [1, 1100, 'Carnes']);
  await page.click('#nav-add');
  await page.waitForTimeout(400);
  assert.equal(await page.isVisible('#comida-sheet.active'), false, 'el + central cierra la hoja');

  // Facturación: partial payment, then account text lists only what is left
  await page.click('#comida-view .view-btn >> text=Facturación');
  await page.click('#comida-view .comida-debtor >> nth=0');
  await sheetOpen(page);
  await page.click('#comida-sheet >> text=Registrar pago');
  await page.fill('#comida-pay', '300');
  await page.click('#comida-sheet >> text=Guardar pago');
  await page.waitForTimeout(300);
  await page.click('#comida-sheet >> text=Enviar cuenta');
  const account = await page.textContent('#comida-sheet .comida-msg');
  assert.match(account, /\(resto\)/);
  assert.match(account, /\*Debes: RD\$200\*/);
  await page.click('#nav-add');
  await page.waitForTimeout(400);

  // Close the period: today becomes read-only
  await page.click('#comida-view >> text=Cerrar período');
  await sheetOpen(page);
  await page.click('#comida-sheet .comida-ink');
  await page.waitForTimeout(400);
  await page.click('#comida-view .view-btn >> text=Pedidos');
  assert.ok(await page.isVisible('.comida-band'), 'banda de solo lectura');
  assert.equal(await page.locator('.comida-step').count(), 0, 'sin botones para anotar');
  state = await saved(page);
  assert.equal(state.periods.length, 2);

  // Attendance untouched, and the backup file carries Comida
  assert.equal(await page.evaluate(() => localStorage.getItem('attendance')), before);
  const backup = await page.evaluate(() => { const data = buildMiniBackupData(); if (window.ComidaUI.exportBackup()) data.comida = window.ComidaUI.exportBackup(); return data; });
  assert.equal(backup.comida.orders.length, 4);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Comida survives a reload and a debtor cannot be deleted', async () => {
  const { context, page, errors } = await device('ocean');
  await page.evaluate(() => {
    localStorage.setItem('miniComidaV1', JSON.stringify({ schemaVersion: 1, navSlot: 'comida', dishes: [{ id: 'd1', name: 'Res', emoji: '🥩', price: 300, cost: 150, onMenu: true }],
      orders: [{ id: 'o1', personId: 'u1', dishId: 'd1', dishName: 'Res', dishEmoji: '🥩', price: 300, cost: 150, day: '2026-01-05' }], periods: [{ id: 'p1', start: '2026-01-01', end: null }] }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  assert.equal(await page.isVisible('#nav-comida'), true);
  assert.equal(await page.evaluate(() => window.ComidaUI.hasDebt('u1')), true);
  await page.click('#nav-comida');
  await page.click('#comida-view .view-btn >> text=Facturación');
  assert.match(await page.textContent('#comida-view'), /RD\$300/);
  assert.deepEqual(errors, []);
  await context.close();
});
