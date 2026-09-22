import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url);const reads=[];
const api=Service.create({loadJSON:async p=>{reads.push(p);return JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));},displayPolicy:Policy,queryEngine:Query});
const canonicalPanel=JSON.parse(await readFile(new URL('quant/data/sec/quant-factor-inputs.json',root),'utf8')),nvda=canonicalPanel.securities.NVDA;
const technicalSource=JSON.parse(await readFile(new URL('quant/data/technical/instruments/NVDA.json',root),'utf8'));
test('canonical product universe projects the full capability set; chart history is preserved',async()=>{const u=await api.getUniverse();assert.equal(u.stocks.length,6875);assert.ok(u.factorReady>=6401);assert.equal(u.scope,'CANONICAL_PRODUCT_UNIVERSE');const s=await api.getStockIntelligence('NVDA');assert.equal(s.state,'AVAILABLE');assert.equal(s.chart.state,'AVAILABLE');assert.ok(s.chart.bars.length>2500);assert.equal(s.price.value,nvda.fundamentals.price);assert.equal(s.momentum6m.value,nvda.fundamentals.momentum6m);});
test('canonical members outside the legacy panel remain addressable without raw fanout',async()=>{const s=await api.getStockIntelligence('TSLA');assert.equal(s.identityState,'AVAILABLE');assert.equal(s.state,'AVAILABLE');});
test('consumer breadth follows capabilities across representative cohorts',async()=>{
 for(const [ticker,fundamentals] of [['TSLA',true],['AMD',true],['MU',true],['MET',true],['O',true],['ASML',true],['BAC',true],['PLAB',true],['CRWV',false]]){
  const [stock,history,quant,technical,workspace]=await Promise.all([api.getStockIntelligence(ticker),api.getHistoricalFundamentals(ticker),api.getQuantWorkspace(ticker),api.getTechnicalIntelligence(ticker),api.getTechnicalWorkspace(ticker)]);
  assert.equal(stock.state,'AVAILABLE',ticker);assert.equal(stock.chart.state,'AVAILABLE',ticker);assert.equal(history.state,fundamentals?'AVAILABLE':'UNAVAILABLE',ticker);
  assert.equal(quant.state,'AVAILABLE',ticker);assert.equal(quant.score.state,'UNAVAILABLE',ticker);assert.equal(technical.state,'AVAILABLE',ticker);assert.equal(technical.evidenceLevel,'REDUCED_EVIDENCE',ticker);
  assert.equal(workspace.state,'UNAVAILABLE',ticker);assert.ok(stock.setupState);assert.notEqual(stock.setupState.availability?.state,'AVAILABLE',ticker);
 }
});
test('Discover/screener executes canonical Query AST on the full product set',async()=>{const q=Query.createQuery({filters:[{field:'momentum6m',operator:'gte',value:999,scale:'raw'}]});const result=await api.screen(q);assert.equal(result.eligible,6875);assert.deepEqual(result.stocks,[]);assert.ok(result.queryHash);});
test('source failures yield typed unavailability, never synthetic fallback',async()=>{const bad=Service.create({loadJSON:async()=>{throw Error('unreachable')},displayPolicy:Policy,queryEngine:Query});assert.equal((await bad.getUniverse()).state,'UNAVAILABLE');assert.equal((await bad.getStockIntelligence('NVDA')).reason,'SOURCE_MISSING');});
test('future and mock panel rows are rejected before stock and screener consumption',async()=>{
 for(const mutation of [s=>{s.marketData.asOf='2099-01-01';s.fundamentals.price=999;},s=>{s.provenance.isMock=true;}]){
 const guarded=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.endsWith('quant-factor-inputs.json'))mutation(x.securities.NVDA);return x;},displayPolicy:Policy,queryEngine:Query});
 const stock=await guarded.getStockIntelligence('NVDA');assert.equal(stock.state,'AVAILABLE');assert.notEqual(stock.price.value,999);assert.equal(stock.identityState,'AVAILABLE');
 const screened=(await guarded.screen(Query.createQuery({}))).stocks.find(s=>s.ticker==='NVDA');assert.ok(!screened||screened.price.value===null);
 }
});
test('screen source failures are typed',async()=>{const bad=Service.create({loadJSON:async()=>{throw Error('offline')},displayPolicy:Policy,queryEngine:Query});assert.equal((await bad.screen(Query.createQuery({}))).state,'UNAVAILABLE');});
test('Discover recipes reproduce identical editable Screener queries and preserve their defaults',async()=>{
 const discovered=await api.getDiscover();assert.equal(discovered.collections.length,3);
 for(const c of discovered.collections){const screened=await api.screen(c.query);assert.equal(c.result.queryHash,screened.queryHash);assert.deepEqual(c.result.stocks,screened.stocks);assert.equal(c.result.eligible,6875);}
 const recipes=api.getRecipes();recipes[0].query.filters[0].value=999;
 assert.equal(api.getRecipes()[0].query.filters[0].value,0);
});
test('Market Intelligence exposes scoped evidence without a synthetic market pulse',async()=>{
 const market=await api.getMarketIntelligence();assert.equal(market.marketPulse.state,'UNAVAILABLE');assert.equal(market.observations.length,6875);
 const nvda=market.observations.find(x=>x.stock.ticker==='NVDA');assert.equal(nvda.trend.state,'AVAILABLE');assert.equal(nvda.trend.evidence[1].metric.value,nvda.stock.above200.value);
});
test('Technical summary consumes the existing real bundle without converting Elliott confidence to probability',async()=>{
 const technical=await api.getTechnicalIntelligence('NVDA');assert.equal(technical.state,'AVAILABLE');assert.equal(technical.trend.code,technicalSource.bundle.trend.direction);assert.equal(technical.elliott.code,technicalSource.bundle.elliott.status);assert.ok(technical.trend.label);assert.ok(technical.elliott.label);assert.equal(technical.isProbability,false);assert.equal(technical.confidence,undefined);
 const before=reads.length,reduced=await api.getTechnicalIntelligence('TSLA');assert.equal(reduced.state,'AVAILABLE');assert.equal(reduced.evidenceLevel,'REDUCED_EVIDENCE');assert.equal(reduced.fullWorkspace,false);assert.equal(reduced.elliott.state,'UNAVAILABLE');assert.ok(reads.length>=before);
});
test('Technical summary rejects future, mocked and mismatched bundles',async()=>{
 for(const mutate of [s=>s.isMock=true,s=>s.bundle.dataCutoff='2099-01-01',s=>s.bundle.instrumentId='MSFT']){
 const guarded=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.includes('/technical/instruments/'))mutate(x);return x;},displayPolicy:Policy,queryEngine:Query});
 assert.equal((await guarded.getTechnicalIntelligence('NVDA')).reason,'INVALID_TECHNICAL_PROVENANCE');
 }
});
test('Historical Fundamentals preserves SEC identity and keeps canonical out-of-preview members typed',async()=>{
 const history=await api.getHistoricalFundamentals('NVDA',{metric:'revenue',period:'annual'});assert.equal(history.state,'AVAILABLE');assert.equal(history.pitEligibility,'NOT_CERTIFIED');
 const before=reads.length,consumer=await api.getHistoricalFundamentals('TSLA');assert.equal(consumer.state,'AVAILABLE');assert.equal(consumer.pitEligibility,'NOT_CERTIFIED');assert.equal(consumer.availabilityPrecision,'FILING_DATE');assert.ok(reads.slice(before).includes('/discover/data/stocks/US_REAL/TSLA.json'));assert.equal((await api.getHistoricalFundamentals('TSLA',{period:'quarterly'})).reason,'SOURCE_MISSING','source checkout has no release-only compressed artifact; never fall back to annual');
});
test('production reuses canonical artifacts without any Vercel fetch',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{calls.push(String(url));throw Error('no remote service permitted');};
 try{const history=await api.getHistoricalPriceHistory('NVDA');assert.equal(history.state,'AVAILABLE');assert.equal(history.identity.securityId,'vu_d57074b4128184');assert.equal(history.grain,'daily');assert.equal(history.fullDailyHistory,false);
  const long=await api.getHistoricalPriceHistory('NVDA',{range:'MAX'});assert.equal(long.state,'AVAILABLE');assert.equal(long.grain,'weekly');assert.ok(long.bars[0].date<'2000-01-01');
  const snapshot=await api.getIntraday('NVDA');assert.equal(snapshot.state,'INTRADAY_AVAILABLE');assert.equal(snapshot.priceSemantics,'UNSPECIFIED');assert.equal(snapshot.isLive,false);
  const relay=await api.getRealtimeCapability('NVDA');assert.equal(relay.state,'AVAILABLE');assert.equal(relay.chartMovement,'TRADE_EVENTS_ONLY');assert.equal(relay.connectionState,'NOT_CONNECTED');
  assert.equal((await api.getHistoricalPriceHistory('NVDA',{columns:'ohlcv'})).reason,'OHLCV_NOT_IN_SERIES_ARTIFACT');assert.deepEqual(calls,[]);
 }finally{globalThis.fetch=original;}
});
test('canonical artifact services reject mismatched identities, mocks, future and duplicate points',async()=>{
 for(const change of [s=>{s.securityId='ref_AAPL'},s=>{s.dataMode='mock'},s=>{s.asOf='2099-01-01'},s=>{s.points[1]=s.points[0]},s=>{s.points[0][1]=null}]){
  const guarded=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.includes('/discover-series/'))change(x);return x;},displayPolicy:Policy,queryEngine:Query});
  assert.equal((await guarded.getHistoricalPriceHistory('NVDA')).state,'UNAVAILABLE');
 }
});
test('materialized artifacts remain readable while relay capability respects public policy',async()=>{
 const paths=[],denied=Service.create({loadJSON:async p=>{paths.push(p);return JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));},displayPolicy:{...Policy,check:()=>({allowed:false})},queryEngine:Query});
 assert.equal((await denied.getHistoricalPriceHistory('NVDA')).state,'AVAILABLE');
 assert.equal((await denied.getIntraday('NVDA')).state,'INTRADAY_AVAILABLE');
 assert.equal((await denied.getRealtimeCapability('NVDA')).reason,'DISPLAY_NOT_PERMITTED');
});
test('intraday rejects snapshot substitution and invalid time points',async()=>{
 for(const change of [s=>{s.securityId='ref_AAPL'},s=>{s.symbol='AAPL'},s=>{s.sessionDate='2099-01-01'},s=>{s.points[1]=s.points[0]},s=>{s.asOf='2099-01-01T00:00:00Z'}]){
 const guarded=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.includes('/intraday/')&&!p.endsWith('index.json'))change(x);return x;},displayPolicy:Policy,queryEngine:Query});assert.equal((await guarded.getIntraday('NVDA')).reason,'INVALID_INTRADAY_CONTRACT');}
});
test('market services do not require a CIK when canonical security identity is valid',async()=>{
 const noCik=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.includes('/universe/')){const clear=v=>{if(v&&typeof v==='object'){if(v.symbol==='NVDA')v.cik=null;Object.values(v).forEach(clear);}};clear(x);}return x;},displayPolicy:Policy,queryEngine:Query});assert.equal((await noCik.getHistoricalPriceHistory('NVDA')).state,'AVAILABLE');
});
test('full Technical workspace remains behind raw display permission and preserves Elliott evidence',async()=>{
 const model=await api.getTechnicalWorkspace('NVDA');assert.equal(model.state,'AVAILABLE');assert.ok(model.elliott.primary.waves.length>40);const before=reads.length;assert.ok(['TECHNICAL_BUNDLE_NOT_PUBLISHED','SOURCE_MISSING'].includes((await api.getTechnicalWorkspace('TSLA')).reason));assert.ok(reads.length>=before);
});
test('Quant workspace preserves raw factor values and refuses small-universe scores',async()=>{
 for(const ticker of ['AAPL','MSFT','NVDA','JPM','XOM','TSLA']){const model=await api.getQuantWorkspace(ticker);assert.equal(model.state,'AVAILABLE');assert.equal(model.families.length, ticker==='TSLA'?7:5);assert.equal(model.score.state,'UNAVAILABLE');assert.equal(model.pitEligible,false);}
 const model=await api.getQuantWorkspace('NVDA'),metrics=model.families.flatMap(f=>f.metrics);assert.equal(metrics.find(m=>m.metricId==='momentum6m').value,nvda.fundamentals.momentum6m);assert.equal(metrics.find(m=>m.metricId==='roic').value,nvda.fundamentals.roic);
});
test('Quant workspace suppresses market-dependent valuation and risk when display permission is absent',async()=>{
 const denied=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:()=>({allowed:false})},queryEngine:Query});
 const model=await denied.getQuantWorkspace('NVDA');assert.equal(model.state,'AVAILABLE');for(const family of model.families.filter(f=>['value','momentum','risk'].includes(f.id)))assert.ok(family.metrics.every(m=>m.value===null&&m.reason==='DISPLAY_NOT_PERMITTED'));assert.ok(model.families[0].metrics.some(m=>m.state==='AVAILABLE'));
});
test('Quant values are not zero-filled and unknown panel versions are unavailable',async()=>{
 for(const unknown of [false,true]){const changed=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.endsWith('quant-factor-inputs.json')){x.securities.NVDA.fundamentals.roic=null;x.securities.NVDA.fundamentals.fcfMargin=0;if(unknown)x.versions.buildScript='unknown';}return x;},displayPolicy:Policy,queryEngine:Query});const model=await changed.getQuantWorkspace('NVDA');if(unknown)assert.equal(model.state,'UNAVAILABLE');else {const m=model.families[0].metrics;assert.equal(m.find(x=>x.metricId==='roic').state,'SOURCE_MISSING');assert.equal(m.find(x=>x.metricId==='fcfMargin').value,0);}}
});

test('Strategy context uses existing methodology without enabling real historical results',async()=>{const c=await api.getStrategyContext();assert.equal(c.state,'AVAILABLE');assert.equal(c.definition.execution.timing,'next_open');assert.equal(c.backtest.state,'UNAVAILABLE');assert.equal(c.backtest.checks.length,5);assert.ok(!('results' in c.backtest));});

test('Portfolio valuation requires raw permission and never widens a derived-only grant',async()=>{const onlyDerived=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:args=>({allowed:args.form==='derived'})},queryEngine:Query});const result=await onlyDerived.getPortfolioIntelligence([{ticker:'NVDA',quantity:1}]);assert.equal(result.state,'INCOMPLETE');assert.equal(result.total,null);assert.equal(result.positions[0].price,null);assert.equal(result.positions[0].weight,null);});
test('Watchlist preserves selection and shares scoped canonical values without raw reads',async()=>{
 const before=reads.length,data=await api.getWatchlistIntelligence(['NVDA','TSLA']);assert.equal(data.partial,false);assert.equal(data.members[0].momentum6m.value,nvda.fundamentals.momentum6m);assert.equal(data.members[1].state,'AVAILABLE');assert.equal(data.members[1].ticker,'TSLA');assert.equal(reads.length,before);assert.equal((await api.getWatchlistIntelligence([])).state,'EMPTY');
});
test('Watchlist retains unavailable members during source failure and rejects invalid selection',async()=>{
 const bad=Service.create({loadJSON:async()=>{throw Error('offline')},displayPolicy:Policy,queryEngine:Query});assert.equal((await bad.getWatchlistIntelligence(['NVDA'])).members[0].state,'UNAVAILABLE');assert.equal((await bad.getWatchlistIntelligence(['<script>'])).reason,'INVALID_WATCHLIST');
});
test('Watchlist raw quote is suppressed under a derived-only grant',async()=>{const onlyDerived=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:args=>({allowed:args.form==='derived'})},queryEngine:Query});const result=await onlyDerived.getWatchlistIntelligence(['NVDA']);assert.equal(result.members[0].price.value,null);assert.equal(result.members[0].price.reason,'DISPLAY_NOT_PERMITTED');assert.equal(result.members[0].momentum6m.value,nvda.fundamentals.momentum6m);});
test('Home uses an explicit featured set while watchlists retain canonical breadth',async()=>{const before=reads.length,result=await api.getHomeIntelligence(['NVDA','TSLA']);assert.equal(result.market.observations.length,5);assert.equal(result.market.scope,'FEATURED_FULL_INTELLIGENCE_SET');assert.equal(result.watchlist.members.length,2);assert.equal(result.watchlist.partial,false);assert.equal(result.isLive,false);assert.equal(result.dataMode,'LATEST_AVAILABLE_EOD');assert.ok(reads.slice(before).includes('/quant/config/market-calendar.json'));});
test('Home calendar failure does not hide independent research data',async()=>{const offlineCalendar=Service.create({loadJSON:async p=>{if(p.endsWith('market-calendar.json'))throw Error('offline');return JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));},displayPolicy:Policy,queryEngine:Query});const result=await offlineCalendar.getHomeIntelligence([]);assert.equal(result.session.state,'UNAVAILABLE');assert.equal(result.market.observations.length,5);});
test('Home never broadens a derived grant into raw quote display',async()=>{const onlyDerived=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:args=>({allowed:args.form==='derived'})},queryEngine:Query});const result=await onlyDerived.getHomeIntelligence(['NVDA']);assert.ok(result.market.observations.every(o=>o.stock.price.value===null));assert.equal(result.watchlist.members[0].price.value,null);});
test('session default clock is sampled after async calendar loading crosses opening time',async()=>{const RealDate=Date;let loaded=false;class Clock extends RealDate{constructor(...args){super(...(args.length?args:[loaded?'2026-09-11T13:30:01Z':'2026-09-11T13:29:59Z']));}}globalThis.Date=Clock;try{const slow=Service.create({loadJSON:async p=>{const data=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));loaded=true;return data;},displayPolicy:Policy,queryEngine:Query});assert.equal((await slow.getMarketSession()).phase,'REGULAR');assert.equal((await slow.getMarketSession({now:'2026-09-11T13:29:59Z'})).phase,'PRE_MARKET');}finally{globalThis.Date=RealDate;}});
test('shared Screener and Atlas suppress raw quotes and prohibit price probing under derived-only grants',async()=>{
 const onlyDerived=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:args=>({allowed:args.form==='derived'})},queryEngine:Query});
 const Atlas=require('../api/atlas-tools.js'),Screener=require('../api/screener-workspace.js'),tools=Atlas.create(onlyDerived),query=Screener.build([]);
 assert.ok((await onlyDerived.getUniverse()).stocks.every(s=>s.price.value===null));
 const result=await tools.call('screenStocks',{query});assert.equal(result.ok,true);assert.equal(result.data.stocks.length,50);assert.ok(result.data.stocks.every(s=>s.price.value===null));
 for(const q of [Screener.build([{field:'price',operator:'gte',value:200,scale:'raw'}]),Screener.build([],[{field:'price',direction:'desc'}])]){
  assert.equal((await onlyDerived.screen(q)).reason,'PRICE_DISPLAY_NOT_PERMITTED');const answer=await tools.call('screenStocks',{query:q});assert.equal(answer.data.state,'UNAVAILABLE');assert.deepEqual(answer.data.stocks,[]);
 }
 const approved=await api.screen(Screener.build([{field:'momentum6m',operator:'gte',value:0,scale:'raw'}]));assert.equal(approved.state,'AVAILABLE');assert.ok(approved.stocks.some(s=>s.ticker==='NVDA'));
});
test('comparison preserves canonical evidence families and capability-driven company columns',async()=>{const result=await api.getComparison(['NVDA','MSFT','JPM','TSLA']);assert.equal(result.companies.length,4);assert.equal(result.partial,false);assert.ok(result.families.length>=5);const margin=result.families.find(f=>f.id==='quality').metrics.find(m=>m.metricId==='operatingMargin');assert.equal(margin.values[0].value,65.214);assert.ok(Number.isFinite(margin.values[3].value));assert.equal(result.ranking.state,'UNAVAILABLE');assert.equal((await api.getComparison(['NVDA','NVDA'])).reason,'INVALID_COMPARISON');});

test('Stock business evidence is identical to the canonical Quant workspace and fails independently',async()=>{const stock=await api.getStockIntelligence('NVDA');assert.deepEqual(stock.quant,await api.getQuantWorkspace('NVDA'));const partial=Service.create({loadJSON:async p=>{const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.endsWith('quant-factor-inputs.json'))x.versions.buildScript='unknown';return x;},displayPolicy:Policy,queryEngine:Query});const result=await partial.getStockIntelligence('NVDA');assert.equal(result.state,'AVAILABLE');assert.equal(result.chart.state,'AVAILABLE');assert.equal(result.quant.state,'UNAVAILABLE');});

test('Stock keeps independent canonical sources available when a legacy panel and chart bundle fail',async()=>{const partial=Service.create({loadJSON:async p=>{if(p.includes('/daily/'))throw Error('missing history');const x=JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));if(p.endsWith('quant-factor-inputs.json'))x.versions.buildScript='unknown';return x;},displayPolicy:Policy,queryEngine:Query});const result=await partial.getStockIntelligence('NVDA');assert.equal(result.state,'AVAILABLE');assert.equal(result.chart.state,'AVAILABLE');assert.equal(result.quant.state,'UNAVAILABLE');});

test('EOD health describes the canonical product universe without loading price histories',async()=>{const before=reads.length,health=await api.getMarketDataHealth();assert.equal(health.members.length,6875);assert.equal(health.isLive,false);assert.equal(health.scope,'EOD_COVERAGE_ONLY');assert.ok(reads.slice(before).includes('/quant/config/market-calendar.json'));assert.ok(['AVAILABLE','STALE'].includes((await api.getMarketDataHealth('TSLA')).state));assert.equal((await api.getMarketDataHealth('NVDA')).members[0].observedThrough,nvda.marketData.asOf);});
test('health refresh preserves the canonical company for lowercase stock links',async()=>{assert.deepEqual((await api.getMarketDataHealth('nvda')).members,(await api.getMarketDataHealth('NVDA')).members);assert.equal((await api.getMarketDataHealth('nvda')).members[0].ticker,'NVDA');});

test('ordinary fundamental views remain materialized and never require a PIT API',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));throw Error('ordinary view must stay static');};
 try{
  const service=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:Policy,queryEngine:Query});
  assert.equal((await service.getHistoricalFundamentals('TSLA',{period:'annual'})).state,'AVAILABLE');
  assert.equal((await service.getHistoricalFundamentals('NVDA',{period:'annual'})).state,'AVAILABLE');
  assert.deepEqual(calls,[]);
 }finally{globalThis.fetch=original;}
});
