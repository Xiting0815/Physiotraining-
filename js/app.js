// Bootstrap. See docs/SPEC.md §7.
import * as store from './store.js';
import { loadContent } from './content.js';
import { startRouter } from './router.js';
import { unlock } from './util/audio.js';
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
  store.subscribe((d) => applyTheme(d.settings.theme));

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

  // Service worker (stub in WP0; implemented in WP-PWA). Relative URL for GitHub Pages.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

main();
