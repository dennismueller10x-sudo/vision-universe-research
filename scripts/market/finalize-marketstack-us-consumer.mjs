/** Exhaustive consumer gap decomposition with independent current role/venue.
 * Protected membership coverage is retained verbatim. Current common-class
 * coverage is a separate snapshot, not a migration or globally missing claim.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractUSLatestDiagnostics } from './classify-marketstack-us-gaps.mjs';
import { probeResponseProvenance } from './marketstack-evidence-provenance.mjs';
import { summarizeUSListingEvidence } from './summarize-marketstack-us-listing-evidence.mjs';
const countBy = (rows, fn) => rows.reduce((out, row) => { const key = fn(row) || 'UNKNOWN'; out[key] = (out[key] || 0) + 1; return out; }, {});
const percentage = (covered, total) => total ? Number((100 * covered / total).toFixed(6)) : null;
const maxStoredTimestamp = values => { const times = values.map(v => Date.parse(v || '')).filter(Number.isFinite); return times.length ? new Date(Math.max(...times)).toISOString() : values.find(Boolean) || null; };
export function finalizeUSConsumer(benchmark, unmatched, quality, directory, names = [], instruments = [], options = {}) {
  if (!Array.isArray(benchmark?.rows) || new Set(benchmark.rows.map(r => r.securityId)).size !== benchmark.rows.length ||
      benchmark.baselineSource?.sha256 !== unmatched?.protectedBaselineSource?.sha256 ||
      benchmark.baselineSource?.sha256 !== quality?.protectedBaselineSource?.sha256) throw new Error('Matching protected US evidence required');
  const consumer = benchmark.rows.filter(r => r.consumer);
  const listingEvidence = summarizeUSListingEvidence(directory, consumer.map(r => ({ ...r, baselineInstrumentType: r.instrumentType })),
    { asOfDate: benchmark.asOfDate, baselineSource: benchmark.baselineSource, generatedAt: options.generatedAt });
  const listings = new Map(listingEvidence.rows.map(r => [r.securityId, r]));
  const details = new Map([...unmatched.rows, ...quality.rows].map(r => [r.securityId, r]));
  const namesMap = new Map(names.map(r => [r.securityId, r.companyName]));
  const classRemovals = new Map((options.removals?.rows || []).map(r => [r.securityId, r]));
  const canonical = new Map();
  for (const instrument of instruments) for (const id of [instrument.masterMemberId, ...(instrument.legacyIds || [])].filter(Boolean)) {
    const values = canonical.get(id) || []; if (!values.some(v => v.instrumentId === instrument.instrumentId)) values.push(instrument); canonical.set(id, values);
  }
  const currentEndpointIndex=new Map();
  for(const probe of options.probes||[]) for(const entry of probe.endpoints||[]) {
    const endpoint=String(entry.endpoint||'').replace(/^\//,''),ticker=/^tickers\/([^/]+)\/eod\/latest$/.exec(endpoint);
    if(endpoint!=='eod/latest'&&!ticker||!entry.params?.exchange)continue;
    for(const symbol of ticker?[ticker[1]]:String(entry.params.symbols||'').split(',')) {
      const key=entry.params.exchange+'@'+symbol,group=currentEndpointIndex.get(key)||[];
      group.push({...entry,...probeResponseProvenance(entry,probe),label:'us-current-common-gap-latest'});currentEndpointIndex.set(key,group);
    }
  }
  const rows = consumer.map(b => {
    const detail = details.get(b.securityId), official = listings.get(b.securityId), current = official?.currentListing;
    const isDepositary = /american depos(?:itary|itory)|depos(?:itary|itory) (?:shares?|receipts?)|\bADRs?\b|\bGDRs?\b/i.test(current?.securityName || '');
    const explicitDebt = /\b(?:senior|subordinated|secured|unsecured) (?:notes?|bonds?|debentures?)\b|\b(?:notes?|bonds?|debentures?) due \d{4}/i.test(current?.securityName || '');
    const explicitCommonShares = /\bcommon shares?\b/i.test(current?.securityName || '');
    const legalCompanyRoleUnverified = /\bshares? of beneficial interest\b|\bfunds?\b|\bterm trust\b/i.test(current?.securityName || '') &&
      !(/\bREIT\b/i.test(current?.securityName || '') || b.instrumentType === 'REIT');
    const currentRole = current?.role === 'ETN' || current?.role === 'ETF' ? current.role : isDepositary ? 'ADR' : explicitDebt ? 'BOND' :
      legalCompanyRoleUnverified && ['EQUITY_COMMON', 'UNKNOWN'].includes(current?.role) ? 'UNVERIFIED_FUND_OR_BENEFICIAL_INTEREST_COMPANY_ROLE' :
      current?.role === 'UNKNOWN' && explicitCommonShares ? 'EQUITY_COMMON' : current?.role || 'UNVERIFIED';
    const activeCommonClass = Boolean(b.activeStatus === 'ACTIVE' && current && currentRole === 'EQUITY_COMMON' && current.testIssue === 'N');
    const selectedAlias = detail?.acceptedIdentity?.baselineListingEquivalent ? detail.acceptedIdentity : null;
    const directoryCovered = b.directoryStatus === 'DIRECTORY_MATCHED';
    const baselineIdentityCovered = directoryCovered || Boolean(selectedAlias);
    const baselineLatest = directoryCovered ? b.latestObservation : selectedAlias?.latestDiagnostics?.at(-1);
    const baselineValidLatest = baselineIdentityCovered && baselineLatest?.validLatest === true;
    const currentMicMatches = current?.mic ? b.expectedMics.includes(current.mic) : false;
    const currentIdentityCovered = activeCommonClass && (directoryCovered && currentMicMatches || selectedAlias?.identityAccepted && selectedAlias.mic === current?.mic);
    const currentValidLatest = currentIdentityCovered && baselineValidLatest;
    const status = baselineLatest?.status || null;
    const candidate = canonical.get(b.securityId)?.filter(i => b.expectedMics.includes(i.mic)) || [];
    const instrument = candidate.length === 1 ? candidate[0] : null;
    let gap = 'COVERED_VALID_LATEST';
    if (!baselineValidLatest) {
      gap = detail?.activeStatus?.officialBaselineListingRemovalFiled ? 'INACTIVE_OR_DELISTED_DOCUMENTED_VENUE' :
        b.activeStatus === 'INACTIVE' ? 'INACTIVE_BASELINE_STATUS_UNVERIFIED_TERMINATION' :
        classRemovals.get(b.securityId)?.corporateActionEvidence?.length && status === 'STALE_LATEST_ACTIVE' ? 'DOCUMENTED_SYMBOL_CHANGE_OLD_PRICE_MAPPING_UNVERIFIED' :
        classRemovals.get(b.securityId)?.expectedStaleObservationExplained ? 'EXPECTED_STALE_DOCUMENTED_CLASS_REMOVAL_NOTIFICATION' :
        baselineIdentityCovered ? status === 'STALE_LATEST_ACTIVE' ? 'STALE_LATEST_PRICE' :
          ['INVALID_CORPORATE_ACTION', 'INVALID_ADJUSTED_OHLC'].includes(status) ? 'CORPORATE_ACTION_OR_ADJUSTED_BAR_ISSUE' :
          ['CURRENCY_MISMATCH', 'ASSET_TYPE_MISMATCH', 'EXCHANGE_MISMATCH', 'SYMBOL_MISMATCH'].includes(status) ? 'WRONG_EXCHANGE_OR_PROVIDER_IDENTITY_OR_ROW_METADATA' :
          'RESOLVED_OR_DIRECTORY_IDENTITY_NO_VALID_LATEST_PRICE' :
        detail?.identityResolution === 'UNVERIFIED_CANDIDATE' && detail.symbolAliases?.length ? 'SYMBOL_ALIAS_UNVERIFIED' :
        detail?.securityIdentifiedWithProviderVenueConflict ? 'SECURITY_IDENTIFIED_WRONG_PROVIDER_VENUE' : 'MISSING_VERIFIED_LISTING_IDENTITY';
    }
    const freshCurrentEndpoints=currentEndpointIndex.get(current?.mic+'@'+b.providerSymbol)||[];
    const freshCurrentDiagnostics=current?.mic?extractUSLatestDiagnostics([{endpoints:freshCurrentEndpoints}],b.providerSymbol,current.mic,{securityId:b.securityId,ticker:b.ticker,instrumentType:b.instrumentType,activeStatus:b.activeStatus,consumer:b.consumer,productMember:b.productMember},benchmark.asOfDate):[];
    const exactCurrentDiagnostics = freshCurrentDiagnostics.length ? freshCurrentDiagnostics : detail?.independentListingLatestDiagnostics || [];
    const currentLatestStatus = exactCurrentDiagnostics.at(-1)?.status || (currentMicMatches ? status : baselineValidLatest ? 'BASELINE_VALID_QUOTE_AT_DIFFERENT_CURRENT_MIC' : null);
    const currentCommonGap = !activeCommonClass ? 'NOT_IN_CURRENT_COMMON_CLASS_SUBSET' : currentValidLatest ? 'COVERED_CURRENT_VALID_LATEST' :
      !currentIdentityCovered ? baselineIdentityCovered && !currentMicMatches ? 'WRONG_CURRENT_VENUE' :
        detail?.securityIdentifiedWithProviderVenueConflict ? 'SECURITY_IDENTIFIED_WRONG_PROVIDER_VENUE' : 'MISSING_CURRENT_LISTING_IDENTITY' :
      status === 'STALE_LATEST_ACTIVE' ? 'STALE_LATEST_PRICE' : 'CURRENT_IDENTITY_COVERED_NO_VALID_LATEST';
    return { security_id: b.securityId, listing_id: instrument?.listingId || null, legacy_instrument_id: instrument?.instrumentId || null,
      listing_identity_namespace: 'EXPLICIT_VU_LISTING_ID_OR_NULL_NO_LEGACY_ID_REINTERPRETATION', company_id: instrument?.issuerId || null,
      symbol: b.ticker, provider_symbol: b.providerSymbol, company_name: detail?.companyName || namesMap.get(b.securityId) || instrument?.companyName || null,
      current_security_name: current?.securityName || null, current_role: currentRole,
      baseline_instrument_type: b.instrumentType, baseline_active_status: b.activeStatus, baseline_mics: b.expectedMics,
      current_mic: current?.mic || null, current_listing_status: official?.publicDirectoryStatus || null,
      baseline_current_venue_agrees: current?.mic ? currentMicMatches : null,
      active_current_common_class: activeCommonClass, current_common_scope: 'CURRENT_OFFICIAL_CLASS_AT_BASELINE_SYMBOL_NOT_PROVEN_HISTORICAL_SECURITY_CONTINUITY',
      common_class_refinement_missing_original_directory_coverage: activeCommonClass && current?.role === 'UNKNOWN' && explicitCommonShares && !baselineIdentityCovered,
      common_class_source_role: current?.role || null, legal_company_role_verified: false,
      protected_consumer_identity_covered: baselineIdentityCovered, protected_consumer_valid_latest_covered: baselineValidLatest,
      identity_evidence_level: directoryCovered ? 'EXACT_SYMBOL_MIC_DIRECTORY_ISSUER_NOT_INDEPENDENTLY_PROVEN' : selectedAlias ? selectedAlias.identityBasis : 'NO_ACCEPTED_LISTING_IDENTITY',
      current_common_identity_covered: currentIdentityCovered, current_common_valid_latest_covered: currentValidLatest,
      historical_issuer_continuity_contradiction: detail?.officialSECContext?.currentSECIssuerConflict === true,
      gap_classification: gap, current_common_gap_classification: currentCommonGap, current_common_latest_status: currentLatestStatus, latest_status: status, latest_reported_date: baselineLatest?.reportedTradingDate || null,
      independent_current_mic_diagnostics: exactCurrentDiagnostics,
      same_symbol_other_venue_observation: unmatched.currentCommonEquityGaps?.find(r => r.securityId === b.securityId)?.anyVenueSameSymbolPriceObservationReturned ?? null,
      issuer_alias_candidates: detail?.officialSECContext?.currentIssuerSymbols || [],
      independent_class_removal_crosscheck: classRemovals.get(b.securityId) || null,
      symbol_alias_candidates: detail?.symbolAliases || [],
      provider_globally_unsupported_proven: false,
      safe_for_new_marketstack_quant: false, canonical_writes: 0 };
  });
  const currentCommon = rows.filter(r => r.active_current_common_class);
  const currentCommonMissing = currentCommon.filter(r => !r.current_common_valid_latest_covered);
  const gaps = rows.filter(r => !r.protected_consumer_valid_latest_covered);
  return { schemaVersion: 'marketstack-us-consumer-final-1.0.0', generatedAt: maxStoredTimestamp([options.generatedAt, unmatched.generatedAt, quality.generatedAt, options.removals?.generatedAt, directory.retrievedAt, ...((options.probes || []).map(p => p.generatedAt))]),
    asOfDate: benchmark.asOfDate, protectedBaselineSource: benchmark.baselineSource,
    sources: options.sources || [], officialDirectorySources: directory.sources, requestsMade: 0, canonicalWrites: 0,
    protectedConsumerCoverage: { denominator: rows.length,
      identityCovered: rows.filter(r => r.protected_consumer_identity_covered).length,
      identityCoveredPercent: percentage(rows.filter(r => r.protected_consumer_identity_covered).length, rows.length),
      validLatestCovered: rows.filter(r => r.protected_consumer_valid_latest_covered).length,
      validLatestCoveredPercent: percentage(rows.filter(r => r.protected_consumer_valid_latest_covered).length, rows.length),
      gaps: gaps.length, byGapClassification: countBy(gaps, r => r.gap_classification),
      currentRoleCounts: countBy(rows, r => r.current_role), productionExclusionsChanged: 0 },
    currentCommonClassCoverage: { ACTIVE_CONSUMER_COMMON_STOCKS_TOTAL: null,
      verifiedCurrentActiveCommonClassLowerBound: currentCommon.length,
      MARKETSTACK_IDENTITY_COVERED: currentCommon.filter(r => r.current_common_identity_covered).length,
      MARKETSTACK_VALID_LATEST_COVERED: currentCommon.filter(r => r.current_common_valid_latest_covered).length,
      IDENTITY_COVERED_PERCENT: percentage(currentCommon.filter(r => r.current_common_identity_covered).length, currentCommon.length),
      VALID_LATEST_COVERED_PERCENT: percentage(currentCommon.filter(r => r.current_common_valid_latest_covered).length, currentCommon.length),
      GENUINELY_UNSUPPORTED_ACTIVE_COMMON_STOCKS: null, confirmedGloballyUnsupported: 0,
      notValidLatestAtVerifiedCurrentListing: currentCommonMissing.length,
      missingCurrentListingIdentity: currentCommon.filter(r => !r.current_common_identity_covered).length,
      identityCoveredButNoValidLatest: currentCommon.filter(r => r.current_common_identity_covered && !r.current_common_valid_latest_covered).length,
      missingCurrentListingByLatestStatus: countBy(currentCommonMissing, r => r.current_common_latest_status),
      missingCurrentListingByGapClassification: countBy(currentCommonMissing, r => r.current_common_gap_classification),
      denominatorDefinition: 'ACTIVE_BASELINE_CONSUMER_RECORDS_WITH_INDEPENDENT_CURRENT_COMMON_OR_ORDINARY_CLASS_EXCLUDING_EXPLICIT_DEPOSITARY_DEBT_AND_UNVERIFIED_FUND_BENEFICIAL_INTEREST_COMPANY_ROLES',
      legalIssuerSecurityContinuityFullyProven: false,
      CURRENT_LEGAL_ACTIVE_COMMON_STOCKS_COMPLETE_TOTAL: null,
      knownCommonClassDenominatorIsLowerBound: true,
      unknownCurrentRoleConsumerRecords: rows.filter(r => ['UNKNOWN', 'UNVERIFIED', 'UNVERIFIED_FUND_OR_BENEFICIAL_INTEREST_COMPANY_ROLE'].includes(r.current_role)).length,
      currentlyListedCommonClassButBaselineInactive: rows.filter(r => r.current_role === 'EQUITY_COMMON' && r.current_mic && r.baseline_active_status !== 'ACTIVE').length,
      strictIssuerIdentityCovered: null },
    limitations: ['Protected directory identity coverage preserves PR334 exact-symbol/MIC semantics and is not full ISIN/issuer identity verification.',
      'The complete independently current common-class denominator differs from protected consumer membership, which includes role contradictions and retained historical symbols.',
      'Current listing status and current class names do not prove historical ticker/security continuity.',
      'A failed current-MIC query or another-venue observation does not establish global provider absence.',
      'The genuinely unsupported count remains null because available bounded route evidence cannot prove complete provider unavailability.',
      'All exclusions are analysis-only; Tiingo product membership, prices, routing and fundamentals remain unchanged.'],
    relevantCurrentCommonStockGaps: currentCommonMissing,
    allProtectedConsumerGaps: gaps, rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.directory) throw new Error('--directory=retained-official-snapshot required');
  const sources = [], load = (path, privateSource = false) => { const bytes = readFileSync(resolve(path));
    sources.push({ ...(privateSource ? { privateArtifact: true } : { path }), sha256: createHash('sha256').update(bytes).digest('hex') }); return JSON.parse(bytes); };
  const benchmark = load('reports/marketstack/marketstack_tiingo_us_diff.json');
  const unmatched = load('reports/marketstack/us_marketstack_unmatched_classification.json'), quality = load('reports/marketstack/us_marketstack_quality_flags.json');
  const directory = load(args.directory, true), names = load('quant/data/market/security-master/company-names.json').rows;
  const instruments = readdirSync('quant/data/universe/instruments').filter(p => p.endsWith('.json')).flatMap(p =>
    load('quant/data/universe/instruments/' + p).instruments || []);
  const removals = args.removals ? load(args.removals) : null;
  const probes=args.probes?args.probes.split(',').map(p=>load(p,true)):[];
  const result = finalizeUSConsumer(benchmark, unmatched, quality, directory, names, instruments, { sources, removals, probes, generatedAt: args['generated-at'] });
  writeFileSync(args.out || 'reports/marketstack/us_marketstack_consumer_final.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ protected: result.protectedConsumerCoverage, currentCommon: result.currentCommonClassCoverage }));
}
