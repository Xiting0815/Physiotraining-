// Analysis layer (training only): weekly report, load vs. pain, OP readiness. PURE.
// Correlations are descriptive only (Pearson r, ≥ MIN_POINTS pairs) and worded cautiously – never causal.
// See docs/SPEC.md §12.11, §14 (v3.1: health-log / weight insights removed).
import { addDays, startOfIsoWeek, toISODate } from '../util/date.js';
import { cardioSessions, dayOf, doneSessions, isCardioSession, sessionLight, strengthSessions } from './stats.js';
import { phaseProgress, levelOf } from './progression.js';
import { sessionDurationSec, sessionKcal, bodyWeightKg } from './energy.js';

export const MIN_POINTS = 8;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const de = (v, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');

/** Session load (session-RPE): post.rpe (default 5) × active minutes. */
export function sessionLoad(session) {
  const rpe = isNum(session?.post?.rpe) ? session.post.rpe : 5;
  return Math.round(rpe * (sessionDurationSec(session) / 60));
}

/** Pearson correlation; null with < MIN_POINTS pairs or zero variance. */
export function pearson(xs, ys, minPoints = MIN_POINTS) {
  const n = Math.min(xs?.length ?? 0, ys?.length ?? 0);
  if (n < minPoints) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx; const b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Cautious German wording for a correlation.
 * @param {number|null} r @param {number} n pairs
 * @param {{x: string, more: string, less: string}} w e.g. {x: 'mehr Schlaf', more: 'höher', less: 'niedriger'}
 */
export function correlationText(r, n, w) {
  if (r == null) return `Noch zu wenige Daten (${n} von mindestens ${MIN_POINTS} Tagen) – einfach weiter eintragen.`;
  const a = Math.abs(r);
  if (a < 0.2) return `Kein erkennbarer Zusammenhang (r = ${de(r)}, ${n} Tage).`;
  const strength = a < 0.4 ? 'leichte' : a < 0.6 ? 'mäßige' : 'deutliche';
  const dir = r < 0 ? w.less : w.more;
  return `Mögliche ${strength} Tendenz: Bei ${w.x} war der Knieschmerz eher ${dir} (r = ${de(r)}, ${n} Tage). Das zeigt nur ein gemeinsames Auftreten, keinen Beweis für Ursache und Wirkung.`;
}

/**
 * Training load vs. next-day pain (per session with a next-day check-in).
 * @returns {{points: {date: string, load: number, nextDayPain: number, kind: string}[], r: number|null, n: number, text: string,
 *   weekly: {weekStart: string, load: number, avgNextDayPain: number|null}[]}}
 */
export function loadVsPain(sessions, { today, days = 56 } = {}) {
  const done = doneSessions(sessions);
  const t = today ?? (done.length ? done.map(dayOf).sort().at(-1) : toISODate(new Date()));
  const from = addDays(t, -(days - 1));
  const inWin = done.filter((s) => dayOf(s) >= from && dayOf(s) <= t);
  const points = inWin.filter((s) => isNum(s.nextDay?.pain)).map((s) => ({ date: dayOf(s), load: sessionLoad(s), nextDayPain: s.nextDay.pain, kind: isCardioSession(s) ? 'cardio' : 'strength' }));
  const r = pearson(points.map((p) => p.load), points.map((p) => p.nextDayPain));
  const weeks = new Map();
  for (const s of inWin) {
    const wk = startOfIsoWeek(dayOf(s));
    const e = weeks.get(wk) ?? { weekStart: wk, load: 0, pains: [] };
    e.load += sessionLoad(s);
    if (isNum(s.nextDay?.pain)) e.pains.push(s.nextDay.pain);
    weeks.set(wk, e);
  }
  const weekly = [...weeks.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)).map((e) => ({ weekStart: e.weekStart, load: e.load, avgNextDayPain: r2(mean(e.pains)) }));
  return { points, r: r2(r), n: points.length, text: correlationText(r, points.length, { x: 'höherer Trainingslast', more: 'höher am Folgetag', less: 'niedriger am Folgetag' }), weekly };
}

/**
 * Weekly report for the ISO week containing `weekOf` (default: today).
 * @param {import('../types.js').Data} data
 * @param {import('../types.js').Content} content
 * @param {string} today
 * @param {{weekOf?: string}} [opts]
 */
export function weeklyReport(data, content, today, { weekOf } = {}) {
  const wk = startOfIsoWeek(weekOf ?? today);
  const end = addDays(wk, 6);
  const prevWk = addDays(wk, -7);
  const settings = data?.settings || {};
  const all = doneSessions(data?.sessions);
  const inWeek = (s, a, b) => dayOf(s) >= a && dayOf(s) <= b;
  const week = all.filter((s) => inWeek(s, wk, end));
  const prev = all.filter((s) => inWeek(s, prevWk, addDays(wk, -1)));
  const lights = { green: 0, yellow: 0, red: 0, stop: 0 };
  for (const s of week) { const l = sessionLight(s); if (l in lights) lights[l] += 1; }
  const ndPain = (list) => r2(mean(list.filter((s) => isNum(s.nextDay?.pain)).map((s) => s.nextDay.pain)));
  const prePain = (list) => r2(mean(list.filter((s) => isNum(s.pre?.pain)).map((s) => s.pre.pain)));
  const cardio = cardioSessions(week);
  const strength = strengthSessions(week);
  const avgNd = ndPain(week);
  const prevNd = ndPain(prev);
  const kg = bodyWeightKg(settings);
  const kcal = week.reduce((a, s) => a + sessionKcal(s, kg, content).kcal, 0);
  const highlights = [];
  const notes = [];
  const goal = settings.weeklyGoal ?? 3;
  const cGoal = settings.cardioGoalPerWeek ?? 3;
  if (strength.length >= goal) highlights.push(`Krafttraining-Ziel erreicht (${strength.length}/${goal}).`);
  if (cardio.length >= cGoal) highlights.push(`Ruder-Ziel erreicht (${cardio.length}/${cGoal}).`);
  if (week.length && lights.green === week.length) highlights.push('Alle Einheiten grün.');
  if (lights.red + lights.stop > 0) notes.push('Diese Woche gab es rote Ampeln – Belastung im Blick behalten.');
  if (avgNd != null && prevNd != null && avgNd > prevNd + 1) notes.push('Folgetag-Schmerz höher als in der Vorwoche – eher halten statt steigern.');
  const sameDay = new Set();
  for (const s of cardio) if (strength.some((x) => dayOf(x) === dayOf(s))) sameDay.add(dayOf(s));
  if (sameDay.size) notes.push(`${sameDay.size}× Rudern und Kraft am selben Tag – danach auf Erholung achten.`);
  return {
    weekStart: wk, weekEnd: end,
    strength: { done: strength.length, goal },
    cardio: { done: cardio.length, goal: cGoal, minutes: Math.round(cardio.reduce((a, s) => a + (s.rowing?.durationSec ?? 0), 0) / 60), distanceM: cardio.reduce((a, s) => a + (s.rowing?.distanceM ?? 0), 0) },
    lights, avgPrePain: prePain(week), avgNextDayPain: avgNd, prevAvgNextDayPain: prevNd,
    load: week.reduce((a, s) => a + sessionLoad(s), 0), prevLoad: prev.reduce((a, s) => a + sessionLoad(s), 0),
    kcal, highlights, notes,
  };
}

/**
 * „OP-Bereitschaft“ score 0–100 (prehab only; heuristic, motivational – not a medical assessment).
 * Parts (weight): criteria 30 (exit criteria of completed + current prehab phase), strength 25 (mean level
 * progress of knee & crutch-prep exercises in the current phase's A/B/C), swellingFree 25 (share of done sessions
 * in the last 14 days without swelling after/next day), regularity 20 (last 4 weeks: 70 % strength vs goal,
 * 30 % rowing vs cardio goal).
 * @returns {{score: number, label: string, parts: Record<string, {score: number, weight: number}>, tips: string[]}}
 */
export function opReadiness(data, content, today) {
  const phases = (content?.phases || []).filter((p) => (p.kind ?? 'prehab') === 'prehab').sort((a, b) => a.order - b.order);
  const state = data?.state || {};
  const settings = data?.settings || {};
  const sessions = doneSessions(data?.sessions);
  const cur = phases.find((p) => p.id === state.phaseId) ?? phases[0];
  const tips = [];
  // criteria
  let crit = 0;
  if (cur && phases.length) {
    const before = phases.filter((p) => p.order < cur.order).length;
    const pp = phaseProgress(state, cur, sessions, { today, settings });
    const metOrTicked = pp.criteria.filter((c) => c.ticked || c.met === true).length;
    const ratio = pp.criteriaTotal ? metOrTicked / pp.criteriaTotal : 0;
    crit = (before + ratio) / phases.length;
    if (ratio < 1) tips.push('Ausstiegskriterien der aktuellen Phase im Plan abhaken, sobald sie passen.');
  }
  // strength
  const exIds = new Set();
  for (const k of ['A', 'B', 'C']) {
    const w = (content?.workouts || []).find((x) => x.id === cur?.workouts?.[k]);
    for (const b of w?.blocks || []) for (const it of b.items || []) exIds.add(it.exerciseId);
  }
  const ex = (content?.exercises || []).filter((e) => exIds.has(e.id) && (e.block === 'knee' || (e.tags || []).includes('kruecken')));
  const prog = ex.map((e) => (e.levels.length > 1 ? levelOf(state, e.id, e) / (e.levels.length - 1) : 1));
  const strength = prog.length ? mean(prog) : 0;
  if (strength < 0.5) tips.push('Kraft im Knie- und Stützbereich weiter dosiert steigern (Vorschläge übernehmen).');
  // swelling
  const recent = sessions.filter((s) => dayOf(s) >= addDays(today, -13) && dayOf(s) <= today);
  const swellFree = recent.length ? recent.filter((s) => !((s.post?.swelling ?? 0) > 0) && !((s.nextDay?.swelling ?? 0) > 0)).length / recent.length : 0;
  if (!recent.length) tips.push('In den letzten 14 Tagen keine Einheit – Schwellungsfreiheit noch nicht beurteilbar.');
  else if (swellFree < 1) tips.push('Schwellung nach dem Training ernst nehmen – Umfang halten oder reduzieren.');
  // regularity
  const from = addDays(today, -27);
  const last4 = sessions.filter((s) => dayOf(s) >= from && dayOf(s) <= today);
  const sDone = last4.filter((s) => !isCardioSession(s)).length;
  const cDone = last4.filter(isCardioSession).length;
  const goal = Math.max(1, settings.weeklyGoal ?? 3) * 4;
  const cGoal = Math.max(1, settings.cardioGoalPerWeek ?? 3) * 4;
  const regularity = 0.7 * Math.min(1, sDone / goal) + 0.3 * Math.min(1, cDone / cGoal);
  if (regularity < 0.7) tips.push('Regelmäßigkeit zählt mehr als Intensität – lieber ein Kurztraining als keins.');
  const parts = {
    criteria: { score: Math.round(crit * 100), weight: 30 },
    strength: { score: Math.round(strength * 100), weight: 25 },
    swellingFree: { score: Math.round(swellFree * 100), weight: 25 },
    regularity: { score: Math.round(regularity * 100), weight: 20 },
  };
  const score = Math.round(Object.values(parts).reduce((a, p) => a + (p.score * p.weight) / 100, 0));
  const label = score >= 80 ? 'Sehr gut vorbereitet' : score >= 60 ? 'Auf gutem Weg' : score >= 40 ? 'Im Aufbau' : 'Am Anfang';
  return { score, label, parts, tips };
}
