import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {download} from '../download-public.mjs';
import {prefixFor,readAsset} from '../public-delivery.mjs';
import {universeConfig,moduleNames} from '../universe-approval.mjs';
function fixture(count=2){
 const generation='a'.repeat(24),bytes=Buffer.from('{}'),meta={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const m={schema:1,generation,generatedAt:'2026-10-10T05:54:50Z',slot:0,scope:'PER_ISSUER_ELIGIBILITY',
  eligibilityVersion:universeConfig.eligibilityVersion,sourceUsagePolicy:universeConfig.sourceUsagePolicy,tickers:[],eligibility:{},assets:{'index.json':meta}};
 for(let i=1;i<=count;i++){
  const cid='iss_cik_'+String(i).padStart(10,'0'),ticker='T'+i;
  m.tickers.push(ticker);m.eligibility[cid]={status:'ELIGIBLE_PARTIAL',tickers:[ticker],modules:Object.fromEntries(moduleNames.map(k=>[k,k==='profile']))};
  m.assets[`snapshots/${generation}/${cid}.json`]=meta;
 }
 const prefix=prefixFor('batch-test'),out=mkdtempSync(join(tmpdir(),'ci-batch-proof-')),now=Date.parse('2026-10-10T12:00:00Z');let reads=0;
 const driver={get:async key=>{reads++;return key===prefix+'manifest.json'?Buffer.from(JSON.stringify(m)):key===prefix+'previous.json'?null:key.startsWith(prefix+'slot-0/')?bytes:null;}};
 return {m,bytes,prefix,out,now,driver,reads:()=>reads};
}
test('full-sized batch parses its eligibility manifest once, while hash-reading every listed asset',async()=>{
 const f=fixture(5120),json=JSON.stringify(f.m),parse=JSON.parse;let parses=0;
 JSON.parse=function(value,...args){if(value.toString()===json)parses++;return parse.call(this,value,...args);};
 const start=performance.now();
 try{
  const r=await download(f.driver,{namespace:'batch-test',output:f.out,now:f.now});
  assert.equal(r.files,5121);assert.equal(f.reads(),5124);assert.equal(parses,1);
  assert(readFileSync(join(f.out,Object.keys(f.m.assets).at(-1))).equals(f.bytes));
  console.log(JSON.stringify({benchmark:'synthetic-5120-issuer-batch',assets:r.files,milliseconds:Math.round(performance.now()-start),manifestParses:parses,privateObjectsRead:r.privateObjectsRead}));
 }finally{JSON.parse=parse;rmSync(f.out,{recursive:true,force:true});}
});
test('batch and single-asset reads reject the same expired and future manifest timestamps',async()=>{
 for(const stamp of ['2026-09-01T00:00:00Z','2026-10-11T00:00:00Z']){
  const f=fixture();f.m.generatedAt=stamp;
  try{
   writeFileSync(join(f.out,'index.json'),'DISABLED');
   await assert.rejects(download(f.driver,{namespace:'batch-test',output:f.out,now:f.now}),/CONSUMER_EXPIRED/);
   await assert.rejects(readAsset(f.driver,{namespace:'batch-test',asset:'index.json',now:f.now}),/CONSUMER_EXPIRED/);
   assert.equal(readFileSync(join(f.out,'index.json'),'utf8'),'DISABLED');
  }finally{rmSync(f.out,{recursive:true,force:true});}
 }
});
test('batch still rejects tampered full-universe bytes before touching the release',async()=>{
 const f=fixture(),get=f.driver.get;f.driver.get=async key=>key.startsWith(f.prefix+'slot-0/')?Buffer.from('{"wrong":true}'):get(key);
 try{
  writeFileSync(join(f.out,'index.json'),'DISABLED');
  await assert.rejects(download(f.driver,{namespace:'batch-test',output:f.out,now:f.now}),/CONSUMER_INTEGRITY_FAILED/);
  assert.equal(readFileSync(join(f.out,'index.json'),'utf8'),'DISABLED');
 }finally{rmSync(f.out,{recursive:true,force:true});}
});


test('full-sized production gate hash-reads every asset before its sole gate write with bounded I/O',async()=>{
 const {setProductionGate}=await import('../production-release.mjs');
 const {activationKey,goodKey}=await import('../refresh-storage.mjs');
 const {approval}=await import('../production-approval.mjs');
 const f=fixture(5120);f.m.generatedAt=new Date().toISOString();
 Object.assign(f.m,{productionApproval:universeConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',structural:'PASS',privateCompanies:5122,checkpointSha256:'c'.repeat(64)}});
 const ns=universeConfig.consumerNamespace,payload=ns+'-a',prefix=prefixFor(payload),gate=prefixFor(approval.namespace)+'gate.json';
 const good={schema:1,state:'GOOD',generation:f.m.generation,payloadNamespace:payload,manifest:f.m};
 const objects=new Map([[activationKey(),Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',approvalId:universeConfig.approvalId}))],[goodKey(ns),Buffer.from(JSON.stringify(good))]]);
 let active=0,maximum=0,checked=0,writes=0;
 const driver={get:async key=>{
  if(!key.startsWith(prefix+'slot-0/'))return objects.get(key)||null;
  active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));active--;checked++;return f.bytes;
 },put:async(key,bytes)=>{assert.equal(key,gate);assert.equal(checked,5121);writes++;objects.set(key,Buffer.from(bytes));}};
 try{await setProductionGate(driver,'AVAILABLE');assert.equal(writes,1);assert(maximum>1&&maximum<=12);assert.equal(JSON.parse(objects.get(gate)).state,'AVAILABLE');}
 finally{rmSync(f.out,{recursive:true,force:true});}
});
test('a corrupt selected GOOD asset cannot open the production gate',async()=>{
 const {setProductionGate}=await import('../production-release.mjs');
 const {goodKey}=await import('../refresh-storage.mjs');
 const {refreshConfig}=await import('../refresh-approval.mjs');
 const f=fixture();f.m.generatedAt=new Date().toISOString();
 Object.assign(f.m,{productionApproval:universeConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',structural:'PASS',privateCompanies:5122,checkpointSha256:'c'.repeat(64)}});
 const ns=refreshConfig.consumerNamespace,payload=ns+'-a',good={schema:1,state:'GOOD',generation:f.m.generation,payloadNamespace:payload,manifest:f.m};let writes=0;
 const driver={get:async key=>key===goodKey(ns)?Buffer.from(JSON.stringify(good)):key.startsWith(prefixFor(payload)+'slot-0/')?Buffer.from('{"corrupt":true}'):null,put:async()=>writes++};
 try{await assert.rejects(setProductionGate(driver,'AVAILABLE'),/CONSUMER_INTEGRITY_FAILED/);assert.equal(writes,0);}
 finally{rmSync(f.out,{recursive:true,force:true});}
});

test('a GOOD pointer change during hash readback cannot open the production gate',async()=>{
 const {setProductionGate}=await import('../production-release.mjs');
 const {goodKey}=await import('../refresh-storage.mjs');
 const {refreshConfig}=await import('../refresh-approval.mjs');
 const f=fixture();f.m.generatedAt=new Date().toISOString();
 Object.assign(f.m,{productionApproval:universeConfig.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION',refreshValidation:{status:'PASS',structural:'PASS',privateCompanies:5122,checkpointSha256:'c'.repeat(64)}});
 const ns=refreshConfig.consumerNamespace,payload=ns+'-a',good={schema:1,state:'GOOD',generation:f.m.generation,payloadNamespace:payload,manifest:f.m,health:{}};let writes=0,assetSeen=false;
 const driver={get:async key=>{if(key===goodKey(ns))return Buffer.from(JSON.stringify({...good,health:assetSeen?{changed:true}:{}}));if(key.startsWith(prefixFor(payload)+'slot-0/')){assetSeen=true;return f.bytes;}return null;},put:async()=>writes++};
 try{await assert.rejects(setProductionGate(driver,'AVAILABLE'),/PRODUCTION_GOOD_CHANGED_DURING_GATE_READBACK/);assert.equal(writes,0);}
 finally{rmSync(f.out,{recursive:true,force:true});}
});
