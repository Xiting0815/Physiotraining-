// Loads static content from data/*.json. See docs/SPEC.md §6.1–6.6, §7.4.

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

/** @param {{force?: boolean}} [opts] @returns {Promise<import('./types.js').Content>} */
export function loadContent({ force = false } = {}) {
  if (content && !force) return Promise.resolve(content);
  if (pending && !force) return pending;
  pending = (async () => {
    const [exercises, workouts, phases, poses, badges] = await Promise.all(FILES.map(fetchJson));
    const [equipment, quotes] = await Promise.all([fetchOptional('equipment'), fetchOptional('quotes')]);
    content = {
      exercises: unwrap(exercises, 'exercises'),
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
/** @param {string} id */
export const getPhase = (id) => content?.phases.find((p) => p.id === id);
/** @param {string} id */
export const getPose = (id) => content?.poses?.poses?.[id];
