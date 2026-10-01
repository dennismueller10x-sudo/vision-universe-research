import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTiingoWindow, compareTiingoChartWindow, compatibilityForWindow, dividendFactorSteps, observedCloseBasis,
  buildAdjustmentCompatibility } from '../../scripts/market/validate-marketstack-adjustment-compatibility.mjs';
import { analyzeAdjustmentWindow, collectPriceEvidence } from '../../scripts/market/audit-marketstack-scale-adjustments.mjs';

const bar = (date, close, extra = {}) => ({ date, symbol: 'TEST', exchange: 'XNAS', price_currency: 'USD',
  open: close, high: close + 1, low: close - 1, close, adj_close: close,
  split_factor: 1, dividend: 0, currency: 'USD', adjustedClose: close, splitFactor: 1, ...extra });
const control = { symbol: 'TEST', mic: 'XNAS', from: '2020-08-24', to: '2020-09-04' };

test('uniform adjusted-level scale differences are distinguished from return discontinuities', () => {
  const t = [bar('2020-08-28', 500, { adjustedClose: 125 }), bar('2020-08-31', 130, { adjustedClose: 130, splitFactor: 4 }),
    bar('2020-09-01', 134, { adjustedClose: 134 })];
  const m = [bar('2020-08-28', 125, { adj_close: 126.25 }), bar('2020-08-31', 130, { adj_close: 131.3, split_factor: 4 }),
    bar('2020-09-01', 134, { adj_close: 135.34 })];
  const before = JSON.stringify([m, t]);
  const r = compareTiingoWindow(m, t, control);
  assert.equal(r.pairedDays, 3);
  assert.equal(r.rawCloseRatiosByDate[0].factor, 0.25);
  assert.equal(r.rawCloseRatiosByDate[1].factor, 1);
  assert.equal(r.adjustedReturnsConsistentWithinOneBasisPoint, true);
  assert.ok(r.adjustedScaleSpreadBps < 0.0001);
  assert.equal(r.historicalSeriesCertified, false);
  assert.equal(observedCloseBasis(analyzeAdjustmentWindow(m), r), 'REPORTED_CLOSE_ALREADY_SPLIT_SCALED_BEFORE_EVENT_IN_TESTED_DATES');
  assert.equal(JSON.stringify([m, t]), before);
});

test('split-scaled volume alongside raw prices remains visible rather than double-adjusted', () => {
  const t = [bar('2020-08-28', 500, { volume: 10, adjustedVolume: 40 }),
    bar('2020-08-31', 130, { volume: 40, adjustedVolume: 40, splitFactor: 4 }),
    bar('2020-09-01', 134, { volume: 45, adjustedVolume: 45 })];
  const m = t.map(b => ({ ...b, volume: b.adjustedVolume, adj_volume: b.adjustedVolume }));
  const r = compareTiingoWindow(m, t, control);
  assert.equal(r.rawCloseRatiosByDate[0].factor, 1);
  assert.equal(r.reportedVolumeRatiosByDate[0].factor, 4);
  assert.equal(r.reportedVolumeRatiosByDate[1].factor, 1);
  assert.equal(r.reportedAdjVolumeMarketstackToTiingoAdjusted.min, 1);
  assert.equal(r.historicalSeriesCertified, false);
});

test('missing adjusted closes and conflicting duplicate dates never certify adjusted returns', () => {
  const rows = [bar('2020-08-28', 100), bar('2020-08-31', 101), bar('2020-09-01', 102)];
  const missing = compareTiingoWindow(rows.map((b, i) => ({ ...b, adj_close: i === 1 ? null : b.adj_close })), rows, control);
  assert.equal(missing.adjustedReturnsConsistentWithinOneBasisPoint, false);
  const duplicate = compareTiingoWindow([...rows, { ...rows[1], close: 99 }], rows, control);
  assert.deepEqual(duplicate.conflictingDates, ['2020-08-31']);
  assert.equal(duplicate.adjustedReturnsConsistentWithinOneBasisPoint, false);
});

test('wrong MIC, unknown currency and impossible OHLC do not establish paired controls', () => {
  const rows = [bar('2020-08-28', 100), bar('2020-08-31', 101), bar('2020-09-01', 102)];
  assert.equal(compareTiingoWindow(rows.map(b => ({ ...b, exchange: 'XNYS' })), rows, control).pairedDays, 0);
  assert.equal(compareTiingoWindow(rows.map(b => ({ ...b, price_currency: null })), rows, control).pairedDays, 0);
  assert.equal(compareTiingoWindow(rows.map(b => ({ ...b, low: 200 })), rows, control).pairedDays, 0);
});

test('explicit missing-currency diagnostic mode never invents native quote units', () => {
  const rows = [bar('2020-08-28', 100), bar('2020-08-31', 101), bar('2020-09-01', 102)];
  const missing = rows.map(b => ({ ...b, price_currency: null }));
  const r = compareTiingoWindow(missing, rows, { ...control, allowMissingProviderCurrencyForDiagnostic: true });
  assert.equal(r.pairedDays, 3);
  assert.equal(r.adjustedReturnsConsistentWithinOneBasisPoint, true);
  assert.equal(r.currencyValidation, 'NUMERICAL_COMPARISON_ONLY_PROVIDER_HISTORICAL_CURRENCY_MISSING');
  assert.equal(r.missingProviderCurrencyDates.length, 3);
  assert.equal(compatibilityForWindow(analyzeAdjustmentWindow(missing), r).rawCharts, 'UNVERIFIED_CURRENCY');
  assert.equal(compatibilityForWindow(analyzeAdjustmentWindow(missing), r).boundedAdjustedReturnControl, 'CONSISTENT_NUMERICALLY_QUOTE_UNIT_UNVERIFIED');
  assert.equal(compatibilityForWindow(analyzeAdjustmentWindow([rows[0], missing[1]]), r).rawCharts, 'UNVERIFIED_CURRENCY');
});

test('dividend factor steps distinguish visible cash adjustment from copied raw fields without certification', () => {
  const copied = dividendFactorSteps([bar('2020-08-28', 100), bar('2020-08-31', 98, { dividend: 2 })]);
  assert.equal(copied[0].factorStep, 1);
  assert.ok(Math.abs(copied[0].differenceBps + 200) < 0.001);
  const adjusted = dividendFactorSteps([bar('2020-08-28', 100, { adj_close: 98 }), bar('2020-08-31', 98, { dividend: 2 })]);
  assert.ok(Math.abs(adjusted[0].differenceBps) < 0.0001);
  assert.equal(adjusted[0].adjustmentBasisCertified, false);
});

test('an independently matched short split control never promotes full-history strategies', () => {
  const a = analyzeAdjustmentWindow([bar('2020-08-28', 100), bar('2020-08-31', 101)]);
  const c = compatibilityForWindow(a, { adjustedReturnsConsistentWithinOneBasisPoint: true });
  assert.equal(c.rawCharts, 'PARTIAL_DISPLAY_ONLY');
  assert.equal(c.boundedAdjustedReturnControl, 'CONSISTENT_IN_TESTED_WINDOW');
  for (const k of ['continuousAdjustedCharts', 'movingAverages', 'high52Week', 'momentum', 'quant', 'backtesting'])
    assert.equal(c[k], 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS');
  assert.equal(c.admissionChanged, false);
});

test('reverse-split gaps retained in adjusted close block continuous chart and strategy claims', () => {
  const a = analyzeAdjustmentWindow([bar('2021-05-21', 18), bar('2021-05-24', 36, { split_factor: 0.5 })], {
    event: { type: 'REVERSE_SPLIT', factor: 0.5, marketDate: '2021-05-24',
      verification: 'VERIFIED_OFFICIAL_SOURCE', sourceUrl: 'https://issuer.example/reverse' } });
  assert.ok(a.signatures.includes('REPORTED_ADJ_CLOSE_RETAINS_SPLIT_GAP'));
  assert.equal(a.eventObservation.basisSignature, 'UNADJUSTED_SPLIT_GAP_SIGNATURE');
  assert.equal(compatibilityForWindow(a).quant, 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS');
});

test('original source run is retained when a replay wrapper lacks attribution', () => {
  const e = { endpoint: 'eod', params: { symbols: 'TEST', exchange: 'XNAS' }, checkedAt: '2026-10-01T11:00:00Z',
    ok: true, data: { data: [bar('2020-08-28', 100)] } };
  const original = { schemaVersion: 'marketstack-probe-1.0.0', run: { source: 'github-actions', runId: 'original' },
    accounting: { provider: 'marketstack', requestsAttempted: 1 }, endpoints: [e] };
  const replay = { run: { snapshotRunId: 'wrapper' }, endpoints: [{ ...e, seeded: true,
    sourceRunId: null, sourceRunAttribution: 'UNKNOWN_SEEDED_ORIGINAL_RUN' }] };
  const r = collectPriceEvidence([original, replay]);
  assert.equal(r.length, 1); assert.equal(r[0].runId, 'original');
  assert.equal(r[0].sourceRunAttribution, 'ORIGINAL_SINGLE_RUN_PROBE');
  const only = collectPriceEvidence([replay])[0];
  assert.equal(only.runId, null); assert.equal(only.sourceRunAttribution, 'UNKNOWN_SEEDED_ORIGINAL_RUN');
});

test('a later provable source repairs unknown attribution without inventing a fresh retrieval', () => {
  const e = { endpoint: 'eod', params: { symbols: 'TEST' }, checkedAt: '2026-10-01T11:00:00Z',
    ok: true, data: { data: [bar('2020-08-28', 100)] } };
  const original = { schemaVersion: 'marketstack-probe-1.0.0', run: { source: 'github-actions', runId: 'original' },
    accounting: { provider: 'marketstack', requestsAttempted: 1 }, endpoints: [e] };
  const r = collectPriceEvidence([{ endpoints: [{ ...e, seeded: true }] }, original]);
  assert.equal(r.length, 1); assert.equal(r[0].runId, 'original');
  assert.equal(r[0].checkedAt, e.checkedAt);
});

test('a mixed replay with an unseeded response cannot fabricate latest-run provenance', () => {
  const e = { endpoint: 'eod', params: { symbols: 'TEST' }, checkedAt: '2026-09-01T11:00:00Z', ok: true,
    data: { data: [bar('2020-08-28', 100)] } };
  const mixed = { schemaVersion: 'marketstack-probe-1.0.0', run: { runId: 'latest', source: 'github-actions' },
    accounting: { latest: { provider: 'marketstack', requestsAttempted: 1, startedAt: '2026-10-01T11:00:00Z', finishedAt: '2026-10-01T12:00:00Z' } },
    endpoints: [e] };
  const r = collectPriceEvidence([mixed])[0];
  assert.equal(r.runId, null); assert.equal(r.sourceRunAttribution, 'UNKNOWN_OR_AMBIGUOUS_ORIGINAL_RUN');
});

test('object-key reserialization does not manufacture duplicate observations or price conflicts', () => {
  const rows = [bar('2020-08-28', 100), bar('2020-08-31', 101), bar('2020-09-01', 102)];
  const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object' ?
    Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reverseKeys(v)])) : value;
  const e = { endpoint: 'eod', params: { symbols: 'TEST', exchange: 'XNAS' }, checkedAt: '2026-10-01T11:00:00Z',
    sourceRunId: 'original', ok: true, data: { pagination: { total: 3, count: 3 }, data: rows } };
  const copy = reverseKeys(e);
  assert.equal(collectPriceEvidence([{ endpoints: [e, copy] }]).length, 1);
  const paired = compareTiingoWindow([...rows, ...reverseKeys(rows)], rows, control);
  assert.equal(paired.pairedDays, 3); assert.deepEqual(paired.conflictingDates, []);
  const changed = reverseKeys({ ...e, data: { ...e.data, data: [{ ...rows[0], close: 99 }, ...rows.slice(1)] } });
  assert.equal(collectPriceEvidence([{ endpoints: [e, changed] }]).length, 2);
  assert.deepEqual(compareTiingoWindow([...rows, ...changed.data.data], rows, control).conflictingDates, ['2020-08-28']);
});

test('exact weekly chart observations do not become invented daily OHLC or dividend certification', () => {
  const m = [bar('2020-08-28', 100), bar('2020-08-31', 102)];
  const chart = { provider: 'tiingo', ticker: 'TEST', currency: 'USD', priceSeriesType: 'SPLIT_ADJUSTED',
    points: [['2020-08-28', 100], ['2020-08-29', 101]] };
  const r = compareTiingoChartWindow(m, chart, control);
  assert.equal(r.pairedObservations, 1); assert.equal(r.pairs[0].date, '2020-08-28');
  assert.equal(r.interpolatedOrReconstructedPrices, false);
  assert.equal(r.dailyOHLCOrDividendMethodCertified, false);
  assert.equal(compareTiingoChartWindow(m, { ...chart, priceSeriesType: 'UNKNOWN' }, control), null);
});

test('deterministic cached controls preserve each endpoint source attribution and caller timestamp', () => {
  const probe = { run: { snapshotRunId: 'wrapper' }, endpoints: [{ endpoint: 'eod', params: { symbols: 'TEST', exchange: 'XNAS',
    date_from: '2020-08-24', date_to: '2020-09-04' }, checkedAt: '2026-10-01T11:00:00Z', ok: true,
    sourceRunId: 'run1', sourceRunAttribution: 'VERIFIED_LEDGER_AND_RESPONSE', data: { data: [bar('2020-08-28', 100)] } }] };
  const opts = { controls: [control], generatedAt: '2026-10-01T17:17:36.824Z' };
  const r = buildAdjustmentCompatibility([probe], opts);
  assert.equal(JSON.stringify(r), JSON.stringify(buildAdjustmentCompatibility([probe], opts)));
  assert.equal(r.rows[0].sourceObservations[0].sourceRunId, 'run1');
  assert.equal(r.rows[0].sourceObservations[0].sourceRunAttribution, 'VERIFIED_LEDGER_AND_RESPONSE');
  assert.equal(r.generatedAt, opts.generatedAt); assert.equal(r.marketstackRequests, 0);
});

test('absent control observations never assert empirical price-field behavior', () => {
  const r = buildAdjustmentCompatibility([], { controls: [control], generatedAt: '2026-10-01T17:17:36.824Z' });
  assert.equal(r.rows[0].observedCloseBasis, 'NO_PRICE_OBSERVATION_FOR_TESTED_SCOPE');
  assert.equal(r.rows[0].compatibility.rawCharts, 'UNAVAILABLE');
  assert.equal(r.summary.withReturnedPrices, 0);
  assert.equal(r.summary.technicalSeriesCertified, 0);
});

test('actual duplicate provider candles remain unsafe even when redundant snapshots are deduplicated', () => {
  const row = bar('2020-08-28', 100);
  const e = { endpoint: 'eod', ok: true, sourceRunId: 'original', checkedAt: '2026-10-01T11:00:00Z',
    params: { symbols: 'TEST', exchange: 'XNAS', date_from: control.from, date_to: control.to }, data: { data: [row, { ...row }] } };
  const r = buildAdjustmentCompatibility([{ endpoints: [e, { ...e }] }], { controls: [control], generatedAt: '2026-10-01T17:17:36.824Z' });
  assert.equal(r.rows[0].sourceObservations.length, 1);
  assert.equal(r.rows[0].analysis.bars, 2);
  assert.equal(r.rows[0].analysis.issueCountsByFlag.DUPLICATE_CANDLE, 1);
  assert.equal(r.rows[0].compatibility.rawCharts, 'UNSAFE_AS_COMPLETE_WINDOW');
});
