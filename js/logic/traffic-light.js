// Traffic-light evaluation. PURE – no DOM, no storage. See docs/SPEC.md §5.1, §5.2, §7.7.
// WP0 stub: signatures are binding; WP-Logic implements the full rules + tests.
import { daysBetween } from '../util/date.js';

/** @typedef {import('../types.js').Light} Light */

export const LIGHTS = /** @type {const} */ (['green', 'yellow', 'red', 'stop']);

/** @param {Light|null} a @param {Light|null} b @returns {Light} */
export function worst(a, b) {
  const ia = LIGHTS.indexOf(a ?? 'green');
  const ib = LIGHTS.indexOf(b ?? 'green');
  return LIGHTS[Math.max(ia, ib)];
}

/**
 * Provisional light at session end (no next-day data).
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Settings} settings
 * @param {import('../types.js').Session[]} [history] previous completed sessions, oldest first
 * @returns {{traffic: Light, reasons: string[], perExercise: Record<string, Light>}}
 */
export function evaluateSession(session, settings, history = []) {
  // TODO(WP-Logic): implement full rule table from SPEC §5.1.
  return { traffic: 'green', reasons: [], perExercise: {} };
}

/**
 * Final light including next-day check-in.
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').NextDay} nextDay
 * @param {import('../types.js').Settings} settings
 * @param {import('../types.js').Session[]} [history]
 * @returns {{traffic: Light, reasons: string[], perExercise: Record<string, Light>}}
 */
export function finalizeWithNextDay(session, nextDay, settings, history = []) {
  // TODO(WP-Logic)
  return evaluateSession(session, settings, history);
}

/**
 * Level suggestions (the app only suggests; user confirms).
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Session[]} history
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 * @param {import('../types.js').Settings} settings
 * @param {{today: string}} opts
 * @returns {import('../types.js').Recommendation[]}
 */
export function recommendLevels(session, history, state, content, settings, { today } = { today: '' }) {
  // TODO(WP-Logic)
  return [];
}

/**
 * True during the last 7 days before surgery (1 ≤ daysUntil ≤ 7).
 * @param {string|null} surgeryDate "YYYY-MM-DD"
 * @param {string} today "YYYY-MM-DD"
 */
export function taperActive(surgeryDate, today) {
  if (!surgeryDate || !today) return false;
  const d = daysBetween(today, surgeryDate);
  return d >= 1 && d <= 7;
}

/**
 * Reduce volume ~35 % (sets × 0.65, rounded, min 1).
 * @param {import('../types.js').Level} level
 * @returns {import('../types.js').Level}
 */
export function applyTaper(level) {
  return { ...level, sets: Math.max(1, Math.round(level.sets * 0.65)) };
}
