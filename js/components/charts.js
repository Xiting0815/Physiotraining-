// SVG charts + small motivational SVG helpers. See docs/SPEC.md §7.5.
// Every chart has a pure string builder (`…Svg(data, opts) → string`, Node-safe) and the SPEC
// DOM wrapper (`lineChart(container, data, opts) → SVGSVGElement`). Colors come from CSS tokens
// (classes styled in css/components.css, or var(--…) fills), so charts follow light/dark themes.
import { addDays, daysBetween, startOfIsoWeek, todayISO } from '../util/date.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Parse an SVG string into an element (browser only) and optionally mount it. */
function toElement(svgString, container) {
  const tpl = document.createElement('template');
  tpl.innerHTML = svgString.trim();
  const svg = /** @type {SVGSVGElement} */ (tpl.content.firstElementChild);
  if (container) { container.innerHTML = ''; container.appendChild(svg); }
  return svg;
}

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

const TRAFFIC_TEXT = { green: 'Grün', yellow: 'Gelb', red: 'Rot', stop: 'Stopp' };
const TRAFFIC_VAR = { green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)', stop: 'var(--stop)' };

/* ------------------------------------------------------------------ */
/* Line chart                                                          */
/* ------------------------------------------------------------------ */

/**
 * Rolling mean over the last `days` calendar days (inclusive) for each point date.
 * @param {{x: string, y: number}[]} points  @param {number} [days]
 * @returns {{x: string, y: number}[]}
 */
export function rollingMean(points, days = 7) {
  const pts = [...points].filter((p) => p && p.y != null).sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));
  const dates = [...new Set(pts.map((p) => p.x))];
  return dates.map((d) => {
    const win = pts.filter((p) => { const k = daysBetween(p.x, d); return k >= 0 && k < days; });
    return { x: d, y: win.reduce((s, p) => s + p.y, 0) / win.length };
  });
}

/**
 * Fitted y range for values that should not start at 0 (weight, resting pulse, sleep …).
 * Rounds outwards to `step`, adds `pad` and guarantees at least `minSpan`.
 * @param {number[]} values @param {{pad?: number, step?: number, minSpan?: number}} [o]
 * @returns {{yMin: number, yMax: number}}
 */
export function autoYRange(values, { pad = 1, step = 1, minSpan = 4 } = {}) {
  const vs = (values || []).filter((v) => Number.isFinite(v));
  if (!vs.length) return { yMin: 0, yMax: 10 };
  let lo = Math.floor((Math.min(...vs) - pad) / step) * step;
  let hi = Math.ceil((Math.max(...vs) + pad) / step) * step;
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = Math.floor((mid - minSpan / 2) / step) * step;
    hi = lo + Math.ceil(minSpan / step) * step;
  }
  return { yMin: lo, yMax: hi };
}

/**
 * @param {{series: {name: string, color?: string, points: {x: string, y: number}[], mean?: boolean, dashed?: boolean}[], yMax?: number, yMin?: number|'auto'}} data
 * @param {{label?: string, bands?: boolean, greenMax?: number, yellowMax?: number, mean?: boolean|'combined', meanDays?: number, width?: number, height?: number, from?: string, to?: string, animate?: boolean,
 *   yMin?: number|'auto', yRange?: {pad?: number, step?: number, minSpan?: number}, tickFormat?: (v: number) => string, valueFormat?: (v: number) => string}} [opts]
 *   `yMin` (default 0): lower bound of the y axis; `'auto'` fits min and max to the data (see `autoYRange`,
 *   options in `yRange`). Pain zones are only drawn for the 0–10 scale. `series[].dashed` draws a dashed
 *   goal line without dots. `tickFormat` / `valueFormat` format y labels / tooltips.
 * @returns {string}
 */
export function lineChartSvg(data, opts = {}) {
  const W = opts.width ?? 340, H = opts.height ?? 180;
  const P = { l: 26, r: 10, t: 10, b: 24 };
  const series = (data?.series || []).filter(Boolean);
  const all = series.flatMap((s) => s.points || []).filter((p) => p && p.y != null);
  let yMin = data?.yMin ?? opts.yMin ?? 0;
  let yMax = data?.yMax ?? 10;
  if (yMin === 'auto') ({ yMin, yMax } = autoYRange(all.map((p) => p.y), opts.yRange));
  if (!(yMax > yMin)) yMax = yMin + 1;
  const painScale = yMin === 0 && yMax === 10;
  const gMax = opts.greenMax ?? 2, yelMax = opts.yellowMax ?? 5;
  const label = opts.label || 'Liniendiagramm';
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const Y = (v) => P.t + ih - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * ih;
  const tickFmt = opts.tickFormat || f1;
  const valFmt = opts.valueFormat || ((v) => String(v));
  let out = `<svg class="chart chart--line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`;
  out += `<title>${esc(label)}</title>`;

  // pain zones
  if (opts.bands !== false && painScale) {
    out += `<rect class="band-green" x="${P.l}" y="${f1(Y(gMax + 0.5))}" width="${iw}" height="${f1(Y(0) - Y(gMax + 0.5))}"/>`;
    out += `<rect class="band-yellow" x="${P.l}" y="${f1(Y(yelMax + 0.5))}" width="${iw}" height="${f1(Y(gMax + 0.5) - Y(yelMax + 0.5))}"/>`;
    out += `<rect class="band-red" x="${P.l}" y="${f1(Y(yMax))}" width="${iw}" height="${f1(Y(yelMax + 0.5) - Y(yMax))}"/>`;
  }
  // grid + y labels
  out += '<g class="grid">';
  const yTicks = painScale ? [0, 2, 5, 10] : [yMin, (yMin + yMax) / 2, yMax];
  for (const t of yTicks) out += `<line x1="${P.l}" x2="${W - P.r}" y1="${f1(Y(t))}" y2="${f1(Y(t))}"/><text x="${P.l - 6}" y="${f1(Y(t) + 3.5)}" text-anchor="end">${esc(tickFmt(t))}</text>`;
  out += '</g>';

  if (!all.length) {
    out += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Noch keine Daten</text></svg>`;
    return out;
  }
  const xs = all.map((p) => p.x).sort();
  const from = opts.from ?? xs[0];
  const to = opts.to ?? xs[xs.length - 1];
  const span = Math.max(1, daysBetween(from, to));
  const X = (iso) => P.l + (daysBetween(from, iso) / span) * iw;
  // x labels: ~4 evenly spaced dates
  const n = Math.min(4, span + 1);
  for (let i = 0; i < n; i++) {
    const d = addDays(from, Math.round((i / Math.max(1, n - 1)) * span));
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    out += `<text x="${f1(X(d))}" y="${H - 6}" text-anchor="${anchor}">${dm(d)}</text>`;
  }
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(X(p.x))},${f1(Y(p.y))}`).join('');
  const anim = opts.animate !== false ? ' line-anim' : '';
  const meanMode = opts.mean ?? (series.length === 1 ? true : 'combined');
  const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

  series.forEach((s, i) => {
    const pts = (s.points || []).filter((p) => p && p.y != null).sort((a, b) => (a.x < b.x ? -1 : 1));
    if (!pts.length) return;
    const color = s.color || palette[i % palette.length];
    const showMean = s.mean ?? meanMode === true;
    out += `<g class="series" data-name="${esc(s.name)}">`;
    if (s.dashed) {
      out += `<path class="goal-line" d="${path(pts)}"><title>${esc(s.name)}: ${esc(valFmt(pts[0].y))}</title></path></g>`;
      return;
    }
    const rawCls = showMean ? ' line-raw' : meanMode === 'combined' ? ' line-thin' + anim : anim;
    out += `<path class="line${rawCls}" d="${path(pts)}" stroke="${color}" pathLength="1000"/>`;
    if (showMean) out += `<path class="line-mean${anim}" d="${path(rollingMean(pts, opts.meanDays ?? 7))}" stroke="${color}" pathLength="1000"/>`;
    for (const p of pts) out += `<circle class="dot" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="${showMean ? 2.5 : 3.5}" fill="${color}"><title>${esc(s.name)} ${dm(p.x)}: ${esc(valFmt(p.y))}</title></circle>`;
    out += '</g>';
  });
  if (meanMode === 'combined') {
    out += `<path class="line-mean${anim}" d="${path(rollingMean(series.filter((s) => !s.dashed).flatMap((s) => s.points || []).filter((p) => p && p.y != null), opts.meanDays ?? 7))}" stroke="var(--text)" stroke-opacity="0.75" pathLength="1000"><title>Ø ${opts.meanDays ?? 7} Tage</title></path>`;
  }
  return out + '</svg>';
}

/**
 * Pain trend line chart with 7-day mean and green/yellow/red zones.
 * @param {Element|null} container
 * @param {{series: {name: string, color?: string, points: {x: string, y: number}[]}[], yMax?: number}} data
 * @param {object} [opts] see lineChartSvg
 * @returns {SVGSVGElement}
 */
export function lineChart(container, data, opts = {}) {
  return toElement(lineChartSvg(data, { animate: !reduced(), ...opts }), container);
}

/* ------------------------------------------------------------------ */
/* Bar chart                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {{label: string, value: number, color?: string, goal?: number}[]} data
 * @param {{label?: string, unit?: string, format?: (v: number) => string, width?: number, height?: number, highlightLast?: boolean, animate?: boolean}} [opts]
 * @returns {string}
 */
export function barChartSvg(data, opts = {}) {
  const W = opts.width ?? 340, H = opts.height ?? 170;
  const P = { l: 6, r: 6, t: 18, b: 22 };
  const items = (data || []).filter(Boolean);
  const label = opts.label || 'Balkendiagramm';
  const fmt = opts.format || ((v) => f1(v) + (opts.unit ? opts.unit : ''));
  const max = Math.max(1, ...items.map((d) => Math.max(d.value || 0, d.goal ?? 0)));
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const bw = items.length ? iw / items.length : 0;
  const barW = Math.min(36, bw * 0.62);
  const Y = (v) => P.t + ih - (v / max) * ih;
  let out = `<svg class="chart chart--bar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>`;
  out += `<g class="grid"><line x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/></g>`;
  const highlightLast = opts.highlightLast ?? true;
  items.forEach((d, i) => {
    const cx = P.l + bw * i + bw / 2;
    const v = Math.max(0, d.value || 0);
    const h = Math.max(v > 0 ? 4 : 0, Y(0) - Y(v));
    const met = d.goal != null && v >= d.goal && v > 0;
    const color = d.color || (met ? 'var(--gold)' : 'var(--chart-1)');
    const last = highlightLast && i === items.length - 1;
    const op = highlightLast && !last ? 0.78 : 1;
    const r = Math.min(8, barW / 2);
    // rounded top bar as path
    const x0 = cx - barW / 2, y0 = Y(0) - h;
    const pathD = h > 0
      ? `M${f1(x0)},${f1(Y(0))}V${f1(y0 + Math.min(r, h))}Q${f1(x0)},${f1(y0)} ${f1(x0 + r)},${f1(y0)}H${f1(x0 + barW - r)}Q${f1(x0 + barW)},${f1(y0)} ${f1(x0 + barW)},${f1(y0 + Math.min(r, h))}V${f1(Y(0))}Z`
      : '';
    out += `<rect x="${f1(x0)}" y="${P.t}" width="${f1(barW)}" height="${f1(ih)}" rx="${f1(r)}" fill="var(--surface-2)" opacity="0.6"/>`;
    if (pathD) out += `<path class="bar${opts.animate !== false ? ' bar-anim' : ''}" style="--i:${i}" d="${pathD}" fill="${color}" opacity="${op}"><title>${esc(d.label)}: ${esc(fmt(v))}</title></path>`;
    if (d.goal != null) out += `<line class="goal-line" x1="${f1(x0 - 3)}" x2="${f1(x0 + barW + 3)}" y1="${f1(Y(d.goal))}" y2="${f1(Y(d.goal))}"/>`;
    out += `<text class="label-value" x="${f1(cx)}" y="${f1(Math.min(y0, d.goal != null ? Y(d.goal) : y0) - 5)}" text-anchor="middle">${v > 0 ? esc(fmt(v)) : ''}${met ? ' ★' : ''}</text>`;
    out += `<text x="${f1(cx)}" y="${H - 6}" text-anchor="middle"${last ? ' style="font-weight:700;fill:var(--text)"' : ''}>${esc(d.label)}</text>`;
  });
  return out + '</svg>';
}

/**
 * Weekly sessions / hold time bars. Bars meeting their goal turn gold with ★.
 * @param {Element|null} container
 * @param {{label: string, value: number, color?: string, goal?: number}[]} data
 * @param {object} [opts] see barChartSvg
 * @returns {SVGSVGElement}
 */
export function barChart(container, data, opts = {}) {
  return toElement(barChartSvg(data, { animate: !reduced(), ...opts }), container);
}

/* ------------------------------------------------------------------ */
/* Calendar heatmap                                                    */
/* ------------------------------------------------------------------ */

/** Shape per traffic light (not color alone): circle / triangle / square / square with bar. */
function trafficMark(t, cx, cy, r) {
  const fill = TRAFFIC_VAR[t];
  if (t === 'green') return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${fill}"/>`;
  if (t === 'yellow') return `<path d="M${f1(cx)},${f1(cy - r * 1.05)}L${f1(cx + r * 1.1)},${f1(cy + r * 0.85)}H${f1(cx - r * 1.1)}Z" fill="${fill}" stroke="${fill}" stroke-width="1.5" stroke-linejoin="round"/>`;
  if (t === 'red') return `<rect x="${f1(cx - r * 0.88)}" y="${f1(cy - r * 0.88)}" width="${f1(r * 1.76)}" height="${f1(r * 1.76)}" rx="${f1(r * 0.3)}" fill="${fill}"/>`;
  return `<rect x="${f1(cx - r * 0.9)}" y="${f1(cy - r * 0.9)}" width="${f1(r * 1.8)}" height="${f1(r * 1.8)}" rx="1.5" fill="${fill}"/><path d="M${f1(cx - r * 0.45)},${f1(cy)}H${f1(cx + r * 0.45)}" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/>`;
}

/**
 * @param {{date: string, value: number, traffic?: string|null}[]} data
 * @param {{weeks?: number, month?: string, end?: string, today?: string, label?: string}} [opts]
 *   `month: "YYYY-MM"` renders a month grid (Mo–So columns) with dots; otherwise `weeks` columns ending at `end`.
 * @returns {string}
 */
export function calendarHeatmapSvg(data, opts = {}) {
  const today = opts.today ?? todayISO();
  const byDate = new Map();
  for (const d of data || []) {
    if (!d?.date) continue;
    const prev = byDate.get(d.date);
    const order = ['green', 'yellow', 'red', 'stop'];
    // keep the worst traffic and sum values per day
    const t = !prev ? d.traffic : order.indexOf(d.traffic) > order.indexOf(prev.traffic) ? d.traffic : prev.traffic;
    byDate.set(d.date, { value: (prev?.value || 0) + (d.value || 0), traffic: t || null });
  }
  const maxV = Math.max(1, ...[...byDate.values()].map((v) => v.value));
  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const cellFor = (iso, cx, cy, r, showNum) => {
    const e = byDate.get(iso);
    const future = iso > today;
    let s = `<g class="cell" data-date="${iso}">`;
    let title = `${dm(iso)}`;
    if (e && e.traffic && TRAFFIC_VAR[e.traffic]) {
      s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${TRAFFIC_VAR[e.traffic]}" fill-opacity="0.16"/>`;
      s += trafficMark(e.traffic, cx, cy, r * 0.58);
      title += ` – ${TRAFFIC_TEXT[e.traffic]}`;
    } else if (e && e.value > 0) {
      s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="var(--primary)" fill-opacity="${f1(0.3 + 0.7 * (e.value / maxV))}"/>`;
      title += ` – ${e.value}`;
    } else {
      s += `<circle class="cell-empty" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(future ? r * 0.35 : r * 0.42)}"${future ? ' opacity="0.6"' : ''}/>`;
    }
    if (showNum) s += `<text x="${f1(cx)}" y="${f1(cy + r + 13)}" text-anchor="middle" font-size="8">${Number(iso.slice(8))}</text>`;
    if (iso === today) s += `<circle class="cell-today" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r + 2.5)}"/>`;
    return s + `<title>${esc(title)}</title></g>`;
  };

  if (opts.month) {
    const first = `${opts.month}-01`;
    const [yy, mm] = opts.month.split('-').map(Number);
    const daysIn = new Date(yy, mm, 0).getDate();
    const lead = daysBetween(startOfIsoWeek(first), first);
    const rows = Math.ceil((lead + daysIn) / 7);
    const c = 44, top = 20, r = 12;
    const W = 7 * c, H = top + rows * c + 4;
    const label = opts.label || `Trainingskalender ${opts.month}`;
    let out = `<svg class="chart chart--calendar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>`;
    DOW.forEach((d, i) => { out += `<text class="dow" x="${i * c + c / 2}" y="11" text-anchor="middle">${d}</text>`; });
    for (let day = 1; day <= daysIn; day++) {
      const iso = `${opts.month}-${String(day).padStart(2, '0')}`;
      const k = lead + day - 1;
      const cx = (k % 7) * c + c / 2, cy = top + Math.floor(k / 7) * c + c / 2 - 6;
      out += cellFor(iso, cx, cy, r, true);
    }
    return out + '</svg>';
  }

  const weeks = opts.weeks ?? 16;
  const end = opts.end ?? today;
  const start = addDays(startOfIsoWeek(end), -7 * (weeks - 1));
  const c = 20, left = 22, top = 14, r = 7.5;
  const W = left + weeks * c, H = top + 7 * c;
  const label = opts.label || 'Trainingskalender';
  let out = `<svg class="chart chart--calendar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>`;
  [0, 2, 4, 6].forEach((i) => { out += `<text class="dow" x="${left - 4}" y="${top + i * c + c / 2 + 3}" text-anchor="end">${DOW[i]}</text>`; });
  let lastMonth = '';
  for (let w = 0; w < weeks; w++) {
    const wkStart = addDays(start, w * 7);
    const mon = wkStart.slice(5, 7);
    if (mon !== lastMonth) {
      const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      if (w < weeks - 1) out += `<text class="dow" x="${left + w * c + 2}" y="9">${names[Number(mon) - 1]}</text>`;
      lastMonth = mon;
    }
    for (let d = 0; d < 7; d++) {
      const iso = addDays(wkStart, d);
      if (iso > end && iso > today) continue;
      out += cellFor(iso, left + w * c + c / 2, top + d * c + c / 2, r, false);
    }
  }
  return out + '</svg>';
}

/**
 * Calendar with traffic-light marks (circle/triangle/square = grün/gelb/rot/stopp).
 * @param {Element|null} container
 * @param {{date: string, value: number, traffic?: string}[]} data
 * @param {{weeks?: number, month?: string, end?: string, today?: string, label?: string}} [opts]
 * @returns {SVGSVGElement}
 */
export function calendarHeatmap(container, data, opts = {}) {
  return toElement(calendarHeatmapSvg(data, opts), container);
}

/* ------------------------------------------------------------------ */
/* Motivation helpers (markup strings; wrap with raw() in html``)       */
/* ------------------------------------------------------------------ */

/**
 * Progress ring markup (styled by .ring in components.css).
 * @param {{value: number, max?: number, label?: string|number, unit?: string, size?: 'xs'|'sm'|'md'|'lg', variant?: 'primary'|'accent'|'gold'|'on-hero', ariaLabel?: string}} o
 * @returns {string}
 */
export function progressRing(o) {
  const max = Number(o.max ?? 1);
  const raw = Number.isFinite(max) && max ? Number(o.value) / max : 0;
  const p = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  const lbl = o.label == null || (typeof o.label === 'number' && !Number.isFinite(o.label)) ? Math.round(p * 100) : o.label;
  const cls = ['ring', o.size && o.size !== 'md' ? `ring--${o.size}` : '', o.variant && o.variant !== 'primary' ? `ring--${o.variant}` : ''].filter(Boolean).join(' ');
  const aria = o.ariaLabel ?? `${Math.round(p * 100)} %`;
  return `<div class="${cls}" style="--p:${p.toFixed(4)}" role="img" aria-label="${esc(aria)}">`
    + '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring__track" cx="60" cy="60" r="52"/><circle class="ring__bar" cx="60" cy="60" r="52" pathLength="100"/></svg>'
    + `<div class="ring__label" aria-hidden="true"><span class="ring__value">${esc(lbl)}</span>${o.unit ? `<span class="ring__unit">${esc(o.unit)}</span>` : ''}</div></div>`;
}

let flameId = 0;
/**
 * Streak flame block markup (.streak). weeks = 0 renders a calm grey flame (no shaming copy).
 * @param {{weeks: number, label?: string}} o
 * @returns {string}
 */
export function streakFlame(o) {
  const id = `fl${++flameId}`;
  const cold = !o.weeks;
  const label = o.label ?? (cold ? 'Neuer Anlauf – diese Woche zählt.' : (o.weeks === 1 ? 'Woche in Folge' : 'Wochen in Folge'));
  const svg = `<svg viewBox="0 0 48 56" aria-hidden="true"><defs>`
    + `<linearGradient id="${id}o" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#E0531F"/><stop offset="0.55" stop-color="#F28A24"/><stop offset="1" stop-color="#F7B23B"/></linearGradient>`
    + `<linearGradient id="${id}i" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFD15C"/><stop offset="1" stop-color="#FFF3C4"/></linearGradient></defs>`
    + `<path class="flame-outer" fill="url(#${id}o)" style="fill:url(#${id}o)" d="M24 2c2 9 12 14 14 26 2 12-6 26-14 26S8 46 9 34c1-8 6-11 7-18 4 4 5 8 5 11 3-6 4-15 3-25z"/>`
    + `<path class="flame-inner" fill="url(#${id}i)" style="fill:url(#${id}i)" d="M24 26c1 5 7 8 7 15 0 6-3 11-7 11s-7-4-7-10c0-4 3-6 4-10 1 2 2 4 2 6 1-3 2-7 1-12z"/></svg>`;
  return `<div class="streak${cold ? ' streak--cold' : ''}"><span class="streak__flame">${svg}</span><div>`
    + (cold ? '' : `<div class="streak__count">${o.weeks}</div>`)
    + `<div class="streak__label">${esc(label)}</div></div></div>`;
}

/**
 * XP bar markup (.xp). Pass the result of motivation.levelFor(xp) plus xp.
 * @param {{xp: number, level: {index: number, title: string, min: number, next: number|null, progress: number}, nextTitle?: string}} o
 * @returns {string}
 */
export function xpBar(o) {
  const xp = Number.isFinite(Number(o.xp)) ? Math.max(0, Number(o.xp)) : 0;
  const level = o.level || { index: 0, title: '', progress: 0, next: null };
  const prog = Number.isFinite(Number(level.progress)) ? Math.max(0, Math.min(1, Number(level.progress))) : 0;
  const pct = Math.round(prog * 100);
  const de = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const left = level.next != null && Number.isFinite(Number(level.next)) ? `noch <strong>${de(Math.max(0, level.next - xp))}</strong> XP` : 'Höchste Stufe erreicht';
  return `<div class="xp" style="--p:${prog.toFixed(4)}">`
    + `<div class="xp__head"><span class="xp__level">Lv ${level.index + 1}</span><span class="xp__title">${esc(level.title)}</span>${o.nextTitle ? `<span class="xp__next">→ ${esc(o.nextTitle)}</span>` : ''}</div>`
    + `<div class="xp__bar" role="progressbar" aria-label="Fortschritt zur nächsten Stufe" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="xp__fill"></div></div>`
    + `<div class="xp__meta"><span><strong>${de(xp)}</strong> XP</span><span>${left}</span></div></div>`;
}
