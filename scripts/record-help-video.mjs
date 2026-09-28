// scripts/record-help-video.mjs
// End-to-end test that doubles as the in-app help video.
// It seeds a Mini whose storage is almost full, opens the app, follows the
// "Hazlo conmigo" tour like a user (tapping the highlighted controls), asserts
// every outcome and records the run to help/liberar-espacio.webm with captions.
//
//   npm run help:video            (needs Playwright + Chromium installed)
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run help:video
//
// Re-run it whenever the storage/help UI changes so the video never goes stale.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(root, 'help', 'liberar-espacio.webm');
const VIEW = { width: 390, height: 844 };
const EMPLOYEES = 60;
const FIRST_DAY = '2025-03-01';

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { candidates.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright', 'index.mjs')); } catch { /* no global npm */ }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      return await import(candidate.startsWith('/') ? pathToFileURL(candidate).href : candidate);
    } catch { /* try next */ }
  }
  throw new Error('Playwright no está instalado. Instalalo (npm i -g playwright) o definí PLAYWRIGHT_MODULE.');
}

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webm': 'video/webm' };
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (file.endsWith('/')) file += 'index.html';
    fs.readFile(path.join(dir, file), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

// Seeds ~60 employees x every workday since FIRST_DAY, in the stored shape.
function seedFullDevice({ employees, firstDay }) {
  const users = [...Array(employees)].map((_, i) => ({ id: 'u' + i, name: 'Empleado ' + (i + 1), number: String(i + 1), position: 'Ayudante' }));
  const attendance = {};
  const today = new Date();
  for (let d = new Date(firstDay + 'T12:00:00'); d <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    attendance[key] = {};
    for (const u of users) attendance[key][u.id] = { status: 'present', hours: 8, schemaVersion: 1, localOnly: true, createdAt: key + 'T12:00:00.000Z', updatedAt: key + 'T12:00:00.000Z' };
  }
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.setItem('attendance', JSON.stringify(attendance));
  return Object.keys(attendance).length;
}

async function caption(page, text) {
  await page.evaluate(message => {
    let bar = document.getElementById('__help-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = '__help-caption';
      bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:92px;z-index:20000;padding:12px 14px;border-radius:14px;background:rgba(0,0,0,.82);color:#fff;font:600 15px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;transition:opacity .2s';
      document.body.appendChild(bar);
    }
    bar.textContent = message || '';
    bar.style.opacity = message ? '1' : '0';
  }, text);
}

// Tap like a finger: show a ripple where the user taps, then click.
async function tap(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, 'target must be visible: ' + selector);
  await page.evaluate(({ x, y }) => {
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid rgba(0,200,255,.9);z-index:20001;pointer-events:none;transition:transform .45s,opacity .45s`;
    document.body.appendChild(dot);
    requestAnimationFrame(() => { dot.style.transform = 'scale(1.6)'; dot.style.opacity = '0'; });
    setTimeout(() => dot.remove(), 600);
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await page.waitForTimeout(350);
  await page.locator(selector).first().click();
}

const usage = page => page.evaluate(() => describeStorageUsage().pct);
const dayKeys = page => page.evaluate(() => Object.keys(attendanceRepository.getAll()).sort());

async function main() {
  const { chromium } = await loadPlaywright();
  const server = await serve(root);
  const base = `http://localhost:${server.address().port}/`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-help-'));
  const browser = await chromium.launch();
  try {
    // 1) Prepare a named, almost-full device (not recorded).
    const setup = await browser.newContext({ viewport: VIEW });
    const prep = await setup.newPage();
    await prep.goto(base + 'manifest.json');
    const seededDays = await prep.evaluate(seedFullDevice, { employees: EMPLOYEES, firstDay: FIRST_DAY });
    await prep.goto(base, { waitUntil: 'networkidle' });
    await prep.fill('#mini-welcome-name', 'Mini Obra Norte');
    await prep.click('.mini-welcome-submit');
    await prep.waitForTimeout(500);
    await prep.evaluate(key => localStorage.removeItem(key), 'storageHelpSnoozedUntil');
    const state = await setup.storageState({ indexedDB: true });
    await setup.close();

    // 2) Recorded run: this is both the test and the tutorial.
    const context = await browser.newContext({ viewport: VIEW, storageState: state, acceptDownloads: true, recordVideo: { dir: work, size: VIEW } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Dark first frame instead of a white page while the app loads.
    await page.setContent('<body style="margin:0;background:#0b1020"></body>');
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#modal-storage-help.active', { timeout: 10000 });
    const before = await usage(page);
    assert.ok(before >= 80, `seeded usage should trigger the popup (got ${before}%)`);
    await caption(page, `Al abrir, Mini avisa: el espacio está al ${before}%.`);
    await page.waitForTimeout(3000);
    await caption(page, 'Tocá "Hazlo conmigo" y seguí los pasos.');
    await page.waitForTimeout(1500);
    await tap(page, '#btn-storage-tour');

    const tourStep = async (selector, text, wait = 1800) => {
      await page.waitForSelector('.guided-tour-bubble', { timeout: 5000 });
      // During the tour the app's own bubble is the caption: the video shows
      // exactly what the user sees. `text` documents the step in this script.
      await caption(page, null);
      await page.waitForTimeout(wait);
      await tap(page, selector);
      await page.waitForTimeout(700);
    };
    await tourStep('#nav-more', '1. Abrí "Más".');
    await tourStep('#btn-more-tab-data', '2. Entrá a la pestaña "Datos".');
    const backupDownload = page.waitForEvent('download');
    await tourStep('#btn-download-backup', '3. Guardá un respaldo completo primero.');
    const backup = await backupDownload;
    const backupPath = path.join(work, backup.suggestedFilename());
    await backup.saveAs(backupPath);
    await tourStep('#btn-archive-months', '4. Tocá "Archivar meses antiguos".');
    const keptBefore = (await dayKeys(page)).length;
    const archiveDownload = page.waitForEvent('download');
    await tourStep('#btn-archive-keep-3', '5. Elegí mantener 3 meses.', 2400);
    await tourStep('#btn-archive-run', '6. Tocá "Guardar archivo y archivar".', 2400);
    const archive = await archiveDownload;
    const archivePath = path.join(work, archive.suggestedFilename());
    await archive.saveAs(archivePath);
    await tourStep('#modal-confirm.active .btn-danger', '7. Con el archivo guardado, confirmá "Archivar".', 2400);
    await tourStep('#btn-more-tab-settings', '8. Volvé a "Ajustes".');
    await tourStep('#btn-free-storage', '9. Tocá "Liberar espacio" para ver el uso.');
    const after = await usage(page);
    await caption(page, `¡Listo! El espacio bajó de ${before}% a ${after}%. Tus datos quedaron guardados.`);
    await page.waitForTimeout(3500);

    // 3) Assertions: the tutorial only ships if every step really worked.
    const remaining = await dayKeys(page);
    const archived = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    const fullBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.equal(Object.keys(fullBackup.attendance).length, seededDays, 'full backup has every day');
    assert.equal(archived.kind, 'mini-archive');
    assert.equal(remaining.length + Object.keys(archived.attendance).length, keptBefore, 'no day lost: kept + archived = before');
    assert.ok(remaining[0] >= archived.range.to, 'kept days are newer than archived ones');
    assert.ok(after < 60, `usage must drop below 60% (got ${after}%)`);
    assert.equal(await page.evaluate(() => localStorage.getItem('attendance_tombstones')), null, 'archiving must not create tombstones');
    assert.equal(await page.evaluate(() => users.length), EMPLOYEES, 'employees untouched');
    assert.deepEqual(errors, [], 'no page errors');

    const videoPath = await page.video().path();
    await context.close();
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.copyFileSync(videoPath, OUTPUT);
    const kb = Math.round(fs.statSync(OUTPUT).size / 1024);
    console.log(`OK: ${before}% -> ${after}%, ${Object.keys(archived.attendance).length} days archived, ${remaining.length} kept.`);
    console.log(`Video: ${path.relative(root, OUTPUT)} (${kb} KB)`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});
