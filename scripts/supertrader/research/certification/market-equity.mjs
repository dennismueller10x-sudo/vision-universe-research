/**
 * Isolated data certification. No strategy rules, network calls or logging.
 * Numerical certificates and security identities belong in private artifacts.
 */
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ReturnSeries = require('../../../../quant/engines/return-series.js');

export const MARKET_EQUITY_STATES = Object.freeze(['VERIFIED', 'DERIVED', 'APPROXIMATE_NOT_ELIGIBLE', 'MISSING']);
export const MARKET_EQUITY_CONTRACT = Object.freeze({
  version: 'market-equity-certification-1.1.0',
  shares: 'Official accession-bound, original-vintage actual instantaneous common shares; not weighted-average, diluted, public-float or current-latest shares.',
  observationBasis: 'Separate RAW_SHARE_OBSERVATION_BASIS proof must bind original authenticated filing body, exact fact/context/value/observation date, and inspected share disclosure or split note showing no post-observation split adjustment. AS_REPORTED, GAAP INSTANT and source identity never imply raw share basis.',
  timing: 'Explicit UTC formationCutoff required; date-only asOf has no implicit end-of-day fallback. MATCHED_VALUATION_DATE_ACTUAL_SHARES may become public after valuation: availableAt is the latest input-publication timestamp and must be <= formationCutoff. Never backdated. CURRENT_AS_KNOWN_LATEST_ACTUAL is a separate finite-age carry policy.',
  identityAvailability: 'Date-only historical identity proof needs explicit UTC_DAY_END_CONSERVATIVE_BOUND. Preserve its original date and label the upper-bound resolution; do not invent an actual publication time.',
  fiscalDate: 'Fact periodEnd is the requested valuationDate. A non-session fiscal date needs a certified last-session calendar mapping.',
  bridge: 'Only splits strictly after the shares observation date and through priceDate; never future splits. Missing factors are not one.',
  scope: 'Single common class and explicit historical issuer/listing identity only. Multi-class and ADR require separate unimplemented full-issuer/ratio contracts.',
  staleShares: 'CURRENT_AS_KNOWN_LATEST_ACTUAL needs explicit maxShareAgeDays and valuation within seven days of formation; it remains DERIVED, not exact issued shares on priceDate.',
  engine: 'Only eligible certificates emit normalized USD marketEquity facts. Derived does not automatically upgrade data quality to HIGH.',
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
function day(x) {
  if (typeof x !== 'string' || !DAY.test(x)) return null;
  const t = Date.parse(`${x}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === x ? x : null;
}
function utc(x) {
  if (typeof x !== 'string' || !UTC.test(x) || !day(x.slice(0, 10))) return NaN;
  return Date.parse(x);
}
function identityAvailability(identity) {
  if (Number.isFinite(utc(identity?.knownFrom))) return {time: utc(identity.knownFrom), basis: 'EXACT_UTC', original: identity.knownFrom};
  if (day(identity?.knownFrom) && identity.availabilityResolution === 'UTC_DAY_END_CONSERVATIVE_BOUND') return {time: Date.parse(`${identity.knownFrom}T23:59:59.999Z`), basis: 'UTC_DAY_END_CONSERVATIVE_BOUND', original: identity.knownFrom};
  return {time: NaN, basis: 'UNRESOLVED', original: identity?.knownFrom ?? null};
}
function source(x) { return !!x && typeof x === 'object' && !!(x.id || x.url || x.accession); }
function officialFiling(x) {
  return source(x) && ['SEC_FILING_XBRL', 'SEC_FILING_COVER'].includes(x.kind) &&
    /^\d{10}-\d{2}-\d{6}$/.test(x.accession ?? '') &&
    typeof x.url === 'string' && /^https:\/\/(?:www\.)?sec\.gov\/Archives\//i.test(x.url) &&
    Number.isFinite(utc(x.acceptedAt));
}
function result(state, reason, provenance = null, fact = null) {
  return {schema: MARKET_EQUITY_CONTRACT.version, state, eligible: fact !== null,
    confidence: fact ? 'MEDIUM' : 'UNAVAILABLE', dataQualityAutomaticallyHigh: false,
    reasons: reason ? [reason] : [], fact, provenance};
}
const approximate = reason => result('APPROXIMATE_NOT_ELIGIBLE', reason);


// Original financial statements may retroactively adjust comparative and even
// current-period shares for a later split. An INSTANT context fixes the economic
// observation date, but does not establish the units' historical split basis.
function rawShareBasisFailure(shares,identity,shareDate,asOf){
  const p=shares.observationBasis;
  if(!p||p.status!=='RAW_SHARE_OBSERVATION_BASIS'||p.basis!=='RAW_SHARES_ON_OBSERVATION_DATE')return 'RAW_SHARE_OBSERVATION_BASIS_UNCERTIFIED';
  if(p.splitAdjustmentTreatment!=='NO_POST_OBSERVATION_ADJUSTMENT'||p.rawBasisDate!==shareDate)return 'SHARES_POST_OBSERVATION_SPLIT_ADJUSTMENT_OR_UNKNOWN_BASIS';
  if(!['ORIGINAL_FILING_SHARE_DISCLOSURE','ORIGINAL_FILING_SPLIT_NOTE'].includes(p.evidenceKind))return 'ORIGINAL_SHARE_DISCLOSURE_OR_SPLIT_NOTE_REQUIRED';
  if(p.observationDate!==shareDate||p.value!==shares.value||p.unit!==shares.unit||p.concept!==shares.concept||p.contextId!==shares.source.contextId||
     p.issuerId!==identity.issuerId||p.listingId!==identity.listingId||p.securityId!==identity.securityId||String(p.cik).padStart(10,'0')!==String(identity.cik).padStart(10,'0'))return 'RAW_SHARE_BASIS_FACT_OR_IDENTITY_BINDING_MISMATCH';
  const known=utc(p.knownFrom);
  if(!Number.isFinite(known)||known>asOf||known!==utc(shares.source.acceptedAt))return 'RAW_SHARE_BASIS_NOT_KNOWN_AT_FORMATION';
  const a=shares.source,b=p.source;
  if(!officialFiling(b)||a.authenticationStatus!=='ORIGINAL_SEC_FILING_BODY_VERIFIED'||b.authenticationStatus!=='ORIGINAL_SEC_FILING_BODY_VERIFIED'||
     a.hashScope!=='FULL_RECEIVED_DOCUMENT'||b.hashScope!=='FULL_RECEIVED_DOCUMENT'||!(/^[a-f0-9]{64}$/.test(a.sha256??''))||
     b.sha256!==a.sha256||b.url!==a.url||b.accession!==a.accession||b.periodDate!==shareDate||b.contextId!==a.contextId||utc(b.acceptedAt)!==utc(a.acceptedAt)||
     typeof b.locator!=='string'||!b.locator.trim())return 'RAW_SHARE_BASIS_ORIGINAL_SOURCE_AUTHENTICATION_UNCERTIFIED';
  return null;
}

function identityFailure(identity, priceDate, shareDate, asOf, availability) {
  if (!identity || identity.status !== 'VERIFIED' || identity.historical !== true ||
      !source(identity.source) || !identity.issuerId || !identity.listingId || !identity.securityId ||
      !/^\d{1,10}$/.test(String(identity.cik ?? '')) || !(Number(identity.cik) > 0)) return 'HISTORICAL_ISSUER_LISTING_IDENTITY_UNCERTIFIED';
  if (!day(identity.validFrom) || (identity.validTo != null && !day(identity.validTo)) ||
      identity.validFrom > shareDate || identity.validFrom > priceDate ||
      (identity.validTo != null && (identity.validTo < priceDate || identity.validTo < shareDate))) return 'IDENTITY_OUTSIDE_HISTORICAL_LISTING_INTERVAL';
  if (!Number.isFinite(availability.time) || availability.time > asOf) return 'IDENTITY_NOT_KNOWN_AT_FORMATION_CUTOFF';
  if (identity.instrumentType === 'ADR') return 'ADR_REQUIRES_SEPARATE_UNDERLYING_RATIO_CERTIFICATION';
  if (identity.instrumentType !== 'COMMON_STOCK') return 'NOT_CERTIFIED_COMMON_STOCK';
  if (identity.issuerStructure !== 'SINGLE_CLASS') return 'MULTIPLE_OR_UNKNOWN_CLASSES_REQUIRE_FULL_ISSUER_AGGREGATION';
  return null;
}

/**
 * input: {asOf, valuationDate, identity, shares, price, splitHistory, policy?, calendar?}
 * All source values remain in this private return object; public summaries below
 * contain only certification enums and whole counts.
 */
export function certifyMarketEquity(input = {}) {
  const {identity, shares, price, splitHistory, policy = {}, calendar} = input;
  if (!shares || !price || !identity || !splitHistory) return result('MISSING', 'REQUIRED_SHARES_PRICE_IDENTITY_OR_SPLIT_HISTORY_MISSING');
  const formationCutoff = input.formationCutoff ?? input.asOf;
  const asOf = utc(formationCutoff), asOfDate = typeof formationCutoff === 'string' ? formationCutoff.slice(0, 10) : null;
  const valuationDate = day(input.valuationDate), priceDate = day(price.date), shareDate = day(shares.periodDate);
  const priceKnown = utc(price.knownFrom), sharesKnown = utc(shares.knownFrom);
  if (!Number.isFinite(asOf) || !valuationDate || !priceDate || !shareDate || !Number.isFinite(priceKnown) || !Number.isFinite(sharesKnown) || (input.formationCutoff && day(input.asOf) && input.asOf !== asOfDate)) return approximate('EXACT_DATES_AND_UTC_AVAILABILITY_REQUIRED');
  if (priceDate > valuationDate || valuationDate > asOfDate || price.knownFrom.slice(0, 10) !== priceDate || priceKnown > asOf || sharesKnown > asOf || sharesKnown < Date.parse(shareDate) || shareDate > priceDate) return approximate('SOURCE_NOT_KNOWN_AT_FORMATION_OR_VALUATION_DATES_INVALID');
  if (!['MATCHED_VALUATION_DATE_ACTUAL_SHARES', 'CURRENT_AS_KNOWN_LATEST_ACTUAL'].includes(policy.mode)) return approximate('EXPLICIT_VALUATION_AVAILABILITY_MODE_REQUIRED');
  if (policy.mode === 'MATCHED_VALUATION_DATE_ACTUAL_SHARES' && shareDate !== priceDate) return approximate('HISTORICAL_MATCHED_MODE_REQUIRES_ACTUAL_SHARES_ON_PRICE_DATE');
  if (policy.mode === 'CURRENT_AS_KNOWN_LATEST_ACTUAL' && (Date.parse(asOfDate) - Date.parse(valuationDate)) / 86400000 > 7) return approximate('CURRENT_CARRY_MODE_CANNOT_SUPPLY_OLD_FISCAL_MARKET_EQUITY');
  if (priceDate !== valuationDate && !(calendar?.status === 'VERIFIED' && calendar.valuationDate === valuationDate && calendar.lastSession === priceDate && source(calendar.source) && Number.isFinite(utc(calendar.knownFrom)) && utc(calendar.knownFrom) <= asOf)) return approximate('NONSESSION_VALUATION_REQUIRES_CERTIFIED_CALENDAR');
  const identityKnown = identityAvailability(identity);
  const identityReason = identityFailure(identity, priceDate, shareDate, asOf, identityKnown);
  if (identityReason) return approximate(identityReason);
  if (!positive(shares.value) || !['shares', 'SHARES'].includes(shares.unit) || !['dei:EntityCommonStockSharesOutstanding', 'us-gaap:CommonStockSharesOutstanding'].includes(shares.concept)) return approximate('ACTUAL_INSTANT_SHARES_CONCEPT_OR_UNIT_INVALID');
  if (shares.vintage !== 'AS_REPORTED' || shares.currentLatest === true || shares.restated === true) return approximate('CURRENT_LATEST_OR_RESTATED_SHARES_NOT_ELIGIBLE');
  if (!officialFiling(shares.source) || utc(shares.source.acceptedAt) !== sharesKnown || shares.source.periodDate !== shareDate || !shares.source.contextId) return approximate('OFFICIAL_ACCEPTANCE_AND_SHARE_CONTEXT_UNCERTIFIED');
  if (shares.issuerId !== identity.issuerId || String(shares.cik).padStart(10, '0') !== String(identity.cik).padStart(10, '0') || shares.listingId !== identity.listingId || shares.securityId !== identity.securityId) return approximate('SHARES_ISSUER_SECURITY_OR_LISTING_MISMATCH');
  if (shares.context?.verified !== true || shares.context.periodType !== 'INSTANT' || shares.context.periodDate !== shareDate || shares.context.scope !== 'ISSUER_COMMON' || String(shares.context.entityCik).padStart(10, '0') !== String(identity.cik).padStart(10, '0') || !Array.isArray(shares.context.dimensions) || shares.context.dimensions.length !== 0) return approximate('FILING_CONTEXT_SCOPE_OR_DIMENSIONS_UNCERTIFIED');
  const shareBasisReason=rawShareBasisFailure(shares,identity,shareDate,asOf);
  if(shareBasisReason)return approximate(shareBasisReason);
  const shareAgeDays = (Date.parse(priceDate) - Date.parse(shareDate)) / 86400000;
  if (policy.mode === 'CURRENT_AS_KNOWN_LATEST_ACTUAL' && !(Number.isInteger(policy.maxShareAgeDays) && policy.maxShareAgeDays >= shareAgeDays)) return approximate('OLDER_ACTUAL_SHARES_REQUIRE_EXPLICIT_BOUNDED_AS_KNOWN_POLICY');
  if (!positive(price.value) || price.currency !== 'USD' || !source(price.source) || price.currentLatest === true || price.certification?.status !== 'VERIFIED' || price.certification.currency !== 'USD' || price.listingId !== identity.listingId || price.securityId !== identity.securityId) return approximate('PRICE_CURRENCY_SOURCE_OR_IDENTITY_UNCERTIFIED');
  if (!['RAW_HISTORICAL_CLOSE', 'CANONICAL_SPLIT_PRICE'].includes(price.basis)) return approximate('TOTAL_RETURN_OR_UNTYPED_PRICE_NOT_MARKET_EQUITY_BASIS');
  if (price.basis === 'RAW_HISTORICAL_CLOSE' && price.certification.basis !== 'RAW_HISTORICAL_CLOSE') return approximate('RAW_CLOSE_BASIS_UNCERTIFIED');
  if (splitHistory.status !== 'VERIFIED' || splitHistory.complete !== true || !source(splitHistory.source) || splitHistory.securityId !== identity.securityId || splitHistory.listingId !== identity.listingId || splitHistory.scope !== 'COMMON_SHARE_SPLITS' || !day(splitHistory.fromDate) || !day(splitHistory.toDate) || splitHistory.fromDate > shareDate || splitHistory.toDate < priceDate || !Array.isArray(splitHistory.bars)) return approximate('COMPLETE_SPLIT_BASIS_BRIDGE_UNCERTIFIED');
  const relevant = [];
  for (const bar of splitHistory.bars) {
    if (!day(bar?.date)) return approximate('SPLIT_HISTORY_DATE_INVALID');
    if (bar.date <= shareDate || bar.date > priceDate) continue;
    if (!positive(bar.splitFactor) || !Number.isFinite(utc(bar.knownFrom)) || utc(bar.knownFrom) > asOf) return approximate('SPLIT_EVENT_MISSING_OR_NOT_KNOWN_AT_FORMATION_CUTOFF');
    if (relevant.length && relevant.at(-1).date >= bar.date) return approximate('SPLIT_HISTORY_DUPLICATED_OR_UNORDERED');
    relevant.push(bar);
  }
  const prefix = [{date: shareDate, splitFactor: 1}, ...relevant];
  const splitMultiplier = ReturnSeries.splitFactors(prefix)[0];
  if (!positive(splitMultiplier)) return approximate('SPLIT_BRIDGE_OVERFLOW_OR_INVALID');
  if (price.basis === 'CANONICAL_SPLIT_PRICE') {
    // A historical price cannot use a basis anchored at a future split date.
    if (price.basisDate !== priceDate || price.certification.basis !== 'CANONICAL_SPLIT_PRICE' || price.certification.causalPrefix !== true || !positive(price.rawClose)) return approximate('CANONICAL_PRICE_NEEDS_SAME_SESSION_RAW_RECONCILIATION');
    const reconstructed = ReturnSeries.splitAdjustedColumn([{date: priceDate, close: price.rawClose, splitFactor: 1}], 'close')[0];
    if (Math.abs(price.value - reconstructed) > 1e-10 * Math.max(price.value, reconstructed)) return approximate('CANONICAL_PRICE_RAW_BASIS_CONTRADICTION');
  }
  const effectiveShares = shares.value * splitMultiplier, value = effectiveShares * price.value;
  if (!positive(value) || !positive(effectiveShares)) return approximate('MARKET_EQUITY_OVERFLOW_OR_INVALID');
  const knownFrom = new Date(Math.max(priceKnown, sharesKnown, identityKnown.time, ...relevant.map(b => utc(b.knownFrom)), ...(priceDate !== valuationDate ? [utc(calendar.knownFrom)] : []))).toISOString();
  const provenance = {method: 'ACTUAL_PIT_SHARES_TIMES_COMPATIBLE_PRICE', issuerId: identity.issuerId, cik: String(identity.cik).padStart(10, '0'), listingId: identity.listingId, securityId: identity.securityId, valuationDate, priceDate, shareDate, formationAsOf: formationCutoff, knownFrom, rawShareObservationBasis: shares.observationBasis, priceKnownFrom: price.knownFrom, sharesKnownFrom: shares.knownFrom, identityAvailability: identityKnown, currency: 'USD', shareAgeDays, mode: policy.mode, temporalBasis: shareAgeDays ? 'AS_KNOWN_LATEST_ACTUAL' : 'SAME_DATE_ACTUAL', maxShareAgeDays: policy.maxShareAgeDays ?? null, exactSharesAtPriceDateEstablished: shareAgeDays === 0, splitMultiplier, effectiveShares, splitScope: splitHistory.scope, sources: {shares: shares.source, price: price.source, identity: identity.source, splits: splitHistory.source}, uncertainty: shareAgeDays ? ['SHARE_CHANGES_AFTER_LAST_OBSERVATION_NOT_OBSERVED'] : [], dataQuality: 'NOT_AUTOMATICALLY_HIGH'};
  const fact = {key: 'marketEquity', value, unit: 'USD', periodEnd: valuationDate, frequency: 'INSTANT', availableAt: knownFrom, firstKnown: knownFrom, origin: 'CERTIFIED_HISTORICAL_DERIVATION', source: {id: `certified-market-equity:${identity.listingId}:${valuationDate}`, accession: shares.source.accession, url: shares.source.url}, certification: {normalized: true, concept: 'marketEquity', state: 'DERIVED', basis: 'ACTUAL_POINT_IN_TIME_SPLIT_ALIGNED', confidence: 'MEDIUM', provenance}};
  return result('DERIVED', null, provenance, fact);
}

/** Public projection: never spreads private certificate/source/security fields. */
export function summarizeMarketEquityCertificates(certificates = []) {
  const states = Object.fromEntries(MARKET_EQUITY_STATES.map(state => [state, 0]));
  let eligible = 0;
  for (const certificate of certificates) {
    if (!MARKET_EQUITY_STATES.includes(certificate?.state)) throw new Error('INVALID_MARKET_EQUITY_CERTIFICATION_STATE');
    states[certificate.state]++;
    if (certificate.eligible === true) eligible++;
  }
  return {schema: MARKET_EQUITY_CONTRACT.version, certificates: certificates.length, eligible, states, dataQualityAutomaticallyHigh: false};
}
