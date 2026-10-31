// Workout rotation, levels, phases. PURE. See docs/SPEC.md §5.3, §7.7.
// WP0 stub: signatures binding; WP-Logic completes + tests.

/**
 * @param {import('../types.js').State} state
 * @param {string} exerciseId
 * @param {import('../types.js').Exercise} [exercise]
 * @returns {number} clamped 0-based level index
 */
export function levelOf(state, exerciseId, exercise) {
  const raw = state?.exerciseLevels?.[exerciseId] ?? 0;
  const max = exercise ? exercise.levels.length - 1 : Infinity;
  return Math.max(0, Math.min(max, raw));
}

/**
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Phase[]} phases
 * @param {import('../types.js').Workout[]} workouts
 * @returns {import('../types.js').Workout|undefined}
 */
export function nextWorkout(state, phases, workouts) {
  const byId = workouts.find((w) => w.id === state.nextWorkoutId);
  if (byId) return byId;
  const phase = phases.find((p) => p.id === state.phaseId) ?? phases[0];
  return workouts.find((w) => w.id === phase?.workouts.A) ?? workouts[0];
}

/**
 * A→B→C→A within the phase.
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Phase} phase
 * @returns {string} next workout id
 */
export function advanceWorkout(state, phase) {
  const order = [phase.workouts.A, phase.workouts.B, phase.workouts.C];
  const i = order.indexOf(state.nextWorkoutId);
  return order[(i + 1) % order.length] ?? order[0];
}

/**
 * Build an active session from a workout.
 * @param {import('../types.js').Workout} workout
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 * @param {{taper?: boolean, today?: string, history?: import('../types.js').Session[], now?: Date}} [opts]
 * @returns {import('../types.js').Session}
 */
export function buildSessionPlan(workout, state, content, { taper = false, now = new Date() } = {}) {
  // TODO(WP-Logic): apply taper (no new exercises), phaseMin filtering.
  const items = [
    ...workout.warmup.map((it) => ({ ...it, section: 'warmup' })),
    ...workout.blocks.flatMap((b) => b.items.map((it) => ({ ...it, section: b.id }))),
    ...workout.cooldown.map((it) => ({ ...it, section: 'cooldown' })),
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return {
    id: `s-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
    workoutId: workout.id,
    phaseId: workout.phaseId,
    status: 'active',
    startedAt: now.toISOString(),
    endedAt: null,
    taper,
    pre: null,
    exercises: items.map((it) => {
      const ex = content.exercises.find((e) => e.id === it.exerciseId);
      return {
        exerciseId: it.exerciseId,
        section: it.section,
        level: levelOf(state, it.exerciseId, ex),
        painDuring: null,
        sharpPain: false,
        rpe: null,
        skipped: false,
        sets: [],
        ...(it.note ? { note: it.note } : {}),
      };
    }),
    post: null,
    nextDay: null,
    traffic: { provisional: null, final: null, reasons: [] },
    recommendations: [],
    cursor: { index: 0, set: 0, step: 'pre' },
  };
}

/**
 * Apply an accepted recommendation to state (returns a new object).
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Recommendation} rec
 * @returns {import('../types.js').State}
 */
export function applyRecommendation(state, rec) {
  // TODO(WP-Logic): handle progressTo/regressTo exercise switch.
  if (!rec.exerciseId || rec.toLevel == null) return state;
  return { ...state, exerciseLevels: { ...state.exerciseLevels, [rec.exerciseId]: rec.toLevel } };
}

/**
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Phase} phase
 * @param {import('../types.js').Session[]} sessions
 */
export function phaseProgress(state, phase, sessions) {
  // TODO(WP-Logic): greenRatio, readiness rules.
  const inPhase = sessions.filter((s) => s.phaseId === phase.id && s.status === 'done');
  const done = state.exitCriteriaDone?.[phase.id] ?? [];
  return {
    phaseId: phase.id,
    sessionsInPhase: inPhase.length,
    greenRatio: 0,
    criteriaDone: done.length,
    criteriaTotal: phase.exitCriteria.length,
    ready: phase.exitCriteria.length > 0 && done.length >= phase.exitCriteria.length,
  };
}
