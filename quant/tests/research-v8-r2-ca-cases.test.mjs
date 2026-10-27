import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {analyzeCase,recover,TICKERS} from '../../scripts/quant/recover-v8-r2-ca-cases.mjs';
function fixture(){
 const bars=[{date:'2026-10-22',close:.1795,splitFactor:1},{date:'2026-10-23',close:.0715,splitFactor:1},{date:'2026-10-26',close:.8,splitFactor:.1}];
 const raw={ticker:'AZTR',securityId:'ref_AZTR',provider:'tiingo',bars};
 const weekly={ticker:'AZTR',securityId:'ref_AZTR',currency:'USD',priceSeriesType:'SPLIT_ADJUSTED',asOf:'2026-10-23',points:[['2026-10-22',.1795],['2026-10-23',.0715]]};
 const daily={...weekly,asOf:'2026-10-26',points:[['2026-10-22',1.8],['2026-10-23',.715],['2026-10-26',.8]]};return {raw,weekly,daily};
}
test('V8 registered R2 cases reconstruct only source-proven split vintages, independently with binary64 and Decimal diagnostics',()=>{
 const x=fixture(),before=JSON.stringify(x),r=analyzeCase(x.raw,x.weekly,x.daily);
 assert.equal(r.summary.state,'SOURCE_PROVEN_ADJUSTMENT_VINTAGE_RECONCILED');assert.equal(r.summary.actionEvidence.events,1);assert.equal(r.summary.addedCalendarPoints,0);
 assert.deepEqual(r.revised.points,[['2026-10-22',1.8],['2026-10-23',.715]]);assert.equal(r.revised.asOf,'2026-10-26');assert.equal(JSON.stringify(x),before);
 assert.ok(!JSON.stringify(r.summary).includes('splitFactor'));
 const out=mkdtempSync(join(tmpdir(),'v8-r2-ca-parity-'));try{const file=join(out,'input.json');writeFileSync(file,JSON.stringify({...x,revised:r.revised,newPrices:r.newPrices,oldPrices:r.oldPrices}));const p=spawnSync('python3',[resolve('scripts/quant/verify-v8-r2-ca-cases.py'),file],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).state,'PASS');}finally{rmSync(out,{recursive:true,force:true});}
});
test('V8 R2 case diagnosis rejects unproven ratios, missing action fields and old-price revisions without rounding slack',()=>{
 const x=fixture();x.raw.bars[2].splitFactor=1;assert.throws(()=>analyzeCase(x.raw,x.weekly,x.daily),/NO_NEW_SOURCE_SPLIT_EVENT/);
 x.raw.bars[2].splitFactor=.1;x.raw.bars[0].splitFactor=null;assert.throws(()=>analyzeCase(x.raw,x.weekly,x.daily),/EVIDENCE_INCOMPLETE/);
 const y=fixture();y.weekly.points[1][1]=.071500001;const r=analyzeCase(y.raw,y.weekly,y.daily);assert.equal(r.summary.state,'UNRESOLVED_SOURCE_PARITY');assert.equal(r.summary.oldBasisMismatches,1);assert.equal(r.revised,undefined);
});
test('V8 R2 case population is frozen fourteen DQ cases and absent runtime credentials spend no requests',async()=>{
 assert.equal(TICKERS.length,14);assert.equal(new Set(TICKERS).size,14);let n=0;const r=await recover({env:{},fetchImpl:()=>{n++;throw Error('NO_NETWORK');}});assert.equal(r.state,'NOT_CONFIGURED_IN_THIS_RUNTIME');assert.equal(n,0);assert.equal(r.networkRequests,0);assert.equal(r.canonicalDataModified,false);
});
test('V8 R2 registered-case reads skip oversize bodies and stop on explicit denied access without exposing source errors',async()=>{
 const env={VU_HISTORY_S3_ENDPOINT:'https://fixture.invalid',VU_HISTORY_S3_BUCKET:'fixture-bucket',VU_HISTORY_S3_ACCESS_KEY_ID:'fixture-key',VU_HISTORY_S3_SECRET_ACCESS_KEY:'fixture-secret'};
 let n=0;const large=await recover({env,fetchImpl:async(url,options)=>{n++;assert.equal(options.method,'HEAD');return new Response(null,{status:200,headers:{'content-length':String(5*1024*1024)}});}});
 assert.equal(n,14);assert.equal(large.summary.assessed,14);assert.ok(large.cases.every(x=>x.state==='RAW_OBJECT_ABOVE_BUDGET'));assert.equal(large.budgetSpent.classA,0);assert.equal(large.budgetSpent.classB,14);
 n=0;const denied=await recover({env,fetchImpl:async()=>{n++;return new Response('private-provider-error-body',{status:403});}});
 assert.equal(n,1);assert.equal(denied.summary.assessed,1);assert.equal(denied.cases[0].reason,'HTTP_403');const serialized=JSON.stringify(denied);assert.ok(!serialized.includes('private-provider-error-body'));assert.ok(!serialized.includes('fixture-secret'));assert.ok(!serialized.includes('fixture-key'));assert.equal(denied.summary.registered,14);
});

function checkParity(x,r){
 const out=mkdtempSync(join(tmpdir(),'v8-r2-ca-rounding-'));
 try{const file=join(out,'input.json');writeFileSync(file,JSON.stringify({...x,revised:r.revised,newPrices:r.newPrices,oldPrices:r.oldPrices}));const p=spawnSync('python3',[resolve('scripts/quant/verify-v8-r2-ca-cases.py'),file],{encoding:'utf8'});assert.ok(p.stdout,p.stderr);return {status:p.status,result:JSON.parse(p.stdout)};}finally{rmSync(out,{recursive:true,force:true});}
}
test('V8 independent parity implements publisher binary64 half boundaries and exposes exact Decimal disagreements',()=>{
 const x=fixture();
 x.raw.bars=[{date:'2026-10-20',close:1.005,splitFactor:1},{date:'2026-10-22',close:.10035,splitFactor:1},{date:'2026-10-23',close:.10045,splitFactor:1},{date:'2026-10-26',close:1.1,splitFactor:.1}];
 x.weekly.points=[['2026-10-20',1],['2026-10-22',.1003],['2026-10-23',.1004]];
 x.daily.points=[['2026-10-20',10.05],['2026-10-22',1],['2026-10-23',1],['2026-10-26',1.1]];
 const r=analyzeCase(x.raw,x.weekly,x.daily);assert.equal(r.summary.state,'SOURCE_PROVEN_ADJUSTMENT_VINTAGE_RECONCILED');
 const {status,result}=checkParity(x,r);assert.equal(status,0);assert.equal(result.state,'PASS');assert.ok(Object.values(result.mismatchCounts).every(n=>n===0));
 // Decimal HALF_UP instead produces 1.01, .1004 and .1005. Those differences
 // are evidence about numerical semantics, not permission to accept drift.
 assert.equal(result.decimalDiagnostics.publishedDifferences.oldWeekly.differentPublishedPoints,3);
 assert.ok(result.decimalDiagnostics.publishedDifferences.oldWeekly.maxAbsolutePublishedDifference>.009);
 const publishedDrift=structuredClone(r);publishedDrift.revised.points[0][1]+=1e-13;
 const rejected=checkParity(x,publishedDrift);assert.equal(rejected.status,1);assert.equal(rejected.result.state,'FAIL');assert.equal(rejected.result.mismatchCounts.reconstructedWeekly,1);
 const arithmeticDrift=structuredClone(r);arithmeticDrift.newPrices[0]+=1e-13;
 const rejectedArithmetic=checkParity(x,arithmeticDrift);assert.equal(rejectedArithmetic.status,1);assert.equal(rejectedArithmetic.result.mismatchCounts.newPrices,1);
});
