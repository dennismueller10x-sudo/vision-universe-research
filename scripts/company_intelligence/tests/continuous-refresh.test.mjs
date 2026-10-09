import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {refreshConfig,frozenInventory,frozenTickers,refreshApproved,freshness,safePublicRefresh} from '../refresh-approval.mjs';
import {prepareCandidate,commitGood,goodState,downloadGood,rollbackGood,goodKey} from '../refresh-storage.mjs';
import {validateChanges} from '../refresh-run.mjs';
import {stageProduction,setProductionGate} from '../production-release.mjs';
import {approval,reviewed} from '../production-approval.mjs';
import {prefixFor} from '../public-delivery.mjs';
import {runtimeCandidate} from '../runtime-candidate.mjs';
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
test('three generations and repeated failed candidates preserve current AND previous good assets',async()=>{
 const d=driver(),ns='contract',fs=[1,2,3,4].map(n=>fixture(n)),out=mkdtempSync(join(tmpdir(),'refresh-download-'));
 try{
  await advance(d,ns,fs[0]);await advance(d,ns,fs[1]);await advance(d,ns,fs[2]);
  const before=await d.get(goodKey(ns)),good=await goodState(d,ns);
  for(let i=0;i<2;i++)await prepareCandidate(d,{namespace:ns,directory:fs[3].root,good}); // QA failure: never commit
  assert.deepEqual(await d.get(goodKey(ns)),before);
  await downloadGood(d,{namespace:ns,output:out});assert.equal(JSON.parse(readFileSync(join(out,'index.json'))).generation,fs[2].m.generation);
  await rollbackGood(d,ns);await downloadGood(d,{namespace:ns,output:out});assert.equal(JSON.parse(readFileSync(join(out,'index.json'))).generation,fs[1].m.generation);
 }finally{for(const f of fs)rmSync(f.root,{recursive:true});rmSync(out,{recursive:true});}
});
test('R2 write failure and consumer-build integrity failure cannot advance good pointer',async()=>{
 const d=driver(),ns='fault',a=fixture(1),b=fixture(2);
 try{await advance(d,ns,a);const before=await d.get(goodKey(ns));const put=d.put;d.put=async()=>{throw Error('R2_UNAVAILABLE');};await assert.rejects(advance(d,ns,b));d.put=put;assert.deepEqual(await d.get(goodKey(ns)),before);
  writeFileSync(join(b.root,'index.json'),'{}');await assert.rejects(advance(d,ns,b),/LOCAL_CONSUMER_INTEGRITY_FAILED/);assert.deepEqual(await d.get(goodKey(ns)),before);
 }finally{rmSync(a.root,{recursive:true});rmSync(b.root,{recursive:true});}
});
test('unknown good-pointer commit status is compensated to prior good',async()=>{
 const d=driver(),ns='readback',a=fixture(1),b=fixture(2);try{
  await advance(d,ns,a);const good=await goodState(d,ns),before=await d.get(goodKey(ns)),r=await prepareCandidate(d,{namespace:ns,directory:b.root,good});
  const get=d.get,put=d.put;let fail=false;d.put=async(k,v)=>{await put(k,v);if(k===goodKey(ns))fail=true;};d.get=async k=>{if(fail&&k===goodKey(ns)){fail=false;return Buffer.from('{}');}return get(k);};
  // Only the first readback fails; compensation itself must be verifiable.
  d.put=async(k,v)=>{await put(k,v);if(k===goodKey(ns)&&!Buffer.from(v).equals(before))fail=true;};
  await assert.rejects(commitGood(d,{namespace:ns,payloadNamespace:r.payloadNamespace,manifest:r.manifest,health:{},inventory:frozenInventory,expectedGood:good}),/GOOD_POINTER_READBACK_FAILED/);
  assert.deepEqual(await get(goodKey(ns)),before);
 }finally{rmSync(a.root,{recursive:true});rmSync(b.root,{recursive:true});}
});
test('scope, policy and private universe minima are fail-closed; public evidence omits private certificate',()=>{
 const f=fixture(1);try{assert(refreshApproved(f.m));for(const bad of [{...f.m,tickers:f.m.tickers.slice(1)},{...f.m,sourceUsagePolicy:'UNREVIEWED'},{...f.m,refreshValidation:{...f.m.refreshValidation,privateCompanies:45}}])assert(!refreshApproved(bad));
  const safe=JSON.stringify(safePublicRefresh(f.m,{},frozenInventory));assert(!safe.includes('checkpointSha256'));assert(!safe.includes('stateNamespace'));assert(!safe.includes('privateCompanies'));
 }finally{rmSync(f.root,{recursive:true});}
});
test('issuer financial regression and unexplained news loss are rejected before publication',()=>{
 const a=fixture(1),b=fixture(2);try{assert.equal(validateChanges(b.root,a.root).profiles,45);
  const cid=Object.keys(frozenInventory)[0],p=join(a.root,`snapshots/${a.m.generation}/${cid}.json`),v=JSON.parse(readFileSync(p));v.latestFinancials={state:'AVAILABLE',reportingPeriod:'2026-06-30'};writeFileSync(p,JSON.stringify(v));assert.throws(()=>validateChanges(b.root,a.root),/FINANCIAL_REGRESSION/);
  v.latestFinancials={state:'MISSING'};v.news=[{newsId:'old',publishedAt:'2026-10-08T00:00:00Z'}];writeFileSync(p,JSON.stringify(v));assert.throws(()=>validateChanges(b.root,a.root),/UNEXPLAINED_NEWS_LOSS/);
 }finally{rmSync(a.root,{recursive:true});rmSync(b.root,{recursive:true});}
});
test('health SLO uses successful operation timestamps, never attempt time',()=>{const now=Date.parse('2026-10-09T12:00:00Z');assert.equal(freshness('2026-10-09T08:00:00Z',now),'HEALTHY');assert.equal(freshness('2026-10-09T03:00:00Z',now),'WARNING');assert.equal(freshness('2026-10-08T23:00:00Z',now),'CRITICAL');assert.equal(freshness(null,now),'CRITICAL');});
test('day-30 Pages staging uses fresh rolling GOOD without reading the expired fixed bootstrap',async()=>{
 const d=driver(),f=fixture(30,new Date().toISOString()),release=mkdtempSync(join(tmpdir(),'refresh-day30-'));
 try{
  await advance(d,refreshConfig.consumerNamespace,f);
  const legacy=prefixFor(approval.namespace);
  await d.put(legacy+'gate.json',Buffer.from(JSON.stringify({schema:1,state:'AVAILABLE',generation:approval.consumerGeneration,approvalId:approval.approvalId})));
  const expired={...reviewed,generatedAt:new Date(Date.now()-30*86400000).toISOString(),productionApproval:approval.approvalId,releaseState:'APPROVED_CONTROLLED_PRODUCTION'};
  assert(Date.now()-Date.parse(expired.generatedAt)>7*86400000);
  await d.put(legacy+'manifest.json',Buffer.from(JSON.stringify(expired)));
  mkdirSync(join(release,'company-intelligence/config'),{recursive:true});
  writeFileSync(join(release,'company-intelligence/config/rollout.js'),'const config = {stage:1,expectedGeneration:"'+approval.consumerGeneration+'"};');
  const get=d.get;d.get=async k=>{if(k.startsWith(legacy)&&k!==legacy+'gate.json')throw Error('EXPIRED_BOOTSTRAP_MUST_NOT_BE_READ');return get(k);};
  await setProductionGate(d,'DISABLED');
  const enabled=await setProductionGate(d,'AVAILABLE');assert.equal(enabled.status,'AVAILABLE');
  const r=await stageProduction(d,release,{enabled:true});assert.equal(r.generation,f.m.generation);
  assert.equal(JSON.parse(readFileSync(join(release,'company-intelligence-delivery.json'))).generation,f.m.generation);
  assert(readFileSync(join(release,'company-intelligence/config/rollout.js'),'utf8').includes(f.m.generation));
 }finally{rmSync(f.root,{recursive:true});rmSync(release,{recursive:true});}
});
test('full live QA binds exact hydration time to the current manifest and rejects contradictory generation/time',async()=>{
 const f=fixture(31,new Date().toISOString()),original=globalThis.fetch;
 try{
  const proof=safePublicRefresh(f.m,{},frozenInventory);
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('delivery.json')?{generation:f.m.generation,cohortStocks:46,issuers:45}:proof});
  const current=await runtimeCandidate();assert.equal(current.candidate.dataTime,f.m.generatedAt);assert.equal(current.candidate.generation,f.m.generation);
  proof.manifest.generatedAt='2026-01-01T00:00:00Z';await assert.rejects(runtimeCandidate(),{name:'AssertionError'});
  proof.manifest.generatedAt=f.m.generatedAt;proof.manifest.generation='f'.repeat(24);await assert.rejects(runtimeCandidate(),{name:'AssertionError'});
 }finally{globalThis.fetch=original;rmSync(f.root,{recursive:true});}
});

test('OFF canary enables only the approved cohort in intercepted bytes; served gate is untouched',async()=>{
 const {candidateRollout}=await import('../candidate-rollout.mjs');
 const {runInNewContext}=await import('node:vm');
 const original=readFileSync(new URL('../../../company-intelligence/config/rollout.js',import.meta.url),'utf8');
 const off=original.replace('const config = {stage:1,','const config = {stage:0,productionOff:true,');
 const sandbox={URLSearchParams};runInNewContext(candidateRollout(off,'a'.repeat(24)),sandbox);
 const config=sandbox.VUCompanyIntelligenceRollout;
 assert.equal(config.enabled('AAPL'),true);assert.equal(config.enabled('ZZZZZ'),false);assert.equal(config.expectedGeneration,'a'.repeat(24));
 const served={URLSearchParams};runInNewContext(off,served);assert.equal(served.VUCompanyIntelligenceRollout.enabled('AAPL'),false);
 assert.throws(()=>candidateRollout(off.replace('"AAPL"','"ZZZZZ"'),'a'.repeat(24)),/CANDIDATE_COHORT_MISMATCH/);
});
