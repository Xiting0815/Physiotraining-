// v5.2 (SPEC §17) browser smoke test of the Google-Drive sync UI (Playwright, dark, 412×915).
// Google is never reached: window.google (GIS) is mocked and googleapis.com is answered by page.route.
//   1. Mehr → card „Synchronisierung“ renders; „Verbinden“ only with a valid Client-ID; connect with mocked
//      GIS + Drive → „Google-Konto verbunden“, sync file uploaded (appDataFolder, multipart)
//   2. sync switched on, Google unreachable + device offline (SW cache) → the app boots normally, no unhandled errors
//   3. Heute shows „Training läuft gerade auf Tablet“ and the status dot
// Skipped by default (needs Chromium + python3). Run:  PW_E2E=1 node --test tests/sync-e2e.test.js
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
const CID = '1234-test.apps.googleusercontent.com';

function seed({ sync = {}, state = {} } = {}) {
  const d = defaults();
  d.state.welcomeDone = true;
  d.state.bandsConfirmed = true;
  Object.assign(d.settings.sync, sync);
  Object.assign(d.state, state);
  return d;
}

const GIS_MOCK = () => {
  window.__gis = [];
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient(cfg) {
          window.__gis.push(['init', cfg.scope]);
          return { requestAccessToken(o) { window.__gis.push(['request', o?.prompt]); setTimeout(() => cfg.callback({ access_token: 'AT', expires_in: 3600, scope: cfg.scope }), 30); } };
        },
        hasGrantedAllScopes: (r, s) => String(r.scope).split(' ').includes(s),
        revoke: (t, cb) => cb?.(),
      },
    },
  };
};

const benignNet = (t) => /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|accounts\.google\.com|googleapis/i.test(t);

test('sync UI in the browser (dark, 412×915)', { skip: !process.env.PW_E2E, timeout: 180_000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const errors = [];
  const open = async (data, { gis = false, blockGoogle = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !benignNet(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (gis) await page.addInitScript(GIS_MOCK);
    await page.addInitScript((json) => { if (!localStorage.getItem('pt.v1')) localStorage.setItem('pt.v1', json); }, JSON.stringify(data));
    if (blockGoogle) await ctx.route(/google(apis)?\.com/, (r) => r.abort());
    return { ctx, page };
  };
  try {
    // ---- 1. Mehr card + connect flow with mocked GIS / Drive
    {
      const { ctx, page } = await open(seed({ sync: { deviceName: 'Handy' } }), { gis: true });
      const uploads = [];
      await ctx.route(/www\.googleapis\.com/, async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        assert.match(req.headers().authorization || '', /^Bearer AT$/);
        if (req.method() === 'GET' && u.pathname === '/drive/v3/files') {
          assert.equal(u.searchParams.get('spaces'), 'appDataFolder');
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
        }
        if (req.method() === 'POST') { uploads.push(req.postData()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"f1","version":"1"}' }); }
        return route.fulfill({ status: 404, body: '{}' });
      });
      await page.goto(`${URL0}#/mehr?focus=sync`);
      await page.waitForSelector('[data-sync-card]');
      const card = page.locator('[data-sync-card]');
      assert.match(await card.locator('[data-sync-status]').innerText(), /Nicht verbunden/);
      assert.equal(await card.locator('[data-sync-connect]').isDisabled(), true, 'no client id → disabled');
      const box = await card.locator('[data-sync-connect]').boundingBox();
      assert.ok(box.height >= 44, 'touch target ≥ 44 px');
      await card.locator('#syncClientId').fill('falsch');
      await card.locator('#syncClientId').press('Tab');
      assert.equal(await page.locator('[data-sync-connect]').isDisabled(), true);
      await page.locator('#syncClientId').fill(CID);
      await page.locator('#syncClientId').press('Tab');
      assert.equal(await page.locator('[data-sync-connect]').isDisabled(), false);
      await page.locator('[data-sync-card]').screenshot({ path: join(SHOTS, 'sync-card-off.png') });
      await page.locator('[data-sync-connect]').click();
      await page.waitForFunction(() => /Google-Konto verbunden/.test(document.querySelector('[data-sync-status]')?.textContent || ''), null, { timeout: 10_000 });
      const gis = await page.evaluate(() => window.__gis);
      assert.deepEqual(gis[0], ['init', 'https://www.googleapis.com/auth/drive.appdata']);
      assert.equal(uploads.length, 1);
      assert.match(uploads[0], /"parents":\["appDataFolder"\]/);
      assert.match(uploads[0], /"deviceName":"Handy"/);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pt.v1')).settings.sync);
      assert.equal(stored.enabled, true);
      assert.equal(stored.clientId, CID);
      assert.ok(stored.lastSyncAt);
      assert.ok(await page.locator('[data-sync-now]').isVisible());
      assert.ok(await page.locator('[data-sync-disconnect]').isVisible());
      await page.locator('[data-sync-card]').screenshot({ path: join(SHOTS, 'sync-card-on.png') });
      await ctx.close();
    }

    // ---- 2. sync on, Google unreachable, then fully offline from the SW cache
    {
      const { ctx, page } = await open(seed({ sync: { enabled: true, clientId: CID, deviceId: 'dev-x', deviceName: 'Handy', lastSyncAt: new Date(Date.now() - 3 * 60e3).toISOString() } }), { blockGoogle: true });
      await page.goto(URL0);
      await page.waitForSelector('.pv-greet');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForSelector('.pv-greet');
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('.pv-greet', { timeout: 10_000 });
      await page.waitForSelector('[data-sync-dot]', { timeout: 5_000 });
      assert.match(await page.locator('[data-sync-dot]').getAttribute('aria-label'), /Offline|Anmeldung/);
      assert.equal(await page.locator('[data-fatal]').count(), 0);
      await page.goto(`${URL0}#/mehr`);
      await page.waitForSelector('[data-sync-card]');
      assert.match(await page.locator('[data-sync-status]').innerText(), /Offline|Anmeldung/);
      await page.screenshot({ path: join(SHOTS, 'sync-offline-mehr.png') });
      await ctx.close();
    }

    // ---- 3. Heute: training running on the tablet
    {
      const startedAt = new Date(Date.now() - 10 * 60e3).toISOString();
      const { ctx, page } = await open(seed({
        sync: { enabled: true, clientId: CID, deviceId: 'dev-p', deviceName: 'Handy', lastSyncAt: new Date().toISOString() },
        state: { remoteActiveSession: { deviceName: 'Tablet', workoutName: 'Kraft A', startedAt } },
      }), { blockGoogle: true });
      await page.goto(URL0);
      await page.waitForSelector('[data-remote-active]');
      assert.match(await page.locator('[data-remote-active]').innerText(), /Training läuft gerade auf Tablet/);
      assert.match(await page.locator('[data-remote-active]').innerText(), /Kraft A/);
      await page.screenshot({ path: join(SHOTS, 'sync-heute-remote.png') });
      // token missing (cold start) → one-tap „Abgleichen“; Google blocked → handled German error, no crash
      await page.waitForSelector('[data-sync-reauth-quick]');
      await page.locator('[data-sync-reauth-quick]').click();
      await page.waitForSelector('.pv-sync-dot--error', { timeout: 20_000 });
      assert.match(await page.locator('[data-sync-dot]').getAttribute('title'), /nicht erreichbar/);
      await ctx.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
