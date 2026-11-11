// v4: mobility warm-up, static stretching, rowing warm-up in strength sessions, prep/relax timing, cue plans.
// SPEC §15.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  estimateExerciseSeconds, estimateWorkoutMinutes, setupSeconds, effectiveDose, workoutItems,
  MAX_SESSION_WITH_ROW_MIN, STRENGTH_SESSION_MIN, DEFAULT_PREP_SEC,
} from '../js/logic/duration.js';
import { buildSessionPlan, canRowWarmup, planBudgetMinutes, workoutKind, phaseWorkouts, finisherPlan, appendFinisher, finisherEligible } from '../js/logic/progression.js';
import { exerciseCuePlan, cuePlanSeconds, cueWordsFor, cueKind, tempoParts, CUE_PHASES, DEFAULT_CUE_WORDS, BREATH_CUE_WORDS } from '../js/logic/cues.js';
import { isCardioSession, cardioProgress, warmupRowingSec, personalRecords, totalHoldSeconds, weeklyProgress } from '../js/logic/stats.js';
import { rowingTotals, rowingRecords } from '../js/logic/cardio.js';
import * as store from '../js/store.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases.sort((a, b) => a.order - b.order) };
const ex = (id) => content.exercises.find((e) => e.id === id);
const wo = (id) => content.workouts.find((w) => w.id === id);
const maxLevels = Object.fromEntries(content.exercises.map((e) => [e.id, e.levels.length - 1]));
const settings = { weeklyGoal: 3, restDefault: null };
const fresh = (w, levels = {}) => ({ phaseId: w.phaseId, exerciseLevels: levels });
const strength = content.workouts.filter((w) => workoutKind(w) === 'strength');
const postop = (w) => content.phases.find((p) => p.id === w.phaseId)?.kind === 'postop';

// ---------------------------------------------------------------------------- content
test('v4 content: every strength workout has a mobility warm-up (3–4 min) and stretching + 4-7-8 breathing cool-down (~5 min)', () => {
  assert.equal(strength.length, 12);
  for (const w of strength) {
    const warm = w.warmup.map((i) => ex(i.exerciseId));
    const cool = w.cooldown.map((i) => ex(i.exerciseId));
    // v5.3: p1–p3 warm-ups start with a short knee relief (patella mobilisation, SPEC §18.3)
    assert.ok(warm.length >= 4 && warm.every((e) => e.block === 'warmup' && e.category === 'mobilitaet' || e.id === 'ankle-pumps' || e.id === 'patella-mobilization'), `${w.id} warm-up`);
    assert.equal(cool.at(-1).id, 'breathing-reset', `${w.id} ends with 4-7-8 breathing`);
    const holds = cool.slice(0, -1);
    assert.ok(holds.length >= 4 && holds.every((e) => e.block === 'cooldown' && e.category === 'dehnung' && e.type === 'hold'), `${w.id} cool-down = holds`);
    const sec = (items) => items.reduce((a, i) => a + estimateExerciseSeconds({ level: 0, plannedSets: 1, override: i.override }, ex(i.exerciseId), {}), 0);
    assert.ok(sec(w.warmup) >= 170 && sec(w.warmup) <= 240, `${w.id} warm-up ${sec(w.warmup)} s`);
    assert.ok(sec(w.cooldown) >= 240 && sec(w.cooldown) <= 320, `${w.id} cool-down ${sec(w.cooldown)} s`);
    if (postop(w)) {
      for (const e of [...warm, ...cool]) assert.notEqual(e.postOpAllowed, false, `${w.id}: ${e.id} must be seated/supine`);
      assert.equal(w.rowWarmup, undefined, `${w.id}: no rowing after surgery`);
    } else {
      assert.equal(w.rowWarmup, 'row-warmup-10', w.id);
      assert.ok(w.warmup.some((i) => i.keepWithRow), `${w.id} keeps shoulder mobility after rowing`);
      assert.ok(w.warmup.some((i) => !i.keepWithRow), `${w.id} has a general part replaced by rowing`);
    }
  }
});

test('v4 content: short workouts use the compact 2-min flows', () => {
  for (const p of content.phases) {
    const w = wo(p.short);
    assert.equal(w.warmup.length, 1);
    assert.equal(w.cooldown.length, 1);
    const [a, b] = [ex(w.warmup[0].exerciseId), ex(w.cooldown[0].exerciseId)];
    for (const e of [a, b]) {
      assert.equal(e.levels[0].seconds, 120, e.id);
      assert.equal(e.levels[0].phases.reduce((s, x) => s + x.seconds, 0), 120, `${e.id} phases add up`);
      if (p.kind === 'postop') assert.notEqual(e.postOpAllowed, false, `${w.id}: ${e.id}`);
    }
    assert.equal(w.rowWarmup, undefined);
  }
});

test('v4 content: stretches are honest about DOMS, knee-safe, and the hip flexor stretch avoids deep flexion', () => {
  const stretches = content.exercises.filter((e) => e.category === 'dehnung' && e.type === 'hold');
  assert.ok(stretches.length >= 12);
  for (const e of stretches) {
    assert.match(e.description, /Muskelkater/, `${e.id}: honest note`);
    assert.ok(e.levels.every((l) => l.hold >= 20 && l.hold <= 30), `${e.id}: 20–30 s holds`);
    assert.ok(e.kneeNote.length > 0, e.id);
  }
  assert.match(ex('hip-flexor-stretch-standing').kneeNote, /Ferse zum Po/);
  assert.equal(ex('hip-flexor-stretch-standing').postOpAllowed, false);
  assert.equal(ex('figure-4-stretch-supine').postOpAllowed, false);
  assert.ok(!content.exercises.some((e) => /quad(riceps)?-stretch/.test(e.id)), 'no heel-to-buttock quad stretch');
  for (const id of ['leg-swing-front', 'leg-swing-side', 'hip-circles-standing']) assert.equal(ex(id).postOpAllowed, false, id);
});

test('v4 content: row-warmup-10 = 2 min technique + 8 min easy (RPE 3–4, SPM 18–22), blocked after surgery', () => {
  const r = ex('row-warmup-10');
  assert.equal(r.block, 'cardio');
  assert.equal(r.postOpAllowed, false);
  const l = r.levels[0];
  assert.equal(l.seconds, 600);
  assert.equal(l.phases.reduce((a, p) => a + p.seconds, 0), 600);
  assert.equal(l.phases.slice(0, -1).reduce((a, p) => a + p.seconds, 0), 120);
  assert.deepEqual(l.targetSpm, [18, 22]);
  assert.deepEqual(l.targetRpe, [3, 4]);
  assert.equal(estimateExerciseSeconds({ level: 0 }, r, {}), 600);
});

test('v4 content: cueWords use known keys and non-empty strings', () => {
  const keys = [...Object.keys(DEFAULT_CUE_WORDS.reps), ...Object.keys(BREATH_CUE_WORDS)];
  for (const e of content.exercises) {
    if (!e.cueWords) continue;
    for (const [k, v] of Object.entries(e.cueWords)) {
      assert.ok(keys.includes(k), `${e.id}.cueWords.${k}`);
      assert.ok(typeof v === 'string' && v.length > 0 && v.length <= 40, `${e.id}.cueWords.${k}`);
    }
  }
  assert.equal(cueWordsFor(ex('band-pull-apart')).up, 'Auseinanderziehen');
});

// ---------------------------------------------------------------------------- duration
test('v4 duration: prep before every set, ≥ 5 s relax between hold reps, setupSec', () => {
  // quad-set level 0: 2 sets × (5 prep + 10 × 5 s + 9 × 5 s) + 30 rest + 20 setup
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('quad-set'), {}), 250);
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('quad-set'), { prepSeconds: 0 }), 240);
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('quad-set'), { holdRelaxSeconds: 8 }), 250 + 2 * 9 * 3);
  assert.equal(effectiveDose({ level: 0 }, ex('quad-set'), {}).restBetween, 5);
  assert.equal(effectiveDose({ level: 0 }, ex('endurance-series'), {}).restBetween, 20, 'longer restBetween kept');
  assert.equal(effectiveDose({ level: 0 }, ex('row-steady'), {}).prep, 0, 'no prep inside the rowing timer');
  // stretch perSide 20 s: 5 prep + 2 × 20 + 5 switch + 5 setup
  assert.equal(setupSeconds(ex('doorway-pec-stretch')), 5);
  assert.equal(estimateExerciseSeconds({ level: 0 }, ex('doorway-pec-stretch'), {}), 55);
  assert.equal(DEFAULT_PREP_SEC, 5);
});

test('v4 duration: strength ≤ 32 min without, ≤ 42 min with the rowing warm-up (≈ 40 min); durationMinWithRow in sync', () => {
  for (const w of strength) {
    const st = fresh(w);
    assert.equal(w.durationMin, estimateWorkoutMinutes(w, content, st, settings));
    if (!w.rowWarmup) { assert.equal(w.durationMinWithRow, undefined); continue; }
    const mRow = estimateWorkoutMinutes(w, content, st, settings, { rowWarmup: true });
    assert.equal(w.durationMinWithRow, mRow, `${w.id}.durationMinWithRow`);
    assert.ok(mRow >= 36 && mRow <= MAX_SESSION_WITH_ROW_MIN, `${w.id} with rowing: ${mRow} min`);
    const plan = buildSessionPlan(w, fresh(w, maxLevels), content, { settings, rowWarmup: true });
    assert.ok(estimateWorkoutMinutes(plan, content, null, settings) <= 42, `${w.id} max levels with rowing`);
    assert.equal(plan.budgetMin, 42);
    assert.ok(!plan.exercises.find((e) => e.section === 'cardio').trimmed);
  }
  assert.equal(STRENGTH_SESSION_MIN, 32);
});

// ---------------------------------------------------------------------------- plan with rowing warm-up
test('v4 buildSessionPlan: rowWarmup inserts the rowing block and keeps only keepWithRow mobility', () => {
  const w = wo('p1-a');
  const st = fresh(w);
  const row = buildSessionPlan(w, st, content, { settings, rowWarmup: true });
  assert.equal(row.rowWarmup, true);
  assert.equal(row.warmupRowing, null);
  assert.equal(row.kind, 'strength');
  assert.equal(row.exercises[0].exerciseId, 'row-warmup-10');
  assert.equal(row.exercises[0].section, 'cardio');
  assert.equal(row.exercises[0].plannedSets, 1);
  const warm = row.exercises.filter((e) => e.section === 'warmup').map((e) => e.exerciseId);
  assert.deepEqual(warm, w.warmup.filter((i) => i.keepWithRow).map((i) => i.exerciseId));
  assert.ok(!('rowing' in row), 'strength plans never get session.rowing');
  const plain = buildSessionPlan(w, st, content, { settings, rowWarmup: false });
  assert.equal(plain.rowWarmup, false);
  assert.ok(!('warmupRowing' in plain));
  assert.ok(!plain.exercises.some((e) => e.section === 'cardio'));
  assert.deepEqual(plain.exercises.filter((e) => e.section === 'warmup').map((e) => e.exerciseId), w.warmup.map((i) => i.exerciseId));
  assert.equal(plain.budgetMin, 32);
  // default from settings.rowWarmupDefault; no settings → false
  assert.equal(buildSessionPlan(w, st, content, { settings: { rowWarmupDefault: true } }).rowWarmup, true);
  assert.equal(buildSessionPlan(w, st, content, {}).rowWarmup, false);
  assert.equal(buildSessionPlan(w, st, content, { settings: { rowWarmupDefault: true }, rowWarmup: false }).rowWarmup, false);
  // the workout items helper mirrors it
  assert.equal(workoutItems(w, { rowWarmup: true })[0].section, 'cardio');
});

test('v4 canRowWarmup: never in p4, never for short/custom/cardio, respects user toggles', () => {
  const p4 = wo('p4-a');
  assert.equal(canRowWarmup(p4, fresh(p4), content), false);
  assert.equal(buildSessionPlan(p4, fresh(p4), content, { rowWarmup: true }).rowWarmup, false);
  // a prehab workout started while the state is already in p4 (post-op) → no rowing either
  const p1 = wo('p1-a');
  assert.equal(canRowWarmup(p1, { phaseId: 'p4-entlastung', exerciseLevels: {} }, content), false);
  assert.equal(canRowWarmup(p1, { ...fresh(p1), exerciseToggles: { 'row-warmup-10': false } }, content), false);
  assert.equal(canRowWarmup(p1, fresh(p1), content), true);
  assert.equal(canRowWarmup(wo('p1-short'), fresh(p1), content), false);
  assert.equal(canRowWarmup(wo('p1-row'), fresh(p1), content), false);
  assert.equal(planBudgetMinutes(wo('p1-row')), null);
  assert.equal(planBudgetMinutes(wo('p1-short')), 16);
  assert.equal(planBudgetMinutes(p1, true), 42);
  for (const p of content.phases) {
    for (const w of phaseWorkouts(p, content.workouts).rotation) assert.equal(canRowWarmup(w, fresh(w), content), p.kind !== 'postop', w.id);
  }
});

// ---------------------------------------------------------------------------- cue plans
test('v4 cue plan: durations match the estimate (minus setup) for every exercise and level', () => {
  for (const e of content.exercises) {
    e.levels.forEach((_, level) => {
      const plan = exerciseCuePlan({ level }, e, {});
      assert.ok(plan.every((p) => CUE_PHASES.includes(p.phase) && typeof p.say === 'string' && p.seconds >= 0), `${e.id}`);
      assert.equal(plan.at(-1).phase, 'exercise-done', e.id);
      assert.equal(cuePlanSeconds(plan), estimateExerciseSeconds({ level }, e, {}) - setupSeconds(e), `${e.id} level ${level}`);
    });
  }
});

test('v4 cue plan: hold (isometric) — prep, Anspannen, Loslassen, rest between sets', () => {
  const plan = exerciseCuePlan({ level: 0, plannedSets: 2 }, ex('quad-set'), {});
  assert.deepEqual(plan.slice(0, 4).map((p) => [p.phase, p.seconds]), [['prep', 5], ['hold', 5], ['relax', 5], ['hold', 5]]);
  assert.match(plan[0].say, /^Bereit machen: /);
  assert.equal(plan[1].say, 'Anspannen', 'no rep numbers in say');
  assert.equal(plan[3].say, 'Anspannen');
  assert.equal(plan[2].say, 'Loslassen');
  const restI = plan.findIndex((p) => p.phase === 'rest');
  assert.equal(plan[restI].seconds, 30);
  assert.equal(plan[restI].say, 'Pause');
  assert.match(plan[restI - 1].say, /Satz 1 geschafft/);
  assert.equal(plan[restI + 1].phase, 'prep');
  assert.match(plan[restI + 1].say, /Satz 2 von 2/);
  assert.match(plan.at(-1).say, /Loslassen\. Übung geschafft/);
  // resume from set 2
  assert.equal(exerciseCuePlan({ level: 0 }, ex('quad-set'), {}, { fromSet: 1 })[0].setIndex, 1);
  assert.equal(exerciseCuePlan({ level: 0 }, ex('quad-set'), {}, { prep: false })[0].phase, 'hold');
});

test('v4 cue plan: stretch per side — Dehnen, Seite wechseln', () => {
  const plan = exerciseCuePlan({ level: 0 }, ex('hip-flexor-stretch-standing'), {});
  assert.deepEqual(plan.map((p) => p.phase), ['prep', 'hold', 'switch', 'hold', 'set-done', 'exercise-done']);
  assert.equal(plan[1].say, 'Dehnen');
  assert.equal(plan[1].side, 1);
  assert.equal(plan[2].say, 'Lösen. Seite wechseln');
  assert.equal(plan[3].side, 2);
  assert.equal(cueKind(ex('hip-flexor-stretch-standing')), 'stretch');
});

test('v4 cue plan: reps with tempo — figure order con → pause → ecc, exercise words', () => {
  assert.deepEqual(tempoParts('3-1-2'), { up: 2, hold: 1, down: 3 });
  const plan = exerciseCuePlan({ level: 0 }, ex('sit-to-stand'), {});
  const rep = plan.filter((p) => p.setIndex === 0 && p.repIndex === 0);
  assert.deepEqual(rep.map((p) => [p.phase, p.seconds, p.say]), [['rep-up', 2, 'Aufstehen'], ['rep-hold', 1, 'Stehen'], ['rep-down', 3, 'Hinsetzen']]);
  // band default words, pull-apart override
  assert.equal(cueKind(ex('seated-row')), 'band');
  assert.deepEqual(exerciseCuePlan({ level: 0 }, ex('band-pull-apart'), {}).filter((p) => p.repIndex === 0 && p.setIndex === 0).map((p) => p.say), ['Auseinanderziehen', 'Halten', 'Zurück']);
  // no tempo: one work block with the rep count
  const walk = exerciseCuePlan({ level: 0 }, ex('lateral-band-walk'), {});
  assert.equal(walk[1].phase, 'work');
  assert.equal(walk[1].reps, 10);
  assert.match(walk[1].say, /10 Wiederholungen/);
});

test('v4 cue plan: timed flows speak each part; rowing phases carry targets', () => {
  const flow = exerciseCuePlan({ level: 0 }, ex('stretch-flow-short'), {});
  const work = flow.filter((p) => p.phase === 'work');
  assert.equal(work.length, ex('stretch-flow-short').levels[0].phases.length);
  assert.ok(work.every((p) => p.say.length > 0 && p.label));
  const row = exerciseCuePlan({ level: 0 }, ex('row-warmup-10'), {});
  assert.equal(row[0].phase, 'work', 'no prep inside the rowing timer by default');
  assert.equal(cuePlanSeconds(row), 600);
  assert.match(row.at(-2).say, /Schlagzahl 18 bis 22/);
  assert.deepEqual(row.at(-2).targetRpe, [3, 4]);
  assert.equal(exerciseCuePlan({ level: 0 }, ex('row-warmup-10'), {}, { prep: true })[0].phase, 'prep');
  const iv = exerciseCuePlan({ level: 0 }, ex('row-intervals'), {});
  assert.equal(iv.filter((p) => p.phase === 'rest').every((p) => p.say === 'Locker rudern'), true);
  assert.match(iv[0].say, /^Zügig rudern, Schlagzahl 22 bis 26 – Runde 1 von 6$/);
});

// ---------------------------------------------------------------------------- stats with rowing warm-ups
let n = 0;
const at = (day, h = 17) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).toISOString();
const S = (day, extra = {}) => ({ id: `s-${++n}`, status: 'done', kind: 'strength', phaseId: 'p1-basis', startedAt: at(day), endedAt: at(day, 18), exercises: [], traffic: { provisional: 'green', final: null, reasons: [] }, ...extra });

test('v4 stats: a strength session with rowing warm-up counts for strength, adds rowing minutes, not cardio sessions', () => {
  const rowEntry = { exerciseId: 'row-warmup-10', section: 'cardio', skipped: false, sets: [{ done: true, seconds: 600 }] };
  const withRow = S('2026-11-09', { rowWarmup: true, warmupRowing: { durationSec: 620, distanceM: 2100, kcalDisplay: 60 }, exercises: [rowEntry] });
  const noValues = S('2026-11-10', { rowWarmup: true, warmupRowing: null, exercises: [rowEntry] });
  const cardio = S('2026-11-11', { kind: 'cardio', rowing: { durationSec: 960, distanceM: 3500 } });
  const sessions = [withRow, noValues, cardio];
  assert.equal(isCardioSession(withRow), false);
  assert.equal(isCardioSession({ status: 'done', rowing: { durationSec: 600 } }), true, 'legacy session without kind');
  assert.equal(warmupRowingSec(withRow), 620);
  assert.equal(warmupRowingSec(noValues), 600, 'falls back to the done timer seconds');
  assert.equal(warmupRowingSec(cardio), 0);
  assert.equal(weeklyProgress(sessions, 3, '2026-11-12').done, 2);
  const cp = cardioProgress(sessions, 2, '2026-11-12');
  assert.equal(cp.done, 1, 'only separate rowing sessions count for the cardio goal');
  assert.equal(cp.warmupCount, 2);
  assert.equal(cp.warmupMinutes, Math.round(1220 / 60));
  assert.equal(cp.minutes, Math.round((960 + 1220) / 60));
  assert.equal(cp.distanceM, 5600);
  assert.deepEqual(rowingTotals(sessions), { sessions: 1, warmups: 2, distanceM: 5600, durationSec: 960 + 1220, kcalDisplay: 60 });
  assert.equal(rowingRecords(sessions).distanceM.value, 3500);
});

test('v4 stats: stretches and mobility do not count for hold records or hold totals', () => {
  const s = S('2026-11-09', { exercises: [
    { exerciseId: 'doorway-pec-stretch', section: 'cooldown', skipped: false, sets: [{ done: true, hold: 30, reps: 1 }] },
    { exerciseId: 'quad-set', section: 'knee', skipped: false, sets: [{ done: true, hold: 5, reps: 10 }] },
  ] });
  assert.equal(personalRecords([s], { bands: [] }).longestHold.seconds, 5);
  assert.equal(totalHoldSeconds([s]), 50);
});

// ---------------------------------------------------------------------------- settings
test('v4 settings defaults', () => {
  const d = store.defaults().settings;
  assert.equal(d.prepSeconds, 5);
  assert.equal(d.holdRelaxSeconds, 5);
  assert.equal(d.rowWarmupDefault, true);
  assert.equal(d.cardioGoalPerWeek, 3);
  assert.equal(d.rowFinisherDefault, false);
  assert.equal(d.voiceEnabled, true);
  const m = store.migrate({ schemaVersion: 1, settings: { cardioGoalPerWeek: 2, prepSeconds: 8 }, state: {}, sessions: [] });
  assert.equal(m.settings.cardioGoalPerWeek, 2, 'stored goal is kept');
  assert.equal(m.settings.prepSeconds, 8);
  assert.equal(m.settings.rowWarmupDefault, true);
});

// ---------------------------------------------------------------------------- v4b: breathing, finisher, long rowing
test('v4 breathing 4-7-8: 4 rounds, inhale / breath-hold / exhale cues, at the end of every strength cool-down', () => {
  const b = ex('breathing-reset');
  assert.deepEqual(b.levels[0].breath, { inhale: 4, hold: 7, exhale: 8, rounds: 4 });
  assert.equal(b.levels[0].seconds, 76);
  assert.match(b.description, /Schwindel/);
  const plan = exerciseCuePlan({ level: 0 }, b, {});
  const breath = plan.filter((p) => ['inhale', 'breath-hold', 'exhale'].includes(p.phase));
  assert.equal(breath.length, 12);
  assert.deepEqual(breath.slice(0, 3).map((p) => [p.phase, p.seconds, p.say]), [['inhale', 4, 'Einatmen'], ['breath-hold', 7, 'Halten'], ['exhale', 8, 'Ausatmen']]);
  assert.deepEqual(breath.map((p) => p.repIndex), [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  for (const w of strength) assert.equal(w.cooldown.at(-1).exerciseId, 'breathing-reset', w.id);
});

test('v4 rowing finisher: offered in p1–p3 strength only, inserted before the cool-down, total ≤ ~50 min', () => {
  assert.equal(finisherPlan(wo('p1-a'), fresh(wo('p1-a')), content).exerciseId, 'row-finisher-short');
  assert.equal(finisherPlan(wo('p2-a'), fresh(wo('p2-a')), content).exerciseId, 'row-finisher-intervals');
  assert.equal(finisherPlan(wo('p4-a'), fresh(wo('p4-a')), content), null, 'never after surgery');
  assert.equal(finisherPlan(wo('p1-short'), fresh(wo('p1-a')), content), null);
  assert.equal(finisherPlan(wo('p1-a'), fresh(wo('p1-a')), content, { taper: true }), null);
  for (const w of strength.filter((x) => !postop(x))) {
    const f = finisherPlan(w, fresh(w), content);
    assert.ok(f.seconds >= 270 && f.seconds <= 600, `${w.id} finisher ${f.seconds} s`);
    const plan = buildSessionPlan(w, fresh(w), content, { settings, rowWarmup: true, rowFinisher: true });
    assert.equal(plan.rowFinisher, true);
    assert.equal(plan.finisherRowing, null);
    const i = plan.exercises.findIndex((e) => e.finisher);
    assert.equal(plan.exercises[i].section, 'cardio');
    assert.equal(plan.exercises[i + 1].section, 'cooldown', 'finisher right after the strength part');
    const total = estimateWorkoutMinutes(plan, content, null, settings);
    assert.ok(total <= 51 && total <= plan.budgetMin, `${w.id}: ${total} min (budget ${plan.budgetMin})`);
    const maxPlan = buildSessionPlan(w, fresh(w, maxLevels), content, { settings, rowWarmup: true, rowFinisher: true });
    assert.ok(estimateWorkoutMinutes(maxPlan, content, null, settings) <= maxPlan.budgetMin, `${w.id} max levels`);
  }
  // default off; settings.rowFinisherDefault switches it on; appendFinisher is idempotent
  const w = wo('p1-a');
  const plain = buildSessionPlan(w, fresh(w), content, { settings });
  assert.ok(!plain.exercises.some((e) => e.finisher));
  assert.ok(buildSessionPlan(w, fresh(w), content, { settings: { rowFinisherDefault: true } }).rowFinisher);
  const once = appendFinisher(plain, w, fresh(w), content);
  assert.notEqual(once, plain);
  assert.equal(appendFinisher(once, w, fresh(w), content), once);
  assert.equal(once.budgetMin, plain.budgetMin + finisherPlan(w, fresh(w), content).minutes);
  const p4 = wo('p4-a');
  const p4plan = buildSessionPlan(p4, fresh(p4), content, { rowFinisher: true });
  assert.ok(!p4plan.exercises.some((e) => e.finisher));
});

test('v4 finisherEligible: only at a green knee light of the running session', () => {
  const g = { painThresholds: { greenMax: 2 } };
  const base = { kind: 'strength', pre: { pain: 1, swelling: 0, mechanical: { locking: false, givingWay: false } },
    exercises: [{ exerciseId: 'quad-set', section: 'knee', painDuring: 2, sharpPain: false, skipped: false }] };
  assert.deepEqual(finisherEligible(base, g), { ok: true, reasons: [] });
  assert.equal(finisherEligible({ ...base, exercises: [{ ...base.exercises[0], painDuring: 3 }] }, g).ok, false);
  assert.equal(finisherEligible({ ...base, exercises: [{ ...base.exercises[0], sharpPain: true }] }, g).ok, false);
  assert.equal(finisherEligible({ ...base, pre: { ...base.pre, pain: 3 } }, g).ok, false);
  assert.equal(finisherEligible({ ...base, pre: { ...base.pre, swelling: 1 } }, g).ok, false);
  assert.equal(finisherEligible({ ...base, postOp: true }, g).ok, false);
  assert.equal(finisherEligible({ ...base, taper: true }, g).ok, false);
  assert.equal(finisherEligible({ ...base, kind: 'cardio' }, g).ok, false);
  assert.match(finisherEligible({ ...base, exercises: [{ ...base.exercises[0], painDuring: 4 }] }, g).reasons[0], /über 2\/10/);
});

test('v4 rowing: long base session per prehab phase (25–30 min) with honest kcal text; finisher counts as rowing', () => {
  for (const p of content.phases.filter((x) => x.kind !== 'postop')) {
    const id = `${p.id.slice(0, 2)}-row-long`;
    assert.ok(p.cardio.includes(id), `${p.id} has ${id}`);
    const w = wo(id);
    assert.match(w.description, /Ernährung/);
    for (const lv of [{}, maxLevels]) {
      const m = estimateWorkoutMinutes(w, content, fresh(w, lv), settings);
      assert.ok(m >= 25 && m <= 30, `${id}: ${m}`);
    }
  }
  const s = S('2026-11-09', { rowWarmup: true, rowFinisher: true, warmupRowing: { durationSec: 600, distanceM: 2000 }, finisherRowing: null,
    exercises: [{ exerciseId: 'row-finisher-short', section: 'cardio', finisher: true, skipped: false, sets: [{ done: true, seconds: 270 }] }] });
  assert.equal(warmupRowingSec(s), 870);
  assert.equal(rowingTotals([s]).durationSec, 870);
  assert.equal(cardioProgress([s], 3, '2026-11-10').done, 0);
});
