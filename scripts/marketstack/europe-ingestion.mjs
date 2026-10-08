/** Bounded private product ingestion, not capability probing or publication. */
import {mkdirSync,writeFileSync,readFileSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,join,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createPublicKey,verify,constants} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {EUROPE_EXCHANGE_PLAN,validIsin} from './europe-universe.mjs';
const require=createRequire(import.meta.url);
const {createAuditAdapter,normalizeObservation}=require('../../providers/marketstack/audit-adapter.js');
const {estimateCredits}=require('../../providers/marketstack/client.js');
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const ALLOCATIONS=Object.freeze({discovery:1000,foundation:14000,completion:10000});
const EUROPE_MICS=new Set(EUROPE_EXCHANGE_PLAN.flatMap(x=>x.mics));
export function privateRoot(path){
 if(!isAbsolute(path||''))throw Error('ABSOLUTE_PRIVATE_OUTPUT_REQUIRED');
 const out=resolve(path),r=relative(ROOT,out);if(!(r==='..'||r.startsWith('..'+sep)||isAbsolute(r)))throw Error('PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');
 for(let p=out;;p=dirname(p)){try{if(lstatSync(p).isSymbolicLink())throw Error('PRIVATE_OUTPUT_SYMLINK_REFUSED');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}return out;
}
export function validatePlan(plan){
 if(plan?.version!==1||!Object.hasOwn(ALLOCATIONS,plan.lease)||plan.maxCredits!==ALLOCATIONS[plan.lease])throw Error('INVALID_EUROPE_ALLOCATION');
 if(!Array.isArray(plan.operations)||plan.operations.length>8000)throw Error('INVALID_EUROPE_OPERATIONS');
 const allowed=new Set(['directory','search','metadata','tickerInfo','latest','latestBatch','history','splits','dividends','snapshot','holdings','etfs']);
 for(const op of plan.operations){if(!allowed.has(op.kind))throw Error('INVALID_INGESTION_OPERATION');if(op.kind==='directory'&&!EUROPE_MICS.has(op.mic))throw Error('INVALID_DIRECTORY_MIC');
  if(!Number.isInteger(op.maxPages??1)||(op.maxPages??1)<1||(op.maxPages??1)>100)throw Error('INVALID_PAGE_BOUND');
  if(['metadata','tickerInfo','holdings'].includes(op.kind)&&typeof op.symbol!=='string')throw Error('SYMBOL_REQUIRED');
  if(['metadata','tickerInfo'].includes(op.kind)&&!EUROPE_MICS.has(op.mic))throw Error('EUROPE_METADATA_SCOPE_REQUIRED');
  if(op.kind==='search'&&!EUROPE_MICS.has(op.mic))throw Error('EUROPE_SEARCH_SCOPE_REQUIRED');
  if(op.kind==='latestBatch'&&(!EUROPE_MICS.has(op.mic)||!Array.isArray(op.symbols)||op.symbols.length<1||op.symbols.length>100||op.symbols.some(x=>typeof x!=='string'||!x||x.includes(','))))throw Error('INVALID_EUROPE_LATEST_BATCH');
  if(op.kind==='holdings'&&op.market!=='EUROPE'&&!(op.comparisonOnly===true&&['VOO','VTI','SCHD'].includes(op.symbol)))throw Error('ETF_SCOPE_REQUIRED');
  if(['latest','history','splits','dividends','snapshot'].includes(op.kind)&&(!op.listing?.providerTicker||!/^[A-Z0-9]{4}$/.test(op.listing.mic||'')))throw Error('LISTING_REQUIRED');
  if(op.listing&&!EUROPE_MICS.has(op.listing.mic))throw Error('US_LISTINGS_PROTECTED');
  if(op.requiresLatest!==undefined&&typeof op.requiresLatest!=='boolean')throw Error('INVALID_LATEST_PRECONDITION');
  if(op.requiresLatest&&(!op.listing||!plan.operations.slice(0,plan.operations.indexOf(op)).some(x=>x.kind==='latestBatch'&&x.mic===op.listing.mic&&x.symbols?.includes(op.listing.providerTicker)&&x.eligibleSessions?.length)))throw Error('LATEST_PRECONDITION_BOUND_PRIOR_BATCH_REQUIRED');
  if(op.eligibleSessions!==undefined&&(!Array.isArray(op.eligibleSessions)||op.eligibleSessions.length<1||op.eligibleSessions.length>3||op.eligibleSessions.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)))throw Error('INVALID_LATEST_ELIGIBLE_SESSIONS');
  if(op.retry504Once!==undefined&&typeof op.retry504Once!=='boolean')throw Error('INVALID_RETRY_POLICY');
 }
 const endpoints={directory:'/exchanges/XXXX/tickers',search:'/tickerslist',metadata:'/tickers/EXACT',tickerInfo:'/tickerinfo',latest:'/eod/latest',latestBatch:'/eod/latest',history:'/eod',splits:'/splits',dividends:'/dividends',snapshot:'/stockprice',holdings:'/etfholdings',etfs:'/etflist'};
 const estimate=plan.operations.reduce((n,o)=>n+estimateCredits(endpoints[o.kind],o.symbols?{symbols:o.symbols.join(',')}:o.listing?{symbols:o.listing.providerTicker}:{})*(o.maxPages??1)*(o.retry504Once?2:1),0);
 if(estimate>plan.maxCredits)throw Error('PLANNED_BATCH_EXCEEDS_ALLOCATION');return {estimatedMaximumCredits:estimate,operations:plan.operations.length};
}
export function signedPayload(marker){return JSON.stringify({version:1,branch:'marketstack-europe-foundation',lease:marker.lease,sourceSha:marker.sourceSha,planHash:marker.planHash});}
export function verifyIngestionMarker(marker,{before,parents,changedPaths,plan,publicKey}){
 validatePlan(plan);
 if(marker?.version!==1||marker.lease!==plan.lease||marker.sourceSha!==before||!/^[a-f0-9]{40}$/.test(before||'')||parents?.length!==1||parents[0]!==before||changedPaths?.length!==1||changedPaths[0]!=='scripts/marketstack/europe-live-trigger.json'||marker.planHash!==hash(JSON.stringify(plan)))throw Error('EUROPE_SIGNED_SOURCE_MISMATCH');
 if(!verify('sha256',Buffer.from(signedPayload(marker)),{key:createPublicKey(publicKey),padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(marker.signature||'','base64')))throw Error('EUROPE_SIGNATURE_INVALID');return true;
}
export async function ingestEurope({plan,out,apiKey=process.env.MARKETSTACK_API_KEY,fetchImpl,budgetFactory,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const planned=validatePlan(plan);out=privateRoot(out);if(!apiKey)throw Error('MARKETSTACK_API_KEY_NOT_CONFIGURED');
 mkdirSync(out,{recursive:true,mode:0o700});if(existsSync(join(out,'credits.json')))throw Error('INGESTION_REENTRY_REFUSED');
 const {createEuropeBudget}=await import('./europe-credits.mjs');
 const budget=(budgetFactory??createEuropeBudget)(join(out,'credits.json'),{maxCredits:plan.maxCredits,runId:plan.lease});
 const rawDir=join(out,'raw'),normalizedDir=join(out,'normalized');mkdirSync(rawDir,{mode:0o700});mkdirSync(normalizedDir,{mode:0o700});
 const write=(file,obj)=>writeFileSync(file,JSON.stringify(obj)+'\n',{mode:0o600});
 let sequence=0,terminalReason=null;const manifest=[],results=[],metadataAdmission=new Map(),latestAdmission=new Map();
 const api=createAuditAdapter({apiKey,fetchImpl,sharedBudget:budget,maxCredits:plan.maxCredits,maxRequests:plan.maxCredits,maxRetries:0,cacheTtlMs:0,timeoutMs:90000,minIntervalMs:fetchImpl?0:250,endpointIntervals:fetchImpl?{'/stockprice':0}:undefined,
  onResponse:async response=>{const id=String(++sequence).padStart(6,'0'),sha256=hash(response.rawText);writeFileSync(join(rawDir,id+'.json'),response.rawText,{mode:0o600});const meta={...response,rawText:undefined,body:undefined,id,sha256};write(join(rawDir,id+'.meta.json'),meta);manifest.push(meta);}});
 async function perform(op){const o={maxPages:op.maxPages??1,limit:1000,from:op.from,to:op.to};
  if(op.requiresMetadata&&op.listing&&!metadataAdmission.get(op.listing.mic+':'+op.listing.providerTicker))return {ok:false,reason:'METADATA_IDENTITY_UNRESOLVED',skipped:true};
  if(op.requiresLatest&&op.listing&&!latestAdmission.get(op.listing.mic+':'+op.listing.providerTicker))return {ok:false,reason:'LATEST_VALID_SCOPED_OBSERVATION_REQUIRED',skipped:true};
  switch(op.kind){case'tickerInfo':return api.getTickerInfo(op.symbol);case'directory':return api.listExchangeTickers(op.mic,o);case'search':return api.searchTicker(op.query,{...o,exchange:op.mic});
  case'metadata':{const r=await api.getTicker(op.symbol);const matches=(r.observations??[]).filter(x=>{const raw=x.raw,n=x.normalized,mics=[n.providerExchange,...(raw.stock_exchanges??[]).map(e=>e.mic||e.exchange_mic)].filter(Boolean);return n.providerTicker===op.symbol&&mics.includes(op.mic)&&validIsin(n.isin)&&(!op.expectedIsin||n.isin===op.expectedIsin)&&raw.active!==false&&raw.is_active!==false&&!(op.assetKind==='EQUITY'&&(/\b(ETF|UCITS|FUND|WARRANT|CERTIFICATE|RIGHTS?|BOND|UNITS?|ADR|GDR)\b/i.test(n.name||'')||/ETF|FUND|WARRANT|CERTIFICATE|RIGHT|BOND|UNIT|ADR|GDR|DEBT/i.test(n.assetType||'')));});metadataAdmission.set(op.mic+':'+op.symbol,r.ok&&matches.length===1);return {...r,ingestionIdentityMatched:matches.length===1};}
  case'latestBatch':{for(const symbol of op.symbols)latestAdmission.set(op.mic+':'+symbol,false);const symbols=op.requiresMetadata?op.symbols.filter(s=>metadataAdmission.get(op.mic+':'+s)):op.symbols;if(!symbols.length)return {ok:false,reason:'METADATA_IDENTITY_UNRESOLVED',skipped:true};const r=await api.client.paginate('/eod/latest',{symbols:symbols.join(','),exchange:op.mic,limit:1000},{maxPages:op.maxPages??1,cacheTtlMs:0});const expected=new Set(symbols),observations=(r.data??[]).map(raw=>normalizeObservation(raw,{kind:'EOD',retrievedAt:r.retrievedAt}));const scoped=observations.filter(x=>expected.has(x.normalized.providerTicker)&&x.normalized.providerExchange===op.mic),counts=new Map();for(const x of scoped)counts.set(x.normalized.providerTicker,(counts.get(x.normalized.providerTicker)??0)+1);const missingSymbols=symbols.filter(s=>!counts.has(s)),ambiguousSymbols=symbols.filter(s=>(counts.get(s)??0)>1),data=scoped.filter(x=>counts.get(x.normalized.providerTicker)===1),rejectedObservations=observations.filter(x=>!data.includes(x)),listingCoverageComplete=missingSymbols.length===0&&ambiguousSymbols.length===0&&rejectedObservations.length===0;for(const x of data){const n=x.normalized,d=n.tradingDate,valid=Boolean(op.eligibleSessions?.length)&&typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d<=new Date().toISOString().slice(0,10)&&(!op.eligibleSessions||op.eligibleSessions.includes(d))&&[n.open,n.high,n.low,n.close].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)&&n.high>=Math.max(n.open,n.close,n.low)&&n.low<=Math.min(n.open,n.close,n.high)&&typeof n.volume==='number'&&Number.isFinite(n.volume)&&n.volume>=0;latestAdmission.set(op.mic+':'+n.providerTicker,valid);}return {...r,ok:r.ok&&listingCoverageComplete,complete:r.complete&&listingCoverageComplete,reason:listingCoverageComplete?r.reason:'LATEST_LISTING_COVERAGE_INCOMPLETE',paginationComplete:r.complete,listingCoverageComplete,missingSymbols,ambiguousSymbols,raw:r.rawPages,data,rejectedObservations,requestedSymbols:symbols,canonicalAdmission:false};}
  case'latest':return api.getLatestEOD(op.listing,o);case'history':return api.getHistoricalEOD(op.listing,o);case'splits':return api.getSplits(op.listing,o);case'dividends':return api.getDividends(op.listing,o);case'snapshot':return api.getRealtimePrice(op.listing,o);case'holdings':return api.getETFHoldings(op.symbol,o);case'etfs':return api.listETFs(o);default:throw Error('INVALID_INGESTION_OPERATION');}
 }
 try{for(let i=0;i<plan.operations.length;i++){
  const op=plan.operations[i],before=sequence;if(terminalReason){results.push({operation:op,skipped:true,reason:terminalReason});continue;}
  let result;try{result=await perform(op);}catch{result={ok:false,reason:'INGESTION_OPERATION_FAILED'};}finally{api.client.clearCache();}
  if(op.retry504Once&&result.status===504){await sleep(15000);try{result=await perform(op);}catch{result={ok:false,reason:'INGESTION_OPERATION_FAILED'};}finally{api.client.clearCache();}}
  if(['authError','quotaExceeded','budgetExceeded','RUN_BUDGET_EXCEEDED','EUROPE_RUN_BUDGET_EXCEEDED','responsePersistenceFailed','accountingPersistenceFailed','budgetReservationFailed'].includes(result.reason)||String(result.reason).startsWith('LEDGER_'))terminalReason=result.reason;
  const resultPath='normalized/'+String(i).padStart(6,'0')+'.json';
  const entry={ordinal:i,operation:op,responseIds:manifest.slice(before).map(r=>r.id),result};write(join(out,resultPath),entry);
  results.push({ordinal:i,operation:op,responseIds:entry.responseIds,resultPath,ok:result.ok,skipped:result.skipped===true,reason:result.reason??null,status:result.status??null,complete:result.complete??null,downloadedCount:result.downloadedCount??result.data?.length??null});
  if(i%25===0)console.log(JSON.stringify({operationsCompleted:i+1,reserved:budget.status().reservedCredits??budget.status().estimatedCredits,rawResponses:manifest.length}));
 }const summary={version:'marketstack-europe-ingestion-1',generatedAt:new Date().toISOString(),lease:plan.lease,planHash:hash(JSON.stringify(plan)),planned,budget:budget.status(),transport:api.client.stats(),terminalReason,results,rawResponses:manifest.length,productionWrites:0,publication:'BLOCKED_RIGHTS_UNVERIFIED'};write(join(out,'summary.json'),summary);return summary;
 }finally{write(join(out,'raw-manifest.json'),manifest);budget.close?.();}
}
