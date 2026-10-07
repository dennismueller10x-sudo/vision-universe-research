/** One-shot Actions execution. Never publishes data, modifies products or commits. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes,createCipheriv,createDecipheriv,publicEncrypt,privateDecrypt,createPublicKey,verify,constants} from 'node:crypto';
import {runAudit,HARD_CAP} from './capability-audit.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const branch='marketstack-connector-capability-audit';
export function pushApprovalPayload(reviewedSourceSha) {
 return JSON.stringify({pr:479,ref:'refs/heads/'+branch,lease:'final-20261007',reviewedSourceSha});
}
export function verifyPushApproval({marker,publicKey,before,parents,changedPaths,lease}) {
 if(lease!=='final-20261007'||marker?.lease!==lease||! /^[a-f0-9]{40}$/.test(marker?.reviewedSourceSha||'')||before!==marker.reviewedSourceSha||parents?.length!==1||parents[0]!==before||changedPaths?.length!==1||changedPaths[0]!=='scripts/marketstack/final-live-trigger.json')throw Error('SIGNED_PUSH_SOURCE_MISMATCH');
 if(typeof marker.signature!=='string'||!verify('sha256',Buffer.from(pushApprovalPayload(before)),{key:publicKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(marker.signature,'base64')))throw Error('SIGNED_PUSH_APPROVAL_INVALID');
 return true;
}
export function checkLease(manifest,lease) {
 if(manifest?.version!==1||manifest.hardCap!==HARD_CAP||manifest.pr!==479||manifest.branch!==branch||!Array.isArray(manifest.allocations))throw Error('INVALID_AUDIT_AUTHORIZATION');
 const ids=new Set();let sum=0;
 for(const item of manifest.allocations){if(!/^[a-z0-9-]{1,40}$/.test(item.id)||ids.has(item.id)||!Number.isInteger(item.cap)||item.cap<1)throw Error('INVALID_AUDIT_ALLOCATION');ids.add(item.id);sum+=item.cap;}
 if(sum>HARD_CAP)throw Error('CUMULATIVE_CREDIT_CAP_EXCEEDED');
 const selected=manifest.allocations.find(x=>x.id===lease);if(!selected)throw Error('LEASE_NOT_AUTHORIZED');return selected;
}
export function assertNoReplay(runs,{runId,title,workflowId}) {
 if(!runs.some(r=>String(r.id)===String(runId)))throw Error('CURRENT_ACTIONS_RUN_NOT_OBSERVED');
 if(runs.some(r=>String(r.workflow_id)===String(workflowId)&&r.display_title===title&&Number(r.id)<Number(runId)))throw Error('AUDIT_LEASE_ALREADY_DISPATCHED');
}
export function sealEvidence(bytes,publicKey,context={}) {
 const recipient=hash((publicKey?.type==='public'?publicKey:createPublicKey(publicKey)).export({type:'spki',format:'der'}));
 const key=randomBytes(32),iv=randomBytes(12),header={version:'vu-marketstack-audit-envelope-1',recipient,iv:iv.toString('base64'),context};
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(JSON.stringify(header)));
 try{return {...header,wrappedKey:publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),ciphertext:Buffer.concat([cipher.update(bytes),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};}finally{key.fill(0);}
}
export function openEvidence(envelope,privateKey) {
 if(envelope.version!=='vu-marketstack-audit-envelope-1')throw Error('INVALID_EVIDENCE_ENVELOPE');
 const header={version:envelope.version,recipient:envelope.recipient,iv:envelope.iv,context:envelope.context};
 if(hash(createPublicKey(privateKey).export({type:'spki',format:'der'}))!==envelope.recipient)throw Error('WRONG_RECIPIENT');
 const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
 try{const d=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));d.setAAD(Buffer.from(JSON.stringify(header)));d.setAuthTag(Buffer.from(envelope.tag,'base64'));return Buffer.concat([d.update(Buffer.from(envelope.ciphertext,'base64')),d.final()]);}finally{key.fill(0);}
}
async function guard() {
 const env=process.env,manifest=JSON.parse(readFileSync('scripts/marketstack/audit-authorization.json','utf8')),allocation=checkLease(manifest,env.VU_AUDIT_LEASE);
 if(!['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME)||env.GITHUB_REF!=='refs/heads/'+branch||env.GITHUB_RUN_ATTEMPT!=='1'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('ACTION_EXECUTION_NOT_AUTHORIZED');
 if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==env.GITHUB_SHA)throw Error('ACTION_CHECKOUT_SHA_MISMATCH');
 if(env.GITHUB_EVENT_NAME==='push') {
  const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  verifyPushApproval({marker:JSON.parse(readFileSync('scripts/marketstack/final-live-trigger.json','utf8')),publicKey:readFileSync('scripts/marketstack/audit-recipient-public.pem','utf8'),before:event.before,parents:execFileSync('git',['show','-s','--format=%P','HEAD'],{encoding:'utf8'}).trim().split(' '),changedPaths:execFileSync('git',['diff','--name-only',event.before,'HEAD'],{encoding:'utf8'}).trim().split('\n'),lease:allocation.id});
 } else if(env.VU_AUDIT_EXPECTED_SHA!==env.GITHUB_SHA||env.GITHUB_ACTOR!==env.GITHUB_REPOSITORY_OWNER)throw Error('ACTION_EXECUTION_NOT_AUTHORIZED');
 const runs=[];let sawCurrent=false;
 for(let page=1;page<=5;page++){
  const url=new URL('https://api.github.com/repos/'+env.GITHUB_REPOSITORY+'/actions/runs');url.search=new URLSearchParams({branch,per_page:'100',page:String(page)}).toString();
  const response=await fetch(url,{headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json'},redirect:'error'});
  if(!response.ok)throw Error('ACTION_HISTORY_UNVERIFIED');
  const body=await response.json();if(!Array.isArray(body.workflow_runs))throw Error('ACTION_HISTORY_UNVERIFIED');runs.push(...body.workflow_runs);
  sawCurrent||=body.workflow_runs.some(r=>String(r.id)===env.GITHUB_RUN_ID);
  if(body.workflow_runs.length<100)break;
  if(page===5)throw Error('ACTION_HISTORY_SCAN_INCOMPLETE');
 }
 assertNoReplay(runs,{runId:env.GITHUB_RUN_ID,title:'Marketstack audit 479 '+env.VU_AUDIT_LEASE,workflowId:372065638});
 const out=join(env.RUNNER_TEMP,'vu-marketstack-capability-audit');mkdirSync(out,{recursive:true,mode:0o700});
 writeFileSync(join(out,'authorization.json'),JSON.stringify({lease:allocation.id,cap:allocation.cap,cumulativeAllocated:manifest.allocations.reduce((n,r)=>n+r.cap,0),hardCap:HARD_CAP,sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,observedHistory:sawCurrent})+'\n',{mode:0o600});
 console.log(JSON.stringify({lease:allocation.id,authorizedCap:allocation.cap,hardCap:HARD_CAP,oneShot:true}));
}
async function live() {
 const env=process.env,root=join(env.RUNNER_TEMP,'vu-marketstack-capability-audit'),authorization=JSON.parse(readFileSync(join(root,'authorization.json'),'utf8'));
 if(authorization.sha!==env.GITHUB_SHA||authorization.runId!==env.GITHUB_RUN_ID||authorization.lease!==env.VU_AUDIT_LEASE)throw Error('ACTION_AUTHORIZATION_DRIFT');
 const allocation=checkLease(JSON.parse(readFileSync('scripts/marketstack/audit-authorization.json')),env.VU_AUDIT_LEASE);
 const plan=JSON.parse(readFileSync(allocation.plan||'docs/marketstack-audit/representative-plan.json','utf8'));
 const summary=await runAudit({plan,out:join(root,'evidence'),maxCredits:allocation.cap});
 console.log(JSON.stringify({lease:authorization.lease,requests:summary.budget.requests,reservedCredits:summary.budget.estimatedCredits,terminalReason:summary.terminalReason,productionWrites:summary.productionWrites}));
}
function seal() {
 const env=process.env,root=join(env.RUNNER_TEMP,'vu-marketstack-capability-audit'),out=join(env.RUNNER_TEMP,'vu-marketstack-encrypted');mkdirSync(out,{mode:0o700});
 const archive=execFileSync('tar',['-czf','-','--','vu-marketstack-capability-audit'],{cwd:env.RUNNER_TEMP,maxBuffer:256*1024*1024});
 const key=readFileSync('scripts/marketstack/audit-recipient-public.pem','utf8');
 const envelope=sealEvidence(archive,key,{sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,lease:env.VU_AUDIT_LEASE});
 writeFileSync(join(out,'evidence.enc.json'),JSON.stringify(envelope)+'\n',{mode:0o600});
 console.log(JSON.stringify({encryptedOnly:true,sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,ciphertextSHA256:hash(readFileSync(join(out,'evidence.enc.json')))}));
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){const mode=process.argv[2];Promise.resolve().then(()=>mode==='guard'?guard():mode==='live'?live():mode==='seal'?seal():Promise.reject(Error('INVALID_MODE'))).catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'ACTION_AUDIT_FAILED');process.exitCode=1;});}
