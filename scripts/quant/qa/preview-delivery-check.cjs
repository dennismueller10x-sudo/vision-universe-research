#!/usr/bin/env node
/* Actual authenticated HTTP delivery diagnostics, no tokens or full results in report. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Preview=require('../../../server/quant-backtest-preview.cjs');
async function verify(directory,output){
 const root=path.resolve(__dirname,'../../..');if(!output||!path.relative(root,path.resolve(output)).startsWith('..'+path.sep))throw Error('PRIVATE_QA_OUTPUT_REQUIRED');
 const key=crypto.randomBytes(32).toString('hex'),tickers=['NVDA','MSFT','XOM','ARM','AAPL','BGC','AAAC','AACT'],app=Preview.create({directory,credentialKey:key,allowedTickers:tickers}),url=await app.listen(),cases=[];
 try{
  const login=await fetch(url+'login',{method:'POST',headers:{Origin:new URL(url).origin,'Content-Type':'application/json'},body:JSON.stringify({key})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie};
  for(const ticker of tickers){
   const started=performance.now(),r=await fetch(url+'data?ticker='+ticker,{headers}),text=await r.text();assert.equal(r.status,200);const s=JSON.parse(text);assert.equal(s.certification,'NOT_CERTIFIED');assert.equal(s.returnBasis,'PRICE_RETURN');assert.equal(s.productionApproved,false);assert.match(r.headers.get('cache-control'),/no-store/);const detailBytes={};
   for(const section of ['equity','trades']){const d=await fetch(url+'data?'+new URLSearchParams({ticker,section,generation:s.generation,listingId:s.identity.listingId}),{headers}),raw=await d.text();assert.equal(d.status,200);const detail=JSON.parse(raw);assert.equal(detail.state,s.state);if(s.state==='BLOCKED')assert.equal(detail.result,undefined);else assert.equal(detail.result.resultHash,s.result.resultHash);detailBytes[section]=Buffer.byteLength(raw);}
   cases.push({ticker,state:s.state,quality:s.quality.class,benchmark:s.benchmarkState,generation:s.generation,resultHash:s.result?.resultHash||null,summaryBytes:Buffer.byteLength(text),detailBytes,elapsedMs:performance.now()-started,delivery:s.delivery});
  }
  const expected=cases.find(c=>c.ticker==='NVDA').resultHash;
  const parallel=await Promise.all(Array.from({length:20},async()=>{const start=performance.now(),r=await fetch(url+'data?ticker=NVDA',{headers}),s=await r.json();assert.equal(r.status,200);assert.equal(s.result.resultHash,expected);return performance.now()-start;}));parallel.sort((a,b)=>a-b);
  const anonymous=await fetch(url+'data?ticker=NVDA',{headers:{'If-None-Match':'any'}});assert.equal(anonymous.status,401);
  const report={state:'PASS',schemaVersion:'protected-preview-delivery-1.0.0',cases,parallel:{requests:20,p50Ms:parallel[9],p95Ms:parallel[18],maxMs:parallel[19]},peakRssBytes:process.resourceUsage().maxRSS*1024,unauthorizedAfterWarmCache:401,publiclyActivated:false,certification:'NOT_CERTIFIED',timingScope:'LOCAL_WORKER_NOT_NETWORK_OR_PRODUCTION_SLA'};
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true,mode:0o700});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');return report;
 }finally{await app.close();}
}
if(require.main===module)verify(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify({state:r.state,cases:r.cases.length,parallel:r.parallel}))).catch(()=>{console.error('LOCAL_DELIVERY_QA_FAILED');process.exitCode=1;});
module.exports={verify};
