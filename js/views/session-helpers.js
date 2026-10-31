// Session flow helpers (WP-Session-flow). Mostly PURE (Node-testable): dose/set bookkeeping,
// pre-check assessment, finishing a session, next-day check-in, recommendation decisions.
// The few DOM helpers at the bottom (toast, sheet, styles) only touch `document` when called.
// See docs/SPEC.md §4.2, §5, §6.7, §8.
import { evaluateSession, finalizeWithNextDay, recommendLevels, thresholds, LIGHT_LABELS, worst } from '../logic/traffic-light.js';
import { advanceWorkout, applyRecommendation } from '../logic/progression.js';
import { xpFor, levelFor, evaluateBadges, sessionScore, XP } from '../logic/motivation.js';
import { doneSessions, sessionLight, personalRecords, newRecords, dayOf } from '../logic/stats.js';
import { todayISO, toISODate } from '../util/date.js';
import { html, raw } from '../render.js';

/** @typedef {import('../types.js').Session} Session */

export const SECTIONS = ['warmup', 'knee', 'archery', 'cooldown'];
export const SECTION_LABELS = { warmup: 'Aufwärmen', knee: 'Knie-Block', archery: 'Bogen-Block', cooldown: 'Cool-down' };
export const SWELLING_LABELS = ['keine', 'leicht', 'deutlich'];
export const RECORD_LABELS = { longestHold: 'Längster Hold', mostReps: 'Meiste Wdh.', strongestBand: 'Stärkstes Band' };
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
 */
export function doseFor(entry, exercise) {
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
    rest: isNum(lvl.rest) ? lvl.rest : 30,
    restBetween: isNum(lvl.restBetween) ? lvl.restBetween : 3,
    label: lvl.label ?? '',
    perSide: exercise?.side === 'perSide',
    side: exercise?.side ?? 'both',
  };
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
export function assessPreCheck(pre, settings, history = []) {
  const thr = thresholds(settings);
  const ev = evaluateSession({ pre, exercises: [], post: null }, settings, []);
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
  return { light, reasons, consult: light === 'stop', showCard: light === 'red' || light === 'stop' };
}

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
 * `maxDays` (default 3) are not offered anymore.
 * @param {Session[]} sessions
 * @returns {{session: Session, due: boolean, dueAt: string}|null}
 */
export function pendingNextDay(sessions, now = new Date(), { maxDays = 3 } = {}) {
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

  const xpBefore = d.state.xp || 0;
  d.sessions.push(s);
  d.state.activeSession = null;
  const phase = (content?.phases || []).find((p) => p.id === (d.state.phaseId || s.phaseId)) || (content?.phases || []).find((p) => p.id === s.phaseId);
  if (phase) d.state.nextWorkoutId = advanceWorkout({ ...d.state, nextWorkoutId: s.workoutId }, phase);
  d.state.xp = xpBefore + s.xpEarned;
  d.state.records = nextRec;
  const badges = evaluateBadges(d, content?.badges || [], { today });
  for (const id of badges) d.state.badges = { ...(d.state.badges || {}), [id]: s.endedAt };
  d.state.xp += badges.length * XP.badge;
  d.state.nextDayReminder = { sessionId: s.id, dueAt: nextDayDueAt(s.endedAt), text: 'Morgen Folgetag-Check' };
  s.celebration = {
    xpBefore, xpAfter: d.state.xp, badges,
    records: recKeys.map((k) => ({ key: k, first: prevRec[k] == null, value: nextRec[k] })),
    shown: false,
  };
  d.sessions[d.sessions.length - 1] = s;
  return { data: d, session: s };
}

const recKey = (r) => `${r.exerciseId}|${r.action}|${r.toLevel}|${r.toExerciseId ?? ''}`;

/**
 * Next-day check-in: stores `nextDay`, final light, merges updated recommendations (decided ones are
 * kept), +20 XP, new badges. Pure.
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
    return html`<section class="card card--tight"><p class="mb-0"><strong>Alles bleibt, wie es ist.</strong> <span class="muted">${holds ? `${holds} Übungen: Stufe halten – Qualität sammeln.` : 'Keine Änderung nötig.'}</span></p></section>`;
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
@media (prefers-reduced-motion: reduce){.ses-float,.ses-pulse,.ses-shake{animation:none}}
`;

export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}
