// Audio + vibration feedback. See docs/SPEC.md §7.6.
// - unlock(): create/resume the AudioContext on a user gesture (iOS/Safari requirement).
//   The module also installs a one-time gesture listener itself, so unlock happens even if
//   the caller forgets.
// - beep(kind): small synthesized sounds (no audio files), respects settings.sound.
// - cueTone(cue): distinct tone per training phase (prep/tense/relax/rest/rep-up/rep-down/
//   set-done/exercise-done) – the fallback for devices without a German TTS voice (util/voice.js).
// - vibrate(pattern): respects settings.vibration, no-op where unsupported.
// Everything fails silently and is safe to import in Node (no DOM access at import time).
import { getSettings } from '../store.js';

let ctx = null;
let master = null;

function settings() {
  try { return getSettings() || {}; } catch { return {}; }
}

/** Create/resume the AudioContext. Call on a user gesture. */
export function unlock() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      // iOS: playing a (silent) buffer inside the gesture fully unlocks output.
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.start(0);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { /* ignore */ }
}

/** @returns {boolean} whether audio output is currently possible */
export function isUnlocked() {
  return !!ctx && ctx.state === 'running';
}

// Auto-install a once-only unlock on the first gesture (browser only).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const events = ['pointerdown', 'touchend', 'keydown'];
  const handler = () => {
    unlock();
    if (ctx && ctx.state === 'running') events.forEach((e) => window.removeEventListener(e, handler, true));
  };
  events.forEach((e) => window.addEventListener(e, handler, { capture: true, passive: true }));
}

/**
 * Sound recipes: each note = [frequencyHz, startOffsetS, durationS, peakGain, waveType].
 * Soft envelopes (fast attack, exponential decay) keep them pleasant rather than piercing.
 */
export const SOUNDS = {
  // short, soft wood-block-like tick for the 3-2-1 countdown
  tick: [[880, 0, 0.09, 0.22, 'sine'], [1760, 0, 0.05, 0.05, 'sine']],
  // two rising notes: "go"
  start: [[659.25, 0, 0.12, 0.22, 'triangle'], [987.77, 0.11, 0.2, 0.24, 'triangle']],
  // gentle three-note chime (C6–E6–G6) with a soft octave shimmer
  done: [
    [1046.5, 0, 0.5, 0.2, 'sine'], [1318.5, 0.12, 0.5, 0.18, 'sine'], [1568, 0.24, 0.8, 0.2, 'sine'],
    [2093, 0.24, 0.6, 0.04, 'sine'],
  ],
  // single mellow note marking a completed hold rep / phase change
  rep: [[783.99, 0, 0.16, 0.2, 'triangle']],
  // --- distinct phase cues (fallback when no German voice is available, SPEC §15, voice guidance) ---
  // very quiet short tick played under the voice on phase changes
  soft: [[1318.5, 0, 0.05, 0.06, 'sine']],
  // "Bereit machen": one warm mid note
  prep: [[523.25, 0, 0.22, 0.2, 'sine'], [1046.5, 0, 0.12, 0.04, 'sine']],
  // anspannen / los: rising two-tone (low → high)
  tense: [[523.25, 0, 0.14, 0.24, 'triangle'], [880, 0.13, 0.24, 0.26, 'triangle']],
  // locker lassen / entspannen: falling two-tone (high → low), softer
  relax: [[880, 0, 0.16, 0.2, 'sine'], [587.33, 0.15, 0.3, 0.18, 'sine']],
  // Satzpause: low long tone
  rest: [[293.66, 0, 0.75, 0.22, 'sine'], [587.33, 0, 0.4, 0.04, 'sine']],
  // tempo coach: short up / down blips (one per rep part)
  up: [[660, 0, 0.07, 0.16, 'triangle'], [880, 0.05, 0.07, 0.16, 'triangle']],
  down: [[660, 0, 0.07, 0.14, 'sine'], [494, 0.05, 0.08, 0.14, 'sine']],
  // breathing (4-7-8): very soft slow swells – in = rising, out = falling, hold = one quiet note
  breathIn: [[392, 0, 0.6, 0.1, 'sine'], [523.25, 0.3, 0.7, 0.1, 'sine']],
  breathOut: [[523.25, 0, 0.6, 0.1, 'sine'], [349.23, 0.3, 0.9, 0.1, 'sine']],
  breathHold: [[440, 0, 0.4, 0.07, 'sine']],
  // Satz geschafft: two bright notes
  setdone: [[783.99, 0, 0.2, 0.2, 'sine'], [1046.5, 0.14, 0.35, 0.2, 'sine']],
};

/** Phase cue (cue-plan phase name) → sound recipe key (SPEC §15, voice guidance). */
export const CUE_SOUNDS = {
  prep: 'prep', tense: 'tense', hold: 'tense', work: 'tense', relax: 'relax', switch: 'relax', rest: 'rest',
  'rep-up': 'up', 'rep-hold': 'rep', 'rep-down': 'down', inhale: 'breathIn', 'breath-hold': 'breathHold', exhale: 'breathOut', 'set-done': 'setdone', 'exercise-done': 'done', count: 'tick', done: 'done',
};

/** Play the distinct tone for a phase cue (no-op for unknown cues). */
export function cueTone(cue) {
  const kind = CUE_SOUNDS[cue];
  if (kind) beep(kind);
}

/** @param {'tick'|'done'|'start'|'rep'|'soft'|'prep'|'tense'|'relax'|'rest'|'up'|'down'|'setdone'} [kind] */
export function beep(kind = 'tick') {
  try {
    if (settings().sound === false) return;
    if (!ctx) unlock();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const notes = SOUNDS[kind] || SOUNDS.tick;
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, at, dur, peak, type] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + at);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(master || ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.05);
    }
  } catch { /* ignore */ }
}

/** @param {number|number[]} [pattern] */
export function vibrate(pattern = 200) {
  try {
    if (settings().vibration === false) return;
    const nav = globalThis.navigator;
    if (nav && typeof nav.vibrate === 'function') nav.vibrate(pattern);
  } catch { /* ignore */ }
}
