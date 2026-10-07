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
// Current v2 documentation limits the dedicated action feeds to the named
// US/China venues. The actual EU sample returned empty action feeds despite
// embedded EOD dividends. Preserve those observations; never certify empty
// pages as complete or repeat this unsupported request for every EU security.
const EU_ACTION_UNCOVERED_MICS=new Set(['XETR','XFRA','XAMS','XPAR','XBRU','XHEL','XLON','XSWX','XSTO','XCSE','XOSL','XMAD','XMIL','XWBO','XLIS']);
export function dedicatedActionCoverage(mic){return EU_ACTION_UNCOVERED_MICS.has(mic)?{
 available:false,reason:'documentedMarketNotCovered',verified:false,actionsComplete:false,embeddedObservationsPreserved:true,
 evidence:[{url:'https://docs.apilayer.com/marketstack/docs/marketstack-api-v2-v-2-0-0',retrievedOn:'2026-10-06',
 sha256:'c8e56f7c42a7df179237befddda6a0616e766c04733bb7d4d54f1ceb677ac117',scope:'DEDICATED_SPLITS_AND_DIVIDENDS_MARKETS'}]}:null;}
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const reason=r=>({entitlementRestricted:'ENTITLEMENT_BLOCKED',authError:'ENTITLEMENT_BLOCKED',dataUnavailable:'UNSUPPORTED_LISTING',identityMismatch:'MAPPING_ERROR',symbolMismatch:'MAPPING_ERROR',exchangeMismatch:'MAPPING_ERROR',isinMismatch:'MAPPING_ERROR',budgetUnverified:'ACCOUNT_BUDGET_UNVERIFIED',SHARED_BUDGET_EXCEEDED:'ACCOUNT_BUDGET_UNVERIFIED'})[r]||'PROVIDER_DATA_DEFECT';
export function sampleSelection(rows,size=15,listingIds){
 if(listingIds!==undefined){
  if(!Array.isArray(listingIds)||!listingIds.length||listingIds.length>20||new Set(listingIds).size!==listingIds.length)throw Error('FROZEN_SAMPLE_SELECTION_INVALID');
  const picked=listingIds.map(id=>rows.find(r=>r.listingId===id));
  if(picked.some(r=>!r||r.listingId!==require('../../core/identity.js').listingIdFor(r)))throw Error('FROZEN_SAMPLE_SELECTION_INVALID');
  for(const mic of new Set(rows.map(r=>r.mic)))if(!picked.some(r=>r.mic===mic))throw Error('FROZEN_SAMPLE_VENUE_COVERAGE_REQUIRED');
  for(const index of ['DAX','MDAX','SDAX','TECDAX','EURO_STOXX_50'])if(rows.some(r=>r.indexMemberships.includes(index))&&!picked.some(r=>r.indexMemberships.includes(index)))throw Error('FROZEN_SAMPLE_INDEX_COVERAGE_REQUIRED');
  if(rows.some(r=>r.shareClass==='PREFERRED_SHARE')&&!picked.some(r=>r.shareClass==='PREFERRED_SHARE'))throw Error('FROZEN_SAMPLE_SHARE_CLASS_COVERAGE_REQUIRED');
  return picked;
 }
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
export function mergeQuarantine(previous=[],incoming=[],validatedBars=[]){
 const corrected=new Set(validatedBars.map(b=>b.date)),byObservation=new Map();
 for(const q of previous){const d=String(q.date||'').slice(0,10);if(!corrected.has(d))byObservation.set(JSON.stringify(q),q);}
 for(const q of incoming)byObservation.set(JSON.stringify(q),q);
 return [...byObservation.values()].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.reason||'').localeCompare(String(b.reason||'')));
}

export function mergeQuarantineLedger(ledger=[],previous=[],incoming=[],previousEvidence=[],incomingEvidence=[],asOf){
 const entries=new Map(ledger.map(entry=>[entry.observationHash,entry]));
 for(const [observations,evidence,origin]of [[previous,previousEvidence,'EXISTING_QUARANTINE'],[incoming,incomingEvidence,'NEW_SOURCE_QUARANTINE']])for(const observation of observations){
  const observationHash=sha(JSON.stringify(observation));if(!entries.has(observationHash))entries.set(observationHash,{observationHash,observation,sourceEvidence:evidence.slice(),recordedAsOf:asOf,origin});
 }
 return [...entries.values()].sort((a,b)=>a.observationHash.localeCompare(b.observationHash));
}
export function incrementalHistoryWindow(prior,asOf,historyYears=5,policy=null){
 const priorLatestDate=prior?.bars?.at(-1)?.date||null;
 const overlapFrom=priorLatestDate?new Date(Date.parse(priorLatestDate)-(policy?.historyOverlapDays||10)*86400000).toISOString().slice(0,10):new Date(Date.parse(asOf)-historyYears*366*86400000).toISOString().slice(0,10);
 const cappedFrom=policy?.maxLookbackDays?new Date(Date.parse(asOf)-policy.maxLookbackDays*86400000).toISOString().slice(0,10):overlapFrom,from=overlapFrom<cappedFrom?cappedFrom:overlapFrom;
 return {from,to:asOf,overlapDays:policy?.historyOverlapDays||10,maxLookbackDays:policy?.maxLookbackDays||null,priorLatestDate,boundedGapRemains:from>overlapFrom&&from>(priorLatestDate||'')};
}
function incrementalPolicy(listingMap,accountEvidence){
 const policy=listingMap.ingestionPolicy;if(policy===undefined)return null;
 if(policy?.schemaVersion!=='de-eu-incremental-policy-1.0.0'||policy.mode!=='EXISTING_ACCEPTED_SERIES'||policy.latestEod!==true||policy.historyOverlapDays!==10||policy.skipDocumentedUncoveredDedicatedActions!==true||policy.dedicatedActionCoverageSourceHash!==dedicatedActionCoverage('XETR').evidence[0].sha256||!policy.cachedHistoryHashes||typeof policy.cachedHistoryHashes!=='object'||Array.isArray(policy.cachedHistoryHashes)||(policy.maxLookbackDays!==undefined&&(!Number.isSafeInteger(policy.maxLookbackDays)||policy.maxLookbackDays<10||policy.maxLookbackDays>45)))throw Error('FROZEN_INCREMENTAL_POLICY_INVALID');
 if(accountEvidence?.kind!=='USER_AUTHORIZED_BOUNDED_RUN'||accountEvidence.referenceHash!==sha(JSON.stringify(listingMap)))throw Error('INCREMENTAL_POLICY_AUTHORIZATION_REQUIRED');
 return policy;
}
export async function ingest({listingMap,accountEvidence,privateDir,previewOut,asOf,runId,providerFactory,now=Date.now,phase='sample',sampleProof=null,historyYears=5}={}){
 if(!date(asOf)||!runId)throw Error('FIXED_AS_OF_AND_RUN_ID_REQUIRED');assertPrivateOutput(privateDir,{allowCache:true});assertPrivateOutput(previewOut);
 if(listingMap?.schemaVersion!=='de-eu-listing-map-1.0.0'||!date(listingMap.asOf)||listingMap.asOf>asOf||(phase!=='refresh'&&listingMap.asOf!==asOf))throw Error('FROZEN_REFERENCE_REQUIRED');
 const policy=incrementalPolicy(listingMap,accountEvidence);
 if(![2,5].includes(historyYears))throw Error('BOUNDED_HISTORY_WINDOW_REQUIRED');
 const budget=createSharedBudget({file:join(privateDir,'shared-budget.json'),runId,evidence:accountEvidence,now});
 // Account evidence is validated before any client, URL, or request exists.
 const opening=await budget.status();const rows=listingMap.listings.filter(r=>r.mappingStatus==='VERIFIED');
 const candidates=rows.filter(r=>r.providerSymbol&&r.quoteUnit==='MAJOR');const requiredBaseCredits=candidates.length*(policy?2:phase==='refresh'?2:6);
 if(opening.creditsRemaining<requiredBaseCredits)throw Error('ACCOUNT_BUDGET_INSUFFICIENT_FOR_MANDATORY_BASE');
 const write=(p,v)=>{rejectSymlinkAncestors(p);mkdirSync(resolve(p,'..'),{recursive:true,mode:0o700});writeFileSync(p,JSON.stringify(v)+'\n',{mode:0o600});};
 const read=p=>{rejectSymlinkAncestors(p);return existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null;};
 const sample=sampleSelection(candidates,15,listingMap.sampleListingIds),sampleIds=new Set(sample.map(r=>r.listingId));
 if(!['sample','mandatory','refresh'].includes(phase))throw Error('INVALID_IMPORT_PHASE');
 const referenceHash=sha(JSON.stringify(listingMap)),checkpointPath=join(privateDir,'checkpoints',referenceHash+'.json');
 const latestPath=join(privateDir,'checkpoint.json'),legacyCheckpoint=read(latestPath);
 // Preserve an existing private legacy cohort before a different reference
 // writes the latest summary. Only a validated digest can select a pathname.
 if(/^[a-f0-9]{64}$/.test(legacyCheckpoint?.referenceHash||'')){
  const legacyPath=join(privateDir,'checkpoints',legacyCheckpoint.referenceHash+'.json');
  if(!read(legacyPath))write(legacyPath,legacyCheckpoint);
 }
 const scopedCheckpoint=read(checkpointPath);
 if(scopedCheckpoint&&scopedCheckpoint.referenceHash!==referenceHash)throw Error('REFERENCE_CHECKPOINT_MISMATCH');
 const previousCheckpoint=phase==='sample'?null:scopedCheckpoint||(legacyCheckpoint?.referenceHash===referenceHash?legacyCheckpoint:null);
 const checkpoint=state=>{write(checkpointPath,state);write(latestPath,state);};
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
 let ordered=phase==='sample'?sample:phase==='mandatory'?candidates.filter(r=>!sampleIds.has(r.listingId)):candidates;
 const histories={},currentHistoryHashes={},decisions=phase==='mandatory'?(previousCheckpoint?.decisions?.filter(d=>d.phase==='SAMPLE')||[]):[],venueFailures=new Map(quarantinedMICs.map(m=>[m,3])),actionEndpointBlocks=new Set();let sampleSuccesses=phase==='sample'?0:sampleProof.successfulListingIds.length;
 for(const r of rows){const h=read(join(privateDir,'normalized',r.listingId+'.json'));if(h&&h.isin===r.isin&&h.mic===r.mic&&h.currency===r.tradingCurrency){histories[r.listingId]=h;currentHistoryHashes[r.listingId]=sha(JSON.stringify(h));}}
 if(policy){
  const expectedHashes=phase==='sample'?policy.cachedHistoryHashes:previousCheckpoint?.currentHistoryHashes||policy.cachedHistoryHashes;
  if(Object.keys(policy.cachedHistoryHashes).length!==candidates.length||candidates.some(r=>!histories[r.listingId]?.bars?.length||histories[r.listingId].provider!=='marketstack'||histories[r.listingId].apiVersion!=='v2'||histories[r.listingId].quoteUnit!==r.quoteUnit||!/^[a-f0-9]{64}$/.test(policy.cachedHistoryHashes[r.listingId]||'')||currentHistoryHashes[r.listingId]!==expectedHashes[r.listingId]))throw Error('INCREMENTAL_CACHED_HISTORY_DRIFT');
 }

 if(phase==='refresh'){
  // Daily overlap updates accepted histories only. Mapping failures need an
  // explicit revalidation run, not repeated paid metadata requests every day.
  const eligible=new Set(candidates.filter(r=>{
   const h=histories[r.listingId],m=read(join(privateDir,'metadata',r.listingId+'.json'));
   return h?.bars?.length>0&&h.provider==='marketstack'&&h.apiVersion==='v2'&&h.quoteUnit===r.quoteUnit&&
    m?.isin===r.isin&&m.mic===r.mic&&m.data?.providerSymbol===r.providerSymbol&&m.data?.exchange===r.mic&&m.data?.currency===r.tradingCurrency;
  }).map(r=>r.listingId));
  for(const r of candidates.filter(r=>!eligible.has(r.listingId))){
   const priorDecision=previousCheckpoint?.decisions?.find(d=>d.listingId===r.listingId&&d.status==='BLOCKED');
   decisions.push(priorDecision?{...priorDecision,phase:'REFRESH_SKIPPED',refreshQueried:false,refreshAsOf:asOf}:
    {listingId:r.listingId,isin:r.isin,mic:r.mic,status:'NOT_TESTED',cause:histories[r.listingId]?'MAPPING_ERROR':'MISSING_HISTORY',phase:'REFRESH_SKIPPED',refreshQueried:false,asOf,sourceEvidence:[],nextStep:'Explicitly revalidate this selected identity and initial history before daily refresh.'});
  }
  ordered=ordered.filter(r=>eligible.has(r.listingId));
 }
 for(const r of ordered){
  // Scope evidence before every early gate, including listings never queried.
  responseRefs=[];
  const remaining=await budget.status();console.log(JSON.stringify({stage:'BEFORE_SELECTED_LISTING',phase,
   estimatedBatchCredits:policy?2:phase==='refresh'?1:6,requestsSoFar:remaining.requestsAttempted,consumedCredits:remaining.estimatedCreditsConsumed,additionalBudgetScope:remaining.additionalBudgetScope||null,remainingRunCredits:remaining.creditsRemaining,listingsCompleted:decisions.length,listingsOpen:ordered.length-decisions.length}));
  const samplePhase=sampleIds.has(r.listingId),block=(cause,nextStep)=>decisions.push({listingId:r.listingId,isin:r.isin,mic:r.mic,status:'BLOCKED',cause,nextStep,phase:phase==='refresh'?'REFRESH':samplePhase?'SAMPLE':'MANDATORY',sourceEvidence:responseRefs.slice(),testedAt:new Date(now()).toISOString(),asOf});
  if(!samplePhase&&sampleSuccesses===0){block('PROVIDER_DATA_DEFECT','Resolve the representative end-to-end sample before broad import.');continue;}
  if(quarantinedMICs.includes(r.mic)){block('MAPPING_ERROR','The representative identity for this MIC was not validated; no market-wide provider defect is inferred. Resolve the exact listing evidence first.');continue;}
  if((venueFailures.get(r.mic)||0)>=3){block('UNSUPPORTED_LISTING','Review three representative failures for this MIC; other venues continue.');continue;}
  const prior=read(join(privateDir,'normalized',r.listingId+'.json'));
  if(prior&&(prior.isin!==r.isin||prior.mic!==r.mic||prior.currency!==r.tradingCurrency)){block('MAPPING_ERROR','Review identity change without overwriting prior series.');continue;}
  const metadataState=read(join(privateDir,'metadata',r.listingId+'.json'));
  const checkedAt=Date.parse(metadataState?.checkedAt),checkedNow=now(),mapping=mappings[r.listingId];
  const evidence=r.providerIdentityEvidence;
  const independentIdentity=String(r.providerIdentityBasis||'').startsWith('HISTORICAL_EXACT_ISIN_MIC')&&r.mappingSource?.length>0&&
   evidence?.providerSymbol===mapping.symbol&&evidence?.isin===r.isin&&evidence?.mic===r.mic&&/^[a-f0-9]{64}$/.test(evidence?.sourceHash||'')&&
   typeof evidence?.sourcePath==='string'&&evidence.sourcePath.trim().length>0;
  const reuseMetadata=Number.isFinite(checkedAt)&&checkedAt<=checkedNow&&checkedNow-checkedAt<=30*86400000&&
   metadataState.isin===r.isin&&metadataState.mic===r.mic&&metadataState.data?.providerSymbol===mapping.symbol&&
   metadataState.data?.exchange===mapping.exchange&&metadataState.data?.currency===mapping.currency&&metadataState.data?.assetType===mapping.assetType&&
   (metadataState.data?.isin===r.isin||!metadataState.data?.isin&&independentIdentity);
  if(!reuseMetadata){
   const metadata=await provider.getMetadata(r.listingId);
   if(!metadata.available||metadata.data?.isin&&metadata.data.isin!==r.isin||!metadata.data?.isin&&!independentIdentity){block(metadata.available?'MAPPING_ERROR':reason(metadata.reason),'Verify exact provider identity or independent exact ISIN/MIC evidence; missing optional response ISIN is not invented.');if(['authError','quotaExceeded'].includes(metadata.reason))break;continue;}
   write(join(privateDir,'metadata',r.listingId+'.json'),{isin:r.isin,mic:r.mic,checkedAt:new Date(now()).toISOString(),data:metadata.data,sourceEvidence:responseRefs.slice()});
  }
  const quote=phase==='refresh'&&!policy?null:await provider.getQuote(r.listingId,{frequency:'EOD'});
  if(quote&&!quote.available){block(reason(quote.reason),'Review latest-EOD identity and entitlement for this listing.');if(['authError','quotaExceeded'].includes(quote.reason))break;venueFailures.set(r.mic,(venueFailures.get(r.mic)||0)+1);continue;}
  const lastDate=quote?String(quote.data.timestamp).slice(0,10):null;if(quote&&(!date(lastDate)||lastDate>asOf)){block('PROVIDER_DATA_DEFECT','Correct future or invalid provider market date.');continue;}
  // Limited calendar-day overlap is retrieval only, never a session-completeness claim.
  const retrieval=incrementalHistoryWindow(prior,asOf,historyYears,policy),from=retrieval.from;
  const history=await provider.getHistoricalBars(r.listingId,{from,to:asOf,maxPages:2});
  if(!history.available){block(reason(history.reason),'Review the bounded history response; preserve prior history.');if(['authError','quotaExceeded'].includes(history.reason))break;continue;}
  if(history.data.bars.some(b=>b.date<from||b.date>asOf)){block('PROVIDER_DATA_DEFECT','Provider returned bars outside the requested window.');continue;}
  const merged=mergeBars(prior?.bars,history.data.bars);const last=merged.bars.at(-1);
  if(!last||quote&&(last.date!==lastDate||last.close!==quote.data.last)){block('PROVIDER_DATA_DEFECT','Reconcile latest endpoint with canonical EOD history; no second product quote source.');continue;}
  const actions={...prior?.corporateActions};let terminalActionFailure=false;
  if(phase!=='refresh'&&typeof provider.getActionEvents==='function')for(const kind of ['splits','dividends']){
   const uncovered=(phase==='mandatory'||policy?.skipDocumentedUncoveredDedicatedActions)&&dedicatedActionCoverage(r.mic);
   if(uncovered){actions[kind]=uncovered;write(join(privateDir,'actions',r.listingId+'-'+kind+'.json'),uncovered);continue;}
   if(actionEndpointBlocks.has(kind)){actions[kind]={available:false,reason:'entitlementRestricted',priorRepresentativeFailure:true};continue;}
   const action=await provider.getActionEvents(r.listingId,kind,{from,to:asOf,maxPages:2});actions[kind]=action;
   write(join(privateDir,'actions',r.listingId+'-'+kind+'.json'),action);
   if(action.reason==='entitlementRestricted')actionEndpointBlocks.add(kind);
   if(['authError','quotaExceeded'].includes(action.reason)){terminalActionFailure=true;break;}
  }
  const quarantine=mergeQuarantine(prior?.quarantined,history.data.anomalies,history.data.bars);
  const quarantineLedger=mergeQuarantineLedger(prior?.quarantineLedger,prior?.quarantined,history.data.anomalies,prior?.sourceEvidence||[],responseRefs,asOf);
  const priorBars=new Map((prior?.bars||[]).map(bar=>[bar.date,bar])),incomingBars=new Map(history.data.bars.map(bar=>[bar.date,bar]));
  const newRestatements=merged.restatements.map(change=>({...change,previousBarHash:sha(JSON.stringify(priorBars.get(change.date))),incomingBarHash:sha(JSON.stringify(incomingBars.get(change.date))),sourceEvidence:responseRefs.slice(),asOf}));
  const legacyRestatements=prior?.restatementLedger||((prior?.restatements||[]).map(change=>({...change,legacy:true,sourceEvidence:(prior.sourceEvidence||[]).slice(),hashBasis:'PREVIOUS_BAR_HASH_NOT_RECORDED'})));
  const restatementLedger=[...new Map([...legacyRestatements,...newRestatements].map(entry=>[sha(JSON.stringify(entry)),entry])).values()];
  const priorQuarantineDates=new Set((prior?.quarantined||[]).map(q=>String(q.date||'').slice(0,10)));
  const correctionEvidence=history.data.bars.filter(bar=>priorQuarantineDates.has(bar.date)).map(bar=>({date:bar.date,incomingBarHash:sha(JSON.stringify(bar)),quarantinedObservationHashes:quarantineLedger.filter(entry=>String(entry.observation.date||'').slice(0,10)===bar.date).map(entry=>entry.observationHash),sourceEvidence:responseRefs.slice(),asOf}));
  const quarantineCorrections=[...new Map([...(prior?.quarantineCorrections||[]),...correctionEvidence].map(entry=>[sha(JSON.stringify(entry)),entry])).values()];
  const h={provider:'marketstack',source:'marketstack',apiVersion:'v2',isin:r.isin,mic:r.mic,currency:r.tradingCurrency,quoteUnit:r.quoteUnit,corporateActions:actions,
   retrievedAt:quote?.data.retrieved_at||history.provenance?.retrieved_at||history.provenance?.ingestedAt||new Date(now()).toISOString(),sourceEvidence:[...new Set([...(prior?.sourceEvidence||[]),...responseRefs])],bars:merged.bars,restatements:merged.restatements,
   quarantined:quarantine,quarantineLedger,quarantineCorrections,restatementLedger,...(policy?{incrementalRetrieval:retrieval}:{}),adjustmentStatus:{verified:false,priceSeriesType:'UNKNOWN',evidence:[]},
   quality:{status:'PARTIAL',quarantinedCandles:quarantine.length,originalQuarantinedCandles:quarantineLedger.length,completenessVerified:false,priceBasis:'PROVIDER_REPORTED_UNVERIFIED'}};
  write(join(privateDir,'normalized',r.listingId+'.json'),h);write(join(privateDir,'latest',r.listingId+'.json'),quote||{derivedFrom:'CANONICAL_HISTORY',data:{listingId:r.listingId,mic:r.mic,currency:r.tradingCurrency,last:last.close,date:last.date,kind:'EOD_CLOSE'}});histories[r.listingId]=h;currentHistoryHashes[r.listingId]=sha(JSON.stringify(h));
  decisions.push({listingId:r.listingId,isin:r.isin,mic:r.mic,status:'PARTIAL',cause:'UNKNOWN_ADJUSTMENT_BASIS',phase:phase==='refresh'?'REFRESH':samplePhase?'SAMPLE':'MANDATORY',
   latestDate:last.date,historyStart:merged.bars[0].date,bars:merged.bars.length,freshness:'UNKNOWN_LOCAL_CALENDAR_NOT_VERIFIED',restatements:merged.restatements,sourceEvidence:responseRefs});
  if(samplePhase&&(!policy||phase==='sample'))sampleSuccesses++;
  // Crash checkpoint contains private state, never an exported public artifact.
  checkpoint({asOf,referenceHash,runId,decisions,validatedSampleProofHash:phase==='sample'?null:sha(JSON.stringify(sampleProof)),currentHistoryHashes,budget:await budget.status()});
  if(terminalActionFailure)break;
 }
 for(const r of rows.filter(r=>!r.providerSymbol))decisions.push({listingId:r.listingId,isin:r.isin,status:'BLOCKED',cause:'MAPPING_ERROR',nextStep:'Find an exact provider ISIN/MIC identity; do not guess the ticker suffix.',sourceEvidence:[],testedAt:new Date(now()).toISOString(),asOf});
 for(const r of rows.filter(r=>r.quoteUnit!=='MAJOR'))decisions.push({listingId:r.listingId,isin:r.isin,status:'BLOCKED',cause:'MISSING_FX_OR_SHARE_BASIS',nextStep:'Verify the quotation unit and a compatible canonical adapter without currency conversion or an inferred FX basis.',sourceEvidence:[],testedAt:new Date(now()).toISOString(),asOf});
 const productRows=rows.map(r=>({...r,referencedIssuerId:r.referencedIssuerId||r.companyId||null,companyId:null,companyAssociationStatus:'EXISTING_VU_COMPANY_ASSOCIATION_UNRESOLVED',logo:{status:'EXISTING_FALLBACK'}}));
 const converted=Object.fromEntries(Object.entries(histories).map(([id,h])=>[id,{...h,sourceEvidence:h.sourceEvidence.join('|')} ]));
 const result=materialize({rows:productRows,histories:converted,asOf,referenceAsOf:listingMap.asOf,out:previewOut});
 const status={schemaVersion:'de-eu-ingestion-status-1.0.0',asOf,runId,phase,referenceHash:sha(JSON.stringify(listingMap)),...result,sampleSuccesses,decisions,budget:await budget.status(),publicDisplay:false,scheduleActivated:false};
 checkpoint({asOf,referenceHash,runId,decisions,validatedSampleProofHash:phase==='sample'?null:sha(JSON.stringify(sampleProof)),currentHistoryHashes,budget:status.budget});
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
