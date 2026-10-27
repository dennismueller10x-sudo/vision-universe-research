/* Operational freshness only; never a certification or data-quality override. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const A=require('../quant/engines/weekly-real-adapter.cjs'),C=require('../quant/api/real-backtest-contract.js');
function create({root,directory,clock=Date.now}){
 const cache=new Map();let snapshot=null;
 async function hash(relative){
  const file=path.join(root,relative);let stat;try{stat=await fs.stat(file);}catch{return 'MISSING';}
  const key=[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');const hit=cache.get(relative);if(hit?.key===key)return hit.hash;
  const h=A.hash(await fs.readFile(file,'utf8'));if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(relative,{key,hash:h});return h;
 }
 return async result=>{
  const gen=result.generation,id=result.identity?.sourceSecurityId;if(!/^[a-f0-9]{64}$/.test(gen||'')||!C.safeId(id))throw Error('INVALID_FRESHNESS_IDENTITY');
  if(snapshot?.generation!==gen){const file=path.join(directory,gen,'snapshot.json'),stat=await fs.stat(file);if(stat.size>2097152)throw Error('SNAPSHOT_TOO_LARGE');const s=JSON.parse(await fs.readFile(file));if(s.generation!==gen||A.hash(s.input)!==gen)throw Error('INVALID_SNAPSHOT');snapshot=s;}
  const input=snapshot.input,changed=new Set(),source=input.sources.find(s=>s.securityId===id);if(!source)throw Error('SNAPSHOT_SOURCE_MISSING');
  if(await hash('quant/data/market/discover-series-long/'+id+'.json')!==source.sourceHash)changed.add('PRICE_SERIES');
  if(await hash('quant/data/market/security-master/us-security-master.json')!==input.masterHash)changed.add('SECURITY_MASTER');
  // Classification evidence is an identity dependency. Legacy generations did
  // not bind it and must be rebuilt before any financial payload is returned.
  const classificationEvidence='quant/engines/research-classification-evidence.cjs';
  if(!input.codes[classificationEvidence]||await hash(classificationEvidence)!==input.codes[classificationEvidence])changed.add('PRODUCT_IDENTITY');
  for(const [p,expected] of Object.entries(input.codes)){if(!/^(?:quant\/(?:api|engines)\/[A-Za-z0-9._-]+\.(?:js|cjs)|scripts\/quant\/[A-Za-z0-9._-]+\.cjs)$/.test(p))throw Error('INVALID_CODE_DEPENDENCY');if(await hash(p)!==expected)changed.add('CALCULATION_CODE');}
  for(const [p,expected] of Object.entries(input.benchmarkInputs||{})){if(!['quant/data/market/multi-asset/series/SPY.json','quant/data/market/multi-asset/instruments.json','quant/data/market/discover-series/ref_SPY.json'].includes(p))throw Error('INVALID_BENCHMARK_DEPENDENCY');if(await hash(p)!==expected)changed.add('BENCHMARK');}
  const key=C.shard(id)+'.json';if(input.productShardHashes[key]&&await hash('quant/data/universe/instruments/'+key)!==input.productShardHashes[key])changed.add('PRODUCT_IDENTITY');
  const model=JSON.parse(await fs.readFile(path.join(root,'scripts/quant/contracts/weekly-execution-model-v2.json')));if(A.hash(model)!==A.hash(input.model))changed.add('EXECUTION_MODEL');
  const age=Math.max(0,Math.floor((clock()-Date.parse(result.asOf+'T00:00:00Z'))/86400000));
  return {state:changed.size?'STALE_INPUT_SNAPSHOT':'CURRENT_INPUT_SNAPSHOT',changedDependencies:[...changed].sort(),checkedAt:new Date(clock()).toISOString(),sourceAsOf:result.asOf,sourceAgeCalendarDays:age,sourceAgeNotice:age>7?'SOURCE_OLDER_THAN_7_CALENDAR_DAYS':null,meaning:'LOCAL_INPUT_CONSISTENCY_NOT_A_LIVE_DATA_OR_CERTIFICATION_CLAIM'};
 };
}
module.exports={create};
