// v5 (SPEC §16): owned equipment steers the plan – availability, upgrades, fallbacks, rowing gate, migration,
// time budgets for both equipment sets, setup text variants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASE_EQUIPMENT, OPTIONAL_EQUIPMENT, availableEquipment, hasEquipment, missingEquipment, normalizeOwned, migrateEquipment,
  instructionsFor, equipmentNeeds, upgradeRules, fallbackRules, resolveExercise, usesEquipment, sessionUsedRowing, EQUIPMENT_MODEL,
} from '../js/logic/equipment.js';
import {
  buildSessionPlan, canRowWarmup, finisherPlan, cardioWorkoutsFor, phasePlanExerciseIds, equipmentPlanChanges, getWorkout,
  planBudgetMinutes, workoutKind,
} from '../js/logic/progression.js';
import { estimateWorkoutMinutes } from '../js/logic/duration.js';
import { validateCustomWorkout } from '../js/logic/custom-workouts.js';
import * as store from '../js/store.js';
import { changeText, itemEquipment, itemOwned } from '../js/views/equipment.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases };
const poses = load('poses').poses;
const equipmentFile = load('equipment');
const ex = (id) => content.exercises.find((e) => e.id === id);
// v5.3: the former base „Stuhl“ is the optional `chair-fixed` – „base only“ = basic home setup with a fixed chair
const ALL = ['rowing-machine', 'sling-trainer', 'door-anchor', 'band-handles', 'chair-fixed', 'office-chair', 'massage-stick', 'bed-edge'];
const settingsWith = (owned) => ({ ...store.defaults().settings, ownedEquipment: owned });
const BASE = settingsWith(['chair-fixed']);
const FULL = settingsWith(ALL);
const stateIn = (phaseId, extra = {}) => ({ ...store.defaults().state, phaseId, ...extra });
const ids = (plan) => plan.exercises.map((e) => e.exerciseId);
const SLING = content.exercises.filter((e) => e.equipment.includes('sling-trainer'));

test('equipment model: base always available, optional only when owned, no settings = no filter', () => {
  assert.deepEqual(BASE_EQUIPMENT, ['theraband', 'loop', 'mat', 'step', 'wall', 'door', 'none']);
  for (const id of ['rowing-machine', 'door-anchor', 'band-handles', 'sling-trainer', 'ankle-weights', 'balance-pad', 'dumbbells', 'pedal-trainer', 'ice-pack', 'measuring-tape', 'release-trainer']) {
    assert.ok(OPTIONAL_EQUIPMENT.some((e) => e.id === id && e.label && e.icon), id);
  }
  assert.equal(availableEquipment(null), null);
  assert.equal(availableEquipment({}), null, 'legacy settings without ownedEquipment are not filtered');
  const base = availableEquipment(BASE);
  assert.ok(BASE_EQUIPMENT.every((id) => base.has(id)));
  assert.ok(!base.has('sling-trainer') && !base.has('rowing-machine'));
  assert.equal(hasEquipment(ex('sling-row'), BASE), false);
  assert.deepEqual(missingEquipment(ex('sling-row'), BASE), ['sling-trainer']);
  assert.equal(hasEquipment(ex('sling-row'), settingsWith(['chair-fixed', 'sling-trainer'])), true);
  assert.equal(hasEquipment(ex('seated-row'), BASE), true);
  assert.equal(hasEquipment(ex('row-steady'), BASE), false);
  assert.equal(hasEquipment(ex('row-steady'), null), true);
  // every exercise uses known equipment ids
  const known = new Set([...BASE_EQUIPMENT, ...OPTIONAL_EQUIPMENT.map((e) => e.id), 'seat']);
  for (const e of content.exercises) for (const id of e.equipment) assert.ok(known.has(id), `${e.id}: unknown equipment ${id}`);
});

test('normalizeOwned / migrateEquipment: old ids mapped, rowing kept for rowers, runs once, banner flagged', () => {
  assert.deepEqual(normalizeOwned(['tueranker-griffe', 'rowing-machine', 'kurzhanteln', 'bogus', 'mat']), ['rowing-machine', 'door-anchor', 'band-handles', 'dumbbells']);
  assert.deepEqual(normalizeOwned(['massband', 'pedaltrainer', 'fussgewichte', 'balancepad', 'schusstrainer', 'kuehlpack']),
    ['ankle-weights', 'balance-pad', 'pedal-trainer', 'release-trainer', 'ice-pack', 'measuring-tape']);
  const v4 = { schemaVersion: 1, settings: { ownedEquipment: ['rowing-machine', 'tueranker-griffe'] }, state: { welcomeDone: true }, sessions: [] };
  const m = migrateEquipment(v4);
  assert.deepEqual(m.settings.ownedEquipment, ['rowing-machine', 'door-anchor', 'band-handles']);
  assert.equal(m.settings.equipmentModel, EQUIPMENT_MODEL);
  assert.equal(m.state.equipmentNotice, 'pending');
  assert.deepEqual(v4.settings.ownedEquipment, ['rowing-machine', 'tueranker-griffe'], 'input not mutated');
  assert.equal(migrateEquipment(m), m, 'second run is a no-op');
  // empty list + rowing sessions → rowing machine pre-ticked (never anything else)
  const rowed = { settings: { ownedEquipment: [] }, state: {}, sessions: [{ kind: 'cardio', status: 'done', exercises: [] }] };
  assert.deepEqual(migrateEquipment(rowed).settings.ownedEquipment, ['office-chair', 'rowing-machine'], 'v5.3: trained before → office chair');
  const warm = { settings: {}, state: {}, sessions: [{ kind: 'strength', exercises: [{ exerciseId: 'row-warmup-10', section: 'cardio', sets: [{ done: true, seconds: 600 }] }] }] };
  assert.ok(sessionUsedRowing(warm.sessions[0]));
  assert.deepEqual(migrateEquipment(warm).settings.ownedEquipment, ['office-chair', 'rowing-machine']);
  const noRow = { settings: { ownedEquipment: [] }, state: {}, sessions: [{ kind: 'strength', exercises: [{ exerciseId: 'quad-set', section: 'knee', sets: [{ done: true }] }] }] };
  assert.deepEqual(migrateEquipment(noRow).settings.ownedEquipment, ['office-chair']);
  // fresh installs get no banner; an already migrated user who unticked rowing keeps it unticked
  assert.equal(migrateEquipment({ settings: {}, state: {}, sessions: [] }).state.equipmentNotice, undefined);
  const unticked = { settings: { ownedEquipment: [], equipmentModel: EQUIPMENT_MODEL }, state: {}, sessions: rowed.sessions };
  assert.deepEqual(migrateEquipment(unticked).settings.ownedEquipment, []);
});

test('store: v4 data (ownedEquipment ["rowing-machine","tueranker-griffe"]) is migrated and persisted once', () => {
  const mem = new Map();
  store._setStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
  const v4 = store.defaults();
  delete v4.settings.equipmentModel;
  delete v4.state.equipmentNotice;
  v4.settings.ownedEquipment = ['rowing-machine', 'tueranker-griffe'];
  v4.state.welcomeDone = true;
  mem.set(store.STORAGE_KEY, JSON.stringify(v4));
  const d = store.load();
  assert.deepEqual(d.settings.ownedEquipment, ['rowing-machine', 'door-anchor', 'band-handles']);
  assert.equal(d.state.equipmentNotice, 'pending');
  const saved = JSON.parse(mem.get(store.STORAGE_KEY));
  assert.equal(saved.settings.equipmentModel, EQUIPMENT_MODEL, 'migration written back');
  // fresh defaults: nothing owned, no banner
  assert.deepEqual(store.defaults().settings.ownedEquipment, []);
  assert.equal(store.defaults().state.equipmentNotice, null);
  store._setStorage(null);
});

test('upgrades: sling variants replace the band versions when the sling trainer is owned (p1–p3), new variant at level 0', () => {
  const st = stateIn('p1-basis', { exerciseLevels: { 'seated-row': 3, 'chair-dip': 2 } });
  const w = getWorkout('p1-a', content, st);
  const base = buildSessionPlan(w, st, content, { settings: BASE, rowWarmup: false });
  assert.ok(ids(base).includes('seated-row') && !ids(base).some((id) => id.startsWith('sling-')));
  const up = buildSessionPlan(w, st, content, { settings: settingsWith(['chair-fixed', 'sling-trainer']), rowWarmup: false });
  const row = up.exercises.find((e) => e.exerciseId === 'sling-row');
  assert.ok(row, 'sling-row planned');
  assert.equal(row.upgradedFrom, 'seated-row');
  assert.equal(row.upgradeChip, 'Sling-Variante');
  assert.equal(row.newVariant, true);
  assert.equal(row.level, 0, 'the new variant starts at level 0 (own level mapping)');
  assert.equal(row.section, 'archery');
  assert.ok(!ids(up).includes('seated-row'), 'not duplicated');
  assert.equal(up.exercises.length, base.exercises.length, 'same number of exercises');
  // known variant keeps its own level, no "Neu" chip
  const st2 = { ...st, exerciseLevels: { ...st.exerciseLevels, 'sling-row': 2 } };
  const up2 = buildSessionPlan(w, st2, content, { settings: settingsWith(['chair-fixed', 'sling-trainer']), rowWarmup: false });
  const row2 = up2.exercises.find((e) => e.exerciseId === 'sling-row');
  assert.equal(row2.level, 2);
  assert.equal(row2.newVariant, undefined);
  // phaseMin of the variant is respected: mini-squat → sling squat only from p2
  const p1c = buildSessionPlan(getWorkout('p1-c', content, st), st, content, { settings: FULL, rowWarmup: false });
  assert.ok(ids(p1c).includes('mini-squat') && !ids(p1c).includes('sling-assisted-mini-squat'));
  const p2a = buildSessionPlan(getWorkout('p2-a', content, st), stateIn('p2-aufbau'), content, { settings: FULL, rowWarmup: false });
  assert.ok(ids(p2a).includes('sling-assisted-mini-squat') && ids(p2a).includes('sling-face-pull'));
  // custom workouts are never upgraded (the user picked the exercise)
  const cst = stateIn('p1-basis', { customWorkouts: [{ id: 'cw-a', name: 'Mix', kind: 'custom', warmup: [], blocks: [{ id: 'knee', items: [{ exerciseId: 'quad-set' }] }, { id: 'archery', items: [{ exerciseId: 'seated-row' }] }], cooldown: [] }] });
  assert.deepEqual(ids(buildSessionPlan(getWorkout('cw-a', content, cst), cst, content, { settings: FULL })), ['quad-set', 'seated-row']);
});

test('upgrades: taper week keeps the known base exercise instead of a never-done variant', () => {
  const st = stateIn('p3-op-vorbereitung');
  const w = getWorkout('p3-a', content, st);
  const history = [{ status: 'done', startedAt: '2026-12-20T10:00:00Z', endedAt: '2026-12-20T10:30:00Z', exercises: workoutIdsDone(w) }];
  const plan = buildSessionPlan(w, st, content, { settings: FULL, taper: true, history, rowWarmup: false });
  assert.ok(ids(plan).includes('seated-row'));
  assert.ok(!ids(plan).includes('sling-row'));
});
function workoutIdsDone(w) {
  return [...w.warmup, ...w.blocks.flatMap((b) => b.items), ...w.cooldown].map((it) => ({ exerciseId: it.exerciseId, sets: [{ done: true }] }));
}

test('fallback and drop: variant without its equipment falls back to the base, otherwise it is dropped', () => {
  const st = stateIn('p1-basis', { customWorkouts: [{ id: 'cw-s', name: 'Sling', kind: 'custom', warmup: [], blocks: [
    { id: 'knee', items: [{ exerciseId: 'quad-set' }] },
    { id: 'archery', items: [{ exerciseId: 'sling-row' }, { exerciseId: 'sling-plank-forearms' }] }], cooldown: [] }] });
  const plan = buildSessionPlan(getWorkout('cw-s', content, st), st, content, { settings: BASE });
  // v5.3: the plank now has an explicit fallback chain (Pallof Press)
  assert.deepEqual(ids(plan), ['quad-set', 'seated-row', 'pallof-press']);
  assert.equal(plan.exercises[1].fallbackFrom, 'sling-row');
  assert.equal(plan.exercises[2].fallbackFrom, 'sling-plank-forearms');
  const v = validateCustomWorkout(st.customWorkouts[0], content, st, BASE);
  assert.ok(v.warnings.some((x) => /Rudern im Sitzen/.test(x)), 'warns about the fallback');
  assert.ok(v.warnings.some((x) => /Unterarmstütz.*Pallof/.test(x)), 'warns about the explicit fallback');
  // without any fallback the exercise is dropped (and not refilled by the duration fitter)
  const noFb = content.exercises.map((e) => (e.id === 'sling-plank-forearms' ? { ...e, fallback: undefined } : e));
  assert.equal(resolveExercise('sling-plank-forearms', { exercises: noFb, avail: availableEquipment(BASE) }), null);
  const v2 = validateCustomWorkout(st.customWorkouts[0], { ...content, exercises: noFb }, st, BASE);
  assert.ok(v2.warnings.some((x) => /Unterarmstütz.*übersprungen/.test(x)), 'warns about the dropped exercise');
  const fitted = buildSessionPlan(getWorkout('cw-s', content, st), st, { ...content, exercises: noFb }, { settings: BASE });
  assert.equal(fitted.exercises.length, 2);
});

test('rowing needs the rowing machine: no warm-up toggle, no finisher, no rowing workouts', () => {
  const st = stateIn('p1-basis');
  const w = getWorkout('p1-a', content, st);
  assert.equal(canRowWarmup(w, st, content, BASE), false);
  assert.equal(canRowWarmup(w, st, content, settingsWith(['chair-fixed', 'rowing-machine'])), true);
  assert.equal(canRowWarmup(w, st, content), true, 'no settings → legacy behaviour');
  assert.equal(finisherPlan(w, st, content, { settings: BASE }), null);
  assert.ok(finisherPlan(w, st, content, { settings: settingsWith(['chair-fixed', 'rowing-machine']) }));
  const plan = buildSessionPlan(w, st, content, { settings: { ...BASE, rowWarmupDefault: true, rowFinisherDefault: true } });
  assert.equal(plan.rowWarmup, false);
  assert.ok(!plan.exercises.some((e) => e.section === 'cardio'));
  const phase = content.phases.find((p) => p.id === 'p1-basis');
  assert.deepEqual(cardioWorkoutsFor(phase, content.workouts, BASE), []);
  assert.ok(cardioWorkoutsFor(phase, content.workouts, settingsWith(['chair-fixed', 'rowing-machine'])).length >= 2);
  assert.equal(buildSessionPlan(getWorkout('p1-row', content, st), st, content, { settings: BASE }).exercises.length, 0);
  assert.ok(![...phasePlanExerciseIds(st, content, BASE)].some((id) => id.startsWith('row-')));
  assert.ok([...phasePlanExerciseIds(st, content, settingsWith(['chair-fixed', 'rowing-machine']))].includes('row-warmup-10'));
});

test('toggle diff: sling trainer on lists the new sling exercises, rowing off removes rowing', () => {
  const st = stateIn('p1-basis');
  const on = equipmentPlanChanges(st, content, BASE, settingsWith(['chair-fixed', 'sling-trainer']));
  assert.ok(on.added.includes(ex('sling-row').name), on.added.join());
  assert.ok(on.added.includes(ex('sling-dip-assisted').name));
  assert.ok(on.removed.includes(ex('seated-row').name));
  const off = equipmentPlanChanges(st, content, settingsWith(['chair-fixed', 'rowing-machine']), BASE);
  assert.ok(off.removed.includes(ex('row-warmup-10').name));
  assert.ok(off.added.includes(ex('leg-swing-front').name), 'the full mobility warm-up comes back instead of rowing');
  assert.match(changeText(on), /^Neu in deinem Plan: .+/);
  assert.match(changeText({ added: [], removed: ['A'] }), /Entfernt: A/);
  assert.match(changeText({ added: [], removed: [] }), /ändert sich dadurch nichts/);
});

test('post-op p4: no sling exercise even with everything owned; every sling exercise is blocked after surgery', () => {
  for (const e of SLING) assert.equal(e.postOpAllowed, false, `${e.id} must be blocked post-op`);
  const st = stateIn('p4-entlastung');
  for (const w of content.workouts.filter((x) => x.phaseId === 'p4-entlastung')) {
    const plan = buildSessionPlan(w, st, content, { settings: FULL });
    assert.ok(!plan.exercises.some((e) => e.exerciseId.startsWith('sling-') || e.section === 'cardio'), `${w.id}: ${ids(plan)}`);
  }
});

test('time budgets hold for "base only" and "all owned" equipment (level 0 untrimmed, max levels fitted)', () => {
  for (const settings of [BASE, FULL]) {
    for (const w of content.workouts.filter((x) => workoutKind(x) !== 'cardio')) {
      const tag = `${w.id} (${settings.ownedEquipment.length ? 'all owned' : 'base only'})`;
      const st0 = stateIn(w.phaseId);
      const plan0 = buildSessionPlan(w, st0, content, { settings, fit: false, rowFinisher: false });
      const budget = planBudgetMinutes(w, plan0.rowWarmup);
      assert.equal(plan0.rowWarmup, settings === FULL && !!w.rowWarmup && w.phaseId !== 'p4-entlastung', `${tag} rowing warm-up`);
      assert.ok(estimateWorkoutMinutes(plan0, content, st0, settings) <= budget, `${tag}: level 0 ${estimateWorkoutMinutes(plan0, content, st0, settings)} > ${budget}`);
      const stMax = stateIn(w.phaseId, { exerciseLevels: Object.fromEntries(content.exercises.map((e) => [e.id, e.levels.length - 1])) });
      const planMax = buildSessionPlan(w, stMax, content, { settings, rowFinisher: false });
      assert.ok(estimateWorkoutMinutes(planMax, content, stMax, settings) <= planMax.budgetMin, `${tag}: max levels over budget`);
    }
  }
});

test('setup text variants: door anchor replaces the knot step, handles add a step', () => {
  const sr = ex('seated-row');
  assert.deepEqual(instructionsFor(sr, BASE), sr.instructions);
  assert.deepEqual(instructionsFor(sr, null), sr.instructions);
  const anchor = instructionsFor(sr, settingsWith(['door-anchor']));
  assert.equal(anchor.length, sr.instructions.length);
  assert.match(anchor[0], /Türanker auf Brusthöhe/);
  assert.ok(!/Knoten/.test(anchor[0]));
  const both = instructionsFor(sr, settingsWith(['door-anchor', 'band-handles']));
  assert.equal(both.length, sr.instructions.length + 1);
  assert.match(both[1], /Griffe/);
  assert.match(instructionsFor(ex('standing-hip-abduction'), settingsWith(['door-anchor']))[0], /Knöchelhöhe/);
  assert.match(instructionsFor(ex('face-pull'), settingsWith(['door-anchor']))[0], /Kopfhöhe/);
  for (const e of content.exercises.filter((x) => x.setupByEquipment)) {
    assert.match(e.setupByEquipment['door-anchor'], /Türanker/, e.id);
    assert.ok(/Tür/.test(e.instructions[e.setupStep ?? 0]), `${e.id}: setup step is the door step`);
    assert.ok(e.equipment.includes('door'), e.id);
    assert.ok(usesEquipment(e, 'door-anchor'));
  }
  const needs = equipmentNeeds(ex('sling-row'), settingsWith(['chair-fixed', 'sling-trainer']));
  assert.deepEqual(needs.map((n) => [n.id, n.owned]), [['sling-trainer', true], ['door', true]]);
  const needsBand = equipmentNeeds(sr, BASE);
  assert.ok(needsBand.some((n) => n.id === 'door-anchor' && n.optional && !n.owned));
});

test('sling content: upgrades valid, German texts, knee notes, figures with the sling prop', () => {
  const rules = upgradeRules(content.exercises);
  const fb = fallbackRules(content.exercises);
  const targets = new Set();
  for (const [from, list] of rules) {
    for (const r of list) {
      const b = ex(from);
      const v = ex(r.exerciseId);
      assert.ok(v, `${from} → ${r.exerciseId}`);
      assert.ok(r.equipment.every((id) => v.equipment.includes(id)), `${v.id} needs the upgrade equipment`);
      assert.equal(v.block, b.block, `${v.id} same block as ${from}`);
      assert.equal(fb.get(v.id), from);
      targets.add(v.id);
    }
  }
  for (const id of ['sling-row', 'sling-face-pull', 'sling-y-raise', 'sling-t-raise', 'sling-single-arm-row', 'sling-rear-delt-fly',
    'sling-plank-forearms', 'sling-pallof-press', 'sling-standing-rollout', 'sling-assisted-mini-squat', 'sling-heel-bridge',
    'sling-triceps-press', 'sling-dip-assisted', 'sling-push-up-incline']) {
    const e = ex(id);
    assert.ok(e, id);
    assert.ok(e.instructions.length >= 3 && e.cues.length && e.mistakes.length && e.kneeNote.length > 20, id);
    assert.ok(e.levels.length >= 3, `${id}: body-angle progression`);
    assert.ok(e.cueWords && typeof e.cueWords === 'object', id);
    assert.ok(e.figure.props.includes('sling'), id);
    for (const p of e.figure.poses) assert.ok((poses[p].props || []).some((x) => x?.type === 'sling'), `${id}: pose ${p} has the sling anchor`);
  }
  for (const id of ['sling-assisted-mini-squat', 'sling-heel-bridge']) {
    assert.equal(ex(id).block, 'knee');
    assert.equal(ex(id).phaseMin, 'p2-aufbau');
    assert.match(ex(id).kneeNote, /3\/10/);
  }
  assert.match(ex('sling-assisted-mini-squat').kneeNote, /60°/);
  assert.match(ex('sling-plank-forearms').kneeNote, /nicht kniend/);
  // knee-safe poses: squat ≤ 60°, heel bridge 20–30°
  assert.ok(poses['sling-squat-bottom'].kneeL <= 60);
  assert.ok(poses['sling-heel-bridge-up'].kneeL >= 20 && poses['sling-heel-bridge-up'].kneeL <= 30);
  // at least 8 workouts of p1–p3 get a sling variant
  const upgraded = content.workouts.filter((w) => w.phaseId !== 'p4-entlastung' && workoutKind(w) !== 'cardio'
    && buildSessionPlan(w, stateIn(w.phaseId), content, { settings: FULL, fit: false }).exercises.some((e) => e.upgradedFrom));
  assert.ok(upgraded.length >= 8, upgraded.map((w) => w.id).join());
});

test('equipment.json: new ids, sling trainer item, shopping helpers', () => {
  const items = equipmentFile.items;
  assert.ok(items.some((it) => it.id === 'sling-trainer'));
  const known = new Set(OPTIONAL_EQUIPMENT.map((e) => e.id));
  for (const it of items) for (const id of itemEquipment(it)) assert.ok(known.has(id), `${it.id}: ${id}`);
  const set = items.find((it) => it.id === 'door-anchor');
  assert.deepEqual(itemEquipment(set), ['door-anchor', 'band-handles']);
  assert.equal(itemOwned(set, new Set(['door-anchor'])), false);
  assert.equal(itemOwned(set, new Set(['door-anchor', 'band-handles'])), true);
  assert.deepEqual(itemEquipment({ id: 'tueranker-griffe' }), ['door-anchor', 'band-handles'], 'legacy item ids still map');
});
