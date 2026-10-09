/** Actions-only coordinator; clients and field semantics stay in the root importer. */
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrivateRequest,encryptResultArchive } from './actions-handoff.mjs';
import { validateAccountEvidence,createSharedBudget } from '../market/marketstack-budget.mjs';
import { assertPrivateOutput,rejectSymlinkAncestors } from './private-output.mjs';
import { assertPrivateActionsContinuity } from './actions-import-guard.mjs';
const write=(path,value)=>{rejectSymlinkAncestors(path);mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(value)+'\n',{mode:0o600});};
const fail=code=>{throw Error(code);};
export async function preparePrivateExecution({privateDir,context,githubRunId,requestPath,root,actionsContext}={}){
 assertPrivateOutput(privateDir,{allowCache:true});if(!githubRunId)fail('EXECUTION_RUN_REQUIRED');
 const {request,ciphertextHash}=loadPrivateRequest({privateDir,context,requestPath,root});validateAccountEvidence(request.authorization);
 const leasePath=join(privateDir,'execution-lease.json');let previous;
 try{previous=JSON.parse(readFileSync(leasePath,'utf8'));}catch(e){if(e.code!=='ENOENT')fail('EXECUTION_LEASE_CORRUPT');}
 let priorLedger=null;try{priorLedger=JSON.parse(readFileSync(join(privateDir,'shared-budget.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')fail('BUDGET_LEDGER_CORRUPT');}
 if(process.env.GITHUB_ACTIONS==='true'||actionsContext)await assertPrivateActionsContinuity({...actionsContext,repo:actionsContext?.repo||process.env.GITHUB_REPOSITORY,branch:actionsContext?.branch||process.env.GITHUB_HEAD_REF,runId:githubRunId,attempt:actionsContext?.attempt||process.env.GITHUB_RUN_ATTEMPT,token:actionsContext?.token||process.env.GH_TOKEN,marker:previous,ledger:priorLedger});
 if(previous?.state==='ACTIVE')fail('PRIOR_EXECUTION_RECONCILIATION_REQUIRED');
 if(previous?.ciphertextHash===ciphertextHash&&previous?.state==='COMPLETED')fail('REQUEST_ALREADY_COMPLETED_USE_EXISTING_ENCRYPTED_RESULT');
 const budget=createSharedBudget({file:join(privateDir,'shared-budget.json'),runId:request.runId,evidence:request.authorization});const opening=await budget.status();
 write(join(privateDir,'frozen-private-request.json'),request);
 write(leasePath,{version:'marketstack-execution-lease-1',state:'ACTIVE',githubRunId,runId:request.runId,ciphertextHash,sourceSHA:request.sourceSHA,referenceHash:request.authorization.referenceHash,
  reservedUpperBound:opening.creditsRemaining,openingEstimatedCredits:opening.totalEstimatedCreditsConsumed,startedAt:new Date().toISOString()});
 return {prepared:true,phase:request.phase,sourceSHA:request.sourceSHA};
}
export async function executePrivateRequest({privateDir,previewDir,context,githubRunId,requestPath,root,out='.verification/marketstack-private-result.enc.json',ingestImpl}={}){
 assertPrivateOutput(privateDir,{allowCache:true});assertPrivateOutput(previewDir);
 const {request,ciphertextHash}=loadPrivateRequest({privateDir,context,requestPath,root});const leasePath=join(privateDir,'execution-lease.json'),lease=JSON.parse(readFileSync(leasePath,'utf8'));
 if(lease.state!=='ACTIVE'||lease.githubRunId!==githubRunId||lease.ciphertextHash!==ciphertextHash)fail('DURABLE_EXECUTION_LEASE_REQUIRED');
 let status=null,error=null;mkdirSync(previewDir,{recursive:true,mode:0o700});
 try{
  const ingest=ingestImpl||(request.phase==='identity_probe'?(await import('./probe-missing-identities.mjs')).probeIdentity:(await import('./ingest-de-eu.mjs')).ingest);
  status=await ingest({listingMap:request.listingMap,accountEvidence:request.authorization,privateDir,previewOut:previewDir,asOf:request.asOf,runId:request.runId,phase:request.phase,sampleProof:request.sampleProof||null});
 }catch(failure){error=/^[A-Z0-9_]+$/.test(failure.code||failure.message)?failure.code||failure.message:'PRIVATE_IMPORT_FAILURE';}
 // Every attempted client call was reserved before transport. Persist the
 // final counter even for quota/entitlement failures; never print responses.
 const budget=createSharedBudget({file:join(privateDir,'shared-budget.json'),runId:request.runId,evidence:request.authorization});const final=await budget.status();
 write(join(privateDir,'execution-result.json'),{version:'marketstack-private-execution-1',runId:request.runId,sourceSHA:request.sourceSHA,ciphertextHash,phase:request.phase,status:status?'COMPLETED':'FAILED',error,budget:final,sourceContract:'MARKETSTACK_V2',publicDisplay:false});
 const artifact=encryptResultArchive({privateDir,previewDir,publicKey:request.resultPublicKey,out});
 write(leasePath,{...lease,state:'COMPLETED',finishedAt:new Date().toISOString(),finalEstimatedCredits:final.totalEstimatedCreditsConsumed,finalLedgerHash:final.ledgerHash,resultCiphertextSha256:artifact.ciphertextSha256});
 return {completed:!!status,error,phase:request.phase,requests:final.requestsAttempted,estimatedCredits:final.estimatedCreditsConsumed,resultCiphertextSha256:artifact.ciphertextSha256,publicDisplay:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options={privateDir:process.env.VU_MARKETSTACK_PRIVATE_DIR,previewDir:process.env.VU_MARKETSTACK_PREVIEW_DIR,context:process.env.GITHUB_REF,githubRunId:process.env.GITHUB_RUN_ID};
  if(process.env.GITHUB_RUN_ATTEMPT!=='1')fail('RERUN_REQUIRES_CREDIT_DURABILITY_RECONCILIATION');
  if(!process.env.MARKETSTACK_API_KEY)fail('MARKETSTACK_CREDENTIAL_UNAVAILABLE');
  const result=process.argv[2]==='prepare'?await preparePrivateExecution(options):await executePrivateRequest(options);console.log(JSON.stringify(result));if(result.error)process.exitCode=1;
 }catch(error){console.error('Private selected Marketstack execution stopped: '+(/^[A-Z0-9_]+$/.test(error.message)?error.message:'PRIVATE_EXECUTION_FAILURE'));process.exitCode=1;}
}
