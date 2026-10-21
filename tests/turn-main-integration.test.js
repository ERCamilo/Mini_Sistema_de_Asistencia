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
  assert.ok(at[2] < html.indexOf('<script src="./p2p-core.js"></script>'), 'TURN is ready before the P2P core starts');
  assert.doesNotMatch(html, /MiniProductionTurn\s*=\s*\{[^}]*enabled\s*:\s*true/);
  assert.doesNotMatch(html, /private-turn-public-preview/);
  for (const name of ['private-turn', 'private-turn-bootstrap', 'private-turn-production']) assert.ok(sw.includes(`'./${name}.js'`), `${name} precached`);
});
