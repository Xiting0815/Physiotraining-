// v5.5 (SPEC §20): Schwingplatte & Balance-Kissen (equipment, exercises, upgrades in strength workouts, Balance unit)
// and the moved surgery date (2027-01-05 → 2027-01-19, p2 = 4 weeks, sync-safe migration).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildSessionPlan, phaseWorkouts, balanceWorkoutFor, exerciseAvailable, phasePlanExerciseIds, isBalanceKind, WORKOUT_KINDS,
  canRowWarmup, finisherPlan, equipmentPlanChanges,
} from '../js/logic/progression.js';
import { estimateWorkoutMinutes, estimateExerciseSeconds, tempoSeconds } from '../js/logic/duration.js';
import { exerciseCuePlan } from '../js/logic/cues.js';
import {
  OPTIONAL_EQUIPMENT, EQUIPMENT_INFO, BALANCE_EQUIPMENT, normalizeOwned, ownsBalanceGear, migrateEquipment, upgradeChip,
  availableEquipment,
} from '../js/logic/equipment.js';
import { shoulderOk } from '../js/logic/shoulder.js';
import { countsAsStrength, weeklyProgress, sameDayLoadHint } from '../js/logic/stats.js';
import { xpFor } from '../js/logic/motivation.js';
import { phaseSchedule, suggestedSurgeryDate, DEFAULT_SURGERY_DATE } from '../js/logic/schedule.js';
import { figureSpecForExercise, buildScene } from '../js/components/pt-figure.js';
import * as store from '../js/store.js';
import { mergeSync } from '../js/sync/merge.js';
import * as H from '../js/views/session-helpers.js';
import { BALANCE_EXERCISES } from '../tools/balance-content.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases };
const { poses, segments } = load('poses');
const ex = (id) => content.exercises.find((e) => e.id === id);
const phase = (id) => content.phases.find((p) => p.id === id);
const SNAP = JSON.parse(readFileSync(new URL('./fixtures/plans-v54.json', import.meta.url), 'utf8'));
const BASE = ['office-chair', 'massage-stick', 'rowing-machine', 'door-anchor', 'band-handles', 'sling-trainer'];
const BAL = { none: [], cushion: ['balance-pad'], platform: ['swing-platform'], both: ['swing-platform', 'balance-pad'] };
const settingsFor = (bal, imp, base = BASE) => ({ ...store.defaults().settings, ownedEquipment: [...base, ...BAL[bal]], shoulderImpingement: imp, shoulderMaxElevationDeg: 65 });
const stateIn = (phaseId) => ({ ...store.defaults().state, phaseId, exerciseLevels: {} });
const NEW = BALANCE_EXERCISES.map((e) => e.id);
const SWING = NEW.filter((id) => id.startsWith('swing-'));
const PAD = NEW.filter((id) => id.startsWith('pad-'));
const order = (id) => phase(id).order;

// ------------------------------------------------------------------ equipment

test('v5.5 equipment: balance-pad relabelled (id kept), new swing-platform with load hint; legacy ids, normalizeOwned, migration', () => {
  const pad = OPTIONAL_EQUIPMENT.find((e) => e.id === 'balance-pad');
  assert.equal(pad.label, 'Balance-Kissen / Balance-Pad');
  const sw = OPTIONAL_EQUIPMENT.find((e) => e.id === 'swing-platform');
  assert.equal(sw.label, 'Schwingplatte (an Federn)');
  assert.ok(sw.icon && /Tragkraft/.test(sw.hint) && /100 kg/.test(sw.hint));
  assert.equal(EQUIPMENT_INFO['swing-platform'].label, 'Schwingplatte (an Federn)');
  assert.deepEqual(BALANCE_EQUIPMENT, ['swing-platform', 'balance-pad']);
  assert.deepEqual(normalizeOwned(['swing-platform', 'balancepad', 'nope', 'wall']), ['balance-pad', 'swing-platform']);
  assert.deepEqual(normalizeOwned(['schwingplatte', 'balancekissen']), ['balance-pad', 'swing-platform']);
  // stored v5.4 settings keep working; the equipment migration leaves both ids alone
  const old = { settings: { ownedEquipment: ['balance-pad', 'swing-platform'], equipmentModel: 3 }, state: {}, sessions: [] };
  assert.equal(migrateEquipment(old), old);
  assert.deepEqual(store.migrate(structuredClone(old)).settings.ownedEquipment, ['balance-pad', 'swing-platform']);
  assert.equal(ownsBalanceGear(null), true, 'no settings → legacy behaviour');
  assert.equal(ownsBalanceGear({ ownedEquipment: [] }), false);
  assert.equal(ownsBalanceGear({ ownedEquipment: ['balance-pad'] }), true);
  assert.equal(ownsBalanceGear({ ownedEquipment: ['swing-platform'] }), true);
  assert.equal(upgradeChip(ex('swing-single-leg-stance')), 'Schwingplatten-Variante');
  assert.equal(upgradeChip(ex('pad-single-leg-stance')), 'Kissen-Variante');
});

// ------------------------------------------------------------------ data

test('v5.5 data: 5 Schwingplatte + 5 Balance-Kissen exercises with the full data model', () => {
  assert.equal(SWING.length, 5);
  assert.equal(PAD.length, 5);
  for (const id of NEW) {
    const e = ex(id);
    assert.ok(e, id);
    assert.equal(e.block, 'knee', id);
    assert.equal(e.postOpAllowed, false, `${id}: blocked after surgery`);
    assert.ok(e.equipment.includes(id.startsWith('swing-') ? 'swing-platform' : 'balance-pad'), `${id} equipment`);
    if (id.startsWith('pad-')) assert.ok(e.equipment.includes('wall'), `${id}: wall in reach`);
    assert.ok(e.kneeNote.length > 40 && /3\/10/.test(e.kneeNote), `${id} kneeNote with the pain rule`);
    assert.ok(e.short && e.setup && e.steps.length >= 3 && /^Du spürst/.test(e.feel), `${id} texts`);
    if (id.startsWith('swing-')) assert.match(e.setup, /Tragkraft/, `${id}: load hint`);
    assert.match(e.setup, /Rahmen|Wand/, `${id}: where to hold on`);
    assert.ok(e.cues.length && e.mistakes.length && e.instructions.length, id);
    assert.ok(e.cueWords && Object.keys(e.cueWords).length, `${id} cueWords`);
    assert.ok(Number.isFinite(e.shoulderElevationDeg) && e.shoulderElevationDeg <= 65, `${id} elevation ≤ 65°`);
    assert.ok(e.levels.every((_, i) => shoulderOk(e, i, { shoulderImpingement: true, shoulderMaxElevationDeg: 65 })), `${id} shoulderOk`);
    assert.ok(Array.isArray(e.fallback), `${id} fallback`);
    for (const f of e.fallback) assert.ok(ex(f), `${id} → ${f}`);
    assert.ok(['p1-basis', 'p2-aufbau'].includes(e.phaseMin), id);
    assert.ok(e.figure.poses.every((p) => poses[p]), `${id} poses`);
    e.levels.forEach((l, i) => {
      if (e.type === 'hold') assert.ok(l.hold > 0 && l.reps >= 1 && l.tempo == null && l.seconds == null, `${id} level ${i}: hold timer`);
      if (e.type === 'reps') assert.ok(tempoSeconds(l.tempo) != null && l.reps > 0, `${id} level ${i}: tempo for the Tempo-Coach`);
      const plan = exerciseCuePlan({ level: i }, e, {});
      assert.ok(plan.some((s) => s.seconds > 0), `${id} level ${i}: timed cue plan`);
      if (e.side === 'perSide') assert.ok(plan.some((s) => s.side === 2), `${id}: both legs`);
    });
    if (e.type === 'reps') assert.equal(H.tempoCoachActive(e.levels[0] && { ...e, tempo: e.levels[0].tempo }, {}), true);
  }
  // single-leg exercises train both legs; perturbation variants come later (p2)
  for (const id of ['swing-single-leg-stance', 'pad-single-leg-stance', 'swing-split-stance', 'pad-step-on']) assert.equal(ex(id).side, 'perSide', id);
  assert.equal(ex('swing-single-leg-perturbation').phaseMin, 'p2-aufbau');
  assert.equal(ex('pad-single-leg-perturbation').phaseMin, 'p2-aufbau');
  // small knee bend: mini squats ≤ 45°
  for (const id of ['swing-mini-squat', 'pad-mini-squat']) for (const l of ex(id).levels) assert.match(l.label, /0–(30|45)°/, id);
});

test('v5.5 figures: cushion and swing platform are drawn under the feet, swing figures carry sway arrows', () => {
  for (const id of NEW) {
    const spec = figureSpecForExercise(ex(id), 0, {});
    const frames = spec.poses.map((k) => poses[k]);
    const sc = buildScene({ ...spec, poses: frames, segments });
    const type = id.startsWith('swing-') ? 'swing' : 'pad';
    const prop = sc.props.find((p) => p.type === type);
    assert.ok(prop, `${id}: ${type} drawn`);
    assert.match(sc.staticBack, type === 'swing' ? /fig-swing/ : /fig-pad/);
    if (type === 'swing') {
      assert.ok(sc.hasArrows, `${id}: sway arrows`);
      assert.match(sc.staticBack, /fig-spring/);
    }
  }
});

// ------------------------------------------------------------------ upgrades in strength workouts

const STRENGTH_PHASES = ['p1-basis', 'p2-aufbau', 'p3-op-vorbereitung'];
const BALANCE_BASE = ['single-leg-stance', 'single-leg-stance-reach'];

for (const bal of Object.keys(BAL)) for (const imp of [false, true]) {
  test(`v5.5 upgrades: balance gear ${bal} · shoulder protection ${imp ? 'on' : 'off'}`, () => {
    const settings = settingsFor(bal, imp);
    for (const phaseId of STRENGTH_PHASES) {
      const pw = phaseWorkouts(phase(phaseId), content.workouts);
      for (const w of [...pw.rotation, ...(pw.short ? [pw.short] : [])]) {
        const state = stateIn(phaseId);
        const plan = buildSessionPlan(w, state, content, { settings, rowWarmup: false, rowFinisher: false });
        const ids = plan.exercises.map((e) => e.exerciseId);
        for (const e of plan.exercises) {
          const x = ex(e.exerciseId);
          assert.ok(shoulderOk(x, e.level, settings), `${w.id}: ${x.id} shoulderOk`);
          assert.ok(order(x.phaseMin) <= order(phaseId), `${w.id}: ${x.id} phaseMin`);
        }
        assert.ok(estimateWorkoutMinutes(plan, content, state, settings) <= plan.budgetMin, `${w.id}: within ${plan.budgetMin} min`);
        const hadBalance = workoutHasBalance(w);
        const variants = plan.exercises.filter((e) => NEW.includes(e.exerciseId));
        if (bal === 'none') {
          assert.equal(variants.length, 0, `${w.id}: nothing new without balance gear`);
          // snapshot: plans are exactly the v5.4 plans
          assert.equal(plan.exercises.map((e) => `${e.exerciseId}×${e.plannedSets}`).join(' '), SNAP[`sling-${imp ? 'on' : 'off'}`][w.id], `${w.id} unchanged`);
          continue;
        }
        if (!hadBalance) { assert.equal(variants.length, 0, `${w.id}: no balance item → no variant`); continue; }
        assert.equal(variants.length, 1, `${w.id}: exactly one balance variant (${ids.join(' ')})`);
        const v = variants[0];
        const prefer = bal === 'cushion' ? 'pad-' : 'swing-';
        assert.ok(v.exerciseId.startsWith(prefer), `${w.id}: ${v.exerciseId} (Schwingplatte first)`);
        assert.ok(BALANCE_BASE.includes(v.upgradedFrom), `${w.id}: upgraded from ${v.upgradedFrom}`);
        assert.equal(v.upgradeChip, bal === 'cushion' ? 'Kissen-Variante' : 'Schwingplatten-Variante');
        assert.equal(v.newVariant, true);
        assert.equal(v.section, 'knee');
        assert.ok(!ids.some((id) => BALANCE_BASE.includes(id)), `${w.id}: the base item is replaced, not added`);
        // same number of exercises as without the gear (no longer workout)
        const without = buildSessionPlan(w, state, content, { settings: settingsFor('none', imp), rowWarmup: false, rowFinisher: false });
        assert.equal(plan.exercises.length, without.exercises.length, `${w.id}: same item count`);
      }
    }
  });
}

function workoutHasBalance(w) {
  return [...(w.warmup || []), ...w.blocks.flatMap((b) => b.items), ...(w.cooldown || [])].some((it) => BALANCE_BASE.includes(it.exerciseId));
}

test('v5.5 upgrades: reach → perturbation variant from p2, single-leg stance variant in p1; taper keeps the known base', () => {
  const s = settingsFor('both', false);
  const p1b = buildSessionPlan(content.workouts.find((w) => w.id === 'p1-b'), stateIn('p1-basis'), content, { settings: s });
  assert.ok(p1b.exercises.some((e) => e.exerciseId === 'swing-single-leg-stance' && e.upgradedFrom === 'single-leg-stance-reach'));
  const p2a = buildSessionPlan(content.workouts.find((w) => w.id === 'p2-a'), stateIn('p2-aufbau'), content, { settings: s });
  assert.ok(p2a.exercises.some((e) => e.exerciseId === 'swing-single-leg-perturbation'));
  const p2aPad = buildSessionPlan(content.workouts.find((w) => w.id === 'p2-a'), stateIn('p2-aufbau'), content, { settings: settingsFor('cushion', true) });
  assert.ok(p2aPad.exercises.some((e) => e.exerciseId === 'pad-single-leg-perturbation'));
  const w = content.workouts.find((x) => x.id === 'p3-b');
  const history = [{ id: 'h', status: 'done', startedAt: '2027-01-01T10:00:00Z', endedAt: '2027-01-01T10:30:00Z', exercises: [{ exerciseId: 'single-leg-stance', sets: [{ done: true }] }] }];
  const taper = buildSessionPlan(w, stateIn('p3-op-vorbereitung'), content, { settings: s, taper: true, history });
  assert.ok(taper.exercises.some((e) => e.exerciseId === 'single-leg-stance'), 'taper: no new variant');
  // a user toggle off for the variant → the next rule (cushion) or the base
  const off = { ...stateIn('p1-basis'), exerciseToggles: { 'swing-single-leg-stance': false } };
  const p1a = buildSessionPlan(content.workouts.find((x) => x.id === 'p1-a'), off, content, { settings: s });
  assert.ok(p1a.exercises.some((e) => e.exerciseId === 'pad-single-leg-stance'));
});

// ------------------------------------------------------------------ Balance unit

test('v5.5 Balance unit: kind, phases p1–p3 only, 10–15 min, hidden without gear', () => {
  assert.ok(WORKOUT_KINDS.includes('balance'));
  for (const phaseId of STRENGTH_PHASES) {
    const w = phaseWorkouts(phase(phaseId), content.workouts).balance;
    assert.ok(w && isBalanceKind(w) && w.phaseId === phaseId, `${phaseId} balance`);
    assert.equal(w.maxMinutes, 15);
    assert.ok(!w.rowWarmup);
    assert.equal(canRowWarmup(w, stateIn(phaseId), content, settingsFor('both', false)), false, 'no rowing warm-up');
    assert.equal(finisherPlan(w, stateIn(phaseId), content, { settings: settingsFor('both', false) }), null, 'no rowing finisher');
    assert.equal(balanceWorkoutFor(phase(phaseId), content.workouts, settingsFor('none', false)), null, 'hidden without gear');
    for (const b of ['cushion', 'platform', 'both']) assert.equal(balanceWorkoutFor(phase(phaseId), content.workouts, settingsFor(b, false))?.id, w.id);
  }
  assert.equal(phase('p4-entlastung').balance, undefined);
  assert.equal(balanceWorkoutFor(phase('p4-entlastung'), content.workouts, settingsFor('both', false)), null);
  // the toggle toast sees the Balance unit
  const ch = equipmentPlanChanges(stateIn('p1-basis'), content, settingsFor('none', false), settingsFor('cushion', false));
  assert.ok(ch.added.includes(ex('pad-stand-both').name) && ch.added.includes(ex('pad-step-on').name));
  assert.ok(!phasePlanExerciseIds(stateIn('p1-basis'), content, settingsFor('none', false)).has('pad-step-on'));
});

for (const bal of ['cushion', 'platform', 'both']) for (const imp of [false, true]) {
  test(`v5.5 Balance unit content: ${bal} · shoulder protection ${imp ? 'on' : 'off'}`, () => {
    const settings = settingsFor(bal, imp);
    for (const phaseId of STRENGTH_PHASES) {
      const w = balanceWorkoutFor(phase(phaseId), content.workouts, settings);
      const state = stateIn(phaseId);
      const plan = buildSessionPlan(w, state, content, { settings });
      assert.equal(plan.kind, 'balance');
      assert.equal(plan.rowWarmup, false);
      const sec = (s) => plan.exercises.filter((e) => e.section === s).map((e) => e.exerciseId);
      assert.ok(sec('warmup').length >= 1 && sec('warmup').every((id) => ex(id).block === 'warmup'), 'short warm-up');
      assert.deepEqual(sec('cooldown'), ['calf-stretch-wall']);
      const main = sec('knee');
      assert.ok(main.length >= 4 && main.length <= 5, `${w.id}: 4–5 balance exercises (${main})`);
      assert.equal(new Set(main).size, main.length, 'no duplicates');
      assert.ok(main.every((id) => NEW.includes(id)), 'only balance-gear exercises');
      if (bal === 'cushion') assert.ok(main.every((id) => id.startsWith('pad-')), main.join());
      if (bal === 'platform') assert.ok(main.every((id) => id.startsWith('swing-')), main.join());
      if (bal === 'both') assert.ok(main.filter((id) => id.startsWith('swing-')).length >= 4, main.join());
      for (const id of main) assert.ok(order(ex(id).phaseMin) <= order(phaseId), `${id} phaseMin`);
      const min = estimateWorkoutMinutes(plan, content, state, settings);
      assert.ok(min >= 10 && min <= 15, `${w.id} (${bal}): ${min} min`);
      for (const e of plan.exercises) assert.ok(H.timerCuePlan(H.cuePlanFor(e, ex(e.exerciseId), settings), 0) || ex(e.exerciseId).type === 'reps', `${e.exerciseId} timer`);
    }
  });
}

test('v5.5 p4: every balance exercise is blocked after surgery (unless the team enables it)', () => {
  const p4 = phase('p4-entlastung');
  for (const id of NEW) {
    assert.equal(exerciseAvailable(ex(id), p4, {}), false, id);
    assert.equal(exerciseAvailable(ex(id), p4, { exerciseToggles: { [id]: true } }), true, `${id} toggle`);
  }
  // p4 workouts never pick a balance variant, with every item owned
  for (const w of content.workouts.filter((x) => x.phaseId === 'p4-entlastung')) {
    const plan = buildSessionPlan(w, stateIn('p4-entlastung'), content, { settings: settingsFor('both', true) });
    assert.ok(!plan.exercises.some((e) => NEW.includes(e.exerciseId)), w.id);
  }
});

test('v5.5 stats: Balance sessions do not count for the weekly strength goal but earn XP', () => {
  const s = { id: 'b', kind: 'balance', workoutId: 'p1-balance', status: 'done', startedAt: '2026-11-18T10:00:00Z', endedAt: '2026-11-18T10:13:00Z',
    exercises: [{ exerciseId: 'pad-stand-both', section: 'knee', painDuring: 1, sets: [{ done: true }, { done: true }] }] };
  assert.equal(countsAsStrength(s), false);
  assert.equal(weeklyProgress([s], 3, '2026-11-18').done, 0);
  assert.ok(xpFor(s, store.defaults().settings) > 0);
  assert.equal(sameDayLoadHint([], '2026-11-18', 'balance'), null);
  assert.equal(H.KIND_LABELS.balance, 'Balance');
});

// ------------------------------------------------------------------ surgery moved to 2027-01-19

test('v5.5 OP date: default 2027-01-19, p2 4 weeks, schedule with the new date', () => {
  assert.equal(DEFAULT_SURGERY_DATE, '2027-01-19');
  assert.equal(store.defaults().settings.surgeryDateSuggested, '2027-01-19');
  assert.equal(suggestedSurgeryDate({ surgeryDate: null }), '2027-01-19');
  assert.equal(phase('p2-aufbau').plannedWeeks, 4);
  assert.equal(phase('p3-op-vorbereitung').plannedWeeks, 2.5);
  assert.equal(phase('p4-entlastung').plannedWeeks, 6);
  const sched = Object.fromEntries(phaseSchedule(content.phases, '2027-01-19', { prehabStart: '2026-11-07' }).map((x) => [x.phaseId, x]));
  assert.deepEqual(Object.values(sched).map((x) => [x.start, x.end, x.days]), [
    ['2026-11-07', '2026-12-04', 28], ['2026-12-05', '2027-01-01', 28], ['2027-01-02', '2027-01-18', 17], ['2027-01-19', '2027-03-01', 42],
  ]);
});

const { SURGERY_MOVE, migrateSurgeryDate } = store;
const userData = (settings) => ({ ...store.defaults(), settings: { ...store.defaults().settings, ...settings } });

test('v5.5 OP date migration: 2027-01-05 → 2027-01-19 once, stamped, never overrides a later choice', () => {
  const old = userData({ surgeryDate: '2027-01-05', surgeryDateSuggested: '2027-01-05', _updatedAt: { surgeryDate: '2026-11-08T09:00:00.000Z' } });
  const m = store.migrate(structuredClone(old));
  assert.equal(m.settings.surgeryDate, '2027-01-19');
  assert.equal(m.settings.surgeryDateSuggested, '2027-01-19');
  assert.equal(m.settings._updatedAt.surgeryDate, SURGERY_MOVE.stamp);
  // idempotent (no loop): migrating again changes nothing
  assert.equal(migrateSurgeryDate(m), m);
  assert.deepEqual(store.migrate(structuredClone(m)).settings, m.settings);
  // untracked old date (never synced) is moved too
  assert.equal(store.migrate(userData({ surgeryDate: '2027-01-05' })).settings.surgeryDate, '2027-01-19');
  // other dates and no date stay
  assert.equal(store.migrate(userData({ surgeryDate: '2027-02-02' })).settings.surgeryDate, '2027-02-02');
  assert.equal(store.migrate(userData({ surgeryDate: null })).settings.surgeryDate, null);
  // the user deliberately set 2027-01-05 again after the move → kept
  const later = userData({ surgeryDate: '2027-01-05', _updatedAt: { surgeryDate: '2026-12-01T10:00:00.000Z' } });
  assert.equal(store.migrate(later).settings.surgeryDate, '2027-01-05');
});

test('v5.5 OP date migration + sync: the moved date wins against a device still on the old date, later choices win', () => {
  const phoneOld = userData({ surgeryDate: '2027-01-05', _updatedAt: { surgeryDate: '2026-11-08T09:00:00.000Z' }, sync: { ...store.defaults().settings.sync, deviceId: 'p' } });
  const tablet = store.migrate(structuredClone({ ...phoneOld, settings: { ...phoneOld.settings, sync: { ...phoneOld.settings.sync, deviceId: 't' } } }));
  const now = Date.parse('2026-11-21T08:00:00Z');
  // the tablet (migrated) merges the phone's old data – both directions agree on the new date
  assert.equal(mergeSync(tablet, phoneOld, { now }).settings.surgeryDate, '2027-01-19');
  assert.equal(mergeSync(phoneOld, tablet, { now }).settings.surgeryDate, '2027-01-19');
  // remote without any stamp (old untracked value)
  const untracked = userData({ surgeryDate: '2027-01-05' });
  assert.equal(mergeSync(tablet, untracked, { now }).settings.surgeryDate, '2027-01-19');
  assert.equal(mergeSync(tablet, untracked, { now, join: true }).settings.surgeryDate, '2027-01-19');
  // a date the user sets later on any device wins and is not migrated back
  const changed = structuredClone(tablet);
  changed.settings.surgeryDate = '2027-01-26';
  changed.settings._updatedAt.surgeryDate = '2026-11-25T10:00:00.000Z';
  assert.equal(mergeSync(tablet, changed, { now: Date.parse('2026-11-26T08:00:00Z') }).settings.surgeryDate, '2027-01-26');
  const merged = mergeSync(phoneOld, changed, { now: Date.parse('2026-11-26T08:00:00Z') });
  assert.equal(store.migrate(merged).settings.surgeryDate, '2027-01-26');
});
