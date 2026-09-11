const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('Mini header shows real SA icon with circular state ring and red numeric badge', () => {
  const html = read('index.html');
  const css = read('p2p-transfer.css');
  assert.match(html, /id="btn-attendance-link"[\s\S]*sa-app-icon\.svg[\s\S]*data-p2p-header-pending/);
  assert.ok(css.includes('.header-p2p-ring'));
  assert.ok(css.includes('[data-p2p-state="connected"]'));
  assert.ok(css.includes('.header-p2p-notification-badge'));
});

test('passive inbox receives trusted roster/attendance without auto-applying data', () => {
  const ui = read('p2p-roster-ui.js');
  assert.ok(ui.includes('startPassiveInbox'));
  assert.ok(ui.includes("initiator: false"));
  assert.ok(ui.includes('armRosterReceiver(channel, peer, { background: true })'));
  assert.ok(ui.includes('armAttendanceResponder(channel, peer, self, {})'));
  assert.ok(ui.includes('sendAttendanceReady(channel)'));
  assert.ok(ui.includes('stagedStore?.save?.(entry)'));
  assert.ok(ui.includes('Revisar roster'));
  assert.doesNotMatch(ui, /employeeRepository\.importSaRoster\([^)]*channel/);
});

test('activity center supports multiple pending SA rosters and preserves manual fallback', () => {
  const ui = read('p2p-roster-ui.js');
  const store = read('p2p-activity-store.js');
  assert.ok(ui.includes('Actividad P2P'));
  assert.ok(ui.includes('stagedEntries.map'));
  assert.ok(ui.includes("querySelectorAll('[data-review-staged]')"));
  assert.ok(ui.includes("querySelectorAll('[data-discard-staged]')"));
  assert.ok(ui.includes('data-wait-peer'));
  assert.ok(ui.includes('data-wait-attendance'));
  assert.ok(store.includes('STAGED_STORE_VERSION = 2'));
  assert.ok(store.includes('const memory = new Map()'));
});
