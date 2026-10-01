/** Offline US gap/quality investigation. Never fetches a provider, changes the
 * baseline, accepts a name-only join, or exports raw prices from private probes.
 * CIK identifies an issuer, not a share class or listing. Absence is unresolved.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { symbolVariants } from './benchmark-marketstack-us.mjs';
import { evaluateLatestObservation } from './benchmark-marketstack-us-latest.mjs';

const upper = x => typeof x === 'string' ? x.trim().toUpperCase() : null;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const countBy = (rows, fn) => rows.reduce((a, r) => { const k = fn(r) || 'UNKNOWN'; a[k] = (a[k] || 0) + 1; return a; }, {});
const day = x => {
  const d = typeof x === 'string' ? x.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d ? d : null;
};
const cik = x => /^\d{1,10}$/.test(String(x || '')) ? String(x).padStart(10, '0') : null;
const SEC_MICS = { NASDAQ: 'XNAS', NYSE: 'XNYS', 'NYSE AMERICAN': 'XASE', AMEX: 'XASE', 'NYSE ARCA': 'ARCX', NYSEARCA: 'ARCX', CBOE: 'BATS' };
const identifier = (kind, value) => {
  const v = upper(value); if (!v) return null;
  if (!(kind === 'isin' ? /^[A-Z]{2}[A-Z0-9]{9}\d$/ : kind === 'cusip' ? /^[A-Z0-9*@#]{9}$/ : /^[A-Z0-9]{12}$/).test(v)) return null;
  if (kind === 'isin') {
    const expanded = [...v].map(c => /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c).join('');
    const sum = [...expanded].reverse().reduce((n, c, i) => { const d = Number(c) * (i % 2 ? 2 : 1); return n + Math.floor(d / 10) + d % 10; }, 0);
    if (sum % 10) return null;
  }
  return v;
};
function dedupe(rows) {
  const groups = new Map();
  for (const r of rows) { const k = r.symbol + '\0' + r.mic; const a = groups.get(k) || []; a.push(r); groups.set(k, a); }
  return [...groups.values()].map(observations => {
    const last = observations.at(-1);
    const conflictFields = ['cik', 'isin', 'cusip', 'figi', 'shareClass', 'assetType', 'currency'].filter(k =>
      new Set(observations.map(r => upper(r[k])).filter(Boolean).map(v => k === 'assetType' && ['STOCK', 'EQUITY'].includes(v) ? 'EQUITY' : v)).size > 1);
    const rejected = observations.find(r => String(r.identityStatus).startsWith('REJECTED_'));
    const conflicting = conflictFields.length > 0 || Boolean(rejected);
    const verified = observations.filter(r => r.identityAccepted);
    const selected = verified.at(-1) || last;
    return { ...selected, metadataObservations: observations.length, metadataConflictFields: conflictFields,
      identityStatus: conflicting ? rejected?.identityStatus || 'CONFLICTING_PROVIDER_IDENTITY_METADATA' : selected.identityStatus,
      identityAccepted: !conflicting && selected.identityAccepted,
      securityIdentifiedWithProviderVenueConflict: !conflicting && observations.some(r => r.securityIdentifiedWithProviderVenueConflict),
      identityBasis: conflicting ? null : selected.identityBasis,
      observationSources: observations.map(r => r.source) };
  });
}

/** Only explicit instrument terms are classification evidence. 'Trust',
 * 'Shares', 'Fund', or an issuer's CIK by itself does not prove an ETF. */
export function classifyInstrument(baselineType, names = [], rawTypes = []) {
  const evidence = [];
  for (const raw of rawTypes) {
    const t = upper(raw.value);
    if (['ETF', 'ETN', 'WARRANT', 'PREFERRED', 'BOND', 'RIGHT', 'UNIT', 'CEF', 'ADR', 'REIT', 'TEST_SECURITY'].includes(t))
      evidence.push({ type: t, basis: 'EXPLICIT_PROVIDER_ASSET_TYPE', source: raw.source });
  }
  for (const row of names) {
    const n = String(row.name || '');
    const t = /\bETFs?\b/i.test(n) ? 'ETF' : /\bETNs?\b|exchange[- ]traded notes?/i.test(n) ? 'ETN' :
      /\bwarrants?\b/i.test(n) ? 'WARRANT' : /\bpreferred\b|\bPRF PERPETUAL\b|\bperp\.? pfd\b/i.test(n) ? 'PREFERRED' :
      /\bAmerican depositary\b|\bADR\b/i.test(n) ? 'ADR' : null;
    if (t) evidence.push({ type: t, basis: 'EXPLICIT_INSTRUMENT_TERM_IN_SOURCE_NAME', source: row.source });
  }
  const observed = [...new Set(evidence.map(e => e.type))];
  const selected = observed.length === 1 ? observed[0] : baselineType || 'UNKNOWN';
  const fundLike = names.some(r => /\b(?:2X|3X|Daily Target|Daily Leveraged)\b/i.test(String(r.name || '')));
  return { baselineType: baselineType || 'UNKNOWN', evidenceType: observed.length === 1 ? selected : null,
    investigativeType: observed.length > 1 ? 'CONFLICT' : selected,
    status: observed.length > 1 ? 'CONFLICTING_EXPLICIT_TYPE_EVIDENCE' : observed.length && selected !== baselineType ?
      'BASELINE_TYPE_CONFLICT' : fundLike && !observed.length ? 'FUND_LIKE_NAME_REQUIRES_TYPE_VERIFICATION' : 'BASELINE_NOT_INDEPENDENTLY_RECLASSIFIED',
    fundLikeName: fundLike, evidence, productionClassificationChanged: false };
}

/** Preferred notation alternatives preserve the series; never strip all
 * punctuation or drop a class/series suffix. Every alias remains a candidate. */
export function usSymbolAliases(symbol, instrumentType) {
  const s = upper(symbol); if (!s) return [];
  const out = symbolVariants(s).map(symbol => ({ symbol, basis: 'PUNCTUATION_VARIANT_REVIEW' }));
  if (instrumentType === 'PREFERRED') {
    const series = /^(.*)-P-([A-Z])$/.exec(s);
    if (series) out.push({ symbol: series[1] + '-P' + series[2], basis: 'PREFERRED_SERIES_PRESERVING_SEC_NOTATION_REVIEW' });
  }
  return [...new Map(out.filter(r => r.symbol !== s).map(r => [r.symbol, r])).values()];
}

function safeProviderMetadata(raw, source, fallbackMic = null) {
  if (!raw || typeof raw !== 'object' || !upper(raw.symbol)) return null;
  const mic = upper(raw.mic || raw.exchange_mic || raw.stock_exchange?.mic || (typeof raw.exchange === 'string' ? raw.exchange : null) || fallbackMic);
  if (!mic || !/^[A-Z0-9]{4}$/.test(mic)) return null;
  return { symbol: upper(raw.symbol), mic, name: typeof raw.name === 'string' ? raw.name : null,
    cik: cik(raw.cik), isin: identifier('isin', raw.isin), cusip: identifier('cusip', raw.cusip),
    figi: identifier('figi', raw.figi), shareClass: typeof raw.share_class === 'string' ? raw.share_class : null,
    assetType: upper(raw.asset_type || raw.item_type || raw.type), source,
    hasEod: typeof raw.has_eod === 'boolean' ? raw.has_eod : null,
    currency: upper(raw.price_currency || raw.currency?.code || (typeof raw.currency === 'string' ? raw.currency : null)) };
}

/** Directory and ticker metadata are inspected but only selected metadata
 * enters public output. Error messages/bodies and raw bars never enter reports. */
export function extractUSMetadata(probes) {
  const records = [];
  for (const [i, probe] of probes.entries()) for (const endpoint of probe.endpoints || []) {
    if (endpoint.ok === false) continue;
    const path = String(endpoint.endpoint || '').replace(/^\//, '');
    const venue = /^exchanges\/([^/]+)\/tickers$/.exec(path);
    const tickerList = path === 'tickerslist' && endpoint.label === 'us-common-venue-directory-counterexample';
    if (!venue && !tickerList && !/^tickers\/[^/]+$/.test(path)) continue;
    const data = Array.isArray(endpoint.data) ? endpoint.data : Array.isArray(endpoint.data?.data) ? endpoint.data.data :
      endpoint.data?.symbol ? [endpoint.data] : endpoint.data?.data?.symbol ? [endpoint.data.data] : [];
    for (const raw of data) {
      const r = safeProviderMetadata(tickerList ? { ...raw, symbol: raw.symbol || raw.ticker } : raw, { kind: venue ? 'API_EXCHANGE_DIRECTORY' : tickerList ? 'API_TICKER_LIST_SEARCH' : 'API_TICKER_METADATA',
        runId: probe.run?.runId || null, probeIndex: i, checkedAt: day(endpoint.checkedAt) }, venue?.[1]);
      if (r) records.push(r);
    }
  }
  return records;
}

export function extractUSMetadataOutcomes(probes) {
  const records = [];
  for (const probe of probes) for (const e of probe.endpoints || []) {
    if (!['us-gap-identity', 'us-quality-identity'].includes(e.label) || !/^tickers\//.test(e.endpoint || '')) continue;
    const symbol = String(e.endpoint).slice(8);
    records.push({ symbol, targetSecurityIds: e.targetSecurityIds || [], successful: e.ok === true,
      status: e.ok ? 'METADATA_RETURNED' : e.providerErrorType === 'the_requested_data_is_not_available' ?
        'PROVIDER_METADATA_ENDPOINT_DATA_UNAVAILABLE' : 'METADATA_REQUEST_FAILED',
      reason: e.ok ? null : ['networkError', 'timeout', 'providerError', 'rateLimited'].includes(e.reason) ? e.reason : 'requestFailed',
      checkedAt: day(e.checkedAt), runId: probe.run?.runId || null });
  }
  return records;
}

/** Extra latest diagnostics retain request failure as untested, never missing.
 * An allowlist is returned; raw bars only enter the existing validator locally. */
export function extractUSLatestDiagnostics(probes, symbol, mic, target, today) {
  const results = [];
  for (const probe of probes) for (const e of probe.endpoints || []) {
    const endpoint = e.endpoint?.replace(/^\//, ''), tickerPath = /^tickers\/([^/]+)\/eod\/latest$/.exec(endpoint || '');
    const label = String(e.label || '');
    const relevant = label.startsWith('us-gap-latest-diagnostic') || ['us-current-common-gap-latest',
      'us-common-venue-counterexample-latest', 'us-common-venue-counterexample-ticker-latest',
      'us-common-venue-counterexample', 'us-common-venue-directory-counterexample', 'us-current-common-gap-coverage'].includes(label);
    const symbolRequested = tickerPath ? tickerPath[1] === symbol : String(e.params?.symbols || '').split(',').includes(symbol);
    const venueRequested = e.params?.exchange ? e.params.exchange === mic : Boolean(tickerPath);
    if (!relevant || endpoint !== 'eod/latest' && !tickerPath || !venueRequested || !symbolRequested) continue;
    const raw = Array.isArray(e.data) ? e.data : Array.isArray(e.data?.data) ? e.data.data :
      e.data?.data?.symbol ? [e.data.data] : e.data?.symbol ? [e.data] : [];
    const pagination = e.data?.pagination || e.pagination;
    const entries = raw.filter(r => r?.symbol === symbol);
    let outcome;
    if (e.ok !== true) outcome = { status: e.providerErrorType === 'the_requested_data_is_not_available' ?
      'PROVIDER_ENDPOINT_DATA_UNAVAILABLE' : e.providerErrorType === 'no_valid_symbols_provided' ?
      'NO_VALID_SYMBOLS_FOR_REQUESTED_VENUE' : 'REQUEST_FAILED', validLatest: false };
    else if (pagination && pagination.total > raw.length) outcome = { status: 'BATCH_INCOMPLETE', validLatest: false };
    else if (entries.length > 1) outcome = { status: 'DUPLICATE_LATEST', validLatest: false };
    else outcome = evaluateLatestObservation({ ...target, providerSymbol: symbol, mic, expectedCurrency: 'USD' }, entries[0], today);
    results.push({ providerSymbol: symbol, mic, endpoint, requestedMic: e.params?.exchange || null,
      reportedMic: typeof outcome.observation?.mic === 'string' ? outcome.observation.mic : null,
      status: outcome.status, validLatest: outcome.validLatest,
      reportedCurrency: typeof outcome.observation?.reportedCurrency === 'string' ? outcome.observation.reportedCurrency : null,
      reportedTradingDate: day(outcome.observation?.marketTimestamp), ageDays: outcome.ageDays ?? null,
      dataFrequency: 'EOD', delayState: 'EOD_ONLY', adjustmentBasis: 'UNVERIFIED',
      checkedAt: day(e.checkedAt), runId: probe.run?.runId || null, historyValidated: false });
  }
  return results;
}

/** Verified security identifier resolves security identity, but a different MIC
 * remains a different listing. CIK may only confirm an exact symbol+MIC where
 * class evidence does not conflict; CIK sibling symbols cannot be accepted. */
export function assessUSIdentity(baseline, candidate) {
  const atExpectedVenue = baseline.expectedMics.includes(candidate.mic);
  const classConflict = baseline.shareClass && candidate.shareClass && upper(baseline.shareClass) !== upper(candidate.shareClass);
  if (classConflict) return { status: 'REJECTED_SHARE_CLASS_CONFLICT', accepted: false, basis: null };
  if (candidate.assetType === 'ETF' && baseline.instrumentType !== 'ETF' ||
    baseline.instrumentType === 'ETF' && ['STOCK', 'EQUITY'].includes(candidate.assetType))
    return { status: 'REJECTED_ASSET_TYPE_CONFLICT', accepted: false, basis: null };
  if (cik(baseline.cik) && cik(candidate.cik) && cik(baseline.cik) !== cik(candidate.cik))
    return { status: 'REJECTED_ISSUER_IDENTIFIER_CONFLICT', accepted: false, basis: 'CIK' };
  for (const kind of ['isin', 'cusip', 'figi']) {
    const expected = identifier(kind, baseline[kind]), actual = identifier(kind, candidate[kind]);
    if (expected && actual && expected !== actual) return { status: 'REJECTED_SECURITY_IDENTIFIER_CONFLICT', accepted: false, basis: kind.toUpperCase() };
  }
  const matchedId = ['isin', 'cusip', 'figi'].find(kind => identifier(kind, baseline[kind]) && identifier(kind, baseline[kind]) === identifier(kind, candidate[kind]));
  if (matchedId) return { status: atExpectedVenue ? 'RESOLVED_SECURITY_AND_VENUE_METADATA' : 'IDENTIFIED_ALTERNATE_VENUE_NOT_BASELINE_LISTING',
    accepted: atExpectedVenue, basis: matchedId.toUpperCase() };
  if (candidate.symbol === baseline.providerSymbol && atExpectedVenue && cik(baseline.cik) && cik(baseline.cik) === cik(candidate.cik))
    return { status: 'RESOLVED_EXACT_SYMBOL_MIC_AND_ISSUER_METADATA', accepted: true, basis: 'EXACT_SYMBOL_MIC_CIK' };
  return { status: candidate.cik && cik(baseline.cik) === cik(candidate.cik) ? 'ISSUER_ONLY_NOT_SECURITY_EQUIVALENCE' : 'UNVERIFIED_LISTING_CANDIDATE',
    accepted: false, basis: null };
}

function anomalies(observation) {
  if (!observation) return [];
  const o = observation, nums = ['open', 'high', 'low', 'close'].map(k => o[k]); const reasons = [];
  if (nums.some(x => !Number.isFinite(x))) reasons.push('MISSING_OR_NONFINITE_OHLC');
  if (nums.some(x => Number.isFinite(x) && x <= 0)) reasons.push('NONPOSITIVE_PRICE');
  if (Number.isFinite(o.high) && Number.isFinite(o.low) && o.high < o.low) reasons.push('HIGH_BELOW_LOW');
  if (Number.isFinite(o.high) && [o.open, o.close].some(x => Number.isFinite(x) && x > o.high)) reasons.push('OPEN_OR_CLOSE_ABOVE_HIGH');
  if (Number.isFinite(o.low) && [o.open, o.close].some(x => Number.isFinite(x) && x < o.low)) reasons.push('OPEN_OR_CLOSE_BELOW_LOW');
  if (Number.isFinite(o.volume) && o.volume < 0) reasons.push('NEGATIVE_VOLUME');
  return reasons;
}

function publicSECContext(evidence) {
  if (!evidence) return null;
  const record = r => r ? { cik: cik(r.cik), name: typeof r.name === 'string' ? r.name : null,
    exchange: typeof r.exchange === 'string' ? r.exchange : null } : null;
  return { currentSECStatus: evidence.currentSECStatus || null, currentSECIssuerConflict: evidence.currentSECIssuerConflict === true,
    previousSEC: record(evidence.previousSEC), currentSEC: record(evidence.currentSEC),
    currentIssuerSymbols: (evidence.currentIssuerSymbols || []).map(r => ({ ticker: r.ticker, exchange: r.exchange || null,
      relationship: 'ISSUER_ONLY_NOT_APPROVED_SECURITY_ALIAS' })),
    officialSecurityClassDelistingFiled: evidence.officialSecurityClassDelistingFiled === true,
    officialBaselineListingRemovalFiled: evidence.officialBaselineListingRemovalFiled === true,
    officialForm25: (evidence.officialForm25 || []).map(f => ({ form: f.form, filingDate: day(f.filingDate),
      accessionNumber: f.accessionNumber, source: f.source, sha256: f.sha256, issuerCik: cik(f.issuerCik),
      exchangeName: f.exchangeName, securityClassDescription: f.securityClassDescription, describedClass: f.describedClass,
      exchangeMic: f.exchangeMic || null, baselineVenueMatches: f.baselineVenueMatches === true,
      classAttribution: f.classAttribution, classMatchesBaseline: f.classMatchesBaseline === true })),
    aliasesAccepted: false, providerUnavailableProven: false };
}
function publicListingContext(evidence) {
  if (!evidence) return null;
  const c = evidence.currentListing;
  return { publicDirectoryStatus: evidence.publicDirectoryStatus,
    currentListing: c ? { symbol: c.symbol, mic: c.mic, securityName: c.securityName, role: c.role,
      etfFlag: c.etfFlag, testIssue: c.testIssue, source: c.source, cqsSymbol: c.cqsSymbol, nasdaqSymbol: c.nasdaqSymbol } : null,
    baselineVenueMatches: evidence.baselineVenueMatches, preferredClassTokenVerified: evidence.preferredClassTokenVerified === true,
    preferredToken: evidence.preferredToken || null, providerAlias: evidence.providerAlias || null,
    genuineCommonEquityRoleObserved: evidence.genuineCommonEquityRoleObserved === true,
    currentProviderUnavailableProven: false };
}

export function classifyUSGaps(input, options = {}) {
  const { benchmark, names = [], instruments = [], secMap = {}, providerMetadata = [], latest = null, histories = {}, secEvidence = null,
    listingEvidence = null, resolvedHistory = null, supplementaryProbes = [], metadataOutcomes = [] } = input;
  if (!Array.isArray(benchmark?.rows) || !benchmark.rows.length || new Set(benchmark.rows.map(r => r.securityId)).size !== benchmark.rows.length)
    throw new Error('Unique nonempty protected US benchmark required');
  const named = new Map(names.map(r => [r.securityId, r]));
  const inst = new Map(); for (const r of instruments) for (const id of [r.masterMemberId, ...(r.legacyIds || [])].filter(Boolean)) {
    const a = inst.get(id) || []; if (!a.some(old => old.instrumentId === r.instrumentId)) a.push(r); inst.set(id, a);
  }
  const sec = secMap.byTicker || secMap; const byCik = new Map();
  for (const [symbol, r] of Object.entries(sec)) { const id = cik(r.cik); if (!id) continue; const a = byCik.get(id) || []; a.push({ symbol, ...r }); byCik.set(id, a); }
  const metadata = new Map(); for (const row of providerMetadata) { const a = metadata.get(row.symbol) || []; a.push(row); metadata.set(row.symbol, a); }
  const privateRows = new Map((latest?.rows || []).map(r => [r.securityId, r]));
  if (latest && (latest.baselineSource?.sha256 !== benchmark.baselineSource?.sha256 || latest.baselineTotal !== benchmark.rows.length))
    throw new Error('Private latest artifact does not match protected baseline');
  if (secEvidence && (secEvidence.protectedBaselineSource?.sha256 !== benchmark.baselineSource?.sha256 ||
    !Array.isArray(secEvidence.rows) || new Set(secEvidence.rows.map(r => r.securityId)).size !== secEvidence.rows.length))
    throw new Error('Official SEC evidence does not match protected baseline');
  const official = new Map((secEvidence?.rows || []).map(r => [r.securityId, r]));
  if (listingEvidence && listingEvidence.protectedBaselineSource?.sha256 !== benchmark.baselineSource?.sha256)
    throw new Error('Independent listing evidence does not match protected baseline');
  const independentlyListed = new Map((listingEvidence?.rows || []).map(r => [r.securityId, r]));
  if (resolvedHistory && (resolvedHistory.protectedBaselineSource?.sha256 !== benchmark.baselineSource?.sha256 ||
    resolvedHistory.asOfDate !== benchmark.asOfDate || !Array.isArray(resolvedHistory.rows) ||
    new Set(resolvedHistory.rows.map(r => r.securityId)).size !== resolvedHistory.rows.length))
    throw new Error('Resolved history evidence does not match protected baseline/date');
  const historyChecks = new Map((resolvedHistory?.rows || []).map(r => [r.securityId, r]));
  const detail = row => {
    const n = named.get(row.securityId) || {}, canonicalCandidates = inst.get(row.securityId) || [];
    const canonicalVenueMatches = canonicalCandidates.filter(c => row.expectedMics.includes(c.mic));
    const i = canonicalVenueMatches.length === 1 ? canonicalVenueMatches[0] : canonicalCandidates.length === 1 ? canonicalCandidates[0] : {};
    const canonicalIdentityAmbiguous = canonicalCandidates.length > 1 && canonicalVenueMatches.length !== 1;
    const s = sec[row.ticker] || null;
    const secCik = cik(s?.cik), nameCik = cik(n.cik), canonicalCik = cik(i.cik);
    const ciks = [...new Set([secCik, nameCik, canonicalCik].filter(Boolean))];
    const baseline = { ...row, cik: ciks.length === 1 ? ciks[0] : null, isin: i.isin, cusip: i.cusip, figi: i.figi, shareClass: i.shareClass };
    const aliases = usSymbolAliases(row.providerSymbol, row.instrumentType);
    const independent = independentlyListed.get(row.securityId) || null;
    const symbolCandidates = [row.providerSymbol, ...aliases.map(a => a.symbol)];
    const observed = symbolCandidates.flatMap(symbol => metadata.get(symbol) || []);
    const namedSources = [{ name: n.companyName, source: n.nameSource || 'CACHED_COMPANY_NAMES' },
      ...(s ? [{ name: s.name, source: 'CACHED_OFFICIAL_SEC_SYMBOL_MAP' }] : [])];
    const classification = classifyInstrument(row.instrumentType, namedSources,
      [...observed.filter(m => m.symbol === row.providerSymbol).map(m => ({ value: m.assetType, source: m.source })),
        ...(independent?.currentListing && independent.currentListing.role !== 'UNKNOWN' ? [{ value: independent.currentListing.role, source: 'OFFICIAL_NASDAQTRADER_LISTING_CLASS' }] : [])]);
    const selected = dedupe(observed.map(m => {
      let assessment = assessUSIdentity(baseline, m);
      const uncontradicted = ['UNVERIFIED_LISTING_CANDIDATE', 'ISSUER_ONLY_NOT_SECURITY_EQUIVALENCE'].includes(assessment.status);
      const aliasSEC = sec[m.symbol], exactIndependentVenue = independent?.currentListing?.mic === m.mic;
      const securityIdentifiedWithProviderVenueConflict = ['EQUITY_COMMON', 'REIT'].includes(row.instrumentType) &&
        !classification.status.includes('CONFLICT') && m.symbol === row.providerSymbol && independent?.currentListing?.role === 'EQUITY_COMMON' &&
        independent.currentListing.mic !== m.mic && baseline.cik && baseline.cik === cik(s?.cik) && m.cik === baseline.cik &&
        identifier('isin', m.isin) && !String(assessment.status).startsWith('REJECTED_') && !baseline.cikConflict;
      if (uncontradicted && independent?.preferredClassTokenVerified && m.symbol === independent.providerAlias && exactIndependentVenue &&
        row.expectedMics.includes(m.mic) && cik(aliasSEC?.cik) && cik(aliasSEC.cik) === m.cik && (ciks.length === 0 || baseline.cik === m.cik) &&
        identifier('isin', m.isin)) assessment = { status: 'RESOLVED_PREFERRED_SYMBOL_CLASS_MIC_SEC_ISSUER', accepted: true,
          basis: 'OFFICIAL_PREFERRED_CLASS_TOKEN_MIC_SEC_SYMBOL_CIK' };
      else if (uncontradicted && m.symbol === row.providerSymbol && exactIndependentVenue && baseline.cik && m.cik === baseline.cik &&
        independent.currentListing.role !== 'UNKNOWN' && !classification.status.includes('CONFLICTING') && identifier('isin', m.isin))
        assessment = { status: 'RESOLVED_INDEPENDENT_CURRENT_LISTING_BASELINE_MIC_DISPUTED', accepted: true,
          basis: 'EXACT_SYMBOL_INDEPENDENT_MIC_ISSUER_CIK_AND_PROVIDER_ISIN' };
      return { symbol: m.symbol, mic: m.mic, name: m.name, cik: m.cik, isin: m.isin, cusip: m.cusip, figi: m.figi,
        assetType: m.assetType, shareClass: m.shareClass, currency: m.currency, source: m.source,
        securityIdentifiedWithProviderVenueConflict: Boolean(securityIdentifiedWithProviderVenueConflict),
        securityIdentityEvidenceScope: securityIdentifiedWithProviderVenueConflict ?
          'EXACT_SYMBOL_CURRENT_SEC_ISSUER_OFFICIAL_COMMON_CLASS_PROVIDER_ISIN_ASSERTION_MIC_UNRESOLVED' : null,
        identityStatus: assessment.status, identityAccepted: assessment.accepted, identityBasis: assessment.basis,
        baselineListingEquivalent: row.expectedMics.includes(m.mic), independentVenueCorroborated: exactIndependentVenue,
        secVenueCorroborated: m.symbol === row.providerSymbol && SEC_MICS[upper(s?.exchange)] === m.mic,
        venueCaution: SEC_MICS[upper(s?.exchange)] === 'XNYS' ? 'SEC_NYSE_LABEL_MAY_REPRESENT_EXCHANGE_FAMILY' : null };
    }));
    for (const raw of [...(row.otherVenueCandidates || []), ...(row.symbolVariantCandidates || [])]) if (!selected.some(m => m.symbol === raw.symbol && m.mic === raw.mic))
      selected.push({ symbol: raw.symbol, mic: raw.mic, name: null, cik: null, isin: null, cusip: null, figi: null,
        assetType: null, currency: null, identityStatus: 'UNVERIFIED_LISTING_CANDIDATE', identityAccepted: false,
        identityBasis: null, secVenueCorroborated: raw.symbol === row.providerSymbol && SEC_MICS[upper(s?.exchange)] === raw.mic,
        source: { kind: 'EXISTING_DIRECTORY_BENCHMARK' } });
    const verified = selected.filter(m => m.identityAccepted);
    const accepted = verified.length === 1 && ciks.length <= 1 && !canonicalIdentityAmbiguous ? verified[0] : null;
    const identifiedSecurityVenueConflict = selected.some(c => c.securityIdentifiedWithProviderVenueConflict);
    for (const c of selected) c.latestDiagnostics = extractUSLatestDiagnostics(supplementaryProbes, c.symbol, c.mic,
      { securityId: row.securityId, ticker: row.ticker, instrumentType: classification.investigativeType, activeStatus: row.activeStatus,
        productMember: row.productMember, consumer: row.consumer }, benchmark.asOfDate);
    const independentLatestDiagnostics = independent?.currentListing ? extractUSLatestDiagnostics(supplementaryProbes,
      row.providerSymbol, independent.currentListing.mic,
      { securityId: row.securityId, ticker: row.ticker, instrumentType: classification.investigativeType, activeStatus: row.activeStatus,
        productMember: row.productMember, consumer: row.consumer }, benchmark.asOfDate) : [];
    const resolvedHistoryRaw = accepted ? historyChecks.get(row.securityId) : null;
    if (resolvedHistoryRaw && (resolvedHistoryRaw.providerSymbol !== accepted.symbol || resolvedHistoryRaw.mic !== accepted.mic))
      throw new Error('Resolved history evidence listing disagreement');
    const resolvedHistoryDiagnostics = resolvedHistoryRaw ? { status: resolvedHistoryRaw.history.status,
      requestedFrom: resolvedHistoryRaw.history.requestedFrom, requestedTo: resolvedHistoryRaw.history.requestedTo,
      acceptedDates: resolvedHistoryRaw.history.acceptedDates, rejectedRows: resolvedHistoryRaw.history.rejectedRows,
      sourceRunId: resolvedHistoryRaw.history.sourceRunId, fullHistoryDepthProven: false, tiingoEquivalentProven: false } : null;
    const unresolvedVenue = !row.expectedMics.length;
    const history = histories[row.securityId] || null;
    const historyStale = history?.lastDate && day(benchmark.asOfDate) && (Date.parse(benchmark.asOfDate) - Date.parse(history.lastDate)) / 86400000 > 7;
    const providerDirectoryLookupDiagnostics = supplementaryProbes.flatMap(probe => (probe.endpoints || []).filter(e =>
      e.label === 'us-common-venue-directory-counterexample' && e.endpoint?.replace(/^\//, '') === 'tickerslist' && e.params?.search === row.providerSymbol).map(e => {
      const items = Array.isArray(e.data?.data) ? e.data.data : [];
      const p = e.data?.pagination;
      return { endpoint: 'tickerslist', requestedMic: e.params?.exchange || null, search: row.providerSymbol, successful: e.ok === true,
        runId: probe.run?.runId || null, returnedRecords: items.length,
        completeResponse: Boolean(e.ok && p && p.offset === 0 && p.count === items.length && p.total === p.count),
        exactSymbolMatches: items.filter(r => (r.symbol || r.ticker) === row.providerSymbol).length,
        observedSymbols: items.map(r => ({ symbol: upper(r.symbol || r.ticker), mic: upper(r.stock_exchange?.mic || r.exchange) })).filter(r => r.symbol && r.mic),
        noGlobalAvailabilityConclusion: true };
    }));
    const officialEvidence = official.get(row.securityId) || null;
    if (officialEvidence && (officialEvidence.ticker !== row.ticker || officialEvidence.baselineInstrumentType !== row.instrumentType))
      throw new Error('Official SEC evidence security identity disagreement');
    const classDelistingFiled = officialEvidence?.officialSecurityClassDelistingFiled === true;
    const baselineListingRemovalFiled = officialEvidence?.officialBaselineListingRemovalFiled === true;
    const finalGapStatus = baselineListingRemovalFiled ? 'OFFICIAL_BASELINE_LISTING_REMOVAL_FILING_HISTORY_RETAINED' :
      accepted ? accepted.baselineListingEquivalent ? accepted.latestDiagnostics.at(-1)?.validLatest ? resolvedHistoryDiagnostics?.status === 'QUALITY_REJECTED_ROWS_PRESENT' ?
        'RESOLVED_IDENTITY_LATEST_VALIDATED_HISTORY_QUALITY_REJECTED' : 'RESOLVED_IDENTITY_LATEST_VALIDATED_HISTORY_PENDING' :
        accepted.latestDiagnostics.length ? 'RESOLVED_IDENTITY_LATEST_QUALITY_REJECTED' : 'RESOLVED_IDENTITY_PRICE_VALIDATION_PENDING' :
        'CURRENT_PROVIDER_LISTING_IDENTIFIED_BASELINE_VENUE_DISPUTED_NO_REPLACEMENT' : verified.length > 1 ? 'AMBIGUOUS_VERIFIED_CANDIDATES' :
      unresolvedVenue ? 'UNRESOLVED_BASELINE_VENUE_NOT_QUERIED' : row.activeStatus === 'INACTIVE' ? 'RETAINED_INACTIVE_NOT_PROVEN_DELISTED' :
      classification.status.includes('CONFLICT') ? 'INSTRUMENT_CLASSIFICATION_REVIEW' :
      selected.length ? 'ALTERNATE_LISTING_OR_SYMBOL_REQUIRES_IDENTITY_PROOF' : 'NO_CANDIDATE_IN_QUERIED_DIRECTORIES_NOT_PROVEN_UNAVAILABLE';
    return { securityId: row.securityId, ticker: row.ticker, providerSymbol: row.providerSymbol, exchange: row.exchange,
      expectedMics: row.expectedMics, productMember: row.productMember, consumer: row.consumer,
      companyName: n.companyName || i.companyName || null, baselineInstrumentType: row.instrumentType,
      instrumentClassification: classification,
      activeStatus: { baseline: row.activeStatus, baselineAsOf: options.activeStatusAsOf || null, explicitDelistedAt: day(i.delistedAt),
        historicalSeriesAlsoOld: historyStale === true, officialSecurityClassDelistingFiled: classDelistingFiled,
        officialBaselineListingRemovalFiled: baselineListingRemovalFiled,
        conclusion: baselineListingRemovalFiled ? 'OFFICIAL_BASELINE_LISTING_REMOVAL_FILED_BASELINE_STATUS_PRESERVED' : i.delistedAt ? 'CANONICAL_DELISTED_DATE_AVAILABLE' :
          row.activeStatus === 'INACTIVE' ? 'INACTIVE_NOT_PROVEN_DELISTED' : 'BASELINE_ACTIVE_STATUS_NOT_CURRENT_ENTITLEMENT_PROOF' },
      identifiers: { cik: baseline.cik, isin: identifier('isin', i.isin), cusip: identifier('cusip', i.cusip), figi: identifier('figi', i.figi), shareClass: i.shareClass || null,
        cikConflict: ciks.length > 1, companyNameConflict: Boolean(n.nameConflict), canonicalIdentityAmbiguous,
        canonicalCandidates: canonicalCandidates.map(c => ({ instrumentId: c.instrumentId, symbol: c.symbol, mic: c.mic || null, cik: cik(c.cik) })),
        canonicalSelection: canonicalVenueMatches.length === 1 ? 'UNIQUE_EXPECTED_MIC' : canonicalCandidates.length === 1 ? 'UNIQUE_LEGACY_ID' : 'NO_UNIQUE_CANONICAL_IDENTITY' },
      currentIssuerDisplayNameDisagreement: Boolean((n.companyName || i.companyName) && s?.name &&
        upper(n.companyName || i.companyName).replace(/[^A-Z0-9]/g, '') !== upper(s.name).replace(/[^A-Z0-9]/g, '')),
      currentIssuerNameComparisonScope: 'DISPLAY_NAME_REVIEW_ONLY_NOT_SECURITY_IDENTITY_OR_TICKER_CONTINUITY_PROOF',
      secSymbolEvidence: s ? { ticker: row.ticker, cik: secCik, name: s.name || null, exchange: s.exchange || null,
        source: s.source || 'company_tickers_exchange', asOf: secMap.generatedAt || null } : null,
      issuerSiblingSymbols: (byCik.get(baseline.cik) || []).filter(r => r.symbol !== row.ticker).map(r => ({ symbol: r.symbol,
        exchange: r.exchange || null, relationship: 'SHARED_ISSUER_ONLY_NO_SECURITY_EQUIVALENCE' })),
      symbolAliases: aliases, directoryStatus: row.directoryStatus, candidates: selected, acceptedIdentity: accepted,
      securityIdentifiedWithProviderVenueConflict: identifiedSecurityVenueConflict,
      independentListingLatestDiagnostics: independentLatestDiagnostics, providerDirectoryLookupDiagnostics, resolvedHistoryDiagnostics,
      identityResolution: accepted ? accepted.baselineListingEquivalent ? 'VERIFIED_IDENTIFIER_METADATA' :
        'VERIFIED_CURRENT_LISTING_METADATA_BASELINE_MIC_DISPUTED' : ciks.length > 1 ? 'CONFLICTING_CIK_EVIDENCE' :
        selected.some(c => c.secVenueCorroborated) ? 'SEC_VENUE_CORROBORATED_CANDIDATE_NOT_VERIFIED' :
        selected.length ? 'UNVERIFIED_CANDIDATE' : 'UNRESOLVED', finalGapStatus,
      confirmedGenuinelyMissing: false, localTiingoHistory: history,
      officialSECContext: publicSECContext(officialEvidence),
      independentCurrentListing: publicListingContext(independent),
      providerMetadataOutcomes: metadataOutcomes.filter(m => m.targetSecurityIds.includes(row.securityId)).map(m => ({ symbol: m.symbol,
        status: m.status, successful: m.successful, reason: m.reason, runId: m.runId, checkedAt: m.checkedAt })),
      nextEvidenceRequired: accepted ? 'QUALIFIED_PRICE_AND_HISTORY_VALIDATION' : unresolvedVenue ? 'EXACT_VENUE_DISCOVERY' :
        'PROVIDER_SECURITY_IDENTIFIER_OR_EXACT_SYMBOL_MIC_ISSUER_PROOF_AND_QUALIFIED_PRICES' };
  };
  const unmatched = benchmark.rows.filter(r => r.directoryStatus !== 'DIRECTORY_MATCHED').map(detail);
  const flags = benchmark.rows.filter(r => r.latestObservation && !r.latestObservation.validLatest).map(row => {
    const d = detail(row), outcome = row.latestObservation, p = privateRows.get(row.securityId);
    if (p && (p.status !== outcome.status || p.providerSymbol !== row.providerSymbol || !row.expectedMics.includes(p.mic)))
      throw new Error('Private/public latest identity or flag disagreement');
    const typeConflict = d.instrumentClassification.status.includes('CONFLICT');
    const referenceDay = d.localTiingoHistory?.lastDate;
    const newerReference = referenceDay && outcome.reportedTradingDate && referenceDay > outcome.reportedTradingDate;
    const observedAssetType = upper(p?.observation?.assetType);
    const freshDiagnostics = row.expectedMics.flatMap(mic => extractUSLatestDiagnostics(supplementaryProbes, row.providerSymbol, mic,
      { securityId: row.securityId, ticker: row.ticker, instrumentType: row.instrumentType, activeStatus: row.activeStatus,
        productMember: row.productMember, consumer: row.consumer }, benchmark.asOfDate));
    const priceRowTypeConflict = observedAssetType === 'ETF' && row.instrumentType !== 'ETF' ||
      observedAssetType === 'INDEX' && row.instrumentType !== 'INDEX' ||
      ['STOCK', 'EQUITY'].includes(observedAssetType) && row.instrumentType === 'ETF';
    const hypothesis = outcome.status === 'CURRENCY_MISMATCH' ? 'FOREIGN_CURRENCY_PRICE_ROW_OR_SYMBOL_COLLISION_REQUIRES_PROVIDER_INVESTIGATION' :
      outcome.status === 'MISSING_PROVIDER_CURRENCY' ? 'PRICE_ROW_CURRENCY_UNDECLARED_DO_NOT_INFER_USD' :
      outcome.status === 'ASSET_TYPE_MISMATCH' ? 'PROVIDER_AND_BASELINE_ASSET_TYPE_DISAGREEMENT' :
      outcome.status === 'INVALID_OHLC' ? 'IMPOSSIBLE_OR_INVALID_PRICE_CANDLE' :
      outcome.status === 'STALE_LATEST_ACTIVE' ? d.activeStatus.officialBaselineListingRemovalFiled ?
        'FINAL_HISTORICAL_PRICE_EXPECTED_OFFICIAL_SECURITY_CLASS_DELISTING_FILED' :
        d.activeStatus.historicalSeriesAlsoOld ? 'BOTH_PROVIDER_HISTORIES_OLD_CURRENT_LISTING_STATUS_UNVERIFIED' :
        newerReference ? 'PROVIDER_LATEST_OLD_WHILE_LOCAL_REFERENCE_MORE_RECENT' :
          'PROVIDER_LATEST_OLD_LOCAL_REFERENCE_RECENCY_UNPROVEN' : 'UNRESOLVED_QUALITY_GATE_REJECTION';
    return { ...d, latestQuality: { originalStatus: outcome.status, expectedCurrency: outcome.expectedCurrency,
      reportedCurrency: outcome.reportedCurrency, reportedTradingDate: outcome.reportedTradingDate, ageDays: outcome.ageDays,
      dataFrequency: 'EOD', delayState: 'EOD_ONLY', structuralReasonCodes: anomalies(p?.observation),
      reportedAssetType: observedAssetType, priceRowAssetTypeConflict: priceRowTypeConflict,
      priceRowTypeSupportedByIndependentMetadata: observedAssetType && d.instrumentClassification.evidenceType ?
        observedAssetType === d.instrumentClassification.evidenceType : null,
      priceRowTypeCaution: 'A_REJECTED_PRICE_ROW_TYPE_DOES_NOT_RECLASSIFY_THE_BASELINE_SECURITY', hypothesis,
      baselineTypeConflict: typeConflict, resolutionStatus: 'OPEN_REJECTED_NO_CANONICAL_WRITE',
      independentlyCorrected: false, supplementaryRechecks: freshDiagnostics,
      supplementaryLastStatus: freshDiagnostics.at(-1)?.status || 'NOT_RECHECKED',
      supplementaryLatestPass: freshDiagnostics.at(-1)?.validLatest === true,
      lastCandleEquivalentToTiingo: 'NOT_ESTABLISHED' } };
  });
  const stamp = { schemaVersion: 1, generatedAt: options.generatedAt || new Date().toISOString(),
    asOfDate: benchmark.asOfDate, protectedBaselineSource: benchmark.baselineSource,
    sources: options.sources || null, matchedDirectoryBaselineUnchanged: benchmark.totals?.TOTAL_MARKETSTACK_MATCHED || benchmark.rows.filter(r => r.directoryStatus === 'DIRECTORY_MATCHED').length,
    authenticatedRequestsMadeByThisGenerator: 0,
    limitations: ['Names classify explicit instrument terms but never establish identity.',
      'CIK is issuer-level; sibling securities, ADRs and ordinary shares cannot be merged using CIK.',
      'Cached SEC symbol/venue metadata can be stale and NYSE can describe an exchange family.',
      'Active baseline status, directory absence and old history do not prove delisting or global provider unavailability.',
      'Confirmed genuinely missing requires unavailable evidence beyond these bounded directory probes.',
      'Public output excludes raw prices/volumes; original latest flags remain rejected, with no production mutation.'] };
  const consumerCandidates = unmatched.filter(r => r.consumer && r.activeStatus.baseline === 'ACTIVE' &&
    ['EQUITY_COMMON', 'ADR', 'REIT'].includes(r.instrumentClassification.investigativeType));
  const currentCommon = unmatched.filter(r => r.independentCurrentListing?.genuineCommonEquityRoleObserved && r.consumer);
  const rawLatestBySymbol = new Map();
  for (const probe of supplementaryProbes) for (const e of probe.endpoints || []) {
    const path = e.endpoint?.replace(/^\//, ''), ticker = /^tickers\/([^/]+)\/eod\/latest$/.exec(path || '');
    if (!e.ok || path !== 'eod/latest' && !ticker) continue;
    const raw = Array.isArray(e.data) ? e.data : Array.isArray(e.data?.data) ? e.data.data : e.data?.symbol ? [e.data] : e.data?.data?.symbol ? [e.data.data] : [];
    const pagination = e.data?.pagination || e.pagination;
    if (pagination && (pagination.offset > 0 || pagination.total > raw.length)) continue;
    for (const bar of raw) {
      if (!bar?.symbol || (ticker ? ticker[1] !== bar.symbol : !String(e.params?.symbols || '').split(',').includes(bar.symbol))) continue;
      if (raw.filter(x => x?.symbol === bar.symbol).length !== 1) continue;
      const values = rawLatestBySymbol.get(bar.symbol) || []; values.push(bar); rawLatestBySymbol.set(bar.symbol, values);
    }
  }
  const anyVenueAvailability = r => {
    const exact = r.candidates.filter(c => c.symbol === r.providerSymbol);
    const observedBars = (rawLatestBySymbol.get(r.providerSymbol) || []).filter(b => typeof b.exchange === 'string' && /^[A-Z0-9]{4}$/.test(b.exchange));
    const observed = observedBars.length > 0;
    const validatedBars = observedBars.filter(b => evaluateLatestObservation({ securityId: r.securityId, ticker: r.ticker,
      providerSymbol: r.providerSymbol, mic: b.exchange, expectedCurrency: 'USD',
      instrumentType: r.instrumentClassification.investigativeType, activeStatus: r.activeStatus.baseline }, b, benchmark.asOfDate).validLatest);
    const identified = exact.filter(c => c.securityIdentifiedWithProviderVenueConflict);
    return { anyVenueSameSymbolPriceObservationReturned: observed, anyVenueSameSymbolLatestValidatedAtProviderMic: validatedBars.length > 0,
      identifiedSecurityPriceObservationReturnedAtProviderMic: identified.some(c => observedBars.some(b => b.exchange === c.mic)),
      identifiedSecurityLatestValidatedAtProviderMic: identified.some(c => validatedBars.some(b => b.exchange === c.mic)),
      anyVenueQuoteScope: 'PROVIDER_SYMBOL_OBSERVATION_IS_NOT_AUTOMATIC_CANONICAL_LISTING_EQUIVALENCE',
      requiredCurrentListingEndpointGap: r.independentListingLatestDiagnostics.length > 0 && r.independentListingLatestDiagnostics.at(-1)?.validLatest !== true };
  };
  const exactConsumer = benchmark.rows.filter(r => r.consumer && r.directoryStatus === 'DIRECTORY_MATCHED');
  const resolvedConsumer = unmatched.filter(r => r.consumer && r.acceptedIdentity);
  const exactLatestConsumer = exactConsumer.filter(r => r.latestObservation?.validLatest);
  const resolvedLatestConsumer = resolvedConsumer.filter(r => r.acceptedIdentity.latestDiagnostics.at(-1)?.validLatest);
  return {
    unmatched: { ...stamp, scope: 'ALL_NON_EXACT_US_BASELINE_RECORDS', totals: { classified: unmatched.length,
      byBaselineType: countBy(unmatched, r => r.baselineInstrumentType), byInvestigativeType: countBy(unmatched, r => r.instrumentClassification.investigativeType),
      byActiveStatus: countBy(unmatched, r => r.activeStatus.baseline), byIdentityResolution: countBy(unmatched, r => r.identityResolution),
      byFinalGapStatus: countBy(unmatched, r => r.finalGapStatus), confirmedGenuinelyMissing: 0,
      activeConsumerEquityCandidatesUnresolved: consumerCandidates.length,
      independentlyCurrentCommonConsumerGaps: currentCommon.length,
      independentlyCurrentCommonWithProviderMetadataUnavailable: currentCommon.filter(r => r.providerMetadataOutcomes.some(m => m.status === 'PROVIDER_METADATA_ENDPOINT_DATA_UNAVAILABLE')).length,
      independentlyCurrentCommonLatestValidated: currentCommon.filter(r => r.independentListingLatestDiagnostics.at(-1)?.validLatest).length,
      independentlyCurrentCommonLatestStatuses: countBy(currentCommon, r => r.independentListingLatestDiagnostics.at(-1)?.status || 'NOT_TESTED'),
      independentlyCurrentCommonRequiredListingEndpointGaps: currentCommon.filter(r => anyVenueAvailability(r).requiredCurrentListingEndpointGap).length,
      independentlyCurrentCommonAnySymbolQuoteObserved: currentCommon.filter(r => anyVenueAvailability(r).anyVenueSameSymbolPriceObservationReturned).length,
      independentlyCurrentCommonNoSymbolQuoteObservedInQueriedRoutes: currentCommon.filter(r => !anyVenueAvailability(r).anyVenueSameSymbolPriceObservationReturned).length,
      independentlyCurrentCommonAnySymbolLatestValidAtProviderMic: currentCommon.filter(r => anyVenueAvailability(r).anyVenueSameSymbolLatestValidatedAtProviderMic).length,
      independentlyCurrentCommonIdentifiedSecurityQuoteObservedAtProviderMic: currentCommon.filter(r => anyVenueAvailability(r).identifiedSecurityPriceObservationReturnedAtProviderMic).length,
      independentlyCurrentCommonIdentifiedSecurityLatestValidAtProviderMic: currentCommon.filter(r => anyVenueAvailability(r).identifiedSecurityLatestValidatedAtProviderMic).length },
      currentCommonEquityGaps: currentCommon.map(r => ({
        securityId: r.securityId, ticker: r.ticker, publicListingMic: r.independentCurrentListing.currentListing.mic,
        baselineMics: r.expectedMics, identityResolution: r.identityResolution,
        baselineCurrentVenueDisagreement: !r.expectedMics.includes(r.independentCurrentListing.currentListing.mic),
        baselineCurrentIssuerDisplayNameDisagreement: r.currentIssuerDisplayNameDisagreement,
        currentSecurityScope: 'CURRENT_OFFICIAL_SYMBOL_CLASS_NOT_PROVEN_HISTORICAL_PROTECTED_SECURITY_CONTINUITY',
        providerMetadataUnavailable: r.providerMetadataOutcomes.some(m => m.status === 'PROVIDER_METADATA_ENDPOINT_DATA_UNAVAILABLE'),
        securityIdentifiedWithProviderVenueConflict: r.securityIdentifiedWithProviderVenueConflict,
        independentListingLatestStatus: r.independentListingLatestDiagnostics.at(-1)?.status || 'NOT_TESTED',
        independentListingLatestPassed: r.independentListingLatestDiagnostics.at(-1)?.validLatest === true,
        ...anyVenueAvailability(r), confirmedGloballyUnavailable: false })),
      consumerRealEquityGapCandidates: consumerCandidates.map(r => ({ securityId: r.securityId, ticker: r.ticker,
        investigativeType: r.instrumentClassification.investigativeType, finalGapStatus: r.finalGapStatus })),
      confirmedConsumerRealEquitiesGenuinelyMissing: [], rows: unmatched },
    resolved: { ...stamp, scope: 'ALL_UNMATCHED_US_IDENTITY_RESOLUTION_RESULTS',
      baselineMembershipCoverage: { baselineConsumerDenominator: benchmark.rows.filter(r => r.consumer).length,
        exactDirectoryMatchedConsumer: exactConsumer.length, exactLatestValidatedConsumer: exactLatestConsumer.length,
        additionalIdentityResolvedConsumer: resolvedConsumer.length, additionalLatestValidatedResolvedConsumer: resolvedLatestConsumer.length,
        exactPlusIdentityResolvedConsumer: exactConsumer.length + resolvedConsumer.length,
        exactPlusLatestValidatedResolvedConsumer: exactLatestConsumer.length + resolvedLatestConsumer.length,
        denominatorDefinition: 'PROTECTED_BASELINE_CONSUMER_MEMBERSHIP_UNCHANGED_INCLUDING_DISCOVERED_ROLE_CONTRADICTIONS',
        investigatedCurrentCommonClassConsumerSubset: currentCommon.length,
        legalCommonUniverseDenominatorFullyMeasured: false, newProductionExclusions: 0 }, totals: { investigated: unmatched.length,
      verifiedIdentityResolved: unmatched.filter(r => r.acceptedIdentity).length,
      securityIdentifiedWithProviderVenueConflict: unmatched.filter(r => r.candidates.some(c => c.securityIdentifiedWithProviderVenueConflict)).length,
      verifiedIdentityWithPassingLatest: unmatched.filter(r => r.acceptedIdentity?.latestDiagnostics?.at(-1)?.validLatest).length,
      baselineMICDisputesAmongResolved: unmatched.filter(r => r.acceptedIdentity && !r.acceptedIdentity.baselineListingEquivalent).length,
      secVenueCorroboratedCandidates: unmatched.filter(r => r.candidates.some(c => c.secVenueCorroborated)).length,
      priceAndHistoryEquivalentProven: 0, baselineReplacementsMade: 0 },
      rows: unmatched.map(r => ({ securityId: r.securityId, ticker: r.ticker, expectedMics: r.expectedMics,
        identityResolution: r.identityResolution, finalGapStatus: r.finalGapStatus,
        identifiers: r.identifiers, baselineInstrumentType: r.baselineInstrumentType, candidates: r.candidates, acceptedIdentity: r.acceptedIdentity,
        securityIdentifiedWithProviderVenueConflict: r.securityIdentifiedWithProviderVenueConflict,
        independentListingLatestDiagnostics: r.independentListingLatestDiagnostics, providerDirectoryLookupDiagnostics: r.providerDirectoryLookupDiagnostics,
        priceValidation: r.acceptedIdentity?.latestDiagnostics?.at(-1)?.validLatest ? 'PASSING_LATEST_ONLY_HISTORY_UNVERIFIED' : 'NOT_PROVEN',
        historyValidation: r.resolvedHistoryDiagnostics?.status || 'NOT_PROVEN', resolvedHistoryDiagnostics: r.resolvedHistoryDiagnostics, consumer: r.consumer, productMember: r.productMember, activeStatus: r.activeStatus.baseline })) },
    quality: { ...stamp, scope: 'ALL_REJECTED_COMPLETE_US_LATEST_FLAGS', totals: { classified: flags.length,
      originalStatusCounts: countBy(flags, r => r.latestQuality.originalStatus),
      byInvestigativeType: countBy(flags, r => r.instrumentClassification.investigativeType),
      byHypothesis: countBy(flags, r => r.latestQuality.hypothesis),
      baselineTypeConflicts: flags.filter(r => r.latestQuality.baselineTypeConflict).length,
      priceRowAssetTypeConflicts: flags.filter(r => r.latestQuality.priceRowAssetTypeConflict).length,
      reportedPriceRowAssetTypes: countBy(flags, r => r.latestQuality.reportedAssetType),
      officialSecurityClassDelistingFiled: flags.filter(r => r.activeStatus.officialSecurityClassDelistingFiled).length,
      staleFlagsWithOfficialClassDelistingFiled: flags.filter(r => r.activeStatus.officialSecurityClassDelistingFiled && r.latestQuality.originalStatus === 'STALE_LATEST_ACTIVE').length,
      staleFlagsWithOfficialBaselineListingRemovalFiled: flags.filter(r => r.activeStatus.officialBaselineListingRemovalFiled && r.latestQuality.originalStatus === 'STALE_LATEST_ACTIVE').length,
      supplementaryRecheckStatuses: countBy(flags, r => r.latestQuality.supplementaryLastStatus),
      supplementaryLatestPassed: flags.filter(r => r.latestQuality.supplementaryLatestPass).length,
      independentlyCorrected: 0, canonicalWrites: 0 }, rows: flags }
  };
}

/** A read-only request plan for the authoritative server runner. Requests are
 * never performed here; aliases/sibling securities are not approved matches. */
export function buildUSGapRequestPlan(result) {
  const record = r => {
    const equity = ['EQUITY_COMMON', 'ADR', 'REIT'].includes(r.instrumentClassification.investigativeType);
    return { securityId: r.securityId, symbol: r.providerSymbol, expectedMics: r.expectedMics,
      baselineType: r.baselineInstrumentType, investigativeType: r.instrumentClassification.investigativeType,
      active: r.activeStatus.baseline, consumer: r.consumer, companyName: r.companyName,
      cik: r.identifiers.cik, secSymbolMetadata: r.secSymbolEvidence,
      issuerOtherSymbols: r.issuerSiblingSymbols, aliasCandidates: r.symbolAliases,
      otherVenueCandidates: r.candidates.map(c => ({ symbol: c.symbol, mic: c.mic, identityStatus: c.identityStatus,
        secVenueCorroborated: c.secVenueCorroborated, reportedCurrency: c.currency })),
      latestFlag: r.latestQuality?.originalStatus || null, finalGapStatus: r.finalGapStatus,
      priority: r.consumer && r.activeStatus.baseline === 'ACTIVE' && equity ? 1 : 3,
      metadataLookup: { endpoint: 'tickers/' + r.providerSymbol, reason: 'Exact security identifiers and venue needed; names and CIK siblings are insufficient' },
      priceLookup: { endpoint: 'eod/latest', symbols: [r.providerSymbol],
        candidateExchanges: [...new Set([...r.expectedMics, ...r.candidates.map(c => c.mic)])],
        identityReviewRequiredBeforeConsumerUse: true, maxPages: 1,
        reason: 'Targeted diagnostic only; no history backfill or alternate-symbol replacement implied' } };
  };
  const sort = (a, b) => a.priority - b.priority || Number(!a.otherVenueCandidates.length) - Number(!b.otherVenueCandidates.length) || a.symbol.localeCompare(b.symbol, 'en');
  const unmatchedLookupPlan = result.unmatched.rows.map(record).sort(sort), qualityFlagLookupPlan = result.quality.rows.map(record).sort(sort);
  return { schemaVersion: 2, generatedAt: result.unmatched.generatedAt,
    scope: 'ALL_UNMATCHED_US_AND_REJECTED_LATEST_TARGETED_REQUEST_PLAN',
    unmatchedRecords: unmatchedLookupPlan.length, qualityFlagRecords: qualityFlagLookupPlan.length,
    conservativeMetadataRequestUpperBoundBeforeRetriesAndAliases: unmatchedLookupPlan.length + qualityFlagLookupPlan.length,
    priorityCounts: countBy(unmatchedLookupPlan, r => String(r.priority)),
    constraints: ['Paid requests are executed only by the authoritative bounded server runner.',
      'No name-only, ticker-only global or CIK-sibling security joins.',
      'Metadata then qualified latest diagnostics; no bulk history download.',
      'Provider identity acceptance and passing price quality gates are independent.'],
    unmatchedLookupPlan, qualityFlagLookupPlan };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  const root = resolve(args.root || process.cwd()), sources = [];
  const load = (path, privateSource = false) => { const bytes = readFileSync(resolve(root, path));
    sources.push({ ...(privateSource ? { privateArtifact: true } : { path }), sha256: hash(bytes) }); return JSON.parse(bytes); };
  const benchmark = load(args.benchmark || 'reports/marketstack/marketstack_tiingo_us_diff.json');
  const names = load('quant/data/market/security-master/company-names.json').rows;
  const secMap = load(args['sec-map'] || 'quant/data/universe/cik-map.json');
  const instruments = readdirSync(resolve(root, 'quant/data/universe/instruments')).filter(p => p.endsWith('.json')).flatMap(p =>
    load('quant/data/universe/instruments/' + p).instruments || []);
  const paths = (args.probes || '').split(',').filter(Boolean).concat((args.supplements || '').split(',').filter(Boolean));
  const probes = paths.map(p => load(p, true)), providerMetadata = extractUSMetadata(probes), metadataOutcomes = extractUSMetadataOutcomes(probes);
  const latest = args.latest ? load(args.latest, true) : null;
  const secEvidence = args['sec-evidence'] ? load(args['sec-evidence']) : null;
  const listingEvidence = args['listing-evidence'] ? load(args['listing-evidence']) : null;
  const resolvedHistory = args['resolved-history'] ? load(args['resolved-history']) : null;
  const histories = {};
  for (const row of benchmark.rows.filter(r => r.directoryStatus !== 'DIRECTORY_MATCHED' || r.latestObservation && !r.latestObservation.validLatest)) {
    const path = resolve(root, 'quant/data/market/discover-series-long/' + row.securityId + '.json');
    if (!existsSync(path)) continue;
    const bytes = readFileSync(path), d = JSON.parse(bytes);
    if (d.securityId !== row.securityId || d.source !== 'tiingo' || !Array.isArray(d.points)) throw new Error('Invalid local reference identity');
    histories[row.securityId] = { source: 'tiingo', priceSeriesType: d.priceSeriesType || null,
      frequency: d.grain || null, firstDate: day(d.from), lastDate: day(d.to), pointCount: d.points.length, sha256: hash(bytes) };
  }
  const eligibility = load('quant/data/market/security-master/eligibility.json');
  const result = classifyUSGaps({ benchmark, names, instruments, secMap, providerMetadata, latest, histories, secEvidence, listingEvidence, resolvedHistory,
    supplementaryProbes: probes, metadataOutcomes }, {
    sources, activeStatusAsOf: day(eligibility.today || eligibility.generatedAt) });
  const out = resolve(args.out || root + '/reports/marketstack'); mkdirSync(out, { recursive: true });
  for (const [key, filename] of [['unmatched', 'us_marketstack_unmatched_classification.json'], ['resolved', 'us_marketstack_resolved_matches.json'], ['quality', 'us_marketstack_quality_flags.json']])
    writeFileSync(resolve(out, filename), JSON.stringify(result[key], null, 2) + '\n');
  if (args['request-plan']) writeFileSync(resolve(args['request-plan']), JSON.stringify(buildUSGapRequestPlan(result), null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.totals]))));
}
