/* Optional presentation contract for a separate Europe readiness population.
 * No scores, rankings, strategy data, provider IO, storage paths or UI wiring.
 * Authenticating producer evidence is a server/resolver responsibility.
 */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Hash=node?require('../engines/hash.js'):g.VUHash;
const VERSION='vu-europe-quant-readiness-1.0.0';
const PROOF_SCHEMA='vu-europe-quant-readiness-proof-1.0.0';
const PRODUCER='scripts/marketstack/europe-fundamentals.mjs#evaluateQuantReadiness';
const PRODUCER_VERSION='marketstack-europe-fundamentals-1.0.0';
const FINANCIAL_POLICY='ESEF_OFFICIAL_FILINGS_PRIMARY_SEC_ACTUAL_FILER_ONLY';
const BINDING=['securityId','listingId','mic','currency'];
const COMPANY_BINDING=['companyId','issuerId','securityId','isin','shareClassId','listingId','mic','listingCurrency'];
const text=v=>typeof v==='string'&&v.trim().length>0;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const timestamp=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const copy=v=>JSON.parse(JSON.stringify(v));
const same=(a,b,keys=BINDING)=>!!a&&!!b&&keys.every(k=>text(a[k])&&a[k]===b[k]);
function bindingValid(b){return b&&text(b.securityId)&&text(b.listingId)&&/^[A-Z0-9]{4}$/.test(b.mic||'')&&/^[A-Z]{3}$/.test(b.currency||'')&&!['XNAS','XNYS','ARCX','XASE','BATS','IEXG'].includes(b.mic);}
async function payloadSha256(payload){
 if(!Hash)throw Error('CANONICAL_HASH_DEPENDENCY_REQUIRED');
 const crypto=node?require('node:crypto').webcrypto:g.crypto;
 if(!crypto?.subtle)throw Error('SECURE_DIGEST_UNAVAILABLE');
 const bytes=new TextEncoder().encode(Hash.canonical(payload));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function result(binding,status,reasons,asOf=null){return {version:VERSION,region:'EUROPE',population:'EUROPE_READINESS',...Object.fromEntries(BINDING.map(k=>[k,binding?.[k]??null])),status,reasons:[...new Set(reasons)],asOf,
 score:null,rank:null,rankingEligible:false,admittedToRanking:false,methodologyChanged:false,usPopulationModified:false,strategyDataProduced:false,pitEligibility:'NOT_CERTIFIED'};}
function official(proof,now){
 if(!proof||proof.verified!==true||!['ESEF','OFFICIAL_FILING','SEC','GLEIF','ESMA_FIRDS','OFFICIAL_EXCHANGE'].includes(proof.kind)||!digest(proof.sha256)||!timestamp(proof.retrievedAt)||Date.parse(proof.retrievedAt)>now)return false;
 try{return new URL(proof.url).protocol==='https:';}catch{return false;}
}
function project(payload,binding,now){
 const i=payload.identity||{},m=i.mapping||{},p=payload.prices||{},t=payload.technical||{},f=payload.fundamentals||{};
 const today=new Date(now).toISOString().slice(0,10),reasons=[];
 const identity=i.version===PRODUCER_VERSION&&i.status==='VERIFIED'&&i.listingIdentityVerified===true&&
  COMPANY_BINDING.every(k=>text(m[k]))&&same({securityId:m.securityId,listingId:m.listingId,mic:m.mic,currency:m.listingCurrency},binding)&&
  Array.isArray(i.provenance)&&i.provenance.length>0&&i.provenance.every(x=>official(x,now));
 const prices=p.version==='marketstack-europe-quality-1'&&p.valid===true&&same(p,binding)&&
  ['CURRENT','LAST_VALID_SESSION'].includes(p.freshness)&&date(p.asOf)&&p.asOf<=today&&p.adjustmentStatus==='ADJUSTMENT_CERTIFIED'&&
  digest(p.seriesSha256)&&p.independentEvidence?.verified===true&&p.independentEvidence?.independent===true&&
  text(p.independentEvidence?.sourceId)&&digest(p.independentEvidence?.sha256)&&p.calendarProof?.verified===true&&
  p.calendarProof.mic===binding.mic&&p.calendarProof.expectedLastCompletedSession===p.asOf&&text(p.calendarProof.sourceId)&&digest(p.calendarProof.sha256);
 const technical=t.version==='marketstack-europe-quality-1'&&t.status==='TECHNICAL_READY'&&same(t,binding)&&t.asOf===p.asOf&&
  t.priceSeriesSha256===p.seriesSha256&&t.engineProjection?.verified===true&&text(t.engineProjection.sourceId)&&text(t.engineProjection.parametersHash)&&
  t.benchmark?.verified===true&&t.benchmark?.region==='EUROPE'&&text(t.benchmark.securityId)&&text(t.benchmark.sourceId)&&digest(t.benchmark.seriesSha256);
 if(!identity)reasons.push('OFFICIAL_LISTING_IDENTITY_NOT_VERIFIED');
 if(!prices)reasons.push('INDEPENDENT_PRICE_PROOF_NOT_READY');
 if(!technical)reasons.push('TECHNICAL_OR_EUROPE_BENCHMARK_PROOF_NOT_READY');
 const identityForFundamentals=f.identity?.mapping||{};
 const financialBound=f.version===PRODUCER_VERSION&&f.sourcePolicy===FINANCIAL_POLICY&&same(m,identityForFundamentals,COMPANY_BINDING)&&
  f.identity?.status==='VERIFIED'&&Array.isArray(f.acceptedFilings)&&f.acceptedFilings.length>0&&f.validFilingCount===f.acceptedFilings.length&&
  date(f.asOf)&&f.asOf<=today&&f.acceptedFilings.every(x=>['ESEF','OFFICIAL_FILING','SEC'].includes(x.source?.kind)&&official(x.source,now)&&
    date(x.periodEnd)&&date(x.availableAt)&&x.periodEnd<=x.availableAt&&x.availableAt<=f.asOf&&x.isin===m.isin&&x.shareClassId===m.shareClassId&&
    (x.source.kind!=='SEC'||payload.actualSecFiler===true&&/^\d{10}$/.test(payload.cik||'')&&x.source.cik===payload.cik&&x.securityBasis==='LOCAL_SHARE_CLASS_VERIFIED'));
 const cert=payload.fundamentalProducerCertificate;
 const certifiedFinancial=financialBound&&cert?.producer==='scripts/marketstack/europe-fundamentals.mjs#evaluateFundamentals'&&cert.version===PRODUCER_VERSION&&
  cert.engine==='fundamental-inputs-1.0.0'&&cert.profile==='GENERIC'&&same(cert,binding)&&digest(cert.evaluatedFundamentalsSha256)&&
  Array.isArray(cert.sourceHashes)&&f.acceptedFilings.every(x=>cert.sourceHashes.includes(x.source.sha256));
 const usable=identity&&prices&&technical;
 const full=usable&&certifiedFinancial&&f.status==='VALIDATED'&&f.engineInputsValid===true&&f.fundamentalsCurrent===true&&f.sharesBasisValid===true&&f.currencyBasisValid===true&&
  Array.isArray(f.missingEngineInputs)&&f.missingEngineInputs.length===0;
 const partial=usable&&financialBound&&f.status==='PARTIAL';
 if(!full)reasons.push(financialBound?'OFFICIAL_FINANCIAL_INPUTS_PARTIAL':'OFFICIAL_FUNDAMENTALS_NOT_READY');
 return result(binding,full?'QUANT_FULL':partial?'QUANT_PARTIAL':usable?'QUANT_TECHNICAL_ONLY':'QUANT_BLOCKED',reasons,p.asOf||null);
}
/** verifyEvidence must independently authenticate the pinned producer and digest;
 * its positive attestation binds exact identity, never just {verified:true}.
 */
async function evaluate(envelope,{verifyEvidence,now=new Date().toISOString(),expectedBinding,protectedIds=[]}={}){
 // Pin every caller-owned input before the first asynchronous boundary. The
 // verifier receives a separate copy and cannot change the projected payload.
 let e,b,protectedSnapshot;
 try{e=copy(envelope);b=copy(expectedBinding||e?.binding||{});protectedSnapshot=copy(protectedIds);}catch{return result({},'QUANT_BLOCKED',['PRODUCER_PROOF_REQUIRED']);}
 const nowMs=Date.parse(now);
 const blocked=reason=>result(b,'QUANT_BLOCKED',[reason]);
 if(!Array.isArray(protectedSnapshot)||!bindingValid(b)||protectedSnapshot.includes(b.securityId)||protectedSnapshot.includes(b.listingId))return blocked('INVALID_OR_PROTECTED_EUROPE_IDENTITY');
 if(!Number.isFinite(nowMs)||!e||e.schema!==PROOF_SCHEMA||e.producer!==PRODUCER||e.producerVersion!==PRODUCER_VERSION||
  !same(e.binding,b)||!timestamp(e.generatedAt)||Date.parse(e.generatedAt)>nowMs||!digest(e.payloadSha256)||!e.payload||typeof verifyEvidence!=='function')return blocked('PRODUCER_PROOF_REQUIRED');
 let sha,attestation;
 try{sha=await payloadSha256(e.payload);if(sha!==e.payloadSha256)return blocked('PROOF_DIGEST_MISMATCH');attestation=copy(await verifyEvidence(copy(e)));}catch{return blocked('PRODUCER_PROOF_UNVERIFIED');}
 if(attestation?.verified!==true||attestation.producer!==PRODUCER||attestation.producerVersion!==PRODUCER_VERSION||attestation.payloadSha256!==sha||!text(attestation.sourceId)||!same(attestation,b))return blocked('PRODUCER_PROOF_UNVERIFIED');
 const cert=e.payload.fundamentalProducerCertificate;
 if(cert&&cert.evaluatedFundamentalsSha256!==await payloadSha256(e.payload.fundamentals))return blocked('FUNDAMENTALS_CERTIFICATE_DIGEST_MISMATCH');
 return project(e.payload,b,nowMs);
}
async function buildPopulation(envelopes,{verifyEvidence,now,protectedIds=[]}={}){
 if(!Array.isArray(envelopes))throw Error('EUROPE_PROOF_ARRAY_REQUIRED');
 envelopes=copy(envelopes);protectedIds=copy(protectedIds);
 if(!Array.isArray(protectedIds))throw Error('EUROPE_PROTECTED_IDS_ARRAY_REQUIRED');
 const securities=new Set(),listings=new Set();
 for(const e of envelopes){const b=e?.binding;if(!bindingValid(b)||securities.has(b.securityId)||listings.has(b.listingId)||protectedIds.includes(b.securityId)||protectedIds.includes(b.listingId))throw Error('DUPLICATE_OR_PROTECTED_EUROPE_IDENTITY');securities.add(b.securityId);listings.add(b.listingId);}
 const rows=await Promise.all(envelopes.map(e=>evaluate(e,{verifyEvidence,now,protectedIds})));
 rows.sort((a,b)=>a.securityId.localeCompare(b.securityId,'en'));
 return {version:VERSION,population:'EUROPE_READINESS',region:'EUROPE',rows,counts:Object.fromEntries(['QUANT_FULL','QUANT_PARTIAL','QUANT_TECHNICAL_ONLY','QUANT_BLOCKED'].map(s=>[s,rows.filter(r=>r.status===s).length])),rankingEligible:false,methodologyChanged:false,usPopulationModified:false};
}
function create(options={}){
 const o={usClient:options.usClient,loadEvidence:options.loadEvidence,verifyEvidence:options.verifyEvidence,now:options.now,protectedIds:copy(options.protectedIds||[])};
 if(!o.usClient)throw Error('EXISTING_US_CLIENT_REQUIRED');
 const usMethods={getQuantData:o.usClient.getQuantData,getRanking:o.usClient.getRanking};
 const us=(method,args)=>{if(typeof usMethods[method]!=='function')throw Error('US_METHOD_UNAVAILABLE');return usMethods[method].apply(o.usClient,args);};
 function getQuantData(ref){
  if(!ref||ref.region!=='EUROPE')return us('getQuantData',arguments);
  const b={securityId:ref.securityId,listingId:ref.listingId,mic:ref.mic,currency:ref.currency};
  return Promise.resolve().then(async()=>{
   if(typeof o.loadEvidence!=='function')return {state:'UNAVAILABLE',reason:'EUROPE_READINESS_SOURCE_MISSING',data:null};
   let e;try{e=await o.loadEvidence(copy(b));}catch{return {state:'UNAVAILABLE',reason:'EUROPE_READINESS_SOURCE_MISSING',data:null};}
   const data=await evaluate(e,{verifyEvidence:o.verifyEvidence,now:o.now,expectedBinding:b,protectedIds:o.protectedIds});
   return {state:'AVAILABLE',reason:null,data};
  });
 }
 function getRanking(ref){if(ref?.region==='EUROPE')return {state:'UNAVAILABLE',reason:'EUROPE_RANKING_NOT_ADMITTED',data:null};return us('getRanking',arguments);}
 return {version:VERSION,getQuantData,getRanking};
}
const api={VERSION,PROOF_SCHEMA,PRODUCER,PRODUCER_VERSION,payloadSha256,evaluate,buildPopulation,create};
if(node)module.exports=api;else g.VUEuropeQuantReadiness=api;
})(typeof window!=='undefined'?window:globalThis);
