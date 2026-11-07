// User-built custom workouts (state.customWorkouts). PURE. See docs/SPEC.md §12.5.
import { estimateWorkoutMinutes, MAX_SESSION_MIN } from './duration.js';
import { exerciseAvailable, getWorkout } from './progression.js';

export { getWorkout };
export const CUSTOM_BLOCKS = [
  { id: 'knee', title: 'Knie & Beine' },
  { id: 'archery', title: 'Bogen, Rücken & Stütz' },
];
export const MAX_CUSTOM_ITEMS = 20;

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const items = (arr) => (Array.isArray(arr) ? arr : []).filter((it) => it && typeof it.exerciseId === 'string').map((it) => ({ exerciseId: it.exerciseId, ...(it.note ? { note: String(it.note) } : {}) }));

/** New id "cw-<base36 ms>-<4 random>". */
export function newCustomId(now = new Date()) {
  return `cw-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
}

/**
 * Normalise user input into a CustomWorkout (unknown fields dropped, blocks fixed to knee/archery order).
 * @param {any} input
 * @param {{id?: string, now?: Date, createdAt?: string}} [opts]
 * @returns {import('../types.js').CustomWorkout}
 */
export function normalizeCustom(input, { id, now = new Date(), createdAt } = {}) {
  const blocks = CUSTOM_BLOCKS.map((b) => {
    const src = (input?.blocks || []).find((x) => x?.id === b.id);
    return { id: b.id, title: (src?.title && String(src.title).trim()) || b.title, items: items(src?.items) };
  });
  return {
    id: id ?? input?.id ?? newCustomId(now),
    name: String(input?.name ?? '').trim().slice(0, 60),
    kind: 'custom',
    createdAt: createdAt ?? input?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    warmup: items(input?.warmup),
    blocks,
    cooldown: items(input?.cooldown),
  };
}

/** Convert to a Workout usable by buildSessionPlan / estimateWorkoutMinutes. */
export function toWorkout(custom, state) {
  return {
    ...clone(custom),
    kind: 'custom',
    phaseId: state?.phaseId ?? null,
    maxMinutes: MAX_SESSION_MIN,
    durationMin: 0,
    warmup: custom?.warmup || [],
    blocks: (custom?.blocks || []).filter((b) => b && (b.id === 'knee' || b.id === 'archery')),
    cooldown: custom?.cooldown || [],
  };
}

/**
 * Validate a custom workout. Errors block saving; warnings are shown but allowed.
 * - errors: empty name, no exercise, unknown exercise id, rowing (cardio) exercises (→ own rowing sessions),
 *   more than MAX_CUSTOM_ITEMS items;
 * - warnings: exercise above the current phase (phaseMin), knee/archery exercise in the other block,
 *   blocked after surgery in the current post-op phase / disabled by the user, duplicates,
 *   estimated duration > 30 min.
 * @returns {{ok: boolean, errors: string[], warnings: string[], estimatedMin: number}}
 */
export function validateCustomWorkout(custom, content, state, settings) {
  const errors = [];
  const warnings = [];
  const exById = new Map((content?.exercises || []).map((e) => [e.id, e]));
  const phases = content?.phases || [];
  const phase = phases.find((p) => p.id === state?.phaseId);
  const order = (id) => phases.find((p) => p.id === id)?.order ?? null;
  if (!custom?.name || !String(custom.name).trim()) errors.push('Bitte gib dem Workout einen Namen.');
  const all = [
    ...(custom?.warmup || []).map((it) => ({ it, where: 'warmup' })),
    ...(custom?.blocks || []).flatMap((b) => (b.items || []).map((it) => ({ it, where: b.id }))),
    ...(custom?.cooldown || []).map((it) => ({ it, where: 'cooldown' })),
  ];
  if (!all.length) errors.push('Füge mindestens eine Übung hinzu.');
  if (all.length > MAX_CUSTOM_ITEMS) errors.push(`Höchstens ${MAX_CUSTOM_ITEMS} Übungen pro Workout.`);
  const seen = new Set();
  for (const { it, where } of all) {
    const ex = exById.get(it.exerciseId);
    if (!ex) { errors.push(`Unbekannte Übung: ${it.exerciseId}.`); continue; }
    if (ex.block === 'cardio') { errors.push(`${ex.name}: Rudern bitte als eigene Rudereinheit starten.`); continue; }
    if (seen.has(ex.id)) warnings.push(`${ex.name} ist mehrfach enthalten.`);
    seen.add(ex.id);
    const cur = order(state?.phaseId);
    const min = order(ex.phaseMin);
    if (cur != null && min != null && cur < min) warnings.push(`${ex.name} ist erst ab ${phases.find((p) => p.id === ex.phaseMin)?.name ?? ex.phaseMin} vorgesehen – nur mit gutem Gefühl im Knie.`);
    if ((where === 'knee' || where === 'archery') && (ex.block === 'knee' || ex.block === 'archery') && ex.block !== where) {
      warnings.push(`${ex.name} gehört eigentlich in den Block „${ex.block === 'knee' ? 'Knie' : 'Bogen & Rücken'}“ (Ampel/RPE-Logik folgt dem Block).`);
    }
    if (!exerciseAvailable(ex, phase, state)) warnings.push(`${ex.name} ist in der aktuellen Phase gesperrt oder deaktiviert und wird beim Training übersprungen.`);
  }
  let estimatedMin = 0;
  if (!errors.length) {
    estimatedMin = estimateWorkoutMinutes(toWorkout(custom, state), content, state, settings);
    if (estimatedMin > MAX_SESSION_MIN) warnings.push(`Geschätzt ca. ${estimatedMin} Minuten – mehr als dein 30-Minuten-Rahmen. Beim Start werden Sätze gekürzt.`);
  }
  return { ok: errors.length === 0, errors, warnings, estimatedMin };
}

/**
 * Create a custom workout. Throws Error (German, first validation error) if invalid.
 * @returns {{state: import('../types.js').State, workout: import('../types.js').CustomWorkout, warnings: string[]}}
 */
export function createCustomWorkout(state, input, content, { now = new Date(), settings } = {}) {
  const w = normalizeCustom(input, { now });
  const v = validateCustomWorkout(w, content, state, settings);
  if (!v.ok) throw new Error(v.errors[0]);
  return { state: { ...state, customWorkouts: [...(state?.customWorkouts || []), w] }, workout: w, warnings: v.warnings };
}

/**
 * Update (replace content of) a custom workout by id; keeps id + createdAt. Throws if unknown/invalid.
 */
export function updateCustomWorkout(state, id, input, content, { now = new Date(), settings } = {}) {
  const list = state?.customWorkouts || [];
  const old = list.find((w) => w.id === id);
  if (!old) throw new Error('Workout nicht gefunden.');
  const w = normalizeCustom({ ...old, ...input }, { id, now, createdAt: old.createdAt });
  const v = validateCustomWorkout(w, content, state, settings);
  if (!v.ok) throw new Error(v.errors[0]);
  return { state: { ...state, customWorkouts: list.map((x) => (x.id === id ? w : x)) }, workout: w, warnings: v.warnings };
}

/** Delete by id (no-op if missing). Also clears `state.nextWorkoutId` never (custom is never in rotation). */
export function deleteCustomWorkout(state, id) {
  return { ...state, customWorkouts: (state?.customWorkouts || []).filter((w) => w.id !== id) };
}

/** Duplicate a content or custom workout into a new custom one (name „Kopie von …“). */
export function duplicateAsCustom(state, workoutId, content, { now = new Date(), settings } = {}) {
  const src = getWorkout(workoutId, content, state);
  if (!src) throw new Error('Workout nicht gefunden.');
  if (src.kind === 'cardio') throw new Error('Rudereinheiten können nicht kopiert werden.');
  return createCustomWorkout(state, { name: `Kopie von ${src.name}`.slice(0, 60), warmup: src.warmup, blocks: src.blocks, cooldown: src.cooldown }, content, { now, settings });
}

/** Merge two lists by id (import): newer `updatedAt` wins. */
export function mergeCustomWorkouts(current, incoming) {
  const m = new Map();
  for (const w of incoming || []) if (w?.id) m.set(w.id, w);
  for (const w of current || []) {
    if (!w?.id) continue;
    const o = m.get(w.id);
    if (!o || String(w.updatedAt ?? '') >= String(o.updatedAt ?? '')) m.set(w.id, w);
  }
  return [...m.values()].sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? -1 : 1));
}
