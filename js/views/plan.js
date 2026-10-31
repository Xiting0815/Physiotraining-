// Plan – see docs/SPEC.md §3.4, §5.3.
import { html, raw, render as paint } from '../render.js';
import { todayISO } from '../util/date.js';
import { phaseProgress, nextWorkout, levelOf } from '../logic/progression.js';
import {
  ICON, BLOCK_LONG, ensureViewStyles, applyFontScale, pageHeader, doseText, bandChip, workoutItems,
  workoutSplit, workoutLetter, confirmDialog, toast,
} from './ui.js';
import { confetti } from '../components/celebrate.js';

export const title = 'Plan';

/**
 * Switch the current phase (pure on a data draft): sets phaseId, resets rotation to A, records
 * phaseHistory. Returns the draft.
 * @param {any} d data draft  @param {any} phase target phase
 */
export function switchPhase(d, phase, today = todayISO()) {
  d.state.phaseId = phase.id;
  d.state.nextWorkoutId = phase.workouts?.A ?? d.state.nextWorkoutId;
  d.state.phaseHistory = [...(d.state.phaseHistory || []), { phaseId: phase.id, startedAt: today }];
  return d;
}

/** Toggle exit criterion index for a phase (pure on a draft). */
export function toggleCriterion(d, phaseId, index) {
  const cur = new Set(d.state.exitCriteriaDone?.[phaseId] || []);
  if (cur.has(index)) cur.delete(index); else cur.add(index);
  d.state.exitCriteriaDone = { ...(d.state.exitCriteriaDone || {}), [phaseId]: [...cur].sort((a, b) => a - b) };
  return d;
}

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content }) {
  ensureViewStyles();
  const open = new Set();
  let firstDraw = true;

  const draw = () => {
    const data = store.get();
    applyFontScale(data.settings);
    const { state, settings, sessions } = data;
    const today = todayISO();
    const phases = content.phases;
    const phase = phases.find((p) => p.id === state.phaseId) ?? phases[0];
    if (!phase) { paint(root, html`${pageHeader({ title: 'Plan' })}<p class="placeholder">Keine Phasen geladen.</p>`); return; }
    const pIdx = phases.indexOf(phase);
    const nextPhase = phases[pIdx + 1];
    const prog = phaseProgress(state, phase, sessions, { today, settings, surgeryDate: settings.surgeryDate });
    const metCount = prog.criteria.filter((c) => c.ticked || c.met === true).length;
    const nextW = nextWorkout(state, phases, content.workouts);
    if (firstDraw && nextW) open.add(nextW.id);
    firstDraw = false;

    const exRow = (it) => {
      const ex = content.exercises.find((e) => e.id === it.exerciseId);
      if (!ex) return '';
      const li = levelOf(state, ex.id, ex);
      const lvl = ex.levels[li];
      const sec = it.section;
      return html`<a class="pv-ex-row" href="#/uebung/${encodeURIComponent(ex.id)}?from=plan">
        <span class="pv-sec-dot ${sec === 'knee' ? 'is-knee' : sec === 'archery' ? 'is-archery' : ''}" aria-hidden="true"></span>
        <span class="pv-ex-row__body">
          <span class="pv-ex-row__name">${ex.name}</span>
          <span class="pv-ex-row__meta"><span class="num">${doseText(ex, lvl)}</span>${ex.levels.length > 1 ? html`<span class="chip chip--sm ${sec === 'archery' ? 'chip--archery' : 'chip--knee'}">Stufe <span class="num">${li + 1}/${ex.levels.length}</span></span>` : ''}${lvl.band ? bandChip(settings, lvl.band) : ''}</span>
          ${it.note ? html`<span class="pv-ex-row__meta">${it.note}</span>` : ''}
        </span>
        ${raw(ICON.chev)}
      </a>`;
    };

    const workoutCard = (k) => {
      const w = content.workouts.find((x) => x.id === phase.workouts?.[k]);
      if (!w) return html`<section class="card"><h3 class="card__title">Training ${k}</h3><p class="placeholder">Noch nicht angelegt.</p></section>`;
      const isNext = nextW?.id === w.id;
      const split = workoutSplit(w);
      const items = workoutItems(w);
      const groups = ['warmup', 'knee', 'archery', 'cooldown'].map((sec) => ({ sec, items: items.filter((i) => i.section === sec) })).filter((g) => g.items.length);
      const blockTitle = (sec) => (sec === 'knee' || sec === 'archery') ? (w.blocks.find((b) => b.id === sec)?.title ?? BLOCK_LONG[sec]) : BLOCK_LONG[sec];
      return html`<details class="card pv-workout" data-wid="${w.id}" ${open.has(w.id) ? 'open' : ''}>
        <summary class="pv-workout__head" style="margin:0;list-style:none">
          <span class="pv-letter${isNext ? ' is-next' : ''}">${workoutLetter(w, phases)}</span>
          <span class="grow">
            <span class="list-item__title">${w.name}</span>
            <span class="list-item__sub">ca. ${w.durationMin} Min · ${split.knee} Knie · ${split.archery} Bogen</span>
          </span>
          ${isNext ? html`<span class="chip chip--primary chip--sm">Als Nächstes</span>` : ''}
          <span class="disclosure-arrow" aria-hidden="true">${raw(ICON.down)}</span>
        </summary>
        <div class="mt-4">
          ${groups.map((g) => html`<p class="pv-sec-label ${g.sec === 'knee' ? 'is-knee' : g.sec === 'archery' ? 'is-archery' : ''}">${blockTitle(g.sec)} <span class="num">· ${g.items.length}</span></p>
            ${g.items.map(exRow)}`)}
          <div class="btn-row mt-4">
            ${isNext ? '' : html`<button class="btn btn--outline btn--sm" data-pick="${w.id}">Als nächstes setzen</button>`}
            <a class="btn btn--primary btn--sm" href="#/session?workout=${encodeURIComponent(w.id)}">${raw(ICON.play)} Jetzt starten</a>
          </div>
        </div>
      </details>`;
    };

    paint(root, html`
      ${pageHeader({ title: 'Plan', eyebrow: `Phase ${pIdx + 1} von ${phases.length}` })}

      <section class="card card--hero">
        <p class="hero__eyebrow">Aktuelle Phase</p>
        <h2 class="hero__title">${phase.name}</h2>
        <div class="pv-phase-steps" aria-hidden="true">${phases.map((p, i) => html`<span class="${i < pIdx ? 'is-done' : i === pIdx ? 'is-current' : ''}"></span>`)}</div>
        <p class="muted">${phase.description}</p>
        <p class="hero__meta mb-0">
          <span>${raw(ICON.target)}<span class="num">${prog.sessionsInPhase}</span>&nbsp;Einheiten</span>
          <span>${raw(ICON.calendar)}<span class="num">${prog.weeksInPhase ?? 0}</span>&nbsp;Wochen aktiv</span>
          ${prog.sessionsInPhase ? html`<span>✓ <span class="num">${Math.round(prog.greenRatio * 100)} %</span>&nbsp;grün</span>` : ''}
        </p>
      </section>

      <section class="card" aria-labelledby="crit-title">
        <div class="card__header">
          <div><h2 class="card__title" id="crit-title">Ausstiegskriterien</h2>
          <p class="card__sub">Hake ab, was du sicher schaffst. Grüne Häkchen erkennt die App aus deinen Daten.</p></div>
          <span class="chip chip--primary num">${metCount}/${prog.criteriaTotal}</span>
        </div>
        <div class="pv-progress mb-4" style="--p:${prog.criteriaTotal ? metCount / prog.criteriaTotal : 0}"><span></span></div>
        <ul class="pv-criteria">
          ${prog.criteria.map((c) => {
            const auto = c.met === true && !c.ticked;
            return html`<li><label class="pv-crit${c.ticked ? ' is-ticked' : ''}${auto ? ' is-auto' : ''}">
              <input type="checkbox" data-crit="${c.index}" ${c.ticked || auto ? 'checked' : ''}>
              <span class="pv-crit__box">${raw(ICON.check)}</span>
              <span class="pv-crit__text"><span class="pv-crit__main">${c.text}</span>
                ${c.hint || auto ? html`<span class="pv-crit__hint">${auto ? '✓ Aus deinen Daten erfüllt · ' : c.met === false ? 'Noch nicht erfüllt · ' : ''}${c.hint}</span>` : ''}
              </span>
            </label></li>`;
          })}
        </ul>
        ${nextPhase ? (prog.suggestReady
          ? html`<button class="btn btn--gold btn--block btn--lg mt-4" data-advance>🏅 Bereit für nächste Phase</button>
              <p class="field__hint center mt-2">Du entscheidest – am besten nach Rücksprache mit deiner Physio.</p>`
          : html`<p class="field__hint mt-4">Wenn alle Kriterien erfüllt sind, kannst du hier in „${nextPhase.name}“ wechseln.</p>`)
          : html`<p class="field__hint mt-4">Das ist die letzte Phase vor der OP. 🎯</p>`}
      </section>

      <h2 class="section-title">Trainings dieser Phase</h2>
      ${['A', 'B', 'C'].map(workoutCard)}

      <h2 class="section-title">Alle Phasen</h2>
      <ul class="list list--card">
        ${phases.map((p, i) => html`<li><div class="list-item">
          <span class="list-item__icon ${i === pIdx ? '' : 'list-item__icon--neutral'}">${i < pIdx ? '✓' : i + 1}</span>
          <span class="list-item__body"><span class="list-item__title">${p.name}</span>
            <span class="list-item__sub">${i === pIdx ? 'Aktuelle Phase' : i < pIdx ? 'Abgeschlossen' : 'Kommt noch'} · ${p.exitCriteria?.length ?? 0} Kriterien</span></span>
          ${i === pIdx ? html`<span class="chip chip--primary chip--sm">aktiv</span>` : html`<button class="btn btn--outline btn--sm" data-phase="${p.id}">${i < pIdx ? 'Zurück' : 'Wechseln'}</button>`}
        </div></li>`)}
      </ul>
    `);
  };

  const onClick = async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const id = pick.dataset.pick;
      store.update((d) => { d.state.nextWorkoutId = id; });
      toast(`${content.workouts.find((w) => w.id === id)?.name ?? 'Training'} ist jetzt als Nächstes dran`);
      return;
    }
    if (e.target.closest('[data-advance]')) {
      const data = store.get();
      const phases = content.phases;
      const cur = phases.findIndex((p) => p.id === data.state.phaseId);
      const next = phases[cur + 1];
      if (!next) return;
      const ok = await confirmDialog({ title: `${next.name} starten?`, text: 'Neue Übungen und Dosierungen. Deine bisherigen Stufen bleiben erhalten. Du kannst jederzeit zurückwechseln.', confirm: 'Nächste Phase starten', cancel: 'Noch nicht', icon: '🏅' });
      if (!ok) return;
      store.update((d) => switchPhase(d, next));
      confetti();
      toast(`Willkommen in ${next.name}!`, { kind: 'gold', icon: '🏅' });
      return;
    }
    const ph = e.target.closest('[data-phase]');
    if (ph) {
      const target = content.phases.find((p) => p.id === ph.dataset.phase);
      const data = store.get();
      const curOrder = content.phases.find((p) => p.id === data.state.phaseId)?.order ?? 0;
      const back = target.order < curOrder;
      const ok = await confirmDialog({
        title: `Zu „${target.name}“ wechseln?`,
        text: back ? 'Ein Schritt zurück ist völlig okay – zum Beispiel nach einer Reizung. Die Rotation startet wieder bei Training A.' : 'Die Ausstiegskriterien der aktuellen Phase sind noch nicht alle erfüllt. Wechsle nur nach Rücksprache.',
        confirm: 'Wechseln', icon: back ? '↩︎' : '⏭️',
      });
      if (!ok) return;
      store.update((d) => switchPhase(d, target));
      toast(`Phase gewechselt: ${target.name}`);
    }
  };

  const onChange = (e) => {
    const cb = e.target.closest('[data-crit]');
    if (!cb) return;
    const data = store.get();
    const phaseId = data.state.phaseId;
    const idx = Number(cb.dataset.crit);
    const ticked = (data.state.exitCriteriaDone?.[phaseId] || []).includes(idx);
    // auto-met criteria: unchecking has no effect unless they were ticked manually
    if (!ticked && !cb.checked) { cb.checked = true; toast('Dieses Kriterium ist laut deinen Daten bereits erfüllt.', { icon: 'ℹ️' }); return; }
    store.update((d) => toggleCriterion(d, phaseId, idx));
  };

  const onToggle = (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.wid) return;
    if (d.open) open.add(d.dataset.wid); else open.delete(d.dataset.wid);
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('toggle', onToggle, true);
  const unsub = store.subscribe(draw);
  return () => {
    unsub();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('toggle', onToggle, true);
  };
}
