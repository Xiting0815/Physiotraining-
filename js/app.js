// Bootstrap. See docs/SPEC.md §7.
// v5.1 hardening (audit P0-1, P0-2, P0-3, P1-6, P2-4, P2-5, P2-6, P2-8):
//   - crash handlers are installed BEFORE any app module is imported (all imports are dynamic), so a broken module
//     or broken data shows the German fallback card „Da ist etwas schiefgelaufen“ instead of a blank screen;
//   - notices (inline styles, host #pt-notices above #app): save failure, corrupt data copy, newer data version,
//     discarded active session, change in another window, storage almost full;
//   - the SW update toast is deferred while a training runs (body.is-session).
//
// Notices are rendered here only; views do not need to show them (store flags are reset by these notices).

/** @type {typeof import('./store.js')|null} */
let storeMod = null;
let booted = false;

// ---- small DOM helpers -------------------------------------------------------------------------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Trigger a file download. @param {string} text @param {string} filename @param {string} [type] */
function downloadText(text, filename, type = 'application/json') {
  try {
    const blob = new Blob([text ?? ''], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { console.error('Download fehlgeschlagen', e); }
}

/**
 * Raw localStorage content for „Daten sichern“ – works even when the store module could not be loaded.
 * (Emergency exception to „store.js is the only module touching localStorage“: read-only.)
 */
function rawDump() {
  try {
    if (storeMod?.rawSnapshot) return storeMod.rawSnapshot();
  } catch { /* fall through */ }
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pt.')) out[k] = localStorage.getItem(k);
    }
  } catch { /* blocked */ }
  return out;
}

/** Download pt.v1 as stored (importable when it is valid JSON) – else all pt.* keys as one JSON object. */
function downloadRawData() {
  const dump = rawDump();
  const main = dump['pt.v1'];
  let valid = false;
  try { valid = !!main && typeof JSON.parse(main) === 'object'; } catch { valid = false; }
  const others = Object.keys(dump).filter((k) => k !== 'pt.v1' && dump[k] != null);
  if (valid && !others.length) downloadText(main, `physio-rohdaten-${stamp()}.json`);
  else downloadText(JSON.stringify({ note: 'Rohdaten aus dem Browser-Speicher (localStorage)', exportedAt: new Date().toISOString(), keys: dump }, null, 2), `physio-rohdaten-${stamp()}.json`);
}

async function exportBackup() {
  try {
    const m = await import('./util/export-import.js');
    m.downloadBackup();
  } catch (e) {
    console.error(e);
    downloadRawData();
  }
}

// ---- notices -----------------------------------------------------------------------------------

const TONES = {
  error: 'border:2px solid var(--red,#D9443B);background:var(--surface,#fff)',
  warn: 'border:2px solid var(--yellow,#D4A72C);background:var(--surface,#fff)',
  info: 'border:2px solid var(--primary,#0E7C86);background:var(--surface,#fff)',
};

function noticeHost() {
  let host = document.getElementById('pt-notices');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'pt-notices';
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Hinweise');
  host.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:0 16px;margin:12px auto 0;max-width:720px;box-sizing:border-box;width:100%';
  const app = document.getElementById('app');
  if (app?.parentNode) app.parentNode.insertBefore(host, app);
  else document.body.prepend(host);
  return host;
}

/**
 * Show (or keep) a notice card. Same id → not duplicated.
 * @param {string} id
 * @param {{tone?: 'error'|'warn'|'info', title?: string, text: string, actions?: {label: string, onClick?: () => void, href?: string, primary?: boolean, close?: boolean}[], onClose?: () => void, closeLabel?: string|null}} o
 * @returns {HTMLElement}
 */
function showNotice(id, { tone = 'warn', title = '', text, actions = [], onClose, closeLabel = 'Schließen' }) {
  const host = noticeHost();
  const existing = host.querySelector(`[data-notice="${id}"]`);
  if (existing) return /** @type {HTMLElement} */ (existing);
  const el = document.createElement('div');
  el.className = 'card pt-notice';
  el.dataset.notice = id;
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.style.cssText = `${TONES[tone] || TONES.warn};color:var(--text,#14181F);border-radius:var(--radius,16px);padding:16px;margin:0;box-shadow:var(--shadow-1,none)`;
  const btns = actions.map((a, i) => (a.href
    ? `<a class="btn${a.primary ? ' btn--primary' : ''}" href="${esc(a.href)}" data-i="${i}" style="min-height:48px">${esc(a.label)}</a>`
    : `<button type="button" class="btn${a.primary ? ' btn--primary' : ''}" data-i="${i}" style="min-height:48px">${esc(a.label)}</button>`)).join('');
  el.innerHTML = `${title ? `<h2 style="margin:0 0 6px;font-size:1.125rem;line-height:1.3">${esc(title)}</h2>` : ''}`
    + `<p style="margin:0 0 12px;font-size:1rem;line-height:1.45;font-weight:600">${esc(text)}</p>`
    + `<div style="display:flex;flex-wrap:wrap;gap:8px">${btns}${closeLabel ? `<button type="button" class="btn" data-close style="min-height:48px;background:transparent">${esc(closeLabel)}</button>` : ''}</div>`;
  const close = () => { el.remove(); try { onClose?.(); } catch (e) { console.error(e); } };
  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target).closest?.('[data-i],[data-close]');
    if (!t) return;
    if (t.hasAttribute('data-close')) { close(); return; }
    const a = actions[Number(t.getAttribute('data-i'))];
    if (!a) return;
    if (a.onClick) { e.preventDefault(); a.onClick(); }
    if (a.close) close();
  });
  host.appendChild(el);
  return el;
}

const removeNotice = (id) => document.querySelector(`#pt-notices [data-notice="${id}"]`)?.remove();

// ---- fatal / crash fallback ----------------------------------------------------------------------

const fatalCardHtml = (msg) => `<div class="card" role="alert" data-fatal style="margin:16px;padding:20px;border-radius:16px;border:2px solid var(--red,#D9443B);background:var(--surface,#fff);color:var(--text,#14181F);font-family:system-ui,sans-serif">
  <h2 style="margin:0 0 8px;font-size:1.375rem">Da ist etwas schiefgelaufen</h2>
  <p style="margin:0 0 12px;font-size:1rem;line-height:1.45">Die App konnte nicht richtig starten. Deine Daten sind noch im Browser gespeichert. Lade die App neu – hilft das nicht, sichere zuerst deine Daten.</p>
  ${msg ? `<p style="margin:0 0 12px;font-size:.875rem;color:var(--muted,#5B6573);overflow-wrap:anywhere">Fehler: ${esc(msg)}</p>` : ''}
  <div style="display:flex;flex-wrap:wrap;gap:8px">
    <button type="button" class="btn btn--primary" data-fatal-reload style="min-height:48px;padding:0 16px">Neu laden</button>
    <button type="button" class="btn" data-fatal-save style="min-height:48px;padding:0 16px">Daten sichern</button>
  </div>
</div>`;

function wireFatal(el) {
  el.querySelector('[data-fatal-reload]')?.addEventListener('click', () => location.reload());
  el.querySelector('[data-fatal-save]')?.addEventListener('click', () => downloadRawData());
}

function showFatal(err) {
  console.error('Fataler Fehler', err);
  const msg = err?.message || (typeof err === 'string' ? err : '');
  const root = document.getElementById('app');
  if (!root) return;
  if (root.querySelector('[data-fatal]')) return;
  root.innerHTML = fatalCardHtml(msg);
  wireFatal(root);
}

/** Benign errors that must not alarm the user (layout loops, media/wake-lock/speech permission). */
function benign(reason) {
  const name = reason?.name || '';
  const msg = String(reason?.message || reason || '');
  if (['AbortError', 'NotAllowedError', 'NotSupportedError', 'InvalidStateError'].includes(name)) return true;
  return /ResizeObserver loop|^Script error\.?$/i.test(msg);
}

let lastRuntimeNotice = 0;
function onRuntimeError(reason) {
  if (benign(reason)) return;
  if (!booted) { showFatal(reason); return; }
  console.error('Unerwarteter Fehler', reason);
  const now = Date.now();
  if (now - lastRuntimeNotice < 60_000) return; // throttle
  lastRuntimeNotice = now;
  showNotice('runtime-error', {
    tone: 'error',
    title: 'Da ist etwas schiefgelaufen',
    text: 'Ein unerwarteter Fehler ist aufgetreten. Lade die App neu – hilft das nicht, sichere deine Daten.',
    actions: [
      { label: 'Neu laden', primary: true, onClick: () => location.reload() },
      { label: 'Daten sichern', onClick: () => downloadRawData() },
    ],
  });
}

function installCrashHandlers() {
  window.addEventListener('error', (e) => {
    // resource load errors (img/script tags) do not carry an `error` and do not bubble to window
    if (!e.error && !e.message) return;
    onRuntimeError(e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => onRuntimeError(e.reason));
}

// ---- theme (P2-6) ------------------------------------------------------------------------------

const THEME_COLORS = { light: '#0E7C86', dark: '#0F1216' };

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  // <meta name="theme-color"> per effective theme: the media-bound tags follow the system; an explicit theme
  // overrides both.
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const media = m.getAttribute('media') || '';
    const sys = media.includes('dark') ? 'dark' : 'light';
    m.setAttribute('content', THEME_COLORS[theme === 'light' || theme === 'dark' ? theme : sys]);
  }
}

// ---- store-related notices ----------------------------------------------------------------------

const SAVE_NOTICE_MIN_GAP_MS = 2 * 60_000;
const USAGE_HINT_BYTES = 3.5 * 1024 * 1024;

function wireStoreNotices(store) {
  // P0-1: failed writes → throttled, dismissible banner; disappears once a later write succeeds
  let saveDismissedAt = 0;
  const showSaveError = () => {
    if (Date.now() - saveDismissedAt < SAVE_NOTICE_MIN_GAP_MS) return;
    showNotice('save-error', {
      tone: 'error',
      text: 'Speichern fehlgeschlagen – Speicher voll oder gesperrt. Bitte jetzt eine Sicherung exportieren.',
      actions: [
        { label: 'Sicherung exportieren', primary: true, onClick: () => exportBackup() },
        { label: 'Mehr', href: '#/mehr' },
      ],
      onClose: () => { saveDismissedAt = Date.now(); },
    });
  };
  store.onSaveError(showSaveError);
  store.subscribe(() => { if (store.lastSaveOk()) removeNotice('save-error'); });
  if (!store.lastSaveOk() && !store.isReadOnly()) showSaveError();

  const issues = store.loadIssues();
  // P0-2: corrupt data → copy kept (or read-only when the copy failed)
  if (issues.corrupt) {
    const key = issues.corrupt.key;
    showNotice('corrupt', {
      tone: 'error',
      text: issues.corrupt.preserved
        ? 'Deine gespeicherten Daten waren beschädigt. Eine Kopie wurde aufbewahrt.'
        : 'Deine gespeicherten Daten waren beschädigt. Es konnte keine Kopie angelegt werden – Speichern ist gesperrt, damit nichts verloren geht.',
      actions: [{
        label: 'Kopie herunterladen',
        primary: true,
        onClick: () => {
          const raw = key ? store.readCorruptBackup(key) : rawDump()['pt.v1'];
          downloadText(raw ?? '', `physio-beschaedigt-${stamp()}.txt`, 'text/plain');
        },
      }],
    });
  }
  // P2-4: newer data version → read-only
  if (issues.newerVersion) {
    showNotice('newer', {
      tone: 'error',
      text: 'Diese Daten stammen aus einer neueren App-Version. Bitte App aktualisieren.',
      actions: [{ label: 'Neu laden', primary: true, onClick: () => location.reload() }],
    });
  }
  // P0-3: a broken active session was discarded
  if (store.getState().droppedActiveSession) {
    showNotice('dropped-session', {
      tone: 'warn',
      text: 'Ein unterbrochenes Training war beschädigt und wurde verworfen. Dein Trainingsverlauf ist unverändert.',
      onClose: () => store.update((d) => { d.state.droppedActiveSession = false; }),
    });
  }
  // P2-8: storage almost full → one-time hint
  try {
    const used = store.usageBytes();
    if (used > USAGE_HINT_BYTES && !store.getState().storageHintShown) {
      showNotice('usage', {
        tone: 'warn',
        text: `Der App-Speicher ist fast voll (${(used / 1024 / 1024).toFixed(1).replace('.', ',')} MB). Bitte exportiere eine Sicherung.`,
        actions: [{ label: 'Sicherung exportieren', primary: true, onClick: () => exportBackup() }],
      });
      store.update((d) => { d.state.storageHintShown = new Date().toISOString(); });
    }
  } catch (e) { console.warn(e); }
  // P2-5: data changed in another window/app context
  store.onExternalChange(() => {
    if (document.body.classList.contains('is-session')) {
      showNotice('external', {
        tone: 'warn',
        text: 'Deine Daten wurden in einem anderen Fenster geändert. Bitte nach dem Training neu laden, damit nichts überschrieben wird.',
        actions: [{ label: 'Neu laden', onClick: () => location.reload() }],
      });
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange')); // re-render the current view with the new data
    }
  });
}

// ---- boot ------------------------------------------------------------------------------------------

async function main() {
  const root = document.getElementById('app');
  try {
    const [store, contentMod, routerMod] = await Promise.all([
      import('./store.js'), import('./content.js'), import('./router.js'),
    ]);
    storeMod = store;
    // optional modules: a failing component must not take the whole app down
    const [ui, audio] = await Promise.all([
      import('./views/ui.js').catch((e) => { console.error(e); return null; }),
      import('./util/audio.js').catch((e) => { console.error(e); return null; }),
      ...['./components/pt-timer.js', './components/pt-figure.js', './components/pt-pain-scale.js']
        .map((p) => import(p).catch((e) => console.error(`${p} nicht geladen`, e))),
    ]);
    const applyFont = (s) => { try { ui?.applyFontScale?.(s); } catch (e) { console.error(e); } };

    const data = store.load();
    applyTheme(data.settings.theme);
    applyFont(data.settings);
    store.subscribe((d) => { applyTheme(d.settings.theme); applyFont(d.settings); });
    store.requestPersistentStorage();
    wireStoreNotices(store);

    // Unlock audio on first user gesture (iOS/Safari requirement).
    if (audio?.unlock) window.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

    let content;
    try {
      content = await contentMod.loadContent();
    } catch (err) {
      console.error(err);
      root.innerHTML = '<div class="card"><h2>Inhalte nicht geladen</h2><p>Bitte Verbindung prüfen und neu laden.</p>'
        + '<button type="button" class="btn btn--primary" data-reload style="min-height:48px">Neu laden</button></div>';
      root.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
      booted = true;
      return;
    }

    routerMod.startRouter({ root, ctx: { store, content } });
    booted = true;
  } catch (err) {
    showFatal(err);
  }
}

// ---- WP-PWA: service worker registration + update toast -----------------------------------------
// Relative URL for GitHub Pages. A new SW waits until the user taps „neu laden“ in the toast,
// then gets {type:'SKIP_WAITING'}; on controllerchange the page reloads once.
// v5.1 (P1-6): never during a training – the toast waits until body.is-session is gone (route change).
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const sw = navigator.serviceWorker;
  let reloading = false;
  let userAccepted = false;
  let deferred = null;
  let observer = null;
  sw.addEventListener('controllerchange', () => {
    if (!userAccepted || reloading) return;
    reloading = true;
    location.reload();
  });
  const inSession = () => document.body.classList.contains('is-session');
  const flushDeferred = () => {
    if (!deferred || inSession()) return;
    const w = deferred;
    deferred = null;
    observer?.disconnect();
    observer = null;
    showUpdateToast(w);
  };
  const showUpdateToast = (worker) => {
    if (!worker || document.querySelector('.toast--update')) return;
    if (inSession()) {
      deferred = worker;
      if (!observer && typeof MutationObserver === 'function') {
        observer = new MutationObserver(flushDeferred);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
      return;
    }
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
  window.addEventListener('hashchange', () => setTimeout(flushDeferred, 0));
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

installCrashHandlers();
registerServiceWorker();
main();
