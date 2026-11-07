// Traffic-light evaluation + level recommendations. PURE – no DOM, no storage.
// See docs/SPEC.md §5.1, §5.2, §7.7.
import { daysBetween } from '../util/date.js';
import { levelOf } from './progression.js';
import { sessionLight } from './stats.js';

/** @typedef {import('../types.js').Light} Light */
/** @typedef {import('../types.js').Session} Session */
/** @typedef {import('../types.js').Recommendation} Recommendation */
/** @typedef {{traffic: Light, reasons: string[], perExercise: Record<string, Light>}} Evaluation */

export const LIGHTS = /** @type {const} */ (['green', 'yellow', 'red', 'stop']);

/** German labels (symbol + text, never colour alone). */
export const LIGHT_LABELS = {
  green: 'Grün – passt',
  yellow: 'Gelb – halten',
  red: 'Rot – zurück',
  stop: 'Stopp – ärztlich abklären',
};

/** @param {Light|null} a @param {Light|null} b @returns {Light} */
export function worst(a, b) {
  const ia = LIGHTS.indexOf(a ?? 'green');
  const ib = LIGHTS.indexOf(b ?? 'green');
  return LIGHTS[Math.max(ia, ib, 0)];
}

const DEFAULT_THR = { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 };
/** @param {import('../types.js').Settings} settings */
export function thresholds(settings) {
  return { ...DEFAULT_THR, ...(settings?.painThresholds || {}) };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Light for a 0–10 pain value. */
function painLight(p, thr) {
  if (p == null) return 'green';
  if (p <= thr.greenMax) return 'green';
  if (p <= thr.yellowMax) return 'yellow';
  return 'red';
}

/** An exercise entry that was actually performed (not skipped, ≥ 1 done set). */
export function performed(e) {
  return !!e && !e.skipped && (e.sets || []).some((s) => s?.done);
}

/**
 * Accumulates criteria → light + German reasons.
 */
function collector() {
  /** @type {Light} */ let light = 'green';
  /** @type {string[]} */ const reasons = [];
  return {
    add(l, reason) {
      light = worst(light, l);
      if (l !== 'green' && reason && !reasons.includes(reason)) reasons.push(reason);
    },
    get light() { return light; },
    reasons,
  };
}

/**
 * Session-level criteria shared by all knee exercises (post, swelling, flags, next day).
 * Does not include the per-exercise `painDuring` / `sharpPain` and not the "2 reds in a row" rule.
 */
function sharedCriteria(session, nextDay, thr) {
  const c = collector();
  const pre = session.pre || null;
  const post = session.post || null;
  const baseline = num(pre?.pain) ?? 0;
  const preSwelling = num(pre?.swelling) ?? 0;

  // ---- stop & consult flags (pre / post / next day)
  if (pre?.mechanical?.locking) c.add('stop', 'Blockieren gemeldet – bitte ärztlich abklären.');
  if (pre?.nightPain) c.add('stop', 'Nachtschmerz – bitte ärztlich abklären.');
  if (pre?.swellingOver48h) c.add('stop', 'Schwellung seit mehr als 48 h – bitte ärztlich abklären.');
  if (pre?.mechanical?.givingWay) c.add('red', 'Wegknicken gemeldet.');

  // ---- after the session
  if (post) {
    const pp = num(post.pain);
    const l = painLight(pp, thr);
    if (l === 'yellow') c.add('yellow', `Schmerz nach dem Training ${pp}/10.`);
    if (l === 'red') c.add('red', `Schmerz nach dem Training ${pp}/10.`);
    const ps = num(post.swelling) ?? 0;
    if (ps > preSwelling) c.add('red', 'Neue bzw. zunehmende Schwellung nach dem Training.');
    else if (ps > 0) c.add('yellow', 'Schwellung vorhanden (nicht zunehmend).');
    const postLocking = post.mechanical?.locking || post.locking;
    const postGivingWay = post.mechanical?.givingWay || post.givingWay;
    if (postLocking) c.add('stop', 'Blockieren gemeldet – bitte ärztlich abklären.');
    if (postGivingWay) c.add('red', 'Wegknicken während des Trainings.');
  }

  // ---- post-op (non-weight-bearing) phase: red flags → contact the doctor (SPEC §12.10)
  if (session.postOp) {
    const DOC = 'Entlastungsphase: bitte Arzt kontaktieren';
    for (const [src, label] of [[pre, 'vor dem Training'], [post, 'nach dem Training'], [nextDay, 'am Folgetag']]) {
      if (!src) continue;
      if (src.redness) c.add('stop', `${DOC} – Rötung/Überwärmung ${label}.`);
      if (src.fever) c.add('stop', `${DOC} – Fieber ${label}.`);
      const pp = num(src.pain);
      if (pp != null && pp > thr.yellowMax) c.add('stop', `${DOC} – Schmerz ${pp}/10 ${label}.`);
    }
    if (post && (num(post.swelling) ?? 0) > preSwelling) c.add('stop', `${DOC} – neue Schwellung.`);
    if (nextDay && (num(nextDay.swelling) ?? 0) > preSwelling) c.add('stop', `${DOC} – neue Schwellung am Folgetag.`);
  }

  // ---- next day
  if (nextDay) {
    const np = num(nextDay.pain);
    if (np != null) {
      const d = np - baseline;
      if (d > 2) c.add('red', `Folgetag-Schmerz ${np}/10 – mehr als +2 über Ausgangswert (${baseline}).`);
      else if (d > 1) c.add('yellow', `Folgetag-Schmerz ${np}/10 – +2 über Ausgangswert (${baseline}).`);
    }
    if ((num(nextDay.swelling) ?? 0) > 0) c.add('red', 'Am Folgetag noch geschwollen – nicht erholt.');
    if ((num(nextDay.stiffness) ?? 0) >= 2) c.add('red', 'Am Folgetag deutlich steif – nicht erholt.');
    if (nextDay.givingWay) c.add('red', 'Wegknicken am Folgetag.');
    if (nextDay.locking) c.add('stop', 'Blockieren am Folgetag – bitte ärztlich abklären.');
    if (nextDay.nightPain) c.add('stop', 'Nachtschmerz – bitte ärztlich abklären.');
  }
  return c;
}

/** Own criteria of one knee exercise entry. */
function exerciseCriteria(e, thr) {
  const c = collector();
  const p = num(e.painDuring);
  const l = painLight(p, thr);
  if (l === 'yellow') c.add('yellow', `Schmerz während der Übung ${p}/10.`);
  if (l === 'red') c.add('red', `Schmerz während der Übung ${p}/10.`);
  if (e.sharpPain) c.add('red', 'Scharfer Schmerz gemeldet.');
  return c;
}

/** Previous done session (excluding `session` itself), newest first. */
function previousDone(session, history) {
  return (history || []).filter((h) => h && h.status === 'done' && h.id !== session?.id);
}

function evaluate(session, nextDay, settings, history) {
  const thr = thresholds(settings);
  const shared = sharedCriteria(session, nextDay, thr);
  const all = collector();
  all.add(shared.light);
  for (const r of shared.reasons) all.reasons.push(r);

  /** @type {Record<string, Light>} */
  const perExercise = {};
  for (const e of session.exercises || []) {
    if (!e || e.skipped) continue;
    const own = exerciseCriteria(e, thr);
    // Sharp pain is a safety flag in any block; painDuring only counts for the knee block and rowing (cardio).
    if (e.section !== 'knee' && e.section !== 'cardio') {
      if (e.sharpPain) all.add('red', 'Scharfer Schmerz gemeldet.');
      continue;
    }
    if (session.postOp && num(e.painDuring) != null && e.painDuring > thr.yellowMax) {
      own.add('stop', `Entlastungsphase: bitte Arzt kontaktieren – Schmerz ${e.painDuring}/10 während der Übung.`);
    }
    all.add(own.light);
    for (const r of own.reasons) if (!all.reasons.includes(r)) all.reasons.push(r);
    const l = worst(own.light, shared.light);
    perExercise[e.exerciseId] = worst(perExercise[e.exerciseId] ?? 'green', l);
  }

  // "2 reds in a row": this session red and the previous done session red (or stop).
  let traffic = all.light;
  if (traffic === 'red') {
    const prev = previousDone(session, history).at(-1);
    const pl = prev ? sessionLight(prev) : null;
    if (pl === 'red' || pl === 'stop') {
      traffic = 'stop';
      all.reasons.push('Zweimal in Folge Rot – bitte ärztlich bzw. physiotherapeutisch abklären.');
      for (const k of Object.keys(perExercise)) if (perExercise[k] === 'red') perExercise[k] = 'stop';
    }
  }
  const reasons = all.reasons.length ? all.reasons : ['Schmerz und Schwellung im grünen Bereich.'];
  return { traffic, reasons, perExercise };
}

/**
 * Provisional light at session end (no next-day data, even if `session.nextDay` is set).
 * @param {Session} session
 * @param {import('../types.js').Settings} settings
 * @param {Session[]} [history] previous completed sessions, oldest first
 * @returns {Evaluation}
 */
export function evaluateSession(session, settings, history = []) {
  return evaluate(session || /** @type {any} */ ({}), null, settings, history);
}

/**
 * Final light including next-day check-in. The final light can only stay or get worse than the
 * stored provisional light. Missing next-day data (`nextDay` and `session.nextDay` null) →
 * same as the provisional evaluation.
 * @param {Session} session
 * @param {import('../types.js').NextDay|null} nextDay
 * @param {import('../types.js').Settings} settings
 * @param {Session[]} [history]
 * @returns {Evaluation}
 */
export function finalizeWithNextDay(session, nextDay, settings, history = []) {
  const s = session || /** @type {any} */ ({});
  const nd = nextDay ?? s.nextDay ?? null;
  const res = evaluate(s, nd, settings, history);
  const prov = s.traffic?.provisional;
  if (prov && LIGHTS.indexOf(prov) > LIGHTS.indexOf(res.traffic)) {
    res.traffic = prov;
    if (res.reasons.length === 1 && res.reasons[0] === 'Schmerz und Schwellung im grünen Bereich.') res.reasons = [];
    res.reasons.push(`Vorläufige Ampel war ${LIGHT_LABELS[prov]}.`);
  }
  return res;
}

/** Evaluation of a stored session: final (with next day) if available, else provisional. */
function evaluateStored(session, settings, history) {
  return session.nextDay ? finalizeWithNextDay(session, session.nextDay, settings, history) : evaluateSession(session, settings, history);
}

/**
 * True during the last 7 days before surgery (1 ≤ daysUntil ≤ 7).
 * @param {string|null} surgeryDate "YYYY-MM-DD"
 * @param {string} today "YYYY-MM-DD"
 */
export function taperActive(surgeryDate, today) {
  if (!surgeryDate || !today) return false;
  const d = daysBetween(today, surgeryDate);
  return d >= 1 && d <= 7;
}

/**
 * Reduce volume ~35 % (sets × 0.65, rounded, min 1). Reps/holds/seconds unchanged.
 * @param {import('../types.js').Level} level
 * @returns {import('../types.js').Level}
 */
export function applyTaper(level) {
  return { ...level, sets: Math.max(1, Math.round((level?.sets ?? 1) * 0.65)) };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function phaseOrder(content, phaseId) {
  return (content?.phases || []).find((p) => p.id === phaseId)?.order ?? null;
}

/** phaseMin rule: exercise allowed in the current phase? Unknown phases → allowed. */
function allowedInPhase(content, exercise, currentPhaseId) {
  const cur = phaseOrder(content, currentPhaseId);
  const min = phaseOrder(content, exercise?.phaseMin);
  return cur == null || min == null || cur >= min;
}

const rec = (exerciseId, action, fromLevel, toLevel, reason, toExerciseId = null) => ({
  exerciseId, action, fromLevel, toLevel, toExerciseId, reason, status: /** @type {const} */ ('pending'),
});

/** Regress one level; at level 0 → `regressTo` exercise (its highest level) or reduce volume. */
function regressRec(ex, id, from, content, reason) {
  if (from > 0) return rec(id, 'regress', from, from - 1, reason);
  const target = ex?.regressTo ? (content?.exercises || []).find((x) => x.id === ex.regressTo) : null;
  if (target) return rec(id, 'regress', from, Math.max(0, target.levels.length - 1), `${reason} Leichtere Übung: ${target.name}.`, target.id);
  return rec(id, 'reduce', from, from, `${reason} Bereits leichteste Stufe – Umfang um 30–50 % reduzieren.`);
}

/** Progress one level; beyond the last level → `progressTo` exercise at level 0 (phaseMin respected). */
function progressRec(ex, id, from, content, state, reason) {
  const last = (ex?.levels?.length ?? 1) - 1;
  if (from < last) return rec(id, 'progress', from, from + 1, reason);
  const target = ex?.progressTo ? (content?.exercises || []).find((x) => x.id === ex.progressTo) : null;
  if (target && allowedInPhase(content, target, state?.phaseId)) {
    return rec(id, 'progress', from, 0, `${reason} Nächste Übung: ${target.name}.`, target.id);
  }
  return rec(id, 'hold', from, from, 'Höchste Stufe erreicht – Niveau halten.');
}

/**
 * Count consecutive qualifying sessions for one exercise at one level, newest first.
 * Sessions without that exercise are skipped (A/B/C rotation); the streak stops (exclusive) at a
 * session that does not qualify, at a different level, or that already produced a progress
 * recommendation for this exercise at this level (so each suggestion needs a fresh streak).
 */
function streakFor(exerciseId, level, sessionsNewestFirst, qualifies) {
  let n = 0;
  for (const s of sessionsNewestFirst) {
    const entries = (s.exercises || []).filter((e) => e.exerciseId === exerciseId && performed(e));
    if (!entries.length) continue;
    if (entries.some((e) => (e.level ?? 0) !== level)) break;
    if ((s.recommendations || []).some((r) => r.exerciseId === exerciseId && r.action === 'progress' && r.fromLevel === level)) break;
    if (!qualifies(s, entries)) break;
    n += 1;
  }
  return n;
}

/**
 * Level suggestions (the app only suggests; user confirms).
 * - stop → only a `consult` recommendation (no knee changes).
 * - knee: red → regress/reduce, yellow → hold, green ×`greenStreakToProgress` at the same level → progress.
 * - archery (RPE): ≥ 9 → regress, 7–8 → hold, ≤ 6 in 2 consecutive sessions → progress.
 * - "One variable at a time": per exercise one level step; at most one progress per block and
 *   session (other eligible exercises get `hold` and progress next time).
 * - Taper (session.taper or taperActive): no progress (hold instead).
 * @param {Session} session
 * @param {Session[]} history previous completed sessions, oldest first
 * @param {import('../types.js').State} state
 * @param {import('../types.js').Content} content
 * @param {import('../types.js').Settings} settings
 * @param {{today?: string}} [opts]
 * @returns {Recommendation[]}
 */
export function recommendLevels(session, history, state, content, settings, { today } = {}) {
  if (!session) return [];
  const thr = thresholds(settings);
  const prev = previousDone(session, history);
  const res = evaluateStored(session, settings, prev);
  const taper = !!session.taper || taperActive(settings?.surgeryDate ?? null, today ?? '');
  /** @type {Recommendation[]} */
  const out = [];

  if (res.traffic === 'stop') {
    const why = res.reasons.filter((r) => /abklären|kontaktieren/.test(r));
    out.push(rec(null, 'consult', null, null, why.join(' ') || 'Bitte ärztlich bzw. physiotherapeutisch abklären.'));
    return out;
  }

  const exById = new Map((content?.exercises || []).map((e) => [e.id, e]));
  const newestFirst = prev.slice().reverse();
  // Per-exercise light of history sessions (recomputed; history before each session).
  const histLight = new Map();
  const lightIn = (s, exerciseId) => {
    if (!histLight.has(s)) {
      const idx = prev.indexOf(s);
      histLight.set(s, evaluateStored(s, settings, idx >= 0 ? prev.slice(0, idx) : []).perExercise);
    }
    return histLight.get(s)[exerciseId];
  };
  const progressedBlocks = new Set();
  const seen = new Set();

  for (const e of session.exercises || []) {
    if (!e || seen.has(e.exerciseId) || !performed(e)) continue;
    if (e.section !== 'knee' && e.section !== 'archery' && e.section !== 'cardio') continue;
    seen.add(e.exerciseId);
    const ex = exById.get(e.exerciseId);
    const id = e.exerciseId;
    const from = levelOf(state, id, ex);
    const block = e.section;

    let wantsProgress = false;
    let reason = '';
    if (block === 'knee') {
      const light = res.perExercise[id] ?? 'green';
      if (light === 'red' || light === 'stop') { out.push(regressRec(ex, id, from, content, 'Ampel Rot.')); continue; }
      if (light === 'yellow') { out.push(rec(id, 'hold', from, from, 'Ampel Gelb – Stufe halten.')); continue; }
      const need = Math.max(1, thr.greenStreakToProgress);
      const cur = (e.level ?? 0) === from ? 1 : 0;
      const n = cur ? cur + streakFor(id, from, newestFirst, (s) => lightIn(s, id) === 'green') : 0;
      if (n >= need) { wantsProgress = true; reason = `${need}× grün in Folge.`; }
      else { out.push(rec(id, 'hold', from, from, `Grün – noch ${need - n}× grün bis zur nächsten Stufe.`)); continue; }
    } else if (block === 'cardio') {
      // Rowing: knee light first (pain during rowing counts), then effort (entry RPE, else post RPE).
      const light = res.perExercise[id] ?? 'green';
      if (light === 'red' || light === 'stop') { out.push(regressRec(ex, id, from, content, 'Ampel Rot beim Rudern.')); continue; }
      if (light === 'yellow') { out.push(rec(id, 'hold', from, from, 'Ampel Gelb – Rudern auf dieser Stufe halten.')); continue; }
      const rpeOf = (s, x) => num(x.rpe) ?? num(s.post?.rpe);
      const rpe = rpeOf(session, e);
      if (rpe == null) continue;
      if (rpe >= 9) { out.push(regressRec(ex, id, from, content, `RPE ${rpe} – zu anstrengend.`)); continue; }
      if (rpe >= 7) { out.push(rec(id, 'hold', from, from, `RPE ${rpe} – Stufe halten.`)); continue; }
      const cur = (e.level ?? 0) === from ? 1 : 0;
      const n = cur ? cur + streakFor(id, from, newestFirst, (s, entries) => lightIn(s, id) === 'green' && entries.every((x) => (rpeOf(s, x) ?? 99) <= 6)) : 0;
      if (n >= 2) { wantsProgress = true; reason = '2× grün und RPE ≤ 6 beim Rudern.'; }
      else { out.push(rec(id, 'hold', from, from, `Rudern locker – noch ${2 - n}× bis zur nächsten Stufe.`)); continue; }
    } else {
      const rpe = num(e.rpe);
      if (rpe == null) continue;
      if (rpe >= 9) { out.push(regressRec(ex, id, from, content, `RPE ${rpe} – zu schwer.`)); continue; }
      if (rpe >= 7) { out.push(rec(id, 'hold', from, from, `RPE ${rpe} – Stufe halten.`)); continue; }
      const cur = (e.level ?? 0) === from ? 1 : 0;
      const n = cur ? cur + streakFor(id, from, newestFirst, (_s, entries) => entries.every((x) => num(x.rpe) != null && x.rpe <= 6)) : 0;
      if (n >= 2) { wantsProgress = true; reason = '2× RPE ≤ 6 in Folge.'; }
      else { out.push(rec(id, 'hold', from, from, `RPE ${rpe} – noch ${2 - n}× locker bis zur nächsten Stufe.`)); continue; }
    }

    if (wantsProgress) {
      if (taper) { out.push(rec(id, 'hold', from, from, 'OP-Woche: Niveau halten, nicht steigern.')); continue; }
      if (progressedBlocks.has(block)) { out.push(rec(id, 'hold', from, from, 'Eine Veränderung nach der anderen – nächstes Mal steigern.')); continue; }
      const r = progressRec(ex, id, from, content, state, reason);
      if (r.action === 'progress') progressedBlocks.add(block);
      out.push(r);
    }
  }
  return out;
}
