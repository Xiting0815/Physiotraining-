// Runs in its own process (node --test isolates files) → fix the time zone for DST cases.
process.env.TZ = 'Europe/Berlin';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  streak, weeklyProgress, trends, calendarData, personalRecords, newRecords, totalHoldSeconds, dayOf, sessionLight,
} from '../js/logic/stats.js';

let n = 0;
/** day "YYYY-MM-DD", time "HH:MM" local */
const S = (day, { time = '18:00', status = 'done', pre, post, nextDay = null, light = 'green', final, exercises = [] } = {}) => ({
  id: `s-${++n}`, status, phaseId: 'p1-basis',
  startedAt: new Date(`${day}T${time}:00`).toISOString(), endedAt: new Date(`${day}T${time}:00`).toISOString(),
  pre: pre ?? { pain: 1, swelling: 0 }, post: post ?? { pain: 2, swelling: 0 }, nextDay,
  traffic: { provisional: light, final: final ?? null, reasons: [] }, exercises,
});
const days = (...ds) => ds.map((d) => S(d));

test('time zone is applied (sanity)', () => {
  assert.equal(new Date('2026-07-01T12:00:00Z').getTimezoneOffset(), -120);
  assert.equal(new Date('2026-12-01T12:00:00Z').getTimezoneOffset(), -60);
});

test('dayOf uses local date of startedAt (session crossing midnight stays on its start day)', () => {
  const s = { endedAt: '2026-11-01T23:30:00.000Z', startedAt: '2026-11-01T22:50:00.000Z' };
  assert.equal(dayOf(s), '2026-11-01'); // started 23:50 CET, ended 00:30 CET next day
  assert.equal(dayOf({ startedAt: '2026-11-01T23:10:00.000Z', endedAt: null }), '2026-11-02'); // 00:10 CET = local next day
  assert.equal(dayOf({ startedAt: '2026-11-01T10:00:00.000Z', endedAt: null }), '2026-11-01');
  assert.equal(dayOf({ startedAt: null, endedAt: '2026-11-01T10:00:00.000Z' }), '2026-11-01'); // fallback endedAt
  assert.equal(dayOf({ date: '2026-10-30' }), '2026-10-30'); // fallback date
});

test('sessionLight: final over provisional', () => {
  assert.equal(sessionLight({ traffic: { provisional: 'green', final: 'red' } }), 'red');
  assert.equal(sessionLight({ traffic: { provisional: 'yellow', final: null } }), 'yellow');
  assert.equal(sessionLight({}), null);
});

test('weeklyProgress: Monday-based week, done only', () => {
  // 2026-11-02 is a Monday; 2026-11-01 Sunday belongs to the previous week
  const s = [...days('2026-11-01', '2026-11-02', '2026-11-08'), S('2026-11-03', { status: 'aborted' })];
  assert.deepEqual(weeklyProgress(s, 3, '2026-11-05'), { done: 2, goal: 3, ratio: 2 / 3 });
  assert.deepEqual(weeklyProgress(s, 3, '2026-11-01'), { done: 1, goal: 3, ratio: 1 / 3 });
  assert.equal(weeklyProgress([], 3, '2026-11-05').done, 0);
  assert.equal(weeklyProgress(days('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'), 3, '2026-11-05').ratio, 1);
  assert.equal(weeklyProgress([], 0, '2026-11-05').ratio, 0);
});

test('weeklyProgress across DST end (Sun 2026-10-25): Sunday late vs Monday early', () => {
  const sunLate = S('2026-10-25', { time: '23:30' });
  const monEarly = S('2026-10-26', { time: '00:30' });
  assert.equal(weeklyProgress([sunLate, monEarly], 3, '2026-10-25').done, 1);
  assert.equal(weeklyProgress([sunLate, monEarly], 3, '2026-10-26').done, 1);
  assert.equal(weeklyProgress([sunLate, monEarly], 3, '2026-10-19').done, 1);
});

test('streak: empty history', () => {
  assert.deepEqual(streak([], 3, '2026-11-05'), { weeks: 0, currentWeekCount: 0 });
});

test('streak: counts back from last week; current week adds once met, never breaks', () => {
  const w43 = days('2026-10-19', '2026-10-21', '2026-10-23');
  const w44 = days('2026-10-26', '2026-10-28', '2026-10-30');
  assert.deepEqual(streak([...w43, ...w44], 3, '2026-11-03'), { weeks: 2, currentWeekCount: 0 });
  const w45 = days('2026-11-02', '2026-11-03', '2026-11-04');
  assert.deepEqual(streak([...w43, ...w44, ...w45], 3, '2026-11-04'), { weeks: 3, currentWeekCount: 3 });
  assert.deepEqual(streak([...w43, ...w44, ...w45.slice(0, 2)], 3, '2026-11-04'), { weeks: 2, currentWeekCount: 2 });
});

test('streak: a missed week resets; only current week met → 1', () => {
  const w42 = days('2026-10-12', '2026-10-13', '2026-10-14');
  const w44 = days('2026-10-26', '2026-10-28', '2026-10-30');
  assert.equal(streak([...w42, ...w44], 3, '2026-11-02').weeks, 1);
  const w45 = days('2026-11-02', '2026-11-03', '2026-11-04');
  assert.equal(streak(w45, 3, '2026-11-04').weeks, 1);
  assert.equal(streak(w42, 3, '2026-11-04').weeks, 0);
});

test('streak: week containing DST change counts as one week', () => {
  // W43 2026: Mon 19.10 – Sun 25.10 (DST ends 25.10)
  const w43 = [S('2026-10-19'), S('2026-10-22'), S('2026-10-25', { time: '23:59' })];
  assert.deepEqual(streak(w43, 3, '2026-10-26'), { weeks: 1, currentWeekCount: 0 });
  // spring DST (2027-03-28)
  const spring = [S('2027-03-22'), S('2027-03-24'), S('2027-03-28', { time: '23:00' })];
  assert.equal(streak(spring, 3, '2027-03-29').weeks, 1);
});

test('streak: year boundary (ISO week 53/1) and goal edge cases', () => {
  const w53 = days('2026-12-28', '2026-12-30', '2027-01-02');
  assert.equal(streak(w53, 3, '2027-01-05').weeks, 1);
  assert.equal(streak(days('2026-11-02'), 0, '2026-11-02').weeks, 1); // goal clamped to ≥ 1
  assert.equal(streak(days('2026-11-02', '2026-11-03'), 1, '2026-11-09').weeks, 1);
});

test('trends: points in window, nextDay x = check-in day, perWeek incl. zero weeks', () => {
  const s = [
    S('2026-09-01', { pre: { pain: 5 } }), // outside 42 days
    S('2026-10-20', { pre: { pain: 2 }, post: { pain: 3 }, nextDay: { pain: 2, at: new Date('2026-10-21T08:00:00').toISOString() } }),
    S('2026-11-02', { pre: { pain: 1 }, post: { pain: 1 }, nextDay: { pain: 1 } }), // nextDay without at → +1 day
    S('2026-11-03', { status: 'aborted', pre: { pain: 9 } }),
  ];
  const t = trends(s, { days: 42, today: '2026-11-05' });
  assert.deepEqual(t.pre, [{ x: '2026-10-20', y: 2 }, { x: '2026-11-02', y: 1 }]);
  assert.deepEqual(t.post, [{ x: '2026-10-20', y: 3 }, { x: '2026-11-02', y: 1 }]);
  assert.deepEqual(t.nextDay, [{ x: '2026-10-21', y: 2 }, { x: '2026-11-03', y: 1 }]);
  assert.equal(t.perWeek.length, 7);
  assert.equal(t.perWeek[0].weekStart, '2026-09-21');
  assert.equal(t.perWeek.at(-1).week, '2026-W45');
  assert.equal(t.perWeek.find((w) => w.week === '2026-W43').count, 1);
  assert.equal(t.perWeek.find((w) => w.week === '2026-W44').count, 0);
});

test('trends: 7-day mean and previous 7-day mean', () => {
  const s = [S('2026-10-25', { pre: { pain: 4 } }), S('2026-10-30', { pre: { pain: 2 } }), S('2026-11-04', { pre: { pain: 1 } }), S('2026-11-05', { pre: { pain: 2 } })];
  const t = trends(s, { today: '2026-11-05' });
  assert.equal(t.mean7.pre, 1.67); // 30.10 (outside: 30.10 < 30.10? no) → 30.10..05.11 = 2,1,2
  assert.equal(t.prevMean7.pre, 4);
  assert.equal(t.mean7.nextDay, null);
});

test('trends: empty history', () => {
  const t = trends([], { today: '2026-11-05', days: 7 });
  assert.deepEqual([t.pre, t.post, t.nextDay], [[], [], []]);
  assert.equal(t.mean7.pre, null);
  assert.ok(t.perWeek.length >= 1);
  assert.ok(Array.isArray(trends([]).perWeek));
});

test('calendarData: per day count + worst light, window in weeks', () => {
  const s = [
    S('2026-11-02', { light: 'green' }), S('2026-11-02', { time: '20:00', light: 'yellow', final: 'red' }),
    S('2026-11-04', { light: 'green' }), S('2026-06-01'), S('2026-11-03', { status: 'aborted' }),
  ];
  assert.deepEqual(calendarData(s, { today: '2026-11-05', weeks: 16 }), [
    { date: '2026-11-02', value: 2, traffic: 'red' }, { date: '2026-11-04', value: 1, traffic: 'green' }]);
  assert.deepEqual(calendarData(s, { today: '2026-11-03', weeks: 1 }).map((d) => d.date), ['2026-11-02']);
  assert.deepEqual(calendarData([], { today: '2026-11-05' }), []);
  const noLight = { ...S('2026-11-04'), traffic: { provisional: null, final: null } };
  assert.equal(calendarData([noLight], { today: '2026-11-05' })[0].traffic, null);
});

const settings = { bands: [{ id: 'yellow' }, { id: 'red' }, { id: 'green' }, { id: 'blue' }, { id: 'loop-orange' }, { id: 'loop-blue' }] };
const ex = (exerciseId, sets, extra = {}) => ({ exerciseId, skipped: false, sets, ...extra });

test('personalRecords: longest hold, most reps (non-hold sets), strongest band; ties keep earliest', () => {
  const s = [
    S('2026-10-20', { exercises: [ex('quad-set', [{ done: true, reps: 10, hold: 5 }]), ex('pull', [{ done: true, reps: 12, band: 'red' }])] }),
    S('2026-10-22', { exercises: [ex('quad-set', [{ done: true, reps: 10, hold: 10 }, { done: false, reps: 10, hold: 30 }]), ex('pull', [{ done: true, reps: 12, band: 'green' }])] }),
    S('2026-10-24', { exercises: [ex('quad-set', [{ done: true, reps: 20, hold: 60 }], { skipped: true }), ex('slr', [{ done: true, reps: 15 }])] }),
    S('2026-10-25', { status: 'aborted', exercises: [ex('pull', [{ done: true, reps: 50, band: 'blue' }])] }),
    S('2026-10-26', { exercises: [ex('row', [{ done: true, reps: 15, band: 'unknown-band' }])] }),
  ];
  const r = personalRecords(s, settings);
  assert.deepEqual(r.longestHold, { seconds: 10, exerciseId: 'quad-set', date: '2026-10-22' });
  assert.deepEqual(r.mostReps, { reps: 15, exerciseId: 'slr', date: '2026-10-24' });
  assert.deepEqual(r.strongestBand, { band: 'green', rank: 2, exerciseId: 'pull', date: '2026-10-22' });
  assert.deepEqual(personalRecords([], settings), { longestHold: null, mostReps: null, strongestBand: null });
});

test('newRecords: only improved keys; first record counts', () => {
  const a = { longestHold: { seconds: 10 }, mostReps: { reps: 12 }, strongestBand: { band: 'red', rank: 1 } };
  assert.deepEqual(newRecords(a, a), []);
  assert.deepEqual(newRecords(a, { longestHold: { seconds: 11 }, mostReps: { reps: 12 }, strongestBand: { band: 'green', rank: 2 } }), ['longestHold', 'strongestBand']);
  assert.deepEqual(newRecords({ longestHold: null, mostReps: null, strongestBand: null }, { longestHold: { seconds: 5 }, mostReps: null, strongestBand: null }), ['longestHold']);
  assert.deepEqual(newRecords(null, null), []);
  assert.deepEqual(newRecords({ strongestBand: { band: 'red' } }, { strongestBand: { band: 'blue' } }), ['strongestBand']);
});

test('totalHoldSeconds: done hold sets × reps; skipped/active ignored', () => {
  const s = [
    S('2026-10-20', { exercises: [ex('quad-set', [{ done: true, reps: 10, hold: 5 }, { done: false, reps: 10, hold: 5 }, { done: true, hold: 30 }])] }),
    S('2026-10-21', { exercises: [ex('quad-set', [{ done: true, reps: 10, hold: 5 }], { skipped: true })] }),
    S('2026-10-22', { status: 'active', exercises: [ex('quad-set', [{ done: true, reps: 10, hold: 5 }])] }),
    S('2026-10-23', { exercises: [ex('slr', [{ done: true, reps: 10 }])] }),
  ];
  assert.equal(totalHoldSeconds(s), 80);
  assert.equal(totalHoldSeconds([]), 0);
  assert.equal(totalHoldSeconds(undefined), 0);
});
