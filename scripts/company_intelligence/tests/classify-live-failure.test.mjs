import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classify,classifyReport,isDeliveryCause,main,CLASSES,PROPAGATION_CAUSE} from '../classify-live-failure.mjs';
import {verifyPropagation,CAUSE} from '../propagation-proof.mjs';

const T_PROP=CLASSES.PROPAGATION,T_INFRA=CLASSES.INFRA,REAL=CLASSES.REAL;
const check=(name,cause,detail='x')=>({name,ok:false,cause,detail,status:null,headers:{}});
/* Bericht im Format von live-production-qa.mjs / production-off-qa.mjs (PropagationError-Pfad, brief()). */
const propagationReport=(failed,extra={},prop={})=>({status:'FAIL',cause:CAUSE,origin:'https://research.visionuniverse.de',propagation:{status:'NOT_PROPAGATED',cause:CAUSE,message:'x',attemptCount:2,
 attempts:[{n:1,atMs:0,ok:false,observed:{},failed},{n:2,atMs:5000,ok:false,observed:{},failed}],...prop},previousFailure:null,...extra});
const browserReport=(over={})=>({status:'FAIL',cause:'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION',origin:'https://research.visionuniverse.de',propagation:{status:'PROPAGATED'},error:{name:'AssertionError',message:'x'},...over});
const run=(report,qa='failure',deps='success')=>classify({depsOutcome:deps,qaOutcome:qa,report});

test('Konstante stimmt mit propagation-proof ueberein',()=>assert.equal(PROPAGATION_CAUSE,CAUSE));

test('TRANSIENT_INFRA: nur wenn der Installationsschritt gescheitert ist (kein Bericht noetig)',()=>{
 assert.equal(classify({depsOutcome:'failure',qaOutcome:'skipped',report:null}).class,T_INFRA);
 assert.equal(classify({depsOutcome:'failure',qaOutcome:'',report:browserReport()}).class,T_INFRA);
});

test('TRANSIENT_PROPAGATION: nicht ausgeliefert, alle fehlgeschlagenen Pruefungen sind Auslieferungsursachen',()=>{
 for(const causes of [['STALE'],['MIXED'],['MISSING'],['REQUEST_FAILED'],['HTTP_503'],['HTTP_500'],['HTTP_429'],['STALE','MIXED','SKIPPED'],['HTTP_502','REQUEST_FAILED']]){
  const r=run(propagationReport(causes.map((c,i)=>check('c'+i,c))));
  assert.equal(r.class,T_PROP,causes.join());
 }
});

test('echter Bericht aus verifyPropagation (veraltetes CDN, Obergrenze erreicht) -> TRANSIENT_PROPAGATION',async()=>{
 let t=0;const now=()=>t,sleep=async ms=>{t+=ms;};
 const fetchImpl=async()=>new Response('{}',{status:503});
 const p=await verifyPropagation({origin:'https://x.test',expectedSha:'a'.repeat(40),maxMs:20000,fetchImpl,sleep,now});
 assert.equal(p.status,'NOT_PROPAGATED');
 const report={status:'FAIL',cause:CAUSE,propagation:{status:p.status,cause:p.cause,message:p.message,attempts:p.attempts},previousFailure:null};
 assert.equal(run(report).class,T_PROP);
 /* 403 statt 503: Zugriffsproblem, keine Auslieferung -> REAL */
 const p403=await verifyPropagation({origin:'https://x.test',expectedSha:'a'.repeat(40),maxMs:20000,fetchImpl:async()=>new Response('no',{status:403}),sleep,now});
 const rep403={status:'FAIL',cause:CAUSE,propagation:{status:p403.status,cause:p403.cause,attempts:p403.attempts},previousFailure:null};
 assert.equal(run(rep403).class,REAL);
 /* Antwort ohne gueltige Kennung (INVALID): strukturell, nicht Propagation */
 const pInv=await verifyPropagation({origin:'https://x.test',expectedSha:'a'.repeat(40),maxMs:20000,fetchImpl:async()=>new Response('{"schema":"other"}',{status:200}),sleep,now});
 const repInv={status:'FAIL',cause:CAUSE,propagation:{status:pInv.status,cause:pInv.cause,attempts:pInv.attempts},previousFailure:null};
 assert.equal(run(repInv).class,REAL);
});

test('REAL: Browser-Assertion nach bewiesener Propagation, Commit-/Hash-/Daten-/Sicherheitsfehler',()=>{
 for(const message of ['WRONG_PRODUCTION_COMMIT','assert.equal(sha256): path hash mismatch','AssertionError: index.json 503','consumer visible while gate closed','#research-access-gate missing','TypeError: Cannot read properties of undefined'])
  assert.equal(run(browserReport({error:{name:'AssertionError',message}})).class,REAL,message);
 assert.equal(run(browserReport({retryDecision:{retry:false,reason:'SAME_STATE_REAL_FAILURE'}})).class,REAL);
 /* OFF-Modus: Verbraucher sichtbar / Anfragen trotz geschlossenem Gate */
 assert.equal(run(browserReport({gate:'CLOSED',active:{product:'quant',width:390,requests:['/company-intelligence/data/x.json']}})).class,REAL);
});

test('REAL: Propagationsbericht mit auch nur einer Nicht-Auslieferungsursache',()=>{
 for(const bad of ['INVALID','HTTP_401','HTTP_403','HTTP_404x','HTTP_400','HTTP_301','FOO','',undefined,null,42]){
  assert.equal(run(propagationReport([check('a','STALE'),check('b',bad)])).class,REAL,String(bad));
  assert.equal(run(propagationReport([check('b',bad)])).class,REAL,String(bad));
 }
});

test('REAL: unvollstaendige, widerspruechliche oder fehlende Berichte (fail-closed)',()=>{
 const good=propagationReport([check('a','STALE')]);
 assert.equal(run(good).class,T_PROP);
 const cases={
  missing:null,undef:undefined,string:'FAIL',array:[good],empty:{},
  pass:{...good,status:'PASS'},noStatus:{...good,status:undefined},
  causeUnknown:{...good,cause:'SOMETHING_NEW'},causeMissing:{...good,cause:undefined},
  noPropagation:{...good,propagation:undefined},
  propagated:{...good,propagation:{...good.propagation,status:'PROPAGATED'}},
  propCauseWrong:{...good,propagation:{...good.propagation,cause:'X'}},
  noAttempts:{...good,propagation:{...good.propagation,attempts:[]}},
  attemptsNotArray:{...good,propagation:{...good.propagation,attempts:'x'}},
  lastHasNoFailed:{...good,propagation:{...good.propagation,attempts:[{n:1,ok:false,failed:[check('a','STALE')]},{n:2,ok:false}]}},
  lastFailedEmpty:{...good,propagation:{...good.propagation,attempts:[{n:1,ok:false,failed:[]}]}},
  onlySkipped:propagationReport([check('a','SKIPPED')]),
  onlyDeadline:propagationReport([check('a','DEADLINE'),check('b','SKIPPED')]),
  previousBrowserFailure:{...good,previousFailure:'AssertionError: kaputt'},
 };
 for(const [name,report] of Object.entries(cases))assert.equal(run(report).class,REAL,name);
});

test('REAL: unbekannte oder inkonsistente Schrittergebnisse',()=>{
 const good=propagationReport([check('a','STALE')]);
 for(const qa of ['success','skipped','cancelled','','neutral',undefined,null])assert.equal(classify({depsOutcome:'success',qaOutcome:qa,report:good}).class,REAL,String(qa));
 for(const deps of ['skipped','cancelled','','neutral',undefined,null])assert.equal(classify({depsOutcome:deps,qaOutcome:'failure',report:good}).class,REAL,String(deps));
 assert.equal(classify().class,REAL);
 assert.equal(classify({depsOutcome:'success',qaOutcome:'failure'}).class,REAL);
});

test('Eigenschaft: jede Ursachenmenge mit einer Nicht-Auslieferungsursache ist REAL',()=>{
 const deliver=['STALE','MIXED','MISSING','REQUEST_FAILED','HTTP_503','HTTP_429','SKIPPED','DEADLINE'];
 const other=['INVALID','HTTP_403','HTTP_401','HTTP_400','HTTP_404','OTHER'];
 for(let mask=1;mask<(1<<other.length);mask++){
  const bad=other.filter((_,i)=>mask&1<<i);
  for(let m2=0;m2<(1<<4);m2++){
   const ok=deliver.filter((_,i)=>m2&1<<i);
   assert.equal(run(propagationReport([...ok,...bad].map((c,i)=>check('c'+i,c)))).class,REAL,[...ok,...bad].join());
  }
 }
 for(const c of other)assert.equal(isDeliveryCause(c),false,c);
});

test('main: schreibt Ausgaben, Datei und Summary; Datei fehlt -> REAL; Modus aus ENABLED',()=>{
 const root=mkdtempSync(join(tmpdir(),'cls-'));
 try{
  const out=join(root,'gh-out'),sum=join(root,'sum');writeFileSync(out,'');writeFileSync(sum,'');
  mkdirSync(join(root,'live-fast'),{recursive:true});mkdirSync(join(root,'live-off'),{recursive:true});
  writeFileSync(join(root,'live-fast/report.json'),JSON.stringify(propagationReport([check('a','STALE')])));
  const base={REPORT_ROOT:root,GITHUB_OUTPUT:out,GITHUB_STEP_SUMMARY:sum,DEPS_OUTCOME:'success',LIVE_OUTCOME:'failure',OFF_OUTCOME:'skipped'};
  let r=main({...base,ENABLED:'true'});
  assert.equal(r.class,T_PROP);assert.equal(r.qa,'live');
  assert.match(readFileSync(out,'utf8'),/^class=TRANSIENT_PROPAGATION\nreason=DELIVERY_NOT_PROPAGATED\nqa=live\n/);
  assert.equal(JSON.parse(readFileSync(join(root,'live-failure/classification.json'),'utf8')).class,T_PROP);
  /* OFF-Modus liest live-off; dort fehlt der Bericht -> REAL */
  r=main({...base,ENABLED:'false',OFF_OUTCOME:'failure',LIVE_OUTCOME:'skipped'});
  assert.equal(r.class,REAL);assert.equal(r.qa,'off');
  /* kaputter Bericht */
  writeFileSync(join(root,'live-off/report.json'),'{kaputt');
  assert.equal(main({...base,ENABLED:'',OFF_OUTCOME:'failure',LIVE_OUTCOME:'skipped'}).class,REAL);
  /* Installationsfehler */
  assert.equal(main({...base,ENABLED:'true',DEPS_OUTCOME:'failure',LIVE_OUTCOME:'skipped'}).class,T_INFRA);
  assert.doesNotMatch(readFileSync(sum,'utf8'),/password|secret/i);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('lazy-detail: weitere Skripte mit HTTP 403 im Detail machen den Fehler REAL; 5xx/404 bleiben transient',()=>{
 const lazy=detail=>propagationReport([{name:'lazy-detail',ok:false,cause:'STALE',detail,status:null,headers:{}}]);
 assert.equal(run(lazy('3 von 9 Skripten: /a.js HTTP 503; /b.js HTTP 404')).class,T_PROP);
 assert.equal(run(lazy('3 von 9 Skripten: /a.js HTTP 503; /b.js HTTP 403')).class,REAL);
 assert.equal(run(lazy('2 von 9 Skripten: /a.js HTTP 401')).class,REAL);
});

test('Bericht mit fremdem sourceCommit ist REAL; passender oder fehlender bleibt wie gehabt',()=>{
 const rep=sha=>propagationReport([check('a','STALE')],{sourceCommit:sha});
 const c=(r,expectedSha)=>classify({depsOutcome:'success',qaOutcome:'failure',report:r,expectedSha});
 assert.equal(c(rep('a'.repeat(40)),'a'.repeat(40)).class,T_PROP);
 assert.equal(c(rep('b'.repeat(40)),'a'.repeat(40)).class,REAL);
 assert.equal(c(propagationReport([check('a','STALE')]),'a'.repeat(40)).class,T_PROP); // OFF-Bericht ohne sourceCommit
 assert.equal(c(rep('b'.repeat(40)),null).class,T_PROP);
});
