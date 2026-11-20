const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const MiniBackupSummary = require('../mini-backup-summary.js');

test('summarize counts employees, attendance days/records, requests and contexts', () => {
  const summary = MiniBackupSummary.summarize({
    users: [{ id: 'u1' }, { id: 'u2' }],
    attendance: { '2026-09-01': { u1: {}, u2: {} }, '2026-09-02': {} },
    requests: [{ id: 'r1' }],
    workContexts: { contexts: [{ id: 'c1' }] },
    settings: { appTheme: 'dark' }
  });
  assert.deepEqual(summary, {
    employees: 2, attendanceDays: 1, attendanceRecords: 2, requests: 1, workContexts: 1, hasSettings: true, comida: null, isEmpty: false
  });
});

test('a file can recover a Comida-only history and counts closed periods and payments', () => {
  const data = { users: [], attendance: {}, comida: {
    schemaVersion: 1, clients: [{ id: 'c1' }], orders: [{ id: 'o1' }],
    payments: [{ id: 'p1' }], periods: [{ end: '2026-10-22' }, { end: null }]
  } };
  const summary = MiniBackupSummary.validate(data, { allowComida: true });
  assert.deepEqual(summary.comida, { clients: 1, orders: 1, payments: 1, closedPeriods: 1 });
  assert.equal(summary.isEmpty, false);
  assert.throws(() => MiniBackupSummary.validate(data), /Comida.*archivo/);
  assert.equal(MiniBackupSummary.validate({ ...data, comida: { schemaVersion: 1, periods: [{ end: null }] } }, { allowComida: true }).isEmpty, true);
});

test('validation rejects incompatible, malformed or foreign backups before showing the restore action', () => {
  assert.throws(() => MiniBackupSummary.validate({ schemaVersion: 2, users: [] }), /versión/);
  assert.throws(() => MiniBackupSummary.validate({ schema: 'sa-backup/v1', users: [] }), /Mini/);
  assert.throws(() => MiniBackupSummary.validate({ users: [{ id: 'u1' }], settings: [] }), /ajustes/);
  assert.throws(() => MiniBackupSummary.validate({ users: [], comida: { orders: {} } }, { allowComida: true }), /Comida/);
  assert.throws(() => MiniBackupSummary.validate({ users: [], comida: { schemaVersion: 2 } }, { allowComida: true }), /versión/);
  assert.equal(MiniBackupSummary.validate({ users: [{ id: 'u1' }] }).isEmpty, false);
});

test('a backup with only settings or empty days is empty', () => {
  assert.equal(MiniBackupSummary.summarize({ users: [], attendance: { '2026-09-01': {} }, settings: { a: '1' } }).isEmpty, true);
  assert.equal(MiniBackupSummary.summarize(null).isEmpty, true);
  assert.equal(MiniBackupSummary.summarize({ attendance: { d: { u1: {} } } }).isEmpty, false);
});

test('index.html shares one backup builder for file and P2P and blocks empty restores', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /window\.buildMiniBackupData = buildMiniBackupData;/);
  const download = html.slice(html.indexOf('function downloadJSON'), html.indexOf('function applyRestoredSettings'));
  assert.match(download, /buildMiniBackupData\(\)/);
  const validate = html.slice(html.indexOf('window.validateRestoreTextarea'), html.indexOf('window.doRestoreBackup'));
  assert.match(validate, /MiniBackupSummary\.validate\(parsed, \{ allowComida: true \}\)/);
  assert.match(validate, /summary\.isEmpty/);
  const script = html.indexOf('<script src="./mini-backup-summary.js"></script>');
  assert.ok(script > -1 && script < html.indexOf('<script src="./p2p-backup-bridge.js"></script>'));
  assert.match(readFileSync(require.resolve('../sw.js'), 'utf8'), /'\.\/mini-backup-summary\.js'/);
});
