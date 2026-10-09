/** Server-only selected-listing ingestion/refresh. No schedule or public writes. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createSharedBudget} from '../market/marketstack-budget.mjs';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
import {materialize} from './materialize-de-eu.mjs';
const require=createRequire(import.meta.url),Client=require('../../providers/marketstack/client.js'),Adapter=require('../../providers/marketstack/adapter.js');
const sha=s=>createHash('sha256').update(s).digest('hex');
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const reason=r=>({entitlementRestricted:'ENTITLEMENT_BLOCKED',authError:'ENTITLEMENT_BLOCKED',dataUnavailable:'UNSUPPORTED_LISTING',identityMismatch:'MAPPING_ERROR',symbolMismatch:'MAPPING_ERROR',exchangeMismatch:'MAPPING_ERROR',isinMismatch:'MAPPING_ERROR',budgetUnverified:'ACCOUNT_BUDGET_UNVERIFIED',SHARED_BUDGET_EXCEEDED:'ACCOUNT_BUDGET_UNVERIFIED'})[r]||'PROVIDER_DATA_DEFECT';
export function sampleSelection(rows,size=15){
 const chosen=new Map(),add=r=>{if(r&&chosen.size<size)chosen.set(r.listingId,r);};
 for(const ticker of ['SAP','SIE','RHM','ALV','DTE','VOW3','ASML','MC'])add(rows.find(r=>r.ticker===ticker));
 for(const index of ['MDAX','SDAX','TECDAX'])for(const r of rows.filter(r=>r.indexMemberships.includes(index)).slice(0,2))add(r);
 for(const mic of [...new Set(rows.map(r=>r.mic))])add(rows.find(r=>r.mic===mic));
 for(const r of rows)add(r);return [...chosen.values()];
}
export function mergeBars(previous,incoming){
 const map=new Map(),restatements=[];for(const b of previous||[]){if(!date(b.date)||map.has(b.date))throw Error('PREVIOUS_HISTORY_INVALID');map.set(b.date,b);}
 for(const b of incoming||[]){if(!date(b.date))throw Error('NEW_HISTORY_INVALID');const old=map.get(b.date);
  if(old){const keys=['open','high','low','close','volume','splitFactor','dividend','adjustedOpen','adjustedHigh','adjustedLow','adjustmentObservation'];
   const changed=keys.filter(k=>JSON.stringify(old[k])!==JSON.stringify(b[k]));if(changed.length)restatements.push({date:b.date,fields:changed});}
  map.set(b.date,b);
 }return {bars:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)),restatements};
}
export async function ingest({listingMap,accountEvidence,privateDir,previewOut,asOf,runId,providerFactory,now=Date.now,phase='sample',sampleProof=null}={}){
 if(!date(asOf)||!runId)throw Error('FIXED_AS_OF_AND_RUN_ID_REQUIRED');assertPrivateOutput(privateDir,{allowCache:true});assertPrivateOutput(previewOut);
 if(listingMap?.schemaVersion!=='de-eu-listing-map-1.0.0'||!date(listingMap.asOf)||listingMap.asOf>asOf||(phase!=='refresh'&&listingMap.asOf!==asOf))throw Error('FROZEN_REFERENCE_REQUIRED');
 const budget=createSharedBudget({file:join(privateDir,'shared-budget.json'),runId,evidence:accountEvidence,now});
 // Account evidence is validated before any client, URL, or request exists.
 const opening=await budget.status();const rows=listingMap.listings.filter(r=>r.mappingStatus==='VERIFIED'&&r.quoteUnit==='MAJOR');
 const candidates=rows.filter(r=>r.providerSymbol);const requiredBaseCredits=candidates.length*(phase==='refresh'?2:4);
 if(opening.creditsRemaining<requiredBaseCredits)throw Error('ACCOUNT_BUDGET_INSUFFICIENT_FOR_MANDATORY_BASE');
 const write=(p,v)=>{rejectSymlinkAncestors(p);mkdirSync(resolve(p,'..'),{recursive:true,mode:0o700});writeFileSync(p,JSON.stringify(v)+'\n',{mode:0o600});};
 const read=p=>{rejectSymlinkAncestors(p);return existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null;};
 const sample=sampleSelection(candidates),sampleIds=new Set(sample.map(r=>r.listingId));
 if(!['sample','mandatory','refresh'].includes(phase))throw Error('INVALID_IMPORT_PHASE');
 const previousCheckpoint=phase==='sample'?null:read(join(privateDir,'checkpoint.json'));
 let quarantinedMICs=[];
 if(phase!=='sample'){
  if(!sampleProof||sampleProof.fixture!==false||sampleProof.passed!==true||sampleProof.asOf!==listingMap.asOf||sampleProof.referenceHash!==sha(JSON.stringify(listingMap))||
     !Array.isArray(sampleProof.successfulListingIds)||!sampleProof.successfulListingIds.length||sampleProof.successfulListingIds.some(id=>!sampleIds.has(id))||
     !Array.isArray(sampleProof.testedListingIds)||sample.some(r=>!sampleProof.testedListingIds.includes(r.listingId))||
     !Array.isArray(sampleProof.engines)||!sampleProof.engines.includes('chromium')||!sampleProof.engines.includes('webkit'))throw Error('REAL_END_TO_END_SAMPLE_PROOF_REQUIRED');
  quarantinedMICs=Array.isArray(sampleProof.quarantinedMICs)?sampleProof.quarantinedMICs:[];
  const successful=sample.filter(r=>sampleProof.successfulListingIds.includes(r.listingId));
  for(const mic of new Set(sample.map(r=>r.mic)))if(!successful.some(r=>r.mic===mic)&&!quarantinedMICs.includes(mic))throw Error('REPRESENTATIVE_VENUE_PROOF_REQUIRED');
  for(const ix of ['DAX','MDAX','SDAX','TECDAX','EURO_STOXX_50'])if(sample.some(r=>r.indexMemberships.includes(ix))&&!successful.some(r=>r.indexMemberships.includes(ix)))throw Error('REPRESENTATIVE_INDEX_PROOF_REQUIRED');
  if(sample.some(r=>r.shareClass==='PREFERRED_SHARE')&&!successful.some(r=>r.shareClass==='PREFERRED_SHARE'))throw Error('REPRESENTATIVE_SHARE_CLASS_PROOF_REQUIRED');
  const previouslyValidated=phase==='refresh'&&previousCheckpoint?.validatedSampleProofHash===sha(JSON.stringify(sampleProof))&&previousCheckpoint?.referenceHash===sha(JSON.stringify(listingMap));
  if(previouslyValidated)for(const r of candidates){const h=read(join(privateDir,'normalized',r.listingId+'.json'));
   if((h?sha(JSON.stringify(h)):null)!==(previousCheckpoint.currentHistoryHashes?.[r.listingId]??null))throw Error('CACHED_HISTORY_DRIFT_REVALIDATE');}
  if(!previouslyValidated)for(const id of sampleProof.successfulListingIds){const h=read(join(privateDir,'normalized',id+'.json'));
   if(!h||sampleProof.normalizedHistoryHashes?.[id]!==sha(JSON.stringify(h)))throw Error('SAMPLE_INPUT_DRIFT_REVALIDATE');}
 }
 let responseRefs=[];
 const onResponse=async response=>{const encoded=JSON.stringify(response),id=sha(encoded),path=join(privateDir,'source',id+'.json');write(path,response);responseRefs.push('sha256:'+id);};
 const client=Client.createMarketstackClient({sharedBudget:budget,maxCredits:opening.creditsRemaining,maxRequests:5000,maxRetries:2,onResponse});
 const mappings=Object.fromEntries(candidates.map(r=>[r.listingId,{symbol:r.providerSymbol,exchange:r.mic,mic:r.mic,isin:r.isin,securityId:r.securityId,listingId:r.listingId,
  currency:r.tradingCurrency,assetType:r.shareClass==='PREFERRED_SHARE'?'preferred_equity':'equity',shareClassVerified:r.shareClass==='PREFERRED_SHARE',
  mappingVerified:true,currencyVerified:true,mappingSource:r.mappingSource,currencySource:r.mappingSource}]));
 const provider=providerFactory?providerFactory({client,mappings,budget,onResponse}):Adapter.createMarketstackProvider({client,mappings});
 const ordered=phase==='sample'?sample:phase==='mandatory'?candidates.filter(r=>!sampleIds.has(r.listingId)):candidates;
 const histories={},decisions=phase==='mandatory'?(previousCheckpoint?.decisions?.filter(d=>d.phase==='SAMPLE')||[]):[],venueFailures=new Map(quarantinedMICs.map(m=>[m,3]));let sampleSuccesses=phase==='sample'?0:sampleProof.successfulListingIds.length;
 for(const r of rows){const h=read(join(privateDir,'normalized',r.listingId+'.json'));if(h&&h.isin===r.isin&&h.mic===r.mic&&h.currency===r.tradingCurrency)histories[r.listingId]=h;}
 for(const r of ordered){
  const samplePhase=sampleIds.has(r.listingId),block=(cause,nextStep)=>decisions.push({listingId:r.listingId,isin:r.isin,mic:r.mic,status:'BLOCKED',cause,nextStep,phase:phase==='refresh'?'REFRESH':samplePhase?'SAMPLE':'MANDATORY'});
  if(!samplePhase&&sampleSuccesses===0){block('PROVIDER_DATA_DEFECT','Resolve the representative end-to-end sample before broad import.');continue;}
  if((venueFailures.get(r.mic)||0)>=3){block('UNSUPPORTED_LISTING','Review three representative failures for this MIC; other venues continue.');continue;}
  responseRefs=[];const prior=read(join(privateDir,'normalized',r.listingId+'.json'));
  if(prior&&(prior.isin!==r.isin||prior.mic!==r.mic||prior.currency!==r.tradingCurrency)){block('MAPPING_ERROR','Review identity change without overwriting prior series.');continue;}
  const metadataState=read(join(privateDir,'metadata',r.listingId+'.json'));
  if(!metadataState||now()-Date.parse(metadataState.checkedAt)>30*86400000){
   const metadata=await provider.getMetadata(r.listingId);
   const independentIdentity=String(r.providerIdentityBasis||'').startsWith('HISTORICAL_EXACT_ISIN_MIC')&&r.mappingSource?.length>0;
   if(!metadata.available||metadata.data?.isin&&metadata.data.isin!==r.isin||!metadata.data?.isin&&!independentIdentity){block(metadata.available?'MAPPING_ERROR':reason(metadata.reason),'Verify exact provider identity or independent exact ISIN/MIC evidence; missing optional response ISIN is not invented.');venueFailures.set(r.mic,(venueFailures.get(r.mic)||0)+1);continue;}
   write(join(privateDir,'metadata',r.listingId+'.json'),{isin:r.isin,mic:r.mic,checkedAt:new Date(now()).toISOString(),data:metadata.data,sourceEvidence:responseRefs.slice()});
  }
  const quote=phase==='refresh'?null:await provider.getQuote(r.listingId,{frequency:'EOD'});
  if(quote&&!quote.available){block(reason(quote.reason),'Review latest-EOD identity and entitlement for this listing.');venueFailures.set(r.mic,(venueFailures.get(r.mic)||0)+1);continue;}
  const lastDate=quote?String(quote.data.timestamp).slice(0,10):null;if(quote&&(!date(lastDate)||lastDate>asOf)){block('PROVIDER_DATA_DEFECT','Correct future or invalid provider market date.');continue;}
  // Limited calendar-day overlap is retrieval only, never a session-completeness claim.
  const from=prior?.bars?.length?new Date(Date.parse(prior.bars.at(-1).date)-10*86400000).toISOString().slice(0,10):new Date(Date.parse(asOf)-2*366*86400000).toISOString().slice(0,10);
  const history=await provider.getHistoricalBars(r.listingId,{from,to:asOf,maxPages:2});
  if(!history.available){block(reason(history.reason),'Review the bounded history response; preserve prior history.');continue;}
  if(history.data.bars.some(b=>b.date<from||b.date>asOf)){block('PROVIDER_DATA_DEFECT','Provider returned bars outside the requested window.');continue;}
  const merged=mergeBars(prior?.bars,history.data.bars);const last=merged.bars.at(-1);
  if(!last||quote&&(last.date!==lastDate||last.close!==quote.data.last)){block('PROVIDER_DATA_DEFECT','Reconcile latest endpoint with canonical EOD history; no second product quote source.');continue;}
  const h={provider:'marketstack',source:'marketstack',apiVersion:'v2',isin:r.isin,mic:r.mic,currency:r.tradingCurrency,quoteUnit:r.quoteUnit,
   retrievedAt:quote?.data.retrieved_at||history.provenance?.retrieved_at||history.provenance?.ingestedAt||new Date(now()).toISOString(),sourceEvidence:[...new Set([...(prior?.sourceEvidence||[]),...responseRefs])],bars:merged.bars,restatements:merged.restatements,
   quarantined:history.data.anomalies,adjustmentStatus:{verified:false,priceSeriesType:'UNKNOWN',evidence:[]},
   quality:{status:'PARTIAL',quarantinedCandles:history.data.anomalies.length,completenessVerified:false,priceBasis:'PROVIDER_REPORTED_UNVERIFIED'}};
  write(join(privateDir,'normalized',r.listingId+'.json'),h);write(join(privateDir,'latest',r.listingId+'.json'),quote||{derivedFrom:'CANONICAL_HISTORY',data:{listingId:r.listingId,mic:r.mic,currency:r.tradingCurrency,last:last.close,date:last.date,kind:'EOD_CLOSE'}});histories[r.listingId]=h;
  decisions.push({listingId:r.listingId,isin:r.isin,mic:r.mic,status:'PARTIAL',cause:'UNKNOWN_ADJUSTMENT_BASIS',phase:phase==='refresh'?'REFRESH':samplePhase?'SAMPLE':'MANDATORY',
   latestDate:last.date,historyStart:merged.bars[0].date,bars:merged.bars.length,freshness:'UNKNOWN_LOCAL_CALENDAR_NOT_VERIFIED',restatements:merged.restatements,sourceEvidence:responseRefs});
  if(samplePhase)sampleSuccesses++;
  // Crash checkpoint contains private state, never an exported public artifact.
  write(join(privateDir,'checkpoint.json'),{asOf,referenceHash:sha(JSON.stringify(listingMap)),runId,decisions,validatedSampleProofHash:phase==='sample'?null:sha(JSON.stringify(sampleProof)),currentHistoryHashes:Object.fromEntries(Object.entries(histories).map(([id,h])=>[id,sha(JSON.stringify(h))])),budget:await budget.status()});
 }
 for(const r of rows.filter(r=>!r.providerSymbol))decisions.push({listingId:r.listingId,isin:r.isin,status:'BLOCKED',cause:'MAPPING_ERROR',nextStep:'Find an exact provider ISIN/MIC identity; do not guess the ticker suffix.'});
 const productRows=rows.map(r=>({...r,referencedIssuerId:r.companyId,companyId:null,companyAssociationStatus:'EXISTING_VU_COMPANY_ASSOCIATION_UNRESOLVED',logo:{status:'EXISTING_FALLBACK'}}));
 const converted=Object.fromEntries(Object.entries(histories).map(([id,h])=>[id,{...h,sourceEvidence:h.sourceEvidence.join('|')} ]));
 const result=materialize({rows:productRows,histories:converted,asOf,referenceAsOf:listingMap.asOf,out:previewOut});
 const status={schemaVersion:'de-eu-ingestion-status-1.0.0',asOf,runId,phase,referenceHash:sha(JSON.stringify(listingMap)),...result,sampleSuccesses,decisions,budget:await budget.status(),publicDisplay:false,scheduleActivated:false};
 write(join(privateDir,'de_eu_ingestion_status.json'),status);return status;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
 try{
  const result=await ingest({listingMap:JSON.parse(readFileSync(arg('listing-map'),'utf8')),accountEvidence:JSON.parse(readFileSync(arg('account-evidence'),'utf8')),
   privateDir:arg('private-dir'),previewOut:arg('preview-out'),asOf:arg('as-of'),runId:arg('run-id'),phase:arg('phase')||'sample',sampleProof:arg('sample-proof')?JSON.parse(readFileSync(arg('sample-proof'),'utf8')):null});
  console.log(JSON.stringify({listings:result.listings,series:result.series,sampleSuccesses:result.sampleSuccesses,requests:result.budget.requestsAttempted,estimatedCredits:result.budget.estimatedCreditsConsumed,publicDisplay:false}));
 }catch(e){console.error('DE/EU import stopped: '+(/^[A-Z0-9_]+$/.test(e.code||e.message)?e.code||e.message:'PRIVATE_INPUT_OR_IMPORT_FAILURE'));process.exitCode=1;}
}
