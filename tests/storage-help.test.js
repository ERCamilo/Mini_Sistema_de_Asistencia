const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Help = require('../storage-help.js');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

test('prompts at 80% or more, unless snoozed', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  assert.equal(Help.shouldPrompt({ usagePct: 79, snoozedUntil: 0, now }), false);
  assert.equal(Help.shouldPrompt({ usagePct: 80, snoozedUntil: 0, now }), true);
  assert.equal(Help.shouldPrompt({ usagePct: 95, snoozedUntil: now + 1000, now }), false);
  assert.equal(Help.shouldPrompt({ usagePct: 95, snoozedUntil: now - 1, now }), true);
});

test('"Ahora no" snoozes for 24 hours', () => {
  const now = 1_000_000;
  assert.equal(Help.snoozeUntil(now), now + 24 * 60 * 60 * 1000);
});

test('the popup is checked at boot after the automatic repair and data load', () => {
  const init = between('        function init() {', '// --- SISTEMA DE TEMAS ---');
  assert.ok(init.indexOf('runStorageRepair(') < init.indexOf('maybePromptStorageHelp('));
  assert.ok(init.indexOf('loadData();') < init.indexOf('maybePromptStorageHelp('));
});

test('popup shows usage, a lazy help video and "Hazlo conmigo"', () => {
  assert.match(html, /id="modal-storage-help"/);
  assert.match(html, /id="storage-help-video"[^>]*preload="none"/);
  assert.match(html, /onclick="startStorageTour\(\)"/);
  assert.match(html, /const STORAGE_HELP_VIDEO = '\.\/help\/liberar-espacio\.webm';/);
  const open = between('window.openStorageHelp', 'window.dismissStorageHelp');
  assert.match(open, /setAttribute\('src', STORAGE_HELP_VIDEO\)/);
  const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
  assert.doesNotMatch(sw, /liberar-espacio\.webm/, 'the video is lazy, never precached');
});

test('Ajustes has a Help button that reopens the video anytime', () => {
  assert.match(html, /id="btn-storage-help"[^>]*onclick="openStorageHelp\('help'\)"/);
});
