/** New-run measured accounting only. Cached historical ingestion is never rebilled. */
import {createHash} from 'node:crypto';
import {buildRefreshCreditModel} from './europe-credits.mjs';
import {EUROPE21_TARGET,EUROPE21_HARD_CAP,EUROPE21_ALLOCATIONS} from './europe21-ingestion.mjs';
export function buildEurope21CreditUsage({runs=[],equities=[],inventorySource=null,previousRunCredits=8790,options={}}={}){
 const seen=new Set();let requests=0,credits=0,rawResponses=0,baselineMain=null;
 const measured=runs.map(run=>{
  const bytes=run.rawSummary,summary=typeof bytes==='string'?JSON.parse(bytes):null;
  if(!summary||summary.version!=='marketstack-europe21-ingestion-1'||summary.oldRunCreditsIncluded!==false||
     !Object.hasOwn(EUROPE21_ALLOCATIONS,summary.phase)||seen.has(summary.phase))throw Error('EUROPE21_MEASURED_PHASE_INVALID');
  seen.add(summary.phase);const b=summary.budget,cap=EUROPE21_ALLOCATIONS[summary.phase],policy=summary.additionalCreditPolicy;
  if(![b?.requests,b?.estimatedCredits,summary.rawResponses].every(n=>Number.isSafeInteger(n)&&n>=0)||b.estimatedCredits<b.requests||summary.rawResponses>b.requests||
     b.estimatedCredits>cap||b.maxCredits!==cap||b.targetCredits!==EUROPE21_TARGET||b.hardCap!==EUROPE21_HARD_CAP||b.runId!=='europe21-'+summary.phase||
     policy?.targetCredits!==EUROPE21_TARGET||policy?.hardCap!==EUROPE21_HARD_CAP||policy?.maxCredits!==cap||
     Object.keys(policy?.allocations||{}).length!==3||Object.entries(EUROPE21_ALLOCATIONS).some(([k,v])=>policy.allocations[k]!==v)||
     !/^[a-f0-9]{64}$/.test(summary.runPlanHash||'')||!/^[a-f0-9]{40}$/.test(summary.baselineMain||''))throw Error('EUROPE21_MEASURED_ACCOUNTING_INVALID');
  if(baselineMain&&baselineMain!==summary.baselineMain)throw Error('EUROPE21_MEASURED_MAIN_MISMATCH');baselineMain=summary.baselineMain;
  requests+=b.requests;credits+=b.estimatedCredits;rawResponses+=summary.rawResponses;
  return{phase:summary.phase,requests:b.requests,conservativelyReservedCredits:b.estimatedCredits,rawResponses:summary.rawResponses,
   summarySha256:createHash('sha256').update(bytes).digest('hex'),planSha256:summary.runPlanHash,baselineMain:summary.baselineMain,
   source:run.source||null,terminalReason:summary.terminalReason||null,allocatedCap:cap};
 });
 if(credits>EUROPE21_HARD_CAP)throw Error('EUROPE21_HARD_CAP_EXCEEDED');
 const model=buildRefreshCreditModel({...options,equities,etfs:[],inventorySource,measuredRun:{requests,estimatedCredits:credits,rawResponses}});
 return{schema:'europe-credit-usage-2.1',mode:'PRIVATE_RESEARCH',publicationAllowed:false,
  measuredAdditionalRun:{runs:measured,requests,conservativelyReservedCredits:credits,rawResponses,actualBilledCredits:'UNKNOWN',
   previousRunCreditsExcluded:previousRunCredits,semantics:'DURABLE_RESERVATIONS_INCLUDE_FAILED_ATTEMPTS_NOT_OBSERVED_PROVIDER_BILLING'},
  budget:{targetCredits:EUROPE21_TARGET,hardCap:EUROPE21_HARD_CAP,phaseAllocations:EUROPE21_ALLOCATIONS,
   remainingTargetCredits:Math.max(0,EUROPE21_TARGET-credits),remainingHardCapCredits:EUROPE21_HARD_CAP-credits,
   additionalCreditTargetExceeded:credits>EUROPE21_TARGET,completedMeasuredPhases:[...seen]},
  operatingCostModel:model,safeMonthlyRefreshCost:null,monthlyFeasibility:'ACCOUNT_BILLING_AND_EXISTING_SHARED_WORKLOAD_UNVERIFIED',
  ucitsScope:'EXCLUDED_THIS_RUN',scheduleEnabled:false};
}
