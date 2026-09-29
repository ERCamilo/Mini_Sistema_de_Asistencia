// tests/e2e/storage-v2.e2e.mjs — storage v2 migration on a real browser (IndexedDB).
// A Mini that is full on v1 (localStorage) must move its attendance to IndexedDB
// without losing a single mark, free localStorage and keep working after reloads.
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

after(async () => {
  await browser?.close();
  server?.close();
});

// ~60 employees x every workday of `months`: close to the 5 MB localStorage cap.
function seedV1({ months, employees, extra }) {
  const users = [...Array(employees)].map((_, i) => ({ id: 'u' + i, name: 'Empleado ' + (i + 1), number: String(i + 1), position: 'Ayudante' }));
  const attendance = {};
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() - months, 1, 12);
  const keyOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayKey = keyOf(today);
  // Up to yesterday: the test marks today itself.
  for (let d = first; keyOf(d) < todayKey; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    const key = keyOf(d);
    attendance[key] = {};
    for (const u of users) attendance[key][u.id] = { status: 'present', hours: 8, schemaVersion: 1, localOnly: true, createdAt: key + 'T12:00:00.000Z', updatedAt: key + 'T12:00:00.000Z' };
  }
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.setItem('attendance', extra === 'corrupt' ? '{"2026-01-01": {broken' : JSON.stringify(attendance));
  localStorage.setItem('attendance_tombstones', JSON.stringify([{ date: '2020-01-01', employeeId: 'gone', type: 'attendance', deletedAt: '2020-01-02T00:00:00.000Z', schemaVersion: 1 }]));
  localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
  localStorage.setItem('storageHelpSnoozedUntil', String(Date.now() + 864e5));
  if (extra === 'off') localStorage.setItem('miniDataV2', 'off');
  return Object.keys(attendance).length;
}

async function device() {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return { context, page, errors };
}

async function openApp(page, { name = true } = {}) {
  await page.goto(base, { waitUntil: 'networkidle' });
  if (name && await page.isVisible('#mini-welcome-name')) {
    await page.fill('#mini-welcome-name', 'Mini V2');
    await page.click('.mini-welcome-submit');
  }
  await page.waitForFunction(() => typeof attendanceRepository !== 'undefined' && document.querySelector('#users-container'));
  await page.waitForTimeout(400);
}

const idbState = page => page.evaluate(async () => {
  const backend = await window.MiniData.openIdbBackend(indexedDB);
  const all = await backend.readAll();
  return { days: Object.keys(all.days).length, migration: all.meta.migration, hasBackup: !!(all.meta.v1Backup && all.meta.v1Backup.attendance) };
});

test('a full v1 Mini moves its attendance to IndexedDB: nothing lost, localStorage freed, marks survive reloads', async () => {
  const { context, page, errors } = await device();
  try {
    await page.goto(base + 'manifest.json');
    const seededDays = await page.evaluate(seedV1, { months: 16, employees: 60 });
    const usedBefore = await page.evaluate(() => Object.keys(localStorage).reduce((n, k) => n + k.length + localStorage.getItem(k).length, 0));
    assert.ok(usedBefore > 3_000_000, `seed should be near the cap (${usedBefore} chars)`);

    await openApp(page);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), true, 'v2 active');
    assert.equal(await page.evaluate(() => Object.keys(attendanceRepository.getAll()).length), seededDays, 'every day is there');
    const state = await idbState(page);
    assert.equal(state.days, seededDays);
    assert.equal(state.migration.state, 'verified');
    assert.equal(state.hasBackup, true, 'raw v1 copy kept');
    assert.equal(await page.evaluate(() => localStorage.getItem('attendance')), null, 'localStorage freed');
    const usedAfter = await page.evaluate(() => Object.keys(localStorage).reduce((n, k) => n + k.length + localStorage.getItem(k).length, 0));
    assert.ok(usedAfter < 100_000, `localStorage should be small now (${usedAfter} chars)`);

    // Mark today and change hours, then reload twice.
    await page.click('#nav-attendance');
    await page.click('.user-card:nth-child(1) .check-box');
    await page.evaluate(() => { const rec = getRecord('u0'); if (!rec) throw new Error('not marked'); });
    await page.waitForTimeout(300);
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof attendanceRepository !== 'undefined');
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => (getRecord('u0') || {}).hours), 8, 'the new mark survives reload ' + (i + 1));
      assert.equal(await page.evaluate(() => Object.keys(attendanceRepository.getAll()).length), seededDays + 1);
    }
    assert.equal((await idbState(page)).migration.state, 'verified');
    assert.equal(await page.evaluate(() => localStorage.getItem('attendance')), null, 'attendance never goes back to localStorage');

    // Backups still include everything.
    const backup = await page.evaluate(() => captureLocalSnapshot());
    assert.equal(Object.keys(backup.attendance).length, seededDays + 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('marking works on a device that was already full (the reason for v2)', async () => {
  const { context, page, errors } = await device();
  try {
    await page.goto(base + 'manifest.json');
    await page.evaluate(seedV1, { months: 20, employees: 60 });
    await openApp(page);
    await page.click('#nav-attendance');
    for (const n of [1, 2, 3]) await page.click(`.user-card:nth-child(${n}) .check-box`);
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    for (const id of ['u0', 'u1', 'u2']) assert.equal(await page.evaluate(uid => (getRecord(uid) || {}).hours, id), 8);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('corrupted v1 JSON: the device stays on v1 and nothing is deleted', async () => {
  const { context, page } = await device();
  try {
    await page.goto(base + 'manifest.json');
    await page.evaluate(seedV1, { months: 1, employees: 3, extra: 'corrupt' });
    await openApp(page);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), false);
    assert.match(await page.evaluate(() => localStorage.getItem('attendance')), /broken/, 'v1 data untouched');
    assert.notEqual((await idbState(page)).migration?.state, 'verified');
  } finally {
    await context.close();
  }
});

test('miniDataV2=off keeps the device on v1 (escape hatch)', async () => {
  const { context, page, errors } = await device();
  try {
    await page.goto(base + 'manifest.json');
    const days = await page.evaluate(seedV1, { months: 1, employees: 3, extra: 'off' });
    await openApp(page);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), false);
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('attendance'))).length), days);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('when the old IndexedDB snapshot is the newest copy, the migration uses it', async () => {
  const { context, page, errors } = await device();
  try {
    await page.goto(base + 'manifest.json');
    await page.evaluate(seedV1, { months: 1, employees: 3, extra: 'off' });
    // Run once on v1 so the legacy IndexedDB snapshot exists, then add a day only there.
    await openApp(page);
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      const state = await localDb.readState();
      state.attendance['2019-05-05'] = { u0: { status: 'present', hours: 7 } };
      await localDb.writeState(state);
      localStorage.removeItem('miniDataV2');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), true);
    assert.equal(await page.evaluate(() => (attendanceRepository.getRecord('u0', '2019-05-05') || {}).hours), 7);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

async function confirmStorageToggle(page) {
  await page.evaluate(() => { switchView('more'); setMoreTab('settings'); });
  await page.click('#btn-storage-mode');
  await page.click('#modal-confirm.active #confirm-ok');
  await page.waitForLoadState('load');
  await page.waitForFunction(() => typeof usingMiniDataV2 === 'function' && document.querySelector('#users-container'));
  await page.waitForTimeout(800);
}

test('Ajustes: back to the old storage and forward again, keeping every mark (round trip)', async () => {
  const { context, page, errors } = await device();
  try {
    await page.goto(base + 'manifest.json');
    const days = await page.evaluate(seedV1, { months: 2, employees: 5 });
    await openApp(page);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), true);
    await page.evaluate(() => { switchView('more'); setMoreTab('settings'); });
    assert.match(await page.textContent('#storage-mode-hint'), new RegExp(days + ' días'));

    await confirmStorageToggle(page);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), false, 'now on v1');
    assert.equal(await page.evaluate(() => Object.keys(attendanceRepository.getAll()).length), days, 'every day is back in v1');
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('attendance'))).length), days);

    // A mark made while on v1 must survive going back to v2.
    await page.evaluate(() => { switchView('attendance'); });
    await page.click('.user-card:nth-child(1) .check-box');
    await page.waitForTimeout(300);

    await confirmStorageToggle(page);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), true, 'v2 again');
    assert.equal(await page.evaluate(() => Object.keys(attendanceRepository.getAll()).length), days + 1);
    assert.equal(await page.evaluate(() => (getRecord('u0') || {}).hours), 8, 'the v1 mark made it to v2');
    assert.equal(await page.evaluate(() => localStorage.getItem('attendance')), null);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('if the data does not fit in the old storage, Mini stays on v2 and loses nothing', async () => {
  const { context, page } = await device();
  try {
    await page.goto(base + 'manifest.json');
    await page.evaluate(seedV1, { months: 14, employees: 60 });
    await openApp(page);
    // Grow v2 beyond what localStorage can hold (~5 MB).
    const total = await page.evaluate(async () => {
      const extra = {};
      for (let m = 1; m <= 12; m++) for (let d = 1; d <= 26; d++) {
        const date = `2019-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        extra[date] = {};
        for (let i = 0; i < 60; i++) extra[date]['u' + i] = { status: 'present', hours: 8 };
      }
      attendanceRepository.importBatch(extra, 'merge');
      await new Promise(r => setTimeout(r, 1500));
      return Object.keys(attendanceRepository.getAll()).length;
    });
    await confirmStorageToggle(page);
    assert.equal(await page.evaluate(() => usingMiniDataV2()), true, 'stays on v2');
    assert.equal(await page.evaluate(() => Object.keys(attendanceRepository.getAll()).length), total, 'nothing lost');
    assert.equal(await page.evaluate(k => localStorage.getItem(k), 'miniDataV2'), null, 'the flag was cleared');
    assert.equal(await page.evaluate(() => localStorage.getItem('attendance')), null, 'no half copy left in localStorage');
  } finally {
    await context.close();
  }
});

test('with v2, a tap no longer rewrites the whole attendance into the old snapshot', async () => {
  const { context, page, errors } = await device();
  try {
    await page.goto(base + 'manifest.json');
    await page.evaluate(seedV1, { months: 2, employees: 5 });
    await openApp(page);
    await page.waitForTimeout(800);
    await page.click('.user-card:nth-child(2) .check-box');
    await page.waitForTimeout(1200);
    const snap = await page.evaluate(async () => { const s = await localDb.readState(); return s ? Object.keys(s.attendance || {}).length : null; });
    assert.equal(snap, 0);
    const backup = await page.evaluate(() => Object.keys(captureLocalSnapshot().attendance).length);
    assert.ok(backup > 0, 'backups still include the attendance');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
