// Loads static content from data/*.json. See docs/SPEC.md §6.1–6.6, §7.4.
import { getWorkout as logicGetWorkout } from './logic/progression.js';

const FILES = ['exercises', 'workouts', 'phases', 'poses', 'badges'];
const dataUrl = (name) => new URL(`../data/${name}.json`, import.meta.url).href;

/** @type {import('./types.js').Content|null} */
let content = null;
/** @type {Promise<import('./types.js').Content>|null} */
let pending = null;

async function fetchJson(name) {
  const res = await fetch(dataUrl(name));
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return res.json();
}

async function fetchOptional(name) {
  try { return await fetchJson(name); } catch { return null; }
}

/** Unwrap `{version, <key>: [...]}` → array (or accept a bare array). */
function unwrap(json, key) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json[key])) return json[key];
  return [];
}

/** v5.3: data/figure-overrides.json (optional) – each given key replaces the exercise's figure key. */
const FIGURE_OVERRIDE_KEYS = ['poses', 'view', 'props', 'band', 'arrows', 'labels', 'mirror', 'tempo', 'loop', 'highlight'];
function withFigureOverride(ex, ov) {
  if (!ex || !ov || typeof ov !== 'object') return ex;
  const figure = { ...(ex.figure || {}) };
  for (const k of FIGURE_OVERRIDE_KEYS) if (ov[k] !== undefined) figure[k] = ov[k];
  return { ...ex, figure };
}

/** @param {{force?: boolean}} [opts] @returns {Promise<import('./types.js').Content>} */
export function loadContent({ force = false } = {}) {
  if (content && !force) return Promise.resolve(content);
  if (pending && !force) return pending;
  pending = (async () => {
    const [exercises, workouts, phases, poses, badges] = await Promise.all(FILES.map(fetchJson));
    const [equipment, quotes, figOv] = await Promise.all([fetchOptional('equipment'), fetchOptional('quotes'), fetchOptional('figure-overrides')]);
    const figureOverrides = (figOv && typeof figOv.overrides === 'object' && figOv.overrides) || {};
    content = {
      exercises: unwrap(exercises, 'exercises').map((e) => withFigureOverride(e, figureOverrides[e?.id])),
      figureOverrides,
      workouts: unwrap(workouts, 'workouts'),
      phases: unwrap(phases, 'phases').slice().sort((a, b) => a.order - b.order),
      poses: poses && typeof poses === 'object' ? poses : { segments: {}, poses: {} },
      badges: unwrap(badges, 'badges'),
      equipment,
      quotes: unwrap(quotes, 'quotes').filter((q) => typeof q === 'string' && q.trim()),
    };
    return content;
  })();
  pending.catch(() => { pending = null; });
  return pending;
}

/** Test hook: inject content directly. @param {import('./types.js').Content} c */
export function _setContent(c) { content = c; }

export const getContent = () => content;
/** @param {string} id */
export const getExercise = (id) => content?.exercises.find((e) => e.id === id);
/** @param {string} id */
export const getWorkout = (id) => content?.workouts.find((w) => w.id === id);
/**
 * v2: any workout incl. the user's custom workouts (`state.customWorkouts`), see logic/progression.getWorkout.
 * @param {string} id @param {import('./types.js').State} [state]
 */
export const getAnyWorkout = (id, state) => (content ? logicGetWorkout(id, content, state) : undefined);
/** @param {string} id */
export const getPhase = (id) => content?.phases.find((p) => p.id === id);
/** @param {string} id */
export const getPose = (id) => content?.poses?.poses?.[id];
