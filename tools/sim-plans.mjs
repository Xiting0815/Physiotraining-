// Prints the resolved session plans of p1/p2 (A/B/C + short) for the four combinations sling owned/not × shoulder
// protection on/off. Debug helper: node tools/sim-plans.mjs [--all] [--balance]
//   --all: every workout of p1/p2 · --balance (v5.5): the user's equipment incl. sling × balance gear none / Balance-Kissen /
//   Schwingplatte / both × protection on/off, p1–p3 incl. the Balance units
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSessionPlan } from '../js/logic/progression.js';
import { estimateWorkoutMinutes } from '../js/logic/duration.js';

const dir = new URL('../data/', import.meta.url);
const r = (f) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(f, dir))));
const content = { exercises: r('exercises.json').exercises, workouts: r('workouts.json').workouts, phases: r('phases.json').phases };
const ex = Object.fromEntries(content.exercises.map((e) => [e.id, e]));
const BASE = ['office-chair', 'massage-stick', 'rowing-machine', 'door-anchor', 'band-handles'];
const all = process.argv.includes('--all');
const balance = process.argv.includes('--balance');
const combos = balance
  ? [[], ['balance-pad'], ['swing-platform'], ['swing-platform', 'balance-pad']].flatMap((b) => [false, true].map((imp) => [`balance ${b.join('+') || 'none'}`, [...BASE, 'sling-trainer', ...b], imp]))
  : [true, false].flatMap((sling) => [false, true].map((imp) => [`sling ${sling}`, sling ? [...BASE, 'sling-trainer'] : BASE, imp]));
const phases = balance ? ['p1-basis', 'p2-aufbau', 'p3-op-vorbereitung'] : ['p1-basis', 'p2-aufbau'];
for (const [name, owned, imp] of combos) {
  const settings = { ownedEquipment: owned, equipmentModel: 3, shoulderImpingement: imp, shoulderMaxElevationDeg: 65 };
  console.log(`=== ${name} · impingement ${imp}`);
  for (const w of content.workouts.filter((x) => phases.includes(x.phaseId) && (all || !x.kind || ['strength', 'short', ...(balance ? ['balance'] : [])].includes(x.kind)))) {
    const state = { phaseId: w.phaseId, exerciseLevels: {} };
    const p = buildSessionPlan(w, state, content, { settings });
    const min = estimateWorkoutMinutes(p, content, state, settings);
    const list = p.exercises.filter((e) => !balance || e.section === 'knee');
    console.log(`${w.id} (${min}/${p.budgetMin} min) |`, list.map((e) => e.exerciseId + (e.upgradedFrom ? `*<${e.upgradedFrom}` : '') + (e.fallbackFrom ? `<<${e.fallbackFrom}` : '') + `[${ex[e.exerciseId].type}×${e.plannedSets}]`).join(', '));
  }
}
