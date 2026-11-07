// Energy & weight goal estimates. PURE. All numbers are ESTIMATES („Schätzung“). See docs/SPEC.md §12.6.
import { addDays, daysBetween } from '../util/date.js';
import { isCardioSession } from './stats.js';

export const ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
export const ACTIVITY_LABELS = { sedentary: 'Überwiegend sitzend', light: 'Leicht aktiv', moderate: 'Mäßig aktiv', active: 'Sehr aktiv' };
/** MET values used for sessions. */
export const MET = { strength: 3.5, kneeRehab: 2.8, rowModerate: 4.8, rowVigorous: 7.0, rowEasy: 3.5 };
export const KCAL_PER_KG = 7700;
export const MAX_SAFE_KG_PER_WEEK = 0.75;
export const DEFICIT_MIN = 500;
export const DEFICIT_MAX = 750;
export const KCAL_FLOOR = { m: 1500, w: 1200, d: 1350 };
export const DEFAULT_WEIGHT_KG = 80;
export const ESTIMATE_LABEL = 'Schätzung';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/** Age in whole years in the year of `today`. */
export function ageFrom(profile, today) {
  const y = Number(String(today ?? '').slice(0, 4));
  return isNum(profile?.birthYear) && y ? y - profile.birthYear : null;
}

/**
 * BMR (Mifflin–St Jeor): 10·kg + 6.25·cm − 5·age + s, s = +5 (m), −161 (w), −78 (d = mean). null if incomplete.
 * @param {import('../types.js').Profile} profile @param {number} weightKg @param {string} today
 */
export function bmr(profile, weightKg, today) {
  const age = ageFrom(profile, today);
  if (!isNum(profile?.heightCm) || !isNum(weightKg) || age == null) return null;
  const s = profile.sex === 'm' ? 5 : profile.sex === 'w' ? -161 : -78;
  return Math.round(10 * weightKg + 6.25 * profile.heightCm - 5 * age + s);
}

/** TDEE = BMR × activity factor (default "light"). */
export function tdee(profile, weightKg, today) {
  const b = bmr(profile, weightKg, today);
  if (b == null) return null;
  return Math.round(b * (ACTIVITY_FACTORS[profile?.activityLevel] ?? ACTIVITY_FACTORS.light));
}

/** BMI or null. */
export function bmi(weightKg, heightCm) {
  if (!isNum(weightKg) || !isNum(heightCm) || heightCm <= 0) return null;
  return r1(weightKg / (heightCm / 100) ** 2);
}

/** Active duration of a session in seconds (rowing.durationSec for cardio, else ended − started − paused). */
export function sessionDurationSec(session) {
  if (isNum(session?.rowing?.durationSec)) return session.rowing.durationSec;
  if (!session?.startedAt || !session?.endedAt) return 0;
  const ms = Date.parse(session.endedAt) - Date.parse(session.startedAt) - (session.pausedMs || 0);
  return Math.max(0, Math.round(ms / 1000));
}

/** RPE multiplier for strength MET: ≤ 3 → 0.85, 4–6 → 1, 7–8 → 1.15, ≥ 9 → 1.25. */
export const rpeFactor = (rpe) => (!isNum(rpe) ? 1 : rpe <= 3 ? 0.85 : rpe <= 6 ? 1 : rpe <= 8 ? 1.15 : 1.25);

/**
 * Estimated kcal of a session (gross, incl. resting metabolism during the session).
 * - cardio: (1) display kcal if entered → method "display"; (2) avg watts → Concept2-style
 *   kcal/h = 4·W + 300 → "watt"; (3) MET by intensity (vigorous 7.0 if RPE ≥ 7 or main level is vigorous,
 *   else moderate 4.8) × kg × h → "met".
 * - strength/short/custom: MET = 2.8·kneeShare + 3.5·(1 − kneeShare) (kneeShare = share of performed knee
 *   entries), × rpeFactor(post.rpe), × kg × h → "met".
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Profile} [profile]
 * @param {number|null} [latestWeight] kg (default 80)
 * @param {import('../types.js').Content} [content] optional, to read rowing level intensity
 * @returns {{kcal: number, method: 'display'|'watt'|'met', met: number|null, label: string}}
 */
export function sessionKcal(session, profile, latestWeight, content) {
  const kg = isNum(latestWeight) ? latestWeight : DEFAULT_WEIGHT_KG;
  const sec = sessionDurationSec(session);
  const h = sec / 3600;
  if (isCardioSession(session)) {
    const r = session.rowing || {};
    if (isNum(r.kcalDisplay) && r.kcalDisplay > 0) return { kcal: Math.round(r.kcalDisplay), method: 'display', met: null, label: ESTIMATE_LABEL };
    if (isNum(r.avgWatt) && r.avgWatt > 0 && h > 0) return { kcal: Math.round((4 * r.avgWatt + 300) * h), method: 'watt', met: null, label: ESTIMATE_LABEL };
    const main = (session.exercises || []).find((e) => e.section === 'cardio');
    const ex = (content?.exercises || []).find((x) => x.id === main?.exerciseId);
    const intensity = ex?.levels?.[main?.level ?? 0]?.intensity;
    const rpe = session.post?.rpe ?? main?.rpe;
    const met = intensity === 'vigorous' || (isNum(rpe) && rpe >= 7) ? MET.rowVigorous : MET.rowModerate;
    return { kcal: Math.round(met * kg * h), method: 'met', met, label: ESTIMATE_LABEL };
  }
  const performed = (session?.exercises || []).filter((e) => !e.skipped && (e.sets || []).some((x) => x?.done));
  const knee = performed.filter((e) => e.section === 'knee').length;
  const share = performed.length ? knee / performed.length : 0.5;
  const met = r2((MET.kneeRehab * share + MET.strength * (1 - share)) * rpeFactor(session?.post?.rpe));
  return { kcal: Math.round(met * kg * h), method: 'met', met, label: ESTIMATE_LABEL };
}

/** Weights of the log as {date, kg}, oldest first. */
const weights = (log) => (Array.isArray(log) ? log : []).filter((e) => e && isNum(e.weightKg)).map((e) => ({ date: e.date, kg: e.weightKg })).sort((a, b) => (a.date < b.date ? -1 : 1));

/**
 * Current weight = mean of entries in the last 7 days (today−6 … today); fallback latest entry ≤ today.
 * @returns {number|null}
 */
export function currentWeight(healthLog, today) {
  const w = weights(healthLog).filter((x) => x.date <= today);
  const last7 = w.filter((x) => x.date >= addDays(today, -6));
  if (last7.length) return r2(last7.reduce((a, x) => a + x.kg, 0) / last7.length);
  return w.length ? w.at(-1).kg : null;
}

/**
 * Least-squares line over weights in the last `days` days. slope in kg/day.
 * @returns {{slopePerDay: number, kgPerWeek: number, intercept: number, n: number, from: string}|null} null with < 4 points
 */
export function weightTrend(healthLog, today, days = 21) {
  const from = addDays(today, -(days - 1));
  const pts = weights(healthLog).filter((x) => x.date >= from && x.date <= today);
  if (pts.length < 4) return null;
  const xs = pts.map((p) => daysBetween(from, p.date));
  const ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slopePerDay: slope, kgPerWeek: r2(slope * 7), intercept: my - slope * mx, n: pts.length, from };
}

/**
 * Weight goal progress.
 * @param {import('../types.js').HealthEntry[]} healthLog
 * @param {import('../types.js').WeightGoal|null} goal
 * @param {string} today
 * @param {import('../types.js').Profile} [profile] for the target-BMI warning
 * @returns {null|{currentKg: number|null, startKg: number, targetKg: number, lostKg: number|null, remainingKg: number|null,
 *   ratio: number, daysLeft: number, requiredKgPerWeek: number|null, trendKgPerWeek: number|null, onTrack: boolean|null,
 *   projectedDate: string|null, reached: boolean, warnings: string[]}}
 */
export function goalProgress(healthLog, goal, today, profile) {
  if (!goal || !isNum(goal.targetKg)) return null;
  const currentKg = currentWeight(healthLog, today);
  const startKg = isNum(goal.startKg) ? goal.startKg : (weights(healthLog)[0]?.kg ?? currentKg);
  const warnings = [];
  const daysLeft = goal.targetDate ? daysBetween(today, goal.targetDate) : 0;
  const lostKg = currentKg != null && startKg != null ? r2(startKg - currentKg) : null;
  const remainingKg = currentKg != null ? r2(Math.max(0, currentKg - goal.targetKg)) : null;
  const total = startKg != null ? startKg - goal.targetKg : 0;
  const ratio = total > 0 && lostKg != null ? Math.max(0, Math.min(1, lostKg / total)) : (remainingKg === 0 ? 1 : 0);
  const reached = remainingKg === 0 && currentKg != null;
  const requiredKgPerWeek = remainingKg == null ? null : remainingKg === 0 ? 0 : daysLeft > 0 ? r2(remainingKg / (daysLeft / 7)) : null;
  if (requiredKgPerWeek != null && requiredKgPerWeek > MAX_SAFE_KG_PER_WEEK) warnings.push('Das nötige Tempo liegt über 0,75 kg pro Woche – ein späteres Zieldatum ist gesünder und schont die Muskulatur.');
  if (!reached && daysLeft <= 0 && goal.targetDate) warnings.push('Das Zieldatum ist erreicht – setz dir gern ein neues Datum.');
  const tBmi = bmi(goal.targetKg, profile?.heightCm);
  if (tBmi != null && tBmi < 18.5) warnings.push(`Das Zielgewicht entspricht einem BMI von ${String(tBmi).replace('.', ',')} (< 18,5, Untergewicht) – bitte ärztlich besprechen.`);
  const trend = weightTrend(healthLog, today);
  let projectedDate = null;
  if (trend && trend.slopePerDay < 0 && currentKg != null && !reached) {
    const days = Math.ceil((currentKg - goal.targetKg) / -trend.slopePerDay);
    if (days < 3650) projectedDate = addDays(today, days);
  }
  let onTrack = null;
  if (reached) onTrack = true;
  else if (projectedDate && goal.targetDate) onTrack = projectedDate <= goal.targetDate;
  else if (trend) onTrack = false;
  return { currentKg, startKg, targetKg: goal.targetKg, lostKg, remainingKg, ratio, daysLeft, requiredKgPerWeek,
    trendKgPerWeek: trend ? trend.kgPerWeek : null, onTrack, projectedDate, reached, warnings };
}

/**
 * Suggested daily calorie target („Schätzung“): TDEE − deficit, deficit = requiredKgPerWeek·7700/7 clamped to
 * 500–750 kcal (0 when the goal is reached / no goal), never below 1500 (m) / 1200 (w) / 1350 (d).
 * @returns {null|{kcal: number, tdee: number, deficit: number, floorApplied: boolean, label: string}}
 */
export function calorieTarget(profile, healthLog, goal, today) {
  const kg = currentWeight(healthLog, today);
  const t = tdee(profile, kg ?? NaN, today);
  if (t == null) return null;
  const gp = goalProgress(healthLog, goal, today, profile);
  let deficit = 0;
  if (gp && !gp.reached && gp.remainingKg > 0) {
    const want = gp.requiredKgPerWeek != null ? (gp.requiredKgPerWeek * KCAL_PER_KG) / 7 : DEFICIT_MIN;
    deficit = Math.round(Math.max(DEFICIT_MIN, Math.min(DEFICIT_MAX, want)));
  }
  const floor = KCAL_FLOOR[profile?.sex] ?? KCAL_FLOOR.d;
  let kcal = t - deficit;
  const floorApplied = kcal < floor;
  if (floorApplied) kcal = floor;
  return { kcal: Math.round(kcal), tdee: t, deficit: Math.round(t - kcal), floorApplied, label: ESTIMATE_LABEL };
}

/**
 * Sum of estimated session kcal per day (done sessions) – for "Heute verbrannt" / weekly charts.
 * @returns {Record<string, number>} date → kcal
 */
export function kcalByDay(sessions, profile, healthLog, content, dayOf) {
  const out = {};
  for (const s of (sessions || []).filter((x) => x?.status === 'done')) {
    const d = dayOf(s);
    const kg = currentWeight(healthLog, d);
    out[d] = (out[d] ?? 0) + sessionKcal(s, profile, kg, content).kcal;
  }
  return out;
}
