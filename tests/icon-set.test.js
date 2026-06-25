const test = require('node:test');
const assert = require('node:assert/strict');
const IconSet = require('../icon-set.js');

test('exposes the two supported styles and a Lucide default', () => {
  assert.deepEqual(IconSet.ICON_STYLES, ['lucide', 'emoji']);
  assert.equal(IconSet.DEFAULT_ICON_STYLE, 'lucide');
});

test('normalizeIconStyle keeps emoji and defaults everything else to lucide', () => {
  assert.equal(IconSet.normalizeIconStyle('emoji'), 'emoji');
  assert.equal(IconSet.normalizeIconStyle('lucide'), 'lucide');
  assert.equal(IconSet.normalizeIconStyle('nonsense'), 'lucide');
  assert.equal(IconSet.normalizeIconStyle(undefined), 'lucide');
  assert.equal(IconSet.normalizeIconStyle(null), 'lucide');
});

test('every registered icon has both an emoji and a non-empty Lucide body', () => {
  const names = IconSet.iconNames();
  assert.ok(names.length >= 25);
  names.forEach(name => {
    assert.equal(IconSet.hasIcon(name), true, name + ' should report as present');
    const emoji = IconSet.iconEmoji(name);
    assert.equal(typeof emoji, 'string');
    assert.ok(emoji.length > 0, name + ' must have an emoji fallback');
    const svg = IconSet.iconSvg(name);
    assert.ok(svg.startsWith('<svg'), name + ' svg must open with <svg');
    assert.ok(svg.includes('class="ico"'), name + ' svg must carry the .ico class');
    assert.ok(svg.includes('currentColor'), name + ' svg must inherit theme color');
    assert.ok(svg.length > svg.indexOf('>') + '</svg>'.length, name + ' svg must have a body');
  });
});

test('iconMarkup returns the emoji in emoji mode and the svg in lucide mode', () => {
  assert.equal(IconSet.iconMarkup('daily', 'emoji'), '📅');
  const svg = IconSet.iconMarkup('daily', 'lucide');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('rx="2"')); // calendar body fragment
});

test('iconMarkup defaults to lucide when style is missing or invalid', () => {
  assert.ok(IconSet.iconMarkup('employees').startsWith('<svg'));
  assert.ok(IconSet.iconMarkup('employees', 'garbage').startsWith('<svg'));
});

test('unknown icon names fall back instead of throwing or blanking', () => {
  assert.equal(IconSet.hasIcon('does-not-exist'), false);
  assert.equal(IconSet.iconEmoji('does-not-exist'), '•');
  assert.ok(IconSet.iconSvg('does-not-exist').startsWith('<svg'));
});

test('resolveIcon describes the chosen rendering', () => {
  const emoji = IconSet.resolveIcon('check', 'emoji');
  assert.deepEqual(emoji, { kind: 'emoji', value: '✓', name: 'check' });
  const svg = IconSet.resolveIcon('check', 'lucide');
  assert.equal(svg.kind, 'svg');
  assert.equal(svg.name, 'check');
  assert.ok(svg.value.startsWith('<svg'));
});

test('core navigation icons are all registered', () => {
  ['attendance', 'employees', 'reports', 'more', 'add'].forEach(name => {
    assert.equal(IconSet.hasIcon(name), true, 'missing nav icon: ' + name);
  });
});
