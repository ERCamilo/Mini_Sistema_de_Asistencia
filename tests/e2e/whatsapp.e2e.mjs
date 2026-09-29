// tests/e2e/whatsapp.e2e.mjs — WhatsApp report: warnings by day age, and the
// message text stays byte-for-byte the same (it is imported elsewhere).
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
const daysAgo = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return keyOf(d); };

async function device() {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block', locale: 'es-ES' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'manifest.json');
  await page.evaluate(days => {
    const users = [{ id: 'u1', name: 'Juan Pérez', number: '1' }, { id: 'u2', name: 'María Gómez', number: '2' }];
    const attendance = {};
    for (const key of days) attendance[key] = { u2: { status: 'present', hours: 10 }, u1: { status: 'present', hours: 8 } };
    localStorage.setItem('users', JSON.stringify(users));
    localStorage.setItem('attendance', JSON.stringify(attendance));
    localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
    localStorage.setItem('lastUpdateTimestamp', '9:15 a. m.');
  }, [daysAgo(0), daysAgo(1), daysAgo(8), daysAgo(45), daysAgo(-3)]);
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.waitForSelector('#mini-welcome-name', { timeout: 4000 }).then(() => true, () => false)) {
    await page.fill('#mini-welcome-name', 'Obra WhatsApp'); await page.click('.mini-welcome-submit');
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__sent = []; window.open = url => { window.__sent.push(url); return null; }; });
  return { context, page, errors };
}

// Written independently of the app: this is the format the importer expects.
function expectedMessage(dateKey) {
  const [y, m, d] = dateKey.split('-');
  const dateStr = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return `*Asistencia de hoy ${dateStr}*\n_Última actualización: 9:15 a. m._\n\n1. Juan Pérez  *8h*\n2. María Gómez  *10h*\n`;
}
const sentMessages = page => page.evaluate(() => window.__sent.map(u => decodeURIComponent(u.replace('https://wa.me/?text=', ''))));
const goTo = (page, key) => page.evaluate(k => { selectedDate = k; updateDashboard(); }, key);

test('today and yesterday: sent directly, message byte-for-byte the original format', async () => {
  const { context, page, errors } = await device();
  try {
    for (const n of [0, 1]) {
      await goTo(page, daysAgo(n));
      await page.click('.whatsapp-cta');
      await page.waitForTimeout(200);
      assert.equal(await page.isVisible('#modal-confirm.active'), false, 'no warning for ' + n + ' days');
    }
    assert.deepEqual(await sentMessages(page), [expectedMessage(daysAgo(0)), expectedMessage(daysAgo(1))]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('8 days ago: soft warning; "Enviar ese día" sends the same format, "Ir a hoy" sends nothing', async () => {
  const { context, page, errors } = await device();
  try {
    await goTo(page, daysAgo(8));
    await page.click('.whatsapp-cta');
    await page.waitForSelector('#modal-confirm.active');
    assert.match(await page.textContent('#confirm-message'), /hace 8 días/);
    assert.equal(await page.textContent('#confirm-cancel'), 'Ir a hoy');
    assert.match(await page.getAttribute('#confirm-ok', 'class'), /btn-primary/, 'soft, not red');
    await page.click('#confirm-ok');
    await page.waitForTimeout(200);
    assert.deepEqual(await sentMessages(page), [expectedMessage(daysAgo(8))]);

    await page.click('.whatsapp-cta');
    await page.waitForSelector('#modal-confirm.active');
    await page.click('#confirm-cancel');
    await page.waitForTimeout(200);
    assert.equal((await sentMessages(page)).length, 1, 'nothing more was sent');
    assert.equal(await page.evaluate(() => selectedDate), daysAgo(0), 'back to today');
    assert.equal(await page.textContent('#confirm-cancel'), 'Ir a hoy');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('more than a month or a future day: strong warning; other confirms keep "Cancelar"', async () => {
  const { context, page } = await device();
  try {
    await goTo(page, daysAgo(45));
    await page.click('.whatsapp-cta');
    await page.waitForSelector('#modal-confirm.active');
    assert.match(await page.textContent('#confirm-title'), /más de un mes/i);
    assert.match(await page.getAttribute('#confirm-ok', 'class'), /btn-danger/);
    await page.click('#confirm-ok');
    await page.waitForTimeout(200);
    assert.deepEqual(await sentMessages(page), [expectedMessage(daysAgo(45))]);

    await goTo(page, daysAgo(-3));
    await page.click('.whatsapp-cta');
    await page.waitForSelector('#modal-confirm.active');
    assert.match(await page.textContent('#confirm-message'), /todavía no pasó/);
    await page.click('#confirm-cancel');

    await page.evaluate(() => { showConfirm('¿Seguro?'); });
    assert.equal(await page.textContent('#confirm-cancel'), 'Cancelar', 'the label resets for other dialogs');
  } finally { await context.close(); }
});
