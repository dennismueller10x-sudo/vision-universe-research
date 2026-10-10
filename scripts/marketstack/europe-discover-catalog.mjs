/** Private, deterministic identity/close-chart composition; no provider or UI calls. */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { privateReplayRoot } from './europe-private-files.mjs';
const require = createRequire(import.meta.url);
const Core = require('../../core/europe-market-data.js');
const Eligibility = require('../../core/europe-discover-eligibility.js');
const SHA = /^[a-f0-9]{64}$/;
const copy = value => structuredClone(value);
export const sha256 = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
function assert(ok, message) { if (!ok) throw Error(message); }
function unique(rows, key, label) { const map = new Map(); for (const r of rows || []) { const k = r[key]; assert(k && !map.has(k), `DUPLICATE_OR_MISSING_${label}`); map.set(k, r); } return map; }
function privateArtifact(value) { assert(value && value.publicationAllowed === false && ['PRIVATE_RESEARCH','PRIVATE_DISCOVERY'].includes(value.mode), 'PRIVATE_ARTIFACT_REQUIRED'); }
function freshness(p) { return !p?.lastDate ? 'MISSING' : !Number.isInteger(p.sessionLag) ? 'INVALID' : p.sessionLag === 0 ? 'LAST_VALID_SESSION' : p.sessionLag <= 3 ? 'DELAYED' : 'STALE'; }
function checkPoints(p) {
  assert(Array.isArray(p.points) && sha256(p.points) === p.pointsSha256, 'CHART_POINTS_HASH_MISMATCH');
  assert(Array.isArray(p.segments) && JSON.stringify(p.segments.flat()) === JSON.stringify(p.points), 'CHART_SEGMENTS_MISMATCH');
  assert(p.points.length === p.observationCount && (p.points[0]?.[0] ?? null) === (p.firstDate ?? null) && (p.points.at(-1)?.[0] ?? null) === (p.lastDate ?? null), 'CHART_POINTS_EXTENT_MISMATCH');
  let previous = ''; for (const point of p.points) { assert(Array.isArray(point) && point.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(point[0]) && new Date(point[0]).toISOString().slice(0,10) === point[0] && point[0] > previous && Number.isFinite(point[1]) && point[1] > 0, 'INVALID_CLOSE_POINT'); previous = point[0]; }
}
/** Inputs are trusted only after their byte hashes are checked by readFromPaths.
 * Pure callers must supply original chart proof SHA receipts, not derived readiness flags. */
export function buildEuropeDiscoverCatalog({identityArtifact,chartProofs,priorUniverse,priorProjection,protectedIds,sourceBindings,now}) {
  privateArtifact(identityArtifact); privateArtifact(priorUniverse); privateArtifact(priorProjection);
  assert(SHA.test(sourceBindings?.identitySha256 || '') && Number.isFinite(Date.parse(now)), 'PINNED_SOURCE_AND_EVALUATION_REQUIRED');
  assert(Array.isArray(protectedIds) && sourceBindings.protectedIdsSha256 && SHA.test(sourceBindings.protectedIdsSha256), 'CURRENT_PROTECTED_ID_SOURCE_REQUIRED');
  const graph = identityArtifact.knownReferenceGraph; assert(graph, 'KNOWN_REFERENCE_GRAPH_REQUIRED');
  const companies = unique(graph.companies,'companyKey','COMPANY'), securities = unique(graph.securities,'securityId','SECURITY'), listings = unique(graph.listings,'listingKey','LISTING');
  unique(graph.securities,'isin','SECURITY_ISIN');
  const referencedListings=new Set(graph.securities.flatMap(s=>s.listings)); assert(referencedListings.size===listings.size && [...listings.keys()].every(k=>referencedListings.has(k)), 'ORPHAN_OR_DUPLICATE_LISTING_MEMBERSHIP');
  const protectedSet = new Set(protectedIds); for (const id of [...companies.keys(),...securities.keys(),...listings.keys()]) assert(!protectedSet.has(id), 'PROTECTED_ID_COLLISION');
  const previous = unique(priorUniverse.securities,'securityId','PRIOR_SECURITY');
  for (const [id,s] of previous) { assert(securities.get(id)?.isin === s.isin && securities.get(id)?.companyKey === s.companyKey, 'PRIOR_CANONICAL_ID_NOT_PRESERVED'); }
  const oldCatalog = Core.fromFoundation(priorUniverse,{listingEvidence:priorProjection.listingEvidence,companyEvidence:priorProjection.companyEvidence || {},protectedIds});
  const old = unique(oldCatalog.securities,'securityId','OLD_CORE_SECURITY');
  assert(old.size === previous.size, 'PRIOR_STRICT_PROJECTION_INCOMPLETE');
  const proofs = unique(chartProofs,'listingKey','CHART_PROOF');
  const series = [], result = [], counts = {referenceSecurities:securities.size,priorSecurities:old.size,identityReady:0,discoverEligible:0,series:0,blockedIdentity:0};
  for (const [id,s] of securities) {
    const company = companies.get(s.companyKey); assert(s.securityKey===`ISIN:${s.isin}` && company && company.companyId===s.companyKey && company.securities.includes(s.securityKey), 'COMPANY_SECURITY_BINDING_MISMATCH');
    const retained = old.get(id), sec = retained ? copy(retained) : {region:'EUROPE',securityId:id,companyId:s.companyKey,isin:s.isin,shareClassId:s.securityKey,acceptance:'DISCOVER_ONLY',identity:{status:'BLOCKED'},fundamentals:{},logo:{}};
    Object.assign(sec,{name:company.displayName || company.issuerName,legalName:company.legalName ?? null,issuerCountry:company.issuerCountry,issuerIdentityLevel:company.issuerIdentityLevel,securityKey:s.securityKey,shareClassDetail:s.shareClassDetail,canonicalTicker:s.canonicalTicker,primaryListingId:s.primaryListingId || s.primaryListing});
    sec.aliases = [...new Set([...(sec.aliases || []),...(s.aliases || [])])]; sec.listings = [];
    for (const key of s.listings) {
      const a = listings.get(key); assert(a && a.securityId === id && a.companyKey === s.companyKey && a.isin === s.isin && a.listingId === key && key === `marketstack:${a.mic}:${a.providerSymbol}`, 'LISTING_GRAPH_BINDING_MISMATCH');
      const legacy = retained?.listings.find(l => l.listingId === key);
      const l = legacy ? copy(legacy) : {listingId:key,instrumentId:null,history:{valid:false,observations:0},priceQuality:{status:'UNKNOWN'},adjustment:{status:'ADJUSTMENT_UNKNOWN'},corporateActions:{},benchmark:{},technical:{},snapshot:{},provenance:{}};
      Object.assign(l,{ticker:a.providerSymbol,providerSymbol:a.providerSymbol,mic:a.mic,exchange:a.mic,country:a.exchangeCountry || legacy?.country || null,issuerCountry:a.issuerCountry,currency:a.currency ?? null,isPrimary:a.isPrimary,primaryCertification:a.primaryCertification,primarySelectionBasis:a.primarySelectionBasis,aliases:[...new Set([...(a.verifiedAliases || []),s.canonicalTicker].filter(Boolean))]});
      l.identityAdmission = copy(a.admissionProof); assert(l.identityAdmission && l.identityAdmission.securityId === id && l.identityAdmission.companyId === s.companyKey && l.identityAdmission.listingId === key && l.identityAdmission.isin === s.isin && l.identityAdmission.securityKey === s.securityKey && (l.identityAdmission.status==='BLOCKED' || l.identityAdmission.issuerCountry === company.issuerCountry) && l.identityAdmission.mic === a.mic && l.identityAdmission.providerSymbol === a.providerSymbol && l.identityAdmission.currency === (a.currency ?? null), 'IDENTITY_PROOF_BINDING_MISMATCH');
      l.provenance = {...l.provenance,identityArtifactSha256:sourceBindings.identitySha256,identityOriginalCurrency:a.currency ?? null};
      const entry = proofs.get(key); assert(entry && SHA.test(entry.proofSha256), 'CHART_PROOF_RECEIPT_REQUIRED');
      const p = copy(entry.proof), blockedUnbound=l.identityAdmission.status==='BLOCKED' && p?.securityId==null && p?.companyId==null; assert(p && p.publicationAllowed === false && p.listingKey === key && (blockedUnbound || p.securityId === id && p.companyId === s.companyKey) && p.listingId === key && p.mic === a.mic && p.providerSymbol === a.providerSymbol && p.isin === s.isin, 'CHART_CANONICAL_BINDING_MISMATCH');
      if(blockedUnbound){p.chartStatus='CHART_BLOCKED';p.reasonCodes=[...(p.reasonCodes || []),'UNBOUND_CHART_PROOF_FOR_BLOCKED_IDENTITY'];}
      if (p.canonicalBinding) assert(p.canonicalBinding.identitySourceSha256 === sourceBindings.identitySha256 && p.canonicalBinding.originalIdentityFileUnchanged === true, 'CHART_IDENTITY_SOURCE_MISMATCH');
      assert(a.currency == null || p.currency == null || a.currency === p.currency, 'CONFLICTING_CANONICAL_QUOTE_CURRENCY');
      // Only a bound, validated quote proof may fill absent identity currency.
      if (a.currency == null && p.currency != null) {
        const q=p.quoteBasis; assert(/^[A-Z]{3}$/.test(p.currency) && q && ['OFFICIAL_LISTING_QUOTE_REFERENCE','PROVIDER_DOCUMENTED_QUOTE_CONTRACT','PROVIDER_EXPLICIT_QUOTE_CURRENCY'].includes(q.kind) && (q.kind!=='PROVIDER_EXPLICIT_QUOTE_CURRENCY' || SHA.test(q.providerCurrencyObservationSha256 || '') && SHA.test(q.contractSchemaSha256 || '')) && (p.currency!=='GBP' || q.kind==='PROVIDER_DOCUMENTED_QUOTE_CONTRACT' && SHA.test(q.unitContractSha256 || '')) && SHA.test(q.sourceSha256) && q.mic===a.mic && q.providerSymbol===a.providerSymbol && q.isin===s.isin && q.currency===p.currency && q.quoteUnit===p.quoteUnit && p.quoteUnit===p.currency, 'CURRENCY_RESOLUTION_PROOF_REQUIRED');
        l.currency=p.currency; l.identityAdmission.currency=p.currency; l.provenance.quoteResolution=copy(q);
      }
      // No range can be served from a range summary without its complete series proof.
      delete p.ranges; delete p.rangeProofs; p.evidenceRef={sha256:entry.proofSha256,verified:true};
      const compact=copy(p); for (const field of ['points','pointRecords','pointSourceBindings','rejectedRows','rejectedObservations','excludedQuarantineDates','sourceBindings']) delete compact[field];
      l.discoverChart=compact;
      const oldLatest=legacy?.latest, lastDate=p.lastDate || null;
      l.latest={date:lastDate,status:freshness(p),volume:oldLatest?.date===lastDate && legacy?.priceQuality?.status==='VALIDATED' && legacy.priceQuality.evidenceRef ? oldLatest.volume ?? null : null};
      l.provenance.strictEvidenceAsOf=priorProjection.generatedAt;
      if (legacy && (oldLatest?.date!==lastDate || legacy.currency!==l.currency)) {
        l.strictHistoricalEvidence={latest:copy(legacy.latest),history:copy(legacy.history),priceQuality:copy(legacy.priceQuality),adjustment:copy(legacy.adjustment),corporateActions:copy(legacy.corporateActions),benchmark:copy(legacy.benchmark),technical:copy(legacy.technical),sourceProjectionSha256:sourceBindings.priorProjectionSha256 || null};
        l.history={valid:false,observations:0,reasonCodes:['CURRENT_CLOSE_ONLY_OUTSIDE_PRIOR_STRICT_BASIS']};
        l.priceQuality={status:'UNKNOWN',reasonCodes:['CURRENT_CLOSE_ONLY_OUTSIDE_PRIOR_STRICT_BASIS']};
      }
      const admission = Eligibility.evaluate(sec,l,now,'1Y');
      if (admission.UNIVERSE_IDENTITY_READY) counts.identityReady++; else counts.blockedIdentity++;
      if (admission.DISCOVER_ELIGIBLE) counts.discoverEligible++;
      l.discoverReadiness = admission;
      if (admission.CHART !== 'CHART_BLOCKED' && admission.UNIVERSE_IDENTITY_READY) {
        checkPoints(p);
        series.push({securityId:id,listingId:key,range:'1Y',basis:'RAW_UNADJUSTED',currency:l.currency,quoteUnit:p.quoteUnit,points:copy(p.points),segments:copy(p.segments),sessionContinuity:'SEGMENTED',provenance:{evidenceRef:entry.proofSha256,identityArtifactSha256:sourceBindings.identitySha256,sourceInputSha256:p.sourceInputSha256,immutableExclusionsSha256:p.immutableExclusionsSha256,quoteBasis:copy(p.quoteBasis),calendarProof:copy(p.calendarProof)}});
      }
      sec.aliases=[...new Set(sec.aliases.concat(l.aliases))]; sec.listings.push(l);
    }
    assert(sec.listings.some(l=>l.listingId===sec.primaryListingId), 'PRIMARY_LISTING_UNRESOLVED');
    const primary=sec.listings.find(l=>l.listingId===sec.primaryListingId); sec.ticker=primary.providerSymbol;
    if (!Eligibility.identity(sec,primary).ready) sec.identity={status:'BLOCKED'};
    result.push(sec);
  }
  counts.series=series.length;
  return {catalog:{schema:'europe-discover-core-catalog-1',generatedAt:now,mode:'PRIVATE_RESEARCH',publicationAllowed:false,noProviderCalls:true,companies:copy(graph.companies),securities:result,counts},series,sourceBindings:copy(sourceBindings)};
}
export async function buildEuropeDiscoverCatalogAsync(inputs) { return buildEuropeDiscoverCatalog(inputs); }
function readPinned(file, expected) {
  assert(SHA.test(expected || ''), 'INPUT_SHA_REQUIRED'); privateReplayRoot(file);
  for (let p=resolve(file);;p=dirname(p)) { assert(!lstatSync(p).isSymbolicLink(),'INPUT_SYMLINK_REFUSED'); if (dirname(p)===p) break; }
  assert(lstatSync(file).isFile(),'REGULAR_INPUT_REQUIRED'); const bytes=readFileSync(file); assert(sha256(bytes)===expected,'INPUT_SHA_MISMATCH'); return JSON.parse(bytes);
}
/** All input paths and original byte hashes are explicit; no directory discovery or writes. */
export function readEuropeDiscoverCatalogFromPaths(config) {
  const identityArtifact=readPinned(config.identity.path,config.identity.sha256);
  const manifest=readPinned(config.prior.manifest.path,config.prior.manifest.sha256);
  assert(manifest.publicationAllowed===false,'PRIVATE_PRIOR_MANIFEST_REQUIRED');
  unique(manifest.files,'name','PRIOR_MANIFEST_FILE');
  const getPrior=name=>{const row=manifest.files.find(r=>r.name===name);assert(row,'PRIOR_ARTIFACT_NOT_MANIFESTED');return readPinned(resolve(config.prior.directory,name),row.sha256);};
  const priorUniverse=getPrior('marketstack_europe_equity_universe.json'), priorProjection=getPrior('marketstack_europe_core_projection.json');
  assert(identityArtifact.sourceBindings?.priorIdentity?.sha256===manifest.files.find(r=>r.name==='marketstack_europe_equity_universe.json').sha256,'IDENTITY_PRIOR_UNIVERSE_SOURCE_MISMATCH');
  assert(identityArtifact.sourceBindings?.protectedIdentitySources?.some(r=>r.sha256===config.protectedIds.sha256),'IDENTITY_CURRENT_PROTECTION_SOURCE_MISMATCH');
  const protectedSource=readPinned(config.protectedIds.path,config.protectedIds.sha256);
  const chartManifest=readPinned(config.chartManifest.path,config.chartManifest.sha256);
  const chartSummary=readPinned(config.chartSummary.path,config.chartSummary.sha256);
  assert(chartSummary.publicationAllowed===false && chartSummary.noProviderCalls===true,'PRIVATE_CHART_SUMMARY_REQUIRED');
  const manifestRows=unique(chartManifest.files.map(r=>({...r,proofSha256:r.proofSha256 ?? r.sha256,proofPath:r.proofPath ?? r.path})),'listingKey','CHART_MANIFEST'), summaryRows=unique(chartSummary.rows,'listingKey','CHART_SUMMARY');
  assert(manifestRows.size===summaryRows.size && manifestRows.size===identityArtifact.candidates.length,'CHART_SUMMARY_COVERAGE_MISMATCH');
  const wanted=new Set(identityArtifact.knownReferenceGraph.listings.map(l=>l.listingKey)); const chartProofs=[];
  for (const [key,row] of manifestRows) {
    assert(summaryRows.get(key)?.proofSha256===row.proofSha256,'CHART_SUMMARY_PROOF_MISMATCH');
    if (wanted.has(key)) chartProofs.push({listingKey:key,proofSha256:row.proofSha256,proof:readPinned(row.proofPath,row.proofSha256)});
  }
  return buildEuropeDiscoverCatalog({identityArtifact,chartProofs,priorUniverse,priorProjection,protectedIds:protectedSource.securityIds,now:config.now,sourceBindings:{identitySha256:config.identity.sha256,priorManifestSha256:config.prior.manifest.sha256,priorUniverseSha256:manifest.files.find(r=>r.name==='marketstack_europe_equity_universe.json').sha256,priorProjectionSha256:manifest.files.find(r=>r.name==='marketstack_europe_core_projection.json').sha256,protectedIdsSha256:config.protectedIds.sha256,chartManifestSha256:config.chartManifest.sha256,chartSummarySha256:config.chartSummary.sha256,inputPaths:{identity:copy(config.identity),prior:copy(config.prior),protectedIds:copy(config.protectedIds),chartManifest:copy(config.chartManifest),chartSummary:copy(config.chartSummary)},noProviderCalls:true,publicationAllowed:false}});
}
