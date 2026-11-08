// German speech announcements for the training timers (Web Speech API, offline voices preferred).
// See docs/SPEC.md §15 (voice guidance).
//
// - say(text, {priority, interrupt, cue, maxAgeMs}): speak one short cue. A small priority queue
//   guarantees cues never pile up: a newer cue replaces pending cues of the same or lower priority,
//   pending cues expire (default 2.5 s – a late "Anspannen" is worse than none), a higher priority
//   cue cuts the one being spoken, `interrupt` cancels everything first.
// - countdown(n): "Drei", "Zwei", "Eins" one second apart (cancelable); timers usually call
//   say(countdownWord(sec)) on their own second boundaries instead.
// - unlock(): call inside the first user gesture (e.g. the Start tap). Android Chrome only speaks
//   after speechSynthesis.speak() has been called from a gesture once.
// - Fallback: when speech is unavailable, no German voice exists, voice is disabled in the
//   settings, or a cue expired, the `cue` (phase name) is played as a distinct tone via
//   util/audio.js (rising = anspannen, falling = locker lassen, low = Pause, chime = fertig).
// - Settings (store.getSettings()): sound (master: false = silent), voiceEnabled (default true),
//   voiceRate (default 1.05), voiceVolume (default 1), beepsWithVoice (default true: a soft tick
//   under the voice on phase changes only).
// - Limitation: Chrome may stop speaking while the app is in the background / screen locked.
//   The timers stay correct (timestamps) and keep the screen awake with the Wake Lock API; on
//   return they re-announce the current phase.
// Pure factory `createVoice(env)` for Node tests; safe to import in Node (no DOM at import time).
import { getSettings } from '../store.js';
import { cueTone, beep, vibrate } from './audio.js';

export const PRIORITY = { low: 0, normal: 1, high: 2 };
export const DEFAULT_RATE = 1.05;
const DEFAULT_MAX_AGE = 2500;

const WORDS = ['Null', 'Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn'];
/** 3 → "Drei" (1–10 as words, else the digits). */
export const countdownWord = (n) => WORDS[n] ?? String(n);

/** Voice settings with defaults (store keys may be missing in older data). */
export function voiceSettings(s = {}) {
  const num = (v, d, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    sound: s.sound !== false,
    voiceEnabled: s.voiceEnabled !== false,
    voiceRate: num(s.voiceRate, DEFAULT_RATE, 0.7, 1.5),
    voiceVolume: num(s.voiceVolume, 1, 0, 1),
    beepsWithVoice: s.beepsWithVoice !== false,
    vibration: s.vibration !== false,
  };
}

const normLang = (l) => String(l || '').replace('_', '-').toLowerCase();

/**
 * Pick the best German voice: de-DE first, local (offline) voices strongly preferred,
 * then Google/Samsung engines, then the default flag.
 * @param {SpeechSynthesisVoice[]} voices @returns {SpeechSynthesisVoice|null}
 */
export function pickGermanVoice(voices) {
  let best = null;
  let bestScore = -Infinity;
  for (const v of voices || []) {
    const lang = normLang(v?.lang);
    if (!lang.startsWith('de')) continue;
    let score = 0;
    if (lang === 'de-de') score += 3;
    if (v.localService) score += 6;
    if (/google|samsung/i.test(v.name || '')) score += 1;
    if (v.default) score += 1;
    if (score > bestScore) { best = v; bestScore = score; }
  }
  return best;
}

/** Rough speaking time used as a watchdog when `onend` never fires (Android quirk). */
export const estimateSpeechMs = (text, rate = 1) => Math.round((400 + String(text).length * 75) / (rate || 1)) + 1500;

/**
 * @param {{
 *   synth?: () => any, Utterance?: () => any, settings?: () => any, now?: () => number,
 *   setTimeout?: Function, clearTimeout?: Function, tone?: (cue:string, soft?:boolean) => void,
 * }} env
 */
export function createVoice(env = {}) {
  const synthOf = env.synth || (() => globalThis.speechSynthesis);
  const UtteranceOf = env.Utterance || (() => globalThis.SpeechSynthesisUtterance);
  const settingsOf = () => voiceSettings((env.settings || (() => ({})))() || {});
  const now = env.now || (() => Date.now());
  const setT = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = env.clearTimeout || ((id) => clearTimeout(id));
  const tone = env.tone || (() => {});

  /** @type {{text:string, priority:number, expiresAt:number, cue?:string}[]} */
  let queue = [];
  let current = null;        // item being spoken
  let watchdog = 0;
  let voice = null;
  let voicesLoaded = false;
  let unlocked = false;
  let countdownTimers = [];
  let listening = false;

  function synth() {
    try { return synthOf() || null; } catch { return null; }
  }

  function loadVoice() {
    const s = synth();
    if (!s || typeof s.getVoices !== 'function') return null;
    if (!listening && typeof s.addEventListener === 'function') {
      listening = true;
      try { s.addEventListener('voiceschanged', () => { voicesLoaded = false; voice = null; loadVoice(); }); } catch { /* ignore */ }
    }
    if (!voicesLoaded || !voice) {
      let list = [];
      try { list = s.getVoices() || []; } catch { list = []; }
      if (list.length) voicesLoaded = true;
      voice = pickGermanVoice(list);
    }
    return voice;
  }

  /** Speech output possible right now (API present + German voice). */
  function available() {
    return !!(synth() && UtteranceOf() && loadVoice());
  }

  /** Voice will actually be used (available, enabled, sound on). */
  function active() {
    const st = settingsOf();
    return st.sound && st.voiceEnabled && available();
  }

  function finishCurrent() {
    clearT(watchdog);
    watchdog = 0;
    current = null;
    next();
  }

  function speakNow(item) {
    const s = synth();
    const U = UtteranceOf();
    const st = settingsOf();
    current = item;
    try {
      const u = new U(item.text);
      u.lang = voice?.lang || 'de-DE';
      if (voice) u.voice = voice;
      u.rate = item.calm ? Math.max(0.7, st.voiceRate * 0.85) : st.voiceRate;
      u.volume = st.voiceVolume;
      u.pitch = 1;
      const done = () => { if (current === item) finishCurrent(); };
      u.onend = done;
      u.onerror = done;
      item.utterance = u;
      // Chrome sometimes stays "paused" after the page was hidden
      if (s.paused && typeof s.resume === 'function') s.resume();
      s.speak(u);
      watchdog = setT(done, estimateSpeechMs(item.text, st.voiceRate));
    } catch {
      current = null;
      if (item.cue) tone(item.cue, false);
    }
  }

  function next() {
    while (queue.length) {
      const item = queue.shift();
      if (item.expiresAt < now()) { if (item.cue && item.fallbackOnDrop) tone(item.cue, false); continue; }
      speakNow(item);
      return;
    }
  }

  function cancelSpeech() {
    const s = synth();
    clearT(watchdog);
    watchdog = 0;
    current = null;
    try { s?.cancel?.(); } catch { /* ignore */ }
  }

  /**
   * Speak `text`. Returns what happened: "spoken" (started now), "queued", "tone" (fallback tone
   * played), "muted" (sound off) or "none".
   * @param {string} text
   * @param {{priority?: 'low'|'normal'|'high', interrupt?: boolean, cue?: string, maxAgeMs?: number, fallbackOnDrop?: boolean, calm?: boolean, tick?: boolean}} [opts]
   *   calm = slower, quieter delivery for breathing cues; tick:false = no soft tick under the voice.
   */
  function say(text, opts = {}) {
    const st = settingsOf();
    const cue = opts.cue;
    if (!st.sound) return 'muted';
    if (!text || !st.voiceEnabled || !available()) {
      if (cue) { tone(cue, false); return 'tone'; }
      return 'none';
    }
    if (cue && st.beepsWithVoice && opts.tick !== false) tone(cue, true);
    const item = {
      text: String(text),
      priority: PRIORITY[opts.priority] ?? PRIORITY.normal,
      expiresAt: now() + (opts.maxAgeMs ?? DEFAULT_MAX_AGE),
      cue,
      fallbackOnDrop: !!opts.fallbackOnDrop,
      calm: !!opts.calm,
    };
    if (opts.interrupt) {
      queue = [];
      cancelSpeech();
      speakNow(item);
      return 'spoken';
    }
    if (!current) {
      queue = [];
      speakNow(item);
      return 'spoken';
    }
    if (item.priority > current.priority) {
      queue = queue.filter((q) => q.priority > item.priority);
      cancelSpeech();
      speakNow(item);
      return 'spoken';
    }
    // never pile up: the newer cue replaces pending cues of the same or lower priority
    queue = queue.filter((q) => q.priority > item.priority);
    queue.push(item);
    return 'queued';
  }

  /** Drop everything (pending + current) – e.g. when the timer is paused or the view is left. */
  function cancel() {
    queue = [];
    countdownTimers.forEach((id) => clearT(id));
    countdownTimers = [];
    cancelSpeech();
  }

  /** "Drei", "Zwei", "Eins" one second apart (or ticks without voice). */
  function countdown(n = 3, { intervalMs = 1000, cue = 'count' } = {}) {
    countdownTimers.forEach((id) => clearT(id));
    countdownTimers = [];
    for (let i = 0; i < n; i++) {
      const word = countdownWord(n - i);
      const fire = () => say(word, { priority: 'high', cue, maxAgeMs: 700, fallbackOnDrop: true, tick: false });
      if (i === 0) fire();
      else countdownTimers.push(setT(fire, i * intervalMs));
    }
  }

  /** Call inside a user gesture (Start tap): Android Chrome requires a first speak() from a gesture. */
  function unlock() {
    if (unlocked) return;
    const s = synth();
    const U = UtteranceOf();
    if (!s || !U) return;
    try {
      const u = new U(' ');
      u.volume = 0;
      u.lang = 'de-DE';
      s.speak(u);
      unlocked = true;
      loadVoice();
    } catch { /* ignore */ }
  }

  return {
    say, cancel, countdown, unlock, available, active,
    get speaking() { return !!current; },
    get pending() { return queue.map((q) => q.text); },
    get voice() { return loadVoice(); },
    _reset() { cancel(); voice = null; voicesLoaded = false; unlocked = false; listening = false; },
  };
}

/* ------------------------------------------------------------------ default instance */

function readSettings() {
  try { return getSettings() || {}; } catch { return {}; }
}

/** Tone for a phase cue; `soft` = the quiet tick under the voice. Also the secondary vibration. */
function playTone(cue, soft) {
  if (soft) { beep('soft'); return; }
  cueTone(cue);
}

export const voice = createVoice({ settings: readSettings, tone: playTone });

export const say = (text, opts) => voice.say(text, opts);
export const cancel = () => voice.cancel();
export const countdown = (n, opts) => voice.countdown(n, opts);
export const unlock = () => voice.unlock();
export const voiceAvailable = () => voice.available();
export const voiceActive = () => voice.active();

/** Vibration pattern per cue (secondary channel; respects settings.vibration in audio.vibrate). */
export const CUE_VIBRATION = {
  prep: 40, tense: [70], hold: [70], work: [70], relax: [40, 60, 40], switch: [40, 60, 40, 60, 40], rest: [200], 'rep-up': 25, 'rep-down': 25,
  inhale: 30, exhale: 30, 'set-done': [120, 80, 120], 'exercise-done': [150, 80, 150, 80, 150],
};
export function cueVibrate(cue) {
  const p = CUE_VIBRATION[cue];
  if (p) vibrate(p);
}

/** Test phrase for the settings button. Returns whether a German voice was used. */
export function testVoice() {
  unlock();
  const r = say('Hallo! So klingen die Ansagen beim Training. Anspannen – und halten.', { priority: 'high', interrupt: true, cue: 'tense' });
  return r === 'spoken';
}

// Unlock on the first gesture anywhere (browser only), like util/audio.js does for Web Audio.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const events = ['pointerdown', 'touchend', 'keydown'];
  const handler = () => {
    voice.unlock();
    events.forEach((e) => window.removeEventListener(e, handler, true));
  };
  events.forEach((e) => window.addEventListener(e, handler, { capture: true, passive: true }));
}
