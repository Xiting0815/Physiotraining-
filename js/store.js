// The ONLY module that touches localStorage. See docs/SPEC.md §6.7, §6.8, §7.3.
// Works in Node (tests) via an in-memory storage fallback.
import { migrateEquipment, EQUIPMENT_MODEL } from './logic/equipment.js';

export const STORAGE_KEY = 'pt.v1';
export const SCHEMA_VERSION = 1;

/** @returns {string} local "YYYY-MM-DD" */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @returns {import('./types.js').Data} */
export function defaults() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      surgeryDate: null,
      prehabStart: today(),
      weeklyGoal: 3,
      painThresholds: { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 },
      bands: [
        { id: 'yellow', label: 'Gelb', kind: 'theraband', color: '#F2D43D' },
        { id: 'red', label: 'Rot', kind: 'theraband', color: '#D9443B' },
        { id: 'green', label: 'Grün', kind: 'theraband', color: '#3BA55C' },
        { id: 'blue', label: 'Blau', kind: 'theraband', color: '#2F6FD6' },
        { id: 'loop-orange', label: 'Loop Orange', kind: 'loop', color: '#F08A24' },
        { id: 'loop-blue', label: 'Loop Blau', kind: 'loop', color: '#2456B8' },
      ],
      theme: 'system',
      sound: true,
      vibration: true,
      operatedSide: 'left',
      restDefault: null,
      fontScale: 1,
      ownedEquipment: [],      // v5 (SPEC §16): optional equipment ids ticked under „Meine Ausrüstung“ – steers the plan
      equipmentModel: EQUIPMENT_MODEL, // v5: id model of ownedEquipment (missing in stored data = legacy ids → migrateEquipment)
      lastBackupAt: null,
      // v2 (additive, SPEC §12.2); v4: stays 3 separate rowing sessions (weight loss is an additional goal)
      cardioGoalPerWeek: 3,
      surgeryDateSuggested: '2027-01-05', // pre-fill only – never copied into surgeryDate automatically
      // v3.1 (SPEC §14): only the body weight for the kcal estimate per session. Legacy keys of older versions
      // (heightCm, birthYear, sex, activityLevel; settings.weightGoal) stay untouched in stored data but are unused.
      profile: { weightKg: null },
      // v4 (SPEC §15): guidance timing, rowing warm-up, voice announcements
      prepSeconds: 5,          // „Bereit machen“ before every set (0–30 s)
      holdRelaxSeconds: 5,     // „Loslassen“ between hold reps, minimum (0–30 s)
      rowWarmupDefault: true,  // strength sessions p1–p3 start with 10 min rowing (per-session toggle)
      rowFinisherDefault: false, // optional rowing finisher after the strength part (only offered at a green knee light)
      voiceEnabled: true,      // German speech cues (js/util/voice.js; `sound: false` silences everything)
      voiceRate: 1.05,
      voiceVolume: 1,
      beepsWithVoice: true,
      // v5.3 (SPEC §18.3): shoulder impingement – no exercises above this arm elevation (archery draw excepted)
      shoulderImpingement: false,
      shoulderMaxElevationDeg: 65,
      // v5.2 (SPEC §17): Google-Drive sync. Device-local – never merged, never uploaded.
      sync: { enabled: false, clientId: '', deviceId: '', deviceName: '', lastSyncAt: null, lastError: null },
      // v5.2: last-write-wins bookkeeping (written by update(), read by js/sync/merge.js)
      _updatedAt: {},          // settings key → ISO time of the last local change
      _equipmentAt: {},        // equipment id → ISO time it was ticked/unticked
    },
    state: {
      phaseId: 'p1-basis',
      nextWorkoutId: 'p1-a',
      exerciseLevels: {},
      exitCriteriaDone: {},
      activeSession: null,
      xp: 0,
      badges: {},
      records: { longestHold: null, mostReps: null, strongestBand: null },
      phaseHistory: [{ phaseId: 'p1-basis', startedAt: today() }],
      lastSeenQuoteDay: null,
      welcomeDone: false,
      bandsConfirmed: false,
      // v2 (additive, SPEC §12.2)
      customWorkouts: [],
      // (state.healthLog of v2/v3 is no longer created; existing logs stay untouched and are kept in backups)
      exerciseToggles: {},                 // exerciseId → false (disabled) | true (enabled despite postOpAllowed=false)
      postOpClearance: null,               // { confirmedAt, note } – unlocks phase p4 after the surgery date
      postOpEndClearance: null,            // { confirmedAt, note } – doctor's release ends p4 early
      seatNotice: null,                    // v5.3: "pending" → Heute asks once „fester Stuhl oder PC-Stuhl mit Rollen?“; "seen" afterwards
      equipmentNotice: null,               // v5: "pending" → Heute shows „Neu: Deine Ausrüstung steuert jetzt den Plan“ once; "seen" afterwards
      droppedActiveSession: false,         // v5.1: true = a broken stored activeSession was discarded on load (UI notice, then reset to false)
      // v5.2 (SPEC §17): sync bookkeeping
      deletedSessionIds: [],               // tombstones [{id, at}] – kept 90 days so deletions reach the other device
      deletedCustomWorkoutIds: [],         // tombstones [{id, at}] for deleted custom workouts
      levelsUpdatedAt: {},                 // exerciseId → ISO time of the last level change (explicit regress beats max)
      _updatedAt: {},                      // tracked state key (phaseId, nextWorkoutId, …) → ISO time of the last change
      remoteActiveSession: null,           // {deviceName, workoutName, startedAt} – a training running on another device (info only)
    },
    sessions: [],
  };
}

/**
 * Migrations: key = version FROM which the function migrates (to key+1).
 * @type {Record<number, (data: any) => any>}
 */
export const migrations = {
  // 1: (data) => { /* v1 → v2 */ data.schemaVersion = 2; return data; },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Fill missing keys from defaults. Arrays/primitives from data win – unless their type contradicts the default
 * (hardening): an object/array/number/boolean/string default is never replaced by null or a value of another type.
 * Defaults that are `null` accept anything.
 */
function mergeDefaults(def, data) {
  if (data === undefined) return def;
  if (isObj(def)) {
    if (!isObj(data)) return def;
    const out = { ...def };
    for (const k of Object.keys(data)) out[k] = k in def ? mergeDefaults(def[k], data[k]) : data[k];
    return out;
  }
  if (Array.isArray(def)) return Array.isArray(data) ? data : def;
  if (isNum(def)) return isNum(data) ? data : def;
  if (typeof def === 'boolean') return typeof data === 'boolean' ? data : def;
  if (typeof def === 'string') return typeof data === 'string' ? data : def;
  return data;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Valid calendar date "YYYY-MM-DD" (rejects 2026-02-31). */
export function isISODay(v) {
  if (typeof v !== 'string' || !ISO_DAY.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const isDateish = (v) => typeof v === 'string' && v.length >= 10 && Number.isFinite(Date.parse(v));

/** Numeric settings: [min, max] – out-of-range values are clamped, non-numbers fall back to the default. */
const NUM_RANGES = {
  weeklyGoal: [1, 7], cardioGoalPerWeek: [0, 7], fontScale: [0.75, 2], prepSeconds: [0, 30], holdRelaxSeconds: [0, 30],
  voiceRate: [0.5, 2], voiceVolume: [0, 1],
};
const ENUMS = { theme: ['system', 'light', 'dark'], operatedSide: ['left', 'right'] };

/** Problems fixed by the last sanitize() run (for diagnostics / persisting the repaired data once). */
let lastFixes = [];

/**
 * v5.1 hardening (audit P0-3/P1-7): repair structurally broken data BEFORE defaults are merged, so the app never
 * crashes on null parts, junk sessions or a half-written active session. Never mutates the input.
 * - non-object settings/state → {} (defaults fill in); non-array sessions → []
 * - sessions: only objects with a string id and a date-ish startedAt/endedAt/date; duplicates (same id) dropped;
 *   non-array `exercises` → []
 * - settings.bands: valid {id,label} objects, else the default bands; ownedEquipment: strings only
 * - settings: numbers finite + clamped (NUM_RANGES), enums checked, surgeryDate valid YYYY-MM-DD else null,
 *   painThresholds numeric
 * - state: xp finite ≥ 0, customWorkouts objects only, maps (exerciseLevels, badges, …) objects,
 *   activeSession valid (exercises non-empty objects, string workoutId, cursor in bounds) else null +
 *   `state.droppedActiveSession = true`
 * @param {any} data @returns {any}
 */
export function sanitize(data) {
  const fixes = [];
  lastFixes = fixes;
  if (!isObj(data)) { fixes.push('root'); return {}; }
  const d = { ...data };
  const def = defaults();

  // ---- settings
  let st = d.settings;
  if (!isObj(st)) { if (st !== undefined) fixes.push('settings'); st = {}; } else st = { ...st };
  if ('bands' in st) {
    const bands = Array.isArray(st.bands) ? st.bands.filter((b) => isObj(b) && typeof b.id === 'string' && b.id && typeof b.label === 'string') : [];
    if (!bands.length) { fixes.push('bands'); st.bands = def.settings.bands; } else if (bands.length !== st.bands.length) { fixes.push('bands'); st.bands = bands; }
  }
  if ('ownedEquipment' in st) {
    const owned = Array.isArray(st.ownedEquipment) ? st.ownedEquipment.filter((x) => typeof x === 'string' && x) : [];
    if (!Array.isArray(st.ownedEquipment) || owned.length !== st.ownedEquipment.length) { fixes.push('ownedEquipment'); st.ownedEquipment = owned; }
  }
  if ('surgeryDate' in st && st.surgeryDate !== null && !isISODay(st.surgeryDate)) { fixes.push('surgeryDate'); st.surgeryDate = null; }
  if ('prehabStart' in st && !isISODay(st.prehabStart)) { fixes.push('prehabStart'); delete st.prehabStart; }
  for (const [k, [lo, hi]] of Object.entries(NUM_RANGES)) {
    if (!(k in st)) continue;
    const v = typeof st[k] === 'string' && st[k].trim() !== '' ? Number(st[k]) : st[k];
    if (!isNum(v)) { fixes.push(k); delete st[k]; } else if (v < lo || v > hi || v !== st[k]) { fixes.push(k); st[k] = Math.min(hi, Math.max(lo, v)); }
  }
  for (const [k, allowed] of Object.entries(ENUMS)) if (k in st && !allowed.includes(st[k])) { fixes.push(k); delete st[k]; }
  if ('restDefault' in st && st.restDefault !== null && !(isNum(st.restDefault) && st.restDefault >= 0)) { fixes.push('restDefault'); st.restDefault = null; }
  if ('painThresholds' in st) {
    const pt = isObj(st.painThresholds) ? { ...st.painThresholds } : {};
    for (const k of Object.keys(def.settings.painThresholds)) if (k in pt && !(isNum(pt[k]) && pt[k] >= 0 && pt[k] <= 10)) { fixes.push('painThresholds'); delete pt[k]; }
    if (!isObj(st.painThresholds)) fixes.push('painThresholds');
    st.painThresholds = pt;
  }
  if ('profile' in st && !isObj(st.profile)) { fixes.push('profile'); delete st.profile; }
  else if (isObj(st.profile) && 'weightKg' in st.profile && st.profile.weightKg !== null && !isNum(st.profile.weightKg)) {
    fixes.push('weightKg'); st.profile = { ...st.profile, weightKg: null };
  }
  for (const k of ['_updatedAt', '_equipmentAt']) {
    if (!(k in st)) continue;
    if (!isObj(st[k])) { fixes.push(k); st[k] = {}; continue; }
    const m = Object.fromEntries(Object.entries(st[k]).filter(([, v]) => isDateish(v)));
    if (Object.keys(m).length !== Object.keys(st[k]).length) { fixes.push(k); st[k] = m; }
  }
  if ('sync' in st && !isObj(st.sync)) { fixes.push('sync'); delete st.sync; }
  d.settings = st;

  // ---- state
  let s = d.state;
  if (!isObj(s)) { if (s !== undefined) fixes.push('state'); s = {}; } else s = { ...s };
  if ('xp' in s) {
    const xp = typeof s.xp === 'string' && s.xp.trim() !== '' ? Number(s.xp) : s.xp;
    if (!isNum(xp) || xp < 0) { fixes.push('xp'); s.xp = 0; } else if (xp !== s.xp) { fixes.push('xp'); s.xp = xp; }
  }
  if ('customWorkouts' in s) {
    const cw = Array.isArray(s.customWorkouts) ? s.customWorkouts.filter((w) => isObj(w) && typeof w.id === 'string' && w.id) : [];
    if (!Array.isArray(s.customWorkouts) || cw.length !== s.customWorkouts.length) { fixes.push('customWorkouts'); s.customWorkouts = cw; }
  }
  for (const k of ['exerciseLevels', 'exitCriteriaDone', 'badges', 'records', 'exerciseToggles']) {
    if (k in s && !isObj(s[k])) { fixes.push(k); delete s[k]; }
  }
  if (isObj(s.exerciseLevels)) {
    const lv = {};
    for (const [k, v] of Object.entries(s.exerciseLevels)) if (Number.isInteger(v) && v >= 0) lv[k] = v; else fixes.push('exerciseLevels');
    s.exerciseLevels = lv;
  }
  if (isObj(s.exitCriteriaDone)) {
    const ec = {};
    for (const [k, v] of Object.entries(s.exitCriteriaDone)) if (Array.isArray(v)) ec[k] = v.filter(Number.isInteger); else fixes.push('exitCriteriaDone');
    s.exitCriteriaDone = ec;
  }
  if ('phaseHistory' in s) {
    const ph = Array.isArray(s.phaseHistory) ? s.phaseHistory.filter((p) => isObj(p) && typeof p.phaseId === 'string') : [];
    if (!ph.length) { fixes.push('phaseHistory'); delete s.phaseHistory; } else if (ph.length !== s.phaseHistory.length) { fixes.push('phaseHistory'); s.phaseHistory = ph; }
  }
  for (const k of ['phaseId', 'nextWorkoutId']) if (k in s && (typeof s[k] !== 'string' || !s[k])) { fixes.push(k); delete s[k]; }
  for (const k of ['postOpClearance', 'postOpEndClearance']) if (k in s && s[k] !== null && !isObj(s[k])) { fixes.push(k); s[k] = null; }
  for (const k of ['deletedSessionIds', 'deletedCustomWorkoutIds']) {
    if (!(k in s)) continue;
    const list = Array.isArray(s[k]) ? s[k].filter((t) => isObj(t) && typeof t.id === 'string' && t.id && isDateish(t.at)) : [];
    if (!Array.isArray(s[k]) || list.length !== s[k].length) { fixes.push(k); s[k] = list; }
  }
  for (const k of ['levelsUpdatedAt', '_updatedAt']) {
    if (!(k in s)) continue;
    if (!isObj(s[k])) { fixes.push(k); s[k] = {}; continue; }
    const m = Object.fromEntries(Object.entries(s[k]).filter(([, v]) => isDateish(v)));
    if (Object.keys(m).length !== Object.keys(s[k]).length) { fixes.push(k); s[k] = m; }
  }
  if ('remoteActiveSession' in s && s.remoteActiveSession !== null && !(isObj(s.remoteActiveSession) && isDateish(s.remoteActiveSession.startedAt))) {
    fixes.push('remoteActiveSession'); s.remoteActiveSession = null;
  }
  if (s.activeSession != null && !validActiveSession(s.activeSession)) {
    fixes.push('activeSession');
    s.activeSession = null;
    s.droppedActiveSession = true;
  }
  d.state = s;

  // ---- sessions
  if (!Array.isArray(d.sessions)) { if (d.sessions !== undefined) fixes.push('sessions'); d.sessions = []; }
  else {
    const seen = new Set();
    const out = [];
    for (const x of d.sessions) {
      if (!isObj(x) || typeof x.id !== 'string' || !x.id || seen.has(x.id)) continue;
      if (!isDateish(x.startedAt) && !isDateish(x.endedAt) && !isDateish(x.date)) continue;
      seen.add(x.id);
      out.push(Array.isArray(x.exercises) ? x : { ...x, exercises: [] });
    }
    if (out.length !== d.sessions.length || out.some((x, i) => x !== d.sessions[i])) fixes.push('sessions');
    d.sessions = out;
  }
  return d;
}

/**
 * Is a stored active session safe to resume? Object, string workoutId, non-empty `exercises` of objects and a
 * cursor `{index, set, step}` within bounds.
 * @param {any} a
 */
export function validActiveSession(a) {
  if (!isObj(a)) return false;
  if (typeof a.workoutId !== 'string' || !a.workoutId) return false;
  if (!Array.isArray(a.exercises) || !a.exercises.length || !a.exercises.every(isObj)) return false;
  const c = a.cursor;
  if (!isObj(c)) return false;
  if (!Number.isInteger(c.index) || c.index < 0 || c.index >= a.exercises.length) return false;
  if (c.set !== undefined && !(Number.isInteger(c.set) && c.set >= 0)) return false;
  if (typeof c.step !== 'string' || !c.step) return false;
  return true;
}

/** Problems repaired by the last migrate() (empty = data was clean). @returns {string[]} */
export const lastSanitizeFixes = () => lastFixes.slice();

const isKg = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 30 && v <= 300;

/**
 * v3.1 (SPEC §14): when the stored profile has no `weightKg` key yet, prefill it from the latest
 * weight of the legacy health log (if any). Runs once – afterwards the key exists (possibly null).
 * Never touches `state.healthLog` / `settings.weightGoal`.
 */
export function prefillWeight(data) {
  if (!isObj(data)) return data;
  const prof = isObj(data.settings?.profile) ? data.settings.profile : null;
  if (prof && 'weightKg' in prof) return data;
  const log = Array.isArray(data.state?.healthLog) ? data.state.healthLog : [];
  const last = log.filter((e) => isObj(e) && typeof e.date === 'string' && isKg(e.weightKg))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).at(-1);
  if (!last) return data;
  // copy instead of mutating the (possibly shared) input objects
  const settings = { ...(isObj(data.settings) ? data.settings : {}), profile: { ...(prof || {}), weightKg: Math.round(last.weightKg * 10) / 10 } };
  return { ...data, settings };
}

/** @param {any} data @returns {import('./types.js').Data} */
export function migrate(data) {
  lastFixes = [];
  if (!isObj(data)) return defaults();
  let d = data;
  let v = Number.isInteger(d.schemaVersion) ? d.schemaVersion : 1;
  while (v < SCHEMA_VERSION) {
    const fn = migrations[v];
    if (!fn) throw new Error(`Keine Migration von Version ${v} vorhanden.`);
    d = fn(d);
    v += 1;
    d.schemaVersion = v;
  }
  d = mergeDefaults(defaults(), prefillWeight(migrateEquipment(sanitize(d))));
  if (!Array.isArray(d.sessions)) d.sessions = [];
  d.schemaVersion = SCHEMA_VERSION;
  return d;
}

// ---- storage backend -------------------------------------------------------

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

function detectStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      const t = '__pt_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return localStorage;
    }
  } catch { /* private mode / blocked */ }
  return memoryStorage();
}

let storage = null;
/** @type {import('./types.js').Data|null} */
let cache = null;
const subscribers = new Set();
const saveErrorListeners = new Set();
const externalListeners = new Set();

/** Save status (audit P0-1). */
let saveOk = true;
/** @type {Error|null} */
let lastSaveError = null;
/** Read-only: stored data is newer than this app (P2-4) or a corrupt copy could not be preserved (P0-2). */
let readOnly = false;
/**
 * Problems found on the last load().
 * @type {{corrupt: null|{key: string|null, preserved: boolean, at: string, error: string}, newerVersion: number|null, fixes: string[]}}
 */
let issues = { corrupt: null, newerVersion: null, fixes: [] };

function backend() {
  if (!storage) storage = detectStorage();
  return storage;
}

/** Test hook. @param {{getItem:Function,setItem:Function,removeItem:Function,key?:Function,length?:number}|null} s */
export function _setStorage(s) {
  storage = s;
  cache = null;
  saveOk = true;
  lastSaveError = null;
  readOnly = false;
  issues = { corrupt: null, newerVersion: null, fixes: [] };
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

function notify() {
  for (const fn of subscribers) {
    try { fn(cache); } catch (e) { console.error('store subscriber failed', e); }
  }
}

/** All keys of the backend (empty if it cannot enumerate). @returns {string[]} */
function storageKeys() {
  const b = backend();
  const out = [];
  try {
    const n = typeof b.length === 'number' ? b.length : 0;
    for (let i = 0; i < n; i++) { const k = b.key?.(i); if (typeof k === 'string') out.push(k); }
  } catch { /* ignore */ }
  return out;
}

export const CORRUPT_PREFIX = `${STORAGE_KEY}.corrupt-`;
const MAX_CORRUPT_COPIES = 2;

/** Keys of preserved corrupt copies, oldest first. @returns {string[]} */
export function corruptBackupKeys() {
  return storageKeys().filter((k) => k.startsWith(CORRUPT_PREFIX)).sort();
}

/** Raw text of a preserved corrupt copy (or null). @param {string} key */
export function readCorruptBackup(key) {
  if (typeof key !== 'string' || !key.startsWith(CORRUPT_PREFIX)) return null;
  try { return backend().getItem(key); } catch { return null; }
}

/**
 * P0-2: keep the unreadable raw string under `pt.v1.corrupt-<ISO>` (max. 2 copies, oldest removed).
 * If the copy cannot be written the store goes read-only so the original is never overwritten.
 */
function preserveCorrupt(raw, err) {
  const at = new Date().toISOString();
  const key = CORRUPT_PREFIX + at;
  const prune = (keep) => {
    const keys = corruptBackupKeys().filter((k) => k !== key);
    while (keys.length > keep) { try { backend().removeItem(keys.shift()); } catch { break; } }
  };
  let preserved = false;
  try { backend().setItem(key, raw); preserved = true; }
  catch {
    prune(0); // make room: older corrupt copies first
    try { backend().setItem(key, raw); preserved = true; } catch { preserved = false; }
  }
  if (preserved) prune(MAX_CORRUPT_COPIES - 1);
  else readOnly = true;
  issues.corrupt = { key: preserved ? key : null, preserved, at, error: String(err?.message || err) };
  console.warn(preserved ? `pt.v1 unlesbar – Kopie unter ${key} aufbewahrt.` : 'pt.v1 unlesbar – Kopie nicht möglich, Speichern gesperrt.', err);
}

// ---- public API ------------------------------------------------------------

/** True when migration added the profile weight key (v3.1) – then the migrated data is written back once. */
function needsPersist(raw, data) {
  try {
    const before = JSON.parse(raw);
    if (isObj(before?.settings) && !(before.settings.equipmentModel >= EQUIPMENT_MODEL)) return true; // v5 equipment migration
    return !(isObj(before?.settings?.profile) && 'weightKg' in before.settings.profile) && 'weightKg' in (data.settings?.profile || {});
  } catch { return false; }
}

/**
 * Parse + migrate a raw stored string. Never throws.
 * @returns {{data: any, corrupt?: any, newer?: number}}
 */
function parseStored(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return { data: null, corrupt: e }; }
  if (!isObj(parsed)) return { data: null, corrupt: new Error('Gespeicherte Daten sind kein Objekt.') };
  if (Number.isInteger(parsed.schemaVersion) && parsed.schemaVersion > SCHEMA_VERSION) {
    let data;
    try { data = migrate(clone(parsed)); } catch { data = defaults(); }
    return { data, newer: parsed.schemaVersion };
  }
  try { return { data: migrate(parsed) }; } catch (e) { return { data: null, corrupt: e }; }
}

/** @returns {import('./types.js').Data} */
export function load() {
  let raw = null;
  try { raw = backend().getItem(STORAGE_KEY); } catch { raw = null; }
  readOnly = false;
  issues = { corrupt: null, newerVersion: null, fixes: [] };
  let data;
  if (!raw) data = defaults();
  else {
    const r = parseStored(raw);
    if (r.corrupt) { preserveCorrupt(raw, r.corrupt); data = defaults(); }
    else {
      data = r.data;
      issues.fixes = lastSanitizeFixes();
      if (r.newer) {
        readOnly = true;
        issues.newerVersion = r.newer;
        console.warn(`pt.v1 stammt aus Datenversion ${r.newer} (App: ${SCHEMA_VERSION}) – nur lesen.`);
      }
    }
  }
  cache = data;
  watchStorageEvents();
  // persist defaults once so e.g. prehabStart stays stable; persist migrations (e.g. v3.1 weightKg prefill),
  // repairs (sanitize) and the defaults that replace a preserved corrupt copy once. Read-only: save() refuses.
  if (!raw || issues.corrupt || issues.fixes.length || needsPersist(raw, data)) save();
  return cache;
}

/** @returns {import('./types.js').Data} */
export function get() {
  return cache ?? load();
}

/**
 * Write the cache to storage.
 * @param {import('./types.js').Data} [data]
 * @returns {boolean} true when written; false on failure (QuotaExceeded, blocked) or read-only mode.
 */
export function save(data) {
  if (data) cache = data;
  if (!cache) cache = defaults();
  if (readOnly) {
    saveOk = false;
    lastSaveError = Object.assign(new Error('Nur-Lese-Modus: Daten werden nicht gespeichert.'), { code: 'readonly' });
    return false;
  }
  try {
    backend().setItem(STORAGE_KEY, JSON.stringify(cache));
    saveOk = true;
    lastSaveError = null;
    return true;
  } catch (e) {
    console.error('Speichern fehlgeschlagen', e);
    saveOk = false;
    lastSaveError = e instanceof Error ? e : new Error(String(e));
    for (const fn of saveErrorListeners) {
      try { fn(lastSaveError); } catch (err) { console.error('onSaveError listener failed', err); }
    }
    return false;
  }
}

/** Did the last save() succeed? (false also in read-only mode) */
export const lastSaveOk = () => saveOk;
/** Error of the last failed save() (null after a successful one). */
export const getLastSaveError = () => lastSaveError;
/** Read-only mode (newer data version / unpreservable corrupt data): save() never writes. */
export const isReadOnly = () => readOnly;
/**
 * What load() found: `corrupt` (a copy of unreadable data was kept under `corrupt.key`), `newerVersion` (schema
 * version of the stored data, store is read-only) and `fixes` (parts repaired by sanitize).
 */
export const loadIssues = () => ({ ...issues, fixes: issues.fixes.slice() });

/**
 * Called on every failed write (not in read-only mode). Every later update() retries the full write.
 * @param {(err: Error) => void} cb @returns {() => void} unsubscribe
 */
export function onSaveError(cb) {
  saveErrorListeners.add(cb);
  return () => saveErrorListeners.delete(cb);
}

// ---- v5.2 (SPEC §17): change tracking for the Google-Drive sync ------------------------------------

/** Server-corrected clock (js/sync/engine.js sets the offset from the Drive `Date` header). */
let clockOffsetMs = 0;
/** @type {() => number} */
let clockNow = () => Date.now();
/** @param {number} ms difference server − device (bounded to ±7 days) */
export function setClockOffset(ms) { clockOffsetMs = Number.isFinite(ms) ? Math.max(-7 * 864e5, Math.min(7 * 864e5, ms)) : 0; }
export const getClockOffset = () => clockOffsetMs;
/** Test hook: replace the device clock. @param {(() => number)|null} fn */
export function _setNow(fn) { clockNow = typeof fn === 'function' ? fn : () => Date.now(); }
/** Current time (ms) corrected by the server offset. */
export const syncNow = () => clockNow() + clockOffsetMs;
/** ISO timestamp used for all change bookkeeping. */
export const nowISO = () => new Date(syncNow()).toISOString();

/** Settings keys that are never compared / merged (device-local or bookkeeping). */
export const LOCAL_SETTINGS_KEYS = ['sync', '_updatedAt', '_equipmentAt'];
/**
 * State keys that are device-local, bookkeeping, or merged by their own rules (not per-key last-write-wins).
 * Everything else in `state` gets a timestamp in `state._updatedAt` when it changes.
 */
export const UNTRACKED_STATE_KEYS = [
  'activeSession', 'remoteActiveSession', 'droppedActiveSession', 'storageHintShown', '_updatedAt', 'levelsUpdatedAt',
  'deletedSessionIds', 'deletedCustomWorkoutIds', 'exerciseLevels', 'customWorkouts', 'xp', 'badges', 'records',
  'exitCriteriaDone', 'healthLog',
];

const sig = (v) => (v === undefined ? 'u' : JSON.stringify(v));
const byId = (list) => new Map((Array.isArray(list) ? list : []).filter((x) => isObj(x) && typeof x.id === 'string').map((x) => [x.id, x]));
const addTombstone = (list, id, at) => [...(Array.isArray(list) ? list : []).filter((t) => t?.id !== id), { id, at }];

/**
 * Diff `before` → `after` and write the bookkeeping the sync merge needs INTO `after` (mutates it):
 * - settings: `_updatedAt[key]` for every changed key (except sync/_updatedAt/_equipmentAt); `_equipmentAt[id]`
 *   for every ticked/unticked equipment id
 * - state: `_updatedAt[key]` for changed tracked keys (phaseId, nextWorkoutId, phaseHistory, …),
 *   `levelsUpdatedAt[exerciseId]` for changed levels
 * - sessions/customWorkouts: removed ids → tombstones (`deletedSessionIds` / `deletedCustomWorkoutIds`),
 *   changed entries → `updatedAt = at` (unless the change already set a new updatedAt)
 * @param {any} before @param {any} after @param {string} [at]
 * @returns {{relevant: boolean, kinds: string[]}} relevant = something the other device should get;
 *   kinds ⊂ settings|state|levels|sessions|custom|active|finish|nextDay
 */
export function trackChanges(before, after, at = nowISO()) {
  const kinds = new Set();
  if (!isObj(before) || !isObj(after)) return { relevant: false, kinds: [] };
  // settings
  const bs = isObj(before.settings) ? before.settings : {};
  const as = isObj(after.settings) ? after.settings : null;
  if (as) {
    const stamps = { ...(isObj(as._updatedAt) ? as._updatedAt : {}) };
    let changed = false;
    for (const k of new Set([...Object.keys(bs), ...Object.keys(as)])) {
      if (LOCAL_SETTINGS_KEYS.includes(k)) continue;
      if (sig(bs[k]) !== sig(as[k])) { stamps[k] = at; changed = true; }
    }
    if (changed) { as._updatedAt = stamps; kinds.add('settings'); }
    const ob = new Set(Array.isArray(bs.ownedEquipment) ? bs.ownedEquipment : []);
    const oa = new Set(Array.isArray(as.ownedEquipment) ? as.ownedEquipment : []);
    const flips = [...ob, ...oa].filter((id) => ob.has(id) !== oa.has(id));
    if (flips.length) as._equipmentAt = { ...(isObj(as._equipmentAt) ? as._equipmentAt : {}), ...Object.fromEntries(flips.map((id) => [id, at])) };
  }
  // state
  const bst = isObj(before.state) ? before.state : {};
  const ast = isObj(after.state) ? after.state : null;
  if (ast) {
    const stamps = { ...(isObj(ast._updatedAt) ? ast._updatedAt : {}) };
    let changed = false;
    for (const k of new Set([...Object.keys(bst), ...Object.keys(ast)])) {
      if (UNTRACKED_STATE_KEYS.includes(k)) continue;
      if (sig(bst[k]) !== sig(ast[k])) { stamps[k] = at; changed = true; }
    }
    if (changed) { ast._updatedAt = stamps; kinds.add('state'); }
    for (const k of ['xp', 'badges', 'records', 'exitCriteriaDone']) if (sig(bst[k]) !== sig(ast[k])) kinds.add('state');
    // levels
    const lb = isObj(bst.exerciseLevels) ? bst.exerciseLevels : {};
    const la = isObj(ast.exerciseLevels) ? ast.exerciseLevels : {};
    const lvStamps = {};
    for (const k of new Set([...Object.keys(lb), ...Object.keys(la)])) if (lb[k] !== la[k]) lvStamps[k] = at;
    if (Object.keys(lvStamps).length) { ast.levelsUpdatedAt = { ...(isObj(ast.levelsUpdatedAt) ? ast.levelsUpdatedAt : {}), ...lvStamps }; kinds.add('levels'); }
    // custom workouts
    if (sig(bst.customWorkouts) !== sig(ast.customWorkouts)) {
      kinds.add('custom');
      const mb = byId(bst.customWorkouts);
      const ma = byId(ast.customWorkouts);
      for (const id of mb.keys()) if (!ma.has(id)) ast.deletedCustomWorkoutIds = addTombstone(ast.deletedCustomWorkoutIds, id, at);
      for (const [id, w] of ma) {
        const o = mb.get(id);
        if (o && sig(o) !== sig(w) && w.updatedAt === o.updatedAt) w.updatedAt = at;
        else if (!o && !w.updatedAt) w.updatedAt = at;
      }
    }
    // active session
    const hadActive = !!bst.activeSession;
    if (sig(bst.activeSession) !== sig(ast.activeSession)) kinds.add('active');
    if (hadActive && !ast.activeSession) kinds.add('finish');
  }
  // sessions
  if (sig(before.sessions) !== sig(after.sessions)) {
    kinds.add('sessions');
    const mb = byId(before.sessions);
    const ma = byId(after.sessions);
    if (ast) for (const id of mb.keys()) if (!ma.has(id)) ast.deletedSessionIds = addTombstone(ast.deletedSessionIds, id, at);
    for (const [id, s] of ma) {
      const o = mb.get(id);
      if (!o) continue;
      if (!o.nextDay && s.nextDay) kinds.add('nextDay');
      if (sig(o) !== sig(s) && s.updatedAt === o.updatedAt) s.updatedAt = at;
    }
  }
  return { relevant: kinds.size > 0, kinds: [...kinds] };
}

const changeListeners = new Set();
/**
 * v5.2: called after every update() that changed data (not for sync-only bookkeeping, not for applySync()).
 * @param {(data: import('./types.js').Data, info: {kinds: string[]}) => void} cb @returns {() => void}
 */
export function onLocalChange(cb) {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

/**
 * @param {(draft: import('./types.js').Data) => (import('./types.js').Data|void)} fn
 * @returns {import('./types.js').Data}
 */
export function update(fn) {
  const prev = get();
  const draft = clone(prev);
  const result = fn(draft);
  cache = result && typeof result === 'object' ? result : draft;
  let info = { relevant: false, kinds: [] };
  try { info = trackChanges(prev, cache); } catch (e) { console.error('Änderungsverfolgung fehlgeschlagen', e); }
  save(); // writes the whole cache → also retries an earlier failed write
  notify();
  if (info.relevant) {
    for (const cb of changeListeners) {
      try { cb(cache, info); } catch (e) { console.error('onLocalChange listener failed', e); }
    }
  }
  return cache;
}

/**
 * v5.2: replace the data with a sync merge result (already migrated). No change tracking, no onLocalChange
 * (would start the next sync), subscribers are notified. Refused in read-only mode.
 * @param {import('./types.js').Data} data @returns {boolean}
 */
export function applySync(data) {
  if (readOnly || !isObj(data)) return false;
  const prev = cache;
  cache = data;
  if (!save()) { cache = prev; return false; }
  notify();
  return true;
}

/** @param {(data: import('./types.js').Data) => void} fn @returns {() => void} */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export const getSettings = () => get().settings;
export const getState = () => get().state;
export const getSessions = () => get().sessions;

/**
 * P2-8: approximate size of everything this origin keeps in localStorage (key + value length in UTF-16 code
 * units – the unit browsers count against their ~5 MB quota).
 * @returns {number}
 */
export function usageBytes() {
  const b = backend();
  const keys = storageKeys();
  let n = 0;
  try {
    if (keys.length) for (const k of keys) n += k.length + String(b.getItem(k) ?? '').length;
    else n = STORAGE_KEY.length + String(b.getItem(STORAGE_KEY) ?? '').length;
  } catch { /* ignore */ }
  return n;
}

/** Raw snapshot of all `pt.*` keys (emergency „Daten sichern“). @returns {Record<string, string|null>} */
export function rawSnapshot() {
  const out = {};
  const b = backend();
  const keys = storageKeys().filter((k) => k.startsWith('pt.'));
  if (!keys.includes(STORAGE_KEY)) keys.unshift(STORAGE_KEY);
  for (const k of keys) { try { out[k] = b.getItem(k); } catch { out[k] = null; } }
  return out;
}

let persistAsked = false;
/** Ask the browser once for persistent storage (no eviction under storage pressure). @returns {Promise<boolean>} */
export async function requestPersistentStorage() {
  if (persistAsked) return false;
  persistAsked = true;
  try {
    const sm = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!sm?.persist) return false;
    if (await sm.persisted?.()) return true;
    return await sm.persist();
  } catch { return false; }
}

// ---- P2-5: changes from another context (second tab, WebAPK vs. browser) ----------------------

/**
 * Re-read pt.v1 after another context changed it; notifies subscribers and onExternalChange listeners.
 * Unreadable data written by the other context is ignored (that context handles it).
 * @returns {boolean} true when the cache was replaced
 */
export function reloadFromStorage() {
  let raw = null;
  try { raw = backend().getItem(STORAGE_KEY); } catch { return false; }
  if (!raw) return false;
  const r = parseStored(raw);
  if (r.corrupt || !r.data) return false;
  const hadActive = !!cache?.state?.activeSession;
  cache = r.data;
  if (r.newer) { readOnly = true; issues.newerVersion = r.newer; }
  notify();
  for (const fn of externalListeners) {
    try { fn(cache, { hadActiveSession: hadActive }); } catch (e) { console.error('onExternalChange listener failed', e); }
  }
  return true;
}

/** @param {(data: import('./types.js').Data, info: {hadActiveSession: boolean}) => void} cb @returns {() => void} */
export function onExternalChange(cb) {
  externalListeners.add(cb);
  return () => externalListeners.delete(cb);
}

let watching = false;
function watchStorageEvents() {
  if (watching || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  watching = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    if (e.storageArea && typeof localStorage !== 'undefined' && e.storageArea !== localStorage) return;
    reloadFromStorage();
  });
}

/** @returns {string} */
export function exportData() {
  return JSON.stringify({ ...get(), exportedAt: new Date().toISOString() }, null, 2);
}

const SAVE_FAILED_MSG = 'Speichern fehlgeschlagen – Speicher voll oder gesperrt. Bitte zuerst eine Sicherung exportieren.';

/**
 * Replace all data. Throws a German Error when the input is invalid or the result cannot be saved
 * (then the previous data stays active).
 * @param {string|object} input
 */
export function importData(input) {
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); }
    catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  }
  if (!isObj(obj) || !isObj(obj.settings) || !isObj(obj.state) || !Array.isArray(obj.sessions)) {
    throw new Error('Die Datei ist keine gültige Physio-Sicherung.');
  }
  if (Number.isInteger(obj.schemaVersion) && obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  }
  if (readOnly) throw new Error('Diese Daten stammen aus einer neueren App-Version. Bitte App aktualisieren.');
  const { exportedAt, ...rest } = obj;
  const prev = cache;
  cache = migrate(clone(rest));
  // v5.2: the sync connection is device-local – never taken from a backup (another device's deviceId)
  cache.settings.sync = clone(isObj(prev?.settings?.sync) ? prev.settings.sync : defaults().settings.sync);
  if (!save()) {
    cache = prev;
    throw new Error(SAVE_FAILED_MSG);
  }
  notify();
  return cache;
}

export function reset() {
  cache = defaults();
  save();
  notify();
  return cache;
}
