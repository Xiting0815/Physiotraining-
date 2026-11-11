// v2: duration, workouts (≤ 30 min / ~15 min / rowing 15–20 min), custom workouts, rowing, energy, health,
// schedule & post-op gate, traffic-light additions, stats, badges, store/merge, insights. SPEC §12.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tempoSeconds, estimateExerciseSeconds, estimateWorkoutMinutes, fitPlanToMinutes, cappedSets, SETUP_SEC } from '../js/logic/duration.js';
import { buildSessionPlan, getWorkout, nextWorkout, rotationAfter, exerciseAvailable, phaseWorkouts, workoutKind } from '../js/logic/progression.js';
import { createCustomWorkout, updateCustomWorkout, deleteCustomWorkout, validateCustomWorkout, toWorkout, duplicateAsCustom, mergeCustomWorkouts } from '../js/logic/custom-workouts.js';
import { rowingPhases, validateRowing, pacePer500, rowingTotals, rowingPlannedSeconds } from '../js/logic/cardio.js';
import { sessionKcal, bodyWeightKg } from '../js/logic/energy.js';
import { phaseSchedule, scheduleHint, postOpStatus, canEnterPhase, suggestedSurgeryDate, taperStart } from '../js/logic/schedule.js';
import { evaluateSession, recommendLevels } from '../js/logic/traffic-light.js';
import { weeklyProgress, cardioProgress, sameDayLoadHint, streak, isCardioSession, trends } from '../js/logic/stats.js';
import { evaluateBadges, badgeRuleMet } from '../js/logic/motivation.js';
import * as insights from '../js/logic/insights.js';
import * as energy from '../js/logic/energy.js';
import { pearson, correlationText, loadVsPain, weeklyReport, opReadiness, sessionLoad, MIN_POINTS } from '../js/logic/insights.js';
import * as store from '../js/store.js';
import { mergeBackups, mergeLegacyLog } from '../js/util/export-import.js';
import { addDays } from '../js/util/date.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases.sort((a, b) => a.order - b.order), badges: load('badges').badges };
const ex = (id) => content.exercises.find((e) => e.id === id);
const maxLevels = Object.fromEntries(content.exercises.map((e) => [e.id, e.levels.length - 1]));
const settings = { weeklyGoal: 3, cardioGoalPerWeek: 3, painThresholds: { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 }, restDefault: null };
const at = (day, h = 17) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).toISOString();
let n = 0;
const S = (day, extra = {}) => ({ id: `s-${++n}`, status: 'done', phaseId: 'p1-basis', startedAt: at(day), endedAt: at(day, 18), exercises: [], traffic: { provisional: 'green', final: null, reasons: [] }, ...extra });

// ---------------------------------------------------------------------------- duration
test('duration: tempoSeconds and per-exercise estimate', () => {
  assert.equal(tempoSeconds('3-1-2'), 6);
  assert.equal(tempoSeconds(null), null);
  assert.equal(tempoSeconds('x-1'), null);
  // v4: quad-set level 0: 2 × (5 s prep + 10 × 5 s + 9 × 5 s relax) + 1 × 30 s rest + 20 s setup
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('quad-set'), {}), 2 * 100 + 30 + SETUP_SEC);
  // tke perSide level 0: 2 × (12 × 5 s × 2 + 5 switch + 5 prep) + 45 + 20
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('tke'), {}), 2 * 130 + 45 + 20);
  // plannedSets + restDefault override
  assert.equal(estimateExerciseSeconds({ level: 0, plannedSets: 1 }, ex('tke'), { restDefault: 90 }), 130 + 20);
  assert.equal(estimateExerciseSeconds({ level: 0, plannedSets: 3 }, ex('tke'), { restDefault: 90 }), 3 * 130 + 180 + 20);
  // timed rowing: no setup
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('row-steady'), {}), 720);
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('row-intervals'), {}), 6 * 60 + 5 * 60);
  assert.equal(estimateExerciseSeconds({ level: 0 }, undefined, {}), 0);
  assert.equal(cappedSets(3, { maxSets: 1 }, { maxSets: 2 }), 1);
  assert.equal(cappedSets(3, {}, { maxSets: 2 }), 2);
  assert.equal(cappedSets(1, {}, {}), 1);
});

const fresh = (w, levels = {}) => ({ phaseId: w.phaseId, exerciseLevels: levels });

test('workouts (v4): every strength workout ≤ 32 min at level 0 (no trimming) and ≤ 32 min at max levels (plan, trimmed)', () => {
  const strength = content.workouts.filter((w) => workoutKind(w) === 'strength');
  assert.equal(strength.length, 12); // 3 per phase incl. p4
  for (const w of strength) {
    assert.equal(w.maxMinutes, 32, w.id);
    const m0 = estimateWorkoutMinutes(w, content, fresh(w), settings);
    assert.ok(m0 <= 32, `${w.id} level 0: ${m0} min`);
    assert.equal(w.durationMin, m0, `${w.id}.durationMin = estimate at level 0`);
    const plan = buildSessionPlan(w, fresh(w, maxLevels), content, { settings });
    const mMax = estimateWorkoutMinutes(plan, content, null, settings);
    assert.ok(mMax <= 32, `${w.id} max levels: ${mMax} min`);
    assert.equal(plan.budgetMin, 32);
    assert.ok(plan.exercises.every((e) => e.plannedSets >= 1));
    assert.ok(plan.exercises.length >= 14, `${w.id} keeps its exercises (warm-up + 8 main + 5 stretches)`);
  }
});

test('workouts: Kurztraining (~15 min) per phase with knee + archery incl. SPT', () => {
  for (const p of content.phases) {
    const w = content.workouts.find((x) => x.id === p.short);
    assert.ok(w && w.kind === 'short' && w.phaseId === p.id, `${p.id}.short`);
    const m0 = estimateWorkoutMinutes(w, content, fresh(w), settings);
    assert.ok(m0 >= 12 && m0 <= 16, `${w.id}: ${m0} min`);
    assert.equal(w.durationMin, m0, `${w.id}.durationMin`);
    const plan = buildSessionPlan(w, fresh(w, maxLevels), content, { settings });
    assert.ok(estimateWorkoutMinutes(plan, content, null, settings) <= 16, `${w.id} max`);
    // v5.3: items marked shoulderOnly (rotator cuff / scapula while the shoulder protection is on) are extra
    const knee = w.blocks.find((b) => b.id === 'knee').items;
    const arch = w.blocks.find((b) => b.id === 'archery').items.filter((i) => !i.shoulderOnly).map((i) => i.exerciseId);
    assert.ok(knee.length >= 2 && knee.length <= 3 && arch.length >= 2 && arch.length <= 3);
    assert.ok(arch.includes('band-draw-hold'), `${w.id} has SPT`);
    assert.equal(w.warmup.length, 1);
  }
});

test('workouts: rowing sessions 15–20 min (long: 25–30), cardio list per phase, none after surgery', () => {
  for (const p of content.phases) {
    for (const id of p.cardio || []) {
      const w = content.workouts.find((x) => x.id === id);
      assert.equal(w.kind, 'cardio');
      for (const lv of [{}, maxLevels]) {
        const m = estimateWorkoutMinutes(w, content, fresh(w, lv), settings);
        // v4: the long base session (row-long) takes 25–30 min
        if (/-row-long$/.test(id)) assert.ok(m >= 25 && m <= 30, `${id}: ${m} min`);
        else assert.ok(m >= 15 && m <= 20, `${id}: ${m} min`);
      }
    }
  }
  assert.deepEqual(content.phases.find((p) => p.id === 'p1-basis').cardio, ['p1-row', 'p1-row-long']);
  assert.ok(content.phases.find((p) => p.id === 'p2-aufbau').cardio.includes('p2-row-intervals'));
  assert.ok(content.phases.find((p) => p.id === 'p3-op-vorbereitung').cardio.includes('p3-row-endurance'));
  assert.deepEqual(content.phases.find((p) => p.id === 'p4-entlastung').cardio, []);
  for (const e of content.exercises.filter((x) => x.block === 'cardio')) assert.equal(e.postOpAllowed, false);
});

test('workouts: crutch preparation and left-leg control are part of the prehab rotation', () => {
  for (const p of content.phases.filter((x) => x.kind === 'prehab')) {
    const ids = phaseWorkouts(p, content.workouts).rotation.flatMap((w) => w.blocks.flatMap((b) => b.items.map((i) => i.exerciseId)));
    assert.ok(ids.some((id) => ['chair-dip', 'band-triceps-extension'].includes(id)), `${p.id} triceps`);
    assert.ok(ids.includes('seated-press-up'), `${p.id} crutch support`);
    assert.ok(ids.includes('right-leg-sit-to-stand') || ids.includes('right-leg-band-press'), `${p.id} right leg`);
    assert.ok(ids.includes('single-leg-stance') && ids.includes('band-draw-hold'), `${p.id} balance + SPT`);
  }
});

test('fitPlanToMinutes trims main-block sets first, never below 1', () => {
  const w = content.workouts.find((x) => x.id === 'p2-b');
  const plan = buildSessionPlan(w, fresh(w, maxLevels), content, { fit: false });
  const before = estimateWorkoutMinutes(plan, content, null, settings);
  assert.ok(before > 30);
  fitPlanToMinutes(plan, content, settings, 30);
  assert.ok(estimateWorkoutMinutes(plan, content, null, settings) <= 30);
  assert.ok(plan.exercises.some((e) => e.trimmed));
  assert.ok(plan.exercises.filter((e) => e.section === 'warmup' || e.section === 'cooldown').every((e) => !e.trimmed));
  const tiny = fitPlanToMinutes(buildSessionPlan(w, fresh(w), content, { fit: false }), content, settings, 1);
  assert.ok(tiny.exercises.every((e) => e.plannedSets === 1));
});

// ---------------------------------------------------------------------------- progression / session plumbing
test('getWorkout, plan kinds, rotation stays on A/B/C', () => {
  const st = { phaseId: 'p1-basis', nextWorkoutId: 'p1-b', exerciseLevels: {}, customWorkouts: [{ id: 'cw-1', name: 'Mein', kind: 'custom', warmup: [], blocks: [{ id: 'knee', title: 'K', items: [{ exerciseId: 'step-up' }] }, { id: 'archery', title: 'A', items: [{ exerciseId: 'seated-row' }] }], cooldown: [] }] };
  assert.equal(getWorkout('p1-row', content, st).kind, 'cardio');
  const cw = getWorkout('cw-1', content, st);
  assert.equal(cw.kind, 'custom');
  assert.equal(cw.phaseId, 'p1-basis');
  assert.equal(getWorkout('nope', content, st), undefined);
  const plan = buildSessionPlan(cw, st, content, {});
  assert.equal(plan.kind, 'custom');
  assert.ok(plan.exercises.some((e) => e.exerciseId === 'step-up'), 'custom: phaseMin only warns');
  const row = buildSessionPlan(getWorkout('p1-row', content, st), st, content, {});
  assert.equal(row.kind, 'cardio');
  assert.equal(row.rowing, null);
  assert.deepEqual(row.exercises.map((e) => e.section), ['warmup', 'cardio', 'cooldown']);
  // nextWorkout ignores non-rotation ids
  assert.equal(nextWorkout({ phaseId: 'p1-basis', nextWorkoutId: 'p1-row' }, content.phases, content.workouts).id, 'p1-a');
  const phase = content.phases[0];
  assert.equal(rotationAfter(st, phase, 'p1-row'), 'p1-b');
  assert.equal(rotationAfter(st, phase, 'cw-1'), 'p1-b');
  assert.equal(rotationAfter(st, phase, 'p1-b'), 'p1-c');
  assert.equal(rotationAfter(st, phase, 'p1-c'), 'p1-a');
});

test('post-op phase: blocked exercises skipped unless the user enables them; toggles disable anywhere', () => {
  const p4 = content.phases.find((p) => p.id === 'p4-entlastung');
  assert.equal(p4.kind, 'postop');
  assert.equal(exerciseAvailable(ex('row-steady'), p4, {}), false);
  assert.equal(exerciseAvailable(ex('row-steady'), p4, { exerciseToggles: { 'row-steady': true } }), true);
  assert.equal(exerciseAvailable(ex('quad-set'), p4, {}), true);
  assert.equal(exerciseAvailable(ex('quad-set'), content.phases[0], { exerciseToggles: { 'quad-set': false } }), false);
  const w = content.workouts.find((x) => x.id === 'p1-a');
  const st = { phaseId: 'p4-entlastung', exerciseLevels: {} };
  const plan = buildSessionPlan(w, st, content, {});
  assert.ok(!plan.exercises.some((e) => e.exerciseId === 'sit-to-stand'));
  assert.equal(plan.postOp, true);
  const pa = buildSessionPlan(content.workouts.find((x) => x.id === 'p4-a'), { ...st, exerciseToggles: { 'quad-set': false } }, content, {});
  assert.ok(!pa.exercises.some((e) => e.exerciseId === 'quad-set'));
  for (const e of content.exercises.filter((x) => (x.tags || []).includes('post-op') && x.block === 'knee' && x.phaseMin === 'p1-basis' && ['patella-mobilization', 'glute-set', 'right-leg-band-press'].includes(x.id))) {
    assert.match(e.kneeNote, /Freigabe durch Arzt\/Physio/);
  }
});

// ---------------------------------------------------------------------------- custom workouts
test('custom workouts: create / validate / update / delete / duplicate / merge', () => {
  const st = { phaseId: 'p1-basis', exerciseLevels: {}, customWorkouts: [] };
  const now = new Date('2026-11-07T10:00:00Z');
  assert.throws(() => createCustomWorkout(st, { name: '', blocks: [] }, content, { now }), /Namen/);
  assert.throws(() => createCustomWorkout(st, { name: 'X', blocks: [] }, content, { now }), /mindestens eine Übung/);
  assert.throws(() => createCustomWorkout(st, { name: 'X', blocks: [{ id: 'knee', items: [{ exerciseId: 'nope' }] }] }, content, { now }), /Unbekannte/);
  assert.throws(() => createCustomWorkout(st, { name: 'X', blocks: [{ id: 'knee', items: [{ exerciseId: 'row-steady' }] }] }, content, { now }), /Rudereinheit/);
  const { state, workout, warnings } = createCustomWorkout(st, { name: ' Knie kurz ', blocks: [{ id: 'knee', items: [{ exerciseId: 'quad-set' }, { exerciseId: 'step-up' }, { exerciseId: 'seated-row' }] }] }, content, { now });
  assert.equal(workout.name, 'Knie kurz');
  assert.equal(workout.kind, 'custom');
  assert.match(workout.id, /^cw-/);
  assert.deepEqual(workout.blocks.map((b) => b.id), ['knee', 'archery']);
  assert.ok(warnings.some((w) => /erst ab/.test(w)), 'phaseMin warning');
  assert.ok(warnings.some((w) => /gehört eigentlich/.test(w)), 'block warning');
  assert.equal(state.customWorkouts.length, 1);
  const big = { name: 'Lang', blocks: [{ id: 'knee', items: ['tke', 'clamshell', 'seated-hamstring-curl', 'side-lying-hip-abduction', 'straight-leg-raise'].map((exerciseId) => ({ exerciseId })) }, { id: 'archery', items: ['pallof-press', 'er-towel', 'serratus-punch', 'sidelying-er'].map((exerciseId) => ({ exerciseId })) }] };
  const v = validateCustomWorkout({ ...big, warmup: [], cooldown: [] }, content, { ...st, exerciseLevels: maxLevels }, settings);
  assert.ok(v.ok && v.estimatedMin > 30 && v.warnings.some((w) => /30-Minuten/.test(w)));
  const later = new Date('2026-11-08T10:00:00Z');
  const up = updateCustomWorkout(state, workout.id, { name: 'Neu' }, content, { now: later });
  assert.equal(up.workout.name, 'Neu');
  assert.equal(up.workout.createdAt, workout.createdAt);
  assert.equal(up.workout.updatedAt, later.toISOString());
  assert.throws(() => updateCustomWorkout(state, 'x', {}, content), /nicht gefunden/);
  assert.equal(deleteCustomWorkout(up.state, workout.id).customWorkouts.length, 0);
  const dup = duplicateAsCustom(st, 'p1-a', content, { now });
  assert.match(dup.workout.name, /^Kopie von/);
  assert.throws(() => duplicateAsCustom(st, 'p1-row', content), /Rudereinheiten/);
  assert.equal(toWorkout(workout, st).maxMinutes, 30);
  const merged = mergeCustomWorkouts([workout], [up.workout, dup.workout]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((w) => w.id === workout.id).name, 'Neu');
});

// ---------------------------------------------------------------------------- rowing
test('rowing: guided phases, validation, pace, totals', () => {
  const st = { phaseId: 'p2-aufbau', exerciseLevels: {} };
  const plan = buildSessionPlan(content.workouts.find((w) => w.id === 'p2-row-intervals'), st, content, {});
  const ph = rowingPhases(plan, content);
  assert.equal(ph.filter((p) => p.exerciseId === 'row-intervals' && p.kind === 'work').length, 6);
  const rests = ph.filter((p) => p.kind === 'rest');
  assert.equal(rests.length, 5);
  assert.equal(rests[0].label, 'Locker rudern');
  assert.equal(ph[0].label, 'Nur Arme'); // technique drill
  assert.equal(rowingPlannedSeconds(plan, content), 120 + 660 + 120);
  const v = validateRowing({ durationSec: '960', distanceM: '3200', avgSpm: 21, avgWatt: '', kcalDisplay: '180', avgHr: 130, maxHr: 120 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.maxHr);
  assert.equal(v.value.distanceM, 3200);
  assert.equal('avgWatt' in v.value, false);
  assert.match(validateRowing({ avgSpm: 99 }).errors.avgSpm, /zwischen/);
  assert.equal(pacePer500({ durationSec: 960, distanceM: 3200 }), 150);
  assert.equal(pacePer500({}), null);
  const sessions = [S('2026-11-02', { kind: 'cardio', rowing: { durationSec: 900, distanceM: 3000, kcalDisplay: 150 } }), S('2026-11-03', { kind: 'cardio', rowing: { durationSec: 600, distanceM: 2000 } }), S('2026-11-04')];
  assert.deepEqual(rowingTotals(sessions), { sessions: 2, warmups: 0, distanceM: 5000, durationSec: 1500, kcalDisplay: 150 });
});

// ---------------------------------------------------------------------------- energy
test('energy: body weight from settings.profile.weightKg and session kcal (display > watt > MET)', () => {
  assert.equal(bodyWeightKg({ profile: { weightKg: 92.5 } }), 92.5);
  assert.equal(bodyWeightKg({ profile: { weightKg: null } }), null);
  assert.equal(bodyWeightKg({}), null);
  assert.equal(bodyWeightKg(undefined), null);
  // v3.1: weight goal / calorie target / BMR helpers are gone
  for (const k of ['bmr', 'tdee', 'bmi', 'bmrInfo', 'goalProgress', 'calorieTarget', 'currentWeight', 'weightTrend', 'kcalByDay']) assert.equal(k in energy, false, k);
  for (const k of ['sleepVsPain', 'stepsVsPain', 'weightInsight', 'bodyCompositionInsight', 'dailyPain']) assert.equal(k in insights, false, k);
  const row = { status: 'done', kind: 'cardio', startedAt: at('2026-11-07'), endedAt: at('2026-11-07', 18), rowing: { durationSec: 1200, kcalDisplay: 210, avgWatt: 100 } };
  assert.deepEqual(sessionKcal(row, 80), { kcal: 210, method: 'display', met: null, label: 'Schätzung' });
  assert.equal(sessionKcal({ ...row, rowing: { durationSec: 1200, avgWatt: 100 } }, 80).kcal, Math.round(700 / 3)); // (400+300)/3
  const met = sessionKcal({ ...row, rowing: { durationSec: 1800 }, post: { rpe: 5 } }, 80);
  assert.equal(met.method, 'met');
  assert.equal(met.kcal, Math.round(4.8 * 80 * 0.5));
  assert.equal(sessionKcal({ ...row, rowing: { durationSec: 1800 }, post: { rpe: 8 } }, 80).met, 7);
  const strength = { status: 'done', startedAt: '2026-11-07T16:00:00.000Z', endedAt: '2026-11-07T16:30:00.000Z', pausedMs: 0, post: { rpe: 5 },
    exercises: [{ section: 'knee', sets: [{ done: true }] }, { section: 'archery', sets: [{ done: true }] }] };
  const k = sessionKcal(strength, 80);
  assert.equal(k.met, 3.15);
  assert.equal(k.kcal, Math.round(3.15 * 80 * 0.5));
  assert.equal(sessionKcal({ ...strength, post: { rpe: 9 } }, null).met, Math.round(3.15 * 1.25 * 100) / 100);
});

test('energy: strength kcal falls back to the duration estimate when the clock is implausibly short', () => {
  const exs = [{ exerciseId: 'quad-set', section: 'knee', level: 0, sets: [{ done: true }, { done: true }] },
    { exerciseId: 'seated-row', section: 'archery', level: 0, sets: [{ done: true }, { done: true }] }];
  const est = estimateExerciseSeconds({ level: 0, plannedSets: 2 }, ex('quad-set')) + estimateExerciseSeconds({ level: 0, plannedSets: 2 }, ex('seated-row'));
  assert.ok(est > 120, String(est));
  const quick = { status: 'done', startedAt: '2026-11-07T16:00:00.000Z', endedAt: '2026-11-07T16:01:00.000Z', post: { rpe: 5 }, exercises: exs };
  const k = sessionKcal(quick, 80, content);
  assert.equal(k.durationSource, 'estimate');
  assert.equal(k.label, 'Schätzung');
  assert.equal(k.kcal, Math.round(k.met * 80 * est / 3600));
  // plausible clock time (>= 50 % of the estimate) is used as is
  const end = new Date(Date.parse(quick.startedAt) + est * 1000).toISOString();
  const k2 = sessionKcal({ ...quick, endedAt: end }, 80, content);
  assert.equal(k2.durationSource, 'clock');
  assert.equal(k2.kcal, Math.round(k2.met * 80 * est / 3600));
  // without content: wall-clock only
  assert.equal(sessionKcal(quick, 80).durationSource, 'clock');
  // rowing without any duration: planned rowing time
  const row = { status: 'done', kind: 'cardio', startedAt: quick.startedAt, endedAt: quick.startedAt, rowing: { avgWatt: 100 },
    exercises: [{ exerciseId: 'row-steady', section: 'cardio', level: 0, sets: [{ done: false }] }] };
  const kr = sessionKcal(row, 80, content);
  assert.equal(kr.method, 'watt');
  assert.equal(kr.durationSource, 'estimate');
  assert.equal(kr.kcal, Math.round(700 * estimateExerciseSeconds({ level: 0 }, ex('row-steady')) / 3600));
});

test('schedule: phases planned backwards from the surgery date (2027-01-05)', () => {
  const sched = phaseSchedule(content.phases, '2027-01-05', { prehabStart: '2026-11-07' });
  const by = Object.fromEntries(sched.map((x) => [x.phaseId, x]));
  assert.deepEqual([by['p1-basis'].start, by['p1-basis'].end], ['2026-11-07', '2026-11-27']);
  assert.deepEqual([by['p2-aufbau'].start, by['p2-aufbau'].end], ['2026-11-28', '2026-12-18']);
  assert.deepEqual([by['p3-op-vorbereitung'].start, by['p3-op-vorbereitung'].end], ['2026-12-19', '2027-01-04']);
  assert.deepEqual([by['p4-entlastung'].start, by['p4-entlastung'].end, by['p4-entlastung'].days], ['2027-01-05', '2027-02-15', 42]);
  assert.equal(taperStart('2027-01-05'), '2026-12-29');
  assert.equal(phaseSchedule(content.phases, null), null);
  const s = { surgeryDate: '2027-01-05', prehabStart: '2026-11-07' };
  assert.equal(scheduleHint(content.phases, s, { phaseId: 'p1-basis' }, '2026-11-10').status, 'onTrack');
  const behind = scheduleHint(content.phases, s, { phaseId: 'p1-basis' }, '2026-12-01');
  assert.equal(behind.status, 'behind');
  assert.equal(behind.expectedPhaseId, 'p2-aufbau');
  assert.match(behind.text, /Kriterien/);
  assert.equal(scheduleHint(content.phases, s, { phaseId: 'p3-op-vorbereitung' }, '2026-11-10').status, 'ahead');
  assert.equal(scheduleHint(content.phases, {}, { phaseId: 'p1-basis' }, '2026-11-10').status, 'none');
  assert.equal(suggestedSurgeryDate({ surgeryDate: null, surgeryDateSuggested: '2027-01-05' }), '2027-01-05');
  assert.equal(suggestedSurgeryDate({ surgeryDate: '2027-02-01' }), null);
});

test('post-op gate: surgery date passed + clearance; ends after 6 weeks or release', () => {
  const settingsS = { surgeryDate: '2027-01-05' };
  const p4 = content.phases.find((p) => p.id === 'p4-entlastung');
  let st = postOpStatus(settingsS, {}, '2027-01-05');
  assert.equal(st.unlocked, false);
  assert.equal(st.reasons.length, 2);
  st = postOpStatus(settingsS, {}, '2027-01-08');
  assert.equal(st.surgeryPassed, true);
  assert.equal(canEnterPhase(p4, settingsS, {}, '2027-01-08').ok, false);
  const state = { postOpClearance: { confirmedAt: '2027-01-08T10:00:00.000Z', note: 'Physio ok' } };
  st = postOpStatus(settingsS, state, '2027-01-08');
  assert.equal(st.unlocked, true);
  assert.equal(st.week, 1);
  assert.equal(st.daysLeft, 39);
  assert.equal(st.ended, false);
  assert.equal(canEnterPhase(p4, settingsS, state, '2027-01-08').ok, true);
  assert.equal(canEnterPhase(content.phases[1], {}, {}, '2026-11-08').ok, true);
  st = postOpStatus(settingsS, state, '2027-02-16');
  assert.equal(st.ended, true);
  assert.match(st.message, /Reha-Phase mit Physio planen/);
  assert.equal(postOpStatus(settingsS, { ...state, postOpEndClearance: { confirmedAt: 'x' } }, '2027-01-30').ended, true);
});

// ---------------------------------------------------------------------------- traffic light
test('traffic light: rowing pain counts like the knee block; post-op red flags → contact doctor', () => {
  const base = { pre: { pain: 1, swelling: 0, mechanical: {} }, post: { pain: 1, swelling: 0, rpe: 5 } };
  const row = { ...base, exercises: [{ exerciseId: 'row-steady', section: 'cardio', painDuring: 4, sets: [{ done: true }] }] };
  assert.equal(evaluateSession(row, settings).traffic, 'yellow');
  assert.equal(evaluateSession({ ...row, exercises: [{ ...row.exercises[0], painDuring: 7 }] }, settings).traffic, 'red');
  const po = { ...base, postOp: true, exercises: [{ exerciseId: 'quad-set', section: 'knee', painDuring: 1, sets: [{ done: true }] }] };
  assert.equal(evaluateSession(po, settings).traffic, 'green');
  for (const variant of [{ post: { ...base.post, redness: true } }, { post: { ...base.post, fever: true } }, { post: { ...base.post, swelling: 1 } }, { post: { ...base.post, pain: 6 } }]) {
    const res = evaluateSession({ ...po, ...variant }, settings);
    assert.equal(res.traffic, 'stop', JSON.stringify(variant));
    assert.ok(res.reasons.some((r) => /Arzt kontaktieren/.test(r)));
  }
  const pd = evaluateSession({ ...po, exercises: [{ ...po.exercises[0], painDuring: 6 }] }, settings);
  assert.equal(pd.traffic, 'stop');
  const recs = recommendLevels({ ...po, post: { ...base.post, fever: true } }, [], { exerciseLevels: {} }, content, settings);
  assert.equal(recs[0].action, 'consult');
  assert.match(recs[0].reason, /Arzt kontaktieren/);
  // same values outside the post-op phase are not "stop"
  assert.equal(evaluateSession({ ...po, postOp: false, post: { ...base.post, pain: 6 } }, settings).traffic, 'red');
});

test('traffic light: rowing progression after 2× green with RPE ≤ 6, regress on red', () => {
  const mk = (id, rpe, pain = 1) => ({ id, status: 'done', kind: 'cardio', startedAt: at('2026-11-0' + id.slice(-1)), endedAt: at('2026-11-0' + id.slice(-1), 18),
    pre: { pain: 1, swelling: 0, mechanical: {} }, post: { pain: 1, swelling: 0, rpe }, traffic: { provisional: 'green', final: null },
    exercises: [{ exerciseId: 'row-steady', section: 'cardio', level: 0, painDuring: pain, rpe: null, sets: [{ done: true, seconds: 720 }] }] });
  const st = { phaseId: 'p1-basis', exerciseLevels: {} };
  const first = mk('r1', 5);
  assert.equal(recommendLevels(first, [], st, content, settings)[0].action, 'hold');
  const second = mk('r2', 5);
  const r = recommendLevels(second, [first], st, content, settings);
  assert.equal(r[0].action, 'progress');
  assert.equal(r[0].toLevel, 1);
  assert.equal(recommendLevels(mk('r3', 8), [first], st, content, settings)[0].action, 'hold');
  assert.equal(recommendLevels(mk('r4', 5, 7), [first], { ...st, exerciseLevels: { 'row-steady': 2 } }, content, settings)[0].action, 'regress');
});

// ---------------------------------------------------------------------------- stats
test('stats: strength goal excludes rowing, cardio goal, same-day hint, cardio streak, trends.perWeek', () => {
  const s = [S('2026-11-02'), S('2026-11-03', { kind: 'cardio', rowing: { durationSec: 900, distanceM: 3000 } }), S('2026-11-04', { kind: 'short' }), S('2026-11-04', { kind: 'cardio', rowing: { durationSec: 600 } })];
  assert.equal(isCardioSession(s[1]), true);
  assert.equal(weeklyProgress(s, 3, '2026-11-05').done, 2);
  assert.deepEqual(cardioProgress(s, 3, '2026-11-05'), { done: 2, goal: 3, ratio: 2 / 3, minutes: 25, distanceM: 3000, warmupMinutes: 0, warmupCount: 0 });
  assert.match(sameDayLoadHint(s, '2026-11-04'), /Erholung/);
  assert.equal(sameDayLoadHint(s, '2026-11-02'), null);
  assert.match(sameDayLoadHint(s, '2026-11-02', 'cardio'), /Erholung/);
  assert.equal(sameDayLoadHint(s, '2026-11-03', 'cardio'), null);
  assert.equal(streak(s, 2, '2026-11-05', { cardio: true }).weeks, 1);
  const wk = trends(s, { today: '2026-11-05', days: 7 }).perWeek.at(-1);
  assert.equal(wk.count, 2);
  assert.equal(wk.cardio, 2);
});

// ---------------------------------------------------------------------------- badges
test('badges v2: rowing, custom workout (v3.1: weight/diary badges removed)', () => {
  const ids = content.badges.map((b) => b.id);
  for (const id of ['first-row', 'row-10km', 'row-50km', 'first-custom']) assert.ok(ids.includes(id), id);
  for (const id of ['minus-2kg', 'minus-5kg', 'goal-reached', 'log-7']) assert.ok(!ids.includes(id), id);
  const base = { settings: { weeklyGoal: 3 }, state: { badges: {}, phaseHistory: [{ phaseId: 'p1-basis' }], customWorkouts: [], healthLog: [] }, sessions: [] };
  assert.deepEqual(evaluateBadges(base, content.badges, { today: '2026-11-07' }), []);
  const rows = [S('2026-11-02', { kind: 'cardio', rowing: { distanceM: 6000 } }), S('2026-11-04', { kind: 'cardio', rowing: { distanceM: 4500 } })];
  const d1 = { ...base, sessions: rows };
  const got = evaluateBadges(d1, content.badges, { today: '2026-11-07' });
  assert.ok(got.includes('first-row') && got.includes('row-10km') && !got.includes('row-50km'));
  assert.ok(got.includes('first-session'));
  assert.ok(!got.includes('week-3'));
  assert.equal(badgeRuleMet({ type: 'customWorkout' }, { ...base, state: { ...base.state, customWorkouts: [{ id: 'cw-1' }] } }), true);
  // legacy weight goal / diary data no longer earns anything
  const log = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-10-25', i), weightKg: 92 - i }));
  const d2 = { ...base, settings: { ...base.settings, weightGoal: { targetKg: 90, startKg: 92 } }, state: { ...base.state, healthLog: log, badges: { 'minus-2kg': 'x' } } };
  assert.deepEqual(evaluateBadges(d2, content.badges, { today: '2026-11-07' }), []);
});

// ---------------------------------------------------------------------------- store / backup merge
test('store v2 defaults: additive keys, no schema bump, surgery date never set silently', () => {
  const d = store.defaults();
  assert.equal(store.SCHEMA_VERSION, 1);
  assert.equal(d.settings.cardioGoalPerWeek, 3);
  assert.equal(d.settings.surgeryDate, null);
  assert.equal(d.settings.surgeryDateSuggested, '2027-01-05');
  assert.deepEqual(d.settings.profile, { weightKg: null });
  assert.equal('weightGoal' in d.settings, false, 'v3.1: no weight goal for new users');
  assert.deepEqual(d.state.customWorkouts, []);
  assert.equal('healthLog' in d.state, false, 'v3.1: no diary for new users');
  assert.deepEqual(d.state.exerciseToggles, {});
  assert.equal(d.state.postOpClearance, null);
  // v1 data from before v2 gains the new keys; an existing surgery date is kept
  const old = { schemaVersion: 1, settings: { surgeryDate: '2027-01-15', weeklyGoal: 3 }, state: { phaseId: 'p1-basis', xp: 50 }, sessions: [] };
  const m = store.migrate(old);
  assert.equal(m.settings.surgeryDate, '2027-01-15');
  assert.equal(m.settings.cardioGoalPerWeek, 3);
  assert.equal(store.migrate({ ...old, settings: { ...old.settings, cardioGoalPerWeek: 3 } }).settings.cardioGoalPerWeek, 3, 'stored goal is kept');
  assert.deepEqual(m.settings.profile, { weightKg: null });
  // v2/v3 data: weightGoal / healthLog / legacy profile keys stay untouched, weightKg prefilled from the latest log weight
  const log = [{ date: '2026-11-01', weightKg: 91.2 }, { date: '2026-11-05', steps: 5000 }, { date: '2026-11-03', weightKg: 90.44 }, { date: '2026-10-01', weightKg: 95 }];
  const withGoal = store.migrate({ ...old, settings: { ...old.settings, weightGoal: { targetKg: 80 }, profile: { heightCm: 182, activityLevel: 'light' } }, state: { ...old.state, healthLog: log } });
  assert.deepEqual(withGoal.settings.weightGoal, { targetKg: 80 });
  assert.deepEqual(withGoal.settings.profile, { heightCm: 182, activityLevel: 'light', weightKg: 90.4 });
  assert.deepEqual(withGoal.state.healthLog, log);
  // runs once: an existing weightKg key (even null) is never overwritten
  assert.equal(store.migrate({ ...old, settings: { ...old.settings, profile: { weightKg: null } }, state: { healthLog: log } }).settings.profile.weightKg, null);
  assert.equal(store.migrate({ ...old, settings: { ...old.settings, profile: { weightKg: 77 } }, state: { healthLog: log } }).settings.profile.weightKg, 77);
  // no profile at all + log; implausible weights ignored
  assert.equal(store.migrate({ ...old, state: { healthLog: log } }).settings.profile.weightKg, 90.4);
  assert.equal(store.migrate({ ...old, state: { healthLog: [{ date: '2026-11-01', weightKg: 5 }, 'x', null] } }).settings.profile.weightKg, null);
  // idempotent
  assert.deepEqual(store.migrate(store.migrate({ ...old, state: { healthLog: log } })).settings.profile, { weightKg: 90.4 });
});

test('mergeBackups v2: legacy health log by date, custom workouts by id, profile gaps filled', () => {
  const cur = store.defaults();
  cur.state.healthLog = [{ date: '2026-11-07', weightKg: 88 }];
  cur.state.customWorkouts = [{ id: 'cw-a', name: 'A', updatedAt: '2026-11-07T00:00:00Z', createdAt: '2026-11-01T00:00:00Z' }];
  cur.settings.profile = { heightCm: 180, birthYear: null, sex: null, activityLevel: 'light' };
  const inc = store.defaults();
  inc.state.healthLog = [{ date: '2026-11-06', weightKg: 88.5 }, { date: '2026-11-07', weightKg: 90, steps: 7000 }];
  inc.state.customWorkouts = [{ id: 'cw-a', name: 'A alt', updatedAt: '2026-11-02T00:00:00Z', createdAt: '2026-11-01T00:00:00Z' }, { id: 'cw-b', name: 'B', updatedAt: '2026-11-03T00:00:00Z', createdAt: '2026-11-03T00:00:00Z' }];
  inc.settings.profile = { heightCm: 170, birthYear: 1986, sex: 'm', activityLevel: 'moderate' };
  inc.settings.weightGoal = { targetKg: 82 };
  inc.state.postOpClearance = { confirmedAt: 'x', note: '' };
  const m = mergeBackups(cur, inc);
  assert.deepEqual(m.state.healthLog.map((e) => [e.date, e.weightKg]), [['2026-11-06', 88.5], ['2026-11-07', 88]]);
  assert.equal(m.state.healthLog[1].steps, 7000);
  assert.deepEqual(m.state.customWorkouts.map((w) => w.name), ['A', 'B']);
  assert.equal(m.settings.profile.heightCm, 180);
  assert.equal(m.settings.profile.birthYear, 1986);
  assert.equal(m.settings.profile.activityLevel, 'light');
  assert.deepEqual(m.settings.weightGoal, { targetKg: 82 });
  assert.deepEqual(m.state.postOpClearance, { confirmedAt: 'x', note: '' });
  // without legacy data nothing is added
  const plain = mergeBackups(store.defaults(), store.defaults());
  assert.equal('healthLog' in plain.state, false);
  assert.equal('weightGoal' in plain.settings, false);
  assert.deepEqual(mergeLegacyLog([{ date: '2026-11-02', a: 1 }, 'x'], [{ date: '2026-11-01' }, { date: '2026-11-02', a: 2, b: 3 }]), [{ date: '2026-11-01' }, { date: '2026-11-02', a: 1, b: 3 }]);
});

// ---------------------------------------------------------------------------- insights
test('insights: pearson + cautious wording', () => {
  assert.equal(pearson([1, 2, 3], [1, 2, 3]), null);
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.ok(Math.abs(pearson(xs, xs.map((x) => 2 * x + 1)) - 1) < 1e-9);
  assert.ok(Math.abs(pearson(xs, xs.map((x) => -x)) + 1) < 1e-9);
  assert.equal(pearson(xs, xs.map(() => 3)), null);
  assert.match(correlationText(null, 3, { x: 'a', more: 'm', less: 'l' }), /zu wenige Daten \(3 von mindestens 8/);
  assert.match(correlationText(0.1, 10, { x: 'a', more: 'm', less: 'l' }), /Kein erkennbarer/);
  const t = correlationText(-0.5, 12, { x: 'mehr Schlaf', more: 'höher', less: 'niedriger' });
  assert.match(t, /mäßige Tendenz/);
  assert.match(t, /eher niedriger/);
  assert.match(t, /keinen Beweis für Ursache und Wirkung/);
  assert.equal(MIN_POINTS, 8);
});

const ndSession = (day, { rpe = 5, minutes = 30, nd = 1, pre = 1, kind } = {}) => ({
  id: `s-${++n}`, status: 'done', ...(kind ? { kind } : {}), startedAt: new Date(Date.parse(at(day)) - minutes * 60000).toISOString(), endedAt: at(day),
  pre: { pain: pre, swelling: 0 }, post: { pain: 1, swelling: 0, rpe }, nextDay: { pain: nd, swelling: 0, stiffness: 0, at: at(addDays(day, 1), 9) },
  traffic: { provisional: 'green', final: 'green' }, exercises: [],
});

test('insights: load vs. next-day pain', () => {
  const sessions = Array.from({ length: 10 }, (_, i) => ndSession(addDays('2026-10-01', i * 2), { rpe: 3 + (i % 5), minutes: 30, nd: (i % 5) }));
  assert.equal(sessionLoad(sessions[0]), 90);
  const lv = loadVsPain(sessions, { today: '2026-10-25' });
  assert.equal(lv.n, 10);
  assert.ok(lv.r > 0.99);
  assert.match(lv.text, /höher am Folgetag/);
  assert.ok(lv.weekly.length >= 3);
});

test('insights: weekly report (training only), OP readiness', () => {
  const data = store.defaults();
  data.settings.profile = { weightKg: 90 };
  data.sessions = [ndSession('2026-11-02'), ndSession('2026-11-04'), ndSession('2026-11-06'),
    { ...ndSession('2026-11-03', { kind: 'cardio' }), rowing: { durationSec: 960, distanceM: 3500, kcalDisplay: 190 } },
    { ...ndSession('2026-11-04', { kind: 'cardio' }), rowing: { durationSec: 900, distanceM: 3200 } }];
  data.state.healthLog = [{ date: '2026-11-03', weightKg: 60, sleepH: 7 }]; // legacy, ignored
  const rep = weeklyReport(data, content, '2026-11-07');
  assert.equal(rep.weekStart, '2026-11-02');
  assert.deepEqual(rep.strength, { done: 3, goal: 3 });
  assert.equal(rep.cardio.done, 2);
  assert.equal(rep.cardio.minutes, 31);
  assert.equal(rep.cardio.distanceM, 6700);
  assert.equal(rep.lights.green, 5);
  assert.ok(rep.highlights.some((h) => /Krafttraining-Ziel/.test(h)));
  assert.ok(rep.notes.some((x) => /selben Tag/.test(x)));
  assert.ok(rep.kcal > 190);
  for (const k of ['weight', 'health', 'logDays']) assert.equal(k in rep, false, k);
  assert.ok(!rep.highlights.some((h) => /Gewicht/.test(h)));
  // kcal use settings.profile.weightKg (MET part scales with weight; display kcal stay)
  const heavy = weeklyReport({ ...data, settings: { ...data.settings, profile: { weightKg: 120 } } }, content, '2026-11-07');
  assert.ok(heavy.kcal > rep.kcal);
  const ready = opReadiness(data, content, '2026-11-07');
  assert.ok(ready.score >= 0 && ready.score <= 100);
  assert.equal(ready.parts.swellingFree.score, 100);
  assert.ok(ready.parts.regularity.score > 0);
  assert.equal(typeof ready.label, 'string');
  const empty = opReadiness(store.defaults(), content, '2026-11-07');
  assert.ok(empty.score < 20 && empty.tips.length > 0);
  assert.deepEqual(Object.values(ready.parts).reduce((a, p) => a + p.weight, 0), 100);
});

test('store.load persists the v3.1 weight prefill once and keeps legacy data', () => {
  const m = new Map();
  const mem = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const legacy = { schemaVersion: 1, settings: { weeklyGoal: 3, profile: { heightCm: 182 }, weightGoal: { targetKg: 95 } },
    state: { healthLog: [{ date: '2026-11-01', weightKg: 101.75 }], badges: { 'minus-2kg': 'x' } }, sessions: [] };
  m.set(store.STORAGE_KEY, JSON.stringify(legacy));
  store._setStorage(mem);
  const d = store.load();
  assert.equal(d.settings.profile.weightKg, 101.8);
  const saved = JSON.parse(m.get(store.STORAGE_KEY));
  assert.equal(saved.settings.profile.weightKg, 101.8);
  assert.deepEqual(saved.state.healthLog, legacy.state.healthLog);
  assert.deepEqual(saved.settings.weightGoal, { targetKg: 95 });
  assert.equal(saved.state.badges['minus-2kg'], 'x');
  store._setStorage(null);
});
