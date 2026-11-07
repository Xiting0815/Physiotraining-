// Pure helpers of the v2 views (Eigene Workouts, Gesundheit, Rudern in Verlauf/Übungen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaults } from '../js/store.js';
import { customSummary } from '../js/views/custom-workouts.js';
import { emptyDraft, addItem, moveItem, removeItem, sectionItems, totalItems, defaultSection, draftFrom } from '../js/views/custom-workout-edit.js';
import { inputValue, fieldText, entrySummary, reportTip, corrView } from '../js/views/health.js';
import { filterSessions, sessionTitle, rowingLine, badgeHint, KIND_FILTERS } from '../js/views/history.js';
import { filterExercises, cardDose } from '../js/views/exercises.js';
import { rowingLevelPreview, rowingLevelText } from '../js/views/exercise-detail.js';
import { availability, sessionKind, yWindow, fmtDistance, fmtClock, fmtPace, awardBadges } from '../js/views/v2-shared.js';
import { createCustomWorkout } from '../js/logic/custom-workouts.js';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases, badges: load('badges').badges };
const ex = (id) => content.exercises.find((e) => e.id === id);

test('builder draft: add, move, remove, 20-item limit', () => {
  const d = emptyDraft();
  assert.equal(totalItems(d), 0);
  addItem(d, 'knee', 'quad-set');
  addItem(d, 'knee', 'tke');
  addItem(d, 'warmup', 'knee-pendulum');
  assert.deepEqual(sectionItems(d, 'knee').map((i) => i.exerciseId), ['quad-set', 'tke']);
  assert.equal(moveItem(d, 'knee', 1, -1), 0);
  assert.deepEqual(sectionItems(d, 'knee').map((i) => i.exerciseId), ['tke', 'quad-set']);
  assert.equal(moveItem(d, 'knee', 0, -1), 0); // no-op at top
  removeItem(d, 'knee', 0);
  assert.equal(totalItems(d), 2);
  for (let i = 0; i < 18; i++) assert.ok(addItem(d, 'archery', 'quad-set'));
  assert.equal(addItem(d, 'archery', 'quad-set'), false);
  assert.equal(defaultSection({ block: 'cardio' }), 'knee');
  assert.equal(defaultSection({ block: 'archery' }), 'archery');
});

test('customSummary estimates minutes for a stored custom workout', () => {
  const d = defaults();
  const w = content.workouts.find((x) => x.id === 'p1-a');
  const r = createCustomWorkout(d.state, { name: 'Test', warmup: w.warmup, blocks: w.blocks, cooldown: w.cooldown }, content, { settings: d.settings });
  const sum = customSummary(r.workout, content, r.state, d.settings);
  assert.ok(sum.count > 5);
  assert.ok(sum.minutes > 10 && sum.minutes <= 40, String(sum.minutes));
  assert.equal(typeof sum.over, 'boolean');
  const draft = draftFrom(r.workout);
  assert.equal(draft.name, 'Test');
  assert.equal(draft.blocks.length, 2);
});

test('health view helpers', () => {
  assert.equal(inputValue('weightKg', 92.4), '92,4');
  assert.equal(inputValue('steps', null), '');
  assert.equal(fieldText('steps', 8214), '8.214');
  assert.equal(fieldText('sleepH', 7.25), '7,25 h');
  assert.equal(fieldText('weightKg', 92), '92 kg');
  const s = entrySummary({ date: '2026-11-01', weightKg: 93.1, sleepH: 7 });
  assert.deepEqual(s.map((x) => x.key), ['weightKg', 'sleepH']);
  assert.equal(corrView({ r: null, n: 3 }).text, 'Noch zu wenige Daten (3/8)');
  assert.equal(corrView({ r: 0.4, n: 10, text: 'x' }).enough, true);
  const rep = { strength: { done: 1, goal: 3 }, cardio: { done: 3, goal: 3 }, notes: [] };
  assert.match(reportTip(rep, null, true), /Noch 2 Kraft-Einheiten/);
  assert.match(reportTip({ ...rep, notes: ['N'] }, null, false), /^N$/);
  assert.match(reportTip({ ...rep, strength: { done: 3, goal: 3 } }, { tips: [] }, true), /Konstanz/);
});

test('history: kind filters, titles, rowing line, new badge hints', () => {
  const sessions = [
    { id: 'a', status: 'done', workoutId: 'p1-a', endedAt: '2026-11-01T18:00:00Z' },
    { id: 'b', status: 'done', workoutId: 'p1-row', kind: 'cardio', rowing: { durationSec: 900, distanceM: 3600 }, endedAt: '2026-11-02T18:00:00Z' },
    { id: 'c', status: 'done', workoutId: 'cw-x', kind: 'custom', endedAt: '2026-11-03T18:00:00Z' },
    { id: 'd', status: 'done', workoutId: 'p1-short', kind: 'short', endedAt: '2026-11-04T18:00:00Z' },
  ];
  assert.equal(KIND_FILTERS.length, 5);
  assert.deepEqual(filterSessions(sessions, 'cardio').map((s) => s.id), ['b']);
  assert.deepEqual(filterSessions(sessions, 'strength').map((s) => s.id), ['a']);
  assert.equal(filterSessions(sessions, 'all').length, 4);
  assert.equal(sessionTitle(sessions[2], content, { customWorkouts: [] }), 'Eigenes Workout');
  assert.equal(sessionTitle(sessions[2], content, { customWorkouts: [{ id: 'cw-x', name: 'Meins', blocks: [] }] }), 'Meins');
  assert.equal(rowingLine(sessions[1]), '3,60 km · 2:05 /500 m');
  const data = { sessions, state: { healthLog: [{ date: '2026-11-01' }, { date: '2026-11-02' }] } };
  assert.equal(badgeHint({ rule: { type: 'rowingDistance', n: 10000 } }, data), '3,6 / 10 km');
  assert.equal(badgeHint({ rule: { type: 'healthLogStreak', n: 7 } }, data), '2 / 7 Tage');
  assert.equal(sessionKind(sessions[3]), 'short');
});

test('exercises: Rudern filter, card dose, rowing level preview', () => {
  const rows = filterExercises(content.exercises, { block: 'cardio' });
  assert.ok(rows.length >= 5 && rows.every((e) => e.block === 'cardio'));
  assert.equal(filterExercises(content.exercises, {}).length, content.exercises.length);
  const iv = ex('row-intervals');
  assert.equal(cardDose(iv, iv.levels[0]), iv.levels[0].label);
  const pv = rowingLevelPreview(iv, 0, content);
  assert.equal(pv.phases.filter((p) => p.kind === 'work').length, iv.levels[0].sets);
  assert.ok(pv.totalSec > pv.workSec);
  assert.match(rowingLevelText(iv, iv.levels[0]), /× 1:00 zügig, dazwischen 1:00 locker rudern/);
  assert.match(rowingLevelText(ex('row-technique-warmup'), ex('row-technique-warmup').levels[0]), /→/);
});

test('availability: phase, post-op blocked/enabled, user disabled', () => {
  const st = { phaseId: 'p1-basis', exerciseToggles: {} };
  assert.equal(availability(ex('row-intervals'), st, content.phases).kind, 'phase');
  assert.equal(availability(ex('chair-dip'), st, content.phases).kind, 'postop-later');
  const post = { phaseId: 'p4-entlastung', exerciseToggles: {} };
  assert.equal(availability(ex('chair-dip'), post, content.phases).kind, 'blocked');
  assert.equal(availability(ex('chair-dip'), { ...post, exerciseToggles: { 'chair-dip': true } }, content.phases).kind, 'enabled');
  assert.equal(availability(ex('quad-set'), { ...st, exerciseToggles: { 'quad-set': false } }, content.phases).kind, 'off');
  assert.equal(availability(ex('quad-set'), st, content.phases).kind, 'ok');
});

test('v2 formatting & chart window & badge award', () => {
  assert.equal(fmtDistance(850), '850 m');
  assert.equal(fmtDistance(4250), '4,25 km');
  assert.equal(fmtClock(65), '1:05');
  assert.equal(fmtClock(3725), '1:02:05');
  assert.equal(fmtPace(125), '2:05 /500 m');
  const w = yWindow([93.2, 95.8], { pad: 0.5, step: 1 });
  assert.ok(w.base <= 92.7 && w.base + w.yMax >= 96.3 && w.yMax !== 10);
  const d = defaults();
  d.state.customWorkouts = [{ id: 'cw-1', name: 'x' }];
  const ids = awardBadges(d, content.badges, '2026-11-07');
  assert.ok(ids.includes('first-custom'));
  assert.ok(d.state.badges['first-custom']);
  assert.ok(d.state.xp > 0);
});
