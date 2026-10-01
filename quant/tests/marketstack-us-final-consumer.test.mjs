import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeUSConsumer } from '../../scripts/market/finalize-marketstack-us-consumer.mjs';
const row = (symbol, extra = {}) => ({ securityId: 'ref_' + symbol, ticker: symbol, providerSymbol: symbol, consumer: true,
  expectedMics: ['XNYS'], instrumentType: 'EQUITY_COMMON', activeStatus: 'ACTIVE', directoryStatus: 'DIRECTORY_MATCHED',
  latestObservation: { status: 'VALID_LATEST', validLatest: true }, ...extra });
const inputs = rows => [{ baselineSource: { sha256: 'base' }, asOfDate: '2026-10-01', rows },
  { protectedBaselineSource: { sha256: 'base' }, generatedAt: 'fixed', rows: [], currentCommonEquityGaps: [] },
  { protectedBaselineSource: { sha256: 'base' }, rows: [] },
  { sources: ['nasdaqlisted.txt','otherlisted.txt'].map(f => ({ status: 'FETCHED', url: 'https://www.nasdaqtrader.com/dynamic/SymDir/' + f, footer: 'File Creation Time: 1001202611:01||||' })),
    rows: rows.map(r => ({ 'ACT Symbol': r.ticker, 'Security Name': r.ticker + ' Common Stock', Exchange: 'N', 'ETF': 'N', 'Test Issue': 'N', _source: 'otherlisted.txt' })) }];
test('protected denominator stays stable while current common-class excludes officially flagged ETFs and explicit ADRs', () => {
  const args = inputs([row('A'),row('F'),row('ADR')]); args[3].rows[1].ETF = 'Y'; args[3].rows[2]['Security Name'] = 'Foreign - American Depositary Shares representing ordinary shares';
  const result = finalizeUSConsumer(...args); assert.equal(result.protectedConsumerCoverage.denominator, 3);
  assert.equal(result.currentCommonClassCoverage.ACTIVE_CONSUMER_COMMON_STOCKS_TOTAL, null); assert.equal(result.currentCommonClassCoverage.verifiedCurrentActiveCommonClassLowerBound, 1);
  assert.equal(result.currentCommonClassCoverage.MARKETSTACK_VALID_LATEST_COVERED, 1); assert.equal(result.rows[2].current_role, 'ADR');
});
test('wrong current MIC cannot borrow a valid previous-venue quote to claim current common listing coverage', () => {
  const args = inputs([row('A')]); args[3].rows[0].Exchange = 'A'; const result = finalizeUSConsumer(...args);
  assert.equal(result.protectedConsumerCoverage.validLatestCovered, 1);
  assert.equal(result.currentCommonClassCoverage.MARKETSTACK_IDENTITY_COVERED, 0);
  assert.equal(result.currentCommonClassCoverage.MARKETSTACK_VALID_LATEST_COVERED, 0);
  assert.equal(result.relevantCurrentCommonStockGaps.length, 1);
  assert.equal(result.relevantCurrentCommonStockGaps[0].gap_classification, 'COVERED_VALID_LATEST');
  assert.equal(result.relevantCurrentCommonStockGaps[0].current_common_gap_classification, 'WRONG_CURRENT_VENUE');
  assert.equal(result.currentCommonClassCoverage.missingCurrentListingByGapClassification.WRONG_CURRENT_VENUE, 1);
});
test('empty bounded venue route does not produce a zero or confirmed globally unsupported stock count', () => {
  const args = inputs([row('A', { directoryStatus: 'DIRECTORY_ABSENT_COMPLETE', latestObservation: null })]);
  const result = finalizeUSConsumer(...args); assert.equal(result.currentCommonClassCoverage.GENUINELY_UNSUPPORTED_ACTIVE_COMMON_STOCKS, null);
  assert.equal(result.currentCommonClassCoverage.confirmedGloballyUnsupported, 0); assert.equal(result.allProtectedConsumerGaps[0].gap_classification, 'MISSING_VERIFIED_LISTING_IDENTITY');
});
test('named price gaps preserve stale vs identity-covered-without-valid-candle separation', () => {
  const args = inputs([row('S', { latestObservation: { status: 'STALE_LATEST_ACTIVE', validLatest: false } }),
    row('I', { latestObservation: { status: 'INVALID_OHLC', validLatest: false } })]); const result = finalizeUSConsumer(...args);
  assert.equal(result.protectedConsumerCoverage.byGapClassification.STALE_LATEST_PRICE, 1);
  assert.equal(result.protectedConsumerCoverage.byGapClassification.RESOLVED_OR_DIRECTORY_IDENTITY_NO_VALID_LATEST_PRICE, 1);
  assert.equal(result.currentCommonClassCoverage.identityCoveredButNoValidLatest, 2);
});
test('source mismatch fails closed and supplied generated timestamp yields deterministic row/count replay', () => {
  const args = inputs([row('A')]); const options = { generatedAt: '2026-10-01T00:00:00Z' };
  assert.deepEqual(finalizeUSConsumer(...args, [], [], options), finalizeUSConsumer(...args, [], [], options));
  args[1].protectedBaselineSource.sha256 = 'wrong'; assert.throws(() => finalizeUSConsumer(...args), /Matching protected/);
});


test('explicit common shares count while plural ADRs/depository shares and senior notes stay outside common-class subset', () => {
  const args = inputs([row('C'), row('ADR'), row('D'), row('N')]);
  args[3].rows[0]['Security Name'] = 'Company Common Shares';
  args[3].rows[1]['Security Name'] = 'Company ADRs representing one common share';
  args[3].rows[2]['Security Name'] = 'Company American Depository Shares';
  args[3].rows[3]['Security Name'] = 'Company 9.75% Senior Notes due 2030';
  const out = finalizeUSConsumer(...args);
  assert.deepEqual(out.rows.map(r => r.current_role), ['EQUITY_COMMON', 'ADR', 'ADR', 'BOND']);
  assert.equal(out.currentCommonClassCoverage.verifiedCurrentActiveCommonClassLowerBound, 1);
});

test('beneficial-interest/fund ambiguity stays outside common-company proof subset without inventing CEF or removing legacy membership',()=>{
 const args=inputs([row('BTX'),row('BANK'),row('REIT'),row('FUNDAMENTAL'),row('FUNDING')]);args[3].rows[0]['Security Name']='BlackRock Technology Term Trust Common Shares of Beneficial Interest';
 args[3].rows[1]['Security Name']='Trust Bank Common Stock';args[3].rows[2]['Security Name']='Issuer REIT Common Shares of Beneficial Interest';
 args[3].rows[3]['Security Name']='Fundamental Software Common Stock';args[3].rows[4]['Security Name']='Funding Company Common Shares';
 const out=finalizeUSConsumer(...args);assert.equal(out.rows[0].current_role,'UNVERIFIED_FUND_OR_BENEFICIAL_INTEREST_COMPANY_ROLE');
 assert.equal(out.rows[1].current_role,'EQUITY_COMMON');assert.equal(out.rows[2].current_role,'EQUITY_COMMON');
 assert.equal(out.rows[3].current_role,'EQUITY_COMMON');assert.equal(out.rows[4].current_role,'EQUITY_COMMON');
 assert.equal(out.protectedConsumerCoverage.denominator,5);assert.equal(out.currentCommonClassCoverage.verifiedCurrentActiveCommonClassLowerBound,4);
});
