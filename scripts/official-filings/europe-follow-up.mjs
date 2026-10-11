/** Official financial follow-up; never a Discover admission dependency. */
import { createHash } from 'node:crypto';
import {
  VERSION as OFFICIAL_PRODUCER_VERSION,
  buildEuropeFundamentalsMapping,
  verifyOfficialEnvelope
} from '../marketstack/europe-fundamentals-mapping.mjs';
import { validISIN, validLEI } from '../marketstack/europe-fundamentals.mjs';

export const VERSION = 'europe-official-filings-follow-up-2.0.0';
const CATALOG_SCHEMA = 'vu-europe-discover-identity-reclassification-2';
const COUNTRIES = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH GB'.split(' '));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const copy = value => structuredClone(value);
const validIsin = value => typeof value === 'string' && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value) && validISIN(value);
const leiValid = value => typeof value === 'string' && /^[A-Z0-9]{18}\d{2}$/.test(value) && validLEI(value);
function catalog(bytes, expected) {
  if (!(typeof bytes === 'string' || bytes instanceof Uint8Array) || !sha(expected) || hash(bytes) !== expected) throw Error('CATALOG_HASH_MISMATCH');
  const result = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (result.schema !== CATALOG_SCHEMA || result.mode !== 'PRIVATE_RESEARCH' || result.publicationAllowed !== false ||
      !Array.isArray(result.companies) || !Array.isArray(result.securities) || !Array.isArray(result.listings)) throw Error('AUTHENTICATED_DISCOVER_CATALOG_REQUIRED');
  return result;
}
function exactLink(url, isin) {
  try { const u = new URL(typeof url === 'string' ? url : url?.href); return u.protocol === 'https:' && u.hostname === 'api.gleif.org' && u.pathname === '/api/v1/lei-records' && u.searchParams.get('filter[isin]') === isin; } catch { return false; }
}
/** Newly resolved issuer evidence does not mutate or merge catalog companies. */
function issuerCandidate(isin, envelopes, asOf) {
  const rows = [];
  for (const envelope of envelopes || []) {
    const proof = verifyOfficialEnvelope(envelope, 'GLEIF', asOf), body = proof?.payload;
    if (!proof || proof.url.searchParams.get('filter[isin]') !== isin || !Array.isArray(body.data) || body.data.length !== 1 ||
        body.meta?.pagination?.total !== 1 || !exactLink(body.links?.first, isin) || !exactLink(body.links?.last, isin)) continue;
    const row = body.data[0], entity = row?.attributes?.entity;
    if (row.id !== row.attributes?.lei || !leiValid(row.id) || entity?.status !== 'ACTIVE' || entity.category !== 'GENERAL' || !COUNTRIES.has(entity.jurisdiction)) continue;
    rows.push({ lei: row.id, jurisdiction: entity.jurisdiction, provenance: proof.source });
  }
  if (new Set(rows.map(r => r.lei)).size !== 1) return null;
  return rows.sort((a, b) => a.provenance.retrievedAt.localeCompare(b.provenance.retrievedAt)).at(-1);
}
function primaryRows(input, protectedIds) {
  const companies = new Map(), securities = new Map(), grouped = new Map();
  for (const c of input.companies) {
    const key = c.companyKey || c.companyId;
    if (typeof key !== 'string' || !key || companies.has(key)) throw Error('CATALOG_COMPANY_CONFLICT');
    if (!COUNTRIES.has(c.issuerCountry)) throw Error('VERIFIED_EUROPE_ISSUER_COUNTRY_REQUIRED');
    companies.set(key, c);
  }
  for (const s of input.securities) {
    if (!s.securityId || securities.has(s.securityId) || protectedIds.has(s.securityId) || !validIsin(s.isin)) throw Error('CATALOG_SECURITY_CONFLICT'); securities.set(s.securityId, s);
  }
  for (const l of input.listings) {
    const s = securities.get(l.securityId), c = companies.get(l.companyKey || l.companyId);
    if (!s || !c || l.identityAdmission !== 'IDENTITY_READY' || l.isin !== s.isin || l.companyKey !== s.companyKey ||
        l.kind !== 'EQUITY_SHARE_CLASS' || l.active !== true || !l.listingKey || !/^[A-Z0-9]{4}$/.test(l.mic || '') ||
        l.currency != null && !/^[A-Z]{3}$/.test(l.currency) || l.isAdr === true) throw Error('CATALOG_LISTING_IDENTITY_CONFLICT');
    if (l.issuerCountry !== c.issuerCountry) throw Error('CATALOG_ISSUER_COUNTRY_CONFLICT');
    const rows = grouped.get(l.securityId) || [];
    if (rows.some(r => r.listingKey === l.listingKey)) throw Error('DUPLICATE_CATALOG_LISTING'); rows.push(l); grouped.set(l.securityId, rows);
  }
  if (grouped.size !== securities.size) throw Error('CATALOG_SECURITY_WITHOUT_LISTING');
  if (new Set(input.listings.map(l => l.companyKey)).size !== companies.size) throw Error('CATALOG_COMPANY_WITHOUT_SECURITY');
  return [...grouped].map(([securityId, listings]) => {
    const primaries = listings.filter(l => l.isPrimary === true);
    if (primaries.length !== 1 || securities.get(securityId).primaryListingId !== primaries[0].listingKey) throw Error('CATALOG_PRIMARY_CONFLICT');
    return { primary: primaries[0], listings, company: companies.get(primaries[0].companyKey) };
  });
}
function supplementsFor(primary, envelopes) {
  const accepted = [], rejected = [];
  for (const envelope of envelopes || []) {
    const scope = envelope?.scope;
    if (scope?.securityId !== primary.securityId) continue;
    if (scope.provider !== 'MARKETSTACK' || scope.isin !== primary.isin || scope.companyKey !== primary.companyKey ||
        scope.listingId !== primary.listingKey || scope.mic !== primary.mic || scope.currency !== primary.currency ||
        !sha(envelope.sha256) || !(typeof envelope.rawBytes === 'string' || envelope.rawBytes instanceof Uint8Array) || hash(envelope.rawBytes) !== envelope.sha256) {
      rejected.push('OPTIONAL_SUPPLEMENT_SCOPE_OR_HASH_CONFLICT'); continue;
    }
    try { accepted.push({ sourceSha256: envelope.sha256, scope: copy(scope), raw: JSON.parse(Buffer.from(envelope.rawBytes).toString('utf8')) }); }
    catch { rejected.push('OPTIONAL_SUPPLEMENT_INVALID_JSON'); }
  }
  return { status: accepted.length ? 'OPTIONAL_SUPPLEMENT' : rejected.length ? 'REJECTED' : 'NOT_REQUESTED', accepted, rejected,
    usedAsPrimary: false, usedForOfficialFacts: false, usedForQuantInputs: false };
}

/** Inputs are original official raw bytes consumed by the unchanged E21 mapper. */
export function buildEuropeOfficialFilingsFollowUp({ catalogBytes, expectedCatalogSha256, officialInputs = {}, optionalSupplements = [], asOf, protectedSecurityIds = [] }) {
  if (OFFICIAL_PRODUCER_VERSION !== 'europe-fundamentals-mapping-2.1.0') throw Error('OFFICIAL_PRODUCER_VERSION_CHANGED');
  const input = catalog(catalogBytes, expectedCatalogSha256), groups = primaryRows(input, new Set(protectedSecurityIds));
  if (!Number.isFinite(Date.parse(input.generatedAt)) || Date.parse(input.generatedAt) > Date.parse(`${asOf}T23:59:59.999Z`)) throw Error('INVALID_OR_FUTURE_CATALOG_TIME');
  const candidates = groups.map(({ primary, company, listings }) => {
    const resolved = issuerCandidate(primary.isin, officialInputs.identities, asOf);
    const canonicalLei = primary.companyKey.startsWith('LEI:') ? primary.companyKey.slice(4) : null;
    if (canonicalLei && (!leiValid(canonicalLei) || resolved && canonicalLei !== resolved.lei)) throw Error('CATALOG_OFFICIAL_ISSUER_CONFLICT');
    if (resolved && resolved.jurisdiction !== company.issuerCountry) throw Error('CATALOG_OFFICIAL_ISSUER_COUNTRY_CONFLICT');
    return { primary, company, resolved, listings: listings.map(l => ({ ...copy(l), status: 'ACCEPTED',
      lei: canonicalLei || resolved?.lei || null, issuerCountry: company.issuerCountry || primary.issuerCountry || null })) };
  });
  const mapping = buildEuropeFundamentalsMapping({ listings: candidates.flatMap(c => c.listings) }, officialInputs, { asOf });
  const byId = new Map(mapping.rows.map(r => [r.securityId, r]));
  const rows = candidates.map(({ primary, company, resolved }) => {
    const official = byId.get(primary.securityId), status = official.status === 'FUNDAMENTALS_IDENTITY_BLOCKED' ? 'OFFICIAL_IDENTITY_REQUIRED' : official.status;
    return { securityId: primary.securityId, companyKey: primary.companyKey, listingId: primary.listingKey, isin: primary.isin,
      mic: primary.mic, listingCurrency: primary.currency, status,
      catalogIssuerIdentityLevel: company.issuerIdentityLevel || 'UNKNOWN', sourceResolvedIssuer: resolved,
      catalogIssuerCountry: company.issuerCountry, catalogIssuerEvidence: copy(primary.evidence || []),
      canonicalCompanyIdentityMutated: false, official,
      optionalSupplement: supplementsFor(primary, optionalSupplements),
      discoverAdmissionDependency: false, quantFinancialInputReady: false, admittedToRanking: false, publicationAllowed: false };
  });
  return { schemaVersion: VERSION, asOf, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    catalogBinding: { schema: input.schema, generatedAt: input.generatedAt, sha256: expectedCatalogSha256, securities: groups.length },
    sourcePolicy: { primary: ['ESEF_OFFICIAL_FILINGS', 'SEC_ONLY_ACTUAL_FILER'], marketstack: 'OPTIONAL_SUPPLEMENT', adrTransfer: false },
    officialProducerVersion: OFFICIAL_PRODUCER_VERSION,
    summary: { securities: rows.length, companies: input.companies.length,
      verifiedLegalEntityCompanies: input.companies.filter(c => c.issuerIdentityLevel === 'VERIFIED_LEGAL_ENTITY').length,
      securityScopedIssuerGroups: input.companies.filter(c => c.issuerIdentityLevel !== 'VERIFIED_LEGAL_ENTITY').length,
      partial: rows.filter(r => r.status === 'FUNDAMENTALS_PARTIAL').length, none: rows.filter(r => r.status === 'FUNDAMENTALS_NONE').length,
      officialIdentityRequired: rows.filter(r => r.status === 'OFFICIAL_IDENTITY_REQUIRED').length,
      officialFilingMapped: rows.filter(r => r.official.officialFilings.length).length,
      issuerFacts: rows.reduce((sum, r) => sum + r.official.companyFacts.length, 0), full: 0, quantFinancialInputReady: 0 }, rows };
}
