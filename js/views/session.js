// Training session flow – see docs/SPEC.md §4.2 (WP-Session-flow).
// Steps: pre-check → exercises (warmup → knee → archery → cooldown) → post-check → summary.
// The active session lives in store.state.activeSession and is persisted after every tap
// (cursor {index, set, step}); reloading #/session resumes it. Summary: #/session?summary=<id>.
import { html, raw, render as paint } from '../render.js';
import { nextWorkout, buildSessionPlan } from '../logic/progression.js';
import { taperActive, LIGHT_LABELS } from '../logic/traffic-light.js';
import { sessionScore, LEVELS } from '../logic/motivation.js';
import { todayISO, formatDuration } from '../util/date.js';
import { unlock } from '../util/audio.js';
import { targetFace, confetti } from '../components/celebrate.js';
import { xpBar } from '../components/charts.js';
import * as H from './session-helpers.js';

export const title = 'Training';

const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  check: '<svg class="set-check__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M4 6h16M4 18h10"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg>',
};

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const LONG_PRESS_MS = 550;

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, ctx) {
  H.ensureStyles();
  const { store, content, query, navigate } = ctx;
  const settings = () => store.getSettings();
  const exById = (id) => content.exercises.find((e) => e.id === id);
  const workoutOf = (s) => content.workouts.find((w) => w.id === s?.workoutId);

  /** @type {any} working copy of the active session */
  let session = null;
  let saved = false;         // activeSession exists in the store
  let leaving = false;
  let disposed = false; // view left (route change) – no more dialogs
  let actions = {};          // data-act → handler, per screen
  let onChange = () => {};   // change events, per screen
  let screen = {};           // per-screen transient state (timers, nudges)

  const persist = () => {
    if (!session) return;
    saved = true;
    const copy = clone(session);
    store.update((d) => { d.state.activeSession = copy; });
  };
  const setCta = (on) => document.body.classList.toggle('has-cta', on);
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  const smooth = (el) => el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });

  // ------------------------------------------------------------------ delegation
  const onClick = (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.('[data-act]');
    if (!b || !root.contains(b) || b.closest('pt-timer')) return;
    const fn = actions[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b, e); }
  };
  const onChangeEvt = (e) => onChange(e);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChangeEvt);
  root.addEventListener('input', onChangeEvt);

  // ------------------------------------------------------------------ shared markup
  const topBar = (eyebrow, strong, { menu = true, xp = true } = {}) => html`
    <header class="ses-top">
      ${menu ? html`<button type="button" class="btn btn--icon" data-act="menu" aria-label="Pausieren oder abbrechen">${raw(ICON.close)}</button>` : ''}
      <div class="ses-top__title"><span class="eyebrow truncate">${eyebrow}</span><strong>${strong}</strong></div>
      ${xp ? html`<span class="chip chip--gold ses-xp" title="XP in dieser Einheit">⚡ <span class="num" data-xp>${H.liveXp(session, settings())}</span> XP</span>` : ''}
    </header>`;

  const progressBar = (cur, step) => {
    const list = session.exercises;
    const visible = list.filter(H.isVisible).length;
    const spans = list.map((e, i) => {
      const c = [];
      if (e.section === 'archery') c.push('is-archery');
      else if (e.section !== 'knee') c.push('is-neutral');
      if (i > 0 && list[i - 1].section !== e.section) c.push('ses-gap');
      if (!H.isVisible(e)) c.push('is-skipped');
      else if (i === cur && step === 'exercise') c.push('is-current');
      else if (step === 'post' || i < cur || H.doneCount(e) >= (e.plannedSets ?? 1)) c.push('is-done');
      return html`<span class="${c.join(' ')}"></span>`;
    });
    const pos = step === 'post' ? visible : H.positionOf(session, cur).pos;
    return html`<div class="session-progress" role="progressbar" aria-label="Fortschritt der Einheit" aria-valuemin="0" aria-valuemax="${visible}" aria-valuenow="${pos}">${spans}</div>`;
  };

  const segmented = (name, value, label) => html`
    <div class="segmented" role="radiogroup" aria-label="${label}">
      ${H.SWELLING_LABELS.map((l, i) => html`<label><input type="radio" name="${name}" value="${i}" ${i === value ? 'checked' : ''}><span>${l}</span></label>`)}
    </div>`;

  const checkRow = (key, label, checked, hint = '') => html`
    <label class="check-row"><input type="checkbox" data-f="${key}" ${checked ? 'checked' : ''}> <span>${label}${hint ? html`<br><small class="muted">${hint}</small>` : ''}</span></label>`;

  const nudge = (el, msg) => {
    if (!el) return;
    el.hidden = false;
    smooth(el);
    el.classList.remove('ses-shake');
    void el.offsetWidth;
    el.classList.add('ses-shake');
    if (msg) H.toast(msg, { icon: '👉', kind: 'accent' });
  };

  const bumpXp = () => {
    const chip = root.querySelector('.ses-xp');
    const n = root.querySelector('[data-xp]');
    if (n) n.textContent = String(H.liveXp(session, settings()));
    if (!chip) return;
    chip.classList.add('is-bump');
    setTimeout(() => chip.classList.remove('is-bump'), 240);
  };

  // ------------------------------------------------------------------ menu (pause / abort)
  async function openMenu() {
    const choice = await H.openDialog(String(html`
      <div class="sheet__handle"></div>
      <h2 class="sheet__title">Kurz durchatmen?</h2>
      <p class="muted">Dein Fortschritt ist gespeichert. Du kannst jederzeit genau hier weitermachen.</p>
      <div class="sheet__actions">
        <button type="button" class="btn btn--primary btn--block btn--session" data-value="resume">Weiter trainieren</button>
        <button type="button" class="btn btn--outline btn--block btn--session" data-value="pause">Pausieren &amp; später fortsetzen</button>
        <button type="button" class="btn btn--danger btn--block" data-value="abort">Training abbrechen</button>
      </div>`), { className: 'sheet ses-dlg' });
    if (choice === 'pause') {
      if (saved) { session.pausedAt = new Date().toISOString(); persist(); }
      leaving = true;
      H.toast(saved ? 'Pausiert – auf „Heute“ geht’s weiter.' : 'Bis gleich!', { icon: '⏸', kind: '' });
      navigate('/heute');
    } else if (choice === 'abort') {
      const sure = !saved ? 'yes' : await H.openDialog(String(html`
        <h2 class="modal__title">Training abbrechen?</h2>
        <p class="muted">Diese Einheit wird nicht gespeichert. Pausieren behält deinen Fortschritt.</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--danger btn--block btn--session" data-value="yes">Ja, abbrechen</button>
          <button type="button" class="btn btn--outline btn--block btn--session" data-value="no">Zurück</button>
        </div>`), { className: 'modal modal--center ses-dlg' });
      if (sure !== 'yes') return;
      leaving = true;
      session = null;
      if (saved) store.update((d) => { d.state.activeSession = null; });
      navigate('/heute');
    }
  }

  // ------------------------------------------------------------------ 1+2. start & pre-check
  function renderPre() {
    const w = workoutOf(session);
    const phase = content.phases.find((p) => p.id === session.phaseId);
    const draft = screen.pre = session.pre ? clone(session.pre) : (screen.pre || {
      pain: null, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false,
    });
    const vis = session.exercises.filter(H.isVisible);
    const count = (sec) => vis.filter((e) => e.section === sec).length;
    paint(root, html`
      ${topBar(w?.name ?? 'Training', 'Vor dem Training', { xp: false })}
      <section class="card card--hero ses-intro">
        <div class="hero__row">
          <div>
            <p class="hero__eyebrow">${phase?.name ?? ''}</p>
            <h1 class="hero__title">${w?.name ?? 'Training'}</h1>
          </div>
        </div>
        <p class="hero__meta">
          <span>${raw(ICON.clock)}ca. ${w?.durationMin ?? 40} Min</span>
          <span>${raw(ICON.list)}${vis.length} Übungen</span>
        </p>
        <div class="hero__split" aria-hidden="true">
          <span style="flex:${count('warmup') || 0.5}"></span><span class="is-knee" style="flex:${count('knee') || 0.01}"></span><span class="is-archery" style="flex:${count('archery') || 0.01}"></span><span style="flex:${count('cooldown') || 0.5}"></span>
        </div>
      </section>
      ${session.taper ? html`<div class="banner banner--accent"><span class="banner__icon">🗓️</span><span class="banner__body"><span class="banner__title">OP-Woche</span><span class="banner__text">Weniger Umfang, gleiche Qualität.</span></span></div>` : ''}
      <h2 class="ses-big-q">Wie geht’s dem Knie gerade?</h2>
      <p class="muted">Kurzer Check vor dem Start – ehrliche Antworten machen die Empfehlungen gut.</p>
      <section class="card stack">
        <pt-pain-scale label="Schmerz jetzt" data-f="pain" ${draft.pain != null ? html`value="${draft.pain}"` : ''}></pt-pain-scale>
        <div class="ses-field"><span class="field__label">Schwellung</span>${segmented('pre-swelling', draft.swelling, 'Schwellung')}</div>
      </section>
      <section class="card ses-check">
        <p class="field__label mb-2">Seit dem letzten Training …</p>
        ${checkRow('locking', 'Knie blockiert oder hakt', draft.mechanical.locking)}
        ${checkRow('givingWay', 'Knie knickt weg oder gibt nach', draft.mechanical.givingWay)}
        ${checkRow('nightPain', 'Nachtschmerz', draft.nightPain)}
        ${checkRow('swellingOver48h', 'Schwellung seit mehr als 48 h', draft.swellingOver48h)}
      </section>
      <div data-slot="stop"></div>
      <div class="sticky-cta" data-slot="cta"><button type="button" class="btn btn--primary btn--block btn--session" data-act="pre-go">Los geht’s</button></div>
    `);
    setCta(true);

    onChange = (e) => {
      const t = /** @type {any} */ (e.target);
      if (e.type === 'input') return;
      if (t.tagName === 'PT-PAIN-SCALE' && t.dataset.f === 'pain') draft.pain = e.detail?.value ?? t.value;
      else if (t.name === 'pre-swelling') draft.swelling = Number(t.value);
      else if (t.dataset?.f === 'locking') draft.mechanical.locking = t.checked;
      else if (t.dataset?.f === 'givingWay') draft.mechanical.givingWay = t.checked;
      else if (t.dataset?.f === 'nightPain') draft.nightPain = t.checked;
      else if (t.dataset?.f === 'swellingOver48h') draft.swellingOver48h = t.checked;
      else return;
      if (session.pre) { session.pre = clone(draft); persist(); }
    };

    actions = {
      menu: openMenu,
      'pre-go': () => {
        if (draft.pain == null) { nudge(root.querySelector('pt-pain-scale'), 'Bitte zuerst „Schmerz jetzt“ wählen.'); return; }
        unlock();
        session.pre = clone(draft);
        persist();
        const a = H.assessPreCheck(session.pre, settings(), store.getSessions());
        if (a.showCard) showStopCard(a);
        else startExercises();
      },
      upper: () => { H.applyUpperBodyOnly(session, content); H.toast('Oberkörper-Einheit – das Knie hat Pause.', { icon: '🏹', kind: 'accent' }); startExercises(); },
      lighter: () => { H.applyLighterVariants(session, content); H.toast('Knie-Übungen eine Stufe leichter.', { icon: '🪶', kind: '' }); startExercises(); },
      'as-planned': () => startExercises(),
      'pause-today': () => {
        leaving = true;
        session = null;
        store.update((d) => { d.state.activeSession = null; });
        H.toast('Gute Entscheidung. Gönn dem Knie Ruhe – bis bald!', { icon: '💚', kind: 'success', ms: 3200 });
        navigate('/heute');
      },
    };
    // resumed after the pre-check was answered → show the decision again
    if (session.pre) {
      const a = H.assessPreCheck(session.pre, settings(), store.getSessions().filter((s) => s.id !== session.id));
      if (a.showCard) showStopCard(a, false);
    }
  }

  function showStopCard(a, scroll = true) {
    const stop = a.light === 'stop';
    const hasUpper = session.exercises.some((e) => !H.isKneeEntry(e, content));
    const slot = root.querySelector('[data-slot="stop"]');
    paint(slot, html`
      <section class="card stop-card" role="alert">
        <span class="traffic traffic--${a.light}">${LIGHT_LABELS[a.light]}</span>
        <h2 class="card__title mt-2">${stop ? 'Heute lieber pausieren und Rücksprache halten' : 'Heute schonend trainieren'}</h2>
        <ul class="ses-reasons">${a.reasons.map((r) => html`<li>${r}</li>`)}</ul>
        ${stop ? html`<p class="ses-consult">Bitte lass das Knie ärztlich oder physiotherapeutisch abklären, bevor du es wieder belastest. Oberkörper geht trotzdem – du entscheidest.</p>`
          : html`<p class="muted mb-0">Dein Knie meldet sich. Wähle, wie du heute trainieren möchtest.</p>`}
        <div class="ses-choices">
          ${hasUpper ? html`<button type="button" class="btn btn--accent btn--block" data-act="upper"><span aria-hidden="true">🏹</span><span>Nur Oberkörper (Bogen-Block)<small>Knie-Übungen werden heute ausgelassen</small></span></button>` : ''}
          <button type="button" class="btn btn--soft btn--block" data-act="lighter"><span aria-hidden="true">🪶</span><span>Leichtere Varianten<small>Knie-Übungen eine Stufe leichter</small></span></button>
          <button type="button" class="btn btn--outline btn--block" data-act="pause-today"><span aria-hidden="true">💚</span><span>Heute pausieren<small>Erholung ist auch Training</small></span></button>
          ${stop ? '' : html`<button type="button" class="btn btn--ghost btn--block" data-act="as-planned"><span aria-hidden="true">➜</span><span>Trotzdem wie geplant</span></button>`}
        </div>
      </section>`);
    const cta = root.querySelector('[data-slot="cta"]');
    if (cta) cta.remove();
    setCta(false);
    if (scroll) smooth(slot.firstElementChild);
  }

  function startExercises() {
    const i = H.firstIndex(session);
    session.cursor = i < 0 ? { index: 0, set: 0, step: 'post' } : { index: i, set: H.doneCount(session.exercises[i]), step: 'exercise' };
    persist();
    show();
    scrollTop();
  }

  // ------------------------------------------------------------------ 4. exercise screen
  function doseItems(dose) {
    const items = [[dose.sets, 'Sätze']];
    const side = dose.perSide ? ' / Seite' : '';
    if (dose.type === 'timed') items.push([dose.seconds >= 90 ? formatDuration(dose.seconds) : html`${dose.seconds}<small>s</small>`, `Dauer${side}`]);
    else if (dose.type === 'hold') {
      if ((dose.reps ?? 1) > 1) items.push([dose.reps, `Wdh.${side}`]);
      items.push([html`${dose.hold}<small>s</small>`, (dose.reps ?? 1) > 1 ? 'Halten' : `Halten${side}`]);
    } else items.push([dose.reps ?? '–', `Wdh.${side}`]);
    return html`<div class="dose">${items.map(([v, l]) => html`<div class="dose__item"><span class="dose__value">${v}</span><span class="dose__label">${l}</span></div>`)}</div>`;
  }

  function setButtons(entry, dose, archery) {
    const open = H.nextOpenSet(entry, dose.sets);
    const n = Math.max(dose.sets, (entry.sets || []).length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const done = !!entry.sets?.[i]?.done;
      out.push(html`<button type="button" class="set-check ${archery ? 'set-check--archery' : ''} ${i === open ? 'is-current' : ''}" data-act="set" data-set="${i}" aria-pressed="${String(done)}" aria-label="Satz ${i + 1}${done ? ' erledigt' : ''}"><span class="set-check__num">${i + 1}</span>${raw(ICON.check)}</button>`);
    }
    return out;
  }

  function timerMarkup(dose) {
    if (dose.type === 'hold') {
      const reps = (dose.reps ?? 1) * (dose.perSide ? 2 : 1);
      return html`<pt-timer mode="hold" seconds="${dose.hold ?? 10}" reps="${reps}" rest-between="${dose.perSide && (dose.reps ?? 1) === 1 ? 5 : dose.restBetween}" data-role="work"></pt-timer>
        <p class="ses-hint">${dose.perSide ? 'Seitenwechsel in der kurzen Pause. ' : ''}Der Satz wird nach dem Timer automatisch abgehakt.</p>`;
    }
    if (dose.type === 'timed') {
      if (dose.perSide) {
        return html`<pt-timer mode="hold" seconds="${dose.seconds ?? 30}" reps="2" rest-between="5" data-role="work"></pt-timer>
          <p class="ses-hint">Wdh. 1 = erste Seite, Wdh. 2 = zweite Seite. Satz wird danach automatisch abgehakt.</p>`;
      }
      return html`<pt-timer mode="set" seconds="${dose.seconds ?? 30}" data-role="work"></pt-timer>
        <p class="ses-hint">Der Satz wird nach dem Timer automatisch abgehakt.</p>`;
    }
    if (dose.tempo) {
      return html`<div data-slot="tempo"><button type="button" class="btn btn--soft btn--block btn--session" data-act="tempo">Tempo-Coach · ${dose.tempo}</button>
        <p class="ses-hint">Optional: zählt die Wiederholungen im Takt (Nachgeben–Halten–Anspannen).</p></div>`;
    }
    return '';
  }

  function renderExercise() {
    const idx = session.cursor.index;
    const entry = session.exercises[idx];
    const ex = entry && exById(entry.exerciseId);
    if (!entry || !ex) { // unknown content → skip forward
      const n = H.nextIndex(session, idx);
      session.cursor = n < 0 ? { index: idx, set: 0, step: 'post' } : { index: n, set: 0, step: 'exercise' };
      return show();
    }
    const w = workoutOf(session);
    const dose = H.doseFor(entry, ex, settings());
    const sec = entry.section;
    const knee = sec === 'knee';
    const archery = sec === 'archery';
    const pos = H.positionOf(session, idx);
    const band = H.bandInfo(settings(), dose.band);
    const prev = H.prevIndex(session, idx);
    const next = H.nextIndex(session, idx);
    const allDone = H.doneCount(entry) >= dose.sets;
    screen = { rpeNudged: false, pressTimer: 0, longPressed: false };
    const sideLabel = { left: 'Links (OP-Seite)', right: 'Rechts', perSide: 'Je Seite', alternate: 'Abwechselnd' }[dose.side];
    const timer = timerMarkup(dose);
    paint(root, html`
      ${topBar(w?.name ?? 'Training', `Übung ${pos.pos} von ${pos.total}`)}
      ${progressBar(idx, 'exercise')}
      <div class="row row--between">
        <div class="block-header block-header--${sec}" style="margin:0"><span class="block-header__dot"></span>${H.SECTION_LABELS[sec]}<span class="block-header__count">${pos.secPos}/${pos.secTotal}</span></div>
        <button type="button" class="btn btn--ghost btn--sm" data-act="overview">${raw(ICON.list)}Übersicht</button>
      </div>
      <section class="card ses-ex mt-4">
        <div class="ses-fig"><pt-figure aspect="1.5" exercise-id="${ex.id}" level="${entry.level ?? 0}" ${dose.band ? html`band-id="${dose.band}"` : ''} aria-label="${ex.name}"></pt-figure></div>
        <div class="row row--between row--top">
          <h1 class="card__title">${ex.name}</h1>
          <span class="chip chip--${archery ? 'archery' : 'knee'} chip--sm" style="flex:none">Stufe ${(entry.level ?? 0) + 1}/${ex.levels.length}</span>
        </div>
        <p class="ses-note">${dose.label}</p>
        ${entry.note ? html`<p class="ses-note">💡 ${entry.note}</p>` : ''}
        <div class="ses-meta">
          ${band ? html`<span class="chip chip--band" style="--band:${band.color}"><i class="chip__swatch"></i>${band.label}</span>` : ''}
          ${dose.tempo ? html`<span class="chip chip--outline">Tempo ${dose.tempo}</span>` : ''}
          ${sideLabel ? html`<span class="chip chip--outline">${sideLabel}</span>` : ''}
          ${dose.rest ? html`<span class="chip chip--outline">Pause ${dose.rest} s</span>` : ''}
          ${session.taper ? html`<span class="chip chip--accent">OP-Woche · weniger Sätze</span>` : ''}
          ${entry.lighter ? html`<span class="chip chip--green">Leichtere Variante</span>` : ''}
        </div>
        <div class="ses-dose mt-4">
          ${doseItems(dose)}
          <button type="button" class="ses-edit" data-act="adjust" aria-label="Vorgabe anpassen (Wdh., Halten, Band)">${raw(ICON.edit)}</button>
        </div>
        <div class="ses-sets"><div class="set-checks" role="group" aria-label="Sätze abhaken">${setButtons(entry, dose, archery)}</div></div>
        <p class="ses-hint">Tippen = Satz geschafft · gedrückt halten = anpassen</p>
        <div data-slot="done" class="mt-4" ${allDone ? '' : 'hidden'}><div class="ses-done"><span class="ses-done__icon">✓</span><span>Übung geschafft! ${archery ? 'Wie anstrengend war’s?' : knee ? 'Wie war das Knie?' : 'Weiter geht’s.'}</span></div></div>
      </section>
      <div data-slot="rest"></div>
      ${timer ? html`<section class="card ses-timer" data-slot="timer" ${allDone ? 'hidden' : ''}><p class="eyebrow center" data-setno>${allDone ? '' : `Satz ${Math.min(dose.sets, H.doneCount(entry) + 1)} von ${dose.sets}`}</p>${timer}</section>` : ''}
      ${knee ? html`<section class="card" data-slot="pain">
          <pt-pain-scale label="Schmerz während der Übung" data-f="painDuring" ${entry.painDuring != null ? html`value="${entry.painDuring}"` : ''}></pt-pain-scale>
          <button type="button" class="btn btn--danger btn--block ses-sharp" data-act="sharp" aria-pressed="${String(!!entry.sharpPain)}">⚡ Stechender Schmerz</button>
          <p class="text-sm muted mt-2 mb-0" data-sharp-note ${entry.sharpPain ? '' : 'hidden'}>Bei stechendem Schmerz die Übung beenden und mit der nächsten weitermachen. Das ist kluges Training, kein Aufgeben.</p>
        </section>` : ''}
      ${archery ? html`<section class="card" data-slot="rpe" ${allDone || entry.rpe != null ? '' : 'hidden'}>
          <pt-pain-scale kind="rpe" label="Anstrengung (RPE)" data-f="rpe" ${entry.rpe != null ? html`value="${entry.rpe}"` : ''}></pt-pain-scale>
          <p class="text-xs muted mt-2 mb-0">≤ 6 locker · 7–8 fordernd · ≥ 9 zu schwer</p>
        </section>` : ''}
      <details class="disclosure">
        <summary>Anleitung &amp; Tipps</summary>
        <div class="stack stack--sm">
          <ol class="steps">${(ex.instructions || []).map((s) => html`<li>${s}</li>`)}</ol>
          ${ex.cues?.length ? html`<p class="field__label mb-0 mt-2">Darauf achten</p><div class="chip-row">${ex.cues.map((c) => html`<span class="chip chip--${archery ? 'archery' : 'knee'}">${c}</span>`)}</div>` : ''}
          ${ex.mistakes?.length ? html`<p class="field__label mb-0 mt-2">Typische Fehler</p><ul class="ses-reasons">${ex.mistakes.map((m) => html`<li>${m}</li>`)}</ul>` : ''}
          ${ex.kneeNote ? html`<p class="ses-consult mb-0">🦵 ${ex.kneeNote}</p>` : ''}
        </div>
      </details>
      <button type="button" class="btn btn--ghost btn--block" data-act="skip">Übung überspringen</button>
      <div class="sticky-cta"><div class="ses-cta">
        <button type="button" class="btn btn--outline btn--prev" data-act="prev" aria-label="Vorherige Übung" ${prev < 0 ? 'disabled' : ''}>${raw(ICON.prev)}</button>
        <button type="button" class="btn btn--primary ${allDone ? 'ses-pulse' : ''}" data-act="next">${next < 0 ? 'Zum Abschluss' : 'Nächste Übung'} ${raw(ICON.next)}</button>
      </div></div>
    `);
    setCta(true);
    wireWorkTimer(entry, dose);
    wireLongPress(entry, dose);

    onChange = (e) => {
      const t = /** @type {any} */ (e.target);
      if (t.tagName !== 'PT-PAIN-SCALE' || e.type !== 'change') return;
      if (t.dataset.f === 'painDuring') { entry.painDuring = e.detail?.value ?? t.value; persist(); bumpXp(); }
      if (t.dataset.f === 'rpe') { entry.rpe = e.detail?.value ?? t.value; persist(); }
    };

    actions = {
      menu: openMenu,
      overview: openOverview,
      adjust: () => openAdjust(entry, ex, null),
      set: (b) => {
        if (screen.longPressed) { screen.longPressed = false; return; }
        const i = Number(b.dataset.set);
        if (entry.sets?.[i]?.done) {
          H.unmarkSet(entry, i);
          session.cursor.set = H.doneCount(entry);
          persist();
          refreshSets(entry, dose);
          H.toast(`Satz ${i + 1} zurückgenommen`, { icon: '↺', kind: '' });
          return;
        }
        completeSet(entry, dose, i, b);
      },
      tempo: (b) => {
        const slot = b.closest('[data-slot="tempo"]');
        paint(slot, html`<pt-timer mode="set" reps="${dose.reps ?? 10}" tempo="${dose.tempo}" data-role="work"></pt-timer>
          <p class="ses-hint">Folge dem Takt – der Satz wird danach abgehakt.</p>`);
        wireWorkTimer(entry, dose);
        root.querySelector('pt-timer[data-role="work"]')?.start();
      },
      sharp: (b) => {
        entry.sharpPain = !entry.sharpPain;
        b.setAttribute('aria-pressed', String(entry.sharpPain));
        const note = root.querySelector('[data-sharp-note]');
        if (note) note.hidden = !entry.sharpPain;
        persist();
        bumpXp();
      },
      skip: () => {
        if (H.doneCount(entry) === 0) entry.skipped = true;
        H.toast(H.doneCount(entry) ? 'Restliche Sätze ausgelassen' : 'Übung übersprungen', { icon: '↷', kind: '' });
        go(next, idx);
      },
      prev: () => { if (prev >= 0) go(prev, idx); },
      next: () => {
        const done = H.doneCount(entry);
        if (knee && done > 0 && entry.painDuring == null) {
          nudge(root.querySelector('[data-slot="pain"]'), 'Kurz eintragen: Schmerz während der Übung.');
          return;
        }
        if (archery && done > 0 && entry.rpe == null && !screen.rpeNudged) {
          screen.rpeNudged = true;
          nudge(root.querySelector('[data-slot="rpe"]'), 'Wie anstrengend war’s? (hilft bei der Stufen-Empfehlung)');
          return;
        }
        if (done === 0 && !entry.skipped) {
          entry.skipped = true;
          H.toast('Übung übersprungen', { icon: '↷', kind: '' });
        }
        go(next, idx);
      },
    };
  }

  function go(target, from) {
    if (target < 0) session.cursor = { index: from, set: 0, step: 'post' };
    else session.cursor = { index: target, set: H.doneCount(session.exercises[target]), step: 'exercise' };
    persist();
    show();
    scrollTop();
  }

  function refreshSets(entry, dose) {
    const archery = entry.section === 'archery';
    const wrap = root.querySelector('.set-checks');
    if (wrap) paint(wrap, html`${setButtons(entry, dose, archery)}`);
    const allDone = H.doneCount(entry) >= dose.sets;
    const doneSlot = root.querySelector('[data-slot="done"]');
    if (doneSlot) doneSlot.hidden = !allDone;
    const timer = root.querySelector('[data-slot="timer"]');
    if (timer && !screen.resting) timer.hidden = allDone;
    const no = root.querySelector('[data-setno]');
    if (no) no.textContent = allDone ? '' : `Satz ${H.doneCount(entry) + 1} von ${dose.sets}`;
    root.querySelector('[data-act="next"]')?.classList.toggle('ses-pulse', allDone);
    bumpXp();
  }

  function floatXp(btn, amount) {
    const host = root.querySelector('.ses-sets');
    if (!host || !btn) return;
    const el = document.createElement('span');
    el.className = 'xp-gain ses-float';
    el.textContent = `+${amount} XP`;
    el.style.left = `${btn.offsetLeft + btn.offsetWidth / 2}px`;
    el.style.top = `${btn.offsetTop - 18}px`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function completeSet(entry, dose, i, btn) {
    H.markSet(entry, i, H.setValues(dose));
    session.cursor.set = H.doneCount(entry);
    persist();
    refreshSets(entry, dose);
    floatXp(btn || root.querySelector(`.set-check[data-set="${i}"]`), H.setXp(entry, settings()));
    try { navigator.vibrate?.(30); } catch { /* ignore */ }
    const open = H.nextOpenSet(entry, dose.sets);
    if (open >= 0) startRest(entry, dose, open);
    else exerciseComplete(entry);
  }

  function exerciseComplete(entry) {
    stopRest();
    const timer = root.querySelector('[data-slot="timer"]');
    if (timer) timer.hidden = true;
    if (entry.section === 'archery') {
      const rpe = root.querySelector('[data-slot="rpe"]');
      if (rpe) { rpe.hidden = false; if (entry.rpe == null) setTimeout(() => smooth(rpe), 350); }
    } else if (entry.section === 'knee' && entry.painDuring == null) {
      setTimeout(() => smooth(root.querySelector('[data-slot="pain"]')), 350);
    } else {
      setTimeout(() => smooth(root.querySelector('[data-slot="done"]')), 250);
    }
  }

  function startRest(entry, dose, nextSet) {
    stopRest();
    if (!(dose.rest > 0)) { afterRest(); return; }
    const slot = root.querySelector('[data-slot="rest"]');
    if (!slot) return;
    screen.resting = true;
    const timerCard = root.querySelector('[data-slot="timer"]');
    if (timerCard) timerCard.hidden = true;
    paint(slot, html`<section class="card ses-rest">
      <p class="eyebrow">Satzpause · gleich Satz ${nextSet + 1} von ${dose.sets}</p>
      <pt-timer mode="rest" seconds="${dose.rest}" autostart data-role="rest"></pt-timer>
    </section>`);
    const t = slot.querySelector('pt-timer');
    t?.addEventListener('done', (e) => { if (e.target === t) afterRest(); });
    setTimeout(() => smooth(slot.firstElementChild), 120);
  }

  function stopRest() {
    screen.resting = false;
    const slot = root.querySelector('[data-slot="rest"]');
    if (slot) slot.innerHTML = '';
  }

  function afterRest() {
    const entry = session.exercises[session.cursor.index];
    const ex = exById(entry.exerciseId);
    const dose = H.doseFor(entry, ex, settings());
    stopRest();
    const timerCard = root.querySelector('[data-slot="timer"]');
    const allDone = H.doneCount(entry) >= dose.sets;
    if (timerCard) timerCard.hidden = allDone;
    const work = root.querySelector('pt-timer[data-role="work"]');
    if (work && !allDone && (dose.type === 'hold' || dose.type === 'timed')) {
      work.reset();
      work.start();
      smooth(timerCard);
    } else {
      smooth(root.querySelector('.set-check.is-current') || root.querySelector('.ses-ex'));
    }
  }

  function wireWorkTimer(entry, dose) {
    const t = root.querySelector('pt-timer[data-role="work"]');
    if (!t || t._sesWired) return;
    t._sesWired = true;
    t.addEventListener('done', (e) => {
      if (e.target !== t) return;
      const open = H.nextOpenSet(entry, dose.sets);
      if (open >= 0) completeSet(entry, dose, open);
    });
  }

  function wireLongPress(entry, dose) {
    const wrap = root.querySelector('.set-checks');
    if (!wrap) return;
    const clear = () => { clearTimeout(screen.pressTimer); screen.pressTimer = 0; };
    wrap.addEventListener('pointerdown', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('.set-check');
      if (!b) return;
      screen.longPressed = false;
      clear();
      screen.pressTimer = setTimeout(() => {
        screen.longPressed = true;
        try { navigator.vibrate?.(20); } catch { /* ignore */ }
        openAdjust(entry, exById(entry.exerciseId), Number(b.dataset.set));
      }, LONG_PRESS_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => wrap.addEventListener(ev, clear));
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------ adjust sheet
  async function openAdjust(entry, ex, setIdx) {
    const dose = H.doseFor(entry, ex, settings());
    const set = setIdx != null ? entry.sets?.[setIdx] : null;
    const isDone = !!set?.done;
    const vals = {
      reps: isDone && set.reps != null ? set.reps : dose.reps,
      hold: isDone && set.hold != null ? set.hold : dose.hold,
      seconds: isDone && set.seconds != null ? set.seconds : dose.seconds,
      band: isDone && 'band' in set ? set.band : dose.band,
    };
    const lvlBand = ex.levels?.[entry.level ?? 0]?.band ?? ex.levels?.find((l) => l.band)?.band ?? null;
    const usesBand = lvlBand != null || (ex.equipment || []).some((q) => q === 'theraband' || q === 'loop');
    const kind = String(lvlBand || '').startsWith('loop') || (ex.equipment || []).includes('loop') && !(ex.equipment || []).includes('theraband') ? 'loop' : 'theraband';
    const bands = (settings().bands || []).filter((b) => (b.kind || 'theraband') === kind);
    const stepper = (key, label, unit, step) => html`<div class="ses-adj"><span class="field__label">${label}</span>
      <div class="stepper stepper--session"><button type="button" class="stepper__btn" data-step="${key}" data-d="${-step}" aria-label="${label} weniger">${raw(ICON.minus)}</button>
      <output class="stepper__value" data-out="${key}">${vals[key]}</output><span class="stepper__unit">${unit}</span>
      <button type="button" class="stepper__btn" data-step="${key}" data-d="${step}" aria-label="${label} mehr">${raw(ICON.plus)}</button></div></div>`;
    const res = await H.openDialog(String(html`
      <div class="sheet__handle"></div>
      <h2 class="sheet__title">${isDone ? `Satz ${setIdx + 1} anpassen` : 'Vorgabe anpassen'}</h2>
      <p class="muted">${isDone ? 'Korrigiert diesen Satz und gilt für alle weiteren Sätze.' : 'Gilt für alle weiteren Sätze dieser Übung – nur heute.'}</p>
      ${dose.type !== 'timed' && vals.reps != null ? stepper('reps', 'Wiederholungen', '', 1) : ''}
      ${dose.type === 'hold' && vals.hold != null ? stepper('hold', 'Halten', 's', 5) : ''}
      ${dose.type === 'timed' && vals.seconds != null ? stepper('seconds', 'Dauer', 's', 5) : ''}
      ${usesBand ? html`<p class="field__label mt-4 mb-2">Band</p><div class="ses-band-pick" role="radiogroup" aria-label="Band">
        <button type="button" class="chip chip--filter" data-band="" aria-pressed="${String(vals.band == null)}">Ohne</button>
        ${bands.map((b) => html`<button type="button" class="chip chip--filter chip--band" style="--band:${b.color}" data-band="${b.id}" aria-pressed="${String(vals.band === b.id)}"><i class="chip__swatch"></i>${b.label}</button>`)}
      </div>` : ''}
      <div class="sheet__actions">
        <button type="button" class="btn btn--primary btn--block btn--session" data-value="ok">Übernehmen</button>
        <button type="button" class="btn btn--outline btn--block" data-value="cancel">Abbrechen</button>
      </div>`), {
      className: 'sheet ses-dlg',
      onOpen: (dlg) => dlg.addEventListener('click', (e) => {
        const s = /** @type {HTMLElement} */ (e.target).closest('[data-step]');
        if (s) {
          const k = s.dataset.step;
          const min = k === 'reps' ? 1 : 5;
          vals[k] = Math.max(min, Math.min(k === 'reps' ? 100 : 600, (vals[k] ?? min) + Number(s.dataset.d)));
          dlg.querySelector(`[data-out="${k}"]`).textContent = String(vals[k]);
          return;
        }
        const b = /** @type {HTMLElement} */ (e.target).closest('[data-band]');
        if (b) {
          vals.band = b.dataset.band || null;
          dlg.querySelectorAll('[data-band]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        }
      }),
    });
    if (res !== 'ok') return;
    const o = { ...(entry.override || {}) };
    if (dose.type !== 'timed' && vals.reps != null) o.reps = vals.reps;
    if (dose.type === 'hold' && vals.hold != null) o.hold = vals.hold;
    if (dose.type === 'timed' && vals.seconds != null) o.seconds = vals.seconds;
    if (usesBand) o.band = vals.band;
    entry.override = o;
    if (isDone) Object.assign(entry.sets[setIdx], H.setValues(H.doseFor(entry, ex, settings())));
    persist();
    H.toast('Angepasst', { icon: '✎', kind: '' });
    renderExercise();
  }

  // ------------------------------------------------------------------ overview sheet
  async function openOverview() {
    const cur = session.cursor.index;
    let lastSec = null;
    const rows = session.exercises.map((e, i) => {
      const ex = exById(e.exerciseId);
      const head = e.section !== lastSec ? html`<li><p class="section-title" style="margin:var(--s-3) 0 var(--s-1)">${H.SECTION_LABELS[e.section]}</p></li>` : '';
      lastSec = e.section;
      const d = H.doneCount(e);
      const status = !H.isVisible(e) ? 'heute ausgelassen' : e.skipped ? 'übersprungen' : `${d}/${e.plannedSets ?? 1} Sätze`;
      const icon = e.section === 'archery' ? '🏹' : e.section === 'knee' ? '🦵' : e.section === 'warmup' ? '🔥' : '🧘';
      return html`${head}<li><button type="button" class="list-item ${i === cur ? 'is-cur' : ''}" ${H.isVisible(e) ? html`data-value="${i}"` : 'disabled'} style="width:100%;text-align:left">
        <span class="list-item__icon ${e.section === 'archery' ? 'list-item__icon--accent' : e.section === 'knee' ? '' : 'list-item__icon--neutral'}">${d >= (e.plannedSets ?? 1) ? '✓' : icon}</span>
        <span class="list-item__body"><span class="list-item__title">${ex?.name ?? e.exerciseId}</span><span class="list-item__sub">${status}</span></span></button></li>`;
    });
    const v = await H.openDialog(String(html`<div class="sheet__handle"></div><h2 class="sheet__title">Übersicht</h2>
      <ul class="list ses-overview" style="max-height:60vh;overflow:auto">${rows}</ul>
      <div class="sheet__actions"><button type="button" class="btn btn--outline btn--block" data-value="close">Schließen</button></div>`), { className: 'sheet ses-dlg' });
    if (v != null && v !== 'close') go(Number(v), cur);
  }

  // ------------------------------------------------------------------ 5. post-check
  function renderPost() {
    const w = workoutOf(session);
    const draft = session.post ? clone(session.post) : {
      pain: null, swelling: session.pre?.swelling ?? 0, rpe: null, note: '', mechanical: { locking: false, givingWay: false },
    };
    const last = H.prevIndex(session, session.exercises.length);
    const tot = H.setTotals(session);
    paint(root, html`
      ${topBar(w?.name ?? 'Training', 'Nach dem Training')}
      ${progressBar(-1, 'post')}
      <h1 class="ses-big-q">Geschafft! 💪</h1>
      <p class="muted"><span class="num">${tot.done}</span> Sätze erledigt. Noch ein kurzer Check – dann gibt’s dein Trefferbild.</p>
      <section class="card stack">
        <pt-pain-scale label="Schmerz jetzt" data-f="pain" ${draft.pain != null ? html`value="${draft.pain}"` : ''}></pt-pain-scale>
        <div class="ses-field"><span class="field__label">Schwellung</span>${segmented('post-swelling', draft.swelling, 'Schwellung')}</div>
      </section>
      <section class="card">
        <pt-pain-scale kind="rpe" label="Anstrengung gesamt (RPE)" data-f="rpe" ${draft.rpe != null ? html`value="${draft.rpe}"` : ''}></pt-pain-scale>
      </section>
      <section class="card ses-check">
        <p class="field__label mb-2">Während des Trainings …</p>
        ${checkRow('locking', 'Knie hat blockiert', draft.mechanical?.locking)}
        ${checkRow('givingWay', 'Knie ist weggeknickt', draft.mechanical?.givingWay)}
      </section>
      <section class="card">
        <label class="field__label" for="ses-note">Notiz (optional)</label>
        <textarea id="ses-note" class="textarea mt-2" data-f="note" rows="3" placeholder="z. B. Band gewechselt, Knie fühlte sich warm an …">${draft.note || ''}</textarea>
      </section>
      <div class="sticky-cta"><div class="ses-cta">
        <button type="button" class="btn btn--outline btn--prev" data-act="prev" aria-label="Zurück zur letzten Übung" ${last < 0 ? 'disabled' : ''}>${raw(ICON.prev)}</button>
        <button type="button" class="btn btn--primary" data-act="finish">Training abschließen</button>
      </div></div>
    `);
    setCta(true);
    let noteT = 0;
    onChange = (e) => {
      const t = /** @type {any} */ (e.target);
      if (t.dataset?.f === 'note') {
        draft.note = t.value;
        session.post = clone(draft);
        clearTimeout(noteT);
        noteT = setTimeout(persist, 400);
        return;
      }
      if (e.type === 'input') return;
      if (t.tagName === 'PT-PAIN-SCALE') draft[t.dataset.f] = e.detail?.value ?? t.value;
      else if (t.name === 'post-swelling') draft.swelling = Number(t.value);
      else if (t.dataset?.f === 'locking' || t.dataset?.f === 'givingWay') draft.mechanical = { ...draft.mechanical, [t.dataset.f]: t.checked };
      else return;
      session.post = clone(draft);
      persist();
    };
    actions = {
      menu: openMenu,
      prev: () => { if (last >= 0) { session.post = clone(draft); go(last, last); } },
      finish: () => {
        if (draft.pain == null) { nudge(root.querySelector('pt-pain-scale'), 'Bitte noch „Schmerz jetzt“ wählen.'); return; }
        session.post = clone(draft);
        finish();
      },
    };
  }

  function finish() {
    const { data, session: s } = H.finishSession(store.get(), session, content);
    store.update(() => data);
    session = null;
    saved = false;
    history.replaceState(null, '', `#/session?summary=${encodeURIComponent(s.id)}`);
    renderSummary(s.id, true);
    scrollTop();
  }

  // ------------------------------------------------------------------ 6. summary
  function renderSummary(id, fresh = false) {
    const s = store.getSessions().find((x) => x.id === id);
    if (!s) { navigate('/heute'); return; }
    const w = workoutOf(s);
    const st = settings();
    const sc = sessionScore(s, st, content);
    const light = s.traffic?.final ?? s.traffic?.provisional ?? 'green';
    const provisional = !s.traffic?.final;
    const cel = s.celebration || { xpBefore: Math.max(0, store.getState().xp - (s.xpEarned || 0)), xpAfter: store.getState().xp, badges: [], records: [] };
    const lc = H.levelChange(cel.xpBefore, cel.xpAfter);
    const gained = cel.xpAfter - cel.xpBefore;
    const dur = H.formatMinutes(H.durationSec(s));
    const tot = H.setTotals(s);
    const hold = H.sessionHoldSeconds(s);
    const recs = cel.records || [];
    const badges = (cel.badges || []).map((b) => content.badges.find((x) => x.id === b)).filter(Boolean);
    const improved = recs.filter((r) => !r.first).length;
    paint(root, html`
      <header class="ses-top"><div class="ses-top__title"><span class="eyebrow truncate">${w?.name ?? 'Training'}</span><strong>Einheit abgeschlossen</strong></div>
        <span class="chip chip--gold">⚡ <span class="num">${gained}</span> XP</span></header>
      <section class="card ses-summary">
        <div class="summary-head">
          <span class="traffic traffic--${light} traffic--lg">${LIGHT_LABELS[light]}</span>
          <p class="text-xs muted mt-2 mb-0">${provisional ? 'Vorläufige Ampel – morgen kurzer Folgetag-Check' : 'Finale Ampel'}</p>
          <h1 class="summary-head__title mt-4">${sc.headline}</h1>
          <p class="summary-head__sub"><span class="xp-gain">+${gained} XP</span>${improved ? html` · ${improved} ${improved === 1 ? 'neuer Rekord' : 'neue Rekorde'}` : ''}${badges.length ? html` · ${badges.length} ${badges.length === 1 ? 'Abzeichen' : 'Abzeichen'}` : ''}</p>
        </div>
        <div class="target" data-slot="target"></div>
      </section>
      <div class="grid-3 mt-4">
        <div class="stat"><span class="stat__value">${dur.value}<span class="stat__unit">${dur.unit}</span></span><span class="stat__label">Dauer</span></div>
        <div class="stat"><span class="stat__value">${tot.done}<span class="stat__unit">/${tot.planned}</span></span><span class="stat__label">Sätze</span></div>
        <div class="stat stat--gold"><span class="stat__value">${hold >= 60 ? formatDuration(hold) : hold}<span class="stat__unit">${hold >= 60 ? 'min' : 's'}</span></span><span class="stat__label">Gehalten</span></div>
      </div>
      <section class="card mt-4">
        <h2 class="card__title">Warum ${LIGHT_LABELS[light].split(' – ')[0]}?</h2>
        <ul class="ses-reasons mb-0">${(s.traffic?.reasons || []).map((r) => html`<li>${r}</li>`)}</ul>
      </section>
      <section class="card">
        ${raw(xpBar({ xp: cel.xpAfter, level: lc.after, nextTitle: LEVELS[lc.after.index + 1]?.title }))}
        ${lc.up ? html`<div class="ses-levelup"><span style="font-size:28px">🏆</span><span>Neue Stufe: ${lc.after.title}!</span></div>` : ''}
      </section>
      ${recs.length ? html`<h2 class="section-title">Bestwerte</h2><div class="ses-records">${recs.map((r) => html`<span class="chip chip--record">★ ${r.first ? 'Erster Bestwert' : 'Neuer Rekord!'} · ${H.RECORD_LABELS[r.key]} ${H.recordValue(r.key, r.value, st)}</span>`)}</div>` : ''}
      ${badges.length ? html`<h2 class="section-title">Neue Abzeichen</h2><ul class="ses-badges">${badges.map((b) => html`<li class="badge-tile is-unlocked is-new"><span class="badge-tile__icon">${b.icon}</span><span class="badge-tile__name">${b.name}</span><span class="badge-tile__hint">heute</span></li>`)}</ul>` : ''}
      <h2 class="section-title">Empfehlungen</h2>
      <div class="stack stack--sm" data-slot="recs">${H.recCardsHtml(s, content)}</div>
      <div class="banner banner--gold mt-4"><span class="banner__icon">🌤️</span><span class="banner__body"><span class="banner__title">Morgen: Folgetag-Check</span><span class="banner__text">30 Sekunden – macht die Ampel final. Erinnerung erscheint auf „Heute“.</span></span></div>
      <div class="sticky-cta"><button type="button" class="btn btn--primary btn--block btn--session" data-act="done">Fertig</button></div>
    `);
    setCta(true);
    root.querySelector('[data-slot="target"]')?.appendChild(targetFace(sc.results, { label: `Trefferbild: ${sc.points} von ${sc.max} Punkten` }));
    onChange = () => {};
    actions = {
      done: () => navigate('/heute'),
      'rec-accept': (b) => decide(id, Number(b.dataset.i), true),
      'rec-dismiss': (b) => decide(id, Number(b.dataset.i), false),
    };
    if (fresh && s.celebration && !s.celebration.shown) celebrate(s, lc, badges, light);
  }

  function decide(id, i, accept) {
    const d = H.decideRecommendation(store.get(), id, i, accept);
    store.update(() => d);
    const s = store.getSessions().find((x) => x.id === id);
    const rec = s?.recommendations?.[i];
    const slot = root.querySelector('[data-slot="recs"]');
    if (slot && s) paint(slot, H.recCardsHtml(s, content));
    if (accept && rec && rec.action !== 'consult') {
      const t = H.recText(rec, content);
      H.toast(`Übernommen: ${t.title} ${t.levels}`.trim(), { icon: '✓', kind: 'success' });
    }
  }

  async function celebrate(s, lc, badges, light) {
    store.update((d) => { const x = d.sessions.find((y) => y.id === s.id); if (x?.celebration) x.celebration.shown = true; });
    if (light !== 'red' && light !== 'stop') { await new Promise((r) => setTimeout(r, 450)); confetti(); }
    if (lc.up || badges.length) await new Promise((r) => setTimeout(r, 900));
    if (lc.up && !leaving && !disposed) {
      confetti({ origin: { x: 0.5, y: 0.3 } });
      await H.openDialog(String(html`<div class="badge-reveal"><span class="badge-tile__icon">🏆</span>
        <h2 class="modal__title">Neue Stufe!</h2><p class="strong mb-0">Lv ${lc.after.index + 1} · ${lc.after.title}</p>
        <p class="muted">Routine schlägt Talent – weiter so.</p></div>
        <div class="modal__actions"><button type="button" class="btn btn--gold btn--block btn--session" data-value="ok">Stark!</button></div>`), { className: 'modal modal--center ses-dlg' });
    }
    for (const b of badges) {
      if (leaving || disposed) break;
      confetti({ origin: { x: 0.5, y: 0.3 } });
      await H.openDialog(String(html`<div class="badge-reveal"><span class="badge-tile__icon">${b.icon}</span>
        <h2 class="modal__title">Neues Abzeichen!</h2><p class="strong mb-0">${b.name}</p><p class="muted">${b.description}</p></div>
        <div class="modal__actions"><button type="button" class="btn btn--primary btn--block btn--session" data-value="ok">Weiter so</button></div>`), { className: 'modal modal--center ses-dlg' });
    }
  }

  // ------------------------------------------------------------------ dispatcher
  function show() {
    screen = {};
    const step = session.cursor?.step || 'pre';
    if (step === 'exercise') renderExercise();
    else if (step === 'post') renderPost();
    else renderPre();
  }

  function cleanup() {
    disposed = true;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChangeEvt);
    root.removeEventListener('input', onChangeEvt);
    document.querySelectorAll('dialog.ses-dlg').forEach((d) => d.close());
    setCta(false);
    if (session && saved && !leaving && !session.pausedAt) {
      session.pausedAt = new Date().toISOString();
      persist();
    }
  }

  // ------------------------------------------------------------------ boot
  if (query.summary) {
    renderSummary(query.summary, false);
    return cleanup;
  }
  const data = store.get();
  if (data.state.activeSession) {
    session = clone(data.state.activeSession);
    saved = true;
    if (session.pausedAt) {
      session.pausedMs = (session.pausedMs || 0) + Math.max(0, Date.now() - Date.parse(session.pausedAt));
      delete session.pausedAt;
      persist();
    }
    if (session.cursor?.step === 'exercise' || session.cursor?.step === 'post') {
      setTimeout(() => H.toast('Willkommen zurück – weiter geht’s!', { icon: '▶', kind: 'success' }), 300);
    }
  } else {
    const workout = (query.workout && content.workouts.find((w) => w.id === query.workout)) || nextWorkout(data.state, content.phases, content.workouts);
    if (!workout) {
      paint(root, html`<section class="card"><div class="empty"><h2 class="empty__title">Kein Training gefunden</h2><p class="empty__text">Für die aktuelle Phase ist kein Workout hinterlegt.</p><a class="btn btn--primary" href="#/heute">Zu Heute</a></div></section>`);
      return cleanup;
    }
    const taper = taperActive(data.settings.surgeryDate, todayISO());
    session = buildSessionPlan(workout, data.state, content, { taper, history: data.sessions });
    session.pausedMs = 0;
  }
  show();
  return cleanup;
}
