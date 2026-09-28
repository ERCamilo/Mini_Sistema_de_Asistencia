const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const MiniNotice = require('../mini-notice.js');

test('springStep converges to the target with a small overshoot (physics feel)', () => {
  let state = { value: 40, velocity: 0 };
  let peak = 40;
  for (let i = 0; i < 120; i += 1) {
    state = MiniNotice.springStep(state, 200, 1 / 60);
    peak = Math.max(peak, state.value);
  }
  assert.ok(Math.abs(state.value - 200) < 0.5, 'settles on target');
  assert.ok(peak > 200 && peak < 215, 'overshoots a little, like Sileo bounce .25');
});

test('springStep is stable with long frames (tab resumed)', () => {
  const state = MiniNotice.springStep({ value: 0, velocity: 0 }, 100, 0.5);
  assert.ok(Number.isFinite(state.value) && state.value <= 130);
});

test('auto-dismiss policy: actions and in-flight states stay until resolved', () => {
  assert.equal(MiniNotice.autoDismissMs({ state: 'action', actions: [{ label: 'Aceptar' }] }), null);
  assert.equal(MiniNotice.autoDismissMs({ state: 'loading' }), null);
  assert.equal(MiniNotice.autoDismissMs({ state: 'progress', progress: 0.4 }), null);
  assert.equal(MiniNotice.autoDismissMs({ state: 'success' }), 4000);
  assert.equal(MiniNotice.autoDismissMs({ state: 'error' }), 7000);
  assert.equal(MiniNotice.autoDismissMs({ state: 'info', duration: 1500 }), 1500);
});

test('clampProgress keeps the ring within 0..1', () => {
  assert.equal(MiniNotice.clampProgress(-1), 0);
  assert.equal(MiniNotice.clampProgress(2), 1);
  assert.equal(MiniNotice.clampProgress(Number.NaN), 0);
  assert.equal(MiniNotice.clampProgress(0.42), 0.42);
});

test('notice styles only use theme tokens and honor reduced motion', () => {
  const css = readFileSync(require.resolve('../mini-notice.css'), 'utf8');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b|rgb\(/i);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /var\(--text-color\)/);
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\.\/mini-notice\.css">/);
  assert.match(html, /<script src="\.\/mini-notice\.js"><\/script>/);
  const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
  assert.match(sw, /'\.\/mini-notice\.js'/);
  assert.match(sw, /'\.\/mini-notice\.css'/);
});

test('overflow trimming never drops a notice that is waiting for a decision', () => {
  assert.deepEqual(
    MiniNotice.pickOverflow([
      { id: 'offer', needsDecision: true },
      { id: 'a', needsDecision: false },
      { id: 'b', needsDecision: false },
      { id: 'c', needsDecision: false }
    ], 3),
    ['a']
  );
  assert.deepEqual(MiniNotice.pickOverflow([{ id: 'x', needsDecision: true }, { id: 'y', needsDecision: true }], 1), []);
});
