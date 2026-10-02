import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {classifyHolding, summarizePositions, observedIntersection, issuerHint, buildGlobalETFFitness, listingSample} from '../../scripts/market/validate-marketstack-global-etf-fitness.mjs';

const read = name => JSON.parse(readFileSync(new URL('../../reports/marketstack/' + name, import.meta.url)));
const available = {state: 'AVAILABLE_PARTIAL', actualAsOf: '2026-07-31', holdingsLines: 100, signedWeightTotalPercent: 100};
const pos = (isin, weightPercent, extras = {}) => ({valid: true, isin, weightPercent, assetCategory: 'EC', country: 'US', ...extras});

test('a 100% sum, HTTP success and large line count never prove complete holdings', () => {
  const result = classifyHolding({...available, holdingsLines: 12572}, '2026-10-02');
  assert.equal(result.classification, 'PARTIAL_CURRENT');
  assert.equal(result.completeness, 'UNVERIFIED');
  assert.equal(result.verifiedLatestPortfolio, false);
});
test('actual source date governs freshness independently of fiscal year end and retrieval', () => {
  const result = classifyHolding({...available, actualAsOf: '2024-12-31', fundFiscalYearEnd: '2026-12-31', retrievedAt: '2026-10-02'}, '2026-10-02');
  assert.equal(result.classification, 'PARTIAL_STALE');
  assert.equal(result.actualAsOf, '2024-12-31');
  assert.equal(result.ageDays, 640);
});
test('future or invalid source dates remain unknown, not current', () => {
  for (const actualAsOf of ['2026-10-03', '2026-02-30', null]) assert.equal(classifyHolding({...available, actualAsOf}, '2026-10-02').classification, 'UNKNOWN');
});
test('transport and provider failures never become empty or usable portfolios', () => {
  for (const state of ['UNAVAILABLE', 'TRANSPORT_OR_PROVIDER_UNAVAILABLE']) assert.equal(classifyHolding({...available, state}, '2026-10-02').classification, 'UNAVAILABLE');
  assert.equal(classifyHolding({...available, holdingsLines: 0}, '2026-10-02').classification, 'EMPTY');
  assert.equal(classifyHolding({...available, state: 'QUARANTINED'}, '2026-10-02').classification, 'UNKNOWN');
});
test('full holdings require separate completeness and share-class scope evidence', () => {
  assert.equal(classifyHolding({...available, fullHoldingsVerified: true}, '2026-10-02').classification, 'PARTIAL_CURRENT');
  assert.equal(classifyHolding({...available, fullHoldingsVerified: true, completeness: 'VERIFIED_FULL'}, '2026-10-02').classification, 'PARTIAL_CURRENT');
  assert.equal(classifyHolding({...available, fullHoldingsVerified: true, completeness: 'VERIFIED_FULL', shareClassPortfolioIdentityVerified: true}, '2026-10-02').classification, 'FULL_CURRENT');
});
test('freshness threshold has explicit exact boundary and validates audit parameters', () => {
  assert.equal(classifyHolding({...available, actualAsOf: '2026-06-04'}, '2026-10-02').classification, 'PARTIAL_CURRENT');
  assert.equal(classifyHolding({...available, actualAsOf: '2026-06-03'}, '2026-10-02').classification, 'PARTIAL_STALE');
  assert.throws(() => classifyHolding(available, '2026-02-30'));
  assert.throws(() => classifyHolding(available, '2026-10-02', -1));
});
test('observed signed weights, duplicates and cash are preserved without renormalization', () => {
  const result = summarizePositions([pos('A', 90), pos('A', 90), pos('D', -10, {assetCategory: 'DE'}), pos(null, null), pos('C', 5, {country: null, cashCollateral: 'Y'})]);
  assert.equal(result.signedReportedWeightTotal, 175);
  assert.equal(result.observedTop10PositiveLineWeight, 185);
  assert.equal(result.missingWeightPositions, 1);
  assert.equal(result.missingISINPositions, 1);
  assert.equal(result.fullPortfolioConcentration, null);
  assert.equal(result.fullPortfolioCountryExposure, null);
  assert.equal(result.sectorExposure, null);
  assert.equal(result.weightsNotRenormalized, true);
});
test('security intersections reject duplicate ISIN legs, derivatives, cash and unknown IDs', () => {
  const result = observedIntersection([pos('A', 10), pos('A', 1), pos('B', 2), pos('D', 3, {assetCategory: 'DE'}), pos('C', 4, {cashCollateral: 'Y'}), pos(null, 5)], [pos('A', 10), pos('B', 2), pos('D', 3), pos('C', 4)]);
  assert.equal(result.observedSharedEquityISINs, 1);
  assert.equal(result.trueOverlapPercent, null);
  assert.equal(result.fullPortfolioOverlapSupported, false);
});
test('Fidelity and Franklin/Templeton are observed family hints, not legal issuer derivations', () => {
  assert.equal(issuerHint('Fidelity US Quality Income UCITS ETF'), 'Fidelity');
  assert.equal(issuerHint('Franklin FTSE India UCITS ETF'), 'Franklin Templeton');
  assert.equal(issuerHint('Lyxor Core ETF'), 'Amundi');
  assert.equal(issuerHint('Unidentified portfolio'), null);
});

test('published global census preserves listing/security/fund distinctions and real US denominator', () => {
  const result = read('global_etf_coverage.json');
  assert.equal(result.counts.rawETFCandidateListings, 9644);
  assert.equal(result.counts.USOfficialFlagExactPrimaryMICListings, 3217);
  assert.equal(result.counts.EuropeanOfficialTypedListings, 6423);
  assert.equal(result.counts.EuropeanDistinctISINSecurityOrShareClassCandidates, 2933);
  assert.equal(result.counts.uniqueLegalFunds, null);
  assert.equal(result.counts.globalVerifiedShareClasses, null);
  assert.equal(result.counts.verifiedActivelyTradedETFs, null);
  assert.equal(result.USOfficialDirectory.knownMICETFRoleListings, 5697);
  assert.equal(result.USOfficialDirectory.officialListingsWithoutExactProviderMatch, 2480);
  assert.equal(result.counts.independentlyVerifiedUCITSFunds, 0);
  assert.equal(result.newPaidCalls, 0);
  assert.equal(result.productionActivated, false);
});
test('published US sample includes all user-requested ETFs, and preserves quarantine', () => {
  const rows = read('global_etf_coverage.json').USRepresentativeValidation;
  for (const symbol of ['SPY', 'QQQ', 'VOO', 'VTI', 'IWM', 'SCHD', 'TLT', 'GLD', 'SLV', 'ARKK', 'XLF', 'XLK', 'XLE']) assert.ok(rows.some(row => row.providerSymbol === symbol));
  assert.equal(rows.find(row => row.providerSymbol === 'XLE').identityState, 'CONFLICT');
  assert.equal(rows.find(row => row.providerSymbol === 'XLE').holdingsObservation, 'NOT_TESTED');
  assert.equal(rows.find(row => row.providerSymbol === 'SPY').priceHistoryProductFitness, 'UNSAFE');
  assert.equal(rows.find(row => row.providerSymbol === 'IWM').observedHistoryBars, 8);
  assert.equal(rows.find(row => row.providerSymbol === 'IWM').technicalProductFitness, 'BLOCKED');
});
test('identity conflict blocks price fitness even when historical quality says partial', () => {
  const listing = {listingKey: 'conflict@ARCX', providerSymbol: 'conflict', identityConflict: 'TYPE_CONFLICT', historyCoverage: 'PARTIAL'};
  const result = listingSample(listing, new Map([[listing.listingKey, {history: {uniqueBars: 1000}}]]), new Map());
  assert.equal(result.identityState, 'CONFLICT');
  assert.equal(result.priceHistoryProductFitness, 'UNSAFE');
});
test('all accepted holdings reports are classified, with US and European failures separated', () => {
  const result = read('etf_holdings_quality.json');
  assert.equal(result.reports.length, 34);
  assert.deepEqual(result.sample.classificationCounts, {UNAVAILABLE: 16, PARTIAL_STALE: 16, PARTIAL_CURRENT: 2});
  assert.deepEqual(result.sample.regionCounts, {US: 31, EUROPEAN_LISTING: 3});
  assert.equal(result.sample.fullCurrentPercent, 0);
  assert.equal(result.sample.atLeastPartialPercent, 52.9412);
  assert.equal(result.sample.verifiedCompleteCurrentShareClassPortfolios, 0);
  assert.equal(result.reports.filter(row => row.region === 'EUROPEAN_LISTING' && row.classification !== 'UNAVAILABLE').length, 0);
  for (const report of result.reports) {
    assert.equal(report.safeForCurrentPortfolioOverlap, false);
    assert.equal(report.safeForFullCountryExposure, false);
    assert.equal(report.safeForSectorExposure, false);
    assert.equal(report.safeForFullConcentration, false);
    assert.match(report.responseSHA256, /^[a-f0-9]{64}$/);
  }
});
test('real partial-position overlap diagnostics do not invent complete portfolio metrics', () => {
  const result = read('etf_holdings_quality.json');
  const vooXlf = result.observedIntersections.find(row => row.left === 'VOO' && row.right === 'XLF');
  assert.equal(vooXlf.observedSharedEquityISINs, 73);
  assert.equal(vooXlf.trueOverlapPercent, null);
  assert.equal(vooXlf.fullPortfolioOverlapSupported, false);
  assert.equal(result.features.find(row => row.feature === 'TRUE_UNDERLYING_EXPOSURE').status, 'NOT_SUPPORTED');
  assert.equal(result.features.find(row => row.feature === 'SECTOR_EXPOSURE').status, 'NOT_SUPPORTED');
});
test('metadata matrix contains 27 requested fields plus weights without semantic substitutions', () => {
  const result = read('etf_metadata_matrix.json');
  assert.equal(result.fields.length, 28);
  const row = field => result.fields.find(row => row.field === field);
  for (const field of ['TER', 'OCF', 'expense_ratio', 'AUM', 'NAV', 'tracking_difference', 'tracking_error', 'sectors']) assert.equal(row(field).combinedObservedSupport, 'UNAVAILABLE');
  for (const field of ['dividends', 'WKN', 'UCITS']) assert.notEqual(row(field).combinedObservedSupport, 'AVAILABLE');
  assert.equal(row('dividends').combinedObservedSupport, 'UNVERIFIED');
  assert.equal(row('WKN').combinedObservedSupport, 'UNVERIFIED');
  assert.equal(row('holdings').combinedObservedSupport, 'PARTIAL');
});
test('published provenance fingerprints every public and private input and exposes no source payloads', () => {
  for (const file of ['global_etf_coverage.json', 'etf_holdings_quality.json', 'etf_metadata_matrix.json']) {
    const result = read(file);
    assert.equal(result.evidenceInputs.length, 5);
    for (const input of result.evidenceInputs) {
      assert.match(input.sha256, /^[a-f0-9]{64}$/);
      if (input.role.startsWith('ACCEPTED_PR334')) assert.equal(createHash('sha256').update(readFileSync(new URL('../../reports/marketstack/' + input.file, import.meta.url))).digest('hex'), input.sha256);
      assert.equal(input.file.includes('/workspace/'), false);
    }
    assert.equal(result.providerDecision, 'DEFERRED');
    assert.equal(result.productionActivated, false);
  }
});
test('baseline mismatches and duplicate listing keys fail closed before enrichment', () => {
  assert.throws(() => buildGlobalETFFitness({audit: {counts: {}, holdingsTests: []}, identities: {listingRecords: [{listingKey: 'a'}, {listingKey: 'a'}]}, fullAudit: {counts: {}, holdingsTests: [], listings: []}}), /Duplicate/);
  assert.throws(() => buildGlobalETFFitness({audit: {counts: {n: 1}, holdingsTests: []}, identities: {listingRecords: []}, fullAudit: {counts: {n: 2}, holdingsTests: [], listings: []}}), /counts differ/);
});
