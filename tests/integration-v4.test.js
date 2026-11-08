// v4 integration (SPEC §15): rowing warm-up/finisher in kcal, weekly report, recommendations, summary parts,
// planned minutes for Heute/Plan, rowing voice texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionKcal, inSessionRowingKcal, MET } from '../js/logic/energy.js';
import { inSessionRowingParts, inSessionRowingSec, isCardioSession } from '../js/logic/stats.js';
import { weeklyReport } from '../js/logic/insights.js';
import { recommendLevels } from '../js/logic/traffic-light.js';
import { buildSessionPlan, plannedWorkoutMinutes, appendFinisher } from '../js/logic/progression.js';
import { estimateWorkoutMinutes } from '../js/logic/duration.js';
import { rowingPhases } from '../js/logic/cardio.js';
import { rowingPartsSummary, formatKm, rowPhaseSay, rowPhaseLabel, applyUpperBodyOnly } from '../js/views/session-helpers.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases.sort((a, b) => a.order - b.order) };
const wo = (id) => content.workouts.find((w) => w.id === id);
const done = (seconds) => ({ done: true, seconds, band: null, at: '2026-11-02T10:00:00Z' });

/** A finished p1-a strength session with a rowing warm-up (600 s) and a finisher (5 × 30 s work). */
function rowedSession({ warmupRowing = null, finisherRowing = null } = {}) {
  const st = { phaseId: 'p1-basis', exerciseLevels: {} };
  let s = buildSessionPlan(wo('p1-a'), st, content, { settings: { rowWarmupDefault: true }, now: new Date('2026-11-02T10:00:00Z') });
  s = appendFinisher(s, wo('p1-a'), st, content);
  for (const e of s.exercises) {
    if (e.section === 'cardio') e.sets = e.finisher ? [done(30), done(30), done(30), done(30), done(30)] : [done(600)];
    else e.sets = Array.from({ length: e.plannedSets }, () => ({ done: true, reps: 10, hold: null, band: null }));
  }
  return { ...s, kind: 'strength', status: 'done', startedAt: '2026-11-02T10:00:00Z', endedAt: '2026-11-02T10:50:00Z', pausedMs: 0,
    warmupRowing, finisherRowing, post: { pain: 1, swelling: 0, rpe: 5, mechanical: { locking: false, givingWay: false } } };
}

test('in-session rowing parts: warm-up/finisher seconds (display duration wins), never a cardio session', () => {
  const s = rowedSession();
  assert.equal(isCardioSession(s), false);
  assert.deepEqual(inSessionRowingParts(s), { warmupSec: 600, finisherSec: 150 });
  const s2 = rowedSession({ finisherRowing: { durationSec: 270 } });
  assert.equal(inSessionRowingSec(s2), 870);
  assert.deepEqual(inSessionRowingParts({ kind: 'cardio', rowing: { durationSec: 900 } }), { warmupSec: 0, finisherSec: 0 });
});

test('sessionKcal includes warm-up/finisher rowing (display kcal if entered), strength MET only for the rest', () => {
  const kg = 90;
  const plain = rowedSession({ finisherRowing: { durationSec: 270 } });
  const row = inSessionRowingKcal(plain, kg, content);
  // warm-up 600 s easy (3.5 MET) + finisher 150 s work (moderate 4.8) + 120 s active rest (easy 3.5)
  const expect = (MET.rowEasy * 600 + MET.rowModerate * 150 + MET.rowEasy * 120) * kg / 3600;
  assert.ok(Math.abs(row.kcal - expect) < 0.01, `${row.kcal} vs ${expect}`);
  assert.equal(row.sec, 870);
  const k = sessionKcal(plain, kg, content);
  assert.equal(k.rowingKcal, Math.round(expect));
  assert.equal(k.rowingSec, 870);
  // display kcal of the warm-up replaces its estimate
  const disp = rowedSession({ warmupRowing: { durationSec: 600, distanceM: 2100, kcalDisplay: 85 }, finisherRowing: { durationSec: 270 } });
  const rd = inSessionRowingKcal(disp, kg, content);
  assert.ok(Math.abs(rd.kcal - (85 + (MET.rowModerate * 150 + MET.rowEasy * 120) * kg / 3600)) < 0.01);
  assert.ok(sessionKcal(disp, kg, content).kcal > sessionKcal(plain, kg, content).kcal);
  // a strength session without rowing is unchanged by the v4 split
  const noRow = { ...plain, exercises: plain.exercises.filter((e) => e.section !== 'cardio'), warmupRowing: undefined, finisherRowing: undefined };
  assert.equal(sessionKcal(noRow, kg, content).rowingKcal, undefined);
});

test('weeklyReport reports in-session rowing separately (not as rowing sessions)', () => {
  const s = rowedSession({ warmupRowing: { durationSec: 600, distanceM: 2100 }, finisherRowing: { durationSec: 270 } });
  const rep = weeklyReport({ settings: {}, state: {}, sessions: [s] }, content, '2026-11-04');
  assert.equal(rep.cardio.done, 0);
  assert.equal(rep.cardio.minutes, 0);
  assert.equal(rep.cardio.inSessionMinutes, Math.round(870 / 60));
  assert.equal(rep.cardio.inSessionDistanceM, 2100);
  assert.equal(rep.cardio.inSessionCount, 1);
  assert.equal(rep.strength.done, 1);
});

test('recommendLevels: no „Höchste Stufe“ hold for the single-level rowing warm-up inside a strength session', () => {
  const s = rowedSession();
  const recs = recommendLevels(s, [], { phaseId: 'p1-basis', exerciseLevels: {} }, content, {});
  assert.ok(!recs.some((r) => r.exerciseId === 'row-warmup-10'), JSON.stringify(recs.filter((r) => r.exerciseId?.startsWith('row'))));
});

test('summary rowing parts: „Aufwärmen 10 Min · 2,1 km“, „Finisher 5 Min“; formatKm', () => {
  const s = rowedSession({ warmupRowing: { durationSec: 600, distanceM: 2100, kcalDisplay: 85 }, finisherRowing: { durationSec: 270 } });
  const parts = rowingPartsSummary(s);
  assert.deepEqual(parts.map((p) => p.text), ['Aufwärmen 10 Min · 2,1 km · 85 kcal', 'Finisher 5 Min']);
  assert.deepEqual(rowingPartsSummary({ kind: 'cardio', rowing: { durationSec: 900 } }), []);
  assert.equal(formatKm(850), '850 m');
  assert.equal(formatKm(null), '');
});

test('plannedWorkoutMinutes matches the session start estimate and follows rowWarmupDefault', () => {
  const st = { phaseId: 'p1-basis', exerciseLevels: {} };
  for (const id of ['p1-a', 'p1-b', 'p1-c']) {
    const on = plannedWorkoutMinutes(wo(id), st, content, { rowWarmupDefault: true });
    const off = plannedWorkoutMinutes(wo(id), st, content, { rowWarmupDefault: false });
    assert.equal(on.rowWarmup, true);
    assert.equal(off.rowWarmup, false);
    assert.ok(on.minutes > off.minutes && on.minutes <= 42 && off.minutes <= 32, `${id}: ${on.minutes}/${off.minutes}`);
    const plan = buildSessionPlan(wo(id), st, content, { settings: { rowWarmupDefault: true } });
    assert.equal(on.minutes, estimateWorkoutMinutes(plan, content, st, { rowWarmupDefault: true }));
  }
  // migrated v3.1 data without the key: default of the store (true) is merged in; missing → no rowing
  assert.equal(plannedWorkoutMinutes(wo('p1-a'), st, content, {}).rowWarmup, false);
  assert.equal(plannedWorkoutMinutes(wo('p4-a'), { phaseId: 'p4-entlastung' }, content, { rowWarmupDefault: true }).rowWarmup, false);
  assert.equal(plannedWorkoutMinutes(wo('p1-short'), st, content, { rowWarmupDefault: true }).rowWarmup, false);
});

test('rowing voice: technique drills speak their own text („Technik: Nur Arme …“), finisher work = „Zügig rudern“', () => {
  const st = { phaseId: 'p1-basis', exerciseLevels: {} };
  let s = buildSessionPlan(wo('p1-a'), st, content, { settings: { rowWarmupDefault: true } });
  s = appendFinisher(s, wo('p1-a'), st, content);
  const ph = rowingPhases(s, content);
  const warm = ph.filter((p) => p.exerciseId === 'row-warmup-10');
  assert.equal(rowPhaseSay(warm[0], content, s), 'Technik: Nur Arme, Beine bleiben lang');
  assert.match(rowPhaseSay(warm.at(-1), content, s), /locker rudern/i);
  const fin = ph.filter((p) => s.exercises[p.entryIndex]?.finisher);
  assert.equal(rowPhaseLabel(fin[0], content, s).big, 'Zügig rudern');
  assert.equal(rowPhaseLabel(fin[1], content, s).big, 'Locker rudern');
});

test('„Nur Oberkörper“ also skips the rowing warm-up', () => {
  const s = buildSessionPlan(wo('p1-a'), { phaseId: 'p1-basis', exerciseLevels: {} }, content, { settings: { rowWarmupDefault: true } });
  applyUpperBodyOnly(s, content);
  assert.ok(s.exercises.filter((e) => e.section === 'cardio').every((e) => e.skipped && e.skipReason === 'precheck'));
});
