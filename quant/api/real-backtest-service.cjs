/* Implementation behind product-services#getRealBacktest. Node/private-store only;
   never loaded by the public Quant browser bundle. No execution or data fetching. */
'use strict';
function create({options,identity,config,permission,identityModel}){
 const realBacktestCache=new Map();
 let realBacktestGeneration=null;
 async function getRealBacktest(ticker,selection={}){
  const unavailable=reason=>({state:'UNAVAILABLE',reason,certification:'NOT_CERTIFIED',productionApproved:false});
  if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(k=>!['period','section','expectedGeneration','expectedListingId'].includes(k)))return unavailable('INVALID_SELECTION');
  const {period='MAX',section='summary',expectedGeneration=null,expectedListingId=null}=selection;
  const preview=options.realBacktestPreview,store=options.realBacktestStore;
  if(preview?.enabled!==true||preview.audience!=='INTERNAL_REVIEW'||!store)return unavailable('REAL_BACKTEST_PREVIEW_DISABLED');
  const C=options.realBacktestContract||require('./real-backtest-contract.js');
  if(!C)return unavailable('CONTRACT_NOT_LOADED');
  if(!C.periods.includes(period)||!C.sections.includes(section)||typeof ticker!=='string'||!/^[A-Z0-9.-]{1,12}$/.test(ticker)||expectedGeneration!==null&&(typeof expectedGeneration!=='string'||!/^[a-f0-9]{64}$/.test(expectedGeneration))||expectedListingId!==null&&(typeof expectedListingId!=='string'||!/^[A-Za-z0-9:._-]{1,180}$/.test(expectedListingId)))return unavailable('INVALID_SELECTION');
  try{
   const instrument=await identity(ticker);if(!instrument||!C.safeId(instrument.masterMemberId))return unavailable('INVALID_IDENTITY');
   const configData=await config();if(!permission(configData,ticker).allowed)return unavailable('DISPLAY_NOT_PERMITTED');
   // Tiny pointer checked on every call; generation changes invalidate all cached summaries.
   const release=await store.loadJSON('release.json');
   if(release.schemaVersion!==C.VERSION||release.certification!=='NOT_CERTIFIED'||release.publiclyActivated!==false||!/^[a-f0-9]{64}$/.test(release.generation)||!/^\d{4}-\d{2}-\d{2}T/.test(release.computedAt)||!Number.isFinite(Date.parse(release.computedAt))||Date.parse(release.computedAt)>Date.now())return unavailable('INVALID_BACKTEST_RELEASE');
   if(expectedGeneration!==null&&expectedGeneration!==release.generation)return unavailable('GENERATION_CHANGED');
   if(realBacktestGeneration!==release.generation){realBacktestCache.clear();realBacktestGeneration=release.generation;}
   // Recheck the immutable pointer after asynchronous reads/digests. A selection
   // never combines sections from different generations, even without HTTP wiring.
   const finish=async result=>{const current=await store.loadJSON('release.json');return JSON.stringify(current)===JSON.stringify(release)?structuredClone(result):unavailable('GENERATION_CHANGED');};
   const id=instrument.masterMemberId,key=release.generation+':'+(release.shards?.[C.shard(id)]||'MISSING')+':'+id;
   let summary=realBacktestCache.get(key);
   if(!summary){
    const shardKey=C.shard(id),index=await store.loadJSON(release.generation+'/index/'+shardKey+'.json');
    if(await C.digest(index)!==release.shards[shardKey]||index.generation!==release.generation||!index.entries[id])return unavailable('BACKTEST_NOT_MATERIALIZED');
    summary=await store.loadJSON(release.generation+'/listings/'+id+'/summary.json');
    const {summaryHash,...payload}=summary;
    if(await C.digest(payload)!==summaryHash||summaryHash!==index.entries[id]||summary.computedAt!==release.computedAt||C.summaryViolations(summary,id,release.generation).length)return unavailable('BACKTEST_CONTRACT_VIOLATED');
    if(realBacktestCache.size>=32)realBacktestCache.delete(realBacktestCache.keys().next().value);realBacktestCache.set(key,summary);
   }
   if(JSON.stringify(release.calculationRuntime||null)!==JSON.stringify(summary.calculationRuntime||null))return unavailable('INVALID_BACKTEST_RUNTIME_BINDING');
   if(JSON.stringify(release.executionModel)!==JSON.stringify(summary.executionModel))return unavailable('INVALID_BACKTEST_RELEASE_MODEL');
   if(expectedListingId!==null&&expectedListingId!==summary.identity.listingId)return unavailable('IDENTITY_MISMATCH');
   // Listing join was resolved offline against the hashed security master; ticker
   // is checked again against today's canonical product directory before delivery.
   if(summary.state==='BLOCKED'&&!summary.identity.productIdentity)return await finish({schemaVersion:C.VERSION,calculationRuntime:summary.calculationRuntime||null,state:'BLOCKED',reason:'HISTORICAL_LISTING_NOT_UNIQUELY_MAPPED_TO_PRODUCT',identity:{sourceSecurityId:id,listingId:summary.identity.listingId,ticker:summary.identity.ticker},requestedIdentity:identityModel(instrument),period,section,returnBasis:'PRICE_RETURN',certification:'NOT_CERTIFIED',productionApproved:false,benchmarkState:'NOT_EVALUATED',generation:release.generation,asOf:summary.asOf,computedAt:summary.computedAt,executionModel:summary.executionModel,quality:summary.quality,kindScope:summary.kindScope,availableBacktestKinds:[],supportedPeriods:[],max:null});
   if(JSON.stringify(summary.identity.productIdentity)!==JSON.stringify(C.identityKey(instrument))||summary.identity.ticker!==ticker||summary.asOf>new Date().toISOString().slice(0,10))return unavailable('INVALID_BACKTEST_IDENTITY_OR_AS_OF');
   const base={schemaVersion:C.VERSION,calculationRuntime:summary.calculationRuntime||null,state:summary.state,identity:{...identityModel(instrument),sourceSecurityId:id,listingId:summary.identity.listingId},period,section,returnBasis:'PRICE_RETURN',certification:'NOT_CERTIFIED',productionApproved:false,benchmarkState:summary.periods[period]?.marketBenchmark.state||'NOT_EVALUATED',generation:release.generation,asOf:summary.asOf,computedAt:summary.computedAt,executionModel:summary.executionModel,quality:summary.quality,kindScope:summary.kindScope,availableBacktestKinds:summary.availableBacktestKinds,supportedPeriods:summary.supportedPeriods,max:summary.periods.MAX?.history||null};
   // Blocked listings NEVER deliver financial results, even when details were requested.
   if(summary.state==='BLOCKED'||section==='quality')return await finish(base);
   if(section==='summary')return await finish({...base,result:summary.periods[period]});
   if(section==='trades'&&!permission(configData,ticker,'raw').allowed)return unavailable('RAW_DISPLAY_NOT_PERMITTED');
   const descriptor=summary.periods[period].details[section];if(descriptor.bytes>2097152||descriptor.gzipBytes>262144)return unavailable('BACKTEST_PAYLOAD_LIMIT');
   const detail=await store.loadDetail(release.generation+'/listings/'+id+'/'+period+'-'+section+'.json.gz');
   if(await C.digest(detail)!==descriptor.hash||C.detailViolations(detail,summary,period,section).length)return unavailable('BACKTEST_DETAIL_CONTRACT_VIOLATED');
   return await finish({...base,result:detail});
  }catch{return unavailable('REAL_BACKTEST_SOURCE_UNAVAILABLE');}
 }
 return {getRealBacktest};
}
module.exports={create};
