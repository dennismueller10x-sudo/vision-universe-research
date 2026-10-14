import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetries,attemptCommands,budget,needSeconds,DEFAULTS,JOB_TIMEOUT_S} from '../retry-live-qa.mjs';
import {CLASSES} from '../classify-live-failure.mjs';

const P=CLASSES.PROPAGATION,I=CLASSES.INFRA,REAL=CLASSES.REAL;
const staleReport={status:'FAIL',cause:'AUSLIEFERUNG_NICHT_PROPAGIERT',propagation:{status:'NOT_PROPAGATED',cause:'AUSLIEFERUNG_NICHT_PROPAGIERT',attempts:[{n:1,ok:false,failed:[{name:'release-id',ok:false,cause:'STALE'}]}]},previousFailure:null};
const browserReport={status:'FAIL',cause:'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION',propagation:{status:'PROPAGATED'}};
const scripted=(...results)=>{const calls=[];return {calls,attempt:async a=>{calls.push(a);return results[calls.length-1]??{ok:false,report:null};}};};
const T0=1_000_000,clock=(...offsets)=>{let i=0;return ()=>T0+(offsets[Math.min(i++,offsets.length-1)]);};

test('Propagation: eine Wiederholung, besteht -> PASS',async()=>{
 const s=scripted({ok:true});
 const r=await runRetries({cls:P,qa:'live',startedAtS:T0,now:clock(600),attempt:s.attempt});
 assert.equal(r.result,'PASS');assert.equal(s.calls.length,1);assert.equal(s.calls[0].cls,P);
});

test('Propagation: bleibt nicht propagiert -> nur EINE Wiederholung, dann FAIL (Handler laeuft)',async()=>{
 const s=scripted({ok:false,report:staleReport},{ok:true});
 const r=await runRetries({cls:P,qa:'live',startedAtS:T0,now:clock(600),attempt:s.attempt});
 assert.equal(r.result,'FAIL');assert.equal(s.calls.length,1);assert.equal(r.reason,'RETRIES_EXHAUSTED');
});

test('Wiederholung wird REAL (Browser-Assertion nach Propagation, Bericht fehlt) -> sofort FAIL/REAL, keine weitere',async()=>{
 for(const report of [browserReport,null,{status:'PASS'}]){
  const s=scripted({ok:false,report},{ok:true},{ok:true});
  const r=await runRetries({cls:I,qa:'live',startedAtS:T0,now:clock(100),sleep:async()=>{},attempt:s.attempt});
  assert.equal(r.result,'FAIL');assert.equal(r.finalClass,REAL);assert.equal(s.calls.length,1);
 }
});

test('Infra: bis zu zwei Versuche, Pause dazwischen; erster Versuch scheitert weiter an Installation',async()=>{
 const sleeps=[];
 let s=scripted({ok:false,depsFailed:true},{ok:true});
 let r=await runRetries({cls:I,qa:'live',startedAtS:T0,now:clock(100),sleep:async ms=>sleeps.push(ms),attempt:s.attempt});
 assert.equal(r.result,'PASS');assert.equal(s.calls.length,2);assert.deepEqual(sleeps,[DEFAULTS.pauseInfraS*1000]);
 s=scripted({ok:false,depsFailed:true},{ok:false,depsFailed:true},{ok:true});
 r=await runRetries({cls:I,qa:'live',startedAtS:T0,now:clock(100),sleep:async()=>{},attempt:s.attempt});
 assert.equal(r.result,'FAIL');assert.equal(r.finalClass,I);assert.equal(s.calls.length,2);
});

test('Infra-Wiederholung scheitert danach an Auslieferung: zweiter Versuch ohne Installation (Klasse wechselt)',async()=>{
 const s=scripted({ok:false,report:staleReport},{ok:true});
 const r=await runRetries({cls:I,qa:'live',startedAtS:T0,now:clock(100),sleep:async()=>{},attempt:s.attempt});
 assert.equal(r.result,'PASS');assert.deepEqual(s.calls.map(c=>c.cls),[I,P]);
});

test('Zeitbudget: zu wenig Restzeit -> SKIPPED, kein Versuch (fail-closed laeuft der Handler wie bisher)',async()=>{
 const s=scripted({ok:true});
 const late=JOB_TIMEOUT_S-60;
 const r=await runRetries({cls:P,qa:'live',startedAtS:T0,now:clock(late),attempt:s.attempt});
 assert.equal(r.result,'SKIPPED');assert.equal(s.calls.length,0);assert.match(r.reason,/NO_TIME_BUDGET/);
 /* Vollabnahme braucht mehr Zeit als Routine */
 const edge=JOB_TIMEOUT_S-(needSeconds(P,{qa:'live',full:false})+DEFAULTS.handlerReserveS)-1;
 assert.equal(budget({nowS:T0+edge,startedAtS:T0,cls:P,qa:'live',full:false}).ok,true);
 assert.equal(budget({nowS:T0+edge,startedAtS:T0,cls:P,qa:'live',full:true}).ok,false);
 assert.equal(budget({nowS:T0+edge+2,startedAtS:T0,cls:P,qa:'live',full:false}).ok,false);
});

test('QA-Budget der Wiederholung laesst die Handler-Reserve frei',()=>{
 const b=budget({nowS:T0+600,startedAtS:T0,cls:P,qa:'live',full:false});
 assert.equal(b.qaBudgetMs,(JOB_TIMEOUT_S-600-DEFAULTS.handlerReserveS)*1000);
});

test('REAL/unbekannte Klasse wird nie wiederholt',async()=>{
 for(const cls of [REAL,'',undefined,'TRANSIENT_ALL','transient_infra']){
  const s=scripted({ok:true});
  const r=await runRetries({cls,qa:'live',startedAtS:T0,now:clock(0),attempt:s.attempt});
  assert.equal(r.result,'SKIPPED');assert.equal(s.calls.length,0);
 }
});

test('Ausnahme im Versuch zaehlt als Fehlschlag/REAL, nicht als Erfolg',async()=>{
 const r=await runRetries({cls:P,qa:'live',startedAtS:T0,now:clock(100),attempt:async()=>{throw new Error('boom');}});
 assert.equal(r.result,'FAIL');assert.equal(r.finalClass,REAL);
});

test('Versuchsbefehle enthalten nur Installation und QA - keinen zustandsaendernden Befehl',()=>{
 for(const qa of ['live','off'])for(const installFirst of [true,false]){
  const cmds=attemptCommands({qa,installFirst});
  const text=JSON.stringify(cmds);
  for(const forbidden of ['refresh-run','production-release','gh','workflow','rollback','disable','sync-state','public-delivery','s3'])assert.equal(text.includes(forbidden),false,forbidden);
  assert.equal(cmds.at(-1).kind,'qa');assert.equal(cmds.some(c=>c.kind==='deps'),installFirst);
 }
 assert.deepEqual(attemptCommands({qa:'off',installFirst:false})[0].args,['scripts/company_intelligence/production-off-qa.mjs']);
 assert.deepEqual(attemptCommands({qa:'live',installFirst:false})[0].args,['scripts/company_intelligence/live-qa-suite.sh']);
});
