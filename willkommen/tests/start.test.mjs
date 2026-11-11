// Erster Start (/willkommen/start/, Mockup E11): lokale Schnittstelle vu-start-v1 und Seitenaufbau.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../start/prefs.js');
const T = require('../../mein-dashboard/today.js');
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
function mem(init = {}) { const m = {...init}; return {getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m}; }

test('vu-start-v1: lesen, schreiben, nur bekannte Werte', () => {
  const ls = mem();
  assert.deepEqual(S.read(ls), {v: 1, goal: null, mode: null, tickers: [], at: null, done: false, acct: null});
  const w = S.write({goal: 'aktie', mode: 'pro', tickers: ['NVDA', 'nvda', '<x>'], done: true}, ls);
  assert.equal(w.goal, 'aktie'); assert.equal(w.mode, 'pro'); assert.deepEqual(w.tickers, ['NVDA']); assert.equal(w.done, true);
  assert.deepEqual(Object.keys(JSON.parse(ls.m['vu-start-v1'])).sort(), ['acct', 'at', 'done', 'goal', 'mode', 'tickers', 'v']);
  S.write({goal: 'unbekannt', mode: 'x'}, ls);
  assert.equal(S.read(ls).goal, null); assert.equal(S.read(ls).mode, null);
});

test('„Wo stehst du?“ der Startseite wählt vor, das Konto geht vor dem Gerät', () => {
  const ls = mem({'vu-start-path': 'profi'});
  const r = S.read(ls);
  assert.equal(r.goal, 'signale'); assert.equal(r.mode, 'pro'); assert.equal(r.preset, true);
  assert.equal(S.effective({settings: {goal: 'vorsorge', mode: 'beginner'}}, ls).goal, 'vorsorge');
  assert.equal(S.goalCard(null).href, '/willkommen/start/');
  for (const g of S.GOAL_ORDER) assert.match(S.GOALS[g].href, /^\/[a-z]/);
  assert.deepEqual(S.MODE_ORDER, ['beginner', 'advanced', 'pro']);
});

test('Tagesbewegung nur aus derselben Reihe und nur am Datum des veröffentlichten Schlusses', () => {
  const s = {points: [['2026-11-02', 100], ['2026-11-03', 103]]};
  assert.equal(Math.round(T.move(s, {date: '2026-11-03'}).pct * 100) / 100, 3);
  assert.equal(T.move(s, {date: '2026-11-04'}).pct, null, 'anderes Datum: keine Bewegung');
  assert.equal(T.move({points: [['2026-11-03', 1]]}, {date: '2026-11-03'}).pct, null);
  const sum = T.summary([{ticker: 'A', pct: 2}, {ticker: 'B', pct: -5}, {ticker: 'C', pct: null}]);
  assert.deepEqual([sum.up, sum.measured, sum.total, sum.biggest.ticker], [1, 2, 3, 'B']);
  assert.deepEqual(T.sortRows([{ticker: 'A', pct: 1}, {ticker: 'B', pct: 4}, {ticker: 'C', pct: null}], 'move').map(r => r.ticker), ['B', 'A', 'C']);
});

test('Seite: drei Schritte, überspringbar, keine Produkt-Leiste, nur bestehende Konto-Aufrufe', () => {
  const html = read('willkommen/start/index.html'), js = read('willkommen/start/start.js');
  assert.equal((html.match(/class="fs-step"/g) || []).length, 3);
  assert.match(html, /id="fs-skip"/);
  assert.match(html, /<vu-navigation menu-only no-dock/);
  assert.match(html, /data-vu-menu-toggle/);
  assert.doesNotMatch(html, /VUNavigation\.dock\(/, "keine Produkt-Leiste im ersten Start");
  const calls = [...js.matchAll(/A\.(get|post|patch)\('([^']+)'/g)].map(m => m[2]);
  assert.deepEqual([...new Set(calls)].sort(), ['/v1/me', '/v1/session', '/v1/watchlist/items'], 'nur bestehende Konto-Aufrufe (PATCH /v1/me: Z1-Einstellungen)');
  assert.doesNotMatch(js, /localStorage\.setItem/, 'schreibt nur über prefs.js');
  assert.match(read('willkommen/app.js'), /get\('konto'\) === 'verified' && global\.VUStart && !global\.VUStart\.read\(\)\.done/);
});

test("Z1 · Konto: Ziel und Erfahrung gehen als settings.goal/experienceLevel/onboardedAt an PATCH /v1/me", () => {
  assert.deepEqual(S.toAccount({ goal: "signale", mode: "pro" }, true), { goal: "strategien", experienceLevel: "pro", onboardedAt: true });
  assert.deepEqual(S.toAccount({ goal: null, mode: "beginner" }, false), { experienceLevel: "beginner" });
  const eff = S.effective({ settings: { goal: "strategien", experienceLevel: "advanced", onboardedAt: "2026-11-04T10:00:00Z" } }, { getItem: () => null, setItem() {} });
  assert.equal(eff.goal, "signale");
  assert.equal(eff.mode, "advanced");
  assert.equal(eff.done, true);
});

test('Z1 · nach der Anmeldung übernimmt adopt() die Gerätewahl einmal ins Konto', async () => {
  const ls = mem();
  S.write({goal: 'signale', mode: 'advanced', done: true}, ls);
  const me = {user: {id: 'u-1'}, settings: {experienceLevel: 'beginner', goal: null, onboardedAt: null}};
  assert.equal(S.effective(me, ls).mode, 'advanced', 'Vorgabewert des Kontos verdrängt die Gerätewahl nicht');
  assert.deepEqual(S.adoptPatch(me, ls), {goal: 'strategien', experienceLevel: 'advanced', onboardedAt: true});
  const calls = [];
  const after = {user: {id: 'u-1'}, settings: {experienceLevel: 'advanced', goal: 'strategien', onboardedAt: '2026-11-06T22:00:00Z'}};
  const A = {patch: (p, b) => { calls.push([p, b]); return Promise.resolve({ok: true, data: after}); }};
  assert.equal(await S.adopt(A, me, ls), after);
  assert.deepEqual(calls, [['/v1/me', {settings: {goal: 'strategien', experienceLevel: 'advanced', onboardedAt: true}}]]);
  assert.equal(S.read(ls).acct, 'u-1');
  await S.adopt(A, me, ls);
  assert.equal(calls.length, 1, 'kein zweites Mal für dasselbe Konto');
  assert.equal(S.adoptPatch(after, mem({'vu-start-v1': JSON.stringify({goal: 'aktie'})})), null, 'Konto kennt den ersten Start: Konto gilt');
  assert.equal(S.adoptPatch(me, mem({'vu-start-path': 'profi'})), null, 'nur Vorauswahl der Startseite: nichts übernehmen');
  assert.equal(S.adoptPatch(me, mem()), null, 'nichts gewählt: nichts übernehmen');
  const failed = mem(); S.write({mode: 'pro'}, failed);
  assert.equal(await S.adopt({patch: () => Promise.resolve({ok: false})}, me, failed), me);
  assert.equal(S.read(failed).acct, null, 'gescheitert: beim nächsten Besuch wieder versuchen');
});

test('Z1 · Mein Bereich und Konto rufen adopt() nach GET /v1/me; Konto speichert die Erfahrung im Konto', () => {
  assert.match(read('willkommen/app.js'), /VUStart\.adopt\(A, m\.data\)/);
  const k = read('konto/konto.js');
  assert.match(k, /VUStart\.adopt\(A, d\)/);
  assert.match(k, /settings: \{experienceLevel: m\}/);
  assert.doesNotMatch(k, /auf diesem Gerät\)/);
});
