// Bootstrap. See docs/SPEC.md §7.
import * as store from './store.js';
import { loadContent } from './content.js';
import { startRouter } from './router.js';
import { unlock } from './util/audio.js';
import { applyFontScale } from './views/ui.js';
import './components/pt-timer.js';
import './components/pt-figure.js';
import './components/pt-pain-scale.js';

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

async function main() {
  const root = document.getElementById('app');
  const data = store.load();
  applyTheme(data.settings.theme);
  applyFontScale(data.settings);
  store.subscribe((d) => { applyTheme(d.settings.theme); applyFontScale(d.settings); });

  // Unlock audio on first user gesture (iOS/Safari requirement).
  window.addEventListener('pointerdown', () => unlock(), { once: true, capture: true });

  let content;
  try {
    content = await loadContent();
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="card"><h2>Inhalte nicht geladen</h2><p>Bitte Verbindung prüfen und neu laden.</p></div>';
    return;
  }

  startRouter({ root, ctx: { store, content } });

}

// ---- WP-PWA: service worker registration + update toast (owned by WP-PWA) -------------------
// Relative URL for GitHub Pages. A new SW waits until the user taps „neu laden“ in the toast,
// then gets {type:'SKIP_WAITING'}; on controllerchange the page reloads once.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const sw = navigator.serviceWorker;
  let reloading = false;
  let userAccepted = false;
  sw.addEventListener('controllerchange', () => {
    if (!userAccepted || reloading) return;
    reloading = true;
    location.reload();
  });
  const showUpdateToast = (worker) => {
    if (!worker || document.querySelector('.toast--update')) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast--update';
    toast.setAttribute('role', 'status');
    toast.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);'
      + 'bottom:calc(var(--tabbar-h,64px) + var(--safe-bottom,env(safe-area-inset-bottom,0px)) + 12px);'
      + 'z-index:1000;display:flex;align-items:center;gap:12px;max-width:calc(100% - 32px);'
      + 'padding:10px 10px 10px 16px;border-radius:var(--radius,16px);background:var(--text,#14181F);'
      + 'color:var(--bg,#fff);box-shadow:var(--shadow-2,0 8px 24px rgba(0,0,0,.2))';
    toast.innerHTML = '<span style="white-space:nowrap">Update verfügbar –</span>'
      + '<button type="button" class="btn btn--primary" data-sw-reload>neu laden</button>';
    toast.querySelector('[data-sw-reload]').addEventListener('click', () => {
      userAccepted = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    document.body.appendChild(toast);
  };
  sw.register('./sw.js').then((reg) => {
    if (!reg) return; // registration blocked (e.g. some embedded browsers)
    if (reg.waiting && sw.controller) showUpdateToast(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && sw.controller) showUpdateToast(nw);
      });
    });
    // look for updates when the app returns to the foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('SW registration failed', e));
}
registerServiceWorker();
// ---- /WP-PWA --------------------------------------------------------------------------------

main();
