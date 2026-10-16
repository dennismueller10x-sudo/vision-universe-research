/* Heilpfad "kein Legacy-GOOD": Wiederherstellung aus dem eingefrorenen Rollback, Diagnose statt
   CONSUMER_EXPIRED, Health-Zusatzfelder. In-Memory-R2-Treiber wie in universe-refreeze.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {refreshConfig,frozenInventory,frozenTickers,evaluateHealth} from '../refresh-approval.mjs';
import {prepareCandidate,commitGood,goodState,goodKey,activationKey,downloadGood} from '../refresh-storage.mjs';
import {universeConfig} from '../universe-approval.mjs';
import {approval} from '../production-approval.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {refreezeRollback} from '../frozen-refreeze.mjs';
import {publish} from '../public-delivery.mjs';
import {guardWrites,restoreLegacyGood,withLegacyMissingDiagnosis,goodPointerState,classifyPointer,assertRestoreWindow,RESTORE_MIN_REMAINING_MS} from '../legacy-restore.mjs';
import {setProductionGate} from '../production-release.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
function driver(){const objects=new Map(),puts=[];return {objects,puts,get:async k=>objects.get(k)||null,put:async(k,v)=>{puts.push(k);objects.set(k,Buffer.from(v));}};}
const LEGACY=refreshConfig.consumerNamespace,ROLLBACK=universeConfig.rollbackNamespace,H=3600000;
const LEGACY_PREFIX=prefixFor(LEGACY).slice(0,-1),FALLBACK=Buffer.from(JSON.stringify({schema:1,state:'LEGACY_FALLBACK'}));
const gateKey=prefixFor(approval.namespace)+'gate.json';
function fixture(n,generatedAt){
 const root=mkdtempSync(join(tmpdir(),'legacy-restore-')),generation=n.toString(16).padStart(24,'0'),schema='vu-company-intelligence-1.0.0';
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
async function advance(d,namespace,f){const good=await goodState(d,namespace),r=await prepareCandidate(d,{namespace,directory:f.root,good});return commitGood(d,{namespace,payloadNamespace:r.payloadNamespace,manifest:r.manifest,health:{marker:f.m.generation},inventory:frozenInventory,expectedGood:good});}
/* Realer Zustand nach dem Doppel-Rollback: Legacy-Zeiger LEGACY_FALLBACK, Payload-Slots liegen weiter,
   eingefrorener Rollback (a7b3dee3-Rolle) 2 Tage alt, Universum ROLLBACK_46, Gate offen. */
async function world({frozenAge=48*H,layout='unrelated'}={}){
 const now=Date.now(),dirs=[],d=driver();
 const mk=(n,age)=>{const f=fixture(n,new Date(now-age).toISOString());dirs.push(f.root);return f;};
 const frozen=mk(0xa7b3,frozenAge),older=mk(0x1001,60*H),newest=mk(0x8f1f,2*H);
 await advance(d,ROLLBACK,frozen);
 // unrelated: a7b3 liegt nicht im Legacy; a-first/b-first: a7b3 und 8f1f liegen in den beiden Legacy-Namespaces (beide Reihenfolgen).
 if(layout==='unrelated'){await advance(d,LEGACY,older);await advance(d,LEGACY,newest);}
 else if(layout==='a7b3-in-a'){await advance(d,LEGACY,frozen);await advance(d,LEGACY,newest);}
 else if(layout==='a7b3-in-b'){await advance(d,LEGACY,newest);await advance(d,LEGACY,frozen);}
 d.objects.set(goodKey(LEGACY),FALLBACK);   // das, was der Doppel-Rollback hinterlaesst
 d.objects.set(activationKey(),Buffer.from(JSON.stringify({schema:1,state:'ROLLBACK_46',approvalId:universeConfig.approvalId,generation:'f'.repeat(24)})));
 d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
 d.objects.set(goodKey(universeConfig.consumerNamespace),Buffer.from(JSON.stringify({schema:1,state:'GOOD',generation:'e'.repeat(24)})));
 const temporary=mkdtempSync(join(tmpdir(),'legacy-restore-tmp-'));dirs.push(temporary);d.puts.length=0;
 let n=0;
 return {d,frozen,older,newest,now,mk,temporary,expect:frozen.m.generation,
  fresh:()=>{const x=join(temporary,'run'+(n++));mkdirSync(x,{recursive:true});return x;},done:()=>dirs.forEach(x=>rmSync(x,{recursive:true,force:true}))};
}
const run=(w,extra={})=>restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect,...extra});
const protectedBytes=d=>[activationKey(),gateKey,goodKey(universeConfig.consumerNamespace),goodKey(ROLLBACK)].map(k=>d.objects.get(k)?.toString('hex'));

test('LEGACY_FALLBACK + valid frozen rollback: legacy pointer restored, verified, nothing else touched',async()=>{
 const w=await world();try{
  const before=protectedBytes(w.d);
  assert.equal(await goodState(w.d,LEGACY),null);
  const r=await run(w);
  assert.equal(r.status,'RESTORED');assert.equal(r.generation,w.expect);assert.equal(r.stockCount,46);assert.equal(r.issuerCount,45);assert.equal(r.pointerBefore,'LEGACY_FALLBACK');assert.equal(r.freezeMarker,'ORIGINAL');
  for(const k of ['privateStateModified','activationModified','gateModified','universeGoodModified','rollbackModified'])assert.strictEqual(r[k],false,k);
  assert.equal(r.validUntil,new Date(Date.parse(w.frozen.m.generatedAt)+7*24*H).toISOString());
  const good=await goodState(w.d,LEGACY);
  assert.equal(good.generation,w.expect);assert.equal(good.previous,null);assert.deepEqual(good.manifest.assets,w.frozen.m.assets);
  assert.deepEqual(good.manifest.tickers,frozenTickers);assert.equal(Object.keys(good.inventory).length,45);
  assert.deepEqual(protectedBytes(w.d),before);
  // alle Schreibzugriffe nur im Legacy-Namespace; der Zeiger zuletzt
  assert(w.d.puts.every(k=>k.startsWith(LEGACY_PREFIX)),w.d.puts.filter(k=>!k.startsWith(LEGACY_PREFIX)).join());
  assert.equal(w.d.puts.at(-1),goodKey(LEGACY));assert.equal(w.d.puts.filter(k=>k===goodKey(LEGACY)).length,1);
  // unabhaengiger Download aus leerem Verzeichnis
  const out=w.fresh(),dl=await downloadGood(w.d,{namespace:LEGACY,output:out});
  assert.equal(dl.generation,w.expect);assert.equal(JSON.parse(readFileSync(join(out,'index.json'))).generation,w.expect);
 }finally{w.done();}
});

test('fehlender Legacy-Zeiger (ABSENT) wird ebenfalls geheilt',async()=>{
 const w=await world();try{
  w.d.objects.delete(goodKey(LEGACY));
  const r=await run(w);assert.equal(r.status,'RESTORED');assert.equal(r.pointerBefore,'ABSENT');
  assert.equal((await goodState(w.d,LEGACY)).generation,w.expect);
 }finally{w.done();}
});

test('Legacy-GOOD vorhanden: ALREADY_PRESENT, keine Aktion, zweiter Aufruf idempotent',async()=>{
 const w=await world();try{
  assert.equal((await run(w)).status,'RESTORED');
  const snapshot=new Map(w.d.objects);w.d.puts.length=0;
  const again=await run(w);
  assert.equal(again.status,'ALREADY_PRESENT');assert.equal(again.generation,w.expect);assert.equal(w.d.puts.length,0);
  for(const [k,v] of snapshot)assert(w.d.objects.get(k).equals(v),k);
  // auch ein ganz anderes, gueltiges Legacy-GOOD wird nie ueberschrieben
  const w2=await world();try{
   w2.d.objects.set(goodKey(LEGACY),Buffer.from(JSON.stringify((await(async()=>{await advance(w2.d,LEGACY,w2.newest);return goodState(w2.d,LEGACY);})()))));
   const before=w2.d.objects.get(goodKey(LEGACY));w2.d.puts.length=0;
   assert.equal((await run(w2)).status,'ALREADY_PRESENT');assert.equal(w2.d.puts.length,0);assert(w2.d.objects.get(goodKey(LEGACY)).equals(before));
  }finally{w2.done();}
 }finally{w.done();}
});

test('defekter (nicht LEGACY_FALLBACK) Legacy-Zeiger wird nie ueberschrieben',async()=>{
 const w=await world();try{
  for(const bad of ['{not json',JSON.stringify({schema:1,state:'GOOD',generation:'x'}),JSON.stringify({schema:1,state:'WEIRD'})]){
   w.d.objects.set(goodKey(LEGACY),Buffer.from(bad));w.d.puts.length=0;
   await assert.rejects(run(w));assert.equal(w.d.puts.length,0);assert.equal(w.d.objects.get(goodKey(LEGACY)).toString(),bad);
  }
 }finally{w.done();}
});

test('abgelaufener oder fast abgelaufener Freeze: fail-closed ohne Schreiben',async()=>{
 for(const age of [7*24*H+60000,8*24*H,7*24*H-5*60000]){
  const w=await world({frozenAge:age});try{
   await assert.rejects(run(w),/LEGACY_RESTORE_FROZEN_EXPIRED|CONSUMER_EXPIRED/,String(age));
   assert.equal(w.d.puts.length,0);assert(w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK));
  }finally{w.done();}
 }
 const w=await world({frozenAge:7*24*H-2*H});try{assert.equal((await run(w)).status,'RESTORED');}finally{w.done();}   // knapp, aber mit Reserve gueltig
 assert.throws(()=>assertRestoreWindow('not-a-date',Date.now()),/LEGACY_RESTORE_GENERATED_AT_INVALID/);
 assert.throws(()=>assertRestoreWindow(new Date(Date.now()+H).toISOString(),Date.now()),/LEGACY_RESTORE_GENERATED_AT_IN_FUTURE/);
 assert.equal(RESTORE_MIN_REMAINING_MS,15*60000);
});

test('Hash-Abweichung in Rollback-Slot, Manifest oder Pointer: Abbruch ohne Schreiben',async()=>{
 const w=await world();try{
  const pointer=JSON.parse(w.d.objects.get(goodKey(ROLLBACK)));
  const assetKey=[...w.d.objects.keys()].find(k=>k.startsWith(prefixFor(pointer.payloadNamespace))&&k.includes('slot-')&&k.endsWith('index.json'));
  assert.ok(assetKey);const original=w.d.objects.get(assetKey);
  w.d.objects.set(assetKey,Buffer.from(original.toString().replace('AVAILABLE','AVAILABLX')));
  await assert.rejects(run(w),/CONSUMER_INTEGRITY_FAILED/);assert.equal(w.d.puts.length,0);
  w.d.objects.set(assetKey,original);
  // Pointer-Manifest mit abweichendem Asset-Hash
  const forged=JSON.parse(JSON.stringify(pointer));forged.manifest.assets['index.json'].sha256='0'.repeat(64);
  w.d.objects.set(goodKey(ROLLBACK),Buffer.from(JSON.stringify(forged)));
  await assert.rejects(run(w));assert.equal(w.d.puts.length,0);
  assert(w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK));
 }finally{w.done();}
});

test('Scope-Abweichung (45/47 Titel, 44 Emittenten, Universum-Scope, Inventar): Abbruch ohne Schreiben',async()=>{
 const w=await world();try{
  const pointer=JSON.parse(w.d.objects.get(goodKey(ROLLBACK)));
  for(const alter of [g=>{g.manifest.tickers=g.manifest.tickers.slice(1);},g=>{g.manifest.tickers=[...g.manifest.tickers,'ZZZZ'];},g=>{g.inventory=Object.fromEntries(Object.entries(g.inventory).slice(1));},g=>{g.manifest.scope='PER_ISSUER_ELIGIBILITY';}]){
   const copy=JSON.parse(JSON.stringify(pointer));alter(copy);w.d.objects.set(goodKey(ROLLBACK),Buffer.from(JSON.stringify(copy)));
   await assert.rejects(run(w),/INVALID_REFRESH_GOOD_POINTER|LEGACY_RESTORE_FROZEN_SCOPE_INVALID/);
  }
  assert.equal(w.d.puts.length,0);
  // Pointer mit unerwartetem previous (haette abgelaufene Snapshots im Schlepptau)
  const withPrevious={...pointer,previous:{generation:'1'.repeat(24)}};w.d.objects.set(goodKey(ROLLBACK),Buffer.from(JSON.stringify(withPrevious)));
  await assert.rejects(run(w),/LEGACY_RESTORE_FROZEN_PREVIOUS_UNEXPECTED/);assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('fehlender Freeze, aktives Universum oder defekte Aktivierung: Abbruch ohne Schreiben',async()=>{
 const w=await world();try{
  const frozenBytes=w.d.objects.get(goodKey(ROLLBACK));w.d.objects.delete(goodKey(ROLLBACK));
  await assert.rejects(run(w),/LEGACY_RESTORE_FROZEN_ROLLBACK_REQUIRED/);w.d.objects.set(goodKey(ROLLBACK),frozenBytes);
  for(const bad of [{schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId},{schema:1,state:'ROLLBACK_46',approvalId:'other'},'garbage']){
   w.d.objects.set(activationKey(),Buffer.from(typeof bad==='string'?bad:JSON.stringify(bad)));
   await assert.rejects(run(w),/LEGACY_RESTORE_REFUSED_UNIVERSE_ACTIVE_OR_INVALID_ACTIVATION/);
  }
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('expect-generation: Pflicht, Format und Abgleich; Fehlschlag schreibt nichts',async()=>{
 const w=await world();try{
  for(const bad of [null,undefined,'','abc','G'.repeat(24),'A'.repeat(24)])await assert.rejects(run(w,{expectGeneration:bad}),/LEGACY_RESTORE_EXPECT_GENERATION_REQUIRED/);
  await assert.rejects(run(w,{expectGeneration:'1'.repeat(24)}),/LEGACY_RESTORE_EXPECTED_GENERATION_MISMATCH/);
  assert.equal(w.d.puts.length,0);assert(w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK));
 }finally{w.done();}
});

test('Marker-Freeze (refreeze) wird mit Archiv geprueft; fehlendes oder verfaelschtes Archiv bricht ab',async()=>{
 const w=await world();try{
  // Aus dem Zustand "Legacy-GOOD vorhanden" einen echten Re-Freeze erzeugen, danach den Doppel-Rollback nachstellen.
  const frozenOld=JSON.parse(w.d.objects.get(goodKey(ROLLBACK)));
  await advance(w.d,LEGACY,w.older);await advance(w.d,LEGACY,w.newest);
  const current=await goodState(w.d,LEGACY);
  const re=await refreezeRollback(w.d,{temporary:w.fresh(),fetchDelivery:async()=>({status:'PASS',generation:current.generation,cohortStocks:46,issuers:45})});
  assert.equal(re.status,'REFROZEN');
  w.d.objects.set(goodKey(LEGACY),FALLBACK);w.d.puts.length=0;
  const refrozen=await goodState(w.d,ROLLBACK),archiveKey=refrozen.refreeze.archiveKey,archive=w.d.objects.get(archiveKey);
  assert.notEqual(refrozen.generation,frozenOld.generation);
  w.d.objects.delete(archiveKey);
  await assert.rejects(run(w,{expectGeneration:refrozen.generation}),/LEGACY_RESTORE_ARCHIVE_INVALID/);assert.equal(w.d.puts.length,0);
  w.d.objects.set(archiveKey,Buffer.from(JSON.stringify({...JSON.parse(archive),pointerSha256:'0'.repeat(64)})));
  await assert.rejects(run(w,{expectGeneration:refrozen.generation}),/LEGACY_RESTORE_ARCHIVE_INVALID/);
  w.d.objects.set(archiveKey,archive);
  const tampered=JSON.parse(w.d.objects.get(goodKey(ROLLBACK)));tampered.refreeze.sourceAssetsSha256='1'.repeat(64);
  const keep=w.d.objects.get(goodKey(ROLLBACK));w.d.objects.set(goodKey(ROLLBACK),Buffer.from(JSON.stringify(tampered)));
  await assert.rejects(run(w,{expectGeneration:refrozen.generation}),/LEGACY_RESTORE_MARKER_ASSETS_MISMATCH/);
  w.d.objects.set(goodKey(ROLLBACK),keep);assert.equal(w.d.puts.length,0);
  const ok=await run(w,{expectGeneration:refrozen.generation});
  assert.equal(ok.status,'RESTORED');assert.equal(ok.freezeMarker,'REFREEZE');
 }finally{w.done();}
});

const nsObjects=(d,ns)=>new Map([...d.objects].filter(([k])=>k.startsWith(prefixFor(ns))));
const sameMap=(a,b)=>a.size===b.size&&[...a].every(([k,v])=>b.has(k)&&b.get(k).equals(v));

test('exakter Slot (beide Reihenfolgen): keine Datenkopie, nur der Zeiger; der andere Namespace bleibt byte-gleich',async()=>{
 for(const [layout,exactNs,otherNs] of [['a7b3-in-a',LEGACY+'-a',LEGACY+'-b'],['a7b3-in-b',LEGACY+'-b',LEGACY+'-a']]){
  const w=await world({layout});try{
   w.d.objects.set(goodKey(LEGACY),FALLBACK);w.d.puts.length=0;
   const exactBefore=nsObjects(w.d,exactNs),otherBefore=nsObjects(w.d,otherNs);
   assert((JSON.parse(otherBefore.get(prefixFor(otherNs)+'manifest.json')).generation)===w.newest.m.generation,'8f1f liegt im anderen Namespace');
   const r=await run(w);
   assert.equal(r.status,'RESTORED');assert.equal(r.payloadNamespace,exactNs);assert.equal(r.slot.mode,'EXACT_SLOT');
   assert.deepEqual(r.overwrittenUnreferencedData,[]);assert.deepEqual(r.archivedManifests,[]);
   assert.deepEqual(w.d.puts,[goodKey(LEGACY)],layout+': genau ein Put, der Zeiger');
   assert(sameMap(nsObjects(w.d,exactNs),exactBefore),'exakter Namespace byte-unveraendert (kein zweiter Satz)');
   assert(sameMap(nsObjects(w.d,otherNs),otherBefore),'8f1f-Namespace byte-unveraendert');
   const good=await goodState(w.d,LEGACY);assert.equal(good.generation,w.expect);assert.equal(good.payloadNamespace,exactNs);
   assert.equal((await downloadGood(w.d,{namespace:LEGACY,output:w.fresh()})).generation,w.expect);
  }finally{w.done();}
 }
});

test('exakter Slot in slot-1 oder in previous.json: Daten der aelteren Generation in slot-0 bleiben unberuehrt',async()=>{
 // (1) a7b3 liegt in slot-1 von -a (aeltere Generation in slot-0 = previous.json), 8f1f in -b.
 let w=await world({layout:'unrelated'});try{
  const ns=LEGACY+'-a',other=LEGACY+'-b';
  for(const k of [...w.d.objects.keys()])if(k.startsWith(prefixFor(ns)))w.d.objects.delete(k);
  await publish(w.d,{namespace:ns,directory:w.older.root});
  await publish(w.d,{namespace:ns,directory:w.frozen.root});
  assert.equal(JSON.parse(w.d.objects.get(prefixFor(ns)+'manifest.json')).slot,1);
  w.d.objects.set(goodKey(LEGACY),FALLBACK);w.d.puts.length=0;
  const nsBefore=nsObjects(w.d,ns),otherBefore=nsObjects(w.d,other);
  const r=await run(w);
  assert.equal(r.slot.mode,'EXACT_SLOT');assert.equal(r.slot.slot,1);assert.equal(r.payloadNamespace,ns);
  assert.deepEqual(w.d.puts,[goodKey(LEGACY)]);assert(sameMap(nsObjects(w.d,ns),nsBefore));assert(sameMap(nsObjects(w.d,other),otherBefore));
  assert.equal((await downloadGood(w.d,{namespace:LEGACY,output:w.fresh()})).generation,w.expect);
 }finally{w.done();}
 // (2) a7b3 ist nur noch previous.json von -a (8f1f wurde danach in -a publiziert, slot-1).
 w=await world({layout:'unrelated'});try{
  const ns=LEGACY+'-a';
  for(const k of [...w.d.objects.keys()])if(k.startsWith(prefixFor(ns)))w.d.objects.delete(k);
  await publish(w.d,{namespace:ns,directory:w.frozen.root});await publish(w.d,{namespace:ns,directory:w.newest.root});
  assert.equal(JSON.parse(w.d.objects.get(prefixFor(ns)+'previous.json')).generation,w.expect);
  w.d.objects.set(goodKey(LEGACY),FALLBACK);w.d.puts.length=0;const before=nsObjects(w.d,ns);
  const r=await run(w);assert.equal(r.slot.source,'previous.json');assert.deepEqual(w.d.puts,[goodKey(LEGACY)]);assert(sameMap(nsObjects(w.d,ns),before));
 }finally{w.done();}
});

test('beschaedigter oder abweichender Slot gilt nicht als exakt: es wird neu geschrieben, der Beleg im anderen Namespace bleibt',async()=>{
 const w=await world({layout:'a7b3-in-a'});try{
  const a=LEGACY+'-a',b=LEGACY+'-b';
  const key=[...w.d.objects.keys()].find(k=>k.startsWith(prefixFor(a))&&k.includes('/slot-')&&k.endsWith('index.json'));
  w.d.objects.set(key,Buffer.from('{"corrupt":1}'));w.d.objects.set(goodKey(LEGACY),FALLBACK);w.d.puts.length=0;
  const bBefore=nsObjects(w.d,b);
  const r=await run(w);
  assert.equal(r.slot.mode,'WRITTEN');assert(sameMap(nsObjects(w.d,b),bBefore),'8f1f-Namespace unveraendert');
 }finally{w.done();}
});

test('kein exakter Slot: nur ein Namespace wird beschrieben, ueberschriebene Daten und archivierte Manifest-Bytes stehen im Evidence',async()=>{
 const w=await world({layout:'unrelated'});try{
  w.d.objects.set(goodKey(LEGACY),FALLBACK);w.d.puts.length=0;
  const a=LEGACY+'-a',b=LEGACY+'-b',aBefore=nsObjects(w.d,a),bBefore=nsObjects(w.d,b);
  const aManifest=w.d.objects.get(prefixFor(a)+'manifest.json');
  const r=await run(w);
  // older (1001, ls -a) ist der aelteste; 8f1f in -b bleibt komplett erhalten
  assert.equal(r.slot.mode,'WRITTEN');assert.equal(r.payloadNamespace,a);
  assert(sameMap(nsObjects(w.d,b),bBefore),'der juengere Namespace bleibt byte-gleich');
  assert.deepEqual(r.overwrittenUnreferencedData,[{namespace:a,slot:0,generation:w.older.m.generation}]);
  assert.equal(r.archivedManifests.length,1);
  assert(w.d.objects.get(r.archivedManifests[0]).equals(aManifest),'ersetzte Manifest-Bytes byte-genau archiviert');
  assert(w.d.puts.every(k=>k.startsWith(LEGACY_PREFIX)));
  assert.notDeepEqual([...nsObjects(w.d,a).keys()].length,0);void aBefore;
 }finally{w.done();}
 // leerer Namespace zuerst: nichts geht verloren
 const w2=await world({layout:'unrelated'});try{
  for(const k of [...w2.d.objects.keys()])if(k.startsWith(prefixFor(LEGACY+'-b')))w2.d.objects.delete(k);
  w2.d.objects.set(goodKey(LEGACY),FALLBACK);
  const aBefore=nsObjects(w2.d,LEGACY+'-a'),r=await run(w2);
  assert.equal(r.payloadNamespace,LEGACY+'-b');assert.deepEqual(r.overwrittenUnreferencedData,[]);assert.deepEqual(r.archivedManifests,[]);
  assert(sameMap(nsObjects(w2.d,LEGACY+'-a'),aBefore));
 }finally{w2.done();}
});

test('Schreib-Guard: Puts ausserhalb des Legacy-Praefix oder auf geschuetzte Schluessel werden vor dem Schreiben abgebrochen',async()=>{
 const d=driver(),violations=[],prefix=prefixFor(LEGACY).slice(0,-1);
 const forbidden=[activationKey(),gateKey,goodKey(universeConfig.consumerNamespace),goodKey(ROLLBACK)];
 const g=guardWrites(d,{allowedPrefix:prefix,forbidden,violations});
 await g.put(goodKey(LEGACY),Buffer.from('x'));assert.equal(d.puts.length,1);
 for(const k of [goodKey(ROLLBACK),activationKey(),gateKey,goodKey(universeConfig.consumerNamespace),prefixFor(ROLLBACK)+'slot-0/index.json','v1/private/index.json'])
  await assert.rejects(g.put(k,Buffer.from('x')),/LEGACY_RESTORE_WRITE_OUTSIDE_LEGACY_NAMESPACE/);
 assert.equal(d.puts.length,1);assert.equal(violations.length,6);assert.equal((await g.get(goodKey(LEGACY))).toString(),'x');
});

test('berechnete Flags: ein Fremdschreiber auf Gate/Aktivierung waehrend des Laufs wird als Abweichung erkannt, nicht als false gemeldet',async()=>{
 const w=await world();try{
  const r=await run(w);
  for(const k of ['privateStateModified','activationModified','gateModified','universeGoodModified','rollbackModified'])assert.strictEqual(r[k],false,k);
  assert.deepEqual(r.protectedState.before,r.protectedState.after);assert(r.protectedState.before.gate&&r.protectedState.before.activation&&r.protectedState.before.universeGood&&r.protectedState.before.rollback);
 }finally{w.done();}
 const w2=await world();try{   // private Indexdatei als Teil des Snapshots
  const key=(await import('../sync-state.mjs')).prefixFor(refreshConfig.stateNamespace)+'index.json';
  w2.d.objects.set(key,Buffer.from('{"sha256":"x"}'));
  const put=w2.d.put;w2.d.put=async(k,v)=>{await put(k,v);if(k===goodKey(LEGACY))w2.d.objects.set(key,Buffer.from('{"sha256":"changed"}'));};
  await assert.rejects(run(w2),/LEGACY_RESTORE_PROTECTED_STATE_CHANGED/);assert(w2.d.objects.get(goodKey(LEGACY)).equals(FALLBACK));
 }finally{w2.done();}
});

test('ALREADY_PRESENT prueft das Fenster: abgelaufenes oder zukuenftiges vorhandenes GOOD ist PRESENT_BUT_EXPIRED, kein Erfolg',async()=>{
 const w=await world();try{
  await run(w);   // gueltiges GOOD vorhanden
  const ok=await run(w);assert.equal(ok.status,'ALREADY_PRESENT');assert(ok.validUntil);
  const future=Date.now()+8*24*H;
  const expired=await restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect,now:()=>future});
  assert.equal(expired.status,'PRESENT_BUT_EXPIRED');assert.equal(expired.generation,w.expect);
  assert.equal(expired.gateModified,false);
  assert.equal((await restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect,now:()=>Date.now()-30*24*H})).status,'PRESENT_BUT_EXPIRED');   // generatedAt in der Zukunft
 }finally{w.done();}
});

test('Teilfehler: Fehler beim Hochladen oder beim Zeigerschreiben hinterlaesst keinen Teilzustand',async()=>{
 // (a) Upload der Nutzdaten schlaegt fehl: Zeiger unberuehrt.
 let w=await world();try{
  let n=0;const put=w.d.put;w.d.put=async(k,v)=>{if(k.startsWith(LEGACY_PREFIX)&&++n===20)throw Error('R2_PUT_FAILED');return put(k,v);};
  await assert.rejects(run(w),/R2_PUT_FAILED/);
  assert(w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK));assert.equal(await goodState(w.d,LEGACY),null);
 }finally{w.done();}
 // (b) Zeigerschreiben schlaegt fehl: commitGood stellt LEGACY_FALLBACK byte-genau wieder her.
 w=await world();try{
  const put=w.d.put;let failed=false;w.d.put=async(k,v)=>{if(k===goodKey(LEGACY)&&!failed&&JSON.parse(v).state==='GOOD'){failed=true;await put(k,Buffer.from('{"half'));throw Error('POINTER_PUT_FAILED');}return put(k,v);};
  await assert.rejects(run(w),/POINTER_PUT_FAILED/);
  assert(w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK));assert.equal(await goodState(w.d,LEGACY),null);
 }finally{w.done();}
 // (c) Zeiger geschrieben, Nachlese-Verify scheitert: vorheriger Zeiger wird wiederhergestellt.
 w=await world();try{
  const put=w.d.put;w.d.put=async(k,v)=>{await put(k,v);if(k===goodKey(LEGACY)&&JSON.parse(v).state==='GOOD'){const key=[...w.d.objects.keys()].find(x=>x.startsWith(LEGACY_PREFIX)&&x.includes('/slot-')&&x.endsWith('index.json'));w.d.objects.set(key,Buffer.from('{"corrupt":true}'));}};
  await assert.rejects(run(w),/CANDIDATE_READBACK_FAILED|CONSUMER_INTEGRITY_FAILED|LEGACY_RESTORE_/);
  assert(w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK),'Zeiger zurueck auf LEGACY_FALLBACK');
 }finally{w.done();}
 // (d) Verify scheitert nach erfolgreichem Zeiger (Gate veraendert sich parallel): Rueckbau.
 w=await world();try{
  const put=w.d.put;w.d.put=async(k,v)=>{await put(k,v);if(k===goodKey(LEGACY)&&JSON.parse(v).state==='GOOD')w.d.objects.set(gateKey,Buffer.from('{"schema":1,"state":"DISABLED"}'));};
  await assert.rejects(run(w),/LEGACY_RESTORE_PROTECTED_STATE_CHANGED/);
  assert(w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK));
 }finally{w.done();}
 // (e) paralleler Zeigerwechsel zwischen Lesen und Schreiben wird erkannt.
 w=await world();try{
  const newer=Buffer.from(JSON.stringify({schema:1,state:'LEGACY_FALLBACK',note:'changed'}));
  const get=w.d.get;let reads=0;w.d.get=async k=>{if(k===goodKey(LEGACY)&&++reads===2)w.d.objects.set(k,newer);return get(k);};
  await assert.rejects(run(w),/LEGACY_RESTORE_CONCURRENT_POINTER_CHANGE/);
  assert(w.d.objects.get(goodKey(LEGACY)).equals(newer));
 }finally{w.done();}
});

test('Refresh-Restore nach Wiederherstellung: Legacy-GOOD ladbar, naechster Refresh schreibt per CAS gegen das wiederhergestellte GOOD',async()=>{
 const w=await world();try{
  await run(w);
  // runRefresh: good=goodState(Legacy), downloadGood(Legacy) als Vergleichsbasis
  const good=await goodState(w.d,LEGACY);assert(good);
  const old=w.fresh();assert.equal((await downloadGood(w.d,{namespace:LEGACY,output:old})).generation,w.expect);
  // ... und commitGood(expectedGood: good) fuer das neue Ergebnis
  const next=w.mk(0x9001,0);
  const candidate=await prepareCandidate(w.d,{namespace:LEGACY,directory:next.root,good});
  assert.notEqual(candidate.payloadNamespace,good.payloadNamespace);
  const committed=await commitGood(w.d,{namespace:LEGACY,payloadNamespace:candidate.payloadNamespace,manifest:candidate.manifest,health:{},inventory:frozenInventory,expectedGood:good});
  assert.equal(committed.generation,next.m.generation);assert.equal(committed.previous.generation,w.expect);
  assert.equal(await goodPointerState(w.d,LEGACY),'GOOD');
 }finally{w.done();}
});

test('Diagnose: abgelaufene Baseline ohne Legacy-GOOD meldet LEGACY_GOOD_MISSING_RESTORE_REQUIRED, sonst bleibt alles unveraendert',async()=>{
 const w=await world();try{
  const expired=async()=>{throw Error('CONSUMER_EXPIRED');};
  await assert.rejects(withLegacyMissingDiagnosis(w.d,LEGACY,expired),e=>e.message==='LEGACY_GOOD_MISSING_RESTORE_REQUIRED'&&e.legacyGoodState==='LEGACY_FALLBACK'&&e.cause.message==='CONSUMER_EXPIRED');
  w.d.objects.delete(goodKey(LEGACY));
  await assert.rejects(withLegacyMissingDiagnosis(w.d,LEGACY,expired),/LEGACY_GOOD_MISSING_RESTORE_REQUIRED/);
  // andere Namespaces (Verifikationslaeufe, Universum) und andere Fehler: unveraendert
  await assert.rejects(withLegacyMissingDiagnosis(w.d,'verify-continuous-discover-top46',expired),/^Error: CONSUMER_EXPIRED$/);
  await assert.rejects(withLegacyMissingDiagnosis(w.d,universeConfig.consumerNamespace,expired),/^Error: CONSUMER_EXPIRED$/);
  await assert.rejects(withLegacyMissingDiagnosis(w.d,LEGACY,async()=>{throw Error('CONSUMER_INTEGRITY_FAILED');}),/^Error: CONSUMER_INTEGRITY_FAILED$/);
  assert.equal(await withLegacyMissingDiagnosis(w.d,LEGACY,async()=>42),42);
  // Mit gueltigem GOOD ist CONSUMER_EXPIRED eine echte Aussage ueber das GOOD und wird nicht umgedeutet.
  await run(w);
  await assert.rejects(withLegacyMissingDiagnosis(w.d,LEGACY,expired),/^Error: CONSUMER_EXPIRED$/);
  assert.equal(classifyPointer(null),'ABSENT');assert.equal(classifyPointer(FALLBACK),'LEGACY_FALLBACK');assert.equal(classifyPointer('{x'),'INVALID');
 }finally{w.done();}
});

test('setProductionGate(AVAILABLE) ohne Legacy-GOOD und abgelaufener Baseline: klarer Fehler, Gate unveraendert; mit GOOD wie bisher',async()=>{
 const w=await world();try{
  w.d.objects.delete(activationKey());   // Legacy aktiv
  w.d.objects.set(prefixFor(approval.namespace)+'manifest.json',Buffer.from(JSON.stringify({...JSON.parse(readFileSync(join(HERE,'../../../docs/company-intelligence/full-data-consumer-manifest.json'))),releaseState:'APPROVED_CONTROLLED_PRODUCTION',productionApproval:approval.approvalId})));
  const gateBefore=w.d.objects.get(gateKey);w.d.puts.length=0;
  await assert.rejects(setProductionGate(w.d,'AVAILABLE'),/^Error: LEGACY_GOOD_MISSING_RESTORE_REQUIRED$/);
  assert.equal(w.d.puts.length,0);assert(w.d.objects.get(gateKey).equals(gateBefore));
  // nach der Wiederherstellung oeffnet das Gate ueber das Legacy-GOOD (Pfad unveraendert)
  await run(w);
  const r=await setProductionGate(w.d,'AVAILABLE');assert.equal(r.status,'AVAILABLE');
 }finally{w.done();}
});

test('Health: goodState/Ursache nur als Zusatzfelder, Schwellen und Verdikt unveraendert',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z'),production={state:'MISMATCH',servedGeneration:'x',reason:'DELIVERY_GENERATION_OR_SCOPE_MISMATCH'};
 const plain=evaluateHealth(null,{},production,now),fallback=evaluateHealth(null,{},production,now,'LEGACY_FALLBACK');
 assert.equal(plain.goodState,undefined);assert.equal(plain.goodStateReason,undefined);
 assert.equal(fallback.goodState,'LEGACY_FALLBACK');assert.equal(fallback.goodStateReason,'NO_LEGACY_GOOD_RESTORE_REQUIRED');
 const strip=({goodState,goodStateReason,...rest})=>rest;
 assert.deepEqual(strip(fallback),plain);assert.equal(plain.status,'CRITICAL');assert.equal(plain.exitCode,1);
 const g={generation:'a'.repeat(24),health:{lastSuccessfulRefresh:new Date(now-9*H).toISOString(),lastSuccessfulConsumerBuild:new Date(now-9*H).toISOString()}};
 const ok=evaluateHealth(g,{lastSuccessfulProductionPublication:new Date(now-9*H).toISOString()},{state:'VERIFIED',servedGeneration:g.generation},now,'GOOD');
 assert.equal(ok.status,'WARNING');assert.equal(ok.goodState,'GOOD');assert.equal(ok.goodStateReason,null);
});

/* Mutationstests: jede Sicherung muss durch einen eigenen Testfall erkannt werden. */
const SRC=readFileSync(join(HERE,'../legacy-restore.mjs'),'utf8');
async function mutant(from,to){
 assert.ok(SRC.includes(from),'Mutationsstelle fehlt: '+from);
 const dir=mkdtempSync(join(tmpdir(),'legacy-restore-mut-')),file=join(dir,'legacy-restore.mjs');
 writeFileSync(file,SRC.replace(from,to).replaceAll("from './",`from '${pathToFileURL(join(HERE,'..')).href}/`));
 try{return await import(pathToFileURL(file).href+'?m='+Math.random());}finally{rmSync(dir,{recursive:true,force:true});}
}
test('Mutation: ohne Fensterpruefung wuerde ein abgelaufener Freeze (Testfall oben) durchrutschen',async()=>{
 const m=await mutant("assert(now-t<=7*DAY-RESTORE_MIN_REMAINING_MS,'LEGACY_RESTORE_FROZEN_EXPIRED');","");
 const w=await world({frozenAge:7*24*H-5*60000});try{
  await assert.rejects(restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect}),/LEGACY_RESTORE_FROZEN_EXPIRED/);   // Original fail-closed
  const r=await m.restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect});assert.equal(r.status,'RESTORED','Mutant erkannt: Testfall wuerde fehlschlagen');
 }finally{w.done();}
});
test('Mutation: ohne Generationsabgleich waere ein falscher expect-generation wirkungslos',async()=>{
 const m=await mutant("assert.equal(frozen.generation,expectGeneration,'LEGACY_RESTORE_EXPECTED_GENERATION_MISMATCH');","");
 const w=await world();try{
  const r=await m.restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:'1'.repeat(24)});assert.equal(r.status,'RESTORED','Mutant erkannt');
 }finally{w.done();}
});
test('Mutation: ohne Scope-Pruefung wuerde ein Freeze mit 45 Titeln (hier ueber die Zusatzpruefung) nicht mehr abgewiesen',async()=>{
 const m=await mutant("assertLegacyScope(frozen,'LEGACY_RESTORE_FROZEN_SCOPE_INVALID');","");
 const w=await world();try{
  const pointer=JSON.parse(w.d.objects.get(goodKey(ROLLBACK)));pointer.inventory=Object.fromEntries(Object.entries(pointer.inventory).slice(1));
  w.d.objects.set(goodKey(ROLLBACK),Buffer.from(JSON.stringify(pointer)));
  await assert.rejects(restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect}),/LEGACY_RESTORE_FROZEN_SCOPE_INVALID/);
  assert.equal(w.d.puts.length,0);
  await assert.rejects(m.restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect}),/LEGACY_RESTORE_RESULT_SCOPE_INVALID/);
  assert(w.d.puts.length>0,'Mutant erkannt: schreibt, bevor erst das Ergebnis-Verify scheitert');
 }finally{w.done();}
});
test('Mutation: ohne ALREADY_PRESENT-Zweig wuerde ein vorhandenes Legacy-GOOD ueberschrieben',async()=>{
 const m=await mutant("if(pointerState==='GOOD'||pointerState==='INVALID'){","if(false){");
 const w=await world();try{
  await advance(w.d,LEGACY,w.newest);const live=w.d.objects.get(goodKey(LEGACY));
  w.d.puts.length=0;
  assert.equal((await restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect})).status,'ALREADY_PRESENT');assert.equal(w.d.puts.length,0);
  await assert.rejects(m.restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect}),/CONCURRENT_GOOD_POINTER_ADVANCE/);
  assert(w.d.puts.length>0,'Mutant erkannt: wuerde schreiben; nur die CAS-Pruefung in commitGood haelt den Zeiger');
  assert(w.d.objects.get(goodKey(LEGACY)).equals(live));
 }finally{w.done();}
});
test('Mutation: ohne Rueckbau bliebe nach fehlgeschlagenem Verify ein Teilzustand',async()=>{
 const m=await mutant("if(current&&current.equals(nextBytes)){","if(false){");
 const w=await world();try{
  const put=w.d.put;w.d.put=async(k,v)=>{await put(k,v);if(k===goodKey(LEGACY)&&JSON.parse(v).state==='GOOD')w.d.objects.set(gateKey,Buffer.from('{"state":"DISABLED"}'));};
  await assert.rejects(m.restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect}),/LEGACY_RESTORE_PROTECTED_STATE_CHANGED/);
  assert(!w.d.objects.get(goodKey(LEGACY)).equals(FALLBACK),'Mutant erkannt: Zeiger blieb stehen');
 }finally{w.done();}
});

test('Mutation: ohne Fensterpruefung meldete ein abgelaufenes vorhandenes GOOD faelschlich ALREADY_PRESENT',async()=>{
 const m=await mutant("ok?'ALREADY_PRESENT':'PRESENT_BUT_EXPIRED'","'ALREADY_PRESENT'");
 const w=await world();try{
  await run(w);const future=Date.now()+8*24*H;
  assert.equal((await restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect,now:()=>future})).status,'PRESENT_BUT_EXPIRED');
  assert.equal((await m.restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect,now:()=>future})).status,'ALREADY_PRESENT','Mutant erkannt');
 }finally{w.done();}
});
test('Mutation: ohne exakte Slot-Wiederverwendung entstuende ein zweiter Satz',async()=>{
 const m=await mutant("const exact=await findExactSlot(driver,legacy,frozen);","const exact=null;");
 const w=await world({layout:'a7b3-in-a'});try{
  w.d.objects.set(goodKey(LEGACY),FALLBACK);w.d.puts.length=0;
  await m.restoreLegacyGood(w.d,{temporary:w.fresh(),expectGeneration:w.expect});
  assert(w.d.puts.length>1,'Mutant erkannt: schreibt Daten statt nur den Zeiger');
 }finally{w.done();}
});
test('Mutation: ohne Schreib-Guard wuerde ein Put ausserhalb des Legacy-Praefix durchgehen',async()=>{
 const m=await mutant("if(!String(key).startsWith(allowedPrefix)||forbidden.includes(key)){","if(false){");
 const d=driver(),g=m.guardWrites(d,{allowedPrefix:'x',forbidden:[],violations:[]});
 await g.put(goodKey(ROLLBACK),Buffer.from('x'));assert.equal(d.puts.length,1,'Mutant erkannt');
});
