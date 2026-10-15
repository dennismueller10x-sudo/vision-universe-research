import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRecoveryBaseline,finishProfileRecovery} from '../profile-release-recovery.mjs';
import {universeConfig} from '../universe-approval.mjs';
import {approval} from '../production-approval.mjs';
import {activationKey,goodKey} from '../refresh-storage.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {createHash} from 'node:crypto';
import {frozenTickers,frozenInventory} from '../refresh-approval.mjs';
const env={GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'dennismueller10x-sudo/vision-universe-research'};
function baseline(){
 const generation='a'.repeat(24),eligibility={},assets={'index.json':{bytes:2,sha256:'b'.repeat(64)}},tickers=[];
 for(let i=0;i<46;i++){
  const cid='iss_cik_'+String(i+1).padStart(10,'0'),ticker='T'+i;tickers.push(ticker);
  eligibility[cid]={status:'ELIGIBLE_PARTIAL',tickers:[ticker],modules:{profile:true,aktuelles:false,financials:false,whatChanged:false,nextEvent:false,calls:false,documents:false}};
  assets[`snapshots/${generation}/${cid}.json`]={bytes:2,sha256:'b'.repeat(64)};
 }
 return {activation:{schema:1,state:'ROLLBACK_46',approvalId:universeConfig.approvalId},
  gate:{schema:1,state:'DISABLED',generation:approval.consumerGeneration,approvalId:approval.approvalId},
  receipt:{status:'R2_CANDIDATE_ACCEPTED',rollback:{freshReadback:true,generation:'c'.repeat(24)}},
  frozen:{generation:'c'.repeat(24),manifest:{tickers:Array(46)},inventory:Object.fromEntries(Array.from({length:45},(_,i)=>['F'+i,{}]))},
  full:{manifest:{schema:1,generation,generatedAt:'2026-10-12T10:00:00Z',scope:'PER_ISSUER_ELIGIBILITY',eligibilityVersion:universeConfig.eligibilityVersion,sourceUsagePolicy:universeConfig.sourceUsagePolicy,tickers,eligibility,assets,
   productionApproval:universeConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',structural:'PASS',privateCompanies:5122,checkpointSha256:'d'.repeat(64)}}}};
}
test('explicit recovery requires prior approved full scope and a proven immutable rollback while public gate is closed',()=>{
 assert.doesNotThrow(()=>assertRecoveryBaseline(baseline(),env));
 for(const alter of [v=>v.gate.state='AVAILABLE',v=>v.activation.state='AVAILABLE',v=>v.receipt.status='UNREVIEWED',v=>v.receipt.rollback.freshReadback=false,v=>v.frozen.inventory={},v=>v.full.manifest.sourceUsagePolicy='PUBLISHER_BODIES',v=>v.full.manifest.refreshValidation.privateCompanies=45]){
  const v=baseline();alter(v);assert.throws(()=>assertRecoveryBaseline(v,env));
 }
 assert.throws(()=>assertRecoveryBaseline(baseline(),{...env,GITHUB_REF:'refs/heads/preview'}),/RECOVERY_MAIN_ONLY/);
});
test('an unsuccessful or merely isolated candidate never opens either recovery gate',async()=>{
 let writes=0;const driver={put:async()=>writes++};
 for(const report of [{status:'PIPELINE_FAILURE'},{status:'SUCCESS',verification:true,freshRestoreVerified:true,candidateQA:{status:'PASS'},contentAcceptance:{status:'PASS'}},{status:'SUCCESS',verification:false,freshRestoreVerified:false}]){
  await assert.rejects(finishProfileRecovery(driver,{},report),/RECOVERY_FRESH_ACCEPTANCE_REQUIRED/);
 }
 assert.equal(writes,0);
});
test('fresh success cannot recover a different or missing GOOD generation',async()=>{
 let writes=0;const driver={get:async()=>null,put:async()=>writes++};
 await assert.rejects(finishProfileRecovery(driver,{}, {status:'SUCCESS',verification:false,freshRestoreVerified:true,candidateQA:{status:'PASS'},contentAcceptance:{status:'PASS'}}),/RECOVERY_GOOD_MISMATCH/);
 assert.equal(writes,0);
});
test('activation integrity failure closes the public gate and restores the prior scope without deleting GOOD',async()=>{
 const v=baseline(),gateKey=prefixFor(approval.namespace)+'gate.json';
 const activationBytes=Buffer.from(JSON.stringify(v.activation)),gateBytes=Buffer.from(JSON.stringify(v.gate));
 const good={schema:1,state:'GOOD',generation:v.full.manifest.generation,payloadNamespace:universeConfig.consumerNamespace+'-a',manifest:v.full.manifest};
 const objects=new Map([[activationKey(),activationBytes],[gateKey,gateBytes],[goodKey(universeConfig.consumerNamespace),Buffer.from(JSON.stringify(good))]]);
 let corruptOnce=true;
 const driver={get:async key=>{
  const bytes=objects.get(key);
  if(key===activationKey()&&JSON.parse(bytes).state==='AVAILABLE'&&corruptOnce){corruptOnce=false;return Buffer.from('{}');}
  return bytes||null;
 },put:async(key,bytes)=>objects.set(key,Buffer.from(bytes))};
 const report={status:'SUCCESS',verification:false,freshRestoreVerified:true,candidateQA:{status:'PASS'},contentAcceptance:{status:'PASS'},consumerGeneration:good.generation,privatePreservation:{sha256:'d'.repeat(64)},runId:'test-recovery'};
 await assert.rejects(finishProfileRecovery(driver,{activationBytes,gateBytes,gateKey},report),/RECOVERY_ACTIVATION_READBACK_FAILED/);
 assert(objects.get(activationKey()).equals(activationBytes));
 assert.equal(JSON.parse(objects.get(gateKey)).state,'DISABLED');
 assert.equal(JSON.parse(objects.get(goodKey(universeConfig.consumerNamespace))).generation,good.generation);
});

/* Real state 2026-10-14: gate open (AVAILABLE), activation ROLLBACK_46, legacy GOOD advanced past the freeze. */
const legacy46=()=>({manifest:{tickers:[...frozenTickers],assets:{'index.json':{},...Object.fromEntries(Object.keys(frozenInventory).map(c=>[`snapshots/${'a'.repeat(24)}/${c}.json`,{}]))}},inventory:{...frozenInventory}});
function openBaseline(){const v=baseline();v.gate.state='AVAILABLE';v.legacy=legacy46();return v;}
test('open-gate baseline (real state) needs a verified legacy 46 and still rejects every other deviation',()=>{
 assert.doesNotThrow(()=>assertRecoveryBaseline(openBaseline(),env));
 for(const alter of [v=>delete v.legacy,v=>v.legacy.manifest.tickers.pop(),v=>delete v.legacy.inventory[Object.keys(v.legacy.inventory)[0]],v=>v.activation.state='AVAILABLE',v=>v.gate.state='STAGED',v=>v.gate.approvalId='other',v=>v.receipt.rollback.freshReadback=false]){
  const v=openBaseline();alter(v);assert.throws(()=>assertRecoveryBaseline(v,env));
 }
 const closedWithoutLegacy=baseline();assert.doesNotThrow(()=>assertRecoveryBaseline(closedWithoutLegacy,env));
});
test('a certified re-freeze descends from the rollback the acceptance receipt proved; an unrelated generation does not',()=>{
 const v=openBaseline(),proven=v.receipt.rollback.generation,fresh='9'.repeat(24);
 v.frozen.generation=fresh;
 assert.throws(()=>assertRecoveryBaseline(v,env),/IMMUTABLE_ROLLBACK_REQUIRED/);
 v.frozen.refreeze={schema:1,sourceGeneration:fresh,previousGeneration:proven,lineage:[proven]};
 assert.doesNotThrow(()=>assertRecoveryBaseline(v,env));
 // after two re-freezes the proven generation is no longer the last lineage entry
 v.frozen.refreeze.previousGeneration='5'.repeat(24);v.frozen.refreeze.lineage=[proven,'5'.repeat(24)];assert.doesNotThrow(()=>assertRecoveryBaseline(v,env));
 v.frozen.refreeze.lineage=['4'.repeat(24),'5'.repeat(24)];assert.throws(()=>assertRecoveryBaseline(v,env),/IMMUTABLE_ROLLBACK_REQUIRED/);
 v.frozen.refreeze.previousGeneration=proven;
 v.frozen.refreeze.lineage=['d'.repeat(24)];assert.throws(()=>assertRecoveryBaseline(v,env),/IMMUTABLE_ROLLBACK_REQUIRED/);
 v.frozen.refreeze.lineage=[proven];v.frozen.refreeze.sourceGeneration='8'.repeat(24);assert.throws(()=>assertRecoveryBaseline(v,env),/IMMUTABLE_ROLLBACK_REQUIRED/);
});
function openWorld({corruptAsset=false}={}){
 const v=baseline(),generation=v.full.manifest.generation,objects=new Map(),ns=universeConfig.consumerNamespace+'-a',prefix=prefixFor(ns);
 const assets={},put=(path,bytes)=>{assets[path]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};objects.set(prefix+'slot-0/'+(path==='index.json'?path:path.split('/').slice(2).join('/')),corruptAsset&&path==='index.json'?Buffer.from('xx'):bytes);};
 put('index.json',Buffer.from('{}'));for(const cid of Object.keys(v.full.manifest.eligibility))put(`snapshots/${generation}/${cid}.json`,Buffer.from('{}'));
 const manifest={...v.full.manifest,generatedAt:new Date().toISOString(),assets};
 const good={schema:1,state:'GOOD',generation,payloadNamespace:ns,manifest};
 const gateKey=prefixFor(approval.namespace)+'gate.json',activationBytes=Buffer.from(JSON.stringify(v.activation)),gateBytes=Buffer.from(JSON.stringify({...v.gate,state:'AVAILABLE'}));
 objects.set(activationKey(),activationBytes);objects.set(gateKey,gateBytes);objects.set(goodKey(universeConfig.consumerNamespace),Buffer.from(JSON.stringify(good)));
 const writes=[],driver={get:async k=>objects.get(k)||null,put:async(k,b)=>{writes.push(k);objects.set(k,Buffer.from(b));}};
 const report={status:'SUCCESS',verification:false,freshRestoreVerified:true,candidateQA:{status:'PASS'},contentAcceptance:{status:'PASS'},consumerGeneration:generation,privatePreservation:{sha256:'d'.repeat(64)},runId:'t'};
 return {driver,objects,writes,report,context:{activationBytes,gateBytes,gateKey},gateKey,activationBytes,gateBytes};
}
test('open gate: the full scope goes live only after full-asset readback; the open gate is never rewritten',async()=>{
 const w=openWorld();
 const r=await finishProfileRecovery(w.driver,w.context,w.report);
 assert.equal(r.status,'RECOVERED_EXISTING_FULL_SCOPE');
 assert.equal(JSON.parse(w.objects.get(activationKey())).state,'AVAILABLE');
 assert(w.objects.get(w.gateKey).equals(w.gateBytes));assert(!w.writes.includes(w.gateKey));
});
test('open gate: an unreadable full asset blocks activation before any write',async()=>{
 const w=openWorld({corruptAsset:true});
 await assert.rejects(finishProfileRecovery(w.driver,w.context,w.report),/CONSUMER_INTEGRITY_FAILED/);
 assert.equal(w.writes.length,0);assert(w.objects.get(activationKey()).equals(w.activationBytes));assert(w.objects.get(w.gateKey).equals(w.gateBytes));
});
test('open gate: a failing activation write restores activation and leaves the open gate untouched (never DISABLED)',async()=>{
 const w=openWorld();let corrupt=true;const get=w.driver.get;
 w.driver.get=async k=>{const b=await get(k);if(k===activationKey()&&corrupt&&JSON.parse(b).state==='AVAILABLE'){corrupt=false;return Buffer.from('{}');}return b;};
 await assert.rejects(finishProfileRecovery(w.driver,w.context,w.report),/RECOVERY_ACTIVATION_READBACK_FAILED/);
 assert(w.objects.get(activationKey()).equals(w.activationBytes));assert.equal(JSON.parse(w.objects.get(w.gateKey)).state,'AVAILABLE');
 assert(!w.writes.includes(w.gateKey),'gate never written, also on failure');
});
test('open gate: a gate closed in parallel is not reopened by the failure path',async()=>{
 const w=openWorld();const closed=Buffer.from(JSON.stringify({...JSON.parse(w.gateBytes),state:'DISABLED'}));let corrupt=true;const get=w.driver.get;
 w.driver.get=async k=>{const b=await get(k);if(k===activationKey()&&corrupt&&JSON.parse(b).state==='AVAILABLE'){corrupt=false;w.objects.set(w.gateKey,closed);return Buffer.from('{}');}return b;};
 await assert.rejects(finishProfileRecovery(w.driver,w.context,w.report));
 assert(w.objects.get(w.gateKey).equals(closed));assert(!w.writes.includes(w.gateKey));assert(w.objects.get(activationKey()).equals(w.activationBytes));
});
