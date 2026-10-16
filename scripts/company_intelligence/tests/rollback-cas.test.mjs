/* Rollback mit Erwartungsgeneration: Idempotenz, kein Ueberschreiben fremder Generationen, byte-genaue Wiederherstellung. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {refreshConfig,frozenInventory,frozenTickers,refreshApproved,freshness,safePublicRefresh} from '../refresh-approval.mjs';
import {prepareCandidate,commitGood,goodState,rollbackGood,goodKey} from '../refresh-storage.mjs';
import {runRollback} from '../refresh-run.mjs';
function driver(){const objects=new Map();return {objects,get:async k=>objects.get(k)||null,put:async(k,v)=>objects.set(k,Buffer.from(v))};}
function fixture(n,generatedAt='2026-10-09T12:00:00Z'){
 const root=mkdtempSync(join(tmpdir(),'refresh-contract-')),generation=n.toString(16).padStart(24,'0'),schema='vu-company-intelligence-1.0.0';
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
async function advance(d,namespace,f){const good=await goodState(d,namespace),r=await prepareCandidate(d,{namespace,directory:f.root,good});return commitGood(d,{namespace,payloadNamespace:r.payloadNamespace,manifest:r.manifest,health:{},inventory:frozenInventory,expectedGood:good});}
const cleanup=fs=>{for(const f of fs)rmSync(f.root,{recursive:true,force:true});};
const gen=async(d,ns)=>(await goodState(d,ns))?.generation;
function counting(d){const writes=[];const c={...d,writes,put:async(k,v)=>{writes.push(k);return d.put(k,v);}};return c;}

test('normaler Rollback: genau ein Rollback nach Fehler setzt den Zeiger auf den Vorgaenger',async()=>{
 const d=driver(),ns='cas',fs=[1,2].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);
  const r=await rollbackGood(d,ns,{expectGeneration:fs[1].m.generation});
  assert.equal(r.status,'ROLLED_BACK');assert.equal(r.generation,fs[0].m.generation);
  const g=await goodState(d,ns);assert.equal(g.generation,fs[0].m.generation);assert.equal(g.previous,null);
 }finally{cleanup(fs);}
});
test('Aufruf ohne Erwartung verhaelt sich im Normalfall wie bisher',async()=>{
 const d=driver(),ns='cas',fs=[1,2].map(n=>fixture(n));
 try{await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);const r=await rollbackGood(d,ns);assert.equal(r.status,'ROLLED_BACK');assert.equal(await gen(d,ns),fs[0].m.generation);}finally{cleanup(fs);}
});
test('doppelter Rollback ist idempotent: der zweite Aufruf schreibt nicht',async()=>{
 const d=driver(),ns='cas',fs=[1,2,3].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);await advance(d,ns,fs[2]);
  const c=counting(d),exp=fs[2].m.generation;
  assert.equal((await rollbackGood(c,ns,{expectGeneration:exp})).status,'ROLLED_BACK');
  const after=await d.get(goodKey(ns));c.writes.length=0;
  for(const opts of [{expectGeneration:exp},{}]){
   const r=await rollbackGood(c,ns,opts);assert.equal(r.status,'ALREADY_ROLLED_BACK');
  }
  assert.equal(c.writes.length,0);assert.deepEqual(await d.get(goodKey(ns)),after);
  assert.equal(await gen(d,ns),fs[1].m.generation,'nicht ueber den Vorgaenger hinaus');
 }finally{cleanup(fs);}
});
test('zwischenzeitlich neue Generation: kein Schreiben, GENERATION_MISMATCH',async()=>{
 const d=driver(),ns='cas',fs=[1,2,3].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);await advance(d,ns,fs[2]);
  const before=await d.get(goodKey(ns)),c=counting(d);
  const r=await rollbackGood(c,ns,{expectGeneration:fs[1].m.generation});
  assert.equal(r.status,'GENERATION_MISMATCH');assert.equal(r.actualGeneration,fs[2].m.generation);
  assert.equal(c.writes.length,0);assert.deepEqual(await d.get(goodKey(ns)),before);
 }finally{cleanup(fs);}
});
test('Zeiger aendert sich zwischen Lesen und Schreiben: kein Schreiben',async()=>{
 const d=driver(),ns='cas',fs=[1,2,3].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);
  const key=goodKey(ns);let reads=0;
  const racing={...d,get:async k=>{if(k===key&&++reads===3)await advance(d,ns,fs[2]);return d.get(k);},put:d.put};
  const r=await rollbackGood(racing,ns,{expectGeneration:fs[1].m.generation});
  assert.equal(r.status,'GENERATION_MISMATCH');assert.equal(await gen(d,ns),fs[2].m.generation);
 }finally{cleanup(fs);}
});
test('Rollback ohne Vorgaenger faellt auf LEGACY_FALLBACK, danach idempotent',async()=>{
 const d=driver(),ns='cas',fs=[1].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);
  assert.equal((await rollbackGood(d,ns,{expectGeneration:fs[0].m.generation})).status,'ROLLED_BACK');
  assert.equal(await goodState(d,ns),null);
  const c=counting(d);assert.equal((await rollbackGood(c,ns,{expectGeneration:fs[0].m.generation})).status,'LEGACY_FALLBACK');assert.equal(c.writes.length,0);
  assert.equal((await rollbackGood(driver(),'leer')).status,'LEGACY_FALLBACK');
 }finally{cleanup(fs);}
});
test('Teilfehler beim Schreiben und beim Nachlesen: Zeiger bleibt byte-genau',async()=>{
 const d=driver(),ns='cas',fs=[1,2].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);const before=await d.get(goodKey(ns)),exp=fs[1].m.generation;
  // Put wirft, nachdem die Daten bereits halb geschrieben wurden.
  let n=0;const half={...d,put:async(k,v)=>{if(++n===1){await d.put(k,Buffer.from(String(v).slice(0,10)));throw Error('R2_UNAVAILABLE');}return d.put(k,v);}};
  await assert.rejects(rollbackGood(half,ns,{expectGeneration:exp}),/R2_UNAVAILABLE/);assert.deepEqual(await d.get(goodKey(ns)),before);
  // Nachlesen liefert verfaelschte Bytes.
  let m=0;const bad={...d,put:d.put,get:async k=>{const v=await d.get(k);return k===goodKey(ns)&&++m===4?Buffer.from('xx'):v;}};
  await assert.rejects(rollbackGood(bad,ns,{expectGeneration:exp}),/ROLLBACK_READBACK_FAILED/);assert.deepEqual(await d.get(goodKey(ns)),before);
  // Wiederherstellung scheitert ebenfalls: eigener Fehlercode.
  const dead={...d,put:async()=>{throw Error('R2_UNAVAILABLE');}};
  await assert.rejects(rollbackGood(dead,ns,{expectGeneration:exp}),/R2_UNAVAILABLE|ROLLBACK_RECOVERY_FAILED/);assert.deepEqual(await d.get(goodKey(ns)),before);
  assert.equal((await rollbackGood(d,ns,{expectGeneration:exp})).status,'ROLLED_BACK','nach den Fehlern weiterhin moeglich');
 }finally{cleanup(fs);}
});
test('drei Generationen: Rollback, neue Veroeffentlichung, alter Retry ueberschreibt nichts',async()=>{
 const d=driver(),ns='cas',fs=[1,2,3,4].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);await advance(d,ns,fs[2]);
  const g3=fs[2].m.generation;
  assert.equal((await rollbackGood(d,ns,{expectGeneration:g3})).status,'ROLLED_BACK');
  assert.equal(await gen(d,ns),fs[1].m.generation);
  await advance(d,ns,fs[3]);const before=await d.get(goodKey(ns));
  const r=await rollbackGood(d,ns,{expectGeneration:g3});
  assert.equal(r.status,'GENERATION_MISMATCH');assert.deepEqual(await d.get(goodKey(ns)),before);
  assert.equal(await gen(d,ns),fs[3].m.generation);
  assert.equal((await rollbackGood(d,ns,{expectGeneration:fs[3].m.generation})).status,'ROLLED_BACK');
  assert.equal(await gen(d,ns),fs[1].m.generation);
 }finally{cleanup(fs);}
});
test('CLI-Kern runRollback: Mismatch liefert Exit 1 ohne Schreiben, Erfolg und Wiederholung Exit 0',async()=>{
 const d=driver(),ns=refreshConfig.consumerNamespace,fs=[1,2].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);
  const before=await d.get(goodKey(ns)),c=counting(d);
  const miss=await runRollback(c,{expectGeneration:'f'.repeat(24)});
  assert.equal(miss.exitCode,1);assert.equal(miss.result.status,'GENERATION_MISMATCH');assert.equal(c.writes.length,0);assert.deepEqual(await d.get(goodKey(ns)),before);
  const ok=await runRollback(c,{expectGeneration:fs[1].m.generation});assert.equal(ok.exitCode,0);assert.equal(ok.result.status,'ROLLED_BACK');
  c.writes.length=0;const again=await runRollback(c,{expectGeneration:fs[1].m.generation});
  assert.equal(again.exitCode,0);assert.equal(again.result.status,'ALREADY_ROLLED_BACK');assert.equal(c.writes.length,0);
 }finally{cleanup(fs);}
});
test('Mutationstests: ohne Erwartungspruefung oder Marker waeren die Aussagen falsch',async()=>{
 const src=readFileSync(new URL('../refresh-storage.mjs',import.meta.url),'utf8');
 const run=async code=>{
  const m=await import('data:text/javascript;base64,'+Buffer.from(code.replace("from './","from '"+new URL('../',import.meta.url).href).replace(/from '\.\//g,"from '"+new URL('../',import.meta.url).href)).toString('base64'));
  const d=driver(),ns='mut',fs=[1,2,3].map(n=>fixture(n));
  try{
   await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);await advance(d,ns,fs[2]);
   const exp=fs[2].m.generation;await m.rollbackGood(d,ns,{expectGeneration:exp});
   const second=await m.rollbackGood(d,ns,{expectGeneration:exp});
   const stale=await m.rollbackGood(d,ns,{expectGeneration:fs[2].m.generation});
   return {second:second.status,gen:await gen(d,ns),stale:stale.status,expected:fs[1].m.generation};
  }finally{cleanup(fs);}
 };
 const base=await run(src);assert.equal(base.second,'ALREADY_ROLLED_BACK');assert.equal(base.gen,base.expected);
 // Mutation 1: Idempotenz-Marker entfernt => zweiter Aufruf meldet nicht mehr ALREADY_ROLLED_BACK (Retry wirkt als Fehler).
 const m1=src.replace("if(good.rolledBackFrom?.generation===expected)return","if(false)return");
 assert.notEqual(m1,src);const r1=await run(m1);assert.notEqual(r1.second,'ALREADY_ROLLED_BACK');
 // Mutation 2: Generationspruefung entfernt => fremde Generation wird ueberschrieben.
 const m2=src.replace("if(good.generation!==expected){","if(false){");
 assert.notEqual(m2,src);const r2=await run(m2);assert.notEqual(r2.gen,r2.expected);
 // Mutation 3: Wiederherstellung entfernt => Teilfehler laesst den Zeiger veraendert.
 const m3=src.replace("await driver.put(key,prior);const back","const back");
 assert.notEqual(m3,src);
 const mod=await import('data:text/javascript;base64,'+Buffer.from(m3.replace(/from '\.\//g,"from '"+new URL('../',import.meta.url).href)).toString('base64'));
 const d=driver(),ns='mut3',fs=[1,2].map(n=>fixture(n));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);const before=await d.get(goodKey(ns));let n=0;
  await assert.rejects(mod.rollbackGood({...d,put:async(k,v)=>{if(++n===1){await d.put(k,Buffer.from('xx'));throw Error('R2_UNAVAILABLE');}return d.put(k,v);}},ns,{expectGeneration:fs[1].m.generation}));
  assert.notDeepEqual(await d.get(goodKey(ns)),before);
 }finally{cleanup(fs);}
});
