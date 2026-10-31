// WP-Session-flow: pure helpers of js/views/session-helpers.js (no DOM).
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
const fresh = () => defaults();
const NOW = new Date('2026-10-31T16:00:00Z');
const PRE = { pain: 1, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false };

/** Plan + complete every planned set with given pain/rpe. */
function playSession(data, { pain = 1, rpe = 5, post = { pain: 1, swelling: 0, rpe: 6, note: '' }, now = NOW } = {}) {
  const w = content.workouts.find((x) => x.id === data.state.nextWorkoutId);
  const s = buildSessionPlan(w, data.state, content, { history: data.sessions, now: new Date(now.getTime() - 40 * 60e3) });
  s.pre = { ...PRE };
  for (const e of s.exercises) {
    const dose = H.doseFor(e, ex(e.exerciseId));
    for (let i = 0; i < dose.sets; i++) H.markSet(e, i, H.setValues(dose), now.toISOString());
    if (e.section === 'knee') e.painDuring = pain;
    if (e.section === 'archery') e.rpe = rpe;
  }
  s.post = post;
  return H.finishSession(data, s, content, { now });
}

test('doseFor applies level, plannedSets and overrides', () => {
  const qs = ex('quad-set');
  const d = H.doseFor({ exerciseId: 'quad-set', level: 0, plannedSets: 1 }, qs);
  assert.equal(d.type, 'hold');
  assert.equal(d.sets, 1);
  assert.equal(d.reps, qs.levels[0].reps);
  assert.equal(d.hold, qs.levels[0].hold);
  const o = H.doseFor({ exerciseId: 'tke', level: 0, override: { reps: 15, band: 'green' } }, ex('tke'));
  assert.equal(o.reps, 15);
  assert.equal(o.band, 'green');
  assert.equal(o.perSide, true);
  assert.deepEqual(H.setValues(H.doseFor({ level: 0 }, ex('breathing-reset'))), { seconds: 120, band: null });
});

test('doseFor: settings.restDefault overrides level rest, null falls back', () => {
  const tke = ex('tke');
  const lvlRest = tke.levels[0].rest ?? 30;
  assert.equal(H.doseFor({ level: 0 }, tke, { restDefault: null }).rest, lvlRest);
  assert.equal(H.doseFor({ level: 0 }, tke, {}).rest, lvlRest);
  assert.equal(H.doseFor({ level: 0 }, tke, { restDefault: 90 }).rest, 90);
  assert.equal(H.doseFor({ level: 0 }, { levels: [{ sets: 1, rest: 0 }] }, { restDefault: 90 }).rest, 0);
});

test('markSet / unmarkSet / nextOpenSet / setXp', () => {
  const e = { sets: [], painDuring: null, sharpPain: false };
  H.markSet(e, 1, { reps: 10 }, 'T');
  assert.deepEqual(e.sets, [{ done: false }, { done: true, reps: 10, at: 'T' }]);
  assert.equal(H.nextOpenSet(e, 3), 0);
  assert.equal(H.doneCount(e), 1);
  H.unmarkSet(e, 1);
  assert.equal(e.sets.length, 0);
  assert.equal(H.setXp(e, {}), 3);
  assert.equal(H.setXp({ ...e, painDuring: 4 }, {}), 2);
});

test('assessPreCheck: stop, red, yellow, green', () => {
  assert.equal(H.assessPreCheck(PRE, {}, []).light, 'green');
  assert.equal(H.assessPreCheck(PRE, {}, []).showCard, false);
  const lock = H.assessPreCheck({ ...PRE, mechanical: { locking: true, givingWay: false } }, {}, []);
  assert.equal(lock.light, 'stop');
  assert.ok(lock.consult && lock.showCard);
  assert.equal(H.assessPreCheck({ ...PRE, nightPain: true }, {}, []).light, 'stop');
  assert.equal(H.assessPreCheck({ ...PRE, pain: 7 }, {}, []).light, 'red');
  assert.equal(H.assessPreCheck({ ...PRE, swelling: 2 }, {}, []).light, 'red');
  assert.equal(H.assessPreCheck({ ...PRE, pain: 4 }, {}, []).light, 'yellow');
  const reds = [{ status: 'done', traffic: { provisional: 'red', final: 'red' } }, { status: 'done', traffic: { provisional: 'red', final: 'red' } }];
  assert.equal(H.assessPreCheck(PRE, {}, reds).light, 'stop');
  assert.equal(H.assessPreCheck(PRE, {}, reds.slice(1)).light, 'red');
});

test('upper-body-only and lighter variants', () => {
  const data = fresh();
  data.state.exerciseLevels = { 'quad-set': 1 };
  const w = content.workouts.find((x) => x.id === 'p1-a');
  const s = buildSessionPlan(w, data.state, content, {});
  H.applyUpperBodyOnly(s, content);
  assert.ok(s.exercises.filter((e) => e.section === 'knee').every((e) => e.skipped && !H.isVisible(e)));
  assert.ok(s.exercises.filter((e) => e.section === 'archery').every((e) => H.isVisible(e)));
  assert.equal(s.exercises[H.firstIndex(s)].section, 'warmup');
  const s2 = buildSessionPlan(w, data.state, content, {});
  H.applyLighterVariants(s2, content);
  const qs = s2.exercises.find((e) => e.exerciseId === 'quad-set');
  assert.equal(qs.level, 0);
  assert.equal(qs.plannedSets, ex('quad-set').levels[0].sets);
  const tke = s2.exercises.find((e) => e.exerciseId === 'tke');
  assert.equal(tke.plannedSets, Math.max(1, Math.round(ex('tke').levels[0].sets * 0.6)));
});

test('navigation helpers skip pre-check-hidden entries', () => {
  const s = { exercises: [{ section: 'warmup' }, { section: 'knee', skipped: true, skipReason: 'precheck' }, { section: 'archery' }] };
  assert.equal(H.nextIndex(s, 0), 2);
  assert.equal(H.prevIndex(s, 2), 0);
  assert.equal(H.nextIndex(s, 2), -1);
  assert.deepEqual(H.positionOf(s, 2), { pos: 2, total: 2, secPos: 1, secTotal: 1 });
});

test('finishSession: stores session, advances rotation, XP, badges, records, reminder', () => {
  const { data, session } = playSession(fresh());
  assert.equal(data.sessions.length, 1);
  assert.equal(data.state.activeSession, null);
  assert.equal(data.state.nextWorkoutId, 'p1-b');
  assert.equal(session.status, 'done');
  assert.equal(session.traffic.provisional, 'green');
  assert.equal(session.cursor, undefined);
  assert.ok(session.xpEarned > 50);
  assert.equal(session.score.points, session.score.max);
  assert.ok(data.state.badges['first-session']);
  assert.equal(data.state.xp, session.xpEarned + 15 * Object.keys(data.state.badges).length);
  assert.deepEqual(session.celebration.badges, Object.keys(data.state.badges));
  assert.ok(session.celebration.records.length >= 1);
  assert.equal(data.state.nextDayReminder.sessionId, session.id);
  assert.ok(session.recommendations.every((r) => r.status === 'pending'));
});

test('finishSession: painful session is red and suggests regress', () => {
  const data = fresh();
  data.state.exerciseLevels = { 'quad-set': 1 };
  const { session } = playSession(data, { pain: 7 });
  assert.equal(session.traffic.provisional, 'red');
  const vis = H.visibleRecommendations(session);
  assert.ok(vis.some(({ rec }) => rec.exerciseId === 'quad-set' && rec.action === 'regress' && rec.toLevel === 0));
  assert.ok(vis.every(({ rec }) => rec.action !== 'hold'));
});

test('pendingNextDay: due after 12 h or next calendar day, not twice', () => {
  const { data, session } = playSession(fresh());
  const end = new Date(session.endedAt);
  assert.equal(H.pendingNextDay(data.sessions, new Date(end.getTime() + 3600e3)).due, false);
  assert.equal(H.pendingNextDay(data.sessions, new Date(end.getTime() + 13 * 3600e3)).due, true);
  assert.equal(H.nextDayBannerVisible(data.sessions, new Date(end.getTime() + 13 * 3600e3)), true);
  assert.equal(H.pendingNextDay(data.sessions, new Date(end.getTime() + 5 * 86400e3)), null);
  const dueAt = Date.parse(H.nextDayDueAt('2026-10-31T22:30:00'));
  assert.ok(dueAt <= Date.parse('2026-11-01T00:00:00'));
});

test('applyNextDay: final light, +10 XP, merged recommendations', () => {
  const { data, session } = playSession(fresh());
  const later = new Date(Date.parse(session.endedAt) + 20 * 3600e3);
  const ok = H.applyNextDay(data, session.id, { pain: 1, swelling: 0, stiffness: 0, nightPain: false, locking: false, givingWay: false }, content, { now: later });
  assert.equal(ok.result.traffic, 'green');
  assert.equal(ok.data.state.xp, data.state.xp + 10 + 15 * ok.badges.length);
  assert.equal(ok.data.sessions[0].traffic.final, 'green');
  assert.equal(ok.data.state.nextDayReminder, null);
  assert.equal(H.pendingNextDay(ok.data.sessions, later), null);

  const bad = H.applyNextDay(data, session.id, { pain: 5, swelling: 1, stiffness: 2, nightPain: false, locking: false, givingWay: false }, content, { now: later });
  assert.equal(bad.result.traffic, 'red');
  assert.equal(bad.data.sessions[0].traffic.provisional, 'green');
  const locked = H.applyNextDay(data, session.id, { pain: 1, swelling: 0, stiffness: 0, nightPain: false, locking: true, givingWay: false }, content, { now: later });
  assert.equal(locked.result.traffic, 'stop');
  assert.equal(H.visibleRecommendations(locked.session)[0].rec.action, 'consult');
});

test('decideRecommendation applies level only on accept', () => {
  const data = fresh();
  data.state.exerciseLevels = { 'quad-set': 1 };
  const r = playSession(data, { pain: 7 });
  const { index, rec } = H.visibleRecommendations(r.session).find((x) => x.rec.exerciseId === 'quad-set');
  const acc = H.decideRecommendation(r.data, r.session.id, index, true);
  assert.equal(acc.state.exerciseLevels['quad-set'], rec.toLevel);
  assert.equal(acc.sessions[0].recommendations[index].status, 'accepted');
  const dis = H.decideRecommendation(r.data, r.session.id, index, false);
  assert.equal(dis.state.exerciseLevels['quad-set'], 1);
  assert.equal(dis.sessions[0].recommendations[index].status, 'dismissed');
  // decided twice → unchanged
  assert.deepEqual(H.decideRecommendation(acc, r.session.id, index, false).sessions[0].recommendations[index].status, 'accepted');
  assert.match(String(H.recCardsHtml(r.session, content)), /data-act="rec-accept"/);
});

test('durationSec subtracts pauses; setTotals / hold seconds', () => {
  const s = { startedAt: '2026-10-31T10:00:00Z', endedAt: '2026-10-31T10:40:00Z', pausedMs: 10 * 60e3,
    exercises: [{ plannedSets: 2, sets: [{ done: true, reps: 10, hold: 5 }, { done: false }] }, { plannedSets: 1, skipped: true, skipReason: 'precheck', sets: [] }] };
  assert.equal(H.durationSec(s), 30 * 60);
  assert.deepEqual(H.setTotals(s), { done: 1, planned: 2 });
  assert.equal(H.sessionHoldSeconds(s), 50);
});
