import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, escape } from '../js/render.js';
import { matchRoute, routes } from '../js/router.js';
import * as store from '../js/store.js';
import { daysBetween, isoWeekKey, addDays, formatDE } from '../js/util/date.js';
import { taperActive, worst } from '../js/logic/traffic-light.js';
import { levelFor, xpFor } from '../js/logic/motivation.js';
import { scoreForSet } from '../js/components/celebrate.js';
import { computePoints, interpolatePose } from '../js/components/pt-figure.js';

test('html escapes values, keeps SafeHtml, flattens arrays', () => {
  const evil = '<img onerror="x">';
  assert.equal(String(html`<p>${evil}</p>`), '<p>&lt;img onerror=&quot;x&quot;&gt;</p>');
  assert.equal(String(html`<b>${raw('<i>ok</i>')}</b>`), '<b><i>ok</i></b>');
  assert.equal(String(html`${[1, 2].map((n) => html`<li>${n}</li>`)}`), '<li>1</li><li>2</li>');
  assert.equal(String(html`${null}${undefined}${false}${0}`), '0');
  assert.equal(escape("'&"), '&#39;&amp;');
});

test('router matches all routes and falls back to /heute', () => {
  assert.equal(matchRoute('').route.view, 'today');
  assert.equal(matchRoute('#/').route.view, 'today');
  assert.equal(matchRoute('#/nope').route.view, 'today');
  const d = matchRoute('#/uebung/quad-set?from=plan');
  assert.equal(d.route.view, 'exercise-detail');
  assert.deepEqual(d.params, { id: 'quad-set' });
  assert.equal(d.query.from, 'plan');
  for (const r of routes) {
    const path = r.pattern.replace(':id', 'x');
    assert.equal(matchRoute('#' + path).route, r);
  }
});

test('store: defaults, update, subscribe, export/import, corrupt data', () => {
  const mem = new Map();
  store._setStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
  const d = store.load();
  assert.equal(d.schemaVersion, store.SCHEMA_VERSION);
  assert.deepEqual(d.settings.painThresholds, { greenMax: 2, yellowMax: 5, greenStreakToProgress: 2 });
  let seen = 0;
  const off = store.subscribe(() => seen++);
  store.update((x) => { x.state.xp = 42; });
  assert.equal(seen, 1);
  assert.equal(JSON.parse(mem.get('pt.v1')).state.xp, 42);
  off();
  const json = store.exportData();
  store.reset();
  assert.equal(store.getState().xp, 0);
  store.importData(json);
  assert.equal(store.getState().xp, 42);
  assert.throws(() => store.importData('{"foo":1}'), /gültige/);
  mem.set('pt.v1', '{not json');
  assert.equal(store.load().state.xp, 0);
  // partial data gets defaults merged in
  mem.set('pt.v1', JSON.stringify({ schemaVersion: 1, settings: { sound: false }, state: {}, sessions: [] }));
  const m = store.load();
  assert.equal(m.settings.sound, false);
  assert.equal(m.settings.weeklyGoal, 3);
});

test('date helpers', () => {
  assert.equal(daysBetween('2026-10-31', '2026-11-07'), 7);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isoWeekKey('2026-10-31'), '2026-W44');
  assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
  assert.equal(formatDE('2026-10-31'), 'Sa., 31.10.2026');
});

test('taper window is 1..7 days before surgery', () => {
  assert.equal(taperActive('2027-01-15', '2027-01-07'), false);
  assert.equal(taperActive('2027-01-15', '2027-01-08'), true);
  assert.equal(taperActive('2027-01-15', '2027-01-14'), true);
  assert.equal(taperActive('2027-01-15', '2027-01-15'), false);
  assert.equal(taperActive(null, '2027-01-15'), false);
});

test('worst / levelFor / xpFor / scoreForSet basics', () => {
  assert.equal(worst('green', 'red'), 'red');
  assert.equal(levelFor(0).title, 'Novize');
  assert.equal(levelFor(6000).title, 'Robin Hood');
  const s = { status: 'done', exercises: [{ painDuring: 1, sharpPain: false, sets: [{ done: true }, { done: false }] }] };
  assert.equal(xpFor(s, { painThresholds: { greenMax: 2 } }), 50 + 15);
  assert.equal(scoreForSet({ done: true, painDuring: 1 }), 10);
  assert.equal(scoreForSet({ done: true, painDuring: 4 }), 7);
  assert.equal(scoreForSet({ done: true, painDuring: 7 }), 4);
  assert.equal(scoreForSet({ done: false }), 1);
});

test('figure geometry: standing pose', () => {
  const pose = { view: 'side', ground: 'standing', root: { x: 100, y: 100 }, trunk: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shoulderL: 0, shoulderR: 0, elbowL: 0, elbowR: 0 };
  const p = computePoints(pose);
  assert.deepEqual(p.neck, { x: 100, y: 50 });
  assert.ok(Math.abs(p.footR.y - 184) < 1e-9);
  const mid = interpolatePose(pose, { ...pose, hipR: 90 }, 0.5);
  assert.equal(mid.hipR, 45);
});
