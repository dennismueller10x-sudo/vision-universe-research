import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import{runMethod,populateForwardReturns,marketRegime,currentConsensus,currentScan,benchmarkCurve}from '../research/tournament/runner.mjs';
const protocol=JSON.parse(fs.readFileSync(new URL('../research/tournament/protocol.json',import.meta.url)));
function synthetic(){
 const calendar=[];for(let i=0;i<220;i++){const d=new Date(Date.UTC(2020,0,1+i));if(![0,6].includes(d.getUTCDay()))calendar.push(d.toISOString().slice(0,10));}
 const bars=calendar.map((date,i)=>({date,open:10,high:11,low:9,close:10,rawClose:10,rawVolume:200000,volume:200000,dividend:0,splitAdjustmentFactor:1,totalReturnIndex:10+i/10}));
 return{calendar,securities:[{id:'A',ticker:'A',bars,fundamentals:[],listing:{active:true}}],benchmark:{bars:bars.map(b=>({...b,totalReturnIndex:10}))},spyBars:bars.map(b=>({...b,totalReturnIndex:10}))};
}
function cfg(data){return{...protocol,window:{...protocol.window,from:data.calendar[0],to:data.calendar.at(-1)},execution:{...protocol.execution,slippageBpsPerSide:0,commissionBpsPerSide:0}};}
test('formation after close executes next open, historical benchmark uses identical dates',()=>{
 const data=synthetic();let firstSignal=null;
 const method={id:'fixture',portfolioSemantics:{rebalance:'MONTHLY',targetWeightScope:'FULL_PORTFOLIO'},evaluate(ctx){if(!firstSignal)firstSignal=ctx.asOf;assert.ok(ctx.securities.every(s=>s.bars.every(b=>b.date<=ctx.asOf)));return{status:'READY',targets:[{id:'A',ticker:'A',weight:1}]};}};
 const r=runMethod(data,method,cfg(data));assert.equal(r.curve[0].exposure,0);assert.ok(r.signals.every(s=>!s.entryDate||s.entryDate>s.date));assert.ok(r.reconciliation.pass);assert.equal(benchmarkCurve(data,100).length,data.calendar.length);assert.ok(firstSignal);
});
test('forward horizon is session-count matched SPY excess and late signals censored',()=>{
 const data=synthetic(),signals=[{id:'A',date:data.calendar[21],forward:{}},{id:'A',date:data.calendar.at(-2),forward:{}}];populateForwardReturns(signals,data,cfg(data));assert.equal(signals[0].forward[21].endDate,data.calendar[42]);assert.equal(signals[0].forward[21].benchmarkReturn,0);assert.equal(signals[0].forward[21].excess,signals[0].forward[21].return);assert.equal(signals[1].forward[21].censored,true);
});
test('six cohorts preserve formation membership, explicit initial cash ramp',()=>{
 const data=synthetic(),method={id:'cohort',portfolioSemantics:{rebalance:'MONTHLY_FORMATION',targetWeightScope:'NEW_COHORT',cohortMonths:6,cohortCapitalFraction:1/6},evaluate:()=>({status:'READY',targets:[{id:'A',ticker:'A',weight:1}]})};const r=runMethod(data,method,cfg(data));const nonzero=r.curve.find(p=>p.exposure>0);assert.ok(Math.abs(nonzero.exposure-1/6)<1e-8);assert.ok(r.reconciliation.pass);
});
test('future market change cannot alter earlier regime',()=>{const data=synthetic(),date=data.calendar[130],p={...protocol,regimes:{...protocol.regimes,trendSmaSessions:100}};const a=marketRegime(data.benchmark.bars,date,p);data.benchmark.bars.push({date:'2030-01-01',close:999,totalReturnIndex:999});assert.deepEqual(marketRegime(data.benchmark.bars,date,p),a);});
test('current scan uses strict same-session rows and consensus eligible methods only',()=>{
 const data=synthetic(),date=data.calendar.at(-1),method={id:'m',portfolioSemantics:{rebalance:'MONTHLY'},evaluate:c=>({status:'READY',targets:c.securities.map(s=>({id:s.id,ticker:s.ticker,weight:1}))})};data.scanner=data.securities;const scan=currentScan(data,method,cfg(data),date);assert.equal(scan.numberMatches,1);assert.equal(currentConsensus([scan,{...scan,id:'other'}],['m']).length,0);assert.equal(currentConsensus([scan,{...scan,id:'other'}],['m','other'])[0].methodCount,2);
});
test('runner rejects a window outside freeze',()=>{const data=synthetic();data.calendar[0]='2010-01-01';assert.throws(()=>runMethod(data,{id:'x'},protocol,{measureSignals:false}),/WINDOW/);});
