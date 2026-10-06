import test from 'node:test';import assert from 'node:assert/strict';import {sampleSelection,mergeBars,ingest} from '../ingest-de-eu.mjs';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),I=require('../../../core/identity.js');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('sample is deduplicated, bounded and index-balanced',()=>{
 const rows=Array.from({length:30},(_,i)=>({listingId:'L'+i,ticker:'T'+i,mic:i<20?'XETR':'XPAR',indexMemberships:[i<10?'MDAX':i<20?'SDAX':'TECDAX']}));
 const picked=sampleSelection(rows);assert.equal(picked.length,15);assert.equal(new Set(picked.map(r=>r.listingId)).size,15);
 assert.ok(picked.some(r=>r.mic==='XPAR'));for(const ix of ['MDAX','SDAX','TECDAX'])assert.ok(picked.some(r=>r.indexMemberships.includes(ix)));
});
test('fake end-to-end sample, representative barrier, mandatory remainder and one-request refresh',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-fake-flow-'));try{
 const fixed=Date.parse('2026-10-06T11:00:00Z'),asOf='2026-10-06',calls=[];let future=false;
 const rows=Array.from({length:16},(_,n)=>{
  const base='DE'+String(999000000+n).padStart(9,'0');const isin=Array.from({length:10},(_,i)=>base+i).find(s=>I.normalizeISIN(s));
  const mic=n===1?'XPAR':'XETR';return {isin,mic,ticker:'TEST'+n,listingId:I.listingIdFor({isin,mic}),securityId:I.securityIdForISIN(isin),
   assetType:'EQUITY',shareClass:n===1?'PREFERRED_SHARE':'ORDINARY_SHARE',mappingStatus:'VERIFIED',mappingSource:['SYNTHETIC_CONTRACT_FIXTURE'],quoteUnit:'MAJOR',tradingCurrency:'EUR',
   indexMemberships:['DAX','MDAX','SDAX','TECDAX','EURO_STOXX_50'],providerSymbol:'TEST'+n+'.DE',providerIdentityBasis:'HISTORICAL_EXACT_ISIN_MIC_SYNTHETIC_TEST',name:'Synthetic equity '+n};
 });
 const listingMap={schemaVersion:'de-eu-listing-map-1.0.0',asOf,listings:rows};
 const factory=({mappings,budget,onResponse})=>{
  const reserve=async(id,endpoint)=>{calls.push({id,endpoint});await budget.reserve({cost:1,endpoint});await onResponse({body:{testFixture:true,symbol:mappings[id].symbol},endpoint,params:{symbols:mappings[id].symbol},apiVersion:'v2',host:'FAKE_TRANSPORT',retrievedAt:new Date(fixed).toISOString()});};
  return {getMetadata:async id=>{await reserve(id,'/tickers');return {available:true,data:{isin:null}};},
   getQuote:async id=>{await reserve(id,'/eod/latest');return {available:true,data:{timestamp:'2026-10-02T00:00:00Z',last:101,retrieved_at:new Date(fixed).toISOString()}};},
   getHistoricalBars:async id=>{await reserve(id,'/eod');return {available:true,provenance:{retrieved_at:new Date(fixed).toISOString()},data:{anomalies:[],bars:[{date:'2026-10-01',open:99,high:101,low:98,close:100,volume:10},{date:'2026-10-02',open:100,high:102,low:99,close:101,volume:11},...(future?[{date:'2026-10-07',open:100,high:104,low:99,close:103,volume:12}]:[])]}};}};
 };
 const input={listingMap,accountEvidence:{kind:'VERIFIED_ACCOUNT_REMAINDER',id:'TEST_ACCOUNT_BOUND',source:'SYNTHETIC_TEST',month:'2026-10',observedAt:new Date(fixed).toISOString(),remainingCredits:10000},
  asOf,now:()=>fixed,runId:'FAKE_TRANSPORT_ONLY',privateDir:join(out,'marketstack'),previewOut:join(out,'preview'),providerFactory:factory};
 const first=await ingest(input);assert.equal(first.series,15);assert.equal(first.sampleSuccesses,15);assert.equal(first.budget.requestsAttempted,45);
 const sample=sampleSelection(rows);const successfulListingIds=sample.map(r=>r.listingId);
 const proof={fixture:false,passed:true,asOf,referenceHash:hash(listingMap),successfulListingIds,testedListingIds:successfulListingIds,engines:['chromium','webkit'],
  normalizedHistoryHashes:Object.fromEntries(successfulListingIds.map(id=>[id,hash(JSON.parse(readFileSync(join(input.privateDir,'normalized',id+'.json'),'utf8')))]))};
 const count=calls.length;await assert.rejects(ingest({...input,phase:'mandatory',sampleProof:{...proof,successfulListingIds:[successfulListingIds[0]]}}),/REPRESENTATIVE/);assert.equal(calls.length,count);
 await assert.rejects(ingest({...input,phase:'mandatory',sampleProof:{...proof,testedListingIds:[]}}),/REAL_END_TO_END/);
 const full=await ingest({...input,phase:'mandatory',sampleProof:proof});assert.equal(full.series,16);assert.equal(full.budget.requestsAttempted,48);
 assert.equal(full.decisions.filter(d=>d.phase==='SAMPLE').length,15,'representative decisions retained');
 const beforeRefresh=calls.length;const refreshed=await ingest({...input,phase:'refresh',sampleProof:proof});
 assert.equal(refreshed.series,16);assert.equal(calls.length-beforeRefresh,16);assert.ok(calls.slice(beforeRefresh).every(c=>c.endpoint==='/eod'));
 assert.equal(refreshed.decisions.length,16);assert.equal(refreshed.budget.requestsAttempted,64);assert.ok(refreshed.decisions.every(d=>d.status!=='READY'),'unknown adjustment/calendars remain partial');
 future=true;const nextDay=await ingest({...input,asOf:'2026-10-07',phase:'refresh',sampleProof:proof});assert.equal(nextDay.series,16);assert.equal(nextDay.decisions.length,16);assert.equal(nextDay.budget.requestsAttempted,80);
  const dir=JSON.parse(readFileSync(join(input.previewOut,'core/data/de-eu/listings.json'),'utf8'));assert.equal(dir.referenceAsOf,'2026-10-06');assert.equal(dir.dataAsOf,'2026-10-07');
 const repeated=await ingest({...input,asOf:'2026-10-07',phase:'refresh',sampleProof:proof});assert.equal(repeated.series,16);assert.equal(repeated.decisions.length,16);assert.equal(repeated.budget.requestsAttempted,96,'legitimate new bars do not invalidate the proven selection');
 const changedPath=join(input.privateDir,'normalized',rows[0].listingId+'.json'),changed=JSON.parse(readFileSync(changedPath,'utf8'));changed.bars[0].close=80;writeFileSync(changedPath,JSON.stringify(changed));const beforeDrift=calls.length;await assert.rejects(ingest({...input,asOf:'2026-10-07',phase:'refresh',sampleProof:proof}),/CACHED_HISTORY_DRIFT/);assert.equal(calls.length,beforeDrift);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('overlap detects source corrections without filling gaps or double adjusting',()=>{
 const old=[{date:'2026-10-01',close:100},{date:'2026-10-02',close:101}];
 const incoming=[{date:'2026-10-02',close:102},{date:'2026-10-06',close:103}];
 const merged=mergeBars(old,incoming);assert.deepEqual(merged.bars.map(b=>b.date),['2026-10-01','2026-10-02','2026-10-06']);
 assert.deepEqual(merged.restatements,[{date:'2026-10-02',fields:['close']}]);assert.deepEqual(mergeBars(merged.bars,incoming).restatements,[]);
});
test('missing current account evidence stops before constructing any provider',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-live-de-eu-'));try{let built=0;
 await assert.rejects(ingest({listingMap:{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[]},asOf:'2026-10-06',runId:'unit',privateDir:join(out,'marketstack'),previewOut:join(out,'preview'),providerFactory:()=>{built++;throw Error('bad');}}),/ACCOUNT_BUDGET_UNVERIFIED/);
 assert.equal(built,0);
 }finally{rmSync(out,{recursive:true,force:true});}
});
