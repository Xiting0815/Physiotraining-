// v5.2 (SPEC §17): sync engine against an in-memory fake of the Drive v3 REST API (real js/sync/drive.js,
// mocked fetch). Two devices = two separate store module instances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine, parseRemote } from '../js/sync/engine.js';
import { createDrive } from '../js/sync/drive.js';
import { createAuth } from '../js/sync/auth.js';
import { SYNC_FILE_NAME, SYNC_SCOPE, isValidClientId } from '../js/sync/config.js';
import { deleteSession } from '../js/views/history.js';

const T0 = Date.parse('2026-11-10T08:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const min = 60e3;
let instance = 0;

/** A fresh, independent store module (own cache/storage) – i.e. one device. */
async function device(name, { clock } = {}) {
  const store = await import(`../js/store.js?dev=${name}-${++instance}`);
  store._setStorage(null);
  if (clock) store._setNow(clock);
  store.load();
  store.update((d) => { d.settings.sync = { ...d.settings.sync, enabled: true, deviceId: `dev-${name}`, deviceName: name, clientId: 'abc.apps.googleusercontent.com' }; });
  return store;
}

/** In-memory Drive appDataFolder. */
function fakeDrive({ date = () => T0 } = {}) {
  const files = new Map();
  let seq = 0;
  const calls = [];
  const hooks = { beforeUpdate: null, fail412: 0, status: null };
  const res = (status, body, headers = {}) => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => ({ date: new Date(date()).toUTCString(), ...Object.fromEntries(Object.entries(headers).map(([a, b]) => [a.toLowerCase(), b])) })[k.toLowerCase()] ?? null },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const put = (id, content) => {
    const f = files.get(id) || { id, createdTime: seq };
    f.content = typeof content === 'string' ? content : JSON.stringify(content);
    f.version = String((Number(f.version) || 0) + 1);
    f.etag = `"e${id}-${f.version}"`;
    files.set(id, f);
    return f;
  };
  async function fetch(url, { method = 'GET', headers = {}, body } = {}) {
    calls.push({ method, url });
    if (hooks.status) return res(hooks.status, { error: { errors: [{ reason: 'x' }] } });
    assert.match(headers.Authorization, /^Bearer /);
    const u = new URL(url);
    const m = u.pathname.match(/\/files\/([^/]+)$/);
    if (method === 'GET' && u.pathname.endsWith('/drive/v3/files')) {
      assert.equal(u.searchParams.get('spaces'), 'appDataFolder');
      assert.ok(u.searchParams.get('q').includes(SYNC_FILE_NAME));
      return res(200, { files: [...files.values()].sort((a, b) => a.createdTime - b.createdTime).map((f) => ({ id: f.id, version: f.version })) });
    }
    if (method === 'POST' && u.pathname.endsWith('/upload/drive/v3/files')) {
      assert.equal(u.searchParams.get('uploadType'), 'multipart');
      const boundary = headers['Content-Type'].split('boundary=')[1];
      const parts = body.split(`--${boundary}`).filter((p) => p.includes('\r\n\r\n'));
      const meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
      assert.deepEqual(meta.parents, ['appDataFolder']);
      assert.equal(meta.name, SYNC_FILE_NAME);
      const f = put(`f${++seq}`, parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, ''));
      return res(200, { id: f.id, version: f.version });
    }
    if (!m) return res(404, {});
    const f = files.get(decodeURIComponent(m[1]));
    if (!f) return res(404, {});
    if (method === 'GET' && u.searchParams.get('alt') === 'media') return res(200, f.content, { ETag: f.etag });
    if (method === 'GET') return res(200, { id: f.id, version: f.version });
    if (method === 'PATCH') {
      if (hooks.beforeUpdate) { const h = hooks.beforeUpdate; hooks.beforeUpdate = null; await h(); }
      if (hooks.fail412 > 0) { hooks.fail412 -= 1; return res(412, {}); }
      if (headers['If-Match'] && headers['If-Match'] !== f.etag) return res(412, {});
      put(f.id, body);
      return res(200, { id: f.id, version: f.version });
    }
    if (method === 'DELETE') { files.delete(f.id); return res(204, ''); }
    return res(400, {});
  }
  return { fetch, files, calls, hooks, put, content: (id) => JSON.parse([...files.values()].find((f) => !id || f.id === id).content) };
}

function fakeAuth(token = 'tok') {
  let t = token;
  return {
    requested: 0,
    getToken: () => t,
    invalidate() { t = null; },
    async requestToken() { this.requested += 1; t = 'tok2'; return t; },
    loadGis: async () => {},
    async revoke() { t = null; },
  };
}

function fakeTimers() {
  const list = [];
  return {
    list,
    setTimeout: (fn, ms) => { const h = { fn, ms }; list.push(h); return h; },
    clearTimeout: (h) => { const i = list.indexOf(h); if (i >= 0) list.splice(i, 1); },
    async flush() { while (list.length) { const h = list.shift(); await h.fn(); } },
  };
}

function engineFor(store, gd, extra = {}) {
  const auth = extra.auth ?? fakeAuth();
  const drive = createDrive({ fetch: gd.fetch, getToken: () => auth.getToken() });
  return createSyncEngine({ store, auth, drive, now: () => T0, timers: extra.timers ?? fakeTimers(), online: extra.online ?? (() => true), win: extra.win ?? null, describeWorkout: (id) => `Workout ${id}`, inSession: extra.inSession });
}

const sess = (id, startMs, extra = {}) => ({ id, workoutId: 'p1-a', kind: 'strength', status: 'done', startedAt: iso(startMs), endedAt: iso(startMs + 20 * min), exercises: [], xpEarned: 10, nextDay: null, ...extra });

test('client id pattern', () => {
  assert.ok(isValidClientId('1234-abc.apps.googleusercontent.com'));
  assert.ok(!isValidClientId('abc.googleusercontent.com'));
  assert.ok(!isValidClientId(''));
  assert.ok(!isValidClientId('https://evil.example/x.apps.googleusercontent.com'));
});

test('two devices: first creates the file, the second joins, both end with the full state', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const tablet = await device('Tablet');
  phone.update((d) => { d.sessions.push(sess('p1', T0 - 2 * 864e5)); d.settings.weeklyGoal = 4; });
  tablet.update((d) => { d.sessions.push(sess('t1', T0 - 864e5)); });
  const ep = engineFor(phone, gd);
  const et = engineFor(tablet, gd);
  assert.equal((await ep.run()).ok, true);
  assert.equal(gd.files.size, 1);
  const env = gd.content();
  assert.equal(env.deviceName, 'Handy');
  assert.equal(env.rev, 1);
  assert.ok(!('sync' in env.settings), 'device-local sync config is not uploaded');
  assert.equal((await et.run()).ok, true);
  assert.deepEqual(tablet.get().sessions.map((s) => s.id), ['p1', 't1']);
  assert.equal(tablet.get().settings.weeklyGoal, 4);
  assert.equal(tablet.get().settings.sync.deviceName, 'Tablet');
  assert.ok(tablet.get().settings.sync.lastSyncAt);
  await ep.run();
  assert.deepEqual(phone.get().sessions.map((s) => s.id), ['p1', 't1']);
  assert.equal(gd.content().rev, 3);
  assert.equal(ep.getStatus().phase, 'ok');
});

test('a deleted session disappears on the other device', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const tablet = await device('Tablet');
  phone.update((d) => { d.sessions.push(sess('x', T0 - 864e5), sess('y', T0 - 864e5 + 3600e3)); });
  const ep = engineFor(phone, gd);
  const et = engineFor(tablet, gd);
  await ep.run();
  await et.run();
  assert.equal(tablet.get().sessions.length, 2);
  tablet.update((d) => deleteSession(d, 'x'));
  await et.run();
  await ep.run();
  assert.deepEqual(phone.get().sessions.map((s) => s.id), ['y']);
  assert.deepEqual(phone.get().state.deletedSessionIds.map((t) => t.id), ['x']);
});

test('412 on write → re-read, re-merge, retry', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const ep = engineFor(phone, gd);
  await ep.run();
  gd.hooks.fail412 = 1;
  phone.update((d) => { d.sessions.push(sess('n', T0 - min)); });
  const r = await ep.run();
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.deepEqual(gd.content().sessions.map((s) => s.id), ['n']);
});

test('concurrent write by the other device between read and write → nothing lost', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const tablet = await device('Tablet');
  const ep = engineFor(phone, gd);
  const et = engineFor(tablet, gd);
  await ep.run();
  await et.run();
  phone.update((d) => { d.sessions.push(sess('from-phone', T0 - 2 * min)); });
  tablet.update((d) => { d.sessions.push(sess('from-tablet', T0 - 3 * min)); });
  // the tablet writes while the phone is about to write (etag changes → 412 → retry)
  gd.hooks.beforeUpdate = async () => { await et.run(); };
  const r = await ep.run();
  assert.equal(r.ok, true);
  assert.ok(r.attempts >= 2);
  assert.deepEqual(gd.content().sessions.map((s) => s.id).sort(), ['from-phone', 'from-tablet']);
  await et.run();
  assert.deepEqual(tablet.get().sessions.map((s) => s.id).sort(), ['from-phone', 'from-tablet']);
});

test('conflicts that never end → error status after 1 + 3 attempts', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const ep = engineFor(phone, gd);
  await ep.run();
  gd.hooks.fail412 = 10;
  const r = await ep.run();
  assert.equal(r.ok, false);
  assert.equal(ep.getStatus().phase, 'error');
  assert.match(ep.getStatus().error, /gleichzeitig/);
  assert.equal(gd.hooks.fail412, 6, 'four write attempts');
});

test('offline: no request, queued, synced on the online event', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  let isOnline = false;
  const win = new EventTarget();
  const ep = engineFor(phone, gd, { online: () => isOnline, win });
  ep.start();
  assert.equal(ep.getStatus().phase, 'offline');
  assert.equal(ep.getStatus().pending, true);
  assert.equal(gd.calls.length, 0);
  isOnline = true;
  win.dispatchEvent(new Event('online'));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gd.files.size, 1);
  assert.equal(ep.getStatus().phase, 'ok');
  ep.stop();
});

test('read-only store (newer data version): never syncs', async () => {
  const gd = fakeDrive();
  const store = await import(`../js/store.js?dev=ro-${++instance}`);
  const mem = new Map();
  store._setStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) });
  mem.set('pt.v1', JSON.stringify({ schemaVersion: 99, settings: { sync: { enabled: true, deviceId: 'd', deviceName: 'X' } }, state: {}, sessions: [] }));
  store.load();
  assert.ok(store.isReadOnly());
  const ep = engineFor(store, gd);
  const r = await ep.run();
  assert.equal(r.skipped, 'readonly');
  assert.equal(ep.getStatus().phase, 'readonly');
  assert.equal(gd.calls.length, 0);
  assert.equal(ep.request('change'), null);
});

test('remote file from a newer app version: error, nothing written', async () => {
  const gd = fakeDrive();
  gd.put('f1', { schemaVersion: 99, settings: {}, state: {}, sessions: [], rev: 5 });
  const phone = await device('Handy');
  const ep = engineFor(phone, gd);
  const r = await ep.run();
  assert.equal(r.ok, false);
  assert.match(ep.getStatus().error, /neuere App-Version/);
  assert.equal(gd.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.throws(() => parseRemote({ schemaVersion: 99 }), /neuere/);
});

test('no token / expired token (401): status „Anmeldung nötig“, never opens a popup by itself', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const auth = fakeAuth(null);
  const ep = engineFor(phone, gd, { auth });
  const r = await ep.run();
  assert.equal(r.skipped, 'auth');
  assert.equal(ep.getStatus().phase, 'needsAuth');
  assert.equal(auth.requested, 0);
  assert.equal(gd.calls.length, 0);
  // manual tap → interactive token, then sync
  const r2 = await ep.syncNow({ interactive: true });
  assert.equal(auth.requested, 1);
  assert.equal(r2.ok, true);
  // 401 → token dropped, needsAuth
  gd.hooks.status = 401;
  await ep.run();
  assert.equal(ep.getStatus().phase, 'needsAuth');
  assert.equal(auth.getToken(), null);
});

test('triggers: changes debounced 20 s; during a training at most every 2 min; finish → immediately', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const timers = fakeTimers();
  let session = false;
  const ep = engineFor(phone, gd, { timers, inSession: () => session });
  ep.start(); // first sync (start)
  await new Promise((r) => setTimeout(r, 10));
  const writes = () => gd.calls.filter((c) => c.method !== 'GET').length;
  assert.equal(writes(), 1);
  phone.update((d) => { d.settings.weeklyGoal = 5; });
  phone.update((d) => { d.settings.weeklyGoal = 6; });
  assert.equal(timers.list.length, 1, 'debounced into one timer');
  assert.equal(timers.list[0].ms, 20e3);
  await timers.flush();
  assert.equal(writes(), 2);
  session = true;
  phone.update((d) => { d.settings.weeklyGoal = 4; });
  assert.ok(timers.list[0].ms >= 2 * 60e3 - 1, 'mid-session: ≥ 2 min since the last sync');
  phone.update((d) => { d.settings.weeklyGoal = 3; });
  assert.equal(timers.list.length, 1, 'throttled, not re-armed');
  timers.list.length = 0;
  session = false;
  phone.update((d) => { d.state.activeSession = { id: 's', workoutId: 'p1-a', startedAt: iso(T0), cursor: { index: 0, set: 0, step: 'pre' }, exercises: [{ exerciseId: 'x' }] }; });
  timers.list.length = 0;
  phone.update((d) => { d.sessions.push({ ...d.state.activeSession, status: 'done', endedAt: iso(T0 + min) }); d.state.activeSession = null; });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(writes(), 3, 'finish syncs immediately');
  ep.stop();
});

test('visible: throttled to 60 s', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const ep = engineFor(phone, gd);
  await ep.run();
  assert.equal(ep.request('visible'), null, 'just synced → skipped');
});

test('training on the other device: info only, never resumed', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  const tablet = await device('Tablet');
  const ep = engineFor(phone, gd);
  const et = engineFor(tablet, gd);
  tablet.update((d) => { d.state.activeSession = { id: 'run', workoutId: 'p1-a', startedAt: iso(T0 - 5 * min), status: 'active', cursor: { index: 0, set: 0, step: 'pre' }, exercises: [{ exerciseId: 'x' }] }; });
  await et.run();
  assert.equal(gd.content().state.activeSession, null, 'running session data is not uploaded');
  assert.equal(gd.content().activeSessions['dev-Tablet'].workoutName, 'Workout p1-a');
  await ep.run();
  assert.equal(phone.get().state.activeSession, null);
  assert.deepEqual(phone.get().state.remoteActiveSession, { deviceName: 'Tablet', workoutName: 'Workout p1-a', startedAt: iso(T0 - 5 * min) });
  tablet.update((d) => { d.sessions.push({ ...d.state.activeSession, status: 'done', endedAt: iso(T0) }); d.state.activeSession = null; });
  await et.run();
  await ep.run();
  assert.equal(phone.get().state.remoteActiveSession, null);
  assert.deepEqual(phone.get().sessions.map((s) => s.id), ['run']);
});

test('duplicate sync files (created at the same time) are merged into one', async () => {
  const gd = fakeDrive();
  const a = await device('A');
  const b = await device('B');
  a.update((d) => { d.sessions.push(sess('a', T0 - 3600e3)); });
  b.update((d) => { d.sessions.push(sess('b', T0 - 7200e3)); });
  await engineFor(a, gd).run();
  gd.files.get('f1').createdTime = 0;
  // simulate B having created its own file concurrently
  const { buildEnvelope } = await import('../js/sync/merge.js');
  gd.put('f9', buildEnvelope(b.get(), { deviceId: 'dev-B', deviceName: 'B', rev: 1 }));
  gd.files.get('f9').createdTime = 1;
  await engineFor(a, gd).run();
  assert.equal(gd.files.size, 1);
  assert.deepEqual(a.get().sessions.map((s) => s.id), ['b', 'a']);
});

test('disconnect keeps local data; optional delete of the Drive file', async () => {
  const gd = fakeDrive();
  const phone = await device('Handy');
  phone.update((d) => { d.sessions.push(sess('keep', T0 - min)); });
  const ep = engineFor(phone, gd);
  await ep.run();
  await ep.disconnect({ deleteRemote: true });
  assert.equal(gd.files.size, 0);
  assert.equal(phone.get().sessions.length, 1);
  assert.equal(phone.get().settings.sync.enabled, false);
  assert.equal(phone.get().settings.sync.lastSyncAt, null);
  assert.equal(ep.getStatus().phase, 'off');
});

test('server clock: a device clock 10 min off is corrected from the Drive Date header', async () => {
  const gd = fakeDrive({ date: () => Date.now() + 10 * min });
  const phone = await device('Handy');
  const ep = engineFor(phone, gd);
  await ep.run();
  assert.ok(Math.abs(phone.getClockOffset() - 10 * min) < 5e3);
  phone.setClockOffset(0);
});

/* ---------------- GIS token client ---------------- */

function fakeGis({ grant = true, error = null } = {}) {
  const calls = [];
  const win = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(cfg) {
            calls.push(['init', cfg.scope, cfg.client_id]);
            return {
              requestAccessToken(o) {
                calls.push(['request', o.prompt]);
                queueMicrotask(() => {
                  if (error) cfg.error_callback({ type: error });
                  else cfg.callback({ access_token: 'AT', expires_in: 3600, scope: grant ? SYNC_SCOPE : 'other' });
                });
              },
            };
          },
          hasGrantedAllScopes: (r, s) => r.scope.split(' ').includes(s),
          revoke: (t, cb) => { calls.push(['revoke', t]); cb(); },
        },
      },
    },
  };
  return { win, calls };
}

test('auth: token client asks only for drive.appdata, keeps the token until it expires', async () => {
  const { win, calls } = fakeGis();
  let now = T0;
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const auth = createAuth({ win, now: () => now, storage });
  assert.equal(await auth.requestToken({ clientId: 'x.apps.googleusercontent.com', prompt: '' }), 'AT');
  assert.deepEqual(calls[0], ['init', SYNC_SCOPE, 'x.apps.googleusercontent.com']);
  assert.equal(auth.getToken(), 'AT');
  const again = createAuth({ win, now: () => now, storage });
  assert.equal(again.getToken(), 'AT', 'restored from sessionStorage');
  now += 3600e3;
  assert.equal(auth.getToken(), null, 'expired');
  await auth.revoke();
  assert.ok(calls.some((c) => c[0] === 'revoke'));
});

test('auth: missing scope, popup blocked and unreachable GIS are German errors', async () => {
  const a1 = createAuth({ win: fakeGis({ grant: false }).win, storage: null });
  await assert.rejects(a1.requestToken({ clientId: 'x.apps.googleusercontent.com' }), /App-Ordner/);
  const a2 = createAuth({ win: fakeGis({ error: 'popup_failed_to_open' }).win, storage: null });
  await assert.rejects(a2.requestToken({ clientId: 'x.apps.googleusercontent.com' }), /blockiert/);
  const a3 = createAuth({ win: {}, storage: null, loadScript: async () => { throw new Error('net'); } });
  await assert.rejects(a3.requestToken({ clientId: 'x.apps.googleusercontent.com' }), /nicht erreichbar/);
  await assert.rejects(a3.loadGis(), /nicht erreichbar/);
});
