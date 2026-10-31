// <pt-figure> pure helpers + anatomical sanity checks for every pose in data/poses.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computePoints, interpolatePose, parseTempo, poseAt, figureSvg, buildScene, poseBounds,
  figureSpecForExercise, bandColor, normalizeHighlight, FLOOR, MAT_H,
} from '../js/components/pt-figure.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const posesFile = load('poses');
const { poses, segments } = posesFile;
const exercises = load('exercises').exercises;
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

test('computePoints: standing pose geometry', () => {
  const P = computePoints(poses.stand, segments);
  assert.deepEqual(P.hip, poses.stand.root);
  assert.ok(near(P.neck.y, P.hip.y - segments.trunk));
  assert.ok(near(P.kneeL.y, P.hip.y + segments.thigh));
  assert.ok(near(P.footR.y, P.hip.y + segments.thigh + segments.shin));
  assert.ok(P.toeR.x > P.footR.x, 'side view faces right');
  assert.ok(P.head.y < P.neck.y);
  for (const k of ['hip', 'neck', 'head', 'elbowL', 'elbowR', 'handL', 'handR', 'kneeL', 'kneeR', 'footL', 'footR', 'ankleL', 'shoulderL']) {
    assert.ok(Number.isFinite(P[k].x) && Number.isFinite(P[k].y), k);
  }
});

test('computePoints: knee flexion rotates the shin backward, elbow flexion forward/up', () => {
  const p = { ...poses.stand, hipR: 90, kneeR: 90, shoulderR: 0, elbowR: 90 };
  const P = computePoints(p, segments);
  assert.ok(near(P.footR.x, P.kneeR.x) && P.footR.y > P.kneeR.y, 'shin hangs down from a horizontal thigh');
  assert.ok(P.handR.x > P.elbowR.x, 'forearm points forward');
});

test('computePoints: front view puts left limbs on the viewer’s right', () => {
  const P = computePoints(poses['stand-front'], segments);
  assert.ok(P.handL.x > P.hip.x && P.handR.x < P.hip.x);
  assert.ok(P.hipJL.x > P.hipJR.x);
});

test('interpolatePose: endpoints and midpoint', () => {
  const a = poses['slr-down'];
  const b = poses['slr-up'];
  assert.equal(interpolatePose(a, b, 0).hipL, a.hipL);
  assert.equal(interpolatePose(a, b, 1).hipL, b.hipL);
  const m = interpolatePose(a, b, 0.5);
  assert.ok(near(m.hipL, (a.hipL + b.hipL) / 2));
  assert.ok(near(m.root.x, (a.root.x + b.root.x) / 2));
});

test('interpolatePose: foreshortened segments interpolate their projection', () => {
  // the arm sweeps from pointing right to pointing left through the camera: it shrinks in the middle
  const a = { ...poses['stand-front'], shoulderR: -90, elbowR: 0, upperArmLenR: 1 };
  const b = { ...poses['stand-front'], shoulderR: 90, elbowR: 0, upperArmLenR: 1 };
  const m = interpolatePose(a, b, 0.5);
  assert.ok(m.upperArmLenR < 0.05, `upper arm almost vanishes (${m.upperArmLenR})`);
  const P = computePoints(m, segments);
  assert.ok(Math.abs(P.elbowR.y - P.shoulderR.y) < 2, 'elbow stays at shoulder height');
});

test('parseTempo / poseAt', () => {
  assert.deepEqual(parseTempo('3-1-1'), { ecc: 3000, pause: 1000, con: 1000 });
  assert.deepEqual(parseTempo(null), { ecc: 2000, pause: 0, con: 2000 });
  assert.deepEqual(parseTempo('x'), { ecc: 2000, pause: 0, con: 2000 });
  const k = [poses['slr-down'], poses['slr-up']];
  assert.equal(poseAt(k, '2-1-2', 0).hipL, k[0].hipL);
  assert.equal(poseAt(k, '2-1-2', 2500).hipL, k[1].hipL, 'holds the end pose during the pause');
  const mid = poseAt(k, '2-1-2', 1000).hipL;
  assert.ok(mid > k[0].hipL && mid < k[1].hipL);
  assert.equal(poseAt([k[0]], '2-1-2', 1234), k[0]);
});

test('figureSvg renders single and paired figures, band colour from settings', () => {
  const svg = figureSvg({ poses: [poses['pull-apart-start'], poses['pull-apart-end']], segments, band: { from: 'handL', to: 'handR' }, bandColor: '#3BA55C' }, { pair: true });
  assert.match(svg, /^<svg/);
  assert.match(svg, /fig-pair-arrow/);
  assert.match(svg, /#3BA55C/);
  assert.equal((svg.match(/class="fig-frame"/g) || []).length, 2);
  assert.equal(bandColor('blue', [{ id: 'blue', color: '#123456' }]), '#123456');
  assert.equal(bandColor('loop-orange', []), '#F08A24');
});

test('auto-framing centres lying poses', () => {
  for (const id of ['lying-supine', 'bridge-up', 'clamshell-open', 'side-plank-elevated']) {
    const sc = buildScene({ poses: [poses[id]], segments, props: ['mat'] });
    const b = poseBounds(poses[id], segments);
    const cx = (b.minX + b.maxX) / 2;
    assert.ok(Math.abs(cx - (sc.frame.x + sc.frame.w / 2)) < 12, `${id} horizontally centred`);
    assert.ok(b.minY >= sc.frame.y && b.maxY <= sc.frame.y + sc.frame.h, `${id} inside frame`);
  }
});

test('highlight: left knee ring only for knee exercises, arms for archery', () => {
  const kneeLeft = figureSpecForExercise({ block: 'knee', side: 'left', figure: { poses: ['stand'] }, levels: [{ band: 'red' }] });
  assert.equal(kneeLeft.highlightLeftKnee, true);
  assert.equal(kneeLeft.bandId, 'red');
  const archeryLeft = figureSpecForExercise({ block: 'archery', side: 'left', figure: { poses: ['stand'] }, levels: [{}] });
  assert.equal(archeryLeft.highlightLeftKnee, false);
  assert.equal(archeryLeft.highlight, 'arms');
  assert.equal(archeryLeft.highlightColor, 'accent');
  assert.deepEqual([...normalizeHighlight('legs,armR')], ['legL', 'legR', 'armR']);
});

test('every exercise figure renders (poses exist, band endpoints resolve)', () => {
  for (const e of exercises) {
    const spec = figureSpecForExercise(e, 0);
    const keyframes = spec.poses.map((id) => poses[id]);
    assert.ok(keyframes.every(Boolean), `${e.id}: unknown pose`);
    const svg = figureSvg({ ...spec, poses: keyframes, segments, bandColor: '#D9443B' }, { pair: keyframes.length > 1 });
    assert.ok(!/NaN|undefined/.test(svg), `${e.id}: broken svg`);
    if (spec.band) assert.match(svg, /fig-band/, `${e.id}: band endpoints must resolve`);
  }
});

// ---------------------------------------------------------------- anatomy of the pose library

const SUPPORT_TOL = 2.5;
function lowestBody(p) {
  const P = computePoints(p, segments);
  const ys = [P.head.y + 9.5, P.kneeL.y + 4.25, P.kneeR.y + 4.25, P.footL.y + 4.25, P.footR.y + 4.25, P.toeL.y + 3, P.toeR.y + 3,
    P.handL.y + 3.25, P.handR.y + 3.25, P.elbowL.y + 3.25, P.elbowR.y + 3.25];
  if (p.view === 'front') ys.push(P.shoulderL.y + 5, P.shoulderR.y + 5, P.hipJL.y + 5, P.hipJR.y + 5); else ys.push(P.hip.y + 6.5, P.neck.y + 6.5);
  return Math.max(...ys);
}
const viewed = Object.entries(poses).filter(([, p]) => p.camera !== 'top');

test('poses: nothing goes through the floor', () => {
  for (const [id, p] of viewed) assert.ok(lowestBody(p) <= FLOOR + SUPPORT_TOL, `${id} below the floor (${lowestBody(p).toFixed(1)})`);
});

test('poses: standing figures touch the floor or a step, lying figures the mat', () => {
  for (const [id, p] of viewed) {
    const low = lowestBody(p);
    if (p.ground === 'lying') {
      const supported = low >= FLOOR - MAT_H - SUPPORT_TOL || (p.props || []).some((x) => x.type === 'step' || x.type === 'chair');
      assert.ok(supported, `${id} floats above the mat (${low.toFixed(1)})`);
    } else if (p.ground === 'standing') {
      const step = (p.props || []).find((x) => x.type === 'step');
      const top = step ? (step.top ?? FLOOR - 18) : null;
      const P = computePoints(p, segments);
      const soles = ['L', 'R'].map((s) => Math.max(P['foot' + s].y + 4.25, P['toe' + s].y + 3));
      const onFloor = soles.some((y) => Math.abs(y - FLOOR) <= SUPPORT_TOL);
      const onStep = top !== null && soles.some((y) => Math.abs(y - top) <= SUPPORT_TOL);
      assert.ok(onFloor || onStep, `${id} floats (soles ${soles.map((y) => y.toFixed(1))})`);
    }
  }
});

test('poses: side-view knees and elbows never hyperextend', () => {
  for (const [id, p] of Object.entries(poses)) {
    if (p.view !== 'side') continue;
    for (const k of ['kneeL', 'kneeR']) assert.ok(p[k] >= -5 && p[k] <= 160, `${id}.${k} = ${p[k]}`);
    for (const s of ['L', 'R']) {
      if (p['upperArmLen' + s] !== undefined || p['forearmLen' + s] !== undefined) continue; // projected arm
      assert.ok(p['elbow' + s] >= -5 && p['elbow' + s] <= 165, `${id}.elbow${s} = ${p['elbow' + s]}`);
    }
  }
});

test('poses: optional keys are finite and lengths sane', () => {
  for (const [id, p] of Object.entries(poses)) {
    for (const [k, v] of Object.entries(p)) {
      if (/Len[LR]$/.test(k)) assert.ok(v > 0 && v <= 1.2, `${id}.${k}`);
      else if (typeof v === 'number') assert.ok(Number.isFinite(v), `${id}.${k}`);
    }
  }
});
