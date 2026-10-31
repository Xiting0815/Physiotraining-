// Heute – see docs/SPEC.md §3.1, §8. WP0 placeholder; WP-Views completes.
import { html, render as paint } from '../render.js';
import { todayISO, formatDE } from '../util/date.js';
import { nextWorkout } from '../logic/progression.js';
import { weeklyProgress } from '../logic/stats.js';
import { levelFor, dailyQuote, opCountdown } from '../logic/motivation.js';
import { taperActive } from '../logic/traffic-light.js';

export const title = 'Heute';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content }) {
  const draw = () => {
    const data = store.get();
    const today = todayISO();
    const w = nextWorkout(data.state, content.phases, content.workouts);
    const wk = weeklyProgress(data.sessions, data.settings.weeklyGoal, today);
    const lvl = levelFor(data.state.xp);
    const op = opCountdown(data.settings, today);
    paint(root, html`
      <h1>Heute</h1>
      <p class="muted">${formatDE(today)}</p>
      ${taperActive(data.settings.surgeryDate, today) ? html`<div class="card card--accent">OP-Woche: weniger Umfang, gleiche Qualität.</div>` : ''}
      <section class="card card--hero">
        <h2>${w ? w.name : 'Kein Training gefunden'}</h2>
        <p>${w ? `ca. ${w.durationMin} Min` : ''}</p>
        <a class="btn btn--accent btn--block btn--session" href="#/session">${data.state.activeSession ? 'Training fortsetzen' : 'Training starten'}</a>
      </section>
      <section class="card">
        ${op.daysLeft == null
          ? html`<a href="#/mehr">OP-Termin eintragen</a>`
          : html`<strong>Fit für die OP – noch <span class="num">${op.daysLeft}</span> Tage</strong>`}
      </section>
      <section class="card">Wochenziel: <span class="num">${wk.done}/${wk.goal}</span> · ${lvl.title} (<span class="num">${data.state.xp}</span> XP)</section>
      <p class="muted"><em>${dailyQuote(today)}</em></p>
    `);
  };
  draw();
  return store.subscribe(draw);
}
