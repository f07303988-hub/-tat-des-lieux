/*
 * Service worker — État des lieux numérique
 * Rôle : rendre l'appli utilisable hors connexion et installable (PWA).
 * Il ne touche JAMAIS à IndexedDB ni aux données : il ne gère que les fichiers de l'appli
 * (index.html, manifest, icônes) dans le Cache Storage.
 *
 * Stratégie : "stale-while-revalidate" — l'appli s'ouvre instantanément depuis le cache
 * (pas d'écran blanc, même sans réseau) et se met à jour en arrière-plan : une nouvelle
 * version de index.html est donc prise en compte au lancement SUIVANT.
 *
 * Le nom du cache est préfixé : ce service worker ne supprime que SES anciens caches
 * (le Cache Storage est partagé par tout le domaine, par ex. github.io).
 */
const CACHE_PREFIX = 'edl-numerique-shell-';
const CACHE = CACHE_PREFIX + 'v6';
const SHELL_KEY = './index.html';
const OPTIONAL = ['./', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(SHELL_KEY, { cache: 'reload' })); // indispensable (contourne le cache HTTP)
    await Promise.all(OPTIONAL.map((u) => cache.add(u).catch(() => {}))); // au mieux
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE).map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate';
  const key = isNav ? SHELL_KEY : req;

  const cachePromise = caches.open(CACHE);
  const update = cachePromise.then((cache) =>
    fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    })
  );
  event.waitUntil(update.catch(() => {}));
  event.respondWith(
    cachePromise
      .then((cache) => cache.match(key, { ignoreSearch: true }))
      .then((cached) => cached || update)
  );
});
