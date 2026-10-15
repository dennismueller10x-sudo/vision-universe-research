import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captureV3,CAPTURE_V3_SCHEMA} from '../research/calibration/capture-v3-inrunner.mjs';
const window={warmupFrom:'2015-01-01',from:'2018-01-02',to:'2026-09-30'};
function fakeCollect(n){
 const securities=Array.from({length:n},(_,i)=>({id:'fx:'+i,listing:{id:'fx:'+i},bars:[{date:'2018-01-02',close:100+i,comment:'x'.repeat(300)}],fundamentals:[]}));
 return async()=>({
  privateInput:{observedAt:'2026-10-14T10:00:00.000Z',sourceObjects:[{key:'k1',status:'AVAILABLE',sha256:'a'.repeat(64)},{key:'k2',status:'MISSING',sha256:null}],readReceipts:[{sourceKey:'k1',sha256:'a'.repeat(64)}],observedListings:[]},
  publicStatus:{canonicalCounts:{inputSegments:n+2,usableSegments:n},canonicalRejections:{reasons:{},details:{CORPORATE_ACTION_CONTRADICTED:{SPLIT_NOT_IN_RAW_PRICE:2}}},counts:{readOnlyGetCalls:5,writeCalls:0}},
  canonicalData:{state:'AVAILABLE',window,coverage:{inputSegments:n+2,usableSegments:n},securities,benchmark:{bars:[]},calendar:['2018-01-02'],fingerprint:'c'.repeat(64),limitations:[]}
 });
}
test('in-runner capture writes private plaintext outside the repo and a public receipt without identities',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3cap-')),out=path.join(dir,'private'),pub=path.join(dir,'receipt.json');
 try{
  const r=await captureV3({out,publicOut:pub,collect:fakeCollect(6)});
  assert.equal(r.schema,CAPTURE_V3_SCHEMA);assert.equal(r.counts.usableSegments,6);assert.equal(r.counts.verifiedSecurities,6);
  assert.equal(r.provenance.capturedAt,'2026-10-14T10:00:00.000Z');assert.equal(r.provenance.timestampIsPartOfContentClaim,false);
  assert.equal(r.rejections.details.CORPORATE_ACTION_CONTRADICTED.SPLIT_NOT_IN_RAW_PRICE,2);
  const text=fs.readFileSync(pub,'utf8');assert.equal(text.includes('fx:'),false);assert.equal(r.plaintextUploaded,false);
  assert.ok(fs.readdirSync(out).includes('canonical-dataset-manifest.json'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('capture refuses a repository-internal or non-empty output directory',async()=>{
 await assert.rejects(captureV3({out:path.resolve('scripts/supertrader/tmp-capture'),collect:fakeCollect(1)}),/OUTSIDE_REPOSITORY/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3cap-'));fs.writeFileSync(path.join(dir,'x'),'1');
 try{await assert.rejects(captureV3({out:dir,collect:fakeCollect(1)}),/MUST_BE_EMPTY/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a non-available canonical state fails closed without writing parts',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3cap-'));
 try{await assert.rejects(captureV3({out:path.join(dir,'p'),collect:async()=>({canonicalData:{state:'BLOCKED'}})}),/NOT_AVAILABLE/);assert.deepEqual(fs.readdirSync(path.join(dir,'p')),[]);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
