// Übungen (library) – see docs/SPEC.md §3.5. WP0 placeholder; WP-Views completes.
import { html, render as paint } from '../render.js';

export const title = 'Übungen';

const BLOCK_LABEL = { warmup: 'Aufwärmen', knee: 'Knie', archery: 'Bogen & Rücken', cooldown: 'Cool-down' };

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { content, query }) {
  const list = query.block ? content.exercises.filter((e) => e.block === query.block) : content.exercises;
  paint(root, html`
    <h1>Übungen</h1>
    <ul class="list">
      ${list.map((e) => html`<li><a href="#/uebung/${encodeURIComponent(e.id)}">${e.name}</a> <span class="chip">${BLOCK_LABEL[e.block] ?? e.block}</span></li>`)}
    </ul>
  `);
}
