import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, nextWorkout, advanceWorkout, buildSessionPlan, applyRecommendation, phaseProgress } from '../js/logic/progression.js';

const phases = [
  { id: 'p1-basis', order: 1, exitCriteria: ['2 Wochen überwiegend grün', 'Quad Set 3 × 10 × 10 s schmerzfrei', 'Folgetag nie mehr als +1 über Ausgangswert'], workouts: { A: 'p1-a', B: 'p1-b', C: 'p1-c' } },
  { id: 'p2-aufbau', order: 2, exitCriteria: ['3 Wochen Wochenziel erreicht'], workouts: { A: 'p2-a', B: 'p2-b', C: 'p2-c' } },
  { id: 'p3-op', order: 3, exitCriteria: ['OP-Termin erreicht'], workouts: { A: 'p3-a', B: 'p3-b', C: 'p3-c' } },
];
const W = (id, phaseId, knee = ['quad-set']) => ({
  id, phaseId, name: id, durationMin: 40,
  warmup: [{ exerciseId: 'heel' }],
  blocks: [{ id: 'knee', title: 'Knie', items: knee.map((exerciseId) => ({ exerciseId, note: exerciseId === 'quad-set' ? 'Linkes Bein' : undefined })) },
    { id: 'archery', title: 'Bogen', items: [{ exerciseId: 'pull' }] }],
  cooldown: [{ exerciseId: 'breath' }],
});
const workouts = ['a', 'b', 'c'].flatMap((x) => [W(`p1-${x}`, 'p1-basis'), W(`p2-${x}`, 'p2-aufbau')]);
const content = {
  phases,
  exercises: [
    { id: 'heel', block: 'warmup', levels: [{ sets: 1 }], phaseMin: 'p1-basis' },
    { id: 'quad-set', block: 'knee', levels: [{ sets: 2 }, { sets: 3 }], phaseMin: 'p1-basis' },
    { id: 'lunge', block: 'knee', levels: [{ sets: 3 }], phaseMin: 'p2-aufbau' },
    { id: 'pull', block: 'archery', levels: [{ sets: 3 }, { sets: 4 }], phaseMin: 'p1-basis' },
    { id: 'breath', block: 'cooldown', levels: [{ sets: 1 }], phaseMin: 'p1-basis' },
  ],
};

test('levelOf: missing → 0, clamped to range, non-integers ignored', () => {
  const ex = { levels: [{}, {}, {}] };
  assert.equal(levelOf({ exerciseLevels: {} }, 'x', ex), 0);
  assert.equal(levelOf({ exerciseLevels: { x: 5 } }, 'x', ex), 2);
  assert.equal(levelOf({ exerciseLevels: { x: -3 } }, 'x', ex), 0);
  assert.equal(levelOf({ exerciseLevels: { x: 'a' } }, 'x', ex), 0);
  assert.equal(levelOf(undefined, 'x'), 0);
  assert.equal(levelOf({ exerciseLevels: { x: 7 } }, 'x'), 7);
});

test('nextWorkout: by id, fallback to phase A, phase mismatch → A', () => {
  assert.equal(nextWorkout({ phaseId: 'p1-basis', nextWorkoutId: 'p1-b' }, phases, workouts).id, 'p1-b');
  assert.equal(nextWorkout({ phaseId: 'p1-basis', nextWorkoutId: 'nope' }, phases, workouts).id, 'p1-a');
  assert.equal(nextWorkout({ phaseId: 'p2-aufbau', nextWorkoutId: 'p1-c' }, phases, workouts).id, 'p2-a');
  assert.equal(nextWorkout({ phaseId: 'unknown', nextWorkoutId: null }, phases, workouts).id, 'p1-a');
});

test('advanceWorkout: A→B→C→A, unknown → A', () => {
  const p = phases[0];
  assert.equal(advanceWorkout({ nextWorkoutId: 'p1-a' }, p), 'p1-b');
  assert.equal(advanceWorkout({ nextWorkoutId: 'p1-b' }, p), 'p1-c');
  assert.equal(advanceWorkout({ nextWorkoutId: 'p1-c' }, p), 'p1-a');
  assert.equal(advanceWorkout({ nextWorkoutId: 'p2-b' }, p), 'p1-a');
  // full rotation
  let s = { nextWorkoutId: 'p1-a' }; const seen = [];
  for (let i = 0; i < 6; i++) { seen.push(s.nextWorkoutId); s = { nextWorkoutId: advanceWorkout(s, p) }; }
  assert.deepEqual(seen, ['p1-a', 'p1-b', 'p1-c', 'p1-a', 'p1-b', 'p1-c']);
});

test('buildSessionPlan: sections, levels, plannedSets, notes, id format', () => {
  const now = new Date(2026, 9, 31, 17, 5);
  const s = buildSessionPlan(W('p1-a', 'p1-basis'), { phaseId: 'p1-basis', exerciseLevels: { 'quad-set': 1 } }, content, { now });
  assert.equal(s.status, 'active');
  assert.match(s.id, /^s-20261031-1705-[a-z0-9]{4}$/);
  assert.deepEqual(s.exercises.map((e) => [e.exerciseId, e.section, e.level, e.plannedSets]), [
    ['heel', 'warmup', 0, 1], ['quad-set', 'knee', 1, 3], ['pull', 'archery', 0, 3], ['breath', 'cooldown', 0, 1]]);
  assert.equal(s.exercises[1].note, 'Linkes Bein');
  assert.equal('note' in s.exercises[2], false);
  assert.deepEqual(s.cursor, { index: 0, set: 0, step: 'pre' });
  assert.deepEqual(s.traffic, { provisional: null, final: null, reasons: [] });
});

test('buildSessionPlan: phaseMin filtering and unknown exercises dropped', () => {
  const w = W('p1-a', 'p1-basis', ['quad-set', 'lunge', 'ghost']);
  const ids = buildSessionPlan(w, { phaseId: 'p1-basis' }, content).exercises.map((e) => e.exerciseId);
  assert.deepEqual(ids, ['heel', 'quad-set', 'pull', 'breath']);
  const ids2 = buildSessionPlan(w, { phaseId: 'p2-aufbau' }, content).exercises.map((e) => e.exerciseId);
  assert.ok(ids2.includes('lunge'));
});

test('buildSessionPlan: taper reduces sets and hides never-done exercises', () => {
  const hist = [{ status: 'done', exercises: [
    { exerciseId: 'quad-set', skipped: false, sets: [{ done: true }] },
    { exerciseId: 'pull', skipped: true, sets: [] },
    { exerciseId: 'heel', sets: [{ done: true }] }, { exerciseId: 'breath', sets: [{ done: true }] }] }];
  const s = buildSessionPlan(W('p1-a', 'p1-basis'), { phaseId: 'p1-basis', exerciseLevels: { 'quad-set': 1 } }, content, { taper: true, history: hist });
  assert.equal(s.taper, true);
  assert.deepEqual(s.exercises.map((e) => [e.exerciseId, e.plannedSets]), [['heel', 1], ['quad-set', 2], ['breath', 1]]);
  // no history → keep all exercises (only volume reduced)
  const s2 = buildSessionPlan(W('p1-a', 'p1-basis'), { phaseId: 'p1-basis' }, content, { taper: true, history: [] });
  assert.equal(s2.exercises.length, 4);
  assert.equal(s2.exercises.find((e) => e.exerciseId === 'pull').plannedSets, 2);
});

test('applyRecommendation: new object, progress/regress/switch, no-op for hold/reduce/consult', () => {
  const st = { phaseId: 'p1-basis', exerciseLevels: { 'quad-set': 0 } };
  const a = applyRecommendation(st, { exerciseId: 'quad-set', action: 'progress', fromLevel: 0, toLevel: 1, toExerciseId: null });
  assert.equal(a.exerciseLevels['quad-set'], 1);
  assert.equal(st.exerciseLevels['quad-set'], 0);
  assert.notEqual(a, st);
  const b = applyRecommendation(st, { exerciseId: 'quad-set', action: 'progress', fromLevel: 1, toLevel: 0, toExerciseId: 'slr' });
  assert.deepEqual(b.exerciseLevels, { 'quad-set': 0, slr: 0 });
  const c = applyRecommendation({ exerciseLevels: { x: 2 } }, { exerciseId: 'x', action: 'regress', fromLevel: 2, toLevel: 1 });
  assert.equal(c.exerciseLevels.x, 1);
  for (const action of ['hold', 'reduce', 'consult']) {
    assert.deepEqual(applyRecommendation(st, { exerciseId: action === 'consult' ? null : 'quad-set', action, fromLevel: 0, toLevel: 0 }).exerciseLevels, st.exerciseLevels);
  }
  assert.deepEqual(applyRecommendation({}, null).exerciseLevels, {});
});

// ---- phaseProgress
const sess = (day, light, extra = {}) => ({
  id: day + light, status: 'done', phaseId: 'p1-basis', startedAt: new Date(`${day}T17:00:00`).toISOString(), endedAt: new Date(`${day}T17:40:00`).toISOString(),
  pre: { pain: 1 }, nextDay: null, traffic: { provisional: light, final: null, reasons: [] }, exercises: [], ...extra,
});

test('phaseProgress: empty history', () => {
  const p = phaseProgress({ exitCriteriaDone: {} }, phases[0], [], { today: '2026-11-02' });
  assert.equal(p.sessionsInPhase, 0);
  assert.equal(p.greenRatio, 0);
  assert.equal(p.ready, false);
  assert.equal(p.criteriaTotal, 3);
  assert.deepEqual(p.criteria.map((c) => c.met), [false, null, false]);
  assert.equal(p.suggestReady, false);
});

test('phaseProgress: greenRatio prefers final light, only this phase + done', () => {
  const s = [sess('2026-11-02', 'green'), sess('2026-11-04', 'yellow'), { ...sess('2026-11-05', 'green'), traffic: { provisional: 'green', final: 'red' } },
    sess('2026-11-06', 'green', { phaseId: 'p2-aufbau' }), sess('2026-11-07', 'green', { status: 'aborted' })];
  const p = phaseProgress({}, phases[0], s, { today: '2026-11-07' });
  assert.equal(p.sessionsInPhase, 3);
  assert.equal(p.greenRatio, 1 / 3);
});

test('phaseProgress: ready only when all criteria ticked (dedup, out-of-range ignored)', () => {
  assert.equal(phaseProgress({ exitCriteriaDone: { 'p1-basis': [0, 1] } }, phases[0], []).ready, false);
  assert.equal(phaseProgress({ exitCriteriaDone: { 'p1-basis': [0, 1, 1, 7] } }, phases[0], []).criteriaDone, 2);
  assert.equal(phaseProgress({ exitCriteriaDone: { 'p1-basis': [0, 1, 2] } }, phases[0], []).ready, true);
});

test('phaseProgress: "2 Wochen überwiegend grün" data-driven', () => {
  const s = [sess('2026-10-27', 'green'), sess('2026-10-29', 'yellow'), sess('2026-11-02', 'green'), sess('2026-11-04', 'green')];
  let p = phaseProgress({}, phases[0], s, { today: '2026-11-05' });
  assert.equal(p.criteria[0].met, true); // 3/4 green in W44+W45
  p = phaseProgress({}, phases[0], s.slice(0, 2), { today: '2026-11-03' }); // current week empty → W44 + W43 (empty)
  assert.equal(p.criteria[0].met, false);
  const half = [sess('2026-10-27', 'green'), sess('2026-11-02', 'red')];
  assert.equal(phaseProgress({}, phases[0], half, { today: '2026-11-03' }).criteria[0].met, false);
});

test('phaseProgress: next-day criterion and suggestReady', () => {
  const ok = [sess('2026-11-02', 'green', { nextDay: { pain: 2 } }), sess('2026-11-04', 'green', { nextDay: { pain: 1 } })];
  let p = phaseProgress({ exitCriteriaDone: { 'p1-basis': [1] } }, phases[0], [sess('2026-10-27', 'green'), ...ok], { today: '2026-11-05' });
  assert.equal(p.criteria[2].met, true);
  assert.equal(p.suggestReady, true);
  assert.equal(p.ready, false);
  const bad = [...ok, sess('2026-11-05', 'green', { nextDay: { pain: 3 } })];
  p = phaseProgress({}, phases[0], bad, { today: '2026-11-05' });
  assert.equal(p.criteria[2].met, false);
});

test('phaseProgress: weekly-goal weeks and OP date criteria', () => {
  const s = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27', '2026-10-28']
    .map((d) => sess(d, 'green', { phaseId: 'p2-aufbau' }));
  assert.equal(phaseProgress({}, phases[1], s, { today: '2026-11-02', weeklyGoal: 3 }).criteria[0].met, true);
  assert.equal(phaseProgress({}, phases[1], s, { today: '2026-11-02', settings: { weeklyGoal: 4 } }).criteria[0].met, false);
  assert.equal(phaseProgress({}, phases[2], [], { today: '2027-01-15', surgeryDate: '2027-01-15' }).criteria[0].met, true);
  assert.equal(phaseProgress({}, phases[2], [], { today: '2027-01-14', surgeryDate: '2027-01-15' }).criteria[0].met, false);
  assert.equal(phaseProgress({}, phases[2], [], { today: '2027-01-14', surgeryDate: null }).criteria[0].met, false);
});
