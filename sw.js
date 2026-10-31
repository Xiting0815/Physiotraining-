// Service worker – offline support (WP-PWA, see docs/SPEC.md §10).
// Relative URLs only: the app is served under /Physiotraining-/ on GitHub Pages, everything is
// resolved against the SW scope (registration.scope).
//
// Strategy
//   - install: precache the complete app (PRECACHE, generated) into a versioned cache.
//   - navigations + app shell (html/css/js/icons/manifest): cache-first, network fallback.
//   - data/*.json: network-first (3 s timeout) with cache fallback, so content updates arrive
//     when online and the app still works offline.
//   - activate: delete caches of older versions, claim clients.
//   - updates: the new worker waits; the page shows "Update verfügbar – neu laden" and posts
//     {type: 'SKIP_WAITING'} when the user taps it.
//
// CACHE_VERSION and PRECACHE are rewritten by `node tools/gen-precache.mjs` – run it after adding,
// removing or changing app files (the version is a content hash, so any change triggers an update).

// <precache-version>
const CACHE_VERSION = '4288ee99d3';
// </precache-version>
const CACHE_PREFIX = 'physio-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

// <precache>
const PRECACHE = [
  'css/base.css',
  'css/components.css',
  'css/tokens.css',
  'data/badges.json',
  'data/equipment.json',
  'data/exercises.json',
  'data/phases.json',
  'data/poses.json',
  'data/quotes.json',
  'data/workouts.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/icon-maskable.svg',
  'icons/icon.svg',
  'index.html',
  'js/app.js',
  'js/components/celebrate.js',
  'js/components/charts.js',
  'js/components/pt-figure.js',
  'js/components/pt-pain-scale.js',
  'js/components/pt-timer.js',
  'js/content.js',
  'js/logic/motivation.js',
  'js/logic/progression.js',
  'js/logic/stats.js',
  'js/logic/traffic-light.js',
  'js/render.js',
  'js/router.js',
  'js/store.js',
  'js/types.js',
  'js/util/audio.js',
  'js/util/date.js',
  'js/util/export-import.js',
  'js/views/equipment.js',
  'js/views/exercise-detail.js',
  'js/views/exercises.js',
  'js/views/history.js',
  'js/views/next-day.js',
  'js/views/plan.js',
  'js/views/session-helpers.js',
  'js/views/session.js',
  'js/views/settings.js',
  'js/views/today.js',
  'js/views/ui.js',
  'manifest.webmanifest',
];
// </precache>

const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const DATA_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE.map((p) => new Request(scopeUrl(p), { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage(CACHE_VERSION);
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(appShell(req));
    return;
  }
  if (/\/data\/[^/]+\.json$/.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});

async function appShell(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(scopeUrl('index.html'));
  if (cached) return cached;
  try {
    return await fetch(req);
  } catch {
    return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p>Offline – bitte einmal online öffnen.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await withTimeout(fetch(req), DATA_TIMEOUT_MS);
    if (res.ok) {
      cache.put(req, res.clone());
      return res;
    }
    // 404 etc.: fall back to a cached copy if we have one (e.g. optional equipment.json)
    return (await cache.match(req, { ignoreSearch: true })) || res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    return cached || new Response('', { status: 504, statusText: 'Offline' });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
