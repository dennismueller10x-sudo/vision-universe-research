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
