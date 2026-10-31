// Übung (detail) – see docs/SPEC.md §3.5. WP0 placeholder; WP-Views completes.
import { html, render as paint } from '../render.js';
import { levelOf } from '../logic/progression.js';

export const title = 'Übung';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { content, store, params }) {
  const ex = content.exercises.find((e) => e.id === params.id);
  if (!ex) {
    paint(root, html`<h1>Übung nicht gefunden</h1><a class="btn" href="#/uebungen">Zur Übersicht</a>`);
    return;
  }
  document.title = `${ex.name} · Physio`;
  const cur = levelOf(store.getState(), ex.id, ex);
  paint(root, html`
    <a href="#/uebungen">← Übungen</a>
    <h1>${ex.name}</h1>
    <div class="card"><pt-figure exercise-id="${ex.id}"></pt-figure></div>
    <section class="card">
      <h3>Ablauf</h3>
      <ol>${ex.instructions.map((s) => html`<li>${s}</li>`)}</ol>
      ${ex.kneeNote ? html`<p><strong>Knie:</strong> ${ex.kneeNote}</p>` : ''}
    </section>
    <section class="card">
      <h3>Stufen</h3>
      <ul class="list">${ex.levels.map((l, i) => html`<li>${i === cur ? '▶ ' : ''}${l.label}: <span class="num">${l.sets}×${l.reps ?? ''}${l.hold ? ` × ${l.hold}s` : ''}${l.seconds ? `${l.seconds}s` : ''}</span></li>`)}</ul>
    </section>
  `);
}
