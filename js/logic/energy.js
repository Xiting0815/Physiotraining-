// Energy estimate per session (kcal). PURE. All numbers are ESTIMATES („Schätzung“). See docs/SPEC.md §12.6, §14.
import { isCardioSession } from './stats.js';
import { estimateExerciseSeconds } from './duration.js';

/** Strength/short/custom: if the measured active time is below this share of the estimate, use the estimate. */
export const MIN_CLOCK_SHARE = 0.5;

/** MET values used for sessions. */
export const MET = { strength: 3.5, kneeRehab: 2.8, rowModerate: 4.8, rowVigorous: 7.0, rowEasy: 3.5 };
export const DEFAULT_WEIGHT_KG = 80;
export const ESTIMATE_LABEL = 'Schätzung';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;

/** Body weight for the kcal estimate: settings.profile.weightKg (number) or null. */
export function bodyWeightKg(settings) {
  const kg = settings?.profile?.weightKg;
  return isNum(kg) && kg > 0 ? kg : null;
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
 * @param {number|null} [weightKg] body weight in kg (settings.profile.weightKg; default 80)
 * @param {import('../types.js').Content} [content] optional, to read rowing level intensity
 * @returns {{kcal: number, method: 'display'|'watt'|'met', met: number|null, label: string, durationSource?: 'clock'|'estimate'}}
 */
export function sessionKcal(session, weightKg, content) {
  const kg = isNum(weightKg) && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  let sec = sessionDurationSec(session);
  let durationSource = 'clock';
  if (isCardioSession(session) && !(sec > 0)) {
    // no rowing time entered and no clock time: use the planned rowing time (still a „Schätzung“)
    // (timer sections skipped right away are stored as skipped – then use the whole plan)
    const all = session.exercises || [];
    const entries = all.some((e) => !e.skipped) ? all.filter((e) => !e.skipped) : all;
    const est = performedSeconds(entries.map((e) => ({ ...e, sets: (e.sets || []).length ? e.sets.map(() => ({ done: true })) : [{ done: true }] })), content);
    if (est > 0) { sec = est; durationSource = 'estimate'; }
  }
  const h = sec / 3600;
  if (isCardioSession(session)) {
    const r = session.rowing || {};
    if (isNum(r.kcalDisplay) && r.kcalDisplay > 0) return { kcal: Math.round(r.kcalDisplay), method: 'display', met: null, label: ESTIMATE_LABEL };
    if (isNum(r.avgWatt) && r.avgWatt > 0 && h > 0) return { kcal: Math.round((4 * r.avgWatt + 300) * h), method: 'watt', met: null, label: ESTIMATE_LABEL, durationSource };
    const main = (session.exercises || []).find((e) => e.section === 'cardio');
    const ex = (content?.exercises || []).find((x) => x.id === main?.exerciseId);
    const intensity = ex?.levels?.[main?.level ?? 0]?.intensity;
    const rpe = session.post?.rpe ?? main?.rpe;
    const met = intensity === 'vigorous' || (isNum(rpe) && rpe >= 7) ? MET.rowVigorous : MET.rowModerate;
    return { kcal: Math.round(met * kg * h), method: 'met', met, label: ESTIMATE_LABEL, durationSource };
  }
  const performed = (session?.exercises || []).filter((e) => !e.skipped && (e.sets || []).some((x) => x?.done));
  const knee = performed.filter((e) => e.section === 'knee').length;
  const share = performed.length ? knee / performed.length : 0.5;
  const met = r2((MET.kneeRehab * share + MET.strength * (1 - share)) * rpeFactor(session?.post?.rpe));
  // Wall-clock time can be far too short (e.g. sets ticked off quickly, session logged afterwards).
  // Fall back to the duration estimate of the performed sets when the clock shows < 50 % of it.
  const estSec = performedSeconds(performed, content);
  const useEstimate = estSec > 0 && sec < estSec * MIN_CLOCK_SHARE;
  const hours = useEstimate ? estSec / 3600 : h;
  return { kcal: Math.round(met * kg * hours), method: 'met', met, label: ESTIMATE_LABEL, durationSource: useEstimate ? 'estimate' : 'clock' };
}

/** Estimated seconds of the done sets (duration.js model) – 0 without content. */
function performedSeconds(performed, content) {
  const byId = new Map((content?.exercises || []).map((e) => [e.id, e]));
  let sum = 0;
  for (const e of performed) {
    const ex = byId.get(e.exerciseId);
    if (!ex) continue;
    const done = (e.sets || []).filter((x) => x?.done).length;
    sum += estimateExerciseSeconds({ level: e.level, override: e.override, plannedSets: done }, ex);
  }
  return sum;
}
