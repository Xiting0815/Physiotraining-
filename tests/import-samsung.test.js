// v3 import: common (normalizeNumber, previewImport, applyImport), zip reader, Samsung Health export parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import zlib from 'node:zlib';
import { normalizeNumber, previewImport, applyImport } from '../js/import/common.js';
import { listEntries, readText, isZip } from '../js/import/zip.js';
import {
  parseSamsungExport, parseSamsungTexts, samsungFileType, readSamsungCsv, localDate, dayTimeDate, parseCsv, offsetMinutes,
} from '../js/import/samsung.js';

const FIX = new URL('./fixtures/samsung/', import.meta.url);
const fixtureFiles = () => readdirSync(FIX).filter((n) => n.endsWith('.csv')).sort().map((n) => ({ name: n, text: readFileSync(new URL(n, FIX), 'utf8') }));

/** Build a ZIP in memory (stored or deflated entries, optional data descriptor flag). */
function makeZip(files, { method = 8 } = {}) {
  const locals = [], cents = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.from(f.data);
    const m = f.dir ? 0 : (f.method ?? method);
    const comp = m === 8 ? zlib.deflateRawSync(raw) : raw;
    const crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(m, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const extra = Buffer.from([0xfe, 0xca, 0x00, 0x00]); // dummy extra field (like jar markers)
    lh.writeUInt16LE(extra.length, 28);
    locals.push(lh, name, extra, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(m, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42);
    cents.push(ch, name);
    off += 30 + name.length + extra.length + comp.length;
  }
  const cd = Buffer.concat(cents);
  const comment = Buffer.from('test');
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16); eocd.writeUInt16LE(comment.length, 20);
  return new Blob([Buffer.concat([...locals, cd, eocd, comment])]);
}

// ---------------------------------------------------------------------------- common
test('normalizeNumber: German/English decimals, thousands, units', () => {
  assert.equal(normalizeNumber('102,10'), 102.1);
  assert.equal(normalizeNumber('102.1'), 102.1);
  assert.equal(normalizeNumber(' 25,3 % '), 25.3);
  assert.equal(normalizeNumber('1.234,5'), 1234.5);
  assert.equal(normalizeNumber('1,234.5'), 1234.5);
  assert.equal(normalizeNumber('12.345.678'), 12345678);
  assert.equal(normalizeNumber('8.214', { integer: true }), 8214);
  assert.equal(normalizeNumber('8.214'), 8.214);
  assert.equal(normalizeNumber('1 958 kcal'), 1958);
  assert.equal(normalizeNumber('−1,5'), -1.5);
  assert.equal(normalizeNumber(''), null);
  assert.equal(normalizeNumber('--'), null);
  assert.equal(normalizeNumber(null), null);
  assert.equal(normalizeNumber(42), 42);
  assert.equal(normalizeNumber(NaN), null);
});

const state0 = () => ({
  xp: 100,
  healthLog: [
    { date: '2026-11-01', source: 'samsung-health-manual', weightKg: 102.1, steps: 5000 },
    { date: '2026-11-02', source: 'samsung-export', weightKg: 101.9, measuredAt: '2026-11-02T05:30:00.000Z', sources: { weightKg: 'samsung-export' } },
  ],
});

test('previewImport: new / same / changed / conflict per field', () => {
  const inc = [
    { date: '2026-11-01', weightKg: 102.1, bodyFatPct: 30.8, steps: 6412, measuredAt: '2026-11-01T22:00:00Z', sources: { weightKg: 'renpho-ocr', bodyFatPct: 'renpho-ocr', steps: 'samsung-export' } },
    { date: '2026-11-02', weightKg: 101.6, measuredAt: '2026-11-02T06:00:00Z', sources: { weightKg: 'renpho-ocr' } },
    { date: '2026-11-03', weightKg: 101.4, sources: { weightKg: 'renpho-ocr' } },
    { date: '2026-11-04', weightKg: 999 },
  ];
  const p = previewImport(state0(), inc);
  const st = (d, f) => p.rows.find((r) => r.date === d && r.field === f)?.status;
  assert.equal(st('2026-11-01', 'weightKg'), 'same');
  assert.equal(st('2026-11-01', 'bodyFatPct'), 'new');
  assert.equal(st('2026-11-01', 'steps'), 'conflict'); // manual entry without measuredAt → merge keeps it
  assert.equal(st('2026-11-02', 'weightKg'), 'changed'); // newer measuredAt
  assert.equal(st('2026-11-03', 'weightKg'), 'new');
  assert.deepEqual(p.rows.find((r) => r.field === 'steps'), { date: '2026-11-01', field: 'steps', old: 5000, new: 6412, status: 'conflict' });
  assert.deepEqual(p.counts, { new: 2, changed: 1, same: 1, conflict: 1, days: 3, newDays: 1, invalid: 1 });
  assert.equal(p.invalid[0].date, '2026-11-04');
});

test('applyImport merge vs overwrite, sources, measuredAt, no XP for past days', () => {
  const inc = [
    { date: '2026-11-01', weightKg: 102.1, bodyFatPct: 30.8, steps: 6412, measuredAt: '2026-11-01T22:00:00Z', sources: { weightKg: 'renpho-ocr', bodyFatPct: 'renpho-ocr', steps: 'samsung-export' } },
    { date: '2026-11-02', weightKg: 101.6, measuredAt: '2026-11-02T06:00:00Z', sources: { weightKg: 'renpho-ocr' } },
    { date: '2026-11-03', weightKg: 101.4, source: 'renpho-ocr', sources: { weightKg: 'renpho-ocr' } },
  ];
  const s0 = state0();
  const m = applyImport(s0, inc, { mode: 'merge', today: '2026-11-08' });
  assert.deepEqual(s0, state0(), 'input untouched');
  assert.deepEqual([m.added, m.updated, m.skipped, m.xp], [1, 2, 0, 0]);
  assert.equal(m.state.xp, 100);
  const [d1, d2, d3] = m.state.healthLog;
  assert.equal(d1.steps, 5000);
  assert.equal(d1.bodyFatPct, 30.8);
  assert.deepEqual(d1.sources, { bodyFatPct: 'renpho-ocr' });
  assert.equal(d1.measuredAt, undefined, 'manual entries stay protected');
  assert.equal(d2.weightKg, 101.6);
  assert.equal(d2.measuredAt, '2026-11-02T06:00:00Z');
  assert.deepEqual(d2.sources, { weightKg: 'renpho-ocr' });
  assert.deepEqual(d3, { date: '2026-11-03', source: 'renpho-ocr', weightKg: 101.4, sources: { weightKg: 'renpho-ocr' } });
  const o = applyImport(s0, inc, { mode: 'overwrite' });
  assert.equal(o.state.healthLog[0].steps, 6412);
  assert.equal(o.state.healthLog[0].sources.steps, 'samsung-export');
  assert.equal(o.state.healthLog[0].weightKg, 102.1);
  // re-import of the same data changes nothing
  const again = applyImport(m.state, inc, { mode: 'merge' });
  assert.deepEqual([again.added, again.updated, again.skipped], [0, 0, 3]);
  // today's first entry → normal daily XP only once
  const t = applyImport(s0, [...inc, { date: '2026-11-08', steps: 100 }, { date: '2026-11-07', steps: 100 }], { today: '2026-11-08' });
  assert.equal(t.xp, 5);
  assert.equal(t.state.xp, 105);
});

// ---------------------------------------------------------------------------- zip
test('zip reader: stored + deflate entries, UTF-8 names, directories', async () => {
  const big = 'datum;wert\n' + Array.from({ length: 2000 }, (_, i) => `2026-11-${String((i % 28) + 1).padStart(2, '0')};${i}`).join('\n');
  const blob = makeZip([
    { name: 'samsunghealth_ä/', data: '', dir: true },
    { name: 'samsunghealth_ä/Grüße.txt', data: 'Hallo Welt – äöü', method: 0 },
    { name: 'samsunghealth_ä/big.csv', data: big, method: 8 },
  ]);
  assert.equal(await isZip(blob), true);
  assert.equal(await isZip(new Blob(['abc'])), false);
  const entries = await listEntries(blob);
  assert.deepEqual(entries.map((e) => [e.name, e.dir, e.method]), [['samsunghealth_ä/', true, 0], ['samsunghealth_ä/Grüße.txt', false, 0], ['samsunghealth_ä/big.csv', false, 8]]);
  assert.equal(await readText(entries[1]), 'Hallo Welt – äöü');
  assert.equal(await readText(entries[2]), big);
  assert.ok(entries[2].compressedSize < entries[2].size);
  await assert.rejects(() => listEntries(new Blob(['not a zip at all, sorry'])), /ZIP/);
  // also accepts ArrayBuffer
  const ab = await blob.arrayBuffer();
  assert.equal((await listEntries(ab)).length, 3);
});

// ---------------------------------------------------------------------------- samsung helpers
test('samsung helpers: file types, CSV, prefixes, time zones', () => {
  assert.equal(samsungFileType('x/com.samsung.health.weight.20261108101500.csv'), 'weight');
  assert.equal(samsungFileType('com.samsung.shealth.tracker.heart_rate.202611081015.csv'), 'tracker.heart_rate');
  assert.equal(samsungFileType('export.csv', '﻿com.samsung.shealth.step_daily_trend,6311013,6'), 'step_daily_trend');
  assert.equal(samsungFileType('foo.csv', 'a,b'), null);
  assert.deepEqual(parseCsv('a,"b,c","d""e"\r\n1,2,3\n'), [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  const csv = readSamsungCsv('com.samsung.shealth.sleep,1,2\nscore,com.samsung.health.sleep.start_time\n80,2026-11-01 22:00:00.000,\n', 'sleep.csv');
  assert.equal(csv.type, 'sleep');
  assert.deepEqual(csv.columns, ['score', 'start_time']);
  assert.equal(csv.rows[0].start_time, '2026-11-01 22:00:00.000');
  assert.equal(offsetMinutes('UTC+0100'), 60);
  assert.equal(offsetMinutes('UTC-0330'), -210);
  assert.equal(localDate('2026-11-03 23:30:00.000', 'UTC+0100'), '2026-11-04');
  assert.equal(localDate('2026-11-03 23:30:00.000', 'UTC+0000'), '2026-11-03');
  assert.equal(localDate('2026-05-04T00:10:00-03:00'), '2026-05-04');
  assert.equal(localDate('2/3/2024  11:25:47 AM', 'UTC+0100'), null);
  assert.equal(dayTimeDate('1793491200000'), '2026-11-01');
  assert.equal(dayTimeDate('2026-08-03 00:00:00.000'), '2026-08-03');
  assert.equal(dayTimeDate('1.68636E+12'), null);
});

// ---------------------------------------------------------------------------- samsung export
const checkFixtureResult = (res) => {
  const by = Object.fromEntries(res.entries.map((e) => [e.date, e]));
  assert.deepEqual(Object.keys(by), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  // weight & body composition (RENPHO via Samsung): last value per field and day
  const d1 = by['2026-11-01'];
  assert.equal(d1.weightKg, 102.1);
  assert.equal(d1.bodyFatPct, 30.8);
  assert.equal(d1.bodyFatKg, 31.45);
  assert.equal(d1.skeletalMuscleKg, 36.9);
  assert.equal(d1.skeletalMusclePct, 36.14);
  assert.equal(d1.muscleKg, 67.2);
  assert.equal(d1.fatFreeKg, 70.65);
  assert.equal(d1.bmrKcal, 1958);
  assert.equal(d1.waterKg, 51.2);
  assert.equal(d1.visceralFat, 14);
  assert.equal(d1.source, 'samsung-export');
  assert.equal(d1.sources.weightKg, 'samsung-export');
  assert.equal(d1.sources.sleepH, 'samsung-export');
  assert.equal(by['2026-11-02'].weightKg, 102.9, 'later weight-only measurement wins for weight');
  assert.equal(by['2026-11-02'].bodyFatPct, 30.6, 'body fat of the morning stays');
  assert.equal(by['2026-11-04'].weightKg, 101.5, '23:30 UTC + 1 h → next local day');
  assert.equal(by['2026-11-04'].measuredAt, '2026-11-03T23:30:00.000Z');
  assert.equal(by['2026-11-03'].weightKg, undefined);
  // steps: merged total (source_type -2) wins, else max per device
  assert.equal(d1.steps, 6412);
  assert.equal(by['2026-11-02'].steps, 8015);
  assert.equal(by['2026-11-03'].steps, 4870);
  assert.equal(by['2026-11-04'].steps, 5300, 'fallback from activity day summary');
  assert.equal(d1.activeMin, 47);
  // sleep summed per wake-up day, overlapping devices merged
  assert.equal(d1.sleepH, 7.25);
  assert.equal(by['2026-11-02'].sleepH, 7);
  assert.equal(by['2026-11-03'].sleepH, 0.5);
  // resting HR = lowest hourly mean of the local day; implausible values ignored
  assert.equal(d1.restingHr, 58);
  assert.equal(by['2026-11-02'].restingHr, 57);
  assert.equal(by['2026-11-02'].avgTrainingHr, 118);
  const s = res.summary;
  assert.equal(s.days, 5);
  assert.deepEqual(s.range, { from: '2026-11-01', to: '2026-11-05' });
  assert.ok(s.fields.includes('skeletalMuscleKg') && s.fields.includes('sleepH'));
  assert.equal(s.fieldCounts.weightKg, 4);
  assert.deepEqual(s.apps, ['com.renpho.health']);
  assert.equal(s.heightCm, 178);
  assert.equal(s.files.find((f) => f.type === 'floors_climbed')?.used ?? false, false);
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /weight.*1 Zeile/);
};

test('parseSamsungTexts: fixtures → daily entries', () => {
  checkFixtureResult(parseSamsungTexts(fixtureFiles()));
});

test('parseSamsungExport: ZIP (in subfolder, deflated) and single CSV', async () => {
  const files = fixtureFiles().map((f) => ({ name: `samsunghealth_max_20261108101500/${f.name}`, data: f.text }));
  files.push({ name: 'samsunghealth_max_20261108101500/jsons/com.samsung.health.weight/x.json', data: '{}' });
  const res = await parseSamsungExport(makeZip(files));
  checkFixtureResult({ ...res, summary: { ...res.summary, files: [] } });
  assert.equal(res.summary.files.length, 6, 'only known Samsung CSVs are read from the ZIP');
  const one = fixtureFiles().find((f) => f.name.includes('weight'));
  const single = await parseSamsungExport(new Blob([one.text]), { name: one.name });
  assert.equal(single.entries.length, 4);
  assert.equal(single.entries[0].weightKg, 102.1);
  const empty = await parseSamsungExport(makeZip([{ name: 'readme.txt', data: 'x' }]));
  assert.equal(empty.entries.length, 0);
  assert.match(empty.warnings.join(' '), /keine Samsung-Health/i);
});

test('Samsung entries can be previewed & applied', () => {
  const res = parseSamsungTexts(fixtureFiles());
  const st = { healthLog: [{ date: '2026-11-01', weightKg: 102.4, source: 'samsung-health-manual' }] };
  const p = previewImport(st, res.entries);
  assert.equal(p.counts.invalid, 0);
  assert.equal(p.rows.find((r) => r.date === '2026-11-01' && r.field === 'weightKg').status, 'conflict');
  const a = applyImport(st, res.entries);
  assert.equal(a.added, 4);
  assert.equal(a.updated, 1);
  assert.equal(a.state.healthLog[0].weightKg, 102.4);
  assert.equal(a.state.healthLog[0].skeletalMuscleKg, 36.9);
  assert.equal(a.state.healthLog[0].sources.skeletalMuscleKg, 'samsung-export');
  assert.equal(a.state.healthLog[0].sources.weightKg, undefined);
});
