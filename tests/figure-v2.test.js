// v2 figures: rowing machine prop + rowing cycle, crutch-prep and post-op poses, loop playback,
// support of every seated pose (chair seat / rower seat / mat / feet on the floor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computePoints, poseAt, lockFeet, buildScene, figureSvg, figureSpecForExercise, FLOOR, MAT_H, SEAT_Y,
} from '../js/components/pt-figure.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const { poses, segments } = load('poses');
const exercises = load('exercises').exercises;
const ex = (id) => exercises.find((e) => e.id === id);
const pts = (p) => computePoints(p, segments);
const HIP_R = 4.25 + 1; // hip joint sits this far above a seat surface (leg radius, sinks 1px)
const TOL = 2.5;
const deg = (v) => Math.atan2(v.x, v.y) * 180 / Math.PI; // direction from straight down

const ROW = ['row-catch', 'row-drive', 'row-finish', 'row-recovery'];
const ROWING_EX = ['row-technique-warmup', 'row-steady', 'row-intervals', 'row-endurance', 'row-cooldown'];
const rowerOf = (p) => (p.props || []).find((x) => x?.type === 'rower');

test('rowing exercises use the dedicated rowing cycle on the rowing machine', () => {
  for (const id of ROWING_EX) {
    const f = ex(id).figure;
    assert.deepEqual(f.poses, ROW, id);
    assert.equal(f.loop, true, `${id} plays as a cycle`);
    const spec = figureSpecForExercise(ex(id), 0);
    assert.equal(spec.loop, true);
    assert.equal(spec.tempo, '2-0-1', `${id}: drive 1 s, recovery 2 s`);
    const svg = figureSvg({ ...spec, poses: f.poses.map((k) => poses[k]), segments }, { pair: true });
    assert.match(svg, /fig-rower/);
    assert.match(svg, /fig-strap/, 'strap from the hands to the flywheel');
    assert.ok(!/NaN|undefined/.test(svg));
  }
});

test('rowing poses: seated on the rower seat, feet on the foot stretcher, seat on the rail', () => {
  const r0 = rowerOf(poses['row-catch']);
  assert.ok(r0, 'row poses carry the rower prop');
  for (const id of ROW) {
    const p = poses[id];
    const r = rowerOf(p);
    assert.deepEqual(r, r0, `${id}: same machine in every keyframe`);
    assert.equal(p.ground, 'sitting');
    const P = pts(p);
    assert.ok(Math.abs(P.hip.y + HIP_R - r.seat) <= 0.6, `${id}: hip on the seat (${(P.hip.y + HIP_R).toFixed(1)} vs ${r.seat})`);
    assert.ok(P.hip.x > r.x0 + 10 && P.hip.x < r.foot.x - 20, `${id}: seat stays on the rail`);
    for (const s of ['L', 'R']) {
      assert.ok(Math.hypot(P['foot' + s].x - r.foot.x, P['foot' + s].y - r.foot.y) <= 0.8, `${id}: foot${s} on the stretcher`);
      const sole = deg({ x: P['toe' + s].x - P['foot' + s].x, y: P['toe' + s].y - P['foot' + s].y });
      assert.ok(Math.abs(sole - r.foot.a) <= 2, `${id}: sole along the foot plate (${sole.toFixed(1)}°)`);
      assert.ok(p['knee' + s] >= 0 && p['knee' + s] <= 145, `${id}: knee${s} ${p['knee' + s]}`);
    }
    // machine geometry: seat above the rail, rail and housing above the floor, strap exit in front of the feet
    assert.ok(r.seat < r.rail && r.rail < FLOOR - 10 && r.exit.x > r.foot.x && r.x1 > r.foot.x);
    assert.ok(P.handR.x < r.exit.x, `${id}: hands behind the strap exit`);
  }
});

test('rowing technique: catch, drive, finish, recovery', () => {
  const [c, d, f, rc] = ROW.map((id) => poses[id]);
  const Pc = pts(c);
  const shin = deg({ x: Pc.footR.x - Pc.kneeR.x, y: Pc.footR.y - Pc.kneeR.y });
  assert.ok(Math.abs(shin) <= 6, `catch: shins ~vertical (${shin.toFixed(1)}°)`);
  assert.ok(c.kneeR >= 115, `catch: knees deeply bent (${c.kneeR})`);
  assert.ok(c.trunk >= 15 && c.trunk <= 30, 'catch: slight forward lean (~1 o’clock)');
  for (const p of [c, d, rc]) assert.ok(p.elbowR <= 8, 'arms long at catch, drive and recovery');
  assert.ok(d.kneeR < c.kneeR && d.kneeR > f.kneeR, 'drive: legs pushing');
  assert.ok(f.kneeR <= 8, `finish: legs long (${f.kneeR})`);
  assert.ok(f.trunk <= -10 && f.trunk >= -20, `finish: lean back ~15° (${f.trunk})`);
  const Pf = pts(f);
  assert.ok(Pf.elbowR.x < Pf.neck.x && Pf.elbowR.x < Pf.hip.x + 2, 'finish: elbows behind the body');
  assert.ok(Pf.handR.y > Pf.neck.y + 15 && Pf.handR.y < Pf.hip.y - 15, 'finish: handle at the lower ribs');
  assert.ok(Pf.hip.x < pts(d).hip.x && pts(d).hip.x < Pc.hip.x, 'seat travels back during the drive');
  assert.ok(rc.trunk > 10 && rc.kneeR < c.kneeR, 'recovery: body over first, knees follow');
});

test('rowing cycle animation: feet locked, seat on the rail, handle clears the knees', () => {
  const k = ROW.map((id) => poses[id]);
  const r = rowerOf(k[0]);
  const spec = figureSpecForExercise(ex('row-steady'), 0);
  for (let t = 0; t < 3500; t += 15) {
    const p = lockFeet(poseAt(k, spec.tempo, t, { loop: true }), r.foot, segments);
    const P = pts(p);
    assert.ok(Math.hypot(P.footR.x - r.foot.x, P.footR.y - r.foot.y) < 0.05, `t=${t}: foot stays on the stretcher`);
    assert.ok(Math.abs(P.hip.y + HIP_R - r.seat) <= 0.6, `t=${t}: hip stays on the seat`);
    for (const s of ['L', 'R']) assert.ok(p['knee' + s] >= -1 && p['knee' + s] <= 145, `t=${t}: knee${s} ${p['knee' + s]}`);
    if (Math.abs(P.hands.x - P.kneeR.x) < 10) assert.ok(P.kneeR.y - P.hands.y >= 7.5, `t=${t}: handle passes over the knees`);
  }
});

test('poseAt loop: cycles forward through all keyframes', () => {
  const k = ROW.map((id) => poses[id]);
  const tempo = { ecc: 2000, pause: 0, con: 1000 };
  assert.equal(poseAt(k, tempo, 0, { loop: true }).root.x, k[0].root.x);
  assert.ok(Math.abs(poseAt(k, tempo, 1000, { loop: true }).root.x - k[2].root.x) < 1e-9, 'finish after the drive time');
  // during the recovery the recovery keyframe is passed (not the drive keyframe in reverse)
  const xs = [];
  for (let t = 1120; t <= 3120; t += 5) xs.push(poseAt(k, tempo, t, { loop: true }).kneeR);
  assert.ok(xs.some((v) => Math.abs(v - k[3].kneeR) < 1.5));
  assert.ok(Math.abs(poseAt(k, tempo, 3120, { loop: true }).kneeR - k[0].kneeR) < 1e-6, 'back to the catch');
  // without loop: unchanged ping-pong
  assert.equal(poseAt(k, tempo, 1000).kneeR, k[3].kneeR);
  // static pair shows catch and finish for a loop
  const svg = figureSvg({ poses: k, segments, loop: true }, { pair: true });
  assert.equal((svg.match(/class="fig-frame"/g) || []).length, 2);
  assert.ok(buildScene({ poses: k, segments, loop: true }).loop);
});

test('rower prop without parameters is laid out from the pose', () => {
  const p = { ...poses['row-catch'], props: undefined };
  const sc = buildScene({ poses: [p], segments, props: [{ type: 'rower' }] });
  const r = sc.props.find((x) => x.type === 'rower');
  assert.ok(r && Math.abs(pts(p).hip.y + HIP_R - r.seat) < 1e-6 && r.rail > r.seat);
  assert.match(sc.render(), /fig-rower-seat/);
});

// ---------------------------------------------------------------- crutch prep / post-op

const NEW = {
  'chair-dip': ['chair-dip-up', 'chair-dip-down'],
  'band-triceps-extension': ['stand-triceps-ext-start', 'stand-triceps-ext-end'],
  'seated-press-up': ['seated-press-up-down', 'seated-press-up-up'],
  'right-leg-sit-to-stand': ['sit-right-load', 'stand-from-chair-right-mid', 'stand-right-load'],
  'single-leg-stance-reach': ['stand-single-left-reach-start', 'stand-single-left-reach-forward', 'stand-single-left-reach-up'],
  'patella-mobilization': ['long-sit-patella-up', 'long-sit-patella-down'],
  'glute-set': ['supine-glute-relax', 'supine-glute-set'],
  'right-leg-band-press': ['supine-right-leg-tuck', 'supine-right-leg-press'],
  'ankle-pumps': ['supine-ankle-up', 'supine-ankle-down'],
};

test('v2 exercises use their dedicated poses', () => {
  for (const [id, list] of Object.entries(NEW)) assert.deepEqual(ex(id).figure.poses, list, id);
});

test('chair dip: hands on the front edge, elbows ≤ 75°, left leg long and unloaded', () => {
  const chair = poses['chair-dip-up'].props.find((x) => x.type === 'chair');
  const edge = chair.x + 16 * chair.facing;
  for (const id of NEW['chair-dip']) {
    const p = poses[id];
    const P = pts(p);
    for (const s of ['L', 'R']) {
      assert.ok(Math.abs(P['hand' + s].y + 3.25 - chair.y) <= 0.8, `${id}: hand${s} on the seat`);
      assert.ok(Math.abs(P['hand' + s].x - edge) <= 5, `${id}: hand${s} at the front edge`);
    }
    assert.ok(P.hip.x - 6.5 > edge, `${id}: buttocks in front of the seat`);
    assert.ok(p.kneeL <= 12, `${id}: left knee ~straight (${p.kneeL})`);
    assert.ok(Math.abs(P.footL.y + 4.25 - FLOOR) <= 0.6, `${id}: left heel rests on the floor`);
    assert.ok(Math.abs(P.footR.y + 4.25 - FLOOR) <= 0.6, `${id}: right foot on the floor`);
    assert.ok(P.footL.x > P.footR.x + 15, `${id}: left foot forward`);
  }
  assert.ok(poses['chair-dip-up'].elbowR <= 8);
  assert.ok(poses['chair-dip-down'].elbowR >= 45 && poses['chair-dip-down'].elbowR <= 75, 'small dip');
  assert.ok(Math.abs(poses['chair-dip-up'].kneeR - 90) <= 15, 'right knee ~90°');
  const Pd = pts(poses['chair-dip-down']);
  assert.ok(Pd.elbowR.x < Pd.neck.x, 'elbows point back');
});

test('seated press-up: hands on the armrests, buttocks lift off the seat, feet stay', () => {
  const [a, b] = NEW['seated-press-up'].map((id) => poses[id]);
  const chair = a.props.find((x) => x.type === 'chair');
  assert.ok(chair.arms > 0, 'chair with armrests');
  const Pa = pts(a), Pb = pts(b);
  for (const P of [Pa, Pb]) assert.ok(Math.abs(P.handR.y + 3.25 - (chair.y - chair.arms)) <= 0.8, 'hands on the armrest');
  assert.ok(Math.abs(Pa.hip.y + HIP_R - chair.y) <= 0.6, 'start: sitting');
  assert.ok(chair.y - (Pb.hip.y + HIP_R) >= 8, 'end: lifted');
  assert.ok(b.elbowR < a.elbowR - 20, 'arms extend');
  for (const s of ['L', 'R']) assert.ok(Math.hypot(Pa['foot' + s].x - Pb['foot' + s].x, Pa['foot' + s].y - Pb['foot' + s].y) < 1, 'feet stay planted');
});

test('right-leg sit to stand: right foot under the knee, left foot forward and lightly touching', () => {
  const ps = NEW['right-leg-sit-to-stand'].map((id) => poses[id]);
  const P0 = pts(ps[0]);
  for (const p of ps) {
    const P = pts(p);
    assert.ok(Math.abs(P.footR.x - P0.footR.x) < 0.6 && Math.abs(P.footR.y + 4.25 - FLOOR) <= 0.6, 'right foot planted');
    assert.ok(P.footL.x > P.footR.x + 15, 'left foot forward');
    const soleL = Math.max(P.footL.y + 4.25, P.toeL.y + 3);
    assert.ok(Math.abs(soleL - FLOOR) <= 1.5, 'left foot touches the floor');
  }
  assert.ok(Math.abs(P0.hip.y + HIP_R - SEAT_Y) <= 0.6, 'starts seated');
  const spec = figureSpecForExercise(ex('right-leg-sit-to-stand'), 0);
  assert.equal(spec.highlight, 'legR', 'right-side knee exercises highlight the right leg');
  assert.equal(spec.highlightLeftKnee, false);
});

test('single-leg stance reach: stands on the left leg, knee slightly bent, right foot off the floor', () => {
  const ps = NEW['single-leg-stance-reach'].map((id) => poses[id]);
  const x0 = pts(ps[0]).footL.x;
  for (const p of ps) {
    const P = pts(p);
    assert.ok(p.kneeL >= 3 && p.kneeL <= 15, 'soft left knee');
    assert.ok(Math.abs(P.footL.x - x0) < 0.6, 'stance foot stays');
    assert.ok(Math.max(P.footR.y + 4.25, P.toeR.y + 3) < FLOOR - 15, 'right foot lifted');
  }
  assert.ok(ps[2].shoulderR > ps[1].shoulderR && ps[1].shoulderR > ps[0].shoulderR, 'reach forward, then up');
});

test('lying / long-sitting post-op poses rest on the mat; left leg long', () => {
  const MAT = FLOOR - MAT_H;
  for (const id of [...NEW['patella-mobilization'], ...NEW['glute-set'], ...NEW['right-leg-band-press'], ...NEW['ankle-pumps']]) {
    const p = poses[id];
    const P = pts(p);
    const low = p.ground === 'lying' ? Math.max(P.head.y + 9.5, P.hip.y + 6.5, P.neck.y + 6.5) : P.hip.y + 6.5;
    assert.ok(Math.abs(low - MAT) <= TOL, `${id} rests on the mat (${low.toFixed(1)})`);
    assert.ok(p.kneeL <= 6, `${id}: left leg long (${p.kneeL})`);
    assert.ok(P.footL.y + 4.25 <= MAT + TOL && P.footL.y + 4.25 >= MAT - 6, `${id}: left heel on the mat`); // legs are thinner than the trunk
  }
  // patella: hands at the left knee, shown with the left leg in front
  for (const id of NEW['patella-mobilization']) {
    const P = pts(poses[id]);
    assert.ok(Math.hypot(P.handR.x - P.kneeL.x, P.handR.y - P.kneeL.y) < 8, `${id}: hands at the left knee`);
  }
  assert.equal(ex('patella-mobilization').figure.mirror, true);
  // band press: right knee to the chest, then pressed long
  const [t, pr] = NEW['right-leg-band-press'].map((id) => poses[id]);
  assert.ok(t.hipR > 180 && t.kneeR > 80, 'knee toward the chest');
  assert.ok(pr.kneeR <= 8 && pr.hipR > 110 && pr.hipR < 150, 'leg pressed forward-up');
  // ankle pumps move the ankle
  assert.ok(poses['supine-ankle-down'].ankleL - poses['supine-ankle-up'].ankleL >= 50);
});

// ---------------------------------------------------------------- support of all seated poses

test('poses: every seated figure is supported (chair/rower seat, cushion, mat, or feet on the floor)', () => {
  for (const [id, p] of Object.entries(poses)) {
    if (p.ground !== 'sitting' || p.camera === 'top' || p.view !== 'side') continue;
    const P = pts(p);
    const seats = [];
    for (const x of p.props || []) {
      if (x?.type === 'chair' && Number.isFinite(x.y)) seats.push(x.y);
      if (x?.type === 'rower') seats.push(x.seat);
      if (x?.type === 'cushion' && Number.isFinite(x.y)) seats.push(x.y - x.h / 2);
    }
    const onSeat = seats.some((y) => Math.abs(P.hip.y + HIP_R - y) <= TOL);
    const onMat = Math.abs(Math.max(P.hip.y + 6.5, P.footL.y + 4.25, P.footR.y + 4.25) - (FLOOR - MAT_H)) <= TOL; // long sitting
    const soles = ['L', 'R'].map((s) => Math.max(P['foot' + s].y + 4.25, P['toe' + s].y + 3));
    const onFeet = soles.some((y) => Math.abs(y - FLOOR) <= TOL);
    assert.ok(onSeat || onMat || onFeet, `${id} floats (hip ${(P.hip.y + HIP_R).toFixed(1)}, seats ${seats})`);
    assert.ok(Math.max(...soles) <= FLOOR + TOL, `${id}: feet through the floor`);
  }
});
