// XP, levels, badges, quotes, countdown. PURE. See docs/SPEC.md §8, §7.7.
// WP0 stub: signatures binding; WP-Logic completes + tests.
import { daysBetween } from '../util/date.js';

export const XP = { perSet: 10, cleanSetBonus: 5, sessionBonus: 50, nextDayCheckIn: 20, badge: 25 };

export const LEVELS = [
  { title: 'Novize', min: 0 },
  { title: 'Lehrling', min: 150 },
  { title: 'Bogenträger', min: 400 },
  { title: 'Schütze', min: 800 },
  { title: 'Jäger', min: 1400 },
  { title: 'Scharfschütze', min: 2200 },
  { title: 'Meisterschütze', min: 3200 },
  { title: 'Bogenmeister', min: 4500 },
  { title: 'Robin Hood', min: 6000 },
];

/**
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Settings} settings
 */
export function xpFor(session, settings) {
  const greenMax = settings?.painThresholds?.greenMax ?? 2;
  let xp = session.status === 'done' ? XP.sessionBonus : 0;
  for (const e of session.exercises || []) {
    const clean = e.painDuring == null || e.painDuring <= greenMax;
    for (const s of e.sets || []) if (s.done) xp += XP.perSet + (clean && !e.sharpPain ? XP.cleanSetBonus : 0);
  }
  return xp;
}

/** @param {number} xp */
export function levelFor(xp) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].min) index = i;
  const cur = LEVELS[index];
  const next = LEVELS[index + 1]?.min ?? null;
  const progress = next == null ? 1 : (xp - cur.min) / (next - cur.min);
  return { index, title: cur.title, min: cur.min, next, progress };
}

/**
 * @param {import('../types.js').Data} data
 * @param {import('../types.js').Badge[]} badgeDefs
 * @param {{today: string}} opts
 * @returns {string[]} newly earned badge ids
 */
export function evaluateBadges(data, badgeDefs, { today } = { today: '' }) {
  // TODO(WP-Logic): all rule types from SPEC §6.5.
  const have = data.state.badges || {};
  const done = data.sessions.filter((s) => s.status === 'done').length;
  return badgeDefs
    .filter((b) => !have[b.id] && b.rule.type === 'sessionsCount' && done >= (b.rule.n ?? 1))
    .map((b) => b.id);
}

export const QUOTES = [
  'Ein ruhiger Atem trifft besser als ein starker Arm.',
  'Der Pfeil fliegt dahin, wohin die Routine zeigt.',
  'Heute sauber, morgen stark.',
  'Spannung halten, Kontrolle behalten.',
  'Kleine Schritte, klare Linie.',
  'Wer geduldig zielt, muss selten nachladen.',
  'Ein guter Schuss beginnt lange vor dem Lösen.',
];

/** Deterministic quote by date. @param {string} today "YYYY-MM-DD" */
export function dailyQuote(today) {
  let h = 0;
  for (const c of String(today)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return QUOTES[h % QUOTES.length];
}

/**
 * @param {import('../types.js').Settings} settings
 * @param {string} today
 * @returns {{daysLeft: number|null, progress: number}}
 */
export function opCountdown(settings, today) {
  if (!settings?.surgeryDate) return { daysLeft: null, progress: 0 };
  const daysLeft = daysBetween(today, settings.surgeryDate);
  const total = settings.prehabStart ? daysBetween(settings.prehabStart, settings.surgeryDate) : 0;
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - daysLeft / total)) : daysLeft <= 0 ? 1 : 0;
  return { daysLeft, progress };
}

/**
 * Gentle, never guilt-tripping reminder copy.
 * @param {import('../types.js').Session[]} sessions
 * @param {number} weeklyGoal
 * @param {string} today
 * @returns {string|null}
 */
export function reminderText(sessions, weeklyGoal, today) {
  // TODO(WP-Logic): vary by context.
  return 'Lust auf eine kurze Einheit? Dein Knie freut sich über Bewegung.';
}
