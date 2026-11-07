// Daily health log (manually copied from Samsung Health). PURE. See docs/SPEC.md §12.7.
import { addDays, startOfIsoWeek, daysBetween } from '../util/date.js';

/** Numeric fields with plausible ranges (inclusive) and German labels/units. */
export const HEALTH_FIELDS = {
  weightKg: { label: 'Gewicht', unit: 'kg', min: 30, max: 300, step: 0.1 },
  bodyFatPct: { label: 'Körperfett', unit: '%', min: 3, max: 70, step: 0.1 },
  waistCm: { label: 'Bauchumfang', unit: 'cm', min: 40, max: 200, step: 0.5 },
  steps: { label: 'Schritte', unit: '', min: 0, max: 100000, step: 1 },
  activeMin: { label: 'Aktive Minuten', unit: 'min', min: 0, max: 1440, step: 1 },
  restingHr: { label: 'Ruhepuls', unit: 'bpm', min: 30, max: 140, step: 1 },
  avgTrainingHr: { label: 'Ø Trainingspuls', unit: 'bpm', min: 40, max: 210, step: 1 },
  sleepH: { label: 'Schlaf', unit: 'h', min: 0, max: 16, step: 0.25 },
};
export const HEALTH_SOURCE = 'samsung-health-manual';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate & clean one entry. Strings with comma decimals are accepted; empty → field dropped.
 * @param {any} input
 * @returns {{ok: boolean, entry: import('../types.js').HealthEntry|null, errors: Record<string, string>}}
 */
export function validateEntry(input) {
  const errors = {};
  if (!input || typeof input.date !== 'string' || !DATE_RE.test(input.date)) {
    return { ok: false, entry: null, errors: { date: 'Bitte ein gültiges Datum wählen.' } };
  }
  const entry = /** @type {any} */ ({ date: input.date, source: input.source || HEALTH_SOURCE });
  for (const [k, f] of Object.entries(HEALTH_FIELDS)) {
    const raw = input[k];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) { errors[k] = 'Bitte eine Zahl eingeben.'; continue; }
    if (n < f.min || n > f.max) { errors[k] = `${f.label}: bitte zwischen ${f.min} und ${f.max}${f.unit ? ' ' + f.unit : ''}.`; continue; }
    entry[k] = k === 'steps' || k === 'activeMin' || k.endsWith('Hr') ? Math.round(n) : Math.round(n * 100) / 100;
  }
  if (typeof input.note === 'string' && input.note.trim()) entry.note = input.note.trim().slice(0, 500);
  const hasValue = Object.keys(HEALTH_FIELDS).some((k) => k in entry) || entry.note;
  if (!hasValue && !Object.keys(errors).length) errors._ = 'Bitte mindestens einen Wert eintragen.';
  return { ok: Object.keys(errors).length === 0, entry: Object.keys(errors).length ? null : entry, errors };
}

/** Sorted copy (oldest first). */
const sorted = (log) => (Array.isArray(log) ? log : []).filter((e) => e && DATE_RE.test(e.date)).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * Insert or merge an entry for its date (one entry per date). Fields of `entry` overwrite existing ones;
 * `null` explicitly removes a field. Returns a new sorted array (input untouched). Throws Error (German) if invalid.
 * @param {import('../types.js').HealthEntry[]} log
 * @param {Partial<import('../types.js').HealthEntry> & {date: string}} entry
 * @param {{replace?: boolean}} [opts] replace: drop existing fields of that date first
 */
export function upsertEntry(log, entry, { replace = false } = {}) {
  const list = sorted(log);
  const idx = list.findIndex((e) => e.date === entry?.date);
  const base = idx >= 0 && !replace ? { ...list[idx] } : {};
  const merged = { ...base, ...entry };
  for (const [k, v] of Object.entries(entry || {})) if (v === null) delete merged[k];
  const v = validateEntry(merged);
  if (!v.ok) throw new Error(Object.values(v.errors)[0]);
  if (idx >= 0) list[idx] = v.entry; else list.push(v.entry);
  return sorted(list);
}

/** Remove the entry of a date. */
export const removeEntry = (log, date) => sorted(log).filter((e) => e.date !== date);

/** Entry of a date or undefined. */
export const entryFor = (log, date) => sorted(log).find((e) => e.date === date);

/**
 * Latest value of a field (optionally on/before `today`).
 * @returns {{date: string, value: number}|null}
 */
export function latest(log, field, today) {
  const list = sorted(log).filter((e) => typeof e[field] === 'number' && (!today || e.date <= today));
  const e = list.at(-1);
  return e ? { date: e.date, value: e[field] } : null;
}

/**
 * Points `{x: date, y}` of a field within the last `days` days up to `today` (inclusive) – for charts.lineChart.
 */
export function series(log, field, days = 30, today) {
  const list = sorted(log);
  const t = today ?? list.at(-1)?.date;
  if (!t) return [];
  const from = addDays(t, -(Math.max(1, days) - 1));
  return list.filter((e) => e.date >= from && e.date <= t && typeof e[field] === 'number').map((e) => ({ x: e.date, y: e[field] }));
}

/**
 * Mean of a field over [from, to] (inclusive) or null.
 */
export function meanOf(log, field, from, to) {
  const ys = sorted(log).filter((e) => e.date >= from && e.date <= to && typeof e[field] === 'number').map((e) => e[field]);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
}

/**
 * Weekly averages per ISO week (Monday key), oldest first, for all numeric fields present.
 * @returns {{weekStart: string, n: number, avg: Record<string, number>}[]}
 */
export function weeklyAverages(log, { weeks = 12, today } = {}) {
  const list = sorted(log);
  const t = today ?? list.at(-1)?.date;
  if (!t) return [];
  const first = addDays(startOfIsoWeek(t), -7 * (Math.max(1, weeks) - 1));
  const out = [];
  for (let wk = first; wk <= t; wk = addDays(wk, 7)) {
    const end = addDays(wk, 6);
    const items = list.filter((e) => e.date >= wk && e.date <= end);
    const avg = {};
    for (const k of Object.keys(HEALTH_FIELDS)) {
      const ys = items.filter((e) => typeof e[k] === 'number').map((e) => e[k]);
      if (ys.length) avg[k] = Math.round((ys.reduce((a, b) => a + b, 0) / ys.length) * 100) / 100;
    }
    out.push({ weekStart: wk, n: items.length, avg });
  }
  return out;
}

/**
 * Consecutive days with a log entry ending today (or yesterday if today has none yet).
 */
export function logStreak(log, today) {
  const dates = new Set(sorted(log).map((e) => e.date));
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) { n += 1; d = addDays(d, -1); }
  return n;
}

/** Longest run of consecutive logged days ever. */
export function longestLogStreak(log) {
  const dates = [...new Set(sorted(log).map((e) => e.date))];
  let best = 0, cur = 0;
  for (let i = 0; i < dates.length; i++) {
    cur = i > 0 && daysBetween(dates[i - 1], dates[i]) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
  }
  return best;
}

/**
 * Merge two logs by date (import): fields of `incoming` fill gaps; on conflicting values the current wins.
 */
export function mergeLogs(current, incoming) {
  const m = new Map();
  for (const e of sorted(incoming)) m.set(e.date, { ...e });
  for (const e of sorted(current)) m.set(e.date, { ...(m.get(e.date) || {}), ...e });
  return sorted([...m.values()]);
}
