/** Research-only analytical admission. Measures immutable close observations;
 * never builds bars, adjusts prices, invokes engines, publishes or routes US.
 * A trusted independent verifier must authenticate every certificate. */
import { createHash } from 'node:crypto';
export const VERSION='vu-europe-analytics-series-evidence-1';
export const WINDOWS=['1Y','3Y','5Y','MAX'];
// Technical strategy inputs have no fundamental/share/filing-PIT dependency.
export const SUPERTRADER_INPUT_CERTIFICATES=Object.freeze(['identity','adjustment','ohlc','volume','corporateActions','benchmark','priceActionPit','execution']);
export const INDICATOR_POLICIES=Object.freeze({
 SMA20:{sessions:20},SMA50:{sessions:50},SMA200:{sessions:200},
 MOMENTUM:{sessions:253},RSI:{sessions:15,recursive:true},
 VOLATILITY:{sessions:61},DRAWDOWN:{sessions:2,entireWindow:true},
 HIGH52W:{sessions:252,ohlc:true},BREAKOUT:{sessions:252,ohlc:true,volume:true},
 RELATIVE_STRENGTH:{sessions:253,benchmark:true}
});
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const copy=x=>JSON.parse(JSON.stringify(x));
const US_MICS=new Set(['XNYS','XNAS','ARCX','XASE','BATS','IEXG']);
const same=(a,b)=>Object.keys(b).every(k=>a?.[k]===b[k]);
function shiftYear(d,n){const x=new Date(d+'T00:00:00Z'),month=x.getUTCMonth();x.setUTCFullYear(x.getUTCFullYear()-n);if(x.getUTCMonth()!==month)x.setUTCDate(0);return x.toISOString().slice(0,10);}
export function inspectAnalyticsSeries(input){
 const x=copy(input),b=x.binding,p=x.points,c=x.calendar;
 if(!b||b.region!=='EUROPE'||!b.securityId||!b.listingId||!/^[A-Z0-9]{4}$/.test(b.mic||'')||US_MICS.has(b.mic)||!/^[A-Z]{3}$/.test(b.currency||'')||!Array.isArray(p)||!p.length||!c||c.mic!==b.mic||!Array.isArray(c.sessions)||!c.sessions.length)throw Error('EUROPE_ANALYTICS_BINDING_REQUIRED');
 let prev='';for(const row of p){if(!Array.isArray(row)||row.length!==2||!date(row[0])||row[0]<=prev||!Number.isFinite(row[1])||row[1]<=0)throw Error('INVALID_OR_DUPLICATE_CLOSE');prev=row[0];}
 prev='';const dates=c.sessions.map(r=>typeof r==='string'?r:r.date);for(const d of dates){if(!date(d)||d<=prev)throw Error('INVALID_EXACT_MIC_SESSIONS');prev=d;}
 const dateSet=new Set(dates),observedFirst=p[0][0],observedLast=p.at(-1)[0],first=x.sourceWindow?.from||observedFirst,last=x.sourceWindow?.to||observedLast;
 if(!date(first)||!date(last)||first>observedFirst||last<observedLast||!dateSet.has(first)||!dateSet.has(last))throw Error('SOURCE_WINDOW_MUST_COVER_ALL_REAL_OBSERVATIONS');
 if(p.some(row=>!dateSet.has(row[0]))||dates[0]>first||dates.at(-1)<last)throw Error('EXACT_MIC_CALENDAR_COVERAGE_REQUIRED');
 const pointsSha256=sha(p),calendarSessionsSha256=sha(dates);
 const windows={};
 for(const name of WINDOWS){
  const targetFrom=name==='MAX'?first:shiftYear(last,Number(name[0]));
  const expected=dates.filter(d=>d>=targetFrom&&d<=last),selected=p.filter(r=>r[0]>=targetFrom),observed=new Set(selected.map(r=>r[0]));
  const missingDates=expected.filter(d=>!observed.has(d));
  // A first available bar just after an anniversary is allowed only if that
  // anniversary was a non-session. No 95% span heuristic certifies analytics.
  const insufficientHistory=!expected.length||first>expected[0];
  windows[name]={requestedFrom:targetFrom,from:selected[0]?.[0]||null,to:last,
   observations:selected.length,expectedSessions:expected.length,missingSessions:missingDates.length,missingDates,
   insufficientHistory,sessionStatus:insufficientHistory?'SHORT_HISTORY':missingDates.length?'SESSION_GAPS':'COMPLETE',
   inputPriceBasis:x.priceBasis||'UNKNOWN'};
 }
 return {version:VERSION,binding:b,pointsSha256,calendarSessionsSha256,firstDate:first,lastDate:last,firstObservationDate:observedFirst,lastObservationDate:observedLast,observations:p.length,windows,
  syntheticBarsCreated:0,forwardFilledPrices:0,engineInvocations:0,publicationReady:false,usPopulationModified:false};
}
/** verifyCertificate receives copies of a certificate and exact computed
 * series/calendar identity. A positive result must echo all binding fields,
 * kind, sourceSha256 and exact series digests; {verified:true} cannot pass. */
export async function assessAnalyticsSeries(input,{verifyCertificate}={}){
 const x=copy(input),out=inspectAnalyticsSeries(x),binding={...out.binding,pointsSha256:out.pointsSha256,calendarSessionsSha256:out.calendarSessionsSha256,priceBasis:x.priceBasis||'UNKNOWN',sourceWindowFrom:out.firstDate,sourceWindowTo:out.lastDate};
 const bars=x.bars,barSeriesSha256=sha(bars||[]),volumeBasis=x.volumeBasis||'UNKNOWN';
 const ohlcAligned=Array.isArray(bars)&&bars.length===x.points.length&&bars.every((r,i)=>Array.isArray(r)&&r.length>=6&&r.length<=7&&r[0]===x.points[i][0]&&r[4]===x.points[i][1]&&r.slice(1,5).every(v=>Number.isFinite(v)&&v>0)&&r[2]>=Math.max(r[1],r[3],r[4])&&r[3]<=Math.min(r[1],r[2],r[4]));
 const volumeAligned=ohlcAligned&&bars.every(r=>Number.isFinite(r[5])&&r[5]>0);
 out.barSeriesSha256=barSeriesSha256;out.volumeBasis=volumeBasis;
 const required=[...SUPERTRADER_INPUT_CERTIFICATES,'fundamentals'];
 const certs={};
 for(const kind of required){
  const cert=x.certificates?.[kind];let a=null;
  const certificateBinding=kind==='benchmark'?{...binding,
   benchmarkPointsSha256:sha(x.benchmark?.points||[]),benchmarkSecurityId:x.benchmark?.securityId||null,
   benchmarkMic:x.benchmark?.mic||null,benchmarkCurrency:x.benchmark?.currency||null,
   benchmarkPriceBasis:x.benchmark?.priceBasis||null,benchmarkRegion:x.benchmark?.region||null}:kind==='priceActionPit'?{...binding,pitScope:'PRICE_ACTION_PIT'}:['ohlc','volume'].includes(kind)?{...binding,barSeriesSha256,volumeBasis}:binding;
  if(cert&&typeof verifyCertificate==='function'){try{a=copy(await verifyCertificate(kind,copy(cert),copy(certificateBinding)));}catch{a=null;}}
  certs[kind]=!!(a?.verified===true&&a.independent===true&&a.kind===kind&&digest(a.sourceSha256)&&same(a,certificateBinding));
 }
 if(x.priceBasis!=='CANONICAL_SPLIT_ADJUSTED')certs.adjustment=false;
 if(!ohlcAligned)certs.ohlc=false;
 if(!volumeAligned||x.priceBasis==='CANONICAL_SPLIT_ADJUSTED'&&volumeBasis!=='SPLIT_ADJUSTED_SHARES')certs.volume=false;
 const allDates=x.points.map(p=>p[0]),allDateSet=new Set(allDates),last=out.lastDate;
 const usableSessions=x.calendar.sessions.map(s=>typeof s==='string'?s:s.date).filter(d=>d<=last);
 const benchmark=x.benchmark?.points;
 const benchmarkDates=Array.isArray(benchmark)?new Map(benchmark):new Map();
 const benchmarkScope=x.benchmark?.region==='EUROPE'&&x.benchmark.securityId&&x.benchmark.securityId!==out.binding.securityId&&/^[A-Z0-9]{4}$/.test(x.benchmark.mic||'')&&!US_MICS.has(x.benchmark.mic)&&x.benchmark.currency===out.binding.currency&&x.benchmark.priceBasis==='CANONICAL_SPLIT_ADJUSTED';
 const benchmarkAligned=benchmarkScope&&Array.isArray(benchmark)&&benchmark.every((p,i)=>Array.isArray(p)&&date(p[0])&&Number.isFinite(p[1])&&p[1]>0&&(i===0||p[0]>benchmark[i-1][0]));
 const baseReasons=[];
 if(!certs.identity)baseReasons.push('IDENTITY_CERTIFICATE_REQUIRED');
 if(!certs.adjustment)baseReasons.push('CERTIFIED_SPLIT_ADJUSTED_SERIES_REQUIRED');
 if(!certs.corporateActions)baseReasons.push('CORPORATE_ACTION_CONTINUITY_CERTIFICATE_REQUIRED');
 for(const [name,w] of Object.entries(out.windows)){
  w.indicators={};
  const sessions=usableSessions.filter(d=>d>=w.requestedFrom);
  for(const [indicator,policy] of Object.entries(INDICATOR_POLICIES)){
   const reasons=[...baseReasons];
   const relevant=policy.entireWindow||policy.recursive?sessions:sessions.slice(-policy.sessions);
   if(w.insufficientHistory)reasons.push('REQUESTED_WINDOW_HISTORY_SHORT');
   if(relevant.length<policy.sessions)reasons.push('INDICATOR_WARMUP_INSUFFICIENT');
   if(relevant.some(d=>!allDateSet.has(d)))reasons.push('MISSING_REQUIRED_EXCHANGE_SESSION');
   if(policy.ohlc&&!certs.ohlc)reasons.push('OHLC_CERTIFICATE_REQUIRED');
   if(policy.volume&&!certs.volume)reasons.push('VOLUME_CERTIFICATE_REQUIRED');
   if(policy.benchmark&&(!certs.benchmark||!benchmarkAligned||relevant.some(d=>!benchmarkDates.has(d))))reasons.push('EXACT_DATE_EUROPE_BENCHMARK_REQUIRED');
   w.indicators[indicator]={status:reasons.length?'BLOCKED':'INPUT_EVIDENCE_READY',reasonCodes:[...new Set(reasons)],minimumSessions:policy.sessions,
    missingRequiredSessions:relevant.filter(d=>!allDateSet.has(d)).length,methodologyChanged:false,metric:null};
  }
  const completeness=w.sessionStatus==='COMPLETE';
  const strict=SUPERTRADER_INPUT_CERTIFICATES.every(kind=>certs[kind])&&completeness&&Object.values(w.indicators).every(r=>r.status==='INPUT_EVIDENCE_READY');
  w.analyticsStatus=baseReasons.length?'ANALYTICS_BLOCKED':completeness?'ANALYTICS_INPUT_EVIDENCE_READY':'ANALYTICS_PARTIAL';
  w.supertraderInputStatus=strict?'INPUT_EVIDENCE_READY':'BLOCKED';
  // Full strategy readiness remains the existing strategy-specific gate.
  w.supertraderReady=false;w.backtestReady=false;w.quantReady=false;
 }
 out.certificates=certs;out.certificatePolicy={supertraderInput:[...SUPERTRADER_INPUT_CERTIFICATES],priceActionPitScope:'PRICE_ACTION_PIT',fundamentalsDoNotGateTechnicalStrategyInputs:true};out.analysisOnly=true;out.metricsPublishable=false;out.tradingAdmission=false;
 return out;
}
