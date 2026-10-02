import test from 'node:test';import assert from 'node:assert/strict';
import {mergeTechnicalProjection} from '../../scripts/market/tiingo2-product-surfaces.mjs';
test('incremental technical publication preserves unrelated histories and replaces scoped unavailable state',()=>{
 const baseline={schemaVersion:'existing',instruments:{AAPL:{id:'unchanged'},DNA:{id:'stale'}},unavailable:{FIG:{reason:'SHORT'},AMWL:{reason:'UNCHANGED'}}};
 const result=mergeTechnicalProjection(baseline,{instruments:{DNA:{id:'verified'}},unavailable:{}},['DNA']);
 assert.deepEqual(result.instruments.AAPL,baseline.instruments.AAPL);assert.deepEqual(result.unavailable,baseline.unavailable);assert.deepEqual(result.instruments.DNA,{id:'verified'});
 assert.deepEqual(baseline.instruments.DNA,{id:'stale'});assert.throws(()=>mergeTechnicalProjection(baseline,{instruments:{WRONG:{}}},['DNA']),/OUT_OF_SCOPE/);
});
test('incremental signals retain unrelated events and calculate counts from actual merged results',()=>{
 const a={ticker:'AAPL',state:'AVAILABLE',events:[{ticker:'AAPL',asOf:'2026-10-01'}]},old={ticker:'DNA',state:'UNAVAILABLE',events:[]},fresh={ticker:'DNA',state:'AVAILABLE',events:[{ticker:'DNA',asOf:'2026-10-01'}]};
 const result=mergeTechnicalProjection({results:[a,old]},{results:[fresh]},['DNA']);assert.deepEqual(result.results,[a,fresh]);assert.equal(result.events.length,2);assert.deepEqual(result.counts,{requested:2,available:2,unavailable:0});
 assert.throws(()=>mergeTechnicalProjection({results:[a]},{results:[fresh]},['FIG']),/OUT_OF_SCOPE/);
});
