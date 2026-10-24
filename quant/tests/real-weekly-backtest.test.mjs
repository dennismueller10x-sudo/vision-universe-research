import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url), A=require('../engines/weekly-real-adapter.cjs'),{run}=require('../../scripts/quant/run-real-weekly-backtest.cjs');
const root=resolve(import.meta.dirname,'../..');
const data=A.load(root,'ref_NVDA');
test('real NVDA MAX reproduces exactly and independently in Python',()=>{
 const a=run(data),b=run(A.load(root,'ref_NVDA'));assert.deepEqual(a,b);assert.equal(a.history.earliestEligibleBacktestDate,'2000-01-28');assert.ok(a.trades.length>0);assert.equal(a.input.returnBasis,'PRICE_RETURN');
 const dir=mkdtempSync(join(tmpdir(),'vu-real-'));try{const file=join(dir,'result.json');writeFileSync(file,JSON.stringify(a));const check=JSON.parse(execFileSync('python3',['scripts/quant/verify-real-weekly-backtest.py',file],{cwd:root,encoding:'utf8'}));assert.equal(check.state,'PASS');}finally{rmSync(dir,{recursive:true,force:true});}
});
test('future prices cannot change past orders or equity; incomplete M6 is never completed',()=>{
 const cutoff='2025-02-07',a=run(data,{asOf:cutoff});const poisoned=structuredClone(data);poisoned.points.forEach(p=>{if(p[0]>cutoff)p[1]*=100;});assert.deepEqual(run(poisoned,{asOf:cutoff}),a);if(a.openPosition)assert.equal(a.openPosition.completed,false);
 for(const t of a.trades)assert.ok(t.signalDate<t.entryDate && t.entryDate<t.exitDate && t.exitDate<=cutoff);
});
test('all supported periods derive from observed history',()=>{for(const period of ['1Y','3Y','5Y','10Y','MAX']){const r=run(data,{period});assert.ok(r.equity.length>0);assert.equal(r.history.window.period,period);}});
test('adapter refuses synthetic, foreign identities, missing and duplicate weeks',()=>{
 const fs=require('node:fs'),doc=JSON.parse(fs.readFileSync(join(root,data.sourcePath))),master=JSON.parse(fs.readFileSync(join(root,'quant/data/market/security-master/us-security-master.json'))),id=master.rows.find(r=>r.canonical_id===data.listingId);
 assert.throws(()=>A.validate({...doc,dataMode:'mock'},id),/REAL_WEEKLY/);assert.throws(()=>A.validate(doc,{...id,baseline_security_id:'ref_OTHER'}),/IDENTITY/);
 const gap=structuredClone(doc);gap.points.splice(80,1);assert.throws(()=>A.validate(gap,id),/MISSING_WEEKS/);
 const duplicate=structuredClone(doc);duplicate.points[80]=duplicate.points[79];assert.throws(()=>A.validate(duplicate,id),/DUPLICATE/);
 assert.throws(()=>A.validate(doc,{...id,active_status:'INACTIVE'}),/TERMINAL/);
});
test('constant split-unit rebasing preserves financial results',()=>{
 const rebased=structuredClone(data);rebased.points.forEach(p=>p[1]*=10);const a=run(data),b=run(rebased);
 assert.equal(a.trades.length,b.trades.length);for(const key of ['totalReturn','cagr','maxDrawdown','fees','slippage'])assert.ok(Math.abs(a.metrics[key]-b.metrics[key])<1e-6,key);
});
test('shared adapter executes eligible real histories and retains the existing AAPL corporate-action hold',()=>{
 for(const id of ['ref_XOM','ref_ARM']){const r=run(A.load(root,id));assert.ok(r.equity.length>0);assert.equal(r.provenance.securityId,id);assert.equal(r.certification,'NOT_CERTIFIED');}
 assert.throws(()=>A.load(root,'ref_AAPL'),/CORPORATE_ACTION_UNRESOLVED/);
});
test('independent checker detects a corrupted execution price',()=>{
 const r=run(data);r.trades[0].exitPrice*=2;const dir=mkdtempSync(join(tmpdir(),'vu-corrupt-'));try{const file=join(dir,'result.json');writeFileSync(file,JSON.stringify(r));assert.throws(()=>execFileSync('python3',['scripts/quant/verify-real-weekly-backtest.py',file],{cwd:root,stdio:'pipe'}));}finally{rmSync(dir,{recursive:true,force:true});}
});
