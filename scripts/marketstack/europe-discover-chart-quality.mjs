/** Private Close-only chart quality. Sources/identity/quote contracts must be
 * authenticated upstream. This gate does not certify OHLC, volume, adjustments,
 * Technical, Quant, strategies, rights or publication. Provider values are never repaired. */
import { createHash } from 'node:crypto';
export const CLOSE_CHART_VERSION = 'europe-discover-close-chart-1';
export const CLOSE_CHART_POLICY = Object.freeze({ minimumObservations: 20, minimumSpanDays: 30, idealObservations: 200, idealSpanDays: 330,
  severeOneStepRatio: 2, maximumSessionLag: 3 });
const MICS = new Set(['XETR','XFRA','XBER','XDUS','XHAM','XHAN','XMUN','XSTU','XPAR','XAMS','XSWX','XVTX','XLON','XSTO','XCSE','XOSL','XHEL','XMAD','XMIL','XWBO','XBRU']);
const SHA = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isoDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const number = value => typeof value === 'number' && Number.isFinite(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function price(value) { if (number(value)) return value; if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value))) return Number(value); return null; }
const dateOf = row => { const value=row?.normalized?.tradingDate ?? row?.raw?.date ?? row?.date; return typeof value === 'string' && (isoDay(value) || timestamp(value)) ? value.slice(0,10) : null; };
const quoteCode = value => typeof value==='string' && /^[A-Z]{3}$/.test(value);
function calendarState(calendar, listing, now) {
  if (calendar?.verified!==true || !calendar.source || calendar.mic!==listing.mic || !Array.isArray(calendar.sessions) || !calendar.sessions.length) return null;
  const sessions=calendar.sessions;
  if (sessions.some(s=>!isoDay(s.date)||!timestamp(s.close)||new Date(s.close).toISOString().slice(0,10)!==s.date) || new Set(sessions.map(s=>s.date)).size!==sessions.length || sessions.some((s,i)=>i&&s.date<=sessions[i-1].date)) return null;
  const completed=sessions.filter(s=>Date.parse(s.close)<=Date.parse(now)),future=sessions.filter(s=>Date.parse(s.close)>Date.parse(now));
  if(!future.length)return null;
  return { completed:completed.map(s=>s.date), completedIndex:new Map(completed.map((s,i)=>[s.date,i])), latest:completed.at(-1)?.date, next:future[0]?{date:future[0].date,close:future[0].close}:null, coverageFrom:sessions[0].date,coverageTo:sessions.at(-1).date,all:new Set(sessions.map(s=>s.date)), source:calendar.source };
}
function quoteBound(listing) {
  const q=listing.quoteBasis;
  return Boolean(quoteCode(listing.currency)&&quoteCode(listing.quoteUnit)&&q&&q.mic===listing.mic&&q.currency===listing.currency&&q.quoteUnit===listing.quoteUnit&&
    q.providerSymbol===listing.providerSymbol&&(!listing.isin||q.isin===listing.isin)&&SHA(q.sourceSha256)&&
    ['OFFICIAL_LISTING_QUOTE_REFERENCE','PROVIDER_DOCUMENTED_QUOTE_CONTRACT','PROVIDER_EXPLICIT_QUOTE_CURRENCY'].includes(q.kind)&&
    (q.kind!=='PROVIDER_EXPLICIT_QUOTE_CURRENCY'||SHA(q.providerCurrencyObservationSha256)&&SHA(q.contractSchemaSha256))&&
    listing.quoteUnit===listing.currency&&
    (listing.currency!=='GBP'||q.kind==='PROVIDER_DOCUMENTED_QUOTE_CONTRACT'&&SHA(q.unitContractSha256)));
}
function sourceBound(row, listing, symbols) {
  const p=row.provenance, r=p?.responses?.find(r=>r.id===p.rawResponseId&&r.sha256===p.rawSha256);
  return Boolean(SHA(p?.rawSha256)&&SHA(p?.normalizedSha256)&&r&&r.status===200&&['/eod','/eod/latest'].includes(r.endpoint)&&r.params?.exchange===listing.mic&&
    String(r.params?.symbols||'').split(',').includes(row.normalized?.providerTicker??row.raw?.symbol)&&symbols.has(row.normalized?.providerTicker??row.raw?.symbol));
}
/** Exclusions are immutable known prior RAW quarantines, including Review rows.
 * Unknown action coverage alone never blocks an otherwise usable RAW Close chart. */
export function evaluateCloseChart({ listing={}, observations=[], calendar={}, now, excludedQuarantineDates, sourceRequestRanges={}, corporateActions=[], displayRange={}  }={}) {
  if (!Array.isArray(observations)||!Array.isArray(excludedQuarantineDates)||!timestamp(now)) throw TypeError('EXPLICIT_RAW_ARRAY_EXCLUSIONS_AND_UTC_EVALUATION_REQUIRED');
  const excluded=new Set(excludedQuarantineDates), symbols=new Set([listing.providerSymbol,...(listing.verifiedAliases??[])]), state=calendarState(calendar,listing,now), accepted=[], rejected=[], criticalIssues=[], warnings=[];
  const reasons=[];
  if(displayRange.from!=null&&!isoDay(displayRange.from)||displayRange.to!=null&&!isoDay(displayRange.to)||displayRange.from&&displayRange.to&&displayRange.from>displayRange.to)throw TypeError('INVALID_DISPLAY_RANGE');
  const allByDate=new Map();for(const row of observations){const date=dateOf(row);if(!allByDate.has(date))allByDate.set(date,[]);allByDate.get(date).push(row);}
  if(!listing.listingKey||!MICS.has(listing.mic)||!listing.providerSymbol)reasons.push('EXACT_EUROPE_LISTING_SCOPE_REQUIRED');
  if(!quoteBound(listing))reasons.push('EXPLICIT_QUOTE_CURRENCY_AND_UNIT_BASIS_REQUIRED');
  if(!state?.latest)reasons.push('CURRENT_EXACT_MIC_SESSION_CALENDAR_REQUIRED');
  for(const [index,row]of observations.entries()) {
    const raw=row.raw??row, n=row.normalized??row, date=dateOf(row), failures=[], close=price(raw.close), sourceId=row.provenance?.normalizedSha256;
    if(date&&(displayRange.from&&date<displayRange.from||displayRange.to&&date>displayRange.to))continue;
    if(!date)failures.push('INVALID_DATE');
    if(raw.date!==undefined&&raw.date!==null){const rd=(isoDay(raw.date)||timestamp(raw.date))?raw.date.slice(0,10):null;if(!rd||rd!==date)failures.push('RAW_NORMALIZED_DATE_CONFLICT');}
    if(excluded.has(date))failures.push('IMMUTABLE_PRIOR_RAW_QUARANTINE');
    if(close===null||close<=0)failures.push('INVALID_CLOSE');
    if(Object.hasOwn(n,'close')&&price(n.close)!==close)failures.push('NORMALIZED_CLOSE_DIFFERS_FROM_RAW');
    const reportedSymbols=[raw.symbol,raw.ticker,n.providerTicker].filter(v=>v!==undefined&&v!==null), reportedMics=[raw.exchange,raw.stock_exchange?.mic,n.providerExchange].filter(v=>v!==undefined&&v!==null);
    if(!reportedSymbols.length||reportedSymbols.some(v=>!symbols.has(v)))failures.push('SYMBOL_SCOPE_MISMATCH');
    if(!reportedMics.length||reportedMics.some(v=>v!==listing.mic))failures.push('MIC_SCOPE_MISMATCH');
    if(!sourceBound(row,listing,symbols))failures.push('AUTHENTICATED_SOURCE_SCOPE_BINDINGS_REQUIRED');
    const ref=row.provenance?.responses?.find(r=>r.id===row.provenance.rawResponseId), range=sourceRequestRanges[sourceId]??(ref?.endpoint==='/eod'?{from:ref.params.date_from,to:ref.params.date_to}:{});
    if(range.from!=null&&!isoDay(range.from)||range.to!=null&&!isoDay(range.to)||range.from&&range.to&&range.from>range.to)failures.push('INVALID_REQUEST_RANGE');
    if(date&&(range.from&&date<range.from||range.to&&date>range.to))failures.push('OUTSIDE_REQUESTED_RANGE');
    if(date&&(date>new Date(now).toISOString().slice(0,10)||state&&(!state.all.has(date)||date>state.latest)))failures.push('NON_SESSION_OR_UNCOMPLETED_DATE');
    const currencies=[raw.price_currency,raw.currency,n.currency].filter(v=>v!==null&&v!==undefined);
    if(currencies.some(v=>typeof v!=='string'||!/^[A-Za-z]{3}$/.test(v)||v.toUpperCase()!==listing.quoteUnit))failures.push('CURRENCY_OR_UNIT_CONFLICT');
    if(failures.length)rejected.push({index,date,reasonCodes:[...new Set(failures)],originalObservation:row});
    else accepted.push({date,close,sourceId,source:row.provenance,index,originalObservation:row});
  }
  const byDate=new Map();for(const row of accepted){if(!byDate.has(row.date))byDate.set(row.date,[]);byDate.get(row.date).push(row);}
  const bars=[];
  for(const [date,rows]of byDate){
    const allOriginal=allByDate.get(date)||[], sourceCounts=new Map();
    for(const row of allOriginal){const id=row.provenance?.normalizedSha256;sourceCounts.set(id,(sourceCounts.get(id)||0)+1);}
    if(new Set(rows.map(r=>r.close)).size!==1||[...sourceCounts.values()].some(n=>n>1)||rejected.some(r=>r.date===date&&r.reasonCodes.some(c=>c!=='IMMUTABLE_PRIOR_RAW_QUARANTINE'))){
      criticalIssues.push({date,code:'DUPLICATE_OR_CONFLICTING_DATE',sourceCount:allOriginal.length});continue;
    }
    bars.push({date,close:rows[0].close,sourceBindings:rows.map(r=>r.source)});
  }
  bars.sort((a,b)=>a.date.localeCompare(b.date));
  const annotations=[],segments=[];let segment=[];
  for(let i=0;i<bars.length;i++){
    const b=bars[i],prior=bars[i-1];let breakBefore=false;
    if(prior&&state){const gap=state.completedIndex.get(b.date)-state.completedIndex.get(prior.date)-1;if(gap>0){breakBefore=true;warnings.push({code:'MISSING_OR_EXCLUDED_SESSIONS',from:prior.date,to:b.date,missingSessions:gap});}}
    if(prior){const ratio=b.close/prior.close;
      if(ratio>=CLOSE_CHART_POLICY.severeOneStepRatio||ratio<=1/CLOSE_CHART_POLICY.severeOneStepRatio){
        const action=corporateActions.find(a=>['SPLIT','REVERSE_SPLIT'].includes(a.type)&&a.date===b.date&&a.mic===listing.mic&&symbols.has(a.symbol)&&number(a.ratio)&&a.ratio>0&&SHA(a.sourceSha256)&&Math.abs(Math.log(prior.close/b.close/a.ratio))<=Math.log(1.15));
        if(action){breakBefore=true;annotations.push({date:b.date,type:action.type,ratio:action.ratio,sourceSha256:action.sourceSha256,pricesAdjusted:false});warnings.push({code:'SOURCE_BACKED_SPLIT_RAW_PRICE_BREAK',date:b.date});}
        else criticalIssues.push({code:'SERIOUS_UNEXPLAINED_CLOSE_DISCONTINUITY',date:b.date,previousDate:prior.date,ratio});
      }
    }
    if(breakBefore&&segment.length){segments.push(segment);segment=[];}segment.push([b.date,b.close]);b.breakBefore=breakBefore;
  }
  if(segment.length)segments.push(segment);
  const firstDate=bars[0]?.date??null,lastDate=bars.at(-1)?.date??null,spanDays=firstDate&&lastDate?(Date.parse(lastDate)-Date.parse(firstDate))/86400000:0;
  const sessionLag=state&&lastDate&&state.completedIndex.has(lastDate)?state.completed.length-1-state.completedIndex.get(lastDate):null;
  const freshness=sessionLag===0?'CURRENT_LAST_SESSION':sessionLag!==null&&sessionLag>=1&&sessionLag<=3?'DELAYED':sessionLag!==null&&sessionLag>3?'STALE':'UNKNOWN';
  if(bars.length<CLOSE_CHART_POLICY.minimumObservations||spanDays<CLOSE_CHART_POLICY.minimumSpanDays)reasons.push('INSUFFICIENT_MEANINGFUL_CLOSE_HISTORY');
  if(['STALE','UNKNOWN'].includes(freshness))reasons.push('LAST_CLOSE_TOO_OLD_OR_UNVERIFIABLE');
  if(criticalIssues.length)reasons.push('CRITICAL_CLOSE_QUALITY_ISSUES');
  const chartStatus=reasons.length?'CHART_BLOCKED':sessionLag>=2||bars.length<CLOSE_CHART_POLICY.idealObservations||spanDays<CLOSE_CHART_POLICY.idealSpanDays||warnings.length||rejected.length?'CHART_LIMITED':'CHART_READY';
  return {version:CLOSE_CHART_VERSION,listingKey:listing.listingKey,companyId:listing.companyId??listing.companyKey??null,securityId:listing.securityId??null,listingId:listing.listingId??listing.listingKey??null,mic:listing.mic,providerSymbol:listing.providerSymbol,pointsSha256:digest(bars.map(b=>[b.date,b.close])),chartStatus,status:chartStatus,reasonCodes:reasons,points:bars.map(b=>[b.date,b.close]),pointRecords:bars.map(b=>({date:b.date,close:b.close,breakBefore:b.breakBefore,sourceBindings:b.sourceBindings})),segments,firstDate,lastDate,observationCount:bars.length,spanDays,currency:listing.currency,quoteUnit:listing.quoteUnit,priceBasis:'RAW_UNADJUSTED',quoteBasis:listing.quoteBasis,sessionLag,freshness,evaluatedAt:now,calendarSource:state?.source??null,calendarSourceSha256:calendar.sourceSha256??null,calendarProof:{mic:listing.mic,sourceSha256:calendar.sourceSha256??null,source:state?.source??null,coverageFrom:state?.coverageFrom??null,coverageTo:state?.coverageTo??null,expectedLastCompletedSession:state?.latest??null,nextScheduledSession:state?.next??null,evaluatedAt:now,verified:Boolean(state?.latest)},currencyComparison:'DOCUMENTED_ISO_CODE_CASE_INSENSITIVE_RAW_UNCHANGED',displayRange,sourceBindings:bars.flatMap(b=>b.sourceBindings),sourceInputSha256:digest(observations),immutableExclusionsSha256:digest(excludedQuarantineDates),excludedQuarantineDates:[...excludedQuarantineDates],criticalIssues,warnings,rejectedObservations:rejected,annotations,discoverChartEligible:chartStatus!=='CHART_BLOCKED',sourceAuthenticationRequiredUpstream:true,ohlcCertified:false,volumeCertified:false,adjustmentCertified:false,historicalIdentityCertified:false,quoteCurrencyTransitionCertified:false,technicalCertified:false,quantCertified:false,backtestCertified:false,publicationAllowed:false};
}
export const buildCloseChartEvidence = evaluateCloseChart;
