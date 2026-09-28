const test = require('node:test');
const assert = require('node:assert/strict');
const Tour = require('../guided-tour.js');

test('bubble goes below a target in the upper half of the screen', () => {
  const view = { width: 390, height: 844 };
  const below = Tour.placeBubble({ top: 100, left: 20, width: 200, height: 48 }, { width: 300, height: 140 }, view);
  assert.equal(below.side, 'below');
  assert.ok(below.top >= 100 + 48);
});

test('for a target in the lower half the bubble moves to the top, clear of the dialog around it', () => {
  const view = { width: 390, height: 844 };
  const top = Tour.placeBubble({ top: 690, left: 20, width: 350, height: 56 }, { width: 300, height: 140 }, view);
  assert.equal(top.side, 'top');
  assert.equal(top.top, 16);
  assert.ok(top.top + 140 < 690);
});

test('bubble stays inside the screen horizontally (16px gutter)', () => {
  const pos = Tour.placeBubble({ top: 100, left: 360, width: 30, height: 30 }, { width: 300, height: 120 }, { width: 390, height: 844 });
  assert.ok(pos.left >= 16 && pos.left + 300 <= 390 - 16);
});

test('the spotlight pads the target and never leaves the viewport', () => {
  const spot = Tour.spotlightRect({ top: 2, left: 2, width: 100, height: 40 }, { width: 390, height: 844 });
  assert.deepEqual(spot, { top: 0, left: 0, width: 108, height: 48 });
});

test('a click inside the highlighted target advances; elsewhere it does not', () => {
  const target = { contains: node => node === 'inside' };
  assert.equal(Tour.clickAdvances('inside', target), true);
  assert.equal(Tour.clickAdvances('outside', target), false);
  assert.equal(Tour.clickAdvances('inside', null), false);
});

test('storage tour lights up the whole dialog on archive/confirm but only advances on the right button', () => {
  const html = require('node:fs').readFileSync(require.resolve('../index.html'), 'utf8');
  const tour = html.slice(html.indexOf('window.startStorageTour'), html.indexOf('// --- ARCHIVAR MESES ANTIGUOS ---'));
  assert.match(tour, /target: '#modal-confirm\.active \.btn-danger', spotlight: '#modal-confirm\.active \.modal-content'/);
  assert.match(tour, /target: '#btn-archive-run', spotlight: '#modal-archive-months\.active \.modal-content'/);
  const src = require('node:fs').readFileSync(require.resolve('../src/guided-tour.ts'), 'utf8');
  assert.match(src, /step\.spotlight/);
});

test('choosing how many months to keep is its own step, before saving', () => {
  const html = require('node:fs').readFileSync(require.resolve('../index.html'), 'utf8');
  const tour = html.slice(html.indexOf('window.startStorageTour'), html.indexOf('// --- ARCHIVAR MESES ANTIGUOS ---'));
  const keep = tour.indexOf("target: '.archive-keep-pills'");
  assert.ok(keep > -1 && keep < tour.indexOf("target: '#btn-archive-run'"));
  const src = require('node:fs').readFileSync(require.resolve('../src/guided-tour.ts'), 'utf8');
  assert.match(src, /scrollIntoView\(\{ block: 'nearest'/);
});
