/** Europe readiness only: no ingestion, price calculation, scoring or population write.
 * Evidence objects are produced by an official-source resolver, never ticker guesses.
 * `verified` records the resolver's explicit authority/mapping validation; a URL alone
 * cannot prove that a filing belongs to a company or share class.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const FundamentalInputs = require('../../quant/engines/fundamental-inputs.js');
const { STALE_INSTANT_DAYS } = FundamentalInputs;
const QuantMethodology = require('../../quant/methodology/quant-v2.json');
export const VERSION = 'marketstack-europe-fundamentals-1.0.0';
// Conservative generic financial-input completeness, read from the unchanged
// model. Industry templates require their own adapter certification in a PR.
export const REQUIRED_FINANCIAL_INPUTS = Object.freeze([...new Set(['quality', 'growth', 'value', 'profitability'].flatMap(f => QuantMethodology.factors[f].components.map(c => c.id)))]);
const OFFICIAL_KINDS = new Set(['ESEF', 'OFFICIAL_FILING', 'SEC', 'ESMA_FIRDS', 'GLEIF', 'OFFICIAL_EXCHANGE']);
const FINANCIAL_KINDS = new Set(['ESEF', 'OFFICIAL_FILING', 'SEC']);
const MAPPING_FIELDS = ['companyId', 'issuerId', 'lei', 'securityId', 'isin', 'shareClassId', 'listingId', 'mic', 'listingCurrency', 'reportingEntityId', 'reportingEntityLei', 'reportingCurrency'];
const text = v => typeof v === 'string' && v.trim().length > 0;
const unique = xs => [...new Set(xs)];
const finite = v => typeof v === 'number' && Number.isFinite(v);
const currency = v => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const timestamp = v => typeof v === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

function numericIdentifier(v) { return [...v].map(c => /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c).join(''); }
export function validLEI(v) {
  if (typeof v !== 'string' || !/^[A-Z0-9]{18}\d{2}$/.test(v)) return false;
  let remainder = 0;
  for (const digit of numericIdentifier(v)) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
export function validISIN(v) {
  if (typeof v !== 'string' || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v)) return false;
  const digits = numericIdentifier(v).split('').reverse().map(Number);
  return digits.reduce((sum, n, i) => { const doubled = i % 2 ? n * 2 : n; return sum + (doubled > 9 ? doubled - 9 : doubled); }, 0) % 10 === 0;
}
function validProof(proof, kinds = OFFICIAL_KINDS) {
  if (!proof || proof.verified !== true || !kinds.has(proof.kind) || !timestamp(proof.retrievedAt) || !/^[a-f0-9]{64}$/.test(proof.sha256 || '')) return false;
  try { return new URL(proof.url).protocol === 'https:' && Date.parse(proof.retrievedAt) <= Date.now(); } catch { return false; }
}
function secEligible(candidate, source) {
  return source?.kind !== 'SEC' || (candidate.actualSecFiler === true && /^\d{10}$/.test(candidate.cik || '') && source.cik === candidate.cik);
}
function validConsumerDocument(doc, mapping, asOf) {
  if (doc?.schema !== FundamentalInputs.CONSUMER_SCHEMA || doc.dataSource?.isMock !== false ||
      !['official-filings', 'esef', 'sec_edgar'].includes(doc.dataSource?.provider) || !doc.units || !date(asOf)) return false;
  const validUnit = (metric, unit) => unit === (metric === 'shares_outstanding' ? 'shares' : metric === 'eps_diluted' ? `${mapping.reportingCurrency}/shares` : mapping.reportingCurrency);
  for (const kind of ['annual', 'quarterly']) {
    if (!doc[kind] || typeof doc[kind] !== 'object' || Array.isArray(doc[kind])) return false;
    for (const [metric, rows] of Object.entries(doc[kind])) {
      if (!validUnit(metric, doc.units[metric]) || !Array.isArray(rows)) return false;
      const seen = new Set();
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 5 || !Number.isInteger(row[0]) ||
            !(kind === 'annual' ? row[1] === 'FY' : /^Q[1-4]$/.test(row[1])) ||
            !date(row[2]) || !finite(row[3]) || !date(row[4]) || row[2] > row[4] || row[4] > asOf || seen.has(row[2])) return false;
        seen.add(row[2]);
      }
    }
  }
  if (!doc.ttm || typeof doc.ttm !== 'object' || Array.isArray(doc.ttm)) return false;
  for (const [metric, fact] of Object.entries(doc.ttm)) {
    if (!finite(fact?.v) || !date(fact?.end) || !date(fact?.filed) || fact.end > fact.filed || fact.filed > asOf ||
        !validUnit(metric, doc.units[metric]) || !validUnit(metric, fact.unit)) return false;
  }
  return true;
}

/** Shape: evidence={mapping, proofs:[{id,kind,url,sha256,retrievedAt,
 * verified,fields:[mapping field names]}], reportingRelationship:{...}}.
 * Candidate fields are hints; only a proof-backed resolved mapping is verified.
 */
export function evaluateIdentityEvidence(candidate = {}, evidence = {}) {
  const mapping = evidence.mapping || {}, reasons = [], missing = [], conflicts = [];
  const proofs = (Array.isArray(evidence.proofs) ? evidence.proofs : []).filter(p => validProof(p) && secEligible(candidate, p));
  const covered = new Set(proofs.flatMap(p => Array.isArray(p.fields) ? p.fields : []));
  for (const field of MAPPING_FIELDS) {
    if (!text(mapping[field]) || !covered.has(field)) missing.push(field);
    if (text(candidate[field]) && text(mapping[field]) && candidate[field] !== mapping[field]) conflicts.push(field);
  }
  if (text(mapping.lei) && !validLEI(mapping.lei)) reasons.push('INVALID_LEI');
  if (text(mapping.reportingEntityLei) && !validLEI(mapping.reportingEntityLei)) reasons.push('INVALID_REPORTING_ENTITY_LEI');
  if (text(mapping.isin) && !validISIN(mapping.isin)) reasons.push('INVALID_ISIN');
  if (text(mapping.mic) && !/^[A-Z0-9]{4}$/.test(mapping.mic)) reasons.push('INVALID_MIC');
  if (text(mapping.listingCurrency) && !currency(mapping.listingCurrency)) reasons.push('INVALID_LISTING_CURRENCY');
  if (text(mapping.reportingCurrency) && !currency(mapping.reportingCurrency)) reasons.push('INVALID_REPORTING_CURRENCY');
  const relationship = evidence.reportingRelationship;
  const relationshipValid = relationship?.verified === true && ['SAME_ENTITY', 'CONSOLIDATED_GROUP'].includes(relationship.kind) &&
    relationship.issuerLei === mapping.lei && relationship.reportingEntityLei === mapping.reportingEntityLei &&
    (relationship.kind !== 'SAME_ENTITY' || mapping.lei === mapping.reportingEntityLei) &&
    proofs.some(p => p.id === relationship.proofId && Array.isArray(p.fields) && p.fields.includes('reportingRelationship'));
  if (!relationshipValid) missing.push('reportingRelationship');
  if (candidate.isAdr === true || evidence.isAdr === true) reasons.push('ADR_NOT_LOCAL_SHARE_CLASS');
  if (conflicts.length) reasons.push('IDENTITY_CONFLICT');
  if (missing.length) reasons.push('IDENTITY_EVIDENCE_INCOMPLETE');
  const blocked = reasons.some(r => r !== 'IDENTITY_EVIDENCE_INCOMPLETE');
  const listingFields = ['companyId', 'issuerId', 'securityId', 'isin', 'shareClassId', 'listingId', 'mic', 'listingCurrency'];
  const listingIdentityVerified = !blocked && listingFields.every(f => text(mapping[f]) && covered.has(f));
  return { version: VERSION, status: blocked ? 'BLOCKED' : missing.length ? 'PARTIAL' : 'VERIFIED',
    listingIdentityVerified, mapping, reasons: unique(reasons), missing: unique(missing), conflicts,
    provenance: proofs, sourcePolicy: 'OFFICIAL_IDENTITY_EVIDENCE', candidateIdentifiersAreEvidence: false };
}

/** Normalize only readiness. Original facts and proofs remain unchanged.
 * Filings require explicit official authority, issuer/reporting identity, class
 * association, availability date and units. No numbers are calculated here.
 */
export function evaluateFundamentals(candidate = {}, evidence = {}, options = {}) {
  const asOf = options.asOf || new Date().toISOString().slice(0, 10);
  const identity = evaluateIdentityEvidence(candidate, evidence.identity || {});
  const reasons = [], accepted = [], quarantined = [];
  if (!date(asOf)) reasons.push('INVALID_AS_OF');
  if (identity.status !== 'VERIFIED') reasons.push('FINANCIAL_IDENTITY_NOT_VERIFIED');
  const mapping = identity.mapping;
  for (const [index, filing] of (Array.isArray(evidence.filings) ? evidence.filings : []).entries()) {
    const errors = [];
    if (!validProof(filing.source, FINANCIAL_KINDS) || !secEligible(candidate, filing.source)) errors.push('UNVERIFIED_OFFICIAL_SOURCE');
    if (filing.source?.kind === 'SEC' && (filing.cik !== candidate.cik || filing.securityBasis !== 'LOCAL_SHARE_CLASS_VERIFIED')) errors.push('SEC_LOCAL_SHARE_CLASS_NOT_VERIFIED');
    if (filing.issuerLei !== mapping.lei || filing.reportingEntityLei !== mapping.reportingEntityLei || filing.reportingEntityId !== mapping.reportingEntityId || filing.isin !== mapping.isin || filing.shareClassId !== mapping.shareClassId) errors.push('FILING_IDENTITY_MISMATCH');
    if (!currency(filing.reportingCurrency) || filing.reportingCurrency !== mapping.reportingCurrency) errors.push('REPORTING_CURRENCY_MISMATCH');
    if (!date(filing.periodEnd) || !date(filing.filed) || !date(filing.availableAt) || filing.periodEnd > filing.filed || filing.filed > filing.availableAt || filing.availableAt > asOf || !date(asOf)) errors.push('INVALID_FILING_TIMING');
    if (!['AS_REPORTED', 'LATEST_KNOWN'].includes(filing.policy)) errors.push('UNVALIDATED_REVISION_POLICY');
    if (filing.isAdr === true) errors.push('ADR_NOT_LOCAL_SHARE_CLASS');
    const metrics = filing.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics) || !Object.keys(metrics).length) errors.push('NO_VALIDATED_FACTS');
    else for (const [name, fact] of Object.entries(metrics)) {
      if (!text(name) || !finite(fact?.value) || !text(fact?.concept) || !text(fact?.contextId) || !text(fact?.unit) ||
          !['shares', filing.reportingCurrency, `${filing.reportingCurrency}/shares`].includes(fact?.unit) || fact?.validated !== true) errors.push('INVALID_FACT_EVIDENCE');
    }
    if (identity.status !== 'VERIFIED') errors.push('FINANCIAL_IDENTITY_NOT_VERIFIED');
    (errors.length ? quarantined : accepted).push(errors.length ? { index, reasons: unique(errors), filing } : filing);
  }
  const latest = accepted.slice().sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.availableAt.localeCompare(b.availableAt)).at(-1);
  const fundamentalsCurrent = latest && date(asOf) && (Date.parse(asOf) - Date.parse(latest.periodEnd)) / 86400000 <= STALE_INSTANT_DAYS;
  const shares = evidence.sharesBasis, fx = evidence.currencyBasis;
  const sharesBasisValid = shares?.verified === true && validProof(shares.proof, FINANCIAL_KINDS) && secEligible(candidate, shares.proof) &&
    shares.issuerLei === mapping.lei && shares.securityId === mapping.securityId && shares.isin === mapping.isin && shares.shareClassId === mapping.shareClassId &&
    shares.basis === 'LOCAL_SHARE_CLASS' && finite(shares.value) && shares.value > 0 && date(shares.asOf) && shares.asOf <= asOf && latest?.periodEnd === shares.asOf;
  const currencyBasisValid = fx?.verified === true && fx.reportingCurrency === mapping.reportingCurrency && fx.priceCurrency === mapping.listingCurrency &&
    (fx.basis === 'SAME_CURRENCY' ? mapping.reportingCurrency === mapping.listingCurrency :
      fx.basis === 'CONVERSION_VERIFIED' && finite(fx.rate) && fx.rate > 0 && date(fx.asOf) && fx.asOf <= asOf && validProof(fx.proof));
  const certificate = evidence.engineInputCertificate;
  const normalized = certificate?.consumerDocument;
  const documentIdentity = certificate?.documentIdentity;
  const sourceHashes = new Set(accepted.map(f => f.source.sha256));
  const certifiedSource = validProof(certificate?.proof, FINANCIAL_KINDS) && sourceHashes.has(certificate.proof.sha256);
  const normalizedHash = normalized && createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  let computed = null;
  if (certifiedSource && certificate?.documentMappingVerified === true && certificate.profile === 'GENERIC' && certificate.profileVerified === true && validConsumerDocument(normalized, mapping, asOf) &&
      certificate.normalizedDocumentSha256 === normalizedHash && date(asOf) && finite(certificate.marketCap) && certificate.marketCap > 0) {
    try { computed = FundamentalInputs.compute(normalized, asOf, certificate.marketCap); } catch { computed = null; }
  }
  const missingEngineInputs = REQUIRED_FINANCIAL_INPUTS.filter(k => !finite(computed?.raws?.[k]));
  const engineInputsValid = certificate?.verified === true && certificate.engine === 'fundamental-inputs-1.0.0' &&
    certificate.schema === 'vu-consumer-fundamentals-1.0.0' && certifiedSource && secEligible(candidate, certificate.proof) &&
    certificate.securityId === mapping.securityId && certificate.isin === mapping.isin && certificate.shareClassId === mapping.shareClassId &&
    ['companyId', 'issuerId', 'lei', 'securityId', 'isin', 'shareClassId', 'reportingEntityId', 'reportingEntityLei', 'reportingCurrency'].every(k => documentIdentity?.[k] === mapping[k]) &&
    certificate.marketCapBasis?.verified === true && certificate.marketCapBasis.securityId === mapping.securityId && certificate.marketCapBasis.listingId === mapping.listingId &&
    certificate.marketCapBasis.currency === mapping.reportingCurrency && certificate.marketCapBasis.shares === shares?.value && certificate.marketCapBasis.shareClassId === mapping.shareClassId &&
    date(certificate.marketCapBasis.asOf) && certificate.marketCapBasis.asOf <= asOf &&
    missingEngineInputs.length === 0 && computed?.shares?.value === shares?.value && date(certificate.asOf) && certificate.asOf <= asOf && latest?.periodEnd === computed?.referenceEnd;
  if (!accepted.length) reasons.push('NO_VALIDATED_OFFICIAL_FILINGS');
  if (!sharesBasisValid) reasons.push('SHARE_CLASS_SHARES_BASIS_UNVERIFIED');
  if (!currencyBasisValid) reasons.push('PRICE_FUNDAMENTALS_CURRENCY_BASIS_UNVERIFIED');
  if (!engineInputsValid) reasons.push('EXISTING_ENGINE_INPUTS_NOT_CERTIFIED');
  if (latest && !fundamentalsCurrent) reasons.push('FUNDAMENTALS_STALE');
  const full = accepted.length > 0 && fundamentalsCurrent && sharesBasisValid && currencyBasisValid && engineInputsValid;
  return { version: VERSION, status: reasons.includes('INVALID_AS_OF') || identity.status === 'BLOCKED' ? 'INVALID' : full ? 'VALIDATED' : accepted.length ? 'PARTIAL' : 'UNKNOWN',
    identity, asOf, sourcePolicy: 'ESEF_OFFICIAL_FILINGS_PRIMARY_SEC_ACTUAL_FILER_ONLY', marketstackStandardFundamentals: false,
    validFilingCount: accepted.length, quarantineCount: quarantined.length, acceptedFilings: accepted, quarantinedFilings: quarantined,
    sharesBasisValid, currencyBasisValid, engineInputsValid, missingEngineInputs, fundamentalsCurrent: !!fundamentalsCurrent, reasons: unique(reasons),
    pitEligibility: 'NOT_CERTIFIED', rankingAdmission: false };
}

/** Accepts evaluated objects. A readiness result does not run or change Quant.
 * Quant FULL is about inputs; a Europe population needs its own reviewed PR.
 */
export function evaluateQuantReadiness({ identity = {}, prices = {}, technical = {}, fundamentals = {} } = {}) {
  const reasons = [];
  const identityValid = identity.listingIdentityVerified === true && identity.status !== 'BLOCKED';
  const sameProjection = projection => projection.securityId === identity.mapping?.securityId && projection.listingId === identity.mapping?.listingId && projection.currency === identity.mapping?.listingCurrency;
  const priceValid = prices.valid === true && sameProjection(prices) && ['CURRENT', 'LAST_VALID_SESSION'].includes(prices.freshness) && prices.adjustmentStatus === 'ADJUSTMENT_CERTIFIED';
  const technicalValid = technical.status === 'TECHNICAL_READY' && sameProjection(technical) && technical.benchmarkValid === true && technical.benchmarkRegion === 'EUROPE' &&
    technical.benchmarkProvenance?.verified === true && text(technical.benchmarkProvenance.provider) && text(technical.benchmarkProvenance.sourceId);
  if (!identityValid) reasons.push('LISTING_IDENTITY_NOT_VERIFIED');
  if (!priceValid) reasons.push('PRICE_INPUTS_NOT_CERTIFIED');
  if (!technicalValid) reasons.push('TECHNICAL_INPUTS_OR_EUROPE_BENCHMARK_NOT_READY');
  const usable = identityValid && priceValid && technicalValid;
  const fundamentalsMatch = ['companyId', 'issuerId', 'securityId', 'isin', 'shareClassId', 'listingId', 'mic', 'listingCurrency'].every(k => text(identity.mapping?.[k]) && identity.mapping[k] === fundamentals.identity?.mapping?.[k]);
  const full = usable && fundamentalsMatch && fundamentals.status === 'VALIDATED' && fundamentals.identity?.status === 'VERIFIED' && fundamentals.sharesBasisValid === true && fundamentals.currencyBasisValid === true && fundamentals.engineInputsValid === true && fundamentals.fundamentalsCurrent === true;
  const partial = usable && fundamentalsMatch && fundamentals.status === 'PARTIAL' && fundamentals.validFilingCount > 0;
  if (usable && ['VALIDATED', 'PARTIAL'].includes(fundamentals.status) && !fundamentalsMatch) reasons.push('FUNDAMENTALS_LISTING_MISMATCH');
  const status = full ? 'QUANT_FULL' : partial ? 'QUANT_PARTIAL' : usable ? 'QUANT_TECHNICAL_ONLY' : 'QUANT_BLOCKED';
  if (!full) reasons.push(...(fundamentals.reasons || ['OFFICIAL_FUNDAMENTALS_NOT_READY']));
  return { version: VERSION, status, reasons: unique(reasons), population: 'EUROPE_READINESS',
    admittedToRanking: false, scoreProduced: false, methodologyChanged: false, usPopulationModified: false };
}
