const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const Tutorials = require('../tutorials.js');

const root = path.resolve(__dirname, '..');
const sample = {
  id: 'demo',
  version: 1,
  recordedAt: '2026-09-28T20:00:00.000Z',
  duration: 20,
  captions: [
    { start: 0.5, end: 3, text: 'Para qué sirve esto.' },
    { start: 3, end: 7, text: '1 · Abrí "Más".' },
    { start: 7, end: 12, text: '2 · Tocá "Datos".' },
    { start: 12, end: 18, text: '¡Listo!' }
  ]
};

test('catalog: every tutorial has id, title, summary, done text and a tour', () => {
  assert.ok(Tutorials.LIST.length >= 3);
  for (const t of Tutorials.LIST) {
    assert.match(t.id, /^[a-z0-9-]+$/);
    assert.ok(t.title && t.summary && t.doneText, t.id);
    assert.ok(Array.isArray(t.tour) && t.tour.length > 0, t.id + ' needs a "Hazlo conmigo" tour');
    for (const step of t.tour) assert.ok(step.target && step.title && step.text, t.id);
  }
  assert.equal(Tutorials.find('liberar-espacio').id, 'liberar-espacio');
  assert.equal(Tutorials.find('nope'), null);
});

test('urls live under ./tutorials/', () => {
  assert.equal(Tutorials.videoUrl('demo'), './tutorials/demo.webm');
  assert.equal(Tutorials.captionsUrl('demo'), './tutorials/demo.json');
});

test('the active caption follows the video time', () => {
  assert.equal(Tutorials.captionIndexAt(sample.captions, 0), -1);
  assert.equal(Tutorials.captionIndexAt(sample.captions, 0.5), 0);
  assert.equal(Tutorials.captionIndexAt(sample.captions, 6.9), 1);
  assert.equal(Tutorials.captionIndexAt(sample.captions, 7), 2);
  assert.equal(Tutorials.captionIndexAt(sample.captions, 19), -1);
});

test('step bar: only numbered captions, each until the next step (last one to the end)', () => {
  const steps = Tutorials.stepSegments(sample);
  assert.deepEqual(steps, [
    { step: 1, text: 'Abrí "Más".', start: 3, end: 7 },
    { step: 2, text: 'Tocá "Datos".', start: 7, end: 20 }
  ]);
});

test('step numbers are shown but not part of the spoken text', () => {
  assert.equal(Tutorials.stepNumber('3 · Tocá "Archivar".'), 3);
  assert.equal(Tutorials.stepNumber('Para qué sirve.'), null);
  assert.equal(Tutorials.spokenText('12 · Tocá "Archivar".'), 'Tocá "Archivar".');
  assert.equal(Tutorials.spokenText('¡Listo!'), '¡Listo!');
});

test('WebVTT export keeps order and uses hh:mm:ss.mmm', () => {
  const vtt = Tutorials.toVtt(sample.captions);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.match(vtt, /00:00:00\.500 --> 00:00:03\.000\nPara qué sirve esto\./);
  assert.match(vtt, /00:00:12\.000 --> 00:00:18\.000\n¡Listo!/);
});

test('script vs recorded video: equal texts pass, the first difference is reported', () => {
  const texts = sample.captions.map(c => c.text);
  assert.deepEqual(Tutorials.compareScripts(texts, sample), { ok: true });
  const changed = texts.slice();
  changed[2] = '2 · Tocá "Datos" arriba.';
  assert.deepEqual(Tutorials.compareScripts(changed, sample), { ok: false, index: 2, expected: '2 · Tocá "Datos" arriba.', recorded: '2 · Tocá "Datos".' });
  assert.equal(Tutorials.compareScripts(texts.slice(0, 3), sample).ok, false);
  assert.equal(Tutorials.compareScripts(texts, null).ok, false);
});

test('offline copies are keyed by recording, so a re-recorded video replaces the old one', () => {
  assert.equal(Tutorials.OFFLINE_CACHE, 'mini-tutorials-v1');
  assert.equal(Tutorials.offlineKey('demo', sample.recordedAt), './tutorials/demo.webm?rec=2026-09-28T20%3A00%3A00.000Z');
});

test('every catalog tutorial has its script, recorded video and captions', () => {
  const scripts = readFileSync(path.join(root, 'tests/tutorials/index.mjs'), 'utf8');
  for (const t of Tutorials.LIST) {
    assert.match(scripts, new RegExp(`'\\./${t.id}\\.mjs'`), t.id + ' listed in tests/tutorials/index.mjs');
    assert.ok(existsSync(path.join(root, 'tests/tutorials', t.id + '.mjs')), t.id + ' script');
    for (const ext of ['webm', 'json', 'vtt']) assert.ok(existsSync(path.join(root, 'tutorials', `${t.id}.${ext}`)), `${t.id}.${ext} recorded`);
    const file = JSON.parse(readFileSync(path.join(root, 'tutorials', t.id + '.json'), 'utf8'));
    assert.equal(file.id, t.id);
    assert.ok(Tutorials.stepSegments(file).length >= 2, t.id + ' has numbered steps');
  }
});

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');

test('wiring: modules load in index.html and are precached; captions precached, videos not', () => {
  for (const file of ['tutorials.js', 'tutorial-player.js']) {
    assert.match(html, new RegExp(`<script src="\\./${file}"></script>`));
    assert.match(sw, new RegExp(`'\\./${file}'`));
  }
  assert.ok(html.indexOf('./guided-tour.js') < html.indexOf('./tutorials.js'), 'tours need GuidedTour types first');
  for (const t of Tutorials.LIST) assert.match(sw, new RegExp(`'\\./tutorials/${t.id}\\.json'`));
  assert.doesNotMatch(sw, /'\.\/[^']*\.webm'/);
});

test('app updates keep the videos saved for offline use', () => {
  assert.match(sw, /const KEEP_CACHE_PREFIXES = \['mini-tutorials-'\];/);
  assert.ok(Tutorials.OFFLINE_CACHE.startsWith('mini-tutorials-'));
  const activate = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf('NAVIGATION_TIMEOUT_MS'));
  assert.match(activate, /KEEP_CACHE_PREFIXES\.some/);
});

test('Tutoriales modal: list, player, "Hazlo conmigo" and offline save', () => {
  assert.match(html, /id="modal-tutorials"/);
  assert.match(html, /id="btn-tutorials-offline" onclick="saveTutorialsOffline\(\)"/);
  assert.match(html, /id="btn-tutorial-tour" onclick="startTutorialTour\(\)"/);
  assert.match(html, /'modal-storage-help', 'modal-tutorials'/, 'is a big modal');
  assert.match(html, /id="btn-add-manual" onclick="addOneManual\(\)"/, 'tour target for "Manual"');
});

test('closing a tutorial stops its video; back goes from the player to the list first', () => {
  assert.match(html, /if \(id === 'modal-tutorials' \|\| id === 'modal-storage-help'\) stopTutorialPlayer\(\);/);
  const back = html.slice(html.indexOf('function resolveBackLayer'), html.indexOf('function installBackNavigation'));
  assert.ok(back.indexOf("tutorials-player-view") > -1 && back.indexOf("tutorials-player-view") < back.indexOf('if (activeBigModal) {'));
});
