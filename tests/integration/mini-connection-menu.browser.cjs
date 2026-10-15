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
        if (name === 'account-fixture.html') { const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8'); const styles = html.match(/<style>[\s\S]*?<\/style>/g) || []; res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html lang="es" data-theme="dark"><head>' + styles.join('') + '<link rel="stylesheet" href="p2p-transfer.css"><link rel="stylesheet" href="google-sign-in.css"><link rel="stylesheet" href="connection-screens.css"></head><body></body></html>'); return; }
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
    phase = 'UNAVAILABLE_ACCOUNT_THEMES';
    const contrastMetrics = [];
    async function accountMetrics(target, theme, focusSelector) {
      await target.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      if (focusSelector) { await target.keyboard.press('Tab'); await target.locator(focusSelector).focus(); }
      const metrics = await target.evaluate(() => {
        const card = document.querySelector('.mini-account-card'), action = card.querySelector('.mini-account-action:not([hidden])');
        const rgb = color => { const parts = color.match(/[\d.]+/g).map(Number); return parts.slice(0, 3); };
        const luminance = color => rgb(color).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const style = getComputedStyle(card), actionStyle = getComputedStyle(action), rect = action.getBoundingClientRect();
        const text = [...card.querySelectorAll(':scope>strong,:scope>p,:scope>.mini-account-status')].map(n => ratio(getComputedStyle(n).color, style.backgroundColor));
        return { textMinimum: Math.min(...text), actionText: ratio(actionStyle.color, actionStyle.backgroundColor), boundary: ratio(actionStyle.borderTopColor, style.backgroundColor), focus: action.matches(':focus-visible') && actionStyle.outlineStyle !== 'none' ? ratio(actionStyle.outlineColor, style.backgroundColor) : null, touch: rect.width >= 44 && rect.height >= 44, noOverflow: document.documentElement.scrollWidth <= innerWidth + 1 && card.getBoundingClientRect().right <= innerWidth + 1 };
      });
      assert.ok(metrics.textMinimum >= 4.5); assert.ok(metrics.actionText >= 4.5); assert.ok(metrics.boundary >= 3); assert.equal(metrics.touch, true); assert.equal(metrics.noOverflow, true);
      if (focusSelector) assert.ok(metrics.focus >= 3);
      contrastMetrics.push({ theme, ...metrics });
    }
    await page.evaluate(() => window.miniConnectionsMenu.task('account'));
    assert.equal(await page.locator('.mini-account-card').count(), 1);
    assert.equal(await page.locator('.mini-account-card').getAttribute('data-account-state'), 'unavailable');
    assert.equal(await page.locator('[data-account-unavailable]').isDisabled(), true);
    assert.ok((await page.locator('#mini-account-description').innerText()).includes('no está habilitado'));
    for (const theme of ['dark', 'light']) await accountMetrics(page, theme);
    await page.evaluate(() => window.miniConnectionsMenu.show());
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
    phase = 'AVAILABLE_ACCOUNT_FIXTURE';
    const accountPage = await context.newPage(); await accountPage.goto(origin + '/account-fixture.html');
    await accountPage.evaluate(() => { document.body.innerHTML = '<section class="mini-p2p-shell"><header></header><div id="direct" class="mini-p2p-body"><div class="mini-p2p-peer-list"></div></div></section><div id="internet"><button id="firebase-link-login">Original login</button><button id="firebase-link-logout" hidden>Original logout</button><div id="firebase-link-status"></div></div>'; });
    await accountPage.addScriptTag({ url: origin + '/connection-menu.js' });
    await accountPage.evaluate(() => {
      window.loginCalls = 0; window.logoutCalls = 0;
      window.originalLogin = document.getElementById('firebase-link-login'); window.originalLogout = document.getElementById('firebase-link-logout');
      const status = document.getElementById('firebase-link-status');
      window.originalLogin.onclick = () => { window.loginCalls++; status.dataset.accountEmail = 'synthetic@example.test'; status.dataset.accountName = 'Synthetic account'; window.originalLogin.hidden = true; window.originalLogout.hidden = false; };
      window.originalLogout.onclick = () => { window.logoutCalls++; status.dataset.accountEmail = ''; status.dataset.accountName = ''; window.originalLogin.hidden = false; window.originalLogout.hidden = true; };
      window.accountFixtureMenu = window.ConnectionMenu.mount({ app: 'mini', shell: document.querySelector('section'), directBody: document.getElementById('direct'), internetAvailable: true, getInternet: () => document.getElementById('internet'), beforeLeaveInternet: () => true, canChange: () => true, notify() {}, close() {} });
      window.accountFixtureMenu.show(); window.accountFixtureMenu.task('account');
    });
    for (const theme of ['dark', 'light']) {
      phase = 'SIGNED_OUT_' + theme.toUpperCase();
      await accountPage.waitForFunction(() => document.querySelector('.mini-account-card')?.dataset.accountState === 'signed-out');
      assert.equal(await accountPage.locator('.mini-account-card').count(), 1);
      assert.equal(await accountPage.locator('#firebase-link-login').isVisible(), true);
      await accountPage.evaluate(() => window.accountFixtureMenu.task('account'));
      assert.equal(await accountPage.evaluate(() => document.getElementById('firebase-link-login') === window.originalLogin), true);
      await accountMetrics(accountPage, theme, '#firebase-link-login');
      const loginBefore = await accountPage.evaluate(() => window.loginCalls);
      await accountPage.locator('#firebase-link-login').click();
      await accountPage.waitForFunction(() => document.querySelector('.mini-account-card')?.dataset.accountState === 'connected');
      assert.equal(await accountPage.evaluate(() => window.loginCalls), loginBefore + 1);
      assert.equal(await accountPage.locator('#mini-account-description').innerText(), 'synthetic@example.test');
      assert.equal(await accountPage.locator('.mini-account-card>strong').innerText(), 'Synthetic account');
      assert.equal(await accountPage.evaluate(() => document.getElementById('firebase-link-logout') === window.originalLogout), true);
      phase = 'CONNECTED_' + theme.toUpperCase(); await accountMetrics(accountPage, theme, '#firebase-link-logout');
      await accountPage.evaluate(() => window.accountFixtureMenu.task('account'));
      await accountPage.locator('#firebase-link-logout').click();
      await accountPage.waitForFunction(() => document.querySelector('.mini-account-card')?.dataset.accountState === 'signed-out');
    }
    assert.equal(await accountPage.evaluate(() => window.logoutCalls), 2);
    phase = 'EXTERNAL_REQUEST_CHECK'; assert.equal(external, 0);
    console.log(JSON.stringify({ accountThreeStates: true, originalAuthNodesAndHandlers: true, contrastMetrics, actualMiniPageAndCss: true, syntheticIdentityNoPeers: true, deviceActionVisibleWithoutSaOrGoogle: true, touchTarget: true, busyGuard: true, backupQrFallbackAndManual: true, existingWorkRoute: true, sharedSaMenuUnchanged: true, externalRequests: 0, cameraCaptured: false, authOrTransferTested: false }));
  } finally { for (const context of contexts) await context.close(); await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
}
if (require.main === module) void main().catch(error => { console.error('mini-connection-menu:failed:' + phase + ':' + (error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.code === 'ERR_ASSERTION' ? 'ASSERTION' : 'OPERATION')); process.exitCode = 1; });
