// XP, levels, badges, quotes, countdown, target-face score. PURE. See docs/SPEC.md §8, §7.7.
import { daysBetween, startOfIsoWeek } from '../util/date.js';
import { dayOf, doneSessions, newRecords, personalRecords, sessionLight, totalHoldSeconds, weeklyProgress } from './stats.js';

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
 * done sets × perSet + clean sets (pain ≤ greenMax, no sharp pain) × bonus + session bonus (status done).
 * Next-day check-in (+20) and badges (+25 each) are awarded separately via `XP`.
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Settings} settings
 */
export function xpFor(session, settings) {
  const greenMax = settings?.painThresholds?.greenMax ?? 2;
  let xp = session?.status === 'done' ? XP.sessionBonus : 0;
  for (const e of session?.exercises || []) {
    if (e.skipped) continue;
    const clean = (e.painDuring == null || e.painDuring <= greenMax) && !e.sharpPain;
    for (const s of e.sets || []) if (s?.done) xp += XP.perSet + (clean ? XP.cleanSetBonus : 0);
  }
  return xp;
}

/** @param {number} xp */
export function levelFor(xp) {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (x >= LEVELS[i].min) index = i;
  const cur = LEVELS[index];
  const next = LEVELS[index + 1]?.min ?? null;
  const progress = next == null ? 1 : (x - cur.min) / (next - cur.min);
  return { index, title: cur.title, min: cur.min, next, progress };
}

const byDay = (a, b) => (dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1 : 0);

/** Has any record been improved by a later session (first values don't count)? */
function anyRecordBeaten(sessions, settings) {
  const sorted = doneSessions(sessions).slice().sort(byDay);
  let prev = personalRecords([], settings);
  for (let i = 0; i < sorted.length; i++) {
    const next = personalRecords(sorted.slice(0, i + 1), settings);
    const improved = newRecords(prev, next).filter((k) => prev[k] != null);
    if (improved.length) return true;
    prev = next;
  }
  return false;
}

/**
 * Is a badge rule satisfied by the data? (independent of whether it is already earned)
 * @param {import('../types.js').Badge['rule']} rule
 * @param {import('../types.js').Data} data
 */
export function badgeRuleMet(rule, data) {
  const sessions = doneSessions(data?.sessions);
  const settings = data?.settings;
  switch (rule?.type) {
    case 'sessionsCount':
      return sessions.length >= (rule.n ?? 1);
    case 'weekSessions': {
      const m = new Map();
      for (const s of sessions) { const wk = startOfIsoWeek(dayOf(s)); m.set(wk, (m.get(wk) ?? 0) + 1); }
      return [...m.values()].some((c) => c >= (rule.n ?? 3));
    }
    case 'totalHoldSeconds':
      return totalHoldSeconds(sessions) >= (rule.n ?? 300);
    case 'phaseCompleted': {
      const hist = data?.state?.phaseHistory || [];
      return new Set(hist.map((h) => h.phaseId)).size >= 2 || hist.length >= 2;
    }
    case 'greenWeek': {
      const goal = Math.max(1, settings?.weeklyGoal ?? 3);
      const m = new Map();
      for (const s of sessions) { const wk = startOfIsoWeek(dayOf(s)); m.set(wk, [...(m.get(wk) ?? []), sessionLight(s)]); }
      return [...m.values()].some((ls) => ls.length >= goal && ls.every((l) => l === 'green'));
    }
    case 'personalRecord':
      return anyRecordBeaten(sessions, settings);
    case 'comeback': {
      const n = rule.n ?? 10;
      const days = sessions.map(dayOf).sort();
      for (let i = 1; i < days.length; i++) if (daysBetween(days[i - 1], days[i]) >= n) return true;
      return false;
    }
    default:
      return false;
  }
}

/**
 * @param {import('../types.js').Data} data
 * @param {import('../types.js').Badge[]} badgeDefs
 * @param {{today?: string}} [opts]
 * @returns {string[]} newly earned badge ids (not yet in `state.badges`), in badgeDefs order
 */
export function evaluateBadges(data, badgeDefs, opts = {}) {
  const have = data?.state?.badges || {};
  return (badgeDefs || []).filter((b) => b && !have[b.id] && badgeRuleMet(b.rule, data)).map((b) => b.id);
}

/**
 * Score of one set (mirrors `celebrate.scoreForSet`).
 * @param {{done: boolean, skipped?: boolean, painDuring?: number|null, sharpPain?: boolean}} s
 * @param {{greenMax: number, yellowMax: number}} thr
 */
export function setScore({ done, skipped, painDuring, sharpPain }, thr = { greenMax: 2, yellowMax: 5 }) {
  if (!done || skipped) return 1;
  if (sharpPain) return 4;
  const p = painDuring ?? 0;
  if (p <= thr.greenMax) return 10;
  if (p <= thr.yellowMax) return 7;
  return 4;
}

/**
 * Target-face summary: every completed or planned set = one arrow.
 * Planned count = `plannedSets` | content level sets (tapered if session.taper) | logged sets.
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Settings} settings
 * @param {import('../types.js').Content} [content]
 * @returns {{results: {score: number, label: string}[], points: number, max: number, ratio: number, headline: string}}
 */
export function sessionScore(session, settings, content) {
  const thr = { greenMax: 2, yellowMax: 5, ...(settings?.painThresholds || {}) };
  const results = [];
  for (const e of session?.exercises || []) {
    const ex = content?.exercises?.find((x) => x.id === e.exerciseId);
    let planned = e.plannedSets;
    if (planned == null && ex) {
      const sets = ex.levels?.[e.level ?? 0]?.sets;
      if (sets != null) planned = session.taper ? Math.max(1, Math.round(sets * 0.65)) : sets;
    }
    const logged = e.sets || [];
    const count = Math.max(logged.length, planned ?? 0, logged.length ? 0 : 1);
    const label = ex?.name ?? e.exerciseId;
    for (let i = 0; i < count; i++) {
      const set = logged[i];
      results.push({ score: setScore({ done: !!set?.done, skipped: e.skipped, painDuring: e.painDuring, sharpPain: e.sharpPain }, thr), label });
    }
  }
  const points = results.reduce((a, r) => a + r.score, 0);
  const max = results.length * 10;
  const ratio = max ? points / max : 0;
  const headline = ratio >= 0.9 ? 'Volltreffer!' : ratio >= 0.7 ? 'Starke Gruppe!' : 'Jeder Pfeil bringt dich weiter.';
  return { results, points, max, ratio, headline };
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

/**
 * Deterministic quote by date. Uses `quotes` (e.g. content.quotes from data/quotes.json) when a
 * non-empty array is given, else the built-in list.
 * @param {string} today "YYYY-MM-DD"
 * @param {string[]|null} [quotes]
 */
export function dailyQuote(today, quotes) {
  const list = Array.isArray(quotes) && quotes.length ? quotes : QUOTES;
  let h = 0;
  for (const c of String(today)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/**
 * OP countdown. `stage`: "none" (no date) | "countdown" | "taper" (1–7 days) | "today" | "after".
 * progress: prehabStart → surgeryDate, clamped 0..1 (1 on/after the date).
 * @param {import('../types.js').Settings} settings
 * @param {string} today
 * @returns {{daysLeft: number|null, progress: number, stage: string}}
 */
export function opCountdown(settings, today) {
  if (!settings?.surgeryDate) return { daysLeft: null, progress: 0, stage: 'none' };
  const daysLeft = daysBetween(today, settings.surgeryDate);
  const total = settings.prehabStart ? daysBetween(settings.prehabStart, settings.surgeryDate) : 0;
  let progress;
  if (daysLeft <= 0) progress = 1;
  else if (total > 0) progress = Math.min(1, Math.max(0, 1 - daysLeft / total));
  else progress = 0;
  const stage = daysLeft < 0 ? 'after' : daysLeft === 0 ? 'today' : daysLeft <= 7 ? 'taper' : 'countdown';
  return { daysLeft, progress, stage };
}

/**
 * Gentle, never guilt-tripping reminder copy (null = nothing to say).
 * @param {import('../types.js').Session[]} sessions
 * @param {number} weeklyGoal
 * @param {string} today
 * @returns {string|null}
 */
export function reminderText(sessions, weeklyGoal, today) {
  const done = doneSessions(sessions);
  if (done.some((s) => dayOf(s) === today)) return null;
  const { done: n, goal } = weeklyProgress(done, weeklyGoal, today);
  if (goal > 0 && n >= goal) return null;
  const left = Math.max(0, (goal || 0) - n);
  if (left === 1) return 'Noch 1 Einheit bis zum Wochenziel – ganz entspannt.';
  if (n > 0 && left > 1) return `Noch ${left} Einheiten bis zum Wochenziel – Schritt für Schritt.`;
  return 'Lust auf eine kurze Einheit? Dein Knie freut sich über Bewegung.';
}
