// Celebration: confetti + target face summary. See docs/SPEC.md §7.5, §8.
// targetFaceSvg() is a pure string builder (Node-safe); targetFace() returns an SVGSVGElement.
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

/** Headline by hit ratio (SPEC §8). @param {number} points @param {number} max */
export function targetHeadline(points, max) {
  const r = max ? points / max : 0;
  if (r >= 0.9) return 'Volltreffer!';
  if (r >= 0.7) return 'Starke Gruppe!';
  return 'Jeder Pfeil bringt dich weiter.';
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

/* ------------------------------------------------------------------ */
/* Confetti                                                            */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = ['#D4A72C', '#E9C55A', '#0E7C86', '#3FC1C9', '#E07A1F', '#F2A04E'];

/**
 * Lightweight canvas confetti burst (~1.5 s). No-op under prefers-reduced-motion.
 * @param {{particles?: number, duration?: number, origin?: {x: number, y: number}, colors?: string[]}} [opts]
 *   origin in viewport fractions (default {x: 0.5, y: 0.35}).
 * @returns {Promise<void>}
 */
export function confetti(opts = {}) {
  if (reducedMotion() || typeof document === 'undefined') return Promise.resolve();
  const n = opts.particles ?? 140;
  const duration = opts.duration ?? 1600;
  const colors = opts.colors ?? CONFETTI_COLORS;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return Promise.resolve(); }
  ctx.scale(dpr, dpr);
  const ox = (opts.origin?.x ?? 0.5) * W, oy = (opts.origin?.y ?? 0.35) * H;
  const parts = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 4 + Math.random() * 9;
    return {
      x: ox, y: oy,
      vx: Math.cos(a) * v * 0.9, vy: Math.sin(a) * v - 6,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      tilt: Math.random() * Math.PI, vt: 0.08 + Math.random() * 0.12,
      color: colors[(Math.random() * colors.length) | 0],
      round: Math.random() < 0.3,
    };
  });
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (t) => {
      const el = t - t0;
      const fade = Math.max(0, Math.min(1, (duration - el) / 400));
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.tilt += p.vt;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.color;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (el < duration) requestAnimationFrame(frame);
      else { canvas.remove(); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

/* ------------------------------------------------------------------ */
/* Target face                                                         */
/* ------------------------------------------------------------------ */

/** Deterministic PRNG (mulberry32). */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ring index 1..10 → [fill, separator line]
const RING_FILL = {
  1: 'var(--ring-white)', 2: 'var(--ring-white)', 3: 'var(--ring-black)', 4: 'var(--ring-black)',
  5: 'var(--ring-blue)', 6: 'var(--ring-blue)', 7: 'var(--ring-red)', 8: 'var(--ring-red)',
  9: 'var(--ring-gold)', 10: 'var(--ring-gold)',
};

const C = 110;       // face center
const R = 96;        // outer radius (ring 1)
const RW = R / 10;   // ring width

/**
 * Deterministic hit position for result i with given score.
 * @param {number} score 0..10  @param {number} i  @param {number} [seed]
 * @returns {{x: number, y: number}}
 */
export function hitPosition(score, i, seed = 7) {
  const s = Math.max(0, Math.min(10, Math.round(score)));
  const rnd = prng(seed * 1000003 + i * 7919 + s * 104729);
  let r;
  if (s === 0) r = R + 4 + rnd() * 6; // miss: just outside the face
  else {
    const inner = (10 - s) * RW, outer = (11 - s) * RW;
    // keep away from ring lines; 10s cluster toward the X
    r = s === 10 ? rnd() * RW * 0.85 : inner + RW * (0.2 + rnd() * 0.6);
  }
  const a = i * 2.39996323 + rnd() * 1.2; // golden-angle spread + jitter
  return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r };
}

/**
 * @param {{score: number, label?: string}[]} results
 * @param {{seed?: number, showScore?: boolean, animate?: boolean, label?: string}} [opts]
 * @returns {string}
 */
export function targetFaceSvg(results, opts = {}) {
  const list = results || [];
  const points = list.reduce((s, r) => s + (Number(r.score) || 0), 0);
  const max = list.length * 10;
  const showScore = opts.showScore ?? true;
  const H = showScore ? 262 : 220;
  const label = opts.label || `Trefferbild: ${points} von ${max} Punkten`;
  let s = `<svg class="target-face" viewBox="0 0 220 ${H}" role="img" aria-label="${label.replace(/"/g, '&quot;')}" xmlns="http://www.w3.org/2000/svg">`;
  s += '<defs><radialGradient id="tf-sheen" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>';
  // backing (straw boss hint)
  s += `<circle cx="${C}" cy="${C}" r="${R + 6}" fill="var(--surface-2)" stroke="var(--border)"/>`;
  for (let ring = 1; ring <= 10; ring++) {
    const r = (11 - ring) * RW;
    const line = ring === 3 || ring === 4 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.28)';
    s += `<circle cx="${C}" cy="${C}" r="${r.toFixed(2)}" fill="${RING_FILL[ring]}" stroke="${line}" stroke-width="0.6"/>`;
  }
  s += `<circle cx="${C}" cy="${C}" r="${(RW / 2).toFixed(2)}" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/>`;
  s += `<path d="M${C - 2} ${C}h4M${C} ${C - 2}v4" stroke="rgba(0,0,0,0.45)" stroke-width="0.6"/>`;
  s += `<circle cx="${C}" cy="${C}" r="${R}" fill="url(#tf-sheen)"/>`;
  // arrows: shaft sticks out toward upper right; fletching in petrol/orange; nock gold
  const animate = opts.animate !== false;
  list.forEach((res, i) => {
    const { x, y } = hitPosition(res.score, i, opts.seed);
    const sc = Math.round(res.score);
    const fletch = sc >= 9 ? '#0E7C86' : '#E07A1F';
    const dx = 11, dy = -15;
    const ex = x + dx, ey = y + dy;
    const t = (res.label ? `${res.label}: ` : `Pfeil ${i + 1}: `) + `${sc} ${sc === 1 ? 'Punkt' : 'Punkte'}`;
    s += `<g class="tf-arrow${animate ? '' : ' no-anim'}" style="--i:${i}"><title>${t.replace(/</g, '&lt;')}</title>`;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="rgba(0,0,0,0.35)"/>`;
    s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#20252C" stroke-width="2" stroke-linecap="round"/>`;
    s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#7B8794" stroke-width="0.7" stroke-linecap="round"/>`;
    // two vanes near the nock
    const vx = x + dx * 0.62, vy = y + dy * 0.62;
    s += `<path d="M${vx.toFixed(1)} ${vy.toFixed(1)} L${(ex - 1).toFixed(1)} ${(ey + 1.5).toFixed(1)} L${(ex - 5.5).toFixed(1)} ${(ey - 1).toFixed(1)} Z" fill="${fletch}"/>`;
    s += `<path d="M${vx.toFixed(1)} ${vy.toFixed(1)} L${(ex - 1).toFixed(1)} ${(ey + 1.5).toFixed(1)} L${(ex + 3).toFixed(1)} ${(ey + 4.5).toFixed(1)} Z" fill="${fletch}" opacity="0.75"/>`;
    s += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="1.9" fill="#D4A72C" stroke="#20252C" stroke-width="0.6"/>`;
    s += '</g>';
  });
  if (showScore) {
    s += `<text class="tf-score" x="${C}" y="${H - 14}" text-anchor="middle" style="fill:var(--text);font-weight:800;font-size:26px;letter-spacing:-0.5px">${points}<tspan style="fill:var(--muted);font-weight:700;font-size:15px"> / ${max}</tspan></text>`;
  }
  return s + '</svg>';
}

/**
 * WA-style target face with one arrow per result (deterministic placement, animated drop-in).
 * @param {{score: number, label?: string}[]} results
 * @param {{seed?: number, showScore?: boolean, animate?: boolean, label?: string}} [opts]
 * @returns {SVGSVGElement}
 */
export function targetFace(results, opts = {}) {
  const str = targetFaceSvg(results, { animate: !reducedMotion(), ...opts });
  if (typeof document === 'undefined') throw new Error('targetFace needs a DOM; use targetFaceSvg in Node');
  const tpl = document.createElement('template');
  tpl.innerHTML = str;
  const svg = /** @type {SVGSVGElement} */ (tpl.content.firstElementChild);
  return svg.namespaceURI === NS ? svg : svg;
}
