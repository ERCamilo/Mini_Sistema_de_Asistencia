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
  assert.doesNotMatch(read('index.html'), /<script[^>]+src=["'][^"']*private-turn(?:-bootstrap)?\.js/);
});
