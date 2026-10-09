import test from 'node:test';import assert from 'node:assert/strict';import {sampleSelection,mergeBars,ingest,dedicatedActionCoverage,mergeQuarantine,mergeQuarantineLedger,incrementalHistoryWindow} from '../ingest-de-eu.mjs';
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
   indexMemberships:['DAX','MDAX','SDAX','TECDAX','EURO_STOXX_50'],providerSymbol:'TEST'+n+'.DE',providerIdentityBasis:'HISTORICAL_EXACT_ISIN_MIC_SYNTHETIC_TEST',
   providerIdentityEvidence:{providerSymbol:'TEST'+n+'.DE',isin,mic,sourceHash:hash({fixture:true,isin,mic,symbol:'TEST'+n+'.DE'}),sourcePath:'synthetic-frozen-reference.json'},name:'Synthetic equity '+n};
 });
 const listingMap={schemaVersion:'de-eu-listing-map-1.0.0',asOf,listings:rows};
 const factory=({mappings,budget,onResponse})=>{
  const reserve=async(id,endpoint)=>{calls.push({id,endpoint});await budget.reserve({cost:1,endpoint});await onResponse({body:{testFixture:true,symbol:mappings[id].symbol},endpoint,params:{symbols:mappings[id].symbol},apiVersion:'v2',host:'FAKE_TRANSPORT',retrievedAt:new Date(fixed).toISOString()});};
  return {getMetadata:async id=>{await reserve(id,'/tickers');return {available:true,data:{isin:null,providerSymbol:mappings[id].symbol,exchange:mappings[id].mic,currency:mappings[id].currency,assetType:mappings[id].assetType}};},
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
 // A blocked final representative must survive the final checkpoint and the
 // mandatory remainder; an earlier successful per-listing checkpoint is stale.
 const changedRows=rows.map((r,i)=>i===14?{...r,providerIdentityBasis:'REQUEST_CANDIDATE_REQUIRE_RESPONSE_ISIN'}:r),changedMap={...listingMap,listings:changedRows};
 const fresh={...input,listingMap:changedMap,privateDir:join(out,'blocked-last'),previewOut:join(out,'blocked-preview')};future=false;
 const blockedSample=await ingest(fresh),blockedId=changedRows[14].listingId;
 assert.ok(JSON.parse(readFileSync(join(fresh.privateDir,'checkpoint.json'))).decisions.some(d=>d.listingId===blockedId&&d.cause==='MAPPING_ERROR'));
 const successful=sampleSelection(changedRows).map(r=>r.listingId).filter(id=>id!==blockedId);
 const correctedProof={...proof,referenceHash:hash(changedMap),successfulListingIds:successful,normalizedHistoryHashes:Object.fromEntries(successful.map(id=>[id,hash(JSON.parse(readFileSync(join(fresh.privateDir,'normalized',id+'.json'))))]))};
 const blockedFull=await ingest({...fresh,phase:'mandatory',sampleProof:correctedProof});
 assert.equal(blockedSample.series,14);assert.equal(blockedFull.decisions.length,16);assert.ok(blockedFull.decisions.some(d=>d.listingId===blockedId&&d.cause==='MAPPING_ERROR'));
 const beforeAcceptedRefresh=calls.length,acceptedRefresh=await ingest({...fresh,phase:'refresh',sampleProof:correctedProof});
 assert.equal(acceptedRefresh.series,15);assert.equal(calls.length-beforeAcceptedRefresh,15);
 assert.ok(calls.slice(beforeAcceptedRefresh).every(c=>c.endpoint==='/eod'&&c.id!==blockedId));
 const retained=acceptedRefresh.decisions.find(d=>d.listingId===blockedId);assert.equal(retained.status,'BLOCKED');assert.equal(retained.cause,'MAPPING_ERROR');assert.equal(retained.phase,'REFRESH_SKIPPED');assert.equal(retained.refreshQueried,false);
 assert.deepEqual(retained.sourceEvidence,blockedFull.decisions.find(d=>d.listingId===blockedId).sourceEvidence,'old failure provenance is retained without pretending to query it again');
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

 test('documented uncovered EU action feeds remain incomplete and preserve embedded observations',()=>{
 for(const mic of ['XETR','XPAR','XHEL','XLON']){const c=dedicatedActionCoverage(mic);assert.equal(c.actionsComplete,false);assert.equal(c.verified,false);assert.equal(c.embeddedObservationsPreserved,true);assert.equal(c.reason,'documentedMarketNotCovered');assert.ok(c.evidence[0].sha256);}
 assert.equal(dedicatedActionCoverage('XNAS'),null);assert.equal(dedicatedActionCoverage('UNKNOWN'),null);
 });

test('incremental overlap retains old invalid observations until their exact session is source-corrected',()=>{
 const old=[{date:'2026-03-27T00:00:00+0000',reason:'invalidOHLC'},{date:'2026-09-25T00:00:00+0000',reason:'invalidOHLC'}];
 const recent=[{date:'2026-09-28T00:00:00+0000',reason:'invalidOHLC'}];
 const merged=mergeQuarantine(old,recent,[{date:'2026-09-25',close:100},{date:'2026-10-02',close:101}]);
 assert.deepEqual(merged,[old[0],recent[0]]);assert.deepEqual(mergeQuarantine(merged,recent,[{date:'2026-10-02'}]),merged);
});

test('failed decisions link exact private responses and unqueried early gates cannot inherit another listing evidence',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-failed-evidence-'));try{
  const asOf='2026-10-06',fixed=Date.parse(asOf+'T11:00:00Z'),responses=new Map(),calls=[];
  const rows=Array.from({length:6},(_,n)=>{
   const base='DE'+String(999000100+n).padStart(9,'0'),isin=Array.from({length:10},(_,i)=>base+i).find(s=>I.normalizeISIN(s)),mic=n===4?'XPAR':'XETR';
   return {isin,mic,ticker:'EVIDENCE'+n,listingId:I.listingIdFor({isin,mic}),securityId:I.securityIdForISIN(isin),assetType:'EQUITY',shareClass:'ORDINARY_SHARE',
    mappingStatus:'VERIFIED',mappingSource:['SYNTHETIC_CONTRACT_FIXTURE'],quoteUnit:'MAJOR',tradingCurrency:'EUR',indexMemberships:['MDAX'],
    providerSymbol:n===5?null:'EVIDENCE'+n+'.DE',providerIdentityBasis:'REQUEST_CANDIDATE_REQUIRE_RESPONSE_ISIN',name:'Synthetic evidence '+n};
  });
  const input={listingMap:{schemaVersion:'de-eu-listing-map-1.0.0',asOf,listings:rows},accountEvidence:{kind:'VERIFIED_ACCOUNT_REMAINDER',id:'TEST_FAILED_RESPONSES',
   source:'SYNTHETIC_TEST',month:'2026-10',observedAt:new Date(fixed).toISOString(),remainingCredits:10000},asOf,now:()=>fixed,runId:'FAKE_FAILED_RESPONSES_ONLY',
   privateDir:join(out,'marketstack'),previewOut:join(out,'preview'),providerFactory:({mappings,budget,onResponse})=>{
    const respond=async(id,endpoint)=>{
     const response={body:{testFixture:true,symbol:mappings[id].symbol,endpoint},endpoint,params:{symbols:mappings[id].symbol},apiVersion:'v2',host:'FAKE_TRANSPORT',retrievedAt:new Date(fixed).toISOString()};
     calls.push({id,endpoint});await budget.reserve({cost:1,endpoint});await onResponse(response);
     responses.set(id,[...(responses.get(id)||[]),response]);
    };
    return {getMetadata:async id=>{await respond(id,'/tickers');return {available:true,data:{isin:id===rows[4].listingId?null:mappings[id].isin,providerSymbol:mappings[id].symbol,exchange:mappings[id].mic,currency:mappings[id].currency,assetType:mappings[id].assetType}};},
     getQuote:async id=>{await respond(id,'/eod/latest');return {available:false,reason:'dataUnavailable'};},
     getHistoricalBars:async()=>{throw Error('FAILED_LISTING_MUST_NOT_QUERY_HISTORY');}};
   }};
  const result=await ingest(input);
  assert.equal(result.series,0);assert.equal(result.budget.requestsAttempted,7,'three metadata/quote failures and one identity failure only');
  for(const [id,originals] of responses){
   const decision=result.decisions.find(d=>d.listingId===id),expected=originals.map(r=>'sha256:'+hash(r));
   assert.deepEqual(decision.sourceEvidence,expected,'decision references only this listing exact responses');
   assert.equal(decision.testedAt,new Date(fixed).toISOString());assert.equal(decision.asOf,asOf);assert.equal(decision.status,'BLOCKED');
   for(const response of originals)assert.deepEqual(JSON.parse(readFileSync(join(input.privateDir,'source',hash(response)+'.json'),'utf8')),response);
  }
  const gated=rows.slice(0,4).find(r=>!responses.has(r.listingId));assert.ok(gated,'fourth same-venue listing is not queried');
  const gateDecision=result.decisions.find(d=>d.listingId===gated.listingId);
  assert.equal(gateDecision.cause,'UNSUPPORTED_LISTING');assert.deepEqual(gateDecision.sourceEvidence,[]);assert.equal(calls.filter(c=>c.id===gated.listingId).length,0);
  const missingIdentity=result.decisions.find(d=>d.listingId===rows[4].listingId);assert.equal(missingIdentity.cause,'MAPPING_ERROR');assert.equal(missingIdentity.sourceEvidence.length,1);
  const unmapped=result.decisions.find(d=>d.listingId===rows[5].listingId);assert.equal(unmapped.cause,'MAPPING_ERROR');assert.deepEqual(unmapped.sourceEvidence,[]);assert.equal(calls.filter(c=>c.id===unmapped.listingId).length,0);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('metadata reuse binds current provider mapping, valid past time and verified local share class',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-metadata-binding-'));try{
  const asOf='2026-10-06',fixed=Date.parse(asOf+'T11:00:00Z'),isin='DE0007664039',mic='XETR';let metadataCalls=0,quoteCalls=0,metadataFailure=null;
  const row={isin,mic,ticker:'VW_FIXTURE',listingId:I.listingIdFor({isin,mic}),securityId:I.securityIdForISIN(isin),name:'Synthetic preferred fixture',
   assetType:'EQUITY',shareClass:'PREFERRED_SHARE',mappingStatus:'VERIFIED',mappingSource:['SYNTHETIC_CONTRACT_FIXTURE'],quoteUnit:'MAJOR',tradingCurrency:'EUR',
   indexMemberships:['DAX'],providerSymbol:'VALID_FIXTURE.DE',providerIdentityBasis:'REQUEST_CANDIDATE_REQUIRE_RESPONSE_ISIN'};
  const input={listingMap:{schemaVersion:'de-eu-listing-map-1.0.0',asOf,listings:[row]},accountEvidence:{kind:'VERIFIED_ACCOUNT_REMAINDER',id:'TEST_METADATA_BINDING',
   source:'SYNTHETIC_TEST',month:'2026-10',observedAt:new Date(fixed).toISOString(),remainingCredits:10000},asOf,now:()=>fixed,runId:'FAKE_METADATA_BINDING_ONLY',
   privateDir:join(out,'marketstack'),previewOut:join(out,'preview'),providerFactory:({mappings,budget,onResponse})=>{
    const respond=async(id,endpoint)=>{await budget.reserve({cost:1,endpoint});await onResponse({body:{testFixture:true,symbol:mappings[id].symbol,endpoint,metadataCalls},endpoint,
     params:{symbols:mappings[id].symbol},apiVersion:'v2',host:'FAKE_TRANSPORT',retrievedAt:new Date(fixed).toISOString()});};
    return {getMetadata:async id=>{metadataCalls++;await respond(id,'/tickers');return metadataFailure?{available:false,reason:metadataFailure}:{available:true,data:{isin,
     providerSymbol:mappings[id].symbol,exchange:mappings[id].exchange,currency:mappings[id].currency,assetType:mappings[id].assetType}};},
     getQuote:async id=>{quoteCalls++;await respond(id,'/eod/latest');return {available:true,data:{timestamp:'2026-10-02T00:00:00Z',last:101}};},
     getHistoricalBars:async id=>{await respond(id,'/eod');return {available:true,data:{anomalies:[],bars:[{date:'2026-10-01',open:99,high:101,low:98,close:100,volume:10},{date:'2026-10-02',open:100,high:102,low:99,close:101,volume:11}]}};}};
   }};
  await ingest(input);assert.equal(metadataCalls,1);
  const cachePath=join(input.privateDir,'metadata',row.listingId+'.json'),validCache=JSON.parse(readFileSync(cachePath,'utf8'));
  assert.equal(validCache.data.assetType,'preferred_equity');await ingest(input);assert.equal(metadataCalls,1,'unchanged valid metadata is reused without a daily metadata request');
  const beforeQuotes=quoteCalls;metadataFailure='isinMismatch';
  const changed=await ingest({...input,listingMap:{...input.listingMap,listings:[{...row,providerSymbol:'WRONG_FIXTURE.DE'}]}});
  assert.equal(metadataCalls,2);assert.equal(quoteCalls,beforeQuotes,'changed symbol must pass fresh identity before prices');
  assert.equal(changed.decisions[0].status,'BLOCKED');assert.equal(changed.decisions[0].cause,'MAPPING_ERROR');assert.equal(changed.decisions[0].sourceEvidence.length,1);
  assert.deepEqual(JSON.parse(readFileSync(cachePath,'utf8')),validCache,'failed revalidation does not replace prior verified mapping');
  metadataFailure=null;
  const invalidCaches=[
   {label:'malformed timestamp',alter:c=>{c.checkedAt='not-a-date';}},
   {label:'future timestamp',alter:c=>{c.checkedAt=new Date(fixed+1000).toISOString();}},
   {label:'expired timestamp',alter:c=>{c.checkedAt=new Date(fixed-30*86400000-1).toISOString();}},
   {label:'missing binding field',alter:c=>{delete c.data.providerSymbol;}},
   {label:'changed ISIN',alter:c=>{c.isin='DE0007164600';}},
   {label:'changed MIC',alter:c=>{c.mic='XFRA';}},
   {label:'contradictory response ISIN',alter:c=>{c.data.isin='DE0007164600';}},
   {label:'changed provider exchange',alter:c=>{c.data.exchange='XFRA';}},
   {label:'changed currency',alter:c=>{c.data.currency='USD';}}
  ];
  for(const {label,alter} of invalidCaches){const invalid=structuredClone(validCache);alter(invalid);writeFileSync(cachePath,JSON.stringify(invalid));const before=metadataCalls;
   await ingest(input);assert.equal(metadataCalls,before+1,label+' requires a fresh metadata check');assert.deepEqual(JSON.parse(readFileSync(cachePath,'utf8')).data,validCache.data);}
  const contradictory=structuredClone(validCache);contradictory.data.assetType='equity';writeFileSync(cachePath,JSON.stringify(contradictory));metadataFailure='assetTypeMismatch';
  const beforeTypeCalls=metadataCalls,beforeTypeQuotes=quoteCalls,rejectedType=await ingest(input);
  assert.equal(metadataCalls,beforeTypeCalls+1,'cached ordinary type cannot certify a local preferred class');assert.equal(quoteCalls,beforeTypeQuotes);
  assert.equal(rejectedType.decisions[0].status,'BLOCKED');assert.equal(rejectedType.decisions[0].cause,'PROVIDER_DATA_DEFECT');assert.equal(rejectedType.decisions[0].sourceEvidence.length,1);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('missing provider ISIN needs an exact frozen historical symbol/ISIN/MIC source tuple, never a tag alone',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-historical-proof-'));try{
  const asOf='2026-10-06',fixed=Date.parse(asOf+'T11:00:00Z'),isin='DE0007164600',mic='XETR',symbol='PROOF_FIXTURE.DE';let metadataCalls=0,quoteCalls=0;
  const proof={providerSymbol:symbol,isin,mic,sourceHash:hash({synthetic:true,symbol,isin,mic}),sourcePath:'synthetic-frozen-exact-response.json'};
  const row={isin,mic,ticker:'PROOF_FIXTURE',listingId:I.listingIdFor({isin,mic}),securityId:I.securityIdForISIN(isin),name:'Synthetic historical proof fixture',
   assetType:'EQUITY',shareClass:'ORDINARY_SHARE',mappingStatus:'VERIFIED',mappingSource:['SYNTHETIC_CONTRACT_FIXTURE'],quoteUnit:'MAJOR',tradingCurrency:'EUR',
   indexMemberships:['DAX'],providerSymbol:symbol,providerIdentityBasis:'HISTORICAL_EXACT_ISIN_MIC_SYNTHETIC_TEST'};
  const input={listingMap:{schemaVersion:'de-eu-listing-map-1.0.0',asOf,listings:[row]},accountEvidence:{kind:'VERIFIED_ACCOUNT_REMAINDER',id:'TEST_HISTORICAL_TUPLE',
   source:'SYNTHETIC_TEST',month:'2026-10',observedAt:new Date(fixed).toISOString(),remainingCredits:10000},asOf,now:()=>fixed,runId:'FAKE_HISTORICAL_TUPLE_ONLY',
   privateDir:join(out,'marketstack'),previewOut:join(out,'preview'),providerFactory:({mappings,budget,onResponse})=>{
    const respond=async(id,endpoint)=>{await budget.reserve({cost:1,endpoint});await onResponse({body:{testFixture:true,symbol:mappings[id].symbol,endpoint,metadataCalls},endpoint,
     params:{symbols:mappings[id].symbol},apiVersion:'v2',host:'FAKE_TRANSPORT',retrievedAt:new Date(fixed).toISOString()});};
    return {getMetadata:async id=>{metadataCalls++;await respond(id,'/tickers');return {available:true,data:{isin:null,providerSymbol:mappings[id].symbol,
     exchange:mappings[id].exchange,currency:mappings[id].currency,assetType:mappings[id].assetType}};},
     getQuote:async id=>{quoteCalls++;await respond(id,'/eod/latest');return {available:true,data:{timestamp:'2026-10-02T00:00:00Z',last:101}};},
     getHistoricalBars:async id=>{await respond(id,'/eod');return {available:true,data:{anomalies:[],bars:[{date:'2026-10-01',open:99,high:101,low:98,close:100,volume:10},{date:'2026-10-02',open:100,high:102,low:99,close:101,volume:11}]}};}};
   }};
  const tagOnly=await ingest(input);assert.equal(tagOnly.decisions[0].cause,'MAPPING_ERROR');assert.equal(tagOnly.decisions[0].status,'BLOCKED');assert.equal(quoteCalls,0);
  const withProof={...input,listingMap:{...input.listingMap,listings:[{...row,providerIdentityEvidence:proof}]}};
  const allowed=await ingest(withProof);assert.equal(allowed.series,1);assert.equal(allowed.decisions[0].status,'PARTIAL');assert.equal(metadataCalls,2);assert.equal(quoteCalls,1);
  await ingest(withProof);assert.equal(metadataCalls,2,'exact frozen tuple also permits safe unchanged cache reuse');
  const invalidProofs=[undefined,{...proof,providerSymbol:'OTHER.DE'},{...proof,isin:'DE0007664039'},{...proof,mic:'XFRA'},
   {...proof,sourceHash:'not-a-source-hash'},{...proof,sourceHash:null},{...proof,sourcePath:''},{...proof,sourcePath:'   '}];
  for(const invalid of invalidProofs){const beforeMetadata=metadataCalls,beforeQuotes=quoteCalls;
   const rejected=await ingest({...input,listingMap:{...input.listingMap,listings:[{...row,providerIdentityEvidence:invalid}]}});
   assert.equal(metadataCalls,beforeMetadata+1,'missing/conflicting historical tuple cannot reuse missing-ISIN metadata');assert.equal(quoteCalls,beforeQuotes);
   assert.equal(rejected.decisions[0].status,'BLOCKED');assert.equal(rejected.decisions[0].cause,'MAPPING_ERROR');assert.equal(rejected.decisions[0].sourceEvidence.length,1);
  }
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('reference checkpoints migrate legacy state and preserve alternating cohort proofs, decisions and drift guards',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-de-eu-cohort-checkpoints-'));try{
  const asOf='2026-10-06',fixed=Date.parse(asOf+'T11:00:00Z'),calls=[];let correction=false;
  const rows=Array.from({length:4},(_,n)=>{
   const base='DE'+String(999000200+n).padStart(9,'0'),isin=Array.from({length:10},(_,i)=>base+i).find(s=>I.normalizeISIN(s)),mic='XETR';
   return {isin,mic,ticker:'COHORT'+n,listingId:I.listingIdFor({isin,mic}),securityId:I.securityIdForISIN(isin),name:'Synthetic cohort '+n,assetType:'EQUITY',
    shareClass:n%2?'PREFERRED_SHARE':'ORDINARY_SHARE',mappingStatus:'VERIFIED',mappingSource:['SYNTHETIC_CONTRACT_FIXTURE'],quoteUnit:'MAJOR',tradingCurrency:'EUR',
    indexMemberships:['DAX','MDAX','SDAX','TECDAX','EURO_STOXX_50'],providerSymbol:'COHORT'+n+'.DE',providerIdentityBasis:'REQUEST_CANDIDATE_REQUIRE_RESPONSE_ISIN'};
  });
  const mapA={schemaVersion:'de-eu-listing-map-1.0.0',asOf,listings:rows.slice(0,2)},mapB={...mapA,listings:rows.slice(2)},aIds=new Set(mapA.listings.map(r=>r.listingId));
  const privateDir=join(out,'marketstack'),input={accountEvidence:{kind:'VERIFIED_ACCOUNT_REMAINDER',id:'TEST_ALTERNATING_COHORTS',source:'SYNTHETIC_TEST',month:'2026-10',
   observedAt:new Date(fixed).toISOString(),remainingCredits:10000},asOf,now:()=>fixed,runId:'FAKE_ALTERNATING_COHORTS_ONLY',privateDir,previewOut:join(out,'preview'),
   providerFactory:({mappings,budget,onResponse})=>{
    const respond=async(id,endpoint)=>{calls.push({id,endpoint});await budget.reserve({cost:1,endpoint});await onResponse({body:{testFixture:true,symbol:mappings[id].symbol,endpoint},endpoint,
     params:{symbols:mappings[id].symbol},apiVersion:'v2',host:'FAKE_TRANSPORT',retrievedAt:new Date(fixed).toISOString()});};
    return {getMetadata:async id=>{await respond(id,'/tickers');return {available:true,data:{isin:mappings[id].isin,providerSymbol:mappings[id].symbol,
     exchange:mappings[id].exchange,currency:mappings[id].currency,assetType:mappings[id].assetType}};},
     getQuote:async id=>{await respond(id,'/eod/latest');return {available:true,data:{timestamp:'2026-10-02T00:00:00Z',last:101}};},
     getHistoricalBars:async(id,{to})=>{await respond(id,'/eod');return {available:true,data:{anomalies:[],bars:[{date:'2026-10-01',open:99,high:101,low:98,close:correction&&id===mapA.listings[0].listingId?99:100,volume:10},
      {date:'2026-10-02',open:100,high:102,low:99,close:101,volume:11},...(aIds.has(id)&&to>'2026-10-06'?[{date:'2026-10-07',open:101,high:104,low:100,close:103,volume:12}]:[])]}};}};
   }};
  const checkpointPath=map=>join(privateDir,'checkpoints',hash(map)+'.json'),load=p=>JSON.parse(readFileSync(p,'utf8'));
  const proof=map=>({fixture:false,passed:true,asOf,referenceHash:hash(map),successfulListingIds:map.listings.map(r=>r.listingId),testedListingIds:map.listings.map(r=>r.listingId),
   engines:['chromium','webkit'],normalizedHistoryHashes:Object.fromEntries(map.listings.map(r=>[r.listingId,hash(load(join(privateDir,'normalized',r.listingId+'.json')))]))});
  await ingest({...input,listingMap:mapA});const proofA=proof(mapA),legacyA=load(join(privateDir,'checkpoint.json'));
  rmSync(checkpointPath(mapA)); // Emulate the existing authenticated legacy-only cache.
  await ingest({...input,listingMap:mapB});const proofB=proof(mapB);
  assert.deepEqual(load(checkpointPath(mapA)),legacyA,'first new cohort archives the untouched legacy reference before replacing latest');
  const mandatoryA=await ingest({...input,listingMap:mapA,phase:'mandatory',sampleProof:proofA});
  assert.deepEqual(mandatoryA.decisions.map(d=>d.listingId).sort(),[...aIds].sort(),'another reference sample decisions must not be copied');
  await ingest({...input,listingMap:mapA,asOf:'2026-10-07',phase:'refresh',sampleProof:proofA});const updatedA=load(checkpointPath(mapA));
  assert.deepEqual(updatedA.currentHistoryHashes,Object.fromEntries(mapA.listings.map(r=>[r.listingId,hash(load(join(privateDir,'normalized',r.listingId+'.json')))])),'incremental hashes equal full actual normalized-file hashes after new bars');
  assert.equal(updatedA.validatedSampleProofHash,hash(proofA));assert.notDeepEqual(updatedA.currentHistoryHashes,legacyA.currentHistoryHashes,'legitimate A bars update only A history checksums');
  const mandatoryB=await ingest({...input,listingMap:mapB,phase:'mandatory',sampleProof:proofB});
  assert.deepEqual(mandatoryB.decisions.map(d=>d.listingId).sort(),mapB.listings.map(r=>r.listingId).sort());
  await ingest({...input,listingMap:mapB,phase:'refresh',sampleProof:proofB});assert.deepEqual(load(checkpointPath(mapA)),updatedA,'B refresh preserves the complete A proof and current-history hashes');
  const unchangedBHashes=load(checkpointPath(mapB)).currentHistoryHashes;correction=true;
  const beforeRepeat=calls.length,repeated=await ingest({...input,listingMap:mapA,asOf:'2026-10-07',phase:'refresh',sampleProof:proofA});
  assert.equal(calls.length-beforeRepeat,2);assert.equal(repeated.budget.requestsAttempted,calls.length,'cohorts share one cumulative counter');
  const correctedHashes=load(checkpointPath(mapA)).currentHistoryHashes;
  assert.deepEqual(correctedHashes,Object.fromEntries(mapA.listings.map(r=>[r.listingId,hash(load(join(privateDir,'normalized',r.listingId+'.json')))])),'incremental hashes equal full actual normalized-file hashes after a legitimate overlap correction');
  assert.ok(repeated.decisions.find(d=>d.listingId===mapA.listings[0].listingId).restatements.some(r=>r.date==='2026-10-01'&&r.fields.includes('close')));
  assert.notEqual(correctedHashes[mapA.listings[0].listingId],updatedA.currentHistoryHashes[mapA.listings[0].listingId]);
  assert.equal(correctedHashes[mapA.listings[1].listingId],updatedA.currentHistoryHashes[mapA.listings[1].listingId],'unchanged cached history hash remains identical');
  assert.deepEqual(unchangedBHashes,Object.fromEntries(mapB.listings.map(r=>[r.listingId,hash(load(join(privateDir,'normalized',r.listingId+'.json')))])),'other untouched cached listings retain exact history hashes');
  assert.equal(load(join(privateDir,'checkpoint.json')).referenceHash,hash(mapA));assert.deepEqual(load(checkpointPath(mapA)),load(join(privateDir,'checkpoint.json')));
  const changedPath=join(privateDir,'normalized',mapA.listings[0].listingId+'.json'),changed=load(changedPath);changed.bars[0].close=80;writeFileSync(changedPath,JSON.stringify(changed));
  const beforeDrift=calls.length;await assert.rejects(ingest({...input,listingMap:mapA,asOf:'2026-10-07',phase:'refresh',sampleProof:proofA}),/CACHED_HISTORY_DRIFT_REVALIDATE/);
  assert.equal(calls.length,beforeDrift,'another cohort must not erase the drift gate');
  const wrong={...load(checkpointPath(mapB)),referenceHash:hash(mapA)};writeFileSync(checkpointPath(mapB),JSON.stringify(wrong));
  await assert.rejects(ingest({...input,listingMap:mapB,phase:'refresh',sampleProof:proofB}),/REFERENCE_CHECKPOINT_MISMATCH/);assert.equal(calls.length,beforeDrift);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('explicit frozen samples preserve selected order and reject missing identity, venue, index or preferred-class coverage',()=>{
 const identities=[['DE0007164600','XETR'],['DE0007664039','XPAR'],['NL0010273215','XAMS']];
 const rows=identities.map(([isin,mic],n)=>({isin,mic,listingId:I.listingIdFor({isin,mic}),shareClass:n===1?'PREFERRED_SHARE':'ORDINARY_SHARE',indexMemberships:n===2?['EURO_STOXX_50']:['DAX','MDAX','SDAX','TECDAX']}));
 const ids=rows.map(r=>r.listingId).reverse();assert.deepEqual(sampleSelection(rows,15,ids).map(r=>r.listingId),ids);
 for(const wrong of [[],[ids[0],ids[0]],['lst_XETR_DE000BASF111'],[ids[0],ids[1]],Array(21).fill(ids[0])])assert.throws(()=>sampleSelection(rows,15,wrong),/FROZEN_SAMPLE/);
 const sameVenue=rows.map(r=>({...r,mic:'XETR',listingId:I.listingIdFor({isin:r.isin,mic:'XETR'})}));assert.throws(()=>sampleSelection(sameVenue,15,[sameVenue[0].listingId,sameVenue[1].listingId]),/INDEX_COVERAGE/);assert.throws(()=>sampleSelection(sameVenue,15,[sameVenue[0].listingId,sameVenue[2].listingId]),/SHARE_CLASS_COVERAGE/);
});
test('immutable quarantine ledger retains original observations and source hashes after a distinct valid correction',()=>{
 const original=[{date:'2026-09-25T00:00:00+0000',reason:'invalidOHLC'},{date:'2026-09-26T00:00:00+0000',reason:'negativeVolume'}],source=['sha256:'+hash({original:true})];
 const ledger=mergeQuarantineLedger([],original,[],source,[],'2026-10-06');assert.equal(ledger.length,2);assert.deepEqual(ledger.map(l=>l.sourceEvidence),[source,source]);
 const active=mergeQuarantine(original,[],[{date:'2026-09-25',close:100}]);assert.equal(active.length,1);
 const repeated=mergeQuarantineLedger(ledger,active,[{date:'2026-10-06',reason:'invalidOHLC'}],source,['sha256:'+hash({new:true})],'2026-10-07');assert.equal(repeated.length,3);for(const entry of ledger)assert.deepEqual(repeated.find(r=>r.observationHash===entry.observationHash),entry);
 assert.deepEqual(mergeQuarantineLedger(repeated,active,[],source,[],'2026-10-07'),repeated);assert.ok(repeated.some(l=>l.observation.date===original[0].date),'corrected original row is still retained, never re-admitted');
});
test('hash-bound existing-series sample and refresh use latest plus bounded overlap, skip unsupported actions and preserve correction provenance',async()=>{
 const out=mkdtempSync(join(tmpdir(),'vu-817-bounded-refresh-'));try{
  const rows=[['DE0007164600','XETR'],['DE0007664039','XPAR']].map(([isin,mic],n)=>({isin,mic,listingId:I.listingIdFor({isin,mic}),securityId:I.securityIdForISIN(isin),ticker:'POLICY'+n,name:'Synthetic incremental '+n,assetType:'EQUITY',shareClass:n?'PREFERRED_SHARE':'ORDINARY_SHARE',mappingStatus:'VERIFIED',mappingSource:['SYNTHETIC_EXACT_REFERENCE'],quoteUnit:'MAJOR',tradingCurrency:'EUR',indexMemberships:['DAX','MDAX','SDAX','TECDAX','EURO_STOXX_50'],providerSymbol:'POLICY'+n+'.DE'}));
  let updated=false;const calls=[],oldMap={schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:rows},oldNow=Date.parse('2026-10-06T18:00:00Z');
  const auth={kind:'USER_AUTHORIZED_BOUNDED_RUN',id:'INCREMENTAL_SYNTHETIC',runId:'INCREMENTAL_SYNTHETIC',source:'SYNTHETIC_AUTHORIZATION',month:'2026-10',observedAt:new Date(oldNow).toISOString(),unknownAccountUsageAcknowledged:true,hardLimit:20000,targetLimit:15000,sourceSHA:'a'.repeat(40),referenceHash:hash(oldMap)};
  const factory=({mappings,budget,onResponse})=>{
   const respond=async(id,endpoint,opts={})=>{calls.push({id,endpoint,opts});await budget.reserve({cost:1,endpoint});await onResponse({body:{fixture:true,symbol:mappings[id].symbol,updated},endpoint,params:{symbols:mappings[id].symbol,...opts},apiVersion:'v2',host:'FAKE_TRANSPORT',retrievedAt:new Date(updated?oldNow+86400000:oldNow).toISOString()});};
   return {getMetadata:async id=>{await respond(id,'/tickers');return {available:true,data:{isin:mappings[id].isin,providerSymbol:mappings[id].symbol,exchange:mappings[id].mic,currency:mappings[id].currency,assetType:mappings[id].assetType}};},getQuote:async id=>{await respond(id,'/eod/latest');return {available:true,data:{timestamp:updated?'2026-10-06T00:00:00Z':'2026-10-02T00:00:00Z',last:updated?105:101}};},getHistoricalBars:async(id,opts)=>{
    await respond(id,'/eod',opts);const bars=[...(updated?[{date:'2026-09-25',open:98,high:101,low:97,close:99,volume:9}]:[]),{date:'2026-10-01',open:99,high:101,low:98,close:100,volume:10},{date:'2026-10-02',open:100,high:102,low:99,close:updated?102:101,volume:11},...(updated?[{date:'2026-10-06',open:103,high:106,low:102,close:105,volume:12}]:[])].filter(bar=>bar.date>=opts.from&&bar.date<=opts.to);
    return {available:true,data:{bars,anomalies:updated?[]:[{date:'2026-09-25T00:00:00+0000',reason:'invalidOHLC'},{date:'2026-09-26T00:00:00+0000',reason:'invalidOHLC'}]}};
   },getActionEvents:async(id,kind)=>{await respond(id,'/'+kind);return {available:true,data:{events:[],verified:false}};}};
  };
  const base={listingMap:oldMap,accountEvidence:auth,asOf:oldMap.asOf,now:()=>oldNow,runId:auth.runId,privateDir:join(out,'marketstack'),previewOut:join(out,'preview'),providerFactory:factory};
  const initial=await ingest(base);assert.equal(initial.budget.requestsAttempted,10,'legacy sample requests remain unchanged');const load=id=>JSON.parse(readFileSync(join(base.privateDir,'normalized',id+'.json')));
  const cachedHistoryHashes=Object.fromEntries(rows.map(r=>[r.listingId,hash(load(r.listingId))])),ids=rows.map(r=>r.listingId).reverse();
  const map={...oldMap,asOf:'2026-10-07',sampleListingIds:ids,ingestionPolicy:{schemaVersion:'de-eu-incremental-policy-1.0.0',mode:'EXISTING_ACCEPTED_SERIES',latestEod:true,historyOverlapDays:10,maxLookbackDays:45,skipDocumentedUncoveredDedicatedActions:true,dedicatedActionCoverageSourceHash:dedicatedActionCoverage('XETR').evidence[0].sha256,cachedHistoryHashes}};
  const newer={...base,listingMap:map,asOf:map.asOf,now:()=>oldNow+86400000,accountEvidence:{...auth,observedAt:new Date(oldNow+86400000).toISOString(),sourceSHA:'b'.repeat(40),referenceHash:hash(map),previousLedgerHash:initial.budget.ledgerHash}};updated=true;
  const before=calls.length,sample=await ingest(newer);assert.equal(sample.sampleSuccesses,2);assert.equal(calls.length-before,4);assert.ok(calls.slice(before).every(c=>['/eod/latest','/eod'].includes(c.endpoint)));assert.ok(calls.slice(before).filter(c=>c.endpoint==='/eod').every(c=>c.opts.from==='2026-09-22'&&c.opts.maxPages===2));
  for(const r of rows){const h=load(r.listingId);assert.equal(h.quarantined.length,1);assert.equal(h.quarantineLedger.length,2);assert.equal(h.quality.originalQuarantinedCandles,2);assert.equal(h.quarantineCorrections.length,1);assert.equal(h.quarantineCorrections[0].date,'2026-09-25');assert.equal(h.quarantineCorrections[0].quarantinedObservationHashes.length,1);assert.ok(h.quarantineCorrections[0].sourceEvidence.length);assert.equal(h.restatementLedger.length,1);assert.ok(h.restatementLedger[0].previousBarHash);assert.ok(h.restatementLedger[0].incomingBarHash);assert.ok(h.restatementLedger[0].sourceEvidence.length);assert.equal(h.corporateActions.splits.actionsComplete,false);assert.equal(h.corporateActions.dividends.verified,false);assert.deepEqual(h.bars.map(b=>b.date),['2026-09-25','2026-10-01','2026-10-02','2026-10-06']);}
  const proof={fixture:false,passed:true,asOf:map.asOf,referenceHash:hash(map),successfulListingIds:ids,testedListingIds:ids,engines:['chromium','webkit'],normalizedHistoryHashes:Object.fromEntries(ids.map(id=>[id,hash(load(id))]))};
  const refreshStart=calls.length,refreshed=await ingest({...newer,phase:'refresh',sampleProof:proof});assert.equal(refreshed.sampleSuccesses,2);assert.equal(calls.length-refreshStart,4);assert.ok(calls.slice(refreshStart).filter(c=>c.endpoint==='/eod').every(c=>c.opts.from==='2026-09-26'));for(const id of ids){assert.equal(load(id).quarantineLedger.length,2);assert.equal(load(id).restatementLedger.length,1);assert.equal(load(id).quarantineCorrections.length,1);}
  const path=join(base.privateDir,'normalized',ids[0]+'.json'),drift=load(ids[0]);drift.bars[0].close=90;writeFileSync(path,JSON.stringify(drift));const beforeDrift=calls.length;await assert.rejects(ingest({...newer,phase:'refresh',sampleProof:proof}),/CACHED_HISTORY_DRIFT/);assert.equal(calls.length,beforeDrift);
  await assert.rejects(ingest({...newer,listingMap:{...map,ingestionPolicy:{...map.ingestionPolicy,dedicatedActionCoverageSourceHash:'f'.repeat(64)}}}),/FROZEN_INCREMENTAL_POLICY_INVALID/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('large stale overlap is capped explicitly with a retained gap limitation, never a full-history reimport',()=>{
 const old={bars:[{date:'2026-06-01',close:100}]},policy={historyOverlapDays:10,maxLookbackDays:45};
 const bounded=incrementalHistoryWindow(old,'2026-10-07',5,policy);assert.equal(bounded.from,'2026-08-23');assert.equal(bounded.to,'2026-10-07');assert.equal(bounded.boundedGapRemains,true);assert.equal(bounded.priorLatestDate,'2026-06-01');
 const legacy=incrementalHistoryWindow(old,'2026-10-07');assert.equal(legacy.from,'2026-05-22');assert.equal(legacy.boundedGapRemains,false);
 const recent=incrementalHistoryWindow({bars:[{date:'2026-10-02'}]},'2026-10-07',5,policy);assert.equal(recent.from,'2026-09-22');assert.equal(recent.boundedGapRemains,false);assert.deepEqual(old.bars,[{date:'2026-06-01',close:100}]);
});
