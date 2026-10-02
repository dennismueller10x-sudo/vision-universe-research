import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {compareDerivedFactorPopulations,readDerivedFactorPopulationComparison} from '../../scripts/market/tiingo2-factor-population-qa.mjs';

const row=(score,{state='AVAILABLE',componentScore=score,peerPercentile=score,universePercentile=score,peerSize=10}={})=>({
  marketCap:'FORBIDDEN_MARKET_CAP',bars:[{close:'FORBIDDEN_PROVIDER_CLOSE'}],
  investorReturn:'FORBIDDEN_RETURN_INPUT',
  factors:{quality:{state,score,components:[{id:'quality-component',state,score:componentScore,peerPercentile,universePercentile,peerSize,raw:'FORBIDDEN_FINANCIAL_RAW'}]}}
});

test('actual derived scores expose scoped changes and population-driven unscoped rank deltas with average ties',()=>{
  const before={AA:row(80),BB:row(60),CC:row(60),DD:row(20)};
  const after={AA:row(70,{peerPercentile:75,universePercentile:78,peerSize:12}),BB:row(60,{componentScore:62}),CC:row(60),IPO:row(90)};
  const report=compareDerivedFactorPopulations({before,after,scope:['AA','IPO','MISSING']}),quality=report.factors.quality;
  assert.deepEqual(report.population,{before:4,after:4,baselinePreserved:3,added:['IPO'],removed:['DD'],scopedMaterialized:['AA','IPO'],scopedWithoutArtifact:['MISSING']});
  assert.equal(quality.score.changed,1);assert.equal(quality.score.scopedChanged,1);assert.equal(quality.score.unscopedChanged,0);
  assert.equal(quality.score.maxAbsoluteDelta,10);assert.equal(quality.score.addedAvailable,1);assert.equal(quality.score.removedAvailable,1);
  assert.equal(quality.ordinalRank.changed,3);assert.equal(quality.ordinalRank.scopedChanged,1);assert.equal(quality.ordinalRank.unscopedChanged,2);
  assert.equal(quality.ordinalRank.maxAbsoluteDelta,1);
  const aa=quality.largeChangeSamples.find(r=>r.ticker==='AA'),bb=quality.largeChangeSamples.find(r=>r.ticker==='BB');
  assert.equal(aa.scoreDelta,-10);assert.equal(aa.beforeOrdinalRank,1);assert.equal(aa.afterOrdinalRank,2);assert.equal(aa.ordinalRankDelta,1);
  assert.equal(aa.maxPeerPercentileDelta,5);assert.equal(aa.maxUniversePercentileDelta,2);assert.equal(aa.maxPeerPopulationDelta,2);
  assert.equal(bb.beforeOrdinalRank,2.5);assert.equal(bb.afterOrdinalRank,3.5);assert.equal(bb.maxComponentScoreDelta,2);assert.equal(bb.inScope,false);
  const components=quality.components['quality-component'];
  assert.equal(components.score.changed,2);assert.equal(components.score.unscopedChanged,1);assert.equal(components.peerSize.afterMax,12);
  assert.equal(quality.maxAbsolutePeerPercentileDelta,5);
  assert.equal(quality.stateTransitions['ABSENT->AVAILABLE'],1);assert.equal(quality.stateTransitions['AVAILABLE->ABSENT'],1);
  assert.equal(report.policy,'INFORMATIONAL_POPULATION_DIFF_WITH_EXISTING_IDENTITY_AND_MARKET_VALUE_GATES_UNCHANGED');
});

test('missing, unavailable, null, strings and nonfinite values never become zero scores or numeric ranks',()=>{
  const before={NULL:row(null),UNAVAILABLE:row(90,{state:'UNAVAILABLE'}),INFINITE:row(Infinity),NAN:row(NaN),STRING:row('80'),ZERO:row(0),LOST:row(20)};
  const after={NULL:row(30),UNAVAILABLE:row(90),INFINITE:row(null),NAN:row(NaN),STRING:row('80'),ZERO:row(0),LOST:row(99,{state:'UNAVAILABLE'})};
  const report=compareDerivedFactorPopulations({before,after}),quality=report.factors.quality;
  assert.equal(quality.score.beforeAvailable,2);assert.equal(quality.score.afterAvailable,3);assert.equal(quality.score.beforeMin,0);assert.equal(quality.score.afterMin,0);
  assert.equal(quality.score.compared,1);assert.equal(quality.score.changed,0);assert.equal(quality.score.becameAvailable,2);assert.equal(quality.score.becameUnavailable,1);
  assert.equal(quality.ordinalRank.beforeAvailable,2);assert.equal(quality.ordinalRank.afterAvailable,3);
  for(const ticker of ['NULL','UNAVAILABLE']){const sample=quality.largeChangeSamples.find(r=>r.ticker===ticker);if(sample){assert.equal(sample.beforeScore,null);assert.equal(sample.scoreDelta,null);assert.equal(sample.beforeOrdinalRank,null);assert.equal(sample.ordinalRankDelta,null);}}
  const lost=quality.largeChangeSamples.find(r=>r.ticker==='LOST');assert.equal(lost.afterScore,null);assert.equal(lost.scoreDelta,null);assert.equal(lost.afterOrdinalRank,null);
  assert.equal(quality.stateTransitions['AVAILABLE->UNAVAILABLE'],1);
  for(const id of ['growth','momentum','value','profitability','revisions','risk']){assert.equal(report.factors[id].score.beforeAvailable,0);assert.equal(report.factors[id].score.beforeMin,null);assert.equal(report.factors[id].score.afterMax,null);}
});

test('comparison is deterministic and exports only approved derived fields, never raw provider or financial inputs',()=>{
  const before={ZZ:row(20),AA:row(60)},after={AA:row(65),IPO:row(90),ZZ:row(25)};
  const normal=compareDerivedFactorPopulations({before,after,scope:['IPO','AA']}),reversed=compareDerivedFactorPopulations({before:new Map(Object.entries(before).reverse()),after:new Map(Object.entries(after).reverse()),scope:['AA','IPO']});
  assert.deepEqual(normal,reversed);
  const json=JSON.stringify(normal);assert.equal(normal.rawProviderValuesExported,false);
  for(const prohibited of ['FORBIDDEN_','"raw":','"bars":','"marketCap":','"investorReturn":','"close":'])assert.equal(json.includes(prohibited),false,prohibited);
  const unchanged=compareDerivedFactorPopulations({before,after:before});
  for(const stats of Object.values(unchanged.factors)){assert.equal(stats.score.changed,0);assert.equal(stats.ordinalRank.changed,0);assert.deepEqual(stats.largeChangeSamples,[]);}
});

test('reader uses actual gzipped Factor DNA shards, ignores screening index and rejects duplicate identities',()=>{
  const dir=mkdtempSync(join(tmpdir(),'tiingo2-factor-population-')),root=join(dir,'root'),shadow=join(dir,'shadow');
  const write=(base,name,data)=>{const p=join(base,'quant/data/product/factor-evidence-v1');mkdirSync(p,{recursive:true});writeFileSync(join(p,name),gzipSync(JSON.stringify(data)));};
  try{
    write(root,'AA.json.gz',{securities:{AA:row(60)}});write(root,'screening.json.gz',{securities:{NOT_A_FACTOR_RECORD:{}}});
    write(shadow,'AA.json.gz',{securities:{AA:row(65),IPO:row(90)}});
    const report=readDerivedFactorPopulationComparison({root,shadow,scope:['IPO']});assert.equal(report.population.before,1);assert.equal(report.population.after,2);assert.equal(report.factors.quality.score.maxAbsoluteDelta,5);
    write(shadow,'ZZ.json.gz',{securities:{AA:row(20)}});assert.throws(()=>readDerivedFactorPopulationComparison({root,shadow,scope:[]}),/DUPLICATE_FACTOR_POPULATION_IDENTITY:AA/);
    assert.equal(readDerivedFactorPopulationComparison({root:join(dir,'empty'),shadow:join(dir,'empty'),scope:[]}).population.before,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
