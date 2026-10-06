import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const Identity = require('../../core/identity.js');
export const INDEXES = ['DAX', 'MDAX', 'SDAX', 'TECDAX', 'EURO_STOXX_50'];

export function validISIN(value) {
  return !!Identity.normalizeISIN(value);
}

/** One reviewed current-core corporate REIT class. Preserve its real CFI;
 * a cash-stock type never globally converts category-C fund instruments into shares. */
function reviewedCoreShareClass(candidate,member,sources,asOf){
 if(member.isin!=='DE000A3H2333'||candidate.mic!=='XETR')return {};
 const e=candidate.securityEvidence,c=candidate.companyReference,issuer=c?.evidence;
 const t7=(candidate.mappingSourceIds||[]).map(id=>sources.get(id)).find(s=>s?.type==='OFFICIAL_EXCHANGE_T7_INSTRUMENT_REFERENCE'&&s.referenceDate===asOf&&/^[a-f0-9]{64}$/.test(s.sha256||''));
 const cfi=(candidate.regulatorySourceIds||[]).map(id=>sources.get(id)).find(s=>s?.type==='REGULATORY_CFI_FACET_REFERENCE'&&s.sha256===e?.responseSHA256&&s.referenceDate<=asOf&&/^https:\/\/registers[.]esma[.]europa[.]eu\/solr\/esma_registers_firds\/select[?]/.test(s.url||''));
 const proven=member.indexMemberships.includes('SDAX')&&candidate.officialActive===true&&candidate.officialInstrumentType==='CS'&&candidate.quotationUnit==='Shares'&&candidate.localTicker==='HABA'&&candidate.tradingCurrency==='EUR'&&
  c?.lei==='529900EJTD8IR1GN0P96'&&c.basis==='EXACT_GLEIF_ISIN_LEI_REFERENCE'&&issuer?.leiRecordURL==='https://api.gleif.org/api/v1/lei-records/'+c.lei&&/^[a-f0-9]{64}$/.test(issuer.leiBatchResponseSHA256||'')&&
  e?.cfiCodes?.length===1&&e.cfiCodes[0]==='CBCJXS'&&e.isin===member.isin&&e.issuerLEI===c.lei&&!!t7&&!!cfi;
 if(!proven)return {classificationReviewStatus:'BLOCKED',classificationReviewCause:'MISSING_LOCAL_CORPORATE_REIT_CLASS_PROOF'};
 return {shareClass:'LOCAL_CORPORATE_REIT_SHARE',originalShareClass:candidate.shareClass,classificationReviewStatus:'READY',
  shareClassBasis:'REVIEWED_MANDATORY_CORE_CORPORATE_REIT_OFFICIAL_CS_SHARES_AND_EXACT_ISSUER',
  classificationEvidence:{isin:member.isin,mic:'XETR',issuerLEI:c.lei,officialInstrumentType:'CS',quotationUnit:'Shares',indexMembership:'SDAX',referenceDate:asOf,
   officialSource:{url:t7.url,sha256:t7.sha256,referenceDate:t7.referenceDate},regulatorySource:{url:cfi.url,sha256:cfi.sha256,referenceDate:cfi.referenceDate},originalCFICodes:e.cfiCodes,
   scope:'NAMED_LOCAL_CORE_CLASS_ONLY_NOT_GLOBAL_CFI_OR_PROVIDER_ASSET_TYPE_OVERRIDE'}};
}
/** Membership and listing/issuer identity are separate. Source countries are
 * never converted into domicile, currency, provider ticker, or canonical IDs. */
export function buildReference(input, identity = Identity) {
  if (!input.asOf || !Array.isArray(input.indexes)) throw new Error('INVALID_REFERENCE_INPUT');
  const sources = new Map(input.sources.map(s => [s.id, s]));
  const members = new Map();
  const indexes = INDEXES.map(index => {
    const row = input.indexes.find(r => r.index === index);
    if (!row) return { index, expectedMembers: null, observedMembers: 0, referenceCompleteness: 'REFERENCE_UNRESOLVED', missingReferenceCount: null, memberISINs: [] };
    if (row.effectiveDate && row.effectiveDate > input.asOf) throw new Error(`FUTURE_MEMBERSHIP_NOT_EFFECTIVE:${index}`);
    for (const id of row.sourceIds) if (!sources.has(id)) throw new Error(`UNKNOWN_REFERENCE_SOURCE:${id}`);
    const seen = new Set();
    for (const m of row.members) {
      if (!validISIN(m.isin)) throw new Error(`INVALID_ISIN:${index}:${m.isin}`);
      if (seen.has(m.isin)) throw new Error(`DUPLICATE_INDEX_SHARE_CLASS:${index}:${m.isin}`);
      seen.add(m.isin);
      let target = members.get(m.isin);
      if (!target) {
        target = { name: m.name, isin: m.isin, indexMemberships: [], aliases: [], referenceEvidence: [], referenceStatus: 'READY', companyId: null };
        members.set(m.isin, target);
      }
      target.indexMemberships.push(index);
      if (!target.aliases.includes(m.name)) target.aliases.push(m.name);
      if (m.officialName && !target.aliases.includes(m.officialName)) target.aliases.push(m.officialName);
      target.referenceEvidence.push({ index, sourceIds: row.sourceIds, membershipSourceId: m.membershipSourceId || row.sourceIds[0], isinSourceId: m.isinSourceId || row.sourceIds[0], memberURL: m.memberURL || null, officialName: m.officialName || null, indexCountry: m.indexCountry || null, referenceDate: row.referenceDate, effectiveDate: row.effectiveDate || null, sourceReportedISIN: m.sourceReportedISIN || null, identityChangeEvidence: m.identityChangeEvidence || null });
      if (row.referenceConflicts?.length) target.referenceStatus = 'PARTIAL';
    }
    return { ...row, members: undefined, observedMembers: seen.size, missingReferenceCount: Math.max(0, row.expectedMembers - seen.size), referenceCompleteness: seen.size < row.expectedMembers ? 'REFERENCE_UNRESOLVED' : row.referenceCompleteness, memberISINs: [...seen].sort() };
  });
  const ordered = [...members.values()].sort((a, b) => a.isin.localeCompare(b.isin));
  const candidates = new Map(input.listingCandidates.map(c => [c.isin, c]));
  const listings = ordered.map(member => {
    const candidate = candidates.get(member.isin);
    if (!candidate) return { ...member, listingId: null, securityId: null, companyId: null, mappingStatus: 'BLOCKED', cause: 'MAPPING_ERROR', reason: 'No evidence-backed local listing candidate.', providerVerified: false };
    const officialListingVerified = candidate.officialActive === true && candidate.mic === 'XETR' && Boolean(candidate.localTicker && candidate.tradingCurrency);
    // Historical exact-ISIN/MIC metadata is reusable evidence, but cannot assert
    // current provider identity, price freshness, or publication permission.
    const historicalListingVerified = Boolean(candidate.providerSymbol && candidate.mic && candidate.tradingCurrency && candidate.providerIdentityBasis.startsWith('HISTORICAL_EXACT_ISIN_MIC'));
    const verified = officialListingVerified || historicalListingVerified;
    const sourceIds = candidate.mappingSourceIds || [];
    if (verified && !sourceIds.length) throw new Error(`MISSING_MAPPING_SOURCE:${member.isin}`);
    let securityId = null, listingId = null;
    if (verified && typeof identity.securityIdForISIN === 'function') securityId = identity.securityIdForISIN(member.isin);
    if (verified && typeof identity.listingIdFor === 'function') listingId = identity.listingIdFor({ isin: member.isin, mic: candidate.mic });
    const companyId = candidate.companyReference?.lei && typeof identity.companyIdForLEI === 'function' ? identity.companyIdForLEI(candidate.companyReference.lei) : null;
    return { ...member, ...candidate, ...reviewedCoreShareClass(candidate,member,sources,input.asOf), indexMemberships: member.indexMemberships, aliases: member.aliases, referenceEvidence: member.referenceEvidence, referenceStatus: member.referenceStatus,
      securityId, listingId, companyId, ticker: candidate.localTicker, exchange: candidate.mic, currency: candidate.tradingCurrency,
      assetType: 'EQUITY', quoteUnit: candidate.tradingCurrency === 'EUR' && verified ? 'MAJOR' : null, quoteUnitBasis: candidate.tradingCurrency === 'EUR' && verified ? 'VERIFIED_LISTING_CURRENCY_EUR_NO_MINOR_UNIT_CURRENCY' : 'UNRESOLVED',
      mappingStatus: verified ? 'VERIFIED' : 'BLOCKED', mappingSource: sourceIds,
      listingVerification: officialListingVerified ? 'VERIFIED_OFFICIAL_LISTING' : historicalListingVerified ? 'HISTORICAL_EXACT_ISIN_MIC_LISTING' : 'UNRESOLVED',
      providerVerified: false, providerStatus: candidate.providerSymbol ? 'HISTORICAL_METADATA_REVALIDATION_REQUIRED' : 'PROVIDER_SYMBOL_UNRESOLVED',
      identityStatus: securityId && listingId ? 'READY' : 'CANONICAL_IDENTITY_NOT_IMPLEMENTED',
      cause: verified ? null : (candidate.mappingCause || 'MAPPING_ERROR'), reason: candidate.mappingReason,
      priceRelease: 'NOT_GRANTED', historicalIDsImported: false };
  });
  const companyIds = new Set(listings.map(r => r.companyReference?.lei).filter(Boolean));
  const common = { schemaVersion: 'de-eu-reference-1.0.0', generatedAt: input.frozenAt, asOf: input.asOf, selectionSemantics: input.selectionSemantics, sources: input.sources };
  return {
    reference: { ...common, indexes, members: ordered, counts: { targetShareClasses: ordered.length, referenceMemberships: ordered.reduce((n, r) => n + r.indexMemberships.length, 0) } },
    listingMap: { ...common, schemaVersion: 'de-eu-listing-map-1.0.0', listings, counts: { targetShareClasses: ordered.length, verifiedLocalListings: listings.filter(r => r.mappingStatus === 'VERIFIED').length, providerCandidates: listings.filter(r => r.providerSymbol).length, currentProviderVerified: 0, evidenceLinkedCompanies: companyIds.size, unresolvedCompanyShareClasses: listings.filter(r => !r.companyReference?.lei).length }, limitations: ['Provider metadata from 2026-10-01 requires quote-response validation.', 'No course series, old canonical IDs, current EOD certification, or product artifacts are imported.', 'Current selection reference is not a historical PIT index universe.'] }
  };
}

export function run(argv = process.argv.slice(2)) {
  const option = key => { const ix = argv.indexOf(key); return ix < 0 ? argv.find(a => a.startsWith(key + '='))?.slice(key.length + 1) : argv[ix + 1]; };
  const out = option('--out');
  if (!out) throw new Error('EXPLICIT_OUT_REQUIRED');
  assertPrivateOutput(out,{allowCache:true});
  if (!option('--source')) throw new Error('EXPLICIT_PRIVATE_REFERENCE_SOURCE_REQUIRED');
  const sourcePath = resolve(option('--source'));
  const input = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const { reference, listingMap } = buildReference(input);
  rejectSymlinkAncestors(resolve(out,'de_eu_reference_universe.json'));
  rejectSymlinkAncestors(resolve(out,'de_eu_listing_map.json'));
  mkdirSync(resolve(out), { recursive: true });
  writeFileSync(resolve(out, 'de_eu_reference_universe.json'), JSON.stringify(reference, null, 2) + '\n');
  writeFileSync(resolve(out, 'de_eu_listing_map.json'), JSON.stringify(listingMap, null, 2) + '\n');
  return { ...reference.counts, ...listingMap.counts };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(run())); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
