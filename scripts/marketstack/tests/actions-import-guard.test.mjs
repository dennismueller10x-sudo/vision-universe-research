import test from 'node:test';import assert from 'node:assert/strict';
import {assertActionsBudgetContinuity,verifySavedActionsCache} from '../actions-import-guard.mjs';
const previous={id:10,run_attempt:1,status:'completed',conclusion:'success',updated_at:'2026-10-06T10:00:00Z'};
const context={repo:'test/test',branch:'test',runId:11,attempt:1,token:'TEST_TOKEN',evidence:{observedAt:'2026-10-06T09:00:00Z'},marker:{runId:10,attempt:1}};
const fake=p=>async()=>({ok:true,json:async()=>p});
test('latest successful dispatch must match the restored encrypted marker',async()=>{
 await assertActionsBudgetContinuity({...context,fetchImpl:fake({workflow_runs:[{id:11},previous]})});
 for(const marker of [null,{runId:9,attempt:1},{runId:10,attempt:2}])await assert.rejects(assertActionsBudgetContinuity({...context,marker,fetchImpl:fake({workflow_runs:[previous]})}),/RECONCILIATION/);
});
test('failed cache persistence and paid attempts require a new account observation',async()=>{
 const fetchImpl=fake({workflow_runs:[{...previous,conclusion:'failure'}]});
 await assert.rejects(assertActionsBudgetContinuity({...context,fetchImpl}),/RECONCILIATION/);
 await assertActionsBudgetContinuity({...context,evidence:{observedAt:'2026-10-06T10:01:00Z'},fetchImpl});
 await assert.rejects(assertActionsBudgetContinuity({...context,attempt:2,fetchImpl}),/RERUN/);
 await assert.rejects(assertActionsBudgetContinuity({...context,fetchImpl:fake({workflow_runs:[{...previous,status:'in_progress'}]})}),/INCOMPLETE/);
});
test('inaccessible Actions history and missing immutable cache fail closed',async()=>{
 await assert.rejects(assertActionsBudgetContinuity({...context,fetchImpl:async()=>({ok:false})}),/HISTORY_UNVERIFIED/);
 await verifySavedActionsCache({...context,key:'private-11-1',fetchImpl:fake({actions_caches:[{key:'private-11-1'}]})});
 await assert.rejects(verifySavedActionsCache({...context,key:'private-11-1',fetchImpl:fake({actions_caches:[{key:'private-10-1'}]})}),/PERSISTENCE/);
});

import {assertPrivateActionsContinuity} from '../actions-import-guard.mjs';
import {ledgerHash} from '../../market/marketstack-budget.mjs';
const ledger={estimatedCreditsConsumed:123,runs:{fixture:{estimatedCreditsConsumed:123}}};
const safeMarker={state:'COMPLETED',githubRunId:'10',finalEstimatedCredits:123,finalLedgerHash:ledgerHash(ledger)};
const privateContext={repo:'test/test',branch:'eu-private',runId:'12',attempt:1,token:'TEST_TOKEN',ledger,marker:safeMarker};
const liveStep={name:'Reserve a crash-safe execution lease before paid requests',status:'completed',conclusion:'success'};
function history({runs=[{id:11,status:'completed',run_attempt:1},{id:10,status:'completed',run_attempt:1}],steps={10:[liveStep],11:[]}}={}){return async url=>({ok:true,json:async()=>url.includes('/jobs?')?{jobs:[{steps:steps[/runs\/(\d+)\//.exec(url)[1]]||[]}],total_count:1}:{workflow_runs:runs}});}
test('a newer bootstrap cannot hide prior live work after final or lease cache eviction',async()=>{
 await assertPrivateActionsContinuity({...privateContext,fetchImpl:history()});
 for(const patch of [{marker:null,ledger:null},{marker:{state:'COMPLETED',githubRunId:'9',finalEstimatedCredits:123}},{ledger:{estimatedCreditsConsumed:0}},{marker:{...safeMarker,finalLedgerHash:'0'.repeat(64)}}])await assert.rejects(assertPrivateActionsContinuity({...privateContext,...patch,fetchImpl:history()}),/RECONCILIATION/);
});
test('active, failed-final-cache and attempted rerun history cannot reset allowance',async()=>{
 await assert.rejects(assertPrivateActionsContinuity({...privateContext,marker:{...safeMarker,state:'ACTIVE'},fetchImpl:history()}),/RECONCILIATION/);
 await assert.rejects(assertPrivateActionsContinuity({...privateContext,fetchImpl:history({runs:[{id:10,status:'in_progress',run_attempt:1}]})}),/RECONCILIATION/);
 await assert.rejects(assertPrivateActionsContinuity({...privateContext,fetchImpl:history({runs:[{id:10,status:'completed',run_attempt:2}]})}),/RECONCILIATION/);
 await assert.rejects(assertPrivateActionsContinuity({...privateContext,fetchImpl:async()=>({ok:false})}),/HISTORY_UNVERIFIED/);
});
test('first authenticated execution permits only genuinely no prior prepared history',async()=>{
 assert.equal((await assertPrivateActionsContinuity({...privateContext,marker:null,ledger:null,fetchImpl:history({steps:{}})})).previousPreparedRunId,null);
});
