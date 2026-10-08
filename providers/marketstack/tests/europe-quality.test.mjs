import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateEodBars, evaluateFreshness, assessSnapshot, assessCorporateActions,
  classifyAdjustment, assessHistory, evaluateEuropePriceSeries } from '../../../scripts/marketstack/europe-quality.mjs';
const require = createRequire(import.meta.url);
const Canonical = require('../../../quant/engines/technical/canonical-bars.js');
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

test('existing technical feature engines run only on an independently certified canonical basis', () => {
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
