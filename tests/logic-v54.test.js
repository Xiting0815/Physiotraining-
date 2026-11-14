// v5.4 (SPEC §19): Tempo-Coach for every rep exercise, timer audit (every hold/timed exercise has a working timer),
// one sling exercise per strength workout (with and without shoulder protection), no dips with shoulder protection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSessionPlan, phaseWorkouts } from '../js/logic/progression.js';
import { estimateWorkoutMinutes, estimateExerciseSeconds, tempoSeconds } from '../js/logic/duration.js';
import { exerciseCuePlan, cuePlanSeconds } from '../js/logic/cues.js';
import { resolveExercise, availableEquipment } from '../js/logic/equipment.js';
import { isDipExercise, shoulderOk } from '../js/logic/shoulder.js';
import { validateCustomWorkout } from '../js/logic/custom-workouts.js';
import * as store from '../js/store.js';
import * as H from '../js/views/session-helpers.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases };
const ex = (id) => content.exercises.find((e) => e.id === id);
const BASE = ['office-chair', 'massage-stick', 'rowing-machine', 'door-anchor', 'band-handles'];
const withSling = (on) => (on ? [...BASE, 'sling-trainer'] : BASE);
const settingsFor = (sling, imp) => ({ ...store.defaults().settings, ownedEquipment: withSling(sling), shoulderImpingement: imp, shoulderMaxElevationDeg: 65 });
const stateIn = (phaseId) => ({ ...store.defaults().state, phaseId, exerciseLevels: {} });
const isSling = (id) => (ex(id)?.equipment || []).includes('sling-trainer');
const strengthOf = (phaseId) => phaseWorkouts(content.phases.find((p) => p.id === phaseId), content.workouts).rotation;
const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// ------------------------------------------------------------------ 19.1 Tempo-Coach default

test('v5.4 tempoCoachActive: on by default for reps with tempo, „Lieber selbst zählen“ per entry, legacy fields', () => {
  const reps = { type: 'reps', tempo: '2-0-2' };
  assert.equal(H.tempoCoachActive(reps, {}), true);
  assert.equal(H.tempoCoachActive(reps, { section: 'archery' }), true, 'every section, not only knee');
  assert.equal(H.tempoCoachActive(reps, { section: 'warmup' }), true);
  assert.equal(H.tempoCoachActive(reps, null), true);
  assert.equal(H.tempoCoachActive(reps, { manualTempo: true }), false, 'manual for that exercise');
  assert.equal(H.tempoCoachActive(reps, { manualTempo: false }), true, 'Tempo-Coach button switches back');
  // older sessions: non-knee entries stored tempoCoach: true (coach chosen last) / tempo-manual stored both fields
  assert.equal(H.tempoCoachActive(reps, { tempoCoach: true }), true);
  assert.equal(H.tempoCoachActive(reps, { manualTempo: true, tempoCoach: false }), false);
  assert.equal(H.tempoCoachActive(reps, { manualTempo: true, tempoCoach: true }), true);
  assert.equal(H.tempoCoachActive({ type: 'reps', tempo: null }, {}), false, 'no tempo → manual „Satz fertig“');
  assert.equal(H.tempoCoachActive({ type: 'hold', tempo: '2-0-2' }, {}), false);
  assert.equal(H.tempoCoachActive({ type: 'timed', tempo: '2-0-2' }, {}), false);
});

test('v5.4 data: every rep exercise has a valid tempo in every level (Tempo-Coach can count it)', () => {
  for (const e of content.exercises.filter((x) => x.type === 'reps')) {
    e.levels.forEach((l, i) => {
      assert.ok(tempoSeconds(l.tempo) != null, `${e.id} level ${i + 1}: tempo ${l.tempo}`);
      assert.ok(pos(l.reps), `${e.id} level ${i + 1}: reps`);
    });
    const plan = exerciseCuePlan({ level: 0 }, e, {});
    assert.ok(plan.some((p) => p.phase === 'rep-up' || p.phase === 'rep-down'), `${e.id}: tempo cue phases`);
  }
  assert.equal(ex('ankle-pumps').levels.every((l) => l.tempo === '1-0-1'), true);
  assert.equal(ex('lateral-band-walk').side, 'perSide', 'lateral band walk counts per direction');
});

test('v5.4 Tempo-Coach: per-side rep exercises count both sides with a switch; cue plan time = estimate', () => {
  for (const e of content.exercises.filter((x) => x.type === 'reps' && x.side === 'perSide')) {
    const plan = exerciseCuePlan({ level: 0 }, e, {});
    const set0 = plan.filter((p) => p.setIndex === 0);
    assert.ok(set0.some((p) => p.side === 1) && set0.some((p) => p.side === 2), `${e.id}: both sides`);
    assert.ok(set0.some((p) => p.phase === 'switch'), `${e.id}: switch`);
  }
  for (const e of content.exercises.filter((x) => x.type === 'reps')) {
    for (let level = 0; level < e.levels.length; level++) {
      const entry = { level };
      assert.equal(cuePlanSeconds(exerciseCuePlan(entry, e, {})) + (e.setupSec ?? 20), estimateExerciseSeconds(entry, e, {}), `${e.id} L${level + 1}: duration estimate fits the coach`);
    }
  }
});

// ------------------------------------------------------------------ 19.2 Timer audit

test('v5.4 timer audit: every hold/timed exercise (all levels, overrides in workouts) has a valid dose and a timed work plan', () => {
  const problems = [];
  const check = (e, entry, tag) => {
    const lvl = e.levels[entry.level];
    const o = entry.override || {};
    if (!pos(lvl.sets)) problems.push(`${tag}: sets`);
    if (e.type === 'hold') {
      if (!pos(o.hold ?? lvl.hold)) problems.push(`${tag}: hold`);
      if ((o.reps ?? lvl.reps) != null && !pos(o.reps ?? lvl.reps)) problems.push(`${tag}: reps`);
      if (lvl.seconds != null) problems.push(`${tag}: hold exercise with seconds`);
      if (lvl.tempo) problems.push(`${tag}: hold exercise with tempo`);
    } else {
      const phases = Array.isArray(lvl.phases) && lvl.phases.length ? lvl.phases : null;
      if (!pos(o.seconds ?? lvl.seconds) && !phases && !lvl.breath) problems.push(`${tag}: seconds`);
      if (phases && phases.some((p) => !pos(p.seconds))) problems.push(`${tag}: phase without seconds`);
      if (phases && pos(lvl.seconds) && phases.reduce((a, p) => a + p.seconds, 0) !== lvl.seconds) problems.push(`${tag}: phases ≠ seconds`);
      if (lvl.hold != null || lvl.reps != null || lvl.tempo) problems.push(`${tag}: timed exercise with reps/hold/tempo`);
    }
    if (e.block === 'cardio') return; // rowing: card without timer (SPEC §18.5)
    const dose = H.doseFor(entry, e, {});
    const plan = H.cuePlanFor(entry, e, {});
    for (let s = 0; s < dose.sets; s++) {
      const steps = H.timerCuePlan(plan, s);
      if (!steps) { problems.push(`${tag}: no timer steps for set ${s + 1}`); continue; }
      const work = steps.filter((st) => st.phase !== 'prep' && st.phase !== 'set-done').reduce((a, st) => a + st.seconds, 0);
      if (!(work > 0)) problems.push(`${tag}: set ${s + 1} without timed work`);
      if (e.side === 'perSide' && !steps.some((st) => st.side === 2)) problems.push(`${tag}: second side missing`);
    }
  };
  for (const e of content.exercises.filter((x) => x.type === 'hold' || x.type === 'timed')) {
    e.levels.forEach((_, level) => check(e, { level, plannedSets: e.levels[level].sets }, `${e.id} L${level + 1}`));
  }
  for (const w of content.workouts) {
    for (const it of [...(w.warmup || []), ...(w.blocks || []).flatMap((b) => b.items || []), ...(w.cooldown || [])]) {
      const e = ex(it.exerciseId);
      if (!it.override || !e || (e.type !== 'hold' && e.type !== 'timed')) continue;
      e.levels.forEach((_, level) => check(e, { level, override: it.override }, `${w.id}/${e.id} L${level + 1} (override)`));
    }
  }
  assert.deepEqual(problems, []);
  // only the three exercise types exist
  assert.deepEqual([...new Set(content.exercises.map((e) => e.type))].sort(), ['hold', 'reps', 'timed']);
});

test('v5.4 timer audit: every planned hold/timed entry of every workout (fallbacks, upgrades, flows) gets timer steps', () => {
  for (const sling of [true, false]) for (const imp of [false, true]) {
    const settings = settingsFor(sling, imp);
    for (const w of content.workouts.filter((x) => x.kind !== 'cardio')) {
      const plan = buildSessionPlan(w, stateIn(w.phaseId), content, { settings, rowWarmup: false, rowFinisher: false });
      for (const entry of plan.exercises) {
        const e = ex(entry.exerciseId);
        if (e.block === 'cardio' || e.type === 'reps') continue;
        assert.ok(H.timerCuePlan(H.cuePlanFor(entry, e, settings), 0), `${w.id}: ${e.id} timer`);
      }
    }
  }
});

// ------------------------------------------------------------------ 19.3 One sling exercise per strength workout

const NO_SLING_V53 = {
  off: {
    "p1-a": "patella-mobilization leg-swing-front band-dislocate seated-thoracic-rotation quad-set mini-squat right-leg-band-press single-leg-stance long-sit-row band-pull-apart band-triceps-extension band-draw-hold hip-flexor-stretch-standing calf-stretch-wall doorway-pec-stretch forearm-flexor-stretch breathing-reset",
    "p1-b": "patella-mobilization ankle-circles-seated band-dislocate seated-spine-wave straight-leg-raise glute-bridge clamshell single-leg-stance-reach wall-slide band-triceps-extension dead-bug bow-arm-push hamstring-stretch-band figure-4-stretch-supine lat-side-stretch neck-side-stretch breathing-reset",
    "p1-c": "patella-mobilization leg-swing-front band-dislocate seated-thoracic-rotation tke mini-squat calf-raise single-leg-stance lat-pulldown band-triceps-extension prone-ytw band-draw-hold hip-flexor-stretch-standing hamstring-stretch-band cross-body-shoulder-stretch forearm-flexor-stretch breathing-reset",
    "p2-a": "patella-mobilization leg-swing-front band-dislocate seated-thoracic-rotation step-up mini-squat right-leg-band-press single-leg-stance-reach long-sit-row face-pull band-triceps-extension band-draw-hold hip-flexor-stretch-standing calf-stretch-wall doorway-pec-stretch forearm-flexor-stretch breathing-reset",
    "p2-b": "patella-mobilization ankle-circles-seated band-dislocate seated-spine-wave wall-sit lateral-band-walk glute-bridge single-leg-stance er-90-90 band-triceps-extension side-plank-elevated wall-slide hamstring-stretch-band figure-4-stretch-supine lat-side-stretch neck-side-stretch breathing-reset",
    "p2-c": "patella-mobilization leg-swing-front band-dislocate seated-thoracic-rotation mini-squat step-up hamstring-bridge-step single-leg-stance-reach straight-arm-pulldown band-triceps-extension expansion-drill mirror-draw hip-flexor-stretch-standing hamstring-stretch-band cross-body-shoulder-stretch forearm-flexor-stretch breathing-reset",
  },
  on: {
    "p1-a": "patella-mobilization leg-swing-front scapula-setting seated-thoracic-rotation quad-set mini-squat right-leg-band-press single-leg-stance long-sit-row pull-apart-low band-triceps-extension band-draw-hold er-iso-door hip-flexor-stretch-standing calf-stretch-wall pec-stretch-low forearm-flexor-stretch breathing-reset",
    "p1-b": "patella-mobilization ankle-circles-seated scapula-setting seated-spine-wave straight-leg-raise glute-bridge clamshell single-leg-stance wall-push-up-plus band-triceps-extension pallof-press bow-arm-push er-towel hamstring-stretch-band figure-4-stretch-supine side-bend-low neck-stretch-low breathing-reset",
    "p1-c": "patella-mobilization leg-swing-front scapula-setting seated-thoracic-rotation tke mini-squat calf-raise single-leg-stance low-row-band band-triceps-extension prone-low-row band-draw-hold sidelying-er hip-flexor-stretch-standing hamstring-stretch-band pec-stretch-low forearm-flexor-stretch breathing-reset",
    "p2-a": "patella-mobilization leg-swing-front scapula-setting seated-thoracic-rotation step-up mini-squat right-leg-band-press single-leg-stance long-sit-row low-face-pull band-triceps-extension band-draw-hold er-iso-door hip-flexor-stretch-standing calf-stretch-wall pec-stretch-low forearm-flexor-stretch breathing-reset",
    "p2-b": "patella-mobilization ankle-circles-seated scapula-setting seated-spine-wave wall-sit lateral-band-walk glute-bridge single-leg-stance er-towel band-triceps-extension pallof-press wall-push-up-plus ir-band hamstring-stretch-band figure-4-stretch-supine side-bend-low neck-stretch-low breathing-reset",
    "p2-c": "patella-mobilization leg-swing-front scapula-setting seated-thoracic-rotation mini-squat step-up hamstring-bridge-step single-leg-stance low-row-band band-triceps-extension expansion-drill mirror-draw er-towel scapula-setting hip-flexor-stretch-standing hamstring-stretch-band pec-stretch-low forearm-flexor-stretch breathing-reset",
  },
};

for (const sling of [true, false]) for (const imp of [false, true]) {
  test(`v5.4 sling per workout: sling ${sling ? 'owned' : 'not owned'} · shoulder protection ${imp ? 'on' : 'off'}`, () => {
    const settings = settingsFor(sling, imp);
    for (const phaseId of ['p1-basis', 'p2-aufbau']) {
      const ws = strengthOf(phaseId);
      assert.equal(ws.length, 3);
      for (const w of ws) for (const rowWarmup of [false, true]) {
        const state = stateIn(phaseId);
        const plan = buildSessionPlan(w, state, content, { settings, rowWarmup, rowFinisher: false });
        const slingEntries = plan.exercises.filter((e) => isSling(e.exerciseId));
        for (const e of plan.exercises) {
          const x = ex(e.exerciseId);
          assert.ok(shoulderOk(x, e.level, settings), `${w.id}: ${x.id} passes shoulderOk`);
          assert.ok(x.phaseMin == null || content.phases.find((p) => p.id === x.phaseMin).order <= content.phases.find((p) => p.id === phaseId).order, `${w.id}: ${x.id} phaseMin`);
          if (imp) assert.ok(!isDipExercise(x), `${w.id}: no dips with shoulder protection`);
        }
        if (sling) assert.ok(slingEntries.length >= 1, `${w.id} (impingement ${imp}, row ${rowWarmup}): at least one sling exercise`);
        else {
          assert.equal(slingEntries.length, 0, `${w.id}: no sling exercise without the sling`);
          assert.ok(plan.exercises.every((e) => !e.upgradedFrom), `${w.id}: no upgrades without the sling`);
        }
        assert.ok(estimateWorkoutMinutes(plan, content, state, settings) <= plan.budgetMin, `${w.id}: within ${plan.budgetMin} min`);
        if (!sling && !rowWarmup) {
          // without the sling the exercise selection is exactly the v5.3 plan
          const simple = { ownedEquipment: BASE, equipmentModel: 3, shoulderImpingement: imp };
          const ids = buildSessionPlan(w, state, content, { settings: simple }).exercises.map((e) => e.exerciseId).join(' ');
          assert.equal(ids, NO_SLING_V53[imp ? 'on' : 'off'][w.id], `${w.id}: unchanged without the sling`);
        }
      }
    }
  });
}

test('v5.4 sling per workout: the chosen sling exercises with shoulder protection (≤ 65°)', () => {
  const settings = settingsFor(true, true);
  const picks = {};
  for (const phaseId of ['p1-basis', 'p2-aufbau']) for (const w of strengthOf(phaseId)) {
    picks[w.id] = buildSessionPlan(w, stateIn(phaseId), content, { settings, rowWarmup: false }).exercises.filter((e) => isSling(e.exerciseId)).map((e) => e.exerciseId);
  }
  assert.deepEqual(picks, {
    'p1-a': ['sling-row'], 'p1-b': ['sling-pallof-press'], 'p1-c': ['sling-row'],
    'p2-a': ['sling-row'], 'p2-b': ['sling-pallof-press'], 'p2-c': ['sling-heel-bridge', 'sling-row'],
  });
  for (const id of new Set(Object.values(picks).flat())) assert.ok(ex(id).shoulderElevationDeg <= 65, `${id} elevation data`);
  // a fallback takes its own sling upgrade: lat pulldown → low row (shoulder) → sling row
  const p1c = buildSessionPlan(strengthOf('p1-basis')[2], stateIn('p1-basis'), content, { settings, rowWarmup: false });
  const row = p1c.exercises.find((e) => e.exerciseId === 'sling-row');
  assert.equal(row.fallbackFrom, 'lat-pulldown');
  assert.equal(row.upgradedFrom, 'low-row-band');
  assert.equal(row.upgradeChip, 'Sling-Variante');
});

test('v5.4 upgrade rules: low row and long-sit row → sling row; custom workouts never upgrade fallbacks', () => {
  for (const id of ['low-row-band', 'long-sit-row', 'pallof-press']) {
    assert.ok((ex(id).upgrades || []).some((u) => u.equipment.includes('sling-trainer')), `${id} sling upgrade`);
  }
  const avail = availableEquipment(settingsFor(true, true));
  const usable = (e) => shoulderOk(e, 0, settingsFor(true, true));
  assert.deepEqual(resolveExercise('lat-pulldown', { exercises: content.exercises, avail, usable, allowUpgrade: false }), { exerciseId: 'low-row-band', fallbackFrom: 'lat-pulldown' });
  // the taken check also applies to the upgraded fallback
  const r = resolveExercise('lat-pulldown', { exercises: content.exercises, avail, usable, taken: (id) => id === 'sling-row' });
  assert.deepEqual(r, { exerciseId: 'low-row-band', fallbackFrom: 'lat-pulldown' });
});

// ------------------------------------------------------------------ 19.4 No dips with shoulder protection

test('v5.4 dips: data flag shoulderDip on every dip exercise, blocked only with shoulder protection', () => {
  const dips = content.exercises.filter((e) => /dip/i.test(`${e.id} ${e.name}`)).map((e) => e.id).sort();
  assert.deepEqual(dips, ['chair-dip', 'sling-dip-assisted']);
  for (const id of dips) {
    assert.equal(isDipExercise(ex(id)), true, id);
    assert.equal(shoulderOk(ex(id), 0, settingsFor(true, false)), true, `${id}: usable without shoulder protection`);
    assert.equal(shoulderOk(ex(id), 0, settingsFor(true, true)), false, `${id}: blocked with shoulder protection`);
    assert.equal(shoulderOk(ex(id), 0, { ...settingsFor(true, true), shoulderMaxElevationDeg: 180 }), false, `${id}: blocked at any limit`);
  }
  assert.equal(content.exercises.filter((e) => e.shoulderDip).length, 2);
});

test('v5.4 dips: fallback → sling triceps press (sling, if within the limit) → band triceps extension', () => {
  const resolve = (id, settings) => resolveExercise(id, { exercises: content.exercises, avail: availableEquipment(settings), usable: (e) => shoulderOk(e, 0, settings) });
  const on = settingsFor(true, true);
  // sling-triceps-press lifts the arms to 170° → over 65°, so the band version is chosen
  assert.equal(resolve('chair-dip', on).exerciseId, 'band-triceps-extension');
  assert.equal(resolve('sling-dip-assisted', on).exerciseId, 'band-triceps-extension');
  assert.equal(resolve('chair-dip', settingsFor(false, true)).exerciseId, 'band-triceps-extension');
  // a limit that allows the sling triceps press picks it when the sling is owned
  const wide = { ...on, shoulderMaxElevationDeg: 180 };
  assert.equal(resolve('chair-dip', wide).exerciseId, 'sling-triceps-press');
  assert.equal(resolve('sling-dip-assisted', wide).exerciseId, 'sling-triceps-press');
  // without shoulder protection: unchanged (sling → sling dip, fixed chair → chair dip)
  assert.equal(resolve('chair-dip', settingsFor(true, false)).exerciseId, 'sling-dip-assisted');
  const chair = { ...settingsFor(false, false), ownedEquipment: ['chair-fixed'] };
  assert.equal(resolve('chair-dip', chair).exerciseId, 'chair-dip');
  // plans: A workouts / p2 short use the band triceps extension instead of the sling dip
  for (const id of ['p1-a', 'p2-a', 'p2-short']) {
    const w = content.workouts.find((x) => x.id === id);
    const plan = buildSessionPlan(w, stateIn(w.phaseId), content, { settings: on, rowWarmup: false });
    assert.ok(plan.exercises.some((e) => e.exerciseId === 'band-triceps-extension' && e.fallbackFrom === 'chair-dip'), `${id}: band triceps extension`);
    const off = buildSessionPlan(w, stateIn(w.phaseId), content, { settings: settingsFor(true, false), rowWarmup: false });
    assert.ok(off.exercises.some((e) => e.exerciseId === 'sling-dip-assisted'), `${id}: sling dip without shoulder protection`);
  }
});

test('v5.4 dips: custom workout warning names the dip', () => {
  const custom = { id: 'c-1', name: 'Test', warmup: [], blocks: [{ section: 'archery', items: [{ exerciseId: 'chair-dip' }] }], cooldown: [] };
  const res = validateCustomWorkout(custom, content, stateIn('p1-basis'), { ...settingsFor(false, true), ownedEquipment: ['chair-fixed'] });
  assert.ok(res.warnings.some((w) => /Dip-Übung/.test(w) && /Trizeps-Strecken mit Band/.test(w)), res.warnings.join(' | '));
});
