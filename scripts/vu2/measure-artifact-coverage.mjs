// Offline measurement through actual Quant product contracts. No provider calls.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(process.argv[2]||process.cwd()),output=process.argv[3];
const Service=require('../../quant/api/product-services.js'),Master=require('../../quant/engines/company-master.js'),Policy=require('../../quant/engines/display-policy.js'),Query=require('../../quant/engines/query.js');
const cache=new Map();
async function loadJSON(path){
 if(cache.has(path))return cache.get(path);
 const value=JSON.parse(await readFile(resolve(root,'.'+path),'utf8'));
 if(path.includes('/universe/')||path.includes('/config/')||path.endsWith('/index.json'))cache.set(path,value);
 return value;
}
const api=Service.create({loadJSON,displayPolicy:Policy,queryEngine:Query});
const manifest=await loadJSON('/quant/data/universe/master-manifest.json'),members=[];
for(const {shard} of manifest.shards.index)members.push(...(await loadJSON('/quant/data/universe/instruments/'+shard+'.json')).instruments.filter(Master.inProductUniverse));
const names={fundamentals:'getHistoricalFundamentals',history:'getHistoricalPriceHistory',intraday:'getIntraday'},counts={},failures={};
for(const key of Object.keys(names)){counts[key]=0;failures[key]={};}
for(const member of members){
 for(const [key,method] of Object.entries(names)){
  const result=await api[method](member.symbol);
  if(['AVAILABLE','INTRADAY_AVAILABLE'].includes(result.state))counts[key]++;
  else {const reason=result.reason||result.state;failures[key][reason]=(failures[key][reason]||0)+1;}
 }
}
const report={scope:'LOCAL_RELEASE_CANDIDATE_ARTIFACTS_NOT_PRODUCTION_VERIFICATION',generatedAt:new Date().toISOString(),canonicalProductUniverse:members.length,uniqueSecurityIds:new Set(members.map(m=>m.instrumentId)).size,validatedAnnualRevenueHistory:counts.fundamentals,validatedDailyCloseHistory:counts.history,validatedIntradaySnapshots:counts.intraday,failures,realtimeUniverse:null,realtimeReason:'ON_DEMAND_EVENT_DELIVERY_NOT_MEASURED',backtestReadyUniverse:0,backtestReason:'QUANT_PRODUCT_REAL_BACKTEST_GATE_NOT_VALIDATED'};
if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
