// Verlauf – see docs/SPEC.md §3.6. WP0 placeholder; WP-Views completes.
import { html, render as paint } from '../render.js';
import { calendarHeatmap } from '../components/charts.js';
import { formatDE, toISODate } from '../util/date.js';

export const title = 'Verlauf';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store }) {
  const sessions = store.getSessions();
  paint(root, html`
    <h1>Verlauf</h1>
    <section class="card"><div data-heatmap></div></section>
    ${sessions.length
      ? html`<ul class="list">${[...sessions].reverse().map((s) => html`<li>${formatDE(toISODate(new Date(s.startedAt)))} · ${s.workoutId}</li>`)}</ul>`
      : html`<p class="placeholder">Noch keine Einheiten – die erste wartet schon.</p>`}
  `);
  calendarHeatmap(root.querySelector('[data-heatmap]'), []);
}
