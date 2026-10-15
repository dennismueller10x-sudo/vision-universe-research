import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captureV3} from '../research/calibration/capture-v3-inrunner.mjs';
import {buildFreezeV3,verifyFreezeV3,verifyInputsAgainstFreeze,importClosure,ENTRY_POINTS,CONTRACT_FILES} from '../research/calibration/freeze-v3.mjs';
const window={warmupFrom:'2015-01-01',from:'2018-01-02',to:'2026-09-30'};
const collect=async()=>({privateInput:{observedAt:'2026-10-14T10:00:00.000Z',sourceObjects:[],readReceipts:[],observedListings:[]},publicStatus:{canonicalCounts:{inputSegments:3,usableSegments:2},canonicalRejections:null,counts:{}},canonicalData:{state:'AVAILABLE',window,coverage:{inputSegments:3,usableSegments:2},securities:[0,1].map(i=>({id:'fx:'+i,listing:{id:'fx:'+i},bars:[],fundamentals:[]})),benchmark:{bars:[]},calendar:['2018-01-02'],fingerprint:'c'.repeat(64),limitations:[]}});
async function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3frz-')),input=path.join(dir,'in'),receipt=await captureV3({out:input,collect});
 const parsed=path.join(dir,'parsed.json');
 fs.writeFileSync(parsed,JSON.stringify({schema:'vision-universe-calibration-v3-parsed-reference-private-1.0.0',noPostResultToleranceChanges:true,sourcePlanSha256:'a'.repeat(64),parserSha256:'b'.repeat(64)}));
 return {dir,input,receipt,parsed};
}
test('final freeze binds inputs, reference artifact and the import closure; any change is detected',async()=>{
 const f=await fixture();
 try{
  const freeze=buildFreezeV3({captureReceipt:f.receipt,inputDir:f.input,referenceParsedPath:f.parsed,runId:'1',codeCommit:'x'});
  assert.equal(verifyFreezeV3(freeze),true);assert.equal(verifyInputsAgainstFreeze(freeze,{inputDir:f.input,referenceParsedPath:f.parsed}),true);
  assert.equal(freeze.strategyDefinitionsChanged,false);assert.equal(freeze.postResultTuningAllowed,false);
  assert.ok(Object.keys(freeze.files).some(x=>x.endsWith('portfolio-calibration-v3.mjs')));
  assert.ok(Object.keys(freeze.files).some(x=>x.endsWith('accounting-budget-v2.mjs')));
  assert.ok(Object.keys(freeze.files).some(x=>x.endsWith('quant/engines/history-store.js')));
  assert.throws(()=>verifyFreezeV3({...freeze,postResultTuningAllowed:true}),/MUTATION_FLAGS|ID_MISMATCH/);
  assert.throws(()=>verifyFreezeV3({...freeze,files:{...freeze.files,[CONTRACT_FILES[0]]:'0'.repeat(64)}}),/ID_MISMATCH|FROZEN_FILE_CHANGED/);
  fs.appendFileSync(f.parsed,' ');assert.throws(()=>verifyInputsAgainstFreeze(freeze,{inputDir:f.input,referenceParsedPath:f.parsed}),/REFERENCE_PARSED_MISMATCH/);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('closure covers every entry point and is stable',()=>{
 const a=importClosure(ENTRY_POINTS),b=importClosure(ENTRY_POINTS);assert.deepEqual(a,b);for(const e of ENTRY_POINTS)assert.ok(a.includes(e));
});
test('every measurable registry method maps to a frozen engine method',async()=>{
 const {ENGINE_ID}=await import('../research/calibration/run-calibration-v3.mjs'),{referenceMethods}=await import('../research/calibration/reference-engines.mjs');
 const registry=JSON.parse(fs.readFileSync(new URL('../research/calibration/BACKTEST-CALIBRATION-METHODS.json',import.meta.url))).referenceScreens.filter(x=>x.status!=='BLOCKED_DATA').map(x=>x.id);
 assert.deepEqual(Object.keys(ENGINE_ID).sort(),registry.slice().sort());
 for(const id of registry)assert.ok(referenceMethods.some(m=>m.id===ENGINE_ID[id]),id);
});
const mk=(stamp,{order=1,close=100}={})=>async()=>{
 const rr=[{sourceKey:'a',sha256:'1'.repeat(64),capturedAt:stamp},{sourceKey:'b',sha256:'2'.repeat(64),capturedAt:stamp}];if(order<0)rr.reverse();
 return{privateInput:{observedAt:stamp,provenance:{workflowRunId:'1'},sourceObjects:[{key:'o2',status:'AVAILABLE',sha256:'3'.repeat(64),retrievedAt:stamp},{key:'o1',status:'AVAILABLE',sha256:'4'.repeat(64),retrievedAt:stamp}],readReceipts:rr,observedListings:[],listingSource:{sha256:'5'.repeat(64),observedAt:stamp}},
  publicStatus:{canonicalCounts:{inputSegments:2,usableSegments:2},canonicalRejections:null,counts:{}},
  canonicalData:{state:'AVAILABLE',window,coverage:{inputSegments:2,usableSegments:2},securities:[0,1].map(i=>({id:'fx:'+i,listing:{id:'fx:'+i},priceSource:{sourceKey:'k'+i,sha256:'6'.repeat(64),capturedAt:stamp},bars:[{date:'2018-01-02',close:close+i}],fundamentals:[]})),benchmark:{bars:[],priceSource:{sha256:'7'.repeat(64),capturedAt:stamp}},calendar:['2018-01-02'],fingerprint:'c'.repeat(64),limitations:[]}};
};
test('content binding ignores timestamps and async receipt order but detects a real data change',async()=>{
 const {captureV3}=await import('../research/calibration/capture-v3-inrunner.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3bind-'));
 try{
  const a=await captureV3({out:path.join(dir,'a'),collect:mk('2026-10-14T10:00:00.000Z')}),b=await captureV3({out:path.join(dir,'b'),collect:mk('2026-10-14T13:30:00.000Z',{order:-1})}),c=await captureV3({out:path.join(dir,'c'),collect:mk('2026-10-14T10:00:00.000Z',{close:101})});
  assert.notEqual(a.inputs.manifestSha256,b.inputs.manifestSha256);
  assert.deepEqual(a.contentBinding,b.contentBinding);
  assert.notDeepEqual(a.contentBinding.normalizedPartListSha256,c.contentBinding.normalizedPartListSha256);
  const parsed=path.join(dir,'p.json');fs.writeFileSync(parsed,JSON.stringify({schema:'vision-universe-calibration-v3-parsed-reference-private-1.0.0',noPostResultToleranceChanges:true,sourcePlanSha256:'a'.repeat(64),parserSha256:'b'.repeat(64),createdAt:'2026-10-14T10:00:00Z'}));
  const freeze=buildFreezeV3({captureReceipt:a,inputDir:path.join(dir,'a'),referenceParsedPath:parsed});
  const {verifyContentAgainstFreeze}=await import('../research/calibration/freeze-v3.mjs');
  const parsed2=path.join(dir,'p2.json');fs.writeFileSync(parsed2,JSON.stringify({schema:'vision-universe-calibration-v3-parsed-reference-private-1.0.0',noPostResultToleranceChanges:true,sourcePlanSha256:'a'.repeat(64),parserSha256:'b'.repeat(64),createdAt:'2026-10-14T19:00:00Z'}));
  assert.equal(verifyContentAgainstFreeze(freeze,{inputDir:path.join(dir,'b'),referenceParsedPath:parsed2}).contentBindingVerified,true);
  assert.throws(()=>verifyContentAgainstFreeze(freeze,{inputDir:path.join(dir,'c'),referenceParsedPath:parsed2}),/CONTENT_BINDING_MISMATCH/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
