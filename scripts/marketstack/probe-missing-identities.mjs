/** Bounded metadata-only probe. Candidates never authorize prices by themselves. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createSharedBudget} from '../market/marketstack-budget.mjs';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
const require=createRequire(import.meta.url),Identity=require('../../core/identity.js'),Client=require('../../providers/marketstack/client.js'),Adapter=require('../../providers/marketstack/adapter.js');
export const MAX_IDENTITY_TARGETS=12,MAX_IDENTITY_CANDIDATES=20;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=code=>{throw Error(code);};
const validSymbol=s=>typeof s==='string'&&/^[A-Z0-9][A-Z0-9.-]{0,39}$/.test(s)&&!s.includes('..');
const validMIC=s=>typeof s==='string'&&/^[A-Z0-9]{4}$/.test(s);
const EUROPEAN_MICS=new Set(['XETR','XFRA','XAMS','XPAR','XBRU','XHEL','XLON','XSWX','XSTO','XCSE','XOSL','XMAD','XMIL','XWBO','XLIS']);
const shareClasses=new Set(['COMMON_SHARE','ORDINARY_SHARE','REGISTERED_ORDINARY_SHARE','PREFERRED_SHARE','LOCAL_CORPORATE_REIT_SHARE']);
const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function independentSource(source,asOf){
 if(!source||typeof source.sourcePath!=='string'||!source.sourcePath.trim()||!/^[a-f0-9]{64}$/.test(source.sourceHash||'')||!date(source.referenceDate)||!date(asOf)||source.referenceDate>asOf)return false;
 try{const url=new URL(source.sourceURL);return url.protocol==='https:'&&!/(^|\.)marketstack\.com$/.test(url.hostname);}catch{return false;}
}
function classSource(ref,row,asOf){const source=ref.shareClassSource;return source?.isin===row.isin&&source.mic===ref.preferredMIC&&source.shareClass===(ref.shareClass||row.shareClass)&&independentSource(source,asOf);}
function scopedREITSource(ref,row,asOf){
 const e=ref.classificationEvidence,valid=s=>s&&/^https:\/\//.test(s.url||'')&&/^[a-f0-9]{64}$/.test(s.sha256||'')&&date(s.referenceDate)&&s.referenceDate<=asOf;
 let issuer;try{issuer=Identity.companyIdForLEI(e?.issuerLEI);}catch{return false;}
 return classSource(ref,row,asOf)&&e?.isin===row.isin&&e.mic===ref.preferredMIC&&row.referencedIssuerId===issuer&&e.officialInstrumentType==='CS'&&e.quotationUnit==='Shares'&&Array.isArray(e.originalCFICodes)&&e.originalCFICodes.includes('CBCJXS')&&valid(e.officialSource)&&valid(e.regulatorySource)&&e.scope==='NAMED_LOCAL_CORE_CLASS_ONLY_NOT_GLOBAL_CFI_OR_PROVIDER_ASSET_TYPE_OVERRIDE';
}
export function planIdentityProbe(listingMap){
 const references=listingMap?.identityProbe;
 if(listingMap?.schemaVersion!=='de-eu-listing-map-1.0.0'||!Array.isArray(listingMap.listings)||references?.privateDevelopment!==true||references?.publicDisplay!==false||!Array.isArray(references.listings)||references.listings.length<1||references.listings.length>MAX_IDENTITY_TARGETS)fail('FROZEN_IDENTITY_PROBE_REQUIRED');
 const targets=[],seen=new Set();
 for(const ref of references.listings){
  const isin=Identity.normalizeISIN(ref.isin);
  if(!isin||seen.has(isin)||ref.currentOfficialListing!==true||!EUROPEAN_MICS.has(ref.preferredMIC)||!validSymbol(ref.officialLocalTicker))fail('IDENTITY_PROBE_REFERENCE_INVALID');
  if(ref.shareClass&&!(ref.shareClass==='UNKNOWN'&&ref.frozenProviderCandidates!==undefined)&&(!shareClasses.has(ref.shareClass)||!ref.shareClassSource))fail('IDENTITY_PROBE_SHARE_CLASS_SOURCE_REQUIRED');
  seen.add(isin);const row=listingMap.listings.find(r=>r.isin===isin&&r.mic===ref.preferredMIC);
  if(!row||row.securityId!==Identity.securityIdForISIN(isin)||row.listingId!==Identity.listingIdFor({isin,mic:row.mic})||typeof row.shareClass!=='string')fail('IDENTITY_PROBE_TARGET_NOT_CANONICAL');
  const explicit=ref.frozenProviderCandidates!==undefined,asOf=listingMap.asOf;
  if(ref.preferredMIC!=='XETR'&&!explicit)fail('EXPLICIT_EUROPEAN_CANDIDATES_REQUIRED');
  const referenceClass=ref.shareClass||row.shareClass;
  if(explicit&&referenceClass!=='UNKNOWN'&&(!shareClasses.has(referenceClass)||!classSource(ref,row,asOf)))fail('IDENTITY_PROBE_SHARE_CLASS_SOURCE_REQUIRED');
  if(referenceClass==='LOCAL_CORPORATE_REIT_SHARE'&&!scopedREITSource(ref,row,asOf))fail('IDENTITY_PROBE_SCOPED_REIT_SOURCE_REQUIRED');
  const candidates=[],keys=new Set(),add=(symbol,mic,source,priorStatus,referenceEvidence)=>{
   if(!validSymbol(symbol)||!validMIC(mic)||!EUROPEAN_MICS.has(mic))fail('IDENTITY_PROBE_CANDIDATE_INVALID');
   const key=symbol+'@'+mic;if(keys.has(key))return;keys.add(key);
   candidates.push({symbol,mic,source,priorStatus:priorStatus||null,providerVerified:false,...(referenceEvidence?{referenceEvidence}:{})});
  };
  // A suffix is a request candidate only. Exact provider response identity must
  // still corroborate it; no inferred symbol becomes a published mapping.
  if(explicit){
   if(!Array.isArray(ref.frozenProviderCandidates)||!ref.frozenProviderCandidates.length||ref.frozenProviderCandidates[0].mic!==ref.preferredMIC||ref.exactCachedProviderCandidates?.length)fail('FROZEN_PROVIDER_CANDIDATES_REQUIRED');
   for(const candidate of ref.frozenProviderCandidates){
    const e=candidate.referenceEvidence;
    if(candidate.referenceVerified!==true||e?.isin!==isin||e.mic!==candidate.mic||!independentSource(e,asOf))fail('FROZEN_PROVIDER_CANDIDATE_REFERENCE_REQUIRED');
    add(candidate.providerSymbol,candidate.mic,'FROZEN_REFERENCE_UNVERIFIED_PROVIDER_CANDIDATE',candidate.metadataStatus,e);
   }
  }else{
   add(ref.officialLocalTicker+'.DE',ref.preferredMIC,'CURRENT_OFFICIAL_LOCAL_TICKER_UNVERIFIED_PROVIDER_CANDIDATE');
   for(const candidate of ref.exactCachedProviderCandidates||[]){if(!['XETR','XFRA'].includes(candidate.mic))fail('EXPLICIT_EUROPEAN_CANDIDATES_REQUIRED');add(candidate.providerSymbol,candidate.mic,'EXACT_CACHED_CANDIDATE_REQUIRES_CURRENT_RESPONSE',candidate.metadataStatus);}
  }
  targets.push({reference:ref,row,candidates,...(explicit||referenceClass==='LOCAL_CORPORATE_REIT_SHARE'?{probeAsOf:asOf}:{})});
 }
 const candidateCount=targets.reduce((n,t)=>n+t.candidates.length,0);
 if(candidateCount>MAX_IDENTITY_CANDIDATES)fail('IDENTITY_PROBE_CANDIDATE_LIMIT');
 return {targets,candidateCount,selectionHash:hash(references)};
}
export function verifyIdentityResponse(body,target,candidate){
 if(Array.isArray(body)&&body.length===0)return {accepted:false,cause:'UNSUPPORTED_LISTING',reason:'EMPTY_PROVIDER_METADATA'};
 const row=body?.data||body;
 if(Array.isArray(row)&&row.length===0)return {accepted:false,cause:'UNSUPPORTED_LISTING',reason:'EMPTY_PROVIDER_METADATA'};
 if(!row||typeof row!=='object'||Array.isArray(row))return {accepted:false,cause:'PROVIDER_DATA_DEFECT',reason:'INVALID_METADATA_RESPONSE'};
 if((row.symbol||row.ticker)!==candidate.symbol)return {accepted:false,cause:'MAPPING_ERROR',reason:'RESPONSE_SYMBOL_MISMATCH'};
 if(!row.isin||Identity.normalizeISIN(row.isin)!==target.row.isin)return {accepted:false,cause:'MAPPING_ERROR',reason:row.isin?'RESPONSE_ISIN_MISMATCH':'RESPONSE_ISIN_MISSING'};
 const exchanges=Array.isArray(row.stock_exchanges)?row.stock_exchanges:row.stock_exchange?[row.stock_exchange]:[];
 if(!exchanges.some(e=>(e.mic||e.exchange_mic)===candidate.mic))return {accepted:false,cause:'MAPPING_ERROR',reason:'RESPONSE_MIC_MISMATCH'};
 const type=Adapter.assetType(row.item_type||row.asset_type);
 const referenceClass=target.reference.shareClass||target.row.shareClass;
 const verifiedClass=(!target.reference.frozenProviderCandidates||referenceClass==='UNKNOWN'||classSource(target.reference,target.row,target.probeAsOf))&&(referenceClass!=='LOCAL_CORPORATE_REIT_SHARE'||scopedREITSource(target.reference,target.row,target.probeAsOf));
 const expected=!verifiedClass?null:referenceClass==='PREFERRED_SHARE'?'preferred_equity':['COMMON_SHARE','ORDINARY_SHARE','REGISTERED_ORDINARY_SHARE','LOCAL_CORPORATE_REIT_SHARE'].includes(referenceClass)?'equity':null;
 if(!type)return {accepted:false,cause:'MAPPING_ERROR',reason:'RESPONSE_SHARE_CLASS_MISMATCH'};
 if(!expected)return {accepted:false,identityMatched:true,providerAssetType:type,cause:'MAPPING_ERROR',reason:'OFFICIAL_SHARE_CLASS_UNRESOLVED'};
 if(type!==expected&&!(expected==='preferred_equity'&&type==='equity'))return {accepted:false,cause:'MAPPING_ERROR',reason:'RESPONSE_SHARE_CLASS_MISMATCH'};
 return {accepted:true,resolutionStatus:candidate.mic===target.row.mic&&candidate.symbol===(target.reference.frozenProviderCandidates?.[0]?.providerSymbol||target.reference.officialLocalTicker+'.DE')?'FOUND':'ALIAS_RESOLVED'};
}
export function classifyMetadataFailure(response){
 return {accepted:false,cause:['authError','quotaExceeded','entitlementRestricted'].includes(response.reason)?'ENTITLEMENT_BLOCKED':response.status===404||response.reason==='dataUnavailable'?'UNSUPPORTED_LISTING':'PROVIDER_DATA_DEFECT',reason:response.status===404?'PROVIDER_SYMBOL_NOT_FOUND':response.reason};
}
export function identityResolution(attempts,accepted=null,terminalReason=null){
 if(accepted)return {resolutionStatus:accepted.resolutionStatus,cause:null};
 if(terminalReason)return {resolutionStatus:'IDENTITY_UNRESOLVED',cause:'ENTITLEMENT_BLOCKED'};
 if(attempts.length&&attempts.every(a=>a.cause==='UNSUPPORTED_LISTING'))return {resolutionStatus:'NOT_SUPPORTED',cause:'UNSUPPORTED_LISTING'};
 return {resolutionStatus:'IDENTITY_UNRESOLVED',cause:attempts.find(a=>a.cause==='MAPPING_ERROR')?.cause||attempts.find(a=>a.cause==='PROVIDER_DATA_DEFECT')?.cause||attempts.at(-1)?.cause||'MAPPING_ERROR'};
}
export async function probeIdentity({listingMap,accountEvidence,privateDir,asOf,runId,clientFactory,now=Date.now}={}){
 assertPrivateOutput(privateDir,{allowCache:true});
 if(listingMap?.asOf!==asOf||!/^\d{4}-\d{2}-\d{2}$/.test(asOf||''))fail('FIXED_IDENTITY_PROBE_AS_OF_REQUIRED');
 const plan=planIdentityProbe(listingMap);
 if(plan.targets.some(t=>t.probeAsOf)&&(!accountEvidence||accountEvidence.kind!=='USER_AUTHORIZED_BOUNDED_RUN'||accountEvidence.referenceHash!==hash(listingMap)))fail('IDENTITY_PROBE_AUTHORIZATION_REFERENCE_MISMATCH');
 const budget=createSharedBudget({file:join(privateDir,'shared-budget.json'),runId,evidence:accountEvidence,now});
 const opening=await budget.status();if(opening.creditsRemaining<plan.candidateCount)fail('IDENTITY_PROBE_BUDGET_INSUFFICIENT');
 const write=(p,value)=>{rejectSymlinkAncestors(p);mkdirSync(resolve(p,'..'),{recursive:true,mode:0o700});writeFileSync(p,JSON.stringify(value)+'\n',{mode:0o600});};
 let sourceHashes=[],sourceStatuses=[];const onResponse=async response=>{const id=hash(response);write(join(privateDir,'source',id+'.json'),response);sourceHashes.push(id);sourceStatuses.push(response.status);};
 const options={sharedBudget:budget,maxRequests:MAX_IDENTITY_CANDIDATES,maxCredits:MAX_IDENTITY_CANDIDATES,maxRetries:0,onResponse};
 const client=clientFactory?clientFactory(options):Client.createMarketstackClient(options);
 const results=[],mappingDelta=[];let terminalReason=null;
 for(const target of plan.targets){
  const attempts=[];let accepted=null;
  for(const candidate of target.candidates){
   if(terminalReason)break;
   sourceHashes=[];sourceStatuses=[];const response=await client.request('/tickers/'+encodeURIComponent(candidate.symbol));
   const check=response.ok?verifyIdentityResponse(response.data,target,candidate):classifyMetadataFailure(response);
   attempts.push({...candidate,...check,sourceHashes:sourceHashes.slice(),httpStatus:response.status??sourceStatuses.at(-1)??null,apiVersion:'v2',endpoint:'/tickers/'+candidate.symbol});
   if(['authError','quotaExceeded','entitlementRestricted','SHARED_BUDGET_EXCEEDED'].includes(response.reason)){terminalReason=response.reason;break;}
   if(check.accepted){
    const sameListing=candidate.mic===target.row.mic;
    accepted={targetListingId:target.row.listingId,securityId:target.row.securityId,listingId:Identity.listingIdFor({isin:target.row.isin,mic:candidate.mic}),isin:target.row.isin,providerSymbol:candidate.symbol,mic:candidate.mic,shareClass:target.reference.shareClass||target.row.shareClass,resolutionStatus:check.resolutionStatus,mappingStatus:'VERIFIED_IDENTITY_ONLY',providerIdentityBasis:'CURRENT_EXACT_RESPONSE_ISIN_MIC',mappingSource:['sha256:'+sourceHashes.at(-1)],shareClassSource:target.reference.shareClassSource||target.row.mappingSource||null,...((target.reference.shareClass||target.row.shareClass)==='LOCAL_CORPORATE_REIT_SHARE'?{classificationEvidence:target.reference.classificationEvidence}:{}),listingSelection:sameListing?'PRIMARY':'VERIFIED_ALTERNATIVE',tradingCurrency:sameListing?target.row.tradingCurrency:null,currencyStatus:sameListing?'EXISTING_INDEPENDENT_LISTING_BASIS':'ALTERNATIVE_LISTING_CURRENCY_UNVERIFIED',priceHistoryAdmitted:false};
    mappingDelta.push(accepted);break;
   }
   if(check.identityMatched)break;
  }
  results.push({targetListingId:target.row.listingId,name:target.reference.name,isin:target.row.isin,status:accepted?'READY':attempts.some(a=>a.identityMatched)?'PARTIAL':terminalReason?'NOT_TESTED':'BLOCKED',...identityResolution(attempts,accepted,terminalReason),attempts,nextStep:accepted?'Independently verify the selected listing currency and quote basis before price admission.':attempts.some(a=>a.identityMatched)?'Verify the current official share-class basis; retain the exact provider identity privately.':'Resolve the exact-response identity blocker or retain the target as unsupported; no fuzzy approval.',priceHistoryAdmitted:false});
  write(join(privateDir,'identity-probe','checkpoint.json'),{asOf,selectionHash:plan.selectionHash,results,mappingDelta,budget:await budget.status()});
 }
 const result={schemaVersion:'de-eu-identity-probe-1.0.0',asOf,selectionHash:plan.selectionHash,targetCount:plan.targets.length,maxCandidates:MAX_IDENTITY_CANDIDATES,plannedCandidates:plan.candidateCount,resolvedTargets:mappingDelta.length,results,mappingDelta,terminalReason,budget:await budget.status(),publicDisplay:false,priceHistoryRequests:0};
 write(join(privateDir,'identity-probe','de_eu_identity_probe.json'),result);return result;
}
