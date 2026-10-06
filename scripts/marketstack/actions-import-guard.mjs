/** Account-wide evidence and encrypted-cache continuity before paid Actions work. */
export async function assertActionsBudgetContinuity({repo,branch,runId,attempt,token,evidence,marker,fetchImpl=fetch}){
 if(String(attempt)!=='1')throw Error('ACTIONS_RERUN_REQUIRES_NEW_RECONCILED_DISPATCH');
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!branch||!token||!/^\d+$/.test(String(runId)))throw Error('ACTIONS_CONTEXT_UNVERIFIED');
 const endpoint='https://api.github.com/repos/'+repo+'/actions/workflows/marketstack-de-eu-preflight.yml/runs?'+new URLSearchParams({branch,event:'workflow_dispatch',per_page:'100'});
 let data;
 try{const response=await fetchImpl(endpoint,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'error'});if(!response.ok)throw Error();data=await response.json();}catch{throw Error('ACTIONS_HISTORY_UNVERIFIED');}
 if(!Array.isArray(data.workflow_runs))throw Error('ACTIONS_HISTORY_UNVERIFIED');
 const previous=data.workflow_runs.find(r=>String(r.id)!==String(runId));
 if(!previous)return;
 if(previous.status!=='completed')throw Error('ACTIONS_PREVIOUS_DISPATCH_INCOMPLETE');
 const persisted=previous.conclusion==='success'&&String(marker?.runId)===String(previous.id)&&String(marker?.attempt)===String(previous.run_attempt);
 const observed=Date.parse(evidence?.observedAt),finished=Date.parse(previous.updated_at);
 if(!persisted&&!(Number.isFinite(observed)&&Number.isFinite(finished)&&observed>finished))throw Error('ACTIONS_BUDGET_RECONCILIATION_REQUIRED');
}

export async function verifySavedActionsCache({repo,key,token,fetchImpl=fetch}){
 try{
  const response=await fetchImpl('https://api.github.com/repos/'+repo+'/actions/caches?'+new URLSearchParams({key,per_page:'100'}),
   {headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'error'});
  if(response.ok&&(await response.json()).actions_caches?.some(c=>c.key===key))return;
 }catch{}
 throw Error('ACTIONS_PRIVATE_LEDGER_PERSISTENCE_UNVERIFIED');
}

/** Prevent restoration of an older bootstrap cache from resetting paid work.
 * Workflow history is the independent append-only evidence; cached counters alone
 * cannot prove that a newer immutable final/lease cache was not evicted. */
export async function assertPrivateActionsContinuity({repo,branch,runId,attempt,token,marker,ledger,fetchImpl=fetch}){
 if(String(attempt)!=='1')throw Error('ACTIONS_RERUN_REQUIRES_CREDIT_RECONCILIATION');
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!branch||!token||!/^\d+$/.test(String(runId)))throw Error('ACTIONS_CONTEXT_UNVERIFIED');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json'};
 async function get(path){try{const response=await fetchImpl('https://api.github.com/repos/'+repo+path,{headers,redirect:'error'});if(!response.ok)throw Error();return await response.json();}catch{throw Error('ACTIONS_HISTORY_UNVERIFIED');}}
 const prepareName='Reserve a crash-safe execution lease before paid requests',executeName='Execute explicitly authorized frozen listing requests privately';
 for(let page=1;page<=10;page++){
  const data=await get('/actions/workflows/marketstack-private-live.yml/runs?'+new URLSearchParams({branch,event:'pull_request',per_page:'100',page:String(page)}));
  if(!Array.isArray(data.workflow_runs))throw Error('ACTIONS_HISTORY_UNVERIFIED');
  for(const run of data.workflow_runs){
   if(!/^\d+$/.test(String(run.id)))throw Error('ACTIONS_HISTORY_UNVERIFIED');
   if(BigInt(run.id)>=BigInt(runId))continue;
   // Inspect attempts as well: an earlier attempted rerun cannot be concealed by
   // a later failed/skipped attempt of the same immutable Actions run.
   const attempts=Number(run.run_attempt||1);if(!Number.isInteger(attempts)||attempts<1||attempts>10)throw Error('ACTIONS_HISTORY_UNVERIFIED');
   for(let previousAttempt=attempts;previousAttempt>=1;previousAttempt--){
    const jobs=await get('/actions/runs/'+run.id+'/attempts/'+previousAttempt+'/jobs?per_page=100');
    if(!Array.isArray(jobs.jobs)||Number(jobs.total_count||jobs.jobs.length)>100)throw Error('ACTIONS_HISTORY_UNVERIFIED');
    const steps=jobs.jobs.flatMap(j=>j.steps||[]);
    const prepared=steps.some(s=>s.name===prepareName&&s.conclusion==='success');
    const executed=steps.some(s=>s.name===executeName&&s.status==='completed'&&s.conclusion!=='skipped');
    const executing=steps.some(s=>s.name===executeName&&s.status==='in_progress');
    if(!prepared&&!executed&&!executing)continue;
    if(run.status!=='completed'||previousAttempt!==1||marker?.state!=='COMPLETED'||String(marker.githubRunId)!==String(run.id)||!ledger||!Number.isSafeInteger(marker.finalEstimatedCredits)||marker.finalEstimatedCredits!==ledger.estimatedCreditsConsumed)throw Error('ACTIONS_PRIVATE_BUDGET_RECONCILIATION_REQUIRED');
    // completed leases from this safe workflow include the exact final ledger
    // hash, preserving controlled authorization revision provenance as well.
    const {ledgerHash}=await import('../market/marketstack-budget.mjs');
    if(!marker.finalLedgerHash||marker.finalLedgerHash!==ledgerHash(ledger))throw Error('ACTIONS_PRIVATE_BUDGET_RECONCILIATION_REQUIRED');
    return {previousPreparedRunId:String(run.id),verified:true};
   }
  }
  if(data.workflow_runs.length<100)return {previousPreparedRunId:null,verified:true};
 }
 throw Error('ACTIONS_HISTORY_BOUND_RECONCILIATION_REQUIRED');
}
