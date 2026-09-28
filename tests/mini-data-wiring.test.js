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
  const order = ['MiniData.isEnabled(localStorage)', 'openIdbBackend(', 'migrateFromV1(', '.hydrate()', 'attendanceStorage.use(', 'releaseV1(localStorage)'];
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
