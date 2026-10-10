/** Private evidence diagnostics. Existing quality and feature methods are unchanged.
 * Callers authenticate source responses with the existing evidence loader first.
 * This module cannot certify provider origin, rights or corporate-action basis.
 */
import { validateEodBars, projectEuropeRawResearch } from './europe-quality.mjs';
import { createHash } from 'node:crypto';

export const QUARANTINE_CATEGORIES = Object.freeze(['INVALID_OHLC', 'ZERO_PRICE', 'NEGATIVE_PRICE', 'DUPLICATE_DATE',
  'BAD_VOLUME', 'MISSING_FIELD', 'CURRENCY_CONFLICT', 'IMPOSSIBLE_GAP', 'OTHER']);
const precedence = ['DUPLICATE_DATE', 'BAD_VOLUME', 'CURRENCY_CONFLICT', 'MISSING_FIELD', 'NEGATIVE_PRICE',
  'ZERO_PRICE', 'INVALID_OHLC', 'IMPOSSIBLE_GAP', 'OTHER'];
const rawOf = bar => bar?.providerRaw ?? bar?.raw?.raw ?? bar?.raw ?? bar;
const dateOf = bar => bar?.normalized?.tradingDate ?? bar?.date?.slice?.(0, 10) ?? rawOf(bar)?.date?.slice?.(0, 10);
const emptyCounts = () => Object.fromEntries(QUARANTINE_CATEGORIES.map(category => [category, 0]));

export function classifyQuarantineBar(bar) {
  const raw = rawOf(bar), reasons = bar.reasons ?? [], categories = [];
  if (reasons.includes('IMPOSSIBLE_OHLC')) categories.push('INVALID_OHLC');
  const fields = ['open', 'high', 'low', 'close'].map(field => raw?.[field]);
  if (fields.some(value => typeof value === 'number' && value === 0)) categories.push('ZERO_PRICE');
  if (fields.some(value => typeof value === 'number' && value < 0)) categories.push('NEGATIVE_PRICE');
  if (reasons.includes('DUPLICATE_DATE')) categories.push('DUPLICATE_DATE');
  if (reasons.includes('INVALID_VOLUME')) categories.push('BAD_VOLUME');
  if (reasons.includes('NON_NUMERIC_OHLC')) categories.push('MISSING_FIELD');
  if (reasons.includes('CURRENCY_INCONSISTENT') || reasons.includes('INVALID_CURRENCY_DECLARATION')) categories.push('CURRENCY_CONFLICT');
  if (reasons.includes('IMPOSSIBLE_GAP')) categories.push('IMPOSSIBLE_GAP');
  if (!categories.length) categories.push('OTHER');
  return { primary: precedence.find(category => categories.includes(category)), categories, reasons,
    date: dateOf(bar), originalBar: bar, quarantineReleased: false };
}

export function summarizeQuarantine(quality, { listingKey = null } = {}) {
  const primary = emptyCounts(), inclusive = emptyCounts();
  const rows = (quality?.quarantine ?? []).map(classifyQuarantineBar);
  for (const row of rows) { primary[row.primary]++; for (const category of row.categories) inclusive[category]++; }
  return { listingKey, total: rows.length, primary, inclusive, counting: 'EXCLUSIVE_PRIMARY_AND_OVERLAPPING_SECONDARY',
    rows, quarantineReleased: 0, publicationAllowed: false };
}

/** Diagnose the same trailing segment chosen by the unchanged feature wrapper.
 * Missing-date suggestions are requests for evidence, never invented prices.
 */
export function inspectContiguousLoss({ quality, listing, calendar }) {
  const projection = projectEuropeRawResearch({ quality, listing, calendar });
  const sessions = calendar?.expectedSessions ?? [], from = projection.quality?.from;
  const index = sessions.indexOf(from), preceding = index > 0 ? sessions[index - 1] : null;
  const quarantined = new Set((quality?.quarantine ?? []).map(bar => bar.date));
  const observed = new Set((quality?.rawBars ?? []).map(dateOf));
  const cause = !projection.engineProjection ? 'NO_SAFE_ENGINE_SEGMENT' : quarantined.has(preceding)
    ? 'QUARANTINED_PRECEDING_SESSION' : preceding && !observed.has(preceding)
      ? 'MISSING_PRECEDING_SESSION' : 'WARNING_OR_IDENTITY_BOUNDARY';
  return { listingKey: listing.listingId ?? null, rawCount: quality?.counts?.raw ?? 0,
    validCount: quality?.counts?.valid ?? 0, quarantinedCount: quality?.counts?.quarantined ?? 0,
    safeSegment: projection.quality ?? null, cause, precedingSession: preceding,
    missingDateProbe: cause === 'MISSING_PRECEDING_SESSION' ? { date: preceding, mic: listing.mic,
      providerSymbol: listing.providerTicker ?? listing.providerSymbol, maxPages: 1,
      purpose: 'OBTAIN_NEW_OBSERVATION_FOR_PREVIOUSLY_ABSENT_DATE' } : null,
    afterQuarantine: !projection.engineProjection ? 'BLOCKED' : quality.quarantine.length || quality.missingDates?.length
      || quality.gaps.length || quality.warnings.length ? 'PARTIAL_AFTER_QUARANTINE' : 'SAFE_AFTER_QUARANTINE',
    projection, methodologyChanged: false, strictReadinessPromoted: false };
}

/** Only genuinely absent dates may be added to cached history. A changed provider
 * observation on any old date stays separate and never replaces old evidence.
 * Invalid new dates remain in the merged raw/quality quarantine; duplicates do
 * not allow one member to escape. Rejected same-date rows retain original refs.
 */
export function mergeMissingDateObservations({ cachedBars = [], additions = [], listing, calendar, now,
  protectedQuarantineDates, sourceRequestRanges = {} } = {}) {
  if (!Array.isArray(cachedBars) || !Array.isArray(additions) || !Array.isArray(protectedQuarantineDates)) throw TypeError('BAR_ARRAYS_REQUIRED');
  const occupied = new Set(cachedBars.map(dateOf).filter(Boolean)), protectedDates = new Set(protectedQuarantineDates);
  const rejectedAdditions = [], novel = [];
  for (const bar of additions) {
    const date = dateOf(bar);
    if (protectedDates.has(date) || occupied.has(date)) rejectedAdditions.push({ date, originalBar: bar,
      reason: protectedDates.has(date) ? 'PREVIOUS_QUARANTINE_DATE_PROTECTED' : 'EXISTING_OBSERVATION_DATE_PROTECTED' });
    else novel.push(bar);
  }
  const rawBars = [...cachedBars, ...novel];
  const quality = validateEodBars(rawBars, { listing, calendar, now });
  if (!sourceRequestRanges || typeof sourceRequestRanges !== 'object' || Array.isArray(sourceRequestRanges)) throw TypeError('SOURCE_REQUEST_RANGES_REQUIRED_AS_OBJECT');
  const rangeInvalid = new Set();
  const validatedRanges = new Set(), normalizedDates = new Map([...quality.validBars, ...quality.quarantine].map(bar => [bar.rawIndex, bar.date]));
  for (let index = 0; index < rawBars.length; index++) {
    const sourceId = rawBars[index]?.provenance?.normalizedSha256;
    if (!sourceId || !Object.hasOwn(sourceRequestRanges, sourceId)) continue;
    const requestRange = sourceRequestRanges[sourceId];
    if (!requestRange || typeof requestRange !== 'object' || Array.isArray(requestRange)) throw TypeError('INVALID_SOURCE_REQUEST_RANGE');
    if (!validatedRanges.has(sourceId)) { validateEodBars([], { requestRange }); validatedRanges.add(sourceId); }
    const date = normalizedDates.get(index);
    if (date && (requestRange.from && date < requestRange.from || requestRange.to && date > requestRange.to)) rangeInvalid.add(index);
  }
  const newlyPassingRangeInvalid = quality.validBars.filter(bar => rangeInvalid.has(bar.rawIndex));
  if (rangeInvalid.size) {
    quality.validBars = quality.validBars.filter(bar => !rangeInvalid.has(bar.rawIndex));
    quality.quarantine = quality.quarantine.map(bar => rangeInvalid.has(bar.rawIndex)
      ? { ...bar, reasons: [...new Set([...bar.reasons, 'OUTSIDE_REQUESTED_RANGE'])] } : bar);
    quality.quarantine.push(...newlyPassingRangeInvalid.map(bar => ({ ...bar, reasons: ['OUTSIDE_REQUESTED_RANGE'] })));
  }
  // A later calendar or identity interval can make an old validator verdict
  // differ. Explicit frozen quarantine decisions still override that result.
  const newlyPassingProtected = quality.validBars.filter(bar => protectedDates.has(bar.date));
  if (newlyPassingProtected.length) {
    quality.validBars = quality.validBars.filter(bar => !protectedDates.has(bar.date));
    quality.quarantine.push(...newlyPassingProtected.map(bar => ({ ...bar, reasons: ['PREVIOUS_QUARANTINE_DATE_PROTECTED'] })));
  }
  if (newlyPassingProtected.length || rangeInvalid.size) {
    quality.counts = { raw: rawBars.length, valid: quality.validBars.length, quarantined: quality.quarantine.length };
    if (quality.missingDates) quality.missingDates = [...new Set([...quality.missingDates,
      ...newlyPassingProtected.map(bar => bar.date), ...newlyPassingRangeInvalid.map(bar => bar.date)])].sort();
    quality.volumeVerified = quality.validBars.length > 0 && quality.validBars.every(bar => typeof bar.volume === 'number' && Number.isFinite(bar.volume) && bar.volume > 0);
    quality.status = quality.validBars.length ? 'REVIEW' : 'INVALID';
  }
  // Prior quarantine dates are immutable barriers even if a caller supplies only
  // a valid subset of the cache. They cannot disappear from the research gate.
  const researchQuality = { ...quality, quarantine: [...quality.quarantine,
    ...protectedQuarantineDates.filter(date => !quality.quarantine.some(bar => bar.date === date))
      .map(date => ({ date, reasons: ['PREVIOUS_QUARANTINE_DATE_PROTECTED'], preservedBarrier: true }))] };
  return { rawBars, quality, researchQuality, rejectedAdditions,
    addedValidDates: quality.validBars.filter(bar => !occupied.has(bar.date)).map(bar => bar.date),
    existingBarsReplaced: 0, quarantineReleased: 0, publicAdmission: false,
    sourceAuthentication: 'REQUIRED_UPSTREAM_EXISTING_RAW_RESPONSE_LOADER',
    scope: 'PRIVATE_MISSING_DATE_EVIDENCE_ONLY' };
}

/** Producer-side overlay; never fabricates a provider operation/response page.
 * Receipts bind the actual inputs and outputs after upstream source verification.
 * Close-only cached chart points cannot supply missing OHLC or volume.
 */
export function buildEurope21HistoryOverlay({ cachedBars, additions, listing, calendar, now,
  protectedQuarantineDates, sourceReceipts, sourceRequestRanges = {} } = {}) {
  if (!listing?.securityId || !listing.listingId || !Array.isArray(sourceReceipts) || !sourceReceipts.length)
    throw TypeError('CANONICAL_IDENTITIES_AND_SOURCE_RECEIPTS_REQUIRED');
  if (!Array.isArray(cachedBars) || cachedBars.some(bar => Array.isArray(bar))) throw TypeError('AUTHENTICATED_OHLC_WRAPPERS_REQUIRED');
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const merged = mergeMissingDateObservations({ cachedBars, additions, listing, calendar, now, protectedQuarantineDates, sourceRequestRanges });
  const projection = projectEuropeRawResearch({ quality: merged.researchQuality, listing, calendar });
  const payload = bar => ({ date: dateOf(bar), providerRaw: rawOf(bar), normalized: bar.normalized ?? null,
    source: bar.provenance ?? null });
  const receipt = { schema: 'europe21-history-overlay-1', securityId: listing.securityId, listingId: listing.listingId,
    mic: listing.mic, currency: merged.quality.currency, evaluatedAt: now,
    integrityBasis: 'LOCAL_PRODUCER_SHA256_NOT_PROVIDER_ORIGIN_SIGNATURE',
    upstreamSourceAuthenticationRequired: true, sourceReceipts: structuredClone(sourceReceipts),
    cachedInputSha256: digest(cachedBars.map(payload)), additionsInputSha256: digest(additions.map(payload)),
    immutablePreviousQuarantineSha256: digest(protectedQuarantineDates),
    sourceRequestRanges: structuredClone(sourceRequestRanges), sourceRequestRangesSha256: digest(sourceRequestRanges),
    outputRawSha256: digest(merged.rawBars.map(payload)), projectionSha256: digest(projection),
    researchSeriesHash: projection.seriesHash ?? null, addedValidDates: merged.addedValidDates,
    rejectedAdditions: merged.rejectedAdditions.map(row => ({ date: row.date, reason: row.reason, rawSha256: digest(payload(row.originalBar)) })),
    preservedQuarantineDates: [...protectedQuarantineDates], existingBarsReplaced: 0, quarantineReleased: 0,
    adjustedPricesUsed: false, strictReadinessPromoted: false, publicationAllowed: false };
  return { ...merged, projection, receipt };
}
