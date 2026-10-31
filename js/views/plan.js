// Plan – see docs/SPEC.md §3.4. WP0 placeholder; WP-Views completes.
import { html, render as paint } from '../render.js';
import { phaseProgress } from '../logic/progression.js';

export const title = 'Plan';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content }) {
  const data = store.get();
  const phase = content.phases.find((p) => p.id === data.state.phaseId) ?? content.phases[0];
  const prog = phase ? phaseProgress(data.state, phase, data.sessions) : null;
  const exName = (id) => content.exercises.find((e) => e.id === id)?.name ?? id;
  paint(root, html`
    <h1>Plan</h1>
    ${phase ? html`
      <section class="card">
        <h2>${phase.name}</h2>
        <p>${phase.description}</p>
        <p class="muted">Ausstiegskriterien: <span class="num">${prog.criteriaDone}/${prog.criteriaTotal}</span></p>
        <ul>${phase.exitCriteria.map((c) => html`<li>${c}</li>`)}</ul>
      </section>
      ${['A', 'B', 'C'].map((k) => {
        const w = content.workouts.find((x) => x.id === phase.workouts[k]);
        if (!w) return html`<section class="card"><h3>Training ${k}</h3><p class="placeholder">Noch nicht angelegt.</p></section>`;
        return html`<section class="card"><h3>${w.name}</h3><ul>
          ${w.blocks.map((b) => html`<li><strong>${b.title}:</strong> ${b.items.map((i) => exName(i.exerciseId)).join(', ')}</li>`)}
        </ul></section>`;
      })}` : html`<p class="placeholder">Keine Phasen geladen.</p>`}
  `);
}
