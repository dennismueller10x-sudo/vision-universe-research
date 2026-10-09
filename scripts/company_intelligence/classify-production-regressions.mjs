/* Never waive a branch regression: independently reproduce known price-data failures
   on the exact production base, with identical protected data/engine/test inputs. */
import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
// A PR event may name an older base while GitHub's checked-out merge already
// includes a subsequent scheduled main data commit. Use its verified first
// parent, never a caller-provided override or an unrelated checkout.
const run=(cmd,args,cwd=process.cwd())=>spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:64*1024*1024});
const event=process.env.GITHUB_EVENT_NAME==='pull_request'&&process.env.GITHUB_EVENT_PATH?JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')):null;
const fork=run('git',['merge-base','HEAD','origin/main']);
if(fork.status||!/^[a-f0-9]{40}$/.test(fork.stdout.trim()))throw Error('VERIFIED_REMOTE_MAIN_MERGE_BASE_REQUIRED');
let baseline=fork.stdout.trim(),baselineBasis='VERIFIED_GIT_MERGE_BASE_WITH_REMOTE_MAIN';
if(event){
 const eventBase=event.pull_request?.base?.sha,eventHead=event.pull_request?.head?.sha;
 const ancestry=run('git',['show','-s','--format=%P','HEAD']);
 const parents=ancestry.stdout.trim().split(/\s+/);
 if(ancestry.status||parents.length!==2||parents[1]!==eventHead||!parents.every(p=>/^[a-f0-9]{40}$/.test(p))||!/^[a-f0-9]{40}$/.test(eventBase||'')||run('git',['merge-base','--is-ancestor',eventBase,parents[0]]).status)throw Error('TRUSTED_PR_CHECKED_OUT_MERGE_ANCESTRY_REQUIRED');
 baseline=parents[0];baselineBasis='TRUSTED_GITHUB_PR_CHECKOUT_FIRST_PARENT';
}
if(!/^[a-f0-9]{40}$/.test(baseline))throw Error('EXACT_PRODUCTION_BASE_SHA_REQUIRED');
const protectedPaths=['quant','discover','supertrader','screener','providers','scripts/market','scripts/quant'];
const diff=run('git',['diff','--name-only',baseline,'HEAD','--',...protectedPaths]);
if(diff.status||diff.stdout.trim())throw Error('PRE_EXISTING_CLASSIFICATION_REQUIRES_IDENTICAL_PROTECTED_INPUTS');
const dirs=['quant/tests','discover/tests','scripts/supertrader/tests','screener/tests'];
const files=dirs.flatMap(d=>readdirSync(d).filter(p=>p.endsWith('.test.mjs')).map(p=>join(d,p)));
const allowed=new Set(['CTR18 echte Tiingo-Reihen (Golden Preview): Rekonstruktion = Anbieter, jede Dividende und jeder Split paritaetisch','die Golden Five bestehen den Nachweis ohne Ausnahme','the check is reproducible and reads only committed files','a run that changes nothing leaves the artifact untouched','AL-2 · Merkliste: Chartbild-Ereignisse nur aus sauberem Lauf, nur beobachtete Titel, neutral formuliert']);
const parse=r=>({status:r.status,failures:[...r.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1]).sort(),testCount:Number(r.stdout.match(/^# tests (\d+)/m)?.[1]||0),passCount:Number(r.stdout.match(/^# pass (\d+)/m)?.[1]||0),skipCount:Number(r.stdout.match(/^# skipped (\d+)/m)?.[1]||0)});
const currentRaw=run(process.execPath,['--test','--test-reporter=tap',...files]);const candidate=parse(currentRaw);
let control=null;
if(candidate.status){
 if(!candidate.failures.length||candidate.failures.some(n=>!allowed.has(n)))throw Error('UNCLASSIFIED_CANDIDATE_REGRESSION:'+candidate.failures.join('|'));
 const root=resolve(process.env.RUNNER_TEMP||'/tmp','ci-production-baseline-'+process.pid);
 const added=run('git',['worktree','add','--detach',root,baseline]);if(added.status)throw Error('INDEPENDENT_BASELINE_CHECKOUT_FAILED');
 try{control=parse(run(process.execPath,['--test','--test-reporter=tap',...files],root));}finally{run('git',['worktree','remove',root]);}
 if(control.status!==candidate.status||JSON.stringify(control.failures)!==JSON.stringify(candidate.failures)||control.testCount!==candidate.testCount)throw Error('BASELINE_DOES_NOT_REPRODUCE_CANDIDATE_FAILURES');
}
const report={baselineBasis,eventBaseSha:event?.pull_request?.base?.sha||null,status:candidate.status?'PASS_WITH_INDEPENDENTLY_REPRODUCED_PRE_EXISTING_FAILURES':'PASS',baselineSha:baseline,protectedPaths,protectedInputDiff:[],candidate,independentBaseline:control,newBranchFailures:0,productionPriceDataChanged:false};
writeFileSync(resolve(process.env.RUNNER_TEMP||'/tmp','production-regression-classification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
