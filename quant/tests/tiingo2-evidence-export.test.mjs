import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectEvidence,assessEvidence} from '../../scripts/market/tiingo2-evidence.mjs';
import {projectCandidate} from '../../scripts/market/tiingo2-export.mjs';
function history(){return Array.from({length:40},(_,i)=>({date:new Date(Date.UTC(2026,7,1+i)).toISOString(),open:100+i,high:101+i,low:99+i,close:100+i,volume:1000,adjOpen:100+i,adjHigh:101+i,adjLow:99+i,adjClose:100+i,adjVolume:1000,splitFactor:1,divCash:0}));}
test('collector rotates never-probed listings across days and terminal errors cannot starve later symbols',async()=>{
 const workDir=mkdtempSync(join(tmpdir(),'tiingo2-evidence-')),calls=[];
 const candidates=['AAA','BBB','CCC'].map(ticker=>({ticker,startDate:'2026-08-01',currency:'USD'}));
 const fetchImpl=async(url)=>{calls.push(url);const ticker=/daily\/([^/?]+)/.exec(url)[1];return {ok:ticker!=='AAA',status:ticker==='AAA'?404:200,json:async()=>url.includes('/prices?')?history():{ticker,startDate:'2026-08-01',exchangeCode:'NASDAQ',name:'Verified Issuer Inc'}};};
 try{
  const opts={workDir,apiKey:'test',fetchImpl,maxSymbols:1};
  const a=await collectEvidence(candidates,{...opts,today:'2026-09-11'});assert.equal(a.results.get('AAA').reason,'PROVIDER_HTTP_404');
  const b=await collectEvidence(candidates,{...opts,today:'2026-09-12'});assert.ok(b.results.get('BBB').price.historyValid);assert.ok(!b.results.has('CCC'));
  const c=await collectEvidence(candidates,{...opts,today:'2026-09-12'});assert.ok(c.results.get('CCC').price.historyValid);
  assert.equal(calls.filter(x=>x.includes('/daily/AAA')).length,1);
 }finally{rmSync(workDir,{recursive:true,force:true});}
});
test('absent and mismodeled actions block evidence while actual market factors calculate',()=>{
 const rows=history(),ok=assessEvidence(rows,{ticker:'AAA',today:'2026-09-11',currency:'USD'});assert.equal(ok.price.historyValid,true);assert.equal(ok.marketFactors.materialized,true);
 rows[15].adjClose*=2;assert.equal(assessEvidence(rows,{ticker:'AAA',today:'2026-09-11'}).price.corporateActionValid,false);
});
test('public candidate projection never exports hidden provider levels or raw event bodies',()=>{
 const providerPayloadSentinel='FORBIDDEN_PROVIDER_PRICE_SENTINEL';
 const projected=projectCandidate({ticker:'AAA',checks:{latestPrice:providerPayloadSentinel},policy:{raw:providerPayloadSentinel},evidence:{price:{historyValid:true,close:providerPayloadSentinel,adjClose:providerPayloadSentinel,rawBars:providerPayloadSentinel,bars:[{close:providerPayloadSentinel}]},sec:{rawFacts:providerPayloadSentinel},source:{payload:providerPayloadSentinel},corporateActions:{status:'VALID_SPLIT',counts:{VALID_SPLIT:1,raw:providerPayloadSentinel},events:[{date:'2026-01-01',status:'VALID_SPLIT',rawClose:providerPayloadSentinel,evidence:providerPayloadSentinel}]},factors:{materialized:true,values:{sma20:providerPayloadSentinel},calculation:{state:providerPayloadSentinel,bars:[{close:providerPayloadSentinel}],calculatedFieldCount:providerPayloadSentinel,fieldStatus:{sma20:providerPayloadSentinel,sma50:'INSUFFICIENT_HISTORY'}}}}});
 assert.ok(!JSON.stringify(projected).includes(providerPayloadSentinel));assert.equal(projected.price.historyValid,true);assert.equal(projected.corporateActions.counts.VALID_SPLIT,1);assert.deepEqual(projected.marketFactors.calculation,{fieldStatus:{sma50:'INSUFFICIENT_HISTORY'}});
});
