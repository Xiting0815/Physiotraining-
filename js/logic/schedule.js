// Phase schedule (time-based recommendation) and post-op phase gating. PURE. See docs/SPEC.md §12.9, §12.10.
// Phase changes stay criteria-based and user-confirmed; the schedule is only a recommendation.
import { addDays, daysBetween } from '../util/date.js';

export const DEFAULT_SURGERY_DATE = '2027-01-05';
export const TAPER_DAYS = 7;
export const POSTOP_DAYS = 42; // 6 weeks non-weight-bearing after microfracture

/** Suggested surgery date to pre-fill (only while the user has none). */
export function suggestedSurgeryDate(settings) {
  if (settings?.surgeryDate) return null;
  return settings?.surgeryDateSuggested ?? DEFAULT_SURGERY_DATE;
}

const kindOf = (p) => p?.kind ?? 'prehab';

/**
 * Time plan per phase, planned backwards from the surgery date:
 * last prehab phase ends the day before surgery and lasts floor(plannedWeeks·7) days (p3: 2.5 w → 17 days),
 * the one before it the same way, the first prehab phase starts at `prehabStart` (open start, may be longer/shorter).
 * Post-op phases start on the surgery date and last floor(plannedWeeks·7) days (p4: 42).
 * @param {import('../types.js').Phase[]} phases
 * @param {string|null} surgeryDate
 * @param {{prehabStart?: string|null}} [opts]
 * @returns {{phaseId: string, kind: string, start: string|null, end: string|null, days: number|null}[]|null} null without date
 */
export function phaseSchedule(phases, surgeryDate, { prehabStart = null } = {}) {
  if (!surgeryDate) return null;
  const sorted = (phases || []).slice().sort((a, b) => a.order - b.order);
  const pre = sorted.filter((p) => kindOf(p) === 'prehab');
  const post = sorted.filter((p) => kindOf(p) === 'postop');
  const out = new Map();
  let end = addDays(surgeryDate, -1);
  for (let i = pre.length - 1; i >= 0; i--) {
    const p = pre[i];
    const days = Math.max(1, Math.floor((p.plannedWeeks ?? 3) * 7));
    let start = i === 0 ? (prehabStart ?? addDays(end, -(days - 1))) : addDays(end, -(days - 1));
    if (start > end) start = end;
    out.set(p.id, { phaseId: p.id, kind: 'prehab', start, end, days: daysBetween(start, end) + 1 });
    end = addDays(start, -1);
  }
  let s = surgeryDate;
  for (const p of post) {
    const days = Math.max(1, Math.floor((p.plannedWeeks ?? 6) * 7));
    out.set(p.id, { phaseId: p.id, kind: 'postop', start: s, end: addDays(s, days - 1), days });
    s = addDays(s, days);
  }
  return sorted.map((p) => out.get(p.id)).filter(Boolean);
}

/** Taper start (surgery − 7 days) or null. */
export const taperStart = (surgeryDate) => (surgeryDate ? addDays(surgeryDate, -TAPER_DAYS) : null);

/**
 * Compare the user's phase with the schedule.
 * @returns {{expectedPhaseId: string|null, status: 'none'|'onTrack'|'ahead'|'behind', daysLeftInPhase: number|null, text: string|null}}
 */
export function scheduleHint(phases, settings, state, today) {
  const sched = phaseSchedule(phases, settings?.surgeryDate ?? null, { prehabStart: settings?.prehabStart ?? null });
  if (!sched) return { expectedPhaseId: null, status: 'none', daysLeftInPhase: null, text: null };
  const exp = sched.find((x) => (x.start == null || x.start <= today) && (x.end == null || today <= x.end))
    ?? (today < (sched[0]?.start ?? today) ? sched[0] : sched.at(-1));
  const order = (id) => (phases || []).find((p) => p.id === id)?.order ?? 0;
  const name = (id) => (phases || []).find((p) => p.id === id)?.name ?? id;
  const cur = state?.phaseId;
  const daysLeftInPhase = exp?.end ? daysBetween(today, exp.end) : null;
  if (!exp || exp.phaseId === cur) {
    return { expectedPhaseId: exp?.phaseId ?? null, status: 'onTrack', daysLeftInPhase,
      text: daysLeftInPhase != null && daysLeftInPhase >= 0 ? `Im Zeitplan – laut Plan noch ${daysLeftInPhase + 1} Tage in dieser Phase.` : 'Im Zeitplan.' };
  }
  if (exp.kind === 'postop') {
    return { expectedPhaseId: exp.phaseId, status: 'behind', daysLeftInPhase, text: 'Die OP liegt hinter dir – die Entlastungsphase startest du nach der Freigabe durch Arzt/Physio.' };
  }
  if (order(exp.phaseId) > order(cur)) {
    return { expectedPhaseId: exp.phaseId, status: 'behind', daysLeftInPhase,
      text: `Laut Zeitplan wäre jetzt „${name(exp.phaseId)}“ dran. Wechsle, sobald die Kriterien passen – Qualität vor Tempo.` };
  }
  return { expectedPhaseId: exp.phaseId, status: 'ahead', daysLeftInPhase, text: 'Du bist dem Zeitplan voraus – gut so, solange das Knie ruhig bleibt.' };
}

/**
 * Post-op phase gate & progress.
 * unlocked = surgery date passed (today > surgeryDate) AND `state.postOpClearance.confirmedAt` set.
 * ended = ≥ 42 days since surgery OR `state.postOpEndClearance.confirmedAt` (doctor's release) → show endNote
 * „Reha-Phase mit Physio planen“.
 * @returns {{surgeryPassed: boolean, cleared: boolean, unlocked: boolean, daysSince: number|null, week: number|null,
 *   daysLeft: number|null, ended: boolean, reasons: string[], message: string|null}}
 */
export function postOpStatus(settings, state, today) {
  const sd = settings?.surgeryDate ?? null;
  const daysSince = sd ? daysBetween(sd, today) : null;
  const surgeryPassed = daysSince != null && daysSince >= 1;
  const cleared = !!state?.postOpClearance?.confirmedAt;
  const reasons = [];
  if (!sd) reasons.push('Kein OP-Termin eingetragen.');
  else if (!surgeryPassed) reasons.push('Die Entlastungsphase startet erst nach der OP.');
  if (!cleared) reasons.push('Bitte bestätige die Freigabe durch Arzt/Physio.');
  const unlocked = surgeryPassed && cleared;
  const ended = surgeryPassed && (daysSince >= POSTOP_DAYS || !!state?.postOpEndClearance?.confirmedAt);
  return {
    surgeryPassed, cleared, unlocked, daysSince,
    week: surgeryPassed ? Math.floor((daysSince - 1) / 7) + 1 : null,
    daysLeft: surgeryPassed ? Math.max(0, POSTOP_DAYS - daysSince) : null,
    ended, reasons: unlocked ? [] : reasons,
    message: ended ? 'Entlastungsphase geschafft – Reha-Phase mit Physio planen.' : null,
  };
}

/**
 * Can the user start/switch to `phase` now? Prehab phases: always (criteria are confirmed by the user).
 * Post-op phases: only when postOpStatus().unlocked.
 */
export function canEnterPhase(phase, settings, state, today) {
  if (kindOf(phase) !== 'postop') return { ok: true, reasons: [] };
  const st = postOpStatus(settings, state, today);
  return { ok: st.unlocked, reasons: st.reasons };
}

/** State patch for the clearance confirmation. @returns {{confirmedAt: string, note: string}} */
export const clearance = (note = '', now = new Date()) => ({ confirmedAt: now.toISOString(), note: String(note).slice(0, 500) });
