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
  assert.match(css, /\.header-p2p-app-icon[^}]*border-radius:\s*50%/);
  assert.match(css, /\.header-p2p-app-icon[^}]*clip-path:\s*circle\(50%\)/);
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

test('connection home shows only actionable pending rosters and keeps passive activity metadata internal', () => {
  const ui = read('p2p-roster-ui.js');
  const store = read('p2p-activity-store.js');
  const home = ui.slice(ui.indexOf('async function renderHome()'), ui.indexOf('async function renderQrScanner'));
  assert.ok(home.includes('Pendientes por revisar'));
  assert.ok(home.includes('stagedEntries.map'));
  assert.ok(home.includes("querySelectorAll('[data-review-staged]')"));
  assert.ok(home.includes("querySelectorAll('[data-discard-staged]')"));
  assert.doesNotMatch(home, /mini-p2p-activity-list|activityRows|Sin actividad reciente/);
  assert.ok(ui.includes('getRecentP2PActivities'));
  assert.ok(ui.includes('data-wait-peer'));
  assert.ok(ui.includes('data-wait-attendance'));
  assert.ok(store.includes('STAGED_STORE_VERSION = 2'));
  assert.ok(store.includes('const memory = new Map()'));
});

test('accepted background roster stages durably and native discard emit payload-free refresh without importing or navigating', async () => {
  const vm = require('node:vm');
  const { createStagedRosterStore, createActivityStore } = require('../p2p-activity-store.js');
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const stagedStore = createStagedRosterStore({ storage, storageKey: 'fixture-staged' });
  const events = [], frames = [], employees = []; let badge = 0;
  const ui = read('p2p-roster-ui.js');
  const between = (from, to) => ui.slice(ui.indexOf(from), ui.indexOf(to));
  const context = { JSON, Date, TextEncoder, console, pendingRoster: null, stagedStore, activityStore: createActivityStore({ storage }),
    root: { SaRosterImport: require('../sa-roster-import.js') },
    document: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    peerName: () => 'Synthetic SA', recordP2PActivity() {}, signalTerminalSuccess() {}, toast() {},
    refreshMiniP2PHeader: async () => { badge = stagedStore.list().length; },
    getEffectiveStaged: id => stagedStore.load(id), isTransferModalOpen: () => true,
    renderRosterReceived() { throw Error('Background reception must not navigate'); }, renderError: error => { throw Error(error); },
    boundedUserSafeError: error => error.message
  };
  vm.createContext(context);
  vm.runInContext(read('p2p-core.js'), context); context.core = context.SaMiniP2P;
  vm.runInContext(between('  function persistStagedEntry(', '  function getRecentP2PActivities(')
    + between('  function validateRosterBeforeReview(', '  async function stageReceivedBackup(')
    + between('  async function discardPersistedStagedRoster(', '  async function reviewPersistedStagedRoster('), context);
  const peer = { peerId: 'synthetic-sa', peerApp: 'sa' };
  const channel = { readyState: 'open', send: text => frames.push(JSON.parse(text)) };
  context.core.markChannelAuthenticated(channel);
  const result = { kind: 'roster', schema: 'sa-roster/v1', transferId: 'synthetic-transfer', sha256: 'a'.repeat(64),
    text: JSON.stringify({ schema: 'sa-roster/v1', version: 1, saProjectId: 'synthetic-project', employees: [{ saEmployeeId: 'e1', name: 'Synthetic Employee', number: '1' }] }) };
  await context.stageReceivedRoster(result, peer, channel, { background: true });
  assert.equal(stagedStore.list().length, 1); assert.equal(badge, 1); assert.deepEqual(employees, []);
  assert.equal(createStagedRosterStore({ storage, storageKey: 'fixture-staged' }).list().length, 1, 'reopen preserves staging');
  assert.equal(frames.find(frame => frame.type === 'roster-staged').data.validated, true);
  assert.deepEqual(events.map(event => [event.type, event.detail]), [['p2p-staged-roster-change', undefined]]);
  await context.discardPersistedStagedRoster(peer.peerId);
  assert.equal(stagedStore.list().length, 0); assert.equal(badge, 0); assert.deepEqual(employees, []);
  assert.deepEqual(events.map(event => [event.type, event.detail]), [['p2p-staged-roster-change', undefined], ['p2p-staged-roster-change', undefined]]);
});
