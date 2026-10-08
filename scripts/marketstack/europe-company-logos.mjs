/** Read-only bridge to the existing central logo pipeline. No provider URLs/fetch. */
import { readFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { namesEqual, normalizeCik } from '../discover/company-logos-lib.mjs';
import { privateReplayRoot } from './europe-private-files.mjs';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))];
export const LOGO_BRIDGE_VERSION = 'marketstack-europe-central-logo-evidence-1';
const registryFiles = {
  index: 'discover/logos/index.json', credits: 'discover/logos/credits.json', reviewed: 'discover/config/logo-reviewed.json',
  exclusions: 'discover/config/logo-exclusions.json', rejects: 'discover/config/logo-rejects.json',
  names: 'quant/data/market/security-master/company-names.json'
};
// The central matcher discards generic words and one-letter tokens. That is
// insufficient for cross-country reuse: E.ON must not become On Holding, and
// NN Group must not become NN Inc. Preserve the full brand/entity name here;
// only a terminal legal form is omitted. No central engine is changed.
function exactLegalEntityName(value) {
  let words = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const forms = ['sa nv', 'n v', 's a', 'a s', 's p a', 'aktiengesellschaft', 'incorporated', 'corporation', 'limited', 'societe anonyme',
    'naamloze vennootschap', 'inc', 'corp', 'ltd', 'plc', 'ag', 'nv', 'sa', 'se', 'as', 'ab', 'asa', 'spa', 'oyj'];
  const form = forms.find(suffix => words.endsWith(' ' + suffix));
  if (form) words = words.slice(0, -(form.length + 1));
  return words.replace(/ /g, '');
}
export function readCentralLogoRegistry(root = repositoryRoot) {
  const documents = {}, sources = [];
  for (const [key, relative] of Object.entries(registryFiles)) {
    const path = join(root, relative);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw Error('CENTRAL_LOGO_REGISTRY_REQUIRED:' + relative);
    const bytes = readFileSync(path); documents[key] = JSON.parse(bytes); sources.push({ path: relative, sha256: hash(bytes), bytes: bytes.length });
  }
  return { ...documents, sources, root };
}
function inspectAsset(registry, key) {
  const path = registry.index.files?.[key], credit = registry.credits.credits?.[key];
  if (registry.exclusions.symbols?.[key]) return { reason: 'CENTRAL_LOGO_EXCLUDED' };
  if (!path || !credit) return { reason: 'CENTRAL_ASSET_NOT_PUBLISHED' };
  if (credit.pending || registry.reviewed.symbols?.[key] !== credit.sha1) return { reason: 'CENTRAL_REVIEW_NOT_CURRENT' };
  if (!/^[a-f0-9]{40}$/.test(credit.sha1 || '') || credit.path !== path || !['WIKIMEDIA_COMMONS', 'WEBSITE', 'SEC_FILING'].includes(credit.source)) return { reason: 'CENTRAL_SOURCE_CONTRACT_INVALID' };
  if (registry.rejects.urls?.[credit.iconUrl] || registry.rejects.urls?.[credit.page] || registry.rejects.titles?.[credit.title]) return { reason: 'CENTRAL_IMAGE_REJECTED' };
  if (!/^files\/[A-Za-z0-9._-]+\.png$/.test(path)) return { reason: 'CENTRAL_ASSET_PATH_UNSAFE' };
  const absolute = join(registry.root, 'discover/logos', path);
  for (let cursor = absolute; cursor !== registry.root; cursor = dirname(cursor)) {
    if (!existsSync(cursor)) return { reason: 'CENTRAL_ASSET_MISSING' };
    if (lstatSync(cursor).isSymbolicLink()) return { reason: 'CENTRAL_ASSET_SYMLINK' };
  }
  const bytes = readFileSync(absolute);
  if (bytes.length < 33 || bytes.length > 3 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) < 1 || bytes.readUInt32BE(20) < 1) return { reason: 'CENTRAL_ASSET_INVALID_PNG' };
  // Commons sha1 covers its original image. The pipeline's square PNG is derived;
  // keep both hashes and their different roles instead of equating them.
  const asset = { path: '/discover/logos/' + path, sha256: hash(bytes), bytes: bytes.length,
    reviewedSourceSha1: credit.sha1, reviewedHashScope: credit.source === 'WIKIMEDIA_COMMONS' ? 'COMMONS_ORIGINAL_IMAGE' : 'CENTRAL_PNG',
    source: credit.source, credit, registryHashes: registry.sources };
  if (credit.source !== 'WIKIMEDIA_COMMONS' && createHash('sha1').update(bytes).digest('hex') !== credit.sha1) return { reason: 'CENTRAL_ASSET_REVIEW_HASH_MISMATCH' };
  return { asset };
}
export function buildEuropeCompanyLogoEvidence(universe, registry, { generatedAt = universe?.generatedAt } = {}) {
  if (!['PRIVATE_RESEARCH', 'PRIVATE_DISCOVERY'].includes(universe?.mode) || universe.publicationAllowed !== false) throw Error('PRIVATE_RESEARCH_UNIVERSE_REQUIRED');
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) throw Error('EXPLICIT_LOGO_EVALUATION_TIME_REQUIRED');
  const acceptedListings = (universe.listings || []).filter(l => l.status === 'ACCEPTED'), companyKeys = unique(acceptedListings.map(l => l.companyKey));
  const companyEvidence = {}, rows = [], cikOwners = new Map();
  for (const companyKey of companyKeys) {
    const listings = acceptedListings.filter(l => l.companyKey === companyKey);
    const issuerCountries = unique(listings.map(l => l.issuerCountry));
    const identities = listings.flatMap(l => l.identityEvidence || []).filter(e => e.verified === true && e.lei && companyKey === 'LEI:' + e.lei && e.issuerName &&
      issuerCountries.length === 1 && e.issuerCountry === issuerCountries[0] && (!e.legalJurisdiction || e.legalJurisdiction === issuerCountries[0]) &&
      (e.provenance?.gleif?.sha256 || e.source?.sha256));
    const issuerNames = unique(identities.map(e => e.issuerName));
    const fallbackName = issuerNames[0] || listings[0].name || listings[0].symbol;
    const logo = { status: 'LOGO_FALLBACK', key: null, companyId: companyKey, initial: Array.from(String(fallbackName || '?').trim())[0] || '?',
      issuerCountry: issuerCountries.length === 1 ? issuerCountries[0] : null,
      evidenceRef: LOGO_BRIDGE_VERSION + ':' + companyKey, reason: 'NO_EXACT_OFFICIAL_ISSUER_CENTRAL_MATCH',
      pipeline: 'EXISTING_DISCOVER_CENTRAL_LOGO_PIPELINE', blocksIdentity: false, provenance: { registryHashes: registry.sources,
        issuerIdentity: identities.map(e => ({ lei: e.lei, issuerName: e.issuerName, source: e.provenance?.gleif || e.source })) } };
    const matches = (registry.names.rows || []).filter(row => row.status === 'RESOLVED' && !row.nameConflict && row.cik &&
      normalizeCik(row.cik) === normalizeCik(row.candidates?.SEC_COMPANY_TICKERS?.cik) &&
      issuerNames.some(name => namesEqual(name, row.candidates?.SEC_COMPANY_TICKERS?.name) &&
        exactLegalEntityName(name) && exactLegalEntityName(name) === exactLegalEntityName(row.candidates.SEC_COMPANY_TICKERS.name)));
    const ciks = unique(matches.map(row => normalizeCik(row.cik)));
    if (ciks.length > 1) { logo.status = 'LOGO_SUSPECT'; logo.reason = 'AMBIGUOUS_OFFICIAL_ISSUER_CENTRAL_CIK'; }
    else if (ciks.length === 1) {
      const candidates = matches.map(row => ({ row, inspected: inspectAsset(registry, row.ticker) })).sort((a, b) => a.row.ticker.localeCompare(b.row.ticker));
      const valid = candidates.find(candidate => candidate.inspected.asset);
      if (valid) {
        logo.status = 'LOGO_VALID'; logo.reason = null; logo.key = valid.row.ticker; logo.asset = valid.inspected.asset;
        logo.provenance.binding = { basis: 'OFFICIAL_GLEIF_ISSUER_NAME_EQUALS_UNIQUE_SEC_REGISTRANT_NAME', centralKey: valid.row.ticker,
          issuerNames, issuerCountry: issuerCountries[0], issuerCountryBasis: 'ACCEPTED_COMPANY_GLEIF_ENTITY_JURISDICTION',
          cik: ciks[0], secRegistrant: valid.row.candidates.SEC_COMPANY_TICKERS, centralSecurityId: valid.row.securityId,
          priceOrFundamentalsTransfer: false };
        if (!cikOwners.has(ciks[0])) cikOwners.set(ciks[0], []); cikOwners.get(ciks[0]).push(companyKey);
      } else {
        logo.reason = candidates.map(c => c.inspected.reason).join('|');
        if (candidates.some(c => !['CENTRAL_ASSET_NOT_PUBLISHED', 'CENTRAL_ASSET_MISSING'].includes(c.inspected.reason))) logo.status = 'LOGO_SUSPECT';
      }
    }
    companyEvidence[companyKey] = { logo }; rows.push({ companyId: companyKey, securities: unique(listings.map(l => l.securityId)), logo });
  }
  for (const owners of cikOwners.values()) if (owners.length > 1) for (const owner of owners) {
    const logo = companyEvidence[owner].logo; logo.status = 'LOGO_SUSPECT'; logo.reason = 'CENTRAL_CIK_CLAIMED_BY_MULTIPLE_OFFICIAL_ISSUERS'; logo.key = null; delete logo.asset;
  }
  const summary = { companies: rows.length, securities: unique(acceptedListings.map(l => l.securityId)).length,
    valid: rows.filter(r => r.logo.status === 'LOGO_VALID').length, fallback: rows.filter(r => r.logo.status === 'LOGO_FALLBACK').length,
    missing: rows.filter(r => r.logo.status === 'LOGO_MISSING').length, suspect: rows.filter(r => r.logo.status === 'LOGO_SUSPECT').length };
  return { schema: LOGO_BRIDGE_VERSION, generatedAt, mode: 'PRIVATE_RESEARCH', publicationAllowed: false, providerRequests: 0,
    summary, companyEvidence, rows, constraints: ['EXISTING_ASSETS_ONLY', 'NO_TICKER_ONLY_JOIN', 'NO_DOWNLOADS_OR_ASSET_OVERWRITE', 'COMPANY_IDENTITY_ONLY_NOT_ADR_DATA_TRANSFER'] };
}
export function createCentralLogoResolver(evidence, registry) {
  const approved = new Map(Object.values(evidence.companyEvidence || {}).map(e => e.logo).filter(l => l.status === 'LOGO_VALID').map(l => [l.key, l.asset]));
  return async key => {
    const asset = approved.get(key); if (!asset) return null;
    const inspected = inspectAsset(registry, key);
    if (!inspected.asset || inspected.asset.sha256 !== asset.sha256) return null;
    return inspected.asset;
  };
}
export function writePrivateCompanyLogoEvidence(evidence, directory) {
  if (evidence?.mode !== 'PRIVATE_RESEARCH' || evidence.publicationAllowed !== false) throw Error('PRIVATE_LOGO_EVIDENCE_REQUIRED');
  const root = privateReplayRoot(directory); mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, 'marketstack_europe_central_logo_evidence.json');
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error('SYMLINK_LOGO_OUTPUT');
  const bytes = JSON.stringify(evidence) + '\n'; writeFileSync(path, bytes, { mode: 0o600 });
  return { path, sha256: hash(bytes), bytes: Buffer.byteLength(bytes) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = name => process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value('universe') || !value('out')) throw Error('Usage: europe-company-logos.mjs --universe=/private/universe.json --out=/private/logo-evidence');
  const input = resolve(value('universe')); privateReplayRoot(dirname(input));
  if (lstatSync(input).isSymbolicLink()) throw Error('SYMLINK_UNIVERSE_INPUT');
  const bytes = readFileSync(input), universe = JSON.parse(bytes), registry = readCentralLogoRegistry();
  const evidence = buildEuropeCompanyLogoEvidence(universe, registry);
  evidence.universeSource = { path: input, sha256: hash(bytes), bytes: bytes.length };
  console.log(JSON.stringify({ ...writePrivateCompanyLogoEvidence(evidence, value('out')), summary: evidence.summary, providerRequests: 0 }));
}
