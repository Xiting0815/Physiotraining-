// Voice queue logic (util/voice.js) with a mocked speechSynthesis + fake clock. Runs in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoice, pickGermanVoice, countdownWord, voiceSettings, estimateSpeechMs, say, testVoice } from '../js/util/voice.js';
import { CUE_SOUNDS, SOUNDS, cueTone } from '../js/util/audio.js';

const DE_LOCAL = { name: 'Samsung Deutsch', lang: 'de-DE', localService: true, default: false };
const DE_NET = { name: 'Google Deutsch', lang: 'de-DE', localService: false, default: false };
const EN = { name: 'English', lang: 'en-US', localService: true, default: true };

function harness({ voices = [DE_LOCAL, EN], settings = {}, noSynth = false } = {}) {
  const log = { spoken: [], canceled: 0, tones: [] };
  let clock = 1000;
  let timers = [];
  const synth = {
    paused: false,
    speaking: false,
    getVoices: () => voices,
    addEventListener() {},
    speak(u) { log.spoken.push(u); },
    cancel() { log.canceled++; },
    resume() {},
  };
  class Utt { constructor(text) { this.text = text; } }
  const v = createVoice({
    synth: () => (noSynth ? undefined : synth),
    Utterance: () => (noSynth ? undefined : Utt),
    settings: () => settings,
    now: () => clock,
    setTimeout: (fn, ms) => { const id = { fn, at: clock + ms }; timers.push(id); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t !== id); },
    tone: (cue, soft) => log.tones.push(soft ? `soft:${cue}` : cue),
  });
  const advance = (ms) => {
    clock += ms;
    const due = timers.filter((t) => t.at <= clock).sort((a, b) => a.at - b.at);
    timers = timers.filter((t) => t.at > clock);
    due.forEach((t) => t.fn());
  };
  const end = () => { const u = log.spoken.at(-1); u?.onend?.(); };
  const texts = () => log.spoken.map((u) => u.text);
  return { v, log, advance, end, texts, synth };
}

test('pickGermanVoice prefers local de-DE voices', () => {
  assert.equal(pickGermanVoice([EN, DE_NET, DE_LOCAL]), DE_LOCAL);
  assert.equal(pickGermanVoice([EN, DE_NET]), DE_NET);
  assert.equal(pickGermanVoice([{ name: 'x', lang: 'de_AT', localService: true }]).lang, 'de_AT');
  assert.equal(pickGermanVoice([EN]), null);
  assert.equal(pickGermanVoice([]), null);
});

test('countdownWord / voiceSettings defaults', () => {
  assert.deepEqual([3, 2, 1].map(countdownWord), ['Drei', 'Zwei', 'Eins']);
  assert.equal(countdownWord(42), '42');
  const d = voiceSettings({});
  assert.equal(d.voiceEnabled, true);
  assert.equal(d.beepsWithVoice, true);
  assert.ok(d.voiceRate >= 1 && d.voiceRate <= 1.1);
  assert.equal(voiceSettings({ voiceRate: 9 }).voiceRate, 1.5);
  assert.ok(estimateSpeechMs('Anspannen') > 1500);
});

test('say speaks German with rate/volume and a soft tick under the voice', () => {
  const h = harness({ settings: { voiceRate: 1.1, voiceVolume: 0.8 } });
  assert.equal(h.v.say('Anspannen', { cue: 'tense' }), 'spoken');
  const u = h.log.spoken[0];
  assert.equal(u.text, 'Anspannen');
  assert.equal(u.lang, 'de-DE');
  assert.equal(u.voice, DE_LOCAL);
  assert.equal(u.rate, 1.1);
  assert.equal(u.volume, 0.8);
  assert.deepEqual(h.log.tones, ['soft:tense']);
  const off = harness({ settings: { beepsWithVoice: false } });
  off.v.say('Halten', { cue: 'hold' });
  assert.deepEqual(off.log.tones, []);
});

test('queue never piles up: newer cue replaces pending cues of same/lower priority', () => {
  const h = harness();
  h.v.say('Satz 1 von 3. Bereit machen', { priority: 'normal' });
  assert.equal(h.v.say('a', { priority: 'low' }), 'queued');
  assert.equal(h.v.say('b', { priority: 'normal' }), 'queued');
  assert.equal(h.v.say('c', { priority: 'normal' }), 'queued');
  assert.deepEqual(h.v.pending, ['c']);
  h.end();
  assert.deepEqual(h.texts(), ['Satz 1 von 3. Bereit machen', 'c']);
  h.end();
  assert.equal(h.v.speaking, false);
});

test('higher priority cuts the current utterance; interrupt cancels everything', () => {
  const h = harness();
  h.v.say('Noch 5 Sekunden', { priority: 'normal' });
  h.v.say('x', { priority: 'low' });
  assert.equal(h.v.say('Locker lassen', { priority: 'high' }), 'spoken');
  assert.equal(h.log.canceled, 1);
  assert.deepEqual(h.v.pending, []);
  assert.equal(h.texts().at(-1), 'Locker lassen');
  h.v.say('y', { priority: 'high' }); // same priority → waits
  assert.deepEqual(h.v.pending, ['y']);
  h.v.say('Anspannen', { interrupt: true });
  assert.equal(h.log.canceled, 2);
  assert.deepEqual(h.v.pending, []);
  assert.equal(h.texts().at(-1), 'Anspannen');
  // the late onend of a canceled utterance must not advance the queue
  h.log.spoken[0].onend();
  assert.equal(h.texts().at(-1), 'Anspannen');
});

test('stale queued cues expire (and can fall back to a tone)', () => {
  const h = harness();
  h.v.say('Satz 2 von 3. Bereit machen');
  h.v.say('Drei', { priority: 'normal', maxAgeMs: 700, cue: 'count', fallbackOnDrop: true, tick: false });
  h.advance(1500);
  h.end();
  assert.deepEqual(h.texts(), ['Satz 2 von 3. Bereit machen']);
  assert.deepEqual(h.log.tones, ['count']);
});

test('watchdog advances the queue when onend never fires (Android)', () => {
  const h = harness();
  h.v.say('Satz geschafft. Pause, 45 Sekunden');
  h.v.say('Gleich geht’s weiter', { maxAgeMs: 60_000 });
  h.advance(estimateSpeechMs('Satz geschafft. Pause, 45 Sekunden', 1.05) + 10);
  assert.equal(h.texts().at(-1), 'Gleich geht’s weiter');
});

test('fallback to tones without German voice, without speech API, when disabled; muted when sound off', () => {
  const noDe = harness({ voices: [EN] });
  assert.equal(noDe.v.available(), false);
  assert.equal(noDe.v.say('Anspannen', { cue: 'tense' }), 'tone');
  assert.deepEqual(noDe.log.tones, ['tense']);
  assert.equal(noDe.log.spoken.length, 0);
  const none = harness({ noSynth: true });
  assert.equal(none.v.say('Locker lassen', { cue: 'relax' }), 'tone');
  assert.deepEqual(none.log.tones, ['relax']);
  const off = harness({ settings: { voiceEnabled: false } });
  assert.equal(off.v.active(), false);
  assert.equal(off.v.say('Pause', { cue: 'rest' }), 'tone');
  const mute = harness({ settings: { sound: false } });
  assert.equal(mute.v.say('Pause', { cue: 'rest' }), 'muted');
  assert.deepEqual(mute.log.tones, []);
  assert.equal(mute.log.spoken.length, 0);
  assert.equal(harness().v.say(''), 'none');
});

test('countdown speaks Drei, Zwei, Eins one second apart; cancel stops it', () => {
  const h = harness();
  h.v.countdown(3);
  assert.deepEqual(h.texts(), ['Drei']);
  h.end();
  h.advance(1000);
  h.end();
  h.advance(1000);
  assert.deepEqual(h.texts(), ['Drei', 'Zwei', 'Eins']);
  const c = harness();
  c.v.countdown(3);
  c.v.cancel();
  c.advance(3000);
  assert.deepEqual(c.texts(), ['Drei']);
});

test('unlock speaks one silent utterance once (Android gesture requirement)', () => {
  const h = harness();
  h.v.unlock();
  h.v.unlock();
  assert.equal(h.log.spoken.length, 1);
  assert.equal(h.log.spoken[0].volume, 0);
});

test('distinct fallback tones exist for every cue; module defaults are safe in Node', () => {
  for (const cue of ['prep', 'tense', 'hold', 'relax', 'rest', 'rep-up', 'rep-down', 'set-done', 'exercise-done', 'count']) {
    assert.ok(SOUNDS[CUE_SOUNDS[cue]], cue);
  }
  const sig = (k) => JSON.stringify(SOUNDS[k]);
  assert.equal(new Set(['tense', 'relax', 'rest', 'done', 'tick', 'prep'].map(sig)).size, 6);
  assert.ok(SOUNDS.tense[0][0] < SOUNDS.tense[1][0], 'tense rises');
  assert.ok(SOUNDS.relax[0][0] > SOUNDS.relax[1][0], 'relax falls');
  assert.ok(SOUNDS.rest[0][2] >= 0.6 && SOUNDS.rest[0][0] < 400, 'rest is low and long');
  assert.doesNotThrow(() => { cueTone('tense'); cueTone('nope'); say('Hallo'); testVoice(); });
});
