import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),Editor=require('../api/screener-workspace.js'),Query=require('../engines/query.js'),Rules=require('../engines/rule-contract.js');
const panel=JSON.parse(readFileSync(new URL('../data/sec/quant-factor-inputs.json',import.meta.url)));
const rows=Object.values(panel.securities).filter(s=>s.available).map(s=>({...s.fundamentals,ticker:s.ticker,status:'active'}));
const growthMomentum=[{field:'revenueGrowth',operator:'gte',value:20,scale:'raw'},{field:'momentum6m',operator:'gte',value:10,scale:'raw'}];
const fixtureRows=[
 {ticker:'BOTH',status:'active',revenueGrowth:35,momentum6m:25},
 {ticker:'GROWTH_ONLY',status:'active',revenueGrowth:50,momentum6m:9.99},
 {ticker:'MOMENTUM_ONLY',status:'active',revenueGrowth:19.99,momentum6m:80},
 {ticker:'EDGE',status:'active',revenueGrowth:20,momentum6m:10},
 {ticker:'NULL_MOMENTUM',status:'active',revenueGrowth:60,momentum6m:null},
 {ticker:'MISSING_GROWTH',status:'active',momentum6m:40},
 {ticker:'INACTIVE',status:'delisted',revenueGrowth:90,momentum6m:90},
 {ticker:'NEITHER',status:'active',revenueGrowth:-4,momentum6m:-12}
];
test('combined growth and momentum rules execute through the existing query engine (deterministic fixture)',()=>{const query=Editor.build(growthMomentum);const result=Query.execute(query,fixtureRows);assert.deepEqual(result.rows.map(r=>r.ticker).sort(),['BOTH','EDGE']);assert.deepEqual(result.rows,Query.execute(Query.createQuery({filters:growthMomentum,sort:query.sort,limit:50}),fixtureRows).rows);});
test('combined growth and momentum rules hold invariants on live rows without pinning the market',()=>{const query=Editor.build(growthMomentum);const result=Query.execute(query,rows);const live=Query.execute(Query.createQuery({filters:growthMomentum,sort:query.sort,limit:50}),rows);assert.deepEqual(result.rows,live.rows);const ok=r=>r.status==='active'&&typeof r.revenueGrowth==='number'&&Number.isFinite(r.revenueGrowth)&&r.revenueGrowth>=20&&typeof r.momentum6m==='number'&&Number.isFinite(r.momentum6m)&&r.momentum6m>=10;for(const r of result.rows)assert.ok(ok(r),r.ticker);assert.deepEqual(result.rows.map(r=>r.ticker).sort(),rows.filter(ok).map(r=>r.ticker).sort());});
test('saved criteria preserve normalized query hash and results without embedding data',()=>{const query=Editor.build([{field:'price',operator:'lt',value:300,scale:'raw'}]);const saved=Editor.encode(query),restored=Editor.decode(saved);assert.equal(Query.queryHash(restored),Query.queryHash(query));assert.deepEqual(Query.execute(restored,rows).rows,Query.execute(query,rows).rows);assert.equal(JSON.parse(saved).rows,undefined);});
test('unsupported and oversized saved queries fail rather than widening an intended screen',()=>{assert.throws(()=>Editor.decode('x'.repeat(24001)));assert.throws(()=>Editor.decode('{bad'));assert.throws(()=>Editor.decode(JSON.stringify(Query.createQuery({filters:[{field:'quantScore',operator:'gte',value:90}],sort:[{field:'quantScore',direction:'desc'}]}))));assert.throws(()=>Editor.build([{field:'revenueGrowth',operator:'gte',value:NaN,scale:'raw'}]));});
test('editable presentation does not change canonical rule identity',()=>{const a=Editor.build([{field:'price',operator:'lt',value:300,scale:'raw'}],[{field:'price',direction:'asc'}]),b=Query.createQuery({...a,sort:[{field:'price',direction:'desc'}],limit:5});assert.notEqual(Query.queryHash(a),Query.queryHash(b));assert.equal(Rules.predicateHash(Editor.predicate(a)),Rules.predicateHash(Editor.predicate(b)));});
test('current Technical and Elliott fields are canonical but explicitly not backtest certified',()=>{
 const score=Editor.fields.find(f=>f.id==='technicalOpportunityScore'),elliott=Editor.fields.find(f=>f.id==='elliottCountStatus');
 assert.equal(score.availability,'CURRENT_SNAPSHOT_ONLY');assert.equal(score.backtestEligibility,'NOT_CERTIFIED');assert.equal(score.type,'number');
 assert.equal(elliott.type,'enum');assert.deepEqual(elliott.operatorIds,['eq','ne']);assert.equal(elliott.isProbability,false);
 assert.ok(Editor.sortableFields.every(field=>field.type==='number'));assert.ok(!Editor.sortableFields.some(field=>field.id==='elliottCountStatus'));
 assert.equal(Editor.build([{field:'elliottCountStatus',operator:'eq',value:'AMBIGUOUS',scale:'raw'}]).sort[0].field,'momentum6m');
 const query=Editor.build([{field:'elliottCountStatus',operator:'eq',value:'AMBIGUOUS',scale:'raw'}],[{field:'technicalOpportunityScore',direction:'desc'}]);
 assert.equal(Editor.decode(Editor.encode(query)).filters[0].value,'AMBIGUOUS');assert.equal(Rules.predicateHash(Editor.predicate(query)),Rules.predicateHash(Rules.fromQuery(query)));
});
