// ===== iAcordes — Service Worker =====
// Estrategia: cache-first para los recursos propios (la app es 1 archivo HTML
// gigante, así que cachearla = tenerla offline). Las fuentes de Google se
// cachean con stale-while-revalidate.
//
// Si cambiás algo en index.html, subí el número de CACHE_VERSION para que el
// celular descargue la nueva versión.

const CACHE_VERSION = 'iacordes-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// --- INSTALL: cacheá los archivos esenciales ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// --- ACTIVATE: borrá caches viejos ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- FETCH ---
self.addEventListener('fetch', event => {
  const req = event.request;

  // Solo cacheamos GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Fuentes de Google: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_VERSION + '-fonts').then(cache =>
        cache.match(req).then(cached => {
          const fetchPromise = fetch(req).then(resp => {
            if (resp && resp.status === 200) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Origen propio: cache-first con fallback a red
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          // Guardamos copias de respuestas exitosas
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
          }
          return resp;
        }).catch(() => {
          // Sin red y sin caché: si pidieron una página, devolvé el index
          if (req.mode === 'navigate') return caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Otras URLs (CDNs externos, proxies de fetch de letras, etc.): pasan directo
  // No las cacheamos para no romper la lógica de carga remota.
});
