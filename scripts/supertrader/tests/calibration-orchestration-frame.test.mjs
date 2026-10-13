import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {referenceFrame,monthlyEffect,sourceLogRisk,verifyReferenceParsed} from '../research/calibration/run-calibration.mjs';

test('coverage-specific low-vol frame preserves all frozen source history and other tournament methods',()=>{
 const protocol={window:{warmupFrom:'2015-01-01',from:'2018-01-02',to:'2026-09-30'},execution:{slippageBpsPerSide:10}};
 const data={calendar:['2018-01-02','2018-02-01','2026-08-31','2026-09-30'],window:protocol.window,securities:[{bars:[{date:'2015-01-02'}]}]};
 const before=JSON.stringify({data,protocol});
 const contract={lowVolRfDiagnosticWindow:{from:'2018-02-01',to:'2026-08-31'}};
 const frame=referenceFrame(data,{kind:'LOW_VOL'},protocol,contract);
 assert.deepEqual(frame.data.calendar,['2018-02-01','2026-08-31']);
 assert.equal(frame.data.securities,data.securities);
 assert.equal(frame.protocol.execution,protocol.execution);
 assert.equal(JSON.stringify({data,protocol}),before);
 assert.deepEqual(referenceFrame(data,{kind:'JT'},protocol,contract),{data,protocol});
 assert.throws(()=>referenceFrame(data,{kind:'LOW_VOL'},protocol,{lowVolRfDiagnosticWindow:{from:'2018-03-01',to:'2026-08-31'}}),/PREREGISTERED/);
});
test('parsed source bytes, parser code, original snapshots and exact freeze are bound before stock measurement',()=>{
 const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 const freeze={referenceArithmetic:{codeSha256:'a'.repeat(64),sourcePlanSha256:'b'.repeat(64),inputReceipts:[{id:'RF',sha256:'c'.repeat(64)}]}},fb=Buffer.from(JSON.stringify(freeze));
 const parsed={freezeFileSha256:hash(fb),codeSha256:'a'.repeat(64),sourcePlanSha256:'b'.repeat(64),referenceInputSha256s:{RF:'c'.repeat(64)}};const bytes=Buffer.from(JSON.stringify(parsed));
 assert.equal(verifyReferenceParsed(parsed,bytes,hash(bytes),fb,freeze),true);
 assert.throws(()=>verifyReferenceParsed(parsed,Buffer.concat([bytes,Buffer.from(' ')]),hash(bytes),fb,freeze),/PHYSICAL/);
 assert.throws(()=>verifyReferenceParsed({...parsed,referenceInputSha256s:{RF:'d'.repeat(64)}},bytes,hash(bytes),fb,freeze),/EXACT_PARSED/);
 assert.throws(()=>verifyReferenceParsed({...parsed,codeSha256:'e'.repeat(64)},bytes,hash(bytes),fb,freeze),/PHYSICAL/);
});
test('low-vol risk comparison uses matching universe, exact RF dates and shared complete months',()=>{
 const make=(month,r)=>({month,legs:Object.fromEntries(['top','bottom','eligibleUniverse'].map((k,i)=>[k,{sourceOracle:{startDate:month+'-01',endDate:month+'-02',return:r+i*0.01}}]))});
 const run={eligibleUniverse:{},monthly:[make('2020-01',0.02),make('2020-02',0.01)]};
 const rf=[{date:'2020-01-02',returnDecimal:0.001},{date:'2020-02-02',returnDecimal:0.001}];
 const result=sourceLogRisk(run,rf,rf.map(r=>r.date));
 assert.equal(result.completeJointMonths,2);
 assert.ok(Math.abs(result.top.annualizedLogExcessMean-6*(Math.log1p(0.02)+Math.log1p(0.01)-2*Math.log1p(0.001)))<1e-12);
 assert.equal(result.cagr,null);
 const missing=sourceLogRisk(run,rf.slice(0,1),rf.map(r=>r.date));
 assert.equal(missing.completeJointMonths,1);
 assert.deepEqual(missing.unavailableMonths,['2020-02']);
 assert.equal(missing.top.sharpe,null);
 assert.equal(sourceLogRisk({monthly:[]},rf,[]),null);
});
test('spread diagnostics keep unavailable source months null and do not fabricate a factor CAGR',()=>{
 const run={bottom:{},monthly:[{rankSpread:{source:0.01,execution:0.02}},{rankSpread:{source:null,execution:-0.01}}]};
 const effect=monthlyEffect(run);
 assert.equal(effect.monthlySourceSpreadMean,0.01);
 assert.equal(effect.monthlyExecutionSpreadMean,0.005);
 assert.equal(effect.sourceSpreadUnavailableMonths,1);
 assert.equal(effect.factorEquityCagr,null);
 assert.equal(monthlyEffect({monthly:[]}).monthlySourceSpreadMean,null);
});
