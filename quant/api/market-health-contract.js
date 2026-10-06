/* EOD coverage freshness only. No price, provider finality or general DQ claim. */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Session=node?require('./market-session-contract.js'):g.VUMarketSessionContract;
const Gate=node?require('../engines/market-eod-gate.js'):g.VUMarketEodGate;
const Hours=node?require('../engines/realtime/market-hours.js'):g.VURealtime.MarketHours;
function build(stocks,calendar,now=new Date().toISOString()){
 const base={version:'1.0.0',scope:'EOD_COVERAGE_ONLY',isLive:false,providerFinality:'NOT_CERTIFIED',qualityChecks:'NOT_EVALUATED',members:[]};
 const session=Session.build(calendar,now);
 if(session.state!=='AVAILABLE')return {...base,state:'UNAVAILABLE',reason:session.reason,expectedThrough:null};
 const closed=Gate.latestClosedSession(now,calendar);
 if(closed.state!=='AVAILABLE')return {...base,state:'UNAVAILABLE',reason:closed.reason,expectedThrough:null};
 if(!Array.isArray(stocks)||!stocks.length)return {...base,state:'UNAVAILABLE',reason:'NO_MARKET_OBSERVATIONS',expectedThrough:closed.date};
 const members=stocks.map(s=>{
  const member={ticker:typeof s?.ticker==='string'?s.ticker:null,observedThrough:null,expectedThrough:closed.date};
  if(!/^[A-Z0-9.-]{1,12}$/.test(member.ticker||''))return {...member,state:'PIPELINE_ERROR',reason:'INVALID_IDENTITY'};
  if(s.state!=='AVAILABLE'||s.marketState!=='AVAILABLE')return {...member,state:'UNAVAILABLE',reason:'MARKET_NOT_AVAILABLE'};
  const d=s.asOf;if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)return {...member,state:'PIPELINE_ERROR',reason:'INVALID_OBSERVATION_DATE'};
  member.observedThrough=d;if(d>closed.date)return {...member,state:'PIPELINE_ERROR',reason:'OBSERVATION_AFTER_CLOSED_SESSION'};
  const day=Hours.sessionAt(d+'T12:00:00Z',{calendar,exchange:'XNYS'});
  if(!day.calendarCoverage)return {...member,state:'UNAVAILABLE',reason:'OBSERVATION_CALENDAR_UNAVAILABLE'};
  if(!day.isTradingDay)return {...member,state:'PIPELINE_ERROR',reason:'NON_TRADING_OBSERVATION'};
  return {...member,state:d===closed.date?'AVAILABLE':'STALE',reason:d===closed.date?'COVERS_LAST_CLOSED_SESSION':'NEWER_CLOSED_SESSION_MISSING'};
 });
 return {...base,state:members.some(m=>m.state==='PIPELINE_ERROR')?'PIPELINE_ERROR':members.every(m=>m.state==='AVAILABLE')?'AVAILABLE':members.some(m=>m.state==='STALE')?'STALE':'UNAVAILABLE',asOf:session.asOf,expectedThrough:closed.date,members};
}
const api={build};if(node)module.exports=api;else g.VUMarketHealthContract=api;
})(typeof window!=='undefined'?window:globalThis);
