import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEuropeSupertraderInputs, buildEuropeShadowPopulation } from '../europe-readiness.mjs';
import { TEST_PLANS } from '../engine/gates.mjs';

function fixture() {
  const identity = { region: 'EUROPE', verified: true, source: 'core-reviewed-fixture', document: 'fixture-identity',
    securityId: 'existing-canonical-security', instrumentId: 'existing-instrument', companyId: 'existing-company', listingId: 'existing-listing',
    mic: 'XETR', currency: 'EUR', instrumentType: 'EQUITY', primaryListing: true };
  const proof = { status: 'VERIFIED', verified: true, independent: true, source: 'independent-validator-fixture', document: 'fixture-evidence',
    securityId: identity.securityId, listingId: identity.listingId, mic: identity.mic, currency: identity.currency, seriesHash: 'abcd1234abcd1234' };
  return { identity, now: '2026-10-08',
    price: { ...proof, latestDate: '2026-10-07', expectedLastCompletedSession: '2026-10-07', freshness: 'LAST_VALID_SESSION', calendarVerified: true, calendarSource: 'verified-exchange-calendar-fixture', calendarMic: 'XETR' },
    history: { ...proof, observations: 2600, years: 10, from: '2016-10-07', to: '2026-10-07', calendarVerified: true, calendarMic: 'XETR', missingDates: [] },
    ohlc: { ...proof, observations: 2600, invalidBars: 0, quarantinedBars: 0, duplicateDates: 0, currencyConflicts: 0, unexplainedGaps: 0 },
    volume: { ...proof, observations: 2600, missingObservations: 0, invalidObservations: 0, zeroObservations: 0 },
    corporateActions: { ...proof, complete: true, from: '2016-10-07', to: '2026-10-07', splitsVerified: true, dividendsVerified: true, symbolContinuityVerified: true },
    adjustment: { ...proof, status: 'ADJUSTMENT_CERTIFIED', basis: 'SPLIT_ADJUSTED', seriesMatched: true, canonicalSeriesHash: 'abcd1234abcd1234' },
    benchmark: { ...proof, region: 'EUROPE', marketScope: 'EUROPE_EQUITIES', benchmarkId: 'existing-europe-benchmark', benchmarkMic: 'XETR', benchmarkCurrency: 'EUR', basis: 'SPLIT_ADJUSTED', benchmarkSeriesHash: 'fefe5678fefe5678', alignmentVerified: true, historyVerified: true },
    variantId: 'DONCHIAN_TURTLE_S1_DAILY',
    backtest: { ...proof, selectionUniverseRegion: 'EUROPE', selectionUniverseId: 'europe-pit-fixture',
      pointInTimeSelectionVerified: true, survivorshipVerified: true, walkForwardVerified: true, outOfSampleVerified: true, noLookaheadVerified: true,
      executionModelVerified: true, costsAndSlippageVerified: true, baselinesVerified: true, totalReturnBasis: 'TOTAL_RETURN', totalReturnVerified: true,
      totalReturnSeriesHash: 'cccc9876cccc9876', corporateActionReplayVerified: true, delistingReturnsVerified: true,
      coverage: { dailyOhlcvYears: 10, weeklyCloseYears: 10, delistedWithPriceHistory: 20, survivorshipControls: true,
        historicalMembershipDates: 40, splitAdjusted: true, totalReturnUniform: true, delistingReturns: true, usageRightsConfirmed: true },
      baselines: ['documented-european-buy-and-hold-fixture'] } };
}

test('verified shadow inputs may become READY while trading, publication and strategy invocation remain false', () => {
  const result = assessEuropeSupertraderInputs(fixture());
  assert.equal(result.inputStatus, 'SUPERTRADER_READY');
  assert.equal(result.backtestStatus, 'BACKTEST_READY');
  assert.deepEqual(result.failedGates, []);
  assert.equal(result.strategyAdmission, 'SHADOW_ONLY');
  assert.equal(result.admittedToTrading, false);
  assert.equal(result.strategyInvoked, false);
  assert.equal(result.metricsPublishable, false);
  assert.equal(result.publicationReady, false);
});

test('each independent price input gate is necessary and cannot be bypassed by a readiness label', () => {
  const gates = { PRICE: 'price', HISTORY: 'history', OHLC: 'ohlc', VOLUME: 'volume', CORPORATE_ACTIONS: 'corporateActions', ADJUSTMENT: 'adjustment', BENCHMARK: 'benchmark' };
  for (const [gate, field] of Object.entries(gates)) {
    const input = fixture(); input[field].verified = false; input.readiness = 'SUPERTRADER_READY';
    const result = assessEuropeSupertraderInputs(input);
    assert.equal(result.inputStatus, 'SUPERTRADER_BLOCKED', gate);
    assert.ok(result.failedGates.includes(gate), gate);
    assert.notEqual(result.backtestStatus, 'BACKTEST_READY', gate);
  }
});

test('validator evidence cannot be reused for a different security, listing, currency, MIC or price hash', () => {
  for (const [field, value] of Object.entries({ securityId: 'other-security', listingId: 'other-listing', currency: 'USD', mic: 'XNYS', seriesHash: 'ffff0000' })) {
    const input = fixture(); input.volume[field] = value;
    assert.equal(assessEuropeSupertraderInputs(input).gates.VOLUME, false, field);
  }
  for (const field of ['source', 'document']) {
    const input = fixture(); delete input.volume[field];
    assert.equal(assessEuropeSupertraderInputs(input).gates.VOLUME, false, field);
  }
});

test('US identity, ETFs and secondary listings cannot enter the Europe equity shadow population as ready', () => {
  for (const change of [{ region: 'US' }, { mic: 'XNAS' }, { instrumentType: 'ETF' }, { primaryListing: false }, { verified: false }, { companyId: null }]) {
    const input = fixture(); Object.assign(input.identity, change);
    assert.equal(assessEuropeSupertraderInputs(input).inputStatus, 'SUPERTRADER_BLOCKED');
  }
});

test('stale, future or exchange-calendar-unverified prices are blocked', () => {
  for (const change of [{ freshness: 'STALE' }, { latestDate: '2026-10-09' }, { expectedLastCompletedSession: '2026-10-08' }, { calendarMic: 'XNYS' }, { calendarVerified: false }, { calendarSource: null }]) {
    const input = fixture(); Object.assign(input.price, change);
    assert.equal(assessEuropeSupertraderInputs(input).gates.PRICE, false);
  }
});

test('missing counters never become zero; OHLC/volume defects and observation mismatches block inputs', () => {
  for (const [field, change] of [['ohlc', { invalidBars: 1 }], ['ohlc', { duplicateDates: undefined }], ['ohlc', { observations: 1000 }],
    ['volume', { zeroObservations: 1 }], ['volume', { missingObservations: undefined }], ['history', { observations: 252 }], ['history', { years: 20 }], ['history', { missingDates: ['2026-09-01'] }]]) {
    const input = fixture(); Object.assign(input[field], change);
    assert.equal(assessEuropeSupertraderInputs(input).inputStatus, 'SUPERTRADER_BLOCKED');
  }
});

test('provider adjusted field presence or total-return geometry cannot certify the split-adjusted input basis', () => {
  for (const change of [{ status: 'ADJUSTMENT_UNKNOWN' }, { basis: 'TOTAL_RETURN' }, { seriesMatched: false }, { canonicalSeriesHash: 'bad-hash' }]) {
    const input = fixture(); Object.assign(input.adjustment, change); input.price.adjustedClose = 123;
    assert.equal(assessEuropeSupertraderInputs(input).gates.ADJUSTMENT, false);
  }
});

test('corporate-action evidence must cover the whole interval and verify all required action classes', () => {
  for (const change of [{ from: '2020-01-01' }, { to: '2026-01-01' }, { complete: false }, { dividendsVerified: false }, { symbolContinuityVerified: false }]) {
    const input = fixture(); Object.assign(input.corporateActions, change);
    assert.equal(assessEuropeSupertraderInputs(input).gates.CORPORATE_ACTIONS, false);
  }
});

test('a US or missing/misaligned/currency-incompatible benchmark cannot be silently substituted', () => {
  for (const change of [{ region: 'US' }, { marketScope: 'US_EQUITIES' }, { benchmarkMic: 'ARCX' }, { benchmarkId: null }, { benchmarkCurrency: 'USD' }, { alignmentVerified: false }, { benchmarkSeriesHash: null }]) {
    const input = fixture(); Object.assign(input.benchmark, change);
    assert.equal(assessEuropeSupertraderInputs(input).gates.BENCHMARK, false);
  }
});

test('point-in-time, walk-forward, total return and execution proofs are each mandatory for backtest readiness', () => {
  for (const field of ['pointInTimeSelectionVerified', 'survivorshipVerified', 'walkForwardVerified', 'outOfSampleVerified', 'noLookaheadVerified',
    'executionModelVerified', 'costsAndSlippageVerified', 'baselinesVerified', 'totalReturnVerified', 'corporateActionReplayVerified', 'delistingReturnsVerified']) {
    const input = fixture(); input.backtest[field] = false;
    const result = assessEuropeSupertraderInputs(input);
    assert.equal(result.inputStatus, 'SUPERTRADER_READY');
    assert.equal(result.backtestStatus, 'RESEARCH_ONLY', field);
  }
});

test('the existing unchanged method-specific history and usage-rights gates still decide backtest readiness', () => {
  const input = fixture(); input.variantId = 'WEINSTEIN_STAGE2_WEEKLY';
  const result = assessEuropeSupertraderInputs(input);
  assert.equal(result.minimumBacktestYears, TEST_PLANS.WEINSTEIN_STAGE2_WEEKLY.minYears);
  assert.equal(result.minimumBacktestYears, 20);
  assert.equal(result.backtestStatus, 'RESEARCH_ONLY');
  const rights = fixture(); rights.backtest.coverage.usageRightsConfirmed = false;
  const blocked = assessEuropeSupertraderInputs(rights);
  assert.equal(blocked.backtestStatus, 'RESEARCH_ONLY');
  assert.ok(blocked.existingGateResult.failedGates.includes('USAGE_RIGHTS'));
  const unknown = fixture(); unknown.variantId = 'UNDEFINED_METHOD';
  assert.equal(assessEuropeSupertraderInputs(unknown).backtestStatus, 'RESEARCH_ONLY');
});

test('historical population controls must be measured rather than asserted by an aggregate READY status', () => {
  const input = fixture(); input.backtest.coverage.historicalMembershipDates = 0;
  assert.ok(assessEuropeSupertraderInputs(input).existingGateResult.failedGates.includes('UNIVERSE_PIT'));
  const unsupportedYears = fixture(); unsupportedYears.backtest.coverage.dailyOhlcvYears = 20;
  assert.equal(assessEuropeSupertraderInputs(unsupportedYears).backtestStatus, 'RESEARCH_ONLY');
});

test('shadow population excludes US inputs and prevents duplicate listings without any trading admission', () => {
  const europe = fixture(), us = fixture(); us.identity.region = 'US';
  const result = buildEuropeShadowPopulation([europe, us]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].securityId, europe.identity.securityId);
  assert.equal(result.counts.excludedNonEuropeanInputs, 1);
  assert.equal(result.counts.supertraderInputReady, 1);
  assert.equal(result.counts.admittedToTrading, 0);
  assert.deepEqual(result.admittedToTrading, []);
  assert.equal(result.existingUSPopulationChanged, false);
  const duplicated = buildEuropeShadowPopulation([fixture(), fixture()]);
  assert.equal(duplicated.counts.supertraderInputReady, 0);
  assert.ok(duplicated.entries.every(entry => entry.failedGates.includes('DUPLICATE_LISTING_INPUT')));
});

test('assessment and shadow inventory preserve their inputs and generate no IDs or data writes', () => {
  const input = fixture(), before = JSON.stringify(input);
  assessEuropeSupertraderInputs(input); buildEuropeShadowPopulation([input]);
  assert.equal(JSON.stringify(input), before);
  const missing = assessEuropeSupertraderInputs({});
  assert.equal(missing.securityId, null);
  assert.equal(missing.inputStatus, 'SUPERTRADER_BLOCKED');
  assert.equal(missing.backtestStatus, 'BLOCKED');
  assert.equal(buildEuropeShadowPopulation().productionWrites, 0);
});

test('supplied existing US/canonical protected IDs cannot become ready even when labelled European', () => {
  const input = fixture();
  for (const id of [input.identity.securityId, input.identity.listingId, input.identity.instrumentId, input.identity.companyId]) {
    assert.equal(assessEuropeSupertraderInputs(input, { protectedIds: [id] }).inputStatus, 'SUPERTRADER_BLOCKED');
    assert.equal(buildEuropeShadowPopulation([input], { protectedIds: [id] }).counts.supertraderInputReady, 0);
  }
});

test('different listings cannot both claim primary admission for one canonical security', () => {
  const a = fixture(), b = fixture(); b.identity.listingId = 'second-primary-listing';
  for (const field of ['price', 'history', 'ohlc', 'volume', 'corporateActions', 'adjustment', 'benchmark', 'backtest']) b[field].listingId = b.identity.listingId;
  const population = buildEuropeShadowPopulation([a, b]);
  assert.equal(population.counts.supertraderInputReady, 0);
  assert.ok(population.entries.every(entry => entry.failedGates.includes('DUPLICATE_PRIMARY_SECURITY')));
});

test('malformed benchmark MIC/hash or an instrument benchmarked to itself cannot pass', () => {
  for (const change of [{ benchmarkMic: 'EU' }, { benchmarkSeriesHash: 'arbitrary-text' }, { benchmarkId: fixture().identity.securityId }]) {
    const input = fixture(); Object.assign(input.benchmark, change);
    assert.equal(assessEuropeSupertraderInputs(input).gates.BENCHMARK, false);
  }
});

test('only supported 16-hex canonical and 64-hex cryptographic digest shapes bind input series', () => {
  for (const length of [8, 15, 17]) {
    const price = fixture(); price.price.seriesHash = 'a'.repeat(length);
    assert.equal(assessEuropeSupertraderInputs(price).gates.PRICE, false);
    const benchmark = fixture(); benchmark.benchmark.benchmarkSeriesHash = 'a'.repeat(length);
    assert.equal(assessEuropeSupertraderInputs(benchmark).gates.BENCHMARK, false);
    const totalReturn = fixture(); totalReturn.backtest.totalReturnSeriesHash = 'a'.repeat(length);
    assert.equal(assessEuropeSupertraderInputs(totalReturn).backtestStatus, 'RESEARCH_ONLY');
  }
  const sha = fixture(), digest = 'a'.repeat(64);
  for (const field of ['price', 'history', 'ohlc', 'volume', 'corporateActions', 'adjustment', 'benchmark', 'backtest']) sha[field].seriesHash = digest;
  sha.adjustment.canonicalSeriesHash = digest;
  sha.benchmark.benchmarkSeriesHash = 'b'.repeat(64); sha.backtest.totalReturnSeriesHash = 'c'.repeat(64);
  assert.equal(assessEuropeSupertraderInputs(sha).backtestStatus, 'BACKTEST_READY');
});
