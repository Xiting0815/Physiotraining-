// The ONLY module that touches localStorage. See docs/SPEC.md §6.7, §6.8, §7.3.
// Works in Node (tests) via an in-memory storage fallback.

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
      ownedEquipment: [],
      lastBackupAt: null,
      // v2 (additive, SPEC §12.2)
      cardioGoalPerWeek: 3,
      surgeryDateSuggested: '2027-01-05', // pre-fill only – never copied into surgeryDate automatically
      profile: { heightCm: null, birthYear: null, sex: null, activityLevel: 'light' },
      weightGoal: null,                    // { targetKg, targetDate, startKg, startDate }
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
      healthLog: [],
      exerciseToggles: {},                 // exerciseId → false (disabled) | true (enabled despite postOpAllowed=false)
      postOpClearance: null,               // { confirmedAt, note } – unlocks phase p4 after the surgery date
      postOpEndClearance: null,            // { confirmedAt, note } – doctor's release ends p4 early
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

/** Fill missing keys from defaults (objects only; arrays/primitives from data win). */
function mergeDefaults(def, data) {
  if (!isObj(def) || !isObj(data)) return data === undefined ? def : data;
  const out = { ...def };
  for (const k of Object.keys(data)) out[k] = k in def ? mergeDefaults(def[k], data[k]) : data[k];
  return out;
}

/** @param {any} data @returns {import('./types.js').Data} */
export function migrate(data) {
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
  d = mergeDefaults(defaults(), d);
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

function backend() {
  if (!storage) storage = detectStorage();
  return storage;
}

/** Test hook. @param {{getItem:Function,setItem:Function,removeItem:Function}|null} s */
export function _setStorage(s) {
  storage = s;
  cache = null;
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

function notify() {
  for (const fn of subscribers) {
    try { fn(cache); } catch (e) { console.error('store subscriber failed', e); }
  }
}

// ---- public API ------------------------------------------------------------

/** @returns {import('./types.js').Data} */
export function load() {
  let raw = null;
  try { raw = backend().getItem(STORAGE_KEY); } catch { raw = null; }
  let data;
  if (!raw) data = defaults();
  else {
    try { data = migrate(JSON.parse(raw)); }
    catch (e) {
      console.warn('pt.v1 unlesbar – Standardwerte werden verwendet.', e);
      data = defaults();
    }
  }
  cache = data;
  if (!raw) save(); // persist defaults once so e.g. prehabStart stays stable
  return cache;
}

/** @returns {import('./types.js').Data} */
export function get() {
  return cache ?? load();
}

/** @param {import('./types.js').Data} [data] */
export function save(data) {
  if (data) cache = data;
  if (!cache) cache = defaults();
  try { backend().setItem(STORAGE_KEY, JSON.stringify(cache)); }
  catch (e) { console.error('Speichern fehlgeschlagen', e); }
}

/**
 * @param {(draft: import('./types.js').Data) => (import('./types.js').Data|void)} fn
 * @returns {import('./types.js').Data}
 */
export function update(fn) {
  const draft = clone(get());
  const result = fn(draft);
  cache = result && typeof result === 'object' ? result : draft;
  save();
  notify();
  return cache;
}

/** @param {(data: import('./types.js').Data) => void} fn @returns {() => void} */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export const getSettings = () => get().settings;
export const getState = () => get().state;
export const getSessions = () => get().sessions;

/** @returns {string} */
export function exportData() {
  return JSON.stringify({ ...get(), exportedAt: new Date().toISOString() }, null, 2);
}

/** @param {string|object} input */
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
  const { exportedAt, ...rest } = obj;
  cache = migrate(clone(rest));
  save();
  notify();
  return cache;
}

export function reset() {
  cache = defaults();
  save();
  notify();
  return cache;
}
