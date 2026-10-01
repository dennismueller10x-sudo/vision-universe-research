/** Join complete directory identity evidence with private latest-candle outcomes.
 * Public output is an explicit metadata allowlist: no OHLC, volume, adjustment,
 * dividend values, corporate-action amounts or private raw response is copied.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planFullUSLatest } from './benchmark-marketstack-us-latest.mjs';

const countBy = (rows, fn) => rows.reduce((out, row) => { const k = fn(row) || 'UNKNOWN'; out[k] = (out[k] || 0) + 1; return out; }, {});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const allowedStatuses = new Set(['VALID_LATEST','STALE_LATEST_ACTIVE','MISSING_LATEST','DUPLICATE_LATEST',
  'CURRENCY_MISMATCH','EXCHANGE_MISMATCH','SYMBOL_MISMATCH','INVALID_OHLC','INVALID_ADJUSTED_OHLC',
  'INVALID_CORPORATE_ACTION','ASSET_TYPE_MISMATCH','FUTURE_DATE','INVALID_DATE','MISSING_PROVIDER_CURRENCY',
  'NORMALIZATION_REJECTED','NOT_ATTEMPTED','REQUEST_FAILED','BATCH_INCOMPLETE']);
const untested = new Set(['NOT_ATTEMPTED','REQUEST_FAILED','BATCH_INCOMPLETE']);
function reportedDay(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day ? day : null;
}
function timestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
const currency = value => typeof value === 'string' && /^[A-Za-z]{3}$/.test(value) ? value : null;
const percentage = (n, d) => d ? Math.round(n / d * 10000) / 100 : null;

export function summarizeFullUSLatest(directory, latest, options = {}) {
  const plan = planFullUSLatest(directory, latest.limits?.batchSize || 100);
  if (latest.inputFingerprint !== plan.fingerprint || latest.baselineSource?.sha256 !== directory.baselineSource?.sha256 ||
    latest.baselineTotal !== directory.rows.length || !Array.isArray(latest.rows) ||
    latest.rows.length !== plan.targets.length || new Set(latest.rows.map(r => r.securityId)).size !== latest.rows.length)
    throw new Error('Latest benchmark does not match the protected directory baseline');
  const targetById = new Map(plan.targets.map(t => [t.securityId, t]));
  for (const row of latest.rows) {
    const target = targetById.get(row.securityId);
    if (!target || target.mic !== row.mic || target.providerSymbol !== row.providerSymbol ||
      target.expectedCurrency !== row.expectedCurrency || !allowedStatuses.has(row.status) ||
      row.validLatest !== (row.status === 'VALID_LATEST')) throw new Error('Latest benchmark has invalid identity or outcome');
  }
  if (latest.complete && latest.rows.some(r => untested.has(r.status)))
    throw new Error('Incomplete latest outcomes cannot be advertised as complete');
  const byId = new Map(latest.rows.map(r => [r.securityId, r]));
  const rows = directory.rows.map(identity => {
    const outcome = byId.get(identity.securityId);
    const reportedTradingDate = outcome ? reportedDay(outcome.observation?.marketTimestamp) : null;
    const ageDays = reportedTradingDate && reportedDay(latest.today) ? Math.floor((Date.parse(latest.today) - Date.parse(reportedTradingDate)) / 86400000) : null;
    return { securityId: identity.securityId, ticker: identity.ticker, providerSymbol: identity.providerSymbol,
      exchange: identity.exchange, expectedMics: identity.expectedMics, instrumentType: identity.instrumentType,
      activeStatus: identity.activeStatus, productEligibility: identity.productEligibility,
      productMember: identity.productMember, consumer: identity.consumer, directoryStatus: identity.status,
      directoryListing: identity.directoryListing ? { symbol: identity.directoryListing.symbol, mic: identity.directoryListing.mic,
        hasEod: identity.directoryListing.hasEod, hasIntraday: identity.directoryListing.hasIntraday } : null,
      otherVenueCandidates: (identity.otherVenueCandidates || []).map(r => ({ symbol: r.symbol, mic: r.mic })),
      symbolVariantCandidates: (identity.symbolVariantCandidates || []).map(r => ({ symbol: r.symbol, mic: r.mic })),
      latestObservation: outcome ? { status: outcome.status, validLatest: outcome.validLatest,
        expectedCurrency: currency(outcome.expectedCurrency), reportedCurrency: currency(outcome.observation?.reportedCurrency),
        normalizedCurrency: currency(outcome.normalizedCurrency), reportedTradingDate,
        acceptedTradingDate: reportedDay(outcome.tradingDate), ageDays, retrievedAt: timestamp(outcome.retrievedAt),
        dataFrequency: 'EOD', delayState: 'EOD_ONLY', adjustmentBasis: 'UNVERIFIED',
        companyIdentityValidation: 'DIRECTORY_SYMBOL_MIC_ONLY_UNVERIFIED_ISSUER', historyValidation: 'NOT_TESTED' } : null,
      missingClassification: identity.missingClassification || null };
  });
  const cohort = selected => {
    const matched = selected.filter(r => r.directoryStatus === 'DIRECTORY_MATCHED');
    const tested = matched.filter(r => r.latestObservation && !untested.has(r.latestObservation.status));
    const valid = matched.filter(r => r.latestObservation?.validLatest);
    return { baselineTotal: selected.length, directoryMatched: matched.length, latestTested: tested.length,
      validLatest: valid.length, rejectedLatest: tested.length - valid.length,
      validLatestPercentOfBaseline: percentage(valid.length, selected.length),
      validLatestPercentOfDirectoryMatched: percentage(valid.length, matched.length),
      directoryStatusCounts: countBy(selected, r => r.directoryStatus),
      latestStatusCounts: countBy(matched, r => r.latestObservation?.status || 'NO_LATEST_RESULT') };
  };
  const baseline = cohort(rows), missing = rows.filter(r => ['DIRECTORY_ABSENT_COMPLETE','EXCHANGE_MISMATCH'].includes(r.directoryStatus));
  const common = cohort(rows.filter(r => r.instrumentType === 'EQUITY_COMMON' && r.activeStatus === 'ACTIVE'));
  return { schemaVersion: 2, generatedAt: new Date().toISOString(), asOfDate: reportedDay(latest.today),
    scope: 'COMPLETE_RETAINED_US_IDENTITY_PLUS_MATCHED_UNIVERSE_LATEST_OBSERVATIONS',
    evidenceLevel: 'AUTHENTICATED_DIRECTORY_AND_COMPLETE_MATCHED_UNIVERSE_LATEST_PRICE_CHECK',
    baselineSource: directory.baselineSource, sources: options.sources || null,
    knownPrimaryDirectoriesComplete: directory.directoryComplete === true,
    allBaselineVenuesCovered: directory.allBaselineVenuesCovered === true,
    latestBenchmarkComplete: latest.complete === true,
    totals: { TOTAL_EXISTING_TIINGO: rows.length, TOTAL_MARKETSTACK_MATCHED: baseline.directoryMatched,
      TOTAL_MARKETSTACK_MISSING: missing.length,
      TOTAL_UNRESOLVED: rows.length - baseline.directoryMatched - missing.length,
      TOTAL_SYMBOL_MISMATCH: rows.filter(r => r.directoryStatus === 'SYMBOL_VARIANT_REVIEW').length,
      TOTAL_EXCHANGE_MISMATCH: rows.filter(r => r.directoryStatus === 'EXCHANGE_MISMATCH').length,
      TOTAL_LATEST_TESTED: baseline.latestTested, TOTAL_VALID_LATEST: baseline.validLatest,
      TOTAL_DATA_MISMATCH: baseline.latestTested ? baseline.rejectedLatest : null,
      DATA_MISMATCH_SEMANTICS: 'LATEST_IDENTITY_QUALITY_OR_FRESHNESS_REJECTION_NOT_TIINGO_VALUE_DISAGREEMENT' },
    coverage: { baseline, product: cohort(rows.filter(r => r.productMember)), consumer: cohort(rows.filter(r => r.consumer)),
      activeCommonEquities: common, inactive: cohort(rows.filter(r => r.activeStatus === 'INACTIVE')) },
    missingByClassification: countBy(missing, r => r.missingClassification),
    latestRejectionCounts: countBy(rows.filter(r => r.latestObservation && !untested.has(r.latestObservation.status) && !r.latestObservation.validLatest), r => r.latestObservation.status),
    requestAccounting: { requestsAttempted: Number.isInteger(latest.budgetUsed?.requestsAttempted) ? latest.budgetUsed.requestsAttempted : null,
      estimatedCreditsConsumed: Number.isInteger(latest.budgetUsed?.estimatedCreditsConsumed) ? latest.budgetUsed.estimatedCreditsConsumed : null,
      semantics: 'CONSERVATIVE_ESTIMATE_NOT_BILLING' },
    replacementReadiness: 'NOT_ESTABLISHED_RETAIN_TIINGO',
    limitations: ['A passing latest observation is not independently verified issuer identity or complete-history equivalence.',
      'Directory absence or venue mismatch is not proof that every possible alternate provider symbol is unavailable.',
      'One EXPM baseline venue was not queried; no OTC-complete coverage is claimed.',
      'Unmatched directory listings were not included in the bounded latest batch; every retained baseline row nevertheless has an explicit result.',
      'No full-universe Tiingo price-value, adjustment, split, dividend, intraday or realtime equivalence is established.',
      'Public output deliberately excludes raw prices and volumes; original observations remain private Action artifacts.'],
    rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.latest) throw new Error('Usage: --latest=private-us-latest.json [--directory=api-diff.json] [--proof=probe.json] [--out=public-report.json]');
  const directoryPath = args.directory || 'reports/marketstack/marketstack_tiingo_us_api_diff.json';
  const directoryBytes = readFileSync(resolve(directoryPath)), latestBytes = readFileSync(resolve(args.latest));
  const proof = args.proof ? JSON.parse(readFileSync(resolve(args.proof))).run : null;
  const result = summarizeFullUSLatest(JSON.parse(directoryBytes), JSON.parse(latestBytes), {
    sources: { directory: { path: directoryPath, sha256: sha(directoryBytes) },
      latest: { privateArtifact: true, sha256: sha(latestBytes), actionRun: proof } } });
  const output = resolve(args.out || 'reports/marketstack/marketstack_tiingo_us_diff.json');
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, totals: result.totals, activeCommonEquities: result.coverage.activeCommonEquities, requestAccounting: result.requestAccounting }));
}
