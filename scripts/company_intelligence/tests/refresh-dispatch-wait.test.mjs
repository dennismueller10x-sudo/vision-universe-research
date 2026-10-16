/* Auslieferung des Refresh ueber die Pages-Pipeline (refresh-dispatch-wait.mjs) und Workflow-Vertrag.
 * Kein Netz, kein gh, kein Workflow-Lauf: Uhr, gh-Schicht und Auslieferungs-Abfrage sind eingespeist.
 * Hintergrund: 15.10.2026 20:14-20:18Z - verdraengter Dispatch (Lauf 38798312279 cancelled) und 15-min-Frist fuehrten zu
 * PRODUCTION_PUBLICATION_SLO_FAILED, Rollback und Abschaltung bei guten Daten. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as real from '../refresh-dispatch-wait.mjs';
import {LIMITS as VERIFY} from '../refresh-live-verify.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const MIN=60000,T0=1_700_000_000_000,EXPECTED='gen-new';
const here=p=>fileURLToPath(new URL(p,import.meta.url));

/* Lauf-Plan: [[ab_Minuten_nach_Dispatch,status,conclusion],...]; der letzte erreichte Eintrag gilt. */
const runPlan=(...steps)=>steps.map(([m,s,c=''])=>[m*MIN,s,c]);

/**
 * Simulation: virtuelle Uhr (sleep spielt sie vor), gh-Schicht, Auslieferung.
 *  plans: je Dispatch (n-ter) der Plan des entstehenden Laufs oder null (Lauf erscheint nie)
 *  deliveredAtMin: Minute ab T0, ab der die Generation ausgeliefert ist (null = nie)
 */
function sim(mod,{plans,deliveredAtMin=null,deliveredAfterCalls=null,jobStartMin=-25,limits,dispatchFails=0,extraKnown=[]}){
 let t=T0,genCalls=0;const log={dispatch:[],cancel:[],list:0},runs=[...extraKnown];
 const gh={
  dispatch:async()=>{
   const n=log.dispatch.length;log.dispatch.push(t);
   if(n<dispatchFails)throw Error('gh dispatch failed');
   const plan=plans[n-dispatchFails]??null;
   if(plan)runs.push({databaseId:1000+n,createdAt:new Date(t+2000).toISOString(),dispatchedAt:t,plan});
  },
  listRuns:async()=>{log.list++;return runs.map(r=>{
   if(!r.plan)return r;if(t-r.dispatchedAt<(r.plan.hiddenMin||0)*MIN)return null;let cur=r.plan[0];for(const s of r.plan)if(t-r.dispatchedAt>=s[0])cur=s;
   
   return {databaseId:r.databaseId,createdAt:r.createdAt,status:cur[1],conclusion:cur[2]};
  }).filter(Boolean);},
  cancel:async id=>{log.cancel.push(id);}
 };
 const deadlines=mod.planDeadlines({jobStartMs:T0+jobStartMin*MIN,nowMs:T0,limits:limits||mod.LIMITS});
 const run=()=>mod.waitForDelivery({expected:EXPECTED,gh,generation:async()=>{genCalls++;return (deliveredAfterCalls!==null?genCalls>deliveredAfterCalls:deliveredAtMin!==null&&t>=T0+deliveredAtMin*MIN)?EXPECTED:'gen-old';},
  now:()=>t,sleep:async ms=>{t+=ms;},limits:limits||mod.LIMITS,deadlines});
 return {run,log,deadlines,clock:()=>t};
}

/* Kernszenarien; laufen gegen das echte Modul UND gegen Mutanten (siehe Mutationstests). */
const scenarios={
 async cancelledThenRedispatchDelivers(mod){
  const s=sim(mod,{plans:[runPlan([0,'completed','cancelled']),runPlan([0,'queued'],[2,'in_progress'],[6,'completed','success'])],deliveredAtMin:7});
  const r=await s.run();
  assert.equal(r.served,true);assert.equal(r.reason,'DELIVERED');assert.equal(r.dispatches,2);assert.equal(s.log.dispatch.length,2);assert.deepEqual(s.log.cancel,[]);
 },
 async redispatchCapAtTwo(mod){
  const c=runPlan([0,'completed','cancelled']);
  // Limit erreicht, Generation kommt spaeter (durch einen anderen Pages-Lauf): Erfolg ohne weiteren Dispatch, kein Rollback
  const late=sim(mod,{plans:[c,c,c,c,c],deliveredAtMin:30});const rl=await late.run();
  assert.equal(rl.served,true);assert.equal(rl.reason,'DELIVERED');assert.equal(late.log.dispatch.length,3,'1 Dispatch + hoechstens 2 Wiederholungen');
  // Limit erreicht und nie ausgeliefert: Ende erst NACH der Wartefrist, ohne weiteren Dispatch
  const never=sim(mod,{plans:[c,c,c,c,c]});const r=await never.run();
  assert.equal(r.served,false);assert.equal(r.reason,'PRODUCTION_PUBLICATION_SLO_FAILED');assert.equal(r.capped,true);assert.equal(never.log.dispatch.length,3);
  assert.ok(never.clock()>=never.deadlines.waitDeadlineMs,'nicht vor Fristende aufgeben');
 },
 async realFailureStopsImmediately(mod){
  for(const conclusion of ['failure','timed_out','startup_failure']){
   const s=sim(mod,{plans:[runPlan([0,'queued'],[1,'in_progress'],[3,'completed',conclusion])]});const r=await s.run();
   assert.equal(r.served,false,conclusion);assert.equal(r.reason,'PAGES_RUN_FAILED',conclusion);assert.equal(s.log.dispatch.length,1,'keine Wiederholung bei echtem Fehler');
   assert.ok(s.clock()-T0<10*MIN,'sofort, nicht erst nach der Frist');
  }
 },
 async neverAppearedIsRedispatchedThenCapped(mod){
  const s=sim(mod,{plans:[null,null,null,null]});const r=await s.run();
  assert.equal(r.reason,'PRODUCTION_PUBLICATION_SLO_FAILED');assert.equal(r.lastReason,'RUN_NEVER_APPEARED');assert.equal(s.log.dispatch.length,3);
  assert.ok(s.log.dispatch[1]-s.log.dispatch[0]>=mod.LIMITS.appearMs,'erst nach der Erscheinungsfrist');
 },
 async noRedispatchWhenAlreadyDelivered(mod){
  // eigener Lauf cancelled, aber die Generation kam durch einen anderen Pages-Lauf bereits an
  const s=sim(mod,{plans:[runPlan([0,'completed','cancelled'])],deliveredAtMin:0});const r=await s.run();
  assert.equal(r.served,true);assert.equal(s.log.dispatch.length,1);
  // Auslieferung erscheint genau zwischen Schleifenpruefung und Re-Dispatch-Entscheidung: unmittelbar davor wird erneut geprueft
  const race=sim(mod,{plans:[runPlan([0,'completed','cancelled'])],deliveredAfterCalls:1});const rr=await race.run();
  assert.equal(rr.served,true);assert.equal(race.log.dispatch.length,1,'kein Re-Dispatch, wenn die Generation inzwischen ausgeliefert ist');
 },
 async longSerialQueueStillFits(mod){
  // 7 serielle Pages-Laeufe zu 6 min vor dem eigenen: eigener Lauf startet nach 42 min, Auslieferung nach 47 min (> alte 15-min-Frist)
  const s=sim(mod,{plans:[runPlan([0,'queued'],[42,'in_progress'],[47,'completed','success'])],deliveredAtMin:47.5});const r=await s.run();
  assert.equal(r.served,true);assert.equal(s.log.dispatch.length,1,'wartender Lauf wird nicht grundlos neu dispatcht');
 },
 async pendingRunAtDeadlineIsCancelledThenSloFails(mod){
  const s=sim(mod,{plans:[runPlan([0,'queued'])]});const r=await s.run();
  assert.equal(r.served,false);assert.equal(r.reason,'PRODUCTION_PUBLICATION_SLO_FAILED');
  assert.deepEqual(s.log.cancel,[1000],'noch nicht gestarteter eigener Lauf wird vor dem Rollback abgebrochen');
  assert.ok(s.clock()>=s.deadlines.waitDeadlineMs,'nie vor Fristende');
 },
 async runningRunGetsGraceAndIsNeverCancelled(mod){
  // jobStart = T0-70 min -> Wartefrist T0+5, harte Frist T0+15 (Live-QA-Frist T0+20)
  const late=sim(mod,{plans:[runPlan([0,'queued'],[3,'in_progress'],[16,'completed','success'])],deliveredAtMin:16.5,jobStartMin:-70});
  const r=await late.run();
  assert.equal(r.served,false);assert.equal(r.reason,'RUN_STILL_ACTIVE_AT_HARD_DEADLINE');assert.deepEqual(late.log.cancel,[],'laufender Lauf wird nie abgebrochen');
  const grace=sim(mod,{plans:[runPlan([0,'queued'],[3,'in_progress'],[8,'completed','success'])],deliveredAtMin:9,jobStartMin:-70});
  const rg=await grace.run();
  assert.equal(rg.served,true);assert.equal(rg.reason,'DELIVERED');assert.deepEqual(grace.log.cancel,[]);
  assert.ok(grace.clock()>grace.deadlines.waitDeadlineMs,'ausgeliefert erst in der Grace nach der Wartefrist');
 },
 async successButNotVisibleFailsAfterSettle(mod){
  const s=sim(mod,{plans:[runPlan([0,'completed','success'])]});const r=await s.run();
  assert.equal(r.reason,'PRODUCTION_PUBLICATION_SLO_FAILED');assert.equal(s.log.dispatch.length,1);assert.ok(s.clock()>=s.deadlines.waitDeadlineMs,'erst nach der Wartefrist');
 },
 async failedDispatchConsumesAttempt(mod){
  const s=sim(mod,{plans:[runPlan([0,'queued'],[1,'completed','success'])],deliveredAtMin:3,dispatchFails:1});const r=await s.run();
  assert.equal(r.served,true);assert.equal(s.log.dispatch.length,2);
  const bad=sim(mod,{plans:[],dispatchFails:9});assert.equal((await bad.run()).reason,'PRODUCTION_PUBLICATION_SLO_FAILED');assert.equal(bad.log.dispatch.length,3);
 },
 async cancelRechecksStatusBeforeCancelling(mod){
  // Beim Listen am Fristende queued, beim Neu-Lesen unmittelbar vor `gh run cancel` schon in_progress: nie abbrechen
  let t=T0,afterDeadlineCalls=0,dispatched=false;const cancels=[];
  const deadlines=mod.planDeadlines({jobStartMs:T0-25*MIN,nowMs:T0,limits:mod.LIMITS});
  const gh={dispatch:async()=>{dispatched=true;},cancel:async id=>{cancels.push(id);},listRuns:async()=>{
   if(!dispatched)return [];
   if(t>=deadlines.waitDeadlineMs)afterDeadlineCalls++;
   return [{databaseId:56,createdAt:new Date(T0+2000).toISOString(),status:afterDeadlineCalls>=2?'in_progress':'queued',conclusion:''}];}};
  const r=await mod.waitForDelivery({expected:EXPECTED,gh,generation:async()=>'gen-old',now:()=>t,sleep:async ms=>{t+=ms;},limits:mod.LIMITS,deadlines});
  assert.equal(r.served,false);assert.deepEqual(cancels,[],'in_progress wird nie abgebrochen');
 },
 async lateAppearingFirstDispatchIsStillTracked(mod){
  // Dispatch #1 erscheint erst nach 4 min (nach dem Re-Dispatch #2 bei 3 min); er ist ein eigener Lauf und verhindert weitere Dispatches
  const late=Object.assign(runPlan([0,'queued'],[2,'in_progress'],[5,'completed','success']),{hiddenMin:4});
  const s=sim(mod,{plans:[late,null,null],deliveredAtMin:9.5});const r=await s.run();
  assert.equal(r.served,true);assert.equal(s.log.dispatch.length,2,'kein dritter Dispatch, solange der spaete Lauf #1 aktiv ist');
 },
 async foreignOldRunsAreNotOwn(mod){
  // ein bereits vorhandener Lauf (Vorher-Menge, innerhalb der Uhrenabweichung) darf weder Re-Dispatch noch Fehler ausloesen
  const old=c=>({databaseId:7,createdAt:new Date(T0-20000).toISOString(),status:'completed',conclusion:c});
  const s=sim(mod,{plans:[runPlan([0,'queued'],[3,'in_progress'],[6,'completed','success'])],deliveredAtMin:6.5,extraKnown:[old('cancelled')]});
  const r=await s.run();assert.equal(r.served,true);assert.equal(s.log.dispatch.length,1);
  // eigener Lauf erscheint nie, fremder alter Lauf ist failure: kein PAGES_RUN_FAILED, sondern Re-Dispatch nach der Erscheinungsfrist
  const f=sim(mod,{plans:[null,runPlan([0,'queued'],[1,'completed','success'])],deliveredAtMin:6,extraKnown:[old('failure')]});
  const rf=await f.run();assert.equal(rf.served,true);assert.equal(f.log.dispatch.length,2);
 }
};
for(const [name,fn] of Object.entries(scenarios))test('Szenario: '+name,()=>fn(real));

test('judge: Urteil ueber eigene Laeufe',()=>{
 const J=real.judge,r=(status,conclusion='')=>({status,conclusion});
 assert.equal(J([]).verdict,'NONE');
 assert.equal(J([r('queued')]).verdict,'PENDING_ONLY');
 assert.equal(J([r('queued'),r('in_progress')]).verdict,'ACTIVE');
 assert.equal(J([r('completed','success')]).verdict,'SUCCESS');
 assert.equal(J([r('completed','cancelled')]).verdict,'SUPERSEDED');
 assert.equal(J([r('completed','failure')]).verdict,'FAILED');
 assert.equal(J([r('completed','cancelled'),r('completed','failure')]).verdict,'FAILED');
 assert.equal(J([r('completed','cancelled'),r('completed','success')]).verdict,'SUCCESS');
});

test('ownRuns: nur neue Laeufe seit dem Dispatch (Vorher-Menge und Alter)',()=>{
 const runs=[{databaseId:1,createdAt:new Date(T0-10*MIN).toISOString()},{databaseId:2,createdAt:new Date(T0+1000).toISOString()},{databaseId:3,createdAt:new Date(T0-30000).toISOString()}];
 assert.deepEqual(real.ownRuns(runs,{known:new Set(['2']),sinceMs:T0}).map(r=>r.databaseId),[3]); // 2 bekannt, 1 zu alt, 3 innerhalb der Uhrenabweichung
 assert.deepEqual(real.ownRuns(null,{known:new Set(),sinceMs:T0}),[]);
});

/* --- Frist-Rechnung --- */
const wf=loadYamlFile(here('../../../.github/workflows/company-intelligence-refresh.yml'));
const WF_TIMEOUT_MS=wf.jobs.refresh['timeout-minutes']*MIN;

test('Frist: Job-Timeout im Skript = timeout-minutes des Workflows (einzige Quelle)',()=>{
 assert.equal(real.LIMITS.jobTimeoutMs,WF_TIMEOUT_MS);assert.equal(VERIFY.jobTimeoutMs,WF_TIMEOUT_MS);
 assert.ok(Object.isFrozen(real.LIMITS));assert.equal(real.LIMITS.maxRedispatch,2);
});

test('Frist: Rechnung - Pipeline 25 min, danach >= 40 min Warten, dann Live-QA-Budget und Reserve passen in das Job-Timeout',()=>{
 const L=real.LIMITS,jobStart=T0;
 const d=real.planDeadlines({jobStartMs:jobStart,nowMs:jobStart,limits:L});
 assert.equal(d.verifyDeadlineMs,jobStart+WF_TIMEOUT_MS-L.reserveMs,'Live-QA-Frist = Job-Timeout minus Reserve (wie refresh-live-verify.mjs)');
 assert.equal(d.waitDeadlineMs,d.verifyDeadlineMs-L.verifyCapMs,'Warten endet ein volles Live-QA-Budget vor der QA-Frist');
 const pipelineEnd=jobStart+L.pipelineMaxMs;
 assert.ok(d.waitDeadlineMs-pipelineEnd>=L.minWaitMs,'>= 40 min Wartefrist nach dem Pipelineende');
 assert.equal(real.guaranteedWaitMs(L),d.waitDeadlineMs-pipelineEnd);
 assert.equal(real.guaranteedWaitMs(L),50*MIN,'100 - 10 - 15 - 25');
 // Worst Case: Warten bis zur harten Frist, danach bleibt mindestens minVerify; Reserve fuer Rollback bleibt immer unberuehrt
 assert.ok(d.hardDeadlineMs<d.verifyDeadlineMs&&d.verifyDeadlineMs-d.hardDeadlineMs>=L.minVerifyMs);
 assert.ok(d.verifyDeadlineMs+L.reserveMs===jobStart+WF_TIMEOUT_MS,'Rollback-Schritt laeuft innerhalb des Job-Timeouts');
 assert.ok(d.hardDeadlineMs+L.minVerifyMs+L.reserveMs<=jobStart+WF_TIMEOUT_MS);
 assert.ok(L.reserveMs>=10*MIN);
 // die frueheren 15 min waeren fuer sieben serielle Pages-Laeufe zu je 6 min zu knapp
 assert.ok(L.minWaitMs>=7*6*MIN-2*MIN);
});

test('Frist: ohne Jobstart 15 min ab jetzt (fail-closed, nie unbegrenzt)',()=>{
 const d=real.planDeadlines({jobStartMs:null,nowMs:T0});assert.equal(d.waitDeadlineMs,T0+15*MIN);
});

test('Frist: simulierter Worst Case - Lauf endet in der letzten Minute der Wartefrist, Verify hat danach noch sein Budget',async()=>{
 const s=sim(real,{plans:[runPlan([0,'queued'],[48,'in_progress'],[49,'completed','success'])],deliveredAtMin:49.5});
 const r=await s.run();assert.equal(r.served,true);
 assert.ok(s.clock()<=s.deadlines.waitDeadlineMs);assert.ok(s.deadlines.verifyDeadlineMs-s.clock()>=real.LIMITS.verifyCapMs);
});

/* --- Workflow-Vertrag --- */
const steps=wf.jobs.refresh.steps,deploy=steps.find(s=>s.id==='deploy_live'),rollback=steps.find(s=>/^Fail closed on actual production regression/.test(s.name||''));

test('Workflow: Deploy-Verify nutzt das Wartescript statt Einmal-Dispatch und 15-min-Schleife',()=>{
 const run=deploy.run;
 assert.match(run,/node scripts\/company_intelligence\/refresh-dispatch-wait\.mjs --health "\$RUNNER_TEMP\/ci-refresh\/health\.json"/);
 assert.doesNotMatch(run,/gh workflow run pages-release/,'kein Einmal-Dispatch ohne Lauf-ID mehr');
 assert.doesNotMatch(run,/15\*60000|Date\.now\(\)\+/,'keine feste 15-min-Frist im Workflow');
 const closed=run.indexOf('refresh-publication.mjs closed'),wait=run.indexOf('refresh-dispatch-wait.mjs'),verify=run.indexOf('refresh-live-verify.mjs'),observe=run.indexOf('refresh-run.mjs observe');
 assert.ok(closed>=0&&closed<wait&&wait<verify&&verify<observe);
 assert.equal(deploy.env.GH_TOKEN,'${{ secrets.GITHUB_TOKEN }}');
 assert.equal(deploy['continue-on-error'],undefined);assert.equal(deploy.if,'inputs.verification != true');
});

test('Workflow: Rollback-Schritt unveraendert fail-closed; Rechte, ADR-005 und Beleg-Upload',()=>{
 assert.equal(rollback.if,"failure() && steps.deploy_live.outcome == 'failure' && inputs.verification != true");
 assert.deepEqual(wf.permissions,{contents:'read',actions:'write'});
 for(const s of steps)if(s.run)assert.doesNotMatch(s.run,/\$\{\{\s*inputs\./,'Eingabe im run-Block: '+(s.name||s.id));
 assert.match(wf.concurrency.group,/company-intelligence-continuous-/);assert.equal(wf.concurrency['cancel-in-progress'],false);
 const upload=steps.find(s=>String(s.uses).startsWith('actions/upload-artifact')&&/health/.test(String(s.with?.name)));
 assert.match(upload.with.path,/dispatch-wait\.json/);
 const rec=steps.find(s=>/^Record job start/.test(s.name||''));assert.ok(steps.indexOf(rec)<steps.indexOf(deploy));
});

test('Skript: kein Rollback, kein Gate, kein R2; gh nur dispatch/list/cancel auf pages-release.yml',()=>{
 const code=readFileSync(here('../refresh-dispatch-wait.mjs'),'utf8').replace(/\/\*[\s\S]*?\*\//,'');
 assert.doesNotMatch(code,/refresh-run|production-release|s3-driver|VU_HISTORY|rollback\(/i);
 assert.doesNotMatch(code,/\$\{\{/);
 const ghCalls=[...code.matchAll(/run\('gh',\[([^\]]*)\]/g)].map(m=>m[1].split(',')[0]+m[1].split(',')[1]);
 assert.deepEqual(ghCalls.sort(),["'run''cancel'","'run''list'","'workflow''run'"]);
});

test('CLI: ohne --health bzw. ohne erwartete Generation scheitert fail-closed (kein Dispatch)',async()=>{
 const io={gh:{dispatch:async()=>{throw Error('darf nicht dispatchen');},listRuns:async()=>[],cancel:async()=>{}}};
 assert.equal((await real.main([],{},io)).reason,'HEALTH_MISSING');
 assert.equal((await real.main(['--health','/nonexistent/health.json'],{},io)).reason,'EXPECTED_GENERATION_UNKNOWN');
});

/* --- Mutationstests: jede Zusicherung muss eine absichtliche Verschlechterung des Skripts bemerken --- */
const sourceText=readFileSync(here('../refresh-dispatch-wait.mjs'),'utf8');
const verifyUrl=pathToFileURL(here('../refresh-live-verify.mjs')).href;
async function load(mutate){
 const src=mutate(sourceText).replace("'./refresh-live-verify.mjs'",JSON.stringify(verifyUrl));
 return import('data:text/javascript;base64,'+Buffer.from(src).toString('base64')+'#'+Math.random());
}
const mutants={
 'Re-Dispatch-Obergrenze entfernt':s=>s.replace('maxRedispatch:2','maxRedispatch:99'),
 'echter Fehler wird wiederholt statt sofort beendet':s=>s.replace("if(j.verdict==='FAILED')return","if(false)return"),
 'Re-Dispatch auch bei bereits ausgelieferter Generation':s=>s.replace("if(await served())return 'SERVED';\n","")
  ,
 'cancelled gilt nicht als verdraengt':s=>s.replace("const SUPERSEDED=new Set(['cancelled','skipped'])","const SUPERSEDED=new Set([])"),
 'Rollback schon vor Fristende (Frist ignoriert)':s=>s.replace('if(t>=deadlines.waitDeadlineMs){','if(t>=deadlines.waitDeadlineMs-3600000+0*1&&true){'),
 'wartender eigener Lauf bleibt nach Fristende bestehen':s=>s.replace("try{await gh.cancel(id);","try{"),
 'laufender Lauf wird ohne Grace sofort aufgegeben':s=>s.replace("if((j.verdict==='ACTIVE'||settling)&&t<deadlines.hardDeadlineMs)","if(false)"),
 'alte 15-min-Wartefrist':s=>s.replace('waitDeadlineMs:verifyDeadlineMs-limits.verifyCapMs','waitDeadlineMs:jobStartMs+15*60000'),
 'Vorher-Menge ignoriert (fremde alte Laeufe zaehlen als eigen)':s=>s.replace('!known.has(String(r.databaseId))&&',''),
 'Obergrenze gibt sofort auf statt bis zur Wartefrist zu lesen':s=>s.replace("capped=true;lastReason=reason;note('redispatch-limit-reached',{reason});","return finish(result(false,'REDISPATCH_LIMIT_REACHED'));"),
 'Vorher-Menge je Dispatch neu gebildet (spaeter Lauf #1 geht verloren)':s=>s.replace('if(known===null){','if(true){'),
 'kein Status-Recheck vor dem Abbruch':s=>s.replace("if(!r||!PENDING.has(r.status)){note('cancel-skipped',{id,status:r?.status??'unknown'});return;}",""),
 'Erscheinungsfrist wird ignoriert':s=>s.replace("t-dispatchedAt>=limits.appearMs","t-dispatchedAt>=0")
};
for(const [name,mutate] of Object.entries(mutants)){
 test('Mutation erkannt: '+name,async()=>{
  const mod=await load(mutate);
  const real_=await load(s=>s); // Gegenprobe: unveraendert besteht alles
  for(const fn of Object.values(scenarios))await fn(real_);
  let failed=0;
  for(const fn of Object.values(scenarios)){try{await fn(mod);}catch{failed++;}}
  if(name.startsWith('alte 15-min')){ // wird zusaetzlich ueber die Frist-Rechnung erkannt
   const d=mod.planDeadlines({jobStartMs:T0,nowMs:T0});assert.ok(d.waitDeadlineMs-(T0+mod.LIMITS.pipelineMaxMs)<mod.LIMITS.minWaitMs);failed++;
  }
  assert.ok(failed>0,'Mutant ueberlebt: '+name);
 });
}
