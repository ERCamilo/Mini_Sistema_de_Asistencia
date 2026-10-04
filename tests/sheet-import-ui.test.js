const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

test('sheet import: script loaded, precached, reachable from Ajustes', () => {
  assert.match(html, /<script src="\.\/sheet-import\.js"><\/script>/);
  assert.match(sw, /'\.\/sheet-import\.js'/);
  assert.match(html, /id="btn-sheet-import" onclick="openSheetImportModal\(\)"/);
  assert.match(html, /'modal-sheet-import'/, 'registered as a big modal');
});

test('sheet import: writes through the attendance repository and can be undone', () => {
  const block = html.slice(html.indexOf('// --- IMPORTAR PLANILLA DE DÍAS ---'), html.indexOf('// --- END IMPORTAR PLANILLA ---'));
  assert.ok(block.length > 0);
  assert.match(block, /applySheetImport\(st\.plan, \[\.\.\.st\.included\], attendanceRepository\)/);
  assert.match(block, /recordImport\(\{\s*source: 'sheet'/);
  assert.match(block, /snapshotBefore = \{ users: employeeRepository\.getAll\(\), attendance: attendanceRepository\.getAll\(\) \}/);
  assert.match(block, /catch \(error\)/, 'a failed import is reported, never silent');
});

test('sheet export: reachable from Ajustes, builds from the repositories, copies with a fallback', () => {
  assert.match(html, /id="btn-sheet-export" onclick="openSheetExportModal\(\)"/);
  assert.match(html, /'modal-sheet-export'/, 'registered as a big modal');
  const block = html.slice(html.indexOf('// --- EXPORTAR PLANILLA DE DÍAS ---'), html.indexOf('// --- END EXPORTAR PLANILLA ---'));
  assert.ok(block.length > 0);
  assert.match(block, /SheetImport\.buildSheet\(employeeRepository\.getAll\(\), attendanceRepository\.getDateRange\(st\.from, st\.to\)/);
  assert.match(block, /copyTextToClipboard\(area\.value\)[\s\S]*\.catch\(/, 'a failed copy leaves the text selected');
});
