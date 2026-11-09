// <pt-pain-scale value label min max kind="pain|rpe" green-max yellow-max> – event change {value}.
// See docs/SPEC.md §7.5. Accessible radiogroup (roving tabindex, arrows/Home/End), 6 + 5 grid,
// green → red ramp (pain) or neutral petrol (rpe), word anchors under the scale.
import { escape } from '../render.js';

const Base = globalThis.HTMLElement ?? class {};

/** Color class for a pain value (default thresholds). */
export function painClass(v, greenMax = 2, yellowMax = 5) {
  if (v == null) return '';
  return v <= greenMax ? 'is-green' : v <= yellowMax ? 'is-yellow' : 'is-red';
}

/** German word for a pain value 0–10. */
export function painWord(v) {
  if (v == null) return '';
  if (v === 0) return 'kein Schmerz';
  if (v <= 2) return 'leicht';
  if (v <= 5) return 'mäßig';
  if (v <= 7) return 'stark';
  return 'sehr stark';
}

/** German word for an RPE value 1–10. */
export function rpeWord(v) {
  if (v == null) return '';
  if (v <= 2) return 'sehr leicht';
  if (v <= 4) return 'leicht';
  if (v <= 6) return 'mittel';
  if (v <= 8) return 'schwer';
  if (v <= 9) return 'sehr schwer';
  return 'maximal';
}

let uid = 0;

export class PtPainScale extends Base {
  static get observedAttributes() { return ['value', 'label', 'min', 'max', 'kind', 'green-max', 'yellow-max']; }

  get value() {
    const v = this.getAttribute('value');
    return v === null || v === '' ? null : Number(v);
  }
  set value(v) {
    if (v === null || v === undefined || v === '') this.removeAttribute('value');
    else this.setAttribute('value', String(v));
  }

  connectedCallback() {
    this._render();
    if (this._bound) return;
    this._bound = true;
    this.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest?.('button[data-v]');
      if (!b || !this.contains(b)) return;
      this._select(Number(b.dataset.v), true);
    });
    this.addEventListener('keydown', (e) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const { min, max } = this._range();
      let v = this.value;
      if (e.key === 'Home') v = min;
      else if (e.key === 'End') v = max;
      else {
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        v = v == null ? (d > 0 ? min : max) : Math.max(min, Math.min(max, v + d));
      }
      this._select(v, true);
    });
  }

  attributeChangedCallback(name) {
    if (!this.isConnected || !this._built) return;
    if (name === 'value') this._sync();
    else this._render();
  }

  _range() {
    const kind = this.getAttribute('kind') === 'rpe' ? 'rpe' : 'pain';
    const min = Number(this.getAttribute('min') ?? (kind === 'rpe' ? 1 : 0));
    const max = Number(this.getAttribute('max') ?? 10);
    const greenMax = Number(this.getAttribute('green-max') ?? 2);
    const yellowMax = Number(this.getAttribute('yellow-max') ?? 5);
    return { min, max, kind, greenMax, yellowMax };
  }

  _word(v) { return this._range().kind === 'rpe' ? rpeWord(v) : painWord(v); }

  _select(v, focus = false) {
    const changed = v !== this.value;
    this.value = v;
    this._sync();
    if (focus) /** @type {HTMLElement|null} */ (this.querySelector(`button[data-v="${v}"]`))?.focus();
    if (changed) this.dispatchEvent(new CustomEvent('change', { detail: { value: v }, bubbles: true }));
  }

  _sync() {
    const { min, greenMax, yellowMax, kind } = this._range();
    const cur = this.value;
    for (const b of this.querySelectorAll('button[data-v]')) {
      const v = Number(/** @type {HTMLElement} */ (b).dataset.v);
      const sel = v === cur;
      b.setAttribute('aria-checked', String(sel));
      b.setAttribute('tabindex', sel || (cur == null && v === min) ? '0' : '-1');
    }
    const out = this.querySelector('.pain-scale__current');
    if (out) {
      out.textContent = cur == null ? 'bitte wählen' : `${cur} · ${this._word(cur)}`;
      out.className = 'pain-scale__current ' + (kind === 'pain' && cur != null ? painClass(cur, greenMax, yellowMax) : '');
    }
  }

  _render() {
    const { min, max, kind, greenMax, yellowMax } = this._range();
    const label = this.getAttribute('label') || (kind === 'rpe' ? 'Anstrengung (RPE)' : 'Schmerz');
    const id = this._id || (this._id = `pps-${++uid}`);
    let btns = '';
    for (let v = min; v <= max; v++) {
      const cls = kind === 'pain' ? painClass(v, greenMax, yellowMax) + (v > greenMax && v <= yellowMax ? ' is-mid' : '') : '';
      btns += `<button type="button" role="radio" class="pain-scale__btn ${cls}" data-v="${v}" aria-checked="false" tabindex="-1" aria-label="${v} – ${escape(this._word(v))}">${v}</button>`;
    }
    const anchors = kind === 'rpe'
      ? ['sehr leicht', 'mittel', 'maximal']
      : ['kein Schmerz', 'mäßig', 'stärkster'];
    this.innerHTML = `<div class="pain-scale pain-scale--${kind}">
  <div class="pain-scale__head"><span class="pain-scale__label" id="${id}-l">${escape(label)}</span><span class="pain-scale__current" aria-hidden="true"></span></div>
  <div class="pain-scale__buttons" role="radiogroup" aria-labelledby="${id}-l">${btns}</div>
  <div class="pain-scale__bar" aria-hidden="true"></div>
  <div class="pain-scale__anchors" aria-hidden="true" style="font-size:max(14px,var(--fs-sm,0.875rem))"><span>${min} ${anchors[0]}</span><span>${anchors[1]}</span><span>${anchors[2]} ${max}</span></div>
</div>`;
    this._built = true;
    this._sync();
  }
}

if (globalThis.customElements && !customElements.get('pt-pain-scale')) customElements.define('pt-pain-scale', PtPainScale);
