// v5 (SPEC §16): owned equipment steers the plan. PURE – no DOM, no storage.
// Equipment ids: base items are always available, optional items only when ticked under
// „Meine Ausrüstung“ (`settings.ownedEquipment`).

/** Always available (the user's basic home setup). */
// v5.3 (SPEC §18.1): the former base item "chair" is split into the optional ids `chair-fixed` (fester Stuhl / Hocker
// ohne Rollen) and `office-chair` (PC-Stuhl mit Rollen). Exercises that only need *some* seat use the virtual id
// `seat` (satisfied by either, see ANY_OF); exercises that push/stand up from the seat or load it horizontally need
// `chair-fixed`.
export const BASE_EQUIPMENT = ['theraband', 'loop', 'mat', 'step', 'wall', 'door', 'none'];

/** v5.3: virtual equipment ids satisfied by ANY of the listed ids (anyOf groups). */
export const ANY_OF = { seat: ['chair-fixed', 'office-chair'] };

/** Optional equipment, in the order of the „Meine Ausrüstung“ toggles. */
export const OPTIONAL_EQUIPMENT = [
  { id: 'chair-fixed', label: 'Fester Stuhl / Hocker ohne Rollen', icon: '🪑', hint: 'Aufstehen, Stütz-Dips, Abstützen im Sitz, Fersen-Brücke auf dem Stuhl' },
  { id: 'office-chair', label: 'PC-Stuhl mit Rollen', icon: '💺', hint: 'Nur für ruhige Übungen im Sitzen – Lehne an die Wand, nicht drehen' },
  { id: 'bed-edge', label: 'Bett- oder Sofakante', icon: '🛏️', hint: 'Hinsetzen auf die Bettkante statt Aufstehen vom Stuhl' },
  { id: 'massage-stick', label: 'Massagestab (z. B. Blackroll)', icon: '🦯', hint: 'Oberschenkel-Massage zur Knie-Entlastung' },
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
  seat: { label: 'Sitz (Stuhl oder PC-Stuhl)', icon: '🪑' },
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
export const EQUIPMENT_MODEL = 3;

/** v5.3: setup step inserted for `seat` exercises when only the office chair (with wheels) is owned. */
export const OFFICE_CHAIR_NOTE = 'PC-Stuhl mit der Lehne an die Wand stellen, Rollen feststellen falls möglich, nicht drehen.';

/** v5.3: fixed (old) timestamp for values set by the migration – any real change of the user wins in the sync merge. */
export const MIGRATION_STAMP = '2026-11-01T00:00:00.000Z';

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
  return withVirtual(new Set([...BASE_EQUIPMENT, ...ownedEquipment(settings)]));
}

/** Add the virtual anyOf ids (`seat`) whose group is satisfied. */
function withVirtual(set) {
  for (const [v, ids] of Object.entries(ANY_OF)) if (ids.some((id) => set.has(id))) set.add(v);
  return set;
}

/** Accept a Set, settings object, or null (= everything available). */
function toAvail(availOrSettings) {
  if (availOrSettings == null) return null;
  if (availOrSettings instanceof Set) return availOrSettings;
  if (Array.isArray(availOrSettings)) return withVirtual(new Set([...BASE_EQUIPMENT, ...normalizeOwned(availOrSettings)]));
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

/** v5.3: explicit fallback chain of an exercise (`exercise.fallback`: id or ordered id list). */
export const fallbackList = (ex) => (Array.isArray(ex?.fallback) ? ex.fallback : ex?.fallback ? [ex.fallback] : []).filter((x) => typeof x === 'string');

/**
 * Resolve one workout item against the available equipment (and, v5.3, everything `usable` checks: phaseMin,
 * post-op block, user toggle, shoulder limit).
 * - `allowUpgrade` and an upgrade rule whose equipment is available and whose variant passes `usable` → the variant
 *   (`{exerciseId: variant, upgradedFrom: base, chip}`);
 * - exercise equipment available and `usable` → itself;
 * - else the first fallback that is available, usable and not `taken` → `{exerciseId, fallbackFrom}`: the explicit
 *   chain (`exercise.fallback`, id or list, tried in order) first, then the base of an upgrade rule;
 * - else `null` (drop it).
 * Without `usable` (legacy callers) only the equipment decides, as in v5.
 * @param {string} exerciseId
 * @param {{exercises: import('../types.js').Exercise[], avail: Set<string>|null, usable?: (ex: any) => boolean,
 *   allowUpgrade?: boolean, rules?: Map<string, any[]>, fallbacks?: Map<string, string>, taken?: (id: string) => boolean}} ctx
 * @returns {{exerciseId: string, upgradedFrom?: string, fallbackFrom?: string, chip?: string}|null}
 */
export function resolveExercise(exerciseId, ctx) {
  const exercises = ctx.exercises || [];
  const byId = (id) => exercises.find((e) => e.id === id);
  const usable = ctx.usable || (() => true);
  const taken = ctx.taken || (() => false);
  const avail = ctx.avail ?? null;
  const ex = byId(exerciseId);
  if (!ex) return null;
  if (ctx.allowUpgrade !== false && avail) {
    const rules = (ctx.rules || upgradeRules(exercises)).get(exerciseId) || [];
    for (const r of rules) {
      const v = byId(r.exerciseId);
      if (!v || !r.equipment.every((id) => avail.has(id)) || !hasEquipment(v, avail) || !usable(v) || taken(v.id)) continue;
      return { exerciseId: v.id, upgradedFrom: ex.id, chip: upgradeChip(v, r) };
    }
  }
  if (hasEquipment(ex, avail) && usable(ex)) return { exerciseId: ex.id };
  const derived = (ctx.fallbacks || fallbackRules(exercises)).get(ex.id);
  const chain = [...fallbackList(ex), ...(derived ? [derived] : [])];
  for (const id of chain) {
    const fb = byId(id);
    if (fb && fb.id !== ex.id && hasEquipment(fb, avail) && usable(fb) && !taken(fb.id)) return { exerciseId: fb.id, fallbackFrom: ex.id };
  }
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
  const chairNote = officeChairOnly(exercise, a);
  if (!setup || !a) return chairNote ? [OFFICE_CHAIR_NOTE, ...list] : list;
  const at = Math.max(0, Math.min(list.length - 1, exercise.setupStep ?? 0));
  if (setup['door-anchor'] && a.has('door-anchor')) list[at] = setup['door-anchor'];
  if (setup['band-handles'] && a.has('band-handles')) list.splice(at + 1, 0, setup['band-handles']);
  return chairNote ? [OFFICE_CHAIR_NOTE, ...list] : list;
}

/** v5.3: true when the exercise needs a `seat` and only the office chair with wheels is available. */
export function officeChairOnly(exercise, availOrSettings) {
  const a = toAvail(availOrSettings);
  return !!a && (exercise?.equipment || []).includes('seat') && a.has('office-chair') && !a.has('chair-fixed');
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
 * Equipment / v5.3 migration of stored settings (pure; returns a new data object or the input unchanged). Runs while
 * `settings.equipmentModel < EQUIPMENT_MODEL`:
 * - model < 2 (v5): maps legacy ids (`tueranker-griffe` → door-anchor + band-handles …), pre-ticks the rowing machine
 *   when nothing is owned yet but sessions with rowing exist, flags `state.equipmentNotice = "pending"` for existing
 *   users. Never ticks anything else.
 * - model < 3 (v5.3, SPEC §18.1/§18.4): the former base „Stuhl“ is NOT carried over as `chair-fixed`; users who already
 *   trained (sessions) had some chair → `office-chair` is ticked (unless the user already toggled it, `_equipmentAt`),
 *   existing users get the one-time Heute notice `state.seatNotice = "pending"`, and the shoulder protection
 *   (`settings.shoulderImpingement: true`, `shoulderMaxElevationDeg: 65`) is switched on for users with sessions.
 *   Migrated values get the fixed old stamp MIGRATION_STAMP so any real change of the user wins in the sync merge.
 * @param {any} data
 */
export function migrateEquipment(data) {
  if (!data || typeof data !== 'object' || !data.settings || typeof data.settings !== 'object') return data;
  const model = Number.isFinite(data.settings.equipmentModel) ? data.settings.equipmentModel : 0;
  if (model >= EQUIPMENT_MODEL) return data;
  const stored = Array.isArray(data.settings.ownedEquipment) ? data.settings.ownedEquipment : [];
  let owned = normalizeOwned(stored);
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const existingUser = sessions.length > 0 || stored.length > 0 || !!data.state?.welcomeDone;
  const state = { ...(data.state && typeof data.state === 'object' ? data.state : {}) };
  const settings = { ...data.settings };
  if (model < 2) {
    if (!stored.length && sessions.some(sessionUsedRowing)) owned = normalizeOwned(['rowing-machine']);
    if (existingUser && state.equipmentNotice == null) state.equipmentNotice = 'pending';
  }
  const eqAt = { ...(settings._equipmentAt && typeof settings._equipmentAt === 'object' ? settings._equipmentAt : {}) };
  const upAt = { ...(settings._updatedAt && typeof settings._updatedAt === 'object' ? settings._updatedAt : {}) };
  if (sessions.length > 0 && !eqAt['office-chair'] && !owned.includes('office-chair')) {
    owned = normalizeOwned([...owned, 'office-chair']);
    eqAt['office-chair'] = MIGRATION_STAMP;
  }
  if (existingUser && state.seatNotice == null) state.seatNotice = 'pending';
  if (sessions.length > 0 && typeof settings.shoulderImpingement !== 'boolean') {
    settings.shoulderImpingement = true;
    if (!upAt.shoulderImpingement) upAt.shoulderImpingement = MIGRATION_STAMP;
    if (!Number.isFinite(settings.shoulderMaxElevationDeg)) {
      settings.shoulderMaxElevationDeg = 65;
      if (!upAt.shoulderMaxElevationDeg) upAt.shoulderMaxElevationDeg = MIGRATION_STAMP;
    }
  }
  return { ...data, settings: { ...settings, ownedEquipment: owned, equipmentModel: EQUIPMENT_MODEL, _equipmentAt: eqAt, _updatedAt: upAt }, state };
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
