/** One-use native follow-up lease; no provider IO. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateNativePhase,NATIVE_PRIOR_ANCHOR} from './europe-native-alias-revalidation.mjs';
const REPO='dennismueller10x-sudo/vision-universe-research',BRANCH='audit/europe-live-revalidation-449-20261013';
export const NATIVE_WORKFLOW='.github/workflows/europe-native-alias-revalidation.yml';
export const NATIVE_MARKER='scripts/marketstack/europe-native-run-trigger.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function verifyNativeTrigger({marker,anchorBytes,planBytes,head,parents,changedPaths,repository,ref,event,attempt,runId,existingRuns=[],priorRun}){
 if(repository!==REPO||ref!=='refs/heads/'+BRANCH||event!=='push'||String(attempt)!=='1'||!/^\d+$/.test(String(runId)))throw Error('NATIVE_ACTIONS_SCOPE_REFUSED');
 if(marker?.nonce!=='europe-native-449-20261013-01'||marker.version!==1||marker.previousRunId!==38406637090||marker.previousReservedCredits!==8828||marker.maximumAdditionalCredits!==4172||marker.cumulativeTarget!==13000||marker.cumulativeHardCap!==16000||marker.anchorSha256!==sha(anchorBytes)||marker.planSha256!==sha(planBytes)||!/^[a-f0-9]{40}$/.test(marker.sourceCommit||''))throw Error('NATIVE_ACTIONS_LEASE_MISMATCH');
 if(!/^[a-f0-9]{40}$/.test(head||'')||parents?.length!==1||parents[0]!==marker.sourceCommit||changedPaths?.length!==1||changedPaths[0]!==NATIVE_MARKER)throw Error('NATIVE_ACTIONS_REVIEWED_SOURCE_MISMATCH');
 if(existingRuns.some(r=>r.path===NATIVE_WORKFLOW&&String(r.id)!==String(runId)))throw Error('NATIVE_ACTIONS_PRIOR_EXECUTION_REFUSED');
 if(String(priorRun?.id)!==NATIVE_PRIOR_ANCHOR.runId||priorRun.head_sha!==NATIVE_PRIOR_ANCHOR.sourceCommit||priorRun.status!=='completed'||priorRun.conclusion!=='success'||priorRun.path!=='.github/workflows/europe-live-revalidation.yml')throw Error('NATIVE_PREVIOUS_AUTHENTICATED_RUN_UNVERIFIED');
 return {sourceCommit:marker.sourceCommit,previousRequests:8828,previousReservedCredits:8828,maximumAdditionalCredits:4172,cumulativeTarget:13000,cumulativeHardCap:16000,providerRequests:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const planBytes=readFileSync('scripts/marketstack/europe-live-request-plan.json'),anchorBytes=readFileSync('scripts/marketstack/europe-native-prior-anchor.json'),marker=JSON.parse(readFileSync(NATIVE_MARKER));
 const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
 const head=git(['rev-parse','HEAD']),parents=git(['show','-s','--format=%P','HEAD']).split(' ').filter(Boolean),changedPaths=git(['diff','--name-only',marker.sourceCommit,head]).split('\n').filter(Boolean);
 let existingRuns,priorRun;
 try{const lines=execFileSync('gh',['api','repos/'+REPO+'/actions/runs?branch='+encodeURIComponent(BRANCH)+'&event=push&per_page=100','--paginate','--jq','.workflow_runs[]|{id,path}'],{encoding:'utf8',maxBuffer:16*1024*1024}).trim();existingRuns=lines?lines.split('\n').map(v=>JSON.parse(v)):[];priorRun=JSON.parse(execFileSync('gh',['api','repos/'+REPO+'/actions/runs/38406637090'],{encoding:'utf8',maxBuffer:1024*1024}));}catch{throw Error('NATIVE_ACTIONS_HISTORY_UNVERIFIED');}
 const lease=verifyNativeTrigger({marker,anchorBytes,planBytes,head,parents,changedPaths,repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,attempt:process.env.GITHUB_RUN_ATTEMPT,runId:process.env.GITHUB_RUN_ID,existingRuns,priorRun});
 console.log(JSON.stringify({...lease,estimate:validateNativePhase(JSON.parse(planBytes),JSON.parse(anchorBytes))}));
}

