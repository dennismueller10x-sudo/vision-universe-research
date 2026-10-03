import test from 'node:test';import assert from 'node:assert/strict';
import {mergeTechnicalProjection,assertBaselinePatternProjections} from '../../scripts/market/tiingo2-product-surfaces.mjs';
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
test('unavailable incremental regression evidence cannot erase a protected delivered technical bundle or strategy signals',()=>{
 const baseline={instruments:{AMC:{id:'protected'}},unavailable:{},results:[{ticker:'AMC',state:'AVAILABLE',events:[{ticker:'AMC',asOf:'2026-10-01'}]}]};
 const result=mergeTechnicalProjection(baseline,{instruments:{},unavailable:{AMC:{reason:'SOURCE_MISSING'}},results:[{ticker:'AMC',state:'UNAVAILABLE',events:[]}]},['AMC']);
 assert.deepEqual(result.instruments,baseline.instruments);assert.deepEqual(result.unavailable,{});assert.deepEqual(result.results,baseline.results);assert.equal(result.counts.available,1);
 const partial=mergeTechnicalProjection(baseline,{results:[]},['AMC']);assert.deepEqual(partial.results,baseline.results);assert.equal(partial.counts.available,1);
});
test('native pattern refresh preserves baseline measurements and reasons outside the verified fresh price scope',()=>{
 const before={AAPL:{kind:'instruments',row:{ticker:'AAPL',holds:['robust-pattern'],asOf:'2026-10-01'}},DNA:{kind:'instruments',row:{ticker:'DNA',holds:['deep-drawdown'],asOf:'2026-09-10'}},IPO:{kind:'unavailable',row:{reason:'INSUFFICIENT_WEEKLY_HISTORY',weeks:71,requiredWeeks:104}}};
 const after={...before,DNA:{kind:'instruments',row:{ticker:'DNA',holds:['deep-drawdown','above-40w-line'],asOf:'2026-10-01'}},NEW:{kind:'unavailable',row:{reason:'NO_WEEKLY_SERIES',weeks:null,requiredWeeks:null}}};
 assert.doesNotThrow(()=>assertBaselinePatternProjections(before,after,{allowedTickers:['DNA','NEW'],scope:['DNA','NEW']}));
 assert.throws(()=>assertBaselinePatternProjections(before,after,{allowedTickers:['DNA','NEW'],scope:['NEW']}),/BASELINE_PATTERN_PROJECTION_CHANGED:DNA/,'an out-of-scope fresh ticker cannot waive a protected baseline measurement');
 assert.throws(()=>assertBaselinePatternProjections(before,after),/BASELINE_PATTERN_PROJECTION_CHANGED:DNA/);
 const fabricated={...after,IPO:{kind:'instruments',row:{ticker:'IPO',holds:[]}}};assert.throws(()=>assertBaselinePatternProjections(before,fabricated,{allowedTickers:['DNA','NEW'],scope:['DNA','NEW']}),/BASELINE_PATTERN_PROJECTION_CHANGED:IPO/);
 const dropped={...after};delete dropped.AAPL;assert.throws(()=>assertBaselinePatternProjections(before,dropped,{allowedTickers:['DNA','NEW'],scope:['DNA','NEW']}),/BASELINE_PATTERN_PROJECTION_CHANGED:AAPL/);
});
