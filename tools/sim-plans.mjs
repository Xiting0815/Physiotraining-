// Prints the resolved session plans of p1/p2 (A/B/C + short) for the four combinations sling owned/not × shoulder
// protection on/off. Debug helper: node tools/sim-plans.mjs [--all]  (--all: every workout of p1/p2)
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
for (const sling of [true, false]) for (const imp of [false, true]) {
  const settings = { ownedEquipment: sling ? [...BASE, 'sling-trainer'] : BASE, equipmentModel: 3, shoulderImpingement: imp };
  console.log(`=== sling ${sling} · impingement ${imp}`);
  for (const w of content.workouts.filter((x) => ['p1-basis', 'p2-aufbau'].includes(x.phaseId) && (all || !x.kind || x.kind === 'strength' || x.kind === 'short'))) {
    const state = { phaseId: w.phaseId, exerciseLevels: {} };
    const p = buildSessionPlan(w, state, content, { settings });
    const min = estimateWorkoutMinutes(p, content, state, settings);
    console.log(`${w.id} (${min}/${p.budgetMin} min) |`, p.exercises.map((e) => e.exerciseId + (e.upgradedFrom ? `*<${e.upgradedFrom}` : '') + (e.fallbackFrom ? `<<${e.fallbackFrom}` : '') + `[${ex[e.exerciseId].type}×${e.plannedSets}]`).join(', '));
  }
}
