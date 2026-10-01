import test from 'node:test';import assert from 'node:assert/strict';
import {inventoryRefinedConsumerRequests} from '../../scripts/market/plan-marketstack-us-consumer-refined.mjs';
const input={asOfDate:'2026-10-01',generatedAt:'fixed',protectedBaselineSource:{sha256:'base'},rows:[{security_id:'ref_A',symbol:'A',provider_symbol:'A',current_mic:'XNYS',common_class_refinement_missing_original_directory_coverage:true,baseline_instrument_type:'EQUITY_COMMON',baseline_active_status:'ACTIVE'}]};
test('exact current-MIC cache replaces new paid work even when provider returns no bar',()=>{
 const out=inventoryRefinedConsumerRequests(input,[{endpoints:[{endpoint:'eod/latest',params:{exchange:'XNYS',symbols:'A'},ok:true,data:[],sourceRunId:'1'}]}]);
 assert.equal(out.totals.cachedExactCurrentMic,1);assert.equal(out.totals.estimatedAdditionalCredits,0);assert.equal(out.rows[0].lastObservedStatus,'MISSING_LATEST');
 assert.equal(out.rows[0].cachedDiagnostics[0].runId,'1');assert.equal(out.rows[0].identityApproved,false);
});
test('another-MIC quote does not suppress bounded exact-current-venue diagnostic',()=>{
 const out=inventoryRefinedConsumerRequests(input,[{endpoints:[{endpoint:'eod/latest',params:{exchange:'XNAS',symbols:'A'},ok:true,data:[]}]}]);
 assert.equal(out.plan.estimatedCredits,1);assert.equal(out.plan.tasks[0].params.exchange,'XNYS');assert.equal(out.plan.tasks[0].params.symbols,'A');assert.equal(out.plan.tasks[0].retries,0);
});
test('only explicit retained common-class refinement candidates are queried; bounded limit defers work',()=>{
 const data={...input,rows:[...input.rows,{...input.rows[0],security_id:'ref_B',symbol:'B',provider_symbol:'B'}, {...input.rows[0],security_id:'fund',common_class_refinement_missing_original_directory_coverage:false}]};
 const out=inventoryRefinedConsumerRequests(data,[],{maxCredits:1});assert.equal(out.totals.newLiteralCommonShareCandidates,2);assert.equal(out.plan.deferred.length,1);
 assert.throws(()=>inventoryRefinedConsumerRequests(data,[],{maxCredits:46}),/max45/);
});

test('batch placeholder cardinality is counted once across requested symbols, never reported as zero provider rows',()=>{
 const data={...input,rows:[...input.rows,{...input.rows[0],security_id:'ref_B',symbol:'B',provider_symbol:'B'}]};
 const out=inventoryRefinedConsumerRequests(data,[{endpoints:[{endpoint:'eod/latest',params:{exchange:'XNYS',symbols:'A,B'},ok:true,data:{pagination:{total:1},data:[[]]}}]}]);
 assert.equal(out.totals.cachedExactCurrentMic,2);assert.equal(out.totals.observedUniqueResponseBatches,1);assert.equal(out.totals.rawReturnedBatchRows,1);
 assert.equal(out.totals.emptyArrayPlaceholderRows,1);assert.equal(out.totals.identityBearingObjectRows,0);assert.equal(out.totals.estimatedAdditionalCredits,0);
});
