const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const FILES = ['comida-ledger.js', 'comida-store.js', 'comida-repository.js', 'comida-ui.js', 'comida.css'];

test('Comida scripts and styles are loaded in order and precached', () => {
  for (const file of FILES) {
    assert.ok(html.includes('./' + file), file + ' cargado');
    assert.ok(sw.includes("'./" + file + "'"), file + ' en el precache');
  }
  const order = ['comida-ledger.js', 'comida-store.js', 'comida-repository.js', 'comida-ui.js'].map(f => html.indexOf('src="./' + f + '"'));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'ledger → store → repository → ui');
  assert.ok(order[3] < html.indexOf('ComidaUI.init('), 'los scripts cargan antes de iniciar Comida');
});

test('Comida has its own view, sheet and nav buttons, and keeps Reportes', () => {
  assert.match(html, /id="comida-view"/);
  assert.match(html, /class="modal big" id="comida-sheet"/);
  assert.match(html, /id="nav-comida"/);
  assert.match(html, /id="nav-slot"/);
  assert.match(html, /id="nav-requests"/);
  assert.match(html, /NAV_VIEWS\s*=\s*\[[^\]]*'comida'[^\]]*\]/);
  assert.match(html, /VIEW_TITLES\s*=\s*\{[^}]*comida:\s*'Comida'[^}]*\}/);
  assert.match(html, /const BIG_MODALS = new Set\(\[[\s\S]*?'comida-sheet'[\s\S]*?\]\)/);
});

test('Más offers both sections with a switch for the bar', () => {
  assert.match(html, /id="more-section-requests-toggle"/);
  assert.match(html, /id="more-section-comida-toggle"/);
});

test('the central + opens the Comida options and closes its sheet', () => {
  const handler = html.slice(html.indexOf('function handleNavFab()'), html.indexOf('function topmostModal'));
  assert.match(handler, /activeBigModal === 'comida-sheet'[\s\S]*ComidaUI\.closeSheet\(\)/);
  assert.match(handler, /currentView === 'comida'[\s\S]*ComidaUI\.openAdd\(\)/);
});

test('the file backup carries Comida and a restore validates it before changing anything', () => {
  const download = html.slice(html.indexOf('function downloadJSON()'), html.indexOf('function downloadJSON()') + 600);
  assert.match(download, /data\.comida = window\.ComidaUI\.exportBackup\(\)/);
  const restore = html.slice(html.indexOf('function applyBackupRestore(parsed)'), html.indexOf('function clearStagedBackup'));
  const parse = restore.indexOf('ComidaRepository.parseBackup(parsed.comida');
  assert.ok(parse > 0, 'valida la sección comida');
  assert.ok(parse < restore.indexOf('runAtomicRestore'), 'antes de restaurar lo demás');
  assert.match(restore, /ComidaUI\.importBackup\(/);
});

test('an employee with food debt cannot be deleted, alone or in bulk', () => {
  assert.match(html, /btn-delete-user[\s\S]{0,400}ComidaUI\.hasDebt\(/);
  assert.match(html, /window\.doBulkDelete = \(\) => \{[\s\S]{0,500}ComidaUI\.hasDebt\(/);
});

test('Comida accent is defined for the five themes', () => {
  const css = fs.readFileSync('comida.css', 'utf8');
  for (const theme of ['light', 'contrast', 'ocean', 'sol']) assert.match(css, new RegExp(`\\[data-theme="${theme}"\\] \\{\\s+--comida-accent`));
  assert.match(css, /:root \{\s+--comida-accent/);
  assert.match(css, /body\.comida-mode \{[^}]*--accent-color: var\(--comida-accent\);[^}]*background-color: var\(--comida-canvas\);/);
});
