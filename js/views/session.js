// Training session flow – see docs/SPEC.md §4.2 (WP-Session-flow).
// Steps: pre-check → exercises (warmup → knee → archery → cooldown) → post-check → summary.
// v2 (§12): any workout kind (strength/short/custom via the same flow; cardio = pre-check → guided
// rowing timer (step "row") → display values (step "rowlog") → post-check → summary with kcal).
// Post-op sessions (session.postOp) additionally ask redness + fever and show „Arzt kontaktieren“.
// The active session lives in store.state.activeSession and is persisted after every tap
// (cursor {index, set, step}); reloading #/session resumes it. Summary: #/session?summary=<id>.
import { html, raw, render as paint } from '../render.js';
import { nextWorkout, buildSessionPlan, getWorkout, workoutKind, canRowWarmup, finisherPlan, finisherEligible, appendFinisher } from '../logic/progression.js';
import { instructionsFor, ownsRowingMachine } from '../logic/equipment.js';
import { estimateWorkoutMinutes } from '../logic/duration.js';
import { rowingPhases, validateRowing, INTENSITY_LABELS } from '../logic/cardio.js';
import { sameDayLoadHint } from '../logic/stats.js';
import { taperActive, LIGHT_LABELS } from '../logic/traffic-light.js';
import { sessionScore, LEVELS } from '../logic/motivation.js';
import { todayISO, formatDuration } from '../util/date.js';
import { unlock, beep, vibrate } from '../util/audio.js';
import { say, cancel as voiceCancel, unlock as voiceUnlock, countdownWord, voiceActive, cueVibrate } from '../util/voice.js';
import { targetFace, confetti } from '../components/celebrate.js';
import { xpBar } from '../components/charts.js';
import { cueWordsFor } from '../logic/cues.js';
import * as H from './session-helpers.js';

export const title = 'Training';

const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  check: '<svg class="set-check__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
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
  const workoutOf = (s) => getWorkout(s?.workoutId, content, store.getState());
  const titleOf = (s) => H.sessionTitle(s, content, store.getState());
  const isCardio = () => session?.kind === 'cardio';
  const phaseOf = (s) => content.phases.find((p) => p.id === s?.phaseId);
  /** v4: rowing warm-up / finisher entry inside a strength-type session (runs with the rowing timer). */
  const isRowEntry = (e) => !!e && e.section === 'cardio' && !isCardio();

  /** @type {any} working copy of the active session */
  let session = null;
  let saved = false;         // activeSession exists in the store
  let leaving = false;
  let disposed = false; // view left (route change) – no more dialogs
  let actions = {};          // data-act → handler, per screen
  let onChange = () => {};   // change events, per screen
  let screen = {};           // per-screen transient state (timers, nudges)

  let lastBeat = 0;         // Date.now() of the last write (heartbeat throttle)
  const persist = () => {
    if (!session) return;
    saved = true;
    if (!session.pausedAt) session.lastActiveAt = new Date().toISOString();
    lastBeat = Date.now();
    const copy = clone(session);
    store.update((d) => { d.state.activeSession = copy; });
  };
  /** true when the last store write reached storage (WP-1: store.save() returns a boolean; older store: undefined = ok). */
  const savedOk = () => {
    try {
      if (typeof store.lastSaveOk === 'function') return store.lastSaveOk() !== false;
      return typeof store.save !== 'function' || store.save() !== false;
    } catch { return false; }
  };
  const saveReadonly = () => { try { return store.getLastSaveError?.()?.code === 'readonly'; } catch { return false; } };
  const setCta = (on) => document.body.classList.toggle('has-cta', on);
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  /** Timer card: align its top below the sticky header (scroll-margin-top) so „Satz x von y“ + cue + clock show. */
  const toTimer = (el) => el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const smooth = (el) => el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });

  // ------------------------------------------------------------------ delegation
  // P1-1 double taps: after a (re-)render, a second tap on the same spot within the guard window is swallowed
  // (it would hit the button that just appeared under the finger: „Los geht’s“ → „Nächste Übung“ …).
  const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let lastTap = { x: 0, y: 0, t: -1e9 };
  let guard = { until: 0, x: null, y: null };
  /** Swallow taps for `ms` near the tap that caused the re-render. */
  const armGuard = (ms = 450) => {
    if (perfNow() - lastTap.t > 1000) return; // re-render not caused by a tap (boot, timer) → nothing to guard
    guard = { until: perfNow() + ms, x: lastTap.x, y: lastTap.y };
  };
  const onGuard = (e) => {
    if (e.detail === 0) return; // keyboard activation
    const t = perfNow();
    if (t < guard.until) {
      const near = (Math.abs(e.clientX - guard.x) < 60 && Math.abs(e.clientY - guard.y) < 60);
      if (near) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    }
    lastTap = { x: e.clientX, y: e.clientY, t };
  };
  const onClick = (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.('[data-act]');
    if (!b || !root.contains(b) || b.closest('pt-timer')) return;
    const fn = actions[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b, e); }
  };
  const onChangeEvt = (e) => onChange(e);
  root.addEventListener('click', onGuard, true);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChangeEvt);
  root.addEventListener('input', onChangeEvt);

  // ------------------------------------------------------------------ shared markup
  /** Sticky header. `ex` (exercise screens): the exercise name is the big line (readable from the mat), the
   *  eyebrow carries „Übung n von m · Workout“. */
  const topBar = (eyebrow, strong, { menu = true, xp = true, ex = null } = {}) => html`
    <header class="ses-top">
      ${menu ? html`<button type="button" class="btn btn--icon" data-act="menu" aria-label="Pausieren oder abbrechen">${raw(ICON.close)}</button>` : ''}
      ${ex ? html`<div class="ses-top__title"><span class="eyebrow truncate ses-top__eyebrow">${eyebrow}</span><strong class="ses-top__ex" data-top-ex>${ex.name}${ex.side ? html` <span class="ses-top__side ${ex.side === 'Links' ? 'ses-top__side--left' : ''}">${ex.side}</span>` : ''}</strong></div>`
        : html`<div class="ses-top__title"><span class="eyebrow truncate">${eyebrow}</span><strong>${strong}</strong></div>`}
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
    const t = titleOf(session);
    const phase = phaseOf(session);
    const cardio = isCardio();
    const postOp = !!session.postOp;
    const draft = screen.pre = session.pre ? clone(session.pre) : (screen.pre || H.withPostOpFlags({
      pain: null, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false,
    }, postOp));
    const vis = session.exercises.filter(H.isVisible);
    const count = (sec) => vis.filter((e) => e.section === sec).length;
    const minutes = estimateWorkoutMinutes(session, content, store.getState(), settings());
    // v4: rowing warm-up toggle (p1–p3 strength only, before any set is done)
    const rowOpt = !cardio && session.kind === 'strength' && !!w && canRowWarmup(w, store.getState(), content, settings())
      && !session.exercises.some((e) => H.doneCount(e) > 0);
    const loadHint = sameDayLoadHint(store.getSessions(), todayISO(), cardio ? 'cardio' : 'strength');
    const eyebrow = t.kind === 'strength' ? (phase?.name ?? '') : `${t.kindLabel}${phase ? ` · ${phase.name}` : ''}`;
    paint(root, html`
      ${topBar(t.title, 'Vor dem Training', { xp: false })}
      <section class="card ${cardio ? 'card--accent' : 'card--hero'} ses-intro">
        <div class="hero__row">
          <div>
            <p class="hero__eyebrow">${eyebrow}</p>
            <h1 class="hero__title">${cardio ? '🚣 ' : ''}${t.title}</h1>
          </div>
        </div>
        ${w?.description ? html`<p class="hero__meta ses-intro__desc">${w.description}</p>` : ''}
        <p class="hero__meta">
          <span>${raw(ICON.clock)}ca. <span class="num" data-min>${minutes}</span>&nbsp;Min</span>
          <span>${raw(ICON.list)}${cardio ? `${rowingPhases(session, content).length} Abschnitte` : html`<span class="num" data-count>${vis.length}</span>&nbsp;Übungen`}</span>
        </p>
        ${cardio ? '' : html`<div class="hero__split" aria-hidden="true">
          <span style="flex:${count('warmup') || 0.5}"></span><span class="is-knee" style="flex:${count('knee') || 0.01}"></span><span class="is-archery" style="flex:${count('archery') || 0.01}"></span><span style="flex:${count('cooldown') || 0.5}"></span>
        </div>`}
      </section>
      ${rowOpt ? html`<section class="card ses-rowopt">
        <label class="switch-row"><span>🚣 Mit 10 Min. Rudern aufwärmen<small class="muted ses-rowopt__hint" style="display:block;font-weight:400;margin-top:2px" data-row-hint>${rowHint(session.rowWarmup)}</small></span>
          <input type="checkbox" class="switch" data-f="rowWarmup" ${session.rowWarmup ? 'checked' : ''}></label>
      </section>` : ''}
      ${session.taper ? html`<div class="banner banner--accent"><span class="banner__icon">🗓️</span><span class="banner__body"><span class="banner__title">OP-Woche</span><span class="banner__text">Weniger Umfang, gleiche Qualität.</span></span></div>` : ''}
      ${loadHint ? html`<div class="banner banner--gold"><span class="banner__icon">⚖️</span><span class="banner__body"><span class="banner__title">Heute schon trainiert</span><span class="banner__text">${loadHint}</span></span></div>` : ''}
      ${postOp && phase?.redFlagNote ? html`<div class="banner" style="--c:var(--stop);--c-soft:var(--stop-soft);--c-ink:var(--stop-ink)"><span class="banner__icon">🩺</span><span class="banner__body"><span class="banner__title">Entlastungsphase – Warnzeichen</span><span class="banner__text">${phase.redFlagNote}</span></span></div>` : ''}
      <h2 class="ses-big-q ses-pre-q">Wie geht’s dem Knie gerade?</h2>
      <section class="card stack">
        <pt-pain-scale label="Schmerz jetzt" data-f="pain" ${draft.pain != null ? html`value="${draft.pain}"` : ''}></pt-pain-scale>
        <div class="ses-field"><span class="field__label">Schwellung</span>${segmented('pre-swelling', draft.swelling, 'Schwellung')}</div>
      </section>
      <p class="muted">${cardio ? 'Die Ampel gilt auch auf dem Rudergerät.' : 'Ehrliche Antworten machen die Empfehlungen gut.'}</p>
      <section class="card ses-check">
        <p class="field__label mb-2">Seit dem letzten Training …</p>
        ${checkRow('locking', 'Knie blockiert oder hakt', draft.mechanical.locking)}
        ${checkRow('givingWay', 'Knie knickt weg oder gibt nach', draft.mechanical.givingWay)}
        ${checkRow('nightPain', 'Nachtschmerz', draft.nightPain)}
        ${checkRow('swellingOver48h', 'Schwellung seit mehr als 48 h', draft.swellingOver48h)}
        ${postOp ? html`${checkRow('redness', 'Rötung oder Überwärmung am Knie', draft.redness)}${checkRow('fever', 'Fieber (über 38 °C)', draft.fever)}` : ''}
      </section>
      <div data-slot="stop"></div>
      <div class="sticky-cta" data-slot="cta"><button type="button" class="btn ${cardio ? 'btn--accent' : 'btn--primary'} btn--block btn--session" data-act="pre-go">${cardio ? 'Los geht’s – ab aufs Rudergerät' : 'Los geht’s'}</button></div>
    `);
    setCta(true);

    onChange = (e) => {
      const t = /** @type {any} */ (e.target);
      if (e.type === 'input') return;
      if (t.dataset?.f === 'rowWarmup') { setRowWarmup(t.checked); return; }
      if (t.tagName === 'PT-PAIN-SCALE' && t.dataset.f === 'pain') draft.pain = e.detail?.value ?? t.value;
      else if (t.name === 'pre-swelling') draft.swelling = Number(t.value);
      else if (t.dataset?.f === 'locking') draft.mechanical.locking = t.checked;
      else if (t.dataset?.f === 'givingWay') draft.mechanical.givingWay = t.checked;
      else if (['nightPain', 'swellingOver48h', 'redness', 'fever'].includes(t.dataset?.f)) draft[t.dataset.f] = t.checked;
      else return;
      if (session.pre) { session.pre = clone(draft); persist(); }
    };

    const assess = (hist) => H.assessPreCheck(session.pre, settings(), hist, { postOp });
    actions = {
      menu: openMenu,
      'pre-go': () => {
        if (draft.pain == null) { nudge(root.querySelector('pt-pain-scale'), 'Bitte zuerst „Schmerz jetzt“ wählen.'); return; }
        unlock();
        voiceUnlock();
        session.pre = clone(draft);
        persist();
        const a = assess(store.getSessions());
        if (a.showCard) showStopCard(a);
        else startExercises();
      },
      upper: () => { H.applyUpperBodyOnly(session, content); H.toast('Oberkörper-Einheit – das Knie hat Pause.', { icon: '🏹', kind: 'accent' }); startExercises(); },
      lighter: () => {
        if (cardio) { H.applyLighterCardio(session, content); H.toast('Lockerer & kürzer – heute zählt die Bewegung.', { icon: '🪶', kind: '' }); }
        else { H.applyLighterVariants(session, content); H.toast('Knie-Übungen eine Stufe leichter.', { icon: '🪶', kind: '' }); }
        startExercises();
      },
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
      const a = assess(store.getSessions().filter((s) => s.id !== session.id));
      if (a.showCard) showStopCard(a, false);
    }
  }

  const rowHint = (on) => (on ? 'Statt Mobilisation · danach kurz Schultern für den Bogen' : 'Aus: Mobilisations-Aufwärmen (3–4 Min)');

  /** v4: rebuild the plan with/without the rowing warm-up (start screen toggle); updates „ca. N Min“ live. */
  function setRowWarmup(on) {
    const w = workoutOf(session);
    const data = store.get();
    if (!w) return;
    const keep = { id: session.id, kind: session.kind, workoutName: session.workoutName, pausedMs: session.pausedMs || 0, startedAt: session.startedAt, pre: session.pre, cursor: session.cursor };
    session = Object.assign(buildSessionPlan(w, data.state, content, { taper: !!session.taper, history: data.sessions, settings: data.settings, rowWarmup: on, rowFinisher: false }), keep);
    if (saved) persist();
    const min = root.querySelector('[data-min]');
    if (min) min.textContent = String(estimateWorkoutMinutes(session, content, data.state, settings()));
    const cnt = root.querySelector('[data-count]');
    if (cnt) cnt.textContent = String(session.exercises.filter(H.isVisible).length);
    const hint = root.querySelector('[data-row-hint]');
    if (hint) hint.textContent = rowHint(session.rowWarmup);
  }

  function showStopCard(a, scroll = true) {
    const stop = a.light === 'stop';
    const cardio = isCardio();
    const doctor = !!a.doctor;
    // post-op red flags (fever, redness, new swelling, pain > 5): no „upper body only“ offer – see a doctor first
    const hasUpper = !cardio && !doctor && session.exercises.some((e) => !H.isKneeEntry(e, content));
    const slot = root.querySelector('[data-slot="stop"]');
    const title = doctor ? 'Bitte Arzt kontaktieren' : stop ? 'Heute lieber pausieren und Rücksprache halten' : cardio ? 'Heute locker rudern' : 'Heute schonend trainieren';
    paint(slot, html`
      <section class="card stop-card ${doctor ? 'ses-doctor' : ''}" role="alert">
        ${doctor ? html`<div class="row"><span class="ses-doctor__icon" aria-hidden="true">🩺</span><span class="traffic traffic--stop">${LIGHT_LABELS.stop}</span></div>` : html`<span class="traffic traffic--${a.light}">${LIGHT_LABELS[a.light]}</span>`}
        <h2 class="card__title mt-2">${title}</h2>
        <ul class="ses-reasons">${a.reasons.map((r) => html`<li>${r}</li>`)}</ul>
        ${doctor ? html`<p class="ses-consult">In der Entlastungsphase nach der OP sind Rötung, Überwärmung, Fieber, neue Schwellung oder starker Schmerz Warnzeichen. Bitte melde dich heute noch bei deinem Arzt bzw. in der Klinik – bei hohem Fieber oder starken Beschwerden sofort.</p>`
          : stop ? html`<p class="ses-consult">Bitte lass das Knie ärztlich oder physiotherapeutisch abklären, bevor du es wieder belastest.${hasUpper ? ' Oberkörper geht trotzdem – du entscheidest.' : ''}</p>`
          : html`<p class="muted mb-0">Dein Knie meldet sich. Wähle, wie du heute trainieren möchtest.</p>`}
        <div class="ses-choices">
          <button type="button" class="btn ${doctor || stop ? 'btn--primary' : 'btn--outline'} btn--block" data-act="pause-today"><span aria-hidden="true">💚</span><span>Heute pausieren<small>Erholung ist auch Training</small></span></button>
          ${hasUpper ? html`<button type="button" class="btn btn--accent btn--block" data-act="upper"><span aria-hidden="true">🏹</span><span>Nur Oberkörper (Bogen-Block)<small>Knie-Übungen werden heute ausgelassen</small></span></button>` : ''}
          ${doctor ? '' : html`<button type="button" class="btn btn--soft btn--block" data-act="lighter"><span aria-hidden="true">🪶</span><span>${cardio ? 'Lockerer & kürzer rudern' : 'Leichtere Varianten'}<small>${cardio ? 'Eine Stufe leichter bzw. kürzer' : 'Knie-Übungen eine Stufe leichter'}</small></span></button>`}
          ${stop ? '' : html`<button type="button" class="btn btn--ghost btn--block" data-act="as-planned"><span aria-hidden="true">➜</span><span>Trotzdem wie geplant</span></button>`}
        </div>
      </section>`);
    const cta = root.querySelector('[data-slot="cta"]');
    if (cta) cta.remove();
    setCta(false);
    armGuard();
    if (scroll) smooth(slot.firstElementChild);
  }

  function startExercises() {
    if (isCardio()) {
      session.cursor = { index: Math.max(0, H.mainCardioIndex(session)), set: 0, step: 'row' };
      persist();
      show();
      scrollTop();
      return;
    }
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

  /** Knee reps with a tempo run with the Tempo-Coach by default (hands-free); others on request. */
  const tempoCoachOn = (dose, entry) => !!dose.tempo && dose.type !== 'hold' && dose.type !== 'timed'
    && (entry?.section === 'knee' ? !entry.manualTempo : !!entry?.tempoCoach);

  function timerMarkup(dose, entry) {
    const blk = H.timerBlock(entry?.section);
    if (dose.type === 'hold') {
      const reps = (dose.reps ?? 1) * (dose.perSide ? 2 : 1);
      return html`<pt-timer mode="hold" block="${blk}" seconds="${dose.hold ?? 10}" reps="${reps}" rest-between="${dose.perSide && (dose.reps ?? 1) === 1 ? 5 : dose.restBetween}" data-role="work"></pt-timer>
        <p class="ses-hint">${dose.perSide ? 'Seitenwechsel in der kurzen Pause. ' : ''}Der Satz wird nach dem Timer automatisch abgehakt.</p>`;
    }
    if (dose.type === 'timed') {
      if (dose.perSide) {
        return html`<pt-timer mode="hold" block="${blk}" seconds="${dose.seconds ?? 30}" reps="2" rest-between="5" data-role="work"></pt-timer>
          <p class="ses-hint">Erst eine Seite, nach der kurzen Pause die andere. Satz wird danach automatisch abgehakt.</p>`;
      }
      return html`<pt-timer mode="set" block="${blk}" seconds="${dose.seconds ?? 30}" data-role="work"></pt-timer>
        <p class="ses-hint">Der Satz wird nach dem Timer automatisch abgehakt.</p>`;
    }
    if (tempoCoachOn(dose, entry)) {
      return html`<div data-slot="tempo"><pt-timer compact mode="set" block="${blk}" reps="${dose.reps ?? 10}" tempo="${dose.tempo}" data-role="work"></pt-timer>
        <p class="ses-hint">Tempo-Coach ${dose.tempo}: einmal Start tippen, dann führt die Stimme. Der Satz wird danach abgehakt.</p>
        <button type="button" class="ses-link" data-act="tempo-manual">Lieber selbst zählen</button></div>`;
    }
    // plain reps (or manual tempo): one big target – readable and tappable from the mat
    return html`<button type="button" class="btn btn--primary ses-bigdone" data-act="set-done">${raw(ICON.done)}<span>Satz fertig</span></button>
      ${dose.tempo ? html`<button type="button" class="btn btn--soft btn--block btn--session mt-3" data-act="tempo">Tempo-Coach · ${dose.tempo}</button>
        <p class="ses-hint">Gibt den Takt vor (Hoch–Halten–Runter) – mit 5 s „Bereit machen“ und Ansage.</p>`
        : html`<p class="ses-hint">Nach jedem Satz einmal tippen – die Satzpause startet automatisch.</p>`}`;
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
    screen = { rpeNudged: false, pressTimer: 0, longPressed: false, plan: H.cuePlanFor(entry, ex, settings()), openedAt: perfNow(), lastDoneAt: -1e9 };
    const sideLabel = { left: 'Links (OP-Seite)', right: 'Rechts', perSide: 'Je Seite', alternate: 'Abwechselnd' }[dose.side];
    const sideShort = { left: 'Links', right: 'Rechts', perSide: 'je Seite', alternate: 'abwechselnd' }[dose.side];
    const timer = timerMarkup(dose, entry);
    const compactFig = dose.type === 'hold' || dose.type === 'timed' || tempoCoachOn(dose, entry);
    const samePain = knee ? H.prevKneePain(session, idx, content) : null;
    paint(root, html`
      ${topBar(`Übung ${pos.pos} von ${pos.total} · ${titleOf(session).title}`, '', { ex: { name: ex.name, side: sideShort } })}
      ${progressBar(idx, 'exercise')}
      <div class="row row--between">
        <div class="block-header block-header--${sec}" style="margin:0"><span class="block-header__dot"></span>${H.SECTION_LABELS[sec]}<span class="block-header__count">${pos.secPos}/${pos.secTotal}</span></div>
        <button type="button" class="btn btn--ghost btn--sm ses-ovw" data-act="overview">${raw(ICON.list)}Übersicht</button>
      </div>
      <section class="card ses-ex mt-4">
        <div class="ses-fig ${compactFig ? 'ses-fig--compact' : ''}"><pt-figure aspect="${compactFig ? '2.2' : '1.5'}" exercise-id="${ex.id}" level="${entry.level ?? 0}" ${dose.band ? html`band-id="${dose.band}"` : ''} aria-label="${ex.name}"></pt-figure></div>
        <div class="row row--between row--top">
          <h1 class="card__title">${ex.name}</h1>
          <span class="chip chip--${archery ? 'archery' : 'knee'} chip--sm" style="flex:none">Stufe ${(entry.level ?? 0) + 1}/${ex.levels.length}</span>
        </div>
        <p class="ses-note" data-dose-label>${H.doseLabel(entry, ex, dose)}</p>
        ${entry.note ? html`<p class="ses-note">💡 ${entry.note}</p>` : ''}
        <div class="ses-meta">
          ${band ? html`<span class="chip chip--band" style="--band:${band.color}"><i class="chip__swatch"></i>${band.label}</span>` : ''}
          ${dose.tempo ? html`<span class="chip chip--outline">Tempo ${dose.tempo}</span>` : ''}
          ${sideLabel ? html`<span class="chip chip--outline">${sideLabel}</span>` : ''}
          ${dose.rest ? html`<span class="chip chip--outline">Pause ${dose.rest} s</span>` : ''}
          ${session.taper ? html`<span class="chip chip--accent">OP-Woche · weniger Sätze</span>` : ''}
          ${entry.lighter ? html`<span class="chip chip--green">Leichtere Variante</span>` : ''}
          ${entry.upgradedFrom ? html`<span class="chip chip--accent" title="Mit deiner Ausrüstung statt ${content.exercises.find((e) => e.id === entry.upgradedFrom)?.name ?? ''}">${entry.newVariant ? 'Neu: ' : ''}${entry.upgradeChip || 'Variante'}</span>` : ''}
          ${entry.trimmed ? html`<span class="chip chip--outline" title="Sätze gekürzt, damit die Einheit ins Zeitbudget passt">⏱ gekürzt für ${w?.maxMinutes ?? 30} Min</span>` : ''}
        </div>
        ${session.postOp && ex.postOpNote ? html`<p class="ses-postop">🩺 ${/^nach der op/i.test(ex.postOpNote) ? '' : html`<strong>Nach der OP:</strong> `}${ex.postOpNote}</p>` : ''}
        <div class="ses-dose mt-4">
          ${doseItems(dose)}
          <button type="button" class="ses-edit" data-act="adjust" aria-label="Vorgabe anpassen (Wdh., Halten, Band)">${raw(ICON.edit)}</button>
        </div>
        <div class="ses-sets"><div class="set-checks" role="group" aria-label="Sätze abhaken">${setButtons(entry, dose, archery)}</div></div>
        <p class="ses-hint">Tippen = Satz geschafft · gedrückt halten = anpassen</p>
        <div data-slot="done" class="mt-4" ${allDone ? '' : 'hidden'}><div class="ses-done"><span class="ses-done__icon">✓</span><span>Übung geschafft! ${archery ? 'Wie anstrengend war’s?' : knee ? 'Wie war das Knie?' : 'Weiter geht’s.'}</span></div></div>
      </section>
      <div data-slot="rest"></div>
      ${timer ? html`<section class="card ses-timer" data-slot="timer" ${allDone ? 'hidden' : ''}><p class="ses-setno" data-setno>${allDone ? '' : `Satz ${Math.min(dose.sets, H.doneCount(entry) + 1)} von ${dose.sets}`}</p>${timer}</section>` : ''}
      ${knee ? html`<section class="card" data-slot="pain">
          ${samePain != null ? html`<div class="ses-pain-same" data-pain-same ${entry.painDuring != null ? 'hidden' : ''}><button type="button" class="btn btn--soft" data-act="pain-same" data-v="${samePain}">Wie eben (${samePain})</button><span>oder unten wählen</span></div>` : ''}
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
          <ol class="steps">${instructionsFor(ex, settings()).map((s) => html`<li>${s}</li>`)}</ol>
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
    armGuard();
    wireWorkTimer(entry, dose);
    wireLongPress(entry, dose);

    const hidePainSame = () => { const el = root.querySelector('[data-pain-same]'); if (el) el.hidden = entry.painDuring != null; };
    onChange = (e) => {
      const t = /** @type {any} */ (e.target);
      if (t.tagName !== 'PT-PAIN-SCALE' || e.type !== 'change') return;
      if (t.dataset.f === 'painDuring') { entry.painDuring = e.detail?.value ?? t.value; persist(); bumpXp(); hidePainSame(); }
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
          // P1-1: a double tap must not tick + untick – offer an explicit undo instead
          if (perfNow() - (screen.tickedAt?.[i] ?? -1e9) < 600) {
            H.toast(`Satz ${i + 1} abgehakt`, { icon: '✓', kind: 'success', ms: 4000, action: { label: 'Rückgängig', onClick: () => undoSet(entry, i) } });
            return;
          }
          H.unmarkSet(entry, i);
          session.cursor.set = H.doneCount(entry);
          persist();
          refreshSets(entry, dose);
          H.toast(`Satz ${i + 1} zurückgenommen`, { icon: '↺', kind: '' });
          return;
        }
        completeSet(entry, dose, i, b);
      },
      'set-done': () => {
        if (perfNow() - screen.lastDoneAt < 600) return; // double tap on the big button
        const open = H.nextOpenSet(entry, dose.sets);
        if (open < 0) return;
        screen.lastDoneAt = perfNow();
        armGuard(600); // the rest card appears where the finger is
        completeSet(entry, dose, open);
      },
      tempo: () => {
        voiceUnlock();
        if (knee) entry.manualTempo = false; else entry.tempoCoach = true;
        persist();
        renderExercise();
        const card = root.querySelector('[data-slot="timer"]');
        root.querySelector('pt-timer[data-role="work"]')?.start();
        toTimer(card);
      },
      'tempo-manual': () => {
        entry.manualTempo = true;
        entry.tempoCoach = false;
        persist();
        renderExercise();
        toTimer(root.querySelector('[data-slot="timer"]'));
      },
      'pain-same': (b) => {
        const v = Number(b.dataset.v);
        entry.painDuring = v;
        const scale = /** @type {any} */ (root.querySelector('[data-slot="pain"] pt-pain-scale'));
        if (scale) scale.setAttribute('value', String(v));
        persist();
        bumpXp();
        hidePainSame();
        H.toast(`Schmerz ${v}/10 übernommen`, { icon: '✓', kind: '' });
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
        // P1-1: never auto-skip an exercise that was opened a moment ago (double tap from the screen before)
        if (done === 0 && !entry.skipped && perfNow() - screen.openedAt < 1000) return;
        if (done === 0 && !entry.skipped) {
          entry.skipped = true;
          H.toast('Übung übersprungen', { icon: '↷', kind: '' });
        }
        go(next, idx);
      },
    };
  }

  function go(target, from) {
    if (maybeOfferFinisher(target, from)) return;
    goTo(target, from);
  }

  function goTo(target, from) {
    if (target < 0) session.cursor = { index: from, set: 0, step: 'post' };
    else session.cursor = { index: target, set: H.doneCount(session.exercises[target]), step: 'exercise' };
    persist();
    show();
    scrollTop();
  }

  /**
   * v4 (SPEC §15.6): leaving the strength part (next target is the cool-down or the end) → offer the rowing
   * finisher once, only at a green knee light (finisherEligible) and when the phase has one (finisherPlan).
   * @returns {boolean} true when the offer screen is shown
   */
  function maybeOfferFinisher(target, from) {
    if (isCardio() || (session.kind ?? 'strength') !== 'strength' || session.finisherAsked || session.exercises.some((e) => e.finisher)) return false;
    const cool = session.exercises.findIndex((e) => e.section === 'cooldown');
    const boundary = cool < 0 ? session.exercises.length : cool;
    if (!(from < boundary && (target < 0 || target >= boundary))) return false;
    const f = finisherPlan(workoutOf(session), store.getState(), content, { taper: !!session.taper, settings: settings() });
    if (!f) return false;
    session.finisherAsked = true;
    const el = finisherEligible(session, settings());
    if (!el.ok) { session.finisherSkipped = el.reasons; return false; }
    delete session.finisherSkipped;
    session.cursor = { index: from, set: 0, step: 'finisher', target };
    persist();
    show();
    scrollTop();
    return true;
  }

  function renderFinisherOffer() {
    const from = session.cursor.index;
    const target = session.cursor.target ?? -1;
    const w = workoutOf(session);
    const f = finisherPlan(w, store.getState(), content, { taper: !!session.taper, settings: settings() });
    const ex = f && exById(f.exerciseId);
    if (!f || !ex) { session.cursor = { index: from, set: 0, step: 'exercise' }; goTo(target, from); return; }
    const lvl = ex.levels[f.level] || {};
    const yes = !!settings().rowFinisherDefault;
    paint(root, html`
      ${topBar(titleOf(session).title, 'Kraftteil geschafft')}
      <section class="card card--accent ses-fin mt-2">
        <span class="traffic traffic--green">${LIGHT_LABELS.green}</span>
        <h1 class="ses-big-q mt-4">Noch 5–10 Min. rudern? 🚣</h1>
        <p>Dein Knie war heute im grünen Bereich. Ein kurzer Ruder-Finisher bringt extra Ausdauer und Kalorien – ganz freiwillig.</p>
        <p class="hero__meta mb-0"><span>${raw(ICON.clock)}ca. ${f.minutes} Min</span><span>${lvl.label || ex.name}</span></p>
      </section>
      <div class="ses-choices">
        <button type="button" class="btn ${yes ? 'btn--accent' : 'btn--outline'} btn--block btn--session" data-act="fin-yes"><span aria-hidden="true">🚣</span><span>Ja, noch rudern<small>${ex.name}</small></span></button>
        <button type="button" class="btn ${yes ? 'btn--outline' : 'btn--primary'} btn--block btn--session" data-act="fin-no"><span aria-hidden="true">🧘</span><span>Nein, weiter zum Dehnen<small>Cool-down mit 4-7-8-Atmung</small></span></button>
      </div>
      <p class="text-xs muted mt-4">Stopp bei Schmerz &gt; 5/10, stechendem Schmerz, Blockieren oder Wegknicken – die Ampel gilt auch beim Finisher.</p>
      <button type="button" class="btn btn--ghost btn--block" data-act="fin-back">Zurück zur letzten Übung</button>
    `);
    setCta(false);
    say('Kraftteil geschafft. Noch fünf bis zehn Minuten rudern?', { priority: 'high', interrupt: true, cue: 'exercise-done' });
    onChange = () => {};
    actions = {
      menu: openMenu,
      'fin-yes': () => {
        unlock();
        voiceUnlock();
        session = appendFinisher(session, w, store.getState(), content, settings());
        session.finisherAccepted = true;
        const i = session.exercises.findIndex((e) => e.finisher);
        session.cursor = { index: i, set: 0, step: 'exercise' };
        persist();
        show();
        scrollTop();
      },
      'fin-no': () => {
        session.finisherDeclined = true;
        goTo(target, from);
      },
      'fin-back': () => {
        session.finisherAsked = false;
        goTo(from, from);
      },
    };
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
    const work = root.querySelector('pt-timer[data-role="work"]');
    if (work && !work.running && !allDone) applyWorkPlan(work, entry); // „Satz n von m“ of the next open set
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

  /** „Rückgängig“ from the toast: undo set `i` of `entry` (only while that exercise is still on screen). */
  function undoSet(entry, i) {
    if (disposed || !session || session.cursor?.step !== 'exercise' || session.exercises[session.cursor.index] !== entry) return;
    if (!entry.sets?.[i]?.done) return;
    const dose = H.doseFor(entry, exById(entry.exerciseId), settings());
    H.unmarkSet(entry, i);
    session.cursor.set = H.doneCount(entry);
    stopRest();
    persist();
    refreshSets(entry, dose);
    H.toast(`Satz ${i + 1} zurückgenommen`, { icon: '↺', kind: '' });
  }

  function completeSet(entry, dose, i, btn) {
    screen.tickedAt = { ...(screen.tickedAt || {}), [i]: perfNow() };
    H.markSet(entry, i, H.setValues(dose));
    session.cursor.set = H.doneCount(entry);
    persist();
    refreshSets(entry, dose);
    floatXp(btn || root.querySelector(`.set-check[data-set="${i}"]`), H.setXp(entry, settings()));
    try { navigator.vibrate?.(30); } catch { /* ignore */ }
    const open = H.nextOpenSet(entry, dose.sets);
    if (open >= 0) startRest(entry, dose, open);
    else {
      announceExerciseDone(entry);
      exerciseComplete(entry);
    }
  }

  /** "Übung fertig. Nächste Übung: <Name>" (or the last-exercise variant). */
  function announceExerciseDone(entry) {
    const idx = session.exercises.indexOf(entry);
    const n = H.nextIndex(session, idx < 0 ? session.cursor.index : idx);
    const nextEx = n >= 0 ? exById(session.exercises[n].exerciseId) : null;
    const ex = exById(entry.exerciseId);
    // holds (stretches/isometrics) end with the release word first: „Lösen. Übung fertig …“
    const rw = ex?.type === 'hold' ? cueWordsFor(ex).release : '';
    const release = rw ? `${rw}. ` : '';
    cueVibrate('exercise-done');
    say(release + H.exerciseDoneAnnouncement(nextEx?.name), { priority: 'high', interrupt: true, cue: 'exercise-done' });
  }

  /** Does this exercise run its sets through the work timer (prep + cues)? */
  function timerLed(dose) {
    return !!root.querySelector('pt-timer[data-role="work"]') && (dose.type === 'hold' || dose.type === 'timed' || !!dose.tempo);
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
    if (!(dose.rest > 0)) {
      say(`${dose.type === 'hold' ? 'Loslassen. ' : ''}Satz geschafft`, { priority: 'high', interrupt: true, cue: 'set-done' });
      afterRest();
      return;
    }
    const slot = root.querySelector('[data-slot="rest"]');
    if (!slot) return;
    screen.resting = true;
    const timerCard = root.querySelector('[data-slot="timer"]');
    if (timerCard) timerCard.hidden = true;
    paint(slot, html`<section class="card ses-rest">
      <p class="eyebrow">Satzpause · gleich Satz ${nextSet + 1} von ${dose.sets}</p>
      <pt-timer mode="rest" seconds="${dose.rest}" data-role="rest"></pt-timer>
    </section>`);
    const t = slot.querySelector('pt-timer');
    if (t) {
      // spoken: "Satz geschafft. Pause, 45 Sekunden" … "Gleich geht's weiter" (+ 3-2-1 when no prep follows)
      t.plan = [{ phase: 'rest', seconds: dose.rest, say: H.restAnnouncement(dose), setIndex: nextSet - 1, repIndex: null, countdown: !timerLed(dose) }];
      t.start();
    }
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
    if (work && !allDone && timerLed(dose)) {
      applyWorkPlan(work, entry);
      work.reset();
      work.start(); // starts with „Satz n von m. Bereit machen“ + 3-2-1
      toTimer(timerCard);
    } else {
      if (!allDone) say(H.nextSetAnnouncement(H.doneCount(entry) + 1, dose.sets), { priority: 'high', interrupt: true, cue: 'tense' });
      smooth(root.querySelector('[data-slot="timer"]:not([hidden]) .ses-bigdone') || root.querySelector('.set-check.is-current') || root.querySelector('.ses-ex'));
    }
  }

  /** Give the work timer the cue-plan steps of the next open set (prep → work → relax). */
  function applyWorkPlan(t, entry) {
    const ex = exById(entry.exerciseId);
    const dose = H.doseFor(entry, ex, settings());
    if (!screen.plan) screen.plan = H.cuePlanFor(entry, ex, settings());
    const open = H.nextOpenSet(entry, dose.sets);
    const steps = H.timerCuePlan(screen.plan, open < 0 ? 0 : open);
    if (steps) t.plan = steps;
  }

  function wireWorkTimer(entry, dose) {
    const t = root.querySelector('pt-timer[data-role="work"]');
    if (!t || t._sesWired) return;
    t._sesWired = true;
    applyWorkPlan(t, entry);
    // P1-4: once started, bring the whole timer card (cue banner + clock) into view above the sticky CTA
    t.addEventListener('click', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest?.('[data-action="toggle"]') && t.running) toTimer(t.closest('[data-slot="timer"]'));
    });
    hideSingleRep(t);
    t.addEventListener('done', (e) => {
      if (e.target !== t) return;
      const open = H.nextOpenSet(entry, dose.sets);
      if (open >= 0) completeSet(entry, dose, open);
    });
  }

  /** „Wdh. 1/1“ carries no information (single hold/timed block) → hide the timer meta line then. */
  function hideSingleRep(t) {
    const meta = t.querySelector('.pt-timer__meta');
    if (!meta || typeof MutationObserver !== 'function') return;
    const sync = () => {
      const one = /^Wdh\.\s*1\s*\/\s*1\b/.test(meta.textContent || '');
      if (one !== t.hasAttribute('data-ses-onerep')) t.toggleAttribute('data-ses-onerep', one);
    };
    const mo = new MutationObserver(sync);
    mo.observe(meta, { childList: true, characterData: true, subtree: true });
    sync();
    const prev = screen.observers || [];
    screen.observers = [...prev, mo];
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

  // ------------------------------------------------------------------ v2: guided rowing timer
  const fmtRange = (r) => (Array.isArray(r) ? `${r[0]}–${r[1]}` : '');
  const INT_CLASS = { easy: 'easy', moderate: 'moderate', vigorous: 'vigorous' };

  async function acquireWake() {
    try {
      const wl = navigator.wakeLock;
      if (!wl || screen.wake || document.visibilityState !== 'visible') return;
      const lock = await wl.request('screen');
      if (disposed || !screen.rowRunning) { lock.release().catch(() => {}); return; }
      screen.wake = lock;
      lock.addEventListener?.('release', () => { if (screen.wake === lock) screen.wake = null; });
    } catch { /* unsupported / not allowed */ }
  }
  function releaseWake() {
    const lock = screen.wake;
    screen.wake = null;
    if (lock) lock.release().catch(() => {});
  }

  function renderRow() {
    // v4: inside a strength session only the current rowing entry (warm-up or finisher) runs with this timer
    const seg = !isCardio();
    const segIdx = seg ? session.cursor.index : -1;
    const segEntry = seg ? session.exercises[segIdx] : null;
    const phases = seg
      ? rowingPhases({ exercises: session.exercises.map((e, i) => (i === segIdx ? { ...e, skipped: false } : { skipped: true })) }, content)
      : rowingPhases(session, content);
    if (!phases.length) {
      if (seg) { goTo(H.nextIndex(session, segIdx), segIdx); return; }
      session.cursor = { index: 0, set: 0, step: 'rowlog' }; persist(); return show();
    }
    if (seg && session.rowTimer?.entry !== segIdx) {
      // a rowing part that was already rowed earlier (navigated back) shows as done; values stay untouched
      const rowedBefore = H.doneCount(segEntry) > 0;
      session.rowTimer = { ...H.newRowTimer(), entry: segIdx, ...(rowedBefore ? { done: true, restored: true } : {}) };
    }
    const t = session.rowTimer = session.rowTimer || H.newRowTimer();
    const mainIdx = seg ? segIdx : H.mainCardioIndex(session);
    const main = session.exercises[mainIdx] || null;
    const mainEx = main && exById(main.exerciseId);
    const techEx = mainEx || exById(session.exercises[0]?.exerciseId);
    const title = titleOf(session).title;
    const segName = segEntry?.finisher ? 'Ruder-Finisher' : 'Rudern zum Aufwärmen';
    screen = { lastSec: null, phaseIdx: -1, loop: 0, wake: null, rowRunning: false };
    paint(root, html`
      ${topBar(title, seg ? segName : 'Rudern', { xp: false })}
      ${seg ? progressBar(segIdx, 'exercise') : ''}
      ${seg ? html`<div class="row row--between"><div class="block-header block-header--cardio" style="margin:0"><span class="block-header__dot"></span>${segEntry.finisher ? 'Finisher · Rudern' : 'Aufwärmen · Rudern'}</div>
        <button type="button" class="btn btn--ghost btn--sm ses-ovw" data-act="overview">${raw(ICON.list)}Übersicht</button></div>` : ''}
      <section class="card row-timer ${seg ? 'mt-4' : ''}" data-slot="rt" aria-live="off">
        <p class="eyebrow" data-r="eyebrow"></p>
        <h1 class="row-phase" data-r="big"></h1>
        <p class="row-sub" data-r="sub"></p>
        <div class="row-targets" data-r="targets"></div>
        <div class="row-clock" data-r="clock" role="timer" aria-label="Restzeit des Abschnitts">0:00</div>
        <div class="row-bar" aria-hidden="true"><span data-r="bar"></span></div>
        <p class="row-total"><span>Gesamt noch <strong class="num" data-r="total">0:00</strong></span><span><strong class="num" data-r="rowed">0:00</strong> gerudert</span></p>
        <p class="row-next" data-r="next"></p>
        <div class="row-ctrl">
          <button type="button" class="btn btn--primary row-play btn--session" data-act="row-toggle" data-r="toggle">▶ Start</button>
          <button type="button" class="btn btn--outline" data-act="row-skip" data-r="skip">Abschnitt ⏭</button>
        </div>
        <p class="sr-only" aria-live="assertive" data-r="announce"></p>
      </section>
      <p class="row-stopline mt-4"><span aria-hidden="true">✋</span><span>Stopp bei Schmerz &gt; 5/10, stechendem Schmerz, Blockieren oder Wegknicken.</span></p>
      ${main ? html`<section class="card mt-4" data-slot="pain">
        <pt-pain-scale label="Knieschmerz beim Rudern" data-f="painDuring" ${main.painDuring != null ? html`value="${main.painDuring}"` : ''}></pt-pain-scale>
        <button type="button" class="btn btn--danger btn--block ses-sharp" data-act="sharp" aria-pressed="${String(!!main.sharpPain)}">⚡ Stechender Schmerz</button>
      </section>` : ''}
      <div data-slot="redwarn"></div>
      <details class="disclosure">
        <summary>Technik: Beine – Körper – Arme</summary>
        <div class="stack stack--sm">
          <ol class="steps">${(techEx?.instructions || []).map((x) => html`<li>${x}</li>`)}</ol>
          ${techEx?.cues?.length ? html`<div class="chip-row">${techEx.cues.map((c) => html`<span class="chip chip--knee">${c}</span>`)}</div>` : ''}
          ${techEx?.mistakes?.length ? html`<p class="field__label mb-0 mt-2">Typische Fehler</p><ul class="ses-reasons">${techEx.mistakes.map((m) => html`<li>${m}</li>`)}</ul>` : ''}
          ${techEx?.kneeNote ? html`<p class="ses-consult mb-0">🦵 ${techEx.kneeNote}</p>` : ''}
        </div>
      </details>
      ${seg && !t.done ? html`<button type="button" class="btn btn--ghost btn--block" data-act="row-omit">${segEntry.finisher ? 'Finisher auslassen' : 'Rudern heute auslassen'}</button>` : ''}
      <div class="sticky-cta"><button type="button" class="btn btn--primary btn--block btn--session" data-act="row-end" data-r="end">Rudern beenden</button></div>
    `);
    setCta(true);
    const $ = (k) => root.querySelector(`[data-r="${k}"]`);

    function paintPhase(animate) {
      const card = root.querySelector('[data-slot="rt"]');
      if (!card) return;
      if (t.done) {
        card.className = 'card row-timer row-timer--done';
        $('eyebrow').textContent = 'Alle Abschnitte geschafft';
        $('big').textContent = 'Geschafft! 🎉';
        $('sub').textContent = seg ? 'Stark gerudert. Werte vom Display kannst du gleich kurz eintragen (optional).' : 'Stark gerudert. Jetzt noch die Werte vom Display eintragen.';
        $('targets').innerHTML = '';
        $('next').hidden = true;
        $('toggle').hidden = true;
        $('skip').hidden = true;
        $('end').textContent = seg ? 'Weiter' : 'Werte eintragen';
        $('end').classList.add('ses-pulse');
        return;
      }
      const ph = phases[t.idx];
      const lab = H.rowPhaseLabel(ph, content, session);
      card.className = `card row-timer row-timer--${INT_CLASS[lab.intensity] || 'moderate'}`;
      $('eyebrow').textContent = `Abschnitt ${t.idx + 1} von ${phases.length}`;
      const big = $('big');
      big.textContent = lab.big;
      if (animate) { big.classList.remove('is-new'); void big.offsetWidth; big.classList.add('is-new'); }
      $('sub').textContent = lab.sub;
      paint($('targets'), html`
        ${lab.intensityLabel ? html`<span class="chip row-int">${lab.intensityLabel}</span>` : ''}
        ${ph.targetSpm ? html`<span class="chip chip--outline">SPM ${fmtRange(ph.targetSpm)}</span>` : ''}
        ${ph.targetRpe ? html`<span class="chip chip--outline">RPE ${fmtRange(ph.targetRpe)}</span>` : ''}`);
      const nx = phases[t.idx + 1];
      const nl = nx && H.rowPhaseLabel(nx, content, session);
      paint($('next'), nx ? html`<i class="is-${nl.intensity}"></i><span>Danach: ${nl.big} · ${H.formatClock(nx.seconds)}</span>` : html`<span>Danach: Ziel! 🏁</span>`);
      $('next').hidden = false;
    }

    function announceRowPhase(ph) {
      say(H.rowPhaseSay(ph, content, session), { priority: 'high', interrupt: true, cue: H.rowPhaseCue(ph) });
    }

    function tick() {
      const now = Date.now();
      const crossed = H.rowingTick(t, phases, now);
      if (crossed.length) {
        if (t.done) { finishTimer(); return; }
        const ph = phases[t.idx];
        if (crossed.length > 1 && now - (screen.lastTick || now) > 1500) {
          // came back from the background: re-sync instead of replaying every missed phase
          say(`Weiter: ${H.rowPhaseSay(ph, content, session)}`, { priority: 'high', interrupt: true, cue: H.rowPhaseCue(ph) });
        } else announceRowPhase(ph);
        vibrate([80, 60, 80]);
        const lab = H.rowPhaseLabel(ph, content, session);
        $('announce').textContent = `${lab.big}, ${H.formatClock(ph.seconds)}`;
        screen.lastSec = null;
        paintPhase(true);
        persist();
      }
      screen.lastTick = now;
      paintClock(now);
    }

    function paintClock(now = Date.now()) {
      const tm = H.rowingTimes(t, phases, now);
      const sec = Math.ceil(tm.phaseRemaining);
      $('clock').textContent = H.formatClock(sec);
      $('total').textContent = H.formatClock(Math.ceil(tm.totalRemaining));
      $('rowed').textContent = H.formatClock(Math.floor(tm.rowed));
      const ph = phases[t.idx];
      $('bar').style.width = ph ? `${Math.min(100, (1 - tm.phaseRemaining / ph.seconds) * 100)}%` : '100%';
      if (screen.rowRunning && sec !== screen.lastSec && screen.lastSec != null && ph) {
        if (sec > 0 && sec <= 3) {
          if (voiceActive()) say(countdownWord(sec), { priority: 'high', cue: 'count', maxAgeMs: 700, fallbackOnDrop: true, tick: false });
          else beep('tick');
        } else if (sec === 60 && ph.seconds >= 150) say('Noch eine Minute', { priority: 'normal', maxAgeMs: 2000 });
      }
      screen.lastSec = sec;
    }

    function setRunning(on) {
      const now = Date.now();
      const fresh = on && !t.done && t.idx === 0 && !(t.accMs > 0) && t.runAt == null;
      if (on) { unlock(); voiceUnlock(); H.rowingStart(t, now); } else { H.rowingPause(t, now); voiceCancel(); }
      if (fresh && phases[0]) announceRowPhase(phases[0]);
      else if (on && !t.done && phases[t.idx]) say(`Weiter. ${H.rowPhaseSay(phases[t.idx], content, session)}`, { priority: 'high', interrupt: true, cue: H.rowPhaseCue(phases[t.idx]) });
      screen.lastTick = now;
      screen.rowRunning = on && !t.done;
      clearInterval(screen.loop);
      if (screen.rowRunning) { screen.loop = setInterval(tick, 250); acquireWake(); } else releaseWake();
      const btn = $('toggle');
      if (btn) btn.textContent = screen.rowRunning ? '⏸ Pause' : (H.rowingTimes(t, phases, now).rowed > 0 ? '▶ Weiter' : '▶ Start');
      persist();
      paintClock(now);
    }

    function finishTimer() {
      clearInterval(screen.loop);
      screen.rowRunning = false;
      releaseWake();
      vibrate([200, 100, 200]);
      say(seg ? (segEntry.finisher ? 'Finisher geschafft. Stark! Gleich geht es zum Dehnen.' : 'Aufwärmen geschafft. Gleich geht es weiter.') : 'Rudern geschafft. Stark! Jetzt noch die Werte vom Display eintragen.', { priority: 'high', interrupt: true, cue: 'exercise-done' });
      persist();
      paintPhase(true);
      paintClock();
      if (main && main.painDuring == null) setTimeout(() => smooth(root.querySelector('[data-slot="pain"]')), 400);
    }

    function paintRedWarn() {
      const slot = root.querySelector('[data-slot="redwarn"]');
      if (!slot) return;
      const light = H.rowingPainLight(main, settings());
      if (light !== 'red') { slot.innerHTML = ''; return; }
      const inCool = t.done || session.exercises[phases[t.idx]?.entryIndex]?.section === 'cooldown';
      const hasCool = phases.some((p, i) => i > t.idx && session.exercises[p.entryIndex]?.section === 'cooldown');
      paint(slot, html`<section class="card stop-card" role="alert">
        <span class="traffic traffic--red">${LIGHT_LABELS.red}</span>
        <h2 class="card__title mt-2">Das Knie meldet sich deutlich</h2>
        <p class="mb-0">${main.sharpPain ? 'Stechender Schmerz' : `Schmerz ${main.painDuring}/10`} – bitte nicht weiter zügig rudern. Kluges Aufhören ist Training, kein Aufgeben.</p>
        <div class="ses-choices">
          ${!inCool && hasCool ? html`<button type="button" class="btn btn--primary btn--block" data-act="row-cool"><span aria-hidden="true">🌊</span><span>Abbrechen &amp; locker auslaufen<small>Direkt zum Ausrudern – ganz locker</small></span></button>` : ''}
          <button type="button" class="btn btn--outline btn--block" data-act="row-stop"><span aria-hidden="true">✋</span><span>Rudern jetzt beenden</span></button>
        </div>
      </section>`);
    }

    function goLog() {
      clearInterval(screen.loop);
      H.rowingPause(t, Date.now());
      screen.rowRunning = false;
      releaseWake();
      const log = t.log.slice();
      if (!t.done) log[t.idx] = Math.min(phases[t.idx].seconds, Math.round(H.rowPhaseElapsed(t, Date.now()) / 1000));
      if (!t.restored) H.applyRowingLog(session, phases, log, content);
      const rowedMain = main && !main.skipped;
      if (rowedMain && main.painDuring == null) {
        nudge(root.querySelector('[data-slot="pain"]'), 'Kurz eintragen: Knieschmerz beim Rudern.');
        return;
      }
      if (seg && main?.skipped) { persist(); goTo(H.nextIndex(session, segIdx), segIdx); return; }
      session.cursor = { index: Math.max(0, mainIdx), set: 0, step: 'rowlog' };
      persist();
      show();
      scrollTop();
    }

    screen.pauseRow = () => { if (screen.rowRunning) { setRunning(false); return true; } return false; };
    screen.cleanupRow = () => { clearInterval(screen.loop); if (screen.rowRunning) H.rowingPause(t, Date.now()); screen.rowRunning = false; releaseWake(); };
    screen.onVis = () => { if (document.visibilityState === 'visible' && screen.rowRunning) { acquireWake(); tick(); } };
    document.addEventListener('visibilitychange', screen.onVis);

    paintPhase(false);
    paintClock();
    paintRedWarn();
    if (t.done) paintPhase(false);
    else $('toggle').textContent = H.rowingTimes(t, phases, Date.now()).rowed > 0 ? '▶ Weiter' : '▶ Start';

    onChange = (e) => {
      const el = /** @type {any} */ (e.target);
      if (el.tagName !== 'PT-PAIN-SCALE' || e.type !== 'change' || !main) return;
      main.painDuring = e.detail?.value ?? el.value;
      persist();
      paintRedWarn();
      if (H.rowingPainLight(main, settings()) === 'red') smooth(root.querySelector('[data-slot="redwarn"]'));
    };
    actions = {
      menu: () => { if (screen.rowRunning) setRunning(false); openMenu(); },
      overview: () => { if (screen.rowRunning) setRunning(false); openOverview(); },
      'row-omit': () => {
        screen.cleanupRow?.();
        voiceCancel();
        if (H.rowingTimes(t, phases, Date.now()).rowed > 0) { goLog(); return; }
        segEntry.skipped = true;
        session.rowTimer = null;
        H.toast(segEntry.finisher ? 'Finisher ausgelassen' : 'Rudern ausgelassen', { icon: '↷', kind: '' });
        goTo(H.nextIndex(session, segIdx), segIdx);
      },
      'row-toggle': () => setRunning(!screen.rowRunning),
      'row-skip': () => {
        if (t.done) return;
        H.rowingSkip(t, phases, Date.now());
        if (t.done) { finishTimer(); return; }
        announceRowPhase(phases[t.idx]);
        screen.lastSec = null;
        paintPhase(true);
        paintClock();
        persist();
      },
      sharp: (b) => {
        main.sharpPain = !main.sharpPain;
        b.setAttribute('aria-pressed', String(main.sharpPain));
        persist();
        paintRedWarn();
        if (main.sharpPain) smooth(root.querySelector('[data-slot="redwarn"]'));
      },
      'row-cool': () => {
        H.rowingJumpToCooldown(t, phases, session, Date.now());
        if (t.done) { finishTimer(); paintRedWarn(); return; }
        if (!screen.rowRunning) setRunning(true);
        announceRowPhase(phases[t.idx]);
        paintPhase(true);
        paintClock();
        paintRedWarn();
        persist();
        smooth(root.querySelector('[data-slot="rt"]'));
        H.toast('Ganz locker ausrudern – gut auf dich gehört.', { icon: '🌊', kind: '' });
      },
      'row-stop': () => goLog(),
      'row-end': async () => {
        if (!t.done) {
          const was = screen.rowRunning;
          if (was) setRunning(false);
          const ok = await H.openDialog(String(html`
            <h2 class="modal__title">Rudern beenden?</h2>
            <p class="muted">Noch ${H.formatClock(Math.ceil(H.rowingTimes(t, phases, Date.now()).totalRemaining))} geplant. Was du gerudert hast, zählt natürlich.</p>
            <div class="modal__actions">
              <button type="button" class="btn btn--primary btn--block btn--session" data-value="yes">Ja, Werte eintragen</button>
              <button type="button" class="btn btn--outline btn--block btn--session" data-value="no">Weiter rudern</button>
            </div>`), { className: 'modal modal--center ses-dlg' });
          if (disposed) return;
          if (ok !== 'yes') { if (was) setRunning(true); return; }
        }
        goLog();
      },
    };
  }

  // ------------------------------------------------------------------ v2: rowing display values
  const ROW_FIELDS = [
    ['distanceM', 'Distanz', 'm', 'numeric', 'z. B. 3200'],
    ['avgSpm', 'Ø Schlagzahl', 'SPM', 'decimal', 'z. B. 21'],
    ['avgWatt', 'Ø Leistung', 'Watt', 'decimal', 'z. B. 85'],
    ['kcalDisplay', 'Kalorien', 'kcal', 'numeric', 'z. B. 160'],
    ['avgHr', 'Ø Puls', 'bpm', 'numeric', 'optional'],
    ['maxHr', 'Max. Puls', 'bpm', 'numeric', 'optional'],
  ];

  /** v4: quick display values (time, distance, kcal) of the rowing warm-up / finisher → warmupRowing / finisherRowing. */
  function renderSegRowLog() {
    const idx = session.cursor.index;
    const entry = session.exercises[idx];
    if (!entry) { goTo(-1, idx); return; }
    const key = entry.finisher ? 'finisherRowing' : 'warmupRowing';
    const fromTimer = session.rowTimer?.entry === idx && !session.rowTimer?.restored ? H.rowedSecondsFromLog(session.rowTimer.log) : 0;
    const rowed = fromTimer || (entry.sets || []).reduce((a, x) => a + (x?.done && typeof x.seconds === 'number' ? x.seconds : 0), 0);
    const r = session[key] || {};
    const draft = screen.rowDraft = screen.rowDraft || {
      duration: r.durationSec != null ? H.formatClock(r.durationSec) : rowed >= 60 ? H.formatClock(rowed) : '',
      distanceM: r.distanceM != null ? String(r.distanceM) : '',
      kcalDisplay: r.kcalDisplay != null ? String(r.kcalDisplay) : '',
    };
    const field = (k, label, unit, mode, ph) => html`<label class="field">
        <span class="field__label">${label} <span class="muted">(${unit})</span></span>
        <input class="input" type="text" inputmode="${mode}" autocomplete="off" data-row="${k}" value="${draft[k]}" placeholder="${ph}">
        <span class="ses-err" data-err="${k}" hidden></span></label>`;
    paint(root, html`
      ${topBar(titleOf(session).title, entry.finisher ? 'Finisher · Werte' : 'Aufwärmen · Werte')}
      <h1 class="ses-big-q">Kurz die Werte vom Display? 📟</h1>
      <p class="muted">Optional – ohne Eingabe zählt die Zeit vom Timer. Mit Kalorien vom Display wird die Schätzung genauer.</p>
      <section class="card row-form stack">
        <label class="field">
          <span class="field__label">Zeit <span class="muted">(Min:Sek)</span></span>
          <input class="input" type="text" inputmode="numeric" autocomplete="off" data-row="duration" value="${draft.duration}" placeholder="z. B. 10:00">
          <span class="field__hint">${rowed > 0 ? `Vom Timer: ${H.formatClock(rowed)} gerudert` : 'Leer lassen = Zeit vom Timer'}</span>
          <span class="ses-err" data-err="durationSec" hidden></span>
        </label>
        <div class="grid-2">${field('distanceM', 'Distanz', 'm', 'numeric', 'z. B. 2100')}${field('kcalDisplay', 'Kalorien', 'kcal', 'numeric', 'z. B. 80')}</div>
      </section>
      <div class="sticky-cta"><div class="ses-cta">
        <button type="button" class="btn btn--outline btn--prev" data-act="prev" aria-label="Zurück zum Timer">${raw(ICON.prev)}</button>
        <button type="button" class="btn btn--primary" data-act="rowlog-save">Speichern &amp; weiter</button>
      </div></div>
    `);
    setCta(true);
    onChange = (e) => {
      const el = /** @type {any} */ (e.target);
      const k = el.dataset?.row;
      if (!k) return;
      draft[k] = el.value;
      const err = root.querySelector(`[data-err="${k === 'duration' ? 'durationSec' : k}"]`);
      if (err) err.hidden = true;
    };
    actions = {
      menu: openMenu,
      prev: () => { session.cursor = { index: idx, set: 0, step: 'exercise' }; persist(); show(); scrollTop(); },
      'rowlog-save': () => {
        const durationSec = H.parseClock(draft.duration);
        const inp = { durationSec: Number.isNaN(durationSec) ? 'x' : durationSec, distanceM: draft.distanceM, kcalDisplay: draft.kcalDisplay };
        const res = validateRowing(inp);
        root.querySelectorAll('[data-err]').forEach((x) => { x.hidden = true; });
        if (!res.ok) {
          let first = null;
          for (const [k, msg] of Object.entries(res.errors)) {
            const el = root.querySelector(`[data-err="${k}"]`);
            if (el) { el.textContent = k === 'durationSec' && Number.isNaN(durationSec) ? 'Bitte als Min:Sek eingeben, z. B. 10:00.' : msg; el.hidden = false; first = first || el; }
          }
          nudge(first?.closest('.field'), 'Bitte die markierten Werte prüfen.');
          return;
        }
        const value = { ...res.value };
        if (value.durationSec == null && rowed > 0) value.durationSec = rowed; // incl. active rest of intervals
        session[key] = value; // never session.rowing on strength sessions (SPEC §15.3)
        session.rowTimer = null;
        go(H.nextIndex(session, idx), idx);
      },
    };
  }

  function renderRowLog() {
    if (!isCardio()) { renderSegRowLog(); return; }
    const title = titleOf(session).title;
    const rowed = H.rowedSecondsFromLog(session.rowTimer?.log);
    const r = session.rowing || {};
    const draft = screen.rowDraft = screen.rowDraft || {
      duration: r.durationSec != null ? H.formatClock(r.durationSec) : rowed >= 60 ? H.formatClock(rowed) : '',
      ...Object.fromEntries(ROW_FIELDS.map(([k]) => [k, r[k] != null ? String(r[k]).replace('.', ',') : ''])),
    };
    const field = (k, label, unit, mode, ph) => html`<label class="field">
        <span class="field__label">${label} <span class="muted">(${unit})</span></span>
        <input class="input" type="text" inputmode="${mode}" autocomplete="off" data-row="${k}" value="${draft[k]}" placeholder="${ph}">
        <span class="ses-err" data-err="${k}" hidden></span></label>`;
    paint(root, html`
      ${topBar(title, 'Werte vom Display', { xp: false })}
      <h1 class="ses-big-q">Was zeigt dein Rudergerät? 📟</h1>
      <p class="muted">Alles optional – je mehr du einträgst, desto genauer werden Kalorien, Pace und Rekorde.</p>
      <section class="card row-form stack">
        <label class="field">
          <span class="field__label">Dauer <span class="muted">(Min:Sek)</span></span>
          <input class="input" type="text" inputmode="numeric" autocomplete="off" data-row="duration" value="${draft.duration}" placeholder="z. B. 18:30">
          <span class="field__hint">${rowed > 0 ? `Vom Timer: ${H.formatClock(rowed)} gerudert${rowed < 60 ? ' – unter 1 Minute, Feld darf leer bleiben' : ''}` : 'Leer lassen = Trainingszeit der App'}</span>
          <span class="ses-err" data-err="durationSec" hidden></span>
        </label>
        <div class="grid-2">${ROW_FIELDS.slice(0, 4).map((f) => field(...f))}</div>
        <div class="row-pace" data-slot="pace"><span>Pace</span><strong data-pace>–</strong></div>
        <div class="grid-2">${ROW_FIELDS.slice(4).map((f) => field(...f))}</div>
      </section>
      <p class="text-xs muted">Ohne Kalorien vom Display schätzt die App aus Watt bzw. Dauer und Intensität (Schätzung).</p>
      <div class="sticky-cta"><div class="ses-cta">
        <button type="button" class="btn btn--outline btn--prev" data-act="prev" aria-label="Zurück zum Timer">${raw(ICON.prev)}</button>
        <button type="button" class="btn btn--primary" data-act="rowlog-save">Speichern &amp; weiter</button>
      </div></div>
    `);
    setCta(true);
    const input = () => ({
      durationSec: H.parseClock(draft.duration),
      ...Object.fromEntries(ROW_FIELDS.map(([k]) => [k, draft[k]])),
    });
    const paintPace = () => {
      const v = validateRowing({ ...input(), durationSec: Number.isNaN(input().durationSec) ? null : input().durationSec }).value;
      const pace = H.paceLabel({ durationSec: v.durationSec ?? (rowed >= 60 ? rowed : null), distanceM: v.distanceM });
      root.querySelector('[data-pace]').textContent = pace ?? '–';
    };
    paintPace();
    onChange = (e) => {
      const el = /** @type {any} */ (e.target);
      const k = el.dataset?.row;
      if (!k) return;
      draft[k] = el.value;
      const err = root.querySelector(`[data-err="${k === 'duration' ? 'durationSec' : k}"]`);
      if (err) err.hidden = true;
      paintPace();
    };
    actions = {
      menu: openMenu,
      prev: () => { session.cursor = { ...session.cursor, step: 'row' }; persist(); show(); scrollTop(); },
      'rowlog-save': () => {
        const inp = input();
        const res = validateRowing(Number.isNaN(inp.durationSec) ? { ...inp, durationSec: 'x' } : inp);
        root.querySelectorAll('[data-err]').forEach((x) => { x.hidden = true; });
        if (!res.ok) {
          let first = null;
          for (const [k, msg] of Object.entries(res.errors)) {
            const el = root.querySelector(`[data-err="${k}"]`);
            if (el) { el.textContent = k === 'durationSec' && Number.isNaN(inp.durationSec) ? 'Bitte als Min:Sek eingeben, z. B. 18:30.' : msg; el.hidden = false; first = first || el; }
          }
          nudge(first?.closest('.field'), 'Bitte die markierten Werte prüfen.');
          return;
        }
        session.rowing = res.value;
        session.cursor = { ...session.cursor, step: 'post' };
        persist();
        show();
        scrollTop();
      },
    };
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
      const icon = e.section === 'archery' ? '🏹' : e.section === 'knee' ? '🦵' : e.section === 'warmup' ? '🔥' : e.section === 'cardio' ? '🚣' : '🧘';
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
    const cardio = isCardio();
    const postOp = !!session.postOp;
    const phase = phaseOf(session);
    const draft = session.post ? clone(session.post) : H.withPostOpFlags({
      pain: null, swelling: session.pre?.swelling ?? 0, rpe: null, note: '', mechanical: { locking: false, givingWay: false },
    }, postOp);
    const last = cardio ? 0 : H.prevIndex(session, session.exercises.length);
    const tot = H.setTotals(session);
    const rowedMin = Math.round((session.rowing?.durationSec ?? H.rowedSecondsFromLog(session.rowTimer?.log)) / 60);
    paint(root, html`
      ${topBar(titleOf(session).title, 'Nach dem Training', { xp: !cardio })}
      ${cardio ? '' : progressBar(-1, 'post')}
      <h1 class="ses-big-q">${cardio ? 'Stark gerudert! 🚣' : 'Geschafft! 💪'}</h1>
      <p class="muted">${cardio ? html`<span class="num">${rowedMin}</span> Minuten auf dem Rudergerät. Noch ein kurzer Knie-Check – dann gibt’s deine Zusammenfassung.` : html`<span class="num">${tot.done}</span> Sätze erledigt. Noch ein kurzer Check – dann gibt’s dein Trefferbild.`}</p>
      ${postOp && phase?.redFlagNote ? html`<p class="ses-postop">🩺 ${phase.redFlagNote}</p>` : ''}
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
        ${postOp ? html`${checkRow('redness', 'Rötung oder Überwärmung am Knie', draft.redness)}${checkRow('fever', 'Fieber (über 38 °C)', draft.fever)}` : ''}
      </section>
      <section class="card">
        <label class="field__label" for="ses-note">Notiz (optional)</label>
        <textarea id="ses-note" class="textarea mt-2" data-f="note" rows="3" placeholder="z. B. Band gewechselt, Knie fühlte sich warm an …">${draft.note || ''}</textarea>
      </section>
      <div class="sticky-cta"><div class="ses-cta">
        <button type="button" class="btn btn--outline btn--prev" data-act="prev" aria-label="${cardio ? 'Zurück zu den Display-Werten' : 'Zurück zur letzten Übung'}" ${last < 0 ? 'disabled' : ''}>${raw(ICON.prev)}</button>
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
      else if (t.dataset?.f === 'redness' || t.dataset?.f === 'fever') draft[t.dataset.f] = t.checked;
      else return;
      session.post = clone(draft);
      persist();
    };
    actions = {
      menu: openMenu,
      prev: () => {
        session.post = clone(draft);
        if (cardio) { session.cursor = { ...session.cursor, step: 'rowlog' }; persist(); show(); scrollTop(); return; }
        if (last >= 0) go(last, last);
      },
      finish: () => {
        if (draft.pain == null) { nudge(root.querySelector('pt-pain-scale'), 'Bitte noch „Schmerz jetzt“ wählen.'); return; }
        session.post = clone(draft);
        finish();
      },
    };
  }

  /** @param {Date} [at] end time (default now; „Jetzt abschließen“ of a stale session: its last activity) */
  function finish(at) {
    const { data, session: s } = H.finishSession(store.get(), session, content, at ? { now: at } : undefined);
    store.update(() => data);
    const ok = savedOk();
    session = null;
    saved = false;
    history.replaceState(null, '', `#/session?summary=${encodeURIComponent(s.id)}`);
    renderSummary(s.id, true, { unsaved: !ok });
    scrollTop();
    say('Training geschafft – super!', { priority: 'high', interrupt: true, cue: 'exercise-done' });
  }

  // ------------------------------------------------------------------ 6. summary
  function renderSummary(id, fresh = false, { unsaved = false } = {}) {
    const s = store.getSessions().find((x) => x.id === id);
    if (!s) { navigate('/heute'); return; }
    const t = titleOf(s);
    const cardio = H.sessionKind(s) === 'cardio';
    const st = settings();
    const sc = cardio ? null : sessionScore(s, st, content);
    const light = s.traffic?.final ?? s.traffic?.provisional ?? 'green';
    const provisional = !s.traffic?.final;
    const cel = s.celebration || { xpBefore: Math.max(0, store.getState().xp - (s.xpEarned || 0)), xpAfter: store.getState().xp, badges: [], records: [] };
    const lc = H.levelChange(cel.xpBefore, cel.xpAfter);
    const gained = cel.xpAfter - cel.xpBefore;
    const durSec = cardio && s.rowing?.durationSec != null ? s.rowing.durationSec : H.durationSec(s);
    const dur = H.formatMinutes(durSec);
    const tot = H.setTotals(s);
    const hold = H.sessionHoldSeconds(s);
    const recs = cel.records || [];
    const rowRecs = cel.rowRecords || [];
    const badges = (cel.badges || []).map((b) => content.badges.find((x) => x.id === b)).filter(Boolean);
    const improved = recs.filter((r) => !r.first).length + rowRecs.filter((r) => !r.first).length;
    const energy = H.energyOf(s, store.get(), content);
    const loadHint = sameDayLoadHint(store.getSessions(), H.sessionDay(s));
    const doctor = H.needsDoctor(s.traffic?.reasons) && (light === 'stop');
    const pace = cardio ? H.paceLabel(s.rowing) : null;
    const r = s.rowing || {};
    const rowParts = cardio ? [] : H.rowingPartsSummary(s); // v4: rowing warm-up / finisher inside the strength session
    const finisherNote = !cardio && s.finisherSkipped?.length ? s.finisherSkipped[0] : '';
    const headline = cardio ? (light === 'green' ? 'Starke Ruderfahrt!' : light === 'yellow' ? 'Gut gerudert – Knie im Blick behalten.' : 'Gut, dass du auf dein Knie hörst.') : sc.headline;
    const kindChip = t.kind === 'strength' ? '' : html`<span class="chip chip--${cardio ? 'accent' : 'outline'} chip--sm">${t.kind === 'custom' ? 'Eigenes Workout' : t.kindLabel}</span>`;
    paint(root, html`
      <header class="ses-top"><div class="ses-top__title"><span class="eyebrow truncate">${t.title}</span><strong>${cardio ? 'Rudern abgeschlossen' : t.kind === 'short' ? 'Kurztraining geschafft' : 'Einheit abgeschlossen'}</strong></div>
        <span class="chip chip--gold">⚡ <span class="num">${gained}</span> XP</span></header>
      ${unsaved ? html`<section class="card stop-card ses-savewarn" role="alert" data-slot="savewarn">
          <h2 class="card__title">Konnte nicht gespeichert werden – bitte Sicherung exportieren</h2>
          <p class="mt-2">${saveReadonly() ? 'Die App ist im Nur-Lesen-Modus (Daten aus einer neueren Version). Exportiere eine Sicherung unter „Mehr“, damit dieses Training nicht verloren geht.' : 'Der Speicher des Browsers ist voll oder gesperrt. Lass diese Seite offen, versuch es erneut oder exportiere eine Sicherung unter „Mehr“.'}</p>
          <div class="btn-row"><button type="button" class="btn btn--primary" data-act="save-retry">Erneut speichern</button><a class="btn btn--outline" href="#/mehr">Sicherung exportieren</a></div>
        </section>` : ''}
      ${doctor ? html`<section class="card stop-card ses-doctor" role="alert">
          <div class="row"><span class="ses-doctor__icon" aria-hidden="true">🩺</span><h2 class="card__title mb-0">Bitte Arzt kontaktieren</h2></div>
          <p class="mt-2">In der Entlastungsphase sind das Warnzeichen. Bitte melde dich heute noch bei deinem Arzt bzw. in der Klinik – bei hohem Fieber oder starken Beschwerden sofort.</p>
          <ul class="ses-reasons mb-0">${(s.traffic?.reasons || []).filter((x) => x.startsWith(H.DOC_PREFIX)).map((x) => html`<li>${x}</li>`)}</ul>
        </section>` : ''}
      <section class="card ses-summary">
        <div class="summary-head">
          ${kindChip ? html`<div class="mb-2">${kindChip}</div>` : ''}
          ${cardio ? html`<span class="ses-hero-icon" aria-hidden="true">🚣</span>` : ''}
          <span class="traffic traffic--${light} traffic--lg">${LIGHT_LABELS[light]}</span>
          <p class="text-xs muted mt-2 mb-0">${provisional ? 'Vorläufige Ampel – morgen kurzer Folgetag-Check' : 'Finale Ampel'}</p>
          <h1 class="summary-head__title mt-4">${headline}</h1>
          <p class="summary-head__sub"><span class="xp-gain">+${gained} XP</span>${improved ? html` · ${improved} ${improved === 1 ? 'neuer Rekord' : 'neue Rekorde'}` : ''}${badges.length ? html` · ${badges.length} Abzeichen` : ''}</p>
        </div>
        ${cardio ? '' : html`<div class="target" data-slot="target"></div>`}
      </section>
      ${cardio ? html`
        <div class="grid-2 mt-4">
          <div class="stat"><span class="stat__value">${H.formatClock(durSec)}</span><span class="stat__label">Dauer</span></div>
          <div class="stat"><span class="stat__value">${r.distanceM != null ? H.formatDistance(r.distanceM).replace(/ (m|km)$/, '') : '–'}<span class="stat__unit">${r.distanceM != null ? (r.distanceM >= 10000 ? 'km' : 'm') : ''}</span></span><span class="stat__label">Distanz</span></div>
          <div class="stat"><span class="stat__value">${pace ? pace.replace(' /500 m', '') : '–'}<span class="stat__unit">${pace ? '/500 m' : ''}</span></span><span class="stat__label">Pace</span></div>
          <div class="stat stat--gold" data-kcal><span class="stat__value">${energy.kcal}<span class="stat__unit">kcal</span></span><span class="stat__label">${energy.method === 'display' ? 'Kalorien · vom Display' : 'Kalorien · Schätzung'}</span></div>
        </div>
        ${r.avgSpm != null || r.avgWatt != null || r.avgHr != null ? html`<div class="chip-row mt-2">
          ${r.avgSpm != null ? html`<span class="chip chip--outline">Ø ${String(r.avgSpm).replace('.', ',')} SPM</span>` : ''}
          ${r.avgWatt != null ? html`<span class="chip chip--outline">Ø ${Math.round(r.avgWatt)} W</span>` : ''}
          ${r.avgHr != null ? html`<span class="chip chip--outline">Ø Puls ${r.avgHr}</span>` : ''}
          ${r.maxHr != null ? html`<span class="chip chip--outline">Max. Puls ${r.maxHr}</span>` : ''}
        </div>` : ''}
        <p class="text-xs muted mt-2">Rudern zählt nicht für die A/B/C-Rotation – dein nächstes Krafttraining bleibt unverändert.</p>`
      : html`
        <div class="grid-2 mt-4">
          <div class="stat"><span class="stat__value">${dur.value}<span class="stat__unit">${dur.unit}</span></span><span class="stat__label">${rowParts.length ? 'Gesamtzeit' : 'Dauer'}</span></div>
          <div class="stat"><span class="stat__value">${tot.done}<span class="stat__unit">/${tot.planned}</span></span><span class="stat__label">Sätze</span></div>
          <div class="stat"><span class="stat__value">${hold >= 60 ? formatDuration(hold) : hold}<span class="stat__unit">${hold >= 60 ? 'min' : 's'}</span></span><span class="stat__label">Gehalten</span></div>
          <div class="stat stat--gold" data-kcal><span class="stat__value">${energy.kcal}<span class="stat__unit">kcal</span></span><span class="stat__label">${rowParts.length ? 'Kalorien + Rudern' : 'Kalorien · Schätzung'}</span></div>
        </div>
        ${rowParts.length ? html`<section class="card ses-rowparts mt-4" data-rowparts>
          <p class="field__label mb-2">🚣 Rudern in dieser Einheit</p>
          <p class="mb-0">${rowParts.map((x) => x.text).join('; ')}</p>
          <p class="text-xs muted mt-2 mb-0">Zählt für Ruder-Minuten und Distanz – nicht als eigene Rudereinheit im Wochenziel. Kalorien: Schätzung (mit Display-Wert, wenn eingetragen).</p>
        </section>` : ''}
        ${finisherNote ? html`<p class="text-xs muted mt-2" data-finisher-note>Kein Ruder-Finisher heute: ${finisherNote}</p>` : ''}`}
      ${loadHint ? html`<div class="banner banner--gold mt-4"><span class="banner__icon">⚖️</span><span class="banner__body"><span class="banner__title">Rudern + Kraft am selben Tag</span><span class="banner__text">${loadHint}</span></span></div>` : ''}
      <section class="card mt-4">
        <h2 class="card__title">Warum ${LIGHT_LABELS[light].split(' – ')[0]}?</h2>
        <ul class="ses-reasons mb-0">${(s.traffic?.reasons || []).map((x) => html`<li>${x}</li>`)}</ul>
      </section>
      <section class="card">
        ${raw(xpBar({ xp: cel.xpAfter, level: lc.after, nextTitle: LEVELS[lc.after.index + 1]?.title }))}
        ${lc.up ? html`<div class="ses-levelup"><span style="font-size:28px">🏆</span><span>Neue Stufe: ${lc.after.title}!</span></div>` : ''}
      </section>
      ${recs.length || rowRecs.length ? html`<h2 class="section-title">Bestwerte</h2><div class="ses-records">
        ${rowRecs.map((x) => html`<span class="chip chip--record">★ ${x.first ? 'Erster Bestwert' : 'Neuer Rekord!'} · ${H.ROW_RECORD_LABELS[x.key]} ${H.rowRecordValue(x.key, x.value)}</span>`)}
        ${recs.map((x) => html`<span class="chip chip--record">★ ${x.first ? 'Erster Bestwert' : 'Neuer Rekord!'} · ${H.RECORD_LABELS[x.key]} ${H.recordValue(x.key, x.value, st)}</span>`)}</div>` : ''}
      ${badges.length ? html`<h2 class="section-title">Neue Abzeichen</h2><ul class="ses-badges">${badges.map((b) => html`<li class="badge-tile is-unlocked is-new"><span class="badge-tile__icon">${b.icon}</span><span class="badge-tile__name">${b.name}</span><span class="badge-tile__hint">heute</span></li>`)}</ul>` : ''}
      <h2 class="section-title">Empfehlungen</h2>
      <div class="stack stack--sm" data-slot="recs">${H.recCardsHtml(s, content)}</div>
      <div class="banner banner--gold mt-4"><span class="banner__icon">🌤️</span><span class="banner__body"><span class="banner__title">Morgen: Folgetag-Check</span><span class="banner__text">30 Sekunden – macht die Ampel final. Erinnerung erscheint auf „Heute“.</span></span></div>
      <div class="sticky-cta"><button type="button" class="btn btn--primary btn--block btn--session" data-act="done">Fertig – zu Heute</button></div>
    `);
    setCta(true);
    if (sc) root.querySelector('[data-slot="target"]')?.appendChild(targetFace(sc.results, { label: `Trefferbild: ${sc.points} von ${sc.max} Punkten` }));
    onChange = () => {};
    let warnedLeave = false;
    actions = {
      done: () => {
        if (!warnedLeave && root.querySelector('[data-slot="savewarn"]') && !savedOk()) {
          warnedLeave = true;
          H.toast('Noch nicht gespeichert – erst „Erneut speichern“ oder Sicherung exportieren. Nochmal tippen zum Verlassen.', { icon: '⚠️', kind: 'accent', ms: 4000 });
          return;
        }
        navigate('/heute');
      },
      'save-retry': () => {
        store.update((d) => d);
        if (savedOk()) {
          root.querySelector('[data-slot="savewarn"]')?.remove();
          H.toast('Gespeichert', { icon: '✓', kind: 'success' });
        } else H.toast('Speichern klappt noch nicht – bitte Sicherung exportieren.', { icon: '⚠️', kind: 'accent', ms: 3600 });
      },
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

  // ------------------------------------------------------------------ screen awake during exercises
  // Voice cues only work while Chrome keeps the page in the foreground → keep the screen on during the
  // exercise screens (not only while a timer runs) when announcements are enabled.
  let exWake = null;
  async function holdScreenAwake() {
    try {
      const st = settings();
      const wl = navigator.wakeLock;
      if (!wl || exWake || st.sound === false || st.voiceEnabled === false || document.visibilityState !== 'visible') return;
      const lock = await wl.request('screen');
      if (disposed || session?.cursor?.step !== 'exercise') { lock.release().catch(() => {}); return; }
      exWake = lock;
      lock.addEventListener?.('release', () => { if (exWake === lock) exWake = null; });
    } catch { /* unsupported / not allowed */ }
  }
  function letScreenSleep() {
    const lock = exWake;
    exWake = null;
    if (lock) lock.release().catch(() => {});
  }
  const onWakeVis = () => { if (document.visibilityState === 'visible' && session?.cursor?.step === 'exercise') holdScreenAwake(); };
  document.addEventListener('visibilitychange', onWakeVis);

  // ------------------------------------------------------------------ dispatcher
  function leaveScreen() {
    screen.cleanupRow?.();
    if (screen.onVis) document.removeEventListener('visibilitychange', screen.onVis);
    (screen.observers || []).forEach((o) => o.disconnect());
  }

  function show() {
    leaveScreen();
    screen = {};
    const step = session.cursor?.step || 'pre';
    if (step === 'row') renderRow();
    else if (step === 'rowlog') renderRowLog();
    else if (step === 'finisher') renderFinisherOffer();
    else if (step === 'exercise') { if (isRowEntry(session.exercises[session.cursor.index])) renderRow(); else renderExercise(); }
    else if (step === 'post') renderPost();
    else renderPre();
    armGuard();
    if (step === 'exercise') holdScreenAwake(); else letScreenSleep();
  }

  // ------------------------------------------------------------------ dead time: hide / kill / heartbeat (P1-2)
  // Hidden or killed → `pausedAt` (dead time is excluded from duration and kcal) and the rowing timer pauses.
  // While in use the session stores `lastActiveAt` at least every HEARTBEAT_MS, so a killed app resumes from there.
  const markStopped = () => {
    if (!session || !saved || leaving || disposed) return;
    if (!session.pausedAt) session.pausedAt = new Date().toISOString();
    if (screen.pauseRow?.()) screen.rowPausedByHide = true; // setRunning(false) also persists
    persist();
  };
  const markResumed = () => {
    if (!session || !saved || leaving || disposed || !session.pausedAt) return;
    H.applyResume(session);
    persist();
    if (screen.rowPausedByHide) {
      screen.rowPausedByHide = false;
      H.toast('Rudern pausiert – tippe „▶ Weiter“, wenn du wieder sitzt.', { icon: '⏸', kind: 'accent', ms: 3600 });
    }
  };
  const onLifeVis = () => { if (document.visibilityState === 'hidden') markStopped(); else markResumed(); };
  const onPageHide = () => markStopped();
  const onPageShow = (e) => { if (e.persisted) markResumed(); };
  document.addEventListener('visibilitychange', onLifeVis);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  const heartbeat = setInterval(() => {
    if (!session || !saved || disposed || leaving || session.pausedAt || document.visibilityState !== 'visible') return;
    if (Date.now() - lastBeat >= H.HEARTBEAT_MS) persist();
  }, 5000);

  function cleanup() {
    disposed = true;
    clearInterval(heartbeat);
    leaveScreen();
    letScreenSleep();
    document.removeEventListener('visibilitychange', onWakeVis);
    document.removeEventListener('visibilitychange', onLifeVis);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    voiceCancel();
    root.removeEventListener('click', onGuard, true);
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
  const paintWaiting = () => paint(root, html`<section class="card"><p class="muted mb-0">Training wird geladen …</p></section>`);
  const fmtWhen = (ms) => {
    try {
      return new Date(ms).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return new Date(ms).toISOString(); }
  };

  /** Rowed seconds of a rowing timer that was still open when a stale session is finished („Jetzt abschließen“). */
  function flushRowTimer(atMs) {
    const t = session?.rowTimer;
    if (!t || t.restored) return;
    H.rowingPause(t, atMs);
    const seg = !isCardio();
    const segIdx = seg ? (t.entry ?? -1) : -1;
    if (seg && segIdx < 0) return;
    const phases = seg
      ? rowingPhases({ exercises: session.exercises.map((e, i) => (i === segIdx ? { ...e, skipped: false } : { skipped: true })) }, content)
      : rowingPhases(session, content);
    if (!phases.length) return;
    const log = (t.log || []).slice();
    if (!t.done && phases[t.idx]) log[t.idx] = Math.min(phases[t.idx].seconds, Math.round(H.rowPhaseElapsed(t, atMs) / 1000));
    if (log.some((n) => n > 0)) H.applyRowingLog(session, phases, log, content, new Date(atMs).toISOString());
  }

  /** P1-5: the stored session is broken (or was dropped by the store at boot). */
  function renderBroken(active, dropped) {
    const name = (active && typeof active === 'object' && (active.workoutName || '')) || (dropped && typeof dropped === 'object' && (dropped.workoutName || dropped.name || '')) || '';
    paint(root, html`<section class="card stop-card ses-broken" role="alert">
        <h1 class="card__title">Dieses Training kann nicht fortgesetzt werden.</h1>
        <p class="mt-2">Die gespeicherte Einheit${name ? html` „${name}“` : ''} ist unvollständig oder stammt aus einer älteren Version. Deine abgeschlossenen Trainings sind nicht betroffen.</p>
        <div class="ses-choices">
          <button type="button" class="btn btn--primary btn--block btn--session" data-act="broken-discard">Verwerfen</button>
          <button type="button" class="btn btn--outline btn--block btn--session" data-act="broken-home">Zu Heute</button>
        </div>
      </section>`);
    setCta(false);
    armGuard();
    onChange = () => {};
    actions = {
      'broken-discard': () => {
        // droppedActiveSession is shown and reset by app.js (WP-1) – only acknowledge it locally
        brokenAck = true;
        if (active) store.update((d) => { d.state.activeSession = null; });
        H.toast('Verworfen', { icon: '🗑', kind: '' });
        boot();
      },
      'broken-home': () => navigate('/heute'),
    };
  }

  /** P2-2: ?workout=<unknown id> */
  function renderNotFound(id) {
    paint(root, html`<section class="card"><div class="empty"><div class="empty__art" aria-hidden="true" style="font-size:44px">🔎</div>
      <h2 class="empty__title">Kein Training gefunden</h2>
      <p class="empty__text">Das Workout „${id}“ gibt es nicht (mehr) – vielleicht wurde ein eigenes Workout gelöscht. Wähle im Plan ein anderes.</p>
      <a class="btn btn--primary" href="#/plan">Zum Plan</a> <a class="btn btn--outline" href="#/heute">Zu Heute</a></div></section>`);
    setCta(false);
  }

  /** Resume the stored active session (dead time excluded; > 12 h untouched → ask first). */
  async function resume(s) {
    session = s;
    saved = true;
    const info = H.resumeInfo(session);
    if (info.stale) {
      paintWaiting();
      const name = titleOf(session).title;
      const v = await H.openDialog(String(html`
        <h2 class="modal__title">„${name}“ ist noch offen</h2>
        <p class="muted">Zuletzt trainiert: ${fmtWhen(info.stopMs)}. Die Zeit dazwischen zählt nicht als Trainingszeit.</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--primary btn--block btn--session" data-value="resume">Fortsetzen</button>
          <button type="button" class="btn btn--outline btn--block btn--session" data-value="finish">Jetzt abschließen</button>
          <button type="button" class="btn btn--danger btn--block" data-value="discard">Verwerfen</button>
        </div>`), { className: 'modal modal--center ses-dlg' });
      if (disposed) return;
      if (v === 'finish') {
        flushRowTimer(info.stopMs);
        session.pausedAt = new Date(info.stopMs).toISOString();
        finish(new Date(info.stopMs));
        return;
      }
      if (v === 'discard') {
        leaving = true;
        session = null;
        saved = false;
        store.update((d) => { d.state.activeSession = null; });
        H.toast('Training verworfen', { icon: '🗑', kind: '' });
        navigate('/heute');
        return;
      }
    }
    H.applyResume(session);
    persist();
    if (['exercise', 'post', 'row', 'rowlog', 'finisher'].includes(session.cursor?.step)) {
      setTimeout(() => { if (!disposed && !leaving) H.toast('Willkommen zurück – weiter geht’s!', { icon: '▶', kind: 'success' }); }, 300);
    }
    show();
  }

  /** Plan a new session for `workout` and show the start screen (not stored before „Los geht’s“). */
  function startNew(workout) {
    const data = store.get();
    if (!workout) {
      paint(root, html`<section class="card"><div class="empty"><h2 class="empty__title">Kein Training gefunden</h2><p class="empty__text">Für die aktuelle Phase ist kein Workout hinterlegt.</p><a class="btn btn--primary" href="#/plan">Zum Plan</a> <a class="btn btn--outline" href="#/heute">Zu Heute</a></div></section>`);
      return;
    }
    const kind = workoutKind(workout);
    // Taper (§5.2) only concerns the strength-type prehab sessions; rowing stays as planned up to the OP day.
    const taper = kind !== 'cardio' && taperActive(data.settings.surgeryDate, todayISO());
    // v4: rowing warm-up per settings.rowWarmupDefault (toggle on the start screen); the finisher is always asked
    // after the strength part (renderFinisherOffer), never planned up front.
    const plan = buildSessionPlan(workout, data.state, content, { taper, history: data.sessions, settings: data.settings, rowFinisher: false });
    plan.kind = kind;
    plan.workoutName = workout.name;
    plan.pausedMs = 0;
    if (!plan.exercises.length) {
      const rower = ownsRowingMachine(data.settings);
      const postop = (content.phases.find((p) => p.id === data.state.phaseId) ?? phaseOf(plan))?.kind === 'postop';
      paint(root, html`<section class="card"><div class="empty"><div class="empty__art" aria-hidden="true" style="font-size:44px">${kind === 'cardio' ? '🚣' : '🩺'}</div>
        <h2 class="empty__title">${kind === 'cardio' && postop ? 'Rudern ist gerade gesperrt' : kind === 'cardio' && !rower ? 'Rudergerät nicht abgehakt' : 'Keine Übungen verfügbar'}</h2>
        <p class="empty__text">${postop ? 'In der Entlastungsphase nach der OP sind diese Übungen nicht freigegeben. Bitte halte dich an das Protokoll deines Teams.' : kind === 'cardio' && !rower ? 'Rudergerät in Ausrüstung abhaken, dann kannst du diese Einheit starten.' : 'Alle Übungen dieses Workouts sind deaktiviert, für deine Phase noch nicht freigegeben oder brauchen Ausrüstung, die du nicht abgehakt hast.'}</p>
        ${kind === 'cardio' && !rower && !postop ? html`<a class="btn btn--accent" href="#/ausruestung">Zu Meine Ausrüstung</a> ` : ''}<a class="btn btn--primary" href="#/heute">Zu Heute</a></div></section>`);
      return;
    }
    session = plan;
    saved = false;
    show();
  }

  let brokenAck = false;
  async function boot() {
    const data = store.get();
    const active = data.state.activeSession;
    const dropped = brokenAck ? null : data.state.droppedActiveSession;
    if ((active && !H.validActiveSession(active, content)) || (!active && dropped)) { renderBroken(active, dropped); return; }
    const wanted = query.workout ? getWorkout(query.workout, content, data.state) : null;
    if (active) {
      if (wanted && query.workout !== active.workoutId) {
        // P1-3: another workout was opened while a session is still active → ask, never resume silently
        paintWaiting();
        const oldName = titleOf(active).title;
        const v = await H.openDialog(String(html`
          <h2 class="modal__title">Du hast noch „${oldName}“ offen.</h2>
          <p class="muted">Du kannst dort weitermachen oder es verwerfen und „${wanted.name}“ starten.</p>
          <div class="modal__actions">
            <button type="button" class="btn btn--primary btn--block btn--session" data-value="keep">Weiter mit ${oldName}</button>
            <button type="button" class="btn btn--outline btn--block btn--session" data-value="discard">Verwerfen &amp; ${wanted.name} starten</button>
          </div>`), { className: 'modal modal--center ses-dlg' });
        if (disposed) return;
        if (v === 'discard') {
          store.update((d) => { d.state.activeSession = null; });
          startNew(wanted);
          return;
        }
        try { history.replaceState(null, '', '#/session'); } catch { /* ignore */ }
      }
      await resume(clone(active));
      return;
    }
    if (query.workout && !wanted) { renderNotFound(query.workout); return; }
    startNew(wanted || nextWorkout(data.state, content.phases, content.workouts));
  }

  if (query.summary) {
    renderSummary(query.summary, false);
    return cleanup;
  }
  boot();
  return cleanup;
}
