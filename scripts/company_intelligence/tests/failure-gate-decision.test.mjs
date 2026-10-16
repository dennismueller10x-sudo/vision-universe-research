/* Entscheidungsfunktion des Fehlerpfads von company-intelligence-profile-source.yml (NO_ACTION | CLOSE_GATE).
 * Rein, ohne Netz und ohne R2; die Probe ist eine Eingabe. Die Workflow-Verdrahtung prueft profile-source-failure-workflow.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decide,deriveMutation,probeProduction,main,DECISION,MUTATION} from '../failure-gate-decision.mjs';

const G='gen-new',OLD='gen-old';
const health=(over={})=>({runId:'7',published:true,verification:false,consumerGeneration:G,...over});
const baseline=(over={})=>({available:true,gateState:'AVAILABLE',goodGeneration:OLD,served:{status:'FOUND',generation:OLD},...over});
const probe=(over={})=>({available:true,gateState:'AVAILABLE',goodGeneration:G,served:{status:'FOUND',generation:OLD},...over});
const ok={run:'success',dispatch:'success',served:'success',liveqa:'success',observe:'success'};
const run=(o={})=>decide({publish:true,runId:'7',health:health(),baseline:baseline(),probe:probe(),outcomes:{...ok,...o.outcomes},...o,outcomes:{...ok,...o.outcomes}});

test('Fehler vor jeder Mutation => NO_ACTION, auch ohne Probe und ohne Baseline',()=>{
 for(const outcomes of [{run:'failure',dispatch:'skipped',served:'skipped',liveqa:'skipped',observe:'skipped'},{run:'skipped'},{run:''}]){
  const r=decide({publish:true,outcomes,health:health({published:false}),probe:null});
  assert.equal(r.decision,DECISION.NONE);assert.equal(r.reason,'PRE_MUTATION_FAILURE');assert.equal(r.rollback,false);
 }
 assert.equal(decide({publish:true,outcomes:{run:'failure'},health:null}).decision,DECISION.NONE,'kein health.json: Crash vor runRefresh');
 assert.equal(decide({publish:false,outcomes:{liveqa:'failure'}}).reason,'NO_PRODUCTION_PUBLICATION','Verifikationslauf mutiert nie');
});
test('health.json eines fremden Laufs belegt keine Mutation',()=>{
 assert.equal(deriveMutation({publish:true,outcomes:{run:'failure'},health:health({runId:'99'}),runId:'7'}),MUTATION.NO);
});
test('Fehler nach Mutation mit falscher Produktionsgeneration => CLOSE_GATE (mit Rollback)',()=>{
 const r=run({outcomes:{served:'failure',liveqa:'skipped',observe:'skipped'},probe:probe({served:{status:'FOUND',generation:'gen-fremd'}})});
 assert.deepEqual([r.decision,r.reason,r.rollback],[DECISION.CLOSE,'WRONG_GENERATION_SERVED',true]);
 const absent=run({outcomes:{served:'failure'},probe:probe({served:{status:'ABSENT',generation:null}})});
 assert.equal(absent.decision,DECISION.CLOSE,'offenes Gate, aber keine Auslieferung');
});
test('Live-QA-Fehler der eigenen Veroeffentlichung => CLOSE_GATE ohne Probe-Bedarf',()=>{
 const r=decide({publish:true,runId:'7',health:health(),outcomes:{...ok,liveqa:'failure',observe:'skipped'},probe:null});
 assert.deepEqual([r.decision,r.reason,r.rollback],[DECISION.CLOSE,'OWN_PUBLICATION_LIVE_QA_FAILED',true]);
 assert.equal(run({outcomes:{liveqa:'failure'},probe:probe({served:{status:'FOUND',generation:G}})}).decision,DECISION.CLOSE,'auch wenn die Generation stimmt');
});
test('Szenario A/B: Dispatch-/Wartefehler nach eigener Mutation, Gate offen => ROLLBACK_ONLY, Gate bleibt offen',()=>{
 for(const failing of ['dispatch','served']){
  const r=run({outcomes:{[failing]:'failure',liveqa:'skipped',observe:'skipped'}});
  assert.deepEqual([r.decision,r.reason,r.rollback],[DECISION.ROLLBACK,'DELIVERY_NOT_UPDATED_POINTER_ROLLED_BACK',true],failing);
 }
 // Szenario B: Wartezeit abgelaufen, Deployment kam spaeter doch (eigene Generation ausgeliefert), Live-QA skipped bzw. cancelled
 for(const liveqa of ['skipped','cancelled']){
  const r=run({outcomes:{served:'failure',liveqa,observe:'skipped'},probe:probe({served:{status:'FOUND',generation:G}})});
  assert.deepEqual([r.decision,r.reason],[DECISION.ROLLBACK,'OWN_GENERATION_SERVED_WITHOUT_LIVE_QA_POINTER_ROLLED_BACK'],liveqa);
 }
 // Zeiger traegt nicht (mehr) unsere Generation: nie ein fremdes GOOD zurueckrollen
 const fremd=run({outcomes:{dispatch:'failure',liveqa:'skipped'},probe:probe({goodGeneration:OLD})});
 assert.deepEqual([fremd.decision,fremd.reason,fremd.rollback],[DECISION.NONE,'DELIVERY_NOT_YET_UPDATED',false]);
});
test('Szenario C: recover_full_scope oeffnet das Gate selbst, Dispatch-/Wartefehler => CLOSE_GATE',()=>{
 for(const failing of ['dispatch','served']){
  const r=run({recover:true,outcomes:{[failing]:'failure',liveqa:'skipped',observe:'skipped'},baseline:baseline({gateState:'DISABLED'}),probe:probe({served:{status:'FOUND',generation:G}})});
  assert.deepEqual([r.decision,r.reason],[DECISION.CLOSE,'RECOVERY_OPENED_GATE_WITHOUT_LIVE_QA'],failing);
 }
 // Gate war schon offen (Wiederherstellung hat es nicht geoeffnet): nur Zeiger zurueck
 const offen=run({recover:true,outcomes:{dispatch:'failure',liveqa:'skipped'},baseline:baseline()});
 assert.equal(offen.decision,DECISION.ROLLBACK);
});
test('Geschlossenes Gate, eigener ungeprueft gebliebener Zeiger => ROLLBACK_ONLY, Gate bleibt zu',()=>{
 const r=run({outcomes:{served:'failure',liveqa:'skipped'},baseline:baseline({gateState:'DISABLED'}),probe:probe({gateState:'DISABLED',served:{status:'ABSENT',generation:null}})});
 assert.deepEqual([r.decision,r.reason],[DECISION.ROLLBACK,'UNVERIFIED_OWN_POINTER_ROLLED_BACK_GATE_CLOSED']);
});
test('Observe-Fehler bei Live-QA success und ausgelieferter eigener Generation => NO_ACTION (Warnung), kein Rollback',()=>{
 const r=run({outcomes:{observe:'failure'},probe:probe({served:{status:'FOUND',generation:G}})});
 assert.deepEqual([r.decision,r.reason],[DECISION.NONE,'OWN_GENERATION_SERVED_HEALTHY']);
});
test('Geschlossenes Gate: nichts ausgeliefert => NO_ACTION (Live-QA success); Vorgaenger ohne Beleg => fail-closed',()=>{
 for(const gateState of ['DISABLED','STAGED'])assert.equal(run({outcomes:{served:'failure',liveqa:'success'},probe:probe({gateState,served:{status:'ABSENT',generation:null}}),baseline:baseline({gateState})}).reason,'GATE_ALREADY_CLOSED_NOTHING_EXPOSED');
 const noBaseline=run({outcomes:{served:'failure'},baseline:null});
 assert.equal(noBaseline.decision,DECISION.CLOSE,'ohne Basis laesst sich "unveraendert" nicht beweisen');
});
test('Probe nicht verfuegbar: nach eigener Mutation CLOSE_GATE, ohne Mutation nur Warnung',()=>{
 for(const bad of [null,{available:false,reason:'R2_PROBE_FAILED_Error'},probe({served:{status:'ERROR',generation:null}}),probe({served:{status:'UNKNOWN',generation:null}})]){
  const r=run({outcomes:{served:'failure'},probe:bad});
  assert.deepEqual([r.decision,r.reason],[DECISION.CLOSE,'PROBE_UNAVAILABLE_AFTER_OWN_MUTATION']);
 }
 const vorher=decide({publish:true,outcomes:{run:'failure'},health:health({published:false}),probe:null});
 assert.deepEqual([vorher.decision,vorher.reason],[DECISION.NONE,'PRE_MUTATION_FAILURE']);
 // Mutation nicht auszuschliessen (Abbruch, Erfolg ohne Beleg) zaehlt wie Mutation
 assert.equal(decide({publish:true,outcomes:{run:'cancelled'},health:null,probe:null}).decision,DECISION.CLOSE);
 assert.equal(decide({publish:true,outcomes:{run:'success',dispatch:'failure'},health:null,probe:null}).mutation,MUTATION.UNKNOWN);
});
test('Rollback nur, wenn der GOOD-Zeiger noch unsere Generation traegt',()=>{
 const r=run({outcomes:{served:'failure'},probe:probe({goodGeneration:'gen-fremd',served:{status:'FOUND',generation:'gen-fremd'}})});
 assert.deepEqual([r.decision,r.rollback],[DECISION.CLOSE,false]);
});
test('Der Lauf oeffnet kein Gate ohne Legitimation',()=>{
 const opened=probe({gateState:'AVAILABLE',served:{status:'FOUND',generation:G}});
 const r=run({outcomes:{observe:'failure'},baseline:baseline({gateState:'DISABLED'}),probe:opened});
 assert.deepEqual([r.decision,r.reason],[DECISION.CLOSE,'GATE_OPENED_WITHOUT_LEGITIMACY']);
 // Explizite Wiederherstellung (run erfolgreich) darf nach voller Abnahme oeffnen
 const legit=run({recover:true,outcomes:{observe:'failure'},baseline:baseline({gateState:'DISABLED'}),probe:opened});
 assert.equal(legit.decision,DECISION.NONE);
 // Wiederherstellung gescheitert (run failure) darf nie ein offenes Gate hinterlassen
 const failedRecovery=run({recover:true,outcomes:{run:'failure',dispatch:'skipped',served:'skipped',liveqa:'skipped',observe:'skipped'},baseline:baseline({gateState:'DISABLED'}),probe:opened});
 assert.equal(failedRecovery.decision,DECISION.CLOSE);
});
test('recover_full_scope bei offenem Gate: Fehler nach reinem Setup/Wiederherstellungs-Rollback schliesst nicht',()=>{
 const r=run({recover:true,outcomes:{run:'failure',dispatch:'skipped',served:'skipped',liveqa:'skipped',observe:'skipped'},probe:probe({goodGeneration:OLD})});
 assert.deepEqual([r.decision,r.reason],[DECISION.NONE,'DELIVERY_NOT_YET_UPDATED']);
});

/* --- main(): Dateien, Ausgaben, Fail-closed bei internem Fehler --- */
async function runMain(env,deps){
 const dir=mkdtempSync(join(tmpdir(),'fgd-test-')),out=join(dir,'out'),summary=join(dir,'sum');
 writeFileSync(out,'');writeFileSync(summary,'');
 const log=console.log;const lines=[];console.log=(...a)=>lines.push(a.join(' '));
 try{
  if(env.health)writeFileSync(join(dir,'health.json'),JSON.stringify(env.health));
  if(env.baseline)writeFileSync(join(dir,'baseline.json'),JSON.stringify(env.baseline));
  const result=await main(env.mode?[env.mode]:[],{REPORT_ROOT:dir,GITHUB_OUTPUT:out,GITHUB_STEP_SUMMARY:summary,PUBLISH:'true',GITHUB_RUN_ID:'7',...env.vars},deps);
  return {result,output:readFileSync(out,'utf8'),summary:readFileSync(summary,'utf8'),lines,dir};
 }finally{console.log=log;}
}
test('main: Fehler vor Mutation liest weder R2 noch Netz und gibt NO_ACTION samt Warnung aus',async()=>{
 const r=await runMain({health:health({published:false}),vars:{OUTCOME_RUN:'failure',OUTCOME_DISPATCH:'skipped'}},{probe:async()=>{throw Error('Probe darf nicht laufen');},driverFactory:async()=>{throw Error('kein Treiber');}});
 assert.match(r.output,/decision=NO_ACTION\nreason=PRE_MUTATION_FAILURE\nrollback=false/);
 assert(r.lines.some(l=>l.startsWith('::warning::')));assert.match(r.summary,/NO_ACTION/);rmSync(r.dir,{recursive:true});
});
test('main: Live-QA-Fehler => CLOSE_GATE, Ausgaben fuer den Schliess-Schritt',async()=>{
 const r=await runMain({health:health(),vars:{OUTCOME_RUN:'success',OUTCOME_DISPATCH:'success',OUTCOME_SERVED:'success',OUTCOME_LIVEQA:'failure',OUTCOME_OBSERVE:'skipped'}},{probe:async()=>{throw Error('unnoetig');}});
 assert.match(r.output,/decision=CLOSE_GATE\nreason=OWN_PUBLICATION_LIVE_QA_FAILED\nrollback=true/);
 assert(r.lines.some(l=>l.startsWith('::error::')));rmSync(r.dir,{recursive:true});
});
test('main: Probe wirft nach eigener Mutation => fail-closed; Probe wirft ohne Mutation => NO_ACTION',async()=>{
 const post=await runMain({health:health(),vars:{OUTCOME_RUN:'success',OUTCOME_SERVED:'failure'}},{probe:async()=>{throw Error('R2 down');}});
 assert.match(post.output,/decision=CLOSE_GATE\nreason=DECISION_ERROR_FAIL_CLOSED_Error/);rmSync(post.dir,{recursive:true});
 const pre=await runMain({vars:{OUTCOME_RUN:'failure'}},{probe:async()=>{throw Error('R2 down');}});
 assert.match(pre.output,/decision=NO_ACTION/);rmSync(pre.dir,{recursive:true});
});
test('main: Dispatch-Fehler bei unveraenderter Auslieferung => ROLLBACK_ONLY, Gate bleibt offen',async()=>{
 const r=await runMain({health:health(),baseline:baseline(),vars:{OUTCOME_RUN:'success',OUTCOME_DISPATCH:'failure'}},{probe:async()=>probe()});
 assert.match(r.output,/decision=ROLLBACK_ONLY\nreason=DELIVERY_NOT_UPDATED_POINTER_ROLLED_BACK\nrollback=true\ngeneration=gen-new/);rmSync(r.dir,{recursive:true});
});
test('main baseline: schreibt baseline.json, auch wenn die Probe nicht verfuegbar ist',async()=>{
 const r=await runMain({mode:'baseline'},{probe:async()=>({available:false,reason:'GATE_MISSING'})});
 assert(existsSync(join(r.dir,'baseline.json')));assert.equal(JSON.parse(readFileSync(join(r.dir,'baseline.json'),'utf8')).available,false);rmSync(r.dir,{recursive:true});
});

/* --- probeProduction: nur lesend, wirft nie --- */
test('probeProduction: Gate fehlt / Treiber wirft => available=false; es wird nur gelesen',async()=>{
 const calls=[];
 const driver={get:async k=>{calls.push('get');return null;},put:async()=>{throw Error('SCHREIBZUGRIFF');},delete:async()=>{throw Error('SCHREIBZUGRIFF');}};
 const missing=await probeProduction({driver,fetcher:async()=>{throw Error('kein Netz');}});
 assert.equal(missing.available,false);assert.equal(missing.reason,'GATE_MISSING');
 const broken=await probeProduction({driver:{get:async()=>{throw Error('down');}},fetcher:async()=>{throw Error('x');}});
 assert.equal(broken.available,false);assert.equal(broken.reason,"GATE_READ_FAILED");
 assert(calls.length>0);
});
