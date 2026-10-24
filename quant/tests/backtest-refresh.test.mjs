import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url),{materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs'),{rollback}=require('../../scripts/quant/rollback-real-backtest.cjs'),{refresh}=require('../../scripts/quant/refresh-real-backtest.cjs');
const root=resolve(import.meta.dirname,'../..'),folder=fs.mkdtempSync(join(tmpdir(),'vu-refresh-')),fixture=join(folder,'source'),output=join(folder,'private');
const ids=['ref_NVDA','ref_MSFT','ref_XOM','ref_ARM','ref_AAPL','ref_BGC','ref_AAAC','ref_AACT'];
const copy=p=>{const to=join(fixture,p);fs.mkdirSync(dirname(to),{recursive:true});fs.cpSync(join(root,p),to,{recursive:true});};
for(const p of ['quant/engines','quant/api','quant/methodology','quant/data/universe/instruments','quant/data/market/security-master/us-security-master.json','quant/data/market/multi-asset/series/SPY.json','quant/data/market/multi-asset/instruments.json','quant/data/market/discover-series/ref_SPY.json','scripts/quant/materialize-real-backtest-read.cjs','scripts/quant/run-real-weekly-backtest.cjs','scripts/quant/contracts/weekly-execution-model-v2.json','quant/config/development-preview.json','quant/config/feature-gates.json'])copy(p);
for(const id of ids)copy('quant/data/market/discover-series-long/'+id+'.json');
const ptr=()=>fs.readFileSync(join(output,'release.json'),'utf8'),build=opts=>materialize({root:fixture,output,ids,...opts}),source=join(fixture,'quant/data/market/discover-series-long/ref_NVDA.json');
let first,second;
test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
test('cold generation and unchanged resume retain real NVDA and all existing holds',()=>{
 first=build();assert.equal(first.calculatedListings,8);assert.deepEqual(first.counts,{A:0,B:4,C:4});const current=ptr(),same=build();assert.equal(same.reused,8);assert.equal(same.calculatedListings,0);assert.equal(ptr(),current);
});
test('one corrected price file invalidates exactly one listing; seven reuse calculation cache',()=>{
 const doc=JSON.parse(fs.readFileSync(source));doc.points[200][1]*=1.001;fs.writeFileSync(source,JSON.stringify(doc));second=build();assert.notEqual(second.generation,first.generation);assert.equal(second.calculatedListings,1);assert.equal(second.calculationCacheHits,7);
 const read=(gen,id)=>JSON.parse(fs.readFileSync(join(output,gen,'listings',id,'summary.json')));
 assert.equal(read(first.generation,'ref_MSFT').periods.MAX.resultHash,read(second.generation,'ref_MSFT').periods.MAX.resultHash);assert.notEqual(read(first.generation,'ref_NVDA').periods.MAX.resultHash,read(second.generation,'ref_NVDA').periods.MAX.resultHash);
});
test('model version dependency invalidates all; unsupported cost approval fails before publication',()=>{
 const file=join(fixture,'scripts/quant/contracts/weekly-execution-model-v2.json'),old=fs.readFileSync(file),model=JSON.parse(old);model.validation+=' / reviewed metadata revision';fs.writeFileSync(file,JSON.stringify(model));const next=build();assert.equal(next.calculatedListings,8);assert.notEqual(next.generation,second.generation);
 const valid=ptr();model.schemaVersion='UNKNOWN_MODEL_VERSION';fs.writeFileSync(file,JSON.stringify(model));assert.throws(()=>build(),/INVALID_RELEASE_STATUS/);assert.equal(ptr(),valid);model.schemaVersion='weekly-execution-model-2.0.0';model.feeBpsPerSide=0;fs.writeFileSync(file,JSON.stringify(model));assert.throws(()=>build(),/INVALID_RELEASE_STATUS/);assert.equal(ptr(),valid);fs.writeFileSync(file,old);
});
test('partial generation never replaces the last complete pointer and rollback verifies old artifacts',()=>{
 const prior=ptr(),doc=JSON.parse(fs.readFileSync(source));doc.points[201][1]*=1.001;fs.writeFileSync(source,JSON.stringify(doc));const part=build({maxNew:1});assert.equal(part.state,'CHECKPOINTED');assert.equal(ptr(),prior);const complete=build();assert.equal(complete.state,'COMPLETE');assert.notEqual(ptr(),prior);
 const result=rollback({output,generation:first.generation});assert.equal(result.verifiedListings,8);assert.equal(JSON.parse(ptr()).generation,first.generation);
});
test('mid-build input change aborts publication while preserving the complete prior generation',()=>{
 const current=ptr(),bytes=fs.readFileSync(source),doc=JSON.parse(bytes);doc.points[202][1]*=1.001;fs.writeFileSync(source,JSON.stringify(doc));let changed=false;const rename=fs.renameSync;
 fs.renameSync=(a,b)=>{rename(a,b);if(!changed&&b.endsWith('/ref_NVDA/summary.json')){changed=true;const again=JSON.parse(fs.readFileSync(source));again.points[203][1]*=1.001;fs.writeFileSync(source,JSON.stringify(again));}};
 try{assert.throws(()=>build(),/INPUT_CHANGED_DURING_MATERIALIZATION/);assert.equal(ptr(),current);}finally{fs.renameSync=rename;fs.writeFileSync(source,bytes);}
});
test('concurrent acquisition gate and live writer cannot be stolen',()=>{
 fs.writeFileSync(join(output,'.materialize.acquire'),'review required');assert.throws(()=>build(),/ACQUISITION_BUSY/);fs.rmSync(join(output,'.materialize.acquire'));
 fs.writeFileSync(join(output,'.materialize.lock'),JSON.stringify({pid:process.pid}));assert.throws(()=>build(),/ALREADY_RUNNING/);fs.rmSync(join(output,'.materialize.lock'));
});
test('local refresh uses a fresh execution process and never changes source files',()=>{
 const bytes=fs.readFileSync(source),r=refresh({root:fixture,output,ids});assert.equal(r.state,'COMPLETE');assert.deepEqual(fs.readFileSync(source),bytes);
});

test('corrupted calculation cache aborts a new generation without replacing the valid pointer',()=>{
 const current=ptr(),cacheDir=join(output,'.calculation-cache'),product=join(fixture,'quant/data/universe/instruments/NV.json'),old=fs.readFileSync(product);
 // New harmless product metadata selects a new wrapper generation while the
 // calculation dependency keys remain unchanged.
 const rows=JSON.parse(old);rows.metadataRevision='isolated integrity test';fs.writeFileSync(product,JSON.stringify(rows));for(const file of fs.readdirSync(cacheDir)){const b=fs.readFileSync(join(cacheDir,file));fs.writeFileSync(join(cacheDir,file),Buffer.from('corrupt'));}
 try{assert.throws(()=>build());assert.equal(ptr(),current);}finally{fs.writeFileSync(product,old);fs.rmSync(cacheDir,{recursive:true,force:true});}
});

test('real weekly append invalidates HTTP cache, rejects old pinned details and exposes the actual new As-of',async()=>{
 const Preview=require('../../server/quant-backtest-preview.cjs'),full=fs.readFileSync(join(root,'quant/data/market/discover-series-long/ref_NVDA.json')),doc=JSON.parse(full);doc.points.pop();doc.to=doc.asOf=doc.points.at(-1)[0];doc.corporateActions.splits=doc.corporateActions.splits.filter(x=>x[0]<=doc.asOf);doc.corporateActions.moves=doc.corporateActions.moves.filter(x=>x.week<=doc.asOf);fs.writeFileSync(source,JSON.stringify(doc));build();
 const key='7'.repeat(64),app=Preview.create({directory:output,root:fixture,credentialKey:key}),url=await app.listen();
 try{const login=await fetch(url+'login',{method:'POST',headers:{Origin:new URL(url).origin,'Content-Type':'application/json'},body:JSON.stringify({key})}),cookie=login.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie},old=await (await fetch(url+'data?ticker=NVDA',{headers})).json();assert.equal(old.asOf,doc.asOf);
  fs.writeFileSync(source,full);const pending=await (await fetch(url+'data?ticker=NVDA',{headers})).json();assert.equal(pending.delivery.state,'STALE_INPUT_SNAPSHOT');assert.ok(pending.delivery.changedDependencies.includes('PRICE_SERIES'));assert.equal(pending.asOf,doc.asOf);const updated=build();// The full original dataset may already have an immutable generation; reuse
  // that checkpoint instead of needlessly recomputing it. A genuinely new file
  // correction is separately verified above to calculate exactly one listing.
  assert.ok(updated.calculatedListings<=1);assert.equal(updated.calculatedListings+updated.calculationCacheHits+updated.reused,8);
  const stale=await fetch(url+'data?'+new URLSearchParams({ticker:'NVDA',section:'equity',generation:old.generation,listingId:old.identity.listingId}),{headers});assert.equal(stale.status,409);assert.equal((await stale.json()).result,undefined);
  const fresh=await (await fetch(url+'data?ticker=NVDA',{headers})).json();assert.equal(fresh.asOf,JSON.parse(full).asOf);assert.equal(fresh.delivery.state,'CURRENT_INPUT_SNAPSHOT');assert.notEqual(fresh.generation,old.generation);assert.equal(fresh.result.metrics.completedTrades,21);assert.equal(fresh.result.to,JSON.parse(full).to);const expected=require('../../scripts/quant/run-real-weekly-backtest.cjs').run(require('../engines/weekly-real-adapter.cjs').load(root,'ref_NVDA'));assert.ok(Math.abs(fresh.result.endCapital-expected.equity.at(-1).value)<1e-6);
 }finally{await app.close();}
});

test('automated refresh preserves its established listing scope and rejects accidental scope shrink',()=>{
 const before=ptr();assert.throws(()=>refresh({root:fixture,output,ids:['ref_NVDA']}),/SCOPE_CHANGE_REQUIRES_NEW_OUTPUT_DIRECTORY/);assert.equal(ptr(),before);const unchanged=refresh({root:fixture,output});assert.equal(unchanged.expected,8);assert.equal(unchanged.calculatedListings,0);
});
