#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const Benchmark=require('../../quant/engines/weekly-benchmark.cjs');
const A=require('../../quant/engines/weekly-real-adapter.cjs'),{run}=require('./run-real-weekly-backtest.cjs');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'quant/data/market/discover-series-long');
let benchmark;try{benchmark=Benchmark.load(root);}catch(e){benchmark={error:e.message};}
const master=JSON.parse(fs.readFileSync(path.join(root,'quant/data/market/security-master/us-security-master.json')));
const available=new Set(fs.readdirSync(dir));
const cases=[['NVDA','reference'],['AAPL','long history and multiple splits'],['XOM','dividend payer: price return excludes distributions'],['ARM','shorter listing history']].map(([ticker,reason])=>({securityId:'ref_'+ticker,reason}));
const inactive=master.rows.find(r=>r.baseline_security_id && r.active_status!=='ACTIVE' && master.rows.filter(x=>x.baseline_security_id===r.baseline_security_id).length===1 && available.has(r.baseline_security_id+'.json'));
if(inactive)cases.push({securityId:inactive.baseline_security_id,reason:'inactive listing: terminal value must be evidenced'});
const week=s=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return +d;};
let short=null,gap=null;
for(const name of [...available].sort()) {if(!name.startsWith('ref_')||!name.endsWith('.json'))continue;const d=JSON.parse(fs.readFileSync(path.join(dir,name)));if(!d.points)continue;
 if(!short && d.points.length<55)short=d.securityId;
 if(!gap && d.points.some((p,i)=>i && week(p[0])-week(d.points[i-1][0])>604800000))gap=d.securityId;
 if(short&&gap)break;
}
if(short)cases.push({securityId:short,reason:'insufficient weekly warm-up'});
if(gap)cases.push({securityId:gap,reason:'observed missing weekly interval'});
const results=cases.map(c=>{const raw=JSON.parse(fs.readFileSync(path.join(dir,c.securityId+'.json')));try{const data=A.load(root,c.securityId),start=performance.now(),r=run(data,{benchmark});return {...c,state:'EXECUTED',costModel:r.input.costModel,benchmarkState:r.marketBenchmark.state,sourceFrom:raw.from,sourceTo:raw.to,sourceHash:data.sourceHash,inputHash:r.inputHash,resultHash:r.resultHash,history:r.history,metrics:r.metrics,runMs:performance.now()-start};}catch(e){return {...c,state:'BLOCKED',sourceFrom:raw.from,sourceTo:raw.to,reasonCode:e.message};}});
console.log(JSON.stringify({schemaVersion:'real-weekly-diagnostics-1.0.0',cases:results},null,2));
