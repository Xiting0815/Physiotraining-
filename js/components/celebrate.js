// Celebration: confetti + target face summary. See docs/SPEC.md §7.5, §8.
// WP0: scoreForSet implemented; confetti no-op; simple target face. WP-Session-flow completes.
const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {{done: boolean, skipped?: boolean, painDuring?: number|null, sharpPain?: boolean}} set
 * @param {{greenMax: number, yellowMax: number}} [thr]
 * @returns {number} 0..10
 */
export function scoreForSet({ done, skipped, painDuring, sharpPain }, thr = { greenMax: 2, yellowMax: 5 }) {
  if (!done || skipped) return 1;
  if (sharpPain) return 4;
  const p = painDuring ?? 0;
  if (p <= thr.greenMax) return 10;
  if (p <= thr.yellowMax) return 7;
  return 4;
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

/** @param {object} [opts] @returns {Promise<void>} */
export async function confetti(opts = {}) {
  if (reducedMotion()) return;
  // TODO(WP-Session-flow): canvas confetti ~1.5s in gold/petrol/orange.
}

const RINGS = [
  ['var(--ring-white)', 1], ['var(--ring-black)', 3], ['var(--ring-blue)', 5], ['var(--ring-red)', 7], ['var(--ring-gold)', 9],
];

/**
 * @param {{score: number, label?: string}[]} results
 * @param {object} [opts]
 * @returns {SVGSVGElement}
 */
export function targetFace(results, opts = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('role', 'img');
  const points = results.reduce((s, r) => s + r.score, 0);
  const max = results.length * 10;
  svg.setAttribute('aria-label', `Trefferbild: ${points} von ${max} Punkten`);
  RINGS.forEach(([fill], i) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '100'); c.setAttribute('cy', '100');
    c.setAttribute('r', String(95 - i * 19));
    c.setAttribute('fill', fill);
    c.setAttribute('stroke', 'var(--ring-line)');
    svg.appendChild(c);
  });
  results.forEach((r, i) => {
    const radius = (10 - Math.max(0, Math.min(10, r.score))) * 9.5 + 4;
    const a = i * 2.399963; // golden angle
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', (100 + Math.cos(a) * radius).toFixed(1));
    dot.setAttribute('cy', (100 + Math.sin(a) * radius).toFixed(1));
    dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', 'var(--primary)');
    dot.setAttribute('stroke', '#fff');
    svg.appendChild(dot);
  });
  return svg;
}
