/* VU2 product services: the only file in this experience that knows storage
 * paths. Existing scoped display policy is applied before market data reads.
 * Financial values come from existing validated panel; no new factor engine. */
(function(g){
'use strict';
const MarketSignals=typeof module!=='undefined'&&module.exports?require('./market-signal-contract.js'):g.VUMarketSignalContract;
const PortfolioWorkspace=typeof module!=='undefined'&&module.exports?require('./portfolio-workspace.js'):g.VUPortfolioWorkspace;
const WatchlistWorkspace=typeof module!=='undefined'&&module.exports?require('./watchlist-workspace.js'):g.VUWatchlistWorkspace;
const MarketHealth=typeof module!=='undefined'&&module.exports?require('./market-health-contract.js'):g.VUMarketHealthContract;
const MarketSession=typeof module!=='undefined'&&module.exports?require('./market-session-contract.js'):g.VUMarketSessionContract;
const CompareWorkspace=typeof module!=='undefined'&&module.exports?require('./compare-workspace.js'):g.VUCompareWorkspace;
const Methodology=typeof module!=='undefined'&&module.exports?require('../engines/methodology.js'):g.VUMethodology;
const Strategy=typeof module!=='undefined'&&module.exports?require('../engines/strategy.js'):g.VUStrategy;
const Rules=typeof module!=='undefined'&&module.exports?require('../engines/rule-contract.js'):g.VURuleContract;
const QuantWorkspace=typeof module!=='undefined'&&module.exports?require('./quant-workspace-contract.js'):g.VUQuantWorkspaceContract;
const TechnicalWorkspace=typeof module!=='undefined'&&module.exports?require('./technical-workspace-contract.js'):g.VUTechnicalWorkspaceContract;
const IntradaySnapshot=typeof module!=='undefined'&&module.exports?require('../engines/realtime/intraday-snapshot.js'):g.VURealtime?.IntradaySnapshot;
const History=typeof module!=='undefined'&&module.exports?require('./fundamentals-contract.js'):g.VUFundamentalsContract;
const Directory=typeof module!=='undefined'&&module.exports?require('../engines/instrument-directory.js'):g.VUInstrumentDirectory;
const Master=typeof module!=='undefined'&&module.exports?require('../engines/company-master.js'):g.VUCompanyMaster;
function create(options){
 const load=options.loadJSON, policy=options.displayPolicy, queryEngine=options.queryEngine; let ready,configReady,technicalReady;
 const directory=Directory.create({loadJSON:load});
 async function compressedJSON(path){
  if(options.loadCompressedJSON)return options.loadCompressedJSON(path);
  // Only this service constructs the same-origin canonical issuer path.
  if(!/^\/quant\/data\/sec\/quarterly\/[0-9]{2}\.json\.gz$/.test(path))throw Error('INVALID_ARTIFACT_PATH');
  const response=await fetch(path,{credentials:'omit'});if(!response.ok)throw Error('SOURCE_MISSING');
  const input=new Uint8Array(await response.arrayBuffer());if(input.length>131072)throw Error('ARTIFACT_TOO_LARGE');
  if(input[0]!==31||input[1]!==139){if(response.headers.get('content-encoding')==='gzip')return JSON.parse(new TextDecoder().decode(input));throw Error('INVALID_COMPRESSION');}
  if(typeof DecompressionStream!=='function')throw Error('DECOMPRESSION_UNSUPPORTED');
  const reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>1048576)throw Error('ARTIFACT_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(output));
 }
 async function identity(ticker){
  const result=await directory.getInstrument(ticker),i=result.instrument;
  if(result.status!=='OK'||!i||i.symbol!==ticker||!Master.inProductUniverse(i)||!/^vu_[a-f0-9]+$/.test(i.instrumentId)||!i.masterMemberId||!(i.legacyIds||[]).includes(i.masterMemberId))return null;
  return i;
 }
 function canonicalIdentity(i){return !!i&&Master.inProductUniverse(i)&&/^vu_[a-f0-9]+$/.test(i.instrumentId)&&!!i.masterMemberId&&(i.legacyIds||[]).includes(i.masterMemberId);}
 function identityModel(i){return {securityId:i.instrumentId,instrumentId:i.instrumentId,masterMemberId:i.masterMemberId,issuerId:i.issuerId||null,ticker:i.symbol,name:i.companyName||i.symbol,productEligibility:i.productEligibility};}
 async function searchInstruments(query,{limit=12}={}){
  const q=String(query||'').trim();if(!q)return {state:'AVAILABLE',entries:[],scope:'CANONICAL_PRODUCT_UNIVERSE'};
  const boundedLimit=Math.max(1,Math.min(30,Number.isInteger(limit)?limit:12));let failed=false;
  // Directory owns indexing, ranking and identity resolution. Isolate failures
  // per request because its optional-shard API otherwise treats I/O as no hits.
  const searchDirectory=Directory.create({loadJSON:async path=>{try{return await load(path);}catch(e){failed=true;throw e;}}});
  try{const result=await searchDirectory.search(q,{limit:boundedLimit*3});
   const resolved=await Promise.all(result.entries.map(e=>searchDirectory.getInstrument({symbol:e.s,instrumentId:e.i})));
   if(failed)return {state:'SOURCE_MISSING',reason:'DIRECTORY_SOURCE_UNAVAILABLE',entries:[]};
   const seen=new Set(),entries=[];
   for(let index=0;index<resolved.length;index++){const i=resolved[index].instrument,e=result.entries[index];if(resolved[index].status!=='OK'||!canonicalIdentity(i)||i.instrumentId!==e.i||seen.has(i.masterMemberId))continue;seen.add(i.masterMemberId);entries.push(identityModel(i));}
   return {state:'AVAILABLE',entries:entries.slice(0,boundedLimit),scope:'CANONICAL_PRODUCT_UNIVERSE',limited:result.entries.length===boundedLimit*3||entries.length>boundedLimit};
  }catch{return {state:'SOURCE_MISSING',reason:'DIRECTORY_SOURCE_UNAVAILABLE',entries:[]};}
 }
 async function identityOnlyStock(ticker,reason='PRODUCT_DATA_NOT_CONNECTED'){
  try{const result=await directory.getInstrument(ticker),i=result.instrument;if(result.status!=='OK'||i?.symbol!==ticker||!canonicalIdentity(i))return unavailable('INVALID_IDENTITY');
   const missing={state:'UNAVAILABLE',reason};
   return {...identityModel(i),state:'UNAVAILABLE',identityState:'AVAILABLE',reason,availability:{fundamentals:{...missing},history:{...missing},technical:{...missing},quant:{...missing},intraday:{...missing},realtime:{...missing}},workspaces:workspaces(ticker)};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 function config(){if(!configReady)configReady=Promise.all([
  load('/quant/config/development-preview.json'),load('/quant/config/feature-gates.json')
 ]).then(([preview,gates])=>{policy.declareFromConfig(preview);return {preview,gates:policy.gatesFromConfig(gates)};}).catch(e=>{configReady=null;throw e;});return configReady;}
 function init(){if(!ready)ready=Promise.all([config(),load('/quant/data/sec/quant-factor-inputs.json')])
 .then(([c,panel])=>({...c,panel})).catch(e=>{ready=null;throw e;});return ready;}
 function technicalSnapshots(){if(!technicalReady)technicalReady=Promise.all([
  load('/quant/data/technical/index.json'),load('/quant/data/technical/meta.json'),
  load('/quant/methodology/technical-v1.json'),load('/quant/methodology/elliott-v1.json')
 ]).then(([index,meta,technical,elliott])=>{
  const now=Date.now(),generated=Date.parse(index.generatedAt),metaGenerated=Date.parse(meta.generatedAt);
  if(!Array.isArray(index.instruments)||!Number.isFinite(generated)||generated>now||!Number.isFinite(metaGenerated)||metaGenerated>now||
    meta.bundleVersion!=='technical-bundle-1.0.0'||meta.methodologyVersions?.technical!==technical.methodologyVersion||
    meta.methodologyVersions?.elliott!==elliott.methodologyVersion||meta.goldenFive?.symbols!==5)throw Error('INVALID_TECHNICAL_INDEX');
  return {index,meta};
 }).catch(e=>{technicalReady=null;throw e;});return technicalReady;}
 function permission(c,ticker,form){return policy.check({providerId:'tiingo',dataClass:'marketData',audience:'development_preview',form:form||'derived',ticker,gates:c.gates});}
 function unavailable(reason){return {state:'UNAVAILABLE',reason,stocks:[]};}
 function metric(value,unit){return {value:Number.isFinite(value)?value:null,unit,state:Number.isFinite(value)?'AVAILABLE':'SOURCE_MISSING'};}
 function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
 const TECHNICAL_RULE_FIELDS=new Set(['technicalOpportunityScore','technicalTrend','technicalPrimaryDirection','elliottCountStatus']);
 async function technicalRuleRows(stocks){
  const {index,meta}=await technicalSnapshots(),today=new Date().toISOString().slice(0,10),rows={};
  for(const stock of stocks){
   const matches=index.instruments.filter(r=>r.instrumentId===stock.ticker&&!r.isMock&&r.dataMode==='real');
   if(matches.length!==1)throw Error('INVALID_TECHNICAL_INDEX');
   const r=matches[0];
   if(r.name!==stock.ticker||!validDate(r.asOf)||r.asOf>today||!Number.isFinite(r.opportunityScore)||r.opportunityScore<0||r.opportunityScore>100||
    !['BULLISH','BEARISH','NEUTRAL'].includes(r.trend)||!['BULLISH','BEARISH','NEUTRAL'].includes(r.primaryDirection)||
    !['OK','AMBIGUOUS','LOW_CONFIDENCE'].includes(r.elliottStatus)||!/^snap_[a-f0-9]{16}$/.test(r.snapshotId))throw Error('INVALID_TECHNICAL_INDEX');
   rows[stock.ticker]={technicalOpportunityScore:r.opportunityScore,technicalTrend:r.trend,
    technicalPrimaryDirection:r.primaryDirection,elliottCountStatus:r.elliottStatus,
    technicalAsOf:r.asOf,technicalMethodology:meta.methodologyVersions.technical,
    elliottMethodology:meta.methodologyVersions.elliott};
  }
  return rows;
 }
 async function row(c,ticker){
  const s=c.panel.securities[ticker];
  if(!s||!s.available||s.ticker!==ticker||s.securityId!=='sec_'+ticker)return null;
  if(!s.provenance||s.provenance.isMock!==false)return null;
  const instrument=await identity(ticker);if(!instrument)return null;
  const marketDate=s.marketData&&s.marketData.asOf;
  if(!validDate(marketDate)||marketDate>new Date().toISOString().slice(0,10))return null;
  const f=s.fundamentals||{};
  if(!validDate(f._asOfAvailableAt)||f._asOfAvailableAt>new Date().toISOString().slice(0,10))return null;
  const allowed=permission(c,ticker).allowed;
  const m=(key,unit,market=false)=>metric(market&&!allowed?null:f[key],unit);
  return {securityId:instrument.instrumentId,instrumentId:instrument.instrumentId,masterMemberId:instrument.masterMemberId,issuerId:instrument.issuerId,sourceSecurityId:s.securityId,ticker,name:s.reference.name,industry:s.reference.industry||null,
   state:'AVAILABLE',marketState:allowed?'AVAILABLE':'UNAVAILABLE',asOf:s.marketData&&s.marketData.asOf,
   fundamentalsAsOf:s.asOfPeriodEnd,availableAt:f._asOfAvailableAt||null,
   price:permission(c,ticker,'raw').allowed?m('price','USD',true):{value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'},momentum6m:m('momentum6m','percent',true),
   above200:m('priceTo200dma','percent',true),above50:m('priceTo50dma','percent',true),
   revenueGrowth:m('revenueGrowth','percent'),operatingMargin:m('operatingMargin','percent'),
   fcfMargin:m('fcfMargin','percent'),roic:m('roic','percent'),drawdown:m('maxDrawdown','percent',true),
   provenance:{fundamentals:'SEC EDGAR',market:allowed?'Tiingo EOD':null,methodology:'/quant/data-inspector/',
    marketMetricOwner:'quant/engines/factors.js',marketUnits:'percent; legacy definition, not market-factors ratio aliases'},
   workspaces:workspaces(ticker)};
 }
 function workspaces(t){const q=encodeURIComponent(t);return [
  ['Full Chart','/quant/stock/?ticker='+q],['Technical','/vu2/?view=technical&ticker='+q],
  ['Elliott Wave','/vu2/?view=elliott&ticker='+q],
  ['Historische Fundamentals','/vu2/?view=fundamentals&ticker='+q],['Quant','/vu2/?view=quant&ticker='+q],
  ['Vergleichen','/vu2/?view=compare&ticker='+q],['Strategie definieren','/vu2/?view=strategies']
 ].map(([label,href])=>({label,href}));}
 async function getUniverse(){try{const c=await init();const stocks=(await Promise.all((c.preview.scope||[]).filter(t=>permission(c,t).allowed).map(t=>row(c,t)))).filter(Boolean);return {state:stocks.length?'AVAILABLE':'UNAVAILABLE',stocks,scope:'APPROVED_DISPLAY_SET',totalMarketState:'UNAVAILABLE',reason:'NO_APPROVED_FULL_MARKET_VIEW'};}catch{return unavailable('SOURCE_MISSING');}}
 async function getMarketIntelligence(){
  const universe=await getUniverse();
  return {version:'1.0.0',state:universe.state,scope:universe.scope,
   marketPulse:{state:'UNAVAILABLE',reason:'NO_APPROVED_FULL_MARKET_VIEW'},
   observations:universe.stocks.map(stock=>({stock,trend:stock.above200.state!=='AVAILABLE'||stock.above50.state!=='AVAILABLE'
    ?{state:'SOURCE_MISSING',label:'Trend derzeit nicht verfügbar'}
    :{state:'AVAILABLE',label:stock.above200.value>0&&stock.above50.value>0?'Über wichtigen Trendbereichen':'Trendbereiche prüfen',
      explanation:'Vergleich des letzten verfügbaren Kurses mit dem 50- und 200-Tage-Durchschnitt. Keine Prognose.',
      evidence:[{label:'Abstand zum 50-Tage-Durchschnitt',metric:stock.above50},{label:'Abstand zum 200-Tage-Durchschnitt',metric:stock.above200}]}}))};
 }
 async function getTechnicalIntelligence(ticker){
  ticker=String(ticker||'').toUpperCase();
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await init();if(!(c.preview.scope||[]).includes(ticker)||!permission(c,ticker).allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   const stock=await row(c,ticker);if(!stock)return unavailable('SOURCE_MISSING');
   const source=await load('/quant/data/technical/instruments/'+ticker+'.json'),b=source.bundle;
   if(source.instrumentId!==ticker||source.isMock!==false||source.dataMode!=='real'||source.source!=='tiingo'||!b||b.instrumentId!==ticker||!validDate(b.dataCutoff)||b.dataCutoff>stock.asOf||!b.methodologyVersion) return unavailable('INVALID_TECHNICAL_PROVENANCE');
   function status(value,labels){return labels[value]?{state:'AVAILABLE',code:value,label:labels[value]}:{state:'SOURCE_MISSING',code:null,label:'Nicht verfügbar'};}
   return {state:'AVAILABLE',ticker,asOf:b.dataCutoff,methodology:b.methodologyVersion,
    trend:status(b.trend?.direction,{BULLISH:'Aufwärtstrend',BEARISH:'Abwärtstrend',NEUTRAL:'Keine klare Richtung',SIDEWAYS:'Seitwärts'}),
    momentum:status(b.momentum?.state,{POSITIVE:'Positiv',NEGATIVE:'Negativ',NEUTRAL:'Neutral'}),
    volatility:status(b.volatility?.regime,{NORMAL:'Normal',HIGH:'Erhöht',LOW:'Niedrig',EXTREME:'Sehr hoch'}),
    elliott:status(b.elliott?.status,{AMBIGUOUS:'Mehrere mögliche Zählungen',VALID:'Gültige Zählung',INSUFFICIENT_DATA:'Historie reicht nicht aus',NO_VALID_COUNT:'Keine gültige Zählung'}),
    elliottMethodology:b.elliottMethodologyVersion||null,isProbability:false,
    workspace:'/vu2/?view=technical&ticker='+encodeURIComponent(ticker),elliottWorkspace:'/vu2/?view=elliott&ticker='+encodeURIComponent(ticker)};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getStockIntelligence(ticker){ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const settings=await config();if(!(settings.preview.scope||[]).includes(ticker))return identityOnlyStock(ticker);if(!permission(settings,ticker,'raw').allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   const c=await init(),stock=await row(c,ticker);if(!stock)return unavailable('SOURCE_MISSING');
   try{const p=await load('/quant/data/market/golden-preview/daily/'+stock.masterMemberId+'.json');
    if(p.securityId!==stock.masterMemberId||p.provider!=='tiingo'||p.isMock===true||p.dataMode==='mock'||!p.publishBasis||!Array.isArray(p.bars))throw Error('identity');
    const bars=p.bars.filter(b=>validDate(b.date)&&b.date<=new Date().toISOString().slice(0,10));
    stock.chart={state:bars.length?'AVAILABLE':'SOURCE_MISSING',bars,adjustmentStatus:p.adjustmentStatus};
   }catch{stock.chart={state:'SOURCE_MISSING',bars:[]};}stock.quant=await getQuantWorkspace(ticker);stock.health=await marketHealth([stock]);return stock;
  }catch{const known=await identityOnlyStock(ticker,'SOURCE_MISSING');return known.identityState==='AVAILABLE'?known:unavailable('SOURCE_MISSING');}}
 async function getSignals({lookback=20}={}){
  try{const c=await init(),calendar=await load('/quant/config/market-calendar.json'),results=await Promise.all((c.preview.scope||[]).map(async ticker=>{
   if(!permission(c,ticker,'raw').allowed||!permission(c,ticker).allowed)return {ticker,state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED',events:[]};
   try{const stock=await row(c,ticker);if(!stock)return {ticker,state:'UNAVAILABLE',reason:'INVALID_IDENTITY',events:[]};return {ticker,...MarketSignals.build(await load('/quant/data/market/golden-preview/daily/'+stock.masterMemberId+'.json'),{ticker,recipes:getRecipes(),lookback,calendar})};}catch{return {ticker,state:'UNAVAILABLE',reason:'SOURCE_MISSING',events:[]};}
  }));const available=results.filter(r=>r.state==='AVAILABLE');return {state:available.length?'AVAILABLE':'UNAVAILABLE',partial:available.length!==results.length,results,events:available.flatMap(r=>r.events).sort((a,b)=>b.asOf.localeCompare(a.asOf)||a.ticker.localeCompare(b.ticker)),scope:'APPROVED_DISPLAY_SET'};
  }catch{return {state:'UNAVAILABLE',events:[],results:[],reason:'SOURCE_MISSING'};}
 }
 async function getComparison(tickers){let selected;try{selected=CompareWorkspace.validate(tickers);}catch{return {state:'UNAVAILABLE',reason:'INVALID_COMPARISON',companies:[],families:[]};}return CompareWorkspace.build(selected,await Promise.all(selected.map(async ticker=>{const model=await getQuantWorkspace(ticker);return model.state==='AVAILABLE'?model:{...model,ticker};})));}
 async function getMarketDataHealth(ticker){if(ticker!==undefined)ticker=String(ticker||'').toUpperCase();const data=await getUniverse();return marketHealth(ticker===undefined?data.stocks:data.stocks.filter(s=>s.ticker===ticker));}
 async function marketHealth(stocks){try{const calendar=await load('/quant/config/market-calendar.json');return MarketHealth.build(stocks,calendar);}catch{return MarketHealth.build(stocks,null);}}
 async function getMarketSession({now}={}){try{const calendar=await load('/quant/config/market-calendar.json');return MarketSession.build(calendar,now===undefined?new Date().toISOString():now);}catch{return MarketSession.build(null,now);}}
 async function getHomeIntelligence(tickers=[]){const [market,watchlist,session]=await Promise.all([getMarketIntelligence(),getWatchlistIntelligence(tickers),getMarketSession()]);try{const c=await init();market.observations=market.observations.map(o=>({...o,stock:permission(c,o.stock.ticker,'raw').allowed?o.stock:{...o.stock,price:{value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'}}}));}catch{market.observations=[];market.state='UNAVAILABLE';}return {version:'1.0.0',state:market.state,scope:market.scope,market,watchlist,session,health:await marketHealth(market.observations.map(o=>o.stock)),dataMode:'LATEST_AVAILABLE_EOD',isLive:false};}
 async function getWatchlistIntelligence(tickers){
  let selected;try{selected=WatchlistWorkspace.validate(tickers);}catch{return {state:'UNAVAILABLE',reason:'INVALID_WATCHLIST',members:[]};}
  if(!selected.length)return WatchlistWorkspace.build([],null);
  const universe=await getUniverse();
  try{const c=await init();return WatchlistWorkspace.build(selected,{...universe,stocks:universe.stocks.map(stock=>permission(c,stock.ticker,'raw').allowed?stock:{...stock,price:{value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'}})});}catch{return WatchlistWorkspace.build(selected,null);}
 }
 async function getPortfolioIntelligence(positions){try{const universe=await getUniverse(),c=await init();return PortfolioWorkspace.build(positions,{...universe,stocks:universe.stocks.map(stock=>permission(c,stock.ticker,'raw').allowed?stock:{...stock,marketState:'UNAVAILABLE'})});}catch{return unavailable('INVALID_PORTFOLIO');}}
 async function getStrategyContext(){
  try{const [quant,backtest]=await Promise.all([load('/quant/methodology/quant-v1.json'),load('/quant/methodology/backtest-v1.json')]);
   Methodology.configure({quant,backtest});return {state:'AVAILABLE',definition:Strategy.defaults(),factors:Strategy.RANKABLE_FACTORS,weightings:Strategy.WEIGHTINGS,
    rebalance:backtest.rebalance.allowed,timings:backtest.execution.allowedTimings,costs:backtest.costs,constraints:backtest.constraints,
    methodology:backtest.methodologyVersion,backtest:{state:'UNAVAILABLE',reason:'REAL_BACKTEST_GATE_NOT_VALIDATED',
     checks:[['Historische Fundamentaldaten','Aktuelle Faktorwerte sind kein historischer Point-in-Time-Datensatz.'],['Historisches Universum','Delistings und zeitabhängige Mitgliedschaft sind für diese Vorschau nicht validiert.'],['Kapitalmaßnahmen','Kurse, Splits, Ausschüttungen und Ausführung müssen gemeinsam geprüft sein.'],['Vergleichsindex','Für diese Vorschau ist kein echter Benchmark freigegeben.'],['Ausführung & Reproduktion','Kostenannahmen sind definiert; ein geprüfter historischer Lauf liegt noch nicht vor.']]}};
  }catch{return unavailable('STRATEGY_METHODOLOGY_MISSING');}
 }
 async function getQuantWorkspace(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await init();if(!(c.preview.scope||[]).includes(ticker))return unavailable('OUTSIDE_PREVIEW_SCOPE');
   const stock=await row(c,ticker);
   // Source alias validated by row() before adapting to the shared primary ID.
   return QuantWorkspace.build(stock,stock?{...c.panel.securities[ticker],securityId:stock.securityId}:null,c.panel.versions);
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getTechnicalWorkspace(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await init();if(!(c.preview.scope||[]).includes(ticker)||!permission(c,ticker,'raw').allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   const source=await load('/quant/data/technical/instruments/'+ticker+'.json');
   if(source.source!=='tiingo')return unavailable('UNSUPPORTED_MARKET_SOURCE');
   return TechnicalWorkspace.build(source,{ticker});
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getHistoricalFundamentals(ticker,selection={}){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   const c=await config();if(!(c.preview.scope||[]).includes(ticker)){
    if(!/^\d{10}$/.test(instrument.cik))return unavailable('FUNDAMENTAL_IDENTITY_UNAVAILABLE');
    if(selection.period==='quarterly'){
     const shard=instrument.cik.slice(-2),bucket=await compressedJSON('/quant/data/sec/quarterly/'+shard+'.json.gz');
     if(bucket?.schema!=='vu-quant-quarterly-shard-1.0.0'||bucket.shard!==shard)return unavailable('INVALID_QUARTERLY_SHARD');
     const projected=bucket.issuers?.[instrument.cik];if(!projected)return unavailable('SOURCE_MISSING');
     return History.buildQuarterly(projected,{...identityModel(instrument),cik:instrument.cik,metric:selection.metric,period:'quarterly'});
    }
    const consumer=await load('/discover/data/stocks/US_REAL/'+ticker+'.json');
    return History.buildConsumer(consumer,{...identityModel(instrument),cik:instrument.cik,metric:selection.metric,period:selection.period});
   }
   const index=await load('/quant/data/sec/inspector_index.json'),entry=index.companies?.find(s=>s.ticker===ticker);
   if(!entry?.cik||entry.cik!==instrument.cik)return unavailable('INVALID_IDENTITY');
   const source=await load('/quant/data/sec/inspector/'+ticker+'.json');
   return History.build(source,{ticker,cik:instrument.cik,metric:selection.metric,period:selection.period});
  }catch{return unavailable('SOURCE_MISSING');}
 }
 // Artifact paths are resolved from canonical identity, never a free-form URL.
 async function publicPermission(ticker,dataClass='marketData',form='raw'){
  const c=await config();return policy.check({providerId:'tiingo',dataClass,audience:'public',form,ticker,gates:c.gates}).allowed;
 }
 async function getHistoricalPriceHistory(ticker,selection={}){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  if(selection.columns&&selection.columns!=='close')return unavailable('OHLCV_NOT_IN_SERIES_ARTIFACT');
  if((selection.from&&!validDate(selection.from))||(selection.to&&!validDate(selection.to))||(selection.from&&selection.to&&selection.from>selection.to))return unavailable('INVALID_SELECTION');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   if(!await publicPermission(ticker))return unavailable('DISPLAY_NOT_PERMITTED');
   if(!/^[A-Za-z0-9_-]+$/.test(instrument.masterMemberId))return unavailable('INVALID_IDENTITY');
   const long=selection.range==='MAX'||selection.grain==='weekly';
   const path='/quant/data/market/discover-series'+(long?'-long':'')+'/'+instrument.masterMemberId+'.json';
   const source=await load(path),today=new Date().toISOString().slice(0,10);
   if(source.schemaVersion!==(long?'discover-series-long-1.0.0':'discover-series-1.1.0')||source.securityId!==instrument.masterMemberId||source.ticker!==ticker||source.dataMode!=='real'||source.source!=='tiingo'||source.provider!=='tiingo'||source.status!=='CALCULATED'||source.priceSeriesType!=='SPLIT_ADJUSTED'||source.grain!==(long?'weekly':'daily')||!source.publishBasis||!validDate(source.asOf)||source.asOf>today||!source.currency||!Array.isArray(source.points))return unavailable('INVALID_HISTORY_CONTRACT');
   let previous='';
   for(const point of source.points){if(!Array.isArray(point)||point.length!==2||!validDate(point[0])||point[0]<=previous||point[0]>source.asOf||!Number.isFinite(point[1])||point[1]<=0)return unavailable('INVALID_HISTORY_POINTS');previous=point[0];}
   const bars=source.points.filter(([date])=>(!selection.from||date>=selection.from)&&(!selection.to||date<=selection.to)).map(([date,close])=>({date,close}));
   return {state:bars.length?'AVAILABLE':'INSUFFICIENT_HISTORY',identity:identityModel(instrument),bars,grain:source.grain,currency:source.currency,asOf:source.asOf,adjustmentStatus:source.priceSeriesType,sourcePath:path,availableFrom:source.from,availableTo:source.to,columns:['close'],pitEligibility:'NOT_CERTIFIED',fullDailyHistory:false};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getIntraday(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   if(!await publicPermission(ticker,'intraday'))return unavailable('DISPLAY_NOT_PERMITTED');
   const index=await load('/quant/data/market/intraday/index.json');
   if(index.schemaVersion!=='intraday-index-1.1.0')return unavailable('INVALID_INTRADAY_INDEX');
   const today=new Date().toISOString().slice(0,10);
   const session=Object.keys(index.available||{}).filter(date=>validDate(date)&&date<=today&&Array.isArray(index.available[date])&&index.available[date].includes(ticker)).sort().at(-1);
   if(!session)return {state:'INTRADAY_UNAVAILABLE',identity:identityModel(instrument),reason:'NO_PUBLISHED_SNAPSHOT'};
   if(!/^[A-Za-z0-9_-]+$/.test(instrument.masterMemberId))return unavailable('INVALID_IDENTITY');
   const path='/quant/data/market/intraday/'+session+'/'+instrument.masterMemberId+'.json',snapshot=await load(path);
   if(snapshot.securityId!==instrument.masterMemberId||snapshot.symbol!==ticker||snapshot.sessionDate!==session||snapshot.publishable!==true||!IntradaySnapshot?.validate(snapshot).ok||!Number.isFinite(Date.parse(snapshot.asOf))||Date.parse(snapshot.asOf)>Date.now())return unavailable('INVALID_INTRADAY_CONTRACT');
   return {state:'INTRADAY_AVAILABLE',identity:identityModel(instrument),snapshot,points:snapshot.points,asOf:snapshot.asOf,sessionDate:session,isLive:false,isDelayed:snapshot.isDelayed,priceSemantics:'UNSPECIFIED',sourcePath:path};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getRealtimeCapability(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const instrument=await identity(ticker);if(!instrument)return unavailable('INVALID_IDENTITY');
   const c=await config(),stream=c.preview.stream;
   if(!stream?.enabled||!await publicPermission(ticker,'realtime','realtime'))return unavailable('DISPLAY_NOT_PERMITTED');
   if(stream.url!=='wss://live.visionuniverse.de/live')return unavailable('UNSUPPORTED_RELAY');
   return {state:'AVAILABLE',identity:identityModel(instrument),transport:'VISION_UNIVERSE_RELAY',url:stream.url,onDemand:true,connectionState:'NOT_CONNECTED',priceSemantics:'UNSPECIFIED',chartMovement:'TRADE_EVENTS_ONLY'};
  }catch{return unavailable('SOURCE_MISSING');}
 }
 function getRecipes(){return [
  {id:'positive-momentum',title:'Kursstärke entdecken',explanation:'Unternehmen mit nicht negativer Kursentwicklung über sechs Monate.',field:'momentum6m',threshold:0,rule:'Kursentwicklung über 6 Monate ≥ 0 %'},
  {id:'growing-business',title:'Wachsendes Geschäft',explanation:'Unternehmen, deren ausgewiesenes Umsatzwachstum mindestens 20 Prozent beträgt.',field:'revenueGrowth',threshold:20,rule:'Umsatzwachstum ≥ 20 %'},
  {id:'above-long-trend',title:'Über dem langfristigen Trend',explanation:'Unternehmen, deren Kurs auf oder über dem 200-Tage-Durchschnitt liegt.',field:'priceTo200dma',threshold:0,rule:'Abstand zum 200-Tage-Durchschnitt ≥ 0 %'}
 ].map(recipe=>{const predicate=Rules.create({filters:[{field:recipe.field,operator:'gte',value:recipe.threshold,scale:'raw'}]});return {...recipe,version:'1.0.0',predicate,predicateHash:Rules.predicateHash(predicate),query:Rules.toQuery(predicate,{sort:[{field:recipe.field,direction:'desc'}],limit:50})};});}
 async function getDiscover(){const collections=await Promise.all(getRecipes().map(async recipe=>({...recipe,result:await screen(recipe.query)})));return {collections,scope:'APPROVED_DISPLAY_SET'};}
 async function screen(query){try{const c=await init();const universe=await getUniverse();if(universe.state!=='AVAILABLE')return universe;
  if(!queryEngine.validate(query).valid)return unavailable('INVALID_SCREEN_RULES');
  const usesPrice=query.filters.some(f=>f.field==='price')||query.sort.some(s=>s.field==='price');
  if(usesPrice&&universe.stocks.some(s=>!permission(c,s.ticker,'raw').allowed))return unavailable('PRICE_DISPLAY_NOT_PERMITTED');
  const usesTechnical=[...query.filters.map(f=>f.field),...query.sort.map(s=>s.field)].some(field=>TECHNICAL_RULE_FIELDS.has(field));
  const technical=usesTechnical?await technicalRuleRows(universe.stocks):{};
  const rows=universe.stocks.map(s=>({...c.panel.securities[s.ticker].fundamentals,price:s.price.value,ticker:s.ticker,securityId:s.securityId,status:'active',...(technical[s.ticker]||{})}));
  const result=queryEngine.execute(query,rows);
  const predicate=Rules.fromQuery(result.query);
  return {state:'AVAILABLE',query:result.query,queryHash:result.queryHash,predicate,predicateHash:Rules.predicateHash(predicate),scope:universe.scope,
   eligible:rows.length,stocks:result.rows.map(r=>{const stock=universe.stocks.find(s=>s.ticker===r.ticker);if(!usesTechnical)return stock;
    const t=technical[r.ticker];return {...stock,
     technicalOpportunityScore:{value:t.technicalOpportunityScore,unit:'score',state:'AVAILABLE',asOf:t.technicalAsOf},
     technicalTrend:{value:t.technicalTrend,unit:'state',state:'AVAILABLE',asOf:t.technicalAsOf},
     technicalPrimaryDirection:{value:t.technicalPrimaryDirection,unit:'state',state:'AVAILABLE',asOf:t.technicalAsOf},
     elliottCountStatus:{value:t.elliottCountStatus,unit:'method_fit',state:'AVAILABLE',asOf:t.technicalAsOf,isProbability:false}};})};
 }catch{return unavailable('SOURCE_OR_QUERY_UNAVAILABLE');}}
 return {searchInstruments,getMarketDataHealth,getComparison,getHomeIntelligence,getMarketSession,getWatchlistIntelligence,getSignals,getPortfolioIntelligence,getStrategyContext,getQuantWorkspace,getTechnicalWorkspace,getHistoricalFundamentals,getHistoricalPriceHistory,getIntraday,getRealtimeCapability,getUniverse,getMarketIntelligence,getTechnicalIntelligence,getStockIntelligence,getRecipes,getDiscover,screen,workspaces};
}
const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUProductServices=api;
})(typeof window!=='undefined'?window:globalThis);
