// Tests for <pt-timer> pure helpers and timestamp-based state machine (runs in Node, no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PtTimer, buildPhases, parseTempo, locate, totalMs, phaseStart, isWorkPhase } from '../js/components/pt-timer.js';
import { SOUNDS, beep, vibrate, unlock } from '../js/util/audio.js';

test('parseTempo', () => {
  assert.deepEqual(parseTempo('3-1-1'), [3, 1, 1]);
  assert.deepEqual(parseTempo('2-0-2'), [2, 0, 2]);
  assert.equal(parseTempo(''), null);
  assert.equal(parseTempo(null), null);
  assert.equal(parseTempo('3-1'), null);
  assert.equal(parseTempo('a-b-c'), null);
  assert.equal(parseTempo('0-0-0'), null);
});

test('buildPhases: rest mode is one phase', () => {
  const p = buildPhases({ mode: 'rest', seconds: 45 });
  assert.equal(p.length, 1);
  assert.equal(p[0].kind, 'rest');
  assert.equal(p[0].ms, 45000);
  assert.deepEqual(buildPhases({ mode: 'rest', seconds: 0 }), []);
});

test('buildPhases: hold mode reps with rest-between (default 3 s), no trailing pause', () => {
  const p = buildPhases({ mode: 'hold', seconds: 10, reps: 3 });
  assert.deepEqual(p.map((x) => x.kind), ['hold', 'pause', 'hold', 'pause', 'hold']);
  assert.equal(p[1].ms, 3000);
  assert.equal(totalMs(p), 36000);
  assert.deepEqual(p.filter((x) => x.endsRep).map((x) => x.rep), [1, 2, 3]);
});

test('buildPhases: hold mode with sets and set-rest', () => {
  const p = buildPhases({ mode: 'hold', seconds: 5, reps: 2, restBetween: 2, sets: 2, setRest: 20 });
  assert.deepEqual(p.map((x) => x.kind), ['hold', 'pause', 'hold', 'setrest', 'hold', 'pause', 'hold']);
  assert.equal(p[3].ms, 20000);
  assert.equal(p.at(-1).set, 2);
  assert.equal(p.at(-1).sets, 2);
});

test('buildPhases: rest-between 0 removes pauses', () => {
  const p = buildPhases({ mode: 'hold', seconds: 5, reps: 3, restBetween: 0 });
  assert.deepEqual(p.map((x) => x.kind), ['hold', 'hold', 'hold']);
});

test('buildPhases: set mode timed vs tempo', () => {
  const timed = buildPhases({ mode: 'set', seconds: 30 });
  assert.deepEqual(timed.map((x) => x.kind), ['work']);
  const tempo = buildPhases({ mode: 'set', reps: 2, tempo: '3-1-1' });
  assert.deepEqual(tempo.map((x) => x.kind), ['ecc', 'iso', 'con', 'ecc', 'iso', 'con']);
  assert.equal(totalMs(tempo), 10000);
  assert.deepEqual(tempo.filter((x) => x.endsRep).map((x) => x.kind), ['con', 'con']);
  const def = buildPhases({ mode: 'set', reps: 1 });
  assert.deepEqual(def.map((x) => [x.kind, x.ms]), [['ecc', 2000], ['con', 2000]]);
  assert.ok(isWorkPhase('hold') && !isWorkPhase('rest'));
});

test('locate / phaseStart', () => {
  const p = buildPhases({ mode: 'hold', seconds: 10, reps: 2, restBetween: 5 });
  assert.equal(locate(p, 0).index, 0);
  assert.equal(locate(p, 9999).index, 0);
  assert.equal(locate(p, 10000).index, 1);
  assert.equal(locate(p, 12000).remainingMs, 3000);
  assert.equal(locate(p, 25000).done, true);
  assert.equal(locate(p, 25000).index, 3);
  assert.equal(phaseStart(p, 2), 15000);
});

/** Minimal Node harness: fake clock + attribute map + recorded events. */
class TestTimer extends PtTimer {
  constructor(attrs) {
    super();
    this.attrs = { ...attrs };
    this.clock = 1_000_000;
    this.events = [];
  }
  getAttribute(n) { return n in this.attrs ? String(this.attrs[n]) : null; }
  hasAttribute(n) { return n in this.attrs; }
  _now() { return this.clock; }
  _emit(type, detail) { this.events.push({ type, ...detail }); }
  _startLoop() {} // drive _update() manually
  advance(ms, step = 100) {
    // simulate a visible tab: frequent updates
    for (let t = 0; t < ms; t += step) { this.clock += Math.min(step, ms - t); this._update(); }
  }
  jump(ms) { this.clock += ms; this._update(); } // simulate background / throttling
  of(type) { return this.events.filter((e) => e.type === type); }
}

test('rest timer counts down by timestamps and emits done once', () => {
  const t = new TestTimer({ mode: 'rest', seconds: 5 });
  t.reset();
  assert.equal(t.remaining, 5);
  assert.equal(t.running, false);
  t.start();
  assert.equal(t.running, true);
  t.advance(2000);
  assert.equal(t.remaining, 3);
  t.advance(3000);
  assert.equal(t.running, false);
  assert.equal(t.done, true);
  assert.equal(t.of('done').length, 1);
  assert.equal(t.of('done')[0].elapsed, 5);
  const ticks = t.of('tick').map((e) => e.remaining);
  assert.deepEqual(ticks, [5, 4, 3, 2, 1]);
});

test('pause freezes time; resume continues', () => {
  const t = new TestTimer({ mode: 'rest', seconds: 10 });
  t.reset();
  t.start();
  t.advance(3000);
  t.pause();
  t.clock += 60_000; // time passes while paused
  assert.equal(t.remaining, 7);
  t.start();
  t.advance(1000);
  assert.equal(t.remaining, 6);
  t.pause();
});

test('survives background: one big jump catches up and emits all missed reps + done', () => {
  const t = new TestTimer({ mode: 'hold', seconds: 10, reps: 3, 'rest-between': 5 });
  t.reset();
  t.start();
  t.advance(1000);
  t.jump(60_000); // tab was hidden for a minute
  assert.equal(t.done, true);
  assert.deepEqual(t.of('rep').map((e) => [e.rep, e.total]), [[1, 3], [2, 3], [3, 3]]);
  assert.equal(t.of('done').length, 1);
});

test('hold mode emits rep after each hold and tick.rep follows the current rep', () => {
  const t = new TestTimer({ mode: 'hold', seconds: 4, reps: 2 }); // default rest-between 3
  t.reset();
  t.start();
  t.advance(4000);
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1]);
  assert.equal(t.phase, 'pause');
  t.advance(3000);
  assert.equal(t.phase, 'hold');
  assert.equal(t.rep, 2);
  assert.equal(t.of('tick').at(-1).rep, 2);
  t.advance(4000);
  assert.equal(t.done, true);
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1, 2]);
});

test('skip ends current phase; in rest mode it finishes', () => {
  const t = new TestTimer({ mode: 'rest', seconds: 60 });
  t.reset();
  t.start();
  t.advance(500);
  t.skip();
  assert.equal(t.done, true);
  assert.equal(t.of('done').length, 1);

  const h = new TestTimer({ mode: 'hold', seconds: 10, reps: 2 });
  h.reset();
  h.start();
  h.skip(); // skip hold 1 → pause
  assert.equal(h.phase, 'pause');
  assert.equal(h.of('rep').length, 1);
  h.pause();
});

test('adjust ±15 s changes the current phase', () => {
  const t = new TestTimer({ mode: 'rest', seconds: 30 });
  t.reset();
  t.adjust(15); // before start: planned duration
  assert.equal(t.remaining, 45);
  t.adjust(-15);
  t.adjust(-15);
  assert.equal(t.remaining, 15);
  t.adjust(-15); // clamps to 5 s before start
  assert.equal(t.remaining, 5);
  t.adjust(25);
  t.start();
  t.advance(10_000);
  assert.equal(t.remaining, 20);
  t.adjust(15);
  assert.equal(t.remaining, 35);
  t.adjust(-15);
  t.adjust(-15);
  assert.equal(t.remaining, 5);
  t.adjust(-15); // would go below zero → ends now
  assert.equal(t.done, true);
});

test('reset restores initial state; start after done restarts', () => {
  const t = new TestTimer({ mode: 'rest', seconds: 2 });
  t.reset();
  t.start();
  t.advance(2000);
  assert.equal(t.done, true);
  t.start(); // "Nochmal"
  assert.equal(t.running, true);
  assert.equal(t.remaining, 2);
  t.reset();
  assert.equal(t.running, false);
  assert.equal(t.remaining, 2);
});

test('tempo set mode counts reps', () => {
  const t = new TestTimer({ mode: 'set', reps: 3, tempo: '1-0-1' });
  t.reset();
  t.start();
  t.advance(6000);
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1, 2, 3]);
  assert.equal(t.done, true);
});

test('audio helpers are safe in Node', () => {
  assert.ok(SOUNDS.tick && SOUNDS.done && SOUNDS.start);
  assert.doesNotThrow(() => { unlock(); beep('tick'); beep('done'); beep('nope'); vibrate(100); });
});
