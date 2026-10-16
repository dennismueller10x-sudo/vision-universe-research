/* Entscheidung des Fail-closed-Handlers in pages-release.yml (pages-rollback-decision.mjs) und ihr Einbau im Workflow.
 * Hintergrund (15.10.2026 20:14-20:18Z): Nach PRODUCTION_GATE_CHANGED_AFTER_PACKAGE lief erneut `refresh-run.mjs rollback`, obwohl das
 * Gate schon von einem anderen Schreiber geschlossen war: Doppel-Rollback, Legacy-GOOD-Zeiger zerstoert.
 * Der Handler-Text des echten Workflows wird mit Stub-Programmen unter bash ausgefuehrt (kein R2, kein gh, kein Workflow-Lauf). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pagesRollbackDecision,refreshRollbackDecision,readGateWithRetry,decisionFromEnv} from '../pages-rollback-decision.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const here=p=>fileURLToPath(new URL(p,import.meta.url));
const AV={gateState:'AVAILABLE',gateReason:null};

test('Entscheidung: nur eigene Veroeffentlichung UND Gate AVAILABLE ergibt ROLLBACK',()=>{
 const d=pagesRollbackDecision({approvedOutcome:'success',approvedEnabled:'true',gate:AV});
 assert.deepEqual(d,{decision:'ROLLBACK',reason:'OWN_GENERATION_PUBLISHED_AND_GATE_AVAILABLE'});
});

test('Entscheidung: Gate bereits DISABLED oder STAGED -> nur disable, kein Rollback',()=>{
 for(const gateState of ['DISABLED','STAGED']){
  const d=pagesRollbackDecision({approvedOutcome:'success',approvedEnabled:'true',gate:{gateState,gateReason:null}});
  assert.equal(d.decision,'DISABLE_ONLY',gateState);assert.equal(d.reason,'GATE_ALREADY_'+gateState);
 }
});

test('Entscheidung: Freigabe-Schritt gescheitert (PRODUCTION_GATE_CHANGED_AFTER_PACKAGE) -> kein Rollback, auch wenn das Gate AVAILABLE meldet',()=>{
 for(const approvedOutcome of ['failure','cancelled','skipped','',undefined]){
  assert.equal(pagesRollbackDecision({approvedOutcome,approvedEnabled:'true',gate:AV}).decision,'DISABLE_ONLY',String(approvedOutcome));
  assert.equal(pagesRollbackDecision({approvedOutcome,approvedEnabled:'',gate:AV}).decision,'DISABLE_ONLY');
 }
});

test('Entscheidung: nichts veroeffentlicht (enabled != true) -> kein Rollback',()=>{
 for(const approvedEnabled of ['false','',undefined,'TRUE','1'])
  assert.equal(pagesRollbackDecision({approvedOutcome:'success',approvedEnabled,gate:AV}).decision,'DISABLE_ONLY',String(approvedEnabled));
});

test('Entscheidung: Gate unlesbar/ungueltig/fremde Generation/fehlend -> DISABLE_ONLY (kein Rollback ohne Beleg)',()=>{
 for(const gate of [null,undefined,{},{gateState:null,gateReason:'GATE_READ_FAILED'},{gateState:null,gateReason:'GATE_INVALID'},{gateState:null,gateReason:'GATE_MISSING'},{gateState:'WEIRD'}])
  assert.equal(pagesRollbackDecision({approvedOutcome:'success',approvedEnabled:'true',gate}).decision,'DISABLE_ONLY',JSON.stringify(gate));
});

test('decisionFromEnv: liest Eingaben nur aus der Umgebung; Lesefehler/Absturz -> DISABLE_ONLY',async()=>{
 const env={APPROVED_OUTCOME:'success',APPROVED_ENABLED:'true'};
 assert.equal((await decisionFromEnv(env,async()=>AV)).decision,'ROLLBACK');
 assert.equal((await decisionFromEnv(env,async()=>({gateState:'DISABLED'}))).decision,'DISABLE_ONLY');
 assert.equal((await decisionFromEnv(env,async()=>{throw Error('R2 down');})).reason,'DECISION_FAILED');
 assert.equal((await decisionFromEnv({},async()=>AV)).decision,'DISABLE_ONLY');
});

test('CLI: ohne R2-Zugang endet das Skript mit Exit 1 (DISABLE_ONLY), nie mit Rollback',()=>{
 const res=spawnSync(process.execPath,[here('../pages-rollback-decision.mjs')],{encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,APPROVED_OUTCOME:'success',APPROVED_ENABLED:'true'}});
 assert.equal(res.status,1,res.stderr);assert.equal(JSON.parse(res.stdout.split('\n')[0]).decision,'DISABLE_ONLY');
});

/* --- Workflow-Vertrag und Ausfuehrung des echten Handler-Texts --- */
const wf=loadYamlFile(here('../../../.github/workflows/pages-release.yml'));
const job=wf.jobs['company-intelligence-live'],steps=job.steps;
const HNAME='Fail-closed persistent consumer gate and emergency Pages rollback';
const handler=steps.find(s=>s.name===HNAME);

test('Workflow: Handler bindet die Entscheidung ein; Eingaben nur ueber env; Bedingung und Rechte unveraendert',()=>{
 assert.ok(handler);
 assert.equal(handler.env.APPROVED_OUTCOME,'${{ steps.approved.outcome }}');
 assert.equal(handler.env.APPROVED_ENABLED,'${{ steps.approved.outputs.enabled }}');
 assert.equal(handler.env.GOOD_GENERATION,'${{ steps.approved.outputs.good_generation }}');
 assert.equal(handler.env.GH_TOKEN,'${{ secrets.GITHUB_TOKEN }}');
 for(const [name,j] of Object.entries(wf.jobs))for(const s of j.steps||[])assert.doesNotMatch(s.run||'',/\$\{\{\s*(github\.event\.)?inputs\./,`${name}/${s.name}`);
 assert.doesNotMatch(handler.run,/\$\{\{/);
 assert.deepEqual(job.permissions,{contents:'read',actions:'write'});assert.equal(job['timeout-minutes'],35);
 assert.match(String(handler.if),/steps\.approved\.outcome == 'failure'/,'Handler laeuft weiterhin auch nach gescheiterter Freigabe (disable + OFF-Dispatch)');
 const r=handler.run,d=r.indexOf('pages-rollback-decision.mjs'),rb=r.indexOf('refresh-run.mjs rollback'),dis=r.indexOf('production-release.mjs disable'),off=r.indexOf('gh workflow run pages-release.yml --ref main -f company_intelligence_off=true');
 assert.ok(d>=0&&d<rb&&rb<dis&&dis<off);
 assert.match(r,/exit "\$gate_failure"/);
});

/** Fuehrt den Handler-Text unter bash aus. decisionExit: Exit-Code der Entscheidung. Rueckgabe: Aufrufprotokoll und Exit-Code. */
function runHandler(runText,{decisionExit,rollbackExit=0,disableExit=0,good='good-gen-1'}){
 const dir=mkdtempSync(join(tmpdir(),'pages-handler-')),log=join(dir,'log');
 try{
  const node=`#!/bin/bash\necho "node $*" >> "${log}"\ncase "$*" in\n *pages-rollback-decision*) exit ${decisionExit};;\n *refresh-run.mjs*) exit ${rollbackExit};;\n *production-release.mjs*) exit ${disableExit};;\nesac\nexit 0\n`;
  const gh=`#!/bin/bash\necho "gh $*" >> "${log}"\nexit 0\n`;
  for(const [n,c] of [['node',node],['gh',gh]]){writeFileSync(join(dir,n),c);chmodSync(join(dir,n),0o755);}
  const res=spawnSync('bash',['-e','-c',runText],{encoding:'utf8',env:{PATH:dir+':'+process.env.PATH,GOOD_GENERATION:good},cwd:dir});
  let calls=[];try{calls=readFileSync(log,'utf8').trim().split('\n');}catch{/* keine Aufrufe */}
  return {status:res.status,calls};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const has=(calls,needle)=>calls.some(c=>c.includes(needle));

const handlerScenarios={
 gateAlreadyDisabledOnlyDisable(run){
  const r=runHandler(run,{decisionExit:1});
  assert.ok(!has(r.calls,'refresh-run.mjs'),'kein Rollback');
  assert.ok(has(r.calls,'production-release.mjs disable'),'disable laeuft');
  assert.ok(has(r.calls,'gh workflow run pages-release.yml --ref main -f company_intelligence_off=true'),'OFF-Dispatch laeuft');
  assert.equal(r.status,0,'Entscheidung allein macht den Schritt nicht rot (Job bleibt ueber die Fehlschritte rot)');
 },
 gateAvailableOwnFailureRollsBack(run){
  const r=runHandler(run,{decisionExit:0});
  assert.deepEqual(r.calls.map(c=>c.split(' ').slice(0,c.startsWith('gh')?4:3).join(' ')),[
   'node scripts/company_intelligence/pages-rollback-decision.mjs',
   'node scripts/company_intelligence/refresh-run.mjs rollback',
   'node scripts/company_intelligence/production-release.mjs disable',
   'gh workflow run pages-release.yml'],'Reihenfolge: Entscheidung, Rollback, disable, OFF-Dispatch');
 },
 rollbackPassesGoodGenerationAsExpectGeneration(run){
  const r=runHandler(run,{decisionExit:0,good:'good-gen-1'});
  assert.ok(r.calls.some(c=>c==='node scripts/company_intelligence/refresh-run.mjs rollback --expect-generation good-gen-1'),r.calls.join('|'));
  const none=runHandler(run,{decisionExit:0,good:''});
  assert.ok(none.calls.some(c=>c==='node scripts/company_intelligence/refresh-run.mjs rollback'),'ohne bekannte GOOD-Generation: Rollback wie bisher, ohne Argument');
 },
 rollbackFailurePropagatesButDispatchStillRuns(run){
  const r=runHandler(run,{decisionExit:0,rollbackExit:3});
  assert.equal(r.status,3);assert.ok(has(r.calls,'production-release.mjs disable')&&has(r.calls,'-f company_intelligence_off=true'));
 },
 disableFailurePropagates(run){
  const r=runHandler(run,{decisionExit:1,disableExit:4});
  assert.equal(r.status,4);assert.ok(has(r.calls,'-f company_intelligence_off=true'));assert.ok(!has(r.calls,'refresh-run.mjs'));
 }
};
for(const [name,fn] of Object.entries(handlerScenarios))test('Handler-Ausfuehrung: '+name,()=>fn(handler.run));

/* --- Mutationstests --- */
const DEC='node scripts/company_intelligence/pages-rollback-decision.mjs';
const mutants={
 'Rollback wieder unbedingt':r=>r.replace('if '+DEC+'; then','if true; then'),
 'CAS-Argument entfaellt':r=>r.replace('args+=(--expect-generation "$GOOD_GENERATION")','args+=()'),
 'Entscheidung invertiert':r=>r.replace('if '+DEC+'; then','if ! '+DEC+'; then'),
 'disable nur im Rollback-Zweig':r=>r.replace('node scripts/company_intelligence/production-release.mjs disable || gate_failure=$?','if '+DEC+'; then node scripts/company_intelligence/production-release.mjs disable || gate_failure=$?; fi'),
 'OFF-Dispatch entfaellt bei geschlossenem Gate':r=>r.replace('gh workflow run pages-release.yml --ref main -f company_intelligence_off=true','if '+DEC+'; then gh workflow run pages-release.yml --ref main -f company_intelligence_off=true; fi')
};
for(const [name,mutate] of Object.entries(mutants)){
 test('Mutation erkannt: '+name,()=>{
  const mutated=mutate(handler.run);
  assert.notEqual(mutated,handler.run,'Mutation wurde nicht angewendet');
  let failed=0;
  for(const fn of Object.values(handlerScenarios)){try{fn(mutated);}catch{failed++;}}
  assert.ok(failed>0,'Mutant ueberlebt: '+name);
 });
}

test('Mutation erkannt: naive Regel (nur Gate AVAILABLE) wuerde im Fall PRODUCTION_GATE_CHANGED_AFTER_PACKAGE zurueckrollen, die echte nicht',()=>{
 const naive=({approvedEnabled,gate})=>approvedEnabled==='true'&&gate?.gateState==='AVAILABLE'?'ROLLBACK':'DISABLE_ONLY';
 assert.equal(pagesRollbackDecision({approvedOutcome:'failure',approvedEnabled:'true',gate:AV}).decision,'DISABLE_ONLY');
 assert.equal(naive({approvedEnabled:'true',gate:AV}),'ROLLBACK');
});

test('Refresh-Variante: Rollback nur bei AVAILABLE; Pages-Handler hat das Gate schon geschlossen -> kein zweiter Rollback',()=>{
 assert.equal(refreshRollbackDecision({gate:AV}).decision,'ROLLBACK');
 for(const gateState of ['DISABLED','STAGED'])assert.equal(refreshRollbackDecision({gate:{gateState}}).decision,'DISABLE_ONLY',gateState);
 for(const gate of [null,{},{gateState:null,gateReason:'GATE_READ_FAILED'},{gateState:'WEIRD'}])assert.equal(refreshRollbackDecision({gate}).decision,'DISABLE_ONLY');
});

test('Gate-Lesung: Lesefehler wird 3 Mal versucht (Backoff), klarer Zustand nie wiederholt; danach DISABLE_ONLY samt Warnung',async()=>{
 const sleeps=[],sleep=async ms=>{sleeps.push(ms);};
 let n=0;
 const flaky=async()=>(++n<3?{gateState:null,gateReason:'GATE_READ_FAILED'}:AV);
 const g=await readGateWithRetry(flaky,{sleep});
 assert.equal(g.gateState,'AVAILABLE');assert.equal(g.attempts,3);assert.deepEqual(sleeps,[1000,3000]);
 let m=0;const closed=async()=>{m++;return {gateState:'DISABLED'};};
 assert.equal((await readGateWithRetry(closed,{sleep})).attempts,1);assert.equal(m,1);
 let k=0;const invalid=async()=>{k++;return {gateState:null,gateReason:'GATE_INVALID'};};
 await readGateWithRetry(invalid,{sleep});assert.equal(k,1,'ungueltig ist kein Lesefehler');
 const env={APPROVED_OUTCOME:'success',APPROVED_ENABLED:'true'};
 let j=0;const down=async()=>{j++;return {gateState:null,gateReason:'GATE_READ_FAILED'};};
 for(const mode of ['pages','refresh']){
  j=0;const d=await decisionFromEnv(env,down,{mode,sleep});
  assert.equal(d.decision,'DISABLE_ONLY');assert.equal(j,3);assert.match(d.warning,/GOOD-Zeiger kann der Produktion vorauslaufen/);
 }
 const ok=await decisionFromEnv(env,async()=>AV,{sleep});assert.equal(ok.warning,undefined);
});

test('Workflow Pages: GOOD-Generation (nicht die Gate-Generation) wird im Schritt approved ausgelesen und ausgegeben',()=>{
 const approved=steps.find(s=>s.id==='approved');
 assert.match(approved.run,/activeGood\(driver\)/);
 assert.match(approved.run,/good_generation=\$\{good\.generation\}/);
 assert.doesNotMatch(approved.run,/good_generation=\$\{approval\./,'nicht approval.consumerGeneration');
});
