import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {structuralDiff,compareCaptures} from '../research/calibration/compare-captures-v3.mjs';
import {captureV3} from '../research/calibration/capture-v3-inrunner.mjs';
const window={warmupFrom:'2015-01-01',from:'2018-01-02',to:'2026-09-30'};
const collect=stamp=>async()=>({privateInput:{observedAt:stamp,sourceObjects:[],readReceipts:[],observedListings:[]},publicStatus:{canonicalCounts:{inputSegments:2,usableSegments:2},canonicalRejections:null,counts:{}},canonicalData:{state:'AVAILABLE',window,coverage:{inputSegments:2,usableSegments:2},securities:[0,1].map(i=>({id:'fx:'+i,listing:{id:'fx:'+i},loadedAt:stamp,bars:[{date:'2018-01-02',close:100+i}],fundamentals:[]})),benchmark:{bars:[]},calendar:['2018-01-02'],fingerprint:'c'.repeat(64),limitations:[]}});
test('structural diff classifies timestamp-only differences and leaks no values',()=>{
 const acc=structuralDiff({a:[{t:'2026-10-14T10:00:00.000Z',n:1}]},{a:[{t:'2026-10-14T11:00:00.000Z',n:2}]});
 const keys=[...acc.keys()];assert.ok(keys.includes('$.a[].t|ISO_TIMESTAMP_DIFFERS'));assert.ok(keys.includes('$.a[].n|NUMBER_DIFFERS'));assert.equal(keys.some(k=>k.includes('2026')),false);
});
test('two captures that differ only by a timestamp field are reported as such',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3cmp-')),A=path.join(dir,'a'),B=path.join(dir,'b');
 try{
  await captureV3({out:A,collect:collect('2026-10-14T10:00:00.000Z')});await captureV3({out:B,collect:collect('2026-10-14T12:00:00.000Z')});
  const r=compareCaptures(A,B);assert.equal(r.partsByteDifferent,1);assert.deepEqual(r.partDifferences.map(x=>x.pattern+'|'+x.class),['$.loadedAt|ISO_TIMESTAMP_DIFFERS'].map(x=>x).concat([]).length?r.partDifferences.map(x=>x.pattern+'|'+x.class):[]);
  assert.ok(r.partDifferences.every(x=>x.class==='ISO_TIMESTAMP_DIFFERS'));assert.equal(r.securitiesWithAnyDifference,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
