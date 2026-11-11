// v5.3 figure audit: data/figure-overrides.json, motion arrows, labels, top view / knee close-up, walls on the right side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computePoints, buildScene, figureSvg, figureSpecForExercise, applyFigureOverride, autoArrowPoints, interpolatePose,
  OVERRIDE_KEYS,
} from '../js/components/pt-figure.js';
import { loadContent, getExercise } from '../js/content.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const { poses, segments } = load('poses');
const exercises = load('exercises').exercises;
const overrides = load('figure-overrides').overrides;
const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
const specOf = (e) => figureSpecForExercise(e, 0, overrides);
const framesOf = (spec) => spec.poses.map((k) => (typeof k === 'string' ? poses[k] : k));

test('overrides reference existing exercises, known keys and existing poses', () => {
  for (const [id, ov] of Object.entries(overrides)) {
    assert.ok(byId[id], `unknown exercise ${id}`);
    for (const k of Object.keys(ov)) assert.ok(OVERRIDE_KEYS.includes(k), `${id}: unknown key ${k}`);
    for (const p of ov.poses || []) assert.ok(poses[p], `${id}: unknown pose ${p}`);
    const viewOf = (p) => (p.camera === 'above' ? 'top' : p.view);
    if (ov.view && ov.poses) for (const p of ov.poses) assert.equal(viewOf(poses[p]), ov.view, `${id}: ${p} is not a ${ov.view} view`);
    for (const a of ov.arrows || []) assert.ok(['move', 'rotate', 'push', 'pull', 'arrow'].includes(a.kind), `${id}: arrow kind ${a.kind}`);
  }
});

test('applyFigureOverride replaces only the given keys', () => {
  const f = { poses: ['stand'], props: ['wall'], band: null, mirror: false };
  assert.equal(applyFigureOverride(f, null), f);
  const m = applyFigureOverride(f, { poses: ['stand-front'], arrows: [], bogus: 1 });
  assert.deepEqual(m.poses, ['stand-front']);
  assert.deepEqual(m.props, ['wall']);
  assert.deepEqual(m.arrows, []);
  assert.equal(m.bogus, undefined);
});

test('every exercise figure resolves with the overrides (poses, band, labels, no NaN)', () => {
  for (const e of exercises) {
    const spec = specOf(e);
    const k = framesOf(spec);
    assert.ok(k.length && k.every(Boolean), `${e.id}: unknown pose`);
    const svg = figureSvg({ ...spec, poses: k, segments, bandColor: '#D9443B' }, { pair: k.length > 1 });
    assert.ok(!/NaN|undefined/.test(svg), `${e.id}: broken svg`);
    if (spec.band) assert.match(svg, /fig-band/, `${e.id}: band endpoints resolve`);
    for (const l of spec.labels || []) assert.ok(svg.includes(`>${l.text}</text>`), `${e.id}: label „${l.text}“ drawn`);
  }
});

test('motion arrows render for every animated figure (except rowing loops / deliberately none)', () => {
  for (const e of exercises) {
    const spec = specOf(e);
    const k = framesOf(spec);
    const explicitNone = Array.isArray(spec.arrows) && spec.arrows.length === 0;
    if (k.length < 2 || spec.loop || explicitNone) continue;
    const sc = buildScene({ ...spec, poses: k, segments });
    assert.ok(sc.hasArrows, `${e.id}: no motion arrow`);
    const pair = figureSvg({ ...spec, poses: k, segments }, { pair: true });
    assert.equal((pair.match(/class="fig-motion-layer/g) || []).length, 1, `${e.id}: arrows only on the end pose`);
    assert.ok(!/fig-motion/.test(figureSvg({ ...spec, poses: k, segments }, { pair: true, overlay: false })), `${e.id}: overlay off`);
  }
  // isometrics with one pose carry explicit push arrows
  for (const id of ['er-iso-door', 'ir-iso-door', 'bow-arm-push', 'push-pull-iso']) {
    const spec = specOf(byId[id]);
    assert.ok(buildScene({ ...spec, poses: framesOf(spec), segments }).hasArrows, id);
  }
});

test('auto arrow: whole-body moves use the hip, limb moves the end point, symmetric arms get two', () => {
  const pick = (a, b) => autoArrowPoints([poses[a], poses[b]], segments).map((x) => x.point);
  assert.deepEqual(pick('bridge-down', 'bridge-up'), ['hip']);
  assert.deepEqual(pick('lying-slr-down', 'lying-slr-up'), ['footL']);
  assert.deepEqual(pick('front-arms-forward', 'front-arms-apart').sort(), ['handL', 'handR']);
  assert.deepEqual(pick('stand', 'stand'), []);
});

test('top view and knee close-up: geometry and interpolation', () => {
  const a = poses['top-er-in'];
  const b = poses['top-er-out'];
  const Pa = computePoints(a, segments);
  const Pb = computePoints(b, segments);
  // facing the viewer: the right arm is on the viewer's left; external rotation moves the hand outward (−x)
  assert.ok(Pa.shoulderR.x < Pa.shoulderL.x);
  assert.ok(Pa.handR.x > Pa.elbowR.x && Pb.handR.x < Pb.elbowR.x, 'forearm turns from the belly outward');
  assert.ok(Pa.handR.y > Pa.neck.y && Pb.handR.y > Pb.neck.y, 'forearm points forward (down in the image)');
  const m = interpolatePose(a, b, 0.5);
  assert.equal(m.upperArmLenR, a.upperArmLenR, 'top view keeps projected lengths');
  const door = (a.props || []).find((p) => p.type === 'door');
  assert.ok(door.x > Pa.neck.x, 'ER band comes from the person’s left (viewer’s right)');
  const ir = (poses['top-ir-out'].props || []).find((p) => p.type === 'door');
  assert.ok(ir.x < Pa.neck.x, 'IR band comes from the person’s right');
  const k0 = computePoints(poses['knee-closeup-rest']);
  const k1 = computePoints(poses['knee-closeup-down']);
  assert.ok(k1.patella.x > k0.patella.x, 'inferior glide moves the kneecap toward the foot');
  assert.ok(k0.hip.x < k0.patella.x && k0.footL.x > k0.patella.x);
});

const wallOf = (spec) => buildScene({ ...spec, poses: framesOf(spec), segments }).props.find((p) => p.type === 'wall');

test('walls sit on the correct side of the body', () => {
  const P = (spec, i = 0) => computePoints(framesOf(spec)[i], segments);
  // back to the wall (side view, figure faces +x): wall behind the hip and the back
  for (const id of ['wall-sit']) {
    const s = specOf(byId[id]); const w = wallOf(s);
    assert.ok(w && w.x < P(s).hip.x && w.x < P(s, 1).hip.x, `${id}: wall behind`);
  }
  // facing the wall: wall in front of the hands, hands touch it
  for (const id of ['mini-squat', 'calf-raise', 'wall-push-up-plus', 'standing-hip-extension', 'calf-stretch-wall', 'wall-slide']) {
    const s = specOf(byId[id]); const w = wallOf(s);
    assert.ok(w, `${id}: wall drawn`);
    for (let i = 0; i < s.poses.length; i++) {
      const Q = P(s, i);
      assert.ok(w.x > Q.neck.x, `${id}: wall in front`);
      assert.ok(Math.abs(Math.max(Q.handL.x, Q.handR.x) + 4.5 - w.x) < 3, `${id}[${i}]: hands on the wall`);
    }
  }
  // side-on to the wall (front view): wall line beside the body, hand at the wall
  for (const [id, hand] of [['single-leg-stance', 'handL'], ['bow-arm-push', 'handL'], ['side-plank-elevated', 'handR']]) {
    const s = specOf(byId[id]); const w = wallOf(s);
    assert.equal(framesOf(s)[0].view, 'front', id);
    assert.ok(w && w.line, `${id}: wall line`);
    const Q = P(s);
    assert.ok(Math.abs(Q[hand].x - w.x) < 8, `${id}: ${hand} at the wall`);
    assert.ok(Math.abs(Q.hip.x - w.x) > 15, `${id}: body beside the wall`);
  }
  // wall beside the figure in side view → drawn as the background plane
  for (const id of ['leg-swing-front', 'hip-flexor-stretch-standing', 'leg-swing-side']) {
    const w = wallOf(specOf(byId[id]));
    assert.ok(w && (w.plane || !w.line), `${id}: wall in the background`);
  }
  // chair against the wall
  for (const id of ['sit-to-stand', 'chair-dip']) {
    const s = specOf(byId[id]);
    const sc = buildScene({ ...s, poses: framesOf(s), segments });
    const ch = sc.props.find((p) => p.type === 'chair');
    const w = sc.props.find((p) => p.type === 'wall');
    assert.ok(w && w.x < ch.x - 14, `${id}: wall behind the backrest`);
  }
});

test('views: rotation exercises from above, pallof from above, standing abduction / single-leg stance from the front', () => {
  for (const id of ['er-towel', 'ir-band', 'er-iso-door', 'ir-iso-door', 'pallof-press', 'patella-mobilization']) {
    assert.ok(framesOf(specOf(byId[id])).every((p) => p.camera === 'above'), id);
  }
  for (const id of ['standing-hip-abduction', 'lateral-band-walk', 'single-leg-stance', 'clamshell']) {
    assert.ok(framesOf(specOf(byId[id])).every((p) => p.view === 'front' && p.camera !== 'above'), id);
  }
  const step = framesOf(specOf(byId['step-up']));
  assert.ok(step[0].props.some((p) => p.type === 'step'), 'step drawn');
  const P0 = computePoints(step[0], segments);
  assert.ok(P0.footL.y < P0.footR.y, 'step-up: the left (operated) foot is on the step');
});

test('shoulder limit: override poses of allowed exercises stay below limit + 20°', () => {
  const elev = (p) => {
    if (p.camera === 'above') return 0; // arms at the side / forward at waist height
    const Q = computePoints(p, segments);
    const ax = { x: Q.hip.x - Q.neck.x, y: Q.hip.y - Q.neck.y };
    let m = 0;
    for (const s of ['L', 'R']) {
      const v = { x: Q[`elbow${s}`].x - Q[`shoulder${s}`].x, y: Q[`elbow${s}`].y - Q[`shoulder${s}`].y };
      const c = (v.x * ax.x + v.y * ax.y) / Math.hypot(v.x, v.y) / Math.hypot(ax.x, ax.y);
      m = Math.max(m, Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
    }
    return m;
  };
  for (const id of Object.keys(overrides)) {
    const e = byId[id];
    if (e.archeryDraw || e.block === 'cardio' || !(e.shoulderElevationDeg <= 65)) continue;
    for (const p of framesOf(specOf(e))) assert.ok(!(elev(p) > 85), `${id}: figure shows ${Math.round(elev(p))}°`);
  }
});

test('content.js merges figure-overrides.json into the exercises (optional file)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const name = String(url).match(/data\/([^/]+)\.json/)?.[1];
    try { return { ok: true, json: async () => load(name) }; } catch { return { ok: false, status: 404, json: async () => null }; }
  };
  try {
    const c = await loadContent({ force: true });
    assert.deepEqual(getExercise('er-towel').figure.poses, overrides['er-towel'].poses);
    assert.ok(c.figureOverrides['pallof-press']);
    assert.deepEqual(getExercise('quad-set').figure.poses, byId['quad-set'].figure.poses, 'poses kept when not overridden');
  } finally { globalThis.fetch = orig; }
});
