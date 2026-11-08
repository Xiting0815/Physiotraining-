// Spoken cue plans (voice guidance) for one exercise entry. PURE. See docs/SPEC.md §15.5.
//
// exerciseCuePlan(entry, exercise, settings, opts?) → CuePhase[] in time order. The voice/timer layer walks the
// list, speaks `say` at the START of each phase ('' = silent) and waits `seconds` (0 = marker only).
// The phase durations add up to estimateExerciseSeconds() minus the setup time (asserted in tests).
import { effectiveDose, tempoSeconds, prepSeconds, DEFAULT_REP_SEC, SIDE_SWITCH_SEC } from './duration.js';

/** Phase kinds of a cue plan. */
export const CUE_PHASES = ['prep', 'work', 'hold', 'relax', 'switch', 'rep-up', 'rep-hold', 'rep-down', 'rest', 'set-done', 'exercise-done'];

/** Spoken words for rowing intensities (cardio cue plans). */
export const ROW_INTENSITY_SAY = { easy: 'Locker rudern', moderate: 'Gleichmäßig rudern', vigorous: 'Zügig rudern' };

/**
 * Default cue words by exercise kind (overridden per exercise by `exercise.cueWords`).
 * Keys: `up` = first movement of a rep (figure start pose → end pose, tempo's last number), `hold` = pause at the
 * end position or the isometric/stretch hold, `down` = return movement (tempo's first number), `release` = end of a
 * hold, `switch` = change sides, `work` = start of a timed / untimed block.
 */
export const DEFAULT_CUE_WORDS = {
  reps: { up: 'Hoch', hold: 'Halten', down: 'Runter', work: 'Los', switch: 'Seite wechseln', release: '' },
  band: { up: 'Ziehen', hold: 'Halten', down: 'Zurück', work: 'Los', switch: 'Seite wechseln', release: '' },
  isometric: { hold: 'Anspannen', release: 'Loslassen', switch: 'Seite wechseln', work: 'Los', up: 'Hoch', down: 'Runter' },
  stretch: { hold: 'Dehnen', release: 'Lösen', switch: 'Seite wechseln', work: 'Los', up: 'Hoch', down: 'Runter' },
  timed: { work: 'Los', switch: 'Seite wechseln', release: '', hold: 'Halten', up: 'Hoch', down: 'Runter' },
  rowing: { work: 'Rudern', switch: '', release: '', hold: '', up: '', down: '' },
};

/** Which default word set applies to an exercise. @param {import('../types.js').Exercise} exercise */
export function cueKind(exercise) {
  if (!exercise) return 'reps';
  if (exercise.block === 'cardio') return 'rowing';
  if (exercise.type === 'hold') return exercise.category === 'dehnung' ? 'stretch' : 'isometric';
  if (exercise.type === 'timed') return 'timed';
  const banded = exercise.figure?.band || (exercise.levels || []).some((l) => l.band);
  return banded ? 'band' : 'reps';
}

/**
 * Effective cue words: defaults of `cueKind(exercise)` merged with `exercise.cueWords`.
 * @param {import('../types.js').Exercise} exercise
 * @returns {{up: string, hold: string, down: string, work: string, switch: string, release: string}}
 */
export function cueWordsFor(exercise) {
  return { ...DEFAULT_CUE_WORDS[cueKind(exercise)], ...(exercise?.cueWords || {}) };
}

/** "3-1-2" (ecc-pause-con) → {up: 2, hold: 1, down: 3}; the figure plays con → pause → ecc. */
export function tempoParts(tempo) {
  if (tempoSeconds(tempo) == null) return null;
  const [ecc = 0, pause = 0, con = 0] = String(tempo).split('-').map(Number);
  return { up: con, hold: pause, down: ecc };
}

const join = (...parts) => parts.filter(Boolean).join('. ');

/**
 * Cue plan for one exercise entry.
 * @param {{level?: number, plannedSets?: number, override?: object}|null|undefined} entry session entry or `{level}`
 * @param {import('../types.js').Exercise} exercise
 * @param {import('../types.js').Settings} [settings]  uses prepSeconds, holdRelaxSeconds, restDefault
 * @param {{prep?: boolean, fromSet?: number}} [opts]  `prep` (default: true except rowing) adds the
 *   „Bereit machen“ phase before every set; `fromSet` (0-based) starts at a later set (resume).
 * @returns {import('../types.js').CuePhase[]}
 */
export function exerciseCuePlan(entry, exercise, settings, opts = {}) {
  if (!exercise || !exercise.levels?.length) return [];
  const d = effectiveDose(entry, exercise, settings);
  const w = cueWordsFor(exercise);
  const out = [];
  const name = exercise.name;
  const lvl = exercise.levels[Math.max(0, Math.min(exercise.levels.length - 1, entry?.level ?? 0))];
  const push = (phase, seconds, say, extra = {}) => out.push({ phase, seconds: Math.max(0, Math.round(seconds)), say: say || '', setIndex: null, repIndex: null, side: null, ...extra });

  if (exercise.block === 'cardio') return rowingCuePlan(exercise, lvl, entry, opts, settings);

  const prep = opts.prep ?? true;
  const sides = exercise.side === 'perSide' ? 2 : 1;
  const from = Math.max(0, Math.min(d.sets - 1, opts.fromSet ?? 0));
  const isHold = exercise.type === 'hold';
  for (let s = from; s < d.sets; s++) {
    const base = { setIndex: s, sets: d.sets };
    if (prep && d.prep > 0) push('prep', d.prep, s === 0 ? `Bereit machen: ${name}` : `Bereit machen. Satz ${s + 1} von ${d.sets}`, base);
    for (let side = 1; side <= sides; side++) {
      const sb = { ...base, side: sides > 1 ? side : null };
      if (side === 2) push('switch', SIDE_SWITCH_SEC, isHold ? join(w.release, w.switch) : w.switch, sb);
      if (isHold) {
        const reps = Math.max(1, d.reps ?? 1);
        for (let r = 0; r < reps; r++) {
          if (r > 0) push('relax', d.restBetween, w.release, { ...sb, repIndex: r - 1 });
          push('hold', d.hold ?? 10, reps > 1 ? `${w.hold} – ${r + 1}` : w.hold, { ...sb, repIndex: r, reps });
        }
      } else if (exercise.type === 'timed') {
        if (d.phases && entry?.override?.seconds == null) {
          d.phases.forEach((p, i) => push('work', p.seconds || 0, p.say || p.label, { ...sb, repIndex: i, label: p.label }));
        } else push('work', d.seconds ?? 30, w.work, sb);
      } else {
        const reps = Math.max(1, d.reps ?? 10);
        const t = tempoParts(d.tempo);
        if (!t) push('work', reps * DEFAULT_REP_SEC, `${w.work}: ${reps} Wiederholungen`, { ...sb, reps });
        else {
          for (let r = 0; r < reps; r++) {
            const rb = { ...sb, repIndex: r, reps };
            if (t.up > 0) push('rep-up', t.up, w.up, rb);
            if (t.hold > 0) push('rep-hold', t.hold, w.hold, rb);
            if (t.down > 0) push('rep-down', t.down, w.down, rb);
          }
        }
      }
    }
    const last = s === d.sets - 1;
    push('set-done', 0, last ? '' : join(isHold ? w.release : '', `Satz ${s + 1} geschafft`), base);
    if (!last && d.rest > 0) push('rest', d.rest, 'Pause', base);
  }
  push('exercise-done', 0, join(isHold ? w.release : '', 'Übung geschafft'), { sets: d.sets });
  return out;
}

/** Cardio (rowing) entries: drills from level.phases, else work/rest per set; no prep unless opts.prep. */
function rowingCuePlan(exercise, lvl, entry, opts, settings) {
  const out = [];
  const meta = (intensity) => ({ intensity, targetSpm: lvl.targetSpm ?? null, targetRpe: lvl.targetRpe ?? null });
  const spm = Array.isArray(lvl.targetSpm) ? `, Schlagzahl ${lvl.targetSpm[0]} bis ${lvl.targetSpm[1]}` : '';
  const push = (phase, seconds, say, extra) => out.push({ phase, seconds: Math.max(0, Math.round(seconds)), say: say || '', setIndex: null, repIndex: null, side: null, ...extra });
  if (opts.prep) push('prep', prepSeconds(settings), `Bereit machen: ${exercise.name}`, { setIndex: 0, sets: 1 });
  if (Array.isArray(lvl.phases) && lvl.phases.length) {
    lvl.phases.forEach((p, i) => {
      const intensity = p.intensity ?? lvl.intensity ?? 'easy';
      const say = p.say || (i === lvl.phases.length - 1 && p.seconds >= 120 ? `${p.label}${spm}` : p.label);
      push('work', p.seconds, say, { setIndex: 0, sets: 1, repIndex: i, label: p.label, ...meta(intensity) });
    });
  } else {
    const sets = Math.max(1, entry?.plannedSets ?? lvl.sets ?? 1);
    const seconds = entry?.override?.seconds ?? lvl.seconds ?? 60;
    for (let i = 0; i < sets; i++) {
      const intensity = lvl.intensity ?? 'moderate';
      const say = `${ROW_INTENSITY_SAY[intensity] ?? 'Rudern'}${spm}${sets > 1 ? ` – Runde ${i + 1} von ${sets}` : ''}`;
      push('work', seconds, say, { setIndex: i, sets, ...meta(intensity) });
      if (i < sets - 1 && (lvl.rest ?? 0) > 0) push('rest', lvl.rest, lvl.restActive ? 'Locker rudern' : 'Pause', { setIndex: i, sets, ...meta('easy'), targetRpe: lvl.restActive ? [2, 3] : null });
    }
  }
  push('exercise-done', 0, `${exercise.name} geschafft`, {});
  return out;
}

/** Total seconds of a cue plan. @param {import('../types.js').CuePhase[]} plan */
export const cuePlanSeconds = (plan) => (plan || []).reduce((a, p) => a + (p.seconds || 0), 0);
