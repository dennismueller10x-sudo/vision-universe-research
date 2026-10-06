import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {generateHandoffKeys,encryptHandoff,decryptHandoff,bootstrapHandoff,verifyPrivateRequest,REQUEST_PATH} from '../actions-handoff.mjs';
import {preparePrivateExecution,executePrivateRequest} from '../actions-private-live.mjs';
import {createSharedBudget,validateAccountEvidence} from '../../market/marketstack-budget.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const keys=generateHandoffKeys(),resultKeys=generateHandoffKeys();
const authorized=()=>({kind:'USER_AUTHORIZED_BOUNDED_RUN',id:'user-authorized-current-eu-run',source:'USER_EXPLICIT_SCOPE_20K_TEST_FIXTURE',runId:'europe-live-20261006',month:new Date().toISOString().slice(0,7),observedAt:new Date().toISOString(),hardLimit:20000,targetLimit:15000,unknownAccountUsageAcknowledged:true,sourceSHA:'a'.repeat(40),referenceHash:'b'.repeat(64)});
async function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'vu-private-handoff-'));try{await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('public-key handoff authenticates ciphertext, recipient and purpose without exposing private input',()=>{
 const raw=Buffer.from('private frozen mapping and provider bars');const envelope=encryptHandoff(raw,keys.publicKey);
 assert.ok(!JSON.stringify(envelope).includes(raw.toString()));assert.deepEqual(decryptHandoff(envelope,keys.privateKey),raw);
 for(const [patch,key,purpose] of [[{tag:Buffer.alloc(16).toString('base64')},keys.privateKey,'request'],[{},resultKeys.privateKey,'request'],[{},keys.privateKey,'result']])assert.throws(()=>decryptHandoff({...envelope,...patch},key,purpose),/HANDOFF_DECRYPT_FAILED/);
});
test('bootstrap emits only public recipient and preserves private RSA key across the same PR context',()=>fixture(async dir=>{
 const privateDir=join(dir,'marketstack'),publicOut=join(dir,'public.json'),context='refs/pull/123/merge';bootstrapHandoff({privateDir,publicOut,context});const privateKey=readFileSync(join(privateDir,'handoff-private.pem'),'utf8'),first=readFileSync(publicOut,'utf8');
 assert.ok(!first.includes('PRIVATE KEY'));bootstrapHandoff({privateDir,publicOut,context});assert.equal(readFileSync(join(privateDir,'handoff-private.pem'),'utf8'),privateKey);assert.equal(readFileSync(publicOut,'utf8'),first);
}));
test('explicit latest user authorization enables deterministic 20k run bound without inventing account balance or retaining historical 5k opt-in cap',()=>fixture(async dir=>{
 const evidence=authorized();assert.equal(validateAccountEvidence(evidence).remainingCredits,null);
 const b=createSharedBudget({file:join(dir,'budget.json'),runId:evidence.runId,evidence});assert.equal((await b.status()).creditsRemaining,20000);assert.equal((await b.status()).monthlyCeiling,null);assert.match((await b.status()).accountEvidenceState,/UNKNOWN/);
 await b.reserve({cost:15001,endpoint:'/eod'});assert.equal((await b.status()).targetExceeded,true);await b.reserve({cost:4999,endpoint:'/eod'});await assert.rejects(b.reserve({cost:1,endpoint:'/eod'}),/SHARED_BUDGET_EXCEEDED/);
 assert.throws(()=>createSharedBudget({file:join(dir,'other.json'),runId:'different',evidence}),/RUN_AUTHORIZATION_MISMATCH/);
 assert.throws(()=>validateAccountEvidence({...evidence,hardLimit:20001}),/RUN_AUTHORIZATION_INVALID/);
 assert.throws(()=>validateAccountEvidence({...evidence,unknownAccountUsageAcknowledged:false}),/RUN_AUTHORIZATION_INVALID/);
}));
test('a independently known smaller account remainder reduces new authorized cap and keeps reserve',()=>fixture(async dir=>{
 const evidence={...authorized(),accountRemainingCredits:1000};const b=createSharedBudget({file:join(dir,'budget.json'),runId:evidence.runId,evidence});assert.equal((await b.status()).creditsRemaining,500);await b.reserve({cost:500,endpoint:'/eod'});await assert.rejects(b.reserve({cost:1,endpoint:'/eod'}),/SHARED_BUDGET_EXCEEDED/);
}));
test('source/reference binding, persisted execution lease and encrypted full-result export use no provider network',()=>fixture(async dir=>{
 const root=join(dir,'source');mkdirSync(root);const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();git('init');writeFileSync(join(root,'code.js'),'approved code');git('add','code.js');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','approved');const sourceSHA=git('rev-parse','HEAD');
 const privateDir=join(dir,'marketstack'),previewDir=join(dir,'preview'),publicOut=join(dir,'public.json'),context='refs/pull/123/merge';bootstrapHandoff({privateDir,publicOut,context});const recipient=JSON.parse(readFileSync(publicOut,'utf8'));
 const listingMap={schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[]},referenceHash=hash(listingMap),authorization={...authorized(),sourceSHA,referenceHash};
 const request={version:'vu-marketstack-live-request-1',context,sourceSHA,runId:authorization.runId,phase:'sample',asOf:'2026-10-06',listingMap,authorization,resultPublicKey:resultKeys.publicKey};const requestPath=join(root,REQUEST_PATH);mkdirSync(join(root,'scripts/marketstack/private-bootstrap'),{recursive:true});writeFileSync(requestPath,JSON.stringify(encryptHandoff(Buffer.from(JSON.stringify(request)),recipient.publicKey)));git('add',REQUEST_PATH);git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','ciphertext only');
 assert.equal(verifyPrivateRequest(request,{context,root}).referenceHash,referenceHash);assert.throws(()=>verifyPrivateRequest({...request,authorization:{...authorization,referenceHash:'0'.repeat(64)}},{context,root}),/PRIVATE_REQUEST_AUTHORIZATION_MISMATCH/);
 const options={privateDir,previewDir,context,githubRunId:'1234',actionsContext:{repo:'test/test',branch:'fixture',attempt:1,token:'TEST_TOKEN',fetchImpl:async()=>({ok:true,json:async()=>({workflow_runs:[]})})},requestPath,root,out:join(dir,'result.enc.json')};await preparePrivateExecution(options);await assert.rejects(preparePrivateExecution({...options,githubRunId:'1235'}),/PRIOR_EXECUTION_RECONCILIATION_REQUIRED/);
 const result=await executePrivateRequest({...options,ingestImpl:async({privateDir,accountEvidence,runId})=>{await createSharedBudget({file:join(privateDir,'shared-budget.json'),runId,evidence:accountEvidence}).reserve({cost:1,endpoint:'/eod'});writeFileSync(join(privateDir,'source-test.json'),'private raw provider fixture');return {fixture:true};}});
 assert.equal(result.estimatedCredits,1);assert.ok(!readFileSync(options.out,'utf8').includes('private raw provider fixture'));const archive=decryptHandoff(JSON.parse(readFileSync(options.out,'utf8')),resultKeys.privateKey,'result');assert.ok(archive.length>0);
 await assert.rejects(preparePrivateExecution(options),/REQUEST_ALREADY_COMPLETED/);
 writeFileSync(join(root,'code.js'),'drift');git('add','code.js');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','unapproved change');assert.throws(()=>verifyPrivateRequest(request,{context,root}),/AUTHORIZED_SOURCE_DRIFT/);
}));
test('Actions workflow exports only public key or authenticated ciphertext and persists a lease before live transport',()=>{
 const s=readFileSync(new URL('../../../.github/workflows/marketstack-private-live.yml',import.meta.url),'utf8');assert.doesNotMatch(s,/schedule:|pull_request_target|contents: write/);assert.match(s,/head.repo.full_name == github.repository/);assert.match(s,/request.*|execute explicitly/i);assert.match(s,/-lease/);assert.match(s,/marketstack-private-result.enc.json/);assert.ok(s.indexOf('Reserve a crash-safe')<s.indexOf('Execute explicitly authorized'));
});

 test('explicit source/reference revisions preserve all credits and require the preceding encrypted ledger hash',()=>fixture(async dir=>{
  const evidence=authorized(),file=join(dir,'budget.json'),initial=createSharedBudget({file,runId:evidence.runId,evidence});await initial.reserve({cost:3,endpoint:'/eod'});const previous=await initial.status();
  const revised={...evidence,sourceSHA:'c'.repeat(40),referenceHash:'d'.repeat(64)};
  await assert.rejects(createSharedBudget({file,runId:evidence.runId,evidence:revised}).status(),/BUDGET_RECONCILIATION_REQUIRED/);
  await assert.rejects(createSharedBudget({file,runId:evidence.runId,evidence:{...revised,previousLedgerHash:'0'.repeat(64)}}).status(),/BUDGET_RECONCILIATION_REQUIRED/);
  const next=createSharedBudget({file,runId:evidence.runId,evidence:{...revised,previousLedgerHash:previous.ledgerHash}});const start=await next.status();assert.equal(start.estimatedCreditsConsumed,3);assert.equal(start.authorizationRevisions,2);assert.notEqual(start.ledgerHash,previous.ledgerHash);
  await next.reserve({cost:2,endpoint:'/eod'});assert.equal((await next.status()).estimatedCreditsConsumed,5);assert.equal((await next.status()).creditsRemaining,19995);assert.equal((await next.status()).authorizationRevisions,2);
  const stored=JSON.parse(readFileSync(file,'utf8'));assert.equal(stored.authorizationRevisions[1].previousLedgerHash,previous.ledgerHash);assert.equal(stored.authorizationRevisions[1].creditsCarried,3);
 }));
 test('workflow explicitly verifies exact lease cache persistence before live execution',()=>{
  const s=readFileSync(new URL('../../../.github/workflows/marketstack-private-live.yml',import.meta.url),'utf8');assert.match(s,/actions: read/);assert.match(s,/verifySavedActionsCache/);assert.ok(s.indexOf('Verify exact encrypted lease')<s.indexOf('Execute explicitly authorized'));assert.doesNotMatch(s,/\$\{\{ runner.temp \}\}/);
 });
 test('a missing revised ledger cannot accept previousLedgerHash and restart its allowance',()=>fixture(async dir=>{
  const evidence={...authorized(),previousLedgerHash:'1'.repeat(64)};
  await assert.rejects(createSharedBudget({file:join(dir,'missing.json'),runId:evidence.runId,evidence}).status(),/BUDGET_PRIOR_LEDGER_REQUIRED/);
 }));
