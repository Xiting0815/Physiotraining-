// RENPHO app screenshot (body-composition list) → HealthEntry. PURE (Node-testable). See docs/SPEC.md §13.
//
// Input is OCR output: plain text, or tesseract lines ({text, bbox, confidence}), or the full
// `recognize()` result from ./ocr.js ({text, lines, regions}). The RENPHO list looks like
//
//   Körperfettanteil                ← label (German or English)
//   Hoch                33.6 %      ← status word (ignored) + value with unit, same or next line
//
// Robustness against OCR noise:
// - labels are matched fuzzily (Levenshtein on whole word spans, umlauts folded, short icon junk dropped),
//   two-line labels ("Fettfreies / Körpergewicht") are joined;
// - numbers accept comma/dot/colon decimals and O→0, l/I/|→1 inside digit groups;
// - a value belongs to the most recent label still waiting for one (row layout); when several labels
//   are waiting in a row (column layout) the oldest compatible one gets it;
// - unit/range checks (HEALTH_FIELDS) reject icon garbage ("0,", "(0)"); a lost decimal point ("33%" for
//   bone 3.3 %) is repaired by /10 or /100 when that fits the range – flagged as suspicious;
// - plausibility: fat/muscle/bone/water/protein kg ≈ weight × % and fat-free ≈ weight − fat mass.
import { HEALTH_FIELDS, roundField } from '../logic/health.js';
import { normalizeNumber } from './common.js';

export const RENPHO_SOURCE = 'renpho-ocr';

/** The 19 RENPHO fields in screen order. */
export const RENPHO_FIELDS = ['weightKg', 'bmi', 'bodyFatPct', 'bodyFatKg', 'subcutFatPct', 'visceralFat', 'musclePct',
  'muscleKg', 'skeletalMusclePct', 'skeletalMuscleKg', 'bonePct', 'boneKg', 'fatFreeKg', 'metabolicAge', 'bmrKcal',
  'waterPct', 'waterKg', 'proteinPct', 'proteinKg'];

/** Kind of value per field: which units are accepted. */
const KIND = {
  weightKg: 'kg', bmi: 'plain', bodyFatPct: 'pct', bodyFatKg: 'kg', subcutFatPct: 'pct', visceralFat: 'plain',
  musclePct: 'pct', muscleKg: 'kg', skeletalMusclePct: 'pct', skeletalMuscleKg: 'kg', bonePct: 'pct', boneKg: 'kg',
  fatFreeKg: 'kg', metabolicAge: 'age', bmrKcal: 'kcal', waterPct: 'pct', waterKg: 'kg', proteinPct: 'pct', proteinKg: 'kg',
};

/**
 * Labels → target. `field` = fixed field; `pct`/`kg` = ambiguous label resolved by the unit
 * (RENPHO's ring legend says „Körperfett 34.31 kg“). `prio` 2 = list label, 1 = ambiguous/legend label.
 */
const LABELS = [
  // German (RENPHO app „Körperanalysewaage“)
  ['Gewicht', { field: 'weightKg' }],
  ['BMI', { field: 'bmi' }],
  ['BMl', { field: 'bmi' }],
  ['Körperfettanteil', { field: 'bodyFatPct' }],
  ['Körperfettmasse', { field: 'bodyFatKg' }],
  ['Körperfett', { pct: 'bodyFatPct', kg: 'bodyFatKg', prio: 1 }],
  ['Fettmasse', { field: 'bodyFatKg', prio: 1 }],
  ['Subkutanes Fett', { field: 'subcutFatPct' }],
  ['Unterhautfett', { field: 'subcutFatPct' }],
  ['Viszeralfett', { field: 'visceralFat' }],
  ['Viszerales Fett', { field: 'visceralFat' }],
  ['Muskelanteil', { field: 'musclePct' }],
  ['Muskelmasse', { field: 'muscleKg' }],
  ['Skelettmuskelanteil', { field: 'skeletalMusclePct' }],
  ['Skelettmuskelmasse', { field: 'skeletalMuscleKg' }],
  ['Skelettmuskel', { pct: 'skeletalMusclePct', kg: 'skeletalMuscleKg', prio: 1 }],
  ['Knochenanteil', { field: 'bonePct' }],
  ['Knochenmasse', { field: 'boneKg' }],
  ['Fettfreies Körpergewicht', { field: 'fatFreeKg' }],
  ['Fettfreies', { field: 'fatFreeKg', prio: 1 }],
  ['Fettfreie Masse', { field: 'fatFreeKg' }],
  ['Magermasse', { field: 'fatFreeKg' }],
  ['Stoffwechselalter', { field: 'metabolicAge' }],
  ['Körperalter', { field: 'metabolicAge', prio: 1 }],
  ['Grundumsatz', { field: 'bmrKcal' }],
  ['Körperwasseranteil', { field: 'waterPct' }],
  ['Körperwassermasse', { field: 'waterKg' }],
  ['Körperwasser', { pct: 'waterPct', kg: 'waterKg', prio: 1 }],
  ['Wasseranteil', { field: 'waterPct', prio: 1 }],
  ['Proteinanteil', { field: 'proteinPct' }],
  ['Proteinmasse', { field: 'proteinKg' }],
  ['Protein', { pct: 'proteinPct', kg: 'proteinKg', prio: 1 }],
  ['Eiweiß', { pct: 'proteinPct', kg: 'proteinKg', prio: 1 }],
  // English (RENPHO app in English)
  ['Weight', { field: 'weightKg' }],
  ['Body Weight', { field: 'weightKg' }],
  ['Body Fat', { pct: 'bodyFatPct', kg: 'bodyFatKg' }],
  ['Body Fat Rate', { field: 'bodyFatPct' }],
  ['Body Fat Percentage', { field: 'bodyFatPct' }],
  ['Body Fat Mass', { field: 'bodyFatKg' }],
  ['Fat Mass', { field: 'bodyFatKg' }],
  ['Subcutaneous Fat', { field: 'subcutFatPct' }],
  ['Visceral Fat', { field: 'visceralFat' }],
  ['Muscle Rate', { field: 'musclePct' }],
  ['Muscle Percentage', { field: 'musclePct' }],
  ['Muscle Mass', { field: 'muscleKg' }],
  ['Skeletal Muscle', { pct: 'skeletalMusclePct', kg: 'skeletalMuscleKg' }],
  ['Skeletal Muscle Rate', { field: 'skeletalMusclePct' }],
  ['Skeletal Muscle Mass', { field: 'skeletalMuscleKg' }],
  ['Bone Rate', { field: 'bonePct' }],
  ['Bone Mass', { field: 'boneKg' }],
  ['Fat-free Body Weight', { field: 'fatFreeKg' }],
  ['Fat-free Mass', { field: 'fatFreeKg' }],
  ['Lean Body Mass', { field: 'fatFreeKg' }],
  ['Metabolic Age', { field: 'metabolicAge' }],
  ['Body Age', { field: 'metabolicAge', prio: 1 }],
  ['BMR', { field: 'bmrKcal' }],
  ['Basal Metabolic Rate', { field: 'bmrKcal' }],
  ['Body Water', { pct: 'waterPct', kg: 'waterKg' }],
  ['Body Water Rate', { field: 'waterPct' }],
  ['Body Water Mass', { field: 'waterKg' }],
  ['Water Mass', { field: 'waterKg' }],
  ['Protein Rate', { field: 'proteinPct' }],
  ['Protein Mass', { field: 'proteinKg' }],
].map(([label, t]) => ({ label, key: fold(label).replace(/ /g, ''), words: fold(label).split(' ').length, prio: t.prio ?? 2, ...t }));

/** Status words RENPHO prints between label and value – never a label, never a value. */
export const STATUS_WORDS = ['hoch', 'sehr hoch', 'zu hoch', 'niedrig', 'zu niedrig', 'normal', 'standard', 'gut', 'optimal',
  'ausgezeichnet', 'durchschnittlich', 'uberdurchschnittlich', 'unterdurchschnittlich', 'unzureichend', 'ubergewicht',
  'untergewicht', 'adipositas', 'fettleibig', 'high', 'very high', 'low', 'excellent', 'good', 'average', 'above average',
  'below average', 'insufficient', 'obese', 'overweight', 'underweight', 'healthy'];

/** lower-case, umlauts/ß folded, everything except letters/digits → single spaces. */
export function fold(s) {
  return String(s ?? '').toLowerCase()
    .replace(/[äàáâ]/g, 'a').replace(/[öòóô]/g, 'o').replace(/[üùúû]/g, 'u').replace(/ß/g, 'ss').replace(/[éèê]/g, 'e')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Levenshtein distance (small strings). */
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const maxErrors = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : len <= 12 ? 2 : 3);

/**
 * Words of a line usable for label matching: letters only, ≥ 3 chars (drops icon junk like "©", "MM", "Se").
 * @returns {{w: string, start: number, end: number}[]} positions in the raw line
 */
function labelWords(raw) {
  const out = [];
  const re = /[A-Za-zÄÖÜäöüßéèàáÉ][A-Za-zÄÖÜäöüßéèàáÉ\-]*/g;
  let m;
  while ((m = re.exec(raw))) {
    const w = fold(m[0]).replace(/ /g, '');
    if (w.length >= 3) out.push({ w, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Finds labels in one line. Returns non-overlapping matches (best = longest label, fewest errors).
 * @param {string} raw
 * @returns {{label: any, start: number, end: number, dist: number}[]}
 */
export function findLabels(raw) {
  const words = labelWords(raw);
  const cands = [];
  for (let i = 0; i < words.length; i++) {
    let joined = '';
    for (let j = i; j < Math.min(words.length, i + 4); j++) {
      joined += words[j].w;
      if (STATUS_WORDS.includes(joined)) continue;
      for (const L of LABELS) {
        if (Math.abs(L.key.length - joined.length) > maxErrors(L.key.length)) continue;
        const d = editDistance(joined, L.key);
        if (d <= maxErrors(L.key.length)) cands.push({ label: L, start: words[i].start, end: words[j].end, wi: i, wj: j, dist: d });
      }
    }
  }
  cands.sort((a, b) => (b.label.key.length - b.dist * 3) - (a.label.key.length - a.dist * 3) || a.dist - b.dist);
  const used = new Set();
  const out = [];
  for (const c of cands) {
    let free = true;
    for (let k = c.wi; k <= c.wj; k++) if (used.has(k)) free = false;
    if (!free) continue;
    for (let k = c.wi; k <= c.wj; k++) used.add(k);
    out.push(c);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** OCR digit confusions inside a number-like token. */
const fixDigits = (s) => s.replace(/[Oo]/g, '0').replace(/[lI|!]/g, '1');

/**
 * Number tokens with optional unit in one line.
 * @returns {{value: number, raw: string, unit: ''|'kg'|'%'|'kcal'|'lb'|'age', start: number, hasDecimal: boolean, junk?: boolean}[]}
 */
export function findValues(raw) {
  const out = [];
  // a token must contain a real digit; O/o/l/I/| allowed next to digits; decimal mark . , or :
  const re = /(?<![A-Za-z0-9])([0-9Oo][0-9OolI|]*|[lI|][0-9][0-9OolI|]*)(?:\s?([.,:])\s?([0-9OolI|]{1,3}))?(?![0-9])\s*(kg|%|kcal|lbs?|jahre|years?|j\b)?/gi;
  let m;
  while ((m = re.exec(raw))) {
    const intPart = fixDigits(m[1]);
    if (!/^\d+$/.test(intPart) || !/\d/.test(m[1] + (m[3] || ''))) continue;
    const frac = m[3] ? fixDigits(m[3]) : '';
    if (frac && !/^\d+$/.test(frac)) continue;
    // a word directly glued in front of the number ("A1", "Hoch5") is OCR junk, but "O" alone isn't a number
    if (!/\d/.test(m[1]) && !frac) continue;
    const text = frac ? `${intPart}.${frac}` : intPart;
    const value = normalizeNumber(text);
    if (value == null) continue;
    const u = (m[4] || '').toLowerCase();
    const unit = u === 'kg' ? 'kg' : u === '%' ? '%' : u === 'kcal' ? 'kcal' : u.startsWith('lb') ? 'lb' : u ? 'age' : '';
    out.push({ value, raw: m[0].trim(), unit, start: m.index, hasDecimal: !!frac });
  }
  // a bare integer at the very start of a line that continues with words is the list icon read as digits
  const first = out[0];
  if (first && !first.unit && !first.hasDecimal && !/\S/.test(raw.slice(0, first.start))
    && /[A-Za-zÄÖÜäöüß]{3,}/.test(raw.slice(first.start + first.raw.length))) first.junk = true;
  return out;
}

const MONTHS = { jan: 1, januar: 1, january: 1, feb: 2, februar: 2, february: 2, mar: 3, marz: 3, maerz: 3, march: 3, apr: 4, april: 4,
  mai: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, november: 11, dez: 12, dec: 12, dezember: 12, december: 12 };

const pad = (n) => String(n).padStart(2, '0');

/**
 * Date/time in a line: "08.11.2026 09:38:54", "2026-11-08 09:38", "08/11/2026", "8. Nov. 2026, 09:38", "Nov 8, 2026 9:38 AM".
 * @returns {{date: string, time: string|null, measuredAt: string}|null} measuredAt = local time without zone
 */
export function parseDateTime(raw) {
  const s = String(raw).replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').replace(/[lI|](?=\d)|(?<=\d)[lI|]/g, '1');
  let y, mo, d;
  let m = s.match(/\b(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(20\d{2})\b/);
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; }
  if (!m) { m = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/); if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } }
  if (!m) {
    const f = fold(s);
    let mm = f.match(/\b(\d{1,2}) ([a-z]{3,9}) (20\d{2})\b/);
    if (mm && MONTHS[mm[2]]) { d = +mm[1]; mo = MONTHS[mm[2]]; y = +mm[3]; m = mm; }
    if (!m) {
      mm = f.match(/\b([a-z]{3,9}) (\d{1,2}) (20\d{2})\b/);
      if (mm && MONTHS[mm[1]]) { d = +mm[2]; mo = MONTHS[mm[1]]; y = +mm[3]; m = mm; }
    }
  }
  if (!m || !(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  const t = s.slice(s.indexOf(String(y)) + 4).match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(am|pm|AM|PM)?/);
  let time = null;
  if (t) {
    let h = +t[1];
    if (t[4] && /pm/i.test(t[4]) && h < 12) h += 12;
    if (t[4] && /am/i.test(t[4]) && h === 12) h = 0;
    if (h < 24 && +t[2] < 60) time = `${pad(h)}:${t[2]}:${t[3] ?? '00'}`;
  }
  return { date, time, measuredAt: `${date}T${time ?? '00:00:00'}` };
}

/** Normalises the various inputs into [{text, bbox?, confidence?}]. */
export function toLines(input) {
  if (input == null) return [];
  if (typeof input === 'string') return input.split(/\r?\n/).map((text) => ({ text }));
  if (Array.isArray(input)) return input.map((l) => (typeof l === 'string' ? { text: l } : l));
  if (Array.isArray(input.lines) && input.lines.length) return input.lines;
  return toLines(input.text || '');
}

/** Sort lines by their top edge when bboxes exist (turns a column layout into rows; labels sit above values). */
function readingOrder(lines) {
  if (!lines.every((l) => l.bbox && Number.isFinite(l.bbox.y0))) return lines;
  return lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.bbox.y0 - b.l.bbox.y0 || a.i - b.i).map((x) => x.l);
}

/** Resolve a label match + value to a field (unit decides for ambiguous labels). */
function targetField(label, unit) {
  if (label.field) return label.field;
  if (unit === 'kg' || unit === 'lb') return label.kg;
  if (unit === '%') return label.pct;
  return null;
}

/** Candidate fields a pending label can take. */
const labelFields = (label) => (label.field ? [label.field] : [label.pct, label.kg].filter(Boolean));

/**
 * Checks a raw value against a field; repairs a lost decimal point.
 * @returns {{value: number, corrected?: string}|null}
 */
export function fitValue(field, v) {
  const f = HEALTH_FIELDS[field];
  const kind = KIND[field];
  if (!f) return null;
  const unitOk = v.unit === '' || (kind === 'kg' && (v.unit === 'kg' || v.unit === 'lb')) || (kind === 'pct' && v.unit === '%')
    || (kind === 'kcal' && v.unit === 'kcal') || (kind === 'age' && v.unit === 'age');
  if (!unitOk) return null;
  // icon garbage is read as small bare integers ("9", "54", "(0)"): masses and percentages need a unit or decimals
  if ((kind === 'kg' || kind === 'pct') && !v.unit && !v.hasDecimal) return null;
  if (v.junk) return null;
  let value = v.unit === 'lb' ? v.value * 0.45359237 : v.value;
  const inRange = (x) => x >= f.min && x <= f.max;
  if (f.int && v.hasDecimal) return null; // „52“ ages / „1821“ kcal never carry decimals
  if (inRange(value)) return { value: roundField(field, value), ...(v.unit === 'lb' ? { corrected: 'aus lb umgerechnet' } : {}) };
  if (!v.hasDecimal && !f.int && Number.isInteger(value)) {
    for (const div of [10, 100]) {
      if (inRange(value / div)) return { value: roundField(field, value / div), corrected: `Komma ergänzt (${v.raw})` };
    }
  }
  return null;
}

/**
 * Plausibility checks between the values (tolerances cover RENPHO's own rounding).
 * @param {Record<string, number>} e
 * @returns {{field: string, reason: string}[]}
 */
export function plausibility(e) {
  const out = [];
  const w = e.weightKg;
  const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  if (w) {
    for (const [pct, kg, name] of [['bodyFatPct', 'bodyFatKg', 'Fettmasse'], ['musclePct', 'muscleKg', 'Muskelmasse'],
      ['skeletalMusclePct', 'skeletalMuscleKg', 'Skelettmuskelmasse'], ['bonePct', 'boneKg', 'Knochenmasse'],
      ['waterPct', 'waterKg', 'Wassermasse'], ['proteinPct', 'proteinKg', 'Proteinmasse']]) {
      if (e[pct] == null || e[kg] == null) continue;
      const expect = (w * e[pct]) / 100;
      // % has one decimal → ±0.05 % of the weight, plus 1.5 % slack for the scale's own rounding
      if (Math.abs(expect - e[kg]) > Math.max(0.12, w * 0.0006 + e[kg] * 0.015)) {
        const reason = `${name} passt nicht zu Gewicht × Anteil (erwartet ca. ${fmt(expect)} kg)`;
        out.push({ field: kg, reason }, { field: pct, reason });
      }
    }
    if (e.fatFreeKg != null && e.bodyFatKg != null && Math.abs(w - e.bodyFatKg - e.fatFreeKg) > Math.max(0.15, w * 0.005)) {
      const reason = `Fettfreie Masse + Fettmasse ≠ Gewicht (erwartet ca. ${fmt(w - e.bodyFatKg)} kg)`;
      out.push({ field: 'fatFreeKg', reason });
    }
  }
  if (e.musclePct != null && e.skeletalMusclePct != null && e.skeletalMusclePct > e.musclePct) {
    out.push({ field: 'skeletalMusclePct', reason: 'Skelettmuskelanteil größer als Muskelanteil' });
  }
  if (e.bodyFatPct != null && e.musclePct != null && e.bonePct != null && e.bodyFatPct + e.musclePct + e.bonePct > 105) {
    out.push({ field: 'bodyFatPct', reason: 'Fett + Muskeln + Knochen ergeben über 100 %' });
  }
  return out;
}

/**
 * Parse RENPHO OCR output.
 * @param {string|string[]|{text: string, bbox?: any, confidence?: number}[]|{text?: string, lines?: any[], regions?: {key: string, text: string, confidence?: number}[]}} input
 * @param {{heightCm?: number|null, fallbackDate?: string}} [opts] heightCm → BMI cross-check; fallbackDate when no date is visible
 * @returns {{entry: import('../types.js').HealthEntry & {sources: Record<string,string>}, recognized: string[], missing: string[],
 *   confidence: number, suspicious: {field: string, reason: string}[], details: Record<string, {value: number, raw: string, line: string, confidence: number|null, corrected?: string}>,
 *   dateFound: boolean, labelBoxes: Record<string, any>, warnings: string[]}}
 */
export function parseRenphoText(input, { heightCm = null, fallbackDate } = {}) {
  const lines = readingOrder(toLines(input).filter((l) => l && String(l.text || '').trim()));
  /** @type {Record<string, any>} */
  const details = {};
  const prio = {};
  const labelBoxes = {};
  const suspicious = [];
  const warnings = [];
  let dt = null;
  /** @type {{label: any, line: any, idx: number}[]} */
  let pending = [];
  let columnMode = false;

  const assign = (field, v, line, labelPrio) => {
    const fit = fitValue(field, v);
    if (!fit) return false;
    const prev = details[field];
    if (prev && prio[field] > labelPrio) return true; // legend value, list value already known
    if (prev && prev.value !== fit.value && prio[field] === labelPrio) {
      suspicious.push({ field, reason: `Zwei verschiedene Werte erkannt (${prev.raw} / ${v.raw})` });
    }
    details[field] = { value: fit.value, raw: v.raw, line: String(line.text).trim(), confidence: line.confidence ?? null, ...(fit.corrected ? { corrected: fit.corrected } : {}) };
    prio[field] = labelPrio;
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const raw = String(line.text);
    if (!dt) { const d = parseDateTime(raw); if (d) { dt = d; continue; } }
    let labels = findLabels(raw);
    // two-line label: "Fettfreies" + "Körpergewicht" (only when the joined text gives a longer label)
    if (i + 1 < lines.length) {
      const joined = findLabels(`${raw} ${lines[i + 1].text}`);
      const best = (ls) => Math.max(0, ...ls.map((x) => x.label.key.length));
      const next = findLabels(String(lines[i + 1].text));
      if (best(joined) > Math.max(best(labels), best(next)) && joined.some((x) => x.start < raw.length && x.end > raw.length)) {
        labels = joined.filter((x) => x.start < raw.length);
        lines[i + 1] = { ...lines[i + 1], text: String(lines[i + 1].text).replace(/^.*?[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{2,}/, (s) => ' '.repeat(s.length)), _consumed: true };
      }
    }
    const values = findValues(raw);
    const events = [
      ...labels.map((l) => ({ pos: l.start, label: l.label, end: l.end })),
      ...values.map((v) => ({ pos: v.start, value: v })),
    ].sort((a, b) => a.pos - b.pos);
    for (const ev of events) {
      if (ev.label) {
        pending.push({ label: ev.label, line, idx: i });
        if (line.bbox && ev.label.field && ev.label.prio === 2) labelBoxes[ev.label.field] = line.bbox;
        continue;
      }
      // value: row layout → newest compatible pending label; column layout (≥ 4 waiting) → oldest
      if (pending.length >= 4) columnMode = true;
      const order = columnMode ? pending.map((_, k) => k) : pending.map((_, k) => pending.length - 1 - k);
      for (const k of order) {
        const p = pending[k];
        const field = targetField(p.label, ev.value.unit) ?? labelFields(p.label).find((f) => fitValue(f, ev.value));
        if (field && assign(field, ev.value, line, p.label.prio)) {
          // row layout: older labels without value are given up; column layout: only this one is done
          pending = columnMode ? pending.filter((_, x) => x !== k) : [];
          if (!pending.length) columnMode = false;
          break;
        }
      }
    }
  }

  // region re-reads (ocr.js second pass) for fields still missing
  for (const r of (input && !Array.isArray(input) && typeof input === 'object' && input.regions) || []) {
    if (!RENPHO_FIELDS.includes(r.key)) continue;
    const prev = details[r.key];
    if (prev && !prev.corrected) continue;
    const vals = String(r.text || '').split(/\r?\n/).flatMap((t) => findValues(t));
    for (const v of vals) {
      const fit = fitValue(r.key, v);
      if (!fit || (prev && fit.corrected)) continue; // a repaired value is only replaced by a clean re-read
      details[r.key] = { value: fit.value, raw: v.raw, line: String(r.text).trim(), confidence: r.confidence ?? null, reread: true, ...(fit.corrected ? { corrected: fit.corrected } : {}) };
      break;
    }
  }

  // weight lost (e.g. the label was unreadable) but fat mass + fat-free mass known → offer the sum, flagged
  if (!details.weightKg && details.bodyFatKg && details.fatFreeKg) {
    const w = roundField('weightKg', details.bodyFatKg.value + details.fatFreeKg.value);
    if (w >= HEALTH_FIELDS.weightKg.min && w <= HEALTH_FIELDS.weightKg.max) {
      details.weightKg = { value: w, raw: '', line: '', confidence: null, corrected: 'berechnet aus Fettmasse + fettfreier Masse' };
    }
  }

  const entry = /** @type {any} */ ({});
  const sources = {};
  for (const f of RENPHO_FIELDS) if (details[f]) { entry[f] = details[f].value; sources[f] = RENPHO_SOURCE; }
  for (const f of RENPHO_FIELDS) if (details[f]?.corrected) suspicious.push({ field: f, reason: details[f].corrected });
  suspicious.push(...plausibility(entry));
  if (heightCm && entry.bmi && entry.weightKg) {
    const bmi = entry.weightKg / (heightCm / 100) ** 2;
    if (Math.abs(bmi - entry.bmi) > 0.6) suspicious.push({ field: 'bmi', reason: `BMI passt nicht zu Gewicht und Größe (ca. ${String(Math.round(bmi * 10) / 10).replace('.', ',')})` });
  }
  const date = dt?.date ?? fallbackDate ?? null;
  if (!dt) warnings.push('Kein Datum im Screenshot erkannt – bitte prüfen.');
  const out = { date, ...(dt ? { measuredAt: dt.measuredAt } : {}), source: RENPHO_SOURCE, ...entry, sources };
  const recognized = RENPHO_FIELDS.filter((f) => details[f]);
  const missing = RENPHO_FIELDS.filter((f) => !details[f]);
  if (!recognized.length) warnings.push('Keine RENPHO-Werte erkannt. Ist das ein Screenshot der RENPHO-Messung?');
  const confs = recognized.map((f) => details[f].confidence).filter((c) => Number.isFinite(c));
  const ocrConf = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length / 100 : 1;
  const susp = new Set(suspicious.map((s) => s.field)).size;
  const confidence = Math.round((recognized.length / RENPHO_FIELDS.length) * ocrConf * (1 - 0.5 * susp / RENPHO_FIELDS.length) * 100) / 100;
  return { entry: out, recognized, missing, confidence, suspicious: dedupe(suspicious), details, dateFound: !!dt, labelBoxes, warnings };
}

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((s) => { const k = s.field + '|' + s.reason; if (seen.has(k)) return false; seen.add(k); return true; });
};

/**
 * Regions for a second OCR pass (ocr.js `refine`): one row band per missing or repaired field whose label was found.
 * @param {ReturnType<typeof parseRenphoText>} parsed
 * @param {{width: number}} image original image width (px)
 * @returns {{key: string, bbox: {x0: number, y0: number, x1: number, y1: number}}[]}
 */
export function refineRegions(parsed, { width }) {
  const out = [];
  const want = [...parsed.missing, ...RENPHO_FIELDS.filter((f) => parsed.details[f]?.corrected && parsed.labelBoxes[f])];
  for (const f of want) {
    const b = parsed.labelBoxes[f];
    if (!b) continue;
    const h = Math.max(20, b.y1 - b.y0);
    out.push({ key: f, bbox: { x0: 0, y0: Math.max(0, Math.round(b.y0 - h * 0.5)), x1: width, y1: Math.round(b.y1 + h * 2.2) } });
  }
  return out;
}
