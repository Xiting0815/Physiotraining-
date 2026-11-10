// Google-Drive sync – UI pieces (SPEC §17.5): Mehr card „Synchronisierung“, status dot (Heute header),
// „Training läuft gerade auf …“ info. Templates + formatters are pure (Node-testable); the handlers need the DOM.
import { html, raw } from '../render.js';
import { isValidClientId, SETUP_GUIDE_URL, DEFAULT_CLIENT_ID, REMOTE_ACTIVE_MAX_MS } from './config.js';

/** „gerade eben“, „vor 3 min“, „vor 2 Std.“, „vor 3 Tagen“. */
export function relTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
}

/**
 * Status → tone + German text.
 * @param {any} st engine.getStatus() (or null when the engine is not running)
 * @returns {{tone: 'off'|'ok'|'busy'|'warn'|'error', label: string, text: string}}
 */
export function statusInfo(st, now = Date.now()) {
  if (!st || !st.enabled) return { tone: 'off', label: 'Nicht verbunden', text: 'Nicht verbunden' };
  const last = st.lastSyncAt ? `Letzter Abgleich ${relTime(st.lastSyncAt, now)}` : 'Noch kein Abgleich';
  switch (st.phase) {
    case 'syncing': return { tone: 'busy', label: 'Gleicht ab …', text: 'Gleicht ab …' };
    case 'error': return { tone: 'error', label: 'Fehler beim Abgleich', text: `Fehler: ${st.error || 'Abgleich fehlgeschlagen.'}` };
    case 'needsAuth': return { tone: 'warn', label: 'Anmeldung nötig', text: `Google-Anmeldung abgelaufen – bitte „Erneut anmelden“. ${last}.` };
    case 'offline': return { tone: 'warn', label: 'Offline', text: `Offline – wird abgeglichen, sobald Internet da ist. ${last}.` };
    case 'readonly': return { tone: 'error', label: 'Pausiert', text: st.error || 'Synchronisierung pausiert.' };
    default: return { tone: 'ok', label: 'Synchronisiert', text: `Google-Konto verbunden · ${last}` };
  }
}

/** Small status dot for headers (only when sync is enabled). */
export function syncDot(st, now = Date.now()) {
  if (!st?.enabled) return '';
  const i = statusInfo(st, now);
  // token expired (every cold start: Google gives browsers no refresh token) → one tap re-auth + sync right here
  if (st.phase === 'needsAuth') {
    return html`<button type="button" class="chip pv-sync-reauth" data-sync-reauth-quick title="${i.text}" aria-label="Bei Google anmelden und abgleichen"><span class="pv-sync-dot--warn pv-sync-dot__mini" aria-hidden="true"></span>Abgleichen</button>`;
  }
  return html`<a class="pv-sync-dot pv-sync-dot--${i.tone}" href="#/mehr?focus=sync" data-sync-dot title="${i.text}" aria-label="Synchronisierung: ${i.label}"><span aria-hidden="true"></span></a>`;
}

/** Info card on Heute: a training is running on the other device (never resumed here). */
export function remoteActiveBanner(state, now = Date.now()) {
  const r = state?.remoteActiveSession;
  if (!r || state?.activeSession) return '';
  const t = Date.parse(r.startedAt);
  if (!Number.isFinite(t) || now - t > REMOTE_ACTIVE_MAX_MS) return '';
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return html`<div class="banner banner--accent pv-remote-active" role="status" data-remote-active>
    <span class="banner__icon" aria-hidden="true">📲</span>
    <span class="banner__body"><span class="banner__title">Training läuft gerade auf ${r.deviceName || 'anderem Gerät'}</span>
    <span class="banner__text">${r.workoutName ? `${r.workoutName} · ` : ''}seit ${hm} Uhr · erscheint hier, sobald es dort beendet und abgeglichen ist</span></span>
  </div>`;
}

/**
 * The card under Mehr → Synchronisierung.
 * @param {any} sync settings.sync  @param {any} st engine status (or null)
 * @param {{now?: number, online?: boolean, showDelete?: boolean}} [o]
 */
export function syncCard(sync, st, { now = Date.now(), online = true, showDelete = false } = {}) {
  const s = sync || {};
  const enabled = !!s.enabled;
  const i = statusInfo(st ? { ...st, enabled } : { enabled, lastSyncAt: s.lastSyncAt, phase: 'ok' }, now);
  const cid = s.clientId || '';
  const cidOk = isValidClientId(cid) || (!cid && isValidClientId(DEFAULT_CLIENT_ID));
  const busy = st?.phase === 'syncing';
  const needsAuth = enabled && st?.phase === 'needsAuth';
  return html`<section class="card pv-sync" data-sync-card aria-labelledby="sync">
    <p class="pv-sync__status pv-sync__status--${i.tone}" data-sync-status role="status">
      <span class="pv-sync__dot" aria-hidden="true"></span><span>${i.text}</span></p>
    ${enabled ? '' : html`<p class="text-sm muted mt-2 mb-0">Halte Handy und Tablet auf demselben Stand: Einheiten, Stufen, Abzeichen und Einstellungen werden über deinen eigenen Google Drive abgeglichen – in einem versteckten App-Ordner, den nur diese App sieht.</p>`}
    <div class="field mt-4">
      <label class="field__label" for="syncDeviceName">Gerätename</label>
      <input id="syncDeviceName" class="input" name="syncDeviceName" maxlength="30" autocomplete="off" value="${s.deviceName || ''}" placeholder="z. B. Handy oder Tablet">
      <span class="field__hint">So erscheint dieses Gerät auf dem anderen („Training läuft gerade auf …“).</span>
    </div>
    <div class="field mt-2">
      <label class="field__label" for="syncClientId">Client-ID (Google)</label>
      <input id="syncClientId" class="input" name="syncClientId" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url" value="${cid}" placeholder="…apps.googleusercontent.com" aria-describedby="syncClientIdHint">
      <span class="field__hint" id="syncClientIdHint">${cid && !isValidClientId(cid) ? 'Die Client-ID endet auf „.apps.googleusercontent.com“. ' : ''}Einmalig in der Google Cloud Console anlegen – <a class="tap-link pv-tap-inline" href="${SETUP_GUIDE_URL}" target="_blank" rel="noopener">Schritt-für-Schritt-Anleitung</a>.</span>
    </div>
    ${!enabled ? html`<button type="button" class="btn btn--primary btn--block mt-4" data-sync-connect ${cidOk && online && !busy ? '' : 'disabled'}>🔗 Verbinden</button>
      ${online ? '' : html`<p class="field__hint mt-2 mb-0">Zum Verbinden wird Internet gebraucht.</p>`}`
    : html`${needsAuth
        ? html`<button type="button" class="btn btn--primary btn--block mt-4" data-sync-reauth ${online ? '' : 'disabled'}>🔑 Erneut anmelden</button>`
        : html`<button type="button" class="btn btn--primary btn--block mt-4" data-sync-now ${online && !busy && !st?.readOnly ? '' : 'disabled'}>🔄 Jetzt synchronisieren</button>`}
      <button type="button" class="btn btn--outline btn--block mt-2" data-sync-disconnect>Trennen</button>
      <label class="check-row mt-2"><input type="checkbox" name="syncDeleteRemote" ${showDelete ? 'checked' : ''}><span>Beim Trennen auch die Daten in Google Drive löschen</span></label>`}
    <p class="field__hint mt-2 mb-0">Nur der App-Ordner (drive.appdata) – die App sieht keine anderen Dateien. Die Anmeldung bleibt auf diesem Gerät. Trennen behält alle Daten hier.</p>
  </section>`;
}

/** CSS for the sync card + dot (injected once). */
export const SYNC_CSS = `
.pv-sync__status { display: flex; align-items: center; gap: var(--s-2); margin: 0; font-weight: var(--fw-bold, 700); }
.pv-sync__dot, .pv-sync-dot > span { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--muted); flex: none; }
.pv-sync__status--ok .pv-sync__dot, .pv-sync-dot--ok > span { background: var(--green); }
.pv-sync__status--busy .pv-sync__dot, .pv-sync-dot--busy > span { background: var(--primary); animation: pv-sync-pulse 1.2s ease-in-out infinite; }
.pv-sync__status--warn .pv-sync__dot, .pv-sync-dot--warn > span { background: var(--yellow); }
.pv-sync__status--error .pv-sync__dot, .pv-sync-dot--error > span { background: var(--red); }
.pv-sync-dot { display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; border-radius: 50%; }
.pv-sync-dot > span { width: 10px; height: 10px; box-shadow: 0 0 0 3px var(--surface, #fff); }
.pv-remote-active { margin-bottom: var(--s-4); }
.pv-sync-reauth { min-height: 44px; gap: 6px; cursor: pointer; border: 0; font: inherit; font-weight: var(--fw-bold, 700); }
.pv-sync-dot__mini { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--yellow); }
@keyframes pv-sync-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .pv-sync-dot--busy > span, .pv-sync__status--busy .pv-sync__dot { animation: none; } }
`;

export function ensureSyncStyles() {
  if (typeof document === 'undefined' || document.getElementById('pt-sync-css')) return;
  const st = document.createElement('style');
  st.id = 'pt-sync-css';
  st.textContent = SYNC_CSS;
  document.head.appendChild(st);
}
