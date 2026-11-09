// v5.1 hardening (audit P0-1/P0-2/P0-3/P1-7/P2-3/P2-4/P2-8): store sanitize, corrupt-data copy, save failures,
// newer schema read-only, dayOf across midnight, validateBackup type checks.
process.env.TZ = 'Europe/Berlin';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { validateBackup, prepareImport } from '../js/util/export-import.js';
import { dayOf, streak } from '../js/logic/stats.js';

/** Map-backed storage with enumeration; `failOn(key)` makes setItem throw a QuotaExceededError. */
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  let fail = null;
  return {
    m,
    failOn(pred) { fail = pred; },
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (fail && fail(k, v)) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

const goodSession = (id, startedAt = '2026-11-01T10:00:00.000Z') => ({ id, status: 'done', startedAt, endedAt: startedAt, exercises: [] });
const goodActive = () => ({
  id: 'a1', workoutId: 'p1-a', status: 'active', startedAt: '2026-11-08T10:00:00.000Z',
  exercises: [{ exerciseId: 'quad-set', sets: [] }, { exerciseId: 'bridge', sets: [] }],
  cursor: { index: 1, set: 0, step: 'exercise' },
});
const stored = (patch) => JSON.stringify({ ...store.defaults(), ...patch });

beforeEach(() => store._setStorage(memStorage()));

// ---- sanitize ---------------------------------------------------------------------------------

test('sanitize/migrate: null or non-object parts → defaults, never null where objects/arrays are expected', () => {
  for (const bad of [null, 42, 'x', []]) {
    const d = store.migrate({ schemaVersion: 1, settings: bad, state: bad, sessions: bad });
    assert.equal(typeof d.settings, 'object');
    assert.ok(Array.isArray(d.settings.bands) && d.settings.bands.length === 6);
    assert.equal(d.settings.weeklyGoal, 3);
    assert.equal(d.state.phaseId, 'p1-basis');
    assert.deepEqual(d.sessions, []);
    assert.equal(d.state.activeSession, null);
  }
  const d = store.migrate({ settings: { painThresholds: null, profile: 'x', bands: null }, state: { records: null, badges: [], exerciseLevels: 'x', phaseHistory: null } });
  assert.deepEqual(d.settings.painThresholds, store.defaults().settings.painThresholds);
  assert.deepEqual(d.settings.profile, { weightKg: null });
  assert.equal(d.settings.bands.length, 6);
  assert.deepEqual(d.state.records, store.defaults().state.records);
  assert.deepEqual(d.state.badges, {});
  assert.deepEqual(d.state.exerciseLevels, {});
  assert.ok(Array.isArray(d.state.phaseHistory) && d.state.phaseHistory.length === 1);
});

test('sanitize: junk sessions are dropped, valid ones kept (incl. duplicates removed, exercises repaired)', () => {
  const d = store.migrate({
    settings: {}, state: {},
    sessions: [null, 5, 'x', [], {}, { id: 'no-date' }, { id: 7, startedAt: '2026-11-01T10:00:00Z' },
      { id: 'bad-date', startedAt: 'gestern' }, goodSession('ok1'), goodSession('ok1'),
      { id: 'ok2', date: '2026-11-02', exercises: 'kaputt' }, { id: 'ok3', endedAt: '2026-11-03T10:00:00Z' }],
  });
  assert.deepEqual(d.sessions.map((s) => s.id), ['ok1', 'ok2', 'ok3']);
  assert.deepEqual(d.sessions[1].exercises, []);
  assert.ok(store.lastSanitizeFixes().includes('sessions'));
});

test('sanitize: bad activeSession → null + state.droppedActiveSession', () => {
  const bads = [{}, [], 'x', 5, { ...goodActive(), exercises: [] }, { ...goodActive(), exercises: 'x' },
    { ...goodActive(), workoutId: null }, { ...goodActive(), cursor: null }, { ...goodActive(), cursor: { index: 5, set: 0, step: 'exercise' } },
    { ...goodActive(), cursor: { index: -1, set: 0, step: 'exercise' } }, { ...goodActive(), cursor: { index: 0, set: 0 } },
    { ...goodActive(), exercises: [null, {}] }];
  for (const a of bads) {
    const d = store.migrate({ settings: {}, state: { activeSession: a }, sessions: [] });
    assert.equal(d.state.activeSession, null, JSON.stringify(a));
    assert.equal(d.state.droppedActiveSession, true);
  }
  const ok = store.migrate({ settings: {}, state: { activeSession: goodActive() }, sessions: [] });
  assert.deepEqual(ok.state.activeSession, goodActive());
  assert.equal(ok.state.droppedActiveSession, false);
  assert.equal(store.validActiveSession(goodActive()), true);
});

test('sanitize: bands, ownedEquipment, customWorkouts', () => {
  let d = store.migrate({ settings: { bands: 'rot' }, state: { customWorkouts: {} }, sessions: [] });
  assert.equal(d.settings.bands.length, 6);
  assert.deepEqual(d.state.customWorkouts, []);
  d = store.migrate({ settings: { bands: [null, { id: 'red', label: 'Rot', kind: 'theraband', color: '#f00' }, { label: 'ohne id' }] }, state: { customWorkouts: [null, { id: 'cw1', name: 'X' }] }, sessions: [] });
  assert.deepEqual(d.settings.bands.map((b) => b.id), ['red']);
  assert.deepEqual(d.state.customWorkouts.map((w) => w.id), ['cw1']);
  d = store.migrate({ settings: { bands: [], ownedEquipment: 'sling' }, state: {}, sessions: [] });
  assert.equal(d.settings.bands.length, 6);
  assert.ok(Array.isArray(d.settings.ownedEquipment));
});

test('sanitize: xp finite ≥ 0, surgeryDate YYYY-MM-DD, numbers/enums repaired', () => {
  const xp = (v) => store.migrate({ settings: {}, state: { xp: v }, sessions: [] }).state.xp;
  assert.equal(xp(NaN), 0);
  assert.equal(xp(-5), 0);
  assert.equal(xp(null), 0);
  assert.equal(xp('abc'), 0);
  assert.equal(xp('120'), 120);
  assert.equal(xp(Infinity), 0);
  assert.equal(xp(250), 250);
  const sd = (v) => store.migrate({ settings: { surgeryDate: v }, state: {}, sessions: [] }).settings.surgeryDate;
  assert.equal(sd('2027-01-05'), '2027-01-05');
  assert.equal(sd('2027-02-31'), null);
  assert.equal(sd('05.01.2027'), null);
  assert.equal(sd(20270105), null);
  assert.equal(sd(null), null);
  const s = store.migrate({ settings: { weeklyGoal: 'viel', prepSeconds: 999, fontScale: null, voiceVolume: -1, theme: 'pink', operatedSide: 3, restDefault: 'x', prehabStart: 'irgendwann', painThresholds: { greenMax: 'x', yellowMax: 5 } }, state: {}, sessions: [] }).settings;
  assert.equal(s.weeklyGoal, 3);
  assert.equal(s.prepSeconds, 30);
  assert.equal(s.fontScale, 1);
  assert.equal(s.voiceVolume, 0);
  assert.equal(s.theme, 'system');
  assert.equal(s.operatedSide, 'left');
  assert.equal(s.restDefault, null);
  assert.match(s.prehabStart, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s.painThresholds.greenMax, 2);
  assert.equal(s.painThresholds.yellowMax, 5);
});

test('sanitize: clean data stays untouched (no fixes)', () => {
  const d = store.defaults();
  d.sessions = [goodSession('a')];
  d.state.activeSession = goodActive();
  const m = store.migrate(structuredClone(d));
  assert.deepEqual(store.lastSanitizeFixes(), []);
  assert.deepEqual(m.sessions, d.sessions);
  assert.deepEqual(m.state.activeSession, d.state.activeSession);
});

// ---- load(): corrupt / repaired / newer -----------------------------------------------------------

test('load: invalid JSON is copied to pt.v1.corrupt-<ISO> before defaults are written', () => {
  const mem = memStorage({ 'pt.v1': '{"settings": {kaputt' });
  store._setStorage(mem);
  const d = store.load();
  assert.equal(d.state.phaseId, 'p1-basis');
  const issues = store.loadIssues();
  assert.ok(issues.corrupt?.preserved);
  assert.match(issues.corrupt.key, /^pt\.v1\.corrupt-\d{4}-\d{2}-\d{2}T/);
  assert.equal(mem.getItem(issues.corrupt.key), '{"settings": {kaputt');
  assert.equal(store.readCorruptBackup(issues.corrupt.key), '{"settings": {kaputt');
  assert.equal(store.readCorruptBackup('pt.v1'), null); // only corrupt keys
  assert.doesNotThrow(() => JSON.parse(mem.getItem('pt.v1'))); // defaults written afterwards
  assert.equal(store.lastSaveOk(), true);
});

test('load: non-object JSON counts as corrupt; at most 2 copies are kept', () => {
  const mem = memStorage({ 'pt.v1.corrupt-2026-01-01T00:00:00.000Z': 'alt1', 'pt.v1.corrupt-2026-02-01T00:00:00.000Z': 'alt2' });
  mem.m.set('pt.v1', '[1,2,3]');
  store._setStorage(mem);
  store.load();
  const keys = store.corruptBackupKeys();
  assert.equal(keys.length, 2);
  assert.ok(!keys.includes('pt.v1.corrupt-2026-01-01T00:00:00.000Z'));
  assert.equal(mem.getItem(keys[1]), '[1,2,3]');
});

test('load: corrupt copy impossible (quota) → read-only, original untouched', () => {
  const mem = memStorage({ 'pt.v1': 'nicht json' });
  mem.failOn(() => true);
  store._setStorage(mem);
  store.load();
  const issues = store.loadIssues();
  assert.equal(issues.corrupt.preserved, false);
  assert.equal(store.isReadOnly(), true);
  mem.failOn(null);
  store.update((d) => { d.state.xp = 5; });
  assert.equal(mem.getItem('pt.v1'), 'nicht json');
});

test('load: structurally broken data is repaired and written back once', () => {
  const mem = memStorage({ 'pt.v1': stored({ settings: null, state: { ...store.defaults().state, activeSession: {}, xp: 'NaN' }, sessions: [null, goodSession('s1')] }) });
  store._setStorage(mem);
  const d = store.load();
  assert.equal(d.state.activeSession, null);
  assert.equal(d.state.droppedActiveSession, true);
  assert.equal(d.state.xp, 0);
  assert.deepEqual(d.sessions.map((s) => s.id), ['s1']);
  assert.ok(store.loadIssues().fixes.length > 0);
  const written = JSON.parse(mem.getItem('pt.v1'));
  assert.equal(written.state.activeSession, null);
  assert.ok(written.settings && typeof written.settings === 'object');
});

test('load: newer schemaVersion → read-only, nothing written, flag set', () => {
  const raw = stored({ schemaVersion: 99, sessions: [goodSession('x')] });
  const mem = memStorage({ 'pt.v1': raw });
  store._setStorage(mem);
  const d = store.load();
  assert.equal(d.sessions.length, 1);
  assert.equal(store.loadIssues().newerVersion, 99);
  assert.equal(store.isReadOnly(), true);
  let called = 0;
  store.onSaveError(() => { called += 1; });
  assert.equal(store.save(), false);
  store.update((x) => { x.state.xp = 77; });
  assert.equal(store.getState().xp, 77); // in memory only
  assert.equal(mem.getItem('pt.v1'), raw);
  assert.equal(store.lastSaveOk(), false);
  assert.equal(store.getLastSaveError().code, 'readonly');
  assert.equal(called, 0);
  assert.throws(() => store.importData(store.defaults()), /neueren App-Version/);
});

// ---- save failures ------------------------------------------------------------------------------

test('save: QuotaExceeded → returns false, lastSaveError, onSaveError; next update retries', () => {
  const mem = memStorage();
  store._setStorage(mem);
  store.load();
  const errors = [];
  const off = store.onSaveError((e) => errors.push(e));
  mem.failOn((k) => k === 'pt.v1');
  assert.equal(store.save(), false);
  assert.equal(store.lastSaveOk(), false);
  assert.equal(store.getLastSaveError().name, 'QuotaExceededError');
  store.update((d) => { d.state.xp = 10; });
  assert.equal(errors.length, 2);
  assert.equal(store.getState().xp, 10); // still in memory
  mem.failOn(null);
  store.update((d) => { d.state.xp = 11; });
  assert.equal(store.lastSaveOk(), true);
  assert.equal(store.getLastSaveError(), null);
  assert.equal(JSON.parse(mem.getItem('pt.v1')).state.xp, 11);
  off();
  mem.failOn(() => true);
  store.save();
  assert.equal(errors.length, 2); // unsubscribed
});

test('importData: save failure throws and keeps the previous data', () => {
  const mem = memStorage();
  store._setStorage(mem);
  store.load();
  store.update((d) => { d.state.xp = 3; });
  mem.failOn(() => true);
  const incoming = store.defaults();
  incoming.state.xp = 999;
  assert.throws(() => store.importData(incoming), /Speichern fehlgeschlagen/);
  assert.equal(store.getState().xp, 3);
});

test('usageBytes counts all keys; rawSnapshot returns pt.* raw strings', () => {
  const mem = memStorage({ other: 'x'.repeat(100) });
  store._setStorage(mem);
  store.load();
  const n = store.usageBytes();
  assert.ok(n >= 100 + mem.getItem('pt.v1').length);
  const snap = store.rawSnapshot();
  assert.deepEqual(Object.keys(snap), ['pt.v1']);
  assert.equal(snap['pt.v1'], mem.getItem('pt.v1'));
});

test('reloadFromStorage: picks up changes of another context and notifies', () => {
  const mem = memStorage();
  store._setStorage(mem);
  store.load();
  let seen = 0;
  let ext = null;
  const off1 = store.subscribe(() => { seen += 1; });
  const off2 = store.onExternalChange((d, info) => { ext = info; });
  const other = store.defaults();
  other.state.xp = 42;
  mem.m.set('pt.v1', JSON.stringify(other));
  assert.equal(store.reloadFromStorage(), true);
  assert.equal(store.getState().xp, 42);
  assert.equal(seen, 1);
  assert.deepEqual(ext, { hadActiveSession: false });
  mem.m.set('pt.v1', '{kaputt');
  assert.equal(store.reloadFromStorage(), false);
  assert.equal(store.getState().xp, 42);
  off1(); off2();
});

// ---- validateBackup type checks (P1-7) -----------------------------------------------------------

test('validateBackup: rejects wrong container types, repairs scalars via sanitize', () => {
  const b = () => ({ ...store.defaults(), sessions: [goodSession('a')] });
  assert.equal(validateBackup(b()).ok, true);
  assert.match(validateBackup({ ...b(), settings: { ...b().settings, bands: 'x' } }).errors.join(), /Bänder/);
  assert.match(validateBackup({ ...b(), state: { ...b().state, customWorkouts: 5 } }).errors.join(), /Eigene Workouts/);
  assert.match(validateBackup({ ...b(), state: { ...b().state, activeSession: 'x' } }).errors.join(), /Laufendes Training/);
  assert.match(validateBackup({ ...b(), state: { ...b().state, badges: [] } }).errors.join(), /beschädigt/);
  assert.match(validateBackup({ ...b(), sessions: [{ id: 'x', startedAt: 'nie' }] }).errors.join(), /kein gültiges Datum/);
  assert.match(validateBackup({ ...b(), sessions: [{ ...goodSession('x'), exercises: 'x' }] }).errors.join(), /beschädigt/);
  // scalar junk is accepted and repaired
  const junk = b();
  junk.settings.weeklyGoal = 'abc';
  junk.state.xp = '12';
  junk.settings.surgeryDate = '31.12.';
  const out = prepareImport(JSON.stringify(junk), store.defaults());
  assert.equal(out.settings.weeklyGoal, 3);
  assert.equal(out.state.xp, 12);
  assert.equal(out.settings.surgeryDate, null);
});

// ---- dayOf across midnight (P2-3) -------------------------------------------------------------

test('dayOf/streak: a session crossing midnight counts for its start day', () => {
  const s = { id: 'm', status: 'done', startedAt: '2026-11-04T22:40:00.000Z', endedAt: '2026-11-04T23:20:00.000Z', exercises: [] }; // 23:40 → 00:20 CET
  assert.equal(dayOf(s), '2026-11-04');
  assert.equal(typeof streak, 'function');
});
