/* Fundamental: mehrere Kennzahlen in einem Verlauf (engine/compare.js).
 * Geprueft wird die Zusammenfuehrung, nicht die Rechnung der Kennzahlen (die kommt unveraendert aus catalog.js):
 * gleiche Zeitraeume, keine Luecke wird gefuellt, Bewertung nur mit Kurs nach dem Jahresbericht, keine gemeinsame Achse
 * fuer verschiedene Einheiten. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { projectHistory, publicationDates, annualReportDates } from '../../scripts/fundamental/build-history.mjs';
const require = createRequire(import.meta.url);
const C = require('../engine/catalog.js');
const K = require('../engine/compare.js');
const M = require('../engine/model.js');
const root = new URL('../../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root)));
let tenK = null;
const books = {};
/* Wie im Release und auf der Seite: Projektion, Erstveroeffentlichung der Jahresberichte, gepruefte Bewertung aus der Wochenreihe. */
const bookOf = (t) => books[t] || (books[t] = (() => {
  const s = json('discover/data/stocks/US_REAL/' + t + '.json'), p = projectHistory(json('quant/data/sec/consumer/CIK' + s.fundamentals.cik + '.json'), t);
  p.published = publicationDates(p, tenK.get(s.fundamentals.cik));
  const b = C.fromHistory(p, s);
  C.attachValuation(b, json('quant/data/market/discover-series-long/ref_' + t + '.json'));
  return b;
})());
const defs = (...ids) => ids.map((id) => C.BY_ID[id]);
const has = (s, k) => !!(s.rows[k] && typeof s.rows[k].v === 'number');
test.before(async () => { tenK = await annualReportDates(new URL('.', root).pathname); });

/* Jeder Wert im Modell ist genau der Wert aus catalog.js#seriesOf fuer denselben Zeitraum. */
function sameAsCatalog(b, model) {
  model.series.forEach((s) => {
    if (!s.ok) return;
    const ref = {}; C.seriesOf(b, s.def, model.period).forEach((r) => { ref[r.key] = r.v; });
    model.points.forEach((p) => { if (has(s, p.key)) assert.equal(s.rows[p.key].v, ref[p.key], s.def.id + ' ' + p.key); });
  });
}

test('NVIDIA: KGV + Free Cashflow – gleiche Geschaeftsjahre, Kurs nach dem 10-K, Luecken bleiben', () => {
  const b = bookOf('NVDA'), m = K.align(b, defs('pe', 'free_cash_flow'), 'annual', 0);
  assert.ok(m.series.every((s) => s.ok));
  sameAsCatalog(b, m);
  const [pe, fcf] = m.series;
  m.points.forEach((p) => {
    if (!has(pe, p.key)) return;
    const r = pe.rows[p.key];
    // Bewertungszeitpunkt nach der Veroeffentlichung genau dieses Geschaeftsjahres
    assert.equal(r.pubDate, b.published[p.key]);
    assert.ok(r.priceDate > r.pubDate, 'Kurs nach dem 10-K ' + p.key);
    assert.equal(p.published, b.published[p.key]);
  });
  // Free Cashflow erst ab GJ 2022: davor Luecken, nichts aufgefuellt
  const first = m.points.find((p) => has(fcf, p.key));
  assert.equal(first.key, 2022);
  assert.ok(m.points.some((p) => p.key < 2022 && has(pe, p.key) && !has(fcf, p.key)));
  // Berichtszeitraum (Ende GJ) und Veroeffentlichung sind getrennt; der Bericht liegt nach dem Ende
  m.points.forEach((p) => { if (p.end && p.published) assert.ok(p.published > p.end, p.key); });
  const md = K.modes(m);
  assert.equal(md.groups.length, 2);
  assert.equal(md.preferred, 'axes');
  assert.equal(md.groups[0].key, 'multiple'); // Hauptkennzahl links
});

test('NVIDIA: Marktkapitalisierung + Umsatz – eine Einheit, eine Achse', () => {
  const b = bookOf('NVDA'), m = K.align(b, defs('market_cap', 'revenue'), 'annual', 10);
  assert.ok(m.series.every((s) => s.ok));
  sameAsCatalog(b, m);
  assert.equal(m.points.length, 10);
  const md = K.modes(m);
  assert.equal(md.groups.length, 1);
  assert.deepEqual(md.groups[0].members, [0, 1]);
  assert.equal(md.preferred, 'axes');
});

test('META: KGV + Nettogewinn; TSLA: Umsatz + Free Cashflow auch quartalsweise', () => {
  const meta = K.align(bookOf('META'), defs('pe', 'net_income'), 'annual', 0);
  assert.ok(meta.series.every((s) => s.ok));
  sameAsCatalog(bookOf('META'), meta);
  assert.equal(K.modes(meta).groups.length, 2);
  const b = bookOf('TSLA');
  const a = K.align(b, defs('revenue', 'free_cash_flow'), 'annual', 0), q = K.align(b, defs('revenue', 'free_cash_flow', 'pe'), 'quarterly', 0);
  sameAsCatalog(b, a); sameAsCatalog(b, q);
  assert.ok(a.points.some((p) => a.series[1].rows[p.key].v < 0), 'negativer Free Cashflow bleibt negativ');
  assert.equal(K.modes(a).groups.length, 1);
  assert.ok(q.series[0].ok && q.series[1].ok);
  assert.equal(q.series[2].ok, false);
  assert.equal(q.series[2].reason, 'VALUATION_ANNUAL_ONLY');
  q.points.forEach((p) => { assert.equal(p.published, null); assert.ok(/^Q[1-4] \d{4}$/.test(p.label)); });
});

test('NVIDIA: drei Einheiten – keine gemeinsame Achse, Index mit gemeinsamer Basis 100', () => {
  const b = bookOf('NVDA'), m = K.align(b, defs('pe', 'revenue', 'operating_margin'), 'annual', 0), md = K.modes(m);
  assert.equal(md.groups.length, 3);
  assert.equal(md.ok.axes, false);
  assert.equal(md.preferred, 'index');
  const ix = md.index;
  assert.ok(ix.base !== null);
  ix.vals.forEach((v, i) => {
    assert.equal(v[ix.base], 100);
    Object.keys(v).forEach((k) => assert.ok(Math.abs(v[k] - m.series[i].rows[k].v / m.series[i].rows[ix.base].v * 100) < 1e-9));
  });
  // Basis = erster Zeitraum, in dem alle drei positiv sind
  const firstAll = m.points.find((p) => m.series.every((s) => s.rows[p.key] && s.rows[p.key].v > 0));
  assert.equal(ix.base, firstAll.key);
  // drei Geldbetraege: Index ebenfalls moeglich, Achse auch (eine Einheit)
  const n = K.modes(K.align(b, defs('revenue', 'net_income', 'free_cash_flow'), 'annual', 5));
  assert.equal(n.ok.axes, true); assert.equal(n.ok.index, true);
});

test('Wachstumsraten werden nicht indexiert; ohne gemeinsame Basis kein Index', () => {
  const b = bookOf('NVDA'), m = K.align(b, defs('revenue', 'revenue_growth'), 'annual', 0), ix = K.indexed(m);
  assert.equal(ix.excluded[1], 'INDEX_GROWTH');
  assert.equal(ix.vals[1], null);
  assert.equal(K.modes(m).ok.index, false); // nur eine indexierbare Reihe
  const neg = K.align(bookOf('TSLA'), defs('free_cash_flow', 'revenue'), 'annual', 0), nx = K.indexed(neg);
  assert.ok(neg.series[0].rows[nx.base].v > 0, 'Basis nie bei negativem Wert');
});

test('Look-ahead-Sperre: Bewertung mit Kurs vor dem Jahresbericht wird verworfen', () => {
  const b = {
    years: [2023, 2024], quarters: [], published: { 2023: '2024-02-20', 2024: '2025-02-20' }, base: {}, splits: [], currency: 'USD', mismatch: {},
    valuation: { reason: null, missing: {}, series: { pe: [
      { key: 2023, fy: 2023, label: 'GJ 2023', short: '2023', v: 20, pubDate: '2024-02-20', priceDate: '2024-02-23' },
      { key: 2024, fy: 2024, label: 'GJ 2024', short: '2024', v: 25, pubDate: '2025-02-20', priceDate: '2025-02-14' }] } }
  };
  const a = K.availability(b, C.BY_ID.pe, 'annual');
  assert.equal(a.rows[0].v, 20);
  assert.equal(a.rows[1].v, null);
  assert.equal(a.rows[1].reason, 'LOOKAHEAD');
  assert.equal(a.ok, false); // nur ein gepruefter Wert
});

test('Einschraenkungen mit Grund: PEG ohne Verlauf, ROE nur jaehrlich, Bewertung erst mit Kursreihe', () => {
  const b = bookOf('NVDA');
  assert.equal(K.availability(b, C.BY_ID.peg, 'annual').reason, 'NO_HISTORY');
  assert.equal(K.availability(b, C.BY_ID.roe, 'quarterly').reason, 'ANNUAL_ONLY');
  assert.equal(K.availability(b, C.BY_ID.roe, 'annual').ok, true);
  const bare = Object.assign({}, b, { valuation: undefined });
  assert.equal(K.availability(bare, C.BY_ID.pe, 'annual').reason, 'LOADING');
  for (const code of ['NO_HISTORY', 'ANNUAL_ONLY', 'VALUATION_ANNUAL_ONLY', 'LOOKAHEAD', 'INDEX_GROWTH']) assert.ok(K.reasonText(code).length > 5);
  // Auslaendischer Berichterstatter: kein Bewertungsverlauf, Grund aus catalog.js
  const v = C.historicalValuation(Object.assign({}, b, { currency: 'EUR' }), null);
  assert.equal(K.availability(Object.assign({}, b, { valuation: v }), C.BY_ID.pe, 'annual').reason, 'NON_USD_REPORTING');
});

test('Zeitraum-Auswahl und Achse: letzte n Zeitraeume, keine leeren Raender', () => {
  const b = bookOf('NVDA'), m = K.align(b, defs('free_cash_flow', 'net_income'), 'annual', 3);
  assert.deepEqual(m.points.map((p) => p.key), [2024, 2025, 2026]);
  const all = K.align(b, defs('free_cash_flow', 'net_income'), 'annual', 0);
  assert.ok(all.points.every((p) => all.series.some((s) => has(s, p.key))));
  assert.equal(all.lastMain, 2026);
});

test('Auswahl aus der Adresse: gueltig, ohne Hauptkennzahl und Doppelte, hoechstens drei weitere', () => {
  assert.deepEqual(K.cleanSelection('pe', ['free_cash_flow', 'pe', 'xyz', 'free_cash_flow', 'revenue', 'market_cap', 'roe']), ['free_cash_flow', 'revenue', 'market_cap']);
  assert.equal(K.modeFromParam('index'), 'index');
  assert.equal(K.modeFromParam('getrennt'), 'split');
  assert.equal(K.modeFromParam('x'), null);
  assert.deepEqual(M.parseRoute('#/NVDA?ansicht=kennzahl&k=pe&plus=free_cash_flow.revenue&d=index'),
    { view: 'company', ticker: 'NVDA', sub: 'kennzahl', metric: 'pe', plus: ['free_cash_flow', 'revenue'], dmode: 'index' });
  assert.equal(M.parseRoute('#/NVDA?ansicht=kennzahl&k=pe&plus=<x>&d=bunt').plus, undefined);
  assert.equal(M.parseRoute('#/NVDA?ansicht=kennzahl&k=pe&d=bunt').dmode, undefined);
});
