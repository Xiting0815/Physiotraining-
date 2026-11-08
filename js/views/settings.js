// Mehr / Einstellungen – see docs/SPEC.md §3.7, §11.
import { html, raw, render as paint } from '../render.js';
import { todayISO, formatDE, daysBetween } from '../util/date.js';
import { defaults } from '../store.js';
import { suggestedSurgeryDate } from '../logic/schedule.js';
import { downloadBackup, readBackupFile } from '../util/export-import.js';
import {
  ICON, ensureViewStyles, applyFontScale, pageHeader, confirmDialog, toast, openSheet, equipmentItems,
} from './ui.js';

export const title = 'Mehr';
export const APP_VERSION = '3.1.0';

const REST_OPTIONS = [null, 30, 45, 60, 90, 120];
const FONT_SCALES = [{ v: 1, l: 'Normal' }, { v: 1.125, l: 'Groß' }, { v: 1.25, l: 'Sehr groß' }];
const BAND_GROUPS = [{ kind: 'theraband', title: 'TheraBand' }, { kind: 'loop', title: 'Loop-Bänder (Blackroll)' }];

/**
 * Move a band one step within its kind group (pure; returns a new array).
 * @param {any[]} bands  @param {string} id  @param {-1|1} dir
 */
export function moveBand(bands, id, dir) {
  const list = bands.slice();
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return list;
  const kind = list[i].kind;
  let j = i + dir;
  while (j >= 0 && j < list.length && list[j].kind !== kind) j += dir;
  if (j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

/** Clamp pain thresholds to a consistent set. */
export function normThresholds(t) {
  const greenMax = Math.max(0, Math.min(4, Math.round(t.greenMax ?? 2)));
  const yellowMax = Math.max(greenMax + 1, Math.min(8, Math.round(t.yellowMax ?? 5)));
  const greenStreakToProgress = Math.max(1, Math.min(5, Math.round(t.greenStreakToProgress ?? 2)));
  return { greenMax, yellowMax, greenStreakToProgress };
}

/** Days since last backup or null (never). */
export function backupAge(settings, today = todayISO()) {
  if (!settings?.lastBackupAt) return null;
  const d = new Date(settings.lastBackupAt);
  if (Number.isNaN(d.getTime())) return null;
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return Math.max(0, daysBetween(day, today));
}

const stepper = (key, value, { min, max, unit = '', label }) => html`<div class="stepper" data-stepper="${key}">
  <button class="stepper__btn" data-delta="-1" aria-label="${label} verringern" ${value <= min ? 'disabled' : ''}>${raw(ICON.minus)}</button>
  <output class="stepper__value" aria-live="polite">${value}${unit ? html`<span class="stepper__unit">${unit}</span>` : ''}</output>
  <button class="stepper__btn" data-delta="1" aria-label="${label} erhöhen" ${value >= max ? 'disabled' : ''}>${raw(ICON.plus)}</button>
</div>`;

const SAFETY = html`
  <h2 class="sheet__title">Sicherheit & Hinweise</h2>
  <div class="pv-callout pv-callout--stop"><span class="pv-callout__icon">⛔</span><div>
    <p class="strong">Diese App ersetzt keine ärztliche oder physiotherapeutische Beratung.</p>
    <p>Bei starken Schmerzen, Blockieren, zunehmender Schwellung oder Nachtschmerz: Training stoppen und Rücksprache halten.</p>
  </div></div>
  <h3 class="mt-4">Sofort stoppen & ärztlich abklären</h3>
  <ul class="pv-bullets pv-bullets--no">
    <li>Das Knie <strong>blockiert</strong> (lässt sich plötzlich nicht mehr strecken oder beugen)</li>
    <li><strong>Nachtschmerz</strong> oder Ruheschmerz, der dich weckt</li>
    <li><strong>Schwellung länger als 48 Stunden</strong> oder deutlich zunehmend</li>
    <li>Zwei <strong>rote Einheiten in Folge</strong></li>
    <li>Rötung, Überwärmung, Fieber oder Wadenschmerz mit Schwellung</li>
  </ul>
  <h3 class="mt-4">So liest du die Ampel</h3>
  <div class="stack stack--sm">
    <p><span class="traffic traffic--green">Grün – passt</span><br><span class="text-sm muted">Schmerz während und nach ≤ 2/10, keine Schwellung, am Folgetag höchstens +1. Nach 2× grün schlägt die App eine Steigerung vor.</span></p>
    <p><span class="traffic traffic--yellow">Gelb – halten</span><br><span class="text-sm muted">Schmerz 3–5/10 oder am Folgetag +2. Stufe beibehalten.</span></p>
    <p><span class="traffic traffic--red">Rot – zurück</span><br><span class="text-sm muted">Schmerz &gt; 5, scharfer Schmerz, neue Schwellung, Wegknicken oder am Folgetag nicht erholt. Eine Stufe zurück.</span></p>
    <p><span class="traffic traffic--stop">Stopp – ärztlich abklären</span><br><span class="text-sm muted">Siehe oben. Du entscheidest – aber bitte mit Rücksprache.</span></p>
  </div>
  <p class="text-sm muted mt-4">Die App macht nur Vorschläge. Steigerungen, Phasenwechsel und Stufen bestätigst immer du.</p>
  <div class="sheet__actions"><button class="btn btn--primary btn--block" data-close>Verstanden</button></div>
`;

/** @param {HTMLElement} root @param {import('../types.js').ViewContext} ctx */
export function render(root, { store, content, query }) {
  ensureViewStyles();
  let importMode = 'replace';

  const draw = () => {
    const data = store.get();
    const s = data.settings;
    applyFontScale(s);
    const today = todayISO();
    const thr = normThresholds(s.painThresholds || {});
    const age = backupAge(s, today);
    const hasData = data.sessions.length > 0;
    const backupDue = hasData && (age == null || age >= 14);
    const owned = (s.ownedEquipment || []).length;
    const eqTotal = equipmentItems(content.equipment).length;
    const scale = Number(s.fontScale) || 1;
    const suggested = suggestedSurgeryDate(s);
    const ownsRower = (s.ownedEquipment || []).includes('rowing-machine');
    const customCount = (data.state.customWorkouts || []).length;
    const kg = s.profile?.weightKg;

    paint(root, html`
      ${pageHeader({ title: 'Mehr', eyebrow: 'Einstellungen & Daten' })}

      <h2 class="section-title">OP & Ziele</h2>
      <section class="card">
        <div class="field">
          <label class="field__label" for="surgeryDate">OP-Termin</label>
          <input id="surgeryDate" class="input" type="date" name="surgeryDate" value="${s.surgeryDate ?? ''}" min="${today}">
          <span class="field__hint">${s.surgeryDate ? `Noch ${Math.max(0, daysBetween(today, s.surgeryDate))} Tage · Grundlage für Countdown und Taper (letzte 7 Tage).` : 'Noch nicht eingetragen – dann zählt der Countdown auf Heute mit.'}</span>
        </div>
        ${s.surgeryDate ? html`<button class="btn btn--ghost btn--sm mt-2" data-clear-date>Termin entfernen</button>` : ''}
        ${suggested ? html`<div class="pv-callout pv-callout--knee mt-2 mb-0"><span class="pv-callout__icon" aria-hidden="true">📅</span>
          <div><p class="text-sm">Vorgeschlagener Termin: <strong>${formatDE(suggested, { weekday: false })}</strong>. Stimmt das?</p>
          <button class="btn btn--primary btn--sm mt-2" data-use-suggested="${suggested}">${raw(ICON.check)} Termin übernehmen</button></div></div>` : ''}
        <div class="pv-setting-row mt-2">
          <span class="pv-setting-row__label">Wochenziel<span class="pv-setting-row__hint">Einheiten pro Woche</span></span>
          ${stepper('weeklyGoal', s.weeklyGoal, { min: 1, max: 7, label: 'Wochenziel' })}
        </div>
      </section>

      <ul class="list list--card">
        <li><a class="list-item" href="#/auswertung">
          <span class="list-item__icon list-item__icon--gold">${raw(ICON.chart)}</span>
          <span class="list-item__body"><span class="list-item__title">Auswertung</span><span class="list-item__sub">OP-Bereitschaft, Wochenbericht, Trainingslast ↔ Knie</span></span>
          ${raw(ICON.chev)}</a></li>
        <li><a class="list-item" href="#/profil">
          <span class="list-item__icon">${raw(ICON.user)}</span>
          <span class="list-item__body"><span class="list-item__title">Trainingsziele</span><span class="list-item__sub">${typeof kg === 'number' ? `Rudern pro Woche · ${String(kg).replace('.', ',')} kg für die Kalorienschätzung` : 'Rudern pro Woche, Körpergewicht für die Kalorienschätzung'}</span></span>
          ${raw(ICON.chev)}</a></li>
        <li><a class="list-item" href="#/eigene">
          <span class="list-item__icon list-item__icon--accent">${raw(ICON.puzzle)}</span>
          <span class="list-item__body"><span class="list-item__title">Eigene Workouts</span><span class="list-item__sub">${customCount ? `${customCount} ${customCount === 1 ? 'Workout' : 'Workouts'} · erstellen & bearbeiten` : 'Eigenes Training zusammenstellen'}</span></span>
          ${raw(ICON.chev)}</a></li>
      </ul>

      ${backupDue ? html`<button class="banner banner--accent" style="width:100%;text-align:left" data-export>
        <span class="banner__icon">💾</span>
        <span class="banner__body"><span class="banner__title">${age == null ? 'Noch keine Sicherung' : `Letzte Sicherung vor ${age} Tagen`}</span>
        <span class="banner__text">Deine Daten liegen nur auf diesem Gerät. Jetzt kurz sichern?</span></span>
        ${raw(ICON.chev)}
      </button>` : ''}

      <h2 class="section-title">Darstellung & Training</h2>
      <section class="card">
        <p class="field__label mb-2">Design</p>
        <div class="segmented" role="radiogroup" aria-label="Design">
          ${[['system', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => html`<label><input type="radio" name="theme" value="${v}" ${s.theme === v ? 'checked' : ''}><span>${l}</span></label>`)}
        </div>
        <p class="field__label mb-2 mt-4">Schriftgröße</p>
        <div class="segmented" role="radiogroup" aria-label="Schriftgröße">
          ${FONT_SCALES.map((f) => html`<label><input type="radio" name="fontScale" value="${f.v}" ${scale === f.v ? 'checked' : ''}><span>${f.l}</span></label>`)}
        </div>
        <label class="switch-row mt-4"><span>Ton<span class="pv-setting-row__hint">Signal bei Timer-Ende und letzten 3 Sekunden</span></span><input type="checkbox" class="switch" name="sound" ${s.sound ? 'checked' : ''}></label>
        <label class="switch-row"><span>Vibration<span class="pv-setting-row__hint">Wenn das Gerät es unterstützt</span></span><input type="checkbox" class="switch" name="vibration" ${s.vibration ? 'checked' : ''}></label>
        <div class="field mt-2">
          <label class="field__label" for="restDefault">Pause zwischen Sätzen</label>
          <select id="restDefault" class="select" name="restDefault">
            ${REST_OPTIONS.map((v) => html`<option value="${v ?? ''}" ${(s.restDefault ?? null) === v ? 'selected' : ''}>${v == null ? 'Wie in der Übung vorgesehen' : `${v} Sekunden`}</option>`)}
          </select>
        </div>
      </section>

      <h2 class="section-title">Bänder <button class="btn btn--ghost btn--sm" data-band-reset>Standard</button></h2>
      <section class="card">
        <p class="card__sub" style="margin:0 0 var(--s-4)">Reihenfolge von leicht nach schwer. Danach richten sich Rekorde („stärkstes Band“) und Vorschläge.</p>
        ${BAND_GROUPS.map((g) => {
          const list = s.bands.filter((b) => b.kind === g.kind);
          if (!list.length) return '';
          return html`<p class="field__label mb-2">${g.title}</p>
            <ol class="pv-band-list mb-2">
              ${list.map((b, i) => html`<li class="pv-band" style="--band:${b.color}">
                <span class="pv-band__rank">${i + 1}</span>
                <span class="pv-band__swatch"></span>
                <span class="pv-band__name">${b.label}</span>
                <button class="btn btn--icon btn--ghost" data-band="${b.id}" data-dir="-1" aria-label="${b.label} leichter einordnen" ${i === 0 ? 'disabled' : ''}>${raw(ICON.up)}</button>
                <button class="btn btn--icon btn--ghost" data-band="${b.id}" data-dir="1" aria-label="${b.label} schwerer einordnen" ${i === list.length - 1 ? 'disabled' : ''}>${raw(ICON.down)}</button>
              </li>`)}
            </ol>
            <div class="pv-band-scale mb-4" aria-hidden="true">${list.map((b) => html`<span style="--band:${b.color}"></span>`)}</div>`;
        })}
      </section>

      <h2 class="section-title">Schmerz-Ampel</h2>
      <section class="card">
        <div class="pv-callout pv-callout--warn"><span class="pv-callout__icon">⚠️</span>
          <p class="text-sm"><strong>Nur nach Rücksprache mit deiner Physiotherapie ändern.</strong> Die Grenzen steuern Ampel, Steigerungen und Stopp-Hinweise.</p></div>
        <div class="pv-setting-row">
          <span class="pv-setting-row__label">Grün bis<span class="pv-setting-row__hint">Schmerz 0–${thr.greenMax} = passt</span></span>
          ${stepper('greenMax', thr.greenMax, { min: 0, max: Math.min(4, thr.yellowMax - 1), unit: '/10', label: 'Grün-Grenze' })}
        </div>
        <div class="pv-setting-row">
          <span class="pv-setting-row__label">Gelb bis<span class="pv-setting-row__hint">darüber = Rot</span></span>
          ${stepper('yellowMax', thr.yellowMax, { min: thr.greenMax + 1, max: 8, unit: '/10', label: 'Gelb-Grenze' })}
        </div>
        <div class="pv-setting-row">
          <span class="pv-setting-row__label">Steigern nach<span class="pv-setting-row__hint">grünen Einheiten in Folge</span></span>
          ${stepper('greenStreakToProgress', thr.greenStreakToProgress, { min: 1, max: 5, unit: '×', label: 'Grün-Serie' })}
        </div>
        <button class="btn btn--ghost btn--sm" data-thr-reset>Auf Standard zurücksetzen (2 / 5 / 2×)</button>
      </section>

      <h2 class="section-title">Daten</h2>
      <section class="card">
        <p class="card__sub" style="margin-top:0">${age == null ? 'Noch keine Sicherung erstellt.' : age === 0 ? 'Letzte Sicherung: heute ✓' : `Letzte Sicherung: vor ${age} ${age === 1 ? 'Tag' : 'Tagen'}`} · ${data.sessions.length} Einheiten gespeichert</p>
        <button class="btn btn--primary btn--block mt-4" data-export>${raw(ICON.download)} Sicherung exportieren (JSON)</button>
        <p class="field__label mb-2 mt-4">Sicherung importieren</p>
        <div class="segmented mb-2" role="radiogroup" aria-label="Import-Modus">
          <label><input type="radio" name="importMode" value="replace" ${importMode === 'replace' ? 'checked' : ''}><span>Ersetzen</span></label>
          <label><input type="radio" name="importMode" value="merge" ${importMode === 'merge' ? 'checked' : ''}><span>Zusammenführen</span></label>
        </div>
        <p class="field__hint mb-2">${importMode === 'replace' ? 'Alle Daten auf diesem Gerät werden durch die Sicherung ersetzt.' : 'Einheiten werden ergänzt, höhere Stufen und Abzeichen bleiben erhalten.'}</p>
        <label class="btn btn--outline btn--block" style="cursor:pointer">${raw(ICON.upload)} Datei wählen …<input type="file" accept="application/json,.json" data-import class="visually-hidden"></label>
      </section>

      <ul class="list list--card">
        <li><label class="list-item switch-row" style="cursor:pointer">
          <span class="list-item__icon list-item__icon--accent" aria-hidden="true">🚣</span>
          <span class="list-item__body"><span class="list-item__title">Rudergerät vorhanden</span><span class="list-item__sub">${ownsRower ? 'Rudern ist in deinem Plan (3× pro Woche)' : 'Für die Ruder-Einheiten im Plan'}</span></span>
          <input type="checkbox" class="switch" name="ownsRower" ${ownsRower ? 'checked' : ''}></label></li>
        <li><a class="list-item" href="#/ausruestung">
          <span class="list-item__icon list-item__icon--accent">🎒</span>
          <span class="list-item__body"><span class="list-item__title">Ausrüstung</span><span class="list-item__sub">${eqTotal ? `${owned}/${eqTotal} vorhanden · Einkaufsliste mit Budget` : 'Deine Bänder & Hilfsmittel'}</span></span>
          ${raw(ICON.chev)}</a></li>
        <li><button class="list-item" data-safety>
          <span class="list-item__icon list-item__icon--neutral">${raw(ICON.shield)}</span>
          <span class="list-item__body"><span class="list-item__title">Sicherheit & Hinweise</span><span class="list-item__sub">Stopp-Kriterien, Ampel, Haftungsausschluss</span></span>
          ${raw(ICON.chev)}</button></li>
      </ul>

      <div class="pv-callout pv-callout--stop"><span class="pv-callout__icon">ℹ️</span>
        <p class="text-sm">Diese App ersetzt keine ärztliche oder physiotherapeutische Beratung. Bei starken Schmerzen, Blockieren, zunehmender Schwellung oder Nachtschmerz: Training stoppen und Rücksprache halten.</p></div>

      <h2 class="section-title">Gefahrenzone</h2>
      <button class="btn btn--danger btn--block" data-reset>${raw(ICON.trash)} Alle Daten löschen</button>

      <p class="pv-version">Physio · Version ${APP_VERSION} · offline · Daten bleiben auf deinem Gerät</p>
    `);
  };

  const set = (fn) => store.update((d) => { fn(d.settings); });

  const onChange = async (e) => {
    const t = e.target;
    if (t.name === 'surgeryDate') {
      set((s) => { s.surgeryDate = t.value || null; });
      toast(t.value ? `OP-Termin: ${formatDE(t.value, { weekday: false })}` : 'OP-Termin entfernt', { icon: '📅' });
    } else if (t.name === 'theme') set((s) => { s.theme = t.value; });
    else if (t.name === 'fontScale') set((s) => { s.fontScale = Number(t.value); });
    else if (t.name === 'sound' || t.name === 'vibration') set((s) => { s[t.name] = t.checked; });
    else if (t.name === 'ownsRower') {
      set((s) => {
        const owned = new Set(s.ownedEquipment || []);
        if (t.checked) owned.add('rowing-machine'); else owned.delete('rowing-machine');
        s.ownedEquipment = [...owned];
      });
    } else if (t.name === 'restDefault') set((s) => { s.restDefault = t.value ? Number(t.value) : null; });
    else if (t.name === 'importMode') { importMode = t.value; draw(); }
    else if (t.matches('[data-import]') && t.files?.[0]) {
      const file = t.files[0];
      const replace = importMode === 'replace';
      const ok = await confirmDialog({
        title: replace ? 'Daten ersetzen?' : 'Sicherung zusammenführen?',
        text: replace ? `„${file.name}“ ersetzt alle Daten auf diesem Gerät. Tipp: vorher selbst exportieren.` : `Einheiten aus „${file.name}“ werden ergänzt.`,
        confirm: replace ? 'Ersetzen' : 'Zusammenführen', danger: replace, icon: '📥',
      });
      t.value = '';
      if (!ok) return;
      try {
        await readBackupFile(file, { mode: importMode });
        toast('Sicherung importiert', { icon: '📥' });
      } catch (err) {
        toast(err?.message || 'Import fehlgeschlagen', { kind: 'accent', icon: '⚠️', ms: 4500 });
      }
    }
  };

  const onClick = async (e) => {
    const st = e.target.closest('[data-stepper] [data-delta]');
    if (st) {
      const key = st.closest('[data-stepper]').dataset.stepper;
      const delta = Number(st.dataset.delta);
      set((s) => {
        if (key === 'weeklyGoal') s.weeklyGoal = Math.max(1, Math.min(7, (s.weeklyGoal || 3) + delta));
        else {
          const t = { ...(s.painThresholds || {}) };
          t[key] = (t[key] ?? defaults().settings.painThresholds[key]) + delta;
          s.painThresholds = normThresholds(t);
        }
      });
      return;
    }
    const band = e.target.closest('[data-band]');
    if (band) { set((s) => { s.bands = moveBand(s.bands, band.dataset.band, Number(band.dataset.dir)); }); return; }
    if (e.target.closest('[data-band-reset]')) { set((s) => { s.bands = defaults().settings.bands; }); toast('Standard-Reihenfolge wiederhergestellt'); return; }
    if (e.target.closest('[data-thr-reset]')) { set((s) => { s.painThresholds = defaults().settings.painThresholds; }); toast('Ampel-Grenzen zurückgesetzt'); return; }
    const sug = e.target.closest('[data-use-suggested]');
    if (sug) {
      set((s) => { s.surgeryDate = sug.dataset.useSuggested; });
      toast(`OP-Termin: ${formatDE(sug.dataset.useSuggested, { weekday: false })}`, { icon: '📅' });
      return;
    }
    if (e.target.closest('[data-clear-date]')) { set((s) => { s.surgeryDate = null; }); return; }
    if (e.target.closest('[data-export]')) {
      try {
        downloadBackup();
        set((s) => { s.lastBackupAt = new Date().toISOString(); });
        toast('Sicherung gespeichert', { icon: '💾' });
      } catch (err) { toast('Export fehlgeschlagen', { kind: 'accent', icon: '⚠️' }); }
      return;
    }
    if (e.target.closest('[data-safety]')) { openSheet(SAFETY, { label: 'Sicherheit & Hinweise' }); return; }
    if (e.target.closest('[data-reset]')) {
      const first = await confirmDialog({ title: 'Alle Daten löschen?', text: 'Einheiten, Stufen, XP, Abzeichen und Einstellungen werden von diesem Gerät entfernt.', confirm: 'Weiter', danger: true, icon: '🗑️' });
      if (!first) return;
      const second = await confirmDialog({ title: 'Wirklich endgültig?', text: 'Das kann nicht rückgängig gemacht werden. Hast du eine Sicherung exportiert?', confirm: 'Ja, alles löschen', cancel: 'Nein, behalten', danger: true, icon: '⚠️' });
      if (!second) return;
      store.reset();
      toast('Alle Daten gelöscht – frischer Start.', { icon: '🌱' });
    }
  };

  draw();
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(draw);
  if (query.focus === 'surgeryDate') {
    setTimeout(() => { const el = root.querySelector('#surgeryDate'); el?.scrollIntoView({ block: 'center' }); el?.focus({ preventScroll: true }); }, 60);
  }
  return () => {
    unsub();
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
    document.querySelectorAll('dialog.sheet[open], dialog.modal[open]').forEach((d) => d.close());
  };
}
