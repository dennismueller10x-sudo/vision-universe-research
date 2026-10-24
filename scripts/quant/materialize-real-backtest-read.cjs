#!/usr/bin/env node
/* Private, offline materialization. NEVER copied into public quant/data by a release build. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const A=require('../../quant/engines/weekly-real-adapter.cjs'),B=require('../../quant/engines/weekly-benchmark.cjs');
const C=require('../../quant/api/real-backtest-contract.js'),Q=require('../../quant/engines/real-backtest-quality.cjs');
const {run}=require('./run-real-weekly-backtest.cjs');
const atomic=(p,o)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+'.tmp',JSON.stringify(o)+'\n');fs.renameSync(p+'.tmp',p);};
function materializeUnlocked({root=path.resolve(__dirname,'../..'),output,ids=null,maxNew=null}={}){
 if(!output)throw Error('OUTPUT_REQUIRED');output=path.resolve(output);root=path.resolve(root);
 if(!path.relative(root,output).startsWith('..'+path.sep))throw Error('OUTPUT_MUST_BE_PRIVATE_OUTSIDE_REPOSITORY');
 if(maxNew!==null&&(!Number.isInteger(maxNew)||maxNew<0))throw Error('INVALID_BATCH_BOUND');
 const started=performance.now(),loader=A.createLoader(root),master=JSON.parse(fs.readFileSync(path.join(root,'quant/data/market/security-master/us-security-master.json'))),byId=new Map();
 for(const r of master.rows){const k=r.baseline_security_id;if(!byId.has(k))byId.set(k,[]);byId.get(k).push(r);}
 const directory=path.join(root,'quant/data/market/discover-series-long');
 const files=ids?Array.from(new Set(ids)).sort().map(id=>{if(!C.safeId(id))throw Error('INVALID_SECURITY_ID');return id+'.json';}):fs.readdirSync(directory).filter(p=>/^ref_[A-Za-z0-9_.-]+\.json$/.test(p)).sort();
 let benchmark;try{benchmark=B.load(root);}catch(e){benchmark={error:e.message};}
 const model=JSON.parse(fs.readFileSync(path.join(root,'scripts/quant/contracts/weekly-execution-model-v2.json')));
 const codes=['scripts/quant/run-real-weekly-backtest.cjs','scripts/quant/materialize-real-backtest-read.cjs','quant/engines/weekly-real-adapter.cjs','quant/engines/weekly-benchmark.cjs','quant/engines/backtest-history.js','quant/engines/signal-backtest.js','quant/engines/corporate-action-evidence.js','quant/engines/real-backtest-quality.cjs','quant/api/real-backtest-contract.js'];
 const productDirectory=path.join(root,'quant/data/universe/instruments'),productRows=new Map(),productShardHashes={};
 for(const file of fs.readdirSync(productDirectory).filter(p=>p.endsWith('.json')).sort()){const bytes=fs.readFileSync(path.join(productDirectory,file),'utf8');productShardHashes[file]=A.hash(bytes);for(const i of JSON.parse(bytes).instruments||[]){if(!productRows.has(i.masterMemberId))productRows.set(i.masterMemberId,[]);productRows.get(i.masterMemberId).push(i);}}
 const sources=files.map(f=>({securityId:f.slice(0,-5),sourceHash:A.hash(fs.readFileSync(path.join(directory,f),'utf8'))}));
 const snapshot={productShardHashes,schemaVersion:C.VERSION,masterHash:loader.masterHash,model,codes:Object.fromEntries(codes.map(p=>[p,A.hash(fs.readFileSync(path.join(root,p),'utf8'))])),benchmark:benchmark.provenance||benchmark,sources};
 const generation=A.hash(snapshot),base=path.join(output,generation);fs.mkdirSync(base,{recursive:true});
 const snapshotPath=path.join(base,'snapshot.json');let computedAt=new Date().toISOString();
 if(fs.existsSync(snapshotPath)){const old=JSON.parse(fs.readFileSync(snapshotPath));if(old.generation!==generation||A.hash(old.input)!==generation)throw Error('SNAPSHOT_CORRUPT');computedAt=old.computedAt;}
 else atomic(snapshotPath,{generation,computedAt,input:snapshot});
 let computed=0,reused=0,peak=process.memoryUsage().rss;const qualities=[],shards={},counts={A:0,B:0,C:0},reasons={},benchmarkStates={};let payloadBytes=0,gzipBytes=0;
 for(const item of sources){
  const id=item.securityId,folder=path.join(base,'listings',id),file=path.join(folder,'summary.json');let s;
  if(fs.existsSync(file)){
   s=JSON.parse(fs.readFileSync(file));const {summaryHash,...payload}=s;
   if(summaryHash!==A.hash(payload)||C.summaryViolations(s,id,generation).length)throw Error('CORRUPT_SUMMARY:'+id);
   for(const [period,r] of Object.entries(s.periods))for(const section of ['equity','trades']){
    const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(folder,period+'-'+section+'.json.gz'))));
    if(A.hash(d)!==r.details[section].hash||C.detailViolations(d,s,period,section).length)throw Error('CORRUPT_DETAIL:'+id);
   }
   reused++;
  }else{
   if(maxNew!==null&&computed>=maxNew)break;
   const bytes=fs.readFileSync(path.join(directory,id+'.json'),'utf8');if(A.hash(bytes)!==item.sourceHash)throw Error('SOURCE_CHANGED_DURING_MATERIALIZATION');
   const source=JSON.parse(bytes);let data,result,error;
   try{data=loader(id,bytes);result=run(data,{benchmark});}catch(e){error=e;}
   const quality=Q.classify({securityId:id,source,sourceHash:item.sourceHash,masterHash:loader.masterHash,identities:byId.get(id)||[],result,error,computedAt});
   s={schemaVersion:C.VERSION,generation,identity:{sourceSecurityId:id,listingId:quality.listingId,ticker:source.ticker,productIdentity:(productRows.get(id)||[]).length===1?C.identityKey(productRows.get(id)[0]):null},state:quality.state,certification:'NOT_CERTIFIED',returnBasis:'PRICE_RETURN',executionModel:model,computedAt,asOf:source.asOf,quality,availableBacktestKinds:error?[]:['SAME_STOCK_REPLAY','SIGNAL_BACKTEST'],kindScope:'SINGLE_LISTING_WEEKLY_REPLAY_NOT_AGGREGATE_SIGNAL_CERTIFICATION',supportedPeriods:error?[]:C.periods,periods:{}};
   if(!error)for(const period of C.periods){
    const r=period==='MAX'?result:run(data,{period,benchmark}),market={...r.marketBenchmark};delete market.points;
    const detailBase={schemaVersion:C.VERSION,generation,sourceSecurityId:id,listingId:data.listingId,period,resultHash:r.resultHash,returnBasis:'PRICE_RETURN',certification:'NOT_CERTIFIED'};
    const details={};
    for(const section of ['equity','trades']){
     const d=section==='equity'?{...detailBase,section,equity:r.equity,marketBenchmarkEquity:r.marketBenchmark.points||null}:{...detailBase,section,trades:r.trades,openPosition:r.openPosition,exclusions:r.exclusions};
     const raw=JSON.stringify(d),compressed=zlib.gzipSync(raw,{level:6});fs.mkdirSync(folder,{recursive:true});const p=path.join(folder,period+'-'+section+'.json.gz');fs.writeFileSync(p+'.tmp',compressed);fs.renameSync(p+'.tmp',p);
     details[section]={hash:A.hash(raw),bytes:Buffer.byteLength(raw),gzipBytes:compressed.length};payloadBytes+=Buffer.byteLength(raw);gzipBytes+=compressed.length;
    }
    s.periods[period]={period,from:r.input.start,to:r.input.end,complete:r.history.window.complete,history:r.history,strategy:{id:r.input.ruleId,version:r.input.ruleVersion,params:r.input.params},modelVersion:r.input.version,inputHash:r.inputHash,resultHash:r.resultHash,source:{provider:data.provider,asOf:data.asOf,version:data.sourceSchemaVersion,sourceBytesHash:data.sourceBytesHash,masterHash:loader.masterHash},returnBasis:r.input.returnBasis,certification:r.certification,metrics:r.metrics,endCapital:r.equity.at(-1).value,openPositions:Number(!!r.openPosition),buyAndHold:r.benchmark,marketBenchmark:market,details};
   }
   const violations=C.summaryViolations(s,id,generation);if(violations.length)throw Error(violations.join(','));s.summaryHash=A.hash(s);atomic(file,s);computed++;
  }
  qualities.push(s.quality);counts[s.quality.class]++;for(const reason of s.quality.exclusionReasons)reasons[reason]=(reasons[reason]||0)+1;
  if(s.state!=='BLOCKED'){const b=s.periods.MAX.marketBenchmark.state;benchmarkStates[b]=(benchmarkStates[b]||0)+1;}
  const key=C.shard(id);if(!shards[key])shards[key]={};shards[key][id]=s.summaryHash;peak=Math.max(peak,process.memoryUsage().rss);
 }
 const complete=qualities.length===sources.length,shardHashes={};
 if(complete){
  for(const [key,entries] of Object.entries(shards)){const shard={schemaVersion:C.VERSION,generation,entries};shardHashes[key]=A.hash(shard);atomic(path.join(base,'index',key+'.json'),shard);}
  fs.writeFileSync(path.join(base,'quality.jsonl.gz'),zlib.gzipSync(qualities.map(x=>JSON.stringify(x)).join('\n')+'\n'));
  atomic(path.join(output,'release.json'),{schemaVersion:C.VERSION,generation,computedAt,executionModel:model,counts,expected:sources.length,qualityDump: generation+'/quality.jsonl.gz',shards:shardHashes,certification:'NOT_CERTIFIED',publiclyActivated:false});
 }
 const report={schemaVersion:C.VERSION,generation,state:complete?'COMPLETE':'CHECKPOINTED',computedAt,expected:sources.length,processed:qualities.length,counts,reasons,benchmarkStates,computed,reused,elapsedMs:performance.now()-started,peakRssBytes:Math.max(peak,process.resourceUsage().maxRSS*1024),newDetailBytes:payloadBytes,newDetailGzipBytes:gzipBytes,publiclyActivated:false,certification:'NOT_CERTIFIED'};
 atomic(path.join(base,'materialization-report.json'),report);return report;
}
// Serialize writers to a private output root. A dead process may be resumed;
// an active writer or an unparseable lock requires a separate directory/review.
function materialize(options={}){
 if(!options.output)throw Error('OUTPUT_REQUIRED');
 const output=path.resolve(options.output),root=path.resolve(options.root||path.resolve(__dirname,'../..'));
 if(!path.relative(root,output).startsWith('..'+path.sep))throw Error('OUTPUT_MUST_BE_PRIVATE_OUTSIDE_REPOSITORY');
 fs.mkdirSync(output,{recursive:true});const lock=path.join(output,'.materialize.lock');let fd;
 try{fd=fs.openSync(lock,'wx');}catch(e){
  if(e.code!=='EEXIST')throw e;
  let owner;try{owner=JSON.parse(fs.readFileSync(lock));}catch{throw Error('MATERIALIZATION_LOCK_REQUIRES_REVIEW');}
  if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('MATERIALIZATION_LOCK_REQUIRES_REVIEW');
  try{process.kill(owner.pid,0);throw Error('MATERIALIZATION_ALREADY_RUNNING');}catch(probe){if(probe.code!=='ESRCH')throw probe;}
  fs.unlinkSync(lock);fd=fs.openSync(lock,'wx');
 }
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));return materializeUnlocked(options);}
 finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(require.main===module){const args=process.argv.slice(2),get=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;console.log(JSON.stringify(materialize({output:get('--output',null),ids:get('--ids',null)?.split(',')||null,maxNew:get('--max-new',null)===null?null:Number(get('--max-new'))})));}
module.exports={materialize};
