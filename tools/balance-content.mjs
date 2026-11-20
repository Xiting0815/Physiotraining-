// v5.5 (SPEC §20): balance content for the Schwingplatte (`swing-platform`) and the Balance-Kissen (`balance-pad`).
// Upserts the 10 balance exercises, the upgrade rules of single-leg-stance / single-leg-stance-reach, the Balance units
// p1–p3 (`kind: "balance"`) and `phase.balance`. Idempotent. Texts (short/setup/steps/feel) live in tools/exercise-texts.mjs.
// Run: node tools/balance-content.mjs && node tools/exercise-texts.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { estimateWorkoutMinutes } from '../js/logic/duration.js';

const KNEE_NOTE = 'Beide Beine üben, links mit Ampel-Regel: höchstens leichter Schmerz (≤ 3/10), darüber abbrechen. Linkes Knie weich, nie durchgedrückt, keine Drehung im Standbein; Kniebeugen links nur klein (30–45°, nie tief). Bei Wackeln sofort festhalten.';
const SWING_SAFETY = 'Tragkraft der Platte beachten.';
const hold = (label, sets, h, rest = 20, band = null) => ({ label, sets, reps: 1, hold: h, tempo: null, band, rest });
const reps = (label, sets, n, tempo, rest = 45, band = null) => ({ label, sets, reps: n, tempo, band, rest });
const SWAY = [
  { kind: 'arrow', from: { at: 'swing', dx: -5, dy: 10 }, to: { at: 'swing', dx: -19, dy: 10 } },
  { kind: 'arrow', from: { at: 'swing', dx: 5, dy: 10 }, to: { at: 'swing', dx: 19, dy: 10 } },
];
const PAD_LABEL = { text: 'Kissen', at: 'pad', dx: -18, dy: 3, anchor: 'end' };
const WALL_LABEL = { text: 'Wand', at: 'wall', dx: 4, dy: -40, anchor: 'start' };
const FOOT_LIFT = { kind: 'arrow', from: { at: 'footR', dx: -9, dy: 8 }, to: { at: 'footR', dx: -9, dy: -12 } };
const fig = (poses, extra = {}) => ({ poses, props: [], band: null, mirror: false, ...extra });
const base = (o) => ({
  category: 'stabilitaet', block: 'knee', regressTo: null, progressTo: null, phaseMin: 'p1-basis', postOpAllowed: false,
  kneeNote: KNEE_NOTE, ...o,
});

export const BALANCE_EXERCISES = [
  // ------------------------------------------------------------------ Schwingplatte
  base({
    id: 'swing-stand-both', name: 'Schwingplatte: Stand beidbeinig',
    description: `Beidbeinig auf der federnd aufgehängten Platte stehen und sie ruhig halten – schult die schnellen Ausgleichsreaktionen von Fuß, Knie und Hüfte. ${SWING_SAFETY}`,
    equipment: ['swing-platform'], type: 'hold', side: 'both',
    instructions: ['Barfuß mittig auf die Platte steigen, beide Hände an den Rahmen.', 'Füße hüftbreit, Knie weich, Blick nach vorn.', 'Platte so ruhig wie möglich halten.', 'Zum Absteigen erst beide Hände an den Rahmen.'],
    cues: ['Knie weich', 'Gewicht auf beiden Füßen', 'Ruhig weiteratmen'],
    mistakes: ['Knie durchgedrückt', 'Krampfhaft festhalten', 'Blick nach unten'],
    levels: [hold('Beide Hände am Rahmen · 2 × 30 s', 2, 30, 15), hold('Eine Hand am Rahmen · 2 × 30 s', 2, 30, 15), hold('Freihändig · 2 × 40 s', 2, 40, 15), hold('Freihändig, Kopf langsam drehen · 2 × 40 s', 2, 40, 15), hold('Augen kurz zu, Hände dicht am Rahmen · 3 × 20 s', 3, 20, 15)],
    tags: ['balance', 'propriozeption', 'schwingplatte'],
    figure: fig(['swing-front-stand'], { arrows: SWAY }),
    cueWords: { hold: 'Platte ruhig halten', release: 'Lockern' },
    fallback: ['pad-stand-both'], shoulderElevationDeg: 30,
  }),
  base({
    id: 'swing-single-leg-stance', name: 'Schwingplatte: Einbeinstand',
    description: `Einbeinstand auf der schwingenden Platte, erst links, dann rechts – wie beim Physio, mit Halt am Rahmen. ${SWING_SAFETY}`,
    equipment: ['swing-platform'], type: 'hold', side: 'perSide',
    instructions: ['Barfuß mittig auf die Platte, beide Hände an den Rahmen.', 'Gewicht aufs linke Bein, Knie leicht gebeugt, rechten Fuß lösen.', 'Platte ruhig halten, Becken waagerecht.', 'Absetzen, dann das rechte Bein.'],
    cues: ['Knie über dem 2. Zeh', 'Becken waagerecht', 'Fuß breit und ruhig'],
    mistakes: ['Knie fällt nach innen', 'Knie durchgedrückt', 'Hüfte kippt zur Seite'],
    levels: [hold('Beide Hände am Rahmen · 2 × 15 s je Bein', 2, 15, 15), hold('Beide Hände am Rahmen · 2 × 20 s je Bein', 2, 20, 15), hold('Eine Hand am Rahmen · 2 × 20 s je Bein', 2, 20, 15), hold('Freihändig, Hände dicht am Rahmen · 2 × 20 s je Bein', 2, 20, 15), hold('Freihändig, Kopf drehen / Blick wandern · 2 × 25 s je Bein', 2, 25, 15), hold('Freihändig, Kopf drehen · 3 × 30 s je Bein', 3, 30, 20)],
    tags: ['balance', 'propriozeption', 'standbein', 'schwingplatte'],
    figure: fig(['swing-front-stand', 'swing-front-single'], { arrows: [FOOT_LIFT, ...SWAY] }),
    cueWords: { hold: 'Halten', release: 'Absetzen' },
    fallback: ['pad-single-leg-stance', 'single-leg-stance'], shoulderElevationDeg: 30,
  }),
  base({
    id: 'swing-mini-squat', name: 'Schwingplatte: Mini-Kniebeuge',
    description: `Kleine Kniebeuge auf der schwingenden Platte – Kraft und Gleichgewicht zugleich, Tiefe streng begrenzt. ${SWING_SAFETY}`,
    equipment: ['swing-platform'], type: 'reps', side: 'both',
    instructions: ['Barfuß mittig auf die Platte, Füße hüftbreit, Hände am Rahmen.', 'Gesäß leicht nach hinten, Knie bis höchstens 30° beugen (ab Stufe 4 bis 45°).', 'Platte dabei ruhig halten, Knie über den Füßen.', 'Über die Fersen aufrichten.'],
    cues: ['Knie über den Füßen', 'Gesäß nach hinten', 'Platte ruhig'],
    mistakes: ['Zu tief gehen', 'Knie nach innen', 'Schwung holen'],
    levels: [reps('Hände am Rahmen · 0–30° · 2 × 8', 2, 8, '2-1-2'), reps('Hände am Rahmen · 0–30° · 2 × 10', 2, 10, '2-1-2'), reps('Eine Hand am Rahmen · 0–30° · 2 × 10', 2, 10, '3-1-2'), reps('Freihändig · 0–45° · 2 × 10', 2, 10, '3-1-2')],
    tags: ['balance', 'geschlossene-kette', 'beinachse', 'schwingplatte'],
    figure: fig(['swing-side-squat-up', 'swing-side-squat-down'], { arrows: [{ kind: 'move', from: { at: 'hip', dx: -12 }, to: { at: 'hip', dx: -12 }, bend: 0.2 }, ...SWAY] }),
    cueWords: { up: 'Beugen', hold: 'Halten', down: 'Strecken' },
    fallback: ['pad-mini-squat', 'mini-squat'], shoulderElevationDeg: 40,
  }),
  base({
    id: 'swing-split-stance', name: 'Schwingplatte: Schrittstand',
    description: `Ein Fuß auf der Platte, der andere auf dem Boden: Platte ruhig halten, später das Gewicht verlagern. Guter Einstieg vor dem Einbeinstand. ${SWING_SAFETY}`,
    equipment: ['swing-platform'], type: 'hold', side: 'perSide',
    instructions: ['Linken Fuß mittig auf die Platte, rechten Fuß an der freien Seite auf den Boden.', 'Eine Hand am Rahmen, Knie weich.', 'Platte ruhig halten bzw. das Gewicht langsam vor und zurück verlagern.', 'Danach Füße tauschen: rechter Fuß auf die Platte.'],
    cues: ['Knie über dem Fuß', 'Langsam verlagern', 'Oberkörper aufrecht'],
    mistakes: ['Platte wegschieben', 'Knie nach innen', 'Ruckartig verlagern'],
    levels: [hold('Platte ruhig halten, Hand am Rahmen · 2 × 20 s je Seite', 2, 20, 15), hold('Platte ruhig halten, freihändig · 2 × 30 s je Seite', 2, 30, 15), hold('Gewicht langsam vor und zurück verlagern · 2 × 30 s je Seite', 2, 30, 15), hold('Gewicht verlagern, Kopf drehen · 3 × 30 s je Seite', 3, 30, 20)],
    tags: ['balance', 'propriozeption', 'schwingplatte'],
    figure: fig(['swing-side-split-back', 'swing-side-split-front'], { arrows: [{ kind: 'move', from: { at: 'hip', dy: -10 }, to: { at: 'hip', dy: -10 }, bend: -0.15 }, ...SWAY] }),
    cueWords: { hold: 'Platte ruhig halten', release: 'Lösen', switch: 'Füße tauschen' },
    fallback: ['pad-step-on'], shoulderElevationDeg: 45,
  }),
  base({
    id: 'swing-single-leg-perturbation', name: 'Schwingplatte: Einbeinstand mit Band-Störimpuls',
    description: `Einbeinstand auf der Platte, während die Arme vor dem Bauch ein Band rhythmisch auseinanderziehen – die Störung fordert die Kniekontrolle. Arme bleiben tief. ${SWING_SAFETY}`,
    equipment: ['swing-platform', 'theraband'], type: 'hold', side: 'perSide', phaseMin: 'p2-aufbau',
    instructions: ['Barfuß mittig auf die Platte, Band vor dem Bauch in beiden Händen.', 'Aufs linke Bein stellen, Knie leicht gebeugt, rechten Fuß lösen.', 'Band rhythmisch auseinanderziehen, Ellbogen tief, Platte ruhig.', 'Absetzen, dann das rechte Bein.'],
    cues: ['Arme tief, unter Brusthöhe', 'Knie ruhig über dem Fuß', 'Rhythmisch ziehen'],
    mistakes: ['Arme zu hoch', 'Knie wackelt nach innen', 'Luft anhalten'],
    levels: [hold('Arme vor dem Bauch hin und her führen · 2 × 20 s je Bein', 2, 20, 20), hold('Band gelb rhythmisch auseinanderziehen · 2 × 20 s je Bein', 2, 20, 20, 'yellow'), hold('Band rot · 2 × 25 s je Bein', 2, 25, 20, 'red'), hold('Band rot, dabei Kopf langsam drehen · 2 × 30 s je Bein', 2, 30, 20, 'red')],
    tags: ['balance', 'propriozeption', 'standbein', 'schwingplatte'],
    figure: fig(['swing-front-band-in', 'swing-front-band-out'], { band: { from: 'handL', to: 'handR' }, arrows: [{ kind: 'move', from: 'handL', to: 'handL' }, { kind: 'move', from: 'handR', to: 'handR', bend: -0.18 }, ...SWAY] }),
    cueWords: { hold: 'Ziehen, Knie ruhig', release: 'Absetzen' },
    fallback: ['pad-single-leg-perturbation', 'single-leg-stance'], shoulderElevationDeg: 50,
  }),
  // ------------------------------------------------------------------ Balance-Kissen
  base({
    id: 'pad-stand-both', name: 'Balance-Kissen: Stand beidbeinig',
    description: 'Beidbeinig auf dem Luftkissen stehen und ruhig werden – der sanfte Einstieg ins Gleichgewichtstraining.',
    equipment: ['balance-pad', 'wall'], type: 'hold', side: 'both',
    instructions: ['Kissen eine Unterarmlänge neben die Wand legen.', 'Barfuß mit beiden Füßen mittig aufs Kissen steigen, Hand nah an der Wand.', 'Knie weich, Blick auf einen Punkt, ruhig stehen.', 'Absteigen mit Hand an der Wand.'],
    cues: ['Knie weich', 'Gewicht mittig', 'Groß werden'],
    mistakes: ['Knie durchgedrückt', 'Blick nach unten', 'Luft anhalten'],
    levels: [hold('Augen offen, Hand nah an der Wand · 2 × 30 s', 2, 30, 15), hold('Freihändig, Kopf langsam drehen · 2 × 30 s', 2, 30, 15), hold('Füße eng zusammen · 2 × 30 s', 2, 30, 15), hold('Augen zu, Hand nah an der Wand · 2 × 20 s', 2, 20, 15)],
    tags: ['balance', 'propriozeption', 'balance-kissen'],
    figure: fig(['pad-front-stand'], { labels: [WALL_LABEL, PAD_LABEL], arrows: [] }),
    cueWords: { hold: 'Ruhig stehen', release: 'Lockern' },
    fallback: [], shoulderElevationDeg: 30,
  }),
  base({
    id: 'pad-single-leg-stance', name: 'Balance-Kissen: Einbeinstand',
    description: 'Einbeinstand auf dem Luftkissen, erst links, dann rechts – die Wand gibt Sicherheit.',
    equipment: ['balance-pad', 'wall'], type: 'hold', side: 'perSide',
    instructions: ['Kissen eine Unterarmlänge neben die Wand legen.', 'Barfuß aufs Kissen, Gewicht aufs linke Bein, Knie leicht gebeugt.', 'Rechten Fuß lösen, Becken waagerecht, Blick auf einen Punkt.', 'Absetzen, umdrehen und das rechte Bein.'],
    cues: ['Knie über dem 2. Zeh', 'Becken waagerecht', 'Fuß breit und ruhig'],
    mistakes: ['Knie fällt nach innen', 'Knie durchgedrückt', 'Becken kippt ab'],
    levels: [hold('Hand an der Wand · 2 × 15 s je Bein', 2, 15, 15), hold('Fingerspitzen an der Wand · 2 × 20 s je Bein', 2, 20, 15), hold('Freihändig · 2 × 20 s je Bein', 2, 20, 15), hold('Freihändig, Kopf drehen · 2 × 25 s je Bein', 2, 25, 15), hold('Augen kurz zu, Hand nah an der Wand · 3 × 20 s je Bein', 3, 20, 20)],
    tags: ['balance', 'propriozeption', 'standbein', 'balance-kissen'],
    figure: fig(['pad-front-stand', 'pad-front-single'], { labels: [WALL_LABEL], arrows: [FOOT_LIFT] }),
    cueWords: { hold: 'Halten', release: 'Absetzen' },
    fallback: ['single-leg-stance'], shoulderElevationDeg: 30,
  }),
  base({
    id: 'pad-mini-squat', name: 'Balance-Kissen: Mini-Kniebeuge',
    description: 'Kleine Kniebeuge auf dem Luftkissen – das Wackeln fordert die Beinachse, die Tiefe bleibt klein.',
    equipment: ['balance-pad', 'wall'], type: 'reps', side: 'both',
    instructions: ['Kissen eine Armlänge vor die Wand legen, Gesicht zur Wand.', 'Barfuß aufs Kissen, Füße hüftbreit, Fingerspitzen leicht an der Wand.', 'Gesäß nach hinten, Knie bis höchstens 30° beugen (ab Stufe 3 bis 45°).', 'Über die Fersen aufrichten.'],
    cues: ['Knie über den Füßen', 'Gesäß nach hinten', 'Gewicht mittig'],
    mistakes: ['Zu tief gehen', 'Knie nach innen', 'Fersen heben ab'],
    levels: [reps('0–30°, Fingerspitzen an der Wand · 2 × 8', 2, 8, '2-1-2'), reps('0–30° · 2 × 10', 2, 10, '2-1-2'), reps('0–45° freihändig · 2 × 10', 2, 10, '3-1-2'), reps('0–45° freihändig · 3 × 10', 3, 10, '3-1-2')],
    tags: ['balance', 'geschlossene-kette', 'beinachse', 'balance-kissen'],
    figure: fig(['pad-side-squat-up', 'pad-side-squat-down'], { labels: [WALL_LABEL], arrows: [{ kind: 'move', from: { at: 'hip', dx: -12 }, to: { at: 'hip', dx: -12 }, bend: 0.2 }] }),
    cueWords: { up: 'Beugen', hold: 'Halten', down: 'Strecken' },
    fallback: ['mini-squat'], shoulderElevationDeg: 50,
  }),
  base({
    id: 'pad-step-on', name: 'Balance-Kissen: Schritt aufs Kissen',
    description: 'Mit einem Fuß nach vorn aufs Kissen treten, kurz stabilisieren und zurück – übt das sichere Auffangen des Körpergewichts.',
    equipment: ['balance-pad', 'wall'], type: 'reps', side: 'perSide',
    instructions: ['Kissen einen kleinen Schritt vor dich legen, Wand seitlich in Reichweite.', 'Mit dem linken Fuß aufs Kissen treten, Knie leicht gebeugt.', 'Kurz stabilisieren, dann zurück auf den Boden.', 'Danach mit dem rechten Fuß.'],
    cues: ['Knie über dem Fuß', 'Weich auffangen', 'Oberkörper aufrecht'],
    mistakes: ['Knie fällt nach innen', 'Zu großer Schritt', 'Hart aufsetzen'],
    levels: [reps('Hand an der Wand · 2 × 6 je Bein', 2, 6, '1-2-1', 30), reps('Freihändig · 2 × 8 je Bein', 2, 8, '1-2-1', 30), reps('Freihändig, 3 s stabilisieren · 2 × 8 je Bein', 2, 8, '1-3-1', 30), reps('Schritt seitlich aufs Kissen · 2 × 8 je Bein', 2, 8, '1-3-1', 30)],
    tags: ['balance', 'propriozeption', 'balance-kissen'],
    figure: fig(['pad-side-step-floor', 'pad-side-step-on'], { labels: [PAD_LABEL] }),
    cueWords: { up: 'Aufs Kissen', hold: 'Stabil halten', down: 'Zurück' },
    fallback: ['swing-split-stance'], shoulderElevationDeg: 20,
  }),
  base({
    id: 'pad-single-leg-perturbation', name: 'Balance-Kissen: Einbeinstand mit Band-Störimpuls',
    description: 'Einbeinstand auf dem Kissen, während die Arme vor dem Bauch ein Band auseinanderziehen – Kniekontrolle unter Störung, Arme bleiben tief.',
    equipment: ['balance-pad', 'wall', 'theraband'], type: 'hold', side: 'perSide', phaseMin: 'p2-aufbau',
    instructions: ['Kissen eine Unterarmlänge neben die Wand legen, Band in beiden Händen.', 'Barfuß aufs Kissen, aufs linke Bein, Knie leicht gebeugt.', 'Band vor dem Bauch rhythmisch auseinanderziehen, Ellbogen tief.', 'Absetzen, umdrehen und das rechte Bein.'],
    cues: ['Arme tief, unter Brusthöhe', 'Knie ruhig über dem Fuß', 'Rhythmisch ziehen'],
    mistakes: ['Arme zu hoch', 'Knie wackelt nach innen', 'Luft anhalten'],
    levels: [hold('Arme vor dem Bauch hin und her führen · 2 × 20 s je Bein', 2, 20, 20), hold('Band gelb rhythmisch auseinanderziehen · 2 × 20 s je Bein', 2, 20, 20, 'yellow'), hold('Band rot · 2 × 25 s je Bein', 2, 25, 20, 'red'), hold('Band rot, dabei Kopf langsam drehen · 2 × 30 s je Bein', 2, 30, 20, 'red')],
    tags: ['balance', 'propriozeption', 'standbein', 'balance-kissen'],
    figure: fig(['pad-front-band-in', 'pad-front-band-out'], { band: { from: 'handL', to: 'handR' }, labels: [WALL_LABEL], arrows: [{ kind: 'move', from: 'handL', to: 'handL' }, { kind: 'move', from: 'handR', to: 'handR', bend: -0.18 }] }),
    cueWords: { hold: 'Ziehen, Knie ruhig', release: 'Absetzen' },
    fallback: ['single-leg-stance'], shoulderElevationDeg: 50,
  }),
];

/** Upgrade rules on the existing balance items of the strength workouts (Schwingplatte first, then the cushion). */
export const BALANCE_UPGRADES = {
  'single-leg-stance': [
    { equipment: ['swing-platform'], exerciseId: 'swing-single-leg-stance', chip: 'Schwingplatten-Variante' },
    { equipment: ['balance-pad'], exerciseId: 'pad-single-leg-stance', chip: 'Kissen-Variante' },
  ],
  'single-leg-stance-reach': [
    { equipment: ['swing-platform'], exerciseId: 'swing-single-leg-perturbation', chip: 'Schwingplatten-Variante' },
    { equipment: ['swing-platform'], exerciseId: 'swing-single-leg-stance', chip: 'Schwingplatten-Variante' },
    { equipment: ['balance-pad'], exerciseId: 'pad-single-leg-perturbation', chip: 'Kissen-Variante' },
    { equipment: ['balance-pad'], exerciseId: 'pad-single-leg-stance', chip: 'Kissen-Variante' },
  ],
};

const PHASE_NAMES = { 'p1-basis': 'Basis', 'p2-aufbau': 'Aufbau', 'p3-op-vorbereitung': 'OP-Vorbereitung' };
/** Balance unit (10–15 min): warm-up, 4–5 balance items (Schwingplatte first, each falls back to the cushion), calf stretch. */
export function balanceWorkout(phaseId) {
  const early = phaseId === 'p1-basis';
  const items = early
    ? ['swing-stand-both', 'swing-single-leg-stance', 'swing-split-stance', 'swing-mini-squat', 'pad-step-on']
    : ['swing-single-leg-stance', 'swing-split-stance', 'swing-mini-squat', 'swing-single-leg-perturbation', 'pad-step-on'];
  return {
    id: `${phaseId.split('-')[0]}-balance`,
    name: `Balance – ${PHASE_NAMES[phaseId]} (10–15 Min.)`,
    phaseId,
    kind: 'balance',
    durationMin: 0,
    maxMinutes: 15,
    maxSets: 2,
    description: 'Gleichgewicht auf Schwingplatte oder Balance-Kissen – je nachdem, was du abgehakt hast. Beide Beine, links mit Ampel-Regel (Schmerz höchstens 3/10). Barfuß, Halt in Reichweite. Zählt nicht fürs Wochenziel.',
    warmup: [{ exerciseId: 'ankle-circles-seated', maxSets: 1 }, { exerciseId: 'leg-swing-front', maxSets: 1 }],
    blocks: [{ id: 'knee', title: 'Balance', items: items.map((exerciseId) => ({ exerciseId })) }],
    cooldown: [{ exerciseId: 'calf-stretch-wall', maxSets: 1 }],
  };
}
export const BALANCE_PHASES = ['p1-basis', 'p2-aufbau', 'p3-op-vorbereitung'];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const write = (f, d) => writeFileSync(join(dir, f), JSON.stringify(d, null, 2) + '\n');
  const exData = read('exercises.json');
  const list = exData.exercises;
  for (const e of BALANCE_EXERCISES) {
    const i = list.findIndex((x) => x.id === e.id);
    const old = i >= 0 ? list[i] : {};
    const next = { ...e, ...Object.fromEntries(['short', 'setup', 'steps', 'feel'].filter((k) => old[k]).map((k) => [k, old[k]])) };
    if (i >= 0) list[i] = next; else list.push(next);
  }
  for (const [id, ups] of Object.entries(BALANCE_UPGRADES)) {
    const e = list.find((x) => x.id === id);
    e.upgrades = [...(e.upgrades || []).filter((u) => !ups.some((v) => v.exerciseId === u.exerciseId)), ...ups];
  }
  write('exercises.json', exData);
  const wData = read('workouts.json');
  for (const phaseId of BALANCE_PHASES) {
    const w = balanceWorkout(phaseId);
    const i = wData.workouts.findIndex((x) => x.id === w.id);
    w.durationMin = estimateWorkoutMinutes(w, { exercises: list, workouts: wData.workouts, phases: read('phases.json').phases }, { phaseId, exerciseLevels: {} }, {});
    if (i >= 0) wData.workouts[i] = w; else wData.workouts.push(w);
  }
  write('workouts.json', wData);
  const pData = read('phases.json');
  for (const phaseId of BALANCE_PHASES) pData.phases.find((p) => p.id === phaseId).balance = balanceWorkout(phaseId).id;
  write('phases.json', pData);
  console.log('balance content upserted');
}
