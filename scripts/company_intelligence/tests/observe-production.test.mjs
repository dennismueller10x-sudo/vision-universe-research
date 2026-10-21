/* observe nach bestandener Live-Pruefung: Buchfuehrungsfehler schliessen kein gesundes Gate (Lauf 39128011059, 18.10.2026),
   echte Live-, Generations- und Lesefehler bleiben fail-closed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {observeProduction,readDelivery,CLASS,EXIT} from '../observe-production.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const G='b586a169d705ed67c344562c',OTHER='c32917691a53222d617384c9',NS='production-discover-test';
const json=body=>async()=>({ok:true,status:200,json:async()=>body});
const html=async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('Unexpected token <');}});
const status=code=>async()=>({ok:false,status:code,json:async()=>({})});
const seq=(...fs)=>{let i=0;return (...a)=>fs[Math.min(i++,fs.length-1)](...a);};
function store({put,get}={}){
 const m=new Map(),writes=[];
 return {m,writes,driver:{
  get:async k=>get?get(k,m):(m.get(k)??null),
  put:async(k,v)=>{if(put)return put(k,v,m);writes.push(k);m.set(k,Buffer.from(v));}
 }};
}
const base=(over={})=>{
 const s=over.store||store();
 return {s,opts:{readGood:async()=>({ns:NS,good:{generation:G}}),driver:s.driver,keyFor:ns=>ns+'/observed.json',
  fetcher:json({generation:G}),attempts:3,delayMs:0,sleep:async()=>{},now:()=>new Date('2026-10-18T12:56:30Z'),...over.opts}};
};

test('Generation belegt und observed.json geschrieben -> PASS, health aktualisiert',async()=>{
 let health=null;const {s,opts}=base({opts:{saveHealth:o=>{health=o;}}});
 const r=await observeProduction(opts);
 assert.deepEqual([r.status,r.exitCode,r.generation],['PASS',EXIT.PASS,G]);
 assert.deepEqual(s.writes,[NS+'/observed.json']);
 assert.equal(JSON.parse(s.m.get(NS+'/observed.json')).generation,G);
 assert.equal(health.generation,G);
});

test('Replay Lauf 50: Live geprueft, nur das Schreiben von observed.json scheitert -> BOOKKEEPING (Exit 3), nicht REAL',async()=>{
 const {opts}=base({store:store({put:async()=>{throw Error('R2_PUT_TIMEOUT');}})});
 const r=await observeProduction(opts);
 assert.deepEqual([r.status,r.class,r.exitCode,r.code],['FAIL',CLASS.BOOKKEEPING,3,'OBSERVED_WRITE_FAILED:R2_PUT_TIMEOUT']);
 assert.equal(r.generation,G,'die ausgelieferte Generation war belegt');
});

test('Zuruecklesen weicht ab oder fehlt -> BOOKKEEPING OBSERVABILITY_READBACK_FAILED',async()=>{
 for(const get of [async()=>Buffer.from('{}'),async()=>null]){
  const r=await observeProduction(base({store:store({get})}).opts);
  assert.deepEqual([r.class,r.code,r.exitCode],[CLASS.BOOKKEEPING,'OBSERVABILITY_READBACK_FAILED',3]);
 }
});

test('health.json nicht schreibbar -> BOOKKEEPING; observed.json ist trotzdem geschrieben',async()=>{
 const {s,opts}=base({opts:{saveHealth:()=>{const e=new Error('disk');e.code='ENOSPC';throw e;}}});
 const r=await observeProduction(opts);
 assert.deepEqual([r.class,r.code],[CLASS.BOOKKEEPING,'HEALTH_WRITE_FAILED:ENOSPC']);
 assert.equal(s.writes.length,1);
});

test('Live-Auslieferung dauerhaft nicht lesbar (HTML, 503, Netz, Timeout) -> REAL (Exit 1), nichts geschrieben',async()=>{
 const net=async()=>{throw new TypeError('fetch failed');},timeout=async()=>{const e=new Error('t');e.name='TimeoutError';throw e;};
 for(const [fetcher,code] of [[html,'DELIVERY_NOT_JSON'],[status(503),'DELIVERY_HTTP_503'],[status(404),'DELIVERY_HTTP_404'],[net,'DELIVERY_FETCH_FAILED'],[timeout,'DELIVERY_TIMEOUT'],[json({}),'DELIVERY_NOT_JSON']]){
  let sleeps=0;const {s,opts}=base({opts:{fetcher,sleep:async()=>{sleeps++;}}});
  const r=await observeProduction(opts);
  assert.deepEqual([r.status,r.class,r.exitCode,r.code,r.attempts],['FAIL',CLASS.REAL,EXIT.REAL,code,3],code);
  assert.equal(sleeps,2,'begrenzt: zwei Pausen bei drei Versuchen');
  assert.equal(s.writes.length,0);
 }
});

test('Einmaliger CDN-503 oder HTML, danach JSON -> PASS im zweiten Versuch',async()=>{
 for(const first of [status(503),html]){
  const r=await observeProduction(base({opts:{fetcher:seq(first,json({generation:G}))}}).opts);
  assert.deepEqual([r.status,r.attempts],['PASS',2]);
 }
});

test('Ausgelieferte Generation != GOOD dauerhaft -> REAL OBSERVED_PRODUCTION_GENERATION_MISMATCH, nichts geschrieben',async()=>{
 const {s,opts}=base({opts:{fetcher:json({generation:OTHER})}});
 const r=await observeProduction(opts);
 assert.deepEqual([r.class,r.code,r.exitCode,r.served,r.good],[CLASS.REAL,'OBSERVED_PRODUCTION_GENERATION_MISMATCH',1,OTHER,G]);
 assert.equal(s.writes.length,0);
 // Ohne GOOD laesst sich die Produktion nicht belegen
 const none=await observeProduction(base({opts:{readGood:async()=>({ns:NS,good:null})}}).opts);
 assert.deepEqual([none.class,none.code],[CLASS.REAL,'OBSERVED_PRODUCTION_GENERATION_MISMATCH']);
});

test('Abweichung nur an einer CDN-Kante, dann GOOD -> PASS; GOOD unlesbar -> REAL',async()=>{
 const r=await observeProduction(base({opts:{fetcher:seq(json({generation:OTHER}),json({generation:G}))}}).opts);
 assert.deepEqual([r.status,r.attempts],['PASS',2]);
 const bad=await observeProduction(base({opts:{readGood:async()=>{throw Error('R2_GET_FAILED');}}}).opts);
 assert.deepEqual([bad.class,bad.code,bad.exitCode],[CLASS.REAL,'GOOD_UNREADABLE:R2_GET_FAILED',1]);
});

test('--same-generation-only (Pages): wie bisher aufschieben statt fehlschlagen; Lesefehler der Vorbeobachtung = BOOKKEEPING',async()=>{
 const mism=await observeProduction(base({opts:{sameGenerationOnly:true,fetcher:json({generation:OTHER})}}).opts);
 assert.deepEqual([mism.status,mism.code,mism.exitCode],['DEFERRED','OBSERVATION_DEFERRED_TO_FULL_REFRESH_QA',0]);
 const s0=store(),noPrior=await observeProduction(base({store:s0,opts:{sameGenerationOnly:true}}).opts);
 assert.deepEqual([noPrior.status,s0.writes.length],['DEFERRED',0]);
 const s1=store();s1.m.set(NS+'/observed.json',Buffer.from(JSON.stringify({generation:G})));
 assert.equal((await observeProduction(base({store:s1,opts:{sameGenerationOnly:true}}).opts)).status,'PASS');
 const s2=store({get:async()=>{throw Error('R2_GET_FAILED');}});
 const r=await observeProduction(base({store:s2,opts:{sameGenerationOnly:true}}).opts);
 assert.deepEqual([r.class,r.exitCode],[CLASS.BOOKKEEPING,3]);
});

test('readDelivery wirft nie und haengt einen Cache-Breaker an',async()=>{
 let url='';const r=await readDelivery(async u=>{url=u;return {ok:true,status:200,json:async()=>({generation:G})};});
 assert.deepEqual(r,{generation:G});assert.match(url,/company-intelligence-delivery\.json\?observe=\d+$/);
});

/* --- Workflow- und CLI-Vertrag --- */
const wf=loadYamlFile(fileURLToPath(new URL('../../../.github/workflows/company-intelligence-refresh.yml',import.meta.url)));
const steps=wf.jobs.refresh.steps,deploy=steps.find(s=>s.id==='deploy_live'),rollback=steps.find(s=>/^Fail closed on actual production regression/.test(s.name||''));
const bookkeeping=steps.find(s=>/^Observation bookkeeping failed/.test(s.name||''));

test('Workflow: nur Exit 3 von observe gilt als Buchfuehrung; alles andere scheitert und loest Fail closed aus',()=>{
 const run=deploy.run;
 assert.match(run,/rc=0\n\s*node scripts\/company_intelligence\/refresh-run\.mjs observe --health "\$RUNNER_TEMP\/ci-refresh\/health\.json" \|\| rc=\$\?\n/);
 assert.match(run,/if \[ "\$rc" -eq 3 \]; then\n\s*echo "observe_bookkeeping=true" >> "\$GITHUB_OUTPUT"/);
 assert.match(run,/exit "\$rc"\s*$/,'jeder andere Exit-Code bleibt Exit-Code des Schritts');
 assert.equal((run.match(/-eq 3/g)||[]).length,1,'kein weiterer Code wird abgefangen');
 assert.equal(rollback.if,"failure() && steps.deploy_live.outcome == 'failure' && inputs.verification != true",'Fail-closed-Bedingung unveraendert');
});

test('Workflow: Buchfuehrungsfehler macht den Lauf rot, aber ohne Rollback, disable oder OFF-Dispatch',()=>{
 assert.ok(bookkeeping,'Abschlussschritt fehlt');
 assert.equal(bookkeeping.if,"steps.deploy_live.outputs.observe_bookkeeping == 'true'");
 assert.match(bookkeeping.run,/exit 1/);
 assert.doesNotMatch(bookkeeping.run,/rollback|disable|gh workflow run/);
 assert.equal(steps.indexOf(bookkeeping),steps.length-1,'letzter Schritt: Belege und Marker sind schon hochgeladen');
});

test('CLI: observe nutzt die Klassifikation; der Sammel-Fehler nennt den Code statt ihn zu verschlucken',()=>{
 const src=readFileSync(fileURLToPath(new URL('../refresh-run.mjs',import.meta.url)),'utf8');
 assert.match(src,/import \{observeProduction,codeOf\} from '\.\/observe-production\.mjs';/);
 assert.match(src,/args\[0\]==='observe'\)\{\n\s*process\.exitCode=await runObserve\(args,driver\);/,'Verhalten des Zweigs: observe-cli.test.mjs (Kindprozess)');
 assert.doesNotMatch(src,/\}catch\{console\.error\('CONTINUOUS_REFRESH_FAILED'\)/);
 assert.match(src,/console\.error\('CONTINUOUS_REFRESH_FAILED \('\+/);
});
