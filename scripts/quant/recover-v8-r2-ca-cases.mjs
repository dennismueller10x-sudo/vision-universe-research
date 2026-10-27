#!/usr/bin/env node
// Exact registered DQ cases only. Reads existing private objects, never publishes bars.
import {createS3Driver} from '../market/storage/s3-driver.mjs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {gunzipSync,zstdDecompressSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),Identity=require('../../core/identity.js'),History=require('../../quant/engines/history-store.js'),Codec=require('../../quant/engines/bar-codec.js'),Guard=require('../../quant/engines/zero-cost-guard.js'),Returns=require('../../quant/engines/return-series.js'),Published=require('../../quant/engines/published-close.js'),CA=require('../../quant/engines/corporate-action-evidence.js'),Adapter=require('../../quant/engines/weekly-real-adapter.cjs'),Weekly=require('./run-real-weekly-backtest.cjs'),Benchmark=require('../../quant/engines/weekly-benchmark.cjs'),Store=require('../../quant/engines/research-artifacts.cjs');
const ROOT=resolve(import.meta.dirname,'../..'),sha=x=>createHash('sha256').update(x).digest('hex');
export const TICKERS=Object.freeze(['AZTR','BDRX','BUUU','CHOW','COCH','GCTK','HCTI','HKPD','IPW','LHSW','PPCB','SBFM','SXTC','TWG']);
const REQUIRED=['VU_HISTORY_S3_ENDPOINT','VU_HISTORY_S3_BUCKET','VU_HISTORY_S3_ACCESS_KEY_ID','VU_HISTORY_S3_SECRET_ACCESS_KEY'],MAX_BYTES=4*1024*1024,MAX_RAW=64*1024*1024;
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x),near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&(a===b||Math.abs(a-b)<=4*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b)));
const safeError=e=>{const message=String(e.message),status=message.match(/HTTP (\d{3})/),code=message.match(/^([A-Z][A-Z0-9_]+)(?::|$)/);return status?'HTTP_'+status[1]:/BUDGET/.test(message)?'READ_BUDGET_EXCEEDED':code?code[1]:'SOURCE_OR_RECONSTRUCTION_UNRESOLVED';};
export function analyzeCase(raw,weekly,daily){
 if(raw.provider!=='tiingo'||raw.ticker!==weekly.ticker||daily.ticker!==weekly.ticker||raw.securityId!==weekly.securityId||daily.securityId!==weekly.securityId||weekly.currency!=='USD'||daily.currency!=='USD'||weekly.priceSeriesType!=='SPLIT_ADJUSTED'||daily.priceSeriesType!=='SPLIT_ADJUSTED')throw Error('SOURCE_IDENTITY_OR_BASIS_MISMATCH');
 const bars=raw.bars;
 if(!Array.isArray(bars)||!bars.length||!bars.every((b,i)=>iso(b.date)&&Number.isFinite(b.close)&&b.close>0&&Number.isFinite(b.splitFactor)&&b.splitFactor>0&&(!i||b.date>bars[i-1].date)))throw Error('RAW_BAR_OR_ACTION_EVIDENCE_INCOMPLETE');
 const last=bars.at(-1).date;if(last<daily.asOf||last<weekly.asOf)throw Error('RAW_SOURCE_COVERAGE_SHORT');
 const events=bars.filter(b=>b.date>weekly.asOf&&b.splitFactor!==1);
 if(!events.length)throw Error('NO_NEW_SOURCE_SPLIT_EVENT');
 const oldBars=bars.filter(b=>b.date<=weekly.asOf),oldPrices=Returns.splitAdjusted(oldBars),newPrices=Returns.splitAdjusted(bars),oldBy=new Map(oldBars.map((b,i)=>[b.date,oldPrices[i]])),newBy=new Map(bars.map((b,i)=>[b.date,newPrices[i]]));
 const oldMismatches=weekly.points.filter(([d,v])=>!oldBy.has(d)||!near(Published.roundClose(oldBy.get(d)),v));
 const dailyMismatches=daily.points.filter(([d,v])=>!newBy.has(d)||!near(Published.roundClose(newBy.get(d)),v));
 const result={securityId:weekly.securityId,ticker:weekly.ticker,oldWeeklyAsOf:weekly.asOf,dailyAsOf:daily.asOf,rawFirst:bars[0].date,rawLast:last,actionEvidence:{events:events.length,firstDate:events[0].date,lastDate:events.at(-1).date,sourceEventsHash:sha(JSON.stringify(events.map(b=>({date:b.date,splitFactor:b.splitFactor}))))},oldWeeklyPoints:weekly.points.length,oldBasisMismatches:oldMismatches.length,currentDailyPoints:daily.points.length,currentBasisMismatches:dailyMismatches.length,state:oldMismatches.length||dailyMismatches.length?'UNRESOLVED_SOURCE_PARITY':'SOURCE_PROVEN_ADJUSTMENT_VINTAGE_RECONCILED'};
 if(result.state!=='SOURCE_PROVEN_ADJUSTMENT_VINTAGE_RECONCILED')return {summary:result};
 const points=weekly.points.map(([d])=>[d,Published.roundClose(newBy.get(d))]),dailyRows=bars.map((b,i)=>({date:b.date,close:newPrices[i]})),evidence=CA.evidence(dailyRows,points,bars);
 if(!evidence)throw Error('ACTION_EVIDENCE_UNAVAILABLE');
 const revised={...weekly,asOf:last,points,corporateActions:evidence,adjustmentVintage:{observedRawLast:last,priorSourceAsOf:weekly.asOf,model:'EX_POST_SOURCE_SPLIT_RECONSTRUCTION_EXISTING_WEEK_DATES_ONLY'}};
 result.reconstructedWeeklyPoints=points.length;result.addedCalendarPoints=0;result.historicalInterval=[points[0][0],points.at(-1)[0]];result.priorPricesModifiedOnlyInPrivateGeneration=true;
 return {summary:result,revised,newPrices,oldPrices};
}
export async function recover({env=process.env,fetchImpl=globalThis.fetch,root=ROOT,privateRoot=resolve(env.RUNNER_TEMP||tmpdir(),'quant-v8-r2-ca-cases')}={}){
 const report={schemaVersion:'quant-v8-r2-ca-cases-1.0.0',registeredPopulation:TICKERS,selection:'All fourteen DQ-PX-4 LEVEL cases on frozen Main f10afd9666136810f0c9081db6ff4324d04065fe, selected before reading raw R2 outcomes; no winner selection.',observedAt:new Date().toISOString(),gitHead:env.GITHUB_SHA||null,runId:env.GITHUB_RUN_ID||null,runtime:Adapter.calculationRuntime(),credentialBindings:Object.fromEntries(REQUIRED.map(k=>[k,Boolean(env[k])])),limits:{requests:32,compressedBytesPerObject:MAX_BYTES,decompressedBytesPerObject:MAX_RAW,rawSeries:TICKERS.length},networkRequests:0,downloadedBytes:0,cases:[],rawDataPublished:false,canonicalDataModified:false,certification:'NOT_CERTIFIED',productionApproved:false};
 if(REQUIRED.some(k=>!env[k]))return {...report,state:'NOT_CONFIGURED_IN_THIS_RUNTIME'};
 const budget=Guard.createBudget({classAOperations:0,classBOperations:32});
 const fetchBounded=async(url,opts)=>{
  if(!['HEAD','GET'].includes(opts.method)||new URL(url).search||report.networkRequests>=32)throw Error('READ_BUDGET_METHOD_OR_REQUEST');budget.consumeClassB(1,'V8 registered CA source read');report.networkRequests++;
  const response=await fetchImpl(url,{...opts,signal:AbortSignal.timeout(20000)});if(opts.method==='HEAD')return response;
  if(Number(response.headers.get('content-length')||0)>MAX_BYTES){await response.body?.cancel();throw Error('READ_BUDGET_BYTES');}
  const chunks=[];let n=0;const reader=response.body?.getReader();if(reader)for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>MAX_BYTES){await reader.cancel();throw Error('READ_BUDGET_BYTES');}chunks.push(value);}
  report.downloadedBytes+=n;budget.noteDownload(n);return new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers});
 };
 const driver=createS3Driver({endpoint:env.VU_HISTORY_S3_ENDPOINT,bucket:env.VU_HISTORY_S3_BUCKET,region:env.VU_HISTORY_S3_REGION||'auto',accessKeyId:env.VU_HISTORY_S3_ACCESS_KEY_ID,secretAccessKey:env.VU_HISTORY_S3_SECRET_ACCESS_KEY,maxRetries:0,fetchImpl:fetchBounded}),loader=Adapter.createLoader(root);
 mkdirSync(privateRoot,{recursive:true,mode:0o700});let benchmark;try{benchmark=Benchmark.load(root);}catch(e){benchmark={error:e.message};}
 for(const ticker of TICKERS){
  const securityId=Identity.securityIdForTicker(ticker),item={ticker,securityId};report.cases.push(item);
  try{
   const key=History.LAYOUT+'/tiingo/daily/US/'+History.keyForTicker(ticker)+'.json.zst',head=await driver.head(key);if(!head){item.state='RAW_OBJECT_NOT_FOUND';continue;}if(head.size>MAX_BYTES){item.state='RAW_OBJECT_ABOVE_BUDGET';continue;}
   const bytes=await driver.get(key);if(!bytes)throw Error('RAW_OBJECT_CHANGED_DURING_READ');
   // Bound decompression before the existing codec receives the document.
   const decompressed=Codec.sniff(bytes)==='gzip'?gunzipSync(bytes,{maxOutputLength:MAX_RAW}):Codec.sniff(bytes)==='zstd'?zstdDecompressSync(bytes,{maxOutputLength:MAX_RAW}):bytes;
   if(decompressed.length>MAX_RAW)throw Error('READ_BUDGET_DECOMPRESSED');
   const raw=Codec.decode(decompressed,{codec:'none'}),weeklyPath=join(root,'quant/data/market/discover-series-long',securityId+'.json'),dailyPath=join(root,'quant/data/market/discover-series',securityId+'.json'),weeklyBytes=readFileSync(weeklyPath),dailyBytes=readFileSync(dailyPath),weekly=JSON.parse(weeklyBytes),daily=JSON.parse(dailyBytes);
   Object.assign(item,{rawObjectHash:sha(bytes),rawDocumentHash:sha(decompressed),rawLastModified:head.lastModified,rawObjectETag:head.etag||null,weeklySourceHash:sha(weeklyBytes),dailySourceHash:sha(dailyBytes)});
   let before;try{loader(securityId);before='QUALIFIED';}catch(e){before=safeError(e);}item.priorWeeklyQualification=before;
   const result=analyzeCase(raw,weekly,daily);Object.assign(item,result.summary);
   const privateFile=join(privateRoot,securityId+'-input.json');writeFileSync(privateFile,JSON.stringify({raw,weekly,daily,revised:result.revised||null,newPrices:result.newPrices||null,oldPrices:result.oldPrices||null}),{mode:0o600});
   if(!result.revised)continue;
   const parity=spawnSync('python3',[resolve(import.meta.dirname,'verify-v8-r2-ca-cases.py'),privateFile],{encoding:'utf8',timeout:90000,maxBuffer:262144});try{item.independentSourceParity=JSON.parse(parity.stdout);}catch{item.independentSourceParity={state:'FAIL',reason:parity.error?'VERIFIER_PROCESS_ERROR':'VERIFIER_OUTPUT_UNAVAILABLE'};}if(parity.status!==0||item.independentSourceParity.state!=='PASS')throw Error('INDEPENDENT_SOURCE_PARITY_FAILED');
   const sourceFile=join(privateRoot,securityId+'-reconstructed-weekly.json'),sourceBytes=JSON.stringify(result.revised);writeFileSync(sourceFile,sourceBytes,{mode:0o600});item.reconstructedSourceHash=sha(sourceBytes);
   let data;try{data={...loader(securityId,sourceBytes),sourcePath:sourceFile};item.privateWeeklyQualification='QUALIFIED';}catch(e){item.privateWeeklyQualification=safeError(e);continue;}
   const r=Weekly.run(data,{benchmark}),repeat=Weekly.run(data,{benchmark});if(r.resultHash!==repeat.resultHash)throw Error('EXACT_REPLAY_FAILED');
   const file=join(privateRoot,securityId+'-result.json');writeFileSync(file,JSON.stringify(r),{mode:0o600});const check=spawnSync('python3',[resolve(import.meta.dirname,'verify-real-weekly-backtest.py'),file],{encoding:'utf8',timeout:90000,maxBuffer:262144});if(check.status!==0)throw Error('INDEPENDENT_LEDGER_PARITY_FAILED');
   const generation=Store.publish(join(privateRoot,'generations'),{source:result.revised,result:JSON.parse(JSON.stringify(r))});item.study={state:'PASS',inputHash:r.inputHash,resultHash:r.resultHash,generation:generation.generation,independent:JSON.parse(check.stdout),exactRepeat:true,metrics:r.metrics,returnBasis:'PRICE_RETURN',scope:'Private reconstructed price vintage at original completed-week dates; ex-post source actions, current-classified surviving listing, not PIT or market certification'};
  }catch(e){item.state='UNRESOLVED';item.reason=safeError(e);if(['HTTP_401','HTTP_403','HTTP_429'].includes(item.reason))break;}
 }
 report.budgetSpent=budget.spent;report.state='BOUNDED_SOURCE_ASSESSMENT_COMPLETED';report.summary={registered:TICKERS.length,assessed:report.cases.length,reconciled:report.cases.filter(x=>x.state==='SOURCE_PROVEN_ADJUSTMENT_VINTAGE_RECONCILED').length,privatelyQualified:report.cases.filter(x=>x.privateWeeklyQualification==='QUALIFIED').length,independentlyRecomputedStudies:report.cases.filter(x=>x.study?.state==='PASS').length,canonicalRepairs:0};
 report.codeDependencies=Object.fromEntries(['core/identity.js','scripts/quant/recover-v8-r2-ca-cases.mjs','scripts/quant/verify-v8-r2-ca-cases.py','quant/engines/history-store.js','quant/engines/bar-codec.js','quant/engines/return-series.js','quant/engines/published-close.js','quant/engines/corporate-action-evidence.js','quant/engines/weekly-real-adapter.cjs','quant/engines/research-classification-evidence.cjs','scripts/quant/run-real-weekly-backtest.cjs','scripts/quant/verify-real-weekly-backtest.py'].map(p=>[p,sha(readFileSync(join(ROOT,p)))]));
 report.limitations=['R2 and published daily/weekly data share provider ancestry; arithmetic parity is not independent provider evidence.','Reconstructed sources remain private; canonical Technical and price data, old immutable results and protected contracts remain unchanged.','A source-proven adjustment vintage does not resolve all listing identity, calendar, historical corporate-action or terminal-value holds.'];return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=resolve(process.argv[2]||'.verification/v8-r2-ca');if(!out.startsWith(resolve('.verification')+'/'))throw Error('DERIVED_OUTPUT_REQUIRED');const report=await recover();mkdirSync(out,{recursive:true});writeFileSync(join(out,'r2-ca-assessment.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary||{state:report.state}));}
