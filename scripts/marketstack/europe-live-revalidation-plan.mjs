/** Offline query plan: listing/date/provenance metadata only, never provider price payloads. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PLAN_SCHEMA='vu-europe-live-revalidation-plan-1';
export const QUERY_POLICY=Object.freeze({maximumWindowDays:365,maximumGapDays:180,paddingDays:2,broaderPaddingDays:45,pageLimit:1000,maximumPages:1,targetCredits:13000,hardCap:16000});
const hash=v=>createHash('sha256').update(v).digest('hex');
const stableHash=v=>hash(JSON.stringify(v));
const hashOK=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function day(d){if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d).toISOString().slice(0,10)!==d)throw Error('INVALID_TARGET_DATE');return Date.parse(d)/86400000;}
const iso=d=>new Date(d*86400000).toISOString().slice(0,10);
const shift=(d,n)=>iso(day(d)+n);
const ticker=s=>typeof s==='string'&&/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(s);
const ensure=(condition,code)=>{if(!condition)throw Error(code);};

/** Greedy coalescing covers every unique target exactly once. Bounded spans allow one
 * 1000-row page; response totals remain authoritative and completeness must fail closed. */
export function coalesceTargets(targets,policy=QUERY_POLICY){
 ensure(Number.isInteger(policy.maximumWindowDays)&&policy.maximumWindowDays>0&&policy.maximumWindowDays<=365,'INVALID_WINDOW_POLICY');
 const sorted=targets.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind)||a.reasonCode.localeCompare(b.reasonCode));
 const groups=[];
 for(const t of sorted){day(t.date);let g=groups.at(-1);if(!g||day(t.date)-day(g.at(-1).date)>policy.maximumGapDays||day(t.date)-day(g[0].date)>policy.maximumWindowDays-2*policy.paddingDays){g=[];groups.push(g);}g.push(t);}
 return groups.map((g,i)=>({windowId:'history-'+String(i+1).padStart(4,'0')+'-'+stableHash(g.map(t=>[t.date,t.kind,t.reasonCode])).slice(0,12),from:shift(g[0].date,-policy.paddingDays),to:shift(g.at(-1).date,policy.paddingDays),maxPages:1,targetDates:g.map(t=>({date:t.date,kind:t.kind,reasonCode:t.reasonCode}))}));
}

/** Explicit projection deliberately ignores all fields other than safe query metadata. */
export function buildRevalidationPlan({catalog,missing,quarantine,identityQuarantine=quarantine,analytics,actions,sourceCompleteness,sourceBindings,expectedSecurities=449,policy=QUERY_POLICY}){
 ensure(catalog?.securities?.length===expectedSecurities&&new Set(catalog.securities.map(s=>s.securityId)).size===expectedSecurities,'EXACT_CANONICAL_UNIVERSE_REQUIRED');
 ensure(hashOK(sourceBindings?.catalogSha256),'CATALOG_BINDING_REQUIRED');
 const bindings={};for(const [key,value]of Object.entries(sourceBindings)){ensure(/^[a-zA-Z0-9_]+Sha256$/.test(key)&&hashOK(value),'INVALID_SOURCE_BINDING');bindings[key]=value;}
 const sourceById=new Map((sourceCompleteness?.rows||[]).map(s=>[s.securityId,s]));
 const listings=catalog.securities.map(s=>{const l=s.listings?.find(l=>l.listingId===s.primaryListingId);ensure(l&&ticker(l.providerSymbol)&&/^[A-Z0-9]{4}$/.test(l.mic)&&typeof l.currency==='string'&&/^[A-Z]{3}$/.test(l.currency),'PRIMARY_LISTING_METADATA_REQUIRED');const source=sourceById.get(s.securityId);return {securityId:s.securityId,listingId:l.listingId,symbol:l.providerSymbol,mic:l.mic,currency:l.currency,isin:s.isin||null,canonicalTicker:s.canonicalTicker||null,aliases:[...new Set([...(l.aliases||[]),...(s.aliases||[])].filter(ticker))].filter(a=>a!==l.providerSymbol),windows:[],identityHolds:[],sourceEvidence:source?{sessionLedgerSha256:source.sessionLedger?.sha256||null,normalizedSha256:source.pipelineStages?.NORMALIZED?.sha256||null,approvedPointsSha256:source.pipelineStages?.APPROVED?.pointsSha256||null}:null};}).sort((a,b)=>a.securityId.localeCompare(b.securityId));
 const byId=new Map(listings.map(l=>[l.securityId,l])),targetMap=new Map(listings.map(l=>[l.securityId,new Map()]));
 const add=(securityId,date,kind,reasonCode)=>{ensure(byId.has(securityId),'TARGET_OUTSIDE_CANONICAL_UNIVERSE');day(date);ensure(['MISSING','QUARANTINE'].includes(kind)&&/^[A-Z0-9_]+$/.test(reasonCode),'INVALID_TARGET_KIND');targetMap.get(securityId).set([date,kind,reasonCode].join('|'),{date,kind,reasonCode});};
 for(const row of missing.rows||[]){const l=byId.get(row.securityId);ensure(l&&row.listingId===l.listingId&&row.mic===l.mic,'MISSING_LISTING_BINDING_MISMATCH');add(row.securityId,row.date,'MISSING','API_RESPONSE_OMISSION_VERIFIED');}
 for(const row of quarantine.rows||[]){ensure(byId.has(row.securityId),'QUARANTINE_OUTSIDE_UNIVERSE');if(row.candidateDisposition==='IDENTITY_REQUIRES_SOURCE_RESEARCH')continue;ensure(['INVALID_CURRENT_CLOSE','POSITIVE_CLOSE_ONLY_REVIEW_CANDIDATE'].includes(row.candidateDisposition),'UNKNOWN_QUARANTINE_DISPOSITION');add(row.securityId,row.date,'QUARANTINE',row.candidateDisposition);}
 for(const row of identityQuarantine.rows||[])if(row.candidateDisposition==='IDENTITY_REQUIRES_SOURCE_RESEARCH'||row.identityExcluded===true){ensure(byId.has(row.securityId),'IDENTITY_OUTSIDE_UNIVERSE');day(row.date);byId.get(row.securityId).identityHolds.push({date:row.date,reasonCode:'HISTORICAL_IDENTITY_NOT_ESTABLISHED',probePolicy:'NO_AUTOMATIC_RELEASE_FROM_CURRENT_METADATA'});}
 for(const row of analytics.rows||[])for(const bar of row.excludedDisplayOHLCBars||[]){ensure(typeof bar.date==='string','ANALYTICS_EXCLUSION_DATE_REQUIRED');add(row.securityId,bar.date,'QUARANTINE','DISPLAY_OHLC_REVIEW');}
 for(const l of listings){l.windows=coalesceTargets([...targetMap.get(l.securityId).values()],policy);l.identityHolds.sort((a,b)=>a.date.localeCompare(b.date));}
 const corporateActionWindows=[];
 const addAction=(c,type)=>{const l=byId.get(c.securityId);ensure(l&&l.listingId===c.listingId&&l.mic===c.mic,'ACTION_LISTING_BINDING_MISMATCH');const eventFrom=type==='STRONG_BREAK'?c.from:c.date,eventTo=type==='STRONG_BREAK'?c.to:c.date;day(eventFrom);day(eventTo);ensure(eventTo>=eventFrom,'INVALID_ACTION_INTERVAL');const caseId=type+':'+c.securityId+':'+eventFrom+':'+eventTo;let w=corporateActionWindows.find(w=>w.securityId===c.securityId&&w.from<=eventFrom&&w.to>=eventTo);if(w){w.caseIds.push(caseId);w.events.push({caseId,eventFrom,eventTo,type});return;}w={securityId:c.securityId,listingId:c.listingId,windowId:'action-'+stableHash([c.securityId,eventFrom,eventTo]).slice(0,16),from:shift(eventFrom,-7),to:shift(eventTo,7),maxPages:1,discontinuityId:caseId,caseIds:[caseId],events:[{caseId,eventFrom,eventTo,type}]};corporateActionWindows.push(w);};
 for(const c of actions.strongBreaks||[])addAction(c,'STRONG_BREAK');for(const c of actions.embeddedFactors||[])addAction(c,'EMBEDDED_FACTOR');
 const windows=listings.flatMap(l=>l.windows),targets=windows.flatMap(w=>w.targetDates),metadataCredits=listings.length,primaryHistoryCredits=windows.reduce((n,w)=>n+w.maxPages,0),actionCredits=corporateActionWindows.reduce((n,w)=>n+2*w.maxPages,0),mandatoryCredits=metadataCredits+primaryHistoryCredits+actionCredits;
 ensure(mandatoryCredits<=policy.targetCredits&&policy.targetCredits<=policy.hardCap,'MANDATORY_BATCH_EXCEEDS_TARGET_BUDGET');
 const reasonCounts={};for(const t of targets)reasonCounts[t.reasonCode]=(reasonCounts[t.reasonCode]||0)+1;
 const result={schema:PLAN_SCHEMA,version:1,sourceBindings:bindings,policy:{...QUERY_POLICY,...policy},listings,corporateActionWindows,coverage:{securities:listings.length,historyWindows:windows.length,missingSessions:targets.filter(t=>t.kind==='MISSING').length,quarantineTargets:targets.filter(t=>t.kind==='QUARANTINE').length,uniqueTargetSecurityDates:[...targetMap.values()].reduce((n,m)=>n+new Set([...m.values()].map(t=>t.date)).size,0),identityHoldDates:listings.reduce((n,l)=>n+l.identityHolds.length,0),strongBreakCases:(actions.strongBreaks||[]).length,embeddedFactorCases:(actions.embeddedFactors||[]).length,corporateActionWindows:corporateActionWindows.length,targetReasonCounts:reasonCounts},budget:{targetCredits:policy.targetCredits,hardCap:policy.hardCap,mandatoryMetadataCredits:metadataCredits,mandatoryHistoryReservedCredits:primaryHistoryCredits,mandatoryActionReservedCredits:actionCredits,mandatoryReservedCredits:mandatoryCredits,adaptiveCreditsWithinTarget:policy.targetCredits-mandatoryCredits,adaptiveCreditsBeforeHardCap:policy.hardCap-mandatoryCredits,fourHistoryVariantsEstimatedCredits:metadataCredits+primaryHistoryCredits*4+actionCredits,allRequestsSingleSymbol:true,semantics:'CONSERVATIVELY_RESERVED_NOT_OBSERVED_BILLING',retryPolicy:'NONE_AUTOMATIC',mandatoryCoverageReservedBeforeAdaptive:true},noPricesOrRawPayloads:true,productionPublication:false};
 result.planContentSha256=stableHash(result);return result;
}

/** CLI reads private offline evidence, emits only explicitly projected query metadata. */
export async function buildPlanFromFiles({catalogPath,missingPath,quarantinePath,identityQuarantinePath,analyticsPath,actionsPath,sourceCompletenessPath,outputPath}){
 const paths={catalog:catalogPath,missing:missingPath,quarantine:quarantinePath,identityQuarantine:identityQuarantinePath||quarantinePath,analytics:analyticsPath,actions:actionsPath,sourceCompleteness:sourceCompletenessPath};const inputs={},sourceBindings={};
 for(const [key,path]of Object.entries(paths)){ensure(typeof path==='string'&&path.length>0,'EXPLICIT_SOURCE_PATH_REQUIRED');const bytes=await readFile(path);inputs[key]=JSON.parse(bytes);sourceBindings[key+'Sha256']=hash(bytes);}
 const plan=buildRevalidationPlan({...inputs,sourceBindings});await mkdir(dirname(resolve(outputPath)),{recursive:true,mode:0o700});await writeFile(outputPath,JSON.stringify(plan)+'\n',{mode:0o600});return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(let i=2;i<process.argv.length;i+=2){ensure(process.argv[i].startsWith('--')&&process.argv[i+1],'INVALID_ARGUMENT');args[process.argv[i].slice(2)]=process.argv[i+1];}
 const plan=await buildPlanFromFiles(args);console.log(JSON.stringify({schema:plan.schema,coverage:plan.coverage,budget:plan.budget,planContentSha256:plan.planContentSha256,output:basename(args.outputPath)}));
}
