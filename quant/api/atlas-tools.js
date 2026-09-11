/* Read-only VU2 lane over the existing AI tool registry. No language-model
 * provider, free network/filesystem tool, or legacy demo data path. */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Tools=node?require('../engines/ai-tools.js'):g.VUAiTools,Registry=node?require('../engines/metric-registry.js'):g.VUMetricRegistry,Screener=node?require('./screener-workspace.js'):g.VUScreenerWorkspace;
function create(product){
 const registry=Tools.createToolRegistry({}),allowed=[];
 const ticker=t=>{if(typeof t!=='string'||!/^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(t))throw Error('INVALID_TICKER');return t;};
 function register(name,description,parameters,handler){registry.register({name,description,parameters,category:'vu2_read_only'},handler);allowed.push(name);}
 register('getQuantEvidence','Existing factor values, definitions, dates and availability; never a fabricated score.',{ticker:{type:'string',required:true}},a=>product.getQuantWorkspace(ticker(a.ticker)));
 register('getTechnicalEvidence','Existing interpreted trend, momentum and volatility with methodology.',{ticker:{type:'string',required:true}},a=>product.getTechnicalIntelligence(ticker(a.ticker)));
 register('getHistoricalFundamentals','Validated historical accounting observations; latest-known is not PIT.',{ticker:{type:'string',required:true},metric:{type:'string',required:true},period:{type:'string',required:true}},a=>product.getHistoricalFundamentals(ticker(a.ticker),{metric:a.metric,period:a.period}));
 register('getMetricDefinition','One existing versioned metric definition; no calculation.',{metricId:{type:'string',required:true}},a=>{if(a.metricId.length>100)throw Error('INVALID_METRIC');const definition=Registry.get(a.metricId);return definition?{state:'AVAILABLE',definition}:{state:'UNAVAILABLE',reason:'UNKNOWN_METRIC'};});
 register('screenStocks','Same supported structured rules as the VU2 Screener; no natural-language execution.',{query:{type:'object',required:true}},a=>product.screen(Screener.decode(Screener.encode(a.query))));
 return Object.freeze({version:'1.0.0',mode:'READ_ONLY_PRODUCT_TOOLS',list:()=>registry.list().filter(d=>allowed.includes(d.name)).map(d=>JSON.parse(JSON.stringify(d))),
  call:(name,args)=>{if(!allowed.includes(name))return Promise.resolve({ok:false,tool:name,error:'TOOL_NOT_ALLOWED'});const definition=registry.list().find(d=>d.name===name);if(!args||typeof args!=='object'||Array.isArray(args)||![Object.prototype,null].includes(Object.getPrototypeOf(args))||Object.keys(args).some(k=>!Object.hasOwn(definition.parameters,k)))return Promise.resolve({ok:false,tool:name,error:'INVALID_ARGUMENTS'});return registry.call(name,args);}
 });
}
const api={create};if(node)module.exports=api;else g.VUAtlasTools=api;
})(typeof window!=='undefined'?window:globalThis);
