import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEuropeActions, reconcileEuropeActions, buildVerifiedEuropeCanonicalSeries } from '../../../scripts/marketstack/europe-actions.mjs';
const listing = { providerTicker: 'SAP', mic: 'XETR', currency: 'EUR', instrumentId: 'test-security-sap' };
const bar = (date, close, extra = {}) => ({ date, symbol: 'SAP', exchange: 'XETR', open: close, high: close + 1, low: close - 1, close, volume: 100, currency: 'EUR', ...extra });
const bars = [bar('2026-10-05', 100), bar('2026-10-06', 50, { split_factor: 2 }), bar('2026-10-07', 51)];
const split = { date: '2026-10-06', symbol: 'SAP', exchange: 'XETR', split_factor: 2 };
const evidence = { verified: true, independent: true, complete: true, source: 'independent-fixture', document: 'fixture://independent-evidence',
  providerTicker: 'SAP', mic: 'XETR', from: '2026-10-01', to: '2026-10-08', ratioConvention: 'NEW_SHARES_PER_OLD_SHARE' };

test('provider normal action fields and observation wrappers retain every raw field', () => {
  const raw = { ...split, unsupported_future_field: { nested: 1 } };
  const wrapper = { raw, normalized: { providerTicker: 'SAP', providerExchange: 'XETR', splitFactor: 2, tradingDate: split.date } };
  const result = normalizeEuropeActions([wrapper], { listing, eventKind: 'SPLIT' });
  assert.equal(result.events[0].type, 'SPLIT');
  assert.equal(result.events[0].status, 'PROVIDER_MATCHED');
  assert.strictEqual(result.events[0].raw, wrapper);
  assert.strictEqual(result.events[0].providerRaw, raw);
  assert.deepEqual(raw.unsupported_future_field, { nested: 1 });
});

test('reverse splits, special dividends and symbol changes preserve their own semantics', () => {
  const result = normalizeEuropeActions([
    { ...split, split_factor: 0.1 },
    { date: '2026-10-07', symbol: 'SAP', exchange: 'XETR', type: 'SPECIAL_DIVIDEND', dividend: 2.5, currency: 'EUR' },
    { date: '2026-10-07', symbol: 'SAP', exchange: 'XETR', type: 'SYMBOL_CHANGE', old_symbol: 'SAPOLD', new_symbol: 'SAP' }
  ], { listing });
  assert.deepEqual(result.events.map(event => event.type), ['REVERSE_SPLIT', 'SPECIAL_DIVIDEND', 'SYMBOL_CHANGE']);
  assert.equal(result.events[1].amount, 2.5);
  assert.equal(result.events[2].oldSymbol, 'SAPOLD');
});

test('missing venue remains UNKNOWN and does not establish absence or an unsupported capability', () => {
  const result = normalizeEuropeActions([{ ...split, exchange: undefined }], { listing });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.events[0].status, 'UNKNOWN');
  assert.ok(result.events[0].reasons.includes('EVENT_VENUE_NOT_REPORTED'));
  assert.equal(result.absenceEstablished, false);
  assert.equal(normalizeEuropeActions([], { listing }).status, 'UNKNOWN');
});

test('exact symbol, MIC and valid calendar date gates reject mismatch', () => {
  assert.equal(normalizeEuropeActions([{ ...split, symbol: 'ADR-SAP' }], { listing }).status, 'INVALID');
  assert.equal(normalizeEuropeActions([{ ...split, exchange: 'XNYS' }], { listing }).status, 'INVALID');
  assert.equal(normalizeEuropeActions([{ ...split, date: '2026-02-30' }], { listing }).status, 'INVALID');
  const aliases = normalizeEuropeActions([{ ...split, symbol: 'SAPALT' }], { listing: { ...listing, verifiedAliases: ['SAPALT'] } });
  assert.equal(aliases.events[0].status, 'PROVIDER_MATCHED');
});

test('provider descriptive exchange code is not treated as the missing MIC', () => {
  const result = normalizeEuropeActions([{ ...split, exchange: undefined, exchange_code: 'XETRA' }], { listing });
  assert.equal(result.events[0].mic, null);
  assert.equal(result.events[0].status, 'UNKNOWN');
});

test('duplicate events never multiply adjustment ratios twice', () => {
  const result = buildVerifiedEuropeCanonicalSeries({ actions: [split, { ...split }], bars, listing, evidence });
  assert.equal(result.canonicalSeries, null);
  assert.equal(result.backtest, 'BLOCKED');
  assert.ok(result.normalized.events.every(event => event.reasons.includes('DUPLICATE_EVENT')));
});

test('raw jump and inline factor cross-check does not certify provider adjusted fields', () => {
  const result = reconcileEuropeActions({ actions: [split], bars, listing, evidence });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.correlations[0].rawJumpRatio, 2);
  assert.equal(result.correlations[0].status, 'CONSISTENT');
  assert.equal(result.providerAdjustedCertified, false);
  const mismatch = reconcileEuropeActions({ actions: [split], bars: [bars[0], { ...bars[1], split_factor: 3 }, bars[2]], listing, evidence });
  assert.equal(mismatch.status, 'UNKNOWN');
  assert.ok(mismatch.issues.some(issue => issue.code === 'SPLIT_FACTOR_CONFLICT'));
});

test('unexplained price movement or unmatched inline split blocks canonical generation', () => {
  const wrongJump = reconcileEuropeActions({ actions: [split], bars: [bars[0], bar('2026-10-06', 5, { split_factor: 2 })], listing, evidence });
  assert.equal(wrongJump.status, 'UNKNOWN');
  assert.ok(wrongJump.issues.some(issue => issue.code === 'RAW_SPLIT_JUMP_INCONSISTENT'));
  const missingEvent = reconcileEuropeActions({ actions: [], bars, listing, evidence });
  assert.equal(missingEvent.status, 'UNKNOWN');
  assert.ok(missingEvent.issues.some(issue => issue.code === 'INLINE_SPLIT_WITHOUT_MATCHED_EVENT'));
});

test('event dates must match observed sessions exactly and are never shifted', () => {
  const result = reconcileEuropeActions({ actions: [{ ...split, date: '2026-10-06' }], bars: [bars[0], bars[2]], listing, evidence });
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.issues.some(issue => issue.code === 'ACTION_SESSION_MISSING'));
});

test('independent complete documentation must cover this exact listing and entire interval', () => {
  for (const invalidEvidence of [{ ...evidence, document: null }, { ...evidence, independent: false },
    { ...evidence, from: '2026-10-06' }, { ...evidence, mic: 'XNYS' }, { ...evidence, ratioConvention: 'OLD_PER_NEW' }]) {
    const result = buildVerifiedEuropeCanonicalSeries({ actions: [split], bars, listing, evidence: invalidEvidence });
    assert.equal(result.canonicalSeries, null);
    assert.equal(result.priceBasis, 'RAW');
    assert.equal(result.chart, 'CHART_LIMITED');
    assert.equal(result.backtest, 'BLOCKED');
  }
});

test('canonical split transformations use existing engine geometry and preserve raw bars', () => {
  const before = JSON.stringify(bars);
  const result = buildVerifiedEuropeCanonicalSeries({ actions: [split], bars, listing, evidence });
  assert.equal(result.priceBasis, 'SPLIT_ADJUSTED');
  assert.deepEqual(result.canonicalSeries.close, [50, 50, 51]);
  assert.deepEqual(result.canonicalSeries.volume, [200, 100, 100]);
  assert.deepEqual(result.canonicalSeries.adjustmentFactor, [0.5, 1, 1]);
  assert.deepEqual(result.candidateLatestClose, { date: '2026-10-07', close: 51, currency: 'EUR', source: 'marketstack', basis: 'SPLIT_ADJUSTED', publicDisplay: false });
  assert.equal(result.adjustmentEvidence.canonicalSeriesHash, result.canonicalSeries.dataHash);
  assert.equal(result.productionReady, false);
  assert.equal(JSON.stringify(bars), before);
});

test('reverse split uses the same existing factor geometry', () => {
  const reverseBars = [bar('2026-10-05', 5), bar('2026-10-06', 50, { split_factor: 0.1 })];
  const result = buildVerifiedEuropeCanonicalSeries({ actions: [{ ...split, split_factor: 0.1 }], bars: reverseBars, listing, evidence });
  assert.deepEqual(result.canonicalSeries.close, [50, 50]);
  assert.deepEqual(result.canonicalSeries.volume, [10, 100]);
});

test('dividend amount and currency consistency do not attribute all price movement to payouts', () => {
  const dividend = { date: '2026-10-06', symbol: 'SAP', exchange: 'XETR', dividend: 1, currency: 'EUR' };
  const result = reconcileEuropeActions({ actions: [dividend], bars: [bar('2026-10-05', 100), bar('2026-10-06', 99, { dividend: 1 })], listing, evidence });
  assert.equal(result.correlations[0].status, 'OBSERVED_NOT_CAUSALLY_ATTRIBUTED');
  assert.equal(result.status, 'VERIFIED');
  const wrongCurrency = reconcileEuropeActions({ actions: [{ ...dividend, currency: 'USD' }], bars: [bar('2026-10-05', 100), bar('2026-10-06', 99)], listing, evidence });
  assert.equal(wrongCurrency.status, 'UNKNOWN');
  assert.ok(wrongCurrency.issues.some(issue => issue.code === 'DIVIDEND_CURRENCY_MISMATCH'));
});

test('symbol changes require explicit independently documented continuity', () => {
  const symbolChange = { date: '2026-10-06', symbol: 'SAP', exchange: 'XETR', type: 'SYMBOL_CHANGE', old_symbol: 'SAPOLD', new_symbol: 'SAP' };
  const result = reconcileEuropeActions({ actions: [symbolChange], bars: [bar('2026-10-05', 50), bar('2026-10-06', 51)], listing, evidence });
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.issues.some(issue => issue.code === 'SYMBOL_CONTINUITY_UNVERIFIED'));
});

test('independent documented absence can establish no events, an empty provider response cannot', () => {
  const plainBars = [bar('2026-10-05', 50), bar('2026-10-06', 51)];
  assert.equal(reconcileEuropeActions({ actions: [], bars: plainBars, listing }).absenceEstablished, false);
  const result = reconcileEuropeActions({ actions: [], bars: plainBars, listing, evidence });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.absenceEstablished, true);
});

test('inline dividend evidence prevents a false no-event certification', () => {
  const result = reconcileEuropeActions({ actions: [], bars: [bar('2026-10-05', 50), bar('2026-10-06', 49, { dividend: 1 })], listing, evidence });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.absenceEstablished, false);
  assert.ok(result.issues.some(issue => issue.code === 'INLINE_DIVIDEND_WITHOUT_MATCHED_EVENT'));
});

test('independent action documentation cannot relabel foreign or identity-absent price bars', () => {
  const foreign = [bar('2026-10-05', 50, { symbol: 'WRONG', exchange: 'XNAS' }), bar('2026-10-06', 51, { symbol: 'WRONG', exchange: 'XNAS' })];
  const result = buildVerifiedEuropeCanonicalSeries({ bars: foreign, listing, evidence });
  assert.equal(result.canonicalSeries, null);
  assert.equal(result.status, 'INVALID');
  assert.equal(result.backtest, 'BLOCKED');
  const unscoped = buildVerifiedEuropeCanonicalSeries({ bars: [bar('2026-10-05', 50, { symbol: undefined, exchange: undefined }), bar('2026-10-06', 51, { symbol: undefined, exchange: undefined })], listing, evidence });
  assert.equal(unscoped.canonicalSeries, null);
  assert.equal(unscoped.status, 'UNKNOWN');
});
