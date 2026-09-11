/* VU2 product services: the only file in this experience that knows storage
 * paths. Existing scoped display policy is applied before market data reads.
 * Financial values come from existing validated panel; no new factor engine. */
(function(g){
'use strict';
const MarketSignals=typeof module!=='undefined'&&module.exports?require('./market-signal-contract.js'):g.VUMarketSignalContract;
const PortfolioWorkspace=typeof module!=='undefined'&&module.exports?require('./portfolio-workspace.js'):g.VUPortfolioWorkspace;
const WatchlistWorkspace=typeof module!=='undefined'&&module.exports?require('./watchlist-workspace.js'):g.VUWatchlistWorkspace;
const MarketSession=typeof module!=='undefined'&&module.exports?require('./market-session-contract.js'):g.VUMarketSessionContract;
const Methodology=typeof module!=='undefined'&&module.exports?require('../engines/methodology.js'):g.VUMethodology;
const Strategy=typeof module!=='undefined'&&module.exports?require('../engines/strategy.js'):g.VUStrategy;
const QuantWorkspace=typeof module!=='undefined'&&module.exports?require('./quant-workspace-contract.js'):g.VUQuantWorkspaceContract;
const TechnicalWorkspace=typeof module!=='undefined'&&module.exports?require('./technical-workspace-contract.js'):g.VUTechnicalWorkspaceContract;
const History=typeof module!=='undefined'&&module.exports?require('./fundamentals-contract.js'):g.VUFundamentalsContract;
function create(options){
 const load=options.loadJSON, policy=options.displayPolicy, queryEngine=options.queryEngine; let ready;
 function init(){if(!ready)ready=Promise.all([
  load('/quant/config/development-preview.json'),load('/quant/config/feature-gates.json'),
  load('/quant/data/sec/quant-factor-inputs.json')
 ]).then(([preview,gates,panel])=>{policy.declareFromConfig(preview);return {preview,gates:policy.gatesFromConfig(gates),panel};}).catch(e=>{ready=null;throw e;});return ready;}
 function permission(c,ticker,form){return policy.check({providerId:'tiingo',dataClass:'marketData',audience:'development_preview',form:form||'derived',ticker,gates:c.gates});}
 function unavailable(reason){return {state:'UNAVAILABLE',reason,stocks:[]};}
 function metric(value,unit){return {value:Number.isFinite(value)?value:null,unit,state:Number.isFinite(value)?'AVAILABLE':'SOURCE_MISSING'};}
 function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
 function row(c,ticker){
  const s=c.panel.securities[ticker];
  if(!s||!s.available||s.ticker!==ticker||s.securityId!=='sec_'+ticker)return null;
  if(!s.provenance||s.provenance.isMock!==false)return null;
  const marketDate=s.marketData&&s.marketData.asOf;
  if(!validDate(marketDate)||marketDate>new Date().toISOString().slice(0,10))return null;
  const f=s.fundamentals||{};
  if(!validDate(f._asOfAvailableAt)||f._asOfAvailableAt>new Date().toISOString().slice(0,10))return null;
  const allowed=permission(c,ticker).allowed;
  const m=(key,unit,market=false)=>metric(market&&!allowed?null:f[key],unit);
  return {securityId:s.securityId,ticker,name:s.reference.name,industry:s.reference.industry||null,
   state:'AVAILABLE',marketState:allowed?'AVAILABLE':'UNAVAILABLE',asOf:s.marketData&&s.marketData.asOf,
   fundamentalsAsOf:s.asOfPeriodEnd,availableAt:f._asOfAvailableAt||null,
   price:m('price','USD',true),momentum6m:m('momentum6m','percent',true),
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
  ['Vergleichen','/vu2/?view=compare&ticker='+q],['Strategie testen','/quant/strategies/builder/']
 ].map(([label,href])=>({label,href}));}
 async function getUniverse(){try{const c=await init();const stocks=(c.preview.scope||[]).filter(t=>permission(c,t).allowed).map(t=>row(c,t)).filter(Boolean);return {state:stocks.length?'AVAILABLE':'UNAVAILABLE',stocks,scope:'APPROVED_DISPLAY_SET',totalMarketState:'UNAVAILABLE',reason:'NO_APPROVED_FULL_MARKET_VIEW'};}catch{return unavailable('SOURCE_MISSING');}}
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
   const stock=row(c,ticker);if(!stock)return unavailable('SOURCE_MISSING');
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
  try{const c=await init();if(!(c.preview.scope||[]).includes(ticker)||!permission(c,ticker,'raw').allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   const stock=row(c,ticker);if(!stock)return unavailable('SOURCE_MISSING');
   try{const p=await load('/quant/data/market/golden-preview/daily/ref_'+ticker+'.json');
    if(p.securityId!=='ref_'+ticker||p.provider!=='tiingo'||p.isMock===true||p.dataMode==='mock'||!p.publishBasis||!Array.isArray(p.bars))throw Error('identity');
    const bars=p.bars.filter(b=>validDate(b.date)&&b.date<=new Date().toISOString().slice(0,10));
    stock.chart={state:bars.length?'AVAILABLE':'SOURCE_MISSING',bars,adjustmentStatus:p.adjustmentStatus};
   }catch{stock.chart={state:'SOURCE_MISSING',bars:[]};}return stock;
  }catch{return unavailable('SOURCE_MISSING');}}
 async function getSignals({lookback=20}={}){
  try{const c=await init(),calendar=await load('/quant/config/market-calendar.json'),results=await Promise.all((c.preview.scope||[]).map(async ticker=>{
   if(!permission(c,ticker,'raw').allowed||!permission(c,ticker).allowed)return {ticker,state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED',events:[]};
   try{return {ticker,...MarketSignals.build(await load('/quant/data/market/golden-preview/daily/ref_'+ticker+'.json'),{ticker,recipes:getRecipes(),lookback,calendar})};}catch{return {ticker,state:'UNAVAILABLE',reason:'SOURCE_MISSING',events:[]};}
  }));const available=results.filter(r=>r.state==='AVAILABLE');return {state:available.length?'AVAILABLE':'UNAVAILABLE',partial:available.length!==results.length,results,events:available.flatMap(r=>r.events).sort((a,b)=>b.asOf.localeCompare(a.asOf)||a.ticker.localeCompare(b.ticker)),scope:'APPROVED_DISPLAY_SET'};
  }catch{return {state:'UNAVAILABLE',events:[],results:[],reason:'SOURCE_MISSING'};}
 }
 async function getMarketSession({now}={}){try{const calendar=await load('/quant/config/market-calendar.json');return MarketSession.build(calendar,now===undefined?new Date().toISOString():now);}catch{return MarketSession.build(null,now);}}
 async function getHomeIntelligence(tickers=[]){const [market,watchlist,session]=await Promise.all([getMarketIntelligence(),getWatchlistIntelligence(tickers),getMarketSession()]);try{const c=await init();market.observations=market.observations.map(o=>({...o,stock:permission(c,o.stock.ticker,'raw').allowed?o.stock:{...o.stock,price:{value:null,unit:'USD',state:'UNAVAILABLE',reason:'DISPLAY_NOT_PERMITTED'}}}));}catch{market.observations=[];market.state='UNAVAILABLE';}return {version:'1.0.0',state:market.state,scope:market.scope,market,watchlist,session,dataMode:'LATEST_AVAILABLE_EOD',isLive:false};}
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
   return QuantWorkspace.build(row(c,ticker),c.panel.securities[ticker],c.panel.versions);
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getTechnicalWorkspace(ticker){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await init();if(!(c.preview.scope||[]).includes(ticker)||!permission(c,ticker,'raw').allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   const source=await load('/quant/data/technical/instruments/'+ticker+'.json');
   if(source.source!=='tiingo')return unavailable('UNSUPPORTED_MARKET_SOURCE');
   return TechnicalWorkspace.build(source,{ticker});
  }catch{return unavailable('SOURCE_MISSING');}
 }
 async function getHistoricalFundamentals(ticker,selection={}){
  ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await init();if(!(c.preview.scope||[]).includes(ticker))return unavailable('OUTSIDE_PREVIEW_SCOPE');
   const index=await load('/quant/data/sec/inspector_index.json'),identity=index.companies?.find(s=>s.ticker===ticker);
   if(!identity?.cik)return unavailable('SOURCE_MISSING');
   const source=await load('/quant/data/sec/inspector/'+ticker+'.json');
   return History.build(source,{ticker,cik:identity.cik,metric:selection.metric,period:selection.period});
  }catch{return unavailable('SOURCE_MISSING');}
 }
 function getRecipes(){return [
  {id:'positive-momentum',title:'Kursstärke entdecken',explanation:'Unternehmen mit nicht negativer Kursentwicklung über sechs Monate.',field:'momentum6m',threshold:0,rule:'Kursentwicklung über 6 Monate ≥ 0 %'},
  {id:'growing-business',title:'Wachsendes Geschäft',explanation:'Unternehmen, deren ausgewiesenes Umsatzwachstum mindestens 20 Prozent beträgt.',field:'revenueGrowth',threshold:20,rule:'Umsatzwachstum ≥ 20 %'},
  {id:'above-long-trend',title:'Über dem langfristigen Trend',explanation:'Unternehmen, deren Kurs auf oder über dem 200-Tage-Durchschnitt liegt.',field:'priceTo200dma',threshold:0,rule:'Abstand zum 200-Tage-Durchschnitt ≥ 0 %'}
 ].map(recipe=>({...recipe,version:'1.0.0',query:queryEngine.createQuery({filters:[{field:recipe.field,operator:'gte',value:recipe.threshold,scale:'raw'}],sort:[{field:recipe.field,direction:'desc'}],limit:50})}));}
 async function getDiscover(){const collections=await Promise.all(getRecipes().map(async recipe=>({...recipe,result:await screen(recipe.query)})));return {collections,scope:'APPROVED_DISPLAY_SET'};}
 async function screen(query){try{const c=await init();const universe=await getUniverse();if(universe.state!=='AVAILABLE')return universe;
  const rows=universe.stocks.map(s=>({...c.panel.securities[s.ticker].fundamentals,ticker:s.ticker,securityId:s.securityId,status:'active'}));
  const result=queryEngine.execute(query,rows);
  return {state:'AVAILABLE',query:result.query,queryHash:result.queryHash,scope:universe.scope,
   eligible:rows.length,stocks:result.rows.map(r=>universe.stocks.find(s=>s.ticker===r.ticker))};
 }catch{return unavailable('SOURCE_OR_QUERY_UNAVAILABLE');}}
 return {getHomeIntelligence,getMarketSession,getWatchlistIntelligence,getSignals,getPortfolioIntelligence,getStrategyContext,getQuantWorkspace,getTechnicalWorkspace,getHistoricalFundamentals,getUniverse,getMarketIntelligence,getTechnicalIntelligence,getStockIntelligence,getRecipes,getDiscover,screen,workspaces};
}
const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUProductServices=api;
})(typeof window!=='undefined'?window:globalThis);
