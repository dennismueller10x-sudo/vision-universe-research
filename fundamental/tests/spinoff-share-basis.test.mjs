/* Spin-off ist kein Aktiensplit (quant/config/spinoff-evidence-1.0.0.json).
 * Der Kursanbieter fuehrt Spin-offs als splitFactor (GE 1,281 GE HealthCare 04.01.2023, 1,253 GE Vernova 02.04.2024).
 * Fuer den Kurs ist das eine legitime Bereinigung und bleibt in der Reihe (ADR-002). Die historische Bewertung
 * (catalog.js#historicalValuation/historicalPe) bereinigte damit aber auch Aktienzahl und Gewinn je Aktie - und nur,
 * wenn der Wert VOR dem Ereignis gemeldet war. Eine nach dem Spin-off gemeldete Vergleichszahl stand dann unbereinigt
 * neben einem um den Faktor gesenkten Kurs: GE GJ 2023 Boersenwert 121 statt 152 Mrd $. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { projectHistory, publicationDates, annualReportDates } from '../../scripts/fundamental/build-history.mjs';

const require = createRequire(import.meta.url);
const C = require('../engine/catalog.js');
const root = new URL('../../', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL('quant/config/spinoff-evidence-1.0.0.json', root), 'utf8'));

const row = (fy, v, filed) => [fy, 'FY', fy + '-12-31', v, filed, '0000000001-25-00000' + (fy - 2020), 0];
const PUB = { 2022: '2022-12-28', 2023: '2023-12-27', 2024: '2024-12-24' };
/* GE-artig: alle Zahlen zuletzt im 10-K vom Februar 2025 gemeldet (Vergleichsspalten), also NACH dem Spin-off. */
const book = (filed = ['2025-02-01', '2025-02-01', '2025-02-01']) => {
  const annual = {};
  const vals = { revenue: [100, 120, 150], net_income: [10, 12, 15], eps_diluted: [1, 1.2, 1.5], diluted_weighted_average_shares: [10, 10, 10],
    shares_outstanding: [10, 10, 10], stockholders_equity: [50, 60, 80], total_debt: [20, 20, 20], cash_and_equivalents: [5, 5, 5] };
  for (const [k, v] of Object.entries(vals)) annual[k] = v.map((x, i) => row(2022 + i, x, filed[i]));
  const p = projectHistory({
    schema: 'vu-consumer-fundamentals-1.0.0', dataSource: { provider: 'sec_edgar', isMock: false }, policy: 'as_of_latest', cik: '0000040545', name: 'GE-artig', asOf: '2025-10-01',
    columns: ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived'],
    units: { revenue: 'USD', net_income: 'USD', eps_diluted: 'USD/shares', diluted_weighted_average_shares: 'shares', shares_outstanding: 'shares', stockholders_equity: 'USD', total_debt: 'USD', cash_and_equivalents: 'USD' },
    annual, quarterly: {}, ttm: {}
  }, 'GE');
  p.published = PUB;
  return C.fromHistory(p, null);
};
/* Rohkurse 12,53 / 15,036 vor, 15 nach dem Spin-off am 02.04.2024 (Faktor 1,253); die Reihe ist darum bereinigt. */
const F = 1.253;
const long = (securityId, factor = F) => ({
  schemaVersion: 'discover-series-long-1.0.0', priceSeriesType: 'SPLIT_ADJUSTED', dataMode: 'real', securityId,
  points: [['2022-12-30', 12.53 / factor], ['2023-12-29', 15.036 / factor], ['2024-12-27', 15]],
  corporateActions: { source: 'PROVIDER_SPLIT_FACTOR', splits: [['2024-04-02', factor]] }
});
const at = (v, id, fy) => v.series[id].find((r) => r.fy === fy);
const close = (a, b) => Math.abs(a / b - 1) < 1e-9;

test('Belegter Spin-off: Boersenwert = Rohkurs x gemeldete Aktien, KGV = Rohkurs / gemeldeter Gewinn je Aktie', () => {
  const v = C.historicalValuation(book(), long('ref_GE'));
  assert.equal(v.state, 'AVAILABLE');
  assert.ok(close(at(v, 'market_cap', 2022).v, 125.3), 'GJ 2022: 12,53 x 10 (vorher 100 = bereinigter Kurs x unbereinigte Aktien)');
  assert.ok(close(at(v, 'market_cap', 2023).v, 150.36), 'GJ 2023: 15,036 x 10');
  assert.ok(close(at(v, 'market_cap', 2024).v, 150), 'nach dem Spin-off unveraendert');
  assert.ok(close(at(v, 'pe', 2023).v, 15.036 / 1.2), 'KGV aus Rohkurs und gemeldetem Gewinn je Aktie');
  assert.ok(close(at(v, 'pb', 2022).v, 125.3 / 50));
  assert.deepEqual(v.spinoffs, [['2024-04-02', F]]);
  const y = v.years.find((x) => x.fy === 2022);
  assert.equal(y.sharesFactor, 1, 'die Aktienzahl wird um einen Spin-off nie bereinigt');
  assert.ok(close(y.spinoffFactor, F));
});

test('Vor dem Spin-off gemeldete Zahlen: derselbe Boersenwert (Basis unabhaengig vom Meldedatum)', () => {
  const v = C.historicalValuation(book(['2023-02-01', '2024-02-01', '2025-02-01']), long('ref_GE'));
  assert.ok(close(at(v, 'market_cap', 2022).v, 125.3));
  assert.ok(close(at(v, 'pe', 2022).v, 12.53 / 1));
});

test('Nur belegte Faktoren: anderes Wertpapier oder abweichender Faktor -> Verhalten wie bisher (Split-Regel)', () => {
  const fremd = C.historicalValuation(book(), long('ref_XYZ'));
  assert.ok(close(at(fremd, 'market_cap', 2022).v, 100), 'kein Beleg fuer ref_XYZ: unveraendert');
  assert.deepEqual(fremd.spinoffs, []);
  const anders = C.historicalValuation(book(), long('ref_GE', 2));
  assert.ok(close(at(anders, 'market_cap', 2022).v, 12.53 / 2 * 10), 'Faktor 2 ist nicht der belegte 1,253: als Split behandelt');
});

test('Echter Split bleibt Split: Aktienzahl nach dem Meldedatum bereinigt', () => {
  const real = { ...long('ref_GE', 1), corporateActions: { source: 'PROVIDER_SPLIT_FACTOR', splits: [['2025-06-01', 2]] }, points: [['2022-12-30', 10], ['2023-12-29', 12], ['2024-12-27', 15]] };
  const v = C.historicalValuation(book(), real);
  assert.equal(at(v, 'market_cap', 2022).v, 200, 'Kurs (heutige Basis) x 20 bereinigte Aktien');
});

test('Die Liste in catalog.js ist eine Abschrift der Belegdatei (SEC-Quelle je Eintrag)', () => {
  assert.equal(evidence.schemaVersion, 'spinoff-evidence-1.0.0');
  assert.deepEqual(C.SPINOFF_FACTORS, evidence.records.map((r) => [r.securityId, r.date, r.factor]));
  assert.equal(C.SPINOFF_EVIDENCE_VERSION, evidence.schemaVersion);
  for (const r of evidence.records) {
    assert.match(r.securityId, /^ref_[A-Z]+$/);
    assert.ok(r.sources.length && r.sources.every((s) => /^https:\/\/www\.sec\.gov\/Archives\//.test(s.url) && /^[0-9a-f]{64}$/.test(s.sha256) && s.quote), r.securityId + ' ohne SEC-Beleg');
  }
  /* Die Kursreihe selbst bleibt bereinigt (ADR-002): return-series.js wird nicht beruehrt. */
  assert.doesNotMatch(readFileSync(new URL('quant/engines/return-series.js', root), 'utf8'), /spinoff/i);
});

test('Echte Daten GE: GJ 2021 und 2023 auf Rohbasis (Rohkurs x gemeldete Aktien)', async () => {
  const tenK = await annualReportDates(new URL('.', root).pathname);
  const stock = JSON.parse(readFileSync(new URL('discover/data/stocks/US_REAL/GE.json', root), 'utf8'));
  const p = projectHistory(JSON.parse(readFileSync(new URL('quant/data/sec/consumer/CIK' + stock.fundamentals.cik + '.json', root), 'utf8')), 'GE');
  p.published = publicationDates(p, tenK.get(stock.fundamentals.cik));
  const ge = JSON.parse(readFileSync(new URL('quant/data/market/discover-series-long/ref_GE.json', root), 'utf8'));
  const v = C.historicalValuation(C.fromHistory(p, stock), ge);
  const y = (fy) => v.years.find((x) => x.fy === fy);
  /* Gemeldet 1,099 Mrd (GJ 2021) bzw. 1,088 Mrd Aktien (GJ 2023), beide Zahlen zuletzt NACH einem Spin-off gemeldet.
     Rohkurs Mitte Feb. 2022 rund 93 $, Mitte Feb. 2024 rund 140 $ -> rund 102 bzw. 152 Mrd $ (vorher 79,5 bzw. 121 Mrd $). */
  assert.equal(y(2021).sharesFactor, 1);
  assert.ok(y(2021).mcap > 95e9 && y(2021).mcap < 112e9, 'GE GJ 2021: ' + y(2021).mcap);
  assert.ok(y(2023).mcap > 140e9 && y(2023).mcap < 170e9, 'GE GJ 2023: ' + y(2023).mcap);
  /* Die Kursreihe selbst ist unveraendert spin-off-bereinigt; nur die Bewertung fuehrt den Kurs auf die Aktienbasis zurueck. */
  const pt = C.closeAfter(ge, y(2023).pubDate);
  assert.ok(Math.abs(y(2023).price / (pt[1] * 1.253) - 1) < 1e-9);
});
