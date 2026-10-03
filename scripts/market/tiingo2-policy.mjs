/* Tiingo 2.0 staging policy. Read-only, evidence-based decisions; never writes a
 * canonical file or changes an existing member. Company equality is not
 * security equality: common share classes and ADR/local pairs remain separate. */
import { CONSUMER_INSTRUMENT_TYPES } from './universe-source.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
const FactorEvidence = createRequire(import.meta.url)('../../quant/engines/factor-evidence.js');
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const POLICY_VERSION = 'tiingo2-consumer-policy-1.0.0';
const upper = (value) => String(value ?? '').trim().toUpperCase();
const ticker = (row) => upper(row.ticker ?? row.symbol);
const type = (row) => upper(row.instrument_type ?? row.instrumentType ?? row.classification?.instrumentType ?? row.classification?.securityType ?? row.securityType);
const normalizedType = (row) => ({ COMMON_STOCK: 'EQUITY_COMMON', MUTUALFUND: 'FUND', MUTUAL_FUND: 'FUND' }[type(row)] ?? type(row));
const key = (row) => row.securityId ?? row.security_id ?? `ticker:${ticker(row)}`;
const unique = (values) => [...new Set(values)].sort();
const dateOnly = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const date = value.slice(0, 10), parsed = Date.parse(date);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? date : null;
};
const dayMs = 86400000;

/** A private market calculation is not a published Factor DNA record. The
 * proof binds real canonical gzip bytes, schema/methodology, listing/CIK and
 * observation date. Available factor states remain partial; this never
 * enables the inactive full-seven-factor Quant score. */
export function verifyCanonicalFactorEvidenceProof(row, { root = PROJECT_ROOT, today } = {}) {
  const proof = row.evidence?.factors?.canonicalEvidence;
  const missing = (reason) => ({ verified: false, state: 'NOT_MATERIALIZED', reason, availableFactors: [] });
  if (proof?.state !== 'MATERIALIZED' || proof.verified !== true) return missing('CANONICAL_FACTOR_EVIDENCE_REQUIRED');
  if (!/^quant\/data\/product\/factor-evidence-v1\/[A-Z0-9_-]+\.json\.gz$/.test(proof.artifactPath ?? '') || !/^[a-f0-9]{64}$/.test(proof.artifactSha256 ?? '')) return missing('INVALID_CANONICAL_FACTOR_ARTIFACT_PROOF');
  if (proof.schemaVersion !== FactorEvidence.SHARD_SCHEMA || proof.methodologyVersion !== FactorEvidence.METHODOLOGY_VERSION || proof.securityId !== (row.securityId ?? row.security_id) || proof.ticker !== ticker(row)) return missing('CANONICAL_FACTOR_PROOF_IDENTITY_OR_VERSION_MISMATCH');
  try {
    const bytes = readFileSync(join(root, proof.artifactPath));
    if (createHash('sha256').update(bytes).digest('hex') !== proof.artifactSha256) return missing('CANONICAL_FACTOR_ARTIFACT_SHA_MISMATCH');
    const artifact = JSON.parse(gunzipSync(bytes));
    const shard = proof.artifactPath.split('/').at(-1).slice(0, -8);
    if (!FactorEvidence.validShard(artifact, shard)) return missing('INVALID_CANONICAL_FACTOR_ARTIFACT');
    const record = artifact.securities?.[ticker(row)];
    if (!record?.factors || record.ticker !== ticker(row) || record.securityId !== proof.securityId || record.cik !== (row.evidence?.sec?.cik ?? row.cik) || FactorEvidence.publicationViolations(record).length) return missing('CANONICAL_FACTOR_RECORD_MISMATCH');
    if (!dateOnly(proof.asOf) || proof.asOf !== record.asOf || proof.asOf !== dateOnly(row.evidence?.price?.latestDate) || (today && proof.asOf > today)) return missing('CANONICAL_FACTOR_OBSERVATION_MISMATCH');
    const availableFactors = FactorEvidence.FACTOR_ORDER.filter((id) => record.factors[id]?.state === 'AVAILABLE');
    if (!availableFactors.length) return missing('CANONICAL_FACTOR_RECORD_HAS_NO_AVAILABLE_FACTORS');
    return { verified: true, state: availableFactors.length === FactorEvidence.FACTOR_ORDER.length ? 'MATERIALIZED_READY' : 'MATERIALIZED_PARTIAL', reason: null, availableFactors, artifactPath: proof.artifactPath, artifactSha256: proof.artifactSha256, methodologyVersion: proof.methodologyVersion, asOf: proof.asOf };
  } catch { return missing('CANONICAL_FACTOR_ARTIFACT_UNAVAILABLE'); }
}

/** Preserve the instrument-only consumer policy in universe-source.mjs.
 * Banks/REITs are included there. A stricter existing explicit decision can
 * be supplied as consumerPolicy {included:false, reasonCodes:[...]}. */
export function evaluateConsumerPolicy(row, { baselineConsumer = false } = {}) {
  const instrumentType = normalizedType(row);
  const explicit = row.consumerPolicy;
  let reasonCodes = [];
  let status = 'INCLUDED';
  if (row.historicallyExcluded === true) {
    reasonCodes = ['HISTORICALLY_EXCLUDED', 'EXCLUDED_NON_EQUITY_DEBT'];
    status = 'EXCLUDED';
  } else if (explicit?.included === false) {
    reasonCodes = explicit.reasonCodes?.length ? explicit.reasonCodes : ['EXCLUDED_EXISTING_POLICY'];
    status = 'EXCLUDED';
  } else if (upper(row.product_eligibility ?? row.eligibility) === 'EXCLUDED') {
    reasonCodes = ['EXCLUDED_PRODUCT_POLICY']; status = 'EXCLUDED';
  } else if (!instrumentType || ['UNKNOWN', 'OTHER'].includes(instrumentType)) {
    status = baselineConsumer ? 'INCLUDED' : 'REVIEW';
    reasonCodes = [baselineConsumer ? 'INCLUDED_EXISTING_CONSUMER_POLICY' : 'REVIEW_SECURITY_CLASSIFICATION'];
  } else if (instrumentType && !CONSUMER_INSTRUMENT_TYPES.includes(instrumentType)) {
    const reason = { PREFERRED: 'PREFERRED', WARRANT: 'WARRANT', ETF: 'FUND', ETN: 'FUND', ETP: 'FUND', CEF: 'FUND', FUND: 'FUND', MUTUALFUND: 'FUND', UNIT: 'UNIT', RIGHT: 'RIGHT', INDEX: 'INDEX', TEST: 'TEST_SYMBOL' }[instrumentType] ?? 'NON_EQUITY';
    reasonCodes = [`EXCLUDED_${reason}`]; status = 'EXCLUDED';
  } else reasonCodes = [`INCLUDED_${instrumentType}`];
  return { policyVersion: POLICY_VERSION, status, included: status === 'INCLUDED', instrumentType: instrumentType || 'UNKNOWN', reasonCodes: unique(reasonCodes), source: row.historicallyExcluded === true ? 'PROTECTED_HISTORICAL_EXCLUSION' : explicit ? 'EXPLICIT_EXISTING_POLICY' : 'CANONICAL_CONSUMER_INSTRUMENT_POLICY' };
}

/** Only security-level evidence deduplicates. Issuer/company/name/CIK equality
 * alone cannot remove BRK.A/B, GOOG/GOOGL, or an ADR pair. */
export function identityGate(row, peers = []) {
  const evidence = row.evidence?.identity ?? {};
  const reasons = [];
  if (evidence.symbolCollision === true) reasons.push('SYMBOL_COLLISION');
  if (evidence.wrongExchange === true) reasons.push('WRONG_EXCHANGE');
  if (evidence.staleAlias === true) reasons.push('STALE_ALIAS');
  if (evidence.resolved !== true) reasons.push('IDENTITY_UNRESOLVED');
  if (!ticker(row)) reasons.push('MISSING_SYMBOL');
  if (!(row.securityId ?? row.security_id)) reasons.push('CANONICAL_SECURITY_ID_UNRESOLVED');
  let duplicateOf = evidence.duplicateVerified === true ? evidence.duplicateOf : null;
  if (!duplicateOf && evidence.aliasVerified === true) duplicateOf = evidence.aliasOf;
  const securityId = row.securityId ?? row.security_id;
  for (const peer of peers) {
    if (peer === row) continue;
    const peerId = peer.securityId ?? peer.security_id;
    if (securityId && peerId === securityId && ticker(peer) !== ticker(row)) {
      // Distinct explicit share classes sharing a bad provider ID are an
      // identity collision, not permission to collapse the two securities.
      const a = row.shareClass ?? row.share_class;
      const b = peer.shareClass ?? peer.share_class;
      if (a && b && upper(a) !== upper(b)) reasons.push('SECURITY_ID_COLLISION');
      else if (evidence.aliasVerified === true || evidence.duplicateVerified === true) duplicateOf = ticker(peer);
      else reasons.push('SECURITY_ID_COLLISION');
    }
    if (ticker(peer) === ticker(row) && securityId && peerId && peerId !== securityId) reasons.push('SYMBOL_COLLISION');
  }
  if (duplicateOf) reasons.push('EXCLUDED_DUPLICATE');
  return { passed: reasons.length === 0, duplicateOf: duplicateOf ?? null, reasonCodes: unique(reasons) };
}

/** Evidence must come from actual provider/contract checks, not existence of
 * a ticker or SEC mapping. A mapping never implies materialized factors. */
export function classifyCandidate(row, options = {}) {
  const { today = new Date().toISOString().slice(0, 10), maxPriceAgeDays = 7, peers = [], baselineConsumer = false } = options;
  if (!dateOnly(today) || !Number.isFinite(Date.parse(today))) throw new Error('INVALID_AS_OF_DATE');
  if (!Number.isFinite(maxPriceAgeDays) || maxPriceAgeDays < 0) throw new Error('INVALID_PRICE_AGE_LIMIT');
  const policy = evaluateConsumerPolicy(row, { baselineConsumer });
  const identity = identityGate(row, peers);
  const evidence = row.evidence ?? {};
  const price = evidence.price ?? {};
  const sec = evidence.sec ?? {};
  const factors = evidence.factors ?? {};
  const latestDate = dateOnly(price.latestDate);
  const priceAgeDays = latestDate ? Math.floor((Date.parse(today) - Date.parse(latestDate)) / dayMs) : null;
  const latestFresh = Number.isFinite(priceAgeDays) && priceAgeDays >= 0 && priceAgeDays <= maxPriceAgeDays;
  const historyValid = price.historyValid === true;
  const latestValid = price.latestValid === true && latestFresh;
  const actionValid = price.corporateActionValid === true;
  const status = upper(row.active_status ?? row.activeStatus ?? row.listingStatus);
  const inactive = row.active === false || ['INACTIVE', 'DELISTED', 'MERGED'].includes(status);
  const active = !inactive && (row.active === true || status === 'ACTIVE');
  const secMapped = /^\d{10}$/.test(String(sec.cik ?? row.cik ?? ''));
  const fundamentalReady = secMapped && sec.available === true && sec.pitValid === true;
  const priceReady = historyValid && latestValid && actionValid;
  const identityReady = identity.passed;
  const securityFormReviewRequired = row.securityFormReviewRequired === true;
  const membershipReady = active && policy.included && identityReady && priceReady && !securityFormReviewRequired;
  // The canonical product projection needs five real daily points for a
  // chart. A shorter listing can still enter Search and Watchlists.
  const chartHistoryReady = Number.isSafeInteger(price.bars) && price.bars >= 5;
  const products = evidence.products ?? {};
  const quantCandidateEligible = membershipReady && fundamentalReady && factors.materialized === true && factors.basisValid === true;
  const canonicalFactorEvidence = verifyCanonicalFactorEvidenceProof(row, { root: options.root ?? PROJECT_ROOT, today });
  const quantReady = quantCandidateEligible && canonicalFactorEvidence.verified && products.quantReady === true;
  const dataReadiness = {
    quantCandidateEligible,
    marketCalculationState: factors.calculation?.state ?? factors.computation?.state ?? (factors.materialized === true ? 'CALCULATED_WITHOUT_CANONICAL_PRODUCT_PROOF' : 'UNAVAILABLE'),
    privateMarketFactorsCalculated: factors.materialized === true,
    canonicalFactorEvidenceState: canonicalFactorEvidence.state,
    canonicalFactorEvidenceVerified: canonicalFactorEvidence.verified,
    canonicalFactorEvidenceReason: canonicalFactorEvidence.reason,
    availableCanonicalFactors: canonicalFactorEvidence.availableFactors,
    fullQuantScoreState: 'BLOCKED_BY_EXISTING_METHODOLOGY', fullQuantScoreReady: false
  };
  const productReadiness = {
    canonical: membershipReady, search: membershipReady, chart: membershipReady && chartHistoryReady,
    watchlist: membershipReady, fundamentals: fundamentalReady,
    quant: quantReady, discover: quantReady && products.discoverReady === true,
    screener: membershipReady && products.screenerReady === true,
    superTrader: membershipReady && products.superTraderReady === true,
    secMapped, factorsMaterialized: canonicalFactorEvidence.verified,
    quantCandidateEligible, canonicalFactorsMaterialized: canonicalFactorEvidence.verified,
    fullQuantScoreReady: false
  };
  const reasons = [...policy.reasonCodes, ...identity.reasonCodes];
  if (securityFormReviewRequired) reasons.push('SECURITY_FORM_REVIEW_REQUIRED');
  if (inactive) reasons.push('EXCLUDED_INACTIVE');
  else if (!active) reasons.push('REVIEW_ACTIVE_STATUS');
  if (!historyValid) reasons.push(price.historyValid === false ? 'INVALID_PRICE_HISTORY' : 'MISSING_PRICE_HISTORY');
  if (membershipReady && !chartHistoryReady) reasons.push('INSUFFICIENT_CHART_HISTORY');
  if (price.latestValid !== true) reasons.push(price.latestValid === false ? 'INVALID_LATEST_PRICE' : 'MISSING_LATEST_PRICE');
  if (!latestFresh) reasons.push(priceAgeDays < 0 ? 'FUTURE_PRICE_DATE' : 'STALE_OR_MISSING_LATEST_DATE');
  if (!actionValid) reasons.push(price.corporateActionValid === false ? 'CORPORATE_ACTION_GATE_FAILED' : 'CORPORATE_ACTION_NOT_CHECKED');
  if (!secMapped) reasons.push('SEC_MAPPING_UNAVAILABLE');
  if (!fundamentalReady) reasons.push('FUNDAMENTALS_NOT_READY');
  if (!canonicalFactorEvidence.verified) reasons.push('CANONICAL_FACTOR_EVIDENCE_REQUIRED');
  if (!quantReady) reasons.push('FACTORS_NOT_READY');
  let decision;
  if (policy.status === 'EXCLUDED' || inactive || identity.duplicateOf) decision = 'REJECT_WITH_REASON';
  else if (membershipReady) decision = price.corporateActionFixed === true ? 'ACCEPT_AFTER_FIX' : 'AUTO_ACCEPT';
  else if (policy.included && active && identityReady && historyValid && latestValid && price.corporateActionFalseRejectionConfirmed === true) decision = 'ACCEPT_AFTER_FIX';
  else decision = 'MANUAL_REVIEW';
  return { ticker: ticker(row), securityId: row.securityId ?? row.security_id ?? null,
    companyId: row.companyId ?? row.company_id ?? null, companyName: row.companyName ?? row.name ?? null,
    decision, publicationReady: membershipReady, policy, identity,
    reasonCodes: unique(reasons), productReadiness, dataReadiness,
    checks: { active, historyValid, latestValid, latestDate, priceAgeDays, corporateActionValid: actionValid, secMapped, fundamentalReady, quantCandidateEligible, quantReady },
    evidence };
}

export function buildPolicyReport(rows, options = {}) {
  const baselineKeys = new Set((options.baselineConsumerRows ?? []).map(key));
  const peers = [...rows, ...(options.peers ?? [])];
  const evaluated = rows.map((row) => classifyCandidate(row, { ...options, baselineConsumer: baselineKeys.has(key(row)), peers })).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const counts = { total: evaluated.length, AUTO_ACCEPT: 0, ACCEPT_AFTER_FIX: 0, MANUAL_REVIEW: 0, REJECT_WITH_REASON: 0, publicationReady: 0, quantCandidateEligible: 0, quantReady: 0 };
  const reasons = {};
  for (const row of evaluated) {
    counts[row.decision]++;
    if (row.publicationReady) counts.publicationReady++;
    if (row.productReadiness.quantCandidateEligible) counts.quantCandidateEligible++;
    if (row.productReadiness.quant) counts.quantReady++;
    for (const code of row.reasonCodes) reasons[code] = (reasons[code] ?? 0) + 1;
  }
  return { schemaVersion: POLICY_VERSION, asOf: options.today ?? new Date().toISOString().slice(0, 10), counts, reasonCounts: reasons, policy: { source: 'scripts/market/universe-source.mjs', consumerInstrumentTypes: [...CONSUMER_INSTRUMENT_TYPES], bankExcludedByDefault: false, reitExcludedByDefault: false, newUnknownAutoAccepted: false, existingMembershipProtected: true }, rows: evaluated };
}

/** Additive preview: absent/stale/failed fresh evidence never removes a
 * baseline member. Removing an existing member needs a separate reviewed
 * migration; this refresh cannot perform one. */
export function previewPublication(baselineRows, evaluatedRows) {
  const baseline = new Map(baselineRows.map((row) => [ticker(row), row]));
  const baselineIds = new Set(baselineRows.map((row) => row.securityId ?? row.security_id).filter(Boolean));
  const candidateIdSymbols = new Map();
  for (const row of evaluatedRows) {
    if (!row.securityId || baseline.has(ticker(row))) continue;
    if (!candidateIdSymbols.has(row.securityId)) candidateIdSymbols.set(row.securityId, new Set());
    candidateIdSymbols.get(row.securityId).add(ticker(row));
  }
  const additions = new Map(), blocked = new Map(), unchanged = [...baseline.keys()].sort(), reclassifications = new Map();
  const block = (t, reasons) => { blocked.set(t, unique([...(blocked.get(t) ?? []), ...reasons])); additions.delete(t); };
  for (const row of evaluatedRows) {
    if (baseline.has(ticker(row))) {
      if (!row.policy.included || !row.publicationReady) reclassifications.set(ticker(row), { ticker: ticker(row), action: 'RETAIN_EXISTING_MEMBER', reasonCodes: row.reasonCodes });
    } else {
      const t = ticker(row);
      if (!row.publicationReady || !['AUTO_ACCEPT', 'ACCEPT_AFTER_FIX'].includes(row.decision)) {
        block(t, row.reasonCodes ?? ['PUBLICATION_NOT_READY']); continue;
      }
      if (!row.securityId || baselineIds.has(row.securityId)) {
        block(t, [row.securityId ? 'EXISTING_SECURITY_ID_REQUIRES_ALIAS_REVIEW' : 'CANONICAL_SECURITY_ID_UNRESOLVED']); continue;
      }
      if (candidateIdSymbols.get(row.securityId)?.size > 1) {
        block(t, ['SECURITY_ID_COLLISION']); continue;
      }
      const previous = additions.get(t);
      if (previous && previous.securityId !== row.securityId) {
        block(t, ['SYMBOL_COLLISION']); continue;
      }
      if (!blocked.has(t)) additions.set(t, { ticker: t, securityId: row.securityId, quantReady: previous ? previous.quantReady && row.productReadiness.quant : row.productReadiness.quant, reasonCodes: unique([...(previous?.reasonCodes ?? []), ...(row.reasonCodes ?? [])]) });
    }
  }
  const added = [...additions.values()], reclassified = [...reclassifications.values()];
  return { schemaVersion: POLICY_VERSION, mode: 'ADDITIVE_PREVIEW_ONLY', ADDED: added.sort((a, b) => a.ticker.localeCompare(b.ticker)), REMOVED: [], RECLASSIFIED: reclassified.sort((a, b) => a.ticker.localeCompare(b.ticker)), UNCHANGED: unchanged, BLOCKED: [...blocked].sort(([a], [b]) => a.localeCompare(b)).map(([ticker, reasonCodes]) => ({ ticker, reasonCodes })), counts: { before: baseline.size, added: added.length, removed: 0, after: baseline.size + added.length }, safety: { preservesAllBaselineMembers: true, requiresPublicationAdapter: true, canonicalFilesWritten: false } };
}
