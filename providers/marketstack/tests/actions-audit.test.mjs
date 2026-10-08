import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,constants} from 'node:crypto';
import {checkLease,assertNoReplay,sealEvidence,openEvidence,pushApprovalPayload,verifyPushApproval} from '../../../scripts/marketstack/actions-audit.mjs';
const manifest={version:1,pr:479,branch:'marketstack-connector-capability-audit',hardCap:3500,allocations:[{id:'initial',cap:1800},{id:'final',cap:1200}]};
test('all one-shot caps count cumulatively, independent of previous run completion',()=>{
 assert.equal(checkLease(manifest,'initial').cap,1800);
 assert.throws(()=>checkLease({...manifest,allocations:[...manifest.allocations,{id:'over',cap:501}]},'over'),/CUMULATIVE/);
 assert.throws(()=>checkLease({...manifest,allocations:[...manifest.allocations,{id:'initial',cap:1}]},'initial'),/ALLOCATION/);
 assert.throws(()=>checkLease(manifest,'unknown'),/NOT_AUTHORIZED/);
});
test('prior failed or successful dispatch blocks credit lease replay',()=>{
 const opts={runId:'12',workflowId:372065638,title:'Marketstack audit 479 initial'};
 const current={id:12,workflow_id:372065638,display_title:opts.title};assertNoReplay([current],opts);
 for(const conclusion of ['success','failure','cancelled'])assert.throws(()=>assertNoReplay([current,{...current,id:11,conclusion}],opts),/ALREADY_DISPATCHED/);
 assert.throws(()=>assertNoReplay([],opts),/NOT_OBSERVED/);
});
test('encrypted bundle authenticates recipient, source, budget-context and exact raw bytes',()=>{
 const k=generateKeyPairSync('rsa',{modulusLength:3072}),raw=Buffer.from(' original raw provider response\n');
 const e=sealEvidence(raw,k.publicKey,{sha:'fixed-reviewed-sha',lease:'initial'});assert(!JSON.stringify(e).includes(raw.toString()));assert.deepEqual(openEvidence(e,k.privateKey),raw);
 assert.throws(()=>openEvidence({...e,context:{...e.context,lease:'replay'}},k.privateKey));
});
test('signed final push binds reviewed parent, sole marker diff and frozen lease',()=>{
 const k=generateKeyPairSync('rsa',{modulusLength:2048}),sha='a'.repeat(40),lease='final-20261007';
 const signature=sign('sha256',Buffer.from(pushApprovalPayload(sha)),{key:k.privateKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64');
 const input={marker:{lease,reviewedSourceSha:sha,signature},publicKey:k.publicKey,before:sha,parents:[sha],changedPaths:['scripts/marketstack/final-live-trigger.json'],lease};
 assert.equal(verifyPushApproval(input),true);
 for(const bad of [{before:'b'.repeat(40)},{parents:[sha,'b'.repeat(40)]},{changedPaths:[...input.changedPaths,'providers/marketstack/audit-adapter.js']},{lease:'initial'},{marker:{...input.marker,signature:Buffer.from('invalid').toString('base64')}},{marker:{...input.marker,reviewedSourceSha:'b'.repeat(40)}}])assert.throws(()=>verifyPushApproval({...input,...bad}),/SIGNED_PUSH/);
});
