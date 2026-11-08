// #/import view helpers, router entry, manifest share_target and the service-worker wiring (static checks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyFile, looksLikeCsv, toInput, valueText, entryFromForm, countsText, SHARE_CACHE, SHARE_PREFIX } from '../js/views/import.js';
import { matchRoute } from '../js/router.js';
import { previewImport, applyImport } from '../js/import/common.js';
import { parseRenphoText, RENPHO_FIELDS } from '../js/import/renpho.js';
import { OCR_CACHE } from '../js/import/ocr.js';
import { collectFiles } from '../tools/gen-precache.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('route #/import → views/import.js in the Mehr tab, query kept', () => {
  const m = matchRoute('#/import?shared=1');
  assert.equal(m.route.view, 'import');
  assert.equal(m.route.tab, 'mehr');
  assert.deepEqual(m.query, { shared: '1' });
  assert.ok(fs.existsSync(new URL('../js/views/import.js', import.meta.url)));
});

test('file classification and CSV text detection', () => {
  assert.equal(classifyFile({ name: 'Screenshot_20261108.jpg', type: 'image/jpeg' }), 'image');
  assert.equal(classifyFile({ name: 'x.PNG', type: '' }), 'image');
  assert.equal(classifyFile({ name: 'samsunghealth_marc_202611.zip', type: 'application/zip' }), 'samsung');
  assert.equal(classifyFile({ name: 'com.samsung.health.weight.20261108.csv', type: 'text/comma-separated-values' }), 'samsung');
  assert.equal(classifyFile({ name: 'notes.pdf', type: 'application/pdf' }), null);
  assert.equal(looksLikeCsv('date,weight\n2026-11-08,102.1\n'), true);
  assert.equal(looksLikeCsv('Gewicht 102,10 kg'), false);
});

test('review form → entry: comma decimals, sources (edited = manual), measuredAt, validation', () => {
  const parsed = parseRenphoText(read('tests/fixtures/renpho/sample-de.ocr.txt'));
  const values = Object.fromEntries(RENPHO_FIELDS.map((f) => [f, toInput(f, parsed.entry[f])]));
  assert.equal(values.weightKg, '102,1');
  assert.equal(values.bmrKcal, '1821');
  values.visceralFat = '14'; // user correction
  const parsedVals = Object.fromEntries(RENPHO_FIELDS.map((f) => [f, parsed.entry[f]]));
  const { entry, errors } = entryFromForm({ date: '2026-11-08', time: '09:38:54', values, parsed: parsedVals });
  assert.deepEqual(errors, {});
  assert.equal(entry.weightKg, 102.1);
  assert.equal(entry.boneKg, 3.36);
  assert.equal(entry.visceralFat, 14);
  assert.equal(entry.sources.visceralFat, 'manual');
  assert.equal(entry.sources.weightKg, 'renpho-ocr');
  assert.equal(entry.measuredAt, '2026-11-08T09:38:54');
  const bad = entryFromForm({ date: '2026-11-08', time: '', values: { weightKg: 'abc', bmi: '5' } });
  assert.ok(bad.errors.weightKg && bad.errors.bmi);
  assert.equal(valueText('weightKg', 101.8), '101,8 kg');
  assert.equal(countsText({ new: 3, changed: 1, same: 2 }), '3 neu · 1 wird aktualisiert · 2 gleich');
});

test('preview + apply with the parsed screenshot (merge keeps a newer manual value, overwrite replaces)', () => {
  const parsed = parseRenphoText(JSON.parse(read('tests/fixtures/renpho/sample-de.ocr.json')));
  const state = { xp: 0, healthLog: [{ date: '2026-11-08', weightKg: 101.5, steps: 8000, source: 'samsung-health-manual' }] };
  const pv = previewImport(state, [parsed.entry]);
  assert.equal(pv.counts.new, 18);
  assert.equal(pv.counts.conflict, 1);
  const merged = applyImport(state, [parsed.entry], { mode: 'merge' });
  const e = merged.state.healthLog[0];
  assert.equal(e.weightKg, 101.5);
  assert.equal(e.steps, 8000);
  assert.equal(e.bodyFatKg, 34.31);
  const over = applyImport(state, [parsed.entry], { mode: 'overwrite' });
  assert.equal(over.state.healthLog[0].weightKg, 102.1);
  assert.equal(over.state.healthLog[0].sources.weightKg, 'renpho-ocr');
  assert.equal(state.healthLog[0].weightKg, 101.5); // input untouched
});

test('manifest share_target, sw share + lazy OCR cache, precache excludes vendor/tesseract', async () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  const st = man.share_target;
  assert.equal(st.action, './share-target');
  assert.equal(st.method, 'POST');
  assert.equal(st.enctype, 'multipart/form-data');
  assert.equal(st.params.files[0].name, 'files');
  for (const a of ['image/*', 'text/csv', 'application/zip', '.csv', '.zip']) assert.ok(st.params.files[0].accept.includes(a), a);
  assert.equal(st.params.text, 'text');
  const sw = read('sw.js');
  assert.ok(sw.includes(`const OCR_CACHE = '${OCR_CACHE}';`), 'OCR cache name in sync');
  assert.ok(sw.includes(`const SHARE_CACHE = '${SHARE_CACHE}';`) && sw.includes(`const SHARE_PREFIX = '${SHARE_PREFIX}';`));
  assert.match(sw, /share-target/);
  assert.match(sw, /Response\.redirect\(target, 303\)/);
  assert.ok(!/'vendor\//.test(sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('// </precache>'))));
  const files = await collectFiles();
  assert.ok(files.includes('js/views/import.js') && files.includes('js/import/ocr.js') && files.includes('js/import/renpho.js'));
  assert.ok(!files.some((f) => f.startsWith('vendor/')));
  // the OCR modules never reference a CDN
  for (const p of ['js/import/ocr.js', 'js/views/import.js', 'sw.js']) assert.ok(!/jsdelivr|unpkg|cdnjs/.test(read(p)), p);
});
