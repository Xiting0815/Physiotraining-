// v2 UI helpers (Heute, Plan, Profil, router, ui.js labels/formatters) – pure, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recentCustomWorkouts, postOpCardMode, isMonday } from '../js/views/today.js';
import { setToggle, exerciseIdsOf } from '../js/views/plan.js';
import { validateGoal, validateProfile, parseNum } from '../js/views/profile.js';
import { fmtNum, fmtInt, fmtDistance, EQUIPMENT_LABEL, BLOCK_LABEL, KIND_LABEL, INTENSITY_LABEL, kindOf, workoutSplit, awardBadges } from '../js/views/ui.js';
import { matchRoute, routes } from '../js/router.js';
import { postOpStatus, clearance } from '../js/logic/schedule.js';
import { exerciseAvailable } from '../js/logic/progression.js';
import { evaluateBadges } from '../js/logic/motivation.js';
import { defaults } from '../js/store.js';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const exercises = load('exercises').exercises;
const workouts = load('workouts').workouts;
const phases = load('phases').phases;
const badges = load('badges').badges;

test('router: v2 routes resolve to their view modules', () => {
  assert.equal(matchRoute('#/eigene').route.view, 'custom-workouts');
  const e = matchRoute('#/eigene/neu');
  assert.equal(e.route.view, 'custom-workout-edit');
  assert.equal(e.params.id, 'neu');
  assert.equal(matchRoute('#/eigene/cw-abc').params.id, 'cw-abc');
  assert.equal(matchRoute('#/gesundheit?focus=bericht').route.view, 'health');
  assert.equal(matchRoute('#/gesundheit?focus=bericht').query.focus, 'bericht');
  assert.equal(matchRoute('#/profil').route.view, 'profile');
  for (const r of routes) assert.ok(fs.existsSync(new URL(`../js/views/${r.view}.js`, import.meta.url)), `view module for ${r.pattern}`);
});

test('ui labels: rowing machine, cardio block, kinds, intensity', () => {
  assert.equal(EQUIPMENT_LABEL['rowing-machine'], 'Rudergerät');
  assert.equal(BLOCK_LABEL.cardio, 'Rudern');
  assert.deepEqual(Object.keys(KIND_LABEL), ['strength', 'short', 'cardio', 'custom']);
  assert.equal(INTENSITY_LABEL.vigorous, 'Zügig');
  assert.equal(kindOf({}), 'strength');
  assert.equal(kindOf({ kind: 'cardio' }), 'cardio');
  const row = workouts.find((w) => w.id === 'p1-row');
  assert.ok(workoutSplit(row).cardio >= 1);
});

test('German number formatting', () => {
  assert.equal(fmtNum(82.46, 1), '82,5');
  assert.equal(fmtNum(85, 1, { trim: true }), '85');
  assert.equal(fmtNum(-0.42, 2, { sign: true }), '-0,42');
  assert.equal(fmtNum(0.3, 1, { sign: true }), '+0,3');
  assert.equal(fmtNum(null), '–');
  assert.equal(fmtInt(12345), '12.345');
  assert.equal(fmtDistance(850), '850 m');
  assert.equal(fmtDistance(12400), '12,4 km');
  assert.equal(fmtDistance(0), '0 m');
});

test('recentCustomWorkouts: recently used first, then recently edited, max n', () => {
  const cws = [
    { id: 'cw-1', updatedAt: '2026-11-01T10:00:00Z' },
    { id: 'cw-2', updatedAt: '2026-11-05T10:00:00Z' },
    { id: 'cw-3', updatedAt: '2026-11-03T10:00:00Z' },
    { id: 'cw-4', updatedAt: '2026-10-01T10:00:00Z' },
  ];
  const sessions = [{ id: 's', status: 'done', workoutId: 'cw-4', endedAt: '2026-11-06T10:00:00Z' }];
  assert.deepEqual(recentCustomWorkouts(cws, sessions, 3).map((w) => w.id), ['cw-4', 'cw-2', 'cw-3']);
  assert.deepEqual(recentCustomWorkouts([], [], 3), []);
  assert.deepEqual(recentCustomWorkouts(undefined, undefined), []);
});

test('postOpCardMode follows postOpStatus and the current phase', () => {
  const p3 = phases.find((p) => p.id === 'p3-op-vorbereitung');
  const p4 = phases.find((p) => p.kind === 'postop');
  const settings = { ...defaults().settings, surgeryDate: '2027-01-05' };
  const st0 = defaults().state;
  assert.equal(postOpCardMode(postOpStatus(settings, st0, '2027-01-04'), p3), null);
  assert.equal(postOpCardMode(postOpStatus(settings, st0, '2027-01-05'), p3), null); // OP day → countdown card
  assert.equal(postOpCardMode(postOpStatus(settings, st0, '2027-01-08'), p3), 'clearance');
  const cleared = { ...st0, postOpClearance: clearance('ok', new Date('2027-01-08T10:00:00Z')) };
  assert.equal(postOpCardMode(postOpStatus(settings, cleared, '2027-01-08'), p3), 'enter');
  assert.equal(postOpCardMode(postOpStatus(settings, { ...cleared, phaseId: p4.id }, '2027-01-20'), p4), 'active');
  assert.equal(postOpCardMode(postOpStatus(settings, { ...cleared, phaseId: p4.id }, '2027-02-20'), p4), 'ended');
  const early = { ...cleared, phaseId: p4.id, postOpEndClearance: clearance('Arzt') };
  assert.equal(postOpCardMode(postOpStatus(settings, early, '2027-01-25'), p4), 'ended');
});

test('isMonday', () => {
  assert.equal(isMonday('2026-11-09'), true);
  assert.equal(isMonday('2026-11-07'), false);
});

test('setToggle: allowed vs. post-op blocked exercises', () => {
  const p4 = phases.find((p) => p.kind === 'postop');
  const allowed = exercises.find((e) => e.postOpAllowed !== false && e.block === 'knee');
  const blocked = exercises.find((e) => e.postOpAllowed === false && e.block !== 'cardio');
  let t = setToggle({}, allowed, false);
  assert.equal(t[allowed.id], false);
  assert.equal(exerciseAvailable(allowed, p4, { exerciseToggles: t }), false);
  t = setToggle(t, allowed, true);
  assert.equal(allowed.id in t, false);
  t = setToggle(t, blocked, true);
  assert.equal(t[blocked.id], true);
  assert.equal(exerciseAvailable(blocked, p4, { exerciseToggles: t }), true);
  t = setToggle(t, blocked, false);
  assert.equal(blocked.id in t, false);
  assert.equal(exerciseAvailable(blocked, p4, { exerciseToggles: t }), false);
});

test('exerciseIdsOf: unique ids across p4 workouts, none blocked by default', () => {
  const p4 = phases.find((p) => p.kind === 'postop');
  const ws = ['A', 'B', 'C'].map((k) => workouts.find((w) => w.id === p4.workouts[k]));
  const ids = exerciseIdsOf(ws);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length > 5);
});

test('profile validation', () => {
  assert.equal(parseNum('82,5'), 82.5);
  assert.equal(parseNum(''), null);
  assert.ok(Number.isNaN(parseNum('abc')));
  const ok = validateProfile({ heightCm: '182', birthYear: '1984', sex: 'm', activityLevel: 'moderate' }, '2026-11-07');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.profile, { heightCm: 182, birthYear: 1984, sex: 'm', activityLevel: 'moderate' });
  const bad = validateProfile({ heightCm: '82', birthYear: '2020', sex: 'x', activityLevel: '?' }, '2026-11-07');
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.heightCm && bad.errors.birthYear);
  assert.equal(bad.profile.sex, null);
  assert.equal(bad.profile.activityLevel, 'light');
});

test('weight goal validation', () => {
  const today = '2026-11-07';
  const ok = validateGoal({ startKg: '95,4', targetKg: '88', targetDate: '2027-03-01' }, today);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.goal, { startKg: 95.4, targetKg: 88, targetDate: '2027-03-01', startDate: today });
  assert.ok(validateGoal({ startKg: '90', targetKg: '92', targetDate: '2027-03-01' }, today).errors.targetKg);
  assert.ok(validateGoal({ startKg: '90', targetKg: '85', targetDate: '2026-11-01' }, today).errors.targetDate);
  assert.ok(validateGoal({ startKg: '', targetKg: '85', targetDate: '2027-01-01' }, today).errors.startKg);
  assert.equal(validateGoal({ startKg: '90', targetKg: '85', targetDate: '2027-01-01' }, today, { startDate: '2026-10-01' }).goal.startDate, '2026-10-01');
});

test('awardBadges: first custom workout earns its badge once', () => {
  const d = defaults();
  d.state.customWorkouts = [{ id: 'cw-x', name: 'X', kind: 'custom', warmup: [], blocks: [], cooldown: [] }];
  const ids = awardBadges(d, badges, evaluateBadges, { today: '2026-11-07', now: new Date('2026-11-07T10:00:00Z'), xpPerBadge: 15 });
  assert.ok(ids.includes('first-custom'));
  assert.equal(d.state.xp, ids.length * 15);
  assert.deepEqual(awardBadges(d, badges, evaluateBadges, { today: '2026-11-07' }), []);
});
