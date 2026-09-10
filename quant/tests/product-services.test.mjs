import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url);const reads=[];
const api=Service.create({loadJSON:async p=>{reads.push(p);return JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));},displayPolicy:Policy,queryEngine:Query});
test('approved universe and stock use existing real data; chart history is preserved',async()=>{const u=await api.getUniverse();assert.equal(u.stocks.length,5);assert.equal(u.totalMarketState,'UNAVAILABLE');const s=await api.getStockIntelligence('NVDA');assert.equal(s.state,'AVAILABLE');assert.equal(s.chart.state,'AVAILABLE');assert.ok(s.chart.bars.length>2500);assert.equal(s.price.value,225.73);assert.equal(s.momentum6m.value,23.734);});
test('out-of-scope ticker cannot trigger raw data read',async()=>{const before=reads.length;const s=await api.getStockIntelligence('TSLA');assert.equal(s.reason,'DISPLAY_NOT_PERMITTED');assert.equal(reads.length,before);});
test('Discover/screener executes canonical Query AST on the scoped real set',async()=>{const q=Query.createQuery({filters:[{field:'momentum6m',operator:'gte',value:999,scale:'raw'}]});const result=await api.screen(q);assert.equal(result.eligible,5);assert.deepEqual(result.stocks,[]);assert.ok(result.queryHash);});
test('source failures yield typed unavailability, never synthetic fallback',async()=>{const bad=Service.create({loadJSON:async()=>{throw Error('unreachable')},displayPolicy:Policy,queryEngine:Query});assert.equal((await bad.getUniverse()).state,'UNAVAILABLE');assert.equal((await bad.getStockIntelligence('NVDA')).reason,'SOURCE_MISSING');});
test('future and mock panel rows are rejected before stock and screener consumption',async()=>{
 for(const mutation of [s=>{s.marketData.asOf='2099-01-01';s.fundamentals.price=999;},s=>{s.provenance.isMock=true;}]){
 const guarded=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.endsWith('quant-factor-inputs.json'))mutation(x.securities.NVDA);return x;},displayPolicy:Policy,queryEngine:Query});
 assert.equal((await guarded.getStockIntelligence('NVDA')).state,'UNAVAILABLE');
 assert.ok(!(await guarded.screen(Query.createQuery({}))).stocks.some(s=>s.ticker==='NVDA'));
 }
});
test('screen source failures are typed',async()=>{const bad=Service.create({loadJSON:async()=>{throw Error('offline')},displayPolicy:Policy,queryEngine:Query});assert.equal((await bad.screen(Query.createQuery({}))).state,'UNAVAILABLE');});
test('Discover recipes reproduce identical editable Screener queries and preserve their defaults',async()=>{
 const discovered=await api.getDiscover();assert.equal(discovered.collections.length,3);
 for(const c of discovered.collections){const screened=await api.screen(c.query);assert.equal(c.result.queryHash,screened.queryHash);assert.deepEqual(c.result.stocks,screened.stocks);assert.equal(c.result.eligible,5);}
 const recipes=api.getRecipes();recipes[0].query.filters[0].value=999;
 assert.equal(api.getRecipes()[0].query.filters[0].value,0);
});
