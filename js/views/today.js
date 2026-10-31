// Heute – see docs/SPEC.md §3.1, §8.
import { html, raw, render as paint } from '../render.js';
import { todayISO, formatDE, daysBetween } from '../util/date.js';
import { nextWorkout, applyRecommendation } from '../logic/progression.js';
import { weeklyProgress, streak, sessionLight, dayOf } from '../logic/stats.js';
import { XP, levelFor, LEVELS, dailyQuote, opCountdown, reminderText } from '../logic/motivation.js';
import { taperActive } from '../logic/traffic-light.js';
import { progressRing, streakFlame, xpBar } from '../components/charts.js';
import {
  ICON, ensureViewStyles, applyFontScale, greeting, pendingNextDay, workoutSplit, workoutLetter,
  trafficPill, shortDate, toast, sessionMinutes, bandChip,
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

const REC_TEXT = {
  progress: 'Steigern',
  regress: 'Zurückgehen',
  reduce: 'Umfang reduzieren',
  consult: 'Rücksprache halten',
};

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content }) {
  ensureViewStyles();
  const exName = (id) => content.exercises.find((e) => e.id === id)?.name ?? id;

  const draw = () => {
    const data = store.get();
    applyFontScale(data.settings);
    const { settings, state, sessions } = data;
    const now = new Date();
    const today = todayISO(now);
    const phase = content.phases.find((p) => p.id === state.phaseId) ?? content.phases[0];
    const active = state.activeSession;
    const w = (active && content.workouts.find((x) => x.id === active.workoutId)) || nextWorkout(state, content.phases, content.workouts);
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
    const recs = pendingRecommendations(sessions).filter((r) => !(taper && r.rec.action === 'progress'));
    const badgeEntries = Object.entries(state.badges || {}).sort((a, b) => (a[1] < b[1] ? 1 : -1));
    const recentBadge = badgeEntries.length ? content.badges.find((b) => b.id === badgeEntries[0][0]) : null;
    const recentBadgeAt = badgeEntries[0]?.[1];
    const goalMet = wk.goal > 0 && wk.done >= wk.goal;
    const trainedToday = done.some((s) => dayOf(s) === today);
    const letter = w ? workoutLetter(w, content.phases) : '–';
    const opOver = op.stage === 'today' || op.stage === 'after';
    const firstRun = !done.length && !active && !state.welcomeDone;
    const bandsOk = !!state.bandsConfirmed;

    const welcome = firstRun ? html`<section class="card pv-welcome" aria-labelledby="welcome-title">
        <p class="eyebrow">Willkommen</p>
        <h2 class="pv-welcome__title" id="welcome-title">Schön, dass du da bist! 👋</h2>
        <p class="pv-welcome__lead">Drei Mal pro Woche ~40 Minuten: Knie stärken für die OP und Rücken & Schultern fürs Bogenschießen. Drei kurze Schritte zum Start:</p>
        <ol class="pv-steps">
          <li class="${settings.surgeryDate ? 'is-done' : ''}">
            <span class="pv-steps__num" aria-hidden="true">${settings.surgeryDate ? raw(ICON.check) : '1'}</span>
            <div class="pv-steps__body">
              <label class="pv-steps__title" for="welcome-op">OP-Termin eintragen</label>
              <input id="welcome-op" class="input" type="date" data-welcome-op value="${settings.surgeryDate ?? ''}" min="${today}">
              <span class="pv-steps__hint">Für Countdown und die ruhigere OP-Woche. Geht auch später unter „Mehr“.</span>
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
              <span class="pv-steps__hint">Die Ampel hilft dir bei der Dosierung. Bei stechendem Schmerz, Blockade oder starker Schwellung: aufhören und Rücksprache halten. Die App ersetzt keine ärztliche oder physiotherapeutische Beratung.</span>
            </div>
          </li>
        </ol>
        <div class="pv-welcome__cta">
          <a class="btn btn--primary btn--block btn--session" href="#/session?workout=${encodeURIComponent(w?.id ?? '')}">${raw(ICON.play)}Erstes Training starten</a>
          <p class="pv-welcome__sub">${w ? html`${w.name} · ca. ${w.durationMin} Min<br>` : ''}<button type="button" class="pv-linkbtn" data-welcome-hide>Hinweis ausblenden</button></p>
        </div>
      </section>` : '';

    const opCard = op.stage === 'none'
      ? html`<a class="card" href="#/mehr?focus=surgeryDate"><div class="ring-card">
          <span class="pv-ring-empty" aria-hidden="true">${raw(ICON.calendar)}</span>
          <div class="ring-card__body">
            <p class="eyebrow">OP-Countdown</p>
            <p class="ring-card__title">OP-Termin eintragen</p>
            <p class="ring-card__sub">Dann zählen wir gemeinsam die Tage bis zur OP – jede Einheit füllt den Ring.</p>
          </div>
        </div>        </a>`
      : opOver
        ? html`<section class="card card--hero ring-card">
            ${raw(progressRing({ value: 1, label: '🎯', variant: 'on-hero', ariaLabel: 'OP-Termin erreicht' }))}
            <div class="ring-card__body">
              <p class="hero__eyebrow">OP-Countdown</p>
              <p class="ring-card__title">Alles Gute für die OP!</p>
              <p class="muted">${op.stage === 'today' ? 'Heute ist der Tag. Du hast dich bestens vorbereitet.' : 'Du hast dich bestens vorbereitet. Gute Erholung!'}</p>
            </div>
          </section>`
        : html`<section class="card">
            <div class="ring-card">
              ${raw(progressRing({ value: op.progress, label: op.daysLeft, unit: op.daysLeft === 1 ? 'Tag' : 'Tage', variant: taper ? 'accent' : 'primary', ariaLabel: `${Math.round(op.progress * 100)} % der Prehab-Zeit geschafft` }))}
              <div class="ring-card__body">
                <p class="eyebrow">OP-Countdown · ${formatDE(settings.surgeryDate, { weekday: false })}</p>
                <p class="ring-card__title">Fit für die OP – noch <strong class="num">${op.daysLeft}</strong> ${op.daysLeft === 1 ? 'Tag' : 'Tage'}</p>
                <p class="ring-card__sub">${taper ? 'Letzte Woche: Qualität statt Umfang.' : `Jede Einheit zählt · ${Math.round(op.progress * 100)} % der Prehab geschafft.`}</p>
              </div>
            </div>
            ${taper ? html`<div class="banner banner--accent pv-taper mb-0">
              <span class="banner__icon">🌙</span>
              <span class="banner__body"><span class="banner__title">OP-Woche: weniger Umfang, gleiche Qualität.</span>
              <span class="banner__text">Sätze werden automatisch reduziert, keine Steigerungen, nichts Neues.</span></span>
            </div>` : ''}
          </section>`;

    const hero = w ? html`<section class="card card--hero" aria-labelledby="hero-title">
        <div class="hero__row">
          <div>
            <p class="hero__eyebrow">${active ? 'Training läuft' : 'Nächstes Training'} · ${phase?.name ?? ''}</p>
            <h2 class="hero__title" id="hero-title">${w.name}</h2>
          </div>
          <span class="hero__letter" aria-hidden="true">${letter}</span>
        </div>
        <p class="hero__meta">
          <span>${raw(ICON.clock)}ca. ${w.durationMin} Min</span>
          <span>${raw(ICON.list)}${split.total} Übungen</span>
          ${taper ? html`<span>🌙 Taper</span>` : ''}
        </p>
        <div class="hero__split" aria-hidden="true">
          ${split.warmup ? html`<span style="flex:${split.warmup}"></span>` : ''}
          ${split.knee ? html`<span class="is-knee" style="flex:${split.knee}"></span>` : ''}
          ${split.archery ? html`<span class="is-archery" style="flex:${split.archery}"></span>` : ''}
          ${split.cooldown ? html`<span style="flex:${split.cooldown}"></span>` : ''}
        </div>
        <div class="pv-split-legend">
          <span><i style="background:#7FE0E6"></i>Knie <span class="num">${split.knee}</span></span>
          <span><i style="background:#FFB46B"></i>Bogen <span class="num">${split.archery}</span></span>
          <span><i style="background:rgba(255,255,255,.35)"></i>Auf-/Abwärmen <span class="num">${split.warmup + split.cooldown}</span></span>
        </div>
        ${active
          ? html`<a class="btn btn--light btn--block btn--session" href="#/session">${raw(ICON.play)}Training fortsetzen</a>`
          : html`<a class="btn ${opOver ? 'btn--glass' : 'btn--light'} btn--block btn--session" href="#/session?workout=${encodeURIComponent(w.id)}">${raw(ICON.play)}Training starten</a>`}
        <p class="pv-hero-alt">${active ? '' : html`<a href="#/plan">Anderes Training wählen</a>`}${trainedToday && !active ? html` · <span class="muted">Heute schon trainiert 💪</span>` : ''}</p>
      </section>`
      : html`<section class="card"><div class="empty"><h3 class="empty__title">Kein Training gefunden</h3><p class="empty__text">Bitte im Plan eine Phase wählen.</p><a class="btn btn--primary" href="#/plan">Zum Plan</a></div></section>`;

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

      <div class="pv-quote-wrap"><blockquote class="quote"><p>${dailyQuote(today, content.quotes)}</p><span class="quote__src">Gedanke des Tages</span></blockquote></div>

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

      ${welcome}

      ${firstRun ? '' : hero}

      ${recs.length ? html`<h2 class="section-title">Vorschläge für dich <span class="count">${recs.length}</span></h2>
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
        </section>`)}` : ''}

      ${firstRun ? '' : opCard}

      <div class="grid-2 mb-4">
        <a class="card card--tight" href="#/verlauf" aria-label="Wochenziel ${wk.done} von ${wk.goal}">
          <div class="pv-mini">
            <p class="eyebrow mb-0">Wochenziel</p>
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
      </div>

      <a class="card" href="#/verlauf" style="display:block">${raw(xpBar({ xp: state.xp || 0, level: lvl, nextTitle }))}</a>

      ${reminder && !firstRun ? html`<div class="pv-reminder"><span aria-hidden="true">🌱</span><span>${reminder}</span></div>` : ''}

      ${last ? html`<h2 class="section-title">Letzte Einheit <a href="#/verlauf">Verlauf</a></h2>
        <a class="card pv-last" href="#/verlauf?session=${encodeURIComponent(last.id)}">
          <span class="list-item__icon">🦵</span>
          <span class="grow">
            <span class="list-item__title">${content.workouts.find((x) => x.id === last.workoutId)?.name ?? 'Training'}</span>
            <span class="list-item__sub">${shortDate(dayOf(last))}${sessionMinutes(last) ? ` · ${sessionMinutes(last)} Min` : ''}${last.traffic?.final ? '' : ' · vorläufig'}${last.xpEarned ? ` · +${last.xpEarned} XP` : ''}</span>
          </span>
          ${trafficPill(lastLight)}
        </a>` : ''}

      ${recentBadge ? html`<h2 class="section-title">Zuletzt verdient <a href="#/verlauf?show=badges">Alle Abzeichen</a></h2>
        <a class="card pv-badge-row" href="#/verlauf?show=badges">
          <span class="badge-tile__icon" aria-hidden="true">${recentBadge.icon}</span>
          <span class="grow"><span class="list-item__title">${recentBadge.name}</span>
          <span class="list-item__sub">${recentBadge.description}${recentBadgeAt ? ` · ${daysAgo(recentBadgeAt, today)}` : ''}</span></span>
        </a>` : !done.length && !firstRun ? html`<section class="card"><div class="empty">
          <div class="empty__art"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="13"/><circle cx="32" cy="32" r="4"/><path d="M32 32l18-18M44 12h6v6"/></svg></div>
          <h3 class="empty__title">Dein erster Pfeil wartet</h3>
          <p class="empty__text">Starte ganz entspannt – das erste Abzeichen gibt's nach der ersten Einheit.</p>
        </div></section>` : ''}
    `);
  };

  const onChange = (e) => {
    const t = e.target;
    if (t.matches?.('[data-welcome-op]')) store.update((d) => { d.settings.surgeryDate = t.value || null; });
  };

  const onClick = (e) => {
    if (e.target.closest('[data-welcome-bands]')) { store.update((d) => { d.state.bandsConfirmed = true; }); return; }
    if (e.target.closest('[data-welcome-hide]')) {
      store.update((d) => { d.state.welcomeDone = true; });
      toast('Ausgeblendet – OP-Termin und Bänder findest du unter „Mehr“.', { icon: '👍' });
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
  const unsub = store.subscribe(draw);
  return () => { unsub(); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
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
