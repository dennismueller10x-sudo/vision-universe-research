import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
 verifyCalibrationFreeze,verifyCalibrationCompletion,parsePostCalibrationArguments,POST_CALIBRATION_METHOD_IDS,
 executionOpenSourceCensus,writeDurablePrivateArtifact,hashPrivateArtifact,measurePostCalibrationMethod,
} from '../research/calibration/run-post-calibration.mjs';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../../..');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const baselinePath='scripts/supertrader/research/certification/SUPERTRADER-METHOD-FREEZES-V2.json';
const protocol=JSON.parse(fs.readFileSync(path.join(root,'scripts/supertrader/research/tournament/protocol.json')));
const guardedFiles=[
 'scripts/supertrader/research/calibration/run-post-calibration.mjs',
 'scripts/supertrader/research/calibration/runner-certified.mjs',
 'scripts/supertrader/tests/calibration-entry-open-guard.test.mjs',
 'scripts/supertrader/tests/calibration-post-calibration-orchestration.test.mjs',
 'scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-METHODS.json',
 'scripts/supertrader/research/calibration/protocol.json',
];
function freezeFixture(){
 const bytes=fs.readFileSync(path.join(root,baselinePath)),old=JSON.parse(bytes);
 return {registeredBeforePerformance:true,frozenBeforePerformance:true,strategyDefinitionsChanged:false,
  baselineFreeze:{path:baselinePath,sha256:sha(bytes)},protocolHash:old.protocolHash,
  files:Object.fromEntries(guardedFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))])),inputReceipts:structuredClone(old.inputReceipts)};
}
const args=['--freeze','scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-FREEZE.json','--input-dir','/workspace/private/synthetic-input','--out','/workspace/private/synthetic-out','--calibration-completion','/workspace/private/synthetic-completion.json','--completion-sha','a'.repeat(64)];

function completionFixture(dir){
 const freezeSHA256='f'.repeat(64),manifest=path.join(dir,'synthetic-calibration-manifest.private.json'),review=path.join(dir,'synthetic-calibration-review.private.json'),file=path.join(dir,'synthetic-completion.private.json');
 fs.writeFileSync(manifest,JSON.stringify({calibrationFreezeSha256:freezeSHA256,entries:[]}),{mode:0o600});
 const ids=JSON.parse(fs.readFileSync(path.join(root,'scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-METHODS.json'))).referenceScreens.map(s=>s.id);
 const screens=ids.map((id,i)=>({id,status:i===0?'COMPLETED':'BLOCKED_DATA',verdict:i===0?'FAIL':null}));
 fs.writeFileSync(review,JSON.stringify({status:'PASS_WITH_LIMITS',finalized:true,calibrationFreezeSha256:freezeSHA256,fullEightReferenceScreensReviewed:true,referenceScreens:screens,constructionManifestSha256:sha(fs.readFileSync(manifest))}),{mode:0o600});
 const receipt={schema:'supertrader-calibration-completion-private-1.0.0',status:'CALIBRATION_COMPLETE_REVIEWED',premeasurementFreezeSha256:freezeSHA256,protocolSha256:sha(fs.readFileSync(path.join(root,'scripts/supertrader/research/calibration/protocol.json'))),overallVerdict:'NOT_CERTIFIED',referenceScreens:screens,constructionManifest:{path:manifest,sha256:sha(fs.readFileSync(manifest))},independentNumericReview:{path:review,sha256:sha(fs.readFileSync(review)),status:'PASSED'}};
 fs.writeFileSync(file,JSON.stringify(receipt),{mode:0o600});return {file,expectedSHA:sha(fs.readFileSync(file)),freezeSHA256};
}

test('CLI requires all explicit paths, fixes all-six scope, disallows concurrency/subsets and caps worker heap',()=>{
 const options=parsePostCalibrationArguments(args);assert.equal(options.heapMiB,12000);assert.equal(options.workerMethod,null);assert.equal(POST_CALIBRATION_METHOD_IDS.length,6);
 for(const bad of [args.slice(0,4),[...args,'--jobs','2'],[...args,'--only',POST_CALIBRATION_METHOD_IDS[0]],[...args,'--heap-mb','12001'],[...args,'--heap-mb','NaN'],[...args,'--heap-mb','4095'],[...args,'--out','/workspace/private/duplicate']])assert.throws(()=>parsePostCalibrationArguments(bad));
 assert.throws(()=>parsePostCalibrationArguments(args.slice(0,6)),/CALIBRATION_COMPLETION/);
 assert.equal(parsePostCalibrationArguments([...args,'--heap-mb','8192']).heapMiB,8192);
});

test('numeric-review bytes must finalize same-freeze verification of the exact all-eight completion projection',async()=>{
 const dir=fs.mkdtempSync('/workspace/private/calibration-review-scope-test-');
 try{
  const options=completionFixture(dir),completion=JSON.parse(fs.readFileSync(options.file)),reviewFile=completion.independentNumericReview.path,originalReview=JSON.parse(fs.readFileSync(reviewFile));
  for(const change of [r=>delete r.finalized,r=>r.calibrationFreezeSha256='e'.repeat(64),r=>r.fullEightReferenceScreensReviewed=false,r=>r.referenceScreens.pop(),r=>r.referenceScreens[0].verdict='PASS']){
   const r=structuredClone(originalReview);change(r);fs.writeFileSync(reviewFile,JSON.stringify(r));completion.independentNumericReview.sha256=sha(fs.readFileSync(reviewFile));fs.writeFileSync(options.file,JSON.stringify(completion));
   await assert.rejects(verifyCalibrationCompletion({...options,expectedSHA:sha(fs.readFileSync(options.file))}),/FINALIZED_SAME_FREEZE_FULL_EIGHT/);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('absent completed calibration rejects method API before the receipt callback or any variant',async()=>{
 const data=dataFixture();let ready=0,variants=0;
 await assert.rejects(measurePostCalibrationMethod({data,methodId:POST_CALIBRATION_METHOD_IDS[0],freeze:freezeFixture(),beforePerformance:()=>{ready++;},artifactSink:()=>{},beforeVariant:()=>{variants++;}}),/COMPLETION_AND_FREEZE_HASHES/);
 assert.equal(ready,0);assert.equal(variants,0);assert.equal(data.securities[0].sourceFeatures,undefined);
});

test('internal workers require known original method plus predeclared exact freeze-file hash',()=>{
 assert.throws(()=>parsePostCalibrationArguments([...args,'--worker-method',POST_CALIBRATION_METHOD_IDS[0]]),/HASH_BOUND/);
 assert.throws(()=>parsePostCalibrationArguments([...args,'--worker-method','NEW_STRATEGY','--expected-freeze-sha','a'.repeat(64)]),/HASH_BOUND/);
 assert.throws(()=>parsePostCalibrationArguments([...args,'--expected-freeze-sha','a'.repeat(64)]),/INTERNAL_WORKER/);
 const parsed=parsePostCalibrationArguments([...args,'--worker-method',POST_CALIBRATION_METHOD_IDS[0],'--expected-freeze-sha','a'.repeat(64)]);assert.equal(parsed.expectedFreezeSHA,'a'.repeat(64));
});

test('freeze validates original #632 rules/protocol and all overlay/test byte bindings',()=>{
 assert.equal(verifyCalibrationFreeze(freezeFixture()),true);
 for(const field of ['registeredBeforePerformance','frozenBeforePerformance']){const f=freezeFixture();f[field]=false;assert.throws(()=>verifyCalibrationFreeze(f),/PREPERFORMANCE/);}
 const strategy=freezeFixture();strategy.strategyDefinitionsChanged=true;assert.throws(()=>verifyCalibrationFreeze(strategy),/UNCHANGED_STRATEGY/);
 const baseline=freezeFixture();baseline.baselineFreeze.sha256='a'.repeat(64);assert.throws(()=>verifyCalibrationFreeze(baseline),/632_FREEZE/);
 const changedProtocol=freezeFixture();changedProtocol.protocolHash='a'.repeat(64);assert.throws(()=>verifyCalibrationFreeze(changedProtocol),/632_PROTOCOL/);
 const code=freezeFixture();code.files[guardedFiles[1]]='a'.repeat(64);assert.throws(()=>verifyCalibrationFreeze(code),/FROZEN_FILE_CHANGED/);
 const missingTest=freezeFixture();delete missingTest.files[guardedFiles[3]];assert.throws(()=>verifyCalibrationFreeze(missingTest),/CODE_AND_TEST/);
 const escape=freezeFixture();escape.files['../source']=sha('x');assert.throws(()=>verifyCalibrationFreeze(escape),/REPO_RELATIVE/);
});

test('new freeze cannot silently swap or duplicate original canonical source receipts',()=>{
 const f=freezeFixture();const r=f.inputReceipts.find(x=>x.role==='CANONICAL_MANIFEST_PLAINTEXT');r.sha256='b'.repeat(64);assert.throws(()=>verifyCalibrationFreeze(f),/EXACT_632_CANONICAL/);
 const duplicate=freezeFixture();duplicate.inputReceipts.push(structuredClone(duplicate.inputReceipts.find(x=>x.role==='CANONICAL_SOURCE_PROVENANCE_INPUTS')));assert.throws(()=>verifyCalibrationFreeze(duplicate),/EXACT_632_CANONICAL/);
});

test('all-eight independently reviewed completion is required without demanding positive calibration results',async()=>{
 const dir=fs.mkdtempSync('/workspace/private/calibration-completion-gate-test-');
 try{
  const options=completionFixture(dir),accepted=await verifyCalibrationCompletion(options);assert.equal(accepted.overallVerdict,'NOT_CERTIFIED');assert.equal(accepted.screens,8);
  const original=JSON.parse(fs.readFileSync(options.file));
  async function rejected(edit){const copy=structuredClone(original);edit(copy);fs.writeFileSync(options.file,JSON.stringify(copy));await assert.rejects(verifyCalibrationCompletion({...options,expectedSHA:sha(fs.readFileSync(options.file))}));}
  await rejected(c=>c.referenceScreens.pop());
  await rejected(c=>c.referenceScreens[7]=structuredClone(c.referenceScreens[0]));
  await rejected(c=>c.referenceScreens[1].verdict='PASS');
  await rejected(c=>c.independentNumericReview.status='PENDING');
  await rejected(c=>c.premeasurementFreezeSha256='e'.repeat(64));
  fs.writeFileSync(options.file,JSON.stringify(original));
  const review=original.independentNumericReview.path;fs.writeFileSync(review,JSON.stringify({status:'PASSED',constructionManifestSha256:'0'.repeat(64)}));
  original.independentNumericReview.sha256=sha(fs.readFileSync(review));fs.writeFileSync(options.file,JSON.stringify(original));
  await assert.rejects(verifyCalibrationCompletion({...options,expectedSHA:sha(fs.readFileSync(options.file))}),/INDEPENDENT_ACTUAL_CALIBRATION/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('bounded private artifact writer fsyncs complete raw JSON, returns hash and rejects overwrite/public path',async()=>{
 const dir=fs.mkdtempSync('/workspace/private/calibration-orchestration-test-');
 try{
  const file=path.join(dir,'raw.private.json'),payload={curve:Array.from({length:2000},(_,i)=>({syntheticIndex:i})),signals:[{id:'SYNTHETIC_SECURITY',forward:{21:{censored:true,reason:'INVALID_EXECUTION_OPEN'}}}]};
  const receipt=await writeDurablePrivateArtifact(file,payload);assert.equal(receipt.durable,true);assert.equal(receipt.sha256,await hashPrivateArtifact(file));assert.deepEqual(JSON.parse(fs.readFileSync(file)),payload);assert.equal(fs.statSync(file).mode&0o777,0o600);
  await assert.rejects(writeDurablePrivateArtifact(file,payload),/ALREADY_EXISTS/);
  await assert.rejects(writeDurablePrivateArtifact(path.join(root,'public-test.json'),payload),/PRIVATE_PATH/);
  fs.appendFileSync(file,' ');assert.notEqual(await hashPrivateArtifact(file),receipt.sha256);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

function dataFixture(){
 const calendar=[protocol.window.from,'2018-02-01','2026-09-29',protocol.window.to];
 const bars=calendar.map((date,i)=>({date,open:20+i,high:22+i,low:19+i,close:21+i,rawClose:21+i,rawVolume:1000000,volume:1000000,splitAdjustmentFactor:1,dividend:0,totalReturnIndex:21+i}));
 return {state:'AVAILABLE',fingerprint:'a'.repeat(64),window:protocol.window,calendar,coverage:{benchmarkAvailable:true},limitations:['SYNTHETIC_ONLY'],securities:[{id:'SYNTHETIC_STOCK',ticker:'SYNTHETIC_STOCK',bars:structuredClone(bars),fundamentals:[],listing:{startDate:calendar[0]},terminal:null}],benchmark:{bars},spyBars:bars};
}

test('preperformance census counts only candidate execution-source rows and never infers previous affected signals',()=>{
 const data=dataFixture();data.securities[0].bars[0].open=0;data.securities[0].bars[1].open=0;data.securities[0].bars[2].open=NaN;data.benchmark.bars[1].open=-1;data.benchmark.bars.splice(2,1);
 const census=executionOpenSourceCensus(data);assert.equal(census.invalidStockRows,2);assert.equal(census.affectedSecurities,1);assert.equal(census.invalidBenchmarkRows,1);assert.equal(census.missingBenchmarkRows,1);assert.equal(census.priorAffectedSignalCount,null);assert.equal(census.performanceCalculated,false);assert.match(census.scope,/NOT_SIGNAL_INCIDENCE/);
});

test('failed/missing durable preflight prevents source feature generation and every performance variant',async()=>{
 const dir=fs.mkdtempSync('/workspace/private/calibration-durable-gate-test-');
 try{
 const calibrationCompletion=completionFixture(dir);
 for(const beforePerformance of [async()=>({durable:false,sha256:'a'.repeat(64)}),async()=>{throw Error('SYNTHETIC_RECEIPT_DISK_FAILURE');}]){
  const data=dataFixture();let variants=0,artifacts=0;
  await assert.rejects(measurePostCalibrationMethod({data,methodId:POST_CALIBRATION_METHOD_IDS[0],freeze:freezeFixture(),calibrationCompletion,beforePerformance,beforeVariant:()=>{variants++;},artifactSink:async()=>{artifacts++;}}));
  assert.equal(variants,0);assert.equal(artifacts,0);assert.equal(data.securities[0].sourceFeatures,undefined);
 }
 await assert.rejects(measurePostCalibrationMethod({data:dataFixture(),methodId:POST_CALIBRATION_METHOD_IDS[0],freeze:freezeFixture(),artifactSink:()=>{}}),/DURABLE_PREFLIGHT/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('one synthetic method performs baseline/double-cost/two terminal actual runs only after durable receipt and retains raw structures',async()=>{
 const dir=fs.mkdtempSync('/workspace/private/calibration-orchestration-method-test-');const events=[],payloads=[];
 try{
  const row=await measurePostCalibrationMethod({data:dataFixture(),methodId:POST_CALIBRATION_METHOD_IDS[0],freeze:freezeFixture(),calibrationCompletion:completionFixture(dir),
   beforePerformance:async ready=>{events.push('READY');assert.equal(ready.oldScore,null);assert.equal(ready.executionOpenSourceCensus.performanceCalculated,false);return writeDurablePrivateArtifact(path.join(dir,'ready.json'),ready);},
   beforeVariant:name=>{assert.equal(events[0],'READY');events.push(name);},
   artifactSink:async(name,payload)=>{payloads.push(payload);return writeDurablePrivateArtifact(path.join(dir,name),payload);},
  });
  assert.deepEqual(events,['READY','BASELINE','DOUBLE_COST','TERMINAL_1','TERMINAL_2']);assert.equal(row.artifacts.length,4);
  for(const raw of payloads.filter(x=>x.fullRaw)){assert.ok(Array.isArray(raw.run.curve));assert.ok(Array.isArray(raw.run.trades));assert.ok(Array.isArray(raw.run.signals));assert.equal(raw.run.reconciliation.pass,true);assert.equal(raw.run.curve.length,4);}
  const doubled=payloads.find(x=>x.variant==='DOUBLE_COST');assert.equal(doubled.run.costMultiplier,2);assert.equal(doubled.forwardSignalOutcomes.basis,'SAME_BASELINE_SOURCE_SETUP_CENSUS_NOT_VARIANT_PORTFOLIO_CONDITIONED');assert.equal(doubled.reusedOld632Artifact,false);
  for(const raw of payloads.filter(x=>x.variant?.startsWith('TERMINAL_'))){assert.equal(raw.run.costMultiplier,1);assert.equal(raw.forwardSignalOutcomes.forwardReturnsRecomputed,true);assert.equal(raw.reusedOld632Artifact,false);}
  assert.equal(row.oldScore,null);assert.equal(row.ranking.score,null);assert.equal(row.qualification.tierCeiling,'C');assert.equal(row.dataQuality.status,'OBSERVED_ONLY');assert.match(row.originalControlStatus,/NOT_RERUN/);assert.equal(row.finalReviewPending,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
