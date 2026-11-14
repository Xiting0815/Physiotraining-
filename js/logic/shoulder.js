// v5.3 (SPEC §18.3): shoulder impingement protection. PURE – no DOM, no storage.
// Every exercise carries `shoulderElevationDeg` (max. arm elevation in degrees relative to the trunk, flexion or
// abduction; optional per level `levels[i].shoulderElevationDeg`). When `settings.shoulderImpingement` is on, an
// exercise above `settings.shoulderMaxElevationDeg` (default 65) is not usable – buildSessionPlan replaces it via its
// `fallback` chain or drops it. Exceptions: `archeryDraw: true` (draw at shoulder height – pain-free for the user) and
// rowing (block "cardio": handle stays below shoulder height).

export const DEFAULT_SHOULDER_MAX_DEG = 65;
/** Hint shown with every shoulder exercise while the protection is on. */
export const SHOULDER_NOTE = 'Schmerzarm arbeiten: maximal leichter Schmerz (≤ 3/10) erlaubt, Schmerz darf nicht anhalten. Schulter tief, kein Hochziehen.';
/** Extra hint for the archery draw exercises (exception to the limit). */
export const DRAW_NOTE = 'Auszug auf Schulterhöhe ist erlaubt: Schulter tief, bei Schmerz über 3/10 abbrechen.';

/** Is the shoulder protection on? */
export const shoulderProtect = (settings) => settings?.shoulderImpingement === true;

/** Elevation limit in degrees (null when the protection is off). */
export function shoulderLimit(settings) {
  if (!shoulderProtect(settings)) return null;
  const v = Number(settings?.shoulderMaxElevationDeg);
  return Number.isFinite(v) && v >= 30 && v <= 180 ? v : DEFAULT_SHOULDER_MAX_DEG;
}

/** Max. arm elevation of the exercise at `level` (level value wins, else exercise value, else 0). */
export function elevationOf(exercise, level = 0) {
  const lv = exercise?.levels?.[Math.max(0, Math.min((exercise?.levels?.length || 1) - 1, level ?? 0))];
  const v = lv?.shoulderElevationDeg ?? exercise?.shoulderElevationDeg;
  return Number.isFinite(v) ? v : 0;
}

/** Exempt from the limit (archery draw at shoulder height, rowing). */
export const shoulderExempt = (exercise) => !!exercise?.archeryDraw || exercise?.block === 'cardio';

/**
 * v5.4 (SPEC §19.4): dip-type exercise (`exercise.shoulderDip: true` – lowering the body between the arms pushes the
 * humeral head forward/up under load, typical impingement trigger even at 0° elevation). Not usable while the shoulder
 * protection is on; buildSessionPlan then takes the exercise's fallback chain (triceps press / band triceps extension).
 */
export const isDipExercise = (exercise) => exercise?.shoulderDip === true;

/**
 * Usable with the shoulder settings? Always true when the protection is off.
 * With the protection on: no dip-type exercise (`shoulderDip`) and max. elevation ≤ limit (archery draw / rowing exempt).
 * @param {any} exercise @param {number} [level] @param {any} [settings]
 */
export function shoulderOk(exercise, level, settings) {
  const lim = shoulderLimit(settings);
  if (lim == null || !exercise) return true;
  if (isDipExercise(exercise)) return false;
  if (shoulderExempt(exercise)) return true;
  return elevationOf(exercise, level) <= lim;
}

/** Does the exercise load the shoulder (shows SHOULDER_NOTE)? */
export const isShoulderExercise = (exercise) => (exercise?.shoulderFocus || []).length > 0 || !!exercise?.archeryDraw
  || (exercise?.block === 'archery' && elevationOf(exercise) > 0);

/** Focus tags: "rc" (rotator cuff) / "scapula" (shoulder blade control). */
export const hasFocus = (exercise, f) => (exercise?.shoulderFocus || []).includes(f);
