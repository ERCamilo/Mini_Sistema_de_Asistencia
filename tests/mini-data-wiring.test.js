const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

test('mini-data.js is loaded and precached', () => {
  assert.match(html, /<script src="\.\/mini-data\.js"><\/script>/);
  assert.match(sw, /'\.\/mini-data\.js'/);
});

test('the attendance repository writes through a switchable storage (localStorage -> IndexedDB)', () => {
  assert.match(html, /const attendanceStorage = window\.MiniData\.createSwitchableStorage\(localStorage\);/);
  const repo = between('const attendanceRepository = window.AttendanceRepository.createAttendanceRepository({', '});');
  assert.match(repo, /storage: attendanceStorage,/);
});

test('boot: storage v2 is ready before init; on failure the app still starts on v1', () => {
  assert.match(html, /\n        bootStorage\(\)\.finally\(init\);\n/);
  assert.doesNotMatch(html, /\n        init\(\);\n/);
  const boot = between('async function bootStorage()', '// --- END STORAGE V2 BOOT ---');
  // The database opens first: turning v2 off must copy its days back (rollback).
  const order = ['openIdbBackend(', 'MiniData.isEnabled(localStorage)', 'rollbackToV1(', 'migrateFromV1(', '.hydrate()', 'attendanceStorage.use(', 'releaseV1(localStorage)'];
  let last = -1;
  for (const step of order) {
    const at = boot.indexOf(step);
    assert.ok(at > last, 'boot step out of order: ' + step);
    last = at;
  }
  assert.match(boot, /catch \(error\)/);
  assert.match(boot, /status === 'failed'/);
});

test('v2 source for the migration: IndexedDB snapshot first, then localStorage', () => {
  const read = between('async function readV1AttendanceSource()', '// --- END V1 SOURCE ---');
  assert.ok(read.indexOf('localDb.readState()') > -1);
  assert.ok(read.indexOf('localDb.readState()') < read.indexOf("localStorage.getItem('attendance')"));
});

test('with v2 active, localStorage never receives attendance again', () => {
  const load = between('function loadData() {', 'const localDb =');
  assert.match(load, /if \(!usingMiniDataV2\(\) && a\)/);
  const mirror = between('function writeLegacyMirror(snapshot) {', 'function queueLocalSnapshot');
  assert.match(mirror, /if \(!usingMiniDataV2\(\)\) localStorage\.setItem\('attendance'/);
  const apply = between('function applyLocalSnapshot(snapshot) {', 'async function initLocalPersistence');
  assert.match(apply, /if \(snapshot\.attendance && !usingMiniDataV2\(\)\)/);
});

test('"Borrar todo" also clears the attendance kept in IndexedDB', () => {
  assert.match(html, /\['attendance', 'attendance_tombstones'\]\.forEach\(k => attendanceStorage\.removeItem\(k\)\);/);
});

test('with v2 the old full snapshot no longer carries attendance on every tap (backups still do)', () => {
  const queue = between('function queueLocalSnapshot() {', 'function saveLocalSetting');
  assert.match(queue, /captureDbSnapshot\(\)/);
  const db = between('function captureDbSnapshot() {', 'function writeLegacyMirror');
  assert.match(db, /if \(usingMiniDataV2\(\)\) snapshot\.attendance = \{\};/);
  const capture = between('function captureLocalSnapshot() {', 'function captureDbSnapshot');
  assert.match(capture, /attendance: attendanceRepository\.getAll\(\)/, 'backups keep everything');
  const persistence = between('async function initLocalPersistence() {', 'function isStorageQuotaError');
  assert.doesNotMatch(persistence, /writeState\(captureLocalSnapshot\(\)\)/);
});

test('turning v2 off moves the days back to v1 before the app starts', () => {
  const boot = between('async function bootStorage()', '// --- END STORAGE V2 BOOT ---');
  assert.ok(boot.indexOf('rollbackToV1(') > -1 && boot.indexOf('rollbackToV1(') < boot.indexOf('migrateFromV1('));
  const rollback = between('async function rollbackToV1(', '// --- END ROLLBACK ---');
  const order = ['MiniData.isVerified(', 'MiniData.exportAttendance(', 'localDb.writeState(', 'MiniData.markRolledBack('];
  let last = -1;
  for (const step of order) { const at = rollback.indexOf(step); assert.ok(at > last, 'rollback step out of order: ' + step); last = at; }
});

test('Ajustes shows where the data lives and can switch storage (with confirmation)', () => {
  assert.match(html, /id="btn-storage-mode" onclick="toggleStorageMode\(\)"/);
  const toggle = between('window.toggleStorageMode = ', '// --- END STORAGE MODE ---');
  assert.match(toggle, /showConfirm\(/);
  assert.match(toggle, /MiniData\.FLAG_KEY/);
  assert.match(toggle, /location\.reload\(\)/);
});
