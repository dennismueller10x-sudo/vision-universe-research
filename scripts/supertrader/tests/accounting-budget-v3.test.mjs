import test from 'node:test';
import assert from 'node:assert/strict';
import * as V2 from '../research/calibration/accounting-budget-v2.mjs';
import * as V3 from '../research/calibration/accounting-budget-v3.mjs';
const cfg={initialCapital:100000,slippageBpsPerSide:0,commissionBpsPerSide:0};
const bar=(date,price)=>({date,open:price,close:price,rawClose:price,dividend:0});
function run(A,price){
 const book=A.createBook(100000),id='X';
 const d1=new Map([[id,bar('2021-03-31',price)]]);
 A.executeTargets(book,[{id,ticker:'X',weight:0.5}],d1,'2021-03-31',cfg,{asOf:'2021-03-30'});A.markClose(book,d1,'2021-03-31',0);
 const d2=new Map([[id,bar('2021-04-01',price)]]);
 // target lowered so that the remaining shares fall below the 1e-10 share threshold
 A.executeTargets(book,[{id,ticker:'X',weight:1.9e-4*1e5/book.initialCapital}],d2,'2021-04-01',cfg,{asOf:'2021-03-31'});A.markClose(book,d2,'2021-04-01',0);
 return book;
}
test('v2 leaks the residual of a share-dust deletion at an absurd price; v3 books it and reconciles',()=>{
 const b2=run(V2,2e11),b3=run(V3,2e11);
 assert.equal(b2.positions.size,0);assert.equal(V2.reconcileBook(b2).pass,false);assert.ok(V2.reconcileBook(b2).absoluteDifference>10);
 const r3=V3.reconcileBook(b3);assert.equal(r3.pass,true);assert.equal(r3.dustWriteOffs.count,1);assert.ok(r3.dustWriteOffs.netBookedCost>10);
 // economics are bit-identical: same cash, same curve, same trades
 assert.equal(b3.cash,b2.cash);assert.deepEqual(b3.curve,b2.curve);assert.deepEqual(b3.trades,b2.trades);
});
test('v3 does not change an ordinary-price book and keeps the unchanged tolerance',()=>{
 const b2=run(V2,100),b3=run(V3,100);
 assert.deepEqual(b3.curve,b2.curve);assert.equal(V3.reconcileBook(b3).pass,true);assert.equal(V2.reconcileBook(b2).pass,true);
 const r=V3.reconcileBook(b3);assert.equal(r.dustWriteOffs.count,0);
 const bad=run(V3,100);bad.trades[0].pnl+=1;assert.equal(V3.reconcileBook(bad).pass,false);
});
test('ordinary full closes are not recorded as dust write-offs; only real residuals are',()=>{
 const b=run(V3,100);assert.equal(V3.reconcileBook(b).dustWriteOffs.count,0);
 const d=run(V3,2e11);assert.equal(V3.reconcileBook(d).dustWriteOffs.count,1);
});
test('serializeLarge is JSON-equivalent and chunk-safe',async()=>{
 const {serializeLarge}=await import('../research/calibration/run-calibration-v3.mjs');
 const v={a:[...Array(2500)].map((_,i)=>({i,x:'y'.repeat(i%7),n:null})),b:{c:[1,2,[3,{d:undefined,e:1}]],f:'z'},g:undefined,h:[]};
 assert.deepEqual(JSON.parse(serializeLarge(v).toString()),JSON.parse(JSON.stringify(v)));
 assert.equal(serializeLarge([]).toString(),'[]');assert.equal(serializeLarge({}).toString(),'{}');
});
