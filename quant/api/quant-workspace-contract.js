/* Presentation mapping of existing factor-panel outputs. Catalog owns fields;
 * factors.js owns calculations. Never rank a five-security display set. */
(function(g){
'use strict';
const Catalog=typeof module!=='undefined'&&module.exports?require('../engines/catalog.js'):g.VUCatalog;
const families=[
 ['quality','Ertragskraft','Wie profitabel arbeitet das Unternehmen?',['operatingMargin','fcfMargin','roic']],
 ['growth','Wachstum','Wie verändert sich das Geschäft?',['revenueGrowth','epsGrowth','fcfGrowth','marginExpansion']],
 ['value','Bewertung','Welcher Preis steht dem Geschäft gegenüber?',['earningsYield','fcfYield','evToSales','priceToFcf']],
 ['momentum','Kursstärke','Wie hat sich der Kurs entwickelt?',['momentum3m','momentum6m','momentum12m','priceTo200dma']],
 ['risk','Kursrisiko','Wie stark schwankte der Kurs?',['volatility','downsideVolatility','maxDrawdown']]
];
function build(stock,source,versions){
 if(stock?.state!=='AVAILABLE'||source?.ticker!==stock.ticker||source?.securityId!==stock.securityId||source.provenance?.isMock!==false||versions?.buildScript!=='sec-quant-panel-1.1.0'||versions?.factPanelBridge!=='sec-fact-panel-1.0.0')return {state:'UNAVAILABLE',reason:'UNVALIDATED_FACTOR_SOURCE'};
 const dates=[stock.asOf,stock.fundamentalsAsOf,stock.availableAt];
 if(dates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d||d>new Date().toISOString().slice(0,10))||stock.fundamentalsAsOf>stock.availableAt)return {state:'UNAVAILABLE',reason:'INVALID_FACTOR_TIME'};
 const f=source.fundamentals||{};
 return {state:'AVAILABLE',version:'1.0.0',ticker:stock.ticker,name:stock.name,asOf:stock.asOf,fundamentalsAsOf:stock.fundamentalsAsOf,availableAt:stock.availableAt,
  score:{state:'UNAVAILABLE',reason:'INSUFFICIENT_PEER_UNIVERSE'},pitEligible:false,
  families:families.map(([id,label,question,ids])=>({id,label,question,metrics:ids.map(metricId=>{
   const field=Catalog.field(metricId),market=['value','momentum','risk'].includes(id),allowed=!market||stock.marketState==='AVAILABLE',value=allowed&&Number.isFinite(f[metricId])?f[metricId]:null;
   return {metricId,label:field.label,unit:field.unit,value,state:value===null?'SOURCE_MISSING':'AVAILABLE',reason:!allowed?'DISPLAY_NOT_PERMITTED':value===null?'SOURCE_MISSING':null,
    description:field.description,owner:'quant/engines/factors.js',catalog:'quant/engines/catalog.js',panelVersion:versions.buildScript,
    asOf:market?stock.asOf:stock.fundamentalsAsOf,availableAt:market?stock.asOf:stock.availableAt};
  })})),methodologyHref:'/quant/data-inspector/',legacyHref:'/quant/stock/?ticker='+encodeURIComponent(stock.ticker)};
}
const api={build};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUQuantWorkspaceContract=api;
})(typeof window!=='undefined'?window:globalThis);
