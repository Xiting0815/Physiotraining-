// Hash router. See docs/SPEC.md §4 and §7.2.

/** @type {import('./types.js').Route[]} */
export const routes = [
  { pattern: '/heute', view: 'today', tab: 'heute', title: 'Heute' },
  { pattern: '/plan', view: 'plan', tab: 'plan', title: 'Plan' },
  { pattern: '/uebungen', view: 'exercises', tab: 'uebungen', title: 'Übungen' },
  { pattern: '/uebung/:id', view: 'exercise-detail', tab: 'uebungen', title: 'Übung' },
  { pattern: '/session', view: 'session', tab: null, title: 'Training', hideTabs: true },
  { pattern: '/folgetag', view: 'next-day', tab: 'heute', title: 'Folgetag-Check' },
  { pattern: '/verlauf', view: 'history', tab: 'verlauf', title: 'Verlauf' },
  { pattern: '/mehr', view: 'settings', tab: 'mehr', title: 'Mehr' },
  { pattern: '/ausruestung', view: 'equipment', tab: 'mehr', title: 'Ausrüstung' },
  // v2 (SPEC §12.12)
  { pattern: '/eigene', view: 'custom-workouts', tab: 'plan', title: 'Eigene Workouts' },
  { pattern: '/eigene/:id', view: 'custom-workout-edit', tab: 'plan', title: 'Eigenes Workout' },
  { pattern: '/auswertung', view: 'insights', tab: 'verlauf', title: 'Auswertung' },
  { pattern: '/profil', view: 'profile', tab: 'mehr', title: 'Trainingsziele' },
];

export const DEFAULT_PATH = '/heute';

/**
 * Pure route matcher.
 * @param {string} hash e.g. "#/uebung/quad-set?x=1"
 * @returns {{route: import('./types.js').Route, params: Record<string,string>, query: Record<string,string>, path: string}}
 */
export function matchRoute(hash) {
  let h = String(hash || '').replace(/^#/, '');
  if (!h.startsWith('/')) h = '/' + h;
  const [pathPart, queryPart = ''] = h.split('?');
  const path = pathPart.replace(/\/+$/, '') || '/';
  const query = {};
  for (const pair of queryPart.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  const segs = path.split('/').filter(Boolean);
  for (const route of routes) {
    const rsegs = route.pattern.split('/').filter(Boolean);
    if (rsegs.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rsegs.length; i++) {
      if (rsegs[i].startsWith(':')) params[rsegs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (rsegs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { route, params, query, path };
  }
  const fallback = routes.find((r) => r.pattern === DEFAULT_PATH);
  return { route: fallback, params: {}, query, path: DEFAULT_PATH };
}

/** @param {string} path e.g. "/uebung/quad-set" */
export function navigate(path) {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

/**
 * @param {{root: HTMLElement, ctx: Omit<import('./types.js').ViewContext,'params'|'query'>, onRoute?: (m: ReturnType<typeof matchRoute>) => void}} opts
 */
export function startRouter({ root, ctx, onRoute }) {
  let cleanup = null;
  let token = 0;

  async function handle() {
    const m = matchRoute(location.hash);
    const my = ++token;
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;

    document.body.classList.toggle('is-session', !!m.route.hideTabs);
    for (const a of document.querySelectorAll('.tabbar [data-tab]')) {
      if (a.getAttribute('data-tab') === m.route.tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }

    try {
      const mod = await import(`./views/${m.route.view}.js`);
      if (my !== token) return;
      document.title = `${mod.title || m.route.title} · Physio`;
      const result = await mod.render(root, { ...ctx, params: m.params, query: m.query, navigate });
      if (my !== token) { if (typeof result === 'function') result(); return; }
      cleanup = typeof result === 'function' ? result : null;
    } catch (err) {
      console.error('Route render failed', err);
      root.innerHTML = '<div class="card"><h2>Hoppla</h2><p>Diese Seite konnte nicht geladen werden.</p><a class="btn" href="#/heute">Zu Heute</a></div>';
    }
    window.scrollTo(0, 0);
    root.focus({ preventScroll: true });
    onRoute?.(m);
  }

  window.addEventListener('hashchange', handle);
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    history.replaceState(null, '', '#' + DEFAULT_PATH);
  }
  handle();
  return () => window.removeEventListener('hashchange', handle);
}
