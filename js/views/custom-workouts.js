// Eigene Workouts (list) – see docs/SPEC.md §12.5, §12.12.
import { html, raw, render as paint } from '../render.js';
import { todayISO } from '../util/date.js';
import { estimateWorkoutMinutes, MAX_SESSION_MIN } from '../logic/duration.js';
import { toWorkout, deleteCustomWorkout, duplicateAsCustom } from '../logic/custom-workouts.js';
import { phaseWorkouts, currentPhase } from '../logic/progression.js';
import { confetti } from '../components/celebrate.js';
import { ICON, ensureViewStyles, applyFontScale, pageHeader, workoutSplit, shortDate, toast, confirmDialog } from './ui.js';
import { ensureV2Styles, ICON2, awardBadges } from './v2-shared.js';

export const title = 'Eigene Workouts';

/**
 * Summary of a custom workout for list cards.
 * @returns {{count: number, minutes: number, split: {warmup: number, knee: number, archery: number, cooldown: number, total: number}, over: boolean}}
 */
export function customSummary(cw, content, state, settings) {
  const split = workoutSplit(cw);
  let minutes = 0;
  try { minutes = split.total ? estimateWorkoutMinutes(toWorkout(cw, state), content, state, settings) : 0; } catch { minutes = 0; }
  return { count: split.total, minutes, split, over: minutes > MAX_SESSION_MIN };
}

/** Local day of an ISO timestamp. */
const isoDay = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, navigate }) {
  ensureViewStyles();
  ensureV2Styles();

  const usage = (sessions, id) => (sessions || []).filter((s) => s?.status === 'done' && s.workoutId === id).length;

  const draw = () => {
    const data = store.get();
    applyFontScale(data.settings);
    const { state, settings, sessions } = data;
    const list = (state.customWorkouts || []).slice().sort((a, b) => (String(a.updatedAt) < String(b.updatedAt) ? 1 : -1));
    const phase = currentPhase(state, content.phases);
    const pw = phaseWorkouts(phase, content.workouts);
    const templates = [...pw.rotation, ...(pw.short ? [pw.short] : [])];

    paint(root, html`
      ${pageHeader({
        title: 'Eigene Workouts', eyebrow: list.length ? `${list.length} ${list.length === 1 ? 'Workout' : 'Workouts'} · selbst zusammengestellt` : 'Dein Training, deine Auswahl', back: '#/plan', backLabel: 'Zurück zum Plan',
        actions: list.length ? html`<a class="btn btn--primary btn--sm" href="#/eigene/neu">${raw(ICON.plus)} Neu</a>` : '',
      })}

      ${list.length ? '' : html`<section class="card"><div class="empty">
        <div class="empty__art"><svg viewBox="0 0 64 64"><rect x="12" y="10" width="40" height="46" rx="6"/><path d="M22 24h20M22 34h20M22 44h12"/><circle cx="48" cy="48" r="10" fill="var(--surface)"/><path d="M48 43v10M43 48h10"/></svg></div>
        <h3 class="empty__title">Noch kein eigenes Workout</h3>
        <p class="empty__text">Stell dir deine Lieblingsübungen zusammen – z. B. eine Knie-Runde für zwischendurch. Die App schätzt die Dauer und achtet auf deinen 30-Minuten-Rahmen.</p>
        <a class="btn btn--primary" href="#/eigene/neu">${raw(ICON.plus)} Erstes Workout bauen</a>
      </div></section>`}

      ${list.map((cw) => {
        const sum = customSummary(cw, content, state, settings);
        const used = usage(sessions, cw.id);
        const changed = isoDay(cw.updatedAt);
        return html`<article class="card v2-cw-card" data-cw="${cw.id}">
          <div class="card__header mb-0">
            <div class="grow"><h2 class="card__title truncate">${cw.name}</h2>
              <p class="card__sub">${changed ? `Geändert ${shortDate(changed)}` : ''}${used ? ` · ${used}× trainiert` : ' · noch nicht trainiert'}</p></div>
          </div>
          <div class="v2-cw-meta">
            <span class="chip chip--sm">${raw(ICON.list)} <span class="num">${sum.count}</span> ${sum.count === 1 ? 'Übung' : 'Übungen'}</span>
            <span class="chip chip--sm ${sum.over ? 'v2-chip--warn' : 'chip--green'}">${raw(ICON.clock)} ca. <span class="num">${sum.minutes}</span> Min</span>
            ${sum.split.knee ? html`<span class="chip chip--sm chip--knee">Knie ${sum.split.knee}</span>` : ''}
            ${sum.split.archery ? html`<span class="chip chip--sm chip--archery">Bogen ${sum.split.archery}</span>` : ''}
          </div>
          <div class="v2-split" aria-hidden="true">
            ${['warmup', 'knee', 'archery', 'cooldown'].filter((k) => sum.split[k]).map((k) => html`<span class="${k === 'knee' ? 'is-knee' : k === 'archery' ? 'is-archery' : ''}" style="flex:${sum.split[k]}"></span>`)}
          </div>
          <a class="btn btn--primary btn--block mt-4" href="#/session?workout=${encodeURIComponent(cw.id)}">${raw(ICON.play)} Training starten</a>
          <div class="v2-actions">
            <a class="btn btn--soft btn--sm" href="#/eigene/${encodeURIComponent(cw.id)}" aria-label="${cw.name} bearbeiten">${raw(ICON2.edit)} Bearbeiten</a>
            <button class="btn btn--outline btn--sm" data-dup="${cw.id}" aria-label="${cw.name} duplizieren">${raw(ICON2.copy)} Duplizieren</button>
            <button class="btn btn--danger btn--sm btn--icon" data-del="${cw.id}" aria-label="${cw.name} löschen">${raw(ICON.trash)}</button>
          </div>
        </article>`;
      })}

      ${list.length ? html`<a class="btn btn--outline btn--block mb-4" href="#/eigene/neu">${raw(ICON.plus)} Neues Workout</a>` : ''}

      ${templates.length ? html`<h2 class="section-title">Aus Vorlage kopieren</h2>
        <p class="text-sm muted mt-0">Starte mit einem Plan-Workout der aktuellen Phase und passe es an.</p>
        <div class="v2-tpl mb-4">
          ${templates.map((w) => html`<button data-tpl="${w.id}"><strong>${w.name}</strong><span>${workoutSplit(w).total} Übungen · ca. ${estimateWorkoutMinutes(w, content, state, settings)} Min</span></button>`)}
        </div>` : ''}

      <div class="pv-callout pv-callout--knee"><span class="pv-callout__icon" aria-hidden="true">🦵</span>
        <div><p class="strong">Gut zu wissen</p><p class="text-sm">Auch eigene Workouts nutzen Ampel, Stufen und Pausen wie gewohnt. Rudern startest du als eigene Rudereinheit auf „Heute“.</p></div></div>
    `);
  };

  const celebrateBadges = (ids) => {
    for (const id of ids) {
      const b = content.badges.find((x) => x.id === id);
      if (b) toast(`Neues Abzeichen: ${b.name}`, { kind: 'gold', icon: b.icon || '🏅', ms: 3600 });
    }
    if (ids.length) confetti();
  };

  const onClick = async (e) => {
    const dup = e.target.closest('[data-dup]');
    const tpl = e.target.closest('[data-tpl]');
    if (dup || tpl) {
      const id = (dup || tpl).dataset.dup || (tpl && tpl.dataset.tpl);
      let created = null;
      let badges = [];
      try {
        store.update((d) => {
          const r = duplicateAsCustom(d.state, id, content, { settings: d.settings });
          d.state = r.state;
          created = r.workout;
          badges = awardBadges(d, content.badges, todayISO());
        });
      } catch (err) {
        toast(err.message || 'Kopieren fehlgeschlagen', { kind: 'accent', icon: '!' });
        return;
      }
      toast(`„${created.name}“ angelegt`, { icon: '📋' });
      celebrateBadges(badges);
      if (tpl) navigate(`/eigene/${created.id}`);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const cw = (store.getState().customWorkouts || []).find((x) => x.id === del.dataset.del);
      if (!cw) return;
      const ok = await confirmDialog({ title: 'Workout löschen?', text: `„${cw.name}“ wird entfernt. Bereits trainierte Einheiten bleiben im Verlauf erhalten.`, confirm: 'Löschen', danger: true, icon: '🗑️' });
      if (!ok) return;
      store.update((d) => { d.state = deleteCustomWorkout(d.state, cw.id); });
      toast('Workout gelöscht', { icon: '🗑️' });
    }
  };

  draw();
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(draw);
  return () => {
    unsub();
    root.removeEventListener('click', onClick);
    document.querySelectorAll('dialog.modal[open]').forEach((d) => d.close());
  };
}
