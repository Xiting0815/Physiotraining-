import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { backupFilename, parseBackup, validateBackup, migrateBackup, mergeBackups, prepareImport } from '../js/util/export-import.js';

const sess = (id, startedAt, extra = {}) => ({ id, status: 'done', startedAt, endedAt: startedAt, exercises: [], nextDay: null, traffic: { provisional: 'green', final: null }, ...extra });
const backup = (sessions = [], state = {}, extra = {}) => {
  const d = store.defaults();
  return { ...d, state: { ...d.state, ...state }, sessions, exportedAt: '2026-11-01T10:00:00.000Z', ...extra };
};

test('backupFilename', () => {
  assert.equal(backupFilename('2026-10-31'), 'physio-backup-2026-10-31.json');
  assert.match(backupFilename(), /^physio-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

test('parseBackup: JSON string, object passthrough, invalid JSON German error', () => {
  assert.deepEqual(parseBackup('{"a":1}'), { a: 1 });
  const o = { a: 1 };
  assert.equal(parseBackup(o), o);
  assert.throws(() => parseBackup('{nope'), /kein gültiges JSON/);
});

test('validateBackup: shape, session ids, schemaVersion', () => {
  assert.equal(validateBackup(backup()).ok, true);
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup([]).ok, false);
  assert.match(validateBackup({ settings: {}, state: {} }).errors.join(), /Trainingsverlauf/);
  assert.match(validateBackup({ ...backup(), settings: null }).errors.join(), /Einstellungen/);
  assert.match(validateBackup(backup([{ status: 'done' }])).errors.join(), /keine gültige ID/);
  assert.match(validateBackup(backup([sess('a', 'x'), sess('a', 'y')])).errors.join(), /doppelt/);
  assert.match(validateBackup(backup([], {}, { schemaVersion: 99 })).errors.join(), /neueren/);
  assert.match(validateBackup(backup([], {}, { schemaVersion: 0 })).errors.join(), /Unbekannte/);
  const noVer = backup(); delete noVer.schemaVersion;
  assert.equal(validateBackup(noVer).ok, true);
});

test('migrateBackup: strips exportedAt, fills defaults, does not mutate input', () => {
  const b = backup([sess('a', '2026-10-31T10:00:00.000Z')]);
  delete b.settings.painThresholds;
  delete b.schemaVersion;
  const m = migrateBackup(b);
  assert.equal(m.schemaVersion, store.SCHEMA_VERSION);
  assert.equal('exportedAt' in m, false);
  assert.deepEqual(m.settings.painThresholds, { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 });
  assert.equal(b.exportedAt, '2026-11-01T10:00:00.000Z');
  assert.throws(() => migrateBackup({ ...backup(), schemaVersion: 5 }), /neueren/);
});

test('migrateBackup: runs migration chain with custom migrations', () => {
  const migrations = {
    1: (d) => ({ ...d, settings: { ...d.settings, renamed: true } }),
    2: (d) => { d.state.extra = 'v3'; },
  };
  const m = migrateBackup({ schemaVersion: 1, settings: {}, state: {}, sessions: [] }, { migrations, target: 3 });
  assert.equal(m.schemaVersion, 3);
  assert.equal(m.settings.renamed, true);
  assert.equal(m.state.extra, 'v3');
  assert.throws(() => migrateBackup({ schemaVersion: 1, settings: {}, state: {}, sessions: [] }, { migrations: {}, target: 2 }), /Keine Migration von Version 1/);
});

test('mergeBackups: union by session id, sorted, next-day completeness wins, state merge', () => {
  const cur = backup([sess('a', '2026-10-30T10:00:00.000Z'), sess('b', '2026-11-02T10:00:00.000Z')],
    { xp: 100, exerciseLevels: { q: 1, s: 2 }, badges: { 'first-session': '2026-10-30T11:00:00.000Z' }, exitCriteriaDone: { p1: [0] }, nextWorkoutId: 'p1-c',
      records: { longestHold: { seconds: 10 }, mostReps: null, strongestBand: { band: 'red', rank: 1 } } });
  const inc = backup([sess('a', '2026-10-30T10:00:00.000Z', { nextDay: { pain: 1 } }), sess('b', '2026-11-02T10:00:00.000Z', { note: 'incoming' }), sess('c', '2026-10-28T10:00:00.000Z')],
    { xp: 300, exerciseLevels: { q: 2, s: 0, t: 1 }, badges: { 'first-session': '2026-10-28T11:00:00.000Z', 'week-3': '2026-10-29T00:00:00.000Z' }, exitCriteriaDone: { p1: [1], p2: [0] }, nextWorkoutId: 'p1-a',
      records: { longestHold: { seconds: 20 }, mostReps: { reps: 5 }, strongestBand: { band: 'yellow', rank: 0 } } });
  const m = mergeBackups(store.migrate(structuredClone(cur)), store.migrate(structuredClone(inc)));
  assert.deepEqual(m.sessions.map((s) => s.id), ['c', 'a', 'b']);
  assert.deepEqual(m.sessions.find((s) => s.id === 'a').nextDay, { pain: 1 });
  assert.equal(m.sessions.find((s) => s.id === 'b').note, undefined);
  assert.equal(m.state.xp, 300);
  assert.deepEqual(m.state.exerciseLevels, { q: 2, s: 2, t: 1 });
  assert.equal(m.state.badges['first-session'], '2026-10-28T11:00:00.000Z');
  assert.ok(m.state.badges['week-3']);
  assert.deepEqual(m.state.exitCriteriaDone, { p1: [0, 1], p2: [0] });
  assert.equal(m.state.nextWorkoutId, 'p1-c');
  assert.deepEqual(m.state.records, { longestHold: { seconds: 20 }, mostReps: { reps: 5 }, strongestBand: { band: 'red', rank: 1 } });
});

test('prepareImport: replace vs merge, errors propagate', () => {
  const current = store.migrate(structuredClone(backup([sess('a', '2026-10-30T10:00:00.000Z')], { xp: 50 })));
  const incoming = JSON.stringify(backup([sess('b', '2026-11-01T10:00:00.000Z')], { xp: 10 }));
  const rep = prepareImport(incoming, current);
  assert.deepEqual(rep.sessions.map((s) => s.id), ['b']);
  assert.equal(rep.state.xp, 10);
  const mer = prepareImport(incoming, current, { mode: 'merge' });
  assert.deepEqual(mer.sessions.map((s) => s.id), ['a', 'b']);
  assert.equal(mer.state.xp, 50);
  assert.throws(() => prepareImport('{bad', current), /JSON/);
  assert.throws(() => prepareImport('{"a":1}', current), /fehl/);
});

test('prepareImport result is accepted by store.importData (round trip)', () => {
  const mem = new Map();
  store._setStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
  store.load();
  store.update((d) => { d.sessions.push(sess('x', '2026-10-30T10:00:00.000Z')); });
  const text = store.exportData();
  store.reset();
  store.importData(prepareImport(text, store.get(), { mode: 'merge' }));
  assert.deepEqual(store.getSessions().map((s) => s.id), ['x']);
  store.importData(prepareImport(JSON.stringify(backup([])), store.get(), { mode: 'replace' }));
  assert.equal(store.getSessions().length, 0);
});
