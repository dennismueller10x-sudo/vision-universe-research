import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {consumerCacheDriver,saveConsumerCache} from '../consumer-release-cache.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {universeConfig} from '../universe-approval.mjs';
import {stageProduction} from '../production-release.mjs';
import {approval} from '../production-approval.mjs';
import {activationKey,goodKey} from '../refresh-storage.mjs';
function fixture(){
 const parent=mkdtempSync(join(tmpdir(),'ci-cache-proof-')),root=join(parent,'ci-public-cache'),output=join(parent,'verified');mkdirSync(root);mkdirSync(output);
 const generation='a'.repeat(24),cid='iss_cik_0001652044',path=`snapshots/${generation}/${cid}.json`,bytes=Buffer.from('{"public":true}');
 const meta={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const manifest={schema:1,scope:'PER_ISSUER_ELIGIBILITY',generation,generatedAt:'2026-10-10T05:54:50Z',slot:0,
  eligibilityVersion:universeConfig.eligibilityVersion,sourceUsagePolicy:universeConfig.sourceUsagePolicy,tickers:['GOOG'],
  eligibility:{[cid]:{status:'ELIGIBLE_PARTIAL',tickers:['GOOG'],modules:{profile:true,aktuelles:false,financials:false,whatChanged:false,nextEvent:false,calls:false,documents:false}}},
  assets:{'index.json':meta,[path]:meta}};
 const good={manifest,generation,payloadNamespace:'verify-consumer-a',previous:null},key=prefixFor(good.payloadNamespace)+'slot-0/'+cid+'.json';
 const put=(base,name,value)=>{mkdirSync(join(base,name,'..'),{recursive:true});writeFileSync(join(base,name),value);};
 return {parent,root,output,path,bytes,good,key,put};
}
test('a cache hit preserves authoritative pointer reads and reduces only public asset reads',async()=>{
 const f=fixture();try{
  f.put(f.root,f.path,f.bytes);let calls=0;
  const cache=consumerCacheDriver({get:async()=>{calls++;return f.bytes;}},f.good,f.root);
  assert((await cache.driver.get(f.key)).equals(f.bytes));assert.equal(calls,0);
  await cache.driver.get('authoritative-good-pointer');assert.equal(calls,1);
  assert.equal(cache.stats.cachedAssets,1);
 }finally{rmSync(f.parent,{recursive:true,force:true});}
});
test('swapped bytes, missing generation and external symlinks always fall back to R2',async()=>{
 const f=fixture();try{
  f.put(f.root,f.path,Buffer.from('{"wrongIssuer":true}'));let calls=0;
  const cache=consumerCacheDriver({get:async()=>{calls++;return f.bytes;}},f.good,f.root);
  assert((await cache.driver.get(f.key)).equals(f.bytes));assert.equal(calls,1);
  rmSync(join(f.root,f.path));writeFileSync(join(f.parent,'external'),f.bytes);symlinkSync(join(f.parent,'external'),join(f.root,f.path));
  await cache.driver.get(f.key);assert.equal(calls,2);
  await cache.driver.get(f.key.replace('slot-0','slot-1'));assert.equal(calls,3);
 }finally{rmSync(f.parent,{recursive:true,force:true});}
});
test('cache contains only hash-listed public assets, never a manifest or private extra',async()=>{
 const f=fixture();try{
  f.put(f.output,f.path,f.bytes);f.put(f.output,'index.json',f.bytes);
  writeFileSync(join(f.output,'manifest.json'),'PRIVATE_VALIDATION_CERTIFICATE');writeFileSync(join(f.output,'ledger.sqlite'),'PRIVATE');
  writeFileSync(join(f.root,'private-old-file'),'PRIVATE');
  await saveConsumerCache(f.output,f.good,f.root);
  assert(existsSync(join(f.root,f.path)));assert(!existsSync(join(f.root,'manifest.json')));assert(!existsSync(join(f.root,'ledger.sqlite')));assert(!existsSync(join(f.root,'private-old-file')));
  f.put(f.output,f.path,Buffer.from('tampered'));await assert.rejects(saveConsumerCache(f.output,f.good,f.root),/CACHE_SOURCE_INTEGRITY_FAILED/);
  assert(existsSync(join(f.root,f.path)));
 }finally{rmSync(f.parent,{recursive:true,force:true});}
});
test('unsafe cache roots are rejected without deleting anything',()=>{
 const f=fixture();try{assert.throws(()=>consumerCacheDriver({get:async()=>null},f.good,f.parent),/INVALID_CONSUMER_CACHE_DIRECTORY/);assert(existsSync(f.parent));}finally{rmSync(f.parent,{recursive:true,force:true});}
});
test('an active full-universe scope cannot silently fall back to the smaller bootstrap',async()=>{
 const f=fixture(),reads=[];
 const driver={get:async key=>{
  reads.push(key);
  if(key===prefixFor(approval.namespace)+'gate.json')return Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId}));
  if(key===activationKey())return Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId}));
  if(key===goodKey(universeConfig.consumerNamespace))return null;
  throw Error('UNEXPECTED_BOOTSTRAP_READ');
 }};
 try{
  await assert.rejects(stageProduction(driver,f.output),/VERIFIED_FULL_UNIVERSE_GOOD_REQUIRED/);
  assert(!reads.includes(prefixFor(approval.namespace)+'manifest.json'));
 }finally{rmSync(f.parent,{recursive:true,force:true});}
});
