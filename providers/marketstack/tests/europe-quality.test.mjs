import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateEodBars, evaluateFreshness, assessSnapshot, assessCorporateActions,
  classifyAdjustment, assessHistory, evaluateEuropePriceSeries } from '../../../scripts/marketstack/europe-quality.mjs';
const require = createRequire(import.meta.url);
const Canonical = require('../../../quant/engines/technical/canonical-bars.js');
const Features = require('../../../quant/engines/technical/feature-store.js');
const listing = { providerTicker: 'SAP', mic: 'XETR', currency: 'EUR', instrumentId: 'test-only' };
const row = (date, overrides = {}) => ({ date, symbol: 'SAP', exchange: 'XETR', open: 10, high: 12, low: 9, close: 11, volume: 100, currency: 'EUR', ...overrides });
const calendar = { verified: true, mic: 'XETR', source: 'TEST_EXPLICIT_EXCHANGE_SESSION_EVIDENCE',
  expectedLastCompletedSession: '2026-10-06', expectedSessions: ['2026-10-05', '2026-10-06'] };

test('quarantines impossible/nonpositive prices and invalid volume, preserving all raw fields', () => {
  const raw = [row('2026-10-01', { close: 0, provider_extra: { nested: [1, 2] } }),
    row('2026-10-02', { high: 8 }), row('2026-10-05', { volume: -2 }), row('2026-10-06')];
  const before = JSON.stringify(raw), result = validateEodBars(raw);
  assert.equal(result.counts.quarantined, 3);
  assert.equal(result.counts.valid, 1);
  assert.strictEqual(result.rawBars, raw);
  assert.strictEqual(result.quarantine[0].raw, raw[0]);
  assert.deepEqual(result.quarantine[0].raw.provider_extra, { nested: [1, 2] });
  assert.equal(JSON.stringify(raw), before);
});

test('corrected connector observation envelopes keep normalized and raw layers separate', () => {
  const providerRaw = row('2026-10-06', { provider_extra: 'retained', adj_close: -1 });
  const envelope = { raw: providerRaw, normalized: { tradingDate: '2026-10-06', open: 10, high: 12, low: 9, close: 11, volume: 100, currency: 'EUR', providerTicker: 'SAP', providerExchange: 'XETR' } };
  const quality = validateEodBars([envelope]);
  assert.equal(quality.validBars[0].date, '2026-10-06');
  assert.equal(quality.validBars[0].providerSymbol, 'SAP');
  assert.strictEqual(quality.validBars[0].raw, envelope);
  assert.strictEqual(quality.validBars[0].providerRaw, providerRaw);
  assert.equal(classifyAdjustment(quality.validBars).status, 'ADJUSTMENT_INVALID');
});

test('duplicate dates quarantine every duplicate rather than selecting or averaging', () => {
  const result = validateEodBars([row('2026-10-06'), row('2026-10-06T00:00:00+0000', { close: 10 })]);
  assert.equal(result.validBars.length, 0);
  assert.ok(result.quarantine.every(bar => bar.reasons.includes('DUPLICATE_DATE')));
});

test('future and uncompleted history bars are quarantined even when other latest evidence is current', () => {
  const raw = [row('2026-10-05'), row('2026-10-06'), row('2026-10-07'), row('2026-10-08')];
  const before = JSON.stringify(raw);
  const result = evaluateEuropePriceSeries({ bars: raw, listing, calendar, now: '2026-10-07T12:00:00Z' });
  assert.deepEqual(result.quality.validBars.map(bar => bar.date), ['2026-10-05', '2026-10-06']);
  assert.ok(result.quality.quarantine[0].reasons.includes('UNCOMPLETED_SESSION_EOD'));
  assert.ok(result.quality.quarantine[1].reasons.includes('FUTURE_EOD_DATE'));
  assert.equal(result.readiness.chart, 'CHART_LIMITED');
  assert.strictEqual(result.quality.quarantine[1].raw, raw[3]);
  assert.equal(JSON.stringify(raw), before);
  // A calendar for a different exchange cannot establish a completion cutoff.
  const foreign = validateEodBars([raw[2]], { listing, now: '2026-10-07T12:00:00Z', calendar: { ...calendar, mic: 'XNAS' } });
  assert.equal(foreign.validBars.length, 1);
});

test('declared history range rejects out-of-range observations without removing original evidence', () => {
  const raw = [row('2026-10-01'), row('2026-10-05'), row('2026-10-06'), row('2026-10-07')];
  const quality = validateEodBars(raw, { listing, now: '2026-10-08T23:00:00Z', requestRange: { from: '2026-10-05', to: '2026-10-06' } });
  assert.deepEqual(quality.validBars.map(bar => bar.date), ['2026-10-05', '2026-10-06']);
  assert.ok(quality.quarantine.every(bar => bar.reasons.includes('OUTSIDE_REQUESTED_RANGE')));
  assert.strictEqual(quality.rawBars, raw);
  assert.throws(() => validateEodBars(raw, { requestRange: { from: '2026-02-30' } }), /INVALID_REQUEST_RANGE/);
  assert.throws(() => validateEodBars(raw, { requestRange: { from: '2026-10-06', to: '2026-10-05' } }), /INVALID_REQUEST_RANGE/);
  assert.throws(() => validateEodBars(raw, { now: 'invalid' }), /INVALID_EVALUATION_TIME/);
});

test('documented listing identity intervals reject historical ticker reuse without guessing continuity', () => {
  const raw = [row('2026-10-05'), row('2026-10-06'), row('2026-10-07'), row('2026-10-08')];
  const boundedListing = { ...listing, identityValidFrom: '2026-10-06', identityValidTo: '2026-10-07' };
  const result = validateEodBars(raw, { listing: boundedListing, now: '2026-10-09T10:00:00Z' });
  assert.deepEqual(result.validBars.map(bar => bar.date), ['2026-10-06', '2026-10-07']);
  assert.ok(result.quarantine.every(bar => bar.reasons.includes('OUTSIDE_LISTING_IDENTITY_INTERVAL')));
  assert.strictEqual(result.quarantine[0].raw, raw[0]);
  assert.strictEqual(result.quarantine[1].raw, raw[3]);
  assert.equal(validateEodBars(raw, { listing, now: '2026-10-09T10:00:00Z' }).validBars.length, 4);
  assert.throws(() => validateEodBars(raw, { listing: { ...listing, identityValidFrom: '2026-02-30' } }), /INVALID_LISTING_IDENTITY_INTERVAL/);
  assert.throws(() => validateEodBars(raw, { listing: { ...listing, identityValidFrom: '2026-10-07', identityValidTo: '2026-10-06' } }), /INVALID_LISTING_IDENTITY_INTERVAL/);
});

test('invalid date and numeric strings are not guessed or coerced into prices', () => {
  const result = validateEodBars([row('2026-02-30'), row('2026-10-06', { open: '10' })]);
  assert.equal(result.quarantine.length, 2);
  assert.ok(result.quarantine[0].reasons.includes('INVALID_DATE'));
  assert.ok(result.quarantine[1].reasons.includes('NON_NUMERIC_OHLC'));
});

test('mixed currencies without known listing currency quarantine every ambiguous bar', () => {
  const result = validateEodBars([row('2026-10-05'), row('2026-10-06', { currency: 'GBP' })]);
  assert.equal(result.validBars.length, 0);
  assert.ok(result.quarantine.every(bar => bar.reasons.includes('CURRENCY_INCONSISTENT')));
  const known = validateEodBars(result.rawBars, { listing: { currency: 'EUR' } });
  assert.equal(known.validBars.length, 1);
});

test('only null or absent provider currency can use canonical listing basis; explicit malformed declarations quarantine', () => {
  for (const currency of [false, 0, '', 'eur', 'EU', 'EUR ', {}, 'GBp']) {
    const raw = row('2026-10-06', { currency });
    const envelope = { raw, normalized: { tradingDate: '2026-10-06', providerTicker: 'SAP', providerExchange: 'XETR',
      currency: 'EUR', open: 10, high: 12, low: 9, close: 11, volume: 100 } };
    const quality = validateEodBars([envelope], { listing });
    assert.equal(quality.validBars.length, 0);
    assert.ok(quality.quarantine[0].reasons.includes('INVALID_CURRENCY_DECLARATION'));
    assert.strictEqual(quality.quarantine[0].providerRaw, raw);
    assert.equal(envelope.raw.currency, currency);
  }
  const raw = row('2026-10-06', { currency: null });
  const quality = validateEodBars([raw], { listing });
  assert.equal(quality.validBars[0].currency, 'EUR');
  assert.equal(raw.currency, null);
});

test('missing volume stays null, zero volume remains a flagged provider observation', () => {
  const result = validateEodBars([row('2026-10-05', { volume: null }), row('2026-10-06', { volume: 0 })]);
  assert.equal(result.validBars[0].volume, null);
  assert.equal(result.validBars[1].volume, 0);
  assert.equal(result.volumeVerified, false);
  assert.deepEqual(result.warnings.map(w => w.code), ['VOLUME_MISSING', 'ZERO_VOLUME']);
});

test('abnormal jumps are retained for review and missing sessions require calendar evidence', () => {
  const raw = [row('2026-10-05'), row('2026-10-07', { open: 30, high: 32, low: 29, close: 31 })];
  const unverified = validateEodBars(raw, { calendar: { expectedSessions: ['2026-10-06'] } });
  assert.equal(unverified.validBars.length, 2);
  assert.equal(unverified.missingDates, null);
  assert.equal(unverified.warnings[0].code, 'ABNORMAL_PRICE_GAP');
  const verified = validateEodBars(raw, { calendar, listing });
  assert.deepEqual(verified.missingDates, ['2026-10-06']);
});

test('pre-close and holiday freshness follow explicit completed-session evidence', () => {
  assert.equal(evaluateFreshness({ latestDate: '2026-10-06', now: '2026-10-07T12:00:00Z', calendar, listing }).status, 'LAST_VALID_SESSION');
  assert.equal(evaluateFreshness({ latestDate: '2026-10-06', now: '2026-10-06T23:00:00Z', calendar, listing }).status, 'CURRENT');
  assert.equal(evaluateFreshness({ latestDate: '2026-10-05', now: '2026-10-07T12:00:00Z', calendar, listing }).status, 'DELAYED');
  assert.equal(evaluateFreshness({ latestDate: '2026-09-01', now: '2026-10-07T12:00:00Z', calendar, listing }).status, 'STALE');
});

test('unknown calendar never claims freshness and future/uncompleted EOD is invalid', () => {
  const unknown = evaluateFreshness({ latestDate: '2026-10-06', now: '2026-10-07T12:00:00Z' });
  assert.equal(unknown.status, 'DELAYED');
  assert.equal(unknown.uncertainty, 'EXCHANGE_CALENDAR_UNVERIFIED');
  assert.equal(evaluateFreshness({ latestDate: '2026-10-07', now: '2026-10-07T12:00:00Z', calendar, listing }).status, 'INVALID');
  assert.equal(evaluateFreshness({ latestDate: '2026-10-08', now: '2026-10-07T12:00:00Z' }).status, 'INVALID');
  assert.equal(evaluateFreshness().status, 'MISSING');
});

test('current snapshots never become realtime from timestamp alone', () => {
  const snapshot = { timestamp: '2026-10-08T10:00:00Z', price: 11, symbol: 'SAP', exchange: 'XETR', currency: 'EUR' };
  const options = { now: '2026-10-08T10:01:00Z', listing };
  assert.equal(assessSnapshot(snapshot, options).status, 'SNAPSHOT_CURRENT');
  assert.equal(assessSnapshot(snapshot, { ...options, semanticsEvidence: { verified: true, source: 'contract-fixture', realtime: true, mic: 'XETR', providerTicker: 'SAP' } }).status, 'REALTIME_OBSERVED');
  assert.equal(assessSnapshot(snapshot, { now: '2026-10-08T12:00:00Z' }).status, 'SNAPSHOT_DELAY_UNKNOWN');
  assert.equal(assessSnapshot(null, options).status, 'EOD_ONLY');
});

test('provider adjusted OHLC alone never receives certification', () => {
  const bars = [row('2026-10-06', { adj_open: 10, adj_high: 12, adj_low: 9, adj_close: 11 })];
  const result = classifyAdjustment(bars);
  assert.equal(result.status, 'ADJUSTMENT_UNKNOWN');
  assert.equal(result.useProviderAdjusted, false);
  assert.equal(classifyAdjustment([row('2026-10-06', { adj_close: -1 })]).status, 'ADJUSTMENT_INVALID');
});

test('actual close-only adjusted coverage is PARTIAL; null siblings are not invalid and no field is trusted', () => {
  const actual = row('2016-10-10', { adj_close: 37.5343, adj_open: null, adj_high: null, adj_low: null, adj_volume: null });
  const before = JSON.stringify(actual), result = classifyAdjustment([actual]);
  assert.equal(result.status, 'ADJUSTMENT_PARTIAL');
  assert.equal(result.invalid.length, 0); assert.equal(result.coverage.partialOhlcRows, 1); assert.equal(result.coverage.completeOhlcRows, 0);
  assert.equal(result.coverage.observedFields.adj_close, 1); assert.equal(result.coverage.observedFields.adj_open, 0);
  assert.equal(result.coverage.providerBasisCertified, false); assert.equal(result.useProviderAdjusted, false); assert.equal(JSON.stringify(actual), before);
  assert.equal(classifyAdjustment([row('2026-10-06', { adj_open: null, adj_high: null, adj_low: null, adj_close: null })]).status, 'ADJUSTMENT_UNKNOWN');
  const strings = classifyAdjustment([row('2026-10-06', { adj_close: '37.5343', adj_volume: '0' })]);
  assert.equal(strings.status, 'ADJUSTMENT_PARTIAL'); assert.equal(strings.coverage.numericStringFields, 2); assert.equal(strings.useProviderAdjusted, false);
  for (const value of [-1, 0, 'not-a-number', '', false, Infinity]) assert.equal(classifyAdjustment([row('2026-10-06', { adj_close: value })]).status, 'ADJUSTMENT_INVALID');
  assert.equal(classifyAdjustment([row('2026-10-06', { adj_open: 10, adj_high: 8, adj_low: 9, adj_close: 11 })]).status, 'ADJUSTMENT_INVALID');
});

test('adjustment certification requires independent series match and verified corporate-action coverage', () => {
  const bars = [row('2026-10-05'), row('2026-10-06')];
  const canonicalSeries = Canonical.fromRows(bars, { instrumentId: 'test-only', currency: 'EUR', exchange: 'XETR', source: 'test', priceSeriesType: 'SPLIT_ADJUSTED' });
  const evidence = { verified: true, independent: true, source: 'independent-fixture', document: 'fixture-document', basis: 'SPLIT_ADJUSTED', seriesMatched: true, canonicalSeriesHash: canonicalSeries.dataHash };
  assert.equal(classifyAdjustment([], { evidence }).status, 'ADJUSTMENT_PARTIAL');
  assert.equal(classifyAdjustment(bars, { evidence, canonicalSeries, corporateActions: { status: 'VERIFIED' } }).status, 'ADJUSTMENT_CERTIFIED');
  assert.equal(classifyAdjustment([], { evidence, canonicalSeries, corporateActions: { status: 'VERIFIED' } }).status, 'ADJUSTMENT_PARTIAL');
  assert.equal(classifyAdjustment(bars, { evidence: { ...evidence, basis: 'TOTAL_RETURN' }, canonicalSeries, corporateActions: { status: 'VERIFIED' } }).status, 'ADJUSTMENT_PARTIAL');
});

test('split actions cross-check raw jumps without rewriting raw bars', () => {
  const bars = [row('2026-10-05', { open: 100, high: 101, low: 99, close: 100 }), row('2026-10-06', { open: 50, high: 51, low: 49, close: 50 })];
  const evidence = { verified: true, independent: true, complete: true, source: 'fixture-corporate-actions', document: 'fixture-document',
    providerTicker: 'SAP', mic: 'XETR', from: '2026-10-05', to: '2026-10-06', ratioConvention: 'NEW_SHARES_PER_OLD_SHARE' };
  const action = { type: 'SPLIT', date: '2026-10-06', ratio: 2, symbol: 'SAP', exchange: 'XETR' };
  const consistent = assessCorporateActions([action], bars, evidence, listing);
  assert.equal(consistent.status, 'VERIFIED');
  assert.equal(consistent.crossChecks[0].status, 'CONSISTENT');
  assert.equal(assessCorporateActions([{ ...action, ratio: 10 }], bars, evidence, listing).status, 'UNKNOWN');
  assert.equal(assessCorporateActions([{ ...action, ratio: 0 }], bars, evidence, listing).status, 'INVALID');
  assert.equal(assessCorporateActions([], bars).status, 'UNKNOWN');
  assert.equal(bars[0].close, 100);
});

test('history reports span separately from missing calendar completeness and max history', () => {
  const result = assessHistory([row('2020-10-01'), row('2026-10-06')]);
  assert.equal(result.horizons['5Y'].status, 'SPAN_AVAILABLE');
  assert.equal(result.horizons['5Y'].completeness, 'UNKNOWN');
  assert.equal(result.horizons['10Y'].status, 'LIMITED');
  assert.equal(result.horizons.max.status, 'UNKNOWN');
});

test('valid raw bars enable chart separately while Quant/SuperTrader gates stay closed', () => {
  const result = evaluateEuropePriceSeries({ bars: [row('2026-10-05'), row('2026-10-06')], listing: { currency: 'EUR' }, now: '2026-10-07T12:00:00Z', calendar });
  assert.equal(result.readiness.chart, 'CHART_READY');
  assert.equal(result.readiness.technical, 'TECHNICAL_PARTIAL');
  assert.equal(result.readiness.indicators.RS.status, 'RS_BLOCKED');
  assert.equal(result.readiness.supertrader, 'SUPERTRADER_BLOCKED');
  assert.equal(result.readiness.backtest, 'RESEARCH_ONLY');
  assert.equal(result.readiness.productionReady, false);
});

test('certified technical projection runs only on an independently certified canonical basis', () => {
  const start = Date.parse('2025-01-01');
  const bars = Array.from({ length: 300 }, (_, i) => row(new Date(start + i * 86400000).toISOString().slice(0, 10), { open: 10 + i / 100, high: 11 + i / 100, low: 9 + i / 100, close: 10 + i / 100 }));
  const canonicalSeries = Canonical.fromRows(bars, { instrumentId: 'test-only', currency: 'EUR', exchange: 'XETR', source: 'test', priceSeriesType: 'SPLIT_ADJUSTED' });
  const result = evaluateEuropePriceSeries({ bars, canonicalSeries, listing, now: '2025-10-28T23:00:00Z',
    calendar: { verified: true, mic: 'XETR', source: 'fixture-explicit-sessions', expectedLastCompletedSession: bars.at(-1).date, expectedSessions: bars.map(b => b.date) },
    corporateActionEvidence: { verified: true, independent: true, complete: true, source: 'fixture-actions', document: 'fixture-document', providerTicker: 'SAP', mic: 'XETR', from: bars[0].date, to: bars.at(-1).date, ratioConvention: 'NEW_SHARES_PER_OLD_SHARE' },
    adjustmentEvidence: { verified: true, independent: true, source: 'fixture-independent', document: 'fixture-document', basis: 'SPLIT_ADJUSTED', seriesMatched: true, canonicalSeriesHash: canonicalSeries.dataHash } });
  assert.equal(result.readiness.basisVerified, true);
  assert.equal(result.readiness.indicators.SMA200.status, 'INPUT_READY');
  assert.ok(result.readiness.engineEvidence);
  assert.equal(result.readiness.indicators.RS.status, 'RS_BLOCKED');
  assert.equal(result.readiness.technical, 'TECHNICAL_PARTIAL');
  assert.equal(result.readiness.supertrader, 'SUPERTRADER_BLOCKED');
  assert.equal(result.readiness.productionReady, false);
});

test('private RAW research projects unchanged engine defaults without adjustment or trading admission', () => {
  const bars = Array.from({ length: 300 }, (_, i) => row(new Date(Date.parse('2025-01-01') + i * 86400000).toISOString().slice(0, 10),
    { open: 10 + i / 100, high: 11 + i / 100, low: 9 + i / 100, close: 10 + i / 100 }));
  const before = JSON.stringify(bars), boundListing = { ...listing, securityId: 'exact-security', listingId: 'exact-listing' };
  const boundCalendar = { verified: true, mic: 'XETR', source: 'fixture-declared-sessions', expectedLastCompletedSession: bars.at(-1).date, expectedSessions: bars.map(bar => bar.date) };
  const result = evaluateEuropePriceSeries({ bars, listing: boundListing, calendar: boundCalendar, now: '2025-10-28T23:00:00Z' });
  const research = result.readiness.researchTechnical;
  const series = Canonical.createSeries({ instrumentId: 'exact-security', exchange: 'XETR', currency: 'EUR', source: 'marketstack', priceSeriesType: 'RAW', timeframe: '1D', sessionType: 'REGULAR' },
    { timestamps: bars.map(bar => bar.date), open: bars.map(bar => bar.open), high: bars.map(bar => bar.high), low: bars.map(bar => bar.low), close: bars.map(bar => bar.close), volume: bars.map(bar => bar.volume) });
  const expected = Features.computeFeatures(series), latest = expected.last();
  assert.equal(research.seriesHash, series.dataHash);
  assert.equal(research.methodology.parametersHash, expected.parametersHash);
  assert.deepEqual(research.methodology.parameters, Features.DEFAULTS);
  assert.deepEqual(research.metrics, { sma20: latest.sma20, sma50: latest.sma50, sma200: latest.sma200, high52w: latest.high52w,
    momentum12M: latest.momentum12M, momentum: latest.momentum12M, volatility: latest.realizedVol, drawdown: latest.drawdown, RS: null, relativeStrength: null, breakout: null });
  assert.equal(research.securityId, 'exact-security'); assert.equal(research.listingId, 'exact-listing');
  assert.equal(research.status, 'RAW_RESEARCH_ONLY'); assert.equal(research.scope, 'PRIVATE_RAW_RESEARCH');
  assert.equal(research.adjustmentCertified, false); assert.equal(research.rsStatus, 'RS_BLOCKED');
  assert.equal(research.quantReady, false); assert.equal(research.supertraderReady, false); assert.equal(research.backtestReady, false); assert.equal(research.publicationReady, false);
  assert.equal(result.adjustment.status, 'ADJUSTMENT_UNKNOWN'); assert.equal(result.readiness.basisVerified, false);
  assert.equal(result.readiness.engineEvidence, null); assert.equal(result.readiness.supertrader, 'SUPERTRADER_BLOCKED');
  assert.equal(result.readiness.technical, 'TECHNICAL_PARTIAL'); assert.equal(JSON.stringify(bars), before);
});

test('private RAW research never stitches missing sessions or quarantined bars; warm-up remains null', () => {
  const bars = Array.from({ length: 65 }, (_, i) => row(new Date(Date.parse('2026-01-01') + i * 86400000).toISOString().slice(0, 10)));
  const sessions = bars.map(bar => bar.date), boundCalendar = { verified: true, mic: 'XETR', source: 'fixture-declared-sessions', expectedLastCompletedSession: bars.at(-1).date, expectedSessions: sessions };
  bars[40].close = -1;
  bars.splice(45, 1);
  const result = evaluateEuropePriceSeries({ bars, listing, calendar: boundCalendar, now: '2026-03-10T23:00:00Z' });
  const research = result.readiness.researchTechnical;
  assert.equal(research.quality.observations, 19);
  assert.equal(research.quality.from, sessions[46]);
  assert.equal(research.quality.quarantinedObservations, 1);
  assert.equal(research.metrics.sma20, null); assert.equal(research.metrics.sma50, null); assert.equal(research.metrics.momentum12M, null);
  assert.equal(research.metrics.volatility, null); assert.equal(research.metrics.drawdown, 0);
  assert.equal(result.readiness.chart, 'CHART_LIMITED');
});

test('private RAW research requires exact European calendar and reported identity', () => {
  const bars = [row('2026-10-05'), row('2026-10-06')];
  for (const boundCalendar of [{}, { ...calendar, mic: 'XNAS' }, { ...calendar, expectedSessions: undefined }, { ...calendar, expectedSessions: [...calendar.expectedSessions].reverse() }]) {
    const result = evaluateEuropePriceSeries({ bars, listing, calendar: boundCalendar, now: '2026-10-07T23:00:00Z' });
    assert.equal(result.readiness.researchTechnical.engineProjection, false);
    assert.equal(result.readiness.researchTechnical.metrics.sma20, null);
  }
  const absent = bars.map(({ symbol, exchange, ...bar }) => bar);
  const result = evaluateEuropePriceSeries({ bars: absent, listing, calendar, now: '2026-10-07T23:00:00Z' });
  assert.equal(result.readiness.researchTechnical.engineProjection, false);
});

test('European benchmark proof binds documented MIC, exact hash, adjustment and currency before RS calculation', () => {
  const bars = Array.from({ length: 300 }, (_, i) => row(new Date(Date.parse('2025-01-01') + i * 86400000).toISOString().slice(0, 10),
    { open: 10 + i / 100, high: 11 + i / 100, low: 9 + i / 100, close: 10 + i / 100 }));
  const canonicalSeries = Canonical.fromRows(bars, { instrumentId: 'test-only', currency: 'EUR', exchange: 'XETR', source: 'test', priceSeriesType: 'SPLIT_ADJUSTED' });
  const benchSeries = Canonical.fromRows(bars.map(bar => ({ ...bar, symbol: 'EU-BENCHMARK' })), { instrumentId: 'fixture-europe-benchmark', currency: 'EUR', exchange: 'XPAR', source: 'test', priceSeriesType: 'SPLIT_ADJUSTED' });
  const benchmark = { verified: true, independent: true, source: 'independent-europe-benchmark', document: 'fixture-methodology-and-adjustment', region: 'EUROPE',
    mic: 'XPAR', adjustmentStatus: 'ADJUSTMENT_CERTIFIED', seriesHash: benchSeries.dataHash, series: benchSeries };
  const base = { bars, canonicalSeries, listing, now: '2025-10-28T23:00:00Z',
    calendar: { verified: true, mic: 'XETR', source: 'fixture-explicit-sessions', expectedLastCompletedSession: bars.at(-1).date, expectedSessions: bars.map(bar => bar.date) },
    corporateActionEvidence: { verified: true, independent: true, complete: true, source: 'fixture-actions', document: 'fixture-document', providerTicker: 'SAP', mic: 'XETR', from: bars[0].date, to: bars.at(-1).date, ratioConvention: 'NEW_SHARES_PER_OLD_SHARE' },
    adjustmentEvidence: { verified: true, independent: true, source: 'fixture-independent', document: 'fixture-document', basis: 'SPLIT_ADJUSTED', seriesMatched: true, canonicalSeriesHash: canonicalSeries.dataHash } };
  const positive = evaluateEuropePriceSeries({ ...base, benchmark }).readiness;
  assert.equal(positive.benchmarkVerified, true);
  assert.ok(positive.relativeStrength);
  const usSeries = Canonical.fromRows(bars, { instrumentId: 'fixture-us-benchmark', currency: 'EUR', exchange: 'XNAS', source: 'test', priceSeriesType: 'SPLIT_ADJUSTED' });
  const gbpSeries = Canonical.fromRows(bars, { instrumentId: 'fixture-currency-benchmark', currency: 'GBP', exchange: 'XLON', source: 'test', priceSeriesType: 'SPLIT_ADJUSTED' });
  for (const change of [{ mic: 'XNAS', series: usSeries, seriesHash: usSeries.dataHash }, { mic: 'XETR' }, { seriesHash: 'wrong' }, { independent: false },
    { document: null }, { adjustmentStatus: 'ADJUSTMENT_UNKNOWN' }, { series: { ...benchSeries, dataHash: '0'.repeat(16) }, seriesHash: '0'.repeat(16) },
    { mic: 'XLON', series: gbpSeries, seriesHash: gbpSeries.dataHash }]) {
    const readiness = evaluateEuropePriceSeries({ ...base, benchmark: { ...benchmark, ...change } }).readiness;
    assert.equal(readiness.benchmarkVerified, false);
    assert.equal(readiness.indicators.RS.status, 'RS_BLOCKED');
    assert.equal(readiness.relativeStrength, null);
    assert.equal(readiness.supertrader, 'SUPERTRADER_BLOCKED');
  }
});

test('adjustment certificate cannot be reused for a different canonical series', () => {
  const bars = [row('2026-10-05'), row('2026-10-06')];
  const canonicalSeries = Canonical.fromRows(bars, { instrumentId: 'test-only', currency: 'EUR', exchange: 'XETR', source: 'test', priceSeriesType: 'SPLIT_ADJUSTED' });
  const result = evaluateEuropePriceSeries({ bars, canonicalSeries, now: '2026-10-07T12:00:00Z', calendar,
    corporateActionEvidence: { verified: true, complete: true, source: 'fixture-actions' },
    adjustmentEvidence: { verified: true, independent: true, source: 'fixture-independent', basis: 'SPLIT_ADJUSTED', seriesMatched: true, canonicalSeriesHash: 'different-series' } });
  assert.equal(result.readiness.basisVerified, false);
  assert.equal(result.readiness.engineEvidence, null);
});

test('foreign or ambiguous provider listing identity is quarantined and cannot borrow a US calendar', () => {
  const bars = [row('2026-10-06', { symbol: 'WRONG', exchange: 'XNAS' }),
    { raw: row('2026-10-07', { symbol: 'WRONG', exchange: 'XNAS' }), normalized: { ...row('2026-10-07'), providerTicker: 'SAP', providerExchange: 'XETR' } }];
  const result = evaluateEuropePriceSeries({ bars, listing, now: '2026-10-07T23:00:00Z', calendar: { ...calendar, mic: 'XNAS', expectedLastCompletedSession: '2026-10-07' } });
  assert.equal(result.quality.validBars.length, 0);
  assert.equal(result.quality.quarantine.length, 2);
  assert.ok(result.quality.quarantine.every(bar => bar.reasons.includes('PROVIDER_MIC_MISMATCH')));
  assert.equal(result.readiness.chart, 'CHART_BLOCKED');
  assert.equal(result.freshness.calendarVerified, false);
  const local = evaluateEuropePriceSeries({ bars: [row('2026-10-07')], listing, now: '2026-10-07T23:00:00Z', calendar: { ...calendar, mic: 'XNAS', expectedLastCompletedSession: '2026-10-07' } });
  assert.equal(local.freshness.status, 'DELAYED');
  assert.equal(local.quality.missingDates, null);
});

test('snapshot timezone or identity ambiguity cannot claim current/realtime observations', () => {
  const snapshot = { symbol: 'SAP', exchange: 'XETR', currency: 'EUR', timestamp: '2026-10-08T10:00:00', price: 11 };
  const options = { now: '2026-10-08T10:01:00Z', listing, semanticsEvidence: { verified: true, source: 'fixture', realtime: true, mic: 'XETR', providerTicker: 'SAP' } };
  assert.equal(assessSnapshot(snapshot, options).status, 'SNAPSHOT_DELAY_UNKNOWN');
  assert.equal(assessSnapshot({ ...snapshot, timestamp: '2026-10-08T10:00:00Z', exchange: 'XNAS' }, options).status, 'UNAVAILABLE');
  assert.equal(assessSnapshot({ timestamp: '2026-10-08T10:00:00Z', price: 11 }, options).status, 'SNAPSHOT_DELAY_UNKNOWN');
  assert.equal(assessSnapshot({ ...snapshot, timestamp: '2026-10-08T10:00:00Z' }, { ...options, semanticsEvidence: { ...options.semanticsEvidence, mic: 'XNAS' } }).status, 'SNAPSHOT_CURRENT');
});

test('optional action assessment cannot certify a missing inline dividend event', () => {
  const bars = [row('2026-10-05'), row('2026-10-06', { dividend: 1 })];
  assert.equal(assessCorporateActions([], bars, { verified: true, complete: true, source: 'fixture' }, listing).status, 'UNKNOWN');
});

test('snapshot raw/normalized symbol or currency conflicts cannot become current', () => {
  const options = { now: '2026-10-08T10:01:00Z', listing };
  const snapshot = { symbol: 'SAP', exchange: 'XETR', currency: 'EUR', timestamp: '2026-10-08T10:00:00Z', price: 11 };
  assert.equal(assessSnapshot({ ...snapshot, currency: 'USD' }, options).status, 'UNAVAILABLE');
  assert.equal(assessSnapshot({ raw: { ...snapshot, symbol: 'WRONG' }, normalized: { providerTicker: 'SAP', providerExchange: 'XETR', currency: 'EUR', price: 11, marketTimestamp: snapshot.timestamp } }, options).status, 'UNAVAILABLE');
  assert.equal(assessSnapshot({ ...snapshot, currency: undefined }, options).status, 'SNAPSHOT_DELAY_UNKNOWN');
  const conflicting = validateEodBars([{ raw: row('2026-10-06', { currency: 'USD' }), normalized: { ...row('2026-10-06'), currency: 'EUR' } }], { listing });
  assert.equal(conflicting.quarantine.length, 1);
  assert.ok(conflicting.quarantine[0].reasons.includes('CURRENCY_INCONSISTENT'));
});
