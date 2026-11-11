// v5.3 browser QA (Playwright, dark, 412×915): the user's equipment (office chair with wheels, massage stick, sling,
// rowing machine, door anchor, handles; NO fixed chair) + shoulder protection. Checks: migration + Heute notice,
// context-aware CTA through a hold exercise, a rest and a rep exercise, rowing card without timer, knee relief
// routine starts and runs, plan screens without unsafe chair / overhead exercises, no console errors.
// Skipped by default. Run:  PW_E2E=1 node --test tests/v53-e2e.test.js   (screenshots → $PW_SHOTS, default OS temp)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults } from '../js/store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000 + Math.floor(Math.random() * 900) + 50;
const SHOTS = process.env.PW_SHOTS || tmpdir();
const URL0 = `http://127.0.0.1:${PORT}/`;
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'data', `${f}.json`), 'utf8'));
const exercises = load('exercises').exercises;
const UNSAFE_CHAIR = exercises.filter((e) => e.equipment.includes('chair-fixed')).map((e) => e.name);
const OVERHEAD = exercises.filter((e) => !e.archeryDraw && e.block !== 'cardio' && (e.shoulderElevationDeg ?? 0) > 65).map((e) => e.name);

const MOCK = () => {
  window.__utter = [];
  class Utt { constructor(text) { this.text = text; } }
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => [{ name: 'Mock Deutsch', lang: 'de-DE', localService: true, default: true }],
    addEventListener() {}, removeEventListener() {},
    speak(u) { if (String(u.text).trim()) window.__utter.push(u.text); setTimeout(() => u.onend?.(), 120); },
    cancel() {}, resume() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utt;
};

/** v5.2 data of this user (equipment model 2, one done session) – the v5.3 migration runs on load. */
function legacyUser() {
  const d = defaults();
  d.settings.equipmentModel = 2;
  delete d.settings.shoulderImpingement;
  delete d.settings.shoulderMaxElevationDeg;
  d.settings.ownedEquipment = ['rowing-machine', 'sling-trainer', 'door-anchor', 'band-handles', 'massage-stick'];
  d.settings.surgeryDate = '2027-01-05';
  d.settings.restDefault = 5;
  d.state.welcomeDone = true;
  d.state.bandsConfirmed = true;
  delete d.state.seatNotice;
  d.sessions = [{ id: 's-old', workoutId: 'p1-a', phaseId: 'p1-basis', kind: 'strength', status: 'done', startedAt: '2026-11-09T17:00:00.000Z', endedAt: '2026-11-09T17:30:00.000Z',
    exercises: [{ exerciseId: 'quad-set', section: 'knee', level: 0, sets: [{ done: true }], painDuring: 1 }], traffic: { provisional: 'green', final: 'green', reasons: [] }, nextDay: { pain: 1, swelling: 0, stiffness: 0, at: '2026-11-10T08:00:00.000Z' } }];
  return d;
}

const entry = (exerciseId, section, x = {}) => ({ exerciseId, section, level: 0, sets: [], painDuring: null, sharpPain: false, rpe: null, skipped: false, ...x });
function withActive(entries) {
  const d = legacyUser();
  d.state.activeSession = {
    id: 's-qa', workoutId: 'p1-a', phaseId: 'p1-basis', kind: 'strength', status: 'active', startedAt: new Date().toISOString(), taper: false, pausedMs: 0,
    pre: { pain: 0, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false },
    exercises: entries, cursor: { index: 0, set: 0, step: 'exercise' }, budgetMin: 32,
  };
  return d;
}

test('v5.3 QA in the browser (dark, 412×915, user equipment + shoulder protection)', { skip: !process.env.PW_E2E, timeout: 240_000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [];
  const open = async (data, hash, { clock = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (clock) await page.clock.install();
    await page.addInitScript(MOCK);
    await page.addInitScript((d) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('pt.v1', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, data);
    await page.goto(URL0 + hash);
    return { page, ctx };
  };
  const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pt.v1')));
  const cta = (page) => page.locator('[data-act="cta"]');
  const ctaText = async (page) => (await cta(page).textContent()).trim();
  try {
    // ---- 1. migration + Heute: seat notice, relief quick start
    {
      const { page, ctx } = await open(legacyUser(), '#/heute');
      await page.waitForSelector('.pv-seat-banner');
      assert.match(await page.textContent('.pv-seat-banner'), /Sitzgelegenheit angeben – fester Stuhl oder PC-Stuhl mit Rollen\?/);
      const d = await stored(page);
      assert.ok(d.settings.ownedEquipment.includes('office-chair') && !d.settings.ownedEquipment.includes('chair-fixed'));
      assert.equal(d.settings.shoulderImpingement, true);
      assert.ok(d.settings._updatedAt.shoulderImpingement, 'migrated setting carries a sync stamp');
      assert.ok(await page.locator('[data-relief-start]').isVisible());
      await page.screenshot({ path: join(SHOTS, 'v53-heute.png'), fullPage: true });
      await page.click('[data-seat-dismiss]');
      await page.waitForTimeout(200);
      assert.equal((await stored(page)).state.seatNotice, 'seen');
      // plan: no unsafe chair exercise, no overhead exercise; relief card
      await page.goto(URL0 + '#/plan');
      await page.waitForSelector('.pv-workout');
      await page.$$eval('details.pv-workout', (els) => els.forEach((e) => { e.open = true; }));
      await page.waitForTimeout(200);
      const names = await page.$$eval('.pv-ex-row__name', (els) => els.map((e) => e.textContent.trim()));
      assert.ok(names.length > 30, `plan rows: ${names.length}`);
      for (const n of names) {
        assert.ok(!UNSAFE_CHAIR.includes(n), `unsafe chair exercise in the plan: ${n}`);
        assert.ok(!OVERHEAD.includes(n), `overhead exercise in the plan: ${n}`);
      }
      assert.match(await page.textContent('main, body'), /Knie-Entlastung/);
      await page.screenshot({ path: join(SHOTS, 'v53-plan.png'), fullPage: true });
      // profile: shoulder switch on
      await page.goto(URL0 + '#/profil');
      await page.waitForSelector('[data-shoulder-card]');
      assert.equal(await page.isChecked('input[name="shoulderImpingement"]'), true);
      await page.locator('[data-shoulder-card]').screenshot({ path: join(SHOTS, 'v53-profil-schulter.png') });
      await ctx.close();
    }

    // ---- 2. CTA cycle: hold exercise (start → pause → resume → auto set → rest → skip rest) and rep exercise
    {
      const data = withActive([
        entry('band-draw-hold', 'archery', { plannedSets: 2, override: { reps: 1, hold: 4 } }),
        entry('low-row-band', 'archery', { plannedSets: 2, override: { reps: 3 } }),
      ]);
      const { page, ctx } = await open(data, '#/session', { clock: true });
      await page.waitForSelector('[data-act="cta"]');
      await page.clock.runFor(1200);
      assert.equal(await ctaText(page), 'Satz starten');
      assert.ok(await page.locator('[data-shoulder-note]').isVisible(), 'shoulder hint on shoulder exercises');
      await page.screenshot({ path: join(SHOTS, 'v53-cta-start.png') });
      await cta(page).click();
      await page.clock.runFor(1500);
      assert.equal(await ctaText(page), 'Anhalten');
      assert.equal(await page.getAttribute('pt-timer[data-role="work"]', 'data-state'), 'running');
      await cta(page).click();
      await page.clock.runFor(800);
      assert.equal(await ctaText(page), 'Weiter');
      assert.equal(await page.getAttribute('pt-timer[data-role="work"]', 'data-state'), 'paused');
      await cta(page).click();
      await page.clock.runFor(800);
      assert.equal(await ctaText(page), 'Anhalten');
      for (let i = 0; i < 9; i++) await page.clock.runFor(1000); // prep 5 s + hold 4 s → set done → rest 5 s
      assert.equal(await ctaText(page), 'Pause überspringen');
      await page.screenshot({ path: join(SHOTS, 'v53-cta-rest.png') });
      const before = (await stored(page)).state.activeSession.exercises[0].sets.filter((x) => x?.done).length;
      assert.equal(before, 1, 'first set ticked by the timer');
      await cta(page).click();
      await page.clock.runFor(1200);
      assert.equal(await ctaText(page), 'Anhalten', 'skipping the rest starts the next set (prep)');
      for (let i = 0; i < 12; i++) await page.clock.runFor(1000);
      assert.equal(await ctaText(page), 'Nächste Übung');
      await page.click('[data-slot="rpe"] pt-pain-scale button >> nth=3');
      await page.clock.runFor(900);
      // a fast double tap on „Nächste Übung“ must not skip the next exercise
      const box = await cta(page).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.clock.runFor(150);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.clock.runFor(1200);
      let a = (await stored(page)).state.activeSession;
      assert.equal(a.cursor.index, 1);
      assert.equal(a.exercises[1].skipped, false, 'rep exercise not skipped by the double tap');
      // rep exercise without timer: „Satz fertig“ → rest → … → „Zum Abschluss“
      await page.clock.runFor(1200);
      assert.equal(await ctaText(page), 'Satz fertig');
      await page.screenshot({ path: join(SHOTS, 'v53-cta-reps.png') });
      await cta(page).click();
      await page.clock.runFor(900);
      assert.equal(await ctaText(page), 'Pause überspringen');
      for (let i = 0; i < 7; i++) await page.clock.runFor(1000);
      assert.equal(await ctaText(page), 'Satz fertig', 'rest over → next set by hand');
      await cta(page).click();
      await page.clock.runFor(900);
      assert.equal(await ctaText(page), 'Zum Abschluss');
      a = (await stored(page)).state.activeSession;
      assert.equal(a.exercises[1].sets.filter((x) => x?.done).length, 2);
      // RPE nudge first, then to the post-check
      await cta(page).click();
      await page.clock.runFor(900);
      await page.click('[data-slot="rpe"] pt-pain-scale button >> nth=3');
      await page.clock.runFor(900);
      await cta(page).click();
      await page.clock.runFor(900);
      // green knee + rowing machine → the finisher offer comes first, else the post-check
      assert.ok(['post', 'finisher'].includes((await stored(page)).state.activeSession.cursor.step));
      await ctx.close();
    }

    // ---- 3. rowing warm-up: card without timer, „Gerudert ✓“ needs the knee pain, saves minutes
    {
      const data = withActive([entry('row-warmup-10', 'cardio', { plannedSets: 1 }), entry('scapula-setting', 'archery')]);
      const { page, ctx } = await open(data, '#/session');
      await page.waitForSelector('.row-card');
      assert.match(await page.textContent('.row-card__title'), /10 Min\. locker rudern, Schlagzahl 18–22/);
      assert.equal(await page.locator('.row-card pt-timer, .row-timer').count(), 0, 'no rowing timer');
      assert.equal(await ctaText(page), 'Gerudert ✓');
      assert.equal(await page.inputValue('[data-row="minutes"]'), '10');
      await page.screenshot({ path: join(SHOTS, 'v53-row-card.png'), fullPage: true });
      await page.click('[data-act="row-plus"]');
      await page.waitForTimeout(800);
      await cta(page).click(); // pain missing → nudge, stays
      await page.waitForTimeout(300);
      assert.equal((await stored(page)).state.activeSession.cursor.index, 0);
      await page.click('[data-slot="pain"] pt-pain-scale button >> nth=1');
      await page.waitForTimeout(800);
      await cta(page).click();
      await page.waitForSelector('.ses-ex');
      const a = (await stored(page)).state.activeSession;
      assert.equal(a.warmupRowing.durationSec, 660);
      assert.ok(a.exercises[0].sets.some((x) => x.done));
      assert.equal(a.exercises[0].painDuring, 1);
      const said = await page.evaluate(() => window.__utter.join(' | '));
      assert.match(said, /Rudern: 10 Minuten locker rudern/);
      assert.ok(!/Nur Arme|Acht Minuten/.test(said), 'no rowing phase announcements');
      await ctx.close();
    }

    // ---- 4. knee relief routine starts and runs (pre-check → first exercise with timer CTA)
    {
      const d = legacyUser();
      const { page, ctx } = await open(d, '#/heute');
      await page.waitForSelector('[data-relief-start] a');
      await page.click('[data-relief-start] a');
      await page.waitForSelector('[data-act="pre-go"]');
      assert.match(await page.textContent('.ses-intro'), /Knie-Entlastung/);
      await page.click('pt-pain-scale button >> nth=2');
      await page.click('[data-act="pre-go"]');
      await page.waitForSelector('[data-act="cta"]');
      await page.waitForTimeout(1100);
      assert.match(await page.textContent('.ses-top__ex'), /Kniependel/);
      assert.ok(await page.locator('[data-chair-note]').isVisible(), 'office chair note on seated exercises');
      assert.equal(await ctaText(page), 'Satz starten');
      await cta(page).click();
      await page.waitForTimeout(1500);
      assert.equal(await ctaText(page), 'Anhalten');
      await page.screenshot({ path: join(SHOTS, 'v53-relief.png') });
      await ctx.close();
    }
    // ---- 5. separate rowing session: one card for all parts, then post-check; values in session.rowing
    {
      const { page, ctx } = await open(legacyUser(), '#/session?workout=p1-row');
      await page.waitForSelector('[data-act="pre-go"]');
      await page.click('pt-pain-scale button >> nth=0');
      await page.click('[data-act="pre-go"]');
      await page.waitForSelector('.row-card');
      assert.equal(await page.locator('.row-card__detail li').count(), 3, 'technique warm-up, main part, cool-down');
      await page.fill('[data-row="minutes"]', '18');
      await page.click('.row-card details summary');
      await page.fill('[data-row="distanceM"]', '3600');
      await page.click('[data-slot="pain"] pt-pain-scale button >> nth=0');
      await page.waitForTimeout(800);
      await cta(page).click();
      await page.waitForSelector('[data-act="finish"]');
      const a = (await stored(page)).state.activeSession;
      assert.equal(a.rowing.durationSec, 1080);
      assert.equal(a.rowing.distanceM, 3600);
      assert.equal(a.exercises.flatMap((e) => e.sets).reduce((x, y) => x + (y.seconds || 0), 0) > 900, true);
      await ctx.close();
    }
    // ---- 6. layperson texts: short + steps below the figure (large), „Mehr Details“ collapsed, setup in the timer card,
    //         starting a set collapses the details and brings the timer above the sticky button (also during the rest)
    {
      const data = withActive([entry('wall-sit', 'knee', { plannedSets: 2, override: { reps: 1, hold: 4 } }), entry('scapula-setting', 'archery')]);
      const { page, ctx } = await open(data, '#/session', { clock: true });
      await page.waitForSelector('[data-steps]');
      await page.clock.runFor(1200);
      const fig = await page.locator('.ses-fig').boundingBox();
      const howto = await page.locator('[data-howto]').boundingBox();
      assert.ok(howto.y >= fig.y + fig.height - 1 && howto.y - (fig.y + fig.height) < 40, `howto directly below the figure (${fig.y + fig.height} → ${howto.y})`);
      assert.ok(await page.locator('[data-short]').isVisible());
      const steps = await page.$$eval('[data-steps] li', (els) => els.map((e) => ({ t: e.textContent.trim(), fs: parseFloat(getComputedStyle(e).fontSize) })));
      const wsit = exercises.find((e) => e.id === 'wall-sit');
      assert.deepEqual(steps.map((x) => x.t), wsit.steps);
      assert.ok(steps.every((x) => x.fs >= 18), `step font ≥ 18 px (${steps.map((x) => x.fs)})`);
      assert.ok(parseFloat(await page.$eval('[data-short]', (e) => getComputedStyle(e).fontSize)) >= 18);
      assert.equal(await page.$eval('details[data-more]', (e) => e.open), false, 'Mehr Details collapsed');
      assert.match(await page.textContent('[data-setup]'), /Rücken an die Wand/);
      await page.screenshot({ path: join(SHOTS, 'v53-howto.png'), fullPage: true });
      await page.click('details[data-more] > summary');
      await page.clock.runFor(300);
      assert.ok(await page.locator('[data-setup-list]').isVisible());
      assert.match(await page.textContent('[data-setup-list]'), /30–40 cm \(gut zwei Fußlängen\) vor der Wand/);
      assert.match(await page.textContent('[data-feel]'), /Du spürst/);
      await page.screenshot({ path: join(SHOTS, 'v53-howto-details.png'), fullPage: true });
      const inView = async (sel) => {
        const b = await page.locator(sel).boundingBox();
        const c = await page.locator('.sticky-cta .ses-cta').boundingBox();
        return b && b.y >= 0 && b.y + b.height <= c.y + 1 ? true : `${sel}: ${b?.y}+${b?.height} vs CTA ${c.y}`;
      };
      await cta(page).click();
      await page.clock.runFor(1500);
      await page.waitForTimeout(800); // smooth scroll to the timer card runs on real time
      assert.equal(await ctaText(page), 'Anhalten');
      assert.equal(await page.$eval('details[data-more]', (e) => e.open), false, 'details auto-collapsed on start');
      assert.equal(await inView('[data-slot="timer"] pt-timer'), true);
      assert.ok(await page.locator('[data-slot="timer"] [data-setup]').isVisible(), 'setup line visible during prep');
      await page.screenshot({ path: join(SHOTS, 'v53-howto-timer.png') });
      for (let i = 0; i < 9; i++) await page.clock.runFor(1000); // prep 5 s + hold 4 s → rest
      assert.equal(await ctaText(page), 'Pause überspringen');
      assert.equal(await inView('[data-slot="rest"] pt-timer'), true);
      // exercise detail: Ausgangsposition first, then the steps
      await page.goto(URL0 + '#/uebung/wall-sit');
      await page.waitForSelector('[data-howto] [data-steps]');
      const order = await page.$eval('[data-howto]', (el) => [...el.querySelectorAll('[data-setup], [data-steps], [data-feel]')].map((e) => e.dataset.setup != null ? 'setup' : e.dataset.steps != null ? 'steps' : 'feel'));
      assert.deepEqual(order, ['setup', 'steps', 'feel']);
      assert.match(await page.textContent('[data-short]'), /Wand/);
      await ctx.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
