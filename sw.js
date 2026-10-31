// Service worker stub (WP0). Real offline caching is implemented in WP-PWA (see docs/SPEC.md §10).
// Must use relative URLs only – the app is served under /Physiotraining-/ on GitHub Pages.
// CACHE_VERSION will be introduced in WP-PWA.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

