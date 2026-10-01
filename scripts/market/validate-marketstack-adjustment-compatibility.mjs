/** Read-only, bounded adjustment validation. This never publishes prices,
 * modifies provider routing, applies actions, or admits a technical strategy. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { analyzeAdjustmentWindow, collectPriceEvidence, canonicalPriceEvidenceValue } from './audit-marketstack-scale-adjustments.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const ratio = (a, b) => finite(a) && finite(b) && b > 0 ? a / b : null;
const sha = value => createHash('sha256').update(value).digest('hex');
const date = row => String(row.date || '').slice(0, 10);
const unique = rows => [...new Set(rows)].sort();
const canonicalRow = row => JSON.stringify(canonicalPriceEvidenceValue(row));
const extrema = rows => { const a = rows.filter(finite); return { count: a.length,
  min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null }; };

export const ADJUSTMENT_CONTROLS = Object.freeze([
  { symbol: 'NVDA', mic: 'XNAS', from: '2024-06-03', to: '2024-06-14', role: 'US_SPLIT_AND_CASH_DIVIDEND', tiingo: 'ref_NVDA.json' },
  { symbol: 'AAPL', mic: 'XNAS', from: '2020-08-24', to: '2020-09-04', role: 'US_SPLIT', tiingo: 'ref_AAPL.json' },
  { symbol: 'NVO', mic: 'XNYS', from: '2023-09-15', to: '2023-09-25', role: 'US_ADR_SPLIT' },
  { symbol: 'IAU', mic: 'ARCX', from: '2021-05-17', to: '2021-05-28', role: 'US_TRUST_REVERSE_SPLIT' },
  { symbol: 'COST', mic: 'XNAS', from: '2023-12-18', to: '2024-01-12', role: 'US_SPECIAL_CASH_DIVIDEND', tiingoChart: 'ref_COST.json' },
  { symbol: 'ASML.AS', mic: 'XAMS', from: '2012-11-20', to: '2012-12-07', role: 'EU_CAPITAL_REPAYMENT_AND_REVERSE_SPLIT' },
  { symbol: 'NOVO-B.CO', mic: 'XCSE', from: '2023-09-08', to: '2023-09-19', role: 'EU_ORDINARY_SPLIT' },
  { symbol: 'ALV.DE', mic: 'XETR', from: '2026-05-04', to: '2026-05-13', role: 'EU_LARGE_CASH_DIVIDEND' },
  { symbol: 'ALV.DE', mic: 'XETR', from: '2025-05-06', to: '2025-05-14', role: 'EU_LARGE_CASH_DIVIDEND_VALID_PRICE_CONTROL' },
  { symbol: 'DTE.DE', mic: 'XETR', from: '2025-04-07', to: '2025-04-16', role: 'EU_CASH_DIVIDEND' },
  { symbol: 'EXSA.DE', mic: 'XETR', from: '2025-06-11', to: '2025-06-20', role: 'EU_DISTRIBUTING_ETF' },
  { symbol: 'ISPA.DE', mic: 'XETR', from: '2025-07-10', to: '2025-07-18', role: 'EU_DISTRIBUTING_ETF' },
  { symbol: 'SAP.DE', mic: 'XETR', from: '2006-12-18', to: '2007-01-05', role: 'EU_PRE_2010_SPLIT' },
  { symbol: 'ADS.DE', mic: 'XETR', from: '2006-05-30', to: '2006-06-12', role: 'EU_PRE_2010_SPLIT' },
  { symbol: '6758.T', mic: 'XJPX', from: '2024-09-24', to: '2024-10-04', role: 'ASIA_SPLIT_DATE_CONTROL' },
  { symbol: '7203.T', mic: 'XJPX', from: '2021-09-24', to: '2021-10-06', role: 'ASIA_REPEATED_SPLIT_FACTOR_CONTROL' },
  { symbol: '7974.T', mic: 'XJPX', from: '2022-09-26', to: '2022-10-05', role: 'ASIA_ALREADY_CONTINUOUS_PRICE_CONTROL' }
]);

// Compare only exact dated pairs of the same known listing and currency.
// Differently dated provider normalization bases may multiply all historical
// adjusted values by a constant, so return continuity is checked separately.
export function compareTiingoWindow(marketstackRows, tiingoRows, options = {}) {
  const msDates = new Map(), tiDates = new Map(), conflicts = new Set();
  for (const row of marketstackRows) {
    const d = date(row);
    if (msDates.has(d) && canonicalRow(msDates.get(d)) !== canonicalRow(row)) conflicts.add(d);
    msDates.set(d, row);
  }
  for (const row of tiingoRows) {
    const d = date(row);
    if (tiDates.has(d) && canonicalRow(tiDates.get(d)) !== canonicalRow(row)) conflicts.add(d);
    tiDates.set(d, row);
  }
  const usable = [...msDates.keys()].sort().filter(d => tiDates.has(d) && !conflicts.has(d) &&
    d >= (options.from || '') && d <= (options.to || '9999-12-31') &&
    (!options.symbol || msDates.get(d).symbol === options.symbol) &&
    (!options.mic || msDates.get(d).exchange === options.mic) &&
    (msDates.get(d).price_currency === (options.currency || 'USD') ||
      (options.allowMissingProviderCurrencyForDiagnostic === true && !msDates.get(d).price_currency)) &&
    tiDates.get(d).currency === (options.currency || 'USD') &&
    [msDates.get(d), tiDates.get(d)].every(row => ['open', 'high', 'low', 'close'].every(k => finite(row[k]) && row[k] > 0) &&
      row.high >= Math.max(row.open, row.low, row.close) && row.low <= Math.min(row.open, row.high, row.close)));
  const rawFieldRatios = [], rawVolumeRatios = [], adjustedVolumeRatios = [],
    adjustedRatios = [], adjustedReturnErrorsBps = [], actionPairs = [], dividends = [];
  for (let i = 0; i < usable.length; i++) {
    const d = usable[i], m = msDates.get(d), t = tiDates.get(d);
    rawFieldRatios.push({ date: d, factors: Object.fromEntries(['open', 'high', 'low', 'close'].map(k => [k, ratio(m[k], t[k])])) });
    rawVolumeRatios.push({ date: d, factor: ratio(m.volume, t.volume) });
    adjustedVolumeRatios.push(ratio(m.adj_volume, t.adjustedVolume));
    if (finite(m.adj_close) && finite(t.adjustedClose)) adjustedRatios.push(m.adj_close / t.adjustedClose);
    if (m.split_factor !== 1 || t.splitFactor !== 1 || m.dividend > 0 || t.dividend > 0)
      actionPairs.push({ date: d, marketstackSplitFactor: m.split_factor ?? null, tiingoSplitFactor: t.splitFactor ?? null,
        marketstackDividend: m.dividend ?? null, tiingoDividend: t.dividend ?? null });
    if (i) {
      const prior = usable[i - 1], pm = msDates.get(prior), pt = tiDates.get(prior);
      const mr = ratio(m.adj_close, pm.adj_close), tr = ratio(t.adjustedClose, pt.adjustedClose);
      if (mr !== null && tr !== null) adjustedReturnErrorsBps.push(Math.abs(mr / tr - 1) * 10000);
      if (m.dividend > 0 && finite(pm.adj_close) && finite(m.adj_close)) {
        const before = ratio(pm.adj_close, pm.close), after = ratio(m.adj_close, m.close);
        const observed = ratio(after, before), expected = ratio(pm.close, pm.close - m.dividend);
        dividends.push({ date: d, reportedDividend: m.dividend, adjustmentFactorStep: observed,
          simpleBackwardCashDividendExpectedStep: expected,
          differenceBps: observed !== null && expected !== null ? (observed / expected - 1) * 10000 : null,
          inferenceScope: 'ADJ_CLOSE_LOCAL_FACTOR_STEP_ONLY_NOT_FULL_RETURN_OR_VOLUME_CERTIFICATION' });
      }
    }
  }
  const fields = rawFieldRatios.flatMap(r => Object.values(r.factors)), spread = extrema(adjustedRatios);
  const err = extrema(adjustedReturnErrorsBps);
  const missingProviderCurrencyDates = usable.filter(d => !msDates.get(d).price_currency);
  return { pairedDays: usable.length, pairDates: usable, conflictingDates: [...conflicts].sort(),
    missingProviderCurrencyDates,
    currencyValidation: missingProviderCurrencyDates.length ? 'NUMERICAL_COMPARISON_ONLY_PROVIDER_HISTORICAL_CURRENCY_MISSING' : 'EXPLICIT_MATCHING_CURRENCY',
    missingMarketstackDates: [...tiDates.keys()].filter(d => d >= (options.from || '') && d <= (options.to || '9999-12-31') && !msDates.has(d)).sort(),
    rawOHLCMarketstackToTiingo: extrema(fields), rawCloseRatiosByDate: rawFieldRatios.map(r => ({ date: r.date, factor: r.factors.close })),
    reportedVolumeMarketstackToTiingoRaw: extrema(rawVolumeRatios.map(r => r.factor)),
    reportedVolumeRatiosByDate: rawVolumeRatios,
    reportedAdjVolumeMarketstackToTiingoAdjusted: extrema(adjustedVolumeRatios),
    adjustedCloseMarketstackToTiingo: spread,
    adjustedScaleSpreadBps: spread.min > 0 ? (spread.max / spread.min - 1) * 10000 : null,
    adjustedDailyReturnErrorBps: err,
    adjustedReturnsConsistentWithinOneBasisPoint: usable.length >= 3 && err.count === usable.length - 1 && err.max <= 1,
    actionPairs, dividendFactorDiagnostics: dividends,
    sourceRelation: 'INDEPENDENT_PROVIDER_ACCESS_SAME_LISTING_DIFFERENT_RETRIEVAL_BASES',
    historicalSeriesCertified: false };
}

export function compatibilityForWindow(analysis, comparison = null) {
  const rejected = analysis.rawInvalid > 0 || analysis.identityMismatchCandles > 0 || analysis.outOfBoundsCandles > 0 ||
    ['DUPLICATE_CANDLE', 'VOLUME_INVALID', 'DIVIDEND_INVALID', 'SPLIT_FACTOR_INVALID'].some(k => analysis.issueCountsByFlag?.[k] > 0);
  const status = !analysis.validRawCandles ? 'UNAVAILABLE' : rejected ? 'UNSAFE_AS_COMPLETE_WINDOW' :
    analysis.currenciesObserved.length !== 1 || analysis.missingCurrencyCandles > 0 ? 'UNVERIFIED_CURRENCY' : 'PARTIAL_DISPLAY_ONLY';
  return { rawCharts: status, continuousAdjustedCharts: 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS',
    movingAverages: 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS', high52Week: 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS',
    momentum: 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS', quant: 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS',
    backtesting: 'BLOCKED_UNVERIFIED_FULL_PRICE_BASIS',
    volumeDependentIndicators: 'BLOCKED_UNVERIFIED_VOLUME_AND_PRICE_BASIS',
    boundedAdjustedReturnControl: comparison?.adjustedReturnsConsistentWithinOneBasisPoint ?
      (comparison.currencyValidation === 'NUMERICAL_COMPARISON_ONLY_PROVIDER_HISTORICAL_CURRENCY_MISSING' ?
        'CONSISTENT_NUMERICALLY_QUOTE_UNIT_UNVERIFIED' : 'CONSISTENT_IN_TESTED_WINDOW') : 'UNVERIFIED',
    admissionChanged: false, reason: 'Raw display requires independent identity/currency/history gates. A bounded action test never certifies a full series.' };
}

export function compareTiingoChartWindow(prices, chart, control, options = {}) {
  if (chart.provider !== 'tiingo' || chart.ticker !== control.symbol || chart.currency !== 'USD' ||
    chart.priceSeriesType !== 'SPLIT_ADJUSTED' || !Array.isArray(chart.points)) return null;
  const pairs = [], seen = new Map(), duplicateDates = new Set();
  for (const row of prices) { const d = date(row); if (seen.has(d)) duplicateDates.add(d); seen.set(d, row); }
  for (const [d, close] of chart.points) {
    const m = seen.get(d);
    if (d < control.from || d > control.to || !m || duplicateDates.has(d) || m.symbol !== control.symbol ||
      m.exchange !== control.mic || (m.price_currency !== chart.currency &&
        !(options.allowMissingProviderCurrencyForDiagnostic === true && !m.price_currency)) || !finite(close) || close <= 0) continue;
    pairs.push({ date: d, providerCurrencyDeclared: !!m.price_currency,
      rawCloseDifferenceBps: finite(m.close) ? (m.close / close - 1) * 10000 : null,
      adjustedCloseDifferenceBps: finite(m.adj_close) ? (m.adj_close / close - 1) * 10000 : null });
  }
  return { sourceRelation: 'TIINGO_COMMITTED_SPLIT_ADJUSTED_WEEKLY_CHART: EXACT_DATE_CLOSE_ONLY', pairedObservations: pairs.length,
    currencyValidation: pairs.some(p => !p.providerCurrencyDeclared) ? 'NUMERICAL_COMPARISON_ONLY_PROVIDER_HISTORICAL_CURRENCY_MISSING' : 'EXPLICIT_MATCHING_CURRENCY',
    pairs, rawCloseDifferenceBps: extrema(pairs.map(p => p.rawCloseDifferenceBps)),
    dailyOHLCOrDividendMethodCertified: false, interpolatedOrReconstructedPrices: false };
}

export function dividendFactorSteps(rows) {
  const sorted = rows.slice().sort((a, b) => date(a).localeCompare(date(b))), out = [];
  for (let i = 1; i < sorted.length; i++) {
    const before = sorted[i - 1], after = sorted[i];
    if (!(after.dividend > 0)) continue;
    const factorBefore = ratio(before.adj_close, before.close), factorAfter = ratio(after.adj_close, after.close);
    const observed = ratio(factorAfter, factorBefore), expected = ratio(before.close, before.close - after.dividend);
    out.push({ date: date(after), priorDate: date(before), amount: after.dividend,
      factorStep: observed, simpleBackwardCashDividendExpectedStep: expected,
      differenceBps: observed !== null && expected !== null ? (observed / expected - 1) * 10000 : null,
      adjustmentBasisCertified: false, rawOHLCValidAtBothDates: [before, after].every(row =>
        ['open', 'high', 'low', 'close'].every(k => finite(row[k]) && row[k] > 0) &&
        row.high >= Math.max(row.open, row.low, row.close) && row.low <= Math.min(row.open, row.high, row.close)) });
  }
  return out;
}

export function observedCloseBasis(analysis, comparison) {
  if (!analysis.bars) return 'NO_PRICE_OBSERVATION_FOR_TESTED_SCOPE';
  if (comparison?.pairedDays >= 3) {
    const ratios = comparison.rawCloseRatiosByDate.map(r => r.factor);
    if (ratios.every(r => finite(r) && Math.abs(r - 1) < 0.0001)) return 'MATCHES_TIINGO_AS_TRADED_CLOSE_IN_TESTED_DATES';
    const split = comparison.actionPairs.find(p => p.tiingoSplitFactor > 1 && p.tiingoSplitFactor === p.marketstackSplitFactor);
    if (split && comparison.rawCloseRatiosByDate.some(r => r.date < split.date && Math.abs(r.factor * split.tiingoSplitFactor - 1) < 0.0001) &&
      comparison.rawCloseRatiosByDate.filter(r => r.date >= split.date).every(r => Math.abs(r.factor - 1) < 0.0001))
      return 'REPORTED_CLOSE_ALREADY_SPLIT_SCALED_BEFORE_EVENT_IN_TESTED_DATES';
  }
  if (analysis.signatures.includes('REPORTED_ADJ_CLOSE_RETAINS_SPLIT_GAP')) return 'RAW_AND_ADJUSTED_CLOSE_RETAIN_SPLIT_GAP';
  if (analysis.signatures.includes('DOUBLE_ADJUSTMENT_RISK_REVIEW')) return 'CONTINUOUS_REPORTED_RAW_PRICE_DOUBLE_ADJUSTMENT_RISK';
  if (analysis.signatures.includes('NO_DIVIDEND_ADJUSTMENT_VISIBLE_IN_REPORTED_ADJ_CLOSE')) return 'REPORTED_ADJ_CLOSE_COPIES_RAW_CLOSE_THROUGH_DIVIDEND';
  return 'BOUNDED_REPORTED_PRICE_OBSERVATION_BASIS_UNVERIFIED';
}

export function buildAdjustmentCompatibility(probes, options = {}) {
  const entries = collectPriceEvidence(probes), controls = options.controls || ADJUSTMENT_CONTROLS;
  const rows = controls.map(control => {
    const attempts = entries.filter(e => e.endpoint.replace(/^\//, '') === 'eod' && e.ok &&
      String(e.params?.symbols || '').split(',').includes(control.symbol) &&
      (!e.params.exchange || e.params.exchange === control.mic) &&
      (!e.params.date_from || e.params.date_from <= control.from) && (!e.params.date_to || e.params.date_to >= control.to));
    const prices = [], seen = new Set(), sourceObservations = [];
    for (const entry of attempts) {
      const returned = Array.isArray(entry.data?.data) ? entry.data.data : [];
      let count = 0;
      const withinResponse = new Set();
      for (const row of returned) {
        if (row.symbol !== control.symbol || row.exchange !== control.mic || date(row) < control.from || date(row) > control.to) continue;
        count++;
        const key = canonicalRow(row);
        // Redundant snapshots are not duplicate candles. Duplicates actually
        // returned within one provider response remain quality evidence.
        if (!seen.has(key) || withinResponse.has(key)) { seen.add(key); prices.push(row); }
        withinResponse.add(key);
      }
      sourceObservations.push({ endpoint: entry.endpoint, params: entry.params, checkedAt: entry.checkedAt || null,
        sourceRunId: entry.runId, sourceRunAttribution: entry.sourceRunAttribution,
        providerResponseSha256: sha(JSON.stringify(entry.data)), rowsInControl: count,
        pagination: entry.data?.pagination || null });
    }
    const event = (options.events || []).find(e => e.providerSymbol === control.symbol && e.exchange === control.mic &&
      (!e.from || e.from <= control.to) && (!e.to || e.to >= control.from));
    const analysis = analyzeAdjustmentWindow(prices, { event, requestedSymbols: [control.symbol], requestedExchange: control.mic,
      requestedFrom: control.from, requestedTo: control.to, maxIssueDetails: 20 });
    const tiingo = options.tiingo?.[control.symbol];
    const comparison = tiingo ? compareTiingoWindow(prices, tiingo.bars || [], { ...control, currency: tiingo.currency,
      allowMissingProviderCurrencyForDiagnostic: true }) : null;
    const tiingoChart = options.tiingoCharts?.[control.symbol];
    return { ...control, sourceObservations, officialEvent: event || null,
      officialDividendControls: (options.dividendControls || []).filter(e => e.providerSymbol === control.symbol && e.exchange === control.mic),
      analysis, dividendFactorSteps: dividendFactorSteps(prices), tiingoSource: tiingo ? { provider: 'tiingo', currency: tiingo.currency, fetchedAt: tiingo.fetchedAt || null,
        sourceSha256: tiingo.sourceSha256, sourceFile: tiingo.sourceFile, normalizedPriceBasis: tiingo.adjustmentStatus || null } : null,
      comparison, observedCloseBasis: observedCloseBasis(analysis, comparison),
      chartComparison: tiingoChart ? compareTiingoChartWindow(prices, tiingoChart, control,
        { allowMissingProviderCurrencyForDiagnostic: true }) : null,
      tiingoChartSource: tiingoChart ? { sourceFile: tiingoChart.sourceFile, sourceSha256: tiingoChart.sourceSha256,
        priceSeriesType: tiingoChart.priceSeriesType, grain: tiingoChart.grain } : null,
      compatibility: compatibilityForWindow(analysis, comparison) };
  });
  return { schemaVersion: 'marketstack-adjustment-compatibility-1.0.0', generatedAt: options.generatedAt,
    scope: 'EXACT_LISTING_BOUNDED_CACHED_CONTROL_WINDOWS_NOT_UNIVERSAL_PROVIDER_CERTIFICATION',
    priceFieldSemantics: { close: 'NO_UNIVERSAL_AS_TRADED_OR_SPLIT_ADJUSTED_BASIS_ASSERTED: see per-window observedCloseBasis and comparison.',
      adj_close: 'PROVIDER_REPORTED_ADJUSTED_FIELD: presence and bounded signatures are measured per window; no full split/dividend adjustment certification.',
      split_factor: 'PROVIDER_ACTION_OBSERVATION_NOT_AN_INSTRUCTION_TO_APPLY_A_SECOND_ADJUSTMENT.',
      volume: 'NO_UNIVERSAL_AS_TRADED_VOLUME_BASIS_ASSERTED: per-window Tiingo raw/adjusted volume ratios are recorded separately from price basis.',
      dividend: 'PROVIDER_CASH_DISTRIBUTION_OBSERVATION: independent amount/date and adjustment checks are required; no total-return certification.' },
    rows, summary: { controlWindows: rows.length, withReturnedPrices: rows.filter(r => r.analysis.bars).length,
      tiingoComparedWindows: rows.filter(r => r.comparison?.pairedDays).length,
      boundedAdjustedReturnConsistentWindows: rows.filter(r => r.comparison?.adjustedReturnsConsistentWithinOneBasisPoint).length,
      boundedAdjustedReturnCurrencyVerifiedWindows: rows.filter(r => r.comparison?.adjustedReturnsConsistentWithinOneBasisPoint &&
        r.comparison.currencyValidation === 'EXPLICIT_MATCHING_CURRENCY').length,
      technicalSeriesCertified: 0, quantAdmissionChanged: 0 },
    limitations: ['Special-dividend availability is evaluated from the exact COST control window; European ASML capital repayment is a compound action, not an ordinary special dividend.',
      'IAU reverse-split control is a US gold trust, not common equity; no ETF/company type promotion is performed.',
      'Tiingo comparison is limited to committed real golden-preview daily records; other R2-only daily histories were not downloaded.',
      'Full-history action completeness, adjusted-volume basis and point-in-time revisions remain unverified.',
      'Preserved accepted charts and protected Tiingo computations are not modified. No new adjustment is applied.'],
    productionChanged: false, providerDecision: 'DEFERRED', marketstackRequests: 0,
    requestAccountingScope: 'THIS_OFFLINE_ANALYZER_ONLY; SOURCE_COLLECTION_ACCOUNTING_IN_MARKETSTACK_SCALE_SUMMARY' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), values = name => args.filter(a => a.startsWith('--' + name + '=')).map(a => a.slice(name.length + 3));
  const read = path => JSON.parse(readFileSync(path));
  const probeFiles = values('probe'); if (!probeFiles.length) throw Error('PROBE_INPUT_REQUIRED');
  const probes = probeFiles.map(read);
  const generatedAt = values('generated-at')[0] || unique(probes.map(p => p.generatedAt).filter(Boolean)).at(-1);
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) throw Error('DETERMINISTIC_EVIDENCE_TIMESTAMP_REQUIRED');
  const tiingo = {}, tiingoCharts = {}, dir = values('tiingo-directory')[0] || 'quant/data/market/golden-preview/daily';
  for (const c of ADJUSTMENT_CONTROLS.filter(c => c.tiingo)) {
    const file = resolve(dir, c.tiingo); if (!existsSync(file)) continue;
    const bytes = readFileSync(file), record = JSON.parse(bytes);
    if (record.ticker !== c.symbol || record.mic !== c.mic || record.provider !== 'tiingo') throw Error('TIINGO_CONTROL_IDENTITY_MISMATCH');
    tiingo[c.symbol] = { ...record, sourceSha256: sha(bytes), sourceFile: basename(file) };
  }
  for (const c of ADJUSTMENT_CONTROLS.filter(c => c.tiingoChart)) {
    const file = resolve(values('tiingo-chart-directory')[0] || 'quant/data/market/discover-series-long', c.tiingoChart);
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    tiingoCharts[c.symbol] = { ...JSON.parse(bytes), sourceFile: basename(file), sourceSha256: sha(bytes) };
  }
  const controls = values('official-controls')[0] ? read(values('official-controls')[0]) : {};
  const result = buildAdjustmentCompatibility(probes, { generatedAt, tiingo, tiingoCharts,
    events: values('events')[0] ? read(values('events')[0]) : controls.events || [],
    dividendControls: values('dividend-controls')[0] ? read(values('dividend-controls')[0]) : controls.dividendControls || [] });
  result.inputProvenance = probeFiles.map(file => ({ snapshotName: basename(resolve(file, '..')), sha256: sha(readFileSync(file)) }));
  if (values('official-controls')[0]) result.officialControlsProvenance = {
    sourceFile: basename(values('official-controls')[0]), sha256: sha(readFileSync(values('official-controls')[0])) };
  const out = resolve(values('out')[0] || 'reports/marketstack'); mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'marketstack_adjustment_compatibility.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary));
}
