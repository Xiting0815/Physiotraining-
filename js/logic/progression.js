// Workout rotation, levels, phases. PURE. See docs/SPEC.md §5.3, §7.7.
import { addDays, daysBetween, startOfIsoWeek, todayISO } from '../util/date.js';
import { dayOf, doneSessions, sessionLight, sessionsPerWeek, streak } from './stats.js';
import { cappedSets, fitPlanToMinutes, workoutItems, MAX_SESSION_MIN, MAX_SESSION_WITH_ROW_MIN } from './duration.js';

/** Workout kinds (v2). Missing `kind` = "strength". */
export const WORKOUT_KINDS = ['strength', 'short', 'cardio', 'custom'];
/** @param {{kind?: string}|null|undefined} w */
export const workoutKind = (w) => w?.kind ?? 'strength';

/**
 * Look up any workout by id: content workouts (strength/short/cardio) first, then
 * `state.customWorkouts` (converted with toWorkout-like normalisation: kind "custom", phaseId = state.phaseId).
 * @param {string} id
 * @param {import('../types.js').Content} content
 * @param {import('../types.js').State} [state]
 * @returns {import('../types.js').Workout|undefined}
 */
export function getWorkout(id, content, state) {
  const w = (content?.workouts || []).find((x) => x.id === id);
  if (w) return w;
  const c = (state?.customWorkouts || []).find((x) => x.id === id);
  if (!c) return undefined;
  return { maxMinutes: 30, ...c, kind: 'custom', phaseId: state?.phaseId ?? c.phaseId ?? null, durationMin: c.durationMin ?? 0,
    warmup: c.warmup || [], blocks: c.blocks || [], cooldown: c.cooldown || [] };
}

/** Phase of the state (or first phase). */
export function currentPhase(state, phases) {
  return (phases || []).find((p) => p.id === state?.phaseId) ?? (phases || [])[0];
}

/** Workouts of a phase by kind: `{ rotation: [A,B,C], short: Workout|null, cardio: Workout[] }`. */
export function phaseWorkouts(phase, workouts) {
  const find = (id) => (workouts || []).find((w) => w.id === id);
  return {
    rotation: phase ? ['A', 'B', 'C'].map((k) => find(phase.workouts?.[k])).filter(Boolean) : [],
    short: phase?.short ? find(phase.short) ?? null : null,
    cardio: (phase?.cardio || []).map(find).filter(Boolean),
  };
}

/**
 * Is an exercise available in a phase for this user?
 * - `state.exerciseToggles[id] === false` → never (user disabled it);
 * - post-op phase (`phase.kind === "postop"`): `exercise.postOpAllowed === false` → only if the user explicitly
 *   enabled it (`exerciseToggles[id] === true`, per their surgeon/physio protocol).
 * @param {import('../types.js').Exercise} exercise
 * @param {import('../types.js').Phase|undefined} phase
 * @param {import('../types.js').State} [state]
 * @returns {boolean}
 */
export function exerciseAvailable(exercise, phase, state) {
  if (!exercise) return false;
  const t = state?.exerciseToggles?.[exercise.id];
  if (t === false) return false;
  if (phase?.kind === 'postop' && exercise.postOpAllowed === false) return t === true;
  return true;
}

/**
 * Rotation after finishing `finishedWorkoutId`: A→B→C→A when it is one of the phase's A/B/C workouts,
 * otherwise (cardio / short / custom) `state.nextWorkoutId` stays unchanged.
 * Use this instead of `advanceWorkout({...state, nextWorkoutId: finishedId}, phase)` (which resets to A for
 * non-rotation ids).
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Phase} phase
 * @param {string} finishedWorkoutId
 * @returns {string}
 */
export function rotationAfter(state, phase, finishedWorkoutId) {
  const order = [phase?.workouts?.A, phase?.workouts?.B, phase?.workouts?.C];
  if (!order.includes(finishedWorkoutId)) return state?.nextWorkoutId ?? order[0];
  return advanceWorkout({ ...state, nextWorkoutId: finishedWorkoutId }, phase);
}

/**
 * @param {import('../types.js').State} state
 * @param {string} exerciseId
 * @param {import('../types.js').Exercise} [exercise]
 * @returns {number} clamped 0-based level index
 */
export function levelOf(state, exerciseId, exercise) {
  const v = state?.exerciseLevels?.[exerciseId];
  const raw = Number.isInteger(v) ? v : 0;
  const max = exercise?.levels?.length ? exercise.levels.length - 1 : Infinity;
  return Math.max(0, Math.min(max, raw));
}

/**
 * Next workout by `state.nextWorkoutId`. Falls back to workout A of the current phase when the
 * id is unknown or belongs to a different phase than `state.phaseId` (e.g. after a phase change).
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Phase[]} phases
 * @param {import('../types.js').Workout[]} workouts
 * @returns {import('../types.js').Workout|undefined}
 */
export function nextWorkout(state, phases, workouts) {
  const phase = phases.find((p) => p.id === state?.phaseId) ?? phases[0];
  const byId = workouts.find((w) => w.id === state?.nextWorkoutId && workoutKind(w) === 'strength');
  if (byId && (!phase || byId.phaseId === phase.id)) return byId;
  return workouts.find((w) => w.id === phase?.workouts.A) ?? byId ?? workouts[0];
}

/**
 * A→B→C→A within the phase. Unknown current id → A.
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Phase} phase
 * @returns {string} next workout id
 */
export function advanceWorkout(state, phase) {
  const order = [phase.workouts.A, phase.workouts.B, phase.workouts.C];
  const i = order.indexOf(state?.nextWorkoutId);
  return i < 0 ? order[0] : order[(i + 1) % order.length];
}

/** sets × 0.65 rounded, min 1 (same rule as traffic-light.applyTaper). */
const taperSets = (sets) => Math.max(1, Math.round((sets ?? 1) * 0.65));

function phaseOrder(content, phaseId) {
  return (content?.phases || []).find((p) => p.id === phaseId)?.order ?? null;
}

/**
 * v4 (SPEC §15.3): can this workout start with the rowing warm-up?
 * True when the workout names a rowing exercise in `rowWarmup` (strength workouts p1–p3), the current phase is not
 * post-op, the exercise exists, its phaseMin is reached and it is available (`exerciseAvailable`: user toggle,
 * `postOpAllowed: false`). Short, cardio, custom and p4 workouts → false.
 * @param {import('../types.js').Workout} workout
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 * @returns {boolean}
 */
export function canRowWarmup(workout, state, content) {
  if (!workout || typeof workout.rowWarmup !== 'string' || workoutKind(workout) !== 'strength') return false;
  const phases = content?.phases || [];
  const phase = phases.find((p) => p.id === (state?.phaseId ?? workout.phaseId)) ?? phases.find((p) => p.id === workout.phaseId);
  if (phase?.kind === 'postop') return false;
  const ex = (content?.exercises || []).find((e) => e.id === workout.rowWarmup);
  if (!ex) return false;
  const cur = phaseOrder(content, phase?.id);
  const min = phaseOrder(content, ex.phaseMin);
  if (cur != null && min != null && cur < min) return false;
  return exerciseAvailable(ex, phase, state);
}

/**
 * Time budget (minutes) of a plan built from `workout`: cardio → null; with rowing warm-up →
 * `workout.maxMinutesWithRow ?? MAX_SESSION_WITH_ROW_MIN` (42); else `workout.maxMinutes ?? MAX_SESSION_MIN` (content strength
 * workouts carry 32, short 16; custom 30).
 * @param {import('../types.js').Workout} workout
 * @param {boolean} [rowWarmup] the plan contains the rowing warm-up
 * @returns {number|null}
 */
export function planBudgetMinutes(workout, rowWarmup = false, finisherMin = 0) {
  if (workoutKind(workout) === 'cardio') return null;
  const base = rowWarmup ? workout.maxMinutesWithRow ?? MAX_SESSION_WITH_ROW_MIN : workout.maxMinutes ?? MAX_SESSION_MIN;
  return base + Math.max(0, finisherMin || 0);
}

/**
 * v4 (SPEC §15.6): the optional rowing finisher available for `workout` in the current phase, or null.
 * Needs a strength workout, a prehab phase with `phase.rowFinisher`, phaseMin reached, the exercise available
 * (`exerciseAvailable`) and no taper week (`opts.taper`). Never in p4.
 * @param {import('../types.js').Workout} workout
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 * @param {{taper?: boolean}} [opts]
 * @returns {{exerciseId: string, level: number, plannedSets: number, seconds: number, minutes: number}|null}
 */
export function finisherPlan(workout, state, content, { taper = false } = {}) {
  if (!workout || workoutKind(workout) !== 'strength' || taper) return null;
  const phases = content?.phases || [];
  const phase = phases.find((p) => p.id === (state?.phaseId ?? workout.phaseId)) ?? phases.find((p) => p.id === workout.phaseId);
  if (!phase || phase.kind === 'postop' || typeof phase.rowFinisher !== 'string') return null;
  const ex = (content?.exercises || []).find((e) => e.id === phase.rowFinisher);
  if (!ex) return null;
  const cur = phaseOrder(content, phase.id);
  const min = phaseOrder(content, ex.phaseMin);
  if (cur != null && min != null && cur < min) return null;
  if (!exerciseAvailable(ex, phase, state)) return null;
  const level = levelOf(state, ex.id, ex);
  const lvl = ex.levels[level] || {};
  const plannedSets = lvl.sets ?? 1;
  const seconds = Array.isArray(lvl.phases) && lvl.phases.length
    ? lvl.phases.reduce((a, p) => a + (p.seconds || 0), 0)
    : plannedSets * (lvl.seconds ?? 60) + (plannedSets - 1) * (lvl.rest ?? 0);
  return { exerciseId: ex.id, level, plannedSets, seconds, minutes: Math.ceil(seconds / 60) };
}

/**
 * v4: insert the rowing finisher into a strength plan (returns a NEW session; input untouched). The entry
 * `{section: "cardio", finisher: true}` goes right before the first cool-down entry (after the strength part),
 * the session gets `rowFinisher: true`, `finisherRowing: null` and `budgetMin` + finisher minutes.
 * Returns the session unchanged when no finisher is available or it is already in the plan.
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Workout} workout
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 */
export function appendFinisher(session, workout, state, content) {
  if (!session || (session.exercises || []).some((e) => e.finisher)) return session;
  const f = finisherPlan(workout, state, content, { taper: !!session.taper });
  if (!f) return session;
  const entry = { exerciseId: f.exerciseId, section: 'cardio', finisher: true, level: f.level, plannedSets: f.plannedSets,
    painDuring: null, sharpPain: false, rpe: null, skipped: false, sets: [] };
  const list = [...(session.exercises || [])];
  const at = list.findIndex((e) => e.section === 'cooldown');
  list.splice(at < 0 ? list.length : at, 0, entry);
  return { ...session, exercises: list, rowFinisher: true, finisherRowing: null, budgetMin: (session.budgetMin ?? planBudgetMinutes(workout, !!session.rowWarmup)) + f.minutes };
}

/**
 * v4: may the finisher start now? Only when the knee light of the running session is green:
 * strength session, not post-op, not taper; pre-check pain ≤ greenMax (default 2), no swelling, no locking /
 * giving way; no sharp pain and every recorded `painDuring` ≤ greenMax in the entries done so far.
 * @param {import('../types.js').Session} session
 * @param {import('../types.js').Settings} [settings]
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function finisherEligible(session, settings) {
  const reasons = [];
  const g = settings?.painThresholds?.greenMax ?? 2;
  if (!session || (session.kind && session.kind !== 'strength')) reasons.push('Nur nach einem Krafttraining.');
  if (session?.postOp) reasons.push('Nach der OP kein Rudern.');
  if (session?.taper) reasons.push('OP-Woche: kein zusätzliches Volumen.');
  const pre = session?.pre;
  if (pre && typeof pre.pain === 'number' && pre.pain > g) reasons.push(`Knieschmerz vor dem Training über ${g}/10.`);
  if (pre && (pre.swelling ?? 0) > 0) reasons.push('Schwellung vor dem Training.');
  if (pre?.mechanical?.locking || pre?.mechanical?.givingWay) reasons.push('Blockieren oder Wegknicken.');
  const entries = (session?.exercises || []).filter((e) => !e.finisher && !e.skipped);
  if (entries.some((e) => e.sharpPain)) reasons.push('Stechender Schmerz in dieser Einheit.');
  if (entries.some((e) => typeof e.painDuring === 'number' && e.painDuring > g)) reasons.push(`Knieschmerz in dieser Einheit über ${g}/10.`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Build an active session from a workout.
 * - Unknown exercise ids are dropped; `phaseMin` is respected (order ≥ phase(phaseMin).order).
 * - `taper`: exercises never performed in a previous done session are skipped (only if there is
 *   any history), and every entry gets `plannedSets` reduced by applyTaper.
 * - Each entry carries `plannedSets` (planned set count of its level, after taper).
 * - v4 `rowWarmup` (default `settings.rowWarmupDefault`, else false): when `canRowWarmup` is true, the plan starts
 *   with the rowing block (`workout.rowWarmup`, section "cardio") and keeps only the warm-up items marked
 *   `keepWithRow`; otherwise the full mobility warm-up. The plan records `rowWarmup: boolean` and (when rowing)
 *   `warmupRowing: null` (display values of the warm-up row, SPEC §15.3).
 * @param {import('../types.js').Workout} workout
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 * - v4 `rowFinisher` (default `settings.rowFinisherDefault`, else false): inserts the optional rowing finisher
 *   (`appendFinisher`) when `finisherPlan` offers one; the UI still checks `finisherEligible` before it starts
 *   and otherwise marks the entry skipped.
 * @param {{taper?: boolean, history?: import('../types.js').Session[], now?: Date, settings?: import('../types.js').Settings|null, fit?: boolean, rowWarmup?: boolean, rowFinisher?: boolean}} [opts]
 * @returns {import('../types.js').Session}
 */
export function buildSessionPlan(workout, state, content, { taper = false, history = [], now = new Date(), settings = null, fit = true, rowWarmup, rowFinisher } = {}) {
  const kind = workoutKind(workout);
  const phase = (content?.phases || []).find((p) => p.id === (state?.phaseId ?? workout.phaseId)) ?? (content?.phases || []).find((p) => p.id === workout.phaseId);
  const wantRow = rowWarmup ?? settings?.rowWarmupDefault ?? false;
  const withRow = !!wantRow && canRowWarmup(workout, state, content);
  const items = workoutItems(workout, { rowWarmup: withRow });
  const curOrder = phaseOrder(content, state?.phaseId ?? workout.phaseId) ?? phaseOrder(content, workout.phaseId);
  const done = doneSessions(history);
  const performedBefore = new Set();
  for (const s of done) for (const e of s.exercises || []) {
    if (!e.skipped && (e.sets || []).some((x) => x?.done)) performedBefore.add(e.exerciseId);
  }
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const exercises = [];
  for (const it of items) {
    const ex = (content?.exercises || []).find((e) => e.id === it.exerciseId);
    if (!ex) continue;
    const minOrder = phaseOrder(content, ex.phaseMin);
    // custom workouts: phaseMin is only a warning (validateCustomWorkout), not a filter
    if (kind !== 'custom' && curOrder != null && minOrder != null && curOrder < minOrder) continue;
    if (!exerciseAvailable(ex, phase, state)) continue;
    if (taper && done.length && !performedBefore.has(ex.id)) continue;
    const level = levelOf(state, it.exerciseId, ex);
    const sets = kind === 'cardio' || it.section === 'cardio' ? (ex.levels[level]?.sets ?? 1) : cappedSets(ex.levels[level]?.sets ?? 1, it, workout);
    exercises.push({
      exerciseId: it.exerciseId,
      section: it.section,
      level,
      plannedSets: taper ? taperSets(sets) : sets,
      painDuring: null,
      sharpPain: false,
      rpe: null,
      skipped: false,
      sets: [],
      ...(it.note ? { note: it.note } : {}),
    });
  }
  const plan = {
    id: `s-${stamp}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`,
    workoutId: workout.id,
    phaseId: kind === 'custom' ? (state?.phaseId ?? workout.phaseId ?? null) : workout.phaseId,
    kind,
    ...(phase?.kind === 'postop' ? { postOp: true } : {}),
    ...(kind === 'cardio' ? { rowing: null } : {}),
    ...(kind !== 'cardio' ? { rowWarmup: withRow } : {}),
    ...(withRow ? { warmupRowing: null } : {}),
    ...(kind !== 'cardio' ? { budgetMin: planBudgetMinutes(workout, withRow) } : {}),
    status: 'active',
    startedAt: now.toISOString(),
    endedAt: null,
    taper,
    pre: null,
    exercises,
    post: null,
    nextDay: null,
    traffic: { provisional: null, final: null, reasons: [] },
    recommendations: [],
    cursor: { index: 0, set: 0, step: 'pre' },
  };
  // keep strength/short/custom sessions inside their time budget (v4: 32 / 42 with rowing / short 16 / custom 30) by trimming sets.
  const maxMinutes = planBudgetMinutes(workout, withRow);
  if (fit && maxMinutes && kind !== 'cardio') fitPlanToMinutes(plan, content, settings, maxMinutes);
  if (rowFinisher ?? settings?.rowFinisherDefault ?? false) return appendFinisher(plan, workout, state, content);
  return plan;
}

/**
 * Apply an accepted recommendation to state (returns a new object, input untouched).
 * - progress/regress with `toExerciseId` → sets the level of that exercise (the switch itself is
 *   a suggestion shown to the user; workouts are static).
 * - progress/regress otherwise → `exerciseLevels[exerciseId] = toLevel` (min 0).
 * - hold/reduce/consult → no level change.
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Recommendation} rec
 * @returns {import('../types.js').State}
 */
export function applyRecommendation(state, rec) {
  const next = { ...state, exerciseLevels: { ...(state?.exerciseLevels || {}) } };
  if (!rec || (rec.action !== 'progress' && rec.action !== 'regress')) return next;
  const id = rec.toExerciseId || rec.exerciseId;
  if (!id || rec.toLevel == null) return next;
  next.exerciseLevels[id] = Math.max(0, Math.floor(rec.toLevel));
  return next;
}

/**
 * Data-driven assessment of an exit criterion text (German). Returns `met: true|false` for
 * recognised patterns, `null` when the criterion must be judged by the user.
 */
function assessCriterion(text, inPhase, ctx) {
  const t = String(text);
  let m;
  if ((m = t.match(/(\d+)\s*Wochen?\s+überwiegend\s+grün/i))) {
    const n = Number(m[1]);
    const perWeek = new Map();
    for (const s of inPhase) {
      const wk = startOfIsoWeek(dayOf(s));
      const arr = perWeek.get(wk) ?? [];
      arr.push(sessionLight(s));
      perWeek.set(wk, arr);
    }
    let end = startOfIsoWeek(ctx.today);
    if (!perWeek.has(end)) end = addDays(end, -7);
    let all = [];
    for (let i = 0; i < n; i++) {
      const wk = addDays(end, -7 * i);
      if (!perWeek.has(wk)) return { met: false, hint: `${n} Wochen in Folge mit Training nötig.` };
      all = all.concat(perWeek.get(wk));
    }
    const greens = all.filter((l) => l === 'green').length;
    return { met: greens / all.length > 0.5, hint: `${greens}/${all.length} grün in den letzten ${n} Wochen.` };
  }
  if ((m = t.match(/(\d+)\s*Wochen?\s+Wochenziel/i))) {
    const n = Number(m[1]);
    const st = streak(inPhase, ctx.weeklyGoal, ctx.today);
    return { met: st.weeks >= n, hint: `${st.weeks}/${n} Wochen in Folge.` };
  }
  if (/Folgetag/i.test(t) && /\+\s*1/.test(t)) {
    const withNd = inPhase.filter((s) => typeof s.nextDay?.pain === 'number');
    if (!withNd.length) return { met: false, hint: 'Noch keine Folgetag-Checks.' };
    const ok = withNd.every((s) => s.nextDay.pain - (s.pre?.pain ?? 0) <= 1);
    return { met: ok, hint: `${withNd.length} Folgetag-Checks ausgewertet.` };
  }
  if (/OP-Termin\s+erreicht/i.test(t)) {
    if (!ctx.surgeryDate) return { met: false, hint: 'Kein OP-Termin eingetragen.' };
    return { met: daysBetween(ctx.today, ctx.surgeryDate) <= 0, hint: '' };
  }
  return { met: null, hint: '' };
}

/**
 * Phase progress. Phase change is never automatic: `ready` = all exit criteria ticked by the user.
 * Additional fields: `criteria[]` with data-driven `met` (true/false/null = manual) and
 * `suggestReady` (every criterion ticked or met by data).
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Phase} phase
 * @param {import('../types.js').Session[]} sessions
 * @param {{today?: string, settings?: import('../types.js').Settings, weeklyGoal?: number, surgeryDate?: string|null}} [opts]
 */
export function phaseProgress(state, phase, sessions, opts = {}) {
  const inPhase = doneSessions(sessions).filter((s) => s.phaseId === phase.id);
  const total = phase.exitCriteria?.length ?? 0;
  const ticked = new Set((state?.exitCriteriaDone?.[phase.id] ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < total));
  const lights = inPhase.map(sessionLight).filter(Boolean);
  const greenRatio = lights.length ? lights.filter((l) => l === 'green').length / lights.length : 0;
  const ctx = {
    today: opts.today ?? (inPhase.length ? inPhase.map(dayOf).sort().at(-1) : todayISO()),
    weeklyGoal: opts.weeklyGoal ?? opts.settings?.weeklyGoal ?? 3,
    surgeryDate: opts.surgeryDate !== undefined ? opts.surgeryDate : opts.settings?.surgeryDate ?? null,
  };
  const criteria = (phase.exitCriteria || []).map((text, index) => ({ index, text, ticked: ticked.has(index), ...assessCriterion(text, inPhase, ctx) }));
  return {
    phaseId: phase.id,
    sessionsInPhase: inPhase.length,
    greenRatio,
    criteriaDone: ticked.size,
    criteriaTotal: total,
    ready: total > 0 && ticked.size >= total,
    criteria,
    suggestReady: total > 0 && criteria.every((c) => c.ticked || c.met === true),
    weeksInPhase: sessionsPerWeek(inPhase).size,
  };
}
