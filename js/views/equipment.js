// Ausrüstung – optional data/equipment.json (see docs/SPEC.md §6.6).
import { html, raw, render as paint } from '../render.js';
import {
  ICON, ensureViewStyles, applyFontScale, pageHeader, equipmentItems, normPriority, PRIORITY_ORDER, PRIORITY_LABEL,
  budgetSum, parsePriceRange, toast,
} from './ui.js';

export const title = 'Ausrüstung';

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

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { content, store }) {
  ensureViewStyles();
  const items = equipmentItems(content.equipment);
  const open = new Set();

  const draw = () => {
    const settings = store.getSettings();
    applyFontScale(settings);
    const owned = new Set(settings.ownedEquipment || []);
    const groups = groupByPriority(items);
    const missing = items.filter((it) => !owned.has(it.id));
    const mussMissing = missing.filter((it) => normPriority(it.priority) === 'muss');
    const allSum = budgetSum(items);
    const openSum = budgetSum(missing);
    const mussSum = budgetSum(mussMissing);
    const bandList = (kind) => settings.bands.filter((b) => b.kind === kind);

    paint(root, html`
      ${pageHeader({ title: 'Ausrüstung', eyebrow: 'Mehr', back: '#/mehr', backLabel: 'Zurück zu Mehr' })}

      <section class="card card--accent">
        <p class="hero__eyebrow">Dein Heim-Gym</p>
        <h2 class="hero__title">${items.length ? html`<span class="num">${owned.size}</span> von <span class="num">${items.length}</span> vorhanden` : 'Deine Ausrüstung'}</h2>
        <p class="muted mb-0">Mit wenig Budget mehr Möglichkeiten – Knie-schonend und bogen-spezifisch.</p>
        ${items.length ? html`<div class="pv-budget">
          <div><span class="pv-budget__v">${euro(mussSum)}</span><span class="pv-budget__k">Muss (offen)</span></div>
          <div><span class="pv-budget__v">${euro(openSum)}</span><span class="pv-budget__k">Alles offen</span></div>
          <div><span class="pv-budget__v">${euro(allSum)}</span><span class="pv-budget__k">Gesamt</span></div>
        </div>` : ''}
      </section>

      <h2 class="section-title">Deine Bänder <a href="#/mehr">Reihenfolge</a></h2>
      <section class="card">
        ${[['theraband', 'TheraBand'], ['loop', 'Loop-Bänder']].map(([k, t]) => bandList(k).length ? html`
          <p class="field__label mb-2">${t} <span class="muted text-xs">leicht → schwer</span></p>
          <div class="chip-row mb-4">${bandList(k).map((b) => html`<span class="chip chip--band" style="--band:${b.color}"><i class="chip__swatch"></i>${b.label}</span>`)}</div>` : '')}
        <p class="text-sm muted mb-0">Dazu: Matte, Stuhl, Stufe – mehr brauchst du für den Plan nicht.</p>
      </section>

      ${groups.map((g) => html`
        <h2 class="section-title">${PRIORITY_INFO[g.priority].icon} ${PRIORITY_LABEL[g.priority]} <span class="num">${euro(budgetSum(g.items))}</span></h2>
        <p class="text-sm muted" style="margin-top:calc(-1 * var(--s-2))">${PRIORITY_INFO[g.priority].text}</p>
        ${g.items.map((it) => {
          const has = owned.has(it.id);
          const range = parsePriceRange(it.priceEur);
          const extra = range && String(it.priceEur).replace(/\s/g, '') !== `${range[0]}–${range[1]}` && String(it.priceEur).trim() !== String(range[0]);
          return html`<section class="card pv-eq${has ? ' is-owned' : ''}">
            <div class="pv-eq__head">
              <button class="pv-eq__check" data-own="${it.id}" role="checkbox" aria-checked="${String(!!has)}" aria-label="${it.name ?? it.id}: vorhanden">${raw(ICON.check)}</button>
              <div class="grow">
                <h3 class="card__title">${it.name ?? it.label ?? it.id}</h3>
                ${has ? html`<span class="chip chip--green chip--sm mt-2">✓ Vorhanden</span>` : ''}
              </div>
              ${range ? html`<span class="pv-eq__price">${euro(range)}${extra ? html`<small>${it.priceEur} €</small>` : ''}</span>` : ''}
            </div>
            ${has && !open.has(it.id) ? html`<button class="btn btn--ghost btn--sm" data-more="${it.id}">Details anzeigen</button>` : html`
              ${it.why || it.description ? html`<p class="pv-eq__why">${it.why ?? it.description}</p>` : ''}
              ${(it.enables || []).length ? html`<div><p class="eyebrow mb-2">Damit möglich</p><div class="chip-row">${it.enables.map((x) => html`<span class="chip chip--sm chip--accent">${x}</span>`)}</div></div>` : ''}
              ${it.tips ? html`<details class="disclosure mt-2 mb-0"><summary>💡 Kauftipps</summary><p class="text-sm">${it.tips}</p></details>` : ''}`}
          </section>`;
        })}`)}

      ${content.equipment?.note ? html`<p class="text-sm muted">${content.equipment.note}</p>` : ''}
      ${content.equipment?.updated ? html`<p class="pv-version">Preise Stand ${content.equipment.updated} · Richtwerte, keine Werbung</p>` : ''}
    `);
  };

  const onClick = (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { open.add(more.dataset.more); draw(); return; }
    const b = e.target.closest('[data-own]');
    if (!b) return;
    const id = b.dataset.own;
    let nowOwned = false;
    store.update((d) => {
      const set = new Set(d.settings.ownedEquipment || []);
      if (set.has(id)) set.delete(id); else { set.add(id); nowOwned = true; }
      d.settings.ownedEquipment = [...set];
    });
    if (nowOwned) toast('Abgehakt – viel Spaß damit!', { icon: '🎒' });
  };

  draw();
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(draw);
  return () => { unsub(); root.removeEventListener('click', onClick); };
}
