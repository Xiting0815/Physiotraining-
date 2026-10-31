// Validates data/*.json against docs/SPEC.md §6. WP-Content must keep this green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const exercises = load('exercises').exercises;
const workouts = load('workouts').workouts;
const phases = load('phases').phases;
const posesFile = load('poses');
const badges = load('badges').badges;

const BLOCKS = ['knee', 'archery', 'warmup', 'cooldown'];
const TYPES = ['reps', 'hold', 'timed'];
const SIDES = ['both', 'left', 'right', 'alternate', 'perSide'];
const BANDS = [null, 'yellow', 'red', 'green', 'blue', 'loop-orange', 'loop-blue'];
const PROPS = ['chair', 'wall', 'door', 'mat', 'step'];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Strict by default: every pose referenced by an exercise must exist in poses.json.
// Escape hatch while drafting content: ALLOW_PENDING_POSES=1 tolerates poses still listed in
// docs/POSE_REQUESTS.md (lines starting with "- `pose-id`").
const requestsUrl = new URL('../docs/POSE_REQUESTS.md', import.meta.url);
const PENDING_POSES = new Set(
  !process.env.ALLOW_PENDING_POSES || !existsSync(requestsUrl)
    ? []
    : [...readFileSync(requestsUrl, 'utf8').matchAll(/^- `([a-z0-9-]+)`/gm)].map((m) => m[1]),
);

test('exercises conform to schema', () => {
  const ids = new Set();
  const phaseIds = new Set(phases.map((p) => p.id));
  for (const e of exercises) {
    const where = `exercise ${e.id}`;
    assert.match(e.id, ID, where);
    assert.ok(!ids.has(e.id), `${where} duplicate`);
    ids.add(e.id);
    assert.ok(e.name && typeof e.name === 'string', where);
    assert.ok(typeof e.category === 'string', where);
    assert.ok(BLOCKS.includes(e.block), where);
    assert.ok(Array.isArray(e.equipment), where);
    assert.ok(TYPES.includes(e.type), where);
    assert.ok(SIDES.includes(e.side), where);
    for (const k of ['instructions', 'cues', 'mistakes']) assert.ok(Array.isArray(e[k]), `${where}.${k}`);
    assert.ok(e.instructions.length > 0, where);
    assert.equal(typeof e.kneeNote, 'string', where);
    assert.ok(Array.isArray(e.levels) && e.levels.length > 0, where);
    for (const l of e.levels) {
      assert.ok(l.label && Number.isInteger(l.sets) && l.sets > 0, `${where} level`);
      assert.ok(Number.isFinite(l.rest), `${where} level.rest`);
      assert.ok(BANDS.includes(l.band ?? null), `${where} band ${l.band}`);
      if (e.type === 'reps') assert.ok(Number.isInteger(l.reps), `${where} reps`);
      if (e.type === 'hold') assert.ok(Number.isInteger(l.reps) && Number.isFinite(l.hold), `${where} hold`);
      if (e.type === 'timed') assert.ok(Number.isFinite(l.seconds), `${where} seconds`);
    }
    assert.ok(phaseIds.has(e.phaseMin), `${where} phaseMin`);
    const f = e.figure;
    assert.ok(f && Array.isArray(f.poses) && f.poses.length > 0, `${where} figure`);
    for (const p of f.poses) assert.ok(posesFile.poses[p] || PENDING_POSES.has(p), `${where} unknown pose ${p} (add it to data/poses.json)`);
    assert.ok(f.props.every((p) => PROPS.includes(p)), `${where} props`);
    assert.equal(typeof f.mirror, 'boolean', where);
  }
  for (const e of exercises) {
    for (const k of ['regressTo', 'progressTo']) if (e[k] !== null) assert.ok(ids.has(e[k]), `${e.id}.${k} → ${e[k]}`);
  }
});

test('workouts reference existing exercises', () => {
  const ids = new Set(exercises.map((e) => e.id));
  for (const w of workouts) {
    assert.match(w.id, ID);
    assert.ok(phases.some((p) => p.id === w.phaseId), `${w.id}.phaseId`);
    const items = [...w.warmup, ...w.blocks.flatMap((b) => b.items), ...w.cooldown];
    for (const b of w.blocks) assert.ok(['knee', 'archery'].includes(b.id), `${w.id} block ${b.id}`);
    for (const it of items) assert.ok(ids.has(it.exerciseId), `${w.id} → ${it.exerciseId}`);
  }
});

test('phases have A/B/C workouts (existing ones must resolve to their phase)', () => {
  for (const p of phases) {
    assert.ok(Number.isInteger(p.order) && Array.isArray(p.exitCriteria), p.id);
    for (const k of ['A', 'B', 'C']) {
      assert.ok(typeof p.workouts[k] === 'string', `${p.id}.${k}`);
      const w = workouts.find((x) => x.id === p.workouts[k]);
      if (w) assert.equal(w.phaseId, p.id);
    }
  }
  // the first phase must be fully playable
  const first = [...phases].sort((a, b) => a.order - b.order)[0];
  for (const k of ['A', 'B', 'C']) assert.ok(workouts.some((w) => w.id === first.workouts[k]), `first phase ${k}`);
});

test('poses have all angle keys', () => {
  const keys = ['trunk', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];
  for (const [id, p] of Object.entries(posesFile.poses)) {
    assert.ok(['side', 'front'].includes(p.view), id);
    assert.ok(['standing', 'lying', 'sitting'].includes(p.ground), id);
    assert.ok(Number.isFinite(p.root.x) && Number.isFinite(p.root.y), id);
    for (const k of keys) assert.ok(Number.isFinite(p[k]), `${id}.${k}`);
  }
});

test('badges: required ids and known rule types', () => {
  const types = ['sessionsCount', 'weekSessions', 'totalHoldSeconds', 'phaseCompleted', 'greenWeek', 'personalRecord', 'comeback'];
  for (const b of badges) assert.ok(types.includes(b.rule.type), b.id);
  for (const id of ['first-session', 'week-3', 'sessions-10', 'sessions-25', 'sessions-50', 'hold-5min', 'phase-done', 'green-week', 'personal-record', 'comeback']) {
    assert.ok(badges.some((b) => b.id === id), id);
  }
});

test('equipment.json (optional) parses if present', () => {
  if (existsSync(new URL('../data/equipment.json', import.meta.url))) assert.ok(load('equipment'));
});

test('content: workout structure, phaseMin and knee notes', () => {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const order = new Map(phases.map((p) => [p.id, p.order]));
  for (const w of workouts) {
    assert.ok(w.warmup.length > 0 && w.cooldown.length > 0, `${w.id} warmup/cooldown`);
    assert.deepEqual(w.blocks.map((b) => b.id), ['knee', 'archery'], `${w.id} blocks`);
    for (const b of w.blocks) assert.ok(b.items.length >= 4, `${w.id}.${b.id} has ≥ 4 items`);
    const items = [...w.warmup, ...w.blocks.flatMap((b) => b.items), ...w.cooldown];
    for (const it of items) {
      const e = byId.get(it.exerciseId);
      assert.ok(order.get(e.phaseMin) <= order.get(w.phaseId), `${w.id} uses ${e.id} before its phaseMin ${e.phaseMin}`);
    }
  }
  for (const e of exercises) if (e.block === 'knee') assert.ok(e.kneeNote.length > 0, `${e.id} knee exercise needs kneeNote`);
  for (const p of phases) assert.ok(p.description && p.exitCriteria.length > 0, p.id);
});

test('quotes.json (optional) is a non-empty list of strings', () => {
  const url = new URL('../data/quotes.json', import.meta.url);
  if (!existsSync(url)) return;
  const q = JSON.parse(readFileSync(url, 'utf8')).quotes;
  assert.ok(Array.isArray(q) && q.length >= 20);
  for (const s of q) assert.ok(typeof s === 'string' && s.length > 0 && s.length <= 140, s);
  assert.equal(new Set(q).size, q.length, 'no duplicate quotes');
});
