/** Private aggregate only: no fetching, model changes, data publication or UI claims. */
import {readFileSync,writeFileSync,mkdirSync,chmodSync,existsSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {evaluateListingReadiness} from './de-eu-readiness.mjs';
import {readPrivateHistory,provenIssuerCountry} from './materialize-de-eu.mjs';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
const require=createRequire(import.meta.url),Identity=require('../../core/identity.js');
export const TECHNICAL_FIELDS=['sma20','sma50','sma200','high52w','low52w','momentum1M','momentum3M','momentum6M','momentum12M','realizedVolatility20d','realizedVolatility60d','atr14','relativeVolume'];
const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const refs=v=>Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'&&x.trim());
const arrayRefs=v=>typeof v==='string'&&v.trim()?[v]:refs(v)?v:[];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const statusSet=new Set(['READY','PARTIAL','BLOCKED','NOT_TESTED','NOT_APPLICABLE']);
const decision=(status,causes,evidence=[],window=null,nextStep=null)=>({status,causes:[...new Set(causes)],evidence:arrayRefs(evidence),window,nextStep});
const missing=(cause='PRODUCT_INTEGRATION_MISSING')=>decision('NOT_TESTED',[cause],[],null,'Supply actual function-specific evidence for this listing.');
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
// Detailed private audits remain immutable; the registered report projects their counts and refs.
const certificateSources=new WeakMap(),certificateCacheAudits=new WeakMap();
function certificateRef(cert,pointer=''){
 const source=cert&&certificateSources.get(cert);
 return cert?{...(source||{sha256:hash(cert),inline:true,jsonPointer:''}),jsonPointer:(source?.jsonPointer||'')+pointer}:null;
}
function summarizeDiagnostics(values){
 if(values?.compacted===true&&Number.isSafeInteger(values.count)&&/^[a-f0-9]{64}$/.test(values.sha256||''))return {count:values.count,compacted:true,sha256:values.sha256,byCause:null,byField:null,byReason:null,window:null};
 const rows=Array.isArray(values)?values:[],byCause={},byField={},byReason={};let first=null,last=null;
 for(const value of rows){
  for(const [key,target]of [['cause',byCause],['field',byField],['reason',byReason]])if(typeof value?.[key]==='string')target[value[key]]=(target[value[key]]||0)+1;
  if(date(value?.date)){first=first===null||value.date<first?value.date:first;last=last===null||value.date>last?value.date:last;}
 }
 return {count:rows.length,byCause,byField,byReason,window:{start:first,end:last}};
}
function compactCertificateEvidence(value,cert,pointer){
 if(!value||!Array.isArray(value.evidence)||value.evidence.length<=4)return value;
 const detail=certificateRef(cert,pointer);return {...value,evidence:['sha256:'+detail.sha256+'#'+detail.jsonPointer],evidenceCount:value.evidence.length,privateDetails:detail};
}
function technicalStatus(fields){
 const statuses=Object.values(fields).map(f=>f.status);
 if(statuses.some(s=>s==='READY'))return statuses.every(s=>['READY','NOT_APPLICABLE'].includes(s))?'READY':'PARTIAL';
 if(statuses.includes('PARTIAL'))return 'PARTIAL';if(statuses.includes('BLOCKED'))return 'BLOCKED';
 return statuses.every(s=>s==='NOT_APPLICABLE')?'NOT_APPLICABLE':'NOT_TESTED';
}
function rowsOf(value){return Array.isArray(value)?value:Array.isArray(value?.listings)?value.listings:[];}
function byId(value,id){return rowsOf(value).find(r=>r.listingId===id)||value?.[id]||null;}
function readPrivateCertification(directory,listingId){
 if(!/^lst_[A-Z0-9]{4}_[A-Z0-9]{12}$/.test(listingId))throw Error('CANONICAL_CERTIFICATION_ID_REQUIRED');
 let certificate=null,found=false;
 for(const dir of Array.isArray(directory)?directory:[directory]){
  assertPrivateOutput(dir,{allowCache:true});rejectSymlinkAncestors(dir);
  const path=join(dir,listingId+'.json');rejectSymlinkAncestors(path);if(!existsSync(path))continue;
  const stat=lstatSync(path);if(!stat.isFile()||stat.nlink!==1)throw Error('CERTIFICATION_INPUT_FILE_TYPE_REJECTED');
  if(found)throw Error('COMPETING_CERTIFICATION_INPUTS');found=true;
  const bytes=readFileSync(path),value=JSON.parse(bytes.toString('utf8'));
  const wrapped=value?.schemaVersion==='private-europe-cache-audit-1.0.0';
  certificate=wrapped?value.recentWindow||null:value;
  if(certificate&&typeof certificate==='object')certificateSources.set(certificate,{path,sha256:createHash('sha256').update(bytes).digest('hex'),jsonPointer:wrapped?'/recentWindow':''});
  if(wrapped&&certificate)certificateCacheAudits.set(certificate,{schemaVersion:value.schemaVersion,listingId:value.listingId,securityId:value.securityId,isin:value.isin,mic:value.mic,asOf:value.asOf,inputSeriesHash:value.inputSeriesHash,identity:value.identity,sourceFields:value.sourceFields,sourceEvidence:value.sourceEvidence});
 }
 return certificate;
}
function certified(row,h,cert,asOf){return !!h&&Array.isArray(h.bars)&&cert?.schemaVersion==='europe-history-certification-1.0.0'&&cert.listingId===row.listingId&&cert.securityId===row.securityId&&cert.isin===row.isin&&cert.mic===row.mic&&cert.asOf===asOf&&cert.inputSeriesHash===hash(h.bars);}
function historyFacts(row,h,asOf){
 if(!h)return {state:'MISSING',causes:['MISSING_HISTORY'],bars:0,first:null,last:null,inputSeriesHash:null};
 const bars=Array.isArray(h.bars)?h.bars:Array.isArray(h.points)?h.points.map(p=>({date:p[0],close:p[1]})):[];
 const causes=[];let previous=null;
 if(h.isin!==row.isin||h.mic!==row.mic||h.currency!==row.tradingCurrency||h.quoteUnit!==row.quoteUnit)causes.push('MAPPING_ERROR');
 if(!bars.length)causes.push('MISSING_HISTORY');
 for(const b of bars){
  if(!date(b?.date)||b.date>asOf||previous&&b.date<=previous||!numeric(b?.close)||b.close<=0)causes.push('PROVIDER_DATA_DEFECT');
  if(date(b?.date))previous=b.date;
  if(['open','high','low'].every(k=>b?.[k]!==undefined&&b[k]!==null)&&(!['open','high','low'].every(k=>numeric(b[k])&&b[k]>0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high)))causes.push('PROVIDER_DATA_DEFECT');
 }
 if(!arrayRefs(h.sourceEvidence).length||!h.apiVersion||!h.source)causes.push('PROVIDER_PROVENANCE_UNVERIFIED');
 const latest=bars.at(-1),latestCauses=causes.filter(c=>['MAPPING_ERROR','PROVIDER_PROVENANCE_UNVERIFIED'].includes(c));
 if(!latest||!date(latest.date)||latest.date>asOf||!numeric(latest.close)||latest.close<=0||['open','high','low'].every(k=>latest?.[k]!==undefined&&latest[k]!==null)&&(!['open','high','low'].every(k=>numeric(latest[k])&&latest[k]>0)||latest.high<Math.max(latest.open,latest.close,latest.low)||latest.low>Math.min(latest.open,latest.close,latest.high)))latestCauses.push('PROVIDER_DATA_DEFECT');
 return {state:causes.length?'INVALID':'AVAILABLE',causes:[...new Set(causes)],latestValid:latestCauses.length===0,latestCauses:[...new Set(latestCauses)],bars:bars.length,first:bars[0]?.date||null,last:bars.at(-1)?.date||null,
  inputSeriesHash:Array.isArray(h.bars)?hash(h.bars):null,basis:h.adjustmentStatus?.priceSeriesType||'UNKNOWN',retrievedAt:h.retrievedAt||null,source:h.source||h.provider||null,apiVersion:h.apiVersion||null,
  currency:h.currency||null,quoteUnit:h.quoteUnit||null,latestClose:latestCauses.length?null:bars.at(-1)?.close??null,barsForEvaluator:bars};
}
function freshness(facts,cert,certMatches,asOf){
 const f=certMatches?cert.freshness:null;
 if(facts.state==='MISSING')return {status:'MISSING',cause:'MISSING_HISTORY',latestDate:null,expectedLastSession:null,dataKind:'EOD'};
 if(facts.latestValid===false)return {status:'INVALID',cause:facts.latestCauses[0],latestDate:facts.last,expectedLastSession:null,dataKind:'EOD'};
 if(!f||f.latestDate!==facts.last)return {status:'MISSING',cause:cert&&!certMatches?'CERTIFICATION_INPUT_DRIFT':'MISSING_CALENDAR_BASIS',latestDate:facts.last,dataPresent:true,expectedLastSession:null,dataKind:'EOD'};
 if(f.cause==='PROVIDER_DATA_DEFECT')return {status:'INVALID',cause:f.cause,latestDate:facts.last,expectedLastSession:date(f.expectedLastSession)?f.expectedLastSession:null,evidence:f.evidence||[],dataKind:'EOD'};
 // A proven completed session is only a lower bound. It can disprove freshness,
 // but equality/newer data cannot prove the exact latest completed session.
 if(!date(f.expectedLastSession)){
  const bound=date(f.lastProvenCompletedSession)&&f.lastProvenCompletedSession<=asOf&&refs(f.evidence)?f.lastProvenCompletedSession:null;
  return {status:bound&&facts.last<bound?'STALE':'UNKNOWN',cause:bound&&facts.last<bound?'STALE_EOD':'MISSING_CALENDAR_BASIS',latestDate:facts.last,dataPresent:true,expectedLastSession:null,lastProvenCompletedSession:bound,evidence:arrayRefs(f.evidence),calendarBasis:bound?'PROVEN_COMPLETED_SESSION_LOWER_BOUND':'UNCONFIRMED',dataKind:'EOD'};
 }
 if(!refs(f.evidence)||f.expectedLastSession>asOf)return {status:'MISSING',cause:'MISSING_CALENDAR_BASIS',latestDate:facts.last,dataPresent:true,expectedLastSession:null,dataKind:'EOD'};
 if(f.status==='READY'&&facts.last===f.expectedLastSession)return {...f,status:'CURRENT',dataKind:'EOD'};
 if((f.status==='DELAYED_EXPECTED'||f.freshness==='DELAYED_EXPECTED')&&refs(f.providerDeliveryEvidence)&&facts.last<f.expectedLastSession)return {...f,status:'DELAYED_EXPECTED',dataKind:'EOD'};
 if(f.status==='PARTIAL'&&f.cause==='STALE_EOD'&&facts.last<f.expectedLastSession)return {...f,status:'STALE',dataKind:'EOD'};
 return {status:'MISSING',cause:f.cause||'MISSING_CALENDAR_BASIS',latestDate:facts.last,dataPresent:true,expectedLastSession:null,dataKind:'EOD'};
}
function uiProof(input,id,name){
 const p=input.integrationEvidence;
 if(p?.passed!==true||p.fixture!==false||p.sourceSHA!==input.sourceSHA)return null;
 const local=byId(p,id)?.functions?.[name];
 if(local?.verified===true&&refs(local.evidence))return local;
 if(!Array.isArray(p.listingIds)||!p.listingIds.includes(id)||!Array.isArray(p.products)||!p.products.includes(name)||!arrayRefs(p.evidence).length)return null;
 return {verified:true,evidence:arrayRefs(p.evidence)};
}
function verifiedProviderIdentity(row,h,facts,input,statusEvidence,cert){
 const m=byId(input.providerMetadata,row.listingId),d=m?.data;
 if(!m||!d||m.isin!==row.isin||m.mic!==row.mic||d.listingId&&d.listingId!==row.listingId||d.securityId&&d.securityId!==row.securityId||!arrayRefs(m.sourceEvidence).length||!Number.isFinite(Date.parse(m.checkedAt))||Date.parse(m.checkedAt)>Date.parse(input.now)||Date.parse(input.now)-Date.parse(m.checkedAt)>30*86400000)return false;
 const e=row.providerIdentityEvidence,independent=row.providerIdentityBasis?.startsWith('HISTORICAL_EXACT_ISIN_MIC')&&e?.providerSymbol===row.providerSymbol&&e?.isin===row.isin&&e?.mic===row.mic&&/^[a-f0-9]{64}$/.test(e.sourceHash||'')&&typeof e.sourcePath==='string';
 if(d.providerSymbol!==row.providerSymbol||d.exchange!==row.mic||d.isin!==row.isin&&(!independent||d.isin)||d.currency&&d.currency!==row.tradingCurrency)return false;
 const audit=certificateCacheAudits.get(cert),cached=certified(row,h,cert,input.asOf)&&audit?.listingId===row.listingId&&audit.securityId===row.securityId&&audit.isin===row.isin&&audit.mic===row.mic&&audit.asOf===input.asOf&&audit.inputSeriesHash===facts.inputSeriesHash&&audit.identity?.status==='READY'&&refs(audit.identity.evidence)&&audit.sourceFields?.priceStatus==='READY'&&audit.sourceFields.priceMatches===facts.bars&&audit.sourceFields.bars===facts.bars&&refs(audit.sourceEvidence)&&['equity',...(row.shareClass==='PREFERRED_SHARE'?['preferred_equity']:[])].includes(d.assetType);
 return !!h&&facts.bars>0&&!facts.causes.some(c=>['MAPPING_ERROR','PROVIDER_PROVENANCE_UNVERIFIED'].includes(c))&&(cached||statusEvidence.some(d=>d.isin===row.isin&&d.mic===row.mic&&['READY','PARTIAL'].includes(d.status)&&d.bars>0&&arrayRefs(d.sourceEvidence).length>0));
}
function provenReferenceCountry(row){
 return provenIssuerCountry(row);
}
function fundamental(row,value,asOf){
 if(!value)return decision('BLOCKED',['MISSING_FUNDAMENTALS'],[],null,'Locate existing canonical company/period facts; do not start broad ingestion.');
 if(!row.companyId||value.companyId!==row.companyId||value.verified!==true||!refs(value.evidence)||!date(value.period)||!date(value.filingDate)||value.period>value.filingDate||value.filingDate>asOf)return decision('BLOCKED',['MISSING_FUNDAMENTALS'],value.evidence||[],null,'Resolve exact Company, period, filing/PIT and reporting-currency provenance.');
 return decision('PARTIAL',[],value.evidence,{period:value.period,filingDate:value.filingDate,asOf},'Validate individual factor, shares, valuation and FX contracts; matched facts are not a Quant score.');
}
function logoRecord(row,input){
 const literal=Array.isArray(input.logoStatus?.rows)?input.logoStatus.rows.find(l=>l.securities?.some(s=>s.listingId===row.listingId)):null;
 const l=literal||byId(input.logoStatus,row.listingId),fallback={listingId:row.listingId,status:'EXISTING_FALLBACK',verified:false,evidence:[],asset:null,reason:'Existing central fallback; no exact issuer and loaded-asset proof supplied.'};
 if(!l)return fallback;
 const issuerId=l.companyId||l.referencedIssuerId||null;
 const supplied=l.canonicalStatus||l.status,known=['VERIFIED_LOGO','EXISTING_FALLBACK','SUSPECT_QUARANTINED','MISSING'].includes(supplied)?supplied:'EXISTING_FALLBACK';
 const exactSecurity=s=>s?.listingId===row.listingId&&s.securityId===row.securityId&&s.isin===row.isin&&s.mic===row.mic;
 const linked=literal?l.securities.some(exactSecurity)&&!!issuerId&&[row.companyId,row.referencedIssuerId].filter(Boolean).includes(issuerId)&&(!l.logo?.companyId||l.logo.companyId===issuerId):l.listingId===row.listingId&&l.isin===row.isin&&l.referencedIssuerId===row.referencedIssuerId;
 const company=input.logoEvidence?.companies?.find(c=>(c.companyId||c.referencedIssuerId)===issuerId&&c.securities?.some(exactSecurity));
 const proof=e=>typeof e?.path==='string'&&/^[a-f0-9]{64}$/.test(e.sha256||'')&&typeof e.url==='string'&&e.url.startsWith('https://');
 const issuerProven=literal?!!company&&proof(company.issuerEvidence)&&proof(company.domainEvidence):l.issuerVerified===true&&refs(l.issuerEvidence);
 const asset=typeof l.asset==='string'?l.asset:null;
 const loaded=(input.logoEvidence?.assetLoads||[]).find(a=>(a.companyId||a.referencedIssuerId)===issuerId&&a.asset===asset&&a.loaded===true&&refs(a.evidence)&&/^[a-f0-9]{40}$/.test(a.sha1||'')&&input.logoEvidence?.reviewed?.companies?.[issuerId]===a.sha1);
 const flatLoaded=!literal&&l.assetLoad?.loaded===true&&l.assetLoad.asset===asset&&refs(l.assetLoad.evidence);
 const verified=known==='VERIFIED_LOGO'&&linked&&issuerProven&&!!asset&&(!!loaded||flatLoaded);
 const evidence=[...arrayRefs(l.evidence),...arrayRefs(loaded?.evidence),...arrayRefs(l.assetLoad?.evidence),...(company?[company.issuerEvidence?.path,company.domainEvidence?.path].filter(Boolean):arrayRefs(l.issuerEvidence))];
 return {listingId:row.listingId,securityId:row.securityId,isin:row.isin,mic:row.mic,companyId:row.companyId||null,referencedIssuerId:row.referencedIssuerId||null,status:verified?'VERIFIED_LOGO':known==='SUSPECT_QUARANTINED'||!linked?'SUSPECT_QUARANTINED':known==='MISSING'?'MISSING':'EXISTING_FALLBACK',verified,evidence,asset:verified?asset:null,candidateAsset:verified?null:asset,producerCanonicalStatus:supplied,reason:verified?null:l.reason||fallback.reason};
}
export function aggregateDevelopment(input){
 if(!input||!Array.isArray(input.listingMaps)||!date(input.asOf)||!/^[a-f0-9]{40}$/.test(input.sourceSHA||'')||typeof input.now!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(input.now)||!Number.isFinite(Date.parse(input.now)))throw Error('FIXED_PRIVATE_REPORT_INPUT_REQUIRED');
 if(input.generatorSourceSHA!==undefined&&!/^[a-f0-9]{40}$/.test(input.generatorSourceSHA))throw Error('GENERATOR_SOURCE_SHA_REQUIRED');
 if(input.asOf>new Date(input.now).toISOString().slice(0,10))throw Error('FUTURE_DATA_STICHTAG_REJECTED');
 if(input.historiesDir!==undefined&&input.historiesDir!==null){
  if(typeof input.historiesDir!=='string'||!input.historiesDir.trim())throw Error('PRIVATE_HISTORY_DIRECTORY_REQUIRED');
  if(Object.keys(input.histories||{}).length)throw Error('COMPETING_HISTORY_INPUTS');
  assertPrivateOutput(input.historiesDir,{allowCache:true});rejectSymlinkAncestors(input.historiesDir);
 }
 if(input.certificationsDir!==undefined&&input.certificationsDir!==null){
  const directories=Array.isArray(input.certificationsDir)?input.certificationsDir:[input.certificationsDir];
  if(!directories.length||directories.some(d=>typeof d!=='string'||!d.trim()))throw Error('PRIVATE_CERTIFICATION_DIRECTORY_REQUIRED');
  if(Object.keys(input.certifications||{}).length)throw Error('COMPETING_CERTIFICATION_INPUTS');
  for(const dir of directories){assertPrivateOutput(dir,{allowCache:true});rejectSymlinkAncestors(dir);}
 }
 const selected=new Map(),securityMIC=new Map();
 for(const map of input.listingMaps){
  if(map.schemaVersion!=='de-eu-listing-map-1.0.0'||!Array.isArray(map.listings)||!date(map.asOf)||map.asOf>input.asOf)throw Error('FROZEN_LISTING_MAP_REQUIRED');
  for(const r of map.listings){
   if(r.listingId!==Identity.listingIdFor(r)||r.securityId!==Identity.securityIdForISIN(r.isin))throw Error('CANONICAL_LISTING_IDENTITY_REQUIRED');
   if(securityMIC.has(r.securityId)&&securityMIC.get(r.securityId)!==r.mic)throw Error('MULTIPLE_SELECTED_VENUES_FOR_SECURITY');securityMIC.set(r.securityId,r.mic);
   if(selected.has(r.listingId)){const old=selected.get(r.listingId);if(old.isin!==r.isin||old.tradingCurrency!==r.tradingCurrency||old.providerSymbol!==r.providerSymbol)throw Error('DUPLICATE_LISTING_INPUT_CONFLICT');old.indexMemberships=[...new Set([...old.indexMemberships,...(r.indexMemberships||[])])].sort();continue;}
   let referencedIssuerId=r.referencedIssuerId||null;try{if(!referencedIssuerId&&(r.issuerLEI||r.companyReference?.lei))referencedIssuerId=Identity.companyIdForLEI(r.issuerLEI||r.companyReference.lei);}catch{}
   const companyProven=['VERIFIED_EXISTING_VU_COMPANY','EXACT_EXISTING_VU_COMPANY_LINK'].includes(r.companyAssociationStatus)&&refs(r.companyAssociationEvidence);
   selected.set(r.listingId,{...r,companyId:companyProven?r.companyId||null:null,referencedIssuerId,companyCountry:provenReferenceCountry(r),indexMemberships:[...new Set(r.indexMemberships||[])].sort()});
  }
 }
 const rows=[...selected.values()].sort((a,b)=>a.listingId.localeCompare(b.listingId)),readiness=[],ingestion=[],logos=[];
 for(const row of rows){
  const h=input.historiesDir?readPrivateHistory(input.historiesDir,row.listingId):input.histories?.[row.listingId]||null,facts=historyFacts(row,h,input.asOf),cert=input.certificationsDir?readPrivateCertification(input.certificationsDir,row.listingId):byId(input.certifications,row.listingId),certMatches=!facts.causes.some(c=>['MAPPING_ERROR','PROVIDER_PROVENANCE_UNVERIFIED'].includes(c))&&certified(row,h,cert,input.asOf),fresh=freshness(facts,cert,certMatches,input.asOf);
  const sourceRefs=arrayRefs(h?.sourceEvidence),mappingRefs=arrayRefs(row.mappingSource),mapped=row.mappingStatus==='VERIFIED'&&mappingRefs.length>0;
  const baseline=evaluateListingReadiness({listing:{...row,currency:row.tradingCurrency},history:h?{...h,bars:facts.barsForEvaluator||[],sourceEvidence:sourceRefs}:{},asOf:input.asOf,metadata:{identityVerified:mapped,identityEvidence:mappingRefs,currencyVerified:mapped&&!!row.tradingCurrency,currencyEvidence:mappingRefs,quoteUnit:row.quoteUnit,
   rights:{privateDevelopment:true,publicDisplay:false,evidence:['User-authorized isolated private DE/EU consumer development']}}});
  const functions=baseline.functions;
  const quarantine=[...(h?.quarantined||[]),...(h?.anomalies||[])],missingSessions=certMatches?cert.missingSessions||[]:[];
  const issues=certMatches?cert.fullHistoryQuality?.issues||[]:h?.quality?.issues||[];
  const chartQuality={quarantinedRowsRetained:quarantine.length,immutableQuarantineObservationCount:h?.quarantineLedger?.length??quarantine.length,quarantineSummary:summarizeDiagnostics(quarantine),historyIssueSummary:summarizeDiagnostics(issues),missingSessions,missingSessionCount:missingSessions.length,filledSessions:0,basis:facts.basis||'UNKNOWN'};
  if(issues.length&&certMatches)chartQuality.privateHistoryIssues=certificateRef(cert,'/fullHistoryQuality/issues');
  if(quarantine.length||issues.length&&!certMatches)chartQuality.privateHistorySource={...(input.historiesDir?{path:join(input.historiesDir,row.listingId+'.json')}:{inline:true}),inputSeriesHash:facts.inputSeriesHash,sourceEvidence:sourceRefs};
  if(functions.privateCloseChart.status==='READY'){
   const partialCauses=[...(facts.state==='INVALID'||quarantine.length?['PROVIDER_DATA_DEFECT']:[]),...(missingSessions.length?['MISSING_HISTORY']:[]),...(facts.basis==='UNKNOWN'?['UNKNOWN_ADJUSTMENT_BASIS']:[])];
   if(partialCauses.length)functions.privateCloseChart=decision('PARTIAL',partialCauses,sourceRefs,{start:facts.first,end:facts.last,asOf:input.asOf},'Display only the real registered close points and their dated quality limitations; technical eligibility remains separate.');
  }
  if(facts.causes.some(c=>['MAPPING_ERROR','PROVIDER_PROVENANCE_UNVERIFIED'].includes(c)))functions.privateCloseChart=decision('BLOCKED',facts.causes,sourceRefs,{start:facts.first,end:facts.last,asOf:input.asOf},'Validate exact canonical history identity and provenance.');
  functions.privateCloseChart.quality=chartQuality;
  for(const name of ['search','detail','watchlist','chart','screener']){
   const proof=uiProof(input,row.listingId,name),causes=[...(mapped?[]:['MAPPING_ERROR']),...(proof?[]:['PRODUCT_INTEGRATION_MISSING'])];
   const hardBlocked=causes.length>0||name==='chart'&&functions.privateCloseChart.status==='BLOCKED';
   if(name==='chart')causes.push(...functions.privateCloseChart.causes);
   functions[name]=decision(hardBlocked?'BLOCKED':name==='chart'&&functions.privateCloseChart.status==='PARTIAL'?'PARTIAL':'READY',causes,proof?.evidence||[],{start:facts.first,end:facts.last,asOf:input.asOf},causes.length?'Validate the actual central product loader/UI and preserve the named dated limitations.':null);
   if(name==='chart')functions[name].quality=chartQuality;
  }
  functions.latestEod=decision(fresh.status==='CURRENT'?'READY':['STALE','DELAYED_EXPECTED'].includes(fresh.status)?'PARTIAL':'BLOCKED',fresh.cause?[fresh.cause]:[],fresh.evidence||[],{start:facts.last,end:facts.last,asOf:input.asOf},fresh.status==='CURRENT'?null:'Obtain/verifiy the latest completed local session and documented provider delivery.');
  functions.regionFilter=decision(mapped&&row.companyCountry?'READY':'PARTIAL',row.companyCountry?[]:['MAPPING_ERROR'],mappingRefs,null,'Issuer domicile, listing venue and membership remain separate attributes.');
  functions.indexFilter=decision(mapped&&row.indexMemberships.length&&row.referenceEvidence?.length?'READY':row.indexMemberships.length?'PARTIAL':'NOT_APPLICABLE',row.indexMemberships.length&&!row.referenceEvidence?.length?['REFERENCE_UNRESOLVED']:[],row.referenceEvidence?.map(e=>e.membershipSourceId).filter(Boolean)||[]);
  const fields={};
  for(const name of TECHNICAL_FIELDS){
   const f=certMatches?cert.technicalFields?.[name]:null;
   if(!f)fields[name]=decision('NOT_TESTED',[cert&&!certMatches?'CERTIFICATION_INPUT_DRIFT':facts.state==='MISSING'?'MISSING_HISTORY':'UNKNOWN_ADJUSTMENT_BASIS'],[],null,'Use the existing central certification for this exact input history.');
   else if(!statusSet.has(f.status)||f.inputSeriesHash!==facts.inputSeriesHash||f.status==='READY'&&(!refs(f.evidence)||!numeric(f.value)||!date(f.asOf)||f.asOf!==facts.last||cert.splitAdjustedOHLC?.status!=='READY'||cert.calendar?.status!=='READY'||name==='relativeVolume'&&cert.splitAdjustedVolume?.status!=='READY'))fields[name]=decision('BLOCKED',['CERTIFICATION_INPUT_DRIFT'],[],null,'Recompute central certification after input/evidence drift.');
   else fields[name]=compactCertificateEvidence({...f,nextStep:f.status==='READY'?null:f.nextStep||cert.nextStep||'Resolve the named field/window cause.'},cert,'/technicalFields/'+name);
  }
  const fundamentalRecord=byId(input.fundamentalStatus,row.listingId)||(row.companyId?(input.fundamentalStatus?.[row.companyId]||rowsOf(input.fundamentalStatus).find(f=>f.companyId===row.companyId)):null);
  functions.fundamentalInputs=fundamental(row,fundamentalRecord,input.asOf);
  functions.quantFullScore=decision('BLOCKED',['PRODUCT_INTEGRATION_MISSING',...(functions.fundamentalInputs.status==='BLOCKED'?['MISSING_FUNDAMENTALS']:[]),'MISSING_FX_OR_SHARE_BASIS'],functions.fundamentalInputs.evidence,null,'Satisfy the unchanged full-factor and EU-population contract; never synthesize missing factors.');
  functions.supertrader=decision('BLOCKED',['PRODUCT_INTEGRATION_MISSING',...(certMatches&&cert.splitAdjustedVolume?.status==='READY'?[]:['UNVERIFIED_VOLUME_BASIS']),'MISSING_FX_OR_SHARE_BASIS'],certMatches?cert.splitAdjustedVolume?.evidence||[]:[],null,'Supply unchanged strategy, verified monetary/liquidity, weekly-calendar and isolated EU context.');
  const logo=logoRecord(row,input);logos.push(logo);functions.logo=decision(logo.verified?'READY':logo.status==='EXISTING_FALLBACK'?'PARTIAL':'BLOCKED',logo.verified?[]:['PRODUCT_INTEGRATION_MISSING'],logo.evidence,null,logo.reason);
  const statusEvidence=(input.statuses||[]).flatMap(s=>s.decisions||s.listings||[]).filter(d=>d.listingId===row.listingId);
  const {barsForEvaluator,...storedFacts}=facts;
  const providerIdentityMatched=verifiedProviderIdentity(row,h,facts,input,statusEvidence,cert);
  const currentAttempts=statusEvidence.filter(d=>d.asOf===input.asOf&&d.isin===row.isin&&d.mic===row.mic&&Number.isFinite(Date.parse(d.testedAt))&&Date.parse(d.testedAt)<=Date.parse(input.now)).sort((a,b)=>Date.parse(a.testedAt)-Date.parse(b.testedAt)),refreshAttempt=currentAttempts.at(-1)||statusEvidence.at(-1)||null,currentIdentityAttempt=currentAttempts.at(-1),providerIdentityBasis=providerIdentityMatched?(currentIdentityAttempt&&['READY','PARTIAL'].includes(currentIdentityAttempt.status)&&currentIdentityAttempt.bars>0&&refs(currentIdentityAttempt.sourceEvidence)?'CURRENT_REFRESH_RESPONSE':certificateCacheAudits.has(cert)?'EXACT_CACHED_SOURCE_RECONCILIATION':'EXISTING_PROVIDER_IDENTITY_EVIDENCE'):null;
  ingestion.push({providerIdentityMatched,providerIdentityBasis,refreshAttempt:refreshAttempt?{status:refreshAttempt.status,cause:refreshAttempt.cause||null,phase:refreshAttempt.phase||null,asOf:refreshAttempt.asOf||null,testedAt:refreshAttempt.testedAt||null,sourceEvidence:arrayRefs(refreshAttempt.sourceEvidence)}:null,listingId:row.listingId,isin:row.isin,mic:row.mic,name:row.name,history:storedFacts,latest:{price:facts.latestClose??null,date:facts.last,currency:row.tradingCurrency,quoteUnit:row.quoteUnit,source:h?.source||null,apiVersion:h?.apiVersion||null,retrievedAt:h?.retrievedAt||null,dataKind:'EOD'},freshness:fresh,sourceEvidence:sourceRefs,statusEvidence,certificationInputMatched:certMatches,quality:chartQuality});
  readiness.push({listingId:row.listingId,securityId:row.securityId,companyId:row.companyId||null,referencedIssuerId:row.referencedIssuerId||null,isin:row.isin,mic:row.mic,asOf:input.asOf,functions,technicalFields:fields,inputSeriesHash:facts.inputSeriesHash});
 }
 const byReady=new Map(readiness.map(r=>[r.listingId,r])),byIngestion=new Map(ingestion.map(r=>[r.listingId,r])),byLogo=new Map(logos.map(r=>[r.listingId,r]));
 const counts={selectedShareClasses:new Set(rows.map(r=>r.securityId)).size,selectedListings:rows.length,actualCompanyLinks:new Set(rows.map(r=>r.companyId).filter(Boolean)).size,referencedLEIIssuers:new Set(rows.map(r=>r.referencedIssuerId).filter(Boolean)).size,referenceLocalListings:rows.filter(r=>r.mappingStatus==='VERIFIED').length,providerMatchedLocalListings:ingestion.filter(r=>r.providerIdentityMatched).length,unconfirmedFreshnessWithEod:ingestion.filter(r=>['MISSING','UNKNOWN'].includes(r.freshness.status)&&r.freshness.dataPresent).length,currentEod:ingestion.filter(r=>r.freshness.status==='CURRENT').length,verifiedLogos:logos.filter(l=>l.verified).length,fallbacks:logos.filter(l=>l.status==='EXISTING_FALLBACK').length,historyAvailable:ingestion.filter(r=>r.history.state==='AVAILABLE').length,closeChartUsable:readiness.filter(r=>['READY','PARTIAL'].includes(r.functions.privateCloseChart.status)).length,searchReady:readiness.filter(r=>r.functions.search.status==='READY').length,watchlistReady:readiness.filter(r=>r.functions.watchlist.status==='READY').length,technicalListings:readiness.filter(r=>Object.values(r.technicalFields).some(f=>f.status==='READY')).length};
 const indexKeys=[...new Set([...(input.referenceUniverse?.indexes||[]).map(i=>i.index),...rows.flatMap(r=>r.indexMemberships)])].sort();
 const matrix=indexKeys.map(index=>{const rr=rows.filter(r=>r.indexMemberships.includes(index)),ref=input.referenceUniverse?.indexes?.find(i=>i.index===index);return {index,referenceCompleteness:ref?.referenceCompleteness||'REFERENCE_UNRESOLVED',referenceDate:ref?.referenceDate||null,effectiveDate:ref?.effectiveDate||null,targetShareClasses:ref?.observedMembers??rr.length,referenceLocalListings:rr.filter(r=>r.mappingStatus==='VERIFIED').length,providerMatchedLocalListings:rr.filter(r=>byIngestion.get(r.listingId).providerIdentityMatched).length,mappedLocalListings:rr.filter(r=>byIngestion.get(r.listingId).providerIdentityMatched).length,unconfirmedFreshnessWithEod:rr.filter(r=>['MISSING','UNKNOWN'].includes(byIngestion.get(r.listingId).freshness.status)&&byIngestion.get(r.listingId).freshness.dataPresent).length,currentEod:rr.filter(r=>byIngestion.get(r.listingId).freshness.status==='CURRENT').length,historyAvailable:rr.filter(r=>byIngestion.get(r.listingId).history.state==='AVAILABLE').length,verifiedLogos:rr.filter(r=>byLogo.get(r.listingId).verified).length,fallbacks:rr.filter(r=>byLogo.get(r.listingId).status==='EXISTING_FALLBACK').length,technicalListings:rr.filter(r=>Object.values(byReady.get(r.listingId).technicalFields).some(f=>f.status==='READY')).length,open:[...new Set(rr.flatMap(r=>Object.values(byReady.get(r.listingId).functions).flatMap(f=>f.causes)))]};});
 const budget=input.budget||{},candidateN=rows.filter(r=>r.providerSymbol).length,n=ingestion.filter(r=>r.providerIdentityMatched&&r.history.bars>0&&['READY','PARTIAL'].includes(byReady.get(r.listingId).functions.privateCloseChart.status)).length,caPages=Number.isSafeInteger(input.refreshModel?.corporateActionPagesPerListingPerMonth)?input.refreshModel.corporateActionPagesPerListingPerMonth:null;
 if(caPages!==null&&caPages<0)throw Error('INVALID_REFRESH_MODEL');
 if(caPages===0&&!(input.refreshModel?.corporateActions?.documentedScopeUnsupported===true&&input.refreshModel.corporateActions.embeddedObservationsMonitoring===true&&refs(input.refreshModel.corporateActions.evidence)))throw Error('ZERO_CA_MODEL_REQUIRES_DOCUMENTED_SCOPE_AND_EMBEDDED_MONITORING');
 const baseMonthly=n*23,caMonthly=caPages===null?null:n*caPages,retryReserve=Math.ceil((baseMonthly+(caMonthly||0))*.1);
 const common={asOf:input.asOf,generatedAt:input.now,sourceSHA:input.sourceSHA,...(input.generatorSourceSHA?{generatorSourceSHA:input.generatorSourceSHA}:{}),privateDevelopment:true,publicDisplay:false};
 const safeBudget=Object.fromEntries(['version','ledgerHash','authorizationRevisions','month','runId','requestsAttempted','estimatedCreditsConsumed','totalEstimatedCreditsConsumed','runLimit','targetLimit','monthlyCeiling','reserveCredits','creditsRemaining','semantics','accountEvidenceState','targetExceeded'].filter(k=>budget[k]!==undefined).map(k=>[k,budget[k]]));
 const requestBudget={...common,schemaVersion:'europe-consumer-request-budget-1.0.0',actualSharedStatus:safeBudget,requestsAttempted:numeric(budget.requestsAttempted)?budget.requestsAttempted:null,requestsScope:budget.runId?'REPORTED_SHARED_LEDGER_RUN':'UNKNOWN',estimatedCreditsConsumed:numeric(budget.totalEstimatedCreditsConsumed)?budget.totalEstimatedCreditsConsumed:numeric(budget.estimatedCreditsConsumed)?budget.estimatedCreditsConsumed:null,hardCap:budget.runLimit??budget.hardLimit??null,targetLimit:budget.targetLimit??null,runAllowanceRemaining:budget.creditsRemaining??null,accountRemainingVerified:budget.accountEvidenceState==='CURRENT_VERIFIED_BOUND',accountRemainingCredits:budget.accountRemainingCredits??null,scheduleActivated:false,selectedCandidateCount:candidateN,monthlyRefreshModel:{listings:n,selection:'ACTUAL_PROVIDER_IDENTITY_MATCHED_CANONICAL_CLOSE_HISTORIES',selectedCandidateCount:candidateN,modelSessions:22,eodPagesPerListingSession:1,metadataPagesPerListingMonth:1,baseEstimatedSymbolCredits:baseMonthly,corporateActionPagesPerListingMonth:caPages,corporateActionCredits:caMonthly,corporateActionScopeEvidence:input.refreshModel?.corporateActions||null,corporateActionsComplete:false,retriesReserveModel:retryReserve,estimatedTotalSymbolCredits:caMonthly===null?null:baseMonthly+caMonthly+retryReserve,estimatedMinimumWithRetryReserve:baseMonthly+retryReserve,assumptions:['One EOD page per listing and modeled session; overlap must fit that page.','Monthly metadata; separate action pages only if required.','10% conservative retry reserve is a model, not actual billing.','Actual calendar sessions, pagination and corrections can change cost.'],activation:'NOT_ACTIVATED'},newRequestsByReportGenerator:0};
 const listingMap={...common,schemaVersion:'de-eu-listing-map-1.0.0',listings:rows,counts};
 const reference={...common,schemaVersion:'europe-consumer-reference-universe-1.0.0',selectionSemantics:'CURRENT_SELECTION_NOT_HISTORICAL_PIT_UNIVERSE',originalReference:input.referenceUniverse||null,members:rows.map(r=>({isin:r.isin,securityId:r.securityId,name:r.name,indexMemberships:r.indexMemberships,companyCountry:r.companyCountry||null,mic:r.mic,tier:r.tier||null})),counts};
 const summary={...common,schemaVersion:'europe-consumer-development-summary-1.0.0',counts,indexMatrix:matrix,publicDeployment:false,quantReady:0,supertraderReady:0,budget:requestBudget,missingProviderSymbols:rows.filter(r=>!r.providerSymbol).map(r=>({name:r.name,isin:r.isin,mic:r.mic})),limitations:['READY applies only to the named listing/field/window/evidence.','Current selection is not historical PIT index membership.','No USA, Tiingo, Vorsorge, rankings or running jobs are changed by this report; their regression evidence must be supplied separately.']};
 const outputs={europe_consumer_reference_universe:reference,europe_consumer_listing_map:listingMap,europe_consumer_ingestion_status:{...common,schemaVersion:'europe-consumer-ingestion-status-1.0.0',listings:ingestion},europe_consumer_product_readiness:{...common,schemaVersion:'europe-consumer-product-readiness-1.0.0',listings:readiness},europe_consumer_logo_status:{...common,schemaVersion:'europe-consumer-logo-status-1.0.0',listings:logos},europe_consumer_request_budget:requestBudget,europe_consumer_development_summary:summary};
 const columns=['name','isin','indices','issuerDomicile','exchange','currency','quoteUnit','lastPriceDate','historyStart','freshness','logo','chart','search','watchlist','screener','technicalStatus','quant','supertrader','fundamentals'];
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const csv=columns.join(',')+'\n'+rows.map(r=>{const i=byIngestion.get(r.listingId),f=byReady.get(r.listingId).functions;return [r.name,r.isin,r.indexMemberships.join('|'),r.companyCountry,r.mic,r.tradingCurrency,r.quoteUnit,i.latest.date,i.history.first,i.freshness.status,byLogo.get(r.listingId).status,f.chart.status,f.search.status,f.watchlist.status,f.screener.status,technicalStatus(byReady.get(r.listingId).technicalFields),f.quantFullScore.status,f.supertrader.status,f.fundamentalInputs.status].map(q).join(',');}).join('\n')+'\n';
 const esc=v=>String(v??'unresolved').replaceAll('|','/').replaceAll('\n',' ');
 const report=['|Index|Reference / date|Share classes|Provider local listing / official reference|Current EOD|History available|Logo verified / fallback|Technical listings|Open|','|---|---|---:|---:|---:|---:|---:|---:|---|',...matrix.map(r=>`|${esc(r.index)}|${esc(r.referenceCompleteness)} / ${esc(r.referenceDate)}|${r.targetShareClasses}|${r.providerMatchedLocalListings} / ${r.referenceLocalListings}|${r.currentEod}|${r.historyAvailable}|${r.verifiedLogos} / ${r.fallbacks}|${r.technicalListings}|${esc(r.open.join(', '))}|`),'',`Private development: ${counts.selectedShareClasses} share classes, ${counts.selectedListings} selected listings, ${counts.actualCompanyLinks} actual VU Company links, ${counts.referencedLEIIssuers} separate LEI issuer references.`,`Search READY: ${counts.searchReady}; Watchlist READY: ${counts.watchlistReady}; current verified EOD: ${counts.currentEod}; listings with a certified technical field: ${counts.technicalListings}.`,`Provider identity matched on actual ingestion: ${counts.providerMatchedLocalListings}; official reference listings: ${counts.referenceLocalListings}. EOD data present but freshness not confirmed from a local calendar: ${counts.unconfirmedFreshnessWithEod}; this does not mean the EOD data is missing.`, 'No public deployment, complete Quant score or SuperTrader readiness is granted.',`Reported shared-counter credits: ${requestBudget.estimatedCreditsConsumed??'unknown'}; hard cap: ${requestBudget.hardCap??'unknown'}; account balance is ${requestBudget.accountRemainingVerified?'bounded by supplied current evidence':'unverified'}. Monthly model minimum including retry reserve: ${requestBudget.monthlyRefreshModel.estimatedMinimumWithRetryReserve}; separate corporate-action pages ${caPages===null?'unresolved':caPages}. Schedule remains inactive.`,`Frontend/code SHA: ${input.sourceSHA}; generator SHA: ${input.generatorSourceSHA||'not separately supplied'}; fixed asOf: ${input.asOf}; generatedAt: ${input.now}.`,'Current selection is not a survivorship-bias-free historical index backtest.',''].join('\n');
 return {outputs,csv,report,summary};
}
export function run(argv=process.argv.slice(2)){
 const arg=n=>{const ix=argv.indexOf('--'+n);return ix<0?argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3):argv[ix+1];};
 if(!arg('input')||!arg('out'))throw Error('EXPLICIT_PRIVATE_INPUT_OUTPUT_REQUIRED');
 const inputPath=assertPrivateOutput(arg('input'),{allowCache:true}),out=assertPrivateOutput(arg('out'),{allowCache:true});
 if(/(^|\/)(_site|dist|public|release)(\/|$)/.test(out))throw Error('PUBLIC_REPORT_OUTPUT_REJECTED');
 const result=aggregateDevelopment(JSON.parse(readFileSync(inputPath,'utf8'))),files={...Object.fromEntries(Object.entries(result.outputs).map(([n,v])=>[n+'.json',v])),'europe_consumer_target_stocks.csv':result.csv,'EUROPE_CONSUMER_REPORT.md':result.report};
 for(const n of Object.keys(files))rejectSymlinkAncestors(join(out,n));mkdirSync(out,{recursive:true,mode:0o700});chmodSync(out,0o700);
 for(const [n,value]of Object.entries(files)){const p=join(out,n);writeFileSync(p,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(p,0o600);}
 return result.summary.counts;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(run()));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'PRIVATE_REPORT_INPUT_FAILURE');process.exitCode=1;}}
