const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const BackNavigation = require('../back-navigation.js');

// Minimal browser-like history: an entry stack plus async popstate on back().
function createHarness({ reloadedOnGuard = false } = {}) {
  const entries = reloadedOnGuard ? [{ base: true }, { miniBackGuard: true }] : [{ base: true }];
  let index = entries.length - 1;
  let popListener = null;
  let exited = false;
  const layers = [];
  const history = {
    pushState(state) { entries.splice(index + 1); entries.push(state); index += 1; },
    back() {
      if (index === 0) { exited = true; return; }
      index -= 1;
      queueMicrotask(() => popListener && popListener());
    }
  };
  Object.defineProperty(history, 'state', { get: () => entries[index] });
  const nav = BackNavigation.createBackNavigation({
    history,
    addPopListener: fn => { popListener = fn; },
    resolveLayer: () => {
      const top = layers[layers.length - 1];
      if (!top) return null;
      if (top === 'block') return 'block';
      return () => layers.pop();
    }
  });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  return {
    nav, layers, flush,
    depth: () => index,
    exited: () => exited,
    open(name) { layers.push(name); nav.sync(); },
    pressBack: async () => { history.back(); await flush(); }
  };
}

test('back closes the top layer and then the next one', async () => {
  const h = createHarness();
  h.open('modal');
  h.open('confirm');
  assert.equal(h.depth(), 1, 'one guard entry, not one per layer');
  await h.pressBack();
  assert.deepEqual(h.layers, ['modal']);
  assert.equal(h.depth(), 1, 'guard restored while something is still open');
  await h.pressBack();
  assert.deepEqual(h.layers, []);
  assert.equal(h.depth(), 0);
  await h.pressBack();
  assert.equal(h.exited(), true, 'at the root, back leaves the app');
});

test('closing a layer from the UI consumes the guard so back is not swallowed', async () => {
  const h = createHarness();
  h.open('modal');
  h.layers.pop();
  h.nav.sync();
  await h.flush();
  assert.equal(h.depth(), 0);
  await h.pressBack();
  assert.equal(h.exited(), true);
});

test('a blocking layer (welcome gate) keeps the user in place', async () => {
  const h = createHarness();
  h.open('block');
  await h.pressBack();
  assert.deepEqual(h.layers, ['block']);
  assert.equal(h.depth(), 1);
  assert.equal(h.exited(), false);
});

test('index.html resolves back layers in keyboard-Escape order plus P2P steps and tabs', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  const resolver = html.slice(html.indexOf('function resolveBackLayer'), html.indexOf('window.BackNavigation.createBackNavigation'));
  const order = ['MiniWelcome', 'modal-confirm', 'employee-number-conflict-modal', 'mini-p2p', 'activeBigModal', 'add-menu-open', ".modal.active", "currentView !== 'attendance'"];
  let last = -1;
  for (const marker of order) {
    const at = resolver.indexOf(marker);
    assert.ok(at > last, marker + ' in order');
    last = at;
  }
  assert.match(html, /<script src="\.\/back-navigation\.js"><\/script>/);
  assert.match(readFileSync(require.resolve('../sw.js'), 'utf8'), /'\.\/back-navigation\.js'/);
});

test('a reload on a guard entry adopts it instead of stacking a second guard', async () => {
  const h = createHarness({ reloadedOnGuard: true });
  h.nav.sync();
  await h.flush();
  assert.equal(h.depth(), 0, 'stale guard consumed at the root');
  await h.pressBack();
  assert.equal(h.exited(), true);

  const opened = createHarness({ reloadedOnGuard: true });
  opened.open('modal');
  assert.equal(opened.depth(), 1, 'reuses the existing guard');
});
