// Offline product-fitness evidence only. Never changes canonical data or routing.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {normalizeETFHoldings} = require('../../providers/marketstack/etf.js');
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
const countBy = (rows, fn) => rows.reduce((out, row) => {const key = fn(row) ?? 'UNKNOWN'; out[key] = (out[key] || 0) + 1; return out;}, {});
const percent = (n, total) => total ? Number((100 * n / total).toFixed(4)) : null;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;
const observedName = value => String(value || '').replace(/&amp;/g, '&');
const US_SAMPLE = ['SPY', 'QQQ', 'VOO', 'VTI', 'IWM', 'SCHD', 'TLT', 'GLD', 'SLV', 'ARKK', 'XLF', 'XLK', 'XLE', 'AGG', 'BND', 'BNDX', 'EEM', 'EFA', 'FLIN', 'HYG', 'IAU', 'IEF', 'IEMG', 'IJH', 'IJR', 'JEPI', 'LQD', 'SHY', 'TIP', 'VT', 'VTV', 'VUG', 'VXUS'];
const ISSUERS = ['iShares', 'Vanguard', 'Xtrackers', 'Amundi', 'SPDR', 'Invesco', 'VanEck', 'WisdomTree', 'UBS', 'HSBC', 'Fidelity', 'Franklin Templeton'];
const CATEGORIES = [
  ['MSCI_WORLD', /msci\s+world/i], ['FTSE_ALL_WORLD', /ftse\s+all.world/i],
  ['SP500', /(?:s\s*&\s*p|s\.?\s*p)\s*500/i], ['NASDAQ100', /nasdaq.?100/i],
  ['EMERGING_MARKETS', /emerging|msci\s+em\b/i], ['STOXX_EUROPE600', /stoxx\s+europe\s+600/i],
  ['DAX', /\bdax\b/i], ['GLOBAL_SMALL_CAP', /(?:world|global).*(?:small.?cap)|small.?cap.*(?:world|global)/i],
  ['DIVIDEND', /dividend/i], ['GOVERNMENT_BONDS', /(?:government|treasury|govt).*(?:bond|ucits)|(?:bond|ucits).*(?:government|treasury|govt)/i],
  ['AGGREGATE_BONDS', /aggregate/i], ['GOLD_COMMODITY', /gold|commodit/i]
];
export function issuerHint(name) {
  const text = observedName(name);
  if (/^(?:franklin|templeton)\b/i.test(text)) return 'Franklin Templeton';
  if (/^lyxor\b/i.test(text)) return 'Amundi';
  return ISSUERS.find(issuer => new RegExp('^' + issuer.replace(/ /g, '\\s+') + '\\b', 'i').test(text)) || null;
}

/** CURRENT means within the explicit 120-day research threshold only, not
 * certified latest holdings. Completeness is independent of weight totals. */
export function classifyHolding(report, asOf, thresholdDays = 120) {
  if (!date(asOf) || !Number.isInteger(thresholdDays) || thresholdDays < 0) throw new Error('Valid audit date and freshness threshold required');
  const actualAsOf = date(report.actualAsOf), ageDays = actualAsOf ? Math.floor((Date.parse(asOf) - Date.parse(actualAsOf)) / 86400000) : null;
  let classification;
  if (report.state === 'UNAVAILABLE' || report.state === 'TRANSPORT_OR_PROVIDER_UNAVAILABLE') classification = 'UNAVAILABLE';
  else if (report.state === 'AVAILABLE_PARTIAL' && report.holdingsLines === 0) classification = 'EMPTY';
  else if (report.state !== 'AVAILABLE_PARTIAL' || !actualAsOf || ageDays < 0 || !(report.holdingsLines > 0)) classification = 'UNKNOWN';
  else {
    // Accepted Marketstack reports have UNKNOWN completeness. A caller cannot
    // infer completeness from ~100% weight, line count, HTTP success or a name.
    const full = report.fullHoldingsVerified === true && report.completeness === 'VERIFIED_FULL' && report.shareClassPortfolioIdentityVerified === true;
    classification = `${full ? 'FULL' : 'PARTIAL'}_${ageDays <= thresholdDays ? 'CURRENT' : 'STALE'}`;
  }
  return {classification, actualAsOf, ageDays, withinResearchFreshnessThreshold: ageDays === null || ageDays < 0 ? null : ageDays <= thresholdDays,
    verifiedLatestPortfolio: false, completeness: classification.startsWith('FULL_') ? 'VERIFIED_FULL' : 'UNVERIFIED'};
}

export function summarizePositions(positions) {
  const valid = positions.filter(p => p.valid), weighted = valid.filter(p => Number.isFinite(p.weightPercent));
  const positive = weighted.filter(p => p.weightPercent > 0).sort((a, b) => b.weightPercent - a.weightPercent);
  const countries = {};
  for (const p of weighted) if (p.country) countries[p.country] = (countries[p.country] || 0) + p.weightPercent;
  const sorted = Object.fromEntries(Object.entries(countries).sort(([a], [b]) => a.localeCompare(b)));
  return {reportedPositions: positions.length, validPositions: valid.length, positionsWithWeight: weighted.length,
    missingWeightPositions: valid.length - weighted.length, missingISINPositions: valid.filter(p => !p.isin).length,
    countryCodePositions: valid.filter(p => p.country).length, countryCodeWeightPositions: weighted.filter(p => p.country).length,
    signedReportedWeightTotal: weighted.length ? weighted.reduce((sum, p) => sum + p.weightPercent, 0) : null,
    observedTop10PositiveLineWeight: positive.slice(0, 10).reduce((sum, p) => sum + p.weightPercent, 0),
    observedTop20PositiveLineWeight: positive.slice(0, 20).reduce((sum, p) => sum + p.weightPercent, 0),
    reportedCountrySignedWeights: sorted, fullPortfolioCountryExposure: null, fullPortfolioConcentration: null,
    duplicateLinesNotRemoved: true, weightsNotRenormalized: true, sectorExposure: null};
}

/** Diagnostic intersection only: exact security ISINs and positive ordinary
 * equity legs, preserving date/scope limitations. Not an ETF overlap score. */
export function observedIntersection(left, right) {
  const securities = positions => {
    const groups = new Map();
    for (const p of positions) {
      if (!p.valid || !p.isin || p.assetCategory !== 'EC' || p.cashCollateral === 'Y' || p.nonCashCollateral === 'Y' || !(p.weightPercent > 0)) continue;
      const group = groups.get(p.isin) || []; group.push(p); groups.set(p.isin, group);
    }
    return new Set([...groups].filter(([, positions]) => positions.length === 1).map(([isin]) => isin));
  };
  const a = securities(left), b = securities(right);
  return {leftObservedUnambiguousEquityISINs: a.size, rightObservedUnambiguousEquityISINs: b.size,
    observedSharedEquityISINs: [...a].filter(isin => b.has(isin)).length,
    trueOverlapPercent: null, fullPortfolioOverlapSupported: false,
    note: 'Observed security intersection only; ambiguous repeated ISIN legs, collateral and derivatives excluded. No completeness, synchronized date or issuer look-through claim.'};
}

export function listingSample(record, auditMap, holdingMap) {
  const observed = auditMap.get(record.listingKey), history = observed?.history;
  return {listingKey: record.listingKey, providerSymbol: record.providerSymbol, name: observed?.providerName || record.UCITSNameLabelEvidence?.observedName || null,
    mic: record.mic, listingCountry: record.listingCountry, isin: record.isin, tradingCurrency: record.tradingCurrency,
    identityState: record.identityConflict ? 'CONFLICT' : 'EXACT_REFERENCE_MATCH', identityConflict: record.identityConflict,
    activeReference: record.active, activeTradingVerified: false, UCITSRegulatoryVerified: false,
    observedHistoryBars: history?.uniqueBars ?? 0, firstObservedDate: history?.firstObservedDate ?? null,
    latestObservedDate: history?.lastObservedDate ?? null, historyState: record.historyCoverage,
    historyAnomalies: history?.anomalyCountsByReason ?? {}, adjustmentsVerified: false,
    priceHistoryProductFitness: record.identityConflict || record.historyCoverage === 'QUARANTINED' ? 'UNSAFE' : history?.uniqueBars > 0 ? 'PARTIAL' : 'BLOCKED',
    technicalProductFitness: 'BLOCKED', dividendHistoryFitness: 'UNVERIFIED',
    holdingsObservation: holdingMap.get(record.providerSymbol)?.classification || 'NOT_TESTED',
    fullCurrentHoldings: false, companyFundamentalEligibility: 'NOT_APPLICABLE', productionActivated: false};
}

const FIELD_MAP = [
  ['fund_name', 'ETF_NAME'], ['ticker', 'TICKER'], ['exchange', 'EXCHANGE'], ['ISIN', 'ISIN'], ['WKN', 'WKN'], ['issuer', 'ISSUER'],
  ['domicile', 'FUND_DOMICILE'], ['UCITS', 'UCITS_STATUS'], ['fund_currency', 'FUND_CURRENCY'], ['trading_currency', 'TRADING_CURRENCY'],
  ['inception_date', 'INCEPTION_DATE'], ['benchmark', 'BENCHMARK'], ['TER', 'TER'], ['OCF', 'OCF'], ['expense_ratio', 'EXPENSE_RATIO'],
  ['AUM', 'AUM'], ['distribution_policy', 'ACCUMULATING_OR_DISTRIBUTING'], ['replication', 'REPLICATION_METHOD'],
  ['physical_synthetic', 'PHYSICAL_OR_SYNTHETIC'], ['NAV', 'NAV'], ['historical_price', 'HISTORICAL_PRICES'], ['dividends', 'DIVIDEND_HISTORY'],
  ['tracking_difference', 'TRACKING_DIFFERENCE'], ['tracking_error', 'TRACKING_ERROR'], ['sectors', 'SECTOR_ALLOCATION'],
  ['countries', 'COUNTRY_ALLOCATION'], ['holdings', 'HOLDINGS'], ['holding_weights', 'HOLDINGS_WEIGHTS']
];
const status = value => ({'NOT AVAILABLE': 'UNAVAILABLE', UNKNOWN: 'UNVERIFIED', PARTIAL: 'PARTIAL', AVAILABLE: 'AVAILABLE'})[value] || 'UNVERIFIED';
function metadataMatrix(source, common) {
  const rows = FIELD_MAP.map(([field, sourceField]) => {
    const observed = source.fields.find(row => row.field === sourceField);
    if (!observed) throw new Error(`Missing accepted metadata field ${sourceField}`);
    const provider = status(observed.providerStatus), supplement = status(observed.externalStatus);
    let combined = provider === 'AVAILABLE' || supplement === 'AVAILABLE' ? 'AVAILABLE' : provider === 'PARTIAL' || supplement === 'PARTIAL' ? 'PARTIAL' : provider === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'UNVERIFIED';
    let limitation = 'Availability is scoped to inspected schemas and sample responses; never extrapolated to all funds.';
    if (field === 'dividends') {combined = 'UNVERIFIED'; limitation = 'Positive dividends exist in quarantined histories; zero clean identity/currency/OHLC-verified ETF dividend series.';}
    if (field === 'WKN') {combined = 'UNVERIFIED'; limitation = 'Official raw identifiers are nine characters, not independently verified standard six-character WKN. Never silently trim.';}
    if (field === 'issuer') limitation = 'Official manager/fund-name labels and issuer family name hints do not prove legal issuer identity.';
    if (field === 'domicile') limitation = 'Official SIX legal-structure country on exact identities only; ISIN prefix and listing country are not domicile.';
    if (field === 'countries') limitation = 'Partial reported position country codes; no complete current fund exposure, issuer revenue exposure or derivative look-through.';
    if (field === 'holdings' || field === 'holding_weights') limitation = 'Partial regulatory fund-series reports only, signed reported weights, duplicates and cash/derivatives retained; no full-current portfolio.';
    if (field === 'UCITS') limitation = 'Name labels are not independently verified UCITS authorization.';
    if (field === 'TER' || field === 'OCF' || field === 'expense_ratio') limitation = 'SIX ManagementFee is not TER/OCF/expense ratio; no semantic substitution.';
    return {field, marketstack: provider, officialSupplement: supplement, combinedObservedSupport: combined, sourceField,
      providerEvidence: observed.providerEvidence, supplementEvidence: observed.externalEvidence, limitation};
  });
  return {...common, schemaVersion: 'marketstack-etf-product-metadata-1.0.0', fields: rows, fieldCount: rows.length,
    statusCounts: countBy(rows, row => row.combinedObservedSupport), scope: '27_REQUESTED_FIELDS_PLUS_HOLDING_WEIGHTS', missingValuesRemainNull: true};
}

export function buildGlobalETFFitness({audit, identities, metadata, probe, fullAudit, asOf = '2026-10-02', provenance = []}) {
  if (!date(asOf)) throw new Error('Valid as-of date required');
  const publicKeys = identities.listingRecords.map(row => row.listingKey);
  if (new Set(publicKeys).size !== publicKeys.length) throw new Error('Duplicate accepted listing keys');
  if (JSON.stringify(fullAudit.counts) !== JSON.stringify(audit.counts)) throw new Error('Private audit counts differ from accepted public baseline');
  if (JSON.stringify(fullAudit.holdingsTests) !== JSON.stringify(audit.holdingsTests)) throw new Error('Private holdings differ from accepted public baseline');
  const auditMap = new Map(fullAudit.listings.map(row => [row.key, row]));
  for (const record of identities.listingRecords) {
    const observed = auditMap.get(record.listingKey);
    if (!observed) throw new Error(`Missing private audit listing ${record.listingKey}`);
    if (observed.assetType !== 'ETF') throw new Error(`Non-ETF private census identity ${record.listingKey}`);
    for (const [publicField, privateField] of [['providerSymbol', 'symbol'], ['mic', 'mic'], ['isin', 'isin'], ['tradingCurrency', 'tradingCurrency'], ['listingCountry', 'listingCountry'], ['identityConflict', 'identityConflict']]) {
      if ((record[publicField] ?? null) !== (observed[privateField] ?? null)) throw new Error(`Private census identity differs ${record.listingKey}:${publicField}`);
    }
  }
  const common = {generatedAt: asOf, sourceObservationDate: audit.generatedAt, evidenceInputs: provenance, newPaidCalls: 0,
    productionActivated: false, providerDecision: 'DEFERRED', scope: 'ISOLATED_OFFLINE_PRODUCT_FITNESS_VALIDATION'};
  const rawByHash = new Map((probe.endpoints || []).filter(row => row.endpoint === 'etfholdings').map(row => [hash(JSON.stringify(row.data ?? null)), row]));
  const positions = new Map(), reports = [];
  for (const report of audit.holdingsTests) {
    const raw = rawByHash.get(report.responseSHA256);
    if (!raw) throw new Error(`Missing hash-matched original holdings response for ${report.symbol}`);
    const classified = classifyHolding(report, asOf), matches = identities.listingRecords.filter(row => row.providerSymbol === report.symbol);
    const region = matches.length === 1 ? matches[0].listingCountry === 'US' ? 'US' : 'EUROPEAN_LISTING' : 'UNKNOWN_OR_AMBIGUOUS';
    let diagnostics = null;
    if (report.state === 'AVAILABLE_PARTIAL') {
      const normalized = normalizeETFHoldings(raw.data, {assetType: 'ETF', symbol: report.symbol, isin: report.expectedISIN || undefined,
        securityId: 'isolated-report:' + report.symbol, listingId: matches[0]?.listingKey || 'isolated-report:' + report.symbol}, {retrievedAt: raw.retrievedAt});
      if (!normalized.ok || normalized.data.holdings.length !== report.holdingsLines || normalized.data.actualAsOf !== report.actualAsOf) throw new Error(`Accepted raw report reconciliation failed: ${report.symbol}`);
      positions.set(report.symbol, normalized.data.holdings);
      diagnostics = summarizePositions(normalized.data.holdings);
    }
    reports.push({symbol: report.symbol, listingKeys: matches.map(row => row.listingKey), region, ...classified,
      sourceState: report.state, sourceReason: report.reason || null, actualSourceAsOf: report.actualAsOf || null,
      fundSeriesId: report.fundSeriesId || null, publicAvailableAt: report.publicAvailableAt || null, shareClassPortfolioIdentityVerified: false,
      sourceRunId: report.sourceRunId, sourceRunAttribution: report.sourceRunAttribution, responseSHA256: report.responseSHA256,
      requestParameters: report.requestParameters, reportDiagnostics: diagnostics,
      duplicateExactPositionLines: report.duplicateExactPositionLines ?? null, negativeWeightLines: report.negativeWeightLines ?? null,
      missingWeightLines: report.missingWeights ?? null, derivativeLines: report.derivativeLines ?? null, cashCollateralLines: report.cashOrCollateralLines ?? null,
      signedWeightTotalPercent: report.signedWeightTotalPercent ?? null,
      safeForCurrentPortfolioOverlap: false, safeForFullCountryExposure: false, safeForSectorExposure: false, safeForFullConcentration: false});
  }
  const states = countBy(reports, row => row.classification), holdingMap = new Map(reports.map(row => [row.symbol, row]));
  const partial = reports.filter(row => row.classification.startsWith('PARTIAL_'));
  const observedIntersections = [];
  for (const [left, right] of [['VOO', 'XLF'], ['VOO', 'XLK'], ['XLF', 'XLK'], ['IEMG', 'EEM']]) {
    if (!positions.has(left) || !positions.has(right)) continue;
    observedIntersections.push({left, right, leftAsOf: holdingMap.get(left).actualAsOf, rightAsOf: holdingMap.get(right).actualAsOf,
      sameReportedDate: holdingMap.get(left).actualAsOf === holdingMap.get(right).actualAsOf, ...observedIntersection(positions.get(left), positions.get(right))});
  }
  const holdings = {...common, schemaVersion: 'marketstack-etf-holdings-product-fitness-1.0.0', freshnessPolicy: {
    thresholdDays: 120, CURRENTMeaning: 'WITHIN_RESEARCH_FRESHNESS_THRESHOLD_NOT_CERTIFIED_LATEST', reportDateField: 'date_report_period',
    fiscalYearEndIsNotHoldingsDate: true, sourceAsOfNotRetrievalTime: true, completenessIndependentOfWeightTotal: true},
    sample: {endpointObservations: reports.length, uniqueSymbols: new Set(reports.map(row => row.symbol)).size,
      classificationCounts: states, atLeastPartialPercent: percent(partial.length + (states.FULL_CURRENT || 0) + (states.FULL_STALE || 0), reports.length),
      fullCurrentPercent: percent(states.FULL_CURRENT || 0, reports.length), noUsablePositionReportPercent: percent(reports.length - partial.length, reports.length),
      regionCounts: countBy(reports, row => row.region), regionAndClassification: countBy(reports, row => row.region + ':' + row.classification),
      verifiedCompleteCurrentShareClassPortfolios: 0}, reports, observedIntersections,
    features: [
      {feature: 'ETF_OVERLAP', status: 'PARTIAL', currentCompletePortfolioStatus: 'NOT_SUPPORTED', evidence: 'Exact observed security intersections on four cached partial-report pairs; no full overlap score.'},
      {feature: 'TRUE_UNDERLYING_EXPOSURE', status: 'NOT_SUPPORTED', evidence: 'Completeness/share-class scope/currentness, fund look-through and derivative economic exposure not verified.'},
      {feature: 'COUNTRY_EXPOSURE', status: 'PARTIAL', currentCompletePortfolioStatus: 'NOT_SUPPORTED', evidence: 'Reported invested-country codes and signed line weights only; not complete current allocation.'},
      {feature: 'SECTOR_EXPOSURE', status: 'NOT_SUPPORTED', evidence: 'No structured sector classification or verified allocation in inspected holdings.'},
      {feature: 'TOP10_TOP20_CONCENTRATION', status: 'PARTIAL', currentCompletePortfolioStatus: 'NOT_SUPPORTED', evidence: 'Observed positive-line sums only; missing holdings, duplicates, derivative and stale scope prevent portfolio concentration claims.'},
      {feature: 'DUPLICATE_EXPOSURE_ACROSS_ETFS', status: 'PARTIAL', currentCompletePortfolioStatus: 'NOT_SUPPORTED', evidence: 'Observed exact equity ISIN matches only; issuer-level and economic duplicate exposure not supported.'}],
    requiredSecondaryData: ['Complete, dated, current share-class-to-fund portfolios with explicit completeness and public availability/filing provenance.',
      'Security identifiers and canonical issuer joins for every equity, bond, cash and derivative leg; fund-of-fund look-through.',
      'Portfolio NAV denominators, weight units/accounting methodology and signed gross/net derivative economic exposures.',
      'Verified sector and issuer-country mappings plus complete allocations; synchronized as-of dates and licensed historical point-in-time holdings.',
      'Verified ETF share-class/fund legal identity, UCITS authorization, costs, AUM/NAV, benchmark and distribution/replication policy.']};
  const rows = identities.listingRecords, europe = rows.filter(row => row.identityScope === 'OFFICIAL_EUROPEAN_ETF_LISTING_IDENTITY');
  const us = rows.filter(row => row.identityScope === 'CURRENT_US_PRIMARY_MIC_ETF_FLAG_CANDIDATE');
  const issuerCoverage = ISSUERS.map(issuer => {
    const matches = rows.filter(row => issuerHint(auditMap.get(row.listingKey)?.providerName) === issuer);
    return {issuerFamilyNameHint: issuer, legalIssuerVerified: false, totalListingCandidates: matches.length,
      USListingCandidates: matches.filter(row => row.listingCountry === 'US').length,
      EuropeanListingCandidates: matches.filter(row => row.identityScope === 'OFFICIAL_EUROPEAN_ETF_LISTING_IDENTITY').length,
      testedHistoryListingCandidates: matches.filter(row => (auditMap.get(row.listingKey)?.history.uniqueBars || 0) > 0).length,
      usablePartialHoldingsSymbols: partial.filter(report => matches.some(row => row.providerSymbol === report.symbol)).map(row => row.symbol).sort(),
      representativeDiscoveredListingKeys: matches.slice(0, 3).map(row => row.listingKey)};
  });
  const categoryCoverage = CATEGORIES.map(([category, pattern]) => {
    const matches = europe.filter(row => pattern.test(observedName(auditMap.get(row.listingKey)?.providerName)));
    const observed = matches.filter(row => (auditMap.get(row.listingKey)?.history.uniqueBars || 0) > 0);
    return {categoryNameHint: category, benchmarkVerified: false, candidateListings: matches.length,
      distinctISINCandidates: new Set(matches.map(row => row.isin).filter(Boolean)).size, observedPriceListings: observed.length,
      representativeDiscoveredListings: [...observed, ...matches.filter(row => !observed.includes(row))].slice(0, 3).map(row => listingSample(row, auditMap, holdingMap)),
      categoryLabelDoesNotVerifyBenchmarkOrFundLegalType: true};
  });
  const coverage = {...common, schemaVersion: 'marketstack-global-etf-product-fitness-1.0.0', counts: {
    rawETFCandidateListings: rows.length, EuropeanOfficialTypedListings: europe.length,
    EuropeanDistinctISINSecurityOrShareClassCandidates: new Set(europe.map(row => row.isin)).size,
    USOfficialFlagExactPrimaryMICListings: us.length, USIdentityNonconflictingListings: us.filter(row => !row.identityConflict).length,
    USObservedNonconflictingISIN: new Set(us.filter(row => !row.identityConflict && row.isin).map(row => row.isin)).size,
    otherProviderRoleCandidates: rows.length - us.length - europe.length, uniqueLegalFunds: null, globalVerifiedShareClasses: null,
    EuropeanUCITSNameLabelISINCandidates: identities.counts.EuropeanUCITSNameLabelShareClassCandidates, independentlyVerifiedUCITSFunds: 0,
    officialReferenceActiveListings: rows.filter(row => row.active === true).length, verifiedActivelyTradedETFs: null,
    ETFListingsWithAnyMeasuredValidHistoryBar: audit.counts.ETFListingsWithMeasuredHistory,
    nonquarantinedObservedSeries: audit.historyQuality.cleanObservedSeries.length, adjustmentVerifiedSeries: 0,
    verifiedCompleteCurrentHoldings: 0, holdingsObservations: reports.length, usablePartialHoldings: partial.length},
    listingCountryCounts: countBy(rows, row => row.listingCountry), EuropeanVenueCounts: countBy(europe, row => row.mic), USVenueCounts: countBy(us, row => row.mic),
    EuropeanShareClassesWithKnownActiveListing: identities.counts.EuropeanShareClassesWithAnyKnownActiveListing,
    USOfficialDirectory: {knownMICETFRoleListings: audit.USListingCensus.officialInventory.ETFRoleKnownMICRows,
      exactProviderDirectoryMatches: us.length, officialListingsWithoutExactProviderMatch: audit.USListingCensus.officialFlagRoleKnownMICRowsWithoutExactDirectoryMatch,
      directoryMatchPercent: percent(us.length, audit.USListingCensus.officialInventory.ETFRoleKnownMICRows),
      unmatchedIsNotProvenUnsupported: true, ETFflagDoesNotVerifyFundLegalStructure: true},
    USRepresentativeValidation: US_SAMPLE.map(symbol => {
      const match = us.find(row => row.providerSymbol === symbol);
      return match ? listingSample(match, auditMap, holdingMap) : {providerSymbol: symbol, identityState: 'NOT_OBSERVED_IN_EXACT_MATCH_COHORT', noUnsupportedInference: true};
    }), issuerCoverage, EuropeanCategoryCoverage: categoryCoverage,
    cleanBoundedHistorySeries: audit.historyQuality.cleanObservedSeries,
    limitations: ['Candidate listing counts are not funds, legal share-class counts or trading/liquidity certification.',
      'US ETFs and ETP legal structure still need regulatory identity verification; some precious-metal products are trusts, not UCITS/company equities.',
      '2471 UCITS name-label ISIN candidates are unverified regulatory status, not a complete global UCITS census.',
      'No tested ETF has a verified complete current portfolio; European holdings returned no usable position report in three tests.',
      'No Marketstack-only ETF Quant, backtest or full exposure activation; accepted scoped EOD infrastructure is unchanged.']};
  return {coverage, holdings, metadata: metadataMatrix(metadata, common)};
}

export function renderETFReport({coverage, holdings, metadata}) {
  const c = coverage.counts, s = holdings.sample;
  return `# Marketstack global ETF product fitness\n\nOffline, reproducible evidence as of ${coverage.generatedAt}; source snapshots remain ${coverage.sourceObservationDate}. No paid requests, product activation, routing change or commercial provider decision.\n\n` +
    `There are ${c.USOfficialFlagExactPrimaryMICListings} exact US primary-MIC ETF-flag candidates (${c.USIdentityNonconflictingListings} nonconflicting), and ${c.EuropeanOfficialTypedListings} European official typed listings representing ${c.EuropeanDistinctISINSecurityOrShareClassCandidates} ISIN security/share-class candidates. Unique legal funds and global share classes remain NULL. Of ${coverage.USOfficialDirectory.knownMICETFRoleListings} official US known-MIC ETF-role listings, ${coverage.USOfficialDirectory.officialListingsWithoutExactProviderMatch} lack an exact provider-directory match; this is not proof of unsupported prices. ${c.EuropeanUCITSNameLabelISINCandidates} ISINs carry UCITS name labels, with zero verified authorizations. Reference-active does not establish liquid/current trading.\n\n` +
    `The US sample contains ${coverage.USRepresentativeValidation.length} actual requested/discovered symbols across broad market, sector, factor, bond, commodity and international exposure. Identity, bounded histories, dividends, holdings and metadata are reconciled in global_etf_coverage.json. Major SPY/QQQ/VOO/VTI/SCHD/TLT/GLD/SLV/ARKK/XLF/XLK histories retain strict quarantine reasons. XLE has a provider/official type conflict; its holdings were not tested. The two strictly clean bounded series are IWM (8 bars) and SXR8.DE (440 bars), with unverified adjustments. Existing scoped EOD charts are preserved; no new technical approval follows from this audit.\n\n` +
    `## Holdings\n\n${s.endpointObservations} unique endpoint observations: ${s.classificationCounts.PARTIAL_CURRENT || 0} PARTIAL_CURRENT, ${s.classificationCounts.PARTIAL_STALE || 0} PARTIAL_STALE, ${s.classificationCounts.UNAVAILABLE || 0} UNAVAILABLE; zero FULL_CURRENT. ${s.atLeastPartialPercent}% return partial position reports; ${s.noUsablePositionReportPercent}% return no usable report. CURRENT means within the explicit 120-day research threshold, not certified latest holdings. Actual date_report_period controls age; fiscal-year-end/signature/retrieval never does. All 18 usable reports are US fund-series reports; all three European tests were unavailable.\n\n` +
    '| Symbol | Classification | Actual holdings date | Report lines |\n| --- | --- | --- | ---: |\n' + holdings.reports.map(row => `| ${row.symbol} | ${row.classification} | ${row.actualAsOf || 'NULL'} | ${row.reportDiagnostics?.reportedPositions ?? 'NULL'} |`).join('\n') +
    '\n\nObserved ISIN intersections and reported top-line/country weight summaries demonstrate partial diagnostics only. They never produce full overlap, concentration or exposure metrics; weights are not normalized and duplicate/negative/cash/derivative positions are retained.\n\n' +
    '| Feature | Fitness |\n| --- | --- |\n' + holdings.features.map(row => `| ${row.feature} | ${row.status} |`).join('\n') +
    '\n\n## Metadata\n\n' + '| Field | Marketstack | Official supplement | Safe observed support |\n| --- | --- | --- | --- |\n' + metadata.fields.map(row => `| ${row.field} | ${row.marketstack} | ${row.officialSupplement} | ${row.combinedObservedSupport} |`).join('\n') +
    '\n\nDividend observations occur in quarantined series, so clean dividend history is unverified. WKN raw nine-character values are not silently trimmed into standard WKN. SIX ManagementFee is not TER/OCF. Structured official manager/legal-structure/benchmark/replication labels supplement some identities, with no extrapolation or legal-issuer/UCITS proof.\n\n## Required secondary ETF data\n\n' + holdings.requiredSecondaryData.map(row => '- ' + row).join('\n') +
    '\n\n## Reproduction\n\nRun the read-only script with --probe=private-provenance-cache.json --full-audit=private-finalized-etf-audit.json --as-of=2026-10-02. Public inputs default to the accepted PR334 artifacts. Every inspected holdings body must hash-match accepted provenance; private counts/holdings/listing keys must match the baseline. Public artifacts publish source hashes, bounded representative identities and diagnostic aggregates, not full holdings/provider payloads. No network, credential or frontend dependency exists.\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {const i = arg.indexOf('='); return [arg.slice(0, i), arg.slice(i + 1)];}));
  if (!args['--probe'] || !args['--full-audit']) throw new Error('Required private cached inputs: --probe=path --full-audit=path; no network fallback');
  const provenance = [];
  const read = (path, role) => {const bytes = readFileSync(resolve(ROOT, path)); provenance.push({file: basename(path), role, sha256: hash(bytes)}); return JSON.parse(bytes);};
  const result = buildGlobalETFFitness({audit: read('reports/marketstack/marketstack_etf_full_audit.json', 'ACCEPTED_PR334_AUDIT'),
    identities: read('reports/marketstack/marketstack_etf_identity_reconciliation.json', 'ACCEPTED_PR334_IDENTITY'),
    metadata: read('reports/marketstack/marketstack_etf_metadata_matrix.json', 'ACCEPTED_PR334_METADATA'),
    probe: read(args['--probe'], 'HASH_MATCHED_PRIVATE_PROVIDER_RESPONSE_CACHE'), fullAudit: read(args['--full-audit'], 'PRIVATE_FULL_ACCEPTED_CENSUS'),
    asOf: args['--as-of'] || '2026-10-02', provenance});
  const out = resolve(ROOT, args['--out-dir'] || 'reports/marketstack'); mkdirSync(out, {recursive: true});
  for (const [key, file] of [['coverage', 'global_etf_coverage.json'], ['holdings', 'etf_holdings_quality.json'], ['metadata', 'etf_metadata_matrix.json']]) writeFileSync(resolve(out, file), JSON.stringify(result[key], null, 2) + '\n');
  writeFileSync(resolve(ROOT, args['--markdown-out'] || 'docs/MARKETSTACK_GLOBAL_ETF_PRODUCT_FITNESS.md'), renderETFReport(result));
  process.stdout.write(JSON.stringify({counts: result.coverage.counts, holdings: result.holdings.sample, newPaidCalls: 0}) + '\n');
}
