/* Historical EOD observations of existing rules. Reuses PanelBuilder,
 * Factors and Query; no new market metric or trade-semantic signal. */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Hours=node?require('../engines/realtime/market-hours.js'):g.VURealtime.MarketHours,Calendar=node?require('../config/market-calendar.json'):null;
const Panel=node?require('../engines/panel-builder.js'):g.VUPanelBuilder,Factors=node?require('../engines/factors.js'):g.VUFactors,Query=node?require('../engines/query.js'):g.VUQuery,Rules=node?require('../engines/rule-contract.js'):g.VURuleContract,Hash=node?require('../engines/hash.js'):g.VUHash;
function fail(reason){return {state:'UNAVAILABLE',reason,events:[]};}
function build(source,{ticker,securityId='ref_'+ticker,recipes,now=new Date().toISOString(),lookback=20,calendar=Calendar}){
 const bars=source?.bars,id=securityId;
 if(!/^ref_[A-Z0-9_]{1,32}$/.test(id))return fail('INVALID_SIGNAL_IDENTITY');
 if(source?.securityId!==id||source.ticker!==ticker||source.provider!=='tiingo'||source.isMock===true||source.dataMode==='mock'||!source.publishBasis||source.currency!=='USD'||source.adjustmentStatus!=='adjusted')return fail('INVALID_SIGNAL_PROVENANCE');
 if(!Array.isArray(bars)||bars.length<202)return fail('INSUFFICIENT_HISTORY');
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d<=now;
 for(let i=0;i<bars.length;i++){const b=bars[i];if(b.securityId!==id||!validDate(b.date)||(i&&b.date<=bars[i-1].date)||!Number.isFinite(b.close)||b.close<=0||!Number.isFinite(b.adjustedClose)||b.adjustedClose<=0)return fail('INVALID_SIGNAL_HISTORY');}
 if(!Number.isInteger(lookback)||lookback<1||lookback>60)return fail('INVALID_SIGNAL_WINDOW');
 if(bars.length<Factors.WINDOWS.dma200+lookback+1)return fail('INSUFFICIENT_HISTORY');
 const signalWindow=bars.slice(-(Factors.WINDOWS.dma200+lookback));
 if(signalWindow.some(b=>!Number.isFinite(b.splitFactor)||b.splitFactor<=0))return fail('CORPORATE_ACTION_RECONCILIATION_REQUIRED');
 const hasSplit=signalWindow.some(b=>b.splitFactor!==1),reconciliation=source.corporateActionReconciliation;
 if(hasSplit&&(!reconciliation||reconciliation.status!=='PASS'||reconciliation.method!=='CANONICAL_SPLIT_FACTORS_V1'||
   reconciliation.priceSeriesType!=='SPLIT_ADJUSTED'||!Number.isInteger(reconciliation.events)||reconciliation.events<1))return fail('CORPORATE_ACTION_RECONCILIATION_REQUIRED');
 const observedAt=source.updatedAt||source.fetchedAt;
 if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt))||observedAt.slice(0,10)<bars.at(-1).date||Date.parse(observedAt)>Date.parse(now))return fail('INVALID_SIGNAL_SNAPSHOT_TIME');
 if(!calendar?.exchanges?.XNYS)return fail('CALENDAR_UNAVAILABLE');
 const snapshotSession=Hours.sessionAt(observedAt,{calendar,exchange:'XNYS'}),lastSession=Hours.sessionAt(bars.at(-1).date+'T12:00:00Z',{calendar,exchange:'XNYS'});
 const close=lastSession.earlyClose||calendar.exchanges.XNYS.sessions.REGULAR.end;
 if(!snapshotSession.calendarCoverage||!lastSession.calendarCoverage||!lastSession.isTradingDay||snapshotSession.localDate<lastSession.localDate||(snapshotSession.localDate===lastSession.localDate&&snapshotSession.localTime<close))return fail('SESSION_NOT_CLOSED_AT_SNAPSHOT');
 for(const b of bars.slice(-(Factors.WINDOWS.dma200+lookback+1))){const session=Hours.sessionAt(b.date+'T12:00:00Z',{calendar,exchange:'XNYS'});if(!session.calendarCoverage||!session.isTradingDay)return fail('INVALID_SIGNAL_SESSION');}
 const rules=recipes.filter(r=>['momentum6m','priceTo200dma'].includes(r.field));
 if(!rules.length||rules.some(r=>r.version!=='1.0.0'||!Query.validate(r.query).valid||!Rules.validate(r.predicate).valid||r.predicateHash!==Rules.predicateHash(r.predicate)||r.predicateHash!==Rules.predicateHash(Rules.fromQuery(r.query))||r.predicate.filters.some(f=>!['momentum6m','priceTo200dma'].includes(f.field)||f.scale!=='raw')))return fail('UNSUPPORTED_SIGNAL_RULE');
 const result=Panel.buildPanel([source],{metric:'momentum'});if(!result.ok)return fail('INVALID_SIGNAL_ADJUSTMENTS');
 const p=result.panel,series=p.series[id],last=p.tradingDays.length-1,events=[];
 if(Array.from(series.close).some(v=>!Number.isFinite(v)||v<=0)||Array.from(series.adjustedClose).some(v=>!Number.isFinite(v)||v<=0))return fail('INVALID_SIGNAL_PANEL');
 let previous=Factors.priceMetrics(series,Math.max(200,last-lookback),null,null,id);
 const from=Math.max(201,last-lookback+1);
 for(let i=from;i<=last;i++){
  const current=Factors.priceMetrics(series,i,null,null,id);
  for(const rule of rules){if(!rule.predicate.filters.every(f=>Number.isFinite(previous?.[f.field])&&Number.isFinite(current?.[f.field])))return fail('INVALID_SIGNAL_METRIC');
   const transition=Rules.transition(previous,current,rule.predicate);if(!transition)continue;
   const event={ticker,definitionId:rule.id,definitionVersion:rule.version,predicateHash:rule.predicateHash,predicate:rule.predicate,queryHash:Query.queryHash(rule.query),rule:rule.rule,query:rule.query,
    transition,previousAsOf:p.tradingDays[i-1],asOf:p.tradingDays[i],snapshotAsOf:p.tradingDays[last],status:i===last?'LATEST_OBSERVATION':'HISTORICAL',
    expiration:{policy:'SUPERSEDED_BY_NEXT_EOD_OBSERVATION',at:p.tradingDays[i+1]||null},priority:'INFORMATION',priceSemantics:'EOD_OBSERVATION',
    evidence:rule.predicate.filters.map(f=>({metricId:f.field,previous:previous[f.field],current:current[f.field],unit:'percent',owner:'quant/engines/factors.js'})),
    provenance:{source:'existing approved EOD history',adjustmentStatus:source.adjustmentStatus,corporateActionReconciliation:hasSplit?reconciliation:null,calculationOwner:'quant/engines/factors.js',panelOwner:'quant/engines/panel-builder.js',observedAt:source.updatedAt||source.fetchedAt||null}};
   event.id=Hash.prefixedHash('sig',{ticker,definitionId:event.definitionId,version:event.definitionVersion,predicateHash:event.predicateHash,asOf:event.asOf,transition:event.transition});events.push(event);
  }previous=current;
 }
 return {state:'AVAILABLE',ticker,asOf:p.tradingDays[last],from:p.tradingDays[from-1],lookback,events:events.reverse(),scope:'APPROVED_DISPLAY_SET'};
}
const api={build};if(node)module.exports=api;else g.VUMarketSignalContract=api;
})(typeof window!=='undefined'?window:globalThis);
