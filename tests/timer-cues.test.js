// Cue sequencing in <pt-timer> driven by a cue plan (fake clock, recorded speech). Runs in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PtTimer, phasesFromPlan, totalMs } from '../js/components/pt-timer.js';
import {
  cuePlanFor, timerCuePlan, withoutCount, restAnnouncement, exerciseDoneAnnouncement, secondsPhrase,
  rowPhaseSay, rowPhaseCue, timerBlock, nextSetAnnouncement,
} from '../js/views/session-helpers.js';

const HOLD_EX = { id: 'quad-set', name: 'Quad Set', type: 'hold', block: 'knee', side: 'left', levels: [{ sets: 2, reps: 3, hold: 5, rest: 30 }] };
const LONG_HOLD = { id: 'wall-sit', name: 'Wandsitz', type: 'hold', block: 'knee', side: 'both', levels: [{ sets: 1, reps: 2, hold: 20, rest: 45, restBetween: 3 }] };
const TEMPO_EX = { id: 'squat', name: 'Kniebeuge', type: 'reps', block: 'knee', side: 'both', levels: [{ sets: 2, reps: 3, tempo: '2-1-1', rest: 45 }] };
const TIMED_SIDE = { id: 'stretch', name: 'Dehnen', type: 'timed', block: 'cooldown', side: 'perSide', levels: [{ sets: 1, seconds: 30, rest: 0 }] };
const PLAIN = { id: 'row', name: 'Rudern Band', type: 'reps', block: 'archery', side: 'both', levels: [{ sets: 3, reps: 12, rest: 45 }] };
const SETTINGS = { prepSeconds: 5, holdRelaxSeconds: 5 };

/** Node harness: fake clock, attribute map, recorded events + speech. */
class CueTimer extends PtTimer {
  constructor(attrs = {}, { voice = true } = {}) {
    super();
    this.attrs = { ...attrs };
    this.clock = 0;
    this.events = [];
    this.spoken = [];
    this.tones = [];
    this.voice = voice;
    this._built = true;
  }
  getAttribute(n) { return n in this.attrs ? String(this.attrs[n]) : null; }
  hasAttribute(n) { return n in this.attrs; }
  _now() { return this.clock; }
  _emit(type, detail) { this.events.push({ type, ...detail }); }
  _startLoop() {}
  _acquireWake() {}
  _say(text, opts = {}) {
    if (text) this.spoken.push({ t: this.clock / 1000, text, ...opts });
    else if (opts.cue) this.tones.push({ t: this.clock / 1000, cue: opts.cue });
  }
  _tone(kind) { this.tones.push({ t: this.clock / 1000, kind }); }
  _voiceOn() { return this.voice; }
  _voiceCancel() {}
  _voiceUnlock() {}
  advance(ms, step = 50) { for (let t = 0; t < ms; t += step) { this.clock += Math.min(step, ms - t); this._update(); } }
  of(type) { return this.events.filter((e) => e.type === type); }
  said() { return this.spoken.map((s) => s.text); }
  at(text) { return this.spoken.find((s) => s.text === text)?.t; }
}

test('cue plan (shared exerciseCuePlan): prep before every set, relax ≥ 5 s, no counting aloud', () => {
  const plan = cuePlanFor({ level: 0 }, HOLD_EX, SETTINGS);
  assert.deepEqual(plan.filter((s) => s.seconds > 0).map((s) => `${s.phase}:${s.seconds}`), [
    'prep:5', 'hold:5', 'relax:5', 'hold:5', 'relax:5', 'hold:5', 'rest:30',
    'prep:5', 'hold:5', 'relax:5', 'hold:5', 'relax:5', 'hold:5',
  ]);
  assert.ok(plan.filter((s) => s.phase === 'hold').every((s) => s.say === 'Anspannen'), 'rep numbers are stripped from the spoken text');
  assert.equal(withoutCount('Anspannen – 2'), 'Anspannen');
  assert.equal(withoutCount('Satz 2 von 3'), 'Satz 2 von 3');
  // level restBetween 3 < holdRelaxSeconds → 5; a larger setting wins
  assert.ok(cuePlanFor({ level: 0 }, LONG_HOLD, SETTINGS).filter((s) => s.phase === 'relax').every((s) => s.seconds === 5));
  assert.ok(cuePlanFor({ level: 0 }, LONG_HOLD, { holdRelaxSeconds: 8 }).filter((s) => s.phase === 'relax').every((s) => s.seconds === 8));
  const d = cuePlanFor({ level: 0 }, HOLD_EX, {});
  assert.equal(d[0].seconds, 5, 'default prep 5 s');
});

test('timerCuePlan: per-set slices for the work timer', () => {
  const set2 = timerCuePlan(cuePlanFor({ level: 0 }, HOLD_EX, SETTINGS), 1);
  assert.equal(set2[0].phase, 'prep');
  assert.match(set2[0].say, /Satz 2 von 2/);
  assert.ok(!set2.some((s) => s.phase === 'rest' || s.phase === 'exercise-done'));
  const t = timerCuePlan(cuePlanFor({ level: 0 }, TEMPO_EX, SETTINGS), 0);
  assert.deepEqual(t.filter((s) => s.seconds > 0).map((s) => s.phase).slice(0, 4), ['prep', 'rep-up', 'rep-hold', 'rep-down']);
  const st = timerCuePlan(cuePlanFor({ level: 0 }, TIMED_SIDE, SETTINGS), 0).filter((s) => s.seconds > 0);
  assert.deepEqual(st.map((s) => `${s.phase}:${s.seconds}`), ['prep:5', 'work:30', 'switch:5', 'work:30']);
  assert.ok(timerCuePlan(cuePlanFor({ level: 0 }, PLAIN, SETTINGS), 0), 'plain reps: one work block (unused without a work timer)');
  assert.equal(timerCuePlan([], 0), null);
});

test('announcement texts', () => {
  assert.equal(secondsPhrase(45), '45 Sekunden');
  assert.equal(secondsPhrase(60), 'eine Minute');
  assert.equal(secondsPhrase(90), 'eineinhalb Minuten');
  assert.equal(secondsPhrase(135), '2 Minuten 15 Sekunden');
  assert.equal(restAnnouncement({ type: 'reps', rest: 45 }), 'Satz geschafft. Pause, 45 Sekunden');
  assert.equal(restAnnouncement({ type: 'hold', rest: 30 }), 'Loslassen. Satz geschafft. Pause, 30 Sekunden');
  assert.equal(exerciseDoneAnnouncement('Brücke'), 'Übung fertig. Nächste Übung: Brücke');
  assert.match(exerciseDoneAnnouncement(null), /letzte Übung/);
  assert.equal(nextSetAnnouncement(2, 3), 'Satz 2 von 3. Los geht’s');
  assert.deepEqual(['knee', 'archery', 'warmup'].map(timerBlock), ['knee', 'archery', 'neutral']);
});

test('rowing phase announcements', () => {
  const content = { exercises: [
    { id: 'row-intervals', name: 'Intervalle', levels: [{}] },
    { id: 'row-cooldown', name: 'Ausrudern', levels: [{}] },
  ] };
  const session = { exercises: [{ exerciseId: 'row-intervals', section: 'cardio', level: 0 }, { exerciseId: 'row-cooldown', section: 'cooldown', level: 0 }] };
  assert.equal(rowPhaseSay({ exerciseId: 'row-intervals', entryIndex: 0, kind: 'work', intensity: 'vigorous' }, content, session), 'Zügig rudern');
  assert.equal(rowPhaseSay({ exerciseId: 'row-intervals', entryIndex: 0, kind: 'rest', label: 'Locker', intensity: 'easy' }, content, session), 'Locker rudern');
  assert.equal(rowPhaseSay({ exerciseId: 'row-cooldown', entryIndex: 1, kind: 'work', intensity: 'easy' }, content, session), 'Ausrudern');
  assert.equal(rowPhaseCue({ kind: 'rest' }), 'relax');
  assert.equal(rowPhaseCue({ kind: 'work', intensity: 'vigorous' }), 'tense');
});

test('phasesFromPlan: kinds, labels, rep numbering, markers', () => {
  const p = phasesFromPlan(timerCuePlan(cuePlanFor({ level: 0 }, HOLD_EX, SETTINGS), 1));
  assert.deepEqual(p.map((x) => x.kind), ['prep', 'hold', 'pause', 'hold', 'pause', 'hold']);
  assert.deepEqual(p.map((x) => x.rep), [1, 1, 1, 2, 2, 3]);
  assert.deepEqual(p.filter((x) => x.endsRep).map((x) => x.rep), [1, 2, 3]);
  assert.deepEqual(p.map((x) => x.label), ['Bereit machen', 'Anspannen', 'Locker lassen', 'Anspannen', 'Locker lassen', 'Anspannen']);
  assert.equal(p.at(-1).endCue, 'set-done');
  assert.equal(totalMs(p), 30_000);
  const t = phasesFromPlan(timerCuePlan(cuePlanFor({ level: 0 }, TEMPO_EX, SETTINGS), 0));
  assert.deepEqual(t.slice(0, 4).map((x) => x.kind), ['prep', 'con', 'iso', 'ecc']);
  assert.deepEqual(t.filter((x) => x.endsRep).map((x) => [x.kind, x.rep]), [['ecc', 1], ['ecc', 2], ['ecc', 3]]);
  assert.equal(t[1].totalReps, 3);
  const st = phasesFromPlan(timerCuePlan(cuePlanFor({ level: 0 }, TIMED_SIDE, SETTINGS), 0));
  assert.deepEqual(st.map((x) => [x.kind, x.label]), [['prep', 'Bereit machen'], ['work', 'Los'], ['pause', 'Seite wechseln'], ['work', 'Los']]);
  // 1-based indexes from another plan builder work the same
  const one = phasesFromPlan([{ phase: 'prep', seconds: 5, setIndex: 1, repIndex: null }, { phase: 'hold', seconds: 5, setIndex: 1, repIndex: 1 }, { phase: 'relax', seconds: 5, setIndex: 1, repIndex: 1 }, { phase: 'hold', seconds: 5, setIndex: 1, repIndex: 2 }]);
  assert.deepEqual(one.map((x) => [x.rep, x.totalReps, x.set]), [[1, 2, 1], [1, 2, 1], [1, 2, 1], [2, 2, 1]]);
  assert.deepEqual(one.map((x) => x.label), ['Bereit machen', 'Halten', 'Locker lassen', 'Halten']);
});

test('hold set: spoken sequence and timing gaps (prep ≥ 5 s, relax ≥ 5 s)', () => {
  const t = new CueTimer({ mode: 'hold', seconds: 5, reps: 3 });
  t.plan = timerCuePlan(cuePlanFor({ level: 0 }, HOLD_EX, SETTINGS), 1);
  t.start();
  t.advance(31_000);
  assert.equal(t.done, true);
  assert.deepEqual(t.said(), [
    'Bereit machen. Satz 2 von 2', 'Drei', 'Zwei', 'Eins',
    'Anspannen', 'Loslassen', 'Anspannen', 'Loslassen', 'Anspannen',
  ]);
  const times = t.spoken.map((x) => x.t);
  assert.deepEqual(times, [0, 2, 3, 4, 5, 10, 15, 20, 25]);
  assert.ok(times[4] - times[0] >= 5, 'prep lasts 5 s');
  assert.ok(times[6] - times[5] >= 5, 'relax lasts 5 s');
  // phase starts interrupt stale speech; countdown words expire instead of piling up
  const tense = t.spoken[4];
  assert.equal(tense.interrupt, true);
  assert.equal(tense.cue, 'hold');
  const drei = t.spoken[1];
  assert.ok(drei.maxAgeMs <= 1000 && drei.fallbackOnDrop);
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1, 2, 3]);
  assert.equal(t.of('done').length, 1);
  // not spoken by the timer: the session announces "Satz geschafft …"
  assert.ok(!t.said().some((x) => /geschafft/.test(x)));
});

test('long holds announce "Noch 5 Sekunden"; ticks only without voice', () => {
  const t = new CueTimer({ mode: 'hold', seconds: 20, reps: 2 });
  t.plan = timerCuePlan(cuePlanFor({ level: 0 }, LONG_HOLD, SETTINGS), 0);
  t.start();
  t.advance(50_000);
  assert.equal(t.at('Noch 5 Sekunden'), 5 + 15);
  assert.equal(t.spoken.filter((s) => s.text === 'Noch 5 Sekunden').length, 2);
  assert.equal(t.tones.filter((x) => x.kind === 'tick').length, 0);

  const q = new CueTimer({}, { voice: false });
  q.plan = timerCuePlan(cuePlanFor({ level: 0 }, LONG_HOLD, SETTINGS), 0);
  q.start();
  q.advance(50_000);
  assert.equal(q.tones.filter((x) => x.kind === 'tick').length, 9, '3 ticks before the end of each hold and of the relax');
});

test('tempo coach: prep first, then short movement words in the tempo, reps not counted', () => {
  const t = new CueTimer({ mode: 'set', reps: 3, tempo: '2-1-1' });
  t.plan = timerCuePlan(cuePlanFor({ level: 0 }, TEMPO_EX, SETTINGS), 0);
  t.start();
  t.advance(17_100);
  assert.equal(t.done, true);
  assert.deepEqual(t.said().slice(0, 7), ['Bereit machen: Kniebeuge', 'Drei', 'Zwei', 'Eins', 'Hoch', 'Halten', 'Runter']);
  assert.equal(t.spoken[4].t, 5, 'first movement after 5 s prep');
  assert.ok(!t.said().slice(4).some((x) => /\d|Eins|Zwei|Drei/.test(x)), 'no counting');
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1, 2, 3]);
});

test('rest step: announcement, "Gleich geht\'s weiter", countdown only when flagged', () => {
  const plain = new CueTimer({ mode: 'rest', seconds: 45 });
  plain.plan = [{ phase: 'rest', seconds: 45, say: 'Satz geschafft. Pause, 45 Sekunden', setIndex: 0, repIndex: null, countdown: true }];
  plain.start();
  plain.advance(45_100);
  assert.deepEqual(plain.said(), ['Satz geschafft. Pause, 45 Sekunden', 'Gleich geht\'s weiter', 'Drei', 'Zwei', 'Eins']);
  assert.equal(plain.at('Gleich geht\'s weiter'), 40);
  assert.equal(plain.done, true);

  const beforePrep = new CueTimer({ mode: 'rest', seconds: 30 });
  beforePrep.plan = [{ phase: 'rest', seconds: 30, say: 'Satz geschafft. Pause, 30 Sekunden', setIndex: 0, repIndex: null, countdown: false }];
  beforePrep.start();
  beforePrep.advance(30_100);
  assert.deepEqual(beforePrep.said(), ['Satz geschafft. Pause, 30 Sekunden', 'Gleich geht\'s weiter']);
  assert.equal(beforePrep.tones.filter((x) => x.kind === 'tick').length, 3);
  // ±15 s still works with a plan
  const adj = new CueTimer({ mode: 'rest', seconds: 30 });
  adj.plan = [{ phase: 'rest', seconds: 30, say: 'Pause', setIndex: 0, repIndex: null }];
  adj.adjust(15);
  assert.equal(adj.remaining, 45);
});

test('pause / resume and background catch-up with a plan', () => {
  const t = new CueTimer({});
  t.plan = timerCuePlan(cuePlanFor({ level: 0 }, HOLD_EX, SETTINGS), 0);
  t.start();
  t.advance(6000);
  assert.equal(t.cue, 'hold');
  t.pause();
  t.clock += 60_000;
  t.start();
  assert.equal(t.said().at(-1), 'Weiter. Anspannen');
  // a big jump (screen locked) catches up quietly: no burst of stale cues
  const n = t.spoken.length;
  t.clock += 60_000;
  t._update();
  assert.equal(t.done, true);
  assert.equal(t.spoken.length, n);
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1, 2, 3]);
});

test('attribute mode (no plan) is unchanged', () => {
  const t = new CueTimer({ mode: 'hold', seconds: 4, reps: 2 });
  t.reset();
  t.start();
  t.advance(11_000);
  assert.equal(t.done, true);
  assert.deepEqual(t.said(), []);
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1, 2]);
});

test('breathing 4-7-8: local fallback plan, calm voice, no ticks inside breath phases, blue cue', () => {
  const BREATH = { id: 'breathing-reset', name: 'Atem-Reset', type: 'timed', block: 'cooldown', side: 'both', levels: [{ sets: 1, seconds: 120, rest: 0 }] };
  const plan = cuePlanFor({ level: 0 }, BREATH, SETTINGS);
  const timed = plan.filter((s) => s.seconds > 0);
  assert.deepEqual(timed.slice(0, 4).map((s) => `${s.phase}:${s.seconds}`), ['prep:5', 'inhale:4', 'breath-hold:7', 'exhale:8']);
  assert.equal(timed.filter((s) => s.phase === 'exhale').length, 4, '4 rounds');
  const t = new CueTimer({ mode: 'set', seconds: 120 });
  t.plan = timerCuePlan(plan, 0);
  t.start();
  t.advance(5000 + 4 * 19 * 1000 + 100);
  assert.equal(t.done, true);
  const words = t.said();
  assert.deepEqual(words.slice(4, 7), ['Einatmen durch die Nase', 'Luft anhalten', 'Langsam ausatmen']);
  assert.deepEqual(words.slice(7, 10), ['Einatmen', 'Halten', 'Ausatmen']);
  assert.ok(t.spoken.slice(4).every((x) => x.calm && x.tick === false), 'calm voice, no tick under it');
  assert.equal(t.spoken[5].t - t.spoken[4].t, 4);
  assert.equal(t.spoken[6].t - t.spoken[5].t, 7);
  assert.equal(t.spoken[7].t - t.spoken[6].t, 8);
  assert.equal(t.tones.filter((x) => x.kind === 'tick' || x.kind === 'soft').length, 0, 'no beeps inside the breath');
  assert.deepEqual(t.of('rep').map((e) => e.rep), [1, 2, 3, 4]);
  const ph = phasesFromPlan(timerCuePlan(plan, 0));
  assert.deepEqual(ph.slice(1, 4).map((p) => p.label), ['Einatmen', 'Luft anhalten', 'Langsam ausatmen']);
  assert.deepEqual(ph.slice(4, 7).map((p) => p.label), ['Einatmen', 'Halten', 'Ausatmen']);
  // shared plans with breath phases are used as they are
  const shared = [{ phase: 'inhale', seconds: 4, say: 'Einatmen', setIndex: 0, repIndex: 0 }, { phase: 'exhale', seconds: 8, say: 'Ausatmen', setIndex: 0, repIndex: 0 }];
  assert.deepEqual(phasesFromPlan(shared).map((p) => [p.kind, p.cue]), [['inhale', 'inhale'], ['exhale', 'exhale']]);
});

test('rowing work phases inside a timer plan: "Zügig rudern" label, "Noch eine Minute"', () => {
  const t = new CueTimer({});
  t.plan = [
    { phase: 'work', seconds: 180, say: 'Zügig rudern', setIndex: 0, repIndex: 0, intensity: 'vigorous' },
    { phase: 'rest', seconds: 60, say: 'Locker rudern', setIndex: 0, repIndex: null, intensity: 'easy' },
  ];
  t.start();
  assert.equal(t.said()[0], 'Zügig rudern');
  t.advance(240_100, 200);
  assert.ok(t.said().includes('Noch eine Minute'));
  assert.equal(t.at('Noch eine Minute'), 120);
  assert.equal(t.at('Locker rudern'), 180);
  assert.deepEqual(phasesFromPlan(t.plan).map((p) => p.label), ['Zügig rudern', 'Locker rudern']);
});
