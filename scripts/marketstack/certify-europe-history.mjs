/** Private listing/window certification. It never obtains provider data or
 * infers a corporate action from a jump. The caller must independently verify
 * raw versus adjusted field semantics for the named listing/window first.
 *
 * basisEvidence: {verified:true,kind:'LISTING_FIELD_WINDOW_VERIFICATION',isin,mic,
 *   from,to,ohlcBasis:'RAW'|'SPLIT_ADJUSTED',volumeBasis:'RAW_SHARES'|
 *   'SPLIT_ADJUSTED_SHARES',volumeUnit:'SHARES',evidence:[],actionsComplete:true,
 *   splitSemantics:{verified:true,direction:'NEW_SHARES_PER_OLD_SHARE',
 *     eventDate:'EX_DATE',evidence:[]},
 *   dividendSemantics:{verified:true,basis:'PER_NEW_SHARE_AT_EX_DATE',
 *     currency,evidence:[]}}
 * Neither a successful HTTP response nor documentation of field names is this
 * evidence. A separate action feed without a MIC cannot be auto-approved here.
 */
import {createHash} from 'node:crypto';
import ReturnSeries from '../../quant/engines/return-series.js';
import CanonicalBars from '../../quant/engines/technical/canonical-bars.js';
import CanonicalTotalReturn from '../../quant/engines/canonical-total-return.js';
import Features from '../../quant/engines/technical/feature-store.js';
import methodology from '../../quant/methodology/technical-v1.json' with {type:'json'};
import {checkCalendarWindow,checkEuropeanEodFreshness} from './europe-calendar.mjs';
export const EUROPE_HISTORY_CERTIFICATION_VERSION='europe-history-certification-1.0.0';
const num=v=>typeof v==='number'&&Number.isFinite(v);
const dateOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const refsOK=v=>Array.isArray(v)&&v.length>0&&v.every(r=>typeof r==='string'&&r.trim());
const verified=v=>v?.verified===true&&refsOK(v.evidence);
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq=v=>[...new Set(v)];
const validOHLC=b=>['open','high','low','close'].every(k=>num(b[k])&&b[k]>0)&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high);
const adjOf=b=>({open:b.adjustmentObservation?.open??b.adjustedOpen??null,high:b.adjustmentObservation?.high??b.adjustedHigh??null,
 low:b.adjustmentObservation?.low??b.adjustedLow??null,close:b.adjustmentObservation?.close??b.adjustedClose??null,
 volume:b.adjustmentObservation?.volume??b.adjustedVolume??null});
const decision=(status,causes,window,evidence,extra={})=>({status,causes:uniq(causes),window,evidence:uniq(evidence),...extra});

export function certifyEuropeanHistory({listing={},history={},asOf,calendar,window,basisEvidence={}}={}){
 if(!dateOK(asOf)||!dateOK(window?.from)||!dateOK(window?.to)||window.from>window.to||window.to>asOf)throw Error('FIXED_VALID_CERTIFICATION_WINDOW_REQUIRED');
 if(!Array.isArray(history.bars))throw Error('NORMALIZED_BARS_REQUIRED');
 const original=history.bars,inputSeriesHash=sha(original),evidence=Array.isArray(history.sourceEvidence)?history.sourceEvidence:[];
 const fullIssues=[];const priceIssues=[];const volumeIssues=[];const adjustmentIssues=[];const actionIssues=[];
 let previous=null;
 for(let i=0;i<original.length;i++){
  const b=original[i],date=b?.date||null;
  if(!dateOK(date)||(previous!==null&&date<=previous))fullIssues.push({date,cause:'PROVIDER_DATA_DEFECT',field:'date',reason:'INVALID_DUPLICATE_OR_UNORDERED_DATE'});
  if(dateOK(date))previous=date;
  if(dateOK(date)&&date>asOf)fullIssues.push({date,cause:'PROVIDER_DATA_DEFECT',field:'date',reason:'FUTURE_BAR'});
  if(!validOHLC(b||{}))priceIssues.push({date,cause:'PROVIDER_DATA_DEFECT',field:'OHLC',reason:'MISSING_OR_INVALID_OHLC'});
  if(b&&['isin','mic','currency','securityId','listingId'].some(k=>b[k]!==undefined&&b[k]!==listing[k]))fullIssues.push({date,cause:'MAPPING_ERROR',field:'identity',reason:'ROW_IDENTITY_OR_CURRENCY_CONFLICT'});
  if(!num(b?.volume)||b.volume<0)volumeIssues.push({date,cause:'UNVERIFIED_VOLUME_BASIS',field:'volume',reason:'MISSING_OR_INVALID_VOLUME'});
  const a=adjOf(b||{}),available=['open','high','low','close'].filter(k=>a[k]!==null);
  if(available.length===4){
   if(!validOHLC(a))adjustmentIssues.push({date,cause:'PROVIDER_DATA_DEFECT',field:'adjustedOHLC',reason:'INVALID_ADJUSTED_OHLC'});
   else if(validOHLC(b)){
    const ratio=a.close/b.close;
    if(['open','high','low'].some(k=>Math.abs(a[k]/b[k]-ratio)>Math.max(1e-6,Math.abs(ratio)*0.001)))adjustmentIssues.push({date,cause:'UNKNOWN_ADJUSTMENT_BASIS',field:'adjustedOHLC',reason:'ADJUSTED_OHLC_FIELD_FACTORS_DISAGREE'});
   }
  }else if(available.length)adjustmentIssues.push({date,cause:'UNKNOWN_ADJUSTMENT_BASIS',field:'adjustedOHLC',reason:'PARTIAL_ADJUSTED_FIELDS'});
  if(b?.splitFactor!==null&&b?.splitFactor!==undefined&&(!num(b.splitFactor)||b.splitFactor<=0))actionIssues.push({date,cause:'PROVIDER_DATA_DEFECT',field:'splitFactor',reason:'INVALID_SPLIT_FACTOR'});
  if(b?.dividend!==null&&b?.dividend!==undefined&&(!num(b.dividend)||b.dividend<0))actionIssues.push({date,cause:'PROVIDER_DATA_DEFECT',field:'dividend',reason:'INVALID_DIVIDEND'});
 }
 // Adapter-quarantined rows remain visible even though the normalized bars
 // have already excluded them. No apparent SMA warm-up is granted from that.
 for(const a of [...(history.quarantined||[]),...(history.anomalies||[])])fullIssues.push({date:a.date?String(a.date).slice(0,10):null,cause:'PROVIDER_DATA_DEFECT',field:'sourceRow',reason:a.reason||'QUARANTINED_SOURCE_ROW'});
 const bars=original.filter(b=>dateOK(b?.date)&&b.date>=window.from&&b.date<=window.to);
 const inside=i=>!dateOK(i.date)||(i.date>=window.from&&i.date<=window.to);
 const calendarCheck=checkCalendarWindow({calendar,mic:listing.mic,start:window.from,end:window.to});
 const actual=new Set(bars.map(b=>b.date));const expected=new Set(calendarCheck.expectedSessions);
 const missingSessions=calendarCheck.status==='READY'?calendarCheck.expectedSessions.filter(d=>!actual.has(d)):[];
 const unexpectedSessions=calendarCheck.status==='READY'?bars.filter(b=>!expected.has(b.date)).map(b=>b.date):[];
 const w={from:window.from,to:window.to,bars:bars.length,asOf};
 const common=[];
 if(!bars.length)common.push('MISSING_HISTORY');
 if(!listing.isin||!listing.mic||!listing.securityId||!listing.listingId||!listing.currency)common.push('MAPPING_ERROR');
 if(['isin','mic','currency','securityId','listingId','quoteUnit'].some(k=>history[k]!==undefined&&history[k]!==listing[k]))common.push('MAPPING_ERROR');
 if(!history.source||!history.apiVersion||!refsOK(evidence))common.push('PROVIDER_PROVENANCE_UNVERIFIED');
 common.push(...fullIssues.filter(inside).map(i=>i.cause),...priceIssues.filter(inside).map(i=>i.cause));
 if(calendarCheck.status!=='READY')common.push('MISSING_CALENDAR_BASIS');
 if(missingSessions.length)common.push('MISSING_HISTORY');
 if(unexpectedSessions.length)common.push('PROVIDER_DATA_DEFECT');
 const basisVerified=verified(basisEvidence)&&basisEvidence.kind==='LISTING_FIELD_WINDOW_VERIFICATION'
  &&basisEvidence.isin===listing.isin&&basisEvidence.mic===listing.mic&&dateOK(basisEvidence.from)&&dateOK(basisEvidence.to)
  &&basisEvidence.from<=window.from&&basisEvidence.to>=window.to;
 const splitVerified=verified(basisEvidence.splitSemantics)&&basisEvidence.splitSemantics.direction==='NEW_SHARES_PER_OLD_SHARE'&&basisEvidence.splitSemantics.eventDate==='EX_DATE';
 const dividendVerified=verified(basisEvidence.dividendSemantics)&&basisEvidence.dividendSemantics.basis==='PER_NEW_SHARE_AT_EX_DATE'&&basisEvidence.dividendSemantics.currency===listing.currency;
 const technicalCauses=[...common];
 if(!basisVerified||!['RAW','SPLIT_ADJUSTED'].includes(basisEvidence.ohlcBasis))technicalCauses.push('UNKNOWN_ADJUSTMENT_BASIS');
 if(basisEvidence.ohlcBasis==='RAW'&&(!splitVerified||basisEvidence.actionsComplete!==true||bars.some(b=>!num(b.splitFactor)||b.splitFactor<=0)))technicalCauses.push('UNKNOWN_ADJUSTMENT_BASIS');
 technicalCauses.push(...actionIssues.filter(inside).filter(i=>i.field==='splitFactor').map(i=>i.cause));
 const certifiedRefs=uniq([...evidence,...(basisEvidence.evidence||[]),...(basisEvidence.splitSemantics?.evidence||[]),...calendarCheck.evidence]);
 let technicalBars=null,series=null;
 if(!technicalCauses.length){
  const columns={timestamps:bars.map(b=>b.date),volume:bars.map(()=>null)};
  for(const k of ['open','high','low','close'])columns[k]=basisEvidence.ohlcBasis==='RAW'?ReturnSeries.splitAdjustedColumn(bars,k):bars.map(b=>b[k]);
  series=CanonicalBars.createSeries({instrumentId:listing.instrumentId||listing.securityId,exchange:listing.mic,currency:listing.currency,
   source:history.source,sourceRevision:history.sourceRevision||null,timeframe:'1D',sessionType:'REGULAR',priceSeriesType:'SPLIT_ADJUSTED'},columns);
  const check=CanonicalBars.validateSeries(series);if(!check.valid)technicalCauses.push('ADAPTER_BUG');
  else technicalBars=bars.map((b,i)=>({...b,open:series.open[i],high:series.high[i],low:series.low[i],close:series.close[i],volume:null}));
 }
 const volCauses=[...common,...volumeIssues.filter(inside).map(i=>i.cause)];
 if(!basisVerified||basisEvidence.volumeUnit!=='SHARES'||!['RAW_SHARES','SPLIT_ADJUSTED_SHARES'].includes(basisEvidence.volumeBasis))volCauses.push('UNVERIFIED_VOLUME_BASIS');
 if(basisEvidence.volumeBasis==='RAW_SHARES'&&(!splitVerified||basisEvidence.actionsComplete!==true||bars.some(b=>!num(b.splitFactor)||b.splitFactor<=0)))volCauses.push('UNKNOWN_ADJUSTMENT_BASIS');
 if(technicalBars&&!volCauses.length){
  let volume;
  if(basisEvidence.volumeBasis==='SPLIT_ADJUSTED_SHARES')volume=bars.map(b=>b.volume);
  else {
   // Reuse the existing central technical action normalization for volume;
   // its RAW input is certified above. Never adjust an already adjusted field.
   const splits=bars.filter(b=>b.splitFactor!==1).map(b=>({type:'split',exDate:b.date,ratio:b.splitFactor}));
   volume=CanonicalBars.fromPriceBars(bars,splits,{instrumentId:listing.securityId,exchange:listing.mic,currency:listing.currency,source:history.source}).SPLIT_ADJUSTED.volume;
  }
  technicalBars=technicalBars.map((b,i)=>({...b,volume:volume[i]}));
 }
 const fields={};let f=null;
 const specs={sma20:['sma20',20],sma50:['sma50',50],sma200:['sma200',200],high52w:['high52w',252],low52w:['low52w',252],
  momentum1M:['momentum1M',22],momentum3M:['momentum3M',64],momentum6M:['momentum6M',127],momentum12M:['momentum12M',253],
  realizedVolatility20d:['realizedVol',21],realizedVolatility60d:['realizedVolLong',61],atr14:['atr',14],relativeVolume:['relativeVolume',21]};
 if(technicalBars){
  const s=CanonicalBars.createSeries(series,{timestamps:technicalBars.map(b=>b.date),...Object.fromEntries(['open','high','low','close','volume'].map(k=>[k,technicalBars.map(b=>b[k])]))});
  f=Features.computeFeatures(s,methodology.features).last();
 }
 for(const [name,[key,minimum]]of Object.entries(specs)){
   const causes=[...technicalCauses,...(name==='relativeVolume'?volCauses:[])];
   if(bars.length>0&&bars.length<minimum)causes.push('SHORT_HISTORY');
   if(!causes.length&&!num(f?.[key]))causes.push('INSUFFICIENT_ENGINE_INPUT');
   // Product current fields must end at the actual last canonical input date;
   // older-window diagnostics may remain useful, but are not current fields.
   if(bars.at(-1)?.date!==original.at(-1)?.date)causes.push('HISTORICAL_DIAGNOSTIC_WINDOW_ONLY');
   fields[name]={status:causes.length?'BLOCKED':'READY',causes:uniq(causes),asOf:bars.at(-1)?.date||null,
    window:{from:bars[0]?.date||null,to:bars.at(-1)?.date||null},inputSeriesHash,
    evidence:[...certifiedRefs,'quant/engines/technical/feature-store.js#'+Features.FEATURE_VERSION],value:causes.length?null:f[key],
    priceBasis:'SPLIT_ADJUSTED',currency:listing.currency,quoteUnit:listing.quoteUnit||null,
    valueUnit:name.startsWith('momentum')?'LOG_RETURN':name.startsWith('realizedVolatility')?'ANNUALIZED_LOG_RETURN_STDDEV':name==='relativeVolume'?'MULTIPLE':'LISTING_QUOTE_UNIT'};
 }
 const trCauses=[...common,...actionIssues.filter(inside).map(i=>i.cause)];
 if(!basisVerified||basisEvidence.ohlcBasis!=='RAW'||!splitVerified||!dividendVerified||basisEvidence.actionsComplete!==true)trCauses.push('UNKNOWN_ADJUSTMENT_BASIS');
 if(bars.some(b=>!num(b.splitFactor)||b.splitFactor<=0||!num(b.dividend)||b.dividend<0))trCauses.push('UNKNOWN_ADJUSTMENT_BASIS');
 let canonicalTR=null,providerTRCheck=null;
 if(!trCauses.length){
  const withObservedAdjusted=bars.map(b=>({...b,adjustedClose:adjOf(b).close}));
  canonicalTR=CanonicalTotalReturn.reconstruct(withObservedAdjusted,{identity:{state:'CONFIRMED',via:'LISTING_FIELD_WINDOW_VERIFICATION'}});
  // Existing canonical engine's own availability contract is authoritative.
  if(canonicalTR?.state!=='TOTAL_RETURN_RECONSTRUCTED')trCauses.push('UNKNOWN_ADJUSTMENT_BASIS');
  providerTRCheck=ReturnSeries.verifyTotalReturn(withObservedAdjusted,Math.max(1,bars.length));
 }
 return {schemaVersion:EUROPE_HISTORY_CERTIFICATION_VERSION,mode:'PRIVATE_DEVELOPMENT_ONLY',isin:listing.isin,mic:listing.mic,
  securityId:listing.securityId,listingId:listing.listingId,asOf,inputSeriesHash,certificationWindow:w,
  fullHistoryQuality:{bars:original.length,first:original[0]?.date||null,last:original.at(-1)?.date||null,
   issues:[...fullIssues,...priceIssues,...volumeIssues,...adjustmentIssues,...actionIssues],
   immutableQuarantineObservationCount:(history.quarantineLedger||history.quarantined||[]).length,
   immutableQuarantineLedgerHash:sha(history.quarantineLedger||history.quarantined||[]),
   activeQuarantineCount:(history.quarantined||[]).length,
   quarantinedRowsRetained:(history.quarantined?.length||0)+(history.anomalies?.length||0)},
  calendar:calendarCheck,missingSessions,unexpectedSessions,
  freshness:checkEuropeanEodFreshness({calendar,mic:listing.mic,latestDate:original.at(-1)?.date}),
  rawVsAdjustedObservations:{adjustedFieldIssues:adjustmentIssues,splitEvents:original.filter(b=>num(b?.splitFactor)&&b.splitFactor!==1).map(b=>({date:b.date,splitFactor:b.splitFactor})),
   dividendEvents:original.filter(b=>num(b?.dividend)&&b.dividend>0).map(b=>({date:b.date,amount:b.dividend,currency:listing.currency})),
   adjustmentObservationIsNotCertification:true},
  splitAdjustedOHLC:decision(technicalCauses.length?'BLOCKED':'READY',technicalCauses,w,certifiedRefs),
  splitAdjustedVolume:decision(volCauses.length?'BLOCKED':'READY',volCauses,w,[...certifiedRefs,'quant/engines/technical/canonical-bars.js#fromPriceBars']),
  totalReturn:decision(trCauses.length?'BLOCKED':'READY',trCauses,w,[...certifiedRefs,...(basisEvidence.dividendSemantics?.evidence||[]),'quant/engines/canonical-total-return.js'],{engineResult:canonicalTR,providerAdjustedFieldDiagnostic:providerTRCheck}),
  technicalBars,technicalFields:fields,publicDisplay:false,quantScore:null,supertraderScore:null,
  nextStep:technicalCauses.length?'Resolve the listing/window-specific causes without inventing actions, filling sessions, or adjusting already adjusted fields.':null};
}
