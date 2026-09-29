const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ThemeSwitch = require('../theme-switch.js');
const IconSet = require('../icon-set.js');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const sw = readFileSync(require.resolve('../sw.js'), 'utf8');

test('themes: the four existing ones plus "Sol" for working outdoors', () => {
  assert.deepEqual(ThemeSwitch.THEMES, ['dark', 'light', 'contrast', 'ocean', 'sol']);
  assert.equal(ThemeSwitch.normalizeTheme('sol'), 'sol');
  assert.equal(ThemeSwitch.normalizeTheme('nope'), 'dark');
  assert.equal(ThemeSwitch.normalizeTheme(null), 'dark');
  assert.equal(ThemeSwitch.label('sol'), 'Sol');
});

test('quick pair: defaults to indoor (Original) and outdoor (Sol); junk falls back to the default', () => {
  assert.deepEqual(ThemeSwitch.DEFAULT_PAIR, ['dark', 'sol']);
  assert.deepEqual(ThemeSwitch.parsePair(null), ['dark', 'sol']);
  assert.deepEqual(ThemeSwitch.parsePair('{oops'), ['dark', 'sol']);
  assert.deepEqual(ThemeSwitch.parsePair('["ocean","light"]'), ['ocean', 'light']);
  assert.deepEqual(ThemeSwitch.parsePair('["light","light"]'), ['dark', 'sol'], 'two equal themes would make a dead button');
  assert.deepEqual(ThemeSwitch.parsePair('["pink","sol"]'), ['dark', 'sol']);
});

test('the button switches between the two chosen themes; from any other theme it goes to the first', () => {
  const pair = ['dark', 'sol'];
  assert.equal(ThemeSwitch.nextTheme('dark', pair), 'sol');
  assert.equal(ThemeSwitch.nextTheme('sol', pair), 'dark');
  assert.equal(ThemeSwitch.nextTheme('ocean', pair), 'dark');
});

test('the button shows where it goes: sun towards a light theme, moon towards a dark one', () => {
  assert.equal(ThemeSwitch.iconFor('sol'), 'sun');
  assert.equal(ThemeSwitch.iconFor('light'), 'sun');
  assert.equal(ThemeSwitch.iconFor('dark'), 'moon');
  assert.equal(ThemeSwitch.iconFor('contrast'), 'moon');
  assert.equal(ThemeSwitch.iconFor('ocean'), 'moon');
  for (const name of ['sun', 'moon']) assert.equal(IconSet.hasIcon(name), true, name + ' icon');
});

test('status bar color follows the theme background', () => {
  assert.equal(ThemeSwitch.statusBarColor('sol'), '#ffffff');
  assert.equal(ThemeSwitch.statusBarColor('dark'), '#0a0e27');
});

test('no flash: the saved theme is applied in <head> before any stylesheet or paint', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  const boot = head.indexOf('localStorage.getItem(\'appTheme\')');
  assert.ok(boot > -1, 'inline theme bootstrap in <head>');
  assert.ok(boot < head.indexOf('<link rel="stylesheet"'), 'runs before the first stylesheet');
  const allowed = /\^\(([a-z|]+)\)\$/.exec(head.slice(boot, boot + 300));
  assert.ok(allowed, 'bootstrap validates the theme name');
  assert.deepEqual(allowed[1].split('|'), ThemeSwitch.THEMES, 'same theme list as ThemeSwitch');
});

test('wiring: header button, Sol colors, Apariencia options, module loaded and precached', () => {
  assert.match(html, /id="btn-theme-quick"[^>]*onclick="toggleQuickTheme\(\)"/);
  assert.ok(html.indexOf('id="btn-theme-quick"') < html.indexOf('id="section-title"'), 'left of the title');
  assert.match(html, /\[data-theme="sol"\] \{[^}]*--bg-color: #ffffff;[^}]*--text-color: #000000;/);
  assert.match(html, /data-theme-name="sol" onclick="setTheme\('sol'\)"/);
  assert.match(html, /id="quick-theme-a"[^>]*onchange="setQuickPair\(\)"/);
  assert.match(html, /id="quick-theme-b"[^>]*onchange="setQuickPair\(\)"/);
  assert.match(html, /<script src="\.\/theme-switch\.js"><\/script>/);
  assert.match(sw, /'\.\/theme-switch\.js'/);
  const applyTheme = html.slice(html.indexOf('        function applyTheme(themeName) {'), html.indexOf('        function setTheme(themeName) {'));
  assert.match(applyTheme, /statusBarColor\(/);
  assert.match(applyTheme, /renderQuickThemeButton\(\)/);
});

test('every light-theme override also covers Sol (active pills, buttons, FAB)', () => {
  const lightRules = [...html.matchAll(/\[data-theme="light"\] ([^{,]+)[,{]/g)].map(m => m[1].trim()).filter(Boolean);
  assert.ok(lightRules.length >= 5);
  for (const selector of lightRules) {
    assert.ok(html.includes(`[data-theme="sol"] ${selector}`), 'Sol lacks: ' + selector);
  }
});

test('settings the user changes while the app boots survive the startup restore', () => {
  const save = html.slice(html.indexOf('        function saveLocalSetting(key, value) {'), html.indexOf('        function applyLocalSnapshot(snapshot) {'));
  assert.match(save, /settingsChangedThisSession\.add\(key\)/);
  const load = html.slice(html.indexOf('        function loadTheme() {'), html.indexOf('        function loadData() {'));
  assert.match(load, /applyTheme\(/);
  assert.doesNotMatch(load, /setTheme\(/, 'reading the saved theme must not count as a user change');
  const apply = html.slice(html.indexOf('        function applyLocalSnapshot(snapshot) {'), html.indexOf('        async function initLocalPersistence'));
  assert.match(apply, /settingsChangedThisSession\.has\(key\)/);
  const init = html.slice(html.indexOf('        async function initLocalPersistence'), html.indexOf('        function isStorageQuotaError'));
  assert.match(init, /if \(settingsChangedThisSession\.size\) queueLocalSnapshot\(\);/);
});
