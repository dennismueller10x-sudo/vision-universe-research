/** Private, deterministic recovery of real OHLC observations after authenticated
 * live probes. Never changes product prices, methods, IDs or engine admission. */
import {readFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateEodBars} from './europe-quality.mjs';
import {assessAnalyticsSeries,WINDOWS} from './europe-analytics-series.mjs';
import {verifyPrivateOutputs,writePrivateEvidence} from './europe-integrity-rebuild.mjs';
const require=createRequire(import.meta.url),{normalizeObservation}=require('../../providers/marketstack/audit-adapter.js');
export const VERSION='vu-europe-live-analytics-rebuild-1';
export const GOLDEN_IDS=Object.freeze(['ref_RHM_DE_XETR','ref_ADN1_DE_XETR','ref_2GB_DE_XETR','ref_ALV_DE_XETR','ref_SAP_DE_XETR','ref_SIE_DE_XETR','ref_HFG_DE_XETR','ref_ASML_AS_XAMS','ref_MC_PA_XPAR']);
const sha=x=>createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x)),copy=x=>JSON.parse(JSON.stringify(x));
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exactDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const same=(a,b,keys)=>keys.every(k=>a?.[k]===b[k]);
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const within=(a,b)=>{const p=relative(a,b);return p===''||!p.startsWith('..')&&!isAbsolute(p);};
function identityHeld(c){return c.wasIdentityHold===true||c.originalStatus==='IDENTITY_RESEARCH'||(Array.isArray(c.originalReasonCodes)?c.originalReasonCodes:[]).some(r=>/IDENTITY|ISSUER|SHARE_CLASS|LISTING_TRANSITION|SECURITY_AMBIGUOUS/.test(r));}
function sourceBinding(c){return c.sourceBindings||c.newSource||{};}

/** Loader validates decompressed and compressed bytes independently. It does not
 * call the provider, inspect credentials or accept a report's status as proof. */
export async function createLiveEvidenceLoader({evidenceRoot}){
 const root=await realpath(resolve(evidenceRoot)),manifestPath=await realpath(join(root,'raw-manifest.json'));check(within(root,manifestPath),'LIVE_MANIFEST_PATH_ESCAPE');const manifest=await read(manifestPath),rows=Array.isArray(manifest)?manifest:manifest.rows;
 check(Array.isArray(rows),'LIVE_RAW_MANIFEST_REQUIRED');const byId=new Map();
 for(const m of rows){check(m.id&&!byId.has(m.id),'DUPLICATE_LIVE_RAW_ID');byId.set(m.id,m);}
 async function safeFile(path){const p=await realpath(resolve(root,path));check(within(root,p),'LIVE_ARCHIVE_PATH_ESCAPE');return readFile(p);}
 return async c=>{
  const sb=sourceBinding(c),id=sb.id||sb.rawResponseId||c.rawResponseId,m=byId.get(id);
  check(m&&digest(m.sha256)&&digest(m.compressedSha256)&&m.codec==='gzip','HASH_BOUND_LIVE_RAW_METADATA_REQUIRED');
  check(sb.responseHash===m.sha256||sb.rawSha256===m.sha256,'CANDIDATE_RESPONSE_DIGEST_MISMATCH');
  const metaBytes=await safeFile('raw/'+id+'.meta.json'),meta=JSON.parse(metaBytes);
  check(same(meta,m,['id','endpoint','host','apiVersion','status','retrievedAt','sha256','compressedSha256','bytes','compressedBytes','codec','path'])&&isDeepStrictEqual(meta.params,m.params),'LIVE_METADATA_MANIFEST_MISMATCH');
  const compressed=await safeFile(m.path||'raw/'+id+'.json.gz');check(sha(compressed)===m.compressedSha256&&compressed.length===m.compressedBytes,'LIVE_COMPRESSED_RAW_HASH_MISMATCH');
  const rawBytes=gunzipSync(compressed);check(sha(rawBytes)===m.sha256&&rawBytes.length===m.bytes,'LIVE_DECOMPRESSED_RAW_HASH_MISMATCH');
  const payload=JSON.parse(rawBytes),data=payload.data;check(Array.isArray(data),'LIVE_EOD_ARRAY_REQUIRED');
  const index=sb.rawIndexInPage??sb.rowIndex;
  let matched;
  if(index!==undefined){check(Number.isInteger(index)&&index>=0&&index<data.length&&hash(data[index])===c.newRawHash,'LIVE_RAW_ROW_INDEX_MISMATCH');matched=index;}
  else{const indices=data.map((r,i)=>hash(r)===c.newRawHash?i:-1).filter(i=>i>=0);check(indices.length===1,'LIVE_RAW_ROW_MISSING_OR_AMBIGUOUS');matched=indices[0];}
  return {rawBytes,raw:data[matched],meta:m,rawIndexInPage:matched,rawPath:m.path,compressedSha256:m.compressedSha256,metaSha256:sha(metaBytes)};
 };
}

/** Recoverable is an input to independent validation, never an admission flag.
 * Historical identity holds need an authenticated exact interval attestation. */
export async function validateRecoveryCandidate(candidate,{binding,sessionDates,loadEvidence,verifyHistoricalIdentity,now}={}){
 const c=copy(candidate),b=copy(binding),fail=reason=>({accepted:false,reasonCode:reason,securityId:c.securityId,date:c.date,case:c});
 if(c.originalReasonCodes!==undefined&&!Array.isArray(c.originalReasonCodes)||!same(c,b,['securityId','listingId'])||!exactDate(c.date)||c.status!=='RECOVERABLE_VALID_BAR'||c.validated!==true||c.source!=='LIVE_MARKETSTACK_HASH_VERIFIED'||c.noSynthetic!==true||c.release!==false||!digest(c.newRawHash)||typeof loadEvidence!=='function')return fail('INDEPENDENT_RECOVERABLE_SOURCE_REQUIRED');
 if(!sessionDates.has(c.date))return fail('NOT_AN_EXACT_MIC_SESSION');
 if(identityHeld(c)){
  let a;try{a=typeof verifyHistoricalIdentity==='function'?await verifyHistoricalIdentity(copy(c),copy(b)):null;}catch{a=null;}
  if(!a||a.verified!==true||a.independent!==true||a.scope!=='HISTORICAL_LISTING_INTERVAL'||!digest(a.sourceSha256)||!['OFFICIAL_EXCHANGE','OFFICIAL_FILING','ESEF'].includes(a.sourceKind)||!same(a,b,['securityId','companyId','listingId','isin','shareClassId','mic','currency'])||!exactDate(a.validFrom)||!exactDate(a.validTo)||a.validFrom>c.date||a.validTo<c.date)return fail('HISTORICAL_IDENTITY_HOLD_NOT_INDEPENDENTLY_CERTIFIED');
 }
 let evidence;try{evidence=await loadEvidence(copy(c));}catch(e){return fail(e.message||'LIVE_RAW_EVIDENCE_LOAD_FAILED');}
 const {rawBytes,raw,meta}=evidence||{},sb=sourceBinding(c);
 if(!rawBytes||!raw||!meta||meta.status!==200||meta.endpoint!=='/eod'||meta.host!=='api.marketstack.com'||meta.apiVersion!=='v2'||sha(rawBytes)!==meta.sha256||hash(raw)!==c.newRawHash)return fail('AUTHENTICATED_LIVE_EOD_SOURCE_MISMATCH');
 if(Object.keys(meta.params||{}).some(k=>/access.?key|api.?key|token|password|secret/i.test(k)))return fail('SECRET_REQUEST_PARAMETER_FORBIDDEN');
 if((sb.responseHash||sb.rawSha256)!==meta.sha256||sb.id&&sb.id!==meta.id||sb.params&&!isDeepStrictEqual(sb.params,meta.params))return fail('LIVE_REQUEST_BINDING_MISMATCH');
 const nowMs=Date.parse(now),retrieved=Date.parse(meta.retrievedAt);
 if(!Number.isFinite(nowMs)||!Number.isFinite(retrieved)||retrieved>nowMs)return fail('INVALID_LIVE_RETRIEVAL_TIME');
 const allowed=[b.providerSymbol,...(b.verifiedProviderAliases||[])],requested=String(meta.params?.symbols||'').split(',');
 if(!requested.some(t=>allowed.includes(t))||meta.params?.date_from&&c.date<meta.params.date_from||meta.params?.date_to&&c.date>meta.params.date_to)return fail('LIVE_REQUEST_SCOPE_DOES_NOT_COVER_CASE');
 const observation=normalizeObservation(raw,{kind:'EOD',retrievedAt:meta.retrievedAt}),n=observation.normalized;
 if(n.providerTicker!==b.providerSymbol||n.providerExchange!==b.mic||n.currency!==b.currency||n.tradingDate!==c.date)return fail('LIVE_PRIMARY_LISTING_OR_CURRENCY_MISMATCH');
 if(c.newObservation&&hash(c.newObservation.raw)!==c.newRawHash)return fail('CASE_RAW_OBSERVATION_MISMATCH');
 const quality=validateEodBars([observation],{listing:{mic:b.mic,currency:b.currency,providerTicker:b.providerSymbol},currency:b.currency,now,requestRange:{from:c.date,to:c.date}});
 if(quality.quarantine.length||quality.validBars.length!==1)return fail('LIVE_OHLC_VALIDATION_FAILED');
 const q=quality.validBars[0];if(!Number.isFinite(q.volume)||q.volume<0)return fail('LIVE_VOLUME_OBSERVATION_REQUIRED');
 return {accepted:true,securityId:c.securityId,date:c.date,bar:[q.date,q.open,q.high,q.low,q.close,q.volume],normalizedSha256:hash(observation),priceBasis:'RAW_UNADJUSTED',volumeBasis:'UNKNOWN',case:c,
  provenance:{origin:'LIVE',rawResponseId:meta.id,responseSha256:meta.sha256,compressedSha256:evidence.compressedSha256||null,rawIndexInPage:evidence.rawIndexInPage,rawBarSha256:c.newRawHash,rawPath:evidence.rawPath||null,metaSha256:evidence.metaSha256||null,endpoint:meta.endpoint,params:meta.params,retrievedAt:meta.retrievedAt,normalizedSha256:hash(observation),originalRawHash:c.originalRawHash||null,originalEvidence:c.originalEvidence||c.oldSource||null}};
}

export async function mergeResearchSeries({baseline,binding,sourceWindow,calendar,candidates=[]},{loadEvidence,verifyHistoricalIdentity,now}={}){
 const old=copy(baseline),b=copy(binding),window=copy(sourceWindow),dates=new Set(calendar.sessions.map(r=>typeof r==='string'?r:r.date));
 check(old.length&&exactDate(window.from)&&exactDate(window.to)&&window.from<=old[0][0]&&window.to>=old.at(-1)[0],'BASELINE_SOURCE_WINDOW_REQUIRED');
 const byDate=new Map();for(const row of old){check(Array.isArray(row)&&row.length===7&&!byDate.has(row[0])&&dates.has(row[0])&&Number.isInteger(row[6])&&row[6]>=0,'INVALID_BASELINE_RESEARCH_BAR');check(row.slice(1,5).every(v=>Number.isFinite(v)&&v>0)&&row[2]>=Math.max(row[1],row[3],row[4])&&row[3]<=Math.min(row[1],row[2],row[4]),'INVALID_BASELINE_OHLC');byDate.set(row[0],row);}
 const decisions=[],groups=new Map(),liveSourceRefs=[];
 for(const c of copy(candidates).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.newRawHash).localeCompare(String(b.newRawHash)))){
  if(c.date<window.from||c.date>window.to){decisions.push({securityId:c.securityId,date:c.date,accepted:false,reasonCode:'OUTSIDE_BASELINE_SOURCE_WINDOW',case:c});continue;}
  const result=await validateRecoveryCandidate(c,{binding:b,sessionDates:dates,loadEvidence,verifyHistoricalIdentity,now});
  if(!result.accepted){decisions.push(result);continue;}if(!groups.has(result.date))groups.set(result.date,[]);groups.get(result.date).push(result);
 }
 for(const [date,items]of groups){const values=new Set(items.map(r=>hash(r.bar))),existing=byDate.get(date);
  if(values.size!==1||existing&&hash(existing.slice(0,6))!==hash(items[0].bar)){for(const r of items)decisions.push({...r,accepted:false,reasonCode:'LIVE_OR_BASELINE_REVISION_CONFLICT'});continue;}
  if(existing){for(const r of items)decisions.push({...r,accepted:false,reasonCode:'ALREADY_VALID_BASELINE_OBSERVATION'});continue;}
  const i=liveSourceRefs.length;liveSourceRefs.push({date,evidence:items.map(r=>r.provenance),cases:items.map(r=>r.case)});byDate.set(date,[...items[0].bar,-i-1]);for(const r of items)decisions.push({...r,reasonCode:'INDEPENDENTLY_VALIDATED_PRIVATE_RECOVERY'});
 }
 const bars=[...byDate.values()].sort((a,b)=>a[0].localeCompare(b[0]));
 return {bars,sourceWindow:window,decisions:decisions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.case?.newRawHash).localeCompare(String(b.case?.newRawHash))),liveSourceRefs,
  recoveredDates:liveSourceRefs.length,retainedBaselineBars:old.length,syntheticBars:0,forwardFills:0,engineAdmission:false,priceBasis:'RAW_UNADJUSTED',volumeBasis:'UNKNOWN'};
}

export function classifyResearchWindows(assessment){
 const technical={},backtest={};for(const name of WINDOWS){const w=assessment.windows[name],indicators=copy(w.indicators),values=Object.values(indicators),ready=values.filter(i=>i.status==='INPUT_EVIDENCE_READY').length;
  const technicalStatus=ready===values.length&&w.sessionStatus==='COMPLETE'?'SAFE':ready?'PARTIAL':'BLOCKED';
  technical[name]={status:technicalStatus,indicators,sourceWindowFrom:assessment.firstDate,sourceWindowTo:assessment.lastDate,observations:w.observations,expectedSessions:w.expectedSessions,missingSessions:w.missingSessions,insufficientHistory:w.insufficientHistory,productionTechnicalReady:false,engineInvocations:0};
  backtest[name]={status:w.supertraderInputStatus==='INPUT_EVIDENCE_READY'&&w.sessionStatus==='COMPLETE'?'SAFE':'BLOCKED',sourceWindowFrom:assessment.firstDate,sourceWindowTo:assessment.lastDate,observations:w.observations,missingSessions:w.missingSessions,reasonCodes:w.supertraderInputStatus==='INPUT_EVIDENCE_READY'?[]:['INDEPENDENT_OHLC_VOLUME_PRICE_ACTION_PIT_EXECUTION_AND_BENCHMARK_CERTIFICATES_REQUIRED'],certificationScope:'INPUT_DATA_WINDOW_ONLY_EXISTING_STRATEGY_GATES_UNCHANGED',productionBacktestReady:false,engineInvocations:0};
 }return {technical,backtest};
}

export async function rebuildLiveAnalytics({root,privateRoot,out,baselinePrivateRoot,evidenceRoot,recoverablePath,calendarPath,generatedAt,corporateActionsPath,adjustmentPath}={}){
 check([root,privateRoot,out,baselinePrivateRoot,evidenceRoot,recoverablePath,calendarPath,generatedAt].every(Boolean)&&Number.isFinite(Date.parse(generatedAt)),'EXPLICIT_LIVE_REBUILD_INPUTS_REQUIRED');
 const sourcePaths=[baselinePrivateRoot,evidenceRoot,recoverablePath,calendarPath,...[corporateActionsPath,adjustmentPath].filter(Boolean)];
 const paths=await verifyPrivateOutputs({root,privateRoot,out,sourcePaths});root=paths.root;privateRoot=paths.privateRoot;out=paths.out;
 const oldManifest=await read(join(baselinePrivateRoot,'reports/integrity-output-manifest.json')),oldBytes=await readFile(join(baselinePrivateRoot,'reports/europe_449_analytics_series.json'));
 check(sha(oldBytes)===oldManifest.outputs['europe_449_analytics_series.json'].sha256,'BASELINE_ANALYTICS_REPORT_DIGEST');const oldReport=JSON.parse(oldBytes);
 const quarantineBytes=await readFile(join(baselinePrivateRoot,'reports/europe_449_quarantine_rootcause.json'));check(sha(quarantineBytes)===oldManifest.outputs['europe_449_quarantine_rootcause.json'].sha256,'BASELINE_QUARANTINE_REPORT_DIGEST');const quarantine=JSON.parse(quarantineBytes),frozenPath=await realpath(resolve(baselinePrivateRoot,quarantine.allInheritedRawEvidence.path));check(within(await realpath(baselinePrivateRoot),frozenPath),'BASELINE_FROZEN_ARCHIVE_PATH_ESCAPE');const frozenBytes=await readFile(frozenPath);check(sha(frozenBytes)===quarantine.allInheritedRawEvidence.sha256,'BASELINE_FROZEN_IDENTITY_PROOF_DIGEST');const frozen=JSON.parse(frozenBytes),frozenByDate=new Map(frozen.rows.map(r=>[r.securityId+'|'+r.date,r]));
 const sourceBytes=await readFile(join(baselinePrivateRoot,'reports/europe_449_source_completeness.json'));check(sha(sourceBytes)===oldManifest.outputs['europe_449_source_completeness.json'].sha256,'BASELINE_SOURCE_REPORT_DIGEST');const baselineSources=JSON.parse(sourceBytes);
 const catalogBytes=await readFile(join(root,'discover/data/europe/catalog.json')),catalog=JSON.parse(catalogBytes),calendarBytes=await readFile(calendarPath),calendar=JSON.parse(calendarBytes),recoverableBytes=await readFile(recoverablePath),recoverable=JSON.parse(recoverableBytes);
 check(baselineSources.rows.length===449&&new Set(baselineSources.rows.map(r=>r.securityId)).size===449,'ALL449_SOURCE_LEDGERS_REQUIRED');
 check(oldReport.rows.length===449&&catalog.securities.length===449&&new Set(oldReport.rows.map(r=>r.securityId)).size===449,'ALL449_CANONICAL_BASELINE_REQUIRED');
 const candidates=Array.isArray(recoverable)?recoverable:recoverable.rows||recoverable.candidates||recoverable.bars;check(Array.isArray(candidates),'RECOVERABLE_CASE_ARRAY_REQUIRED');
 const bySecurity=new Map();for(const c of candidates){check(oldReport.rows.some(r=>r.securityId===c.securityId),'RECOVERY_UNKNOWN_CANONICAL_SECURITY');if(!bySecurity.has(c.securityId))bySecurity.set(c.securityId,[]);bySecurity.get(c.securityId).push(c);}
 const loadEvidence=await createLiveEvidenceLoader({evidenceRoot}),sourceReports=[];
 for(const path of [corporateActionsPath,adjustmentPath].filter(Boolean)){const bytes=await readFile(path);sourceReports.push({path:relative(privateRoot,path),sha256:sha(bytes)});}
 await mkdir(out,{recursive:true,mode:0o700});await mkdir(paths.series,{recursive:true,mode:0o700});
 const technicalRows=[],backtestRows=[],seriesRows=[],decisions=[],goldens=[];let beforeBars=0,afterBars=0,recoveredDates=0;
 for(const old of [...oldReport.rows].sort((a,b)=>a.securityId.localeCompare(b.securityId))){
  const s=catalog.securities.find(s=>s.securityId===old.securityId),l=s?.listings.find(l=>l.listingId===s.primaryListingId);check(l&&same(s,old,['securityId','companyId'])&&same(l,old,['listingId','mic','currency'])&&l.discoverChart.calendarSourceSha256===sha(calendarBytes),'LIVE_BASELINE_CANONICAL_BINDING');
  const oldPath=await realpath(resolve(baselinePrivateRoot,old.series.path));check(within(await realpath(baselinePrivateRoot),oldPath),'BASELINE_ARCHIVE_PATH_ESCAPE');const oldBlob=await readFile(oldPath);check(sha(oldBlob)===old.series.sha256,'BASELINE_SERIES_DIGEST');const baseline=JSON.parse(gunzipSync(oldBlob));
  check(hash(baseline.bars)===old.readinessEvidence.barSeriesSha256&&hash(baseline.bars.map(r=>[r[0],r[4]]))===old.closePointsSha256,'BASELINE_BAR_AND_CLOSE_DIGEST');
  const binding={region:'EUROPE',securityId:s.securityId,companyId:s.companyId,listingId:l.listingId,isin:s.isin,shareClassId:s.shareClassId,mic:l.mic,currency:l.currency,providerSymbol:l.providerSymbol,verifiedProviderAliases:(l.aliases||[]).filter(x=>x===l.ticker||x===s.canonicalTicker)},sourceWindow={from:old.readinessEvidence.firstDate,to:old.readinessEvidence.lastDate};
  const cases=bySecurity.get(s.securityId)||[],validatedCases=[];
  if(cases.length){const source=baselineSources.rows.find(r=>r.securityId===s.securityId),ledgerPath=await realpath(resolve(baselinePrivateRoot,source.sessionLedger.path));check(within(await realpath(baselinePrivateRoot),ledgerPath),'BASELINE_LEDGER_PATH_ESCAPE');const ledgerBytes=await readFile(ledgerPath);check(sha(ledgerBytes)===source.sessionLedger.sha256,'BASELINE_SESSION_LEDGER_DIGEST');const ledger=JSON.parse(gunzipSync(ledgerBytes));check(same(ledger,{securityId:s.securityId,listingId:l.listingId,mic:l.mic},['securityId','listingId','mic']),'BASELINE_LEDGER_IDENTITY_MISMATCH');const sessions=new Map(ledger.sessions.map(r=>[r[0],r]));
   for(const c of cases){const f=frozenByDate.get(s.securityId+'|'+c.date),session=sessions.get(c.date),oldRefs=(session?.[2]||[]).map(i=>ledger.sourceRawRefs[i]);
    check(session,'LIVE_RECOVERY_OUTSIDE_ORIGINAL_SOURCE_LEDGER');
    if(c.originalRawHash)check(oldRefs.some(r=>r.rawBarSha256===c.originalRawHash),'RECOVERY_OLD_RAW_EVIDENCE_MISMATCH');
    validatedCases.push({...c,wasIdentityHold:c.wasIdentityHold===true||f?.identityExcluded===true,originalReasonCodes:[...new Set([...(c.originalReasonCodes||[]),...(f?.frozenReasonCodes||[]),...(session[3]||[])])],originalEvidence:{caseEvidence:c.originalEvidence||c.oldEvidence||null,frozenEvidence:f||null,sourceLedger:{path:source.sessionLedger.path,sha256:source.sessionLedger.sha256,date:c.date,status:session[1],rawIndices:session[2],rawRefs:oldRefs},originalBaselineSeriesSha256:old.series.sha256}});
   }
  }
  const merged=await mergeResearchSeries({baseline:baseline.bars,binding,sourceWindow,calendar:calendar.calendars[l.mic],candidates:validatedCases},{loadEvidence,now:generatedAt});
  const assessment=await assessAnalyticsSeries({binding,points:merged.bars.map(b=>[b[0],b[4]]),bars:merged.bars,sourceWindow,calendar:calendar.calendars[l.mic],priceBasis:'RAW_UNADJUSTED',volumeBasis:'UNKNOWN'}),windows=classifyResearchWindows(assessment);
  const payload={schema:VERSION,binding,columns:['date','open','high','low','close','volume','sourceIndex'],sourceIndexConvention:'NONNEGATIVE_BASELINE_RAW_INDEX_NEGATIVE_LIVE_INDEX_MINUS_ONE',bars:merged.bars,sourceWindow,baselineSource:{path:oldPath,sha256:old.series.sha256,sourceRefsSha256:hash(baseline.sourceRefs),originalSourceWindow:sourceWindow},liveSourceRefs:merged.liveSourceRefs,priceBasis:'RAW_UNADJUSTED',volumeBasis:'UNKNOWN',certification:'UNCERTIFIED_PRIVATE_RESEARCH_ONLY',engineAdmission:false,syntheticBars:0,forwardFills:0};
  const gzip=gzipSync(Buffer.from(JSON.stringify(payload)+'\n'),{level:6}),name=s.securityId+'-live-analytics.json.gz';await writePrivateEvidence(join(paths.series,name),gzip);
  const common={securityId:s.securityId,companyId:s.companyId,listingId:l.listingId,name:s.name,ticker:l.ticker,mic:l.mic,currency:l.currency,issuerCountry:l.identityAdmission.issuerCountry};
  technicalRows.push({...common,windows:windows.technical,productionTechnicalReady:false});backtestRows.push({...common,windows:windows.backtest,productionBacktestReady:false});
  seriesRows.push({...common,beforeBars:baseline.bars.length,afterBars:merged.bars.length,recoveredDates:merged.recoveredDates,sourceWindow,series:{path:relative(privateRoot,join(paths.series,name)),sha256:sha(gzip),bytes:gzip.length},pointsSha256:assessment.pointsSha256,barSeriesSha256:assessment.barSeriesSha256,readinessEvidence:assessment});
  decisions.push(...merged.decisions);beforeBars+=baseline.bars.length;afterBars+=merged.bars.length;recoveredDates+=merged.recoveredDates;
  if(GOLDEN_IDS.includes(s.securityId))goldens.push({...common,beforeBars:baseline.bars.length,afterBars:merged.bars.length,recoveredDates:merged.recoveredDates,sourceWindow,technical:windows.technical,backtest:windows.backtest,specialTreatment:false});
 }
 check(goldens.length===9,'ALL_NINE_GOLDENS_REQUIRED');
 const counts=rows=>Object.fromEntries(WINDOWS.map(w=>[w,Object.fromEntries(['SAFE','PARTIAL','BLOCKED'].map(status=>[status,rows.filter(r=>r.windows[w].status===status).length]))]));
 const header={schema:VERSION,generatedAt,securities:449,baselineSourceCommit:oldReport.baselineSourceCommit,baselineReportSha256:sha(oldBytes),catalogSha256:sha(catalogBytes),calendarSha256:sha(calendarBytes),recoverableReportSha256:sha(recoverableBytes),liveRawManifestSha256:sha(await readFile(join(evidenceRoot,'raw-manifest.json'))),frozenIdentityAndQuarantineProofSha256:sha(frozenBytes),baselineSourceReportSha256:sha(sourceBytes),sourceReports,displayFrozen:true,privateOnly:true,providerRequests:0,syntheticBars:0,forwardFills:0,engineInvocations:0,methodsChanged:false,productionAdmission:false};
 const summary={...header,beforeBars,afterBars,recoveredDates,cases:candidates.length,caseDispositionCounts:decisions.reduce((o,r)=>(o[r.reasonCode]=(o[r.reasonCode]||0)+1,o),{}),technical:counts(technicalRows),backtest:counts(backtestRows),germany:{securities:technicalRows.filter(r=>r.issuerCountry==='DE').length,technical:counts(technicalRows.filter(r=>r.issuerCountry==='DE')),backtest:counts(backtestRows.filter(r=>r.issuerCountry==='DE'))},goldens,rows:seriesRows,decisions};
 const outputs={'europe_449_technical_window_readiness.json':{...header,counts:summary.technical,rows:technicalRows},'europe_449_backtest_window_readiness.json':{...header,counts:summary.backtest,rows:backtestRows},'europe_449_live_analytics_rebuild.json':summary},bindings={};
 for(const [name,data]of Object.entries(outputs)){const bytes=JSON.stringify(data)+'\n';await writePrivateEvidence(join(out,name),bytes);bindings[name]={sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};}
 const result={...header,beforeBars,afterBars,recoveredDates,technical:summary.technical,backtest:summary.backtest,germany:summary.germany,outputs:bindings};await writePrivateEvidence(join(out,'live-analytics-output-manifest.json'),JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const opts={};for(let i=2;i<process.argv.length;i+=2)opts[process.argv[i].slice(2)]=process.argv[i+1];console.log(JSON.stringify(await rebuildLiveAnalytics(opts)));}
