import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import{runMethod,populateForwardReturns,marketRegime,currentConsensus,currentScan,benchmarkCurve,formationContext,statefulSetupCensus}from '../research/tournament/runner.mjs';
import{createBook}from '../research/tournament/accounting.mjs';
import{LEGENDARY_METHODS,evaluateTurtle}from '../research/tournament/engines/legendary.mjs';
import{kullamagiMethods}from '../research/tournament/engines/kullamagi.mjs';
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

function turtleSetups(count=12){
 const calendar=[];let date=new Date('2020-01-02T00:00:00Z');
 while(calendar.length<57){if(![0,6].includes(date.getUTCDay()))calendar.push(date.toISOString().slice(0,10));date.setUTCDate(date.getUTCDate()+1);}
 const makeBars=()=>calendar.map((date,i)=>{const close=i<55?100:100+3*(i-54);return{date,open:close,high:close+1,low:close-1,close,rawClose:close,rawVolume:200000,volume:200000,dividend:0,splitAdjustmentFactor:1,totalReturnIndex:close};});
 return{calendar,securities:Array.from({length:count},(_,i)=>({id:`S${String(i).padStart(2,'0')}`,ticker:`S${i}`,bars:makeBars(),fundamentals:[],listing:{active:true}})),benchmark:{bars:makeBars().map(b=>({...b,open:100,high:101,low:99,close:100,totalReturnIndex:100}))}};
}
function fullBook(data){
 const book=createBook(100000);book.cash=0;
 for(const s of data.securities.slice(0,10))book.positions.set(s.id,{id:s.id,ticker:s.ticker,shares:100,cost:10000,dividends:0,entryPrice:100,entryDate:data.calendar[0],stop:99,entryN:2,partialDone:false});
 return book;
}

test('held common-floor failures stay out of academic formations while stateful exit management keeps them',()=>{
 const data=turtleSetups(1),date=data.calendar.at(-1),book=fullBook(data),stock=data.securities[0];
 stock.bars.at(-1).close=4;stock.bars.at(-1).rawClose=4;stock.bars.at(-1).high=5;stock.bars.at(-1).low=3;
 const academic={id:'cross_sectional_momentum',portfolioSemantics:{targetWeightScope:'NEW_COHORT',rebalance:'MONTHLY_FORMATION'}};
 assert.equal(formationContext(data,academic,date,book,cfg(data)).securities.length,0);
 const stateful=formationContext(data,LEGENDARY_METHODS[0],date,book,cfg(data));
 assert.equal(stateful.securities.length,1);
 assert.equal(evaluateTurtle(stateful).signals[0].action,'EXIT');
 assert.equal(statefulSetupCensus(data,LEGENDARY_METHODS[0],stateful,cfg(data)).setups.length,0);
});

test('portfolio-independent Turtle census counts every eligible setup beyond full-book and ten-slot capacity',()=>{
 const data=turtleSetups(),date=data.calendar.at(-1),method=LEGENDARY_METHODS[0],p=cfg(data),book=fullBook(data);
 const flat=formationContext(data,method,date,null,p),held=formationContext(data,method,date,book,p);
 const flatResult=method.evaluate(flat),heldResult=method.evaluate(held);
 assert.equal(flatResult.targets.length,10);assert.equal(heldResult.signals.filter(s=>s.reason==='VU_PORTFOLIO_CAP').length,2);
 const fromFlat=statefulSetupCensus(data,method,flat,p),fromHeld=statefulSetupCensus(data,method,held,p);
 assert.equal(fromFlat.setups.length,12);assert.deepEqual(fromHeld.setups,fromFlat.setups);
 assert.ok(fromFlat.setups.every(s=>s.ruleTrace.decision==='ENTRY_CANDIDATE'&&s.setupOnly));
 book.positions.values().next().value.stop=-1;
 const malformedHeld=formationContext(data,method,date,book,p);
 assert.equal(method.evaluate(malformedHeld).status,'DATA_GAP');
 assert.equal(statefulSetupCensus(data,method,malformedHeld,p).setups.length,12);
});

test('invalid source N and invalid stop-distance traces never enter the setup census',()=>{
 const data=turtleSetups(2),date=data.calendar.at(-1),method=LEGENDARY_METHODS[0];
 data.securities[0].bars.forEach(b=>{b.high=100;b.low=100;b.close=100;b.rawClose=100;});
 data.securities[1].bars.forEach((b,i)=>{b.high=i<56?200:301;b.low=i<56?1:299;b.close=i<56?100:300;b.rawClose=b.close;});
 const context=formationContext(data,method,date,null,cfg(data)),census=statefulSetupCensus(data,method,context,cfg(data));
 assert.equal(census.setups.length,0);
 assert.ok(census.result.ruleTrace.some(t=>t.reason==='INVALID_TURTLE_N'));
 assert.ok(census.result.ruleTrace.some(t=>t.decision==='REJECT_INVALID_STOP_DISTANCE'));
});

test('historical setup signals are cost and holding independent while actual execution still caps positions',()=>{
 const data=turtleSetups(),method=LEGENDARY_METHODS[0],p=cfg(data);
 const measured=runMethod(data,method,p),portfolioOnly=runMethod(data,method,p,{measureSignals:false});
 assert.deepEqual(measured.curve,portfolioOnly.curve);assert.deepEqual(measured.trades,portfolioOnly.trades);
 assert.equal(measured.endingPositions.length,10);
 assert.equal(measured.signals.filter(s=>s.date===data.calendar.at(-2)).length,12);
 assert.equal(measured.signals.filter(s=>s.date===data.calendar.at(-1)).length,12);
 const costly=runMethod(data,method,{...p,execution:{...p.execution,slippageBpsPerSide:200,commissionBpsPerSide:100}});
 assert.deepEqual(costly.signals,measured.signals);
 assert.equal(measured.signalCensus.basis,'PORTFOLIO_INDEPENDENT_COMMON_ELIGIBLE_SETUP');
 const heldFailure={...method,evaluate:context=>context.positions.length?{status:'DATA_GAP',targets:[],signals:[],ruleTrace:[]}:method.evaluate(context)};
 const blocked=runMethod(data,heldFailure,p);
 assert.equal(blocked.blockedFormations,1);
 assert.equal(blocked.signals.filter(s=>s.date===data.calendar.at(-1)).length,12);
});

test('current stateful matches include cap-rejected source setups without invented weight or score',()=>{
 const data=turtleSetups(),scan=currentScan(data,LEGENDARY_METHODS[0],cfg(data),data.calendar.at(-1));
 assert.equal(scan.numberMatches,12);assert.equal(scan.portfolioAdmittedMatches,10);
 const raw=scan.candidates.filter(c=>c.portfolioAdmission==='SOURCE_SETUP_ONLY');
 assert.equal(raw.length,2);assert.ok(raw.every(c=>c.weight===null&&c.score===null&&c.portfolioTarget===null&&c.reason.decision==='ENTRY_CANDIDATE'));
 assert.ok(scan.candidates.filter(c=>c.portfolioAdmission==='CAP_SELECTED').every(c=>c.portfolioTarget&&c.weight>0));
 assert.equal(currentConsensus([scan,{...scan,id:'independent-fixture'}],[scan.id,'independent-fixture']).length,12);
});

test('Kullamagi ENTER and REJECT_PORTFOLIO_CAP traces both count as current source setups',()=>{
 const data=turtleSetups(600),calendar=[];let d=new Date('2020-01-02T00:00:00Z');
 while(calendar.length<202){if(![0,6].includes(d.getUTCDay()))calendar.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}
 const bars=calendar.map((date,j)=>{const i=j-74;let close=i<0?50:50+i*.5,range=1;
  if(i>=107&&i<127){close=104+(i-107)*.1;range=i<112?2:i>=122?.5:1;}
  if(i===127)return{date,open:106.5,close:107,high:108,low:106.1,rawClose:107,rawVolume:1000000,volume:1000000,dividend:0,splitAdjustmentFactor:1,totalReturnIndex:107};
  return{date,open:close,close,high:close+range,low:close-range,rawClose:close,rawVolume:1000000,volume:1000000,dividend:0,splitAdjustmentFactor:1,totalReturnIndex:close};});
 data.calendar=calendar;data.securities.forEach(s=>s.bars=bars);data.benchmark={bars};
 const scan=currentScan(data,kullamagiMethods[0],cfg(data),calendar.at(-1));
 assert.equal(scan.numberMatches,12);assert.equal(scan.portfolioAdmittedMatches,10);
 assert.equal(scan.candidates.filter(c=>c.reason.decision==='ENTER').length,10);
 assert.equal(scan.candidates.filter(c=>c.reason.decision==='REJECT_PORTFOLIO_CAP'&&c.weight===null).length,2);
 const context=formationContext(data,kullamagiMethods[0],calendar.at(-1),null,cfg(data)),census=statefulSetupCensus(data,kullamagiMethods[0],context,cfg(data));
 assert.deepEqual(scan.candidates.map(c=>c.id),census.setups.map(s=>s.id));
 assert.equal(census.result.targets.length,10);
});

test('Weinstein census retains cap-rejected setups while respecting its known-prefix market gate',()=>{
 const data=turtleSetups(),calendar=[];let d=new Date('2020-01-02T00:00:00Z');
 while(calendar.length<171){if(![0,6].includes(d.getUTCDay()))calendar.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}
 const rows=(market=false)=>calendar.map((date,i)=>{const close=market?100+i*.01:i===170?105.4:100+i*.02,volume=!market&&i===170?500000:200000;return{date,open:close,high:close+1,low:close-1,close,rawClose:close,rawVolume:volume,volume,dividend:0,splitAdjustmentFactor:1,totalReturnIndex:close};});
 data.calendar=calendar;data.securities.forEach(s=>s.bars=rows());data.benchmark={bars:rows(true)};
 const method=LEGENDARY_METHODS[1],asOf=calendar.at(-1),p=cfg(data),context=formationContext(data,method,asOf,null,p),census=statefulSetupCensus(data,method,context,p),scan=currentScan(data,method,p,asOf);
 assert.equal(census.setups.length,12);assert.equal(census.result.targets.length,10);
 assert.ok(census.setups.every(s=>s.ruleTrace.decision==='ENTRY_CANDIDATE'));
 assert.deepEqual(scan.candidates.map(c=>c.id),census.setups.map(s=>s.id));
 assert.equal(scan.numberMatches,12);assert.ok(scan.candidates.every(c=>c.regimeCompatibility==='ENGINE_MARKET_GATE'));
 data.benchmark.bars.at(-1).close=100;
 assert.equal(currentScan(data,method,p,asOf).numberMatches,0);
});
