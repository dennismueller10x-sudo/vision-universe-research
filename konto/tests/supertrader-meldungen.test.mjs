// Supertrader-Meldungen im Konto (/konto/einstellungen/#supertrader-meldungen): gefolgte Methoden und gemeldete Aktien.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const M = require('../supertrader-meldungen.js');
const STNames = require('../../supertrader/assets/st-names.js');

test('Methoden-Namen wie auf der Supertrader-Seite, Kennungen wie im Kandidatenstand', () => {
  for (const [id, [cid, name]] of Object.entries(M.METHODS)) assert.equal(name, STNames.name(cid), id);
  const index = JSON.parse(read('supertrader/data/sf-candidates/index.json'));
  assert.deepEqual(index.strategies.map(s => [s.strategyId, s.candidateId]).sort(), Object.entries(M.METHODS).map(([id, [cid]]) => [id, cid]).sort());
});

test('Modell: Art im Konto, gefolgte Methoden, gemeldete Aktien (nicht ausgeschaltet, je Ticker einmal)', () => {
  const m = M.model({settings: {notifications: {SUPERTRADER_SIGNAL: true}}}, {follows: [{strategyId: 'SF_MINERVINI_SEPA_VCP'}, {strategyId: 'SF_UNBEKANNT'}]},
    {items: [{ticker: 'NVDA', alerts: {}}, {ticker: 'NVDA', alerts: {}}, {ticker: 'AMD', alerts: {SUPERTRADER_SIGNAL: false}}, {ticker: null, alerts: {}}]});
  assert.equal(m.on, true);
  assert.deepEqual(m.methods, [{id: 'SF_MINERVINI_SEPA_VCP', name: 'Minervini · VCP', href: '/supertrader/strategies/?sf=C06'},
    {id: 'SF_UNBEKANNT', name: 'SF_UNBEKANNT', href: '/supertrader/'}]);
  assert.deepEqual(m.stocks.map(s => s.ticker), ['NVDA']);
  assert.equal(M.model({settings: {notifications: {}}}, null, null).on, false);
});

test('Einstellungen: Abschnitt, Skript, Wortlaut', () => {
  const html = read('konto/einstellungen/index.html');
  for (const part of ['id="supertrader-meldungen"', 'id="st-meldungen-methods"', 'id="st-meldungen-stocks"', 'Forschung, nicht zertifiziert. Keine Empfehlung.',
    '<script src="/konto/supertrader-meldungen.js"></script>', 'data-notification="SUPERTRADER_SIGNAL"']) assert.ok(html.includes(part), part);
  for (const t of Object.values(M.TEXT)) for (const re of [/signal/i, /empfehl/i, /einstieg/i, /\bkauf/i, /verkauf/i, /chance/i, /kursziel/i]) assert.doesNotMatch(t, re, t);
});

// Eingebaut, AUS bis zur Anwaltspruefung (Owner 16.11.2026): Der Abschnitt erscheint nur, wenn der Konto-Worker
// /v1/supertrader/follows beantwortet (VU_SUPERTRADER_ALERTS_ENABLED). Aus: 404, eine einzige Anfrage, Abschnitt verborgen.
function fakeDoc() {
  const nodes = {};
  const node = (tag) => ({tag, children: [], textContent: '', hidden: tag === 'section', className: '', attrs: {},
    append(...c) { this.children.push(...c); }, remove() {}, addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] || null; }});
  for (const id of ['supertrader-meldungen', 'st-meldungen-status', 'st-meldungen-methods', 'st-meldungen-stocks']) nodes[id] = node(id === 'supertrader-meldungen' ? 'section' : 'ul');
  return {nodes, getElementById: id => nodes[id] || null, createElement: node, querySelector: () => null};
}
function fakeAccount(on) {
  const calls = [];
  const res = (ok, status, data) => Promise.resolve({ok, status, data, state: ok ? undefined : data.state});
  return {calls, available: () => true, message: s => s,
    get: p => {
      calls.push(p);
      if (p === '/v1/supertrader/follows') return on ? res(true, 200, {follows: [{strategyId: 'SF_TURTLE_S1'}], limit: 50}) : res(false, 404, {state: 'SUPERTRADER_ALERTS_NOT_ACTIVATED'});
      if (p === '/v1/me') return res(true, 200, {settings: {notifications: {SUPERTRADER_SIGNAL: true}}});
      return res(true, 200, {items: [{ticker: 'NVDA', instrumentId: 'vu_abc123', listId: 'l1', alerts: {}}]});
    }};
}

test('Schalter AUS: Worker antwortet 404 -> keine Meldungsliste, nur eine Anfrage', async () => {
  const prev = globalThis.VUAccount;
  try {
    const doc = fakeDoc(), A = fakeAccount(false);
    globalThis.VUAccount = A;
    assert.equal(await M.start(doc), false);
    assert.equal(doc.nodes['supertrader-meldungen'].hidden, true, 'Abschnitt bleibt verborgen');
    assert.deepEqual(A.calls, ['/v1/supertrader/follows']);
    assert.equal(doc.nodes['st-meldungen-methods'].children.length, 0);
    assert.ok(read('konto/einstellungen/index.html').includes('<section class="ka-card ka-st" id="supertrader-meldungen" hidden'), 'im HTML verborgen');
  } finally { globalThis.VUAccount = prev; }
});

test('Schalter AN: Meldungsliste wie gebaut', async () => {
  const prev = globalThis.VUAccount;
  try {
    const doc = fakeDoc(), A = fakeAccount(true);
    globalThis.VUAccount = A;
    assert.equal(await M.start(doc), true);
    assert.equal(doc.nodes['supertrader-meldungen'].hidden, false);
    assert.deepEqual(A.calls, ['/v1/supertrader/follows', '/v1/me', '/v1/watchlist']);
    assert.equal(doc.nodes['st-meldungen-status'].textContent, M.TEXT.on);
    assert.equal(doc.nodes['st-meldungen-methods'].children.length, 1);
    assert.equal(doc.nodes['st-meldungen-stocks'].children.length, 1);
  } finally { globalThis.VUAccount = prev; }
});
