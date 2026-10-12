import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyMarketEquity, summarizeMarketEquityCertificates} from '../research/certification/market-equity.mjs';
import {selectPITFact} from '../research/tournament/engines/fundamental.mjs';

// Entirely synthetic contractual fixtures; no provider prices or real securities.
const clone = x => structuredClone(x);
function bindRawBasis(x){
  const s=x.shares;
  Object.assign(s.source,{authenticationStatus:'ORIGINAL_SEC_FILING_BODY_VERIFIED',hashScope:'FULL_RECEIVED_DOCUMENT',sha256:'a'.repeat(64)});
  s.observationBasis={status:'RAW_SHARE_OBSERVATION_BASIS',basis:'RAW_SHARES_ON_OBSERVATION_DATE',observationDate:s.periodDate,rawBasisDate:s.periodDate,value:s.value,unit:s.unit,concept:s.concept,contextId:s.source.contextId,issuerId:s.issuerId,cik:s.cik,listingId:s.listingId,securityId:s.securityId,knownFrom:s.knownFrom,evidenceKind:'ORIGINAL_FILING_SHARE_DISCLOSURE',splitAdjustmentTreatment:'NO_POST_OBSERVATION_ADJUSTMENT',source:{...s.source,locator:'Synthetic original share disclosure: actual raw shares at the observation date; not a real filing'}};
  return x;
}
function fixture() {
  const identity = {status: 'VERIFIED', historical: true, issuerId: 'synthetic-issuer', cik: '12345', listingId: 'synthetic-listing-generation-1', securityId: 'synthetic-common', instrumentType: 'COMMON_STOCK', issuerStructure: 'SINGLE_CLASS', validFrom: '2020-01-01', validTo: null, knownFrom: '2020-01-01T12:00:00Z', source: {id: 'synthetic-historical-identity-evidence'}};
  const shares = {concept: 'dei:EntityCommonStockSharesOutstanding', value: 100, unit: 'shares', periodDate: '2024-11-01', knownFrom: '2024-11-05T13:00:00Z', vintage: 'AS_REPORTED', issuerId: identity.issuerId, cik: identity.cik, listingId: identity.listingId, securityId: identity.securityId, source: {kind: 'SEC_FILING_XBRL', accession: '0000012345-24-000001', url: 'https://www.sec.gov/Archives/synthetic-fixture', acceptedAt: '2024-11-05T13:00:00Z', periodDate: '2024-11-01', contextId: 'synthetic-cover-context'}, context: {verified: true, periodType: 'INSTANT', periodDate: '2024-11-01', scope: 'ISSUER_COMMON', entityCik: identity.cik, dimensions: []}};
  const price = {date: '2024-12-31', knownFrom: '2024-12-31T21:00:00Z', value: 25, currency: 'USD', basis: 'RAW_HISTORICAL_CLOSE', listingId: identity.listingId, securityId: identity.securityId, source: {id: 'synthetic-raw-price'}, certification: {status: 'VERIFIED', basis: 'RAW_HISTORICAL_CLOSE', currency: 'USD'}};
  const splitHistory = {status: 'VERIFIED', complete: true, scope: 'COMMON_SHARE_SPLITS', listingId: identity.listingId, securityId: identity.securityId, fromDate: '2024-11-01', toDate: '2024-12-31', source: {id: 'synthetic-complete-split-history'}, bars: [{date: '2024-12-02', splitFactor: 2, knownFrom: '2024-12-02T14:30:00Z'}]};
  return bindRawBasis({asOf: '2024-12-31T21:00:00Z', valuationDate: '2024-12-31', identity, shares, price, splitHistory, policy: {mode: 'CURRENT_AS_KNOWN_LATEST_ACTUAL', maxShareAgeDays: 90}});
}
function reject(change, expected) {
  const x = fixture(); change(x);
  const r = certifyMarketEquity(x);
  assert.equal(r.state, 'APPROXIMATE_NOT_ELIGIBLE'); assert.equal(r.eligible, false); assert.equal(r.fact, null);
  if (expected) assert.deepEqual(r.reasons, [expected]);
  return r;
}

test('derives split-aligned actual shares and emits unchanged-engine-compatible fiscal fact', () => {
  const r = certifyMarketEquity(fixture());
  assert.equal(r.state, 'DERIVED'); assert.equal(r.eligible, true);
  assert.equal(r.fact.value, 5000); // 100 actual shares × 2-for-1 bridge × 25 raw close.
  assert.equal(r.provenance.effectiveShares, 200);
  assert.equal(r.provenance.exactSharesAtPriceDateEstablished, false);
  assert.equal(r.confidence, 'MEDIUM'); assert.equal(r.dataQualityAutomaticallyHigh, false);
  const s = {fundamentals: [r.fact]};
  assert.equal(selectPITFact(s, 'marketEquity', '2025-06-30', {periodEnd: '2024-12-31'}).value, 5000);
  assert.equal(selectPITFact(s, 'marketEquity', '2024-12-30'), null);
  assert.equal(selectPITFact(s, 'marketEquity', '2025-06-30', {periodEnd: '2025-06-30'}), null);
});

test('matched fiscal shares published later are available in June, never backdated to December', () => {
  const x = fixture(); x.asOf = '2025-06-30T20:00:00Z'; x.policy = {mode: 'MATCHED_VALUATION_DATE_ACTUAL_SHARES'};
  x.shares.periodDate = x.shares.context.periodDate = x.shares.source.periodDate = '2024-12-31';
  x.shares.knownFrom = x.shares.source.acceptedAt = '2025-03-01T12:00:00Z';
  bindRawBasis(x);const r = certifyMarketEquity(x); assert.equal(r.eligible, true); assert.equal(r.fact.value, 2500);
  assert.equal(r.fact.availableAt, '2025-03-01T12:00:00.000Z');
  const security = {fundamentals: [r.fact]};
  assert.equal(selectPITFact(security, 'marketEquity', '2024-12-31', {periodEnd: '2024-12-31'}), null);
  assert.equal(selectPITFact(security, 'marketEquity', '2025-06-30', {periodEnd: '2024-12-31'}).value, 2500);
  x.asOf = '2024-12-31T21:00:00Z'; assert.deepEqual(certifyMarketEquity(x).reasons, ['SOURCE_NOT_KNOWN_AT_FORMATION_OR_VALUATION_DATES_INVALID']);
});

test('same-day accession accepted after market close is unavailable at that close', () => {
  reject(x => { x.asOf = x.price.knownFrom; x.shares.knownFrom = x.shares.source.acceptedAt = '2024-12-31T21:01:00Z'; }, 'SOURCE_NOT_KNOWN_AT_FORMATION_OR_VALUATION_DATES_INVALID');
});

test('exact same-day actual observation needs no stale-share carry policy', () => {
  const x = fixture(); x.shares.periodDate = x.shares.source.periodDate = x.shares.context.periodDate = '2024-12-31';
  x.shares.knownFrom = x.shares.source.acceptedAt = '2024-12-31T13:00:00Z'; x.policy = {mode: 'MATCHED_VALUATION_DATE_ACTUAL_SHARES'};
  x.splitHistory.fromDate = '2024-12-31'; x.splitHistory.bars = [{date: '2024-12-31', splitFactor: 2, knownFrom: '2024-12-31T12:00:00Z'}];
  bindRawBasis(x);const r = certifyMarketEquity(x); assert.equal(r.eligible, true); assert.equal(r.fact.value, 2500);
  assert.equal(r.provenance.shareAgeDays, 0); assert.equal(r.provenance.splitMultiplier, 1); // Split on observation date is already in shares.
});

test('older observations require declared bounded temporal policy', () => {
  reject(x => { delete x.policy; }, 'EXPLICIT_VALUATION_AVAILABILITY_MODE_REQUIRED');
  reject(x => { x.policy.maxShareAgeDays = 30; }, 'OLDER_ACTUAL_SHARES_REQUIRE_EXPLICIT_BOUNDED_AS_KNOWN_POLICY');
});

test('future splits and poisoned future factors cannot change earlier market equity', () => {
  const x = fixture(), expected = certifyMarketEquity(x);
  x.splitHistory.bars.push({date: '2025-02-03', splitFactor: 1000, knownFrom: '2025-02-03T12:00:00Z'}, {date: '2028-01-01', splitFactor: null});
  x.splitHistory.toDate = '2028-01-01';
  const actual = certifyMarketEquity(x); assert.equal(actual.fact.value, expected.fact.value); assert.equal(actual.provenance.splitMultiplier, 2);
});

test('missing split factor is not silently one; duplicates and unavailable events are rejected', () => {
  reject(x => { delete x.splitHistory.bars[0].splitFactor; }, 'SPLIT_EVENT_MISSING_OR_NOT_KNOWN_AT_FORMATION_CUTOFF');
  reject(x => { x.splitHistory.bars.push(clone(x.splitHistory.bars[0])); }, 'SPLIT_HISTORY_DUPLICATED_OR_UNORDERED');
  reject(x => { x.splitHistory.bars[0].knownFrom = '2025-01-01T12:00:00Z'; }, 'SPLIT_EVENT_MISSING_OR_NOT_KNOWN_AT_FORMATION_CUTOFF');
  reject(x => { x.splitHistory.complete = false; }, 'COMPLETE_SPLIT_BASIS_BRIDGE_UNCERTIFIED');
});

test('reverse split converts actual shares without changing economic scale twice', () => {
  const x = fixture(); x.splitHistory.bars[0].splitFactor = 0.2; x.price.value = 250;
  const r = certifyMarketEquity(x); assert.equal(r.fact.value, 5000); assert.equal(r.provenance.effectiveShares, 20);
});

test('weighted average, diluted and public-float concepts never substitute for actual shares', () => {
  for (const concept of ['us-gaap:WeightedAverageNumberOfSharesOutstandingBasic', 'us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding', 'dei:EntityPublicFloat']) reject(x => { x.shares.concept = concept; }, 'ACTUAL_INSTANT_SHARES_CONCEPT_OR_UNIT_INVALID');
  reject(x => { x.shares.unit = 'shares_thousands'; }, 'ACTUAL_INSTANT_SHARES_CONCEPT_OR_UNIT_INVALID');
});

test('current snapshots, restatements and unverified Companyfacts contexts are not original facts', () => {
  reject(x => { x.shares.currentLatest = true; }, 'CURRENT_LATEST_OR_RESTATED_SHARES_NOT_ELIGIBLE');
  reject(x => { x.shares.vintage = 'RESTATED'; }, 'CURRENT_LATEST_OR_RESTATED_SHARES_NOT_ELIGIBLE');
  reject(x => { x.shares.source.kind = 'SEC_COMPANYFACTS'; }, 'OFFICIAL_ACCEPTANCE_AND_SHARE_CONTEXT_UNCERTIFIED');
  reject(x => { delete x.shares.context.verified; }, 'FILING_CONTEXT_SCOPE_OR_DIMENSIONS_UNCERTIFIED');
});

test('filing acceptance and actual cover observation date must match source context', () => {
  reject(x => { x.shares.source.periodDate = '2024-09-30'; }, 'OFFICIAL_ACCEPTANCE_AND_SHARE_CONTEXT_UNCERTIFIED');
  reject(x => { x.shares.source.acceptedAt = '2024-11-06T13:00:00Z'; }, 'OFFICIAL_ACCEPTANCE_AND_SHARE_CONTEXT_UNCERTIFIED');
  reject(x => { x.shares.context.periodType = 'DURATION'; }, 'FILING_CONTEXT_SCOPE_OR_DIMENSIONS_UNCERTIFIED');
  reject(x => { x.shares.context.dimensions = ['ClassA']; }, 'FILING_CONTEXT_SCOPE_OR_DIMENSIONS_UNCERTIFIED');
});

test('issuer shares cannot be valued by one ambiguous class or an uncertified ADR ratio', () => {
  reject(x => { x.identity.issuerStructure = 'MULTIPLE_CLASSES'; }, 'MULTIPLE_OR_UNKNOWN_CLASSES_REQUIRE_FULL_ISSUER_AGGREGATION');
  reject(x => { x.identity.instrumentType = 'ADR'; x.identity.adrRatio = 2; }, 'ADR_REQUIRES_SEPARATE_UNDERLYING_RATIO_CERTIFICATION');
});

test('historical CIK and listing generation proof prevents current mapping across ticker reuse', () => {
  reject(x => { x.identity.historical = false; }, 'HISTORICAL_ISSUER_LISTING_IDENTITY_UNCERTIFIED');
  reject(x => { x.identity.knownFrom = '2025-01-01T12:00:00Z'; }, 'IDENTITY_NOT_KNOWN_AT_FORMATION_CUTOFF');
  reject(x => { x.identity.validFrom = '2024-12-01'; }, 'IDENTITY_OUTSIDE_HISTORICAL_LISTING_INTERVAL');
  reject(x => { x.shares.listingId = 'synthetic-reused-generation-2'; }, 'SHARES_ISSUER_SECURITY_OR_LISTING_MISMATCH');
  reject(x => { x.shares.cik = '54321'; }, 'SHARES_ISSUER_SECURITY_OR_LISTING_MISMATCH');
});

test('total-return prices, foreign currency and future-anchor canonical prices are ineligible', () => {
  reject(x => { x.price.basis = 'TOTAL_RETURN'; }, 'TOTAL_RETURN_OR_UNTYPED_PRICE_NOT_MARKET_EQUITY_BASIS');
  reject(x => { x.price.currency = 'EUR'; }, 'PRICE_CURRENCY_SOURCE_OR_IDENTITY_UNCERTIFIED');
  reject(x => { x.price.basis = x.price.certification.basis = 'CANONICAL_SPLIT_PRICE'; x.price.basisDate = '2025-06-30'; x.price.rawClose = 25; x.price.certification.causalPrefix = true; }, 'CANONICAL_PRICE_NEEDS_SAME_SESSION_RAW_RECONCILIATION');
});

test('canonical price anchored at actual session reconciles to raw without total-return scaling', () => {
  const x = fixture(); x.price.basis = x.price.certification.basis = 'CANONICAL_SPLIT_PRICE'; x.price.basisDate = x.price.date; x.price.rawClose = x.price.value; x.price.certification.causalPrefix = true;
  assert.equal(certifyMarketEquity(x).fact.value, 5000);
  x.price.value = 24; assert.equal(certifyMarketEquity(x).eligible, false);
});

test('non-trading fiscal end preserves requested periodEnd only with certified preceding-session calendar', () => {
  const x = fixture(); x.asOf = '2025-01-01T21:00:00Z'; x.valuationDate = '2025-01-01';
  assert.equal(certifyMarketEquity(x).eligible, false);
  x.calendar = {status: 'VERIFIED', valuationDate: '2025-01-01', lastSession: '2024-12-31', knownFrom: '2024-01-01T00:00:00Z', source: {id: 'synthetic-exchange-calendar'}};
  const r = certifyMarketEquity(x); assert.equal(r.fact.periodEnd, '2025-01-01'); assert.equal(r.provenance.priceDate, '2024-12-31');
});

test('invalid or imprecise acceptance timestamps fail closed', () => {
  reject(x => { x.shares.knownFrom = '2024-11-05'; }, 'EXACT_DATES_AND_UTC_AVAILABILITY_REQUIRED');
  reject(x => { x.shares.knownFrom = x.shares.source.acceptedAt = '2024-13-05T13:00:00Z'; }, 'EXACT_DATES_AND_UTC_AVAILABILITY_REQUIRED');
  reject(x => { x.shares.periodDate = x.shares.context.periodDate = x.shares.source.periodDate = '2024-11-07'; }, 'SOURCE_NOT_KNOWN_AT_FORMATION_OR_VALUATION_DATES_INVALID');
});

test('missing inputs stay MISSING and public projection excludes private identities and amounts', () => {
  const missing = certifyMarketEquity({asOf: '2025-06-30'}), good = certifyMarketEquity(fixture());
  assert.equal(missing.state, 'MISSING'); assert.equal(missing.fact, null);
  const summary = summarizeMarketEquityCertificates([missing, good]);
  assert.deepEqual(summary.states, {VERIFIED: 0, DERIVED: 1, APPROXIMATE_NOT_ELIGIBLE: 0, MISSING: 1});
  assert.equal(summary.eligible, 1); const encoded = JSON.stringify(summary);
  for (const privateValue of ['synthetic-issuer', 'synthetic-common', '5000', '2024-12-31', '0000012345-24-000001']) assert.equal(encoded.includes(privateValue), false);
});

test('formation needs exact UTC cutoff and cannot silently promote date-only to day end', () => {
  reject(x => { x.asOf = '2024-12-31'; }, 'EXACT_DATES_AND_UTC_AVAILABILITY_REQUIRED');
  const x = fixture(); x.asOf = '2024-12-31'; x.formationCutoff = '2024-12-31T21:00:00Z';
  assert.equal(certifyMarketEquity(x).eligible, true);
  x.formationCutoff = '2025-01-01T21:00:00Z'; assert.equal(certifyMarketEquity(x).eligible, false);
  reject(x => { x.asOf = '2024-12-31T24:00:00Z'; }, 'EXACT_DATES_AND_UTC_AVAILABILITY_REQUIRED');
  reject(x => { x.shares.knownFrom = x.shares.source.acceptedAt = '2024-11-05T24:00:00Z'; }, 'EXACT_DATES_AND_UTC_AVAILABILITY_REQUIRED');
});

test('date-only identity proof uses only declared conservative bound, never fabricated acceptance', () => {
  const x = fixture(); x.identity.knownFrom = '2020-01-01';
  assert.equal(certifyMarketEquity(x).eligible, false);
  x.identity.availabilityResolution = 'UTC_DAY_END_CONSERVATIVE_BOUND';
  const r = certifyMarketEquity(x); assert.equal(r.eligible, true);
  assert.equal(r.provenance.identityAvailability.original, '2020-01-01');
  assert.equal(r.provenance.identityAvailability.basis, 'UTC_DAY_END_CONSERVATIVE_BOUND');
  x.identity.knownFrom = '2024-12-31'; assert.equal(certifyMarketEquity(x).eligible, false);
});

test('announced split applies only after its effective date, including early official announcement', () => {
  const x = fixture(); x.splitHistory.bars[0].knownFrom = '2024-11-20T13:00:00Z';
  x.splitHistory.bars.push({date: '2025-01-03', splitFactor: 10, knownFrom: '2024-12-20T13:00:00Z'});
  assert.equal(certifyMarketEquity(x).fact.value, 5000);
});

test('historical matched mode does not relabel older observed shares; carry is not fiscal matching', () => {
  reject(x => { x.policy = {mode: 'MATCHED_VALUATION_DATE_ACTUAL_SHARES'}; }, 'HISTORICAL_MATCHED_MODE_REQUIRES_ACTUAL_SHARES_ON_PRICE_DATE');
  reject(x => { x.asOf = '2025-06-30T20:00:00Z'; }, 'CURRENT_CARRY_MODE_CANNOT_SUPPLY_OLD_FISCAL_MARKET_EQUITY');
});

test('file context entity is bound to the independently evidenced historical issuer', () => {
  reject(x => { x.shares.context.entityCik = '98765'; }, 'FILING_CONTEXT_SCOPE_OR_DIMENSIONS_UNCERTIFIED');
  reject(x => { x.identity.cik = '0000000000'; }, 'HISTORICAL_ISSUER_LISTING_IDENTITY_UNCERTIFIED');
});


test('as-reported actual INSTANT shares do not automatically establish raw observation units',()=>{
  reject(x=>{delete x.shares.observationBasis;},'RAW_SHARE_OBSERVATION_BASIS_UNCERTIFIED');
  reject(x=>{x.shares.observationBasis.status='AS_REPORTED';},'RAW_SHARE_OBSERVATION_BASIS_UNCERTIFIED');
  reject(x=>{x.shares.observationBasis.basis='UNKNOWN';},'RAW_SHARE_OBSERVATION_BASIS_UNCERTIFIED');
});

test('later split-adjusted disclosure cannot be multiplied by the same split a second time',()=>{
  reject(x=>{x.shares.value=200;x.shares.observationBasis.value=200;x.shares.observationBasis.splitAdjustmentTreatment='RETROACTIVELY_ADJUSTED_FOR_POST_OBSERVATION_SPLIT';x.shares.observationBasis.rawBasisDate='2024-12-02';},'SHARES_POST_OBSERVATION_SPLIT_ADJUSTMENT_OR_UNKNOWN_BASIS');
  reject(x=>{x.shares.observationBasis.splitAdjustmentTreatment='UNKNOWN';},'SHARES_POST_OBSERVATION_SPLIT_ADJUSTMENT_OR_UNKNOWN_BASIS');
  reject(x=>{x.shares.observationBasis.rawBasisDate='2025-02-03';},'SHARES_POST_OBSERVATION_SPLIT_ADJUSTMENT_OR_UNKNOWN_BASIS');
});

test('raw basis proof binds authenticated original body, exact observation and source availability',()=>{
  reject(x=>{x.shares.observationBasis.observationDate='2024-09-30';},'RAW_SHARE_BASIS_FACT_OR_IDENTITY_BINDING_MISMATCH');
  reject(x=>{x.shares.observationBasis.value=101;},'RAW_SHARE_BASIS_FACT_OR_IDENTITY_BINDING_MISMATCH');
  reject(x=>{x.shares.observationBasis.contextId='other-context';},'RAW_SHARE_BASIS_FACT_OR_IDENTITY_BINDING_MISMATCH');
  reject(x=>{x.shares.observationBasis.securityId='other-class';},'RAW_SHARE_BASIS_FACT_OR_IDENTITY_BINDING_MISMATCH');
  reject(x=>{x.shares.observationBasis.knownFrom='2025-01-01T12:00:00Z';},'RAW_SHARE_BASIS_NOT_KNOWN_AT_FORMATION');
  reject(x=>{x.shares.observationBasis.source.sha256='b'.repeat(64);},'RAW_SHARE_BASIS_ORIGINAL_SOURCE_AUTHENTICATION_UNCERTIFIED');
  reject(x=>{delete x.shares.source.authenticationStatus;},'RAW_SHARE_BASIS_ORIGINAL_SOURCE_AUTHENTICATION_UNCERTIFIED');
  reject(x=>{x.shares.observationBasis.source.authenticationStatus='ASSUMED_FROM_AS_REPORTED';},'RAW_SHARE_BASIS_ORIGINAL_SOURCE_AUTHENTICATION_UNCERTIFIED');
  reject(x=>{x.shares.observationBasis.source.locator='';},'RAW_SHARE_BASIS_ORIGINAL_SOURCE_AUTHENTICATION_UNCERTIFIED');
  reject(x=>{x.shares.observationBasis.evidenceKind='CURRENT_PROVIDER_BAR';},'ORIGINAL_SHARE_DISCLOSURE_OR_SPLIT_NOTE_REQUIRED');
});

test('inspected original split note with explicit raw units preserves finite certified calculation',()=>{
  const x=fixture();x.shares.observationBasis.evidenceKind='ORIGINAL_FILING_SPLIT_NOTE';
  x.shares.observationBasis.source.locator='Synthetic original split-note raw share basis';
  const r=certifyMarketEquity(x);assert.equal(r.fact.value,5000);assert.equal(r.provenance.rawShareObservationBasis.observationDate,x.shares.periodDate);
  assert.equal(r.provenance.splitMultiplier,2);assert.equal(r.confidence,'MEDIUM');
});
