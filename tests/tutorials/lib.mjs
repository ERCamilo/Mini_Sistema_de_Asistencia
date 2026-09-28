// tests/tutorials/lib.mjs
// Tutorial engine: runs a tutorial script in one of two modes.
//   test   → fast, no video; every step and assertion must pass (npm run test:e2e, CI).
//   record → same steps at human pace, with a finger and an orange ring on each
//            target, filmed with Playwright's recordVideo (npm run tutorials).
// The script's captions are returned with their times (seconds from video start).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT_DIR = path.join(ROOT, 'tutorials');
export const PHONE = { width: 390, height: 844 };
export const Tutorials = createRequire(import.meta.url)(path.join(ROOT, 'tutorials.js'));

const RING = '#ff8a00';
// Voice hook: when voices exist, a caption lasts at least its audio. None yet.
const voiceMs = () => 0;

export async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { candidates.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright', 'index.mjs')); } catch { /* no global npm */ }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      return await import(candidate.startsWith('/') ? pathToFileURL(candidate).href : candidate);
    } catch { /* try next */ }
  }
  throw new Error('Playwright no está instalado. Instalalo (npm i -g playwright) o definí PLAYWRIGHT_MODULE.');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webm': 'video/webm', '.vtt': 'text/vtt' };

export function serve(dir = ROOT) {
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (file.endsWith('/')) file += 'index.html';
    fs.readFile(path.join(dir, file), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      // Range requests, like GitHub Pages: without them a <video> cannot seek.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
        res.end(data.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': data.length });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

export function readRecorded(id) {
  try { return JSON.parse(fs.readFileSync(path.join(OUT_DIR, id + '.json'), 'utf8')); } catch { return null; }
}

// --- Data helpers (run in the page, before the app loads; never filmed) ---

// n employees with names and positions, in the stored shape.
export function seedEmployees(n) {
  const names = ['Juan Pérez', 'María Gómez', 'Carlos Díaz', 'Ana Torres', 'Luis Romero', 'Sofía Herrera', 'Pedro Castro', 'Lucía Méndez'];
  const positions = ['Oficial', 'Ayudante', 'Maestro mayor', 'Electricista'];
  return [...Array(n)].map((_, i) => ({ id: 'u' + i, name: names[i] || 'Empleado ' + (i + 1), number: String(i + 1), position: positions[i % positions.length] }));
}

// --- Visual layer (record mode only) ---

async function overlay(page, fn, arg) {
  try { await page.evaluate(fn, arg); } catch { /* page navigating: skip the effect */ }
}

function showRing({ box, color }) {
  let ring = document.getElementById('__tut-ring');
  if (!ring) {
    ring = document.createElement('div');
    ring.id = '__tut-ring';
    ring.style.cssText = `position:fixed;z-index:20001;pointer-events:none;border:3px solid ${color};border-radius:14px;box-shadow:0 0 0 4px rgba(255,138,0,.25);transition:all .35s ease;opacity:0`;
    document.body.appendChild(ring);
  }
  const pad = 6;
  Object.assign(ring.style, { left: box.x - pad + 'px', top: box.y - pad + 'px', width: box.width + pad * 2 + 'px', height: box.height + pad * 2 + 'px', opacity: '1' });
}

function hideRing() {
  const ring = document.getElementById('__tut-ring');
  if (ring) ring.style.opacity = '0';
}

function moveFinger({ x, y }) {
  let finger = document.getElementById('__tut-finger');
  if (!finger) {
    finger = document.createElement('div');
    finger.id = '__tut-finger';
    finger.style.cssText = 'position:fixed;z-index:20002;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(0,0,0,.45);transition:left .5s ease,top .5s ease,transform .15s;left:50%;top:110%';
    document.body.appendChild(finger);
  }
  finger.style.left = x + 'px';
  finger.style.top = y + 'px';
}

function pressFinger({ x, y }) {
  const finger = document.getElementById('__tut-finger');
  if (finger) { finger.style.transform = 'scale(.8)'; setTimeout(() => { finger.style.transform = ''; }, 160); }
  const wave = document.createElement('div');
  wave.style.cssText = `position:fixed;z-index:20001;pointer-events:none;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,138,0,.9);transition:transform .5s,opacity .5s`;
  document.body.appendChild(wave);
  requestAnimationFrame(() => { wave.style.transform = 'scale(1.8)'; wave.style.opacity = '0'; });
  setTimeout(() => wave.remove(), 600);
}

// --- Runner ---

function locate(page, target) {
  if (typeof target === 'string') return page.locator(target).first();
  if (target && target.sel) return page.locator(target.sel, { hasText: target.text }).first();
  throw new Error('Objetivo inválido: ' + JSON.stringify(target));
}

function readingMs(text) {
  return Math.min(4200, Math.max(1400, text.length * 55));
}

// Prepares a named device with the tutorial's data; returns its storage state.
async function prepareDevice(browser, base, tutorial) {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.goto(base + 'manifest.json');
    if (tutorial.seed) await page.evaluate(tutorial.seed.fn, tutorial.seed.arg ?? null);
    // Recorded devices are not "first run": the auto-opened tutorial would cover the app.
    await page.evaluate(() => localStorage.setItem('tutorialsSeen', JSON.stringify(['marcar-asistencia'])));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.fill('#mini-welcome-name', 'Mini Obra Norte');
    await page.click('.mini-welcome-submit');
    await page.waitForTimeout(400);
    // Tutorials start on the home screen; the full-storage popup is its own flow.
    await page.evaluate(() => localStorage.setItem('storageHelpSnoozedUntil', String(Date.now() + 864e5)));
    return await context.storageState({ indexedDB: true });
  } finally {
    await context.close();
  }
}

export async function runTutorial(tutorial, { browser, base, mode = 'test', videoDir }) {
  const record = mode === 'record';
  const state = await prepareDevice(browser, base, tutorial);
  // No service worker: its first activation reloads the app mid-step.
  const context = await browser.newContext({
    viewport: PHONE,
    serviceWorkers: 'block',
    storageState: state,
    acceptDownloads: true,
    ...(record ? { recordVideo: { dir: videoDir, size: PHONE } } : {})
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const captions = [];

  const pause = ms => (record ? page.waitForTimeout(ms) : Promise.resolve());
  const closeCaption = () => { const last = captions[captions.length - 1]; if (last && last.end == null) last.end = now(); };

  const api = {
    page,
    phone: true,
    assert,
    async say(text, wait = 0) {
      closeCaption();
      captions.push({ start: now(), end: null, text });
      await pause(Math.max(voiceMs(text), readingMs(text)) + wait);
    },
    async point(target, ms = 900) {
      const el = locate(page, target);
      await el.waitFor({ state: 'visible', timeout: 8000 });
      if (!record) return;
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      await overlay(page, showRing, { box, color: RING });
      await overlay(page, moveFinger, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await pause(ms);
    },
    async tap(target, { ring = true } = {}) {
      const el = locate(page, target);
      await el.waitFor({ state: 'visible', timeout: 8000 });
      if (record) {
        await el.scrollIntoViewIfNeeded();
        const box = await el.boundingBox();
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (ring) await overlay(page, showRing, { box, color: RING });
        await overlay(page, moveFinger, center);
        await pause(750);
        await overlay(page, pressFinger, center);
        await pause(120);
        await el.click();
        await overlay(page, hideRing);
        await pause(650);
      } else {
        await el.click();
        await page.waitForTimeout(80);
      }
    },
    async type(target, text) {
      const el = locate(page, target);
      await el.waitFor({ state: 'visible', timeout: 8000 });
      if (record) {
        await el.click();
        await el.pressSequentially(text, { delay: 75 });
        await pause(300);
      } else {
        await el.fill(text);
      }
    },
    async key(name) {
      await page.keyboard.press(name);
      await pause(400);
    },
    pause,
    // Runs `action` and returns the parsed JSON of the file it downloads.
    async download(action) {
      const pending = page.waitForEvent('download', { timeout: 10000 });
      await action();
      const file = await pending;
      return JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
    }
  };

  let videoPath = null;
  try {
    await page.setContent('<body style="margin:0;background:#0b1020"></body>');
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(record ? 700 : 150);
    await tutorial.steps(api);
    closeCaption();
    await pause(1600);
    assert.deepEqual(errors, [], 'no page errors');
    if (record) videoPath = await page.video().path();
    const duration = now();
    captions[captions.length - 1].end = Math.max(captions[captions.length - 1].end, duration - 0.1);
    return { captions: captions.map(c => ({ start: round(c.start), end: round(c.end), text: c.text })), duration: round(duration), videoPath };
  } finally {
    await context.close();
  }
}

const round = n => Math.round(n * 100) / 100;
