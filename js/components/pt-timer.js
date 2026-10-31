// <pt-timer mode="rest|hold|set" seconds reps tempo rest-between autostart>
// Events: tick {remaining, elapsed, rep}, rep {rep, total}, done {elapsed}. Methods: start(), pause(), reset().
// See docs/SPEC.md §7.5. WP0: minimal working countdown; WP-Timer+audio completes (hold reps, set tempo, ring, wake lock).
import { beep, vibrate } from '../util/audio.js';
import { formatDuration } from '../util/date.js';

const Base = globalThis.HTMLElement ?? class {};

export class PtTimer extends Base {
  static get observedAttributes() { return ['mode', 'seconds', 'reps']; }

  constructor() {
    super();
    this._remainingMs = 0;
    this._endAt = 0;
    this._raf = 0;
    this._startedAt = 0;
    this._onClick = () => (this.running ? this.pause() : this.start());
  }

  get mode() { return this.getAttribute('mode') || 'rest'; }
  get seconds() { return Number(this.getAttribute('seconds')) || 0; }
  get running() { return this._raf !== 0; }
  get remaining() { return Math.ceil(this._remainingMs / 1000); }

  connectedCallback() {
    this.reset();
    if (this.hasAttribute('autostart')) this.start();
  }

  disconnectedCallback() { this._stopLoop(); }

  attributeChangedCallback() { if (this.isConnected && !this.running) this.reset(); }

  start() {
    if (this.running || this._remainingMs <= 0) return;
    this._endAt = performance.now() + this._remainingMs;
    if (!this._startedAt) this._startedAt = performance.now();
    beep('start');
    const loop = () => {
      const prev = this.remaining;
      this._remainingMs = Math.max(0, this._endAt - performance.now());
      if (this.remaining !== prev) {
        this._emit('tick', { remaining: this.remaining, elapsed: this.seconds - this.remaining, rep: 1 });
        if (this.remaining > 0 && this.remaining <= 3) beep('tick');
      }
      this._paint();
      if (this._remainingMs <= 0) {
        this._stopLoop();
        beep('done');
        vibrate([150, 80, 150]);
        this._emit('done', { elapsed: this.seconds });
        return;
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._paint();
  }

  pause() {
    this._stopLoop();
    this._paint();
  }

  reset() {
    this._stopLoop();
    this._remainingMs = this.seconds * 1000;
    this._startedAt = 0;
    this._renderShell();
    this._paint();
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }

  _renderShell() {
    if (this._display) return;
    this.innerHTML = `
      <div class="pt-timer__display num" aria-live="off"></div>
      <button type="button" class="btn btn--primary btn--session pt-timer__toggle"></button>`;
    this._display = this.querySelector('.pt-timer__display');
    this._btn = this.querySelector('.pt-timer__toggle');
    this._btn.addEventListener('click', this._onClick);
  }

  _paint() {
    if (!this._display) return;
    this._display.textContent = formatDuration(Math.ceil(this._remainingMs / 1000));
    this._btn.textContent = this.running ? 'Pause' : this._remainingMs <= 0 ? 'Fertig' : 'Start';
  }
}

if (globalThis.customElements && !customElements.get('pt-timer')) customElements.define('pt-timer', PtTimer);
