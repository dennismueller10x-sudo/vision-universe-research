import test from 'node:test';
import assert from 'node:assert/strict';
import {runReferencePortfolio} from '../research/calibration/portfolio-calibration-v3.mjs';
import {createGapTracker} from '../research/calibration/diagnose-reconciliation-v3.mjs';
function dates(from,to){const a=[];for(let d=new Date(from+'T00:00:00Z');d.toISOString().slice(0,10)<=to;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()!==0&&d.getUTCDay()!==6)a.push(d.toISOString().slice(0,10));return a;}
const history=dates('2014-12-31','2018-02-28'),measurement=history.filter(d=>d>='2018-01-02');
const protocol={window:{from:'2018-01-02',to:'2018-02-28'},execution:{timing:'NEXT_SESSION_OPEN',initialCapital:100,slippageBpsPerSide:10,commissionBpsPerSide:1,cashReturn:0,shorting:false,leverage:false},delisting:{baseline:'UNKNOWN_PROCEEDS_MINUS_30_PERCENT',sensitivity:['LAST_OBSERVED_PRICE','DISTRESS_ZERO_OTHER_MINUS_30']}};
const data=(n=20)=>({calendar:measurement,benchmark:{bars:history.map(date=>({date,open:10,close:10,totalReturnIndex:1}))},securities:Array.from({length:n},(_,i)=>({id:'S'+String(i).padStart(3,'0'),ticker:'SYN'+i,bars:history.map((date,j)=>{const close=10+(i+1)*j/10000;return{date,open:close,close,totalReturnIndex:close/10,rawClose:close,dividend:i%3===0&&j%40===0?0.01:0};})}))});
test('daily gap hook changes nothing and reports a zero gap for a consistent book',()=>{
 const plain=runReferencePortfolio(data(),'CALIB_JT6_6_NO_SKIP',protocol);
 const tracker=createGapTracker();
 const hooked=runReferencePortfolio(data(),'CALIB_JT6_6_NO_SKIP',protocol,{onDayClose:tracker.hook});
 assert.deepEqual(hooked.top.curve,plain.top.curve);assert.deepEqual(hooked.bottom.curve,plain.bottom.curve);
 const s=tracker.summarize();
 assert.equal(s.top.days,measurement.length);assert.ok(Math.abs(s.top.finalGap)<1e-9);assert.equal(s.top.firstDayAboveTolerance,null);
 assert.ok(JSON.stringify(s).includes('SYN')===false&&JSON.stringify(s).includes('S00')===false);
});
test('a corrupted book is located on the exact day with its event class',()=>{
 const tracker=createGapTracker({legs:['top']});
 const bad=({leg,date,book,bars,terminals})=>{if(leg==='top'&&date==='2018-01-10'&&book.positions.size){const p=[...book.positions.values()][0];p.cost+=5;}tracker.hook({leg,date,book,bars,terminals});};
 try{runReferencePortfolio(data(),'CALIB_JT6_6_NO_SKIP',protocol,{onDayClose:bad});}catch(e){assert.equal(e.message,'REFERENCE_BOOK_RECONCILIATION_FAILED');assert.ok(e.bookTrace);}
 const s=tracker.summarize().top;assert.equal(s.firstDayAboveTolerance?.date,'2018-01-10');assert.ok(Math.abs(s.largestGapChanges[0].delta)>4.9);
});
