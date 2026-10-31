// Übung (detail) – see docs/SPEC.md §3.5.
import { html, raw, render as paint } from '../render.js';
import { levelOf } from '../logic/progression.js';
import { dayOf } from '../logic/stats.js';
import { lineChart } from '../components/charts.js';
import {
  ICON, BLOCK_LABEL, EQUIPMENT_LABEL, SIDE_LABEL, ensureViewStyles, applyFontScale, pageHeader, doseText, bandChip,
  bandInfo, workoutItems, shortDate, confirmDialog, toast,
} from './ui.js';

export const title = 'Übung';

/**
 * Per-session history of one exercise (done sessions, oldest first).
 * metric: hold → longest hold (s); timed → total seconds; reps → total reps of done sets.
 * @param {any[]} sessions @param {any} ex
 * @returns {{date: string, sessionId: string, level: number, sets: number, reps: number, hold: number, seconds: number, value: number, painDuring: number|null, rpe: number|null, band: string|null}[]}
 */
export function exerciseHistory(sessions, ex) {
  const out = [];
  for (const s of sessions || []) {
    if (s?.status !== 'done') continue;
    for (const e of s.exercises || []) {
      if (e.exerciseId !== ex.id || e.skipped) continue;
      const done = (e.sets || []).filter((x) => x?.done);
      if (!done.length) continue;
      const reps = done.reduce((a, x) => a + (x.reps || 0), 0);
      const hold = done.reduce((a, x) => Math.max(a, x.hold || 0), 0);
      const seconds = done.reduce((a, x) => a + (x.seconds || 0), 0);
      const band = done.map((x) => x.band).filter(Boolean).at(-1) ?? null;
      const value = ex.type === 'hold' ? hold : ex.type === 'timed' ? seconds : reps;
      out.push({ date: dayOf(s), sessionId: s.id, level: e.level ?? 0, sets: done.length, reps, hold, seconds, value, painDuring: e.painDuring ?? null, rpe: e.rpe ?? null, band });
    }
  }
  return out;
}

const squash = (t) => String(t ?? '').replace(/\s+/g, '').toLowerCase();
const sameText = (label, dose) => !!dose && squash(label).includes(squash(dose));

const niceMax = (v) => {
  if (v <= 10) return 10;
  const steps = [12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 600];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 100) * 100;
};

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, params, query }) {
  ensureViewStyles();
  const ex = content.exercises.find((e) => e.id === params.id);
  const back = query.from === 'plan' ? '#/plan' : query.from === 'verlauf' ? '#/verlauf' : '#/uebungen';
  if (!ex) {
    paint(root, html`${pageHeader({ title: 'Übung nicht gefunden', back })}
      <section class="card"><div class="empty"><h3 class="empty__title">Diese Übung gibt es nicht (mehr).</h3>
      <a class="btn btn--primary" href="#/uebungen">Zur Übersicht</a></div></section>`);
    return undefined;
  }
  document.title = `${ex.name} · Physio`;
  const usedIn = content.workouts.filter((w) => workoutItems(w).some((it) => it.exerciseId === ex.id));
  const exById = (id) => content.exercises.find((e) => e.id === id);
  const blockCls = ex.block === 'archery' ? 'archery' : ex.block === 'knee' ? 'knee' : '';

  const draw = () => {
    const data = store.get();
    applyFontScale(data.settings);
    const { settings, state } = data;
    const li = levelOf(state, ex.id, ex);
    const lvl = ex.levels[li];
    const hist = exerciseHistory(data.sessions, ex);
    const best = hist.reduce((a, h) => Math.max(a, h.value), 0);
    const unit = ex.type === 'hold' ? 's' : ex.type === 'timed' ? 's' : 'Wdh.';
    const metricName = ex.type === 'hold' ? 'Längster Hold' : ex.type === 'timed' ? 'Sekunden gesamt' : 'Wiederholungen gesamt';
    const regress = ex.regressTo ? exById(ex.regressTo) : null;
    const progress = ex.progressTo ? exById(ex.progressTo) : null;
    const band = bandInfo(settings, lvl.band);

    paint(root, html`
      ${pageHeader({ title: ex.name, eyebrow: `${BLOCK_LABEL[ex.block] ?? ''} · ${ex.category ?? ''}`, back })}

      <div class="pv-figure-stage">
        <pt-figure exercise-id="${ex.id}" level="${li}" ${lvl.tempo ? html`tempo="${lvl.tempo}"` : ''} aria-label="Animation: ${ex.name}"></pt-figure>
        <div class="chip-row">
          <span class="chip chip--sm ${blockCls ? `chip--${blockCls}` : ''}">${BLOCK_LABEL[ex.block]}</span>
          ${ex.side && ex.side !== 'both' ? html`<span class="chip chip--sm">${SIDE_LABEL[ex.side] ?? ex.side}</span>` : ''}
        </div>
      </div>

      ${ex.description ? html`<p class="text-lg">${ex.description}</p>` : ''}

      <section class="card">
        <div class="card__header">
          <div><p class="eyebrow">Deine aktuelle Dosis</p><h2 class="card__title">Stufe <span class="num">${li + 1}</span> von <span class="num">${ex.levels.length}</span></h2></div>
          ${band ? bandChip(settings, lvl.band, { sm: false }) : ''}
        </div>
        <div class="dose">
          <div class="dose__item"><span class="dose__value">${lvl.sets}</span><span class="dose__label">Sätze</span></div>
          ${lvl.reps != null ? html`<div class="dose__item"><span class="dose__value">${lvl.reps}</span><span class="dose__label">Wdh.${ex.side === 'perSide' ? ' / Seite' : ''}</span></div>` : ''}
          ${lvl.hold ? html`<div class="dose__item"><span class="dose__value">${lvl.hold}<small>s</small></span><span class="dose__label">Halten</span></div>` : ''}
          ${lvl.seconds ? html`<div class="dose__item"><span class="dose__value">${lvl.seconds}<small>s</small></span><span class="dose__label">Dauer</span></div>` : ''}
          <div class="dose__item"><span class="dose__value">${Number.isFinite(settings.restDefault) && lvl.rest !== 0 ? settings.restDefault : (lvl.rest ?? 0)}<small>s</small></span><span class="dose__label">Pause</span></div>
        </div>
        <div class="chip-row">
          ${lvl.tempo ? html`<span class="chip chip--outline chip--sm">Tempo ${lvl.tempo}</span>` : ''}
          ${(ex.equipment || []).map((e) => html`<span class="chip chip--sm">${EQUIPMENT_LABEL[e] ?? e}</span>`)}
        </div>
      </section>

      ${ex.kneeNote ? html`<div class="pv-callout pv-callout--knee"><span class="pv-callout__icon" aria-hidden="true">🦵</span>
        <div><p class="strong">Hinweis fürs Knie</p><p>${ex.kneeNote}</p></div></div>` : ''}

      <section class="card">
        <h2 class="card__title mb-4">So geht's</h2>
        <ol class="steps">${(ex.instructions || []).map((s) => html`<li>${s}</li>`)}</ol>
      </section>

      ${(ex.cues || []).length || (ex.mistakes || []).length ? html`<div class="grid-2 mb-4">
        ${(ex.cues || []).length ? html`<section class="card card--tight"><p class="eyebrow">Darauf achten</p>
          <ul class="pv-bullets pv-bullets--ok text-sm">${ex.cues.map((c) => html`<li>${c}</li>`)}</ul></section>` : ''}
        ${(ex.mistakes || []).length ? html`<section class="card card--tight"><p class="eyebrow">Typische Fehler</p>
          <ul class="pv-bullets pv-bullets--no text-sm">${ex.mistakes.map((c) => html`<li>${c}</li>`)}</ul></section>` : ''}
      </div>` : ''}

      <section class="card">
        <div class="card__header"><h2 class="card__title">Stufen</h2>
          <span class="card__sub">Tippe eine Stufe, um zu wechseln</span></div>
        <ol class="pv-ladder">
          ${ex.levels.map((l, i) => html`<li>
            <button class="pv-ladder__item ${i === li ? 'is-current' : i < li ? 'is-done' : ''}" style="width:100%;text-align:left" data-level="${i}" ${i === li ? 'aria-current="true"' : ''}>
              <span class="pv-ladder__num">${i < li ? '✓' : i + 1}</span>
              <span class="pv-ladder__body">
                <span class="pv-ladder__label">${l.label}</span>
                <span class="pv-ladder__dose">${sameText(l.label, doseText(ex, l)) ? '' : html`<span>${doseText(ex, l)}</span>`}${l.tempo ? html`<span>Tempo ${l.tempo}</span>` : ''}${l.band ? bandChip(settings, l.band) : ''}</span>
              </span>
              ${i === li ? html`<span class="chip chip--primary chip--sm">aktuell</span>` : ''}
            </button></li>`)}
        </ol>
        <div class="btn-row mt-4">
          <button class="btn btn--outline btn--sm" data-step="-1" ${li === 0 ? 'disabled' : ''}>${raw(ICON.down)} Leichter</button>
          <button class="btn btn--soft btn--sm" data-step="1" ${li >= ex.levels.length - 1 ? 'disabled' : ''}>${raw(ICON.up)} Schwerer</button>
        </div>
      </section>

      ${regress || progress ? html`<h2 class="section-title">Verwandte Übungen</h2>
        <div class="pv-link-cards mb-4">
          ${regress ? html`<a class="pv-link-card" ${progress ? '' : 'style="grid-column:1/-1"'} href="#/uebung/${regress.id}"><span class="pv-link-card__k">${raw(ICON.down)} Leichter</span><span class="pv-link-card__n">${regress.name}</span></a>` : ''}
          ${progress ? html`<a class="pv-link-card" ${regress ? '' : 'style="grid-column:1/-1"'} href="#/uebung/${progress.id}"><span class="pv-link-card__k">${raw(ICON.up)} Nächster Schritt</span><span class="pv-link-card__n">${progress.name}</span></a>` : ''}
        </div>` : ''}

      <section class="card">
        <div class="card__header"><div><h2 class="card__title">Dein Verlauf</h2>
          <p class="card__sub">${hist.length ? `${hist.length}× trainiert · ${metricName}: ${best} ${unit}` : 'Noch nicht trainiert'}</p></div>
          ${hist.length ? html`<span class="chip chip--gold num">★ Rekord ${best} ${unit}</span>` : ''}</div>
        ${hist.length >= 2 ? html`<div data-chart></div><div class="chart-legend"><span><i style="--c:var(--primary)"></i>${metricName}</span></div>` : ''}
        ${hist.length ? html`<ul class="pv-ex-sum mt-2">
          ${hist.slice(-5).reverse().map((h) => html`<li>
            <span class="pv-ex-sum__name">${shortDate(h.date)} · Stufe ${h.level + 1}</span>
            <span class="pv-ex-sum__val">${h.sets} Sätze${ex.type === 'hold' ? ` · ${h.hold} s` : ex.type === 'timed' ? ` · ${h.seconds} s` : ` · ${h.reps} Wdh.`}</span>
            ${h.painDuring != null ? html`<span class="chip chip--sm ${h.painDuring <= 2 ? 'chip--green' : ''}">Schmerz ${h.painDuring}</span>` : h.rpe != null ? html`<span class="chip chip--sm">RPE ${h.rpe}</span>` : ''}
          </li>`)}
        </ul>` : html`<p class="pv-empty-sm">Sobald du die Übung im Training machst, siehst du hier deine Entwicklung. 📈</p>`}
      </section>

      ${usedIn.length ? html`<p class="text-sm muted">Enthalten in: ${usedIn.map((w) => content.phases.find((p) => p.id === w.phaseId)?.name.split('–')[0].trim() + ' ' + w.name.split('–')[0].trim()).join(' · ')}</p>` : ''}
    `);

    const chartEl = root.querySelector('[data-chart]');
    if (chartEl) {
      lineChart(chartEl, { series: [{ name: metricName, color: 'var(--primary)', points: hist.map((h) => ({ x: h.date, y: h.value })) }], yMax: niceMax(best) }, { label: `${metricName} über die Zeit`, bands: false, mean: false });
    }
  };

  const setLevel = async (to) => {
    const cur = levelOf(store.getState(), ex.id, ex);
    if (to === cur || to < 0 || to >= ex.levels.length) return;
    const harder = to > cur;
    const ok = await confirmDialog({
      title: `${harder ? 'Steigern' : 'Zurückgehen'} auf Stufe ${to + 1}?`,
      text: `${ex.levels[to].label}. ${harder ? 'Nur steigern, wenn die aktuelle Stufe sicher grün war.' : 'Ein Schritt zurück ist klug, wenn das Knie gereizt ist.'} Du kannst jederzeit wechseln.`,
      confirm: harder ? 'Steigern' : 'Zurückgehen', icon: harder ? '⬆️' : '⬇️',
    });
    if (!ok) return;
    store.update((d) => { d.state.exerciseLevels = { ...(d.state.exerciseLevels || {}), [ex.id]: to }; });
    toast(`Stufe ${to + 1} gesetzt`, { icon: harder ? '⬆️' : '⬇️' });
  };

  const onClick = (e) => {
    const lv = e.target.closest('[data-level]');
    if (lv) { setLevel(Number(lv.dataset.level)); return; }
    const st = e.target.closest('[data-step]');
    if (st) setLevel(levelOf(store.getState(), ex.id, ex) + Number(st.dataset.step));
  };

  draw();
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(draw);
  return () => { unsub(); root.removeEventListener('click', onClick); };
}
