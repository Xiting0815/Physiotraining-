// v2 session flow helpers (js/views/session-helpers.js): rotation fix, rowing timer, energy, post-op checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSessionPlan, getWorkout } from '../js/logic/progression.js';
import { rowingPhases } from '../js/logic/cardio.js';
import { defaults } from '../js/store.js';
import * as H from '../js/views/session-helpers.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const content = {
  exercises: load('exercises').exercises,
  workouts: load('workouts').workouts,
  phases: load('phases').phases,
  badges: load('badges').badges,
};
const ex = (id) => content.exercises.find((e) => e.id === id);
const NOW = new Date('2026-11-07T16:00:00Z');
const PRE = { pain: 1, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false };
const POST = { pain: 1, swelling: 0, rpe: 5, note: '' };

function fresh() {
  const d = defaults();
  d.state.phaseId = 'p1-basis';
  d.state.nextWorkoutId = 'p1-b';
  d.settings.ownedEquipment = ['rowing-machine']; // v5: rowing needs the rowing machine ticked
  return d;
}

/** Build + complete a session for any workout id. */
function play(data, workoutId, { rowing = null, pain = 1, now = NOW } = {}) {
  const w = getWorkout(workoutId, content, data.state);
  const s = buildSessionPlan(w, data.state, content, { history: data.sessions, now: new Date(now.getTime() - 20 * 60e3), settings: data.settings });
  s.kind = w.kind ?? 'strength';
  s.pre = { ...PRE };
  if (s.kind === 'cardio') {
    const phases = rowingPhases(s, content);
    H.applyRowingLog(s, phases, phases.map((p) => p.seconds), content);
    s.exercises[H.mainCardioIndex(s)].painDuring = pain;
    s.rowing = rowing;
  } else {
    for (const e of s.exercises) {
      const dose = H.doseFor(e, ex(e.exerciseId));
      for (let i = 0; i < dose.sets; i++) H.markSet(e, i, H.setValues(dose), now.toISOString());
      if (e.section === 'knee') e.painDuring = pain;
    }
  }
  s.post = { ...POST };
  return H.finishSession(data, s, content, { now });
}

test('finishSession: only A/B/C strength workouts advance the rotation', () => {
  let d = fresh();
  for (const id of ['p1-row', 'p1-short']) {
    d = play(d, id).data;
    assert.equal(d.state.nextWorkoutId, 'p1-b', `${id} must not touch the rotation`);
  }
  d.state.customWorkouts = [{ id: 'cw-test', name: 'Mein Mix', kind: 'custom', warmup: [], blocks: [{ id: 'knee', title: 'Knie', items: [{ exerciseId: 'quad-set' }] }, { id: 'archery', title: 'Bogen', items: [{ exerciseId: 'band-pull-apart' }] }], cooldown: [] }];
  d = play(d, 'cw-test').data;
  assert.equal(d.state.nextWorkoutId, 'p1-b');
  assert.equal(d.sessions.at(-1).kind, 'custom');
  d = play(d, 'p1-b').data;
  assert.equal(d.state.nextWorkoutId, 'p1-c');
});

test('finishSession: energy estimate stored, rowing records + first-row badge', () => {
  const d0 = fresh();
  d0.settings.profile = { weightKg: 92 };
  const { data, session } = play(d0, 'p1-row', { rowing: { durationSec: 960, distanceM: 3400, avgWatt: 90 } });
  assert.equal(session.kind, 'cardio');
  assert.equal(session.energy.method, 'watt');
  assert.ok(session.energy.kcal > 100);
  assert.equal(session.rowTimer, undefined);
  assert.ok(session.celebration.badges.includes('first-row'));
  const keys = session.celebration.rowRecords.map((r) => r.key).sort();
  assert.deepEqual(keys, ['avgWatt', 'distanceM', 'durationSec']);
  assert.ok(session.celebration.rowRecords.every((r) => r.first));
  // second, shorter row: only better values count
  const second = play(data, 'p1-row', { rowing: { durationSec: 900, distanceM: 3600, kcalDisplay: 150 }, now: new Date('2026-11-08T16:00:00Z') });
  assert.deepEqual(second.session.celebration.rowRecords.map((r) => r.key), ['distanceM']);
  assert.equal(second.session.celebration.rowRecords[0].first, false);
  assert.equal(H.energyOf(second.session, second.data, content).label, 'vom Display');
  assert.equal(H.energyOf({ ...second.session, energy: null }, second.data, content).kcal, 150);
});

test('strength sessions get a kcal estimate labelled Schätzung (scales with settings.profile.weightKg)', () => {
  const { session, data } = play(fresh(), 'p1-short');
  assert.equal(session.energy.method, 'met');
  assert.ok(session.energy.kcal > 0);
  assert.equal(H.energyOf(session, data, content).label, 'Schätzung');
  const heavy = fresh();
  heavy.settings.profile = { weightKg: 120 };
  const h = play(heavy, 'p1-short');
  assert.ok(h.session.energy.kcal > session.energy.kcal, `${h.session.energy.kcal} > ${session.energy.kcal}`);
});

test('rowing timer: tick crosses phases, skip, pause, cooldown jump, times', () => {
  const phases = [
    { seconds: 10, kind: 'work', entryIndex: 0 },
    { seconds: 20, kind: 'work', entryIndex: 1 },
    { seconds: 5, kind: 'rest', entryIndex: 1 },
    { seconds: 30, kind: 'work', entryIndex: 2 },
  ];
  const session = { exercises: [{ section: 'warmup' }, { section: 'cardio' }, { section: 'cooldown' }] };
  const t = H.newRowTimer();
  H.rowingStart(t, 0);
  assert.deepEqual(H.rowingTick(t, phases, 5000), []);
  assert.deepEqual(H.rowingTick(t, phases, 32000), [0, 1]);
  assert.equal(t.idx, 2);
  assert.equal(H.rowPhaseElapsed(t, 32000), 2000);
  H.rowingPause(t, 33000);
  assert.equal(H.rowPhaseElapsed(t, 99999), 3000);
  const tm = H.rowingTimes(t, phases, 0);
  assert.equal(tm.phaseRemaining, 2);
  assert.equal(tm.totalRemaining, 32);
  assert.equal(tm.rowed, 33);
  H.rowingSkip(t, phases, 0);
  assert.equal(t.idx, 3);
  assert.equal(t.log[2], 3);
  H.rowingStart(t, 100000);
  H.rowingTick(t, phases, 131000);
  assert.ok(t.done);
  assert.equal(H.rowedSecondsFromLog(t.log), 63);

  const t2 = H.newRowTimer();
  H.rowingStart(t2, 0);
  H.rowingTick(t2, phases, 15000); // in phase 1 (main), 5 s rowed
  H.rowingJumpToCooldown(t2, phases, session, 15000);
  assert.equal(t2.idx, 3);
  assert.deepEqual(t2.log, [10, 5, 0]);
  H.rowingJumpToCooldown(t2, phases, session, 16000); // already in cool-down: no-op
  assert.equal(t2.idx, 3);
});

test('applyRowingLog: drills → one set, intervals → one set per work phase, unrowed → skipped', () => {
  const d = fresh();
  d.state.phaseId = 'p2-aufbau';
  const p2 = content.phases.find((p) => p.order === 2);
  d.state.phaseId = p2.id;
  const w = getWorkout('p2-row-intervals', content, d.state);
  const s = buildSessionPlan(w, d.state, content, { now: NOW });
  const phases = rowingPhases(s, content);
  const log = phases.map((p) => p.seconds);
  const mainIdx = H.mainCardioIndex(s);
  // skip the last two work intervals and the cool-down
  const workIdx = phases.map((p, i) => (p.entryIndex === mainIdx && p.kind === 'work' ? i : -1)).filter((i) => i >= 0);
  for (const i of workIdx.slice(-2)) log[i] = 0;
  phases.forEach((p, i) => { if (s.exercises[p.entryIndex].section === 'cooldown') log[i] = 0; });
  H.applyRowingLog(s, phases, log, content, NOW.toISOString());
  const warm = s.exercises[0];
  assert.equal(warm.sets.length, 1);
  assert.equal(warm.sets[0].seconds, 120);
  const main = s.exercises[mainIdx];
  assert.equal(main.sets.filter((x) => x.done).length, workIdx.length - 2);
  assert.ok(main.sets.every((x) => !x.done || x.seconds === 60));
  assert.equal(s.exercises.at(-1).skipped, true);
});

test('rowPhaseLabel: big labels by intensity and kind', () => {
  const d = fresh();
  const p2 = content.phases.find((p) => p.order === 2);
  d.state.phaseId = p2.id;
  const s = buildSessionPlan(getWorkout('p2-row-intervals', content, d.state), d.state, content, { now: NOW });
  const phases = rowingPhases(s, content);
  const labels = phases.map((p) => H.rowPhaseLabel(p, content, s).big);
  assert.equal(labels[0], 'Nur Arme');
  assert.ok(labels.includes('Zügig rudern'));
  assert.ok(labels.includes('Locker rudern'));
  assert.equal(labels.at(-1), 'Locker ausrudern');
  const interval = phases.find((p) => p.kind === 'work' && p.intensity === 'vigorous');
  assert.match(H.rowPhaseLabel(interval, content, s).sub, /Intervall 1\/\d/);
});

test('applyLighterCardio lowers the level or shortens the main row', () => {
  const d = fresh();
  d.state.exerciseLevels = { 'row-steady': 2 };
  const s = buildSessionPlan(getWorkout('p1-row', content, d.state), d.state, content, { now: NOW });
  H.applyLighterCardio(s, content);
  const main = s.exercises[H.mainCardioIndex(s)];
  assert.equal(main.level, 1);
  assert.equal(s.mode, 'light');
  const s0 = buildSessionPlan(getWorkout('p1-row', content, fresh().state), fresh().state, content, { now: NOW });
  H.applyLighterCardio(s0, content);
  assert.equal(s0.exercises[H.mainCardioIndex(s0)].override.seconds, 420);
});

test('rowingPainLight', () => {
  assert.equal(H.rowingPainLight({ painDuring: null }), null);
  assert.equal(H.rowingPainLight({ painDuring: 2 }), 'green');
  assert.equal(H.rowingPainLight({ painDuring: 4 }), 'yellow');
  assert.equal(H.rowingPainLight({ painDuring: 6 }), 'red');
  assert.equal(H.rowingPainLight({ painDuring: 1, sharpPain: true }), 'red');
});

test('post-op: pre-check redness/fever → stop with Arzt kontaktieren; p4 plan has no blocked exercises', () => {
  const pre = H.withPostOpFlags({ ...PRE }, true);
  assert.equal(pre.redness, false);
  assert.equal(pre.fever, false);
  assert.equal(H.assessPreCheck(pre, {}, [], { postOp: true }).light, 'green');
  const a = H.assessPreCheck({ ...pre, fever: true }, {}, [], { postOp: true });
  assert.equal(a.light, 'stop');
  assert.equal(a.doctor, true);
  assert.ok(H.needsDoctor(a.reasons));
  assert.equal(H.assessPreCheck({ ...PRE, fever: true }, {}, []).doctor, false, 'not post-op → no doctor flag');
  assert.equal(H.withPostOpFlags({ a: 1 }, false).redness, undefined);

  const d = fresh();
  const p4 = content.phases.find((p) => p.kind === 'postop');
  d.state.phaseId = p4.id;
  for (const id of ['p4-a', 'p4-b', 'p4-c', 'p4-short']) {
    const s = buildSessionPlan(getWorkout(id, content, d.state), d.state, content, { now: NOW });
    assert.equal(s.postOp, true);
    for (const e of s.exercises) assert.notEqual(ex(e.exerciseId).postOpAllowed, false, `${id}: ${e.exerciseId} is blocked`);
  }
});

test('labels & formatting helpers', () => {
  const st = { phaseId: 'p1-basis', customWorkouts: [{ id: 'cw-x', name: 'Abendrunde', kind: 'custom', warmup: [], blocks: [], cooldown: [] }] };
  assert.deepEqual(H.sessionTitle({ workoutId: 'p1-short', kind: 'short' }, content, st).kindLabel, 'Kurztraining');
  assert.equal(H.sessionTitle({ workoutId: 'cw-x', kind: 'custom' }, content, st).title, 'Abendrunde');
  assert.equal(H.sessionTitle({ workoutId: 'cw-gone', kind: 'custom', workoutName: 'Alt' }, content, st).title, 'Alt');
  assert.equal(H.sessionKind({ rowing: {} }), 'cardio');
  assert.equal(H.sessionKind({}), 'strength');
  assert.equal(H.formatClock(65), '1:05');
  assert.equal(H.formatClock(3723), '1:02:03');
  assert.equal(H.parseClock('18:30'), 1110);
  assert.equal(H.parseClock('18'), 1080);
  assert.equal(H.parseClock('1:02:03'), 3723);
  assert.equal(H.parseClock(''), null);
  assert.ok(Number.isNaN(H.parseClock('18:75')));
  assert.ok(Number.isNaN(H.parseClock('abc')));
  assert.equal(H.formatDistance(3400), '3.400 m');
  assert.equal(H.formatDistance(12345), '12,35 km');
  assert.equal(H.paceLabel({ durationSec: 900, distanceM: 3000 }), '2:30 /500 m');
  assert.equal(H.paceLabel({ durationSec: 900 }), null);
  assert.equal(H.rowRecordValue('avgWatt', 91.4), '91 W');
  assert.equal(H.energyLabel('display'), 'vom Display');
  assert.equal(H.energyLabel('met'), 'Schätzung');
});
