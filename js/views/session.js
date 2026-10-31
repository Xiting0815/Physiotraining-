// Training session flow – see docs/SPEC.md §4.2. WP0 placeholder; WP-Session-flow implements.
import { html, render as paint } from '../render.js';
import { nextWorkout } from '../logic/progression.js';

export const title = 'Training';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content }) {
  const data = store.get();
  const w = data.state.activeSession
    ? content.workouts.find((x) => x.id === data.state.activeSession.workoutId)
    : nextWorkout(data.state, content.phases, content.workouts);
  paint(root, html`
    <h1>${w ? w.name : 'Training'}</h1>
    <p class="placeholder">Der Trainingsablauf folgt (WP-Session-flow).</p>
    <pt-pain-scale label="Schmerz jetzt"></pt-pain-scale>
    <pt-timer mode="rest" seconds="30"></pt-timer>
    <a class="btn btn--block" href="#/heute">Abbrechen</a>
  `);
}
