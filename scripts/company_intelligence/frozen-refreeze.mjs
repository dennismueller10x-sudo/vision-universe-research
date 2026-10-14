/* Explicit, reviewed re-freeze of the immutable 46-stock rollback.
   The legacy 46/45 GOOD advances with every legacy run, the frozen rollback
   (eligible-rollback-top46-v1) never does, and its snapshots expire after seven
   days. `refreeze` re-bases the frozen GOOD on the currently verified, currently
   served legacy GOOD. It writes ONLY inside the rollback namespace: never
   activation.json, gate.json, the universe GOOD or the legacy GOOD. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {prefixFor} from './public-delivery.mjs';
import {goodKey,goodState,downloadGood,prepareCandidate,commitGood,activationKey} from './refresh-storage.mjs';
import {refreshConfig,frozenTickers,frozenInventory,refreshApproved} from './refresh-approval.mjs';
import {universeConfig} from './universe-approval.mjs';
import {approval} from './production-approval.mjs';
import {objectPool} from './bounded-objects.mjs';
/* The frozen rollback may trail the live legacy GOOD by at most this much when
   activation accepts a certified re-freeze; the legacy GOOD moves on between the
   two separate dispatches (and during the long activation audit). */
export const REFREEZE_MAX_LAG_MS=24*3600000;
const sha=b=>createHash('sha256').update(b).digest('hex');
const sorted=a=>[...a].sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hex24=/^[a-f0-9]{24}$/;
export const refreezeArchiveKey=generation=>prefixFor(universeConfig.rollbackNamespace)+`refreeze/${generation}.json`;
const issuerIds=good=>sorted(Object.keys(good.manifest.assets).filter(p=>p!=='index.json'&&!p.includes('/lookup/')).map(p=>p.split('/').at(-1).replace(/\.json$/,'')));
/* Exactly the reviewed legacy cohort: 46 listings, 45 issuers, not the universe. */
export function assertLegacyScope(good,code){
 assert(good?.manifest&&good.manifest.scope!=='PER_ISSUER_ELIGIBILITY',code);
 assert(good.manifest.tickers.length===46&&same(sorted(good.manifest.tickers),sorted(frozenTickers)),code);
 const ids=issuerIds(good);
 assert(ids.length===45&&same(ids,sorted(Object.keys(frozenInventory)))&&Object.keys(good.inventory||{}).length===45,code);
 return good;
}
async function bytesOf(driver,key){const b=await driver.get(key);return b?Buffer.from(b):null;}
const protectedKeys=()=>({activation:activationKey(),gate:prefixFor(approval.namespace)+'gate.json',universeGood:goodKey(universeConfig.consumerNamespace)});
async function snapshot(driver){
 const out={};for(const [name,key] of Object.entries(protectedKeys())){const b=await bytesOf(driver,key);out[name]=b&&sha(b);}return out;
}
function emptyDirectory(path){assert(!existsSync(path)||readdirSync(path).length===0,'REFREEZE_DIRECTORY_NOT_EMPTY');}
/* Fresh-directory proof that every byte of the rollback namespace reproduces the expected GOOD. */
export async function verifyRollbackReadback(driver,{expected,directory}){
 emptyDirectory(directory);
 const r=await downloadGood(driver,{namespace:universeConfig.rollbackNamespace,output:directory});
 assert(r&&r.generation===expected.generation,'REFREEZE_READBACK_GENERATION_MISMATCH');
 assert(same(r.good.manifest.assets,expected.manifest.assets)&&r.files===Object.keys(expected.manifest.assets).length,'REFREEZE_READBACK_HASH_MISMATCH');
 assertLegacyScope(r.good,'REFREEZE_READBACK_SCOPE_MISMATCH');
 return r;
}
/* Byte-exact compare-and-swap of the rollback pointer. previous stays null on
   purpose: a retained previous freeze would make every later restore fail with
   CONSUMER_EXPIRED once its seven-day snapshots expire. Evidence is the archive. */
async function commitRefreeze(driver,{namespace,candidate,oldBytes,next}){
 const key=goodKey(namespace),prior=await bytesOf(driver,key);
 assert(prior&&prior.equals(oldBytes),'CONCURRENT_GOOD_POINTER_ADVANCE');
 assert(refreshApproved(candidate.manifest),'REFRESH_APPROVAL_REQUIRED');
 const prefix=prefixFor(candidate.payloadNamespace);
 await objectPool(Object.entries(candidate.manifest.assets),async([path,meta])=>{
  const b=await driver.get(prefix+`slot-${candidate.manifest.slot||0}/`+(path==='index.json'?path:path.split('/').slice(2).join('/')));
  if(!b||b.length!==meta.bytes||sha(b)!==meta.sha256)throw Error('CANDIDATE_READBACK_FAILED');
 });
 const bytes=Buffer.from(JSON.stringify(next));
 try{
  await driver.put(key,bytes);
  const back=await driver.get(key);if(!back||!Buffer.from(back).equals(bytes))throw Error('GOOD_POINTER_READBACK_FAILED');
 }catch(error){
  await restorePointer(driver,key,oldBytes);throw error;
 }
 return bytes;
}
async function restorePointer(driver,key,oldBytes){
 await driver.put(key,oldBytes);const back=await driver.get(key);
 if(!back||!Buffer.from(back).equals(oldBytes))throw Error('GOOD_POINTER_RECOVERY_FAILED');
}
export async function refreezeRollback(driver,{temporary,fetchDelivery,expectGeneration=null,now=Date.now}){
 const namespace=universeConfig.rollbackNamespace,legacy=refreshConfig.consumerNamespace;
 const before=await snapshot(driver);
 // 1. The universe must not be (partly) live: only the closed ROLLBACK_46 world may be re-based.
 const activation=await bytesOf(driver,activationKey());
 if(activation){const p=JSON.parse(activation);assert(p.schema===1&&p.approvalId===universeConfig.approvalId&&p.state==='ROLLBACK_46','REFREEZE_REFUSED_UNIVERSE_ACTIVE_OR_INVALID_ACTIVATION');}
 // 2. Current verified legacy GOOD: exactly 46 listings / 45 issuers.
 const legacyBytes=await bytesOf(driver,goodKey(legacy));
 const current=assertLegacyScope(await goodState(driver,legacy),'REFREEZE_CURRENT_GOOD_46_REQUIRED');
 if(expectGeneration)assert.equal(current.generation,expectGeneration,'REFREEZE_EXPECTED_GENERATION_MISMATCH');
 // 3. What production serves right now is exactly that GOOD.
 const live=await fetchDelivery();
 assert(live?.status==='PASS'&&live.generation===current.generation&&live.cohortStocks===46&&live.issuers===45,'REFREEZE_LIVE_NOT_CURRENT_GOOD');
 // 4. Existing frozen rollback: the only thing allowed to be replaced, and only by CAS.
 const oldBytes=await bytesOf(driver,goodKey(namespace));
 const old=await goodState(driver,namespace);
 assert(old,'REFREEZE_NO_EXISTING_FREEZE');
 assertLegacyScope(old,'REFREEZE_EXISTING_FREEZE_SCOPE_INVALID');
 if(old.generation===current.generation){
  await verifyRollbackReadback(driver,{expected:current,directory:join(temporary,'refreeze-readback')});
  return {status:'ALREADY_CURRENT',generation:current.generation,previousGeneration:null,stockCount:46,issuerCount:45,privateStateModified:false,activationModified:false,gateModified:false,universeGoodModified:false};
 }
 assert(Date.parse(current.manifest.generatedAt)>Date.parse(old.manifest.generatedAt),'REFREEZE_NOT_NEWER_THAN_EXISTING_FREEZE');
 // 5. Hash-verified copy of the current GOOD from an empty directory.
 const source=join(temporary,'refreeze-source');emptyDirectory(source);
 const downloaded=await downloadGood(driver,{namespace:legacy,output:source});
 assert(downloaded&&downloaded.generation===current.generation&&same(downloaded.good.manifest,current.manifest),'REFREEZE_SOURCE_READBACK_FAILED');
 // The downloader copies public assets only; the authenticated certificate is reattached privately.
 writeFileSync(join(source,'manifest.json'),JSON.stringify(current.manifest)+'\n');
 // 6. Keep the old freeze as immutable evidence (pointer bytes + hash) before it is replaced.
 const archiveKey=refreezeArchiveKey(old.generation);
 const archive=Buffer.from(JSON.stringify({schema:1,kind:'ROLLBACK_FREEZE_ARCHIVE',generation:old.generation,payloadNamespace:old.payloadNamespace,pointerSha256:sha(oldBytes),pointer:oldBytes.toString('utf8'),supersededBy:current.generation}));
 const existingArchive=await bytesOf(driver,archiveKey);
 assert(!existingArchive||existingArchive.equals(archive),'REFREEZE_ARCHIVE_COLLISION');
 if(!existingArchive){await driver.put(archiveKey,archive);const back=await bytesOf(driver,archiveKey);assert(back&&back.equals(archive),'REFREEZE_ARCHIVE_READBACK_FAILED');}
 // 7. Candidate goes into the inactive slot; the current frozen slot is never touched.
 const candidate=await prepareCandidate(driver,{namespace,directory:source,good:old});
 assert.equal(candidate.manifest.generation,current.generation);
 // The legacy GOOD must not have moved while we copied, or live != GOOD again.
 const legacyAgain=await bytesOf(driver,goodKey(legacy));
 assert(legacyBytes&&legacyAgain&&legacyAgain.equals(legacyBytes),'REFREEZE_CURRENT_CHANGED');
 const lineage=[...(old.refreeze?.lineage||[]),old.generation];
 const marker={schema:1,sourceNamespace:legacy,sourceGeneration:current.generation,previousGeneration:old.generation,previousPointerSha256:sha(oldBytes),archiveKey,lineage,certifiedAt:new Date(now()).toISOString()};
 const next={schema:1,state:'GOOD',generation:candidate.manifest.generation,payloadNamespace:candidate.payloadNamespace,manifest:candidate.manifest,health:current.health,inventory:current.inventory,previous:null,refreeze:marker};
 const newBytes=await commitRefreeze(driver,{namespace,candidate,oldBytes,next});
 // 8. Fresh-directory hash readback of the new freeze plus an untouched-state proof; otherwise undo.
 try{
  await verifyRollbackReadback(driver,{expected:current,directory:join(temporary,'refreeze-readback')});
  assert.deepEqual(await snapshot(driver),before,'REFREEZE_PROTECTED_STATE_CHANGED');
 }catch(error){
  const now_=await bytesOf(driver,goodKey(namespace));
  if(now_&&now_.equals(newBytes))await restorePointer(driver,goodKey(namespace),oldBytes);
  throw error;
 }
 return {status:'REFROZEN',generation:current.generation,previousGeneration:old.generation,archiveKey,stockCount:46,issuerCount:45,privateStateModified:false,activationModified:false,gateModified:false,universeGoodModified:false};
}
/* Activation's freeze rule. Strict equality stays the default. A re-freeze made by
   `refreeze` (marker + archive anchored to the superseded pointer) is accepted
   instead of equality only for the identical 46/45 scope and at most
   REFREEZE_MAX_LAG_MS behind the live legacy GOOD. */
export async function assertRollbackFreeze(driver,{frozen,known}){
 const reject=()=>Error('ROLLBACK_FREEZE_ALREADY_EXISTS_WITH_DIFFERENT_GENERATION');
 if(frozen.generation===known.generation)return {mode:'EXACT',lagMs:0};
 const r=frozen.refreeze;
 if(!(r?.schema===1&&r.sourceGeneration===frozen.generation&&hex24.test(r.previousGeneration||'')&&Array.isArray(r.lineage)&&r.lineage.at(-1)===r.previousGeneration&&r.archiveKey===refreezeArchiveKey(r.previousGeneration)&&/^[a-f0-9]{64}$/.test(r.previousPointerSha256||'')))throw reject();
 assertLegacyScope(frozen,'ROLLBACK_FREEZE_SCOPE_INVALID');assertLegacyScope(known,'LATEST_GOOD_46_REQUIRED');
 const lagMs=Date.parse(known.manifest.generatedAt)-Date.parse(frozen.manifest.generatedAt);
 assert(lagMs>=0&&lagMs<=REFREEZE_MAX_LAG_MS,'ROLLBACK_FREEZE_TOO_OLD_FOR_LIVE_GOOD');
 const raw=await bytesOf(driver,r.archiveKey),archive=raw&&JSON.parse(raw);
 assert(archive?.kind==='ROLLBACK_FREEZE_ARCHIVE'&&archive.generation===r.previousGeneration&&archive.supersededBy===frozen.generation&&sha(Buffer.from(archive.pointer))===r.previousPointerSha256,'ROLLBACK_FREEZE_ARCHIVE_INVALID');
 return {mode:'REFREEZE',lagMs};
}
/* The freeze step of `activate`, extracted so it can be tested without R2. */
export async function ensureRollbackFreeze(driver,{known,directory,temporary}){
 const namespace=universeConfig.rollbackNamespace,existing=await goodState(driver,namespace);
 let mode='EXACT';
 if(existing)({mode}=await assertRollbackFreeze(driver,{frozen:existing,known}));
 else{
  const frozen=await prepareCandidate(driver,{namespace,directory,good:null});
  await commitGood(driver,{namespace,payloadNamespace:frozen.payloadNamespace,manifest:frozen.manifest,health:known.health,inventory:known.inventory,expectedGood:null});
 }
 // Empty fresh directory proves all rollback bytes independent of the live slot.
 const rollback=await downloadGood(driver,{namespace,output:join(temporary,'fresh-rollback')});
 assert.equal(rollback.generation,existing?existing.generation:known.generation);
 return {rollback,mode};
}
