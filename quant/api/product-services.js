/* VU2 product services: the only file in this experience that knows storage
 * paths. Existing scoped display policy is applied before market data reads.
 * Financial values come from existing validated panel; no new factor engine. */
(function(g){
'use strict';
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
  ['Full Chart','/quant/stock/?ticker='+q],['Technical','/quant/technical/?symbol='+q],
  ['Elliott Wave','/quant/technical/?symbol='+q+'&layer=ELLIOTT'],
  ['Historische Fundamentals','/quant/data-inspector/'],['Quant','/quant/stock/?ticker='+q],
  ['Vergleichen','/vu2/?view=compare&ticker='+q],['Strategie testen','/quant/strategies/builder/']
 ].map(([label,href])=>({label,href}));}
 async function getUniverse(){try{const c=await init();const stocks=(c.preview.scope||[]).filter(t=>permission(c,t).allowed).map(t=>row(c,t)).filter(Boolean);return {state:stocks.length?'AVAILABLE':'UNAVAILABLE',stocks,scope:'APPROVED_DISPLAY_SET',totalMarketState:'UNAVAILABLE',reason:'NO_APPROVED_FULL_MARKET_VIEW'};}catch{return unavailable('SOURCE_MISSING');}}
 async function getStockIntelligence(ticker){ticker=String(ticker||'').toUpperCase();if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))return unavailable('INVALID_IDENTITY');
  try{const c=await init();if(!(c.preview.scope||[]).includes(ticker)||!permission(c,ticker,'raw').allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   const stock=row(c,ticker);if(!stock)return unavailable('SOURCE_MISSING');
   try{const p=await load('/quant/data/market/golden-preview/daily/ref_'+ticker+'.json');
    if(p.securityId!=='ref_'+ticker||p.provider!=='tiingo'||p.isMock===true||p.dataMode==='mock'||!p.publishBasis||!Array.isArray(p.bars))throw Error('identity');
    const bars=p.bars.filter(b=>validDate(b.date)&&b.date<=new Date().toISOString().slice(0,10));
    stock.chart={state:bars.length?'AVAILABLE':'SOURCE_MISSING',bars,adjustmentStatus:p.adjustmentStatus};
   }catch{stock.chart={state:'SOURCE_MISSING',bars:[]};}return stock;
  }catch{return unavailable('SOURCE_MISSING');}}
 async function screen(query){try{const c=await init();const universe=await getUniverse();if(universe.state!=='AVAILABLE')return universe;
  const rows=universe.stocks.map(s=>({...c.panel.securities[s.ticker].fundamentals,ticker:s.ticker,securityId:s.securityId,status:'active'}));
  const result=queryEngine.execute(query,rows);
  return {state:'AVAILABLE',query:result.query,queryHash:result.queryHash,scope:universe.scope,
   eligible:rows.length,stocks:result.rows.map(r=>universe.stocks.find(s=>s.ticker===r.ticker))};
 }catch{return unavailable('SOURCE_OR_QUERY_UNAVAILABLE');}}
 return {getUniverse,getStockIntelligence,screen,workspaces};
}
const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUProductServices=api;
})(typeof window!=='undefined'?window:globalThis);
