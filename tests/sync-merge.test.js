// v5.2 (SPEC §17): change tracking in store.update + two-device merge for the Google-Drive sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults, migrate, trackChanges, update, get, _setStorage, _setNow, onLocalChange, applySync, setClockOffset, nowISO,
  sanitize,
} from '../js/store.js';
import { deleteSession } from '../js/views/history.js';
import {
  mergeSync, mergeLevels, mergeEquipment, pickSession, buildEnvelope, splitEnvelope, toUploadData,
  nextActiveSessions, remoteActiveFrom,
} from '../js/sync/merge.js';
import { mergeBackups, mergeTombstones } from '../js/util/export-import.js';

const T0 = Date.parse('2026-11-10T08:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const min = 60e3;
const day = 864e5;

const sess = (id, startMs, extra = {}) => ({
  id, workoutId: 'p1-a', kind: 'strength', status: 'done', startedAt: iso(startMs), endedAt: iso(startMs + 20 * min),
  exercises: [], xpEarned: 10, nextDay: null, ...extra,
});

/** A migrated data set with optional overrides. */
function data({ settings = {}, state = {}, sessions = [] } = {}) {
  const d = migrate(defaults());
  Object.assign(d.settings, settings);
  Object.assign(d.state, state);
  d.sessions = sessions;
  return d;
}

/* ---------------- store: change tracking ---------------- */

test('trackChanges: settings keys get _updatedAt, sync/bookkeeping keys never', () => {
  const before = data();
  const after = structuredClone(before);
  after.settings.weeklyGoal = 4;
  after.settings.sync = { ...after.settings.sync, lastSyncAt: iso(T0) };
  const info = trackChanges(before, after, iso(T0));
  assert.equal(after.settings._updatedAt.weeklyGoal, iso(T0));
  assert.ok(!('sync' in after.settings._updatedAt));
  assert.ok(info.relevant);
  assert.deepEqual(info.kinds, ['settings']);

  const only = structuredClone(after);
  only.settings.sync = { ...only.settings.sync, deviceName: 'Tablet' };
  only.state.remoteActiveSession = { deviceName: 'Handy', workoutName: 'A', startedAt: iso(T0) };
  const info2 = trackChanges(after, only, iso(T0 + min));
  assert.equal(info2.relevant, false, 'sync-only changes do not start a sync');
});

test('trackChanges: equipment per id, levels per exercise, phase/nextWorkout per key', () => {
  const before = data({ settings: { ownedEquipment: ['sling-trainer'] } });
  const after = structuredClone(before);
  after.settings.ownedEquipment = ['door-anchor'];
  after.state.exerciseLevels = { squat: 2 };
  after.state.phaseId = 'p2-aufbau';
  trackChanges(before, after, iso(T0));
  assert.deepEqual(Object.keys(after.settings._equipmentAt).sort(), ['door-anchor', 'sling-trainer']);
  assert.equal(after.state.levelsUpdatedAt.squat, iso(T0));
  assert.equal(after.state._updatedAt.phaseId, iso(T0));
  assert.ok(!('nextWorkoutId' in after.state._updatedAt));
  assert.ok(!('activeSession' in after.state._updatedAt));
});

test('trackChanges: deleted sessions / custom workouts become tombstones, edits get updatedAt', () => {
  const before = data({
    sessions: [sess('s1', T0), sess('s2', T0 + day)],
    state: { customWorkouts: [{ id: 'cw-1', name: 'X', updatedAt: iso(T0) }, { id: 'cw-2', name: 'Y', updatedAt: iso(T0) }] },
  });
  const after = structuredClone(before);
  after.sessions = [after.sessions[1]];
  after.sessions[0].note = 'leicht';
  after.state.customWorkouts = [after.state.customWorkouts[0]];
  after.state.customWorkouts[0].name = 'X2';
  const info = trackChanges(before, after, iso(T0 + 2 * day));
  assert.deepEqual(after.state.deletedSessionIds, [{ id: 's1', at: iso(T0 + 2 * day) }]);
  assert.deepEqual(after.state.deletedCustomWorkoutIds, [{ id: 'cw-2', at: iso(T0 + 2 * day) }]);
  assert.equal(after.sessions[0].updatedAt, iso(T0 + 2 * day));
  assert.equal(after.state.customWorkouts[0].updatedAt, iso(T0 + 2 * day));
  assert.ok(info.kinds.includes('sessions') && info.kinds.includes('custom'));
});

test('trackChanges: finishing a session and a next-day check-in are flagged', () => {
  const active = { ...sess('s9', T0), status: 'active', endedAt: null, cursor: { index: 0, set: 0, step: 'pre' }, exercises: [{ exerciseId: 'x' }] };
  const before = data({ state: { activeSession: active } });
  const after = structuredClone(before);
  after.sessions.push({ ...active, status: 'done', endedAt: iso(T0 + 20 * min) });
  after.state.activeSession = null;
  assert.ok(trackChanges(before, after, iso(T0)).kinds.includes('finish'));
  const nd = structuredClone(after);
  nd.sessions[0].nextDay = { pain: 1, at: iso(T0 + day) };
  assert.ok(trackChanges(after, nd, iso(T0 + day)).kinds.includes('nextDay'));
});

test('store.update: deleting a session in the history writes a tombstone; onLocalChange only for real changes', () => {
  _setStorage(null);
  _setNow(() => T0);
  try {
    update((d) => { d.sessions.push(sess('s1', T0 - day)); });
    const calls = [];
    const off = onLocalChange((_, info) => calls.push(info.kinds));
    update((d) => deleteSession(d, 's1'));
    assert.deepEqual(get().state.deletedSessionIds.map((t) => t.id), ['s1']);
    update((d) => { d.settings.sync = { ...d.settings.sync, deviceName: 'Handy' }; });
    assert.equal(calls.length, 1, 'sync config change does not count');
    const merged = structuredClone(get());
    merged.settings.weeklyGoal = 6;
    assert.ok(applySync(merged));
    assert.equal(calls.length, 1, 'applySync never triggers onLocalChange');
    assert.equal(get().settings.weeklyGoal, 6);
    off();
  } finally { _setNow(null); _setStorage(null); }
});

test('store clock: server offset corrects the timestamps', () => {
  _setNow(() => T0);
  try {
    setClockOffset(10 * min); // device clock 10 min behind Google
    assert.equal(nowISO(), iso(T0 + 10 * min));
  } finally { setClockOffset(0); _setNow(null); }
});

test('sanitize: broken sync bookkeeping is repaired', () => {
  const d = sanitize({ settings: { _updatedAt: { a: 'nope', b: iso(T0) }, sync: 5 }, state: { deletedSessionIds: [{ id: 's' }, { id: 't', at: iso(T0) }, 3], levelsUpdatedAt: [] }, sessions: [] });
  assert.deepEqual(d.settings._updatedAt, { b: iso(T0) });
  assert.ok(!('sync' in d.settings));
  assert.deepEqual(d.state.deletedSessionIds, [{ id: 't', at: iso(T0) }]);
  assert.deepEqual(d.state.levelsUpdatedAt, {});
});

/* ---------------- merge: two devices ---------------- */

test('sessions: two devices training alternately end up with the union (sorted)', () => {
  const phone = data({ sessions: [sess('a1', T0), sess('a2', T0 + 2 * day)] });
  const tablet = data({ sessions: [sess('b1', T0 + day), sess('a1', T0)] });
  const onPhone = mergeSync(phone, tablet, { now: T0 + 3 * day });
  const onTablet = mergeSync(tablet, phone, { now: T0 + 3 * day });
  assert.deepEqual(onPhone.sessions.map((s) => s.id), ['a1', 'b1', 'a2']);
  assert.deepEqual(onTablet.sessions.map((s) => s.id), ['a1', 'b1', 'a2']);
});

test('sessions: deletions propagate via tombstones and are not resurrected by the other device', () => {
  const tomb = { id: 'a1', at: iso(T0 + 2 * day) };
  const phone = data({ sessions: [sess('a2', T0 + day)], state: { deletedSessionIds: [tomb] } });
  const tablet = data({ sessions: [sess('a1', T0), sess('a2', T0 + day)] });
  const onTablet = mergeSync(tablet, phone, { now: T0 + 3 * day });
  assert.deepEqual(onTablet.sessions.map((s) => s.id), ['a2']);
  assert.deepEqual(onTablet.state.deletedSessionIds, [tomb], 'tombstone travels on');
  const back = mergeSync(phone, onTablet, { now: T0 + 3 * day });
  assert.deepEqual(back.sessions.map((s) => s.id), ['a2']);
  // also an old export imported with „Zusammenführen“ does not bring it back
  assert.deepEqual(mergeBackups(onTablet, tablet).sessions.map((s) => s.id), ['a2']);
});

test('tombstones expire after 90 days', () => {
  const old = { id: 'x', at: iso(T0 - 91 * day) };
  const fresh = { id: 'y', at: iso(T0 - 89 * day) };
  assert.deepEqual(mergeTombstones([old], [fresh], { now: T0 }), [fresh]);
  assert.deepEqual(mergeTombstones([{ id: 'y', at: iso(T0 - 100 * day) }], [fresh], { now: T0 }), [fresh]);
});

test('sessions: newer edit wins, a next-day check-in is never lost', () => {
  const base = sess('s', T0);
  const withNd = { ...base, nextDay: { pain: 1 }, updatedAt: iso(T0 + day) };
  const edited = { ...base, note: 'Knie ok', updatedAt: iso(T0 + 2 * day) };
  const w = pickSession(withNd, edited, { now: T0 + 3 * day });
  assert.equal(w.note, 'Knie ok');
  assert.deepEqual(w.nextDay, { pain: 1 });
  assert.deepEqual(pickSession(base, { ...base, nextDay: { pain: 2 } }, { now: T0 + day }).nextDay, { pain: 2 }, 'tie → the one with next-day check');
});

test('custom workouts: newer updatedAt wins, deletions propagate', () => {
  const a = data({ state: { customWorkouts: [{ id: 'cw-1', name: 'Alt', createdAt: iso(T0), updatedAt: iso(T0) }, { id: 'cw-2', name: 'Weg', createdAt: iso(T0), updatedAt: iso(T0) }] } });
  const b = data({ state: { customWorkouts: [{ id: 'cw-1', name: 'Neu', createdAt: iso(T0), updatedAt: iso(T0 + day) }], deletedCustomWorkoutIds: [{ id: 'cw-2', at: iso(T0 + day) }] } });
  const m = mergeSync(a, b, { now: T0 + 2 * day });
  assert.deepEqual(m.state.customWorkouts.map((w) => w.name), ['Neu']);
});

test('levels: concurrent changes – the newer explicit change wins, also a regress', () => {
  const phone = { exerciseLevels: { squat: 3, bridge: 2 }, levelsUpdatedAt: { squat: iso(T0 + 2 * day), bridge: iso(T0) } };
  const tablet = { exerciseLevels: { squat: 4, bridge: 3 }, levelsUpdatedAt: { squat: iso(T0 + day), bridge: iso(T0 + day) } };
  const r = mergeLevels(phone, tablet, { now: T0 + 3 * day });
  assert.equal(r.levels.squat, 3, 'regress on the phone (newer) beats the older progress on the tablet');
  assert.equal(r.levels.bridge, 3, 'newer progress on the tablet');
  assert.equal(r.stamps.squat, iso(T0 + 2 * day));
});

test('levels: without timestamps (data before v5.2) and on the first sync of a device → max', () => {
  assert.equal(mergeLevels({ exerciseLevels: { s: 2 } }, { exerciseLevels: { s: 5 } }).levels.s, 5);
  const joinR = mergeLevels(
    { exerciseLevels: { s: 6 } },
    { exerciseLevels: { s: 2 }, levelsUpdatedAt: { s: iso(T0) } },
    { now: T0 + day, join: true },
  );
  assert.equal(joinR.levels.s, 6, 'joining device keeps its higher legacy level');
  const afterJoin = mergeLevels(
    { exerciseLevels: { s: 6 } },
    { exerciseLevels: { s: 5 }, levelsUpdatedAt: { s: iso(T0) } },
    { now: T0 + day },
  );
  assert.equal(afterJoin.levels.s, 5, 'later: an explicit (stamped) change beats an untracked value');
});

test('clock skew: small skews keep the order, far-future timestamps of a wrong clock do not win', () => {
  // tablet clock 3 min behind: its change at real time T0+10min is stamped T0+7min – still after the phone's T0
  const phone = { exerciseLevels: { s: 4 }, levelsUpdatedAt: { s: iso(T0) } };
  const tablet = { exerciseLevels: { s: 3 }, levelsUpdatedAt: { s: iso(T0 + 7 * min) } };
  assert.equal(mergeLevels(phone, tablet, { now: T0 + 10 * min }).levels.s, 3);
  // remote clock 2 min ahead – within the tolerance, still counts
  const ahead = { exerciseLevels: { s: 1 }, levelsUpdatedAt: { s: iso(T0 + 12 * min) } };
  assert.equal(mergeLevels(phone, ahead, { now: T0 + 10 * min }).levels.s, 1);
  // a clock one year ahead is ignored → the local stamped change wins
  const broken = { exerciseLevels: { s: 9 }, levelsUpdatedAt: { s: '2027-11-10T08:00:00.000Z' } };
  assert.equal(mergeLevels(phone, broken, { now: T0 + 10 * min }).levels.s, 4);
  const a = data({ settings: { theme: 'dark', _updatedAt: { theme: iso(T0) } } });
  const b = data({ settings: { theme: 'light', _updatedAt: { theme: '2030-01-01T00:00:00.000Z' } } });
  assert.equal(mergeSync(a, b, { now: T0 + min }).settings.theme, 'dark');
});

test('settings: per-key last-write-wins; the sync config always stays local', () => {
  const phone = data({ settings: { weeklyGoal: 4, theme: 'dark', _updatedAt: { weeklyGoal: iso(T0 + day), theme: iso(T0) }, sync: { enabled: true, deviceId: 'dev-p', deviceName: 'Handy', clientId: 'x.apps.googleusercontent.com' } } });
  const tablet = data({ settings: { weeklyGoal: 2, theme: 'light', _updatedAt: { weeklyGoal: iso(T0), theme: iso(T0 + 2 * day) }, sync: { enabled: true, deviceId: 'dev-t', deviceName: 'Tablet' } } });
  const m = mergeSync(phone, tablet, { now: T0 + 3 * day });
  assert.equal(m.settings.weeklyGoal, 4);
  assert.equal(m.settings.theme, 'light');
  assert.equal(m.settings.sync.deviceId, 'dev-p');
  assert.equal(m.settings._updatedAt.theme, iso(T0 + 2 * day));
});

test('settings: untracked values – local wins, a joining device adopts the shared value, null never wins', () => {
  const local = data({ settings: { weeklyGoal: 5, surgeryDate: null } });
  const remote = data({ settings: { weeklyGoal: 3, surgeryDate: '2027-01-05' } });
  assert.equal(mergeSync(local, remote).settings.weeklyGoal, 5);
  assert.equal(mergeSync(local, remote).settings.surgeryDate, '2027-01-05');
  assert.equal(mergeSync(local, remote, { join: true }).settings.weeklyGoal, 3);
});

test('equipment: per id last-write-wins', () => {
  const phone = { ownedEquipment: ['sling-trainer'], _equipmentAt: { 'sling-trainer': iso(T0) } };
  const tablet = { ownedEquipment: ['door-anchor'], _equipmentAt: { 'door-anchor': iso(T0 + day), 'sling-trainer': iso(T0 + 2 * day) } };
  const r = mergeEquipment(phone, tablet, { now: T0 + 3 * day });
  assert.deepEqual(r.ownedEquipment.sort(), ['door-anchor'], 'sling unticked later on the tablet, door anchor added');
  assert.deepEqual(mergeEquipment({ ownedEquipment: ['a'] }, { ownedEquipment: ['b'] }).ownedEquipment, ['a', 'b'], 'untracked → union');
});

test('state: phaseId / nextWorkoutId newer wins; xp max; badges union', () => {
  const phone = data({ state: { phaseId: 'p2-aufbau', nextWorkoutId: 'p2-b', xp: 120, badges: { first: iso(T0) }, _updatedAt: { phaseId: iso(T0 + day), nextWorkoutId: iso(T0) } } });
  const tablet = data({ state: { phaseId: 'p1-basis', nextWorkoutId: 'p1-a', xp: 150, badges: { streak3: iso(T0 + day) }, _updatedAt: { phaseId: iso(T0), nextWorkoutId: iso(T0 + 2 * day) } } });
  const m = mergeSync(phone, tablet, { now: T0 + 3 * day });
  assert.equal(m.state.phaseId, 'p2-aufbau');
  assert.equal(m.state.nextWorkoutId, 'p1-a');
  assert.equal(m.state.xp, 150);
  assert.deepEqual(Object.keys(m.state.badges).sort(), ['first', 'streak3']);
});

test('activeSession: never taken from the other device', () => {
  const remoteActive = { id: 'r', workoutId: 'p1-a', status: 'active', startedAt: iso(T0), cursor: { index: 0, set: 0, step: 'pre' }, exercises: [{}] };
  const m = mergeSync(data(), data({ state: { activeSession: remoteActive } }), { now: T0 });
  assert.equal(m.state.activeSession, null);
  const mine = { ...remoteActive, id: 'mine' };
  assert.equal(mergeSync(data({ state: { activeSession: mine } }), data({ state: { activeSession: remoteActive } }), { now: T0 }).state.activeSession.id, 'mine');
});

/* ---------------- envelope ---------------- */

test('envelope: upload strips device-local parts; split restores data + meta', () => {
  const d = data({ state: { activeSession: { id: 'x' }, remoteActiveSession: { deviceName: 'T' } }, settings: { sync: { enabled: true, clientId: 'c' } } });
  const env = buildEnvelope(d, { deviceId: 'dev-p', deviceName: 'Handy', rev: 3, syncedAt: iso(T0), activeSessions: {} });
  assert.equal(env.state.activeSession, null);
  assert.equal(env.state.remoteActiveSession, null);
  assert.ok(!('sync' in env.settings));
  assert.equal(env.rev, 3);
  assert.equal(env.exportedAt, iso(T0));
  const { data: back, meta } = splitEnvelope(env);
  assert.deepEqual(Object.keys(meta).sort(), ['activeSessions', 'app', 'deviceId', 'deviceName', 'exportedAt', 'rev', 'syncFormat', 'syncedAt']);
  assert.ok(!('deviceId' in back));
  assert.deepEqual(toUploadData(d).sessions, d.sessions);
});

test('active sessions in the envelope: own entry set/removed, others kept, older than 12 h dropped', () => {
  const prev = {
    'dev-t': { deviceName: 'Tablet', workoutName: 'Kraft A', startedAt: iso(T0 - 30 * min) },
    'dev-old': { deviceName: 'Alt', startedAt: iso(T0 - 13 * 3600e3) },
    'dev-p': { deviceName: 'Handy', startedAt: iso(T0 - 60 * min) },
  };
  const next = nextActiveSessions(prev, { deviceId: 'dev-p', deviceName: 'Handy', active: null, now: T0 });
  assert.deepEqual(Object.keys(next), ['dev-t']);
  const withMine = nextActiveSessions(prev, { deviceId: 'dev-p', deviceName: 'Handy', active: { startedAt: iso(T0) }, workoutName: 'Kurz', now: T0 });
  assert.equal(withMine['dev-p'].workoutName, 'Kurz');
  assert.deepEqual(remoteActiveFrom(withMine, 'dev-p', T0), { deviceName: 'Tablet', workoutName: 'Kraft A', startedAt: iso(T0 - 30 * min) });
  assert.equal(remoteActiveFrom(withMine, 'dev-t', T0 + 13 * 3600e3), null, '> 12 h → no longer shown');
});

test('import (replace) keeps this device’s sync connection, never the one from the backup', async () => {
  const store = await import('../js/store.js?import-sync');
  store._setStorage(null);
  store.load();
  store.update((d) => { d.settings.sync = { ...d.settings.sync, enabled: true, deviceId: 'dev-tablet', deviceName: 'Tablet' }; });
  const backup = JSON.parse(store.exportData());
  backup.settings.sync = { enabled: true, deviceId: 'dev-phone', deviceName: 'Handy', clientId: 'x.apps.googleusercontent.com' };
  store.importData(backup);
  assert.equal(store.get().settings.sync.deviceId, 'dev-tablet');
  assert.equal(store.get().settings.sync.deviceName, 'Tablet');
});
