import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDnaR2ReadOnlyPreflight,verifyDnaR2Snapshot,readOnlyDnaR2Driver} from '../../scripts/market/tiingo2-dna-r2-baseline.mjs';
import {assessDnaHistoryDecision} from '../../scripts/market/tiingo2-run-productization.mjs';
import {createRequire} from 'node:module';
const Codec=createRequire(import.meta.url)('../../quant/engines/bar-codec.js');

test('DNA baseline requires a measured current READ_ONLY R2 cost gate',()=>{
 const pf={generatedAt:new Date().toISOString(),operation:'READ_ONLY',gate:'FULL_UNIVERSE',measured:true,
  offline:false,provider:'tiingo',market:'US',verdict:{verdict:'ZERO_COST_GUARD_PASSED'},
  executionAllowed:true,budgetForRun:{classAOperations:0,classBOperations:10}};
 assert.equal(verifyDnaR2ReadOnlyPreflight(pf),true);
 for(const change of [row=>row.operation='RECOVERY',row=>row.executionAllowed=false,row=>row.offline=true,
  row=>row.budgetForRun=null,row=>row.generatedAt='2025-01-01T00:00:00Z']){
  const bad=structuredClone(pf);change(bad);
  assert.throws(()=>verifyDnaR2ReadOnlyPreflight(bad),/DNA_R2_READ_ONLY_PREFLIGHT_REQUIRED/);
 }
});
test('DNA R2 driver refuses every mutating method including conditional puts',()=>{
 const fake={kind:'s3',get:()=>Buffer.from('safe'),put:()=>true,putIfAbsentOrSame:()=>true,
  putIfMatch:()=>true,delete:()=>true,list:()=>[]},driver=readOnlyDnaR2Driver(fake);
 assert.equal(driver.get().toString(),'safe');
 for(const method of ['put','putIfAbsentOrSame','putIfMatch','delete','list'])
  assert.throws(()=>driver[method]('key'),/DNA_R2_BASELINE_READ_ONLY/,method);
});
test('DNA R2 series is tied to one unchanged index snapshot',()=>{
 const dates=Array.from({length:300},(_,i)=>new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10)),
  input={ticker:'DNA',securityId:'ref_DNA',provider:'tiingo',bars:dates.map((date,i)=>({date,securityId:'ref_DNA',close:i+1}))},
  encoded=Codec.encode(input,{codec:'gzip'}).buffer,series=Codec.decode(encoded),
  expectedKey='v1/tiingo/daily/US/DNA.json.gz',
  meta={ticker:'DNA',key:expectedKey,bytes:encoded.length,first:dates[0],last:dates.at(-1),barCount:300,
   sha256:Codec.encode(input,{codec:'gzip'}).meta.sha256},
  first={index:{symbols:{DNA:meta}},etag:'"etag-1"'},second=structuredClone(first);
 const checked=()=>verifyDnaR2Snapshot({first,second,series,encoded,expectedKey});
 assert.equal(checked().bars,300);
 second.etag='"etag-2"';assert.throws(checked,/DNA_R2_BASELINE_IDENTITY_OR_INDEX_CHANGED/);
 second.etag=null;first.etag=null;
 assert.throws(checked,/DNA_R2_BASELINE_IDENTITY_OR_INDEX_CHANGED/);
 first.etag='"etag-1"';second.etag=first.etag;
 second.index.symbols.DNA.barCount=299;
 assert.throws(checked,/DNA_R2_BASELINE_IDENTITY_OR_INDEX_CHANGED/);
 second.index.symbols.DNA.barCount=300;
 const wrongKey=structuredClone(first);wrongKey.index.symbols.DNA.key='wrong/object.gz';
 assert.throws(()=>verifyDnaR2Snapshot({first:wrongKey,second:wrongKey,series,encoded,expectedKey}),/DNA_R2_ENCODED_OBJECT_INDEX_MISMATCH/);
 const altered=structuredClone(input);altered.bars[100].close=999;
 const tampered=Codec.encode(altered,{codec:'gzip'}).buffer;
 assert.throws(()=>verifyDnaR2Snapshot({first,second,series,encoded:tampered,expectedKey}),/DNA_R2_ENCODED_OBJECT_INDEX_MISMATCH/,
  'a different payload with the same dates and count cannot borrow the index hash');
});
test('missing R2 preflight explicitly defers only existing DNA',async()=>{
 const decision=await assessDnaHistoryDecision({preflightFile:null});
 assert.equal(decision.state,'DEFERRED_EXISTING_DNA_UNCHANGED');
 assert.equal(decision.fullDailyBaselineVerified,false);
 assert.equal(decision.productionWrites,0);
});
