/** Shared conservative reservations; this ledger is not the provider invoice.
 * All paid clients in a run share one file. No balance is inferred from plans. */
import { mkdir, open, readFile, rename, rm, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const MAX_RUN_CREDITS=10000;
// #334's opt-in additive-ingestion monthly safety ceiling, retained conservatively.
// Not a tariff, current account remainder, or an account-wide historical ledger.
export const LOCAL_MONTHLY_SAFETY_CEILING=5000;
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
export function validateAccountEvidence(evidence,now=Date.now()) {
 const month=new Date(now).toISOString().slice(0,7),stamp=Date.parse(evidence?.observedAt);
 if(!evidence||evidence.month!==month||!Number.isFinite(stamp)||stamp>now||now-stamp>86400000||!evidence.source||!evidence.id)fail('ACCOUNT_BUDGET_UNVERIFIED');
 if(evidence.kind==='VERIFIED_ACCOUNT_REMAINDER') {
  if(!nonnegative(evidence.remainingCredits))fail('ACCOUNT_BUDGET_UNVERIFIED');
  return {...evidence,remainingCredits:evidence.remainingCredits};
 }
 if(evidence.kind==='COMPLETE_ACCOUNT_LEDGER'&&evidence.allConsumersReconciled===true&&nonnegative(evidence.accountLimit)&&nonnegative(evidence.consumedCredits)&&evidence.consumedCredits<=evidence.accountLimit) {
  return {...evidence,remainingCredits:evidence.accountLimit-evidence.consumedCredits};
 }
 fail('ACCOUNT_BUDGET_UNVERIFIED');
}
async function noSymlink(path){for(let p=path;;p=dirname(p)){try{if((await lstat(p)).isSymbolicLink())fail('BUDGET_PATH_UNSAFE');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}}
export function createSharedBudget({file,runId,evidence,runLimit=MAX_RUN_CREDITS,monthlyCeiling=LOCAL_MONTHLY_SAFETY_CEILING,reserveCredits=500,now=Date.now}={}) {
 if(!file||typeof runId!=='string'||!runId||['__proto__','constructor','prototype'].includes(runId)||!Number.isSafeInteger(runLimit)||runLimit<1||runLimit>MAX_RUN_CREDITS||!Number.isSafeInteger(monthlyCeiling)||monthlyCeiling<1||monthlyCeiling>LOCAL_MONTHLY_SAFETY_CEILING||!nonnegative(reserveCredits))fail('BUDGET_CONFIG_INVALID');
 file=resolve(file);const lock=file+'.lock';
 async function locked(fn){
  await noSymlink(file);await noSymlink(lock);await mkdir(dirname(file),{recursive:true,mode:0o700});
  let acquired=false;
  for(let i=0;i<50&&!acquired;i++)try{await mkdir(lock,{mode:0o700});acquired=true;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,10));}
  if(!acquired)fail('BUDGET_LOCKED');
  try{return await fn();}finally{await rm(lock,{recursive:true,force:true});}
 }
 async function load(){
  const checked=validateAccountEvidence(evidence,now());let ledger;
  try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')fail('BUDGET_LEDGER_CORRUPT');}
  if(!ledger)ledger={version:'de-eu-marketstack-budget-1',month:checked.month,evidenceId:checked.id,openingAccountRemainder:checked.remainingCredits,requestsAttempted:0,estimatedCreditsConsumed:0,runs:{}};
  if(ledger.version!=='de-eu-marketstack-budget-1'||ledger.month!==checked.month||ledger.evidenceId!==checked.id||ledger.openingAccountRemainder!==checked.remainingCredits||!nonnegative(ledger.estimatedCreditsConsumed)||!nonnegative(ledger.requestsAttempted)||!ledger.runs||typeof ledger.runs!=='object')fail('BUDGET_RECONCILIATION_REQUIRED');
  let credits=0,requests=0;for(const row of Object.values(ledger.runs)){if(!nonnegative(row.estimatedCreditsConsumed)||!nonnegative(row.requestsAttempted))fail('BUDGET_LEDGER_CORRUPT');credits+=row.estimatedCreditsConsumed;requests+=row.requestsAttempted;}
  if(credits!==ledger.estimatedCreditsConsumed||requests!==ledger.requestsAttempted)fail('BUDGET_LEDGER_CORRUPT');
  return ledger;
 }
 function status(ledger){const run=ledger.runs[runId]||{estimatedCreditsConsumed:0,requestsAttempted:0};return {
  version:ledger.version,month:ledger.month,runId,requestsAttempted:run.requestsAttempted,estimatedCreditsConsumed:run.estimatedCreditsConsumed,totalEstimatedCreditsConsumed:ledger.estimatedCreditsConsumed,
  runLimit,monthlyCeiling,reserveCredits,creditsRemaining:Math.max(0,Math.min(runLimit-run.estimatedCreditsConsumed,monthlyCeiling-ledger.estimatedCreditsConsumed,ledger.openingAccountRemainder-ledger.estimatedCreditsConsumed-reserveCredits)),semantics:'CONSERVATIVE_ESTIMATE_NOT_PROVIDER_BILLING',accountEvidenceState:'CURRENT_VERIFIED_BOUND'};}
 async function reserve({cost,endpoint}){if(!Number.isSafeInteger(cost)||cost<1||typeof endpoint!=='string')fail('BUDGET_COST_INVALID');return locked(async()=>{
  const ledger=await load();if(cost>status(ledger).creditsRemaining)fail('SHARED_BUDGET_EXCEEDED');
  const run=ledger.runs[runId]||{estimatedCreditsConsumed:0,requestsAttempted:0};run.estimatedCreditsConsumed+=cost;run.requestsAttempted++;ledger.runs[runId]=run;ledger.estimatedCreditsConsumed+=cost;ledger.requestsAttempted++;ledger.reservationAt=new Date(now()).toISOString();
  const tmp=file+'.tmp-'+randomBytes(8).toString('hex');try{const fd=await open(tmp,'wx',0o600);try{await fd.writeFile(JSON.stringify(ledger));await fd.sync();}finally{await fd.close();}await rename(tmp,file);}finally{await rm(tmp,{force:true});}
  return status(ledger);
 });}
 return {reserve,status:()=>locked(async()=>status(await load()))};
}
