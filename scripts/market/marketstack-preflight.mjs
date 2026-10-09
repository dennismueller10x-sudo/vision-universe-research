/** Zero-provider-request credential, private-cache and current-budget preflight. */
import { mkdir,readFile,writeFile,rm,mkdtemp } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openMarketstackCache,sealMarketstackCache } from './marketstack-cache.mjs';
import { validateAccountEvidence } from './marketstack-budget.mjs';
export async function preflight({apiKey=process.env.MARKETSTACK_API_KEY,evidenceFile='.market-cache/marketstack/account-budget-evidence.json',context='de-eu-preflight',now=Date.now()}={}){
 if(typeof apiKey!=='string'||!apiKey.trim())return {version:'marketstack-de-eu-preflight-1',credentialConfigured:false,authenticatedAccount:'NOT_TESTED',budgetEvidence:'BLOCKED',reason:'ENTITLEMENT_BLOCKED',importReady:false,providerRequests:0};
 // Test existing crypto machinery in an isolated scratch tree, never replace
 // an ingestion cache or silently recover a missing/corrupted budget ledger.
 const scratch=await mkdtemp(join(tmpdir(),'vu-ms-preflight-'));
 try{const workDir=join(scratch,'marketstack'),file=join(scratch,'cache.enc');await mkdir(workDir,{mode:0o700});await writeFile(join(workDir,'sentinel.json'),'{}',{mode:0o600});
  const options={workDir,file,apiKey,context};if((await sealMarketstackCache(options)).status!=='SEALED')throw Error('PRIVATE_CACHE_FAILED');await rm(workDir,{recursive:true});if((await openMarketstackCache(options)).status!=='OPENED')throw Error('PRIVATE_CACHE_FAILED');
 }finally{await rm(scratch,{recursive:true,force:true});}
 let budgetEvidence='CURRENT_VERIFIED_BOUND',reason=null;
 try{validateAccountEvidence(JSON.parse(await readFile(evidenceFile,'utf8')),now);}catch{budgetEvidence='BLOCKED_CURRENT_ACCOUNT_REMAINDER_REQUIRED';reason='ACCOUNT_BUDGET_UNVERIFIED';}
 return {version:'marketstack-de-eu-preflight-1',credentialConfigured:true,authenticatedAccount:'NOT_TESTED',privateStorage:'AUTHENTICATED_CIPHERTEXT_VALIDATED',budgetEvidence,reason,importReady:budgetEvidence==='CURRENT_VERIFIED_BOUND',providerRequests:0,publicDisplay:'RIGHTS_UNCONFIRMED',schedule:'DISABLED'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await preflight();console.log(JSON.stringify(result));if(!result.credentialConfigured)process.exitCode=1;
 }catch{console.error('Marketstack private preflight failed; no provider request was made.');process.exitCode=1;}
}
