<<<<<<< HEAD
const CACHE_VERSION = 'asistencia-v2';

// Todos los archivos que necesita la app para funcionar offline
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon.png',
=======
const CACHE_NAME = 'asistencia-v1';

// Archivos a cachear al instalar
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
>>>>>>> origin/main
  './icon-192.png',
  './icon-512.png'
];

<<<<<<< HEAD
// Instalar: precachear todos los assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
=======
// Instalar: cachear todos los assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
>>>>>>> origin/main
  );
  self.skipWaiting();
});

<<<<<<< HEAD
// Activar: limpiar caches de versiones anteriores
=======
// Activar: limpiar caches viejos
>>>>>>> origin/main
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
<<<<<<< HEAD
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
=======
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
>>>>>>> origin/main
      )
    )
  );
  self.clients.claim();
});

<<<<<<< HEAD
// Fetch: estrategia segun tipo de recurso
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Para navegacion (HTML): stale-while-revalidate
  // Sirve la version cacheada inmediatamente, pero actualiza en background
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Para assets estaticos (iconos, manifest): cache-first
=======
// Fetch: cache-first para assets, network-first para el resto
self.addEventListener('fetch', event => {
  // Solo manejar peticiones GET
  if (event.request.method !== 'GET') return;

>>>>>>> origin/main
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

<<<<<<< HEAD
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
=======
      return fetch(event.request)
        .then(response => {
          // Solo cachear respuestas válidas
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sin conexión y sin caché: devolver página principal
          return caches.match('./index.html');
        });
>>>>>>> origin/main
    })
  );
});
