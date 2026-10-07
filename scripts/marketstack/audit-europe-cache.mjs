/** Offline private certification of frozen European listings and cached data.
 * No HTTP, provider retries, materialization, strategies, or score population.
 * Research raw features remain PARTIAL and cannot become Screener READY fields.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import CanonicalBars from '../../quant/engines/technical/canonical-bars.js';
import Features from '../../quant/engines/technical/feature-store.js';
import Trend from '../../quant/engines/technical/trend-engine.js';
import CanonicalTotalReturn from '../../quant/engines/canonical-total-return.js';
import methodology from '../../quant/methodology/technical-v1.json' with {type:'json'};
import {buildEuropeanCalendar,checkCalendarWindow} from './europe-calendar.mjs';
import {certifyEuropeanHistory} from './certify-europe-history.mjs';
import {assertPrivateOutput} from './private-output.mjs';
export const EUROPE_CACHE_AUDIT_VERSION='private-europe-cache-audit-1.0.0';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const num=v=>typeof v==='number'&&Number.isFinite(v);
const unique=v=>[...new Set(v)];
const refs=v=>Array.isArray(v)&&v.length&&v.every(x=>typeof x==='string'&&x.trim());
// The existing Marketstack adapter labels a major unit MAJOR_CURRENCY_UNIT;
// the frozen central listing contract labels that same unit MAJOR. This is a
// spelling alias only, never a currency conversion or a minor-unit rescale.
const canonicalUnit=v=>v==='MAJOR_CURRENCY_UNIT'?'MAJOR':v;
const RAW_KEYS=['sma20','sma50','sma200','high52w','low52w','momentum1M','momentum3M','momentum6M','momentum12M','realizedVol','realizedVolLong','atr','drawdown'];

function researchRaw({listing,history,calendar,window,asOf,sourceVerified,rawDocumentationEvidence}){
 const bars=history.bars.filter(b=>b.date>=window.from&&b.date<=window.to);
 const calendarCheck=checkCalendarWindow({calendar,mic:listing.mic,start:window.from,end:window.to});
 const actual=new Set(bars.map(b=>b.date));
 const expected=new Set(calendarCheck.expectedSessions);
 const blockers=[];
 if(calendarCheck.status!=='READY')blockers.push('MISSING_CALENDAR_BASIS');
 if(calendarCheck.expectedSessions.some(d=>!actual.has(d)))blockers.push('MISSING_HISTORY');
 if(bars.some(b=>!expected.has(b.date)))blockers.push('PROVIDER_DATA_DEFECT');
 if(!sourceVerified||!refs(rawDocumentationEvidence))blockers.push('PROVIDER_PROVENANCE_UNVERIFIED');
 if(history.quarantined?.some(q=>String(q.date).slice(0,10)>=window.from&&String(q.date).slice(0,10)<=window.to))blockers.push('PROVIDER_DATA_DEFECT');
 if(bars.some(b=>b.date>asOf))blockers.push('PROVIDER_DATA_DEFECT');
 const result={mode:'RESEARCH_ONLY',status:'BLOCKED',causes:unique(blockers),priceBasis:'RAW',window,
  asOf:bars.at(-1)?.date||null,inputSeriesHash:hash(history.bars),bars:bars.length,fields:{},strategyEligible:false,screenerEligible:false,quantScore:null,
  evidence:unique([...(history.sourceEvidence||[]),...(rawDocumentationEvidence||[]),...calendarCheck.evidence,'quant/engines/technical/feature-store.js#'+Features.FEATURE_VERSION])};
 const series=CanonicalBars.createSeries({instrumentId:listing.securityId,exchange:listing.mic,currency:listing.currency,source:history.source,priceSeriesType:'RAW'},
  {timestamps:bars.map(b=>b.date),...Object.fromEntries(['open','high','low','close'].map(k=>[k,bars.map(b=>b[k])])),volume:bars.map(()=>null)});
 if(!CanonicalBars.validateSeries(series).valid)result.causes.push('PROVIDER_DATA_DEFECT');
 if(result.causes.length)return result;
 const computed=Features.computeFeatures(series,methodology.features),f=computed.last();
 const historical=window.to!==history.bars.at(-1)?.date;
 const reasons=['UNKNOWN_ADJUSTMENT_BASIS',...(historical?['HISTORICAL_DIAGNOSTIC_WINDOW_ONLY']:[])];
 for(const k of RAW_KEYS)result.fields[k]={status:num(f[k])?'PARTIAL':'BLOCKED',value:num(f[k])?f[k]:null,
  causes:[...reasons,...(!num(f[k])?['SHORT_HISTORY']:[])],
  valueUnit:k==='drawdown'?'FRACTION_FROM_WINDOW_RUNNING_HIGH':k.startsWith('momentum')?'LOG_RETURN':k.startsWith('realizedVol')?'ANNUALIZED_LOG_RETURN_STDDEV':'LISTING_QUOTE_UNIT'};
 const trend=Trend.analyzeTrend(series,computed,methodology.trend);
 result.trendDiagnostic={mode:'RESEARCH_ONLY',status:trend.direction==='UNDETERMINED'?'BLOCKED':'PARTIAL',causes:reasons,
  engineVersion:trend.engineVersion,asOf:trend.asOf,direction:trend.direction,coverage:trend.coverage,
  methodologyScore:trend.trendScore,scoreType:trend.scoreType,components:trend.components,evidence:trend.evidence,
  strategyEligible:false,screenerEligible:false};
 result.status=Object.values(result.fields).some(f=>num(f.value))?'PARTIAL':'BLOCKED';
 result.causes=unique([...reasons,...(result.status==='BLOCKED'?['SHORT_HISTORY']:[])]);
 return result;
}

export function auditEuropeanCacheSeries({listing,history,calendar,asOf,sources=[],rawDocumentationEvidence=[],basisEvidence}={}){
 if(!listing?.listingId||!Array.isArray(history?.bars)||!history.bars.length)throw Error('FROZEN_LISTING_AND_REAL_HISTORY_REQUIRED');
 const window={from:history.bars[0].date,to:history.bars.at(-1).date};
 const full=certifyEuropeanHistory({listing,history,asOf,calendar,window,basisEvidence});
 const verifiedSources=sources.filter(s=>s.status===200&&s.apiVersion===history.apiVersion&&s.host==='api.marketstack.com');
 const metadata=verifiedSources.filter(s=>s.endpoint==='/tickers/'+listing.providerSymbol);
 const identityVerified=metadata.some(s=>s.body?.isin===listing.isin&&s.body?.symbol===listing.providerSymbol);
 const sourceRows=new Map();
 for(const s of verifiedSources.filter(s=>s.endpoint?.startsWith('/eod')&&s.params?.symbols===listing.providerSymbol&&s.params?.exchange===listing.mic))
  for(const row of s.body?.data||[])sourceRows.set(String(row.date).slice(0,10),row);
 const sourceIdentityMatches=row=>row&&row.exchange===listing.mic&&row.symbol===listing.providerSymbol
  &&(row.exchange_code==null||row.exchange_code===listing.mic)&&(row.isin==null||row.isin===listing.isin);
 const sourcePriceMatchedDates=new Set(history.bars.filter(b=>{const row=sourceRows.get(b.date);return sourceIdentityMatches(row)&&['open','high','low','close'].every(k=>row[k]===b[k]);}).map(b=>b.date));
 const sourceVolumeMatchedDates=new Set(history.bars.filter(b=>{const row=sourceRows.get(b.date);return sourceIdentityMatches(row)&&row.volume===b.volume;}).map(b=>b.date));
 const sourceMatchedDates=new Set([...sourcePriceMatchedDates].filter(d=>sourceVolumeMatchedDates.has(d)));
 const sourceMatches=sourceMatchedDates.size;
 const sourceVerified=identityVerified&&sourceMatches===history.bars.length;
 const sourceWindowVerified=w=>identityVerified&&history.bars.filter(b=>b.date>=w.from&&b.date<=w.to).every(b=>sourcePriceMatchedDates.has(b.date));
 const quarantine=new Set((history.quarantined||[]).map(q=>String(q.date).slice(0,10)));
 const actual=new Set(history.bars.map(b=>b.date));
 const provenExpected=(calendar?.expectedSessions||[]).filter(d=>d>=window.from&&d<=window.to);
 const missingSourceSessions=provenExpected.filter(d=>!sourceRows.has(d));
 const quarantinedSessions=provenExpected.filter(d=>sourceRows.has(d)&&(!actual.has(d)||quarantine.has(d)));
 const runs=[];let run=[];let previous=null;
 for(const d of provenExpected){
  const uncoveredYear=previous&&Array.from({length:Number(d.slice(0,4))-Number(previous.slice(0,4))+1},(_,i)=>Number(previous.slice(0,4))+i).some(y=>!calendar.coveredYears.includes(y));
  if(!actual.has(d)||quarantine.has(d)||uncoveredYear){if(run.length)runs.push(run);run=[];}
  if(actual.has(d)&&!quarantine.has(d))run.push(d);
  previous=d;
 }
 if(run.length)runs.push(run);
 const currentRun=runs.find(r=>r.at(-1)===window.to)||[window.to];
 const recentWindow={from:currentRun[0],to:window.to};
 const recent=certifyEuropeanHistory({listing,history,asOf,calendar,window:recentWindow,basisEvidence});
 const latest=history.bars.at(-1),inputSeriesHash=hash(history.bars);
 const latestCauses=[];
 if(!sourceWindowVerified({from:latest.date,to:latest.date}))latestCauses.push('PROVIDER_PROVENANCE_UNVERIFIED');
 if(!['open','high','low','close'].every(k=>num(latest[k])&&latest[k]>0)
  ||latest.high<Math.max(latest.open,latest.close,latest.low)||latest.low>Math.min(latest.open,latest.close,latest.high))latestCauses.push('PROVIDER_DATA_DEFECT');
 const identityKeys=['isin','mic','currency','securityId','listingId'];
 if(!listing.currency||identityKeys.some(k=>(history[k]!==undefined&&history[k]!==listing[k])||(latest[k]!==undefined&&latest[k]!==listing[k])))latestCauses.push('MAPPING_ERROR');
 if([history.quoteUnit,latest.quoteUnit].some(unit=>unit!==undefined&&canonicalUnit(unit)!==canonicalUnit(listing.quoteUnit)))latestCauses.push('MAPPING_ERROR');
 const latestSource=sourceRows.get(latest.date);
 if(['price_currency','currency'].some(k=>typeof latestSource?.[k]==='string'&&latestSource[k]!==listing.currency))latestCauses.push('MAPPING_ERROR');
 if(metadata.some(s=>typeof s.body?.currency==='string'&&s.body.currency!==listing.currency))latestCauses.push('MAPPING_ERROR');
 const proof={asOf:latest.date,dataAsOf:asOf,inputSeriesHash,window:{start:recentWindow.from,end:recentWindow.to},
  evidence:unique([...(history.sourceEvidence||[]),...(rawDocumentationEvidence||[]),...(calendar?.evidence||[])])};
 const observedWindow=history.bars.filter(b=>b.date>=recentWindow.from&&b.date<=recentWindow.to);
 const windowIdentityConflict=observedWindow.some(b=>(b.quoteUnit!==undefined&&canonicalUnit(b.quoteUnit)!==canonicalUnit(listing.quoteUnit))
  ||['price_currency','currency'].some(k=>typeof sourceRows.get(b.date)?.[k]==='string'&&sourceRows.get(b.date)[k]!==listing.currency));
 const currentSourceVerified=sourceWindowVerified(recentWindow);
 const chartSafe=currentSourceVerified&&!windowIdentityConflict&&recent.calendar.status==='READY'&&!recent.missingSessions.length&&!recent.unexpectedSessions.length
  &&recent.splitAdjustedOHLC.causes.every(c=>c==='UNKNOWN_ADJUSTMENT_BASIS');
 const freshness=recent.freshness;
 const chartStatus=!chartSafe?'BLOCKED':freshness.status==='READY'?'READY':freshness.state==='STALE'&&freshness.lagSessions===1?'PARTIAL':'BLOCKED';
 const displayCauses=unique([...(currentSourceVerified?[]:['PROVIDER_PROVENANCE_UNVERIFIED']),...(windowIdentityConflict?['MAPPING_ERROR']:[]),
  ...recent.splitAdjustedOHLC.causes.filter(c=>c!=='UNKNOWN_ADJUSTMENT_BASIS'),...(freshness.cause?[freshness.cause]:[])]);
 const adjustmentObservation={status:'PARTIAL',window:recentWindow,inputSeriesHash,bars:observedWindow.length,
  splitFactorsReported:observedWindow.filter(b=>num(b.splitFactor)).length,
  nonUnitSplitFactors:observedWindow.filter(b=>num(b.splitFactor)&&b.splitFactor!==1).length,
  positiveDividends:observedWindow.filter(b=>num(b.dividend)&&b.dividend>0).length,
  identicalRawAndAdjustedOHLC:observedWindow.filter(b=>['open','high','low','close'].every(k=>b.adjustmentObservation?.[k]===b[k])).length,
  allAdjustedOHLCReported:observedWindow.filter(b=>['open','high','low','close'].every(k=>num(b.adjustmentObservation?.[k]))).length,
  actionsComplete:false,causes:['UNKNOWN_ADJUSTMENT_BASIS'],evidence:history.sourceEvidence||[],
  reason:'Observed field equality and event factors describe this window; they do not prove missing action coverage or whether provider adjustments include dividends.'};
 const researchWindows=unique([JSON.stringify(recentWindow),...runs.slice().sort((a,b)=>b.length-a.length||b.at(-1).localeCompare(a.at(-1))).slice(0,2).map(r=>JSON.stringify({from:r[0],to:r.at(-1)}))]);
 const research=researchWindows.map(s=>{const window=JSON.parse(s);return researchRaw({listing,history,calendar,window,asOf,sourceVerified:sourceWindowVerified(window),rawDocumentationEvidence});});
 // This is an engine diagnostic on observed EOD fields, not a source/action
 // completeness grant. The existing engine may reject additional defects.
 const totalReturnDiagnostic={mode:'RESEARCH_ONLY',status:'NOT_TESTED',certified:false,actionsComplete:false};
 if(sourceVerified&&refs(rawDocumentationEvidence)){
  const observed=history.bars.map(b=>({...b,adjustedClose:b.adjustmentObservation?.close??null}));
  totalReturnDiagnostic.engineResult=CanonicalTotalReturn.reconstruct(observed,{identity:{state:'CONFIRMED',via:'EXACT_SOURCE_ISIN_SYMBOL_MIC'}});
  totalReturnDiagnostic.status=totalReturnDiagnostic.engineResult.reconstructed?'PARTIAL':'BLOCKED';
  totalReturnDiagnostic.causes=['UNKNOWN_ADJUSTMENT_BASIS'];
 }
 return {schemaVersion:EUROPE_CACHE_AUDIT_VERSION,mode:'PRIVATE_DEVELOPMENT_ONLY',asOf,fixedNow:calendar?.now||null,name:listing.name,
  dataAsOf:asOf,inputSeriesHash,sourceEvidence:history.sourceEvidence||[],
  isin:listing.isin,mic:listing.mic,securityId:listing.securityId,listingId:listing.listingId,retrievedAt:history.retrievedAt,
  identity:{status:identityVerified?'READY':'BLOCKED',causes:identityVerified?[]:['MAPPING_ERROR'],evidence:metadata.map(s=>s.file||s.endpoint)},
  sourceFields:{status:sourceMatches===history.bars.length?'READY':'BLOCKED',causes:sourceMatches===history.bars.length?[]:['ADAPTER_BUG'],matches:sourceMatches,bars:history.bars.length,
   priceMatches:sourcePriceMatchedDates.size,priceStatus:sourcePriceMatchedDates.size===history.bars.length?'READY':'BLOCKED',
   volumeMatches:sourceVolumeMatchedDates.size,volumeStatus:sourceVolumeMatchedDates.size===history.bars.length?'READY':'BLOCKED'},
  independentlyCoveredYears:calendar?.coveredYears||[],missingSourceSessions,quarantinedSessions,quarantinedRows:(history.quarantined||[]).length,
  immutableQuarantineObservationCount:(history.quarantineLedger||history.quarantined||[]).length,
  immutableQuarantineLedgerHash:hash(history.quarantineLedger||history.quarantined||[]),activeQuarantineCount:(history.quarantined||[]).length,
  lastAvailableEOD:window.to,lastKnownCompletedSession:calendar?.lastProvenCompletedSession||null,
  knownSessionLag:calendar?.lastProvenCompletedSession?calendar.expectedSessions.filter(d=>d>window.to&&d<=calendar.lastProvenCompletedSession).length:null,
  fullWindow:full,recentWindow:recent,researchDiagnostics:research,totalReturnDiagnostic,
  latestEod:{...proof,window:{start:latest.date,end:latest.date},status:latestCauses.length?'BLOCKED':recent.freshness.status,
   state:latestCauses.length||recent.freshness.state==='INVALID_EOD'?'INVALID':recent.freshness.state,
   causes:unique([...latestCauses,...(recent.freshness.cause?[recent.freshness.cause]:[])]),dataKind:'EOD'},
  chart:{...proof,status:chartStatus,state:chartStatus==='READY'?'CHART_READY':chartStatus==='PARTIAL'?'CHART_READY_WITH_LIMITATION':'CHART_BLOCKED',causes:displayCauses,
   expectedLastSession:freshness.expectedLastSession||null,lagSessions:freshness.lagSessions??null,
   freshnessPolicy:{maxLagSessions:1,unknownFreshness:'BLOCKED',basis:'PRIVATE_CURRENT_CHART_WINDOW_POLICY'},
   priceBasis:'RAW',displayLabel:'Unadjusted source EOD prices',scope:'ONLY_PROVEN_WINDOW',publicDisplay:false,
   limitations:['UNKNOWN_ADJUSTMENT_BASIS','RAW_CHART_DOES_NOT_GRANT_ADJUSTED_TECHNICAL_OR_STRATEGY_READINESS']},
  technical:{...proof,status:Object.values(recent.technicalFields).every(f=>f.status==='READY')?'READY':Object.values(recent.technicalFields).some(f=>f.status==='READY')?'PARTIAL':'BLOCKED',
   state:Object.values(recent.technicalFields).every(f=>f.status==='READY')?'TECHNICAL_READY':Object.values(recent.technicalFields).some(f=>f.status==='READY')?'TECHNICAL_PARTIAL':'TECHNICAL_BLOCKED',
   readyFields:Object.keys(recent.technicalFields).filter(k=>recent.technicalFields[k].status==='READY'),
   causes:unique(Object.values(recent.technicalFields).flatMap(f=>f.causes)),
   evidence:unique([...proof.evidence,'quant/engines/technical/feature-store.js#'+Features.FEATURE_VERSION]),
   fieldDecisionsPath:'recentWindow.technicalFields',strategyEligible:false,quantScore:null},
  adjustmentWindowObservation:adjustmentObservation,
  relativeStrength:{status:'BLOCKED',causes:['RS_BLOCKED_NO_BENCHMARK'],value:null,
   evidence:['No verified local European cash index series supplied; US benchmarks and ETF proxies are not substituted.']},
  corporateActionCompleteness:{status:'BLOCKED',causes:['UNKNOWN_ADJUSTMENT_BASIS'],dedicatedEndpointAbsenceIsNotCompleteness:true},
  volume:{status:'BLOCKED',causes:['UNVERIFIED_VOLUME_BASIS'],zeroVolumeBars:history.bars.filter(b=>b.volume===0).length},
  quant:{status:'BLOCKED',causes:['MISSING_FUNDAMENTALS','MISSING_FX_OR_SHARE_BASIS','PRODUCT_INTEGRATION_MISSING'],score:null},
  supertrader:{status:'BLOCKED',causes:['UNKNOWN_ADJUSTMENT_BASIS','UNVERIFIED_VOLUME_BASIS','MISSING_FX_OR_SHARE_BASIS'],score:null},
  publicDisplay:false,agentProviderRequests:0,agentProviderCredits:0};
}

/** Preserve original arrays in immutable source/history storage. Compact
 * reports retain their content hash, count and a small diagnostic sample,
 * never replace an issue ledger with an apparently empty successful one. */
export function compactEuropeanCacheAudit(report){
 const arraySummary=values=>({compacted:true,count:values.length,sha256:hash(values),sample:values.slice(0,5)});
 const trSummary=result=>result?{...result,tr:result.tr?{compacted:true,count:Object.keys(result.tr).length,sha256:hash(result.tr)}:result.tr,
  priceReturnIndex:result.priceReturnIndex?{compacted:true,count:Object.keys(result.priceReturnIndex).length,sha256:hash(result.priceReturnIndex)}:result.priceReturnIndex}:result;
 const cert=c=>({...c,technicalBars:null,technicalBarsOmittedFromCompactReport:true,
  fullHistoryQuality:{...c.fullHistoryQuality,issues:arraySummary(c.fullHistoryQuality.issues)},
  rawVsAdjustedObservations:{...c.rawVsAdjustedObservations,adjustedFieldIssues:arraySummary(c.rawVsAdjustedObservations.adjustedFieldIssues)},
  totalReturn:{...c.totalReturn,engineResult:trSummary(c.totalReturn.engineResult)}});
 return {...report,compact:true,fullWindow:cert(report.fullWindow),recentWindow:cert(report.recentWindow),
  totalReturnDiagnostic:{...report.totalReturnDiagnostic,engineResult:trSummary(report.totalReturnDiagnostic.engineResult)}};
}

export function runEuropeCacheAudit({requestPath,normalizedDir,sourceDir,calendarRulesPath,documentationEvidencePath,out,asOf,now,compact=false}){
 const output=assertPrivateOutput(out);fs.mkdirSync(output,{recursive:true,mode:0o700});fs.chmodSync(output,0o700);
 const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const request=load(requestPath);const map=request.listingMap||request;
 if(!Array.isArray(map.listings)||!asOf||!now)throw Error('FROZEN_MAPPING_FIXED_ASOF_AND_NOW_REQUIRED');
 const rules=load(calendarRulesPath);
 const calendars=Object.fromEntries(Object.entries(rules.configs).map(([mic,c])=>[mic,buildEuropeanCalendar({...c,now})]));
 const doc=documentationEvidencePath?load(documentationEvidencePath):null;
 const rawDocumentationEvidence=doc?.url&&doc?.retrievedAt&&/^[a-f0-9]{64}$/.test(doc.sha256)?[doc.url+' retrievedAt='+doc.retrievedAt+' sha256='+doc.sha256]:[];
 const summaries=[];
 const seen=new Set();
 for(const frozenListing of map.listings){
  // Frozen reference maps use tradingCurrency; the canonical evaluator uses
  // currency. Normalize that existing metadata alias, never infer it from a
  // price row. Conflicting explicit currency remains visible to certification.
  const listing={...frozenListing,currency:frozenListing.currency??frozenListing.tradingCurrency};
  if(!listing.listingId)continue;
  if(!/^lst_[A-Z0-9]{4}_[A-Z0-9]{12}$/.test(listing.listingId)||seen.has(listing.listingId))throw Error('UNIQUE_CANONICAL_LISTING_REQUIRED');
  seen.add(listing.listingId);
  const filename=path.join(normalizedDir,listing.listingId+'.json');if(!fs.existsSync(filename))continue;
  const history=load(filename);const sources=[];
  for(const ref of history.sourceEvidence||[]){const match=/^sha256:([a-f0-9]{64})$/.exec(ref);if(!match||!sourceDir)continue;
   const name=match[1]+'.json';const file=path.join(sourceDir,name);if(fs.existsSync(file)){const source=load(file);if(hash(source)!==match[1])throw Error('SOURCE_EVIDENCE_HASH_MISMATCH');sources.push({file:name,...source});}}
  const report=auditEuropeanCacheSeries({listing,history,calendar:calendars[listing.mic],asOf,sources,rawDocumentationEvidence});
  const outfile=assertPrivateOutput(path.join(output,listing.listingId+'.json'));fs.writeFileSync(outfile,JSON.stringify(compact?compactEuropeanCacheAudit(report):report,null,2)+'\n',{mode:0o600});fs.chmodSync(outfile,0o600);
  summaries.push({name:report.name,listingId:report.listingId,isin:report.isin,mic:report.mic,bars:report.sourceFields.bars,lastAvailableEOD:report.lastAvailableEOD,
   originalFields:report.sourceFields.status,identity:report.identity.status,knownSessionLag:report.knownSessionLag,
   immutableQuarantineObservationCount:report.immutableQuarantineObservationCount,activeQuarantineCount:report.activeQuarantineCount,
   immutableQuarantineLedgerHash:report.immutableQuarantineLedgerHash,
   missingSourceSessions:report.missingSourceSessions,quarantinedSessions:report.quarantinedSessions,recentWindow:report.recentWindow.certificationWindow,
   readyTechnicalFields:Object.entries(report.recentWindow.technicalFields).filter(([,f])=>f.status==='READY').map(([key])=>key),
   researchWindows:report.researchDiagnostics.map(d=>({mode:d.mode,status:d.status,asOf:d.asOf,window:d.window,bars:d.bars,inputSeriesHash:d.inputSeriesHash,
    finiteFields:Object.entries(d.fields).filter(([,f])=>num(f.value)).map(([key])=>key),causes:d.causes})),
   totalReturnEngineDiagnostic:report.totalReturnDiagnostic.engineResult?.state||null,totalReturnEngineReason:report.totalReturnDiagnostic.engineResult?.reason||null});
 }
 const summary={schemaVersion:EUROPE_CACHE_AUDIT_VERSION,mode:'PRIVATE_DEVELOPMENT_ONLY',asOf,now,agentProviderRequests:0,agentProviderCredits:0,
  frozenTargets:map.listings.length,historyListings:summaries.length,documentationEvidence:rawDocumentationEvidence,publicDisplay:false,
  counts:{exactIdentity:summaries.filter(s=>s.identity==='READY').length,originalFieldsMatch:summaries.filter(s=>s.originalFields==='READY').length,
   currentTechnicalReady:summaries.filter(s=>s.readyTechnicalFields.length).length,researchWithFiniteValues:summaries.filter(s=>s.researchWindows.some(d=>d.finiteFields.length)).length},listings:summaries};
 summary.counts.immutableQuarantineObservations=summaries.reduce((n,s)=>n+s.immutableQuarantineObservationCount,0);
 summary.counts.activeQuarantineRows=summaries.reduce((n,s)=>n+s.activeQuarantineCount,0);
 fs.writeFileSync(assertPrivateOutput(path.join(output,'summary.json')),JSON.stringify(summary,null,2)+'\n',{mode:0o600});fs.chmodSync(path.join(output,'summary.json'),0o600);
 fs.writeFileSync(assertPrivateOutput(path.join(output,'calendars.json')),JSON.stringify({now,calendars},null,2)+'\n',{mode:0o600});fs.chmodSync(path.join(output,'calendars.json'),0o600);return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);const opts={};const flags={'--request':'requestPath','--normalized-dir':'normalizedDir','--source-dir':'sourceDir','--calendar-rules':'calendarRulesPath',
  '--documentation-evidence':'documentationEvidencePath','--out':'out','--as-of':'asOf','--now':'now','--compact':'compact'};
 for(let i=0;i<args.length;i+=2){if(!flags[args[i]]||!args[i+1])throw Error('EXPECTED_NAMED_ARGUMENTS');opts[flags[args[i]]]=args[i+1];}
 if(opts.compact!==undefined){if(opts.compact!=='true')throw Error('COMPACT_EXPECTS_TRUE');opts.compact=true;}
 const s=runEuropeCacheAudit(opts);console.log(JSON.stringify({historyListings:s.historyListings,counts:s.counts,agentProviderRequests:0,agentProviderCredits:0}));
}
