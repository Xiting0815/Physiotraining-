// Backup export/import. See docs/SPEC.md §6.8, §7.3, §7.6.
// Pure helpers (parse/validate/migrate/merge) are Node-testable; downloadBackup/readBackupFile
// touch the DOM / store only when called.
import { exportData, get, importData, migrate as storeMigrate, migrations as storeMigrations, SCHEMA_VERSION } from '../store.js';
import { todayISO } from './date.js';
import { mergeCustomWorkouts } from '../logic/custom-workouts.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/** @param {string} [today] */
export function backupFilename(today = todayISO()) {
  return `physio-backup-${today}.json`;
}

/**
 * Parse a backup (JSON string or object). Throws Error with German message.
 * @param {string|object} input
 * @returns {any}
 */
export function parseBackup(input) {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
}

/**
 * Validate backup shape. Missing `schemaVersion` is treated as version 1.
 * @param {any} obj
 * @param {{target?: number}} [opts]
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateBackup(obj, { target = SCHEMA_VERSION } = {}) {
  const errors = [];
  if (!isObj(obj)) return { ok: false, errors: ['Die Datei ist keine gültige Physio-Sicherung.'] };
  if (!isObj(obj.settings)) errors.push('Einstellungen fehlen.');
  else {
    // v5.1 type checks (P1-7). Wrong scalar types (numbers, dates, enums) are repaired later by store.sanitize;
    // wrong container types are rejected because they mean the file is not a Physio backup.
    const st = obj.settings;
    if ('bands' in st && !Array.isArray(st.bands)) errors.push('Einstellungen: Bänder sind ungültig.');
    if ('ownedEquipment' in st && !Array.isArray(st.ownedEquipment)) errors.push('Einstellungen: Ausrüstung ist ungültig.');
    if ('painThresholds' in st && !isObj(st.painThresholds)) errors.push('Einstellungen: Schmerzgrenzen sind ungültig.');
    if ('profile' in st && st.profile !== null && !isObj(st.profile)) errors.push('Einstellungen: Profil ist ungültig.');
  }
  if (!isObj(obj.state)) errors.push('Trainingsstand fehlt.');
  else {
    const s = obj.state;
    if ('customWorkouts' in s && !Array.isArray(s.customWorkouts)) errors.push('Eigene Workouts sind ungültig.');
    if ('activeSession' in s && s.activeSession !== null && !isObj(s.activeSession)) errors.push('Laufendes Training ist ungültig.');
    for (const k of ['exerciseLevels', 'exitCriteriaDone', 'badges', 'records']) {
      if (k in s && s[k] !== null && !isObj(s[k])) if (!errors.includes('Trainingsstand ist beschädigt.')) errors.push('Trainingsstand ist beschädigt.');
    }
    if ('xp' in s && s.xp !== null && typeof s.xp !== 'number' && typeof s.xp !== 'string') errors.push('Trainingsstand ist beschädigt.');
  }
  if (!Array.isArray(obj.sessions)) errors.push('Trainingsverlauf fehlt.');
  else {
    const ids = new Set();
    const dateish = (v) => typeof v === 'string' && v.length >= 10 && Number.isFinite(Date.parse(v));
    obj.sessions.forEach((s, i) => {
      if (!isObj(s) || typeof s.id !== 'string' || !s.id) errors.push(`Einheit ${i + 1} hat keine gültige ID.`);
      else if (ids.has(s.id)) errors.push(`Einheit ${s.id} ist doppelt vorhanden.`);
      else {
        ids.add(s.id);
        if (!dateish(s.startedAt) && !dateish(s.endedAt) && !dateish(s.date)) errors.push(`Einheit ${i + 1} hat kein gültiges Datum.`);
        if ('exercises' in s && s.exercises != null && !Array.isArray(s.exercises)) errors.push(`Einheit ${i + 1} ist beschädigt.`);
      }
    });
  }
  if (obj.schemaVersion !== undefined) {
    if (!Number.isInteger(obj.schemaVersion) || obj.schemaVersion < 1) errors.push('Unbekannte Datenversion.');
    else if (obj.schemaVersion > target) errors.push('Die Sicherung stammt aus einer neueren App-Version.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Run schema migrations up to `target` (default store.SCHEMA_VERSION; then also fills defaults via
 * store.migrate). `exportedAt` is stripped. Never mutates the input.
 * @param {any} obj
 * @param {{migrations?: Record<number, (d: any) => any>, target?: number}} [opts]
 */
export function migrateBackup(obj, { migrations = storeMigrations, target = SCHEMA_VERSION } = {}) {
  const { exportedAt, ...rest } = clone(obj);
  let d = rest;
  let v = Number.isInteger(d.schemaVersion) ? d.schemaVersion : 1;
  if (v > target) throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  while (v < target) {
    const fn = migrations[v];
    if (!fn) throw new Error(`Keine Migration von Version ${v} vorhanden.`);
    d = fn(d) ?? d;
    v += 1;
    d.schemaVersion = v;
  }
  d.schemaVersion = v;
  return target === SCHEMA_VERSION ? storeMigrate(d) : d;
}

const sessionTime = (s) => String(s.startedAt || s.endedAt || '');

/**
 * Legacy health log (v2/v3 diary, unused since v3.1 but kept in backups): merge by date, fields of the
 * current entry win, incoming fields fill gaps. Sorted by date (oldest first); invalid entries dropped.
 */
export function mergeLegacyLog(current, incoming) {
  const m = new Map();
  const valid = (list) => (Array.isArray(list) ? list : []).filter((e) => isObj(e) && typeof e.date === 'string');
  for (const e of valid(incoming)) m.set(e.date, { ...e });
  for (const e of valid(current)) m.set(e.date, { ...(m.get(e.date) || {}), ...e });
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Merge `incoming` into `current` by session id (both already migrated).
 * - sessions: union by id; on conflict the current one wins unless only the incoming one has a
 *   next-day check-in; sorted by startedAt (oldest first).
 * - settings, phaseId, nextWorkoutId, activeSession, phaseHistory: current wins.
 * - exerciseLevels: max per exercise; exitCriteriaDone: union; badges: union (earliest date);
 *   xp: max; records: per key the better one.
 * @param {import('../types.js').Data} current
 * @param {import('../types.js').Data} incoming
 * @returns {import('../types.js').Data}
 */
export function mergeBackups(current, incoming) {
  const cur = clone(current);
  const inc = clone(incoming);
  const byId = new Map();
  for (const s of cur.sessions || []) byId.set(s.id, s);
  for (const s of inc.sessions || []) {
    const have = byId.get(s.id);
    if (!have || (!have.nextDay && s.nextDay)) byId.set(s.id, s);
  }
  const sessions = [...byId.values()].sort((a, b) => (sessionTime(a) < sessionTime(b) ? -1 : sessionTime(a) > sessionTime(b) ? 1 : 0));

  const cs = cur.state || {};
  const is = inc.state || {};
  const exerciseLevels = { ...(is.exerciseLevels || {}) };
  for (const [k, v] of Object.entries(cs.exerciseLevels || {})) exerciseLevels[k] = Math.max(v, exerciseLevels[k] ?? 0);
  const exitCriteriaDone = {};
  for (const src of [is.exitCriteriaDone || {}, cs.exitCriteriaDone || {}]) {
    for (const [k, arr] of Object.entries(src)) exitCriteriaDone[k] = [...new Set([...(exitCriteriaDone[k] || []), ...(arr || [])])].sort((a, b) => a - b);
  }
  const badges = { ...(is.badges || {}) };
  for (const [k, at] of Object.entries(cs.badges || {})) badges[k] = badges[k] && badges[k] < at ? badges[k] : at;
  const records = { ...(cs.records || {}) };
  const better = { longestHold: 'seconds', mostReps: 'reps', strongestBand: 'rank' };
  for (const [k, field] of Object.entries(better)) {
    const a = records[k];
    const b = is.records?.[k];
    if (b && (!a || (b[field] ?? -Infinity) > (a[field] ?? -Infinity))) records[k] = b;
  }
  // v2: custom workouts by id (newer updatedAt wins), profile/toggles: current wins, gaps filled.
  // Legacy (v3.1 unused, kept untouched): healthLog by date, weightGoal current wins.
  const csets = cur.settings || {};
  const isets = inc.settings || {};
  const profile = { ...(isets.profile || {}) };
  for (const [k, v] of Object.entries(csets.profile || {})) if (v != null || !(k in profile)) profile[k] = v;
  return {
    ...cur,
    settings: { ...csets, profile, ...('weightGoal' in csets || 'weightGoal' in isets ? { weightGoal: csets.weightGoal ?? isets.weightGoal ?? null } : {}) },
    state: {
      ...cs, exerciseLevels, exitCriteriaDone, badges, records, xp: Math.max(cs.xp || 0, is.xp || 0),
      ...(cs.healthLog || is.healthLog ? { healthLog: mergeLegacyLog(cs.healthLog, is.healthLog) } : {}),
      customWorkouts: mergeCustomWorkouts(cs.customWorkouts, is.customWorkouts),
      exerciseToggles: { ...(is.exerciseToggles || {}), ...(cs.exerciseToggles || {}) },
      postOpClearance: cs.postOpClearance ?? is.postOpClearance ?? null,
      postOpEndClearance: cs.postOpEndClearance ?? is.postOpEndClearance ?? null,
    },
    sessions,
  };
}

/**
 * Pure import pipeline: parse → validate → migrate → replace or merge.
 * @param {string|object} input
 * @param {import('../types.js').Data} current
 * @param {{mode?: 'replace'|'merge'}} [opts]
 * @returns {import('../types.js').Data}
 */
export function prepareImport(input, current, { mode = 'replace' } = {}) {
  const obj = parseBackup(input);
  const v = validateBackup(obj);
  if (!v.ok) throw new Error(v.errors[0]);
  const data = migrateBackup(obj);
  if (mode === 'merge') return mergeBackups(storeMigrate(clone(current)), data);
  return data;
}

export function downloadBackup() {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Read a backup file and import it (replace = default, or merge by session id).
 * @param {File} file
 * @param {{mode?: 'replace'|'merge'}} [opts]
 * @returns {Promise<void>}
 */
export async function readBackupFile(file, { mode = 'replace' } = {}) {
  const text = await file.text();
  importData(prepareImport(text, get(), { mode }));
}
