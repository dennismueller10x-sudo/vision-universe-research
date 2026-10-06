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
