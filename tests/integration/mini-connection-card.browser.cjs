// Native, local-only presentation proof; no authentication or transport is created.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  assert.ok(process.env.PLAYWRIGHT_MODULE, 'existing Playwright module required');
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  const [html, css, source] = await Promise.all(['index.html', 'p2p-transfer.css', 'connection-presentation.js'].map(name => fs.readFile(path.join(ROOT, name), 'utf8')));
  // Reuse current production theme tokens, never the full application or its scripts.
  const tokens = html.slice(html.indexOf(':root {'), html.indexOf('        * {'));
  const browser = await chromium.launch({ chromiumSandbox: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--disable-background-networking'] });
  let context, blocked = 0;
  try {
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => { blocked++; return route.abort(); });
    const page = await context.newPage();
    await page.setContent('<meta charset="utf-8"><style>' + tokens + '\n' + css + '\n*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg-color);font-family:system-ui}#cards{max-width:560px;margin:auto}</style><section id="cards"></section>');
    await page.addScriptTag({ content: source });
    await page.evaluate(() => {
      window.createdTransports = 0;
      window.RTCPeerConnection = function () { window.createdTransports++; throw Error('TRANSPORT_FORBIDDEN'); };
      let snapshot = { peerId: 'synthetic', name: '<img onerror=unsafe()> ' + 'Long alias '.repeat(8), state: 'connecting', phase: 'waiting-answer', linkFingerprint: '012345-abcdef-012345-abcdef', preparationRemainingMs: 9000, lastCloseReason: 'manual' };
      let timer = 0; const timers = new Map();
      const mount = window.MiniConnectionPresentation.mountPeers({
        container: document.querySelector('#cards'), getPeers: () => [snapshot], subscribe: () => () => {},
        connect: async () => {}, close() {}, notify() {},
        schedule(callback) { timers.set(++timer, callback); return timer; }, cancel(id) { timers.delete(id); }
      });
      const row = document.querySelector('.connections-mini-peer'), button = row.querySelector('button'); button.focus();
      window.cardProof = {
        update(change) { snapshot = { ...snapshot, ...change }; mount.refresh(); },
        tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); },
        timerCount: () => timers.size,
        stable: () => document.querySelector('.connections-mini-peer') === row && document.activeElement === button,
        dispose: () => mount.dispose()
      };
    });
    const measurements = [];
    for (const width of [390, 1100]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['dark', 'light', 'contrast', 'ocean', 'sol']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        for (const state of ['available', 'connecting', 'connected', 'error']) {
          await page.evaluate(state => window.cardProof.update({ state, phase: state === 'connected' ? 'ready' : state === 'connecting' ? 'waiting-answer' : state === 'error' ? 'error' : 'standby', authenticated: state === 'connected', channelOpen: state === 'connected', leaseValid: state === 'connected', channelRemainingMs: state === 'connected' ? 61000 : null, preparationRemainingMs: state === 'connecting' ? 9000 : null }), state);
          const observation = await page.evaluate(() => {
            const row = document.querySelector('.connections-mini-peer'), group = row.querySelector('.connections-mini-peer-details');
            const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
            function luminance(color) {
              context.fillStyle = color; context.fillRect(0, 0, 1, 1);
              const components = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
              return components[0] * .2126 + components[1] * .7152 + components[2] * .0722;
            }
            function contrast(node, background) {
              const a = luminance(getComputedStyle(node).color), b = luminance(getComputedStyle(background).backgroundColor);
              return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            }
            return { stable: window.cardProof.stable(), overflow: document.documentElement.scrollWidth > innerWidth || row.scrollWidth > row.clientWidth,
              controls: [...row.querySelectorAll('button')].map(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height }; }),
              detailContrast: contrast(group, group), hintContrast: contrast(group.querySelector('small'), group), badgeContrast: contrast(row.querySelector('.connections-mini-peer-state'), row.querySelector('.connections-mini-peer-state')),
              literalAlias: row.querySelector('strong').textContent.startsWith('<img onerror=unsafe()>'), unsafeElements: row.querySelectorAll('img,script').length,
              countdownLive: group.hasAttribute('aria-live') || !!group.querySelector('[aria-live]'), text: group.textContent };
          });
          assert.equal(observation.stable, true); assert.equal(observation.overflow, false); assert.equal(observation.literalAlias, true); assert.equal(observation.unsafeElements, 0); assert.equal(observation.countdownLive, false);
          for (const control of observation.controls) assert.ok(control.width >= 44 && control.height >= 44);
          assert.ok(observation.detailContrast >= 4.5); assert.ok(observation.hintContrast >= 4.5); assert.ok(observation.badgeContrast >= 4.5);
          assert.match(observation.text, /Vínculo: 012345-abcdef-012345-abcdef/);
          measurements.push({ width, theme, state, minContrast: Math.min(observation.detailContrast, observation.hintContrast, observation.badgeContrast) });
        }
      }
    }
    await page.evaluate(() => window.cardProof.update({ state: 'connecting', phase: 'preparing', authenticated: false, channelOpen: false, leaseValid: false, channelRemainingMs: null, preparationRemainingMs: 9000 }));
    await page.evaluate(() => { window.cardProof.update({ preparationRemainingMs: 2800 }); window.cardProof.tick(); });
    assert.match(await page.locator('.connections-mini-peer-details').textContent(), /Intento: 00:03/);
    assert.equal(await page.evaluate(() => window.cardProof.stable()), true);
    await page.evaluate(() => window.cardProof.update({ preparationRemainingMs: null }));
    assert.equal(await page.evaluate(() => window.cardProof.timerCount()), 0);
    await page.evaluate(() => window.cardProof.update({ preparationRemainingMs: 5000 }));
    await page.evaluate(() => window.cardProof.dispose());
    assert.equal(await page.evaluate(() => window.cardProof.timerCount()), 0);
    assert.equal(await page.evaluate(() => window.createdTransports), 0);
    assert.equal(blocked, 0);
    console.log(JSON.stringify({ status: 'PASS', presentations: measurements.length, minContrast: Math.min(...measurements.map(item => item.minContrast)), keyedFocus: true, timerDisposed: true, externalRequests: blocked, transports: 0 }));
  } finally { await context?.close(); await browser.close(); }
}
if (require.main === module) main().catch(() => { console.error('MINI_CONNECTION_CARD_FIXTURE_FAILED'); process.exitCode = 1; });
