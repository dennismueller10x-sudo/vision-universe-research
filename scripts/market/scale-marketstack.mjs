// Bounded, checkpointed evidence collection; reuses the PR #330 transport.
// Payloads stay in private working files, never production price directories.
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createMarketstackClient}=require('../../providers/marketstack/client.js');
const {assetType}=require('../../providers/marketstack/adapter.js');
export function verifiedTaskMetadata(entry,task) {
 const row=entry?.data?.data||entry?.data,symbol=task.metadataSymbol||task.params?.ticker||task.params?.symbols;
 return entry?.ok===true&&row?.symbol===symbol&&assetType(row?.asset_type||row?.item_type||row?.type)?.toUpperCase()===task.requiresAssetType&&(!task.mic||row?.stock_exchange?.mic===task.mic)&&!(task.endpoint==='etfholdings'&&!task.mic);
}
export function requestKey(endpoint,params={}) {
 return endpoint.replace(/^\//,'')+'?'+Object.keys(params).filter(k=>params[k]!=null).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(params[k]))).join('&');
}
const digest=s=>createHash('sha256').update(s).digest('hex');
const rowsOf=e=>Array.isArray(e?.data)?e.data:Array.isArray(e?.data?.data)?e.data.data:e?.data?.data?.tickers;
export function seedPages(seed) {
 const result=[];
 for(const e of seed.endpoints||[]) {
  const endpoint=e.endpoint.replace(/^\//,''),rows=rowsOf(e);
  if((endpoint==='exchanges'||/^exchanges\/[^/]+\/tickers$/.test(endpoint))&&Array.isArray(rows)) {
   const limit=1000,start=Number(e.params?.offset||0),pagination=e.pagination||e.data?.pagination;
   const total=pagination?.total==null?null:Number(pagination.total);
   for(let i=0;i<rows.length;i+=limit) {
    const page=rows.slice(i,i+limit),offset=start+i;
    result.push({...e,ok:true,params:{...(e.params||{}),limit,offset},data:{pagination:{limit,offset,count:page.length,total:Number.isInteger(total)&&total>=0?total:null},data:endpoint==='exchanges'?page:{tickers:page}},seeded:true});
   }
  } else if(e.ok||e.reason)result.push({...e,params:e.params||{},seeded:true});
 }
 return result;
}
export function createCollector(options) {
 const root=resolve(options.output),checkpoint=join(root,'checkpoint.json');
 if(/\/(quant\/data|discover\/data|dashboard\/data)(\/|$)/.test(root))throw Error('PRIVATE_WORKING_OUTPUT_REQUIRED');
 mkdirSync(root,{recursive:true});
 const state=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint)): {schemaVersion:'marketstack-scale-evidence-1.0.0',createdAt:new Date().toISOString(),tasks:{},runs:{}};
 for(const r of Object.values(state.runs||{}))for(const k of ['requestsAttempted','estimatedCreditsConsumed'])if(!Number.isSafeInteger(r[k])||r[k]<0)throw Error('INVALID_REQUEST_LEDGER');
 const runId=options.runId||'local',run=state.runs[runId]||{phase:options.phase,requestsAttempted:0,estimatedCreditsConsumed:0,startedAt:new Date().toISOString()};
 state.runs[runId]=run;
 const atomic=(path,value)=>{writeFileSync(path+'.tmp',JSON.stringify(value)+'\n',{mode:0o600});renameSync(path+'.tmp',path);};
 const persist=()=>{state.updatedAt=new Date().toISOString();atomic(checkpoint,state);};
 const save=(entry,seeded=false)=> {
  const key=requestKey(entry.endpoint,entry.params),h=digest(key),bucket=parseInt(h[0],16)%4,file=join('responses',String(bucket),h+'.json');
  mkdirSync(join(root,dirname(file)),{recursive:true});atomic(join(root,file),{...entry,seeded});
  state.tasks[key]={file,ok:entry.ok===true,endpoint:entry.endpoint,params:entry.params,label:entry.label,checkedAt:entry.checkedAt,seeded};
  persist();return entry;
 };
 for(const seed of options.seeds||[])for(const e of seedPages(seed)){const k=requestKey(e.endpoint,e.params);if(!state.tasks[k])save(e,true);}
 const previous=Object.entries(state.runs).filter(([id])=>id!==runId).reduce((n,[,r])=>n+r.estimatedCreditsConsumed,0);
 const opening={requestsAttempted:run.requestsAttempted,estimatedCreditsConsumed:run.estimatedCreditsConsumed};
 const ceiling=options.totalCredits??25000,credits=Math.max(0,Math.min((options.maxCredits??2000)-opening.estimatedCreditsConsumed,ceiling-previous-opening.estimatedCreditsConsumed));
 const updateStats=stats=>{Object.assign(run,stats);run.requestsAttempted=opening.requestsAttempted+stats.requestsAttempted;run.estimatedCreditsConsumed=opening.estimatedCreditsConsumed+stats.estimatedCreditsConsumed;};
 const client=options.client||createMarketstackClient({...options.clientOptions,maxCredits:credits,maxRequests:Math.max(0,(options.maxRequests??2000)-opening.requestsAttempted),maxRetries:0,timeoutMs:options.timeoutMs??45000,minIntervalMs:250,onAttempt:s=>{updateStats(s);persist();}});
 let budgetBlocked=false,terminalReason=null;
 async function query(endpoint,params={},label='scale-evidence',extra={}) {
  endpoint=endpoint.replace(/^\//,'');const key=requestKey(endpoint,params),old=state.tasks[key];
  if(old){const cached=JSON.parse(readFileSync(join(root,old.file)));if(!options.retryFailed||!['timeout','networkError','rateLimited','internalError','requestFailed'].includes(cached.reason))return cached;}
  if(old?.ok)return JSON.parse(readFileSync(join(root,old.file)));
  if(terminalReason)return {ok:false,reason:terminalReason,endpoint,params,label};
  if(budgetBlocked)return {ok:false,reason:'budgetExceeded',endpoint,params,label};
  const started=Date.now(),r=await client.request('/'+endpoint,params,{cacheTtlMs:0});
  if(r.reason==='budgetExceeded'){budgetBlocked=true;return {...r,endpoint,params,label};}
  const entry={endpoint,params,label,...extra,checkedAt:new Date().toISOString(),durationMs:Date.now()-started,...r};
  save(entry);updateStats(client.stats());persist();
  if(['quotaExceeded','authError','accountingPersistenceFailed','rateLimited'].includes(r.reason))terminalReason=r.reason;
  if(run.requestsAttempted%25===0)console.log(JSON.stringify({phase:options.phase,attempts:run.requestsAttempted,credits:run.estimatedCreditsConsumed,cachedTasks:Object.keys(state.tasks).length}));
  return entry;
 }
 async function directory(mic) {
  const endpoint=mic?'exchanges/'+mic+'/tickers':'exchanges';let offset=0,total=null,pages=0,rows=0;
  while(pages<1000) {
   const e=await query(endpoint,{limit:1000,offset},mic?'scale-venue-directory':'scale-exchange-directory');
   if(!e.ok)return {mic,complete:false,rows,pages,total,nextOffset:offset,reason:e.reason};
   const items=rowsOf(e),p=e.data?.pagination;
   const reportedTotal=p?.total==null?NaN:Number(p.total);
   if(!Number.isSafeInteger(reportedTotal)||reportedTotal<0||total!==null&&reportedTotal!==total||Number(p?.limit)!==1000)return {mic,complete:false,rows,pages,total,nextOffset:offset,reason:'invalidPaginationTotal'};
   if(!Array.isArray(items)||Number(p?.offset)!==offset||(p?.count!=null&&Number(p.count)!==items.length))return {mic,complete:false,rows,pages,total,nextOffset:offset,reason:'invalidPagination'};
   total=reportedTotal;if(offset+items.length>total)return {mic,complete:false,rows,pages,total,nextOffset:offset,reason:'paginationExceedsTotal'};rows+=items.length;pages++;offset+=items.length;
   if(offset>=total)return {mic,complete:true,rows,pages,total,nextOffset:offset};
   if(!items.length)return {mic,complete:false,rows,pages,total,nextOffset:offset,reason:'emptyPageBeforeTotal'};
  }
  return {mic,complete:false,rows,pages,total,nextOffset:offset,reason:'pageBudgetExceeded'};
 }
 function allEntries(){return Object.values(state.tasks).map(t=>JSON.parse(readFileSync(join(root,t.file))));}
 function finish(extra={}){run.finishedAt=new Date().toISOString();updateStats(client.stats());state.lastRun={runId,...extra};persist();return {runId,requestsAttempted:run.requestsAttempted,estimatedCreditsConsumed:run.estimatedCreditsConsumed,totalScaleCredits:Object.values(state.runs).reduce((n,r)=>n+r.estimatedCreditsConsumed,0),budgetBlocked,terminalReason,...extra};}
 return {query,directory,allEntries,finish,state};
}
function readSeeds(root){const files=[];if(!existsSync(root))return files;for(const e of readdirSync(root,{withFileTypes:true})){const p=join(root,e.name);if(e.isDirectory())files.push(...readSeeds(p));else if(e.name==='probe.json')files.push(JSON.parse(readFileSync(p)));}return files;}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
 const arg=(n,f)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)||f;
 if(!process.env.MARKETSTACK_API_KEY)throw Error('MARKETSTACK_API_KEY_NOT_CONFIGURED');
 const phase=arg('phase','discovery'),plan=JSON.parse(readFileSync(arg('plan','quant/config/marketstack-scale-plan.json'))),settings=plan.phases[phase];
 if(!settings)throw Error('UNKNOWN_SCALE_PHASE');
 const collector=createCollector({output:arg('out','.market-cache/marketstack/scale'),seeds:readSeeds(arg('seeds','.market-cache/marketstack/scale-seeds')),phase,runId:process.env.GITHUB_RUN_ID||'local',maxCredits:settings.maxCredits,maxRequests:settings.maxRequests,totalCredits:plan.totalAdditionalCreditCeiling,retryFailed:settings.retryTransientFailures,timeoutMs:settings.timeoutMs});
 let results=[];
 if(phase==='discovery') {
  results.push(await collector.directory(null));
  for(const mic of settings.venues)results.push(await collector.directory(mic));
 } else {
  let nonUSHoldingsFailures=0;
  for(const task of settings.tasks) {
   if(task.requiresAssetType) {
    const symbol=task.metadataSymbol||task.params.ticker||task.params.symbols;
    const metadata=collector.state.tasks[requestKey('tickers/'+symbol,{})];
    const entry=metadata?JSON.parse(readFileSync(join(arg('out','.market-cache/marketstack/scale'),metadata.file))):null;
    if(!verifiedTaskMetadata(entry,task)){results.push({label:task.label,endpoint:task.endpoint,params:task.params,reason:'assetTypePrerequisiteNotVerified',ok:false});continue;}
   }
   if(task.endpoint==='etfholdings'&&task.region!=='US'&&nonUSHoldingsFailures>=2){results.push({label:task.label,endpoint:task.endpoint,params:task.params,reason:'nonUSHoldingsCircuitBreaker',ok:false});continue;}
   const e=await collector.query(task.endpoint,task.params,task.label,{targetSecurityIds:task.targetSecurityIds||[],region:task.region||null});
   results.push({endpoint:task.endpoint,params:task.params,label:task.label,ok:e.ok,reason:e.reason||null,fromCache:e.seeded||false});
   if(task.endpoint==='etfholdings'&&task.region!=='US'&&!e.ok)nonUSHoldingsFailures++;else if(task.endpoint==='etfholdings'&&task.region!=='US')nonUSHoldingsFailures=0;
   if(['budgetExceeded','quotaExceeded','authError','accountingPersistenceFailed','rateLimited'].includes(e.reason))break;
   if(task.maxPages>1 && e.ok && e.data?.pagination) {
    let offset=Number(e.data.pagination.offset)+Number(e.data.pagination.count),total=Number(e.data.pagination.total);
    const limit=Number(task.params.limit||1000);
    for(let page=1;page<Math.min(task.maxPages,10)&&Number.isSafeInteger(total)&&offset<total;page++){
     const next=await collector.query(task.endpoint,{...task.params,limit,offset},task.label,{region:task.region||null});
     const pageRows=next.data?.data;
     const valid=next.ok&&Array.isArray(pageRows)&&Number(next.data?.pagination?.offset)===offset&&Number(next.data?.pagination?.total)===total&&Number(next.data?.pagination?.count)===pageRows.length&&Number(next.data?.pagination?.limit)===limit;
     results.push({endpoint:task.endpoint,label:task.label,ok:valid,reason:valid?null:next.reason||'invalidPagination'});
     if(!valid)break;
     const count=Number(next.data.pagination.count);if(!Number.isSafeInteger(count)||count<1)break;offset+=count;
    }
   }
  }
 }
 const summary=collector.finish({phase,results});
 console.log(JSON.stringify({...summary,results:undefined,tasks:results.length,successful:results.filter(r=>r.ok||r.complete).length,incomplete:results.filter(r=>r.ok===false||r.complete===false).length}));
}
