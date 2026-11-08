import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  XP, LEVELS, xpFor, levelFor, evaluateBadges, badgeRuleMet, setScore, sessionScore, dailyQuote, QUOTES, opCountdown, reminderText,
} from '../js/logic/motivation.js';
import { scoreForSet } from '../js/components/celebrate.js';
import { buildSessionPlan } from '../js/logic/progression.js';

const badgeDefs = JSON.parse(readFileSync(new URL('../data/badges.json', import.meta.url), 'utf8')).badges;
const settings = { weeklyGoal: 3, painThresholds: { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 }, bands: [{ id: 'yellow' }, { id: 'red' }, { id: 'green' }] };

let n = 0;
const S = (day, { light = 'green', final = null, exercises = [], status = 'done' } = {}) => ({
  id: `s-${++n}`, status, phaseId: 'p1-basis',
  startedAt: new Date(`${day}T17:00:00`).toISOString(), endedAt: new Date(`${day}T17:40:00`).toISOString(),
  traffic: { provisional: light, final, reasons: [] }, exercises,
});
const data = (sessions, state = {}) => ({ schemaVersion: 1, settings, state: { badges: {}, phaseHistory: [{ phaseId: 'p1-basis' }], ...state }, sessions });

test('XP constants and xpFor', () => {
  assert.deepEqual(XP, { perSet: 2, cleanSetBonus: 1, sessionBonus: 20, nextDayCheckIn: 10, badge: 15, cardioBase: 20, cardioPerMin: 2, cardioMaxMin: 20 });
  assert.equal('healthLog' in XP, false, 'v3.1: no diary XP');
  const s = { status: 'done', exercises: [
    { painDuring: 1, sets: [{ done: true }, { done: true }, { done: false }] }, // 2 × 3
    { painDuring: 4, sets: [{ done: true }] }, // 2
    { painDuring: 0, sharpPain: true, sets: [{ done: true }] }, // 2
    { painDuring: null, sets: [{ done: true }] }, // 3 (archery, no pain)
    { painDuring: 0, skipped: true, sets: [{ done: true }] }, // 0
  ] };
  assert.equal(xpFor(s, settings), 20 + 6 + 2 + 2 + 3);
  assert.equal(xpFor({ ...s, status: 'aborted' }, settings), 13);
  assert.equal(xpFor({ status: 'done', exercises: [] }, {}), 20);
});

test('levelFor: archery titles, boundaries, max level, bad input', () => {
  assert.equal(LEVELS.length, 9);
  assert.deepEqual(levelFor(0), { index: 0, title: 'Novize', min: 0, next: 400, progress: 0 });
  assert.equal(levelFor(399).title, 'Novize');
  assert.equal(levelFor(400).title, 'Lehrling');
  assert.equal(levelFor(700).progress, 0.5);
  assert.equal(levelFor(1900).title, 'Schütze');
  assert.deepEqual(levelFor(12000), { index: 8, title: 'Robin Hood', min: 12000, next: null, progress: 1 });
  assert.equal(levelFor(99999).title, 'Robin Hood');
  assert.equal(levelFor(-5).title, 'Novize');
  assert.equal(levelFor(NaN).progress, 0);
});

test('XP balance (v2): 3× strength (≤ 30 min) + 3× rowing per week (v3.1: no diary XP) → Robin Hood after ~6 months', () => {
  const content = {
    exercises: JSON.parse(readFileSync(new URL('../data/exercises.json', import.meta.url), 'utf8')).exercises,
    workouts: JSON.parse(readFileSync(new URL('../data/workouts.json', import.meta.url), 'utf8')).workouts,
    phases: JSON.parse(readFileSync(new URL('../data/phases.json', import.meta.url), 'utf8')).phases,
  };
  const strength = content.workouts.filter((w) => (w.kind ?? 'strength') === 'strength' && w.phaseId !== 'p4-entlastung');
  const levelsAt = (progress) => Object.fromEntries(content.exercises.map((e) => [e.id, Math.round(progress * (e.levels.length - 1))]));
  let xp = 0, weeks = 0; const levelAt = [];
  while (levelFor(xp).index < LEVELS.length - 1 && weeks < 100) {
    const progress = Math.min(1, weeks / 20);
    for (let i = 0; i < 3; i++) {
      const w = strength[(Math.floor(weeks / 3) * 3 + i) % strength.length];
      const plan = buildSessionPlan(w, { phaseId: w.phaseId, exerciseLevels: levelsAt(progress) }, content, {});
      plan.status = 'done';
      plan.exercises.forEach((e, j) => { e.painDuring = j % 7 === 0 ? 3 : 1; e.sets = Array.from({ length: e.plannedSets }, () => ({ done: true })); });
      xp += xpFor(plan, settings) + XP.nextDayCheckIn;
    }
    for (let i = 0; i < 3; i++) xp += xpFor({ status: 'done', kind: 'cardio', rowing: { durationSec: 16 * 60 } }, settings);
    if (weeks % 3 === 0) xp += XP.badge; // badges spread over time
    weeks++;
    const li = levelFor(xp).index; if (levelAt[li] == null) levelAt[li] = weeks;
  }
  assert.ok(weeks >= 22 && weeks <= 32, `Robin Hood after ${weeks} weeks`);
  assert.ok(levelAt[1] <= 2, `Lehrling after ${levelAt[1]} weeks`);
  assert.ok(levelAt[2] - levelAt[1] <= 3, `early gaps ${levelAt.join(',')}`);
  assert.ok(levelAt[8] - levelAt[7] > levelAt[2] - levelAt[1], 'later levels take longer');
});

test('cardioXp', () => {
  assert.equal(xpFor({ status: 'done', kind: 'cardio', rowing: { durationSec: 15 * 60 } }, settings), 20 + 30);
  assert.equal(xpFor({ status: 'done', kind: 'cardio', rowing: { durationSec: 40 * 60 } }, settings), 20 + 40);
  assert.equal(xpFor({ status: 'done', kind: 'cardio', exercises: [{ sets: [{ done: true, seconds: 600 }] }] }, settings), 40);
  assert.equal(xpFor({ status: 'aborted', kind: 'cardio', rowing: { durationSec: 300 } }, settings), 10);
});

test('badges.json covers all required badges with known rule types', () => {
  const ids = badgeDefs.map((b) => b.id);
  for (const id of ['first-session', 'week-3', 'sessions-10', 'sessions-25', 'sessions-50', 'hold-5min', 'phase-done', 'green-week', 'personal-record', 'comeback']) assert.ok(ids.includes(id), id);
  for (const b of badgeDefs) assert.ok(['sessionsCount', 'weekSessions', 'totalHoldSeconds', 'phaseCompleted', 'greenWeek', 'personalRecord', 'comeback', 'cardioCount', 'rowingDistance', 'customWorkout'].includes(b.rule.type));
  for (const id of ['minus-2kg', 'minus-5kg', 'goal-reached', 'log-7']) assert.ok(!ids.includes(id), `${id} removed in v3.1`);
});

test('evaluateBadges: empty history → none', () => {
  assert.deepEqual(evaluateBadges(data([]), badgeDefs, { today: '2026-11-05' }), []);
  assert.deepEqual(evaluateBadges(data([]), [], {}), []);
});

test('evaluateBadges: first session; already earned excluded; aborted ignored', () => {
  assert.deepEqual(evaluateBadges(data([S('2026-11-02', { light: 'yellow' })]), badgeDefs), ['first-session']);
  assert.deepEqual(evaluateBadges(data([S('2026-11-02', { light: 'yellow' })], { badges: { 'first-session': 'x' } }), badgeDefs), []);
  assert.deepEqual(evaluateBadges(data([S('2026-11-02', { status: 'aborted' })]), badgeDefs), []);
});

test('evaluateBadges: stored ids of removed badges (v3.1) are ignored, never crash', () => {
  const legacy = { 'minus-2kg': '2026-10-01T10:00:00.000Z', 'log-7': '2026-10-02T10:00:00.000Z', 'goal-reached': '2026-10-03T10:00:00.000Z' };
  const d = data([S('2026-11-02', { light: 'yellow' })], { badges: legacy, healthLog: [{ date: '2026-11-01', weightKg: 90 }] });
  assert.deepEqual(evaluateBadges(d, badgeDefs), ['first-session']);
  assert.equal(d.state.badges['minus-2kg'], legacy['minus-2kg'], 'legacy ids stay untouched');
  // old definitions with removed rule types never match
  assert.deepEqual(evaluateBadges(d, [{ id: 'minus-5kg', rule: { type: 'weightLost', n: 5 } }, { id: 'log-7', rule: { type: 'healthLogStreak', n: 7 } }]), []);
  assert.deepEqual(evaluateBadges({ state: { badges: null }, sessions: [] }, badgeDefs), []);
});

test('sessionsCount thresholds 10/25/50', () => {
  const many = (k) => Array.from({ length: k }, (_, i) => S(`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, { light: 'yellow' }));
  const ids10 = evaluateBadges(data(many(10)), badgeDefs);
  assert.ok(ids10.includes('sessions-10') && !ids10.includes('sessions-25'));
  assert.ok(evaluateBadges(data(many(25)), badgeDefs).includes('sessions-25'));
  const ids50 = evaluateBadges(data(many(50)), badgeDefs);
  assert.ok(ids50.includes('sessions-50'));
  assert.ok(!badgeRuleMet({ type: 'sessionsCount', n: 50 }, data(many(49))));
});

test('weekSessions: 3 in one ISO week (Mon–Sun), not across weeks', () => {
  assert.ok(badgeRuleMet({ type: 'weekSessions', n: 3 }, data([S('2026-11-02'), S('2026-11-04'), S('2026-11-08')])));
  assert.ok(!badgeRuleMet({ type: 'weekSessions', n: 3 }, data([S('2026-11-01'), S('2026-11-02'), S('2026-11-04')])));
});

test('totalHoldSeconds badge (300 s)', () => {
  const hold = (sets) => S('2026-11-02', { exercises: [{ exerciseId: 'quad-set', sets }] });
  assert.ok(badgeRuleMet({ type: 'totalHoldSeconds', n: 300 }, data([hold([{ done: true, reps: 10, hold: 10 }, { done: true, reps: 10, hold: 20 }])])));
  assert.ok(!badgeRuleMet({ type: 'totalHoldSeconds', n: 300 }, data([hold([{ done: true, reps: 10, hold: 29 }])])));
});

test('phaseCompleted: phaseHistory with a second phase', () => {
  assert.ok(!badgeRuleMet({ type: 'phaseCompleted' }, data([])));
  assert.ok(badgeRuleMet({ type: 'phaseCompleted' }, data([], { phaseHistory: [{ phaseId: 'p1-basis' }, { phaseId: 'p2-aufbau' }] })));
});

test('greenWeek: ≥ weeklyGoal sessions in one week, all green (final preferred)', () => {
  const wk = (lights) => lights.map((l, i) => S(`2026-11-0${2 + i}`, typeof l === 'string' ? { light: l } : l));
  assert.ok(badgeRuleMet({ type: 'greenWeek' }, data(wk(['green', 'green', 'green']))));
  assert.ok(!badgeRuleMet({ type: 'greenWeek' }, data(wk(['green', 'green']))));
  assert.ok(!badgeRuleMet({ type: 'greenWeek' }, data(wk(['green', 'yellow', 'green', 'green']))));
  assert.ok(!badgeRuleMet({ type: 'greenWeek' }, data(wk(['green', 'green', { light: 'green', final: 'red' }]))));
});

test('personalRecord: only when a later session beats an earlier record', () => {
  const h = (day, hold) => S(day, { exercises: [{ exerciseId: 'quad-set', sets: [{ done: true, reps: 10, hold }] }] });
  assert.ok(!badgeRuleMet({ type: 'personalRecord' }, data([h('2026-11-02', 10)])));
  assert.ok(!badgeRuleMet({ type: 'personalRecord' }, data([h('2026-11-02', 10), h('2026-11-04', 10)])));
  assert.ok(badgeRuleMet({ type: 'personalRecord' }, data([h('2026-11-02', 10), h('2026-11-04', 12)])));
  const band = (day, b) => S(day, { exercises: [{ exerciseId: 'pull', sets: [{ done: true, reps: 10, band: b }] }] });
  assert.ok(badgeRuleMet({ type: 'personalRecord' }, data([band('2026-11-02', 'yellow'), band('2026-11-04', 'red')])));
});

test('comeback: gap ≥ n days between sessions', () => {
  assert.ok(badgeRuleMet({ type: 'comeback', n: 10 }, data([S('2026-10-01'), S('2026-10-11')])));
  assert.ok(!badgeRuleMet({ type: 'comeback', n: 10 }, data([S('2026-10-01'), S('2026-10-10')])));
  assert.ok(badgeRuleMet({ type: 'comeback' }, data([S('2026-10-11'), S('2026-10-01')]))); // unsorted input
  assert.ok(!badgeRuleMet({ type: 'comeback' }, data([S('2026-10-01')])));
  assert.ok(!badgeRuleMet({ type: 'unknown' }, data([S('2026-10-01')])));
});

test('setScore mirrors celebrate.scoreForSet', () => {
  const cases = [
    { done: true, painDuring: 0 }, { done: true, painDuring: 2 }, { done: true, painDuring: 3 }, { done: true, painDuring: 5 },
    { done: true, painDuring: 6 }, { done: true, painDuring: 0, sharpPain: true }, { done: false }, { done: true, skipped: true }, { done: true, painDuring: null },
  ];
  for (const c of cases) assert.equal(setScore(c), scoreForSet(c), JSON.stringify(c));
  assert.deepEqual(cases.map((c) => setScore(c)), [10, 10, 7, 7, 4, 4, 1, 1, 10]);
});

test('sessionScore: planned + logged arrows, headlines', () => {
  const content = { exercises: [{ id: 'quad-set', name: 'Quad Set', levels: [{ sets: 3 }] }] };
  const s = { taper: false, exercises: [
    { exerciseId: 'quad-set', level: 0, painDuring: 1, sets: [{ done: true }, { done: true }] }, // 3 planned: 10,10,1
    { exerciseId: 'pull', painDuring: null, plannedSets: 2, sets: [{ done: true }, { done: true }] }, // 10,10
    { exerciseId: 'x', skipped: true, sets: [] }, // 1 arrow, 1
  ] };
  const r = sessionScore(s, settings, content);
  assert.equal(r.results.length, 6);
  assert.equal(r.points, 42);
  assert.equal(r.max, 60);
  assert.equal(r.headline, 'Starke Gruppe!'); // exactly 70 %
  const weak = { exercises: [{ exerciseId: 'a', painDuring: 7, sets: [{ done: true }, { done: false }] }] };
  assert.equal(sessionScore(weak, settings).headline, 'Jeder Pfeil bringt dich weiter.');
  assert.equal(r.results[0].label, 'Quad Set');
  const clean = { exercises: [{ exerciseId: 'a', painDuring: 0, sets: [{ done: true }, { done: true }] }] };
  assert.equal(sessionScore(clean, settings).headline, 'Volltreffer!');
  const good = { exercises: [{ exerciseId: 'a', painDuring: 4, sets: [{ done: true }] }] };
  assert.equal(sessionScore(good, settings).headline, 'Starke Gruppe!');
  assert.deepEqual(sessionScore({ exercises: [] }, settings), { results: [], points: 0, max: 0, ratio: 0, headline: 'Jeder Pfeil bringt dich weiter.' });
  // taper reduces planned arrows when plannedSets missing
  assert.equal(sessionScore({ taper: true, exercises: [{ exerciseId: 'quad-set', level: 0, sets: [] }] }, settings, content).results.length, 2);
});

test('dailyQuote deterministic', () => {
  assert.equal(dailyQuote('2026-11-02'), dailyQuote('2026-11-02'));
  assert.ok(QUOTES.includes(dailyQuote('2026-11-03')));
  const set = new Set(Array.from({ length: 30 }, (_, i) => dailyQuote(`2026-11-${String(i + 1).padStart(2, '0')}`)));
  assert.ok(set.size > 1);
});

test('opCountdown: null, future, taper, today, past, missing/odd prehabStart', () => {
  assert.deepEqual(opCountdown({ surgeryDate: null }, '2026-11-01'), { daysLeft: null, progress: 0, stage: 'none' });
  assert.deepEqual(opCountdown(null, '2026-11-01'), { daysLeft: null, progress: 0, stage: 'none' });
  const st = { surgeryDate: '2027-01-15', prehabStart: '2026-10-31' }; // 76 days
  assert.deepEqual(opCountdown(st, '2026-10-31'), { daysLeft: 76, progress: 0, stage: 'countdown' });
  assert.equal(opCountdown(st, '2026-12-08').progress, 0.5);
  assert.equal(opCountdown(st, '2027-01-08').stage, 'taper');
  assert.equal(opCountdown(st, '2027-01-07').stage, 'countdown');
  assert.deepEqual(opCountdown(st, '2027-01-15'), { daysLeft: 0, progress: 1, stage: 'today' });
  assert.deepEqual(opCountdown(st, '2027-02-01'), { daysLeft: -17, progress: 1, stage: 'after' });
  assert.equal(opCountdown({ surgeryDate: '2027-01-15', prehabStart: null }, '2026-11-01').progress, 0);
  assert.equal(opCountdown({ surgeryDate: '2027-01-15', prehabStart: '2027-02-01' }, '2026-11-01').progress, 0);
  assert.equal(opCountdown({ surgeryDate: '2027-01-15', prehabStart: '2026-10-31' }, '2026-10-01').progress, 0); // before start
});

test('reminderText: gentle copy, null when trained today or goal met', () => {
  assert.equal(reminderText([], 3, '2026-11-04'), 'Lust auf eine kurze Einheit? Dein Knie freut sich über Bewegung.');
  assert.equal(reminderText([S('2026-11-02')], 3, '2026-11-04'), 'Noch 2 Einheiten bis zum Wochenziel – Schritt für Schritt.');
  assert.equal(reminderText([S('2026-11-02'), S('2026-11-03')], 3, '2026-11-04'), 'Noch 1 Einheit bis zum Wochenziel – ganz entspannt.');
  assert.equal(reminderText([S('2026-11-04')], 3, '2026-11-04'), null);
  assert.equal(reminderText([S('2026-11-02'), S('2026-11-03'), S('2026-11-03')], 3, '2026-11-05'), null);
  for (const t of [reminderText([], 3, '2026-11-04'), reminderText([S('2026-11-02')], 3, '2026-11-04')]) assert.doesNotMatch(t, /versagt|verpasst/);
});
