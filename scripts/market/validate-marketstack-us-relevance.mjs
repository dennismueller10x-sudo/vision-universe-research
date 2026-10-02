#!/usr/bin/env node
/** Read-only relevance audit. No network access, price export, or admission writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const BUCKETS = {
  A: 'CORE_HIGH_RELEVANCE_ACTIVE_COMMON_CLASS',
  B: 'ACTIVE_INVESTABLE_COMMON_CLASS_CANDIDATE',
  C: 'LOW_LIQUIDITY_COMMON_CLASS_CANDIDATE',
  D: 'NON_CONSUMER_OR_NON_COMPANY_SECURITY',
  E: 'INACTIVE_DELISTED_OR_DOCUMENTED_STALE',
  F: 'PROVEN_DUPLICATE_OR_ALTERNATE_LISTING',
  G: 'UNRESOLVED',
};
const nonCompany = new Set(['ETF', 'ETN', 'BOND', 'WARRANT', 'PREFERRED', 'UNIT', 'RIGHT', 'TEST_SECURITY', 'CEF']);
const number = value => typeof value === 'number' && Number.isFinite(value);
const lex = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function liquidityEvidence(factor, asOfDate) {
  const age = factor?.asOf ? (Date.parse(asOfDate) - Date.parse(factor.asOf)) / 86400000 : null;
  const avg = factor?.values?.avgVolume60d;
  return {
    source: factor ? 'TIINGO_EXISTING_CANONICAL_TECHNICAL_FACTORS' : null,
    asOfDate: factor?.asOf ?? null,
    ageCalendarDays: number(age) ? age : null,
    dailyHistoryBars: factor?.bars ?? null,
    averageVolume60d: number(avg) && avg >= 0 ? avg : null,
    factorQuality: factor?.dataQuality ?? null,
    recentAndUsable: factor?.dataQuality === 'PASS' && number(age) && age >= 0 && age <= 14 && factor?.bars >= 60 && number(avg) && avg > 0,
    thresholdPurpose: 'RELEVANCE_ANALYSIS_ONLY_NOT_A_VU_UNIVERSE_POLICY_OR_DOLLAR_TURNOVER_MEASURE',
  };
}
export function classifyRelevance({ consumer, currentRole, baselineActive, currentListingObserved, historicalConflict, documentedClassRemoval, provedDuplicate = false, indexes = [], liquidity }) {
  if (provedDuplicate) return { bucket: 'F', reason: 'INDEPENDENT_SAME_SECURITY_DUPLICATION_PROOF' };
  if (documentedClassRemoval) return { bucket: 'E', reason: 'EXACT_CLASS_VENUE_REMOVAL_IN_ACCEPTED_INDEPENDENT_EVIDENCE' };
  if (nonCompany.has(currentRole)) return { bucket: 'D', reason: 'EXPLICIT_CURRENT_NON_COMMON_COMPANY_ROLE_EQUITY_ANALYSIS_SCOPE_ONLY' };
  if (!consumer) return { bucket: 'D', reason: 'NOT_IN_PROTECTED_VU_CONSUMER_DIRECTORY' };
  if (baselineActive === 'INACTIVE' && !currentListingObserved) return { bucket: 'E', reason: 'BASELINE_INACTIVE_CURRENT_TERMINATION_NOT_PROVEN' };
  if (historicalConflict) return { bucket: 'G', reason: 'HISTORICAL_SECURITY_ISSUER_CONTINUITY_CONTRADICTION' };
  if (currentRole !== 'EQUITY_COMMON' || !currentListingObserved || baselineActive !== 'ACTIVE') return { bucket: 'G', reason: currentRole === 'ADR' ? 'ADR_IS_USER_RELEVANT_BUT_NOT_CERTIFIED_COMMON_SHARE_OR_VALUATION_BASIS' : 'CURRENT_COMMON_ROLE_ACTIVE_BASELINE_AND_LISTING_EVIDENCE_INCOMPLETE' };
  if (indexes.length) return { bucket: 'A', reason: 'MAPPED_EXISTING_MAJOR_INDEX_SOURCE_WITH_CURRENT_COMMON_CLASS' };
  if (liquidity?.recentAndUsable && liquidity.averageVolume60d < 10000) return { bucket: 'C', reason: 'RECENT_TIINGO_AVERAGE_DAILY_SHARE_VOLUME_BELOW_10000_ANALYTICAL_BUCKET_ONLY' };
  if (liquidity?.recentAndUsable) return { bucket: 'B', reason: 'CURRENT_COMMON_CLASS_PLUS_RECENT_TIINGO_ACTIVITY_NOT_FULL_SECURITY_CONTINUITY_PROOF' };
  return { bucket: 'G', reason: 'NO_USABLE_RECENT_ACTIVITY_EVIDENCE_NO_INACTIVITY_INFERENCE' };
}
const counts = (rows, key) => Object.fromEntries([...new Set(rows.map(r => r[key]))].sort(lex).map(k => [k, rows.filter(r => r[key] === k).length]));
export function buildReport({ diff, unmatched, consumer, quality, eligibility, names, factors, indexes, sources = [] }) {
  const consumerBy = new Map(consumer.rows.map(r => [r.symbol,r]));
  const unmatchedBy = new Map(unmatched.rows.map(r => [r.ticker,r]));
  const qualityBy = new Map(quality.rows.map(r => [r.symbol,r]));
  const eligibilityBy = new Map(eligibility.decisions.map(r => [r.ticker,r]));
  const namesBy = new Map(names.rows.map(r => [r.ticker,r]));
  const factorBy = new Map(factors.securities.map(r => [r.ticker,r]));
  const protectedGapSymbols = new Set(consumer.allProtectedConsumerGaps.map(r => r.symbol));
  const currentCommonGapSymbols = new Set(consumer.relevantCurrentCommonStockGaps.map(r => r.symbol));
  const membershipBy = new Map();
  for (const index of indexes) for (const m of index.members) {
    if (!membershipBy.has(m.symbol)) membershipBy.set(m.symbol,[]);
    membershipBy.get(m.symbol).push(index.indexId);
  }
  const rows = diff.rows.filter(r => r.directoryStatus !== 'DIRECTORY_MATCHED' || r.latestObservation?.validLatest !== true || currentCommonGapSymbols.has(r.ticker)).map(r => {
    const c = consumerBy.get(r.ticker), u = unmatchedBy.get(r.ticker), q = qualityBy.get(r.ticker), e = eligibilityBy.get(r.ticker), n = namesBy.get(r.ticker);
    const idx = membershipBy.get(r.ticker) ?? [];
    const current = c?.current_role ?? u?.independentCurrentListing?.currentListing?.role ?? null;
    const currentlyObserved = c?.current_listing_status === 'CURRENT_LISTING_OBSERVED' || u?.independentCurrentListing?.publicDirectoryStatus === 'CURRENT_LISTING_OBSERVED';
    const liquidity = liquidityEvidence(factorBy.get(r.ticker), diff.asOfDate);
    const classification = classifyRelevance({ consumer:r.consumer, currentRole:current, baselineActive:r.activeStatus, currentListingObserved:currentlyObserved, historicalConflict:c?.historical_issuer_continuity_contradiction === true || u?.officialSECContext?.currentSECIssuerConflict === true, documentedClassRemoval:q?.independently_explained_original_flag === true && ['DELISTED','EXPECTED_STALE'].includes(q.classification), indexes:idx, liquidity });
    const currentCommon = c?.active_current_common_class === true;
    const currentIdentityCovered = c?.current_common_identity_covered ?? (c?.current_common_gap_classification === 'WRONG_CURRENT_VENUE' ? false : null);
    const currentLatestCovered = c?.current_common_valid_latest_covered ?? (c?.current_common_gap_classification === 'WRONG_CURRENT_VENUE' ? false : null);
    const identityCovered = c ? c.protected_consumer_identity_covered === true : r.directoryStatus === 'DIRECTORY_MATCHED';
    const latestCovered = c ? c.protected_consumer_valid_latest_covered === true : r.latestObservation?.validLatest === true;
    return {
      symbol:r.ticker, companyName:c?.company_name ?? u?.companyName ?? n?.companyName ?? null,
      currentSecurityName:c?.current_security_name ?? u?.independentCurrentListing?.currentListing?.securityName ?? null,
      companyId:c?.company_id ?? null, securityId:r.securityId, listingId:c?.listing_id ?? null,
      baselineExchange:r.exchange, baselineMICs:r.expectedMics, currentMIC:c?.current_mic ?? u?.independentCurrentListing?.currentListing?.mic ?? null,
      shareClass:u?.identifiers?.shareClass ?? null, ISIN:u?.identifiers?.isin ?? null, CIK:u?.identifiers?.cik ?? n?.cik ?? null,
      currentInstrumentClassificationSource:current ? 'ACCEPTED_PR334_OFFICIAL_CURRENT_CLASS_OBSERVATION' : null,
      baselineActiveStatus:r.activeStatus, currentListingObserved:currentlyObserved, currentRole:current, baselineType:r.instrumentType,
      consumerMember:r.consumer, productMember:r.productMember, existingEligibility:e?.product_eligibility ?? null, existingEligibilityReason:e?.product_eligibility_reason ?? null,
      relevanceBucket:classification.bucket, relevanceLabel:BUCKETS[classification.bucket], relevanceReason:classification.reason,
      majorIndexMembership:idx, indexMembershipEvidenceScope:'EXISTING_DATED_OWNER_OR_FUND_PROXY_MEMBERSHIP_NOT_NEW_INDEX_CERTIFICATION',
      priorityForUserImpact:r.consumer && (idx.length > 0 || ['A','B','C'].includes(classification.bucket) || current === 'ADR'),
      literalCurrentCommonClassSubset:currentCommon, protectedConsumerGap:protectedGapSymbols.has(r.ticker), currentCommonRequiredListingGap:currentCommonGapSymbols.has(r.ticker),
      legalIssuerSecurityContinuityFullyProven:false,
      identityCovered, validLatestCovered:latestCovered,
      currentCommonIdentityCovered:currentIdentityCovered,
      currentCommonValidLatestCovered:currentLatestCovered,
      directoryStatus:r.directoryStatus, latestStatus:c?.latest_status ?? r.latestObservation?.status ?? null,
      currentListingLatestStatus:c?.current_common_latest_status ?? null,
      qualityClassification:q?.classification ?? null,
      resolvedIdentityStatus:u?.identityResolution ?? null,
      identityResolvedLatestPassed:u?.acceptedIdentity != null && u?.finalGapStatus === 'RESOLVED_IDENTITY_LATEST_VALIDATED_HISTORY_QUALITY_REJECTED',
      degradation:currentCommon && currentIdentityCovered === false ? 'CURRENT_REQUIRED_LISTING_IDENTITY_UNVALIDATED' : !identityCovered ? 'REQUIRED_LISTING_IDENTITY_UNVALIDATED' : !latestCovered ? 'LATEST_PRICE_REJECTED_OR_UNAVAILABLE' : 'HISTORY_AND_ADJUSTMENT_NOT_VALIDATED',
      namedGapReason:c?.current_common_gap_classification ?? c?.gap_classification ?? u?.finalGapStatus ?? r.latestObservation?.status ?? r.directoryStatus,
      latestReportedDate:c?.latest_reported_date ?? r.latestObservation?.reportedTradingDate ?? null,
      liquidity, recentTradeVolume:null, recentTradeVolumeUnavailableReason:'CURRENT_FACTOR_ARTIFACT_EXPOSES_AVERAGES_AND_RATIOS_NOT_LATEST_ABSOLUTE_VOLUME', tradingFrequency:liquidity.source ? 'DAILY_SOURCE_FACTORS' : null, marketCap:null, marketCapUnavailableReason:'NO_ISOLATED_SHARE_BASIS_CURRENCY_PIT_VALIDATION_IN_THIS_RELEVANCE_AUDIT',
      aliases:u?.symbolAliases ?? c?.symbol_alias_candidates ?? [], aliasAcceptance:'NOT_APPROVED_BY_RELEVANCE_AUDIT',
      provedGloballyUnsupported:u?.confirmedGenuinelyMissing === true || c?.provider_globally_unsupported_proven === true,
      safeForNewMarketstackQuant:false, productionAdmissionChanged:false,
    };
  }).sort((a,b) => lex(a.symbol,b.symbol));
  const indexCoverage = indexes.map(index => {
    const members = index.members.map(m => {
      const d = diff.rows.find(r => r.ticker === m.symbol);
      const c = consumerBy.get(m.symbol);
      const gap = rows.find(r => r.symbol === m.symbol);
      return { symbol:m.symbol, securityId:m.securityId ?? null, consumerMember:d?.consumer ?? null, gap:!!gap, directoryMatched:d ? d.directoryStatus === 'DIRECTORY_MATCHED' : null, validLatest:d?.latestObservation?.validLatest ?? null, currentCommonIdentityCovered:gap?.currentCommonIdentityCovered ?? c?.current_common_identity_covered ?? null, currentCommonValidLatestCovered:gap?.currentCommonValidLatestCovered ?? c?.current_common_valid_latest_covered ?? null, relevanceBucket:gap?.relevanceBucket ?? null };
    });
    return { indexId:index.indexId, indexName:index.indexName, asOfDate:index.asOf, source:index.source, sourceProxy:index.proxy, sourceScope:index.source === 'ETF_HOLDINGS' ? 'FUND_HOLDINGS_PROXY_NOT_OFFICIAL_COMPLETE_INDEX' : 'INDEX_OWNER_DATED_LIST', retainedMappedMembers:members.filter(m => m.consumerMember != null).length, sourceMappedMembers:members.length, identityGaps:members.filter(m => m.directoryMatched === false).length, latestOrIdentityGaps:members.filter(m => m.directoryMatched === false || m.validLatest === false).length, requiredListingFitnessGaps:members.filter(m => m.gap).length, rejectedLatestAfterDirectoryMatch:members.filter(m => m.directoryMatched === true && m.validLatest === false).length, consumerGaps:members.filter(m => m.gap && m.consumerMember === true).length, completeOfficialIndexGapCount:null, unmatchedSourceRows:index.unmatched.map(x => ({symbol:x.ticker,name:x.name ?? null,reason:x.reason})), gapMembers:members.filter(m => m.gap), requiredListingFitnessPercentOfMappedRetainedMembers:Number((100*members.filter(m => m.consumerMember != null && !m.gap).length/members.filter(m => m.consumerMember != null).length).toFixed(6)) };
  });
  return {
    schemaVersion:'marketstack-us-gap-relevance-1.0.0', asOfDate:diff.asOfDate,
    generatedFrom:'ACCEPTED_PR334_CACHED_EVIDENCE_NO_NEW_PROVIDER_REQUESTS', sources, requestsMade:0, additionalEstimatedCredits:0, canonicalWrites:0,
    classificationPolicy:{ buckets:BUCKETS, currentCommonClassIsNotCertifiedLegalContinuity:true, relevanceLiquidityThresholdAverageDailyShares:10000, liquidityThresholdIsNotConsumerPolicy:true, recencyMaximumCalendarDays:14, completeActiveCommonTotal:null, cannotInferProviderUnsupportedFromMissingResponse:true, companyMarketCapRankingNotComputed:true },
    totals:{ retainedRecords:diff.rows.length, exactDirectoryMatches:diff.rows.filter(r => r.directoryStatus === 'DIRECTORY_MATCHED').length, nonExactDirectoryRecords:unmatched.rows.length, rejectedExactLatest:quality.rows.length, allRetainedIdentityOrLatestGaps:diff.rows.filter(r => r.directoryStatus !== 'DIRECTORY_MATCHED' || r.latestObservation?.validLatest !== true).length, allAuditedRequiredListingGaps:rows.length, additionalCurrentVenueGaps:rows.filter(r => r.currentCommonRequiredListingGap && r.identityCovered && r.validLatestCovered).length, bucketCounts:counts(rows,'relevanceBucket'), protectedConsumerGaps:rows.filter(r => r.protectedConsumerGap).length, consumerRequiredListingFitnessGaps:rows.filter(r => r.consumerMember).length, consumerBucketCounts:counts(rows.filter(r => r.consumerMember),'relevanceBucket'), currentCommonClassConsumerGaps:rows.filter(r => r.currentCommonRequiredListingGap).length, userPriorityConsumerGaps:rows.filter(r => r.priorityForUserImpact).length, majorIndexConsumerGapUnion:rows.filter(r => r.consumerMember && r.majorIndexMembership.length).length, genuineUnsupportedActiveCommonStocks:null, provedGloballyUnsupported:rows.filter(r => r.provedGloballyUnsupported).length },
    protectedConsumerCoverage:consumer.protectedConsumerCoverage,
    currentCommonClassCoverage:consumer.currentCommonClassCoverage,
    indexCoverage,
    topMarketCapGapCount:null,
    namedHighRelevanceConsumerGaps:rows.filter(r => r.consumerMember && r.majorIndexMembership.length).map(({symbol,companyName,majorIndexMembership,directoryStatus,latestStatus,currentListingLatestStatus,relevanceBucket,namedGapReason})=>({symbol,companyName,majorIndexMembership,directoryStatus,latestStatus,currentListingLatestStatus,relevanceBucket,namedGapReason})),
    namedCurrentCommonClassConsumerGaps:rows.filter(r => r.literalCurrentCommonClassSubset).map(({symbol,companyName,relevanceBucket,currentMIC,currentCommonIdentityCovered,currentListingLatestStatus,namedGapReason})=>({symbol,companyName,relevanceBucket,currentMIC,currentCommonIdentityCovered,currentListingLatestStatus,namedGapReason})),
    userImpactConclusion:'REAL_CORE_NAMES_WOULD_DEGRADE_UNDER_A_MARKETSTACK_ONLY_US_EOD_CUTOVER_CACHED_REJECTIONS_DO_NOT_PROVE_GLOBAL_UNAVAILABILITY',
    limitations:[
      'Coverage is the frozen 2026-10-01 experiment; subsequent repairs or delistings are not observed.',
      'Current symbol/MIC/common-class observations do not independently prove historical legal issuer/security continuity.',
      'SP500 and DJIA membership files are dated ETF-holdings proxies; mapped-source gap counts are not certified complete current index counts.',
      'Liquidity is existing Tiingo average daily share volume, not native-dollar turnover or market capitalization; no microcap label is inferred from low volume.',
      'ADR candidates remain user-relevant but unresolved for strict common-share and valuation basis; equity-scope noncompany instruments can still matter to a future ETF product.',
      'Inactive baseline status does not prove legal delisting; issuer-only siblings and alternate venues are never approved as security aliases.',
      'Latest currency-contract rejection is not proof the numerical price is wrong, but it remains unsafe without verified identity and native currency.',
    ], rows,
  };
}
/** Separate diagnostic sample; never amends frozen consumer coverage or gap buckets. */
export function diagnoseRetest(evidence, baseline, evidenceSHA256 = null) {
  const gapBy = new Map(baseline.rows.map(r => [r.symbol,r]));
  const sharedRunId = evidence.run?.snapshotRunId ?? null;
  const sharedAccounting = evidence.accounting?.[sharedRunId] ?? null;
  const endpoints = evidence.endpoints.filter(r => r.endpoint === 'eod' && r.label === 'product-fitness-us-eod');
  const rows = endpoints.map(response => {
    const requestedSymbol = response.params?.symbols, requestedMIC = response.params?.exchange;
    const bars = Array.isArray(response.data?.data) ? response.data.data : [];
    const sorted = [...bars].sort((a,b) => lex(String(a.date),String(b.date)));
    const gap = gapBy.get(requestedSymbol);
    const counts = {};
    const isBadOHLC = row => {
      const prices = ['open','high','low','close'].map(k => row[k]);
      return !prices.every(n => number(n) && n > 0) || row.low > row.high || row.open < row.low || row.open > row.high || row.close < row.low || row.close > row.high;
    };
    for (const row of bars) {
      const currency = typeof row.price_currency === 'string' ? row.price_currency.toUpperCase() : 'MISSING';
      counts[currency] = (counts[currency] ?? 0) + 1;
    }
    const badOHLC = bars.filter(isBadOHLC).length;
    const missingCurrency = bars.filter(b => typeof b.price_currency !== 'string' || !b.price_currency.trim()).length;
    const wrongCurrency = bars.filter(b => typeof b.price_currency === 'string' && b.price_currency.toUpperCase() !== 'USD').length;
    const mismatchedIdentity = bars.filter(b => b.symbol !== requestedSymbol || b.exchange !== requestedMIC).length;
    const duplicateDates = sorted.length - new Set(sorted.map(b => String(b.date).slice(0,10))).size;
    const invalidVolume = bars.filter(b => !number(b.volume) || b.volume < 0).length;
    const latest = sorted.at(-1);
    const latestDate = latest?.date?.slice(0,10) ?? null;
    const latestStructurallyValid = !!latest && !isBadOHLC(latest) && number(latest.volume) && latest.volume >= 0;
    const latestNativeCurrencyValid = typeof latest?.price_currency === 'string' && latest.price_currency.toUpperCase() === 'USD';
    return {
      requestedSymbol, requestedMIC, requestedDateFrom:response.params.date_from, requestedDateTo:response.params.date_to,
      sourceRunId:response.sourceRunId, retrievedAt:response.retrievedAt ?? response.checkedAt, sourceRunAttribution:response.sourceRunAttribution,
      endpointSucceeded:response.ok === true, providerReportedTotal:response.data?.pagination?.total ?? null, observedBars:bars.length,
      historyStart:sorted[0]?.date?.slice(0,10) ?? null, latestObservedDate:latestDate,
      boundedRequestedEndReached:latestDate != null && latestDate === response.params.date_to,
      latestQuoteFreshness:'NOT_TESTED_HISTORY_REQUEST_BOUNDED_TO_2026_09_30_NOT_CURRENT_LATEST_ENDPOINT',
      latestOHLCAndVolumeValid:latestStructurallyValid, latestNativeUSDCurrencyValid:latestNativeCurrencyValid,
      latestSymbolMICValid:!!latest && latest.symbol === requestedSymbol && latest.exchange === requestedMIC,
      latestObservationContractPass:latestStructurallyValid && latestNativeCurrencyValid && latest.symbol === requestedSymbol && latest.exchange === requestedMIC,
      currencyCounts:Object.fromEntries(Object.entries(counts).sort(([a],[b])=>lex(a,b))),
      missingCurrencyBars:missingCurrency, contradictoryCurrencyBars:wrongCurrency, invalidOHLCBars:badOHLC, invalidVolumeBars:invalidVolume, duplicateDateBars:duplicateDates, mismatchedSymbolOrMICBars:mismatchedIdentity,
      rawHistoryContractsPass:bars.length > 0 && !badOHLC && !missingCurrency && !wrongCurrency && !mismatchedIdentity && !duplicateDates && !invalidVolume,
      belongsToFrozenGapAudit:!!gap, frozenGapClassification:gap?.namedGapReason ?? null, frozenLatestStatus:gap?.latestStatus ?? null,
      currentRequiredMIC:gap?.currentMIC ?? null, requestedMICAgreesWithObservedCurrentListing:gap?.currentMIC ? gap.currentMIC === requestedMIC : null,
      emptyResponseInterpretation:bars.length === 0 ? requestedSymbol === 'BRK.B' ? 'BOUNDED_DOT_NOTATION_REQUEST_EMPTY_KNOWN_SYMBOL_FORMAT_CANDIDATES_NOT_EXHAUSTED' : 'BOUNDED_REQUEST_EMPTY_DOES_NOT_PROVE_GLOBAL_UNSUPPORTED' : null,
      securityIdentityIndependentlyProven:false, aliasApproved:false,
      adjustmentSemantics:'DELEGATED_TO_SEPARATE_CORPORATE_ACTION_VALIDATION_NOT_INFERRED_FROM_PRICE_LEVEL_SIMILARITY',
      safeForNewMarketstackQuant:false, safeForNewMarketstackBacktest:false, newProductionAdmission:false,
    };
  }).sort((a,b)=>lex(a.requestedSymbol,b.requestedSymbol));
  return {
    scope:'SEPARATE_25_US_BOUNDED_HISTORY_DIAGNOSTIC_DOES_NOT_REPLACE_FROZEN_COVERAGE',
    source:{privateArtifact:true,sha256:evidenceSHA256,snapshotRunId:evidence.run?.snapshotRunId ?? null},
    requestAccounting:{analysisRequestsMade:0,analysisAdditionalEstimatedCredits:0,sharedSourceRunEstimatedCredits:sharedAccounting?.estimatedCreditsConsumed ?? null,sharedSourceRunRequests:sharedAccounting?.requestsAttempted ?? null,sharedSourceRunAccountingGroupId:sharedRunId,sharedAccountingWarning:'75_SHARED_HISTORY_SPLIT_DIVIDEND_REQUESTS_ARE_COUNTED_ONCE_BY_CENTRAL_RUN_LEDGER_NOT_AGAIN_FOR_THIS_25_HISTORY_ANALYSIS'},
    totalHistoryRequestsObserved:rows.length, nonemptyHistoryResponses:rows.filter(r=>r.observedBars>0).length,
    emptyHistoryResponses:rows.filter(r=>r.observedBars===0).length,
    latestObservationContractPass:rows.filter(r=>r.latestObservationContractPass).length,
    rawHistoryContractsPass:rows.filter(r=>r.rawHistoryContractsPass).length,
    totalObservedBars:rows.reduce((s,r)=>s+r.observedBars,0), invalidOHLCBars:rows.reduce((s,r)=>s+r.invalidOHLCBars,0),
    missingCurrencyBars:rows.reduce((s,r)=>s+r.missingCurrencyBars,0), contradictoryCurrencyBars:rows.reduce((s,r)=>s+r.contradictoryCurrencyBars,0),
    frozenCoverageAndClassificationsUnchanged:true, newQuantAdmissions:0, newBacktestAdmissions:0,
    limitations:[
      'Only the requested 2024-01-01 through 2026-09-30 window is sampled; latest endpoint freshness on 2026-10-02 is not measured.',
      'Historical rows declaring USD at the endpoint may also contain contradictory or missing currencies earlier in the same series.',
      'A latest-row contract pass is a diagnostic observation, not security identity proof, adjustment validation or full-history safety.',
      'Empty bounded requests do not prove global unavailability or authorize aliases; BRK.B dot notation has unexhausted format alternatives.',
      'Original US coverage metrics, 1,529 classifications and 460 unsafe baseline flags are unchanged by these observations.',
    ],rows,
  };
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function generateReport(repoRoot = root, retestEvidencePath = null) {
  const paths = {
    diff:'reports/marketstack/marketstack_tiingo_us_diff.json', unmatched:'reports/marketstack/us_marketstack_unmatched_classification.json', consumer:'reports/marketstack/us_marketstack_consumer_final.json', quality:'reports/marketstack/us_marketstack_quality_final.json',
    eligibility:'quant/data/market/security-master/eligibility.json', names:'quant/data/market/security-master/company-names.json', factors:'quant/data/market/factors/factors-FULL_UNIVERSE.json',
    SP500:'quant/data/market/index-membership/SP500.json', NDX:'quant/data/market/index-membership/NDX.json', DJIA:'quant/data/market/index-membership/DJIA.json',
  };
  const loaded = {}, sources = [];
  for (const [key,relative] of Object.entries(paths)) {
    const bytes = fs.readFileSync(path.join(repoRoot,relative)); loaded[key] = JSON.parse(bytes);
    sources.push({path:relative, sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const report = buildReport({...loaded,indexes:[loaded.SP500,loaded.NDX,loaded.DJIA],sources});
  if (retestEvidencePath) {
    const bytes = fs.readFileSync(retestEvidencePath);
    report.recentHistoryDiagnosticRetest = diagnoseRetest(JSON.parse(bytes),report,crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(a=>a.startsWith('--output='))?.slice(9) ?? path.join(root,'reports/marketstack/us_gap_relevance.json');
  const retestPath = process.argv.find(a=>a.startsWith('--retest-evidence='))?.slice(18) ?? null;
  const report = generateReport(root,retestPath); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output:out,totals:report.totals,indexes:report.indexCoverage.map(({indexId,latestOrIdentityGaps,identityGaps})=>({indexId,latestOrIdentityGaps,identityGaps}))}));
}
