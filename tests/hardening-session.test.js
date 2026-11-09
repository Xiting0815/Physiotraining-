// Hardening (session flow): pure helpers for dose labels, resume/dead time, broken sessions,
// one next-day check per training day, „Wie eben“ pain. Browser scenarios: tests/hardening-session-e2e.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSessionPlan } from '../js/logic/progression.js';
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
const PRE = { pain: 1, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false };
const ND = { pain: 1, swelling: 0, stiffness: 0, nightPain: false, locking: false, givingWay: false };

function play(data, workoutId, start, minutes = 30) {
  const w = content.workouts.find((x) => x.id === workoutId);
  const s = buildSessionPlan(w, data.state, content, { history: data.sessions, now: start });
  s.startedAt = start.toISOString();
  s.pre = { ...PRE };
  const end = new Date(start.getTime() + minutes * 60e3);
  for (const e of s.exercises) {
    const dose = H.doseFor(e, ex(e.exerciseId));
    for (let i = 0; i < dose.sets; i++) H.markSet(e, i, H.setValues(dose), end.toISOString());
    if (e.section === 'knee' || e.section === 'cardio') e.painDuring = 1;
    if (e.section === 'archery') e.rpe = 5;
  }
  s.post = { pain: 1, swelling: 0, rpe: 6, note: '' };
  return H.finishSession(data, s, content, { now: end });
}

test('doseLabel: rebuilt from the effective (capped) sets, unchanged otherwise', () => {
  const e = ex('single-leg-stance');
  const entry = { exerciseId: e.id, level: 0, plannedSets: 2 };
  const dose = H.doseFor(entry, e);
  assert.equal(dose.sets, 2);
  assert.equal(H.doseLabel(entry, e, dose), 'Augen offen · 2 × 30 s');
  const full = { exerciseId: e.id, level: 0, plannedSets: 3 };
  assert.equal(H.doseLabel(full, e, H.doseFor(full, e)), 'Augen offen · 3 × 30 s');
  const over = { exerciseId: e.id, level: 0, plannedSets: 3, override: { hold: 40 } };
  assert.equal(H.doseLabel(over, e, H.doseFor(over, e)), 'Augen offen · 3 × 40 s');
  // reps with hold and a band prefix
  assert.equal(H.doseText({ type: 'reps', sets: 2, reps: 10, hold: 3 }), '2 × 10, 3 s halten');
  assert.equal(H.doseText({ type: 'hold', sets: 1, reps: 1, hold: 30, perSide: true }), '30 s je Seite');
  assert.equal(H.doseText({ type: 'timed', sets: 1, seconds: 120 }), '2 min');
  // every level label of every exercise survives a set change without losing its prefix
  for (const x of content.exercises) {
    x.levels.forEach((l, level) => {
      const en = { exerciseId: x.id, level, plannedSets: Math.max(1, (l.sets ?? 1) - 1) };
      const d = H.doseFor(en, x);
      const lab = H.doseLabel(en, x, d);
      assert.ok(typeof lab === 'string' && lab.length > 0, `${x.id} ${level}`);
      if (d.sets !== (l.sets ?? 1) && /\d\s*×/.test(l.label || '') && x.type !== 'timed') assert.ok(lab.includes(`${d.sets} ×`) || d.sets === 1, `${x.id}: ${lab}`);
    });
  }
});

test('resumeInfo/applyResume: dead time after a kill is excluded via lastActiveAt', () => {
  const t0 = Date.parse('2026-11-09T08:00:00Z');
  const s = {
    startedAt: new Date(t0).toISOString(), pausedMs: 0, lastActiveAt: new Date(t0 + 10 * 60e3).toISOString(),
    exercises: [{ exerciseId: 'quad-set', sets: [{ done: true, at: new Date(t0 + 9 * 60e3).toISOString() }] }],
  };
  const now = t0 + 3 * 3600e3 + 10 * 60e3; // killed, reopened 3 h later
  const info = H.resumeInfo(s, now);
  assert.equal(info.stopMs, t0 + 10 * 60e3);
  assert.equal(info.gapMs, 3 * 3600e3);
  assert.equal(info.stale, false);
  H.applyResume(s, now);
  assert.equal(s.pausedMs, 3 * 3600e3);
  // active time = 10 min, not 3 h 10 min
  assert.equal(H.durationSec({ ...s, endedAt: new Date(now).toISOString() }), 600);
  // pausedAt wins over the heartbeat
  const p = { startedAt: new Date(t0).toISOString(), pausedAt: new Date(t0 + 5 * 60e3).toISOString(), lastActiveAt: new Date(t0 + 6 * 60e3).toISOString(), exercises: [] };
  assert.equal(H.resumeInfo(p, now).stopMs, t0 + 5 * 60e3);
  // old sessions without heartbeat: newest set tick
  const old = { startedAt: new Date(t0).toISOString(), exercises: [{ exerciseId: 'x', sets: [{ done: true, at: new Date(t0 + 20 * 60e3).toISOString() }] }] };
  assert.equal(H.lastActiveMs(old), t0 + 20 * 60e3);
  assert.equal(H.resumeInfo(old, t0 + 13 * 3600e3 + 20 * 60e3).stale, true);
});

test('applyResume: a running rowing timer does not count the dead time', () => {
  const t0 = Date.parse('2026-11-09T08:00:00Z');
  const s = {
    startedAt: new Date(t0).toISOString(), pausedMs: 0, lastActiveAt: new Date(t0 + 5 * 60e3).toISOString(), exercises: [],
    rowTimer: { idx: 0, accMs: 0, runAt: t0 + 60e3, log: [], done: false },
  };
  H.applyResume(s, t0 + 3 * 3600e3);
  assert.equal(s.rowTimer.runAt, null);
  assert.equal(s.rowTimer.accMs, 4 * 60e3); // rowed 1:00 → 5:00, then killed
});

test('validActiveSession: rejects broken shapes', () => {
  const ok = { startedAt: '2026-11-09T08:00:00Z', exercises: [{ exerciseId: 'quad-set' }], cursor: { index: 0, step: 'exercise' } };
  assert.equal(H.validActiveSession(ok, content), true);
  assert.equal(H.validActiveSession(null, content), false);
  assert.equal(H.validActiveSession({ ...ok, exercises: [] }, content), false);
  assert.equal(H.validActiveSession({ ...ok, startedAt: 'gestern' }, content), false);
  assert.equal(H.validActiveSession({ ...ok, exercises: [{ exerciseId: 'gibt-es-nicht' }] }, content), false);
  assert.equal(H.validActiveSession({ ...ok, exercises: [null] }, content), false);
  assert.equal(H.validActiveSession({ ...ok, cursor: 'x' }, content), false);
});

test('pendingNextDay covers every session of the latest training day (strength + rowing)', () => {
  let data = defaults();
  data.state.phaseId = 'p1-basis';
  data.settings.ownedEquipment = ['rowing-machine'];
  const day = new Date('2026-11-07T09:00:00');
  const r1 = play(data, 'p1-a', day);
  data = r1.data;
  const rowW = content.workouts.find((w) => w.kind === 'cardio' && (w.phaseId === 'p1-basis' || !w.phaseId)) || content.workouts.find((w) => w.kind === 'cardio');
  const r2 = play(data, rowW.id, new Date('2026-11-07T17:00:00'), 20);
  data = r2.data;
  const now = new Date('2026-11-08T09:00:00');
  const p = H.pendingNextDay(data.sessions, now);
  assert.equal(p.sessions.length, 2);
  assert.equal(p.session.id, r2.session.id);
  assert.equal(p.due, true);
  const out = H.applyNextDayGroup(data, p.sessions.map((s) => s.id), ND, content, { now });
  assert.equal(out.sessions.length, 2);
  assert.ok(out.data.sessions.every((s) => s.nextDay && s.traffic.final));
  assert.equal(out.data.state.xp, data.state.xp + 10 + 15 * out.badges.length, 'check-in XP only once');
  assert.equal(H.pendingNextDay(out.data.sessions, now), null);
  // legacy data: rowing already checked, strength not → still offered
  const legacy = structuredClone(data);
  legacy.sessions.find((s) => s.id === r2.session.id).nextDay = { ...ND, at: now.toISOString() };
  const lp = H.pendingNextDay(legacy.sessions, now);
  assert.deepEqual(lp.sessions.map((s) => s.id), [r1.session.id]);
});

test('prevKneePain: last knee pain of the session for „Wie eben“', () => {
  const s = { exercises: [
    { exerciseId: 'quad-set', section: 'knee', painDuring: 2 },
    { exerciseId: 'band-pull-apart', section: 'archery', painDuring: null },
    { exerciseId: 'straight-leg-raise', section: 'knee', painDuring: null },
  ] };
  assert.equal(H.prevKneePain(s, 2, content), 2);
  assert.equal(H.prevKneePain(s, 0, content), null);
});
