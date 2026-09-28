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
    employees: 2, attendanceDays: 1, attendanceRecords: 2, requests: 1, workContexts: 1, hasSettings: true, isEmpty: false
  });
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
  assert.match(validate, /MiniBackupSummary\.summarize\(parsed\)/);
  assert.match(validate, /summary\.isEmpty/);
  const script = html.indexOf('<script src="./mini-backup-summary.js"></script>');
  assert.ok(script > -1 && script < html.indexOf('<script src="./p2p-backup-bridge.js"></script>'));
  assert.match(readFileSync(require.resolve('../sw.js'), 'utf8'), /'\.\/mini-backup-summary\.js'/);
});
