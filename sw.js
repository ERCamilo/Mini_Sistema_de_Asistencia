const CACHE_VERSION = 'asistencia-v2.13.4-20260928-213447-419';

// Todos los archivos que necesita la app para funcionar offline
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './build-info.js',
  './employee-number-rules.js',
  './employee-number-modal.js',
  './employee-repository.js',
  './draft-import.js',
  './attendance-report.js',
  './mini-data.js',
  './attendance-repository.js',
  './attendance-coordinator.js',
  './attendance-export.js',
  './import-history-repository.js',
  './work-context.js',
  './bulk-actions.js',
  './local-date.js',
  './storage-maintenance.js',
  './attendance-archive.js',
  './storage-help.js',
  './guided-tour.js',
  './tutorials.js',
  './tutorial-player.js',
  // Tutorial captions: tiny, so the steps show even offline (videos are not precached).
  './tutorials/marcar-asistencia.json',
  './tutorials/agregar-empleado.json',
  './tutorials/liberar-espacio.json',
  './icon-set.js',
  './check-cycle.js',
  './local-db.js',
  './mini-sa-envelope.js',
  './roster-package.js',
  './sa-roster-import.js',
  './p2p-core.js',
  './p2p-pairing.js',
  './p2p-peer-alias-store.js',
  './p2p-activity-store.js',
  './sa-roster-version-guard.js',
  './mini-notice.js',
  './mini-notice.css',
  './p2p-backup-consent.js',
  './mini-backup-summary.js',
  './mini-backup-review.js',
  './p2p-backup-bridge.js',
  './vendor/qrcode.js',
  './back-navigation.js',
  './mini-welcome.js',
  './p2p-roster-ui.js',
  './p2p-transfer.css',
  './field-requests.js',
  './field-requests-coordinator.js',
  './field-requests-repository.js',
  './manifest.json',
  './icon.svg',
  './sa-app-icon.svg',
  './icon.png',
  './icon-192.png',
  './icon-512.png'
];

// Fresh copy of an asset: skips the browser HTTP cache (GitHub Pages sends
// max-age=600) and the CDN edge (unique query per version), so a new version
// never precaches the previous version's files.
function freshRequest(asset) {
  const url = new URL(asset, self.location.href);
  url.searchParams.set('__v', CACHE_VERSION);
  return new Request(url.toString(), { cache: 'reload' });
}

// Instalar: precachear todos los assets (bytes frescos, clave sin query)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => Promise.all(PRECACHE_ASSETS.map(async asset => {
      const response = await fetch(freshRequest(asset));
      if (!response.ok) throw new Error('Precache failed: ' + asset + ' ' + response.status);
      await cache.put(new Request(new URL(asset, self.location.href).toString()), response);
    })))
  );
  self.skipWaiting();
});

// Tutorial videos the user saved for offline use survive app updates.
const KEEP_CACHE_PREFIXES = ['mini-tutorials-'];

// Activar: limpiar caches de versiones anteriores
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION && !KEEP_CACHE_PREFIXES.some(p => k.startsWith(p))).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// HTML: network-first so an online user always gets the latest version;
// falls back to the cached page when offline or when the network is too slow.
const NAVIGATION_TIMEOUT_MS = 4000;
function networkFirstNavigation(request) {
  const fromCache = () => caches.open(CACHE_VERSION)
    .then(cache => cache.match(request, { ignoreSearch: true }))
    .then(cached => cached || caches.match('./index.html'));
  const network = fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }))
    .then(response => {
      if (response && response.status === 200) {
        const copy = response.clone();
        const key = new URL(request.url);
        key.search = '';
        caches.open(CACHE_VERSION).then(cache => cache.put(key.toString(), copy));
      }
      return response;
    });
  const timeout = new Promise(resolve => setTimeout(resolve, NAVIGATION_TIMEOUT_MS)).then(fromCache);
  return Promise.race([network.catch(fromCache), timeout])
    .then(response => response || network.catch(fromCache));
}

// Fetch: estrategia segun tipo de recurso
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Tutorial videos stream with range requests: let the browser handle them.
  if (url.pathname.endsWith('.webm')) return;

  // Cache-busting requests (update check) must always reach the network.
  if (url.searchParams.has('__v') && event.request.mode !== 'navigate') return;

  // Para navegacion (HTML): network-first con respaldo offline
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  // Para assets estaticos (iconos, manifest): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback: si es una pagina, devolver index.html cacheado
        return caches.match('./index.html');
      });
    })
  );
});
