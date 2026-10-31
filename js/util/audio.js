// Audio + vibration feedback. See docs/SPEC.md §7.6. WP-Timer+audio refines.
import { getSettings } from '../store.js';

let ctx = null;

/** Create/resume the AudioContext. Call on a user gesture. */
export function unlock() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* ignore */ }
}

const TONES = { tick: [660, 0.08], start: [880, 0.15], done: [1046, 0.35] };

/** @param {'tick'|'done'|'start'} [kind] */
export function beep(kind = 'tick') {
  try {
    if (!getSettings().sound || !ctx) return;
    const [freq, dur] = TONES[kind] || TONES.tick;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch { /* ignore */ }
}

/** @param {number|number[]} [pattern] */
export function vibrate(pattern = 200) {
  try {
    if (!getSettings().vibration) return;
    globalThis.navigator?.vibrate?.(pattern);
  } catch { /* ignore */ }
}
