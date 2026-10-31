// <pt-timer mode="rest|hold|set" seconds reps tempo rest-between autostart [sets set-rest]>
// See docs/SPEC.md §7.5.
//
// Modes
//   rest  – single countdown of `seconds` (rest between sets). ±15 s adjust, skip.
//   hold  – isometric holds: `reps` × (hold `seconds`, then `rest-between` s, default 3),
//           optionally repeated for `sets` sets with `set-rest` s between sets (additive attrs,
//           defaults 1 / 30). Emits `rep` after every completed hold.
//   set   – `seconds` > 0 and no tempo → one timed work phase (exercise type "timed").
//           Otherwise a tempo-guided rep counter: `reps` × tempo ("ecc-pause-con", default 2-0-2),
//           emitting `rep` after every rep.
//
// Methods: start(), pause(), reset(), skip(), adjust(deltaSeconds). Props: running, remaining, rep, phase.
// Events (bubbling CustomEvent): tick {remaining, elapsed, rep}, rep {rep, total, set, sets}, done {elapsed}.
//
// Timing is timestamp based (Date.now() deltas), never interval counting, so it stays correct when
// the tab is throttled or backgrounded; on return it catches up (emitting the missed rep events
// quietly). Wake Lock keeps the screen on while running and is re-acquired on visibilitychange.
// Light DOM (no shadow root) so global CSS can style it; minimal default styles are injected once
// with zero specificity (:where) – override freely via classes or the CSS custom properties
// --pt-timer-color, --pt-timer-rest-color, --pt-timer-size, --pt-timer-progress (set by the element).
import { beep, vibrate, unlock } from '../util/audio.js';
import { formatDuration } from '../util/date.js';

const Base = globalThis.HTMLElement ?? class {};

/* ------------------------------------------------------------------ pure helpers (Node-testable) */

/** "3-1-1" → [3, 1, 1] (seconds; ecc-pause-con). Invalid/empty → null. */
export function parseTempo(str) {
  if (str == null || str === '') return null;
  const parts = String(str).split(/[-–:/ ]+/).map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts[0] + parts[1] + parts[2] <= 0) return null;
  return parts;
}

const LABELS = {
  rest: 'Pause',
  hold: 'Halten',
  pause: 'Locker lassen',
  setrest: 'Satzpause',
  work: 'Los!',
  ecc: 'Nachgeben',
  iso: 'Halten',
  con: 'Anspannen',
};
const WORK_KINDS = new Set(['hold', 'work', 'ecc', 'iso', 'con']);
export const isWorkPhase = (kind) => WORK_KINDS.has(kind);

const posInt = (v, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : d;
};
const nonNeg = (v, d) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/**
 * Build the phase timeline.
 * @param {{mode?:string, seconds?:number, reps?:number, tempo?:string|null, restBetween?:number, sets?:number, setRest?:number}} o
 * @returns {{kind:string,label:string,ms:number,rep:number,set:number,totalReps:number,sets:number,endsRep:boolean}[]}
 */
export function buildPhases(o = {}) {
  const mode = o.mode || 'rest';
  const seconds = nonNeg(o.seconds, 0);
  const phases = [];
  const push = (kind, sec, extra = {}) => {
    if (sec > 0) phases.push({ kind, label: LABELS[kind], ms: Math.round(sec * 1000), rep: 1, set: 1, totalReps: 1, sets: 1, endsRep: false, ...extra });
  };

  if (mode === 'hold') {
    const reps = posInt(o.reps, 1);
    const sets = posInt(o.sets, 1);
    const restBetween = nonNeg(o.restBetween, 3);
    const setRest = nonNeg(o.setRest, 30);
    if (seconds <= 0) return phases;
    for (let s = 1; s <= sets; s++) {
      for (let r = 1; r <= reps; r++) {
        const base = { rep: r, set: s, totalReps: reps, sets };
        push('hold', seconds, { ...base, endsRep: true });
        if (r < reps) push('pause', restBetween, base);
      }
      if (s < sets) push('setrest', setRest, { rep: reps, set: s, totalReps: reps, sets });
    }
    return phases;
  }

  if (mode === 'set') {
    const tempo = parseTempo(o.tempo);
    const reps = posInt(o.reps, 0);
    if (seconds > 0 && !tempo) {
      push('work', seconds);
      return phases;
    }
    if (reps > 0) {
      const [ecc, iso, con] = tempo || [2, 0, 2];
      for (let r = 1; r <= reps; r++) {
        const base = { rep: r, set: 1, totalReps: reps, sets: 1 };
        // the last non-zero part of a rep closes it
        const parts = [['ecc', ecc], ['iso', iso], ['con', con]].filter(([, s]) => s > 0);
        parts.forEach(([kind, s], i) => push(kind, s, { ...base, endsRep: i === parts.length - 1 }));
      }
      return phases;
    }
    push('work', seconds);
    return phases;
  }

  // rest (default)
  push('rest', seconds);
  return phases;
}

/** Total duration of a timeline in ms. */
export function totalMs(phases) {
  return phases.reduce((sum, p) => sum + p.ms, 0);
}

/**
 * Where are we after `elapsedMs`?
 * @returns {{index:number, phase:object|null, phaseElapsedMs:number, remainingMs:number, done:boolean}}
 *   index === phases.length when done.
 */
export function locate(phases, elapsedMs) {
  let start = 0;
  const t = Math.max(0, elapsedMs);
  for (let i = 0; i < phases.length; i++) {
    const end = start + phases[i].ms;
    if (t < end) return { index: i, phase: phases[i], phaseElapsedMs: t - start, remainingMs: end - t, done: false };
    start = end;
  }
  return { index: phases.length, phase: null, phaseElapsedMs: 0, remainingMs: 0, done: true };
}

/** Start offset (ms) of phase `index`. */
export function phaseStart(phases, index) {
  let s = 0;
  for (let i = 0; i < index && i < phases.length; i++) s += phases[i].ms;
  return s;
}

/* ------------------------------------------------------------------ default styles */

const STYLE_ID = 'pt-timer-styles';
const CSS = `
:where(pt-timer){display:block;--pt-timer-size:min(72vw,280px);--pt-timer-progress:0;text-align:center}
:where(pt-timer) :where(.pt-timer__dial){position:relative;width:var(--pt-timer-size);aspect-ratio:1;margin:0 auto var(--s-4,16px)}
:where(pt-timer) :where(.pt-timer__ring){width:100%;height:100%;transform:rotate(-90deg);display:block}
:where(pt-timer) :where(.pt-timer__track){fill:none;stroke:var(--surface-2,#EEF1F4);stroke-width:8}
:where(pt-timer) :where(.pt-timer__progress){fill:none;stroke:var(--pt-timer-color,var(--primary,#0E7C86));stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .12s linear,stroke .2s ease-out}
:where(pt-timer[data-kind="rest"],pt-timer[data-kind="pause"],pt-timer[data-kind="setrest"]) :where(.pt-timer__progress){stroke:var(--pt-timer-rest-color,var(--accent,#E07A1F))}
:where(pt-timer[data-state="done"]) :where(.pt-timer__progress){stroke:var(--green,#1F8A4C)}
:where(pt-timer) :where(.pt-timer__center){position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
:where(pt-timer) :where(.pt-timer__phase){font-size:var(--fs-sm,14px);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5B6573);min-height:1.2em}
:where(pt-timer) :where(.pt-timer__display){font-size:var(--fs-timer,clamp(72px,22vw,112px));font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--text,#14181F)}
:where(pt-timer) :where(.pt-timer__meta){font-size:var(--fs-md,16px);color:var(--muted,#5B6573);font-variant-numeric:tabular-nums;min-height:1.3em}
:where(pt-timer) :where(.pt-timer__controls){display:flex;align-items:center;justify-content:center;gap:var(--s-3,12px)}
:where(pt-timer) :where(.pt-timer__toggle){min-width:9rem;min-height:var(--tap-session,60px)}
:where(pt-timer) :where(.pt-timer__adj){min-width:var(--tap-session,60px);min-height:var(--tap-session,60px);padding:0 var(--s-3,12px);font-variant-numeric:tabular-nums}
:where(pt-timer) :where(.pt-timer__secondary){display:flex;justify-content:center;gap:var(--s-3,12px);margin-top:var(--s-3,12px)}
:where(pt-timer) :where(.pt-timer__secondary .btn){min-height:var(--tap,48px);background:transparent;color:var(--muted,#5B6573)}
pt-timer[data-adjust="off"] .pt-timer__adj{display:none}
:where(pt-timer) :where(.pt-timer__live){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion: reduce){:where(pt-timer) :where(.pt-timer__progress){transition:none}}
`;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  // prepend so app stylesheets (loaded via <link>) win on equal specificity anyway
  document.head.prepend(style);
}

const R = 54;
const CIRC = 2 * Math.PI * R;
const TICK_MS = 100;

/* ------------------------------------------------------------------ element */

export class PtTimer extends Base {
  static get observedAttributes() { return ['mode', 'seconds', 'reps', 'tempo', 'rest-between', 'sets', 'set-rest']; }

  constructor() {
    super();
    this._phases = [];
    this._accum = 0;          // ms elapsed before the current run
    this._runStart = null;    // Date.now() at start of current run, null when not running
    this._idx = 0;            // index of the phase we last processed
    this._lastSec = null;
    this._lastUpdate = 0;
    this._done = false;
    this._timer = 0;
    this._wake = null;
    this._built = false;
    this._onClick = (e) => this._handleClick(e);
    this._onVisibility = () => this._handleVisibility();
  }

  /* --- attributes / props */
  get mode() { return this.getAttribute('mode') || 'rest'; }
  get seconds() { return Number(this.getAttribute('seconds')) || 0; }
  get running() { return this._runStart !== null; }
  /** remaining seconds of the current phase */
  get remaining() {
    const loc = locate(this._phases, this._elapsed());
    return Math.ceil(loc.remainingMs / 1000);
  }
  /** current rep (1-based) */
  get rep() {
    const loc = locate(this._phases, this._elapsed());
    return loc.phase ? loc.phase.rep : (this._phases.at(-1)?.rep ?? 1);
  }
  /** current phase kind ('rest'|'hold'|'pause'|'setrest'|'work'|'ecc'|'iso'|'con') or null when done */
  get phase() { return locate(this._phases, this._elapsed()).phase?.kind ?? null; }
  get done() { return this._done; }

  _now() { return Date.now(); }
  _elapsed() { return this._accum + (this._runStart !== null ? this._now() - this._runStart : 0); }

  /* --- lifecycle */
  connectedCallback() {
    ensureStyles();
    this._renderShell();
    this.addEventListener('click', this._onClick);
    document.addEventListener('visibilitychange', this._onVisibility);
    if (this._built && (this.running || this._accum > 0 || this._done)) {
      // re-attached (e.g. moved in the DOM): keep progress
      if (this.running) { this._startLoop(); this._acquireWake(); }
      this._update();
      return;
    }
    this._built = true;
    this.reset();
    if (this.hasAttribute('autostart')) this.start();
  }

  disconnectedCallback() {
    this._stopLoop();
    this._releaseWake();
    this.removeEventListener('click', this._onClick);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV || !this.isConnected || !this._built || this.running) return;
    this.reset();
  }

  /* --- public API */
  start() {
    if (this.running) return;
    unlock();
    if (this._done) this.reset();
    if (!this._phases.length) return;
    const fresh = this._accum === 0;
    this._runStart = this._now();
    this._lastUpdate = this._now();
    if (fresh) {
      const first = this._phases[0];
      beep(isWorkPhase(first.kind) ? 'start' : 'tick');
      this._announce(this._describe(first, true));
    } else {
      this._announce('Weiter');
    }
    this._startLoop();
    this._acquireWake();
    this._update();
  }

  pause() {
    if (!this.running) { this._paint(); return; }
    this._accum = this._elapsed();
    this._runStart = null;
    this._stopLoop();
    this._releaseWake();
    this._announce('Pausiert');
    this._paint();
  }

  reset() {
    this._stopLoop();
    this._releaseWake();
    this._phases = buildPhases({
      mode: this.mode,
      seconds: this.seconds,
      reps: this.getAttribute('reps'),
      tempo: this.getAttribute('tempo'),
      restBetween: this.getAttribute('rest-between'),
      sets: this.getAttribute('sets'),
      setRest: this.getAttribute('set-rest'),
    });
    this._accum = 0;
    this._runStart = null;
    this._idx = 0;
    this._lastSec = null;
    this._done = false;
    this._paint();
  }

  /** Jump to the end of the current phase (rest mode: finishes the timer). */
  skip() {
    if (this._done || !this._phases.length) return;
    const loc = locate(this._phases, this._elapsed());
    if (loc.done) return;
    const end = phaseStart(this._phases, loc.index) + this._phases[loc.index].ms;
    this._accum = end;
    if (this.running) this._runStart = this._now();
    this._lastUpdate = this._now();
    this._update(true);
  }

  /** Lengthen/shorten the current phase by `delta` seconds (e.g. ±15). */
  adjust(delta) {
    if (this._done || !this._phases.length) return;
    const loc = locate(this._phases, this._elapsed());
    if (loc.done) return;
    const p = this._phases[loc.index];
    const newMs = p.ms + delta * 1000;
    if (!this.running && this._accum === 0) {
      // not started yet: change the planned duration, keep at least 5 s
      p.ms = Math.max(5000, newMs);
    } else if (newMs - loc.phaseElapsedMs <= 0) {
      p.ms = loc.phaseElapsedMs; // ends the phase now
    } else {
      p.ms = newMs;
    }
    this._lastSec = null;
    if (delta !== 0) this._announce(`${delta > 0 ? 'Plus' : 'Minus'} ${Math.abs(delta)} Sekunden`);
    this._update(true);
  }

  /* --- internals */
  _startLoop() {
    if (this._timer) return;
    this._timer = setInterval(() => this._update(), TICK_MS);
  }

  _stopLoop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = 0;
  }

  _update(quietCatchUp = false) {
    if (!this._phases.length) { this._paint(); return; }
    const now = this._now();
    const el = this._elapsed();
    const loc = locate(this._phases, el);
    // A gap >1.5 s since the last update means we were throttled/backgrounded → catch up quietly.
    const quiet = quietCatchUp || now - this._lastUpdate > 1500 || loc.index - this._idx > 1;
    this._lastUpdate = now;

    while (this._idx < loc.index) {
      const ended = this._phases[this._idx];
      if (ended.endsRep) {
        this._emit('rep', { rep: ended.rep, total: ended.totalReps, set: ended.set, sets: ended.sets });
      }
      this._idx++;
      const next = this._phases[this._idx];
      if (next) this._phaseStarted(next, quiet && this._idx < loc.index);
      this._lastSec = null;
    }

    if (loc.done) {
      if (!this._done) this._finish(el);
      return;
    }

    const sec = Math.ceil(loc.remainingMs / 1000);
    if (sec !== this._lastSec) {
      this._lastSec = sec;
      this._emit('tick', { remaining: sec, elapsed: Math.floor(el / 1000), rep: loc.phase.rep });
      if (this.running && !quiet && loc.phase.ms >= 5000 && sec > 0 && sec <= 3) {
        beep('tick');
        if (sec === 3) this._announce('3');
      }
    }
    this._paint(loc);
  }

  _phaseStarted(phase, silent) {
    if (silent) return;
    if (!this.running) { this._announce(this._describe(phase)); return; }
    if (phase.kind === 'hold' || phase.kind === 'work') { beep('start'); vibrate(60); }
    else if (phase.kind === 'ecc' || phase.kind === 'iso' || phase.kind === 'con') beep('tick');
    else { beep('rep'); vibrate(40); }
    // tempo phases are too short for useful speech; announce only rep changes there
    if (!['ecc', 'iso', 'con'].includes(phase.kind)) this._announce(this._describe(phase));
    else if (phase === this._phases.find((p) => p.rep === phase.rep && p.set === phase.set)) this._announce(`Wiederholung ${phase.rep} von ${phase.totalReps}`);
  }

  _describe(phase, first = false) {
    const secs = Math.round(phase.ms / 1000);
    switch (phase.kind) {
      case 'hold': {
        const set = phase.sets > 1 ? `, Satz ${phase.set} von ${phase.sets}` : '';
        return `Wiederholung ${phase.rep} von ${phase.totalReps}${set}: ${secs} Sekunden halten`;
      }
      case 'pause': return `Locker lassen, ${secs} Sekunden`;
      case 'setrest': return `Satzpause, ${secs} Sekunden`;
      case 'rest': return `Pause, ${secs} Sekunden`;
      case 'work': return `Los, ${secs} Sekunden`;
      default: return first ? `Wiederholung 1 von ${phase.totalReps}` : LABELS[phase.kind];
    }
  }

  _finish(el) {
    this._done = true;
    this._accum = totalMs(this._phases);
    this._runStart = null;
    this._idx = this._phases.length;
    this._stopLoop();
    this._releaseWake();
    beep('done');
    vibrate([150, 80, 150]);
    this._announce(this.mode === 'rest' ? 'Pause vorbei' : 'Fertig');
    this._emit('done', { elapsed: Math.round(el / 1000) });
    this._paint();
  }

  _handleVisibility() {
    if (document.visibilityState === 'visible' && this.running) {
      this._acquireWake();
      this._update();
    }
  }

  async _acquireWake() {
    try {
      const wl = globalThis.navigator?.wakeLock;
      if (!wl || this._wake || document.visibilityState !== 'visible') return;
      const lock = await wl.request('screen');
      if (!this.running || !this.isConnected) { lock.release().catch(() => {}); return; }
      this._wake = lock;
      lock.addEventListener?.('release', () => { if (this._wake === lock) this._wake = null; });
    } catch { /* not allowed / unsupported */ }
  }

  _releaseWake() {
    const lock = this._wake;
    this._wake = null;
    if (lock) lock.release().catch(() => {});
  }

  _handleClick(e) {
    const btn = e.target.closest?.('[data-action]');
    if (!btn || !this.contains(btn)) return;
    switch (btn.dataset.action) {
      case 'toggle': this.running ? this.pause() : this.start(); break;
      case 'plus': this.adjust(15); break;
      case 'minus': this.adjust(-15); break;
      case 'skip': this.skip(); break;
      case 'reset': this.reset(); this._announce('Zurückgesetzt'); break;
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }

  _announce(text) {
    if (!this._live) return;
    // clear first so repeated identical messages are announced again
    this._live.textContent = '';
    clearTimeout(this._liveT);
    this._liveT = setTimeout(() => { if (this._live) this._live.textContent = text; }, 30);
  }

  _renderShell() {
    if (this._display) return;
    this.innerHTML = `
      <div class="pt-timer__dial">
        <svg class="pt-timer__ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle class="pt-timer__track" cx="60" cy="60" r="${R}"></circle>
          <circle class="pt-timer__progress" cx="60" cy="60" r="${R}" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="0"></circle>
        </svg>
        <div class="pt-timer__center">
          <div class="pt-timer__phase"></div>
          <div class="pt-timer__display num" role="timer" aria-live="off" aria-atomic="true"></div>
          <div class="pt-timer__meta num"></div>
        </div>
      </div>
      <div class="pt-timer__controls">
        <button type="button" class="btn btn--session pt-timer__adj" data-action="minus" aria-label="15 Sekunden weniger">−15</button>
        <button type="button" class="btn btn--primary btn--session pt-timer__toggle" data-action="toggle"></button>
        <button type="button" class="btn btn--session pt-timer__adj" data-action="plus" aria-label="15 Sekunden mehr">+15</button>
      </div>
      <div class="pt-timer__secondary">
        <button type="button" class="btn pt-timer__reset" data-action="reset">Zurücksetzen</button>
        <button type="button" class="btn pt-timer__skip" data-action="skip">Überspringen</button>
      </div>
      <div class="pt-timer__live" role="status" aria-live="polite" aria-atomic="true"></div>`;
    this._display = this.querySelector('.pt-timer__display');
    this._phaseEl = this.querySelector('.pt-timer__phase');
    this._metaEl = this.querySelector('.pt-timer__meta');
    this._ringEl = this.querySelector('.pt-timer__progress');
    this._btn = this.querySelector('.pt-timer__toggle');
    this._live = this.querySelector('.pt-timer__live');
  }

  _paint(loc = locate(this._phases, this._elapsed())) {
    if (!this._display) return;
    const phases = this._phases;
    const state = this._done ? 'done' : this.running ? 'running' : this._accum > 0 ? 'paused' : 'idle';
    const phase = loc.phase || phases.at(-1) || null;
    const remainingSec = this._done ? 0 : Math.ceil(loc.remainingMs / 1000);
    const progress = this._done || !loc.phase ? 1 : loc.phaseElapsedMs / loc.phase.ms;

    this.dataset.state = state;
    this.dataset.kind = this._done ? 'done' : phase?.kind || 'rest';
    const tempoMode = phases.some((p) => p.kind === 'ecc' || p.kind === 'iso' || p.kind === 'con');
    this.dataset.adjust = tempoMode || !phases.length || this._done ? 'off' : 'on';
    this.style.setProperty('--pt-timer-progress', progress.toFixed(3));

    this._display.textContent = formatDuration(remainingSec);
    // ring shows the remaining part of the current phase; full (green) ring when done
    this._ringEl.setAttribute('stroke-dashoffset', this._done ? '0' : (CIRC * progress).toFixed(2));
    this._phaseEl.textContent = this._done ? 'Fertig' : phase ? phase.label : '';

    let meta = '';
    if (phase && (phase.totalReps > 1 || this.mode === 'hold' || tempoMode)) {
      meta = `Wdh. ${phase.rep}/${phase.totalReps}`;
      if (phase.sets > 1) meta += ` · Satz ${phase.set}/${phase.sets}`;
    }
    this._metaEl.textContent = meta;

    const label = { idle: 'Start', running: 'Pause', paused: 'Weiter', done: 'Nochmal' }[state];
    if (this._btn.textContent !== label) this._btn.textContent = label;
    this._btn.setAttribute('aria-label', { idle: 'Timer starten', running: 'Timer pausieren', paused: 'Timer fortsetzen', done: 'Timer neu starten' }[state]);
    this._btn.disabled = !phases.length;
    const skip = this.querySelector('.pt-timer__skip');
    if (skip) skip.disabled = this._done || !phases.length;
  }
}

if (globalThis.customElements && !customElements.get('pt-timer')) customElements.define('pt-timer', PtTimer);
