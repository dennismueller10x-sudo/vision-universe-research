/* Private read-only composition of existing Quant services. No HTTP server,
   session system, endpoint, UI, provider calls, writer or deployment. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const Service=require('../quant/api/product-services.js'),Store=require('./quant-backtest-store.cjs'),Freshness=require('./quant-backtest-freshness.cjs'),Master=require('../quant/engines/company-master.js');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function create({directory,root=path.resolve(__dirname,'..'),enabled=false,audience=null,allowedTickers=[]}={}){
 if(!Array.isArray(allowedTickers)||allowedTickers.length>128||allowedTickers.some(t=>typeof t!=='string'||!/^[A-Z0-9.-]{1,12}$/.test(t)))throw Error('INVALID_READER_SCOPE');
 const grants=new Set(allowedTickers),active=enabled===true&&audience==='INTERNAL_REVIEW';let service=null,store=null,freshness=null,contextKey=null;const shards=new Map();
 if(active){store=Store.create({directory,repositoryRoot:root});freshness=Freshness.create({root,directory});}
 async function context(ticker){
  const files=['quant/config/development-preview.json','quant/config/feature-gates.json','quant/engines/display-policy.js','quant/data/universe/search-manifest.json','quant/engines/research-classification-evidence.cjs'];
  const values=await Promise.all(files.map(async p=>{try{return await fs.readFile(path.join(root,p));}catch(e){if(p.endsWith('search-manifest.json')&&e.code==='ENOENT')return Buffer.from('MISSING');throw e;}}));
  const shard=Master.shardKey(ticker),identityHash=hash(await fs.readFile(path.join(root,'quant/data/universe/instruments',shard+'.json')));
  return {key:hash(Buffer.concat(values)),policySource:values[2].toString(),shard,identityHash};
 }
 function makeService(policySource){
  // Same canonical policy engine, separate registry: removing a grant must not
  // inherit another reader/product's previous declaration. No untrusted code.
  const sandbox={module:{exports:{}}};vm.runInNewContext(policySource,sandbox,{timeout:1000,filename:'quant/engines/display-policy.js'});
  return Service.create({loadJSON:async p=>JSON.parse(await fs.readFile(path.join(root,p.replace(/^\//,'')),'utf8')),displayPolicy:sandbox.module.exports,queryEngine:require('../quant/engines/query.js'),realBacktestPreview:{enabled:true,audience},realBacktestStore:store});
 }
 return {async getRealBacktest(ticker,selection={}){
  const fail=reason=>({state:'UNAVAILABLE',reason,certification:'NOT_CERTIFIED',productionApproved:false});
  if(!active)return fail('REAL_BACKTEST_PREVIEW_DISABLED');
  // Trusted server-side scope only; this is NOT an end-user authentication layer.
  if(!grants.has(ticker))return fail('NOT_AUTHORIZED');
  try{
   const before=await context(ticker),release=await store.loadJSON('release.json'),key=release.generation+':'+before.key;
   if(key!==contextKey||shards.has(before.shard)&&shards.get(before.shard)!==before.identityHash){service=makeService(before.policySource);contextKey=key;shards.clear();}
   shards.set(before.shard,before.identityHash);const reader=service,r=await reader.getRealBacktest(ticker,selection);if(!r.generation)return r;
   r.delivery=await freshness(r);
   if(r.delivery.changedDependencies.some(x=>x==='SECURITY_MASTER'||x==='PRODUCT_IDENTITY'))return fail('BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED');
   const pointer=await store.loadJSON('release.json');if(pointer.generation!==r.generation)return fail('GENERATION_CHANGED');
   const after=await context(ticker);if(after.key!==before.key||after.identityHash!==before.identityHash)return fail('BACKTEST_ACCESS_CONTEXT_CHANGED');
   return r;
  }catch{return fail('REAL_BACKTEST_SOURCE_UNAVAILABLE');}
 }};
}
module.exports={create};
