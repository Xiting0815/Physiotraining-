// Ausrüstung – optional data/equipment.json (see docs/SPEC.md §6.6). WP0 placeholder; WP-Views completes.
import { html, render as paint } from '../render.js';

export const title = 'Ausrüstung';

function items(eq) {
  if (Array.isArray(eq)) return eq;
  if (eq && Array.isArray(eq.items)) return eq.items;
  if (eq && Array.isArray(eq.equipment)) return eq.equipment;
  return [];
}

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { content, store }) {
  const list = items(content.equipment);
  const bands = store.getSettings().bands;
  paint(root, html`
    <a href="#/mehr">← Mehr</a>
    <h1>Ausrüstung</h1>
    ${list.length
      ? html`<ul class="list">${list.map((e) => html`<li><strong>${e.name ?? e.label ?? e.id}</strong>${e.priceEur ? html` <span class="chip num">${e.priceEur} €</span>` : ''}${(e.description ?? e.why) ? html`<br><span class="muted">${e.description ?? e.why}</span>` : ''}</li>`)}</ul>`
      : html`<ul class="list">${bands.map((b) => html`<li><span class="chip" style="background:${b.color};color:#fff">${b.label}</span></li>`)}</ul>`}
  `);
}
