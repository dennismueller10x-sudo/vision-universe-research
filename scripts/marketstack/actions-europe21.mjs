/** Targeted Europe2.1 collection. Three signed one-use phases, encrypted private output. */
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {ingestEurope21,validateEurope21Plan,verifyEurope21Marker,EUROPE21_BRANCH,EUROPE21_TRIGGER} from './europe21-ingestion.mjs';
import {hash} from './europe-ingestion.mjs';
import {sealEvidence} from './actions-audit.mjs';
const ROOT=join(process.env.RUNNER_TEMP??'/tmp','vu-marketstack-europe21');
const marker=()=>JSON.parse(readFileSync(EUROPE21_TRIGGER,'utf8'));
const plan=m=>JSON.parse(readFileSync('docs/europe21/'+m.phase+'-plan.json','utf8'));
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function verifyExecutionEnvironment(e,event,m,checkedSha){
 if(e.GITHUB_EVENT_NAME!=='push'||e.GITHUB_REF!=='refs/heads/'+EUROPE21_BRANCH||e.GITHUB_RUN_ATTEMPT!=='1'||
    !/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||checkedSha!==e.GITHUB_SHA||event.head_commit?.id!==e.GITHUB_SHA||
    event.ref!==e.GITHUB_REF||event.head_commit?.message!==m.phase)throw Error('EUROPE21_EXECUTION_REFUSED');
}
export async function fetchCompleteWorkflowHistory({repository,token,runId,fetchImpl=fetch}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')||!/^\d+$/.test(String(runId)))throw Error('EUROPE21_HISTORY_UNVERIFIED');
 const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json'};
 const current=await fetchImpl('https://api.github.com/repos/'+repository+'/actions/runs/'+runId,{headers,redirect:'error'});
 if(!current.ok)throw Error('EUROPE21_HISTORY_UNVERIFIED');const c=await current.json();
 if(String(c.id)!==String(runId)||!Number.isSafeInteger(c.workflow_id)||c.workflow_id<=0||c.head_branch!==EUROPE21_BRANCH||c.run_attempt!==1||c.path!=='.github/workflows/marketstack-europe21-ingestion.yml')throw Error('EUROPE21_WORKFLOW_UNVERIFIED');
 const runs=[];let complete=false;
 for(let page=1;page<=5;page++){
  const u=new URL('https://api.github.com/repos/'+repository+'/actions/workflows/'+c.workflow_id+'/runs');
  u.search=new URLSearchParams({branch:EUROPE21_BRANCH,per_page:'100',page:String(page)}).toString();
  const r=await fetchImpl(u,{headers,redirect:'error'});if(!r.ok)throw Error('EUROPE21_HISTORY_UNVERIFIED');
  const body=await r.json();if(!Array.isArray(body.workflow_runs)||!Number.isSafeInteger(body.total_count)||body.total_count<0)throw Error('EUROPE21_HISTORY_UNVERIFIED');
  runs.push(...body.workflow_runs);
  if(body.workflow_runs.length<100){if(body.total_count!==runs.length)throw Error('EUROPE21_HISTORY_INCOMPLETE');complete=true;break;}
 }
 if(!complete)throw Error('EUROPE21_HISTORY_INCOMPLETE');return {runs,workflowId:c.workflow_id};
}
async function guard(){
 const e=process.env,m=marker(),p=plan(m),event=JSON.parse(readFileSync(e.GITHUB_EVENT_PATH,'utf8'));
 verifyExecutionEnvironment(e,event,m,git(['rev-parse','HEAD']));validateEurope21Plan(p);
 const history=await fetchCompleteWorkflowHistory({repository:e.GITHUB_REPOSITORY,token:e.GH_TOKEN,runId:e.GITHUB_RUN_ID});
 verifyEurope21Marker(m,{before:event.before,parents:git(['show','-s','--format=%P','HEAD']).split(' '),changedPaths:git(['diff','--name-only',event.before,'HEAD']).split('\n'),
  envelope:p,publicKey:readFileSync('scripts/marketstack/europe21-recipient-public.pem','utf8'),...history,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,headSha:e.GITHUB_SHA});
 mkdirSync(ROOT,{recursive:true,mode:0o700});
 writeFileSync(join(ROOT,'authorization.json'),JSON.stringify({sha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,phase:m.phase,planHash:m.planHash,workflowId:history.workflowId,maxCredits:p.maxCredits})+'\n',{mode:0o600});
 console.log(JSON.stringify({phase:m.phase,...validateEurope21Plan(p),internal:undefined,productionWrites:0}));
}
async function live(){
 const e=process.env,m=marker(),p=plan(m),a=JSON.parse(readFileSync(join(ROOT,'authorization.json'),'utf8'));
 verifyExecutionEnvironment(e,JSON.parse(readFileSync(e.GITHUB_EVENT_PATH,'utf8')),m,git(['rev-parse','HEAD']));
 if(a.sha!==e.GITHUB_SHA||a.runId!==e.GITHUB_RUN_ID||a.runAttempt!=='1'||a.phase!==m.phase||a.planHash!==hash(JSON.stringify(p)))throw Error('EUROPE21_AUTHORIZATION_DRIFT');
 const summary=await ingestEurope21({envelope:p,out:join(ROOT,'evidence')});
 console.log(JSON.stringify({phase:m.phase,requests:summary.budget.requests,reservedCredits:summary.budget.estimatedCredits,rawResponses:summary.rawResponses,productionWrites:0}));
 if(summary.terminalReason)throw Error('EUROPE21_TERMINAL_COLLECTION_FAILURE');
}
function seal(){
 mkdirSync(ROOT,{recursive:true,mode:0o700});const out=join(process.env.RUNNER_TEMP,'vu-marketstack-europe21-encrypted');mkdirSync(out,{recursive:true,mode:0o700});
 const archive=execFileSync('tar',['-czf','-','--','vu-marketstack-europe21'],{cwd:process.env.RUNNER_TEMP,maxBuffer:512*1024*1024});
 writeFileSync(join(out,'evidence.enc.json'),JSON.stringify(sealEvidence(archive,readFileSync('scripts/marketstack/europe21-recipient-public.pem','utf8'),{sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,phase:marker().phase,branch:EUROPE21_BRANCH}))+'\n',{mode:0o600});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];Promise.resolve().then(()=>mode==='guard'?guard():mode==='live'?live():mode==='seal'?seal():mode==='clean'?rmSync(ROOT,{recursive:true,force:true}):Promise.reject(Error('INVALID_MODE')))
 .catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'EUROPE21_INGESTION_FAILED');process.exitCode=1;});
}
