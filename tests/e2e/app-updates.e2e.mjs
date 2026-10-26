// Real application + real service worker. Two published builds on a local server.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { servePublishedRelease, hashAsset } from './update-release-fixture.mjs';
import { loadPlaywright, ROOT, PHONE } from '../tutorials/lib.mjs';
const require = createRequire(import.meta.url), policy = require('../../app-version.js');
const nextVersion = policy.APP_VERSION.replace(/\d+$/, n => String(Number(n) + 1));
const release = { version: nextVersion, date: '2026-10-20', title: 'Actualización de prueba', items: ['Mejora de prueba <img src=x onerror=alert(1)>'] };
let browser, server, base, published = false, invalid = false, unavailable = false, staleNavigation = false, incomingRequests = 0;
before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://test'), rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if(unavailable&&rel==='app-updates.css'&&url.searchParams.has('__v')){res.writeHead(503).end();return;}
    if(staleNavigation&&rel==='index.html'&&!url.search){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Stale application</title>');return;}
    let body;
    try { body = fs.readFileSync(path.join(ROOT, rel)); } catch { res.writeHead(404).end(); return; }
    if (rel === 'sw.js') body = body.toString().replace(/const CACHE_VERSION = '[^']*'/, `const CACHE_VERSION = 'mini-update-test-${published ? 2 : 1}'`);
    if (rel === 'app-release.json') {
      if (url.searchParams.has('__incoming')) incomingRequests++;
      body = JSON.stringify(invalid ? {} : { version: published ? nextVersion : policy.APP_VERSION, changelog: published ? [release, ...policy.CHANGELOG] : policy.CHANGELOG });
    }
    if (published && rel === 'app-version.js') body = body.toString().replace(`const APP_VERSION = '${policy.APP_VERSION}'`, `const APP_VERSION = '${nextVersion}'`).replace('const CHANGELOG = [', 'const CHANGELOG = [' + JSON.stringify(release) + ',');
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(rel)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  const { chromium } = await loadPlaywright(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

test('primera instalación, dos versiones, posponer, guardado fallido y recarga explícita sin perder empleados', async () => {
  const context = await browser.newContext({ viewport: PHONE }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base + 'manifest.json');
    await page.evaluate(() => {
      localStorage.setItem('users', JSON.stringify([{ id: 'a', number: '22', name: 'Ana', position: 'Ayudante', sueldo: '900' }]));
      localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
      localStorage.setItem('storageHelpSnoozedUntil', String(Date.now() + 86400000));
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.fill('#mini-welcome-name', 'Actualizaciones'); await page.click('.mini-welcome-submit');
    await page.waitForFunction(() => localDbReady && !!navigator.serviceWorker.controller);
    assert.equal(await page.locator('.release-modal.active').count(), 0, 'first controller claim is silent');
    const original = await page.evaluate(() => employeeRepository.getAll());
    const loaded = await page.evaluate(() => { window.__pageMarker = 'original'; return window.MiniAppVersion.APP_VERSION; });
    assert.equal(loaded, policy.APP_VERSION);
    assert.equal(await page.textContent('#mini-version'), 'v' + policy.APP_VERSION);
    // The normal cached JSON is the old release. The incoming query must bypass it.
    published = true;
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); }); await page.waitForSelector('#update-modal.active');
    assert.match(await page.textContent('#update-modal'), /Actualización de prueba/);
    assert.equal(await page.locator('#update-modal img').count(), 0, 'release text is never HTML');
    assert.equal(await page.evaluate(() => window.__pageMarker), 'original');
    await page.click('#update-modal .btn-secondary');
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    assert.equal(await page.locator('.release-modal.active').count(), 0, 'postponed build stays silent');
    await page.evaluate(() => window.MiniUpdates.check()); await page.waitForSelector('#update-modal.active');
    await page.evaluate(async () => { await localDbWriteQueue; window.__realWrite = localDb.writeState.bind(localDb); localDb.writeState = async () => { throw new Error('disk unavailable'); }; });
    await page.click('[data-release-apply]');
    await page.waitForFunction(() => document.querySelector('#update-modal [data-release-status]').textContent.includes('No se pudo actualizar'));
    assert.equal(await page.evaluate(() => window.__pageMarker), 'original', 'failed persistence cannot reload');
    unavailable = true;
    await page.evaluate(() => { localDb.writeState = window.__realWrite; }); await page.click('[data-release-apply]');
    await page.waitForFunction(() => document.querySelector('#update-modal [data-release-status]').textContent.includes('Revisa tu conexión'));
    assert.equal(await page.evaluate(() => window.__pageMarker), 'original', 'download failure cannot reload'); unavailable = false;
    await page.evaluate(() => { const gate = new Promise(resolve => window.__finishWrite = resolve); localDb.writeState = async snapshot => { window.__saving = true; await gate; return window.__realWrite(snapshot); }; });
    await page.click('[data-release-apply]'); await page.waitForFunction(() => window.__saving);
    assert.equal(await page.evaluate(() => window.__pageMarker), 'original', 'pending real snapshot write cannot reload');
    await page.evaluate(async oldSource => {
      const name=(await caches.keys()).find(name=>name==='mini-update-test-2');
      const cache=await caches.open(name);
      await cache.put(new URL('./app-version.js',location.href).href,new Response(oldSource,{headers:{'Content-Type':'text/javascript'}}));
      await cache.put(new URL('./stale-shell-entry',location.href).href,new Response('obsolete'));
      const tutorials=await caches.open('mini-tutorials-saved');
      await tutorials.put(new URL('./saved-video',location.href).href,new Response('preserved'));
    },fs.readFileSync(path.join(ROOT,'app-version.js'),'utf8'));
    staleNavigation = true;
    await page.evaluate(() => window.__finishWrite());
    await page.waitForFunction(v => window.MiniAppVersion?.APP_VERSION === v && !window.__pageMarker, nextVersion).catch(async error=>{console.error('Update state',await page.evaluate(async()=>({version:MiniAppVersion.APP_VERSION,status:document.querySelector('#update-modal [data-release-status]')?.textContent,caches:await caches.keys(),worker:navigator.serviceWorker.controller?.scriptURL})));throw error;});
    await page.waitForFunction(() => localDbReady); await page.waitForSelector('#update-success:not([hidden])');
    staleNavigation = false; // Only the immediate update must resist the stale canonical page.
    assert.equal(await page.locator('#update-success svg circle').count(), 1);
    assert.equal(await page.locator('.release-modal.active').count(), 0);
    if (process.env.UPDATE_SUCCESS_EVIDENCE) await page.screenshot({ path: path.join(process.env.UPDATE_SUCCESS_EVIDENCE, 'success-real-worker.png') });
    assert.equal(await page.textContent('#mini-version'), 'v' + nextVersion);
    assert.deepEqual(await page.evaluate(() => employeeRepository.getAll()), original);
    assert.equal(await page.evaluate(async()=>!!(await (await caches.open('mini-tutorials-saved')).match(new URL('./saved-video',location.href).href))),true);
    assert.equal(await page.evaluate(async()=>!!(await caches.match(new URL('./stale-shell-entry',location.href).href))),false);
    await page.waitForSelector('#update-success', { state: 'hidden' });
    assert.equal(await page.locator('.release-modal.active').count(), 0, 'successful update needs no second acceptance');
    assert.equal(await page.evaluate(() => localStorage.getItem('mini:lastSeenVersion')), nextVersion);
    assert.equal(await page.evaluate(() => currentView), 'attendance');
    for (const theme of ['dark', 'light', 'contrast', 'ocean', 'sol']) {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.evaluate(t => { applyTheme(t); window.MiniUpdates.showNews(); }, theme);
      const box = await page.locator('#whats-new-modal .modal-content').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 321 && box.height <= 640, `fits screen in ${theme}`);
      const heights = await page.locator('#whats-new-modal button').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
      assert.ok(heights.every(h => h >= 44));
      if (process.env.AXE_PATH) {
        // Theme checks reload the page; load the auditor into the current document.
        await page.addScriptTag({ path: process.env.AXE_PATH });
        assert.deepEqual(await page.evaluate(async () => (await axe.run('#whats-new-modal', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))), []);
      }
      assert.doesNotMatch(await page.textContent('#whats-new-modal'), /\b(?:SA|TURN|STUN|roster|IndexedDB)\b/);
      await page.click('#whats-new-modal button'); await page.waitForSelector('#whats-new-modal.active', { state: 'hidden' });
      if (['dark', 'light'].includes(theme)) {
        await page.evaluate(async t => { setTheme(t); await localDbWriteQueue; }, theme);
        await page.emulateMedia({ reducedMotion: theme === 'light' ? 'reduce' : 'no-preference' });
        await page.evaluate(({ from, target }) => sessionStorage.setItem('mini:updateReceipt', JSON.stringify({ from, target })), { from: policy.APP_VERSION, target: nextVersion });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#update-success:not([hidden])');
        assert.equal(await page.getAttribute('html', 'data-theme'), theme, 'success uses the persisted theme after reload');
        const success = page.locator('#update-success');
        await success.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
        const size = await page.locator('.update-success-check').boundingBox();
        assert.ok(size.width >= 144 && size.x >= 0 && size.x + size.width <= 320);
        assert.equal(await success.getAttribute('role'), 'status');
        if (theme === 'light') assert.equal(await page.locator('.update-success-check path').evaluate(el => getComputedStyle(el).animationName), 'none');
        if (process.env.UPDATE_SUCCESS_EVIDENCE) await page.screenshot({ path: path.join(process.env.UPDATE_SUCCESS_EVIDENCE, `success-${theme}.png`) });
        await page.waitForSelector('#update-success', { state: 'hidden' });
        assert.equal(await page.locator('.release-modal.active').count(), 0);
      }
    }
    await page.waitForFunction(() => localDbReady && !!navigator.serviceWorker.controller);
    await context.setOffline(true); await page.evaluate(() => window.MiniUpdates.check());
    assert.match(await page.textContent('#app-update-status'), /Sin conexión/);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => localDbReady);
    assert.equal(await page.textContent('#mini-version'), 'v' + nextVersion);
    assert.equal(await page.locator('#update-success:not([hidden]), .release-modal.active').count(), 0, 'ordinary reload does not repeat success or news');
    assert.deepEqual(await page.evaluate(() => employeeRepository.getAll()), original); await context.setOffline(false);
    invalid = true; await page.evaluate(() => window.MiniUpdates.check());
    await page.waitForFunction(() => document.getElementById('app-update-status').textContent.includes('No se pudo consultar'));
    assert.ok(incomingRequests >= 3); assert.deepEqual(errors, []);
  } finally { await context.close(); published = false; invalid = false; unavailable = false; staleNavigation = false; }
});


for (const theme of ['dark', 'light', 'contrast', 'ocean', 'sol']) {
  test(`published 2.17.10 upgrades to the built release: ${theme} success, receipt isolation and accessibility`, async () => {
    const fixture = await servePublishedRelease(ROOT);
    const context = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: theme === 'light' ? 'reduce' : 'no-preference' });
    if (process.env.AXE_PATH) await context.addInitScript({ path: process.env.AXE_PATH });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(fixture.base + 'manifest.json');
      await page.evaluate(() => {
        localStorage.setItem('users', JSON.stringify([{ id: 'receipt-test', number: '22', name: 'Ana', position: 'Ayudante' }]));
        localStorage.setItem('tutorialsSeen', '["marcar-asistencia"]');
        localStorage.setItem('storageHelpSnoozedUntil', String(Date.now() + 86400000));
      });
      await page.goto(fixture.base, { waitUntil: 'networkidle' });
      await page.fill('#mini-welcome-name', 'Actualizaciones'); await page.click('.mini-welcome-submit');
      await page.waitForFunction(() => typeof localDbReady !== 'undefined' && localDbReady && !!navigator.serviceWorker.controller);
      await page.evaluate(async value => { setTheme(value); await localDbWriteQueue; }, theme);
      assert.equal(await page.evaluate(() => MiniAppVersion.APP_VERSION), '2.17.10');
      assert.equal(hashAsset(await page.evaluate(() => fetch('./app-update-manager.js').then(r => r.text()))), hashAsset(fixture.oldAsset('app-update-manager.js')));
      const employees = await page.evaluate(() => employeeRepository.getAll());
      const other = await context.newPage(); await other.goto(fixture.base, { waitUntil: 'networkidle' });
      await other.waitForFunction(() => typeof localDbReady !== 'undefined' && localDbReady);
      fixture.state.published = true;
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
      await page.waitForSelector('#update-modal.active');
      await page.evaluate(() => window.__oldBoot = true);
      // One condition uses the actual old policy asset with the new manager, not a rewritten version.
      fixture.state.stalePolicy = theme === 'dark';
      await page.bringToFront(); // The second tab must not throttle the update animation.
      assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
      await page.click('#update-modal [data-release-apply]');
      await page.waitForFunction(() => typeof localDbReady !== 'undefined' && localDbReady && !window.__oldBoot);
      if (fixture.state.stalePolicy) {
        assert.equal(await page.evaluate(() => MiniAppVersion.APP_VERSION), '2.17.10');
        assert.equal(await page.locator('#update-success:not([hidden])').count(), 0);
        assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('mini:updateReceipt'))), { from: '2.17.10', target: policy.APP_VERSION });
        assert.equal(hashAsset(await page.evaluate(() => fetch('./app-update-manager.js').then(r => r.text()))), hashAsset(fs.readFileSync(path.join(ROOT, 'app-update-manager.js'))));
        fixture.state.stalePolicy = false;
        // Model the stale asset becoming fresh; do not recreate the lost receipt or apply again.
        await page.evaluate(async () => {
          const response = await fetch('./app-version.js?__v=recovered', { cache: 'no-store' });
          const name = (await caches.keys()).find(value => value.startsWith('asistencia-v'));
          await (await caches.open(name)).put(new URL('./app-version.js', location.href).href, response);
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
      await page.waitForSelector('#update-success:not([hidden])');
      await page.locator('#update-success').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
      if (theme === 'light') assert.equal(await page.locator('.update-success-check path').evaluate(el => getComputedStyle(el).animationName), 'none');
      // Capture visuals separately: a screenshot can consume the short automatic-dismiss window.
      if (process.env.UPDATE_SUCCESS_EVIDENCE && !process.env.AXE_PATH) await page.screenshot({ path: path.join(process.env.UPDATE_SUCCESS_EVIDENCE, `published-success-${theme}.png`) });
      if (process.env.AXE_PATH) {
        const audit = await page.evaluate(async () => {
          const result = await axe.run('#update-success', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
          return { violations: result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })),
            contrast: result.passes.find(rule => rule.id === 'color-contrast')?.nodes.map(node => node.target.join(' ')) || [],
            incomplete: result.incomplete.map(rule => ({ id: rule.id, nodes: rule.nodes.map(node => node.failureSummary) })) };
        });
        assert.deepEqual(audit.violations, []);
        assert.ok(audit.contrast.includes('.update-success-card > p'), 'the visible subtitle was audited: ' + JSON.stringify(audit));
      }
      assert.equal(await page.evaluate(() => MiniAppVersion.APP_VERSION), policy.APP_VERSION);
      assert.equal(await page.textContent('#mini-version'), 'v' + policy.APP_VERSION);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('mini:updateReceipt')), '');
      assert.equal(await other.evaluate(() => sessionStorage.getItem('mini:updateReceipt')), null);
      assert.equal(await other.locator('#update-success:not([hidden])').count(), 0);
      assert.equal(await page.getAttribute('html', 'data-theme'), theme);
      await page.waitForSelector('#update-success', { state: 'hidden' });
      assert.equal(await page.locator('.release-modal.active').count(), 0);
      assert.deepEqual(await page.evaluate(() => employeeRepository.getAll()), employees);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => typeof localDbReady !== 'undefined' && localDbReady);
      assert.equal(await page.locator('#update-success:not([hidden]), .release-modal.active').count(), 0);
      await other.reload({ waitUntil: 'domcontentloaded' }); await other.waitForFunction(() => typeof localDbReady !== 'undefined' && localDbReady);
      assert.equal(await other.locator('#update-success:not([hidden])').count(), 0, 'another tab cannot celebrate this tab’s update');
      assert.deepEqual(errors, []);
    } finally { await context.close(); await fixture.close(); }
  });
}
