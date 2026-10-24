import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const A=require('../engines/weekly-real-adapter.cjs'),B=require('../engines/weekly-benchmark.cjs'),C=require('../api/real-backtest-contract.js'),{run}=require('../../scripts/quant/run-real-weekly-backtest.cjs'),{materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs');
const root=resolve(import.meta.dirname,'../..'),out=mkdtempSync(join(tmpdir(),'vu-backtest-read-'));
const ids=['ref_NVDA','ref_AAPL','ref_XOM','ref_ARM','ref_BGC','ref_AAAC','ref_AACT','ref_MSFT'];
const report=materialize({root,output:out,ids}),reads=[];
const loadJSON=async p=>JSON.parse(readFileSync(join(root,p.replace(/^\//,'')),'utf8'));
function create({enabled=true,mutate=x=>x,policy=Policy}={}){const store={loadJSON:async p=>{reads.push(p);return mutate(JSON.parse(readFileSync(join(out,p),'utf8')),p);},loadDetail:async p=>{reads.push(p);return mutate(JSON.parse(gunzipSync(readFileSync(join(out,p))).toString()),p);}};
return Service.create({loadJSON,displayPolicy:policy,queryEngine:Query,realBacktestPreview:{enabled,audience:'INTERNAL_REVIEW'},realBacktestStore:store});}
test.after(()=>rmSync(out,{recursive:true,force:true}));
test('A/B/C are quality dimensions; executable simulations remain B and NOT_CERTIFIED',()=>{
 assert.equal(report.state,'COMPLETE');assert.deepEqual(report.counts,{A:0,B:4,C:4});
 const q=gunzipSync(readFileSync(join(out,report.generation,'quality.jsonl.gz'))).toString().trim().split('\n').map(JSON.parse);
 assert.equal(q.length,8);for(const row of q){assert.equal(row.certification,'NOT_CERTIFIED');assert.ok(row.dataVersion.sourceBytesHash);assert.ok(row.computedAt);assert.equal(row.technicallyExecutable,row.class==='B');}
});
test('default and explicitly disabled product services do not read private artifacts',async()=>{
 const off=Service.create({loadJSON:async()=>{throw Error('SHOULD_NOT_LOAD')},displayPolicy:Policy,queryEngine:Query});
 assert.equal((await off.getRealBacktest('NVDA')).reason,'REAL_BACKTEST_PREVIEW_DISABLED');const before=reads.length;
 assert.equal((await create({enabled:false}).getRealBacktest('NVDA')).reason,'REAL_BACKTEST_PREVIEW_DISABLED');assert.equal(reads.length,before);
});
test('real NVDA API summary, detail and independent reference share identity and result hashes',async()=>{
 const api=create(),summary=await api.getRealBacktest('NVDA');assert.equal(summary.state,'AVAILABLE_LIMITED',JSON.stringify(summary));assert.equal(summary.identity.sourceSecurityId,'ref_NVDA');assert.equal(summary.identity.securityId,'vu_d57074b4128184');assert.equal(summary.identity.listingId,'tiingo:NASDAQ:NVDA:1999-01-22');
 assert.equal(summary.executionModel.state,'VALIDATED_EXECUTION_MODEL');assert.equal(summary.productionApproved,false);assert.equal(summary.certification,'NOT_CERTIFIED');
 const raw=run(A.load(root,'ref_NVDA'),{benchmark:B.load(root)});assert.equal(summary.result.resultHash,raw.resultHash);assert.equal(summary.result.metrics.completedTrades,21);assert.ok(Math.abs(summary.result.endCapital-raw.equity.at(-1).value)<1e-6);assert.equal(summary.benchmarkState,raw.marketBenchmark.state);
 const equity=await api.getRealBacktest('NVDA',{section:'equity'}),trades=await api.getRealBacktest('NVDA',{section:'trades'});assert.deepEqual(equity.result.equity,raw.equity);assert.deepEqual(trades.result.trades,raw.trades);assert.equal(trades.result.openPosition.completed,false);
 const file=join(out,'reference.json');writeFileSync(file,JSON.stringify(raw));assert.equal(JSON.parse(execFileSync('python3',['scripts/quant/verify-real-weekly-backtest.py',file],{cwd:root})).state,'PASS');
});
test('all five periods end on actual final mark and never use same-close signal execution',async()=>{
 const api=create(),data=A.load(root,'ref_NVDA');for(const period of C.periods){const r=run(data,{period});assert.equal(r.history.window.endDate,data.points.at(-1)[0]);const s=await api.getRealBacktest('NVDA',{period});assert.equal(s.result.to,data.points.at(-1)[0]);for(const t of r.trades)assert.ok(t.signalDate<t.entryDate);}
});
test('every required real edge case returns consistent execution, quality and benchmark dimensions',async()=>{
 const api=create();for(const ticker of ['AAPL','BGC','AAAC','AACT']){for(const section of C.sections){const r=await api.getRealBacktest(ticker,{section});assert.equal(r.state,'BLOCKED',ticker+':'+JSON.stringify(r));assert.equal(r.quality.class,'C');assert.equal(r.result,undefined);assert.equal(r.certification,'NOT_CERTIFIED');assert.equal(r.benchmarkState,'NOT_EVALUATED');}}
 for(const ticker of ['XOM','ARM','MSFT']){const r=await api.getRealBacktest(ticker);assert.equal(r.state,'AVAILABLE_LIMITED',ticker+':'+JSON.stringify(r));assert.equal(r.returnBasis,'PRICE_RETURN');assert.ok(r.quality.limitations.includes('DIVIDENDS_EXCLUDED'));assert.equal(r.certification,'NOT_CERTIFIED');assert.ok(r.result.endCapital>0);}
 const xom=await api.getRealBacktest('XOM');assert.equal(xom.benchmarkState,'BENCHMARK_UNAVAILABLE');assert.equal(xom.state,'AVAILABLE_LIMITED');
});
test('corrupt identities, dates, performance and certification cannot cross artifact hash gate',async()=>{
 for(const mutate of [s=>{s.certification='CERTIFIED'},s=>{s.identity.ticker='AAPL'},s=>{s.asOf='2099-01-01'},s=>{s.periods.MAX.endCapital*=10},s=>{s.quality.class='A'},s=>{s.periods.MAX.returnBasis='TOTAL_RETURN'}]){
  const api=create({mutate:(s,p)=>{if(p.endsWith('/summary.json'))mutate(s);return s;}});assert.equal((await api.getRealBacktest('NVDA')).state,'UNAVAILABLE');
 }
 for(const section of ['equity','trades']){const api=create({mutate:(s,p)=>{if(p.endsWith('.gz'))s.resultHash='bad';return s;}});assert.equal((await api.getRealBacktest('NVDA',{section})).reason,'BACKTEST_DETAIL_CONTRACT_VIOLATED');}
});
test('source failures, path injection, unsupported periods and display denial fail closed',async()=>{
 const api=create();for(const ticker of ['../../etc/passwd','NVDA/../AAPL'])assert.equal((await api.getRealBacktest(ticker)).reason,'INVALID_SELECTION');
 assert.equal((await api.getRealBacktest('NVDA',{period:'ALL'})).reason,'INVALID_SELECTION');assert.equal((await api.getRealBacktest('NVDA',{section:'../../'})).reason,'INVALID_SELECTION');
 assert.equal((await create({policy:{...Policy,check:()=>({allowed:false})}}).getRealBacktest('NVDA')).reason,'DISPLAY_NOT_PERMITTED');
 assert.equal((await create({mutate:()=>{throw Error('private storage failure')}}).getRealBacktest('NVDA')).reason,'REAL_BACKTEST_SOURCE_UNAVAILABLE');
});
test('bounded summary cache returns clones, reads no equity for summary, and detects generation changes',async()=>{
 const api=create(),before=reads.length,a=await api.getRealBacktest('NVDA');assert.ok(!reads.slice(before).some(p=>p.endsWith('.gz')));a.result.metrics.cagr=999;
 const n=reads.length,b=await api.getRealBacktest('NVDA');assert.notEqual(b.result.metrics.cagr,999);assert.equal(reads.length,n+2); // immutable release pointer before and after the cached read
 let generation=report.generation;const dynamic=create({mutate:(s,p)=>{if(p==='release.json')s.generation=generation;return s;}});assert.equal((await dynamic.getRealBacktest('NVDA')).state,'AVAILABLE_LIMITED');generation='0'.repeat(64);assert.equal((await dynamic.getRealBacktest('NVDA')).state,'UNAVAILABLE');
});
test('materializer resumes exact snapshots; rejects corrupted saved summaries and details',()=>{
 const resumed=materialize({root,output:out,ids});assert.equal(resumed.reused,8);assert.equal(resumed.computed,0);assert.equal(resumed.generation,report.generation);
 const p=join(out,report.generation,'listings/ref_NVDA/summary.json'),bytes=readFileSync(p);const bad=JSON.parse(bytes);bad.state='BLOCKED';writeFileSync(p,JSON.stringify(bad));assert.throws(()=>materialize({root,output:out,ids}),/CORRUPT_SUMMARY/);writeFileSync(p,bytes);
});

test('private filesystem store is bounded, cannot expose repository data or traverse paths',async()=>{
 const Store=require('../../server/quant-backtest-store.cjs');assert.throws(()=>Store.create({directory:root}),/PUBLIC_BACKTEST_STORAGE_FORBIDDEN/);
 const store=Store.create({directory:out});const release=await store.loadJSON('release.json');assert.equal(release.generation,report.generation);
 await assert.rejects(store.loadJSON('../../etc/passwd'),/INVALID_BACKTEST_PATH/);await assert.rejects(store.loadDetail('release.json'),/INVALID_BACKTEST_PATH/);
 const api=Service.create({loadJSON,displayPolicy:Policy,queryEngine:Query,realBacktestPreview:{enabled:true,audience:'INTERNAL_REVIEW'},realBacktestStore:store});assert.equal((await api.getRealBacktest('NVDA',{section:'equity'})).state,'AVAILABLE_LIMITED');
 const outside=mkdtempSync(join(tmpdir(),'vu-outside-'));try{const f=join(out,report.generation,'index/ZZ.json');writeFileSync(join(outside,'x.json'),'{}');symlinkSync(join(outside,'x.json'),f);await assert.rejects(store.loadJSON(report.generation+'/index/ZZ.json'),/BACKTEST_STORAGE_ESCAPE/);}finally{rmSync(outside,{recursive:true,force:true});}
});

test('current canonical listing identity cannot silently rebind an archived replay',async()=>{
 const api=Service.create({loadJSON:async p=>{const d=await loadJSON(p);if(p.endsWith('/instruments/NV.json'))d.instruments.find(i=>i.symbol==='NVDA').issuerId='iss_different';return d;},displayPolicy:Policy,queryEngine:Query,realBacktestPreview:{enabled:true,audience:'INTERNAL_REVIEW'},realBacktestStore:require('../../server/quant-backtest-store.cjs').create({directory:out})});
 assert.equal((await api.getRealBacktest('NVDA')).reason,'INVALID_BACKTEST_IDENTITY_OR_AS_OF');
});

test('BGC historical terminal listing is never assigned to the current primary listing',async()=>{
 const r=await create().getRealBacktest('BGC');assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'HISTORICAL_LISTING_NOT_UNIQUELY_MAPPED_TO_PRODUCT');assert.equal(r.identity.securityId,undefined);assert.ok(r.requestedIdentity.securityId);assert.equal(r.result,undefined);
});

test('derived-only display rights cannot expose raw entry and exit quotes through trades',async()=>{
 const api=create({policy:{...Policy,check:args=>({allowed:args.form!=='raw'})}});assert.equal((await api.getRealBacktest('NVDA')).state,'AVAILABLE_LIMITED');assert.equal((await api.getRealBacktest('NVDA',{section:'trades'})).reason,'RAW_DISPLAY_NOT_PERMITTED');
});

test('invalid calendar and future source publication dates cannot become real backtest inputs',()=>{
 const doc=JSON.parse(readFileSync(join(root,'quant/data/market/discover-series-long/ref_NVDA.json'))),master=JSON.parse(readFileSync(join(root,'quant/data/market/security-master/us-security-master.json'))),id=master.rows.find(r=>r.baseline_security_id==='ref_NVDA');
 for(const asOf of ['2026-02-30','2099-01-01'])assert.throws(()=>A.validate({...doc,asOf},id),/INVALID_SOURCE_METADATA/);
});

test('contract rejects mismatched benchmark basis and unvalidated cost mechanics even with a new artifact hash',()=>{
 const summary=JSON.parse(readFileSync(join(out,report.generation,'listings/ref_NVDA/summary.json')));
 for(const mutate of [s=>s.periods.MAX.marketBenchmark.returnBasis='TOTAL_RETURN',s=>s.periods.MAX.buyAndHold.returnBasis='TOTAL_RETURN',s=>s.executionModel.feeBpsPerSide=0,s=>s.executionModel.scope='STRATEGY_CERTIFICATION']){const bad=structuredClone(summary);mutate(bad);assert.ok(C.summaryViolations(bad,'ref_NVDA',report.generation).length>0);}
});

test('same calculation generation with a replaced summary shard invalidates cached provenance',async()=>{
 let replace=false;const api=create({mutate:(s,p)=>{if(p==='release.json'&&replace)s.shards.NV='0'.repeat(64);return s;}});
 assert.equal((await api.getRealBacktest('NVDA')).state,'AVAILABLE_LIMITED');replace=true;assert.equal((await api.getRealBacktest('NVDA')).reason,'BACKTEST_NOT_MATERIALIZED');
});

test('materializer serializes active writers and resumes a dead process checkpoint safely',()=>{
 const folder=mkdtempSync(join(tmpdir(),'vu-build-lock-'));try{
  const lock=join(folder,'.materialize.lock');writeFileSync(lock,JSON.stringify({pid:process.pid}));assert.throws(()=>materialize({root,output:folder,ids,maxNew:2}),/MATERIALIZATION_ALREADY_RUNNING/);rmSync(lock);
  const first=materialize({root,output:folder,ids,maxNew:2});assert.equal(first.state,'CHECKPOINTED');assert.equal(existsSync(join(folder,'release.json')),false);assert.equal(existsSync(lock),false);
  writeFileSync(lock,JSON.stringify({pid:2147483647}));const complete=materialize({root,output:folder,ids});assert.equal(complete.state,'COMPLETE');assert.equal(complete.reused,2);assert.equal(complete.computed,6);assert.equal(existsSync(lock),false);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('valuation window repair preserves the original next-week warm-up admission gate',()=>{
 const data=A.load(root,'ref_NVDA');assert.throws(()=>run(data,{asOf:data.points[53][0]}),/HISTORY_UNAVAILABLE/);
 const valid=run(data,{asOf:data.points[54][0]});assert.equal(valid.history.state,'AVAILABLE');assert.equal(valid.equity.length,2);assert.equal(valid.certification,'NOT_CERTIFIED');
});

test('caller pins generation and listing; an asynchronous pointer change never returns financial data',async()=>{
 const api=create(),first=await api.getRealBacktest('NVDA');
 assert.equal(first.kindScope,'SINGLE_LISTING_WEEKLY_REPLAY_NOT_AGGREGATE_SIGNAL_CERTIFICATION');
 assert.equal(first.result.initialCapital,100000);
 for(const selection of [{expectedGeneration:'0'.repeat(64)},{expectedListingId:'WRONG'},{expectedGeneration:'../private'},{expectedListingId:'../private'}]){const r=await api.getRealBacktest('NVDA',selection);assert.equal(r.state,'UNAVAILABLE');assert.equal(r.result,undefined);}
 const detail=await api.getRealBacktest('NVDA',{section:'trades',expectedGeneration:first.generation,expectedListingId:first.identity.listingId});assert.equal(detail.result.resultHash,first.result.resultHash);
 let afterDetail=false;const changing=create({mutate:(s,p)=>{if(p.endsWith('.gz'))afterDetail=true;if(p==='release.json'&&afterDetail)s.generation='0'.repeat(64);return s;}});
 const rejected=await changing.getRealBacktest('NVDA',{section:'trades'});assert.equal(rejected.reason,'GENERATION_CHANGED');assert.equal(rejected.result,undefined);
 const wrongModel=create({mutate:(s,p)=>{if(p==='release.json')s.executionModel.schemaVersion='UNREVIEWED';return s;}});assert.equal((await wrongModel.getRealBacktest('NVDA')).reason,'INVALID_BACKTEST_RELEASE_MODEL');
});

test('a failed final release-pointer read is contained as unavailable, never an uncaught or financial response',async()=>{
 let pointers=0;const api=create({mutate:(s,p)=>{if(p==='release.json'&&++pointers===2)throw Error('isolated final pointer loss');return s;}});const r=await api.getRealBacktest('NVDA');assert.equal(r.reason,'REAL_BACKTEST_SOURCE_UNAVAILABLE');assert.equal(r.result,undefined);
});

test('reader rejects unsupported rules/options and malformed selection envelopes',async()=>{
 const api=create();for(const selection of [null,[],{ruleId:'TREND_UP'},{period:'MAX',private:true},{expectedGeneration:['0'.repeat(64)]},{expectedListingId:{toString:()=> 'WRONG'}}]){const r=await api.getRealBacktest('NVDA',selection);assert.equal(r.reason,'INVALID_SELECTION');assert.equal(r.result,undefined);}
});

test('a release cannot relabel summaries with another numerical runtime',async()=>{
 const api=create({mutate:(s,p)=>{if(p==='release.json')s.calculationRuntime={nodeVersion:'0.0.0',nodeExecutableHash:'0'.repeat(64)};return s;}});const r=await api.getRealBacktest('NVDA');assert.equal(r.reason,'INVALID_BACKTEST_RUNTIME_BINDING');assert.equal(r.result,undefined);
});
