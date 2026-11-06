// Z4 · Benachrichtigungen über die App (konto/push-settings.js): Stand, Sätze, Patch, Seitenanbindung, Wortwahl.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../push-settings.js');
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const SETTINGS = ['WATCHLIST_NEWS', 'EARNINGS', 'PRICE_EVENT', 'SUPERTRADER_SIGNAL', 'QUANT_CHANGE', 'MARKET_REGIME_CHANGE'];

test('nur Arten mit Erzeuger und Zustellung sind schaltbar; alle anderen sagen „noch keine Daten“', () => {
  const ready = P.TYPES.filter(t => t.ready).map(t => t.key).sort();
  assert.deepEqual(ready, ['PRICE_EVENT', 'QUANT_CHANGE', 'SUPERTRADER_SIGNAL']);
  // Dieselben Arten stellt der Worker zu (push.mjs#deliverableEvents) und erlaubt das Konto (validate.mjs).
  const push = read('workers/vu-account/src/push.mjs');
  for (const k of ready) { assert.match(push, new RegExp(k + ':\\['), k); assert.ok(SETTINGS.includes(k), k); }
  for (const k of ['PRICE_MOVE', 'EARNINGS', 'FUND_13F']) assert.equal(P.TYPES.find(t => t.key === k).ready, false, k);
  assert.deepEqual(P.patchFor({PRICE_EVENT: true, EARNINGS: true, PRICE_MOVE: true}),
    {settings: {notifications: {PRICE_EVENT: true, SUPERTRADER_SIGNAL: false, QUANT_CHANGE: false}}}, 'nur zustellbare Arten gehen ans Konto');
});

test('Zustand aus /v1/me: abgemeldet, ohne FCM, ohne Gerät, aktiv – jeder Satz sagt „über die App“', () => {
  assert.equal(P.fromMe(null).signedIn, false);
  const me = (push, n = {}) => ({user: {id: 'u'}, settings: {notifications: n}, push});
  const lines = [P.line(P.fromMe(null)), P.line(P.fromMe(me({available: false, devices: 0}))), P.line(P.fromMe(me({available: true, devices: 0}))), P.line(P.fromMe(me({available: true, devices: 2})))];
  for (const l of lines) assert.match(l, /^Benachrichtigungen kommen über die App/);
  assert.match(lines[1], /noch nicht eingerichtet/);
  assert.match(lines[2], /Melde dich in der App an/);
  assert.deepEqual(P.fromMe(me({available: true, devices: 1}, {PRICE_EVENT: true, EARNINGS: true})).on.EARNINGS, false, 'nicht zustellbare Art gilt nie als an');
  assert.equal(P.fromMe(me({available: true, devices: 1}, {PRICE_EVENT: true})).on.PRICE_EVENT, true);
});

test('Wortwahl: keine Aufforderung, kein Signal, keine E-Mail', () => {
  const texts = [P.RULES, ...P.TYPES.flatMap(t => [t.title, t.sub])].join(' ');
  assert.doesNotMatch(texts, /Signal|kaufen|verkaufen|Empfehl|Chance|Kursziel/i);
  assert.match(P.RULES, /keine Kauf- oder Verkaufsaufforderung/);
  assert.match(P.RULES, /Keine E-Mail/);
  assert.match(P.RULES, /eine gebündelte Nachricht am Tag/);
});

test('D08, T02, T04, W04, V08 nutzen konto/push-settings.js; kein „bald“, kein gesperrter Platzhalter-Schalter', () => {
  const v3 = read('discover/ui/v3.js'), tc = read('technical/app.js'), elw = read('elliott/app.js'), vs = read('vorsorge/ui/plan.js');
  for (const js of [v3, tc, elw, vs]) assert.match(js, /\/konto\/push-settings\.js/);
  assert.match(v3, /P\.mount\(alertsBox, \{ keys: \['PRICE_MOVE', 'PRICE_EVENT', 'EARNINGS'\]/);
  assert.doesNotMatch(v3, /verdict\('none', 'bald'\)/);
  assert.match(tc, /VUPush\.open\(/); assert.doesNotMatch(tc, /Melden braucht ein Konto/); assert.doesNotMatch(tc, /kommt mit dem Konto/);
  assert.match(elw, /VUPush\.mount\(bell/); assert.doesNotMatch(elw, /Kommt mit den Benachrichtigungen im Konto/);
  assert.match(vs, /VUPush\.mount\(root\.querySelector\("#vs-mon-push"\)/); assert.doesNotMatch(vs, /Nachrichten folgen mit dem Konto/);
});

test('Worker: /v1/me nennt den Push-Stand, Versand nur mit Konto-Einstellung je Art', () => {
  const acc = read('workers/vu-account/src/account.mjs');
  assert.match(acc, /push: \{available: Boolean\(ctx\.fcm\?\.configured\), devices:/);
  const sql = read('supabase/migrations/20261107000100_push_preferences.sql');
  assert.match(sql, /s\.notification_settings->>\(e->>'type'\)='true'/);
  assert.match(sql, /coalesce\(w\.alerts->>\(e->>'type'\),'true'\)<>'false'/);
});
