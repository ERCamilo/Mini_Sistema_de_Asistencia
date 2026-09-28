const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const load = () => import('../scripts/bump-version.mjs');

test('bumps the patch once when the branch still has main\'s version', async () => {
  const { decideVersion } = await load();
  assert.equal(decideVersion({ current: '2.13.0', base: '2.13.0' }), '2.13.1');
  assert.equal(decideVersion({ current: '2.13.9', base: '2.13.9' }), '2.13.10');
});

test('keeps a version that was already bumped or set by hand', async () => {
  const { decideVersion } = await load();
  assert.equal(decideVersion({ current: '2.13.1', base: '2.13.0' }), '2.13.1', 'second commit of the same PR');
  assert.equal(decideVersion({ current: '2.14.0', base: '2.13.0' }), '2.14.0', 'manual minor bump');
  assert.equal(decideVersion({ current: '3.0.0', base: '2.13.4' }), '3.0.0', 'manual major bump');
});

test('without a base (no main available) the version is left alone', async () => {
  const { decideVersion } = await load();
  assert.equal(decideVersion({ current: '2.13.0', base: null }), '2.13.0');
});

test('rejects non semantic versions instead of guessing', async () => {
  const { decideVersion } = await load();
  assert.throws(() => decideVersion({ current: '2.13', base: '2.13' }), /semver/i);
});

test('pre-commit hook bumps then stamps and stages only version + generated files', () => {
  const hook = readFileSync(require.resolve('../.githooks/pre-commit'), 'utf8');
  assert.ok(hook.indexOf('node scripts/bump-version.mjs') < hook.indexOf('node scripts/stamp-build.mjs'));
  assert.match(hook, /git add package\.json package-lock\.json build-info\.js sw\.js/);
});

test('build-info and the service worker cache always carry package.json\'s version', () => {
  const pkg = JSON.parse(readFileSync(require.resolve('../package.json'), 'utf8'));
  const info = readFileSync(require.resolve('../build-info.js'), 'utf8');
  const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
  assert.match(info, new RegExp(`version: "${pkg.version.replace(/\./g, '\\.')}"`));
  assert.match(sw, new RegExp(`CACHE_VERSION = 'asistencia-v${pkg.version.replace(/\./g, '\\.')}-`));
});
