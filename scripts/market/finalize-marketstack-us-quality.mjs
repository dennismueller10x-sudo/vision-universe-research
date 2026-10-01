/** Offline causal audit of the original complete-US rejected observations.
 * A categorized defect is not a repaired candle. No provider calls, conversion,
 * stale-price exemption or canonical writes are performed here.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { probeResponseProvenance } from './marketstack-evidence-provenance.mjs';
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10) : null;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const countBy = (rows, fn) => rows.reduce((out, row) => { const key = fn(row) || 'UNKNOWN'; out[key] = (out[key] || 0) + 1; return out; }, {});
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const rawRows = entry => Array.isArray(entry.data) ? entry.data : Array.isArray(entry.data?.data) ? entry.data.data : [];
const maxStoredTimestamp = values => { const times = values.map(v => Date.parse(v || '')).filter(Number.isFinite); return times.length ? new Date(Math.max(...times)).toISOString() : values.find(Boolean) || null; };
export function calendarEvidence(calendar, mic, from, asOfDate) {
  const exchange = calendar?.exchanges?.[mic];
  if (!exchange || !from || from < calendar.coverage?.from || asOfDate > calendar.coverage?.to)
    return { status: 'UNVERIFIED_CALENDAR_COVERAGE', completedSessionsAfterObservation: null };
  const holidays = new Set(exchange.holidays || []), weekdays = new Set(exchange.weekdays || [1, 2, 3, 4, 5]);
  let sessions = 0, closures = 0;
  // The collection occurred before the audit day's US close. Only earlier days
  // can be expected completed EOD sessions; never demand today's unfinished bar.
  for (let timestamp = Date.parse(from) + 86400000; timestamp < Date.parse(asOfDate); timestamp += 86400000) {
    const date = new Date(timestamp), d = date.toISOString().slice(0, 10);
    if (weekdays.has(date.getUTCDay())) { if (holidays.has(d)) closures++; else sessions++; }
  }
  return { status: 'COVERED_REPOSITORY_SESSION_CALENDAR', calendarId: calendar.calendarId,
    calendarSourceConfidence: 'REPOSITORY_PUBLIC_RULES_NOT_PROVIDER_CONFIRMED', completedSessionsAfterObservation: sessions,
    weekdayHolidayClosuresAfterObservation: closures, currentIncompleteSessionExcluded: true,
    exchangeCalendarMic: mic, explainsStaleness: sessions === 0 };
}
export function finalizeUSQuality(quality, latest, probes, calendar, references = {}, options = {}) {
  if (!Array.isArray(quality?.rows) || new Set(quality.rows.map(r => r.securityId)).size !== quality.rows.length ||
      latest?.baselineSource?.sha256 !== quality.protectedBaselineSource?.sha256 || !Array.isArray(latest.rows))
    throw new Error('Unique original quality flags and matching private latest evidence required');
  const privateRows = new Map(latest.rows.map(r => [r.securityId, r]));
  const classRemovals = new Map((options.removals?.rows || []).map(r => [r.securityId, r]));
  const endpoints = probes.flatMap(p => (p.endpoints || []).map(e => ({ ...e, ...probeResponseProvenance(e, p) })));
  const rows = quality.rows.map(row => {
    const privateRow = privateRows.get(row.securityId), original = row.latestQuality;
    if (!privateRow || privateRow.status !== original.originalStatus || privateRow.providerSymbol !== row.providerSymbol ||
        !row.expectedMics.includes(privateRow.mic)) throw new Error('Original public/private flag identity or rejection disagreement');
    const obs = privateRow.observation || {}, independent = row.independentCurrentListing, current = independent?.currentListing;
    const reference = references[row.securityId] || null;
    const candles = reference?.points || [], lastReferenceDate = candles.at(-1)?.[0] || row.localTiingoHistory?.lastDate || null;
    const referenceAsOfObservation = candles.find(p => p[0] === day(obs.marketTimestamp));
    const calendarCheck = calendarEvidence(calendar, privateRow.mic, day(obs.marketTimestamp), quality.asOfDate);
    const currentRole = current?.role === 'UNKNOWN' && /\b(?:senior|subordinated|secured|unsecured) (?:notes?|bonds?|debentures?)\b|\b(?:notes?|bonds?|debentures?) due \d{4}/i.test(current?.securityName || '') ? 'BOND' : current?.role || null;
    const supplementalRemoval = classRemovals.get(row.securityId);
    const newlyExplainedStale = supplementalRemoval?.expectedStaleObservationExplained === true;
    const documentedSymbolChange = original.originalStatus === 'STALE_LATEST_ACTIVE' && supplementalRemoval?.corporateActionEvidence?.length > 0;
    let classification = 'UNKNOWN', reason = 'STALE_ABSENT_CURRENT_DIRECTORY_WITHOUT_SECURITY_SPECIFIC_TERMINATION_OR_TRADE_EVIDENCE';
    let causalCertainty = 'UNKNOWN';
    if (row.activeStatus.officialBaselineListingRemovalFiled && original.originalStatus === 'STALE_LATEST_ACTIVE') {
      classification = 'DELISTED'; reason = 'OFFICIAL_FORM_25_IDENTIFIES_BASELINE_CLASS_AND_VENUE_REMOVAL'; causalCertainty = 'DOCUMENTED_VENUE_REMOVAL';
    } else if (newlyExplainedStale && original.originalStatus === 'STALE_LATEST_ACTIVE') {
      classification = 'EXPECTED_STALE'; reason = 'INDEPENDENT_PRE_REMOVAL_SEC_TRADING_SYMBOL_CLASS_VENUE_CONTEXT_AND_EXACT_FORM25_REMOVAL_NOTIFICATION';
      causalCertainty = 'DOCUMENTED_EXCHANGE_REMOVAL_NOTIFICATION_EFFECTIVE_LAST_TRADE_DATE_UNKNOWN';
    } else if (documentedSymbolChange) {
      classification = 'CORPORATE_ACTION'; reason = 'EXPLICIT_OFFICIAL_OLD_TO_NEW_TRADING_SYMBOL_DECLARATION_CORROBORATED_BY_CURRENT_NEW_SYMBOL_ISSUER_VENUE';
      causalCertainty = 'DOCUMENTED_TICKER_TRANSITION_PROVIDER_PRICE_SECURITY_IDENTIFIER_NOT_VERIFIED';
    } else if (original.originalStatus === 'INVALID_OHLC') {
      classification = 'INVALID_OHLC'; reason = 'ORIGINAL_CANDLE_VIOLATES_STRICT_POSITIVE_OHLC_INVARIANTS'; causalCertainty = 'OBSERVED_STRUCTURAL_DEFECT';
    } else if (original.originalStatus === 'CURRENCY_MISMATCH' || original.originalStatus === 'MISSING_PROVIDER_CURRENCY') {
      classification = 'PROVIDER_DATA_QUALITY'; reason = original.originalStatus === 'CURRENCY_MISMATCH' ?
        'US_LISTING_PRICE_ROW_DECLARES_NON_USD_OR_CONTRADICTORY_CURRENCY' : 'PRICE_ROW_HAS_NO_EXPLICIT_TRADING_CURRENCY';
      causalCertainty = 'OBSERVED_CURRENCY_CONTRACT_DEFECT_ROOT_CAUSE_UNVERIFIED';
    } else if (original.originalStatus === 'ASSET_TYPE_MISMATCH') {
      const officialRoleConflictsBaseline = currentRole && currentRole !== 'UNKNOWN' && currentRole !== row.baselineInstrumentType &&
        !(['EQUITY_COMMON', 'ADR', 'REIT'].includes(currentRole) && ['EQUITY_COMMON', 'ADR', 'REIT'].includes(row.baselineInstrumentType));
      classification = officialRoleConflictsBaseline ? 'IDENTITY_MAPPING_ERROR' : currentRole && currentRole !== 'UNKNOWN' ? 'PROVIDER_SYMBOL_ERROR' : 'UNKNOWN';
      reason = officialRoleConflictsBaseline ? 'CURRENT_OFFICIAL_INSTRUMENT_ROLE_CONTRADICTS_PROTECTED_BASELINE_ROLE' :
        'PROVIDER_PRICE_ASSET_TYPE_CONTRADICTS_EXPECTED_SECURITY_WITHOUT_VERIFIED_ALIAS';
      causalCertainty = officialRoleConflictsBaseline ? 'DOCUMENTED_CURRENT_ROLE_CONFLICT_HISTORICAL_CONTINUITY_UNVERIFIED' :
        currentRole ? 'OBSERVED_PROVIDER_ROLE_CONFLICT' : 'OBSERVED_TYPE_CONFLICT_ATTRIBUTION_UNVERIFIED';
    } else if (original.originalStatus === 'STALE_LATEST_ACTIVE' && calendarCheck.explainsStaleness === true) {
      classification = 'MARKET_HOLIDAY'; reason = 'NO_COMPLETED_OPEN_SESSION_SINCE_LAST_OBSERVATION'; causalCertainty = 'CALENDAR_EXPLANATION';
    }
    const related = endpoints.filter(e => {
      const path = String(e.endpoint || '').replace(/^\//, '');
      return ['eod', 'eod/latest', 'splits', 'dividends'].includes(path) && e.params?.exchange === privateRow.mic &&
        String(e.params?.symbols || '').split(',').includes(row.providerSymbol);
    }).map(e => ({ endpoint: String(e.endpoint).replace(/^\//, ''), checkedAt: e.checkedAt || null,
      ...probeResponseProvenance(e, {}), responseSuccessful: e.ok === true, requestedFrom: e.params?.date_from || null,
      requestedTo: e.params?.date_to || null, sameSymbolVenueObservations: rawRows(e).filter(b => b.symbol === row.providerSymbol && b.exchange === privateRow.mic).length,
      positiveSplitFactorEvents: rawRows(e).filter(b => b.symbol === row.providerSymbol && b.exchange === privateRow.mic && Number(b.split_factor) > 0 && Number(b.split_factor) !== 1).length,
      positiveDividendEvents: rawRows(e).filter(b => b.symbol === row.providerSymbol && b.exchange === privateRow.mic && Number(b.dividend) > 0).length }));
    const canonical = row.identifiers?.canonicalCandidates?.filter(c => row.expectedMics.includes(c.mic)) || [];
    const instrument = canonical.length === 1 ? canonical[0] : null;
    const volume = number(obs.volume);
    const relativeSameDateCloseDifference = referenceAsOfObservation && number(obs.close) !== null && referenceAsOfObservation[1] > 0 ?
      Math.abs(obs.close / referenceAsOfObservation[1] - 1) : null;
    return { listing_id: instrument?.listingId || null, legacy_instrument_id: instrument?.instrumentId || null, listing_identity_namespace: 'EXPLICIT_VU_LISTING_ID_OR_NULL_NO_LEGACY_ID_REINTERPRETATION',
      security_id: row.securityId, symbol: row.ticker, company_name: row.companyName, exchange: row.exchange, mic: privateRow.mic,
      listing_key: row.providerSymbol + '@' + privateRow.mic, consumer: row.consumer, original_status: original.originalStatus,
      classification, reason, causal_certainty: causalCertainty, independently_explained_original_flag: (row.activeStatus.officialBaselineListingRemovalFiled === true || newlyExplainedStale || documentedSymbolChange) && original.originalStatus === 'STALE_LATEST_ACTIVE',
      independently_explained_in_accepted_baseline: row.activeStatus.officialBaselineListingRemovalFiled === true && original.originalStatus === 'STALE_LATEST_ACTIVE',
      evidence: { originalLatestSourceRunId: options.originalLatestRunId || latest.sourceRunId || null, originalLatestRetrievedAt: privateRow.retrievedAt || null,
        originalLatestReportedTradingDate: day(obs.marketTimestamp), expectedCurrency: privateRow.expectedCurrency,
        reportedCurrency: obs.reportedCurrency || null, reportedAssetType: obs.assetType || null,
        defectFlags: [original.originalStatus, ...(original.priceRowAssetTypeConflict ? ['PRICE_ROW_TYPE_CONFLICT'] : []), ...(row.activeStatus.officialBaselineListingRemovalFiled ? ['OFFICIAL_VENUE_REMOVAL'] : [])],
        wrongCurrencyPossibleCauses: original.originalStatus === 'CURRENCY_MISMATCH' ? ['INCORRECT_PROVIDER_CURRENCY_METADATA', 'PRICE_IDENTITY_MAPPING_COLLISION'] : [],
        structuralReasonCodes: original.structuralReasonCodes, originalRejected: true, latestRechecks: original.supplementaryRechecks,
        persistentRejectionObserved: original.supplementaryRechecks.some(d => !d.validLatest),
        currentOfficialListing: current, independentlyExplicitCurrentRole: currentRole, officialDirectoryStatus: independent?.publicDirectoryStatus || null,
        baselineActiveStatus: row.activeStatus.baseline, baselineStatusAsOf: row.activeStatus.baselineAsOf,
        officialSecurityClassVenueRemovals: row.officialSECContext?.officialForm25?.filter(f => f.classMatchesBaseline && f.baselineVenueMatches) || [],
        currentIssuerSymbols: row.officialSECContext?.currentIssuerSymbols || [],
        supplementalIndependentClassRemovalCrosscheck: supplementalRemoval || null,
        issuerAliasEvidenceScope: 'ISSUER_SIBLINGS_ARE_NOT_PROVEN_SECURITY_RENAMES',
        localTiingo: { source: 'tiingo', sha256: reference?.sha256 || row.localTiingoHistory?.sha256 || null,
          seriesType: reference?.priceSeriesType || row.localTiingoHistory?.priceSeriesType || null,
          frequency: reference?.grain || row.localTiingoHistory?.frequency || null, lastDate: lastReferenceDate,
          referenceNewerThanFlag: Boolean(lastReferenceDate && day(obs.marketTimestamp) && lastReferenceDate > day(obs.marketTimestamp)),
          sameDateCloseAvailable: Boolean(referenceAsOfObservation), relativeSameDateCloseDifference,
          comparability: 'LOCAL_SPLIT_ADJUSTED_CLOSE_VS_PROVIDER_RAW_CLOSE_NOT_BYTE_EQUIVALENCE' },
        calendar: calendarCheck, volumeState: volume === null ? 'MISSING_OR_NONFINITE' : volume < 0 ? 'NEGATIVE' : volume === 0 ? 'ZERO' : 'POSITIVE',
        zeroVolumeDoesNotProveSuspension: true, cachedHistoryAndActionObservations: related,
        documentedSymbolTransition: Boolean(documentedSymbolChange), corporateActionPriceAdjustmentCausationProven: false },
      safe_for_eod: false, safe_for_quant: false, safe_for_chart: false,
      safety_scope: 'THE_REJECTED_MARKETSTACK_OBSERVATION_NO_CHANGE_TO_EXISTING_TIINGO_CHARTS',
      next_evidence_required: classification === 'UNKNOWN' ? 'SECURITY_SPECIFIC_EXCHANGE_REMOVAL_OR_SUSPENSION_AND_RECENT_TRADE_EVIDENCE' :
        ['DELISTED','EXPECTED_STALE'].includes(classification) ? 'RETAIN_HISTORICAL_SERIES_ONLY_VERIFY_RELISTING_BEFORE_NEW_CURRENT_MAPPING' : 'PROVIDER_CORRECTED_QUALIFIED_CANDLE_AND_IDENTITY_REVALIDATION' };
  });
  return { schemaVersion: 'marketstack-us-quality-final-1.0.0', generatedAt: maxStoredTimestamp([options.generatedAt, quality.generatedAt, options.removals?.generatedAt, latest.updatedAt, ...probes.map(p => p.generatedAt)]),
    asOfDate: quality.asOfDate, scope: 'ALL_460_ORIGINAL_FLAGS_INCLUDING_PREVIOUS_454_UNSAFE',
    protectedBaselineSource: quality.protectedBaselineSource, sources: options.sources || [], requestsMade: 0, canonicalWrites: 0,
    totals: { originalFlags: rows.length, independentlyExplainedVenueRemoval: rows.filter(r => ['EXPECTED_STALE','DELISTED'].includes(r.classification)).length,
      independentlyExplainedOriginalFlags: rows.filter(r=>r.independently_explained_original_flag).length,
      documentedSymbolTransitions: rows.filter(r=>r.classification==='CORPORATE_ACTION').length,
      acceptedBaselineExplained: rows.filter(r => r.independently_explained_in_accepted_baseline).length,
      additionalIndependentStaleExplanations: rows.filter(r => r.independently_explained_original_flag && !r.independently_explained_in_accepted_baseline).length,
      previousUnresolvedUnsafe: rows.filter(r => !r.independently_explained_in_accepted_baseline).length,
      stillUnexplainedOriginalFlags: rows.filter(r => !r.independently_explained_original_flag).length,
      previous454ByClassification: countBy(rows.filter(r => !r.independently_explained_in_accepted_baseline), r => r.classification),
      allFlagsByClassification: countBy(rows, r => r.classification), observableDefectClassified: rows.filter(r => r.classification !== 'UNKNOWN').length,
      causalUnknown: rows.filter(r => r.classification === 'UNKNOWN').length, unsafe: rows.length, marketstackObservationSafetyOnly: true, protectedTiingoSafetyUnchanged: true,
      repaired: 0, safeForEOD: 0, safeForQuant: 0, safeForChart: 0,
      staleFlagsCalendarExplained: rows.filter(r => r.original_status === 'STALE_LATEST_ACTIVE' && r.evidence.calendar.explainsStaleness).length,
      staleFlagsWithNewerTiingo: rows.filter(r => r.original_status === 'STALE_LATEST_ACTIVE' && r.evidence.localTiingo.referenceNewerThanFlag).length,
      zeroVolumeFlags: rows.filter(r => r.evidence.volumeState === 'ZERO').length },
    limitations: ['Classification of an observed defect does not prove its provider-internal cause or repair it.',
      'Directory absence, old prices and zero volume do not prove delisting, suspension or globally unsupported instruments.',
      'Form25 is class/venue scoped; no worldwide delisting conclusion or new historical PIT availability is inferred.',
      'No current-day EOD candle is demanded before that US trading session closes.',
      'Public reports contain dates, ratios and quality metadata, never raw provider prices or volumes.'], rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.latest || !args.probes) throw new Error('--latest=private-original-latest and --probes=cached-probes required');
  const sources = [], load = (path, privateSource = false) => { const bytes = readFileSync(resolve(path));
    sources.push({ ...(privateSource ? { privateArtifact: true } : { path }), sha256: sha(bytes) }); return JSON.parse(bytes); };
  const quality = load(args.quality || 'reports/marketstack/us_marketstack_quality_flags.json');
  const latest = load(args.latest, true), probes = args.probes.split(',').map(p => load(p, true));
  const calendar = load('quant/config/market-calendar.json'), references = {};
  const removals = args.removals ? load(args.removals) : null;
  for (const row of quality.rows) {
    const path = 'quant/data/market/discover-series/' + row.securityId + '.json'; if (!existsSync(resolve(path))) continue;
    const bytes = readFileSync(path), d = JSON.parse(bytes);
    if (d.securityId !== row.securityId || d.source !== 'tiingo' || !Array.isArray(d.points)) throw new Error('Tiingo reference identity/source mismatch');
    references[row.securityId] = { ...d, sha256: sha(bytes) };
  }
  const result = finalizeUSQuality(quality, latest, probes, calendar, references, { sources, removals, generatedAt: args['generated-at'], originalLatestRunId: args['original-latest-run-id'] });
  writeFileSync(args.out || 'reports/marketstack/us_marketstack_quality_final.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.totals));
}
