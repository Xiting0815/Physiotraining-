// Samsung Health „Persönliche Daten herunterladen“ export → daily HealthEntry[] (source "samsung-export").
// Input: the export ZIP or a single CSV. See docs/SPEC.md §13.5 for the format notes and their uncertainty.
//
// Format (observed in real exports 2020–2026, Samsung Health 6.x):
// - one CSV per data type: com.samsung.health.weight.<ts>.csv, com.samsung.shealth.step_daily_trend.<ts>.csv,
//   com.samsung.shealth.sleep.<ts>.csv, com.samsung.shealth.tracker.heart_rate.<ts>.csv,
//   com.samsung.shealth.activity.day_summary.<ts>.csv, com.samsung.shealth.exercise.<ts>.csv (+ jsons/, files/).
// - line 1 = metadata "com.samsung.health.weight,6311013,12", line 2 = header, data rows usually end with ",".
// - some headers are namespaced ("com.samsung.health.sleep.start_time") → we strip everything up to the last ".".
// - start_time/end_time are UTC "YYYY-MM-DD HH:MM:SS.mmm", time_offset "UTC+0100" gives the local offset.
// - day_time (daily files) = local day as epoch ms at 00:00 UTC (or "YYYY-MM-DD 00:00:00.000").
// - values synced from other apps (e.g. RENPHO via Health Connect) land in the same files (pkg_name differs).
import { HEALTH_FIELDS, roundField } from '../logic/health.js';
import { normalizeNumber } from './common.js';
import { isZip, listEntries, readText } from './zip.js';

export const SAMSUNG_SOURCE = 'samsung-export';

/** Column (after prefix stripping) → HealthEntry field for weight / body-composition files. */
export const WEIGHT_COLUMNS = {
  weight: 'weightKg',
  bmi: 'bmi',
  body_fat: 'bodyFatPct',
  body_fat_mass: 'bodyFatKg',
  skeletal_muscle: 'skeletalMusclePct',
  skeletal_muscle_mass: 'skeletalMuscleKg',
  muscle_mass: 'muscleKg',
  fat_free_mass: 'fatFreeKg',
  basal_metabolic_rate: 'bmrKcal',
  total_body_water: 'waterKg',
  vfa_level: 'visceralFat',
  // not seen in real exports so far – accepted if a future version / connected app provides them:
  visceral_fat_level: 'visceralFat',
  visceral_fat: 'visceralFat',
  bone_mass: 'boneKg',
  metabolic_age: 'metabolicAge',
  body_water: 'waterPct',
  subcutaneous_fat: 'subcutFatPct',
  protein: 'proteinPct',
};

const TYPE_RE = /com\.samsung\.s?health\.([a-z0-9_.]+?)\.\d{6,}\.csv$/i;
const META_RE = /^﻿?com\.samsung\.s?health\.([a-z0-9_.]+?)\s*,/i;
const KNOWN = ['weight', 'body_composition', 'step_daily_trend', 'sleep', 'tracker.heart_rate', 'heart_rate', 'activity.day_summary', 'exercise'];

/**
 * Data type of a Samsung CSV from its file name or first line ("weight", "step_daily_trend", "sleep",
 * "tracker.heart_rate", "activity.day_summary", "exercise", …) or null.
 */
export function samsungFileType(name, firstLine = '') {
  const base = String(name || '').split('/').pop();
  const m = base.match(TYPE_RE) || String(firstLine).match(META_RE);
  return m ? m[1].toLowerCase() : null;
}

/** RFC-4180-ish CSV → string[][] (quotes, "" escapes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** "com.samsung.health.weight.weight" → "weight". */
export const stripColumn = (h) => (/^com\.samsung\./i.test(h) ? h.slice(h.lastIndexOf('.') + 1) : h).trim().toLowerCase();

/**
 * Read one Samsung CSV into objects (metadata line skipped when present; namespaced headers stripped).
 * @returns {{type: string|null, columns: string[], rows: Record<string, string>[]}}
 */
export function readSamsungCsv(text, name = '') {
  const all = parseCsv(text);
  if (!all.length) return { type: samsungFileType(name), columns: [], rows: [] };
  const hasMeta = META_RE.test(all[0].join(','));
  const type = samsungFileType(name, hasMeta ? all[0].join(',') : '');
  const header = (hasMeta ? all[1] : all[0]) || [];
  const columns = header.map(stripColumn);
  const rows = [];
  for (const r of all.slice(hasMeta ? 2 : 1)) {
    const o = {};
    columns.forEach((c, i) => { if (c && (o[c] == null || o[c] === '') ) o[c] = r[i] ?? ''; });
    rows.push(o);
  }
  return { type, columns, rows };
}

/** "UTC+0100" / "UTC-03:30" / "+0200" → minutes, else null. */
export function offsetMinutes(s) {
  const m = String(s || '').match(/([+-])(\d{2}):?(\d{2})/);
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Samsung time string → epoch ms (UTC). Accepts "YYYY-MM-DD HH:MM:SS(.mmm)", ISO with offset, epoch ms. */
export function parseSamsungTime(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  if (/^\d{11,14}$/.test(t)) return Number(t);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +(String(m[7] || '0').padEnd(3, '0')));
  if (/^\d{4}-\d{2}-\d{2}T.*([+-]\d{2}:?\d{2}|Z)$/.test(t)) { const ms = Date.parse(t); return Number.isFinite(ms) ? ms : null; }
  return null;
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const localIsoDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Local calendar date of a UTC time + Samsung time_offset (fallback: the device's time zone).
 * ISO strings with their own offset keep their written date.
 */
export function localDate(timeStr, offset) {
  const t = String(timeStr ?? '').trim();
  const own = t.match(/^(\d{4}-\d{2}-\d{2})T.*[+-]\d{2}:?\d{2}$/);
  if (own) return own[1];
  const ms = parseSamsungTime(t);
  if (ms == null) return null;
  const off = offsetMinutes(offset);
  return off == null ? localIsoDate(ms) : iso(ms + off * 60000);
}

/** Daily files: day_time as epoch ms (UTC midnight of the local day) or a date string. */
export function dayTimeDate(v) {
  const t = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  if (/^\d{11,14}$/.test(t)) return iso(Number(t));
  return null;
}

const num = (v) => normalizeNumber(v);
const inRange = (k, n) => n != null && n >= HEALTH_FIELDS[k].min && n <= HEALTH_FIELDS[k].max;

/**
 * Aggregate already-read CSV texts (pure, synchronous – used by parseSamsungExport and the tests).
 * @param {{name: string, text: string}[]} files
 * @returns {{entries: import('../types.js').HealthEntry[], summary: {files: {name: string, type: string|null, rows: number, used: boolean}[],
 *   days: number, fields: string[], fieldCounts: Record<string, number>, range: {from: string, to: string}|null, apps: string[], heightCm: number|null},
 *   warnings: string[]}}
 */
export function parseSamsungTexts(files) {
  const days = new Map(); // date → {fields, at (ms), stepsAll, stepsAny, sleep[], hr[], ex[]}
  const day = (d) => { if (!days.has(d)) days.set(d, { f: {}, ft: {}, at: null, stepsAgg: null, stepsMax: null, stepsSummary: null, active: null, sleep: [], hr: null, ex: [] }); return days.get(d); };
  const touch = (o, ms) => { if (ms != null && (o.at == null || ms > o.at)) o.at = ms; };
  const warnings = [];
  const fileInfo = [];
  const apps = new Set();
  let height = null, heightAt = -Infinity;
  let outOfRange = 0;

  for (const file of files) {
    const { type, rows } = readSamsungCsv(file.text, file.name);
    const info = { name: file.name.split('/').pop(), type, rows: rows.length, used: false };
    fileInfo.push(info);
    if (!type || !KNOWN.includes(type)) continue;
    info.used = true;
    let bad = 0;
    const seen = new Set();
    for (const r of rows) {
      if (r.datauuid) { if (seen.has(r.datauuid)) continue; seen.add(r.datauuid); }
      if (r.pkg_name && r.pkg_name !== 'com.sec.android.app.shealth') apps.add(r.pkg_name);
      if (type === 'weight' || type === 'body_composition') {
        const ms = parseSamsungTime(r.start_time);
        const d = localDate(r.start_time, r.time_offset);
        if (!d || ms == null) { bad++; continue; }
        const o = day(d);
        for (const [col, k] of Object.entries(WEIGHT_COLUMNS)) {
          const n = num(r[col]);
          if (n == null) continue;
          if (!inRange(k, n)) { outOfRange++; continue; }
          if (o.ft[k] == null || ms >= o.ft[k]) { o.f[k] = n; o.ft[k] = ms; }
        }
        const h = num(r.height);
        if (h != null && h > 100 && h < 250 && ms > heightAt) { height = h; heightAt = ms; }
        touch(o, ms);
      } else if (type === 'step_daily_trend') {
        const d = dayTimeDate(r.day_time);
        const n = num(r.count);
        if (!d || n == null) { bad++; continue; }
        const o = day(d);
        // source_type -2 = Samsung's merged total of all devices; else take the max of the per-device rows
        if (r.source_type === '-2') o.stepsAgg = Math.max(o.stepsAgg ?? 0, n);
        else o.stepsMax = Math.max(o.stepsMax ?? 0, n);
        touch(o, parseSamsungTime(r.update_time));
      } else if (type === 'activity.day_summary') {
        const d = dayTimeDate(r.day_time);
        if (!d) { bad++; continue; }
        const o = day(d);
        const act = num(r.active_time);
        if (act != null) o.active = Math.max(o.active ?? 0, Math.round(act / 60000));
        const st = num(r.step_count);
        if (st != null) o.stepsSummary = Math.max(o.stepsSummary ?? 0, st);
      } else if (type === 'sleep') {
        const s = parseSamsungTime(r.start_time);
        const e = parseSamsungTime(r.end_time);
        const d = localDate(r.end_time, r.time_offset);
        if (s == null || e == null || !d || e <= s) { bad++; continue; }
        const o = day(d);
        o.sleep.push([s, e]);
        touch(o, e);
      } else if (type === 'tracker.heart_rate' || type === 'heart_rate') {
        const d = localDate(r.start_time, r.time_offset);
        const n = num(r.heart_rate);
        if (!d || n == null) { bad++; continue; }
        if (n < 30 || n > 140) continue;
        const o = day(d);
        o.hr = o.hr == null ? n : Math.min(o.hr, n);
        touch(o, parseSamsungTime(r.end_time) ?? parseSamsungTime(r.start_time));
      } else if (type === 'exercise') {
        const d = localDate(r.start_time, r.time_offset);
        const hr = num(r.mean_heart_rate);
        if (!d) { bad++; continue; }
        if (hr == null || hr < 40 || hr > 210) continue;
        day(d).ex.push([hr, Math.max(1, num(r.duration) ?? 1)]);
      }
    }
    if (bad) warnings.push(`${info.name}: ${bad} Zeile${bad === 1 ? '' : 'n'} ohne lesbares Datum übersprungen.`);
  }
  if (outOfRange) warnings.push(`${outOfRange} unplausible Körperwerte ignoriert.`);

  const entries = [];
  const fieldCounts = {};
  for (const [date, o] of [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const e = { date, source: SAMSUNG_SOURCE };
    Object.assign(e, o.f);
    const steps = o.stepsAgg ?? o.stepsMax ?? o.stepsSummary;
    if (steps != null && inRange('steps', steps)) e.steps = steps;
    if (o.active != null && inRange('activeMin', o.active)) e.activeMin = o.active;
    if (o.sleep.length) {
      const iv = o.sleep.sort((a, b) => a[0] - b[0]);
      let total = 0, [cs, ce] = iv[0];
      for (const [s, en] of iv.slice(1)) { if (s <= ce) ce = Math.max(ce, en); else { total += ce - cs; cs = s; ce = en; } }
      total += ce - cs;
      const h = Math.round((total / 3600000) * 100) / 100;
      if (inRange('sleepH', h)) e.sleepH = h;
    }
    if (o.hr != null) e.restingHr = o.hr;
    if (o.ex.length) {
      const w = o.ex.reduce((a, [, d]) => a + d, 0);
      e.avgTrainingHr = o.ex.reduce((a, [hr, d]) => a + hr * d, 0) / w;
    }
    const keys = Object.keys(HEALTH_FIELDS).filter((k) => typeof e[k] === 'number');
    if (!keys.length) continue;
    e.sources = {};
    for (const k of keys) { e[k] = roundField(k, e[k]); e.sources[k] = SAMSUNG_SOURCE; fieldCounts[k] = (fieldCounts[k] ?? 0) + 1; }
    if (o.at != null) e.measuredAt = new Date(o.at).toISOString();
    entries.push(e);
  }
  if (!fileInfo.some((f) => f.used)) warnings.push('Keine bekannten Samsung-Health-Dateien gefunden (Gewicht, Schritte, Schlaf, Puls).');
  const fields = Object.keys(HEALTH_FIELDS).filter((k) => fieldCounts[k]);
  return {
    entries,
    summary: { files: fileInfo, days: entries.length, fields, fieldCounts, range: entries.length ? { from: entries[0].date, to: entries.at(-1).date } : null, apps: [...apps].sort(), heightCm: height },
    warnings,
  };
}

/**
 * Parse a Samsung Health export (ZIP of the „Persönliche Daten herunterladen“ folder, or one CSV of it).
 * @param {Blob|File|ArrayBuffer|Uint8Array} fileOrBlob
 * @param {{name?: string}} [opts] file name for a single CSV given as ArrayBuffer (File.name is used otherwise)
 * @returns {Promise<ReturnType<typeof parseSamsungTexts>>}
 */
export async function parseSamsungExport(fileOrBlob, { name } = {}) {
  const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob]);
  const fname = name || /** @type {any} */ (fileOrBlob)?.name || 'export.csv';
  if (await isZip(blob)) {
    const entries = (await listEntries(blob)).filter((e) => !e.dir && /\.csv$/i.test(e.name) && KNOWN.includes(samsungFileType(e.name) ?? ''));
    const files = [];
    for (const e of entries) files.push({ name: e.name, text: await readText(e) });
    const res = parseSamsungTexts(files);
    if (!entries.length) res.warnings.unshift('Im ZIP wurden keine Samsung-Health-CSV-Dateien gefunden.');
    return res;
  }
  const text = (await blob.text()).replace(/^﻿/, '');
  return parseSamsungTexts([{ name: fname, text }]);
}
