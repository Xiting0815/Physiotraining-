// WP-3 hardening: defensive rendering on junk data, duration formatting, Heute with an active session,
// pain-chart x-domain, welcome step „Ausrüstung“. Pure / fake-DOM, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeData, fmtDuration, fmtMinutes, humanSeconds, show, num, isISODay, shortDate, monthTitle, fmtDistance } from '../js/views/ui.js';
import { chartFrom } from '../js/views/history.js';
import { pendingRecommendations } from '../js/views/today.js';
import { progressRing, xpBar } from '../js/components/charts.js';
import { corruptLabel } from '../js/views/settings.js';
import { defaults } from '../js/store.js';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const content = {
  exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases,
  badges: load('badges').badges, quotes: [], equipment: null, poses: { segments: {}, poses: {} },
};
const BAD = /NaN|undefined|Infinity|Invalid Date|\[object/;

const junk = () => {
  const d = defaults();
  d.sessions = [null, 42, 'x', {}, { status: 'done' },
    { status: 'done', startedAt: 'garbage', workoutId: 'nope' },
    { id: 'j1', status: 'done', startedAt: '2026-11-05T18:00:00.000Z', endedAt: 'nope', workoutId: 'ghost-workout',
      exercises: [null, { exerciseId: 'ghost', sets: [null, { done: true, seconds: 'x' }] }], traffic: null, rowing: { distanceM: 'abc' },
      pre: { pain: 'x' }, post: { pain: null }, recommendations: [null, { action: 'progress', status: 'pending' }] }];
  d.settings.weeklyGoal = 'abc'; d.settings.bands = null; d.settings.painThresholds = null; d.settings.surgeryDate = 'bad-date';
  d.state.badges = { unknown: 'x' }; d.state.xp = 'NaN'; d.state.customWorkouts = [null, { id: 'cw-x', name: null, blocks: null }];
  return d;
};

test('safeData: drops junk sessions, guarantees shapes, falls back to defaults', () => {
  const s = safeData(junk());
  assert.equal(s.sessions.length, 1);
  const [x] = s.sessions;
  assert.deepEqual(x.exercises.length, 1);
  assert.equal(x.exercises[0].sets.length, 1);
  assert.equal(x.exercises[0].sets[0].seconds, null);
  assert.equal(x.endedAt, null);
  assert.equal(x.pre.pain, null);
  assert.deepEqual(x.traffic, { provisional: null, final: null, reasons: [] });
  assert.deepEqual(x.rowing, {});
  assert.equal(s.settings.weeklyGoal, 3);
  assert.ok(Array.isArray(s.settings.bands) && s.settings.bands.length === 6);
  assert.equal(s.settings.painThresholds.greenMax, 2);
  assert.equal(s.settings.surgeryDate, null);
  assert.equal(s.state.xp, 0);
  assert.deepEqual(s.state.badges, {});
  assert.equal(s.state.customWorkouts.length, 1);
  assert.equal(s.state.customWorkouts[0].name, 'Eigenes Workout');
  assert.deepEqual(s.state.customWorkouts[0].blocks, []);
  // memoised & never mutating the source
  const src = junk();
  assert.equal(safeData(src), safeData(src));
  assert.equal(src.sessions[0], null);
  assert.doesNotThrow(() => safeData(null));
  assert.doesNotThrow(() => safeData({ settings: 5, state: 'x', sessions: {} }));
});

test('durations: < 1 h „21 min“, ≥ 1 h „1 h 05 min“, junk „–“', () => {
  assert.equal(fmtDuration(1260), '21 min');
  assert.equal(fmtDuration(45), '45 s');
  assert.equal(fmtDuration(3900), '1 h 05 min');
  assert.equal(fmtDuration(NaN), '–');
  assert.equal(fmtDuration(null), '–');
  assert.equal(fmtDuration('x'), '–');
  assert.equal(fmtMinutes(31), '31 min');
  assert.equal(fmtMinutes(65), '1 h 05 min');
  assert.equal(fmtMinutes(undefined), '–');
  assert.deepEqual(humanSeconds(1260), { value: '21', unit: 'min' });
  assert.deepEqual(humanSeconds('x'), { value: '0', unit: 's' });
});

test('display guards: show/num/isISODay/shortDate/monthTitle/fmtDistance never leak junk', () => {
  for (const v of [null, undefined, NaN, Infinity, '', 'NaN', 'undefined', 'Invalid Date']) assert.equal(show(v), '–');
  assert.equal(show(2.5), '2,5');
  assert.equal(show('ok'), 'ok');
  assert.equal(num('3'), 3);
  assert.equal(num('x', 0), 0);
  assert.ok(isISODay('2027-01-05'));
  assert.ok(!isISODay('2027-02-30'));
  assert.equal(shortDate('garbage'), '–');
  assert.equal(shortDate(undefined), '–');
  assert.equal(monthTitle('xx'), '–');
  assert.equal(fmtDistance('abc'), '0 m');
  assert.doesNotMatch(progressRing({ value: NaN, max: 'x' }), BAD);
  assert.doesNotMatch(xpBar({ xp: NaN, level: { index: 0, title: 'Novize', progress: NaN, next: 100 } }), BAD);
});

test('pain chart: x-axis starts at the first data point, at least 2 weeks span', () => {
  const today = '2026-11-09';
  assert.equal(chartFrom({ pre: [{ x: '2026-11-07', y: 1 }] }, today, 42), '2026-10-27');
  assert.equal(chartFrom({ pre: [{ x: '2026-10-10', y: 1 }], post: [{ x: '2026-10-20', y: 1 }] }, today, 42), '2026-10-10');
  assert.equal(chartFrom({ pre: [{ x: '2026-01-01', y: 1 }] }, today, 42), '2026-10-27');
  assert.equal(chartFrom({}, today, 42), '2026-10-27');
  assert.equal(chartFrom({ pre: [{ x: '2026-09-01', y: 1 }] }, today, 91), '2026-09-01');
});

test('recommendations: progress/regress without exercise id and junk entries are skipped', () => {
  const s = safeData(junk());
  assert.deepEqual(pendingRecommendations(s.sessions), []);
  assert.deepEqual(pendingRecommendations([null, { status: 'done', recommendations: null }]), []);
});

test('corruptLabel: readable date for preserved corrupt copies', () => {
  assert.match(corruptLabel('pt.v1.corrupt-2026-11-09T17:04:00.000Z'), /^09\.11\.2026, \d\d:04 Uhr$/);
  assert.equal(corruptLabel('weird'), 'weird');
});

/* ---------- fake-DOM render of Heute / Plan / Eigene on junk + active session ---------- */
function fakeRoot() { return { innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }; }
function fakeStore(data) {
  return { get: () => data, getState: () => data.state, getSettings: () => data.settings, update() {}, subscribe: () => () => {} };
}
const strip = (h) => h.replace(/<[^>]+>/g, ' ');

for (const view of ['today', 'plan', 'custom-workouts', 'insights']) {
  test(`render ${view} on junk data: no throw, no NaN/undefined text`, async () => {
    const mod = await import(`../js/views/${view}.js`);
    const root = fakeRoot();
    assert.doesNotThrow(() => mod.render(root, { store: fakeStore(junk()), content, params: {}, query: {} }));
    assert.doesNotMatch(strip(root.innerHTML), BAD);
  });
}

test('Heute with an active session: exactly one resume entry, no other Start links', async () => {
  const { render } = await import('../js/views/today.js');
  const d = defaults();
  d.settings.surgeryDate = '2027-01-05';
  d.settings.ownedEquipment = ['rowing-machine'];
  d.state.welcomeDone = true;
  d.sessions = [{ id: 'a', workoutId: 'p1-b', status: 'done', startedAt: '2026-11-05T18:00:00.000Z', endedAt: '2026-11-05T18:30:00.000Z', exercises: [],
    recommendations: [{ exerciseId: 'quad-set', action: 'progress', fromLevel: 0, toLevel: 1, status: 'pending', reason: 'grün' }] }];
  d.state.activeSession = { id: 'live', workoutId: 'p1-a', status: 'active', startedAt: new Date().toISOString(), exercises: [{ exerciseId: 'quad-set', sets: [] }, { exerciseId: 'sit-to-stand', sets: [] }], cursor: { index: 1, set: 0, step: 'exercise' } };
  const root = fakeRoot();
  render(root, { store: fakeStore(d), content, params: {}, query: {} });
  const h = root.innerHTML;
  assert.equal((h.match(/href="#\/session"/g) || []).length, 1, 'one resume link');
  assert.doesNotMatch(h, /href="#\/session\?workout=/, 'no parallel start links');
  assert.doesNotMatch(h, /Dein Training wartet/);
  assert.match(h, /Training fortsetzen/);
  assert.match(strip(h), /Übung 2 von 2/);
  assert.doesNotMatch(h, /data-rec=/, 'recommendations hidden while training');
});

test('Heute without a session: big Start, recommendations collapsed into one card, welcome has the equipment step', async () => {
  const { render } = await import('../js/views/today.js');
  const d = defaults();
  d.settings.surgeryDate = '2027-01-05';
  d.state.welcomeDone = true;
  d.sessions = [{ id: 'a', workoutId: 'p1-a', status: 'done', startedAt: '2026-11-05T18:00:00.000Z', endedAt: '2026-11-05T18:30:00.000Z', exercises: [],
    recommendations: [
      { exerciseId: 'quad-set', action: 'progress', fromLevel: 0, toLevel: 1, status: 'pending', reason: 'grün' },
      { exerciseId: 'sit-to-stand', action: 'progress', fromLevel: 0, toLevel: 1, status: 'pending', reason: 'grün' }] }];
  const root = fakeRoot();
  render(root, { store: fakeStore(d), content, params: {}, query: {} });
  assert.match(root.innerHTML, /Training starten/);
  assert.equal((root.innerHTML.match(/<details class="card pv-recs"/g) || []).length, 1);
  assert.match(strip(root.innerHTML), /2 Vorschläge für dich/);

  const fresh = defaults();
  const r2 = fakeRoot();
  render(r2, { store: fakeStore(fresh), content, params: {}, query: {} });
  assert.match(r2.innerHTML, /Meine Ausrüstung abhaken/);
  assert.match(r2.innerHTML, /href="#\/ausruestung"/);
});
