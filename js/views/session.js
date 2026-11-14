// Training session flow – see docs/SPEC.md §4.2 (WP-Session-flow).
// Steps: pre-check → exercises (warmup → knee → archery → cooldown) → post-check → summary.
// v2 (§12): any workout kind (strength/short/custom via the same flow; cardio = pre-check → guided
// rowing timer (step "row") → display values (step "rowlog") → post-check → summary with kcal).
// Post-op sessions (session.postOp) additionally ask redness + fever and show „Arzt kontaktieren“.
// The active session lives in store.state.activeSession and is persisted after every tap
// (cursor {index, set, step}); reloading #/session resumes it. Summary: #/session?summary=<id>.
import { html, raw, render as paint } from '../render.js';
import { nextWorkout, buildSessionPlan, getWorkout, workoutKind, canRowWarmup, finisherPlan, finisherEligible, appendFinisher } from '../logic/progression.js';
import { ownsRowingMachine, officeChairOnly, OFFICE_CHAIR_NOTE } from '../logic/equipment.js';
import { shortFor, stepsFor, feelFor, setupFor, setupHeadline } from '../logic/exercise-text.js';
import { shoulderProtect, isShoulderExercise, SHOULDER_NOTE, DRAW_NOTE } from '../logic/shoulder.js';
import { estimateWorkoutMinutes } from '../logic/duration.js';
import { rowingPhases, validateRowing } from '../logic/cardio.js';
import { sameDayLoadHint } from '../logic/stats.js';
import { taperActive, LIGHT_LABELS } from '../logic/traffic-light.js';
import { sessionScore, LEVELS } from '../logic/motivation.js';
import { todayISO, formatDuration } from '../util/date.js';
import { unlock } from '../util/audio.js';
import { say, cancel as voiceCancel, unlock as voiceUnlock, cueVibrate } from '../util/voice.js';
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
          <span>${raw(ICON.list)}${cardio ? `${rowingPhases(session, content).length} Teile` : html`<span class="num" data-count>${vis.length}</span>&nbsp;Übungen`}</span>
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

  /** v5.4 (SPEC §19.1): every rep exercise with a tempo runs with the Tempo-Coach unless „Lieber selbst zählen“. */
  const tempoCoachOn = (dose, entry) => H.tempoCoachActive(dose, entry);

  function timerMarkup(dose, entry) {
    const blk = H.timerBlock(entry?.section);
    if (dose.type === 'hold') {
      const reps = (dose.reps ?? 1) * (dose.perSide ? 2 : 1);
      return html`<pt-timer mode="hold" block="${blk}" seconds="${dose.hold ?? 10}" reps="${reps}" rest-between="${dose.perSide && (dose.reps ?? 1) === 1 ? 5 : dose.restBetween}" data-role="work"></pt-timer>
        <p class="ses-hint">${dose.perSide ? 'Seitenwechsel in der kurzen Pause. ' : ''}Unten „Satz starten“ – der Satz wird nach dem Timer automatisch abgehakt.</p>`;
    }
    if (dose.type === 'timed') {
      if (dose.perSide) {
        return html`<pt-timer mode="hold" block="${blk}" seconds="${dose.seconds ?? 30}" reps="2" rest-between="5" data-role="work"></pt-timer>
          <p class="ses-hint">Unten „Satz starten“: erst eine Seite, nach der kurzen Pause die andere. Satz wird danach automatisch abgehakt.</p>`;
      }
      return html`<pt-timer mode="set" block="${blk}" seconds="${dose.seconds ?? 30}" data-role="work"></pt-timer>
        <p class="ses-hint">Unten „Satz starten“ – der Satz wird nach dem Timer automatisch abgehakt.</p>`;
    }
    if (tempoCoachOn(dose, entry)) {
      return html`<div data-slot="tempo"><pt-timer compact mode="set" block="${blk}" reps="${dose.reps ?? 10}" tempo="${dose.tempo}" data-role="work"></pt-timer>
        <p class="ses-hint">Tempo-Coach ${dose.tempo}: unten „Satz starten“ tippen, dann führt die Stimme. Der Satz wird danach abgehakt.</p>
        <button type="button" class="ses-link" data-act="tempo-manual">Lieber selbst zählen</button></div>`;
    }
    // plain reps (or manual tempo): v5.3 – the big bottom button reads „Satz fertig“ (SPEC §18.2)
    return html`<p class="ses-hint ses-hint--big">Nach jedem Satz unten auf <strong>„Satz fertig“</strong> tippen – die Satzpause startet automatisch.</p>
      ${dose.tempo ? html`<button type="button" class="btn btn--soft btn--block btn--session mt-3" data-act="tempo">Tempo-Coach · ${dose.tempo}</button>
        <p class="ses-hint">Gibt den Takt vor (Hoch–Halten–Runter) – mit 5 s „Bereit machen“ und Ansage.</p>` : ''}`;
  }

  /**
   * v5.3 (verständliche Anleitungen): always-visible „short“ line + numbered steps directly below the figure, then the
   * collapsible „Mehr Details“ (Ausgangsposition incl. equipment setup, feel, cues, mistakes, knee/shoulder notes).
   */
  function howtoMarkup(ex, sec) {
    const archery = sec === 'archery';
    const setup = setupFor(ex, settings(), { chair: false });
    const feel = feelFor(ex);
    return html`<div class="ses-howto" data-howto>
        ${shortFor(ex) ? html`<p class="ses-howto__short" data-short>${shortFor(ex)}</p>` : ''}
        <ol class="steps ses-steps" data-steps>${stepsFor(ex).map((x) => html`<li>${x}</li>`)}</ol>
      </div>
      <details class="disclosure ses-more" data-more>
        <summary>Mehr Details</summary>
        <div class="stack stack--sm">
          ${setup.length ? html`<p class="field__label mb-0">Ausgangsposition</p><ul class="ses-setup-list" data-setup-list>${setup.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
          ${feel ? html`<p class="ses-feel mb-0" data-feel>🎯 ${feel}</p>` : ''}
          ${ex.cues?.length ? html`<p class="field__label mb-0 mt-2">Darauf achten</p><div class="chip-row">${ex.cues.map((c) => html`<span class="chip chip--${archery ? 'archery' : 'knee'}">${c}</span>`)}</div>` : ''}
          ${ex.mistakes?.length ? html`<p class="field__label mb-0 mt-2">Typische Fehler</p><ul class="ses-reasons">${ex.mistakes.map((m) => html`<li>${m}</li>`)}</ul>` : ''}
          ${ex.kneeNote ? html`<p class="ses-consult mb-0">🦵 ${ex.kneeNote}</p>` : ''}
          ${ex.description && ex.description !== shortFor(ex) ? html`<p class="text-sm muted mb-0">${ex.description}</p>` : ''}
        </div>
      </details>`;
  }

  /** Collapse „Mehr Details“ so the timer card stays visible above the sticky button during a set. */
  function collapseMore() {
    const d = /** @type {HTMLDetailsElement|null} */ (root.querySelector('details[data-more]'));
    if (d?.open) d.open = false;
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
    const hasWorkTimer = compactFig;
    const cta0 = H.ctaState({ allDone, hasNext: next >= 0, timerLed: hasWorkTimer, timerState: 'idle' });
    const shoulderHint = shoulderProtect(settings()) && (isShoulderExercise(ex) || ex.archeryDraw) ? (ex.archeryDraw ? DRAW_NOTE : SHOULDER_NOTE) : '';
    const chairHint = officeChairOnly(ex, settings()) ? OFFICE_CHAIR_NOTE : '';
    const samePain = knee ? H.prevKneePain(session, idx, content) : null;
    paint(root, html`
      ${topBar(`Übung ${pos.pos} von ${pos.total} · ${titleOf(session).title}`, '', { ex: { name: ex.name, side: sideShort } })}
      ${progressBar(idx, 'exercise')}
      <div class="row row--between">
        <div class="block-header block-header--${sec}" style="margin:0"><span class="block-header__dot"></span>${H.SECTION_LABELS[sec]}<span class="block-header__count">${pos.secPos}/${pos.secTotal}</span></div>
        <button type="button" class="btn btn--ghost btn--sm ses-ovw" data-act="overview">${raw(ICON.list)}Übersicht</button>
      </div>
      <section class="card ses-ex mt-4">
        <div class="row row--between row--top">
          <h1 class="card__title">${ex.name}</h1>
          <span class="chip chip--${archery ? 'archery' : 'knee'} chip--sm" style="flex:none">Stufe ${(entry.level ?? 0) + 1}/${ex.levels.length}</span>
        </div>
        <div class="ses-fig ${compactFig ? 'ses-fig--compact' : ''}"><pt-figure aspect="${compactFig ? '2.2' : '1.5'}" exercise-id="${ex.id}" level="${entry.level ?? 0}" ${dose.band ? html`band-id="${dose.band}"` : ''} aria-label="${ex.name}"></pt-figure></div>
        ${howtoMarkup(ex, sec)}
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
        ${chairHint ? html`<p class="ses-note" data-chair-note>💺 ${chairHint}</p>` : ''}
        ${shoulderHint ? html`<p class="ses-note" data-shoulder-note>🛡️ ${shoulderHint}</p>` : ''}
        ${entry.fallbackFrom ? html`<p class="ses-note text-sm muted">Statt ${content.exercises.find((e) => e.id === entry.fallbackFrom)?.name ?? ''} (passend zu deiner Ausrüstung bzw. Schulter).</p>` : ''}
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
      ${timer ? html`<section class="card ses-timer" data-slot="timer" ${allDone ? 'hidden' : ''}>${setupHeadline(ex) ? html`<p class="ses-setup" data-setup><span aria-hidden="true">📍</span> ${setupHeadline(ex)}</p>` : ''}<p class="ses-setno" data-setno>${allDone ? '' : `Satz ${Math.min(dose.sets, H.doneCount(entry) + 1)} von ${dose.sets}`}</p>${timer}
        ${hasWorkTimer ? html`<details class="ses-tctl"><summary>Timer anpassen</summary><div class="ses-tctl__row">
          <button type="button" class="btn btn--outline btn--sm" data-act="t-minus" aria-label="15 Sekunden weniger">−15 s</button>
          <button type="button" class="btn btn--outline btn--sm" data-act="t-plus" aria-label="15 Sekunden mehr">+15 s</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="t-reset">Zurücksetzen</button></div></details>` : ''}</section>` : ''}
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
      <button type="button" class="ses-link ses-skip" data-act="skip">Übung überspringen</button>
      <div class="sticky-cta"><div class="ses-cta">
        <button type="button" class="btn btn--outline btn--prev" data-act="prev" aria-label="Vorherige Übung" ${prev < 0 ? 'disabled' : ''}>${raw(ICON.prev)}</button>
        <button type="button" class="btn btn--primary ses-cta__main ${allDone ? 'ses-pulse' : ''}" data-act="cta" data-cta="${cta0.key}">${cta0.label}</button>
      </div></div>
    `);
    setCta(true);
    armGuard();
    wireWorkTimer(entry, dose);
    wireLongPress(entry, dose);
    // v5.3 (SPEC §18.2): the big button follows the set: Satz starten → Anhalten/Weiter → Pause überspringen → Nächste Übung
    const ctaFacts = () => {
      const work = root.querySelector('pt-timer[data-role="work"]');
      return {
        allDone: H.doneCount(entry) >= dose.sets,
        hasNext: next >= 0,
        resting: !!screen.resting,
        timerLed: !!work && timerLed(dose),
        timerState: work?.dataset?.state || 'idle',
      };
    };
    screen.refreshCta = () => {
      const b = root.querySelector('[data-act="cta"]');
      if (!b) return;
      const st = H.ctaState(ctaFacts());
      if (b.dataset.cta !== st.key) { b.dataset.cta = st.key; b.textContent = st.label; }
      b.classList.toggle('ses-pulse', st.key === 'next' || st.key === 'finish');
    };
    screen.refreshCta();

    const hidePainSame = () => { const el = root.querySelector('[data-pain-same]'); if (el) el.hidden = entry.painDuring != null; };
    onChange = (e) => {
      const t = /** @type {any} */ (e.target);
      if (t.tagName !== 'PT-PAIN-SCALE' || e.type !== 'change') return;
      if (t.dataset.f === 'painDuring') { entry.painDuring = e.detail?.value ?? t.value; persist(); bumpXp(); hidePainSame(); }
      if (t.dataset.f === 'rpe') { entry.rpe = e.detail?.value ?? t.value; persist(); }
    };

    const activeTimer = () => (screen.resting ? root.querySelector('pt-timer[data-role="rest"]') : root.querySelector('pt-timer[data-role="work"]'));
    actions = {
      menu: openMenu,
      overview: openOverview,
      adjust: () => openAdjust(entry, ex, null),
      cta: () => {
        // P1-1 double taps: the label changes under the finger – ignore a second tap for a moment
        if (perfNow() - (screen.ctaAt ?? -1e9) < 700) return;
        screen.ctaAt = perfNow();
        unlock();
        voiceUnlock();
        const st = H.ctaState(ctaFacts());
        const work = root.querySelector('pt-timer[data-role="work"]');
        if (st.key === 'next' || st.key === 'finish') { actions.next(); return; }
        if (st.key === 'skip-rest') { afterRest(); screen.refreshCta?.(); return; }
        if (st.key === 'start' || st.key === 'set-done') collapseMore();
        if (st.key === 'start' && work) {
          applyWorkPlan(work, entry);
          work.start();
          toTimer(root.querySelector('[data-slot="timer"]'));
        } else if (st.key === 'pause' && work) work.pause();
        else if (st.key === 'resume' && work) work.start();
        else if (st.key === 'set-done') {
          const open = H.nextOpenSet(entry, dose.sets);
          if (open >= 0) { armGuard(700); completeSet(entry, dose, open); }
        }
        screen.refreshCta?.();
      },
      't-minus': () => { activeTimer()?.adjust(-15); },
      't-plus': () => { activeTimer()?.adjust(15); },
      't-reset': () => { const t = activeTimer(); if (t && !screen.resting) { t.reset(); applyWorkPlan(t, entry); screen.refreshCta?.(); } },
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
      tempo: () => {
        voiceUnlock();
        collapseMore();
        entry.manualTempo = false;
        delete entry.tempoCoach;
        persist();
        renderExercise();
        const card = root.querySelector('[data-slot="timer"]');
        root.querySelector('pt-timer[data-role="work"]')?.start();
        toTimer(card);
        screen.refreshCta?.();
      },
      'tempo-manual': () => {
        entry.manualTempo = true;
        delete entry.tempoCoach;
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
    screen.refreshCta?.();
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
    t?.addEventListener('done', (e) => { if (e.target === t) { afterRest(); screen.refreshCta?.(); } });
    setTimeout(() => smooth(slot.firstElementChild), 120);
    screen.refreshCta?.();
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
      smooth(root.querySelector('.set-check.is-current') || root.querySelector('.ses-ex'));
    }
    screen.refreshCta?.();
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
      screen.refreshCta?.();
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

  // ------------------------------------------------------------------ v5.3: rowing without a timer (SPEC §18.5)
  // Warm-up, finisher and separate rowing sessions show a card with goal + instructions. The user rows by the
  // display of the machine, then ticks „Erledigt“, enters the minutes (pre-filled with the goal) and optionally the
  // display values. Stored in the same fields as before (sets with seconds, warmupRowing / finisherRowing / rowing).
  const ROW_FIELDS = [
    ['distanceM', 'Distanz', 'm', 'numeric', 'z. B. 3200'],
    ['kcalDisplay', 'Kalorien', 'kcal', 'numeric', 'z. B. 160'],
    ['avgWatt', 'Ø Leistung', 'Watt', 'decimal', 'z. B. 85'],
    ['avgSpm', 'Ø Schlagzahl', 'SPM', 'decimal', 'z. B. 21'],
    ['avgHr', 'Ø Puls', 'bpm', 'numeric', 'optional'],
  ];

  function renderRow() {
    const seg = !isCardio();
    const segIdx = seg ? session.cursor.index : -1;
    const idxs = seg ? [segIdx] : session.exercises.map((e, i) => i).filter((i) => !!exById(session.exercises[i].exerciseId));
    const entries = idxs.map((i) => session.exercises[i]).filter(Boolean);
    if (!entries.length) {
      if (seg) { goTo(H.nextIndex(session, segIdx), segIdx); return; }
      session.cursor = { index: 0, set: 0, step: 'post' }; persist(); return show();
    }
    const mainIdx = seg ? segIdx : Math.max(0, H.mainCardioIndex(session));
    const main = session.exercises[mainIdx];
    const mainEx = exById(main.exerciseId);
    const briefs = entries.map((e) => ({ e, ex: exById(e.exerciseId), b: H.rowingBrief(e, exById(e.exerciseId)) }));
    const mainBrief = H.rowingBrief(main, mainEx);
    const plannedSec = briefs.reduce((a, x) => a + (x.b.seconds || 0), 0);
    const key = seg ? (main.finisher ? 'finisherRowing' : 'warmupRowing') : 'rowing';
    const stored = session[key] || {};
    const done = entries.some((e) => H.doneCount(e) > 0);
    const segName = !seg ? 'Rudern' : main.finisher ? 'Ruder-Finisher' : 'Rudern zum Aufwärmen';
    const next = seg ? H.nextIndex(session, segIdx) : -1;
    const draft = screen.rowDraft = screen.rowDraft || {
      minutes: String(Math.max(1, Math.round((stored.durationSec ?? plannedSec) / 60))),
      ...Object.fromEntries(ROW_FIELDS.map(([k]) => [k, stored[k] != null ? String(stored[k]).replace('.', ',') : ''])),
    };
    const field = (k, label, unit, mode, ph) => html`<label class="field">
        <span class="field__label">${label} <span class="muted">(${unit})</span></span>
        <input class="input" type="text" inputmode="${mode}" autocomplete="off" data-row="${k}" value="${draft[k]}" placeholder="${ph}">
        <span class="ses-err" data-err="${k}" hidden></span></label>`;
    const cta0 = H.ctaState({ rowEntry: true, rowDone: done, hasNext: seg ? next >= 0 : true });
    paint(root, html`
      ${topBar(titleOf(session).title, segName, { xp: false })}
      ${seg ? progressBar(segIdx, 'exercise') : ''}
      ${seg ? html`<div class="row row--between"><div class="block-header block-header--cardio" style="margin:0"><span class="block-header__dot"></span>${main.finisher ? 'Finisher · Rudern' : 'Aufwärmen · Rudern'}</div>
        <button type="button" class="btn btn--ghost btn--sm ses-ovw" data-act="overview">${raw(ICON.list)}Übersicht</button></div>` : ''}
      <section class="card row-card ${seg ? 'mt-4' : ''}" data-slot="rowcard">
        <p class="eyebrow">Ziel · ohne Timer – rudere nach dem Display</p>
        <h1 class="row-card__title">${seg || briefs.length === 1 ? mainBrief.title : `${Math.round(plannedSec / 60)} Min. rudern`}</h1>
        ${seg ? html`<ul class="row-card__detail">${mainBrief.detail.map((d) => html`<li>${d}</li>`)}</ul>`
          : html`<ol class="row-card__detail">${briefs.map((x) => html`<li><strong>${x.ex.name}:</strong> ${x.b.title}${x.b.detail.length ? html`<br><span class="muted">${x.b.detail.join(' · ')}</span>` : ''}</li>`)}</ol>`}
        <div class="chip-row">${mainBrief.spm ? html`<span class="chip chip--outline">${mainBrief.spm}</span>` : ''}${mainBrief.rpe ? html`<span class="chip chip--outline">${mainBrief.rpe}</span>` : ''}</div>
        <button type="button" class="btn btn--outline row-done-toggle mt-4" data-act="row-tick" aria-pressed="${String(done)}">${done ? '✓ Erledigt' : '☐ Erledigt'}</button>
        <div class="field mt-3"><span class="field__label">Gerudert <span class="muted">(Minuten)</span></span>
          <div class="row-min">
            <button type="button" class="btn btn--outline" data-act="row-minus" aria-label="1 Minute weniger">−</button>
            <input class="input" type="text" inputmode="numeric" autocomplete="off" data-row="minutes" value="${draft.minutes}" aria-label="Minuten gerudert">
            <button type="button" class="btn btn--outline" data-act="row-plus" aria-label="1 Minute mehr">+</button>
          </div>
          <span class="ses-err" data-err="durationSec" hidden></span></div>
        <details class="disclosure mt-3"><summary>Werte vom Display (optional)</summary>
          <div class="row-form grid-2 mt-2">${ROW_FIELDS.map((f) => field(...f))}</div>
          <p class="text-xs muted mb-0">Mit Kalorien vom Display wird die Schätzung genauer.</p>
        </details>
      </section>
      <p class="row-stopline mt-4"><span aria-hidden="true">✋</span><span>Stopp bei Schmerz &gt; 5/10, stechendem Schmerz, Blockieren oder Wegknicken.</span></p>
      <section class="card mt-4" data-slot="pain">
        <pt-pain-scale label="Knieschmerz beim Rudern" data-f="painDuring" ${main.painDuring != null ? html`value="${main.painDuring}"` : ''}></pt-pain-scale>
        <button type="button" class="btn btn--danger btn--block ses-sharp" data-act="sharp" aria-pressed="${String(!!main.sharpPain)}">⚡ Stechender Schmerz</button>
      </section>
      <div data-slot="redwarn"></div>
      <details class="disclosure">
        <summary>Technik: Beine – Körper – Arme</summary>
        <div class="stack stack--sm">
          ${mainEx?.setup ? html`<p class="text-sm mb-0">📍 ${mainEx.setup}</p>` : ''}
          <ol class="steps">${stepsFor(mainEx).map((x) => html`<li>${x}</li>`)}</ol>
          ${mainEx?.kneeNote ? html`<p class="ses-consult mb-0">🦵 ${mainEx.kneeNote}</p>` : ''}
        </div>
      </details>
      <button type="button" class="ses-link ses-skip" data-act="row-omit">${seg ? (main.finisher ? 'Finisher überspringen' : 'Heute nicht gerudert – überspringen') : 'Heute nicht gerudert'}</button>
      <div class="sticky-cta"><div class="ses-cta">
        ${seg ? html`<button type="button" class="btn btn--outline btn--prev" data-act="prev" aria-label="Vorherige Übung" ${H.prevIndex(session, segIdx) < 0 ? 'disabled' : ''}>${raw(ICON.prev)}</button>` : ''}
        <button type="button" class="btn btn--accent ses-cta__main" data-act="cta" data-cta="${cta0.key}">${cta0.label}</button>
      </div></div>
    `);
    setCta(true);
    if (session.rowAnnounced !== (seg ? segIdx : 'all')) {
      session.rowAnnounced = seg ? segIdx : 'all';
      say(`Rudern: ${(seg ? mainBrief.title : `${Math.round(plannedSec / 60)} Minuten`).replace(/Min\./g, 'Minuten').replace(/–/g, ' bis ')}. Tippe auf Erledigt, wenn du fertig bist.`, { priority: 'normal', interrupt: true });
    }

    const paintRedWarn = () => {
      const slot = root.querySelector('[data-slot="redwarn"]');
      if (!slot) return;
      if (H.rowingPainLight(main, settings()) !== 'red') { slot.innerHTML = ''; return; }
      paint(slot, html`<section class="card stop-card" role="alert">
        <span class="traffic traffic--red">${LIGHT_LABELS.red}</span>
        <h2 class="card__title mt-2">Das Knie meldet sich deutlich</h2>
        <p class="mb-0">${main.sharpPain ? 'Stechender Schmerz' : `Schmerz ${main.painDuring}/10`} – bitte jetzt aufhören oder nur noch ganz locker ausrudern. Kluges Aufhören ist Training, kein Aufgeben.</p>
      </section>`);
    };
    paintRedWarn();
    const isDone = () => entries.some((e) => H.doneCount(e) > 0);
    const refresh = () => {
      const d = isDone();
      const t = root.querySelector('[data-act="row-tick"]');
      if (t) { t.setAttribute('aria-pressed', String(d)); t.textContent = d ? '✓ Erledigt' : '☐ Erledigt'; }
      const st = H.ctaState({ rowEntry: true, rowDone: d, hasNext: seg ? next >= 0 : true });
      const b = root.querySelector('[data-act="cta"]');
      if (b) { b.dataset.cta = st.key; b.textContent = st.label; b.classList.toggle('ses-pulse', d); }
    };
    /** validate + store the minutes and display values; returns false (with a nudge) when something is missing */
    const save = () => {
      const minutes = Number(String(draft.minutes).replace(',', '.'));
      const inp = { durationSec: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 'x', ...Object.fromEntries(ROW_FIELDS.map(([k]) => [k, draft[k]])) };
      const res = validateRowing(inp);
      root.querySelectorAll('[data-err]').forEach((x) => { x.hidden = true; });
      if (!res.ok) {
        let first = null;
        for (const [k, msg] of Object.entries(res.errors)) {
          const el = root.querySelector(`[data-err="${k}"]`);
          if (el) { el.textContent = k === 'durationSec' ? 'Bitte die Minuten eintragen (mind. 1).' : msg; el.hidden = false; first = first || el; }
          if (el && k !== 'durationSec') el.closest('details')?.setAttribute('open', '');
        }
        nudge(first?.closest('.field'), 'Bitte die markierten Werte prüfen.');
        return false;
      }
      H.applyRowedDuration(session, idxs, res.value.durationSec, content);
      session[key] = res.value; // never session.rowing on strength sessions (SPEC §15.3)
      persist();
      return true;
    };
    const painOk = () => {
      if (main.painDuring != null) return true;
      nudge(root.querySelector('[data-slot="pain"]'), 'Kurz eintragen: Knieschmerz beim Rudern.');
      return false;
    };
    const leave = () => {
      screen.rowDraft = null;
      if (seg) { go(next, segIdx); return; }
      session.cursor = { ...session.cursor, step: 'post' };
      persist();
      show();
      scrollTop();
    };
    onChange = (e) => {
      const el = /** @type {any} */ (e.target);
      if (el.tagName === 'PT-PAIN-SCALE') {
        if (e.type !== 'change') return;
        main.painDuring = e.detail?.value ?? el.value;
        persist();
        paintRedWarn();
        if (H.rowingPainLight(main, settings()) === 'red') smooth(root.querySelector('[data-slot="redwarn"]'));
        return;
      }
      const k = el.dataset?.row;
      if (!k) return;
      draft[k] = el.value;
      const err = root.querySelector(`[data-err="${k === 'minutes' ? 'durationSec' : k}"]`);
      if (err) err.hidden = true;
    };
    const step = (d) => {
      const cur = Number(String(draft.minutes).replace(',', '.'));
      draft.minutes = String(Math.max(1, Math.min(240, Math.round((Number.isFinite(cur) ? cur : plannedSec / 60) + d))));
      const inp = root.querySelector('[data-row="minutes"]');
      if (inp) inp.value = draft.minutes;
    };
    actions = {
      menu: openMenu,
      overview: openOverview,
      prev: () => { const p = H.prevIndex(session, segIdx); if (p >= 0) { screen.rowDraft = null; go(p, segIdx); } },
      'row-minus': () => step(-1),
      'row-plus': () => step(1),
      'row-tick': () => {
        if (isDone()) {
          for (const e of entries) { e.sets = []; e.skipped = false; }
          delete session[key];
          persist();
        } else if (!save()) return;
        refresh();
      },
      sharp: (b) => {
        main.sharpPain = !main.sharpPain;
        b.setAttribute('aria-pressed', String(main.sharpPain));
        persist();
        paintRedWarn();
        if (main.sharpPain) smooth(root.querySelector('[data-slot="redwarn"]'));
      },
      'row-omit': () => {
        voiceCancel();
        for (const e of entries) { e.sets = []; e.skipped = true; }
        delete session[key];
        H.toast(seg ? (main.finisher ? 'Finisher übersprungen' : 'Rudern übersprungen') : 'Heute nicht gerudert', { icon: '↷', kind: '' });
        if (!seg) session.rowing = null;
        leave();
      },
      cta: () => {
        if (perfNow() - (screen.ctaAt ?? -1e9) < 700) return;
        screen.ctaAt = perfNow();
        unlock();
        voiceUnlock();
        if (!painOk()) return;
        if (!save()) return;
        refresh();
        leave();
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
    (screen.observers || []).forEach((o) => o.disconnect());
  }

  function show() {
    leaveScreen();
    screen = {};
    const step = session.cursor?.step || 'pre';
    if (step === 'row') renderRow();
    else if (step === 'rowlog') renderRow(); // v5.3: no separate display-value step any more (old resumes)
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
    persist();
  };
  const markResumed = () => {
    if (!session || !saved || leaving || disposed || !session.pausedAt) return;
    H.applyResume(session);
    persist();
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

  /** Legacy (≤ v5.2 rowing timer): rowed seconds of a timer that was still open when a stale session is finished. */
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
