import test from 'node:test';
import assert from 'node:assert/strict';
import {runReferencePortfolio} from '../research/calibration/portfolio-calibration-v3.mjs';
import {portfolioMetrics} from '../research/tournament/metrics.mjs';
import {reviewConstruction} from '../research/calibration/numeric-review-v3.mjs';
function dates(from,to){const a=[];for(let d=new Date(from+'T00:00:00Z');d.toISOString().slice(0,10)<=to;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()!==0&&d.getUTCDay()!==6)a.push(d.toISOString().slice(0,10));return a;}
const history=dates('2014-12-31','2018-02-28'),measurement=history.filter(d=>d>='2018-01-02');
const protocol={window:{from:'2018-01-02',to:'2018-02-28'},execution:{timing:'NEXT_SESSION_OPEN',initialCapital:100000,slippageBpsPerSide:10,commissionBpsPerSide:1,cashReturn:0,shorting:false,leverage:false},delisting:{baseline:'UNKNOWN_PROCEEDS_MINUS_30_PERCENT',sensitivity:['LAST_OBSERVED_PRICE','DISTRESS_ZERO_OTHER_MINUS_30']}};
const data=(n=20)=>({calendar:measurement,benchmark:{bars:history.map(date=>({date,open:10,close:10,totalReturnIndex:1}))},securities:Array.from({length:n},(_,i)=>({id:'S'+String(i).padStart(3,'0'),ticker:'SYN'+i,bars:history.map((date,j)=>{const close=10+(i+1)*j/10000,open=close*(1+((i+j)%5-2)/1000);return{date,open,close,totalReturnIndex:close/10,rawClose:close,dividend:i%3===0&&j%40===0?0.01:0};})}))});
function build(costMode='SAME_TOURNAMENT_NET'){
 const d=data(),run=runReferencePortfolio(d,'CALIB_JT6_6_NO_SKIP',protocol,{costMode});
 const metrics=Object.fromEntries(['top','bottom'].map(k=>[k,portfolioMetrics(run[k].curve,{initialCapital:100000,turnover:run[k].turnover,trades:run[k].trades,executionCosts:run[k].executionCosts})]));
 return{d,run,metrics,costMode};
}
test('review passes an untouched construction in both cost modes',()=>{
 for(const cm of ['SOURCE_GROSS','SAME_TOURNAMENT_NET']){
  const {d,run,metrics}=build(cm),r=reviewConstruction({run,metrics,data:d,protocol,costMode:cm,methodId:'x'});
  assert.equal(r.status,'PASS',JSON.stringify(r.books.map(b=>b.failedHardChecks)));assert.ok(r.books[0].checks.length>=10);
 }
});
test('review detects a tampered fill price, a shifted fill date and a falsified curve',()=>{
 let {d,run,metrics}=build();run.top.fills[0].price*=1.01;
 assert.ok(reviewConstruction({run,metrics,data:d,protocol,costMode:'SAME_TOURNAMENT_NET'}).books[0].failedHardChecks.includes('R4_FILL_PRICES_EQUAL_SESSION_OPEN_PLUS_SLIPPAGE'));
 ({d,run,metrics}=build());run.top.fills[0].date=measurement[3];
 assert.ok(reviewConstruction({run,metrics,data:d,protocol,costMode:'SAME_TOURNAMENT_NET'}).books[0].failedHardChecks.includes('R5_EVERY_ORDER_FILLS_ON_FIRST_SESSION_AFTER_A_FORMATION_DATE'));
 ({d,run,metrics}=build());run.top.curve.at(-1).equity*=1.001;
 const f=reviewConstruction({run,metrics,data:d,protocol,costMode:'SAME_TOURNAMENT_NET'}).books[0].failedHardChecks;
 assert.ok(f.includes('R1_METRICS_REDERIVED_FROM_CURVE')&&f.includes('R8_FINAL_EQUITY_REPLAYED_FROM_FILLS_DIVIDENDS_AND_ENDING_POSITIONS'));
});
test('review output carries no security ids',()=>{
 const {d,run,metrics}=build(),s=JSON.stringify(reviewConstruction({run,metrics,data:d,protocol,costMode:'SAME_TOURNAMENT_NET'}));assert.equal(/S0\d\d|SYN/.test(s),false);
});
test('review passes books with delistings, acquisitions, distress, data-quarantine without a source bar, gaps and an absurd price level',()=>{
 const hist=dates('2014-12-31','2018-03-30'),meas=hist.filter(d=>d>='2018-01-02'),proto={...protocol,window:{from:'2018-01-02',to:'2018-03-30'}};
 const bars=(i,upto)=>hist.filter(d=>!upto||d<=upto).map((date,j)=>{const c=10+(i+1)*j/10000,o=c*(1+((i+j)%5-2)/1000);return{date,open:o,close:c,totalReturnIndex:c/10,rawClose:c,dividend:i%3===0&&j%40===0?0.01:0};});
 const secs=Array.from({length:20},(_,i)=>({id:'S'+String(i).padStart(3,'0'),ticker:'SYN'+i,bars:bars(i)}));
 secs[0].bars=bars(0,meas[30]);secs[0].terminal={date:meas[30],kind:'DELISTING',delistClass:'UNKNOWN',lastClose:secs[0].bars.at(-1).close};
 secs[1].bars=bars(1,hist[hist.indexOf(meas[20])-1]);secs[1].terminal={date:meas[20],kind:'DATA_QUARANTINE',lastClose:secs[1].bars.at(-1).close};
 secs[2].bars=bars(2,meas[40]);secs[2].terminal={date:meas[40],kind:'DELISTING',delistClass:'ACQUISITION',lastClose:secs[2].bars.at(-1).close};
 secs[3].bars=bars(3,meas[44]).map(b=>({...b,rawClose:0.5}));secs[3].terminal={date:meas[44],kind:'DELISTING',delistClass:'UNKNOWN',lastClose:secs[3].bars.at(-1).close,trailingRawReturn60:-0.6};
 secs[4].bars=bars(4).map(b=>({...b,open:b.open*2e10,close:b.close*2e10}));secs[5].bars=bars(5).filter((b,j)=>j%11!==5);
 const d={calendar:meas,benchmark:{bars:hist.map(date=>({date,open:10,close:10,totalReturnIndex:1}))},securities:secs};
 for(const [mid,cm] of [['CALIB_EQUAL_WEIGHT','SOURCE_GROSS'],['CALIB_EQUAL_WEIGHT','SAME_TOURNAMENT_NET'],['CALIB_JT6_6_NO_SKIP','SAME_TOURNAMENT_NET'],['CALIB_GH52WH','SOURCE_GROSS']]){
  const run=runReferencePortfolio(d,mid,proto,{costMode:cm}),metrics=Object.fromEntries(['top','bottom'].filter(k=>run[k]).map(k=>[k,portfolioMetrics(run[k].curve,{initialCapital:100000,turnover:run[k].turnover,trades:run[k].trades,executionCosts:run[k].executionCosts})]));
  const r=reviewConstruction({run,metrics,data:d,protocol:proto,costMode:cm,methodId:mid});assert.equal(r.status,'PASS',mid+cm+JSON.stringify(r.books.map(b=>b.failedHardChecks)));
 }
});
test('review fails a quarantine fill that is not priced at the frozen last close',()=>{
 const hist=dates('2014-12-31','2018-03-30'),meas=hist.filter(d=>d>='2018-01-02'),proto={...protocol,window:{from:'2018-01-02',to:'2018-03-30'}};
 const bars=(i,upto)=>hist.filter(d=>!upto||d<=upto).map((date,j)=>{const c=10+(i+1)*j/10000;return{date,open:c,close:c,totalReturnIndex:c/10,rawClose:c,dividend:0};});
 const secs=Array.from({length:10},(_,i)=>({id:'S'+String(i).padStart(3,'0'),ticker:'SYN'+i,bars:bars(i)}));
 secs[1].bars=bars(1,hist[hist.indexOf(meas[20])-1]);secs[1].terminal={date:meas[20],kind:'DATA_QUARANTINE',lastClose:secs[1].bars.at(-1).close};
 const d={calendar:meas,benchmark:{bars:hist.map(date=>({date,open:10,close:10,totalReturnIndex:1}))},securities:secs};
 const run=runReferencePortfolio(d,'CALIB_EQUAL_WEIGHT',proto,{costMode:'SOURCE_GROSS'});const f=run.top.fills.find(x=>x.reason==='TERMINAL_SCENARIO');f.price*=1.2;
 const metrics={top:portfolioMetrics(run.top.curve,{initialCapital:100000,turnover:run.top.turnover,trades:run.top.trades,executionCosts:run.top.executionCosts})};
 assert.ok(reviewConstruction({run,metrics,data:d,protocol:proto,costMode:'SOURCE_GROSS'}).books[0].failedHardChecks.includes('R4c_QUARANTINE_TERMINAL_FILL_PRICE_IS_FROZEN_LAST_CLOSE_TIMES_SCENARIO_FACTOR'));
});
