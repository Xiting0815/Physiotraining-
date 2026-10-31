// Statistics. PURE. See docs/SPEC.md §7.7.
// WP0 stub: signatures binding; WP-Logic completes + tests.
import { isoWeekKey, toISODate } from '../util/date.js';

/** @param {import('../types.js').Session} s */
const dayOf = (s) => toISODate(new Date(s.endedAt || s.startedAt));

/**
 * @param {import('../types.js').Session[]} sessions
 * @param {number} weeklyGoal
 * @param {string} today
 * @returns {{weeks: number, currentWeekCount: number}}
 */
export function streak(sessions, weeklyGoal, today) {
  // TODO(WP-Logic): consecutive ISO weeks meeting goal.
  return { weeks: 0, currentWeekCount: weeklyProgress(sessions, weeklyGoal, today).done };
}

/**
 * @param {import('../types.js').Session[]} sessions
 * @param {number} weeklyGoal
 * @param {string} today
 * @returns {{done: number, goal: number, ratio: number}}
 */
export function weeklyProgress(sessions, weeklyGoal, today) {
  const wk = isoWeekKey(today);
  const done = sessions.filter((s) => s.status === 'done' && isoWeekKey(dayOf(s)) === wk).length;
  return { done, goal: weeklyGoal, ratio: weeklyGoal ? Math.min(1, done / weeklyGoal) : 0 };
}

/**
 * @param {import('../types.js').Session[]} sessions
 * @param {{days?: number, today?: string}} [opts]
 * @returns {{pre: {x:string,y:number}[], post: {x:string,y:number}[], nextDay: {x:string,y:number}[], perWeek: {week:string,count:number}[]}}
 */
export function trends(sessions, { days = 42 } = {}) {
  // TODO(WP-Logic)
  return { pre: [], post: [], nextDay: [], perWeek: [] };
}

/**
 * @param {import('../types.js').Session[]} sessions
 * @param {import('../types.js').Settings} settings
 */
export function personalRecords(sessions, settings) {
  // TODO(WP-Logic)
  return { longestHold: null, mostReps: null, strongestBand: null };
}

/** @param {ReturnType<typeof personalRecords>} prev @param {ReturnType<typeof personalRecords>} next @returns {string[]} */
export function newRecords(prev, next) {
  // TODO(WP-Logic)
  return [];
}

/** @param {import('../types.js').Session[]} sessions */
export function totalHoldSeconds(sessions) {
  let sum = 0;
  for (const s of sessions) for (const e of s.exercises || []) for (const set of e.sets || []) {
    if (set.done && set.hold) sum += set.hold * (set.reps || 1);
  }
  return sum;
}
