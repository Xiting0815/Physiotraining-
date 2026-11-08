// Shared import logic (Samsung export, RENPHO screenshot OCR, CSV): number parsing, preview & apply. PURE.
// Contract: docs/SPEC.md §13.3. Never touches storage – callers do `store.update(d => { d.state = applyImport(d.state, …).state })`.
import { HEALTH_FIELDS, validateEntry, roundField, entryFor, upsertEntry } from '../logic/health.js';
import { XP } from '../logic/motivation.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const FIELDS = Object.keys(HEALTH_FIELDS);

/**
 * Parse a locale number: "102,10" → 102.1, "1.234,5" → 1234.5, "1,234.5" → 1234.5, " 25,3 % " → 25.3,
 * "−1,2" → -1.2. With both separators the last one is the decimal mark; one kind used several times = thousands.
 * `{integer: true}`: a single separator followed by exactly 3 digits is a thousands mark ("8.214" → 8214).
 * @param {unknown} v @param {{integer?: boolean}} [opts]
 * @returns {number|null} null when empty / not a number
 */
export function normalizeNumber(v, { integer = false } = {}) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).replace(/[−–]/g, '-').replace(/[\s  ']/g, '');
  const m = s.match(/-?[\d.,]*\d/);
  if (!m) return null;
  s = m[0];
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (sep) {
      const parts = s.split(sep);
      if (parts.length > 2 || (integer && parts.length === 2 && parts[1].length === 3)) s = parts.join('');
      else s = parts.join('.');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const time = (iso) => (iso ? Date.parse(iso) : NaN);
const same = (k, a, b) => (k === 'note' ? a === b : isNum(a) && isNum(b) && roundField(k, a) === roundField(k, b));

/** Status of one incoming field vs. the existing entry (merge semantics, see §13.3). */
function fieldStatus(k, cur, inc) {
  const old = cur?.[k];
  if (old == null || old === '') return 'new';
  if (same(k, old, inc[k])) return 'same';
  const tNew = time(inc.measuredAt);
  const tOld = time(cur.measuredAt);
  return Number.isFinite(tNew) && Number.isFinite(tOld) && tNew > tOld ? 'changed' : 'conflict';
}

/** Validate incoming entries; returns valid ones and the invalid list. */
function clean(incoming) {
  const valid = [];
  const invalid = [];
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const v = validateEntry(raw);
    if (v.ok) valid.push(v.entry);
    else invalid.push({ date: raw?.date ?? null, errors: v.errors });
  }
  return { valid, invalid };
}

/**
 * Preview of an import (nothing is changed).
 * @param {{healthLog?: import('../types.js').HealthEntry[]}} state data.state
 * @param {import('../types.js').HealthEntry[]} incomingEntries
 * @returns {{rows: import('../types.js').ImportPreviewRow[], counts: {new: number, changed: number, same: number, conflict: number,
 *   days: number, newDays: number, invalid: number}, invalid: {date: string|null, errors: Record<string, string>}[]}}
 */
export function previewImport(state, incomingEntries) {
  const log = state?.healthLog || [];
  const { valid, invalid } = clean(incomingEntries);
  const rows = [];
  const counts = { new: 0, changed: 0, same: 0, conflict: 0, days: 0, newDays: 0, invalid: invalid.length };
  const dates = new Set();
  for (const inc of valid.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const cur = entryFor(log, inc.date);
    if (!dates.has(inc.date)) { dates.add(inc.date); if (!cur) counts.newDays += 1; }
    for (const k of [...FIELDS, 'note']) {
      if (inc[k] == null) continue;
      const status = fieldStatus(k, cur, inc);
      counts[status] += 1;
      rows.push({ date: inc.date, field: k, old: cur?.[k] ?? null, new: inc[k], status });
    }
  }
  counts.days = dates.size;
  return { rows, counts, invalid };
}

/**
 * Apply an import to `state.healthLog` (returns a NEW state object; input untouched).
 * merge (default): empty fields are filled; a differing value is replaced only when the incoming entry's
 *   `measuredAt` is newer than the existing entry's `measuredAt` (entries without measuredAt – e.g. manual – win).
 * overwrite: every incoming field replaces the existing value (fields not in the import are kept).
 * XP: only the normal daily rule – +XP.healthLog (5) if `today` is given and an entry for `today` is newly created.
 * @param {any} state data.state
 * @param {import('../types.js').HealthEntry[]} incomingEntries
 * @param {{mode?: 'merge'|'overwrite', today?: string}} [opts]
 * @returns {{state: any, added: number, updated: number, skipped: number, xp: number}}
 */
export function applyImport(state, incomingEntries, { mode = 'merge', today } = {}) {
  let log = (state?.healthLog || []).slice();
  const { valid, invalid } = clean(incomingEntries);
  let added = 0, updated = 0, skipped = invalid.length, xp = 0;
  const hadToday = today ? !!entryFor(log, today) : true;
  const touched = new Set();
  for (const inc of valid) {
    const cur = entryFor(log, inc.date);
    if (!cur) {
      log = upsertEntry(log, inc);
      added += 1;
      touched.add(inc.date);
      continue;
    }
    const patch = {};
    const src = {};
    let newer = false;
    for (const k of [...FIELDS, 'note']) {
      if (inc[k] == null) continue;
      const st = fieldStatus(k, cur, inc);
      if (st === 'new' || st === 'changed' || (st === 'conflict' && mode === 'overwrite')) {
        patch[k] = inc[k];
        if (k !== 'note') src[k] = inc.sources?.[k] ?? null; // null drops a stale source of the old value
        if (st !== 'new') newer = true;
      }
    }
    if (!Object.keys(patch).length) { skipped += 1; continue; }
    if (Object.keys(src).length) patch.sources = src;
    if (newer && inc.measuredAt) patch.measuredAt = inc.measuredAt;
    else if (inc.measuredAt && cur.measuredAt && time(inc.measuredAt) > time(cur.measuredAt)) patch.measuredAt = inc.measuredAt;
    log = upsertEntry(log, { ...patch, date: inc.date });
    if (!touched.has(inc.date)) updated += 1;
    touched.add(inc.date);
  }
  const next = { ...(state || {}), healthLog: log };
  if (today && !hadToday && entryFor(log, today)) { xp = XP.healthLog; next.xp = (state?.xp || 0) + xp; }
  return { state: next, added, updated, skipped, xp };
}
