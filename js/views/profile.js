// Profil & Ziele (#/profil) – see docs/SPEC.md §12.2, §12.6, §12.12.
// Profile (height, birth year, sex, activity) saves on change; the weight goal is edited as a draft with live
// validation + preview (goalProgress / calorieTarget / BMI) and saved explicitly. Cardio goal per week.
import { html, raw, render as paint } from '../render.js';
import { todayISO, formatDE, addDays, daysBetween } from '../util/date.js';
import { goalProgress, calorieTarget, bmi, tdee, currentWeight, ACTIVITY_LABELS, MAX_SAFE_KG_PER_WEEK } from '../logic/energy.js';
import { latest } from '../logic/health.js';
import { evaluateBadges, XP } from '../logic/motivation.js';
import { ICON, ensureViewStyles, applyFontScale, pageHeader, toast, confirmDialog, fmtNum, awardBadges } from './ui.js';

export const title = 'Profil & Ziele';

const SEX = [['m', 'Männlich'], ['w', 'Weiblich'], ['d', 'Divers']];
const ACT_HINT = {
  sedentary: 'Bürojob, wenig Bewegung',
  light: 'Etwas Alltagsbewegung, 1–3× Sport',
  moderate: 'Viel auf den Beinen oder 3–5× Sport',
  active: 'Körperlich aktiver Beruf oder täglich Sport',
};

/** Parse a German/English decimal ("82,5") → number|null. */
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validate a profile patch. Returns cleaned profile + field errors (German).
 * @param {{heightCm?: any, birthYear?: any, sex?: any, activityLevel?: any}} input
 * @param {string} today
 */
export function validateProfile(input, today) {
  const errors = {};
  const out = { heightCm: null, birthYear: null, sex: null, activityLevel: 'light' };
  const h = parseNum(input.heightCm);
  if (h != null) { if (Number.isNaN(h) || h < 120 || h > 230) errors.heightCm = 'Bitte 120–230 cm.'; else out.heightCm = Math.round(h); }
  const y = parseNum(input.birthYear);
  const ty = Number(String(today).slice(0, 4));
  if (y != null) { if (Number.isNaN(y) || !Number.isInteger(y) || y < ty - 100 || y > ty - 14) errors.birthYear = `Bitte ${ty - 100}–${ty - 14}.`; else out.birthYear = y; }
  out.sex = ['m', 'w', 'd'].includes(input.sex) ? input.sex : null;
  out.activityLevel = ACTIVITY_LABELS[input.activityLevel] ? input.activityLevel : 'light';
  return { ok: Object.keys(errors).length === 0, profile: out, errors };
}

/**
 * Validate a weight-goal draft.
 * @param {{startKg?: any, targetKg?: any, targetDate?: any}} input
 * @param {string} today
 * @returns {{ok: boolean, goal: {startKg: number, targetKg: number, targetDate: string, startDate: string}|null, errors: Record<string,string>}}
 */
export function validateGoal(input, today, { startDate } = {}) {
  const errors = {};
  const s = parseNum(input.startKg);
  const t = parseNum(input.targetKg);
  if (s == null) errors.startKg = 'Bitte Startgewicht angeben.';
  else if (Number.isNaN(s) || s < 30 || s > 300) errors.startKg = 'Bitte 30–300 kg.';
  if (t == null) errors.targetKg = 'Bitte Zielgewicht angeben.';
  else if (Number.isNaN(t) || t < 30 || t > 300) errors.targetKg = 'Bitte 30–300 kg.';
  else if (!errors.startKg && t >= s) errors.targetKg = 'Das Ziel sollte unter dem Startgewicht liegen.';
  const d = String(input.targetDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.targetDate = 'Bitte ein Zieldatum wählen.';
  else if (d <= today) errors.targetDate = 'Das Zieldatum sollte in der Zukunft liegen.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, goal: ok ? { startKg: Math.round(s * 10) / 10, targetKg: Math.round(t * 10) / 10, targetDate: d, startDate: startDate || today } : null };
}

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, query }) {
  ensureViewStyles();
  let draft = null; // weight goal draft {startKg, targetKg, targetDate} (strings)
  let profErrors = {};

  const initDraft = (data, today) => {
    const g = data.settings.weightGoal;
    const log = data.state.healthLog || [];
    const lw = latest(log, 'weightKg', today);
    const cur = currentWeight(log, today);
    const start = g?.startKg ?? lw?.value ?? cur ?? '';
    const defTarget = typeof start === 'number' ? Math.round((start - Math.min(5, start * 0.05)) * 2) / 2 : '';
    return {
      startKg: start === '' ? '' : fmtNum(start, 1, { trim: true }),
      targetKg: g?.targetKg != null ? fmtNum(g.targetKg, 1, { trim: true }) : defTarget === '' ? '' : fmtNum(defTarget, 1, { trim: true }),
      targetDate: g?.targetDate ?? addDays(today, 12 * 7),
      fromLog: !g && lw ? lw.date : null,
    };
  };

  const fieldErr = (errs, k) => html`<span class="field__error" role="alert">${errs[k] ?? ''}</span>`;

  /** Live preview block (re-rendered on every keystroke without touching the inputs). */
  const goalPreview = (data, today) => {
    const s = data.settings;
    const log = data.state.healthLog || [];
    const p = s.profile || {};
    const v = validateGoal(draft, today, { startDate: s.weightGoal?.startDate });
    const previewLog = log.length ? log : (v.goal ? [{ date: today, weightKg: v.goal.startKg }] : []);
    const gp = v.goal ? goalProgress(previewLog, v.goal, today, p) : null;
    const kcal = v.goal ? calorieTarget(p, previewLog, v.goal, today) : null;
    const bmiTarget = v.goal ? bmi(v.goal.targetKg, p.heightCm) : null;
    const weeks = v.goal ? daysBetween(today, v.goal.targetDate) / 7 : null;
    const rate = gp?.requiredKgPerWeek ?? null;
    const saved = s.weightGoal;
    const dirty = !saved || !v.goal || saved.startKg !== v.goal.startKg || saved.targetKg !== v.goal.targetKg || saved.targetDate !== v.goal.targetDate;
    return html`${weeks != null && weeks > 0 ? html`<p class="field__hint mt-2">In ${fmtNum(weeks, 0)} Wochen bis ${formatDE(v.goal.targetDate, { weekday: false })}${s.surgeryDate && v.goal.targetDate > s.surgeryDate ? ' · liegt nach der OP – während der Entlastung lieber Gewicht halten statt stark reduzieren.' : '.'}</p>` : ''}
        ${v.goal ? html`<dl class="pv-preview" aria-live="polite">
          <div><dt>Abnehmen</dt><dd>${fmtNum(v.goal.startKg - v.goal.targetKg, 1)} <small>kg</small></dd></div>
          <div><dt>Tempo nötig</dt><dd>${rate != null ? html`${fmtNum(rate, 2)} <small>kg/Woche</small>` : '–'}</dd></div>
          <div><dt>Ziel-BMI</dt><dd>${bmiTarget != null ? fmtNum(bmiTarget, 1) : '–'}</dd></div>
          <div><dt>Kalorien <small>Schätzung</small></dt><dd>${kcal ? html`${kcal.kcal} <small>kcal/Tag</small>` : '–'}</dd></div>
        </dl>
        ${rate != null && rate <= MAX_SAFE_KG_PER_WEEK && rate > 0 ? html`<p class="text-sm mt-2" style="color:var(--green-ink)">✓ Gesundes Tempo – gut machbar, ohne Muskeln zu verlieren.</p>` : ''}
        ${(gp?.warnings || []).map((t) => html`<div class="pv-callout pv-callout--warn mt-2 mb-0"><span class="pv-callout__icon" aria-hidden="true">⚠️</span><p class="text-sm">${t}</p></div>`)}
        ${kcal?.floorApplied ? html`<div class="pv-callout pv-callout--warn mt-2 mb-0"><span class="pv-callout__icon" aria-hidden="true">🍽️</span><p class="text-sm">Die Schätzung bleibt bewusst über der Untergrenze von ${kcal.kcal} kcal – weniger wäre vor einer OP nicht sinnvoll.</p></div>` : ''}
        ${!kcal && v.goal ? html`<p class="field__hint mt-2">Für die Kalorien-Schätzung bitte das Profil oben vervollständigen.</p>` : ''}
        ${kcal ? html`<p class="field__hint mt-2">Defizit ca. ${kcal.deficit} kcal/Tag (Bedarf ${kcal.tdee} kcal). Genug Eiweiß hilft, Muskeln für die Reha zu erhalten.</p>` : ''}` : ''}

        <div class="btn-row mt-4">
          ${saved ? html`<button type="button" class="btn btn--ghost btn--sm" data-goal-remove>${raw(ICON.trash)} Ziel entfernen</button>` : ''}
          <button type="button" class="btn btn--primary" data-goal-save ${v.ok && dirty ? '' : 'disabled'}>${raw(ICON.check)} ${saved ? (dirty ? 'Änderungen speichern' : 'Gespeichert') : 'Ziel speichern'}</button>
        </div>
`;
  };

  /** Update error texts, invalid classes and the preview after typing. */
  const updateGoalUI = () => {
    const data = store.get();
    const today = todayISO();
    const v = validateGoal(draft, today, { startDate: data.settings.weightGoal?.startDate });
    for (const k of ['startKg', 'targetKg', 'targetDate']) {
      const show = draft[k] !== '' || k === 'targetDate';
      const msg = show ? v.errors[k] ?? '' : '';
      const err = root.querySelector(`[data-err="${k}"]`);
      if (err) err.textContent = msg;
      root.querySelector(`[data-goal="${k}"]`)?.classList.toggle('is-invalid', !!msg);
    }
    const box = root.querySelector('[data-goal-preview]');
    if (box) box.innerHTML = String(goalPreview(data, today));
  };

  const draw = () => {
    const data = store.get();
    const s = data.settings;
    applyFontScale(s);
    const today = todayISO();
    const log = data.state.healthLog || [];
    const p = s.profile || {};
    if (!draft) draft = initDraft(data, today);
    const v = validateGoal(draft, today, { startDate: s.weightGoal?.startDate });
    const curKg = currentWeight(log, today);
    const kgForBmi = curKg ?? (Number.isFinite(parseNum(draft.startKg)) ? parseNum(draft.startKg) : null);
    const bmiNow = bmi(kgForBmi, p.heightCm);
    const tdeeNow = tdee(p, kgForBmi ?? NaN, today);
    const profileComplete = p.heightCm && p.birthYear && p.sex;
    const cg = s.cardioGoalPerWeek ?? 3;

    paint(root, html`
      ${pageHeader({ title: 'Profil & Ziele', eyebrow: 'Mehr', back: '#/mehr', backLabel: 'Zurück zu Mehr' })}

      <p class="pv-count mt-0">Alles bleibt auf deinem Gerät. Kalorien und Grundumsatz sind <strong>Schätzungen</strong> – sie ersetzen keine Ernährungsberatung.</p>

      <h2 class="section-title">Profil</h2>
      <section class="card" aria-label="Profil">
        <div class="pv-form-grid">
          <div class="field">
            <label class="field__label" for="pf-height">Größe</label>
            <span class="pv-input-unit"><input id="pf-height" class="input${profErrors.heightCm ? ' is-invalid' : ''}" inputmode="numeric" name="heightCm" value="${p.heightCm ?? ''}" placeholder="z. B. 180" autocomplete="off"><span>cm</span></span>
            ${fieldErr(profErrors, 'heightCm')}
          </div>
          <div class="field">
            <label class="field__label" for="pf-year">Geburtsjahr</label>
            <input id="pf-year" class="input${profErrors.birthYear ? ' is-invalid' : ''}" inputmode="numeric" name="birthYear" value="${p.birthYear ?? ''}" placeholder="z. B. 1980" autocomplete="off">
            ${fieldErr(profErrors, 'birthYear')}
          </div>
        </div>
        <p class="field__label mb-2 mt-4">Geschlecht <span class="muted text-sm">(für die Grundumsatz-Formel)</span></p>
        <div class="segmented" role="radiogroup" aria-label="Geschlecht">
          ${SEX.map(([k, l]) => html`<label><input type="radio" name="sex" value="${k}" ${p.sex === k ? 'checked' : ''}><span>${l}</span></label>`)}
        </div>
        <div class="field mt-4">
          <label class="field__label" for="pf-act">Aktivität im Alltag</label>
          <select id="pf-act" class="select" name="activityLevel">
            ${Object.entries(ACTIVITY_LABELS).map(([k, l]) => html`<option value="${k}" ${(p.activityLevel ?? 'light') === k ? 'selected' : ''}>${l}</option>`)}
          </select>
          <span class="field__hint">${ACT_HINT[p.activityLevel ?? 'light']}. Training zählt die App separat.</span>
        </div>
        <dl class="pv-preview">
          <div><dt>BMI${curKg != null ? ' (aktuell)' : ''}</dt><dd>${bmiNow != null ? fmtNum(bmiNow, 1) : '–'}</dd></div>
          <div><dt>Tagesbedarf <small>Schätzung</small></dt><dd>${tdeeNow != null ? html`${tdeeNow} <small>kcal</small>` : '–'}</dd></div>
        </dl>
        ${profileComplete ? '' : html`<p class="field__hint mt-2 mb-0">Größe, Geburtsjahr und Geschlecht ergänzen → dann gibt es eine Kalorien-Schätzung.</p>`}
      </section>

      <h2 class="section-title" id="ziel">Gewicht-Ziel</h2>
      <section class="card" aria-label="Gewicht-Ziel">
        <div class="pv-form-grid">
          <div class="field">
            <label class="field__label" for="g-start">Startgewicht</label>
            <span class="pv-input-unit"><input id="g-start" class="input${v.errors.startKg && draft.startKg !== '' ? ' is-invalid' : ''}" inputmode="decimal" data-goal="startKg" value="${draft.startKg}" placeholder="z. B. 92,4" autocomplete="off"><span>kg</span></span>
            <span class="field__error" role="alert" data-err="startKg">${draft.startKg !== '' ? v.errors.startKg ?? '' : ''}</span>
          </div>
          <div class="field">
            <label class="field__label" for="g-target">Zielgewicht</label>
            <span class="pv-input-unit"><input id="g-target" class="input${v.errors.targetKg && draft.targetKg !== '' ? ' is-invalid' : ''}" inputmode="decimal" data-goal="targetKg" value="${draft.targetKg}" placeholder="z. B. 85" autocomplete="off"><span>kg</span></span>
            <span class="field__error" role="alert" data-err="targetKg">${draft.targetKg !== '' ? v.errors.targetKg ?? '' : ''}</span>
          </div>
        </div>
        ${draft.fromLog ? html`<p class="field__hint mt-2">Start aus deinem Tagebuch vom ${formatDE(draft.fromLog, { weekday: false })} übernommen.</p>` : ''}
        <div class="field mt-4">
          <label class="field__label" for="g-date">Zieldatum</label>
          <input id="g-date" class="input${v.errors.targetDate ? ' is-invalid' : ''}" type="date" data-goal="targetDate" value="${draft.targetDate}" min="${addDays(today, 1)}">
          <span class="field__error" role="alert" data-err="targetDate">${v.errors.targetDate ?? ''}</span>
        </div>

        <div data-goal-preview>${goalPreview(data, today)}</div>
      </section>

      <h2 class="section-title">Ausdauer</h2>
      <section class="card">
        <div class="pv-setting-row">
          <span class="pv-setting-row__label">Rudern pro Woche<span class="pv-setting-row__hint">Bis zur OP empfohlen: 3× 15–20 Min</span></span>
          <div class="stepper" data-cardio-stepper>
            <button class="stepper__btn" data-cardio-delta="-1" aria-label="Ruder-Ziel verringern" ${cg <= 0 ? 'disabled' : ''}>${raw(ICON.minus)}</button>
            <output class="stepper__value" aria-live="polite">${cg}<span class="stepper__unit">×</span></output>
            <button class="stepper__btn" data-cardio-delta="1" aria-label="Ruder-Ziel erhöhen" ${cg >= 7 ? 'disabled' : ''}>${raw(ICON.plus)}</button>
          </div>
        </div>
        <div class="pv-setting-row">
          <span class="pv-setting-row__label">Krafttraining pro Woche<span class="pv-setting-row__hint">Änderbar unter <a href="#/mehr">Mehr</a></span></span>
          <span class="chip chip--primary num">${s.weeklyGoal}×</span>
        </div>
      </section>

      <ul class="list list--card">
        <li><a class="list-item" href="#/gesundheit">
          <span class="list-item__icon">${raw(ICON.book)}</span>
          <span class="list-item__body"><span class="list-item__title">Gesundheits-Tagebuch</span><span class="list-item__sub">Gewicht, Schlaf, Schritte – aus Samsung Health übertragen</span></span>
          ${raw(ICON.chev)}</a></li>
      </ul>
    `);
  };

  const saveProfile = () => {
    const f = (n) => root.querySelector(`[name="${n}"]`);
    const input = {
      heightCm: f('heightCm')?.value, birthYear: f('birthYear')?.value,
      sex: root.querySelector('[name="sex"]:checked')?.value ?? null, activityLevel: f('activityLevel')?.value,
    };
    const today = todayISO();
    const r = validateProfile(input, today);
    profErrors = r.errors;
    store.update((d) => {
      const cur = d.settings.profile || {};
      // keep previously valid values for fields with errors
      d.settings.profile = {
        ...cur,
        ...r.profile,
        heightCm: r.errors.heightCm ? cur.heightCm ?? null : r.profile.heightCm,
        birthYear: r.errors.birthYear ? cur.birthYear ?? null : r.profile.birthYear,
      };
    });
  };

  const onChange = (e) => {
    const t = e.target;
    if (['heightCm', 'birthYear', 'sex', 'activityLevel'].includes(t.name)) { saveProfile(); return; }
    // skip if `input` already handled it – re-rendering here would swallow a click on „Speichern“
    if (t.dataset?.goal && draft[t.dataset.goal] !== t.value) { draft[t.dataset.goal] = t.value; updateGoalUI(); }
  };

  // live validation while typing: only errors + preview are re-rendered, inputs keep focus/caret
  const onInput = (e) => {
    const t = e.target;
    if (t.dataset?.goal) { draft[t.dataset.goal] = t.value; updateGoalUI(); }
  };

  const onClick = async (e) => {
    const cd = e.target.closest('[data-cardio-delta]');
    if (cd) {
      store.update((d) => { d.settings.cardioGoalPerWeek = Math.max(0, Math.min(7, (d.settings.cardioGoalPerWeek ?? 3) + Number(cd.dataset.cardioDelta))); });
      return;
    }
    if (e.target.closest('[data-goal-save]')) {
      const today = todayISO();
      const data = store.get();
      const v = validateGoal(draft, today, { startDate: data.settings.weightGoal?.startDate });
      if (!v.ok) return;
      store.update((d) => {
        d.settings.weightGoal = v.goal;
        awardBadges(d, content.badges, evaluateBadges, { today, xpPerBadge: XP.badge });
      });
      toast('Ziel gespeichert – Schritt für Schritt. 🎯', { icon: '✓' });
      return;
    }
    if (e.target.closest('[data-goal-remove]')) {
      const ok = await confirmDialog({ title: 'Gewicht-Ziel entfernen?', text: 'Dein Tagebuch bleibt erhalten. Du kannst jederzeit ein neues Ziel setzen.', confirm: 'Entfernen', icon: '🎯' });
      if (!ok) return;
      store.update((d) => { d.settings.weightGoal = null; });
      draft = null;
      toast('Ziel entfernt', { icon: '↩︎' });
    }
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(draw);
  if (query?.focus === 'ziel') {
    setTimeout(() => { root.querySelector('#ziel')?.scrollIntoView({ block: 'start' }); }, 60);
  }
  return () => {
    unsub();
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick);
    document.querySelectorAll('dialog.modal[open]').forEach((d) => d.close());
  };
}
