import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const Registry = require('../engines/market-metric-registry.js');
const Engine = require('../engines/market-factors.js');
const Contract = require('../api/intelligence-contract.js');
function snapshot() {
  const bars = Array.from({length:280}, (_,i) => ({
    date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),
    close:100,open:100,high:101,low:99,volume:1000
  }));
  return Engine.computeFactors({ ticker:'TEST',bars,adjustmentStatus:'unknown' });
}
function input(s = snapshot()) {
  return { securityId:'test_security', snapshot:s, decisionDate:'2026-09-10', healthState:'AVAILABLE',
    provenance:{isMock:false,sourceId:'test-engine',snapshotId:'fixture-1',securityId:'test_security'},
    permission:{allowed:true,basis:'TEST ONLY'} };
}
test('registered values preserve engine identity, units, zero and false', () => {
  const s = snapshot(), view = Contract.buildMarketView(input(s));
  assert.equal(view.availability.state,'AVAILABLE');
  assert.equal(view.metrics.momentum_6m.value,s.values.returns['6M']);
  assert.equal(view.metrics.momentum_6m.value,0);
  assert.equal(view.metrics.above_sma200.value,false);
  assert.equal(view.metrics.distance_52w_high.value,s.values.distanceTo52wHigh);
  assert.equal(view.metrics.relative_strength_6m.state,'SOURCE_MISSING');
  assert.equal(view.temporal.pitEligibility,'NOT_CERTIFIED');
  assert.equal(Registry.get('momentum_6m').unit,'ratio');
  assert.equal(Registry.get('momentum6m'),null,'legacy percent metric is not an alias');
});
test('denied, mock and unverified inputs cannot expose values', () => {
  for (const change of [{permission:null},{permission:{allowed:true}},
    {provenance:{isMock:true}}, {provenance:{sourceId:'anything'}}]) {
    const view=Contract.buildMarketView({...input(),...change});
    assert.deepEqual(view.metrics,{});
    assert.equal(view.provenance,null);
    assert.notEqual(view.availability.state,'AVAILABLE');
  }
});
test('future date, invalid date, unknown version and absent health fail explicitly', () => {
  for (const change of [{decisionDate:'2020-01-01'}, {decisionDate:'2026-02-30'},
    {snapshot:{...snapshot(),version:'unreviewed'}}, {healthState:undefined}]) {
    const view=Contract.buildMarketView({...input(),...change});
    assert.deepEqual(view.metrics,{});
    assert.notEqual(view.availability.reason,null);
  }
});
test('invalid numeric values never leak as NaN, Infinity or undefined', () => {
  for (const invalid of [NaN,Infinity,undefined,null,'0']) {
    const s=snapshot();s.values.returns['6M']=invalid;
    const view=Contract.buildMarketView(input(s));
    assert.equal(view.metrics.momentum_6m.state,'PIPELINE_ERROR');
    assert.equal(view.metrics.momentum_6m.value,null);
    assert.equal(view.availability.state,'PIPELINE_ERROR');
  }
});
test('freshness is preserved; restricted fields stay withheld', () => {
  const s=Engine.stripPriceLevels(snapshot());
  const view=Contract.buildMarketView({...input(s),healthState:'STALE'});
  assert.equal(view.availability.state,'STALE');
  assert.equal(view.metrics.momentum_6m.state,'STALE');
  assert.equal(view.metrics.sma200.value,null);
  assert.equal(view.metrics.sma200.reason,'DISPLAY_WITHHELD');
});
test('registry is immutable, unique and selects dependencies without recomputing', () => {
  assert.equal(new Set(Registry.entries.map(m=>m.metricId)).size,Registry.entries.length);
  assert.equal(Registry.engineVersion,Engine.VERSION);
  assert.throws(()=>{Registry.get('sma20').inputs.push('secret');},TypeError);
  assert.deepEqual(Registry.affectedBy(['unknown']),[]);
  assert.ok(Registry.affectedBy(['benchmark.close']).every(id=>id.startsWith('relative_strength_')));
  assert.equal(Registry.affectedBy(['corporate_actions']).length,Registry.entries.length);
});
test('existing Golden-Five market histories use unchanged engine outputs through the new contract', () => {
  for (const ticker of ['AAPL','MSFT','NVDA','JPM','XOM']) {
    const path=new URL('../data/market/golden-preview/daily/ref_'+ticker+'.json',import.meta.url);
    const s=Engine.computeFactors(JSON.parse(readFileSync(path,'utf8')));
    const context=input(s);context.provenance.securityId='ref_'+ticker;
    const view=Contract.buildMarketView({...context,securityId:'ref_'+ticker});
    assert.equal(view.availability.state,'AVAILABLE',ticker);
    assert.equal(view.metrics.momentum_6m.value,s.values.returns['6M'],ticker);
    assert.equal(view.metrics.drawdown_252d.value,s.values.maxDrawdown252d,ticker);
  }
});

test('identity mismatches reject a snapshot before exposing another security values', () => {
  const context=input(); context.provenance.securityId='different_security';
  const view=Contract.buildMarketView(context);
  assert.equal(view.availability.reason,'IDENTITY_MISMATCH');
  assert.deepEqual(view.metrics,{});
});
