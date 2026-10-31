// Tiny html`` tagged template with escaping. See docs/SPEC.md §7.1.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** @param {unknown} s */
export function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

export class SafeHtml {
  /** @param {string} str */
  constructor(str) { this.__html = str; }
  toString() { return this.__html; }
}

/** Mark a string as trusted markup. @param {string} str */
export function raw(str) {
  return new SafeHtml(String(str ?? ''));
}

/** @param {unknown} v @returns {string} */
function toHtml(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.__html;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return escape(v);
}

/**
 * Tagged template: interpolated values are escaped unless they are SafeHtml.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {SafeHtml}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** @param {Element} root @param {SafeHtml|string} tpl */
export function render(root, tpl) {
  root.innerHTML = tpl instanceof SafeHtml ? tpl.__html : String(tpl);
}
