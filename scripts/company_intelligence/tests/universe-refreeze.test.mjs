import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {refreshConfig,frozenInventory,frozenTickers} from '../refresh-approval.mjs';
import {prepareCandidate,commitGood,goodState,goodKey,activationKey,downloadGood} from '../refresh-storage.mjs';
import {universeConfig} from '../universe-approval.mjs';
import {approval} from '../production-approval.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {refreezeRollback,assertRollbackFreeze,ensureRollbackFreeze,assertLegacyScope,refreezeArchiveKey,REFREEZE_MAX_LAG_MS} from '../frozen-refreeze.mjs';
// In-memory R2 driver (same contract as the other CI tests: get -> Buffer|null, put).
function driver(){const objects=new Map(),puts=[];return {objects,puts,get:async k=>objects.get(k)||null,put:async(k,v)=>{puts.push(k);objects.set(k,Buffer.from(v));}};}
const LEGACY=refreshConfig.consumerNamespace,ROLLBACK=universeConfig.rollbackNamespace,H=3600000;
const PAYLOAD_R=prefixFor(ROLLBACK).slice(0,-1)+'-',PAYLOAD_L=prefixFor(LEGACY).slice(0,-1)+'-';
const gateKey=prefixFor(approval.namespace)+'gate.json';
function fixture(n,generatedAt){
 const root=mkdtempSync(join(tmpdir(),'refreeze-')),generation=n.toString(16).padStart(24,'0'),schema='vu-company-intelligence-1.0.0';
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
/* Reality on 2026-10-14: frozen rollback 4 days old, legacy GOOD advanced, universe not live,
   gate open (AVAILABLE), activation ROLLBACK_46. */
async function world(){
 const now=Date.now(),dirs=[],d=driver();
 const mk=(n,age)=>{const f=fixture(n,new Date(now-age).toISOString());dirs.push(f.root);return f;};
 const frozen=mk(0x71dc,96*H),legacyOld=mk(0x1001,30*H),current=mk(0x6bf1,1*H);
 await advance(d,ROLLBACK,frozen);await advance(d,LEGACY,legacyOld);await advance(d,LEGACY,current);
 d.objects.set(activationKey(),Buffer.from(JSON.stringify({schema:1,state:'ROLLBACK_46',approvalId:universeConfig.approvalId,generation:'f'.repeat(24)})));
 d.objects.set(gateKey,Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
 d.objects.set(goodKey(universeConfig.consumerNamespace),Buffer.from(JSON.stringify({schema:1,state:'GOOD',generation:'e'.repeat(24)})));
 const temporary=mkdtempSync(join(tmpdir(),'refreeze-tmp-'));dirs.push(temporary);
 const delivery=async()=>({status:'PASS',generation:current.m.generation,cohortStocks:46,issuers:45});
 d.puts.length=0;
 return {d,frozen,legacyOld,current,temporary,delivery,mk,done:()=>dirs.forEach(x=>rmSync(x,{recursive:true,force:true}))};
}
const guarded=d=>['activation','gate','universe'].map((_,i)=>[activationKey(),gateKey,goodKey(universeConfig.consumerNamespace)][i]).map(k=>d.objects.get(k).toString('hex'));
const run=(w,extra={})=>refreezeRollback(w.d,{temporary:w.temporary,fetchDelivery:w.delivery,...extra});

test('baseline: activate against the real state fails with the documented code; no repair path existed',async()=>{
 const w=await world();try{
  const known=await goodState(w.d,LEGACY);
  await assert.rejects(ensureRollbackFreeze(w.d,{known,directory:w.current.root,temporary:w.temporary}),/ROLLBACK_FREEZE_ALREADY_EXISTS_WITH_DIFFERENT_GENERATION/);
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('refreeze re-bases the frozen GOOD on the served legacy GOOD, archives the old freeze, writes only the rollback namespace',async()=>{
 const w=await world();try{
  const before=guarded(w.d),legacyBefore=w.d.objects.get(goodKey(LEGACY)),oldBytes=w.d.objects.get(goodKey(ROLLBACK));
  const oldGeneration=(await goodState(w.d,ROLLBACK)).generation;
  const r=await run(w);
  assert.equal(r.status,'REFROZEN');assert.equal(r.generation,w.current.m.generation);assert.equal(r.previousGeneration,oldGeneration);
  assert.equal(r.privateStateModified,false);assert.equal(r.activationModified,false);assert.equal(r.gateModified,false);assert.equal(r.universeGoodModified,false);
  const frozen=await goodState(w.d,ROLLBACK);
  assert.equal(frozen.generation,w.current.m.generation);assert.equal(frozen.previous,null);
  assert.equal(frozen.refreeze.previousGeneration,oldGeneration);assert.equal(frozen.refreeze.previousPointerSha256,createHash('sha256').update(oldBytes).digest('hex'));
  const archive=JSON.parse(w.d.objects.get(refreezeArchiveKey(oldGeneration)));
  assert.equal(archive.pointer,oldBytes.toString('utf8'));assert.equal(archive.supersededBy,w.current.m.generation);
  assert.deepEqual(guarded(w.d),before);assert(w.d.objects.get(goodKey(LEGACY)).equals(legacyBefore));
  const prefix=prefixFor(ROLLBACK).slice(0,-1);
  assert(w.d.puts.length>0&&w.d.puts.every(k=>k.startsWith(prefix)),'every write is inside the rollback namespace: '+w.d.puts.filter(k=>!k.startsWith(prefix)));
  const out=join(w.temporary,'independent');const dl=await downloadGood(w.d,{namespace:ROLLBACK,output:out});
  assert.equal(dl.generation,w.current.m.generation);assert.equal(JSON.parse(readFileSync(join(out,'index.json'))).generation,w.current.m.generation);
 }finally{w.done();}
});

test('after a refreeze activation passes the freeze check (exact and with legacy drift); expired drift and forged markers do not',async()=>{
 const w=await world();try{
  await run(w);
  let known=await goodState(w.d,LEGACY);
  const ok=await ensureRollbackFreeze(w.d,{known,directory:w.current.root,temporary:w.temporary});
  assert.equal(ok.mode,'EXACT');assert.equal(ok.rollback.generation,w.current.m.generation);
  // legacy keeps advancing: 6h later is still within the certified window
  const next=w.mk(0x6bf2,0);await advance(w.d,LEGACY,next);known=await goodState(w.d,LEGACY);
  const drift=await assertRollbackFreeze(w.d,{frozen:await goodState(w.d,ROLLBACK),known});
  assert.equal(drift.mode,'REFREEZE');assert(drift.lagMs>0&&drift.lagMs<=REFREEZE_MAX_LAG_MS);
  const frozen=await goodState(w.d,ROLLBACK);
  // beyond the window
  const late={...known,manifest:{...known.manifest,generatedAt:new Date(Date.parse(frozen.manifest.generatedAt)+REFREEZE_MAX_LAG_MS+1000).toISOString()}};
  await assert.rejects(assertRollbackFreeze(w.d,{frozen,known:late}),/ROLLBACK_FREEZE_TOO_OLD_FOR_LIVE_GOOD/);
  // a marker without its archive, or a marker on a freeze that was not certified, is not a re-freeze
  const archiveKey=refreezeArchiveKey(frozen.refreeze.previousGeneration),archive=w.d.objects.get(archiveKey);
  w.d.objects.delete(archiveKey);await assert.rejects(assertRollbackFreeze(w.d,{frozen,known}),/ROLLBACK_FREEZE_ARCHIVE_INVALID/);
  w.d.objects.set(archiveKey,Buffer.from(JSON.stringify({...JSON.parse(archive),pointer:'{}'})));await assert.rejects(assertRollbackFreeze(w.d,{frozen,known}),/ROLLBACK_FREEZE_ARCHIVE_INVALID/);
  w.d.objects.set(archiveKey,archive);
  const { refreeze,...plain }=frozen;await assert.rejects(assertRollbackFreeze(w.d,{frozen:plain,known}),/ROLLBACK_FREEZE_ALREADY_EXISTS_WITH_DIFFERENT_GENERATION/);
  await assert.rejects(assertRollbackFreeze(w.d,{frozen:{...frozen,refreeze:{...refreeze,archiveKey:'v1/elsewhere.json'}},known}),/ROLLBACK_FREEZE_ALREADY_EXISTS_WITH_DIFFERENT_GENERATION/);
 }finally{w.done();}
});

test('a second refreeze chains the lineage back to the originally proven rollback',async()=>{
 const w=await world();try{
  const first=(await goodState(w.d,ROLLBACK)).generation;await run(w);
  const next=w.mk(0x6bf3,0);await advance(w.d,LEGACY,next);
  const second=await refreezeRollback(w.d,{temporary:mkdtempSync(join(tmpdir(),'refreeze-tmp2-')),fetchDelivery:async()=>({status:'PASS',generation:next.m.generation,cohortStocks:46,issuers:45})});
  assert.equal(second.status,'REFROZEN');
  const f=await goodState(w.d,ROLLBACK);assert.equal(f.refreeze.lineage[0],first);assert.equal(f.refreeze.lineage.length,2);assert.equal(f.refreeze.lineage.at(-1),f.refreeze.previousGeneration);
 }finally{w.done();}
});

test('refreeze is rejected without any write when the legacy GOOD is not exactly 46 listings / 45 issuers',async()=>{
 const w=await world();try{
  const good=JSON.parse(w.d.objects.get(goodKey(LEGACY)));
  for(const alter of [g=>{g.manifest.tickers=g.manifest.tickers.slice(1);},g=>{g.manifest.tickers=[...g.manifest.tickers,'ZZZZ'];},g=>{g.inventory=Object.fromEntries(Object.entries(g.inventory).slice(1));}]){
   const copy=JSON.parse(JSON.stringify(good));alter(copy);w.d.objects.set(goodKey(LEGACY),Buffer.from(JSON.stringify(copy)));
   await assert.rejects(run(w),/INVALID_REFRESH_GOOD_POINTER|REFREEZE_CURRENT_GOOD_46_REQUIRED/);
  }
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});
test('scope guard counts tickers, issuers and inventory independently of the pointer validator',()=>{
 const base={manifest:{tickers:[...frozenTickers],assets:{'index.json':{},...Object.fromEntries(Object.keys(frozenInventory).map(c=>[`snapshots/${'a'.repeat(24)}/${c}.json`,{}]))}},inventory:{...frozenInventory}};
 assert.doesNotThrow(()=>assertLegacyScope(base,'X'));
 for(const [name,alter] of [
  ['45 tickers',g=>{g.manifest.tickers=g.manifest.tickers.slice(1);}],
  ['47 tickers',g=>{g.manifest.tickers=[...g.manifest.tickers,'ZZZZ'];}],
  ['44 issuers',g=>{delete g.manifest.assets[Object.keys(g.manifest.assets).at(-1)];}],
  ['46 issuers',g=>{g.manifest.assets[`snapshots/${'a'.repeat(24)}/iss_cik_0000000001.json`]={};}],
  ['44 inventory',g=>{g.inventory=Object.fromEntries(Object.entries(g.inventory).slice(1));}],
  ['universe scope',g=>{g.manifest.scope='PER_ISSUER_ELIGIBILITY';}]]){
  const g=JSON.parse(JSON.stringify(base));alter(g);assert.throws(()=>assertLegacyScope(g,'SCOPE_X'),/SCOPE_X/,name);
 }
});

test('refreeze requires live delivery to serve exactly the current GOOD',async()=>{
 const w=await world();try{
  for(const live of [{status:'PASS',generation:'0'.repeat(24),cohortStocks:46,issuers:45},{status:'PASS',generation:w.current.m.generation,cohortStocks:45,issuers:45},{status:'FAIL',generation:w.current.m.generation,cohortStocks:46,issuers:45},null]){
   await assert.rejects(run(w,{fetchDelivery:async()=>live}),/REFREEZE_LIVE_NOT_CURRENT_GOOD/);
  }
  await assert.rejects(run(w,{expectGeneration:'1'.repeat(24)}),/REFREEZE_EXPECTED_GENERATION_MISMATCH/);
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('refreeze refuses an active universe, a missing freeze, and a non-empty scratch directory',async()=>{
 const w=await world();try{
  const act=w.d.objects.get(activationKey());
  w.d.objects.set(activationKey(),Buffer.from(JSON.stringify({...JSON.parse(act),state:'AVAILABLE'})));
  await assert.rejects(run(w),/REFREEZE_REFUSED_UNIVERSE_ACTIVE_OR_INVALID_ACTIVATION/);
  w.d.objects.set(activationKey(),act);
  mkdirSync(join(w.temporary,'refreeze-source'),{recursive:true});writeFileSync(join(w.temporary,'refreeze-source','x'),'x');
  await assert.rejects(run(w),/REFREEZE_DIRECTORY_NOT_EMPTY/);
  rmSync(join(w.temporary,'refreeze-source'),{recursive:true});
  const gone=w.d.objects.get(goodKey(ROLLBACK));w.d.objects.delete(goodKey(ROLLBACK));
  await assert.rejects(run(w),/REFREEZE_NO_EXISTING_FREEZE/);
  w.d.objects.set(goodKey(ROLLBACK),gone);
  assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});

test('CAS: a concurrent change of the frozen pointer is never overwritten',async()=>{
 const w=await world();try{
  const put=w.d.put,intruder=Buffer.from(JSON.stringify({...JSON.parse(w.d.objects.get(goodKey(ROLLBACK))),health:{intruder:true}}));let hit=false;
  w.d.put=async(k,v)=>{await put(k,v);if(!hit&&k.startsWith(PAYLOAD_R)){hit=true;w.d.objects.set(goodKey(ROLLBACK),intruder);}};
  await assert.rejects(run(w),/CONCURRENT_GOOD_POINTER_ADVANCE/);
  assert(hit&&w.d.objects.get(goodKey(ROLLBACK)).equals(intruder));
 }finally{w.done();}
});

test('the legacy GOOD advancing during the copy aborts before the pointer moves',async()=>{
 const w=await world();try{
  const before=w.d.objects.get(goodKey(ROLLBACK)),put=w.d.put;let hit=false;
  w.d.put=async(k,v)=>{await put(k,v);if(!hit&&k.startsWith(PAYLOAD_R)){hit=true;w.d.objects.set(goodKey(LEGACY),Buffer.from(JSON.stringify({...JSON.parse(w.d.objects.get(goodKey(LEGACY))),health:{advanced:1}})));}};
  await assert.rejects(run(w),/REFREEZE_CURRENT_CHANGED/);assert(w.d.objects.get(goodKey(ROLLBACK)).equals(before));
 }finally{w.done();}
});

test('hash deviations: corrupt source, corrupt candidate and corrupt post-commit readback leave the old freeze in place',async()=>{
 // source side
 let w=await world();try{
  const key=[...w.d.objects.keys()].find(k=>k.startsWith(PAYLOAD_L)&&k.endsWith('index.json'));
  const bytes=w.d.objects.get(key);w.d.objects.set(key,Buffer.concat([bytes,Buffer.from(' ')]));
  const before=w.d.objects.get(goodKey(ROLLBACK));
  await assert.rejects(run(w),/CONSUMER_INTEGRITY_FAILED/);assert(w.d.objects.get(goodKey(ROLLBACK)).equals(before));assert.equal(w.d.puts.length,0);
 }finally{w.done();}
 // candidate side: written object read back wrong right before the pointer swap
 w=await world();try{
  const before=w.d.objects.get(goodKey(ROLLBACK)),get=w.d.get;let armed=false;
  const put=w.d.put;w.d.put=async(k,v)=>{await put(k,v);if(k.startsWith(PAYLOAD_R)&&k.endsWith('manifest.json'))armed=true;};
  w.d.get=async k=>{const b=await get(k);return armed&&b&&k.startsWith(PAYLOAD_R)&&k.includes('/slot-')&&k.endsWith('index.json')?Buffer.concat([b,Buffer.from(' ')]):b;};
  await assert.rejects(run(w),/CANDIDATE_READBACK_FAILED|CONSUMER_UPLOAD_FAILED/);
  assert(w.d.objects.get(goodKey(ROLLBACK)).equals(before));
 }finally{w.done();}
 // post-commit: the pointer is committed, then the fresh-directory readback sees different bytes -> pointer restored
 w=await world();try{
  const before=w.d.objects.get(goodKey(ROLLBACK)),get=w.d.get,put=w.d.put;let committed=false;
  w.d.put=async(k,v)=>{await put(k,v);if(k===goodKey(ROLLBACK))committed=true;};
  w.d.get=async k=>{const b=await get(k);return committed&&b&&k.startsWith(PAYLOAD_R)&&k.endsWith('/slot-0/index.json')?Buffer.concat([b,Buffer.from(' ')]):b;};
  await assert.rejects(run(w),/CONSUMER_INTEGRITY_FAILED/);
  assert(w.d.objects.get(goodKey(ROLLBACK)).equals(before),'old freeze restored byte for byte');
 }finally{w.done();}
});

test('pointer write failure restores the old freeze; protected state change after commit also restores it',async()=>{
 let w=await world();try{
  const before=w.d.objects.get(goodKey(ROLLBACK)),put=w.d.put,get=w.d.get;let flip=false;
  w.d.put=async(k,v)=>{await put(k,v);if(k===goodKey(ROLLBACK)&&!Buffer.from(v).equals(before))flip=true;};
  w.d.get=async k=>{if(flip&&k===goodKey(ROLLBACK)){flip=false;return Buffer.from('{}');}return get(k);};
  await assert.rejects(run(w),/GOOD_POINTER_READBACK_FAILED/);assert(w.d.objects.get(goodKey(ROLLBACK)).equals(before));
 }finally{w.done();}
 w=await world();try{
  const before=w.d.objects.get(goodKey(ROLLBACK)),put=w.d.put;
  w.d.put=async(k,v)=>{await put(k,v);if(k===goodKey(ROLLBACK)&&!Buffer.from(v).equals(before))w.d.objects.set(gateKey,Buffer.from('{"changed":true}'));};
  await assert.rejects(run(w),/REFREEZE_PROTECTED_STATE_CHANGED/);assert(w.d.objects.get(goodKey(ROLLBACK)).equals(before));
 }finally{w.done();}
});

test('refreeze is idempotent when the freeze already equals the served GOOD',async()=>{
 const w=await world();try{
  await run(w);w.d.puts.length=0;rmSync(join(w.temporary,'refreeze-readback'),{recursive:true,force:true});
  const r=await run(w);assert.equal(r.status,'ALREADY_CURRENT');assert.equal(w.d.puts.length,0);
 }finally{w.done();}
});
