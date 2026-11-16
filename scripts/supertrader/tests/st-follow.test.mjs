// Supertrader „Folgen“ (Fenster „Methode“) und „Melden“ (Fenster „Ablauf“): Zustand wie die Zustellung, Schreibwege über
// die bestehende Konto-API, Wortlaut nach docs/legal/WORTWAHL.md (Owner 16.11.2026: nur „Regel erfüllt“, nie eine Entscheidung).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../../../supertrader/assets/st-follow.js');
const SRC = (f) => fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8');

// Verbotene Begriffe der sichtbaren Texte; „keine Empfehlung“ ist als Verneinung erlaubt (WORTWAHL.md).
const FORBIDDEN = [/signal/i, /empfehl/i, /einstieg/i, /\bkauf/i, /verkauf/i, /jetzt handeln/i, /chance/i, /kursziel/i, /\bfür dich\b/i, /entscheid/i];
const allTexts = (o) => Object.values(o).flatMap((v) => typeof v === 'string' ? [v] : typeof v === 'function' ? [v('NVIDIA', true), v('NVIDIA', false)] : allTexts(v));

const me = (on, extra = {}) => ({ settings: { notifications: { PRICE_EVENT: true, ...(on === undefined ? {} : { SUPERTRADER_SIGNAL: on }) } }, push: { available: true, devices: 1 }, ...extra });

test('ST-FOLLOW-1: Zustand wie die Zustellung (Art im Konto, Eintrag nicht ausgeschaltet, Ticker beim Merken)', () => {
  const st = F.fromApi(me(true), { follows: [{ strategyId: 'SF_MINERVINI_SEPA_VCP' }] },
    { items: [{ instrumentId: 'vu_abc123', listId: 'l1', ticker: 'NVDA', alerts: {} }, { instrumentId: 'vu_abc124', listId: 'l1', ticker: 'AMD', alerts: { SUPERTRADER_SIGNAL: false } }] });
  assert.equal(F.isOn(st, 'method', 'SF_MINERVINI_SEPA_VCP'), true);
  assert.equal(F.isOn(st, 'method', 'SF_TURTLE_S1'), false);
  assert.equal(F.isOn(st, 'stock', 'NVDA'), true, 'fehlender Schlüssel gilt wie die Konto-Einstellung');
  assert.equal(F.isOn(st, 'stock', 'AMD'), false, 'am Eintrag ausgeschaltet');
  assert.equal(F.isOn(st, 'stock', 'TSLA'), false, 'nicht in der Watchlist');
  const off = F.fromApi(me(false), { follows: [{ strategyId: 'SF_MINERVINI_SEPA_VCP' }] }, st);
  assert.equal(F.isOn(off, 'method', 'SF_MINERVINI_SEPA_VCP'), false, 'Art im Konto aus: nichts kommt, Knopf zeigt „Folgen“');
  assert.equal(F.isOn(F.fromApi(null), 'method', 'SF_MINERVINI_SEPA_VCP'), false);
  assert.deepEqual(F.notifPatch({ PRICE_EVENT: true, QUANT_CHANGE: false }), { settings: { notifications: { PRICE_EVENT: true, QUANT_CHANGE: false, SUPERTRADER_SIGNAL: true } } }, 'übrige Arten bleiben');
  assert.equal(F.line(F.fromApi(null)), F.TEXT.account);
  assert.equal(F.line(st), F.TEXT.app);
  assert.equal(F.line(F.fromApi(me(true, { push: { available: true, devices: 0 } }))), F.TEXT.noApp);
  assert.equal(F.line(F.fromApi(me(true, { push: { available: false } }))), F.TEXT.noPush);
});

function fakeAccount() {
  const calls = [];
  const ok = (data, status = 200) => Promise.resolve({ ok: true, status, data });
  return {
    calls, available: () => true, message: (s) => 'M:' + s,
    get: (p) => { calls.push(['GET', p]); return ok({ items: [{ instrumentId: 'vu_abc999', listId: 'l1', ticker: 'ANET', alerts: {} }] }); },
    post: (p, b) => { calls.push(['POST', p, b]); return ok({ state: 'OK' }, 201); },
    patch: (p, b) => { calls.push(['PATCH', p, b]); return p === '/v1/me' ? ok({ settings: { notifications: b.settings.notifications } }) : ok({ item: { alerts: b.alerts } }); },
  };
}

test('ST-FOLLOW-2: Schreibwege über die bestehende Konto-API; die Art wird mit eingeschaltet, nie andere Arten', async () => {
  let A = fakeAccount(), st = F.fromApi(me(undefined), { follows: [] }, { items: [] });
  assert.equal((await F.apply(A, st, 'method', 'SF_MINERVINI_SEPA_VCP', true)).ok, true);
  assert.deepEqual(A.calls, [['POST', '/v1/supertrader/follows', { strategyId: 'SF_MINERVINI_SEPA_VCP' }],
    ['PATCH', '/v1/me', { settings: { notifications: { PRICE_EVENT: true, SUPERTRADER_SIGNAL: true } } }]]);
  assert.equal(F.isOn(st, 'method', 'SF_MINERVINI_SEPA_VCP'), true);
  A = fakeAccount();
  await F.apply(A, st, 'method', 'SF_MINERVINI_SEPA_VCP', false);
  assert.deepEqual(A.calls, [['POST', '/v1/supertrader/follows/remove', { strategyId: 'SF_MINERVINI_SEPA_VCP' }]], 'Rücknahme lässt die Konto-Einstellung');
  assert.equal(F.isOn(st, 'method', 'SF_MINERVINI_SEPA_VCP'), false);

  // Melden: Eintrag vorhanden, am Eintrag ausgeschaltet -> nur der Alarm des Eintrags (übrige Alarme bleiben).
  A = fakeAccount();
  st = F.fromApi(me(true), null, { items: [{ instrumentId: 'vu_abc123', listId: 'l1', ticker: 'NVDA', alerts: { PRICE_EVENT: true, SUPERTRADER_SIGNAL: false } }] });
  await F.apply(A, st, 'stock', 'NVDA', true);
  assert.deepEqual(A.calls, [['PATCH', '/v1/watchlist/items', { instrumentId: 'vu_abc123', listId: 'l1', alerts: { PRICE_EVENT: true, SUPERTRADER_SIGNAL: true } }]]);
  assert.equal(F.isOn(st, 'stock', 'NVDA'), true);
  A = fakeAccount();
  await F.apply(A, st, 'stock', 'NVDA', false);
  assert.deepEqual(A.calls, [['PATCH', '/v1/watchlist/items', { instrumentId: 'vu_abc123', listId: 'l1', alerts: { PRICE_EVENT: true, SUPERTRADER_SIGNAL: false } }]], 'Aktie bleibt in der Watchlist');

  // Melden ohne Eintrag: Listing über den Company Master (watchlist-button.js), dann aufnehmen und Art einschalten.
  globalThis.VUCore = { Identity: {} };
  globalThis.VUWatchButton = { resolveInstrument: (t) => Promise.resolve(t === 'ANET' ? 'vu_abc999' : null) };
  A = fakeAccount();
  st = F.fromApi(me(false), null, { items: [] });
  assert.equal((await F.apply(A, st, 'stock', 'ANET', true)).ok, true);
  assert.deepEqual(A.calls.map((c) => c[0] + ' ' + c[1]), ['POST /v1/watchlist/items', 'GET /v1/watchlist', 'PATCH /v1/watchlist/items', 'PATCH /v1/me']);
  assert.deepEqual(A.calls[0][2], { instrumentId: 'vu_abc999', ticker: 'ANET' });
  assert.equal(F.isOn(st, 'stock', 'ANET'), true);
  assert.deepEqual((await F.apply(fakeAccount(), F.fromApi(me(true)), 'stock', 'ZZZZ', true)), { ok: false, state: 'INSTRUMENT_NOT_RESOLVED' }, 'kein eindeutiges Listing: nichts gespeichert');
  delete globalThis.VUCore; delete globalThis.VUWatchButton;
});

test('ST-FOLLOW-3: Wortlaut – Tatsachen nach Regel, keine Entscheidung, kein „Signal“; Pflicht-Hinweis', () => {
  const texts = allTexts(F.TEXT);
  assert.ok(texts.length > 15);
  for (const t of texts) for (const re of FORBIDDEN) assert.doesNotMatch(t.replace(/keine empfehlung/gi, ''), re, t);
  assert.match(F.TEXT.note, /Forschung, nicht zertifiziert/);
  assert.equal(F.TEXT.account, 'Benachrichtigungen gibt es mit einem Konto.');
  const legal = JSON.parse(SRC('assets/legal-notices.json'));
  assert.ok(F.TEXT.note.includes(legal.labels.research));
});

test('ST-FOLLOW-4: Fenster „Methode“ und „Ablauf“ tragen die Knöpfe wie im Prototyp; „Methode öffnen“ bleibt erreichbar', () => {
  const red = SRC('supertrader/assets/st-redesign.js'), css = SRC('supertrader/assets/st-redesign.css');
  const method = red.slice(red.indexOf('  function methodSheet('), red.indexOf('  /* Trader-Kachel'));
  const plan = red.slice(red.indexOf('  function planSheet('), red.indexOf('  /* Marktlage im Fenster'));
  assert.match(method, /bellHtml\('method', s\.strategyId, cn\(s\), 'stp-bell--w'\)/, 'Folgen mit Methoden-Kennung, 120 px');
  assert.match(method, />Methode öffnen<\/a>/);
  assert.match(method, /bindBells\(/);
  assert.match(plan, /bellHtml\('stock', r\.t, r\.n \|\| r\.t, 'stp-f1'\)/, 'Melden mit Ticker, halbe Breite');
  assert.match(plan, />Methode öffnen<\/a>/);
  assert.match(plan, /bindBells\(el\)/);
  assert.match(red, /U\.glyph\('bell', 18\)/, 'Glocke');
  assert.match(red, /'Folgen' : 'Melden'/);
  assert.match(css, /\.stp-sheet \.stp-bell\.stp-bell--w\{flex:none;width:120px/);
  assert.match(css, /\.stp-sheet \.stp-btn\{flex:1;height:52px/, '52 px wie .btn');
  assert.match(css, /\.stp-sheet \.stp-bell\[aria-pressed=true\]\{border:2px solid var\(--stp-lc\);color:var\(--stp-lc\)\}/, 'Zustand sichtbar');
  assert.match(SRC('supertrader/assets/supertrader.js'), /var ASSET_V = 'st-2026\.11\.16-1';/, 'Kennung erhöht');
});

// Eingebaut, AUS bis zur Anwaltsprüfung (Owner 16.11.2026; docs/accounts/FREIGABEN.md): Frontend-Schalter ST_ALERTS_UI.
// Aus: kein Knopf, kein Hinweis, st-follow.js wird nicht geladen, die Fenster sehen aus wie vor dem Einbau.
// An: Knöpfe wie gebaut. Die Kette Worker/Frontend/Migration prüft workers/vu-account/tests/st-alerts-switch.test.mjs.
test('ST-FOLLOW-SWITCH: AUS keine Knöpfe und kein Laden, AN wie gebaut', async () => {
  const vm = await import('node:vm');
  const red = SRC('supertrader/assets/st-redesign.js');
  assert.match(red, /^ {2}var ST_ALERTS_UI = false;$/m, 'ausgeliefert: AUS bis zur Anwaltsprüfung');
  const block = red.slice(red.indexOf('  var ST_ALERTS_UI = '), red.indexOf('  function foot('));
  const run = (on) => {
    const loaded = [];
    const ctx = { U: { glyph: () => '<svg></svg>' }, esc: String, window: {}, Promise, Error, Array, LOADER: null, loaded };
    vm.createContext(ctx);
    vm.runInContext(block.replace(/var ST_ALERTS_UI = (true|false);/, 'var ST_ALERTS_UI = ' + on + ';') +
      '\nLOADER = function (src) { loaded.push(src); return Promise.resolve(); };\nthis.bellHtml = bellHtml; this.bindBells = bindBells;', ctx);
    const host = { querySelector: () => ({}), querySelectorAll: () => [] };
    ctx.bindBells(host);
    return { method: ctx.bellHtml('method', 'SF_TURTLE_S1', 'Turtle · 20 Tage', 'stp-bell--w'), stock: ctx.bellHtml('stock', 'NVDA', 'NVIDIA', 'stp-f1'), loaded };
  };
  const off = run(false);
  assert.deepEqual(off, { method: '', stock: '', loaded: [] });
  const on = run(true);
  assert.match(on.method, /data-st-follow="method" data-key="SF_TURTLE_S1"[^>]*>.*Folgen<\/span><\/button>$/);
  assert.match(on.stock, /data-st-follow="stock" data-key="NVDA"[^>]*>.*Melden<\/span><\/button>$/);
  assert.deepEqual(on.loaded, ['/supertrader/assets/st-follow.js']);
  // AUS: dieselben Knöpfe wie vor dem Einbau („Methode öffnen“ als Umriss-Knopf), kein Hinweisfeld.
  const method = red.slice(red.indexOf('  function methodSheet('), red.indexOf('  /* Trader-Kachel'));
  const plan = red.slice(red.indexOf('  function planSheet('), red.indexOf('  /* Marktlage im Fenster'));
  assert.match(method, /: \(own !== sfHref \? '<a class="stp-btn stp-btn--ol" href="' \+ esc\(own\) \+ '">Methode öffnen<\/a>' : ''\)/);
  assert.match(plan, /: '<a class="stp-btn stp-btn--ol stp-f1" href="' \+ esc\(N \? N\.href\(r\.c\)/);
  for (const part of [method, plan]) assert.match(part, /\(ST_ALERTS_UI \? bellHtml\(/, 'Knopf und Hinweis nur mit Schalter');
});
