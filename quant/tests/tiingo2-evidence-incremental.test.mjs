import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { collectEvidence, mergeIncrementalRows } from '../../scripts/market/tiingo2-evidence.mjs';

const dates=['2026-09-23','2026-09-24','2026-09-25','2026-09-28','2026-09-29','2026-09-30','2026-10-01'];
const ticker='IPO',start=dates[0],candidate={ticker,startDate:start,exchange:'NASDAQ',currency:'USD'};
const metadata={ticker,name:'IPO Corporation',description:'A common stock issuer.',startDate:start,exchangeCode:'NASDAQ'};
const bar=(date,close=10,volume=100,splitFactor=1,divCash=0)=>({date,open:close,high:close,low:close,close,volume,adjOpen:close,adjHigh:close,adjLow:close,adjClose:close,adjVolume:volume,splitFactor,divCash});
const original=dates.map(d=>bar(d));
const rebase=(row,price,volume)=>({...row,adjOpen:row.adjOpen*price,adjHigh:row.adjHigh*price,adjLow:row.adjLow*price,adjClose:row.adjClose*price,adjVolume:row.adjVolume*volume});
async function fixture(fn){const workDir=mkdtempSync(join(tmpdir(),'vu-incremental-'));try{await fn(workDir);}finally{rmSync(workDir,{recursive:true,force:true});}}
async function seed(workDir){return collectEvidence([candidate],{workDir,today:'2026-10-01',apiKey:'test',fetchImpl:async url=>new Response(JSON.stringify(url.includes('/prices?')?original:metadata)),maxSymbols:1});}
function cachedRows(workDir){const index=JSON.parse(readFileSync(join(workDir,'evidence-index.json'),'utf8'));const entry=Object.values(index)[0];return JSON.parse(readFileSync(join(workDir,'evidence',entry.key+'.json'),'utf8'));}

for(const event of [{name:'split',price:.5,volume:2,close:5,splitFactor:2,dividend:0},{name:'dividend',price:.9,volume:1,close:9,splitFactor:1,dividend:1}]){
 test(`next-day ${event.name} refresh rebases old adjusted history using five-bar overlap`,async()=>fixture(async workDir=>{
  await seed(workDir);const urls=[];
  const overlap=[...original.slice(-5).map(r=>rebase(r,event.price,event.volume)),bar('2026-10-02',event.close,100*event.volume,event.splitFactor,event.dividend)];
  const refreshed=await collectEvidence([candidate],{workDir,today:'2026-10-02',apiKey:'test',maxSymbols:1,fetchImpl:async url=>{
   urls.push(url);return new Response(JSON.stringify(url.includes('/prices?')?overlap:metadata));
  }});
  assert.equal(refreshed.requests,2);assert.match(urls[1],/startDate=2026-09-25&endDate=2026-10-02/);
  const summary=refreshed.results.get(ticker);assert.equal(summary.source.fetchMode,'INCREMENTAL_REBASED');
  assert.equal(summary.price.historyValid,true);assert.equal(summary.price.corporateActionValid,true);assert.equal(summary.price.bars,8);
  assert.equal(summary.metadata.securityDescription,metadata.description);
  const cache=cachedRows(workDir);assert.equal(cache.rows[0].close,10);assert.equal(cache.rows[0].adjClose,10*event.price);
  assert.equal(cache.rows[0].adjVolume,100*event.volume);assert.equal(cache.rows.at(-1).date,'2026-10-02');
 }));
}

for(const mutation of ['raw revision','missing overlap','nonconstant adjustment']){
 test(`${mutation} triggers full listing fallback before rerunning gates`,async()=>fixture(async workDir=>{
  await seed(workDir);const urls=[];let prices=0;
  const full=[...original,bar('2026-10-02')],overlap=structuredClone(full.slice(2));
  if(mutation==='raw revision')overlap[0].volume++;
  if(mutation==='missing overlap')overlap.splice(1,1);
  if(mutation==='nonconstant adjustment')overlap[1].adjClose*=.5;
  const result=await collectEvidence([candidate],{workDir,today:'2026-10-02',apiKey:'test',maxSymbols:1,fetchImpl:async url=>{
   urls.push(url);return new Response(JSON.stringify(url.includes('/prices?')?(++prices===1?overlap:full):metadata));
  }});
  assert.equal(result.requests,3);assert.match(urls[1],/startDate=2026-09-25/);assert.match(urls[2],/startDate=2026-09-23/);
  assert.equal(result.results.get(ticker).source.fetchMode,'FULL_FALLBACK');assert.equal(result.results.get(ticker).price.historyValid,true);
  assert.deepEqual(cachedRows(workDir).rows,full);
 }));
}

test('new listing generation never reuses prior issuer history',async()=>fixture(async workDir=>{
 await seed(workDir);const fresh={...candidate,startDate:'2026-10-02'},urls=[];
 const result=await collectEvidence([fresh],{workDir,today:'2026-10-02',apiKey:'test',maxSymbols:1,fetchImpl:async url=>{
  urls.push(url);return new Response(JSON.stringify(url.includes('/prices?')?[bar('2026-10-02')]:{...metadata,startDate:'2026-10-02'}));
 }});
 assert.equal(result.requests,2);assert.match(urls[1],/startDate=2026-10-02/);assert.equal(result.results.get(ticker).price.bars,1);
 assert.equal(result.results.get(ticker).source.fetchMode,'FULL_LISTING_HISTORY');
 assert.equal(Object.keys(JSON.parse(readFileSync(join(workDir,'evidence-index.json'),'utf8'))).length,2);
}));

test('older cache gate upgrade populates listing index without refetching',async()=>fixture(async workDir=>{
 await seed(workDir);const prior=cachedRows(workDir),today='2026-10-01';
 const oldKey=createHash('sha256').update(JSON.stringify({ticker,today,start,rule:'tiingo2-evidence-1'})).digest('hex');
 writeFileSync(join(workDir,'evidence',oldKey+'.json'),JSON.stringify({...prior,key:oldKey}));
 rmSync(join(workDir,'evidence',prior.key+'.json'));rmSync(join(workDir,'evidence-index.json'));
 const result=await collectEvidence([candidate],{workDir,today,apiKey:'test',maxSymbols:0,fetchImpl:()=>{throw Error('UNEXPECTED_NETWORK');}});
 assert.equal(result.requests,0);assert.equal(result.completed,1);assert.equal(Object.values(JSON.parse(readFileSync(join(workDir,'evidence-index.json'),'utf8'))).length,1);
}));

test('invalid or nonconstant adjusted volume cannot be guessed from overlap',()=>{
 const overlap=original.slice(-5).map(r=>({...r,adjVolume:0}));
 const previous=original.map((r,i)=>({...r,adjVolume:i<2?100:0}));
 assert.equal(mergeIncrementalRows(previous,overlap,dates[2]).reason,'VOLUME_ADJUSTMENT_UNRESOLVED');
 overlap[0].adjVolume=100;assert.equal(mergeIncrementalRows(original,overlap,dates[2]).ok,false);
});
