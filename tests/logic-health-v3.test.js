// v3: body-composition fields, sources, BMR choice (scale vs. Mifflin–St Jeor), body-composition insight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_FIELDS, HEALTH_GROUPS, BODY_COMP_FIELDS, validateEntry, upsertEntry, mergeLogs, manualSources, weeklyAverages } from '../js/logic/health.js';
import { bmr, bmrInfo, tdee, calorieTarget, SCALE_BMR_MAX_AGE_DAYS } from '../js/logic/energy.js';
import { bodyCompositionInsight, BIA_CAUTION } from '../js/logic/insights.js';
import { addDays } from '../js/util/date.js';

test('HEALTH_FIELDS: groups, German labels, ranges', () => {
  const need = ['weightKg', 'bmi', 'bodyFatPct', 'bodyFatKg', 'subcutFatPct', 'visceralFat', 'musclePct', 'muscleKg', 'skeletalMusclePct',
    'skeletalMuscleKg', 'bonePct', 'boneKg', 'fatFreeKg', 'metabolicAge', 'bmrKcal', 'waterPct', 'waterKg', 'proteinPct', 'proteinKg',
    'waistCm', 'steps', 'activeMin', 'restingHr', 'avgTrainingHr', 'sleepH'];
  assert.deepEqual(Object.keys(HEALTH_FIELDS).sort(), need.slice().sort());
  assert.deepEqual(HEALTH_GROUPS, ['Körper', 'Aktivität', 'Herz & Schlaf']);
  for (const [k, f] of Object.entries(HEALTH_FIELDS)) {
    assert.ok(HEALTH_GROUPS.includes(f.group), k);
    assert.ok(f.label && f.min < f.max, k);
  }
  assert.ok(BODY_COMP_FIELDS.includes('skeletalMuscleKg') && !BODY_COMP_FIELDS.includes('weightKg'));
  // the user's real values must be accepted
  const v = validateEntry({ date: '2026-11-08', weightKg: '102,1', bmi: '32,2', bodyFatPct: '30,8', visceralFat: '14', skeletalMuscleKg: '36,9', bmrKcal: '1958,4', metabolicAge: '48', boneKg: '3,6', proteinPct: '16,1' });
  assert.equal(v.ok, true);
  assert.equal(v.entry.bmrKcal, 1958);
  assert.equal(v.entry.bmi, 32.2);
  assert.match(validateEntry({ date: '2026-11-08', visceralFat: '99' }).errors.visceralFat, /Viszeralfett: bitte zwischen 1 und 60/);
});

test('validateEntry keeps measuredAt and valid sources only', () => {
  const v = validateEntry({ date: '2026-11-08', weightKg: 102.1, bodyFatPct: 30.8, measuredAt: '2026-11-08T05:40:00Z', sources: { weightKg: 'renpho-ocr', bodyFatPct: 'nope', steps: 'manual' } });
  assert.deepEqual(v.entry, { date: '2026-11-08', source: 'samsung-health-manual', weightKg: 102.1, bodyFatPct: 30.8, measuredAt: '2026-11-08T05:40:00Z', sources: { weightKg: 'renpho-ocr' } });
  assert.equal(validateEntry({ date: '2026-11-08', weightKg: 100, measuredAt: 'gestern' }).entry.measuredAt, undefined);
  // old entries (no sources) stay byte-identical
  assert.deepEqual(validateEntry({ date: '2026-11-08', steps: '8000' }).entry, { date: '2026-11-08', source: 'samsung-health-manual', steps: 8000 });
});

test('upsertEntry / mergeLogs / manualSources handle per-field sources', () => {
  let log = upsertEntry([], { date: '2026-11-08', weightKg: 102.1, sources: { weightKg: 'renpho-ocr' } });
  log = upsertEntry(log, { date: '2026-11-08', steps: 7000, sources: { steps: 'samsung-export' } });
  assert.deepEqual(log[0].sources, { weightKg: 'renpho-ocr', steps: 'samsung-export' });
  log = upsertEntry(log, { date: '2026-11-08', steps: null });
  assert.deepEqual(log[0].sources, { weightKg: 'renpho-ocr' });
  const prev = log[0];
  assert.deepEqual(manualSources(prev, { weightKg: 102.1, sleepH: 7 }), { weightKg: 'renpho-ocr', sleepH: 'manual' });
  assert.deepEqual(manualSources(prev, { weightKg: 101.9 }), { weightKg: 'manual' });
  assert.equal(manualSources({ date: 'x', weightKg: 1 }, { weightKg: 2 }), undefined);
  const m = mergeLogs([{ date: '2026-11-08', weightKg: 102, sources: { weightKg: 'manual' } }], [{ date: '2026-11-08', weightKg: 99, steps: 10, sources: { weightKg: 'csv', steps: 'csv' } }]);
  assert.deepEqual(m[0].sources, { weightKg: 'manual', steps: 'csv' });
  assert.equal(weeklyAverages([{ date: '2026-11-08', skeletalMuscleKg: 36.9 }], { weeks: 1, today: '2026-11-08' })[0].avg.skeletalMuscleKg, 36.9);
});

const profile = { heightCm: 178, birthYear: 1978, sex: 'm', activityLevel: 'light' };

test('bmrInfo: mean of scale (≤ 14 days) and Mifflin–St Jeor', () => {
  const today = '2026-11-08';
  const formula = bmr(profile, 102.1, today); // 1021 + 1112.5 − 240 + 5 = 1898.5 → 1899 (rounding)
  assert.equal(formula, Math.round(10 * 102.1 + 6.25 * 178 - 5 * 48 + 5));
  const log = [{ date: '2026-11-07', weightKg: 102.1, bmrKcal: 1958 }];
  const i = bmrInfo(profile, log, today);
  assert.deepEqual(i, { kcal: Math.round((1958 + formula) / 2), method: 'mean', scaleKcal: 1958, scaleDate: '2026-11-07', formulaKcal: formula, label: 'Schätzung' });
  assert.equal(bmrInfo({}, log, today).method, 'scale');
  assert.equal(bmrInfo({}, log, today).kcal, 1958);
  const old = [{ date: addDays(today, -(SCALE_BMR_MAX_AGE_DAYS + 1)), weightKg: 102.1, bmrKcal: 1958 }];
  assert.equal(bmrInfo(profile, old, today).method, 'formula');
  assert.equal(bmrInfo(profile, [{ date: '2026-11-09', bmrKcal: 2500, weightKg: 102 }], today).scaleKcal, null, 'future entries ignored');
  assert.deepEqual(bmrInfo({}, [], today), { kcal: null, method: null, scaleKcal: null, scaleDate: null, formulaKcal: null, label: 'Schätzung' });
  // tdee with log uses the mean, without log stays Mifflin–St Jeor (v2)
  assert.equal(tdee(profile, 102.1, today), Math.round(formula * 1.375));
  assert.equal(tdee(profile, 102.1, today, log), Math.round(i.kcal * 1.375));
  const goal = { targetKg: 92, targetDate: '2027-01-05', startKg: 102.1 };
  const ct = calorieTarget(profile, log, goal, today);
  assert.equal(ct.tdee, Math.round(i.kcal * 1.375));
  assert.equal(ct.bmr.method, 'mean');
  assert.equal(calorieTarget({}, log, goal, today).bmr.method, 'scale');
});

/** Daily log with linear changes over `days` days ending today. */
const compLog = (today, days, { kg0, kg1, fat0, fat1, sm0, sm1, vf0 = 14, vf1 = 14 }) => Array.from({ length: days }, (_, i) => {
  const t = days === 1 ? 1 : i / (days - 1);
  const kg = kg0 + (kg1 - kg0) * t;
  const fatKg = fat0 + (fat1 - fat0) * t;
  return { date: addDays(today, -(days - 1) + i), weightKg: +kg.toFixed(2), bodyFatPct: +((fatKg / kg) * 100).toFixed(2), skeletalMuscleKg: sm0 == null ? undefined : +(sm0 + (sm1 - sm0) * t).toFixed(2), visceralFat: +(vf0 + (vf1 - vf0) * t).toFixed(1) };
});

test('bodyCompositionInsight: classification over 4 / 2 weeks', () => {
  const today = '2026-11-08';
  const kept = bodyCompositionInsight(compLog(today, 28, { kg0: 104, kg1: 101.6, fat0: 33, fat1: 30.8, sm0: 37, sm1: 36.9, vf1: 13 }), today);
  assert.equal(kept.status, 'fat-lost-muscle-kept');
  assert.equal(kept.label, 'Fett verloren, Muskeln gehalten');
  assert.equal(kept.basis, 4);
  assert.match(kept.text, /Gewicht −1,9 kg, Fett −1,7 kg/);
  assert.match(kept.text, /Skelettmuskulatur −0,1 kg, Viszeralfett −0,8 in 4 Wochen/);
  assert.ok(kept.windows[0].weeks === 2 && kept.windows[1].weeks === 4);
  assert.ok(kept.windows[1].delta.visceralFat < 0);
  assert.equal(kept.caution, BIA_CAUTION);
  assert.match(kept.caution, /gleichen Tageszeit/);
  assert.equal(kept.latest.date, today);
  const lost = bodyCompositionInsight(compLog(today, 28, { kg0: 107, kg1: 101, fat0: 33, fat1: 31, sm0: 38.5, sm1: 36.9 }), today);
  assert.equal(lost.status, 'fat-and-muscle-lost');
  assert.match(lost.tips[0], /Krafttraining/);
  assert.match(lost.tips.join(' '), /sehr schnell/);
  assert.equal(bodyCompositionInsight(compLog(today, 28, { kg0: 102, kg1: 102, fat0: 30, fat1: 30.2, sm0: 37, sm1: 37 }), today).status, 'stable');
  assert.equal(bodyCompositionInsight(compLog(today, 28, { kg0: 101, kg1: 102.5, fat0: 30, fat1: 31.2, sm0: 37, sm1: 37.2 }), today).status, 'fat-gained');
  assert.equal(bodyCompositionInsight(compLog(today, 28, { kg0: 103, kg1: 102, fat0: 32, fat1: 30, sm0: 36, sm1: 37 }), today).status, 'recomp');
  assert.equal(bodyCompositionInsight(compLog(today, 28, { kg0: 103, kg1: 102, fat0: 32, fat1: 30 }), today).status, 'fat-lost');
  assert.equal(bodyCompositionInsight(compLog(today, 28, { kg0: 102, kg1: 101.2, fat0: 30, fat1: 30, sm0: 37.5, sm1: 36.6 }), today).status, 'muscle-lost');
  // only 2 weeks of data → basis 2
  const two = bodyCompositionInsight(compLog(today, 14, { kg0: 103, kg1: 102, fat0: 32, fat1: 31, sm0: 37, sm1: 37 }), today);
  assert.equal(two.basis, 2);
  assert.equal(two.status, 'fat-lost-muscle-kept');
  // weight only / nothing
  const w = bodyCompositionInsight(Array.from({ length: 14 }, (_, i) => ({ date: addDays(today, -13 + i), weightKg: 103 - i * 0.1 })), today);
  assert.equal(w.status, 'insufficient');
  assert.match(w.text, /Gewicht −0,7 kg in 2 Wochen/);
  assert.equal(bodyCompositionInsight([], today).status, 'insufficient');
  assert.equal(bodyCompositionInsight([], today).latest, null);
});
