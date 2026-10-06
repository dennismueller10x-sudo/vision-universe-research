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
const RAW_KEYS=['sma20','sma50','sma200','high52w','low52w','momentum1M','momentum3M','momentum6M','momentum12M','realizedVol','realizedVolLong','atr'];

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
 const f=Features.computeFeatures(series,methodology.features).last();
 const historical=window.to!==history.bars.at(-1)?.date;
 const reasons=['UNKNOWN_ADJUSTMENT_BASIS',...(historical?['HISTORICAL_DIAGNOSTIC_WINDOW_ONLY']:[])];
 for(const k of RAW_KEYS)result.fields[k]={status:num(f[k])?'PARTIAL':'BLOCKED',value:num(f[k])?f[k]:null,
  causes:[...reasons,...(!num(f[k])?['SHORT_HISTORY']:[])],
  valueUnit:k.startsWith('momentum')?'LOG_RETURN':k.startsWith('realizedVol')?'ANNUALIZED_LOG_RETURN_STDDEV':'LISTING_QUOTE_UNIT'};
 result.status=Object.values(result.fields).some(f=>num(f.value))?'PARTIAL':'BLOCKED';
 result.causes=unique([...reasons,...(result.status==='BLOCKED'?['SHORT_HISTORY']:[])]);
 return result;
}

export function auditEuropeanCacheSeries({listing,history,calendar,asOf,sources=[],rawDocumentationEvidence=[]}={}){
 if(!listing?.listingId||!Array.isArray(history?.bars)||!history.bars.length)throw Error('FROZEN_LISTING_AND_REAL_HISTORY_REQUIRED');
 const window={from:history.bars[0].date,to:history.bars.at(-1).date};
 const full=certifyEuropeanHistory({listing,history,asOf,calendar,window});
 const verifiedSources=sources.filter(s=>s.status===200&&s.apiVersion===history.apiVersion&&s.host==='api.marketstack.com');
 const metadata=verifiedSources.filter(s=>s.endpoint==='/tickers/'+listing.providerSymbol);
 const identityVerified=metadata.some(s=>s.body?.isin===listing.isin&&s.body?.symbol===listing.providerSymbol);
 const sourceRows=new Map();
 for(const s of verifiedSources.filter(s=>s.endpoint?.startsWith('/eod')&&s.params?.symbols===listing.providerSymbol&&s.params?.exchange===listing.mic))
  for(const row of s.body?.data||[])sourceRows.set(String(row.date).slice(0,10),row);
 const sourceMatches=history.bars.filter(b=>{const row=sourceRows.get(b.date);return row&&row.exchange===listing.mic&&row.symbol===listing.providerSymbol&&['open','high','low','close','volume'].every(k=>row[k]===b[k]);}).length;
 const sourceVerified=identityVerified&&sourceMatches===history.bars.length;
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
 const recent=certifyEuropeanHistory({listing,history,asOf,calendar,window:recentWindow});
 const researchWindows=unique([JSON.stringify(recentWindow),...runs.slice().sort((a,b)=>b.length-a.length||b.at(-1).localeCompare(a.at(-1))).slice(0,2).map(r=>JSON.stringify({from:r[0],to:r.at(-1)}))]);
 const research=researchWindows.map(s=>researchRaw({listing,history,calendar,window:JSON.parse(s),asOf,sourceVerified,rawDocumentationEvidence}));
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
  isin:listing.isin,mic:listing.mic,securityId:listing.securityId,listingId:listing.listingId,retrievedAt:history.retrievedAt,
  identity:{status:identityVerified?'READY':'BLOCKED',causes:identityVerified?[]:['MAPPING_ERROR'],evidence:metadata.map(s=>s.file||s.endpoint)},
  sourceFields:{status:sourceMatches===history.bars.length?'READY':'BLOCKED',causes:sourceMatches===history.bars.length?[]:['ADAPTER_BUG'],matches:sourceMatches,bars:history.bars.length},
  independentlyCoveredYears:calendar?.coveredYears||[],missingSourceSessions,quarantinedSessions,quarantinedRows:(history.quarantined||[]).length,
  lastAvailableEOD:window.to,lastKnownCompletedSession:calendar?.lastProvenCompletedSession||null,
  knownSessionLag:calendar?.lastProvenCompletedSession?calendar.expectedSessions.filter(d=>d>window.to&&d<=calendar.lastProvenCompletedSession).length:null,
  fullWindow:full,recentWindow:recent,researchDiagnostics:research,totalReturnDiagnostic,
  corporateActionCompleteness:{status:'BLOCKED',causes:['UNKNOWN_ADJUSTMENT_BASIS'],dedicatedEndpointAbsenceIsNotCompleteness:true},
  volume:{status:'BLOCKED',causes:['UNVERIFIED_VOLUME_BASIS'],zeroVolumeBars:history.bars.filter(b=>b.volume===0).length},
  quant:{status:'BLOCKED',causes:['MISSING_FUNDAMENTALS','MISSING_FX_OR_SHARE_BASIS','PRODUCT_INTEGRATION_MISSING'],score:null},
  supertrader:{status:'BLOCKED',causes:['UNKNOWN_ADJUSTMENT_BASIS','UNVERIFIED_VOLUME_BASIS','MISSING_FX_OR_SHARE_BASIS'],score:null},
  publicDisplay:false,agentProviderRequests:0,agentProviderCredits:0};
}

export function runEuropeCacheAudit({requestPath,normalizedDir,sourceDir,calendarRulesPath,documentationEvidencePath,out,asOf,now}){
 const output=assertPrivateOutput(out);fs.mkdirSync(output,{recursive:true});
 const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const request=load(requestPath);const map=request.listingMap||request;
 if(!Array.isArray(map.listings)||!asOf||!now)throw Error('FROZEN_MAPPING_FIXED_ASOF_AND_NOW_REQUIRED');
 const rules=load(calendarRulesPath);
 const calendars=Object.fromEntries(Object.entries(rules.configs).map(([mic,c])=>[mic,buildEuropeanCalendar({...c,now})]));
 const doc=documentationEvidencePath?load(documentationEvidencePath):null;
 const rawDocumentationEvidence=doc?.url&&doc?.retrievedAt&&/^[a-f0-9]{64}$/.test(doc.sha256)?[doc.url+' retrievedAt='+doc.retrievedAt+' sha256='+doc.sha256]:[];
 const summaries=[];
 const seen=new Set();
 for(const listing of map.listings){
  if(!listing.listingId)continue;
  if(!/^lst_[A-Z0-9]{4}_[A-Z0-9]{12}$/.test(listing.listingId)||seen.has(listing.listingId))throw Error('UNIQUE_CANONICAL_LISTING_REQUIRED');
  seen.add(listing.listingId);
  const filename=path.join(normalizedDir,listing.listingId+'.json');if(!fs.existsSync(filename))continue;
  const history=load(filename);const sources=[];
  for(const ref of history.sourceEvidence||[]){const match=/^sha256:([a-f0-9]{64})$/.exec(ref);if(!match||!sourceDir)continue;
   const name=match[1]+'.json';const file=path.join(sourceDir,name);if(fs.existsSync(file))sources.push({file:name,...load(file)});}
  const report=auditEuropeanCacheSeries({listing,history,calendar:calendars[listing.mic],asOf,sources,rawDocumentationEvidence});
  const outfile=assertPrivateOutput(path.join(output,listing.listingId+'.json'));fs.writeFileSync(outfile,JSON.stringify(report,null,2)+'\n');
  summaries.push({name:report.name,listingId:report.listingId,isin:report.isin,mic:report.mic,bars:report.sourceFields.bars,lastAvailableEOD:report.lastAvailableEOD,
   originalFields:report.sourceFields.status,identity:report.identity.status,knownSessionLag:report.knownSessionLag,
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
 fs.writeFileSync(assertPrivateOutput(path.join(output,'summary.json')),JSON.stringify(summary,null,2)+'\n');
 fs.writeFileSync(assertPrivateOutput(path.join(output,'calendars.json')),JSON.stringify({now,calendars},null,2)+'\n');return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);const opts={};const flags={'--request':'requestPath','--normalized-dir':'normalizedDir','--source-dir':'sourceDir','--calendar-rules':'calendarRulesPath',
  '--documentation-evidence':'documentationEvidencePath','--out':'out','--as-of':'asOf','--now':'now'};
 for(let i=0;i<args.length;i+=2){if(!flags[args[i]]||!args[i+1])throw Error('EXPECTED_NAMED_ARGUMENTS');opts[flags[args[i]]]=args[i+1];}
 const s=runEuropeCacheAudit(opts);console.log(JSON.stringify({historyListings:s.historyListings,counts:s.counts,agentProviderRequests:0,agentProviderCredits:0}));
}
