// SVG charts. See docs/SPEC.md §7.5. WP0: minimal placeholders returning valid SVG; WP-Views completes.
const NS = 'http://www.w3.org/2000/svg';

function svgEl(w, h, label) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.style.width = '100%';
  svg.style.height = 'auto';
  return svg;
}

function mount(container, svg) {
  if (container) { container.innerHTML = ''; container.appendChild(svg); }
  return svg;
}

/**
 * @param {Element|null} container
 * @param {{series: {name: string, color?: string, points: {x: string, y: number}[]}[], yMax?: number}} data
 * @param {object} [opts]
 * @returns {SVGSVGElement}
 */
export function lineChart(container, data, opts = {}) {
  const W = 320, H = 160;
  const svg = svgEl(W, H, opts.label || 'Liniendiagramm');
  const yMax = data?.yMax ?? 10;
  for (const s of data?.series || []) {
    const n = s.points.length;
    if (!n) continue;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${(n === 1 ? W / 2 : (i / (n - 1)) * (W - 20) + 10).toFixed(1)},${(H - 10 - (p.y / yMax) * (H - 20)).toFixed(1)}`).join(' ');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', s.color || 'var(--primary)');
    path.setAttribute('stroke-width', '2.5');
    svg.appendChild(path);
  }
  return mount(container, svg);
}

/**
 * @param {Element|null} container
 * @param {{label: string, value: number, color?: string, goal?: number}[]} data
 * @param {object} [opts]
 * @returns {SVGSVGElement}
 */
export function barChart(container, data, opts = {}) {
  const W = 320, H = 160;
  const svg = svgEl(W, H, opts.label || 'Balkendiagramm');
  const items = data || [];
  const max = Math.max(1, ...items.map((d) => Math.max(d.value, d.goal ?? 0)));
  const bw = items.length ? (W - 20) / items.length : 0;
  items.forEach((d, i) => {
    const h = (d.value / max) * (H - 30);
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(10 + i * bw + bw * 0.15));
    r.setAttribute('y', String(H - 20 - h));
    r.setAttribute('width', String(bw * 0.7));
    r.setAttribute('height', String(h));
    r.setAttribute('rx', '4');
    r.setAttribute('fill', d.color || 'var(--primary)');
    svg.appendChild(r);
  });
  return mount(container, svg);
}

/**
 * @param {Element|null} container
 * @param {{date: string, value: number, traffic?: string}[]} data
 * @param {{weeks?: number}} [opts]
 * @returns {SVGSVGElement}
 */
export function calendarHeatmap(container, data, opts = {}) {
  const weeks = opts.weeks ?? 16;
  const cell = 16, gap = 3;
  const svg = svgEl(weeks * (cell + gap), 7 * (cell + gap), opts.label || 'Trainingskalender');
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(w * (cell + gap)));
    r.setAttribute('y', String(d * (cell + gap)));
    r.setAttribute('width', String(cell));
    r.setAttribute('height', String(cell));
    r.setAttribute('rx', '3');
    r.setAttribute('fill', 'var(--surface-2)');
    svg.appendChild(r);
  }
  return mount(container, svg);
}
