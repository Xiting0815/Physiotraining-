// Trainingsziele (#/profil) – see docs/SPEC.md §12.2, §12.6, §14.
// Body weight (only used for the kcal estimate per session, saved on change) and the cardio goal per week.
// Weight / health data itself is tracked in Samsung Health (v3.1: no diary, no weight goal).
import { html, raw, render as paint } from '../render.js';
import { MET, DEFAULT_WEIGHT_KG } from '../logic/energy.js';
import { ICON, ensureViewStyles, applyFontScale, pageHeader, toast, fmtNum, safeData } from './ui.js';

export const title = 'Trainingsziele';

export const WEIGHT_MIN = 30;
export const WEIGHT_MAX = 300;

/** Parse a German/English decimal ("82,5") → number|null (NaN when not a number). */
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validate the body weight input. Empty → null (allowed, kcal then use 80 kg).
 * @param {any} input
 * @returns {{ok: boolean, weightKg: number|null, error: string|null}}
 */
export function validateWeight(input) {
  const n = parseNum(input);
  if (n == null) return { ok: true, weightKg: null, error: null };
  if (Number.isNaN(n) || n < WEIGHT_MIN || n > WEIGHT_MAX) return { ok: false, weightKg: null, error: `Bitte ${WEIGHT_MIN}–${WEIGHT_MAX} kg.` };
  return { ok: true, weightKg: Math.round(n * 10) / 10, error: null };
}

/** Rough kcal examples for the hint („Schätzung“): 30 min strength, 20 min rowing. */
export function kcalExamples(weightKg) {
  const kg = typeof weightKg === 'number' ? weightKg : DEFAULT_WEIGHT_KG;
  return { strength30: Math.round(MET.strength * kg * 0.5), rowing20: Math.round((MET.rowModerate * kg) / 3) };
}

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store }) {
  ensureViewStyles();
  let weightErr = null;

  const draw = () => {
    const data = safeData(store.get());
    const s = data.settings;
    applyFontScale(s);
    const kg = s.profile?.weightKg;
    const ex = kcalExamples(kg);
    const cg = s.cardioGoalPerWeek ?? 3;

    paint(root, html`
      ${pageHeader({ title: 'Trainingsziele', eyebrow: 'Mehr', back: '#/mehr', backLabel: 'Zurück zu Mehr' })}

      <h2 class="section-title">Wochenziele</h2>
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
          <span class="pv-setting-row__label">Krafttraining pro Woche<a class="pv-setting-row__hint tap-link pv-tap-left" href="#/mehr">Änderbar unter „Mehr“ ${raw(ICON.right)}</a></span>
          <span class="chip chip--primary num">${s.weeklyGoal}×</span>
        </div>
      </section>

      <h2 class="section-title">Schulter</h2>
      <section class="card" aria-label="Schulter-Schutz" data-shoulder-card>
        <label class="switch-row"><span>Schulter-Impingement (keine Überkopf-Übungen)<span class="pv-setting-row__hint">Übungen mit Armhebung über ${s.shoulderMaxElevationDeg ?? 65}° werden ersetzt (z. B. Wall Slide → Wand-Liegestütz mit Plus, Face Pull → Low Face Pull). Der Bogenauszug auf Schulterhöhe bleibt. Dazu in jedem Krafttraining Rotatorenmanschette und Schulterblatt-Kontrolle.</span></span><input type="checkbox" class="switch" name="shoulderImpingement" ${s.shoulderImpingement ? 'checked' : ''}></label>
        ${s.shoulderImpingement ? html`<div class="pv-setting-row mt-2">
          <span class="pv-setting-row__label">Schmerzarm bis<span class="pv-setting-row__hint">Armhebung nach vorn oder seitlich</span></span>
          <div class="stepper">
            <button class="stepper__btn" data-shoulder-delta="-5" aria-label="Limit verringern" ${(s.shoulderMaxElevationDeg ?? 65) <= 40 ? 'disabled' : ''}>${raw(ICON.minus)}</button>
            <output class="stepper__value" aria-live="polite">${s.shoulderMaxElevationDeg ?? 65}<span class="stepper__unit">°</span></output>
            <button class="stepper__btn" data-shoulder-delta="5" aria-label="Limit erhöhen" ${(s.shoulderMaxElevationDeg ?? 65) >= 120 ? 'disabled' : ''}>${raw(ICON.plus)}</button>
          </div>
        </div>
        <p class="field__hint mt-2 mb-0">Schmerzarm arbeiten: maximal leichter Schmerz (≤ 3/10), der nicht anhält. Schulter tief, kein Hochziehen. Ersetzt keine ärztliche Beratung.</p>` : ''}
      </section>

      <h2 class="section-title">Kalorien pro Einheit</h2>
      <section class="card" aria-label="Körpergewicht">
        <div class="field mb-0">
          <label class="field__label" for="pf-weight">Körpergewicht (für Kalorienschätzung)</label>
          <span class="pv-input-unit"><input id="pf-weight" class="input${weightErr ? ' is-invalid' : ''}" inputmode="decimal" name="weightKg" value="${typeof kg === 'number' ? fmtNum(kg, 1, { trim: true }) : ''}" placeholder="z. B. 85" autocomplete="off"><span>kg</span></span>
          <span class="field__error" role="alert">${weightErr ?? ''}</span>
          <span class="field__hint">${typeof kg === 'number' ? '' : `Ohne Angabe rechnet die App mit ${DEFAULT_WEIGHT_KG} kg. `}Grob gerundet reicht – Gewicht und Gesundheitswerte trackst du in Samsung Health.</span>
        </div>
        <dl class="pv-preview">
          <div><dt>30 Min Kraft</dt><dd>≈ ${ex.strength30} <small>kcal</small></dd></div>
          <div><dt>20 Min Rudern</dt><dd>≈ ${ex.rowing20} <small>kcal</small></dd></div>
        </dl>
        <p class="field__hint mt-2 mb-0">Die kcal je Einheit sind Schätzungen (MET × Gewicht × Dauer, beim Rudern bevorzugt die Anzeige des Geräts) – keine Ernährungsberatung.</p>
      </section>
    `);
  };

  const onChange = (e) => {
    const t = e.target;
    if (t.name === 'shoulderImpingement') {
      // v5.3: store.update stamps settings._updatedAt (sync last-write-wins)
      store.update((d) => { d.settings.shoulderImpingement = t.checked; if (!Number.isFinite(d.settings.shoulderMaxElevationDeg)) d.settings.shoulderMaxElevationDeg = 65; });
      toast(t.checked ? 'Schulter-Schutz an – Überkopf-Übungen werden ersetzt' : 'Schulter-Schutz aus', { icon: '🛡️' });
      return;
    }
    if (t.name !== 'weightKg') return;
    const v = validateWeight(t.value);
    weightErr = v.error;
    if (!v.ok) { draw(); root.querySelector('#pf-weight')?.focus(); return; }
    const before = store.get().settings.profile?.weightKg ?? null;
    if (before === v.weightKg) { draw(); return; }
    store.update((d) => { d.settings.profile = { ...(d.settings.profile || {}), weightKg: v.weightKg }; });
    toast(v.weightKg == null ? 'Gewicht entfernt' : `Gewicht gespeichert: ${fmtNum(v.weightKg, 1, { trim: true })} kg`, { icon: '✓' });
  };

  const onClick = (e) => {
    const sd = e.target.closest('[data-shoulder-delta]');
    if (sd) {
      store.update((d) => { d.settings.shoulderMaxElevationDeg = Math.max(40, Math.min(120, (d.settings.shoulderMaxElevationDeg ?? 65) + Number(sd.dataset.shoulderDelta))); });
      return;
    }
    const cd = e.target.closest('[data-cardio-delta]');
    if (cd) {
      store.update((d) => { d.settings.cardioGoalPerWeek = Math.max(0, Math.min(7, (d.settings.cardioGoalPerWeek ?? 3) + Number(cd.dataset.cardioDelta))); });
    }
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(draw);
  return () => {
    unsub();
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}
