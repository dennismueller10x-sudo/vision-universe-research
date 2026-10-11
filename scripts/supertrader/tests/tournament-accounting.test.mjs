import test from 'node:test';
import assert from 'node:assert/strict';
import{createBook,executeTargets,creditDividends,markClose,settleTerminals,reconcileBook}from '../research/tournament/accounting.mjs';
const zero={slippageBpsPerSide:0,commissionBpsPerSide:0};
const bars=(open,close=open,dividend=0)=>new Map([['A',{date:'2020-01-02',open,close,rawClose:close,dividend}]]);
test('next-open fills never use the execution-day close and satisfy cash conservation',()=>{
 const b=createBook(100);executeTargets(b,[{id:'A',ticker:'A',weight:1}],bars(10,1000),'2020-01-02',zero,{asOf:'2020-01-01'});
 assert.equal(b.positions.get('A').shares,10);markClose(b,bars(10,1000),'2020-01-02');assert.equal(b.curve[0].equity,10000);assert.ok(reconcileBook(b).pass);
 assert.throws(()=>executeTargets(b,[],bars(10),'2020-01-02',zero,{asOf:'2020-01-02'}));
});
test('ex-date dividend credits yesterday holdings and no newly purchased shares',()=>{
 const b=createBook(100);creditDividends(b,bars(10,10,1));executeTargets(b,[{id:'A',ticker:'A',weight:1}],bars(10,10,1),'2020-01-02',zero,{asOf:'2020-01-01'});assert.equal(b.dividends,0);
 creditDividends(b,bars(9,9,1));markClose(b,bars(9),'2020-01-03');assert.equal(b.dividends,10);assert.equal(b.curve[0].equity,100);assert.ok(reconcileBook(b).pass);
});
test('costs apply once and simultaneous purchases share cash proportionately',()=>{
 const b=createBook(100),m=new Map([['A',{date:'2020-01-02',open:10,close:10}],['B',{date:'2020-01-02',open:20,close:20}]]),cfg={slippageBpsPerSide:10,commissionBpsPerSide:1};
 executeTargets(b,[{id:'A',weight:.5},{id:'B',weight:.5}],m,'2020-01-02',cfg,{asOf:'2020-01-01'});assert.ok(b.cash>=0);assert.ok(Math.abs(b.positions.get('A').cost-50)<1e-8);assert.ok(Math.abs(b.positions.get('B').cost-50)<1e-8);markClose(b,m,'2020-01-02');assert.ok(reconcileBook(b).pass);assert.ok(b.curve[0].equity<100);
});
test('Turtle stop initialized from actual fill and pre-signal distance, no day-low input',()=>{
 const b=createBook(100);executeTargets(b,[{id:'A',weight:1,initialStopDistance:2}],bars(12),'2020-01-02',zero,{asOf:'2020-01-01',stateful:true});assert.equal(b.positions.get('A').stop,10);
});
test('known stop above gapped execution fill fails closed',()=>{
 const b=createBook(100);executeTargets(b,[{id:'A',weight:1,stopLevel:11}],bars(10),'2020-01-02',zero,{asOf:'2020-01-01'});assert.equal(b.positions.size,0);assert.equal(b.rejections[0].reason,'ENTRY_STOP_NOT_BELOW_FILL');
});
test('partial exits retain basis and dividends; terminal scenario accounting reconciles',()=>{
 const b=createBook(100);executeTargets(b,[{id:'A',weight:1}],bars(10),'2020-01-02',zero,{asOf:'2020-01-01'});creditDividends(b,bars(12,12,1));
 executeTargets(b,[{id:'A',weight:1}],new Map([['A',{date:'2020-01-03',open:12,close:12}]]),'2020-01-03',zero,{asOf:'2020-01-02',stateful:true,signals:[{id:'A',sellFraction:.5}]});assert.equal(b.positions.get('A').shares,5);
 settleTerminals(b,new Map([['A',{date:'2020-01-03',open:12,close:12,rawClose:12}]]),[{id:'A',date:'2020-01-03',delistClass:'UNKNOWN'}],'2020-01-03',zero,'UNKNOWN_PROCEEDS_MINUS_30_PERCENT');markClose(b,bars(12),'2020-01-03');assert.equal(b.positions.size,0);assert.ok(reconcileBook(b).pass);
});
test('missing opens cannot fabricate a trade; explicit weights and leverage isolation',()=>{
 const b=createBook(100);executeTargets(b,[{id:'A',weight:1}],new Map(),'2020-01-02',zero,{asOf:'2020-01-01'});assert.equal(b.positions.size,0);
 assert.throws(()=>executeTargets(b,[{id:'A'}],bars(10),'2020-01-02',zero,{asOf:'2020-01-01'}));assert.throws(()=>executeTargets(b,[{id:'A',weight:1.1}],bars(10),'2020-01-02',zero,{asOf:'2020-01-01'}));
});
test('stale or nonfinite execution opens cannot produce a next-session fill',()=>{
 const b=createBook(100);executeTargets(b,[{id:'A',weight:1}],bars(10),'2020-01-03',zero,{asOf:'2020-01-02'});assert.equal(b.positions.size,0);
 executeTargets(b,[{id:'A',weight:1}],new Map([['A',{date:'2020-01-03',open:NaN,close:10}]]),'2020-01-03',zero,{asOf:'2020-01-02'});assert.equal(b.positions.size,0);
});
test('actual slipped fill passes method validator and can be rejected before allocation',()=>{
 const b=createBook(100);let observed=null;executeTargets(b,[{id:'A',weight:1}],bars(10),'2020-01-02',{slippageBpsPerSide:10,commissionBpsPerSide:1},{asOf:'2020-01-01',validateEntryFill:(_,fill)=>{observed=fill;return{accepted:false};}});assert.equal(observed,10.009999999999998);assert.equal(b.positions.size,0);
});
