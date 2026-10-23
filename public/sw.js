// Service worker: bewaart de app en alle content voor offline gebruik.
// De precache-lijst en versie worden bij `npm run build` ingevuld (zie vite.config.js).
self.__PRECACHE__ = [];
const VERSION = 'dev';
const CACHE = 'toetsentuin-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(self.__PRECACHE__)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('toetsentuin-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  // Akkoorden zoeken/inladen gaat altijd via het netwerk.
  if (url.pathname.startsWith('/.netlify/')) return;
  // Content (JSON) en pagina's: eerst netwerk (zodat nieuwe lessen meteen verschijnen), anders de cache.
  if (req.mode === 'navigate' || url.pathname.includes('/content/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./'))),
    );
    return;
  }
  // Overige bestanden (scripts, stijlen, iconen): eerst de cache.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })),
  );
});
