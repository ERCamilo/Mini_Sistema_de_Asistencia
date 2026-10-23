const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const read = name => readFileSync(path.join(__dirname, '..', name), 'utf8');

test('main employee scripts and TURN connection menu remain registered and cached', () => {
  for (const name of ['employee-proposal', 'employee-proposal-sender', 'connection-menu']) {
    assert.ok(read('index.html').includes(`<script src="./${name}.js"></script>`), `${name} registered`);
    assert.ok(read('sw.js').includes(`'./${name}.js'`), `${name} precached`);
  }
});

test('destructive reset retains both main report and TURN roster guard keys', () => {
  const reset = read('index.html').split('.forEach(k => localStorage.removeItem(k))')[0].split('\n').at(-1);
  for (const key of ['mini_employee_report_v1', 'sa_roster_version_guard_v1']) assert.ok(reset.includes(key), `${key} reset`);
});

test('employee sending and Firebase roster review keep independent wiring', () => {
  const ui = read('p2p-roster-ui.js');
  assert.match(ui, /data-send-employees=/);
  assert.match(ui, /MiniEmployeeSender\??\.configure/);
  assert.match(ui, /root\.reviewFirebaseRoster\s*=\s*async/);
});

test('main employee styles coexist with TURN connections without production bootstrap', () => {
  const css = read('p2p-transfer.css');
  assert.match(css, /\.employee-send-overlay\s*\{/);
  assert.match(css, /\.connections-home/);
});

test('production TURN is wired but switched off, and only the exact marker can enable it', () => {
  const html = read('index.html'), sw = read('sw.js');
  const marker = '<script>window.MiniProductionTurn={enabled:false};</script>';
  const tags = ['private-turn', 'private-turn-bootstrap', 'private-turn-production'].map(name => `<script src="./${name}.js"></script>`);
  assert.equal(html.split(marker).length, 2, 'one disabled marker');
  const at = tags.map(tag => { assert.equal(html.split(tag).length, 2, tag); return html.indexOf(tag); });
  assert.ok(at[0] < at[1] && at[1] < at[2] && html.indexOf(marker) < at[2], 'marker and scripts load in dependency order');
  assert.ok(html.indexOf('<script src="./p2p-core.js"></script>') < html.indexOf(marker), 'the P2P core is loaded before the TURN entry');
  assert.doesNotMatch(html, /MiniProductionTurn\s*=\s*\{[^}]*enabled\s*:\s*true/);
  assert.doesNotMatch(html, /private-turn-public-preview/);
  for (const name of ['private-turn', 'private-turn-bootstrap', 'private-turn-production']) assert.ok(sw.includes(`'./${name}.js'`), `${name} precached`);
});

test('production TURN scripts run after the P2P core, so the real entry initializes once the marker is on', () => {
  const vm = require('node:vm');
  const html = read('index.html');
  const core = html.indexOf('<script src="./p2p-core.js"></script>');
  const entry = html.indexOf('<script src="./private-turn-production.js"></script>');
  assert.ok(core > -1 && core < html.indexOf('<script src="./private-turn.js"></script>') && core < entry, 'core loads before the TURN scripts');
  const order = [...html.matchAll(/<script src="\.\/(p2p-core|private-turn|private-turn-bootstrap|private-turn-production)\.js"><\/script>/g)].map(m => m[1]);
  const status = enabled => {
    const events = [];
    const context = { location: { origin: 'https://miniasist.erlin.do' }, MiniProductionTurn: { enabled }, console, URL, TextEncoder, TextDecoder,
      document: { dispatchEvent: e => events.push(e) }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
      setTimeout, clearTimeout, fetch: async () => { throw new Error('offline'); }, crypto: require('node:crypto').webcrypto };
    context.window = context; context.globalThis = context; context.self = context;
    vm.createContext(context);
    for (const name of order) vm.runInContext(read(`${name}.js`), context, { filename: `${name}.js` });
    return context.PrivateTurnProduction.status();
  };
  assert.deepEqual(order, ['p2p-core', 'private-turn', 'private-turn-bootstrap', 'private-turn-production']);
  assert.equal(status(false), 'off');
  assert.equal(status(true), 'active');
});
