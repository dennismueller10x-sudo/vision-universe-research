/* Workflow-Vertrag des Fail-closed-Handlers im Job company-intelligence-live (pages-release.yml).
 * Das echte YAML wird geparst (abhaengigkeitsfreier Teilmengen-Parser tests/helpers/workflow-yaml.mjs) und Schritt fuer Schritt mit dem echten Klassifikator simuliert:
 * Bedingungen, Reihenfolge, Umgebung. Kein Workflow-Lauf; der erste echte Nachweis ist der naechste Pages-Lauf nach dem Merge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {classify,readReport} from '../classify-live-failure.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const file=process.env.CI_LIVE_FAILURE_TEST_WORKFLOW||fileURLToPath(new URL('../../../.github/workflows/pages-release.yml',import.meta.url));
const wf=loadYamlFile(file),job=wf.jobs['company-intelligence-live'],steps=job.steps;
const byId=id=>steps.find(s=>s.id===id);
const byName=re=>steps.find(s=>re.test(s.name||''));
const index=s=>steps.indexOf(s);
const handler=byName(/^Fail-closed persistent consumer gate/),offStop=byName(/^Fail-closed gate close in OFF mode/),conclude=byName(/^Conclude live verification/),record=byName(/^Record actual verified publication/),upload=steps.find(s=>String(s.uses).startsWith('actions/upload-artifact'));

/* --- minimaler GitHub-Ausdrucksauswerter (nur die im Job verwendeten Konstrukte; unbekanntes wirft) --- */
function evalIf(expression,ctx){
 if(expression==null)return true;
 let src=String(expression).trim().replace(/^\$\{\{\s*|\s*\}\}$/g,'');
 const strings=[];src=src.replace(/'([^']*)'/g,(_,s)=>`__S${strings.push(s)-1}__`);
 assert.match(src.replace(/__S\d+__/g,''),/^[\w\s.&|!=()]*$/,'nicht unterstuetzter Ausdruck: '+expression);
 const has=/\b(always|failure|success|cancelled)\s*\(/.test(src);
 src=src.replace(/__S(\d+)__/g,(_,i)=>JSON.stringify(strings[i]));
 const run=Function('steps','inputs','always','failure','success','cancelled',`"use strict";return (${src});`);
 const value=run(ctx.steps,ctx.inputs,()=>true,()=>ctx.jobFailed,()=>!ctx.jobFailed,()=>false);
 return has?!!value:(!ctx.jobFailed&&!!value);
}
const outputsOf=o=>new Proxy(o,{get:(t,k)=>k in t?t[k]:''});
/**
 * scenario: {inputsOff, approved:{outcome,prepared,enabled}, results:{deps,gate_off,live,record,...}, reports:{live,off}, retry:'PASS'|'FAIL'|'SKIPPED'|'CRASH', pre:{}}
 * Rueckgabe: {ran:Set(Name/Id), jobFailed, outputs}
 */
function simulate(s){
 const state={},ran=new Set();let jobFailed=false;
 const ctx={inputs:{company_intelligence_off:!!s.inputsOff},get jobFailed(){return jobFailed;},
  steps:new Proxy(state,{get:(t,k)=>t[k]||{outcome:'',conclusion:'',outputs:outputsOf({})}})};
 for(const step of steps){
  const key=step.id||step.name||step.uses;
  if(!evalIf(step.if,ctx)){if(step.id)state[step.id]={outcome:'skipped',conclusion:'skipped',outputs:outputsOf({})};continue;}
  ran.add(key);
  let outcome='success',outputs={};
  if(step.id==='approved'){outcome=s.approved.outcome;outputs={prepared:s.approved.prepared,enabled:s.approved.enabled,started_at:'1'};}
  else if(step.id==='classify'){
   const qa=ctx.steps.approved.outputs.enabled==='true'?'live':'off';
   const c=classify({depsOutcome:ctx.steps.deps.outcome,qaOutcome:qa==='live'?ctx.steps.live.outcome:ctx.steps.gate_off.outcome,report:qa==='live'?s.reports?.live:s.reports?.off,expectedSha:s.expectedSha||null});
   outputs={class:c.class,reason:c.reason,qa};
  }
  else if(step.id==='retry'){outputs={result:s.retry==='CRASH'?'':s.retry};if(s.retry==='CRASH')outcome='failure';}
  else if(step.id&&s.results?.[step.id])outcome=s.results[step.id];
  else if(step===handler)outcome=s.results?.handler||'success';
  else if(step===conclude)outcome=/\nexit 0\s*$/m.test(step.run)||!/\nexit [1-9]\d*\s*$/m.test(step.run)?'success':'failure'; // Ergebnis aus dem run-Text
  else if(s.results?.[step.name||step.uses])outcome=s.results[step.name||step.uses];
  state[step.id||'_'+index(step)]={outcome,conclusion:step['continue-on-error']&&outcome==='failure'?'success':outcome,outputs:outputsOf(outputs)};
  if(step.id)state[step.id]=state['_'+index(step)]=state[step.id];
  if(outcome==='failure'&&!step['continue-on-error'])jobFailed=true;
 }
 return {ran,jobFailed,state};
}
const stale={status:'FAIL',cause:'AUSLIEFERUNG_NICHT_PROPAGIERT',propagation:{status:'NOT_PROPAGATED',cause:'AUSLIEFERUNG_NICHT_PROPAGIERT',attempts:[{n:1,ok:false,failed:[{name:'release-id',ok:false,cause:'STALE'}]}]},previousFailure:null};
const browser={status:'FAIL',cause:'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION',propagation:{status:'PROPAGATED'},error:{name:'AssertionError',message:'x'}};
const A=(over={})=>({outcome:'success',prepared:'true',enabled:'true',...over});
const H='Fail-closed persistent consumer gate and emergency Pages rollback';
const ranHandler=r=>r.ran.has(handler.name),ranStop=r=>r.ran.has(offStop.name);

test('Struktur: Schrittreihenfolge approved < deps < QA < classify < retry < record < Handler < Upload < Abschluss',()=>{
 const order=['approved','deps','gate_off','live','classify','retry'].map(id=>index(byId(id)));
 assert.deepEqual(order,[...order].sort((a,b)=>a-b));
 assert(index(byId('live'))<index(record)&&index(byId('retry'))<index(record)&&index(record)<index(handler)&&index(handler)<index(upload)&&index(upload)<index(conclude));
 assert(index(byId('classify'))<index(handler)&&index(byId('retry'))<index(handler),'Handler erst nach Klassifikation und Wiederholung');
});

test('Struktur: classify bekommt den erwarteten Commit',()=>{
 assert.equal(byId('classify').env.EXPECTED_PRODUCTION_SHA,'${{ needs.package.outputs.source_sha }}');
});

test('Struktur: Pruefschritte continue-on-error; classify/retry ohne R2-/GH-Geheimnisse und ohne Zustandsbefehle',()=>{
 for(const id of ['deps','gate_off','live'])assert.equal(byId(id)['continue-on-error'],true,id);
 for(const id of ['classify','retry']){
  const st=byId(id),env=Object.keys(st.env||{}),run=st.run;
  assert.equal(st['continue-on-error'],undefined);
  assert(!env.some(k=>/^VU_HISTORY_S3|^GH_TOKEN$|^GITHUB_TOKEN$/.test(k)),id+' darf keine R2-/GitHub-Zugangsdaten bekommen');
  for(const bad of ['refresh-run','production-release','gh ','workflow run','rollback','disable'])assert(!run.includes(bad),id+': '+bad);
 }
 assert.equal(handler.env.GH_TOKEN,'${{ secrets.GITHUB_TOKEN }}');
 assert.match(conclude.run,/\nexit 1\s*$/,'Abschlussschritt muss mit exit 1 enden');
});

test('Struktur: Handler-Befehle unveraendert und in alter Reihenfolge (rollback, disable, OFF-Dispatch)',()=>{
 const r=handler.run,i1=r.indexOf('refresh-run.mjs rollback'),i2=r.indexOf('production-release.mjs disable'),i3=r.indexOf('gh workflow run pages-release.yml --ref main -f company_intelligence_off=true');
 assert(i1>=0&&i2>i1&&i3>i2);assert.match(r,/exit "\$gate_failure"/);
});

test('Struktur: OFF-Schritt bekommt EXPECTED_PRODUCTION_SHA aus dem gebauten Package',()=>{
 assert.equal(byId('gate_off').env.EXPECTED_PRODUCTION_SHA,'${{ needs.package.outputs.source_sha }}');
 assert.equal(byId('live').env.EXPECTED_PRODUCTION_SHA,'${{ needs.package.outputs.source_sha }}');
 assert.equal(byId('retry').env.EXPECTED_PRODUCTION_SHA,'${{ needs.package.outputs.source_sha }}');
});

test('ADR-005: keine ${{ inputs.* }} im run-Text; Berechtigungen und Concurrency unveraendert eng',()=>{
 for(const [name,j] of Object.entries(wf.jobs))for(const s of j.steps||[]){
  assert(!/\$\{\{\s*(github\.event\.)?inputs\./.test(s.run||''),`${name}/${s.name}: inputs im run-Text`);
 }
 assert.deepEqual(job.permissions,{contents:'read',actions:'write'});
 assert.equal(job['timeout-minutes'],35);
 assert.deepEqual(wf.permissions,{contents:'read',pages:'write','id-token':'write'});
 assert.match(wf.concurrency.group,/pages-production/);assert.notEqual(wf.concurrency['cancel-in-progress'],true);
});

test('Struktur: Zeitbudget-Beginn wird im ersten Schritt festgehalten',()=>{
 assert.match(byId('approved').run,/echo "started_at=\$\(date \+%s\)" >> "\$GITHUB_OUTPUT"/);
 assert.equal(byId('retry').env.STARTED_AT,'${{ steps.approved.outputs.started_at }}');
});

test('Szenario: alles besteht -> kein classify, kein Handler, Job gruen',()=>{
 const r=simulate({approved:A(),results:{}});
 assert(!r.ran.has('classify')&&!ranHandler(r)&&!r.ran.has(conclude.name));assert.equal(r.jobFailed,false);
 assert(r.ran.has(record.name));
});

test('Szenario: Live-QA scheitert REAL (Browser-Assertion) -> keine Wiederholung, sofort Rollback wie bisher, Job rot',()=>{
 const r=simulate({approved:A(),results:{live:'failure'},reports:{live:browser}});
 assert.equal(r.state.classify.outputs.class,'REAL');
 assert(!r.ran.has('retry'));assert(ranHandler(r));assert(r.ran.has(conclude.name));assert.equal(r.jobFailed,true);assert(!r.ran.has(record.name));
});

test('Szenario: Live-QA scheitert ohne Bericht (unbekannt) -> REAL, Rollback',()=>{
 const r=simulate({approved:A(),results:{live:'failure'},reports:{live:null}});
 assert.equal(r.state.classify.outputs.class,'REAL');assert(!r.ran.has('retry'));assert(ranHandler(r));assert.equal(r.jobFailed,true);
});

test('Szenario: Auslieferung nicht propagiert, Wiederholung besteht -> KEIN Rollback, Record laeuft, Job gruen',()=>{
 const r=simulate({approved:A(),results:{live:'failure'},reports:{live:stale},retry:'PASS'});
 assert.equal(r.state.classify.outputs.class,'TRANSIENT_PROPAGATION');
 assert(r.ran.has('retry'));assert(!ranHandler(r));assert(!r.ran.has(conclude.name));assert(r.ran.has(record.name));assert.equal(r.jobFailed,false);
});

test('Szenario: Auslieferung nicht propagiert, Wiederholung scheitert/uebersprungen/abgestuerzt -> bisheriger Fail-closed-Pfad',()=>{
 for(const retry of ['FAIL','SKIPPED','CRASH']){
  const r=simulate({approved:A(),results:{live:'failure'},reports:{live:stale},retry});
  assert(r.ran.has('retry'),retry);assert(ranHandler(r),retry);assert(r.ran.has(conclude.name),retry);assert.equal(r.jobFailed,true,retry);assert(!r.ran.has(record.name),retry);
 }
});

const lazy503=()=>({status:'FAIL',cause:'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION',sourceCommit:'abc',propagation:{status:'PROPAGATED'},error:{name:'TimeoutError'},
 browserDiagnostics:{console:['LAZY_SCRIPT_FAILED:/discover/engines/narrative.js'],pageErrors:[],failed:[],http:[{url:'/discover/engines/narrative.js',status:503,headers:{'content-type':'text/html'}}],truncated:{}},pageState:{scriptResourcesSuspicious:[]}});

test('Szenario: einzelnes 503 auf Lazy-Skript im Browser -> Wiederholung; PASS ohne Rollback, FAIL mit Rollback',()=>{
 /* classify bekommt im Test keinen erwarteten Commit -> REAL; daher Klassifikation direkt mit Commit pruefen und Ausgabe vorgeben */
 assert.match(byId('classify').env.EXPECTED_PRODUCTION_SHA,/source_sha/);
 assert.match(byId('retry').if,/TRANSIENT_BROWSER_HTTP/);
 const sim=retry=>simulate({approved:A(),results:{live:'failure'},reports:{live:lazy503()},retry,expectedSha:'abc'});
 let r=sim('PASS');
 assert.equal(r.state.classify.outputs.class,'TRANSIENT_BROWSER_HTTP');
 assert(r.ran.has('retry')&&!ranHandler(r)&&!r.jobFailed&&r.ran.has(record.name));
 r=sim('FAIL');
 assert(ranHandler(r)&&r.jobFailed&&!r.ran.has(record.name));
 /* 403 zusaetzlich -> REAL, keine Wiederholung */
 const rep=lazy503();rep.browserDiagnostics.http.push({url:'/x.json',status:403,headers:{'content-type':'text/html'}});
 r=simulate({approved:A(),results:{live:'failure'},reports:{live:rep},retry:'PASS',expectedSha:'abc'});
 assert(!r.ran.has('retry')&&ranHandler(r)&&r.jobFailed);
});

test('Szenario: Browser-Installation scheitert (Infra), Wiederholung besteht / scheitert',()=>{
 let r=simulate({approved:A(),results:{deps:'failure'},retry:'PASS'});
 assert.equal(r.state.classify.outputs.class,'TRANSIENT_INFRA');
 assert(!r.ran.has('live')&&!r.ran.has('gate_off'));assert(r.ran.has('retry'));assert(!ranHandler(r));assert(r.ran.has(record.name));assert.equal(r.jobFailed,false);
 r=simulate({approved:A(),results:{deps:'failure'},retry:'FAIL'});
 assert(ranHandler(r));assert.equal(r.jobFailed,true);assert(!r.ran.has(record.name));
});

test('Struktur: OFF-Zweig fuehrt NUR production-release disable aus (kein Rollback, kein Dispatch)',()=>{
 assert.equal(offStop.run.trim(),'node scripts/company_intelligence/production-release.mjs disable');
 assert.equal(offStop.env.GH_TOKEN,undefined);assert(index(handler)<index(offStop)&&index(offStop)<index(upload));
 assert.match(offStop.if,/enabled != 'true'/);assert.match(offStop.if,/company_intelligence_off != true/);
});

test('Szenario OFF-Modus: kein Rollback, kein Dispatch; disable bei REAL oder gescheiterter Wiederholung; Job rot',()=>{
 const off=A({enabled:'false'});
 /* REAL (Browser-Assertion / Bericht fehlt): kein Retry, disable, Job rot */
 for(const report of [browser,null]){
  const r=simulate({approved:off,results:{gate_off:'failure'},reports:{off:report}});
  assert.equal(r.state.classify.outputs.class,'REAL');assert.equal(r.state.classify.outputs.qa,'off');
  assert(!r.ran.has('retry')&&!ranHandler(r)&&ranStop(r)&&r.ran.has(conclude.name));assert.equal(r.jobFailed,true);
 }
 /* transient: Retry PASS -> weder disable noch Rollback, Job gruen */
 let r=simulate({approved:off,results:{gate_off:'failure'},reports:{off:stale},retry:'PASS'});
 assert(r.ran.has('retry')&&!ranHandler(r)&&!ranStop(r)&&!r.ran.has(conclude.name));assert.equal(r.jobFailed,false);
 r=simulate({approved:off,results:{deps:'failure'},retry:'PASS'});
 assert(!ranHandler(r)&&!ranStop(r)&&!r.jobFailed);
 /* transient: Retry FAIL/SKIPPED/CRASH -> disable, kein Rollback, Job rot */
 for(const retry of ['FAIL','SKIPPED','CRASH']){
  for(const results of [{gate_off:'failure'},{deps:'failure'}]){
   r=simulate({approved:off,results,reports:{off:stale},retry});
   assert(!ranHandler(r)&&ranStop(r)&&r.ran.has(conclude.name),retry+JSON.stringify(results));assert.equal(r.jobFailed,true);
  }
 }
 /* Notaus-Dispatch (inputs=true): Gate wurde dort schon geschlossen; kein Handler, kein disable, Job rot */
 r=simulate({inputsOff:true,approved:off,results:{gate_off:'failure'},reports:{off:browser}});
 assert(!ranHandler(r)&&!ranStop(r)&&r.jobFailed);
 /* OFF-Pruefung laeuft nur im OFF-Modus; Aktiv-Modus nie der OFF-Zweig */
 assert(!simulate({approved:off,results:{}}).ran.has('live'));
 assert(!simulate({approved:A(),results:{}}).ran.has('gate_off'));
 r=simulate({approved:A(),results:{live:'failure'},reports:{live:browser}});
 assert(ranHandler(r)&&!ranStop(r));
});

test('Szenario: approved scheitert (Modus unbekannt) -> bisheriger Pfad; mit Notaus-Eingabe kein Handler',()=>{
 let r=simulate({approved:A({outcome:'failure',enabled:''}),results:{}});
 assert(ranHandler(r));assert(!ranStop(r));assert(!r.ran.has('classify'));assert.equal(r.jobFailed,true);
 r=simulate({inputsOff:true,approved:A({outcome:'failure',enabled:''}),results:{}});
 assert(!ranHandler(r));assert.equal(r.jobFailed,true);
});

test('Szenario: Notaus-Eingabe bei aktivem Verbraucher (unmoeglich) bleibt ohne Handler wie bisher',()=>{
 const r=simulate({inputsOff:true,approved:A(),results:{live:'failure'},reports:{live:browser}});
 assert(!ranHandler(r));assert.equal(r.jobFailed,true);
});

test('Szenario: Fehler nach bestandener QA (Record scheitert) bleibt fail-closed: Rollback',()=>{
 const r=simulate({approved:A(),results:{[record.name]:'failure'}});
 assert(ranHandler(r));assert.equal(r.jobFailed,true);
});

test('Szenario: Vorbereitung nicht erfolgt (prepared leer) -> nichts davon laeuft',()=>{
 const r=simulate({approved:A({prepared:'',enabled:''}),results:{}});
 for(const k of ['deps','classify','retry',handler.name,offStop.name,conclude.name])assert(!r.ran.has(k),k);
});

test('Szenario REAL bleibt REAL ueber Sicherheits-/Datenfehler-Berichte (nie Wiederholung)',()=>{
 const reals=[browser,{...browser,error:{message:'WRONG_PRODUCTION_COMMIT'}},{...browser,error:{message:'sha256 mismatch'}},
  {...stale,propagation:{...stale.propagation,attempts:[{n:1,ok:false,failed:[{cause:'HTTP_403'}]}]}},
  {...stale,propagation:{...stale.propagation,attempts:[{n:1,ok:false,failed:[{cause:'INVALID'}]}]}},
  {...stale,previousFailure:'x'},{status:'PASS'},null,{}];
 for(const rep of reals)for(const [enabled,key,res] of [['true','live','live'],['false','off','gate_off']]){
  const r=simulate({approved:A({enabled}),results:{[res]:'failure'},reports:{[key]:rep},retry:'PASS'});
  assert(!r.ran.has('retry'),JSON.stringify(rep));assert.equal(r.jobFailed,true);
  assert.equal(ranHandler(r),enabled==='true');assert.equal(ranStop(r),enabled!=='true');
 }
});

test('Skripte des ersten Versuchs sind die aus dem Workflow referenzierten Dateien',()=>{
 assert.equal(byId('deps').run,'bash scripts/company_intelligence/live-browser-setup.sh');
 assert.equal(byId('live').run,'bash scripts/company_intelligence/live-qa-suite.sh');
 assert.equal(byId('gate_off').run,'node scripts/company_intelligence/production-off-qa.mjs');
 assert.equal(typeof readReport,'function');
});
