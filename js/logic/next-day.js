// Next-day check-in timing (pure, Node-testable). Shared by the Heute banner (views/ui.js) and the
// #/folgetag flow (views/session-helpers.js) so both always agree on which sessions are open.
import { doneSessions, dayOf } from './stats.js';

/** @typedef {import('../types.js').Session} Session */

/** When the next-day check-in becomes due: 12 h after the end or the next local midnight, whichever is first. */
export function nextDayDueAt(endedAt) {
  const end = new Date(endedAt);
  const plus12 = end.getTime() + 12 * 3600e3;
  const midnight = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  return new Date(Math.min(plus12, midnight)).toISOString();
}

/**
 * The next-day check-in that is open: all DONE sessions of the most recent training day without `nextDay`
 * (e.g. strength + rowing on the same day are answered by ONE check). `session` = the latest of them,
 * `sessions` = all of them (oldest first). `due` = check-in is open (≥ 12 h after the latest end or from the
 * next calendar day). Days older than `maxDays` (default 4) are not offered anymore.
 * @param {Session[]} sessions
 * @returns {{session: Session, sessions: Session[], due: boolean, dueAt: string}|null}
 */
export function pendingNextDay(sessions, now = new Date(), { maxDays = 4 } = {}) {
  const done = doneSessions(sessions).filter((s) => s.endedAt && Number.isFinite(Date.parse(s.endedAt)))
    .sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt));
  const last = done.at(-1);
  if (!last) return null;
  const day = dayOf(last);
  const group = done.filter((s) => dayOf(s) === day && !s.nextDay);
  const latest = group.at(-1);
  if (!latest) return null;
  const dueAt = nextDayDueAt(latest.endedAt);
  if (now.getTime() - Date.parse(latest.endedAt) > maxDays * 86400e3) return null;
  return { session: latest, sessions: group, due: now.getTime() >= Date.parse(dueAt), dueAt };
}
