/** Private corporate-action revalidation. No provider IO, price transformation,
 * missing-session fabrication, quarantine release or production gate mutation. */
export const LIVE_ACTIONS_VERSION = 'vu-europe-live-actions-review-1';
const finite = x => typeof x === 'number' && Number.isFinite(x);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const validDate = x => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(x)) return false;
  const t = Date.parse(`${x.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === x.slice(0, 10);
};
const day = x => validDate(x) ? x.slice(0, 10) : null;
const caseKey = x => x.discontinuityId ?? x.caseId ?? `${x.securityId}:${x.from}:${x.to}`;
const sourceOf = x => ({ normalizedSha256: x.normalizedSha256 ?? x.source?.normalizedSha256 ?? null,
  responseIds: x.responseIds ?? [], rawHashes: x.rawHashes ?? x.source?.rawHashes ?? x.source?.responseHashes ?? [],
  sourceHashesVerified: x.sourceHashesVerified === true });
function sourceVerified(x) {
  const s = sourceOf(x); return s.sourceHashesVerified && hash(s.normalizedSha256)
    && s.rawHashes.length > 0 && s.rawHashes.every(v => hash(typeof v === 'string' ? v : v.sha256));
}
function resultState(x) {
  const r = x.result ?? x;
  if (!sourceVerified(x)) return 'SOURCE_UNVERIFIED';
  if (r.ok !== true) return r.status === 504 ? 'GATEWAY_ERROR' : 'REQUEST_ERROR';
  if (r.complete !== true || r.scopeComplete !== true) return 'INCOMPLETE';
  return Array.isArray(r.data) && r.data.length ? 'ROWS_OBSERVED' : 'EMPTY_UNKNOWN';
}
function listingFor(sec) { return sec.listings?.find(x => x.listingId === sec.primaryListingId) ?? sec; }
function proofBound(p, sec, listing, when) {
  return p?.verified === true && hash(p.sourceSha256) && p.securityId === sec.securityId
    && p.listingId === listing.listingId && p.mic === listing.mic && p.isin === sec.isin
    && p.currency === listing.currency && day(p.from) && day(p.to) && p.from <= when && p.to >= when;
}
function conventionFor(proofs, sec, listing, when) {
  return proofs.find(p => proofBound(p, sec, listing, when)
    && p.sourceKind === 'INDEPENDENT_ACTION_CONVENTION_DOCUMENTATION');
}
function eventIdentity(raw, normalized, probe, sec, listing, metadata, when) {
  const reasons = [], symbol = raw.symbol ?? raw.ticker ?? normalized.providerTicker;
  const expected = listing.providerSymbol ?? listing.providerTicker ?? listing.ticker;
  if (symbol !== expected) reasons.push('EVENT_SYMBOL_MISMATCH_OR_UNREPORTED');
  const mics = [...new Set([raw.exchange, raw.mic, raw.stock_exchange?.mic, normalized.providerExchange]
    .filter(x => typeof x === 'string' && /^[A-Z0-9]{4}$/.test(x)))];
  if (mics.length > 1 || mics.length === 1 && mics[0] !== listing.mic) reasons.push('EVENT_MIC_MISMATCH');
  const identityProof = metadata.find(p => proofBound(p, sec, listing, when) && p.historicalListingVerified === true
    && p.providerTicker === expected);
  if (!identityProof) reasons.push('HISTORICAL_SECURITY_BINDING_UNVERIFIED');
  if (!mics.length && !identityProof?.eventEndpointVenueBindingVerified) reasons.push('EVENT_MIC_UNREPORTED');
  if (raw.isin && raw.isin !== sec.isin) reasons.push('EVENT_ISIN_MISMATCH');
  if (raw.security_id && raw.security_id !== sec.securityId) reasons.push('EVENT_SECURITY_MISMATCH');
  const op = probe.operation ?? probe, ol = op.listing ?? {};
  if (ol.securityId !== sec.securityId || ol.listingId !== listing.listingId || ol.mic !== listing.mic
    || ol.providerTicker !== expected || ol.isin !== sec.isin || ol.currency !== listing.currency) reasons.push('REQUEST_LISTING_BINDING_MISMATCH');
  return { reasons, symbol, reportedMic: mics.length === 1 ? mics[0] : null, identitySourceSha256: identityProof?.sourceSha256 ?? null };
}
function observeEvent(observation, probe, sec, listing, metadata, conventions) {
  const raw = observation.raw ?? observation, n = observation.normalized ?? {}, op = probe.operation ?? probe;
  const kind = op.kind, pdate = day(raw.ex_date ?? raw.exDate ?? raw.date ?? n.tradingDate), convention = pdate && conventionFor(conventions, sec, listing, pdate);
  const reasons = [], identity = eventIdentity(raw, n, probe, sec, listing, metadata, pdate ?? '');
  reasons.push(...identity.reasons);
  if (!pdate) reasons.push('INVALID_ACTION_DATE');
  const explicitEx = raw.ex_date != null || raw.exDate != null;
  if (!explicitEx && convention?.eventDateSemantics !== 'EX_TRADING_DATE') reasons.push('EX_DATE_SEMANTICS_UNVERIFIED');
  let factor = null, amount = null, type = kind === 'splits' ? 'SPLIT' : 'DIVIDEND', factorConvention = null;
  if (kind === 'splits') {
    const newShares = raw.new_shares ?? raw.newShares, oldShares = raw.old_shares ?? raw.oldShares;
    if (finite(newShares) && finite(oldShares) && newShares > 0 && oldShares > 0) {
      factor = newShares / oldShares; factorConvention = 'NEW_SHARES_PER_OLD_SHARE_EXPLICIT_COUNTS';
    } else if (convention?.splitFactorConvention === 'NEW_SHARES_PER_OLD_SHARE') {
      factor = raw.split_factor ?? raw.ratio ?? n.splitFactor; factorConvention = 'NEW_SHARES_PER_OLD_SHARE_DOCUMENTED';
    } else if (convention?.splitFactorConvention === 'OLD_SHARES_PER_NEW_SHARE') {
      const v = raw.split_factor ?? raw.ratio ?? n.splitFactor; factor = finite(v) && v > 0 ? 1 / v : null;
      factorConvention = 'OLD_SHARES_PER_NEW_SHARE_DOCUMENTED';
    } else reasons.push('SPLIT_FACTOR_CONVENTION_UNVERIFIED');
    if (!finite(factor) || factor <= 0 || factor === 1) reasons.push('INVALID_OR_UNKNOWN_SPLIT_FACTOR');
    if (finite(factor) && factor < 1) type = 'REVERSE_SPLIT';
  } else if (kind === 'dividends') {
    amount = raw.dividend ?? raw.amount ?? n.dividend;
    const currency = raw.currency ?? raw.price_currency ?? n.currency;
    if (!finite(amount) || amount <= 0) reasons.push('INVALID_DIVIDEND_AMOUNT');
    if (currency !== listing.currency) reasons.push('DIVIDEND_CURRENCY_MISMATCH_OR_UNREPORTED');
    if (convention?.dividendAmountUnit !== (listing.quoteUnit ?? listing.currency)) reasons.push('DIVIDEND_QUOTE_UNIT_UNVERIFIED');
    if (['SPECIAL_DIVIDEND', 'SPECIAL'].includes(String(raw.type ?? raw.event_type ?? '').toUpperCase())) type = 'SPECIAL_DIVIDEND';
  } else reasons.push('UNKNOWN_ACTION_ENDPOINT');
  return { type, date: pdate, factor, factorConvention, amount, currency: raw.currency ?? raw.price_currency ?? n.currency ?? null,
    providerFactor: raw.split_factor ?? raw.ratio ?? n.splitFactor ?? null,
    identity, reasonCodes: [...new Set(reasons)], source: sourceOf(probe), conventionSourceSha256: convention?.sourceSha256 ?? null,
    raw: observation };
}
function evaluateCase(c, sec, listing, probes, metadata, conventions, officialActions, tolerance) {
  const reasons = [], events = [], probeRows = probes.map(p => ({ operation: p.operation, state: resultState(p), source: sourceOf(p) }));
  for (const p of probes.filter(p => resultState(p) === 'ROWS_OBSERVED'))
    for (const o of (p.result ?? p).data) events.push(observeEvent(o, p, sec, listing, metadata, conventions));
  const matching = [...new Map(events.filter(e => e.date === c.to && e.reasonCodes.length === 0)
    .map(e => [JSON.stringify([e.type, e.date, e.factor, e.amount, e.currency]), e])).values()];
  if (!c.calendarVerified || c.priorSessionDate !== c.from || c.missingSessions !== 0) reasons.push('CONSECUTIVE_CALENDAR_SESSIONS_UNVERIFIED');
  if (!finite(c.beforeClose) || !finite(c.afterClose) || c.beforeClose <= 0 || c.afterClose <= 0) reasons.push('INVALID_CASE_PRICE');
  if (c.priceCurrencyVerified !== true || c.currency !== listing.currency
    || c.quoteUnit !== (listing.quoteUnit ?? listing.currency)) reasons.push('CASE_PRICE_CURRENCY_OR_QUOTE_UNIT_UNVERIFIED');
  if (c.listingId && c.listingId !== listing.listingId || c.mic && c.mic !== listing.mic || c.isin && c.isin !== sec.isin) reasons.push('CASE_IDENTITY_BINDING_CONFLICT');
  const ratio = c.afterClose / c.beforeClose, explanations = [];
  for (const e of matching) {
    let residual = null;
    if (e.type === 'SPLIT' || e.type === 'REVERSE_SPLIT') residual = ratio * e.factor;
    else if (e.amount < c.beforeClose) residual = c.afterClose / (c.beforeClose - e.amount);
    if (finite(residual) && Math.abs(residual - 1) <= tolerance)
      explanations.push({ status: `EXPLAINED_${e.type}`, event: e, residualRatio: residual });
    else reasons.push(e.type.includes('SPLIT') ? 'SPLIT_PRICE_RATIO_CONFLICT' : 'DIVIDEND_PRICE_CHANGE_CONFLICT');
  }
  if (events.some(e => e.date !== c.to)) reasons.push('ACTION_DATES_OUTSIDE_BREAK');
  if (events.some(e => e.reasonCodes.length)) reasons.push('ACTION_EVIDENCE_INCOMPLETE_OR_CONFLICTING');
  if (!probes.length) reasons.push('LIVE_ACTION_PROBES_MISSING');
  if (probeRows.some(p => p.state !== 'ROWS_OBSERVED')) reasons.push('LIVE_ACTION_ENDPOINT_EMPTY_ERROR_OR_INCOMPLETE');
  if (!matching.length) reasons.push('NO_VERIFIED_EX_DATE_ACTION');
  if (explanations.length > 1) reasons.push('MULTIPLE_CAUSAL_ACTION_CANDIDATES');
  const explained = explanations.length === 1 && !reasons.includes('CONSECUTIVE_CALENDAR_SESSIONS_UNVERIFIED')
    && !reasons.includes('INVALID_CASE_PRICE') && !reasons.includes('CASE_PRICE_CURRENCY_OR_QUOTE_UNIT_UNVERIFIED')
    && !reasons.includes('CASE_IDENTITY_BINDING_CONFLICT') && !events.some(e => e.date === c.to && e.reasonCodes.length);
  const officials = officialActions.filter(e => e.securityId === sec.securityId && e.listingId === listing.listingId);
  // Observing another-date official event never reassigns its date to fit a price.
  const officialDateConflicts = officials.filter(e => e.resolutionDate && e.resolutionDate > c.to);
  if (officialDateConflicts.length) reasons.push('OFFICIAL_LATER_ACTION_DOES_NOT_EXPLAIN_THIS_BREAK');
  return { discontinuityId: caseKey(c), securityId: sec.securityId, listingId: listing.listingId, from: c.from, to: c.to,
    beforeClose: c.beforeClose, afterClose: c.afterClose, ratio, status: explained ? explanations[0].status : 'UNEXPLAINED',
    reasonCodes: [...new Set(reasons)], explanation: explained ? explanations[0] : null,
    probeEvidence: probeRows, observedEvents: events, officialActionEvidence: officials,
    oldEvidenceSha256: c.sourceNormalizedSha256 ?? c.oldEvidenceSha256 ?? null,
    explanationSupportsAdjustment: false, missingSessionsExplained: 0, pricesCreated: 0, quarantineReleased: 0 };
}
/** results are collector normalized envelopes, augmented ONLY by the verified
 * private archive loader with normalizedSha256/rawHashes/sourceHashesVerified.
 * metadata/convention proofs must cover the historical event's exact listing. */
export function evaluateLiveActions({ catalog, cases = [], results = [], metadataBySecurity = {}, conventionEvidence = [], officialActions = [], embeddedFactors = [], embeddedDividends = [], asOf, tolerance = .05 } = {}) {
  if (!Array.isArray(catalog?.securities) || !validDate(asOf)) throw new Error('CATALOG_AND_EXPLICIT_AS_OF_REQUIRED');
  if (!finite(tolerance) || tolerance <= 0 || tolerance > .05) throw new Error('ACTION_RATIO_TOLERANCE_MUST_NOT_EXCEED_FIVE_PERCENT');
  const securities = new Map(catalog.securities.map(s => [s.securityId, s]));
  if (securities.size !== catalog.securities.length || new Set(cases.map(caseKey)).size !== cases.length) throw new Error('DUPLICATE_SECURITY_OR_CASE');
  if (cases.some(c => !securities.has(c.securityId))) throw new Error('CASE_OUTSIDE_CANONICAL_UNIVERSE');
  const assessed = cases.map(c => {
    const sec = securities.get(c.securityId), listing = listingFor(sec), metadata = metadataBySecurity[c.securityId] ?? [];
    const probes = results.filter(p => {
      const op = p.operation ?? p; return ['splits', 'dividends'].includes(op.kind) && op.listing?.securityId === c.securityId
        && (op.discontinuityId === caseKey(c) || !op.discontinuityId && op.from <= c.to && op.to >= c.to);
    });
    return evaluateCase(c, sec, listing, probes, Array.isArray(metadata) ? metadata : [metadata], conventionEvidence, officialActions, tolerance);
  });
  const rows = catalog.securities.map(sec => {
    const listing = listingFor(sec), related = assessed.filter(c => c.securityId === sec.securityId);
    const probes = results.filter(p => ['splits', 'dividends'].includes((p.operation ?? p).kind) && (p.operation ?? p).listing?.securityId === sec.securityId);
    const events = [], metadata = metadataBySecurity[sec.securityId] ?? [];
    for (const p of probes.filter(p => resultState(p) === 'ROWS_OBSERVED'))
      for (const o of (p.result ?? p).data) events.push(observeEvent(o, p, sec, listing, Array.isArray(metadata) ? metadata : [metadata], conventionEvidence));
    const comparisons = [...embeddedFactors.filter(e => e.securityId === sec.securityId).map(e => {
      const matches = events.filter(x => x.date === e.date && x.type.includes('SPLIT'));
      return { kind: 'SPLIT_FACTOR', date: e.date, embeddedValue: e.providerFactor, endpointValues: matches.map(x => x.providerFactor),
        status: !matches.length ? 'ENDPOINT_NOT_CORROBORATED' : matches.every(x => x.providerFactor === e.providerFactor) ? 'VALUE_MATCH_NOT_CONVENTION_CERTIFICATION' : 'CONFLICTING', oldEvidenceSha256: e.sourceNormalizedSha256 ?? null };
    }), ...embeddedDividends.filter(e => e.securityId === sec.securityId).map(e => {
      const matches = events.filter(x => x.date === e.date && x.type.includes('DIVIDEND'));
      return { kind: 'DIVIDEND', date: e.date, embeddedValue: e.dividend, endpointValues: matches.map(x => x.amount),
        status: !matches.length ? 'ENDPOINT_NOT_CORROBORATED' : matches.every(x => x.amount === e.dividend) ? 'VALUE_MATCH_NOT_UNIT_CERTIFICATION' : 'CONFLICTING', oldEvidenceSha256: e.sourceNormalizedSha256 ?? null };
    })];
    return { securityId: sec.securityId, listingId: listing.listingId, mic: listing.mic, currency: listing.currency,
      status: related.some(c => c.status === 'UNEXPLAINED') ? 'UNRESOLVED_DISCONTINUITIES' : related.length ? 'OBSERVED_ACTIONS_RECONCILED' : 'NO_STRONG_BREAK_IN_CASE_LEDGER',
      corporateActionsCertification: related.some(c => c.status.startsWith('EXPLAINED_')) ? 'PARTIAL' : 'UNKNOWN',
      certificationReason: 'TARGETED_ENDPOINT_PROBES_DO_NOT_CERTIFY_COMPLETE_HISTORY_OR_ADJUSTMENT_BASIS',
      cases: related.map(c => c.discontinuityId), explained: related.filter(c => c.status.startsWith('EXPLAINED_')).length,
      unexplained: related.filter(c => c.status === 'UNEXPLAINED').length,
      endpointEvidence: probes.map(p => ({ operation: p.operation, state: resultState(p), source: sourceOf(p) })), embeddedComparisons: comparisons,
      eventHistoryComplete: false, absenceEstablished: false, adjustmentCertified: false, missingSessionsExplained: 0 };
  });
  return { schema: LIVE_ACTIONS_VERSION, asOf, securities: rows.length, caseCount: assessed.length,
    explained: assessed.filter(c => c.status.startsWith('EXPLAINED_')).length, unexplained: assessed.filter(c => c.status === 'UNEXPLAINED').length,
    rows, cases: assessed, adjustmentsApplied: 0, syntheticBars: 0, missingSessionsExplained: 0,
    quarantineReleased: 0, productionReady: false, rawPreserved: true };
}
