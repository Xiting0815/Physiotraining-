// v5 (SPEC §16): owned equipment steers the plan. PURE – no DOM, no storage.
// Equipment ids: base items are always available, optional items only when ticked under
// „Meine Ausrüstung“ (`settings.ownedEquipment`).

/** Always available (the user's basic home setup). */
export const BASE_EQUIPMENT = ['theraband', 'loop', 'mat', 'chair', 'step', 'wall', 'door', 'none'];

/** Optional equipment, in the order of the „Meine Ausrüstung“ toggles. */
export const OPTIONAL_EQUIPMENT = [
  { id: 'rowing-machine', label: 'Rudergerät', icon: '🚣', hint: 'Rudern als Aufwärmen, Finisher und eigene Rudereinheiten' },
  { id: 'sling-trainer', label: 'Schlingentrainer', icon: '🪢', hint: 'Sling-Varianten für Rücken, Rumpf und Stütz (an der Tür befestigt)' },
  { id: 'door-anchor', label: 'Türanker', icon: '⚓', hint: 'Band sauber auf Knöchel-, Brust- oder Kopfhöhe befestigen' },
  { id: 'band-handles', label: 'Bandgriffe', icon: '🤏', hint: 'Griffe an den Bandenden – angenehmer für Zugübungen' },
  { id: 'ankle-weights', label: 'Gewichtsmanschetten', icon: '⚖️', hint: 'Für Beinheben und Hüftübungen ohne Kniebeugung' },
  { id: 'balance-pad', label: 'Balance-Pad', icon: '🟦', hint: 'Gleichgewicht und Kniekontrolle' },
  { id: 'dumbbells', label: 'Kurzhanteln', icon: '🏋️', hint: 'Konstanter Widerstand für Schulter und Arme' },
  { id: 'pedal-trainer', label: 'Pedaltrainer', icon: '🚲', hint: 'Gleichmäßiges Treten im Sitzen' },
  { id: 'release-trainer', label: 'Release-Trainer', icon: '🎯', hint: 'Schussablauf zu Hause üben' },
  { id: 'ice-pack', label: 'Kühlpack', icon: '🧊', hint: 'Nach dem Training oder nach der OP' },
  { id: 'measuring-tape', label: 'Maßband', icon: '📏', hint: 'Knieumfang kontrollieren' },
];

/** Label + icon for every equipment id (base and optional). */
export const EQUIPMENT_INFO = {
  theraband: { label: 'TheraBand', icon: '🎗️' },
  loop: { label: 'Loop-Band', icon: '⭕' },
  mat: { label: 'Matte', icon: '🧘' },
  chair: { label: 'Stuhl', icon: '🪑' },
  step: { label: 'Stufe', icon: '🪜' },
  wall: { label: 'Wand', icon: '🧱' },
  door: { label: 'Tür', icon: '🚪' },
  none: { label: 'Ohne Geräte', icon: '🙌' },
  ...Object.fromEntries(OPTIONAL_EQUIPMENT.map((e) => [e.id, { label: e.label, icon: e.icon }])),
};

const OPTIONAL_IDS = new Set(OPTIONAL_EQUIPMENT.map((e) => e.id));

/** Old ids of the v1–v4 shopping list (data/equipment.json) → new ids. */
export const LEGACY_EQUIPMENT_IDS = {
  'tueranker-griffe': ['door-anchor', 'band-handles'],
  massband: ['measuring-tape'],
  pedaltrainer: ['pedal-trainer'],
  fussgewichte: ['ankle-weights'],
  balancepad: ['balance-pad'],
  schusstrainer: ['release-trainer'],
  kuehlpack: ['ice-pack'],
  kurzhanteln: ['dumbbells'],
  ruderergeraet: ['rowing-machine'],
  rudergeraet: ['rowing-machine'],
  schlingentrainer: ['sling-trainer'],
};

/** Version of the equipment model stored in `settings.equipmentModel` (missing = legacy v1–v4 ids). */
export const EQUIPMENT_MODEL = 2;

/**
 * Normalise a stored owned list: legacy ids mapped, unknown and base ids dropped, de-duplicated,
 * ordered like OPTIONAL_EQUIPMENT.
 * @param {unknown} list
 * @returns {string[]}
 */
export function normalizeOwned(list) {
  const out = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== 'string') continue;
    for (const id of LEGACY_EQUIPMENT_IDS[raw] || [raw]) if (OPTIONAL_IDS.has(id)) out.add(id);
  }
  return OPTIONAL_EQUIPMENT.map((e) => e.id).filter((id) => out.has(id));
}

/** Owned optional equipment ids of the settings (normalised). */
export const ownedEquipment = (settings) => normalizeOwned(settings?.ownedEquipment);

/**
 * Set of available equipment ids (base + owned) or `null` = no filtering (no settings given – legacy callers and
 * tests that do not care about equipment; also when `ownedEquipment` is not an array).
 * @param {import('../types.js').Settings|null|undefined} settings
 * @returns {Set<string>|null}
 */
export function availableEquipment(settings) {
  if (!settings || !Array.isArray(settings.ownedEquipment)) return null;
  return new Set([...BASE_EQUIPMENT, ...ownedEquipment(settings)]);
}

/** Accept a Set, settings object, or null (= everything available). */
function toAvail(availOrSettings) {
  if (availOrSettings == null) return null;
  if (availOrSettings instanceof Set) return availOrSettings;
  if (Array.isArray(availOrSettings)) return new Set([...BASE_EQUIPMENT, ...normalizeOwned(availOrSettings)]);
  return availableEquipment(availOrSettings);
}

/** @returns {boolean} equipment id available */
export function isAvailable(id, availOrSettings) {
  const a = toAvail(availOrSettings);
  return !a || a.has(id);
}

/** Equipment ids of the exercise that are missing (empty = can be done). */
export function missingEquipment(exercise, availOrSettings) {
  const a = toAvail(availOrSettings);
  if (!a || !exercise) return [];
  return (exercise.equipment || []).filter((id) => !a.has(id));
}

/** All equipment of the exercise available? */
export const hasEquipment = (exercise, availOrSettings) => !!exercise && missingEquipment(exercise, availOrSettings).length === 0;

/** Rowing machine available (no settings → true, legacy behaviour). */
export const ownsRowingMachine = (settings) => isAvailable('rowing-machine', settings);

/**
 * Upgrade rules of the content: base exercise id → [{equipment[], exerciseId, chip}], from
 * `exercise.upgrades` on the base exercise and the reverse declaration `exercise.replaces` on the variant
 * (`replaces: [{exerciseId, equipment?}]` or plain ids; equipment defaults to the variant's optional equipment).
 * @param {import('../types.js').Exercise[]} exercises
 * @returns {Map<string, {equipment: string[], exerciseId: string, chip?: string}[]>}
 */
export function upgradeRules(exercises) {
  const map = new Map();
  const push = (from, rule) => {
    const arr = map.get(from) || [];
    if (!arr.some((r) => r.exerciseId === rule.exerciseId)) arr.push(rule);
    map.set(from, arr);
  };
  const byId = new Map((exercises || []).map((e) => [e.id, e]));
  for (const e of exercises || []) {
    for (const u of e.upgrades || []) if (u?.exerciseId) push(e.id, { equipment: u.equipment || [], exerciseId: u.exerciseId, ...(u.chip ? { chip: u.chip } : {}) });
    for (const r of e.replaces || []) {
      const from = typeof r === 'string' ? r : r?.exerciseId;
      if (!from || !byId.has(from)) continue;
      const eq = (typeof r === 'object' && r.equipment) || (e.equipment || []).filter((x) => OPTIONAL_IDS.has(x));
      push(from, { equipment: eq, exerciseId: e.id });
    }
  }
  return map;
}

/** Reverse of upgradeRules: variant id → base id (the fallback when the variant's equipment is missing). */
export function fallbackRules(exercises) {
  const out = new Map();
  for (const [from, rules] of upgradeRules(exercises)) for (const r of rules) if (!out.has(r.exerciseId)) out.set(r.exerciseId, from);
  return out;
}

/** Chip text for an upgraded entry („Neu: Sling-Variante“). */
export function upgradeChip(variant, rule) {
  if (rule?.chip) return rule.chip;
  const eq = (variant?.equipment || []).find((x) => OPTIONAL_IDS.has(x));
  if (eq === 'sling-trainer') return 'Sling-Variante';
  return `${EQUIPMENT_INFO[eq]?.label ?? 'Neue'}-Variante`;
}

/**
 * Resolve one workout item against the available equipment.
 * - `allowUpgrade` and an upgrade rule whose equipment is available and whose variant passes `usable` → the variant
 *   (`{exerciseId: variant, upgradedFrom: base, chip}`);
 * - exercise equipment available → itself;
 * - else a fallback (the base of an upgrade rule, or `exercise.fallback`) that is available → `{exerciseId: base,
 *   fallbackFrom: variant}`;
 * - else `null` (drop it).
 * @param {string} exerciseId
 * @param {{exercises: import('../types.js').Exercise[], avail: Set<string>|null, usable?: (ex: any) => boolean,
 *   allowUpgrade?: boolean, rules?: Map<string, any[]>, fallbacks?: Map<string, string>}} ctx
 * @returns {{exerciseId: string, upgradedFrom?: string, fallbackFrom?: string, chip?: string}|null}
 */
export function resolveExercise(exerciseId, ctx) {
  const exercises = ctx.exercises || [];
  const byId = (id) => exercises.find((e) => e.id === id);
  const usable = ctx.usable || (() => true);
  const avail = ctx.avail ?? null;
  const ex = byId(exerciseId);
  if (!ex) return null;
  if (ctx.allowUpgrade !== false && avail) {
    const rules = (ctx.rules || upgradeRules(exercises)).get(exerciseId) || [];
    for (const r of rules) {
      const v = byId(r.exerciseId);
      if (!v || !r.equipment.every((id) => avail.has(id)) || !hasEquipment(v, avail) || !usable(v)) continue;
      return { exerciseId: v.id, upgradedFrom: ex.id, chip: upgradeChip(v, r) };
    }
  }
  if (hasEquipment(ex, avail)) return { exerciseId: ex.id };
  const fbId = ex.fallback || (ctx.fallbacks || fallbackRules(exercises)).get(ex.id);
  const fb = fbId && byId(fbId);
  if (fb && hasEquipment(fb, avail) && usable(fb)) return { exerciseId: fb.id, fallbackFrom: ex.id };
  return null;
}

/**
 * Instructions as displayed for the user's equipment (v5): with a door anchor the knot step
 * (`exercise.setupStep`, default 0) is replaced by `setupByEquipment["door-anchor"]`; with band handles
 * `setupByEquipment["band-handles"]` is inserted after it. Without settings → the plain instructions.
 * @param {import('../types.js').Exercise} exercise
 * @param {import('../types.js').Settings|Set<string>|null} [availOrSettings]
 * @returns {string[]}
 */
export function instructionsFor(exercise, availOrSettings) {
  const list = [...(exercise?.instructions || [])];
  const setup = exercise?.setupByEquipment;
  const a = toAvail(availOrSettings);
  if (!setup || !a) return list;
  const at = Math.max(0, Math.min(list.length - 1, exercise.setupStep ?? 0));
  if (setup['door-anchor'] && a.has('door-anchor')) list[at] = setup['door-anchor'];
  if (setup['band-handles'] && a.has('band-handles')) list.splice(at + 1, 0, setup['band-handles']);
  return list;
}

/**
 * „Benötigt: …“ list for the exercise detail: every equipment id with label, icon, base flag and whether it is
 * available. Door anchor / handles appear as optional extras (`optional: true`) when the exercise has a setup text
 * for them.
 * @returns {{id: string, label: string, icon: string, base: boolean, owned: boolean, optional: boolean}[]}
 */
export function equipmentNeeds(exercise, availOrSettings) {
  const a = toAvail(availOrSettings);
  const row = (id, optional) => ({
    id, label: EQUIPMENT_INFO[id]?.label ?? id, icon: EQUIPMENT_INFO[id]?.icon ?? '•',
    base: BASE_EQUIPMENT.includes(id), owned: !a || a.has(id), optional,
  });
  const out = (exercise?.equipment || []).filter((id) => id !== 'none').map((id) => row(id, false));
  for (const id of ['door-anchor', 'band-handles']) if (exercise?.setupByEquipment?.[id]) out.push(row(id, true));
  return out;
}

/** Does the exercise use this equipment id (for the library filter; includes setup extras like the door anchor)? */
export function usesEquipment(exercise, id) {
  return (exercise?.equipment || []).includes(id) || !!exercise?.setupByEquipment?.[id];
}

// ---------------------------------------------------------------- migration helpers (used by store.migrate)

const ROW_IDS = /^row-/;

/** Did this stored session include rowing (separate rowing session, rowing warm-up or finisher)? */
export function sessionUsedRowing(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.kind === 'cardio' || s.rowing || s.warmupRowing || s.finisherRowing) return true;
  return (s.exercises || []).some((e) => (e?.section === 'cardio' || ROW_IDS.test(e?.exerciseId || '')) && (e.sets || []).some((x) => x?.done));
}

/**
 * v5 migration of stored settings (pure; returns a new data object or the input unchanged):
 * runs once when `settings.equipmentModel` is missing — maps legacy ids (`tueranker-griffe` → door-anchor +
 * band-handles …), pre-ticks the rowing machine when nothing is owned yet but sessions with rowing exist (so the
 * update never removes rowing the user does), sets `equipmentModel` and flags the Heute banner
 * (`state.equipmentNotice = "pending"`) for existing users. Never ticks anything else.
 * @param {any} data
 */
export function migrateEquipment(data) {
  if (!data || typeof data !== 'object' || !data.settings || typeof data.settings !== 'object') return data;
  if (data.settings.equipmentModel >= EQUIPMENT_MODEL) return data;
  const stored = Array.isArray(data.settings.ownedEquipment) ? data.settings.ownedEquipment : [];
  let owned = normalizeOwned(stored);
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  if (!stored.length && sessions.some(sessionUsedRowing)) owned = normalizeOwned(['rowing-machine']);
  const existingUser = sessions.length > 0 || stored.length > 0 || !!data.state?.welcomeDone;
  const state = { ...(data.state && typeof data.state === 'object' ? data.state : {}) };
  if (existingUser && state.equipmentNotice == null) state.equipmentNotice = 'pending';
  return { ...data, settings: { ...data.settings, ownedEquipment: owned, equipmentModel: EQUIPMENT_MODEL }, state };
}

/**
 * Names diff for the toggle toast: exercise ids before/after → `{added: string[], removed: string[]}` (names).
 * @param {Iterable<string>} before @param {Iterable<string>} after
 * @param {(id: string) => string} nameOf
 */
export function diffNames(before, after, nameOf = (x) => x) {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: [...a].filter((x) => !b.has(x)).map(nameOf),
    removed: [...b].filter((x) => !a.has(x)).map(nameOf),
  };
}

/** Short German list for toasts: „A, B, C …“ (max n names). */
export function nameList(names, n = 3) {
  const list = [...new Set(names)];
  return list.length > n ? `${list.slice(0, n).join(', ')} …` : list.join(', ');
}
