import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildCompletion} from '../research/calibration/build-completion-v3.mjs';
import {captureV3} from '../research/calibration/capture-v3-inrunner.mjs';
import {buildFreezeV3} from '../research/calibration/freeze-v3.mjs';
const here=new URL('../research/calibration/',import.meta.url);
const registry=JSON.parse(fs.readFileSync(new URL('BACKTEST-CALIBRATION-METHODS.json',here))),protocolBytes=fs.readFileSync(new URL('protocol.json',here));
const window={warmupFrom:'2015-01-01',from:'2018-01-02',to:'2026-09-30'};
async function freezeBytes(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3cmpl-')),collect=async()=>({privateInput:{observedAt:'2026-10-14T10:00:00.000Z',sourceObjects:[],readReceipts:[],observedListings:[]},publicStatus:{canonicalCounts:{inputSegments:1,usableSegments:1},canonicalRejections:null,counts:{}},canonicalData:{state:'AVAILABLE',window,coverage:{inputSegments:1,usableSegments:1},securities:[{id:'fx:0',listing:{id:'fx:0'},bars:[],fundamentals:[]}],benchmark:{bars:[]},calendar:['2018-01-02'],fingerprint:'c'.repeat(64),limitations:[]}});
 const r=await captureV3({out:path.join(dir,'in'),collect}),p=path.join(dir,'p.json');
 fs.writeFileSync(p,JSON.stringify({schema:'vision-universe-calibration-v3-parsed-reference-private-1.0.0',noPostResultToleranceChanges:true,sourcePlanSha256:'a'.repeat(64),parserSha256:'b'.repeat(64)}));
 const f=buildFreezeV3({captureReceipt:r,inputDir:path.join(dir,'in'),referenceParsedPath:p});fs.rmSync(dir,{recursive:true,force:true});return f;
}
const summary=(freezeId,methodId,{fail=false,partial=true}={})=>({methodId,freezeId,results:['SOURCE_GROSS','SAME_TOURNAMENT_NET'].map(costMode=>({costMode,status:partial?'PARTIAL':'READY',sourceSpreadDirection:'NEGATIVE',sourceSpreadValidMonths:45,reconciliation:{top:{pass:!fail,absoluteDifference:0}},numericReview:{status:fail?'FAIL':'PASS',reviewSha256:'d'.repeat(64)}}))});
const ids=['CAL_JT1993_6_6_REBALANCED_EW_NO_SKIP','CAL_GH2004_52WH_30_6_NO_SKIP','CAL_BLITZVANVLIET2007_US_LOWVOL_LOG_EXCESS','CALIB_EQUAL_WEIGHT'];
const ref=[{schema:'x',kind:'MOMENTUM_EW',sourceId:'FRENCH_MOM10',status:'COMPUTED',long:{months:100},short:{months:100},referenceCoverage:{}}];
test('pre-registered rules: EW control PASS, factor screens PARTIAL, fundamentals BLOCKED_DATA, overall PARTIALLY_CERTIFIED',async()=>{
 const f=await freezeBytes(),bytes=Buffer.from(JSON.stringify(f));
 const c=buildCompletion({freezeBytes:bytes,summaries:ids.map(i=>summary(f.freezeId,i)),parsedReference:{reports:[{sourceId:'FRENCH_MOM10',kind:'MOMENTUM_EW',status:'COMPUTED',long:{months:100},short:{months:100},referenceCoverage:{missingMonths:[],missingCells:[],completeDeciles:10,fullDecileRiskShapeComplete:true},contextualScreens:{spreadMeanDirection:'POSITIVE',longLowerVolatilityDirection:'NO',longHigherZeroRFSharpeDirection:'YES'}}]},registry,protocolBytes});
 const v=Object.fromEntries(c.referenceScreens.map(s=>[s.id,[s.status,s.verdict]]));
 assert.deepEqual(v.CALIB_EQUAL_WEIGHT,['COMPLETED','PASS']);assert.deepEqual(v.CAL_GH2004_52WH_30_6_NO_SKIP,['COMPLETED','PARTIAL']);assert.deepEqual(v.piotroski_value_fscore,['BLOCKED_DATA',null]);
 assert.equal(c.status,'CALIBRATION_COMPLETE_NUMERIC_REVIEW_PASSED');assert.equal(c.overallVerdict,'PARTIALLY_CERTIFIED');assert.equal(c.numericReviews.length,8);
});
test('a failed review or reconciliation makes the completion incomplete and NOT_CERTIFIED; wrong freeze is rejected',async()=>{
 const f=await freezeBytes(),bytes=Buffer.from(JSON.stringify(f));
 const bad=buildCompletion({freezeBytes:bytes,summaries:[...ids.slice(0,3).map(i=>summary(f.freezeId,i)),summary(f.freezeId,'CALIB_EQUAL_WEIGHT',{fail:true})],parsedReference:null,registry,protocolBytes});
 assert.equal(bad.status,'CALIBRATION_INCOMPLETE');assert.equal(bad.overallVerdict,'NOT_CERTIFIED');
 assert.throws(()=>buildCompletion({freezeBytes:bytes,summaries:ids.map(i=>summary('V3-0000000000000000',i)),registry,protocolBytes}),/SUMMARY_FREEZE_MISMATCH/);
});
