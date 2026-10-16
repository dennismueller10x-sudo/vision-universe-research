/* Heilpfad fuer den Zustand "kein Legacy-GOOD" (good.json == LEGACY_FALLBACK oder fehlt).
   Ausloeser war ein doppelter Rollback (Refresh-Deploy-Fehlerpfad plus Pages-Notfall-Rollback):
   `rollbackGood` schreibt ohne Vorgaenger LEGACY_FALLBACK, `goodState` liefert dann null und
   der Refresh faellt auf die feste Baseline (approval.namespace) zurueck, deren Manifest nach
   sieben Tagen CONSUMER_EXPIRED meldet. Kein Datenverlust: nur der Zeiger fehlt.

   `restoreLegacyGood` setzt den Legacy-Zeiger aus dem eingefrorenen, streng verifizierten
   Rollback (eligible-rollback-top46-v1) neu. Es schreibt ausschliesslich
   - die Nutzdaten in den Legacy-Payload-Namespace (-a/-b, noch von keinem Zeiger referenziert) und
   - danach per CAS (expectedGood=null) den Legacy-good.json-Zeiger.
   Nie: Aktivierung, Gate, Universe-GOOD, Rollback-Namespace, privater Stand. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {prefixFor,preflight} from './public-delivery.mjs';
import {goodKey,goodState,downloadGood,commitGood,activationKey} from './refresh-storage.mjs';
import {refreshConfig,refreshApproved} from './refresh-approval.mjs';
import {prefixFor as privatePrefix} from './sync-state.mjs';
import {universeConfig} from './universe-approval.mjs';
import {approval} from './production-approval.mjs';
import {prepareFrozenRollback} from './frozen-rollback.mjs';
import {assertLegacyScope,refreezeArchiveKey} from './frozen-refreeze.mjs';
const DAY=86400000;
/* Der Downloader lehnt Snapshots ab 7 Tagen nach generatedAt ab (CONSUMER_EXPIRED). Ein wiederhergestelltes
   GOOD erbt diesen Zeitstempel unveraendert; wer kuerzer als diese Reserve gueltig waere, wuerde schon
   waehrend des Laufs ablaufen. Kein Verlaengern, kein Umstempeln: der Zeitstempel bleibt das des Freeze. */
export const RESTORE_MIN_REMAINING_MS=15*60000;
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hex24=/^[a-f0-9]{24}$/,hex64=/^[a-f0-9]{64}$/;
const FALLBACK_BYTES=()=>Buffer.from(JSON.stringify({schema:1,state:'LEGACY_FALLBACK'}));
async function bytesOf(driver,key){const b=await driver.get(key);return b?Buffer.from(b):null;}
function emptyDirectory(path){assert(!existsSync(path)||readdirSync(path).length===0,'LEGACY_RESTORE_DIRECTORY_NOT_EMPTY');}
/* Zustand des Legacy-Zeigers, ohne ihn zu validieren: GOOD | LEGACY_FALLBACK | ABSENT | INVALID. */
export function classifyPointer(raw){
 if(!raw)return 'ABSENT';
 try{const p=JSON.parse(Buffer.from(raw).toString('utf8'));return p?.state==='LEGACY_FALLBACK'?'LEGACY_FALLBACK':p?.state==='GOOD'?'GOOD':'INVALID';}
 catch{return 'INVALID';}
}
export async function goodPointerState(driver,namespace=refreshConfig.consumerNamespace){
 try{return classifyPointer(await driver.get(goodKey(namespace)));}catch{return 'UNREADABLE';}
}
/* Ersetzt das irrefuehrende CONSUMER_EXPIRED der abgelaufenen Baseline (approval.namespace), wenn die
   eigentliche Ursache der fehlende Legacy-GOOD-Zeiger ist. Alle anderen Fehler und Namespaces bleiben unveraendert. */
export async function withLegacyMissingDiagnosis(driver,namespace,fn){
 try{return await fn();}
 catch(error){
  if(error?.message==='CONSUMER_EXPIRED'&&namespace===refreshConfig.consumerNamespace){
   const state=await goodPointerState(driver,namespace);
   if(state!=='GOOD'){const e=Error('LEGACY_GOOD_MISSING_RESTORE_REQUIRED');e.cause=error;e.legacyGoodState=state;throw e;}
  }
  throw error;
 }
}
const protectedKeys=()=>({activation:activationKey(),gate:prefixFor(approval.namespace)+'gate.json',universeGood:goodKey(universeConfig.consumerNamespace),rollback:goodKey(universeConfig.rollbackNamespace),privateState:privatePrefix(refreshConfig.stateNamespace)+'index.json'});
async function snapshot(driver){
 const out={};for(const [name,key] of Object.entries(protectedKeys())){const b=await bytesOf(driver,key);out[name]=b&&sha(b);}return out;
}
/* Marker/Archiv des Freeze muessen in sich stimmig sein (gleiche Regeln wie assertRollbackFreeze,
   nur ohne Bezug zum nicht mehr vorhandenen Legacy-GOOD). Ein Freeze ohne Marker ist der urspruengliche. */
export async function verifyFreezeMarker(driver,frozen){
 const r=frozen.refreeze;
 if(r===undefined||r===null)return 'ORIGINAL';
 const bad=code=>Error(code);
 if(!(r.schema===1&&r.sourceGeneration===frozen.generation&&hex24.test(r.previousGeneration||'')&&Array.isArray(r.lineage)&&r.lineage.at(-1)===r.previousGeneration&&r.archiveKey===refreezeArchiveKey(r.previousGeneration)&&hex64.test(r.previousPointerSha256||'')))throw bad('LEGACY_RESTORE_MARKER_INVALID');
 if(!(hex64.test(r.sourceAssetsSha256||'')&&sha(JSON.stringify(frozen.manifest.assets))===r.sourceAssetsSha256))throw bad('LEGACY_RESTORE_MARKER_ASSETS_MISMATCH');
 const raw=await bytesOf(driver,r.archiveKey);let archive=null;
 try{archive=raw&&JSON.parse(raw);}catch{archive=null;}
 if(!(archive?.kind==='ROLLBACK_FREEZE_ARCHIVE'&&archive.generation===r.previousGeneration&&archive.pointerSha256===r.previousPointerSha256&&typeof archive.pointer==='string'&&sha(Buffer.from(archive.pointer))===r.previousPointerSha256&&JSON.parse(archive.pointer).generation===r.previousGeneration))throw bad('LEGACY_RESTORE_ARCHIVE_INVALID');
 return 'REFREEZE';
}
/* Gueltigkeitsfenster: nicht in der Zukunft, nicht abgelaufen, mit Mindestreserve. Nur gegen generatedAt. */
export function assertRestoreWindow(generatedAt,now){
 const t=Date.parse(generatedAt);
 assert(Number.isFinite(t),'LEGACY_RESTORE_GENERATED_AT_INVALID');
 assert(t<=now+300000,'LEGACY_RESTORE_GENERATED_AT_IN_FUTURE');
 assert(now-t<=7*DAY-RESTORE_MIN_REMAINING_MS,'LEGACY_RESTORE_FROZEN_EXPIRED');
 return new Date(t+7*DAY).toISOString();
}
/* Laufzeit-Guard: waehrend der Wiederherstellung darf nur im Legacy-Praefix geschrieben werden, nie auf
   einen geschuetzten Schluessel (Aktivierung, Gate, Universe-GOOD, Rollback, privater Stand). Der Verstoss
   wird vor dem Schreiben abgebrochen; Lesezugriffe laufen unveraendert ueber den echten Treiber. */
export function guardWrites(driver,{allowedPrefix,forbidden,violations=[]}){
 return new Proxy(driver,{get(target,property){
  if(property==='put')return async(key,value)=>{
   if(!String(key).startsWith(allowedPrefix)||forbidden.includes(key)){violations.push(String(key));throw Error('LEGACY_RESTORE_WRITE_OUTSIDE_LEGACY_NAMESPACE');}
   return target.put(key,value);
  };
  const v=target[property];return typeof v==='function'?v.bind(target):v;
 }});
}
const strip=({slot,contentCounts,...rest})=>rest;
function deepSame(a,b){try{assert.deepStrictEqual(a,b);return true;}catch{return false;}}
async function readManifest(driver,key){
 const raw=await bytesOf(driver,key);if(!raw)return {raw:null,manifest:null};
 try{return {raw,manifest:JSON.parse(raw)};}catch{return {raw,manifest:null};}
}
/* Exakter Slot: ein Legacy-Namespace (manifest.json ODER previous.json), der die eingefrorene Generation bereits
   byte-genau haelt (Manifest bis auf slot/contentCounts gleich, Zertifikat vorhanden, jedes Asset im Slot per
   SHA-256 intakt). Dann ist keine Datenkopie noetig: nur der Zeiger wird geschrieben. */
async function findExactSlot(driver,namespace,frozen){
 for(const n of [namespace+'-a',namespace+'-b'])for(const file of ['manifest.json','previous.json']){
  const {manifest:m}=await readManifest(driver,prefixFor(n)+file);
  if(!m||m.generation!==frozen.generation||![0,1].includes(m.slot??0))continue;
  if(!deepSame(strip(m),strip(frozen.manifest))||!refreshApproved(m))continue;
  const prefix=prefixFor(n);let intact=true;
  for(const [path,meta] of Object.entries(m.assets)){
   const b=await driver.get(prefix+`slot-${m.slot||0}/`+(path==='index.json'?path:path.split('/').slice(2).join('/')));
   if(!b||b.length!==meta.bytes||sha(b)!==meta.sha256){intact=false;break;}
  }
  if(intact)return {namespace:n,slot:m.slot||0,manifest:m,source:file};
 }
 return null;
}
/* Kein exakter Slot: publish() blendet das Namespace-Manifest aus und schreibt immer nach slot-0. Gewaehlt wird der
   Namespace mit den wenigsten Daten in slot-0 (leer zuerst, dann der mit aelterem Manifest). Was dort an Daten einer
   anderen (unreferenzierten) Generation liegt, wird im Evidence-JSON ausgewiesen; die Bytes des ersetzten
   Namespace-manifest.json werden vorher im Legacy-Praefix archiviert. */
async function planFreshWrite(driver,namespace,generation){
 const plans=[];
 for(const n of [namespace+'-a',namespace+'-b']){
  const cur=await readManifest(driver,prefixFor(n)+'manifest.json'),prev=await readManifest(driver,prefixFor(n)+'previous.json');
  const holders=[cur,prev].filter(x=>x.manifest&&(x.manifest.slot||0)===0&&x.manifest.generation!==generation).map(x=>x.manifest.generation);
  plans.push({namespace:n,holders:[...new Set(holders)],currentRaw:cur.raw,at:Number.isFinite(Date.parse(cur.manifest?.generatedAt))?Date.parse(cur.manifest.generatedAt):0});
 }
 return plans.sort((x,y)=>x.holders.length-y.holders.length||x.at-y.at||(x.namespace<y.namespace?-1:1))[0];
}
/* Die Flags sind berechnet, nicht konstant: Vergleich der geschuetzten Schluessel vor und nach der Aktion. */
function computedFlags(before,after){
 const map={privateStateModified:'privateState',activationModified:'activation',gateModified:'gate',universeGoodModified:'universeGood',rollbackModified:'rollback'};
 return {...Object.fromEntries(Object.entries(map).map(([flag,key])=>[flag,before[key]!==after[key]])),protectedState:{before,after}};
}
export async function restoreLegacyGood(rawDriver,{temporary,expectGeneration=null,now=Date.now}={}){
 const legacy=refreshConfig.consumerNamespace,rollback=universeConfig.rollbackNamespace;
 // Erwartung ist Pflicht und explizit: genau die Generation, die der Operator im Freeze erwartet.
 assert(hex24.test(expectGeneration||''),'LEGACY_RESTORE_EXPECT_GENERATION_REQUIRED');
 const violations=[],legacyPrefix=prefixFor(legacy).slice(0,-1);
 // Ab hier gehen alle Schreibzugriffe durch den Guard (nur Legacy-Praefix, nie geschuetzte Schluessel).
 const driver=guardWrites(rawDriver,{allowedPrefix:legacyPrefix,forbidden:Object.values(protectedKeys()),violations});
 const before=await snapshot(driver);
 // 1. Nur wirklich fehlendes Legacy-GOOD wird repariert; ein vorhandenes, gueltiges bleibt unberuehrt.
 const legacyBytes=await bytesOf(driver,goodKey(legacy)),pointerState=classifyPointer(legacyBytes);
 if(pointerState==='GOOD'||pointerState==='INVALID'){
  const present=await goodState(driver,legacy);   // wirft INVALID_REFRESH_GOOD_POINTER bei defektem Zeiger: nie ueberschreiben
  assert(present,'LEGACY_RESTORE_POINTER_STATE_UNEXPECTED');
  // Vorhanden heisst nicht brauchbar: ein abgelaufenes GOOD ist kein Erfolg (CONSUMER_EXPIRED in jedem Download).
  const t=Date.parse(present.manifest.generatedAt),ok=Number.isFinite(t)&&t<=now()+300000&&now()-t<=7*DAY;
  return {status:ok?'ALREADY_PRESENT':'PRESENT_BUT_EXPIRED',generation:present.generation,generatedAt:present.manifest.generatedAt,validUntil:Number.isFinite(t)?new Date(t+7*DAY).toISOString():null,stockCount:present.manifest.tickers.length,...computedFlags(before,await snapshot(driver))};
 }
 // 2. Universum darf nicht (teilweise) live sein: nur die geschlossene ROLLBACK_46-Welt wird repariert.
 const activation=await bytesOf(driver,activationKey());
 if(activation){let p=null;try{p=JSON.parse(activation);}catch{p=null;}assert(p&&p.schema===1&&p.approvalId===universeConfig.approvalId&&p.state==='ROLLBACK_46','LEGACY_RESTORE_REFUSED_UNIVERSE_ACTIVE_OR_INVALID_ACTIVATION');}
 // 3. Eingefrorener Rollback: vorhanden, exakt 46 Titel / 45 Emittenten, erwartete Generation, im Fenster.
 const frozenBytes=await bytesOf(driver,goodKey(rollback));
 const frozen=await goodState(driver,rollback);
 assert(frozen,'LEGACY_RESTORE_FROZEN_ROLLBACK_REQUIRED');
 assert.equal(frozen.generation,expectGeneration,'LEGACY_RESTORE_EXPECTED_GENERATION_MISMATCH');
 assertLegacyScope(frozen,'LEGACY_RESTORE_FROZEN_SCOPE_INVALID');
 assert(frozen.previous==null,'LEGACY_RESTORE_FROZEN_PREVIOUS_UNEXPECTED');
 const validUntil=assertRestoreWindow(frozen.manifest.generatedAt,now());
 const marker=await verifyFreezeMarker(driver,frozen);
 // 4. Hash-verifizierte Kopie aus leerem Verzeichnis; alle Assets zusaetzlich unabhaengig auf Platte geprueft.
 const directory=join(temporary,'restore-legacy-source');emptyDirectory(directory);mkdirSync(directory,{recursive:true});
 const dl=await downloadGood(driver,{namespace:rollback,output:directory});
 assert(dl&&dl.generation===frozen.generation&&same(dl.good.manifest,frozen.manifest),'LEGACY_RESTORE_SOURCE_READBACK_FAILED');
 const assets=Object.entries(frozen.manifest.assets);
 assert.equal(dl.files,assets.length,'LEGACY_RESTORE_SOURCE_FILE_COUNT_MISMATCH');
 for(const [path,meta] of assets){
  const file=join(directory,path);assert(existsSync(file),'LEGACY_RESTORE_SOURCE_ASSET_MISSING');
  const b=readFileSync(file);assert(b.length===meta.bytes&&sha(b)===meta.sha256,'LEGACY_RESTORE_SOURCE_HASH_MISMATCH');
 }
 const index=JSON.parse(readFileSync(join(directory,'index.json')));
 assert(index.generation===frozen.generation&&(index.generatedAt===undefined||index.generatedAt===frozen.manifest.generatedAt),'LEGACY_RESTORE_INDEX_MISMATCH');
 // Der Downloader kopiert nur oeffentliche Assets; das Zertifikat wird ausschliesslich privat wieder angehaengt.
 writeFileSync(join(directory,'manifest.json'),JSON.stringify(frozen.manifest)+'\n');
 preflight(directory,frozen.manifest);
 // 5. Nutzdaten: bevorzugt der Slot, der die Generation bereits exakt haelt (keine Kopie, nur Zeiger), sonst Neuschreiben.
 let target,manifest,reuse,overwrites=[],archived=[];
 const exact=await findExactSlot(driver,legacy,frozen);
 if(exact){target=exact.namespace;manifest=exact.manifest;reuse={mode:'EXACT_SLOT',namespace:target,slot:exact.slot,source:exact.source};}
 else{
  const plan=await planFreshWrite(driver,legacy,frozen.generation);target=plan.namespace;
  // Bytes des Namespace-manifest.json, das publish() ersetzt, bleiben als Beleg im Legacy-Praefix erhalten.
  if(plan.currentRaw){
   const key=prefixFor(legacy)+`restore-legacy/${target.slice(legacy.length+1)}-manifest-${sha(plan.currentRaw).slice(0,16)}.json`;
   const prior=await bytesOf(driver,key);
   if(!prior){await driver.put(key,plan.currentRaw);const back=await bytesOf(driver,key);assert(back&&back.equals(plan.currentRaw),'LEGACY_RESTORE_ARCHIVE_WRITE_FAILED');}
   archived.push(key);
  }
  overwrites=plan.holders.map(generation=>({namespace:target,slot:0,generation}));
  const candidate=await prepareFrozenRollback(driver,{namespace:legacy,directory,good:{payloadNamespace:target===legacy+'-a'?legacy+'-b':legacy+'-a'},frozen});
  assert(candidate.payloadNamespace===target&&candidate.manifest.generation===frozen.generation,'LEGACY_RESTORE_CANDIDATE_MISMATCH');
  manifest=candidate.manifest;reuse={mode:'WRITTEN',namespace:target,slot:candidate.manifest.slot||0};
 }
 // Zwischen Lesen und Schreiben darf sich weder Legacy-Zeiger noch Freeze bewegt haben.
 const legacyAgain=await bytesOf(driver,goodKey(legacy)),frozenAgain=await bytesOf(driver,goodKey(rollback));
 assert((legacyBytes===null?legacyAgain===null:legacyAgain&&legacyAgain.equals(legacyBytes))&&frozenAgain&&frozenAgain.equals(frozenBytes),'LEGACY_RESTORE_CONCURRENT_POINTER_CHANGE');
 // 6. CAS: expectedGood=null. commitGood liest jedes Asset per Hash, schreibt den Zeiger, liest nach und stellt bei Teilfehler selbst zurueck.
 const next=await commitGood(driver,{namespace:legacy,payloadNamespace:target,manifest,health:frozen.health,inventory:frozen.inventory,expectedGood:null});
 const nextBytes=Buffer.from(JSON.stringify(next));
 // 7. Nachlesen/Verify aus leerem Verzeichnis; bei jeder Abweichung den vorherigen Zustand byte-genau zurueck.
 let after;
 try{
  const good=await goodState(driver,legacy);
  assert(good&&good.generation===frozen.generation&&good.previous===null&&good.payloadNamespace===target&&same(good.manifest,manifest),'LEGACY_RESTORE_POINTER_VERIFY_FAILED');
  assertLegacyScope(good,'LEGACY_RESTORE_RESULT_SCOPE_INVALID');
  const readback=join(temporary,'restore-legacy-readback');emptyDirectory(readback);
  const r=await downloadGood(driver,{namespace:legacy,output:readback});
  assert(r&&r.generation===frozen.generation&&r.files===assets.length&&same(r.good.manifest.assets,frozen.manifest.assets),'LEGACY_RESTORE_READBACK_HASH_MISMATCH');
  after=await snapshot(driver);
  assert.deepEqual(after,before,'LEGACY_RESTORE_PROTECTED_STATE_CHANGED');
  assert.equal(violations.length,0,'LEGACY_RESTORE_WRITE_OUTSIDE_LEGACY_NAMESPACE');
 }catch(error){
  const current=await bytesOf(driver,goodKey(legacy));
  if(current&&current.equals(nextBytes)){
   const old=legacyBytes||FALLBACK_BYTES();await driver.put(goodKey(legacy),old);
   const back=await bytesOf(driver,goodKey(legacy));assert(back&&back.equals(old),'LEGACY_RESTORE_RECOVERY_FAILED');
  }
  throw error;
 }
 return {status:'RESTORED',generation:frozen.generation,payloadNamespace:target,pointerBefore:pointerState,freezeMarker:marker,validUntil,stockCount:46,issuerCount:45,
  slot:reuse,overwrittenUnreferencedData:overwrites,archivedManifests:archived,...computedFlags(before,after)};
}
