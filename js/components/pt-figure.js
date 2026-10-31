// <pt-figure exercise-id | poses='[...]' props='[...]' band='{...}' tempo="3-1-1" mirror static size>
// Parametric SVG stick figure. Pose model: docs/SPEC.md §6.4. Contract: §7.5.
//
// Extra (optional, additive) attributes:
//   band-id="red"            band colour from settings.bands (else from the exercise's current level)
//   level="1"                level index used for the band colour when exercise-id is given
//   highlight="legL,armR"    parts drawn in the highlight colour: legL legR legs armL armR arms trunk kneeL none
//   highlight-color="accent" "primary" | "accent" | any CSS colour (default primary)
//   aspect="1.333"           frame aspect ratio w/h (default 4:3)
//
// Extra (optional) pose keys, all interpolated:
//   ankleL/ankleR (plantar flexion °), headTilt (° rel. to trunk, + = chin forward),
//   twist (front view: trunk rotation °, narrows the shoulders),
//   reachL/reachR (px shoulder protraction along the chest direction),
//   thighLenL… shinLenL… upperArmLenL… forearmLenL… (length multipliers for foreshortening, default 1)
//   camera: "top" (front view seen from above, e.g. prone on a mat), props: [string | {type, …}]
import { getExercise, getContent, loadContent } from '../content.js';
import { getSettings, getState } from '../store.js';
import { levelOf } from '../logic/progression.js';

const Base = globalThis.HTMLElement ?? class {};
const RAD = Math.PI / 180;
const ANGLE_KEYS = ['trunk', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];
const LEN_KEYS = ['thighLenL', 'thighLenR', 'shinLenL', 'shinLenR', 'upperArmLenL', 'upperArmLenR', 'forearmLenL', 'forearmLenR'];
const EXTRA_KEYS = ['ankleL', 'ankleR', 'headTilt', 'twist', 'reachL', 'reachR'];
export const OPTIONAL_KEYS = [...EXTRA_KEYS, ...LEN_KEYS];
export const DEFAULT_SEGMENTS = { trunk: 50, thigh: 42, shin: 42, upperArm: 30, forearm: 28, head: 10, foot: 10 };
export const FLOOR = 185;
export const MAT_H = 4;
export const SEAT_Y = 144; // chair seat top
export const STEP_H = 18;
export const BODY = { trunk: 13, trunkFront: 10, leg: 8.5, arm: 6.5, foot: 6, outline: 3 };
export const DEFAULT_BAND_COLORS = {
  yellow: '#F2D43D', red: '#D9443B', green: '#3BA55C', blue: '#2F6FD6', 'loop-orange': '#F08A24', 'loop-blue': '#2456B8',
};
const POINT_ALIASES = { ankleL: 'footL', ankleR: 'footR', wristL: 'handL', wristR: 'handR' };

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const down = (deg, len) => ({ x: Math.sin(deg * RAD) * len, y: Math.cos(deg * RAD) * len });
const add = (p, v) => ({ x: p.x + v.x, y: p.y + v.y });
const mul = (v, k) => ({ x: v.x * k, y: v.y * k });
const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const f = (n) => (Math.round(n * 10) / 10).toString();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Compute named points of a pose (pure).
 * @param {import('../types.js').Pose} pose
 * @param {Record<string, number>} [segments]
 */
export function computePoints(pose, segments = DEFAULT_SEGMENTS) {
  const S = { ...DEFAULT_SEGMENTS, ...segments };
  const front = pose.view === 'front';
  const t = num(pose.trunk);
  const up = { x: Math.sin(t * RAD), y: -Math.cos(t * RAD) }; // hip → neck
  const perp = { x: Math.cos(t * RAD), y: Math.sin(t * RAD) }; // side: chest direction · front: figure's left
  const hip = { x: num(pose.root?.x, 100), y: num(pose.root?.y, 100) };
  const neck = add(hip, mul(up, S.trunk));
  const ht = t + num(pose.headTilt);
  const head = add(neck, mul({ x: Math.sin(ht * RAD), y: -Math.cos(ht * RAD) }, S.head + 7));
  const tw = Math.cos(num(pose.twist) * RAD);
  const pts = { hip, neck, head };

  for (const side of ['L', 'R']) {
    const sign = front ? (side === 'L' ? 1 : -1) : 1; // front: left limbs on viewer's right
    const hipJ = front ? add(hip, mul(perp, sign * 8)) : hip;
    const thighA = sign * num(pose['hip' + side]);
    const knee = add(hipJ, down(thighA, S.thigh * num(pose['thighLen' + side], 1)));
    const shinA = thighA - sign * num(pose['knee' + side]);
    const foot = add(knee, down(shinA, S.shin * num(pose['shinLen' + side], 1)));
    const toe = front
      ? add(foot, down(shinA + sign * 90, 5))
      : add(foot, down(shinA + 90 - num(pose['ankle' + side]), S.foot));
    let shJ = front ? add(add(neck, mul(perp, sign * 14 * tw)), mul(up, -5)) : neck;
    if (!front) shJ = add(shJ, mul(perp, num(pose['reach' + side])));
    const upperA = sign * num(pose['shoulder' + side]);
    const elbow = add(shJ, down(upperA, S.upperArm * num(pose['upperArmLen' + side], 1)));
    const hand = add(elbow, down(upperA + sign * num(pose['elbow' + side]), S.forearm * num(pose['forearmLen' + side], 1)));
    Object.assign(pts, {
      ['hipJ' + side]: hipJ, ['knee' + side]: knee, ['foot' + side]: foot, ['ankle' + side]: foot, ['toe' + side]: toe,
      ['shoulder' + side]: shJ, ['elbow' + side]: elbow, ['hand' + side]: hand,
    });
  }
  pts.hands = mid(pts.handL, pts.handR);
  pts.feet = mid(pts.footL, pts.footR);
  pts.knees = mid(pts.kneeL, pts.kneeR);
  return pts;
}

/**
 * Linear interpolation of all angles (+ optional extra keys) and root (pure).
 * @param {import('../types.js').Pose} a @param {import('../types.js').Pose} b @param {number} t 0..1
 * @returns {import('../types.js').Pose}
 */
export function interpolatePose(a, b, t) {
  const base = t < 0.5 ? a : b;
  const out = { ...base, root: { x: a.root.x + (b.root.x - a.root.x) * t, y: a.root.y + (b.root.y - a.root.y) * t } };
  for (const k of ANGLE_KEYS) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  for (const k of OPTIONAL_KEYS) {
    if (a[k] === undefined && b[k] === undefined) continue;
    const d = LEN_KEYS.includes(k) ? 1 : 0;
    out[k] = num(a[k], d) + (num(b[k], d) - num(a[k], d)) * t;
  }
  // Segments with an explicit length key are foreshortened (they move out of the image plane):
  // interpolate their projected vector instead of their angle, so e.g. an arm sweeping toward
  // the camera shrinks through the middle instead of swinging down.
  for (const s of ['L', 'R']) {
    projectLimb(a, b, t, out, 'shoulder' + s, 'elbow' + s, 'upperArmLen' + s, 'forearmLen' + s, 1);
    projectLimb(a, b, t, out, 'hip' + s, 'knee' + s, 'thighLen' + s, 'shinLen' + s, -1);
  }
  return out;
}

function lerpVec(absA, lenA, absB, lenB, t, fallback) {
  const va = down(absA, lenA);
  const vb = down(absB, lenB);
  const v = { x: va.x + (vb.x - va.x) * t, y: va.y + (vb.y - va.y) * t };
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-3) return [fallback, 0];
  let ang = Math.atan2(v.x, v.y) / RAD;
  ang += 360 * Math.round((fallback - ang) / 360);
  return [ang, len];
}

function projectLimb(a, b, t, out, k1, k2, l1, l2, dir) {
  const p1 = a[l1] !== undefined || b[l1] !== undefined;
  const p2 = a[l2] !== undefined || b[l2] !== undefined;
  if (!p1 && !p2) return;
  const abs2 = (p) => num(p[k1]) + dir * num(p[k2]);
  let abs1 = out[k1];
  let o2 = out[k1] + dir * out[k2];
  if (p1) {
    const [ang, len] = lerpVec(num(a[k1]), num(a[l1], 1), num(b[k1]), num(b[l1], 1), t, abs1);
    abs1 = ang; out[l1] = len;
  }
  if (p2) {
    const [ang, len] = lerpVec(abs2(a), num(a[l2], 1), abs2(b), num(b[l2], 1), t, o2);
    o2 = ang; out[l2] = len;
  }
  out[k1] = abs1;
  out[k2] = dir * (o2 - abs1);
}

/** Parse "ecc-pause-con" seconds → ms. Default 2-0-2. */
export function parseTempo(tempo) {
  const parts = String(tempo ?? '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return { ecc: 2000, pause: 0, con: 2000 };
  const [ecc, pause, con] = parts.map((s) => s * 1000);
  return { ecc: ecc || 300, pause, con: con || 300 };
}

const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;

/**
 * Pose at time `ms` of a ping-pong keyframe loop (pure). start → end = concentric,
 * hold = pause, end → start = eccentric, short rest at the start.
 */
export function poseAt(keyframes, tempo, ms) {
  const n = keyframes.length;
  if (n < 2) return keyframes[0];
  const { ecc, pause, con } = typeof tempo === 'object' ? tempo : parseTempo(tempo);
  const hold = Math.max(pause, 350);
  const rest = 450;
  const steps = n - 1;
  const total = con + hold + ecc + rest;
  let x = ((ms % total) + total) % total;
  const seg = (dur, from, to) => {
    const u = (x / dur) * steps;
    const i = Math.min(steps - 1, Math.floor(u));
    const k = from < to ? i : steps - 1 - i;
    const local = ease(u - i);
    return from < to ? interpolatePose(keyframes[k], keyframes[k + 1], local) : interpolatePose(keyframes[k + 1], keyframes[k], local);
  };
  if (x < con) return seg(con, 0, steps);
  x -= con;
  if (x < hold) return keyframes[n - 1];
  x -= hold;
  if (x < ecc) return seg(ecc, steps, 0);
  return keyframes[0];
}

/** Band colour by id: settings.bands → defaults → fallback. */
export function bandColor(id, bands) {
  if (!id) return null;
  let list = bands;
  if (!list) { try { list = getSettings()?.bands; } catch { list = null; } }
  return list?.find?.((b) => b.id === id)?.color ?? DEFAULT_BAND_COLORS[id] ?? '#D9443B';
}

// ---------------------------------------------------------------- props

const propType = (p) => (typeof p === 'string' ? p : p?.type);

/** Merge figure-level prop names with pose-level prop objects (pose objects win). */
function mergeProps(figureProps = [], pose0) {
  const out = new Map();
  for (const p of figureProps || []) if (propType(p)) out.set(propType(p), typeof p === 'string' ? { type: p } : { ...p });
  for (const p of pose0?.props || []) if (propType(p)) out.set(propType(p), { ...(out.get(propType(p)) || {}), ...(typeof p === 'string' ? { type: p } : p) });
  return [...out.values()];
}

/** Resolve prop placement from the first keyframe (stable during animation). */
export function layoutProps(props, pose0, P, band) {
  const side = pose0.view !== 'front';
  const out = [];
  const lowFoot = P.footL.y >= P.footR.y ? 'L' : 'R';
  const highFoot = lowFoot === 'L' ? 'R' : 'L';
  for (const raw of props) {
    const p = { ...raw };
    switch (p.type) {
      case 'chair': {
        if (p.x === undefined || p.y === undefined) {
          if (pose0.ground === 'sitting') {
            Object.assign(p, { x: P.hip.x + (side ? 2 : 0), y: P.hip.y + BODY.leg / 2 + 1, facing: 1 });
          } else if (pose0.ground === 'lying') {
            const ft = P['foot' + highFoot];
            Object.assign(p, { x: ft.x + 6, y: ft.y + 4, facing: -1 });
          } else {
            const hx = Math.max(P.handL.x, P.handR.x);
            Object.assign(p, { x: hx + 19, y: SEAT_Y, facing: 1 });
          }
        }
        p.facing ??= 1;
        p.anchor = { x: p.x - 14 * p.facing, y: FLOOR - 8 }; // rear chair leg
        break;
      }
      case 'wall': {
        p.line = side || p.x !== undefined;
        if (p.x === undefined) {
          p.x = side ? Math.min(P.hip.x - BODY.trunk / 2, P.neck.x - BODY.trunk / 2, P.head.x - DEFAULT_SEGMENTS.head) - 1.5 : 100;
        }
        p.away ??= p.facing ? -p.facing : (p.x < P.hip.x ? -1 : 1); // hatch on the far side of the figure
        p.anchor = { x: p.x, y: p.y ?? P.hip.y - 20 };
        break;
      }
      case 'door': {
        if (p.x === undefined || p.y === undefined) {
          const from = band?.from && P[POINT_ALIASES[band.from] || band.from];
          const ref = from || P.hands;
          p.x ??= ref.x + (side ? 55 : 60);
          p.y ??= ref.y;
        }
        p.anchor = { x: p.x, y: p.y };
        break;
      }
      case 'mat': break; // laid out with the frame
      case 'step': {
        if (p.x === undefined) {
          const raised = ['L', 'R'].filter((s) => P['foot' + s].y < FLOOR - 10).sort((a, b) => P['foot' + b].y - P['foot' + a].y);
          const s = raised[0] || lowFoot;
          p.x = P['foot' + s].x + (side ? 4 : 0);
          p.top ??= raised[0] ? P['foot' + s].y + 3 : FLOOR - STEP_H;
        }
        p.w ??= 50;
        p.top ??= FLOOR - (p.h ?? STEP_H);
        p.anchor = { x: p.x, y: (p.top + FLOOR) / 2 };
        break;
      }
      case 'towel': {
        if (p.x === undefined) {
          const at = P[p.at || 'kneeL'];
          p.x = at.x;
          p.y = pose0.ground === 'lying' ? FLOOR - MAT_H - 5 : at.y + 9;
        }
        p.r ??= 5;
        break;
      }
      case 'cushion': {
        if (p.x === undefined) {
          if (pose0.ground === 'lying') Object.assign(p, { x: P.head.x, y: FLOOR - MAT_H - 3, w: 26, h: 6 });
          else Object.assign(p, { x: P.hip.x, y: P.hip.y + BODY.leg / 2 + 2, w: 30, h: 6 });
        }
        break;
      }
      case 'bow': break; // follows the hands every frame
      default: continue;
    }
    out.push(p);
  }
  return out;
}

function propBounds(p) {
  switch (p.type) {
    case 'chair': return [{ x: p.x - 18, y: p.y - (p.back === false ? 0 : 50) }, { x: p.x + 18, y: FLOOR }];
    case 'door': return [{ x: p.x - 6, y: p.y - 6 }, { x: p.x + 6, y: p.y + 6 }];
    case 'step': return [{ x: p.x - p.w / 2, y: p.top }, { x: p.x + p.w / 2, y: FLOOR }];
    case 'towel': return [{ x: p.x - p.r, y: p.y - p.r }, { x: p.x + p.r, y: p.y + p.r }];
    case 'cushion': return [{ x: p.x - p.w / 2, y: p.y - p.h / 2 }, { x: p.x + p.w / 2, y: p.y + p.h / 2 }];
    default: return [];
  }
}

function bowGeom(P) {
  const h = P.handL;
  const top = { x: h.x - 7, y: h.y - 44 };
  const bot = { x: h.x - 7, y: h.y + 44 };
  return { h, top, bot };
}

function propSvg(p, frame, front) {
  switch (p.type) {
    case 'chair': {
      const s = p.facing; // backrest on the -facing side
      const back = p.x - 16 * s;
      const fr = p.x + 16 * s;
      if (front && p.view !== 'side') {
        return `<g class="fig-prop">
          ${p.back === false ? '' : `<rect class="fig-prop-soft" x="${f(p.x - 17)}" y="${f(p.y - 48)}" width="34" height="44" rx="4"/>`}
          <path class="fig-prop-line" d="M${f(p.x - 15)} ${f(p.y + 2)}V${FLOOR}M${f(p.x + 15)} ${f(p.y + 2)}V${FLOOR}"/>
          <rect class="fig-prop-solid" x="${f(p.x - 19)}" y="${f(p.y)}" width="38" height="5" rx="2"/></g>`;
      }
      return `<g class="fig-prop">
        <path class="fig-prop-line" d="M${f(back)} ${f(p.y + 2)}V${FLOOR}M${f(fr)} ${f(p.y + 2)}V${FLOOR}${p.back === false ? '' : `M${f(back)} ${f(p.y)}V${f(p.y - 48)}`}"/>
        <rect class="fig-prop-solid" x="${f(Math.min(back, fr) - 2)}" y="${f(p.y)}" width="36" height="5" rx="2"/></g>`;
    }
    case 'wall': {
      if (front && !p.line) {
        return `<rect class="fig-wall-bg" x="${f(frame.x)}" y="${f(frame.y)}" width="${f(frame.w)}" height="${f(FLOOR - frame.y)}"/>`;
      }
      const xs = p.away;
      let hatch = '';
      for (let y = FLOOR - 4; y > frame.y; y -= 12) hatch += `M${f(p.x)} ${f(y)}l${f(xs * 6)} ${-6}`;
      return `<g class="fig-prop"><path class="fig-prop-hatch" d="${hatch}"/><path class="fig-prop-wall" d="M${f(p.x)} ${FLOOR}V${f(frame.y - 2)}"/></g>`;
    }
    case 'door': {
      const ax = p.x;
      const fx = front ? ax : ax + 3;
      return `<g class="fig-prop">
        <rect class="fig-prop-soft" x="${f(fx - 3)}" y="${f(Math.min(frame.y + 4, p.y - 30))}" width="7" height="${f(FLOOR - Math.min(frame.y + 4, p.y - 30))}" rx="1.5"/>
        ${p.knot === false ? '' : `<circle class="fig-knot" cx="${f(ax)}" cy="${f(p.y)}" r="3.4"/>`}</g>`;
    }
    case 'mat':
      return '';
    case 'step':
      return `<g class="fig-prop"><rect class="fig-prop-solid fig-step" x="${f(p.x - p.w / 2)}" y="${f(p.top)}" width="${f(p.w)}" height="${f(FLOOR - p.top)}" rx="3"/></g>`;
    case 'towel':
      return `<g class="fig-prop"><circle class="fig-towel" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}"/><circle class="fig-towel-in" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r * 0.45)}"/></g>`;
    case 'cushion':
      return `<rect class="fig-cushion" x="${f(p.x - p.w / 2)}" y="${f(p.y - p.h / 2)}" width="${f(p.w)}" height="${f(p.h)}" rx="${f(p.h / 2)}"/>`;
    default:
      return '';
  }
}

function matSvg(frame, bbox, top) {
  if (top) {
    return `<rect class="fig-mat" x="${f(bbox.minX - 10)}" y="${f(bbox.minY - 8)}" width="${f(bbox.maxX - bbox.minX + 20)}" height="${f(bbox.maxY - bbox.minY + 16)}" rx="8"/>`;
  }
  const x0 = Math.max(frame.x + 4, bbox.minX - 8);
  const x1 = Math.min(frame.x + frame.w - 4, bbox.maxX + 8);
  return `<rect class="fig-mat" x="${f(x0)}" y="${FLOOR - MAT_H}" width="${f(x1 - x0)}" height="${MAT_H + 1}" rx="2"/>`;
}

// ---------------------------------------------------------------- figure

const path = (pts) => 'M' + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join('L');

function limbGroup(d, width, cls, extra = '') {
  return `<g class="${cls}"${extra}><path class="fig-out" d="${d}" stroke-width="${width + BODY.outline}"/><path class="fig-stroke" d="${d}" stroke-width="${width}"/></g>`;
}

/**
 * SVG markup (inner) for one pose — figure only, no frame/props.
 * @param {import('../types.js').Pose} pose
 * @param {Record<string, number>} [segments]
 * @param {{highlightLeftKnee?: boolean, highlight?: string[]|string, mirror?: boolean}} [opts]
 */
export function poseSvg(pose, segments, { highlightLeftKnee = false, highlight = [], mirror = false } = {}) {
  const p = computePoints(pose, segments);
  const S = { ...DEFAULT_SEGMENTS, ...segments };
  const front = pose.view === 'front';
  const hl = normalizeHighlight(highlight);
  const isHl = (part) => hl.has(part);
  const leg = (s) => path([p['hipJ' + s], p['knee' + s], p['foot' + s]]);
  const foot = (s) => path([p['foot' + s], p['toe' + s]]);
  const arm = (s) => path([p['shoulder' + s], p['elbow' + s], p['hand' + s]]);
  const near = mirror ? 'L' : 'R';
  const far = mirror ? 'R' : 'L';
  const legSvg = (s, depth) => {
    const cls = `fig-limb fig-leg fig-leg--${s} ${depth}${isHl('leg' + s) ? ' fig-hl' : ''}`;
    return `<g class="${cls}">${limbGroup(foot(s), BODY.foot, 'fig-part')}${limbGroup(leg(s), BODY.leg, 'fig-part')}</g>`;
  };
  const armSvg = (s, depth) => limbGroup(arm(s), BODY.arm, `fig-limb fig-arm fig-arm--${s} ${depth}${isHl('arm' + s) ? ' fig-hl' : ''}`);
  const headR = S.head - 0.5;
  const headSvg = `<circle class="fig-head${isHl('trunk') ? ' fig-hl' : ''}" cx="${f(p.head.x)}" cy="${f(p.head.y)}" r="${f(headR)}"/>`;
  let trunkSvg;
  if (front) {
    const torso = path([p.shoulderL, p.shoulderR, p.hipJR, p.hipJL]) + 'Z';
    const neckD = path([p.neck, mid(p.neck, p.head)]);
    trunkSvg = `<g class="fig-trunk${isHl('trunk') ? ' fig-hl' : ''}">
      <path class="fig-out" d="${neckD}" stroke-width="${6 + BODY.outline}"/><path class="fig-stroke" d="${neckD}" stroke-width="6"/>
      <path class="fig-out fig-torso-out" d="${torso}" stroke-width="${BODY.trunkFront + BODY.outline}"/>
      <path class="fig-torso" d="${torso}" stroke-width="${BODY.trunkFront}"/></g>`;
  } else {
    trunkSvg = limbGroup(path([p.hip, p.neck]), BODY.trunk, `fig-trunk${isHl('trunk') ? ' fig-hl' : ''}`);
  }
  const ring = highlightLeftKnee || isHl('kneeL')
    ? `<circle class="fig-knee-hl" cx="${f(p.kneeL.x)}" cy="${f(p.kneeL.y)}" r="8.5"/>` : '';
  if (front) {
    const twist = num(pose.twist);
    const farArm = twist > 8 ? 'R' : twist < -8 ? 'L' : null;
    const arms = farArm
      ? [armSvg(farArm, 'fig-far'), null, armSvg(farArm === 'L' ? 'R' : 'L', 'fig-near')]
      : [null, null, armSvg('L', 'fig-near') + armSvg('R', 'fig-near')];
    return `${arms[0] || ''}${legSvg('L', 'fig-near')}${legSvg('R', 'fig-near')}${trunkSvg}${headSvg}${arms[2]}${ring}`;
  }
  return `${armSvg(far, 'fig-far')}${legSvg(far, 'fig-far')}${trunkSvg}${headSvg}${legSvg(near, 'fig-near')}${armSvg(near, 'fig-near')}${ring}`;
}

export function normalizeHighlight(h) {
  const list = Array.isArray(h) ? h : String(h || '').split(/[\s,]+/);
  const out = new Set();
  for (const x of list) {
    if (!x || x === 'none') continue;
    if (x === 'legs') { out.add('legL'); out.add('legR'); } else if (x === 'arms') { out.add('armL'); out.add('armR'); } else if (x === 'left') { out.add('legL'); out.add('armL'); } else if (x === 'right') { out.add('legR'); out.add('armR'); } else out.add(x);
  }
  return out;
}

/** Bounding box of the drawn body for one pose. */
export function poseBounds(pose, segments) {
  const P = computePoints(pose, segments);
  const S = { ...DEFAULT_SEGMENTS, ...segments };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const take = (pt, r) => {
    minX = Math.min(minX, pt.x - r); maxX = Math.max(maxX, pt.x + r);
    minY = Math.min(minY, pt.y - r); maxY = Math.max(maxY, pt.y + r);
  };
  take(P.head, S.head + 1);
  for (const k of ['hip', 'neck', 'hipJL', 'hipJR', 'shoulderL', 'shoulderR']) take(P[k], BODY.trunk / 2 + 1);
  for (const k of ['kneeL', 'kneeR', 'footL', 'footR', 'toeL', 'toeR']) take(P[k], BODY.leg / 2 + 1);
  for (const k of ['elbowL', 'elbowR', 'handL', 'handR']) take(P[k], BODY.arm / 2 + 1);
  return { minX, minY, maxX, maxY };
}

function resolvePoint(P, ref, props) {
  if (!ref) return null;
  if (typeof ref === 'object' && Number.isFinite(ref.x)) return ref;
  if (typeof ref === 'string') {
    if (P[POINT_ALIASES[ref] || ref]) return P[POINT_ALIASES[ref] || ref];
    const prop = props.find((p) => p.type === ref);
    if (prop?.anchor) return prop.anchor;
  }
  return null;
}

function bandSvg(from, to, rest, color) {
  const d = dist(from, to);
  const slack = Math.max(0, rest * 1.06 - d);
  const sag = Math.min(22, slack * 0.55 + (d < 6 ? 0 : 0.6));
  const m = mid(from, to);
  const c = { x: m.x, y: m.y + sag * 2 };
  const dd = `M${f(from.x)} ${f(from.y)}Q${f(c.x)} ${f(c.y)} ${f(to.x)} ${f(to.y)}`;
  return `<g class="fig-band" style="--band:${esc(color)}"><path class="fig-band-out" d="${dd}"/><path class="fig-band-line" d="${dd}"/><circle class="fig-band-end" cx="${f(to.x)}" cy="${f(to.y)}" r="2.2"/><circle class="fig-band-end" cx="${f(from.x)}" cy="${f(from.y)}" r="2.2"/></g>`;
}

function bowSvg(P) {
  const { h, top, bot } = bowGeom(P);
  const limb = `M${f(top.x)} ${f(top.y)}Q${f(h.x + 18)} ${f(h.y - 22)} ${f(h.x + 2)} ${f(h.y)}Q${f(h.x + 18)} ${f(h.y + 22)} ${f(bot.x)} ${f(bot.y)}`;
  const nock = P.handR;
  const drawn = dist(nock, h) > 30 && nock.x < h.x && h.y < P.hip.y - 25 && Math.abs(nock.y - h.y) < 30; // bow raised, string hand on the arrow line
  const str = drawn ? `M${f(top.x)} ${f(top.y)}L${f(nock.x)} ${f(nock.y)}L${f(bot.x)} ${f(bot.y)}` : `M${f(top.x)} ${f(top.y)}L${f(bot.x)} ${f(bot.y)}`;
  const arrow = drawn ? `<path class="fig-arrow" d="M${f(nock.x)} ${f(nock.y)}L${f(h.x + 12)} ${f(h.y)}"/>` : '';
  return `<g class="fig-bow"><path class="fig-bow-string" d="${str}"/>${arrow}<path class="fig-bow-limb" d="${limb}"/></g>`;
}

/**
 * Build a reusable scene (pure): framing + static props for a set of keyframes.
 * @param {{poses: object[], segments?: object, props?: any[], band?: any, bandColor?: string,
 *   highlight?: string[]|string, highlightLeftKnee?: boolean, mirror?: boolean, aspect?: number}} spec
 */
export function buildScene(spec) {
  const poses = spec.poses.filter(Boolean);
  const segments = { ...DEFAULT_SEGMENTS, ...(spec.segments || {}) };
  const pose0 = poses[0];
  const P0 = computePoints(pose0, segments);
  const front = pose0.view === 'front';
  const top = front && pose0.camera === 'top';
  const band = spec.band && spec.band.from ? spec.band : null;
  const handBand = band && /^hand[LR]$/.test(band.from) && /^hand[LR]$/.test(String(band.to));
  // a band drawn hand-to-hand replaces the bow (band drills in archery stance)
  const props = layoutProps(mergeProps(spec.props, pose0).filter((p) => !(handBand && p.type === 'bow')), pose0, P0, band);
  const hasMat = props.some((p) => p.type === 'mat');

  // body bounds over all keyframes
  let bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (b) => { bb = { minX: Math.min(bb.minX, b.minX), minY: Math.min(bb.minY, b.minY), maxX: Math.max(bb.maxX, b.maxX), maxY: Math.max(bb.maxY, b.maxY) }; };
  for (const p of poses) grow(poseBounds(p, segments));
  const bodyBox = { ...bb };
  for (const pr of props) for (const pt of propBounds(pr)) grow({ minX: pt.x, minY: pt.y, maxX: pt.x, maxY: pt.y });
  if (props.some((p) => p.type === 'bow')) {
    for (const p of poses) { const g = bowGeom(computePoints(p, segments)); grow({ minX: g.top.x - 2, minY: g.top.y - 2, maxX: g.h.x + 14, maxY: g.bot.y + 2 }); }
  }
  if (band && typeof band.to === 'object' && Number.isFinite(band.to?.x)) grow({ minX: band.to.x - 4, minY: band.to.y - 4, maxX: band.to.x + 4, maxY: band.to.y + 4 });
  const wall = props.find((p) => p.type === 'wall');
  if (wall && !front) grow({ minX: wall.x - 8, maxX: wall.x + 8, minY: bb.minY, maxY: bb.maxY });
  if (!top) bb.maxY = Math.max(bb.maxY, FLOOR + 2);

  // frame with fixed aspect, centred on content
  const aspect = spec.aspect > 0 ? spec.aspect : 4 / 3;
  const pad = 10;
  let w = bb.maxX - bb.minX + pad * 2;
  let h = bb.maxY - bb.minY + pad * 2;
  h = Math.max(h, 96);
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (bb.minX + bb.maxX) / 2;
  const contentH = bb.maxY - bb.minY;
  const extra = h - contentH;
  const frame = { x: cx - w / 2, y: bb.minY - extra * (top ? 0.5 : 0.58), w, h };

  // band rest length = shortest distance over keyframes
  let rest = 0;
  if (band) {
    const ds = poses.map((p) => { const P = computePoints(p, segments); const a = resolvePoint(P, band.from, props); const b = resolvePoint(P, band.to, props); return a && b ? dist(a, b) : 0; });
    rest = Math.min(...ds);
  }
  const color = spec.bandColor || (band && (band.color || bandColor(band.id || band.band))) || DEFAULT_BAND_COLORS.red;
  const mirror = !!spec.mirror;
  const mirrorT = mirror ? ` transform="translate(${f(2 * (frame.x + frame.w / 2))} 0) scale(-1 1)"` : '';

  const groundSvg = top ? '' : `<rect class="fig-ground" x="${f(frame.x)}" y="${FLOOR}" width="${f(frame.w)}" height="${f(Math.max(0, frame.y + frame.h - FLOOR))}"/>
    <path class="fig-floor" d="M${f(frame.x)} ${FLOOR}H${f(frame.x + frame.w)}"/>`;
  const wallSvg = props.filter((p) => p.type === 'wall').map((p) => propSvg(p, frame, front)).join('');
  const otherSvg = props.filter((p) => !['wall', 'mat', 'bow'].includes(p.type)).map((p) => propSvg(p, frame, front)).join('');
  const staticBack = `${groundSvg}${wallSvg}${hasMat ? matSvg(frame, bodyBox, top) : ''}${otherSvg}`;
  const opts = { highlightLeftKnee: !!spec.highlightLeftKnee, highlight: spec.highlight || [], mirror };

  function figure(pose) {
    const P = computePoints(pose, segments);
    let s = '';
    if (!top && pose.ground === 'standing') {
      const fx = (P.footL.x + P.footR.x) / 2;
      const sw = Math.max(16, Math.abs(P.toeL.x - P.toeR.x) / 2 + 12);
      const onFloor = Math.max(P.footL.y, P.footR.y) > FLOOR - 9;
      if (onFloor) s += `<ellipse class="fig-shadow" cx="${f(fx)}" cy="${FLOOR}" rx="${f(sw)}" ry="2.6"/>`;
    }
    s += poseSvg(pose, segments, opts);
    if (props.some((p) => p.type === 'bow')) s += bowSvg(P);
    if (band) {
      const a = resolvePoint(P, band.from, props);
      const b = resolvePoint(P, band.to, props);
      if (a && b) s += bandSvg(a, b, rest, color);
    }
    return s;
  }

  return {
    frame, props, mirror, keyframes: poses,
    /** full frame markup (in viewBox coordinates of `frame`) for a pose */
    render(pose = pose0) {
      return `<g class="fig-frame"${mirrorT}>${staticBack}<g class="fig-body">${figure(pose)}</g></g>`;
    },
    renderBody: (pose) => figure(pose),
    staticBack,
    mirrorT,
  };
}

const viewBoxOf = (fr) => `${f(fr.x)} ${f(fr.y)} ${f(fr.w)} ${f(fr.h)}`;

/** Full standalone SVG string (pure). `pair` → first and last pose side by side with an arrow. */
export function figureSvg(spec, { pair = false, label = 'Übungsabbildung', pose } = {}) {
  const scene = buildScene(spec);
  const fr = scene.frame;
  const K = scene.keyframes;
  if (pair && K.length >= 2) {
    const gap = Math.max(26, fr.w * 0.14);
    const vb = { x: fr.x, y: fr.y, w: fr.w * 2 + gap, h: fr.h };
    const ax = fr.x + fr.w + gap / 2;
    const ay = fr.y + fr.h * 0.45;
    return `<svg class="fig-svg fig-svg--pair" viewBox="${viewBoxOf(vb)}" role="img" aria-label="${esc(label)}: Start- und Endposition">
      ${scene.render(K[0])}
      <path class="fig-pair-arrow" d="M${f(ax - gap * 0.3)} ${f(ay)}H${f(ax + gap * 0.3)}M${f(ax + gap * 0.3 - 6)} ${f(ay - 6)}L${f(ax + gap * 0.3)} ${f(ay)}L${f(ax + gap * 0.3 - 6)} ${f(ay + 6)}"/>
      <g transform="translate(${f(fr.w + gap)} 0)">${scene.render(K[K.length - 1])}</g></svg>`;
  }
  return `<svg class="fig-svg" viewBox="${viewBoxOf(fr)}" role="img" aria-label="${esc(label)}">${scene.render(pose || K[0])}</svg>`;
}

export const FIGURE_CSS = `
  pt-figure{display:block;color:var(--fig-color,var(--text,#14181F));--fig-bg:var(--fig-surface,var(--surface,#fff));contain:content}
  pt-figure .fig-svg{display:block;width:100%;height:auto;overflow:visible}
  pt-figure .fig-ground{fill:var(--surface-2,#EEF1F4);opacity:.55}
  pt-figure .fig-floor{stroke:var(--border,#E1E5EA);stroke-width:2;stroke-linecap:round;fill:none}
  pt-figure .fig-shadow{fill:currentColor;opacity:.09}
  pt-figure .fig-out{fill:none;stroke:var(--fig-bg);stroke-linecap:round;stroke-linejoin:round}
  pt-figure .fig-stroke{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}
  pt-figure .fig-torso{fill:currentColor;stroke:currentColor;stroke-linejoin:round}
  pt-figure .fig-torso-out{fill:var(--fig-bg)}
  pt-figure .fig-head{fill:currentColor;stroke:var(--fig-bg);stroke-width:2.5}
  pt-figure .fig-far{opacity:.5}
  pt-figure .fig-far.fig-hl{opacity:.8}
  pt-figure .fig-hl{color:var(--fig-hl,var(--primary,#0E7C86))}
  pt-figure .fig-knee-hl{fill:none;stroke:var(--fig-hl,var(--primary,#0E7C86));stroke-width:2.5;opacity:.9}
  pt-figure .fig-prop{color:var(--fig-prop,var(--muted,#5B6573))}
  pt-figure .fig-prop-line{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;opacity:.75}
  pt-figure .fig-prop-solid{fill:currentColor;opacity:.75}
  pt-figure .fig-step{opacity:.35}
  pt-figure .fig-prop-soft{fill:currentColor;opacity:.16}
  pt-figure .fig-prop-wall{stroke:currentColor;stroke-width:3;stroke-linecap:round;opacity:.7}
  pt-figure .fig-prop-hatch{stroke:currentColor;stroke-width:1.4;opacity:.35;fill:none}
  pt-figure .fig-wall-bg{fill:var(--surface-2,#EEF1F4);opacity:.8}
  pt-figure .fig-knot{fill:var(--fig-prop,var(--muted,#5B6573));stroke:var(--fig-bg);stroke-width:1.5}
  pt-figure .fig-mat{fill:var(--fig-mat,var(--primary,#0E7C86));opacity:.22}
  pt-figure .fig-towel{fill:var(--fig-towel,var(--accent,#E07A1F));opacity:.55}
  pt-figure .fig-towel-in{fill:none;stroke:var(--fig-bg);stroke-width:1.2;opacity:.8}
  pt-figure .fig-cushion{fill:var(--fig-towel,var(--accent,#E07A1F));opacity:.4}
  pt-figure .fig-band-out{fill:none;stroke:var(--fig-bg);stroke-width:6;stroke-linecap:round;opacity:.9}
  pt-figure .fig-band-line{fill:none;stroke:var(--band);stroke-width:3.4;stroke-linecap:round}
  pt-figure .fig-band-end{fill:var(--band)}
  pt-figure .fig-bow-limb{fill:none;stroke:var(--fig-bow,var(--muted,#5B6573));stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
  pt-figure .fig-bow-string{fill:none;stroke:var(--fig-bow,var(--muted,#5B6573));stroke-width:1;opacity:.85}
  pt-figure .fig-arrow{fill:none;stroke:var(--fig-arrow,var(--accent,#E07A1F));stroke-width:1.8;stroke-linecap:round}
  pt-figure .fig-pair-arrow{fill:none;stroke:var(--muted,#5B6573);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
  pt-figure .fig-placeholder{color:var(--muted,#5B6573);text-align:center;padding:1rem}
`;

let styleInjected = false;
function injectStyle(doc) {
  if (styleInjected || !doc?.head) return;
  const el = doc.createElement('style');
  el.id = 'pt-figure-style';
  el.textContent = FIGURE_CSS;
  doc.head.appendChild(el);
  styleInjected = true;
}

/**
 * Figure spec for an exercise (pure): figure block + highlight + band/tempo of the given level.
 * Knee block: operated (left) leg in --primary, ring on the left knee when side === "left".
 * Archery block: arms in --accent. Others: no highlight.
 */
export function figureSpecForExercise(ex, level = 0) {
  const knee = ex.block === 'knee';
  const lv = ex.levels?.[level] ?? ex.levels?.[0];
  return {
    ...ex.figure,
    highlight: knee ? (ex.side === 'both' ? 'legs' : 'legL') : ex.block === 'archery' ? 'arms' : '',
    highlightColor: ex.block === 'archery' ? 'accent' : 'primary',
    highlightLeftKnee: knee && ex.side === 'left',
    bandId: lv?.band ?? ex.levels?.find((l) => l.band)?.band ?? null,
    tempo: lv?.tempo ?? null,
  };
}

const parseJSON = (s, d) => { if (s == null || s === '') return d; try { return JSON.parse(s); } catch { return d; } };
const HL_COLORS = { primary: 'var(--primary,#0E7C86)', accent: 'var(--accent,#E07A1F)', petrol: 'var(--primary,#0E7C86)', orange: 'var(--accent,#E07A1F)' };

export class PtFigure extends Base {
  static get observedAttributes() {
    return ['exercise-id', 'poses', 'props', 'band', 'band-id', 'level', 'tempo', 'mirror', 'static', 'size', 'highlight', 'highlight-color', 'aspect'];
  }

  connectedCallback() {
    injectStyle(this.ownerDocument);
    this._mq = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this._onMq = () => this._render();
    this._mq?.addEventListener?.('change', this._onMq);
    if (globalThis.IntersectionObserver) {
      this._io = new IntersectionObserver((entries) => {
        this._visible = entries.some((e) => e.isIntersecting);
        this._visible ? this._play() : this._stop();
      });
      this._io.observe(this);
    } else this._visible = true;
    this._render();
  }

  disconnectedCallback() {
    this._stop();
    this._io?.disconnect();
    this._mq?.removeEventListener?.('change', this._onMq);
  }

  attributeChangedCallback() { if (this.isConnected) this._render(); }

  _spec() {
    const id = this.getAttribute('exercise-id');
    let spec = null;
    if (id) {
      const ex = getExercise(id);
      if (!ex) return null;
      let lvl = parseInt(this.getAttribute('level'), 10);
      if (!Number.isInteger(lvl)) { try { lvl = levelOf(getState(), id, ex); } catch { lvl = 0; } }
      spec = figureSpecForExercise(ex, lvl);
    } else {
      spec = { poses: parseJSON(this.getAttribute('poses'), []), props: [], band: null, mirror: false };
    }
    if (this.hasAttribute('props')) spec.props = parseJSON(this.getAttribute('props'), spec.props);
    if (this.hasAttribute('band')) spec.band = parseJSON(this.getAttribute('band'), spec.band);
    if (this.hasAttribute('band-id')) spec.bandId = this.getAttribute('band-id');
    if (this.hasAttribute('highlight')) spec.highlight = this.getAttribute('highlight');
    if (this.hasAttribute('highlight-color')) spec.highlightColor = this.getAttribute('highlight-color');
    if (this.hasAttribute('tempo')) spec.tempo = this.getAttribute('tempo');
    if (this.hasAttribute('mirror')) spec.mirror = this.getAttribute('mirror') !== 'false';
    return spec;
  }

  _render() {
    this._stop();
    const spec = this._spec();
    const content = getContent();
    if (!content && this.getAttribute('exercise-id') && !this._loading) {
      this._loading = true;
      loadContent().then(() => this.isConnected && this._render()).catch(() => {}).finally(() => { this._loading = false; });
    }
    const posesFile = content?.poses ?? { segments: DEFAULT_SEGMENTS, poses: {} };
    const keyframes = (spec?.poses || []).map((p) => (typeof p === 'string' ? posesFile.poses?.[p] : p)).filter((p) => p && p.root);
    if (!keyframes.length) {
      this.innerHTML = '<div class="fig-placeholder">Keine Abbildung</div>';
      return;
    }
    const size = parseFloat(this.getAttribute('size'));
    if (size > 0) { this.style.width = `${size}px`; this._sized = true; } else if (this._sized) { this.style.width = ''; this._sized = false; }
    const hc = spec.highlightColor;
    if (hc) this.style.setProperty?.('--fig-hl', HL_COLORS[hc] || hc); else this.style.removeProperty?.('--fig-hl');
    const band = spec.band ? { ...spec.band } : null;
    const sceneSpec = {
      poses: keyframes, segments: posesFile.segments, props: spec.props, band,
      bandColor: band ? (band.color || bandColor(spec.bandId || band.id)) : null,
      highlight: spec.highlight, highlightLeftKnee: spec.highlightLeftKnee, mirror: spec.mirror,
      aspect: parseFloat(this.getAttribute('aspect')),
    };
    const label = this.getAttribute('aria-label') || 'Übungsabbildung';
    const reduced = !!this._mq?.matches;
    if (keyframes.length >= 2 && (reduced || this.hasAttribute('static'))) {
      this.innerHTML = figureSvg(sceneSpec, { pair: true, label });
      return;
    }
    const scene = buildScene(sceneSpec);
    const fr = scene.frame;
    this.innerHTML = `<svg class="fig-svg" viewBox="${viewBoxOf(fr)}" role="img" aria-label="${esc(label)}"><g class="fig-frame"${scene.mirrorT}>${scene.staticBack}<g class="fig-body">${scene.renderBody(keyframes[0])}</g></g></svg>`;
    if (keyframes.length < 2) return;
    this._anim = { scene, keyframes, tempo: parseTempo(spec.tempo), body: this.querySelector('.fig-body'), t0: null };
    if (this._visible !== false) this._play();
  }

  _play() {
    const a = this._anim;
    if (!a || this._raf) return;
    const step = (now) => {
      if (a.t0 === null) a.t0 = now - (a.elapsed || 0);
      a.elapsed = now - a.t0;
      if (!a.last || now - a.last > 30) { // ~30 fps is plenty
        a.last = now;
        a.body.innerHTML = a.scene.renderBody(poseAt(a.keyframes, a.tempo, a.elapsed));
      }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._anim) this._anim.t0 = null;
  }
}

if (globalThis.customElements && !customElements.get('pt-figure')) customElements.define('pt-figure', PtFigure);
