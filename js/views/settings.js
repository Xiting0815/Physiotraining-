// Mehr / Einstellungen – see docs/SPEC.md §3.7. WP0 placeholder; WP-Views completes.
import { html, render as paint } from '../render.js';

export const title = 'Mehr';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store }) {
  const s = store.getSettings();
  paint(root, html`
    <h1>Mehr</h1>
    <section class="card">
      <label>OP-Termin <input type="date" name="surgeryDate" value="${s.surgeryDate ?? ''}"></label>
    </section>
    <ul class="list card">
      <li><a href="#/ausruestung">Ausrüstung</a></li>
    </ul>
    <p class="muted">Diese App ersetzt keine ärztliche oder physiotherapeutische Beratung.</p>
  `);
  const input = root.querySelector('input[name="surgeryDate"]');
  const onChange = () => store.update((d) => { d.settings.surgeryDate = input.value || null; });
  input.addEventListener('change', onChange);
  return () => input.removeEventListener('change', onChange);
}
