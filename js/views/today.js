// Heute – see docs/SPEC.md §3.1, §8, §12.12.
// Card order (priority): banners → post-op status → welcome → hero (next strength workout) → OP countdown with
// schedule hint → recommendations → Kurztraining + Rudern → week rings → Gewicht-Ziel → Tagebuch + OP-Bereitschaft
// → Wochenbericht (Mondays) → Eigene Workouts (only with favourites) → XP → collapsed „Mehr für heute“
// (Eigene-Workouts CTA when none exist yet, quote, last session, badge). The week ring replaces the reminder line.
import { html, raw, render as paint } from '../render.js';
import { todayISO, formatDE, daysBetween, addDays, parseISODate } from '../util/date.js';
import { nextWorkout, applyRecommendation, getWorkout, phaseWorkouts } from '../logic/progression.js';
import { weeklyProgress, streak, sessionLight, dayOf, cardioProgress, sameDayLoadHint, isCardioSession } from '../logic/stats.js';
import { XP, levelFor, LEVELS, dailyQuote, opCountdown, reminderText } from '../logic/motivation.js';
import { taperActive } from '../logic/traffic-light.js';
import { estimateWorkoutMinutes } from '../logic/duration.js';
import { cardioMainLabel } from '../logic/cardio.js';
import { goalProgress, calorieTarget } from '../logic/energy.js';
import { entryFor, logStreak } from '../logic/health.js';
import { weeklyReport, opReadiness } from '../logic/insights.js';
import { scheduleHint, suggestedSurgeryDate, postOpStatus, canEnterPhase, clearance, POSTOP_DAYS } from '../logic/schedule.js';
import { progressRing, streakFlame, xpBar } from '../components/charts.js';
import { confetti } from '../components/celebrate.js';
import { switchPhase } from './plan.js';
import {
  ICON, ensureViewStyles, applyFontScale, greeting, pendingNextDay, workoutSplit, workoutLetter,
  trafficPill, shortDate, toast, sessionMinutes, bandChip, fmtNum, fmtDistance, confirmDialog, KIND_ICON,
} from './ui.js';

export const title = 'Heute';

/**
 * Pending, actionable recommendations of the most recent sessions (latest per exercise).
 * @param {any[]} sessions
 * @returns {{sessionId: string, index: number, rec: any}[]}
 */
export function pendingRecommendations(sessions) {
  const out = [];
  const seen = new Set();
  const recent = (sessions || []).filter((s) => s?.status === 'done').slice(-3).reverse();
  for (const s of recent) {
    (s.recommendations || []).forEach((rec, index) => {
      if (rec?.status !== 'pending' || rec.action === 'hold') return;
      const key = rec.exerciseId ?? `__${rec.action}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ sessionId: s.id, index, rec });
    });
  }
  return out;
}

/**
 * Up to `n` custom workouts for the quick start: most recently used first, then most recently edited.
 * @param {any[]} customWorkouts @param {any[]} sessions @param {number} [n]
 */
export function recentCustomWorkouts(customWorkouts, sessions, n = 3) {
  const lastUsed = new Map();
  for (const s of sessions || []) if (s?.status === 'done' && s.workoutId) lastUsed.set(s.workoutId, s.endedAt || s.startedAt || '');
  return (customWorkouts || []).slice()
    .sort((a, b) => {
      const ua = lastUsed.get(a.id) ?? '';
      const ub = lastUsed.get(b.id) ?? '';
      if (ua !== ub) return ua < ub ? 1 : -1;
      return String(a.updatedAt ?? '') < String(b.updatedAt ?? '') ? 1 : -1;
    })
    .slice(0, n);
}

/**
 * Which post-op card to show on Heute (null = none).
 * - "clearance": surgery date passed, no clearance yet → confirm flow
 * - "enter": cleared but still in a prehab phase → offer to start p4
 * - "active": in the post-op phase, not ended → week x/6, red flags, gait
 * - "ended": 6 weeks over or doctor's release → plan the rehab phase with the physio
 * @param {ReturnType<typeof postOpStatus>} st @param {any} phase current phase
 * @returns {null|'clearance'|'enter'|'active'|'ended'}
 */
export function postOpCardMode(st, phase) {
  const inPostOp = (phase?.kind ?? 'prehab') === 'postop';
  if (!st?.surgeryPassed && !inPostOp) return null;
  if (st?.ended) return 'ended';
  if (!st?.cleared) return 'clearance';
  return inPostOp ? 'active' : 'enter';
}

/** Monday (ISO weekday 1) for "YYYY-MM-DD". */
export const isMonday = (iso) => parseISODate(iso).getDay() === 1;

const REC_TEXT = {
  progress: 'Steigern',
  regress: 'Zurückgehen',
  reduce: 'Umfang reduzieren',
  consult: 'Rücksprache halten',
};

const STATUS_CHIP = {
  onTrack: { cls: 'chip--green', text: 'Im Zeitplan' },
  ahead: { cls: 'chip--primary', text: 'Voraus' },
  behind: { cls: 'chip--archery', text: 'Zeitplan' },
};

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content }) {
  ensureViewStyles();
  const exName = (id) => content.exercises.find((e) => e.id === id)?.name ?? id;
  let moreOpen = false;
  let clearChecked = false;
  let clearNote = '';

  const draw = () => {
    const data = store.get();
    applyFontScale(data.settings);
    const { settings, state, sessions } = data;
    const now = new Date();
    const today = todayISO(now);
    const phase = content.phases.find((p) => p.id === state.phaseId) ?? content.phases[0];
    const pw = phaseWorkouts(phase, content.workouts);
    const active = state.activeSession;
    const activeW = active ? getWorkout(active.workoutId, content, state) : null;
    const w = activeW || nextWorkout(state, content.phases, content.workouts);
    const wMin = w ? estimateWorkoutMinutes(w, content, state, settings) : 0;
    const split = workoutSplit(w);
    const wk = weeklyProgress(sessions, settings.weeklyGoal, today);
    const st = streak(sessions, settings.weeklyGoal, today);
    const lvl = levelFor(state.xp || 0);
    const nextTitle = LEVELS[lvl.index + 1]?.title;
    const op = opCountdown(settings, today);
    const taper = taperActive(settings.surgeryDate, today);
    const nd = pendingNextDay(sessions, now);
    const done = sessions.filter((s) => s.status === 'done');
    const last = done.at(-1);
    const lastLight = last ? sessionLight(last) : null;
    const reminder = reminderText(sessions, settings.weeklyGoal, today);
    // after surgery, open suggestions from prehab sessions no longer apply (different protocol)
    const recSessions = phase?.kind === 'postop' ? sessions.filter((s) => s.postOp) : sessions;
    const recs = pendingRecommendations(recSessions).filter((r) => !(taper && r.rec.action === 'progress'));
    const badgeEntries = Object.entries(state.badges || {}).sort((a, b) => (a[1] < b[1] ? 1 : -1));
    const recentBadge = badgeEntries.length ? content.badges.find((b) => b.id === badgeEntries[0][0]) : null;
    const recentBadgeAt = badgeEntries[0]?.[1];
    const goalMet = wk.goal > 0 && wk.done >= wk.goal;
    const todays = done.filter((s) => dayOf(s) === today);
    const trainedToday = todays.some((s) => !isCardioSession(s));
    const rowedToday = todays.some(isCardioSession);
    const letter = w ? workoutLetter(w, content.phases) : '–';
    const opOver = op.stage === 'today' || op.stage === 'after';
    const firstRun = !done.length && !active && !state.welcomeDone;
    const bandsOk = !!state.bandsConfirmed;
    const suggested = suggestedSurgeryDate(settings);
    const sched = scheduleHint(content.phases, settings, state, today);
    const post = postOpStatus(settings, state, today);
    const postMode = postOpCardMode(post, phase);
    const isPostOpPhase = (phase?.kind ?? 'prehab') === 'postop';
    // after surgery, prehab strength workouts are not suggested until p4 is unlocked (rowing is forbidden)
    const showHero = !firstRun && !(postMode === 'clearance' || postMode === 'enter');
    const rowingAllowed = !post.surgeryPassed && !isPostOpPhase;
    const cardio = cardioProgress(sessions, settings.cardioGoalPerWeek ?? 3, today);
    const cardioMet = cardio.goal > 0 && cardio.done >= cardio.goal;
    const log = state.healthLog || [];
    const todayEntry = entryFor(log, today);
    const logRun = logStreak(log, today);
    const gp = goalProgress(log, settings.weightGoal, today, settings.profile);
    const kcalT = gp ? calorieTarget(settings.profile, log, settings.weightGoal, today) : null;
    const readiness = !post.surgeryPassed && !isPostOpPhase && done.length ? opReadiness(data, content, today) : null;
    const report = isMonday(today) && done.length ? weeklyReport(data, content, today, { weekOf: addDays(today, -7) }) : null;
    const customs = recentCustomWorkouts(state.customWorkouts, sessions, 3);
    const p4 = content.phases.find((p) => (p.kind ?? 'prehab') === 'postop');

    /* ---------------- welcome (first run) ---------------- */
    const opValue = settings.surgeryDate ?? suggested ?? '';
    const welcome = firstRun ? html`<section class="card pv-welcome" aria-labelledby="welcome-title">
        <p class="eyebrow">Willkommen</p>
        <h2 class="pv-welcome__title" id="welcome-title">Schön, dass du da bist! 👋</h2>
        <p class="pv-welcome__lead">Dein Plan bis zur OP: 3× pro Woche Kraft (max. 30 Minuten) für Knie, Rücken & Schultern, dazu 3× Rudern als Ausdauer. Drei kurze Schritte zum Start:</p>
        <ol class="pv-steps">
          <li class="${settings.surgeryDate ? 'is-done' : ''}">
            <span class="pv-steps__num" aria-hidden="true">${settings.surgeryDate ? raw(ICON.check) : '1'}</span>
            <div class="pv-steps__body">
              <label class="pv-steps__title" for="welcome-op">OP-Termin ${settings.surgeryDate ? 'eingetragen' : 'bestätigen'}</label>
              <input id="welcome-op" class="input" type="date" data-welcome-op value="${opValue}" min="${today}">
              ${settings.surgeryDate
                ? html`<span class="pv-steps__hint">Gespeichert: ${formatDE(settings.surgeryDate, { weekday: false })}. Countdown und Phasen-Zeitplan richten sich danach.</span>`
                : html`<span class="pv-steps__hint">Vorgeschlagen ist der ${suggested ? formatDE(suggested, { weekday: false }) : 'geplante Termin'} – bitte prüfen und bestätigen. Geht auch später unter „Mehr“.</span>
                  <div class="btn-row"><button type="button" class="btn btn--primary btn--sm" data-welcome-op-confirm>${raw(ICON.check)} Termin bestätigen</button></div>`}
            </div>
          </li>
          <li class="${bandsOk ? 'is-done' : ''}">
            <span class="pv-steps__num" aria-hidden="true">${bandsOk ? raw(ICON.check) : '2'}</span>
            <div class="pv-steps__body">
              <span class="pv-steps__title">Deine Bänder – leicht → schwer</span>
              <div class="pv-welcome__bands">${(settings.bands || []).map((b) => bandChip(settings, b.id, { sm: true }))}</div>
              ${bandsOk ? html`<span class="pv-steps__hint">Bestätigt · Reihenfolge änderbar unter <a href="#/mehr">Mehr</a>.</span>`
                : html`<div class="btn-row"><a class="btn btn--outline btn--sm" href="#/mehr">Anpassen</a><button type="button" class="btn btn--primary btn--sm" data-welcome-bands>Passt so</button></div>`}
            </div>
          </li>
          <li>
            <span class="pv-steps__num" aria-hidden="true">3</span>
            <div class="pv-steps__body">
              <span class="pv-steps__title">Auf dein Knie hören</span>
              <span class="pv-steps__hint">Die Ampel hilft dir bei der Dosierung – auch beim Rudern. Bei stechendem Schmerz, Blockade oder starker Schwellung: aufhören und Rücksprache halten. Die App ersetzt keine ärztliche oder physiotherapeutische Beratung.</span>
            </div>
          </li>
        </ol>
        <div class="pv-welcome__cta">
          <a class="btn btn--primary btn--block btn--session" href="#/session?workout=${encodeURIComponent(w?.id ?? '')}">${raw(ICON.play)}Erstes Training starten</a>
          <p class="pv-welcome__sub">${w ? html`${w.name} · ca. ${wMin} Min<br>` : ''}<button type="button" class="pv-linkbtn" data-welcome-hide>Hinweis ausblenden</button></p>
        </div>
      </section>` : '';

    /* ---------------- post-op status (p4) ---------------- */
    const postCard = (() => {
      if (!postMode) return '';
      if (postMode === 'ended') {
        return html`<section class="card card--hero pv-postop" aria-labelledby="postop-title">
          <p class="hero__eyebrow">Entlastungsphase · ${post.daysSince != null ? `Tag ${post.daysSince}` : ''}</p>
          <h2 class="hero__title" id="postop-title">Geschafft! 🎉</h2>
          <p class="pv-postop__lead">${post.message || p4?.endNote || 'Entlastungsphase geschafft – Reha-Phase mit Physio planen.'}</p>
          <p class="pv-postop__lead">Die nächsten Schritte (Belastungsaufbau, Gangbild, Kraft) legst du am besten gemeinsam mit deiner Physio fest. Bis dahin: weiter wie besprochen.</p>
          <a class="btn btn--light btn--block" href="#/plan">${raw(ICON.calendar)} Reha-Phase mit Physio planen</a>
        </section>`;
      }
      if (postMode === 'clearance') {
        return html`<section class="card pv-postop-card" aria-labelledby="clear-title">
          <div class="pv-postop-card__head">
            <span class="pv-icon-badge pv-icon-badge--primary" aria-hidden="true">${raw(ICON.shield)}</span>
            <div class="grow"><p class="eyebrow mb-0">Nach der OP${post.daysSince != null ? ` · Tag ${post.daysSince}` : ''}</p>
            <h2 class="card__title" id="clear-title">Freigabe bestätigen</h2></div>
          </div>
          <p class="text-sm muted">Gute Besserung! Die Entlastungsphase mit Übungen im Sitzen und Liegen startet erst, wenn dein Arzt oder deine Physio sie freigegeben hat. ${p4?.clearanceNote ?? ''}</p>
          <label class="check-row pv-clear-check">
            <input type="checkbox" data-clear-check ${clearChecked ? 'checked' : ''}>
            <span>Mein Arzt/Physio hat die Übungen freigegeben</span>
          </label>
          <div class="field mt-2">
            <label class="field__label" for="clear-note">Notiz <span class="muted">(optional)</span></label>
            <textarea id="clear-note" class="textarea" rows="2" maxlength="500" data-clear-note placeholder="z. B. Beugung bis 90°, Bodenkontakt erlaubt">${clearNote}</textarea>
          </div>
          <button type="button" class="btn btn--primary btn--block mt-2" data-clear-confirm ${clearChecked ? '' : 'disabled'}>${raw(ICON.check)} Freigabe bestätigen</button>
          <div class="pv-callout pv-callout--stop mt-4 mb-0"><span class="pv-callout__icon" aria-hidden="true">⛔</span>
            <p class="text-sm">${p4?.redFlagNote ?? 'Neue Schwellung, Rötung, Überwärmung, Fieber oder Schmerz über 5/10: Arzt kontaktieren.'}</p></div>
        </section>`;
      }
      if (postMode === 'enter') {
        return html`<section class="card pv-postop-card" aria-labelledby="enter-title">
          <div class="pv-postop-card__head">
            <span class="pv-icon-badge pv-icon-badge--green" aria-hidden="true">${raw(ICON.check)}</span>
            <div class="grow"><p class="eyebrow mb-0">Freigabe bestätigt</p>
            <h2 class="card__title" id="enter-title">Entlastungsphase starten</h2></div>
          </div>
          <p class="text-sm muted">Ab jetzt gibt es Workouts im Sitzen und Liegen – das operierte Bein wird nicht belastet. Rudern pausiert in dieser Phase.</p>
          <button type="button" class="btn btn--primary btn--block btn--lg" data-enter-p4>${raw(ICON.play)} ${p4?.name ?? 'Phase 4'} starten</button>
          <p class="field__hint center mt-2">Du kannst einzelne Übungen im Plan passend zu deinem Protokoll ein- oder ausschalten.</p>
        </section>`;
      }
      // active
      const wkNo = Math.min(6, post.week ?? 1);
      return html`<section class="card pv-postop-card" aria-labelledby="p4-title">
        <div class="pv-postop-card__head">
          ${raw(progressRing({ value: Math.min(POSTOP_DAYS, post.daysSince ?? 0), max: POSTOP_DAYS, label: `${wkNo}/6`, size: 'sm', ariaLabel: `Woche ${wkNo} von 6` }))}
          <div class="grow"><p class="eyebrow mb-0">Entlastungsphase · Tag ${post.daysSince ?? 0}</p>
          <h2 class="card__title" id="p4-title">Woche ${wkNo} von 6</h2>
          <p class="text-sm muted mb-0">${post.daysLeft != null ? `Noch ${post.daysLeft} ${post.daysLeft === 1 ? 'Tag' : 'Tage'} entlasten – du machst das gut.` : ''}</p></div>
        </div>
        <div class="pv-callout pv-callout--stop mt-4"><span class="pv-callout__icon" aria-hidden="true">⛔</span>
          <p class="text-sm"><strong>Warnzeichen:</strong> ${p4?.redFlagNote ?? 'Neue Schwellung, Rötung, Überwärmung, Fieber oder Schmerz über 5/10: Arzt kontaktieren.'}</p></div>
        ${p4?.gaitNote ? html`<div class="pv-callout pv-callout--knee mb-0"><span class="pv-callout__icon" aria-hidden="true">🩼</span><p class="text-sm">${p4.gaitNote}</p></div>` : ''}
        <p class="field__hint mt-2 mb-0"><button type="button" class="pv-linkbtn" data-end-clear>Arzt hat die Entlastung vorzeitig beendet?</button></p>
      </section>`;
    })();

    /* ---------------- OP countdown + schedule hint ---------------- */
    const schedRow = sched.text ? html`<div class="pv-sched">
        <span class="chip chip--sm ${STATUS_CHIP[sched.status]?.cls ?? 'chip--outline'}">${STATUS_CHIP[sched.status]?.text ?? 'Zeitplan'}</span>
        <span class="pv-sched__text">${sched.text}</span>
      </div>` : '';
    const opCard = op.stage === 'none'
      ? html`<section class="card"><div class="ring-card">
          <span class="pv-ring-empty" aria-hidden="true">${raw(ICON.calendar)}</span>
          <div class="ring-card__body">
            <p class="eyebrow">OP-Countdown</p>
            <p class="ring-card__title">OP-Termin bestätigen</p>
            <p class="ring-card__sub">${suggested ? html`Vorgeschlagen: <strong>${formatDE(suggested, { weekday: false })}</strong>. Mit Termin gibt's Countdown und Phasen-Zeitplan.` : 'Dann zählen wir gemeinsam die Tage bis zur OP.'}</p>
          </div>
        </div>
        <div class="btn-row mt-4">
          <a class="btn btn--outline btn--sm" href="#/mehr?focus=surgeryDate">Anderes Datum</a>
          ${suggested ? html`<button type="button" class="btn btn--primary btn--sm" data-op-suggest="${suggested}">${raw(ICON.check)} ${formatDE(suggested, { weekday: false })} übernehmen</button>` : ''}
        </div></section>`
      : opOver
        ? (postMode ? '' : html`<section class="card card--hero ring-card">
            ${raw(progressRing({ value: 1, label: '🎯', variant: 'on-hero', ariaLabel: 'OP-Termin erreicht' }))}
            <div class="ring-card__body">
              <p class="hero__eyebrow">OP-Countdown</p>
              <p class="ring-card__title">Alles Gute für die OP!</p>
              <p class="muted">${op.stage === 'today' ? 'Heute ist der Tag. Du hast dich bestens vorbereitet.' : 'Du hast dich bestens vorbereitet. Gute Erholung!'}</p>
            </div>
          </section>`)
        : html`<section class="card">
            <div class="ring-card">
              ${raw(progressRing({ value: op.progress, label: op.daysLeft, unit: op.daysLeft === 1 ? 'Tag' : 'Tage', variant: taper ? 'accent' : 'primary', ariaLabel: `Noch ${op.daysLeft} Tage bis zur OP, ${Math.round(op.progress * 100)} % der Prehab-Zeit geschafft` }))}
              <div class="ring-card__body">
                <p class="eyebrow">OP-Countdown · ${formatDE(settings.surgeryDate, { weekday: false })}</p>
                <p class="ring-card__title">Fit für die OP – noch <strong class="num">${op.daysLeft}</strong> ${op.daysLeft === 1 ? 'Tag' : 'Tage'}</p>
                <p class="ring-card__sub">${taper ? 'Letzte Woche: Qualität statt Umfang.' : `Jede Einheit zählt · ${Math.round(op.progress * 100)} % der Prehab geschafft.`}</p>
              </div>
            </div>
            ${schedRow}
            ${taper ? html`<div class="banner banner--accent pv-taper mb-0">
              <span class="banner__icon">🌙</span>
              <span class="banner__body"><span class="banner__title">OP-Woche: weniger Umfang, gleiche Qualität.</span>
              <span class="banner__text">Sätze werden automatisch reduziert, keine Steigerungen, nichts Neues. Rudern bleibt bis zum OP-Tag möglich.</span></span>
            </div>` : ''}
          </section>`;

    /* ---------------- hero: next strength workout ---------------- */
    const strengthHint = rowedToday && !trainedToday && !active ? sameDayLoadHint(sessions, today, 'strength') : null;
    const hero = w ? html`<section class="card card--hero" aria-labelledby="hero-title">
        <div class="hero__row">
          <div>
            <p class="hero__eyebrow">${active ? 'Training läuft' : 'Nächstes Krafttraining'} · ${phase?.name ?? ''}</p>
            <h2 class="hero__title" id="hero-title">${w.name}</h2>
          </div>
          <span class="hero__letter" aria-hidden="true">${activeW && activeW.kind && activeW.kind !== 'strength' ? KIND_ICON[activeW.kind] : letter}</span>
        </div>
        <p class="hero__meta">
          <span>${raw(ICON.clock)}ca. ${wMin} Min</span>
          <span>${raw(ICON.list)}${split.total} Übungen</span>
          ${taper ? html`<span>🌙 Taper</span>` : ''}
          ${isPostOpPhase ? html`<span>🪑 im Sitzen/Liegen</span>` : ''}
        </p>
        ${split.knee || split.archery ? html`<div class="hero__split" aria-hidden="true">
          ${split.warmup ? html`<span style="flex:${split.warmup}"></span>` : ''}
          ${split.knee ? html`<span class="is-knee" style="flex:${split.knee}"></span>` : ''}
          ${split.archery ? html`<span class="is-archery" style="flex:${split.archery}"></span>` : ''}
          ${split.cooldown ? html`<span style="flex:${split.cooldown}"></span>` : ''}
        </div>
        <div class="pv-split-legend">
          <span><i style="background:#7FE0E6"></i>Knie <span class="num">${split.knee}</span></span>
          <span><i style="background:#FFB46B"></i>Bogen <span class="num">${split.archery}</span></span>
          <span><i style="background:rgba(255,255,255,.35)"></i>Auf-/Abwärmen <span class="num">${split.warmup + split.cooldown}</span></span>
        </div>` : ''}
        ${strengthHint ? html`<p class="pv-hero-hint">ℹ️ ${strengthHint}</p>` : ''}
        ${active
          ? html`<a class="btn btn--light btn--block btn--session" href="#/session">${raw(ICON.play)}Training fortsetzen</a>`
          : html`<a class="btn ${opOver && !isPostOpPhase ? 'btn--glass' : 'btn--light'} btn--block btn--session" href="#/session?workout=${encodeURIComponent(w.id)}">${raw(ICON.play)}Training starten</a>`}
        <p class="pv-hero-alt">${active ? '' : html`<a href="#/plan">Anderes Training wählen</a>`}${trainedToday && !active ? html` · <span>Heute schon trainiert 💪</span>` : ''}</p>
      </section>`
      : html`<section class="card"><div class="empty"><h3 class="empty__title">Kein Training gefunden</h3><p class="empty__text">Bitte im Plan eine Phase wählen.</p><a class="btn btn--primary" href="#/plan">Zum Plan</a></div></section>`;

    /* ---------------- Kurztraining + Rudern ---------------- */
    const short = pw.short;
    const shortMin = short ? estimateWorkoutMinutes(short, content, state, settings) : 0;
    const shortCard = short && !active && showHero ? html`<section class="card pv-quick" aria-labelledby="short-title">
        <span class="pv-icon-badge pv-icon-badge--primary" aria-hidden="true">${raw(ICON.bolt)}</span>
        <div class="grow">
          <p class="eyebrow mb-0">Nur 15 Minuten?</p>
          <h3 class="pv-quick__title" id="short-title">Kurztraining (~${shortMin} Min)</h3>
          <p class="pv-quick__sub">${short.description || 'Das Wichtigste für Knie und Rücken – zählt fürs Wochenziel.'}</p>
        </div>
        <a class="btn btn--soft btn--sm" href="#/session?workout=${encodeURIComponent(short.id)}" aria-label="Kurztraining starten">${raw(ICON.play)} Start</a>
      </section>` : '';

    const cardioHint = trainedToday && !rowedToday ? sameDayLoadHint(sessions, today, 'cardio') : null;
    const rowCard = rowingAllowed && pw.cardio.length && !firstRun ? html`<section class="card pv-row-card" aria-labelledby="row-title">
        <div class="pv-row-card__head">
          ${raw(progressRing({ value: cardio.done, max: Math.max(1, cardio.goal), label: `${cardio.done}/${cardio.goal}`, size: 'sm', variant: cardioMet ? 'gold' : 'accent', ariaLabel: `Rudern diese Woche: ${cardio.done} von ${cardio.goal}` }))}
          <div class="grow">
            <p class="eyebrow mb-0">Rudern · diese Woche</p>
            <h3 class="pv-quick__title" id="row-title">${cardioMet ? 'Ruder-Ziel erreicht 🎯' : cardio.goal - cardio.done === 1 ? 'Noch 1 Ruder-Einheit' : `Noch ${Math.max(0, cardio.goal - cardio.done)} Ruder-Einheiten`}</h3>
            <p class="pv-quick__sub">${cardio.done ? html`<span class="num">${cardio.minutes}</span> Min · <span class="num">${fmtDistance(cardio.distanceM)}</span>` : '15–20 Minuten, locker bis zügig – Ampel gilt auch hier.'}</p>
          </div>
        </div>
        <ul class="pv-start-list">
          ${pw.cardio.map((cw) => {
            const lbl = cardioMainLabel(cw, content, state);
            return html`<li class="pv-start">
              <span class="pv-start__body"><span class="pv-start__name">${cw.name}</span>
              <span class="pv-start__meta">ca. ${estimateWorkoutMinutes(cw, content, state, settings)} Min${lbl ? ` · ${lbl}` : ''}</span></span>
              <a class="btn btn--accent btn--sm" href="#/session?workout=${encodeURIComponent(cw.id)}" aria-label="${cw.name} starten">${raw(ICON.play)} Start</a>
            </li>`;
          })}
        </ul>
        ${cardioHint ? html`<div class="pv-callout pv-callout--warn mt-2 mb-0"><span class="pv-callout__icon" aria-hidden="true">ℹ️</span><p class="text-sm">${cardioHint}</p></div>` : ''}
      </section>` : '';

    /* ---------------- week rings ---------------- */
    const weekRings = firstRun ? '' : html`<div class="grid-2 mb-4">
        <a class="card card--tight" href="#/verlauf" aria-label="Wochenziel Kraft ${wk.done} von ${wk.goal}">
          <div class="pv-mini">
            <p class="eyebrow mb-0">Kraft-Woche</p>
            ${raw(progressRing({ value: wk.done, max: Math.max(1, wk.goal), label: `${wk.done}/${wk.goal}`, size: 'md', variant: goalMet ? 'gold' : 'primary', ariaLabel: `${wk.done} von ${wk.goal} Einheiten` }))}
            <span class="pv-mini__note${goalMet ? ' is-gold' : ''}">${goalMet ? 'Wochenziel erreicht 🎯' : wk.goal - wk.done === 1 ? 'Noch 1 Einheit' : `Noch ${wk.goal - wk.done} Einheiten`}</span>
          </div>
        </a>
        <a class="card card--tight" href="#/verlauf" aria-label="Serie: ${st.weeks} Wochen">
          <div class="pv-mini">
            <p class="eyebrow mb-0">Serie</p>
            ${raw(streakFlame({ weeks: st.weeks, label: st.weeks ? (st.weeks === 1 ? 'Woche in Folge' : 'Wochen in Folge') : 'Neuer Anlauf – diese Woche zählt.' }))}
          </div>
        </a>
      </div>`;

    /* ---------------- Gewicht-Ziel ---------------- */
    const weightCard = firstRun ? '' : !gp
      ? html`<section class="card pv-quick" aria-labelledby="goal-title">
          <span class="pv-icon-badge pv-icon-badge--gold" aria-hidden="true">${raw(ICON.scale)}</span>
          <div class="grow"><p class="eyebrow mb-0">Gewicht-Ziel</p>
            <h3 class="pv-quick__title" id="goal-title">Ziel festlegen</h3>
            <p class="pv-quick__sub">Zielgewicht und Datum – die App zeigt Fortschritt, Tempo und eine Kalorien-Schätzung.</p></div>
          <a class="btn btn--soft btn--sm" href="#/profil?focus=ziel">Ziel festlegen</a>
        </section>`
      : html`<section class="card pv-goal" aria-labelledby="goal-title">
          <div class="pv-goal__head">
            ${raw(progressRing({ value: gp.ratio, label: gp.lostKg != null ? fmtNum(Math.max(0, gp.lostKg), 1) : '–', unit: 'kg weg', size: 'md', variant: gp.reached ? 'gold' : 'primary', ariaLabel: `${Math.round(gp.ratio * 100)} % des Gewicht-Ziels` }))}
            <div class="grow">
              <p class="eyebrow mb-0">Gewicht-Ziel · ${fmtNum(gp.targetKg, 1, { trim: true })} kg</p>
              <h3 class="pv-quick__title" id="goal-title">${gp.reached ? 'Ziel erreicht! 🏆' : gp.currentKg == null ? 'Gewicht eintragen' : html`Noch <span class="num">${fmtNum(gp.remainingKg, 1)}</span> kg`}</h3>
              <p class="pv-quick__sub">${gp.currentKg != null ? html`Aktuell <strong class="num">${fmtNum(gp.currentKg, 1)} kg</strong> (7-Tage-Schnitt) · Start ${fmtNum(gp.startKg, 1)} kg` : 'Trag dein Gewicht im Tagebuch ein, dann rechnen wir los.'}</p>
            </div>
          </div>
          ${gp.currentKg != null && !gp.reached ? html`<dl class="pv-kv">
            <div><dt>Nötig</dt><dd class="num">${gp.requiredKgPerWeek != null ? html`${fmtNum(gp.requiredKgPerWeek, 2)} <small>kg/Woche</small>` : '–'}</dd></div>
            <div><dt>Trend</dt><dd class="num">${gp.trendKgPerWeek != null ? html`${fmtNum(gp.trendKgPerWeek, 2, { sign: true })} <small>kg/Woche</small>` : html`– <small>zu wenig Daten</small>`}</dd></div>
            <div><dt>Prognose</dt><dd class="num">${gp.projectedDate ? html`${shortDate(gp.projectedDate).slice(5)}<small>${String(gp.projectedDate).slice(0, 4)}</small>` : '–'}</dd></div>
          </dl>
          <p class="pv-goal__track ${gp.onTrack === true ? 'is-on' : gp.onTrack === false ? 'is-off' : ''}">${gp.onTrack === true ? '✓ Im Plan – weiter so, ganz in Ruhe.' : gp.onTrack === false ? '↻ Etwas langsamer als geplant – kein Stress, Regelmäßigkeit zählt.' : 'Wieg dich an mindestens 4 Tagen, dann gibt es einen Trend.'}${settings.weightGoal?.targetDate ? ` Ziel bis ${formatDE(settings.weightGoal.targetDate, { weekday: false })}.` : ''}</p>` : ''}
          ${gp.warnings.map((t) => html`<div class="pv-callout pv-callout--warn mb-2"><span class="pv-callout__icon" aria-hidden="true">⚠️</span><p class="text-sm">${t}</p></div>`)}
          <div class="pv-goal__foot">
            <span class="text-sm">${kcalT ? html`🍽️ ca. <strong class="num">${kcalT.kcal}</strong> kcal/Tag <span class="muted">(${kcalT.label})</span>` : html`<a href="#/profil">Profil ergänzen</a> <span class="muted">für eine Kalorien-Schätzung</span>`}</span>
            <a class="btn btn--ghost btn--sm" href="#/profil?focus=ziel">Ziel ändern</a>
          </div>
        </section>`;

    /* ---------------- Tagebuch + OP-Bereitschaft ---------------- */
    const diary = html`<a class="card card--tight pv-tile" href="#/gesundheit" aria-label="Tagebuch heute ${todayEntry ? 'eingetragen' : 'offen'}">
        <p class="eyebrow mb-0">Tagebuch heute</p>
        <span class="pv-tile__icon ${todayEntry ? 'is-done' : ''}" aria-hidden="true">${todayEntry ? raw(ICON.check) : raw(ICON.book)}</span>
        <span class="pv-tile__title">${todayEntry ? 'Eingetragen ✓' : 'Jetzt eintragen'}</span>
        <span class="pv-mini__note">${logRun ? `🔥 ${logRun} ${logRun === 1 ? 'Tag' : 'Tage'} in Folge` : `+${XP.healthLog ?? 5} XP · 1 Minute`}</span>
      </a>`;
    const ready = readiness ? html`<a class="card card--tight pv-tile" href="#/gesundheit?focus=bereitschaft" aria-label="OP-Bereitschaft ${readiness.score} von 100">
        <p class="eyebrow mb-0">OP-Bereitschaft</p>
        ${raw(progressRing({ value: readiness.score, max: 100, label: readiness.score, size: 'sm', variant: readiness.score >= 80 ? 'gold' : 'primary', ariaLabel: `${readiness.score} von 100: ${readiness.label}` }))}
        <span class="pv-tile__title">${readiness.label}</span>
        ${readiness.tips[0] ? html`<span class="pv-mini__note pv-tile__tip">${readiness.tips[0]}</span>` : ''}
      </a>` : '';
    const tiles = firstRun ? '' : html`<div class="grid-2 mb-4 pv-tiles${ready ? '' : ' is-single'}">${diary}${ready}</div>`;

    /* ---------------- Wochenbericht (Mondays) ---------------- */
    const reportCard = report ? html`<a class="card pv-report" href="#/gesundheit?focus=bericht">
        <span class="pv-icon-badge pv-icon-badge--gold" aria-hidden="true">📊</span>
        <span class="grow">
          <span class="eyebrow">Wochenbericht · ${shortDate(report.weekStart)} – ${shortDate(report.weekEnd)}</span>
          <span class="list-item__title">Kraft ${report.strength.done}/${report.strength.goal} · Rudern ${report.cardio.done}/${report.cardio.goal}${report.weight.deltaKg != null ? ` · ${fmtNum(report.weight.deltaKg, 1, { sign: true })} kg` : ''}</span>
          <span class="list-item__sub">${report.highlights[0] ?? report.notes[0] ?? 'Neue Woche, neuer Pfeil im Köcher.'}</span>
        </span>
        ${raw(ICON.chev)}
      </a>` : '';

    /* ---------------- Eigene Workouts ---------------- */
    const customCard = firstRun ? '' : html`<section class="card" aria-labelledby="cw-title">
        <div class="card__header">
          <div><h3 class="card__title" id="cw-title">Eigene Workouts</h3>
          <p class="card__sub">${customs.length ? 'Schnellstart deiner Favoriten' : 'Stell dir dein eigenes Training aus der Übungs-Bibliothek zusammen.'}</p></div>
          <a class="btn btn--ghost btn--sm" href="#/eigene">${customs.length ? 'Alle' : 'Ansehen'}</a>
        </div>
        ${customs.length ? html`<ul class="pv-start-list">
          ${customs.map((cw) => {
            const wo = getWorkout(cw.id, content, state);
            const min = wo ? estimateWorkoutMinutes(wo, content, state, settings) : 0;
            const n = (cw.warmup?.length ?? 0) + (cw.blocks || []).reduce((a, b) => a + (b.items?.length ?? 0), 0) + (cw.cooldown?.length ?? 0);
            return html`<li class="pv-start">
              <span class="pv-start__body"><span class="pv-start__name">${cw.name}</span>
              <span class="pv-start__meta">ca. ${min} Min · ${n} Übungen</span></span>
              <a class="btn btn--soft btn--sm" href="#/session?workout=${encodeURIComponent(cw.id)}" aria-label="${cw.name} starten">${raw(ICON.play)} Start</a>
            </li>`;
          })}
        </ul>` : html`<a class="btn btn--outline btn--block" href="#/eigene/neu">${raw(ICON.plus)} Workout erstellen</a>`}
      </section>`;

    /* ---------------- recommendations ---------------- */
    const recBlock = recs.length ? html`<h2 class="section-title">Vorschläge für dich <span class="count">${recs.length}</span></h2>
        ${recs.map(({ sessionId, index, rec }) => html`<section class="card rec ${rec.action === 'regress' || rec.action === 'reduce' ? 'rec--regress' : rec.action === 'consult' ? 'rec--consult' : ''}">
          <div class="rec__head">
            <span class="rec__arrow">${raw(rec.action === 'consult' ? ICON.info : ICON.up)}</span>
            <div>
              <div class="rec__title">${rec.exerciseId ? exName(rec.toExerciseId || rec.exerciseId) : REC_TEXT[rec.action]}${rec.action === 'progress' || rec.action === 'regress'
                ? html`: <span class="rec__levels">${rec.toExerciseId ? 'neue Übung' : html`Stufe ${(rec.fromLevel ?? 0) + 1} → ${(rec.toLevel ?? 0) + 1}`}</span>` : rec.exerciseId ? html` · ${REC_TEXT[rec.action]}` : ''}</div>
              <div class="rec__reason">${rec.reason || ''}</div>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn--outline btn--sm" data-rec="dismissed" data-sid="${sessionId}" data-i="${index}">Verwerfen</button>
            <button class="btn btn--primary btn--sm" data-rec="accepted" data-sid="${sessionId}" data-i="${index}">${rec.action === 'consult' ? 'Verstanden' : 'Übernehmen'}</button>
          </div>
        </section>`)}` : '';

    /* ---------------- collapsed lower cards ---------------- */
    const lastW = last ? getWorkout(last.workoutId, content, state) : null;
    const lastIcon = last ? (isCardioSession(last) ? '🚣' : KIND_ICON[last.kind ?? 'strength'] ?? '🦵') : '';
    const more = firstRun ? '' : html`<details class="disclosure pv-more" data-more ${moreOpen ? 'open' : ''}>
        <summary>Mehr für heute</summary>
        <div>
          ${customs.length ? '' : customCard}
          <blockquote class="quote"><p>${dailyQuote(today, content.quotes)}</p><span class="quote__src">Gedanke des Tages</span></blockquote>
          ${last ? html`<p class="pv-sec-label">Letzte Einheit <a class="pv-sec-label__link" href="#/verlauf">Verlauf</a></p>
            <a class="card pv-last" href="#/verlauf?session=${encodeURIComponent(last.id)}">
              <span class="list-item__icon">${lastIcon}</span>
              <span class="grow">
                <span class="list-item__title">${lastW?.name ?? 'Training'}</span>
                <span class="list-item__sub">${shortDate(dayOf(last))}${sessionMinutes(last) ? ` · ${sessionMinutes(last)} Min` : ''}${last.rowing?.distanceM ? ` · ${fmtDistance(last.rowing.distanceM)}` : ''}${last.traffic?.final ? '' : ' · vorläufig'}${last.xpEarned ? ` · +${last.xpEarned} XP` : ''}</span>
              </span>
              ${trafficPill(lastLight)}
            </a>` : ''}
          ${recentBadge ? html`<p class="pv-sec-label">Zuletzt verdient <a class="pv-sec-label__link" href="#/verlauf?show=badges">Alle Abzeichen</a></p>
            <a class="card pv-badge-row" href="#/verlauf?show=badges">
              <span class="badge-tile__icon" aria-hidden="true">${recentBadge.icon}</span>
              <span class="grow"><span class="list-item__title">${recentBadge.name}</span>
              <span class="list-item__sub">${recentBadge.description}${recentBadgeAt ? ` · ${daysAgo(recentBadgeAt, today)}` : ''}</span></span>
            </a>` : html`<div class="empty">
              <div class="empty__art"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="13"/><circle cx="32" cy="32" r="4"/><path d="M32 32l18-18M44 12h6v6"/></svg></div>
              <h3 class="empty__title">Dein erstes Abzeichen wartet</h3>
              <p class="empty__text">Das erste gibt's nach der ersten Einheit – ganz entspannt.</p>
            </div>`}
        </div>
      </details>`;

    paint(root, html`
      <header class="page-header pv-greet">
        <div class="grow">
          <p class="eyebrow">${formatDE(today)}</p>
          <h1 class="pv-greet__hello">${greeting(now)}!</h1>
        </div>
        <div class="page-header__actions">
          <a class="chip chip--gold" href="#/verlauf" aria-label="Level ${lvl.index + 1}: ${lvl.title}">🏹 <span>${lvl.title}</span></a>
        </div>
      </header>

      ${nd ? html`<a class="banner banner--gold" href="#/folgetag">
        <span class="banner__icon">🌤️</span>
        <span class="banner__body"><span class="banner__title">Wie geht's dem Knie heute?</span>
        <span class="banner__text">Kurzer Folgetag-Check zu ${shortDate(dayOf(nd))} · 30 Sek. · +${XP.nextDayCheckIn} XP</span></span>
        ${raw(ICON.chev)}
      </a>` : ''}

      ${active ? html`<a class="banner banner--accent" href="#/session">
        <span class="banner__icon">⏯️</span>
        <span class="banner__body"><span class="banner__title">Dein Training wartet auf dich</span>
        <span class="banner__text">Begonnen ${shortDate(dayOf(active))} · genau da weitermachen, wo du warst.</span></span>
        ${raw(ICON.chev)}
      </a>` : ''}

      ${postCard}
      ${welcome}
      ${showHero ? hero : ''}
      ${firstRun ? '' : opCard}
      ${recBlock}
      ${shortCard}
      ${rowCard}
      ${reminder && !firstRun && !postMode && !weekRings ? html`<div class="pv-reminder"><span aria-hidden="true">🌱</span><span>${reminder}</span></div>` : ''}
      ${weekRings}
      ${weightCard}
      ${tiles}
      ${reportCard}
      ${customs.length ? customCard : ''}
      ${firstRun ? '' : html`<a class="card" href="#/verlauf" style="display:block">${raw(xpBar({ xp: state.xp || 0, level: lvl, nextTitle }))}</a>`}
      ${more}
    `);
  };

  const onInput = (e) => {
    const t = e.target;
    if (t.matches?.('[data-clear-note]')) clearNote = t.value;
  };

  const onChange = (e) => {
    const t = e.target;
    if (t.matches?.('[data-welcome-op]')) {
      // changing the date in the welcome card counts as confirming it
      store.update((d) => { d.settings.surgeryDate = t.value || null; });
      return;
    }
    if (t.matches?.('[data-clear-check]')) {
      clearChecked = t.checked;
      const btn = root.querySelector('[data-clear-confirm]');
      if (btn) btn.disabled = !clearChecked;
    }
  };

  const onToggle = (e) => {
    if (e.target instanceof HTMLDetailsElement && e.target.matches('[data-more]')) moreOpen = e.target.open;
  };

  const onClick = async (e) => {
    if (e.target.closest('[data-welcome-op-confirm]')) {
      const v = root.querySelector('[data-welcome-op]')?.value;
      if (!v) { toast('Bitte ein Datum wählen.', { kind: 'accent', icon: '📅' }); return; }
      store.update((d) => { d.settings.surgeryDate = v; });
      toast(`OP-Termin gespeichert: ${formatDE(v, { weekday: false })}`, { icon: '📅' });
      return;
    }
    const sug = e.target.closest('[data-op-suggest]');
    if (sug) {
      const v = sug.dataset.opSuggest;
      store.update((d) => { d.settings.surgeryDate = v; });
      toast(`OP-Termin gespeichert: ${formatDE(v, { weekday: false })}`, { icon: '📅' });
      return;
    }
    if (e.target.closest('[data-welcome-bands]')) { store.update((d) => { d.state.bandsConfirmed = true; }); return; }
    if (e.target.closest('[data-welcome-hide]')) {
      store.update((d) => { d.state.welcomeDone = true; });
      toast('Ausgeblendet – OP-Termin und Bänder findest du unter „Mehr“.', { icon: '👍' });
      return;
    }
    if (e.target.closest('[data-clear-confirm]')) {
      if (!clearChecked) return;
      const note = clearNote.trim();
      store.update((d) => { d.state.postOpClearance = clearance(note); });
      clearChecked = false; clearNote = '';
      toast('Freigabe gespeichert – die Entlastungsphase ist jetzt verfügbar.', { icon: '✓' });
      return;
    }
    if (e.target.closest('[data-enter-p4]')) {
      const data = store.get();
      const p4 = content.phases.find((p) => (p.kind ?? 'prehab') === 'postop');
      if (!p4) return;
      const can = canEnterPhase(p4, data.settings, data.state, todayISO());
      if (!can.ok) { toast(can.reasons[0] || 'Noch nicht möglich.', { kind: 'accent', icon: '🔒', ms: 4000 }); return; }
      store.update((d) => switchPhase(d, p4));
      toast(`Willkommen in ${p4.name} – Schritt für Schritt.`, { icon: '🩼' });
      return;
    }
    if (e.target.closest('[data-end-clear]')) {
      const ok = await confirmDialog({
        title: 'Entlastung vorzeitig beendet?',
        text: 'Nur bestätigen, wenn dein Arzt die Entlastungsphase ausdrücklich beendet hat. Danach planst du die Reha-Phase mit deiner Physio.',
        confirm: 'Ja, Arzt hat freigegeben', icon: '🩺',
      });
      if (!ok) return;
      store.update((d) => { d.state.postOpEndClearance = clearance('Vorzeitige Freigabe durch Arzt'); });
      confetti();
      return;
    }
    const b = e.target.closest('[data-rec]');
    if (!b) return;
    const status = b.dataset.rec;
    const sid = b.dataset.sid;
    const i = Number(b.dataset.i);
    store.update((d) => {
      const s = d.sessions.find((x) => x.id === sid);
      const rec = s?.recommendations?.[i];
      if (!rec) return;
      rec.status = status;
      if (status === 'accepted') d.state = applyRecommendation(d.state, rec);
    });
    toast(status === 'accepted' ? 'Übernommen – du kannst jederzeit zurück.' : 'Verworfen', { icon: status === 'accepted' ? '✓' : '↩︎' });
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('toggle', onToggle, true);
  const unsub = store.subscribe(draw);
  return () => {
    unsub();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('toggle', onToggle, true);
  };
}

function daysAgo(isoTs, today) {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return '';
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const n = daysBetween(day, today);
  if (n <= 0) return 'heute';
  if (n === 1) return 'gestern';
  return `vor ${n} Tagen`;
}
