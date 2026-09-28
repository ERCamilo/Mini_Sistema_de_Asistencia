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

test('"Buscar actualización" checks the published build before forcing an update', () => {
  const body = html.slice(html.indexOf('async function clearCacheAndReload()'), html.indexOf('function installPWA()'));
  assert.match(body, /fetchPublishedBuild\(/);
  assert.match(body, /Ya tenés la última versión/);
  assert.match(body, /location\.replace\(/);
  const fetcher = html.slice(html.indexOf('async function fetchPublishedBuild'), html.indexOf('async function clearCacheAndReload()'));
  assert.match(fetcher, /cache:\s*'no-store'/);
  assert.match(fetcher, /build-info\.js\?__v=/);
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
