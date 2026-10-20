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
  assert.deepEqual([...new Set(paths)].sort(), ['/discover/data/rows/US_REAL/', '/discover/data/search/US_REAL.json', '/discover/data/stocks/US_REAL/']);
  assert.ok(existsSync(new URL('../../discover/data/rows/US_REAL/thema-ki.json', import.meta.url)));
  assert.ok(existsSync(new URL('../../discover/data/search/US_REAL.json', import.meta.url)));
  assert.doesNotMatch(src, /quant\/data\/sec|quant\/data\/fundamentals/, 'keine nicht ausgelieferten SEC-Rohdaten');
});

/* Fundamental 1.1: Wachstum, Profitabilitaet, Bilanz, Bewertung – nur aus vorhandenen Werten, mit Grund statt Schaetzung. */
test('Wachstum pro Jahr nur ueber genau n Jahre mit positivem Anfangs- und Endwert', () => {
  const rows = M.series([p(2020, 100), p(2021, 110), p(2023, 121), p(2025, 161.051)], [2020, 2021, 2022, 2023, 2024, 2025]);
  const g5 = M.cagr(rows, 5);
  assert.equal(Math.round(g5.rate * 1e6), 100000); assert.deepEqual([g5.from, g5.to], [2020, 2025]);
  assert.equal(M.cagr(rows, 3).reason, 'TOO_SHORT', '2022 fehlt: keine Rate ueber eine Luecke als Startjahr');
  assert.equal(M.cagr(M.series([p(2022, -5), p(2025, 10)], [2022, 2023, 2024, 2025]), 3).reason, 'NOT_POSITIVE');
  assert.equal(M.cagr([], 3).reason, 'NO_DATA');
});

test('Vorjahresveraenderung: Luecke unterbricht, Vorzeichenwechsel ohne Prozent', () => {
  const y = M.yoy(M.series([p(2021, 100), p(2022, 120), p(2024, -10), p(2025, 5)], [2021, 2022, 2023, 2024, 2025]));
  assert.deepEqual(y.map((r) => r.fy), [2022, 2023, 2024, 2025]);
  assert.equal(Math.round(y[0].pct * 100), 20);
  assert.equal(y[1].gap, true); assert.equal(y[2].gap, true);
  assert.equal(y[3].pct, null); assert.equal(y[3].signFlip, true);
});

test('Echte Daten NVDA: Gewinn je Aktie mit Split-Hinweis bekommt keine Rate, Umsatz schon', () => {
  const f = M.fromStock(stock('NVDA'));
  const eps = f.growth.find((g) => g.id === 'eps_diluted'), rev = f.growth.find((g) => g.id === 'revenue');
  assert.ok(eps.horizons.every((h) => h.rate == null && h.reason === 'NOT_COMPARABLE'));
  assert.ok(rev.horizons.every((h) => h.rate > 0));
  const l = f.ladder.steps;
  assert.equal(l[0].id, 'revenue'); assert.equal(l[0].share, 1);
  assert.ok(l.every((s, i) => i === 0 || s.share < 1), 'jede Stufe kleiner als der Umsatz');
  assert.ok(f.balance.net < 0 && f.balance.cash > 0, 'NVDA: Nettokasse');
  assert.ok(f.valuation.pe.value > 0 && f.valuation.pe.ratio > 0 && f.valuation.peMedian > 0);
});

test('Echte Daten: Verlust ohne KGV (AAL), KGV auf Geschaeftsjahresbasis (JPM), ohne Kennzahl keine Bewertung (BRK-B)', () => {
  const aal = M.fromStock(stock('AAL')).valuation;
  assert.equal(aal.pe, null); assert.equal(aal.peReason, 'LOSS'); assert.equal(M.reasonText('LOSS'), 'Verlust in den letzten 12 Monaten');
  assert.ok(aal.ps.value > 0);
  assert.equal(M.fromStock(stock('JPM')).valuation.pe.basis, 'FY');
  assert.equal(M.fromStock(stock('JPM')).ladder.steps.map((s) => s.id).join(), 'revenue,net_income', 'Bank: nur gemeldete Stufen');
  assert.equal(M.fromStock(stock('BRK-B')).valuation, null);
});

test('Bilanz rechnet Nettoschulden nur aus gemeldeten Werten', () => {
  const b = M.fromStock(synth({ latest: { annual: { cash_and_equivalents: { v: 30, end: '2024-12-31' }, long_term_debt: { v: 50 }, stockholders_equity: { v: 40 }, total_assets: { v: 160 } }, ttm: {}, derived: { roe: 0.1 } } })).balance;
  assert.deepEqual([b.net, b.debtKind, b.equityRatio, b.roe, b.end], [20, 'long_term', 0.25, 0.1, '2024-12-31']);
  assert.equal(M.fromStock(synth()).balance, null);
  assert.equal(M.fromStock(synth()).ladder, null);
});

/* Fundamental 1.2: Im Vergleich – nur bestehende Discover-Auswahlen, dieselben Definitionen fuer alle. */
const row = (t) => JSON.parse(readFileSync(new URL('../../discover/data/rows/US_REAL/' + t + '.json', import.meta.url)));
test('Vergleichsgruppen: kuratierter Sektor nur mit gleichem Sektor, sonst Discover-Themen; "similar" ohne Sektor wird nicht verwendet', () => {
  const ko = M.peerOptions(stock('KO'));
  assert.equal(ko[0].kind, 'sector');
  assert.ok(ko[0].peers.length > 0 && ko[0].peers.every((p) => stock(p.ticker).sector === 'Consumer Staples'));
  const pltr = stock('PLTR'), opts = M.peerOptions(pltr);
  assert.equal(pltr.sector, null);
  assert.ok(opts.length && opts.every((o) => o.kind === 'theme' && /^\/discover\/data\/rows\/US_REAL\/thema-[a-z0-9-]+\.json$/.test(o.row)));
  assert.deepEqual(M.peerOptions({ symbol: 'X', sector: null, discoverNext: { similar: { cards: [{ symbol: 'Y', sector: null }] } } }), []);
  assert.equal(M.titleCase('ÖL, GAS & VERSORGER'), 'Öl, Gas & Versorger');
});

test('Themenzeile: Vergleich mit aehnlichster Umsatzgroesse, ohne sich selbst', () => {
  const r = { cards: [{ symbol: 'A', metrics: { f_revenue: 1e9 } }, { symbol: 'SELF', metrics: { f_revenue: 5e10 } }, { symbol: 'B', metrics: { f_revenue: 4e10 } },
    { symbol: 'C', metrics: { f_revenue: 6e10 } }, { symbol: 'D', metrics: {} }, { symbol: 'E', metrics: { f_revenue: 2e11 } }] };
  assert.deepEqual(M.peersFromRow(r, 'SELF', 3, 5e10).map((p) => p.ticker), ['C', 'B', 'E'], 'Abstand im Verhaeltnis: 6e10 liegt naeher an 5e10 als 4e10');
  assert.deepEqual(M.peersFromRow(r, 'SELF', 2, null).map((p) => p.ticker), ['A', 'B'], 'ohne eigenen Umsatz: Reihenfolge der Zeile');
  const ko = M.fromStock(stock('KO')), mine = ko.metrics[0].last.v;
  const peers = M.peersFromRow(row('thema-konsum-marken'), 'KO', 4, mine);
  assert.ok(peers.length === 4 && peers.every((p) => p.ticker !== 'KO'));
});

test('Vergleichszeile: gleiche Definitionen wie die eigene Seite, unplausible Marge ohne Wert, Grund statt Zahl', () => {
  const f = M.fromStock(stock('NVDA')), r = M.compareRow(f);
  assert.equal(r.growth3, f.growth.find((g) => g.id === 'revenue').horizons[0].rate);
  assert.equal(r.netMargin, f.margins.find((m) => m.id === 'net').last.v);
  assert.equal(r.pe, f.valuation.pe.value);
  const aal = M.compareRow(M.fromStock(stock('AAL')));
  assert.deepEqual([aal.pe, aal.peReason], [null, 'LOSS']);
  const odd = M.compareRow(M.fromStock(synth({ journey: { years: [2023, 2024], tracks: { revenue: [p(2023, 10), p(2024, 10)], margins: { net: [p(2024, 1.9)] } } } })));
  assert.equal(odd.netMargin, null, 'Marge ueber 100 % wird nicht verglichen');
  assert.equal(M.compareRow(M.fromStock({ symbol: 'Z' })).available, false);
});

test('Skala der Gruppe: ab Null, Ausreisser gekappt, hoechster Wert = 1', () => {
  const sc = M.compareScale([{ x: 10 }, { x: 20 }, { x: 30 }, { x: 400 }, { x: null }], 'x', 4);
  assert.deepEqual([sc.min, sc.median, sc.count, sc.max], [0, 25, 4, 100]);
  assert.deepEqual([sc.rank(400), sc.rank(10), sc.rank(null)], [1, 4, null]);
  assert.equal(M.compareScale([{ x: -5 }, { x: 5 }], 'x').min, -5);
  assert.equal(M.compareScale([{ x: null }], 'x'), null);
});

/* Fundamental 1.3: Startseite – Discover-Zeilen mit reinen SEC-Regeln, Kachelwerte = Werte der Unternehmensseite. */
test('Entdecken: Kachelwerte der Discover-Zeile stimmen mit dem Modell der Unternehmensseite ueberein', () => {
  for (const id of M.HOME_ROWS) {
    const r = M.homeRow(row(id));
    assert.ok(r && r.title && r.tiles.length > 0, id);
    for (const t of r.tiles.slice(0, 6)) {
      const c = M.compareRow(M.fromStock(stock(t.ticker)));
      for (const k of ['revenue', 'growth3', 'netMargin', 'pe']) {
        if (t[k] == null && c[k] == null) continue;
        assert.ok(t[k] != null && c[k] != null && Math.abs(t[k] - c[k]) <= 1e-6 * Math.max(1, Math.abs(c[k])), id + ' ' + t.ticker + ' ' + k + ': ' + t[k] + ' vs ' + c[k]);
      }
    }
  }
  assert.equal(M.homeRow(null), null);
  assert.deepEqual(M.homeTile({ symbol: 'x', metrics: { f_pe: NaN } }).pe, null);
  const odd = M.homeTile({ symbol: 'x', metrics: { f_netMargin: 1.18, f_fcfMargin: 0.2 } });
  assert.deepEqual([odd.netMargin, odd.implausible.netMargin, odd.fcfMargin], [null, true, 0.2], 'wie im Vergleich: Marge > 100 % nicht als Wert');
});
