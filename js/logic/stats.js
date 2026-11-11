// Statistics. PURE. See docs/SPEC.md §7.7.
// Weeks are ISO weeks (Monday-based) in LOCAL time; a session belongs to the local day of
// its `startedAt` (fallback `endedAt`, then `date`) – v5.1: a session crossing midnight stays on its start day. Week keys use `startOfIsoWeek` (Monday "YYYY-MM-DD"),
// which is DST-safe because it works on calendar dates, not on 7×24 h offsets.
import { addDays, isoWeekKey, startOfIsoWeek, toISODate, todayISO } from '../util/date.js';

/** @typedef {import('../types.js').Session} Session */
/** @typedef {{x: string, y: number}} Point */

const LIGHT_ORDER = ['green', 'yellow', 'red', 'stop'];

/** Local "YYYY-MM-DD" of a session (start day). @param {Session} s */
export function dayOf(s) {
  for (const v of [s?.startedAt, s?.endedAt, s?.date]) {
    if (typeof v !== 'string' || !v) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // plain local day
    const t = Date.parse(v);
    if (Number.isFinite(t)) return toISODate(new Date(t));
  }
  return toISODate(new Date(NaN));
}

/** Only completed sessions count for statistics. @param {Session[]} sessions */
export const doneSessions = (sessions) => (Array.isArray(sessions) ? sessions : []).filter((s) => s && s.status === 'done');

/** Final light if known, else provisional, else null. @param {Session} s */
export function sessionLight(s) {
  return s?.traffic?.final ?? s?.traffic?.provisional ?? null;
}

/** @param {(string|null)[]} lights @returns {string|null} worst light, null if none given */
function worstOf(lights) {
  let best = -1;
  for (const l of lights) best = Math.max(best, LIGHT_ORDER.indexOf(l ?? ''));
  return best < 0 ? null : LIGHT_ORDER[best];
}

/**
 * v2: rowing/cardio session? `kind === "cardio"`; legacy sessions without `kind`: a `rowing` object.
 * v4: a strength session with the rowing warm-up (`warmupRowing`) is NOT a cardio session.
 * @param {Session} s
 */
export const isCardioSession = (s) => s?.kind === 'cardio' || (s?.kind == null && s?.rowing != null && typeof s.rowing === 'object');
/** v5.3: short knee relief routine (kind "relief") – neither strength goal nor rowing goal. */
export const isReliefSession = (s) => s?.kind === 'relief';
/** v5.3: counts for the weekly strength goal (strength, short, custom – not rowing, not relief). */
export const countsAsStrength = (s) => !isCardioSession(s) && !isReliefSession(s);

const posNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
/** Σ seconds of done sets of performed cardio entries (finisher or not). */
function timerSec(s, finisher) {
  let sum = 0;
  for (const e of s.exercises || []) {
    if (e?.section !== 'cardio' || e.skipped || !!e.finisher !== finisher) continue;
    for (const set of e.sets || []) if (set?.done && typeof set.seconds === 'number') sum += set.seconds;
  }
  return sum;
}

/**
 * v4 (SPEC §15.3/§15.6): seconds rowed INSIDE a strength session: rowing warm-up (`warmupRowing.durationSec`, else
 * the done timer seconds of the non-finisher `section: "cardio"` entries) + rowing finisher (`finisherRowing.durationSec`,
 * else the done timer seconds of the `finisher: true` entries). Cardio sessions → 0.
 * @param {Session} s
 */
export function inSessionRowingSec(s) {
  if (!s || isCardioSession(s)) return 0;
  const warm = posNum(s.warmupRowing?.durationSec) ? s.warmupRowing.durationSec : timerSec(s, false);
  const fin = posNum(s.finisherRowing?.durationSec) ? s.finisherRowing.durationSec : timerSec(s, true);
  return warm + fin;
}
/**
 * v4: the rowing parts of a strength session separately: `{warmupSec, finisherSec}` (same sources as
 * inSessionRowingSec). Cardio sessions → zeros.
 * @param {Session} s
 */
export function inSessionRowingParts(s) {
  if (!s || isCardioSession(s)) return { warmupSec: 0, finisherSec: 0 };
  return {
    warmupSec: posNum(s.warmupRowing?.durationSec) ? s.warmupRowing.durationSec : timerSec(s, false),
    finisherSec: posNum(s.finisherRowing?.durationSec) ? s.finisherRowing.durationSec : timerSec(s, true),
  };
}
/** Alias of inSessionRowingSec (name of the first v4 draft). */
export const warmupRowingSec = inSessionRowingSec;
/** Done strength-type sessions (strength, short, custom – everything except cardio). @param {Session[]} sessions */
export const strengthSessions = (sessions) => doneSessions(sessions).filter(countsAsStrength);
/** Done cardio (rowing) sessions. @param {Session[]} sessions */
export const cardioSessions = (sessions) => doneSessions(sessions).filter(isCardioSession);

/**
 * Map Monday-date → count of done sessions.
 * @param {Session[]} sessions
 * @param {(s: Session) => boolean} [filter] optional extra filter (e.g. `isCardioSession`)
 */
export function sessionsPerWeek(sessions, filter) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const s of doneSessions(sessions)) {
    if (filter && !filter(s)) continue;
    const wk = startOfIsoWeek(dayOf(s));
    m.set(wk, (m.get(wk) ?? 0) + 1);
  }
  return m;
}

/** Latest session day or today. @param {Session[]} sessions */
function defaultToday(sessions) {
  const done = doneSessions(sessions);
  if (!done.length) return todayISO();
  return done.map(dayOf).sort().at(-1);
}

/**
 * Consecutive ISO weeks meeting the goal, counting back from last week; the current week adds
 * +1 once its goal is met (a running week never breaks the streak).
 * @param {Session[]} sessions
 * @param {number} weeklyGoal
 * @param {string} today
 * @returns {{weeks: number, currentWeekCount: number}}
 */
export function streak(sessions, weeklyGoal, today, { cardio = false } = {}) {
  const goal = Math.max(1, Math.floor(weeklyGoal || 0) || 1);
  const perWeek = sessionsPerWeek(sessions, cardio ? isCardioSession : countsAsStrength);
  const cur = startOfIsoWeek(today);
  const currentWeekCount = perWeek.get(cur) ?? 0;
  let weeks = 0;
  let wk = addDays(cur, -7);
  while ((perWeek.get(wk) ?? 0) >= goal) {
    weeks += 1;
    wk = addDays(wk, -7);
  }
  if (currentWeekCount >= goal) weeks += 1;
  return { weeks, currentWeekCount };
}

/**
 * @param {Session[]} sessions
 * @param {number} weeklyGoal
 * @param {string} today
 * @returns {{done: number, goal: number, ratio: number}}
 */
export function weeklyProgress(sessions, weeklyGoal, today) {
  // v2: the strength goal counts strength/short/custom sessions; rowing has its own goal (cardioProgress).
  const done = sessionsPerWeek(sessions, countsAsStrength).get(startOfIsoWeek(today)) ?? 0;
  return { done, goal: weeklyGoal, ratio: weeklyGoal > 0 ? Math.min(1, done / weeklyGoal) : 0 };
}

/**
 * v2: rowing sessions this ISO week vs `settings.cardioGoalPerWeek` (default 3).
 * v4: `done`/`ratio` count only separate rowing (cardio) sessions; `minutes`/`distanceM` also include the rowing
 * warm-ups and finishers of strength sessions (`warmupMinutes`, `warmupCount` show that part separately).
 * @param {Session[]} sessions @param {number} cardioGoal @param {string} today
 * @returns {{done: number, goal: number, ratio: number, minutes: number, distanceM: number, warmupMinutes: number, warmupCount: number}}
 */
export function cardioProgress(sessions, cardioGoal, today) {
  const wk = startOfIsoWeek(today);
  const inWeek = doneSessions(sessions).filter((s) => startOfIsoWeek(dayOf(s)) === wk);
  const list = inWeek.filter(isCardioSession);
  const warm = inWeek.filter((s) => warmupRowingSec(s) > 0);
  const warmSec = warm.reduce((a, s) => a + warmupRowingSec(s), 0);
  const minutes = Math.round((list.reduce((a, s) => a + (s.rowing?.durationSec ?? 0), 0) + warmSec) / 60);
  const distanceM = list.reduce((a, s) => a + (s.rowing?.distanceM ?? 0), 0) + warm.reduce((a, s) => a + (s.warmupRowing?.distanceM ?? 0) + (s.finisherRowing?.distanceM ?? 0), 0);
  const goal = cardioGoal ?? 3;
  return { done: list.length, goal, ratio: goal > 0 ? Math.min(1, list.length / goal) : 0, minutes, distanceM, warmupMinutes: Math.round(warmSec / 60), warmupCount: warm.length };
}

/**
 * v2: same-day load hint – rowing and strength on the same day give the knee less recovery.
 * @param {Session[]} sessions
 * @param {string} today
 * @param {'strength'|'cardio'} [starting] kind the user is about to start (optional)
 * @returns {string|null} gentle German hint or null
 */
export function sameDayLoadHint(sessions, today, starting) {
  const todays = doneSessions(sessions).filter((s) => dayOf(s) === today);
  const hasCardio = todays.some(isCardioSession) || starting === 'cardio';
  const hasStrength = todays.some(countsAsStrength) || (starting != null && starting !== 'cardio' && starting !== 'relief');
  if (!(hasCardio && hasStrength)) return null;
  return 'Rudern und Krafttraining am selben Tag: Gönn dem Knie danach genug Erholung – am nächsten Tag besser Pause oder nur Oberkörper. Bei Schmerz über 5/10 oder Schwellung: Ampel beachten.';
}

/** Mean of y values with from ≤ x ≤ to (inclusive) or null. @param {Point[]} points */
export function meanBetween(points, from, to) {
  const ys = points.filter((p) => p.x >= from && p.x <= to).map((p) => p.y);
  return ys.length ? Math.round((ys.reduce((a, b) => a + b, 0) / ys.length) * 100) / 100 : null;
}

/** Local day of the next-day check-in (its `at`, else session day + 1). */
function nextDayOf(s) {
  return s.nextDay?.at ? toISODate(new Date(s.nextDay.at)) : addDays(dayOf(s), 1);
}

/**
 * Pain trends for charts.
 * - `pre`/`post`: x = session day; `nextDay`: x = day of the check-in (fallback session day + 1).
 * - `perWeek`: every ISO week touching the window (zero weeks included), oldest first.
 * - `mean7` / `prevMean7`: mean over the last 7 days (today−6 … today) and the 7 days before.
 * @param {Session[]} sessions
 * @param {{days?: number, today?: string}} [opts]
 */
export function trends(sessions, { days = 42, today } = {}) {
  const t = today ?? defaultToday(sessions);
  const from = addDays(t, -(Math.max(1, days) - 1));
  /** @type {Point[]} */ const pre = [];
  /** @type {Point[]} */ const post = [];
  /** @type {Point[]} */ const nextDay = [];
  const inWin = (x) => x >= from && x <= t;
  const all = { pre: [], post: [], nextDay: [] };
  for (const s of doneSessions(sessions)) {
    const d = dayOf(s);
    if (typeof s.pre?.pain === 'number') all.pre.push({ x: d, y: s.pre.pain });
    if (typeof s.post?.pain === 'number') all.post.push({ x: d, y: s.post.pain });
    if (typeof s.nextDay?.pain === 'number') all.nextDay.push({ x: nextDayOf(s), y: s.nextDay.pain });
  }
  const byX = (a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0);
  for (const k of /** @type {const} */ (['pre', 'post', 'nextDay'])) all[k].sort(byX);
  pre.push(...all.pre.filter((p) => inWin(p.x)));
  post.push(...all.post.filter((p) => inWin(p.x)));
  nextDay.push(...all.nextDay.filter((p) => inWin(p.x)));

  const counts = sessionsPerWeek(sessions, countsAsStrength);
  const cardioCounts = sessionsPerWeek(sessions, isCardioSession);
  const perWeek = [];
  for (let wk = startOfIsoWeek(from); wk <= t; wk = addDays(wk, 7)) {
    perWeek.push({ week: isoWeekKey(wk), weekStart: wk, count: counts.get(wk) ?? 0, cardio: cardioCounts.get(wk) ?? 0 });
  }
  const m7from = addDays(t, -6);
  const p7from = addDays(t, -13);
  const p7to = addDays(t, -7);
  const mean7 = { pre: meanBetween(all.pre, m7from, t), post: meanBetween(all.post, m7from, t), nextDay: meanBetween(all.nextDay, m7from, t) };
  const prevMean7 = { pre: meanBetween(all.pre, p7from, p7to), post: meanBetween(all.post, p7from, p7to), nextDay: meanBetween(all.nextDay, p7from, p7to) };
  return { pre, post, nextDay, perWeek, mean7, prevMean7 };
}

/**
 * Data for `charts.calendarHeatmap`: one entry per day with ≥ 1 done session inside the last
 * `weeks` ISO weeks (current week included). `value` = session count, `traffic` = worst light.
 * @param {Session[]} sessions
 * @param {{today?: string, weeks?: number}} [opts]
 * @returns {{date: string, value: number, traffic: string|null}[]}
 */
export function calendarData(sessions, { today, weeks = 16 } = {}) {
  const t = today ?? defaultToday(sessions);
  const from = addDays(startOfIsoWeek(t), -7 * (Math.max(1, weeks) - 1));
  /** @type {Map<string, {date: string, value: number, lights: (string|null)[]}>} */
  const m = new Map();
  for (const s of doneSessions(sessions)) {
    const d = dayOf(s);
    if (d < from || d > t) continue;
    const e = m.get(d) ?? { date: d, value: 0, lights: [] };
    e.value += 1;
    e.lights.push(sessionLight(s));
    m.set(d, e);
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map(({ date, value, lights }) => ({ date, value, traffic: worstOf(lights) }));
}

/** Rank of a band id in settings.bands (weakest = 0), -1 if unknown. */
export function bandRank(settings, band) {
  const bands = settings?.bands ?? [];
  return bands.findIndex((b) => b.id === band);
}

/** v4: mobility warm-up, stretching cool-down and rowing blocks do not count for hold/rep records or hold totals. */
const recordSection = (e) => e?.section !== 'warmup' && e?.section !== 'cooldown' && e?.section !== 'cardio';

/**
 * Personal records over done sessions (non-skipped main-block exercises, done sets). Ties keep the earliest.
 * - longestHold: max `set.hold` seconds.
 * - mostReps: max `set.reps` in a single set without `hold` (pure rep sets).
 * - strongestBand: band with the highest index in `settings.bands` (record also carries `rank`).
 * @param {Session[]} sessions
 * @param {import('../types.js').Settings} settings
 */
export function personalRecords(sessions, settings) {
  /** @type {{seconds:number, exerciseId:string, date:string}|null} */ let longestHold = null;
  /** @type {{reps:number, exerciseId:string, date:string}|null} */ let mostReps = null;
  /** @type {{band:string, rank:number, exerciseId:string, date:string}|null} */ let strongestBand = null;
  const sorted = doneSessions(sessions).slice().sort((a, b) => (dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1 : 0));
  for (const s of sorted) {
    const date = dayOf(s);
    for (const e of s.exercises || []) {
      if (e.skipped || !recordSection(e)) continue;
      for (const set of e.sets || []) {
        if (!set?.done) continue;
        if (typeof set.hold === 'number' && set.hold > 0 && (!longestHold || set.hold > longestHold.seconds)) {
          longestHold = { seconds: set.hold, exerciseId: e.exerciseId, date };
        }
        if (!set.hold && typeof set.reps === 'number' && set.reps > 0 && (!mostReps || set.reps > mostReps.reps)) {
          mostReps = { reps: set.reps, exerciseId: e.exerciseId, date };
        }
        if (set.band) {
          const rank = bandRank(settings, set.band);
          if (rank >= 0 && (!strongestBand || rank > strongestBand.rank)) strongestBand = { band: set.band, rank, exerciseId: e.exerciseId, date };
        }
      }
    }
  }
  return { longestHold, mostReps, strongestBand };
}

/**
 * Record keys that improved from `prev` to `next` (a record appearing for the first time counts).
 * @param {ReturnType<typeof personalRecords>|null|undefined} prev
 * @param {ReturnType<typeof personalRecords>|null|undefined} next
 * @returns {string[]}
 */
export function newRecords(prev, next) {
  const out = [];
  const p = prev || {};
  const n = next || {};
  if (n.longestHold && (!p.longestHold || n.longestHold.seconds > p.longestHold.seconds)) out.push('longestHold');
  if (n.mostReps && (!p.mostReps || n.mostReps.reps > p.mostReps.reps)) out.push('mostReps');
  if (n.strongestBand) {
    const pb = p.strongestBand;
    const better = !pb || (typeof n.strongestBand.rank === 'number' && typeof pb.rank === 'number'
      ? n.strongestBand.rank > pb.rank
      : n.strongestBand.band !== pb.band);
    if (better) out.push('strongestBand');
  }
  return out;
}

/**
 * Cumulative hold seconds of done sets (hold × reps), skipped exercises and active sessions ignored.
 * v4: stretches/mobility (sections warmup/cooldown) are not counted.
 * @param {Session[]} sessions
 */
export function totalHoldSeconds(sessions) {
  let sum = 0;
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || s.status === 'active') continue;
    for (const e of s.exercises || []) {
      if (e.skipped || !recordSection(e)) continue;
      for (const set of e.sets || []) if (set?.done && set.hold) sum += set.hold * (set.reps || 1);
    }
  }
  return sum;
}
