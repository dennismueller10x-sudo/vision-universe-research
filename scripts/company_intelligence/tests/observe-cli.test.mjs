/* observe (B5): Exit-Codes des CLI-Zweigs, Verdrahtung, Diagnose-Codes, Wiederholungs-Default und Workflow-Vertrag.
   Schliesst die Luecken der Pruefung von B4: ein Regex auf `exitCode=r.exitCode` traf auch die Rollback-Zeile, und die
   Workflow-Snippets wurden nur als Text geprueft, nie ausgefuehrt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {refreshConfig,frozenInventory,frozenTickers} from '../refresh-approval.mjs';
import {prepareCandidate,commitGood,goodState,goodKey} from '../refresh-storage.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {runObserve} from '../refresh-run.mjs';
import {observeProduction,codeOf,CLASS,EXIT} from '../observe-production.mjs';
import {createS3Driver,createS3DriverFromEnv} from '../../market/storage/s3-driver.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const here=p=>fileURLToPath(new URL(p,import.meta.url));
const NS=refreshConfig.consumerNamespace,OBSERVED=prefixFor(NS)+'observed.json';
const tmp=[];const mk=prefix=>{const d=mkdtempSync(join(tmpdir(),prefix));tmp.push(d);return d;};
test.after(()=>{for(const d of tmp)rmSync(d,{recursive:true,force:true});});

/* --- echter GOOD-Zeiger (wie continuous-refresh.test.mjs) in einem In-Memory-Treiber --- */
function memory(){const objects=new Map();return {objects,get:async k=>objects.get(k)||null,put:async(k,v)=>{objects.set(k,Buffer.from(v));}};}
function fixture(n){
 const root=mk('observe-cli-fixture-'),generatedAt=new Date().toISOString(),generation=n.toString(16).padStart(24,'0'),schema='vu-company-intelligence-1.0.0';
 const values={},index={schema,state:'AVAILABLE',generation,generatedAt,companies:{},tickers:{}};
 for(const [companyId,v] of Object.entries(frozenInventory)){
  const path=`snapshots/${generation}/${companyId}.json`,listings=v.tickers.map(symbol=>({symbol,instrumentId:'vu_12345678901234'}));
  values[path]={schema,state:'AVAILABLE',companyId,generatedAt,listings,companyProfile:{state:'AVAILABLE',language:'de'},latestFinancials:{state:'MISSING'},news:[],events:[],earnings:[],filings:[],calls:[],timeline:[],materials:[]};
  index.companies[companyId]=path;for(const symbol of v.tickers)index.tickers[symbol]=[{companyId,instrumentId:'vu_12345678901234'}];
 }
 values['index.json']=index;const assets={};
 for(const [path,v] of Object.entries(values)){const bytes=Buffer.from(JSON.stringify(v));mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),bytes);assets[path]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
 const m={schema:1,generation,generatedAt,assets,tickers:frozenTickers,sourceUsagePolicy:refreshConfig.sourceUsagePolicy,productionApproval:refreshConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',profiles:45,privateCompanies:5120,checkpointSha256:'a'.repeat(64)}};
 writeFileSync(join(root,'manifest.json'),JSON.stringify(m));return {root,generation};
}
async function goodPointer(n){
 const d=memory(),f=fixture(n),good=await goodState(d,NS),r=await prepareCandidate(d,{namespace:NS,directory:f.root,good});
 await commitGood(d,{namespace:NS,payloadNamespace:r.payloadNamespace,manifest:r.manifest,health:{},inventory:frozenInventory,expectedGood:good});
 return {generation:f.generation,bytes:d.objects.get(goodKey(NS))};
}
const G1=await goodPointer(1),G2=await goodPointer(2);
const json=body=>async()=>({ok:true,status:200,json:async()=>body});
const status=code=>async()=>({ok:false,status:code,json:async()=>({})});
const observedBytes=generation=>Buffer.from(JSON.stringify({schema:1,generation,lastSuccessfulProductionPublication:'2026-10-18T10:00:00.000Z'}));
/** Treiber auf In-Memory-Basis mit GOOD-Zeiger; hooks: get(key,default)/put(key,bytes,default) duerfen werfen. */
function store({good=G1,hooks={}}={}){
 const objects=new Map([[goodKey(NS),good.bytes]]),puts=[];
 return {objects,puts,driver:{
  get:async k=>hooks.get?hooks.get(k,()=>objects.get(k)||null):(objects.get(k)||null),
  put:async(k,v)=>{if(hooks.put)await hooks.put(k,v);puts.push(k);objects.set(k,Buffer.from(v));}
 }};
}
const run=async(args,s,extra={})=>{const lines=[];const exit=await runObserve(args,s.driver,{log:l=>lines.push(l),sleep:async()=>{},delayMs:0,...extra});return {exit,lines,out:lines.join('\n')};};

/* --- a) Exit-Codes und Log des CLI-Zweigs (Funktion) --- */
test('runObserve: PASS -> Exit 0; observed.json im Namespace des aktiven GOOD (keyFor-Verdrahtung)',async()=>{
 const s=store(),r=await run([],s,{fetcher:json({generation:G1.generation})});
 assert.equal(r.exit,0);assert.deepEqual(s.puts,[OBSERVED],'genau ein Schreibvorgang, im Namespace '+NS);
 assert.equal(JSON.parse(s.objects.get(OBSERVED)).generation,G1.generation);
 assert.doesNotMatch(r.out,/::error::/);assert.equal(JSON.parse(r.lines[0]).status,'PASS');
});

test('runObserve: Buchfuehrungsfehler -> Exit 3 mit Zeile "::error::observe BOOKKEEPING (<Code>)"',async()=>{
 const s=store({hooks:{put:async()=>{throw Error('R2_PUT_TIMEOUT');}}}),r=await run([],s,{fetcher:json({generation:G1.generation})});
 assert.equal(r.exit,3);assert.ok(r.lines.includes('::error::observe BOOKKEEPING (OBSERVED_WRITE_FAILED:R2_PUT_TIMEOUT)'),r.out);
});

test('runObserve: REAL -> Exit 1 mit Zeile "::error::observe REAL (<Code>)"; nichts geschrieben',async()=>{
 const s=store(),r=await run([],s,{fetcher:json({generation:G2.generation})});
 assert.equal(r.exit,1);assert.ok(r.lines.includes('::error::observe REAL (OBSERVED_PRODUCTION_GENERATION_MISMATCH)'),r.out);
 assert.equal(s.puts.length,0);
});

test('runObserve: DEFERRED -> Exit 0 und Ursache im Log; kaputte Vorbeobachtung nennt ihren Code',async()=>{
 for(const [prior,reason] of [[null,'PRIOR_OBSERVATION_MISSING'],[Buffer.from('<html>'),'PRIOR_OBSERVATION_UNPARSEABLE'],[observedBytes(G2.generation),'PRIOR_OBSERVATION_GENERATION_DIFFERS']]){
  const s=store();if(prior)s.objects.set(OBSERVED,prior);
  const r=await run(['--same-generation-only'],s,{fetcher:json({generation:G1.generation})});
  assert.equal(r.exit,0,reason);assert.deepEqual(r.lines,['OBSERVATION_DEFERRED_TO_FULL_REFRESH_QA ('+reason+')']);assert.equal(s.puts.length,0);
 }
 const s=store(),r=await run(['--same-generation-only'],s,{fetcher:json({generation:G2.generation})});
 assert.deepEqual([r.exit,r.lines[0]],[0,'OBSERVATION_DEFERRED_TO_FULL_REFRESH_QA (SERVED_GENERATION_NOT_GOOD)']);
});

/* --- b) Verdrahtung saveHealth / sameGenerationOnly --- */
test('runObserve: --health wird nur bei PASS und nur mit der Beobachtung aktualisiert; unlesbare health.json -> Exit 3',async()=>{
 const dir=mk('observe-cli-health-'),p=join(dir,'health.json');writeFileSync(p,JSON.stringify({consumerGeneration:G1.generation,publicationSLO:'STALE'}));
 const s=store(),r=await run(['--health',p],s,{fetcher:json({generation:G1.generation})});
 const h=JSON.parse(readFileSync(p,'utf8')),o=JSON.parse(s.objects.get(OBSERVED));
 assert.equal(r.exit,0);assert.deepEqual([h.publicationSLO,h.productionVerified,h.lastSuccessfulProductionPublication,h.consumerGeneration],['HEALTHY',true,o.lastSuccessfulProductionPublication,G1.generation]);
 // ohne --health bleibt die Datei unberuehrt
 writeFileSync(p,'{"x":1}');await run([],store(),{fetcher:json({generation:G1.generation})});assert.equal(readFileSync(p,'utf8'),'{"x":1}');
 const bad=await run(['--health',join(dir,'fehlt.json')],store(),{fetcher:json({generation:G1.generation})});
 assert.equal(bad.exit,3);assert.ok(bad.lines.includes('::error::observe BOOKKEEPING (HEALTH_WRITE_FAILED:ENOENT)'),bad.out);
});

test('runObserve: --same-generation-only schreibt nur bei passender Vorbeobachtung; ohne Flag wird immer geschrieben',async()=>{
 const f={fetcher:json({generation:G1.generation})};
 const a=store();assert.equal((await run(['--same-generation-only'],a,f)).exit,0);assert.equal(a.puts.length,0);
 const b=store();b.objects.set(OBSERVED,observedBytes(G1.generation));assert.equal((await run(['--same-generation-only'],b,f)).exit,0);assert.deepEqual(b.puts,[OBSERVED]);
 const c=store();assert.equal((await run([],c,f)).exit,0);assert.deepEqual(c.puts,[OBSERVED]);
});

/* --- c) Produktions-Default der Wiederholung --- */
test('Default: drei Versuche mit 20 s Pause (Uhr injiziert); Mutant attempts=1 oder delayMs=0 wird rot',async()=>{
 for(const viaCli of [false,true]){
  const sleeps=[];let calls=0;const s=store();
  const fetcher=async()=>{calls++;return {ok:false,status:503,json:async()=>({})};};
  const sleep=async ms=>{sleeps.push(ms);};
  let r;
  if(viaCli){const lines=[];const exit=await runObserve([],s.driver,{log:l=>lines.push(l),fetcher,sleep});r={exit,out:lines.join('\n')};}
  else r=await observeProduction({readGood:async()=>({ns:NS,good:{generation:G1.generation}}),driver:s.driver,keyFor:n=>n+'/o',fetcher,sleep});
  assert.equal(calls,3,'drei Versuche');assert.deepEqual(sleeps,[20000,20000],'zwei Pausen zu je 20 s');
  assert.equal(viaCli?r.exit:r.exitCode,1);
 }
});

/* --- d) GOOD wechselt zwischen Versuchen --- */
test('GOOD wechselt zwischen den Versuchen: Vergleich und Schluessel immer gegen den aktuellen GOOD',async()=>{
 // Versuch 1: GOOD = G1, ausgeliefert G2 (Mismatch). Versuch 2: GOOD inzwischen G2 -> PASS gegen G2.
 let reads=0;const s=store({hooks:{get:async(k,dflt)=>k===goodKey(NS)?(++reads===1?G1.bytes:G2.bytes):dflt()}});
 const r=await run([],s,{fetcher:json({generation:G2.generation})});
 assert.equal(r.exit,0);assert.equal(JSON.parse(s.objects.get(OBSERVED)).generation,G2.generation);
 // Auslieferung liefert zuerst G1 (alter GOOD), dann G2; GOOD wechselt mit: nie ein Beleg gegen den veralteten GOOD.
 let n=0;const seq=async()=>({ok:true,status:200,json:async()=>({generation:++n===1?G1.generation:G2.generation})});
 let g=0;const s2=store({hooks:{get:async(k,dflt)=>k===goodKey(NS)?(++g<=1?G2.bytes:G2.bytes):dflt()}});
 const r2=await run([],s2,{fetcher:seq});assert.equal(r2.exit,0);assert.equal(JSON.parse(s2.objects.get(OBSERVED)).generation,G2.generation);
 // Namespace-Wechsel: Schluessel folgt dem Namespace des aktuellen Versuchs
 const keys=[];const nss=['ns-alt','ns-neu'];let i=0;
 const res=await observeProduction({readGood:async()=>({ns:nss[Math.min(i++,1)],good:{generation:i===1?G1.generation:G2.generation}}),
  driver:{get:async k=>keys.includes(k)?Buffer.from(JSON.stringify({generation:G2.generation})):null,put:async k=>{keys.push(k);}},
  keyFor:ns=>ns+'/observed.json',fetcher:json({generation:G2.generation}),delayMs:0,sleep:async()=>{}});
 assert.deepEqual([res.status,res.attempts,keys],['PASS',2,['ns-neu/observed.json']]);
});

/* --- e) --same-generation-only mit Lesefehlern --- */
test('--same-generation-only: Lesefehler der Auslieferung bleibt nach Wiederholung REAL; Lesefehler der Vorbeobachtung ist BOOKKEEPING mit Code',async()=>{
 const s=store(),r=await run(['--same-generation-only'],s,{fetcher:status(503)});
 assert.equal(r.exit,1);assert.ok(r.lines.includes('::error::observe REAL (DELIVERY_HTTP_503)'),r.out);assert.equal(s.puts.length,0);
 const t=store({hooks:{get:async(k,dflt)=>{if(k===OBSERVED){const e=new Error('GET '+k+': HTTP 403 AccessDenied');throw e;}return dflt();}}});
 const b=await run(['--same-generation-only'],t,{fetcher:json({generation:G1.generation})});
 assert.equal(b.exit,3);assert.ok(b.lines.includes('::error::observe BOOKKEEPING (OBSERVED_READ_FAILED:HTTP_403)'),b.out);
 assert.doesNotMatch(b.out,/observed\.json/,'der Schluessel steht nicht im Log');
});

/* --- Readback: Generation statt Byte-Gleichheit --- */
test('Readback belegt die Generation: paralleler Schreiber derselben Generation ist kein Fehler, fremde oder fehlende Generation schon',async()=>{
 const mkOpts=get=>({readGood:async()=>({ns:NS,good:{generation:G1.generation}}),driver:{get,put:async()=>{}},keyFor:()=>'k',fetcher:json({generation:G1.generation}),delayMs:0,sleep:async()=>{}});
 const parallel=await observeProduction(mkOpts(async()=>observedBytes(G1.generation)));
 assert.equal(parallel.status,'PASS','gleiche Generation, anderer Zeitstempel');
 for(const back of [observedBytes(G2.generation),null,Buffer.from('{"schema":1}'),Buffer.from('keinjson')]){
  const r=await observeProduction(mkOpts(async()=>back));
  assert.deepEqual([r.class,r.code,r.exitCode],[CLASS.BOOKKEEPING,'OBSERVABILITY_READBACK_FAILED',EXIT.BOOKKEEPING]);
 }
});

/* --- P2: Diagnose-Codes, nie Schluessel oder Geheimnisse --- */
test('codeOf: Fehlerklasse statt Meldungstext (echte Formate des S3-Treibers)',async()=>{
 const cfg={endpoint:'https://r2.invalid',bucket:'b',accessKeyId:'AKIASECRETKEYID',secretAccessKey:'SECRETSECRET',maxRetries:0};
 const mkDriver=fetchImpl=>createS3Driver({...cfg,fetchImpl});
 const reply=(status,text='')=>async()=>({ok:status>=200&&status<300,status,headers:new Headers(),text:async()=>text,arrayBuffer:async()=>new ArrayBuffer(0)});
 const cases=[
  [()=>mkDriver(reply(403,'<Error>AccessDenied</Error>')).put('company-intelligence/geheim/pfad.json',Buffer.from('x')),'HTTP_403'],
  [()=>mkDriver(reply(401)).get('a/b.json'),'HTTP_401'],
  [()=>mkDriver(reply(503)).get('a/b.json'),'HTTP_503'],
  [()=>mkDriver(async()=>{throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});}).get('a/b.json'),'FETCH_FAILED:ECONNRESET'],
  [()=>mkDriver(async()=>{throw new TypeError('fetch failed');}).get('a/b.json'),'FETCH_FAILED'],
  [()=>mkDriver(async()=>{const e=new Error('The operation was aborted due to timeout');e.name='TimeoutError';throw e;}).get('a/b.json'),'TIMEOUT'],
  [()=>createS3Driver({...cfg,allowDeleteUnderPrefix:'geheim/'}),'ZERO_COST_GUARD_BLOCKED'],
  [()=>createS3DriverFromEnv({VU_HISTORY_S3_BUCKET:'b',VU_HISTORY_S3_ENDPOINT:'https://r2.invalid'}),'S3_CONFIG'],
 ];
 for(const [fn,code] of cases){
  let err;try{await fn();}catch(e){err=e;}
  assert.ok(err,code);assert.equal(codeOf(err),code);
  assert.doesNotMatch(codeOf(err),/geheim|pfad|AKIA|SECRET|r2\.invalid|a\/b/,'keine Schluessel oder Geheimnisse');
 }
 assert.equal(codeOf(Error('R2_PUT_TIMEOUT')),'R2_PUT_TIMEOUT');
 assert.equal(codeOf(Object.assign(new Error('disk full /pfad'),{code:'ENOSPC'})),'ENOSPC');
 assert.equal(codeOf(new RangeError('Bearer abc.def secret')),'RangeError');
 assert.equal(codeOf(Object.assign(new Error('x y'),{code:'mit Leerzeichen und Secret'})),'Error','unsichere Codes werden verworfen');
 assert.equal(codeOf(Error('X'.repeat(80))),'Error','zu lange Pseudo-Codes werden nicht durchgereicht');
 assert.equal(codeOf(null),'UNKNOWN');
});

/* --- a) echter CLI-Zweig im Kindprozess (Exit-Code der Prozessgrenze) --- */
function cli(args,{delivery={status:200,body:{generation:G1.generation}},objects={[goodKey(NS)]:G1.bytes},put,get}={}){
 const dir=mk('observe-cli-run-'),mock=join(dir,'mock.json');
 writeFileSync(mock,JSON.stringify({delivery,put,get,objects:Object.fromEntries(Object.entries(objects).map(([k,v])=>[k,Buffer.from(v).toString('base64')]))}));
 const r=spawnSync(process.execPath,['--import',pathToFileURL(here('./helpers/observe-cli-preload.mjs')).href,here('../refresh-run.mjs'),'observe',...args],{
  encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,OBSERVE_MOCK:mock,VU_HISTORY_S3_ENDPOINT:'https://r2.invalid',VU_HISTORY_S3_BUCKET:'bucket',
   VU_HISTORY_S3_ACCESS_KEY_ID:'AKIATESTKEYID',VU_HISTORY_S3_SECRET_ACCESS_KEY:'SECRETSECRETSECRET'}});
 const out=existsSync(mock+'.out')?JSON.parse(readFileSync(mock+'.out','utf8')):null;
 return {code:r.status,stdout:r.stdout,stderr:r.stderr,all:r.stdout+r.stderr,out};
}
test('CLI-Prozess: PASS -> Exit 0, observed.json geschrieben',()=>{
 const r=cli([]);assert.equal(r.code,0,r.all);assert.deepEqual(r.out.puts,[OBSERVED]);
 assert.equal(JSON.parse(r.out.objects[OBSERVED]).generation,G1.generation);
});
test('CLI-Prozess: Buchfuehrungsfehler (R2 PUT 403) -> Exit 3, Code im Log, keine Schluessel oder Geheimnisse',()=>{
 const r=cli([],{put:{status:403}});assert.equal(r.code,3,r.all);
 assert.match(r.stdout,/^::error::observe BOOKKEEPING \(OBSERVED_WRITE_FAILED:HTTP_403\)$/m);
 assert.doesNotMatch(r.all,/AKIATESTKEYID|SECRETSECRETSECRET|observed\.json|AccessDenied/);
});
test('CLI-Prozess: REAL (Auslieferung dauerhaft 503) -> Exit 1; Generationsabweichung -> Exit 1',()=>{
 const a=cli([],{delivery:{status:503}});assert.equal(a.code,1,a.all);assert.match(a.stdout,/^::error::observe REAL \(DELIVERY_HTTP_503\)$/m);assert.deepEqual(a.out.puts,[]);
 const b=cli([],{delivery:{status:200,body:{generation:G2.generation}}});assert.equal(b.code,1,b.all);assert.match(b.stdout,/^::error::observe REAL \(OBSERVED_PRODUCTION_GENERATION_MISMATCH\)$/m);
 const c=cli([],{delivery:{throw:true}});assert.equal(c.code,1,c.all);assert.match(c.stdout,/DELIVERY_FETCH_FAILED/);
});
test('CLI-Prozess: DEFERRED und Pages-Variante mit passender Vorbeobachtung -> Exit 0',()=>{
 const a=cli(['--same-generation-only']);assert.equal(a.code,0,a.all);assert.match(a.stdout,/OBSERVATION_DEFERRED_TO_FULL_REFRESH_QA \(PRIOR_OBSERVATION_MISSING\)/);assert.deepEqual(a.out.puts,[]);
 const b=cli(['--same-generation-only'],{objects:{[goodKey(NS)]:G1.bytes,[OBSERVED]:observedBytes(G1.generation)}});assert.equal(b.code,0,b.all);assert.deepEqual(b.out.puts,[OBSERVED]);
 const c=cli(['--same-generation-only'],{objects:{[goodKey(NS)]:G1.bytes,[OBSERVED]:observedBytes(G1.generation)},put:{status:403}});assert.equal(c.code,3,c.all);
});

/* --- f) Workflow-Vertrag: Snippets werden AUSGEFUEHRT --- */
const refreshWf=loadYamlFile(here('../../../.github/workflows/company-intelligence-refresh.yml'));
const pagesWf=loadYamlFile(here('../../../.github/workflows/pages-release.yml'));
const rSteps=refreshWf.jobs.refresh.steps,deploy=rSteps.find(s=>s.id==='deploy_live');
const pSteps=pagesWf.jobs[Object.keys(pagesWf.jobs).find(j=>pagesWf.jobs[j].steps?.some(s=>/^Record actual verified publication/.test(s.name||'')))].steps;
const record=pSteps.find(s=>/^Record actual verified publication/.test(s.name||''));
const handler=pSteps.find(s=>/^Fail-closed persistent consumer gate and emergency Pages rollback/.test(s.name||''));
const refreshSnippet=deploy.run.slice(deploy.run.indexOf('rc=0\nnode scripts/company_intelligence/refresh-run.mjs observe'));

function bash(script,{rc,curl=0}){
 const dir=mk('observe-wf-'),bin=join(dir,'bin');mkdirSync(bin);
 const stub=(name,body)=>{writeFileSync(join(bin,name),'#!/bin/sh\n'+body+'\n');chmodSync(join(bin,name),0o755);};
 stub('node','echo "$@" >> "$CALLS"\nexit "$STUB_RC"');stub('curl','exit "$STUB_CURL"');
 const files={out:join(dir,'output'),summary:join(dir,'summary'),calls:join(dir,'calls')};
 for(const f of Object.values(files))writeFileSync(f,'');
 writeFileSync(join(dir,'step.sh'),script);
 const r=spawnSync('bash',['-e','-o','pipefail',join(dir,'step.sh')],{encoding:'utf8',env:{PATH:bin+':'+process.env.PATH,RUNNER_TEMP:dir,GITHUB_OUTPUT:files.out,GITHUB_STEP_SUMMARY:files.summary,CALLS:files.calls,STUB_RC:String(rc),STUB_CURL:String(curl)}});
 return {code:r.status,stdout:r.stdout,output:readFileSync(files.out,'utf8'),summary:readFileSync(files.summary,'utf8'),calls:readFileSync(files.calls,'utf8')};
}
test('Workflow-Snippet Refresh: Exit 0->0, 1->1, 2->2, 3->0 plus Marker und Fehlerzeile, 4->4, 137->137',()=>{
 assert.match(refreshSnippet,/refresh-run\.mjs observe --health/,'Ausschnitt enthaelt den observe-Aufruf');
 for(const rc of [0,1,2,4,137]){
  const r=bash(refreshSnippet,{rc});assert.equal(r.code,rc,'rc '+rc);assert.equal(r.output,'','kein Marker bei rc '+rc);assert.doesNotMatch(r.stdout,/BOOKKEEPING/);
 }
 const r=bash(refreshSnippet,{rc:3});
 assert.equal(r.code,0);assert.equal(r.output,'observe_bookkeeping=true\n');assert.match(r.stdout,/^::error::Production verified, but recording the observation failed \(BOOKKEEPING\)/m);
 assert.equal(r.calls.trim().split('\n').length,1,'observe wird genau einmal aufgerufen');
});
test('Workflow-Snippet Pages: Exit 0->0, 1->1, 2->2, 3->0 mit Warnung und Step-Summary, 4->4, 137->137; ohne Refresh-Datei kein Aufruf',()=>{
 assert.match(record.run,/observe --same-generation-only/);
 for(const rc of [0,1,2,4,137]){
  const r=bash(record.run,{rc});assert.equal(r.code,rc,'rc '+rc);assert.equal(r.summary,'');assert.doesNotMatch(r.stdout,/BOOKKEEPING/);
 }
 const r=bash(record.run,{rc:3});
 assert.equal(r.code,0);assert.match(r.stdout,/^::warning::Production verified, but recording the observation failed \(BOOKKEEPING\)/m);assert.match(r.summary,/BOOKKEEPING, observe exit 3/);
 const none=bash(record.run,{rc:3,curl:22});assert.equal(none.code,0);assert.equal(none.calls,'','curl scheitert: observe wird nicht aufgerufen');
 assert.equal((record.run.match(/-eq 3/g)||[]).length,1,'nur Exit 3 wird anders behandelt');
});

/* Auswertung der if-Ausdruecke (nur die hier genutzte Teilmenge: &&, ||, ==, !=, !, Klammern, steps.X.outputs.Y) */
function evalIf(expr,{failure=false,steps={},inputs={}}){
 const js=String(expr).replace(/\s+/g,' ').replace(/\balways\(\)/g,'true').replace(/\bsuccess\(\)/g,'(!F)').replace(/\bfailure\(\)/g,'F').replace(/\bcancelled\(\)/g,'false')
  .replace(/\bsteps\.([A-Za-z_]+)\.(outputs|outcome)(?:\.([A-Za-z_]+))?/g,(m,id,kind,name)=>`S(${JSON.stringify(id)},${JSON.stringify(kind)},${JSON.stringify(name||'')})`)
  .replace(/\binputs\.([A-Za-z_]+)/g,(m,n)=>`I(${JSON.stringify(n)})`);
 const S=(id,kind,name)=>{const st=steps[id]||{};return kind==='outcome'?(st.outcome??''):(st.outputs?.[name]??'');};
 return Boolean(new Function('F','S','I',`return (${js});`)(failure,S,n=>inputs[n]));
}
test('Exit 3 im Refresh: Aggregate-health, Mark-Run und Upload laufen, der letzte Schritt macht den Lauf rot, kein Fail-closed-Handler',()=>{
 const agg=rSteps.find(s=>/^Aggregate health only/.test(s.name)),mark=rSteps.find(s=>/^Mark successful run/.test(s.name)),up=rSteps.find(s=>/^Upload run marker/.test(s.name));
 const last=rSteps[rSteps.length-1],closed=rSteps.find(s=>/^Fail closed on actual production regression/.test(s.name));
 // Exit 3 -> Schritt deploy_live endet mit 0 (siehe Snippet-Test): success, Output gesetzt
 const ctx={failure:false,steps:{deploy_live:{outcome:'success',outputs:{observe_bookkeeping:'true'}}},inputs:{verification:false}};
 for(const s of [agg,mark,up])assert.equal(evalIf(s.if,ctx),true,s.name);
 assert.equal(evalIf(last.if,ctx),true);assert.match(last.run,/exit 1/);assert.match(last.name,/Observation bookkeeping failed/);assert.equal(last,rSteps[rSteps.length-1]);
 assert.equal(evalIf(closed.if,ctx),false,'kein Rollback/disable/OFF-Dispatch bei Exit 3');
 // Gegenprobe: Exit 1 -> Schritt scheitert -> Fail closed laeuft, kein Abschlussmarker
 const bad={failure:true,steps:{deploy_live:{outcome:'failure',outputs:{}}},inputs:{verification:false}};
 assert.equal(evalIf(closed.if,bad),true);assert.equal(evalIf(mark.if,bad),false);assert.equal(evalIf(last.if,bad),false);
});
test('Exit 3 in Pages: der Fail-closed-Handler (Rollback, disable, OFF-Dispatch) laeuft nicht; bei Exit 1 weiterhin',()=>{
 const base={prepared:'true',enabled:'true'};
 const ok={failure:false,inputs:{},steps:{approved:{outcome:'success',outputs:base},deps:{outcome:'success'},live:{outcome:'success'},retry:{outputs:{result:''}}}};
 assert.equal(evalIf(handler.if,ok),false,'Record-Schritt mit Exit 3 endet 0: weder failure() noch fehlgeschlagene Pruefschritte');
 assert.equal(evalIf(handler.if,{...ok,failure:true}),true,'Gegenprobe: jeder andere Fehler loest den Handler wie bisher aus');
 assert.match(handler.run,/pages-rollback-decision\.mjs/);assert.match(handler.run,/refresh-run\.mjs rollback/);
});
