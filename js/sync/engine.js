// Google-Drive sync engine (SPEC §17.2, §17.4): read → merge → write with optimistic concurrency, triggers,
// offline queue, status for the UI. Everything external (store, Drive client, auth, timers, clock, online state)
// is injected, so tests run it in Node with a mocked Drive.
//
// Triggers: app start (online + token), visibilitychange → visible (≥ 60 s apart), local changes (debounced 20 s;
// during a running training at most every 2 min), session finished / next-day check → immediately, manual
// „Jetzt synchronisieren“, 'online' after an offline attempt. Never in store read-only mode. Never opens the
// Google popup by itself – only connect()/reauth()/syncNow({interactive: true}) from a user tap do.
import { buildEnvelope, mergeSync, nextActiveSessions, remoteActiveFrom, splitEnvelope, toUploadData } from './merge.js';
import { validateBackup, migrateBackup } from '../util/export-import.js';
import { SCHEMA_VERSION } from '../store.js';
import {
  CONFLICT_RETRIES, DEBOUNCE_MS, DEFAULT_CLIENT_ID, SESSION_MIN_GAP_MS, VISIBLE_THROTTLE_MS, isValidClientId,
} from './config.js';
import { createDrive } from './drive.js';
import { createAuth, AuthError } from './auth.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export class SyncError extends Error {
  constructor(message, code = 'error') { super(message); this.name = 'SyncError'; this.code = code; }
}

/** Guess a device name from the screen size („Tablet“ ≥ 600 px short side, else „Handy“). */
export function guessDeviceName(win = globalThis) {
  const w = Number(win?.screen?.width) || Number(win?.innerWidth) || 0;
  const h = Number(win?.screen?.height) || Number(win?.innerHeight) || 0;
  return w && h && Math.min(w, h) >= 600 ? 'Tablet' : 'Handy';
}

export function newDeviceId() {
  try { if (globalThis.crypto?.randomUUID) return `dev-${globalThis.crypto.randomUUID()}`; } catch { /* ignore */ }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Parse the content of the sync file. Throws SyncError('newer') for a newer data version, SyncError('format') for
 * a file that is not a Physio backup.
 * @returns {{data: import('../types.js').Data, meta: any}}
 */
export function parseRemote(json) {
  const { data, meta } = splitEnvelope(json);
  if (Number.isInteger(data.schemaVersion) && data.schemaVersion > SCHEMA_VERSION) {
    throw new SyncError('Ein anderes Gerät nutzt eine neuere App-Version. Bitte die App aktualisieren (Mehr → neu laden).', 'newer');
  }
  const v = validateBackup(data);
  if (!v.ok) throw new SyncError(`Die Sync-Datei in Google Drive ist beschädigt (${v.errors[0]}).`, 'format');
  return { data: migrateBackup(data), meta };
}

/**
 * @param {{
 *   store: typeof import('../store.js'),
 *   auth?: ReturnType<typeof createAuth>,
 *   drive?: ReturnType<typeof createDrive>,
 *   fetch?: typeof fetch,
 *   win?: any,
 *   now?: () => number,
 *   timers?: {setTimeout: Function, clearTimeout: Function},
 *   online?: () => boolean,
 *   inSession?: () => boolean,
 *   describeWorkout?: (id: string) => string,
 * }} o
 */
export function createSyncEngine(o) {
  const { store } = o;
  const win = o.win ?? (typeof window !== 'undefined' ? window : null);
  const now = o.now ?? (() => (typeof store.syncNow === 'function' ? store.syncNow() : Date.now()));
  const timers = o.timers ?? { setTimeout: (...a) => setTimeout(...a), clearTimeout: (t) => clearTimeout(t) };
  const online = o.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const inSession = o.inSession ?? (() => !!store.getState?.()?.activeSession);
  const describeWorkout = o.describeWorkout ?? ((id) => String(id || ''));
  const auth = o.auth ?? createAuth({ win: win ?? globalThis });
  const drive = o.drive ?? createDrive({ fetch: o.fetch, getToken: () => auth.getToken() });

  /** @type {{phase: 'off'|'idle'|'syncing'|'ok'|'error'|'needsAuth'|'offline'|'readonly', error: string|null}} */
  let status = { phase: 'off', error: null };
  const listeners = new Set();
  let pending = false;
  let running = null;
  let again = false;
  let timer = null;
  let lastAttemptAt = 0;
  let started = false;
  const cleanups = [];

  const cfg = () => {
    const s = store.getSettings?.()?.sync;
    return isObj(s) ? s : {};
  };
  const clientId = () => (cfg().clientId || DEFAULT_CLIENT_ID || '').trim();
  const enabled = () => !!cfg().enabled;

  function getStatus() {
    const c = cfg();
    return {
      ...status,
      enabled: !!c.enabled,
      connected: !!auth.getToken(),
      pending,
      lastSyncAt: c.lastSyncAt ?? null,
      deviceName: c.deviceName || '',
      clientId: c.clientId || '',
      readOnly: !!store.isReadOnly?.(),
    };
  }

  function setStatus(phase, error = null) {
    status = { phase, error };
    const st = getStatus();
    for (const fn of listeners) { try { fn(st); } catch (e) { console.error('sync status listener failed', e); } }
    try { win?.dispatchEvent?.(new CustomEvent('pt-sync-status', { detail: st })); } catch { /* CustomEvent missing (Node) */ }
  }

  /** Make sure deviceId/deviceName exist (device-local, no change event). */
  function ensureDevice() {
    const c = cfg();
    if (c.deviceId && c.deviceName) return c;
    store.update((d) => {
      d.settings.sync = { ...(isObj(d.settings.sync) ? d.settings.sync : {}) };
      if (!d.settings.sync.deviceId) d.settings.sync.deviceId = newDeviceId();
      if (!d.settings.sync.deviceName) d.settings.sync.deviceName = guessDeviceName(win);
    });
    return cfg();
  }

  function updateClock() {
    const sd = drive.serverDate?.();
    if (!Number.isFinite(sd) || typeof store.setClockOffset !== 'function') return;
    const device = Date.now();
    const diff = sd - device;
    // the Date header has 1 s resolution and includes latency – only correct real clock errors
    store.setClockOffset(Math.abs(diff) > 60e3 ? diff : 0);
  }

  async function attempt() {
    const files = await drive.listFiles();
    const file = files[0] || null;
    let remote = null;
    let meta = {};
    let etag = null;
    const extras = [];
    if (file) {
      const dl = await drive.download(file.id);
      etag = dl.etag;
      ({ data: remote, meta } = parseRemote(dl.json));
      // two devices created the file at the same time → fold the others in, delete them after the write
      for (const x of files.slice(1)) {
        try {
          const d2 = await drive.download(x.id);
          const p2 = parseRemote(d2.json);
          remote = mergeSync(remote, p2.data, { now: now() });
          meta = { ...meta, activeSessions: { ...(p2.meta.activeSessions || {}), ...(meta.activeSessions || {}) }, rev: Math.max(Number(meta.rev) || 0, Number(p2.meta.rev) || 0) };
        } catch (e) { if (e?.code === 'newer') throw e; }
        extras.push(x.id);
      }
    }
    updateClock();
    const t = now();
    const c = cfg();
    const join = !c.lastSyncAt;
    const local = store.get();
    const merged = remote ? mergeSync(local, remote, { now: t, join }) : clone(local);
    const syncedAt = new Date(t).toISOString();
    const active = local.state?.activeSession;
    const activeSessions = nextActiveSessions(meta.activeSessions, {
      deviceId: c.deviceId, deviceName: c.deviceName, active, workoutName: active ? describeWorkout(active.workoutId) : '', now: t,
    });
    const env = buildEnvelope(merged, { deviceId: c.deviceId, deviceName: c.deviceName, rev: (Number(meta.rev) || 0) + 1, syncedAt, activeSessions });
    if (file) {
      if (file.version != null) {
        const m = await drive.meta(file.id);
        if (m?.version != null && String(m.version) !== String(file.version)) return 'conflict';
      }
      try { await drive.update(file.id, env, { ifMatch: etag }); }
      catch (e) { if (e?.code === 'conflict') return 'conflict'; throw e; }
    } else {
      await drive.create(env);
    }
    for (const id of extras) { try { await drive.remove(id); } catch { /* next sync again */ } }

    // apply locally – re-merge if the user changed something while we were uploading
    const cur = store.get();
    const final = cur === local ? merged : mergeSync(cur, toUploadData(merged), { now: now(), join });
    final.settings = { ...final.settings, sync: { ...(isObj(cur.settings?.sync) ? cur.settings.sync : {}), lastSyncAt: syncedAt, lastError: null } };
    final.state = { ...final.state, remoteActiveSession: final.state.activeSession ? null : remoteActiveFrom(activeSessions, c.deviceId, t) };
    if (!store.applySync(final)) throw new SyncError('Lokales Speichern nach dem Abgleich fehlgeschlagen.', 'save');
    return 'ok';
  }

  async function runOnce() {
    if (!enabled()) { setStatus('off'); return { ok: false, skipped: 'off' }; }
    if (store.isReadOnly?.()) { setStatus('readonly', 'Synchronisierung pausiert: Die Daten stammen aus einer neueren App-Version.'); return { ok: false, skipped: 'readonly' }; }
    if (!online()) { pending = true; setStatus('offline'); return { ok: false, skipped: 'offline' }; }
    if (!auth.getToken()) { pending = true; setStatus('needsAuth'); return { ok: false, skipped: 'auth' }; }
    ensureDevice();
    pending = false;
    lastAttemptAt = now();
    setStatus('syncing');
    try {
      for (let i = 0; i <= CONFLICT_RETRIES; i++) {
        const r = await attempt();
        if (r === 'ok') { setStatus('ok'); return { ok: true, attempts: i + 1 }; }
      }
      throw new SyncError('Die Sync-Datei wurde mehrfach gleichzeitig geändert – bitte gleich noch einmal versuchen.', 'conflict');
    } catch (e) {
      if (e?.code === 'auth') { auth.invalidate(); pending = true; setStatus('needsAuth'); return { ok: false, error: e }; }
      if (e?.code === 'offline') { pending = true; setStatus('offline'); return { ok: false, error: e }; }
      console.warn('Sync fehlgeschlagen', e);
      setStatus('error', e?.message || 'Abgleich fehlgeschlagen.');
      return { ok: false, error: e };
    }
  }

  /** Run a sync now (coalesces with a running one). */
  function run() {
    if (timer) { timers.clearTimeout(timer); timer = null; }
    if (running) { again = true; return running; }
    running = (async () => {
      let r;
      try { r = await runOnce(); }
      finally { running = null; }
      if (again) { again = false; return run(); }
      return r;
    })();
    return running;
  }

  function schedule(delay, { debounce = true } = {}) {
    if (timer) {
      if (!debounce) return; // throttle: keep the earlier timer
      timers.clearTimeout(timer);
    }
    timer = timers.setTimeout(() => { timer = null; run(); }, Math.max(0, delay));
  }

  /**
   * Trigger by reason: 'start'|'manual'|'finish'|'nextDay'|'online' → now; 'visible' → now unless < 60 s since
   * the last attempt; 'change' → debounced 20 s (during a training: throttled to ≥ 2 min since the last attempt).
   */
  function request(reason) {
    if (!enabled() || store.isReadOnly?.()) return null;
    if (reason === 'visible') {
      if (now() - lastAttemptAt < VISIBLE_THROTTLE_MS) return null;
      return run();
    }
    if (reason === 'change') {
      if (inSession()) {
        const wait = Math.max(DEBOUNCE_MS, lastAttemptAt + SESSION_MIN_GAP_MS - now());
        schedule(wait, { debounce: false });
      } else schedule(DEBOUNCE_MS);
      return null;
    }
    return run();
  }

  // ---- user actions (call from a tap: they may open the Google popup) ----------------------------

  async function interactiveToken() {
    if (auth.getToken()) return auth.getToken();
    const id = clientId();
    if (!isValidClientId(id)) throw new AuthError('Bitte zuerst eine gültige Client-ID eintragen.', 'client_id');
    return auth.requestToken({ clientId: id, prompt: '' });
  }

  /** Verbinden: store client id + device name, sign in, first sync. */
  async function connect({ clientId: id, deviceName } = {}) {
    const cid = String(id ?? clientId()).trim();
    if (!isValidClientId(cid)) { setStatus('error', 'Bitte eine gültige Client-ID eintragen (endet auf .apps.googleusercontent.com).'); return { ok: false }; }
    store.update((d) => {
      const s = isObj(d.settings.sync) ? d.settings.sync : {};
      d.settings.sync = { ...s, clientId: cid, deviceName: String(deviceName || s.deviceName || guessDeviceName(win)).slice(0, 30), deviceId: s.deviceId || newDeviceId() };
    });
    try {
      setStatus('syncing');
      await auth.requestToken({ clientId: cid, prompt: '' });
    } catch (e) {
      setStatus('error', e?.message || 'Google-Anmeldung fehlgeschlagen.');
      return { ok: false, error: e };
    }
    store.update((d) => { d.settings.sync = { ...d.settings.sync, enabled: true }; });
    return run();
  }

  /** „Erneut anmelden“ / „Jetzt synchronisieren“ from a tap. */
  async function syncNow({ interactive = true } = {}) {
    if (!enabled()) return { ok: false, skipped: 'off' };
    if (interactive && !auth.getToken() && online() && !store.isReadOnly?.()) {
      try { await interactiveToken(); } catch (e) { setStatus(e?.type === 'gis' ? 'error' : 'needsAuth', e?.message || null); return { ok: false, error: e }; }
    }
    return run();
  }

  /**
   * Trennen: keeps all local data. deleteRemote → the sync file in Drive is deleted first (needs sign-in).
   */
  async function disconnect({ deleteRemote = false } = {}) {
    if (deleteRemote) {
      try {
        await interactiveToken();
        const files = await drive.listFiles();
        for (const f of files) await drive.remove(f.id);
      } catch (e) {
        setStatus('error', `Daten in Google Drive konnten nicht gelöscht werden: ${e?.message || e}`);
        return { ok: false, error: e };
      }
    }
    if (timer) { timers.clearTimeout(timer); timer = null; }
    pending = false;
    await auth.revoke();
    store.update((d) => {
      d.settings.sync = { ...(isObj(d.settings.sync) ? d.settings.sync : {}), enabled: false, lastSyncAt: null, lastError: null };
      d.state.remoteActiveSession = null;
    });
    setStatus('off');
    return { ok: true };
  }

  // ---- wiring -------------------------------------------------------------------------------------

  function start() {
    if (started) return;
    started = true;
    cleanups.push(store.onLocalChange((data, info) => {
      const k = info?.kinds || [];
      if (k.includes('finish') || k.includes('nextDay')) request('finish');
      else request('change');
    }));
    if (win?.addEventListener) {
      const onOnline = () => { if (pending || enabled()) request('online'); };
      const onOffline = () => { if (enabled()) setStatus('offline'); };
      win.addEventListener('online', onOnline);
      win.addEventListener('offline', onOffline);
      cleanups.push(() => { win.removeEventListener('online', onOnline); win.removeEventListener('offline', onOffline); });
      const doc = win.document;
      if (doc?.addEventListener) {
        const onVis = () => { if (doc.visibilityState === 'visible') request('visible'); };
        doc.addEventListener('visibilitychange', onVis);
        cleanups.push(() => doc.removeEventListener('visibilitychange', onVis));
      }
    }
    if (!enabled()) { setStatus('off'); return; }
    if (store.isReadOnly?.()) { setStatus('readonly', 'Synchronisierung pausiert: Die Daten stammen aus einer neueren App-Version.'); return; }
    if (!online()) { pending = true; setStatus('offline'); return; }
    if (!auth.getToken()) {
      pending = true;
      setStatus('needsAuth');
      // preload GIS so „Erneut anmelden“ opens the popup within the tap; failures are shown on the tap
      auth.loadGis().catch(() => {});
      return;
    }
    request('start');
  }

  function stop() {
    if (timer) { timers.clearTimeout(timer); timer = null; }
    while (cleanups.length) { try { cleanups.pop()(); } catch { /* ignore */ } }
    started = false;
  }

  const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  return {
    start, stop, request, run, connect, syncNow, disconnect, getStatus, onStatus,
    preload: () => auth.loadGis().catch(() => {}),
    _auth: auth, _drive: drive,
  };
}

// ---- app singleton --------------------------------------------------------------------------------

/** @type {ReturnType<typeof createSyncEngine>|null} */
let engine = null;
export const getSync = () => engine;

/** Create + start the app's sync engine once (app.js after boot). */
export function initSync(opts) {
  if (engine) return engine;
  engine = createSyncEngine(opts);
  engine.start();
  return engine;
}
