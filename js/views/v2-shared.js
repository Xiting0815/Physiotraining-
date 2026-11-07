// Shared helpers for the v2 screens (Eigene Workouts, Gesundheit, Rudern in Verlauf/Übungen).
// Not a route. Pure helpers are Node-testable; DOM helpers only touch `document` when called.
// (Kept separate from ui.js, which is owned by another work package.)
import { html, raw } from '../render.js';
import { BLOCK_LABEL, EQUIPMENT_LABEL } from './ui.js';
import { exerciseAvailable } from '../logic/progression.js';
import { evaluateBadges, XP } from '../logic/motivation.js';
import { isCardioSession } from '../logic/stats.js';

/* ------------------------------------------------------------------ */
/* Labels & formatting                                                 */
/* ------------------------------------------------------------------ */

const EXTRA_EQUIP = { 'rowing-machine': 'Rudergerät' };
const EXTRA_BLOCK = { cardio: 'Rudern' };

/** Equipment label with v2 fallbacks. */
export const equipLabel = (id) => EQUIPMENT_LABEL[id] ?? EXTRA_EQUIP[id] ?? id;
/** Block label incl. cardio („Rudern“). */
export const blockLabel = (b) => BLOCK_LABEL[b] ?? EXTRA_BLOCK[b] ?? b;

/** German number format (`1.234,5`). */
export function fmtNum(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** Metres → „4,25 km“ (or „850 m“ below 1 km). */
export function fmtDistance(m) {
  if (m == null || !Number.isFinite(m)) return '–';
  return m >= 1000 ? `${fmtNum(m / 1000, m >= 100000 ? 0 : 2)} km` : `${fmtNum(m)} m`;
}
/** Seconds → „m:ss“. */
export function fmtClock(sec) {
  if (sec == null || !Number.isFinite(sec)) return '–';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}
/** Pace seconds per 500 m → „2:05 /500 m“. */
export const fmtPace = (sec) => (sec == null ? '–' : `${fmtClock(sec)} /500 m`);

/** Session kind for filters: 'cardio' | 'short' | 'custom' | 'strength'. */
export function sessionKind(s) {
  if (isCardioSession(s)) return 'cardio';
  if (s?.kind === 'short' || s?.kind === 'custom') return s.kind;
  return 'strength';
}

export const KCAL_METHOD_LABEL = { display: 'Anzeige Rudergerät', watt: 'aus Watt berechnet', met: 'MET-Schätzung' };

/* ------------------------------------------------------------------ */
/* Availability (phase / post-op)                                      */
/* ------------------------------------------------------------------ */

/**
 * Availability info of an exercise for the current state (for chips/badges).
 * kind: 'cardio-only' (rowing in builder), 'phase' (phaseMin above current), 'off' (user disabled),
 * 'blocked' (post-op phase, not allowed), 'enabled' (post-op allowed by user toggle), 'postop-later'
 * (prehab now, paused after surgery), 'ok'.
 * @returns {{kind: string, text: string, tone: 'warn'|'stop'|'info'|'ok'}}
 */
export function availability(ex, state, phases) {
  const phase = (phases || []).find((p) => p.id === state?.phaseId) ?? (phases || [])[0];
  const order = (id) => (phases || []).find((p) => p.id === id)?.order ?? null;
  const t = state?.exerciseToggles?.[ex?.id];
  if (t === false) return { kind: 'off', text: 'Von dir deaktiviert', tone: 'stop' };
  if (phase?.kind === 'postop') {
    if (ex?.postOpAllowed === false) {
      return exerciseAvailable(ex, phase, state)
        ? { kind: 'enabled', text: 'Für dich freigegeben', tone: 'ok' }
        : { kind: 'blocked', text: 'Nach der OP gesperrt', tone: 'stop' };
    }
  }
  const cur = order(phase?.id);
  const min = order(ex?.phaseMin);
  if (cur != null && min != null && cur < min) {
    const p = (phases || []).find((x) => x.id === ex.phaseMin);
    return { kind: 'phase', text: `ab ${p ? p.name.split('–')[0].trim() : ex.phaseMin}`, tone: 'warn' };
  }
  if (phase?.kind !== 'postop' && ex?.postOpAllowed === false) return { kind: 'postop-later', text: 'nach OP pausiert', tone: 'info' };
  return { kind: 'ok', text: '', tone: 'ok' };
}

/** Chip markup for availability (empty for 'ok'). */
export function availabilityChip(info) {
  if (!info || info.kind === 'ok') return '';
  const cls = info.tone === 'stop' ? 'v2-chip--stop' : info.tone === 'warn' ? 'v2-chip--warn' : info.tone === 'ok' ? 'chip--green' : 'chip--outline';
  const icon = info.tone === 'stop' ? '⛔ ' : info.tone === 'warn' ? '⏳ ' : info.tone === 'ok' ? '✓ ' : '🩼 ';
  return html`<span class="chip chip--sm ${cls}">${icon}${info.text}</span>`;
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

/**
 * Award newly earned badges on a data draft (mutates): adds to state.badges + XP.badge each.
 * @returns {string[]} new badge ids
 */
export function awardBadges(d, badgeDefs, today, now = new Date()) {
  const ids = evaluateBadges(d, badgeDefs || [], { today });
  for (const id of ids) d.state.badges = { ...(d.state.badges || {}), [id]: now.toISOString() };
  d.state.xp = (d.state.xp || 0) + ids.length * XP.badge;
  return ids;
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICON2 = {
  row: svg('<circle cx="15" cy="5" r="2"/><path d="M14 8l-3 5h5l3 4M11 13l-5 1M3 20h18M7 20l2-3"/><path d="M4 11l9-2"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  scale: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9a5 5 0 0 1 8 0l-3 3"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  steps: svg('<path d="M8 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 15h4v2a2 2 0 0 1-4 0zM16 7c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM14 19h4v.5a2 2 0 0 1-4 0z"/>'),
  fire: svg('<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.3 2.4-5 3.4-8 1.6 1.5 2.2 3 2.2 4.4 1.1-1 1.8-2.6 1.9-4.7 3 2.2 5.5 5.2 5.5 8.6 0 3.4-2.5 5.9-6.5 5.9z"/>'),
  pulse: svg('<path d="M3 12h4l2-5 4 10 2-5h6"/>'),
  sparkles: svg('<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
};

/* ------------------------------------------------------------------ */
/* Charts: line chart with a y offset (weight, resting HR, ...)        */
/* ------------------------------------------------------------------ */

/**
 * Compute a y window for values that don't start at 0.
 * @returns {{base: number, yMax: number}} plot y - base in [0, yMax]
 */
export function yWindow(values, { pad = 1, step = 1, minSpan = 4 } = {}) {
  const vs = values.filter((v) => Number.isFinite(v));
  if (!vs.length) return { base: 0, yMax: 10 };
  let lo = Math.floor((Math.min(...vs) - pad) / step) * step;
  let hi = Math.ceil((Math.max(...vs) + pad) / step) * step;
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = Math.floor((mid - minSpan / 2) / step) * step; hi = lo + Math.ceil(minSpan / step) * step; }
  if (hi - lo === 10) hi += step; // avoid the pain-zone special case of yMax 10
  return { base: lo, yMax: hi - lo };
}

/**
 * Draw `lineChart` with values shifted by `base` and relabel y ticks / tooltips with real values.
 * `series[].dashed` renders the series as a dashed goal line; `series[].mean` adds its 7-day mean.
 */
export function offsetLineChart(lineChart, container, series, { pad = 1, step = 1, minSpan = 4, digits = 1, unit = '', label, from, to } = {}) {
  const { base, yMax } = yWindow(series.flatMap((s) => s.points.map((p) => p.y)), { pad, step, minSpan });
  const shifted = series.map((s) => ({ ...s, points: s.points.map((p) => ({ x: p.x, y: p.y - base })) }));
  const el = lineChart(container, { series: shifted, yMax }, { label, from, to, bands: false, mean: false });
  for (const t of el.querySelectorAll('.grid text')) {
    const v = Number(t.textContent);
    if (Number.isFinite(v)) t.textContent = fmtNum(base + v, step < 1 ? 1 : 0);
  }
  for (const t of el.querySelectorAll('circle.dot > title')) {
    t.textContent = t.textContent.replace(/(-?[\d.]+)$/, (m) => `${fmtNum(base + Number(m), digits)}${unit ? ' ' + unit : ''}`);
  }
  series.forEach((s) => {
    if (!s.dashed) return;
    const g = el.querySelector(`g.series[data-name="${CSS.escape(s.name)}"]`);
    g?.querySelectorAll('path').forEach((p) => { p.setAttribute('class', 'goal-line'); p.removeAttribute('stroke'); });
    g?.querySelectorAll('circle').forEach((c) => c.remove());
  });
  return el;
}

/* ------------------------------------------------------------------ */
/* Styles (tokens only), injected once                                 */
/* ------------------------------------------------------------------ */

const CSS_TEXT = `
.v2-chip--warn { background: var(--yellow-soft); color: var(--yellow-ink); }
.v2-chip--stop { background: var(--stop-soft); color: var(--stop-ink); }
.v2-actions { display: flex; gap: var(--s-2); flex-wrap: wrap; margin-top: var(--s-3); }
.v2-actions .btn { flex: 1 1 auto; }
.v2-cw-card { position: relative; overflow: hidden; }
.v2-cw-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: linear-gradient(var(--primary), var(--accent)); }
.v2-cw-meta { display: flex; flex-wrap: wrap; gap: var(--s-2); margin: var(--s-2) 0 0; }
.v2-split { display: flex; gap: 3px; height: 6px; margin-top: var(--s-3); }
.v2-split > span { border-radius: 3px; background: var(--block-neutral); opacity: .45; }
.v2-split > .is-knee { background: var(--primary); opacity: 1; }
.v2-split > .is-archery { background: var(--accent); opacity: 1; }
.v2-tpl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
.v2-tpl button { text-align: left; min-height: 64px; padding: var(--s-2) var(--s-3); border-radius: var(--radius-sm); border: 1px dashed var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.v2-tpl button strong { display: block; font-size: var(--fs-sm); }
.v2-tpl button span { color: var(--muted); font-size: var(--fs-xs); }
.v2-sec { margin-bottom: var(--s-4); }
.v2-sec__head { display: flex; align-items: center; gap: var(--s-2); margin: var(--s-5) 0 var(--s-2); }
.v2-sec__head h2 { margin: 0; font-size: var(--fs-md); font-weight: var(--fw-bold); flex: 1; min-width: 0; }
.v2-sec__dot { width: 12px; height: 12px; border-radius: 50%; background: var(--block-neutral); flex: none; }
.v2-sec--knee .v2-sec__dot { background: var(--primary); }
.v2-sec--archery .v2-sec__dot { background: var(--accent); }
.v2-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.v2-item { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3); background: var(--surface); border: 1px solid color-mix(in srgb, var(--border) 80%, transparent); border-radius: var(--radius-sm); box-shadow: var(--shadow-1); }
.v2-item__num { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: var(--fs-xs); font-weight: var(--fw-bold); background: var(--surface-2); color: var(--muted); }
.v2-item__body { flex: 1; min-width: 0; }
.v2-item__name { display: block; font-weight: var(--fw-semibold); line-height: 1.25; }
.v2-item__sub { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; color: var(--muted); font-size: var(--fs-xs); margin-top: 2px; }
.v2-item__btns { display: flex; gap: 2px; flex: none; }
.v2-item__btns .btn { width: 40px; min-height: 40px; padding: 0; }
.v2-empty-sec { border: 1.5px dashed var(--border); border-radius: var(--radius-sm); padding: var(--s-3); text-align: center; color: var(--muted); font-size: var(--fs-sm); }
.v2-durbar { position: sticky; bottom: calc(var(--tabbar-h) + var(--safe-bottom) + var(--s-2)); z-index: 6; margin-top: var(--s-5); padding: var(--s-3) var(--s-4); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-2); border: 1px solid var(--border); }
.v2-durbar__row { display: flex; align-items: center; gap: var(--s-3); }
.v2-durbar__min { font-size: var(--fs-xl); font-weight: var(--fw-black); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.v2-meter { position: relative; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; margin-top: var(--s-2); }
.v2-meter > i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--green); transition: width var(--dur) var(--ease); }
.v2-meter.is-warn > i { background: var(--yellow); }
.v2-meter.is-over > i { background: var(--red); }
.v2-meter--accent > i { background: var(--accent); }
.v2-meter--primary > i { background: var(--primary); }
.v2-warn-list { margin: var(--s-2) 0 0; padding-left: 1.1em; font-size: var(--fs-sm); color: var(--yellow-ink); }
.v2-err-list { margin: var(--s-2) 0 0; padding-left: 1.1em; font-size: var(--fs-sm); color: var(--red-ink); }
.v2-picker-list { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.v2-pick { width: 100%; display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-3); border-radius: var(--radius-sm); background: var(--surface-2); border: 1px solid transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; min-height: 56px; }
.v2-pick:disabled { cursor: not-allowed; opacity: .75; }
.v2-pick.is-added { border-color: var(--primary); background: var(--primary-soft); }
.v2-pick__thumb { width: 44px; height: 44px; flex: none; border-radius: 10px; background: var(--surface); display: grid; place-items: center; overflow: hidden; }
.v2-pick__thumb > * { width: 100%; height: 100%; }
.v2-pick__body { flex: 1; min-width: 0; }
.v2-pick__name { display: block; font-weight: var(--fw-semibold); line-height: 1.25; }
.v2-pick__sub { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; font-size: var(--fs-xs); color: var(--muted); }
.v2-pick__add { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); color: var(--primary-ink); }
.v2-pick__add svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
.v2-pick.is-added .v2-pick__add { background: var(--primary); color: var(--on-primary); }
.v2-sheet-sticky { position: sticky; top: calc(-1 * var(--s-4)); z-index: 2; background: var(--surface); padding: var(--s-2) 0; }
.v2-tabs { margin: 0 0 var(--s-4); }
.v2-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 var(--s-3); }
.v2-form-grid .field { margin-bottom: var(--s-3); min-width: 0; }
.v2-unit { position: relative; }
.v2-unit .input { padding-right: 46px; width: 100%; }
.v2-unit > span { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: var(--fs-sm); pointer-events: none; }
.v2-field-err { color: var(--red-ink); font-size: var(--fs-xs); font-weight: var(--fw-semibold); }
.input.is-invalid { border-color: var(--red); }
.v2-group-title { font-size: var(--fs-xs); font-weight: var(--fw-bold); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: var(--s-3) 0 var(--s-2); display: flex; align-items: center; gap: 6px; }
.v2-group-title svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.v2-ready { display: flex; align-items: center; gap: var(--s-4); }
.v2-parts { display: flex; flex-direction: column; gap: var(--s-3); margin-top: var(--s-4); }
.v2-part__head { display: flex; justify-content: space-between; gap: var(--s-2); font-size: var(--fs-sm); }
.v2-part__head span:last-child { font-variant-numeric: tabular-nums; color: var(--muted); }
.v2-tips { margin: var(--s-3) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--s-2); font-size: var(--fs-sm); }
.v2-tips li { display: flex; gap: var(--s-2); }
.v2-tips li::before { content: "→"; color: var(--primary-ink); font-weight: var(--fw-bold); }
.v2-week-nav { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); margin-bottom: var(--s-3); }
.v2-week-nav h3 { margin: 0; font-size: var(--fs-lg); }
.v2-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
.v2-kpi { padding: var(--s-3); border-radius: var(--radius-sm); background: var(--surface-2); min-width: 0; }
.v2-kpi__v { display: block; font-size: var(--fs-xl); font-weight: var(--fw-black); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.v2-kpi__v small { font-size: var(--fs-sm); color: var(--muted); font-weight: var(--fw-bold); margin-left: 2px; }
.v2-kpi__l { display: block; font-size: var(--fs-xs); color: var(--muted); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }
.v2-kpi.is-met .v2-kpi__v { color: var(--gold-ink); }
.v2-list-check { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: var(--fs-sm); }
.v2-list-check li { display: flex; gap: var(--s-2); }
.v2-list-check li::before { content: "✓"; color: var(--green-ink); font-weight: var(--fw-black); }
.v2-list-check.is-note li::before { content: "!"; color: var(--yellow-ink); }
.v2-corr { padding: var(--s-3) 0; }
.v2-corr + .v2-corr { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.v2-corr__head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
.v2-corr__head strong { font-size: var(--fs-md); }
.v2-corr p { margin: var(--s-1) 0 0; font-size: var(--fs-sm); color: var(--muted); }
.v2-entry { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-3) var(--s-4); }
.v2-entry__date { flex: none; width: 52px; text-align: center; border-radius: var(--radius-sm); background: var(--primary-soft); color: var(--primary-ink); padding: 4px 0; line-height: 1.1; }
.v2-entry__date b { display: block; font-size: var(--fs-lg); font-weight: var(--fw-black); }
.v2-entry__date span { font-size: var(--fs-xs); font-weight: var(--fw-semibold); }
.v2-entry__vals { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.v2-entry__vals .muted { font-size: var(--fs-xs); flex-basis: 100%; }
.v2-entry__btns { display: flex; gap: 2px; flex: none; }
.v2-entry__btns .btn { width: 40px; min-height: 40px; padding: 0; }
.v2-row-icon { color: var(--accent-ink); }
.v2-row-icon svg { width: 22px; height: 22px; }
.v2-hint-steps { margin: 0; padding-left: 1.2em; font-size: var(--fs-sm); display: flex; flex-direction: column; gap: 6px; }
.v2-streak { display: inline-flex; align-items: center; gap: 6px; }
.v2-rowlevels { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.v2-rowlevel { border-radius: var(--radius-sm); background: var(--surface-2); padding: var(--s-3); border: 1px solid transparent; }
.v2-rowlevel.is-current { border-color: var(--accent); background: var(--accent-soft); }
.v2-rowlevel__head { display: flex; align-items: center; gap: var(--s-2); justify-content: space-between; }
.v2-rowlevel__head strong { font-size: var(--fs-sm); }
.v2-phases { display: flex; gap: 2px; height: 22px; margin-top: var(--s-2); border-radius: 6px; overflow: hidden; }
.v2-phases > span { min-width: 3px; display: grid; place-items: center; font-size: 9px; font-weight: var(--fw-bold); color: var(--on-accent); overflow: hidden; white-space: nowrap; }
.v2-phases > .is-easy { background: color-mix(in srgb, var(--accent) 35%, var(--surface)); color: var(--accent-ink); }
.v2-phases > .is-moderate { background: color-mix(in srgb, var(--accent) 70%, var(--surface)); }
.v2-phases > .is-vigorous { background: var(--accent-strong); }
.v2-rowlevel__meta { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: var(--s-2); font-size: var(--fs-xs); color: var(--muted); }
.v2-filter-row { margin: 0 0 var(--s-3); }
.exercise-card.is-muted { opacity: .72; }
.exercise-card.is-muted .exercise-card__thumb { filter: grayscale(1); }
`;

export function ensureV2Styles() {
  if (typeof document === 'undefined' || document.getElementById('v2-styles')) return;
  const st = document.createElement('style');
  st.id = 'v2-styles';
  st.textContent = CSS_TEXT;
  document.head.appendChild(st);
}

/** A small meter bar (0..1). */
export function meter(ratio, cls = '') {
  const p = Math.max(0, Math.min(1, ratio || 0));
  return html`<div class="v2-meter ${cls}" aria-hidden="true"><i style="width:${(p * 100).toFixed(1)}%"></i></div>`;
}

export { raw };
