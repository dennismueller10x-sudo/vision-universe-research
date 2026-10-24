#!/usr/bin/env node
/* Reproducible private read-path QA, real data and independent Python model. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const A=require('../../quant/engines/weekly-real-adapter.cjs'),B=require('../../quant/engines/weekly-benchmark.cjs'),C=require('../../quant/api/real-backtest-contract.js');
const Service=require('../../quant/api/product-services.js'),Store=require('../../server/quant-backtest-store.cjs');
const {run}=require('./run-real-weekly-backtest.cjs');
async function validate(directory){
 const root=path.resolve(__dirname,'../..'),store=Store.create({directory}),loadJSON=async p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const service=Service.create({loadJSON,displayPolicy:require('../../quant/engines/display-policy.js'),queryEngine:require('../../quant/engines/query.js'),realBacktestPreview:{enabled:true,audience:'INTERNAL_REVIEW'},realBacktestStore:store});
 const release=await store.loadJSON('release.json'),cases=[],benchmark=B.load(root),counts={A:0,B:0,C:0},reasons={},ids=[];let completedTrades=0,earliest=null,latest=null;
 const start=performance.now(),payloadStats={summaries:0,summaryBytes:0,maxSummaryBytes:0,periodResults:0,detailBytes:0,gzipDetailBytes:0,maxDetailBytes:0,maxGzipDetailBytes:0,overLimitDetails:0};
 for(const key of Object.keys(release.shards).sort()){
  const index=await store.loadJSON(release.generation+'/index/'+key+'.json');assert.equal(await C.digest(index),release.shards[key]);
  for(const id of Object.keys(index.entries).sort()){
   const s=await store.loadJSON(release.generation+'/listings/'+id+'/summary.json'),{summaryHash,...payload}=s;assert.equal(A.hash(payload),summaryHash);assert.equal(summaryHash,index.entries[id]);assert.deepEqual(C.summaryViolations(s,id,release.generation),[]);counts[s.quality.class]++;ids.push(id);const size=Buffer.byteLength(JSON.stringify(s));payloadStats.summaries++;payloadStats.summaryBytes+=size;payloadStats.maxSummaryBytes=Math.max(payloadStats.maxSummaryBytes,size);for(const r of Object.values(s.periods)){payloadStats.periodResults++;for(const d of Object.values(r.details)){payloadStats.detailBytes+=d.bytes;payloadStats.gzipDetailBytes+=d.gzipBytes;payloadStats.maxDetailBytes=Math.max(payloadStats.maxDetailBytes,d.bytes);payloadStats.maxGzipDetailBytes=Math.max(payloadStats.maxGzipDetailBytes,d.gzipBytes);if(d.bytes>2097152||d.gzipBytes>262144)payloadStats.overLimitDetails++;}}
   for(const r of s.quality.exclusionReasons)reasons[r]=(reasons[r]||0)+1;
   if(s.state!=='BLOCKED'){completedTrades+=s.periods.MAX.metrics.completedTrades;const from=s.periods.MAX.from,to=s.periods.MAX.to;earliest=earliest===null||from<earliest?from:earliest;latest=latest===null||to>latest?to:latest;}
  }
 }
 assert.equal(payloadStats.overLimitDetails,0);assert.ok(payloadStats.maxSummaryBytes<262144);assert.deepEqual(counts,release.counts);assert.equal(ids.length,release.expected);
 for(const ticker of ['NVDA','AAPL','XOM','ARM','BGC','AAAC','AACT','MSFT']){
  const begin=performance.now(),summary=await service.getRealBacktest(ticker),coldMs=performance.now()-begin;
  assert.ok(['AVAILABLE_LIMITED','BLOCKED'].includes(summary.state),JSON.stringify(summary));assert.equal(summary.certification,'NOT_CERTIFIED');
  const beginCached=performance.now(),again=await service.getRealBacktest(ticker),cachedMs=performance.now()-beginCached;assert.deepEqual(summary,again);
  const detailBytes={};for(const section of ['equity','trades']){const detail=await service.getRealBacktest(ticker,{section});assert.equal(detail.state,summary.state);if(summary.state==='BLOCKED')assert.equal(detail.result,undefined);else{assert.equal(detail.result.resultHash,summary.result.resultHash);detailBytes[section]=Buffer.byteLength(JSON.stringify(detail));}}
  cases.push({ticker,identity:summary.identity,state:summary.state,quality:summary.quality.class,blockers:summary.quality.exclusionReasons,benchmark:summary.benchmarkState,asOf:summary.asOf,max:summary.max,resultHash:summary.result?.resultHash||null,metrics:summary.result?.metrics||null,endCapital:summary.result?.endCapital||null,buyAndHold:summary.result?.buyAndHold||null,marketBenchmark:summary.result?.marketBenchmark||null,summaryBytes:Buffer.byteLength(JSON.stringify(summary)),detailBytes,coldMs,cachedMs});
 }
 const independent=[];const data=A.load(root,'ref_NVDA');
 for(const period of C.periods){
  const raw=run(data,{period,benchmark}),repeat=run(A.load(root,'ref_NVDA'),{period,benchmark});assert.deepEqual(raw,repeat);
  const via=await service.getRealBacktest('NVDA',{period});assert.equal(via.result.resultHash,raw.resultHash);
  const file=path.join(directory,'nvda-'+period+'.json');fs.writeFileSync(file,JSON.stringify(raw));
  independent.push({period,...JSON.parse(execFileSync('python3',[path.join(root,'scripts/quant/verify-real-weekly-backtest.py'),file],{encoding:'utf8'}))});
 }
 const qbytes=fs.readFileSync(path.join(directory,release.qualityDump)),qualityRows=zlib.gunzipSync(qbytes).toString().trim().split('\n');assert.equal(qualityRows.length,release.expected);
 const result={payloadStats,runtime:process.version,schemaVersion:'real-backtest-read-validation-1.0.0',generation:release.generation,classified:ids.length,counts,reasons,completedTrades,eligibleFrom:earliest,to:latest,qualityDumpHash:A.hash(qbytes),qualityDumpGzipBytes:qbytes.length,independent,cases,elapsedMs:performance.now()-start,peakRssBytes:process.resourceUsage().maxRSS*1024,publiclyActivated:false,certification:'NOT_CERTIFIED'};
 fs.writeFileSync(path.join(directory,'read-validation.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module)validate(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={validate};
