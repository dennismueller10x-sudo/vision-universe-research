import test from 'node:test';import assert from 'node:assert/strict';
import {validatePreviewTarget} from '../../scripts/market/tiingo2-apply-reviewed-preview.mjs';
test('canonical draft publication rejects production branches, fork PRs and stale checkout',()=>{
 const valid={eventName:'pull_request',headRef:'codex/tiingo2-productization',headRepo:'owner/repo',repository:'owner/repo',expectedHead:'a'.repeat(40),currentHead:'a'.repeat(40)};
 assert.equal(validatePreviewTarget(valid),true);
 for(const change of [{eventName:'workflow_run'},{eventName:'workflow_dispatch'},{headRef:'main'},{headRef:'codex/other'},{headRepo:'fork/repo'},{currentHead:'b'.repeat(40)},{expectedHead:null}])assert.throws(()=>validatePreviewTarget({...valid,...change}),/INTERNAL_REVIEW_BRANCH_REQUIRED/);
});
