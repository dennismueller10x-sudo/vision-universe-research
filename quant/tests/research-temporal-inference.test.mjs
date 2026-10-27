import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const V = createRequire(import.meta.url)('../engines/research-validation.cjs');
const calendar = Array.from({length: 12}, (_, i) => `2020-01-${String(i + 1).padStart(2, '0')}`);
const config = {calendar, blockLength: 3, minimumBlockLength: 2, seed: 1729, replicates: 199, alpha: .05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING'};
const rows = calendar.flatMap((date, i) => [{id:`a${i}`,date,value:(i-5)/10},{id:`b${i}`,date,value:(i-5)/10}]);
test('calendar blocks preserve common-date dependence; duplicating instruments never halves uncertainty', () => {
 const a = V.inferTemporalBlockMean(config, rows), b = V.inferTemporalBlockMean(config, rows.filter(x=>x.id.startsWith('a')));
 assert.deepEqual(a.bootstrap, b.bootstrap); assert.deepEqual(a.ci, b.ci); assert.equal(a.pValue,b.pValue); assert.equal(a.effectiveN,null);
 assert.deepEqual(a,V.inferTemporalBlockMean(config,rows)); assert.equal(a.productionApproved,false);
});
test('zero returns produce zero interval and no false rejection', () => {
 const a=V.inferTemporalBlockMean(config,rows.map(x=>({...x,value:0}))); assert.deepEqual(a.ci,[0,0]); assert.equal(a.pValue,1);
});
test('inference rejects missing assumptions, duplicate IDs, short blocks, missing dates and unbounded work', () => {
 assert.throws(()=>V.inferTemporalBlockMean({...config,assumption:null},rows),/ASSUMPTION/);
 assert.throws(()=>V.inferTemporalBlockMean(config,[...rows,rows[0]]),/DUPLICATE/);
 assert.throws(()=>V.inferTemporalBlockMean({...config,minimumBlockLength:4},rows),/INTEGER/);
 assert.throws(()=>V.inferTemporalBlockMean(config,[{id:'x',date:'2021-01-01',value:1}]),/NOT_ON_CALENDAR/);
 assert.throws(()=>V.inferTemporalBlockMean({...config,calendar:[...calendar].reverse()},rows),/ORDERED/);
 assert.throws(()=>V.inferTemporalBlockMean(config,[]),/BUDGET/);
 assert.throws(()=>V.inferTemporalBlockMean({...config,seed:0},rows),/INTEGER/);
 const longCalendar=Array.from({length:1000},(_,i)=>new Date(Date.UTC(2000,0,i+1)).toISOString().slice(0,10));
 assert.throws(()=>V.inferTemporalBlockMean({...config,calendar:longCalendar,blockLength:1,minimumBlockLength:1,replicates:100000},rows),/OPERATION_BUDGET/);
 assert.throws(()=>V.inferTemporalBlockMean({...config,alpha:0},rows),/ALPHA/);
 assert.throws(()=>V.inferTemporalBlockMean(config,[{...rows[0],value:NaN}]),/INVALID_OBSERVATION/);
});
test('a sparse empty bootstrap sample fails rather than silently redrawing',()=>{
 assert.throws(()=>V.inferTemporalBlockMean({...config,blockLength:1,minimumBlockLength:1},[rows[0]]),/EMPTY_BOOTSTRAP/);
});
