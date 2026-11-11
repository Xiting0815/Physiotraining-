// v5.3 verständliche Anleitungen: every exercise has a layperson text set (short / setup / steps / feel), wall and
// door exercises state orientation + distance, no overhead wording where the shoulder limit applies, helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shoulderOk } from '../js/logic/shoulder.js';
import { OFFICE_CHAIR_NOTE } from '../js/logic/equipment.js';
import { shortFor, stepsFor, feelFor, setupFor, equipmentSetupFor, setupHeadline } from '../js/logic/exercise-text.js';
import { applyTexts, TEXTS } from '../tools/exercise-texts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'exercises.json'), 'utf8'));
const exercises = data.exercises;
const ex = (id) => exercises.find((e) => e.id === id);
const words = (s) => s.trim().split(/\s+/).length;
const settingsWith = (owned) => ({ ownedEquipment: owned });

/** Exercises done next to a wall (equipment, figure prop, or explicitly placed at a wall). */
const WALL_EXTRA = ['single-leg-stance-reach'];
const isWall = (e) => e.equipment.includes('wall') || (e.figure?.props || []).includes('wall') || WALL_EXTRA.includes(e.id);
const ORIENT = /Gesicht|Rücken|seitlich/i;
const DISTANCE = /\d+\s*(cm|m)\b|Schritt|Fußlänge|Armlänge|Unterarmlänge|Handbreit|Abstand/i;
/** Telling the user to lift the arms above shoulder level (negated sentences are fine: „nicht über …“). */
const OVERHEAD = /über (den|dem) Kopf|über Kopfhöhe|überkopf|in ein Y|\bArme?\b[^.,;]{0,25}\b(nach oben|hoch)\b|auf Schulterhöhe|zur Decke/i;
const NEGATED = /\b(nicht|ohne|nie|kein|keine|unter)\b/i;
const PROTECT = { shoulderImpingement: true, shoulderMaxElevationDeg: 65 };

test('every exercise has short, setup, 3–4 short steps and a feel line', () => {
  for (const e of exercises) {
    assert.equal(typeof e.short, 'string', `${e.id}.short`);
    assert.ok(e.short.length >= 15 && e.short.length <= 140, `${e.id}.short length ${e.short.length}`);
    assert.ok(!/\n/.test(e.short), `${e.id}.short is one line`);
    assert.equal(typeof e.setup, 'string', `${e.id}.setup`);
    assert.ok(e.setup.length >= 20, `${e.id}.setup too short`);
    assert.ok(Array.isArray(e.steps) && e.steps.length >= 3 && e.steps.length <= 4, `${e.id}.steps count`);
    for (const s of e.steps) {
      assert.equal(typeof s, 'string');
      assert.ok(words(s) <= 15, `${e.id}: step too long (${words(s)} words): ${s}`);
    }
    assert.match(e.feel, /^Du spürst[ ,]/, `${e.id}.feel`);
    // legacy fields are kept for backward compatibility
    assert.ok(Array.isArray(e.instructions) && e.instructions.length > 0, `${e.id}.instructions kept`);
  }
});

test('wall exercises state the orientation (Gesicht/Rücken/seitlich) and a distance', () => {
  const walls = exercises.filter(isWall);
  assert.ok(walls.length >= 20, `wall exercises: ${walls.length}`);
  for (const e of walls) {
    assert.match(e.setup, ORIENT, `${e.id}: orientation to the wall`);
    assert.match(e.setup, DISTANCE, `${e.id}: distance to the wall`);
    assert.match(e.setup, /Wand/, `${e.id}: mentions the wall`);
  }
});

test('door / band-anchor exercises say how to stand relative to the door', () => {
  // single-leg-stance only uses the band in the hands (level 5), not the door
  for (const e of exercises.filter((x) => x.equipment.includes('door') && x.id !== 'single-leg-stance')) {
    const all = [e.setup, ...e.steps].join(' ');
    assert.match(all, /(Gesicht|Rücken|seitlich|Blick|Kopf|Füße)[^.]{0,40}(Tür|Türrahmen|Rahmen)|in den Türrahmen|Kante des Türrahmens/i, `${e.id}: orientation to the door`);
  }
});

test('perSide exercises explain how to switch sides', () => {
  for (const e of exercises.filter((x) => x.side === 'perSide')) {
    const all = [e.setup, ...e.steps].join(' ');
    assert.match(all, /Seite|umdrehen|tauschen|wechsel|danach (links|rechts)|dann (links|rechts)|andere(s|n)? (Bein|Hand|Arm|Ferse|Knie)|rechte(s|n)? (Bein|Knie|Ferse)|linke(s|n)? (Bein|Ferse)/i, `${e.id}: switching sides`);
  }
});

test('no overhead wording where the shoulder limit applies (archery draw drills excepted)', () => {
  let checked = 0;
  for (const e of exercises) {
    if (e.archeryDraw) continue;
    if (!e.levels.every((_, i) => shoulderOk(e, i, PROTECT))) continue;
    checked++;
    const texts = [e.short, e.setup, ...e.steps, e.feel, ...e.cues, ...e.instructions, ...Object.values(e.setupByEquipment || {})];
    for (const t of texts) {
      for (const sentence of t.split(/(?<=[.!?])\s+/)) {
        if (OVERHEAD.test(sentence)) assert.match(sentence, NEGATED, `${e.id}: overhead wording „${sentence}“`);
      }
    }
  }
  assert.ok(checked > 60, `checked ${checked}`);
  // the regex itself catches overhead instructions
  assert.match('Heb dann die gestreckten Arme langsam nach vorn hoch.', OVERHEAD);
  assert.match('Arme langsam über den Kopf führen.', OVERHEAD);
  assert.doesNotMatch('Dreh den Unterarm langsam nach oben.', OVERHEAD);
});

test('texts match the dose: no promised extra sets, endurance holds 10 s, side plank without chair', () => {
  for (const e of exercises) for (const l of e.levels) assert.ok(!/\+1 Satz/.test(l.label), `${e.id}: ${l.label}`);
  const es = ex('endurance-series');
  assert.ok(es.levels.every((l) => l.hold === 10 && l.restBetween === 20 && l.rest === 120));
  assert.match(es.steps.join(' '), /10 s/);
  assert.match(es.steps.join(' '), /20 s Pause/);
  assert.match(es.steps.join(' '), /2 min Pause/);
  assert.ok(!/8–12 s/.test([es.description, ...es.instructions].join(' ')));
  assert.ok(ex('side-plank-elevated').levels.every((l) => !/Stuhl/.test(l.label)));
  assert.match(ex('wall-sit').setup, /30°.*45°/);
});

test('tools/exercise-texts.mjs is applied (data in sync, figures untouched)', () => {
  assert.deepEqual(applyTexts(data), data);
  assert.deepEqual(Object.keys(TEXTS).sort(), exercises.map((e) => e.id).sort());
});

test('exercise-text helpers: steps/short/feel, equipment setup lines and the prep headline', () => {
  const tke = ex('tke');
  assert.deepEqual(stepsFor(tke), tke.steps);
  assert.equal(shortFor(tke), tke.short);
  assert.equal(feelFor(tke), tke.feel);
  assert.deepEqual(stepsFor({ instructions: ['a', 'b', 'c', 'd', 'e'] }), ['a', 'b', 'c', 'd']);
  assert.equal(shortFor({ description: 'x' }), 'x');
  // knot step without anchor, anchor text with it, handles inserted
  const sr = ex('seated-row');
  assert.deepEqual(equipmentSetupFor(sr, null), [sr.instructions[0]]);
  assert.deepEqual(equipmentSetupFor(sr, settingsWith([])), [sr.instructions[0]]);
  assert.deepEqual(equipmentSetupFor(sr, settingsWith(['door-anchor', 'band-handles'])), [sr.setupByEquipment['door-anchor'], sr.setupByEquipment['band-handles']]);
  assert.equal(setupFor(sr, settingsWith(['door-anchor'])).at(-1), sr.setup);
  // office chair note for seat exercises (optional)
  const kp = ex('knee-pendulum');
  assert.deepEqual(setupFor(kp, settingsWith(['office-chair'])), [OFFICE_CHAIR_NOTE, kp.setup]);
  assert.deepEqual(setupFor(kp, settingsWith(['office-chair']), { chair: false }), [kp.setup]);
  // first sentence, abbreviations („ca.“) do not end it
  assert.equal(setupHeadline(ex('wall-sit')), 'Stell dich mit dem Rücken an die Wand.');
  assert.equal(setupHeadline(ex('calf-raise')), 'Stell dich mit dem Gesicht zur Wand, ca. 30 cm (eine Fußlänge) entfernt, Füße hüftbreit.');
  assert.equal(setupHeadline({}), '');
});
