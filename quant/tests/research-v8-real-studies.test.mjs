import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fit,select,evaluate,episodes}=require('../../scripts/quant/run-v8-real-studies.cjs');
test('V8 developmental callbacks fit train, select validation, retain all test opportunities',()=>{
 const model=fit([{ruleId:'TREND_UP',value:0.1},{ruleId:'TREND_DOWN',value:-0.1}]);assert.deepEqual(model.candidates,['CASH','TREND_UP']);
 assert.deepEqual(select(model,[{ruleId:'TREND_UP',value:-0.01}]),{rule:'CASH'});
 const fixed=select(model,[{ruleId:'TREND_UP',value:0.03}]);assert.deepEqual(fixed,{rule:'TREND_UP'});
 assert.deepEqual(evaluate(fixed,[{id:'a',ruleId:'TREND_UP',value:-0.2},{id:'b',ruleId:'TREND_DOWN',value:1}]),[{id:'a',value:-0.2},{id:'b',value:0}]);
});
test('V8 regime episodes count exact observed label dates; no date filling',()=>{
 const r=episodes([{date:'2020-01-02',state:'A'},{date:'2020-01-06',state:'A'},{date:'2020-01-07',state:'B'}],'state',[{signalDate:'2020-01-03',netReturn:9},{signalDate:'2020-01-06',netReturn:0.2}]);
 assert.equal(r.length,2);assert.equal(r[0].events,1);assert.equal(r[0].meanNetReturn,0.2);assert.equal(r[1].meanNetReturn,null);
});
