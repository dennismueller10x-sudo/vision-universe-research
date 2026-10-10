/** Measured private bootstrap and explicit refresh scenarios; never activates a schedule. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildRefreshCreditModel} from './europe-credits.mjs';
import {ALLOCATIONS} from './europe-ingestion.mjs';
export function buildEuropeCreditReport({runs=[],equities=[],etfs=[],inventorySource,options={}}={}){
 const seen=new Set();let requests=0,credits=0,rawResponses=0;
 const measured=runs.map(run=>{const s=run.summary??run;if(!['discovery','foundation','completion'].includes(s.lease)||seen.has(s.lease))throw Error('MEASURED_LEASE_INVALID_OR_DUPLICATED');seen.add(s.lease);
  const r=s.budget?.requests,c=s.budget?.estimatedCredits,raw=s.rawResponses;
  if(![r,c,raw].every(n=>Number.isSafeInteger(n)&&n>=0)||c<r||raw>r||!/^[a-f0-9]{64}$/.test(s.planHash??''))throw Error('MEASURED_ACCOUNTING_INVALID');if(c>ALLOCATIONS[s.lease]||s.budget.maxCredits!==undefined&&s.budget.maxCredits!==ALLOCATIONS[s.lease]||s.budget.runId!==undefined&&s.budget.runId!==s.lease)throw Error('MEASURED_LEASE_ACCOUNTING_MISMATCH');requests+=r;credits+=c;rawResponses+=raw;
  return {lease:s.lease,requests:r,conservativelyReservedCredits:c,rawResponses:raw,planHash:s.planHash,source:run.source??null,summarySha256:run.sha256??null,terminalReason:s.terminalReason??null};
 });if(credits>25000)throw Error('GLOBAL_HARD_CAP_EXCEEDED');
 const model=buildRefreshCreditModel({...options,equities,etfs,inventorySource,measuredRun:{requests,estimatedCredits:credits,rawResponses}});
 return {...model,measuredBootstrap:{runs:measured,requests,conservativelyReservedCredits:credits,actualBilledCredits:null,rawResponses,rawResponseCoverage:requests?rawResponses/requests:null},runBudget:{targetCredits:15000,hardCapCredits:25000,remainingTargetCredits:Math.max(0,15000-credits),remainingHardCapCredits:25000-credits,targetExceeded:credits>15000},safeMonthlyRefreshCost:null,monthlyFeasibility:'UNVERIFIED_EXISTING_WORKLOAD_AND_BILLING',scheduleEnabled:false};
}
export function readMeasuredRun(path){const bytes=readFileSync(path);return {source:path,sha256:createHash('sha256').update(bytes).digest('hex'),summary:JSON.parse(bytes)};}
