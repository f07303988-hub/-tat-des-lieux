/* Service worker — État des lieux numérique
 *
 * Rôle : permettre d'ouvrir l'appli même sans réseau (salle des fêtes mal couverte).
 * Stratégie : réseau d'abord pour la page, avec une copie en cache en secours.
 *   - En ligne, la dernière version publiée est toujours servie, et la copie est mise à jour.
 *   - Hors ligne (ou réseau trop lent), la dernière copie connue est servie.
 * Les dossiers, photos et signatures sont dans IndexedDB : ils ne passent jamais par ici.
 *
 * Ce fichier doit rester dans le même dossier que index.html.
 * Changer VERSION force le nettoyage des anciennes copies sur tous les appareils.
 */
const VERSION = 'edl-v1';
const SHELL = ['./', './index.html'];
const NAV_TIMEOUT_MS = 4000; // au-delà, on préfère la copie locale à une page qui n'ouvre pas

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = req.mode === 'navigate' ? await fetchWithTimeout(req, NAV_TIMEOUT_MS) : await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        event.waitUntil(cache.put(req, res.clone()));
      }
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = (await cache.match('./index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
