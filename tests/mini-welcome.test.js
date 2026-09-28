const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const MiniWelcome = require('../mini-welcome.js');

const issue = name => {
  const clean = String(name || '').trim();
  if (!clean) return 'Escribe un nombre.';
  if (['mini', 'dispositivo', 'mini dispositivo'].includes(clean.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' '))) return 'Genérico';
  return '';
};

test('needsWelcome is true for missing or generic device names', () => {
  assert.equal(MiniWelcome.needsWelcome('', issue), true);
  assert.equal(MiniWelcome.needsWelcome(null, issue), true);
  assert.equal(MiniWelcome.needsWelcome('Mini - Dispositivo', issue), true);
  assert.equal(MiniWelcome.needsWelcome('Juan · Obra Norte', issue), false);
});

test('ensureNamed resolves without UI when the device already has a name', async () => {
  let rendered = false;
  const result = await MiniWelcome.ensureNamed(
    { getName: async () => 'Juan · Obra Norte', saveName: async () => {}, issue },
    { render: () => { rendered = true; } }
  );
  assert.equal(result, 'Juan · Obra Norte');
  assert.equal(rendered, false);
});

test('ensureNamed blocks until a valid name is saved', async () => {
  const saved = [];
  let submit;
  const promise = MiniWelcome.ensureNamed(
    { getName: async () => 'Mini - Dispositivo', saveName: async name => { saved.push(name); }, issue },
    { render: ({ onSubmit }) => { submit = onSubmit; return { showIssue() {}, close() {} }; } }
  );
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await submit('   '), 'Escribe un nombre.');
  assert.equal(await submit('mini'), 'Genérico');
  assert.equal(await submit('  Obra   Norte  '), '');
  assert.equal(await promise, 'Obra Norte');
  assert.deepEqual(saved, ['Obra Norte']);
});

test('the welcome gate is wired at boot, before P2P and with its own styles', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  const welcome = html.indexOf('<script src="./mini-welcome.js"></script>');
  assert.ok(welcome > -1 && welcome < html.indexOf('<script src="./p2p-roster-ui.js"></script>'));
  const ui = readFileSync(require.resolve('../p2p-roster-ui.js'), 'utf8');
  assert.match(ui, /root\.MiniDeviceIdentity = \{/);
  assert.match(ui, /MiniWelcome\??\.ensureNamed\(root\.MiniDeviceIdentity\)/);
  const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
  assert.match(sw, /'\.\/mini-welcome\.js'/);
});
