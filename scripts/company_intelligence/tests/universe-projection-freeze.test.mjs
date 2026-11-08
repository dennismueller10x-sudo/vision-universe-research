/* 46er-Projektion des Universe-GOOD fuer den Rollback-Freeze bei aktivem Universum (Entscheidung Steuerung 08.11.2026).
 * universe-projection.mjs, frozen-refreeze.mjs#refreezeFromUniverse, refreeze-auto-guard.mjs (Quelle universe), freeze-expiry.mjs.
 * Kein Netz, kein R2: In-Memory-Treiber und eingespeiste Live-Antworten. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {refreshConfig,frozenInventory,frozenTickers,refreshApproved} from '../refresh-approval.mjs';
import {prepareCandidate,commitGood,goodState,goodKey,activationKey,downloadGood} from '../refresh-storage.mjs';
import {universeConfig,moduleNames} from '../universe-approval.mjs';
import {approval} from '../production-approval.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {prepareFrozenRollback} from '../frozen-rollback.mjs';
import {refreezeFromUniverse,refreezeRollback,refreezeArchiveKey,assertLegacyScope} from '../frozen-refreeze.mjs';
import {projectUniverseCohort,PROJECTION_KIND} from '../universe-projection.mjs';
import {evaluatePreflight,evaluatePostcheck} from '../refreeze-auto-guard.mjs';
import {freezeStatus,freezeWarning,FREEZE_WARNING_MS,FREEZE_LIFETIME_MS} from '../freeze-expiry.mjs';

const LEGACY=refreshConfig.consumerNamespace,ROLLBACK=universeConfig.rollbackNamespace,UNIVERSE=universeConfig.consumerNamespace,H=3600000;
const SCHEMA='vu-company-intelligence-1.0.0';
const gateKey=prefixFor(approval.namespace)+'gate.json',observedKey=prefixFor(UNIVERSE)+'observed.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const EXTRA={iss_cik_9999999901:['ZZA1'],iss_cik_9999999902:['ZZB2','ZZB3']};
const MODULES=Object.fromEntries(moduleNames.map(k=>[k,['profile','aktuelles'].includes(k)]));

function driver(){const objects=new Map(),puts=[];return {objects,puts,get:async k=>objects.get(k)||null,put:async(k,v)=>{puts.push(k);objects.set(k,Buffer.from(v));}};}
/* Legacy-Freeze im 46/45-Format (wie in den bestehenden Re-Freeze-Tests). */
function legacyFixture(n,generatedAt){
 const root=mkdtempSync(join(tmpdir(),'proj-legacy-')),generation=n.toString(16).padStart(24,'0');
 const values={},index={schema:SCHEMA,state:'AVAILABLE',generation,generatedAt,companies:{},tickers:{}};
 for(const [companyId,v] of Object.entries(frozenInventory)){
  const path=`snapshots/${generation}/${companyId}.json`,listings=v.tickers.map(symbol=>({symbol,instrumentId:'vu_12345678901234'}));
  values[path]={schema:SCHEMA,state:'AVAILABLE',companyId,generatedAt,listings,companyProfile:{state:'AVAILABLE',language:'de'},latestFinancials:{state:'MISSING'},news:[],events:[],earnings:[],filings:[],calls:[],timeline:[],materials:[]};
  index.companies[companyId]=path;for(const symbol of v.tickers)index.tickers[symbol]=[{companyId,instrumentId:'vu_12345678901234'}];
 }
 values['index.json']=index;const assets={};
 for(const [path,v] of Object.entries(values)){const bytes=Buffer.from(JSON.stringify(v));mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),bytes);assets[path]={bytes:bytes.length,sha256:sha(bytes)};}
 const m={schema:1,generation,generatedAt,assets,tickers:frozenTickers,sourceUsagePolicy:refreshConfig.sourceUsagePolicy,productionApproval:refreshConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',profiles:45,privateCompanies:5120,checkpointSha256:'a'.repeat(64)}};
 writeFileSync(join(root,'manifest.json'),JSON.stringify(m));return {root,m,inventory:frozenInventory};
}
/* Universe-GOOD: 45 Kohortenemittenten plus zwei weitere, Lookup-Shards je Praefix, Eignung je Emittent. */
function universeFixture(n,generatedAt,{payload=(cid,p)=>p,dropIssuer=null}={}){
 const root=mkdtempSync(join(tmpdir(),'proj-universe-')),generation=n.toString(16).padStart(24,'0');
 const issuers=Object.fromEntries([...Object.entries(frozenInventory).map(([cid,v])=>[cid,v.tickers]),...Object.entries(EXTRA)].filter(([cid])=>cid!==dropIssuer));
 const values={},members={},eligibility={};
 for(const [cid,tickers] of Object.entries(issuers)){
  const listings=tickers.map(symbol=>({symbol,instrumentId:'vu_'+sha(symbol).slice(0,14)}));
  values[cid]=payload(cid,{schema:SCHEMA,state:'AVAILABLE',companyId:cid,generatedAt,listings,companyProfile:{state:'AVAILABLE',language:'de',description:'Profil '+cid},latestFinancials:{state:'MISSING'},
   news:[{companyId:cid,title:'Meldung '+cid}],events:[],earnings:[],filings:[],calls:[],timeline:[],materials:[],eligibility:{modules:MODULES}});
  for(const l of listings)members[l.symbol]=[{...l,companyId:cid}];
  eligibility[cid]={status:'ELIGIBLE_FULL',modules:MODULES,tickers};
 }
 // Emittenten-Dateien bewusst anders serialisiert (wie Pythons dumps in Produktion): ein Neuschreiben faellt auf.
 const assets={},write=(path,v,pretty=false)=>{const bytes=Buffer.from((pretty?JSON.stringify(v,null,1):JSON.stringify(v))+'\n');mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),bytes);assets[path]={bytes:bytes.length,sha256:sha(bytes)};};
 const path=cid=>`snapshots/${generation}/${cid}.json`;
 for(const [cid,v] of Object.entries(values))write(path(cid),v,true);
 const prefixes=[...new Set(Object.keys(members).map(t=>t.slice(0,2)))].sort();
 for(const prefix of prefixes){
  const rows=Object.fromEntries(Object.entries(members).filter(([t])=>t.slice(0,2)===prefix).sort());
  const ids=[...new Set(Object.values(rows).flat().map(l=>l.companyId))].sort();
  write(`snapshots/${generation}/lookup/${prefix}.json`,{schema:SCHEMA,generation,tickers:rows,companies:Object.fromEntries(ids.map(cid=>[cid,path(cid)]))});
 }
 write('index.json',{schema:SCHEMA,state:'AVAILABLE',scope:'PER_ISSUER_ELIGIBILITY',generation,generatedAt,companyCount:Object.keys(values).length,coveredCompanyCount:Object.keys(values).length,lookupShards:prefixes});
 const m={schema:1,generation,generatedAt,assets,tickers:Object.keys(members),scope:'PER_ISSUER_ELIGIBILITY',eligibilityVersion:universeConfig.eligibilityVersion,sourceUsagePolicy:universeConfig.sourceUsagePolicy,eligibility,
  productionApproval:universeConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',structural:'PASS',privateCompanies:5126,checkpointSha256:'b'.repeat(64)}};
 writeFileSync(join(root,'manifest.json'),JSON.stringify(m));
 const inventory=Object.fromEntries(Object.entries(eligibility).map(([cid,r])=>[cid,{tickers:r.tickers,status:r.status,modules:r.modules}]));
 return {root,m,inventory};
}
async function advance(d,namespace,f,health){const good=await goodState(d,namespace),r=await prepareCandidate(d,{namespace,directory:f.root,good});return commitGood(d,{namespace,payloadNamespace:r.payloadNamespace,manifest:r.manifest,health:health||{marker:f.m.generation},inventory:f.inventory,expectedGood:good});}
async function withClock(offsetMs,fn){const real=Date.now;Date.now=()=>real()-offsetMs;try{return await fn();}finally{Date.now=real;}}
const rollout=(gen,extra='')=>`(function(g){'use strict';const cohort=["AAPL","NVDA"];const config={stage:1,${extra}cohort,eligibility:{},expectedGeneration:"${gen}",base:"/company-intelligence/data/"};g.VUCompanyIntelligenceRollout=config;})(globalThis);`;

/* Lage am 08.11.: Universum live und abgenommen, Freeze 5 Tage alt (vom 46er-Stand vor der Aktivierung), Legacy-GOOD = Freeze-Bytes. */
async function world({freezeAge=120*H,universeAge=1*H,universe:uopts={}}={}){
 const now=Date.now(),dirs=[],d=driver();
 const frozen=legacyFixture(0x71dc,new Date(now-freezeAge).toISOString());dirs.push(frozen.root);
 const u=universeFixture(0x579c,new Date(now-universeAge).toISOString(),uopts);dirs.push(u.root);
 await withClock(Math.max(0,freezeAge-24*H),async()=>{await advance(d,ROLLBACK,frozen);await advance(d,LEGACY,frozen);});
 const health={lastSuccessfulRefresh:new Date(now-universeAge).toISOString(),lastSuccessfulConsumerBuild:new Date(now-universeAge).toISOString()};
 await advance(d,UNIVERSE,u,health);
 d.objects.set(activationKey(),Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId,generation:u.m.generation})));
 d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
 d.objects.set(observedKey,Buffer.from(JSON.stringify({schema:1,generation:u.m.generation,lastSuccessfulProductionPublication:new Date(now-0.5*H).toISOString()})));
 const gen=u.m.generation,issuers=Object.keys(u.m.eligibility).length;
 const routes={
  '/company-intelligence-delivery.json':{body:{status:'PASS',generation:gen,cohortStocks:u.m.tickers.length,issuers}},
  '/company-intelligence/data/index.json':{body:{schema:SCHEMA,state:'AVAILABLE',generation:gen}},
  '/company-intelligence/config/rollout.js':{body:rollout(gen)},
  '/company-intelligence-refresh.json':{body:{status:'PASS',generation:gen,manifest:{generation:gen,assets:u.m.assets,tickers:u.m.tickers}}}
 };
 const fetchImpl=async url=>{const r=routes[new URL(url).pathname];if(!r)return new Response('not found',{status:404});return new Response(typeof r.body==='string'?r.body:JSON.stringify(r.body),{status:r.status||200});};
 d.puts.length=0;
 const temp=()=>{const t=mkdtempSync(join(tmpdir(),'proj-run-'));dirs.push(t);return t;};
 return {d,now,frozen,u,gen,routes,fetchImpl,temp,
  refreeze:(extra={})=>refreezeFromUniverse(d,{temporary:temp(),fetchDelivery:async()=>routes['/company-intelligence-delivery.json'].body,codeSha:'c'.repeat(40),...extra}),
  preflight:()=>evaluatePreflight({driver:d,fetchImpl,now:Date.now()}),
  done:()=>dirs.forEach(x=>rmSync(x,{recursive:true,force:true}))};
}
const bytesOf=(d,k)=>d.objects.get(k)?Buffer.from(d.objects.get(k)):null;
const guarded=d=>[activationKey(),gateKey,goodKey(UNIVERSE),goodKey(LEGACY)].map(k=>sha(bytesOf(d,k)));
/* Bytes eines Assets aus einem GOOD im Speicher (wie public-delivery). */
const assetBytes=(d,good,path)=>bytesOf(d,prefixFor(good.payloadNamespace)+`slot-${good.manifest.slot||0}/`+(path==='index.json'?path:path.split('/').slice(2).join('/')));

test('Projektion: 45 Emittenten-Dateien bytegleich aus dem Universe-GOOD, nur Kohortentitel, Kohortenfreigabe, eigene Generation',async()=>{
 const w=await world();try{
  const universe=await goodState(w.d,UNIVERSE),out=join(w.temp(),'p');
  const r=await projectUniverseCohort(w.d,{universe,output:out,codeSha:'c'.repeat(40)});
  const m=r.manifest;
  assert.ok(refreshApproved(m),'Kohortenfreigabe');assert.notEqual(m.generation,universe.generation);assert.equal(m.generatedAt,universe.manifest.generatedAt);
  assert.deepEqual(m.tickers,frozenTickers);assert.equal(m.refreshValidation.profiles,45);assert.equal(m.refreshValidation.privateCompanies,5126);
  assert.deepEqual(m.projection,{kind:PROJECTION_KIND,sourceNamespace:UNIVERSE,sourceGeneration:universe.generation,sourceGeneratedAt:universe.manifest.generatedAt,sourceAssetsSha256:sha(JSON.stringify(universe.manifest.assets))});
  for(const cid of Object.keys(frozenInventory)){
   const mine=readFileSync(join(out,`snapshots/${m.generation}/${cid}.json`));
   assert.ok(mine.equals(assetBytes(w.d,universe,`snapshots/${universe.generation}/${cid}.json`)),'bytegleich: '+cid);
  }
  for(const cid of Object.keys(EXTRA))assert.equal(existsSync(join(out,`snapshots/${m.generation}/${cid}.json`)),false,'kein Nicht-Kohortenemittent');
  const index=JSON.parse(readFileSync(join(out,'index.json')));
  assert.equal(index.generation,m.generation);assert.equal(index.scope,'CONTROLLED_COHORT');assert.equal(index.coveredCompanyCount,45);
  const seen=index.lookupShards.flatMap(p=>Object.keys(JSON.parse(readFileSync(join(out,`snapshots/${m.generation}/lookup/${p}.json`))).tickers));
  assert.deepEqual(seen.sort(),[...frozenTickers].sort(),'Lookup nur mit den 46 Kohortentiteln');
  assert.equal(Object.keys(r.inventory).length,45);assert.ok(Object.values(r.inventory).every(x=>x.germanProfile&&x.news===1));
  // Deterministisch: zweiter Lauf gleiche Generation und gleiche Hashes.
  const again=await projectUniverseCohort(w.d,{universe,output:join(w.temp(),'q'),codeSha:'c'.repeat(40)});
  assert.equal(again.manifest.generation,m.generation);assert.deepEqual(again.manifest.assets,m.assets);
 }finally{w.done();}
});

test('Projektion fail-closed: fehlender Kohortenemittent, manipulierte Bytes, fehlendes deutsches Profil, nicht leeres Verzeichnis',async()=>{
 const missing=Object.keys(frozenInventory)[3];
 let w=await world({universe:{dropIssuer:missing}});try{
  await assert.rejects(projectUniverseCohort(w.d,{universe:await goodState(w.d,UNIVERSE),output:join(w.temp(),'p')}),new RegExp('PROJECTION_ISSUER_NOT_IN_UNIVERSE:'+missing));
 }finally{w.done();}
 const english=Object.keys(frozenInventory)[0];
 w=await world({universe:{payload:(cid,p)=>cid===english?{...p,companyProfile:{...p.companyProfile,language:'en'}}:p}});try{
  await assert.rejects(projectUniverseCohort(w.d,{universe:await goodState(w.d,UNIVERSE),output:join(w.temp(),'p')}),/PROJECTION_GERMAN_PROFILES_INCOMPLETE/);
 }finally{w.done();}
 w=await world();try{
  const universe=await goodState(w.d,UNIVERSE),cid=Object.keys(frozenInventory)[5],path=`snapshots/${universe.generation}/${cid}.json`;
  const key=prefixFor(universe.payloadNamespace)+`slot-${universe.manifest.slot||0}/`+path.split('/').slice(2).join('/');
  const bytes=Buffer.from(w.d.objects.get(key));bytes[bytes.length-3]^=1;w.d.objects.set(key,bytes);
  await assert.rejects(projectUniverseCohort(w.d,{universe,output:join(w.temp(),'p')}),new RegExp('PROJECTION_SOURCE_INTEGRITY_FAILED:'+path));
  const dirty=w.temp();writeFileSync(join(dirty,'x'),'x');
  await assert.rejects(projectUniverseCohort(w.d,{universe,output:dirty}),/PROJECTION_DIRECTORY_NOT_EMPTY/);
  // Ein Legacy-GOOD ist keine Quelle.
  await assert.rejects(projectUniverseCohort(w.d,{universe:await goodState(w.d,LEGACY),output:join(w.temp(),'q')}),/PROJECTION_SOURCE_NOT_APPROVED_UNIVERSE/);
 }finally{w.done();}
});

test('refreezeFromUniverse: friert die Projektion ein, archiviert den alten Freeze, schreibt nur im Rollback-Namensraum; Restore auf 46 funktioniert',async()=>{
 const w=await world();try{
  const before=guarded(w.d),old=await goodState(w.d,ROLLBACK),oldBytes=bytesOf(w.d,goodKey(ROLLBACK)),universe=await goodState(w.d,UNIVERSE);
  const r=await w.refreeze({expectGeneration:universe.generation});
  assert.equal(r.status,'REFROZEN');assert.equal(r.previousGeneration,old.generation);assert.deepEqual(r.projectedFrom,{namespace:UNIVERSE,generation:universe.generation});
  for(const k of ['privateStateModified','activationModified','gateModified','universeGoodModified'])assert.equal(r[k],false,k);
  const frozen=await goodState(w.d,ROLLBACK);
  assertLegacyScope(frozen,'SCOPE');assert.equal(frozen.generation,r.generation);assert.equal(frozen.previous,null);
  assert.equal(frozen.refreeze.sourceGeneration,frozen.generation);assert.equal(frozen.refreeze.previousGeneration,old.generation);
  assert.deepEqual(frozen.refreeze.lineage,[old.generation]);assert.equal(frozen.refreeze.projection.sourceGeneration,universe.generation);
  assert.equal(frozen.refreeze.projection.sourceGoodPointerSha256,sha(bytesOf(w.d,goodKey(UNIVERSE))));
  assert.equal(JSON.parse(w.d.objects.get(refreezeArchiveKey(old.generation))).pointer,oldBytes.toString('utf8'));
  assert.deepEqual(guarded(w.d),before,'Aktivierung, Gate, Universe-GOOD und Legacy-GOOD byte-gleich');
  const prefix=prefixFor(ROLLBACK).slice(0,-1);
  assert.ok(w.d.puts.length&&w.d.puts.every(k=>k.startsWith(prefix)),'nur Rollback-Namensraum: '+w.d.puts.filter(k=>!k.startsWith(prefix)));
  // Neuer Freeze laeuft 7 Tage ab Universe-Stand.
  assert.equal(freezeStatus(frozen).state,'VALID');assert.equal(Date.parse(frozen.manifest.generatedAt),Date.parse(universe.manifest.generatedAt));
  // Unabhaengiger Download und der Restore-Weg von restore46 (prepareFrozenRollback + commitGood in den Legacy-Namensraum).
  const out=join(w.temp(),'dl');const dl=await downloadGood(w.d,{namespace:ROLLBACK,output:out});assert.equal(dl.generation,r.generation);
  writeFileSync(join(out,'manifest.json'),JSON.stringify(frozen.manifest)+'\n');
  const previous=await goodState(w.d,LEGACY);
  const candidate=await prepareFrozenRollback(w.d,{namespace:LEGACY,directory:out,good:previous,frozen});
  await commitGood(w.d,{namespace:LEGACY,payloadNamespace:candidate.payloadNamespace,manifest:candidate.manifest,health:frozen.health,inventory:frozen.inventory,expectedGood:previous});
  const legacy=await goodState(w.d,LEGACY);assert.equal(legacy.generation,r.generation);assertLegacyScope(legacy,'RESTORED_SCOPE');
 }finally{w.done();}
});

test('refreezeFromUniverse: Wiederholung ALREADY_CURRENT ohne Schreiben; Verweigerung ohne aktives Universum, bei fremder Live-Generation oder falscher Erwartung',async()=>{
 const w=await world();try{
  const universe=await goodState(w.d,UNIVERSE);
  await w.refreeze();
  const snapshot=()=>[...w.d.objects.entries()].map(([k,b])=>k+sha(b)).sort(),before=snapshot();
  const again=await w.refreeze();
  assert.equal(again.status,'ALREADY_CURRENT');assert.deepEqual(snapshot(),before,'ALREADY_CURRENT schreibt nichts');
  await assert.rejects(w.refreeze({expectGeneration:'0'.repeat(24)}),/REFREEZE_EXPECTED_GENERATION_MISMATCH/);
  w.routes['/company-intelligence-delivery.json'].body={...w.routes['/company-intelligence-delivery.json'].body,generation:'1'.repeat(24)};
  await assert.rejects(w.refreeze(),/PROJECTION_LIVE_NOT_UNIVERSE_GOOD/);
  w.routes['/company-intelligence-delivery.json'].body={status:'PASS',generation:universe.generation,cohortStocks:46,issuers:45};
  await assert.rejects(w.refreeze(),/PROJECTION_LIVE_NOT_UNIVERSE_GOOD/,'46/45 ausgeliefert heisst: Universum nicht live');
  w.d.objects.set(activationKey(),Buffer.from(JSON.stringify({schema:1,state:'ROLLBACK_46',approvalId:universeConfig.approvalId})));
  await assert.rejects(w.refreeze(),/PROJECTION_REQUIRES_ACTIVE_UNIVERSE/);
  assert.deepEqual(snapshot().filter(x=>!x.startsWith(activationKey())),before.filter(x=>!x.startsWith(activationKey())));
 }finally{w.done();}
 // Und umgekehrt: der Legacy-Weg verweigert bei aktivem Universum wie bisher.
 const v=await world();try{
  await assert.rejects(refreezeRollback(v.d,{temporary:v.temp(),fetchDelivery:async()=>v.routes['/company-intelligence-delivery.json'].body}),/REFREEZE_REFUSED_UNIVERSE_ACTIVE_OR_INVALID_ACTIVATION/);
 }finally{v.done();}
});

test('Auto-Re-Freeze bei aktivem Universum: Preflight REFREEZE (Quelle universe), Nachpruefung VERIFIED, danach SKIP',async()=>{
 const w=await world();try{
  const v=await w.preflight();
  assert.equal(v.decision,'REFREEZE',JSON.stringify(v.checks.filter(c=>c.status==='FAIL')));assert.equal(v.source,'universe');assert.equal(v.reason,'NEWER_VERIFIED_UNIVERSE_GOOD');assert.equal(v.generation,w.gen);
  const release=await w.refreeze({expectGeneration:v.generation});
  const post=await evaluatePostcheck({driver:w.d,release,expectGeneration:v.generation,preflight:v});
  assert.equal(post.decision,'VERIFIED',JSON.stringify(post.checks.filter(c=>c.status==='FAIL')));
  const v2=await w.preflight();assert.equal(v2.decision,'SKIP');assert.equal(v2.reason,'FREEZE_ALREADY_CURRENT_GENERATION');
  // Eine gefaelschte Nachpruefung (Projektion einer anderen Universe-Generation) faellt durch.
  const forged=await evaluatePostcheck({driver:w.d,release:{...release,projectedFrom:{...release.projectedFrom,generation:'2'.repeat(24)}},expectGeneration:v.generation,preflight:v});
  assert.equal(forged.decision,'FAILED');
 }finally{w.done();}
});

test('Auto-Re-Freeze bei aktivem Universum blockiert bei Mischstand, Legacy-Auslieferung oder geschlossenem Gate',async()=>{
 let w=await world();try{
  w.routes['/company-intelligence/data/index.json'].body.generation='1'.repeat(24);
  const v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.ok(v.checks.some(c=>c.id==='generation-unanimous'&&c.status==='FAIL'));
 }finally{w.done();}
 w=await world();try{
  w.routes['/company-intelligence-delivery.json'].body={status:'PASS',generation:w.gen,cohortStocks:46,issuers:45};
  const v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(v.checks.find(c=>c.id==='gate-open').detail,/DELIVERY_NOT_PASS_UNIVERSE_SCOPE/);
 }finally{w.done();}
 w=await world();try{
  w.d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'DISABLED',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
  const v=await w.preflight();assert.equal(v.decision,'BLOCKED');assert.match(v.checks.find(c=>c.id==='gate-open').detail,/GATE_CLOSED/);
 }finally{w.done();}
});

test('freeze-expiry: Warnung ab 48 h vor Verfall, abgelaufen und fehlend ebenfalls; gueltig ohne Warnung',()=>{
 const now=Date.parse('2026-11-12T12:00:00Z'),at=age=>({generation:'c'.repeat(24),manifest:{generatedAt:new Date(now-age).toISOString()}});
 const valid=freezeStatus(at(FREEZE_LIFETIME_MS-FREEZE_WARNING_MS-H),now);assert.equal(valid.state,'VALID');assert.equal(freezeWarning(valid),null);
 const soon=freezeStatus(at(FREEZE_LIFETIME_MS-FREEZE_WARNING_MS+H),now);assert.equal(soon.state,'EXPIRING');assert.equal(soon.hoursToExpiry,47);assert.match(freezeWarning(soon),/^::warning::.*verfaellt in 47 h/);
 const gone=freezeStatus(at(FREEZE_LIFETIME_MS+H),now);assert.equal(gone.state,'EXPIRED');assert.match(freezeWarning(gone),/abgelaufen/);
 assert.equal(freezeStatus(null,now).state,'MISSING');assert.match(freezeWarning(freezeStatus(null,now)),/fehlt/);
 assert.equal(freezeStatus({generation:'x',manifest:{generatedAt:'kaputt'}},now).state,'UNKNOWN');
 // 14.11.: der heutige Freeze vom 07.11. 15:00 UTC warnt ab 12.11. 15:00 UTC.
 const today=freezeStatus({generation:'c39a8135aeeb3a9286f321ef',manifest:{generatedAt:'2026-11-07T15:00:00Z'}},Date.parse('2026-11-12T15:30:00Z'));
 assert.equal(today.state,'EXPIRING');assert.equal(today.expiresAt,'2026-11-14T15:00:00.000Z');
});
