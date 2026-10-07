/** Shared conservative reservations; this ledger is not the provider invoice.
 * All paid clients in a run share one file. No balance is inferred from plans. */
import { mkdir, open, readFile, rename, rm, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes,createHash } from 'node:crypto';

export const MAX_RUN_CREDITS=20000;
export const TARGET_RUN_CREDITS=15000;
export const LEGACY_MAX_RUN_CREDITS=10000;
// #334's opt-in additive-ingestion monthly safety ceiling, retained conservatively.
// Not a tariff, current account remainder, or an account-wide historical ledger.
export const LOCAL_MONTHLY_SAFETY_CEILING=5000;
const fail=code=>{const e=Error(code);e.code=code;throw e;};
export const ledgerHash=ledger=>createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
const authorizationKey=checked=>JSON.stringify({id:checked.id,runId:checked.runId,sourceSHA:checked.sourceSHA,referenceHash:checked.referenceHash,hardLimit:checked.hardLimit,targetLimit:checked.targetLimit,...(checked.additionalBudgetScope?{additionalBudgetScope:checked.additionalBudgetScope}:{})});
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
export function validateAccountEvidence(evidence,now=Date.now()) {
 const month=new Date(now).toISOString().slice(0,7),stamp=Date.parse(evidence?.observedAt);
 if(evidence?.kind==='USER_AUTHORIZED_BOUNDED_RUN'){
  if(evidence.month!==month||!Number.isFinite(stamp)||stamp>now||now-stamp>86400000||!evidence.source||!evidence.id||!evidence.runId||evidence.unknownAccountUsageAcknowledged!==true||!Number.isSafeInteger(evidence.hardLimit)||evidence.hardLimit<1||evidence.hardLimit>MAX_RUN_CREDITS||!Number.isSafeInteger(evidence.targetLimit)||evidence.targetLimit<1||evidence.targetLimit>Math.min(TARGET_RUN_CREDITS,evidence.hardLimit)||!/^([a-f0-9]{40})$/.test(evidence.sourceSHA||'')||!/^([a-f0-9]{64})$/.test(evidence.referenceHash||''))fail('RUN_AUTHORIZATION_INVALID');
  if(evidence.additionalBudgetScope!==undefined){
   const scope=evidence.additionalBudgetScope;
   if(!scope||typeof scope!=='object'||Array.isArray(scope)||Object.keys(scope).sort().join(',')!=='hardCredits,id,openingCredits,targetCredits'||typeof scope.id!=='string'||!scope.id.trim()||!nonnegative(scope.openingCredits)||!Number.isSafeInteger(scope.hardCredits)||scope.hardCredits<1||scope.hardCredits>12000||!Number.isSafeInteger(scope.targetCredits)||scope.targetCredits<1||scope.targetCredits>Math.min(8000,scope.hardCredits)||!Number.isSafeInteger(scope.openingCredits+scope.hardCredits))fail('ADDITIONAL_BUDGET_SCOPE_INVALID');
   evidence={...evidence,additionalBudgetScope:{id:scope.id,openingCredits:scope.openingCredits,targetCredits:scope.targetCredits,hardCredits:scope.hardCredits}};
  }
  if(evidence.accountRemainingCredits!==undefined&&evidence.accountRemainingCredits!==null&&!nonnegative(evidence.accountRemainingCredits))fail('RUN_AUTHORIZATION_INVALID');
  return {...evidence,remainingCredits:evidence.accountRemainingCredits??null,accountEvidenceState:evidence.accountRemainingCredits===undefined||evidence.accountRemainingCredits===null?'UNKNOWN_USER_AUTHORIZED_DETERMINISTIC_COUNTER':'CURRENT_VERIFIED_BOUND'};
 }
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
export function createSharedBudget({file,runId,evidence,runLimit,monthlyCeiling,reserveCredits,now=Date.now}={}) {
 const authorized=evidence?.kind==='USER_AUTHORIZED_BOUNDED_RUN';
 runLimit=runLimit??(authorized?evidence.hardLimit:LEGACY_MAX_RUN_CREDITS);monthlyCeiling=monthlyCeiling??(authorized?null:LOCAL_MONTHLY_SAFETY_CEILING);reserveCredits=reserveCredits??(authorized?evidence.accountRemainingCredits==null?0:500:500);
 if(authorized&&runId!==evidence.runId)fail('RUN_AUTHORIZATION_MISMATCH');
 if(!file||typeof runId!=='string'||!runId||['__proto__','constructor','prototype'].includes(runId)||!Number.isSafeInteger(runLimit)||runLimit<1||runLimit>(authorized?Math.min(MAX_RUN_CREDITS,evidence.hardLimit):LEGACY_MAX_RUN_CREDITS)||(!authorized&&(!Number.isSafeInteger(monthlyCeiling)||monthlyCeiling<1||monthlyCeiling>LOCAL_MONTHLY_SAFETY_CEILING))||(authorized&&monthlyCeiling!==null&&(!Number.isSafeInteger(monthlyCeiling)||monthlyCeiling<1||monthlyCeiling>MAX_RUN_CREDITS))||!nonnegative(reserveCredits))fail('BUDGET_CONFIG_INVALID');
 if(authorized&&evidence.additionalBudgetScope)runLimit=Math.min(runLimit,evidence.additionalBudgetScope.openingCredits+evidence.additionalBudgetScope.hardCredits);
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
  const newLedger=!ledger;
  if(newLedger&&authorized&&(checked.previousLedgerHash||checked.additionalBudgetScope))fail('BUDGET_PRIOR_LEDGER_REQUIRED');
  if(!ledger)ledger={version:authorized?'de-eu-marketstack-budget-2':'de-eu-marketstack-budget-1',authorizationHash:authorized?authorizationKey(checked):null,authorizationRevisions:authorized?[{sourceSHA:checked.sourceSHA,referenceHash:checked.referenceHash,observedAt:checked.observedAt,previousLedgerHash:null}]:[],month:checked.month,evidenceId:checked.id,openingAccountRemainder:checked.remainingCredits,requestsAttempted:0,estimatedCreditsConsumed:0,runs:{}};
  if(ledger.version!==(authorized?'de-eu-marketstack-budget-2':'de-eu-marketstack-budget-1')||ledger.month!==checked.month||ledger.evidenceId!==checked.id||ledger.openingAccountRemainder!==checked.remainingCredits||!nonnegative(ledger.estimatedCreditsConsumed)||!nonnegative(ledger.requestsAttempted)||!ledger.runs||typeof ledger.runs!=='object')fail('BUDGET_RECONCILIATION_REQUIRED');
  let credits=0,requests=0;for(const row of Object.values(ledger.runs)){if(!nonnegative(row.estimatedCreditsConsumed)||!nonnegative(row.requestsAttempted))fail('BUDGET_LEDGER_CORRUPT');credits+=row.estimatedCreditsConsumed;requests+=row.requestsAttempted;}
  if(credits!==ledger.estimatedCreditsConsumed||requests!==ledger.requestsAttempted)fail('BUDGET_LEDGER_CORRUPT');
  if(authorized&&ledger.authorizationHash!==authorizationKey(checked)){
   let prior;try{prior=JSON.parse(ledger.authorizationHash);}catch{fail('BUDGET_LEDGER_CORRUPT');}
   if(prior.id!==checked.id||prior.runId!==checked.runId||prior.hardLimit!==checked.hardLimit||prior.targetLimit!==checked.targetLimit||!checked.previousLedgerHash||checked.previousLedgerHash!==ledgerHash(ledger))fail('BUDGET_RECONCILIATION_REQUIRED');
   if(prior.additionalBudgetScope&&JSON.stringify(prior.additionalBudgetScope)!==JSON.stringify(checked.additionalBudgetScope))fail('ADDITIONAL_BUDGET_SCOPE_IMMUTABLE');
   if(!prior.additionalBudgetScope&&checked.additionalBudgetScope&&(checked.additionalBudgetScope.openingCredits!==ledger.estimatedCreditsConsumed||checked.additionalBudgetScope.openingCredits!==(ledger.runs[runId]?.estimatedCreditsConsumed||0)))fail('ADDITIONAL_BUDGET_SCOPE_OPENING_MISMATCH');
   ledger.authorizationRevisions??=[{sourceSHA:prior.sourceSHA,referenceHash:prior.referenceHash,previousLedgerHash:null}];
   ledger.authorizationRevisions.push({sourceSHA:checked.sourceSHA,referenceHash:checked.referenceHash,previousLedgerHash:checked.previousLedgerHash,observedAt:checked.observedAt,creditsCarried:ledger.estimatedCreditsConsumed,requestsCarried:ledger.requestsAttempted,...(checked.additionalBudgetScope?{additionalBudgetScope:checked.additionalBudgetScope}:{})});
   ledger.authorizationHash=authorizationKey(checked);await persist(ledger);
  }
  if(authorized&&checked.additionalBudgetScope&&ledger.estimatedCreditsConsumed<checked.additionalBudgetScope.openingCredits)fail('ADDITIONAL_BUDGET_SCOPE_OPENING_MISMATCH');
  if(newLedger)await persist(ledger);
  return ledger;
 }
 async function persist(ledger){const tmp=file+'.tmp-'+randomBytes(8).toString('hex');try{const fd=await open(tmp,'wx',0o600);try{await fd.writeFile(JSON.stringify(ledger));await fd.sync();}finally{await fd.close();}await rename(tmp,file);}finally{await rm(tmp,{force:true});}}
 function status(ledger){const run=ledger.runs[runId]||{estimatedCreditsConsumed:0,requestsAttempted:0},scope=authorized?evidence.additionalBudgetScope:null;return {
  version:ledger.version,ledgerHash:ledgerHash(ledger),authorizationRevisions:ledger.authorizationRevisions?.length||0,month:ledger.month,runId,requestsAttempted:run.requestsAttempted,estimatedCreditsConsumed:run.estimatedCreditsConsumed,totalEstimatedCreditsConsumed:ledger.estimatedCreditsConsumed,
  runLimit,targetLimit:authorized?evidence.targetLimit:null,...(scope?{additionalBudgetScope:{...scope,consumedCredits:ledger.estimatedCreditsConsumed-scope.openingCredits,remainingCredits:Math.max(0,Math.min(scope.hardCredits-(ledger.estimatedCreditsConsumed-scope.openingCredits),runLimit-run.estimatedCreditsConsumed,monthlyCeiling===null?Infinity:monthlyCeiling-ledger.estimatedCreditsConsumed,ledger.openingAccountRemainder===null?Infinity:ledger.openingAccountRemainder-ledger.estimatedCreditsConsumed-reserveCredits)),targetExceeded:ledger.estimatedCreditsConsumed-scope.openingCredits>scope.targetCredits}}:{}),monthlyCeiling,reserveCredits,creditsRemaining:Math.max(0,Math.min(runLimit-run.estimatedCreditsConsumed,monthlyCeiling===null?Infinity:monthlyCeiling-ledger.estimatedCreditsConsumed,ledger.openingAccountRemainder===null?Infinity:ledger.openingAccountRemainder-ledger.estimatedCreditsConsumed-reserveCredits)),semantics:'CONSERVATIVE_ESTIMATE_NOT_PROVIDER_BILLING',accountEvidenceState:authorized?evidence.accountRemainingCredits==null?'UNKNOWN_USER_AUTHORIZED_DETERMINISTIC_COUNTER':'CURRENT_VERIFIED_BOUND':'CURRENT_VERIFIED_BOUND',targetExceeded:authorized&&run.estimatedCreditsConsumed>evidence.targetLimit};}
 async function reserve({cost,endpoint}){if(!Number.isSafeInteger(cost)||cost<1||typeof endpoint!=='string')fail('BUDGET_COST_INVALID');return locked(async()=>{
  const ledger=await load();if(cost>status(ledger).creditsRemaining)fail('SHARED_BUDGET_EXCEEDED');
  const run=ledger.runs[runId]||{estimatedCreditsConsumed:0,requestsAttempted:0};run.estimatedCreditsConsumed+=cost;run.requestsAttempted++;ledger.runs[runId]=run;ledger.estimatedCreditsConsumed+=cost;ledger.requestsAttempted++;ledger.reservationAt=new Date(now()).toISOString();
  await persist(ledger);
  return status(ledger);
 });}
 return {reserve,status:()=>locked(async()=>status(await load()))};
}
