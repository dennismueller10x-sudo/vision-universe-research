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
test('Market Intelligence exposes scoped evidence without a synthetic market pulse',async()=>{
 const market=await api.getMarketIntelligence();assert.equal(market.marketPulse.state,'UNAVAILABLE');assert.equal(market.observations.length,5);
 const nvda=market.observations.find(x=>x.stock.ticker==='NVDA');assert.equal(nvda.trend.state,'AVAILABLE');assert.equal(nvda.trend.evidence[1].metric.value,nvda.stock.above200.value);
});
test('Technical summary consumes the existing real bundle without converting Elliott confidence to probability',async()=>{
 const technical=await api.getTechnicalIntelligence('NVDA');assert.equal(technical.state,'AVAILABLE');assert.equal(technical.trend.label,'Aufwärtstrend');assert.equal(technical.elliott.label,'Mehrere mögliche Zählungen');assert.equal(technical.isProbability,false);assert.equal(technical.confidence,undefined);
 const before=reads.length;assert.equal((await api.getTechnicalIntelligence('TSLA')).reason,'DISPLAY_NOT_PERMITTED');assert.equal(reads.length,before);
});
test('Technical summary rejects future, mocked and mismatched bundles',async()=>{
 for(const mutate of [s=>s.isMock=true,s=>s.bundle.dataCutoff='2099-01-01',s=>s.bundle.instrumentId='MSFT']){
 const guarded=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.includes('/technical/instruments/'))mutate(x);return x;},displayPolicy:Policy,queryEngine:Query});
 assert.equal((await guarded.getTechnicalIntelligence('NVDA')).reason,'INVALID_TECHNICAL_PROVENANCE');
 }
});
test('Historical Fundamentals service preserves actual SEC identity and current scope',async()=>{
 const history=await api.getHistoricalFundamentals('NVDA',{metric:'revenue',period:'annual'});assert.equal(history.state,'AVAILABLE');assert.equal(history.pitEligibility,'NOT_CERTIFIED');
 const before=reads.length;assert.equal((await api.getHistoricalFundamentals('TSLA')).reason,'OUTSIDE_PREVIEW_SCOPE');assert.equal(reads.length,before);
});
test('full Technical workspace remains behind raw display permission and preserves Elliott evidence',async()=>{
 const model=await api.getTechnicalWorkspace('NVDA');assert.equal(model.state,'AVAILABLE');assert.ok(model.elliott.primary.waves.length>40);const before=reads.length;assert.equal((await api.getTechnicalWorkspace('TSLA')).reason,'DISPLAY_NOT_PERMITTED');assert.equal(reads.length,before);
});
test('Quant workspace preserves raw factor values and refuses small-universe scores',async()=>{
 for(const ticker of ['AAPL','MSFT','NVDA','JPM','XOM']){const model=await api.getQuantWorkspace(ticker);assert.equal(model.state,'AVAILABLE');assert.equal(model.families.flatMap(f=>f.metrics).length,18);assert.equal(model.score.state,'UNAVAILABLE');assert.equal(model.pitEligible,false);}
 const model=await api.getQuantWorkspace('NVDA'),metrics=model.families.flatMap(f=>f.metrics);assert.equal(metrics.find(m=>m.metricId==='momentum6m').value,23.734);assert.equal(metrics.find(m=>m.metricId==='roic').value,65.062);assert.equal((await api.getQuantWorkspace('TSLA')).reason,'OUTSIDE_PREVIEW_SCOPE');
});
test('Quant workspace suppresses market-dependent valuation and risk when display permission is absent',async()=>{
 const denied=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:()=>({allowed:false})},queryEngine:Query});
 const model=await denied.getQuantWorkspace('NVDA');assert.equal(model.state,'AVAILABLE');for(const family of model.families.filter(f=>['value','momentum','risk'].includes(f.id)))assert.ok(family.metrics.every(m=>m.value===null&&m.reason==='DISPLAY_NOT_PERMITTED'));assert.ok(model.families[0].metrics.some(m=>m.state==='AVAILABLE'));
});
test('Quant values are not zero-filled and unknown panel versions are unavailable',async()=>{
 for(const unknown of [false,true]){const changed=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.endsWith('quant-factor-inputs.json')){x.securities.NVDA.fundamentals.roic=null;x.securities.NVDA.fundamentals.fcfMargin=0;if(unknown)x.versions.buildScript='unknown';}return x;},displayPolicy:Policy,queryEngine:Query});const model=await changed.getQuantWorkspace('NVDA');if(unknown)assert.equal(model.state,'UNAVAILABLE');else {const m=model.families[0].metrics;assert.equal(m.find(x=>x.metricId==='roic').state,'SOURCE_MISSING');assert.equal(m.find(x=>x.metricId==='fcfMargin').value,0);}}
});
