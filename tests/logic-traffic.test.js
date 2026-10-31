import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIGHTS, worst, evaluateSession, finalizeWithNextDay, recommendLevels, taperActive, applyTaper, thresholds,
} from '../js/logic/traffic-light.js';

const settings = { painThresholds: { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 }, surgeryDate: null, weeklyGoal: 3 };

let seq = 0;
/** Session fixture. ex: [{id, section, level, pain, sharp, rpe, skipped, sets}] */
function S({ day = '2026-11-02', pre = {}, post = {}, nextDay = null, ex = [], traffic = null, recs = [], taper = false, status = 'done' } = {}) {
  seq += 1;
  return {
    id: `s-${seq}`, workoutId: 'p1-a', phaseId: 'p1-basis', status, taper,
    startedAt: new Date(`${day}T17:00:00`).toISOString(), endedAt: new Date(`${day}T17:40:00`).toISOString(),
    pre: { pain: 1, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false, ...pre },
    exercises: ex.map((e) => ({
      exerciseId: e.id, section: e.section ?? 'knee', level: e.level ?? 0, painDuring: e.pain ?? 0, sharpPain: !!e.sharp,
      rpe: e.rpe ?? null, skipped: !!e.skipped,
      sets: Array.from({ length: e.sets ?? 2 }, () => ({ done: !e.skipped, reps: 10, at: '' })),
    })),
    post: post === null ? null : { pain: 1, swelling: 0, rpe: 6, note: '', ...post },
    nextDay,
    traffic: traffic ? { provisional: traffic, final: traffic, reasons: [] } : { provisional: null, final: null, reasons: [] },
    recommendations: recs,
  };
}
const knee = (pain = 0, extra = {}) => ({ id: 'quad-set', pain, ...extra });

const content = {
  phases: [{ id: 'p1-basis', order: 1 }, { id: 'p2-aufbau', order: 2 }],
  exercises: [
    { id: 'quad-set', name: 'Quad Set', block: 'knee', levels: [{ sets: 2 }, { sets: 3 }], progressTo: 'slr', regressTo: null, phaseMin: 'p1-basis' },
    { id: 'slr', name: 'Beinheben', block: 'knee', levels: [{ sets: 2 }, { sets: 3 }, { sets: 3 }], progressTo: null, regressTo: 'quad-set', phaseMin: 'p1-basis' },
    { id: 'wall-sit', name: 'Wandsitz', block: 'knee', levels: [{ sets: 2 }, { sets: 3 }], progressTo: 'adv', regressTo: null, phaseMin: 'p1-basis' },
    { id: 'adv', name: 'Fortgeschritten', block: 'knee', levels: [{ sets: 2 }], progressTo: null, regressTo: null, phaseMin: 'p2-aufbau' },
    { id: 'pull', name: 'Pull Apart', block: 'archery', levels: [{ sets: 2 }, { sets: 3 }, { sets: 3 }], progressTo: null, regressTo: null, phaseMin: 'p1-basis' },
    { id: 'row', name: 'Rudern', block: 'archery', levels: [{ sets: 2 }, { sets: 3 }], progressTo: null, regressTo: null, phaseMin: 'p1-basis' },
  ],
};
const state = (levels = {}) => ({ phaseId: 'p1-basis', exerciseLevels: levels });

// ---------------------------------------------------------------- basics
test('LIGHTS order and worst()', () => {
  assert.deepEqual([...LIGHTS], ['green', 'yellow', 'red', 'stop']);
  assert.equal(worst('green', 'yellow'), 'yellow');
  assert.equal(worst('stop', 'red'), 'stop');
  assert.equal(worst(null, null), 'green');
  assert.equal(worst(null, 'red'), 'red');
});

test('thresholds fall back to defaults', () => {
  assert.deepEqual(thresholds({}), { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 });
  assert.equal(thresholds({ painThresholds: { greenMax: 3 } }).greenMax, 3);
});

// ---------------------------------------------------------------- provisional
test('green: all low, no swelling', () => {
  const r = evaluateSession(S({ ex: [knee(2)], post: { pain: 2 } }), settings);
  assert.equal(r.traffic, 'green');
  assert.deepEqual(r.perExercise, { 'quad-set': 'green' });
  assert.ok(r.reasons.length >= 1);
});

test('yellow boundaries: pain during / after 3..5', () => {
  assert.equal(evaluateSession(S({ ex: [knee(3)] }), settings).traffic, 'yellow');
  assert.equal(evaluateSession(S({ ex: [knee(5)] }), settings).traffic, 'yellow');
  assert.equal(evaluateSession(S({ ex: [knee(0)], post: { pain: 3 } }), settings).traffic, 'yellow');
  assert.equal(evaluateSession(S({ ex: [knee(0)], post: { pain: 5 } }), settings).traffic, 'yellow');
});

test('red: pain > 5 during or after', () => {
  assert.equal(evaluateSession(S({ ex: [knee(6)] }), settings).traffic, 'red');
  assert.equal(evaluateSession(S({ ex: [knee(0)], post: { pain: 6 } }), settings).traffic, 'red');
});

test('red: sharp pain (knee and any block), giving way', () => {
  assert.equal(evaluateSession(S({ ex: [knee(0, { sharp: true })] }), settings).traffic, 'red');
  const arch = evaluateSession(S({ ex: [{ id: 'pull', section: 'archery', pain: null, sharp: true }] }), settings);
  assert.equal(arch.traffic, 'red');
  assert.deepEqual(arch.perExercise, {});
  assert.equal(evaluateSession(S({ ex: [knee(0)], pre: { mechanical: { locking: false, givingWay: true } } }), settings).traffic, 'red');
  assert.equal(evaluateSession(S({ ex: [knee(0)], post: { givingWay: true } }), settings).traffic, 'red');
});

test('swelling: new swelling red, persistent swelling yellow', () => {
  assert.equal(evaluateSession(S({ ex: [knee(0)], post: { swelling: 1 } }), settings).traffic, 'red');
  assert.equal(evaluateSession(S({ ex: [knee(0)], pre: { swelling: 1 }, post: { swelling: 1 } }), settings).traffic, 'yellow');
  assert.equal(evaluateSession(S({ ex: [knee(0)], pre: { swelling: 2 }, post: { swelling: 1 } }), settings).traffic, 'yellow');
});

test('stop: locking, night pain, swelling > 48 h (pre or post)', () => {
  assert.equal(evaluateSession(S({ ex: [knee(0)], pre: { mechanical: { locking: true, givingWay: false } } }), settings).traffic, 'stop');
  assert.equal(evaluateSession(S({ ex: [knee(0)], pre: { nightPain: true } }), settings).traffic, 'stop');
  assert.equal(evaluateSession(S({ ex: [knee(0)], pre: { swellingOver48h: true } }), settings).traffic, 'stop');
  assert.equal(evaluateSession(S({ ex: [knee(0)], post: { locking: true } }), settings).traffic, 'stop');
});

test('stop: 2 reds in a row (previous final light red)', () => {
  const prev = S({ traffic: 'red', ex: [knee(7)] });
  const r = evaluateSession(S({ ex: [knee(7)] }), settings, [prev]);
  assert.equal(r.traffic, 'stop');
  assert.equal(r.perExercise['quad-set'], 'stop');
  // previous yellow → stays red
  assert.equal(evaluateSession(S({ ex: [knee(7)] }), settings, [S({ traffic: 'yellow' })]).traffic, 'red');
  // previous red but current yellow → yellow
  assert.equal(evaluateSession(S({ ex: [knee(4)] }), settings, [prev]).traffic, 'yellow');
  // uses provisional when final missing; ignores aborted sessions
  const provOnly = S(); provOnly.traffic = { provisional: 'red', final: null, reasons: [] };
  assert.equal(evaluateSession(S({ ex: [knee(7)] }), settings, [provOnly]).traffic, 'stop');
  const aborted = S({ traffic: 'red', status: 'aborted' });
  assert.equal(evaluateSession(S({ ex: [knee(7)] }), settings, [prev, aborted]).traffic, 'stop');
  assert.equal(evaluateSession(S({ ex: [knee(7)] }), settings, [aborted]).traffic, 'red');
});

test('provisional ignores session.nextDay', () => {
  const s = S({ ex: [knee(0)], nextDay: { pain: 9, swelling: 2, stiffness: 2 } });
  assert.equal(evaluateSession(s, settings).traffic, 'green');
});

test('per-exercise light: own pain + shared criteria; skipped excluded; worst for duplicates', () => {
  const s = S({ ex: [knee(1), { id: 'slr', pain: 4 }, { id: 'wall-sit', skipped: true, pain: 9 }, { id: 'pull', section: 'archery', pain: 9 }, knee(3)] });
  const r = evaluateSession(s, settings);
  assert.deepEqual(r.perExercise, { 'quad-set': 'yellow', slr: 'yellow' });
  assert.equal(r.traffic, 'yellow'); // archery pain does not count
  const r2 = evaluateSession(S({ ex: [knee(0), { id: 'slr', pain: 0 }], post: { pain: 4 } }), settings);
  assert.deepEqual(r2.perExercise, { 'quad-set': 'yellow', slr: 'yellow' });
});

test('missing pre/post handled (baseline 0)', () => {
  const s = S({ ex: [knee(1)], post: null }); s.pre = null;
  assert.equal(evaluateSession(s, settings).traffic, 'green');
  assert.equal(finalizeWithNextDay(s, { pain: 2, swelling: 0, stiffness: 0 }, settings).traffic, 'yellow');
  assert.equal(evaluateSession({}, settings).traffic, 'green');
});

test('custom thresholds respected', () => {
  const st = { painThresholds: { greenMax: 3, yellowMax: 6, greenStreakToProgress: 2 } };
  assert.equal(evaluateSession(S({ ex: [knee(3)] }), st).traffic, 'green');
  assert.equal(evaluateSession(S({ ex: [knee(6)] }), st).traffic, 'yellow');
});

// ---------------------------------------------------------------- next day
test('next-day boundary: d ≤ 1 green, d = 2 yellow, d > 2 red', () => {
  const s = S({ ex: [knee(0)], pre: { pain: 2 } });
  const nd = (pain, extra = {}) => ({ pain, swelling: 0, stiffness: 0, ...extra });
  assert.equal(finalizeWithNextDay(s, nd(3), settings).traffic, 'green');
  assert.equal(finalizeWithNextDay(s, nd(4), settings).traffic, 'yellow');
  assert.equal(finalizeWithNextDay(s, nd(5), settings).traffic, 'red');
  assert.equal(finalizeWithNextDay(s, nd(0), settings).traffic, 'green');
});

test('next-day not recovered / flags', () => {
  const s = S({ ex: [knee(0)] });
  assert.equal(finalizeWithNextDay(s, { pain: 1, swelling: 1, stiffness: 0 }, settings).traffic, 'red');
  assert.equal(finalizeWithNextDay(s, { pain: 1, swelling: 0, stiffness: 2 }, settings).traffic, 'red');
  assert.equal(finalizeWithNextDay(s, { pain: 1, swelling: 0, stiffness: 1 }, settings).traffic, 'green');
  assert.equal(finalizeWithNextDay(s, { pain: 1, swelling: 0, stiffness: 0, givingWay: true }, settings).traffic, 'red');
  assert.equal(finalizeWithNextDay(s, { pain: 1, swelling: 0, stiffness: 0, locking: true }, settings).traffic, 'stop');
  assert.equal(finalizeWithNextDay(s, { pain: 1, swelling: 0, stiffness: 0, nightPain: true }, settings).traffic, 'stop');
  const r = finalizeWithNextDay(s, { pain: 1, swelling: 1, stiffness: 0 }, settings);
  assert.equal(r.perExercise['quad-set'], 'red');
});

test('final light can only stay or get worse than stored provisional', () => {
  const s = S({ ex: [knee(0)] });
  s.traffic = { provisional: 'yellow', final: null, reasons: [] };
  const r = finalizeWithNextDay(s, { pain: 0, swelling: 0, stiffness: 0 }, settings);
  assert.equal(r.traffic, 'yellow');
  s.traffic.provisional = 'stop';
  assert.equal(finalizeWithNextDay(s, { pain: 0, swelling: 0, stiffness: 0 }, settings).traffic, 'stop');
});

test('finalize without next-day data = provisional; uses session.nextDay when arg null', () => {
  const s = S({ ex: [knee(4)] });
  assert.equal(finalizeWithNextDay(s, null, settings).traffic, 'yellow');
  s.nextDay = { pain: 9, swelling: 0, stiffness: 0 };
  assert.equal(finalizeWithNextDay(s, null, settings).traffic, 'red');
});

test('finalize: 2 reds in a row with next-day', () => {
  const prev = S({ traffic: 'red' });
  const s = S({ ex: [knee(0)] });
  assert.equal(finalizeWithNextDay(s, { pain: 9, swelling: 0, stiffness: 0 }, settings, [prev]).traffic, 'stop');
});

// ---------------------------------------------------------------- taper
test('taperActive: 1..7 days before surgery, null/past dates', () => {
  assert.equal(taperActive('2027-01-15', '2027-01-08'), true);
  assert.equal(taperActive('2027-01-15', '2027-01-14'), true);
  assert.equal(taperActive('2027-01-15', '2027-01-07'), false);
  assert.equal(taperActive('2027-01-15', '2027-01-15'), false);
  assert.equal(taperActive('2026-01-15', '2026-10-31'), false);
  assert.equal(taperActive(null, '2026-10-31'), false);
  assert.equal(taperActive('2027-01-15', ''), false);
  // across DST change (Europe: 2027-03-28)
  assert.equal(taperActive('2027-03-30', '2027-03-23'), true);
});

test('applyTaper: sets × 0.65 rounded, min 1, rest unchanged', () => {
  assert.deepEqual(applyTaper({ label: 'x', sets: 3, reps: 10, hold: 5, rest: 30 }), { label: 'x', sets: 2, reps: 10, hold: 5, rest: 30 });
  assert.equal(applyTaper({ sets: 1 }).sets, 1);
  assert.equal(applyTaper({ sets: 2 }).sets, 1);
  assert.equal(applyTaper({ sets: 4 }).sets, 3);
  assert.equal(applyTaper({ sets: 5 }).sets, 3);
  const lvl = { sets: 3 }; applyTaper(lvl); assert.equal(lvl.sets, 3);
});

// ---------------------------------------------------------------- recommendations
const opts = { today: '2026-11-10' };
const byId = (recs, id) => recs.find((r) => r.exerciseId === id);

test('knee: 1 green → hold; 2 consecutive greens at same level → progress', () => {
  const h1 = S({ ex: [knee(0)] });
  let recs = recommendLevels(h1, [], state(), content, settings, opts);
  assert.equal(byId(recs, 'quad-set').action, 'hold');
  const cur = S({ ex: [knee(1)] });
  recs = recommendLevels(cur, [h1], state(), content, settings, opts);
  assert.deepEqual(byId(recs, 'quad-set'), { exerciseId: 'quad-set', action: 'progress', fromLevel: 0, toLevel: 1, toExerciseId: null, reason: '2× grün in Folge.', status: 'pending' });
});

test('knee streak skips sessions without the exercise (A/B/C rotation) but breaks on yellow / other level', () => {
  const g = S({ ex: [knee(0)] });
  const other = S({ ex: [{ id: 'slr', pain: 0 }] });
  assert.equal(byId(recommendLevels(S({ ex: [knee(0)] }), [g, other], state(), content, settings, opts), 'quad-set').action, 'progress');
  const y = S({ ex: [knee(4)] });
  assert.equal(byId(recommendLevels(S({ ex: [knee(0)] }), [g, y], state(), content, settings, opts), 'quad-set').action, 'hold');
  const lowerLevel = S({ ex: [knee(0, { level: 0 })] });
  const r = recommendLevels(S({ ex: [knee(0, { level: 1 })] }), [lowerLevel], state({ 'quad-set': 1 }), content, settings, opts);
  assert.equal(byId(r, 'quad-set').action, 'hold');
  // skipped in history doesn't count, doesn't break
  const skipped = S({ ex: [knee(0, { skipped: true })] });
  assert.equal(byId(recommendLevels(S({ ex: [knee(0)] }), [g, skipped], state(), content, settings, opts), 'quad-set').action, 'progress');
});

test('knee: history green requires final light; red next day in history breaks streak', () => {
  const hBad = S({ ex: [knee(0)], nextDay: { pain: 9, swelling: 0, stiffness: 0 } });
  assert.equal(byId(recommendLevels(S({ ex: [knee(0)] }), [hBad], state(), content, settings, opts), 'quad-set').action, 'hold');
});

test('knee: no repeated progress suggestion without fresh streak', () => {
  const g1 = S({ ex: [knee(0)] });
  const g2 = S({ ex: [knee(0)], recs: [{ exerciseId: 'quad-set', action: 'progress', fromLevel: 0, toLevel: 1, status: 'dismissed' }] });
  const r = recommendLevels(S({ ex: [knee(0)] }), [g1, g2], state(), content, settings, opts);
  assert.equal(byId(r, 'quad-set').action, 'hold');
  const g4 = S({ ex: [knee(0)] });
  assert.equal(byId(recommendLevels(S({ ex: [knee(0)] }), [g1, g2, g4], state(), content, settings, opts), 'quad-set').action, 'progress');
});

test('greenStreakToProgress setting', () => {
  const st = { painThresholds: { greenMax: 2, yellowMax: 5, greenStreakToProgress: 3 } };
  const g = () => S({ ex: [knee(0)] });
  assert.equal(byId(recommendLevels(g(), [g()], state(), content, st, opts), 'quad-set').action, 'hold');
  assert.equal(byId(recommendLevels(g(), [g(), g()], state(), content, st, opts), 'quad-set').action, 'progress');
});

test('knee: yellow → hold; red → regress; red at level 0 → regressTo or reduce', () => {
  assert.equal(byId(recommendLevels(S({ ex: [knee(4)] }), [], state(), content, settings, opts), 'quad-set').action, 'hold');
  const reg = byId(recommendLevels(S({ ex: [{ id: 'slr', pain: 7, level: 2 }] }), [], state({ slr: 2 }), content, settings, opts), 'slr');
  assert.deepEqual([reg.action, reg.fromLevel, reg.toLevel, reg.toExerciseId], ['regress', 2, 1, null]);
  const toPrev = byId(recommendLevels(S({ ex: [{ id: 'slr', pain: 7 }] }), [], state(), content, settings, opts), 'slr');
  assert.deepEqual([toPrev.action, toPrev.toExerciseId, toPrev.toLevel], ['regress', 'quad-set', 1]);
  const reduce = byId(recommendLevels(S({ ex: [knee(7)] }), [], state(), content, settings, opts), 'quad-set');
  assert.deepEqual([reduce.action, reduce.fromLevel, reduce.toLevel], ['reduce', 0, 0]);
});

test('knee progress beyond last level → progressTo (phaseMin respected) or hold', () => {
  const g = () => S({ ex: [knee(0, { level: 1 })] });
  const r = byId(recommendLevels(g(), [g()], state({ 'quad-set': 1 }), content, settings, opts), 'quad-set');
  assert.deepEqual([r.action, r.toExerciseId, r.toLevel, r.fromLevel], ['progress', 'slr', 0, 1]);
  const w = () => S({ ex: [{ id: 'wall-sit', pain: 0, level: 1 }] });
  const r2 = byId(recommendLevels(w(), [w()], state({ 'wall-sit': 1 }), content, settings, opts), 'wall-sit');
  assert.equal(r2.action, 'hold'); // adv requires phase 2
  const r3 = byId(recommendLevels(w(), [w()], { phaseId: 'p2-aufbau', exerciseLevels: { 'wall-sit': 1 } }, content, settings, opts), 'wall-sit');
  assert.equal(r3.toExerciseId, 'adv');
  const s = () => S({ ex: [{ id: 'slr', pain: 0, level: 2 }] });
  assert.equal(byId(recommendLevels(s(), [s()], state({ slr: 2 }), content, settings, opts), 'slr').action, 'hold');
});

test('one variable at a time: max one progress per block and session', () => {
  const g = () => S({ ex: [knee(0), { id: 'slr', pain: 0 }, { id: 'pull', section: 'archery', rpe: 5 }, { id: 'row', section: 'archery', rpe: 5 }] });
  const recs = recommendLevels(g(), [g()], state(), content, settings, opts);
  assert.equal(byId(recs, 'quad-set').action, 'progress');
  assert.equal(byId(recs, 'slr').action, 'hold');
  assert.equal(byId(recs, 'pull').action, 'progress');
  assert.equal(byId(recs, 'row').action, 'hold');
});

test('archery RPE rule', () => {
  const a = (rpe, level = 0) => S({ ex: [{ id: 'pull', section: 'archery', rpe, pain: null, level }] });
  assert.equal(byId(recommendLevels(a(6), [], state(), content, settings, opts), 'pull').action, 'hold');
  assert.equal(byId(recommendLevels(a(6), [a(5)], state(), content, settings, opts), 'pull').action, 'progress');
  assert.equal(byId(recommendLevels(a(6), [a(7)], state(), content, settings, opts), 'pull').action, 'hold');
  assert.equal(byId(recommendLevels(a(8), [a(5)], state(), content, settings, opts), 'pull').action, 'hold');
  const reg = byId(recommendLevels(a(9, 1), [], state({ pull: 1 }), content, settings, opts), 'pull');
  assert.deepEqual([reg.action, reg.toLevel], ['regress', 0]);
  assert.equal(byId(recommendLevels(a(10), [], state(), content, settings, opts), 'pull').action, 'reduce');
  assert.equal(byId(recommendLevels(a(null), [], state(), content, settings, opts), 'pull'), undefined);
  // knee red does not regress archery
  const mixed = S({ ex: [knee(7), { id: 'pull', section: 'archery', rpe: 5 }] });
  assert.equal(byId(recommendLevels(mixed, [a(5)], state(), content, settings, opts), 'pull').action, 'progress');
});

test('stop → single consult recommendation only', () => {
  const s = S({ ex: [knee(0), { id: 'pull', section: 'archery', rpe: 5 }], pre: { nightPain: true } });
  const recs = recommendLevels(s, [], state(), content, settings, opts);
  assert.equal(recs.length, 1);
  assert.deepEqual([recs[0].action, recs[0].exerciseId, recs[0].status], ['consult', null, 'pending']);
});

test('taper: no progress recommendations (session.taper or surgery date)', () => {
  const g = () => S({ ex: [knee(0)] });
  const st = { ...settings, surgeryDate: '2026-11-14' };
  assert.equal(byId(recommendLevels(g(), [g()], state(), content, st, { today: '2026-11-10' }), 'quad-set').action, 'hold');
  const tap = S({ ex: [knee(0)], taper: true });
  assert.equal(byId(recommendLevels(tap, [g()], state(), content, settings, opts), 'quad-set').action, 'hold');
  // regress still allowed during taper
  assert.equal(byId(recommendLevels(S({ ex: [knee(7)], taper: true }), [], state(), content, settings, opts), 'quad-set').action, 'reduce');
  // past surgery date → no taper
  const past = { ...settings, surgeryDate: '2026-11-01' };
  assert.equal(byId(recommendLevels(g(), [g()], state(), content, past, opts), 'quad-set').action, 'progress');
});

test('warm-up / cool-down / unperformed exercises produce no recommendation; empty inputs safe', () => {
  const s = S({ ex: [{ id: 'heel', section: 'warmup' }, { id: 'breath', section: 'cooldown' }, knee(0, { skipped: true })] });
  assert.deepEqual(recommendLevels(s, [], state(), content, settings, opts), []);
  assert.deepEqual(recommendLevels(null, [], state(), content, settings, opts), []);
  assert.ok(Array.isArray(recommendLevels(S({ ex: [knee(0)] }), undefined, {}, {}, {}, {})));
});

test('current session included in history is ignored', () => {
  const cur = S({ ex: [knee(0)] });
  assert.equal(byId(recommendLevels(cur, [cur], state(), content, settings, opts), 'quad-set').action, 'hold');
});
