// Shared helpers for the WP-Views screens (not a route). Pure helpers are Node-testable;
// DOM helpers (toast, confirmDialog, openSheet, ensureViewStyles) only touch `document` when called.
import { html, raw } from '../render.js';
import { parseISODate } from '../util/date.js';
import { EQUIPMENT_INFO } from '../logic/equipment.js';
import { pendingNextDay as pendingNextDayGroup } from '../logic/next-day.js';
import { defaults as storeDefaults } from '../store.js';

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const BLOCK_LABEL = { warmup: 'Aufwärmen', knee: 'Knie', archery: 'Bogen', cooldown: 'Abschluss', cardio: 'Rudern' };
export const BLOCK_LONG = { warmup: 'Aufwärmen', knee: 'Knie-Block', archery: 'Bogen-/Rücken-Block', cooldown: 'Cool-down', cardio: 'Rudern' };
/** Equipment labels (v5: base + optional ids from logic/equipment.js). */
export const EQUIPMENT_LABEL = Object.fromEntries(Object.entries(EQUIPMENT_INFO).map(([id, v]) => [id, v.label]));
/** v2 workout/session kinds (SPEC §12.2). Missing kind = strength. */
export const KIND_LABEL = { strength: 'Krafttraining', short: 'Kurztraining', cardio: 'Rudern', custom: 'Eigenes Workout' };
export const KIND_ICON = { strength: '🦵', short: '⚡', cardio: '🚣', custom: '🧩', relief: '🌿' };
/** Rowing intensity labels (capitalised for chips; logic/cardio.js INTENSITY_LABELS are lower-case). */
export const INTENSITY_LABEL = { easy: 'Locker', moderate: 'Gleichmäßig', vigorous: 'Zügig' };
/** @param {{kind?: string}|null|undefined} x workout or session */
export const kindOf = (x) => x?.kind ?? 'strength';
export const TRAFFIC_SHORT = { green: 'Grün', yellow: 'Gelb', red: 'Rot', stop: 'Stopp' };
export const TRAFFIC_LONG = {
  green: 'Grün – passt', yellow: 'Gelb – halten', red: 'Rot – zurück', stop: 'Stopp – ärztlich abklären',
};
export const SIDE_LABEL = {
  both: 'beidseitig', left: 'nur links (OP-Knie)', right: 'nur rechts', alternate: 'abwechselnd', perSide: 'je Seite',
};

/* ------------------------------------------------------------------ */
/* Icons (stroke, currentColor)                                        */
/* ------------------------------------------------------------------ */

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${extra}>${d}</svg>`;
export const ICON = {
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>'),
  clock: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>'),
  list: svg('<path d="M4 12h16M4 6h16M4 18h10"/>'),
  chev: '<svg class="list-item__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  back: svg('<path d="M15 6l-6 6 6 6"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  upload: svg('<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
  bag: svg('<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  swap: svg('<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>'),
  refresh: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  minus: svg('<path d="M6 12h12"/>'),
  plus: svg('<path d="M6 12h12M12 6v12"/>'),
  knee: svg('<path d="M9 3v7l-2 5 3 6M15 3v6l1 5-2 7"/>'),
  bow: svg('<path d="M6 3c8 3 8 15 0 18M6 3v18M3 12h16M16 9l3 3-3 3"/>'),
  row: svg('<circle cx="6" cy="6" r="2"/><path d="M7 8l3 5h5M3 19h18M10 13l-3 6M15 13l3-6 3-1"/>'),
  chart: svg('<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>'),
  heart: svg('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>'),
  bolt: svg('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  puzzle: svg('<path d="M10 4h4v3a1.5 1.5 0 0 0 3 0V4h3v6h-3a1.5 1.5 0 0 0 0 3h3v7h-6v-3a1.5 1.5 0 0 0-3 0v3H4v-7h3a1.5 1.5 0 0 0 0-3H4V4z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** @param {any} settings @param {string|null|undefined} id */
export function bandInfo(settings, id) {
  if (!id) return null;
  const b = (settings?.bands || []).find((x) => x.id === id);
  return b || { id, label: id, color: 'var(--muted)', kind: 'theraband' };
}

/**
 * Dose line for a level, e.g. "3 × 10 × 10 s", "2 × 12 je Seite", "3 × 45 s".
 * @param {any} ex exercise  @param {any} lvl level
 */
export function doseText(ex, lvl) {
  if (!lvl) return '';
  const parts = [String(lvl.sets ?? 1)];
  if (ex?.type === 'timed' || (lvl.seconds && !lvl.reps)) parts.push(`${lvl.seconds ?? 0} s`);
  else {
    if (lvl.reps != null) parts.push(String(lvl.reps));
    if (lvl.hold) parts.push(`${lvl.hold} s`);
  }
  let s = parts.join(' × ');
  if (ex?.side === 'perSide') s += ' je Seite';
  return s;
}

/** Workout items with sections in session order. @param {any} w */
export function workoutItems(w) {
  if (!w) return [];
  return [
    ...(w.warmup || []).map((it) => ({ ...it, section: 'warmup' })),
    ...(w.blocks || []).flatMap((b) => (b.items || []).map((it) => ({ ...it, section: b.id }))),
    ...(w.cooldown || []).map((it) => ({ ...it, section: 'cooldown' })),
  ];
}

/** Count of exercises per section. @param {any} w @returns {{warmup:number, knee:number, archery:number, cooldown:number, total:number}} */
export function workoutSplit(w) {
  const c = { warmup: 0, knee: 0, archery: 0, cooldown: 0, total: 0 };
  for (const it of workoutItems(w)) { c[it.section] = (c[it.section] || 0) + 1; c.total += 1; }
  return c;
}

/** "A" | "B" | "C" letter of a workout inside its phase (fallback: last char of the name). */
export function workoutLetter(w, phases) {
  const ph = (phases || []).find((p) => p.id === w?.phaseId);
  if (ph) for (const k of ['A', 'B', 'C']) if (ph.workouts?.[k] === w.id) return k;
  const m = String(w?.name || '').match(/([A-Z])\s*$/);
  return m ? m[1] : '•';
}

/**
 * Heute banner: the latest session of the most recent training day whose next-day check-in is due right
 * now, else null. Delegates to logic/next-day.js `pendingNextDay` (same source as #/folgetag), so the
 * banner shows exactly when the check-in page has something to ask (all sessions of that day).
 * @param {any[]} sessions @param {Date} [now]
 */
export function pendingNextDay(sessions, now = new Date()) {
  const p = pendingNextDayGroup(sessions, now);
  return p?.due ? p.session : null;
}

/** "8–15" → [8, 15]; "2–5" → [2, 5]; "25–60 (einfach) / 100–135" → [25, 60]; "12" → [12, 12]. */
export function parsePriceRange(str) {
  const m = String(str ?? '').match(/(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?/);
  if (!m) return null;
  const a = Number(m[1].replace(',', '.'));
  const b = m[2] != null ? Number(m[2].replace(',', '.')) : a;
  return [a, b];
}

/** Sum price ranges of items. @param {{priceEur?: string}[]} items @returns {[number, number]} */
export function budgetSum(items) {
  let lo = 0, hi = 0;
  for (const it of items || []) {
    const r = parsePriceRange(it?.priceEur);
    if (r) { lo += r[0]; hi += r[1]; }
  }
  return [lo, hi];
}

export const PRIORITY_ORDER = ['muss', 'sinnvoll', 'nice'];
export const PRIORITY_LABEL = { muss: 'Muss', sinnvoll: 'Sinnvoll', nice: 'Nice-to-have' };
/** Normalise free-form priorities ("Nice to have", "MUSS") to muss|sinnvoll|nice. */
export function normPriority(p) {
  const s = String(p ?? '').toLowerCase();
  if (s.startsWith('mus')) return 'muss';
  if (s.startsWith('sinn')) return 'sinnvoll';
  if (s.startsWith('nice') || s.startsWith('opt')) return 'nice';
  return 'sinnvoll';
}

/** Equipment items from a raw equipment.json (object with items/equipment or bare array). */
export function equipmentItems(eq) {
  if (Array.isArray(eq)) return eq;
  if (eq && Array.isArray(eq.items)) return eq.items;
  if (eq && Array.isArray(eq.equipment)) return eq.equipment;
  return [];
}

/**
 * German number format: 1 decimal by default, comma separator, no trailing ",0" when `trim`.
 * @param {number|null|undefined} n @param {number} [digits] @param {{trim?: boolean, sign?: boolean}} [o]
 */
export function fmtNum(n, digits = 1, { trim = false, sign = false } = {}) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  const v = Number(n);
  let s = v.toFixed(digits);
  if (trim && digits > 0) s = s.replace(/\.?0+$/, '');
  s = s.replace('.', ',');
  if (sign && v > 0) s = '+' + s;
  return s;
}

/** Integer with German thousands separator: 12345 → "12.345". */
export function fmtInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Distance in m → "850 m" / "12,4 km". */
export function fmtDistance(m) {
  m = Number(m);
  if (!Number.isFinite(m) || m <= 0) return '0 m';
  return m < 1000 ? `${Math.round(m)} m` : `${fmtNum(m / 1000, 1, { trim: true })} km`;
}

/**
 * Award newly earned badges on a data draft (mutates): state.badges[id] = now, +XP.badge each.
 * @param {any} d data draft @param {any[]} badgeDefs @param {(data: any, defs: any[], o: any) => string[]} evaluate
 * @param {{today: string, now?: Date, xpPerBadge?: number}} o
 * @returns {string[]} new badge ids
 */
export function awardBadges(d, badgeDefs, evaluate, { today, now = new Date(), xpPerBadge = 15 }) {
  const ids = evaluate(d, badgeDefs || [], { today });
  for (const id of ids) d.state.badges = { ...(d.state.badges || {}), [id]: now.toISOString() };
  d.state.xp = (d.state.xp || 0) + ids.length * xpPerBadge;
  return ids;
}

/** Greeting by local hour. @param {Date} [now] */
export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Hallo';
  if (h < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

/** German month title "Oktober 2026" for "YYYY-MM". */
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export function monthTitle(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!Number.isFinite(y) || !(m >= 1 && m <= 12)) return '–';
  return `${MONTHS[m - 1]} ${y}`;
}
/** Shift "YYYY-MM" by n months. */
export function shiftMonth(ym, n) {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "Sa., 31.10." short date. */
export function shortDate(iso) {
  const WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  if (!iso) return '–';
  const d = parseISODate(String(iso));
  if (Number.isNaN(d.getTime())) return '–';
  return `${WD[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/**
 * Seconds → value/unit pair for stat tiles, consistent with fmtDuration():
 * < 1 min „45 s“, < 1 h „21 min“, ≥ 1 h „1 h 05 min“ (value „1 h 05“, unit „min“).
 */
export function humanSeconds(sec) {
  const n = Number(sec);
  const s = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  if (s < 60) return { value: String(s), unit: 's' };
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return { value: String(totalMin), unit: 'min' };
  return { value: `${Math.floor(totalMin / 60)} h ${String(totalMin % 60).padStart(2, '0')}`, unit: 'min' };
}

/**
 * Duration text used across the app: < 1 min „45 s“, < 1 h „21 min“, ≥ 1 h „1 h 05 min“; junk → „–“.
 * @param {number|null|undefined} sec @param {{seconds?: boolean}} [o] seconds=false → „< 1 min“ instead of „45 s“
 */
export function fmtDuration(sec, { seconds = true } = {}) {
  const n = Number(sec);
  if (sec == null || sec === '' || !Number.isFinite(n) || n < 0) return '–';
  const s = Math.round(n);
  if (s < 60) return seconds ? `${s} s` : (s ? '< 1 min' : '0 min');
  const h = humanSeconds(s);
  return `${h.value} ${h.unit}`;
}

/** Minutes → „21 min“ / „1 h 05 min“ (junk → „–“). */
export const fmtMinutes = (min) => (min == null || !Number.isFinite(Number(min)) ? '–' : fmtDuration(Number(min) * 60, { seconds: false }));

/**
 * Display guard for template interpolation: null/undefined/NaN/Infinity/'' and stringified junk
 * („NaN“, „undefined“, „null“, „Invalid Date“) render as „–“ (or `fallback`). Numbers are rounded to `digits`
 * and use the German decimal comma.
 * @param {unknown} v @param {{fallback?: string, digits?: number}} [o]
 */
export function show(v, { fallback = '–', digits } = {}) {
  if (v == null || v === '' || v === false) return fallback;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return fallback;
    return digits != null ? fmtNum(v, digits, { trim: true }) : String(v).replace('.', ',');
  }
  const s = String(v);
  if (/^(NaN|undefined|null|Infinity|-Infinity|Invalid Date|\[object \w+\])$/.test(s.trim())) return fallback;
  if (/NaN|undefined|Invalid Date/.test(s)) return fallback;
  return s;
}

/** Finite number or `fallback` (default null). */
export const num = (v, fallback = null) => {
  if (v == null || v === '' || typeof v === 'boolean') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** "YYYY-MM-DD" that is a real calendar day. */
export function isISODay(v) {
  if (typeof v !== 'string' || !ISO_DAY.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
/** Parsable timestamp string. */
export const isValidTs = (v) => (typeof v === 'string' || typeof v === 'number') && v !== '' && !Number.isNaN(new Date(v).getTime());

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const objs = (v) => arr(v).filter(isObj);

function safeCheck(c) {
  if (!isObj(c)) return null;
  const out = { ...c };
  for (const k of ['pain', 'swelling', 'stiffness', 'rpe']) if (k in out) out[k] = num(out[k]);
  return out;
}

function safeRowing(r) {
  if (!isObj(r)) return null;
  const out = {};
  for (const [k, v] of Object.entries(r)) { const n = num(v); if (n != null && n >= 0) out[k] = n; }
  return out;
}

function safeItems(v) { return objs(v).filter((it) => typeof it.exerciseId === 'string' && it.exerciseId); }

/** One session made safe for rendering (null when it cannot be placed in time). */
export function safeSession(s, i = 0) {
  if (!isObj(s) || !isValidTs(s.startedAt)) return null;
  const traffic = isObj(s.traffic) ? s.traffic : {};
  const LIGHTS = ['green', 'yellow', 'red', 'stop'];
  return {
    ...s,
    id: typeof s.id === 'string' && s.id ? s.id : `s-${i}`,
    workoutId: typeof s.workoutId === 'string' ? s.workoutId : '',
    status: ['active', 'done', 'aborted'].includes(s.status) ? s.status : 'aborted',
    endedAt: isValidTs(s.endedAt) ? s.endedAt : null,
    kind: ['strength', 'short', 'cardio', 'custom'].includes(s.kind) ? s.kind : undefined,
    pre: safeCheck(s.pre), post: safeCheck(s.post), nextDay: safeCheck(s.nextDay),
    exercises: objs(s.exercises).filter((e) => typeof e.exerciseId === 'string').map((e) => ({
      ...e,
      level: num(e.level, 0),
      painDuring: num(e.painDuring), rpe: num(e.rpe),
      sets: objs(e.sets).map((x) => ({ ...x, reps: num(x.reps), hold: num(x.hold), seconds: num(x.seconds) })),
    })),
    traffic: {
      provisional: LIGHTS.includes(traffic.provisional) ? traffic.provisional : null,
      final: LIGHTS.includes(traffic.final) ? traffic.final : null,
      reasons: arr(traffic.reasons).filter((r) => typeof r === 'string'),
    },
    recommendations: objs(s.recommendations).filter((r) => typeof r.action === 'string'),
    rowing: s.rowing == null ? s.rowing : safeRowing(s.rowing),
    warmupRowing: s.warmupRowing == null ? s.warmupRowing : safeRowing(s.warmupRowing),
    finisherRowing: s.finisherRowing == null ? s.finisherRowing : safeRowing(s.finisherRowing),
    xpEarned: num(s.xpEarned, 0),
  };
}

function safeCustom(c) {
  if (!isObj(c) || typeof c.id !== 'string' || !c.id) return null;
  return {
    ...c,
    name: typeof c.name === 'string' && c.name.trim() ? c.name : 'Eigenes Workout',
    warmup: safeItems(c.warmup), cooldown: safeItems(c.cooldown),
    blocks: objs(c.blocks).map((b) => ({ ...b, items: safeItems(b.items) })),
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : '',
    createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
  };
}

const safeCache = new WeakMap();
/**
 * Read-only, render-safe view of the store data: junk sessions (null, missing/invalid start date) are dropped,
 * arrays/objects/numbers that views and logic rely on are guaranteed, missing settings fall back to the defaults.
 * NEVER write the result back – mutate via store.update() as before. Memoised per data object.
 * @param {any} data
 */
export function safeData(data) {
  if (isObj(data) && safeCache.has(data)) return safeCache.get(data);
  const def = storeDefaults();
  const src = isObj(data) ? data : {};
  const s0 = isObj(src.settings) ? src.settings : {};
  const settings = { ...def.settings, ...s0 };
  for (const [k, v] of Object.entries(def.settings)) {
    if (v === null) continue;
    if (typeof v === 'number') settings[k] = num(s0[k], v);
    else if (typeof v === 'boolean') settings[k] = typeof s0[k] === 'boolean' ? s0[k] : v;
    else if (typeof v === 'string' && typeof s0[k] !== 'string') settings[k] = v;
    else if (Array.isArray(v) && !Array.isArray(s0[k])) settings[k] = v;
    else if (isObj(v) && !isObj(s0[k])) settings[k] = v;
  }
  settings.bands = objs(settings.bands).filter((b) => typeof b.id === 'string');
  if (!settings.bands.length) settings.bands = def.settings.bands;
  settings.bands = settings.bands.map((b) => ({ ...b, label: typeof b.label === 'string' ? b.label : b.id, color: typeof b.color === 'string' ? b.color : 'var(--muted)', kind: b.kind === 'loop' ? 'loop' : 'theraband' }));
  const pt = isObj(settings.painThresholds) ? settings.painThresholds : {};
  settings.painThresholds = Object.fromEntries(Object.entries(def.settings.painThresholds).map(([k, v]) => [k, num(pt[k], v)]));
  if (settings.weeklyGoal < 1 || settings.weeklyGoal > 14) settings.weeklyGoal = def.settings.weeklyGoal;
  if (settings.cardioGoalPerWeek < 0 || settings.cardioGoalPerWeek > 14) settings.cardioGoalPerWeek = def.settings.cardioGoalPerWeek;
  settings.surgeryDate = isISODay(s0.surgeryDate) ? s0.surgeryDate : null;
  if (!isISODay(settings.prehabStart)) settings.prehabStart = def.settings.prehabStart;
  if (!isISODay(settings.surgeryDateSuggested)) settings.surgeryDateSuggested = null;
  settings.lastBackupAt = isValidTs(s0.lastBackupAt) ? s0.lastBackupAt : null;
  settings.ownedEquipment = arr(s0.ownedEquipment).filter((x) => typeof x === 'string');
  settings.profile = { ...(isObj(s0.profile) ? s0.profile : {}), weightKg: num(isObj(s0.profile) ? s0.profile.weightKg : null) };
  settings.restDefault = num(s0.restDefault);

  const st0 = isObj(src.state) ? src.state : {};
  const state = { ...def.state, ...st0 };
  state.phaseId = typeof st0.phaseId === 'string' && st0.phaseId ? st0.phaseId : def.state.phaseId;
  state.nextWorkoutId = typeof st0.nextWorkoutId === 'string' && st0.nextWorkoutId ? st0.nextWorkoutId : def.state.nextWorkoutId;
  state.xp = Math.max(0, num(st0.xp, 0));
  state.badges = Object.fromEntries(Object.entries(isObj(st0.badges) ? st0.badges : {}).filter(([, v]) => isValidTs(v)));
  state.exerciseLevels = Object.fromEntries(Object.entries(isObj(st0.exerciseLevels) ? st0.exerciseLevels : {})
    .filter(([, v]) => Number.isInteger(v) && v >= 0));
  state.exitCriteriaDone = isObj(st0.exitCriteriaDone) ? st0.exitCriteriaDone : {};
  state.exerciseToggles = isObj(st0.exerciseToggles) ? st0.exerciseToggles : {};
  state.records = isObj(st0.records) ? st0.records : def.state.records;
  state.phaseHistory = objs(st0.phaseHistory);
  state.customWorkouts = arr(st0.customWorkouts).map(safeCustom).filter(Boolean);
  state.activeSession = st0.activeSession ? safeSession(st0.activeSession) : null;
  if (state.activeSession && state.activeSession.status !== 'active') state.activeSession = { ...state.activeSession, status: 'active' };
  state.postOpClearance = isObj(st0.postOpClearance) ? st0.postOpClearance : null;
  state.postOpEndClearance = isObj(st0.postOpEndClearance) ? st0.postOpEndClearance : null;

  const sessions = arr(src.sessions).map((x, i) => safeSession(x, i)).filter(Boolean);
  const out = { ...src, settings, state, sessions };
  if (isObj(data)) safeCache.set(data, out);
  return out;
}

/** Session duration in minutes (rounded) or null. */
export function sessionMinutes(s) {
  if (!s?.startedAt || !s?.endedAt) return null;
  const m = Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 60000);
  return Number.isFinite(m) && m > 0 ? m : null;
}

/* ------------------------------------------------------------------ */
/* Markup helpers                                                      */
/* ------------------------------------------------------------------ */

/** Traffic pill (symbol + text). */
export function trafficPill(light, { long = false, lg = false } = {}) {
  if (!light) return html`<span class="chip chip--sm chip--outline">offen</span>`;
  return html`<span class="traffic traffic--${light}${lg ? ' traffic--lg' : ''}">${long ? TRAFFIC_LONG[light] : TRAFFIC_SHORT[light]}</span>`;
}

/** Band chip. */
export function bandChip(settings, id, { sm = true } = {}) {
  const b = bandInfo(settings, id);
  if (!b) return '';
  return html`<span class="chip chip--band${sm ? ' chip--sm' : ''}" style="--band:${b.color}"><i class="chip__swatch"></i>${b.label}</span>`;
}

/** Page header with optional back link. */
export function pageHeader({ title, eyebrow = '', back = null, backLabel = 'Zurück', actions = '' }) {
  if (back) {
    return html`<header class="page-header page-header--back">
      <a class="btn btn--icon btn--outline" href="${back}" aria-label="${backLabel}">${raw(ICON.back)}</a>
      <div class="grow">${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}<h1 class="page-header__title pv-title-sm">${title}</h1></div>
      ${actions ? html`<div class="page-header__actions">${actions}</div>` : ''}
    </header>`;
  }
  return html`<header class="page-header">
    <div class="grow">${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}<h1 class="page-header__title">${title}</h1></div>
    ${actions ? html`<div class="page-header__actions">${actions}</div>` : ''}
  </header>`;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

/** Apply settings.fontScale (e.g. 1, 1.125, 1.25) to <html>. */
export function applyFontScale(settings) {
  if (typeof document === 'undefined') return;
  const f = Number(settings?.fontScale) || 1;
  document.documentElement.style.fontSize = f === 1 ? '' : `${Math.round(f * 100)}%`;
}

/** Show a toast. @param {string} text @param {{kind?: 'success'|'gold'|'accent', icon?: string, ms?: number}} [o] */
export function toast(text, { kind = 'success', icon = '✓', ms = 2600 } = {}) {
  if (typeof document === 'undefined') return;
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = String(html`<span class="toast__icon">${icon}</span><span class="toast__text">${text}</span>`);
  region.appendChild(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); }, ms);
}

/**
 * Promise-based confirm modal.
 * @param {{title: string, text?: string, confirm?: string, cancel?: string, danger?: boolean, icon?: string}} o
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, text = '', confirm = 'OK', cancel = 'Abbrechen', danger = false, icon = '' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal modal--center';
    dlg.innerHTML = String(html`
      ${icon ? html`<div class="pv-modal-icon${danger ? ' is-danger' : ''}" aria-hidden="true">${icon}</div>` : ''}
      <h2 class="modal__title">${title}</h2>
      ${text ? html`<p class="muted">${text}</p>` : ''}
      <div class="modal__actions">
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--block" value="ok" data-act="ok">${confirm}</button>
        <button class="btn btn--outline btn--block" data-act="cancel">${cancel}</button>
      </div>`);
    document.body.appendChild(dlg);
    let result = false;
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { result = b.dataset.act === 'ok'; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}

/**
 * Bottom sheet dialog. Returns the dialog; it removes itself on close.
 * @param {string|import('../render.js').SafeHtml} content
 * @param {{onClose?: () => void, label?: string}} [o]
 */
export function openSheet(content, { onClose, label = '' } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  if (label) dlg.setAttribute('aria-label', label);
  dlg.innerHTML = `<div class="sheet__handle"></div>${String(content)}`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  dlg.showModal();
  return dlg;
}

/* ------------------------------------------------------------------ */
/* View-only styles (tokens only), injected once                       */
/* ------------------------------------------------------------------ */

const VIEW_CSS = `
.pv-title-sm { font-size: var(--fs-2xl); }
.pv-greet { margin: var(--s-2) 0 var(--s-4); }
.pv-greet { align-items: center; }
.pv-greet__hello { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.035em; line-height: 1.05; margin: 0; }
.pv-hero-tags { display: flex; flex-wrap: wrap; gap: var(--s-2); margin: 0 0 var(--s-4); }
.pv-split-legend { display: flex; gap: var(--s-4); font-size: var(--fs-xs); color: var(--on-hero-muted); margin: calc(-1 * var(--s-2)) 0 var(--s-4); font-weight: var(--fw-semibold); }
.pv-split-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.pv-hero-alt { margin: var(--s-2) 0 calc(-1 * var(--s-2)); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0 var(--s-3); text-align: center; font-size: var(--fs-sm); }
.pv-hero-alt a { color: var(--on-hero); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(255,255,255,0.5); }
.pv-hero-alt__done { color: var(--on-hero-muted); }
.pv-hero-alt--note { color: var(--on-hero-muted); margin-bottom: 0; }
.pv-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #7FFFB0; box-shadow: 0 0 0 0 rgba(127,255,176,0.6); animation: pv-pulse 1.8s ease-out infinite; }
@keyframes pv-pulse { 0% { box-shadow: 0 0 0 0 rgba(127,255,176,0.55); } 80%, 100% { box-shadow: 0 0 0 8px rgba(127,255,176,0); } }
@media (prefers-reduced-motion: reduce) { .pv-live-dot { animation: none; } }
.pv-level-tap { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; text-decoration: none; }
.pv-level-tap .chip { pointer-events: none; }
.pv-op-ready { display: flex; align-items: center; gap: var(--s-3); min-height: 56px; margin-top: var(--s-3); padding-top: var(--s-3); border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); color: inherit; text-decoration: none; }
.pv-op-ready .ring { flex: none; }
.pv-op-ready__k { display: block; font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.pv-op-ready__v { display: block; font-weight: var(--fw-semibold); line-height: 1.3; }
.pv-op-ready__tip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: var(--fs-sm); color: var(--muted); line-height: 1.35; }
.pv-recs { padding: 0; }
.pv-recs > summary { list-style: none; display: flex; align-items: center; gap: var(--s-3); min-height: 64px; padding: var(--s-3) var(--s-4); cursor: pointer; }
.pv-recs > summary::-webkit-details-marker { display: none; }
.pv-recs__title { display: block; font-weight: var(--fw-bold); line-height: 1.3; }
.pv-recs__sub { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: var(--fs-sm); color: var(--muted); line-height: 1.35; }
.pv-recs[open] .pv-recs__sub { display: none; }
.pv-recs .grow { min-width: 0; }
.pv-recs__chev { flex: none; width: 24px; height: 24px; color: var(--muted); transition: transform var(--dur) var(--ease); }
.pv-recs__chev svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.pv-recs[open] .pv-recs__chev { transform: rotate(180deg); }
.pv-recs__list { display: flex; flex-direction: column; gap: var(--s-4); padding: 0 var(--s-4) var(--s-4); }
.pv-recs__list > .rec + .rec { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); padding-top: var(--s-4); }
.pv-icon-badge--sm { width: 40px; height: 40px; border-radius: 12px; font-size: 20px; }
.pv-icon-badge--sm svg { width: 20px; height: 20px; }
.pv-quickstart .card__header { align-items: flex-start; }
a.card.pv-xp-card { display: block; }
.pv-ring-empty { flex: none; width: 112px; height: 112px; border-radius: 50%; display: grid; place-items: center; border: 10px dashed var(--surface-2); color: var(--primary); }
.pv-ring-empty svg { width: 40px; height: 40px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.pv-mini { display: flex; flex-direction: row; align-items: center; gap: var(--s-3); min-height: 88px; }
a.card.pv-mini { display: flex; }
.pv-mini__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pv-mini .streak { gap: var(--s-2); }
.pv-mini .streak__flame { width: 40px; height: 46px; }
.pv-mini .streak__count { font-size: var(--fs-xl); }
.pv-mini .streak__label { font-size: var(--fs-xs); line-height: 1.3; }
.pv-mini__note { font-size: var(--fs-sm); color: var(--text); font-weight: var(--fw-semibold); line-height: 1.3; }
.pv-mini__note.is-gold { color: var(--gold-ink); }
a.card.pv-last, .pv-last { display: flex; align-items: center; gap: var(--s-3); }
.pv-welcome { border: 2px solid color-mix(in srgb, var(--primary) 30%, transparent); }
.pv-welcome__title { font-size: var(--fs-xl); margin: 0 0 var(--s-2); }
.pv-welcome__lead { color: var(--muted); margin: 0 0 var(--s-4); }
.pv-welcome__bands { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 var(--s-2); }
.pv-welcome__cta { margin-top: var(--s-5); }
.pv-welcome__sub { margin: var(--s-3) 0 0; text-align: center; color: var(--muted); font-size: var(--fs-sm); }
.pv-linkbtn { background: none; border: 0; padding: 4px 2px; font: inherit; color: var(--primary-ink); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.pv-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-4); }
.pv-steps > li { display: flex; gap: var(--s-3); align-items: flex-start; }
.pv-steps__num { flex: 0 0 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: var(--fw-bold); font-size: var(--fs-sm); background: var(--primary-soft); color: var(--primary-ink); }
.pv-steps__num svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.pv-steps > li.is-done .pv-steps__num { background: var(--green); color: var(--on-primary); }
.pv-steps__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.pv-steps__title { font-weight: var(--fw-semibold); }
.pv-steps__hint { color: var(--muted); font-size: var(--fs-sm); }
.pv-steps .btn-row { justify-content: flex-start; }
.pv-reminder { display: flex; gap: var(--s-3); align-items: center; padding: var(--s-3) var(--s-4); border-radius: var(--radius); background: var(--surface); border: 1px dashed var(--border); color: var(--muted); font-size: var(--fs-sm); margin-bottom: var(--s-4); }
.pv-reminder > span:first-child { font-size: 22px; }
a.card.pv-badge-row, .pv-badge-row { display: flex; align-items: center; gap: var(--s-4); }
.pv-badge-row .badge-tile__icon { width: 52px; height: 52px; font-size: 26px; flex: none; }
.pv-modal-icon { display: grid; place-items: center; width: 64px; height: 64px; margin: 0 auto var(--s-3); border-radius: 50%; background: var(--primary-soft); color: var(--primary-ink); font-size: 30px; }
.pv-modal-icon.is-danger { background: var(--red-soft); color: var(--red-ink); }
.pv-criteria { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.pv-crit { display: flex; gap: var(--s-3); align-items: flex-start; padding: var(--s-3); border-radius: var(--radius-sm); background: var(--surface-2); cursor: pointer; min-height: var(--tap); }
.pv-crit input { position: absolute; opacity: 0; pointer-events: none; }
.pv-crit__box { flex: none; width: 28px; height: 28px; border-radius: 8px; border: 2px solid var(--border); background: var(--surface); display: grid; place-items: center; color: transparent; transition: background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease); }
.pv-crit__box svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.pv-crit.is-ticked .pv-crit__box { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.pv-crit.is-auto .pv-crit__box { background: var(--green); border-color: var(--green); color: #fff; }
.pv-crit input:focus-visible + .pv-crit__box { box-shadow: var(--focus-ring); }
.pv-crit__text { flex: 1; min-width: 0; line-height: 1.35; }
.pv-crit__hint { display: block; font-size: var(--fs-xs); color: var(--muted); margin-top: 2px; }
.pv-crit.is-ticked .pv-crit__main, .pv-crit.is-auto .pv-crit__main { color: var(--muted); }
.pv-progress { height: 10px; border-radius: var(--radius-pill); background: var(--surface-2); overflow: hidden; }
.pv-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--grad-xp, var(--primary)); width: calc(var(--p, 0) * 100%); transition: width var(--dur-slow) var(--ease); }
.card--hero .pv-progress { background: rgba(255,255,255,0.2); }
.card--hero .pv-progress > span { background: #fff; }
.pv-phase-steps { display: flex; gap: var(--s-2); margin: var(--s-3) 0 var(--s-4); }
.pv-phase-steps > span { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.25); }
.pv-phase-steps > span.is-done { background: rgba(255,255,255,0.7); }
.pv-phase-steps > span.is-current { background: #fff; }
.pv-workout__head { display: flex; align-items: center; gap: var(--s-3); margin-bottom: var(--s-3); }
.pv-workout > summary { cursor: pointer; }
.disclosure-arrow { flex: none; width: 28px; height: 28px; display: grid; place-items: center; color: var(--muted); transition: transform var(--dur) var(--ease); }
.disclosure-arrow svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.pv-workout[open] .disclosure-arrow { transform: rotate(180deg); }
.pv-letter { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--primary-soft); color: var(--primary-ink); font-weight: var(--fw-black); font-size: var(--fs-xl); }
.pv-letter.is-next { background: var(--grad-hero); color: var(--on-hero); }
.pv-ex-row { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) 0; text-decoration: none; color: inherit; min-height: var(--tap); }
.pv-ex-row + .pv-ex-row { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.pv-ex-row__body { flex: 1; min-width: 0; }
.pv-ex-row__name { display: block; font-weight: var(--fw-semibold); line-height: 1.3; }
.pv-ex-row__meta { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: var(--fs-sm); color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
.pv-sec-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--block-neutral); }
.pv-sec-dot.is-knee { background: var(--block-knee); }
.pv-sec-dot.is-archery { background: var(--block-archery); }
.pv-sec-label { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: var(--s-3) 0 var(--s-1); display: flex; align-items: center; gap: var(--s-2); }
.pv-sec-label.is-knee { color: var(--primary-ink); }
.pv-sec-label.is-archery { color: var(--accent-ink); }
.pv-phase-list { display: flex; flex-direction: column; gap: var(--s-2); }
.pv-thumb { width: 64px; height: 64px; flex: none; border-radius: 14px; background: var(--surface-2); overflow: hidden; display: grid; place-items: center; }
.pv-thumb pt-figure { width: 100%; height: 100%; display: block; }
.exercise-card .pv-thumb { width: 72px; height: 72px; }
.pv-ex-list { display: flex; flex-direction: column; gap: var(--s-3); }
.pv-figure-stage { border-radius: var(--radius); background: var(--surface-2); overflow: hidden; margin-bottom: var(--s-4); position: relative; }
.pv-figure-stage pt-figure { display: block; width: 100%; }
.pv-figure-stage .chip-row { position: absolute; left: var(--s-3); top: var(--s-3); }
.pv-figure-stage:has(> .chip-row) { padding-top: 36px; }
.pv-ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.pv-ladder__item { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3); border-radius: var(--radius-sm); background: var(--surface-2); border: 2px solid transparent; }
.pv-ladder__item.is-current { background: var(--primary-soft); border-color: var(--primary); }
.pv-ladder__item.is-done { opacity: 0.75; }
.pv-ladder__num { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--surface); font-weight: var(--fw-black); font-variant-numeric: tabular-nums; color: var(--muted); }
.pv-ladder__item.is-current .pv-ladder__num { background: var(--primary); color: var(--on-primary); }
.pv-ladder__item.is-done .pv-ladder__num { background: var(--green-soft); color: var(--green-ink); }
.pv-ladder__body { flex: 1; min-width: 0; }
.pv-ladder__label { display: block; font-weight: var(--fw-bold); }
.pv-ladder__dose { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: var(--fs-sm); color: var(--muted); align-items: center; font-variant-numeric: tabular-nums; }
.pv-callout { display: flex; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--radius); background: var(--accent-soft); border-left: 4px solid var(--accent); margin-bottom: var(--s-4); }
.pv-callout--knee { background: var(--primary-soft); border-left-color: var(--primary); }
.pv-callout--warn { background: var(--yellow-soft); border-left-color: var(--yellow); }
.pv-callout--stop { background: var(--stop-soft); border-left-color: var(--stop); }
.pv-callout__icon { font-size: 20px; line-height: 1.3; flex: none; }
.pv-callout p { margin: 0; }
.pv-bullets { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--s-2); }
.pv-bullets--ok li::marker { content: "✓  "; color: var(--green); font-weight: 900; }
.pv-bullets--no li::marker { content: "✕  "; color: var(--red); font-weight: 900; }
.pv-link-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-3); }
.pv-link-card { display: flex; flex-direction: column; gap: 4px; padding: var(--s-3); border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); text-decoration: none; color: inherit; min-height: 72px; }
.pv-link-card__k { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); display: flex; align-items: center; gap: 4px; }
.pv-link-card__k svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.pv-link-card__n { font-weight: var(--fw-bold); line-height: 1.25; }
.pv-month-nav { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); margin-bottom: var(--s-3); }
.pv-month-nav h3 { margin: 0; font-size: var(--fs-lg); }
.pv-records { display: flex; flex-direction: column; gap: var(--s-4); }
.pv-record { display: flex; align-items: center; gap: var(--s-3); }
.pv-record__icon { flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--gold-soft); font-size: 20px; }
.pv-record__body { flex: 1; min-width: 0; }
.pv-record__val { font-weight: var(--fw-black); font-size: var(--fs-lg); font-variant-numeric: tabular-nums; }
.pv-sum-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-2); margin: var(--s-3) 0; }
.pv-sum-grid .stat { padding: var(--s-2) var(--s-3); box-shadow: none; background: var(--surface-2); border: 0; }
.pv-sum-grid .stat__value { font-size: var(--fs-xl); }
.pv-note { padding: var(--s-3); border-radius: var(--radius-sm); background: var(--surface-2); font-style: italic; }
.pv-band-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.pv-band { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3); border-radius: var(--radius-sm); background: var(--surface-2); }
.pv-band__swatch { flex: none; width: 34px; height: 14px; border-radius: 7px; background: var(--band); box-shadow: inset 0 0 0 1.5px rgba(0,0,0,0.15); }
.pv-band__rank { flex: none; width: 22px; font-weight: var(--fw-black); color: var(--muted); font-variant-numeric: tabular-nums; text-align: center; }
.pv-band__name { flex: 1; min-width: 0; font-weight: var(--fw-semibold); }
.pv-band .btn--icon { width: 44px; min-height: 44px; }
.pv-band-scale { display: flex; height: 10px; border-radius: 5px; overflow: hidden; margin-top: var(--s-2); }
.pv-band-scale > span { flex: 1; background: var(--band); }
.pv-setting-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: var(--tap); padding: var(--s-2) 0; }
.pv-setting-row + .pv-setting-row, .pv-setting-row + .switch-row, .switch-row + .pv-setting-row { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.pv-setting-row__label { font-weight: var(--fw-semibold); }
.pv-setting-row__hint { display: block; font-size: var(--fs-xs); color: var(--muted); font-weight: 400; }
.pv-tap-left { padding-left: 0; justify-content: flex-start; }
.pv-tap-inline { min-height: 44px; padding: 0 2px; margin-block: -12px; vertical-align: baseline; }
.is-highlight { animation: pv-highlight 2.4s var(--ease) both; }
@keyframes pv-highlight { 0%, 60% { box-shadow: 0 0 0 3px var(--primary), var(--shadow-1); } 100% { box-shadow: var(--shadow-1); } }
@media (prefers-reduced-motion: reduce) { .pv-tap-left { padding-left: 0; justify-content: flex-start; }
.pv-tap-inline { min-height: 44px; padding: 0 2px; margin-block: -12px; vertical-align: baseline; }
.is-highlight { animation: none; box-shadow: 0 0 0 3px var(--primary); } }
.pv-version { text-align: center; color: var(--muted); font-size: var(--fs-xs); margin: var(--s-6) 0 var(--s-2); }
.pv-eq { display: flex; flex-direction: column; gap: var(--s-2); }
.pv-eq__head { display: flex; gap: var(--s-3); align-items: flex-start; }
.pv-eq__check { flex: none; width: 32px; height: 32px; border-radius: 10px; border: 2px solid var(--border); display: grid; place-items: center; color: transparent; background: var(--surface); margin-top: 2px; }
.pv-eq__check svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.pv-eq.is-owned .pv-eq__check { background: var(--green); border-color: var(--green); color: #fff; }
.pv-eq.is-owned .card__title { color: var(--muted); }
.pv-eq__price { flex: none; font-weight: var(--fw-black); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pv-eq__price small { display: block; font-size: var(--fs-xs); color: var(--muted); font-weight: var(--fw-semibold); text-align: right; white-space: normal; max-width: 14ch; }
.pv-eq .chip { white-space: normal; max-width: 100%; }
.pv-eq__why { color: var(--text); font-size: var(--fs-sm); margin: 0; }
.pv-budget { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-2); margin-top: var(--s-3); }
.pv-budget > div { background: rgba(255,255,255,0.14); border-radius: var(--radius-sm); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3); min-width: 0; }
.pv-budget__v { display: block; font-weight: var(--fw-black); font-size: var(--fs-md); white-space: nowrap; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.pv-budget__k { font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--on-hero-muted); }
.pv-taper { margin-top: var(--s-3); }
.pv-quote-wrap .quote { margin-bottom: var(--s-4); }
.pv-empty-sm { color: var(--muted); font-size: var(--fs-sm); text-align: center; padding: var(--s-4) 0; }
.pv-sticky-filter { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: var(--s-2) 0 var(--s-2); margin: 0 0 var(--s-2); }
.pv-count { font-size: var(--fs-sm); color: var(--muted); margin: var(--s-2) 0 var(--s-3); }
.pv-session-item { cursor: pointer; }
.pv-target { display: flex; justify-content: center; }
.pv-target .target-face { width: min(64vw, 240px); }
.pv-lights { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.pv-reasons { margin: var(--s-2) 0 0; padding-left: 1.2em; font-size: var(--fs-sm); color: var(--muted); }
.pv-ex-sum { list-style: none; margin: 0; padding: 0; }
.pv-ex-sum li { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2) 0; font-size: var(--fs-sm); }
.pv-ex-sum li + li { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.pv-ex-sum__name { flex: 1; min-width: 0; }
.pv-ex-sum__val { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ---- v2: Heute cards ---- */
.pv-sched { display: flex; gap: var(--s-2); align-items: flex-start; margin-top: var(--s-3); padding-top: var(--s-3); border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); font-size: var(--fs-sm); color: var(--muted); }
.pv-sched .chip { flex: none; }
.pv-sched__text { min-width: 0; line-height: 1.4; }
.pv-icon-badge { flex: none; width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-size: 22px; background: var(--surface-2); color: var(--text); }
.pv-icon-badge svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.pv-icon-badge--primary { background: var(--primary-soft); color: var(--primary-ink); }
.pv-icon-badge--accent { background: var(--accent-soft); color: var(--accent-ink); }
.pv-icon-badge--gold { background: var(--gold-soft); color: var(--gold-ink); }
.pv-icon-badge--green { background: var(--green-soft); color: var(--green-ink); }
.pv-quick { display: flex; align-items: center; gap: var(--s-3); }
.pv-quick__title { font-size: var(--fs-md); font-weight: var(--fw-bold); margin: 2px 0 2px; line-height: 1.25; }
.pv-quick__sub { margin: 0; font-size: var(--fs-sm); color: var(--muted); line-height: 1.35; }
.pv-quick .btn { flex: none; }
.pv-quick .btn svg, .pv-start .btn svg { width: 14px; height: 14px; }
.pv-row-card__head, .pv-postop-card__head { display: flex; align-items: center; gap: var(--s-3); }
.pv-row-card__head .ring, .pv-postop-card__head .ring { flex: none; }
.pv-start-list { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: flex; flex-direction: column; }
.pv-start { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) 0; min-height: var(--tap); }
.pv-start + .pv-start { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.pv-start__body { flex: 1; min-width: 0; }
.pv-start__name { display: block; font-weight: var(--fw-semibold); line-height: 1.3; }
.pv-start__meta { display: block; font-size: var(--fs-sm); color: var(--muted); font-variant-numeric: tabular-nums; }
a.card.pv-report, .pv-report { display: flex; align-items: center; gap: var(--s-3); }
.pv-report .eyebrow { display: block; margin: 0; }
.pv-ready .ring { flex: none; }
.pv-ready__tip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pv-postop { }
.pv-postop__lead { color: var(--on-hero-muted); margin: 0 0 var(--s-3); }
.pv-postop-card { border: 2px solid color-mix(in srgb, var(--primary) 28%, transparent); }
.pv-postop-card .card__title { margin: 0; }
.pv-clear-check { margin-top: var(--s-3); padding: var(--s-3); border-radius: var(--radius-sm); background: var(--surface-2); font-weight: var(--fw-semibold); }
.pv-hero-hint { font-size: var(--fs-sm); color: var(--on-hero-muted); margin: 0 0 var(--s-3); }
.pv-more { margin-top: var(--s-2); }
.pv-more .quote { margin-bottom: var(--s-3); }
.pv-more .card { margin-bottom: var(--s-3); }
.pv-sec-label__link { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: var(--fw-semibold); }
/* ---- v2: Plan ---- */
.pv-phase-row { display: flex; align-items: center; gap: var(--s-3); }
.pv-phase-row__dates { font-variant-numeric: tabular-nums; }
.pv-subhead { font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--muted); margin: var(--s-4) 0 var(--s-1); text-transform: uppercase; letter-spacing: .08em; }
.pv-lock { display: flex; gap: var(--s-3); align-items: flex-start; }
.pv-lock svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; color: var(--muted); margin-top: 2px; }
.pv-toggle-row { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) 0; min-height: var(--tap); }
.pv-toggle-row + .pv-toggle-row { border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.pv-toggle-row__body { flex: 1; min-width: 0; }
.pv-toggle-row__name { display: block; font-weight: var(--fw-semibold); line-height: 1.3; }
.pv-toggle-row__meta { display: block; font-size: var(--fs-xs); color: var(--muted); }
.pv-toggle-row.is-off .pv-toggle-row__name { color: var(--muted); text-decoration: line-through; text-decoration-thickness: 1px; }
.pv-ex-row.is-off { opacity: 0.55; }
/* ---- v5: Meine Ausrüstung ---- */
.pv-eq-icon { flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 22px; background: var(--surface-2); }
.pv-eq-toggles .pv-toggle-row.is-off .pv-toggle-row__name { color: var(--text); text-decoration: none; }
.pv-eq-toggles .pv-toggle-row.is-off .pv-eq-icon { filter: grayscale(1); opacity: 0.7; }
.pv-eq__why--short { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.pv-eq-change p { overflow-wrap: anywhere; }
.pv-eq-banner { position: relative; }
.pv-eq-banner a.banner__body { color: inherit; text-decoration: none; }
.pv-eq-banner__x { flex: none; min-width: var(--tap); }
a.pv-row-hint { color: inherit; text-decoration: none; }
.pv-needs .chip { white-space: normal; }
.pv-need--missing { color: var(--muted); border-style: dashed; }
/* ---- v2: Profil ---- */
.pv-input-unit { position: relative; display: block; }
.pv-input-unit .input { padding-right: 44px; width: 100%; }
.pv-input-unit > span { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: var(--fs-sm); pointer-events: none; }
.pv-preview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); margin-top: var(--s-3); }
.pv-preview > div { background: var(--surface-2); border-radius: var(--radius-sm); padding: var(--s-2) var(--s-3); min-width: 0; }
.pv-preview dt { font-size: var(--fs-xs); color: var(--muted); font-weight: var(--fw-semibold); }
.pv-preview dd { margin: 0; font-weight: var(--fw-black); font-size: var(--fs-lg); font-variant-numeric: tabular-nums; }
.pv-preview dd small { font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--muted); }
.field__error { display: block; color: var(--red-ink, var(--red)); font-size: var(--fs-xs); font-weight: var(--fw-semibold); margin-top: 4px; }
.field__error:empty { display: none; }
.input.is-invalid { border-color: var(--red); }
`;

export function ensureViewStyles() {
  if (typeof document === 'undefined' || document.getElementById('pv-styles')) return;
  const st = document.createElement('style');
  st.id = 'pv-styles';
  st.textContent = VIEW_CSS;
  document.head.appendChild(st);
}

/**
 * Static single-pose thumbnail markup for an exercise (uses only the <pt-figure> contract
 * attributes: poses, props, band, mirror, static). Shows the "working" (last) keyframe.
 */
export function figureThumb(ex) {
  const f = ex?.figure;
  if (!f?.poses?.length) return html`<span aria-hidden="true">🏋️</span>`;
  const pose = f.poses[f.poses.length - 1];
  return html`<pt-figure static poses="${JSON.stringify([pose])}" props="${JSON.stringify(f.props || [])}" ${f.band ? html`band="${JSON.stringify(f.band)}"` : ''} ${f.mirror ? 'mirror' : ''} aria-label="${ex.name}"></pt-figure>`;
}
