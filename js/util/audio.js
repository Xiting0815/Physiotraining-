// Audio + vibration feedback. See docs/SPEC.md §7.6.
// - unlock(): create/resume the AudioContext on a user gesture (iOS/Safari requirement).
//   The module also installs a one-time gesture listener itself, so unlock happens even if
//   the caller forgets.
// - beep(kind): small synthesized sounds (no audio files), respects settings.sound.
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
};

/** @param {'tick'|'done'|'start'|'rep'} [kind] */
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
