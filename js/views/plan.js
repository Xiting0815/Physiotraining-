// Plan – see docs/SPEC.md §3.4, §5.3, §12.9, §12.10, §12.12.
import { html, raw, render as paint } from '../render.js';
import { todayISO, formatDE } from '../util/date.js';
import { phaseProgress, nextWorkout, levelOf, phaseWorkouts, exerciseAvailable } from '../logic/progression.js';
import { estimateWorkoutMinutes } from '../logic/duration.js';
import { cardioMainLabel } from '../logic/cardio.js';
import { duplicateAsCustom } from '../logic/custom-workouts.js';
import { evaluateBadges, XP } from '../logic/motivation.js';
import { phaseSchedule, scheduleHint, canEnterPhase, postOpStatus } from '../logic/schedule.js';
import {
  ICON, BLOCK_LONG, ensureViewStyles, applyFontScale, pageHeader, doseText, bandChip, workoutItems,
  workoutSplit, workoutLetter, confirmDialog, toast, KIND_ICON, awardBadges, shortDate,
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

/**
 * New `exerciseToggles` after switching an exercise on/off (pure).
 * Allowed exercises: off → `false`, on → key removed. Exercises with `postOpAllowed: false`: on → `true`
 * (explicitly enabled for the post-op phase), off → key removed (blocked again by default).
 * @param {Record<string, boolean>} toggles @param {{id: string, postOpAllowed?: boolean}} ex @param {boolean} on
 */
export function setToggle(toggles, ex, on) {
  const next = { ...(toggles || {}) };
  if (ex.postOpAllowed === false) { if (on) next[ex.id] = true; else delete next[ex.id]; }
  else if (on) delete next[ex.id];
  else next[ex.id] = false;
  return next;
}

/** Unique exercise ids of a list of workouts (session order). */
export function exerciseIdsOf(workouts) {
  const out = [];
  for (const w of workouts || []) for (const it of workoutItems(w)) if (!out.includes(it.exerciseId)) out.push(it.exerciseId);
  return out;
}

const fmtRange = (s) => (s?.start && s?.end ? `${shortDate(s.start)} – ${shortDate(s.end)}` : '');

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, navigate }) {
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
    const isPostOp = (phase.kind ?? 'prehab') === 'postop';
    const prog = phaseProgress(state, phase, sessions, { today, settings, surgeryDate: settings.surgeryDate });
    const metCount = prog.criteria.filter((c) => c.ticked || c.met === true).length;
    const nextW = nextWorkout(state, phases, content.workouts);
    if (firstDraw && nextW) open.add(nextW.id);
    firstDraw = false;
    const sched = phaseSchedule(phases, settings.surgeryDate, { prehabStart: settings.prehabStart });
    const schedOf = (id) => sched?.find((x) => x.phaseId === id) ?? null;
    const hint = scheduleHint(phases, settings, state, today);
    const pw = phaseWorkouts(phase, content.workouts);
    const minutes = (w) => estimateWorkoutMinutes(w, content, state, settings);
    const nextGate = nextPhase ? canEnterPhase(nextPhase, settings, state, today) : { ok: true, reasons: [] };
    const post = postOpStatus(settings, state, today);

    const exRow = (it) => {
      const ex = content.exercises.find((e) => e.id === it.exerciseId);
      if (!ex) return '';
      const li = levelOf(state, ex.id, ex);
      const lvl = ex.levels[li];
      const sec = it.section;
      const off = !exerciseAvailable(ex, phase, state);
      return html`<a class="pv-ex-row${off ? ' is-off' : ''}" href="#/uebung/${encodeURIComponent(ex.id)}?from=plan">
        <span class="pv-sec-dot ${sec === 'knee' ? 'is-knee' : sec === 'archery' ? 'is-archery' : ''}" aria-hidden="true"></span>
        <span class="pv-ex-row__body">
          <span class="pv-ex-row__name">${ex.name}</span>
          <span class="pv-ex-row__meta">${off ? html`<span class="chip chip--sm chip--outline">deaktiviert</span>` : ''}<span class="num">${doseText(ex, lvl)}</span>${ex.levels.length > 1 ? html`<span class="chip chip--sm ${sec === 'archery' ? 'chip--archery' : 'chip--knee'}">Stufe <span class="num">${li + 1}/${ex.levels.length}</span></span>` : ''}${lvl.band ? bandChip(settings, lvl.band) : ''}</span>
          ${it.note ? html`<span class="pv-ex-row__meta">${it.note}</span>` : ''}
          ${isPostOp && ex.postOpNote ? html`<span class="pv-ex-row__meta">🪑 ${ex.postOpNote}</span>` : ''}
        </span>
        ${raw(ICON.chev)}
      </a>`;
    };

    /** Workout card (A/B/C, Kurztraining or Rudern). @param {any} w @param {string} badge */
    const workoutCard = (w, badge) => {
      const kind = w.kind ?? 'strength';
      const isNext = nextW?.id === w.id;
      const split = workoutSplit(w);
      const items = workoutItems(w);
      const secs = kind === 'cardio' ? ['warmup', 'cardio', 'cooldown'] : ['warmup', 'knee', 'archery', 'cooldown'];
      const groups = secs.map((sec) => ({ sec, items: items.filter((i) => i.section === sec) })).filter((g) => g.items.length);
      const blockTitle = (sec) => (sec === 'knee' || sec === 'archery' || sec === 'cardio') ? (w.blocks.find((b) => b.id === sec)?.title ?? BLOCK_LONG[sec]) : BLOCK_LONG[sec];
      const lbl = kind === 'cardio' ? cardioMainLabel(w, content, state) : '';
      const sub = kind === 'cardio'
        ? `ca. ${minutes(w)} Min${lbl ? ` · ${lbl}` : ''}`
        : `ca. ${minutes(w)} Min · ${split.knee} Knie · ${split.archery} Bogen`;
      return html`<details class="card pv-workout" data-wid="${w.id}" ${open.has(w.id) ? 'open' : ''}>
        <summary class="pv-workout__head" style="margin:0;list-style:none">
          <span class="pv-letter${isNext ? ' is-next' : ''}" ${kind === 'cardio' ? html`style="background:var(--accent-soft);color:var(--accent-ink)"` : ''}>${badge}</span>
          <span class="grow">
            <span class="list-item__title">${w.name}</span>
            <span class="list-item__sub">${sub}</span>
          </span>
          ${isNext ? html`<span class="chip chip--primary chip--sm">Als Nächstes</span>` : ''}
          <span class="disclosure-arrow" aria-hidden="true">${raw(ICON.down)}</span>
        </summary>
        <div class="mt-4">
          ${w.description ? html`<p class="text-sm muted mt-0">${w.description}</p>` : ''}
          ${groups.map((g) => html`<p class="pv-sec-label ${g.sec === 'knee' ? 'is-knee' : g.sec === 'archery' || g.sec === 'cardio' ? 'is-archery' : ''}">${blockTitle(g.sec)} <span class="num">· ${g.items.length}</span></p>
            ${g.items.map(exRow)}`)}
          <div class="btn-row mt-4" style="flex-wrap:wrap">
            ${kind === 'strength' && !isNext ? html`<button class="btn btn--outline btn--sm" data-pick="${w.id}">Als nächstes setzen</button>` : ''}
            ${kind !== 'cardio' ? html`<button class="btn btn--ghost btn--sm" data-copy="${w.id}">${raw(ICON.copy)} Als eigenes Workout kopieren</button>` : ''}
            <a class="btn ${kind === 'cardio' ? 'btn--accent' : 'btn--primary'} btn--sm" href="#/session?workout=${encodeURIComponent(w.id)}">${raw(ICON.play)} Jetzt starten</a>
          </div>
        </div>
      </details>`;
    };

    /** Exercise toggles for the post-op phase. */
    const togglesCard = () => {
      const ids = exerciseIdsOf([...pw.rotation, pw.short].filter(Boolean));
      const inPlan = ids.map((id) => content.exercises.find((e) => e.id === id)).filter(Boolean);
      const blocked = content.exercises.filter((e) => e.postOpAllowed === false && e.block !== 'cardio' && !ids.includes(e.id));
      const row = (ex) => {
        const on = exerciseAvailable(ex, phase, state);
        return html`<label class="pv-toggle-row${on ? '' : ' is-off'}">
          <span class="pv-toggle-row__body"><span class="pv-toggle-row__name">${ex.name}</span>
          <span class="pv-toggle-row__meta">${ex.postOpAllowed === false ? (on ? 'Von dir freigeschaltet' : 'Nach der OP gesperrt (Belastung des linken Beins)') : on ? 'Für mich freigegeben' : 'Deaktiviert – wird übersprungen'}</span></span>
          <input type="checkbox" class="switch" data-toggle-ex="${ex.id}" ${on ? 'checked' : ''} aria-label="${ex.name} ${on ? 'deaktivieren' : 'freigeben'}">
        </label>`;
      };
      return html`<section class="card" aria-labelledby="tog-title">
        <h2 class="card__title" id="tog-title">Übungen nach deinem Protokoll</h2>
        <p class="card__sub">Jedes OP-Team arbeitet etwas anders – z. B. beim erlaubten Beugewinkel. Schalte aus, was dein Arzt oder deine Physio (noch) nicht möchte. Ausgeschaltete Übungen werden im Training übersprungen.</p>
        <div class="mt-2">${inPlan.map(row)}</div>
        ${blocked.length ? html`<details class="disclosure mt-4 mb-0"><summary>Gesperrte Übungen (${blocked.length})</summary>
          <div><p class="text-sm muted mt-0">Diese Übungen belasten das operierte Bein und sind in der Entlastungsphase standardmäßig aus. Nur einschalten, wenn dein Team es ausdrücklich erlaubt.</p>
          ${blocked.map(row)}</div></details>` : ''}
      </section>`;
    };

    const lockReasons = (reasons) => html`<ul class="pv-reasons">${reasons.map((r) => html`<li>${r}</li>`)}</ul>`;

    /** Collapsible overview of another phase (workouts with minutes, dates, lock state). */
    const phaseItem = (p, i) => {
      const s = schedOf(p.id);
      const pk = (p.kind ?? 'prehab') === 'postop';
      const gate = canEnterPhase(p, settings, state, today);
      const ws = phaseWorkouts(p, content.workouts);
      const isCur = i === pIdx;
      const status = isCur ? 'Aktuelle Phase' : i < pIdx ? 'Abgeschlossen' : pk && !gate.ok ? 'Gesperrt bis nach der OP' : 'Kommt noch';
      const all = [...ws.rotation.map((w) => [w, workoutLetter(w, phases)]), ...(ws.short ? [[ws.short, KIND_ICON.short]] : []), ...ws.cardio.map((w) => [w, KIND_ICON.cardio])];
      return html`<li><details class="pv-phase-item" data-pid="${p.id}" ${open.has(`ph:${p.id}`) ? 'open' : ''}>
        <summary class="list-item" style="list-style:none;cursor:pointer">
          <span class="list-item__icon ${isCur ? '' : 'list-item__icon--neutral'}">${pk && !gate.ok && !isCur ? raw(ICON.lock) : i < pIdx ? '✓' : i + 1}</span>
          <span class="list-item__body"><span class="list-item__title">${p.name}</span>
            <span class="list-item__sub">${status}${s ? html` · <span class="pv-phase-row__dates">${fmtRange(s)}</span>` : p.plannedWeeks ? ` · ca. ${String(p.plannedWeeks).replace('.', ',')} Wochen` : ''}</span></span>
          ${isCur ? html`<span class="chip chip--primary chip--sm">aktiv</span>` : html`<span class="disclosure-arrow" aria-hidden="true">${raw(ICON.down)}</span>`}
        </summary>
        <div class="pv-phase-item__body" style="padding:0 var(--s-4) var(--s-4)">
          ${all.map(([w, b]) => html`<div class="pv-start"><span class="pv-letter" style="width:32px;height:32px;font-size:var(--fs-md)">${b}</span>
            <span class="pv-start__body"><span class="pv-start__name">${w.name}</span><span class="pv-start__meta">ca. ${minutes(w)} Min</span></span></div>`)}
          ${pk && p.clearanceNote ? html`<p class="text-sm muted">${p.clearanceNote}</p>` : ''}
          ${pk && !gate.ok ? html`<div class="pv-lock mt-2">${raw(ICON.lock)}<div><p class="text-sm strong mb-0">Noch gesperrt</p>${lockReasons(gate.reasons)}</div></div>` : ''}
          ${isCur ? '' : html`<div class="btn-row mt-4"><button class="btn btn--outline btn--sm" data-phase="${p.id}" ${gate.ok ? '' : 'disabled'}>${i < pIdx ? 'Zurück zu dieser Phase' : 'Zu dieser Phase wechseln'}</button></div>`}
        </div>
      </details></li>`;
    };

    const cur = schedOf(phase.id);

    paint(root, html`
      ${pageHeader({ title: 'Plan', eyebrow: `Phase ${pIdx + 1} von ${phases.length}`, actions: html`<a class="btn btn--outline btn--sm" href="#/eigene">${raw(ICON.puzzle)} Eigene</a>` })}

      <section class="card card--hero">
        <p class="hero__eyebrow">Aktuelle Phase${cur ? ` · ${fmtRange(cur)}` : ''}</p>
        <h2 class="hero__title">${phase.name}</h2>
        <div class="pv-phase-steps" aria-hidden="true">${phases.map((p, i) => html`<span class="${i < pIdx ? 'is-done' : i === pIdx ? 'is-current' : ''}"></span>`)}</div>
        <p class="muted">${phase.description}</p>
        <p class="hero__meta mb-0">
          <span>${raw(ICON.target)}<span class="num">${prog.sessionsInPhase}</span>&nbsp;Einheiten</span>
          <span>${raw(ICON.calendar)}<span class="num">${prog.weeksInPhase ?? 0}</span>&nbsp;Wochen aktiv</span>
          ${prog.sessionsInPhase ? html`<span>✓ <span class="num">${Math.round(prog.greenRatio * 100)} %</span>&nbsp;grün</span>` : ''}
        </p>
      </section>

      ${hint.text ? html`<div class="pv-callout ${hint.status === 'behind' ? 'pv-callout--warn' : 'pv-callout--knee'}"><span class="pv-callout__icon" aria-hidden="true">🗓️</span>
        <p class="text-sm">${hint.text}${settings.surgeryDate ? html` <span class="muted">OP: ${formatDE(settings.surgeryDate, { weekday: false })}.</span>` : ''}</p></div>`
        : !settings.surgeryDate ? html`<div class="pv-callout pv-callout--knee"><span class="pv-callout__icon" aria-hidden="true">🗓️</span>
        <p class="text-sm">Mit OP-Termin zeigt der Plan, wann welche Phase ungefähr dran ist. <a href="#/mehr?focus=surgeryDate">Termin eintragen</a></p></div>` : ''}

      ${isPostOp ? html`<div class="pv-callout pv-callout--stop"><span class="pv-callout__icon" aria-hidden="true">⛔</span>
        <p class="text-sm"><strong>Nur nach Freigabe durch Arzt/Physio – deren Protokoll hat Vorrang.</strong> ${phase.redFlagNote ?? ''}</p></div>` : ''}

      ${phase.exitCriteria?.length ? html`<section class="card" aria-labelledby="crit-title">
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
        ${nextPhase ? (!nextGate.ok
          ? html`<div class="pv-lock mt-4">${raw(ICON.lock)}<div><p class="text-sm strong mb-0">„${nextPhase.name}“ ist noch gesperrt</p>${lockReasons(nextGate.reasons)}
              <p class="field__hint mb-0">Nach der OP bestätigst du die Freigabe auf „Heute“. Bis dahin gilt: ausgeruht und ohne Schwellung in die OP.</p></div></div>`
          : prog.suggestReady
            ? html`<button class="btn btn--gold btn--block btn--lg mt-4" data-advance>🏅 Bereit für nächste Phase</button>
              <p class="field__hint center mt-2">Du entscheidest – am besten nach Rücksprache mit deiner Physio.</p>`
            : html`<p class="field__hint mt-4">Wenn alle Kriterien erfüllt sind, kannst du hier in „${nextPhase.name}“ wechseln.</p>`)
          : html`<p class="field__hint mt-4">Das ist die letzte Phase in der App. 🎯</p>`}
      </section>` : isPostOp ? html`<section class="card">
        <h2 class="card__title">Entlastungsphase</h2>
        <p class="card__sub">${post.week ? `Woche ${Math.min(6, post.week)} von 6 · ` : ''}${post.ended ? (post.message ?? phase.endNote) : 'Sechs Wochen ohne Belastung des operierten Beins. Training im Sitzen und Liegen – nach deinem Protokoll.'}</p>
        ${phase.gaitNote ? html`<div class="pv-callout pv-callout--knee mt-4 mb-0"><span class="pv-callout__icon" aria-hidden="true">🩼</span><p class="text-sm">${phase.gaitNote}</p></div>` : ''}
      </section>` : ''}

      <h2 class="section-title">Krafttraining</h2>
      ${['A', 'B', 'C'].map((k) => {
        const w = content.workouts.find((x) => x.id === phase.workouts?.[k]);
        return w ? workoutCard(w, workoutLetter(w, phases)) : html`<section class="card"><h3 class="card__title">Training ${k}</h3><p class="placeholder">Noch nicht angelegt.</p></section>`;
      })}

      ${pw.short ? html`<h2 class="section-title">Kurztraining <span class="count">~15 Min</span></h2>${workoutCard(pw.short, KIND_ICON.short)}` : ''}

      ${pw.cardio.length ? html`<h2 class="section-title">Rudern</h2>
        <p class="pv-count mt-0">Separate Ausdauer-Einheiten, 3× pro Woche. Die Schmerz-Ampel gilt auch beim Rudern.</p>
        ${pw.cardio.map((w) => workoutCard(w, KIND_ICON.cardio))}`
        : isPostOp ? html`<div class="pv-callout pv-callout--warn"><span class="pv-callout__icon" aria-hidden="true">🚣</span><p class="text-sm">Rudern ist in der Entlastungsphase nicht erlaubt – es kommt erst wieder, wenn dein Team es freigibt.</p></div>` : ''}

      ${isPostOp ? togglesCard() : ''}

      <h2 class="section-title">Alle Phasen${sched ? html` <span class="count">Zeitplan</span>` : ''}</h2>
      <ul class="list list--card">${phases.map(phaseItem)}</ul>
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
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      e.preventDefault();
      const data = store.get();
      try {
        const res = duplicateAsCustom(data.state, copy.dataset.copy, content, { settings: data.settings });
        store.update((d) => {
          d.state = res.state;
          awardBadges(d, content.badges, evaluateBadges, { today: todayISO(), xpPerBadge: XP.badge });
        });
        toast(`„${res.workout.name}“ angelegt – jetzt anpassen`, { icon: '🧩' });
        navigate(`/eigene/${encodeURIComponent(res.workout.id)}`);
      } catch (err) {
        toast(err?.message || 'Kopieren fehlgeschlagen', { kind: 'accent', icon: '⚠️' });
      }
      return;
    }
    if (e.target.closest('[data-advance]')) {
      const data = store.get();
      const phases = content.phases;
      const cur = phases.findIndex((p) => p.id === data.state.phaseId);
      const next = phases[cur + 1];
      if (!next) return;
      const gate = canEnterPhase(next, data.settings, data.state, todayISO());
      if (!gate.ok) { toast(gate.reasons[0] || 'Noch gesperrt', { kind: 'accent', icon: '🔒' }); return; }
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
      const gate = canEnterPhase(target, data.settings, data.state, todayISO());
      if (!gate.ok) { toast(gate.reasons[0] || 'Noch gesperrt', { kind: 'accent', icon: '🔒' }); return; }
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

  const onChange = async (e) => {
    const tog = e.target.closest('[data-toggle-ex]');
    if (tog) {
      const ex = content.exercises.find((x) => x.id === tog.dataset.toggleEx);
      if (!ex) return;
      const on = tog.checked;
      if (on && ex.postOpAllowed === false) {
        const ok = await confirmDialog({
          title: `${ex.name} freischalten?`,
          text: 'Diese Übung belastet das operierte Bein. Nur einschalten, wenn dein Team es ausdrücklich erlaubt.',
          confirm: 'Team hat es erlaubt', icon: '⚠️',
        });
        if (!ok) { tog.checked = false; return; }
      }
      store.update((d) => { d.state.exerciseToggles = setToggle(d.state.exerciseToggles, ex, on); });
      toast(on ? `${ex.name}: freigegeben` : `${ex.name}: deaktiviert`, { icon: on ? '✓' : '⏸' });
      return;
    }
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
    if (!(d instanceof HTMLDetailsElement)) return;
    const key = d.dataset.wid ?? (d.dataset.pid ? `ph:${d.dataset.pid}` : null);
    if (!key) return;
    if (d.open) open.add(key); else open.delete(key);
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
