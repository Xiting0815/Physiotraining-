// Daily health log (manual, RENPHO screenshot OCR, Samsung Health export). PURE. See docs/SPEC.md §12.7, §13.
import { addDays, startOfIsoWeek, daysBetween } from '../util/date.js';

/**
 * Numeric fields with plausible ranges (inclusive), German labels/units, UI group and decimals.
 * group: 'Körper' | 'Aktivität' | 'Herz & Schlaf'; comp: true = Körperzusammensetzung (BIA scale, collapsible in the form).
 * int: stored as whole number. Ranges are generous on purpose (BIA scales differ, e.g. RENPHO visceral fat index 1–59).
 */
export const HEALTH_FIELDS = {
  weightKg: { label: 'Gewicht', unit: 'kg', min: 30, max: 300, step: 0.1, group: 'Körper', digits: 1 },
  bmi: { label: 'BMI', unit: '', min: 10, max: 80, step: 0.1, group: 'Körper', digits: 1, comp: true },
  bodyFatPct: { label: 'Körperfett', unit: '%', min: 3, max: 70, step: 0.1, group: 'Körper', digits: 1 },
  bodyFatKg: { label: 'Fettmasse', unit: 'kg', min: 1, max: 200, step: 0.1, group: 'Körper', digits: 1, comp: true },
  subcutFatPct: { label: 'Unterhautfett', unit: '%', min: 1, max: 70, step: 0.1, group: 'Körper', digits: 1, comp: true },
  visceralFat: { label: 'Viszeralfett', unit: '', min: 1, max: 60, step: 0.1, group: 'Körper', digits: 1, comp: true },
  musclePct: { label: 'Muskelanteil', unit: '%', min: 10, max: 90, step: 0.1, group: 'Körper', digits: 1, comp: true },
  muscleKg: { label: 'Muskelmasse', unit: 'kg', min: 10, max: 150, step: 0.1, group: 'Körper', digits: 1, comp: true },
  skeletalMusclePct: { label: 'Skelettmuskel', unit: '%', min: 10, max: 80, step: 0.1, group: 'Körper', digits: 1, comp: true },
  skeletalMuscleKg: { label: 'Skelettmuskelmasse', unit: 'kg', min: 5, max: 100, step: 0.1, group: 'Körper', digits: 1, comp: true },
  bonePct: { label: 'Knochenanteil', unit: '%', min: 1, max: 20, step: 0.1, group: 'Körper', digits: 1, comp: true },
  boneKg: { label: 'Knochenmasse', unit: 'kg', min: 0.5, max: 10, step: 0.1, group: 'Körper', digits: 1, comp: true },
  fatFreeKg: { label: 'Fettfreie Masse', unit: 'kg', min: 20, max: 200, step: 0.1, group: 'Körper', digits: 1, comp: true },
  metabolicAge: { label: 'Stoffwechselalter', unit: 'J.', min: 10, max: 100, step: 1, group: 'Körper', int: true, comp: true },
  bmrKcal: { label: 'Grundumsatz (Waage)', unit: 'kcal', min: 800, max: 4000, step: 1, group: 'Körper', int: true, comp: true },
  waterPct: { label: 'Körperwasser', unit: '%', min: 20, max: 80, step: 0.1, group: 'Körper', digits: 1, comp: true },
  waterKg: { label: 'Wassermasse', unit: 'kg', min: 10, max: 150, step: 0.1, group: 'Körper', digits: 1, comp: true },
  proteinPct: { label: 'Protein', unit: '%', min: 5, max: 30, step: 0.1, group: 'Körper', digits: 1, comp: true },
  proteinKg: { label: 'Proteinmasse', unit: 'kg', min: 2, max: 40, step: 0.1, group: 'Körper', digits: 1, comp: true },
  waistCm: { label: 'Bauchumfang', unit: 'cm', min: 40, max: 200, step: 0.5, group: 'Körper', digits: 1 },
  steps: { label: 'Schritte', unit: '', min: 0, max: 100000, step: 1, group: 'Aktivität', int: true },
  activeMin: { label: 'Aktive Minuten', unit: 'min', min: 0, max: 1440, step: 1, group: 'Aktivität', int: true },
  restingHr: { label: 'Ruhepuls', unit: 'bpm', min: 30, max: 140, step: 1, group: 'Herz & Schlaf', int: true },
  avgTrainingHr: { label: 'Ø Trainingspuls', unit: 'bpm', min: 40, max: 210, step: 1, group: 'Herz & Schlaf', int: true },
  sleepH: { label: 'Schlaf', unit: 'h', min: 0, max: 16, step: 0.25, group: 'Herz & Schlaf', digits: 2 },
};
/** UI groups in order. */
export const HEALTH_GROUPS = ['Körper', 'Aktivität', 'Herz & Schlaf'];
/** Body-composition fields (scale values beyond weight/body fat), in HEALTH_FIELDS order. */
export const BODY_COMP_FIELDS = Object.keys(HEALTH_FIELDS).filter((k) => HEALTH_FIELDS[k].comp);
/** Legacy entry-level source (v2 manual entries). */
export const HEALTH_SOURCE = 'samsung-health-manual';
/** Allowed per-field sources (entry.sources[field]). */
export const FIELD_SOURCES = ['manual', 'renpho-ocr', 'samsung-export', 'csv'];
/** German badge labels for sources. */
export const SOURCE_LABELS = { manual: 'Manuell', 'renpho-ocr': 'RENPHO', 'samsung-export': 'Samsung', csv: 'CSV' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a number from a form/import value ("102,10" → 102.1); null when empty/invalid. */
const toNum = (raw) => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  const s = String(raw).trim().replace(/\s+/g, '').replace(',', '.');
  return s === '' ? null : Number(s);
};
/** Round a valid value of a field (int fields → whole number, else 2 decimals). */
export const roundField = (k, n) => (HEALTH_FIELDS[k]?.int ? Math.round(n) : Math.round(n * 100) / 100);

/**
 * Validate & clean one entry. Strings with comma decimals are accepted; empty → field dropped.
 * Optional `measuredAt` (ISO date-time) and `sources` ({field: 'manual'|'renpho-ocr'|'samsung-export'|'csv'},
 * only kept for fields present in the entry) are preserved when valid.
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
    const n = toNum(raw);
    if (n === null) continue;
    if (!Number.isFinite(n)) { errors[k] = 'Bitte eine Zahl eingeben.'; continue; }
    if (n < f.min || n > f.max) { errors[k] = `${f.label}: bitte zwischen ${String(f.min).replace('.', ',')} und ${String(f.max).replace('.', ',')}${f.unit ? ' ' + f.unit : ''}.`; continue; }
    entry[k] = roundField(k, n);
  }
  if (typeof input.note === 'string' && input.note.trim()) entry.note = input.note.trim().slice(0, 500);
  if (typeof input.measuredAt === 'string' && Number.isFinite(Date.parse(input.measuredAt))) entry.measuredAt = input.measuredAt;
  if (input.sources && typeof input.sources === 'object') {
    const src = {};
    for (const [k, v] of Object.entries(input.sources)) if (k in HEALTH_FIELDS && k in entry && FIELD_SOURCES.includes(v)) src[k] = v;
    if (Object.keys(src).length) entry.sources = src;
  }
  const hasValue = Object.keys(HEALTH_FIELDS).some((k) => k in entry) || entry.note;
  if (!hasValue && !Object.keys(errors).length) errors._ = 'Bitte mindestens einen Wert eintragen.';
  return { ok: Object.keys(errors).length === 0, entry: Object.keys(errors).length ? null : entry, errors };
}

/**
 * Sources for a manually saved entry: fields whose value is unchanged keep their previous source
 * (e.g. „RENPHO“), changed/new fields become 'manual'. Returns `undefined` when nothing but manual values
 * exist and the previous entry had no sources (keeps old entries unchanged).
 * @param {import('../types.js').HealthEntry|undefined} prev @param {Record<string, any>} entry validated entry
 */
export function manualSources(prev, entry) {
  const out = {};
  for (const k of Object.keys(HEALTH_FIELDS)) {
    if (typeof entry?.[k] !== 'number') continue;
    out[k] = prev && prev[k] === entry[k] && prev.sources?.[k] ? prev.sources[k] : 'manual';
  }
  return prev?.sources || Object.values(out).some((v) => v !== 'manual') ? out : undefined;
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
  if (base.sources || entry?.sources) merged.sources = { ...(base.sources || {}), ...(entry?.sources || {}) };
  for (const [k, v] of Object.entries(entry || {})) if (v === null) { delete merged[k]; if (merged.sources) delete merged.sources[k]; }
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
  for (const e of sorted(current)) {
    const inc = m.get(e.date) || {};
    const out = { ...inc, ...e };
    if (inc.sources || e.sources) {
      const src = {};
      for (const k of Object.keys(HEALTH_FIELDS)) {
        const v = typeof e[k] === 'number' ? e.sources?.[k] : inc.sources?.[k];
        if (v && typeof out[k] === 'number') src[k] = v;
      }
      if (Object.keys(src).length) out.sources = src; else delete out.sources;
    }
    m.set(e.date, out);
  }
  return sorted([...m.values()]);
}
