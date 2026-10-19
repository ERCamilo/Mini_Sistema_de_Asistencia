// Local component acceptance: shipped menu/presentation/CSS, synthetic peers only.
// No Google session, signaling server, TURN service, or real-device claim.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, serve, ROOT } from '../tutorials/lib.mjs';

let browser, server, base, fixture;
before(async () => {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const themes = [html.match(/:root\s*\{[\s\S]*?\}/)[0], html.match(/\[data-theme="light"\]\s*\{[\s\S]*?\}/)[0]].join('\n');
  fixture = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <style>${themes} body { margin: 0; font-family: system-ui; } button { font: inherit; }</style>
    <link rel="stylesheet" href="/p2p-transfer.css"><link rel="stylesheet" href="/connection-screens.css">
    <script src="/connection-presentation.js"></script><script src="/connection-menu.js"></script>
    <button id="fixture-trigger">Compartir</button>
    <div class="mini-p2p-overlay"><section class="mini-p2p-shell" role="dialog" aria-modal="true" aria-labelledby="fixture-title">
      <header class="mini-p2p-topbar"><div class="mini-p2p-title-wrap"><strong class="mini-p2p-title" id="fixture-title">Compartir</strong><div class="mini-p2p-subtitle">Colabora con tu equipo</div></div><button type="button" class="mini-p2p-icon-btn" data-p2p-close aria-label="Cerrar"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor"/></svg></button></header>
      <div class="mini-p2p-body" data-p2p-body><div class="mini-p2p-peer-list"></div><button data-open-backup-hub-btn>Vincular dispositivo</button></div>
    </section></div>
    <section id="fixture-internet" hidden><button id="firebase-link-login">Google</button><button id="firebase-link-logout" hidden>Salir</button><p id="firebase-link-status"></p><p id="firebase-link-error"></p><p id="cloud-field-status"></p><select id="cloud-field-binding"><option value="0" data-org-id="org" data-project-id="project" data-group-id="group">Obra Norte · Equipo A</option></select></section></html>`;
  server = await serve(ROOT);
  base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); });

async function openFixture(width, theme, withSaPeer = false) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    return url.pathname === '/sharing-fixture' ? route.fulfill({ contentType: 'text/html', body: fixture }) : route.continue();
  });
  await page.goto(base + '/sharing-fixture');
  await page.evaluate(({ theme, withSaPeer }) => {
    document.documentElement.dataset.theme = theme;
    const calls = [], resolvers = [], listeners = new Set();
    let peers = [
      { peerId: 'first', name: 'Ana Pérez', state: 'connected', authenticated: true, channelOpen: true, leaseValid: true, linkFingerprint: '012345-abcdef-012345-abcdef', phase: 'ready', channelRemainingMs: 61000 },
      { peerId: 'long', name: 'Dispositivo ' + 'NombreLargoSinEspacios'.repeat(5), state: 'connected', authenticated: true, channelOpen: true, leaseValid: false }
    ];
    const shell = document.querySelector('.mini-p2p-shell'), directBody = document.querySelector('[data-p2p-body]');
    const refresh = () => { for (const listener of listeners) listener(); };
    directBody.querySelector('[data-open-backup-hub-btn]').onclick = () => calls.push('device-link');
    document.getElementById('firebase-link-login').onclick = () => calls.push('account-login');
    if (withSaPeer) {
      const row = document.createElement('div');
      row.className = 'mini-p2p-peer-row';
      row.innerHTML = '<strong>SA de obra</strong><div class="mini-p2p-device-actions"><button type="button" data-wait-peer="sa-test">Recibir personal</button><button type="button" data-send-employees="sa-test">Enviar personal</button><button type="button" data-wait-attendance="sa-test">Asistencia</button><button type="button" data-rename-peer="sa-test">Cambiar nombre</button><button type="button" data-unlink="sa-test">Desvincular</button></div>';
      for (const button of row.querySelectorAll('button')) button.addEventListener('click', () => calls.push('sa-action:' + (button.dataset.sendEmployees?'send-personal':button.dataset.waitPeer?'receive-personal':button.dataset.waitAttendance?'attendance':button.dataset.unlink?'unlink':'rename')));
      directBody.querySelector('.mini-p2p-peer-list').append(row);
    }
    document.getElementById('fixture-trigger').focus();
    const menu = ConnectionMenu.mount({
      app: 'mini', shell, directBody, internetAvailable: true,
      getInternet: () => document.getElementById('fixture-internet'),
      beforeLeaveInternet: () => true, canChange: () => true,
      notify: message => calls.push(message), close: () => calls.push('close'),
      getMiniPeers: () => peers,
      subscribeMiniPeers: callback => { listeners.add(callback); return () => listeners.delete(callback); },
      connectMiniPeer: id => { calls.push('connect:' + id); return new Promise(resolve => resolvers.push(resolve)); },
      closeMiniPeer: id => { calls.push('close:' + id); peers = peers.map(peer => peer.peerId === id ? { ...peer, state: 'available', channelOpen: false, leaseValid: false } : peer); refresh(); }
    });
    window.sharingFixture = { menu, calls, resolvers, refresh, setFirst: update => { peers[0] = { ...peers[0], ...update }; refresh(); } };
    document.querySelector('[data-p2p-close]').onclick = () => calls.push('close');
    menu.show();
  }, { theme, withSaPeer });
  return { context, page, errors };
}

async function geometry(page, width) {
  const result = await page.evaluate(() => {
    const shell = document.querySelector('.mini-p2p-shell'), home = document.querySelector('[data-connections-home]'), r = shell.getBoundingClientRect();
    const touch = [...shell.querySelectorAll('button,summary')].filter(node => node.getClientRects().length && !node.disabled).map(node => ({ label: node.getAttribute('aria-label') || node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    return { x: r.x, y: r.y, width: r.width, height: r.height, pageOverflow: document.documentElement.scrollWidth > innerWidth, homeOverflow: home.scrollWidth > home.clientWidth, scrolls: home.scrollHeight > home.clientHeight, touch, primary: getComputedStyle(document.querySelector('[data-connections-device]')).backgroundColor, primaryY: document.querySelector('[data-connections-device]').getBoundingClientRect().y, cardsY: document.querySelector('.connections-mini-peers').getBoundingClientRect().y };
  });
  assert.equal(result.pageOverflow, false, 'page does not overflow horizontally');
  assert.equal(result.homeOverflow, false, 'home does not overflow horizontally');
  assert.ok(result.primaryY < result.cardsY, 'link device comes before the cards');
  for (const control of result.touch) {
    assert.ok(control.height >= 44 && control.width >= 44, `44px touch target: ${JSON.stringify(control)}`);
  }
  if (width <= 600) {
    assert.equal(result.x, 0); assert.equal(result.y, 0);
    assert.equal(result.width, width); assert.equal(result.height, 844);
    assert.equal(result.scrolls, true, 'long content scrolls inside the fullscreen shell');
  } else {
    assert.ok(result.x > 0 && result.width <= 680 && result.height <= 820, 'desktop remains constrained');
  }
  assert.equal(result.primary, await page.evaluate(() => {
    const n = document.createElement('span'); n.style.color = 'var(--accent-color)'; document.querySelector('.mini-p2p-shell').append(n);
    const color = getComputedStyle(n).color; n.remove(); return color;
  }), 'device linking is the primary accent action');
}

for (const width of [320, 390, 1024]) for (const theme of ['light', 'dark']) {
  test(`sharing home ${width}px ${theme}: fullscreen, truthful cards, disclosure and preserved hooks`, async () => {
    const { context, page, errors } = await openFixture(width, theme);
    try {
      assert.equal(await page.locator('[data-mini-page-title]').textContent(), 'Compartir');
      assert.equal(await page.locator('[data-connections-device]').textContent(), 'Vincular dispositivo');
      assert.equal(await page.locator('.connections-mini-peers h3').textContent(), 'Dispositivos vinculados');
      assert.equal(await page.locator('[data-connection-account-open]').textContent(), 'Iniciar sesión');
      assert.equal(await page.locator('[data-mini-peer="first"] .connections-peer-avatar').textContent(), 'AP');
      assert.equal(await page.locator('[data-mini-peer="first"] > strong').textContent(), 'Ana Pérez');
      assert.equal(await page.locator('[data-mini-peer="first"] .connections-peer-linked').textContent(), 'Vinculado');
      assert.match(await page.locator('[data-mini-peer="first"] .connections-mini-peer-state').textContent(), /Conectado/);
      assert.match(await page.locator('[data-mini-peer="long"] .connections-mini-peer-state').textContent(), /Sin conexión/);
      assert.equal(await page.locator('details.connections-mini-peer-details[open]').count(), 0);
      await geometry(page, width);
      if (process.env.SHARING_SCREENSHOT_DIR && width !== 1024) {
        await mkdir(process.env.SHARING_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SHARING_SCREENSHOT_DIR, `sharing-${width}-${theme}.png`) });
      }

      const details = page.locator('[data-mini-peer="first"] details');
      await details.locator('summary').focus(); await page.keyboard.press('Enter');
      assert.equal(await details.evaluate(node => node.open), true);
      await page.evaluate(() => { window.firstCard = document.querySelector('[data-mini-peer="first"]'); sharingFixture.refresh(); });
      assert.equal(await details.evaluate(node => node.open), true);
      assert.match(await details.textContent(), /012345-abcdef-012345-abcdef/);
      assert.match(await details.textContent(), /Canal: 01:01/);
      assert.equal(await page.evaluate(() => window.firstCard === document.querySelector('[data-mini-peer="first"]')), true);

      for (const field of ['authenticated', 'channelOpen', 'leaseValid']) {
        await page.evaluate(field => sharingFixture.setFirst({ authenticated: true, channelOpen: true, leaseValid: true, [field]: false }), field);
        assert.match(await page.locator('[data-mini-peer="first"] .connections-mini-peer-state').textContent(), /Sin conexión/);
      }
      const connect = page.locator('[data-mini-peer-connect="first"]'), close = page.locator('[data-mini-peer-close="first"]');
      await connect.click();
      assert.match(await page.locator('[data-mini-peer="first"] .connections-mini-peer-state').textContent(), /Conectando/);
      assert.equal(await connect.isDisabled(), true);
      await close.click();
      assert.equal(await connect.evaluate(node => node === document.activeElement), true, 'close hands focus to connect when disabled');
      await connect.click();
      await page.evaluate(() => sharingFixture.resolvers[0]());
      assert.equal(await connect.isDisabled(), true, 'stale completion does not clear newer owned action');
      await page.evaluate(() => sharingFixture.resolvers[1]());
      await page.waitForFunction(() => !document.querySelector('[data-mini-peer-connect="first"]').disabled);
      assert.deepEqual(await page.evaluate(() => sharingFixture.calls.slice(0, 3)), ['connect:first', 'close:first', 'connect:first']);

      await page.locator('[data-connections-device]').click();
      assert.ok((await page.evaluate(() => sharingFixture.calls)).includes('device-link'));
      await page.evaluate(() => sharingFixture.menu.show());
      await page.locator('[data-connections-add]').click();
      assert.equal(await page.locator('[data-connections-task]').isVisible(), true);
      assert.equal(await page.locator('[data-mini-page-title]').textContent(), 'Vincular una obra');
      await page.locator('[data-mini-header-back]').click();
      assert.equal(await page.locator('[data-connections-home]').isVisible(), true);
      // Native personal review and employee-send overlays share mobile geometry.
      await page.evaluate(() => { document.querySelector('.mini-p2p-shell').dataset.miniConnectionPage = 'personal-review'; });
      if (width <= 600) assert.equal((await page.locator('.mini-p2p-shell').boundingBox()).height, 844);
      await page.evaluate(() => {
        const overlay = document.createElement('div'); overlay.className = 'employee-send-overlay';
        const dialog = document.createElement('section'); dialog.className = 'employee-send-dialog'; dialog.textContent = 'Personal';
        for (let i = 0; i < 40; i++) { const row = document.createElement('p'); row.textContent = 'Persona ' + i; dialog.append(row); }
        overlay.append(dialog); document.body.append(overlay);
      });
      if (width <= 600) {
        const box = await page.locator('.employee-send-dialog').boundingBox();
        assert.equal(box.width, width); assert.equal(box.height, 844);
        assert.equal(await page.locator('.employee-send-dialog').evaluate(node => node.scrollHeight > node.clientHeight && node.scrollWidth <= node.clientWidth && getComputedStyle(node).overflowY === 'auto'), true, 'employee sharing scrolls internally without horizontal overflow');
      }
      await page.locator('.employee-send-overlay').evaluate(node => node.remove());
      await page.evaluate(() => sharingFixture.menu.show());
      await page.locator('[data-connection-account-open]').click();
      assert.equal(await page.locator('[data-mini-page-title]').textContent(), 'Mi cuenta');
      await page.locator('#firebase-link-login').click();
      assert.ok((await page.evaluate(() => sharingFixture.calls)).includes('account-login'));
      await page.locator('[data-mini-header-back]').click();
      await page.locator('[data-connections-refresh]').click();
      await page.locator('[data-mini-peer-connect=long]').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-mini-peer=long] details summary').evaluate(node => node === document.activeElement), true, 'native summary is reachable by Tab');
      let wrapped = false;
      for (let step = 0; step < 20 && !wrapped; step++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('.mini-p2p-shell')), true, 'keyboard stays inside dialog');
        wrapped = await page.locator('[data-p2p-close]').evaluate(node => node === document.activeElement);
      }
      assert.equal(wrapped, true, 'last focusable control wraps to the dialog start');
      await page.locator('[data-p2p-close]').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-p2p-close]').evaluate(node => node === document.activeElement), false, 'keyboard moves within dialog');
      await page.keyboard.press('Escape');
      assert.ok((await page.evaluate(() => sharingFixture.calls)).includes('close'));
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => sharingFixture.menu.release()), true);
    } finally { await context.close(); }
  });
}

const photoPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
for(const width of [320,390,1024])for(const theme of ['light','dark']){
  test(`Google profile ${width}px ${theme}: successful image, failed image, changed account and logout update without manual refresh`, async()=>{
    const {context,page,errors}=await openFixture(width,theme);
    try{
      await page.route('https://lh3.googleusercontent.com/a/**',route=>route.request().url().includes('/ok')?route.fulfill({status:200,contentType:'image/png',body:photoPng}):route.abort());
      const label=page.locator('[data-connections-account] > strong');
      const image=page.locator('[data-connections-account] > img.connections-account-photo');
      await page.evaluate(()=>{const s=document.querySelector('#firebase-link-status');s.dataset.accountEmail='ana@example.test';s.dataset.accountName='Ana Gómez';s.dataset.accountPhoto='https://lh3.googleusercontent.com/a/ok';});
      await page.waitForFunction(()=>{const n=document.querySelector('[data-connections-account] img');return !!n&&!n.hidden&&n.naturalWidth>0;});
      assert.equal(await image.isVisible(),true);
      assert.equal(await label.isVisible(),false);
      await page.locator('[data-connection-account-open]').click();
      const profile=page.locator('[data-account-summary]');
      await page.waitForFunction(()=>{const n=document.querySelector('.connections-profile-photo');return !!n&&!n.hidden&&n.naturalWidth>0;});
      assert.equal(await profile.locator('.connections-profile-photo').isVisible(),true);
      await page.evaluate(()=>{const s=document.querySelector('#firebase-link-status');s.dataset.accountEmail='bea@example.test';s.dataset.accountName='Bea Ruiz';s.dataset.accountPhoto='https://lh3.googleusercontent.com/a/fail';});
      await page.waitForFunction(()=>{const profile=document.querySelector('[data-account-summary]');return !!profile&&profile.querySelector('strong')?.textContent==='Bea Ruiz'&&!!profile.querySelector('.connections-profile-photo')?.hidden;});
      assert.equal(await profile.locator('.connections-avatar').textContent(),'B');
      assert.equal(await profile.locator('.connections-avatar').isVisible(),true);
      await page.locator('[data-mini-header-back]').click();
      await page.waitForFunction(()=>{const n=document.querySelector('[data-connections-account] > strong');return !!n&&n.textContent==='B'&&getComputedStyle(n).display!=='none';});
      assert.equal(await image.isVisible(),false);
      assert.equal(await label.isVisible(),true);
      await page.evaluate(()=>{const s=document.querySelector('#firebase-link-status');s.dataset.accountEmail='';s.dataset.accountName='';s.dataset.accountPhoto='';});
      await page.waitForFunction(()=>document.querySelector('[data-connection-account-open]')?.textContent==='Iniciar sesión');
      assert.equal(await label.textContent(),'G');
      assert.equal(await label.isVisible(),true);
      assert.equal(await image.isVisible(),false);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}


// Guard against hiding existing Mini <-> SA direct-transfer options while redesigning Compartir.
// This is a local browser interaction check; no production account, TURN, or SA server is used.
for(const width of [320,390,1024]) for(const theme of ['light','dark']){
  test(`Mini → SA direct personnel and attendance actions remain accessible at ${width}px ${theme}`,async()=>{
    const {context,page,errors}=await openFixture(width,theme,true);
    try{
      const sa=page.locator('[data-connections-home] [data-connection-transport="direct"].mini-p2p-peer-row');
      assert.equal(await sa.count(),1,'SA peer row survives the new sharing-home mounting');
      for(const [selector,name,callback] of [
        ['[data-send-employees="sa-test"]','Enviar personal','send-personal'],
        ['[data-wait-peer="sa-test"]','Recibir personal','receive-personal'],
        ['[data-wait-attendance="sa-test"]','Asistencia','attendance'],
        ['[data-rename-peer="sa-test"]','Cambiar nombre','rename'],
        ['[data-unlink="sa-test"]','Desvincular','unlink']
      ]){
        const action=sa.locator(selector);
        assert.equal(await action.isVisible(),true,name+' is visible');
        assert.ok((await action.boundingBox()).height>=44,name+' is touch-sized');
        await action.click();
        assert.ok((await page.evaluate(()=>sharingFixture.calls)).includes('sa-action:'+callback),name+' preserves its native click handler');
        await page.evaluate(()=>sharingFixture.menu.show());
      }
      await page.locator('[data-connection-account-open]').click();
      await page.locator('[data-mini-header-back]').click();
      assert.equal(await sa.locator('[data-send-employees="sa-test"]').isVisible(),true,'returning to Compartir retains Send Personal');
      await sa.locator('[data-send-employees="sa-test"]').click();
      assert.equal((await page.evaluate(()=>sharingFixture.calls)).filter(x=>x==='sa-action:send-personal').length,2);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}

for (const changeProfile of [false, true]) {
  test(`account ${changeProfile ? 'changed identity' : 'duplicate metadata'} preserves native and secondary focus`, async () => {
    const { context, page, errors } = await openFixture(390, 'light');
    try {
      await page.locator('[data-connection-account-open]').click();
      for (const selector of ['#firebase-link-login', '[data-account-summary] > button']) {
        await page.locator(selector).first().focus();
        await page.evaluate(({ changeProfile }) => {
          window.accountNodes = {
            summary: document.querySelector('[data-account-summary]'),
            identity: document.querySelector('.mini-account-card'),
            login: document.querySelector('#firebase-link-login'),
            focused: document.activeElement
          };
          const status = document.querySelector('#firebase-link-status');
          status.dataset.accountEmail = changeProfile ? 'ana@example.test' : '';
          status.dataset.accountName = changeProfile ? (accountNodes.focused.id === 'firebase-link-login' ? 'Ana Gómez' : 'Ana López') : '';
          status.dataset.accountPhoto = '';
          status.dataset.linkBusy = 'false';
          document.querySelector('#firebase-link-error').textContent = 'Error de acceso de prueba';
        }, { changeProfile });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.deepEqual(await page.evaluate(() => ({
          summary: accountNodes.summary === document.querySelector('[data-account-summary]'),
          identity: accountNodes.identity === document.querySelector('.mini-account-card'),
          login: accountNodes.login === document.querySelector('#firebase-link-login'),
          focus: accountNodes.focused === document.activeElement
        })), { summary: true, identity: true, login: true, focus: true });
      }
      if (changeProfile) {
        assert.equal(await page.locator('.mini-account-card > strong').textContent(), 'Ana López');
        await page.evaluate(() => {
          document.querySelector('#firebase-link-login').hidden = true;
          document.querySelector('#firebase-link-logout').hidden = false;
        });
        await page.locator('#firebase-link-logout').focus();
        await page.evaluate(() => {
          window.accountFocus = document.activeElement;
          const status = document.querySelector('#firebase-link-status');
          status.dataset.accountEmail = 'bea@example.test';
          status.dataset.accountName = 'Bea Ruiz';
        });
        await page.waitForFunction(() => document.querySelector('.mini-account-card > strong')?.textContent === 'Bea Ruiz');
        assert.equal(await page.evaluate(() => accountFocus === document.activeElement), true);
        await page.evaluate(() => {
          const status = document.querySelector('#firebase-link-status');
          status.dataset.accountEmail = ''; status.dataset.accountName = ''; status.dataset.accountPhoto = '';
          document.querySelector('#firebase-link-login').hidden = false;
          document.querySelector('#firebase-link-logout').hidden = true;
        });
        await page.waitForFunction(() => document.querySelector('.mini-account-card')?.dataset.accountState === 'signed-out');
        assert.equal(await page.locator('.mini-account-card > strong').textContent(), 'Conecta tu cuenta Google');
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

// Full application coverage intentionally does not reuse the component fixture.
async function openApplication(width, theme, seedUsers) {
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', reducedMotion: 'reduce' });
  try {
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.routeWebSocket('**/*', socket => socket.close({ code: 1008, reason: 'Local-only browser regression' }));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    if (seedUsers) await context.addInitScript(value => localStorage.setItem('users', JSON.stringify(value)), seedUsers);
    await page.goto(base + '/');
    await page.locator('#mini-welcome-name').fill('Synthetic usability test');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    // First-run attendance guidance opens after onboarding; dismiss it natively.
    await page.waitForTimeout(1300);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    return { context, page, errors };
  } catch (error) { await context.close(); throw error; }
}

// Exact-origin local proof: keep the shipped hostname loader and mock only the SDK boundary.
async function openCustomDomainApplication(width) {
  const origin = 'https://miniasist.erlin.do', mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const blockedHttp = [], blockedSockets = [];
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { blockedHttp.push(url.href); return route.abort(); }
      if (url.pathname === '/vendor/firebase-app-compat.js') return route.fulfill({ contentType: 'text/javascript', body: `
        window.googleSdkFixture = { popupCalls: 0, persistence: [], providers: [] };
        const auth = {
          currentUser: null,
          onAuthStateChanged(callback) { callback(null); return () => {}; },
          setPersistence(mode) { googleSdkFixture.persistence.push(mode); return Promise.resolve(); },
          signInWithPopup(provider) {
            googleSdkFixture.popupCalls++; googleSdkFixture.providers.push(provider.parameters);
            return new Promise(resolve => { googleSdkFixture.finish = resolve; });
          },
          signOut() { return Promise.resolve(); }
        };
        const app = { auth: () => auth };
        window.firebase = {
          initializeApp(config, name) { googleSdkFixture.config = config; googleSdkFixture.appName = name; return app; },
          app: () => app,
          auth: { GoogleAuthProvider: class { setCustomParameters(parameters) { this.parameters = parameters; } } }
        };
      ` });
      if (url.pathname === '/vendor/firebase-auth-compat.js') return route.fulfill({ contentType: 'text/javascript', body: '// Auth SDK boundary supplied by the local fixture.' });
      // Browser sees only the exact custom origin; bytes come from the local fixture server.
      return route.fulfill({ response: await route.fetch({ url: base + url.pathname + url.search }) });
    });
    await context.routeWebSocket('**/*', socket => { blockedSockets.push(socket.url()); socket.close({ code: 1008, reason: 'Local-only custom-domain regression' }); });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/');
    await page.locator('#mini-welcome-name').fill('Synthetic custom domain test');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.waitForTimeout(1300);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    return { context, page, errors, blockedHttp, blockedSockets };
  } catch (error) { await context.close(); throw error; }
}

for (const width of [390, 1280]) test(`full app custom domain ${width}px: enabled Google action reaches the SDK popup once`, async () => {
  const { context, page, errors, blockedHttp, blockedSockets } = await openCustomDomainApplication(width);
  try {
    assert.equal(new URL(page.url()).origin, 'https://miniasist.erlin.do');
    await page.locator('#btn-attendance-link').click();
    await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
    const account = page.locator('[data-connection-account-open]');
    assert.equal(await account.textContent(), 'Iniciar sesión');
    assert.equal(await account.isDisabled(), false);
    await account.click();
    const login = page.locator('#firebase-link-login');
    assert.equal(await login.isVisible(), true);
    assert.equal(await login.isDisabled(), false);
    await login.click();
    await page.waitForFunction(() => googleSdkFixture.popupCalls === 1);
    assert.equal(await login.isDisabled(), true, 'native busy guard stays active during popup');
    await login.evaluate(node => { node.click(); node.click(); });
    assert.deepEqual(await page.evaluate(() => ({
      popupCalls: googleSdkFixture.popupCalls, persistence: googleSdkFixture.persistence,
      providers: googleSdkFixture.providers, projectId: googleSdkFixture.config.projectId,
      endpoint: MiniFirebaseFieldConfig.endpoint, appName: googleSdkFixture.appName
    })), { popupCalls: 1, persistence: ['local'], providers: [{ prompt: 'select_account' }], projectId: 'phoenix-asistencia-ab641', endpoint: 'https://firebase-bridge-test.erlin.do', appName: 'mini-field' });
    await page.evaluate(() => googleSdkFixture.finish());
    await page.waitForFunction(() => !document.getElementById('firebase-link-login').disabled);
    assert.equal(await page.evaluate(() => googleSdkFixture.popupCalls), 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(blockedHttp, [], 'zero off-origin HTTP attempts, including real Google');
    assert.deepEqual(blockedSockets, [], 'zero WebSocket attempts');
  } finally { await context.close(); }
});

async function assertViewportFit(page, selector) {
  const layout = await page.locator(selector).evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, visual: visualViewport.width, offset: visualViewport.offsetLeft };
  });
  assert.ok(layout.scroll <= layout.client, `document does not expand: ${JSON.stringify(layout)}`);
  assert.ok(layout.client <= layout.visual + 1, `layout fits the visual viewport: ${JSON.stringify(layout)}`);
  assert.ok(layout.left >= layout.offset - 1 && layout.right <= layout.offset + layout.visual + 1, `control is inside the visual viewport: ${JSON.stringify(layout)}`);
}

async function assertDialogFocus(page) {
  assert.equal(await page.locator('.mini-p2p-shell').evaluate(shell => {
    const active = document.activeElement;
    return shell.contains(active) && active.getClientRects().length > 0 && getComputedStyle(active).visibility !== 'hidden';
  }), true, 'visible keyboard focus is inside the actual dialog');
}

for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) {
  test(`full app ${width}px: attendance toolbar and sharing controls remain within the visual viewport (${theme})`, async () => {
    const { context, page, errors } = await openApplication(width, theme);
    try {
      await assertViewportFit(page, '.tools-grid');
      await assertViewportFit(page, '.config-bar');
      await assertViewportFit(page, '.tools-grid .whatsapp-cta');
      await page.locator('#btn-attendance-link').click();
      await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
      for (const selector of ['.mini-p2p-shell', '[data-connections-refresh]', '[data-p2p-close]']) await assertViewportFit(page, selector);
      await page.locator('[data-connections-refresh]').click();
      await assertDialogFocus(page);
      if (process.env.SHARING_SCREENSHOT_DIR && width === 320) {
        await mkdir(process.env.SHARING_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SHARING_SCREENSHOT_DIR, `full-app-${width}-${theme}.png`) });
      }
      await page.locator('[data-p2p-close]').click();
      await page.locator('.mini-p2p-overlay').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#btn-attendance-link').evaluate(node => document.activeElement === node), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`full app sharing: first open and reopen contain keyboard focus and Escape restores the opener (${width}px ${theme})`, async () => {
    const { context, page, errors } = await openApplication(width, theme);
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        await page.locator('#btn-attendance-link').click();
        await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
        await assertDialogFocus(page);
        for (const key of ['Tab', 'Shift+Tab', 'Shift+Tab', 'Tab']) {
          await page.keyboard.press(key);
          await assertDialogFocus(page);
        }
        await page.locator('[data-connections-refresh]').click();
        const refresh = page.locator('[data-connections-refresh]');
        await page.waitForTimeout(50);
        assert.equal(await refresh.evaluate(node => document.activeElement === node), true, 'refresh preserves its visible focus');
        await page.keyboard.press('Escape');
        await page.locator('.mini-p2p-overlay').waitFor({ state: 'detached' });
        assert.equal(await page.locator('#btn-attendance-link').evaluate(node => document.activeElement === node), true);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`full app without Google configuration: account entry does not advertise unavailable sign-in (${width}px ${theme})`, async () => {
    const { context, page, errors } = await openApplication(width, theme);
    try {
      await page.locator('#btn-attendance-link').click();
      await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-connection-account-open]').textContent(), 'Mi cuenta');
      await page.locator('[data-connection-account-open]').click();
      assert.equal(await page.locator('[data-account-unavailable]').isDisabled(), true);
      assert.match(await page.locator('[data-account-summary]').textContent(), /El acceso con Google no está habilitado/);
      await page.locator('[data-mini-header-back]').click();
      await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
      await assertDialogFocus(page);
      await page.keyboard.press('Escape');
      await page.locator('.mini-p2p-overlay').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#btn-attendance-link').evaluate(node => document.activeElement === node), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('deferred sharing focus cannot run after release', async () => {
  const { context, page } = await openFixture(390, 'light');
  try {
    await page.evaluate(() => {
      const shell = document.querySelector('.mini-p2p-shell');
      let released = false;
      window.focusAfterRelease = [];
      shell.addEventListener('focusin', event => { if (released) window.focusAfterRelease.push(event.target.tagName); });
      document.getElementById('fixture-trigger').focus();
      sharingFixture.menu.show();
      sharingFixture.menu.release();
      released = true;
    });
    assert.deepEqual(await page.evaluate(() => window.focusAfterRelease), [], 'released menu never takes focus, even transiently');
    assert.equal(await page.locator('#fixture-trigger').evaluate(node => document.activeElement === node), true);
  } finally { await context.close(); }
});


test('full app sharing: device pairing cancel and native back return to sharing', async () => {
  const { context, page, errors } = await openApplication(390, 'light');
  try {
    await page.locator('#btn-attendance-link').click();
    await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
    await page.locator('[data-connections-device]').click();
    await page.locator('[data-backup-pair-mini]').click();
    await page.locator('[data-share-backup-pair]').click();
    // Pairing remains offline; cancel without copying or recording the generated code.
    await page.locator('[data-cancel-share]').click();
    await page.locator('[data-mini-header-back]').click();
    await page.locator('[data-mini-header-back]').click();
    await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
    await assertDialogFocus(page);
    await page.locator('[data-p2p-close]').click();
    await page.locator('.mini-p2p-overlay').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#btn-attendance-link').evaluate(node => document.activeElement === node), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function openManualPair(page) {
  await page.locator('#btn-attendance-link').click();
  await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
  await page.locator('[data-connections-device]').click();
  await page.locator('[data-backup-pair-mini]').click();
  await page.locator('[data-manual-backup-pair]').click();
  await page.locator('[data-code]').waitFor({ state: 'visible' });
}

test('full app manual pairing: code focus, Tab and back preserve accessible navigation', async () => {
  const { context, page, errors } = await openApplication(320, 'light');
  try {
    await openManualPair(page);
    assert.equal(await page.locator('[data-code]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-key]').evaluate(node => node === document.activeElement), true);
    await page.locator('[data-mini-header-back]').click();
    await page.locator('[data-backup-pair-mini]').waitFor({ state: 'visible' });
    await assertDialogFocus(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const invalid of ['both', 'code', 'key']) test(`full app manual pairing: ${invalid} errors are announced, associated and cleared on editing`, async () => {
  const { context, page, errors } = await openApplication(390, 'dark');
  try {
    await openManualPair(page);
    if (invalid === 'key') await page.locator('[data-code]').fill('583214');
    if (invalid === 'code') await page.locator('[data-key]').fill('ABCDE-23456');
    await page.locator('[data-connect]').click();
    const status = page.locator('[data-pair-status]');
    assert.equal(await status.getAttribute('role'), 'status');
    assert.equal(await status.getAttribute('aria-live'), 'polite');
    assert.equal(await status.getAttribute('aria-atomic'), 'true');
    for (const name of ['code', 'key']) {
      const field = page.locator(`[data-${name}]`), bad = invalid === 'both' || invalid === name;
      assert.equal(await field.getAttribute('aria-invalid'), bad ? 'true' : null);
      assert.equal(await field.getAttribute('aria-describedby'), bad ? await status.getAttribute('id') : null);
      if (bad) assert.match(await status.textContent(), name === 'code' ? /código.*6 dígitos/ : /clave.*10 caracteres/);
    }
    const first = invalid === 'key' ? 'key' : 'code';
    assert.equal(await page.locator(`[data-${first}]`).evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('[data-connect]').isDisabled(), false);
    await page.locator(`[data-${first}]`).fill(first === 'code' ? '583214' : 'ABCDE-23456');
    assert.equal(await status.isVisible(), false);
    assert.equal(await page.locator('[aria-invalid=true]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('full app manual pairing: local transport failure is general, retryable and single-flight', async () => {
  const { context, page, errors } = await openApplication(390, 'light');
  try {
    await openManualPair(page);
    await page.evaluate(() => {
      window.syntheticRtcCalls = 0;
      SaMiniP2P.createRtcSession = async () => {
        window.syntheticRtcCalls++;
        await new Promise(resolve => { window.rejectSyntheticTransport = resolve; });
        throw Error('Fallo local de transporte sintético');
      };
    });
    await page.locator('[data-code]').fill('583214');
    await page.locator('[data-key]').fill('ABCDE-23456');
    await page.locator('[data-connect]').click();
    await page.waitForFunction(() => window.syntheticRtcCalls === 1);
    assert.equal(await page.locator('[data-connect]').isDisabled(), true);
    await page.locator('[data-connect]').evaluate(node => node.click());
    assert.equal(await page.evaluate(() => window.syntheticRtcCalls), 1);
    await page.evaluate(() => window.rejectSyntheticTransport());
    await page.waitForFunction(() => !document.querySelector('[data-connect]').disabled);
    assert.match(await page.locator('[data-pair-status]').textContent(), /Fallo local de transporte/);
    assert.equal(await page.locator('[aria-invalid=true]').count(), 0);
    assert.equal(await page.locator('[data-pair-status]').getAttribute('role'), 'status');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('full app restore confirmation: accessible name and description, Cancel preserves employees and staged backup', async () => {
  const { context, page, errors } = await openApplication(320, 'light', [{ id: 'synthetic-existing', name: 'Synthetic Existing Employee', number: '1', position: 'Test' }]);
  try {
    assert.deepEqual(await page.evaluate(() => users.map(user => user.id)), ['synthetic-existing']);
    await page.evaluate(async () => {
      const backup = { schemaVersion: 1, exportedAt: '2026-10-18T00:00:00Z', users: [{ id: 'synthetic-incoming', name: 'Synthetic Incoming Employee', number: '2', position: 'Test' }], attendance: {}, requests: [] };
      const payload = await SaMiniP2PBackup.createMiniBackupPayload(backup);
      SaMiniP2PBackup.backupStagedStore.stageBackup({ transferId: 'synthetic-a11y-only', sha256: payload.sha256, kind: 'backup', schema: 'mini-backup/v1', bytes: payload.bytes, sourceApp: 'mini', sourcePeerId: 'synthetic-fixture', sourcePeerName: 'Synthetic fixture', receivedAt: '2026-10-18T00:00:00Z' });
      window.syntheticExistingUsers = localStorage.getItem('users');
    });
    await page.locator('#btn-attendance-link').click();
    await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
    await page.locator('[data-connections-device]').click();
    await page.locator('[data-review-backup]:visible').click();
    await page.locator('[data-apply-backup]').click();
    const dialog = page.getByRole('dialog', { name: '¿Restaurar respaldo?', exact: true });
    await dialog.waitFor({ state: 'visible' });
    const message = await page.locator('#confirm-message').textContent();
    assert.ok(message.trim().length > 0);
    const accessibility = await context.newCDPSession(page);
    const { root } = await accessibility.send('DOM.getDocument');
    const { nodeId } = await accessibility.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#modal-confirm' });
    const { nodes } = await accessibility.send('Accessibility.getPartialAXTree', { nodeId });
    assert.equal(nodes[0].description.value, message.trim().replace(/\s+/g, ' '));
    await accessibility.detach();
    assert.equal(await dialog.getAttribute('aria-describedby'), 'confirm-message');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => localStorage.getItem('users') === window.syntheticExistingUsers), true);
    assert.deepEqual(await page.evaluate(() => users.map(user => user.id)), ['synthetic-existing']);
    assert.equal(await page.evaluate(() => SaMiniP2PBackup.backupStagedStore.listStaged().length), 1);
    assert.equal(await page.locator('[data-apply-backup]').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function confirmationContrast(page) {
  return page.locator('#confirm-ok').evaluate(button => {
    const parse = value => value.match(/[\d.]+/g).map(Number);
    let background = [0, 0, 0, 0];
    for (let node = button; node && background[3] < 1; node = node.parentElement) {
      const next = parse(getComputedStyle(node).backgroundColor), alpha = next[3] ?? 1;
      const combined = background[3] + alpha * (1 - background[3]);
      background = [0, 1, 2].map(i => combined ? (background[i] * background[3] + next[i] * alpha * (1 - background[3])) / combined : 0).concat(combined);
    }
    const luminance = rgb => rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const style = getComputedStyle(button), foreground = parse(style.color);
    const a = luminance(foreground), b = luminance(background);
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), color: style.color, background, focusVisible: button.matches(':focus-visible'), hover: button.matches(':hover'), outline: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
}

for (const theme of ['light', 'dark']) test(`full app restore contrast ${theme}: normal, keyboard focus and hover meet 4.5:1 without changing other danger controls`, async () => {
  const { context, page, errors } = await openApplication(390, theme, [{ id: 'synthetic-existing', name: 'Synthetic Existing Employee', number: '1', position: 'Test' }]);
  try {
    const unrelatedBefore = await page.locator('#btn-delete-user').evaluate(node => {
      const style = getComputedStyle(node), expected = document.createElement('span');
      expected.style.color = style.getPropertyValue('--danger-color');
      return { color: style.color, background: style.backgroundColor, expectedColor: expected.style.color };
    });
    assert.equal(unrelatedBefore.color, unrelatedBefore.expectedColor);
    assert.equal(unrelatedBefore.background, 'rgba(239, 68, 68, 0.15)');
    await page.evaluate(async () => {
      const backup = { schemaVersion: 1, exportedAt: '2026-10-18T00:00:00Z', users: [{ id: 'synthetic-incoming', name: 'Synthetic Incoming Employee', number: '2', position: 'Test' }], attendance: {}, requests: [] };
      const payload = await SaMiniP2PBackup.createMiniBackupPayload(backup);
      SaMiniP2PBackup.backupStagedStore.stageBackup({ transferId: 'synthetic-contrast-only', sha256: payload.sha256, kind: 'backup', schema: 'mini-backup/v1', bytes: payload.bytes, sourceApp: 'mini', sourcePeerId: 'synthetic-fixture', sourcePeerName: 'Synthetic fixture', receivedAt: '2026-10-18T00:00:00Z' });
      window.syntheticContrastUsers = localStorage.getItem('users');
    });
    await page.locator('#btn-attendance-link').click();
    await page.locator('[data-connection-screen=home] [data-connections-home]').waitFor({ state: 'visible' });
    await page.locator('[data-connections-device]').click();
    await page.locator('[data-review-backup]:visible').click();
    await page.locator('[data-apply-backup]').click();
    const dialog = page.getByRole('dialog', { name: '¿Restaurar respaldo?', exact: true });
    await dialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const cancel = dialog.getByRole('button', { name: 'Cancelar', exact: true });
    await cancel.focus(); await page.mouse.move(0, 0);
    const normal = await confirmationContrast(page);
    assert.ok(normal.ratio >= 4.5, `normal text contrast: ${JSON.stringify(normal)}`);
    const cancelBefore = await cancel.evaluate(node => { const style = getComputedStyle(node); return [style.color, style.backgroundColor]; });
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => {
      const button = document.querySelector('#confirm-ok');
      return button.matches(':focus-visible') && getComputedStyle(button).outlineWidth === '2px';
    });
    const focused = await confirmationContrast(page);
    assert.equal(focused.focusVisible, true); assert.equal(focused.outline, 'solid'); assert.equal(focused.outlineWidth, '2px');
    assert.ok(focused.ratio >= 4.5, `focused text contrast: ${JSON.stringify(focused)}`);
    await dialog.getByRole('button', { name: 'Restaurar', exact: true }).hover();
    const hovered = await confirmationContrast(page);
    assert.equal(hovered.hover, true); assert.ok(hovered.ratio >= 4.5, `hover text contrast: ${JSON.stringify(hovered)}`);
    assert.deepEqual(await page.locator('#btn-delete-user').evaluate(node => { const style = getComputedStyle(node); return [style.color, style.backgroundColor]; }), [unrelatedBefore.color, unrelatedBefore.background]);
    assert.deepEqual(await cancel.evaluate(node => { const style = getComputedStyle(node); return [style.color, style.backgroundColor]; }), cancelBefore);
    await cancel.click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => localStorage.getItem('users') === window.syntheticContrastUsers), true);
    assert.deepEqual(await page.evaluate(() => users.map(user => user.id)), ['synthetic-existing']);
    assert.equal(await page.evaluate(() => SaMiniP2PBackup.backupStagedStore.listStaged().length), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
