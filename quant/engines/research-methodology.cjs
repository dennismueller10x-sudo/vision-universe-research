'use strict';
const C=require('./research-contract.cjs');
// Measurement and proposal evaluation only. No active certification thresholds are changed.
function outcomeCoverage({expected, outcomes, asOf}) {
  const cutoff=C.timestamp(asOf);
  if(!Array.isArray(expected)||!expected.length||!Array.isArray(outcomes))throw Error('EXPECTED_OUTCOME_LEDGER_REQUIRED');
  const ids=new Map(), rows=new Map();
  for(const e of expected){if(!e.id||ids.has(e.id))throw Error('DUPLICATE_EXPECTED_OUTCOME');C.timestamp(e.maturesAt);ids.set(e.id,e);}
  for(const o of outcomes){if(!ids.has(o.id)||rows.has(o.id))throw Error('UNKNOWN_OR_DUPLICATE_OUTCOME');if(!['OBSERVED','MISSING','CENSORED','EXCLUDED'].includes(o.state))throw Error('INVALID_OUTCOME_STATE');if(o.state!=='OBSERVED'&&!o.reason)throw Error('OUTCOME_EXCLUSION_REASON_REQUIRED');if(o.state==='OBSERVED'&&(!Number.isFinite(o.value)||C.timestamp(o.availableAt)>cutoff))throw Error('INVALID_OR_FUTURE_OUTCOME');if(o.state==='OBSERVED'&&C.timestamp(o.availableAt)<C.timestamp(ids.get(o.id).maturesAt))throw Error('OUTCOME_BEFORE_MATURITY');rows.set(o.id,o);}
  const counts={expected:ids.size,mature:0,immature:0,observed:0,missing:0,censored:0,excluded:0};
  for(const [id,e] of ids){const row=rows.get(id);if(C.timestamp(e.maturesAt)>cutoff){if(row?.state==='OBSERVED')throw Error('OUTCOME_BEFORE_MATURITY');counts.immature++;continue;}counts.mature++;counts[({OBSERVED:'observed',MISSING:'missing',CENSORED:'censored',EXCLUDED:'excluded'})[row?.state]||'missing']++;}
  const result={schemaVersion:'research-outcome-coverage-1.0.0',counts,observedShareOfMature:counts.mature?counts.observed/counts.mature:null,observedShareOfAllExpected:counts.observed/counts.expected,denominator:'ALL_EXPECTED_MATURE_OUTCOMES_INCLUDING_MISSING_CENSORED_AND_EXCLUDED',populationCompleteness:'NOT_ESTABLISHED_BY_LEDGER',certification:'NOT_CERTIFIED'};
  return {...result,inputHash:C.hash({expected,outcomes,asOf}),resultHash:C.hash(result)};
}
function evaluateProposal({measurement, threshold, direction, proposalVersion, approval}){
  if(!Number.isFinite(measurement)||!Number.isFinite(threshold)||!['GTE','LTE'].includes(direction)||!proposalVersion)throw Error('INVALID_METHOD_PROPOSAL');
  if(approval!==undefined&&approval!=='PRESERVED_PROPOSAL_NOT_APPROVED')throw Error('POLICY_ACTIVATION_NOT_SUPPORTED');
  return {proposalVersion,state:'PRESERVED_PROPOSAL_NOT_APPROVED',measurement,threshold,direction,diagnostic:(direction==='GTE'?measurement>=threshold:measurement<=threshold)?'WOULD_PASS':'WOULD_FAIL',activeGateChanged:false,certification:'NOT_CERTIFIED'};
}
module.exports={outcomeCoverage,evaluateProposal};
