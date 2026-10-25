import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url),Reader=require('../../server/quant-backtest-reader.cjs'),Selection=require('../api/real-backtest-selection.js'),{materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs');
const root=resolve(import.meta.dirname,'../..'),output=fs.mkdtempSync(join(tmpdir(),'vu-selection-')),tickers=['NVDA','MSFT','XOM','ARM','AAPL','BGC','AAAC','AACT'];
materialize({root,output,ids:tickers.map(t=>'ref_'+t)});
const service=Reader.create({directory:output,root,enabled:true,audience:'INTERNAL_REVIEW',allowedTickers:tickers}),client=Selection.create({service});
test.after(()=>fs.rmSync(output,{recursive:true,force:true}));
test('existing reader is disabled by default and requires trusted internal scope',async()=>{
 assert.equal((await Reader.create().getRealBacktest('NVDA')).reason,'REAL_BACKTEST_PREVIEW_DISABLED');
 const limited=Reader.create({directory:output,enabled:true,audience:'INTERNAL_REVIEW'});assert.equal((await limited.getRealBacktest('NVDA')).reason,'NOT_AUTHORIZED');
 assert.throws(()=>Selection.create(),/EXISTING_QUANT_READER_REQUIRED/);
});
test('all five real periods return identical hashes across raw service and pinned handoff',async()=>{
 for(const period of Selection.periods){const raw=await service.getRealBacktest('NVDA',{period}),s=await client.load('NVDA',{period});assert.equal(s.result.resultHash,raw.result.resultHash);assert.equal(s.result.initialCapital,100000);assert.equal(s.delivery.state,'CURRENT_INPUT_SNAPSHOT');assert.ok(Object.isFrozen(s.selection));
 for(const section of Selection.sections){const detail=await client.read(s.selection,section);assert.equal(detail.state,'AVAILABLE_LIMITED');assert.equal(detail.generation,s.generation);assert.equal(detail.identity.listingId,s.identity.listingId);if(detail.result)assert.equal(detail.result.resultHash,s.result.resultHash);}}
});
test('8 real identities retain quality and benchmark dimensions; blocked listings never expose performance',async()=>{
 for(const ticker of tickers){const s=await client.load(ticker);assert.equal(s.identity.ticker,ticker);assert.equal(s.certification,'NOT_CERTIFIED');assert.equal(s.returnBasis,'PRICE_RETURN');
 if(['AAPL','BGC','AAAC','AACT'].includes(ticker)){assert.equal(s.state,'BLOCKED');assert.equal(s.result,undefined);for(const section of Selection.sections){const d=await client.read(s.selection,section);assert.equal(d.state,'BLOCKED');assert.equal(d.result,undefined);}}
 else{assert.equal(s.state,'AVAILABLE_LIMITED');assert.ok(s.result.endCapital>0);}
 }
 const xom=await client.load('XOM');assert.equal(xom.benchmarkState,'BENCHMARK_UNAVAILABLE');assert.ok(xom.quality.limitations.includes('DIVIDENDS_EXCLUDED'));
 const arm=await client.load('ARM',{period:'10Y'});assert.equal(arm.result.complete,false);assert.equal(arm.result.from,'2024-09-20');
});
test('invalid and tampered selections fail closed without returning financial values',async()=>{
 const s=await client.load('NVDA');for(const selection of [{...s.selection,generation:'0'.repeat(64)},{...s.selection,listingId:'WRONG'},{...s.selection,resultHash:'WRONG'},{...s.selection,ticker:'../secret'},{...s.selection,period:'ALL'}]){const r=await client.read(selection,'trades');assert.equal(r.state,'UNAVAILABLE');assert.equal(r.result,undefined);}
 assert.equal((await client.load('NVDA',{period:'ALL'})).reason,'INVALID_SELECTION');assert.equal((await client.read(s.selection,'private')).reason,'INVALID_SELECTION');
});
test('handoff rejects certification promotion, unbound generation, wrong ticker or transport failures',async()=>{
 const raw=await service.getRealBacktest('NVDA');for(const mutate of [r=>{r.certification='CERTIFIED'},r=>{r.identity.ticker='OTHER'},r=>{r.generation='bad'},r=>{r.returnBasis='TOTAL_RETURN'},r=>{r.kindScope='PORTFOLIO'}]){const fake=Selection.create({service:{getRealBacktest:async()=>{const r=structuredClone(raw);mutate(r);return r;}}});assert.equal((await fake.load('NVDA')).reason,'BACKTEST_CONTRACT_VIOLATED');}
 const failed=Selection.create({service:{getRealBacktest:async()=>{throw Error('private backend detail');}}});assert.equal((await failed.load('NVDA')).reason,'REAL_BACKTEST_SOURCE_UNAVAILABLE');
});
