// Folgetag-Check – see docs/SPEC.md §4.2 step 6. WP0 placeholder; WP-Session-flow implements.
import { html, render as paint } from '../render.js';

export const title = 'Folgetag-Check';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store }) {
  const pending = [...store.getSessions()].reverse().find((s) => s.status === 'done' && !s.nextDay);
  paint(root, html`
    <h1>Wie geht's dem Knie heute?</h1>
    ${pending ? html`<pt-pain-scale label="Schmerz heute"></pt-pain-scale>` : html`<p class="placeholder">Kein offener Folgetag-Check.</p>`}
    <a class="btn" href="#/heute">Zurück</a>
  `);
}
