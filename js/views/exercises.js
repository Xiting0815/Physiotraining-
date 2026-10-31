// Übungen (library) – see docs/SPEC.md §3.5.
import { html, raw, render as paint } from '../render.js';
import { levelOf } from '../logic/progression.js';
import {
  ICON, BLOCK_LABEL, figureThumb, EQUIPMENT_LABEL, ensureViewStyles, applyFontScale, pageHeader, doseText, bandChip, workoutItems,
} from './ui.js';

export const title = 'Übungen';

const BLOCKS = ['knee', 'archery', 'warmup', 'cooldown'];
const BLOCK_ORDER = { warmup: 0, knee: 1, archery: 2, cooldown: 3 };
const EQUIP_ORDER = ['theraband', 'loop', 'mat', 'chair', 'step', 'wall', 'door', 'none'];

/** Normalise for search: lowercase, umlauts folded. */
export function fold(s) {
  return String(s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Pure filter for the library.
 * @param {any[]} exercises
 * @param {{q?: string, block?: string|null, equipment?: string[], planIds?: Set<string>|null}} f
 */
export function filterExercises(exercises, { q = '', block = null, equipment = [], planIds = null } = {}) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  return (exercises || []).filter((ex) => {
    if (block && ex.block !== block) return false;
    if (equipment.length && !equipment.some((e) => (ex.equipment || []).includes(e))) return false;
    if (planIds && !planIds.has(ex.id)) return false;
    if (!terms.length) return true;
    const hay = fold([ex.name, ex.description, ex.category, ...(ex.tags || []), ...(ex.cues || [])].join(' '));
    return terms.every((t) => hay.includes(t));
  }).sort((a, b) => (BLOCK_ORDER[a.block] - BLOCK_ORDER[b.block]) || a.name.localeCompare(b.name, 'de'));
}

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, query }) {
  ensureViewStyles();
  applyFontScale(store.getSettings());
  const f = {
    q: query.q || '',
    block: BLOCKS.includes(query.block) ? query.block : null,
    equipment: query.equipment ? query.equipment.split(',').filter((e) => EQUIP_ORDER.includes(e)) : [],
    plan: query.plan === '1',
  };
  const usedEquip = EQUIP_ORDER.filter((id) => content.exercises.some((e) => (e.equipment || []).includes(id)));

  const planIds = () => {
    const st = store.getState();
    const phase = content.phases.find((p) => p.id === st.phaseId) ?? content.phases[0];
    const ids = new Set();
    for (const k of ['A', 'B', 'C']) {
      const w = content.workouts.find((x) => x.id === phase?.workouts?.[k]);
      for (const it of workoutItems(w)) ids.add(it.exerciseId);
    }
    return ids;
  };

  paint(root, html`
    ${pageHeader({ title: 'Übungen', eyebrow: `${content.exercises.length} Übungen · Knie & Bogen` })}
    <div class="pv-sticky-filter">
      <div class="search">${raw(ICON.search)}<input class="input" type="search" placeholder="Übung suchen, z. B. Brücke" aria-label="Übung suchen" value="${f.q}" data-q></div>
      <div class="chip-row chip-row--scroll mt-2" role="group" aria-label="Block">
        <button class="chip chip--filter" data-block="" aria-pressed="${!f.block && !f.plan}">Alle</button>
        <button class="chip chip--filter" data-plan aria-pressed="${f.plan}">Im Plan</button>
        ${BLOCKS.map((b) => html`<button class="chip chip--filter" data-block="${b}" aria-pressed="${f.block === b}">${BLOCK_LABEL[b]}</button>`)}
      </div>
      <div class="chip-row chip-row--scroll mt-2" role="group" aria-label="Ausrüstung">
        ${usedEquip.map((id) => html`<button class="chip chip--filter chip--sm" data-eq="${id}" aria-pressed="${f.equipment.includes(id)}">${EQUIPMENT_LABEL[id] ?? id}</button>`)}
      </div>
    </div>
    <div data-list></div>
  `);
  const listEl = root.querySelector('[data-list]');

  const drawList = () => {
    const state = store.getState();
    const settings = store.getSettings();
    const list = filterExercises(content.exercises, { q: f.q, block: f.block, equipment: f.equipment, planIds: f.plan ? planIds() : null });
    let lastBlock = null;
    paint(listEl, html`
      <p class="pv-count" aria-live="polite"><span class="num">${list.length}</span> ${list.length === 1 ? 'Übung' : 'Übungen'}${f.q ? html` für „${f.q}“` : ''}</p>
      ${list.length ? '' : html`<section class="card"><div class="empty">
        <div class="empty__art"><svg viewBox="0 0 64 64"><circle cx="28" cy="28" r="16"/><path d="M40 40l12 12"/></svg></div>
        <h3 class="empty__title">Nichts gefunden</h3><p class="empty__text">Versuch's mit einem anderen Begriff oder weniger Filtern.</p>
        <button class="btn btn--soft" data-reset>Filter zurücksetzen</button></div></section>`}
      ${list.map((ex) => {
        const li = levelOf(state, ex.id, ex);
        const lvl = ex.levels[li];
        const header = !f.block && ex.block !== lastBlock ? html`<h2 class="section-title">${BLOCK_LABEL[ex.block]}</h2>` : '';
        lastBlock = ex.block;
        const chipCls = ex.block === 'archery' ? 'chip--archery' : ex.block === 'knee' ? 'chip--knee' : '';
        return html`${header}<a class="exercise-card exercise-card--${ex.block}" href="#/uebung/${encodeURIComponent(ex.id)}">
          <div class="exercise-card__thumb">${figureThumb(ex)}</div>
          <div class="exercise-card__body">
            <span class="exercise-card__title">${ex.name}</span>
            <span class="exercise-card__meta">${doseText(ex, lvl)}${(ex.equipment || []).filter((e) => e !== 'none').length ? ` · ${(ex.equipment || []).filter((e) => e !== 'none').map((e) => EQUIPMENT_LABEL[e] ?? e).join(', ')}` : ''}</span>
            <span class="chip-row">
              <span class="chip chip--sm ${chipCls}">Stufe <span class="num">${li + 1}/${ex.levels.length}</span></span>
              ${lvl?.band ? bandChip(settings, lvl.band) : ''}
              ${ex.side === 'left' ? html`<span class="chip chip--sm chip--outline">OP-Knie</span>` : ''}
            </span>
          </div>
          ${raw(ICON.chev)}
        </a>`;
      })}
    `);
  };

  const syncUrl = () => {
    const parts = [];
    if (f.q) parts.push(`q=${encodeURIComponent(f.q)}`);
    if (f.block) parts.push(`block=${f.block}`);
    if (f.plan) parts.push('plan=1');
    if (f.equipment.length) parts.push(`equipment=${f.equipment.join(',')}`);
    history.replaceState(null, '', `#/uebungen${parts.length ? '?' + parts.join('&') : ''}`);
  };

  const syncChips = () => {
    for (const b of root.querySelectorAll('[data-block]')) b.setAttribute('aria-pressed', String((b.dataset.block || null) === f.block && !(b.dataset.block === '' && f.plan)));
    root.querySelector('[data-plan]').setAttribute('aria-pressed', String(f.plan));
    for (const b of root.querySelectorAll('[data-eq]')) b.setAttribute('aria-pressed', String(f.equipment.includes(b.dataset.eq)));
  };

  const onClick = (e) => {
    const bl = e.target.closest('[data-block]');
    const pl = e.target.closest('[data-plan]');
    const eq = e.target.closest('[data-eq]');
    if (bl) { f.block = bl.dataset.block || null; if (!f.block) f.plan = false; }
    else if (pl) { f.plan = !f.plan; }
    else if (eq) { const id = eq.dataset.eq; f.equipment = f.equipment.includes(id) ? f.equipment.filter((x) => x !== id) : [...f.equipment, id]; }
    else if (e.target.closest('[data-reset]')) { f.q = ''; f.block = null; f.plan = false; f.equipment = []; root.querySelector('[data-q]').value = ''; }
    else return;
    syncChips(); syncUrl(); drawList();
  };
  const onInput = (e) => {
    if (!e.target.matches('[data-q]')) return;
    f.q = e.target.value.trim();
    syncUrl(); drawList();
  };

  drawList();
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  const unsub = store.subscribe(drawList);
  return () => { unsub(); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); };
}
