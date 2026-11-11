// <pt-figure exercise-id | poses='[...]' props='[...]' band='{...}' tempo="3-1-1" mirror static size>
// Parametric SVG stick figure. Pose model: docs/SPEC.md §6.4. Contract: §7.5.
//
// Extra (optional, additive) attributes:
//   band-id="red"            band colour from settings.bands (else from the exercise's current level)
//   level="1"                level index used for the band colour when exercise-id is given
//   highlight="legL,armR"    parts drawn in the highlight colour: legL legR legs armL armR arms trunk kneeL none
//   highlight-color="accent" "primary" | "accent" | any CSS colour (default primary)
//   aspect="1.333"           frame aspect ratio w/h (default 4:3)
//   arrows="off"             hide the v5.3 motion arrows / prop labels ("on" forces them; default: shown unless
//                            `static` or size < 120 px). Reduced motion: start/end pair, arrows on the end pose.
//
// v5.3 figure keys: arrows ([…] explicit | false), labels ([{text, at, dx, dy}]) – see "motion arrows" below.
// data/figure-overrides.json ({overrides: {exerciseId: {poses, view, props, band, arrows, labels, mirror, tempo}}})
// is merged over exercise.figure by content.js (load) and figureSpecForExercise (applyFigureOverride).
//
// Extra (optional) pose keys, all interpolated:
//   ankleL/ankleR (plantar flexion °), headTilt (° rel. to trunk, + = chin forward),
//   twist (front view: trunk rotation °, narrows the shoulders),
//   reachL/reachR (px shoulder protraction along the chest direction),
//   thighLenL… shinLenL… upperArmLenL… forearmLenL… (length multipliers for foreshortening, default 1)
//   camera: "top" (front view seen from above, e.g. prone on a mat), props: [string | {type, …}]
//
// Props: chair ({x, y, facing, back, arms: armrest height above the seat}), wall, door, mat, step, towel,
//   cushion, bow, rower ({x0, x1, rail, seat, r, foot: {x, y, a}, exit: {x, y}} — side view rowing machine:
//   rail, flywheel housing at x1, foot stretcher under the ankle point `foot` (sole direction `a`°), the seat
//   follows the hip and a strap runs from `exit` to the hands every frame),
//   sling ({x, y, to: [points], door}) — v5 suspension trainer fixed at the top of the door: anchor at x/y
//   (default: above and beyond the first target point), straps run to the named points (default both hands;
//   e.g. footL/footR for heel cradles) with a handle/cradle every frame; `door: false` hides the door edge,
//   `behind: true` draws the straps behind the body (anchor behind the figure).
//   stick — v5.3 massage stick (z. B. Blackroll): a short roller follows the hands every frame, lying on the thigh
//   (`along`: limb the stick rests on, default thighL).
// Figure option `loop: true`: keyframes play as a cycle (k0 → … → kn-1 → k0) instead of ping-pong; the first
//   half of the segments uses the concentric time, the rest the eccentric time (e.g. rowing drive/recovery).
import { getExercise, getContent, loadContent } from '../content.js';
import { getSettings, getState } from '../store.js';
import { levelOf } from '../logic/progression.js';

const Base = globalThis.HTMLElement ?? class {};
const RAD = Math.PI / 180;
const ANGLE_KEYS = ['trunk', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];
const LEN_KEYS = ['thighLenL', 'thighLenR', 'shinLenL', 'shinLenR', 'upperArmLenL', 'upperArmLenR', 'forearmLenL', 'forearmLenR'];
const EXTRA_KEYS = ['ankleL', 'ankleR', 'headTilt', 'twist', 'reachL', 'reachR', 'face', 'patellaX', 'patellaY', 'gripX'];
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
  if (pose.camera === 'above') return pose.closeup === 'knee' ? kneeCloseupPoints(pose) : topPoints(pose, S);
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
 * v5.3 top view of a standing person (pose `view: "front", camera: "above"`; seen from above, pure). `root` = centre of the shoulders, `face` = facing
 * direction (° from +y = toward the bottom of the image, + toward +x). Arms: `shoulderL/R` = upper-arm direction
 * relative to the facing (0 = forward, + = outward), `upperArmLen*` its projected length (hanging arm ≈ 0.15);
 * `elbowL/R` = forearm direction relative to the facing (0 = forward, + = outward → external rotation), `forearmLen*`.
 * Feet: small marks under the body, `hipL/R` = stance width (°-ish). Like the front view, the figure's left is on the
 * viewer's right when it faces the viewer.
 */
function topPoints(pose, S) {
  const c = { x: num(pose.root?.x, 100), y: num(pose.root?.y, 100) };
  const fa = num(pose.face);
  const F = down(fa, 1);
  const Lv = { x: Math.cos(fa * RAD), y: -Math.sin(fa * RAD) };
  const pts = { hip: c, neck: c, head: add(c, mul(F, 1.5)) };
  for (const side of ['L', 'R']) {
    const lat = mul(Lv, side === 'L' ? 1 : -1);
    const rel = (a) => add(mul(F, Math.cos(a * RAD)), mul(lat, Math.sin(a * RAD)));
    const sh = add(c, mul(lat, 17));
    const elbow = add(sh, mul(rel(num(pose['shoulder' + side])), S.upperArm * num(pose['upperArmLen' + side], 0.15)));
    const hand = add(elbow, mul(rel(num(pose['elbow' + side])), S.forearm * num(pose['forearmLen' + side], 1)));
    const foot = add(add(c, mul(lat, 6 + num(pose['hip' + side], 4) * 0.5)), mul(F, 2));
    Object.assign(pts, {
      ['hipJ' + side]: add(c, mul(lat, 7)), ['knee' + side]: foot, ['foot' + side]: foot, ['ankle' + side]: foot,
      ['toe' + side]: add(foot, mul(F, 8)), ['shoulder' + side]: sh, ['elbow' + side]: elbow, ['hand' + side]: hand,
    });
  }
  pts.hands = mid(pts.handL, pts.handR);
  pts.feet = mid(pts.footL, pts.footR);
  pts.knees = mid(pts.kneeL, pts.kneeR);
  return pts;
}

/**
 * v5.3 close-up of the (left) knee seen from above, leg lying horizontally (thigh left, foot right).
 * `root` = resting centre of the kneecap, `patellaX/Y` = glide of the kneecap, `gripX` = where thumb (handR, from
 * above) and index finger (handL, from below) touch the kneecap rim (relative to its centre).
 */
function kneeCloseupPoints(pose) {
  const c = { x: num(pose.root?.x, 100), y: num(pose.root?.y, 100) };
  const pat = { x: c.x + num(pose.patellaX), y: c.y + num(pose.patellaY) };
  const gx = num(pose.gripX, -9);
  const thumb = { x: pat.x + gx, y: pat.y - 6.5 };
  const index = { x: pat.x + gx, y: pat.y + 6.5 };
  const hip = { x: c.x - 78, y: c.y };
  const foot = { x: c.x + 78, y: c.y };
  return {
    hip, neck: { x: hip.x - 1, y: c.y }, head: { x: hip.x - 2, y: c.y }, kneeL: pat, kneeR: pat, knees: pat,
    hipJL: hip, hipJR: hip, footL: foot, footR: foot, ankleL: foot, ankleR: foot, toeL: foot, toeR: foot, feet: foot,
    handR: thumb, handL: index, hands: mid(thumb, index), elbowR: { x: thumb.x - 6, y: thumb.y - 26 }, elbowL: { x: index.x - 6, y: index.y + 26 },
    shoulderL: hip, shoulderR: hip, patella: pat, patellaRest: c,
  };
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
  if (a.camera === 'above') return out; // top view: lengths and directions are already projected
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
export function poseAt(keyframes, tempo, ms, { loop = false } = {}) {
  const n = keyframes.length;
  if (n < 2) return keyframes[0];
  const { ecc, pause, con } = tempo && typeof tempo === 'object' ? tempo : parseTempo(tempo);
  if (loop && n >= 3) return loopAt(keyframes, con, pause, ecc, ms);
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

/** Cyclic playback: k0 → … → k[half] (con), hold, k[half] → … → k0 (ecc); one easing per phase. */
function loopAt(keyframes, con, pause, ecc, ms) {
  const n = keyframes.length;
  const half = Math.ceil(n / 2);
  const hold = Math.max(pause, 120);
  const total = con + hold + ecc;
  let x = ((ms % total) + total) % total;
  const run = (dur, from, steps) => {
    const u = ease(Math.min(1, x / dur)) * steps;
    const i = Math.min(steps - 1, Math.floor(u));
    return interpolatePose(keyframes[(from + i) % n], keyframes[(from + i + 1) % n], u - i);
  };
  if (x < con) return run(con, 0, half);
  x -= con;
  if (x < hold) return keyframes[half];
  x -= hold;
  return run(ecc, half, n - half);
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
  const side = pose0.view === 'side';
  const topView = pose0.camera === 'above';
  const out = [];
  const lowFoot = P.footL.y >= P.footR.y ? 'L' : 'R';
  const highFoot = lowFoot === 'L' ? 'R' : 'L';
  for (const raw of props) {
    const p = { ...raw };
    if (topView) p.top = true;
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
        if (p.plane) { p.anchor = { x: p.x ?? P.hip.x, y: p.y ?? P.hip.y - 20 }; break; } // wall behind the figure (background)
        p.line = side || p.x !== undefined || p.y !== undefined;
        if (p.x === undefined) {
          p.x = side ? Math.min(P.hip.x - BODY.trunk / 2, P.neck.x - BODY.trunk / 2, P.head.x - DEFAULT_SEGMENTS.head) - 1.5 : 100;
        }
        p.away ??= p.facing ? -p.facing : (p.x < P.hip.x ? -1 : 1); // hatch on the far side of the figure
        if (p.orient === 'h') p.away = p.facing ? -p.facing : (p.y < P.hip.y ? -1 : 1);
        p.anchor = p.orient === 'h' ? { x: p.x, y: p.y } : { x: p.x, y: p.y ?? P.hip.y - 20 };
        break;
      }
      case 'door': {
        if (p.x === undefined || p.y === undefined) {
          const from = band?.from && P[POINT_ALIASES[band.from] || band.from];
          const ref = from || P.hands;
          p.x ??= ref.x + (side ? 55 : 60);
          p.y ??= ref.y;
          if (topView) p.top = true;
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
      case 'stick': break; // v5.3: follows the hands every frame
      case 'sling': {
        p.to = Array.isArray(p.to) && p.to.length ? p.to : ['handL', 'handR'];
        if (p.x === undefined || p.y === undefined) {
          const t = P[POINT_ALIASES[p.to[0]] || p.to[0]] || P.hands;
          const dir = !side ? 1 : (t.x >= P.hip.x ? 1 : -1);
          p.x ??= t.x + dir * 50;
          p.y ??= Math.min(P.head.y, t.y) - 40;
        }
        p.anchor = { x: p.x, y: p.y };
        break;
      }
      case 'rower': {
        if (!side) continue;
        p.seat ??= P.hip.y + BODY.leg / 2 + 1;
        p.rail ??= p.seat + 8;
        p.foot ??= { x: P.footR.x, y: P.footR.y, a: 130 };
        p.foot = { a: 130, ...p.foot };
        p.r ??= 16;
        p.exit ??= { x: p.foot.x + 46, y: p.rail - 30 };
        p.x1 ??= p.exit.x + 8;
        p.x0 ??= Math.min(P.hip.x, p.foot.x - 90) - 16;
        p.anchor = p.exit;
        break;
      }
      default: continue;
    }
    out.push(p);
  }
  return out;
}

function propBounds(p) {
  switch (p.type) {
    case 'chair': return [{ x: p.x - 18, y: p.y - (p.back === false ? (p.arms || 0) : 50) }, { x: p.x + 18, y: FLOOR }];
    case 'rower': return [{ x: p.x0 - 6, y: p.rail - 10 - p.r - 50 }, { x: p.x1 + p.r + 4, y: FLOOR }];
    case 'door': return p.top ? [{ x: p.x - 6, y: p.y - 18 }, { x: p.x + 6, y: p.y + 18 }] : [{ x: p.x - 6, y: p.y - 6 }, { x: p.x + 6, y: p.y + 6 }];
    case 'wall': return p.orient === 'h' && Number.isFinite(p.y) ? [{ x: p.x - 20, y: p.y - 7 }, { x: p.x + 20, y: p.y + 7 }] : [];
    case 'sling': return [{ x: p.x - 7, y: p.y - 10 }, { x: p.x + 7, y: p.y + 4 }];
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
      const ah = p.arms > 0 ? p.arms : 0;
      if (front && p.view !== 'side') {
        return `<g class="fig-prop">
          ${p.back === false ? '' : `<rect class="fig-prop-soft" x="${f(p.x - 17)}" y="${f(p.y - 48)}" width="34" height="44" rx="4"/>`}
          <path class="fig-prop-line" d="M${f(p.x - 15)} ${f(p.y + 2)}V${FLOOR}M${f(p.x + 15)} ${f(p.y + 2)}V${FLOOR}${ah ? `M${f(p.x - 19)} ${f(p.y)}V${f(p.y - ah)}M${f(p.x + 19)} ${f(p.y)}V${f(p.y - ah)}` : ''}"/>
          <rect class="fig-prop-solid" x="${f(p.x - 19)}" y="${f(p.y)}" width="38" height="5" rx="2"/></g>`;
      }
      const armD = ah ? `M${f(back)} ${f(p.y - ah)}H${f(p.x + 10 * s)}M${f(p.x + 8 * s)} ${f(p.y - ah)}V${f(p.y)}` : '';
      return `<g class="fig-prop">
        <path class="fig-prop-line" d="M${f(back)} ${f(p.y + 2)}V${FLOOR}M${f(fr)} ${f(p.y + 2)}V${FLOOR}${p.back === false && !ah ? '' : `M${f(back)} ${f(p.y)}V${f(p.y - (p.back === false ? ah : 48))}`}"/>
        ${ah ? `<path class="fig-prop-line fig-armrest" d="${armD}"/>` : ''}
        <rect class="fig-prop-solid" x="${f(Math.min(back, fr) - 2)}" y="${f(p.y)}" width="36" height="5" rx="2"/></g>`;
    }
    case 'wall': {
      if (p.plane || (front && !p.line)) {
        const h = p.top ? frame.h : FLOOR - frame.y;
        return `<rect class="fig-wall-bg" x="${f(frame.x)}" y="${f(frame.y)}" width="${f(frame.w)}" height="${f(h)}"/>`;
      }
      const xs = p.away;
      if (p.orient === 'h') {
        let hh = '';
        for (let x = frame.x + 4; x < frame.x + frame.w; x += 12) hh += `M${f(x)} ${f(p.y)}l${-6} ${f(xs * 6)}`;
        return `<g class="fig-prop"><path class="fig-prop-hatch" d="${hh}"/><path class="fig-prop-wall" d="M${f(frame.x - 2)} ${f(p.y)}H${f(frame.x + frame.w + 2)}"/></g>`;
      }
      if (p.top) {
        let hv = '';
        for (let y = frame.y + frame.h - 4; y > frame.y; y -= 12) hv += `M${f(p.x)} ${f(y)}l${f(xs * 6)} ${-6}`;
        return `<g class="fig-prop"><path class="fig-prop-hatch" d="${hv}"/><path class="fig-prop-wall" d="M${f(p.x)} ${f(frame.y + frame.h + 2)}V${f(frame.y - 2)}"/></g>`;
      }
      let hatch = '';
      for (let y = FLOOR - 4; y > frame.y; y -= 12) hatch += `M${f(p.x)} ${f(y)}l${f(xs * 6)} ${-6}`;
      return `<g class="fig-prop"><path class="fig-prop-hatch" d="${hatch}"/><path class="fig-prop-wall" d="M${f(p.x)} ${FLOOR}V${f(frame.y - 2)}"/></g>`;
    }
    case 'door': {
      if (p.top) { // door frame / leaf edge seen from above
        return `<g class="fig-prop"><rect class="fig-prop-solid" x="${f(p.x - 2.5)}" y="${f(p.y - 16)}" width="5" height="32" rx="1.5"/>
          ${p.knot === false ? '' : `<circle class="fig-knot" cx="${f(p.x)}" cy="${f(p.y)}" r="3.4"/>`}</g>`;
      }
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
    case 'rower':
      return rowerSvg(p);
    case 'sling': {
      const top = Math.min(frame.y + 2, p.y - 10);
      return `<g class="fig-prop fig-sling-anchor">
        ${p.door === false ? '' : `<rect class="fig-prop-soft" x="${f(p.x - 3.5)}" y="${f(top)}" width="7" height="${f(FLOOR - top)}" rx="1.5"/>`}
        <rect class="fig-prop-solid" x="${f(p.x - 5)}" y="${f(p.y - 8)}" width="10" height="7" rx="2"/></g>`;
    }
    default:
      return '';
  }
}

/** Static parts of the rowing machine (side view): rail, stands, flywheel housing, monitor, foot stretcher. */
function rowerSvg(p) {
  const { x0, x1, rail, r } = p;
  const cy = rail - 10;
  const d = { x: Math.sin(p.foot.a * RAD), y: Math.cos(p.foot.a * RAD) }; // sole direction (heel → toe)
  const n = { x: -d.y, y: d.x }; // away from the leg
  const off = BODY.foot / 2 + 2.2;
  const heel = { x: p.foot.x - d.x * 5 + n.x * off, y: p.foot.y - d.y * 5 + n.y * off };
  const toe = { x: p.foot.x + d.x * 15 + n.x * off, y: p.foot.y + d.y * 15 + n.y * off };
  const brace = mid(heel, toe);
  const mon = { x: x1 - 6, y: cy - r - 44 };
  return `<g class="fig-prop fig-rower">
    <path class="fig-prop-line" d="M${f(x0 + 6)} ${f(rail + 3)}V${FLOOR - 2}M${f(x0 - 2)} ${FLOOR - 2}H${f(x0 + 16)}M${f(x1)} ${f(cy + r - 2)}V${FLOOR - 2}M${f(x1 - 12)} ${FLOOR - 2}H${f(x1 + 14)}"/>
    <path class="fig-prop-line" d="M${f(x1 + 4)} ${f(cy - r + 2)}L${f(mon.x + 2)} ${f(mon.y + 6)}"/>
    <rect class="fig-prop-solid" x="${f(mon.x - 7)}" y="${f(mon.y - 4)}" width="14" height="10" rx="2" transform="rotate(-18 ${f(mon.x)} ${f(mon.y)})"/>
    <rect class="fig-prop-solid" x="${f(x0)}" y="${f(rail)}" width="${f(x1 - x0)}" height="4" rx="2"/>
    <circle class="fig-prop-soft fig-flywheel" cx="${f(x1)}" cy="${f(cy)}" r="${f(r)}"/>
    <circle class="fig-prop-ring" cx="${f(x1)}" cy="${f(cy)}" r="${f(r)}"/>
    <circle class="fig-prop-solid" cx="${f(x1)}" cy="${f(cy)}" r="3"/>
    <path class="fig-prop-line" d="M${f(brace.x)} ${f(brace.y)}L${f(brace.x - 2)} ${f(rail + 1)}"/>
    <path class="fig-prop-line fig-footplate" d="M${f(heel.x)} ${f(heel.y)}L${f(toe.x)} ${f(toe.y)}"/></g>`;
}

/** Moving parts of the rowing machine: seat under the hip, strap + handle to the hands. */
function rowerSeatSvg(p, P) {
  const x = P.hip.x;
  const gap = p.rail - 3 - (p.seat + 5);
  const carriage = gap > 0.5 ? `<rect class="fig-prop-solid" x="${f(x - 8)}" y="${f(p.seat + 4)}" width="16" height="${f(gap + 1)}" rx="1.5"/>` : '';
  return `<g class="fig-prop fig-rower-seat">${carriage}<circle class="fig-prop-solid" cx="${f(x - 6)}" cy="${f(p.rail - 1.4)}" r="1.6"/><circle class="fig-prop-solid" cx="${f(x + 6)}" cy="${f(p.rail - 1.4)}" r="1.6"/>
    <rect class="fig-prop-solid fig-seat" x="${f(x - 12)}" y="${f(p.seat)}" width="24" height="5" rx="2.5"/></g>`;
}
/**
 * Feet stay on the foot stretcher during animation (pure): re-solve both legs (2-link IK, knee flexed)
 * so the ankle point sits on `foot`, sole along `foot.a`. Keyframes from tools/gen-poses.mjs already
 * satisfy this; interpolated frames would otherwise slide a few px.
 */
export function lockFeet(pose, foot, segments = DEFAULT_SEGMENTS) {
  if (!foot || pose.view === 'front') return pose;
  const S = { ...DEFAULT_SEGMENTS, ...segments };
  const out = { ...pose };
  const hip = { x: num(pose.root?.x, 100), y: num(pose.root?.y, 100) };
  for (const s of ['L', 'R']) {
    const L1 = S.thigh * num(pose['thighLen' + s], 1);
    const L2 = S.shin * num(pose['shinLen' + s], 1);
    const v = { x: foot.x - hip.x, y: foot.y - hip.y };
    const d = Math.min(Math.hypot(v.x, v.y), L1 + L2 - 1e-3);
    const b = Math.atan2(v.x, v.y) / RAD;
    const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))) / RAD;
    const thigh = b + a; // knee in front of the hip → shin rotates backward (knee flexion > 0)
    const k = add(hip, down(thigh, L1));
    const shin = Math.atan2(foot.x - k.x, foot.y - k.y) / RAD;
    out['hip' + s] = thigh;
    out['knee' + s] = thigh - shin;
    out['ankle' + s] = shin - (num(foot.a, 130) - 90);
  }
  return out;
}

function rowerStrapSvg(p, P) {
  const h = P.hands;
  return `<path class="fig-strap" d="M${f(p.exit.x)} ${f(p.exit.y)}L${f(h.x)} ${f(h.y)}"/>`;
}
function rowerHandleSvg(P) {
  const h = P.hands;
  return `<circle class="fig-handle" cx="${f(h.x)}" cy="${f(h.y)}" r="2.8"/>`;
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
  if (pose.camera === 'above') return pose.closeup === 'knee' ? kneeCloseupSvg(pose) : topSvg(pose, segments, normalizeHighlight(highlight));
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

/** v5.3 top view: feet, shoulder girdle, arms, head with a nose mark (facing direction). */
function topSvg(pose, segments, hl) {
  const p = computePoints(pose, segments);
  const F = down(num(pose.face), 1);
  const arm = (s) => limbGroup(path([p['shoulder' + s], p['elbow' + s], p['hand' + s]]), BODY.arm, `fig-limb fig-arm fig-arm--${s} fig-near${hl.has('arm' + s) ? ' fig-hl' : ''}`);
  const torso = limbGroup(path([p.shoulderL, p.shoulderR]), BODY.trunk + 5, `fig-trunk${hl.has('trunk') ? ' fig-hl' : ''}`);
  const r = DEFAULT_SEGMENTS.head - 1.5;
  const nose = add(p.head, mul(F, r));
  return `${torso}${arm('L')}${arm('R')}<circle class="fig-head" cx="${f(p.head.x)}" cy="${f(p.head.y)}" r="${f(r)}"/><circle class="fig-head fig-nose" cx="${f(nose.x)}" cy="${f(nose.y)}" r="2.6"/>`;
}

/** v5.3 close-up: left knee from above, kneecap (highlight colour), thumb from above and index finger from below. */
function kneeCloseupSvg(pose) {
  const P = computePoints(pose);
  const c = P.patellaRest;
  const legD = `M${f(c.x - 84)} ${f(c.y - 2)}L${f(c.x)} ${f(c.y)}L${f(c.x + 84)} ${f(c.y + 3)}`;
  const leg = `<g class="fig-limb fig-knee-leg"><path class="fig-out" d="${legD}" stroke-width="${30 + BODY.outline}"/><path class="fig-stroke fig-knee-skin" d="${legD}" stroke-width="30"/></g>`;
  const pat = P.patella;
  const patSvg = `<ellipse class="fig-patella" cx="${f(pat.x)}" cy="${f(pat.y)}" rx="9" ry="8"/>`;
  const finger = (tip, root) => {
    const a = Math.atan2(tip.y - root.y, tip.x - root.x) / RAD;
    const palm = add(root, mul(unit({ x: root.x - tip.x, y: root.y - tip.y }), 6));
    return `<ellipse class="fig-head fig-hand" cx="${f(palm.x)}" cy="${f(palm.y)}" rx="13" ry="9" transform="rotate(${f(a)} ${f(palm.x)} ${f(palm.y)})"/>` + limbGroup(path([root, tip]), 6, 'fig-limb fig-finger');
  };
  return `${leg}${patSvg}${finger(P.handR, P.elbowR)}${finger(P.handL, P.elbowL)}`;
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
  if (pose.camera === 'above' && pose.closeup === 'knee') {
    const c = pose.root;
    return { minX: c.x - 88, minY: c.y - 42, maxX: c.x + 88, maxY: c.y + 42 };
  }
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

/** v5: straps of the suspension trainer from the anchor to the target points, with handles / foot cradles. */
function slingSvg(p, P) {
  let s = '';
  for (const ref of p.to) {
    const t = P[POINT_ALIASES[ref] || ref];
    if (!t) continue;
    const foot = /^foot/.test(ref);
    s += `<path class="fig-sling-strap" d="M${f(p.x)} ${f(p.y - 1)}L${f(t.x)} ${f(t.y)}"/>`;
    s += foot
      ? `<ellipse class="fig-sling-handle" cx="${f(t.x)}" cy="${f(t.y)}" rx="4.6" ry="3.2"/>`
      : `<rect class="fig-sling-handle" x="${f(t.x - 3.6)}" y="${f(t.y - 2.2)}" width="7.2" height="4.4" rx="2.2"/>`;
  }
  return `<g class="fig-sling">${s}</g>`;
}

/** v5.3: massage stick between/at the hands, parallel to the thigh it rests on. */
function stickSvg(P, p) {
  const s = (p.along || 'thighL').slice(-1);
  const a = P['hipJ' + s] || P.hip;
  const b = P['knee' + s];
  const len = Math.max(1, dist(a, b));
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const c = add(mid(P.handL, P.handR), { x: 0, y: 3 });
  const h = 13;
  const p1 = add(c, mul(u, -h));
  const p2 = add(c, mul(u, h));
  const seg = [-0.5, 0, 0.5].map((k) => add(c, mul(u, k * h)));
  return `<g class="fig-stick"><path class="fig-stick-rod" d="M${f(p1.x)} ${f(p1.y)}L${f(p2.x)} ${f(p2.y)}"/>${seg.map((q) => `<circle class="fig-stick-roll" cx="${f(q.x)}" cy="${f(q.y)}" r="3.4"/>`).join('')}</g>`;
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

// ---------------------------------------------------------------- motion arrows & labels (v5.3)
//
// Arrow spec (figure.arrows / data/figure-overrides.json):
//   {kind: "move"|"rotate"|"push"|"pull", from, to, around?, r?, a0?, a1?, bend?, label?}
//   Points: a named point ("handR", "kneeL", …), a prop type ("wall", "door"), {x, y}, or {at, dx, dy}.
//   move   — curved arrow from `from` (start pose) to `to` (end pose), `bend` = bulge (fraction of the length,
//            sign = side; default 0.18).
//   rotate — arc around `around` (pivot) from the direction of `from` (start pose) to `to` (end pose), radius `r`
//            (default 70 % of the pivot distance); or explicit screen angles a0 → a1 (°, 0 = +x, clockwise).
//   push   — straight arrow from → to on the end pose with a contact bar at the tip (pressing against something).
//   pull   — straight arrow from → to on the end pose with a grip ring at the tail.
// `arrows: false` switches the automatic arrow off; an explicit list replaces it.
// Automatic arrow (figures with ≥ 2 keyframes, not looped): the end point that travels furthest (hands, feet, hip,
// knees, head; highlighted limbs preferred) gets an arrow along its real path (sampled through the interpolation),
// offset to the outside of the curve; a symmetric partner (other hand/foot) gets one too.
// Labels: [{text, at, dx?, dy?, anchor?: "start"|"middle"|"end"}] — small captions on props („Wand“, „Tür“).

const AUTO_POINTS = [['handL', 1], ['handR', 1], ['footL', 1], ['footR', 1], ['hip', 0.95], ['kneeL', 0.7], ['kneeR', 0.7], ['head', 0.6]];
const PART_OF = { handL: 'armL', handR: 'armR', footL: 'legL', footR: 'legR', kneeL: 'legL', kneeR: 'legR', hip: 'trunk', head: 'trunk' };
const PARTNER = { handL: 'handR', handR: 'handL', footL: 'footR', footR: 'footL', kneeL: 'kneeR', kneeR: 'kneeL' };
const AUTO_MIN = 7; // px travel below which no automatic arrow is drawn

/** Resolve a point reference against computed points / laid-out props. */
export function refPoint(P, ref, props = []) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.at !== undefined) {
    const b = refPoint(P, ref.at, props);
    return b ? { x: b.x + num(ref.dx), y: b.y + num(ref.dy) } : null;
  }
  if (typeof ref === 'object' && Number.isFinite(ref.x)) return { x: ref.x + num(ref.dx), y: ref.y + num(ref.dy) };
  return resolvePoint(P, ref, props);
}

/** Sampled path of a named point through the keyframes (start → end). */
function trajectory(keyframes, segments, name, steps = 10) {
  const out = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    for (let j = 0; j <= steps; j++) {
      if (i > 0 && j === 0) continue;
      const P = computePoints(interpolatePose(keyframes[i], keyframes[i + 1], ease(j / steps)), segments);
      out.push(P[POINT_ALIASES[name] || name]);
    }
  }
  return out;
}

/**
 * Automatic motion arrows (pure): which named points get an arrow.
 * @returns {{point: string, path: {x:number,y:number}[]}[]}
 */
export function autoArrowPoints(keyframes, segments = DEFAULT_SEGMENTS, highlight = []) {
  if (!keyframes || keyframes.length < 2) return [];
  const hl = normalizeHighlight(highlight);
  const scored = AUTO_POINTS.map(([name, w]) => {
    const path = trajectory(keyframes, segments, name);
    const travel = Math.max(...path.map((q) => dist(q, path[0])));
    const boost = hl.has(PART_OF[name]) || (name.startsWith('knee') && hl.has('kneeL')) ? 1.25 : 1;
    return { point: name, path, travel, score: travel * w * boost };
  }).filter((c) => c.travel >= AUTO_MIN).sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  // whole-body movements (squat, sit-to-stand, bridge, step-up …): the hip carries the arrow
  const hipC = scored.find((c) => c.point === 'hip');
  if (hipC && hipC.travel >= 12 && scored[0].travel < hipC.travel * 3) return [{ point: 'hip', path: hipC.path }];
  const best = scored[0];
  const out = [best];
  const mate = scored.find((c) => c.point === PARTNER[best.point]);
  if (mate && mate.score >= best.score * 0.75 && dist(mate.path.at(-1), best.path.at(-1)) > 18) out.push(mate);
  return out.map(({ point, path }) => ({ point, path }));
}

function unit(v) { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }

/** Arrowhead triangle at `tip` pointing along `dir`. */
function headSvg(tip, dir, size = 5.2) {
  const u = unit(dir);
  const n = { x: -u.y, y: u.x };
  const b = { x: tip.x - u.x * size, y: tip.y - u.y * size };
  return `<path class="fig-motion-head" d="M${f(tip.x)} ${f(tip.y)}L${f(b.x + n.x * size * 0.62)} ${f(b.y + n.y * size * 0.62)}L${f(b.x - n.x * size * 0.62)} ${f(b.y - n.y * size * 0.62)}Z"/>`;
}

/** Polyline path (offset, trimmed) → arrow markup. */
function pathArrowSvg(pts, cls = '', sink = null) {
  if (pts.length < 2) return '';
  if (sink) sink.push(...pts);
  const d = 'M' + pts.map((q) => `${f(q.x)} ${f(q.y)}`).join('L');
  const tip = pts.at(-1);
  let k = pts.length - 2;
  while (k > 0 && dist(pts[k], tip) < 3) k--;
  const dir = { x: tip.x - pts[k].x, y: tip.y - pts[k].y };
  // the line stops short of the tip so the head stays sharp
  const u = unit(dir);
  const shortD = 'M' + pts.slice(0, -1).map((q) => `${f(q.x)} ${f(q.y)}`).join('L') + `L${f(tip.x - u.x * 3.5)} ${f(tip.y - u.y * 3.5)}`;
  return `<g class="fig-motion${cls}"><path class="fig-motion-halo" d="${d}"/><path class="fig-motion-line" d="${shortD}"/>${headSvg(tip, dir)}</g>`;
}

/** Offset a sampled path to the outside of its curve (or away from the body) and trim both ends. */
function shapePath(path, bodyC, off = 6.5) {
  const a = path[0];
  const b = path.at(-1);
  const chord = { x: b.x - a.x, y: b.y - a.y };
  const cm = mid(a, b);
  // point of the path farthest from the chord → bulge direction
  let far = cm; let fd = 0;
  const cu = unit(chord);
  for (const q of path) {
    const t = { x: q.x - a.x, y: q.y - a.y };
    const dd = Math.abs(t.x * cu.y - t.y * cu.x);
    if (dd > fd) { fd = dd; far = q; }
  }
  let n = { x: -cu.y, y: cu.x };
  const ref = fd > 2.5 ? { x: far.x - cm.x, y: far.y - cm.y } : { x: cm.x - bodyC.x, y: cm.y - bodyC.y };
  if (n.x * ref.x + n.y * ref.y < 0) n = { x: -n.x, y: -n.y };
  let pts = path.map((q) => ({ x: q.x + n.x * off, y: q.y + n.y * off }));
  // drop near-duplicates, trim the start a little
  const out = [pts[0]];
  for (const q of pts.slice(1)) if (dist(q, out.at(-1)) > 0.6) out.push(q);
  pts = out;
  let acc = 0; let i = 1;
  while (i < pts.length - 2 && acc < 3) { acc += dist(pts[i], pts[i - 1]); i++; }
  return pts.slice(i - 1);
}

function arcPoints(c, r, a0, a1, n = 18, ry = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * RAD;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * ry });
  }
  return out;
}
const angOf = (c, p) => Math.atan2(p.y - c.y, p.x - c.x) / RAD;

/** One explicit arrow → markup. */
function explicitArrowSvg(a, P0, P1, props, sink = null) {
  const kind = a.kind || 'move';
  if (kind === 'rotate') {
    const c = refPoint(P1, a.around, props) || refPoint(P0, a.around, props);
    if (!c) return '';
    let a0 = a.a0; let a1 = a.a1;
    const p0 = refPoint(P0, a.from, props);
    const p1 = refPoint(P1, a.to ?? a.from, props);
    if (!Number.isFinite(a0) && p0) a0 = angOf(c, p0);
    if (!Number.isFinite(a1) && p1) a1 = angOf(c, p1);
    if (!Number.isFinite(a0) || !Number.isFinite(a1)) return '';
    let d = a1 - a0;
    if (!Number.isFinite(a.a1) || !Number.isFinite(a.a0)) d = ((d + 540) % 360) - 180; // shortest way between two directions
    const r = a.r ?? (p0 ? Math.max(8, dist(c, p0) * 0.7) : 14);
    const trim = Math.sign(d) * Math.min(Math.abs(d) * 0.12, 10);
    return pathArrowSvg(arcPoints(c, r, a0 + trim, a0 + d - trim * 0.3, Math.max(18, Math.round(Math.abs(d) / 8)), a.ry ?? 1), ' fig-motion--rotate', sink);
  }
  const pose = kind === 'move' ? P0 : P1;
  const s = refPoint(pose, a.from, props);
  const e = refPoint(P1, a.to, props);
  if (!s || !e || dist(s, e) < 2) return '';
  if (kind === 'move') {
    const bend = a.bend ?? 0.18;
    const m = mid(s, e);
    const n = unit({ x: -(e.y - s.y), y: e.x - s.x });
    const L = dist(s, e);
    const c = { x: m.x + n.x * L * bend, y: m.y + n.y * L * bend };
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push({ x: (1 - t) * (1 - t) * s.x + 2 * (1 - t) * t * c.x + t * t * e.x, y: (1 - t) * (1 - t) * s.y + 2 * (1 - t) * t * c.y + t * t * e.y });
    }
    return pathArrowSvg(pts, '', sink);
  }
  const u = unit({ x: e.x - s.x, y: e.y - s.y });
  const n = { x: -u.y, y: u.x };
  let extra = '';
  if (kind === 'push') extra = `<path class="fig-motion-line" d="M${f(e.x + u.x * 1.5 + n.x * 5)} ${f(e.y + u.y * 1.5 + n.y * 5)}L${f(e.x + u.x * 1.5 - n.x * 5)} ${f(e.y + u.y * 1.5 - n.y * 5)}"/>`;
  if (kind === 'pull') extra = `<circle class="fig-motion-ring" cx="${f(s.x)}" cy="${f(s.y)}" r="2.6"/>`;
  return pathArrowSvg([s, e], ` fig-motion--${kind}`, sink).replace(/<\/g>$/, `${extra}</g>`);
}

/** Text label positions (unmirrored frame coordinates). */
function labelItems(labels, P0, props) {
  const out = [];
  for (const l of labels || []) {
    if (!l || !l.text) continue;
    const at = refPoint(P0, l.at, props);
    if (!at) continue;
    out.push({ text: String(l.text), x: at.x + num(l.dx), y: at.y + num(l.dy), anchor: l.anchor || 'middle' });
  }
  return out;
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
  const front = pose0.view !== 'side';
  const top = pose0.camera === 'above' || (front && pose0.camera === 'top');
  const band = spec.band && spec.band.from ? spec.band : null;
  const handBand = band && /^hand[LR]$/.test(band.from) && /^hand[LR]$/.test(String(band.to));
  // a band drawn hand-to-hand replaces the bow (band drills in archery stance)
  const props = layoutProps(mergeProps(spec.props, pose0).filter((p) => !(handBand && p.type === 'bow')), pose0, P0, band);
  const hasMat = props.some((p) => p.type === 'mat');
  const rower = props.find((p) => p.type === 'rower') || null;
  const sling = props.find((p) => p.type === 'sling') || null;

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
  if (wall && !front && !wall.plane) grow({ minX: wall.x - 8, maxX: wall.x + 8, minY: bb.minY, maxY: bb.maxY });
  if (wall && top && wall.line && wall.orient !== 'h') grow({ minX: wall.x - 8, maxX: wall.x + 8, minY: bb.minY, maxY: bb.maxY });

  // v5.3 motion arrows (static overlay along the path start → end) and prop labels
  const loop = !!spec.loop && poses.length >= 3;
  const endPose = poses[loop ? Math.ceil(poses.length / 2) : poses.length - 1];
  const P1 = computePoints(endPose, segments);
  const arrowPts = [];
  let arrowSvg = '';
  if (Array.isArray(spec.arrows)) {
    arrowSvg = spec.arrows.map((a) => explicitArrowSvg(a, P0, P1, props, arrowPts)).join('');
  } else if (spec.arrows !== false && !loop && poses.length >= 2) {
    const bodyC = mid(P0.hip, P0.neck);
    arrowSvg = autoArrowPoints(poses, segments, spec.highlight)
      .map(({ path: tr }) => pathArrowSvg(shapePath(tr, bodyC), '', arrowPts)).join('');
  }
  for (const q of arrowPts) grow({ minX: q.x - 4, minY: q.y - 4, maxX: q.x + 4, maxY: q.y + 4 });
  const labels = labelItems(spec.labels, P0, props);
  const fs = 7.5;
  for (const l of labels) {
    const w = l.text.length * fs * 0.56;
    const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
    grow({ minX: x0 - 2, maxX: x0 + w + 2, minY: l.y - fs, maxY: l.y + 2 });
  }
  if (!top) bb.maxY = Math.max(bb.maxY, FLOOR + 2);

  // frame with fixed aspect, centred on content
  const aspect = spec.aspect > 0 ? spec.aspect : 4 / 3;
  const pad = 10;
  let w = bb.maxX - bb.minX + pad * 2;
  let h = bb.maxY - bb.minY + pad * 2;
  h = Math.max(h, top && pose0.camera === 'above' ? 124 : 96);
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
  const otherSvg = props.filter((p) => !['wall', 'mat', 'bow', 'stick'].includes(p.type)).map((p) => propSvg(p, frame, front)).join('');
  const staticBack = `${groundSvg}${wallSvg}${hasMat ? matSvg(frame, bodyBox, top) : ''}${otherSvg}`;
  const opts = { highlightLeftKnee: !!spec.highlightLeftKnee, highlight: spec.highlight || [], mirror };
  const altArrow = spec.highlightColor === 'accent' ? ' fig-motion-layer--alt' : '';
  const arrowsLayer = arrowSvg ? `<g class="fig-motion-layer${altArrow}" aria-hidden="true">${arrowSvg}</g>` : '';
  const cxm = frame.x + frame.w / 2;
  const labelsLayer = labels.length
    ? `<g class="fig-labels" aria-hidden="true">${labels.map((l) => {
      const x = mirror ? 2 * cxm - l.x : l.x;
      const anchor = mirror && l.anchor !== 'middle' ? (l.anchor === 'start' ? 'end' : 'start') : l.anchor;
      return `<text class="fig-label" x="${f(x)}" y="${f(l.y)}" text-anchor="${anchor}" font-size="${fs}">${esc(l.text)}</text>`;
    }).join('')}</g>` : '';

  function figure(pose) {
    if (rower) pose = lockFeet(pose, rower.foot, segments);
    const P = computePoints(pose, segments);
    let s = '';
    if (!top && pose.ground === 'standing') {
      const fx = (P.footL.x + P.footR.x) / 2;
      const sw = Math.max(16, Math.abs(P.toeL.x - P.toeR.x) / 2 + 12);
      const onFloor = Math.max(P.footL.y, P.footR.y) > FLOOR - 9;
      if (onFloor) s += `<ellipse class="fig-shadow" cx="${f(fx)}" cy="${FLOOR}" rx="${f(sw)}" ry="2.6"/>`;
    }
    if (rower) s += rowerSeatSvg(rower, P) + rowerStrapSvg(rower, P);
    if (sling?.behind) s += slingSvg(sling, P); // anchor behind the figure: straps run behind the body
    s += poseSvg(pose, segments, opts);
    if (rower) s += rowerHandleSvg(P);
    if (sling && !sling.behind) s += slingSvg(sling, P);
    if (props.some((p) => p.type === 'bow')) s += bowSvg(P);
    const stick = props.find((p) => p.type === 'stick');
    if (stick) s += stickSvg(P, stick);
    if (band) {
      const a = resolvePoint(P, band.from, props);
      const b = resolvePoint(P, band.to, props);
      if (a && b) s += bandSvg(a, b, rest, color);
    }
    return s;
  }

  return {
    frame, props, mirror, keyframes: poses, loop,
    /** full frame markup (in viewBox coordinates of `frame`) for a pose; `overlay` adds arrows + labels */
    render(pose = pose0, { overlay = false } = {}) {
      return `<g class="fig-frame"${mirrorT}>${staticBack}<g class="fig-body">${figure(pose)}</g>${overlay ? arrowsLayer : ''}</g>${overlay ? labelsLayer : ''}`;
    },
    arrowsLayer,
    labelsLayer,
    hasArrows: !!arrowSvg,
    renderBody: (pose) => figure(pose),
    staticBack,
    mirrorT,
  };
}

const viewBoxOf = (fr) => `${f(fr.x)} ${f(fr.y)} ${f(fr.w)} ${f(fr.h)}`;

/** Full standalone SVG string (pure). `pair` → first and last pose side by side with an arrow. */
export function figureSvg(spec, { pair = false, label = 'Übungsabbildung', pose, overlay = true } = {}) {
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
      <g transform="translate(${f(fr.w + gap)} 0)">${scene.render(K[scene.loop ? Math.ceil(K.length / 2) : K.length - 1], { overlay })}</g></svg>`;
  }
  return `<svg class="fig-svg" viewBox="${viewBoxOf(fr)}" role="img" aria-label="${esc(label)}">${scene.render(pose || K[0], { overlay })}</svg>`;
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
  pt-figure .fig-prop-ring{fill:none;stroke:currentColor;stroke-width:2.2;opacity:.6}
  pt-figure .fig-strap{fill:none;stroke:var(--fig-prop,var(--muted,#5B6573));stroke-width:1.6;stroke-linecap:round;opacity:.9}
  pt-figure .fig-sling-strap{fill:none;stroke:var(--fig-sling,var(--accent,#E07A1F));stroke-width:2.4;stroke-linecap:round;opacity:.9}
  pt-figure .fig-sling-handle{fill:var(--fig-sling,var(--accent,#E07A1F));stroke:var(--fig-bg);stroke-width:1.2}
  pt-figure .fig-handle{fill:var(--fig-prop,var(--muted,#5B6573));stroke:var(--fig-bg);stroke-width:1}
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
  pt-figure .fig-stick-rod{fill:none;stroke:var(--fig-bow,var(--muted,#5B6573));stroke-width:3;stroke-linecap:round}
  pt-figure .fig-stick-roll{fill:var(--accent,#E07A1F);opacity:.85}
  pt-figure .fig-bow-limb{fill:none;stroke:var(--fig-bow,var(--muted,#5B6573));stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
  pt-figure .fig-bow-string{fill:none;stroke:var(--fig-bow,var(--muted,#5B6573));stroke-width:1;opacity:.85}
  pt-figure .fig-arrow{fill:none;stroke:var(--fig-arrow,var(--accent,#E07A1F));stroke-width:1.8;stroke-linecap:round}
  pt-figure .fig-pair-arrow{fill:none;stroke:var(--muted,#5B6573);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
  pt-figure .fig-knee-skin{opacity:.22}
  pt-figure .fig-patella{fill:var(--fig-hl,var(--primary,#0E7C86));stroke:var(--fig-bg);stroke-width:1.5}
  pt-figure .fig-motion-halo{fill:none;stroke:var(--fig-bg);stroke-width:4.6;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
  pt-figure .fig-motion-line{fill:none;stroke:var(--fig-arrow,var(--accent,#E07A1F));stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  pt-figure .fig-motion-head{fill:var(--fig-arrow,var(--accent,#E07A1F));stroke:var(--fig-arrow,var(--accent,#E07A1F));stroke-width:.8;stroke-linejoin:round}
  pt-figure .fig-motion-ring{fill:var(--fig-bg);stroke:var(--fig-arrow,var(--accent,#E07A1F));stroke-width:1.6}
  pt-figure .fig-motion-layer{opacity:.9}
  pt-figure .fig-motion-layer--alt{--fig-arrow:var(--primary,#0E7C86)}
  pt-figure .fig-label{fill:var(--muted,#5B6573);font-family:var(--font,system-ui,sans-serif);font-weight:600;letter-spacing:.02em;paint-order:stroke;stroke:var(--fig-bg);stroke-width:2.4px;stroke-linejoin:round}
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

/** Keys a figure override (data/figure-overrides.json) may set. */
export const OVERRIDE_KEYS = ['poses', 'view', 'props', 'band', 'arrows', 'labels', 'mirror', 'tempo', 'loop', 'highlight'];

/**
 * Merge a figure override over an exercise figure (pure, shallow: each given key replaces the original).
 * `view` is informational (the poses carry their view) and kept for the gallery / tests.
 */
export function applyFigureOverride(figure, ov) {
  if (!ov || typeof ov !== 'object') return figure;
  const out = { ...(figure || {}) };
  for (const k of OVERRIDE_KEYS) if (ov[k] !== undefined) out[k] = ov[k];
  return out;
}

/**
 * Figure spec for an exercise (pure): figure block + highlight + band/tempo of the given level.
 * Knee block: operated (left) leg in --primary, ring on the left knee when side === "left".
 * Archery block: arms in --accent. Others: no highlight.
 */
export function figureSpecForExercise(ex, level = 0, overrides) {
  const knee = ex.block === 'knee';
  const lv = ex.levels?.[level] ?? ex.levels?.[0];
  let ov = overrides;
  if (ov === undefined) { try { ov = getContent()?.figureOverrides; } catch { ov = null; } }
  const figure = applyFigureOverride(ex.figure, ov?.[ex.id]);
  ex = { ...ex, figure };
  return {
    ...ex.figure,
    highlight: ex.figure?.highlight ?? (knee ? (ex.side === 'both' ? 'legs' : ex.side === 'right' ? 'legR' : 'legL') : ex.block === 'archery' ? 'arms' : ''),
    highlightColor: ex.block === 'archery' ? 'accent' : 'primary',
    highlightLeftKnee: knee && ex.side === 'left',
    bandId: lv?.band ?? ex.levels?.find((l) => l.band)?.band ?? null,
    tempo: lv?.tempo ?? ex.figure?.tempo ?? null,
  };
}

const parseJSON = (s, d) => { if (s == null || s === '') return d; try { return JSON.parse(s); } catch { return d; } };
const HL_COLORS = { primary: 'var(--primary,#0E7C86)', accent: 'var(--accent,#E07A1F)', petrol: 'var(--primary,#0E7C86)', orange: 'var(--accent,#E07A1F)' };

export class PtFigure extends Base {
  static get observedAttributes() {
    return ['exercise-id', 'poses', 'props', 'band', 'band-id', 'level', 'tempo', 'mirror', 'static', 'size', 'highlight', 'highlight-color', 'aspect', 'loop', 'arrows'];
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
    if (this.hasAttribute('loop')) spec.loop = this.getAttribute('loop') !== 'false';
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
      highlight: spec.highlight, highlightLeftKnee: spec.highlightLeftKnee, mirror: spec.mirror, loop: !!spec.loop,
      aspect: parseFloat(this.getAttribute('aspect')),
    };
    const label = this.getAttribute('aria-label') || 'Übungsabbildung';
    const reduced = !!this._mq?.matches;
    const isStatic = this.hasAttribute('static');
    // motion arrows + labels: off for static thumbnails, small sizes and arrows="off"
    const arrowsAttr = this.getAttribute('arrows');
    const overlay = arrowsAttr === 'on' || (!isStatic && arrowsAttr !== 'off' && arrowsAttr !== 'none' && !(size > 0 && size < 120) && this.getAttribute('size') !== 'sm');
    sceneSpec.arrows = spec.arrows;
    sceneSpec.labels = spec.labels;
    sceneSpec.highlightColor = spec.highlightColor;
    if (keyframes.length >= 2 && (reduced || isStatic)) {
      this.innerHTML = figureSvg(sceneSpec, { pair: true, label, overlay });
      return;
    }
    const scene = buildScene(sceneSpec);
    const fr = scene.frame;
    const ov = overlay ? { a: scene.arrowsLayer, l: scene.labelsLayer } : { a: '', l: '' };
    this.innerHTML = `<svg class="fig-svg" viewBox="${viewBoxOf(fr)}" role="img" aria-label="${esc(label)}"><g class="fig-frame"${scene.mirrorT}>${scene.staticBack}<g class="fig-body">${scene.renderBody(keyframes[0])}</g>${ov.a}</g>${ov.l}</svg>`;
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
        a.body.innerHTML = a.scene.renderBody(poseAt(a.keyframes, a.tempo, a.elapsed, { loop: a.scene.loop }));
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
