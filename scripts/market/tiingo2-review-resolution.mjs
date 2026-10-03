/** Listing-bound technical review resolution. No canonical or provider writes.
 * Name/CIK equality never merges identities or waives corporate-action gates. */
import { createHash } from 'node:crypto';
import { classifyCandidate } from './tiingo2-policy.mjs';

export const REVIEW_RESOLUTION_VERSION = 'tiingo2-review-resolution-1.0.0';
const upper = v => String(v ?? '').trim().toUpperCase();
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const symbol = r => upper(r.ticker ?? r.symbol);
const listingKey = r => [symbol(r), upper(r.exchange), r.startDate ?? r.start_date ?? ''].join('|');
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '') && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
function asIndex(value) {
  const map = new Map(), conflicts = new Set();
  for (const row of value instanceof Map ? value.values() : value ?? []) {
    const ticker = symbol(row);
    if (map.has(ticker) && sha(map.get(ticker)) !== sha(row)) {
      conflicts.add(ticker);
      // Deterministic diagnostics only; conflicting inputs remain blocked.
      if (sha(row) < sha(map.get(ticker))) map.set(ticker, row);
    }
    else if (!map.has(ticker)) map.set(ticker, row);
  }
  return { map, conflicts };
}
const venue = v => ['AMEX', 'NYSE AMERICAN', 'NYSE MKT', 'NYSEAMERICAN', 'NYSEMKT'].includes(upper(v)) ? 'NYSE AMERICAN' : upper(v);
const allowedVenues = new Set(['NASDAQ', 'NYSE', 'NYSE AMERICAN', 'NYSE ARCA', 'BATS', 'IEX']);

/** Remove legal abbreviations and explicit security descriptors only. No fuzzy
 * names, substring identity, ticker suffix guessing, or legal rename inference. */
export function reviewIssuerNameKey(name) {
  return upper(name).replace(/\((?:EXCHANGEABLE SHARES|SUB(?:ORDINATE)? VOTING)\)/g, '')
    .split(/\s+-\s+(?=(?:CLASS\s+[A-Z0-9]\b|COMMON\s+(?:STOCK|SHARES?)\b|ORDINARY\s+SHARES?\b|SUBORDINATE\s+VOTING\s+SHARES?\b|AMERICAN\s+DEPOSIT[AO]RY|ADS(?:S)?\b|ADR(?:S)?\b))|\bCLASS\s+[A-Z0-9]\b|\bCOMMON\s+(?:STOCK|SHARES?)\b|\bORDINARY\s+SHARES?\b|\bSUBORDINATE\s+VOTING\s+SHARES?\b|\bAMERICAN\s+DEPOSIT[AO]RY\b|\bADS(?:S)?\s*$|\bADR(?:S)?\s*$/)[0]
    .replace(/\b(?:INCORPORATED|INC|CORPORATION|CORP|LIMITED|LTD|PLC|LLC|CO|COMPANY)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Exchange Common Stock describes issued securities; notes, corporate units
 * and depositary preferreds cannot inherit common-equity readiness. */
export function officialSecurityForm(row) {
  if (!row || row.test !== 'N' || row.etf !== 'N') return { eligible: false, reason: 'EXCHANGE_SECURITY_FORM_NOT_CONFIRMED' };
  const name = String(row.name ?? '');
  if (/\b(?:NOTES?|DEBENTURES?|BONDS?)\s+(?:DUE\s+)?20\d\d\s*(?:\([^)]*\))?\s*$/i.test(name)) return { eligible: false, reject: true, type: 'DEBT', reason: 'EXCLUDED_DEBT_SECURITY' };
  if (/\b(?:PREFERRED (?:STOCK|SHARES?|SECURITIES)|PFD (?:STOCK|SHARES?|SERIES)|PREF\. (?:STOCK|SHARES?|SERIES))\b|\s+-\s+(?:PREFERRED|PFD)\s*$/i.test(name)) return { eligible: false, reject: true, type: 'PREFERRED', reason: 'EXCLUDED_PREFERRED' };
  if (/\b(?:CORPORATE UNITS?|WARRANTS?|RIGHTS?)\s*(?:\([^)]*\))?\s*$/i.test(name)) return { eligible: false, reject: true, type: 'OTHER_NON_EQUITY', reason: 'EXCLUDED_NON_EQUITY_SECURITY' };
  if (/\bAMERICAN DEPOSIT[AO]RY (?:SHARES?|RECEIPTS?)\b|\s+-\s+(?:ADS(?:S)?|ADR(?:S)?)\b|\b(?:ADS(?:S)?|ADR(?:S)?)\s*$/i.test(name)) return { eligible: true, type: 'ADR', reason: 'EXPLICIT_AMERICAN_DEPOSITARY_SECURITY' };
  if (/\bDEPOSIT[AO]RY SHARES?\b(?=\s*(?:$|\(|EACH\b|REPRESENTING\b|SERIES\b))/i.test(name)) return { eligible: false, reason: 'REVIEW_UNDERLYING_DEPOSITARY_SECURITY' };
  if (/\bFUND\b.*\bCOMMON SHARES(?: OF BENEFICIAL INTEREST)?\b/i.test(name)) return { eligible: false, reason: 'REVIEW_INVESTMENT_WRAPPER_PRIMARY_EVIDENCE_REQUIRED' };
  if (/\b(?:COMMON (?:STOCK|SHARES?)|ORDINARY SHARES?|SUBORDINATE VOTING SHARES?)\b/i.test(name)) return { eligible: true, type: 'EQUITY_COMMON', reason: 'EXPLICIT_COMMON_SHARE_SECURITY' };
  return { eligible: false, reason: 'REVIEW_UNCONFIRMED_SHARE_FORM' };
}

export function clusterReviewRows(rows) {
  const clusters = new Map();
  for (const row of rows) {
    const identity = row.identity ?? row.evidence?.identity ?? {}, checks = row.checks ?? {};
    const codes = row.reasonCodes ?? [];
    const reason = codes.includes('INVALID_PRICE_HISTORY') ? 'INVALID_HISTORY'
      : !identity.resolved && identity.wrongExchange ? codes.includes('CORPORATE_ACTION_GATE_FAILED') ? 'IDENTITY_VENUE_AND_CORPORATE_ACTION' : 'IDENTITY_AND_VENUE'
      : !identity.resolved ? codes.includes('CORPORATE_ACTION_GATE_FAILED') ? 'IDENTITY_AND_CORPORATE_ACTION' : 'IDENTITY'
      : codes.includes('CORPORATE_ACTION_GATE_FAILED') ? 'CORPORATE_ACTION' : 'OTHER';
    const highPriority = checks.active === true && checks.historyValid === true && checks.latestValid === true && checks.secMapped === true;
    if (!clusters.has(reason)) clusters.set(reason, { reason, tickers: [], secMappedValidPricePriority: [] });
    clusters.get(reason).tickers.push(symbol(row));
    if (highPriority) clusters.get(reason).secMappedValidPricePriority.push(symbol(row));
  }
  return [...clusters.values()].map(r => ({ ...r, tickers: r.tickers.sort(), secMappedValidPricePriority: r.secMappedValidPricePriority.sort(), count: r.tickers.length })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** Inputs are private raw candidate rows plus actual exchange/provider
 * responses. Reviewed primary security-form evidence is listing/issuer bound.
 * Corporate actions are reevaluated upstream by existing Quality gates; this
 * resolver never sets price.corporateActionValid or fundamental/factor fields. */
export function resolveReviewCandidates({ candidateRows = [], priorReviewRows = [], officialRows = [], providerMetadata = [], reviewedSecurityForms = [], baselineRows = [], asOf } = {}) {
  if (!validDate(asOf)) throw Error('REVIEW_AS_OF_REQUIRED');
  const officialIndex = asIndex(officialRows), metadataIndex = asIndex(providerMetadata), candidateIndex = asIndex(candidateRows);
  const officials = officialIndex.map, metadata = metadataIndex.map, candidates = candidateIndex.map;
  const rows = [], overlays = [], acceptedCandidates = [];
  for (const prior of priorReviewRows.filter(r => r.decision === 'MANUAL_REVIEW').sort((a, b) => symbol(a).localeCompare(symbol(b)))) {
    const ticker = symbol(prior), original = candidates.get(ticker), official = officials.get(ticker), meta = metadata.get(ticker);
    const codes = [], proof = [], candidate = original ? structuredClone(original) : null;
    const inputConflict = officialIndex.conflicts.has(ticker) || metadataIndex.conflicts.has(ticker) || candidateIndex.conflicts.has(ticker);
    if (inputConflict) codes.push('CONFLICTING_DUPLICATE_REVIEW_INPUT');
    let rejection = null;
    const startDate = candidate?.startDate ?? candidate?.start_date;
    const key = candidate ? listingKey(candidate) : null;
    const form = officialSecurityForm(official);
    const rawIdentity = candidate?.evidence?.identity ?? {};
    const listingBound = !!candidate && validDate(startDate) && !!meta && symbol(meta) === ticker && meta.startDate === startDate;
    const officialVenue = !!official && allowedVenues.has(venue(official.exchange));
    const sameVenue = listingBound && officialVenue && venue(candidate.exchange) === venue(official.exchange) && venue(meta.exchangeCode ?? meta.exchange) === venue(official.exchange);
    const namesMatch = !!reviewIssuerNameKey(meta?.name) && reviewIssuerNameKey(meta?.name) === reviewIssuerNameKey(official?.name);
    const securityEvidence = reviewedSecurityForms.find(e => e.ticker === ticker && e.exchange === candidate?.exchange && e.startDate === startDate && e.reviewed === true && e.source === 'ISSUER_PRIMARY' && validDate(e.asOf) && e.asOf <= asOf && /^https:\/\//.test(e.url ?? '') && reviewIssuerNameKey(e.issuerName) === reviewIssuerNameKey(meta?.name));
    const reviewedFormConflict = reviewedSecurityForms.some(e => e.ticker === ticker) && !securityEvidence;
    if (!candidate) codes.push('PRIVATE_CANDIDATE_EVIDENCE_REQUIRED');
    if (!listingBound) codes.push('LISTING_BOUND_PROVIDER_METADATA_REQUIRED');
    if (!sameVenue) codes.push('EXACT_OR_EQUIVALENT_VENUE_EVIDENCE_REQUIRED');
    if (!namesMatch) codes.push('ISSUER_NAME_AGREEMENT_OR_PRIMARY_RENAME_REQUIRED');
    if (reviewedFormConflict) codes.push('REVIEW_SECURITY_FORM_EVIDENCE_LISTING_MISMATCH');
    if (candidate && !inputConflict && listingBound && sameVenue && form.reject) rejection = form.reason;
    if (candidate && !inputConflict && listingBound && sameVenue && securityEvidence && ['CEF', 'FUND', 'ETF', 'ETN', 'PREFERRED', 'DEBT'].includes(securityEvidence.instrumentType)) rejection = `EXCLUDED_${['CEF', 'ETF', 'ETN'].includes(securityEvidence.instrumentType) ? 'FUND' : securityEvidence.instrumentType}`;
    if (rejection) {
      candidate.consumerPolicy = { included: false, reasonCodes: [rejection] };
      candidate.evidence.securityForm = { instrumentType: securityEvidence?.instrumentType ?? form.type, source: securityEvidence ? 'ISSUER_PRIMARY' : 'EXCHANGE_DIRECTORY', url: securityEvidence?.url ?? 'https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs', asOf };
      proof.push({ kind: 'EXPLICIT_NON_EQUITY_SECURITY_FORM', listingKey: key, officialName: official?.name, evidenceSha256: sha(securityEvidence ?? official) });
    } else if (candidate && !inputConflict && !reviewedFormConflict && listingBound && sameVenue && namesMatch && form.eligible && ['NEW_SECURITY', 'EXISTING'].includes(rawIdentity.state) && rawIdentity.symbolCollision === false && rawIdentity.staleAlias === false) {
      candidate.evidence.identity = { ...rawIdentity, resolved: true, explicitShareForm: true, nameAgreement: true, wrongExchange: false, providerSymbolMatched: true, listingPeriodMatched: true };
      if (form.type === 'ADR') candidate.instrument_type = 'ADR';
      proof.push({ kind: 'TECHNICAL_SECURITY_FORM_NAME_AND_VENUE_RESOLUTION', listingKey: key, providerMetadataSha256: sha(meta), providerResponseSha256: candidate.evidence?.source?.responseSha256 ?? null, officialEvidenceSha256: sha(official), normalizedIssuerKey: reviewIssuerNameKey(meta.name), identityFieldsPreserved: true });
    } else if (!rejection && !form.eligible) codes.push(form.reason);
    let evaluation = candidate ? classifyCandidate(candidate, { today: asOf, peers: [...candidateRows, ...baselineRows] }) : null;
    const acceptanceProofComplete = candidate && !inputConflict && !reviewedFormConflict && listingBound && sameVenue && namesMatch && form.eligible
      && ['NEW_SECURITY', 'EXISTING'].includes(rawIdentity.state) && rawIdentity.symbolCollision === false && rawIdentity.staleAlias === false;
    const decision = inputConflict ? 'MANUAL_REVIEW' : rejection || evaluation?.decision === 'REJECT_WITH_REASON' ? 'REJECT_WITH_REASON'
      : acceptanceProofComplete && evaluation?.publicationReady ? 'AUTO_RESOLVED' : 'MANUAL_REVIEW';
    if (proof.length && candidate) overlays.push({ ticker, listingKey: key, candidate, proof });
    if (decision === 'AUTO_RESOLVED') acceptedCandidates.push(candidate);
    rows.push({ ticker, companyName: prior.companyName ?? null, priorReasonCodes: prior.reasonCodes, decision, reasonCodes: [...new Set([...codes, ...(evaluation?.reasonCodes ?? [])])].sort(), proof, priority: prior.checks?.active && prior.checks?.historyValid && prior.checks?.latestValid && prior.checks?.secMapped ? 'SEC_MAPPED_VALID_PRICE' : 'STANDARD', listingKey: key, corporateActionGateWaived: false, membershipDataPreconditions: decision === 'AUTO_RESOLVED' && evaluation?.publicationReady === true, quantCanonicalReady: evaluation?.checks?.quantReady === true });
  }
  return { version: REVIEW_RESOLUTION_VERSION, asOf, scope: 'STAGED_REVIEW_EVIDENCE_NO_CANONICAL_MUTATIONS', counts: { reviewed: rows.length, autoResolved: rows.filter(r => r.decision === 'AUTO_RESOLVED').length, rejected: rows.filter(r => r.decision === 'REJECT_WITH_REASON').length, manualReview: rows.filter(r => r.decision === 'MANUAL_REVIEW').length }, clusters: clusterReviewRows(priorReviewRows.filter(r => r.decision === 'MANUAL_REVIEW')), rows, overlays, acceptedCandidates };
}
