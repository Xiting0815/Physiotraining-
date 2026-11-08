// Rowing (cardio) helpers. PURE. See docs/SPEC.md §12.4.
import { cardioSessions, doneSessions, warmupRowingSec } from './stats.js';
import { levelOf } from './progression.js';

/** Labels for level.intensity (German UI copy). */
export const INTENSITY_LABELS = { easy: 'locker', moderate: 'gleichmäßig', vigorous: 'zügig' };

/** Plausible ranges for values read off the rowing machine display (inclusive). */
export const ROWING_RANGES = {
  durationSec: [60, 4 * 3600],
  distanceM: [50, 50000],
  avgSpm: [10, 45],
  avgWatt: [10, 600],
  kcalDisplay: [1, 2500],
  avgHr: [40, 210],
  maxHr: [40, 220],
};

/**
 * Guided timer phases for a cardio session plan (entries in order: warmup → cardio → cooldown).
 * - level.phases (technique drills) → one phase per drill;
 * - else `sets` work phases of `seconds`; between sets a rest phase of `rest` seconds
 *   (`restActive: true` → label „locker rudern“, intensity easy; otherwise „Pause“);
 * - skipped entries are left out. Every phase: `{exerciseId, entryIndex, label, seconds, intensity,
 *   kind: 'work'|'rest', targetSpm: [lo,hi]|null, targetRpe: [lo,hi]|null, set, sets}`.
 * @param {import('../types.js').Session} plan
 * @param {import('../types.js').Content} content
 */
export function rowingPhases(plan, content) {
  const out = [];
  (plan?.exercises || []).forEach((e, entryIndex) => {
    if (e?.skipped) return;
    const ex = (content?.exercises || []).find((x) => x.id === e.exerciseId);
    if (!ex) return;
    const lvl = ex.levels?.[e.level ?? 0] ?? ex.levels?.[0];
    if (!lvl) return;
    const base = { exerciseId: ex.id, entryIndex, targetSpm: lvl.targetSpm ?? null, targetRpe: lvl.targetRpe ?? null };
    if (Array.isArray(lvl.phases) && lvl.phases.length) {
      lvl.phases.forEach((p, i) => out.push({ ...base, label: p.label, ...(p.say ? { say: p.say } : {}), seconds: p.seconds, intensity: p.intensity ?? lvl.intensity ?? 'easy', kind: 'work', set: i + 1, sets: lvl.phases.length }));
      return;
    }
    const sets = Math.max(1, e.plannedSets ?? lvl.sets ?? 1);
    const seconds = e.override?.seconds ?? lvl.seconds ?? 60;
    for (let i = 0; i < sets; i++) {
      out.push({ ...base, label: sets > 1 ? `${ex.name} ${i + 1}/${sets}` : ex.name, seconds, intensity: lvl.intensity ?? 'moderate', kind: 'work', set: i + 1, sets });
      if (i < sets - 1 && (lvl.rest ?? 0) > 0) {
        out.push({ ...base, label: lvl.restActive ? 'Locker rudern' : 'Pause', seconds: lvl.rest, intensity: 'easy', kind: 'rest', set: i + 1, sets, targetRpe: lvl.restActive ? [2, 3] : null });
      }
    }
  });
  return out;
}

/** Total planned seconds of rowingPhases(). */
export const rowingPlannedSeconds = (plan, content) => rowingPhases(plan, content).reduce((a, p) => a + p.seconds, 0);

/**
 * Validate display values (all optional). Empty strings / null → dropped. Returns cleaned numbers and
 * German error messages for out-of-range values (`errors` keyed by field).
 * @param {Partial<import('../types.js').RowingLog>} input
 * @returns {{ok: boolean, value: import('../types.js').RowingLog, errors: Record<string, string>}}
 */
export function validateRowing(input) {
  const value = /** @type {any} */ ({});
  const errors = {};
  for (const [k, [lo, hi]] of Object.entries(ROWING_RANGES)) {
    const raw = input?.[k];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) { errors[k] = 'Bitte eine Zahl eingeben.'; continue; }
    if (n < lo || n > hi) { errors[k] = `Bitte einen Wert zwischen ${lo} und ${hi} eingeben.`; continue; }
    value[k] = Math.round(n * 10) / 10;
  }
  if (value.avgHr != null && value.maxHr != null && value.maxHr < value.avgHr) errors.maxHr = 'Maximalpuls ist kleiner als der Durchschnittspuls.';
  return { ok: Object.keys(errors).length === 0, value, errors };
}

/**
 * Pace per 500 m in seconds (null if not computable).
 * @param {{durationSec?: number, distanceM?: number}} r
 */
export function pacePer500(r) {
  if (!r?.durationSec || !r?.distanceM) return null;
  return Math.round((r.durationSec / r.distanceM) * 500);
}

/**
 * v4: rowing logs of all done sessions: cardio sessions (`rowing`) and strength sessions with rowing inside
 * (`warmupRowing` + `finisherRowing` merged, durationSec = `inSessionRowingSec`). → `[{session, log, warmup}]`.
 * @param {import('../types.js').Session[]} sessions
 */
export function rowingLogs(sessions) {
  const out = [];
  for (const s of doneSessions(sessions)) {
    if (cardioSessions([s]).length) { out.push({ session: s, log: s.rowing || {}, warmup: false }); continue; }
    const sec = warmupRowingSec(s);
    if (!(sec > 0 || s.warmupRowing || s.finisherRowing)) continue;
    // warm-up and finisher of one session are merged into one log (distance/kcal added, avg values from the warm-up)
    const w = s.warmupRowing || {};
    const f = s.finisherRowing || {};
    const log = { ...f, ...w };
    for (const k of ['distanceM', 'kcalDisplay']) if (w[k] != null || f[k] != null) log[k] = (w[k] ?? 0) + (f[k] ?? 0);
    if (sec > 0) log.durationSec = sec;
    out.push({ session: s, log, warmup: true });
  }
  return out;
}

/**
 * Totals over done rowing: separate rowing sessions plus (v4) rowing warm-ups of strength sessions.
 * `sessions` counts rowing sessions only, `warmups` the strength sessions with a rowing warm-up.
 * @param {import('../types.js').Session[]} sessions
 * @returns {{sessions: number, warmups: number, distanceM: number, durationSec: number, kcalDisplay: number}}
 */
export function rowingTotals(sessions) {
  let distanceM = 0, durationSec = 0, kcalDisplay = 0, n = 0, warmups = 0;
  for (const { log, warmup } of rowingLogs(sessions)) {
    if (warmup) warmups += 1; else n += 1;
    distanceM += log.distanceM ?? 0;
    durationSec += log.durationSec ?? 0;
    kcalDisplay += log.kcalDisplay ?? 0;
  }
  return { sessions: n, warmups, distanceM, durationSec, kcalDisplay };
}

/**
 * Best rowing values (for PR chips): longest distance, best avg watt, longest duration.
 * v4: entered display values of rowing warm-ups count too.
 * @param {import('../types.js').Session[]} sessions
 */
export function rowingRecords(sessions) {
  const best = { distanceM: null, avgWatt: null, durationSec: null };
  for (const { session: s, log } of rowingLogs(sessions)) {
    for (const k of Object.keys(best)) {
      const v = log[k];
      if (typeof v === 'number' && (best[k] == null || v > best[k].value)) best[k] = { value: v, sessionId: s.id };
    }
  }
  return best;
}

/**
 * Level label of the main rowing exercise of a cardio workout for the current state (for cards).
 * @param {import('../types.js').Workout} workout
 * @param {import('../types.js').Content} content
 * @param {import('../types.js').State} state
 */
export function cardioMainLabel(workout, content, state) {
  const it = workout?.blocks?.[0]?.items?.[0];
  const ex = (content?.exercises || []).find((x) => x.id === it?.exerciseId);
  if (!ex) return '';
  return ex.levels[levelOf(state, ex.id, ex)]?.label ?? '';
}
