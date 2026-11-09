// Meine Ausrüstung – v5 (SPEC §16): owned equipment steers the plan. Toggles for the optional equipment first,
// shopping ideas (data/equipment.json, optional) for what is still missing below. See also §6.6.
import { html, raw, render as paint } from '../render.js';
import {
  ICON, ensureViewStyles, applyFontScale, pageHeader, equipmentItems, normPriority, PRIORITY_ORDER, PRIORITY_LABEL,
  budgetSum, parsePriceRange, toast,
  safeData,
} from './ui.js';
import { OPTIONAL_EQUIPMENT, BASE_EQUIPMENT, EQUIPMENT_INFO, normalizeOwned, nameList } from '../logic/equipment.js';
import { equipmentPlanChanges } from '../logic/progression.js';

export const title = 'Meine Ausrüstung';

const PRIORITY_INFO = {
  muss: { icon: '⭐', text: 'Lohnt sich sofort – macht die meisten Übungen erst richtig möglich.' },
  sinnvoll: { icon: '👍', text: 'Bringt spürbar mehr Abwechslung und Sicherheit.' },
  nice: { icon: '✨', text: 'Schön zu haben, aber kein Muss.' },
};

const euro = ([lo, hi]) => (lo === hi ? `${lo} €` : `${lo}–${hi} €`);

/** Group items by normalised priority, in order muss → sinnvoll → nice. */
export function groupByPriority(items) {
  const groups = PRIORITY_ORDER.map((p) => ({ priority: p, items: [] }));
  for (const it of items || []) groups.find((g) => g.priority === normPriority(it.priority)).items.push(it);
  return groups.filter((g) => g.items.length);
}

/** Equipment ids a shopping item provides (v5 `item.equipment`, else its (legacy) id mapped). */
export const itemEquipment = (it) => normalizeOwned(Array.isArray(it?.equipment) && it.equipment.length ? it.equipment : [it?.id]);

/** A shopping item is owned when every equipment id it provides is ticked (items without known ids never are). */
export function itemOwned(it, owned) {
  const ids = itemEquipment(it);
  return ids.length > 0 && ids.every((id) => owned.has(id));
}

/**
 * Toast text for a plan diff (pure): „Neu in deinem Plan: A, B, C …“ / „Entfernt: …“ or a neutral line.
 * @param {{added: string[], removed: string[]}} diff
 */
export function changeText(diff, { removedFirst = false } = {}) {
  const added = diff.added.length ? `Neu in deinem Plan: ${nameList(diff.added)}` : '';
  const removed = diff.removed.length ? `Entfernt: ${nameList(diff.removed)}` : '';
  const parts = (removedFirst ? [removed, added] : [added, removed]).filter(Boolean);
  return parts.join(' · ') || 'Gespeichert – an deinem aktuellen Plan ändert sich dadurch nichts.';
}

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { content, store }) {
  ensureViewStyles();
  const items = equipmentItems(content.equipment);
  const open = new Set();
  /** @type {{added: string[], removed: string[], label: string}|null} */
  let lastChange = null;

  if (store.getState().equipmentNotice === 'pending') store.update((d) => { d.state.equipmentNotice = 'seen'; });

  const draw = () => {
    const settings = store.getSettings();
    applyFontScale(settings);
    const owned = new Set(normalizeOwned(settings.ownedEquipment));
    const missing = items.filter((it) => !itemOwned(it, owned));
    const groups = groupByPriority(missing);
    const ownedItems = items.filter((it) => itemOwned(it, owned));
    const openSum = budgetSum(missing);
    const mussSum = budgetSum(missing.filter((it) => normPriority(it.priority) === 'muss'));
    const bandList = (kind) => settings.bands.filter((b) => b.kind === kind);

    paint(root, html`
      ${pageHeader({ title: 'Meine Ausrüstung', eyebrow: 'Mehr', back: '#/mehr', backLabel: 'Zurück zu Mehr' })}

      <section class="card card--accent">
        <p class="hero__eyebrow">Dein Heim-Gym</p>
        <h2 class="hero__title"><span class="num" data-owned-count>${owned.size}</span> von <span class="num">${OPTIONAL_EQUIPMENT.length}</span> Extras abgehakt</h2>
        <p class="muted mb-0">Was du abhakst, verändert deinen Plan: bessere Varianten (z. B. mit dem Schlingentrainer), Rudern zum Aufwärmen und als eigene Einheit, Aufbau-Anleitungen mit Türanker und Griffen.</p>
        ${missing.length ? html`<div class="pv-budget">
          <div><span class="pv-budget__v">${euro(mussSum)}</span><span class="pv-budget__k">Muss (offen)</span></div>
          <div><span class="pv-budget__v">${euro(openSum)}</span><span class="pv-budget__k">Einkaufsideen offen</span></div>
        </div>` : ''}
      </section>

      ${lastChange ? html`<div class="pv-callout pv-callout--knee pv-eq-change" role="status" data-eq-change>
        <span class="pv-callout__icon" aria-hidden="true">🎒</span>
        <div><p class="strong mb-0">${lastChange.label}</p>
        ${(lastChange.removedFirst ? ['removed', 'added'] : ['added', 'removed']).map((k) => lastChange[k].length
          ? html`<p class="text-sm mb-0">${k === 'added' ? 'Neu in deinem Plan' : 'Entfernt'}: ${lastChange[k].join(', ')}</p>` : '')}
        ${!lastChange.added.length && !lastChange.removed.length ? html`<p class="text-sm mb-0">An deinem aktuellen Plan ändert sich dadurch nichts.</p>` : ''}
        <a class="text-sm" href="#/plan">Zum Plan</a></div>
      </div>` : ''}

      <h2 class="section-title">Das hast du</h2>
      <section class="card pv-eq-toggles" aria-label="Ausrüstung abhaken">
        ${OPTIONAL_EQUIPMENT.map((e) => {
          const on = owned.has(e.id);
          return html`<label class="pv-toggle-row${on ? '' : ' is-off'}">
            <span class="pv-eq-icon" aria-hidden="true">${e.icon}</span>
            <span class="pv-toggle-row__body"><span class="pv-toggle-row__name">${e.label}</span>
            <span class="pv-toggle-row__meta">${e.hint}</span></span>
            <input type="checkbox" class="switch" data-own-eq="${e.id}" ${on ? 'checked' : ''} aria-label="${e.label} vorhanden">
          </label>`;
        })}
      </section>

      <h2 class="section-title">Immer dabei</h2>
      <section class="card">
        <div class="chip-row mb-4">${BASE_EQUIPMENT.filter((id) => id !== 'none' && id !== 'theraband' && id !== 'loop').map((id) => html`<span class="chip chip--sm">${EQUIPMENT_INFO[id].icon} ${EQUIPMENT_INFO[id].label}</span>`)}</div>
        ${[['theraband', 'TheraBand'], ['loop', 'Loop-Bänder']].map(([k, t]) => bandList(k).length ? html`
          <p class="field__label mb-2">${t} <span class="muted text-xs">leicht → schwer</span></p>
          <div class="chip-row mb-4">${bandList(k).map((b) => html`<span class="chip chip--band" style="--band:${b.color}"><i class="chip__swatch"></i>${b.label}</span>`)}</div>` : '')}
        <p class="text-sm muted mb-0">Damit läuft der ganze Grundplan.</p><a class="tap-link pv-tap-left" href="#/mehr">Reihenfolge der Bänder ${raw(ICON.right)}</a>
      </section>

      ${missing.length ? html`
        <h2 class="section-title">Einkaufsideen <span class="count">noch offen</span></h2>
        ${groups.map((g) => html`
          <h3 class="section-title pv-eq-group">${PRIORITY_INFO[g.priority].icon} ${PRIORITY_LABEL[g.priority]} <span class="num">${euro(budgetSum(g.items))}</span></h3>
          <p class="text-sm muted" style="margin-top:calc(-1 * var(--s-2))">${PRIORITY_INFO[g.priority].text}</p>
          ${g.items.map((it) => {
            const range = parsePriceRange(it.priceEur);
            const extra = range && String(it.priceEur).replace(/\s/g, '') !== `${range[0]}–${range[1]}` && String(it.priceEur).trim() !== String(range[0]);
            const ids = itemEquipment(it);
            return html`<section class="card pv-eq">
              <div class="pv-eq__head">
                <span class="pv-eq-icon" aria-hidden="true">${EQUIPMENT_INFO[ids[0]]?.icon ?? '🛒'}</span>
                <div class="grow"><h3 class="card__title">${it.name ?? it.label ?? it.id}</h3></div>
                ${range ? html`<span class="pv-eq__price">${euro(range)}${extra ? html`<small>${it.priceEur} €</small>` : ''}</span>` : ''}
              </div>
              ${!open.has(it.id) ? html`${it.why || it.description ? html`<p class="pv-eq__why pv-eq__why--short">${it.why ?? it.description}</p>` : ''}
                <button class="btn btn--ghost btn--sm" data-more="${it.id}">Mehr dazu</button>` : html`
                ${it.why || it.description ? html`<p class="pv-eq__why">${it.why ?? it.description}</p>` : ''}
                ${(it.enables || []).length ? html`<div><p class="eyebrow mb-2">Damit möglich</p><div class="chip-row">${it.enables.map((x) => html`<span class="chip chip--sm chip--accent">${x}</span>`)}</div></div>` : ''}
                ${it.tips ? html`<details class="disclosure mt-2 mb-0"><summary>💡 Kauftipps</summary><p class="text-sm">${it.tips}</p></details>` : ''}`}
              ${ids.length ? html`<button class="btn btn--soft btn--sm mt-2" data-own-item="${it.id}">${raw(ICON.check)} Hab ich</button>` : ''}
            </section>`;
          })}`)}` : html`<div class="pv-callout pv-callout--knee"><span class="pv-callout__icon" aria-hidden="true">🎉</span><p class="text-sm">Alles aus der Einkaufsliste ist abgehakt.</p></div>`}

      ${ownedItems.length ? html`<p class="text-sm muted">Abgehakt aus der Liste: ${ownedItems.map((it) => it.name ?? it.id).join(' · ')}</p>` : ''}
      ${content.equipment?.note ? html`<details class="disclosure"><summary>Hinweise zur Einkaufsliste</summary><p class="text-sm muted">${content.equipment.note}</p></details>` : ''}
      ${content.equipment?.updated ? html`<p class="pv-version">Preise Stand ${content.equipment.updated} · Richtwerte, keine Werbung</p>` : ''}
    `);
  };

  /** Apply a change to the owned list, then report what it changes in the current phase's plans. */
  const setOwned = (mutate, label, removedFirst = false) => {
    const before = safeData(store.get());
    const next = new Set(normalizeOwned(before.settings.ownedEquipment));
    mutate(next);
    const list = normalizeOwned([...next]);
    const after = { ...before.settings, ownedEquipment: list };
    let diff = { added: [], removed: [] };
    try { diff = equipmentPlanChanges(before.state, content, before.settings, after); } catch (err) { console.warn('Plan-Vergleich fehlgeschlagen', err); }
    lastChange = { ...diff, label, removedFirst };
    store.update((d) => { d.settings.ownedEquipment = list; });
    toast(changeText(diff, { removedFirst }), { icon: '🎒', kind: diff.added.length || diff.removed.length ? 'accent' : 'success', ms: 5200 });
  };

  const onChange = (e) => {
    const t = e.target.closest?.('[data-own-eq]');
    if (!t) return;
    const id = t.dataset.ownEq;
    const on = t.checked;
    setOwned((set) => { if (on) set.add(id); else set.delete(id); }, `${EQUIPMENT_INFO[id]?.label ?? id} ${on ? 'abgehakt' : 'entfernt'}`, !on);
  };

  const onClick = (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { open.add(more.dataset.more); draw(); return; }
    const b = e.target.closest('[data-own-item]');
    if (!b) return;
    const it = items.find((x) => x.id === b.dataset.ownItem);
    if (!it) return;
    setOwned((set) => { for (const id of itemEquipment(it)) set.add(id); }, `${it.name ?? it.id} abgehakt`);
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  const unsub = store.subscribe(draw);
  return () => { unsub(); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
}
