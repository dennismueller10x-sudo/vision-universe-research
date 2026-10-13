import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyLiveTrigger,REPOSITORY,BRANCH,MARKER,WORKFLOW} from '../../../scripts/marketstack/europe-live-actions-guard.mjs';
function fixture(){const planBytes=Buffer.from('{"metadataOnly":true}'),sourceCommit='a'.repeat(40);return{planBytes,marker:{version:1,nonce:'europe-live-449-20261013-01',maximumCredits:16000,targetCredits:13000,planSha256:createHash('sha256').update(planBytes).digest('hex'),sourceCommit},head:'b'.repeat(40),parents:[sourceCommit],changedPaths:[MARKER],repository:REPOSITORY,ref:'refs/heads/'+BRANCH,event:'push',attempt:'1',runId:'123',existingRuns:[{id:123,path:WORKFLOW}]};}
test('one-use Actions guard binds source parent and exact plan bytes without requests',()=>{assert.equal(verifyLiveTrigger(fixture()).hardCap,16000);});
test('rerun, fork, wrongbranch or unsupported event never admit secret-bearing work',()=>{for(const patch of [{attempt:'2'},{repository:'other/repo'},{ref:'refs/heads/main'},{event:'pull_request'}])assert.throws(()=>verifyLiveTrigger({...fixture(),...patch}),/EXECUTION_SCOPE/);});
test('previous execution on task branch cannot reset global credit budget',()=>{const f=fixture();f.existingRuns.push({id:122,path:WORKFLOW});assert.throws(()=>verifyLiveTrigger(f),/PRIOR_EXECUTION/);});
test('changing code beside marker or a different plan or cap fails source review binding',()=>{const f=fixture();assert.throws(()=>verifyLiveTrigger({...f,changedPaths:[MARKER,'scripts/changed.mjs']}),/SOURCE_MISMATCH/);assert.throws(()=>verifyLiveTrigger({...f,planBytes:Buffer.from('{}')}),/PLAN_LEASE/);assert.throws(()=>verifyLiveTrigger({...f,marker:{...f.marker,maximumCredits:16001}}),/PLAN_LEASE/);});
