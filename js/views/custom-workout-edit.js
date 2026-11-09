// Eigenes Workout bauen/bearbeiten – see docs/SPEC.md §12.5, §12.12. Route #/eigene/:id ("neu" = new).
import { html, raw, render as paint } from '../render.js';
import { todayISO } from '../util/date.js';
import { estimateWorkoutMinutes, MAX_SESSION_MIN } from '../logic/duration.js';
import { levelOf } from '../logic/progression.js';
import {
  CUSTOM_BLOCKS, MAX_CUSTOM_ITEMS, toWorkout, normalizeCustom, validateCustomWorkout, createCustomWorkout, updateCustomWorkout,
} from '../logic/custom-workouts.js';
import { ICON, ensureViewStyles, applyFontScale, pageHeader, doseText, figureThumb, toast, openSheet, confirmDialog, safeData, fmtMinutes
} from './ui.js';
import { ensureV2Styles, availability, availabilityChip, awardBadges, celebrateBadges, blockLabel, meter } from './v2-shared.js';
import { filterExercises } from './exercises.js';

export const title = 'Eigenes Workout';

export const SECTIONS = [
  { id: 'warmup', title: 'Aufwärmen' },
  { id: 'knee', title: CUSTOM_BLOCKS[0].title },
  { id: 'archery', title: CUSTOM_BLOCKS[1].title },
  { id: 'cooldown', title: 'Abschluss' },
];
const PICK_FILTERS = [['', 'Alle'], ['knee', 'Knie'], ['archery', 'Bogen'], ['warmup', 'Aufwärmen'], ['cooldown', 'Abschluss'], ['cardio', 'Rudern']];

/** Fresh empty draft. */
export function emptyDraft() {
  return { name: '', warmup: [], blocks: CUSTOM_BLOCKS.map((b) => ({ id: b.id, title: b.title, items: [] })), cooldown: [] };
}

/** Draft (deep copy) from a stored custom workout. */
export function draftFrom(cw) {
  const n = normalizeCustom(cw, { id: cw.id, createdAt: cw.createdAt });
  return { name: n.name, warmup: n.warmup, blocks: n.blocks, cooldown: n.cooldown };
}

/** Items array of a section in a draft (live reference). */
export function sectionItems(draft, section) {
  if (section === 'warmup' || section === 'cooldown') return draft[section];
  return draft.blocks.find((b) => b.id === section).items;
}

/** Total item count. */
export const totalItems = (draft) => SECTIONS.reduce((a, s) => a + sectionItems(draft, s.id).length, 0);

/** Add an exercise to a section (mutates). Returns false when the 20-item limit is reached. */
export function addItem(draft, section, exerciseId) {
  if (totalItems(draft) >= MAX_CUSTOM_ITEMS) return false;
  sectionItems(draft, section).push({ exerciseId });
  return true;
}

/** Move item by delta within its section (mutates). Returns new index. */
export function moveItem(draft, section, index, delta) {
  const arr = sectionItems(draft, section);
  const to = index + delta;
  if (index < 0 || index >= arr.length || to < 0 || to >= arr.length) return index;
  const [it] = arr.splice(index, 1);
  arr.splice(to, 0, it);
  return to;
}

/** Remove item (mutates). */
export function removeItem(draft, section, index) {
  sectionItems(draft, section).splice(index, 1);
}

/** Default target section for an exercise from the library. */
export const defaultSection = (ex) => (['warmup', 'knee', 'archery', 'cooldown'].includes(ex?.block) ? ex.block : 'knee');

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, params, navigate }) {
  ensureViewStyles();
  ensureV2Styles();
  const isNew = !params.id || params.id === 'neu';
  const existing = isNew ? null : (safeData(store.get()).state.customWorkouts || []).find((w) => w.id === params.id);
  const exById = new Map(content.exercises.map((e) => [e.id, e]));

  if (!isNew && !existing) {
    paint(root, html`${pageHeader({ title: 'Workout nicht gefunden', back: '#/eigene' })}
      <section class="card"><div class="empty"><h3 class="empty__title">Dieses Workout gibt es nicht (mehr).</h3>
      <p class="empty__text">Vielleicht wurde es gelöscht.</p>
      <a class="btn btn--primary" href="#/eigene">Zu deinen Workouts</a></div></section>`);
    return undefined;
  }

  const draft = existing ? draftFrom(existing) : emptyDraft();
  let showErrors = false;
  let dirty = false;
  let focusAfter = null;
  let focusAlt = null;
  let alive = true;
  if (existing) document.title = `${existing.name} · Physio`;

  const estimate = () => {
    const data = safeData(store.get());
    const clean = { ...draft, blocks: draft.blocks.map((b) => ({ ...b, items: b.items.filter((it) => exById.get(it.exerciseId)?.block !== 'cardio') })) };
    if (!totalItems(clean)) return 0;
    try { return estimateWorkoutMinutes(toWorkout(clean, data.state), content, data.state, data.settings); } catch { return 0; }
  };

  const draw = () => {
    const data = safeData(store.get());
    applyFontScale(data.settings);
    const { state, settings } = data;
    const v = validateCustomWorkout({ ...draft, name: draft.name || 'x' }, content, state, settings);
    const nameErr = !draft.name.trim();
    const errors = [...(nameErr ? ['Bitte gib dem Workout einen Namen.'] : []), ...v.errors];
    const minutes = estimate();
    const count = totalItems(draft);
    const ratio = minutes / MAX_SESSION_MIN;
    const meterCls = minutes > MAX_SESSION_MIN ? 'is-over' : minutes > MAX_SESSION_MIN * 0.85 ? 'is-warn' : '';
    let n = 0;

    paint(root, html`
      ${pageHeader({ title: isNew ? 'Neues Workout' : 'Workout bearbeiten', eyebrow: 'Eigene Workouts', back: '#/eigene', backLabel: 'Zurück zur Liste' })}

      <section class="card">
        <div class="field mb-0">
          <label class="field__label" for="cw-name">Name</label>
          <input class="input ${showErrors && nameErr ? 'is-invalid' : ''}" id="cw-name" data-name maxlength="60" autocomplete="off" placeholder="z. B. Knie-Runde am Abend" value="${draft.name}">
          <span class="field__hint">${draft.name.length}/60 Zeichen</span>
        </div>
      </section>

      ${SECTIONS.map((sec) => {
        const items = sectionItems(draft, sec.id);
        return html`<section class="v2-sec v2-sec--${sec.id}" aria-labelledby="sec-${sec.id}">
          <div class="v2-sec__head"><span class="v2-sec__dot" aria-hidden="true"></span>
            <h2 id="sec-${sec.id}">${sec.title} <span class="muted num">${items.length}</span></h2>
            <button class="btn btn--soft btn--sm" data-add="${sec.id}" ${count >= MAX_CUSTOM_ITEMS ? 'disabled' : ''}>${raw(ICON.plus)} Übung</button>
          </div>
          ${items.length ? html`<ol class="v2-items">${items.map((it, i) => {
            n += 1;
            const ex = exById.get(it.exerciseId);
            if (!ex) {
              return html`<li class="v2-item"><span class="v2-item__num">${n}</span><span class="v2-item__body"><span class="v2-item__name">Unbekannte Übung</span><span class="v2-item__sub">${it.exerciseId}</span></span>
                <span class="v2-item__btns"><button class="btn btn--danger btn--sm" data-rm="${sec.id}:${i}" aria-label="Entfernen">${raw(ICON.trash)}</button></span></li>`;
            }
            const lvl = ex.levels[levelOf(state, ex.id, ex)];
            const av = availability(ex, state, content.phases);
            const wrongBlock = (sec.id === 'knee' || sec.id === 'archery') && (ex.block === 'knee' || ex.block === 'archery') && ex.block !== sec.id;
            return html`<li class="v2-item">
              <span class="v2-item__num num">${n}</span>
              <span class="v2-item__body">
                <a class="v2-item__name" href="#/uebung/${encodeURIComponent(ex.id)}">${ex.name}</a>
                <span class="v2-item__sub"><span class="num">${doseText(ex, lvl)}</span>${wrongBlock ? html`<span class="chip chip--sm v2-chip--warn">${blockLabel(ex.block)}-Übung</span>` : ''}${availabilityChip(av.kind === 'postop-later' ? null : av)}${ex.block === 'cardio' ? html`<span class="chip chip--sm v2-chip--stop">Rudern nicht erlaubt</span>` : ''}</span>
              </span>
              <span class="v2-item__btns">
                <button class="btn btn--outline btn--sm" data-mv="${sec.id}:${i}:-1" aria-label="${ex.name} nach oben" ${i === 0 ? 'disabled' : ''}>${raw(ICON.up)}</button>
                <button class="btn btn--outline btn--sm" data-mv="${sec.id}:${i}:1" aria-label="${ex.name} nach unten" ${i === items.length - 1 ? 'disabled' : ''}>${raw(ICON.down)}</button>
                <button class="btn btn--danger btn--sm" data-rm="${sec.id}:${i}" aria-label="${ex.name} entfernen">${raw(ICON.trash)}</button>
              </span>
            </li>`;
          })}</ol>` : html`<p class="v2-empty-sec">${sec.id === 'warmup' || sec.id === 'cooldown' ? 'Optional. ' : ''}Noch keine Übung – tippe auf „+ Übung“.</p>`}
        </section>`;
      })}

      ${v.warnings.length ? html`<div class="pv-callout pv-callout--warn" role="status"><span class="pv-callout__icon" aria-hidden="true">⚠️</span>
        <div><p class="strong">Hinweise</p><ul class="v2-warn-list">${v.warnings.map((w) => html`<li>${w}</li>`)}</ul></div></div>` : ''}
      ${showErrors && errors.length ? html`<div class="pv-callout pv-callout--stop" role="alert"><span class="pv-callout__icon" aria-hidden="true">✋</span>
        <div><p class="strong">Noch nicht speicherbar</p><ul class="v2-err-list">${errors.map((w) => html`<li>${w}</li>`)}</ul></div></div>` : ''}

      <div class="v2-durbar" aria-live="polite">
        <div class="v2-durbar__row">
          <div class="grow">
            <span class="eyebrow">Geschätzte Dauer</span>
            <div class="v2-durbar__min">ca. ${fmtMinutes(minutes)}</div>
            <div class="text-xs muted num">${count}/${MAX_CUSTOM_ITEMS} Übungen</div>
          </div>
          <button class="btn btn--primary" data-save>${raw(ICON.check)} Speichern</button>
        </div>
        ${meter(ratio, meterCls)}
        ${minutes > MAX_SESSION_MIN ? html`<p class="text-xs mt-2 mb-0" style="color:var(--red-ink)">Über deinem 30-Minuten-Rahmen – beim Start werden Sätze automatisch gekürzt.</p>`
          : minutes ? html`<p class="text-xs muted mt-2 mb-0">Passt in deinen 30-Minuten-Rahmen. 👍</p>` : ''}
      </div>
    `);
    if (focusAfter) {
      const el = root.querySelector(focusAfter);
      if (el && !el.disabled) el.focus();
      else if (focusAlt) root.querySelector(focusAlt)?.focus();
      focusAfter = null;
      focusAlt = null;
    }
  };

  /* ---------- picker sheet ---------- */
  const openPicker = (section) => {
    const pf = { q: '', block: section };
    const secTitle = SECTIONS.find((s) => s.id === section)?.title ?? '';
    const dlg = openSheet(html`
      <p class="eyebrow">Hinzufügen zu: ${secTitle}</p>
      <h2 class="sheet__title">Übung auswählen</h2>
      <div class="v2-sheet-sticky">
        <div class="search">${raw(ICON.search)}<input class="input" type="search" placeholder="Suchen, z. B. Brücke" aria-label="Übung suchen" data-pq></div>
        <div class="chip-row chip-row--scroll mt-2" role="group" aria-label="Filter">
          ${PICK_FILTERS.map(([id, label]) => html`<button class="chip chip--filter chip--sm" data-pf="${id}" aria-pressed="${String(pf.block === id)}">${label}</button>`)}
        </div>
      </div>
      <div data-plist></div>
      <div class="sheet__actions"><button class="btn btn--primary btn--block" data-close>Fertig</button></div>
    `, { label: 'Übung auswählen', onClose: () => { if (!alive) return; focusAfter = `[data-add="${section}"]`; draw(); } });
    const listEl = dlg.querySelector('[data-plist]');
    const drawList = () => {
      const state = store.getState();
      const inSection = new Set(sectionItems(draft, section).map((it) => it.exerciseId));
      const list = filterExercises(content.exercises, { q: pf.q, block: pf.block || null });
      const full = totalItems(draft) >= MAX_CUSTOM_ITEMS;
      paint(listEl, html`
        <p class="pv-count" aria-live="polite"><span class="num">${list.length}</span> ${list.length === 1 ? 'Übung' : 'Übungen'}${full ? ' · Maximum von 20 erreicht' : ''}</p>
        ${pf.block === 'cardio' ? html`<div class="pv-callout"><span class="pv-callout__icon" aria-hidden="true">🚣</span><div><p class="text-sm">Rudern läuft als eigene Rudereinheit mit geführtem Timer – starte sie auf „Heute“. In eigene Workouts kann es nicht aufgenommen werden.</p></div></div>` : ''}
        <ul class="v2-picker-list">${list.map((ex) => {
          const added = inSection.has(ex.id);
          const av = availability(ex, state, content.phases);
          const cardio = ex.block === 'cardio';
          const lvl = ex.levels[levelOf(state, ex.id, ex)];
          return html`<li><button class="v2-pick ${added ? 'is-added' : ''}" data-pick="${ex.id}" ${cardio || (full && !added) ? 'disabled' : ''} aria-label="${ex.name}${added ? ' (bereits enthalten, nochmal hinzufügen)' : ' hinzufügen'}">
            <span class="v2-pick__thumb">${figureThumb(ex)}</span>
            <span class="v2-pick__body"><span class="v2-pick__name">${ex.name}</span>
              <span class="v2-pick__sub"><span class="chip chip--sm ${ex.block === 'knee' ? 'chip--knee' : ex.block === 'archery' || cardio ? 'chip--archery' : ''}">${blockLabel(ex.block)}</span>
              ${cardio ? html`<span class="chip chip--sm v2-chip--stop">nur als Rudereinheit</span>` : html`<span class="num">${doseText(ex, lvl)}</span>`}
              ${cardio ? '' : availabilityChip(av)}</span></span>
            ${cardio ? '' : html`<span class="v2-pick__add" aria-hidden="true">${raw(added ? ICON.check : ICON.plus)}</span>`}
          </button></li>`;
        })}</ul>`);
    };
    dlg.addEventListener('input', (e) => { if (e.target.matches('[data-pq]')) { pf.q = e.target.value.trim(); drawList(); } });
    dlg.addEventListener('click', (e) => {
      const f = e.target.closest('[data-pf]');
      if (f) {
        pf.block = f.dataset.pf;
        dlg.querySelectorAll('[data-pf]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pf === pf.block)));
        drawList();
        return;
      }
      const p = e.target.closest('[data-pick]');
      if (p && !p.disabled) {
        const ex = exById.get(p.dataset.pick);
        if (!addItem(draft, section, ex.id)) { toast('Maximal 20 Übungen pro Workout', { kind: 'accent', icon: '!' }); return; }
        dirty = true;
        toast(`${ex.name} hinzugefügt`, { icon: '＋', ms: 1400 });
        drawList();
      }
    });
    drawList();
  };

  /* ---------- save ---------- */
  const save = () => {
    showErrors = true;
    let result = null;
    let badges = [];
    try {
      store.update((d) => {
        const opts = { settings: d.settings };
        result = isNew ? createCustomWorkout(d.state, draft, content, opts) : updateCustomWorkout(d.state, existing.id, draft, content, opts);
        d.state = result.state;
        if (isNew) badges = awardBadges(d, content.badges, todayISO());
      });
    } catch (err) {
      draw();
      toast(err.message || 'Speichern fehlgeschlagen', { kind: 'accent', icon: '!' });
      root.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    dirty = false;
    toast(isNew ? `„${result.workout.name}“ gespeichert – bereit zum Training!` : 'Änderungen gespeichert', { icon: isNew ? '🎉' : '✓' });
    celebrateBadges(badges, content.badges);
    navigate('/eigene');
  };

  const onClick = (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { openPicker(add.dataset.add); return; }
    const mv = e.target.closest('[data-mv]');
    if (mv) {
      const [sec, i, d] = mv.dataset.mv.split(':');
      const to = moveItem(draft, sec, Number(i), Number(d));
      dirty = true;
      focusAfter = `[data-mv="${sec}:${to}:${d}"]`;
      focusAlt = `[data-mv="${sec}:${to}:${-Number(d)}"]`;
      draw();
      return;
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const [sec, i] = rm.dataset.rm.split(':');
      const name = exById.get(sectionItems(draft, sec)[Number(i)]?.exerciseId)?.name ?? 'Übung';
      removeItem(draft, sec, Number(i));
      dirty = true;
      focusAfter = `[data-add="${sec}"]`;
      draw();
      toast(`${name} entfernt`, { icon: '−', ms: 1400 });
      return;
    }
    if (e.target.closest('[data-save]')) save();
  };
  const onInput = (e) => {
    if (!e.target.matches('[data-name]')) return;
    draft.name = e.target.value.slice(0, 60);
    dirty = true;
    const hint = e.target.parentElement.querySelector('.field__hint');
    if (hint) hint.textContent = `${draft.name.length}/60 Zeichen`;
    if (showErrors && draft.name.trim()) e.target.classList.remove('is-invalid');
  };
  const onBack = async (e) => {
    const a = e.target.closest('a[href="#/eigene"]');
    if (!a || !dirty) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const ok = await confirmDialog({ title: 'Änderungen verwerfen?', text: 'Du hast ungespeicherte Änderungen.', confirm: 'Verwerfen', cancel: 'Weiter bearbeiten', danger: true, icon: '✏️' });
    if (ok) { dirty = false; navigate('/eigene'); }
  };

  draw();
  root.addEventListener('click', onBack, true);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  return () => {
    alive = false;
    root.removeEventListener('click', onBack, true);
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    document.querySelectorAll('dialog.sheet[open], dialog.modal[open]').forEach((d) => d.close());
  };
}
