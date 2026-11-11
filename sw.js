// Service worker – offline support (WP-PWA, see docs/SPEC.md §10).
// Relative URLs only: the app is served under /Physiotraining-/ on GitHub Pages, everything is
// resolved against the SW scope (registration.scope).
//
// Strategy
//   - install: precache the complete app (PRECACHE, generated) into a versioned cache.
//   - navigations + app shell (html/css/js/icons/manifest): cache-first, network fallback.
//   - data/*.json: cache-first from the SAME versioned cache as the JS (v5.1, audit P1-6). Content and code
//     always come from one app version; new content arrives with a new SW version (content hash) like code.
//   - activate: delete caches of older versions, claim clients.
//   - v5.2: Google endpoints (sign-in script, Drive API) are never cached – the sync needs the network anyway.
//   - updates: the new worker waits; the page shows "Update verfügbar – neu laden" and posts
//     {type: 'SKIP_WAITING'} when the user taps it.
//   - v3.1 (SPEC §14): the import features (offline OCR, Web Share Target) were removed. activate also
//     deletes their old caches ("pt-share", "pt-ocr-*", ~7 MB) so existing installs free the space.
//
// CACHE_VERSION and PRECACHE are rewritten by `node tools/gen-precache.mjs` – run it after adding,
// removing or changing app files (the version is a content hash, so any change triggers an update).

// <precache-version>
const CACHE_VERSION = '88b77423c1';
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
  'js/logic/cardio.js',
  'js/logic/cues.js',
  'js/logic/custom-workouts.js',
  'js/logic/duration.js',
  'js/logic/energy.js',
  'js/logic/equipment.js',
  'js/logic/insights.js',
  'js/logic/motivation.js',
  'js/logic/next-day.js',
  'js/logic/progression.js',
  'js/logic/schedule.js',
  'js/logic/shoulder.js',
  'js/logic/stats.js',
  'js/logic/traffic-light.js',
  'js/render.js',
  'js/router.js',
  'js/store.js',
  'js/sync/auth.js',
  'js/sync/config.js',
  'js/sync/drive.js',
  'js/sync/engine.js',
  'js/sync/merge.js',
  'js/sync/ui.js',
  'js/types.js',
  'js/util/audio.js',
  'js/util/date.js',
  'js/util/export-import.js',
  'js/util/voice.js',
  'js/views/custom-workout-edit.js',
  'js/views/custom-workouts.js',
  'js/views/equipment.js',
  'js/views/exercise-detail.js',
  'js/views/exercises.js',
  'js/views/history.js',
  'js/views/insights.js',
  'js/views/next-day.js',
  'js/views/plan.js',
  'js/views/profile.js',
  'js/views/session-helpers.js',
  'js/views/session.js',
  'js/views/settings.js',
  'js/views/today.js',
  'js/views/ui.js',
  'js/views/v2-shared.js',
  'manifest.webmanifest',
];
// </precache>

/** Caches of removed v3 features (OCR runtime cache, shared-files inbox) – deleted on activate. */
const isLegacyCache = (k) => k === 'pt-share' || k.startsWith('pt-ocr-');

/** Hosts of Google sign-in / Drive API – never served from or written to the cache. */
const isGoogleHost = (h) => h === 'accounts.google.com' || h === 'www.googleapis.com' || h === 'oauth2.googleapis.com'
  || h.endsWith('.google.com') || h.endsWith('.googleapis.com') || h.endsWith('.gstatic.com');

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

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
      .filter((k) => (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) || isLegacyCache(k))
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
  const url = new URL(req.url);
  // v5.2 (SPEC §17): Google sign-in (accounts.google.com) and Drive (www.googleapis.com) – like every other
  // cross-origin request – always go straight to the network and are never cached.
  if (isGoogleHost(url.hostname)) return;
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(appShell(req));
    return;
  }
  // data/*.json is precached → cacheFirst like the app shell (no version skew between JS and content)
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
