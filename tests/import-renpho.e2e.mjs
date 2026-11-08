#!/usr/bin/env node
// End-to-end check of #/import with real offline OCR (not part of `node --test`; needs Playwright + Chrome).
//   node tests/import-renpho.e2e.mjs [outDir]
// - serves the repo on localhost, blocks every non-localhost request (no CDN allowed)
// - 390×844, light + dark: uploads tests/fixtures/renpho/sample-de.jpg, OCR, review shows all 19 values,
//   „Übernehmen“ → health log entry; the dark run happens with the browser OFFLINE (SW + OCR cache only)
// - Web Share Target: POST FormData to ./share-target through the SW → 303 → #/import?shared=1 → review → apply
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const { chromium } = playwright;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'physio-import-e2e'));
fs.mkdirSync(outDir, { recursive: true });
const port = 8800 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const base = `http://localhost:${port}/`;
const fixture = path.join(root, 'tests/fixtures/renpho/sample-de.jpg');
const EXPECTED = {
  weightKg: '102,1', bmi: '32,2', bodyFatPct: '33,6', bodyFatKg: '34,31', subcutFatPct: '29,2', visceralFat: '15', musclePct: '63,1',
  muscleKg: '64,43', skeletalMusclePct: '42,7', skeletalMuscleKg: '43,6', bonePct: '3,3', boneKg: '3,36', fatFreeKg: '67,79',
  metabolicAge: '52', bmrKcal: '1821', waterPct: '47,9', waterKg: '48,91', proteinPct: '15,1', proteinKg: '15,42',
};

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/usr/bin/google-chrome')) launchOpts.executablePath = '/usr/bin/google-chrome';
const browser = await chromium.launch(launchOpts);
const blocked = [];
const errors = [];
const t0 = Date.now();

async function newContext(colorScheme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme, serviceWorkers: 'allow' });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return r.continue();
    blocked.push(u.href);
    return r.abort();
  });
  return ctx;
}

async function readyPage(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + 'index.html#/heute');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  return page;
}

async function checkReview(page, label) {
  await page.waitForSelector('[data-row="weightKg"] input', { timeout: 120000 });
  const vals = await page.$$eval('[data-val]', (els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-val'), e.value])));
  for (const [k, v] of Object.entries(EXPECTED)) assert.equal(vals[k], v, `${label}: ${k}`);
  assert.equal(await page.inputValue('[data-date]'), '2026-11-08');
  assert.equal(await page.inputValue('[data-time]'), '09:38:54');
  const susp = await page.$$eval('.imp-row.is-suspicious', (els) => els.map((e) => e.getAttribute('data-row')));
  return susp;
}

async function healthEntry(page) {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('pt.v1')).state.healthLog || []).find((e) => e.date === '2026-11-08'));
}

const report = {};
try {
  // ---------- light: first use, downloads OCR assets (localhost only) ----------
  const light = await newContext('light');
  let page = await readyPage(light);
  await page.goto(base + 'index.html#/import');
  await page.waitForSelector('[data-pick="image"]');
  await page.screenshot({ path: path.join(outDir, 'import-choose-light.png'), fullPage: true });
  const msgs = [];
  page.on('console', (m) => msgs.push(m.text()));
  const tOcr = Date.now();
  await page.setInputFiles('[data-pick="image"]', fixture);
  await page.waitForSelector('[data-status]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'import-progress-light.png') });
  report.firstStatus = await page.textContent('[data-status]').catch(() => '');
  report.suspiciousLight = await checkReview(page, 'light');
  report.ocrFirstMs = Date.now() - tOcr;
  await page.screenshot({ path: path.join(outDir, 'import-review-light.png'), fullPage: true });
  report.ocrCache = await page.evaluate(async () => (await (await caches.open('pt-ocr-5.1.1')).keys()).map((r) => r.url.split('/vendor/tesseract/')[1]).sort());
  report.precacheHasVendor = await page.evaluate(async () => {
    for (const k of await caches.keys()) if (k.startsWith('physio-')) for (const r of await (await caches.open(k)).keys()) if (r.url.includes('/vendor/')) return true;
    return false;
  });
  await page.click('[data-apply]');
  await page.waitForSelector('.imp-done');
  report.toast = await page.textContent('.toast__text').catch(() => '');
  const e1 = await healthEntry(page);
  assert.ok(e1, 'entry saved');
  for (const k of Object.keys(EXPECTED)) assert.equal(String(e1[k]).replace('.', ','), EXPECTED[k], `saved ${k}`);
  assert.equal(e1.measuredAt, '2026-11-08T09:38:54');
  assert.equal(e1.sources.weightKg, 'renpho-ocr');
  await page.screenshot({ path: path.join(outDir, 'import-done-light.png') });
  await page.click('a[href="#/gesundheit"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 'health-after-import-light.png'), fullPage: true });

  // ---------- share target (light context, SW controlled) ----------
  await page.goto(base + 'index.html#/heute');
  const share = await page.evaluate(async () => {
    const img = await (await fetch('tests/fixtures/renpho/sample-de.jpg')).blob();
    const fd = new FormData();
    fd.append('files', new File([img], 'Screenshot_RENPHO.jpg', { type: 'image/jpeg' }));
    fd.append('title', 'RENPHO');
    const res = await fetch('./share-target', { method: 'POST', body: fd });
    const keys = (await (await caches.open('pt-share')).keys()).map((r) => r.url);
    return { status: res.status, redirected: res.redirected, url: res.url, keys, isIndex: (await res.text()).includes('tabbar') };
  });
  // the SW answers 303 → the GET of ./ (fragment #/import?shared=1 is not part of Response.url) is the app shell
  assert.equal(share.status, 200);
  assert.equal(share.url, base);
  assert.equal(share.isIndex, true);
  assert.equal(share.keys.length, 1);
  report.share = share;
  // real navigation the way Chrome does it for a share: form POST → 303 → #/import?shared=1
  await page.evaluate(async () => {
    const img = await (await fetch('tests/fixtures/renpho/sample-de.jpg')).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([img], 'Screenshot_RENPHO2.jpg', { type: 'image/jpeg' }));
    const f = document.createElement('form');
    f.method = 'POST'; f.action = './share-target'; f.enctype = 'multipart/form-data';
    const inp = document.createElement('input'); inp.type = 'file'; inp.name = 'files'; inp.files = dt.files;
    const txt = document.createElement('textarea'); txt.name = 'text'; txt.value = 'Gewicht 101,90 kg\nBMI 32,1';
    f.append(inp, txt); document.body.append(f); f.submit();
  });
  await page.waitForURL(/#\/import/, { timeout: 15000 });
  report.shareUrl = page.url();
  // 3 shared items: image (fetch POST), image + text (form POST) → three reviews in a row
  await page.waitForSelector('[data-row="weightKg"] input', { timeout: 120000 });
  const counterTxt = await page.textContent('.imp-meta .chip');
  report.shareCounter = counterTxt;
  await checkReview(page, 'shared');
  await page.click('[data-discard]'); // skip 1st
  await page.waitForSelector('[data-row="weightKg"] input', { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('.imp-meta .chip')?.textContent.startsWith('2'));
  await page.click('[data-discard]'); // skip 2nd
  await page.waitForFunction(() => document.querySelector('.imp-meta .chip')?.textContent.startsWith('3'), null, { timeout: 120000 });
  const textVal = await page.inputValue('[data-val="weightKg"]');
  assert.equal(textVal, '101,9');
  await page.click('[data-discard]');
  await page.waitForSelector('.imp-done');
  report.shareLeft = await page.evaluate(async () => (await (await caches.open('pt-share')).keys()).length);
  assert.equal(report.shareLeft, 0);
  await light.close();

  // ---------- dark: fresh profile, assets loaded once online, then OCR fully OFFLINE ----------
  const dark = await newContext('dark');
  page = await readyPage(dark);
  await page.evaluate(async () => { const o = await import('./js/import/ocr.js'); await o.prefetchAssets(); });
  await dark.setOffline(true);
  await page.goto(base + 'index.html#/import');
  await page.waitForSelector('[data-pick="image"]');
  await page.waitForSelector('.chip--green'); // „Texterkennung offline bereit“
  await page.screenshot({ path: path.join(outDir, 'import-choose-dark.png'), fullPage: true });
  const tOff = Date.now();
  await page.setInputFiles('[data-pick="image"]', fixture);
  report.suspiciousDark = await checkReview(page, 'dark-offline');
  report.ocrOfflineMs = Date.now() - tOff;
  // edit a value → status/preview update, then apply
  await page.fill('[data-val="visceralFat"]', '14');
  await page.screenshot({ path: path.join(outDir, 'import-review-dark.png'), fullPage: true });
  await page.click('[data-apply]');
  await page.waitForSelector('.imp-done');
  const e2 = await healthEntry(page);
  assert.equal(e2.visceralFat, 14);
  assert.equal(e2.sources.visceralFat, 'manual');
  assert.equal(e2.weightKg, 102.1);
  await page.click('a[href="#/gesundheit"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 'health-after-import-dark.png'), fullPage: true });
  report.offline = true;
  await dark.close();

  report.blocked = blocked;
  report.errors = errors.filter((e) => !/favicon/.test(e));
  report.totalMs = Date.now() - t0;
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(blocked, [], 'no request may leave localhost');
  assert.equal(report.precacheHasVendor, false);
  console.log('E2E OK – screenshots in', outDir);
} catch (e) {
  console.error('E2E FAILED', e, JSON.stringify({ report, blocked, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
