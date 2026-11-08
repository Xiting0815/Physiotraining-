// Analysis layer: weekly report, load vs. pain, simple correlations, OP readiness, weight trend. PURE.
// Correlations are descriptive only (Pearson r, ≥ MIN_POINTS pairs) and worded cautiously – never causal.
// See docs/SPEC.md §12.11.
import { addDays, startOfIsoWeek, toISODate } from '../util/date.js';
import { cardioSessions, dayOf, doneSessions, isCardioSession, sessionLight, strengthSessions } from './stats.js';
import { phaseProgress, levelOf } from './progression.js';
import { sessionDurationSec, sessionKcal, currentWeight, weightTrend } from './energy.js';
import { meanOf } from './health.js';

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

/**
 * Knee pain per day: next-day check-in pain on its check-in date wins, else max pre-session pain of that day.
 * @returns {Map<string, number>}
 */
export function dailyPain(sessions) {
  const fromNd = new Map();
  const fromPre = new Map();
  for (const s of doneSessions(sessions)) {
    if (isNum(s.nextDay?.pain)) {
      const d = s.nextDay.at ? toISODate(new Date(s.nextDay.at)) : addDays(dayOf(s), 1);
      fromNd.set(d, Math.max(fromNd.get(d) ?? 0, s.nextDay.pain));
    }
    if (isNum(s.pre?.pain)) fromPre.set(dayOf(s), Math.max(fromPre.get(dayOf(s)) ?? 0, s.pre.pain));
  }
  const out = new Map(fromPre);
  for (const [d, v] of fromNd) out.set(d, v);
  return out;
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

/** Pairs of a health field on day d (+ offset) with knee pain on day d + painOffset. */
function healthPainPairs(healthLog, sessions, field, painOffset, { today, days }) {
  const pain = dailyPain(sessions);
  const t = today ?? [...pain.keys()].sort().at(-1);
  if (!t) return { xs: [], ys: [], pairs: [] };
  const from = addDays(t, -(days - 1));
  const pairs = [];
  for (const e of healthLog || []) {
    if (!isNum(e?.[field]) || e.date < from || e.date > t) continue;
    const p = pain.get(addDays(e.date, painOffset));
    if (isNum(p)) pairs.push({ date: e.date, x: e[field], pain: p });
  }
  pairs.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { xs: pairs.map((p) => p.x), ys: pairs.map((p) => p.pain), pairs };
}

/** Sleep (logged on the wake-up date d) vs. knee pain on day d. */
export function sleepVsPain(healthLog, sessions, { today, days = 90 } = {}) {
  const { xs, ys, pairs } = healthPainPairs(healthLog, sessions, 'sleepH', 0, { today, days });
  const r = pearson(xs, ys);
  return { pairs, r: r2(r), n: pairs.length, text: correlationText(r, pairs.length, { x: 'mehr Schlaf', more: 'höher', less: 'niedriger' }) };
}

/** Steps on day d vs. knee pain on day d + 1. */
export function stepsVsPain(healthLog, sessions, { today, days = 90 } = {}) {
  const { xs, ys, pairs } = healthPainPairs(healthLog, sessions, 'steps', 1, { today, days });
  const r = pearson(xs, ys);
  return { pairs, r: r2(r), n: pairs.length, text: correlationText(r, pairs.length, { x: 'mehr Schritten am Vortag', more: 'höher', less: 'niedriger' }) };
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
  const log = data?.state?.healthLog || [];
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
  const startKg = currentWeight(log, addDays(wk, -1));
  const endKg = currentWeight(log, end < today ? end : today);
  const kcal = week.reduce((a, s) => a + sessionKcal(s, settings.profile, currentWeight(log, dayOf(s)), content).kcal, 0);
  const health = {};
  for (const k of ['sleepH', 'steps', 'restingHr', 'activeMin']) { const m = meanOf(log, k, wk, end); if (m != null) health[k] = r2(m); }
  const logDays = log.filter((e) => e.date >= wk && e.date <= end).length;
  const highlights = [];
  const notes = [];
  const goal = settings.weeklyGoal ?? 3;
  const cGoal = settings.cardioGoalPerWeek ?? 3;
  if (strength.length >= goal) highlights.push(`Krafttraining-Ziel erreicht (${strength.length}/${goal}).`);
  if (cardio.length >= cGoal) highlights.push(`Ruder-Ziel erreicht (${cardio.length}/${cGoal}).`);
  if (week.length && lights.green === week.length) highlights.push('Alle Einheiten grün.');
  if (startKg != null && endKg != null && endKg < startKg) highlights.push(`Gewicht ${de(startKg - endKg, 1)} kg leichter (7-Tage-Schnitt).`);
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
    kcal, weight: { startKg, endKg, deltaKg: startKg != null && endKg != null ? r2(endKg - startKg) : null },
    health, logDays, highlights, notes,
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

/**
 * Weight trend summary for cards/charts.
 * @returns {{currentKg: number|null, kgPerWeek: number|null, n: number, text: string}}
 */
export function weightInsight(healthLog, today) {
  const cur = currentWeight(healthLog, today);
  const t = weightTrend(healthLog, today);
  if (cur == null) return { currentKg: null, kgPerWeek: null, n: 0, text: 'Noch kein Gewicht eingetragen.' };
  if (!t) return { currentKg: cur, kgPerWeek: null, n: 0, text: 'Für einen Trend bitte an mindestens 4 Tagen in 3 Wochen wiegen.' };
  const k = t.kgPerWeek;
  const text = Math.abs(k) < 0.1 ? 'Gewicht stabil in den letzten 3 Wochen.'
    : k < 0 ? `Trend: ${de(-k)} kg pro Woche leichter (letzte 3 Wochen).${k < -1 ? ' Das ist sehr schnell – genug essen, vor allem Eiweiß.' : ''}`
    : `Trend: ${de(k)} kg pro Woche schwerer (letzte 3 Wochen).`;
  return { currentKg: cur, kgPerWeek: k, n: t.n, text };
}

/* ------------------------------------------------------------------ */
/* Body composition (v3, §13.7)                                        */
/* ------------------------------------------------------------------ */

/** Changes smaller than this (kg / index points) count as „gehalten“ – BIA noise is larger than that. */
export const COMP_TOLERANCE = { fatKg: 0.5, muscleKg: 0.5, weightKg: 0.5, visceralFat: 1 };
export const BIA_CAUTION = 'Körperfett- und Muskelwerte einer Körperanalyse-Waage (BIA) schwanken mit Wasserhaushalt, Essen und Training um 1–2 kg. Vergleiche Trends über Wochen statt einzelner Tage und miss immer zur gleichen Tageszeit – am besten morgens nüchtern, nach dem WC, barfuß.';

/** Fat kg of an entry (bodyFatKg or weight × %). */
const fatKgOf = (e) => (isNum(e.bodyFatKg) ? e.bodyFatKg : isNum(e.weightKg) && isNum(e.bodyFatPct) ? (e.weightKg * e.bodyFatPct) / 100 : null);
/** Skeletal muscle kg of an entry (kg or weight × %). */
const smKgOf = (e) => (isNum(e.skeletalMuscleKg) ? e.skeletalMuscleKg : isNum(e.weightKg) && isNum(e.skeletalMusclePct) ? (e.weightKg * e.skeletalMusclePct) / 100 : null);
const COMP_GETTERS = {
  weightKg: (e) => (isNum(e.weightKg) ? e.weightKg : null),
  fatKg: fatKgOf,
  bodyFatPct: (e) => (isNum(e.bodyFatPct) ? e.bodyFatPct : null),
  muscleKg: (e) => (isNum(e.muscleKg) ? e.muscleKg : null),
  skeletalMuscleKg: smKgOf,
  visceralFat: (e) => (isNum(e.visceralFat) ? e.visceralFat : null),
};

/** Mean of a getter over entries in [from, to]. */
const blockMean = (log, get, from, to) => mean((log || []).filter((e) => e && e.date >= from && e.date <= to).map(get).filter(isNum));

/**
 * Change of one window: mean of the last 7 days vs. mean of the first 7 days of a `weeks`-week window ending today.
 * @returns {{weeks: number, from: string, to: string, delta: Record<string, number|null>, start: Record<string, number|null>, end: Record<string, number|null>}}
 */
function compWindow(log, today, weeks) {
  const from = addDays(today, -(weeks * 7 - 1));
  const startTo = addDays(from, 6);
  const endFrom = addDays(today, -6);
  const start = {}, end = {}, delta = {};
  for (const [k, get] of Object.entries(COMP_GETTERS)) {
    start[k] = r2(blockMean(log, get, from, startTo));
    end[k] = r2(blockMean(log, get, endFrom, today));
    delta[k] = start[k] != null && end[k] != null ? r2(end[k] - start[k]) : null;
  }
  return { weeks, from, to: today, start, end, delta };
}

const STATUS_LABELS = {
  'recomp': 'Fett verloren, Muskeln aufgebaut',
  'fat-lost-muscle-kept': 'Fett verloren, Muskeln gehalten',
  'fat-and-muscle-lost': 'Fett und Muskeln verloren',
  'fat-lost': 'Fett verloren',
  'muscle-lost': 'Muskelmasse gesunken',
  'fat-gained': 'Fettmasse gestiegen',
  'stable': 'Stabil',
  'insufficient': 'Noch zu wenige Messungen',
};

/**
 * Body-composition trend over 2 and 4 weeks (weight, fat kg, muscle / skeletal muscle kg, visceral fat).
 * Classification uses the 4-week window when it has start and end values, else the 2-week one.
 * Muscle = skeletal muscle kg if available, else muscle mass kg.
 * @param {import('../types.js').HealthEntry[]} log
 * @param {string} today
 * @returns {{status: 'recomp'|'fat-lost-muscle-kept'|'fat-and-muscle-lost'|'fat-lost'|'muscle-lost'|'fat-gained'|'stable'|'insufficient',
 *   label: string, text: string, tips: string[], caution: string, basis: 2|4|null,
 *   windows: {weeks: number, from: string, to: string, delta: Record<string, number|null>, start: Record<string, number|null>, end: Record<string, number|null>}[],
 *   latest: {date: string, weightKg?: number, bodyFatPct?: number, fatKg?: number, skeletalMuscleKg?: number, muscleKg?: number, visceralFat?: number}|null}}
 */
export function bodyCompositionInsight(log, today) {
  const list = (Array.isArray(log) ? log : []).filter((e) => e && typeof e.date === 'string' && e.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const windows = [compWindow(list, today, 2), compWindow(list, today, 4)];
  const lastComp = list.filter((e) => fatKgOf(e) != null || smKgOf(e) != null || isNum(e.muscleKg) || isNum(e.visceralFat)).at(-1);
  const latest = lastComp ? { date: lastComp.date } : null;
  if (lastComp) {
    for (const [k, get] of Object.entries(COMP_GETTERS)) { const v = get(lastComp); if (v != null) latest[k] = r2(v); }
  }
  const caution = BIA_CAUTION;
  const pick = [windows[1], windows[0]].find((w) => w.delta.fatKg != null || w.delta.weightKg != null);
  if (!pick || pick.delta.fatKg == null) {
    const w = pick?.delta.weightKg;
    const text = w == null ? 'Für einen Trend bitte mindestens 2 Wochen lang regelmäßig mit der Körperanalyse-Waage messen.'
      : `Gewicht ${w <= 0 ? '−' : '+'}${de(Math.abs(w), 1)} kg in ${pick.weeks} Wochen – für Fett und Muskeln fehlen noch Waagenwerte am Anfang und Ende des Zeitraums.`;
    return { status: 'insufficient', label: STATUS_LABELS.insufficient, text, tips: [], caution, basis: null, windows, latest };
  }
  const d = pick.delta;
  const muscle = d.skeletalMuscleKg ?? d.muscleKg;
  const muscleName = d.skeletalMuscleKg != null ? 'Skelettmuskulatur' : 'Muskelmasse';
  const T = COMP_TOLERANCE;
  let status;
  if (d.fatKg <= -T.fatKg) {
    if (muscle == null) status = 'fat-lost';
    else if (muscle >= T.muscleKg) status = 'recomp';
    else if (muscle > -T.muscleKg) status = 'fat-lost-muscle-kept';
    else status = 'fat-and-muscle-lost';
  } else if (d.fatKg >= T.fatKg) status = 'fat-gained';
  else status = muscle != null && muscle <= -T.muscleKg ? 'muscle-lost' : 'stable';
  const sg = (v, u = 'kg', dg = 1) => `${v < 0 ? '−' : v > 0 ? '+' : '±'}${de(Math.abs(v), dg)}${u ? ' ' + u : ''}`;
  const parts = [];
  if (d.weightKg != null) parts.push(`Gewicht ${sg(d.weightKg)}`);
  parts.push(`Fett ${sg(d.fatKg)}`);
  if (muscle != null) parts.push(`${muscleName} ${sg(muscle)}`);
  if (d.visceralFat != null) parts.push(`Viszeralfett ${sg(d.visceralFat, '', 1)}`);
  const text = `${STATUS_LABELS[status]}: ${parts.join(', ')} in ${pick.weeks} Wochen (Wochenmittel).`;
  const tips = [];
  if (status === 'fat-and-muscle-lost' || status === 'muscle-lost') tips.push('Um Muskeln vor der OP zu erhalten: Krafttraining regelmäßig weiterführen, genug Eiweiß essen und das Defizit nicht zu groß wählen.');
  if (status === 'fat-lost-muscle-kept' || status === 'recomp') tips.push('Genau so soll es sein – Muskeln sind dein Polster für die Reha nach der OP.');
  if (status === 'fat-gained') tips.push('Einzelne Wochen schwanken – schau auf den Verlauf über 4 Wochen.');
  if (d.weightKg != null && d.weightKg / pick.weeks < -1) tips.push('Du nimmst sehr schnell ab (> 1 kg/Woche) – das kostet oft Muskeln.');
  return { status, label: STATUS_LABELS[status], text, tips, caution, basis: pick.weeks, windows, latest };
}
