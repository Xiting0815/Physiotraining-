// Folgetag-Check – see docs/SPEC.md §4.2 step 6, §5.1 (WP-Session-flow).
// Next-day check-in for the most recent done session without `nextDay` → finalizeWithNextDay
// (final light), updated recommendations (accept/dismiss), +XP.nextDayCheckIn, encouraging message.
// v2: rowing (cardio) sessions get the same knee check; post-op sessions also ask redness + fever
// and show „Arzt kontaktieren“ prominently when the final light says so (SPEC §12.10).
import { html, raw, render as paint } from '../render.js';
import { LIGHT_LABELS } from '../logic/traffic-light.js';
import { formatDE } from '../util/date.js';
import { confetti } from '../components/celebrate.js';
import * as H from './session-helpers.js';
import { XP } from '../logic/motivation.js';

export const title = 'Folgetag-Check';

const MESSAGES = {
  green: { icon: '🎯', title: 'Top erholt!', text: 'Dein Knie hat das Training gut weggesteckt. Genau so baut man Belastbarkeit auf.' },
  yellow: { icon: '🧭', title: 'Gut, dass du hinhörst.', text: 'Stufe halten und sauber weitertrainieren – Qualität vor Quantität.' },
  red: { icon: '🌱', title: 'Danke für deine Ehrlichkeit.', text: 'Nächstes Mal etwas leichter – so geht es sicher voran. Rückschritte gehören dazu.' },
  stop: { icon: '🩺', title: 'Bitte abklären lassen.', text: 'Lass das Knie ärztlich oder physiotherapeutisch anschauen. Oberkörper-Training bleibt möglich – du entscheidest.' },
  doctor: { icon: '🩺', title: 'Bitte Arzt kontaktieren.', text: 'In der Entlastungsphase sind das Warnzeichen. Bitte melde dich heute noch bei deinem Arzt bzw. in der Klinik – bei hohem Fieber oder starken Beschwerden sofort.' },
};

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, navigate }) {
  H.ensureStyles();
  const draft = { pain: null, swelling: 0, stiffness: 0, nightPain: false, locking: false, givingWay: false };
  let draftFor = null; // session id the draft belongs to (post-op flags are added per session)
  let actions = {};
  let resultFor = null; // session id after submit

  const onClick = (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.('[data-act]');
    if (!b || !root.contains(b)) return;
    actions[b.dataset.act]?.(b);
  };
  const onChange = (e) => {
    const t = /** @type {any} */ (e.target);
    if (t.tagName === 'PT-PAIN-SCALE') draft.pain = e.detail?.value ?? t.value;
    else if (t.name === 'nd-swelling') draft.swelling = Number(t.value);
    else if (t.name === 'nd-stiffness') draft.stiffness = Number(t.value);
    else if (t.dataset?.f) draft[t.dataset.f] = t.checked;
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);

  const header = (sub) => html`<header class="page-header page-header--back">
      <a class="btn btn--icon btn--outline" href="#/heute" aria-label="Zurück zu Heute">${raw(BACK)}</a>
      <div><p class="eyebrow">${sub}</p><h1 class="page-header__title" style="font-size:var(--fs-2xl)">Folgetag-Check</h1></div>
    </header>`;

  const seg = (name, labels, value, label) => html`<div class="segmented" role="radiogroup" aria-label="${label}">
      ${labels.map((l, i) => html`<label><input type="radio" name="${name}" value="${i}" ${i === value ? 'checked' : ''}><span>${l}</span></label>`)}</div>`;
  const check = (key, label) => html`<label class="check-row"><input type="checkbox" data-f="${key}" ${draft[key] ? 'checked' : ''}> <span>${label}</span></label>`;

  function drawForm() {
    const p = H.pendingNextDay(store.getSessions(), new Date());
    if (!p) {
      document.body.classList.remove('has-cta');
      paint(root, html`${header('Heute')}
        <section class="card"><div class="empty">
          <div class="empty__art" aria-hidden="true" style="font-size:44px">🌤️</div>
          <h2 class="empty__title">Alles erledigt</h2>
          <p class="empty__text">Gerade ist kein Folgetag-Check offen. Nach deinem nächsten Training fragen wir am Tag danach kurz nach.</p>
          <a class="btn btn--primary" href="#/heute">Zu Heute</a>
        </div></section>`);
      actions = {};
      return;
    }
    const s = p.session;
    const postOp = !!s.postOp;
    const cardio = H.sessionKind(s) === 'cardio';
    if (draftFor !== s.id) {
      draftFor = s.id;
      delete draft.redness; delete draft.fever;
      Object.assign(draft, H.withPostOpFlags({}, postOp));
    }
    const t = H.sessionTitle(s, content, store.getState());
    const phase = content.phases.find((x) => x.id === s.phaseId);
    const day = formatDE(H.sessionDay(s));
    const dueTime = new Date(p.dueAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const prov = s.traffic?.provisional;
    paint(root, html`${header(`${cardio ? '🚣 ' : ''}${t.title} · ${day}`)}
      <h2 class="ses-big-q">Wie geht’s dem Knie heute?</h2>
      <p class="muted">Dauert 30 Sekunden und macht die Ampel ${cardio ? 'deiner letzten Rudereinheit' : 'deiner letzten Einheit'} final.${prov ? html` Vorläufig: <span class="traffic traffic--${prov}">${LIGHT_LABELS[prov]}</span>` : ''}</p>
      ${p.due ? '' : html`<div class="banner"><span class="banner__icon">⏳</span><span class="banner__body"><span class="banner__title">Eigentlich erst ab ${dueTime} Uhr</span><span class="banner__text">Am aussagekräftigsten am Morgen danach – eintragen geht trotzdem.</span></span></div>`}
      <section class="card stack">
        <pt-pain-scale label="Schmerz heute" ${draft.pain != null ? html`value="${draft.pain}"` : ''}></pt-pain-scale>
        <p class="text-xs muted mb-0">Vor dem Training warst du bei <strong class="num">${s.pre?.pain ?? 0}/10</strong>.</p>
        <div class="ses-field"><span class="field__label">Schwellung</span>${seg('nd-swelling', H.SWELLING_LABELS, draft.swelling, 'Schwellung')}</div>
        <div class="ses-field"><span class="field__label">Steifigkeit</span>${seg('nd-stiffness', H.SWELLING_LABELS, draft.stiffness, 'Steifigkeit')}</div>
      </section>
      <section class="card ses-check">
        <p class="field__label mb-2">Seit gestern …</p>
        ${check('nightPain', 'Nachtschmerz')}
        ${check('locking', 'Knie blockiert oder hakt')}
        ${check('givingWay', 'Knie knickt weg oder gibt nach')}
        ${postOp ? html`${check('redness', 'Rötung oder Überwärmung am Knie')}${check('fever', 'Fieber (über 38 °C)')}` : ''}
      </section>
      ${postOp && phase?.redFlagNote ? html`<p class="ses-postop">🩺 ${phase.redFlagNote}</p>` : ''}
      <div class="sticky-cta"><button type="button" class="btn btn--primary btn--block btn--session" data-act="submit">Check abschließen · +${XP.nextDayCheckIn} XP</button></div>`);
    document.body.classList.add('has-cta');
    actions = {
      submit: () => {
        if (draft.pain == null) {
          const el = root.querySelector('pt-pain-scale');
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el?.classList.remove('ses-shake'); void el?.offsetWidth; el?.classList.add('ses-shake');
          H.toast('Bitte „Schmerz heute“ wählen.', { icon: '👉', kind: 'accent' });
          return;
        }
        const out = H.applyNextDay(store.get(), s.id, { ...draft }, content);
        if (!out) return;
        store.update(() => out.data);
        resultFor = s.id;
        drawResult(out);
        window.scrollTo(0, 0);
      },
    };
  }

  function drawResult(out) {
    const s = store.getSessions().find((x) => x.id === resultFor);
    if (!s) return drawForm();
    const light = s.traffic?.final ?? out?.result?.traffic ?? 'green';
    const doctor = light === 'stop' && H.needsDoctor(s.traffic?.reasons);
    const m = doctor ? MESSAGES.doctor : MESSAGES[light];
    const badges = (out?.badges || []).map((id) => content.badges.find((b) => b.id === id)).filter(Boolean);
    paint(root, html`${header('Ergebnis')}
      <section class="card ses-nd-result ${doctor ? 'stop-card ses-doctor' : ''}" ${doctor ? raw('role="alert"') : ''}>
        <div style="font-size:52px;line-height:1" aria-hidden="true">${m.icon}</div>
        <h2 class="summary-head__title mt-2" style="font-size:var(--fs-2xl)">${m.title}</h2>
        <p class="muted">${m.text}</p>
        <span class="traffic traffic--${light} traffic--lg">${LIGHT_LABELS[light]}</span>
        <p class="text-xs muted mt-2">Finale Ampel</p>
        ${out ? html`<p class="mt-2 mb-0"><span class="xp-gain" style="font-size:var(--fs-xl)">+${out.xpGained} XP</span></p>` : ''}
      </section>
      <section class="card">
        <h3 class="card__title">Begründung</h3>
        <ul class="ses-reasons mb-0">${(s.traffic?.reasons || []).map((r) => html`<li>${r}</li>`)}</ul>
      </section>
      ${badges.length ? html`<h2 class="section-title">Neue Abzeichen</h2><ul class="ses-badges">${badges.map((b) => html`<li class="badge-tile is-unlocked is-new"><span class="badge-tile__icon">${b.icon}</span><span class="badge-tile__name">${b.name}</span><span class="badge-tile__hint">heute</span></li>`)}</ul>` : ''}
      <h2 class="section-title">Empfehlungen</h2>
      <div class="stack stack--sm" data-slot="recs">${H.recCardsHtml(s, content)}</div>
      <div class="sticky-cta"><button type="button" class="btn btn--primary btn--block btn--session" data-act="home">Zurück zu Heute</button></div>`);
    document.body.classList.add('has-cta');
    const decide = (b, accept) => {
      const i = Number(b.dataset.i);
      const d = H.decideRecommendation(store.get(), s.id, i, accept);
      store.update(() => d);
      const fresh = store.getSessions().find((x) => x.id === s.id);
      paint(root.querySelector('[data-slot="recs"]'), H.recCardsHtml(fresh, content));
      if (accept && fresh?.recommendations?.[i]?.action !== 'consult') H.toast('Übernommen', { icon: '✓' });
    };
    actions = {
      home: () => navigate('/heute'),
      'rec-accept': (b) => decide(b, true),
      'rec-dismiss': (b) => decide(b, false),
    };
    if (out && light === 'green') setTimeout(() => confetti({ particles: 90 }), 250);
    if (out && badges.length) H.toast(`Neues Abzeichen: ${badges[0].name}`, { icon: badges[0].icon, kind: 'gold', ms: 3200 });
  }

  drawForm();
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    document.body.classList.remove('has-cta');
  };
}
