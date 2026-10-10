import test from 'node:test';import assert from 'node:assert/strict';
import {buildEurope21CreditUsage} from '../../../scripts/marketstack/europe21-credit-report.mjs';
const record=(phase='phase1',credits=2)=>({version:'marketstack-europe21-ingestion-1',phase,oldRunCreditsIncluded:false,
 runPlanHash:'a'.repeat(64),baselineMain:'b'.repeat(40),rawResponses:1,budget:{requests:1,estimatedCredits:credits,maxCredits:{phase1:6000,phase2:8000,phase3:4000}[phase],targetCredits:10000,hardCap:18000,runId:'europe21-'+phase},
 additionalCreditPolicy:{targetCredits:10000,hardCap:18000,maxCredits:{phase1:6000,phase2:8000,phase3:4000}[phase],allocations:{phase1:6000,phase2:8000,phase3:4000}}});
const run=s=>({rawSummary:JSON.stringify(s),source:'private/test/summary.json'});
test('new phase accounting excludes8790 oldcredits and retains failed attempt reservations',()=>{
 const s=record();s.terminalReason='quotaExceeded';const r=buildEurope21CreditUsage({runs:[run(s)],equities:[{listingKey:'x',mic:'XETR'}]});
 assert.equal(r.measuredAdditionalRun.conservativelyReservedCredits,2);assert.equal(r.measuredAdditionalRun.previousRunCreditsExcluded,8790);assert.equal(r.measuredAdditionalRun.actualBilledCredits,'UNKNOWN');assert.equal(r.budget.remainingHardCapCredits,17998);assert.equal(r.scheduleEnabled,false);assert.equal(r.ucitsScope,'EXCLUDED_THIS_RUN');
});
test('duplicate phase legacy summary changedpolicy overcap and malformedaccounting failclosed',()=>{
 const s=record();assert.throws(()=>buildEurope21CreditUsage({runs:[run(s),run(s)]}),/PHASE/);
 for(const bad of [{...s,version:'marketstack-europe-ingestion-1'},{...s,oldRunCreditsIncluded:true},{...s,budget:{...s.budget,estimatedCredits:6001}},{...s,budget:{...s.budget,hardCap:25000}},{...s,rawResponses:2},{...s,additionalCreditPolicy:{...s.additionalCreditPolicy,allocations:{phase1:6000,phase2:8000,phase3:4001}}}])assert.throws(()=>buildEurope21CreditUsage({runs:[run(bad)]}));
});
test('MIC-scoped latest forecasting never includes ETF workloads or activates scheduling',()=>{
 const r=buildEurope21CreditUsage({runs:[run(record())],equities:[{listingKey:'a',mic:'XETR'},{listingKey:'b',mic:'XPAR'},{listingKey:'a',mic:'XETR'}]});
 assert.equal(r.operatingCostModel.inventory.equityListings,2);assert.equal(r.operatingCostModel.inventory.etfListings,0);assert.equal(r.operatingCostModel.inventory.latestBatchesByMic.length,2);assert.equal(r.safeMonthlyRefreshCost,null);
 assert.throws(()=>buildEurope21CreditUsage({options:{symbolsPerRequest:101}}),/TRANSPORT_LIMIT/);
 assert.throws(()=>buildEurope21CreditUsage({runs:[run(record()),run({...record('phase2'),baselineMain:'c'.repeat(40)})]}),/MAIN_MISMATCH/);
});
