/* Japon 2027 : seule l'appli vide est mise en cache, jamais les données (elles restent dans IndexedDB). */
/* À chaque version : changer VERSION ici ET APP_VERSION dans index.html (le test vérifie qu'elles sont égales). */
const VERSION = '2026.11.13-4';
const CACHE = 'japon-2027-' + VERSION;
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', event => {
  // Tout est téléchargé et vérifié avant de remplacer l'ancienne version.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('japon-2027-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// La page demande la nouvelle version quand Pierrick touche « Mettre à jour ».
self.addEventListener('message', event => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // TikTok, taux de change… : réseau normal
  if (req.mode === 'navigate') {
    // Y compris « /?lien=… » envoyé par le menu Partager d'Android.
    event.respondWith(caches.match('index.html', { ignoreSearch: true }).then(r => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
