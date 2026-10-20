/* Fundamental 1.0: Modell liest nur den bestehenden Discover-Block `fundamentals`; keine Schaetzung, Luecken bleiben sichtbar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../engine/model.js');
const stock = (t) => JSON.parse(readFileSync(new URL('../../discover/data/stocks/US_REAL/' + t + '.json', import.meta.url)));

const p = (fy, v, extra = {}) => ({ fy, end: fy + '-12-31', v, filed: (fy + 1) + '-02-20', accn: '0000000000-' + String(fy).slice(2) + '-000001', ...extra });
const synth = (over = {}) => ({
  symbol: 'TEST', companyName: 'Test Corp',
  fundamentals: {
    available: true, version: 'fundamentals-1.2.0', source: 'sec_edgar:companyfacts', asOf: '2026-10-19', cik: '0000012345',
    fiscalYears: [2021, 2022, 2023, 2024], latestFiscalYear: 2024, ttmThrough: 'FY2025Q2',
    journey: {
      years: [2021, 2022, 2023, 2024],
      tracks: [['revenue', [p(2021, 100), p(2022, 120), p(2024, 150)]], ['net_income', [p(2021, -10), p(2022, -5), p(2023, 4), p(2024, 6)]],
        ['free_cash_flow', [p(2023, 0), p(2024, 3)]], ['shares', [p(2021, 10), p(2022, 30)]], ['debt', []],
        ['margins', { gross: [p(2023, 0.4), p(2024, 0.5)], net: [] }]],
      caveats: { shares: 'Aktienanzahl springt.' }
    },
    latest: { annual: {}, ttm: { revenue: { v: 160, end: '2025-06-30', through: 'FY2025Q2' } }, staleness: { stale: false } },
    ...over
  }
});

test('Luecken bleiben sichtbar, nichts wird aufgefuellt', () => {
  const f = M.fromStock(synth()), rev = f.metrics.find((m) => m.id === 'revenue');
  assert.deepEqual(rev.rows.map((r) => r.v), [100, 120, null, 150]);
  assert.deepEqual(rev.gaps, [2023]);
  assert.equal(rev.rows[2].gap, true);
  // Veraenderung zum letzten VORHANDENEN Vorjahr, Luecke wird nicht interpoliert
  assert.equal(rev.prev.fy, 2022); assert.equal(rev.last.fy, 2024);
  assert.equal(Math.round(rev.change.pct * 1000), 250);
  assert.equal(rev.ttm.v, 160);
});

test('Vorzeichenwechsel und Vorwert 0 liefern keine Prozentzahl', () => {
  const f = M.fromStock(synth());
  const ni = f.metrics.find((m) => m.id === 'net_income');
  assert.deepEqual([ni.change.dir, ni.change.pct, ni.change.signFlip], ['up', (6 - 4) / 4, false]);
  assert.equal(M.change(-5, 4).signFlip, true); assert.equal(M.change(-5, 4).pct, null);
  assert.equal(M.changeText({ unit: 'USD' }, M.change(-5, 4)), '▲ Vorzeichenwechsel');
  const fcf = f.metrics.find((m) => m.id === 'free_cash_flow');
  assert.equal(fcf.change.pct, null, 'Vorwert 0');
  assert.equal(M.changeText({ unit: 'USD' }, M.change(3, 3)), '■ unverändert');
});

test('Fehlende Kennzahl ist "nicht verfuegbar", Hinweis bleibt an der Kennzahl', () => {
  const f = M.fromStock(synth());
  assert.equal(f.metrics.find((m) => m.id === 'debt').available, false);
  assert.equal(f.metrics.find((m) => m.id === 'shares').caveat, 'Aktienanzahl springt.');
  assert.deepEqual(f.caveats, [{ track: 'shares', text: 'Aktienanzahl springt.' }]);
  assert.deepEqual(f.margins.map((m) => [m.id, m.available]), [['gross', true], ['operating', false], ['net', false]]);
  assert.equal(M.changeText({ unit: 'ratio' }, f.margins[0].change), '▲ +10,0 Pp.');
  assert.deepEqual(f.kpis.map((k) => k.id), ['revenue', 'net_income', 'free_cash_flow']);
});

test('Quelle je Geschaeftsjahr: Meldungen ohne Doppelungen, Zahl der Kennzahlen mit Wert', () => {
  const f = M.fromStock(synth());
  const y21 = f.sources.find((s) => s.fy === 2021);
  assert.equal(y21.filings.length, 1); assert.equal(y21.values, 3); assert.equal(y21.of, M.METRICS.length);
  assert.equal(M.secFilingUrl('0000012345', '0000000000-21-000001'), 'https://www.sec.gov/Archives/edgar/data/12345/000000000021000001/');
  for (const bad of [['x', '0000000000-21-000001'], ['12345', '1-2-3'], [null, null], ['12345', 'javascript:alert(1)']]) assert.equal(M.secFilingUrl(...bad), null);
});

test('Ohne Fundamentaldaten ehrlicher Zustand statt leerer Diagramme', () => {
  assert.equal(M.fromStock({ symbol: 'X', fundamentals: { available: false } }).available, false);
  assert.equal(M.fromStock({ symbol: 'X' }).available, false);
  assert.equal(M.fromStock(null).available, false);
});

test('Formatierung de-DE mit Einheiten', () => {
  assert.equal(M.money(4475446000), '4,48 Mrd. $');
  assert.equal(M.money(-52016000), '−52,0 Mio. $');
  assert.equal(M.money(394328000000), '394 Mrd. $');
  assert.equal(M.money(2.1e12), '2,10 Bio. $');
  assert.equal(M.count(2571000000), '2,57 Mrd.');
  assert.equal(M.pct(0.823665), '82,4 %');
  assert.equal(M.value({ unit: 'USD/shares' }, -1.17), '−1,17 $');
  assert.equal(M.value({ unit: 'USD' }, null), '–');
  assert.equal(M.dateDe('2026-02-17'), '17.02.2026');
  assert.equal(M.yearRanges([2020, 2015, 2016, 2017, 2022, 2023]), '2015–2017, 2020, 2022–2023');
  assert.equal(M.yearRanges([]), '');
});

test('Route und Suche: Bindestrich-Ticker, exakter Treffer zuerst, ungueltige Eingabe bleibt auf der Startseite', () => {
  assert.deepEqual(M.parseRoute('#/brk-b'), { view: 'company', ticker: 'BRK-B' });
  assert.deepEqual(M.parseRoute('#/'), { view: 'home' });
  assert.deepEqual(M.parseRoute('#/methodik'), { view: 'method' });
  assert.equal(M.parseRoute('#/<script>').view, 'home');
  assert.equal(M.stockPath('brk-b'), '/discover/data/stocks/US_REAL/BRK-B.json');
  const entries = [{ s: 'PLTR', n: 'Palantir' }, { s: 'PL', n: 'Planet Labs' }, { s: 'APLT', n: 'Applied Therapeutics' }, { s: 'X', n: 'Pl Corp' }];
  assert.deepEqual(M.search(entries, 'pl').map((h) => h.ticker), ['PL', 'PLTR', 'X', 'APLT']);
  assert.deepEqual(M.search(entries, '  '), []);
});

test('Echte Daten: PLTR 8 Geschaeftsjahre + TTM, Quellen je Jahr, Aktienanzahl mit Hinweis', () => {
  const f = M.fromStock(stock('PLTR'));
  assert.equal(f.available, true);
  assert.ok(f.years.length >= 8, 'mindestens 8 Geschaeftsjahre');
  const rev = f.metrics.find((m) => m.id === 'revenue');
  assert.equal(rev.rows.filter((r) => r.v != null).length, f.years.length);
  assert.ok(rev.ttm && rev.ttm.v > rev.last.v);
  assert.ok(f.sources.every((s) => s.filings.every((x) => M.secFilingUrl(f.cik, x.accn))), 'jede Meldung verlinkbar');
  assert.ok(f.metrics.find((m) => m.id === 'shares').caveat);
});

test('Echte Daten: Lueckenhafte Reihe (NVDA Free Cashflow) und Banken ohne Bruttomarge (JPM)', () => {
  const nv = M.fromStock(stock('NVDA')).metrics.find((m) => m.id === 'free_cash_flow');
  assert.ok(nv.gaps.length > 0 && nv.available, 'Luecken bleiben sichtbar');
  const jpm = M.fromStock(stock('JPM'));
  assert.equal(jpm.margins.find((m) => m.id === 'gross').available, false);
  assert.equal(jpm.margins.find((m) => m.id === 'net').available, true);
});

test('Nur bestehende, ausgelieferte Daten: Discover-Aktiendatei und Suchliste', () => {
  const src = readFileSync(new URL('../engine/model.js', import.meta.url), 'utf8') + readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const paths = [...src.matchAll(/['"](\/[a-z0-9-]+\/data\/[^'"]*)['"]/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(paths)].sort(), ['/discover/data/search/US_REAL.json', '/discover/data/stocks/US_REAL/']);
  assert.ok(existsSync(new URL('../../discover/data/search/US_REAL.json', import.meta.url)));
  assert.doesNotMatch(src, /quant\/data\/sec|quant\/data\/fundamentals/, 'keine nicht ausgelieferten SEC-Rohdaten');
});
