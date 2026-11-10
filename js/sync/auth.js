// Google sign-in for the Drive sync via Google Identity Services (GIS) token client (SPEC §17.1).
// - GIS (https://accounts.google.com/gsi/client) is injected lazily – only when sync is used, never precached;
//   without it (offline, blocked) the app keeps working and the sync shows a German error.
// - Scope: drive.appdata only. The access token lives in memory (+ sessionStorage of this tab) until it expires;
//   there is no refresh token in the browser. Re-auth uses requestAccessToken({prompt: ''}) – it needs a user
//   gesture (popup), so automatic syncs never open it; the UI shows „Erneut anmelden“ instead.
import { GIS_SRC, GIS_TIMEOUT_MS, SYNC_SCOPE } from './config.js';

const TOKEN_KEY = 'pt.sync.token';
const EXPIRY_MARGIN_MS = 60e3;

export class AuthError extends Error {
  /** @param {string} message @param {string} [type] */
  constructor(message, type = 'auth') { super(message); this.name = 'AuthError'; this.type = type; }
}

/** German message for a GIS error type / OAuth error code. */
export function authMessage(type) {
  switch (type) {
    case 'popup_failed_to_open': return 'Das Anmeldefenster wurde blockiert. Bitte erneut tippen.';
    case 'popup_closed': return 'Anmeldung abgebrochen.';
    case 'access_denied': return 'Zugriff wurde nicht erlaubt.';
    case 'scope': return 'Zugriff auf den App-Ordner in Google Drive wurde nicht erlaubt.';
    case 'gis': return 'Google-Anmeldung nicht erreichbar – bist du online?';
    case 'client_id': return 'Client-ID fehlt oder ist ungültig.';
    case 'invalid_client': case 'unauthorized_client': return 'Die Client-ID wird von Google abgelehnt. Bitte in der Anleitung prüfen (JavaScript-Quelle).';
    default: return 'Google-Anmeldung fehlgeschlagen.';
  }
}

function safeSession() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

/**
 * @param {{win?: any, now?: () => number, storage?: Storage|null, loadScript?: (src: string) => Promise<void>}} [o]
 */
export function createAuth({ win = globalThis, now = () => Date.now(), storage = safeSession(), loadScript } = {}) {
  /** @type {{token: string, expiresAt: number}|null} */
  let tok = null;
  try {
    const raw = storage?.getItem(TOKEN_KEY);
    const t = raw ? JSON.parse(raw) : null;
    if (t && typeof t.token === 'string' && t.expiresAt > now()) tok = t;
  } catch { tok = null; }

  let gisPromise = null;
  let client = null;
  let clientFor = '';
  /** @type {{resolve: Function, reject: Function}|null} */
  let pending = null;

  const inject = loadScript || ((src) => new Promise((resolve, reject) => {
    const doc = win.document;
    if (!doc) { reject(new AuthError(authMessage('gis'), 'gis')); return; }
    const s = doc.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    const timer = setTimeout(() => { s.remove(); reject(new AuthError(authMessage('gis'), 'gis')); }, GIS_TIMEOUT_MS);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new AuthError(authMessage('gis'), 'gis')); };
    doc.head.appendChild(s);
  }));

  const hasGis = () => !!win.google?.accounts?.oauth2?.initTokenClient;

  /** Load GIS once (retried after a failure). Never throws synchronously. */
  function loadGis() {
    if (hasGis()) return Promise.resolve();
    if (!gisPromise) {
      gisPromise = inject(GIS_SRC).then(() => {
        if (!hasGis()) throw new AuthError(authMessage('gis'), 'gis');
      }).catch((e) => { gisPromise = null; throw e instanceof AuthError ? e : new AuthError(authMessage('gis'), 'gis'); });
    }
    return gisPromise;
  }

  function saveToken(t) {
    tok = t;
    try { if (t) storage?.setItem(TOKEN_KEY, JSON.stringify(t)); else storage?.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  function settle(fn, arg) {
    const p = pending;
    pending = null;
    if (p) p[fn](arg);
  }

  function ensureClient(clientId) {
    if (client && clientFor === clientId) return client;
    const oauth2 = win.google.accounts.oauth2;
    client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SYNC_SCOPE,
      callback: (resp) => {
        if (!resp || resp.error) { settle('reject', new AuthError(authMessage(resp?.error), resp?.error || 'auth')); return; }
        const granted = typeof oauth2.hasGrantedAllScopes === 'function'
          ? oauth2.hasGrantedAllScopes(resp, SYNC_SCOPE)
          : String(resp.scope || '').split(' ').includes(SYNC_SCOPE);
        if (!granted) { settle('reject', new AuthError(authMessage('scope'), 'scope')); return; }
        const sec = Number(resp.expires_in) || 3600;
        saveToken({ token: resp.access_token, expiresAt: now() + sec * 1000 });
        settle('resolve', resp.access_token);
      },
      error_callback: (err) => settle('reject', new AuthError(authMessage(err?.type), err?.type || 'auth')),
    });
    clientFor = clientId;
    return client;
  }

  /**
   * Ask Google for an access token. Must run inside a user gesture (opens a popup).
   * @param {{clientId: string, prompt?: ''|'consent'|'select_account'}} o
   * @returns {Promise<string>}
   */
  async function requestToken({ clientId, prompt = '' }) {
    if (!clientId) throw new AuthError(authMessage('client_id'), 'client_id');
    await loadGis();
    const c = ensureClient(clientId);
    if (pending) settle('reject', new AuthError(authMessage('popup_closed'), 'popup_closed'));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      try { c.requestAccessToken({ prompt }); } catch (e) { settle('reject', new AuthError(authMessage('auth'), 'auth')); }
    });
  }

  /** Valid token or null. */
  const getToken = () => (tok && tok.expiresAt - EXPIRY_MARGIN_MS > now() ? tok.token : null);

  /** Forget the token (after a 401). */
  const invalidate = () => saveToken(null);

  /** Forget + revoke at Google (best effort, needs GIS). */
  async function revoke() {
    const t = tok?.token;
    saveToken(null);
    if (!t) return;
    try {
      if (hasGis()) await new Promise((r) => win.google.accounts.oauth2.revoke(t, () => r()));
    } catch { /* ignore */ }
  }

  return { loadGis, hasGis, requestToken, getToken, invalidate, revoke, expiresAt: () => tok?.expiresAt ?? null };
}
