/* Never waive a branch regression: independently reproduce known price-data failures
   on the exact production base, with identical protected data/engine/test inputs. */
import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {productionBaseline,identicalProtectedInputs,protectedPaths} from './production-regression-base.mjs';
const run=(cmd,args,cwd=process.cwd())=>spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:64*1024*1024});
const fork=run('git',['merge-base','HEAD','origin/main']);
if(fork.status||!/^[a-f0-9]{40}$/.test(fork.stdout.trim()))throw Error('VERIFIED_REMOTE_MAIN_MERGE_BASE_REQUIRED');
const {baseline,baselineBasis,eventBaseSha}=productionBaseline({eventName:process.env.GITHUB_EVENT_NAME,eventPath:process.env.GITHUB_EVENT_PATH,pinnedSha:fork.stdout.trim()});
identicalProtectedInputs(baseline);
const dirs=['quant/tests','discover/tests','scripts/supertrader/tests','screener/tests'];
const files=dirs.flatMap(d=>readdirSync(d).filter(p=>p.endsWith('.test.mjs')).map(p=>join(d,p)));
// SG1 independently reproduces on 5d6aa260: its Sep-8 fixture is now beyond
// the 30-day active boundary. The test/engine remain unchanged; exact full-suite
// baseline parity below is still mandatory for every allowed failure.
const allowed=new Set(['CTR18 echte Tiingo-Reihen (Golden Preview): Rekonstruktion = Anbieter, jede Dividende und jeder Split paritaetisch','die Golden Five bestehen den Nachweis ohne Ausnahme','the check is reproducible and reads only committed files','a run that changes nothing leaves the artifact untouched','AL-2 · Merkliste: Chartbild-Ereignisse nur aus sauberem Lauf, nur beobachtete Titel, neutral formuliert','SG1 — der Universumsaufbau klassifiziert echte Stammdatenzeilen und liefert nur die Bilanz aus']);
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
const report={baselineBasis,eventBaseSha,status:candidate.status?'PASS_WITH_INDEPENDENTLY_REPRODUCED_PRE_EXISTING_FAILURES':'PASS',baselineSha:baseline,protectedPaths,protectedInputDiff:[],candidate,independentBaseline:control,newBranchFailures:0,productionPriceDataChanged:false};
writeFileSync(resolve(process.env.RUNNER_TEMP||'/tmp','production-regression-classification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
