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

const authorization={kind:'USER_AUTHORIZED_BOUNDED_RUN',id:'stable-authorized-global',runId:'vu-europe-consumer-20261006-autonomous',source:'SYNTHETIC_USER_AUTHORIZATION',month:'2026-10',observedAt:'2026-10-06T11:00:00Z',unknownAccountUsageAcknowledged:true,hardLimit:20000,targetLimit:15000,sourceSHA:'a'.repeat(40),referenceHash:'b'.repeat(64)};
test('additional run scope preserves 3702 cumulative credits and enforces a shared 12000 additional hard cap',async()=>fixture(async options=>{
 const original=createSharedBudget({...options,runId:authorization.runId,evidence:authorization});await original.reserve({cost:3702,endpoint:'/synthetic-opening-ledger'});
 const before=await original.status(),scope={id:'europe-817-completion',openingCredits:3702,targetCredits:8000,hardCredits:12000};
 const revised={...authorization,sourceSHA:'c'.repeat(40),previousLedgerHash:before.ledgerHash,additionalBudgetScope:scope};
 const a=createSharedBudget({...options,runId:authorization.runId,evidence:revised}),b=createSharedBudget({...options,runId:authorization.runId,evidence:revised});
 const opening=await a.status();assert.equal(opening.estimatedCreditsConsumed,3702);assert.equal(opening.runLimit,15702);assert.equal(opening.additionalBudgetScope.consumedCredits,0);assert.equal(opening.additionalBudgetScope.remainingCredits,12000);assert.equal(opening.targetLimit,15000);
 await Promise.all([a.reserve({cost:4000,endpoint:'/one-agent'}),b.reserve({cost:4001,endpoint:'/second-agent'})]);const target=await b.status();assert.equal(target.additionalBudgetScope.consumedCredits,8001);assert.equal(target.additionalBudgetScope.targetExceeded,true);assert.equal(target.additionalBudgetScope.remainingCredits,3999);assert.equal(target.targetExceeded,false);
 await a.reserve({cost:3999,endpoint:'/final'});await assert.rejects(b.reserve({cost:1,endpoint:'/overage'}),/SHARED_BUDGET_EXCEEDED/);
 assert.equal((await a.status()).totalEstimatedCreditsConsumed,15702);assert.equal((await a.status()).requestsAttempted,4);const ledger=JSON.parse(readFileSync(options.file));assert.equal(JSON.parse(ledger.authorizationHash).additionalBudgetScope.id,scope.id);assert.deepEqual(ledger.authorizationRevisions[1].additionalBudgetScope,scope);
}));
test('additional scope requires exact existing opening and parent hash; cannot be removed, changed or reset',async()=>fixture(async options=>{
 const base={...options,runId:authorization.runId,evidence:authorization},original=createSharedBudget(base);await original.reserve({cost:3702,endpoint:'/fixture'});const before=await original.status(),scope={id:'817-scope',openingCredits:3702,targetCredits:8000,hardCredits:12000};
 for(const change of [{previousLedgerHash:null},{previousLedgerHash:'f'.repeat(64)},{additionalBudgetScope:{...scope,openingCredits:3701}}])await assert.rejects(createSharedBudget({...base,evidence:{...authorization,previousLedgerHash:before.ledgerHash,additionalBudgetScope:scope,...change}}).status(),/RECONCILIATION|OPENING_MISMATCH/);
 const scoped={...authorization,previousLedgerHash:before.ledgerHash,additionalBudgetScope:scope},budget=createSharedBudget({...base,evidence:scoped});await budget.status();await budget.reserve({cost:5,endpoint:'/fixture'});const current=await budget.status();
 for(const additionalBudgetScope of [undefined,{...scope,id:'another'},{...scope,hardCredits:11999},{...scope,targetCredits:7999},{...scope,openingCredits:3707}])await assert.rejects(createSharedBudget({...base,evidence:{...scoped,previousLedgerHash:current.ledgerHash,sourceSHA:'d'.repeat(40),additionalBudgetScope}}).status(),/SCOPE_IMMUTABLE/);
 const continuing={...scoped,sourceSHA:'e'.repeat(40),referenceHash:'f'.repeat(64),previousLedgerHash:current.ledgerHash};assert.equal((await createSharedBudget({...base,evidence:continuing}).status()).additionalBudgetScope.consumedCredits,5);
 rmSync(options.file);await assert.rejects(createSharedBudget({...base,evidence:continuing}).status(),/BUDGET_PRIOR_LEDGER_REQUIRED/);
}));
test('malformed additional scopes fail closed and account/month ceilings still dominate scoped allowances',async()=>fixture(async options=>{
 const scope={id:'817-scope',openingCredits:0,targetCredits:8000,hardCredits:12000};for(const patch of [{hardCredits:12001},{targetCredits:8001},{openingCredits:-1},{id:''},{extra:'unbound'},{targetCredits:12000}])assert.throws(()=>validateAccountEvidence({...authorization,additionalBudgetScope:{...scope,...patch}},now()),/ADDITIONAL_BUDGET_SCOPE_INVALID/);
 const base={...options,runId:authorization.runId,evidence:authorization,monthlyCeiling:4000},budget=createSharedBudget(base);await budget.reserve({cost:3702,endpoint:'/fixture'});const previous=await budget.status();const scoped=createSharedBudget({...base,evidence:{...authorization,previousLedgerHash:previous.ledgerHash,additionalBudgetScope:{...scope,openingCredits:3702}}});assert.equal((await scoped.status()).creditsRemaining,298);await assert.rejects(scoped.reserve({cost:299,endpoint:'/over-month'}),/SHARED_BUDGET_EXCEEDED/);
}));
