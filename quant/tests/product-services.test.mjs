import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Service=require('../api/product-services.js'),Policy=require('../engines/display-policy.js'),Query=require('../engines/query.js');
const root=new URL('../../',import.meta.url);const reads=[];
const api=Service.create({loadJSON:async p=>{reads.push(p);return JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'));},displayPolicy:Policy,queryEngine:Query});
const materializedApi=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),loadCompressedJSON:async p=>JSON.parse(gunzipSync(await readFile(new URL(p.slice(1),root))).toString('utf8')),displayPolicy:Policy,queryEngine:Query});
const canonicalPanel=JSON.parse(await readFile(new URL('quant/data/sec/quant-factor-inputs.json',root),'utf8')),nvda=canonicalPanel.securities.NVDA;
const technicalSource=JSON.parse(await readFile(new URL('quant/data/technical/instruments/NVDA.json',root),'utf8'));
/* DECKUNGSZAHLEN GEGEN DAS ARTEFAKT, NICHT GEGEN EIN EINGEFRORENES GESTERN.
 *
 * Hier standen 6875 / 5772 / 5676 / 5590 / 5888 als Zahlen im Test. Am
 * 25.09.2026 hat die erweiterte Kalenderdeckung 166 Titeln erstmals ein
 * Technical-Bundle gegeben - und genau dieser Ertrag hat den Lauf
 * 36121705323 rot gemacht, nachdem die Materialisierung fertig war.
 *
 * Eine Verbesserung der Deckung darf einen Test nicht brechen. Was er
 * pruefen soll, ist der Vertrag: der Dienst meldet, was das Artefakt
 * traegt - nicht was es einmal getragen hat. Die untere Schranke bleibt,
 * damit ein stiller Einbruch der Deckung weiterhin auffaellt. */
const technicalSummary=JSON.parse(await readFile(new URL('quant/data/product/technical-signals-v1/summary.json',root),'utf8'));
const signals20=JSON.parse(gunzipSync(await readFile(new URL('quant/data/product/technical-signals-v1/signals-20.json.gz',root))));
const capability=JSON.parse(await readFile(new URL('quant/data/universe/market-capability.json',root),'utf8'));
test('canonical product universe projects the full capability set; chart history is preserved',async()=>{const u=await api.getUniverse();assert.equal(u.stocks.length,capability.members.length);assert.ok(u.stocks.length>6000,'die Deckung des Produktuniversums ist eingebrochen');assert.ok(u.factorReady>=6401);assert.equal(u.scope,'CANONICAL_PRODUCT_UNIVERSE');const s=await api.getStockIntelligence('NVDA');assert.equal(s.state,'AVAILABLE');assert.equal(s.chart.state,'AVAILABLE');assert.ok(s.chart.bars.length>2500);assert.equal(s.price.value,nvda.fundamentals.price);assert.equal(s.momentum6m.value,nvda.fundamentals.momentum6m);});
test('canonical members outside the legacy panel remain addressable without raw fanout',async()=>{const s=await api.getStockIntelligence('TSLA');assert.equal(s.identityState,'AVAILABLE');assert.equal(s.state,'AVAILABLE');});
test('consumer breadth follows capabilities across representative cohorts',async()=>{
 for(const [ticker,fundamentals] of [['TSLA',true],['AMD',true],['MU',true],['MET',true],['O',true],['ASML',true],['BAC',true],['PLAB',true],['CRWV',false]]){
  const [stock,history,quant,technical,workspace]=await Promise.all([api.getStockIntelligence(ticker),api.getHistoricalFundamentals(ticker),api.getQuantWorkspace(ticker),api.getTechnicalIntelligence(ticker),api.getTechnicalWorkspace(ticker)]);
  assert.equal(stock.state,'AVAILABLE',ticker);assert.equal(stock.chart.state,'AVAILABLE',ticker);assert.equal(history.state,fundamentals?'AVAILABLE':'UNAVAILABLE',ticker);
  assert.equal(quant.state,'AVAILABLE',ticker);assert.equal(quant.score.state,'UNAVAILABLE',ticker);assert.equal(technical.state,'AVAILABLE',ticker);assert.equal(technical.evidenceLevel,'REDUCED_EVIDENCE',ticker);
  assert.equal(workspace.state,'UNAVAILABLE',ticker);assert.ok(stock.setupState);assert.notEqual(stock.setupState.availability?.state,'AVAILABLE',ticker);
 }
});
test('Discover/screener executes canonical Query AST on the full product set',async()=>{const q=Query.createQuery({filters:[{field:'momentum6m',operator:'gte',value:999,scale:'raw'}]});const result=await api.screen(q);assert.equal(result.eligible,capability.members.length);assert.deepEqual(result.stocks,[]);assert.ok(result.queryHash);});
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
 for(const c of discovered.collections){const screened=await api.screen(c.query);assert.equal(c.result.queryHash,screened.queryHash);assert.deepEqual(c.result.stocks,screened.stocks);assert.equal(c.result.eligible,capability.members.length);}
 const recipes=api.getRecipes();recipes[0].query.filters[0].value=999;
 assert.equal(api.getRecipes()[0].query.filters[0].value,0);
});
test('Market Intelligence exposes scoped evidence without a synthetic market pulse',async()=>{
 const market=await api.getMarketIntelligence();assert.equal(market.marketPulse.state,'UNAVAILABLE');assert.equal(market.observations.length,capability.members.length);
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

test('Strategy context uses canonical current breadth without enabling Quant V2 ranking or historical results',async()=>{const c=await api.getStrategyContext();assert.equal(c.state,'AVAILABLE');assert.equal(c.definition.execution.timing,'next_open');assert.equal(c.currentSelection.scope,'CANONICAL_PRODUCT_UNIVERSE');assert.equal(c.currentSelection.selectable,capability.members.length);assert.equal(c.currentSelection.ranking.state,'UNAVAILABLE');assert.equal(c.currentSelection.ranking.reason,'QUANT_V2_NOT_ACTIVE');assert.equal(c.quantV2.methodologyVersion,'quant-v2.1.0');assert.equal(c.quantV2.status,'SPECIFIED_NOT_ACTIVE');assert.equal(c.quantV2.publicationAllowed,false);assert.deepEqual(c.quantV2.factorOrder,['quality','growth','momentum','value','profitability','revisions','risk']);assert.equal(c.quantV2.factorReadiness.revisions,'BLOCKED_EXTERNAL');assert.equal(c.backtest.state,'UNAVAILABLE');assert.equal(c.backtest.checks.length,5);assert.ok(!('results' in c.backtest));});

test('Portfolio valuation requires raw permission and never widens a derived-only grant',async()=>{const onlyDerived=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:args=>({allowed:args.form==='derived'})},queryEngine:Query});const result=await onlyDerived.getPortfolioIntelligence([{ticker:'NVDA',quantity:1}]);assert.equal(result.state,'INCOMPLETE');assert.equal(result.total,null);assert.equal(result.positions[0].price,null);assert.equal(result.positions[0].weight,null);});
test('Watchlist preserves selection and shares scoped canonical values without raw reads',async()=>{
 const data=await materializedApi.getWatchlistIntelligence(['NVDA','TSLA']);assert.equal(data.partial,false);assert.equal(data.scope,'USER_SELECTION_WITHIN_CANONICAL_PRODUCT_UNIVERSE');assert.equal(data.members[0].momentum6m.value,nvda.fundamentals.momentum6m);assert.equal(data.members[1].state,'AVAILABLE');assert.equal(data.members[1].ticker,'TSLA');assert.equal(data.members[1].intelligence.signals.state,'AVAILABLE');assert.equal(data.members[1].intelligence.technical.state,'AVAILABLE');assert.equal(data.members[1].intelligence.elliott.state,'AVAILABLE');assert.equal(data.coverage.selectable,technicalSummary.counts.productUniverse);assert.equal(data.coverage.signalsCapable,technicalSummary.counts.signalsCapable);assert.equal(data.coverage.technicalCapable,technicalSummary.counts.technicalFullBundles);assert.equal(data.coverage.elliottCapable,technicalSummary.counts.elliottCapable);assert.ok(data.coverage.technicalCapable>5000&&data.coverage.signalsCapable>5000&&data.coverage.elliottCapable>5000,'die publizierte Deckung ist eingebrochen');assert.equal((await api.getWatchlistIntelligence([])).state,'EMPTY');
});
test('Watchlist retains unavailable members during source failure and rejects invalid selection',async()=>{
 const bad=Service.create({loadJSON:async()=>{throw Error('offline')},displayPolicy:Policy,queryEngine:Query});assert.equal((await bad.getWatchlistIntelligence(['NVDA'])).members[0].state,'UNAVAILABLE');assert.equal((await bad.getWatchlistIntelligence(['<script>'])).reason,'INVALID_WATCHLIST');
});
test('Watchlist raw quote is suppressed under a derived-only grant',async()=>{const onlyDerived=Service.create({loadJSON:async p=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8')),displayPolicy:{...Policy,check:args=>({allowed:args.form==='derived'})},queryEngine:Query});const result=await onlyDerived.getWatchlistIntelligence(['NVDA']);assert.equal(result.members[0].price.value,null);assert.equal(result.members[0].price.reason,'DISPLAY_NOT_PERMITTED');assert.equal(result.members[0].momentum6m.value,nvda.fundamentals.momentum6m);});
test('Home uses an explicit featured set while watchlists retain canonical breadth',async()=>{const result=await materializedApi.getHomeIntelligence(['NVDA','TSLA']);assert.equal(result.market.observations.length,5);assert.equal(result.market.scope,'FEATURED_FULL_INTELLIGENCE_SET');assert.equal(result.watchlist.members.length,2);assert.equal(result.watchlist.partial,false);assert.equal(result.watchlist.scope,'USER_SELECTION_WITHIN_CANONICAL_PRODUCT_UNIVERSE');assert.equal(result.isLive,false);assert.equal(result.dataMode,'LATEST_AVAILABLE_EOD');});
test('Radar projects signal transitions and the point-in-time market regime, with Quant V2 and regime transitions still shut',async()=>{const radar=await materializedApi.getRadarIntelligence({lookback:20,limit:12});assert.equal(radar.state,'AVAILABLE');assert.equal(radar.scope,'CANONICAL_PRODUCT_UNIVERSE');assert.equal(radar.coverage.requested,signals20.counts.requested);assert.equal(radar.coverage.available,signals20.counts.available);assert.ok(radar.coverage.available>5000,'die Signalabdeckung ist eingebrochen');assert.equal(radar.modules.length,4);assert.ok(radar.modules.every(module=>module.items.length<=12));assert.ok(radar.modules.flatMap(module=>module.items).every(event=>['ENTERED','EXITED'].includes(event.transition)&&event.query));assert.equal(radar.quantScore.state,'UNAVAILABLE');assert.equal(radar.quantScore.reason,'QUANT_V2_NOT_ACTIVE');
 /* Market Regime war bis 2026-09-23 pauschal geschlossen. Zertifiziert ist
    jetzt die Punkt-in-der-Zeit-Stufe: sie ist aus einem Stichtag
    entscheidbar und wird veroeffentlicht. Die Uebergangsstufe bleibt zu -
    Hysterese und Beharrung sind Aussagen ueber einen Verlauf. Quant V2
    bleibt davon unberuehrt inaktiv. */
 const MarketRegime=require('../engines/market-regime.js');
 assert.equal(radar.marketRegime.state,'AVAILABLE');
 assert.ok(MarketRegime.PIT_STATES.includes(radar.marketRegime.regime));
 assert.equal(MarketRegime.PATH_STATES.includes(radar.marketRegime.regime),false);
 assert.equal(radar.marketRegime.transitions.state,'CLOSED');
 assert.ok(MarketRegime.PATH_CLOSED_REASONS.includes(radar.marketRegime.transitions.reason));
 assert.deepEqual(MarketRegime.publicationViolations(radar.marketRegime),[]);
 /* Jeder Anteil traegt seinen Nenner, damit eine Quote nicht ohne ihre
    Grundgesamtheit gelesen wird. */
 assert.equal(radar.marketRegime.measures.length,6);
 for(const m of radar.marketRegime.measures){assert.ok(m.observed>0,m.id);assert.ok(m.share>=0&&m.share<=1,m.id);}
 assert.equal((await materializedApi.getRadarIntelligence({lookback:7})).reason,'INVALID_RADAR_SELECTION');});
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

test('EOD health describes the canonical product universe without loading price histories',async()=>{const before=reads.length,health=await api.getMarketDataHealth();assert.equal(health.members.length,capability.members.length);assert.equal(health.isLive,false);assert.equal(health.scope,'EOD_COVERAGE_ONLY');assert.ok(reads.slice(before).includes('/quant/config/market-calendar.json'));assert.ok(['AVAILABLE','STALE'].includes((await api.getMarketDataHealth('TSLA')).state));assert.equal((await api.getMarketDataHealth('NVDA')).members[0].observedThrough,nvda.marketData.asOf);});
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
test('the setup state index is served from the cascade assignment, and a closed tier carries a reason instead of a zero',async()=>{
 const SetupEngine=require('../engines/setup-engine.js');
 const index=await materializedApi.getSetupScreenIndex();
 assert.equal(index.state,'AVAILABLE');
 assert.equal(index.approval.state,'APPROVED');
 assert.deepEqual(index.states.map(s=>s.state),SetupEngine.STATES);

 /* Jeder Titel steht in genau einer Lage: die Besetzungen der offenen
    Stufe ergeben zusammen die ausgewerteten Titel. */
 const open=index.states.filter(s=>s.availability.state==='AVAILABLE');
 assert.equal(open.length,SetupEngine.PIT_STATES.length);
 assert.equal(open.reduce((sum,s)=>sum+s.count,0),index.classified);
 assert.equal(index.classified+index.unclassified,index.universe);

 const seen=new Set();
 for(const entry of open)for(const rule of entry.rules){
  if(!Array.isArray(rule.tickers))continue;
  for(const ticker of rule.tickers){assert.equal(seen.has(ticker),false,ticker+' steht in zwei Lagen');seen.add(ticker);}
 }

 /* Und die veroeffentlichte Liste ist NICHT die Treffermenge des
    Praedikats: die Kaskade hat vorrangige Regeln zuerst bedient. Das ist
    der Fehler, den dieser Index verhindert. */
 const watch=index.states.find(s=>s.state==='WATCH');
 const confirmed=index.states.find(s=>s.state==='CONFIRMED');
 for(const ticker of confirmed.rules.flatMap(r=>r.tickers||[])){
  assert.equal(watch.rules.some(r=>(r.tickers||[]).includes(ticker)),false,ticker+' waere doppelt gelistet');
 }

 for(const entry of index.states.filter(s=>SetupEngine.PATH_STATES.includes(s.state))){
  assert.equal(entry.count,null,entry.state+' nennt eine Zahl, obwohl die Stufe geschlossen ist');
  assert.ok(SetupEngine.PATH_CLOSED_REASONS.includes(entry.availability.reason));
  for(const rule of entry.rules)assert.equal(rule.tickers,null);
 }

 /* Der Auffangzustand traegt eine Zahl, aber keine Liste. */
 const none=index.states.find(s=>s.state==='NO_SETUP');
 assert.ok(none.count>0);
 for(const rule of none.rules){assert.equal(rule.screenable,false);assert.equal(rule.tickers,null);}
});
test('the state index and the per-title observation cannot disagree',async()=>{
 const index=await materializedApi.getSetupScreenIndex();
 const listed=index.states.filter(s=>s.availability.state==='AVAILABLE')
  .flatMap(entry=>entry.rules.flatMap(rule=>(rule.tickers||[]).map(ticker=>({ticker,state:entry.state,ruleId:rule.ruleId}))));
 assert.ok(listed.length>100);
 /* Eine Stichprobe ueber beide Enden jeder Liste - die Shards einzeln zu
    lesen ist der teure Weg, und ein Widerspruch zeigt sich an den
    Raendern der Sortierung genauso wie in der Mitte. */
 const sample=[...listed.slice(0,20),...listed.slice(-20)];
 for(const entry of sample){
  const observation=await materializedApi.getSetupObservation(entry.ticker);
  assert.equal(observation.state,'AVAILABLE',entry.ticker);
  assert.equal(observation.classification.state,entry.state,entry.ticker);
  assert.equal(observation.matchedRule.ruleId,entry.ruleId,entry.ticker);
 }
});
test('a broken or unapproved index is refused rather than shown',async()=>{
 const wrongSchema=Service.create({loadJSON:async()=>({}),loadCompressedJSON:async()=>({schemaVersion:'something-else',states:[]}),displayPolicy:Policy,queryEngine:Query});
 assert.equal((await wrongSchema.getSetupScreenIndex()).reason,'INVALID_SETUP_ARTIFACT');
 const SetupEngine=require('../engines/setup-engine.js');
 const unapproved=Service.create({loadJSON:async()=>({}),loadCompressedJSON:async()=>({schemaVersion:SetupEngine.SCREEN_INDEX_SCHEMA,approval:{state:'PENDING_OWNER'},states:[]}),displayPolicy:Policy,queryEngine:Query});
 assert.equal((await unapproved.getSetupScreenIndex()).reason,'SETUP_MAPPING_NOT_APPROVED');
 const offline=Service.create({loadJSON:async()=>{throw Error('offline')},loadCompressedJSON:async()=>{throw Error('offline')},displayPolicy:Policy,queryEngine:Query});
 assert.equal((await offline.getSetupScreenIndex()).reason,'SOURCE_MISSING');
});
test('the backtest gate stays shut and says what is actually missing',async()=>{
 const screening=await materializedApi.getFactorEvidenceScreening();
 if(screening.reason==='METHODOLOGY_VERSION_SUPERSEDED')return;
 const context=await api.getStrategyContext();
 assert.equal(context.backtest.state,'UNAVAILABLE');
 assert.equal(context.backtest.reason,'REAL_BACKTEST_GATE_NOT_VALIDATED');
 const named=Object.fromEntries(context.backtest.checks);
 /* Zwei der fuenf Punkte sind gemessen, nicht behauptet: von jedem Index
    gibt es genau eine Mitgliedschafts-Momentaufnahme, und die Kursreihen
    sind splitbereinigt ohne Ausschuettungen. Ein Nutzer, dem nur 'nicht
    validiert' gesagt wird, kann nicht einschaetzen, ob das eine Formalie
    ist oder ein echtes Hindernis - hier sind es echte Hindernisse. */
 assert.match(named['Historisches Universum'],/genau eine Mitgliedschafts-Momentaufnahme/);
 assert.match(named['Kapitalmaßnahmen'],/splitbereinigt/);
 for(const [label,why] of context.backtest.checks){
  assert.ok(why.length>60,label+': die Begruendung erklaert nichts');
  assert.equal(/[A-Z_]{6,}/.test(why),false,label+': ein Code steht in der Nutzertext-Begruendung');
 }
});
test('the strategy index is the predicate answer, and an unmeasurable profile carries no zero',async()=>{
 const StrategyMatch=require('../engines/strategy-match.js');
 const contract=JSON.parse(await readFile(new URL('quant/methodology/strategy-profiles-v1.json',root),'utf8'));
 const index=await materializedApi.getStrategyIndex();
 assert.equal(index.state,'AVAILABLE');
 assert.equal(index.profiles.length,contract.profiles.length);
 /* Nach einem Methodikwechsel traegt das veroeffentlichte Artefakt noch
    die vorige Version, bis der naechste Lauf es nachholt. Dann ist die
    Nachrechnung gegen die Screening-Tabelle nicht moeglich - und genau
    DAS muss der Dienst sagen, statt eine Zahl zu liefern, die aus zwei
    Methodiken zusammengesetzt waere. */
 const screeningState=await materializedApi.getFactorEvidenceScreening();
 if(screeningState.reason==='METHODOLOGY_VERSION_SUPERSEDED'){
  assert.equal(screeningState.state,'UNAVAILABLE');
  assert.ok(screeningState.publishedMethodology&&screeningState.expectedMethodology,
   'Der Dienst nennt die beiden Versionen nicht');
  assert.notEqual(screeningState.publishedMethodology,screeningState.expectedMethodology);
  return;
 }

 /* Die veroeffentlichte Liste ist die Treffermenge des Praedikats - hier
    ohne Vorrangregel, weil ein Titel zu mehreren Stilen passen darf.
    Nachgerechnet ueber dieselbe Screening-Tabelle, die der Screener liest. */
 const screening=await materializedApi.getFactorEvidenceScreening();
 for(const entry of index.profiles){
  const profile=contract.profiles.find(p=>p.profileId===entry.profileId);
  assert.equal(entry.predicateHash,StrategyMatch.screenQuery(profile)&&
   require('../engines/rule-contract.js').predicateHash(StrategyMatch.predicateOf(profile)),entry.profileId);
  if(entry.availability.state!=='AVAILABLE'){
   assert.equal(entry.count,null,entry.profileId+' nennt eine Zahl, obwohl eine Eingabe fehlt');
   assert.equal(entry.tickers,null);
   assert.ok(StrategyMatch.INDEX_CLOSED_REASONS.includes(entry.availability.reason));
   assert.ok((entry.availability.fields||[]).length>0,entry.profileId+' nennt das fehlende Feld nicht');
   continue;
  }
  const expected=screening.rows.filter(r=>Query.matches(r,StrategyMatch.screenQuery(profile).filters)).map(r=>r.ticker);
  assert.equal(entry.count,expected.length,entry.profileId);
  assert.deepEqual(entry.tickers.slice().sort(),expected.slice().sort(),entry.profileId);
 }
 /* Genau ein Profil ist heute unauswertbar, und zwar wegen Revisions -
    dem Faktor, der ohne lizenzierte Konsensdaten fail-closed bleibt. */
 const closed=index.profiles.filter(p=>p.availability.state!=='AVAILABLE');
 assert.equal(closed.length,1);
 assert.deepEqual(closed[0].availability.fields,['quantV2.factorEvidence.revisions']);
 assert.ok(index.profiles.some(p=>p.count>0),'kein einziger Stil hat Treffer');
});
test('a strategy profile never claims a historical result, and says which data is missing',async()=>{
 const screening=await materializedApi.getFactorEvidenceScreening();
 if(screening.reason==='METHODOLOGY_VERSION_SUPERSEDED')return;
 const index=await materializedApi.getStrategyIndex();
 /* Der Index MISST seine Reihe, statt sie konstant zu verneinen - also wird
    hier der Vertrag geprueft und nicht ein Tageszustand: was auch kommt, es
    ist nie eine Ergebnisaussage.

    Nicht BACKTEST_NOT_CERTIFIED: das liest sich, als muesste nur noch
    jemand etwas freigeben. Fehlend ist ein historischer Faktorpanel -
    eine Datenluecke, kein Zertifizierungsschritt. */
 const hist=index.historicalEvidence;
 assert.ok(['UNAVAILABLE','PENDING_HISTORY','AVAILABLE'].includes(hist.state));
 if(hist.state==='PENDING_HISTORY'){
  assert.equal(hist.reason,'FACTOR_HISTORY_TOO_SHORT');
  assert.equal(hist.missing,hist.required-hist.published);
 }else if(hist.state==='AVAILABLE'){
  assert.equal(hist.kind,'ASSIGNMENT_PERSISTENCE');
  assert.deepEqual(hist.isNot,['RETURN','HIT_RATE','BACKTEST','PROBABILITY']);
 }else{
  assert.equal(hist.reason,'FACTOR_HISTORY_NOT_AVAILABLE');
 }
 /* Und in keinem Fall eine Rendite, egal wie das Feld heisst. */
 for(const key of ['return','totalReturn','cagr','hitRate','probability'])assert.equal(key in hist,false);
 /* Die deklarierte Evidenzversion ist die gelesene. Bis zum 25.09.2026 stand
    im Profilvertrag 1.0.0, waehrend die Tabelle 2.0.0 war - und die Seite
    schrieb die 1.0.0 hin. */
 assert.equal(index.evidenceMethodologyVersion,screening.methodologyVersion);
 const match=await materializedApi.getStrategyMatch('NVDA');
 for(const profile of match.profiles){
  assert.equal(profile.historicalEvidence.state,'UNAVAILABLE');
  assert.equal(profile.historicalEvidence.reason,'FACTOR_HISTORY_NOT_AVAILABLE');
 }
 assert.equal(match.ranking.state,'WITHHELD');
});
/* Was diesen Zustand aendern wuerde - am Dienst, nicht an der Engine.

   Zwei Faelle, und der zweite ist der wichtigere: solange das
   veroeffentlichte Artefakt die Zeile nicht traegt (Schema 1.0.0), ist die
   Frage nicht beantwortbar, und der Dienst sagt das mit Grund statt mit
   einer leeren Liste. Beide Schemata bleiben lesbar - ein harter Wechsel
   haette die ganze Setup-Sektion bis zur naechsten Materialisierung auf
   UNAVAILABLE gestellt. */
test('the cascade explanation comes with the row, and its absence is named',async()=>{
 const SetupEngine=require('../engines/setup-engine.js');
 const methodology=JSON.parse(await readFile(new URL('quant/methodology/setup-state-v1.json',root),'utf8'));
 const mapping=methodology.stateMapping;
 const row={status:'active',technicalTrend:'BULLISH',technicalConfirmedStructure:'BULLISH',
  technicalSetupStatus:'COMPLETE',technicalPrimaryDirection:'BULLISH',technicalEntryStatus:'AWAITING_TRIGGER',
  technicalVolumeState:'NORMAL',technicalMomentumState:'POSITIVE',technicalVolatilityRegime:'NORMAL',
  technicalDistanceTo52wHigh:-0.02};
 const observation=SetupEngine.evaluate({row,close:100,previous:null,historyDepth:0,methodology});
 const shard=(schemaVersion,extra)=>({schemaVersion,shard:'AA',engineVersion:SetupEngine.ENGINE_VERSION,
  mappingVersion:mapping.mappingVersion,approval:mapping.approval,publication:{},cascade:mapping.cascade.rules,
  instruments:{AAPL:{ticker:'AAPL',securityId:'ref_AAPL',asOf:'2026-09-10',dataCutoff:'2026-09-10',close:100,
   levels:{invalidationPrice:80,exitPrice:130},previous:null,observation:SetupEngine.compact(observation),...extra}}});
 const service=(payload)=>Service.create({loadJSON:async()=>({}),loadCompressedJSON:async()=>payload,
  displayPolicy:Policy,queryEngine:Query});

 const mitZeile=await service(shard(SetupEngine.SHARD_SCHEMA,{row})).getSetupObservation('AAPL');
 assert.equal(mitZeile.state,'AVAILABLE');
 assert.ok(Array.isArray(mitZeile.cascade));
 assert.equal(mitZeile.cascadeReason,null);
 const confirmed=mitZeile.cascade.find(r=>r.ruleId==='setup.confirmed.structure-trend-volume');
 assert.equal(confirmed.matched,false);
 assert.equal(confirmed.open.length,1);
 assert.equal(confirmed.open[0].field,'technicalVolumeState');

 const ohneZeile=await service(shard('setup-observation-product-1.0.0')).getSetupObservation('AAPL');
 assert.equal(ohneZeile.state,'AVAILABLE','die aeltere Fassung bleibt lesbar');
 assert.equal(ohneZeile.cascade,null);
 assert.equal(ohneZeile.cascadeReason,'SETUP_ROW_NOT_IN_ARTIFACT');

 const fremdesSchema=await service(shard('setup-observation-product-0.9.0',{row})).getSetupObservation('AAPL');
 assert.equal(fremdesSchema.reason,'INVALID_SETUP_ARTIFACT');
});
/* Ein nicht pruefbares Muster gehoert nicht in den Nenner.

   Gemessen ueber 5.569 Titel: 3.471 haben Muster, die fuer sie nicht messbar
   sind, und bei 1.494 davon sind es 181 von 250 - die Titel ohne
   Fundamentaldaten. "X von 250 geprueften Mustern" behauptet 250 Pruefungen,
   von denen 69 stattfanden. */
test('pattern coverage separates what was checked from what could not be',async()=>{
 const AAAP=await materializedApi.getPatternMatch('AAAP');
 if(AAAP.state!=='AVAILABLE')return;
 assert.equal(AAAP.hasFundamentals,false);
 assert.equal(AAAP.coverage.registered,AAAP.holds.length+AAAP.others.length);
 assert.equal(AAAP.coverage.measurable+AAAP.coverage.notMeasurable,AAAP.coverage.registered);
 assert.ok(AAAP.coverage.notMeasurable>100,'ein Titel ohne Geschaeftszahlen hat viele nicht pruefbare Muster');
 assert.equal(AAAP.coverage.reason,'NO_FUNDAMENTALS');
 /* Die drei Mengen sind disjunkt und vollstaendig. */
 assert.equal(AAAP.holds.length+AAAP.notHolding.length+AAAP.notMeasurable.length,AAAP.coverage.registered);
 assert.ok(AAAP.notMeasurable.every(row=>row.state==='NOT_MEASURABLE'));
 assert.ok(AAAP.notHolding.every(row=>row.state==='DOES_NOT_HOLD'));
 /* Und ein Titel MIT Geschaeftszahlen, dem nur eine Kennzahl fehlt, bekommt
    den anderen Grund - sonst waere die Unterscheidung nur ein Wort. */
 const AA=await materializedApi.getPatternMatch('AA');
 if(AA.state==='AVAILABLE'&&AA.hasFundamentals&&AA.coverage.notMeasurable){
  assert.equal(AA.coverage.reason,'FEATURE_NOT_MEASURABLE');
 }
});
