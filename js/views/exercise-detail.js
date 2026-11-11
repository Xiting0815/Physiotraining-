// Übung (detail) – see docs/SPEC.md §3.5.
import { html, raw, render as paint } from '../render.js';
import { levelOf } from '../logic/progression.js';
import { equipmentNeeds, missingEquipment, upgradeRules, fallbackRules } from '../logic/equipment.js';
import { dayOf } from '../logic/stats.js';
import { shoulderProtect, isShoulderExercise, SHOULDER_NOTE, DRAW_NOTE } from '../logic/shoulder.js';
import { shortFor, stepsFor, feelFor, setupFor } from '../logic/exercise-text.js';
import { lineChart } from '../components/charts.js';
import { rowingPhases, INTENSITY_LABELS } from '../logic/cardio.js';
import {
  ICON, SIDE_LABEL, ensureViewStyles, applyFontScale, pageHeader, doseText, bandChip,
  bandInfo, workoutItems, shortDate, confirmDialog, toast,
  safeData, fmtDuration
} from './ui.js';
import { ensureV2Styles, availability, availabilityChip, blockLabel, equipLabel, fmtClock } from './v2-shared.js';

/**
 * Rowing level preview: timer phases (from cardio.rowingPhases) + totals.
 * @returns {{phases: {label: string, seconds: number, intensity: string, kind: string}[], totalSec: number, workSec: number}}
 */
export function rowingLevelPreview(ex, levelIndex, content) {
  const phases = rowingPhases({ exercises: [{ exerciseId: ex.id, level: levelIndex }] }, content);
  return {
    phases: phases.map((p) => ({ label: p.label, seconds: p.seconds, intensity: p.intensity, kind: p.kind })),
    totalSec: phases.reduce((a, p) => a + p.seconds, 0),
    workSec: phases.filter((p) => p.kind === 'work').reduce((a, p) => a + p.seconds, 0),
  };
}

/** Human description of a rowing level, e.g. „6 × 1:00 zügig, dazwischen 1:00 locker rudern“. */
export function rowingLevelText(ex, lvl) {
  if (!lvl) return '';
  const it = INTENSITY_LABELS[lvl.intensity] ?? '';
  if (Array.isArray(lvl.phases) && lvl.phases.length) return lvl.phases.map((p) => `${p.label} (${fmtClock(p.seconds)})`).join(' → ');
  if ((lvl.sets ?? 1) > 1) {
    const rest = lvl.rest ? `, dazwischen ${fmtClock(lvl.rest)} ${lvl.restActive ? 'locker rudern' : 'Pause'}` : '';
    return `${lvl.sets} × ${fmtClock(lvl.seconds)} ${it}${rest}`;
  }
  return `${fmtDuration(lvl.seconds)} ${it} am Stück`.replace(/\s+/g, ' ').trim();
}

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
  ensureV2Styles();
  const ex = content.exercises.find((e) => e.id === params.id);
  const back = query.from === 'plan' ? '#/plan' : query.from === 'verlauf' ? '#/verlauf' : '#/uebungen';
  if (!ex) {
    paint(root, html`${pageHeader({ title: 'Übung nicht gefunden', back })}
      <section class="card"><div class="empty"><h3 class="empty__title">Diese Übung gibt es nicht (mehr).</h3>
      <a class="btn btn--primary" href="#/uebungen">Zur Übersicht</a></div></section>`);
    return undefined;
  }
  document.title = `${ex.name} · Physio`;
  // v5: a sling variant counts as „enthalten“ where its base exercise is planned (it replaces it when owned)
  const baseIds = new Set([ex.id, ...[...upgradeRules(content.exercises)].filter(([, rules]) => rules.some((r) => r.exerciseId === ex.id)).map(([from]) => from)]);
  const usedIn = content.workouts.filter((w) => workoutItems(w).some((it) => baseIds.has(it.exerciseId)) && (ex.postOpAllowed !== false || content.phases.find((p) => p.id === w.phaseId)?.kind !== 'postop' || baseIds.size === 1));
  const exById = (id) => content.exercises.find((e) => e.id === id);
  const blockCls = ex.block === 'archery' || ex.block === 'cardio' ? 'archery' : ex.block === 'knee' ? 'knee' : '';
  const cardio = ex.block === 'cardio';

  const draw = () => {
    const data = safeData(store.get());
    applyFontScale(data.settings);
    const { settings, state } = data;
    const li = levelOf(state, ex.id, ex);
    const lvl = ex.levels[li];
    const hist = exerciseHistory(data.sessions, ex).map((h) => (ex.block === 'cardio' ? { ...h, value: Math.round(h.seconds / 60) } : h));
    const best = hist.reduce((a, h) => Math.max(a, h.value), 0);
    const unit = ex.block === 'cardio' ? 'min' : ex.type === 'hold' ? 's' : ex.type === 'timed' ? 's' : 'Wdh.';
    const metricName = ex.block === 'cardio' ? 'Minuten gerudert' : ex.type === 'hold' ? 'Längster Hold' : ex.type === 'timed' ? 'Sekunden gesamt' : 'Wiederholungen gesamt';
    const regress = ex.regressTo ? exById(ex.regressTo) : null;
    const progress = ex.progressTo ? exById(ex.progressTo) : null;
    const band = bandInfo(settings, lvl.band);
    const av = availability(ex, state, content.phases);
    const toggle = state.exerciseToggles?.[ex.id];
    const curPhase = content.phases.find((p) => p.id === state.phaseId);
    const postop = curPhase?.kind === 'postop';
    const rp = cardio ? rowingLevelPreview(ex, li, content) : null;
    // v5 (SPEC §16): what the exercise needs vs. „Meine Ausrüstung“, fallback / upgrade variants
    const needs = equipmentNeeds(ex, settings);
    const missing = missingEquipment(ex, settings);
    const fbId = ex.fallback || fallbackRules(content.exercises).get(ex.id);
    const fallback = fbId ? exById(fbId) : null;
    const setupList = setupFor(ex, settings);
    const variants = (upgradeRules(content.exercises).get(ex.id) || []).map((r) => ({ ex: exById(r.exerciseId), owned: missingEquipment(exById(r.exerciseId), settings).length === 0 })).filter((v) => v.ex);

    paint(root, html`
      ${pageHeader({ title: ex.name, eyebrow: `${blockLabel(ex.block)} · ${ex.category ?? ''}`, back })}

      <div class="pv-figure-stage">
        <pt-figure exercise-id="${ex.id}" level="${li}" ${lvl.tempo ? html`tempo="${lvl.tempo}"` : ''} aria-label="Animation: ${ex.name}"></pt-figure>
        <div class="chip-row">
          <span class="chip chip--sm ${blockCls ? `chip--${blockCls}` : ''}">${blockLabel(ex.block)}</span>
          ${ex.side && ex.side !== 'both' ? html`<span class="chip chip--sm">${SIDE_LABEL[ex.side] ?? ex.side}</span>` : ''}
          ${availabilityChip(av)}
        </div>
      </div>

      ${shortFor(ex) ? html`<p class="text-lg" data-short>${shortFor(ex)}</p>` : ''}

      <section class="card" data-howto>
        <h2 class="card__title mb-4">So geht's</h2>
        ${setupList.length ? html`<p class="eyebrow mb-2">Ausgangsposition</p>
        <ul class="pv-bullets text-sm mb-4" data-setup>${setupList.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
        <p class="eyebrow mb-2">Ablauf</p>
        <ol class="steps" data-steps>${stepsFor(ex).map((x) => html`<li>${x}</li>`)}</ol>
        ${feelFor(ex) ? html`<p class="mt-4 mb-0" data-feel>🎯 ${feelFor(ex)}</p>` : ''}
        ${ex.description && ex.description !== shortFor(ex) ? html`<p class="text-sm muted mt-4 mb-0">${ex.description}</p>` : ''}
      </section>

      <section class="card">
        <div class="card__header">
          <div><p class="eyebrow">Deine aktuelle Dosis</p><h2 class="card__title">Stufe <span class="num">${li + 1}</span> von <span class="num">${ex.levels.length}</span></h2></div>
          ${band ? bandChip(settings, lvl.band, { sm: false }) : ''}
        </div>
        ${cardio ? html`<div class="dose">
          <div class="dose__item"><span class="dose__value">${Math.round(rp.totalSec / 60)}<small>min</small></span><span class="dose__label">Dauer</span></div>
          ${lvl.targetSpm ? html`<div class="dose__item"><span class="dose__value">${lvl.targetSpm[0]}–${lvl.targetSpm[1]}</span><span class="dose__label">Schläge/Min</span></div>` : ''}
          ${lvl.targetRpe ? html`<div class="dose__item"><span class="dose__value">${lvl.targetRpe[0]}–${lvl.targetRpe[1]}</span><span class="dose__label">RPE</span></div>` : ''}
        </div>
        <p class="text-sm mt-0">${rowingLevelText(ex, lvl)}</p>
        ${rowPhasesBar(rp)}` : html`<div class="dose">
          <div class="dose__item"><span class="dose__value">${lvl.sets}</span><span class="dose__label">Sätze</span></div>
          ${lvl.reps != null ? html`<div class="dose__item"><span class="dose__value">${lvl.reps}</span><span class="dose__label">Wdh.${ex.side === 'perSide' ? ' / Seite' : ''}</span></div>` : ''}
          ${lvl.hold ? html`<div class="dose__item"><span class="dose__value">${lvl.hold}<small>s</small></span><span class="dose__label">Halten</span></div>` : ''}
          ${lvl.seconds ? html`<div class="dose__item"><span class="dose__value">${lvl.seconds}<small>s</small></span><span class="dose__label">Dauer</span></div>` : ''}
          <div class="dose__item"><span class="dose__value">${Number.isFinite(settings.restDefault) && lvl.rest !== 0 ? settings.restDefault : (lvl.rest ?? 0)}<small>s</small></span><span class="dose__label">Pause</span></div>
        </div>`}
        <div class="chip-row">
          ${lvl.tempo ? html`<span class="chip chip--outline chip--sm">Tempo ${lvl.tempo}</span>` : ''}
          ${cardio && lvl.intensity ? html`<span class="chip chip--sm chip--archery">Intensität: ${INTENSITY_LABELS[lvl.intensity] ?? lvl.intensity}</span>` : ''}
        </div>
      </section>

      ${needs.length ? html`<section class="card card--tight pv-needs" aria-label="Benötigte Ausrüstung">
        <p class="eyebrow mb-2">Benötigt</p>
        <div class="chip-row">${needs.map((n) => html`<span class="chip chip--sm ${n.owned ? (n.optional ? 'chip--green' : '') : n.optional ? 'chip--outline' : 'chip--outline pv-need--missing'}" title="${n.owned ? 'vorhanden' : n.optional ? 'optional' : 'fehlt'}">${n.icon} ${n.label}${n.owned ? (n.base ? '' : ' ✓') : n.optional ? ' (optional)' : ' – fehlt'}</span>`)}</div>
        ${missing.length ? html`<p class="text-sm mt-2 mb-0">${fallback ? html`Ohne ${missing.map(equipLabel).join(', ')} trainierst du im Plan stattdessen <a href="#/uebung/${encodeURIComponent(fallback.id)}">${fallback.name}</a>. ` : 'Ohne diese Ausrüstung wird die Übung im Plan übersprungen. '}<a href="#/ausruestung">In Meine Ausrüstung abhaken</a></p>` : ''}
        ${variants.length ? html`<p class="text-sm mt-2 mb-0">Mit ${variants.map((v) => html`<a href="#/uebung/${encodeURIComponent(v.ex.id)}">${v.ex.name}</a>`)} gibt es eine ${variants.some((v) => v.owned) ? 'Variante, die dein Plan bereits nutzt' : html`Variante – <a href="#/ausruestung">Ausrüstung abhaken</a>`}.</p>` : ''}
      </section>` : ''}

      ${ex.kneeNote ? html`<div class="pv-callout pv-callout--knee"><span class="pv-callout__icon" aria-hidden="true">🦵</span>
        <div><p class="strong">Hinweis fürs Knie</p><p>${ex.kneeNote}</p></div></div>` : ''}

      ${shoulderProtect(settings) && (isShoulderExercise(ex) || ex.archeryDraw) ? html`<div class="pv-callout" data-shoulder-note><span class="pv-callout__icon" aria-hidden="true">🛡️</span>
        <div><p class="strong">Hinweis für die Schulter</p><p>${ex.archeryDraw ? DRAW_NOTE : SHOULDER_NOTE}</p></div></div>` : ''}

      ${ex.postOpNote ? html`<div class="pv-callout ${postop ? 'pv-callout--warn' : ''}"><span class="pv-callout__icon" aria-hidden="true">🩼</span>
        <div><p class="strong">Nach der OP</p><p>${ex.postOpNote}</p></div></div>` : ''}
      ${ex.postOpAllowed === false ? html`<div class="pv-callout ${postop && av.kind === 'blocked' ? 'pv-callout--stop' : 'pv-callout--warn'}"><span class="pv-callout__icon" aria-hidden="true">${av.kind === 'enabled' ? '✅' : '⛔'}</span>
        <div><p class="strong">${av.kind === 'enabled' ? 'Nach der OP für dich freigegeben' : postop ? 'In der Entlastungsphase gesperrt' : 'Nach der OP pausiert'}</p>
        <p class="text-sm">${cardio ? 'Rudern ist in den 6 Wochen ohne Belastung (Krücken) nicht vorgesehen. Bis zum OP-Tag darfst du rudern – die Ampel gilt.' : av.kind === 'enabled' ? 'Du hast die Übung freigegeben – nur so, wie dein Team es erlaubt.' : 'In der Entlastungsphase nach der OP wird die Übung übersprungen – außer dein Arzt/Physio erlaubt sie ausdrücklich.'}</p></div></div>` : ''}

      ${(ex.cues || []).length || (ex.mistakes || []).length ? html`<div class="grid-2 mb-4">
        ${(ex.cues || []).length ? html`<section class="card card--tight"><p class="eyebrow">Darauf achten</p>
          <ul class="pv-bullets pv-bullets--ok text-sm">${ex.cues.map((c) => html`<li>${c}</li>`)}</ul></section>` : ''}
        ${(ex.mistakes || []).length ? html`<section class="card card--tight"><p class="eyebrow">Typische Fehler</p>
          <ul class="pv-bullets pv-bullets--no text-sm">${ex.mistakes.map((c) => html`<li>${c}</li>`)}</ul></section>` : ''}
      </div>` : ''}

      <section class="card">
        <div class="card__header"><h2 class="card__title">Stufen</h2>
          <span class="card__sub">Tippe eine Stufe, um zu wechseln</span></div>
        ${cardio ? html`<ol class="v2-rowlevels">${ex.levels.map((l, i) => {
          const pv = rowingLevelPreview(ex, i, content);
          return html`<li><button class="v2-rowlevel ${i === li ? 'is-current' : ''}" style="width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer" data-level="${i}" ${i === li ? 'aria-current="true"' : ''}>
            <span class="v2-rowlevel__head"><strong>Stufe ${i + 1}: ${l.label}</strong>${i === li ? html`<span class="chip chip--accent chip--sm">aktuell</span>` : ''}</span>
            ${rowPhasesBar(pv)}
            <span class="v2-rowlevel__meta"><span>⏱ ${fmtDuration(pv.totalSec)}</span>${l.intensity ? html`<span>${INTENSITY_LABELS[l.intensity] ?? ''}</span>` : ''}${l.targetSpm ? html`<span>SPM ${l.targetSpm[0]}–${l.targetSpm[1]}</span>` : ''}${l.targetRpe ? html`<span>RPE ${l.targetRpe[0]}–${l.targetRpe[1]}</span>` : ''}</span>
          </button></li>`;
        })}</ol>` : html`<ol class="pv-ladder">
          ${ex.levels.map((l, i) => html`<li>
            <button class="pv-ladder__item ${i === li ? 'is-current' : i < li ? 'is-done' : ''}" style="width:100%;text-align:left" data-level="${i}" ${i === li ? 'aria-current="true"' : ''}>
              <span class="pv-ladder__num">${i < li ? '✓' : i + 1}</span>
              <span class="pv-ladder__body">
                <span class="pv-ladder__label">${l.label}</span>
                <span class="pv-ladder__dose">${sameText(l.label, doseText(ex, l)) ? '' : html`<span>${doseText(ex, l)}</span>`}${l.tempo ? html`<span>Tempo ${l.tempo}</span>` : ''}${l.band ? bandChip(settings, l.band) : ''}</span>
              </span>
              ${i === li ? html`<span class="chip chip--primary chip--sm">aktuell</span>` : ''}
            </button></li>`)}
        </ol>`}
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

      <section class="card">
        <h2 class="card__title">Für mich</h2>
        <label class="switch-row"><span>In meinen Trainings verwenden<span class="pv-setting-row__hint" style="display:block;font-size:var(--fs-xs);color:var(--muted)">${toggle === false ? 'Deaktiviert – wird in allen Phasen übersprungen.' : 'Aktiv – erscheint, wenn sie im Plan vorkommt.'}</span></span>
          <input type="checkbox" class="switch" data-toggle="active" ${toggle === false ? '' : 'checked'}></label>
        ${ex.postOpAllowed === false && !cardio ? html`<label class="switch-row"><span>Nach der OP freigegeben<span style="display:block;font-size:var(--fs-xs);color:var(--muted)">Nur wenn dein Arzt/Physio es ausdrücklich erlaubt.</span></span>
          <input type="checkbox" class="switch" data-toggle="postop" ${toggle === true ? 'checked' : ''} ${toggle === false ? 'disabled' : ''}></label>` : ''}
      </section>

      ${usedIn.length ? html`<p class="text-sm muted">Enthalten in: ${usedIn.map((w) => content.phases.find((p) => p.id === w.phaseId)?.name.split('–')[0].trim() + ' ' + w.name.split('–')[0].trim()).join(' · ')}</p>` : ''}
    `);

    const chartEl = root.querySelector('[data-chart]');
    if (chartEl) {
      lineChart(chartEl, { series: [{ name: metricName, color: 'var(--primary)', points: hist.map((h) => ({ x: h.date, y: h.value })) }], yMax: niceMax(best) }, { label: `${metricName} über die Zeit`, bands: false, mean: false });
    }
  };

  const setLevel = async (to) => {
    const cur = levelOf(safeData(store.get()).state, ex.id, ex);
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
    if (st) setLevel(levelOf(safeData(store.get()).state, ex.id, ex) + Number(st.dataset.step));
  };

  const setToggle = (val) => store.update((d) => {
    const t = { ...(d.state.exerciseToggles || {}) };
    if (val === undefined) delete t[ex.id]; else t[ex.id] = val;
    d.state.exerciseToggles = t;
  });
  const onChange = async (e) => {
    const sw = e.target.closest('[data-toggle]');
    if (!sw) return;
    if (sw.dataset.toggle === 'active') {
      setToggle(sw.checked ? undefined : false);
      toast(sw.checked ? `${ex.name} ist wieder aktiv` : `${ex.name} deaktiviert`, { icon: sw.checked ? '✓' : '⏸️' });
      return;
    }
    if (sw.checked) {
      sw.checked = false;
      const ok = await confirmDialog({ title: 'Nach der OP freigeben?', text: 'Nur, wenn dein Team (Arzt/Physio) die Übung in der Entlastungsphase ausdrücklich erlaubt. Deren Protokoll hat immer Vorrang.', confirm: 'Ja, ist erlaubt', icon: '🩼' });
      if (!ok) return;
      setToggle(true);
      toast('Für die Zeit nach der OP freigegeben', { icon: '✅' });
    } else {
      setToggle(undefined);
      toast('Freigabe zurückgenommen', { icon: '↩️' });
    }
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  const unsub = store.subscribe(draw);
  return () => { unsub(); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
}

function rowPhasesBar(pv) {
  if (!pv?.phases?.length) return '';
  return html`<span class="v2-phases" role="img" aria-label="Ablauf: ${pv.phases.map((p) => `${p.label} ${fmtClock(p.seconds)}`).join(', ')}">${pv.phases.map((p) => html`<span class="is-${p.intensity}" style="flex:${p.seconds}" title="${p.label} · ${fmtClock(p.seconds)}">${pv.phases.length <= 8 && p.seconds >= 60 ? fmtClock(p.seconds) : ''}</span>`)}</span>`;
}
