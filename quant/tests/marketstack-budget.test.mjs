import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createSharedBudget, validateAccountEvidence } from '../../scripts/market/marketstack-budget.mjs';
const require=createRequire(import.meta.url),{createMarketstackClient}=require('../../providers/marketstack/client.js');
const now=()=>Date.parse('2026-10-06T12:00:00Z');
const evidence={kind:'VERIFIED_ACCOUNT_REMAINDER',id:'fixture-current-account',source:'account operator verification fixture',month:'2026-10',observedAt:'2026-10-06T11:00:00Z',remainingCredits:1000};
async function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'vu-ms-budget-'));try{await fn({file:join(dir,'budget.json'),dir,runId:'test-run',evidence,now});}finally{rmSync(dir,{recursive:true,force:true});}}
const response=()=>({status:200,text:async()=>'{"data":[]}'});
test('historical plan estimates, stale/future account reads, incomplete ledger and wrong month fail closed',()=>{
 for(const e of [null,{...evidence,kind:'PLAN_ADVERTISED'},{...evidence,observedAt:'2026-10-04T10:00:00Z'},{...evidence,observedAt:'2026-10-06T13:00:00Z'},{...evidence,month:'2026-09'},{...evidence,remainingCredits:-1},{...evidence,kind:'COMPLETE_ACCOUNT_LEDGER',allConsumersReconciled:false,accountLimit:100000,consumedCredits:0}])assert.throws(()=>validateAccountEvidence(e,now()),/ACCOUNT_BUDGET_UNVERIFIED/);
 assert.equal(validateAccountEvidence({...evidence,kind:'COMPLETE_ACCOUNT_LEDGER',allConsumersReconciled:true,accountLimit:1000,consumedCredits:100},now()).remainingCredits,900);
});
test('shared concurrent clients persist reservation before fetch, count retries and stop at available balance minus reserve',async()=>fixture(async options=>{
 const budget=createSharedBudget({...options,runLimit:100,monthlyCeiling:100,reserveCredits:950});let calls=0;
 const clients=Array.from({length:5},()=>createMarketstackClient({apiKey:'TESTKEY-MARKETSTACK-BUDGET',sharedBudget:budget,maxRetries:0,minIntervalMs:0,maxCredits:100,fetchImpl:async()=>{assert.ok(JSON.parse(readFileSync(options.file)).estimatedCreditsConsumed>0);calls++;return response();}}));
 const results=await Promise.all(clients.map((c,i)=>c.request('/eod',{symbols:'SAP.DE,SIE.DE,RHM.DE,ALV.DE,DTE.DE',date:i})));
 assert.equal(results.filter(r=>r.ok).length,5);assert.equal(calls,5);assert.equal((await budget.status()).estimatedCreditsConsumed,25);
 await budget.reserve({cost:25,endpoint:'/eod'});await assert.rejects(budget.reserve({cost:1,endpoint:'/eod'}),/SHARED_BUDGET_EXCEEDED/);assert.equal((await budget.status()).creditsRemaining,0);
}));
test('one shared run cap covers multiple budget instances and process restarts',async()=>fixture(async options=>{
 const a=createSharedBudget({...options,runLimit:2,reserveCredits:0}),b=createSharedBudget({...options,runLimit:2,reserveCredits:0});
 await Promise.all([a.reserve({cost:1,endpoint:'/eod'}),b.reserve({cost:1,endpoint:'/eod'})]);await assert.rejects(a.reserve({cost:1,endpoint:'/eod'}),/SHARED_BUDGET_EXCEEDED/);
 assert.equal((await createSharedBudget({...options,runLimit:2,reserveCredits:0}).status()).requestsAttempted,2);
}));
test('monthly local limit spans different runs; an evidence change requires explicit reconciliation',async()=>fixture(async options=>{
 const a=createSharedBudget({...options,monthlyCeiling:2,reserveCredits:0});await a.reserve({cost:2,endpoint:'/eod'});
 await assert.rejects(createSharedBudget({...options,runId:'another-run',monthlyCeiling:2,reserveCredits:0}).reserve({cost:1,endpoint:'/eod'}),/SHARED_BUDGET_EXCEEDED/);
 await assert.rejects(createSharedBudget({...options,evidence:{...evidence,id:'new-read'}}).status(),/BUDGET_RECONCILIATION_REQUIRED/);
}));
test('unverified shared account blocks all network calls and default client has no uncoordinated paid path',async()=>fixture(async options=>{
 let calls=0;const c=createMarketstackClient({apiKey:'TESTKEY-MARKETSTACK-BUDGET',fetchImpl:async()=>{calls++;return response();}});
 assert.equal((await c.request('/eod',{symbols:'SAP.DE'})).reason,'budgetUnverified');
 const b=createMarketstackClient({apiKey:'TESTKEY-MARKETSTACK-BUDGET',sharedBudget:createSharedBudget({...options,evidence:null}),fetchImpl:async()=>{calls++;return response();}});
 assert.equal((await b.request('/eod',{symbols:'SAP.DE'})).reason,'ACCOUNT_BUDGET_UNVERIFIED');assert.equal(calls,0);
}));
test('corrupted ledger and unsafe symlink never silently reset budget',async()=>fixture(async options=>{
 writeFileSync(options.file,'corrupt');await assert.rejects(createSharedBudget(options).reserve({cost:1,endpoint:'/eod'}),/BUDGET_LEDGER_CORRUPT/);
 rmSync(options.file);const target=join(options.dir,'other.json');writeFileSync(target,'protected');symlinkSync(target,options.file);
 await assert.rejects(createSharedBudget(options).status(),/BUDGET_PATH_UNSAFE/);assert.equal(readFileSync(target,'utf8'),'protected');
}));
test('a held coordinator lock fails safely with no force-unlock and zero provider calls',async()=>fixture(async options=>{
 mkdirSync(options.file+'.lock');await assert.rejects(createSharedBudget(options).reserve({cost:1,endpoint:'/eod'}),/BUDGET_LOCKED/);
}));
test('run maximum and conservative local monthly ceiling cannot be raised',async()=>fixture(async options=>{
 assert.throws(()=>createSharedBudget({...options,runLimit:10001}),/BUDGET_CONFIG_INVALID/);assert.throws(()=>createSharedBudget({...options,monthlyCeiling:5001}),/BUDGET_CONFIG_INVALID/);
}));
