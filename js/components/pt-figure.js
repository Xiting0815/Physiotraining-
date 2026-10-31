// <pt-figure exercise-id | poses='[...]' props='[...]' band='{...}' tempo="3-1-1" mirror static size>
// Parametric SVG stick figure. Pose model: docs/SPEC.md §6.4. Contract: §7.5.
// WP0: pure geometry + static first-pose rendering. WP-Figure+poses adds animation, props, band, reduced-motion pair.
import { getExercise, getContent } from '../content.js';

const Base = globalThis.HTMLElement ?? class {};
const RAD = Math.PI / 180;
const ANGLE_KEYS = ['trunk', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];
export const DEFAULT_SEGMENTS = { trunk: 50, thigh: 42, shin: 42, upperArm: 30, forearm: 28, head: 10, foot: 10 };

const down = (deg, len) => ({ x: Math.sin(deg * RAD) * len, y: Math.cos(deg * RAD) * len });
const add = (p, v) => ({ x: p.x + v.x, y: p.y + v.y });

/**
 * Compute named points of a pose (pure).
 * @param {import('../types.js').Pose} pose
 * @param {Record<string, number>} [segments]
 */
export function computePoints(pose, segments = DEFAULT_SEGMENTS) {
  const S = { ...DEFAULT_SEGMENTS, ...segments };
  const front = pose.view === 'front';
  const hip = { x: pose.root.x, y: pose.root.y };
  const trunkV = { x: Math.sin(pose.trunk * RAD) * S.trunk, y: -Math.cos(pose.trunk * RAD) * S.trunk };
  const neck = add(hip, trunkV);
  const head = add(neck, { x: (trunkV.x / S.trunk) * (S.head + 3), y: (trunkV.y / S.trunk) * (S.head + 3) });
  const pts = { hip, neck, head };

  for (const side of ['L', 'R']) {
    const sign = front ? (side === 'L' ? 1 : -1) : 1; // front: left limbs on viewer's right
    const hipJ = front ? add(hip, { x: sign * 8, y: 0 }) : hip;
    const thighA = sign * pose['hip' + side];
    const knee = add(hipJ, down(thighA, S.thigh));
    const shinA = thighA - sign * pose['knee' + side];
    const foot = add(knee, down(shinA, S.shin));
    const toe = add(foot, down(shinA + (front ? 0 : 90), front ? 2 : S.foot));
    const shJ = front ? add(neck, { x: sign * 14, y: 4 }) : neck;
    const upperA = sign * pose['shoulder' + side];
    const elbow = add(shJ, down(upperA, S.upperArm));
    const hand = add(elbow, down(upperA + sign * pose['elbow' + side], S.forearm));
    Object.assign(pts, {
      ['hipJ' + side]: hipJ, ['knee' + side]: knee, ['foot' + side]: foot, ['toe' + side]: toe,
      ['shoulder' + side]: shJ, ['elbow' + side]: elbow, ['hand' + side]: hand,
    });
  }
  return pts;
}

/**
 * Linear interpolation of all angles + root (pure).
 * @param {import('../types.js').Pose} a @param {import('../types.js').Pose} b @param {number} t 0..1
 * @returns {import('../types.js').Pose}
 */
export function interpolatePose(a, b, t) {
  const out = { ...a, root: { x: a.root.x + (b.root.x - a.root.x) * t, y: a.root.y + (b.root.y - a.root.y) * t } };
  for (const k of ANGLE_KEYS) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  return out;
}

const line = (p, q, cls) => `<line class="${cls}" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"/>`;

/** SVG markup (inner) for one pose. */
export function poseSvg(pose, segments, { highlightLeftKnee = false } = {}) {
  const p = computePoints(pose, segments);
  const S = { ...DEFAULT_SEGMENTS, ...segments };
  const limb = (side, cls) =>
    line(p['hipJ' + side], p['knee' + side], cls) + line(p['knee' + side], p['foot' + side], cls) +
    line(p['foot' + side], p['toe' + side], cls) +
    line(p['shoulder' + side], p['elbow' + side], cls) + line(p['elbow' + side], p['hand' + side], cls);
  return `
    <line class="fig-floor" x1="5" y1="185" x2="195" y2="185"/>
    <g class="fig-back">${limb('L', 'fig-limb fig-limb--left')}</g>
    ${line(p.hip, p.neck, 'fig-trunk')}
    <circle class="fig-head" cx="${p.head.x.toFixed(1)}" cy="${p.head.y.toFixed(1)}" r="${S.head}"/>
    <g class="fig-front">${limb('R', 'fig-limb')}</g>
    ${highlightLeftKnee ? `<circle class="fig-knee-hl" cx="${p.kneeL.x.toFixed(1)}" cy="${p.kneeL.y.toFixed(1)}" r="6"/>` : ''}`;
}

const STYLE = `<style>
  pt-figure{display:block}
  pt-figure svg{width:100%;height:auto}
  pt-figure .fig-floor{stroke:var(--border);stroke-width:2}
  pt-figure .fig-limb,pt-figure .fig-trunk{stroke:var(--text);stroke-width:6;stroke-linecap:round}
  pt-figure .fig-limb--left{stroke:var(--muted)}
  pt-figure .fig-head{fill:var(--text)}
  pt-figure .fig-knee-hl{fill:none;stroke:var(--accent);stroke-width:3}
</style>`;

export class PtFigure extends Base {
  static get observedAttributes() { return ['exercise-id', 'poses', 'mirror', 'static', 'tempo']; }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { if (this.isConnected) this._render(); }

  _spec() {
    const id = this.getAttribute('exercise-id');
    if (id) {
      const ex = getExercise(id);
      return ex ? { ...ex.figure, highlightLeftKnee: ex.side === 'left' } : null;
    }
    try {
      return { poses: JSON.parse(this.getAttribute('poses') || '[]'), props: [], band: null, mirror: false };
    } catch { return null; }
  }

  _render() {
    const spec = this._spec();
    const posesFile = getContent()?.poses ?? { segments: DEFAULT_SEGMENTS, poses: {} };
    const first = spec?.poses?.[0];
    const pose = typeof first === 'string' ? posesFile.poses[first] : first;
    if (!pose) {
      this.innerHTML = '<div class="placeholder">Keine Abbildung</div>';
      return;
    }
    const mirror = this.hasAttribute('mirror') || spec.mirror;
    const label = this.getAttribute('aria-label') || 'Übungsabbildung';
    this.innerHTML = `${STYLE}<svg viewBox="0 0 200 200" role="img" aria-label="${label.replace(/"/g, '&quot;')}">
      <g ${mirror ? 'transform="translate(200 0) scale(-1 1)"' : ''}>${poseSvg(pose, posesFile.segments, spec)}</g></svg>`;
  }
}

if (globalThis.customElements && !customElements.get('pt-figure')) customElements.define('pt-figure', PtFigure);
