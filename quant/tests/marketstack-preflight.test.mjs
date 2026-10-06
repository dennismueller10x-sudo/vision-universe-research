import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preflight } from '../../scripts/market/marketstack-preflight.mjs';
test('credential absence is explicit and performs no provider query',async()=>{
 const r=await preflight({apiKey:''});assert.equal(r.credentialConfigured,false);assert.equal(r.importReady,false);assert.equal(r.providerRequests,0);assert.equal(r.authenticatedAccount,'NOT_TESTED');
});
test('preflight proves private encryption while withholding paid work without an account bound',async()=>{
 const r=await preflight({apiKey:'TESTKEY-MARKETSTACK-PREFLIGHT',evidenceFile:'/definitely-absent-budget-evidence'});assert.equal(r.privateStorage,'AUTHENTICATED_CIPHERTEXT_VALIDATED');assert.equal(r.importReady,false);assert.equal(r.reason,'ACCOUNT_BUDGET_UNVERIFIED');assert.ok(!JSON.stringify(r).includes('TESTKEY-MARKETSTACK-PREFLIGHT'));
});
test('verified bound is a private precondition, not public display or authentication approval',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vu-ms-preflight-test-'));try{
 const evidenceFile=join(root,'evidence.json'),now=Date.parse('2026-10-06T12:00:00Z');writeFileSync(evidenceFile,JSON.stringify({kind:'VERIFIED_ACCOUNT_REMAINDER',id:'fixture',source:'private account fixture',month:'2026-10',observedAt:'2026-10-06T11:00:00Z',remainingCredits:12345}));
 const r=await preflight({apiKey:'TESTKEY-MARKETSTACK-PREFLIGHT',evidenceFile,now});assert.equal(r.importReady,true);assert.equal(r.publicDisplay,'RIGHTS_UNCONFIRMED');assert.equal(r.authenticatedAccount,'NOT_TESTED');assert.equal(r.schedule,'DISABLED');assert.ok(!JSON.stringify(r).includes('12345'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('preflight defaults to zero calls; import is explicit and only ciphertext persists even on failure',()=>{
 const source=readFileSync(new URL('../../.github/workflows/marketstack-de-eu-preflight.yml',import.meta.url),'utf8');assert.match(source,/workflow_dispatch:/);assert.doesNotMatch(source,/schedule:|upload-artifact|ingest-marketstack/);assert.match(source,/contents: read/);
 assert.match(source,/import_selected:[\s\S]*?type: boolean\s+default: false/);
 assert.match(source,/id: selected-import\s+if: github.event_name == 'workflow_dispatch' && inputs.import_selected/);
 assert.match(source,/Seal private state including failed attempts[\s\S]*?if: always\(\)/);
 assert.match(source,/cache\/save@v4[\s\S]*?steps.seal-private-state.outcome == 'success'[\s\S]*?path: \.market-cache\/marketstack-cache.enc/);
 assert.doesNotMatch(source,/path: \.market-cache\/marketstack\s*$/m);
});
