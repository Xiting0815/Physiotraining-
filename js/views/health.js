// Gesundheit – Tagebuch (Samsung-Health-Werte), Auswertung, Diagramme. See docs/SPEC.md §12.6, §12.7, §12.11, §12.12.
import { html, raw, render as paint } from '../render.js';
import { todayISO, addDays, startOfIsoWeek, isoWeekKey, formatDE, parseISODate } from '../util/date.js';
import {
  HEALTH_FIELDS, validateEntry, upsertEntry, removeEntry, entryFor, latest, series, weeklyAverages, logStreak,
} from '../logic/health.js';
import { healthLogXp } from '../logic/motivation.js';
import { weeklyReport, opReadiness, loadVsPain, sleepVsPain, stepsVsPain, weightInsight, MIN_POINTS } from '../logic/insights.js';
import { goalProgress } from '../logic/energy.js';
import { currentPhase } from '../logic/progression.js';
import { lineChart, barChart, progressRing } from '../components/charts.js';
import { ICON, ensureViewStyles, applyFontScale, pageHeader, shortDate, toast, confirmDialog, trafficPill } from './ui.js';
import { ensureV2Styles, ICON2, awardBadges, celebrateBadges, fmtNum, fmtDistance, meter, offsetLineChart } from './v2-shared.js';

export const title = 'Gesundheit';

/** Form groups (order of HEALTH_FIELDS in the UI). */
export const FIELD_GROUPS = [
  { title: 'Körper', icon: 'scale', fields: ['weightKg', 'bodyFatPct', 'waistCm'] },
  { title: 'Aktivität', icon: 'steps', fields: ['steps', 'activeMin'] },
  { title: 'Herz', icon: 'heart', fields: ['restingHr', 'avgTrainingHr'] },
  { title: 'Schlaf', icon: 'moon', fields: ['sleepH'] },
];
const DIGITS = { weightKg: 1, bodyFatPct: 1, waistCm: 1, sleepH: 2 };
const SHORT = { weightKg: '⚖️', bodyFatPct: 'KF', waistCm: '📏', steps: '👣', activeMin: '⏱️', restingHr: '❤️', avgTrainingHr: '🏃', sleepH: '😴' };
const PART_LABEL = {
  criteria: 'Ausstiegskriterien der Phasen',
  strength: 'Kraftstufen Knie & Stütz',
  swellingFree: 'Ohne Schwellung (14 Tage)',
  regularity: 'Regelmäßigkeit (4 Wochen)',
};
const RANGE_DAYS = { '4w': 28, '3m': 91 };

/** Format a stored value for an input (comma decimals). */
export function inputValue(field, v) {
  if (v == null || v === '') return '';
  return String(v).replace('.', ',');
}

/** Pretty value incl. unit, e.g. „92,4 kg“, „8.214“ steps, „7,5 h“. */
export function fieldText(field, v) {
  const f = HEALTH_FIELDS[field];
  if (v == null || !f) return '–';
  const n = Number(v).toLocaleString('de-DE', { maximumFractionDigits: DIGITS[field] ?? 0 });
  return f.unit ? `${n} ${f.unit}` : n;
}

/** Short chips for an entry in the list. */
export function entrySummary(entry) {
  return Object.keys(HEALTH_FIELDS).filter((k) => typeof entry?.[k] === 'number').map((k) => ({ key: k, icon: SHORT[k], label: HEALTH_FIELDS[k].label, text: fieldText(k, entry[k]) }));
}

/**
 * Tip for the weekly report: open strength/rowing goal (current week) → readiness tip → generic.
 * @param {ReturnType<typeof weeklyReport>} rep @param {{tips: string[]}|null} readiness @param {boolean} isCurrent
 */
export function reportTip(rep, readiness, isCurrent) {
  if (isCurrent) {
    const s = rep.strength.goal - rep.strength.done;
    const c = rep.cardio.goal - rep.cardio.done;
    if (s > 0 && c > 0) return `Noch ${s}× Kraft und ${c}× Rudern bis zu deinen Wochenzielen – gern auf verschiedene Tage verteilt.`;
    if (s > 0) return `Noch ${s} Kraft-Einheit${s === 1 ? '' : 'en'} bis zum Wochenziel – ein Kurztraining zählt auch.`;
    if (c > 0) return `Noch ${c}× Rudern bis zum Ruder-Ziel – locker 15 Minuten reichen.`;
  }
  if (rep.notes.length) return rep.notes[0];
  if (readiness?.tips?.length) return readiness.tips[0];
  return 'Weiter so – Konstanz schlägt Intensität. 🎯';
}

/** View model of a correlation result. */
export function corrView(res) {
  if (!res || res.r == null) return { enough: false, n: res?.n ?? 0, need: MIN_POINTS, text: `Noch zu wenige Daten (${res?.n ?? 0}/${MIN_POINTS})` };
  return { enough: true, n: res.n, r: res.r, text: res.text };
}

const de1 = (n) => fmtNum(n, 1);
const signed = (n, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmtNum(Math.abs(n), d);

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, query }) {
  ensureViewStyles();
  ensureV2Styles();
  const today = todayISO();
  const ui = {
    tab: ['eintragen', 'auswertung', 'diagramme'].includes(query.tab) ? query.tab : 'eintragen',
    date: /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') && query.date <= today ? query.date : today,
    weekOf: today,
    range: '4w',
    showAll: false,
    errors: {},
  };

  const syncUrl = () => {
    const parts = [];
    if (ui.tab !== 'eintragen') parts.push(`tab=${ui.tab}`);
    history.replaceState(null, '', `#/gesundheit${parts.length ? '?' + parts.join('&') : ''}`);
  };

  /* ------------------------------ Tagebuch ------------------------------ */
  const formTpl = (data) => {
    const log = data.state.healthLog || [];
    const entry = entryFor(log, ui.date);
    const streakN = logStreak(log, today);
    const todayDone = !!entryFor(log, today);
    const field = (k) => {
      const f = HEALTH_FIELDS[k];
      const last = latest(log, k, today);
      const err = ui.errors[k];
      const int = k === 'steps' || k === 'activeMin' || k.endsWith('Hr');
      return html`<div class="field">
        <label class="field__label" for="hf-${k}">${f.label}</label>
        <div class="v2-unit"><input class="input ${err ? 'is-invalid' : ''}" id="hf-${k}" name="${k}" type="text" inputmode="${int ? 'numeric' : 'decimal'}" autocomplete="off"
          value="${inputValue(k, entry?.[k])}" placeholder="${last ? inputValue(k, last.value) : ''}" ${err ? html`aria-invalid="true" aria-describedby="hf-${k}-err"` : ''}>${f.unit ? html`<span>${f.unit}</span>` : ''}</div>
        ${err ? html`<span class="v2-field-err" id="hf-${k}-err">${err}</span>` : ''}
      </div>`;
    };
    return html`
      <section class="card card--hero">
        <div class="hero__row">
          <div class="grow">
            <p class="hero__eyebrow">Tagebuch</p>
            <h2 class="hero__title">${todayDone ? 'Heute schon eingetragen ✓' : 'Wie war dein Tag?'}</h2>
            <p class="hero__meta mb-0"><span>${streakN ? `🔥 ${streakN} ${streakN === 1 ? 'Tag' : 'Tage'} in Folge` : 'Starte deine Serie – jeder Eintrag zählt.'}</span><span>+5 XP pro Tag</span></p>
          </div>
        </div>
      </section>

      <form class="card" data-form novalidate>
        <div class="card__header">
          <div><h2 class="card__title">${entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2>
            <p class="card__sub">${entry ? `Werte vom ${formatDE(ui.date)} – leere Felder werden entfernt.` : 'Trag ein, was du hast – alles ist optional.'}</p></div>
        </div>
        <div class="field">
          <label class="field__label" for="hf-date">Datum</label>
          <input class="input" id="hf-date" type="date" name="date" value="${ui.date}" max="${today}" data-date>
          ${ui.date !== today ? html`<button type="button" class="btn btn--ghost btn--sm" data-today style="align-self:flex-start">Zurück zu heute</button>` : ''}
        </div>
        ${FIELD_GROUPS.map((g) => html`<p class="v2-group-title">${raw(ICON2[g.icon])}${g.title}</p>
          <div class="v2-form-grid">${g.fields.map(field)}</div>`)}
        <div class="field">
          <label class="field__label" for="hf-note">Notiz</label>
          <textarea class="textarea" id="hf-note" name="note" maxlength="500" rows="2" placeholder="z. B. schlecht geschlafen, Knie etwas steif">${entry?.note ?? ''}</textarea>
        </div>
        ${ui.errors._ ? html`<p class="v2-field-err" role="alert">${ui.errors._}</p>` : ''}
        <button class="btn btn--primary btn--block btn--lg" type="submit">${raw(ICON.check)} ${entry ? 'Änderungen speichern' : 'Eintrag speichern'}</button>
        <details class="disclosure mt-4 mb-0">
          <summary>So findest du die Werte in Samsung Health</summary>
          <ol class="v2-hint-steps">
            <li><strong>Gewicht, Körperfett:</strong> Startseite → Kachel „Körperzusammensetzung“ bzw. „Gewicht“ – Wert vom Morgen nehmen (nüchtern, nach dem WC).</li>
            <li><strong>Bauchumfang:</strong> selbst messen, auf Nabelhöhe, entspannt ausatmen.</li>
            <li><strong>Schritte, aktive Minuten:</strong> Kachel „Schritte“ bzw. „Aktivität / Aktive Zeit“ – den Tageswert vom Vortag übernehmen, wenn du morgens einträgst.</li>
            <li><strong>Ruhepuls:</strong> Kachel „Herzfrequenz“ → Tagesübersicht, Wert „Ruhe“ (oder morgens im Liegen messen).</li>
            <li><strong>Ø Trainingspuls:</strong> „Training“ / „Übungen“ → letzte Einheit → „Durchschnittl. Herzfrequenz“.</li>
            <li><strong>Schlaf:</strong> Kachel „Schlaf“ → Gesamtschlafzeit der letzten Nacht (z. B. 7 h 15 min = 7,25).</li>
          </ol>
          <p class="text-xs muted mb-0">Bezeichnungen können je nach App-Version leicht abweichen. Die Werte bleiben nur auf diesem Gerät.</p>
        </details>
      </form>

      ${entriesTpl(log)}`;
  };

  const entriesTpl = (log) => {
    const list = log.slice().reverse();
    const visible = ui.showAll ? list : list.slice(0, 10);
    if (!list.length) return html`<p class="pv-empty-sm">Noch keine Einträge. Dein erster Eintrag startet die Diagramme. 📈</p>`;
    return html`<h2 class="section-title">Einträge <span class="num">${list.length}</span></h2>
      <ul class="list list--card">
        ${visible.map((e) => {
          const d = parseISODate(e.date);
          const chips = entrySummary(e);
          return html`<li class="v2-entry">
            <span class="v2-entry__date"><b class="num">${String(d.getDate()).padStart(2, '0')}</b><span>${shortDate(e.date).slice(0, 3)} ${String(d.getMonth() + 1).padStart(2, '0')}.</span></span>
            <span class="v2-entry__vals">${chips.map((c) => html`<span title="${c.label}"><span aria-hidden="true">${c.icon}</span> <span class="sr-only">${c.label}: </span>${c.text}</span>`)}${e.note ? html`<span class="muted">„${e.note}“</span>` : ''}</span>
            <span class="v2-entry__btns">
              <button class="btn btn--outline btn--sm" data-edit="${e.date}" aria-label="Eintrag vom ${formatDE(e.date)} bearbeiten">${raw(ICON2.edit)}</button>
              <button class="btn btn--danger btn--sm" data-del="${e.date}" aria-label="Eintrag vom ${formatDE(e.date)} löschen">${raw(ICON.trash)}</button>
            </span>
          </li>`;
        })}
      </ul>
      ${list.length > visible.length ? html`<button class="btn btn--outline btn--block mt-2" data-all>Alle ${list.length} anzeigen</button>` : ''}`;
  };

  /* ------------------------------ Auswertung ------------------------------ */
  const insightsTpl = (data) => {
    const log = data.state.healthLog || [];
    const phase = currentPhase(data.state, content.phases);
    const prehab = (phase?.kind ?? 'prehab') === 'prehab';
    const ready = prehab ? opReadiness(data, content, today) : null;
    const rep = weeklyReport(data, content, today, { weekOf: ui.weekOf });
    const isCurrent = rep.weekStart === startOfIsoWeek(today);
    const tip = reportTip(rep, ready, isCurrent);
    const corr = [
      { title: 'Trainingslast ↔ Knie am Folgetag', icon: '🏋️', res: loadVsPain(data.sessions, { today }) },
      { title: 'Schlaf ↔ Knieschmerz', icon: '😴', res: sleepVsPain(log, data.sessions, { today }) },
      { title: 'Schritte ↔ Knie am Folgetag', icon: '👣', res: stepsVsPain(log, data.sessions, { today }) },
    ];
    const wi = weightInsight(log, today);
    const goal = data.settings.weightGoal;
    const gp = goal ? goalProgress(log, goal, today, data.settings.profile) : null;
    const painDelta = rep.avgNextDayPain != null && rep.prevAvgNextDayPain != null ? rep.avgNextDayPain - rep.prevAvgNextDayPain : null;
    const kpi = (v, l, met = false) => html`<div class="v2-kpi ${met ? 'is-met' : ''}"><span class="v2-kpi__v">${v}</span><span class="v2-kpi__l">${l}</span></div>`;
    const wDelta = rep.weight.deltaKg;

    return html`
      ${ready ? html`<section class="card">
        <div class="card__header"><div><p class="eyebrow">Heuristik · keine medizinische Beurteilung</p><h2 class="card__title">OP-Bereitschaft</h2></div></div>
        <div class="v2-ready">
          ${raw(progressRing({ value: ready.score, max: 100, label: ready.score, unit: 'von 100', size: 'lg', variant: ready.score >= 80 ? 'gold' : 'primary', ariaLabel: `OP-Bereitschaft ${ready.score} von 100` }))}
          <div class="grow"><p class="ring-card__title">${ready.label}</p>
            <p class="ring-card__sub">${ready.score >= 80 ? 'Du bist richtig gut vorbereitet – halte das Niveau.' : ready.score >= 60 ? 'Starke Basis! Jede Einheit bringt dich weiter.' : 'Schritt für Schritt – Regelmäßigkeit macht den Unterschied.'}</p></div>
        </div>
        <div class="v2-parts">${Object.entries(ready.parts).map(([k, p]) => html`<div>
          <div class="v2-part__head"><span>${PART_LABEL[k] ?? k}</span><span><span class="num">${p.score} %</span> · Anteil ${p.weight} %</span></div>
          ${meter(p.score / 100, p.score >= 80 ? '' : 'v2-meter--primary')}</div>`)}</div>
        ${ready.tips.length ? html`<ul class="v2-tips">${ready.tips.map((t) => html`<li>${t}</li>`)}</ul>` : ''}
      </section>` : ''}

      <section class="card">
        <div class="v2-week-nav">
          <button class="btn btn--icon btn--outline btn--sm" data-week="-1" aria-label="Vorherige Woche">${raw(ICON.left)}</button>
          <div class="center"><h3>Wochenbericht · KW ${isoWeekKey(rep.weekStart).slice(-2)}</h3>
            <span class="text-xs muted">${shortDate(rep.weekStart)} – ${shortDate(rep.weekEnd)}${isCurrent ? ' · laufende Woche' : ''}</span></div>
          <button class="btn btn--icon btn--outline btn--sm" data-week="1" aria-label="Nächste Woche" ${isCurrent ? 'disabled' : ''}>${raw(ICON.right)}</button>
        </div>
        <div class="v2-kpis">
          ${kpi(html`<span class="num">${rep.strength.done}</span><small>/ ${rep.strength.goal}</small>`, 'Kraft-Einheiten', rep.strength.done >= rep.strength.goal)}
          ${kpi(html`<span class="num">${rep.cardio.done}</span><small>/ ${rep.cardio.goal}</small>`, 'Rudereinheiten', rep.cardio.done >= rep.cardio.goal)}
          ${kpi(html`${rep.cardio.distanceM ? fmtDistance(rep.cardio.distanceM) : '–'}`, `Gerudert${rep.cardio.minutes ? ` · ${rep.cardio.minutes} Min` : ''}`)}
          ${kpi(html`≈ <span class="num">${fmtNum(rep.kcal)}</span><small>kcal</small>`, 'Training (Schätzung)')}
          ${kpi(html`${wDelta == null ? '–' : html`<span class="num">${signed(wDelta)}</span><small>kg</small>`}`, rep.weight.endKg != null ? `Gewicht · Ø ${de1(rep.weight.endKg)} kg` : 'Gewicht (Ø 7 Tage)')}
          ${kpi(html`${rep.avgNextDayPain == null ? '–' : html`<span class="num">${de1(rep.avgNextDayPain)}</span>${painDelta == null ? '' : html`<small>${painDelta < -0.2 ? '↓ besser' : painDelta > 0.2 ? '↑ höher' : '→ stabil'}</small>`}`}`, 'Knie Folgetag Ø')}
        </div>
        <div class="chip-row mt-4">
          ${['green', 'yellow', 'red', 'stop'].filter((l) => rep.lights[l]).map((l) => html`<span class="row" style="gap:4px">${trafficPill(l)}<span class="num text-sm">× ${rep.lights[l]}</span></span>`)}
          ${rep.logDays ? html`<span class="chip chip--sm chip--outline">📓 Tagebuch ${rep.logDays}/7</span>` : ''}
          ${rep.health.sleepH != null ? html`<span class="chip chip--sm chip--outline">😴 Ø ${de1(rep.health.sleepH)} h</span>` : ''}
          ${rep.health.steps != null ? html`<span class="chip chip--sm chip--outline">👣 Ø ${fmtNum(rep.health.steps)}</span>` : ''}
          ${rep.health.restingHr != null ? html`<span class="chip chip--sm chip--outline">❤️ Ø ${fmtNum(rep.health.restingHr)} bpm</span>` : ''}
        </div>
        ${rep.highlights.length ? html`<ul class="v2-list-check">${rep.highlights.map((h) => html`<li>${h}</li>`)}</ul>` : ''}
        ${rep.notes.length ? html`<ul class="v2-list-check is-note">${rep.notes.map((h) => html`<li>${h}</li>`)}</ul>` : ''}
        <div class="banner banner--gold mt-4 mb-0"><span class="banner__icon" aria-hidden="true">${raw(ICON2.sparkles)}</span>
          <span class="banner__body"><span class="banner__title">Tipp</span><span class="banner__text">${tip}</span></span></div>
      </section>

      <section class="card">
        <div class="card__header"><div><h2 class="card__title">Zusammenhänge</h2><p class="card__sub">Nur Tendenzen aus deinen Daten – kein Beweis für Ursache und Wirkung.</p></div></div>
        ${corr.map((c) => {
          const v = corrView(c.res);
          return html`<div class="v2-corr">
            <div class="v2-corr__head"><strong><span aria-hidden="true">${c.icon}</span> ${c.title}</strong>
              ${v.enough ? html`<span class="chip chip--sm ${Math.abs(v.r) >= 0.4 ? 'chip--gold' : 'chip--outline'} num">r = ${fmtNum(v.r, 2)}</span>` : html`<span class="chip chip--sm chip--outline num">${v.n}/${v.need}</span>`}</div>
            ${v.enough ? html`<p>${v.text}</p>` : html`<p>${v.text} – trag weiter ein, dann wird es spannend.</p>${meter(v.n / v.need, 'v2-meter--primary')}`}
          </div>`;
        })}
      </section>

      <section class="card">
        <div class="card__header"><div><h2 class="card__title">Gewicht</h2><p class="card__sub">${wi.text}</p></div>
          ${wi.currentKg != null ? html`<span class="chip chip--primary num">Ø ${de1(wi.currentKg)} kg</span>` : ''}</div>
        ${gp ? html`
          <div class="v2-kpis">
            ${kpi(html`<span class="num">${gp.lostKg != null ? signed(-gp.lostKg) : '–'}</span><small>kg</small>`, `seit Start (${de1(gp.startKg)} kg)`, (gp.lostKg ?? 0) > 0)}
            ${kpi(html`<span class="num">${gp.remainingKg != null ? de1(gp.remainingKg) : '–'}</span><small>kg</small>`, `bis Ziel ${de1(gp.targetKg)} kg`, gp.reached)}
          </div>
          ${meter(gp.ratio, 'v2-meter--primary')}
          <p class="text-sm mt-2 mb-0">${gp.reached ? '🎉 Ziel erreicht – stark!' : gp.onTrack === true ? `Auf Kurs${gp.projectedDate ? ` – voraussichtlich ${formatDE(gp.projectedDate, { weekday: false })}` : ''}. 👍` : gp.onTrack === false ? 'Aktuell etwas langsamer als geplant – kleine Schritte zählen trotzdem.' : 'Für eine Prognose braucht es ein paar Wiegungen mehr.'}</p>
          ${gp.warnings.map((w) => html`<p class="text-sm mt-2 mb-0" style="color:var(--yellow-ink)">⚠️ ${w}</p>`)}
          <a class="btn btn--ghost btn--sm mt-2" href="#/profil">Ziel anpassen</a>`
        : html`<a class="btn btn--soft btn--block" href="#/profil">${raw(ICON.target)} Gewichtsziel festlegen</a>`}
      </section>`;
  };

  /* ------------------------------ Diagramme ------------------------------ */
  const chartsTpl = () => html`
    <div class="segmented mb-4" role="radiogroup" aria-label="Zeitraum">
      <label><input type="radio" name="range" value="4w" ${ui.range === '4w' ? 'checked' : ''}><span>4 Wochen</span></label>
      <label><input type="radio" name="range" value="3m" ${ui.range === '3m' ? 'checked' : ''}><span>3 Monate</span></label>
    </div>
    <section class="card"><div class="card__header"><h2 class="card__title">Gewicht</h2><span class="card__sub" data-wnow></span></div>
      <div data-c-weight></div>
      <div class="chart-legend"><span><i style="--c:var(--chart-1);opacity:.5"></i>Tageswert</span><span><i style="--c:var(--chart-1)"></i>Ø 7 Tage</span><span data-goal-legend><i style="--c:var(--gold)"></i>Ziel</span></div></section>
    <section class="card"><div class="card__header"><h2 class="card__title">Schritte</h2><span class="card__sub">Ø pro Tag und Woche</span></div><div data-c-steps></div></section>
    <section class="card"><div class="card__header"><h2 class="card__title">Schlaf</h2><span class="card__sub">Stunden pro Nacht</span></div><div data-c-sleep></div>
      <div class="chart-legend"><span><i style="--c:var(--chart-3);opacity:.5"></i>Nacht</span><span><i style="--c:var(--chart-3)"></i>Ø 7 Tage</span></div></section>
    <section class="card"><div class="card__header"><h2 class="card__title">Ruhepuls</h2><span class="card__sub">bpm · sinkt oft mit der Fitness</span></div><div data-c-hr></div>
      <div class="chart-legend"><span><i style="--c:var(--red);opacity:.5"></i>Tageswert</span><span><i style="--c:var(--red)"></i>Ø 7 Tage</span></div></section>`;

  const drawCharts = (data) => {
    const log = data.state.healthLog || [];
    const days = RANGE_DAYS[ui.range];
    const from = addDays(today, -(days - 1));
    const goal = data.settings.weightGoal;
    const w = series(log, 'weightKg', days, today);
    const wSeries = [{ name: 'Gewicht', color: 'var(--chart-1)', points: w, mean: true }];
    if (goal?.targetKg && w.length) wSeries.push({ name: 'Ziel', color: 'var(--gold)', points: [{ x: from, y: goal.targetKg }, { x: today, y: goal.targetKg }], mean: false, dashed: true });
    root.querySelector('[data-goal-legend]').hidden = wSeries.length < 2;
    const wi = weightInsight(log, today);
    root.querySelector('[data-wnow]').textContent = wi.currentKg != null ? `Ø 7 Tage: ${de1(wi.currentKg)} kg` : '';
    offsetLineChart(lineChart, root.querySelector('[data-c-weight]'), wSeries, { pad: 0.5, step: 1, minSpan: 4, digits: 1, unit: 'kg', label: 'Gewichtsverlauf mit 7-Tage-Mittel', from, to: today });
    const wk = weeklyAverages(log, { weeks: ui.range === '4w' ? 4 : 13, today });
    barChart(root.querySelector('[data-c-steps]'), wk.map((x) => ({ label: `KW${isoWeekKey(x.weekStart).slice(-2)}`, value: Math.round(x.avg.steps ?? 0) })), {
      label: 'Durchschnittliche Schritte pro Tag je Woche', format: (v) => (v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : fmtNum(v)),
    });
    offsetLineChart(lineChart, root.querySelector('[data-c-sleep]'), [{ name: 'Schlaf', color: 'var(--chart-3)', points: series(log, 'sleepH', days, today), mean: true }], { pad: 0.5, step: 1, minSpan: 4, digits: 2, unit: 'h', label: 'Schlafdauer pro Nacht', from, to: today });
    offsetLineChart(lineChart, root.querySelector('[data-c-hr]'), [{ name: 'Ruhepuls', color: 'var(--red)', points: series(log, 'restingHr', days, today), mean: true }], { pad: 2, step: 5, minSpan: 10, digits: 0, unit: 'bpm', label: 'Ruhepuls', from, to: today });
  };

  /* ------------------------------ page ------------------------------ */
  const draw = () => {
    const data = store.get();
    applyFontScale(data.settings);
    paint(root, html`
      ${pageHeader({ title: 'Gesundheit', eyebrow: 'Tagebuch · Auswertung · Gewicht', back: '#/mehr', backLabel: 'Zurück zu Mehr' })}
      <div class="segmented v2-tabs" role="radiogroup" aria-label="Bereich">
        <label><input type="radio" name="tab" value="eintragen" ${ui.tab === 'eintragen' ? 'checked' : ''}><span>Tagebuch</span></label>
        <label><input type="radio" name="tab" value="auswertung" ${ui.tab === 'auswertung' ? 'checked' : ''}><span>Auswertung</span></label>
        <label><input type="radio" name="tab" value="diagramme" ${ui.tab === 'diagramme' ? 'checked' : ''}><span>Diagramme</span></label>
      </div>
      <div data-panel>${ui.tab === 'eintragen' ? formTpl(data) : ui.tab === 'auswertung' ? insightsTpl(data) : chartsTpl()}</div>
    `);
    if (ui.tab === 'diagramme') drawCharts(data);
  };

  const readForm = (form) => {
    const fd = new FormData(form);
    const input = { date: ui.date, note: String(fd.get('note') || '') };
    for (const k of Object.keys(HEALTH_FIELDS)) input[k] = String(fd.get(k) ?? '').trim();
    return input;
  };

  const onSubmit = (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const input = readForm(form);
    const v = validateEntry(input);
    if (!v.ok) {
      ui.errors = v.errors;
      draw();
      root.querySelector('[aria-invalid="true"], [role="alert"]')?.focus?.();
      toast('Bitte die markierten Werte prüfen', { kind: 'accent', icon: '!' });
      return;
    }
    ui.errors = {};
    let xp = 0;
    let badges = [];
    let existed = false;
    store.update((d) => {
      const prev = d.state.healthLog || [];
      existed = prev.some((x) => x.date === v.entry.date);
      xp = healthLogXp(prev, v.entry.date);
      d.state.healthLog = upsertEntry(prev, v.entry, { replace: true });
      d.state.xp = (d.state.xp || 0) + xp;
      badges = awardBadges(d, content.badges, today);
    });
    toast(existed ? 'Eintrag aktualisiert' : `Eintrag gespeichert${xp ? ` · +${xp} XP` : ''}`, { kind: xp ? 'gold' : 'success', icon: xp ? '⭐' : '✓' });
    celebrateBadges(badges, content.badges);
  };

  const onClick = async (e) => {
    const wb = e.target.closest('[data-week]');
    if (wb) {
      const next = addDays(startOfIsoWeek(ui.weekOf), 7 * Number(wb.dataset.week));
      if (next <= today) { ui.weekOf = next; draw(); }
      return;
    }
    if (e.target.closest('[data-today]')) { ui.date = today; ui.errors = {}; draw(); return; }
    if (e.target.closest('[data-all]')) { ui.showAll = true; draw(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      ui.date = ed.dataset.edit;
      ui.errors = {};
      draw();
      root.querySelector('[data-form]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      root.querySelector('#hf-weightKg')?.focus({ preventScroll: true });
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const date = del.dataset.del;
      const ok = await confirmDialog({ title: 'Eintrag löschen?', text: `Alle Werte vom ${formatDE(date)} werden entfernt.`, confirm: 'Löschen', danger: true, icon: '🗑️' });
      if (!ok) return;
      store.update((d) => { d.state.healthLog = removeEntry(d.state.healthLog || [], date); });
      toast('Eintrag gelöscht', { icon: '🗑️' });
    }
  };

  const onChange = (e) => {
    const t = e.target;
    if (t.name === 'tab') { ui.tab = t.value; ui.errors = {}; syncUrl(); draw(); return; }
    if (t.name === 'range') { ui.range = t.value; drawCharts(store.get()); return; }
    if (t.matches('[data-date]')) {
      if (!t.value || t.value > today) { t.value = ui.date; return; }
      ui.date = t.value;
      ui.errors = {};
      draw();
      root.querySelector('#hf-date')?.focus();
    }
  };

  draw();
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  const unsub = store.subscribe(draw);
  return () => {
    unsub();
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    document.querySelectorAll('dialog.modal[open]').forEach((d) => d.close());
  };
}
