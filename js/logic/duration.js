// Duration estimates for exercises, workouts and session plans. PURE. See docs/SPEC.md §12.3, §15.4.
//
// Model (per exercise entry):
//   work per set  = reps × tempoSeconds            (type "reps"; tempo "3-1-2" → 6 s, no tempo → 3 s/rep)
//                 = reps × hold + (reps−1) × relax  (type "hold"; relax = max(level.restBetween ?? 5,
//                                                    settings.holdRelaxSeconds ?? 5))
//                 = seconds (Σ level.phases when given)   (type "timed")
//   perSide       → work × 2 (+ SIDE_SWITCH_SEC per set)
//   prep          = settings.prepSeconds ?? 5 per set („Bereit machen“, v4); 0 for block "cardio"
//   rests         = (sets − 1) × rest  (rest = settings.restDefault if set and level.rest > 0, else level.rest)
//   setup         = exercise.setupSec ?? SETUP_SEC (20 s) per exercise; 0 for block "cardio"
// Workout minutes = ceil(Σ seconds / 60).

import { levelOf } from './progression.js';

export const SETUP_SEC = 20;
export const SIDE_SWITCH_SEC = 5;
export const DEFAULT_REP_SEC = 3;
/** v4: minimum pause between two hold reps (and default `restBetween`). */
export const DEFAULT_HOLD_REST_SEC = 5;
/** v4: „Bereit machen“ phase before every set (settings.prepSeconds). */
export const DEFAULT_PREP_SEC = 5;
/** v4: „Loslassen“ phase between hold reps, minimum (settings.holdRelaxSeconds). */
export const DEFAULT_HOLD_RELAX_SEC = 5;
/** Custom workouts (and content workouts without `maxMinutes`) should stay ≤ this (user goal: max 30 min). */
export const MAX_SESSION_MIN = 30;
/** v4: content strength workouts incl. mobility warm-up + stretching (`workout.maxMinutes` in workouts.json). */
export const STRENGTH_SESSION_MIN = 32;
/** v4: strength sessions that start with the 10-min rowing warm-up. */
export const MAX_SESSION_WITH_ROW_MIN = 42;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** "3-1-2" → 6, invalid/null → null. @param {string|null|undefined} tempo */
export function tempoSeconds(tempo) {
  if (typeof tempo !== 'string') return null;
  const parts = tempo.split('-').map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : null;
}

/**
 * Effective level values of an entry (level + override + plannedSets).
 * @param {{level?: number, plannedSets?: number, override?: object}|null|undefined} entry
 * @param {import('../types.js').Exercise} exercise
 * @param {import('../types.js').Settings} [settings]
 */
export function effectiveDose(entry, exercise, settings) {
  const levels = exercise?.levels || [];
  const li = Math.max(0, Math.min(levels.length - 1, entry?.level ?? 0));
  const lvl = levels[li] || {};
  const o = entry?.override || {};
  const baseRest = isNum(lvl.rest) ? lvl.rest : 30;
  const def = settings?.restDefault;
  return {
    sets: Math.max(1, isNum(entry?.plannedSets) ? entry.plannedSets : (lvl.sets ?? 1)),
    reps: o.reps ?? lvl.reps ?? null,
    hold: o.hold ?? lvl.hold ?? null,
    seconds: o.seconds ?? lvl.seconds ?? null,
    tempo: lvl.tempo ?? null,
    rest: isNum(def) && def >= 0 && baseRest !== 0 ? def : baseRest,
    restBetween: Math.max(isNum(lvl.restBetween) ? lvl.restBetween : DEFAULT_HOLD_REST_SEC, holdRelaxSeconds(settings)),
    prep: exercise?.block === 'cardio' ? 0 : prepSeconds(settings),
    phases: Array.isArray(lvl.phases) && lvl.phases.length ? lvl.phases : null,
  };
}

/** settings.prepSeconds (0–30, default 5). @param {import('../types.js').Settings} [settings] */
export function prepSeconds(settings) {
  const v = settings?.prepSeconds;
  return isNum(v) && v >= 0 ? Math.min(30, v) : DEFAULT_PREP_SEC;
}

/** settings.holdRelaxSeconds (0–30, default 5). @param {import('../types.js').Settings} [settings] */
export function holdRelaxSeconds(settings) {
  const v = settings?.holdRelaxSeconds;
  return isNum(v) && v >= 0 ? Math.min(30, v) : DEFAULT_HOLD_RELAX_SEC;
}

/** Setup seconds of an exercise: `exercise.setupSec` (flows/stretches: 5) else 20; rowing 0. */
export function setupSeconds(exercise) {
  if (exercise?.block === 'cardio') return 0;
  return isNum(exercise?.setupSec) && exercise.setupSec >= 0 ? exercise.setupSec : SETUP_SEC;
}

/**
 * Estimated seconds for one exercise entry.
 * @param {{level?: number, plannedSets?: number, override?: object, skipped?: boolean}|null|undefined} entry
 *   session entry or `{ level }` (missing → level 0, level's own set count)
 * @param {import('../types.js').Exercise} exercise
 * @param {import('../types.js').Settings} [settings]
 * @returns {number} seconds (0 for unknown exercise)
 */
export function estimateExerciseSeconds(entry, exercise, settings) {
  if (!exercise || !exercise.levels?.length) return 0;
  const d = effectiveDose(entry, exercise, settings);
  let work;
  if (exercise.type === 'timed') work = d.phases && noSecondsOverride(entry) ? d.phases.reduce((a, p) => a + (p.seconds || 0), 0) : d.seconds ?? 30;
  else if (exercise.type === 'hold') {
    const reps = Math.max(1, d.reps ?? 1);
    work = reps * (d.hold ?? 10) + (reps - 1) * d.restBetween;
  } else {
    const reps = Math.max(1, d.reps ?? 10);
    work = reps * (tempoSeconds(d.tempo) ?? DEFAULT_REP_SEC);
  }
  const perSide = exercise.side === 'perSide';
  const perSet = (perSide ? work * 2 + SIDE_SWITCH_SEC : work) + d.prep;
  return Math.round(d.sets * perSet + (d.sets - 1) * d.rest + setupSeconds(exercise));
}

/** true unless the entry overrides `seconds` (an override wins over the level's phase list). */
const noSecondsOverride = (entry) => entry?.override?.seconds == null;

/**
 * All workout items in session order with their section.
 * v4 `rowWarmup: true` (only when the workout has `rowWarmup` = rowing exercise id): the rowing block comes first
 * (section "cardio"), followed only by the warm-up items marked `keepWithRow: true`.
 * Phase/availability checks are the caller's job (buildSessionPlan uses `canRowWarmup`).
 * @param {import('../types.js').Workout} w
 * @param {{rowWarmup?: boolean}} [opts]
 */
export function workoutItems(w, { rowWarmup = false } = {}) {
  const row = rowWarmup && typeof w?.rowWarmup === 'string';
  return [
    ...(row ? [{ exerciseId: w.rowWarmup, section: 'cardio' }] : []),
    ...(w?.warmup || []).filter((it) => !row || it.keepWithRow).map((it) => ({ ...it, section: 'warmup' })),
    ...(w?.blocks || []).flatMap((b) => (b.items || []).map((it) => ({ ...it, section: b.id }))),
    ...(w?.cooldown || []).map((it) => ({ ...it, section: 'cooldown' })),
  ];
}

/**
 * Estimated seconds of a workout (definition) or a session plan (`{exercises: [...]}`).
 * - Session plan: uses each entry's level/plannedSets/override; skipped entries count 0.
 * - Workout: level from `state.exerciseLevels` (levelOf), sets capped by `item.maxSets` /
 *   `workout.maxSets` (same rule as buildSessionPlan), items failing phaseMin for the current
 *   phase (`state.phaseId`, else workout.phaseId) are left out like buildSessionPlan does.
 * @param {import('../types.js').Workout|import('../types.js').Session} workoutOrPlan
 * @param {import('../types.js').Content} content
 * @param {import('../types.js').State} [state]
 * @param {import('../types.js').Settings} [settings]
 * @param {{rowWarmup?: boolean}} [opts] v4: estimate the variant with the rowing warm-up (workouts with `rowWarmup`)
 * @returns {number}
 */
export function estimateWorkoutSeconds(workoutOrPlan, content, state, settings, opts = {}) {
  const exById = new Map((content?.exercises || []).map((e) => [e.id, e]));
  if (Array.isArray(workoutOrPlan?.exercises)) {
    let sum = 0;
    for (const e of workoutOrPlan.exercises) if (!e?.skipped) sum += estimateExerciseSeconds(e, exById.get(e.exerciseId), settings);
    return sum;
  }
  const w = /** @type {import('../types.js').Workout} */ (workoutOrPlan);
  const order = (id) => (content?.phases || []).find((p) => p.id === id)?.order ?? null;
  const cur = order(state?.phaseId ?? w?.phaseId) ?? order(w?.phaseId);
  let sum = 0;
  for (const it of workoutItems(w, opts)) {
    const ex = exById.get(it.exerciseId);
    if (!ex) continue;
    if (it.shoulderOnly && settings?.shoulderImpingement !== true) continue; // v5.3
    const min = order(ex.phaseMin);
    if (cur != null && min != null && cur < min && w?.kind !== 'custom') continue;
    const level = levelOf(state, it.exerciseId, ex);
    sum += estimateExerciseSeconds({ level, plannedSets: cappedSets(ex.levels[level]?.sets ?? 1, it, w), ...(it.override ? { override: it.override } : {}) }, ex, settings);
  }
  return sum;
}

/**
 * Estimated minutes (rounded up) of a workout or a session plan. See estimateWorkoutSeconds.
 * @returns {number}
 */
export function estimateWorkoutMinutes(workoutOrPlan, content, state, settings, opts) {
  return Math.ceil(estimateWorkoutSeconds(workoutOrPlan, content, state, settings, opts) / 60);
}

/**
 * Planned set count after the content caps: min(levelSets, item.maxSets ?? workout.maxSets ?? ∞), ≥ 1.
 * @param {number} levelSets
 * @param {{maxSets?: number}} [item]
 * @param {{maxSets?: number}} [workout]
 */
export function cappedSets(levelSets, item, workout) {
  const cap = isNum(item?.maxSets) ? item.maxSets : isNum(workout?.maxSets) ? workout.maxSets : Infinity;
  return Math.max(1, Math.min(levelSets ?? 1, cap));
}

/**
 * Trim a session plan in place until its estimate ≤ maxMinutes: repeatedly removes one set from the
 * entry with the most planned sets (> 1; knee/archery/custom main blocks before warmup/cooldown; rowing (`cardio`) never;
 * ties → the longest entry). Trimmed entries get `trimmed: true`. Never removes exercises.
 * @param {import('../types.js').Session} plan
 * @param {import('../types.js').Content} content
 * @param {import('../types.js').Settings} [settings]
 * @param {number} [maxMinutes]
 * @returns {import('../types.js').Session} the same plan object
 */
export function fitPlanToMinutes(plan, content, settings, maxMinutes = MAX_SESSION_MIN) {
  const exById = new Map((content?.exercises || []).map((e) => [e.id, e]));
  const limit = maxMinutes * 60;
  const secs = () => estimateWorkoutSeconds(plan, content, null, settings);
  let guard = 200;
  while (secs() > limit && guard-- > 0) {
    let best = null;
    let bestKey = null;
    for (const e of plan.exercises || []) {
      if (e.skipped || (e.plannedSets ?? 1) <= 1 || e.section === 'cardio') continue; // v4: rowing blocks are never trimmed
      const main = e.section !== 'warmup' && e.section !== 'cooldown' ? 1 : 0;
      const key = [main, e.plannedSets, estimateExerciseSeconds(e, exById.get(e.exerciseId), settings)];
      if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
        best = e;
        bestKey = key;
      }
    }
    if (!best) break;
    best.plannedSets -= 1;
    best.trimmed = true;
  }
  return plan;
}
