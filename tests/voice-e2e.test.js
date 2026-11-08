// Browser test (Playwright, 390×844): spoken cue sequence + timing gaps with a mocked speechSynthesis.
// Skipped by default (needs Chromium + python3). Run:  PW_E2E=1 node --test tests/voice-e2e.test.js
// Screenshots (phase banner light/dark) go to $PW_SHOTS (default: OS temp dir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000 + Math.floor(Math.random() * 900) + 50;
const SHOTS = process.env.PW_SHOTS || tmpdir();

const MOCK = () => {
  window.__utter = [];
  class Utt { constructor(text) { this.text = text; } }
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => [{ name: 'Mock Deutsch', lang: 'de-DE', localService: true, default: true }],
    addEventListener() {}, removeEventListener() {},
    speak(u) {
      if (String(u.text).trim()) window.__utter.push({ text: u.text, t: Date.now(), rate: u.rate, lang: u.lang });
      setTimeout(() => u.onend?.(), 350);
    },
    cancel() {}, resume() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utt;
};

function seed() {
  const now = new Date().toISOString();
  const entry = (exerciseId, section, extra) => ({ exerciseId, section, level: 0, sets: [], painDuring: null, sharpPain: false, rpe: null, skipped: false, ...extra });
  return {
    schemaVersion: 1,
    settings: { restDefault: 12, sound: true, vibration: true, theme: 'light', prepSeconds: 5, holdRelaxSeconds: 5 },
    state: {
      welcomeDone: true, bandsConfirmed: true,
      activeSession: {
        id: 's-e2e', workoutId: 'p1-a', phaseId: 'p1-basis', status: 'active', startedAt: now, taper: false, kind: 'strength', pausedMs: 0,
        pre: { pain: 0, swelling: 0, mechanical: { locking: false, givingWay: false }, nightPain: false, swellingOver48h: false },
        exercises: [
          entry('quad-set', 'knee', { plannedSets: 2, override: { reps: 2, hold: 5 } }),
          entry('seated-spine-wave', 'warmup', { plannedSets: 1, override: { reps: 3 } }),
        ],
        cursor: { index: 0, set: 0, step: 'exercise' },
      },
    },
    sessions: [],
  };
}

test('voice cues in the browser: hold + tempo exercise, gaps ≥ 5 s, no console errors', { skip: !process.env.PW_E2E, timeout: 120_000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.clock.install();
    await page.addInitScript(MOCK);
    await page.addInitScript((data) => { if (!localStorage.getItem('pt.v1')) localStorage.setItem('pt.v1', JSON.stringify(data)); }, seed());
    await page.goto(`http://127.0.0.1:${PORT}/#/session`);
    await page.waitForSelector('pt-timer[data-role="work"]');
    await page.waitForTimeout(400); // "Willkommen zurück" toast etc.

    // ---- hold exercise: tap Start (prep 5 s → holds with 5 s relax), rest, second set auto-starts
    await page.click('pt-timer[data-role="work"] [data-action="toggle"]');
    await page.clock.runFor(1500);
    assert.equal(await page.$eval('pt-timer[data-role="work"] .pt-timer__cue', (e) => e.textContent), 'Bereit machen');
    await page.$eval('[data-slot="timer"]', (e) => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(350); // let the color transition finish
    await page.locator('[data-slot="timer"]').screenshot({ path: join(SHOTS, 'phase-prep-light.png') });
    await page.clock.runFor(5000); // in hold 1
    assert.equal(await page.getAttribute('pt-timer[data-role="work"]', 'data-cue'), 'hold');
    await page.waitForTimeout(350); // let the color transition finish
    await page.locator('[data-slot="timer"]').screenshot({ path: join(SHOTS, 'phase-hold-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await page.waitForTimeout(350); // let the color transition finish
    await page.locator('[data-slot="timer"]').screenshot({ path: join(SHOTS, 'phase-hold-dark.png') });
    await page.clock.runFor(5000); // relax
    assert.equal(await page.getAttribute('pt-timer[data-role="work"]', 'data-cue'), 'relax');
    await page.waitForTimeout(350); // let the color transition finish
    await page.locator('[data-slot="timer"]').screenshot({ path: join(SHOTS, 'phase-relax-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    for (let i = 0; i < 60; i++) await page.clock.runFor(1000);
    await page.waitForSelector('[data-slot="done"]:not([hidden])');

    const hold = await page.evaluate(() => window.__utter);
    const texts = hold.map((u) => u.text);
    const at = (t, from = 0) => hold.find((u, i) => i >= from && u.text === t)?.t;
    assert.deepEqual(texts, [
      'Bereit machen: Quadrizeps anspannen (Quad Set)', 'Drei', 'Zwei', 'Eins', 'Anspannen', 'Loslassen', 'Anspannen',
      'Loslassen. Satz geschafft. Pause, 12 Sekunden', 'Gleich geht\'s weiter',
      'Bereit machen. Satz 2 von 2', 'Drei', 'Zwei', 'Eins', 'Anspannen', 'Loslassen', 'Anspannen',
      'Loslassen. Übung fertig. Nächste Übung: Wirbelsäulen-Welle im Sitzen',
    ]);
    assert.ok(hold.every((u) => u.lang === 'de-DE'));
    assert.ok(at('Anspannen') - hold[0].t >= 5000, 'prep ≥ 5 s before set 1');
    assert.ok(at('Anspannen', 5) - at('Loslassen') >= 5000, 'relax ≥ 5 s between hold reps');
    const i2 = texts.indexOf('Bereit machen. Satz 2 von 2');
    assert.ok(at('Anspannen', i2) - hold[i2].t >= 5000, 'prep ≥ 5 s before set 2');
    const restAt = at('Loslassen. Satz geschafft. Pause, 12 Sekunden');
    assert.ok(restAt - at('Anspannen', 6) >= 5000, 'last hold of set 1 lasts its 5 s');
    assert.ok(hold[i2].t - restAt >= 12000, 'rest unchanged (12 s)');
    const sets = await page.$$eval('.set-check[aria-pressed="true"]', (b) => b.length);
    assert.equal(sets, 2);

    // ---- knee pain → next exercise (tempo coach 3-0-3 × 3)
    await page.click('[data-slot="pain"] pt-pain-scale button >> nth=0');
    await page.click('[data-act="next"]');
    await page.waitForSelector('[data-act="tempo"]');
    await page.evaluate(() => { window.__utter = []; });
    await page.click('[data-act="tempo"]');
    await page.clock.runFor(2000);
    assert.equal(await page.getAttribute('pt-timer[data-role="work"]', 'data-cue'), 'prep');
    for (let i = 0; i < 30; i++) await page.clock.runFor(1000);
    const tempo = await page.evaluate(() => window.__utter);
    const tt = tempo.map((u) => u.text);
    assert.equal(tt[0], 'Bereit machen: Wirbelsäulen-Welle im Sitzen');
    assert.deepEqual(tt.slice(1, 4), ['Drei', 'Zwei', 'Eins']);
    assert.equal(tt.at(-1), 'Übung fertig. Das war die letzte Übung.');
    const moves = tt.slice(4, -1);
    assert.equal(moves.length, 6, '3 reps × (up, down) – tempo 3-0-3');
    assert.ok(moves.every((m) => !/\d|^(Eins|Zwei|Drei)$/.test(m)), 'reps are not counted aloud');
    assert.ok(tempo[4].t - tempo[0].t >= 5000, 'prep ≥ 5 s before the tempo set');
    assert.ok(tempo[5].t - tempo[4].t >= 3000, 'tempo 3 s per movement');

    // ---- settings: voice section + "Stimme testen"
    await page.goto(`http://127.0.0.1:${PORT}/#/mehr`);
    await page.waitForSelector('[data-voice-test]');
    assert.match(await page.textContent('[data-voice-status]'), /Mock Deutsch · offline/);
    await page.evaluate(() => { window.__utter = []; });
    await page.click('[data-voice-test]');
    assert.match((await page.evaluate(() => window.__utter))[0]?.text || '', /Anspannen/);
    await page.check('input[name="voiceRate"][value="1.2"]');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pt.v1')).settings.voiceRate), 1.2);
    await page.$eval('[data-voice-card]', (e) => e.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.locator('[data-voice-card]').screenshot({ path: join(SHOTS, 'settings-voice-light.png') });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
});
