const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const sw = readFileSync(require.resolve('../sw.js'), 'utf8');
const html = readFileSync(require.resolve('../index.html'), 'utf8');

test('install precaches fresh bytes: bypasses the HTTP cache and CDN edge', () => {
  const install = sw.slice(sw.indexOf("self.addEventListener('install'"), sw.indexOf("self.addEventListener('activate'"));
  assert.match(install, /freshRequest\(/);
  assert.doesNotMatch(install, /cache\.addAll\(PRECACHE_ASSETS\)/, 'addAll goes through the HTTP cache');
  const fresh = sw.slice(sw.indexOf('function freshRequest'), sw.indexOf("self.addEventListener('install'"));
  assert.match(fresh, /cache:\s*'reload'/);
  assert.match(fresh, /searchParams\.set\('__v', CACHE_VERSION\)/);
});

test('navigation is network-first with an offline/slow fallback to the cache', () => {
  const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
  assert.match(fetchHandler, /networkFirstNavigation\(/);
  const nav = sw.slice(sw.indexOf('function networkFirstNavigation'), sw.indexOf("self.addEventListener('fetch'"));
  assert.match(nav, /cache:\s*'no-cache'/);
  assert.match(nav, /NAVIGATION_TIMEOUT_MS/);
  assert.match(nav, /caches\.match/);
});

test('Buscar actualizaciones uses the release manager and the old fallback opens safe repair', () => {
  const body = html.slice(html.indexOf('async function clearCacheAndReload()'), html.indexOf('function installPWA()'));
  assert.match(body, /MiniUpdates\.repair\(/);
  assert.doesNotMatch(body, /caches\.delete|unregister\(/);
  assert.match(html, /onclick="window\.MiniUpdates\.check\(\)"/);
  const ui = readFileSync(require.resolve('../app-updates.js'), 'utf8');
  assert.match(ui, /app-release\.json\?__incoming=/);
  assert.match(ui, /cache:\s*'no-store'/);
});

test('update-check requests (?__v=) are never answered from the service-worker cache', () => {
  const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
  assert.match(fetchHandler, /searchParams\.has\('__v'\) && event\.request\.mode !== 'navigate'\) return;/);
  assert.doesNotMatch(fetchHandler, /ignoreSearch:\s*url\.searchParams/);
});

test('help videos bypass the service worker (range requests, not cached)', () => {
  const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
  assert.match(fetchHandler, /url\.pathname\.endsWith\('\.webm'\)\) return;/);
});
