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
