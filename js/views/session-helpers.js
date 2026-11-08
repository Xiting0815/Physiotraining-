// Session flow helpers (WP-Session-flow). Mostly PURE (Node-testable): dose/set bookkeeping,
// pre-check assessment, finishing a session, next-day check-in, recommendation decisions.
// The few DOM helpers at the bottom (toast, sheet, styles) only touch `document` when called.
// See docs/SPEC.md §4.2, §5, §6.7, §8.
import { evaluateSession, finalizeWithNextDay, recommendLevels, thresholds, LIGHT_LABELS, worst } from '../logic/traffic-light.js';
import { rotationAfter, applyRecommendation, getWorkout, workoutKind } from '../logic/progression.js';
import { xpFor, levelFor, evaluateBadges, sessionScore, XP } from '../logic/motivation.js';
import { doneSessions, sessionLight, personalRecords, newRecords, dayOf, isCardioSession } from '../logic/stats.js';
import { rowingRecords, pacePer500, INTENSITY_LABELS } from '../logic/cardio.js';
import { sessionKcal, bodyWeightKg } from '../logic/energy.js';
import { exerciseCuePlan } from '../logic/cues.js';
import { todayISO, toISODate } from '../util/date.js';
import { html, raw } from '../render.js';

/** @typedef {import('../types.js').Session} Session */

export const SECTIONS = ['warmup', 'knee', 'archery', 'cooldown'];
export const SECTION_LABELS = { warmup: 'Aufwärmen', knee: 'Knie-Block', archery: 'Bogen-Block', cooldown: 'Cool-down', cardio: 'Rudern' };
export const SWELLING_LABELS = ['keine', 'leicht', 'deutlich'];
export const RECORD_LABELS = { longestHold: 'Längster Hold', mostReps: 'Meiste Wdh.', strongestBand: 'Stärkstes Band' };
export const ROW_RECORD_LABELS = { distanceM: 'Längste Strecke', avgWatt: 'Beste Ø-Leistung', durationSec: 'Längste Ruderzeit' };
export const KIND_LABELS = { strength: 'Krafttraining', short: 'Kurztraining', cardio: 'Rudern', custom: 'Eigenes Workout' };
/** Post-op red flag reason prefix used by the traffic light (SPEC §12.10). */
export const DOC_PREFIX = 'Entlastungsphase: bitte Arzt kontaktieren';
export { LIGHT_LABELS };

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const exOf = (content, id) => (content?.exercises || []).find((e) => e.id === id);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Is this entry part of the knee load (knee block or a knee exercise used as warm-up)? */
export function isKneeEntry(entry, content) {
  return entry?.section === 'knee' || exOf(content, entry?.exerciseId)?.block === 'knee';
}

/**
 * Effective prescription of an entry: level values + user overrides (`entry.override`) +
 * planned set count (`entry.plannedSets`, already tapered by buildSessionPlan).
 * Rest between sets: `settings.restDefault` (seconds) when set, else the level's `rest`
 * (levels with `rest: 0` keep no rest).
 * @param {any} entry @param {any} exercise @param {import('../types.js').Settings} [settings]
 */
export function doseFor(entry, exercise, settings) {
  const lvl = exercise?.levels?.[entry?.level ?? 0] ?? exercise?.levels?.[0] ?? {};
  const o = entry?.override || {};
  return {
    type: exercise?.type ?? 'reps',
    sets: Math.max(1, entry?.plannedSets ?? lvl.sets ?? 1),
    reps: o.reps ?? lvl.reps ?? null,
    hold: o.hold ?? lvl.hold ?? null,
    seconds: o.seconds ?? lvl.seconds ?? null,
    band: 'band' in o ? o.band : lvl.band ?? null,
    tempo: lvl.tempo ?? null,
    rest: restFor(lvl, settings),
    restBetween: isNum(lvl.restBetween) ? lvl.restBetween : 3,
    label: lvl.label ?? '',
    perSide: exercise?.side === 'perSide',
    side: exercise?.side ?? 'both',
  };
}

function restFor(lvl, settings) {
  const base = isNum(lvl.rest) ? lvl.rest : 30;
  const def = settings?.restDefault;
  return isNum(def) && def >= 0 && base !== 0 ? def : base;
}

/** Values logged for one done set (SPEC §6.7 set shape; `seconds` for timed exercises). */
export function setValues(dose) {
  const v = { reps: null, hold: null, band: dose.band ?? null };
  if (dose.type === 'timed') { v.seconds = dose.seconds ?? null; delete v.reps; delete v.hold; }
  else {
    v.reps = dose.reps ?? null;
    v.hold = dose.type === 'hold' ? (dose.hold ?? null) : null;
  }
  return v;
}

export const doneCount = (entry) => (entry?.sets || []).filter((s) => s?.done).length;

/** First planned set index that is not done, or -1. */
export function nextOpenSet(entry, planned) {
  for (let i = 0; i < planned; i++) if (!entry?.sets?.[i]?.done) return i;
  return -1;
}

/** Mark set `idx` done (mutates entry). Earlier missing slots are filled with `{done:false}`. */
export function markSet(entry, idx, values, at = new Date().toISOString()) {
  entry.sets = entry.sets || [];
  while (entry.sets.length < idx) entry.sets.push({ done: false });
  entry.sets[idx] = { done: true, ...values, at };
  entry.skipped = false;
  return entry;
}

/** Undo set `idx` (mutates entry); trailing not-done slots are trimmed. */
export function unmarkSet(entry, idx) {
  if (!entry?.sets?.[idx]) return entry;
  entry.sets[idx] = { done: false };
  while (entry.sets.length && !entry.sets.at(-1)?.done) entry.sets.pop();
  return entry;
}

/** XP shown for one set (perSet + clean bonus while the exercise is still pain-clean). */
export function setXp(entry, settings) {
  const greenMax = thresholds(settings).greenMax;
  const clean = (entry?.painDuring == null || entry.painDuring <= greenMax) && !entry?.sharpPain;
  return XP.perSet + (clean ? XP.cleanSetBonus : 0);
}

/** XP collected so far in an active session (without the finish bonus). */
export const liveXp = (session, settings) => xpFor({ ...session, status: 'active' }, settings);

/** Entries the user still walks through (pre-check "upper body only" hides knee entries). */
export const isVisible = (entry) => !(entry?.skipped && entry.skipReason === 'precheck');

export function nextIndex(session, from) {
  const list = session?.exercises || [];
  for (let i = from + 1; i < list.length; i++) if (isVisible(list[i])) return i;
  return -1;
}
export function prevIndex(session, from) {
  const list = session?.exercises || [];
  for (let i = from - 1; i >= 0; i--) if (isVisible(list[i])) return i;
  return -1;
}
export const firstIndex = (session) => nextIndex(session, -1);

/** Position counters for the header: {pos, total} over visible entries, and per section. */
export function positionOf(session, index) {
  const vis = (session?.exercises || []).map((e, i) => ({ e, i })).filter(({ e }) => isVisible(e));
  const pos = vis.findIndex((x) => x.i === index) + 1;
  const sec = session?.exercises?.[index]?.section;
  const inSec = vis.filter(({ e }) => e.section === sec);
  return { pos, total: vis.length, secPos: inSec.findIndex((x) => x.i === index) + 1, secTotal: inSec.length };
}

/**
 * Pre-check assessment (before any exercise). Combines the stop/red flags of the traffic light with
 * pre pain/swelling and the last sessions' lights.
 * @returns {{light: 'green'|'yellow'|'red'|'stop', reasons: string[], consult: boolean, showCard: boolean}}
 */
export function assessPreCheck(pre, settings, history = [], { postOp = false } = {}) {
  const thr = thresholds(settings);
  const ev = evaluateSession({ pre, exercises: [], post: null, ...(postOp ? { postOp: true } : {}) }, settings, []);
  let light = ev.traffic;
  const reasons = ev.traffic === 'green' ? [] : ev.reasons.slice();
  const add = (l, r) => { light = worst(light, l); if (r && !reasons.includes(r)) reasons.push(r); };
  if (isNum(pre?.pain)) {
    if (pre.pain > thr.yellowMax) add('red', `Schmerz vor dem Training ${pre.pain}/10 – heute schonend.`);
    else if (pre.pain > thr.greenMax) add('yellow', `Schmerz vor dem Training ${pre.pain}/10.`);
  }
  if (pre?.swelling >= 2) add('red', 'Deutliche Schwellung vor dem Training.');
  else if (pre?.swelling === 1) add('yellow', 'Leichte Schwellung vor dem Training.');
  const done = doneSessions(history);
  const l1 = sessionLight(done.at(-1));
  const l2 = sessionLight(done.at(-2));
  if (l1 === 'stop') add('stop', 'Die letzte Einheit endete mit „Stopp“ – bitte ärztlich abklären.');
  else if (l1 === 'red' && (l2 === 'red' || l2 === 'stop')) add('stop', 'Zweimal in Folge Rot – bitte ärztlich bzw. physiotherapeutisch abklären.');
  else if (l1 === 'red') add('red', 'Die letzte Einheit war Rot – heute lieber leichter.');
  const doctor = reasons.some((r) => r.startsWith(DOC_PREFIX));
  return { light, reasons, consult: light === 'stop', showCard: light === 'red' || light === 'stop', doctor };
}

/** True when the traffic reasons contain a post-op „Arzt kontaktieren“ red flag. */
export const needsDoctor = (reasons) => (reasons || []).some((r) => String(r).startsWith(DOC_PREFIX));

/** Pre-check choice „Nur Oberkörper“: knee entries are skipped (mutates + returns session). */
export function applyUpperBodyOnly(session, content) {
  for (const e of session.exercises || []) {
    if (isKneeEntry(e, content)) { e.skipped = true; e.skipReason = 'precheck'; }
  }
  session.mode = 'upper';
  return session;
}

/** Pre-check choice „Leichtere Varianten“: knee entries one level lower (or ~40 % fewer sets at level 0). */
export function applyLighterVariants(session, content) {
  for (const e of session.exercises || []) {
    if (!isKneeEntry(e, content)) continue;
    const ex = exOf(content, e.exerciseId);
    const planned = e.plannedSets ?? ex?.levels?.[e.level ?? 0]?.sets ?? 1;
    if ((e.level ?? 0) > 0 && ex) {
      e.level -= 1;
      const sets = ex.levels[e.level]?.sets ?? planned;
      e.plannedSets = session.taper ? Math.max(1, Math.round(sets * 0.65)) : sets;
    } else {
      e.plannedSets = Math.max(1, Math.round(planned * 0.6));
    }
    e.lighter = true;
  }
  session.mode = 'light';
  return session;
}

/** Active seconds of a session (wall time minus pauses). */
export function durationSec(session, now = new Date()) {
  const start = Date.parse(session?.startedAt);
  if (!Number.isFinite(start)) return 0;
  const end = session?.endedAt ? Date.parse(session.endedAt) : now.getTime();
  const paused = (session?.pausedMs || 0) + (session?.pausedAt && !session?.endedAt ? now.getTime() - Date.parse(session.pausedAt) : 0);
  return Math.max(0, Math.round((end - start - paused) / 1000));
}

/** Hold seconds of done sets in one session (hold × reps). */
export function sessionHoldSeconds(session) {
  let sum = 0;
  for (const e of session?.exercises || []) {
    if (e.skipped) continue;
    for (const s of e.sets || []) if (s?.done && s.hold) sum += s.hold * (s.reps || 1);
  }
  return sum;
}

/** {done, planned} set counts of a session. */
export function setTotals(session) {
  let done = 0, planned = 0;
  for (const e of session?.exercises || []) {
    if (e.skipReason === 'precheck') continue;
    done += doneCount(e);
    planned += Math.max(e.plannedSets ?? 0, (e.sets || []).length);
  }
  return { done, planned };
}

/** When the next-day check-in becomes due: 12 h after the end or the next local midnight, whichever is first. */
export function nextDayDueAt(endedAt) {
  const end = new Date(endedAt);
  const plus12 = end.getTime() + 12 * 3600e3;
  const midnight = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  return new Date(Math.min(plus12, midnight)).toISOString();
}

/**
 * The session awaiting a next-day check-in: the most recent DONE session if it has no `nextDay`.
 * `due` = check-in is open (≥ 12 h after end or from the next calendar day). Sessions older than
 * `maxDays` (default 4, same as ui.pendingNextDay) are not offered anymore.
 * @param {Session[]} sessions
 * @returns {{session: Session, due: boolean, dueAt: string}|null}
 */
export function pendingNextDay(sessions, now = new Date(), { maxDays = 4 } = {}) {
  const last = doneSessions(sessions).filter((s) => s.endedAt).sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt)).at(-1);
  if (!last || last.nextDay) return null;
  const dueAt = nextDayDueAt(last.endedAt);
  if (now.getTime() - Date.parse(last.endedAt) > maxDays * 86400e3) return null;
  return { session: last, due: now.getTime() >= Date.parse(dueAt), dueAt };
}

/** Next-day banner on Heute: true when a check-in is due right now. */
export const nextDayBannerVisible = (sessions, now = new Date()) => !!pendingNextDay(sessions, now)?.due;

/**
 * Finish the active session: lights, recommendations, XP, score, records, badges, rotation, reminder.
 * Pure – returns the new data object (input untouched) and the stored session.
 * @param {import('../types.js').Data} data
 * @param {Session} active
 * @param {import('../types.js').Content} content
 * @param {{now?: Date}} [opts]
 */
export function finishSession(data, active, content, { now = new Date() } = {}) {
  const d = clone(data);
  const settings = d.settings;
  const today = todayISO(now);
  const s = clone(active);
  s.status = 'done';
  s.endedAt = now.toISOString();
  if (s.pausedAt) { s.pausedMs = (s.pausedMs || 0) + Math.max(0, now.getTime() - Date.parse(s.pausedAt)); }
  delete s.pausedAt;
  delete s.cursor;
  delete s.rowTimer;
  const history = doneSessions(d.sessions);
  const ev = evaluateSession(s, settings, history);
  s.traffic = { provisional: ev.traffic, final: null, reasons: ev.reasons };
  s.recommendations = recommendLevels(s, history, d.state, content, settings, { today });
  s.xpEarned = xpFor(s, settings);
  const sc = sessionScore(s, settings, content);
  s.score = { points: sc.points, max: sc.max };

  const prevRec = personalRecords(history, settings);
  const nextRec = personalRecords([...history, s], settings);
  const recKeys = newRecords(prevRec, nextRec);
  const rowRecs = isCardioSession(s) ? newRowingRecords(history, s) : [];
  const kc = sessionKcal(s, bodyWeightKg(settings), content);
  s.energy = { kcal: kc.kcal, method: kc.method };

  const xpBefore = d.state.xp || 0;
  d.sessions.push(s);
  d.state.activeSession = null;
  const phase = (content?.phases || []).find((p) => p.id === (d.state.phaseId || s.phaseId)) || (content?.phases || []).find((p) => p.id === s.phaseId);
  // v2 (SPEC §12.4): only A/B/C strength workouts advance the rotation; cardio/short/custom keep it.
  if (phase) d.state.nextWorkoutId = rotationAfter(d.state, phase, s.workoutId);
  d.state.xp = xpBefore + s.xpEarned;
  d.state.records = nextRec;
  const badges = evaluateBadges(d, content?.badges || [], { today });
  for (const id of badges) d.state.badges = { ...(d.state.badges || {}), [id]: s.endedAt };
  d.state.xp += badges.length * XP.badge;
  d.state.nextDayReminder = { sessionId: s.id, dueAt: nextDayDueAt(s.endedAt), text: 'Morgen Folgetag-Check' };
  s.celebration = {
    xpBefore, xpAfter: d.state.xp, badges,
    records: recKeys.map((k) => ({ key: k, first: prevRec[k] == null, value: nextRec[k] })),
    ...(rowRecs.length ? { rowRecords: rowRecs } : {}),
    shown: false,
  };
  d.sessions[d.sessions.length - 1] = s;
  return { data: d, session: s };
}

/* ------------------------------------------------------------------ v2: kinds, labels, energy */

/** Kind of a session (missing = strength). */
export const sessionKind = (s) => s?.kind ?? (isCardioSession(s) ? 'cardio' : 'strength');

/**
 * Display title of a session/workout: custom name, workout name or stored `workoutName`.
 * @returns {{title: string, kindLabel: string, kind: string}}
 */
export function sessionTitle(session, content, state) {
  const w = getWorkout(session?.workoutId, content, state);
  const kind = sessionKind(session) || workoutKind(w);
  const title = w?.name ?? session?.workoutName ?? KIND_LABELS[kind] ?? 'Training';
  return { title, kindLabel: kind === 'custom' ? 'Eigenes Workout' : KIND_LABELS[kind] ?? 'Training', kind };
}

/** Energy estimate for a stored session (uses `session.energy` when present). */
export function energyOf(session, data, content, today = todayISO()) {
  if (session?.energy && typeof session.energy.kcal === 'number') {
    return { kcal: session.energy.kcal, method: session.energy.method, label: energyLabel(session.energy.method) };
  }
  const k = sessionKcal(session, bodyWeightKg(data?.settings), content);
  return { kcal: k.kcal, method: k.method, label: energyLabel(k.method) };
}
/** „vom Display“ for display kcal, else „Schätzung“. */
export const energyLabel = (method) => (method === 'display' ? 'vom Display' : 'Schätzung');

/** Rowing records improved by `session` compared to `history`: [{key, value, first}]. */
export function newRowingRecords(history, session) {
  const prev = rowingRecords(history);
  const next = rowingRecords([...doneSessions(history), { ...session, status: 'done' }]);
  const out = [];
  for (const k of Object.keys(next)) {
    if (next[k] && next[k].sessionId === session.id && (!prev[k] || next[k].value > prev[k].value)) {
      out.push({ key: k, value: next[k].value, first: prev[k] == null });
    }
  }
  return out;
}

/** Human value of a rowing record. */
export function rowRecordValue(key, value) {
  if (value == null) return '';
  if (key === 'distanceM') return formatDistance(value);
  if (key === 'avgWatt') return `${Math.round(value)} W`;
  if (key === 'durationSec') return formatClock(value);
  return String(value);
}

/** 1234 → "1.234 m", 12345 → "12,35 km". */
export function formatDistance(m) {
  if (typeof m !== 'number' || !Number.isFinite(m)) return '–';
  if (m >= 10000) return `${(m / 1000).toFixed(2).replace('.', ',')} km`;
  return `${Math.round(m).toLocaleString('de-DE')} m`;
}

/** Seconds → "m:ss" (or "h:mm:ss"). */
export function formatClock(sec) {
  const t = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Pace label for a rowing log: "2:30 /500 m" or null. */
export function paceLabel(rowing) {
  const p = pacePer500(rowing || {});
  return p == null ? null : `${formatClock(p)} /500 m`;
}

/** Parse "18:30", "18", "18,5" (minutes) or "1:02:03" → seconds; '' → null; invalid → NaN. */
export function parseClock(str) {
  const t = String(str ?? '').trim();
  if (!t) return null;
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((n) => n > 59)) return NaN;
    return parts.reduce((a, n) => a * 60 + n, 0);
  }
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 60) : NaN;
}

/* ------------------------------------------------------------------ v4: voice cue plan (pure, SPEC §15) */

/** Drop a trailing rep number („Anspannen – 2“ → „Anspannen“): the user chose no counting aloud. */
export const withoutCount = (say) => String(say ?? '').replace(/\s*[–-]\s*\d+\s*$/, '');

/**
 * Cue plan of an entry for the voice timer: the shared `exerciseCuePlan` (logic/cues.js) with rep numbers
 * removed from the spoken text.
 */
export function cuePlanFor(entry, exercise, settings) {
  const shared = exerciseCuePlan(entry, exercise, settings);
  // TEMPORARY: breathing phases come from the shared helper once it emits them; until then a local 4-7-8 plan
  if (!shared.some((st) => st.phase === 'inhale') && breathPattern(entry, exercise)) return localBreathPlan(entry, exercise, settings);
  return shared.map((st) => ({ ...st, say: withoutCount(st.say) }));
}

/** 4-7-8 breathing: 4 s in, 7 s hold, 8 s out, 4 rounds. */
export const BREATH_478 = { inhale: 4, hold: 7, exhale: 8, rounds: 4 };

/** Breathing pattern of an entry (`level.breath` / `exercise.breath`, or a breathing exercise by id/name), else null. */
export function breathPattern(entry, exercise) {
  const lvl = exercise?.levels?.[entry?.level ?? 0] ?? exercise?.levels?.[0];
  const b = lvl?.breath ?? exercise?.breath;
  if (b && typeof b === 'object') return { ...BREATH_478, ...b };
  return /breath|atem/i.test(`${exercise?.id ?? ''} ${exercise?.name ?? ''}`) ? { ...BREATH_478 } : null;
}

/**
 * Local cue plan for breathing (same shape as the shared helper): prep, then per round
 * inhale („Einatmen“) → breath-hold („Halten“) → exhale („Ausatmen“); no rep counting aloud.
 */
export function localBreathPlan(entry, exercise, settings) {
  const b = breathPattern(entry, exercise) || BREATH_478;
  const w = exercise?.cueWords || {};
  const lvl = exercise?.levels?.[entry?.level ?? 0] ?? exercise?.levels?.[0] ?? {};
  const sets = Math.max(1, entry?.plannedSets ?? lvl.sets ?? 1);
  const prep = isNum(settings?.prepSeconds) && settings.prepSeconds >= 0 ? settings.prepSeconds : 5;
  const out = [];
  const push = (phase, seconds, say, setIndex, repIndex = null) => out.push({ phase, seconds, say, setIndex, repIndex, side: null });
  for (let s = 0; s < sets; s++) {
    if (prep > 0) push('prep', prep, s === 0 ? `Bereit machen: ${exercise?.name ?? 'Atmung'}. Ganz ruhig.` : `Bereit machen. Satz ${s + 1} von ${sets}`, s);
    for (let r = 0; r < b.rounds; r++) {
      const first = r === 0;
      if (b.inhale > 0) push('inhale', b.inhale, first ? 'Einatmen durch die Nase' : w.inhale || 'Einatmen', s, r);
      if (b.hold > 0) push('breath-hold', b.hold, first ? 'Luft anhalten' : w.breathHold || 'Halten', s, r);
      if (b.exhale > 0) push('exhale', b.exhale, first ? 'Langsam ausatmen' : w.exhale || 'Ausatmen', s, r);
    }
    push('set-done', 0, '', s);
    if (s < sets - 1 && (lvl.rest ?? 0) > 0) push('rest', lvl.rest, 'Pause', s);
  }
  push('exercise-done', 0, 'Übung geschafft', null);
  return out;
}

/**
 * Steps the work <pt-timer> plays for set `setNo` (0-based ordinal): prep + work + relax (no rest – the
 * rest timer and the session handle that). `null` when the set has no timed work (plain reps).
 */
export function timerCuePlan(plan, setNo) {
  const sets = [];
  for (const st of plan || []) if (st && !sets.includes(st.setIndex ?? 0)) sets.push(st.setIndex ?? 0);
  const key = sets[Math.min(Math.max(0, setNo), sets.length - 1)];
  const steps = (plan || []).filter((st) => (st.setIndex ?? 0) === key && st.phase !== 'rest' && st.phase !== 'exercise-done');
  return steps.some((st) => st.phase !== 'prep' && (Number(st.seconds) || 0) > 0) ? steps : null;
}

/** "45 Sekunden", "eine Minute", "eineinhalb Minuten", "2 Minuten 15 Sekunden" (for speech). */
export function secondsPhrase(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  if (n < 60) return `${n} Sekunden`;
  if (n === 60) return 'eine Minute';
  if (n === 90) return 'eineinhalb Minuten';
  const m = Math.floor(n / 60);
  const r = n % 60;
  const mins = m === 1 ? 'eine Minute' : `${m} Minuten`;
  return r ? `${mins} ${r} Sekunden` : mins;
}

/** Spoken right after a set is finished and a rest follows. */
export function restAnnouncement(dose, rest = dose?.rest) {
  return `${dose?.type === 'hold' ? 'Loslassen. ' : ''}Satz geschafft. Pause, ${secondsPhrase(rest)}`;
}

/** Spoken when the last set of an exercise is done. */
export function exerciseDoneAnnouncement(nextName) {
  return nextName ? `Übung fertig. Nächste Übung: ${nextName}` : 'Übung fertig. Das war die letzte Übung.';
}

/** Spoken when a rest ends and no timer-led set follows (plain reps). */
export const nextSetAnnouncement = (setNo, sets) => (sets > 1 ? `Satz ${setNo} von ${sets}. Los geht’s` : 'Los geht’s');

/** Banner/tense color group of a section for <pt-timer block>. */
export const timerBlock = (section) => (section === 'knee' ? 'knee' : section === 'archery' ? 'archery' : 'neutral');

/** Spoken text for a rowing phase (SPEC §15, voice guidance): "Zügig rudern", "Locker rudern", "Ausrudern", drills by label. */
export function rowPhaseSay(phase, content, session) {
  const lab = rowPhaseLabel(phase, content, session);
  if (lab.big === 'Locker ausrudern') return 'Ausrudern';
  return lab.big;
}

/** Cue (tone/vibration group) for a rowing phase. */
export const rowPhaseCue = (phase) => (phase?.kind === 'rest' || phase?.intensity === 'easy' ? 'relax' : 'tense');

/* ------------------------------------------------------------------ v2: rowing timer (pure) */

/** Index of the main rowing entry (section `cardio`), or -1. */
export const mainCardioIndex = (session) => (session?.exercises || []).findIndex((e) => e.section === 'cardio');

/** Big German label + sub label for a rowing phase. */
export function rowPhaseLabel(phase, content, session) {
  const ex = exOf(content, phase?.exerciseId);
  const entry = session?.exercises?.[phase?.entryIndex];
  const lvl = ex?.levels?.[entry?.level ?? 0];
  const isDrill = Array.isArray(lvl?.phases) && lvl.phases.length > 0;
  let big;
  if (isDrill) big = phase.label;
  else if (phase.kind === 'rest') big = phase.label === 'Pause' ? 'Pause' : 'Locker rudern';
  else if (entry?.section === 'cooldown') big = 'Locker ausrudern';
  else if (phase.intensity === 'vigorous') big = 'Zügig rudern';
  else if (phase.intensity === 'easy') big = 'Locker rudern';
  else big = 'Gleichmäßig rudern';
  let sub = ex?.name ?? '';
  if (!isDrill && phase.sets > 1) sub += phase.kind === 'rest' ? ` · Erholung ${phase.set}/${phase.sets - 1}` : ` · Intervall ${phase.set}/${phase.sets}`;
  if (isDrill) sub += ` · Schritt ${phase.set}/${phase.sets}`;
  return { big, sub, intensity: phase.intensity ?? 'moderate', intensityLabel: INTENSITY_LABELS[phase.intensity] ?? '' };
}

/** Fresh timer state. */
export const newRowTimer = () => ({ idx: 0, accMs: 0, runAt: null, log: [], done: false });

/** Elapsed ms in the current phase. */
export const rowPhaseElapsed = (t, now) => (t.accMs || 0) + (t.runAt != null ? now - t.runAt : 0);

/**
 * Advance the timer to `now`, crossing phase boundaries (mutates `t`).
 * @returns {number[]} indexes of phases completed by this tick
 */
export function rowingTick(t, phases, now) {
  const crossed = [];
  if (t.done) return crossed;
  let el = rowPhaseElapsed(t, now);
  while (t.idx < phases.length && el >= phases[t.idx].seconds * 1000) {
    el -= phases[t.idx].seconds * 1000;
    t.log[t.idx] = phases[t.idx].seconds;
    crossed.push(t.idx);
    t.idx++;
  }
  if (t.idx >= phases.length) { t.done = true; t.runAt = null; t.accMs = 0; }
  else if (crossed.length) { t.accMs = el; if (t.runAt != null) t.runAt = now; }
  return crossed;
}

export function rowingStart(t, now) { if (!t.done && t.runAt == null) t.runAt = now; return t; }
export function rowingPause(t, now) { if (t.runAt != null) { t.accMs = rowPhaseElapsed(t, now); t.runAt = null; } return t; }

/** End the current phase early (logs the seconds actually rowed). */
export function rowingSkip(t, phases, now) {
  if (t.done) return t;
  t.log[t.idx] = Math.min(phases[t.idx]?.seconds ?? 0, Math.round(rowPhaseElapsed(t, now) / 1000));
  t.idx++;
  t.accMs = 0;
  if (t.idx >= phases.length) { t.done = true; t.runAt = null; } else if (t.runAt != null) t.runAt = now;
  return t;
}

/** Jump to the cool-down (first phase of a `cooldown` entry after the current one); else finish. */
export function rowingJumpToCooldown(t, phases, session, now) {
  if (t.done) return t;
  const target = phases.findIndex((p, i) => i > t.idx && session?.exercises?.[p.entryIndex]?.section === 'cooldown');
  const curIsCool = session?.exercises?.[phases[t.idx]?.entryIndex]?.section === 'cooldown';
  if (curIsCool) return t;
  t.log[t.idx] = Math.min(phases[t.idx]?.seconds ?? 0, Math.round(rowPhaseElapsed(t, now) / 1000));
  const end = target < 0 ? phases.length : target;
  for (let i = t.idx + 1; i < end; i++) t.log[i] = 0;
  t.idx = end;
  t.accMs = 0;
  if (t.idx >= phases.length) { t.done = true; t.runAt = null; } else if (t.runAt != null) t.runAt = now;
  return t;
}

/** {phaseRemaining, totalRemaining, rowed} in seconds. */
export function rowingTimes(t, phases, now) {
  const el = t.done ? 0 : rowPhaseElapsed(t, now) / 1000;
  const cur = phases[t.idx];
  const phaseRemaining = cur ? Math.max(0, cur.seconds - el) : 0;
  let later = 0;
  for (let i = t.idx + 1; i < phases.length; i++) later += phases[i].seconds;
  const logged = (t.log || []).reduce((a, n) => a + (n || 0), 0);
  return { phaseRemaining, totalRemaining: phaseRemaining + later, rowed: logged + (cur ? Math.min(el, cur.seconds) : 0) };
}

/**
 * Write the rowed seconds from the timer log into the session entries (mutates + returns session):
 * drills → one set with the summed seconds, otherwise one set per work phase; rest phases add nothing.
 * Entries without any rowed second are marked skipped.
 */
export function applyRowingLog(session, phases, log, content, at = new Date().toISOString()) {
  const per = new Map();
  phases.forEach((p, i) => {
    if (!per.has(p.entryIndex)) per.set(p.entryIndex, []);
    per.get(p.entryIndex).push({ p, sec: Math.max(0, Math.round(log?.[i] || 0)) });
  });
  for (const [idx, list] of per) {
    const e = session.exercises[idx];
    if (!e) continue;
    const ex = exOf(content, e.exerciseId);
    const lvl = ex?.levels?.[e.level ?? 0];
    const drill = Array.isArray(lvl?.phases) && lvl.phases.length > 0;
    const work = list.filter((x) => x.p.kind === 'work');
    e.sets = [];
    if (drill) {
      const sec = work.reduce((a, x) => a + x.sec, 0);
      if (sec > 0) e.sets.push({ done: true, seconds: sec, band: null, at });
    } else {
      for (const x of work) {
        const i = x.p.set - 1;
        while (e.sets.length < i) e.sets.push({ done: false });
        e.sets[i] = x.sec > 0 ? { done: true, seconds: x.sec, band: null, at } : { done: false };
      }
      while (e.sets.length && !e.sets.at(-1)?.done) e.sets.pop();
    }
    e.skipped = !e.sets.some((x) => x.done);
  }
  return session;
}

/** Seconds rowed according to the log (incl. active rest). */
export const rowedSecondsFromLog = (log) => Math.round((log || []).reduce((a, n) => a + (n || 0), 0));

/** Pre-check choice „Lockerer & kürzer“ for rowing: main entry one level lower or ~40 % shorter. */
export function applyLighterCardio(session, content) {
  for (const e of session.exercises || []) {
    if (e.section !== 'cardio') continue;
    const ex = exOf(content, e.exerciseId);
    if ((e.level ?? 0) > 0 && ex) {
      e.level -= 1;
      e.plannedSets = ex.levels[e.level]?.sets ?? e.plannedSets;
    } else {
      const lvl = ex?.levels?.[e.level ?? 0] ?? {};
      if ((e.plannedSets ?? lvl.sets ?? 1) > 1) e.plannedSets = Math.max(1, Math.round((e.plannedSets ?? lvl.sets) * 0.6));
      else e.override = { ...(e.override || {}), seconds: Math.max(60, Math.round(((lvl.seconds ?? 600) * 0.6) / 60) * 60) };
    }
    e.lighter = true;
  }
  session.mode = 'light';
  return session;
}

/** Live traffic light of the rowing entry (pain during + sharp pain) for the in-session warning. */
export function rowingPainLight(entry, settings) {
  const thr = thresholds(settings);
  if (entry?.sharpPain) return 'red';
  const p = entry?.painDuring;
  if (!isNum(p)) return null;
  return p > thr.yellowMax ? 'red' : p > thr.greenMax ? 'yellow' : 'green';
}

/** Default answers of a check (pre/post/next day); post-op sessions add redness + fever. */
export function withPostOpFlags(draft, postOp) {
  if (!postOp) return draft;
  return { redness: false, fever: false, ...draft };
}

const recKey = (r) => `${r.exerciseId}|${r.action}|${r.toLevel}|${r.toExerciseId ?? ''}`;

/**
 * Next-day check-in: stores `nextDay`, final light, merges updated recommendations (decided ones are
 * kept), +XP.nextDayCheckIn, new badges. Pure.
 * @returns {{data: any, session: Session, result: {traffic: string, reasons: string[]}, xpGained: number, badges: string[]}|null}
 */
export function applyNextDay(data, sessionId, nextDay, content, { now = new Date() } = {}) {
  const d = clone(data);
  const idx = d.sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return null;
  const s = d.sessions[idx];
  const history = doneSessions(d.sessions.slice(0, idx));
  s.nextDay = { ...nextDay, at: now.toISOString() };
  const res = finalizeWithNextDay(s, s.nextDay, d.settings, history);
  s.traffic = { ...(s.traffic || {}), final: res.traffic, reasons: res.reasons };
  const fresh = recommendLevels(s, history, d.state, content, d.settings, { today: todayISO(now) });
  const old = s.recommendations || [];
  const decided = old.filter((r) => r.status && r.status !== 'pending');
  const merged = decided.slice();
  for (const r of fresh) {
    if (decided.some((o) => recKey(o) === recKey(r))) continue;
    merged.push(r);
  }
  s.recommendations = merged;
  let xpGained = XP.nextDayCheckIn;
  d.state.xp = (d.state.xp || 0) + XP.nextDayCheckIn;
  if (d.state.nextDayReminder?.sessionId === s.id) d.state.nextDayReminder = null;
  const badges = evaluateBadges(d, content?.badges || [], { today: todayISO(now) });
  for (const id of badges) d.state.badges = { ...(d.state.badges || {}), [id]: now.toISOString() };
  d.state.xp += badges.length * XP.badge;
  xpGained += badges.length * XP.badge;
  return { data: d, session: s, result: { traffic: res.traffic, reasons: res.reasons }, xpGained, badges };
}

/** Accept (→ applyRecommendation) or dismiss recommendation `index` of a stored session. Pure. */
export function decideRecommendation(data, sessionId, index, accept) {
  const d = clone(data);
  const s = d.sessions.find((x) => x.id === sessionId);
  const rec = s?.recommendations?.[index];
  if (!rec || rec.status !== 'pending') return d;
  if (accept) d.state = applyRecommendation(d.state, rec);
  rec.status = accept ? 'accepted' : 'dismissed';
  return d;
}

/** Recommendations worth showing (no informational `hold`), consult first; with original indexes. */
export function visibleRecommendations(session) {
  const list = (session?.recommendations || []).map((rec, index) => ({ rec, index })).filter(({ rec }) => rec.action !== 'hold');
  return list.sort((a, b) => (a.rec.action === 'consult' ? -1 : 0) - (b.rec.action === 'consult' ? -1 : 0));
}

/** German title parts for a recommendation. */
export function recText(rec, content) {
  const ex = exOf(content, rec.exerciseId);
  const name = ex?.name ?? rec.exerciseId ?? '';
  const target = rec.toExerciseId ? exOf(content, rec.toExerciseId) : null;
  switch (rec.action) {
    case 'consult': return { title: 'Ärztlich abklären', levels: '', icon: 'consult' };
    case 'reduce': return { title: name, levels: 'Umfang −30–50 %', icon: 'regress' };
    case 'progress':
      return target ? { title: name, levels: `→ ${target.name}`, icon: 'progress' } : { title: name, levels: `Stufe ${rec.fromLevel + 1} → ${rec.toLevel + 1}`, icon: 'progress' };
    case 'regress':
      return target ? { title: name, levels: `→ ${target.name}`, icon: 'regress' } : { title: name, levels: `Stufe ${rec.fromLevel + 1} → ${rec.toLevel + 1}`, icon: 'regress' };
    default: return { title: name, levels: '', icon: 'progress' };
  }
}

/** Level progress around an XP gain. */
export function levelChange(xpBefore, xpAfter) {
  const a = levelFor(xpBefore), b = levelFor(xpAfter);
  return { before: a, after: b, up: b.index > a.index };
}

/** "38 Min" / "45 s" */
export function formatMinutes(sec) {
  if (sec < 60) return { value: String(sec), unit: 's' };
  return { value: String(Math.round(sec / 60)), unit: 'Min' };
}

/** Human value of a record. */
export function recordValue(key, value, settings) {
  if (!value) return '';
  if (key === 'longestHold') return `${value.seconds} s`;
  if (key === 'mostReps') return `${value.reps} Wdh.`;
  if (key === 'strongestBand') return (settings?.bands || []).find((b) => b.id === value.band)?.label ?? value.band;
  return '';
}

export const bandInfo = (settings, id) => (settings?.bands || []).find((b) => b.id === id) || (id ? { id, label: id, color: '#8892A0' } : null);

/** Local day helper for tests / views. */
export const sessionDay = (s) => dayOf(s);
export const isoDay = (d) => toISODate(d);

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const CONSULT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9M12 17.5v.5"/></svg>';

/**
 * Recommendation cards (.rec) for a stored session – Annehmen/Ablehnen buttons carry
 * data-act="rec-accept|rec-dismiss" and data-i (index into session.recommendations).
 * @returns {import('../render.js').SafeHtml}
 */
export function recCardsHtml(session, content) {
  const list = visibleRecommendations(session);
  if (!list.length) {
    const holds = (session?.recommendations || []).filter((r) => r.action === 'hold').length;
    return html`<section class="card card--tight"><p class="mb-0"><strong>Alles bleibt, wie es ist.</strong> <span class="muted">${holds ? `${holds} ${holds === 1 ? 'Übung' : 'Übungen'}: Stufe halten – Qualität sammeln.` : 'Keine Änderung nötig.'}</span></p></section>`;
  }
  return html`${list.map(({ rec, index }) => {
    const t = recText(rec, content);
    const consult = rec.action === 'consult';
    const cls = consult ? 'rec--consult stop-card' : t.icon === 'regress' ? 'rec--regress' : '';
    const status = rec.status === 'pending'
      ? (consult
        ? html`<div class="btn-row"><button type="button" class="btn btn--primary" data-act="rec-accept" data-i="${index}">Verstanden</button></div>`
        : html`<div class="btn-row"><button type="button" class="btn btn--outline" data-act="rec-dismiss" data-i="${index}">Ablehnen</button><button type="button" class="btn btn--primary" data-act="rec-accept" data-i="${index}">Annehmen</button></div>`)
      : html`<p class="ses-rec-status mb-0 ${rec.status === 'accepted' ? 'is-accepted' : ''}">${rec.status === 'accepted' ? (consult ? '✓ Zur Kenntnis genommen' : '✓ Übernommen') : 'Abgelehnt – Stufe bleibt'}</p>`;
    return html`<section class="card rec ${cls}" data-rec="${index}">
      <div class="rec__head"><span class="rec__arrow">${raw(consult ? CONSULT_ICON : ARROW)}</span>
        <div><div class="rec__title">${t.title}${t.levels ? html`: <span class="rec__levels">${t.levels}</span>` : ''}</div>
        <div class="rec__reason">${rec.reason}</div></div></div>
      ${consult ? html`<p class="ses-consult mb-0">Bitte Knie-Training pausieren und ärztlich bzw. physiotherapeutisch abklären lassen. Oberkörper-Training ist weiterhin möglich – du entscheidest.</p>` : ''}
      ${status}
    </section>`;
  })}`;
}

/* ------------------------------------------------------------------ DOM helpers (browser only) */

/** Toast in the shared region (created on demand). kind: success | gold | accent | '' */
export function toast(text, { icon = '✓', kind = 'success', ms = 2400 } = {}) {
  if (typeof document === 'undefined') return;
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = `toast${kind ? ` toast--${kind}` : ''}`;
  const i = document.createElement('span'); i.className = 'toast__icon'; i.textContent = icon;
  const t = document.createElement('span'); t.className = 'toast__text'; t.textContent = text;
  el.append(i, t);
  region.appendChild(el);
  while (region.children.length > 2) region.firstElementChild.remove();
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); }, ms);
}

/** Open a <dialog> built from markup; resolves with the clicked [data-value] (or null). */
export function openDialog(markup, { className = 'sheet', onOpen } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = className;
    dlg.innerHTML = markup;
    document.body.appendChild(dlg);
    let value = null;
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (b && dlg.contains(b)) { value = b.dataset.value; dlg.close(); return; }
      if (e.target === dlg) dlg.close(); // backdrop
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(value); });
    dlg.showModal();
    onOpen?.(dlg);
  });
}

const STYLE_ID = 'ses-styles';
const CSS = `
.ses-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:var(--s-3);margin:calc(-1*var(--s-4)) calc(-1*var(--s-4)) var(--s-2);padding:calc(var(--s-2) + var(--safe-top)) var(--s-4) var(--s-2);background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.ses-top__title{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;line-height:1.2}
.ses-top__title .eyebrow{margin:0}
.ses-top__title strong{font-size:var(--fs-md);font-variant-numeric:tabular-nums}
.ses-top .btn--icon{width:var(--tap);height:var(--tap);border-radius:50%;background:var(--surface);box-shadow:var(--shadow-1)}
.ses-top .btn--icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}
.ses-xp{transition:transform .2s var(--spring)}
.ses-xp.is-bump{transform:scale(1.15)}
.session-progress>.is-neutral.is-done{background:var(--block-neutral)}
.session-progress>.is-neutral.is-current{background:color-mix(in srgb,var(--block-neutral) 45%,var(--surface-2))}
.session-progress>.ses-gap{margin-left:5px}
.session-progress>.is-skipped{background:repeating-linear-gradient(90deg,var(--border) 0 3px,transparent 3px 6px)}
.ses-fig{margin:calc(-1*var(--s-2)) calc(-1*var(--s-2)) var(--s-3);border-radius:var(--radius-sm);background:var(--surface-2);overflow:hidden;display:grid;place-items:center;min-height:160px}
.ses-fig pt-figure{display:block;width:100%;max-width:330px}
.ses-ex .card__title{font-size:var(--fs-xl);margin:0;line-height:1.15}
.ses-note{color:var(--muted);font-size:var(--fs-sm);margin:var(--s-1) 0 0}
.ses-meta{display:flex;flex-wrap:wrap;gap:var(--s-2);margin-top:var(--s-3)}
.ses-dose{position:relative}
.ses-dose .dose{margin-bottom:var(--s-4)}
.ses-edit{position:absolute;right:-6px;top:-14px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--surface);box-shadow:var(--shadow-1);color:var(--muted)}
.ses-edit svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ses-sets{position:relative}
.ses-sets .set-check{width:64px;height:64px;font-size:var(--fs-lg);touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.ses-hint{text-align:center;font-size:var(--fs-xs);color:var(--muted);margin:var(--s-3) 0 0}
.ses-float{position:absolute;pointer-events:none;transform:translate(-50%,0);animation:ses-float 1s var(--ease) forwards;font-size:var(--fs-md);white-space:nowrap;z-index:5}
@keyframes ses-float{0%{opacity:0;transform:translate(-50%,6px) scale(.7)}20%{opacity:1;transform:translate(-50%,-6px) scale(1.1)}100%{opacity:0;transform:translate(-50%,-38px) scale(1)}}
.ses-rest{border:2px solid color-mix(in srgb,var(--accent) 35%,transparent);animation:view-in .25s var(--ease) both}
.ses-rest .eyebrow{text-align:center}
.ses-timer pt-timer{--pt-timer-size:min(62vw,240px)}
.ses-rest pt-timer{--pt-timer-size:min(52vw,200px)}
.ses-done{display:flex;align-items:center;gap:var(--s-3);padding:var(--s-3) var(--s-4);border-radius:var(--radius);background:var(--green-soft);color:var(--green-ink);font-weight:var(--fw-bold);animation:pop-in .4s var(--spring) both}
.ses-done__icon{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--green);color:#fff;font-size:20px;flex:none}
.ses-sharp{margin-top:var(--s-3);min-height:56px}
.ses-sharp[aria-pressed="true"]{background:var(--red);color:#fff}
.ses-shake{animation:ses-shake .45s ease-in-out}
@keyframes ses-shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.ses-pulse{animation:ses-pulse 1.6s ease-in-out infinite}
@keyframes ses-pulse{0%,100%{box-shadow:var(--shadow-cta,0 0 0 0 transparent)}50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--primary) 25%,transparent)}}
.ses-cta{display:flex;gap:var(--s-2)}
.ses-cta>.btn{flex:1 1 0;min-height:60px}
.ses-cta>.btn--prev{flex:0 0 auto;width:72px;padding:0}
.ses-cta svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.ses-check{display:flex;flex-direction:column;gap:2px}
.ses-check .check-row{min-height:56px}
.ses-intro .hero__title{margin-bottom:var(--s-2)}
.ses-choices{display:flex;flex-direction:column;gap:var(--s-2);margin-top:var(--s-4)}
.ses-choices .btn{min-height:60px;justify-content:flex-start;gap:var(--s-3);text-align:left}
.ses-choices .btn small{display:block;font-weight:var(--fw-semibold);opacity:.8;font-size:var(--fs-xs)}
.ses-reasons{list-style:disc !important;margin:var(--s-3) 0;padding-left:1.2em !important;display:flex;flex-direction:column;gap:var(--s-1)}
.ses-consult{padding:var(--s-3);border-radius:var(--radius-sm);background:var(--surface);font-weight:var(--fw-semibold)}
.ses-summary .target{margin-top:var(--s-2)}
.ses-summary .target-face{width:min(76vw,290px)}
.ses-records{display:flex;flex-wrap:wrap;gap:var(--s-2)}
.ses-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:var(--s-3)}
.ses-levelup{display:flex;align-items:center;gap:var(--s-3);margin-top:var(--s-3);padding:var(--s-3);border-radius:var(--radius-sm);background:var(--gold-soft);color:var(--gold-ink);font-weight:var(--fw-bold)}
.ses-rec-status{font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--muted)}
.ses-rec-status.is-accepted{color:var(--green-ink)}
.rec .btn-row .btn{min-height:48px}
.ses-band-pick{display:flex;flex-wrap:wrap;gap:var(--s-2)}
.ses-band-pick .chip{min-height:44px;padding:6px var(--s-3)}
.ses-adj{display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);padding:var(--s-2) 0}
.ses-overview .list-item{min-height:56px}
.ses-overview .is-cur .list-item__title{color:var(--primary-ink)}
.ses-big-q{font-size:var(--fs-2xl);font-weight:var(--fw-black);letter-spacing:-.025em;line-height:1.1;margin:var(--s-2) 0 var(--s-1)}
.ses-field{display:flex;flex-direction:column;gap:var(--s-2)}
.ses-field .field__label{font-weight:var(--fw-bold)}
.ses-nd-result{text-align:center}
.ses-nd-result .traffic{margin:0 auto}
.row-timer{--c:var(--primary);--c-soft:var(--primary-soft);--c-ink:var(--primary-ink);text-align:center;border:2px solid color-mix(in srgb,var(--c) 40%,transparent);background:linear-gradient(180deg,var(--c-soft),var(--surface) 70%);transition:border-color .4s var(--ease),background .4s var(--ease)}
.row-timer--easy{--c:var(--green);--c-soft:var(--green-soft);--c-ink:var(--green-ink)}
.row-timer--vigorous{--c:var(--accent);--c-soft:var(--accent-soft);--c-ink:var(--accent-ink)}
.row-timer--done{--c:var(--gold);--c-soft:var(--gold-soft);--c-ink:var(--gold-ink)}
.row-timer .eyebrow{margin:0;color:var(--c-ink)}
.row-phase{font-size:clamp(30px,9vw,42px);font-weight:var(--fw-black);letter-spacing:-.03em;line-height:1.05;margin:var(--s-2) 0 var(--s-1);color:var(--c-ink)}
.row-phase.is-new{animation:pop-in .45s var(--spring) both}
.row-sub{color:var(--muted);font-size:var(--fs-sm);margin:0}
.row-targets{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--s-2);margin:var(--s-3) 0 var(--s-2)}
.row-int{background:var(--c);color:var(--surface);border-color:transparent}
.row-clock{font-size:var(--fs-timer);font-weight:var(--fw-black);font-variant-numeric:tabular-nums;letter-spacing:-.04em;line-height:1;margin:var(--s-2) 0;color:var(--text)}
.row-bar{height:10px;border-radius:999px;background:color-mix(in srgb,var(--c) 18%,var(--surface-2));overflow:hidden}
.row-bar>span{display:block;height:100%;width:0;background:var(--c);border-radius:inherit;transition:width .25s linear}
.row-total{display:flex;justify-content:space-between;gap:var(--s-2);font-size:var(--fs-sm);color:var(--muted);margin:var(--s-2) 0 0;font-variant-numeric:tabular-nums}
.row-total strong{color:var(--text)}
.row-next{display:flex;align-items:center;gap:var(--s-2);justify-content:center;margin:var(--s-3) 0 0;padding:var(--s-2) var(--s-3);border-radius:var(--radius-sm);background:var(--surface);font-size:var(--fs-sm);font-weight:var(--fw-semibold)}
.row-next i{width:10px;height:10px;border-radius:50%;flex:none;background:var(--primary)}
.row-next i.is-easy{background:var(--green)}.row-next i.is-vigorous{background:var(--accent)}
.row-ctrl{display:flex;gap:var(--s-2);margin-top:var(--s-4)}
.row-ctrl .btn{flex:1 1 0;min-height:60px}
.row-ctrl .row-play{flex:2 1 0}
.row-stopline{display:flex;align-items:center;gap:var(--s-2);font-size:var(--fs-sm);font-weight:var(--fw-semibold);color:var(--red-ink);background:var(--red-soft);border-radius:var(--radius-sm);padding:var(--s-2) var(--s-3);margin:0}
.row-form .input{font-variant-numeric:tabular-nums;font-size:var(--fs-lg)}
.row-form .grid-2{gap:var(--s-3)}
.row-form .field{margin-bottom:0}
.ses-err{color:var(--red-ink);font-size:var(--fs-xs);font-weight:var(--fw-semibold)}
.row-pace{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s-2);padding:var(--s-3);border-radius:var(--radius-sm);background:var(--primary-soft);color:var(--primary-ink);font-weight:var(--fw-bold)}
.row-pace strong{font-size:var(--fs-xl);font-variant-numeric:tabular-nums}
.ses-hero-icon{font-size:56px;line-height:1;display:block;margin-bottom:var(--s-2)}
.ses-postop{border-left:4px solid var(--stop);padding:var(--s-2) var(--s-3);background:var(--stop-soft);border-radius:var(--radius-sm);font-size:var(--fs-sm);margin:var(--s-3) 0 var(--s-2)}
.ses-doctor .card__title{font-size:var(--fs-xl)}
.ses-doctor .ses-doctor__icon{font-size:40px;line-height:1}
@media (prefers-reduced-motion: reduce){.ses-float,.ses-pulse,.ses-shake,.row-phase.is-new{animation:none}}
`;

export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}
