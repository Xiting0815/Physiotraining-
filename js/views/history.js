// Verlauf – see docs/SPEC.md §3.6, §8.
import { html, raw, render as paint } from '../render.js';
import { todayISO, formatDE, addDays } from '../util/date.js';
import { streak, trends, personalRecords, totalHoldSeconds, sessionLight, dayOf, doneSessions } from '../logic/stats.js';
import { sessionScore, levelFor } from '../logic/motivation.js';
import { getWorkout } from '../logic/progression.js';
import { rowingTotals, rowingRecords, pacePer500 } from '../logic/cardio.js';
import { sessionKcal, bodyWeightKg } from '../logic/energy.js';
import { ensureV2Styles, ICON2, sessionKind, fmtNum, fmtDistance, fmtClock, fmtPace, KCAL_METHOD_LABEL } from './v2-shared.js';
import { lineChart, barChart, calendarHeatmap } from '../components/charts.js';
import { targetFace } from '../components/celebrate.js';
import {
  ICON, ensureViewStyles, applyFontScale, pageHeader, trafficPill, shortDate, monthTitle, shiftMonth, humanSeconds,
  sessionMinutes, bandInfo, openSheet, confirmDialog, toast,
  safeData, fmtDuration, fmtMinutes, fmtInt,
} from './ui.js';

export const title = 'Verlauf';

/**
 * Hint text for a locked badge (progress towards it).
 * @param {any} badge @param {any} data
 */
export function badgeHint(badge, data) {
  const rule = badge?.rule || {};
  const done = doneSessions(data?.sessions);
  switch (rule.type) {
    case 'sessionsCount': return `noch ${Math.max(0, (rule.n ?? 1) - done.length)}`;
    case 'totalHoldSeconds': {
      const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      const n = rule.n ?? 300;
      return `${fmt(Math.min(n, totalHoldSeconds(done)))} / ${fmt(n)}`;
    }
    case 'weekSessions': return `${rule.n ?? 3} in einer Woche`;
    case 'phaseCompleted': return 'Phase abschließen';
    case 'greenWeek': return 'Woche ganz grün';
    case 'personalRecord': return 'Rekord verbessern';
    case 'comeback': return `nach ${rule.n ?? 10} Tagen Pause`;
    case 'cardioCount': return `noch ${Math.max(0, (rule.n ?? 1) - done.filter((s) => sessionKind(s) === 'cardio').length)} Rudereinheit`;
    case 'rowingDistance': {
      const km = (m) => (Math.round(m / 100) / 10).toLocaleString('de-DE');
      return `${km(Math.min(rule.n ?? 10000, rowingTotals(done).distanceM))} / ${km(rule.n ?? 10000)} km`;
    }
    case 'customWorkout': return 'eigenes Workout bauen';
    default: return badge?.description ?? '';
  }
}

/** Remove a session from a data draft (and its XP). Pure on the draft. */
export function deleteSession(d, id) {
  const s = d.sessions.find((x) => x.id === id);
  if (!s) return d;
  d.sessions = d.sessions.filter((x) => x.id !== id);
  d.state.xp = Math.max(0, (d.state.xp || 0) - (s.xpEarned || 0));
  return d;
}

const RANGE = { '6w': 42, '3m': 91 };

/** Filter chips of the session list/calendar. */
export const KIND_FILTERS = [['all', 'Alle'], ['strength', 'Kraft'], ['cardio', 'Rudern'], ['short', 'Kurz'], ['custom', 'Eigene'], ['relief', 'Entlastung']];

/** Sessions matching a kind filter ('all' | 'strength' | 'cardio' | 'short' | 'custom'). */
export function filterSessions(sessions, kind = 'all') {
  return (sessions || []).filter((s) => kind === 'all' || sessionKind(s) === kind);
}

/** Display name of a session's workout (content, custom, deleted custom). */
export function sessionTitle(s, content, state) {
  const w = getWorkout(s?.workoutId, content, state);
  if (w?.name) return w.name;
  const k = sessionKind(s);
  return k === 'cardio' ? 'Rudern' : k === 'custom' ? 'Eigenes Workout' : k === 'short' ? 'Kurztraining' : 'Training';
}

/** One-line rowing summary: „4,25 km · 2:21 /500 m“. */
export function rowingLine(s) {
  const r = s?.rowing || {};
  const parts = [];
  if (r.distanceM) parts.push(fmtDistance(r.distanceM));
  const pace = pacePer500(r);
  if (pace) parts.push(fmtPace(pace));
  else if (r.durationSec) parts.push(fmtDuration(r.durationSec));
  return parts.join(' · ');
}

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, query }) {
  ensureViewStyles();
  ensureV2Styles();
  const today = todayISO();
  let month = today.slice(0, 7);
  let range = '6w';
  let showAll = false;
  let kind = KIND_FILTERS.some(([k]) => k === query.filter) ? query.filter : 'all';
  let barMode = 'strength';
  const exName = (id) => content.exercises.find((e) => e.id === id)?.name ?? id;
  const sTitle = (s) => sessionTitle(s, content, safeData(store.get()).state);
  const kcalOf = (s, data) => sessionKcal(s, bodyWeightKg(data.settings), content);

  const draw = () => {
    const data = safeData(store.get());
    applyFontScale(data.settings);
    const { settings, state } = data;
    const done = doneSessions(data.sessions);
    const st = streak(done, settings.weeklyGoal, today);
    const hold = humanSeconds(totalHoldSeconds(done));
    const tr = trends(done, { days: RANGE[range], today });
    const recs = personalRecords(done, settings);
    const lvl = levelFor(state.xp || 0);
    const minMonth = done.length ? dayOf(done[0]).slice(0, 7) : today.slice(0, 7);
    const shown = filterSessions(done, kind);
    const monthCount = shown.filter((s) => dayOf(s).startsWith(month)).length;
    const list = shown.slice().reverse();
    const rows = rowingTotals(done);
    const rrec = rowingRecords(done);
    const recDate = (rec) => { const hit = rec && done.find((x) => x.id === rec.sessionId); return hit ? { date: dayOf(hit) } : null; };
    const kindCount = Object.fromEntries(KIND_FILTERS.map(([k]) => [k, filterSessions(done, k).length]));
    const visible = showAll ? list : list.slice(0, 8);
    const lightsCount = { green: 0, yellow: 0, red: 0, stop: 0 };
    for (const s of done) { const l = sessionLight(s); if (l) lightsCount[l] += 1; }
    const greenPct = done.length ? Math.round((lightsCount.green / done.length) * 100) : 0;
    const m7 = tr.mean7, p7 = tr.prevMean7;
    const trendNote = m7.post != null && p7.post != null
      ? (m7.post < p7.post ? `Schmerz nachher im Schnitt gesunken: ${fmt1(p7.post)} → ${fmt1(m7.post)} 📉`
        : m7.post > p7.post ? `Schmerz nachher etwas höher: ${fmt1(p7.post)} → ${fmt1(m7.post)} – gut beobachten.`
          : `Schmerz nachher stabil bei ${fmt1(m7.post)}.`)
      : m7.post != null ? `Ø Schmerz nachher (7 Tage): ${fmt1(m7.post)}` : '';

    if (!done.length) {
      paint(root, html`${pageHeader({ title: 'Verlauf' })}
        <section class="card"><div class="empty">
          <div class="empty__art"><svg viewBox="0 0 64 64"><path d="M10 50h44M14 42l12-12 9 7 17-17"/><path d="M44 20h8v8"/></svg></div>
          <h3 class="empty__title">Noch keine Einheiten</h3>
          <p class="empty__text">Hier wächst bald dein Kalender, deine Schmerzkurve und deine Rekorde. Dein erster Pfeil wartet.</p>
          <a class="btn btn--primary" href="#/heute">Zum Training</a>
        </div></section>
        ${badgeSection(data)}`);
      return;
    }

    paint(root, html`
      ${pageHeader({ title: 'Verlauf', eyebrow: `Seit ${formatDE(dayOf(done[0]), { weekday: false })}` })}

      <div class="grid-2 mb-4">
        <div class="stat"><span class="stat__value">${done.length}</span><span class="stat__label">Einheiten</span></div>
        <div class="stat"><span class="stat__value">${hold.value}<span class="stat__unit">${hold.unit}</span></span><span class="stat__label">Haltezeit gesamt</span></div>
        <div class="stat"><span class="stat__value">${st.weeks ? '🔥 ' : ''}${st.weeks}<span class="stat__unit">${st.weeks === 1 ? 'Woche' : 'Wochen'}</span></span><span class="stat__label">Serie</span></div>
        <div class="stat stat--gold"><span class="stat__value">${fmtInt(state.xp || 0)}<span class="stat__unit">XP</span></span><span class="stat__label">${lvl.title}</span></div>
      </div>

      <a class="card pv-report" href="#/auswertung" aria-label="Auswertung öffnen: OP-Bereitschaft, Wochenbericht, Trainingslast">
        <span class="pv-icon-badge pv-icon-badge--gold" aria-hidden="true">📊</span>
        <span class="grow"><span class="eyebrow">Auswertung</span>
          <span class="list-item__title">OP-Bereitschaft · Wochenbericht</span>
          <span class="list-item__sub">Trainingslast ↔ Knie am Folgetag</span></span>
        ${raw(ICON.chev)}
      </a>

      ${rows.sessions ? html`<section class="card card--accent">
        <div class="hero__row"><div class="grow"><p class="hero__eyebrow">Rudern gesamt</p>
          <h2 class="hero__title">${fmtDistance(rows.distanceM)}</h2></div>
          <span class="v2-row-icon" aria-hidden="true" style="color:var(--on-hero)">${raw(ICON2.row)}</span></div>
        <p class="hero__meta mb-0"><span><span class="num">${rows.sessions}</span>&nbsp;${rows.sessions === 1 ? 'Einheit' : 'Einheiten'}</span><span>${raw(ICON.clock)} ${fmtDuration(rows.durationSec)}</span>${rows.kcalDisplay ? html`<span>🔥 ${fmtInt(rows.kcalDisplay)} kcal (Anzeige)</span>` : ''}</p>
      </section>
      <section class="card pv-records">
        ${recordRow('📏', 'Weiteste Strecke', rrec.distanceM ? fmtDistance(rrec.distanceM.value) : null, recDate(rrec.distanceM), null)}
        ${recordRow('⚡', 'Beste Ø-Leistung', rrec.avgWatt ? `${fmtNum(rrec.avgWatt.value, 0)} W` : null, recDate(rrec.avgWatt), null)}
        ${recordRow('⏱️', 'Längste Fahrt', rrec.durationSec ? fmtDuration(rrec.durationSec.value) : null, recDate(rrec.durationSec), null)}
      </section>` : ''}

      <div class="chip-row chip-row--scroll v2-filter-row" role="group" aria-label="Einheiten filtern">
        ${KIND_FILTERS.map(([k, label]) => html`<button class="chip chip--filter" data-kind="${k}" aria-pressed="${String(kind === k)}" ${k !== 'all' && !kindCount[k] ? 'disabled' : ''}>${label} <span class="num">${kindCount[k]}</span></button>`)}
      </div>

      <section class="card">
        <div class="pv-month-nav">
          <button class="btn btn--icon btn--outline btn--sm" data-month="-1" aria-label="Vorheriger Monat" ${month <= minMonth ? 'disabled' : ''}>${raw(ICON.left)}</button>
          <div class="center"><h3>${monthTitle(month)}</h3><span class="text-xs muted"><span class="num">${monthCount}</span> ${monthCount === 1 ? 'Einheit' : 'Einheiten'}</span></div>
          <button class="btn btn--icon btn--outline btn--sm" data-month="1" aria-label="Nächster Monat" ${month >= today.slice(0, 7) ? 'disabled' : ''}>${raw(ICON.right)}</button>
        </div>
        <div data-cal></div>
        <div class="chart-legend" style="justify-content:center">
          <span><i class="is-dot" style="--c:var(--green)"></i>Grün</span>
          <span><i style="--c:var(--yellow);width:10px;height:10px;clip-path:polygon(50% 0,100% 100%,0 100%);border-radius:0"></i>Gelb</span>
          <span><i style="--c:var(--red);width:10px;height:10px;border-radius:2px"></i>Rot</span>
          <span><i style="--c:var(--stop);width:10px;height:10px;border-radius:2px"></i>Stopp</span>
        </div>
        <p class="text-sm muted center mt-2 mb-0"><span class="num">${greenPct} %</span> deiner Einheiten waren grün${lightsCount.green >= 3 ? ' – stark!' : '.'}${kind !== 'all' ? html`<br>Kalender gefiltert: ${KIND_FILTERS.find(([k]) => k === kind)[1]}` : ''}</p>
      </section>

      <section class="card">
        <div class="card__header"><h3 class="card__title">Schmerzverlauf</h3>
          <div class="segmented" role="radiogroup" aria-label="Zeitraum" style="width:150px">
            <label><input type="radio" name="range" value="6w" ${range === '6w' ? 'checked' : ''}><span>6 Wo.</span></label>
            <label><input type="radio" name="range" value="3m" ${range === '3m' ? 'checked' : ''}><span>3 Mon.</span></label>
          </div></div>
        <div data-line></div>
        <div class="chart-legend"><span><i style="--c:var(--chart-1)"></i>vorher</span><span><i style="--c:var(--chart-2)"></i>nachher</span><span><i style="--c:var(--chart-3, var(--accent))"></i>Folgetag</span><span><i style="--c:var(--text)"></i>Ø 7 Tage</span></div>
        ${trendNote ? html`<p class="text-sm mt-2 mb-0">${trendNote}</p>` : ''}
      </section>

      <section class="card">
        <div class="card__header"><h3 class="card__title">Einheiten pro Woche</h3><span class="chip chip--gold chip--sm">Ziel ${barMode === 'cardio' ? settings.cardioGoalPerWeek ?? 3 : settings.weeklyGoal}</span></div>
        ${rows.sessions ? html`<div class="segmented mb-2" role="radiogroup" aria-label="Art der Einheiten">
          <label><input type="radio" name="barmode" value="strength" ${barMode === 'strength' ? 'checked' : ''}><span>Kraft</span></label>
          <label><input type="radio" name="barmode" value="cardio" ${barMode === 'cardio' ? 'checked' : ''}><span>Rudern</span></label>
        </div>` : ''}
        <div data-bar></div>
      </section>

      <h2 class="section-title">Persönliche Rekorde</h2>
      <section class="card pv-records">
        ${recordRow('⏱️', 'Längster Hold', recs.longestHold ? `${recs.longestHold.seconds} s` : null, recs.longestHold, exName)}
        ${recordRow('🔁', 'Meiste Wiederholungen', recs.mostReps ? `${recs.mostReps.reps} Wdh.` : null, recs.mostReps, exName)}
        ${recordRow('🎗️', 'Stärkstes Band', recs.strongestBand ? (bandInfo(settings, recs.strongestBand.band)?.label ?? recs.strongestBand.band) : null, recs.strongestBand, exName, recs.strongestBand ? bandInfo(settings, recs.strongestBand.band)?.color : null)}
      </section>

      ${badgeSection(data)}

      <h2 class="section-title">${kind === 'all' ? 'Alle Einheiten' : `Einheiten · ${KIND_FILTERS.find(([k]) => k === kind)[1]}`} <span class="num">${shown.length}</span></h2>
      ${shown.length ? '' : html`<p class="pv-empty-sm">Keine Einheiten in diesem Filter.</p>`}
      <ul class="list list--card">
        ${visible.map((s) => {
          const k = sessionKind(s);
          const name = sTitle(s);
          const kc = kcalOf(s, data).kcal;
          const sub = k === 'cardio'
            ? [shortDate(dayOf(s)), rowingLine(s) || (sessionMinutes(s) ? fmtMinutes(sessionMinutes(s)) : ''), kc ? `≈ ${fmtInt(kc)} kcal` : ''].filter(Boolean).join(' · ')
            : `${shortDate(dayOf(s))}${sessionMinutes(s) ? ` · ${fmtMinutes(sessionMinutes(s))}` : ''}${kc ? ` · ≈ ${fmtInt(kc)} kcal` : ''}`;
          const iconCls = k === 'cardio' || (s.exercises?.some((e) => e.section === 'archery') && !s.exercises?.some((e) => e.section === 'knee' && !e.skipped)) ? 'list-item__icon--accent' : k === 'custom' ? 'list-item__icon--gold' : '';
          return html`<li><button class="list-item pv-session-item" data-session="${s.id}">
          <span class="list-item__icon ${iconCls}" aria-hidden="true">${k === 'cardio' ? raw(ICON2.row) : String(name).trim().charAt(0)}</span>
          <span class="list-item__body"><span class="list-item__title">${name}${k === 'short' ? html` <span class="chip chip--sm chip--outline">Kurz</span>` : k === 'custom' ? html` <span class="chip chip--sm chip--gold">Eigen</span>` : ''}</span>
          <span class="list-item__sub">${sub}</span></span>
          <span class="list-item__trail">${trafficPill(sessionLight(s))}</span>
        </button></li>`;
        })}
      </ul>
      ${list.length > visible.length ? html`<button class="btn btn--outline btn--block" data-more>Alle ${list.length} anzeigen</button>` : ''}
    `);

    calendarHeatmap(root.querySelector('[data-cal]'), shown.map((s) => ({ date: dayOf(s), value: 1, traffic: sessionLight(s) })), { month, today, label: `Trainingskalender ${monthTitle(month)}` });
    lineChart(root.querySelector('[data-line]'), {
      series: [
        { name: 'vorher', color: 'var(--chart-1)', points: tr.pre },
        { name: 'nachher', color: 'var(--chart-2)', points: tr.post },
        { name: 'Folgetag', color: 'var(--chart-3, var(--accent))', points: tr.nextDay },
      ],
      yMax: 10,
    }, { label: 'Schmerzverlauf vorher, nachher, Folgetag', greenMax: settings.painThresholds?.greenMax, yellowMax: settings.painThresholds?.yellowMax, from: chartFrom(tr, today, RANGE[range]), to: today });
    const weeks = tr.perWeek.slice(-8);
    const cardioMode = barMode === 'cardio' && rows.sessions;
    barChart(root.querySelector('[data-bar]'), weeks.map((w) => (cardioMode
      ? { label: `KW${w.week.slice(-2)}`, value: w.cardio ?? 0, goal: settings.cardioGoalPerWeek ?? 3 }
      : { label: `KW${w.week.slice(-2)}`, value: w.count, goal: settings.weeklyGoal })), { label: cardioMode ? 'Rudereinheiten pro Woche' : 'Krafteinheiten pro Woche' });
  };

  const openSession = (id) => {
    const data = safeData(store.get());
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return;
    const settings = data.settings;
    const score = sessionScore(s, settings, content);
    const light = sessionLight(s);
    const minutes = sessionMinutes(s);
    const cardio = sessionKind(s) === 'cardio';
    const kc = kcalOf(s, data);
    const r = s.rowing || {};
    const pace = pacePer500(r);
    const wName = () => sTitle(s);
    const dlg = openSheet(html`
      <p class="eyebrow">${formatDE(dayOf(s))}${minutes ? ` · ${fmtMinutes(minutes)}` : ''}</p>
      <h2 class="sheet__title">${wName()}</h2>
      <div class="pv-lights">${trafficPill(light, { long: true })}${s.traffic?.final ? html`<span class="chip chip--sm chip--outline">final</span>` : html`<span class="chip chip--sm chip--outline">vorläufig</span>`}${s.taper ? html`<span class="chip chip--sm chip--accent">Taper</span>` : ''}</div>
      ${(s.traffic?.reasons || []).length ? html`<ul class="pv-reasons">${s.traffic.reasons.map((r) => html`<li>${r}</li>`)}</ul>` : ''}
      ${cardio ? html`<div class="summary-head mb-0"><p class="summary-head__title" style="font-size:var(--fs-2xl)">${r.distanceM ? fmtDistance(r.distanceM) : 'Ruder-Einheit'}</p>
          <p class="summary-head__sub">${s.xpEarned ? html`<span class="xp-gain">+${s.xpEarned} XP</span> · ` : ''}${pace ? fmtPace(pace) : 'Werte vom Display'}</p></div>
        <div class="v2-kpis mt-4">
          <div class="v2-kpi"><span class="v2-kpi__v num">${r.durationSec ? fmtClock(r.durationSec) : minutes ? `${minutes}:00` : '–'}</span><span class="v2-kpi__l">Zeit</span></div>
          <div class="v2-kpi"><span class="v2-kpi__v num">${r.avgSpm ?? '–'}</span><span class="v2-kpi__l">Schläge/Min</span></div>
          <div class="v2-kpi"><span class="v2-kpi__v num">${r.avgWatt != null ? html`${fmtNum(r.avgWatt, 0)}<small>W</small>` : '–'}</span><span class="v2-kpi__l">Ø Leistung</span></div>
          <div class="v2-kpi"><span class="v2-kpi__v num">${r.avgHr != null ? html`${r.avgHr}<small>${r.maxHr ? `/ ${r.maxHr}` : 'bpm'}</small>` : '–'}</span><span class="v2-kpi__l">Puls Ø${r.maxHr ? ' / max' : ''}</span></div>
        </div>`
      : html`<div class="summary-head mb-0"><p class="summary-head__title" style="font-size:var(--fs-2xl)">${score.headline}</p>
        <p class="summary-head__sub">${s.xpEarned ? html`<span class="xp-gain">+${s.xpEarned} XP</span> · ` : ''}<span class="num">${score.points}/${score.max}</span> Punkte</p></div>
      <div class="pv-target" data-target></div>`}
      <div class="banner banner--accent mt-4 mb-0"><span class="banner__icon" aria-hidden="true">${raw(ICON2.fire)}</span>
        <span class="banner__body"><span class="banner__title">≈ ${fmtInt(kc.kcal)} kcal</span><span class="banner__text">Schätzung · ${KCAL_METHOD_LABEL[kc.method] ?? kc.method}</span></span></div>
      <div class="pv-sum-grid">
        <div class="stat"><span class="stat__value">${s.pre?.pain ?? '–'}</span><span class="stat__label">Vorher</span></div>
        <div class="stat"><span class="stat__value">${s.post?.pain ?? '–'}</span><span class="stat__label">Nachher</span></div>
        <div class="stat"><span class="stat__value">${s.nextDay?.pain ?? '–'}</span><span class="stat__label">Folgetag</span></div>
      </div>
      ${s.post?.rpe != null ? html`<p class="text-sm muted center">Anstrengung gesamt (RPE): <strong class="num">${s.post.rpe}/10</strong>${s.post?.swelling ? ` · Schwellung ${s.post.swelling === 1 ? 'leicht' : 'deutlich'}` : ''}</p>` : ''}
      ${s.post?.note ? html`<p class="pv-note">„${s.post.note}“</p>` : ''}
      <details class="disclosure mt-4"><summary>Übungen (${(s.exercises || []).length})</summary>
        <ul class="pv-ex-sum">${(s.exercises || []).map((e) => {
          const doneSets = (e.sets || []).filter((x) => x?.done).length;
          return html`<li>
            <span class="pv-sec-dot ${e.section === 'knee' ? 'is-knee' : e.section === 'archery' || e.section === 'cardio' ? 'is-archery' : ''}"></span>
            <span class="pv-ex-sum__name">${exName(e.exerciseId)}</span>
            <span class="pv-ex-sum__val">${e.skipped ? 'übersprungen' : e.section === 'cardio' || (e.sets || []).some((x) => x?.seconds && !x?.reps) ? fmtDuration((e.sets || []).reduce((a, x) => a + (x?.done ? x.seconds || 0 : 0), 0)) : `${doneSets} ${doneSets === 1 ? 'Satz' : 'Sätze'}`}${e.painDuring != null ? ` · S ${e.painDuring}` : ''}${e.rpe != null ? ` · RPE ${e.rpe}` : ''}${e.sharpPain ? ' · ⚡' : ''}</span>
          </li>`;
        })}</ul>
      </details>
      <div class="sheet__actions">
        <button class="btn btn--outline btn--block" data-close>Schließen</button>
        <button class="btn btn--danger btn--block" data-delete="${s.id}">${raw(ICON.trash)} Einheit löschen</button>
      </div>
    `, { label: `Einheit vom ${formatDE(dayOf(s))}` });
    dlg.querySelector('[data-target]')?.appendChild(targetFace(score.results));
    dlg.querySelector('[data-delete]').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Einheit löschen?', text: `${wName()} vom ${formatDE(dayOf(s), { weekday: false })} wird entfernt, die XP dieser Einheit werden abgezogen. Das lässt sich nicht rückgängig machen.`, confirm: 'Löschen', danger: true, icon: '🗑️' });
      if (!ok) return;
      dlg.close();
      store.update((d) => deleteSession(d, s.id));
      toast('Einheit gelöscht', { icon: '🗑️' });
    });
  };

  const onClick = (e) => {
    const m = e.target.closest('[data-month]');
    if (m) { month = shiftMonth(month, Number(m.dataset.month)); draw(); return; }
    if (e.target.closest('[data-more]')) { showAll = true; draw(); return; }
    const kb = e.target.closest('[data-kind]');
    if (kb) {
      kind = kb.dataset.kind;
      showAll = false;
      history.replaceState(null, '', `#/verlauf${kind !== 'all' ? `?filter=${kind}` : ''}`);
      draw();
      return;
    }
    const s = e.target.closest('[data-session]');
    if (s) { openSession(s.dataset.session); return; }
    const cell = e.target.closest('.cell[data-date]');
    if (cell) {
      const hit = filterSessions(doneSessions(safeData(store.get()).sessions), kind).filter((x) => dayOf(x) === cell.dataset.date).at(-1);
      if (hit) openSession(hit.id);
    }
  };
  const onChange = (e) => {
    if (e.target.name === 'range') { range = e.target.value; draw(); }
    if (e.target.name === 'barmode') { barMode = e.target.value; draw(); }
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  const unsub = store.subscribe(draw);
  if (query.session) setTimeout(() => openSession(query.session), 50);
  if (query.show === 'badges') setTimeout(() => root.querySelector('#badges')?.scrollIntoView({ block: 'start' }), 60);
  return () => {
    unsub();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    document.querySelectorAll('dialog.sheet[open], dialog.modal[open]').forEach((d) => d.close());
  };

  function badgeSection(data) {
    const have = data.state.badges || {};
    const n = content.badges.filter((b) => have[b.id]).length;
    return html`<h2 class="section-title" id="badges">Abzeichen <span class="num">${n}/${content.badges.length}</span></h2>
      <ul class="badge-grid">
        ${content.badges.map((b) => {
          const at = have[b.id];
          const unlocked = !!at;
          return html`<li class="badge-tile ${unlocked ? 'is-unlocked' : 'is-locked'}" title="${b.description}">
            <span class="badge-tile__icon" aria-hidden="true">${b.icon}</span>
            <span class="badge-tile__name">${b.name}</span>
            <span class="badge-tile__hint">${unlocked ? shortDate(isoDay(at)).replace(/^\S+\s/, '') : badgeHint(b, data)}</span>
          </li>`;
        })}
      </ul>`;
  }
}

/**
 * Start of the pain chart's x-axis (P2-21): the first data point inside the range, but at least a 2-week span –
 * with little data the curve no longer gets squeezed against the right edge.
 * @param {{pre?: {x: string}[], post?: {x: string}[], nextDay?: {x: string}[]}} tr @param {string} today @param {number} days
 */
export function chartFrom(tr, today, days) {
  const rangeStart = addDays(today, -(days - 1));
  const minSpanStart = addDays(today, -13);
  const xs = [...(tr?.pre || []), ...(tr?.post || []), ...(tr?.nextDay || [])]
    .map((p) => p?.x).filter((x) => typeof x === 'string' && x >= rangeStart).sort();
  if (!xs.length) return minSpanStart < rangeStart ? rangeStart : minSpanStart;
  const first = xs[0] < minSpanStart ? xs[0] : minSpanStart;
  return first < rangeStart ? rangeStart : first;
}

function isoDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return todayISO();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fmt1 = (n) => (Number.isFinite(Number(n)) ? (Math.round(n * 10) / 10).toLocaleString('de-DE') : '–');

function recordRow(icon, label, value, rec, exName, swatch = null) {
  return html`<div class="pv-record">
    <span class="pv-record__icon" aria-hidden="true">${icon}</span>
    <span class="pv-record__body"><span class="list-item__sub" style="margin:0">${label}</span>
      <span class="pv-record__val">${value ?? '–'}</span>
      ${rec?.date ? html`<span class="list-item__sub">${exName ? `${exName(rec.exerciseId)} · ` : ''}${shortDate(rec.date)}</span>` : html`<span class="list-item__sub">Noch kein Rekord</span>`}</span>
    ${swatch ? html`<span class="pv-band__swatch" style="--band:${swatch}"></span>` : ''}
  </div>`;
}

