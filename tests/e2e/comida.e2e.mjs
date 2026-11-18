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

async function device(theme = 'dark', fixture = {}) {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block', locale: 'es-ES' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(({ today, theme, fixture }) => {
    localStorage.setItem('users', JSON.stringify(fixture.users || [{ id: 'u1', name: 'Juan Pérez', number: '1' }, { id: 'u2', name: 'María Gómez', number: '2' }]));
    localStorage.setItem('attendance', JSON.stringify({ [today]: { u1: { status: 'present', hours: 8 }, u2: { status: 'present', hours: 8 } } }));
    localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
    localStorage.setItem('appTheme', theme);
    if (fixture.comida) localStorage.setItem('miniComidaV1', JSON.stringify(fixture.comida));
  }, { today: keyOf(new Date()), theme, fixture });
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

test('cards are ordered by number and open the food calendar, with reversible food-only pauses', async () => {
  const today = new Date();
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 8);
  const dish = { id: 'pollo', name: 'Pollo guisado', emoji: '🍗', price: 250, cost: 140, onMenu: true };
  const order = (id, personId, day) => ({ id, personId, day: keyOf(day), dishId: dish.id, dishName: dish.name, dishEmoji: dish.emoji, price: dish.price, cost: dish.cost });
  const { context, page, errors } = await device('dark', {
    users: [{ id: 'u1', name: 'Juan Pérez', number: '10' }, { id: 'u2', name: 'María Gómez', number: '2' }],
    comida: {
      schemaVersion: 1, navSlot: 'comida', dishes: [dish],
      clients: [{ id: 'c10', name: 'Rosa', num: 'C10', ref: '' }, { id: 'c2', name: 'Pedro', num: 'C02', ref: '' }],
      orders: [order('o1', 'u1', previousMonth), order('o2', 'u1', today), order('o3', 'c2', today)],
      periods: [{ id: 'p', start: keyOf(previousMonth), end: null }]
    }
  });
  const attendanceBefore = await page.evaluate(() => localStorage.getItem('attendance'));
  const cards = page.locator('#comida-view .comida-card .comida-avatar');
  const sheet = page.locator('#comida-sheet');
  await page.click('#nav-comida');
  assert.deepEqual(await cards.allTextContents(), ['2', '10', 'C02', 'C10']);
  await page.fill('#comida-search', '10');
  assert.deepEqual(await cards.allTextContents(), ['10', 'C10']);
  await page.fill('#comida-search', '');

  await page.getByRole('button', { name: 'Ver calendario de pedidos de Juan Pérez' }).click();
  await sheetOpen(page);
  assert.match(await sheet.locator('.comida-calendar-detail').innerText(), /Pollo guisado/);
  assert.equal(await sheet.getByRole('button', { name: 'Mes siguiente' }).isDisabled(), true);
  await sheet.getByRole('button', { name: 'Mes anterior' }).click();
  await sheet.locator('.cal-day.has-data').click();
  assert.match(await sheet.locator('.comida-calendar-detail').innerText(), /RD\$250/);
  await sheet.getByRole('button', { name: 'Ver cuenta' }).click();
  assert.equal(await sheet.locator('.comida-total .comida-roll').getAttribute('aria-label'), 'RD$500');
  await sheet.getByRole('button', { name: 'Volver al calendario' }).click();
  assert.match(await sheet.locator('.cal-day[aria-pressed="true"]').getAttribute('aria-label'), /8 de .*1 plato/);
  await sheet.getByRole('button', { name: 'Pausar en Comida' }).click();
  await sheet.getByRole('button', { name: 'Cerrar calendario' }).click();
  await sheet.waitFor({ state: 'hidden' });
  assert.deepEqual(await cards.allTextContents(), ['2', 'C02', 'C10']);
  await page.getByRole('button', { name: 'Ver presentes que no han pedido' }).click();
  assert.deepEqual(await cards.allTextContents(), ['2']);
  await page.getByRole('button', { name: 'Ver presentes que no han pedido' }).click();

  await page.getByRole('button', { name: 'Ver calendario de pedidos de Pedro' }).click();
  await sheet.getByRole('button', { name: 'Pausar en Comida' }).click();
  await sheet.getByRole('button', { name: 'Cerrar calendario' }).click();
  await sheet.waitFor({ state: 'hidden' });
  assert.deepEqual(await cards.allTextContents(), ['2', 'C10']);
  assert.deepEqual((await saved(page)).pausedPersonIds, ['u1', 'c2']);
  assert.equal((await saved(page)).orders.length, 3);
  await page.getByRole('button', { name: 'Enviar Pedido' }).click();
  assert.match(await sheet.locator('.comida-msg').innerText(), /Total: 2 platos/);
  assert.equal(await page.evaluate(() => localStorage.getItem('attendance')), attendanceBefore);

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#nav-comida');
  assert.deepEqual(await cards.allTextContents(), ['2', 'C10']);
  await page.getByRole('button', { name: 'Pausados (2)' }).click();
  await sheet.getByRole('button', { name: 'Reactivar a Juan Pérez en Comida' }).click();
  await sheet.getByRole('button', { name: 'Reactivar a Pedro en Comida' }).click();
  await sheet.waitFor({ state: 'hidden' });
  assert.deepEqual(await cards.allTextContents(), ['2', '10', 'C02', 'C10']);
  assert.deepEqual((await saved(page)).pausedPersonIds, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the Pedidos date uses the shared calendar without changing the attendance date', async () => {
  const today = new Date();
  const closedDay = keyOf(new Date(today.getFullYear(), today.getMonth() - 1, 8));
  const { context, page, errors } = await device('dark', {
    comida: {
      schemaVersion: 1, navSlot: 'comida',
      orders: [{ id: 'o1', personId: 'u1', day: closedDay, dishId: 'd1', dishName: 'Res', dishEmoji: '🥩', price: 300, cost: 150 }],
      periods: [{ id: 'p1', start: closedDay, end: closedDay }, { id: 'p2', start: keyOf(today), end: null }]
    }
  });
  try {
    const attendanceDate = await page.textContent('#header-date');
    await page.click('#nav-comida');
    const date = page.getByRole('button', { name: /Elegir fecha de pedidos/ });
    const calendar = page.locator('#modal-date-jump');
    const nextMonth = calendar.locator('#datejump-next');
    assert.equal(await date.count(), 1);
    await date.press('Enter');
    await calendar.waitFor();
    assert.equal(await calendar.locator('.dj-selected').getAttribute('aria-label'), String(today.getDate()));
    assert.equal(await nextMonth.isDisabled(), true);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    if (today.getDate() < monthEnd) {
      assert.equal(await calendar.getByRole('button', { name: String(today.getDate() + 1), exact: true }).isDisabled(), true);
    }

    await calendar.locator('#datejump-prev').click();
    assert.equal(await nextMonth.isEnabled(), true);
    await calendar.getByRole('button', { name: '8', exact: true }).click();
    await calendar.waitFor({ state: 'hidden' });
    assert.match(await date.innerText(), /8 .*cerrado/);
    assert.match(await page.locator('#comida-view .comida-today').innerText(), /RD\$300/);
    assert.ok(await page.isVisible('#comida-view .comida-band'));

    await date.click();
    assert.equal(await calendar.locator('.dj-selected').getAttribute('aria-label'), '8');
    await calendar.locator('#datejump-today').click();
    assert.match(await date.innerText(), /Hoy/);
    await page.click('#nav-attendance');
    assert.equal(await page.textContent('#header-date'), attendanceDate);
    await page.click('#date-jump-trigger');
    assert.equal(await nextMonth.isEnabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('billing stacks client and staff sales with a readable daily breakdown', async () => {
  const today = new Date();
  const first = keyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2));
  const yesterday = keyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const order = (id, personId, day, price) => ({ id, personId, day, price, dishId: 'd1', dishName: 'Res', dishEmoji: '🥩', cost: 80 });
  const { context, page, errors } = await device('dark', {
    comida: {
      schemaVersion: 1, navSlot: 'comida',
      clients: [{ id: 'c1', name: 'Pedro', num: 'C01', ref: '' }],
      orders: [order('o1', 'former-employee', first, 200), order('o2', 'c1', first, 400), order('o3', 'c1', keyOf(today), 300)],
      periods: [{ id: 'p1', start: first, end: null }]
    }
  });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#nav-comida');
    await page.getByRole('button', { name: 'Facturación' }).click();
    const chart = page.getByRole('img', { name: /Ventas por día del período/ });
    const parts = chart.locator(`[data-day="${first}"]`);
    const clients = parts.locator('.comida-sales-client');
    const staff = parts.locator('.comida-sales-staff');
    assert.equal(await chart.locator('[data-day]').count(), 3);
    assert.equal(await clients.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(234, 88, 12)');
    assert.equal(await staff.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(96, 165, 250)');
    const clientHeight = (await clients.boundingBox()).height;
    const staffHeight = (await staff.boundingBox()).height;
    assert.ok(Math.abs(clientHeight - 2 * staffHeight) < 1);
    assert.equal(await chart.locator(`[data-day="${yesterday}"].is-zero`).count(), 1);
    assert.match(await parts.getAttribute('title'), /Clientes RD\$400 · Personal RD\$200 · Total RD\$600/);
    await page.getByText('Importes por día', { exact: true }).click();
    const table = page.locator('.comida-sales-table');
    assert.equal(await table.isVisible(), true);
    assert.deepEqual(await table.locator('thead th').allTextContents(), ['Fecha', 'Clientes', 'Personal']);
    assert.deepEqual(await table.locator('tbody tr').first().locator('td').allTextContents(), ['RD$400', 'RD$200']);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('the food toggle in Empleados changes only the food pause and keeps focus', async () => {
  const { context, page, errors } = await device('dark', {
    comida: { schemaVersion: 1, navSlot: 'comida', pausedPersonIds: ['u1'] }
  });
  try {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.click('#nav-employees');
    const card = page.locator('#employees-container .user-card', { hasText: 'Juan Pérez' });
    const toggle = card.getByRole('button', { name: 'Comida para Juan Pérez' });
    const roster = await page.evaluate(() => localStorage.getItem('users'));
    assert.equal(await toggle.count(), 1);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await toggle.getAttribute('title'), 'Reactivar en Comida');
    const bounds = await toggle.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44 && bounds.x + bounds.width <= 320);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
    assert.equal(await toggle.getAttribute('title'), 'Pausar en Comida');
    assert.equal(await card.getByRole('button', { name: 'Pausar empleado', exact: true }).isVisible(), true);
    assert.deepEqual((await saved(page)).pausedPersonIds, []);

    await page.click('#nav-comida');
    assert.equal(await page.getByRole('button', { name: 'Ver calendario de pedidos de Juan Pérez' }).isVisible(), true);
    await page.click('#nav-employees');
    await toggle.click();
    assert.equal(await page.evaluate(() => localStorage.getItem('users')), roster);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('#nav-employees');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.deepEqual((await saved(page)).pausedPersonIds, ['u1']);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('screen titles stay centered with and without the connections button', async () => {
  const { context, page } = await device();
  try {
    const title = page.locator('#section-title');
    const header = page.locator('.top-nav');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [view, label] of [['attendance', 'Asistencia'], ['requests', 'Reportes y Solicitudes'], ['employees', 'Empleados'], ['comida', 'Comida'], ['more', 'Más']]) {
        await page.evaluate(target => switchView(target), view);
        assert.equal(await title.textContent(), label);
        const { x, width: titleWidth } = await title.boundingBox();
        const { x: headerX, width: headerWidth } = await header.boundingBox();
        assert.ok(Math.abs(x + titleWidth / 2 - (headerX + headerWidth / 2)) < 1, `${label} at ${width}px`);
        assert.equal(await page.locator('#btn-attendance-link').isVisible(), view === 'attendance');
      }
    }
  } finally {
    await context.close();
  }
});

test('a first-time user can backfill an earlier order and see it in billing', async () => {
  const today = new Date();
  const earlier = keyOf(new Date(today.getFullYear(), today.getMonth() - 1, 7));
  const { context, page, errors } = await device('dark', {
    comida: {
      schemaVersion: 1, navSlot: 'comida',
      dishes: [{ id: 'd1', name: 'Res', emoji: '🥩', price: 300, cost: 150, onMenu: true }]
    }
  });
  try {
    await page.click('#nav-comida');
    await page.getByRole('button', { name: /Elegir fecha de pedidos/ }).click();
    const calendar = page.locator('#modal-date-jump');
    await calendar.locator('#datejump-prev').click();
    await calendar.getByRole('button', { name: '7', exact: true }).click();
    const add = page.locator('[data-person="u1"]');
    assert.equal(await add.count(), 1);
    await add.click();
    await add.click();
    await page.getByRole('button', { name: 'Quitar un plato a Juan Pérez' }).click();
    await page.getByRole('button', { name: 'Pedido de Juan Pérez' }).click();
    await page.locator('#comida-note').fill('Sin ensalada');
    await page.getByRole('button', { name: 'Listo', exact: true }).click();
    await page.locator('#comida-sheet').waitFor({ state: 'hidden' });
    const state = await saved(page);
    assert.deepEqual(state.orders.map(order => order.day), [earlier]);
    assert.equal(state.notes[`u1@${earlier}`], 'Sin ensalada');
    assert.equal(state.periods[0].start, earlier);
    await page.getByRole('button', { name: 'Facturación' }).click();
    assert.match(await page.locator(`.comida-bars [data-day="${earlier}"]`).getAttribute('title'), /Personal RD\$300/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('the food canvas and orange numbers are readable in all five themes', async () => {
  const { context, page } = await device('dark', {
    comida: {
      schemaVersion: 1, navSlot: 'comida',
      dishes: [{ id: 'd1', name: 'Pollo', emoji: '🍗', price: 250, cost: 140, onMenu: true }]
    }
  });
  const luminance = rgb => rgb.match(/\d+/g).slice(0, 3).map(channel => {
    const value = Number(channel) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((l, value, i) => l + value * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({ content: 'body { transition: none !important; }' });
    for (const theme of ['dark', 'light', 'contrast', 'ocean', 'sol']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const attendance = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.click('#nav-comida');
      const colors = await page.evaluate(() => {
        const style = selector => getComputedStyle(document.querySelector(selector));
        return {
          canvas: style('body').backgroundColor,
          contentBackground: style('#comida-view .dashboard-panel').backgroundColor,
          surface: style('#comida-view .stat-card').backgroundColor,
          rosterSurface: style('#users-container .user-card').backgroundColor,
          count: style('#comida-view .stat-value').color,
          number: style('#comida-view .comida-avatar').color,
          numberBackground: style('#comida-view .comida-avatar').backgroundColor,
          quantity: style('#comida-view .comida-step-n').color,
          orderButton: style('#comida-view .comida-send').backgroundColor,
          orderButtonText: style('#comida-view .comida-send').color
        };
      });
      assert.notEqual(colors.canvas, attendance, theme);
      assert.notEqual(colors.canvas, colors.surface, theme);
      assert.equal(colors.contentBackground, 'rgba(0, 0, 0, 0)', theme);
      assert.equal(colors.surface, colors.rosterSurface, theme);
      const [red, green, blue] = colors.canvas.match(/\d+/g).slice(0, 3).map(Number);
      assert.ok(red > green && green >= blue, `${theme}: warm canvas`);
      assert.equal(colors.count, colors.number, theme);
      assert.equal(colors.count, colors.quantity, theme);
      assert.ok(contrast(colors.count, colors.surface) >= 4.5, `${theme}: counts`);
      assert.ok(contrast(colors.number, colors.numberBackground) >= 4.5, `${theme}: employee number`);
      assert.ok(contrast(colors.orderButtonText, colors.orderButton) >= 4.5, `${theme}: send button`);
      await page.click('#nav-attendance');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), attendance, theme);
    }
  } finally {
    await context.close();
  }
});
