import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInstrument, usSymbolAliases, assessUSIdentity, extractUSMetadata, classifyUSGaps, buildUSGapRequestPlan,
  extractUSLatestDiagnostics, extractUSMetadataOutcomes } from '../../scripts/market/classify-marketstack-us-gaps.mjs';

const baseline = (id, extra = {}) => ({ securityId: id, ticker: id, providerSymbol: id, exchange: 'NYSE', expectedMics: ['XNYS'],
  instrumentType: 'EQUITY_COMMON', activeStatus: 'ACTIVE', productMember: true, consumer: true,
  directoryStatus: 'DIRECTORY_ABSENT_COMPLETE', otherVenueCandidates: [], symbolVariantCandidates: [], latestObservation: null, ...extra });
const benchmark = rows => ({ rows, totals: { TOTAL_MARKETSTACK_MATCHED: rows.filter(r => r.directoryStatus === 'DIRECTORY_MATCHED').length },
  baselineSource: { sha256: 'protected' }, asOfDate: '2026-10-01' });

test('explicit ETF evidence flags baseline type without turning trust/bancshares into ETFs', () => {
  const etf = classifyInstrument('EQUITY_COMMON', [{ name: 'Columbia AAA CLO ETF', source: 'TIINGO_METADATA' }]);
  assert.equal(etf.investigativeType, 'ETF'); assert.equal(etf.status, 'BASELINE_TYPE_CONFLICT');
  assert.equal(etf.productionClassificationChanged, false);
  assert.equal(classifyInstrument('EQUITY_COMMON', [{ name: 'Community Bancshares Trust', source: 'SEC' }]).investigativeType, 'EQUITY_COMMON');
  assert.equal(classifyInstrument('EQUITY_COMMON', [{ name: '2X Long ABC Daily', source: 'TIINGO' }]).status, 'FUND_LIKE_NAME_REQUIRES_TYPE_VERIFICATION');
  assert.equal(classifyInstrument('PREFERRED', [{ name: 'Income ETF', source: 'TIINGO' }], [{ value: 'Preferred', source: 'API' }]).investigativeType, 'CONFLICT');
});

test('alias generation preserves preferred series and common share classes', () => {
  assert.deepEqual(usSymbolAliases('BRK-B', 'EQUITY_COMMON').map(r => r.symbol), ['BRK.B']);
  assert.deepEqual(usSymbolAliases('BAC-P-N', 'PREFERRED').map(r => r.symbol), ['BAC.P.N', 'BAC-PN']);
  assert.ok(!usSymbolAliases('BAC-P-N', 'PREFERRED').some(r => ['BAC', 'BAC-N', 'BAC-P'].includes(r.symbol)));
});

test('shared issuer, common name and SEC venue cannot merge share classes or resolve MIC mismatch', () => {
  const b = { ...baseline('BRK-A'), cik: '1067983' };
  assert.equal(assessUSIdentity(b, { symbol: 'BRK-B', mic: 'XNYS', cik: '0001067983', name: 'Berkshire Hathaway' }).status, 'ISSUER_ONLY_NOT_SECURITY_EQUIVALENCE');
  assert.equal(assessUSIdentity(b, { symbol: 'BRK-A', mic: 'XNAS', cik: '0001067983' }).accepted, false);
  assert.equal(assessUSIdentity(b, { symbol: 'BRK-A', mic: 'XNYS', name: 'Berkshire Hathaway' }).accepted, false);
  assert.equal(assessUSIdentity(b, { symbol: 'BRK-A', mic: 'XNYS', cik: '0001067983' }).accepted, true);
  assert.equal(assessUSIdentity({ ...b, shareClass: 'A' }, { symbol: 'BRK-A', mic: 'XNYS', cik: '0001067983', shareClass: 'B' }).accepted, false);
});

test('security identifier can resolve an alias at expected venue but alternative listing remains distinct', () => {
  const b = { ...baseline('BRK-B'), isin: 'US0846707026', instrumentType: 'EQUITY_COMMON' };
  assert.equal(assessUSIdentity(b, { symbol: 'BRK.B', mic: 'XNYS', isin: 'US0846707026' }).accepted, true);
  assert.equal(assessUSIdentity(b, { symbol: 'BRK.B', mic: 'XNAS', isin: 'US0846707026' }).status, 'IDENTIFIED_ALTERNATE_VENUE_NOT_BASELINE_LISTING');
  assert.equal(assessUSIdentity(b, { symbol: 'BRK.B', mic: 'XNYS', isin: 'US0846701086' }).status, 'REJECTED_SECURITY_IDENTIFIER_CONFLICT');
  assert.equal(assessUSIdentity(b, { symbol: 'BRK-B', mic: 'XNYS', isin: 'US0846707026', assetType: 'ETF' }).accepted, false);
  assert.equal(assessUSIdentity({ ...b, cik: '1067983' }, { symbol: 'BRK.B', mic: 'XNYS', isin: 'US0846707026', cik: '999' }).status, 'REJECTED_ISSUER_IDENTIFIER_CONFLICT');
  assert.equal(assessUSIdentity({ ...b, isin: 'US0846707025' }, { symbol: 'BRK.B', mic: 'XNYS', isin: 'US0846707025' }).accepted, false);
});

test('all unmatched and flags receive independent type, activity, identity and gap states with no fake missing claim', () => {
  const rows = [baseline('COMMON'), baseline('FUND'), baseline('OLD', { activeStatus: 'INACTIVE' }),
    baseline('OTHER', { directoryStatus: 'EXCHANGE_MISMATCH', otherVenueCandidates: [{ symbol: 'OTHER', mic: 'XNAS' }] }),
    baseline('FLAG', { directoryStatus: 'DIRECTORY_MATCHED', latestObservation: { status: 'CURRENCY_MISMATCH', validLatest: false,
      expectedCurrency: 'USD', reportedCurrency: 'ARS', reportedTradingDate: '2026-09-30', ageDays: 1 } })];
  const r = classifyUSGaps({ benchmark: benchmark(rows), names: [{ securityId: 'FUND', companyName: 'New Fund ETF', nameSource: 'TIINGO_METADATA' }],
    secMap: { byTicker: { OTHER: { cik: '123', exchange: 'Nasdaq', name: 'Other Corp' } } } });
  assert.equal(r.unmatched.rows.length, 4); assert.equal(r.quality.rows.length, 1);
  assert.equal(r.unmatched.totals.activeConsumerEquityCandidatesUnresolved, 2);
  assert.equal(r.unmatched.totals.confirmedGenuinelyMissing, 0);
  assert.equal(r.resolved.totals.verifiedIdentityResolved, 0);
  assert.equal(r.resolved.totals.secVenueCorroboratedCandidates, 1);
  assert.equal(r.unmatched.rows.find(r => r.ticker === 'OLD').finalGapStatus, 'RETAINED_INACTIVE_NOT_PROVEN_DELISTED');
  for (const row of r.unmatched.rows) assert.ok(row.activeStatus && row.instrumentClassification && row.identityResolution && row.finalGapStatus);
});

test('private diagnostic reasons export no numeric price values or raw private payload', () => {
  const b = benchmark([baseline('BAD', { directoryStatus: 'DIRECTORY_MATCHED', latestObservation: { status: 'INVALID_OHLC', validLatest: false,
    reportedCurrency: 'USD', reportedTradingDate: '2026-09-30' } })]);
  const r = classifyUSGaps({ benchmark: b, latest: { baselineSource: { sha256: 'protected' }, baselineTotal: 1,
    rows: [{ securityId: 'BAD', providerSymbol: 'BAD', mic: 'XNYS', status: 'INVALID_OHLC',
      observation: { open: 998877, close: 998879, high: 998870, low: 998860, volume: 11223344, secret: 'do-not-publish' } }] } });
  assert.ok(r.quality.rows[0].latestQuality.structuralReasonCodes.includes('OPEN_OR_CLOSE_ABOVE_HIGH'));
  const publicText = JSON.stringify(r); for (const value of ['998877', '998879', '998870', '11223344', 'do-not-publish', '"open":', '"volume":', '"observation":'])
    assert.ok(!publicText.includes(value), value);
});

test('metadata extraction accepts directory/ticker shapes, excludes bars and failed/private errors', () => {
  const records = extractUSMetadata([{ run: { runId: '123' }, endpoints: [
    { endpoint: 'exchanges/XNAS/tickers', data: [{ symbol: 'AA', name: 'Alpha', has_eod: true, secret: 'private' }] },
    { endpoint: 'tickers/AA', data: { symbol: 'AA', stock_exchange: { mic: 'XNAS' }, cik: '123', isin: 'US0846707026', item_type: 'ETF', close: 445566 } },
    { endpoint: 'eod', data: [{ symbol: 'AA', exchange: 'XNAS', close: 778899 }] },
    { endpoint: 'tickers/BB', ok: false, data: { symbol: 'BB', stock_exchange: { mic: 'XNAS' }, message: 'private-error' } }
  ] }]);
  assert.equal(records.length, 2); assert.equal(records[1].cik, '0000000123');
  assert.equal(records[1].assetType, 'ETF');
  assert.ok(!JSON.stringify(records).includes('445566')); assert.ok(!JSON.stringify(records).includes('private'));
});

test('conflicting repeated metadata cannot silently replace previous identity evidence', () => {
  const r = classifyUSGaps({ benchmark: benchmark([baseline('A')]), secMap: { byTicker: { A: { cik: '123', exchange: 'NYSE' } } },
    providerMetadata: [{ symbol: 'A', mic: 'XNYS', cik: '0000000123', assetType: 'Stock', source: { kind: 'TICKER_METADATA', runId: 1 } },
      { symbol: 'A', mic: 'XNYS', cik: '0000000999', assetType: 'Stock', source: { kind: 'TICKER_METADATA', runId: 2 } }] });
  const row = r.resolved.rows[0]; assert.equal(row.acceptedIdentity, null);
  assert.equal(row.candidates[0].metadataObservations, 2);
  assert.ok(row.candidates[0].metadataConflictFields.includes('cik'));
  assert.equal(row.candidates[0].identityAccepted, false);
});

test('duplicate baseline and mismatched private reference are rejected', () => {
  assert.throws(() => classifyUSGaps({ benchmark: benchmark([baseline('A'), baseline('A')]) }), /Unique/);
  assert.throws(() => classifyUSGaps({ benchmark: benchmark([baseline('A')]), latest: { baselineSource: { sha256: 'wrong' }, baselineTotal: 1, rows: [] } }), /baseline/);
});

test('legacy ID collision selects only an explicit expected venue and exposes unresolved collisions', () => {
  const instruments = [{ instrumentId: 'old', symbol: 'A', mic: 'XNAS', legacyIds: ['A'], cik: '123' },
    { instrumentId: 'other', symbol: 'A', mic: 'XNYS', legacyIds: ['A'], cik: '456' }];
  const r = classifyUSGaps({ benchmark: benchmark([baseline('A')]), instruments });
  assert.equal(r.unmatched.rows[0].identifiers.cik, '0000000456');
  assert.equal(r.unmatched.rows[0].identifiers.canonicalSelection, 'UNIQUE_EXPECTED_MIC');
  assert.equal(r.unmatched.rows[0].identifiers.canonicalCandidates.length, 2);
  const ambiguous = classifyUSGaps({ benchmark: benchmark([baseline('A', { expectedMics: ['XASE'] })]), instruments });
  assert.equal(ambiguous.unmatched.rows[0].identifiers.canonicalIdentityAmbiguous, true);
  assert.equal(ambiguous.unmatched.rows[0].acceptedIdentity, null);
});

test('targeted request planning prioritizes equities and never treats alternate venue as approved', () => {
  const result = classifyUSGaps({ benchmark: benchmark([baseline('ETF'), baseline('REAL', { otherVenueCandidates: [{ symbol: 'REAL', mic: 'XNAS' }] })]),
    names: [{ securityId: 'ETF', companyName: 'Example ETF', nameSource: 'TIINGO_METADATA' }] });
  const p = buildUSGapRequestPlan(result);
  assert.equal(p.unmatchedRecords, 2); assert.equal(p.unmatchedLookupPlan[0].symbol, 'REAL');
  assert.equal(p.unmatchedLookupPlan[1].priority, 3);
  assert.equal(p.unmatchedLookupPlan[0].priceLookup.identityReviewRequiredBeforeConsumerUse, true);
  assert.deepEqual(p.unmatchedLookupPlan[0].priceLookup.candidateExchanges, ['XNYS', 'XNAS']);
  assert.equal(p.conservativeMetadataRequestUpperBoundBeforeRetriesAndAliases, 2);
});

test('currency rejection retains independent price-row ETF conflict without reclassifying equity', () => {
  const b = benchmark([baseline('A', { directoryStatus: 'DIRECTORY_MATCHED', latestObservation: { status: 'CURRENCY_MISMATCH',
    validLatest: false, expectedCurrency: 'USD', reportedCurrency: 'EUR' } })]);
  const r = classifyUSGaps({ benchmark: b, latest: { baselineSource: { sha256: 'protected' }, baselineTotal: 1,
    rows: [{ securityId: 'A', providerSymbol: 'A', mic: 'XNYS', status: 'CURRENCY_MISMATCH', observation: { assetType: 'ETF' } }] } });
  assert.equal(r.quality.totals.priceRowAssetTypeConflicts, 1);
  assert.equal(r.quality.rows[0].latestQuality.originalStatus, 'CURRENCY_MISMATCH');
  assert.equal(r.quality.rows[0].instrumentClassification.investigativeType, 'EQUITY_COMMON');
  assert.equal(r.quality.rows[0].latestQuality.priceRowTypeSupportedByIndependentMetadata, null);
});

test('official class delisting explains stale flag while preserving original rejection and active baseline', () => {
  const b = benchmark([baseline('OLD', { directoryStatus: 'DIRECTORY_MATCHED', latestObservation: { status: 'STALE_LATEST_ACTIVE', validLatest: false,
    reportedCurrency: 'USD', reportedTradingDate: '2026-09-01' } })]);
  const evidence = { protectedBaselineSource: { sha256: 'protected' }, rows: [{ securityId: 'OLD', ticker: 'OLD',
    baselineInstrumentType: 'EQUITY_COMMON', officialSecurityClassDelistingFiled: true, officialBaselineListingRemovalFiled: true, open: 7654321,
    observation: { close: 9876543 }, secret: 'untrusted-extra-field' }] };
  const r = classifyUSGaps({ benchmark: b, secEvidence: evidence });
  assert.equal(r.quality.rows[0].activeStatus.baseline, 'ACTIVE');
  assert.equal(r.quality.rows[0].latestQuality.originalStatus, 'STALE_LATEST_ACTIVE');
  assert.equal(r.quality.rows[0].latestQuality.hypothesis, 'FINAL_HISTORICAL_PRICE_EXPECTED_OFFICIAL_SECURITY_CLASS_DELISTING_FILED');
  assert.equal(r.quality.totals.independentlyCorrected, 0);
  assert.ok(!JSON.stringify(r).includes('7654321')); assert.ok(!JSON.stringify(r).includes('untrusted-extra-field'));
  assert.throws(() => classifyUSGaps({ benchmark: b, secEvidence: { ...evidence, protectedBaselineSource: { sha256: 'wrong' } } }), /baseline/);
});

test('preferred alias requires official class token, matching MIC, SEC exact alias issuer and valid ISIN', () => {
  const b = benchmark([baseline('ALL-P-I', { instrumentType: 'PREFERRED' })]);
  const listingEvidence = { protectedBaselineSource: { sha256: 'protected' }, rows: [{ securityId: 'ALL-P-I', ticker: 'ALL-P-I',
    preferredClassTokenVerified: true, providerAlias: 'ALL-PI', currentListing: { mic: 'XNYS', symbol: 'ALL$I', role: 'PREFERRED' },
    close: 1122334455 }] };
  const input = { benchmark: b, listingEvidence, secMap: { byTicker: { 'ALL-PI': { cik: '899051', exchange: 'NYSE' } } },
    providerMetadata: [{ symbol: 'ALL-PI', mic: 'XNYS', cik: '0000899051', isin: 'US0200028126', assetType: 'EQUITY', source: {} }] };
  const r = classifyUSGaps(input); assert.equal(r.resolved.totals.verifiedIdentityResolved, 1);
  assert.equal(r.resolved.rows[0].acceptedIdentity.identityBasis, 'OFFICIAL_PREFERRED_CLASS_TOKEN_MIC_SEC_SYMBOL_CIK');
  assert.ok(!JSON.stringify(r).includes('1122334455'));
  assert.equal(classifyUSGaps({ ...input, secMap: { byTicker: { 'ALL-PI': { cik: '999' } } } }).resolved.totals.verifiedIdentityResolved, 0);
});

test('independent listing evidence cannot override contradictory provider share class', () => {
  const r = classifyUSGaps({ benchmark: benchmark([baseline('A')]), instruments: [{ instrumentId: 'i', masterMemberId: 'A', mic: 'XNYS', cik: '123', shareClass: 'A' }],
    listingEvidence: { protectedBaselineSource: { sha256: 'protected' }, rows: [{ securityId: 'A', currentListing: { mic: 'XNYS', role: 'EQUITY_COMMON' } }] },
    providerMetadata: [{ symbol: 'A', mic: 'XNYS', cik: '0000000123', shareClass: 'B', isin: 'US0846707026', source: {} }] });
  assert.equal(r.resolved.totals.verifiedIdentityResolved, 0);
  assert.equal(r.resolved.rows[0].candidates[0].identityStatus, 'REJECTED_SHARE_CLASS_CONFLICT');
});

test('failed latest batch and metadata406 remain untested or endpoint-unavailable rather than globally absent', () => {
  const probe = { run: { runId: 1 }, endpoints: [
    { endpoint: 'eod/latest', label: 'us-gap-latest-diagnostic', params: { symbols: 'A', exchange: 'XNYS' }, ok: false, reason: 'networkError' },
    { endpoint: 'tickers/A', label: 'us-gap-identity', targetSecurityIds: ['A'], ok: false, providerErrorType: 'the_requested_data_is_not_available' }] };
  const out = extractUSLatestDiagnostics([probe], 'A', 'XNYS', { securityId: 'A', instrumentType: 'EQUITY_COMMON' }, '2026-10-01');
  assert.equal(out[0].status, 'REQUEST_FAILED'); assert.equal(out[0].validLatest, false);
  assert.equal(extractUSMetadataOutcomes([probe])[0].status, 'PROVIDER_METADATA_ENDPOINT_DATA_UNAVAILABLE');
  const r = classifyUSGaps({ benchmark: benchmark([baseline('A')]), metadataOutcomes: extractUSMetadataOutcomes([probe]) });
  assert.equal(r.unmatched.rows[0].confirmedGenuinelyMissing, false);
});

test('identified current common security with provider MIC contradiction remains distinct from an accepted listing', () => {
  const r = classifyUSGaps({ benchmark: benchmark([baseline('A')]), secMap: { byTicker: { A: { cik: '123', exchange: 'NYSE' } } },
    listingEvidence: { protectedBaselineSource: { sha256: 'protected' }, rows: [{ securityId: 'A', currentListing: { mic: 'XNYS', role: 'EQUITY_COMMON' } }] },
    providerMetadata: [{ symbol: 'A', mic: 'OTCM', cik: '0000000123', isin: 'US0846707026', assetType: 'EQUITY', source: {} }] });
  assert.equal(r.resolved.totals.securityIdentifiedWithProviderVenueConflict, 1);
  assert.equal(r.resolved.totals.verifiedIdentityResolved, 0);
  assert.equal(r.resolved.rows[0].acceptedIdentity, null);
  assert.equal(r.resolved.rows[0].candidates[0].securityIdentifiedWithProviderVenueConflict, true);
});

test('current common-class symbol reuse cannot identify a stale warrant or ADR solely by issuer CIK', () => {
  for (const type of ['WARRANT', 'PREFERRED', 'ADR']) {
    const r = classifyUSGaps({ benchmark: benchmark([baseline('A', { instrumentType: type })]), secMap: { byTicker: { A: { cik: '123', exchange: 'NYSE' } } },
      listingEvidence: { protectedBaselineSource: { sha256: 'protected' }, rows: [{ securityId: 'A', currentListing: { mic: 'XNYS', role: 'EQUITY_COMMON' } }] },
      providerMetadata: [{ symbol: 'A', mic: 'OTCM', cik: '0000000123', isin: 'US0846707026', assetType: 'EQUITY', source: {} }] });
    assert.equal(r.resolved.totals.securityIdentifiedWithProviderVenueConflict, 0);
    assert.equal(r.resolved.totals.verifiedIdentityResolved, 0);
  }
});

test('requested MIC never overrides a plain ticker latest response venue; empty symbol slots are measured separately', () => {
  const target = { securityId: 'A', ticker: 'A', instrumentType: 'EQUITY_COMMON', activeStatus: 'ACTIVE' };
  const probes = [{ run: { runId: 'real' }, endpoints: [
    { label: 'us-common-venue-counterexample', endpoint: 'eod/latest', params: { symbols: 'A', exchange: 'XNYS' }, ok: true,
      data: { pagination: { total: 1, count: 1, offset: 0, limit: 1000 }, data: [[]] } },
    { label: 'us-common-venue-counterexample', endpoint: 'tickers/A/eod/latest', params: { exchange: 'XNYS' }, ok: true,
      data: { symbol: 'A', exchange: 'XNAS', date: '2026-09-30', price_currency: 'USD', open: 99887, high: 99889, low: 99886, close: 99888 } },
    { label: 'us-current-common-gap-latest', endpoint: 'eod/latest', params: { symbols: 'A', exchange: 'XNYS' }, ok: false,
      providerErrorType: 'no_valid_symbols_provided' }
  ] }];
  const out = extractUSLatestDiagnostics(probes, 'A', 'XNYS', target, '2026-10-01');
  assert.deepEqual(out.map(r => r.status), ['MISSING_LATEST', 'EXCHANGE_MISMATCH', 'NO_VALID_SYMBOLS_FOR_REQUESTED_VENUE']);
  assert.equal(out[1].reportedMic, 'XNAS'); assert.equal(out[1].requestedMic, 'XNYS');
  assert.ok(out.every(r => !r.validLatest)); assert.ok(!JSON.stringify(out).includes('99887'));
});

test('protected consumer denominator includes type contradictions and excludes non-consumer alias coverage gains', () => {
  const rows = [baseline('EXACT', { directoryStatus: 'DIRECTORY_MATCHED', latestObservation: { validLatest: true } }),
    baseline('FUND'), baseline('PREF-P-A', { consumer: false, instrumentType: 'PREFERRED' })];
  const out = classifyUSGaps({ benchmark: benchmark(rows), names: [{ securityId: 'FUND', companyName: 'New Fund ETF' }] });
  assert.equal(out.unmatched.rows.find(r => r.ticker === 'FUND').instrumentClassification.status, 'BASELINE_TYPE_CONFLICT');
  assert.equal(out.resolved.baselineMembershipCoverage.baselineConsumerDenominator, 2);
  assert.equal(out.resolved.baselineMembershipCoverage.exactPlusLatestValidatedResolvedConsumer, 1);
  assert.equal(out.resolved.baselineMembershipCoverage.newProductionExclusions, 0);
  assert.equal(out.resolved.rows.find(r => r.ticker === 'PREF-P-A').consumer, false);
});

test('bounded history for a different venue cannot certify a resolved protected listing', () => {
  const input = { benchmark: benchmark([baseline('A')]), secMap: { byTicker: { A: { cik: '123', exchange: 'NYSE' } } },
    providerMetadata: [{ symbol: 'A', mic: 'XNYS', cik: '0000000123' }],
    resolvedHistory: { protectedBaselineSource: { sha256: 'protected' }, asOfDate: '2026-10-01',
      rows: [{ securityId: 'A', providerSymbol: 'A', mic: 'XNAS', history: { status: 'VALIDATED_BOUNDED_WINDOW' } }] } };
  assert.throws(() => classifyUSGaps(input), /listing disagreement/);
  input.resolvedHistory.asOfDate = '2026-09-30';
  assert.throws(() => classifyUSGaps(input), /baseline\/date/);
});

test('actual provider-MIC quote availability stays separate from required listing and identity acceptance', () => {
  const out = classifyUSGaps({ benchmark: benchmark([baseline('A')]),
    secMap: { byTicker: { A: { cik: '123', exchange: 'NYSE' } } },
    listingEvidence: { protectedBaselineSource: { sha256: 'protected' }, rows: [{ securityId: 'A', genuineCommonEquityRoleObserved: true,
      currentListing: { symbol: 'A', mic: 'XNYS', role: 'EQUITY_COMMON' } }] },
    providerMetadata: [{ symbol: 'A', mic: 'XNAS', cik: '0000000123', isin: 'US0846707026', assetType: 'EQUITY' }],
    supplementaryProbes: [{ endpoints: [{ label: 'us-common-venue-counterexample', endpoint: 'tickers/A/eod/latest',
      params: { exchange: 'XNYS' }, ok: true, data: { symbol: 'A', exchange: 'XNAS', date: '2026-09-30', price_currency: 'USD',
        asset_type: 'Stock', open: 99887, high: 99889, low: 99886, close: 99888, volume: 100 } }] }] });
  const gap = out.unmatched.currentCommonEquityGaps[0];
  assert.equal(gap.independentListingLatestStatus, 'EXCHANGE_MISMATCH');
  assert.equal(gap.requiredCurrentListingEndpointGap, true);
  assert.equal(gap.anyVenueSameSymbolLatestValidatedAtProviderMic, true);
  assert.equal(gap.identifiedSecurityLatestValidatedAtProviderMic, true);
  assert.equal(out.resolved.totals.verifiedIdentityResolved, 0);
  assert.equal(out.resolved.baselineMembershipCoverage.exactPlusLatestValidatedResolvedConsumer, 0);
  assert.equal(gap.confirmedGloballyUnavailable, false); assert.ok(!JSON.stringify(out).includes('99887'));
});
