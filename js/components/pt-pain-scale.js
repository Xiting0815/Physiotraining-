// <pt-pain-scale value label min max kind="pain|rpe"> – event change {value}.
// See docs/SPEC.md §7.5. WP0: functional minimal version; WP-Design polishes.
import { escape } from '../render.js';

const Base = globalThis.HTMLElement ?? class {};

/** Color class for a pain value (default thresholds). */
export function painClass(v, greenMax = 2, yellowMax = 5) {
  if (v == null) return '';
  return v <= greenMax ? 'is-green' : v <= yellowMax ? 'is-yellow' : 'is-red';
}

export class PtPainScale extends Base {
  static get observedAttributes() { return ['value', 'label', 'min', 'max', 'kind']; }

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
    if (!this._bound) {
      this._bound = true;
      this.addEventListener('click', (e) => {
        const b = e.target.closest?.('button[data-v]');
        if (!b) return;
        this._select(Number(b.dataset.v));
      });
      this.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const { min, max } = this._range();
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1;
        this._select(Math.max(min, Math.min(max, (this.value ?? min) + d)));
        this.querySelector('[aria-checked="true"]')?.focus();
      });
    }
  }

  attributeChangedCallback() { if (this.isConnected) this._render(); }

  _range() {
    const kind = this.getAttribute('kind') || 'pain';
    const min = Number(this.getAttribute('min') ?? (kind === 'rpe' ? 1 : 0));
    const max = Number(this.getAttribute('max') ?? 10);
    return { min, max, kind };
  }

  _select(v) {
    this.value = v;
    this.dispatchEvent(new CustomEvent('change', { detail: { value: v }, bubbles: true }));
  }

  _render() {
    const { min, max, kind } = this._range();
    const label = this.getAttribute('label') || (kind === 'rpe' ? 'Anstrengung (RPE)' : 'Schmerz');
    const cur = this.value;
    let btns = '';
    for (let v = min; v <= max; v++) {
      const cls = kind === 'pain' ? painClass(v) : '';
      const sel = v === cur;
      btns += `<button type="button" role="radio" class="pain-scale__btn ${cls}" data-v="${v}" aria-checked="${sel}" tabindex="${sel || (cur == null && v === min) ? 0 : -1}">${v}</button>`;
    }
    this.innerHTML = `<div class="pain-scale" role="radiogroup" aria-label="${escape(label)}"><div class="pain-scale__label">${escape(label)}</div><div class="pain-scale__buttons">${btns}</div></div>`;
  }
}

if (globalThis.customElements && !customElements.get('pt-pain-scale')) customElements.define('pt-pain-scale', PtPainScale);
