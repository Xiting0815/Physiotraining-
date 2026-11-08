// RENPHO screenshot import: parser against real OCR output of tests/fixtures/renpho/sample-de.jpg
// (generated with the vendored tesseract.js in Chrome via js/import/ocr.js) + synthetic noisy variants,
// and the pure helpers of js/import/ocr.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseRenphoText, refineRegions, findLabels, findValues, parseDateTime, fitValue, plausibility, editDistance, fold,
  RENPHO_FIELDS, RENPHO_SOURCE,
} from '../js/import/renpho.js';
import { ocrAssets, ocrDownloadBytes, formatMB, computeScale, enhanceGray, flattenLines, loadingMessage, OCR_CACHE } from '../js/import/ocr.js';
import { validateEntry } from '../js/logic/health.js';

const fx = (n) => fs.readFileSync(new URL(`./fixtures/renpho/${n}`, import.meta.url), 'utf8');

const EXPECTED = {
  weightKg: 102.1, bmi: 32.2, bodyFatPct: 33.6, bodyFatKg: 34.31, subcutFatPct: 29.2, visceralFat: 15, musclePct: 63.1,
  muscleKg: 64.43, skeletalMusclePct: 42.7, skeletalMuscleKg: 43.6, bonePct: 3.3, boneKg: 3.36, fatFreeKg: 67.79,
  metabolicAge: 52, bmrKcal: 1821, waterPct: 47.9, waterKg: 48.91, proteinPct: 15.1, proteinKg: 15.42,
};

const assertAll = (r) => {
  for (const [k, v] of Object.entries(EXPECTED)) assert.equal(r.entry[k], v, k);
  assert.deepEqual(r.recognized, RENPHO_FIELDS);
  assert.deepEqual(r.missing, []);
};

test('real OCR result (lines + bbox + row re-read) → all 19 values exact, date/time, no warnings', () => {
  const ocr = JSON.parse(fx('sample-de.ocr.json'));
  const r = parseRenphoText(ocr);
  assertAll(r);
  assert.equal(r.entry.date, '2026-11-08');
  assert.equal(r.entry.measuredAt, '2026-11-08T09:38:54');
  assert.equal(r.dateFound, true);
  assert.deepEqual(r.suspicious, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.confidence > 0.7, `confidence ${r.confidence}`);
  for (const f of RENPHO_FIELDS) assert.equal(r.entry.sources[f], RENPHO_SOURCE);
  assert.equal(r.entry.source, RENPHO_SOURCE);
  // the entry passes the health-log validation unchanged
  const v = validateEntry(r.entry);
  assert.ok(v.ok, JSON.stringify(v.errors));
  for (const [k, val] of Object.entries(EXPECTED)) assert.equal(v.entry[k], val, k);
  assert.equal(v.entry.measuredAt, '2026-11-08T09:38:54');
});

test('real OCR plain text (no bbox): all 19 exact; the lost decimal point of 3.3 % is repaired and flagged', () => {
  const r = parseRenphoText(fx('sample-de.ocr.txt'));
  assertAll(r);
  assert.equal(r.entry.measuredAt, '2026-11-08T09:38:54');
  assert.deepEqual(r.suspicious.map((s) => s.field), ['bonePct']);
  assert.match(r.suspicious[0].reason, /Komma ergänzt/);
});

test('first OCR pass asks for a re-read of the repaired row; a clean re-read wins', () => {
  const ocr = JSON.parse(fx('sample-de.ocr.json'));
  const first = parseRenphoText({ lines: ocr.lines });
  assert.equal(first.entry.bonePct, 3.3);
  assert.ok(first.details.bonePct.corrected);
  const regions = refineRegions(first, ocr);
  assert.deepEqual(regions.map((x) => x.key), ['bonePct']);
  const b = regions[0].bbox;
  assert.ok(b.x0 === 0 && b.x1 === 1080 && b.y0 < first.labelBoxes.bonePct.y0 && b.y1 > first.labelBoxes.bonePct.y1 + 40);
  const second = parseRenphoText({ lines: ocr.lines, regions: [{ key: 'bonePct', text: 'Knochenanteil\nDurchschnittlich 3.3%', confidence: 86 }] });
  assert.equal(second.entry.bonePct, 3.3);
  assert.equal(second.details.bonePct.corrected, undefined);
  // a missing field is filled from its region
  const lines = ocr.lines.filter((l) => !/\b52\b/.test(l.text));
  const noAge = parseRenphoText({ lines });
  assert.deepEqual(noAge.missing, ['metabolicAge']);
  assert.deepEqual(refineRegions(noAge, ocr).map((x) => x.key), ['metabolicAge', 'bonePct']);
  const fixed = parseRenphoText({ lines, regions: [{ key: 'metabolicAge', text: 'Stoffwechselalter\n© Überdurchschnittlich 52\n' }] });
  assert.equal(fixed.entry.metabolicAge, 52);
});

test('other real OCR runs: column layout (bbox) exact; misreads are never silent', () => {
  const col = parseRenphoText(JSON.parse(fx('sample-de.psm3.lines.json')));
  for (const k of col.recognized) assert.equal(col.entry[k], EXPECTED[k], k);
  assert.ok(col.recognized.length >= 17, col.missing.join());

  const low = parseRenphoText(fx('sample-de.lowgain.txt'));
  for (const k of low.recognized) assert.equal(low.entry[k], EXPECTED[k], k);
  assert.deepEqual(low.missing, ['metabolicAge']);

  // this run read "33.6 %" as "38.6 %" → plausibility (fat kg ≈ weight × %) flags it
  const bad = parseRenphoText(fx('sample-de.psm6.txt'));
  const wrong = bad.recognized.filter((k) => bad.entry[k] !== EXPECTED[k]);
  assert.ok(wrong.length >= 1);
  const flagged = new Set(bad.suspicious.map((s) => s.field));
  for (const k of wrong) assert.ok(flagged.has(k), `${k}=${bad.entry[k]} not flagged`);
});

const CLEAN = `RENPHO
Marc
08.11.2026 09:38:54
Datenquelle: Körperanalysewaage
Gewicht
Hoch 102.10 kg
BMI
Hoch 32.2
Körperfettanteil
Hoch 33.6 %
Körperfettmasse
Hoch 34.31 kg
Subkutanes Fett
Überdurchschnittlich 29.2 %
Viszeralfett
Überdurchschnittlich 15
Muskelanteil
Ausgezeichnet 63.1 %
Muskelmasse
Ausgezeichnet 64.43 kg
Skelettmuskelanteil
Unterdurchschnittlich 42.7 %
Skelettmuskelmasse
Unterdurchschnittlich 43.60 kg
Knochenanteil
Durchschnittlich 3.3 %
Knochenmasse
Durchschnittlich 3.36 kg
Fettfreies
Körpergewicht 67.79 kg
Stoffwechselalter
Überdurchschnittlich 52
Grundumsatz
Unterdurchschnittlich 1821 kcal
Körperwasseranteil
Unterdurchschnittlich 47.9 %
Körperwassermasse
Unterdurchschnittlich 48.91 kg
Proteinanteil
Unterdurchschnittlich 15.1 %
Proteinmasse
Unterdurchschnittlich 15.42 kg`;

test('synthetic: clean German list', () => {
  const r = parseRenphoText(CLEAN);
  assertAll(r);
  assert.deepEqual(r.suspicious, []);
  assert.equal(r.confidence, 1);
});

test('synthetic: OCR noise – umlauts lost, typos, O/l confusions, comma decimals, icon junk, glued units', () => {
  const noisy = CLEAN
    .replace('08.11.2026 09:38:54', 'O8.11.2O26 O9:38:54')
    .replace('Hoch 102.10 kg', '© Hoch 1O2,1O kg')
    .replace('Körperfettanteil', 'Korperfettantei1')
    .replace('Hoch 33.6 %', '0, Hoch 33,6%')
    .replace('Körperfettmasse', '=  Korperfettmasse')
    .replace('34.31 kg', '34,31kg')
    .replace('Subkutanes Fett', 'Subkutanes Fet')
    .replace('Überdurchschnittlich 29.2 %', '54  (0)\nUberdurchschnittlich 29.2 %')
    .replace('Muskelanteil', 'Muskelantell')
    .replace('Skelettmuskelmasse', 'Ske1ettmuskelmasse')
    .replace('Durchschnittlich 3.3 %', '7   Durchschnittlich 3:3 %')
    .replace('Fettfreies\nKörpergewicht 67.79 kg', 'Fettfreies\n_  |\nMM  Körpergewicht   67.79 kg')
    .replace('Unterdurchschnittlich 1821 kcal', '©  Unterdurchschnittlich   1821  kcal')
    .replace('Unterdurchschnittlich 48.91 kg', 'Ö   Unterdurchschnittlich 48.9l kg')
    .replace('Proteinmasse\n', 'Proteinmasse\n9\n');
  const r = parseRenphoText(noisy);
  assertAll(r);
  assert.equal(r.entry.measuredAt, '2026-11-08T09:38:54');
  assert.deepEqual(r.suspicious, []);
});

test('synthetic: values on the label line, legend values do not override list values', () => {
  const text = `Körperwasser 99.99 kg
Eiweiß 15.42 kg
Körperfett 34.31 kg
Gewicht 102.10 kg
BMI 32.2
Körperfettanteil 33.6 %
Körperwassermasse 48.91 kg
Körperwasseranteil 47.9 %`;
  const r = parseRenphoText(text);
  assert.equal(r.entry.waterKg, 48.91); // list label (prio 2) beats ring legend
  assert.equal(r.entry.proteinKg, 15.42); // legend „Eiweiß … kg“ → proteinKg
  assert.equal(r.entry.bodyFatKg, 34.31); // legend „Körperfett … kg“ → fat mass, not %
  assert.equal(r.entry.bodyFatPct, 33.6);
  assert.equal(r.entry.weightKg, 102.1);
  assert.equal(r.entry.waterPct, 47.9);
});

test('synthetic: English RENPHO labels, lb units and US date', () => {
  const text = `Nov 8, 2026 9:38 PM
Weight
High 225.1 lb
BMI 32.2
Body Fat 33.6%
Body Fat Mass 34.31 kg
Subcutaneous Fat 29.2%
Visceral Fat 15
Muscle Mass 64.43 kg
Skeletal Muscle 42.7%
Bone Mass 3.36 kg
Fat-free Body Weight 67.79 kg
Metabolic Age 52
BMR 1821 kcal
Body Water 47.9%
Protein Rate 15.1%`;
  const r = parseRenphoText(text);
  assert.equal(r.entry.measuredAt, '2026-11-08T21:38:00');
  assert.equal(r.entry.weightKg, 102.1); // 225.1 lb
  assert.ok(r.suspicious.some((s) => s.field === 'weightKg' && /lb/.test(s.reason)));
  for (const k of ['bmi', 'bodyFatPct', 'bodyFatKg', 'subcutFatPct', 'visceralFat', 'muscleKg', 'skeletalMusclePct', 'boneKg', 'fatFreeKg', 'metabolicAge', 'bmrKcal', 'waterPct', 'proteinPct']) {
    assert.equal(r.entry[k], EXPECTED[k], k);
  }
  assert.ok(r.missing.includes('musclePct'));
});

test('synthetic: column layout without bboxes (labels first, then values)', () => {
  const labels = ['Körperfettanteil', 'Körperfettmasse', 'Subkutanes Fett', 'Viszeralfett', 'Muskelanteil', 'Muskelmasse'];
  const values = ['33.6 %', '34.31 kg', '29.2 %', '15', '63.1 %', '64.43 kg'];
  const r = parseRenphoText([...labels, ...values].join('\n'));
  assert.deepEqual([r.entry.bodyFatPct, r.entry.bodyFatKg, r.entry.subcutFatPct, r.entry.visceralFat, r.entry.musclePct, r.entry.muscleKg],
    [33.6, 34.31, 29.2, 15, 63.1, 64.43]);
});

test('plausibility flags inconsistent values; missing weight is offered as fat + fat-free (flagged)', () => {
  const r = parseRenphoText(CLEAN.replace('34.31 kg', '43.31 kg'));
  const f = new Set(r.suspicious.map((s) => s.field));
  assert.ok(f.has('bodyFatKg') && f.has('bodyFatPct') && f.has('fatFreeKg'));
  assert.ok(r.confidence < 1);

  const noW = parseRenphoText(CLEAN.replace('Gewicht\nHoch 102.10 kg\n', ''));
  assert.equal(noW.entry.weightKg, 102.1);
  assert.ok(noW.suspicious.some((s) => s.field === 'weightKg' && /berechnet/.test(s.reason)));

  assert.deepEqual(plausibility(EXPECTED), []);
  assert.ok(parseRenphoText(CLEAN, { heightCm: 190 }).suspicious.some((s) => s.field === 'bmi'));
  assert.deepEqual(parseRenphoText(CLEAN, { heightCm: 178 }).suspicious, []);
});

test('no date → fallbackDate + warning; nothing recognised → warning', () => {
  const r = parseRenphoText(CLEAN.replace('08.11.2026 09:38:54', ''), { fallbackDate: '2026-11-07' });
  assert.equal(r.entry.date, '2026-11-07');
  assert.equal(r.entry.measuredAt, undefined);
  assert.equal(r.dateFound, false);
  assert.match(r.warnings.join(), /Kein Datum/);
  const empty = parseRenphoText('Hallo Welt\n12345');
  assert.deepEqual(empty.recognized, []);
  assert.match(empty.warnings.join(), /Keine RENPHO-Werte/);
});

test('helpers: labels, values, dates, value fitting', () => {
  assert.equal(fold('Körperfett-Anteil ß'), 'korperfett anteil ss');
  assert.equal(editDistance('muskelmasse', 'muskelnasse'), 1);
  assert.deepEqual(findLabels('Skelettmuskelmasse').map((l) => l.label.field), ['skeletalMuscleKg']);
  assert.deepEqual(findLabels('Muskelmasse').map((l) => l.label.field), ['muscleKg']);
  assert.deepEqual(findLabels('MM Körpergewicht 67.79 kg'), []); // never „Gewicht“
  assert.deepEqual(findLabels('Überdurchschnittlich'), []);
  assert.deepEqual(findLabels('Hoch'), []);
  assert.equal(findLabels('Fettfreies Körpergewicht')[0].label.field, 'fatFreeKg');
  assert.deepEqual(findValues('Hoch 102.10 kg').map((v) => [v.value, v.unit]), [[102.1, 'kg']]);
  assert.deepEqual(findValues('33,6%').map((v) => [v.value, v.unit]), [[33.6, '%']]);
  assert.deepEqual(findValues('1821 kcal').map((v) => [v.value, v.unit]), [[1821, 'kcal']]);
  assert.deepEqual(findValues('32:2').map((v) => v.value), [32.2]);
  assert.deepEqual(findValues('l5.42 kg').map((v) => v.value), [15.42]);
  assert.equal(findValues('9   Unterdurchschnittlich')[0].junk, true);
  assert.deepEqual(parseDateTime('08.11.2026 09:38:54'), { date: '2026-11-08', time: '09:38:54', measuredAt: '2026-11-08T09:38:54' });
  assert.equal(parseDateTime('2026-11-08 07:05').measuredAt, '2026-11-08T07:05:00');
  assert.equal(parseDateTime('8. Nov. 2026, 09:38').measuredAt, '2026-11-08T09:38:00');
  assert.equal(parseDateTime('So., 8. November 2026').date, '2026-11-08');
  assert.equal(parseDateTime('102.10 kg'), null);
  assert.deepEqual(fitValue('bonePct', { value: 33, unit: '%', hasDecimal: false, raw: '33%' }), { value: 3.3, corrected: 'Komma ergänzt (33%)' });
  assert.equal(fitValue('fatFreeKg', { value: 6779, unit: 'kg', hasDecimal: false, raw: '6779 kg' }).value, 67.79);
  assert.equal(fitValue('muscleKg', { value: 64, unit: '', hasDecimal: false, raw: '64' }), null); // bare integer = icon junk
  assert.equal(fitValue('bodyFatPct', { value: 34.31, unit: 'kg', hasDecimal: true, raw: '34.31 kg' }), null);
  assert.equal(fitValue('metabolicAge', { value: 52, unit: '', hasDecimal: false, raw: '52' }).value, 52);
  assert.equal(fitValue('bmrKcal', { value: 0, unit: '', hasDecimal: false, raw: '0' }), null);
});

test('ocr.js: asset list matches the vendored files; sizes, scale, filters', () => {
  for (const simd of [true, false]) {
    for (const a of ocrAssets({ simd })) {
      const st = fs.statSync(new URL(`../vendor/tesseract/${a.path}`, import.meta.url));
      assert.equal(st.size, a.bytes, a.path);
    }
  }
  const total = ocrDownloadBytes({ simd: true });
  assert.ok(total > 6e6 && total < 9e6, String(total));
  assert.equal(formatMB(7461234), '7,5 MB');
  assert.match(loadingMessage({ phase: 'download', loaded: 1e6, total, firstTime: true }), /^Texterkennung wird geladen… \(1\. Mal ca\. 7,5 MB/);
  assert.equal(loadingMessage({ phase: 'download', firstTime: false }), 'Texterkennung wird geladen…');
  assert.match(OCR_CACHE, /^pt-ocr-/);
  // tall phone screenshot keeps its width; photos are capped at 2000 px; tiny images are upscaled
  assert.equal(computeScale(1080, 5265), 1);
  assert.equal(Math.round(4000 * computeScale(4000, 3000)), 2000);
  assert.equal(Math.round(1440 * computeScale(1440, 6000) * 100) / 100, 1440 * Math.min(1, Math.sqrt(10e6 / (1440 * 6000))));
  assert.equal(computeScale(400, 800), 2);
  // local filter: flat areas → white, a light stroke on mid grey → dark (polarity-free)
  const w = 40, h = 20;
  const g = new Uint8Array(w * h).fill(185);
  for (let y = 5; y < 15; y++) g[y * w + 20] = 255;
  const { out } = enhanceGray(g, w, h);
  assert.equal(out[2 * w + 2], 255);
  assert.ok(out[10 * w + 20] < 120);
  const dark = enhanceGray(new Uint8Array(100).fill(20).map((v, i) => (i % 10 === 5 ? 200 : v)), 10, 10, { mode: 'global' });
  assert.equal(dark.inverted, true);
  assert.equal(dark.out[0], 255);
  assert.equal(dark.out[5], 0);
  const lines = flattenLines({ blocks: [{ paragraphs: [{ lines: [{ text: 'Gewicht  \n', bbox: { x0: 10, y0: 20, x1: 30, y1: 40 }, confidence: 91.4 }, { text: '  ' }] }] }] }, 0.5);
  assert.deepEqual(lines, [{ text: 'Gewicht', bbox: { x0: 20, y0: 40, x1: 60, y1: 80 }, confidence: 91 }]);
});
