/* Fundamental 2.0: Kennzahlenkatalog, Reihen, Querschnitt und Historien-Projektion.
 * Nichts wird geschaetzt: fehlende Eingaben bleiben Luecken, Betraege anderer Waehrungen werden nicht verglichen. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { projectHistory, writeHistory, industryMedians, SCHEMA, INDUSTRY_MIN } from '../../scripts/fundamental/build-history.mjs';
const require = createRequire(import.meta.url);
const C = require('../engine/catalog.js');
const M = require('../engine/model.js');
const root = new URL('../../', import.meta.url);
const stock = (t) => JSON.parse(readFileSync(new URL('discover/data/stocks/US_REAL/' + t + '.json', root)));
const consumer = (cik) => JSON.parse(readFileSync(new URL('quant/data/sec/consumer/CIK' + cik + '.json', root)));
const bookOf = (t) => { const s = stock(t); return C.fromHistory(projectHistory(consumer(s.fundamentals.cik), t), s); };

/* Kleine synthetische Verbraucherdatei im echten Schema. */
const row = (fy, fp, end, v, accn = '0000000001-25-000001', filed = '2025-03-01', derived = 0) => [fy, fp, end, v, filed, accn, derived];
const synth = (over = {}) => ({
  schema: 'vu-consumer-fundamentals-1.0.0', dataSource: { provider: 'sec_edgar', isMock: false }, policy: 'as_of_latest', cik: '0000000001', name: 'Test', asOf: '2025-10-01',
  columns: ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived'],
  units: { revenue: 'USD', net_income: 'USD', stockholders_equity: 'USD', diluted_weighted_average_shares: 'shares', eps_diluted: 'USD/shares' },
  annual: {
    revenue: [row(2022, 'FY', '2022-12-31', 100), row(2023, 'FY', '2023-12-31', 120), row(2024, 'FY', '2024-12-31', 150)],
    net_income: [row(2022, 'FY', '2022-12-31', 10), row(2024, 'FY', '2024-12-31', 30)],
    stockholders_equity: [row(2023, 'FY', '2023-12-31', 200), row(2024, 'FY', '2024-12-31', 0)],
    diluted_weighted_average_shares: [row(2022, 'FY', '2022-12-31', 10), row(2023, 'FY', '2023-12-31', 10), row(2024, 'FY', '2024-12-31', 40)],
    eps_diluted: [row(2022, 'FY', '2022-12-31', 1), row(2023, 'FY', '2023-12-31', 2), row(2024, 'FY', '2024-12-31', 0.8)]
  },
  quarterly: { revenue: [row(2025, 'Q1', '2025-03-31', 40, '0000000001-25-000002', '2025-05-01'), row(2025, 'Q2', '2025-06-30', 45, '0000000001-25-000003', '2025-08-01')] },
  ttm: { revenue: { v: 170, end: '2025-06-30', through: 'FY2025Q2', kind: 'TTM' } },
  ...over
});

test('Projektion: Herkunft je Wert bleibt erhalten, Meldungen einmal je Emittent', () => {
  const h = projectHistory(synth(), 'TEST');
  assert.equal(h.schema, SCHEMA);
  assert.equal(h.filings.length, 3);
  const b = C.fromHistory(h, null);
  assert.deepEqual(b.years, [2022, 2023, 2024]);
  assert.equal(b.base.revenue.quarterly[1].accn, '0000000001-25-000003');
  assert.equal(b.base.revenue.annual[0].filed, '2025-03-01');
});

test('Projektion verwirft eine Kennzahl mit unstimmiger Zeile statt sie still zu kuerzen', () => {
  const bad = synth(); bad.annual.revenue.push(row(2025, 'FY', '2025-12-31', 1, '0000000001-25-000001', '2024-01-01')); // gemeldet vor Periodenende
  const h = projectHistory(bad, 'TEST');
  assert.equal(h.annual.revenue, undefined);
  assert.equal(h.unavailable['annual:revenue'], 'INVALID_FACT_EVIDENCE');
  assert.equal(projectHistory({ ...synth(), dataSource: { provider: 'sec_edgar', isMock: true } }, 'TEST'), null, 'keine Mock-Daten');
});

test('Abgeleitete Kennzahlen: Luecke statt Schaetzung, ROE nur bei positivem Eigenkapital', () => {
  const b = C.fromHistory(projectHistory(synth(), 'TEST'), null);
  const nm = C.seriesOf(b, C.BY_ID.net_margin, 'annual');
  assert.deepEqual(nm.map((r) => r.v), [0.1, null, 0.2]);
  assert.equal(nm[1].gap, true);
  assert.equal(C.seriesOf(b, C.BY_ID.roe, 'annual').length, 0, 'Eigenkapital 0 -> keine Rendite, 2023 ohne Gewinn');
  const g = C.seriesOf(b, C.BY_ID.revenue_growth, 'annual');
  assert.equal(g[g.length - 1].v, 0.25);
});

test('Split ohne Rueckrechnung: Werte je Aktie bekommen ueber den Sprung keine Rate', () => {
  const b = C.fromHistory(projectHistory(synth(), 'TEST'), null);
  assert.deepEqual(b.splits.map((s) => [s.from, s.to]), [[2023, 2024]]);
  const eg = C.seriesOf(b, C.BY_ID.eps_growth, 'annual');
  assert.equal(eg.find((r) => r.fy === 2024).reason, 'SPLIT');
  assert.equal(C.cagr(b, C.BY_ID.eps_diluted, 2).reason, 'SPLIT');
  assert.ok(Math.abs(C.cagr(b, C.BY_ID.revenue, 2).rate - (Math.sqrt(1.5) - 1)) < 1e-12, 'Umsatz bleibt vergleichbar');
});

test('LTM-Veraenderung nur mit vier aufeinanderfolgenden Quartalen, die zur gemeldeten LTM passen', () => {
  const b = C.fromHistory(projectHistory(synth(), 'TEST'), null);
  const c = C.current(b, C.BY_ID.revenue);
  assert.equal(c.basis, 'TTM');
  assert.equal(c.v, 170);
  assert.equal(c.change, null, 'nur zwei Quartale: keine Vorjahres-LTM');
});

test('Echte Daten NVDA: volle Reihen, Quartale, LTM-Vergleich stimmt mit der Summe der Quartale', () => {
  const b = bookOf('NVDA');
  assert.equal(b.source, 'history');
  assert.ok(b.years.length >= 10 && b.quarters.length >= 8);
  const roll = C.rolling(b, 'revenue'), last = roll[roll.length - 1];
  assert.ok(Math.abs(last.v - b.base.revenue.ttm.v) / b.base.revenue.ttm.v < 0.005);
  const rev = C.current(b, C.BY_ID.revenue);
  assert.ok(rev.change && rev.change.pct > 0);
  const avail = C.catalogFor(b, { snap: C.snapshot(stock('NVDA'), null) }).filter((x) => x.available).length;
  assert.ok(avail >= 45, 'mindestens 45 Kennzahlen mit Wert: ' + avail);
  assert.ok(C.seriesOf(b, C.BY_ID.roic, 'annual').filter((r) => r.v != null).length >= 5, 'ROIC-Verlauf');
});

test('Ohne Historie: Discover-Block als Ersatz, gleiche Werte im letzten Geschaeftsjahr', () => {
  const s = stock('PLTR'), d = C.fromDiscover(s), h = bookOf('PLTR');
  assert.equal(d.source, 'discover');
  const last = (b) => C.seriesOf(b, C.BY_ID.revenue, 'annual').filter((r) => r.v != null).pop();
  assert.equal(last(d).v, last(h).v);
  assert.equal(C.fromHistory({ ...projectHistory(consumer(s.fundamentals.cik), 'PLTR'), cik: '0000000009' }, s), null, 'andere Identitaet wird nicht verwendet');
});

test('Waehrung: Berichtswaehrung je Unternehmen, Betraege im Querschnitt nur in US-Dollar', () => {
  const sap = stock('SAP');
  assert.equal(C.fromDiscover(sap).currency, 'EUR');
  assert.match(C.fmt(C.BY_ID.revenue, 3.5e10, 'EUR'), /Mrd\. €$/);
  const U = C.universe({ schema: 'vu-screener-universe-1.0.0', columns: ['s', 'vq', 'revenue', 'netMargin', 'mcap', 'sic2'],
    cols: { s: ['A', 'B'], vq: ['OK', 'NON_USD_REPORTING'], revenue: [10, 20], netMargin: [0.1, 0.2], mcap: [5e9, null], sic2: ['36', '36'] } });
  assert.equal(U.get('B').revenue, null);
  assert.equal(U.get('B').netMargin, 0.2, 'Quoten bleiben vergleichbar');
  assert.equal(U.get('B').fx, true);
});

test('Branchenvergleich und Ranglisten: Median, Rang, sichtbare Plausibilitaetsgrenzen', () => {
  const cols = { s: ['A', 'B', 'C', 'D'], vq: ['OK', 'OK', 'OK', 'OK'], sic2: ['36', '36', '36', '28'], sec: ['tech', 'tech', 'tech', 'health'],
    mcap: [3e10, 2e10, 1.5e10, 5e10], revenue: [9e9, 3e9, 1e9, 2e9], roic: [0.3, 5, 0.1, 0.2], netMargin: [0.2, 0.3, 0.1, 0.05], pe: [20, 3, 15, 30], fcfYield: [0.04, 0.5, 0.02, 0.03], fcfMargin: [0.2, 0.3, 0.1, 0.1], revCagr3: [0.1, 0.2, 4, 0.1], netCash: [1, 2, -1, 3] };
  const U = C.universe({ schema: 'vu-screener-universe-1.0.0', columns: Object.keys(cols), cols, dict: { majorGroups: { 36: 'Elektronik und Halbleiter' } } });
  const g = C.peerGroup(U, 'C', 'industry', 2);
  assert.equal(g.label, 'Elektronik und Halbleiter');
  assert.deepEqual(g.peers.map((r) => r.s), ['A', 'C'], 'groesste nach Boersenwert, eigenes Unternehmen immer dabei');
  assert.deepEqual(C.position(g.members, 'netMargin', 0.1), { median: 0.2, count: 3, rank: 3, pct: 0 });
  assert.deepEqual(C.ranking(U, 'profitabel', '10').rows.map((r) => r.s), ['A', 'D', 'C'], 'ROIC 500 % faellt unter die Grenze');
  assert.deepEqual(C.ranking(U, 'bewertung', '10').rows.map((r) => r.s), ['C', 'A', 'D'], 'KGV 3 faellt unter die Grenze');
  assert.ok(C.RANKINGS.every((r) => r.rule && r.sub));
});

test('Bewertung: ohne gepruefte Bewertung kein Verlauf; aktueller Wert zum Schlusskurs', () => {
  const b = bookOf('NVDA');
  C.METRICS.filter((m) => m.cat === 'bewertung').forEach((m) => assert.deepEqual(C.seriesOf(b, m, 'annual'), [], m.id));
  C.attachValuation(b, JSON.parse(readFileSync(new URL('quant/data/market/discover-series-long/ref_NVDA.json', root))));
  assert.ok(C.seriesOf(b, C.BY_ID.ps, 'annual').length > 5, 'nach der Pruefung: Verlauf zum GJ-Ende');
  assert.deepEqual(C.seriesOf(b, C.BY_ID.peg, 'annual'), [], 'PEG bleibt nur aktuell');
  assert.deepEqual(C.seriesOf(b, C.BY_ID.ps, 'quarterly'), [], 'kein Quartalsverlauf der Bewertung');
  const snap = C.snapshot(stock('NVDA'), null);
  assert.equal(C.current(b, C.BY_ID.pe, { snap }).v, stock('NVDA').fundamentals.valuation.pe.value);
  assert.equal(C.current(b, C.BY_ID.pb, { snap }).reason, 'UNIVERSE_MISSING');
});

test('Routen: Unteransichten im Query-Teil, Ranglisten und Branchen zweiteilig', () => {
  assert.deepEqual(M.parseRoute('#/NVDA?ansicht=kennzahl&k=roic&p=q'), { view: 'company', ticker: 'NVDA', sub: 'kennzahl', metric: 'roic', period: 'quarterly' });
  assert.deepEqual(M.parseRoute('#/rangliste/wachstum'), { view: 'ranking', id: 'wachstum' });
  assert.deepEqual(M.parseRoute('#/branche/36'), { view: 'industry', id: '36' });
  assert.equal(M.parseRoute('#/NVDA?ansicht=<x>').sub, undefined);
  assert.equal(M.parseRoute('#/branche/abc').view, 'home');
});

test('Datenquellen der Oberflaeche: nur ausgelieferte Pfade, keine SEC-Rohdaten', () => {
  const src = readFileSync(new URL('../engine/catalog.js', import.meta.url), 'utf8');
  const paths = [...new Set([...src.matchAll(/['"](\/[a-z0-9-]+\/data\/[^'"]*)['"]/g)].map((m) => m[1]))].sort();
  assert.deepEqual(paths, ['/dashboard/data/analyst_ratings.json', '/fundamental/data/history/', '/quant/data/market/discover-series/', '/screener/data/universe-US_REAL.json']);
  assert.ok(existsSync(new URL('dashboard/data/analyst_ratings.json', root)));
  assert.doesNotMatch(src, /quant\/data\/sec|quant\/data\/fundamentals/);
  const release = readFileSync(new URL('scripts/vu2/build-release.mjs', root), 'utf8');
  assert.match(release, /fundamental\/build-history\.mjs/, 'Historie wird im Release gebaut');
  assert.match(release, /screener\/build-universe\.mjs/, 'Universum wird im Release gebaut');
});

test('Scherben: Budget, shardKey aus core/identity.js, Schreiben nur nach --out', async () => {
  const out = mkdtempSync(join(tmpdir(), 'fu-history-'));
  try {
    const report = await writeHistory({ root: new URL('.', root).pathname, out, log: () => {} });
    assert.ok(report.projected > 1000 && report.bytes < 40 * 1024 * 1024);
    const shard = JSON.parse(gunzipSync(readFileSync(join(out, 'NV.json.gz'))));
    assert.equal(shard.shard, 'NV');
    assert.ok(shard.issuers.NVDA && shard.issuers.NVDA.cik === stock('NVDA').fundamentals.cik);
    assert.ok(readdirSync(out).every((n) => /^([A-Z0-9_]{1,2}\.json\.gz|status\.json|industry)$/.test(n)));
    assert.ok(readdirSync(join(out, 'industry')).every((n) => /^(sic-\d{2}|sec-[a-z]+)\.json$/.test(n)));
    const semi = JSON.parse(readFileSync(join(out, 'industry', 'sic-36.json')));
    assert.equal(semi.schema, C.INDUSTRY_SCHEMA);
    assert.ok(Object.keys(semi.metrics).every((k) => C.INDUSTRY_METRICS.includes(k)), 'nur Quoten und Verhaeltnisse, keine Betraege');
    assert.ok(semi.metrics.gross_margin.every(([fy, v, n]) => Number.isInteger(fy) && Number.isFinite(v) && n >= INDUSTRY_MIN));
    assert.equal(report.industryGroups, readdirSync(join(out, 'industry')).length);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

/* Historisches KGV: nur Jahre mit bestandener Gegenprobe. */
const peBook = (eps, shares, ni, filed) => C.fromHistory(projectHistory(synth({
  units: { eps_diluted: 'USD/shares', diluted_weighted_average_shares: 'shares', net_income: 'USD' },
  annual: {
    eps_diluted: eps.map((v, i) => row(2021 + i, 'FY', (2021 + i) + '-12-31', v, '0000000001-25-00000' + i, filed[i])),
    diluted_weighted_average_shares: shares.map((v, i) => row(2021 + i, 'FY', (2021 + i) + '-12-31', v, '0000000001-25-00000' + i, filed[i])),
    net_income: ni.map((v, i) => row(2021 + i, 'FY', (2021 + i) + '-12-31', v, '0000000001-25-00000' + i, filed[i]))
  }, quarterly: {}, ttm: {}
}), 'TEST'), null);
const longOf = (splits, points) => ({ schemaVersion: 'discover-series-long-1.0.0', priceSeriesType: 'SPLIT_ADJUSTED', dataMode: 'real', points, corporateActions: { source: 'PROVIDER_SPLIT_FACTOR', splits } });
const pts = [['2021-12-31', 10], ['2022-12-30', 12], ['2023-12-29', 15], ['2024-12-27', 20]];

test('Historisches KGV: nur Splits nach dem Meldedatum werden herausgerechnet', () => {
  // 2:1-Split am 2023-06-01. 2021 zuletzt 2022 gemeldet (vor dem Split): EPS 2,00 -> 1,00 bereinigt.
  const b = peBook([2, 1.2, 1.5, 2], [10, 20, 20, 20], [20, 24, 30, 40], ['2022-02-01', '2024-02-01', '2024-02-01', '2025-02-01']);
  const h = C.historicalPe(b, longOf([['2023-06-01', 2]], pts));
  assert.equal(h.state, 'AVAILABLE');
  const r = Object.fromEntries(h.rows.map((x) => [x.fy, x]));
  assert.equal(r[2021].eps, 1); assert.equal(r[2021].v, 10);
  assert.equal(r[2022].factor, 1, '2022 zuletzt nach dem Split gemeldet: schon bereinigt');
  assert.equal(r[2024].v, 10);
});

test('Historisches KGV: Gegenprobe, Aktienbasis, Verlust und fehlender Kurs sperren das Jahr', () => {
  // 2022: EPS passt nicht zu Gewinn ÷ Aktien; 2023: Verlust; 2024: kein Kurs innerhalb von 10 Tagen.
  const b = peBook([1, 3, -1, 2], [10, 10, 10, 10], [10, 10, -10, 20], ['2022-02-01', '2023-02-01', '2024-02-01', '2025-02-01']);
  const h = C.historicalPe(b, longOf([], pts.slice(0, 3)));
  assert.deepEqual(h.rows.map((x) => x.reason), [null, 'CHECK_FAILED', 'LOSS_FY', 'NO_PRICE']);
  // Weder EPS noch Aktien zurueckgerechnet (Sprung ×2 ohne Beleg): Gegenprobe passt, Aktienbasis sperrt.
  const nr = peBook([2, 2, 1, 1], [10, 10, 20, 20], [20, 20, 20, 20], ['2022-02-01', '2023-02-01', '2024-02-01', '2025-02-01']);
  const hn = C.historicalPe(nr, longOf([], pts));
  assert.deepEqual(hn.rows.map((x) => x.reason), [null, 'SHARE_BASIS_JUMP', 'SHARE_BASIS_JUMP', null]);
  assert.equal(C.historicalPe(b, { ...longOf([], pts), corporateActions: null }).reason, 'NO_SPLIT_EVIDENCE');
});

test('Historisches KGV echte Daten: NVDA ueber zwei Splits, PLTR-Umstellung beim Boersengang gesperrt', () => {
  const long = (t) => JSON.parse(readFileSync(new URL('quant/data/market/discover-series-long/ref_' + t + '.json', root)));
  const nv = C.historicalPe(bookOf('NVDA'), long('NVDA'));
  assert.ok(nv.rows.filter((r) => r.v != null).length >= 10);
  const fy26 = nv.rows.find((r) => r.fy === 2026);
  assert.ok(Math.abs(fy26.eps - 4.9) < 1e-9 && fy26.factor === 1, 'nach dem 10:1-Split gemeldet');
  const fy21 = nv.rows.find((r) => r.fy === 2021);
  assert.equal(fy21.factor, 10, 'FY2021 zuletzt vor dem 10:1-Split gemeldet');
  const pl = C.historicalPe(bookOf('PLTR'), long('PLTR'));
  assert.equal(pl.rows.find((r) => r.fy === 2021).reason, 'SHARE_BASIS_JUMP');
});

test('Quartale, die nicht den Jahreswert ergeben, werden nicht gezeigt; der Jahreswert bleibt', () => {
  const q = (fy, n, v) => row(fy, 'Q' + n, fy + '-' + ['03-31', '06-30', '09-30', '12-31'][n - 1], v, '0000000001-25-00000' + n, '2025-03-01');
  const ok = synth({ quarterly: { revenue: [1, 2, 3, 4].map((n) => q(2023, n, 30)), net_income: [1, 2, 3, 4].map((n) => q(2024, n, 10)) }, ttm: {} });
  // Umsatz GJ 2023: 4 × 30 = 120 = Jahreswert; Nettogewinn GJ 2024: 4 × 10 = 40 ≠ 30
  const b = C.fromHistory(projectHistory(ok, 'TEST'), null);
  assert.deepEqual(b.mismatch, { net_income: [2024] });
  assert.equal(b.base.revenue.quarterly.length, 4);
  assert.equal(b.base.net_income.quarterly.length, 0);
  assert.equal(C.seriesOf(b, C.BY_ID.net_income, 'annual').find((r) => r.fy === 2024).v, 30);
});

/* Historische Bewertung zum Geschaeftsjahresende: alles zum selben Stichtag, gepruefte Aktienbasis. */
const valBook = (over = {}) => C.fromHistory(projectHistory(synth({
  units: { revenue: 'USD', net_income: 'USD', eps_diluted: 'USD/shares', diluted_weighted_average_shares: 'shares', shares_outstanding: 'shares', stockholders_equity: 'USD', total_debt: 'USD', cash_and_equivalents: 'USD', ebitda: 'USD', free_cash_flow: 'USD', dividends_paid: 'USD' },
  annual: Object.fromEntries(Object.entries({
    revenue: [100, 120, 150], net_income: [10, 12, 15], eps_diluted: [1, 1.2, 1.5], diluted_weighted_average_shares: [10, 10, 10], shares_outstanding: [10, 10, 10],
    stockholders_equity: [50, -5, 80], total_debt: [20, 20, 20], cash_and_equivalents: [5, 5, 5], ebitda: [25, 0, 30], free_cash_flow: [8, -2, 12], dividends_paid: [3, 3, 3], ...over
  }).filter(([, v]) => v).map(([k, v]) => [k, v.map((x, i) => x == null ? null : row(2022 + i, 'FY', (2022 + i) + '-12-31', x, '0000000001-25-00000' + i, '2025-02-01')).filter(Boolean)])),
  quarterly: {}, ttm: {}
}), 'TEST'), null);
const vpts = [['2022-12-30', 10], ['2023-12-29', 12], ['2024-12-27', 15]];

test('Historische Bewertung: Boersenwert, EV und Verhaeltnisse aus Werten desselben Geschaeftsjahres', () => {
  const v = C.historicalValuation(valBook(), longOf([], vpts));
  assert.equal(v.state, 'AVAILABLE');
  const at = (id, fy) => v.series[id].find((r) => r.fy === fy);
  assert.equal(at('market_cap', 2022).v, 100, 'Kurs 10 × 10 Aktien');
  assert.equal(at('enterprise_value', 2022).v, 115, '100 + Schulden 20 − Kasse 5');
  assert.equal(at('ps', 2023).v, 1, 'Boersenwert 120 ÷ Umsatz 120');
  assert.equal(at('pb', 2023).reason, 'NEGATIVE_EQUITY');
  assert.equal(at('ev_ebitda', 2023).reason, 'NOT_POSITIVE_BASE');
  assert.equal(at('fcf_yield', 2023).v, -2 / 120, 'negative Rendite bleibt sichtbar');
  assert.equal(at('dividend_yield', 2024).v, 3 / 150);
  assert.equal(at('pe', 2024).v, 10);
});

test('Historische Bewertung: Aktienbasis, Kurs, Waehrung und fehlende Schulden sperren', () => {
  // 2023: ausstehende Aktien weichen 30 % von der verwaesserten Zahl ab (z. B. nur eine Aktiengattung)
  const a = C.historicalValuation(valBook({ shares_outstanding: [10, 7, 10] }), longOf([], vpts));
  assert.equal(a.series.ps.find((r) => r.fy === 2023).reason, 'SHARE_CHECK_FAILED');
  assert.equal(a.series.pe.find((r) => r.fy === 2023).v, 10, 'das KGV hat seine eigene Gegenprobe');
  // Kein Kurs innerhalb von 10 Tagen vor dem GJ-Ende: Jahr leer, kein heutiger Kurs
  const b = C.historicalValuation(valBook(), longOf([], vpts.slice(0, 2)));
  assert.equal(b.series.market_cap.find((r) => r.fy === 2024), undefined, 'Spanne endet beim letzten geprueften Jahr');
  assert.equal(b.years.find((x) => x.fy === 2024).reason, 'NO_PRICE');
  // Ohne Finanzschulden kein Unternehmenswert (fehlend ist nicht null)
  const c = C.historicalValuation(valBook({ total_debt: null }), longOf([], vpts));
  assert.deepEqual(c.series.ev_ebitda, []); assert.equal(c.missing.ev_ebitda, 'NO_DEBT_DATA');
  // Split nach dem Meldedatum: Aktienzahl wird wie der Gewinn je Aktie bereinigt
  const d = C.historicalValuation(valBook(), longOf([['2025-06-01', 2]], vpts));
  assert.equal(d.series.market_cap.find((r) => r.fy === 2022).v, 200, 'Kurs (heutige Basis) × 20 bereinigte Aktien');
  const eur = valBook(); eur.currency = 'EUR';
  assert.equal(C.historicalValuation(eur, longOf([], vpts)).reason, 'NON_USD_REPORTING');
});

test('Historische Bewertung echte Daten: Apple und NVIDIA plausibel, JPM ohne EV', () => {
  const long = (t) => JSON.parse(readFileSync(new URL('quant/data/market/discover-series-long/ref_' + t + '.json', root)));
  const ap = C.historicalValuation(bookOf('AAPL'), long('AAPL'));
  const mc = ap.series.market_cap.find((r) => r.fy === 2025);
  assert.ok(mc.v > 3e12 && mc.v < 4.5e12, 'Apple Ende Sept. 2025: rund 3,8 Bio. $');
  assert.ok(ap.series.ps.filter((r) => r.v != null).length >= 10);
  const nv = C.historicalValuation(bookOf('NVDA'), long('NVDA'));
  assert.ok(nv.series.ps.find((r) => r.fy === 2021).v > 10, 'ueber den 4:1- und 10:1-Split dieselbe Basis');
  const jp = C.historicalValuation(bookOf('JPM'), long('JPM'));
  assert.deepEqual(jp.series.ev_ebitda, []);
  assert.ok(jp.series.pb.filter((r) => r.v != null).length >= 8, 'Bank: KBV ja, EV nein');
});

test('Branchenmedian je Geschaeftsjahr: Mindestanzahl, Median, keine Betraege', () => {
  const m = (sic2, v) => ({ ticker: 'X', sic2, sector: 'tech', values: { net_margin: [[2024, v], [2025, v * 2]] } });
  const out = industryMedians([0.1, 0.2, 0.3, 0.4, 0.5].map((v) => m('36', v)).concat([m('28', 0.9)]));
  assert.deepEqual(out['sic-36'].metrics.net_margin, [[2024, 0.3, 5], [2025, 0.6, 5]]);
  assert.equal(out['sic-28'].metrics.net_margin, undefined, 'unter 5 Unternehmen kein Median');
  assert.equal(out['sec-tech'].members, 6);
  assert.deepEqual(C.industrySeries(out['sic-36'], 'net_margin'), { 2024: { v: 0.3, n: 5 }, 2025: { v: 0.6, n: 5 } });
  assert.equal(C.industryPath('sic-36'), '/fundamental/data/history/industry/sic-36.json');
  assert.equal(C.industryPath('../x'), null);
});

test('Vergleichsgruppe: groesste oder aehnliche Groesse, Lage ohne Wertung', () => {
  const cols = { s: ['A', 'B', 'C', 'D', 'E'], vq: ['OK', 'OK', 'OK', 'OK', 'OK'], sic2: ['36', '36', '36', '36', '36'], sec: ['tech', 'tech', 'tech', 'tech', 'tech'],
    mcap: [1e12, 5e11, 2e10, 1.8e10, 2.2e10], revenue: [1, 1, 1, 1, 1], pe: [40, 30, 20, 10, 25] };
  const U = C.universe({ schema: 'vu-screener-universe-1.0.0', columns: Object.keys(cols), cols, dict: {} });
  assert.deepEqual(C.peerGroup(U, 'C', 'industry', 3, 'groesste').peers.map((r) => r.s), ['A', 'B', 'C']);
  const g = C.peerGroup(U, 'C', 'industry', 3, 'aehnlich');
  assert.deepEqual(g.peers.map((r) => r.s), ['E', 'C', 'D'], 'naechste nach Boersenwert');
  assert.match(g.rule, /ähnlichsten/);
  assert.equal(C.positionText(C.position(g.members, 'pe', 20)), 'höher als 20 % der Gruppe');
  assert.equal(C.positionText(C.position(g.members, 'pe', 40)), 'höchster Wert der Gruppe');
});

test('Katalog: keine Kehrwert-Dubletten, Zaehlung trennt definiert, verfuegbar und Verlauf', () => {
  const ids = C.METRICS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('earnings_yield') && !ids.includes('p_fcf'), 'Kehrwerte von KGV und FCF-Rendite');
  const b = bookOf('NVDA'), snap = C.snapshot(stock('NVDA'), null), list = C.catalogFor(b, { snap });
  const k = C.catalogCounts(list);
  assert.equal(k.defined, C.METRICS.length);
  assert.equal(k.available + k.missing, k.defined);
  assert.ok(list.filter((x) => !x.available).every((x) => x.cur.v == null && !x.rows.some((r) => r.v != null)), 'fehlende Werte zaehlen nicht als verfuegbar');
});

test('Veraenderung zum Vorzeitraum: Prozent, Prozentpunkte, kein Wert ueber einen Split', () => {
  const b = bookOf('NVDA'), rows = C.seriesOf(b, C.BY_ID.revenue, 'annual');
  const c = C.stepChange(b, C.BY_ID.revenue, rows, 2026, 1, 'annual');
  assert.ok(c.pct > 0.5 && c.dir === 'up');
  const m = C.seriesOf(b, C.BY_ID.net_margin, 'annual');
  assert.ok('pp' in C.stepChange(b, C.BY_ID.net_margin, m, 2026, 1, 'annual'));
  const e = C.seriesOf(b, C.BY_ID.eps_diluted, 'annual'), sp = b.splits[0];
  if (sp) assert.equal(C.stepChange(b, C.BY_ID.eps_diluted, e, sp.to, 1, 'annual').reason, 'SPLIT');
});
