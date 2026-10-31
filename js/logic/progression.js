// Workout rotation, levels, phases. PURE. See docs/SPEC.md §5.3, §7.7.
import { addDays, daysBetween, startOfIsoWeek, todayISO } from '../util/date.js';
import { dayOf, doneSessions, sessionLight, sessionsPerWeek, streak } from './stats.js';

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
  const byId = workouts.find((w) => w.id === state?.nextWorkoutId);
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
 * Build an active session from a workout.
 * - Unknown exercise ids are dropped; `phaseMin` is respected (order ≥ phase(phaseMin).order).
 * - `taper`: exercises never performed in a previous done session are skipped (only if there is
 *   any history), and every entry gets `plannedSets` reduced by applyTaper.
 * - Each entry carries `plannedSets` (planned set count of its level, after taper).
 * @param {import('../types.js').Workout} workout
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 * @param {{taper?: boolean, today?: string, history?: import('../types.js').Session[], now?: Date}} [opts]
 * @returns {import('../types.js').Session}
 */
export function buildSessionPlan(workout, state, content, { taper = false, history = [], now = new Date() } = {}) {
  const items = [
    ...(workout.warmup || []).map((it) => ({ ...it, section: 'warmup' })),
    ...(workout.blocks || []).flatMap((b) => (b.items || []).map((it) => ({ ...it, section: b.id }))),
    ...(workout.cooldown || []).map((it) => ({ ...it, section: 'cooldown' })),
  ];
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
    if (curOrder != null && minOrder != null && curOrder < minOrder) continue;
    if (taper && done.length && !performedBefore.has(ex.id)) continue;
    const level = levelOf(state, it.exerciseId, ex);
    const sets = ex.levels[level]?.sets ?? 1;
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
  return {
    id: `s-${stamp}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`,
    workoutId: workout.id,
    phaseId: workout.phaseId,
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
