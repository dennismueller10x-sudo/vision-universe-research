import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import {parsePostCalibrationArguments,verifyCalibrationCompletion,POST_CALIBRATION_METHOD_IDS,sealWorkerOutputs} from '../research/calibration/run-post-calibration-v3.mjs';
import {openFileStream} from '../research/calibration/seal-stream-v3.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=['--freeze','f','--input-dir','/workspace/private/i','--out','/workspace/private/o','--reference-parsed','/workspace/private/r.json','--public-out','p.json','--calibration-completion','c.json','--completion-sha','a'.repeat(64),'--worker-method'];
test('arguments: one frozen method per process, every path explicit, hash-bound completion',()=>{
 assert.equal(parsePostCalibrationArguments([...base,POST_CALIBRATION_METHOD_IDS[0]]).workerMethod,POST_CALIBRATION_METHOD_IDS[0]);
 assert.throws(()=>parsePostCalibrationArguments([...base,'not_a_frozen_method']),/ORIGINAL_HISTORICAL_METHOD_WORKER_REQUIRED/);
 assert.throws(()=>parsePostCalibrationArguments(base.slice(0,-1)),/ARGUMENT_VALUE_REQUIRED|WORKER_REQUIRED/);
 assert.throws(()=>parsePostCalibrationArguments([...base,POST_CALIBRATION_METHOD_IDS[0],'--out','x']),/DUPLICATE/);
 assert.equal(POST_CALIBRATION_METHOD_IDS.length,6);
});
test('completion gate: needs the exact bytes, the exact freeze and passed reviews',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pc3-')),reg=JSON.parse(fs.readFileSync(new URL('../research/calibration/BACKTEST-CALIBRATION-METHODS.json',import.meta.url))),proto=fs.readFileSync(new URL('../research/calibration/protocol.json',import.meta.url));
 try{
  const screens=reg.referenceScreens.map(s=>s.status==='BLOCKED_DATA'?{id:s.id,status:'BLOCKED_DATA',verdict:null}:{id:s.id,status:'COMPLETED',verdict:s.kind==='CONTROL'?'PASS':'PARTIAL'});
  const done=screens.filter(s=>s.status==='COMPLETED'),good={schema:'supertrader-calibration-v3-completion-1.0.0',status:'CALIBRATION_COMPLETE_NUMERIC_REVIEW_PASSED',freezeId:'V3-1111111111111111',freezeFileSha256:'b'.repeat(64),protocolSha256:sha(proto),overallVerdict:'PARTIALLY_CERTIFIED',referenceScreens:screens,numericReviews:done.flatMap(s=>['SOURCE_GROSS','SAME_TOURNAMENT_NET'].map(m=>({methodId:s.id,costMode:m,status:'PASS',reviewSha256:'c'.repeat(64)})))};
  const f=path.join(dir,'c.json'),bytes=Buffer.from(JSON.stringify(good));fs.writeFileSync(f,bytes);
  const ok=await verifyCalibrationCompletion({file:f,expectedSHA:sha(bytes),freezeSHA256:'b'.repeat(64),freezeId:'V3-1111111111111111'});assert.equal(ok.numericReviews,8);
  await assert.rejects(verifyCalibrationCompletion({file:f,expectedSHA:'0'.repeat(64),freezeSHA256:'b'.repeat(64)}),/CHANGED/);
  await assert.rejects(verifyCalibrationCompletion({file:f,expectedSHA:sha(bytes),freezeSHA256:'e'.repeat(64)}),/COMPLETION_REQUIRED/);
  const bad={...good,numericReviews:good.numericReviews.map((r,i)=>i?r:{...r,status:'FAIL'})},bf=path.join(dir,'b.json'),bb=Buffer.from(JSON.stringify(bad));fs.writeFileSync(bf,bb);
  await assert.rejects(verifyCalibrationCompletion({file:bf,expectedSHA:sha(bb),freezeSHA256:'b'.repeat(64)}),/PASSED_NUMERIC_REVIEW/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('worker outputs are sealed for owner and session, plaintext removed, manifest has hashes only',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pc3s-')),mk=()=>crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),o=mk(),s=mk();
 try{
  fs.writeFileSync(path.join(dir,'baseline-raw.private.json'),JSON.stringify({secret:'x'.repeat(5000)}));
  const m=await sealWorkerOutputs(dir,{owner:o.publicKey,session:s.publicKey});
  assert.deepEqual(fs.readdirSync(dir),['baseline-raw.private.json.sealed']);assert.equal(JSON.stringify(m).includes('secret'),false);assert.match(m[0].plaintextSha256,/^[a-f0-9]{64}$/);
  const r=await openFileStream({input:path.join(dir,'baseline-raw.private.json.sealed'),output:path.join(dir,'o.out'),audience:'owner',privateKeyPem:o.privateKey});assert.equal(r.plaintextSha256,m[0].plaintextSha256);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
