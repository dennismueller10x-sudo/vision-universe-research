/** One-shot signed private ingestion. No scheduled trigger, tracked writes or release. */
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {ingestEurope,validatePlan,verifyIngestionMarker,hash} from './europe-ingestion.mjs';
import {sealEvidence} from './actions-audit.mjs';
const ROOT=join(process.env.RUNNER_TEMP??'/tmp','vu-marketstack-europe');
const marker=()=>JSON.parse(readFileSync('scripts/marketstack/europe-live-trigger.json','utf8'));
const plan=m=>JSON.parse(readFileSync('docs/marketstack-europe/'+m.lease+'-plan.json','utf8'));
async function guard(){
 const e=process.env,m=marker(),p=plan(m);
 if(e.GITHUB_EVENT_NAME!=='push'||e.GITHUB_REF!=='refs/heads/marketstack-europe-foundation'||e.GITHUB_RUN_ATTEMPT!=='1'||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('EUROPE_EXECUTION_REFUSED');
 const event=JSON.parse(readFileSync(e.GITHUB_EVENT_PATH,'utf8'));
 if(event.head_commit?.message!==m.lease)throw Error('EUROPE_LEASE_RUN_TITLE_MISMATCH');
 verifyIngestionMarker(m,{before:event.before,parents:execFileSync('git',['show','-s','--format=%P','HEAD'],{encoding:'utf8'}).trim().split(' '),changedPaths:execFileSync('git',['diff','--name-only',event.before,'HEAD'],{encoding:'utf8'}).trim().split('\n'),plan:p,publicKey:readFileSync('scripts/marketstack/europe-recipient-public.pem','utf8')});
 // Whole workflow history for this branch is small and must include this run.
 const url=new URL('https://api.github.com/repos/'+e.GITHUB_REPOSITORY+'/actions/runs');url.search=new URLSearchParams({branch:'marketstack-europe-foundation',per_page:'100'}).toString();
 const response=await fetch(url,{headers:{authorization:'Bearer '+e.GH_TOKEN,accept:'application/vnd.github+json'},redirect:'error'});if(!response.ok)throw Error('EUROPE_HISTORY_UNVERIFIED');
 const runs=(await response.json()).workflow_runs;if(!Array.isArray(runs)||runs.length>=100||!runs.some(r=>String(r.id)===e.GITHUB_RUN_ID))throw Error('EUROPE_HISTORY_INCOMPLETE');
 if(runs.some(r=>r.display_title==='Marketstack Europe '+m.lease&&Number(r.id)<Number(e.GITHUB_RUN_ID)))throw Error('EUROPE_LEASE_REPLAY_REFUSED');
 mkdirSync(ROOT,{recursive:true,mode:0o700});writeFileSync(join(ROOT,'authorization.json'),JSON.stringify({sha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,lease:m.lease,planHash:m.planHash,maxCredits:p.maxCredits})+'\n',{mode:0o600});console.log(JSON.stringify(validatePlan(p)));
}
async function live(){const e=process.env,m=marker(),a=JSON.parse(readFileSync(join(ROOT,'authorization.json'),'utf8')),p=plan(m);if(a.sha!==e.GITHUB_SHA||a.runId!==e.GITHUB_RUN_ID||a.planHash!==hash(JSON.stringify(p)))throw Error('EUROPE_AUTHORIZATION_DRIFT');const summary=await ingestEurope({plan:p,out:join(ROOT,'evidence')});console.log(JSON.stringify({lease:m.lease,requests:summary.budget.requests,reservedCredits:summary.budget.estimatedCredits,rawResponses:summary.rawResponses,productionWrites:0}));}
function seal(){const out=join(process.env.RUNNER_TEMP,'vu-marketstack-europe-encrypted');mkdirSync(out,{recursive:true,mode:0o700});const archive=execFileSync('tar',['-czf','-','--','vu-marketstack-europe'],{cwd:process.env.RUNNER_TEMP,maxBuffer:512*1024*1024});writeFileSync(join(out,'evidence.enc.json'),JSON.stringify(sealEvidence(archive,readFileSync('scripts/marketstack/europe-recipient-public.pem','utf8'),{sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,lease:marker().lease}))+'\n',{mode:0o600});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const mode=process.argv[2];Promise.resolve().then(()=>mode==='guard'?guard():mode==='live'?live():mode==='seal'?seal():mode==='clean'?rmSync(ROOT,{recursive:true,force:true}):Promise.reject(Error('INVALID_MODE'))).catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'EUROPE_INGESTION_FAILED');process.exitCode=1;});}
