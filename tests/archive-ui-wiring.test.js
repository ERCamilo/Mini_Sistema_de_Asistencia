const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

test('Datos tab offers "Archivar meses antiguos" with a 3/6/12 month choice', () => {
  assert.match(html, /id="btn-archive-months"[^>]*onclick="openArchiveModal\(\)"/);
  assert.match(html, /id="modal-archive-months"/);
  for (const n of [3, 6, 12]) assert.match(html, new RegExp(`onclick="setArchiveKeep\\(${n}\\)"`));
  assert.match(html, /<script src="\.\/attendance-archive\.js"><\/script>/);
  assert.match(readFileSync(require.resolve('../sw.js'), 'utf8'), /'\.\/attendance-archive\.js'/);
});

test('archiving saves the file first and only removes days after an explicit confirm', () => {
  const run = between('window.runArchiveMonths', 'window.setArchiveKeep');
  const download = run.indexOf('downloadArchiveFile(');
  const confirm = run.indexOf('showConfirm(');
  const remove = run.indexOf('attendanceRepository.removeDays(plan.dates)');
  assert.ok(download > -1 && download < confirm && confirm < remove, 'download -> confirm -> remove');
  assert.match(run, /if \(!confirmed\) return;/);
  assert.match(run, /saveData\(\)/);
});

test('an archive file is merged back on restore, never replacing current data', () => {
  const validate = between('window.validateRestoreTextarea', 'window.doRestoreBackup');
  assert.match(validate, /AttendanceArchive\.isArchiveFile\(parsed\)/);
  const restore = between('window.doRestoreBackup', 'IMPORTAR / ACTUALIZAR EMPLEADOS');
  const merge = restore.indexOf('mergeArchiveFile(parsed)');
  assert.ok(merge > -1 && merge < restore.indexOf('applyBackupRestore(parsed)'));
  const mergeFn = between('function mergeArchiveFile', 'window.restoreMiniBackupData');
  assert.match(mergeFn, /attendanceRepository\.importBatch\(parsed\.attendance, 'merge'\)/);
  assert.doesNotMatch(mergeFn, /'replace'/);
});
