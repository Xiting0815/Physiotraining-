// v5.3 (SPEC §18): seat split (fixed chair vs office chair with wheels), knee relief routine, shoulder impingement
// protection, context-aware session CTA, rowing without a timer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  availableEquipment, hasEquipment, instructionsFor, migrateEquipment, resolveExercise, OFFICE_CHAIR_NOTE, MIGRATION_STAMP, EQUIPMENT_MODEL, ANY_OF,
} from '../js/logic/equipment.js';
import { buildSessionPlan, getWorkout, phaseWorkouts, phasePlanExerciseIds } from '../js/logic/progression.js';
import { estimateWorkoutMinutes } from '../js/logic/duration.js';
import { shoulderOk, shoulderLimit, elevationOf, hasFocus } from '../js/logic/shoulder.js';
import { weeklyProgress, streak } from '../js/logic/stats.js';
import { xpFor, XP } from '../js/logic/motivation.js';
import { pendingNextDay } from '../js/logic/next-day.js';
import { validateCustomWorkout } from '../js/logic/custom-workouts.js';
import { computePoints } from '../js/components/pt-figure.js';
import { mergeSync } from '../js/sync/merge.js';
import * as store from '../js/store.js';
import * as H from '../js/views/session-helpers.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases };
const poses = load('poses').poses;
const ex = (id) => content.exercises.find((e) => e.id === id);
/** The user's equipment: office chair with wheels (NO fixed chair), massage stick, sling, rowing, anchor, handles (+ base). */
const USER = ['office-chair', 'massage-stick', 'sling-trainer', 'rowing-machine', 'door-anchor', 'band-handles'];
const settingsWith = (owned, extra = {}) => ({ ...store.defaults().settings, ownedEquipment: owned, ...extra });
const USER_S = settingsWith(USER, { shoulderImpingement: true, shoulderMaxElevationDeg: 65 });
const USER_NO_SHOULDER = settingsWith(USER);
const stateIn = (phaseId, extra = {}) => ({ ...store.defaults().state, phaseId, ...extra });
const PREHAB = ['p1-basis', 'p2-aufbau', 'p3-op-vorbereitung'];
const ALL_PHASES = [...PREHAB, 'p4-entlastung'];
const maxLevels = Object.fromEntries(content.exercises.map((e) => [e.id, e.levels.length - 1]));
const plansOf = (settings, levels = {}) => {
  const out = [];
  for (const phaseId of ALL_PHASES) {
    const st = stateIn(phaseId, { exerciseLevels: levels });
    const phase = content.phases.find((p) => p.id === phaseId);
    const pw = phaseWorkouts(phase, content.workouts);
    for (const w of [...pw.rotation, pw.short, pw.relief].filter(Boolean)) {
      for (const rowWarmup of w.kind === 'strength' && phaseId !== 'p4-entlastung' ? [false, true] : [false]) {
        out.push({ w, st, phaseId, rowWarmup, plan: buildSessionPlan(w, st, content, { settings, rowWarmup, rowFinisher: false }) });
      }
    }
  }
  return out;
};

// ---------------------------------------------------------------------------- equipment: seat split
test('seat split: chair is optional now; `seat` is satisfied by a fixed chair OR the office chair', () => {
  assert.deepEqual(ANY_OF.seat, ['chair-fixed', 'office-chair']);
  const office = availableEquipment(settingsWith(['office-chair']));
  assert.ok(office.has('seat') && !office.has('chair-fixed'));
  assert.ok(availableEquipment(settingsWith(['chair-fixed'])).has('seat'));
  assert.ok(!availableEquipment(settingsWith([])).has('seat'));
  for (const e of content.exercises) assert.ok(!e.equipment.includes('chair'), `${e.id} still uses the old base "chair"`);
  // quiet seated exercises → seat; pushing / standing up / horizontal load → fixed chair
  for (const id of ['knee-pendulum', 'seated-knee-extension', 'seated-hamstring-curl', 'seated-thoracic-rotation', 'ankle-circles-seated']) assert.ok(ex(id).equipment.includes('seat'), id);
  for (const id of ['sit-to-stand', 'right-leg-sit-to-stand', 'chair-dip', 'seated-press-up', 'hamstring-bridge-chair', 'thoracic-extension-chair', 'seated-row']) {
    assert.ok(ex(id).equipment.includes('chair-fixed'), id);
    assert.equal(hasEquipment(ex(id), settingsWith(['office-chair'])), false, `${id} not on wheels`);
  }
  // support exercises hold on to the wall, never to a chair
  for (const id of ['calf-raise', 'single-leg-stance', 'mini-squat', 'standing-hip-abduction', 'standing-hip-extension', 'leg-swing-side', 'hip-flexor-stretch-standing']) {
    assert.ok(ex(id).equipment.includes('wall') && !ex(id).instructions.join(' ').includes('Stuhllehne'), id);
  }
});

test('office chair only: seated exercises get the brake/no-swivel setup step; fixed chair does not', () => {
  const kp = ex('knee-pendulum');
  assert.equal(instructionsFor(kp, settingsWith(['office-chair']))[0], OFFICE_CHAIR_NOTE);
  assert.match(OFFICE_CHAIR_NOTE, /Lehne an die Wand.*Rollen feststellen.*nicht drehen/);
  assert.notEqual(instructionsFor(kp, settingsWith(['office-chair', 'chair-fixed']))[0], OFFICE_CHAIR_NOTE);
  // works together with the door anchor step replacement
  const hc = ex('seated-hamstring-curl');
  const ins = instructionsFor(hc, settingsWith(['office-chair', 'door-anchor']));
  assert.equal(ins[0], OFFICE_CHAIR_NOTE);
  assert.match(ins[1], /Türanker/);
});

test('fallback chains: unsafe chair exercises are replaced (this user and others)', () => {
  const r = (id, owned, phaseId = 'p2-aufbau', settings = settingsWith(owned)) => {
    const order = (p) => content.phases.find((x) => x.id === p).order;
    return resolveExercise(id, { exercises: content.exercises, avail: availableEquipment(settings),
      usable: (e) => order(e.phaseMin) <= order(phaseId) && shoulderOk(e, 0, settings) })?.exerciseId;
  };
  assert.equal(r('chair-dip', ['office-chair', 'sling-trainer']), 'sling-dip-assisted');
  assert.equal(r('chair-dip', ['office-chair']), 'band-triceps-extension');
  assert.equal(r('seated-press-up', ['office-chair', 'sling-trainer']), 'sling-triceps-press');
  assert.equal(r('seated-press-up', ['office-chair']), 'band-triceps-extension');
  assert.equal(r('sit-to-stand', ['office-chair', 'sling-trainer']), 'sling-assisted-mini-squat');
  assert.equal(r('sit-to-stand', ['office-chair', 'sling-trainer'], 'p1-basis'), 'mini-squat', 'sling squat only from p2');
  assert.equal(r('sit-to-stand', ['office-chair', 'bed-edge'], 'p1-basis'), 'box-squat-bed-edge');
  assert.equal(r('hamstring-bridge-chair', ['office-chair']), 'hamstring-bridge-step');
  assert.equal(r('hamstring-bridge-chair', ['office-chair', 'sling-trainer']), 'sling-heel-bridge');
  assert.equal(r('thoracic-extension-chair', ['office-chair']), 'thoracic-extension-floor');
  assert.equal(r('seated-row', ['office-chair']), 'long-sit-row');
  assert.equal(r('quad-massage-stick', []), 'quad-self-massage');
  assert.equal(r('sit-to-stand', ['chair-fixed']), 'sit-to-stand', 'a fixed chair keeps the original');
});

test('migration v5.3: office chair for users who trained, seat notice, shoulder protection with old sync stamps; runs once', () => {
  const v52 = { settings: { ownedEquipment: ['rowing-machine'], equipmentModel: 2 }, state: { welcomeDone: true }, sessions: [{ id: 'a', status: 'done', exercises: [] }] };
  const m = migrateEquipment(v52);
  assert.equal(m.settings.equipmentModel, EQUIPMENT_MODEL);
  assert.deepEqual(m.settings.ownedEquipment, ['office-chair', 'rowing-machine']);
  assert.ok(!m.settings.ownedEquipment.includes('chair-fixed'), 'the old base chair is NOT taken over as fixed chair');
  assert.equal(m.settings._equipmentAt['office-chair'], MIGRATION_STAMP);
  assert.equal(m.state.seatNotice, 'pending');
  assert.equal(m.settings.shoulderImpingement, true);
  assert.equal(m.settings.shoulderMaxElevationDeg, 65);
  assert.equal(m.settings._updatedAt.shoulderImpingement, MIGRATION_STAMP);
  assert.equal(migrateEquipment(m), m, 'runs once');
  // an office chair the user unticked before (stamped) is not re-added; fresh installs get nothing
  const unticked = migrateEquipment({ ...v52, settings: { ...v52.settings, _equipmentAt: { 'office-chair': '2026-11-05T10:00:00.000Z' } } });
  assert.ok(!unticked.settings.ownedEquipment.includes('office-chair'));
  const fresh = migrateEquipment({ settings: { equipmentModel: 2 }, state: {}, sessions: [] });
  assert.deepEqual(fresh.settings.ownedEquipment, []);
  assert.equal(fresh.state.seatNotice, undefined);
  assert.equal(fresh.settings.shoulderImpingement, undefined);
  // store defaults
  const d = store.defaults();
  assert.equal(d.settings.shoulderImpingement, false);
  assert.equal(d.settings.shoulderMaxElevationDeg, 65);
  assert.equal(d.state.seatNotice, null);
});

test('sync: the shoulder setting and the seat notice merge per key (last write wins), office chair per id', () => {
  const base = store.defaults();
  const local = { ...base, settings: { ...base.settings, shoulderImpingement: true, _updatedAt: { shoulderImpingement: MIGRATION_STAMP }, ownedEquipment: ['office-chair'], _equipmentAt: { 'office-chair': MIGRATION_STAMP } }, state: { ...base.state, seatNotice: 'pending', _updatedAt: { seatNotice: MIGRATION_STAMP } } };
  const remote = { ...base, settings: { ...base.settings, shoulderImpingement: false, _updatedAt: { shoulderImpingement: '2026-11-10T09:00:00.000Z' }, ownedEquipment: [], _equipmentAt: { 'office-chair': '2026-11-10T09:00:00.000Z' } }, state: { ...base.state, seatNotice: 'seen', _updatedAt: { seatNotice: '2026-11-10T09:00:00.000Z' } } };
  const m = mergeSync(local, remote, { now: Date.parse('2026-11-11T10:00:00Z') });
  assert.equal(m.settings.shoulderImpingement, false, 'the real (newer) change beats the migration stamp');
  assert.deepEqual(m.settings.ownedEquipment, []);
  assert.equal(m.state.seatNotice, 'seen');
  // store.update stamps the new keys
  const before = store.defaults();
  const after = structuredClone(before);
  after.settings.shoulderImpingement = true;
  after.state.seatNotice = 'seen';
  store.trackChanges(before, after, '2026-11-11T10:00:00.000Z');
  assert.equal(after.settings._updatedAt.shoulderImpingement, '2026-11-11T10:00:00.000Z');
  assert.equal(after.state._updatedAt.seatNotice, '2026-11-11T10:00:00.000Z');
});

// ---------------------------------------------------------------------------- the user's plans across all phases
test("user's equipment set: no unsafe chair exercise, no overhead exercise, blocks balanced, budgets hold (all phases)", () => {
  const lim = shoulderLimit(USER_S);
  for (const levels of [{}, maxLevels]) {
    for (const { w, plan, st, rowWarmup } of plansOf(USER_S, levels)) {
      const tag = `${w.id}${rowWarmup ? '+row' : ''}${levels === maxLevels ? ' (max)' : ''}`;
      for (const e of plan.exercises) {
        const x = ex(e.exerciseId);
        assert.ok(!x.equipment.includes('chair-fixed'), `${tag}: unsafe on wheels: ${x.id}`);
        assert.ok(hasEquipment(x, USER_S), `${tag}: missing equipment ${x.id}`);
        assert.ok(x.archeryDraw || x.block === 'cardio' || elevationOf(x, e.level) <= lim, `${tag}: ${x.id} over the shoulder limit`);
        if (st.phaseId === 'p4-entlastung') assert.notEqual(x.postOpAllowed, false, `${tag}: ${x.id} after surgery`);
      }
      const n = (sec) => plan.exercises.filter((e) => e.section === sec).length;
      if (w.kind === 'strength') {
        assert.ok(n('knee') >= 4, `${tag}: knee block ${n('knee')}`);
        assert.ok(n('archery') >= 4, `${tag}: archery block ${n('archery')}`);
      }
      if (w.kind === 'short') assert.ok(n('knee') >= 2 && n('archery') >= 3, `${tag}: short blocks`);
      assert.ok(estimateWorkoutMinutes(plan, content, st, USER_S) <= plan.budgetMin, `${tag}: ${estimateWorkoutMinutes(plan, content, st, USER_S)} > ${plan.budgetMin}`);
    }
  }
});

test('p4 (post-op): seated items on the office chair, nothing that pushes up from the seat or loads the left leg', () => {
  for (const { w, plan } of plansOf(USER_S).filter((p) => p.phaseId === 'p4-entlastung')) {
    const ids = plan.exercises.map((e) => e.exerciseId);
    for (const id of ['seated-press-up', 'sit-to-stand', 'chair-dip', 'right-leg-sit-to-stand', 'calf-raise', 'single-leg-stance', 'mini-squat', 'step-up']) assert.ok(!ids.includes(id), `${w.id}: ${id}`);
    if (ids.includes('band-triceps-extension')) assert.match(ex('band-triceps-extension').postOpNote, /Sitzen/);
  }
});

test('shoulder protection: every strength and short workout has rotator cuff + scapula work; off = unchanged plans', () => {
  for (const { w, plan, rowWarmup } of plansOf(USER_S)) {
    if (w.kind === 'relief') continue;
    const xs = plan.exercises.map((e) => ex(e.exerciseId));
    assert.ok(xs.some((x) => hasFocus(x, 'rc')), `${w.id}${rowWarmup ? '+row' : ''}: rotator cuff`);
    assert.ok(xs.some((x) => hasFocus(x, 'scapula')), `${w.id}${rowWarmup ? '+row' : ''}: scapula`);
  }
  // without the protection no shoulderOnly items and the original overhead exercises stay
  const st = stateIn('p1-basis');
  const off = buildSessionPlan(getWorkout('p1-b', content, st), st, content, { settings: settingsWith(['chair-fixed']), rowWarmup: false });
  const offIds = off.exercises.map((e) => e.exerciseId);
  assert.ok(offIds.includes('wall-slide') && offIds.includes('dead-bug') && !offIds.includes('er-towel'));
  const on = buildSessionPlan(getWorkout('p1-b', content, st), st, content, { settings: settingsWith(['chair-fixed'], { shoulderImpingement: true }), rowWarmup: false });
  const e = on.exercises.find((x) => x.fallbackFrom === 'wall-slide');
  assert.equal(e.exerciseId, 'wall-push-up-plus');
  // the archery draw exercises stay (exception), with the hint
  for (const id of ['band-draw-hold', 'mirror-draw', 'push-pull-iso', 'expansion-drill', 'endurance-series']) {
    assert.equal(ex(id).archeryDraw, true, id);
    assert.ok(shoulderOk(ex(id), 0, USER_S), id);
  }
  assert.equal(shoulderOk(ex('wall-slide'), 0, USER_NO_SHOULDER), true, 'protection off → everything allowed');
  // replacements named by the user/orthopaedist exist and are below the limit
  for (const id of ['scapula-setting', 'prone-low-row', 'serratus-punch-low', 'wall-push-up-plus', 'low-row-band', 'pull-apart-low', 'low-face-pull',
    'er-iso-door', 'ir-iso-door', 'er-towel', 'sidelying-er', 'ir-band']) assert.ok(shoulderOk(ex(id), 0, USER_S), id);
  // custom workouts warn
  const cw = { name: 'Mix', warmup: [], blocks: [{ id: 'archery', items: [{ exerciseId: 'face-pull' }] }], cooldown: [] };
  const v = validateCustomWorkout(cw, content, stateIn('p2-aufbau'), USER_S);
  assert.ok(v.warnings.some((x) => /Schulter-Schutz.*Low Face Pull/.test(x)), v.warnings.join(' | '));
});

test('shoulder metadata: every exercise has shoulderElevationDeg; figure poses with arms > 85° are flagged (except draw/rowing)', () => {
  const elev = (p) => {
    const Q = computePoints(p);
    const ax = { x: Q.hip.x - Q.neck.x, y: Q.hip.y - Q.neck.y };
    let m = 0;
    for (const s of ['L', 'R']) {
      const v = { x: Q[`elbow${s}`].x - Q[`shoulder${s}`].x, y: Q[`elbow${s}`].y - Q[`shoulder${s}`].y };
      const c = (v.x * ax.x + v.y * ax.y) / Math.hypot(v.x, v.y) / Math.hypot(ax.x, ax.y);
      m = Math.max(m, Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
    }
    return m;
  };
  for (const e of content.exercises) {
    assert.ok(Number.isFinite(e.shoulderElevationDeg), `${e.id}: shoulderElevationDeg`);
    if (e.archeryDraw || e.block === 'cardio') continue;
    const m = Math.max(...e.figure.poses.map((id) => elev(poses[id])));
    // stick figures are approximate: ±20° tolerance; above that the exercise must be marked over the limit
    if (m > 85) assert.ok(e.shoulderElevationDeg > 65, `${e.id}: figure shows ${Math.round(m)}° but metadata ${e.shoulderElevationDeg}°`);
  }
});

// ---------------------------------------------------------------------------- knee relief
test('knee relief: one per phase, 3–5 min, startable any day, not counted for the weekly goal, small XP, no next-day check', () => {
  for (const p of content.phases) {
    const w = phaseWorkouts(p, content.workouts).relief;
    assert.ok(w && w.kind === 'relief' && w.name === 'Knie-Entlastung (3–5 Min.)', p.id);
    const st = stateIn(p.id);
    const plan = buildSessionPlan(w, st, content, { settings: USER_S });
    const min = estimateWorkoutMinutes(plan, content, st, USER_S);
    assert.ok(min >= 3 && min <= 5, `${w.id}: ${min} min`);
    assert.ok(plan.exercises.some((e) => e.exerciseId === 'patella-mobilization'), w.id);
    assert.ok(plan.exercises.some((e) => /massage/.test(e.exerciseId)), w.id);
    assert.match(w.description, /ersetzt keine Behandlung/i);
  }
  const relief = { id: 'r', kind: 'relief', status: 'done', startedAt: '2026-11-11T08:00:00.000Z', endedAt: '2026-11-11T08:05:00.000Z', exercises: [{ exerciseId: 'patella-mobilization', sets: [{ done: true }] }] };
  const strength = { id: 's', kind: 'strength', status: 'done', startedAt: '2026-11-10T08:00:00.000Z', endedAt: '2026-11-10T08:30:00.000Z', exercises: [] };
  assert.equal(weeklyProgress([relief, strength], 3, '2026-11-11').done, 1);
  assert.equal(streak([relief], 1, '2026-11-11').currentWeekCount, 0);
  assert.equal(xpFor(relief, {}), XP.relief);
  assert.ok(XP.relief < XP.sessionBonus);
  assert.equal(pendingNextDay([relief], new Date('2026-11-12T12:00:00Z')), null);
  // relief items are in the plan ids (library filter „Im Plan“)
  assert.ok(phasePlanExerciseIds(stateIn('p1-basis'), content, USER_S).has('quad-massage-stick'));
});

test('knee relief content: honest notes, patella mobilisation p1–p3 + p4 with physio variation, safe quad lengthening', () => {
  const pm = ex('patella-mobilization');
  assert.equal(pm.phaseMin, 'p1-basis');
  assert.match(pm.instructions.join(' '), /nach unten/);
  assert.match(pm.instructions.join(' '), /Oberschenkel leicht anspannen bzw\. das Bein ein kleines Stück anheben/);
  assert.match(pm.kneeNote, /ersetzt keine Behandlung/);
  const qm = ex('quad-massage-stick');
  assert.deepEqual(qm.equipment, ['massage-stick', 'mat']);
  assert.match(qm.instructions.join(' '), /NIE direkt über die Kniescheibe/);
  assert.ok(qm.figure.props.includes('stick'));
  const pq = ex('prone-quad-lengthening-band');
  assert.match(pq.kneeNote, /60–70°/);
  assert.ok(poses['prone-quad-band-b'].kneeL <= 70);
  for (const id of ['patella-mobilization', 'quad-massage-stick', 'quad-self-massage', 'prone-quad-lengthening-band', 'knee-pendulum']) assert.ok(ex(id).cueWords, `${id}: voice cue words`);
  // p1–p3 strength warm-ups start with a short patella mobilisation
  for (const w of content.workouts.filter((x) => x.kind === 'strength' && x.phaseId !== 'p4-entlastung')) {
    assert.ok(w.warmup.some((it) => it.exerciseId === 'patella-mobilization' && it.override?.seconds > 0), w.id);
  }
});

// ---------------------------------------------------------------------------- session CTA & rowing card
test('ctaState: Satz starten → Anhalten → Weiter → Pause überspringen → Nächste Übung → Zum Abschluss; reps „Satz fertig“', () => {
  const t = (f) => H.ctaState(f);
  assert.deepEqual(t({ timerLed: true, timerState: 'idle', hasNext: true }), { key: 'start', label: 'Satz starten' });
  assert.deepEqual(t({ timerLed: true, timerState: 'running', hasNext: true }), { key: 'pause', label: 'Anhalten' });
  assert.deepEqual(t({ timerLed: true, timerState: 'paused', hasNext: true }), { key: 'resume', label: 'Weiter' });
  assert.deepEqual(t({ timerLed: true, timerState: 'done', resting: true, hasNext: true }), { key: 'skip-rest', label: 'Pause überspringen' });
  assert.deepEqual(t({ timerLed: true, allDone: true, hasNext: true }), { key: 'next', label: 'Nächste Übung' });
  assert.deepEqual(t({ allDone: true, hasNext: false }), { key: 'finish', label: 'Zum Abschluss' });
  assert.deepEqual(t({ timerLed: false, hasNext: true }), { key: 'set-done', label: 'Satz fertig' });
  assert.deepEqual(t({ timerLed: false, resting: true }), { key: 'skip-rest', label: 'Pause überspringen' });
  assert.equal(t({ rowEntry: true, rowDone: false, hasNext: true }).label, 'Gerudert ✓');
  assert.equal(t({ rowEntry: true, rowDone: true, hasNext: true }).label, 'Weiter');
  // never „next“ while sets are open (the big button cannot skip an exercise)
  for (const timerState of ['idle', 'running', 'paused', 'done']) {
    for (const resting of [false, true]) assert.ok(!['next', 'finish'].includes(t({ timerLed: true, timerState, resting, allDone: false, hasNext: true }).key));
  }
});

test('rowing card (no timer): goal texts, minutes stored in the same fields as before', () => {
  assert.equal(H.rowingBrief({ level: 0 }, ex('row-warmup-10')).title, '10 Min. locker rudern, Schlagzahl 18–22');
  assert.match(H.rowingBrief({ level: 0 }, ex('row-warmup-10')).detail.join(' '), /2 Min\. Technik: Nur Arme → .* dann 8 Min\. locker/);
  const iv = H.rowingBrief({ level: 0 }, ex('row-intervals'));
  assert.match(iv.title, /^6 × \(1 Min\. zügig \/ 1 Min\. locker\), Schlagzahl 22–26$/);
  assert.equal(H.rowingBrief({ level: 0 }, ex('row-steady')).title, '12 Min. gleichmäßig rudern, Schlagzahl 18–22');
  const s = { exercises: [{ exerciseId: 'row-warmup-10', section: 'cardio', level: 0, sets: [] }, { exerciseId: 'quad-set', section: 'knee', level: 0, sets: [] }] };
  H.applyRowedDuration(s, [0], 660, content);
  assert.equal(s.exercises[0].sets.reduce((a, x) => a + (x.seconds || 0), 0), 660);
  assert.equal(s.exercises[1].sets.length, 0, 'other entries untouched');
  const c = { exercises: [{ exerciseId: 'row-technique-warmup', section: 'warmup', level: 0, sets: [] }, { exerciseId: 'row-intervals', section: 'cardio', level: 0, plannedSets: 6, sets: [] }, { exerciseId: 'row-cooldown', section: 'cooldown', level: 0, sets: [] }] };
  H.applyRowedDuration(c, [0, 1, 2], 0, content);
  assert.ok(c.exercises.every((e) => e.skipped), '0 minutes → skipped');
});
