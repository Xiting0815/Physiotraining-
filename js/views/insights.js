// Auswertung (#/auswertung) – training-only insights: OP-Bereitschaft, Wochenbericht, Trainingslast ↔ Knie.
// See docs/SPEC.md §12.11, §14. Query `?focus=bereitschaft|bericht|last` scrolls to the card.
import { html, raw, render as paint } from '../render.js';
import { todayISO, addDays, startOfIsoWeek, isoWeekKey } from '../util/date.js';
import { weeklyReport, opReadiness, loadVsPain, MIN_POINTS } from '../logic/insights.js';
import { currentPhase } from '../logic/progression.js';
import { doneSessions } from '../logic/stats.js';
import { barChart, progressRing } from '../components/charts.js';
import { ICON, ensureViewStyles, applyFontScale, pageHeader, shortDate, trafficPill } from './ui.js';
import { ensureV2Styles, ICON2, fmtNum, fmtDistance, meter } from './v2-shared.js';

export const title = 'Auswertung';

export const PART_LABEL = {
  criteria: 'Ausstiegskriterien der Phasen',
  strength: 'Kraftstufen Knie & Stütz',
  swellingFree: 'Ohne Schwellung (14 Tage)',
  regularity: 'Regelmäßigkeit (4 Wochen)',
};

/**
 * Tip for the weekly report: open strength/rowing goal (current week) → report note → readiness tip → generic.
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

const FOCUS = { bereitschaft: 'bereitschaft', bericht: 'bericht', last: 'last' };

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, query }) {
  ensureViewStyles();
  ensureV2Styles();
  const today = todayISO();
  const ui = { weekOf: today };

  const kpi = (v, l, met = false) => html`<div class="v2-kpi ${met ? 'is-met' : ''}"><span class="v2-kpi__v">${v}</span><span class="v2-kpi__l">${l}</span></div>`;

  const draw = () => {
    const data = store.get();
    applyFontScale(data.settings);
    const phase = currentPhase(data.state, content.phases);
    const prehab = (phase?.kind ?? 'prehab') === 'prehab';
    const ready = prehab ? opReadiness(data, content, today) : null;
    const rep = weeklyReport(data, content, today, { weekOf: ui.weekOf });
    const isCurrent = rep.weekStart === startOfIsoWeek(today);
    const tip = reportTip(rep, ready, isCurrent);
    const lvp = loadVsPain(data.sessions, { today });
    const cv = corrView(lvp);
    const painDelta = rep.avgNextDayPain != null && rep.prevAvgNextDayPain != null ? rep.avgNextDayPain - rep.prevAvgNextDayPain : null;
    const loadDelta = rep.prevLoad ? Math.round(((rep.load - rep.prevLoad) / rep.prevLoad) * 100) : null;
    const empty = !doneSessions(data.sessions).length;

    paint(root, html`
      ${pageHeader({ title: 'Auswertung', eyebrow: 'Training · Knie · Wochenbericht', back: '#/verlauf', backLabel: 'Zurück zum Verlauf' })}

      ${empty ? html`<div class="banner banner--gold"><span class="banner__icon" aria-hidden="true">📊</span>
        <span class="banner__body"><span class="banner__title">Noch keine Einheiten</span>
        <span class="banner__text">Nach den ersten Trainings füllt sich die Auswertung von selbst.</span></span></div>` : ''}

      ${ready ? html`<section class="card" id="bereitschaft">
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

      <section class="card" id="bericht">
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
          ${kpi(html`<span class="num">${fmtNum(rep.load)}</span>${loadDelta == null ? '' : html`<small>${loadDelta > 0 ? '+' : ''}${loadDelta} %</small>`}`, 'Trainingslast')}
          ${kpi(html`${rep.avgNextDayPain == null ? '–' : html`<span class="num">${fmtNum(rep.avgNextDayPain, 1)}</span>${painDelta == null ? '' : html`<small>${painDelta < -0.2 ? '↓ besser' : painDelta > 0.2 ? '↑ höher' : '→ stabil'}</small>`}`}`, 'Knie Folgetag Ø')}
        </div>
        ${['green', 'yellow', 'red', 'stop'].some((l) => rep.lights[l]) ? html`<div class="chip-row mt-4">
          ${['green', 'yellow', 'red', 'stop'].filter((l) => rep.lights[l]).map((l) => html`<span class="row" style="gap:4px">${trafficPill(l)}<span class="num text-sm">× ${rep.lights[l]}</span></span>`)}
        </div>` : ''}
        ${rep.highlights.length ? html`<ul class="v2-list-check">${rep.highlights.map((h) => html`<li>${h}</li>`)}</ul>` : ''}
        ${rep.notes.length ? html`<ul class="v2-list-check is-note">${rep.notes.map((h) => html`<li>${h}</li>`)}</ul>` : ''}
        <div class="banner banner--gold mt-4 mb-0"><span class="banner__icon" aria-hidden="true">${raw(ICON2.sparkles)}</span>
          <span class="banner__body"><span class="banner__title">Tipp</span><span class="banner__text">${tip}</span></span></div>
      </section>

      <section class="card" id="last">
        <div class="card__header"><div><h2 class="card__title">Trainingslast ↔ Knie am Folgetag</h2><p class="card__sub">Nur Tendenzen aus deinen Daten (8 Wochen) – kein Beweis für Ursache und Wirkung.</p></div></div>
        <div class="v2-corr">
          <div class="v2-corr__head"><strong><span aria-hidden="true">🏋️</span> Zusammenhang</strong>
            ${cv.enough ? html`<span class="chip chip--sm ${Math.abs(cv.r) >= 0.4 ? 'chip--gold' : 'chip--outline'} num">r = ${fmtNum(cv.r, 2)}</span>` : html`<span class="chip chip--sm chip--outline num">${cv.n}/${cv.need}</span>`}</div>
          ${cv.enough ? html`<p>${cv.text}</p>` : html`<p>${cv.text} – mach weiter den Folgetag-Check, dann wird es spannend.</p>${meter(cv.n / cv.need, 'v2-meter--primary')}`}
        </div>
        ${lvp.weekly.length ? html`<h3 class="text-sm mt-4 mb-2">Trainingslast pro Woche <small class="muted">(RPE × Minuten)</small></h3><div data-c-load></div>` : ''}
      </section>
    `);
    const box = root.querySelector('[data-c-load]');
    if (box) {
      barChart(box, lvp.weekly.map((w) => ({ label: `KW${isoWeekKey(w.weekStart).slice(-2)}`, value: w.load })), {
        label: 'Trainingslast pro Woche', format: (v) => fmtNum(v), highlightLast: true,
      });
    }
  };

  const onClick = (e) => {
    const wb = e.target.closest('[data-week]');
    if (!wb) return;
    const next = addDays(startOfIsoWeek(ui.weekOf), 7 * Number(wb.dataset.week));
    if (next <= today) { ui.weekOf = next; draw(); }
  };

  draw();
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(draw);
  const focus = FOCUS[query?.focus];
  if (focus) setTimeout(() => root.querySelector(`#${focus}`)?.scrollIntoView({ block: 'start' }), 60);
  return () => {
    unsub();
    root.removeEventListener('click', onClick);
  };
}
