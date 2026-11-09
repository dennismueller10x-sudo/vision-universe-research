// „Was sich getan hat“ (mein-dashboard/events.js): Zusammenstellung je Aktie aus den veroeffentlichten Daten der Welten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../events.js');
const Id = require('../../core/identity.js');

const LABELS = {formations: {GAP_DOWN: 'Kurslücke nach unten', DOUBLE_BOTTOM: 'Doppelboden', DOUBLE_TOP: 'Doppeltop'}};
const tech = (formations, extra = {}) => ({rec: {asOf: '2026-11-06', fresh: true, formations, ...extra}, labels: LABELS});
const quant = {profiles: [{profileId: 'momentum-leader', label: 'Momentum Leader'}, {profileId: 'garp', label: 'GARP'}],
  historicalEvidence: {state: 'AVAILABLE', from: '2026-11-05', to: '2026-11-06', transitions: [
    {profileId: 'momentum-leader', entered: ['AAA'], exited: ['NVDA']}, {profileId: 'garp', entered: [], exited: []}]}};
const stSummary = {asOf: '2026-11-06', changes: {status: 'COMPARED', added: ['C12|NVDA', 'C10|NVDA'], restaged: []}};
const stViews = {NVDA: [{candidateId: 'C12', ticker: 'NVDA', stage: 'CONFIRMED_RESEARCH_SETUP', asOf: '2026-11-06'},
  {candidateId: 'C10', ticker: 'NVDA', stage: 'CONFIRMED_RESEARCH_SETUP', asOf: '2026-11-06'},
  {candidateId: 'C01', ticker: 'NVDA', stage: 'CHART_CANDIDATE', asOf: '2026-11-06'}]};
const names = cid => ({C12: 'Morales & Kacher · Buyable Gap-Up'})[cid] || null;
const membership = {rows: [{id: 'im-blick'}, {id: 'langfristige-compounder'}, {id: 'thema-ki'}], members: {NVDA: [[0, 1], [1, 2], [2, 1]], AAPL: [[1, 7]]}};
const funds = {state: 'AVAILABLE', period: '2026-06-30', holders: 246, newPositions: ['altimeter', 'jericho']};

test('Handelstage: Freitag ist der Vortag eines Montags', () => {
  assert.equal(E.weekdaysBetween('2026-11-06', '2026-11-09'), 1);
  assert.equal(E.weekdaysBetween('2026-11-05', '2026-11-06'), 1);
  assert.equal(E.weekdaysBetween('2026-11-04', '2026-11-06'), 2);
  assert.equal(E.weekdaysBetween('2026-11-07', '2026-11-06'), -1);
});

test('Technical: nur Tages-Befunde vom Stichtag oder Vortag, Richtung aus dem Muster', () => {
  const rows = E.technical(tech([{tf: '1D', type: 'GAP_DOWN', text: 'In Bildung, erkannt am 05.11.2026.'},
    {tf: '1D', type: 'DOUBLE_BOTTOM', text: 'Bestätigt, erkannt am 28.10.2026.'},
    {tf: '1W', type: 'DOUBLE_TOP', text: 'Im Wochenchart bestätigt.'}]).rec, LABELS);
  assert.deepEqual(rows.map(r => [r.text, r.verdict, r.pill]), [['Neuer Befund: Kurslücke nach unten (05.11.)', 'weak', 'nach unten']]);
  assert.deepEqual(E.technical({...tech([{tf: '1D', type: 'GAP_DOWN', text: 'erkannt am 06.11.2026.'}]).rec, fresh: false}, LABELS), [], 'veraltete Aktie ohne Befund');
});

test('Quant: Anlagestil neu erfuellt / nicht mehr erfuellt', () => {
  assert.deepEqual(E.quant(quant, 'NVDA').map(r => [r.text, r.verdict]), [['Nicht mehr im Anlagestil Momentum Leader (06.11.)', 'weak']]);
  assert.deepEqual(E.quant(quant, 'AAA').map(r => r.pill), ['neu erfüllt']);
  assert.deepEqual(E.quant({...quant, historicalEvidence: {state: 'UNAVAILABLE'}}, 'NVDA'), []);
});

test('Supertrader: nur neu erfuellte Regel am Stichtag, ohne Short-Methode und ohne blosse Chart-Kandidaten', () => {
  const rows = E.supertrader(stSummary, stViews.NVDA, 'NVDA', names);
  assert.deepEqual(rows.map(r => r.text), ['Morales & Kacher · Buyable Gap-Up: Regel erfüllt laut Methode']);
  assert.ok(rows[0].research, 'als Forschung gekennzeichnet');
  assert.deepEqual(E.supertrader({...stSummary, changes: {status: 'COMPARED', added: [], restaged: []}}, stViews.NVDA, 'NVDA', names), [], 'schon gestern erfuellt: kein neues Ereignis');
});

test('Discover und Hedgefonds: Zustand, nur als Zusatz', () => {
  assert.deepEqual(E.discover(membership, 'NVDA').map(r => r.text), ['Platz 2 in Langfristige Compounder'], 'Im Blick und Themen zaehlen nicht');
  assert.deepEqual(E.hedgefonds(funds, '2026-06-30').map(r => r.text), ['Neu bei 2 großen Fonds im Q2 (13F, 246 Fonds halten)']);
  assert.deepEqual(E.hedgefonds(funds, '2026-09-30'), [], 'aelteres Quartal');
});

test('compose: Karte nur mit Ereignis von heute; Leerzustand; Zaehlung ohne Zustaende', () => {
  const data = {technical: {NVDA: tech([{tf: '1D', type: 'GAP_DOWN', text: 'erkannt am 05.11.2026.'}])}, quant, stSummary, stViews, stNames: names, membership, fundsPeriod: '2026-06-30'};
  const stocks = [{ticker: 'NVDA', name: 'NVIDIA', funds13f: funds}, {ticker: 'AAPL', name: 'Apple', funds13f: funds}];
  const out = E.compose(stocks, data);
  assert.equal(out.cards.length, 1, 'AAPL hat nur Zustaende (13F, Reihe): keine Karte');
  assert.deepEqual(out.cards[0].rows.map(r => r.world), ['technical', 'quant', 'supertrader', 'hedgefonds', 'discover']);
  assert.equal(out.events, 3, 'Hedgefonds und Discover zaehlen nicht als neue Ereignisse');
  assert.equal(out.stocks, 1);
  const none = E.compose(stocks, {});
  assert.deepEqual([none.cards.length, none.events, none.stocks], [0, 0, 0]);
});

test('load: nur Schalen der Watchlist, ein Fehler laesst nur seine Zeilen weg', async () => {
  const asked = [];
  const fetchJson = p => {
    asked.push(p);
    if (p === E.PATHS.technicalMeta) return Promise.resolve({asOf: '2026-11-06', stock: {schema: 'vu-technical-stock-1.0.0', shards: [Id.shardKey('NVDA')]}});
    if (p === E.PATHS.technical(Id.shardKey('NVDA'))) return Promise.resolve({labels: LABELS, stocks: {NVDA: tech([{tf: '1D', type: 'GAP_DOWN', text: 'erkannt am 06.11.2026.'}]).rec}});
    if (p === E.PATHS.stSummary) return Promise.reject(new Error('404'));
    if (p === E.PATHS.discover) return Promise.resolve(membership);
    return Promise.reject(new Error('unerwartet ' + p));
  };
  const stocks = [{ticker: 'NVDA'}, {ticker: 'ZZZZ'}];
  const data = await E.load(fetchJson, () => Promise.reject(new Error('gz')), Id, stocks);
  assert.ok(!asked.some(p => /ZZ/.test(p) && /stock\//.test(p)), 'keine Schale ausserhalb der Liste');
  assert.equal(E.compose(stocks, data).cards.length, 1);
});

test('Wortwahl: keine Begriffe aus wording.avoid, kein Speichern', () => {
  const code = readFileSync(new URL('../events.js', import.meta.url), 'utf8');
  const legal = JSON.parse(readFileSync(new URL('../../assets/legal-notices.json', import.meta.url), 'utf8'));
  const strings = (code.match(/'[^'\n]*'/g) || []).join(' ').toLowerCase();
  const avoid = (legal.wording || []).flatMap(w => String(w.avoid || '').replace(/\([^)]*\)/g, '').split(/[,/]/)).map(a => a.trim().toLowerCase()).filter(a => a.length > 3);
  assert.ok(avoid.length > 10, 'Liste gelesen');
  for (const a of avoid) assert.ok(!new RegExp('(^|[^a-zäöüß])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-zäöüß])').test(strings), 'vermeiden: ' + a);
  assert.ok(!/localStorage|sessionStorage|A\.post|fetch\(/.test(code.replace(/\/\*[\s\S]*?\*\//g, '')), 'liest nur ueber die uebergebenen Lader');
});
