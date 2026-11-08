// Daten importieren (#/import) – RENPHO screenshot (offline OCR) and Samsung Health export (ZIP/CSV),
// plus files shared to the installed app (Web Share Target → sw.js → Cache "pt-share"). See docs/SPEC.md §13.
//
// Flow: choose source → (OCR progress) → review per screenshot / per export (editable values, suspicious
// highlights, previewImport diff, merge/overwrite) → „Übernehmen“ → applyImport → store.update → toast.
// Nothing is ever imported without the review step.
import { html, raw, render as paint } from '../render.js';
import { todayISO, formatDE } from '../util/date.js';
import { HEALTH_FIELDS, validateEntry, entryFor } from '../logic/health.js';
import { normalizeNumber, previewImport, applyImport } from '../import/common.js';
import { parseRenphoText, refineRegions, RENPHO_FIELDS, RENPHO_SOURCE } from '../import/renpho.js';
import { ICON, ensureViewStyles, applyFontScale, pageHeader, toast, confirmDialog } from './ui.js';

export const title = 'Daten importieren';

/** Cache name + key prefix used by sw.js for shared files (keep in sync with sw.js). */
export const SHARE_CACHE = 'pt-share';
export const SHARE_PREFIX = '__share__/';

/* ------------------------------------------------------------------ */
/* Pure helpers (Node-testable)                                        */
/* ------------------------------------------------------------------ */

/**
 * What kind of import a file is.
 * @param {{name?: string, type?: string}} f
 * @returns {'image'|'samsung'|null}
 */
export function classifyFile(f) {
  const name = String(f?.name || '').toLowerCase();
  const type = String(f?.type || '').toLowerCase();
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif|gif|bmp)$/.test(name)) return 'image';
  if (/zip|csv|comma-separated|text\/plain|octet-stream/.test(type) || /\.(zip|csv)$/.test(name)) return 'samsung';
  return null;
}

/** Shared text that is really a CSV (header line + rows with separators). */
export function looksLikeCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return false;
  const sep = (l) => (l.match(/[,;\t]/g) || []).length;
  return sep(lines[0]) >= 1 && sep(lines[1]) >= 1;
}

/** Value → input text with German decimal comma ("102,1"). */
export function toInput(field, v) {
  if (v == null || v === '') return '';
  const f = HEALTH_FIELDS[field];
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return f?.int ? String(Math.round(n)) : String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Value with unit for the diff („alt: 101,8 kg“). */
export function valueText(field, v) {
  if (v == null || v === '') return '–';
  const f = HEALTH_FIELDS[field];
  const s = typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: f?.int ? 0 : 2 }) : String(v);
  return f?.unit ? `${s} ${f.unit}` : s;
}

export const STATUS_LABEL = { new: 'neu', changed: 'wird aktualisiert', same: 'gleich', conflict: 'abweichend' };

/**
 * Builds the HealthEntry from the review form (strings with comma decimals). Fields edited by the user get
 * source "manual", untouched recognised ones keep "renpho-ocr".
 * @param {{date: string, time?: string, values: Record<string, string>, parsed?: Record<string, number>}} form
 * @returns {{entry: any, errors: Record<string,string>}}
 */
export function entryFromForm({ date, time, values, parsed = {} }) {
  const entry = /** @type {any} */ ({ date, source: RENPHO_SOURCE, sources: {} });
  const errors = {};
  if (time && /^\d{2}:\d{2}(:\d{2})?$/.test(time)) entry.measuredAt = `${date}T${time.length === 5 ? time + ':00' : time}`;
  for (const f of RENPHO_FIELDS) {
    const raw = String(values[f] ?? '').trim();
    if (!raw) continue;
    const n = normalizeNumber(raw);
    if (n == null) { errors[f] = 'Bitte eine Zahl eingeben.'; continue; }
    entry[f] = n;
    entry.sources[f] = parsed[f] != null && Math.abs(parsed[f] - n) < 1e-9 ? RENPHO_SOURCE : 'manual';
  }
  const v = validateEntry(entry);
  if (!v.ok) Object.assign(errors, v.errors);
  return { entry: v.ok ? v.entry : entry, errors };
}

/** Short summary of preview counts: „3 neu · 1 wird aktualisiert · 2 gleich“. */
export function countsText(c) {
  return ['new', 'changed', 'conflict', 'same'].filter((k) => c?.[k]).map((k) => `${c[k]} ${STATUS_LABEL[k]}`).join(' · ') || 'keine Werte';
}

/* ------------------------------------------------------------------ */
/* Shared files (Web Share Target, written by sw.js)                   */
/* ------------------------------------------------------------------ */

/** @returns {Promise<{key: string, kind: 'file'|'text', name: string, blob?: Blob, text?: string, time: number}[]>} */
export async function readShared() {
  if (typeof caches === 'undefined') return [];
  try {
    if (!await caches.has(SHARE_CACHE)) return [];
    const cache = await caches.open(SHARE_CACHE);
    const out = [];
    for (const req of await cache.keys()) {
      if (!req.url.includes(SHARE_PREFIX)) continue;
      const res = await cache.match(req);
      if (!res) continue;
      const kind = res.headers.get('X-Share-Kind') === 'text' ? 'text' : 'file';
      const name = decodeURIComponent(res.headers.get('X-Share-Name') || '') || (kind === 'text' ? 'Geteilter Text' : 'Datei');
      const time = Number(res.headers.get('X-Share-Time')) || 0;
      if (kind === 'text') {
        const j = await res.json().catch(() => ({}));
        out.push({ key: req.url, kind, name, text: [j.title, j.text, j.url].filter(Boolean).join('\n'), time });
      } else {
        const blob = await res.blob();
        out.push({ key: req.url, kind, name, blob: new File([blob], name, { type: blob.type || res.headers.get('Content-Type') || '' }), time });
      }
    }
    return out.sort((a, b) => a.time - b.time || (a.key < b.key ? -1 : 1));
  } catch (e) {
    console.warn('share read failed', e);
    return [];
  }
}

export async function clearShared(keys) {
  if (typeof caches === 'undefined' || !keys?.length) return;
  try {
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all(keys.map((k) => cache.delete(k)));
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
.imp-lead { color: var(--muted); font-size: var(--fs-sm); margin: 0 0 var(--s-4); }
.imp-source { display: flex; flex-direction: column; gap: var(--s-3); }
.imp-source__head { display: flex; gap: var(--s-3); align-items: flex-start; }
.imp-source__title { margin: 0; font-size: var(--fs-lg); font-weight: var(--fw-bold); line-height: 1.25; }
.imp-source__text { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.imp-meta .chip { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
.imp-file { position: relative; overflow: hidden; }
.imp-file input[type=file] { position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 0; }
.imp-file:focus-within { box-shadow: var(--focus-ring); }
.imp-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.imp-steps { margin: var(--s-2) 0 0; font-size: var(--fs-sm); }
.imp-steps b { font-weight: var(--fw-semibold); }
.imp-progress { height: 10px; border-radius: 999px; background: var(--surface-2); overflow: hidden; margin: var(--s-3) 0 var(--s-2); }
.imp-progress > i { display: block; height: 100%; width: 0; border-radius: inherit; background: var(--grad-primary-btn, var(--primary)); transition: width .25s ease; }
.imp-progress--busy > i { width: 35% !important; animation: imp-busy 1.2s ease-in-out infinite; }
@keyframes imp-busy { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
@media (prefers-reduced-motion: reduce) { .imp-progress--busy > i { animation: none; width: 100% !important; opacity: .5; } }
.imp-status { font-size: var(--fs-sm); color: var(--muted); margin: 0; min-height: 1.4em; }
.imp-thumb { display: flex; gap: var(--s-3); align-items: center; }
.imp-thumb img { width: 56px; height: 72px; object-fit: cover; object-position: top; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); flex: none; }
.imp-shot { max-height: 60vh; overflow: auto; border-radius: var(--radius-sm); border: 1px solid var(--border); }
.imp-shot img { display: block; width: 100%; height: auto; }
.imp-when { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: var(--s-3); }
.imp-when .field { margin-bottom: 0; }
.imp-rows { display: flex; flex-direction: column; margin: 0 calc(-1 * var(--s-2)); }
.imp-row { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 4px var(--s-3); align-items: center; padding: var(--s-2); border-radius: var(--radius-sm); }
.imp-row + .imp-row { border-top: 1px solid var(--border); }
.imp-row__label { font-weight: var(--fw-semibold); font-size: var(--fs-sm); line-height: 1.3; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; min-width: 0; }
.imp-row__old { grid-column: 1 / -1; font-size: var(--fs-xs); color: var(--muted); margin: 0; }
.imp-row__why { grid-column: 1 / -1; font-size: var(--fs-xs); color: var(--yellow-ink); margin: 0; font-weight: var(--fw-semibold); }
.imp-row .input { min-height: 44px; text-align: right; font-variant-numeric: tabular-nums; }
.imp-row.is-suspicious { background: var(--yellow-soft); border-top-color: transparent; }
.imp-row.is-suspicious + .imp-row { border-top-color: transparent; }
.imp-row.is-missing .input { border-style: dashed; }
.imp-row.is-invalid .input { border-color: var(--red); }
.imp-st { display: inline-flex; align-items: center; padding: 0 7px; border-radius: 999px; font-size: 11px; font-weight: 700; line-height: 18px; white-space: nowrap; }
.imp-st--new { background: var(--green-soft); color: var(--green-ink); }
.imp-st--changed { background: var(--accent-soft); color: var(--accent-ink); }
.imp-st--same { background: var(--surface-2); color: var(--muted); }
.imp-st--conflict { background: var(--yellow-soft); color: var(--yellow-ink); }
.imp-st--missing { background: var(--surface-2); color: var(--muted); font-weight: 600; }
.imp-st--warn { background: var(--yellow); color: var(--on-gold, #1b1b1b); }
.imp-conf { display: flex; align-items: center; gap: var(--s-2); font-size: var(--fs-sm); }
.imp-conf__bar { flex: 1; height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.imp-conf__bar > i { display: block; height: 100%; background: var(--green); }
.imp-conf__bar.is-mid > i { background: var(--yellow); }
.imp-conf__bar.is-low > i { background: var(--red); }
.imp-sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-2); margin: 0 0 var(--s-3); }
.imp-sum > div { background: var(--surface-2); border-radius: var(--radius-sm); padding: var(--s-2); text-align: center; min-width: 0; }
.imp-sum dt { font-size: 11px; color: var(--muted); }
.imp-sum dd { margin: 0; font-weight: var(--fw-black); font-size: var(--fs-lg); font-variant-numeric: tabular-nums; }
.imp-mode-hint { font-size: var(--fs-xs); color: var(--muted); margin: var(--s-2) 0 0; }
.imp-actions { display: flex; flex-direction: column; gap: var(--s-2); margin-top: var(--s-4); }
.imp-actions .btn-row { display: flex; gap: var(--s-2); }
.imp-actions .btn-row .btn { flex: 1; }
.imp-days { list-style: none; margin: 0; padding: 0; font-size: var(--fs-sm); }
.imp-days li { display: flex; justify-content: space-between; gap: var(--s-2); padding: 6px 0; border-top: 1px solid var(--border); }
.imp-days li:first-child { border-top: 0; }
.imp-shared { display: flex; flex-direction: column; gap: var(--s-2); }
.imp-shared__list { list-style: none; margin: 0; padding: 0; font-size: var(--fs-sm); }
.imp-shared__list li { padding: 2px 0; overflow-wrap: anywhere; }
.imp-done { text-align: center; padding: var(--s-6) var(--s-4); }
.imp-done__icon { font-size: 44px; line-height: 1; margin-bottom: var(--s-2); }
.imp-done h2 { margin: 0 0 var(--s-2); }
`;
function ensureImportStyles() {
  if (typeof document === 'undefined' || document.getElementById('imp-styles')) return;
  const st = document.createElement('style');
  st.id = 'imp-styles';
  st.textContent = CSS;
  document.head.appendChild(st);
}

const ICON_IMG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M9 7h6M9 11h6M9 15h3.5"/></svg>';
const ICON_ZIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M10 6h1M10 9h1M10 12h1M9.5 15h2v3h-2z"/></svg>';

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, query }) {
  ensureViewStyles();
  ensureImportStyles();
  let alive = true;
  const urls = [];
  /** queue of things to review: {kind:'image'|'samsung'|'text', file?, text?, name, shareKey?} */
  let queue = [];
  let pos = 0;
  /** current step: choose | busy | review-renpho | review-samsung | error | done */
  let step = 'choose';
  let busy = { title: '', message: '', progress: 0, indeterminate: true, thumb: null };
  let review = null; // current review model
  let mode = 'merge';
  let shared = [];
  let results = { applied: 0, added: 0, updated: 0, skipped: 0, last: null };
  let errorInfo = null;

  const objUrl = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

  /* ---------------- rendering ---------------- */

  const header = () => pageHeader({ title: 'Daten importieren', eyebrow: 'Gesundheit', back: '#/gesundheit', backLabel: 'Zurück zu Gesundheit' });
  const counter = () => (queue.length > 1 ? html`<span class="chip chip--sm chip--outline">${pos + 1} von ${queue.length}</span>` : '');

  function viewChoose() {
    const n = shared.length;
    return html`
      ${header()}
      <p class="imp-lead">Werte aus der RENPHO-App oder Samsung Health übernehmen – statt alles abzutippen. Alles bleibt auf deinem Gerät, die Texterkennung läuft offline.</p>

      ${n ? html`<section class="card card--accent imp-shared" aria-label="Geteilte Dateien">
        <div class="imp-source__head">
          <span class="pv-icon-badge pv-icon-badge--accent">${raw(ICON.download)}</span>
          <div class="grow"><h2 class="imp-source__title">${n === 1 ? 'Eine geteilte Datei' : `${n} geteilte Dateien`}</h2>
          <p class="imp-source__text">An PhysioBogen geteilt – bereit zum Prüfen.</p></div>
        </div>
        <ul class="imp-shared__list">${shared.map((s) => html`<li>${s.kind === 'text' ? '📝' : classifyFile(s.blob) === 'image' ? '🖼️' : '🗂️'} ${s.name}</li>`)}</ul>
        <div class="btn-row">
          <button type="button" class="btn btn--ghost btn--sm" data-shared-discard>${raw(ICON.trash)} Verwerfen</button>
          <button type="button" class="btn btn--primary" data-shared-go>Prüfen ${raw(ICON.right)}</button>
        </div>
      </section>` : ''}

      <section class="card imp-source" aria-label="Screenshot RENPHO">
        <div class="imp-source__head">
          <span class="pv-icon-badge pv-icon-badge--primary">${raw(ICON_IMG)}</span>
          <div class="grow">
            <h2 class="imp-source__title">Screenshot (RENPHO)</h2>
            <p class="imp-source__text">Screenshot der Messung in der RENPHO-App (Liste mit Gewicht, BMI, Körperfett …). Alle 19 Werte werden erkannt, du prüfst sie vor dem Speichern.</p>
          </div>
        </div>
        <div class="imp-meta" data-ocr-meta><span class="chip chip--sm chip--outline">Mehrere Bilder möglich</span></div>
        <label class="btn btn--primary btn--block imp-file">${raw(ICON.upload)} Screenshot wählen
          <input type="file" accept="image/*" multiple data-pick="image" aria-label="Screenshot wählen">
        </label>
      </section>

      <section class="card imp-source" aria-label="Samsung Health Export">
        <div class="imp-source__head">
          <span class="pv-icon-badge pv-icon-badge--accent">${raw(ICON_ZIP)}</span>
          <div class="grow">
            <h2 class="imp-source__title">Samsung Health Export (ZIP/CSV)</h2>
            <p class="imp-source__text">Gewicht, Körperzusammensetzung, Schritte, Schlaf und Puls aus deinem Samsung-Health-Datenexport – auch rückwirkend.</p>
          </div>
        </div>
        <details class="disclosure mb-0">
          <summary>So exportierst du aus Samsung Health</summary>
          <ol class="steps imp-steps">
            <li><span>Samsung Health öffnen → oben rechts <b>⋮</b> bzw. <b>≡</b> → <b>Einstellungen</b>.</span></li>
            <li><span>Ganz nach unten: <b>Persönliche Daten herunterladen</b> (ggf. unter „Allgemein“ / „Datenschutz“) → <b>Herunterladen</b> und mit dem Samsung-Konto bestätigen.</span></li>
            <li><span>Warten, bis „Download abgeschlossen“ erscheint. Die Daten liegen dann im Ordner <b>Eigene Dateien → Interner Speicher → Download → Samsung Health</b>.</span></li>
            <li><span>In <b>Eigene Dateien</b> den Ordner lange drücken → <b>Komprimieren</b> (ZIP) – oder einzelne CSV-Dateien wählen, z. B. <b>…health.weight…csv</b>.</span></li>
            <li><span>ZIP/CSV <b>teilen → PhysioBogen</b> oder hier unten <b>Datei auswählen</b>.</span></li>
          </ol>
          <p class="field__hint mt-2 mb-0">Die genaue Menüführung kann je nach Samsung-Health-Version leicht abweichen.</p>
        </details>
        <label class="btn btn--outline btn--block imp-file">${raw(ICON.upload)} Datei auswählen
          <input type="file" accept=".zip,.csv,application/zip,application/x-zip-compressed,text/csv,text/comma-separated-values" multiple data-pick="samsung" aria-label="Samsung-Health-Datei auswählen">
        </label>
      </section>

      <p class="field__hint">Tipp: In der RENPHO- oder Samsung-App über <b>Teilen → PhysioBogen</b> landen Screenshots und Exporte direkt hier (installierte App nötig).</p>`;
  }

  function viewBusy() {
    const pct = Math.round((busy.progress || 0) * 100);
    return html`
      ${header()}
      <section class="card" aria-busy="true" aria-label="Verarbeitung">
        <div class="imp-thumb">
          ${busy.thumb ? html`<img src="${busy.thumb}" alt="">` : html`<span class="pv-icon-badge pv-icon-badge--primary">${raw(ICON.sparkle)}</span>`}
          <div class="grow">
            <h2 class="imp-source__title">${busy.title}</h2>
            <div class="imp-meta mt-2">${counter()}</div>
          </div>
        </div>
        <div class="imp-progress${busy.indeterminate ? ' imp-progress--busy' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${busy.indeterminate ? '' : pct}" data-progress><i style="width:${pct}%"></i></div>
        <p class="imp-status" data-status aria-live="polite">${busy.message}</p>
      </section>`;
  }

  function viewError() {
    return html`
      ${header()}
      <section class="card">
        <div class="pv-callout pv-callout--warn"><span class="pv-callout__icon" aria-hidden="true">⚠️</span><p>${errorInfo?.message || 'Das hat leider nicht geklappt.'}</p></div>
        <div class="imp-actions">
          ${errorInfo?.retry ? html`<button type="button" class="btn btn--primary btn--block" data-retry>${raw(ICON.refresh)} Nochmal versuchen</button>` : ''}
          <div class="btn-row">
            ${queue.length > pos + 1 ? html`<button type="button" class="btn btn--outline" data-skip>Nächste Datei</button>` : ''}
            <button type="button" class="btn btn--ghost" data-restart>Zur Auswahl</button>
          </div>
        </div>
      </section>`;
  }

  function rowStatus(field) {
    const row = review.preview?.rows?.find((r) => r.field === field);
    return row || null;
  }

  function renphoRow(f) {
    const def = HEALTH_FIELDS[f];
    const d = review.parsed.details[f];
    const susp = review.parsed.suspicious.filter((s) => s.field === f);
    const lowConf = d && Number.isFinite(d.confidence) && d.confidence < 60;
    const val = review.values[f] ?? '';
    const row = rowStatus(f);
    const err = review.errors[f];
    const cls = ['imp-row', susp.length || lowConf ? 'is-suspicious' : '', !d && !val ? 'is-missing' : '', err ? 'is-invalid' : ''].filter(Boolean).join(' ');
    return html`<div class="${cls}" data-row="${f}">
      <label class="imp-row__label" for="imp-${f}">${def.label}
        ${!d && !val ? html`<span class="imp-st imp-st--missing">nicht erkannt</span>` : ''}
        ${susp.length || lowConf ? html`<span class="imp-st imp-st--warn" title="Bitte prüfen">prüfen</span>` : ''}
        <span data-st>${row ? html`<span class="imp-st imp-st--${row.status}">${STATUS_LABEL[row.status]}</span>` : ''}</span>
      </label>
      <span class="pv-input-unit"><input id="imp-${f}" class="input" inputmode="decimal" autocomplete="off" data-val="${f}" value="${val}" placeholder="–"${def.unit ? '' : ' style="padding-right:12px"'}>${def.unit ? html`<span>${def.unit}</span>` : ''}</span>
      ${susp.map((s) => html`<p class="imp-row__why">⚠ ${s.reason}</p>`)}
      ${lowConf && !susp.length ? html`<p class="imp-row__why">⚠ Schlecht lesbar – bitte mit dem Screenshot vergleichen</p>` : ''}
      <p class="imp-row__old" data-old>${row && row.old != null && row.status !== 'same' ? `bisher: ${valueText(f, row.old)}` : ''}</p>
      ${err ? html`<p class="imp-row__why" style="color:var(--red-ink)">${err}</p>` : ''}
    </div>`;
  }

  function confidenceBar(c) {
    const p = Math.round((c || 0) * 100);
    const cls = p >= 80 ? '' : p >= 50 ? ' is-mid' : ' is-low';
    return html`<div class="imp-conf"><span class="muted">Erkennung</span><div class="imp-conf__bar${cls}" aria-hidden="true"><i style="width:${p}%"></i></div><b class="num">${p} %</b></div>`;
  }

  function modeBlock() {
    return html`<div class="field mt-4 mb-0">
      <span class="field__label">Bei vorhandenen Werten</span>
      <div class="segmented" role="radiogroup" aria-label="Importmodus">
        <label><input type="radio" name="imp-mode" value="merge" ${mode === 'merge' ? 'checked' : ''}><span>Zusammenführen</span></label>
        <label><input type="radio" name="imp-mode" value="overwrite" ${mode === 'overwrite' ? 'checked' : ''}><span>Überschreiben</span></label>
      </div>
      <p class="imp-mode-hint" data-mode-hint>${mode === 'merge'
        ? 'Leere Felder werden ergänzt; abweichende Werte nur ersetzt, wenn diese Messung neuer ist.'
        : 'Alle importierten Werte ersetzen vorhandene Werte desselben Tages.'}</p>
    </div>`;
  }

  function summaryBlock(c) {
    return html`<dl class="imp-sum" data-sum>
      <div><dt>neu</dt><dd>${c.new || 0}</dd></div>
      <div><dt>aktualisiert</dt><dd>${(c.changed || 0) + (mode === 'overwrite' ? c.conflict || 0 : 0)}</dd></div>
      <div><dt>gleich</dt><dd>${c.same || 0}</dd></div>
      <div><dt>${mode === 'overwrite' ? 'ersetzt' : 'behalten'}</dt><dd>${c.conflict || 0}</dd></div>
    </dl>`;
  }

  function viewRenpho() {
    const r = review;
    const p = r.parsed;
    const order = [...RENPHO_FIELDS.filter((f) => p.details[f] || r.values[f]), ...RENPHO_FIELDS.filter((f) => !p.details[f] && !r.values[f])];
    const nSusp = new Set(p.suspicious.map((s) => s.field)).size;
    const existing = entryFor(store.get().state.healthLog || [], r.date);
    return html`
      ${header()}
      <section class="card" aria-label="Erkannte Werte">
        <div class="imp-thumb">
          ${r.thumb ? html`<img src="${r.thumb}" alt="Screenshot">` : html`<span class="pv-icon-badge pv-icon-badge--primary">${raw(ICON_IMG)}</span>`}
          <div class="grow">
            <h2 class="imp-source__title">RENPHO-Messung prüfen</h2>
            <p class="imp-source__text">${p.recognized.length} von ${RENPHO_FIELDS.length} Werten erkannt${nSusp ? html` · <b style="color:var(--yellow-ink)">${nSusp} bitte prüfen</b>` : ''}</p>
            <div class="imp-meta mt-2">${counter()}<span class="chip chip--sm chip--outline">${r.name}</span></div>
          </div>
        </div>
        <div class="mt-4">${confidenceBar(p.confidence)}</div>
        ${p.warnings.map((w) => html`<div class="pv-callout pv-callout--warn mt-4 mb-0"><span class="pv-callout__icon" aria-hidden="true">⚠️</span><p class="text-sm">${w}</p></div>`)}
        ${r.thumb ? html`<details class="disclosure mt-4 mb-0"><summary>Screenshot ansehen</summary><div class="imp-shot"><img src="${r.thumb}" alt="Screenshot der RENPHO-Messung"></div></details>` : ''}
      </section>

      <section class="card" aria-label="Datum">
        <div class="imp-when">
          <div class="field">
            <label class="field__label" for="imp-date">Datum</label>
            <input id="imp-date" class="input" type="date" data-date value="${r.date || ''}" max="${todayISO()}">
          </div>
          <div class="field">
            <label class="field__label" for="imp-time">Uhrzeit</label>
            <input id="imp-time" class="input" type="time" step="1" data-time value="${r.time || ''}">
          </div>
        </div>
        <p class="field__hint mt-2 mb-0" data-day-hint>${existing ? `Für ${formatDE(r.date)} gibt es schon einen Eintrag – Unterschiede siehst du unten.` : r.date ? `Neuer Eintrag für ${formatDE(r.date)}.` : 'Bitte ein Datum wählen.'}</p>
      </section>

      <section class="card" aria-label="Werte">
        <div class="card__header"><h2 class="card__title">Werte</h2><span class="muted text-sm">antippen zum Korrigieren</span></div>
        <div class="imp-rows">${order.map(renphoRow)}</div>
      </section>

      <section class="card" aria-label="Übernehmen">
        <div data-summary>${summaryBlock(r.preview?.counts || {})}</div>
        ${modeBlock()}
        ${actions('Übernehmen')}
      </section>`;
  }

  function actions(label) {
    const more = queue.length > pos + 1;
    return html`<div class="imp-actions">
      <button type="button" class="btn btn--primary btn--lg btn--block" data-apply>${raw(ICON.check)} ${label}</button>
      <div class="btn-row">
        <button type="button" class="btn btn--ghost" data-discard>${more ? 'Überspringen' : 'Verwerfen'}</button>
      </div>
    </div>`;
  }

  function viewSamsung() {
    const r = review;
    const s = r.result.summary || {};
    const c = r.preview.counts;
    const byDate = new Map();
    for (const row of r.preview.rows) {
      if (row.status === 'same') continue;
      const x = byDate.get(row.date) || { new: 0, changed: 0, conflict: 0 };
      x[row.status] += 1;
      byDate.set(row.date, x);
    }
    const days = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const fields = (s.fields || []).filter((f) => HEALTH_FIELDS[f]);
    return html`
      ${header()}
      <section class="card" aria-label="Samsung Health Export">
        <div class="imp-thumb">
          <span class="pv-icon-badge pv-icon-badge--accent">${raw(ICON_ZIP)}</span>
          <div class="grow">
            <h2 class="imp-source__title">Samsung-Health-Export prüfen</h2>
            <p class="imp-source__text">${r.name}</p>
            <div class="imp-meta mt-2">${counter()}</div>
          </div>
        </div>
        ${s.range ? html`<p class="mt-4 mb-2"><b>${s.days}</b> ${s.days === 1 ? 'Tag' : 'Tage'} · ${formatDE(s.range.from)} – ${formatDE(s.range.to)}</p>` : html`<p class="mt-4">Keine Tageswerte gefunden.</p>`}
        ${fields.length ? html`<div class="chip-row mb-2">${fields.map((f) => html`<span class="chip chip--sm">${HEALTH_FIELDS[f].label} <span class="muted num">${s.fieldCounts?.[f] ?? ''}</span></span>`)}</div>` : ''}
        ${(s.apps || []).length ? html`<p class="field__hint mb-0">Quellen: ${s.apps.join(', ')}</p>` : ''}
        ${(r.result.warnings || []).map((w) => html`<div class="pv-callout pv-callout--warn mt-4 mb-0"><span class="pv-callout__icon" aria-hidden="true">⚠️</span><p class="text-sm">${w}</p></div>`)}
        ${c.invalid ? html`<p class="field__hint mt-2 mb-0">${c.invalid} ${c.invalid === 1 ? 'Tag' : 'Tage'} mit unplausiblen Werten werden übersprungen.</p>` : ''}
      </section>

      <section class="card" aria-label="Änderungen">
        <div class="card__header"><h2 class="card__title">Änderungen</h2><span class="muted text-sm">${c.newDays || 0} neue Tage</span></div>
        <div data-summary>${summaryBlock(c)}</div>
        ${days.length ? html`<details class="disclosure mb-0"><summary>Details je Tag (${days.length})</summary>
          <ul class="imp-days">${days.slice(0, 120).map(([d, x]) => html`<li><span>${formatDE(d)}</span><span class="muted">${countsText(x)}</span></li>`)}</ul>
          ${days.length > 120 ? html`<p class="field__hint">… und ${days.length - 120} weitere Tage</p>` : ''}
        </details>` : html`<p class="muted text-sm mb-0">Alles schon vorhanden – nichts Neues.</p>`}
        ${modeBlock()}
        ${actions(c.days ? `${c.days} ${c.days === 1 ? 'Tag' : 'Tage'} übernehmen` : 'Übernehmen')}
      </section>`;
  }

  function viewDone() {
    return html`
      ${header()}
      <section class="card imp-done">
        <div class="imp-done__icon" aria-hidden="true">${results.applied ? '🎯' : '👌'}</div>
        <h2>${results.applied ? 'Import abgeschlossen' : 'Nichts übernommen'}</h2>
        <p class="muted">${results.applied ? `${results.added} ${results.added === 1 ? 'neuer Tag' : 'neue Tage'}, ${results.updated} aktualisiert${results.skipped ? `, ${results.skipped} unverändert` : ''}.` : 'Es wurden keine Werte gespeichert.'}</p>
        <div class="imp-actions">
          <a class="btn btn--primary btn--block" href="#/gesundheit">${raw(ICON.heart)} Zur Gesundheit</a>
          <button type="button" class="btn btn--ghost btn--block" data-restart>Weitere importieren</button>
        </div>
      </section>`;
  }

  function draw() {
    if (!alive) return;
    applyFontScale(store.get().settings);
    const v = step === 'busy' ? viewBusy() : step === 'review-renpho' ? viewRenpho() : step === 'review-samsung' ? viewSamsung()
      : step === 'error' ? viewError() : step === 'done' ? viewDone() : viewChoose();
    paint(root, v);
    if (step === 'choose') refreshOcrMeta();
  }

  async function refreshOcrMeta() {
    try {
      const ocr = await import('../import/ocr.js');
      const cached = await ocr.assetsCached();
      const box = root.querySelector('[data-ocr-meta]');
      if (!box || !alive) return;
      box.insertAdjacentHTML('beforeend', String(cached
        ? html`<span class="chip chip--sm chip--green">✓ Texterkennung offline bereit</span>`
        : html`<span class="chip chip--sm chip--outline">1. Mal ca. ${ocr.formatMB(ocr.ocrDownloadBytes({ simd: ocr.simdSupported() }))} Download</span>`));
    } catch { /* ignore */ }
  }

  function setBusy(patch) {
    busy = { ...busy, ...patch };
    if (step !== 'busy') { step = 'busy'; draw(); return; }
    const bar = root.querySelector('[data-progress]');
    const st = root.querySelector('[data-status]');
    if (bar) {
      bar.classList.toggle('imp-progress--busy', !!busy.indeterminate);
      const i = bar.querySelector('i');
      if (i) i.style.width = `${Math.round((busy.progress || 0) * 100)}%`;
      if (!busy.indeterminate) bar.setAttribute('aria-valuenow', String(Math.round((busy.progress || 0) * 100)));
    }
    if (st) st.textContent = busy.message;
  }

  /* ---------------- processing ---------------- */

  function enqueue(items) {
    queue = items;
    pos = 0;
    results = { applied: 0, added: 0, updated: 0, skipped: 0, last: null };
    processCurrent();
  }

  async function processCurrent() {
    if (!alive) return;
    const item = queue[pos];
    if (!item) { step = 'done'; draw(); return; }
    errorInfo = null;
    try {
      if (item.kind === 'image') await processImage(item);
      else if (item.kind === 'text') await processText(item);
      else await processSamsung(item);
    } catch (e) {
      console.error('import failed', e);
      if (!alive) return;
      errorInfo = { message: e?.message || 'Die Datei konnte nicht gelesen werden.', retry: true };
      step = 'error';
      draw();
    }
  }

  function makeRenphoReview(item, parsed, thumb) {
    const values = {};
    for (const f of RENPHO_FIELDS) values[f] = parsed.details[f] ? toInput(f, parsed.details[f].value) : '';
    const parsedVals = {};
    for (const f of RENPHO_FIELDS) if (parsed.details[f]) parsedVals[f] = parsed.details[f].value;
    review = {
      kind: 'renpho', item, parsed, thumb, name: item.name || 'Screenshot', values, parsedVals,
      date: parsed.entry.date || todayISO(), time: parsed.entry.measuredAt ? parsed.entry.measuredAt.slice(11, 19) : '',
      errors: {}, preview: null,
    };
    recomputeRenpho();
    step = 'review-renpho';
    draw();
  }

  async function processImage(item) {
    const thumb = objUrl(item.file);
    setBusy({ title: 'Screenshot wird gelesen', message: 'Texterkennung wird vorbereitet…', progress: 0, indeterminate: true, thumb });
    const ocr = await import('../import/ocr.js');
    const heightCm = store.get().settings.profile?.heightCm ?? null;
    let res;
    try {
      res = await ocr.recognize(item.file, {
        onProgress: (p) => {
          if (!alive) return;
          if (p.phase === 'download') setBusy({ message: p.message, progress: p.progress, indeterminate: !p.firstTime });
          else if (p.phase === 'recognize') setBusy({ message: p.message, progress: p.progress, indeterminate: false });
          else setBusy({ message: p.message, indeterminate: true });
        },
        refine: (first) => refineRegions(parseRenphoText(first, { heightCm }), first),
      });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      throw new Error(offline || /laden|fetch|network/i.test(String(e?.message))
        ? 'Die Texterkennung muss einmal online geladen werden (ca. 7,5 MB) – danach funktioniert sie offline. Bitte mit Internet erneut versuchen.'
        : `Texterkennung fehlgeschlagen: ${e?.message || e}`);
    }
    if (!alive) return;
    const fallbackDate = item.file.lastModified ? new Date(item.file.lastModified).toISOString().slice(0, 10) : todayISO();
    const parsed = parseRenphoText(res, { heightCm, fallbackDate: fallbackDate > todayISO() ? todayISO() : fallbackDate });
    makeRenphoReview(item, parsed, thumb);
  }

  async function processText(item) {
    const text = item.text || '';
    // RENPHO-style text first („Gewicht 101,9 kg“ also contains commas), then CSV (Samsung Health)
    const parsed = parseRenphoText(text, { heightCm: store.get().settings.profile?.heightCm ?? null, fallbackDate: todayISO() });
    if (parsed.recognized.length >= 2) { makeRenphoReview(item, parsed, null); return; }
    if (looksLikeCsv(text)) {
      await processSamsung({ ...item, kind: 'samsung', file: new File([text], /\.csv$/i.test(item.name) ? item.name : 'geteilt.csv', { type: 'text/csv' }) });
      return;
    }
    throw new Error('Im geteilten Text wurden keine Messwerte gefunden. Bitte einen Screenshot oder eine CSV-/ZIP-Datei teilen.');
  }

  async function processSamsung(item) {
    setBusy({ title: 'Export wird gelesen', message: `${item.name || 'Datei'} wird entpackt und ausgewertet…`, progress: 0, indeterminate: true, thumb: null });
    const { parseSamsungExport } = await import('../import/samsung.js');
    const result = await parseSamsungExport(item.file, { name: item.name });
    if (!alive) return;
    if (!result.entries?.length) throw new Error((result.warnings || [])[0] || 'In der Datei wurden keine Samsung-Health-Werte gefunden.');
    review = { kind: 'samsung', item, name: item.name || 'Export', result, preview: previewImport(store.get().state, result.entries) };
    step = 'review-samsung';
    draw();
  }

  /* ---------------- renpho review state ---------------- */

  function recomputeRenpho() {
    const r = review;
    const { entry, errors } = entryFromForm({ date: r.date, time: r.time, values: r.values, parsed: r.parsedVals });
    r.entry = entry;
    r.errors = errors;
    r.preview = Object.keys(errors).length ? { rows: [], counts: {} } : previewImport(store.get().state, [entry]);
  }

  function refreshRenphoStatus() {
    const r = review;
    for (const f of RENPHO_FIELDS) {
      const el = root.querySelector(`[data-row="${f}"]`);
      if (!el) continue;
      const row = r.preview.rows.find((x) => x.field === f);
      el.querySelector('[data-st]').innerHTML = row ? String(html`<span class="imp-st imp-st--${row.status}">${STATUS_LABEL[row.status]}</span>`) : '';
      el.querySelector('[data-old]').textContent = row && row.old != null && row.status !== 'same' ? `bisher: ${valueText(f, row.old)}` : '';
      el.classList.toggle('is-invalid', !!r.errors[f]);
      el.classList.toggle('is-missing', !r.values[f] && !r.parsed.details[f]);
    }
    const sum = root.querySelector('[data-summary]');
    if (sum) sum.innerHTML = String(summaryBlock(r.preview.counts || {}));
    const hint = root.querySelector('[data-day-hint]');
    if (hint) {
      const existing = r.date && entryFor(store.get().state.healthLog || [], r.date);
      hint.textContent = !r.date ? 'Bitte ein Datum wählen.' : existing ? `Für ${formatDE(r.date)} gibt es schon einen Eintrag – Unterschiede siehst du unten.` : `Neuer Eintrag für ${formatDE(r.date)}.`;
    }
    const btn = root.querySelector('[data-apply]');
    if (btn) btn.disabled = Object.keys(r.errors).length > 0;
  }

  /* ---------------- apply / skip ---------------- */

  async function apply() {
    const r = review;
    if (!r) return;
    let entries;
    if (r.kind === 'renpho') {
      recomputeRenpho();
      if (Object.keys(r.errors).length) {
        refreshRenphoStatus();
        toast(Object.values(r.errors)[0], { kind: 'accent', icon: '!' });
        return;
      }
      entries = [r.entry];
    } else {
      entries = r.result.entries;
    }
    if (mode === 'overwrite' && (r.preview?.counts?.conflict || 0) > 0) {
      const ok = await confirmDialog({ title: 'Werte überschreiben?', text: `${r.preview.counts.conflict} vorhandene ${r.preview.counts.conflict === 1 ? 'Wert wird' : 'Werte werden'} ersetzt.`, confirm: 'Überschreiben' });
      if (!ok) return;
    }
    let res = null;
    try {
      store.update((d) => {
        res = applyImport(d.state, entries, { mode, today: todayISO() });
        d.state = res.state;
      });
    } catch (e) {
      toast(e?.message || 'Speichern fehlgeschlagen', { kind: 'accent', icon: '!' });
      return;
    }
    results.applied += 1;
    results.added += res.added;
    results.updated += res.updated;
    results.skipped += res.skipped;
    if (r.kind === 'renpho') {
      toast(`RENPHO-Messung vom ${formatDE(r.entry.date)} übernommen${res.xp ? ` · +${res.xp} XP` : ''}`, { icon: '✓' });
    } else {
      toast(`${res.added + res.updated} ${res.added + res.updated === 1 ? 'Tag' : 'Tage'} übernommen (${res.added} neu, ${res.updated} aktualisiert)`, { icon: '✓' });
    }
    await finishItem();
  }

  async function finishItem() {
    const item = queue[pos];
    if (item?.shareKey) {
      await clearShared([item.shareKey]);
      shared = shared.filter((s) => s.key !== item.shareKey);
    }
    pos += 1;
    review = null;
    if (pos >= queue.length) { step = 'done'; draw(); } else processCurrent();
  }

  /* ---------------- events ---------------- */

  const onChange = (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.matches('[data-pick]') && t.files?.length) {
      const files = [...t.files];
      const kind = t.getAttribute('data-pick');
      const items = files.map((file) => ({ kind: kind === 'image' ? 'image' : (classifyFile(file) === 'image' ? 'image' : 'samsung'), file, name: file.name }));
      t.value = '';
      enqueue(items);
      return;
    }
    if (t.name === 'imp-mode') {
      mode = t.value === 'overwrite' ? 'overwrite' : 'merge';
      const hint = root.querySelector('[data-mode-hint]');
      if (hint) hint.textContent = mode === 'merge' ? 'Leere Felder werden ergänzt; abweichende Werte nur ersetzt, wenn diese Messung neuer ist.' : 'Alle importierten Werte ersetzen vorhandene Werte desselben Tages.';
      const sum = root.querySelector('[data-summary]');
      if (sum && review?.preview) sum.innerHTML = String(summaryBlock(review.preview.counts || {}));
      return;
    }
    if (review?.kind === 'renpho' && (t.matches('[data-date]') || t.matches('[data-time]'))) {
      if (t.matches('[data-date]')) review.date = t.value;
      else review.time = t.value;
      recomputeRenpho();
      refreshRenphoStatus();
    }
  };

  const onInput = (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (review?.kind === 'renpho' && t.matches('[data-val]')) {
      review.values[t.getAttribute('data-val')] = t.value;
      recomputeRenpho();
      refreshRenphoStatus();
    }
  };

  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!t) return;
    if (t.matches('[data-apply]')) { t.disabled = true; await apply(); if (alive && t.isConnected) t.disabled = false; return; }
    if (t.matches('[data-discard]')) { await finishItem(); return; }
    if (t.matches('[data-skip]')) { await finishItem(); return; }
    if (t.matches('[data-retry]')) { processCurrent(); return; }
    if (t.matches('[data-restart]')) { queue = []; pos = 0; review = null; step = 'choose'; shared = await readShared(); draw(); return; }
    if (t.matches('[data-shared-go]')) { startShared(); return; }
    if (t.matches('[data-shared-discard]')) {
      const ok = await confirmDialog({ title: 'Geteilte Dateien verwerfen?', text: 'Sie werden aus der App entfernt, nichts wird importiert.', confirm: 'Verwerfen', danger: true });
      if (!ok) return;
      await clearShared(shared.map((s) => s.key));
      shared = [];
      draw();
    }
  };

  function startShared() {
    const items = shared.map((s) => (s.kind === 'text'
      ? { kind: 'text', text: s.text, name: s.name, shareKey: s.key }
      : { kind: classifyFile(s.blob) === 'image' ? 'image' : 'samsung', file: s.blob, name: s.name, shareKey: s.key }));
    if (items.length) enqueue(items);
  }

  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);

  draw();
  readShared().then((list) => {
    if (!alive) return;
    shared = list;
    if (step !== 'choose') return;
    if (query?.shared && list.length) {
      try { history.replaceState(null, '', '#/import'); } catch { /* ignore */ }
      startShared();
    } else if (list.length) draw();
  });

  return () => {
    alive = false;
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick);
    for (const u of urls) URL.revokeObjectURL(u);
  };
}
