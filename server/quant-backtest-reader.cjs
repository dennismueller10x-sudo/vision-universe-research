/* Private read-only composition of existing Quant services. No HTTP server,
   session system, endpoint, UI, provider calls, writer or deployment. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const Service=require('../quant/api/product-services.js'),Store=require('./quant-backtest-store.cjs'),Freshness=require('./quant-backtest-freshness.cjs');
function create({directory,root=path.resolve(__dirname,'..'),enabled=false,audience=null,allowedTickers=[]}={}){
 if(!Array.isArray(allowedTickers)||allowedTickers.length>128||allowedTickers.some(t=>typeof t!=='string'||!/^[A-Z0-9.-]{1,12}$/.test(t)))throw Error('INVALID_READER_SCOPE');
 const grants=new Set(allowedTickers);let service=null,store=null,freshness=null;
 if(enabled===true&&audience==='INTERNAL_REVIEW'){
  store=Store.create({directory,repositoryRoot:root});freshness=Freshness.create({root,directory});
  service=Service.create({loadJSON:async p=>JSON.parse(await fs.readFile(path.join(root,p.replace(/^\//,'')),'utf8')),displayPolicy:require('../quant/engines/display-policy.js'),queryEngine:require('../quant/engines/query.js'),realBacktestPreview:{enabled:true,audience},realBacktestStore:store});
 }
 return {async getRealBacktest(ticker,selection={}){
  const fail=reason=>({state:'UNAVAILABLE',reason,certification:'NOT_CERTIFIED',productionApproved:false});
  if(!service)return fail('REAL_BACKTEST_PREVIEW_DISABLED');
  // Trusted server-side scope only; this is NOT an end-user authentication layer.
  if(!grants.has(ticker))return fail('NOT_AUTHORIZED');
  try{const r=await service.getRealBacktest(ticker,selection);if(!r.generation)return r;
   r.delivery=await freshness(r);const pointer=await store.loadJSON('release.json');if(pointer.generation!==r.generation)return fail('GENERATION_CHANGED');return r;
  }catch{return fail('REAL_BACKTEST_SOURCE_UNAVAILABLE');}
 }};
}
module.exports={create};
