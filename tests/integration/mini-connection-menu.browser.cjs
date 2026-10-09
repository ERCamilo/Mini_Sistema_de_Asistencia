// Actual Mini HTML/CSS/navigation; synthetic identity and no external traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
let phase = 'CAPABILITY';
async function main() {
  assert.ok(process.env.PLAYWRIGHT_MODULE);
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  let browser, server; const contexts = []; let external = 0;
  try {
    server = http.createServer(async (req, res) => {
      try {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
        if (name === 'menu-fixture.html') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body></body></html>'); return; }
        if (name.includes('..') || !/^(?:[a-z0-9-]+\.(?:html|js|css|png|svg|json)|vendor\/[a-zA-Z0-9.-]+|tutorials\/[a-z0-9-]+\.(?:json|vtt|webm))$/.test(name)) { res.writeHead(404).end(); return; }
        const body = await fs.readFile(path.join(ROOT, name));
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(name)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    phase = 'BROWSER_LAUNCH'; browser = await chromium.launch({ args: ['--disable-background-networking'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); contexts.push(context);
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external++; return route.abort(); });
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Preserve real modules while replacing only identity persistence in a fresh fixture.
      let core;
      Object.defineProperty(window, 'SaMiniP2P', { configurable: true, get: () => core, set(value) {
        value.makeIdentityStore = () => ({ getSelf: async () => ({ deviceId: 'synthetic-mini', appType: 'mini', displayName: 'Mini fixture' }), listPeers: async () => [], getPeer: async () => null }); core = value;
      } });
      window.BarcodeDetector = undefined; // Exercise camera-unavailable UI, never capture media.
    });
    phase = 'MINI_LOAD'; await page.goto(origin); await page.waitForFunction(() => !!window.openP2PTransferModal);
    await page.evaluate(() => window.openP2PTransferModal());
    const device = page.locator('[data-connections-device]'), work = page.locator('[data-connections-add]');
    phase = 'VISIBLE_NO_SA_OR_GOOGLE';
    assert.equal(await device.isVisible(), true); assert.equal(await work.isVisible(), true);
    assert.equal((await device.innerText()).trim(), 'Asociar a otro dispositivo'); assert.equal((await work.innerText()).trim(), 'Asociar a una obra');
    const size = await device.boundingBox(); assert.ok(size.width >= 44 && size.height >= 44);
    assert.equal(await page.evaluate(() => !!window.MiniFirebaseFieldConfig), false);
    assert.equal(await page.locator('.connections-list [data-connection-card]').count(), 0);
    phase = 'BUSY_GUARD';
    await page.evaluate(() => { window.savedCloudView = window.miniCloudFieldView; window.miniCloudFieldView = { isBusy: () => true }; });
    await device.click(); assert.equal(await page.locator('[data-connections-home]').isVisible(), true); assert.equal(await page.locator('[data-backup-pair-mini]').count(), 0);
    await page.evaluate(() => { window.miniCloudFieldView = window.savedCloudView; });
    phase = 'BACKUP_HUB'; await device.click(); await page.locator('[data-backup-pair-mini]').waitFor({ state: 'visible' });
    await page.locator('[data-backup-pair-mini]').click();
    phase = 'BACKUP_QR_ROUTE'; await page.locator('[data-scan-backup-pair]').click(); await page.locator('[data-qr-video]').waitFor({ state: 'visible' });
    assert.ok((await page.locator('[data-qr-status]').innerText()).includes('código + clave'));
    await page.locator('[data-manual-fallback]').click();
    phase = 'BACKUP_MANUAL_ROUTE'; await page.locator('#mini-p2p-manual-code').waitFor({ state: 'visible' }); assert.equal(await page.locator('[data-connect]').innerText(), 'Conectar');
    await page.evaluate(() => window.openP2PTransferModal());
    phase = 'WORK_ROUTE'; await work.click(); await page.locator('[data-route-card=direct]').waitFor({ state: 'visible' });
    await page.locator('[data-screen-primary]').click(); await page.locator('#mini-p2p-manual-code').waitFor({ state: 'visible' }); assert.equal(await page.locator('[data-connect]').innerText(), 'Conectar con SA');
    phase = 'SA_SHARED_MENU_CONTROL';
    const sa = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(sa);
    await sa.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external++; return route.abort(); });
    const saPage = await sa.newPage(); await saPage.goto(origin + '/menu-fixture.html');
    await saPage.setContent('<section class="sa-p2p-shell"><header></header><div id="direct"><div class="sa-p2p-peer-list"></div></div></section>');
    phase = 'SA_LOAD_MODULE'; await saPage.addScriptTag({ url: origin + '/connection-menu.js' });
    phase = 'SA_MOUNT'; await saPage.evaluate(() => { const shell = document.querySelector('section'); window.fixtureMenu = window.ConnectionMenu.mount({ app: 'sa', shell, directBody: document.getElementById('direct'), internetAvailable: false, getInternet: () => document.createElement('div'), beforeLeaveInternet: () => true, canChange: () => true, notify() {}, close() {} }); window.fixtureMenu.show(); });
    phase = 'SA_ASSERT'; assert.equal(await saPage.locator('[data-connections-device]').count(), 0); assert.equal((await saPage.locator('[data-connections-add]').textContent()).trim(), 'Vincular Mini');
    phase = 'EXTERNAL_REQUEST_CHECK'; assert.equal(external, 0);
    console.log(JSON.stringify({ actualMiniPageAndCss: true, syntheticIdentityNoPeers: true, deviceActionVisibleWithoutSaOrGoogle: true, touchTarget: true, busyGuard: true, backupQrFallbackAndManual: true, existingWorkRoute: true, sharedSaMenuUnchanged: true, externalRequests: 0, cameraCaptured: false, authOrTransferTested: false }));
  } finally { for (const context of contexts) await context.close(); await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
}
if (require.main === module) void main().catch(error => { console.error('mini-connection-menu:failed:' + phase + ':' + (error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.code === 'ERR_ASSERTION' ? 'ASSERTION' : 'OPERATION')); process.exitCode = 1; });
