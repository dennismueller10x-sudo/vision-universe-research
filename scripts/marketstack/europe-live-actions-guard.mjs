/** One-use reviewed Actions source/plan binding. No provider requests. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateLivePlan} from './europe-live-revalidation.mjs';
export const REPOSITORY='dennismueller10x-sudo/vision-universe-research';
export const BRANCH='audit/europe-live-revalidation-449-20261013';
export const MARKER='scripts/marketstack/europe-live-run-trigger.json';
export const PLAN='scripts/marketstack/europe-live-request-plan.json';
export const WORKFLOW='.github/workflows/europe-live-revalidation.yml';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function verifyLiveTrigger({marker,planBytes,head,parents,changedPaths,repository,ref,event,attempt,runId,existingRuns=[]}){
 if(repository!==REPOSITORY||ref!=='refs/heads/'+BRANCH||event!=='push'||String(attempt)!=='1'||!/^\d+$/.test(String(runId)))throw Error('LIVE_ACTIONS_EXECUTION_SCOPE_REFUSED');
 if(marker?.version!==1||marker.nonce!=='europe-live-449-20261013-01'||marker.maximumCredits!==16000||marker.targetCredits!==13000||marker.planSha256!==sha(planBytes)||!/^[a-f0-9]{40}$/.test(marker.sourceCommit||''))throw Error('LIVE_ACTIONS_PLAN_LEASE_MISMATCH');
 if(!/^[a-f0-9]{40}$/.test(head||'')||parents?.length!==1||parents[0]!==marker.sourceCommit||changedPaths?.length!==1||changedPaths[0]!==MARKER)throw Error('LIVE_ACTIONS_REVIEWED_SOURCE_MISMATCH');
 if(existingRuns.some(r=>r.path===WORKFLOW&&String(r.id)!==String(runId)))throw Error('LIVE_ACTIONS_PRIOR_EXECUTION_REFUSED');
 return {head,sourceCommit:marker.sourceCommit,planSha256:marker.planSha256,nonce:marker.nonce,targetCredits:13000,hardCap:16000};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const planBytes=readFileSync(PLAN),marker=JSON.parse(readFileSync(MARKER,'utf8'));
 const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
 const head=git(['rev-parse','HEAD']),parents=git(['show','-s','--format=%P','HEAD']).split(' ').filter(Boolean),changedPaths=git(['diff','--name-only',marker.sourceCommit,head]).split('\n').filter(Boolean);
 let existingRuns;
 try{const lines=execFileSync('gh',['api','repos/'+REPOSITORY+'/actions/runs?branch='+encodeURIComponent(BRANCH)+'&event=push&per_page=100','--paginate','--jq','.workflow_runs[]|{id,path}'],{encoding:'utf8',maxBuffer:16*1024*1024}).trim();existingRuns=lines?lines.split('\n').map(v=>JSON.parse(v)):[];}
 catch{throw Error('LIVE_ACTIONS_EXECUTION_HISTORY_UNVERIFIED');}
 const lease=verifyLiveTrigger({marker,planBytes,head,parents,changedPaths,repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,attempt:process.env.GITHUB_RUN_ATTEMPT,runId:process.env.GITHUB_RUN_ID,existingRuns});
 const estimate=validateLivePlan(JSON.parse(planBytes));console.log(JSON.stringify({...lease,securities:estimate.listings,mandatoryReservedCredits:estimate.credits,mandatoryRequests:estimate.requests,providerRequests:0}));
}
