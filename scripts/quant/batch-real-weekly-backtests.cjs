#!/usr/bin/env node
/* Bounded sequential batch over stored listings. Outputs are research records,
   never a historical-membership portfolio or independent statistical sample. */
const fs=require('node:fs'),path=require('node:path');
const A=require('../../quant/engines/weekly-real-adapter.cjs');
const B=require('../../quant/engines/weekly-benchmark.cjs');
const {run}=require('./run-real-weekly-backtest.cjs');
const atomic=(file,object)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(object)+'\n');fs.renameSync(file+'.tmp',file);};
function classify(message){
  if(/INELIGIBLE_EQUITY_LISTING/.test(message))return 'BLOCKED_INSTRUMENT_CLASS';
  if(/INSUFFICIENT_HISTORY|HISTORY_UNAVAILABLE/.test(message))return 'BLOCKED_WARMUP';
  if(/MISSING_WEEKS|DUPLICATE_WEEK/.test(message))return 'BLOCKED_DATA_GAPS';
  if(/IDENTITY|SECURITY_ID/.test(message))return 'BLOCKED_IDENTITY';
  if(/SPLIT|CORPORATE_ACTION/.test(message))return 'BLOCKED_CORPORATE_ACTION';
  if(/TERMINAL_VALUE/.test(message))return 'BLOCKED_DELISTING_VALUE';
  return 'BLOCKED_OTHER';
}
function batch({root=path.resolve(__dirname,'../..'),output,limit=null,maxNew=null}={}){
  if(!output)throw Error('OUTPUT_REQUIRED');
  for(const value of [limit,maxNew])if(value!==null && (!Number.isInteger(value)||value<0))throw Error('INVALID_BATCH_BOUND');
  output=path.resolve(output);
  if(!path.relative(root,output).startsWith('..'+path.sep))throw Error('BATCH_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  fs.mkdirSync(path.join(output,'rows'),{recursive:true});
  const started=performance.now(),loader=A.createLoader(root),directory=path.join(root,'quant/data/market/discover-series-long');
  const files=fs.readdirSync(directory).filter(x=>/^ref_[A-Za-z0-9_.-]+\.json$/.test(x)).sort().slice(0,limit??Infinity);
  let benchmark;try{benchmark=B.load(root);}catch(e){benchmark={error:e.message};}
  const codePaths=['quant/engines/weekly-real-adapter.cjs','quant/engines/corporate-action-evidence.js','quant/engines/weekly-benchmark.cjs','quant/engines/backtest-history.js','quant/engines/signal-backtest.js','scripts/quant/run-real-weekly-backtest.cjs','scripts/quant/batch-real-weekly-backtests.cjs'];
  const codes=Object.fromEntries(codePaths.map(p=>[p,A.hash(fs.readFileSync(path.join(root,p),'utf8'))]));
  const sources=files.map(file=>({securityId:file.slice(0,-5),hash:A.hash(fs.readFileSync(path.join(directory,file),'utf8'))}));
  const benchmarkInputs=Object.fromEntries([B.SOURCE,'quant/data/market/multi-asset/instruments.json','quant/data/market/discover-series/ref_SPY.json'].map(p=>[p,fs.existsSync(path.join(root,p))?A.hash(fs.readFileSync(path.join(root,p),'utf8')):'MISSING']));
  const manifest={benchmarkInputs,schemaVersion:'weekly-batch-input-1.0.0',costModel:'PER_SIDE_NOTIONAL',period:'MAX',masterHash:loader.masterHash,benchmark:benchmark.provenance||benchmark,codes,sources};
  const manifestHash=A.hash(manifest),manifestPath=path.join(output,'manifest.json');
  if(fs.existsSync(manifestPath)){const prior=JSON.parse(fs.readFileSync(manifestPath));if(prior.manifestHash!==manifestHash || A.hash(prior.input)!==manifestHash)throw Error('RESUME_INPUT_CHANGED_USE_NEW_DIRECTORY');}
  else atomic(manifestPath,{manifestHash,input:manifest});
  let reused=0,computed=0,peakRss=process.memoryUsage().rss;const rows=[];
  for(const source of sources){
    const file=path.join(output,'rows',source.securityId+'.json');let record;
    if(fs.existsSync(file)){
      record=JSON.parse(fs.readFileSync(file));const {recordHash,...payload}=record;
      if(!['EXECUTABLE_WITH_LIMITATIONS','BLOCKED_INSTRUMENT_CLASS','BLOCKED_WARMUP','BLOCKED_DATA_GAPS','BLOCKED_IDENTITY','BLOCKED_CORPORATE_ACTION','BLOCKED_DELISTING_VALUE','BLOCKED_OTHER'].includes(record.state)||(record.state==='EXECUTABLE_WITH_LIMITATIONS' && record.certification!=='NOT_CERTIFIED')||recordHash!==A.hash(payload)||record.manifestHash!==manifestHash||record.securityId!==source.securityId)throw Error('CHECKPOINT_CORRUPT:'+source.securityId);
      reused++;
    } else {
      if(maxNew!==null && computed>=maxNew)break;
      const bytes=fs.readFileSync(path.join(directory,source.securityId+'.json'),'utf8');
      if(A.hash(bytes)!==source.hash)throw Error('SOURCE_CHANGED_DURING_BATCH');
      try{
        const data=loader(source.securityId,bytes),r=run(data,{benchmark});
        const market={...r.marketBenchmark};delete market.points;
        record={schemaVersion:'weekly-batch-listing-1.0.0',manifestHash,securityId:source.securityId,listingId:data.listingId,state:'EXECUTABLE_WITH_LIMITATIONS',returnBasis:r.input.returnBasis,status:r.status,certification:r.certification,inputHash:r.inputHash,resultHash:r.resultHash,from:r.input.start,to:r.input.end,firstAvailable:data.points[0][0],executionEvidence:r.trades.length||r.openPosition?'INVESTED':'NO_TRADES',completedTrades:r.trades.length,openPositions:Number(!!r.openPosition),metrics:r.metrics,buyAndHold:r.benchmark,marketBenchmark:market,corporateActionQuality:data.corporateActionQuality,warnings:data.warnings};
      }catch(e){record={schemaVersion:'weekly-batch-listing-1.0.0',manifestHash,securityId:source.securityId,state:classify(e.message),reasonCode:e.message.split(':')[0],details:e.message.slice(0,1500),sourceHash:source.hash};}
      record.recordHash=A.hash(record);atomic(file,record);computed++;
    }
    rows.push(record);peakRss=Math.max(peakRss,process.memoryUsage().rss);
  }
  const counts={},benchmarkStates={};for(const r of rows){counts[r.state]=(counts[r.state]||0)+1;if(r.marketBenchmark)benchmarkStates[r.marketBenchmark.state]=(benchmarkStates[r.marketBenchmark.state]||0)+1;}
  const executed=rows.filter(r=>r.state==='EXECUTABLE_WITH_LIMITATIONS');
  const distribution=key=>{const a=executed.filter(r=>r.executionEvidence==='INVESTED').map(r=>r.metrics[key]).filter(Number.isFinite).sort((a,b)=>a-b);return a.length?{n:a.length,min:a[0],p10:a[Math.floor((a.length-1)*.1)],median:a[Math.floor((a.length-1)*.5)],p90:a[Math.floor((a.length-1)*.9)],max:a.at(-1)}:null;};
  const summary={schemaVersion:'weekly-batch-summary-1.0.0',manifestHash,state:rows.length===sources.length?'COMPLETE':'CHECKPOINTED',expected:sources.length,processed:rows.length,counts,benchmarkStates,sourceFrom:executed.map(r=>r.firstAvailable).sort()[0]||null,eligibleFrom:executed.map(r=>r.from).sort()[0]||null,to:executed.map(r=>r.to).sort().at(-1)||null,completedTrades:executed.reduce((n,r)=>n+r.completedTrades,0),noTradeRuns:executed.filter(r=>r.executionEvidence==='NO_TRADES').length,distributionScope:'RUNS_WITH_AT_LEAST_ONE_POSITION',distributions:{totalReturn:distribution('totalReturn'),cagr:distribution('cagr'),maxDrawdown:distribution('maxDrawdown')},resultHash:A.hash(rows.map(r=>[r.securityId,r.recordHash])),interpretation:'DESCRIPTIVE_STORED_LISTING_SAMPLE_NOT_HISTORICAL_UNIVERSE_OR_INDEPENDENT_OBSERVATIONS',certification:'NOT_CERTIFIED'};
  atomic(path.join(output,'summary.json'),summary);
  const performanceReport={manifestHash,reused,computed,elapsedMs:performance.now()-started,peakRssBytes:Math.max(peakRss,process.resourceUsage().maxRSS*1024),heapUsedBytes:process.memoryUsage().heapUsed,concurrency:1};
  atomic(path.join(output,'performance.json'),performanceReport);
  return {summary,performance:performanceReport};
}
if(require.main===module){const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;console.log(JSON.stringify(batch({output:arg('--output',null),limit:arg('--limit',null)===null?null:Number(arg('--limit')),maxNew:arg('--max-new',null)===null?null:Number(arg('--max-new'))})));}
module.exports={batch,classify};
