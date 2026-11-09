// V12 LISTREF: rule functions, synthetic reference build, research register (fast, no production data written).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const R = require(path.join(ROOT, 'scripts/quant/v12/listref/reflib.cjs'));
const B = require(path.join(ROOT, 'scripts/quant/v12/listref/build_reference.cjs'));
const LR = require(path.join(ROOT, 'quant/engines/research-listing-reference.cjs'));

test('symbol rule keeps common/class symbols and drops derivatives', () => {
  for (const t of ['A', 'IBM', 'BRK-B', 'MOG-A']) assert.equal(R.classifySymbol(t, 'NYSE').keep, true, t);
  assert.equal(R.classifySymbol('GOOGL', 'NASDAQ').fiveLetterKept, true);
  assert.equal(R.classifySymbol('ABCDE', 'NYSE').reason, 'FIVE_LETTER_NON_NASDAQ');
  for (const [t, why] of [['ABCDW', 'NASDAQ_SUFFIX_WARRANT'], ['ABCDU', 'NASDAQ_SUFFIX_UNIT'], ['ABCDY', 'NASDAQ_SUFFIX_ADR_SUFFIX'], ['ABCDP', 'NASDAQ_SUFFIX_PREFERRED']]) assert.equal(R.classifySymbol(t, 'NASDAQ').reason, why);
  for (const [t, why] of [['AA-P-B', 'DASH_PREFERRED'], ['AAC-U', 'DASH_UNIT'], ['AB-WS', 'DASH_WARRANT_OR_WHEN_ISSUED'], ['AB-R', 'DASH_RIGHT'], ['AB-CL', 'DASH_OTHER_SUFFIX'], ['X1', 'NON_ALPHA_OR_LONG_SYMBOL']]) assert.equal(R.classifySymbol(t, 'NYSE').reason, why, t);
});

test('ticker/name affinity levels', () => {
  assert.equal(R.affinity('WFM', 'WHOLE FOODS MARKET INC'), 3);
  assert.equal(R.affinity('MSFT', 'MICROSOFT CORP'), 3);
  assert.equal(R.affinity('INTC', 'INTEL CORP'), 3);
  assert.equal(R.affinity('AAPL', 'APPLE INC'), 0);
  assert.equal(R.affinity('XYZ', 'ACME WIDGETS INC'), 0);
  assert.ok(R.affinity('AMRI', 'ALBANY MOLECULAR RESEARCH INC') === 3);
});

test('segments: size class, float window, age buckets', () => {
  assert.equal(R.sizeClass(null), 'UNKNOWN');
  assert.equal(R.sizeClass(6e12), 'UNKNOWN');
  assert.equal(R.sizeClass(1e10), 'MEGA_LARGE');
  assert.equal(R.sizeClass(2e9), 'MID');
  assert.equal(R.sizeClass(3e8), 'SMALL');
  assert.equal(R.sizeClass(1e6), 'MICRO');
  const fl = [['2017-06-30', 1e9], ['2018-06-30', 3e9], ['2019-12-31', 9e12]];
  assert.equal(R.floatFor(fl, 2019).value, 3e9);
  assert.equal(R.floatFor(fl, 2020).flag, 'SCALE_SUSPECT');
  assert.equal(R.floatFor(fl, 2016).value, null);
  assert.equal(R.ageBucket('1990-01-02', 2010), 'GE10_CENSORED');
  assert.equal(R.ageBucket('2009-01-02', 2010), 'LT2');
  assert.equal(R.ageBucket('2004-01-02', 2010), '5_10');
});

function synthetic() {
  const tiingo = [
    // restart chain: two rows 2 days apart -> one listing, not a delisting
    { ticker: 'RST', exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', startDate: '2010-01-04', endDate: '2015-06-30' },
    { ticker: 'RST', exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', startDate: '2015-07-02', endDate: '2026-10-28' },
    // reused ticker: delisted 2012 (merger, confirmed by full text), reused 2020
    { ticker: 'WFM', exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', startDate: '2005-03-01', endDate: '2012-08-28' },
    { ticker: 'WFM', exchange: 'NYSE', assetType: 'Stock', priceCurrency: 'USD', startDate: '2020-01-02', endDate: '2026-10-28' },
    // index match without full-text confirmation -> unlinked
    { ticker: 'AHP', exchange: 'NYSE', assetType: 'Stock', priceCurrency: 'USD', startDate: '2013-11-19', endDate: '2016-03-01' },
    // frozen provider end, not in SEC map; full text + 25-NSE derive the end
    { ticker: 'FRZ', exchange: 'NYSE', assetType: 'Stock', priceCurrency: 'USD', startDate: '2018-05-01', endDate: '2026-10-28' },
    // excluded rows
    { ticker: 'WFM-WS', exchange: 'NYSE', assetType: 'Stock', priceCurrency: 'USD', startDate: '2020-01-02', endDate: '2026-10-28' },
    { ticker: 'OTCX', exchange: 'PINK', assetType: 'Stock', priceCurrency: 'USD', startDate: '2010-01-04', endDate: '2026-10-28' },
    { ticker: 'SPY', exchange: 'NYSE ARCA', assetType: 'ETF', priceCurrency: 'USD', startDate: '1993-01-29', endDate: '2026-10-28' },
  ];
  const events = [
    { form: '25-NSE', cik: '865436', date: '2012-08-28', acc: '0001354457-12-000163', name: 'WHOLE FOODS MARKET INC' },
    { form: '25-NSE', cik: '999', date: '2016-03-02', acc: '0000876661-16-000001', name: 'Alliance Holdings GP, L.P.' },
    { form: '25-NSE', cik: '777', date: '2025-02-10', acc: '0000876661-25-000077', name: 'FROZEN RIVER CORP' },
    { form: '15-12B', cik: '777', date: '2025-02-20', acc: '0000777000-25-000001', name: 'FROZEN RIVER CORP' },
  ];
  const annual = new Map([['2011:865436', ['10K']], ['2012:865436', ['10K']], ['2015:999', ['10K']], ['2016:999', ['10K']], ['2024:777', ['10K']], ['2025:777', ['10K']]]);
  const floats = new Map([['865436', [['2011-03-31', 1.2e10], ['2012-03-31', 1.5e10]]]]);
  const series = [
    { securityId: 'ref_RST', ticker: 'RST', rawFirst: '2010-01-08', rawLast: '2026-10-23', rawBars: 800, qualified: true, inFrame: true, listingId: 'tiingo:NASDAQ:RST:2015-07-02', frameFirst: '2010-01-08', frameLast: '2026-10-23', lifecycle: null,
      masterRows: [{ canonicalId: 'tiingo:NASDAQ:RST:2015-07-02', baselineMember: true }] },
    { securityId: 'ref_FRZ', ticker: 'FRZ', rawFirst: '2018-05-04', rawLast: '2025-02-07', rawBars: 350, qualified: true, inFrame: false, listingId: 'tiingo:NYSE:FRZ:2018-05-01', frameFirst: null, frameLast: null,
      lifecycle: { status: 'DELISTED_SOURCE_VERIFIED', lastTradeDate: '2025-02-07' }, masterRows: [{ canonicalId: 'tiingo:NYSE:FRZ:2018-05-01', baselineMember: true }] },
  ];
  const cikmap = { byTicker: { RST: { cik: '0000000111', exchange: 'Nasdaq' }, WFM: { cik: '0000000222', exchange: 'NYSE' } } };
  const urlConfirmWfm = B.ftsUrl('WFM', R.addDays('2012-08-28', -1095), '2012-09-27', '865436');
  const urlConfirmAhp = B.ftsUrl('AHP', '2013-11-19', '2016-03-31', '999');
  const fts = { results: { [urlConfirmWfm]: { total: 12, hits: [] }, [urlConfirmAhp]: { total: 0, hits: [] } } };
  return { tiingo, events, annual, floats, holdings: { series }, cikmap, lifecycle: { cases: [] }, identity: { cases: [] }, fts };
}

test('synthetic build: chains, reuse, confirmation, lifecycle end, coverage, completeness', () => {
  const b = B.build(synthetic());
  const byId = Object.fromEntries(b.chains.map(c => [c.id, c]));
  assert.equal(b.rows.length, 6);
  assert.equal(b.excluded.SYMBOL_DASH_WARRANT_OR_WHEN_ISSUED, 1);
  assert.equal(b.excluded.EXCHANGE_PINK, 1);
  assert.equal(b.excluded.ASSET_TYPE_ETF, 1);
  // restart chain
  const rst = byId['tiingo:NASDAQ:RST:2010-01-04'];
  assert.equal(rst.rows.length, 2);
  assert.equal(rst.ended, false);
  assert.equal(rst.link.grade, 'HIGH_CURRENT_MAP');
  assert.equal(b.reuse.adjacentRestartPairs, 1);
  assert.equal(b.reuse.reuseGapPairs, 1);
  // reused ticker: old WFM chain linked via confirmed index match, new chain via current map with another CIK
  const wOld = byId['tiingo:NASDAQ:WFM:2005-03-01'], wNew = byId['tiingo:NYSE:WFM:2020-01-02'];
  assert.equal(wOld.link.grade, 'MEDIUM_FTS_CONFIRMED');
  assert.equal(wOld.link.cik, '865436');
  assert.equal(wNew.link.cik, '222');
  assert.equal(wNew.reuseOfPrior, 'REUSE_GAP');
  // unconfirmed index match stays unlinked
  assert.equal(byId['tiingo:NYSE:AHP:2013-11-19'].link.reason, 'INDEX_MATCH_UNCONFIRMED');
  // frozen provider end cut at the V10 lifecycle last trade
  const frz = byId['tiingo:NYSE:FRZ:2018-05-01'];
  assert.equal(frz.endDate, '2025-02-07');
  assert.equal(frz.endSource, 'V10_LIFECYCLE_LAST_TRADE');
  assert.equal(frz.ended, true);
  // coverage matrix 2012: RST + old WFM active; RST has a series; WFM ends in 2012 without series
  const y12 = b.matrix['2012'].all.ALL;
  assert.deepEqual([y12.ref, y12.withSeries, y12.frameQualified, y12.ended], [2, 1, 1, 1]);
  assert.equal(b.matrix['2012'].sizeClass.MEGA_LARGE.ref, 1);
  const y25 = b.matrix['2025'].all.ALL;
  assert.equal(y25.ended, 1); assert.equal(y25.endedWithSeries, 1); assert.equal(y25.endedWithLifecycle, 1);
  // completeness: 2012 event linked; 2016 event not linked but name candidate (affinity AHP ~ ALLIANCE HOLDINGS GP)
  assert.equal(b.completeness['2012'].linkedToReferenceChain, 1);
  assert.equal(b.completeness['2016'].linkedToReferenceChain, 0);
  assert.equal(b.completeness['2016'].nameCandidateOnly, 1);
  // queries emitted for discovery of the unconfirmed AHP chain
  assert.ok(b.queries.some(q => q.kind === 'discover' && q.url.includes('%22AHP%22')));
});

test('readiness thresholds', () => {
  assert.equal(B.readiness({ ref: 100, withSeries: 96 }, 0.9), 'STUDY_READY_TRANSPARENT_GAP');
  assert.equal(B.readiness({ ref: 100, withSeries: 85 }, 0.9), 'PARTIAL');
  assert.equal(B.readiness({ ref: 100, withSeries: 99 }, 0.5), 'INSUFFICIENT');
  assert.equal(B.readiness({ ref: 20, withSeries: 20 }, 1), 'INSUFFICIENT');
  assert.equal(B.readiness({ ref: 100, withSeries: 99 }, null), 'INSUFFICIENT');
});

test('research-listing-reference loads the committed register and fails closed', () => {
  const ref = LR.createListingReference(ROOT);
  const all = ref.coverage(2020, 'all', 'ALL');
  assert.ok(all && all.ref > 1000 && all.withSeries <= all.ref);
  const gap = ref.survivorshipGap(2020);
  assert.equal(gap.missing, all.ref - all.withSeries);
  const ready = ref.readyYears('all', 'ALL', 'INSUFFICIENT');
  assert.deepEqual(ready, [...ready].sort((a, b) => a - b));
  assert.equal(ref.coverage(1890), null);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-listref-'));
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, LR.REGISTER), 'utf8'));
  const bad = JSON.parse(JSON.stringify(doc)); bad.rows[0][4] = bad.rows[0][3] + 1;
  fs.mkdirSync(path.join(tmp, path.dirname(LR.REGISTER)), { recursive: true });
  fs.writeFileSync(path.join(tmp, LR.REGISTER), JSON.stringify(bad));
  assert.throws(() => LR.createListingReference(tmp), /LISTING_REFERENCE_UNAVAILABLE/);
  assert.throws(() => LR.createListingReference(ROOT, { expectedSha256: '0'.repeat(64) }), /sha256 mismatch/);
  assert.throws(() => LR.createListingReference(path.join(tmp, 'nowhere')), /missing/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('LISTREF 1.0.3 public redaction (MAJOR 6): no provider row metadata in the repository, module fails closed', () => {
  const X = require('../../scripts/quant/v12/listref/redact.cjs');
  const key = 'k'.repeat(64);
  // synthetic full documents in the 1.0.2 shape
  const fullFetch = { schemaVersion: 'v12-listref-fetch-candidates-1.0.2', ruleVersion: '1.0.2', purpose: 'p', columns: ['ticker', 'exchange', 'startYear', 'endYear', 'cik', 'linkGrade', 'endSource'],
    countsByEndYear: { 2003: { chains: 2, linkedCik: 1 } }, potentialCoverageByYear: {}, potentialCaveat: 'c', count: 2,
    rows: [['AAA', 'NYSE', 1980, 2003, '215466', 'MEDIUM_FTS_DISCOVERED', 'DERIVED_FROM_SEC_DELISTING_FORM'], ['BBB', 'NASDAQ', 1997, 2003, null, 'UNLINKED', 'PROVIDER']] };
  const pf = X.redactFetchCandidates(fullFetch, key);
  assert.deepEqual(pf.columns, ['chainId', 'cik', 'startYearBucket', 'endYearBucket']);
  assert.ok(pf.rows.every(r => /^[0-9a-f]{16}$/.test(r[0]) && r[3] === '2000-2004'));
  assert.equal(pf.countsByEndYearBucket['2000-2004'].byEndSource.PROVIDER, 1);
  assert.ok(!JSON.stringify(pf.rows).includes('AAA'));
  const fullReg = { schemaVersion: 'v12-listref-delisting-register-1.0.2', columns: ['cik', 'eventDate', 'name', 'forms[[form,date,accession]]', 'mergerProcessIndexed', 'issuerForm25', 'exchangeForm25NSE', 'linkedChains', 'nameCandidateOnly'], count: 1,
    events: [['215466', '2003-08-13', 'X INC', [['25', '2003-08-13', '0000000000-03-000001']], false, true, false, [{ ticker: 'AAA', exchange: 'NYSE', grade: 'MEDIUM_FTS_DISCOVERED', dayDiffEndToEvent: 3, endSource: 'PROVIDER', withSeries: false, lifecycleDelisted: false }], false]] };
  const pr = X.redactDelistingRegister(fullReg, key);
  assert.equal(pr.events[0][pr.columns.indexOf('linkedChainIds')][0], pf.rows.find(r => r[1] === '215466')[0]); // joinable across the files
  assert.ok(X.assertRedacted(pr) && X.assertRedacted(pf));
  assert.throws(() => X.assertRedacted(fullReg), /NOT_REDACTED/);
  assert.throws(() => X.assertRedacted(fullFetch), /NOT_REDACTED/);
  assert.throws(() => X.chainId('short', 'A', 'B', 2000), /HASH_KEY_REQUIRED/);
  // committed public files
  const D = path.join(ROOT, 'docs/quant-recovery/v12/listref');
  assert.equal(fs.existsSync(path.join(D, 'fetch-candidates-1.0.2.json')), false);
  assert.equal(fs.existsSync(path.join(D, 'delisting-register-1.0.2.json.gz')), false);
  const fc = JSON.parse(fs.readFileSync(path.join(D, 'fetch-candidates-1.0.3.json'), 'utf8'));
  const rg = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(D, 'delisting-register-1.0.3.json.gz'))).toString('utf8'));
  assert.ok(X.assertRedacted(fc) && X.assertRedacted(rg));
  assert.equal(fc.count, 4322); assert.equal(rg.count, 12161);
  const c = LR.createFetchCandidates(ROOT);
  assert.equal(c.count, 4322);
  assert.ok(c.buckets().length > 3 && c.countsByEndYearBucket(c.buckets()[0]).chains > 0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-listref-c-'));
  fs.mkdirSync(path.join(tmp, path.dirname(LR.CANDIDATES)), { recursive: true });
  fs.writeFileSync(path.join(tmp, LR.CANDIDATES), JSON.stringify({ ...fc, columns: ['ticker', 'cik', 'startYearBucket', 'endYearBucket'] }));
  assert.throws(() => LR.createFetchCandidates(tmp), /provider row metadata/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
