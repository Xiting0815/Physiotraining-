// Pure helpers of the WP-Views screens (no DOM needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  doseText, workoutSplit, workoutLetter, pendingNextDay, parsePriceRange, budgetSum, normPriority, equipmentItems,
  monthTitle, shiftMonth, humanSeconds, bandInfo, greeting, trafficPill,
} from '../js/views/ui.js';
import { pendingRecommendations } from '../js/views/today.js';
import { switchPhase, toggleCriterion } from '../js/views/plan.js';
import { filterExercises, fold } from '../js/views/exercises.js';
import { exerciseHistory } from '../js/views/exercise-detail.js';
import { badgeHint, deleteSession } from '../js/views/history.js';
import { moveBand, normThresholds, backupAge } from '../js/views/settings.js';
import { groupByPriority } from '../js/views/equipment.js';
import { defaults } from '../js/store.js';
import { dailyQuote, QUOTES } from '../js/logic/motivation.js';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const exercises = load('exercises').exercises;
const workouts = load('workouts').workouts;
const phases = load('phases').phases;

test('doseText formats reps, holds, timed and perSide', () => {
  assert.equal(doseText({ type: 'hold' }, { sets: 3, reps: 10, hold: 10 }), '3 × 10 × 10 s');
  assert.equal(doseText({ type: 'reps', side: 'perSide' }, { sets: 2, reps: 12 }), '2 × 12 je Seite');
  assert.equal(doseText({ type: 'timed' }, { sets: 1, seconds: 45 }), '1 × 45 s');
  assert.equal(doseText({}, null), '');
});

test('workoutSplit / workoutLetter on real content', () => {
  const w = workouts.find((x) => x.id === 'p1-a');
  const s = workoutSplit(w);
  assert.equal(s.total, s.warmup + s.knee + s.archery + s.cooldown);
  assert.ok(s.knee > 0 && s.archery > 0);
  assert.equal(workoutLetter(w, phases), 'A');
  assert.equal(workoutLetter(workouts.find((x) => x.id === 'p2-c'), phases), 'C');
});

test('pendingNextDay: ≥ 12 h or next calendar day, not when checked in', () => {
  const end = new Date(2026, 9, 30, 18, 0);
  const s = { id: 'a', status: 'done', endedAt: end.toISOString(), nextDay: null };
  assert.equal(pendingNextDay([s], new Date(2026, 9, 30, 22, 0)), null);
  assert.equal(pendingNextDay([s], new Date(2026, 9, 31, 1, 0))?.id, 'a'); // next calendar day
  assert.equal(pendingNextDay([s], new Date(2026, 9, 31, 7, 0))?.id, 'a');
  assert.equal(pendingNextDay([{ ...s, nextDay: { pain: 1 } }], new Date(2026, 9, 31, 9)), null);
  assert.equal(pendingNextDay([s], new Date(2026, 10, 10)), null); // too old
  assert.equal(pendingNextDay([], new Date()), null);
});

test('pendingNextDay (Heute banner) agrees with session-helpers for all sessions of the latest day', async () => {
  const H = await import('../js/views/session-helpers.js');
  const L = await import('../js/logic/next-day.js');
  assert.equal(H.pendingNextDay, L.pendingNextDay, 'session-helpers re-exports the shared logic');
  const day = (h, m = 0) => new Date(2026, 10, 7, h, m).toISOString();
  const strength = { id: 's', status: 'done', startedAt: day(9), endedAt: day(9, 40), nextDay: null };
  const row = { id: 'r', status: 'done', startedAt: day(17), endedAt: day(17, 20), nextDay: null };
  // rowing already checked in (legacy), strength still open → banner still offered (old logic: hidden)
  const sessions = [strength, { ...row, nextDay: { pain: 1 } }];
  const morning = new Date(2026, 10, 8, 9, 0);
  assert.equal(pendingNextDay(sessions, morning)?.id, 's');
  assert.deepEqual(H.pendingNextDay(sessions, morning).sessions.map((s) => s.id), ['s']);
  // both open: banner points at the latest, the check-in covers both
  const both = [strength, row];
  assert.equal(pendingNextDay(both, morning)?.id, 'r');
  assert.deepEqual(H.pendingNextDay(both, morning).sessions.map((s) => s.id), ['s', 'r']);
  // not yet due → banner hidden although helpers know the open group
  const evening = new Date(2026, 10, 7, 21, 0);
  assert.equal(pendingNextDay(both, evening), null);
  assert.equal(H.pendingNextDay(both, evening).due, false);
  // banner visible exactly when the helpers say due
  for (const t of [evening, new Date(2026, 10, 8, 0, 0), morning, new Date(2026, 10, 12, 9)]) {
    assert.equal(!!pendingNextDay(both, t), H.nextDayBannerVisible(both, t));
  }
});

test('price parsing and budget sum', () => {
  assert.deepEqual(parsePriceRange('8–15'), [8, 15]);
  assert.deepEqual(parsePriceRange('25–60 (einfach) / 100–135 (leise)'), [25, 60]);
  assert.deepEqual(parsePriceRange('12'), [12, 12]);
  assert.equal(parsePriceRange(''), null);
  assert.deepEqual(budgetSum([{ priceEur: '8–15' }, { priceEur: '2–5' }, {}]), [10, 20]);
});

test('equipment grouping by priority', () => {
  const items = equipmentItems(load('equipment'));
  assert.ok(items.length > 0);
  const groups = groupByPriority(items);
  assert.equal(groups[0].priority, 'muss');
  assert.equal(groups.reduce((a, g) => a + g.items.length, 0), items.length);
  assert.equal(normPriority('Nice to have'), 'nice');
  assert.deepEqual(equipmentItems({ equipment: [{ id: 'x' }] }), [{ id: 'x' }]);
  assert.deepEqual(equipmentItems(null), []);
});

test('month helpers, humanSeconds, bandInfo, greeting, trafficPill', () => {
  assert.equal(monthTitle('2026-10'), 'Oktober 2026');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.deepEqual(humanSeconds(45), { value: '45', unit: 's' });
  assert.deepEqual(humanSeconds(245), { value: '4', unit: 'min' });
  assert.deepEqual(humanSeconds(4500), { value: '1 h 15', unit: 'min' });
  assert.equal(bandInfo(defaults().settings, 'red').label, 'Rot');
  assert.equal(bandInfo(defaults().settings, null), null);
  assert.equal(greeting(new Date(2026, 0, 1, 8)), 'Guten Morgen');
  assert.match(String(trafficPill('yellow', { long: true })), /traffic--yellow.*Gelb – halten/);
});

test('pendingRecommendations: latest per exercise, no hold, only pending', () => {
  const s1 = { id: 's1', status: 'done', recommendations: [{ exerciseId: 'q', action: 'progress', status: 'pending' }] };
  const s2 = { id: 's2', status: 'done', recommendations: [
    { exerciseId: 'q', action: 'regress', status: 'pending' },
    { exerciseId: 'h', action: 'hold', status: 'pending' },
    { exerciseId: 'x', action: 'progress', status: 'accepted' },
  ] };
  const r = pendingRecommendations([s1, s2]);
  assert.equal(r.length, 1);
  assert.equal(r[0].sessionId, 's2');
  assert.equal(r[0].rec.action, 'regress');
});

test('plan: switchPhase & toggleCriterion', () => {
  const d = defaults();
  switchPhase(d, phases[1], '2026-11-20');
  assert.equal(d.state.phaseId, phases[1].id);
  assert.equal(d.state.nextWorkoutId, phases[1].workouts.A);
  assert.equal(d.state.phaseHistory.at(-1).startedAt, '2026-11-20');
  toggleCriterion(d, 'p1-basis', 2);
  toggleCriterion(d, 'p1-basis', 0);
  assert.deepEqual(d.state.exitCriteriaDone['p1-basis'], [0, 2]);
  toggleCriterion(d, 'p1-basis', 2);
  assert.deepEqual(d.state.exitCriteriaDone['p1-basis'], [0]);
});

test('exercise library filter (search folds umlauts, block, equipment)', () => {
  assert.equal(fold('Brücke'), 'bruecke');
  const all = filterExercises(exercises, {});
  assert.equal(all.length, exercises.length);
  const knee = filterExercises(exercises, { block: 'knee' });
  assert.ok(knee.length > 0 && knee.every((e) => e.block === 'knee'));
  const band = filterExercises(exercises, { equipment: ['theraband'] });
  assert.ok(band.every((e) => e.equipment.includes('theraband')));
  assert.ok(filterExercises(exercises, { q: 'quad' }).some((e) => e.id === 'quad-set'));
  assert.equal(filterExercises(exercises, { q: 'zzzxx' }).length, 0);
  assert.equal(filterExercises(exercises, { planIds: new Set(['quad-set']) }).length, 1);
});

test('exerciseHistory per session metric', () => {
  const ex = { id: 'quad-set', type: 'hold' };
  const sessions = [
    { id: 'a', status: 'done', endedAt: '2026-10-01T17:00:00.000Z', exercises: [{ exerciseId: 'quad-set', level: 0, sets: [{ done: true, reps: 10, hold: 5 }, { done: true, reps: 10, hold: 7 }] }] },
    { id: 'b', status: 'aborted', endedAt: '2026-10-02T17:00:00.000Z', exercises: [{ exerciseId: 'quad-set', sets: [{ done: true, hold: 99 }] }] },
    { id: 'c', status: 'done', endedAt: '2026-10-03T17:00:00.000Z', exercises: [{ exerciseId: 'quad-set', skipped: true, sets: [] }] },
  ];
  const h = exerciseHistory(sessions, ex);
  assert.equal(h.length, 1);
  assert.equal(h[0].value, 7);
  assert.equal(h[0].sets, 2);
  assert.equal(exerciseHistory(sessions, { id: 'quad-set', type: 'reps' })[0].value, 20);
});

test('history: badgeHint and deleteSession', () => {
  const data = { sessions: [{ id: 'a', status: 'done', xpEarned: 100, endedAt: '2026-10-01T10:00:00Z', exercises: [{ exerciseId: 'q', sets: [{ done: true, hold: 10, reps: 6 }] }] }], state: { xp: 150 } };
  assert.equal(badgeHint({ rule: { type: 'sessionsCount', n: 10 } }, data), 'noch 9');
  assert.equal(badgeHint({ rule: { type: 'totalHoldSeconds', n: 300 } }, data), '1:00 / 5:00');
  deleteSession(data, 'a');
  assert.equal(data.sessions.length, 0);
  assert.equal(data.state.xp, 50);
});

test('settings: moveBand stays within kind, thresholds normalised, backupAge', () => {
  const bands = defaults().settings.bands;
  const up = moveBand(bands, 'red', -1);
  assert.deepEqual(up.slice(0, 2).map((b) => b.id), ['red', 'yellow']);
  assert.deepEqual(moveBand(bands, 'blue', 1).map((b) => b.id), bands.map((b) => b.id)); // no jump into loops
  assert.deepEqual(moveBand(bands, 'loop-blue', -1).slice(4).map((b) => b.id), ['loop-blue', 'loop-orange']);
  assert.deepEqual(normThresholds({ greenMax: 5, yellowMax: 3, greenStreakToProgress: 0 }), { greenMax: 4, yellowMax: 5, greenStreakToProgress: 1 });
  assert.equal(backupAge({}, '2026-10-31'), null);
  assert.equal(backupAge({ lastBackupAt: new Date(2026, 9, 21, 12).toISOString() }, '2026-10-31'), 10);
});

test('dailyQuote uses content quotes when given, built-in otherwise', () => {
  const quotes = load('quotes').quotes;
  const q = dailyQuote('2026-11-05', quotes);
  assert.ok(quotes.includes(q));
  assert.equal(dailyQuote('2026-11-05', quotes), q);
  assert.ok(QUOTES.includes(dailyQuote('2026-11-05', [])));
  assert.ok(QUOTES.includes(dailyQuote('2026-11-05', null)));
});
