/* Automatischer Re-Freeze: Preflight/Postcheck (refreeze-auto-guard.mjs) und Workflow-Vertrag.
 * Kein Netz, kein R2, kein Workflow-Lauf: In-Memory-Treiber, eingespeiste Live-Antworten und Uhr;
 * das echte YAML wird mit dem abhaengigkeitsfreien Teilmengen-Parser (helpers/workflow-yaml.mjs) geprueft. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {refreshConfig,frozenInventory,frozenTickers} from '../refresh-approval.mjs';
import {prepareCandidate,commitGood,goodState,goodKey,activationKey,downloadGood} from '../refresh-storage.mjs';
import {universeConfig} from '../universe-approval.mjs';
import {approval} from '../production-approval.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {refreezeRollback,refreezeArchiveKey} from '../frozen-refreeze.mjs';
import {evaluatePreflight,evaluatePostcheck,readOnly,annotations,renderSummary,URGENT_MS,FREEZE_LIFETIME_MS} from '../refreeze-auto-guard.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const GUARD_PATH=fileURLToPath(new URL('../refreeze-auto-guard.mjs',import.meta.url));
const WORKFLOW_PATH=fileURLToPath(new URL('../../../.github/workflows/company-intelligence-refreeze-auto.yml',import.meta.url));
const LEGACY=refreshConfig.consumerNamespace,ROLLBACK=universeConfig.rollbackNamespace,H=3600000;
const gateKey=prefixFor(approval.namespace)+'gate.json',observedKey=prefixFor(LEGACY)+'observed.json';

function driver(){const objects=new Map(),puts=[];return {objects,puts,get:async k=>objects.get(k)||null,put:async(k,v)=>{puts.push(k);objects.set(k,Buffer.from(v));}};}
function fixture(n,generatedAt){
 const root=mkdtempSync(join(tmpdir(),'refreeze-auto-')),generation=n.toString(16).padStart(24,'0'),schema='vu-company-intelligence-1.0.0';
 const values={},index={schema,state:'AVAILABLE',generation,generatedAt,companies:{},tickers:{}};
 for(const [companyId,v] of Object.entries(frozenInventory)){
  const path=`snapshots/${generation}/${companyId}.json`,listings=v.tickers.map(symbol=>({symbol,instrumentId:'vu_12345678901234'}));
  values[path]={schema,state:'AVAILABLE',companyId,generatedAt,listings,companyProfile:{state:'AVAILABLE',language:'de'},latestFinancials:{state:'MISSING'},news:[],events:[],earnings:[],filings:[],calls:[],timeline:[],materials:[]};
  index.companies[companyId]=path;for(const symbol of v.tickers)index.tickers[symbol]=[{companyId,instrumentId:'vu_12345678901234'}];
 }
 values['index.json']=index;const assets={};
 for(const [path,v] of Object.entries(values)){const bytes=Buffer.from(JSON.stringify(v));mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),bytes);assets[path]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
 const m={schema:1,generation,generatedAt,assets,tickers:frozenTickers,sourceUsagePolicy:refreshConfig.sourceUsagePolicy,productionApproval:refreshConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',profiles:45,privateCompanies:5120,checkpointSha256:'a'.repeat(64)}};
 writeFileSync(join(root,'manifest.json'),JSON.stringify(m));return {root,m};
}
async function advance(d,namespace,f,health={marker:f.m.generation}){const good=await goodState(d,namespace),r=await prepareCandidate(d,{namespace,directory:f.root,good});return commitGood(d,{namespace,payloadNamespace:r.payloadNamespace,manifest:r.manifest,health,inventory:frozenInventory,expectedGood:good});}

/* Gesunde Lage am Tag 4 nach dem Freeze: Freeze 96 h alt, Legacy-GOOD 1 h alt, Gate offen, Universum nicht live. */
/* Fixtures veralteter Staende duerfen nicht an der Veroeffentlichungsgrenze (7 Tage) scheitern: Uhr nur beim Bauen zurueckstellen. */
async function withClock(offsetMs,fn){const real=Date.now;Date.now=()=>real()-offsetMs;try{return await fn();}finally{Date.now=real;}}
async function world({freezeAge=96*H,refreshAge=1*H,publicationAge=0.5*H,legacyGeneratedAge=1*H,legacyOldAge=Math.min(freezeAge-6*H,30*H)}={}){
 const now=Date.now(),dirs=[],d=driver();
 const mk=(n,age)=>{const f=fixture(n,new Date(now-age).toISOString());dirs.push(f.root);return f;};
 const frozen=mk(0x71dc,freezeAge),legacyOld=mk(0x1001,legacyOldAge),current=mk(0x6bf1,legacyGeneratedAge);
 await withClock(Math.max(0,freezeAge-24*H),()=>advance(d,ROLLBACK,frozen));await withClock(Math.max(0,legacyOldAge-24*H),()=>advance(d,LEGACY,legacyOld));
 await withClock(Math.max(0,legacyGeneratedAge-24*H),()=>advance(d,LEGACY,current,{lastSuccessfulRefresh:new Date(now-refreshAge).toISOString(),lastSuccessfulConsumerBuild:new Date(now-refreshAge).toISOString()}));
 d.objects.set(activationKey(),Buffer.from(JSON.stringify({schema:1,state:'ROLLBACK_46',approvalId:universeConfig.approvalId,generation:'f'.repeat(24)})));
 d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
 d.objects.set(goodKey(universeConfig.consumerNamespace),Buffer.from(JSON.stringify({schema:1,state:'GOOD',generation:'e'.repeat(24)})));
 d.objects.set(observedKey,Buffer.from(JSON.stringify({schema:1,generation:current.m.generation,lastSuccessfulProductionPublication:new Date(now-publicationAge).toISOString()})));
 const temporary=mkdtempSync(join(tmpdir(),'refreeze-auto-tmp-'));dirs.push(temporary);
 const gen=current.m.generation;
 const routes={
  '/company-intelligence-delivery.json':{body:{status:'PASS',generation:gen,cohortStocks:46,issuers:45}},
  '/company-intelligence/data/index.json':{body:{schema:'vu-company-intelligence-1.0.0',state:'AVAILABLE',generation:gen,companies:{},tickers:{}}},
  '/company-intelligence/config/rollout.js':{body:rollout(gen)},
  '/company-intelligence-refresh.json':{body:{status:'PASS',generation:gen,manifest:{generation:gen,assets:current.m.assets,tickers:frozenTickers}}}
 };
 const fetchImpl=async url=>{
  const r=routes[new URL(url).pathname];
  if(!r)return new Response('not found',{status:404});
  if(r.throws)throw Object.assign(new Error('boom'),{name:'TypeError'});
  return new Response(typeof r.body==='string'?r.body:JSON.stringify(r.body),{status:r.status||200});
 };
 d.puts.length=0;
 return {d,now,frozen,legacyOld,current,gen,routes,fetchImpl,temporary,mk,
  preflight:(extra={})=>evaluatePreflight({driver:d,fetchImpl,now:Date.now(),...extra}),
  refreeze:(extra={})=>refreezeRollback(d,{temporary:mkdtempSync(join(tmpdir(),'refreeze-auto-run-')),fetchDelivery:async()=>routes['/company-intelligence-delivery.json'].body,...extra}),
  done:()=>dirs.forEach(x=>rmSync(x,{recursive:true,force:true}))};
}
const rollout=(gen,extra='')=>`(function(g){'use strict';const cohort=["AAPL","NVDA"];const config={stage:1,${extra}cohort,eligibility:null,expectedGeneration:"${gen}",base:"/company-intelligence/data/"};g.VUCompanyIntelligenceRollout=config;})(globalThis);`;
const byId=(v,id)=>v.checks.find(c=>c.id===id);
const failedIds=v=>v.checks.filter(c=>c.status==='FAIL').map(c=>c.id);
const ids=['gate-open','refresh-fresh','health','generation-unanimous','artifacts','rollback-archivable'];

test('gesunder Re-Freeze: alle sechs Pruefungen bestehen, Preflight schreibt nichts, Re-Freeze und Nachpruefung gruen',async()=>{
 const w=await world();try{
  const v=await w.preflight();
  assert.equal(v.decision,'REFREEZE');assert.equal(v.generation,w.gen);assert.equal(v.writes,'NONE');
  assert.deepEqual(v.checks.map(c=>c.id),ids);assert.deepEqual(failedIds(v),[]);
  assert.equal(w.d.puts.length,0,'Preflight schreibt nichts');
  assert.equal(v.freeze.expired,false);assert.equal(v.urgent,false);
  assert.ok(v.freeze.hoursToExpiry>60&&v.freeze.hoursToExpiry<80,'96 h alt, 168 h Laufzeit: '+v.freeze.hoursToExpiry);
  const release=await w.refreeze({expectGeneration:v.generation});
  assert.equal(release.status,'REFROZEN');
  const post=await evaluatePostcheck({driver:w.d,release,expectGeneration:v.generation,preflight:v});
  assert.equal(post.decision,'VERIFIED',JSON.stringify(post.checks.filter(c=>c.status==='FAIL')));
  assert.deepEqual(post.checks.map(c=>c.id),['result','flags','generation','new-freeze','archive']);
  const frozen=await goodState(w.d,ROLLBACK);
  assert.ok(Date.parse(frozen.manifest.generatedAt)+FREEZE_LIFETIME_MS>Date.now(),'neuer Freeze in der Zukunft gueltig');
  assert.match(renderSummary(v),/REFREEZE/);assert.deepEqual(annotations(v),[]);
 }finally{w.done();}
});

test('veraltete Daten: Refresh aelter als 12 h oder Health nicht HEALTHY -> BLOCKED, keine Freigabe, Warnung (Freeze 72 h Rest)',async()=>{
 for(const [age,expected] of [[13*H,['refresh-fresh','health']],[10*H,['health']]]){
  const w=await world({refreshAge:age});try{
   const v=await w.preflight();
   assert.equal(v.decision,'BLOCKED');assert.deepEqual(failedIds(v),expected);
   assert.equal(v.urgent,false);assert.ok(annotations(v).every(a=>a.startsWith('::warning::')));
   assert.equal(w.d.puts.length,0);
  }finally{w.done();}
 }
});

test('veraltete Daten bei Freeze-Verfall in < 48 h: dringend, ::error::, kein Re-Freeze',async()=>{
 const w=await world({freezeAge:140*H,refreshAge:14*H});try{
  const v=await w.preflight();
  assert.equal(v.decision,'BLOCKED');assert.equal(v.urgent,true);assert.ok(v.freeze.hoursToExpiry<48);
  assert.ok(annotations(v).every(a=>a.startsWith('::error::')),annotations(v).join('\n'));
  assert.match(renderSummary(v),/DRINGEND/);assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('geschlossenes Gate: R2-Gate DISABLED mit fehlender delivery.json, index DISABLED und rollout productionOff blocken je allein oder gemeinsam',async()=>{
 const w=await world();try{
  w.routes['/company-intelligence/config/rollout.js'].body=rollout(w.gen,'productionOff:true,');
  let v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.deepEqual(failedIds(v),['gate-open']);assert.match(byId(v,'gate-open').detail,/ROLLOUT_PRODUCTION_OFF/);
  w.routes['/company-intelligence/config/rollout.js'].body=rollout(w.gen);
  w.routes['/company-intelligence/data/index.json'].body={schema:'vu-company-intelligence-1.0.0',state:'DISABLED',companies:{},tickers:{}};
  v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(byId(v,'gate-open').detail,/INDEX_STATE_DISABLED/);
  w.routes['/company-intelligence/data/index.json'].body={schema:'vu-company-intelligence-1.0.0',state:'AVAILABLE',generation:w.gen,companies:{},tickers:{}};
  w.d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'DISABLED',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
  delete w.routes['/company-intelligence-delivery.json'];
  v=await w.preflight();assert.equal(v.decision,'BLOCKED');
  assert.ok(failedIds(v).includes('gate-open')&&failedIds(v).includes('health'));assert.match(byId(v,'gate-open').detail,/DELIVERY_HTTP_404/);
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('fehlende Artefakte: refresh.json, observed.json, delivery.json, abweichende Manifest-Hashes -> BLOCKED',async()=>{
 const w=await world();try{
  const saved=w.routes['/company-intelligence-refresh.json'];
  delete w.routes['/company-intelligence-refresh.json'];
  let v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(byId(v,'artifacts').detail,/REFRESH_JSON_UNAVAILABLE/);
  w.routes['/company-intelligence-refresh.json']={body:{...saved.body,manifest:{...saved.body.manifest,assets:{...saved.body.manifest.assets,'index.json':{bytes:1,sha256:'0'.repeat(64)}}}}};
  v=await w.preflight();assert.deepEqual(failedIds(v),['artifacts']);assert.match(byId(v,'artifacts').detail,/MANIFEST_HASHES_DIFFER/);
  w.routes['/company-intelligence-refresh.json']=saved;
  w.d.objects.delete(observedKey);
  v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(byId(v,'artifacts').detail,/OBSERVED_MISSING/);
  w.d.objects.set(observedKey,Buffer.from(JSON.stringify({schema:1,generation:w.gen,lastSuccessfulProductionPublication:new Date().toISOString()})));
  w.routes['/company-intelligence-delivery.json']={status:500,body:'x'};
  v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(byId(v,'gate-open').detail,/DELIVERY_HTTP_500/);
  w.routes['/company-intelligence-delivery.json']={throws:true};
  v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(byId(v,'gate-open').detail,/DELIVERY_HTTP_FETCH_FAILED/);
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('Mischstand der Generationen: index, rollout, refresh oder observed weichen ab -> BLOCKED mit Nennung',async()=>{
 const w=await world();try{
  const other='1'.repeat(24);
  w.routes['/company-intelligence/data/index.json'].body={schema:'vu-company-intelligence-1.0.0',state:'AVAILABLE',generation:other,companies:{},tickers:{}};
  let v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.deepEqual(failedIds(v),['generation-unanimous']);assert.match(byId(v,'generation-unanimous').detail,/GENERATION_MIXED:index=1{24}/);
  w.routes['/company-intelligence/data/index.json'].body.generation=w.gen;
  w.routes['/company-intelligence/config/rollout.js'].body=rollout(other);
  v=await w.preflight();assert.deepEqual(failedIds(v),['generation-unanimous']);assert.match(byId(v,'generation-unanimous').detail,/rollout=/);
  w.routes['/company-intelligence/config/rollout.js'].body=rollout(w.gen);
  w.routes['/company-intelligence-delivery.json'].body={status:'PASS',generation:other,cohortStocks:46,issuers:45};
  v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(byId(v,'generation-unanimous').detail,/delivery=/);assert.match(byId(v,'health').detail,/MISMATCH/);
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('Universum aktiv oder Archiv-Schluessel belegt -> BLOCKED; byte-identisches Archiv bleibt erlaubt (idempotent)',async()=>{
 const w=await world();try{
  const old=await goodState(w.d,ROLLBACK),oldBytes=w.d.objects.get(goodKey(ROLLBACK)),key=refreezeArchiveKey(old.generation);
  w.d.objects.set(key,Buffer.from('{"fremd":true}'));
  let v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.deepEqual(failedIds(v),['rollback-archivable']);assert.match(byId(v,'rollback-archivable').detail,/ARCHIVE_COLLISION/);
  const {refreezeArchiveBytes}=await import('../frozen-refreeze.mjs');
  w.d.objects.set(key,refreezeArchiveBytes(old,oldBytes));
  v=await w.preflight();assert.equal(v.decision,'REFREEZE');
  w.d.objects.delete(key);
  w.d.objects.set(activationKey(),Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId,generation:w.gen})));
  v=await w.preflight();assert.deepEqual(failedIds(v),['rollback-archivable']);assert.match(byId(v,'rollback-archivable').detail,/UNIVERSE_ACTIVE/);
  w.d.objects.delete(goodKey(ROLLBACK));
  v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(byId(v,'rollback-archivable').detail,/ROLLBACK_NAMESPACE_UNREADABLE:ROLLBACK_POINTER_MISSING/);assert.equal(v.urgent,true,'unbekannte Restlaufzeit gilt als dringend');
 }finally{w.done();}
});

test('wiederholte Ausfuehrung: nach REFROZEN folgt SKIP; ALREADY_CURRENT schreibt nichts und verlaengert nicht; Nachpruefung bleibt gruen',async()=>{
 const w=await world();try{
  const v1=await w.preflight(),r1=await w.refreeze({expectGeneration:v1.generation});
  assert.equal(r1.status,'REFROZEN');
  const v2=await w.preflight();
  assert.equal(v2.decision,'SKIP');assert.equal(v2.reason,'FREEZE_ALREADY_CURRENT_GENERATION');assert.equal(v2.urgent,false);
  assert.deepEqual(annotations(v2).map(a=>a.slice(0,10)),['::notice::']);
  const before=[...w.d.objects.entries()].map(([k,b])=>k+createHash('sha256').update(b).digest('hex')).sort();
  const r2=await w.refreeze({expectGeneration:v1.generation});
  assert.equal(r2.status,'ALREADY_CURRENT');
  assert.deepEqual([...w.d.objects.entries()].map(([k,b])=>k+createHash('sha256').update(b).digest('hex')).sort(),before,'ALREADY_CURRENT veraendert keinen Speicherstand');
  const post=await evaluatePostcheck({driver:w.d,release:r2,expectGeneration:v1.generation,preflight:v2});
  assert.equal(post.decision,'VERIFIED',JSON.stringify(post.checks));
  // Auch der Freeze selbst bleibt dabei unveraendert (Verfall nicht verlaengert).
  assert.equal((await goodState(w.d,ROLLBACK)).manifest.generatedAt,w.current.m.generatedAt);
 }finally{w.done();}
});

test('SKIP ohne neueren Legacy-GOOD (kein Fehler); ist der Freeze dabei nahe am Verfall, ist das nicht heilbar -> BLOCKED, dringend',async()=>{
 // Legacy-GOOD ist (laut generatedAt) nicht neuer als der Freeze: nichts einzufrieren.
 const w=await world({freezeAge:1*H,legacyOldAge:3*H,legacyGeneratedAge:2*H});try{
  const v=await w.preflight();
  assert.equal(v.decision,'SKIP',JSON.stringify(v.checks.filter(c=>c.status==='FAIL')));assert.equal(v.reason,'NO_NEWER_LEGACY_GOOD');assert.equal(v.urgent,false);
  assert.equal(w.d.puts.length,0);assert.ok(annotations(v)[0].startsWith('::notice::'));
 }finally{w.done();}
 // Nahe am Verfall (Freeze 150 h alt, Legacy-GOOD gleich alt, Health aber frisch): nicht heilbar.
 const x=await world({freezeAge:150*H,legacyOldAge:152*H,legacyGeneratedAge:150*H});try{
  const v=await x.preflight();
  assert.equal(v.decision,'BLOCKED');assert.equal(v.reason,'FREEZE_EXPIRING_NOT_HEALABLE');assert.equal(v.urgent,true);
  assert.ok(annotations(v).every(a=>a.startsWith('::error::')));
 }finally{x.done();}
});

test('Fehler waehrend der Archivierung: Re-Freeze bricht ab, kein Teilzustand, Nachpruefung rot mit Beleg',async()=>{
 const w=await world();try{
  const v=await w.preflight();
  const before=w.d.objects.get(goodKey(ROLLBACK));
  const old=await goodState(w.d,ROLLBACK),archive=refreezeArchiveKey(old.generation),realPut=w.d.put;
  w.d.put=async(k,val)=>{if(k===archive)throw Object.assign(new Error('ARCHIVE_WRITE_FAILED'),{code:'ARCHIVE_WRITE_FAILED'});return realPut(k,val);};
  await assert.rejects(w.refreeze({expectGeneration:v.generation}),/ARCHIVE_WRITE_FAILED/);
  assert.ok(w.d.objects.get(goodKey(ROLLBACK)).equals(before),'Rollback-Zeiger unveraendert');
  assert.equal(w.d.objects.has(archive),false);
  const post=await evaluatePostcheck({driver:w.d,release:{status:'FAIL',code:'ARCHIVE_WRITE_FAILED'},expectGeneration:v.generation,preflight:v});
  assert.equal(post.decision,'FAILED');assert.equal(post.urgent,true);
  assert.equal(byId(post,'result').status,'FAIL');assert.equal(byId(post,'no-partial-state').status,'PASS');
  assert.ok(annotations(post).some(a=>a.startsWith('::error::')));
  // Ein veraenderter Zeiger nach Fehlschlag wird als Teilzustand gemeldet.
  w.d.objects.set(goodKey(ROLLBACK),Buffer.concat([before,Buffer.from(' ')]));
  const bad=await evaluatePostcheck({driver:w.d,release:null,expectGeneration:v.generation,preflight:v});
  assert.equal(byId(bad,'no-partial-state').status,'FAIL');
 }finally{w.done();}
});

test('Nachpruefung rot: falsche Flags, falsche Generation, fehlendes Archiv, abgelaufener neuer Freeze',async()=>{
 const w=await world();try{
  const v=await w.preflight(),release=await w.refreeze({expectGeneration:v.generation});
  const run=(r,gen=v.generation,now)=>evaluatePostcheck({driver:w.d,release:r,expectGeneration:gen,preflight:v,now});
  assert.equal((await run(release)).decision,'VERIFIED');
  assert.match(byId(await run({...release,gateModified:true}),'flags').detail,/FLAG_NOT_FALSE:gateModified/);
  const{universeGoodModified,...missing}=release;assert.match(byId(await run(missing),'flags').detail,/universeGoodModified/);
  assert.equal(byId(await run(release,'2'.repeat(24)),'generation').status,'FAIL');
  assert.equal((await run({status:'WEIRD'})).decision,'FAILED');
  assert.match(byId(await run(release,v.generation,Date.now()+FREEZE_LIFETIME_MS),'new-freeze').detail,/NEW_FREEZE_ALREADY_EXPIRED/);
  w.d.objects.delete(release.archiveKey);
  assert.match(byId(await run(release),'archive').detail,/ARCHIVE_MISSING/);
 }finally{w.done();}
});

test('abgelaufene Rollback-Generation: Verfall blockiert nicht, refreeze heilt; Download des alten Freeze scheitert mit CONSUMER_EXPIRED',async()=>{
 const w=await world({freezeAge:8*24*H});try{
  await assert.rejects(downloadGood(w.d,{namespace:ROLLBACK,output:join(w.temporary,'expired')}),/CONSUMER_EXPIRED/);
  const v=await w.preflight();
  assert.equal(v.decision,'REFREEZE',JSON.stringify(v.checks.filter(c=>c.status==='FAIL')));
  assert.equal(v.freeze.expired,true);assert.ok(v.freeze.hoursToExpiry<0);assert.match(renderSummary(v),/ABGELAUFEN/);
  const release=await w.refreeze({expectGeneration:v.generation});assert.equal(release.status,'REFROZEN');
  const post=await evaluatePostcheck({driver:w.d,release,expectGeneration:v.generation,preflight:v});assert.equal(post.decision,'VERIFIED');
  const healed=await downloadGood(w.d,{namespace:ROLLBACK,output:join(w.temporary,'healed')});assert.equal(healed.generation,w.gen);
 }finally{w.done();}
 // Abgelaufen und Voraussetzung scheitert: laut (error), kein Re-Freeze.
 const x=await world({freezeAge:8*24*H,refreshAge:20*H});try{
  const v=await x.preflight();assert.equal(v.decision,'BLOCKED');assert.equal(v.urgent,true);assert.ok(annotations(v).every(a=>a.startsWith('::error::')));
 }finally{x.done();}
});

test('Guard ist rein lesend: Treiber ohne put, keine Schreib-/Prozess-/Gate-Funktionen im Quelltext',async()=>{
 const d=driver(),ro=readOnly(d);
 assert.equal(typeof ro.get,'function');assert.equal(ro.put,undefined);assert.throws(()=>{ro.put('x',Buffer.from('y'));},TypeError);assert.ok(Object.isFrozen(ro));
 const src=readFileSync(GUARD_PATH,'utf8');
 const code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
 for(const re of [/\.put\(/,/\bchild_process\b/,/\bexecFile|\bspawn|\bexecSync/,/setProductionGate/,/restore46/,/recover_full_scope/,/gh workflow/,/universe-release/,/pages-release/,/\bactivate\b/i,/\brollback\(/i,/createS3DriverFromEnv\(\)\.put/])assert.doesNotMatch(code,re,String(re));
 // Einziger Netzzugriff: GET auf research.visionuniverse.de (Live-Objekte), Schreibzugriffe nur auf lokale Evidenz-Dateien.
 assert.match(code,/LIVE_ORIGIN\+path/);
 assert.deepEqual([...code.matchAll(/writeFileSync\(|appendFileSync\(/g)].length,3);
});

/* ---------- Workflow-Vertrag ---------- */
const stepOf=(doc,id)=>doc.jobs.refreeze.steps.find(s=>s.id===id);
/* Alle Vertragspruefungen in einer Funktion, damit Mutationen sie wiederverwenden. */
function assertWorkflow(doc,raw){
 assert.deepEqual(doc.permissions,{contents:'read'});
 assert.deepEqual(doc.concurrency,{group:'company-intelligence-continuous-production','cancel-in-progress':false});
 assert.deepEqual(Object.keys(doc.on).sort(),['schedule','workflow_dispatch']);
 const job=doc.jobs.refreeze;assert.deepEqual(Object.keys(doc.jobs),['refreeze']);
 assert.equal(job.if,"github.ref == 'refs/heads/main'");
 const checkout=job.steps.find(s=>s.uses==='actions/checkout@v4');
 assert.equal(checkout.with.ref,'${{ github.ref }}');
 const guard=stepOf(doc,'guard'),refreeze=stepOf(doc,'refreeze'),post=stepOf(doc,'postcheck');
 assert.ok(guard&&refreeze&&post,'Schritte guard/refreeze/postcheck');
 const order=job.steps.map(s=>s.id||s.uses);
 assert.ok(order.indexOf('guard')<order.indexOf('refreeze')&&order.indexOf('refreeze')<order.indexOf('postcheck'));
 assert.match(guard.run,/refreeze-auto-guard\.mjs preflight/);
 assert.equal(refreeze.if,"steps.guard.outputs.decision == 'REFREEZE'");
 assert.equal(refreeze.env.EXPECT_GENERATION,'${{ steps.guard.outputs.generation }}');
 assert.match(refreeze.run,/universe-release\.mjs refreeze --temporary "\$RUNNER_TEMP\/universe-release" --expect-generation "\$EXPECT_GENERATION"/);
 assert.match(refreeze.run,/\^\[0-9a-f\]\{24\}\$/);
 assert.match(post.if,/steps\.guard\.outputs\.decision == 'REFREEZE'/);
 assert.match(post.run,/refreeze-auto-guard\.mjs verify .*--expect-generation "\$EXPECT_GENERATION"/);
 const upload=job.steps.find(s=>s.uses==='actions/upload-artifact@v4');
 assert.equal(upload.with.name,'refreeze-auto-${{ github.run_id }}');assert.equal(upload.if,'always()');
 // Genau ein Aufruf des Release-Befehls, und nur mit refreeze.
 const runs=job.steps.map(s=>s.run||'').join('\n');
 assert.equal([...runs.matchAll(/universe-release\.mjs/g)].length,1);
 for(const re of [/\binputs\./,/\bgh\s/,/workflow run/,/\b(enable|disable|stage|activate|restore46|recover|recover_full_scope)\b/i,/\brollback\b/i,/\bhealth\b/i,/setProductionGate/,/pages-release/,/gate\.json/])assert.doesNotMatch(runs,re,String(re));
 assert.doesNotMatch(raw,/\$\{\{\s*inputs\./);assert.doesNotMatch(raw,/actions:\s*write|contents:\s*write/);assert.doesNotMatch(raw,/gh workflow run|workflow_dispatch:\s*\n\s+inputs/);
 for(const s of job.steps)assert.doesNotMatch(s.run||'',/\$\{\{/,'keine Ausdruecke im Shell-Text: '+s.name);
}
const raw=()=>readFileSync(WORKFLOW_PATH,'utf8');
const loadText=text=>{const p=join(mkdtempSync(join(tmpdir(),'wf-')),'w.yml');writeFileSync(p,text);try{return loadYamlFile(p);}finally{rmSync(join(p,'..'),{recursive:true,force:true});}};

test('Workflow-Vertrag: contents read, gemeinsame Concurrency-Gruppe ohne Abbruch, nur main, Checkout ref, Eingaben nur ueber env',()=>{
 assertWorkflow(loadText(raw()),raw());
});

test('Workflow: keine Gate-Aenderung, kein Pages-Dispatch, keine Schreibrechte, genau ein Release-Befehl: refreeze',()=>{
 const text=raw(),doc=loadText(text);
 assert.doesNotMatch(text.replace(/^\s*#.*$/gm,''),/gh workflow run|pages-release|restore46|recover_full_scope|setProductionGate|--expect-generation\s+""/);
 const job=doc.jobs.refreeze,commands=job.steps.filter(s=>/universe-release\.mjs/.test(s.run||''));
 assert.equal(commands.length,1);assert.equal(commands[0].id,'refreeze');
 assert.equal([...commands[0].run.matchAll(/universe-release\.mjs (\S+)/g)].map(m=>m[1]).join(),'refreeze');
 assert.equal(job.steps.filter(s=>s.env&&Object.values(s.env).some(v=>/secrets\./.test(String(v)))).length,0,'Secrets nur auf Job-Ebene wie im Release-Workflow');
 assert.deepEqual(Object.keys(job.env).sort(),['VU_HISTORY_S3_ACCESS_KEY_ID','VU_HISTORY_S3_BUCKET','VU_HISTORY_S3_ENDPOINT','VU_HISTORY_S3_REGION','VU_HISTORY_S3_SECRET_ACCESS_KEY']);
 assert.equal(Object.keys(job.env).includes('GH_TOKEN'),false);
});

test('Concurrency strukturell: dieselbe Gruppe wie universe-release und Refresh-Produktionslauf, damit nie parallel geschrieben wird',()=>{
 const rel=loadYamlFile(fileURLToPath(new URL('../../../.github/workflows/company-intelligence-universe-release.yml',import.meta.url)));
 const mine=loadText(raw());
 assert.equal(mine.concurrency.group,rel.concurrency.group);assert.equal(mine.concurrency['cancel-in-progress'],false);
 const refreshText=readFileSync(fileURLToPath(new URL('../../../.github/workflows/company-intelligence-refresh.yml',import.meta.url)),'utf8');
 assert.match(refreshText,/group: company-intelligence-continuous-\$\{\{ inputs\.verification && 'verification' \|\| 'production' \}\}/);
 assert.equal(mine.concurrency.group,'company-intelligence-continuous-production');
});

// Naechster Cron-Zeitpunkt fuer das Muster "M H Schritt-N * *" (UTC), Tag-des-Monats-Raster 1,1+N,...: einfacher Evaluator.
function nextRuns(cron,from,count){
 const [mi,h,dom,mon,dow]=cron.split(' ');assert.deepEqual([mon,dow],['*','*']);const step=Number(dom.match(/^\*\/(\d+)$/)[1]);
 const out=[];for(let t=Date.UTC(from.getUTCFullYear(),from.getUTCMonth(),from.getUTCDate(),Number(h),Number(mi));out.length<count;t+=86400000){
  const dt=new Date(t);if(t>from.getTime()&&(dt.getUTCDate()-1)%step===0)out.push(dt);
 }
 return out;
}
test('Zeitplan: Minuten-Jitter nicht auf :00/:30, Abstand hoechstens 4 Tage, erster Lauf nach 2026-10-16 ist 2026-10-17 05:23 UTC',()=>{
 const cron=loadText(raw()).on.schedule[0].cron;
 assert.equal(cron,'23 5 */4 * *');
 const [mi]=cron.split(' ');assert.ok(!['0','30'].includes(mi));
 const runs=nextRuns(cron,new Date('2026-10-16T09:33:00Z'),3);
 assert.deepEqual(runs.map(r=>r.toISOString()),['2026-10-17T05:23:00.000Z','2026-10-21T05:23:00.000Z','2026-10-25T05:23:00.000Z']);
 // Jahreslauf: groesster Abstand zwischen zwei Laeufen (Monatswechsel inklusive) bleibt unter der 6-Tage-Obergrenze.
 const year=nextRuns(cron,new Date('2026-01-01T00:00:00Z'),95);let max=0;
 for(let i=1;i<year.length;i++)max=Math.max(max,(year[i]-year[i-1])/86400000);
 assert.ok(max<=4,'groesster Abstand '+max+' Tage');
 assert.ok(URGENT_MS===48*H);
});

/* ---------- Mutationstests ---------- */
test('Mutationstest Workflow: jede entfernte oder aufgeweichte Zusicherung macht den Vertragstest rot',()=>{
 const text=raw();assertWorkflow(loadText(text),text);
 const mutants={
  'Gate-Bedingung des Re-Freeze entfernt':t=>t.replace("        if: steps.guard.outputs.decision == 'REFREEZE'\n        env:\n          EXPECT_GENERATION: ${{ steps.guard.outputs.generation }}\n        run: |\n          set -euo","        env:\n          EXPECT_GENERATION: ${{ steps.guard.outputs.generation }}\n        run: |\n          set -euo"),
  '--expect-generation entfernt':t=>t.replace(' --expect-generation "$EXPECT_GENERATION"\n      - name: Postcheck','\n      - name: Postcheck'),
  'Preflight entfernt':t=>t.replace('refreeze-auto-guard.mjs preflight','echo preflight'),
  'Concurrency-Gruppe geaendert':t=>t.replace('group: company-intelligence-continuous-production','group: company-intelligence-refreeze-auto'),
  'Abbruch laufender Laeufe':t=>t.replace('cancel-in-progress: false','cancel-in-progress: true'),
  'actions: write':t=>t.replace('  contents: read\n','  contents: read\n  actions: write\n'),
  'Pages-Dispatch':t=>t.replace('--expect-generation "$EXPECT_GENERATION"\n      - name: Postcheck','--expect-generation "$EXPECT_GENERATION"\n          gh workflow run pages-release.yml --ref main\n      - name: Postcheck'),
  'zweiter Release-Modus':t=>t.replaceAll('universe-release.mjs refreeze','universe-release.mjs rollback'),
  'Checkout ohne ref':t=>t.replace('          ref: ${{ github.ref }}\n',''),
  'Nachpruefung entfernt':t=>t.replace('id: postcheck','id: nachher'),
  'Eingabe im Shell-Text':t=>t.replace('"$EXPECT_GENERATION"\n      - name: Postcheck','"${{ inputs.expect }}"\n      - name: Postcheck'),
  'kein Branch-Filter':t=>t.replace("    if: github.ref == 'refs/heads/main'\n",''),
  'Artefaktname':t=>t.replace('refreeze-auto-${{ github.run_id }}','refreeze-auto')
 };
 for(const [name,mutate] of Object.entries(mutants)){
  const mutated=mutate(text);assert.notEqual(mutated,text,'Mutation greift: '+name);
  assert.throws(()=>assertWorkflow(loadText(mutated),mutated),`Mutation "${name}" muss den Vertragstest rot machen`);
 }
});

test('Mutationstest Guard: wird eine Pruefung entfernt, entscheidet derselbe Fehlerfall faelschlich REFREEZE',async()=>{
 const src=readFileSync(GUARD_PATH,'utf8'),dir=mkdtempSync(join(tmpdir(),'guard-mutant-'));
 const abs=src.replace(/from '\.\//g,`from '${pathToFileURL(join(GUARD_PATH,'..')).href}/`);
 const scenarios={
  checkGateOpen:{id:'gate-open',arrange:w=>{w.routes['/company-intelligence/config/rollout.js'].body=rollout(w.gen,'productionOff:true,');}},
  checkRefreshFresh:{id:'refresh-fresh',arrange:async w=>{const g=await goodState(w.d,LEGACY);g.health.lastSuccessfulRefresh=new Date(Date.now()+2*H).toISOString();const raw=Buffer.from(JSON.stringify({...JSON.parse(w.d.objects.get(goodKey(LEGACY))),health:g.health}));w.d.objects.set(goodKey(LEGACY),raw);}},
  checkHealth:{id:'health',arrange:w=>{w.d.objects.set(observedKey,Buffer.from(JSON.stringify({schema:1,generation:w.gen,lastSuccessfulProductionPublication:new Date(Date.now()-10*H).toISOString()})));}},
  checkGeneration:{id:'generation-unanimous',arrange:w=>{w.routes['/company-intelligence/data/index.json'].body.generation='1'.repeat(24);}},
  checkArtifacts:{id:'artifacts',arrange:w=>{w.routes['/company-intelligence-refresh.json'].body.manifest.assets={};}},
  'checkArchivable(s)':{id:'rollback-archivable',arrange:w=>{w.d.objects.set(activationKey(),Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId,generation:w.gen})));}}
 };
 try{
  for(const [fn,sc] of Object.entries(scenarios)){
   const w=await world();try{
    await sc.arrange(w);
    const real=await w.preflight();
    assert.equal(real.decision,'BLOCKED',fn+': echter Guard blockt');assert.ok(failedIds(real).includes(sc.id),fn+' schlaegt an: '+failedIds(real));
    // Mutant: genau diese Pruefung wird aus der Entscheidung entfernt.
    const needle=fn==='checkArchivable(s)'?'checks.push(arch.c);':null;
    const mutated=needle?abs.replace(needle,'/* entfernt */'):abs.replace(new RegExp(`(const checks=\\[[^\\]]*?)${fn}\\(s(?:,now)?\\),?`),'$1');
    assert.notEqual(mutated,abs,'Mutation greift: '+fn);
    const file=join(dir,fn.replace(/\W/g,'')+'.mjs');writeFileSync(file,mutated);
    const mutant=await import(pathToFileURL(file).href);
    const v=await mutant.evaluatePreflight({driver:w.d,fetchImpl:w.fetchImpl});
    assert.equal(v.decision,'REFREEZE',fn+': ohne diese Pruefung wuerde faelschlich eingefroren (Test haengt an ihr)');
   }finally{w.done();}
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('LEGACY_FALLBACK / kein GOOD (Doppel-Rollback): Gate DISABLED, delivery 404 -> BLOCKED mit LEGACY_GOOD_MISSING und GATE_CLOSED, laut, nichts geschrieben',async()=>{
 const w=await world({freezeAge:140*H});try{
  w.d.objects.set(goodKey(LEGACY),Buffer.from(JSON.stringify({schema:1,state:'LEGACY_FALLBACK'})));
  w.d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'DISABLED',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
  delete w.routes['/company-intelligence-delivery.json'];
  w.routes['/company-intelligence/data/index.json'].body={schema:'vu-company-intelligence-1.0.0',state:'DISABLED',companies:{},tickers:{}};
  const v=await w.preflight();
  assert.equal(v.decision,'BLOCKED');assert.equal(v.generation,null);
  assert.ok(v.causes.includes('LEGACY_GOOD_MISSING')&&v.causes.includes('GATE_CLOSED'),v.causes.join());
  assert.equal(byId(v,'health').detail.includes('GATE_CLOSED'),true);
  assert.equal(v.urgent,true);assert.ok(v.freeze.hoursToExpiry<48);
  assert.ok(annotations(v).every(a=>a.startsWith('::error::')));assert.match(renderSummary(v),/LEGACY_GOOD_MISSING/);
  assert.equal(w.d.puts.length,0);
  // Auch bei offen wirkendem Gate bleibt fehlendes GOOD ein Block (kein Re-Freeze auf Basis von Live-Daten allein).
  w.d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
  const v2=await w.preflight();assert.equal(v2.decision,'BLOCKED');assert.ok(v2.causes.includes('LEGACY_GOOD_MISSING'));
 }finally{w.done();}
});
