/* Fundamental 2.0: Kennzahlenkatalog, Reihen, Querschnitt und Historien-Projektion.
 * Nichts wird geschaetzt: fehlende Eingaben bleiben Luecken, Betraege anderer Waehrungen werden nicht verglichen. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { projectHistory, writeHistory, SCHEMA } from '../../scripts/fundamental/build-history.mjs';
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

test('Bewertung nur zum aktuellen Kurs: kein historischer Verlauf', () => {
  const b = bookOf('NVDA');
  C.METRICS.filter((m) => m.cat === 'bewertung').forEach((m) => assert.deepEqual(C.seriesOf(b, m, 'annual'), [], m.id));
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
    assert.ok(readdirSync(out).every((n) => /^([A-Z0-9_]{1,2}\.json\.gz|status\.json)$/.test(n)));
  } finally { rmSync(out, { recursive: true, force: true }); }
});
