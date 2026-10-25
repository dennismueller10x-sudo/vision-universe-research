/* UI handoff only: an injected existing Quant reader, immutable selections,
   no fetch, engine, storage, authorization, feature activation or rendering. */
(function(g){
'use strict';
const C=typeof module!=='undefined'&&module.exports?require('./real-backtest-contract.js'):g.VURealBacktestContract;
const VERSION='real-backtest-selection-1.0.0';
const unavailable=reason=>({state:'UNAVAILABLE',reason,certification:'NOT_CERTIFIED',productionApproved:false});
const tickerOK=t=>typeof t==='string'&&/^[A-Z0-9.-]{1,12}$/.test(t);
function valid(r){return r&&['AVAILABLE_LIMITED','BLOCKED'].includes(r.state)&&r.schemaVersion===C.VERSION&&r.certification==='NOT_CERTIFIED'&&r.productionApproved===false&&r.returnBasis==='PRICE_RETURN'&&r.kindScope==='SINGLE_LISTING_WEEKLY_REPLAY_NOT_AGGREGATE_SIGNAL_CERTIFICATION'&&/^[a-f0-9]{64}$/.test(r.generation||'')&&(r.state==='BLOCKED'?!r.result&&r.quality?.class==='C':r.identity?.listingId&&r.quality?.class==='B');}
function create({service}={}){
 if(!C||typeof service?.getRealBacktest!=='function')throw Error('EXISTING_QUANT_READER_REQUIRED');
 async function load(ticker,{period='MAX'}={}){
  if(!tickerOK(ticker)||!C.periods.includes(period))return unavailable('INVALID_SELECTION');
  let r;try{r=await service.getRealBacktest(ticker,{period,section:'summary'});}catch{return unavailable('REAL_BACKTEST_SOURCE_UNAVAILABLE');}
  if(r?.state==='UNAVAILABLE')return unavailable(r.reason||'REAL_BACKTEST_SOURCE_UNAVAILABLE');
  if(!valid(r)||r.period!==period||r.identity?.ticker!==ticker||r.state==='AVAILABLE_LIMITED'&&!r.result)return unavailable('BACKTEST_CONTRACT_VIOLATED');
  return {...structuredClone(r),selection:Object.freeze({schemaVersion:VERSION,ticker,period,generation:r.generation,listingId:r.identity.listingId||null,resultHash:r.result?.resultHash||null})};
 }
 async function read(selection,section){
  if(selection?.schemaVersion!==VERSION||!tickerOK(selection.ticker)||!C.periods.includes(selection.period)||!C.sections.includes(section)||!/^[a-f0-9]{64}$/.test(selection.generation||'')||selection.listingId!==null&&!/^[A-Za-z0-9:._-]{1,180}$/.test(selection.listingId||''))return unavailable('INVALID_SELECTION');
  let r;try{r=await service.getRealBacktest(selection.ticker,{period:selection.period,section,expectedGeneration:selection.generation,expectedListingId:selection.listingId});}catch{return unavailable('REAL_BACKTEST_SOURCE_UNAVAILABLE');}
  if(r?.state==='UNAVAILABLE')return unavailable(r.reason||'REAL_BACKTEST_SOURCE_UNAVAILABLE');
  if(!valid(r)||r.period!==selection.period||r.identity?.ticker!==selection.ticker)return unavailable('BACKTEST_CONTRACT_VIOLATED');
  if(r.generation!==selection.generation)return unavailable('GENERATION_CHANGED');
  if(r.identity.listingId!==selection.listingId)return unavailable('IDENTITY_MISMATCH');
  if(r.result&&r.result.resultHash!==selection.resultHash)return unavailable('RESULT_CHANGED');
  return structuredClone(r);
 }
 return {load,read};
}
const api={VERSION,create,periods:C?.periods?.slice()||[],sections:C?.sections?.slice()||[]};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VURealBacktestSelection=api;
})(typeof window!=='undefined'?window:globalThis);
