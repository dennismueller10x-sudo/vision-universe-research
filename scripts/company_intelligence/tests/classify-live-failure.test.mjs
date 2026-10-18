import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classify,classifyReport,classifyBrowserHttp,isDeliveryCause,main,CLASSES,PROPAGATION_CAUSE,staticScriptsOf,staticScriptsFromRepo} from '../classify-live-failure.mjs';
import {verifyPropagation,CAUSE} from '../propagation-proof.mjs';

const T_BROWSER=CLASSES.BROWSER,T_PROP=CLASSES.PROPAGATION,T_INFRA=CLASSES.INFRA,REAL=CLASSES.REAL;
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

/* ---- TRANSIENT_BROWSER_HTTP (Fixture: anonymisierter Bericht des Laufs 38590652362, gleiche Struktur) ---- */
const SHA='0123456789abcdef0123456789abcdef01234567';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/live-report-lazy-503.json',import.meta.url),'utf8'));
const cb=(r,expectedSha=SHA)=>classify({depsOutcome:'success',qaOutcome:'failure',report:r,expectedSha});
const mut=f=>{const r=fixture();f(r);return r;};
const httpEntry=(url,status,ct='text/html; charset=utf-8')=>({url,status,headers:{'content-type':ct}});

test('Browser: 503 auf Lazy-Skript (echter Fall) -> TRANSIENT_BROWSER_HTTP',()=>{
 const r=cb(fixture());
 assert.equal(r.class,T_BROWSER);assert.match(r.reason,/503/);
 for(const st of [502,504,429])assert.equal(cb(mut(x=>{x.browserDiagnostics.http[0].status=st;x.pageState.scriptResourcesSuspicious[0].s=st;x.browserDiagnostics.console[0]=x.browserDiagnostics.console[0].replace('503',String(st));})).class,T_BROWSER,String(st));
});

test('Browser: alles andere bleibt REAL',()=>{
 const cases={
  extra403:r=>r.browserDiagnostics.http.push(httpEntry('/discover/data/x.json',403)),
  extra404:r=>r.browserDiagnostics.http.push(httpEntry('/discover/data/x.json',404)),
  extraOther503:r=>r.browserDiagnostics.http.push(httpEntry('/company-intelligence/data/index.json',503)),
  status500:r=>{r.browserDiagnostics.http[0].status=500;},
  status401:r=>{r.browserDiagnostics.http[0].status=401;},
  status403:r=>{r.browserDiagnostics.http[0].status=403;},
  status404:r=>{r.browserDiagnostics.http[0].status=404;},
  status200:r=>{r.browserDiagnostics.http[0].status=200;},
  noHtml:r=>{r.browserDiagnostics.http[0].headers['content-type']='application/javascript';},
  noContentType:r=>{delete r.browserDiagnostics.http[0].headers['content-type'];},
  json503:r=>{r.browserDiagnostics.http[0].headers['content-type']='application/json';},
  foreignOrigin:r=>{r.browserDiagnostics.http[0].url='https://evil.example/discover/engines/narrative.js';},
  foreignNamedAsCause:r=>{r.browserDiagnostics.http[0].url='https://evil.example/a.js';r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:https://evil.example/a.js';r.pageState.scriptResourcesSuspicious=[];r.browserDiagnostics.failed=[];},
  protocolRelativeNamed:r=>{r.browserDiagnostics.http[0].url='//evil.example/a.js';r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED://evil.example/a.js';r.pageState.scriptResourcesSuspicious=[];r.browserDiagnostics.failed=[];},
  protocolRelative:r=>{r.browserDiagnostics.http[0].url='//evil.example/a.js';},
  causeOtherUrl:r=>{r.browserDiagnostics.console[0]='A bad HTTP response code (503). LAZY_SCRIPT_FAILED:/discover/engines/other.js';},
  causeTwoUrlsOneOther:r=>{r.browserDiagnostics.console.push('LAZY_SCRIPT_FAILED:/discover/engines/other.js');},
  http503Json:r=>{const u='/company-intelligence/data/index.json';r.browserDiagnostics.http[0].url=u;r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:'+u;r.browserDiagnostics.failed=[];r.pageState.scriptResourcesSuspicious=[];},
  http503Css:r=>{const u='/discover/app.css';r.browserDiagnostics.http[0].url=u;r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:'+u;r.browserDiagnostics.failed=[];r.pageState.scriptResourcesSuspicious=[];},
  http503UiJson:r=>{const u='/discover/ui/x.json';r.browserDiagnostics.http[0].url=u;r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:'+u;r.browserDiagnostics.failed=[];r.pageState.scriptResourcesSuspicious=[];},
  http503EnginesCss:r=>{const u='/discover/engines/x.css';r.browserDiagnostics.http[0].url=u;r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:'+u;r.browserDiagnostics.failed=[];r.pageState.scriptResourcesSuspicious=[];},
  http503AppJs:r=>{const u='/discover/app.js';r.browserDiagnostics.http[0].url=u;r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:'+u;r.browserDiagnostics.failed=[];r.pageState.scriptResourcesSuspicious=[];},
  http503TraversalLike:r=>{const u='/discover/engines/../app.js';r.browserDiagnostics.http[0].url=u;r.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:'+u;r.browserDiagnostics.failed=[];r.pageState.scriptResourcesSuspicious=[];},
  consoleTrailingText:r=>{r.browserDiagnostics.console[0]+=' und mehr';},
  consoleTwoNamedOneLine:r=>{r.browserDiagnostics.console[0]+=' LAZY_SCRIPT_FAILED:/discover/engines/other.js';},
  consoleForeignPrefix:r=>{r.browserDiagnostics.console[0]='Irgendetwas (503) LAZY_SCRIPT_FAILED:/discover/engines/narrative.js';},
  consoleGenericLoose:r=>r.browserDiagnostics.console.push('Something with status of 503 happened'),
  consolePrefixStatusMismatch:r=>{r.browserDiagnostics.console[0]='A bad HTTP response code (502) was received when fetching the script. LAZY_SCRIPT_FAILED:/discover/engines/narrative.js';},
  accessGate:r=>{r.pageState.accessGate=true;},
  metaNull:r=>{r.pageState.metaRelease=null;},
  metaMissing:r=>{delete r.pageState.metaRelease;},
  markerError:r=>{r.markers=[{state:'ERROR'}];},
  noLazyNamed:r=>{r.browserDiagnostics.console=['A bad HTTP response code (503) was received'];},
  consoleUnexplained:r=>r.browserDiagnostics.console.push('Uncaught ReferenceError: x is not defined'),
  consoleOtherStatus:r=>r.browserDiagnostics.console.push('Failed to load resource: the server responded with a status of 403 ()'),
  pageErrors:r=>r.browserDiagnostics.pageErrors.push('TypeError: boom'),
  activeErrors:r=>{r.active.errors=['x'];},
  failedOtherUrl:r=>r.browserDiagnostics.failed.push({url:'/discover/app.js?v=1',error:'net::ERR_FAILED'}),
  pageStateOtherUrl:r=>r.pageState.scriptResourcesSuspicious.push({n:'/discover/app.js',s:503}),
  pageStateOtherStatus:r=>{r.pageState.scriptResourcesSuspicious[0].s=403;},
  pageStateMissing:r=>{delete r.pageState;},
  pageStateNoList:r=>{delete r.pageState.scriptResourcesSuspicious;},
  otherRelease:r=>{r.pageState.metaRelease='relzzzzzzzzzzzz';},
  diagnosticsMissing:r=>{delete r.browserDiagnostics;},
  diagnosticsNull:r=>{r.browserDiagnostics=null;},
  httpMissing:r=>{delete r.browserDiagnostics.http;},
  httpEmpty:r=>{r.browserDiagnostics.http=[];},
  truncated:r=>{r.browserDiagnostics.truncated={http:true};},
  notTimeout:r=>{r.error.name='AssertionError';},
  noError:r=>{delete r.error;},
  previousFailure:r=>{r.previousFailure={message:'x'};},
  wrongCommit:r=>{r.sourceCommit='f'.repeat(40);},
  noCommit:r=>{delete r.sourceCommit;},
  notPropagated:r=>{r.propagation.status='NOT_PROPAGATED';},
  statusNotFail:r=>{r.status='PASS';},
 };
 for(const [name,f] of Object.entries(cases))assert.equal(cb(mut(f)).class,REAL,name);
 assert.equal(cb(fixture(),null).class,REAL,'ohne erwarteten Commit nicht pruefbar');
 assert.equal(cb(fixture(),'f'.repeat(40)).class,REAL);
});

test('Browser: echte Lazy-Skript-Pfade (Discover/Quant/core/Company-Intelligence-Skripte) bleiben transient',()=>{
 for(const u of ['/discover/engines/narrative.js?v=42e21a50739d2345','/discover/ui/detail.js','/quant/engines/multi-asset/market-pulse.js','/quant/ui/charts.js','/core/chart-history.js','/company-intelligence/ui/stock-section.js','/discover/detail.js']){
  const r=mut(x=>{x.browserDiagnostics.http[0].url=u;x.browserDiagnostics.console[0]='LAZY_SCRIPT_FAILED:'+u;x.browserDiagnostics.failed=[];x.pageState.scriptResourcesSuspicious=[];});
  assert.equal(cb(r).class,T_BROWSER,u);
 }
 assert.equal(cb(mut(x=>{x.browserDiagnostics.console=['Failed to load resource: the server responded with a status of 503 ()','A bad HTTP response code (503) was received when fetching the script.','LAZY_SCRIPT_FAILED:/discover/engines/narrative.js'];})).class,T_BROWSER);
});

test('Browser: Generische Konsolenmeldung mit passendem Status ist erlaubt, mit anderem Status nicht',()=>{
 assert.equal(cb(mut(r=>r.browserDiagnostics.console.push('Failed to load resource: the server responded with a status of 503 ()'))).class,T_BROWSER);
 assert.equal(cb(mut(r=>r.browserDiagnostics.console.push('Failed to load resource: the server responded with a status of 502 ()'))).class,REAL);
});

test('Browser: classifyBrowserHttp wird nur fuer die Browser-Ursache benutzt; Propagationsbericht unberuehrt',()=>{
 assert.equal(classifyBrowserHttp(fixture(),{expectedSha:SHA}).class,T_BROWSER);
 assert.equal(run(propagationReport([check('a','STALE')])).class,T_PROP);
 assert.equal(cb({...fixture(),cause:'SOMETHING_ELSE'}).class,REAL);
});

/* ---- Statisches Hauptskript (Fixture: anonymisierter Bericht des Laufs 39036914225, 17.10.2026: 503 vom CDN auf /discover/app.js,
   served-Liste gekuerzt). Statisch = <script src> der gepruefsten Seite (discover/index.html desselben Commits). ---- */
const staticFixture=()=>JSON.parse(readFileSync(new URL('./fixtures/live-report-static-503.json',import.meta.url),'utf8'));
const DISCOVER_STATIC=staticScriptsFromRepo(new URL('../../..',import.meta.url).pathname);
const cs=(r,{expectedSha=SHA,staticScripts=DISCOVER_STATIC}={})=>classify({depsOutcome:'success',qaOutcome:'failure',report:r,expectedSha,staticScripts});
const smut=f=>{const r=staticFixture();f(r);return r;};

test('statische Skripte: aus discover/index.html gelesen, nur same-origin .js ohne Query',()=>{
 assert.ok(DISCOVER_STATIC.has('/discover/app.js'));assert.ok(DISCOVER_STATIC.size>20);
 const s=staticScriptsOf('<script src="/a/b.js?v=1"></script><script defer src="/c.js"></script><script src="https://cdn.x/y.js"></script><script src="//x/z.js"></script><script src="/d.json"></script><script src="/e/../f.js"></script><script>inline()</script>');
 assert.deepEqual([...s].sort(),['/a/b.js','/c.js']);
 assert.equal(staticScriptsFromRepo('/nicht/vorhanden').size,0,'ohne Seite: leere Menge, also fail-closed');
});

test('statisches Hauptskript: einmaliger CDN-503 (echter Fall 17.10.) -> TRANSIENT_BROWSER_HTTP, Beleg im Ergebnis',()=>{
 const r=cs(staticFixture());
 assert.equal(r.class,T_BROWSER);assert.equal(r.reason,'STATIC_SCRIPT_HTTP_503');assert.equal(r.detail,'/discover/app.js');
 for(const st of [502,504,429])assert.equal(cs(smut(x=>{x.browserDiagnostics.http[0].status=st;x.pageState.scriptResourcesSuspicious[0].s=st;x.browserDiagnostics.console[0]=x.browserDiagnostics.console[0].replace('503',String(st));})).class,T_BROWSER,String(st));
 /* vorher (ohne Kenntnis der statischen Skripte) war derselbe Bericht REAL */
 assert.equal(cs(staticFixture(),{staticScripts:new Set()}).class,REAL);
});

test('statisches Hauptskript: gekuerzte Belegliste bleibt REAL, gekuerzte served-Liste nicht',()=>{
 for(const k of ['console','pageErrors','failed','http'])assert.equal(cs(smut(x=>{x.browserDiagnostics.truncated={served:true,[k]:true};})).class,REAL,k);
 assert.equal(cs(smut(x=>{x.browserDiagnostics.truncated={served:true};})).class,T_BROWSER);
 assert.equal(cs(smut(x=>{x.browserDiagnostics.truncated={};})).class,T_BROWSER);
});

test('statisches Hauptskript: echte Fehler bleiben REAL (keine pauschale 503-Ausnahme)',()=>{
 const cases={
  jsError:x=>x.browserDiagnostics.pageErrors.push('ReferenceError: VUDiscover is not defined'),
  jsErrorConsole:x=>x.browserDiagnostics.console.push('Uncaught TypeError: Cannot read properties of undefined'),
  activeErrors:x=>{x.active.errors=['TypeError: boom'];},
  /* Skripte geladen, Komponente fehlt trotzdem: kein HTTP-Beleg */
  componentMissingScriptsOk:x=>{x.browserDiagnostics.http=[];x.browserDiagnostics.failed=[];x.browserDiagnostics.console=[];x.pageState.scriptResourcesSuspicious=[];},
  /* Generation/Daten: Assertion statt Zeitueberschreitung */
  generationMismatch:x=>{x.error={name:'AssertionError',message:"Expected values to be strictly equal: 'gen-b' !== 'gen-a'"};},
  hashMismatch:x=>{x.error={name:'AssertionError',message:'index.json sha256'};},
  dataJson503:x=>{const u='/company-intelligence/data/index.json';x.browserDiagnostics.http[0].url=u;x.browserDiagnostics.failed[0].url=u;x.pageState.scriptResourcesSuspicious=[];},
  css503:x=>{const u='/discover/discover.css';x.browserDiagnostics.http[0].url=u;x.browserDiagnostics.failed[0].url=u;x.pageState.scriptResourcesSuspicious[0].n=u;},
  scriptNotOnPage:x=>{const u='/quant/app/pages.js';x.browserDiagnostics.http[0].url=u;x.browserDiagnostics.failed[0].url=u;x.pageState.scriptResourcesSuspicious[0].n=u;},
  foreignOrigin:x=>{x.browserDiagnostics.http[0].url='https://cdn.example/discover/app.js';},
  status500:x=>{x.browserDiagnostics.http[0].status=500;},
  status403:x=>{x.browserDiagnostics.http[0].status=403;x.browserDiagnostics.console[0]=x.browserDiagnostics.console[0].replace('503','403');},
  status404:x=>{x.browserDiagnostics.http[0].status=404;},
  notHtml:x=>{x.browserDiagnostics.http[0].headers['content-type']='application/javascript';},
  namedAsLazy:x=>{x.browserDiagnostics.console.push('LAZY_SCRIPT_FAILED:/discover/other.js');},
  extraFailedRequest:x=>x.browserDiagnostics.failed.push({url:'/company-intelligence/data/index.json',error:'net::ERR_FAILED'}),
  second503Data:x=>x.browserDiagnostics.http.push(httpEntry('/company-intelligence/data/lookup/AA.json',503)),
  pageStateOther:x=>x.pageState.scriptResourcesSuspicious.push({n:'/discover/detail.js',s:403}),
  accessGate:x=>{x.pageState.accessGate=true;},
  otherRelease:x=>{x.pageState.metaRelease='relzzzzzzzzzzzz';},
  markerError:x=>{x.markers=[{state:'ERROR'}];},
  wrongCommit:x=>{x.sourceCommit='f'.repeat(40);},
  notPropagated:x=>{x.propagation.status='NOT_PROPAGATED';},
  previousFailure:x=>{x.previousFailure={message:'x'};},
 };
 for(const [name,f] of Object.entries(cases))assert.equal(cs(smut(f)).class,REAL,name);
 assert.equal(cs(staticFixture(),{expectedSha:null}).class,REAL,'ohne erwarteten Commit');
});

test('Beleg im Log: Pfad und Status der gescheiterten Anfrage stehen auch bei REAL in Datei und Summary',()=>{
 const root=mkdtempSync(join(tmpdir(),'cls-static-'));
 try{
  const out=join(root,'gh-out'),sum=join(root,'sum');writeFileSync(out,'');writeFileSync(sum,'');
  mkdirSync(join(root,'live-fast'),{recursive:true});mkdirSync(join(root,'repo/discover'),{recursive:true});
  writeFileSync(join(root,'repo/discover/index.html'),'<script src="/discover/app.js"></script>');
  writeFileSync(join(root,'live-fast/report.json'),JSON.stringify(staticFixture()));
  const base={REPORT_ROOT:root,REPO_ROOT:join(root,'repo'),GITHUB_OUTPUT:out,GITHUB_STEP_SUMMARY:sum,DEPS_OUTCOME:'success',LIVE_OUTCOME:'failure',OFF_OUTCOME:'skipped',ENABLED:'true',EXPECTED_PRODUCTION_SHA:SHA};
  let r=main(base);
  assert.equal(r.class,T_BROWSER);assert.deepEqual(r.evidence.http,['/discover/app.js 503 html']);assert.deepEqual(r.evidence.truncated,['served']);
  assert.match(readFileSync(sum,'utf8'),/Beleg: HTTP \[\/discover\/app\.js 503 html\], Seitenfehler 0, fehlgeschlagen 1, Konsole 1, gekuerzt served, Fehler TimeoutError/);
  /* derselbe Bericht mit Seitenfehler: REAL, der Beleg nennt ihn */
  const bad=staticFixture();bad.browserDiagnostics.pageErrors=['ReferenceError: x'];
  writeFileSync(join(root,'live-fast/report.json'),JSON.stringify(bad));
  r=main(base);
  assert.equal(r.class,REAL);assert.equal(r.reason,'BROWSER_PAGE_ERRORS');assert.equal(r.evidence.pageErrors,1);
  assert.equal(JSON.parse(readFileSync(join(root,'live-failure/classification.json'),'utf8')).evidence.http[0],'/discover/app.js 503 html');
 }finally{rmSync(root,{recursive:true,force:true});}
});
