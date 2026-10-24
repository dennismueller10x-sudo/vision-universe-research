import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),A=require('../engines/weekly-real-adapter.cjs'),B=require('../engines/weekly-benchmark.cjs'),{run}=require('../../scripts/quant/run-real-weekly-backtest.cjs'),{batch}=require('../../scripts/quant/batch-real-weekly-backtests.cjs');
const root=resolve(import.meta.dirname,'../..'),data=A.load(root,'ref_NVDA'),benchmark=B.load(root);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('legacy NVDA reference is preserved, per-side costs charge purchases and open entry',()=>{
 const legacy=run(data,{costModel:'LEGACY_EXIT_NOTIONAL',benchmark,asOf:'2026-10-16'}),r=run(data,{benchmark});
 near(legacy.equity.at(-1).value,4933558.796274043);assert.equal(legacy.trades.length,21);
 for(const t of [...r.trades,r.openPosition].filter(Boolean)){
  near(t.entryCapital,t.entryGross+t.entryFees+t.entrySlippage);near(t.units*t.entryPrice,t.entryGross);
  near(t.entryFees,t.entryGross*.001);near(t.entrySlippage,t.entryGross*.0005);
  if(t.completed){near(t.exitFees,t.grossExitValue*.001);near(t.exitSlippage,t.grossExitValue*.0005);near(t.netExitValue,t.grossExitValue-t.exitFees-t.exitSlippage);}
 }
 near(r.metrics.fees,r.trades.reduce((s,t)=>s+t.fees,0)+(r.openPosition?.entryFees||0));
 assert.ok(r.openPosition.entryFees>0);
});
test('real SPY aligns every exact equity date, independent Python verifies both cost models',()=>{
 const dir=mkdtempSync(join(tmpdir(),'weekly-reference-'));
 try{for(const costModel of ['PER_SIDE_NOTIONAL','LEGACY_EXIT_NOTIONAL']){
 const r=run(data,{benchmark,costModel,asOf:'2026-10-16'});assert.equal(r.marketBenchmark.state,'AVAILABLE');assert.equal(r.marketBenchmark.points.length,r.equity.length);assert.equal(r.marketBenchmark.from,r.equity[0].date);assert.equal(r.marketBenchmark.to,r.equity.at(-1).date);
 const file=join(dir,'run.json');writeFileSync(file,JSON.stringify(r));assert.equal(JSON.parse(execFileSync('python3',['scripts/quant/verify-real-weekly-backtest.py',file],{cwd:root,encoding:'utf8'})).state,'PASS');
 }}finally{rmSync(dir,{recursive:true,force:true});}
});
test('missing SPY dates or currency mismatch remain separate from executable strategy',()=>{
 const sparse={...benchmark,byDate:new Map(benchmark.byDate)};sparse.byDate.delete('2000-01-28');
 const r=run(data,{benchmark:sparse});assert.equal(r.marketBenchmark.state,'BENCHMARK_UNAVAILABLE');assert.equal(r.trades.length,21);
 assert.equal(B.compare(benchmark,r.equity,r.metrics,'EUR').reason,'CURRENCY_MISMATCH');
 const poison={...benchmark,byDate:new Map(benchmark.byDate)};poison.byDate.set('2099-01-01',1e12);near(run(data,{benchmark:poison,asOf:'2026-10-16'}).marketBenchmark.cagr,run(data,{benchmark,asOf:'2026-10-16'}).marketBenchmark.cagr);
});
test('benchmark identity and Total Return cannot masquerade as PRICE_RETURN',()=>{
 const raw=JSON.parse(readFileSync(join(root,B.SOURCE))),catalog=JSON.parse(readFileSync(join(root,'quant/data/market/multi-asset/instruments.json')));
 assert.throws(()=>B.prepare({...raw,valueSemantics:'TOTAL_RETURN'},catalog),/BASIS/);
 assert.throws(()=>B.prepare({...raw,instrumentId:'foreign'},catalog),/IDENTITY/);
});
test('batch interruption resumes deterministically and refuses corrupt checkpoint',()=>{
 const dir=mkdtempSync(join(tmpdir(),'weekly-batch-'));try{
 const output=join(dir,'resume'),fresh=join(dir,'fresh');const partial=batch({root,output,limit:12,maxNew:4});assert.equal(partial.summary.state,'CHECKPOINTED');
 const resumed=batch({root,output,limit:12});assert.equal(resumed.performance.reused,4);assert.deepEqual(resumed.summary,batch({root,output:fresh,limit:12}).summary);
 const manifest=JSON.parse(readFileSync(join(output,'manifest.json')));const file=join(output,'rows',manifest.input.sources[0].securityId+'.json');const record=JSON.parse(readFileSync(file));record.state='CERTIFIED';writeFileSync(file,JSON.stringify(record));assert.throws(()=>batch({root,output,limit:12}),/CHECKPOINT_CORRUPT/);
 assert.throws(()=>batch({root,output,limit:13}),/RESUME_INPUT_CHANGED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('stored instrument class and unresolved corporate actions cannot bypass adapter gates',()=>{
 const raw=JSON.parse(readFileSync(join(root,data.sourcePath))),master=JSON.parse(readFileSync(join(root,'quant/data/market/security-master/us-security-master.json'))),id=master.rows.find(r=>r.canonical_id===data.listingId);
 assert.throws(()=>A.validate(raw,{...id,instrument_type:'PREFERRED'}),/INELIGIBLE_EQUITY/);
 assert.throws(()=>A.validate({...raw,priceSeriesType:'TOTAL_RETURN'},id),/REAL_WEEKLY_PRICE_REQUIRED/);
 const unsupported=structuredClone(raw);unsupported.corporateActions=null;assert.throws(()=>A.validate(unsupported,id),/CORPORATE_ACTION_UNRESOLVED/);
});

test('MAX beyond stored SPY coverage is not shortened or filled',()=>{
 const r=run(data,{benchmark});
 assert.equal(r.input.end,data.points.at(-1)[0]);
 const missing=r.equity.filter(p=>!benchmark.byDate.has(p.date));
 assert.equal(r.marketBenchmark.state,missing.length?'BENCHMARK_UNAVAILABLE':'AVAILABLE');
 if(missing.length){assert.equal(r.marketBenchmark.cagr,undefined);assert.equal(r.marketBenchmark.points,undefined);}
});
