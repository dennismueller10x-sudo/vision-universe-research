import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as frozen from '../research/certification/runner-v2.mjs';
import * as certified from '../research/calibration/runner-certified.mjs';
import {createBook, executeTargets} from '../research/certification/execution-audit-accounting.mjs';
import {historicalParticipants, prepareSourceFeatures} from '../research/tournament/methods.mjs';

const protocol=JSON.parse(fs.readFileSync(new URL('../research/tournament/protocol.json',import.meta.url),'utf8'));
const sourceSHA='9b2ae889295476d79c617d61c166d8293cbd468b0fe5eec03d1b3cde64644e67';
const guard="   if(!(Number.isFinite(entry.open)&&entry.open>0&&Number.isFinite(benchEntry.open)&&benchEntry.open>0)){s.forward[horizon]={censored:true,reason:'INVALID_EXECUTION_OPEN'};continue;}\n";

function smallFixture(){
 const calendar=['2020-01-02','2020-01-03','2020-01-06','2020-01-07','2020-01-08','2020-01-09','2020-01-10'];
 const stock=calendar.map((date,i)=>({date,open:i===1?15:10+i*2,close:10+i*2,rawClose:10+i*2,totalReturnIndex:20+i*4,dividend:0}));
 const benchmark=calendar.map((date,i)=>({date,open:i===1?104:100+i*4,close:100+i*4,totalReturnIndex:100+i*4,dividend:0}));
 return {calendar,securities:[{id:'SYNTHETIC_STOCK',ticker:'SYNTHETIC_STOCK',bars:stock,terminal:null}],benchmark:{bars:benchmark}};
}
const smallProtocol={...protocol,signals:{...protocol.signals,horizonsSessions:[1,3,5]}};
function signalsFor(data){return [{id:'SYNTHETIC_STOCK',date:data.calendar[0],forward:{}}];}
function outcomes(runner,data,scenario=protocol.delisting.baseline){const signals=signalsFor(data);runner.populateForwardReturns(signals,data,smallProtocol,undefined,scenario);return signals[0];}
function closeTo(actual,expected){assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);}

test('overlay is byte-derived from the pinned #632 runner with only import relocation and entry-open guard',()=>{
 const original=fs.readFileSync(new URL('../research/certification/runner-v2.mjs',import.meta.url),'utf8');
 const overlay=fs.readFileSync(new URL('../research/calibration/runner-certified.mjs',import.meta.url),'utf8');
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),sourceSHA);
 const anchor='   const terminal=security.terminal&&security.terminal.date>=entryDate&&security.terminal.date<=endDate?security.terminal:null;';
 assert.equal(original.split(anchor).length,2);
 const expected=original.replace("from './execution-audit-accounting.mjs'","from '../certification/execution-audit-accounting.mjs'")
  .replace("from './execution-audit.mjs'","from '../certification/execution-audit.mjs'").replace(anchor,guard+anchor);
 assert.equal(overlay,expected);
});

test('zero stock entry open reproduces uncensored nonfinite frozen outcome while frozen portfolio rejects execution',()=>{
 const data=smallFixture();data.securities[0].bars[1].open=0;
 const old=outcomes(frozen,data);
 assert.equal(old.forward[3].censored,false);assert.equal(Number.isFinite(old.forward[3].return),false);
 const book=createBook(protocol.execution.initialCapital),entryDate=data.calendar[1];
 executeTargets(book,[{id:'SYNTHETIC_STOCK',weight:1}],new Map([['SYNTHETIC_STOCK',data.securities[0].bars[1]]]),entryDate,protocol.execution,{asOf:data.calendar[0]});
 assert.equal(book.positions.size,0);assert.equal(book.fills.length,0);
 assert.deepEqual(book.rejections,[{id:'SYNTHETIC_STOCK',date:entryDate,reason:'NO_EXECUTABLE_OPEN'}]);
 const revised=outcomes(certified,data);
 for(const h of smallProtocol.signals.horizonsSessions)assert.deepEqual(revised.forward[h],{censored:true,reason:'INVALID_EXECUTION_OPEN'});
});

for(const side of ['stock','benchmark'])for(const [label,value] of [['zero',0],['negative',-1],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['null',null],['missing open',undefined]]){
 test(`${side} ${label} entry open is censored for every available horizon without return fields`,()=>{
  const data=smallFixture(),bars=side==='stock'?data.securities[0].bars:data.benchmark.bars;bars[1].open=value;
  const row=outcomes(certified,data);assert.equal(row.entryDate,data.calendar[1]);
  for(const h of smallProtocol.signals.horizonsSessions){assert.deepEqual(row.forward[h],{censored:true,reason:'INVALID_EXECUTION_OPEN'});assert.equal('return' in row.forward[h],false);assert.equal('excess' in row.forward[h],false);}
 });
}

test('valid gapped next-session opens preserve exact frozen outcomes and matched benchmark timestamps',()=>{
 const data=smallFixture(),a=outcomes(frozen,data),b=outcomes(certified,data);
 assert.deepEqual(b,a);assert.equal(b.entryDate,data.calendar[1]);assert.equal(b.forward[3].endDate,data.calendar[3]);
 closeTo(b.forward[1].return,12/15-1);closeTo(b.forward[3].return,16/15-1);
 closeTo(b.forward[3].benchmarkReturn,112/104-1);closeTo(b.forward[3].excess,16/15-112/104);
 assert.equal(b.forward[3].censored,false);
});

test('missing next-session stock or benchmark bar is not replaced by a later executable open',()=>{
 for(const side of ['stock','benchmark']){
  const data=smallFixture();(side==='stock'?data.securities[0].bars:data.benchmark.bars).splice(1,1);
  const a=outcomes(frozen,data),b=outcomes(certified,data);assert.deepEqual(b,a);assert.equal(b.entryDate,data.calendar[1]);
  for(const h of smallProtocol.signals.horizonsSessions)assert.deepEqual(b.forward[h],{censored:true,reason:'WINDOW_OR_ENTRY_UNAVAILABLE'});
 }
});

test('invalid next-session open cannot be deferred to a later valid session',()=>{
 const data=smallFixture();data.securities[0].bars[1].open=0;assert.ok(data.securities[0].bars[2].open>0);
 const row=outcomes(certified,data);assert.equal(row.entryDate,data.calendar[1]);assert.equal(row.forward[3].reason,'INVALID_EXECUTION_OPEN');
});

test('original window and nonterminal end-price-gap censoring reasons retain precedence',()=>{
 const data=smallFixture();data.securities[0].bars.splice(3,1);
 assert.deepEqual(outcomes(certified,data),outcomes(frozen,data));assert.equal(outcomes(certified,data).forward[3].reason,'PRICE_DATA_GAP');
 const signals=[{id:'SYNTHETIC_STOCK',date:data.calendar.at(-1),forward:{}}];
 certified.populateForwardReturns(signals,data,smallProtocol);
 for(const h of smallProtocol.signals.horizonsSessions)assert.deepEqual(signals[0].forward[h],{censored:true,reason:'WINDOW_OR_ENTRY_UNAVAILABLE'});
});

test('guard validates entry opens only; irrelevant formation and exit opens do not change valid outcomes',()=>{
 const data=smallFixture();data.securities[0].bars[0].open=0;data.benchmark.bars[0].open=NaN;
 data.securities[0].bars[3].open=0;data.benchmark.bars[3].open=Infinity;
 assert.deepEqual(outcomes(certified,data),outcomes(frozen,data));assert.equal(outcomes(certified,data).forward[3].censored,false);
});

test('valid-entry terminal acquisition/distress/scenario and quarantine outcomes retain exact frozen semantics',()=>{
 for(const kind of ['UNKNOWN','ACQUISITION','DATA_QUARANTINE'])for(const scenario of [protocol.delisting.baseline,...protocol.delisting.sensitivity]){
  const data=smallFixture();data.securities[0].bars=data.securities[0].bars.slice(0,3);
  data.securities[0].bars.at(-1).rawClose=.5;
  data.securities[0].terminal={date:data.calendar[2],kind:kind==='DATA_QUARANTINE'?kind:'DELISTING',delistClass:kind};
  assert.deepEqual(outcomes(certified,data,scenario),outcomes(frozen,data,scenario),`${kind}/${scenario}`);
 }
});

function methodFixture(){
 const dates=[];let day=new Date('2017-01-02T00:00:00Z');
 while(dates.length<1020){if(![0,6].includes(day.getUTCDay()))dates.push(day.toISOString().slice(0,10));day=new Date(+day+86400000);}
 const bars=seed=>dates.map((date,i)=>{const close=20+seed+i*.035+Math.sin(i/11)*.1;return {date,open:close*.999,high:close*1.006,low:close*.994,close,rawOpen:close*.999,rawHigh:close*1.006,rawLow:close*.994,rawClose:close,rawVolume:1000000,volume:1000000,dividend:0,splitFactor:1,splitAdjustmentFactor:1,totalReturnIndex:close};});
 const securities=Array.from({length:4},(_,i)=>({id:`SYNTHETIC_${i}`,ticker:`SYNTHETIC_${i}`,bars:bars(i),fundamentals:[],listing:{startDate:dates[0],endDate:null,active:true},terminal:null}));
 const benchmark={bars:bars(5)};
 return prepareSourceFeatures({securities,benchmark,spyBars:benchmark.bars,calendar:dates.filter(d=>d>='2018-01-02'),window:protocol.window});
}

test('all six frozen methods retain full valid-input runMethod, signal, portfolio and sensitivity parity',()=>{
 assert.equal(historicalParticipants.length,6);
 for(const method of historicalParticipants){
  assert.deepEqual(certified.runMethod(methodFixture(),method,protocol),frozen.runMethod(methodFixture(),method,protocol),method.id);
 }
 const method=historicalParticipants[0];
 for(const options of [{costMultiplier:2},{scenario:'DISTRESS_ZERO_OTHER_MINUS_30'},{measureSignals:false}]){
  assert.deepEqual(certified.runMethod(methodFixture(),method,protocol,options),frozen.runMethod(methodFixture(),method,protocol,options));
 }
});
