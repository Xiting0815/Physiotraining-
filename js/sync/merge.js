// Google-Drive sync – two-device merge (SPEC §17.3). PURE: no DOM, no storage, no network.
//
// mergeSync(local, remote) extends export-import.mergeBackups (badges, records, xp max, exit criteria, legacy
// health log, tombstones) with last-write-wins rules based on the bookkeeping store.update() writes:
//   - sessions: union by id, tombstoned ids removed; on conflict the newer one (updatedAt/endedAt/startedAt)
//     wins, tie → the one with a next-day check-in; a next-day check-in is never lost
//   - customWorkouts: by id, newer updatedAt wins, tombstones respected (mergeBackups)
//   - exerciseLevels: newer `levelsUpdatedAt` wins (an explicit regress beats a higher old level);
//     no timestamps / first sync of a device ("join") → max
//   - settings: per key last-write-wins via settings._updatedAt; ownedEquipment per id via settings._equipmentAt
//   - state keys (phaseId, nextWorkoutId, phaseHistory, …): per key last-write-wins via state._updatedAt
//   - activeSession: always the local one (never taken from the other device); settings.sync stays local
// Timestamps further than MAX_FUTURE_SKEW_MS in the future (wrong device clock) are clamped.
import { mergeBackups } from '../util/export-import.js';
import { LOCAL_SETTINGS_KEYS, UNTRACKED_STATE_KEYS } from '../store.js';
import { MAX_FUTURE_SKEW_MS, REMOTE_ACTIVE_MAX_MS, SYNC_FORMAT } from './config.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const fin = (t) => (Number.isFinite(t) ? t : -Infinity);
const sessionTime = (s) => String(s.startedAt || s.endedAt || '');

/** @param {number} now @returns {(v: any) => number} parsed timestamp (NaN if missing), future clamped */
const stamper = (now) => (v) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? Math.min(t, now + MAX_FUTURE_SKEW_MS) : NaN;
};

/**
 * Last-write-wins for one value. Returns 'l' or 'r'.
 * both stamped → newer (tie → local); one stamped → that one; none → the non-empty one, then remote on
 * `join` (a device's first sync adopts the shared state), else local.
 */
function pick(l, r, tl, tr, join) {
  if (r === undefined) return 'l';
  if (l === undefined) return 'r';
  const fl = Number.isFinite(tl);
  const fr = Number.isFinite(tr);
  if (fl && fr) return tr > tl ? 'r' : 'l';
  if (fr) return 'r';
  if (fl) return 'l';
  if (l === null && r !== null) return 'r';
  if (r === null) return 'l';
  return join ? 'r' : 'l';
}

const maxIso = (a, b, ts) => {
  const ta = ts(a);
  const tb = ts(b);
  if (!Number.isFinite(ta)) return Number.isFinite(tb) ? b : undefined;
  if (!Number.isFinite(tb)) return a;
  return tb > ta ? b : a;
};

/** Pick the winning version of one session present on both sides. */
export function pickSession(l, r, { now = Date.now() } = {}) {
  const ts = stamper(now);
  const stamp = (s) => Math.max(fin(ts(s.updatedAt)), fin(ts(s.endedAt)), fin(ts(s.startedAt)));
  const sl = stamp(l);
  const sr = stamp(r);
  let win = sr > sl ? r : sl > sr ? l : (!l.nextDay && r.nextDay ? r : l);
  const lose = win === l ? r : l;
  if (!win.nextDay && lose.nextDay) win = { ...win, nextDay: lose.nextDay };
  return win;
}

/**
 * Merge per-exercise levels.
 * @returns {{levels: Record<string, number>, stamps: Record<string, string>}}
 */
export function mergeLevels(L, R, { now = Date.now(), join = false } = {}) {
  const ts = stamper(now);
  const lv = isObj(L?.exerciseLevels) ? L.exerciseLevels : {};
  const rv = isObj(R?.exerciseLevels) ? R.exerciseLevels : {};
  const lu = isObj(L?.levelsUpdatedAt) ? L.levelsUpdatedAt : {};
  const ru = isObj(R?.levelsUpdatedAt) ? R.levelsUpdatedAt : {};
  const levels = {};
  const stamps = {};
  for (const k of new Set([...Object.keys(lv), ...Object.keys(rv), ...Object.keys(lu), ...Object.keys(ru)])) {
    const a = lv[k];
    const b = rv[k];
    if (a === undefined && b === undefined) continue;
    const tl = ts(lu[k]);
    const tr = ts(ru[k]);
    let side;
    if (b === undefined) side = 'l';
    else if (a === undefined) side = 'r';
    else if (join) side = 'max';
    else if (Number.isFinite(tl) && Number.isFinite(tr)) side = tr > tl ? 'r' : tl > tr ? 'l' : 'max';
    else if (Number.isFinite(tr)) side = 'r';
    else if (Number.isFinite(tl)) side = 'l';
    else side = 'max';
    if (side === 'l') { levels[k] = a; if (lu[k]) stamps[k] = lu[k]; }
    else if (side === 'r') { levels[k] = b; if (ru[k]) stamps[k] = ru[k]; }
    else {
      levels[k] = Math.max(a, b);
      const s = maxIso(lu[k], ru[k], ts);
      if (s) stamps[k] = s;
    }
  }
  return { levels, stamps };
}

/** ownedEquipment per id (settings._equipmentAt); untracked ids: owned when owned on either side. */
export function mergeEquipment(ls, rs, { now = Date.now() } = {}) {
  const ts = stamper(now);
  const ol = Array.isArray(ls?.ownedEquipment) ? ls.ownedEquipment : [];
  const or = Array.isArray(rs?.ownedEquipment) ? rs.ownedEquipment : [];
  const el = isObj(ls?._equipmentAt) ? ls._equipmentAt : {};
  const er = isObj(rs?._equipmentAt) ? rs._equipmentAt : {};
  const L = new Set(ol);
  const R = new Set(or);
  const ids = [...new Set([...ol, ...or, ...Object.keys(el), ...Object.keys(er)])];
  const owned = ids.filter((id) => {
    const tl = ts(el[id]);
    const tr = ts(er[id]);
    if (Number.isFinite(tl) && Number.isFinite(tr)) return tr > tl ? R.has(id) : tl > tr ? L.has(id) : (L.has(id) || R.has(id));
    if (Number.isFinite(tr)) return R.has(id);
    if (Number.isFinite(tl)) return L.has(id);
    return L.has(id) || R.has(id);
  });
  const at = {};
  for (const id of ids) { const s = maxIso(el[id], er[id], ts); if (s) at[id] = s; }
  return { ownedEquipment: owned, equipmentAt: at };
}

/** Per-key last-write-wins over two objects with `_updatedAt` maps. */
function lwwKeys(lo, ro, { skip, ts, join }) {
  const out = {};
  const stamps = {};
  const lu = isObj(lo._updatedAt) ? lo._updatedAt : {};
  const ru = isObj(ro._updatedAt) ? ro._updatedAt : {};
  for (const k of new Set([...Object.keys(lo), ...Object.keys(ro)])) {
    if (skip.includes(k)) continue;
    const side = pick(lo[k], ro[k], ts(lu[k]), ts(ru[k]), join);
    out[k] = clone(side === 'r' ? ro[k] : lo[k]);
  }
  for (const k of new Set([...Object.keys(lu), ...Object.keys(ru)])) {
    const s = maxIso(lu[k], ru[k], ts);
    if (s) stamps[k] = s;
  }
  return { out, stamps };
}

/**
 * Merge the remote sync data into the local data (both migrated). Never mutates the inputs.
 * @param {import('../types.js').Data} local
 * @param {import('../types.js').Data} remote
 * @param {{now?: number, join?: boolean}} [o] join = this device has never synced before (adopts shared values
 *   for untracked settings, takes the max of levels)
 * @returns {import('../types.js').Data}
 */
export function mergeSync(local, remote, { now = Date.now(), join = false } = {}) {
  const ts = stamper(now);
  const base = mergeBackups(local, remote);
  const L = clone(local);
  const R = clone(remote);
  const ls = isObj(L.settings) ? L.settings : {};
  const rs = isObj(R.settings) ? R.settings : {};
  const lst = isObj(L.state) ? L.state : {};
  const rst = isObj(R.state) ? R.state : {};

  // sessions (mergeBackups already united them and removed tombstoned ids – re-pick conflicts by time)
  const remoteById = new Map((R.sessions || []).map((s) => [s.id, s]));
  const localById = new Map((L.sessions || []).map((s) => [s.id, s]));
  const sessions = base.sessions.map((s) => {
    const a = localById.get(s.id);
    const b = remoteById.get(s.id);
    return a && b ? pickSession(a, b, { now }) : s;
  }).sort((a, b) => (sessionTime(a) < sessionTime(b) ? -1 : sessionTime(a) > sessionTime(b) ? 1 : 0));

  // settings
  const S = lwwKeys(ls, rs, { skip: [...LOCAL_SETTINGS_KEYS, 'ownedEquipment'], ts, join });
  const eq = mergeEquipment(ls, rs, { now });
  const settings = {
    ...S.out,
    ownedEquipment: eq.ownedEquipment,
    _updatedAt: S.stamps,
    _equipmentAt: eq.equipmentAt,
    ...(isObj(ls.sync) ? { sync: clone(ls.sync) } : {}),
  };

  // state
  const T = lwwKeys(lst, rst, { skip: UNTRACKED_STATE_KEYS, ts, join });
  const lv = mergeLevels(lst, rst, { now, join });
  const state = {
    ...base.state,
    ...T.out,
    _updatedAt: T.stamps,
    exerciseLevels: lv.levels,
    levelsUpdatedAt: lv.stamps,
    activeSession: lst.activeSession ?? null,
    remoteActiveSession: lst.remoteActiveSession ?? null,
    droppedActiveSession: !!lst.droppedActiveSession,
  };
  if ('storageHintShown' in lst) state.storageHintShown = lst.storageHintShown; else delete state.storageHintShown;
  return { ...base, settings, state, sessions };
}

// ---- sync file envelope --------------------------------------------------------------------------

/** Top-level keys of the sync file that are not part of the app data. */
export const ENVELOPE_KEYS = ['app', 'syncFormat', 'deviceId', 'deviceName', 'syncedAt', 'rev', 'activeSessions', 'exportedAt'];

/** Split a parsed sync file into the backup data and the envelope meta. */
export function splitEnvelope(obj) {
  const data = {};
  const meta = {};
  for (const [k, v] of Object.entries(isObj(obj) ? obj : {})) (ENVELOPE_KEYS.includes(k) ? meta : data)[k] = v;
  return { data, meta };
}

/** The data part that goes into Drive: no device-local parts (sync config, running training, notices). */
export function toUploadData(data) {
  const d = clone(data);
  if (isObj(d.settings)) delete d.settings.sync;
  if (isObj(d.state)) {
    d.state.activeSession = null;
    d.state.remoteActiveSession = null;
    d.state.droppedActiveSession = false;
    delete d.state.storageHintShown;
  }
  return d;
}

/** Valid running-training entries of other devices `{deviceId: {deviceName, workoutName, startedAt, updatedAt}}`. */
export function nextActiveSessions(prev, { deviceId, deviceName, active, workoutName, now = Date.now() }) {
  const out = {};
  for (const [id, e] of Object.entries(isObj(prev) ? prev : {})) {
    if (id === deviceId || !isObj(e)) continue;
    const t = Date.parse(e.startedAt);
    if (!Number.isFinite(t) || now - t > REMOTE_ACTIVE_MAX_MS) continue;
    out[id] = { deviceName: String(e.deviceName || 'anderes Gerät'), workoutName: String(e.workoutName || ''), startedAt: e.startedAt, updatedAt: e.updatedAt ?? e.startedAt };
  }
  if (active && deviceId) {
    out[deviceId] = {
      deviceName: deviceName || 'anderes Gerät',
      workoutName: workoutName || '',
      startedAt: typeof active.startedAt === 'string' ? active.startedAt : new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
  }
  return out;
}

/** The most recent running training on ANOTHER device (< 12 h old) or null. */
export function remoteActiveFrom(map, deviceId, now = Date.now()) {
  let best = null;
  for (const [id, e] of Object.entries(isObj(map) ? map : {})) {
    if (id === deviceId || !isObj(e)) continue;
    const t = Date.parse(e.startedAt);
    if (!Number.isFinite(t) || now - t > REMOTE_ACTIVE_MAX_MS || t - now > MAX_FUTURE_SKEW_MS) continue;
    if (!best || t > Date.parse(best.startedAt)) best = { deviceName: String(e.deviceName || 'anderes Gerät'), workoutName: String(e.workoutName || ''), startedAt: e.startedAt };
  }
  return best;
}

/** Sync file content = backup envelope (export format) + device meta. */
export function buildEnvelope(data, { deviceId, deviceName, rev = 1, syncedAt = new Date().toISOString(), activeSessions = {} }) {
  return {
    ...toUploadData(data),
    exportedAt: syncedAt,
    app: 'PhysioBogen',
    syncFormat: SYNC_FORMAT,
    deviceId,
    deviceName,
    syncedAt,
    rev,
    activeSessions,
  };
}
