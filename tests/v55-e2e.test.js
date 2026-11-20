// v5.5 browser QA (PW_E2E=1): Schwingplatte + Balance-Kissen ticked → Balance unit on Heute/Plan, swing variant in the
// strength plan, Balance session starts; nothing without the gear; old OP date 2027-01-05 is moved to 2027-01-19.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults } from '../js/store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000 + Math.floor(Math.random() * 900) + 50;
const SHOTS = process.env.PW_SHOTS || tmpdir();
const URL0 = `http://127.0.0.1:${PORT}/`;

function user(balance) {
  const d = defaults();
  d.settings.ownedEquipment = ['office-chair', 'rowing-machine', 'sling-trainer', 'door-anchor', 'band-handles', 'massage-stick', ...balance];
  d.settings.shoulderImpingement = true;
  d.settings.surgeryDate = '2027-01-05';
  d.settings._updatedAt = { surgeryDate: '2026-11-08T09:00:00.000Z' };
  d.state.welcomeDone = true;
  d.state.bandsConfirmed = true;
  d.state.seatNotice = 'seen';
  d.state.equipmentNotice = 'seen';
  return d;
}

test('v5.5 QA in the browser: Balance unit, swing variant, OP date moved', { skip: !process.env.PW_E2E, timeout: 180_000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [];
  const open = async (data, hash) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript((d) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('pt.v1', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, data);
    await page.goto(URL0 + hash);
    return { page, ctx };
  };
  const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pt.v1')));
  try {
    {
      const { page, ctx } = await open(user(['balance-pad', 'swing-platform']), '#/heute');
      await page.waitForSelector('[data-balance-start]');
      assert.match(await page.textContent('[data-balance-start]'), /Balance/);
      const d = await stored(page);
      assert.equal(d.settings.surgeryDate, '2027-01-19', 'OP date moved and written back');
      assert.equal(d.settings._updatedAt.surgeryDate, '2026-11-20T00:00:00.000Z');
      await page.screenshot({ path: join(SHOTS, 'v55-heute.png'), fullPage: true });
      await page.goto(URL0 + '#/plan');
      await page.waitForSelector('.pv-workout');
      await page.$$eval('details.pv-workout', (els) => els.forEach((e) => { e.open = true; }));
      await page.waitForTimeout(200);
      const names = await page.$$eval('.pv-ex-row__name', (els) => els.map((e) => e.textContent.trim()));
      assert.ok(names.some((n) => /Schwingplatte: Einbeinstand/.test(n)), 'swing variant in the strength plan');
      assert.ok(!names.some((n) => n === 'Einbeinstand links'), 'base item replaced');
      assert.ok(await page.locator('details.pv-workout[data-wid="p1-balance"]').count(), 'Balance card in the plan');
      await page.screenshot({ path: join(SHOTS, 'v55-plan.png'), fullPage: true });
      await page.goto(URL0 + '#/session?workout=p1-balance');
      await page.waitForSelector('[data-act="pre-go"]');
      await page.click('pt-pain-scale button >> nth=0');
      await page.click('[data-act="pre-go"]');
      await page.waitForTimeout(500);
      const a = (await stored(page)).state.activeSession;
      assert.equal(a.kind, 'balance');
      assert.equal(a.rowWarmup, false);
      assert.ok(a.exercises.some((e) => e.exerciseId === 'swing-single-leg-stance'));
      await page.screenshot({ path: join(SHOTS, 'v55-session.png'), fullPage: true });
      await ctx.close();
    }
    {
      const { page, ctx } = await open(user([]), '#/heute');
      await page.waitForSelector('.pv-quickstart');
      assert.equal(await page.locator('[data-balance-start]').count(), 0, 'no Balance unit without the gear');
      await page.goto(URL0 + '#/plan');
      await page.waitForSelector('[data-balance-hint]');
      await ctx.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
