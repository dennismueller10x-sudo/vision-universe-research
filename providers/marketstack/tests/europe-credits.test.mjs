import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createEuropeBudget,estimateEuropeBatch,buildRefreshCreditModel,TARGET_CREDITS,HARD_CAP} from '../../../scripts/marketstack/europe-credits.mjs';
const require=createRequire(import.meta.url),{createMarketstackClient}=require('../client.js');
const repo=resolve(new URL('../../../',import.meta.url).pathname);
function temporary(fn){const dir=mkdtempSync(join(tmpdir(),'vu-europe-credit-'));return Promise.resolve().then(()=>fn(dir)).finally(()=>rmSync(dir,{recursive:true,force:true}));}

test('global defaults and exclusive lifecycle refuse concurrent opens and ledger resets',()=>temporary(async dir=>{
 assert.equal(TARGET_CREDITS,15000);assert.equal(HARD_CAP,25000);
 const file=join(dir,'credits.json'),budget=createEuropeBudget(file);
 assert.equal(budget.status().maxCredits,15000);assert.throws(()=>createEuropeBudget(file),/EXCLUSIVE_LOCK/);
 await budget.reserve({cost:1,endpoint:'/eod'});budget.close();assert.equal(existsSync(file+'.lock'),false);
 assert.throws(()=>createEuropeBudget(file),/EXISTING_RUN_LEDGER/);
 assert.throws(()=>createEuropeBudget(join(dir,'excess'),{maxCredits:25001}),/HARD_CAP/);
 assert.throws(()=>budget.status(),/CLOSED/);
}));
test('private ledger refuses repository paths, linked ancestors and dangling links',()=>temporary(dir=>{
 for(const p of [repo,join(repo,'..private/ledger.json'),join(repo,'docs/ledger.json')])assert.throws(()=>createEuropeBudget(p),/OUTSIDE/);
 symlinkSync(repo,join(dir,'linked'));assert.throws(()=>createEuropeBudget(join(dir,'linked/ledger')),/SYMLINK/);
 symlinkSync(join(dir,'absent'),join(dir,'dangling'));assert.throws(()=>createEuropeBudget(join(dir,'dangling/ledger')),/SYMLINK/);
}));
test('durable reservations count failed requests and retries across shared clients before transport',()=>temporary(async dir=>{
 const file=join(dir,'credits.json'),budget=createEuropeBudget(file,{maxCredits:23});let calls=0;
 const transport=async()=>{calls++;assert.equal(JSON.parse(readFileSync(file)).requests,calls);return {status:calls===1?504:200,text:async()=>JSON.stringify({data:[]}),headers:new Headers()};};
 const options={apiKey:'TESTKEY-europe',sharedBudget:budget,fetchImpl:transport,maxRequests:10,maxCredits:100,maxRetries:1,minIntervalMs:0,baseBackoffMs:0};
 const a=createMarketstackClient(options),b=createMarketstackClient(options);
 assert.equal((await a.request('/eod/latest',{symbols:'SAP,SIE'})).ok,true);
 assert.equal(budget.status().requests,2);assert.equal(budget.status().estimatedCredits,4);
 assert.equal((await b.request('/etfholdings',{ticker:'TEST'})).ok,false);assert.equal(calls,2);
  assert.equal(statSync(file).mode&0o777,0o600);
  const journal=readFileSync(file+'.attempts.jsonl','utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(journal.map(r=>[r.attempt,r.cost]),[[1,2],[2,2]]);
  assert.equal(JSON.parse(readFileSync(file)).reservations,undefined);budget.close();
}));
test('negative, fractional and endpoint-underestimated reservations cannot lower accounting',()=>temporary(async dir=>{
 const budget=createEuropeBudget(join(dir,'ledger'),{maxCredits:20});
 for(const cost of [-1,0,1.2,NaN])await assert.rejects(budget.reserve({cost,endpoint:'/eod'}),/INVALID/);
 await assert.rejects(budget.reserve({cost:1,endpoint:'/etfholdings'}),/UNDER_ENDPOINT/);
 await budget.reserve({cost:20,endpoint:'/etfholdings'});await assert.rejects(budget.reserve({cost:1,endpoint:'/eod'}),/BUDGET_EXCEEDED/);
 assert.equal(budget.status().requests,1);assert.equal(budget.status().estimatedCredits,20);budget.close();
}));
test('ledger rollback or lock tampering latches closed to later attempts',()=>temporary(async dir=>{
 for(const what of ['ledger','lock','journal']){
  const file=join(dir,what),budget=createEuropeBudget(file),before=readFileSync(file,'utf8');
  await budget.reserve({cost:1,endpoint:'/eod'});
  writeFileSync(what==='ledger'?file:what==='lock'?file+'.lock':file+'.attempts.jsonl',what==='ledger'?before:'different owner');
  await assert.rejects(budget.reserve({cost:1,endpoint:'/eod'}),/UNVERIFIED/);
  await assert.rejects(budget.reserve({cost:1,endpoint:'/eod'}),/BLOCKED/);
  assert.throws(()=>createEuropeBudget(file),/EXCLUSIVE_LOCK/);
 }
}));
test('batch estimate includes symbols, pagination, retries and 20-credit holdings before execution',()=>temporary(async dir=>{
 const operations=[{endpoint:'/eod',params:{symbols:'SAP,SIE,SAP'},pages:3,attempts:2},{endpoint:'/etfholdings',pages:2}];
 const e=estimateEuropeBatch(operations);assert.equal(e.requests,8);assert.equal(e.credits,52);
 const budget=createEuropeBudget(join(dir,'ledger'),{maxCredits:52});assert.equal(budget.estimateBatch(operations).remainingAfterBatch,0);
 await budget.reserve({cost:1,endpoint:'/eod'});assert.throws(()=>budget.estimateBatch(operations),/BATCH_EXCEEDS/);
 assert.throws(()=>estimateEuropeBatch([{endpoint:'/eod',pages:0}]),/PAGES/);budget.close();
}));
test('refresh model derives counts from observed listings, retains unknown billing and separates one-time history',()=>{
 const eq=[{listingKey:'XETR:SAP'},{listingKey:'XETR:SIE'},{listingKey:'XETR:SAP'}],funds=[{listingKey:'XETR:FUND',isin:'DE0000000000'},{listingKey:'XLON:FUND',isin:'DE0000000000'}];
 const m=buildRefreshCreditModel({equities:eq,etfs:funds,inventorySource:'private-current-run',historyPagesPerListing:3});
 assert.equal(m.inventory.equityListings,2);assert.equal(m.inventory.etfListings,2);assert.equal(m.etfHoldings.perRefresh.credits,20);
 assert.equal(m.bootstrap.history.credits,12);assert.equal(m.daily.latest.credits,4);assert.equal(m.optimizedMonthly.credits,140);
 assert(m.unoptimizedMonthly.credits>m.optimizedMonthly.credits);assert.equal(m.safeMonthlyRefreshCost,null);
 assert.equal(m.plan.remainingCredits,'UNKNOWN');assert.equal(m.monthlyFeasibility,'UNVERIFIED');assert.equal(m.scheduleEnabled,false);
});
test('model does not substitute target universe sizes or hide unresolved actual rows',()=>{
 const m=buildRefreshCreditModel({equities:[{}],etfs:[]});assert.equal(m.inventory.equityListings,1);assert.equal(m.inventory.unresolvedRows,1);
 assert.equal(buildRefreshCreditModel().inventory.equityListings,0);
 assert.throws(()=>buildRefreshCreditModel({equities:817}),/OBSERVED_INVENTORY/);
 assert.throws(()=>buildRefreshCreditModel({holdingsRefreshesPerMonth:-1}),/INVALID/);
});
