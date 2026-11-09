// Browser hardening test of the session view (Playwright, dark, 412×915 @3x, mocked speechSynthesis):
// double taps, kill/reopen with dead time, other workout while one is active, unknown workout, broken session,
// readability of hold / tempo / rest / breathing steps (screenshots), no console errors.
// Skipped by default (needs Chromium + python3). Run:  PW_E2E=1 node --test tests/hardening-session-e2e.test.js
// Screenshots go to $PW_SHOTS (default: OS temp dir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSessionPlan } from '../js/logic/progression.js';
import { defaults } from '../js/store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000 + Math.floor(Math.random() * 900) + 50;
const SHOTS = process.env.PW_SHOTS || tmpdir();
const URL0 = `http://127.0.0.1:${PORT}/`;
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'data', `${f}.json`), 'utf8'));
const content = { exercises: load('exercises').exercises, workouts: load('workouts').workouts, phases: load('phases').phases };

const MOCK = () => {
  window.__utter = [];
  class Utt { constructor(text) { this.text = text; } }
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => [{ name: 'Mock Deutsch', lang: 'de-DE', localService: true, default: true }],
    addEventListener() {}, removeEventListener() {},
    speak(u) { if (String(u.text).trim()) window.__utter.push(u.text); setTimeout(() => u.onend?.(), 200); },
    cancel() {}, resume() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utt;
};

const PRE = { pain: 0, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false };

function baseData() {
  const d = defaults();
  d.state.welcomeDone = true;
  d.state.bandsConfirmed = true;
  d.settings.restDefault = 12;
  return d;
}

/** Active session of `workoutId` (real plan); `entries` overrides the exercise list. */
function withActive(workoutId, { entries, cursor, startedAt, ...extra } = {}) {
  const d = baseData();
  d.settings.ownedEquipment = ['rowing-machine'];
  const w = content.workouts.find((x) => x.id === workoutId);
  const s = buildSessionPlan(w, d.state, content, { history: [], settings: d.settings, rowFinisher: false, rowWarmup: false });
  s.kind = w.kind;
  s.workoutName = w.name;
  s.pausedMs = 0;
  s.pre = { ...PRE };
  if (entries) s.exercises = entries.map(([exerciseId, section, x]) => ({ exerciseId, section, level: 0, sets: [], painDuring: null, sharpPain: false, rpe: null, skipped: false, ...x }));
  s.cursor = cursor || { index: 0, set: 0, step: 'exercise' };
  if (startedAt) s.startedAt = startedAt;
  Object.assign(s, extra);
  d.state.activeSession = s;
  return d;
}

test('session hardening in the browser (dark, 412×915)', { skip: !process.env.PW_E2E, timeout: 240_000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [];
  const open = async (data, hash) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(MOCK);
    await page.addInitScript((d) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('pt.v1', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, data);
    await page.goto(URL0 + hash);
    return { page, ctx };
  };
  const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pt.v1')));
  const tapTwice = async (page, sel, gap = 140) => {
    const b = await page.locator(sel).first().boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.click(x, y);
    await page.waitForTimeout(gap);
    await page.mouse.click(x, y);
  };
  try {
    // ---- 1. pre-check above the fold, double tap „Los geht’s“ must not skip exercise 1
    {
      const { page, ctx } = await open(baseData(), '#/session?workout=p1-a');
      await page.waitForSelector('pt-pain-scale');
      const pain = await page.locator('pt-pain-scale').boundingBox();
      const cta = await page.locator('.sticky-cta').boundingBox();
      assert.ok(pain.y + 140 < cta.y, `„Schmerz jetzt“ visible above the CTA (${pain.y} vs ${cta.y})`);
      await page.screenshot({ path: join(SHOTS, 'hs-pre.png') });
      await page.click('pt-pain-scale button >> nth=0');
      await tapTwice(page, '[data-act="pre-go"]');
      await page.waitForSelector('.ses-ex');
      await page.waitForTimeout(300);
      let d = await stored(page);
      const a = d.state.activeSession;
      assert.equal(a.cursor.step, 'exercise');
      assert.equal(a.exercises[a.cursor.index].skipped, false, 'exercise 1 not skipped by the 2nd tap');
      assert.ok(await page.locator('.ses-top__ex').isVisible());
      // a single tap on „Nächste Übung“ right after opening does not skip either (< 1 s)
      const first = a.cursor.index;
      await page.waitForTimeout(500);
      // double tap on „Nächste Übung“ after > 1 s: skips exercise 1 (intended), never exercise 2
      await page.waitForTimeout(700);
      await tapTwice(page, '[data-act="next"]');
      await page.waitForTimeout(400);
      d = await stored(page);
      const b = d.state.activeSession;
      assert.equal(b.exercises[first].skipped, true);
      assert.notEqual(b.cursor.index, first);
      assert.equal(b.exercises[b.cursor.index].skipped, false, 'following exercise not skipped');
      await ctx.close();
    }

    // ---- 2. double tap on a set button: stays ticked, „Rückgängig“ toast undoes it
    {
      const { page, ctx } = await open(withActive('p1-a', { entries: [['band-pull-apart', 'archery'], ['quad-set', 'knee']] }), '#/session');
      await page.waitForSelector('.set-check');
      await page.waitForTimeout(700);
      await tapTwice(page, '.set-check[data-set="0"]', 160);
      await page.waitForTimeout(200);
      assert.equal(await page.getAttribute('.set-check[data-set="0"]', 'aria-pressed'), 'true');
      await page.waitForSelector('.ses-toast-action');
      await page.click('.ses-toast-action');
      await page.waitForTimeout(150);
      assert.equal(await page.getAttribute('.set-check[data-set="0"]', 'aria-pressed'), 'false');
      // big „Satz fertig“ button (plain reps), double tap = one set
      await page.$eval('[data-act="set-done"]', (e) => e.scrollIntoView({ block: 'center' }));
      await tapTwice(page, '[data-act="set-done"]', 150);
      await page.waitForTimeout(300);
      const e0 = (await stored(page)).state.activeSession.exercises[0];
      assert.equal(e0.sets.filter((s) => s?.done).length, 1, 'double tap on „Satz fertig“ completes one set');
      await page.screenshot({ path: join(SHOTS, 'hs-rest.png') });
      await ctx.close();
    }

    // ---- 3. kill + reopen 3 h later: dead time excluded, rowing paused; > 12 h asks
    {
      const now = Date.now();
      const data = withActive('p1-a', {
        entries: [['quad-set', 'knee'], ['band-pull-apart', 'archery']],
        startedAt: new Date(now - 3 * 3600e3 - 10 * 60e3).toISOString(),
        lastActiveAt: new Date(now - 3 * 3600e3).toISOString(),
      });
      const { page, ctx } = await open(data, '#/session');
      await page.waitForSelector('.ses-ex');
      await page.waitForTimeout(300);
      const a = (await stored(page)).state.activeSession;
      assert.ok(Math.abs(a.pausedMs - 3 * 3600e3) < 60e3, `pausedMs ≈ 3 h (${a.pausedMs})`);
      assert.equal(a.pausedAt, undefined);
      // hide → pausedAt stored; visible → dead time added
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.ok((await stored(page)).state.activeSession.pausedAt, 'pausedAt on hide');
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const b = (await stored(page)).state.activeSession;
      assert.equal(b.pausedAt, undefined);
      assert.ok(b.pausedMs >= a.pausedMs + 1000);
      await ctx.close();
    }
    {
      const now = Date.now();
      const data = withActive('p1-row', {
        cursor: { index: 0, set: 0, step: 'row' },
        startedAt: new Date(now - 13 * 3600e3 - 10 * 60e3).toISOString(),
        lastActiveAt: new Date(now - 13 * 3600e3).toISOString(),
        rowTimer: { idx: 0, accMs: 0, runAt: now - 13 * 3600e3 - 8 * 60e3, log: [], done: false },
      });
      const { page, ctx } = await open(data, '#/session');
      await page.waitForSelector('dialog.ses-dlg [data-value="finish"]');
      assert.ok(await page.locator('dialog.ses-dlg [data-value="resume"]').isVisible());
      assert.ok(await page.locator('dialog.ses-dlg [data-value="discard"]').isVisible());
      await page.click('dialog.ses-dlg [data-value="finish"]');
      await page.waitForSelector('.ses-summary');
      const d = await stored(page);
      const s = d.sessions.at(-1);
      const dur = (Date.parse(s.endedAt) - Date.parse(s.startedAt) - (s.pausedMs || 0)) / 1000;
      assert.ok(dur <= 10 * 60 + 5, `duration ≈ 10 min, not 13 h (${dur} s)`);
      const rowed = s.exercises.flatMap((e) => e.sets || []).reduce((x, y) => x + (y?.seconds || 0), 0);
      assert.ok(rowed <= 8 * 60 + 5, `rowing counts no dead time (${rowed} s)`);
      assert.ok(await page.getByText('Fertig – zu Heute').isVisible());
      await ctx.close();
    }

    // ---- 4. other workout while one is active → dialog; unknown workout; broken session
    {
      const { page, ctx } = await open(withActive('p1-a'), '#/session?workout=p1-b');
      await page.waitForSelector('dialog.ses-dlg');
      const txt = await page.textContent('dialog.ses-dlg');
      assert.match(txt, /Du hast noch „.+“ offen\./);
      await page.click('dialog.ses-dlg [data-value="discard"]');
      await page.waitForSelector('[data-act="pre-go"]');
      assert.match(await page.textContent('.ses-top'), /B/);
      assert.equal((await stored(page)).state.activeSession, null);
      await ctx.close();
    }
    {
      const { page, ctx } = await open(withActive('p1-a'), '#/session?workout=p1-b');
      await page.waitForSelector('dialog.ses-dlg');
      await page.click('dialog.ses-dlg [data-value="keep"]');
      await page.waitForSelector('.ses-ex');
      assert.equal((await stored(page)).state.activeSession.workoutId, 'p1-a');
      await ctx.close();
    }
    {
      const { page, ctx } = await open(baseData(), '#/session?workout=gibt-es-nicht');
      await page.waitForSelector('text=Kein Training gefunden');
      assert.equal(await page.getAttribute('a.btn--primary', 'href'), '#/plan');
      await ctx.close();
    }
    {
      const d = baseData();
      d.state.activeSession = { id: 'x', workoutId: 'p1-a', startedAt: new Date().toISOString(), exercises: [{ exerciseId: 'gibt-es-nicht', section: 'knee', sets: [] }], cursor: { index: 0, step: 'exercise' } };
      const { page, ctx } = await open(d, '#/session');
      await page.waitForSelector('text=Dieses Training kann nicht fortgesetzt werden.');
      await page.click('[data-act="broken-discard"]');
      await page.waitForSelector('[data-act="pre-go"]');
      await ctx.close();
    }

    // ---- 5. readability: hold / tempo / rest / breathing (screenshots) – timer card above the sticky CTA
    {
      const { page, ctx } = await open(withActive('p1-a', { entries: [['quad-set', 'knee', { plannedSets: 2 }], ['mini-squat', 'knee'], ['breathing-reset', 'cooldown']] }), '#/session');
      await page.waitForSelector('pt-timer[data-role="work"]');
      await page.waitForTimeout(500);
      const fitCheck = async (name) => {
        await page.waitForTimeout(900); // smooth scroll
        const card = await page.locator('[data-slot="timer"] .pt-timer__dial').boundingBox();
        const cue = await page.locator('[data-slot="timer"] .pt-timer__cue').boundingBox();
        const cta = await page.locator('.sticky-cta').boundingBox();
        const top = await page.locator('.ses-top').boundingBox();
        assert.ok(cue.y >= top.y + top.height - 2 && card.y + card.height <= cta.y + 2, `${name}: cue + dial between header and CTA (${cue.y}/${card.y + card.height}/${cta.y})`);
        await page.screenshot({ path: join(SHOTS, `hs-${name}.png`) });
      };
      assert.ok(await page.locator('.ses-top__ex').evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 20));
      assert.ok(await page.locator('.ses-setno').evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 20));
      await page.$eval('[data-slot="timer"]', (e) => e.scrollIntoView({ block: 'end' }));
      await page.click('pt-timer[data-role="work"] [data-action="toggle"]');
      await page.waitForTimeout(6000);
      await fitCheck('hold');
      // finish the hold sets by ticking, check the rest card
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.click('.set-check[data-set="0"]');
      await page.waitForSelector('.ses-rest');
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(SHOTS, 'hs-rest-hold.png') });
      await page.click('.set-check[data-set="1"]');
      await page.waitForSelector('[data-slot="pain"]');
      await page.click('[data-slot="pain"] pt-pain-scale button >> nth=1');
      await page.waitForTimeout(1100);
      await page.click('[data-act="next"]');
      await page.waitForSelector('[data-act="tempo-manual"]'); // knee reps: Tempo-Coach is the default
      await page.waitForSelector('[data-act="pain-same"]');
      assert.match(await page.textContent('[data-act="pain-same"]'), /Wie eben \(1\)/);
      await page.waitForTimeout(600);
      await page.$eval('[data-slot="timer"]', (e) => e.scrollIntoView({ block: 'end' }));
      await page.click('pt-timer[data-role="work"] [data-action="toggle"]');
      await page.waitForTimeout(7000);
      await fitCheck('tempo');
      await page.click('[data-act="pain-same"]');
      const e1 = (await stored(page)).state.activeSession.exercises[1];
      assert.equal(e1.painDuring, 1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1100);
      await page.click('[data-act="next"]');
      await page.waitForSelector('.ses-top__ex');
      await page.waitForTimeout(600);
      await page.$eval('[data-slot="timer"]', (e) => e.scrollIntoView({ block: 'end' }));
      await page.click('pt-timer[data-role="work"] [data-action="toggle"]');
      await page.waitForTimeout(7000);
      await fitCheck('breathing');
      await ctx.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
