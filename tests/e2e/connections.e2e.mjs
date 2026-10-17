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
