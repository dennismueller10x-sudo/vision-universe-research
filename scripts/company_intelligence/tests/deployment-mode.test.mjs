import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentMode} from '../deployment-mode.mjs';
import {approval} from '../production-approval.mjs';
const available={schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId};
test('an already published off artifact stays off when a concurrent activation enables R2',()=>{
 assert.equal(deploymentMode({packagedEnabled:false,gate:available}),'OFF');
 assert.throws(()=>deploymentMode({packagedEnabled:false,gate:available,fullAcceptance:true}),/REQUIRES_ACTIVE_ARTIFACT/);
});
test('normal automation dispatch has bounded smoke; only explicit acceptance runs the full cohort',()=>{
 assert.equal(deploymentMode({packagedEnabled:true,gate:available}),'ROUTINE');
 assert.equal(deploymentMode({packagedEnabled:true,gate:available,fullAcceptance:true}),'FULL');
});
test('a late disable or missing/mismatched gate cannot approve an enabled artifact',()=>{
 for(const gate of [null,{...available,state:'DISABLED'},{...available,generation:'0'.repeat(24)},{...available,approvalId:'unknown'},{...available,schema:2}])assert.throws(()=>deploymentMode({packagedEnabled:true,gate}),/GATE_CHANGED/);
 assert.throws(()=>deploymentMode({packagedEnabled:true,gate:available,emergencyOff:true}),/DID_NOT_CLOSE/);
 assert.equal(deploymentMode({packagedEnabled:false,emergencyOff:true,fullAcceptance:true}),'OFF');
});
