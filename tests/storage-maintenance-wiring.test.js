const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const html = readFileSync(require.resolve('../index.html'), 'utf8');

test('storage is repaired at boot before data is loaded', () => {
  const init = html.slice(html.indexOf('        function init() {'), html.indexOf('installBackNavigation();'));
  const repair = init.indexOf('runStorageRepair(');
  assert.ok(repair > -1 && repair < init.indexOf('loadData();'));
});

test('the legacy mirror no longer writes the duplicated weeklyAttendance copy', () => {
  const mirror = html.slice(html.indexOf('function writeLegacyMirror'), html.indexOf('function queueLocalSnapshot'));
  assert.doesNotMatch(mirror, /setItem\('weeklyAttendance'/);
});

test('the data menu offers "Liberar espacio" with a usage report', () => {
  assert.match(html, /onclick="freeStorageSpace\(\)"/);
  assert.match(html, /window\.freeStorageSpace = /);
  assert.match(html, /<script src="\.\/storage-maintenance\.js"><\/script>/);
  assert.match(readFileSync(require.resolve('../sw.js'), 'utf8'), /'\.\/storage-maintenance\.js'/);
});
