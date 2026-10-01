import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAdjustmentWindow, buildScaleAudit } from '../../scripts/market/audit-marketstack-scale-adjustments.mjs';

// Synthetic diagnostic examples; no API-quality or account-coverage claim.
const bar = (date, close = 100, changes = {}) => ({ date: date + 'T00:00:00+0000',
  open: close, high: close + 1, low: close - 1, close, volume: 100,
  adj_open: close, adj_high: close + 1, adj_low: close - 1, adj_close: close,
  adj_volume: null, split_factor: 1, dividend: 0, ...changes });
const event = { type: 'SPLIT', verification: 'VERIFIED_OFFICIAL_SOURCE',
  sourceUrl: 'https://issuer.example/split', marketDate: '2024-09-27', effectiveDate: '2024-10-01', factor: 5 };

test('adjusted close equal to close around dividend observations never certifies total return', () => {
  const rows = [bar('2025-04-01'), bar('2025-04-02', 98, { dividend: 2 })];
  const before = JSON.stringify(rows), r = analyzeAdjustmentWindow(rows);
  assert.equal(r.identicalAdjustedCloses, 2);
  assert.ok(r.signatures.includes('NO_DIVIDEND_ADJUSTMENT_VISIBLE_IN_REPORTED_ADJ_CLOSE'));
  assert.equal(r.adjustmentStatus, 'UNVERIFIED');
  assert.equal(r.technicalAdmission, 'BLOCKED_UNVERIFIED_PRICE_BASIS');
  assert.equal(JSON.stringify(rows), before);
});

test('split gaps and already continuous series are diagnostics and disclose double-adjustment risk', () => {
  const raw = analyzeAdjustmentWindow([bar('2024-09-26', 500), bar('2024-09-27', 100, { split_factor: 5 })], { event });
  assert.equal(raw.eventObservation.basisSignature, 'UNADJUSTED_SPLIT_GAP_SIGNATURE');
  assert.equal(raw.eventObservation.closeRatioBeforeAfter, 5);
  const adjusted = analyzeAdjustmentWindow([bar('2024-09-26', 100), bar('2024-09-27', 100, { split_factor: 5 })], { event });
  assert.equal(adjusted.eventObservation.basisSignature, 'CONTINUOUS_REPORTED_PRICE_SIGNATURE');
  assert.ok(adjusted.signatures.includes('DOUBLE_ADJUSTMENT_RISK_REVIEW'));
  assert.equal(adjusted.adjustmentStatus, 'UNVERIFIED');
});

test('legal effective dates do not fabricate exchange ex-dates or data values', () => {
  const rows = [bar('2024-09-26'), bar('2024-09-27')];
  const r = analyzeAdjustmentWindow(rows, { event: { ...event, marketDate: null } });
  assert.equal(r.eventObservation.state, 'EVENT_MARKET_DATE_UNVERIFIED');
  assert.equal(r.eventObservation.closeRatioBeforeAfter, undefined);
  const empty = analyzeAdjustmentWindow([], { event });
  assert.equal(empty.firstDate, null);
  assert.equal(empty.eventObservation.state, 'EVENT_WINDOW_INCOMPLETE');
});

test('invalid OHLC, duplicate candles, missing adjusted volume and inconsistent adjusted fields remain visible', () => {
  const r = analyzeAdjustmentWindow([bar('2025-01-01'), bar('2025-01-01', 100, { adj_high: 90 }), bar('2025-01-02', 0)]);
  assert.ok(r.issues.some(i => i.flags.includes('DUPLICATE_CANDLE')));
  assert.ok(r.issues.some(i => i.flags.includes('ADJUSTED_OHLC_IMPOSSIBLE')));
  assert.ok(r.issues.some(i => i.flags.includes('RAW_OHLC_INVALID')));
  assert.equal(r.adjustedVolumeToVolume.count, 0);
  assert.ok(r.signatures.includes('ADJUSTED_VOLUME_UNAVAILABLE'));
});

test('Global Select scope remains explicit with unknown gaps and protected existing ADR preference', () => {
  const p = { run: { runId: 'synthetic' }, endpoints: [{ endpoint: 'eod', ok: true,
    params: { symbols: '7203.T', exchange: 'XJPX' }, data: { data: [bar('2025-01-02', 100, { symbol: '7203.T', exchange: 'XJPX' })] } }] };
  const r = buildScaleAudit([p], { generatedAt: '2026-10-01T00:00:00Z',
    decisions: [{ ticker: 'TM', product_eligibility: 'ELIGIBLE' }],
    listings: [{ providerSymbol: '7203.T', providerExchange: 'XJPX', listingId: 'vu_local', companyId: null }] });
  assert.equal(r.globalSelect.counts.companiesAssessed, 13);
  const toyota = r.globalSelect.rows.find(row => row.company === 'Toyota');
  assert.equal(toyota.preferredConsumerListing, 'TM');
  assert.equal(toyota.issuerLinked, false);
  assert.equal(toyota.historyCoverage, 'PARTIAL');
  assert.equal(toyota.quantAdmission, false);
  assert.equal(r.globalSelect.rows.find(row => row.company === 'Nintendo').historyCoverage, 'UNKNOWN');
  assert.equal(r.adjustments.productionChanged, false);
});

test('multi-symbol EOD pages are partitioned by listing before duplicate candle or coverage analysis', () => {
  const p = { endpoints: [{ endpoint: 'eod/latest', ok: true, params: { symbols: '7203.T,6758.T' },
    data: { data: [bar('2025-01-02', 100, { symbol: '7203.T', exchange: 'XJPX' }), bar('2025-01-02', 200, { symbol: '6758.T', exchange: 'XJPX' })] } }] };
  const r = buildScaleAudit([p]);
  assert.equal(r.adjustments.windows.length, 2);
  assert.equal(r.adjustments.windows.some(w => w.analysis.issues.length), false);
  assert.equal(r.globalSelect.counts.withBoundedReturnedHistory, 2);
});

test('successful name search returning only OTC aliases does not certify local metadata', () => {
  const r = buildScaleAudit([{ endpoints: [{ endpoint: 'tickerslist', ok: true,
    params: { search: 'Samsung Electronics' }, data: { data: [{ ticker: 'SSNLF' }] } }] }]);
  assert.equal(r.globalSelect.rows[0].metadataRequestsObserved, 1);
  assert.equal(r.globalSelect.rows[0].metadataAccessible, false);
});

test('direct and wrapped metadata verify exact local MIC while ticker collisions remain separate windows', () => {
  const r = buildScaleAudit([{ endpoints: [
    { endpoint: 'tickers/7974.T', ok: true, data: { symbol: '7974.T', stock_exchange: { mic: 'XJPX' } } },
    { endpoint: 'tickers/6861.T', ok: true, data: { data: { symbol: '6861.T', stock_exchange: { mic: 'XNYS' } } } },
    { endpoint: 'eod', ok: true, params: { symbols: '7974.T' }, data: { data: [
      bar('2025-01-02', 100, { symbol: '7974.T', exchange: 'XJPX' }),
      bar('2025-01-02', 200, { symbol: '7974.T', exchange: 'XNYS' })] } }
  ] }]);
  const n = r.globalSelect.rows.find(row => row.company === 'Nintendo');
  assert.equal(n.metadataVenueVerified, true);
  assert.equal(n.returnedBars, 1);
  assert.equal(r.globalSelect.rows.find(row => row.company === 'Keyence').metadataAccessible, false);
  assert.equal(r.adjustments.windows.length, 2);
  assert.ok(r.adjustments.windows.every(w => !w.analysis.issues.length));
});

test('same provider dividend endpoint mismatches are flagged without certifying official action basis', () => {
  const r = buildScaleAudit([{ endpoints: [
    { endpoint: 'eod', ok: true, params: { symbols: 'SAP.DE', exchange: 'XETR' }, data: { data: [
      bar('2025-05-14', 100, { symbol: 'SAP.DE', exchange: 'XETR', dividend: 2.35 })] } },
    { endpoint: 'dividends', ok: true, params: { symbols: 'SAP.DE', exchange: 'XETR', date_from: '2025-01-01', date_to: '2025-12-31' },
      data: { pagination: { total: 2 }, data: [{ symbol: 'SAP.DE', date: '2025-05-14', dividend: 2.5 }] } }
  ] }]);
  const check = r.adjustments.actionEndpointCrosschecks[0];
  assert.deepEqual(check.sameDateValueMismatches, ['2025-05-14']);
  assert.equal(check.paginationComplete, false);
  assert.equal(check.verifiedCorporateActionBasis, false);
});

test('measured US latest evidence is visible without becoming historical or adjustment certification', () => {
  const r = buildScaleAudit([], { usLatestRows: [{ providerSymbol: 'MELI', mic: 'XNAS', status: 'VALID_LATEST', validLatest: true, tradingDate: '2026-09-30' }] });
  const m = r.globalSelect.rows.find(row => row.company === 'MercadoLibre');
  assert.equal(m.usBenchmarkLatestValid, true);
  assert.equal(m.usBenchmarkLatestTradingDate, '2026-09-30');
  assert.equal(m.historyCoverage, 'UNKNOWN');
  assert.equal(m.corporateActionBasis, 'UNVERIFIED');
  assert.equal(m.quantAdmission, false);
});

test('official dividend amount correspondence preserves the distinction between payment and verified ex-date', () => {
  const p = { endpoints: [{ endpoint: 'eod', ok: true, params: { symbols: 'ALV.DE', exchange: 'XETR' },
    data: { data: [bar('2026-05-08', 100, { symbol: 'ALV.DE', exchange: 'XETR', dividend: 17.1 })] } }] };
  const c = { providerSymbol: 'ALV.DE', exchange: 'XETR', amount: 17.1, verification: 'VERIFIED_OFFICIAL_SOURCE', sourceUrl: 'https://issuer.example/dividend' };
  const r = buildScaleAudit([p], { dividendControls: [{ ...c, marketDate: '2026-05-08' }, { ...c, marketDate: null, paymentDate: '2026-05-12' }, { ...c, marketDate: '2026-05-12' }] });
  assert.equal(r.adjustments.officialDividendCrosschecks[0].officialExDateCorrespondence, true);
  assert.equal(r.adjustments.officialDividendCrosschecks[1].officialAmountCorrespondence, true);
  assert.equal(r.adjustments.officialDividendCrosschecks[1].officialExDateCorrespondence, null);
  assert.equal(r.adjustments.officialDividendCrosschecks[2].officialExDateCorrespondence, false);
  assert.ok(r.adjustments.officialDividendCrosschecks.every(c => c.adjustmentCorrectnessVerified === false));
});

test('cached seed observations preserve source run and timestamp without duplicate windows', () => {
  const e = { endpoint: 'eod', ok: true, params: { symbols: '7203.T', exchange: 'XJPX' }, checkedAt: '2026-10-01T11:00:00Z',
    data: { data: [bar('2025-01-02', 100, { symbol: '7203.T', exchange: 'XJPX' })] } };
  const original = { schemaVersion: 'marketstack-probe-1.0.0', run: { source: 'github-actions', runId: 'original' },
    accounting: { provider: 'marketstack', requestsAttempted: 1 }, endpoints: [e] };
  const r = buildScaleAudit([original, { run: { runId: 'fresh' }, endpoints: [{ ...e, seeded: true }] }]);
  assert.equal(r.adjustments.windows.length, 1);
  assert.equal(r.adjustments.windows[0].runId, 'original');
  assert.equal(r.adjustments.windows[0].checkedAt, e.checkedAt);
  assert.equal(buildScaleAudit([{ run: { runId: 'fresh' }, endpoints: [{ ...e, seeded: true }] }]).adjustments.windows[0].runId, null);
});

test('an earlier unadjusted split gap and repeated action dates remain explicit diagnostics', () => {
  const early = analyzeAdjustmentWindow([bar('2024-09-25', 500), bar('2024-09-26', 100), bar('2024-09-27', 100)], { event });
  assert.equal(early.splitGapCandidates[0].date, '2024-09-26');
  assert.ok(early.signatures.includes('SPLIT_PRICE_GAP_DATE_DIFFERS_FROM_OFFICIAL_MARKET_DATE'));
  assert.ok(early.signatures.includes('REPORTED_ADJ_CLOSE_RETAINS_SPLIT_GAP'));
  const twice = analyzeAdjustmentWindow([bar('2024-09-25', 100), bar('2024-09-26', 100, { split_factor: 5 }), bar('2024-09-27', 100, { split_factor: 5 })], { event: { ...event, marketDate: null } });
  assert.ok(twice.signatures.includes('MULTIPLE_PROVIDER_SPLIT_DATES_FOR_ONE_OFFICIAL_EVENT_WINDOW'));
  assert.ok(twice.signatures.includes('DOUBLE_ADJUSTMENT_RISK_REVIEW'));
  assert.equal(twice.eventObservation.state, 'EVENT_MARKET_DATE_UNVERIFIED');
  assert.equal(twice.technicalAdmission, 'BLOCKED_UNVERIFIED_PRICE_BASIS');
});

test('out-of-request-window prices never establish valid history or an earliest ascending control', () => {
  const p = { endpoints: [{ endpoint: 'eod', ok: true, checkedAt: '2026-10-01T16:00:00Z',
    params: { symbols: '7974.T', exchange: 'XJPX', date_from: '2010-01-01', date_to: '2010-12-31', limit: 1, sort: 'ASC' },
    data: { data: [bar('2025-01-02', 100, { symbol: '7974.T', exchange: 'XJPX' })] } }] };
  const r = buildScaleAudit([p]);
  assert.equal(r.adjustments.windows[0].analysis.outOfBoundsCandles, 1);
  assert.equal(r.adjustments.windows[0].analysis.validRawCandles, 0);
  assert.equal(r.adjustments.priceRequestOutcomes[0].earliestReturnedAscendingSample, null);
  assert.equal(r.globalSelect.rows.find(row => row.company === 'Nintendo').historyCoverage, 'UNKNOWN');
  assert.equal(r.adjustments.providerReplacementDecision, 'DEFERRED');
});

test('returned symbol or MIC conflicts cannot establish the requested earliest history sample', () => {
  const r = buildScaleAudit([{ endpoints: [{ endpoint: 'eod', ok: true,
    params: { symbols: '7974.T', exchange: 'XJPX', date_from: '2010-01-01', date_to: '2026-09-30', limit: 1, sort: 'ASC' },
    data: { data: [bar('2010-01-04', 100, { symbol: '7974.T', exchange: 'XNYS', dividend: 10 })] } }] }]);
  assert.equal(r.adjustments.windows[0].analysis.identityMismatchCandles, 1);
  assert.deepEqual(r.adjustments.windows[0].analysis.dividendObservations, []);
  assert.equal(r.adjustments.priceRequestOutcomes[0].earliestReturnedAscendingSample, null);
});

test('bounded issue samples retain complete issue counts and malformed empty placeholders never become valid coverage', () => {
  const rows = Array.from({ length: 30 }, (_, i) => bar('2025-01-' + String(i + 1).padStart(2, '0'), 100, { adj_open: null }));
  const a = analyzeAdjustmentWindow(rows, { maxIssueDetails: 20 });
  assert.equal(a.issueCount, 30);
  assert.equal(a.issueCountsByFlag.ADJUSTED_OHLC_MISSING_OR_INVALID, 30);
  assert.equal(a.issues.length, 20); assert.equal(a.issueDetailsTruncated, true);
  const r = buildScaleAudit([{ endpoints: [{ endpoint: 'eod/latest', ok: true, params: { symbols: 'NOQUOTE', exchange: 'XNYS' }, data: { data: [[]] } }] }]);
  assert.equal(r.adjustments.priceRequestOutcomes[0].state, 'NO_VALID_IN_SCOPE_RAW_PRICE_ROWS');
});
