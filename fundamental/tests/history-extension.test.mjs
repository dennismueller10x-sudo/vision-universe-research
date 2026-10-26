/* Fundamental: aeltere Geschaeftsjahre aus quant/data/sec/consumer-history (derselbe Erzeuger wie die Verbraucherdateien)
 * und das Datum des Jahresberichts je Geschaeftsjahr. Nichts wird geschaetzt: passt eine Historie nicht genau zur
 * Verbraucherdatei, bleibt es beim Fenster; ohne den Bericht DIESES Geschaeftsjahres gibt es kein Datum. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { projectHistory, withConsumerHistory, publicationDates, CONSUMER_HISTORY_SCHEMA } from '../../scripts/fundamental/build-history.mjs';
const require = createRequire(import.meta.url);
const C = require('../engine/catalog.js');

const row = (fy, end, v, filed, accn = '0000000001-25-000001') => [fy, 'FY', end, v, filed, accn, 0];
const source = () => ({
  schema: 'vu-consumer-fundamentals-1.0.0', dataSource: { provider: 'sec_edgar', isMock: false }, policy: 'as_of_latest', cik: '0000000001', name: 'Test', asOf: '2026-10-01',
  columns: ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived'], units: { revenue: 'USD', net_income: 'USD' },
  coverage: { annualYears: [2014, 2015, 2016] },
  annual: { revenue: [row(2014, '2014-12-31', 140, '2015-02-20'), row(2015, '2015-12-31', 150, '2016-02-20'), row(2016, '2016-12-31', 160, '2017-02-20')],
    net_income: [row(2015, '2015-12-31', 15, '2016-02-20'), row(2016, '2016-12-31', 16, '2017-02-20')] },
  quarterly: {}, ttm: {}
});
const history = (over = {}) => ({
  schema: CONSUMER_HISTORY_SCHEMA, consumerSchema: 'vu-consumer-fundamentals-1.0.0', dataSource: { provider: 'sec_edgar', isMock: false },
  cik: '0000000001', policy: 'as_of_latest', columns: ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived'],
  units: { revenue: 'USD', stockholders_equity: 'USD' }, coverage: { annualYears: [2009, 2010, 2012, 2013], bundleFirstYear: 2014 },
  annual: { revenue: [row(2009, '2009-12-31', 90, '2011-02-20'), row(2010, '2010-12-31', 100, '2011-02-20'), row(2012, '2012-12-31', 120, '2014-02-20'), row(2013, '2013-12-31', 130, '2014-02-20')],
    stockholders_equity: [row(2013, '2013-12-31', 500, '2014-02-20')] },
  ...over
});

test('Historie: aeltere Jahre vor dem Fenster, Luecke 2011 bleibt Luecke, neue Kennzahl mit eigenem Startjahr', () => {
  const merged = withConsumerHistory(source(), history());
  assert.ok(merged);
  const b = C.fromHistory(projectHistory(merged, 'TEST'), null);
  assert.deepEqual(b.years, [2009, 2010, 2012, 2013, 2014, 2015, 2016]);
  const rev = C.seriesOf(b, C.BY_ID.revenue, 'annual');
  assert.deepEqual(rev.map((r) => [r.key, r.v]), [[2009, 90], [2010, 100], [2012, 120], [2013, 130], [2014, 140], [2015, 150], [2016, 160]]);
  // Nettogewinn beginnt weiter 2015, Eigenkapital nur 2013: jede Kennzahl mit ihrem eigenen ersten Jahr
  assert.equal(C.seriesOf(b, C.BY_ID.net_income, 'annual')[0].key, 2015);
  assert.deepEqual(C.seriesOf(b, C.BY_ID.stockholders_equity, 'annual').map((r) => r.key), [2013]);
  // Herkunft je Wert bleibt erhalten
  assert.equal(rev[0].filed, '2011-02-20');
  // Das Fenster selbst ist unveraendert
  const resolved = (h) => h.annual.revenue.map(([fy, end, v, ref, d]) => [fy, end, v, h.filings[ref], d]);
  assert.deepEqual(resolved(projectHistory(source(), 'TEST')), resolved(projectHistory(merged, 'TEST')).slice(4));
});

test('Historie passt nicht zur Verbraucherdatei -> nur das Fenster', () => {
  const cases = {
    'andere CIK': history({ cik: '0000000002' }),
    'anderer Lauf (anderes erstes Fensterjahr)': history({ coverage: { annualYears: [2010], bundleFirstYear: 2013 } }),
    'andere Politik': history({ policy: 'latest_known' }),
    'Mock-Daten': history({ dataSource: { provider: 'sec_edgar', isMock: true } }),
    'Jahr im Fenster': history({ annual: { revenue: [row(2014, '2014-12-31', 1, '2015-02-20')] } }),
    'andere Einheit': history({ units: { revenue: 'EUR' } }),
    'anderes Schema': history({ schema: 'x' })
  };
  for (const [why, h] of Object.entries(cases)) {
    assert.equal(withConsumerHistory(source(), h), null, why);
    assert.deepEqual(projectHistory(source(), 'TEST', h), projectHistory(source(), 'TEST'), why);
  }
});

test('Historie mit ungueltiger Zeile verwirft die Kennzahl wie im Fenster, nicht still einen Teil', () => {
  const bad = history(); bad.annual.revenue[0] = row(2009, '2009-12-31', 90, '2009-06-01'); // gemeldet vor Periodenende
  const p = projectHistory(withConsumerHistory(source(), bad), 'TEST');
  assert.equal(p.annual.revenue, undefined);
  assert.equal(p.unavailable['annual:revenue'], 'INVALID_FACT_EVIDENCE');
});

test('Datum des Jahresberichts nur aus dem Bericht DIESES Geschaeftsjahres (nie das 10-K des Folgejahres)', () => {
  // 52/53-Wochen-Jahr wie Apple: GJ 2008 endet 27.09.2008, das naechste bekannte 10-K (25.10.2009) gehoert zu GJ 2009.
  const src = source();
  src.coverage.annualYears = [2008, 2009];
  src.annual = { revenue: [row(2008, '2008-09-27', 1, '2010-10-27', '0000000001-10-000001'), row(2009, '2009-09-26', 2, '2010-10-27', '0000000001-10-000001')] };
  const p = projectHistory(src, 'TEST');
  assert.deepEqual(publicationDates(p, ['2009-10-27']), { 2009: '2009-10-27' }, 'GJ 2008 ohne eigenes 10-K: kein Datum');
  assert.deepEqual(publicationDates(p, ['2008-11-05', '2009-10-27']), { 2008: '2008-11-05', 2009: '2009-10-27' });
  // Folgejahr nach Datum, nicht nach Beschriftung (eine falsch beschriftete Periode verschiebt die Grenze nicht)
  src.annual.revenue.push(row(2011, '2007-09-29', 0.5, '2010-10-27', '0000000001-10-000001'));
  assert.equal(publicationDates(projectHistory(src, 'TEST'), ['2008-11-05', '2009-10-27'])[2009], '2009-10-27');
});

/* Speicherform: 64 gzip-Scherben (scripts/quant/sec/consumer.py#write_history_shards); bis zum ersten Erzeugerlauf
 * werden noch Einzeldateien je CIK gelesen. */
test('Historie aus gzip-Scherben, Einzeldateien nur solange keine Scherbe da ist', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { gzipSync } = await import('node:zlib');
  const { consumerHistories, CONSUMER_HISTORY_SHARD_SCHEMA } = await import('../../scripts/fundamental/build-history.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'fu-hist-'));
  await writeFile(join(dir, 'CIK0000000002.json'), JSON.stringify({ cik: '0000000002', legacy: true }));
  let got = await consumerHistories(dir);
  assert.deepEqual([...got.keys()], ['0000000002']);
  await writeFile(join(dir, '01.json.gz'), gzipSync(JSON.stringify({ schema: CONSUMER_HISTORY_SHARD_SCHEMA, shard: '01', issuers: { '0000000001': history() } })));
  await writeFile(join(dir, '02.json.gz'), gzipSync(JSON.stringify({ schema: 'fremd', issuers: { '0000000003': {} } })));
  got = await consumerHistories(dir);
  assert.deepEqual([...got.keys()], ['0000000001']);
  assert.ok(withConsumerHistory(source(), got.get('0000000001')));
  assert.equal((await consumerHistories(join(dir, 'fehlt'))).size, 0);
});
