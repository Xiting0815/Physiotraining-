// Generates data/poses.json: grounded root heights + IK helpers. Run: node gen-poses.mjs <repo>
import { writeFileSync } from 'node:fs';
const repo = process.argv[2];
const { computePoints, DEFAULT_SEGMENTS: SEG, FLOOR, MAT_H, SEAT_Y, STEP_H } = await import(`${repo}/js/components/pt-figure.js`);
const RAD = Math.PI / 180;
const MAT = FLOOR - MAT_H + 1; // body sinks 1px into the mat
const STEP = FLOOR - STEP_H;
const SEAT = SEAT_Y;

const KEYS = ['trunk', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];
const base = (view, ground, o = {}) => ({ view, ground, root: { x: 100, y: 100 }, trunk: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shoulderL: 0, shoulderR: 0, elbowL: 10, elbowR: 10, ...o });
const side = (ground, o) => base('side', ground, o);
const front = (ground, o) => base('front', ground, { elbowL: 0, elbowR: 0, hipL: 4, hipR: 4, shoulderL: 8, shoulderR: 8, ...o });
const pts = (p) => computePoints(p, SEG);
const clone = (p) => JSON.parse(JSON.stringify(p));

/** lowest drawn y of a set of body parts */
function lowest(p, parts = 'all') {
  const P = pts(p);
  const fr = p.view === 'front';
  const c = [];
  const put = (k, r) => c.push(P[k].y + r);
  if (parts === 'all' || parts.includes('head')) put('head', 9.5);
  if (parts === 'all' || parts.includes('trunk')) {
    if (fr) for (const k of ['shoulderL', 'shoulderR', 'hipJL', 'hipJR']) put(k, 5); else { put('hip', 6.5); put('neck', 6.5); }
  }
  for (const s of ['L', 'R']) {
    if (parts === 'all' || parts.includes('leg' + s)) { put('knee' + s, 4.25); put('foot' + s, 4.25); put('toe' + s, 3); }
    if (parts === 'all' || parts.includes('arm' + s)) { put('elbow' + s, 3.25); put('hand' + s, 3.25); }
  }
  return Math.max(...c);
}
/** shift root.y so the lowest drawn point of `parts` sits on y */
function ground(p, y, parts = 'all') { p.root.y = Math.round((p.root.y + (y - lowest(p, parts))) * 10) / 10; return p; }
/** side view: make feet flat (sole horizontal) */
function flat(p, ...sides) { for (const s of sides.length ? sides : ['L', 'R']) p['ankle' + s] = Math.round(p['hip' + s] - p['knee' + s]); return p; }
const dirAng = (v) => Math.atan2(v.x, v.y) / RAD;
const norm = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

/** 2-link IK: put hand/foot of limb at target (figure coords). pick(elbowOrKnee) chooses the solution. */
function aim(p, limb, target, pick) {
  const P = pts(p);
  const s = limb.slice(-1);
  const arm = limb.startsWith('arm');
  const sign = p.view === 'front' ? (s === 'L' ? 1 : -1) : 1;
  const A = arm ? P['shoulder' + s] : P['hipJ' + s];
  const L1 = (arm ? SEG.upperArm * (p['upperArmLen' + s] ?? 1) : SEG.thigh * (p['thighLen' + s] ?? 1));
  const L2 = (arm ? SEG.forearm * (p['forearmLen' + s] ?? 1) : SEG.shin * (p['shinLen' + s] ?? 1));
  const v = { x: target.x - A.x, y: target.y - A.y };
  const d = Math.min(Math.hypot(v.x, v.y), L1 + L2 - 0.01);
  const b = dirAng(v);
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))) / RAD;
  const sols = [b + a, b - a].map((u) => {
    const e = { x: A.x + Math.sin(u * RAD) * L1, y: A.y + Math.cos(u * RAD) * L1 };
    const w = dirAng({ x: target.x - e.x, y: target.y - e.y });
    const j1 = sign * u; // shoulder / hip param
    const j2 = arm ? norm(sign * w - j1) : norm(j1 - sign * w); // elbow / knee param
    return { j1: Math.round(norm(j1)), j2: Math.round(j2), e };
  });
  const sol = sols.find((x) => pick(x.j2, x.e)) || sols[0];
  p[(arm ? 'shoulder' : 'hip') + s] = sol.j1;
  p[(arm ? 'elbow' : 'knee') + s] = sol.j2;
  return p;
}
/** bisection on one key so that f(p) == 0 */
function solve(p, key, lo, hi, f) {
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    p[key] = lo; const fl = f(p);
    p[key] = m; const fm = f(p);
    if (Math.sign(fl) === Math.sign(fm)) lo = m; else hi = m;
  }
  p[key] = Math.round(((lo + hi) / 2) * 10) / 10;
  return p;
}
const r1 = (n) => Math.round(n * 10) / 10;

const poses = {};
/** front view: hands on the hips, elbows pointing outward */
function handsOnHips(p, sides = ['L', 'R']) {
  for (const s of sides) {
    const P = pts(p);
    const sg = s === 'L' ? 1 : -1;
    const hj = P['hipJ' + s];
    aim(p, 'arm' + s, { x: hj.x + sg * 7, y: hj.y - 7 }, (j2, e) => sg * (e.x - P.hip.x) > sg * (P['shoulder' + s].x - P.hip.x));
  }
  return p;
}
const add = (id, p) => { for (const k of KEYS) p[k] = r1(p[k]); poses[id] = p; return p; };

// ---------------------------------------------------------------- standing (side)
const stand = ground(side('standing'), FLOOR);
add('stand', stand);
add('stand-front', ground(front('standing'), FLOOR));
add('stand-arms-forward', ground(side('standing', { shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0 }), FLOOR));

function squat(k) {
  const shin = -k * 0.42;
  const hip = k + shin;
  const p = side('standing', { trunk: k * 0.45, hipL: hip, hipR: hip, kneeL: k, kneeR: k, shoulderL: 30 + k * 0.6, shoulderR: 30 + k * 0.6, elbowL: 10, elbowR: 10 });
  flat(p);
  return ground(p, FLOOR);
}
add('quarter-squat-30', squat(30));
add('quarter-squat-45', squat(45));
add('quarter-squat-60', squat(60));

add('wall-sit', ground(flat(side('standing', { hipL: 90, hipR: 90, kneeL: 90, kneeR: 90, shoulderL: 35, shoulderR: 35, elbowL: 35, elbowR: 35, props: ['wall'] })), FLOOR));
add('wall-sit-high', ground(flat(side('standing', { hipL: 38, hipR: 38, kneeL: 40, kneeR: 40, shoulderL: 20, shoulderR: 20, elbowL: 20, elbowR: 20, props: ['wall'] })), FLOOR));

// chair poses
const seatY = SEAT - 5.25;
const sit = flat(side('sitting', { root: { x: 92, y: seatY }, trunk: -3, hipL: 90, hipR: 90, kneeL: 90, kneeR: 90, shoulderL: 22, shoulderR: 22, elbowL: 55, elbowR: 55 }));
const chairX = sit.root.x + 2;
sit.props = [{ type: 'chair', x: chairX, y: SEAT, facing: 1 }];
add('sit-chair', sit);
{
  const p = flat(side('sitting', { root: { x: 100, y: 0 }, trunk: 42, hipL: 72, hipR: 72, kneeL: 84, kneeR: 84, shoulderL: 75, shoulderR: 75, elbowL: 5, elbowR: 5 }));
  // feet stay where they were while sitting
  const footX = pts(sit).footR.x;
  ground(p, FLOOR);
  p.root.x = r1(p.root.x + footX - pts(p).footR.x);
  p.props = [{ type: 'chair', x: chairX, y: SEAT, facing: 1 }];
  add('sit-to-stand-mid', p);
  const q = clone(stand);
  q.root.x = r1(q.root.x + footX - pts(q).footR.x);
  q.props = [{ type: 'chair', x: chairX, y: SEAT, facing: 1 }];
  add('sit-to-stand-end', q);
}
add('sit-chair-front', ground(front('sitting', { hipL: 80, hipR: 80, thighLenL: 0.25, thighLenR: 0.25, kneeL: 80, kneeR: 80, shoulderL: 12, shoulderR: 12, elbowL: -30, elbowR: -30, props: [{ type: 'chair', back: true }] }), FLOOR, ['legL', 'legR']));

// seated knee extension (left leg works), seated hamstring curl
{
  const mk = (kL, extra = {}) => { const p = flat(side('sitting', { root: { x: 92, y: seatY }, trunk: -3, hipL: 90, hipR: 90, kneeL: kL, kneeR: 90, shoulderL: 15, shoulderR: 15, elbowL: 20, elbowR: 20, ...extra })); p.props = [{ type: 'chair', x: chairX, y: SEAT, facing: 1 }]; return p; };
  add('seated-knee-ext-start', mk(90));
  add('seated-knee-ext-end', mk(5));
  add('seated-ham-curl-start', mk(25));
  add('seated-ham-curl-end', mk(60));
  const high = (kL) => { const p = flat(side('sitting', { root: { x: 92, y: seatY - 10 }, trunk: -3, hipL: 90, hipR: 90, kneeL: kL, kneeR: 90 - (kL - 90) * 0.4, shoulderL: 15, shoulderR: 15, elbowL: 20, elbowR: 20 })); p.props = [{ type: 'chair', x: chairX, y: SEAT - 10, facing: 1, back: false }]; return p; };
  add('knee-pendulum-a', high(55));
  add('knee-pendulum-b', high(115));
}

// step-up (right foot leads onto the step)
{
  const stepX = 128;
  const start = side('standing', { trunk: 14, hipL: -6, hipR: 55, kneeL: 4, kneeR: 85, shoulderL: 22, shoulderR: -12, elbowL: 20, elbowR: 20 });
  flat(start);
  ground(start, FLOOR, ['legL']);
  start.root.x = r1(start.root.x + stepX - pts(start).footR.x - 2);
  aim(start, 'legR', { x: stepX - 4, y: STEP - 4.25 }, (k) => k > 0);
  flat(start);
  start.props = [{ type: 'step', x: stepX, w: 52 }];
  add('step-up-start', start);
  const end = side('standing', { trunk: 4, hipL: 50, hipR: 0, kneeL: 75, kneeR: 0, shoulderL: -10, shoulderR: 20, elbowL: 20, elbowR: 20 });
  flat(end);
  ground(end, STEP, ['legR']);
  end.root.x = r1(end.root.x + stepX - pts(end).footR.x - 2);
  end.props = [{ type: 'step', x: stepX, w: 52 }];
  add('step-up-end', end);
}
// lateral step-down (front view): stance leg left on the step, right foot lowers beside it
{
  const mk = (drop) => {
    const p = front('standing', { hipL: 2, hipR: 2 + drop * 0.25, kneeL: 0, kneeR: 0, thighLenL: 1 - drop * 0.012, shinLenL: 1 - drop * 0.004, shoulderL: 25, shoulderR: 25 + drop * 0.3, elbowL: 0, elbowR: 0, trunk: -drop * 0.08 });
    ground(p, STEP, ['legL']);
    p.props = [{ type: 'step', x: r1(pts(p).footL.x + 6), w: 44 }];
    return p;
  };
  add('lateral-step-down-start', mk(0));
  add('lateral-step-down-end', mk(18));
}
// single leg stance (stand on left, right knee up), star taps
add('single-leg-stance', ground(flat(side('standing', { hipL: 0, kneeL: 3, hipR: 60, kneeR: 85, shoulderL: 15, shoulderR: 15, elbowL: 15, elbowR: 15 })), FLOOR, ['legL']));
add('single-leg-stance-front', ground(front('standing', { hipL: 3, hipR: 4, kneeR: 4, thighLenR: 0.45, shoulderL: 30, shoulderR: 30 }), FLOOR, ['legL']));
{
  const tap = (dir) => {
    const k = 22;
    const p = side('standing', { trunk: dir === 'front' ? 10 : 25, hipL: k * 0.55, kneeL: k, shoulderL: 35, shoulderR: 35, elbowL: 10, elbowR: 10, hipR: dir === 'front' ? 35 : -30, kneeR: 3 });
    flat(p, 'L');
    ground(p, FLOOR, ['legL']);
    solve(p, 'hipR', dir === 'front' ? 15 : -70, dir === 'front' ? 80 : -5, (q) => pts(q).footR.y + 4.25 - (FLOOR - 1));
    return p;
  };
  add('star-tap-front', tap('front'));
  add('star-tap-back', tap('back'));
  const s = front('standing', { hipL: 3, kneeL: 0, thighLenL: 0.93, shoulderL: 30, shoulderR: 30, hipR: 30 });
  ground(s, FLOOR, ['legL']);
  solve(s, 'hipR', 10, 70, (q) => pts(q).footR.y + 4.25 - (FLOOR - 1));
  add('star-tap-side', s);
}
// calf raise
add('calf-raise-down', ground(side('standing', { shoulderL: 10, shoulderR: 10, elbowL: 15, elbowR: 15 }), FLOOR));
add('calf-raise-up', ground(side('standing', { shoulderL: 10, shoulderR: 10, elbowL: 15, elbowR: 15, ankleL: 42, ankleR: 42 }), FLOOR));
// lateral walk (front, mini squat), standing hip abduction (front)
{
  const lw = (w) => handsOnHips(ground(front('standing', { hipL: 6, hipR: w, thighLenL: 0.9, thighLenR: 0.9, trunk: 0 }), FLOOR));
  add('lateral-walk-a', lw(6));
  add('lateral-walk-b', lw(18));
  const abd = (a) => handsOnHips(ground(front('standing', { hipL: 2, hipR: a, trunk: a * 0.12 }), FLOOR, ['legL']));
  add('hip-abd-standing-start', abd(3));
  add('hip-abd-standing-end', abd(32));
}
// standing hip extension holding a chair
{
  const mk = (e) => {
    const p = side('standing', { trunk: 8 + e * 0.15, hipL: 0, hipR: -e, kneeR: 3, shoulderL: 22, shoulderR: 22, elbowL: 25, elbowR: 25 });
    flat(p, 'L');
    return ground(p, FLOOR, ['legL']);
  };
  const a = mk(0);
  const hx = Math.max(pts(a).handR.x, pts(a).handL.x);
  const chair = { type: 'chair', x: r1(hx + 18), y: SEAT, facing: 1 };
  a.props = [chair];
  add('hip-ext-standing-start', a);
  const b = mk(28);
  b.root.x = r1(b.root.x + pts(a).footL.x - pts(b).footL.x);
  b.props = [chair];
  add('hip-ext-standing-end', b);
}
// TKE (left knee, band behind knee to a door anchor in front)
{
  const s = side('standing', { trunk: 8, hipL: 22, kneeL: 32, hipR: 0, kneeR: 0, shoulderL: 15, shoulderR: 15, elbowL: 20, elbowR: 20 });
  flat(s, 'L');
  ground(s, FLOOR);
  const e = flat(side('standing', { trunk: 3, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, shoulderL: 15, shoulderR: 15, elbowL: 20, elbowR: 20 }), 'L');
  ground(e, FLOOR);
  e.root.x = r1(e.root.x + pts(s).footL.x - pts(e).footL.x);
  const door = { type: 'door', x: r1(pts(s).kneeL.x + 55), y: r1(pts(s).kneeL.y) };
  s.props = [door]; e.props = [door];
  add('tke-start', s);
  add('tke-end', e);
}

// ---------------------------------------------------------------- lying (side view, supine: head left)
const supine = (o) => side('lying', { root: { x: 112, y: 100 }, trunk: -90, hipL: 90, hipR: 90, kneeL: 0, kneeR: 0, shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0, ...o });
const lie = (p) => ground(p, MAT);
add('lying-supine', lie(supine()));
add('lying-supine-quad', lie(supine({ hipL: 92, kneeL: -3 })));
{
  const relax = lie(supine({ hipL: 97, kneeL: 14, props: [{ type: 'towel', at: 'kneeL' }] }));
  add('supine-quad-set-relax', relax);
  const set = clone(relax); set.hipL = 94; set.kneeL = 4; set.ankleL = -12;
  add('supine-quad-set', set);
}
// heel slide: left heel slides toward buttock
function hook(o, sides = ['L', 'R'], k = 90) {
  const p = lie(supine(o));
  for (const s of sides) {
    p['knee' + s] = k;
    solve(p, 'hip' + s, 95, 175, (q) => pts(q).footL && (pts(q)['foot' + s].y + 4.25 - MAT));
    flat(p, s);
  }
  return p;
}
add('heel-slide-start', lie(supine()));
add('heel-slide-end', hook({}, ['L'], 105));
add('lying-heel-slide', hook({}, ['L'], 90));
{
  const d = hook({}, ['R'], 90); d.hipL = 90; d.kneeL = 0;
  add('slr-down', d); add('lying-slr-down', clone(d));
  const u = clone(d); u.hipL = 135;
  add('slr-up', u); add('lying-slr-up', clone(u));
}
// bridges
const bridgeDown = hook({}, ['L', 'R'], 90);
add('bridge-down', bridgeDown);
function bridgeUp(down, opts = {}) {
  const P0 = pts(down);
  const footS = opts.foot || 'R';
  const target = { neck: P0.neck, foot: P0['foot' + footS] };
  let best = null;
  for (let T = -150; T <= -91; T += 0.25) {
    for (let k = 40; k <= 130; k += 0.5) {
      const p = clone(down);
      p.trunk = T;
      p['hip' + footS] = -T; // shoulder-hip-knee aligned
      p['knee' + footS] = k;
      // place neck on the mat at the same spot
      const P = pts(p);
      p.root.x += target.neck.x - P.neck.x; p.root.y += target.neck.y - P.neck.y;
      const Q = pts(p);
      const err = Math.hypot(Q['foot' + footS].x - target.foot.x, Q['foot' + footS].y - target.foot.y);
      if (!best || err < best.err) best = { err, p };
    }
  }
  const p = best.p;
  p.root.x = r1(p.root.x); p.root.y = r1(p.root.y);
  flat(p, footS);
  return p;
}
{
  const up = bridgeUp(bridgeDown);
  up.hipL = up.hipR; up.kneeL = up.kneeR; flat(up);
  add('bridge-up', up);
  const sl = clone(up); sl.kneeL = 0; sl.hipL = up.hipR; delete sl.ankleL;
  add('bridge-single-leg', sl);
  const sld = clone(bridgeDown); sld.kneeL = 0; sld.hipL = sld.hipR - 0; delete sld.ankleL;
  add('bridge-single-leg-down', sld);
}
// heel on chair bridge
{
  const p = lie(supine({}));
  for (const s of ['L', 'R']) {
    p['knee' + s] = 25;
    solve(p, 'hip' + s, 95, 175, (q) => pts(q)['foot' + s].y + 4.25 - SEAT);
    p['ankle' + s] = 0;
  }
  const cx = r1(pts(p).footR.x + 4);
  p.props = [{ type: 'chair', x: cx, y: SEAT, facing: -1 }];
  add('bridge-heel-chair-down', p);
  // up: neck stays, heel stays
  const P0 = pts(p);
  let best = null;
  for (let T = -150; T <= -91; T += 0.25) {
    for (let k = 15; k <= 35; k += 0.25) {
      const q = clone(p); q.trunk = T; q.hipR = q.hipL = -T; q.kneeR = q.kneeL = k;
      const P = pts(q); q.root.x += P0.neck.x - P.neck.x; q.root.y += P0.neck.y - P.neck.y;
      const Q = pts(q);
      const err = Math.hypot(Q.footR.x - P0.footR.x, Q.footR.y - P0.footR.y);
      if (!best || err < best.err) best = { err, q };
    }
  }
  best.q.root.x = r1(best.q.root.x); best.q.root.y = r1(best.q.root.y);
  add('bridge-heel-chair-up', best.q);
}
// dead bug
{
  const s = lie(supine({ shoulderL: 180, shoulderR: 180, hipL: 180, hipR: 180, kneeL: 90, kneeR: 90, elbowL: 0, elbowR: 0 }));
  s.ankleL = s.ankleR = 0;
  ground(s, MAT, ['trunk', 'head']);
  add('dead-bug-start', s);
  const e = clone(s); e.shoulderR = 250; e.hipL = 100; e.kneeL = 5;
  add('dead-bug-end', e);
}
// serratus punch (supine, arms to ceiling, protraction)
{
  const s = lie(supine({ shoulderL: 180, shoulderR: 180, hipL: 135, hipR: 135, kneeL: 90, kneeR: 90 }));
  flat(s); ground(s, MAT, ['trunk', 'head']);
  add('supine-serratus-punch-start', s);
  const e = clone(s); e.reachL = 6; e.reachR = 6;
  add('supine-serratus-punch-end', e);
}
// seated row (long sit on mat, band around feet)
{
  const s = side('sitting', { trunk: 2, hipL: 90, hipR: 90, kneeL: 8, kneeR: 8, shoulderL: 78, shoulderR: 78, elbowL: 0, elbowR: 0, props: ['mat'] });
  ground(s, MAT, ['trunk', 'legL', 'legR']);
  add('seated-row-start', s);
  const e = clone(s); e.trunk = -4; e.shoulderL = e.shoulderR = -35; e.elbowL = e.elbowR = 115;
  add('seated-row-end', e);
}

// ---------------------------------------------------------------- side-lying (front view, lying on the right side, head left)
const sideLying = (o) => front('lying', { root: { x: 112, y: 100 }, trunk: -90, shoulderR: 90, elbowR: 0, shoulderL: 90, elbowL: 0, ...o });
function legsBent(p, open = 0) {
  const P = pts(p);
  const kneeB = { x: P.hipJR.x + 30, y: MAT - 4.25 };
  const footB = { x: kneeB.x + 30, y: MAT - 4.25 };
  // bottom (right) leg: thigh & shin foreshortened (flexed toward the viewer)
  const vt = { x: kneeB.x - P.hipJR.x, y: kneeB.y - P.hipJR.y };
  p.thighLenR = r1(Math.hypot(vt.x, vt.y) / SEG.thigh * 100) / 100;
  p.hipR = r1(-Math.atan2(vt.x, vt.y) / RAD);
  p.shinLenR = r1(30 / SEG.shin * 100) / 100;
  p.kneeR = r1(90 + p.hipR); // R (sign -1): thighA = -hipR, shinA = thighA + kneeR → shin horizontal (world 90)
  // top (left) leg: knee lifts with `open`, foot stays on the bottom foot
  const kneeT = { x: kneeB.x - open * 0.25, y: kneeB.y - 8 - open };
  const footT = { x: footB.x, y: footB.y - 8 };
  const vT = { x: kneeT.x - P.hipJL.x, y: kneeT.y - P.hipJL.y };
  p.thighLenL = r1(Math.hypot(vT.x, vT.y) / SEG.thigh * 100) / 100;
  p.hipL = r1(Math.atan2(vT.x, vT.y) / RAD);
  const vS = { x: footT.x - kneeT.x, y: footT.y - kneeT.y };
  p.shinLenL = r1(Math.hypot(vS.x, vS.y) / SEG.shin * 100) / 100;
  p.kneeL = r1(p.hipL - Math.atan2(vS.x, vS.y) / RAD);
  return p;
}
function slBase(o) {
  const p = sideLying(o);
  ground(p, MAT, ['trunk']);
  return p;
}
{
  const c = legsBent(slBase(), 0);
  c.props = ['mat'];
  add('clamshell-closed', c);
  const o = legsBent(slBase(), 22); o.props = c.props;
  add('clamshell-open', o);
  const straight = (lift) => {
    const p = slBase();
    const P = pts(p);
    p.hipR = -(90 - r1(Math.atan2(MAT - 4.25 - P.hipJR.y, 84) / RAD));
    p.kneeR = 0;
    p.hipL = r1(90 - Math.atan2(MAT - 12.5 - P.hipJL.y, 84) / RAD + lift);
    p.kneeL = 0;
    p.props = ['mat'];
    return p;
  };
  add('side-lying-abd-down', straight(0));
  add('side-lying-abd-up', straight(32));
  // side-lying ER (top = left arm, elbow at the side, forearm rotates from belly to ceiling)
  const er = (fore, len) => { const p = legsBent(slBase({ shoulderL: 90, elbowL: fore - 90, forearmLenL: len, upperArmLenL: 1 }), 0); p.props = ['mat']; return p; };
  add('side-lying-er-start', er(0, 0.95));
  add('side-lying-er-end', er(180, 1));
}
// elevated side plank (right forearm on a step, feet on the floor)
{
  const p = front('lying', { root: { x: 100, y: 100 }, trunk: -66, hipL: 66, hipR: -66, kneeL: 0, kneeR: 0, shoulderR: 0, elbowR: 90, shoulderL: 180, elbowL: 0 });
  ground(p, FLOOR, ['legL', 'legR']);
  const P = pts(p);
  p.props = [{ type: 'step', x: r1(P.elbowR.x - 8), w: 40, top: r1(P.elbowR.y + 3.25) }];
  add('side-plank-elevated', p);
  const d = clone(p); d.trunk = -76; d.hipL = 80; d.hipR = -80;
  // hips sag toward the floor; elbow stays on the step
  d.root.x = p.root.x; d.root.y = p.root.y;
  const Q = pts(d); d.root.x = r1(d.root.x + P.elbowR.x - Q.elbowR.x); d.root.y = r1(d.root.y + P.elbowR.y - Q.elbowR.y);
  add('side-plank-elevated-down', d);
}

// ---------------------------------------------------------------- prone (seen from above)
const prone = (o) => front('lying', { camera: 'top', root: { x: 100, y: 110 }, hipL: 3, hipR: 3, props: ['mat'], ...o });
add('prone-arms-down', prone({ shoulderL: 12, shoulderR: 12 }));
add('prone-t', prone({ shoulderL: 90, shoulderR: 90 }));
add('prone-y', prone({ shoulderL: 135, shoulderR: 135 }));
add('prone-w', prone({ shoulderL: 55, shoulderR: 55, elbowL: 85, elbowR: 85 }));
add('lying-prone', ground(side('lying', { root: { x: 90, y: 100 }, trunk: 90, hipL: -90, hipR: -90, shoulderL: -90, shoulderR: -90, elbowL: 0, elbowR: 0, ankleL: 90, ankleR: 90 }), MAT));

// ---------------------------------------------------------------- upper body standing
add('front-arms-forward', ground(front('standing', { shoulderL: 22, shoulderR: 22, upperArmLenL: 0.3, upperArmLenR: 0.3, forearmLenL: 0.3, forearmLenR: 0.3, elbowL: 0, elbowR: 0 }), FLOOR));
add('front-arms-apart', ground(front('standing', { shoulderL: 90, shoulderR: 90, upperArmLenL: 1, upperArmLenR: 1, forearmLenL: 1, forearmLenR: 1, elbowL: 0, elbowR: 0 }), FLOOR));
add('pull-apart-start', clone(poses['front-arms-forward']));
add('pull-apart-end', clone(poses['front-arms-apart']));
// wall slide (front, back to the wall)
add('wall-slide-down', ground(front('standing', { shoulderL: 75, shoulderR: 75, elbowL: 95, elbowR: 95, props: ['wall'] }), FLOOR));
add('wall-slide-up', ground(front('standing', { shoulderL: 155, shoulderR: 155, elbowL: 15, elbowR: 15, props: ['wall'] }), FLOOR));
// ER at 0° (right arm, band to the left side)
add('er0-start', ground(front('standing', { shoulderL: 6, shoulderR: 6, elbowL: 0, elbowR: -90, forearmLenR: 0.9 }), FLOOR));
add('er0-end', ground(front('standing', { shoulderL: 6, shoulderR: 6, elbowL: 0, elbowR: 75, forearmLenR: 0.8 }), FLOOR));
// ER 90/90 (side view: upper arm toward the viewer, forearm forward → up)
add('er9090-side-start', ground(side('standing', { shoulderR: 90, upperArmLenR: 0.18, elbowR: 0, shoulderL: 8, elbowL: 10 }), FLOOR));
add('er9090-side-end', ground(side('standing', { shoulderR: 90, upperArmLenR: 0.18, elbowR: 90, shoulderL: 8, elbowL: 10 }), FLOOR));
// face pull (side view)
add('face-pull-start', ground(side('standing', { trunk: -2, shoulderL: 82, shoulderR: 82, elbowL: 0, elbowR: 0, upperArmLenL: 1, upperArmLenR: 1, hipL: -8, hipR: 8 }), FLOOR));
add('face-pull-end', ground(side('standing', { trunk: -2, shoulderL: -95, shoulderR: -95, elbowL: -95, elbowR: -95, upperArmLenL: 0.4, upperArmLenR: 0.4, hipL: -8, hipR: 8 }), FLOOR));
// lat pulldown (front)
add('lat-pulldown-standing-start', ground(front('standing', { shoulderL: 160, shoulderR: 160, elbowL: 8, elbowR: 8 }), FLOOR));
add('lat-pulldown-standing-end', ground(front('standing', { shoulderL: 55, shoulderR: 55, elbowL: 115, elbowR: 115 }), FLOOR));
// straight-arm pulldown (side, slight hinge)
{
  const mk = (sh) => { const p = side('standing', { trunk: 18, hipL: 10, hipR: 10, kneeL: 18, kneeR: 18, shoulderL: sh, shoulderR: sh, elbowL: 5, elbowR: 5 }); flat(p); return ground(p, FLOOR); };
  add('straight-arm-pulldown-start', mk(115));
  add('straight-arm-pulldown-end', mk(-8));
}
// rows standing (side)
{
  const mk = (o) => ground(side('standing', { trunk: 3, hipL: -8, hipR: 8, ...o }), FLOOR);
  add('row-standing-start', mk({ shoulderL: 80, shoulderR: 80, elbowL: 0, elbowR: 0 }));
  add('row-standing-end', mk({ shoulderL: -35, shoulderR: -35, elbowL: 115, elbowR: 115 }));
}
// archery (front view; target to the viewer's right; bow arm = left)
const stance = { hipL: 7, hipR: 7 };
add('archery-stance', ground(front('standing', { ...stance, shoulderL: 8, shoulderR: 8, props: ['bow'] }), FLOOR));
add('archery-set', ground(front('standing', { ...stance, shoulderL: 90, elbowL: 0, shoulderR: -88, elbowR: 0, upperArmLenR: 0.55, forearmLenR: 0.95, props: ['bow'] }), FLOOR));
add('archery-full-draw', ground(front('standing', { ...stance, shoulderL: 90, elbowL: 0, shoulderR: 96, elbowR: 166, upperArmLenR: 1, forearmLenR: 1, props: ['bow'] }), FLOOR));
add('mirror-draw-start', ground(front('standing', { ...stance, shoulderL: 90, elbowL: 0, shoulderR: -88, elbowR: 0, upperArmLenR: 0.55, forearmLenR: 0.95 }), FLOOR));
add('mirror-draw-end', ground(front('standing', { ...stance, shoulderL: 90, elbowL: 0, shoulderR: 96, elbowR: 166, upperArmLenR: 1, forearmLenR: 1 }), FLOOR));
add('high-row-stance-start', handsOnHips(ground(front('standing', { ...stance, shoulderL: 22, elbowL: -70, shoulderR: -85, elbowR: 0, upperArmLenR: 0.5, forearmLenR: 0.95 }), FLOOR), ['L']));
add('high-row-stance-end', handsOnHips(ground(front('standing', { ...stance, shoulderL: 22, elbowL: -70, shoulderR: 92, elbowR: 150, upperArmLenR: 1, forearmLenR: 1 }), FLOOR), ['L']));
// bow-arm wall push (side view, left arm forward against a wall)
{
  const p = ground(side('standing', { trunk: -2, shoulderL: 90, elbowL: 0, shoulderR: 5, elbowR: 15, hipL: 0, hipR: 0 }), FLOOR);
  p.props = [{ type: 'wall', x: r1(pts(p).handL.x + 4.5), facing: -1 }];
  add('bow-arm-wall-push', p);
}
// pallof press (front, band from the viewer's right)
add('pallof-press-start', ground(front('standing', { hipL: 8, hipR: 8, kneeL: 0, kneeR: 0, shoulderL: 18, shoulderR: 18, elbowL: -112, elbowR: -112, upperArmLenL: 1, upperArmLenR: 1, forearmLenL: 0.82, forearmLenR: 0.82 }), FLOOR));
add('pallof-press-end', ground(front('standing', { hipL: 8, hipR: 8, kneeL: 0, kneeR: 0, shoulderL: 28, shoulderR: 28, elbowL: -60, elbowR: -60, upperArmLenL: 0.35, upperArmLenR: 0.35, forearmLenL: 0.35, forearmLenR: 0.35 }), FLOOR));
// thoracic extension over the chair backrest, hands behind the head
{
  const mk = (T, tilt) => {
    const p = flat(side('sitting', { root: { x: 92, y: seatY }, trunk: T, headTilt: tilt, hipL: 90, hipR: 90, kneeL: 90, kneeR: 90 }));
    const P = pts(p);
    const back = { x: P.head.x - Math.cos(T * RAD) * 9, y: P.head.y - Math.sin(T * RAD) * 9 + 2 };
    aim(p, 'armR', back, (j2, el) => el.x > P.neck.x);
    p.shoulderL = p.shoulderR; p.elbowL = p.elbowR;
    p.props = [{ type: 'chair', x: chairX, y: SEAT, facing: 1 }];
    return p;
  };
  const st = mk(8, 18);
  add('thoracic-ext-chair-start', st);
  // the arms travel with the upper body: same arm angles relative to the trunk
  const en = mk(-22, -18);
  en.shoulderL = en.shoulderR = st.shoulderR + (-22 - 8); en.elbowL = en.elbowR = st.elbowR;
  add('thoracic-ext-chair-end', en);
}
// seated rotation (front, arms crossed on the chest)
{
  const mk = (tw) => {
    const p = front('sitting', { hipL: 80, hipR: 80, thighLenL: 0.25, thighLenR: 0.25, kneeL: 80, kneeR: 80, twist: tw, props: [{ type: 'chair' }] });
    ground(p, FLOOR, ['legL', 'legR']);
    const P = pts(p);
    aim(p, 'armL', { x: P.shoulderR.x + 4, y: P.shoulderR.y + 10 }, (e) => e < 0);
    aim(p, 'armR', { x: P.shoulderL.x - 4, y: P.shoulderL.y + 16 }, (e) => e < 0);
    return p;
  };
  add('seated-rotation-start', mk(0));
  add('seated-rotation-end', mk(45));
}
// doorway stretch (side view, forearm on the frame behind, lunge forward)
{
  const p = side('standing', { trunk: 10, hipL: -14, kneeL: 4, hipR: 26, kneeR: 28, shoulderR: -90, upperArmLenR: 0.4, elbowR: -90, shoulderL: 10, elbowL: 15 });
  flat(p);
  ground(p, FLOOR);
  p.props = [{ type: 'door', x: r1(pts(p).handR.x - 3), y: r1(pts(p).handR.y + 10), knot: false }];
  add('doorway-stretch', p);
}


// ================================================================ WP-Content requests (docs/POSE_REQUESTS.md)
const alias = (id, src, mod) => { const p = clone(poses[src]); if (mod) mod(p); return add(id, p); };
const atFoot = (p, ref, s = 'R') => { p.root.x = r1(p.root.x + pts(ref)['foot' + s].x - pts(p)['foot' + s].x); return p; };
/** front view: mirror image with left/right swapped (e.g. lying on the other side) */
function mirrorFront(p) {
  const q = clone(p);
  for (const k of Object.keys(p)) {
    const m = k.match(/^(.*)([LR])$/);
    if (m && typeof p[k] === 'number') q[m[1] + (m[2] === 'L' ? 'R' : 'L')] = p[k];
  }
  q.trunk = -p.trunk; if (p.twist) q.twist = -p.twist;
  q.root = { x: 200 - p.root.x, y: p.root.y };
  if (q.props) q.props = q.props.map((x) => (typeof x === 'object' && x.x !== undefined ? { ...x, x: 200 - x.x } : x));
  return q;
}
// high sitting
{
  const high = (kL, kR) => {
    const p = flat(side('sitting', { root: { x: 92, y: seatY - 12 }, trunk: 0, hipL: 90, hipR: 90, kneeL: kL, kneeR: kR, shoulderL: 8, shoulderR: 8, elbowL: 0, elbowR: 0 }));
    p.props = [{ type: 'chair', x: chairX, y: SEAT - 12, facing: 1, back: false }, { type: 'cushion', x: chairX, y: SEAT - 15, w: 30, h: 6 }];
    return p;
  };
  add('sit-high-hang', high(90, 90));
  add('sit-high-swing', high(35, 90));
}
add('stand-arms-overhead', ground(side('standing', { shoulderL: 168, shoulderR: 168, elbowL: 0, elbowR: 0 }), FLOOR));
{
  const seated = (o) => { const p = flat(side('sitting', { root: { x: 92, y: seatY }, hipL: 90, hipR: 90, kneeL: 90, kneeR: 90, ...o })); p.props = [{ type: 'chair', x: chairX, y: SEAT, facing: 1 }]; return p; };
  const hands = (p) => { const P = pts(p); aim(p, 'armR', { x: P.kneeR.x - 12, y: P.kneeR.y - 6 }, (e) => e >= 0); p.shoulderL = p.shoulderR; p.elbowL = p.elbowR; return p; };
  add('sit-round-back', hands(seated({ trunk: 25, headTilt: 25 })));
  add('sit-chest-open', seated({ trunk: -5, headTilt: -8, shoulderL: -10, shoulderR: -10, elbowL: 30, elbowR: 30 }));
  // seated row / lat pulldown on a chair
  add('sit-row-start', seated({ trunk: 0, shoulderL: 85, shoulderR: 85, elbowL: 0, elbowR: 0 }));
  add('sit-row-end', seated({ trunk: -3, shoulderL: -28, shoulderR: -28, elbowL: 105, elbowR: 105 }));
  add('sit-arms-overhead', seated({ trunk: 0, shoulderL: 165, shoulderR: 165, elbowL: 10, elbowR: 10 }));
  add('sit-pulldown-end', seated({ trunk: -4, shoulderL: 25, shoulderR: 25, elbowL: 130, elbowR: 130 }));
  add('sit-knee-ext', seated({ trunk: -3, kneeL: 10, shoulderL: 15, shoulderR: 15, elbowL: 20, elbowR: 20 }));
  add('sit-leg-forward', (() => { const p = seated({ trunk: -3, hipL: 85, kneeL: 20, shoulderL: 15, shoulderR: 15, elbowL: 20, elbowR: 20 }); return p; })());
  add('sit-knee-60', seated({ trunk: -3, hipL: 85, kneeL: 60, shoulderL: 15, shoulderR: 15, elbowL: 20, elbowR: 20 }));
  // hamstring stretch on the front edge of the chair
  {
    const p = flat(side('sitting', { root: { x: 100, y: seatY }, trunk: 30, hipL: 70, kneeL: 5, hipR: 90, kneeR: 90, ankleL: -10 }));
    solve(p, 'hipL', 50, 90, (q) => pts(q).footL.y + 4.25 - FLOOR);
    p.ankleL = -10;
    const P = pts(p);
    aim(p, 'armR', { x: P.kneeR.x - 6, y: P.kneeR.y - 6 }, (e) => e >= 0);
    p.shoulderL = p.shoulderR; p.elbowL = p.elbowR;
    p.props = [{ type: 'chair', x: r1(p.root.x - 12), y: SEAT, facing: 1 }];
    add('sit-hamstring-stretch', p);
  }
  // hands behind head (thoracic extension over the backrest)
  alias('sit-hands-head', 'thoracic-ext-chair-start');
  alias('sit-thoracic-ext', 'thoracic-ext-chair-end');
}
alias('front-sit-arms-crossed', 'seated-rotation-start');
alias('front-sit-rotate', 'seated-rotation-end');
// TKE
alias('stand-tke-bent', 'tke-start');
alias('stand-tke-straight', 'tke-end');
// wall sit (back to the wall)
{
  const mk = (k) => {
    const p = flat(side('standing', { trunk: 0, hipL: k, hipR: k, kneeL: k, kneeR: k, shoulderL: 8, shoulderR: 8, elbowL: 10, elbowR: 10 }));
    ground(p, FLOOR);
    return p;
  };
  const up = mk(10);
  const wallX = r1(pts(up).hip.x - 7.5 - 3);
  // feet stay; the back slides down the wall
  const down = mk(40);
  down.root.x = r1(up.root.x);
  // keep the back on the wall: shift the hip back to the wall, then re-solve shin so feet stay put
  for (const p of [up, down]) p.props = [{ type: 'wall', x: wallX }];
  {
    const footX = pts(up).footR.x;
    // solve hip angle (with knee = hip + shin) so feet stay at footX while the hip stays at the wall
    let best = null;
    for (let h = 30; h <= 70; h += 0.25) for (let k = 30; k <= 90; k += 0.25) {
      const q = clone(down); q.hipL = q.hipR = h; q.kneeL = q.kneeR = k; flat(q); ground(q, FLOOR);
      const P = pts(q); const err = Math.abs(P.footR.x - footX) + Math.abs(P.hip.x - pts(up).hip.x) * 0 + Math.abs(k - 40) * 0.02 + Math.abs(P.hip.x - up.root.x);
      if (!best || err < best.err) best = { err, q };
    }
    best.q.root.x = up.root.x;
    add('stand-wall-upright', up);
    add('stand-wall-sit', best.q);
  }
}
// sit to stand from a raised chair: feet are where the standing pose has them
{
  const fin = poses.stand;
  const p = flat(side('sitting', { trunk: 30, hipL: 75, hipR: 75, kneeL: 65, kneeR: 65, shoulderL: 80, shoulderR: 80, elbowL: 0, elbowR: 0 }));
  ground(p, FLOOR, ['legL', 'legR']);
  atFoot(p, fin);
  const cy = r1(pts(p).hip.y + 5.25);
  const chair = { type: 'chair', x: r1(p.root.x - 2), y: cy, facing: 1 };
  p.props = [chair, { type: 'cushion', x: chair.x, y: cy - 3, w: 30, h: 6 }];
  add('sit-chair-high', p);
  const m = flat(side('standing', { trunk: 35, hipL: 45, hipR: 45, kneeL: 40, kneeR: 40, shoulderL: 80, shoulderR: 80, elbowL: 0, elbowR: 0 }));
  // anatomical consistency: knee flexion = hip flexion + shin forward tilt; keep given values, ground by the feet
  ground(m, FLOOR); atFoot(m, fin);
  m.props = p.props;
  add('stand-from-chair-mid', m);
}
add('stand-mini-squat', (() => { const p = flat(side('standing', { trunk: 25, hipL: 45, hipR: 45, kneeL: 50, kneeR: 50, shoulderL: 90, shoulderR: 90, elbowL: 0, elbowR: 0 })); ground(p, FLOOR); atFoot(p, poses.stand); return p; })());
// step-up with the left leg
{
  const stepX = 128;
  const start = side('standing', { trunk: 10, hipL: 40, kneeL: 50, hipR: -10, kneeR: 3, shoulderL: -10, shoulderR: 18, elbowL: 20, elbowR: 20 });
  flat(start); ground(start, FLOOR, ['legR']);
  start.root.x = r1(start.root.x + stepX - pts(start).footL.x - 2);
  solve(start, 'hipL', 20, 90, (q) => pts(q).footL.y + 4.25 - STEP);
  start.kneeL = r1(start.kneeL); flat(start);
  start.props = [{ type: 'step', x: stepX, w: 52 }];
  add('stand-step-left-up', start);
  const top = side('standing', { trunk: 2, hipL: 0, kneeL: 0, hipR: 5, kneeR: 30, shoulderL: 12, shoulderR: 12, elbowL: 15, elbowR: 15 });
  flat(top, 'L'); ground(top, STEP, ['legL']);
  top.root.x = r1(top.root.x + stepX - pts(top).footL.x - 2);
  top.props = start.props;
  add('stand-step-top', top);
}
// lateral step-down, front view (stance left on the step)
{
  const mk = (drop) => {
    const p = front('standing', { hipL: 3, hipR: 5, kneeL: 0, kneeR: 10 - drop * 0.25, thighLenL: 1 - drop * 0.006, shinLenL: 1 - drop * 0.0015, shoulderL: 28, shoulderR: 28, elbowL: 0, elbowR: 0 });
    ground(p, STEP, ['legL']);
    p.props = [{ type: 'step', x: r1(pts(p).footL.x + 8), w: 40 }];
    return p;
  };
  const a = mk(0); add('front-step-single', a);
  const b = mk(40); b.props = a.props; b.root.x = r1(b.root.x + pts(a).footL.x - pts(b).footL.x); add('front-step-down', b);
}
// glute bridge
{
  const d = hook({}, ['L', 'R'], 80);
  add('lying-bridge-down', d);
  const u = bridgeUp(d); u.hipL = u.hipR; u.kneeL = u.kneeR; flat(u);
  add('lying-bridge-up', u);
}
// side-lying (right side down, left on top) — front view
alias('sidelying-clam-closed', 'clamshell-closed');
alias('sidelying-clam-open', 'clamshell-open');
{
  // bottom leg slightly bent
  const mk = (lift) => {
    const p = clone(poses['side-lying-abd-down']);
    p.hipL = r1(poses['side-lying-abd-down'].hipL + lift);
    p.thighLenR = 0.86; p.shinLenR = 0.95; // bottom knee slightly bent toward the viewer (foreshortened)
    return p;
  };
  add('sidelying-abd-down', mk(0));
  add('sidelying-abd-up', mk(30));
}
// side-lying ER on the LEFT side (right arm on top) = mirrored image
add('sidelying-er-down', mirrorFront(poses['side-lying-er-start']));
add('sidelying-er-up', (() => { const q = mirrorFront(poses['side-lying-er-end']); q.elbowR = -q.elbowR + 2 * q.elbowR - 20; return q; })());
// soft standing, lateral band walk, standing hip abduction with chair
{
  const soft = (o) => ground(front('standing', { hipL: 6, hipR: 6, thighLenL: 0.96, thighLenR: 0.96, shinLenL: 0.99, shinLenR: 0.99, shoulderL: 14, shoulderR: 14, elbowL: 0, elbowR: 0, ...o }), FLOOR);
  add('front-stand-soft', soft());
  const w = soft({ hipR: 20 });
  w.root.x = r1(w.root.x + pts(poses['front-stand-soft']).footL.x - pts(w).footL.x);
  add('front-band-walk-wide', w);
  const ab = ground(front('standing', { hipL: 3, hipR: 25, thighLenL: 0.99, shoulderL: 30, elbowL: 0, shoulderR: 14, elbowR: 0 }), FLOOR, ['legL']);
  const P = pts(ab);
  const chair = { type: 'chair', x: r1(P.hipJL.x + 46), y: SEAT };
  aim(ab, 'armL', { x: chair.x - 10, y: SEAT - 48 }, (e) => e <= 0);
  ab.props = [chair, { type: 'door', x: r1(P.footL.x + 24), y: FLOOR - 10 }];
  ab.root.x = r1(ab.root.x + pts(poses['front-stand-soft']).footL.x - P.footL.x);
  // props are relative to the figure; shift with it
  const dx = pts(ab).footL.x - P.footL.x;
  ab.props = ab.props.map((x) => ({ ...x, x: r1(x.x + dx) }));
  add('front-hip-abd-right', ab);
}
// holding a chair (side), hip extension, calf raise
{
  const hold = side('standing', { trunk: 3, shoulderL: 40, shoulderR: 40, elbowL: 30, elbowR: 30 });
  ground(hold, FLOOR);
  const P = pts(hold);
  const chair = { type: 'chair', x: r1(P.handR.x + 16), y: r1(Math.max(SEAT, P.handR.y + 3.25 + 48)), facing: 1 };
  // put the hands on the backrest top
  chair.y = SEAT; chair.x = r1(P.handR.x + 12);
  aim(hold, 'armR', { x: chair.x - 16, y: SEAT - 48 - 4 }, (e) => e >= 0);
  hold.shoulderL = hold.shoulderR; hold.elbowL = hold.elbowR;
  hold.props = [chair];
  add('stand-hold-chair', hold);
  const ext = side('standing', { trunk: 5, hipL: 0, kneeL: 5, hipR: -20, kneeR: 0, shoulderL: hold.shoulderR, shoulderR: hold.shoulderR, elbowL: hold.elbowR, elbowR: hold.elbowR });
  flat(ext, 'L'); ground(ext, FLOOR, ['legL']);
  ext.root.x = r1(ext.root.x + pts(hold).footL.x - pts(ext).footL.x);
  ext.props = [chair];
  add('stand-hip-ext-right', ext);
  const cr = clone(hold); cr.ankleL = cr.ankleR = 40; ground(cr, FLOOR);
  add('stand-calf-raise', cr);
}
// single leg stance (left)
add('stand-single-left', (() => { const p = flat(side('standing', { hipL: 3, kneeL: 5, hipR: 30, kneeR: 60, shoulderL: 25, shoulderR: 25, elbowL: 10, elbowR: 10 }), 'L'); return ground(p, FLOOR, ['legL']); })());
{
  const p = flat(side('standing', { trunk: 10, hipL: 14, kneeL: 28, hipR: 30, kneeR: 0, shoulderL: 30, shoulderR: 30, elbowL: 10, elbowR: 10 }), 'L');
  ground(p, FLOOR, ['legL']);
  p.ankleR = 20;
  solve(p, 'hipR', 2, 60, (q) => pts(q).toeR.y + 3 - (FLOOR - 0.5));
  add('stand-single-tap', p);
}
// prone Y/T/W: shown from above (reads far better than a side view)
alias('prone-arms-y', 'prone-y');
alias('prone-arms-t', 'prone-t');
alias('prone-arms-w', 'prone-w');
// wall slides facing the wall
{
  const lo = ground(side('standing', { trunk: 0, shoulderL: 90, shoulderR: 90, elbowL: 90, elbowR: 90 }), FLOOR);
  const wx = r1(pts(lo).elbowR.x + 4.5);
  lo.props = [{ type: 'wall', x: wx, facing: -1 }];
  add('stand-wall-slide-low', lo);
  const hi = ground(side('standing', { trunk: 0, shoulderL: 160, shoulderR: 160, elbowL: 20, elbowR: 20 }), FLOOR);
  // keep the hands on the wall plane: shift so the hand touches the wall
  hi.root.x = lo.root.x;
  hi.props = lo.props;
  add('stand-wall-slide-high', hi);
}
// serratus punch standing, band to an anchor behind
{
  const mk = (sh, el, tr) => { const p = flat(side('standing', { trunk: tr, hipL: 10, hipR: -10, kneeL: 8, kneeR: 8, shoulderR: sh, elbowR: el, shoulderL: 5, elbowL: 15 })); return ground(p, FLOOR); };
  const a = mk(85, 45, 0); const b = mk(90, 0, 5); b.reachR = 5;
  for (const p of [a, b]) p.props = [{ type: 'door', x: 12, y: 62 }];
  add('stand-arm-forward-bent', a);
  add('stand-arm-forward-reach', b);
}
// ER with towel (front)
{
  const a = clone(poses['er0-start']); const b = clone(poses['er0-end']);
  const P = pts(a);
  const towel = { type: 'towel', x: r1(P.elbowR.x + 5.5), y: r1(P.elbowR.y - 2), r: 3.6 };
  a.props = [towel]; b.props = [towel];
  add('front-er-neutral', a); add('front-er-out', b);
}
// ER 90/90 front view: forearm grows from pointing at the viewer to vertical
add('front-er9090-start', ground(front('standing', { shoulderR: 90, elbowR: 90, forearmLenR: 0.22, shoulderL: 8, elbowL: 0 }), FLOOR));
add('front-er9090-end', ground(front('standing', { shoulderR: 90, elbowR: 90, forearmLenR: 1, shoulderL: 8, elbowL: 0 }), FLOOR));
// face pull (start forward-up)
add('stand-facepull-start', ground(side('standing', { trunk: -2, shoulderL: 115, shoulderR: 115, elbowL: 0, elbowR: 0, upperArmLenL: 1, upperArmLenR: 1, hipL: -8, hipR: 8 }), FLOOR));
add('stand-facepull-end', ground(side('standing', { trunk: -2, shoulderL: -100, shoulderR: -100, elbowL: -80, elbowR: -80, upperArmLenL: 0.38, upperArmLenR: 0.38, hipL: -8, hipR: 8 }), FLOOR));
// straight-arm pulldown (upright, soft knees)
{
  const mk = (sh) => { const p = flat(side('standing', { trunk: 4, hipL: 4, hipR: 4, kneeL: 10, kneeR: 10, shoulderL: sh, shoulderR: sh, elbowL: 5, elbowR: 5 })); return ground(p, FLOOR); };
  add('stand-arms-forward-high', mk(120));
  add('stand-arms-down', mk(-5));
}
// archery draw (front view, bow arm left)
add('front-draw-start', ground(front('standing', { ...stance, shoulderL: 90, elbowL: 0, shoulderR: -90, elbowR: 4, upperArmLenR: 0.92, forearmLenR: 1 }), FLOOR));
add('front-draw-anchor', ground(front('standing', { ...stance, shoulderL: 90, elbowL: 0, shoulderR: 94, elbowR: 158, upperArmLenR: 1, forearmLenR: 1 }), FLOOR));
add('front-draw-expand', ground(front('standing', { ...stance, shoulderL: 90, elbowL: 0, shoulderR: 98, elbowR: 163, upperArmLenR: 1, forearmLenR: 1, twist: -6 }), FLOOR));
// right arm push against the wall
{
  const p = ground(side('standing', { trunk: -2, shoulderR: 90, elbowR: 0, shoulderL: 5, elbowL: 15 }), FLOOR);
  p.props = [{ type: 'wall', x: r1(pts(p).handR.x + 4.5), facing: -1 }];
  add('stand-arm-push-wall', p);
}
// pallof press (side view per request: hands at sternum → pressed forward)
{
  const mk = (sh, el) => { const p = flat(side('standing', { hipL: 4, hipR: -4, kneeL: 10, kneeR: 10, shoulderL: sh, shoulderR: sh, elbowL: el, elbowR: el })); return ground(p, FLOOR); };
  add('stand-pallof-in', mk(20, 110));
  add('stand-pallof-out', mk(90, 0));
}
// dead bug (feet flat), band from hands to a low anchor behind the head
{
  const s = hook({ shoulderL: 180, shoulderR: 180, elbowL: 0, elbowR: 0 }, ['L', 'R'], 90);
  const P = pts(s);
  s.props = ['mat', { type: 'door', x: r1(P.head.x - 38), y: r1(MAT - 22) }];
  add('lying-deadbug-start', s);
  const r = clone(s); r.hipL = 90; r.kneeL = 0; delete r.ankleL;
  add('lying-deadbug-reach', r);
}
// side plank against a wall (front view), right forearm on the wall, left hand on the hip
{
  const p = front('standing', { trunk: -20, hipL: 20, hipR: -20, kneeL: 0, kneeR: 0, shoulderR: 92, elbowR: 88 });
  ground(p, FLOOR, ['legL', 'legR']);
  const P = pts(p);
  aim(p, 'armL', { x: P.hipJL.x + 2, y: P.hipJL.y - 4 }, (e) => e < 0);
  p.props = [{ type: 'wall', x: r1(Math.min(P.elbowR.x, P.handR.x) - 4.5), facing: 1 }];
  add('front-side-plank-wall', p);
}
// doorway stretch, calf stretch
alias('stand-doorway-stretch', 'doorway-stretch');
{
  const p = side('standing', { trunk: 15, hipR: 25, kneeR: 20, hipL: -20, kneeL: 0, shoulderL: 80, shoulderR: 80, elbowL: 15, elbowR: 15 });
  flat(p); ground(p, FLOOR);
  p.props = [{ type: 'wall', x: r1(Math.max(pts(p).handR.x, pts(p).toeR.x + 2) + 4.5), facing: -1 }];
  add('stand-calf-stretch', p);
}

alias('er9090-start', 'front-er9090-start');
alias('er9090-end', 'front-er9090-end');
// flagged by WP-Content: serratus punch is standing, lat pulldown is seated
alias('serratus-punch-start', 'stand-arm-forward-bent');
alias('serratus-punch-end', 'stand-arm-forward-reach');
alias('lat-pulldown-start', 'sit-arms-overhead');
alias('lat-pulldown-end', 'sit-pulldown-end');

// lying with the neck lower than the hips (bridges): tilt the head back to the mat
for (const p of Object.values(poses)) {
  if (p.view === 'side' && p.ground === 'lying' && p.trunk < -92) p.headTilt = r1(-90 - p.trunk);
}

const out = { version: 1, segments: { trunk: 50, thigh: 42, shin: 42, upperArm: 30, forearm: 28, head: 10, foot: 10 }, poses };
writeFileSync(`${repo}/data/poses.json`, formatJson(out));
console.log(Object.keys(poses).length, 'poses');

function formatJson(o) {
  const lines = Object.entries(o.poses).map(([id, p]) => `    ${JSON.stringify(id)}: ${JSON.stringify(p)}`);
  return `{\n  "version": 1,\n  "segments": ${JSON.stringify(o.segments)},\n  "poses": {\n${lines.join(',\n')}\n  }\n}\n`;
}
