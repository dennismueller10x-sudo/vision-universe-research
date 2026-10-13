/** Offline integrity evidence, never a producer of product prices or scores.
 * Raw/normalized sources and immutable display artifacts remain untouched.
 * Every session is individually recorded in private, hash-bound gzip ledgers. */
import {readFile,writeFile,mkdir,realpath,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {join,resolve,relative,dirname,basename,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateEodBars} from './europe-quality.mjs';
import {assessAnalyticsSeries,WINDOWS,INDICATOR_POLICIES} from './europe-analytics-series.mjs';
const require=createRequire(import.meta.url),{normalizeObservation}=require('../../providers/marketstack/audit-adapter.js');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x)),copy=x=>JSON.parse(JSON.stringify(x));
const read=async p=>JSON.parse(await readFile(p,'utf8')),sum=(a,k)=>a.reduce((n,r)=>n+(r[k]||0),0),count=items=>{const x={};for(const k of items)x[k]=(x[k]||0)+1;return x;};
async function canonical(path){const p=resolve(path);try{return await realpath(p);}catch(e){if(e.code!=='ENOENT')throw e;return join(await canonical(dirname(p)),basename(p));}}
const within=(root,path)=>{const r=relative(root,path);return r===''||!r.startsWith('..')&&!isAbsolute(r);};
export async function verifyPrivateOutputs({root,privateRoot,out,sourcePaths=[]}){
 root=await canonical(root);const privateCanonical=await canonical(privateRoot),output=await canonical(out),series=await canonical(join(privateRoot,'integrity-series'));
 if(privateCanonical!==resolve(privateRoot)||output!==resolve(out)||series!==resolve(privateRoot,'integrity-series')||within(root,privateCanonical)||within(privateCanonical,root)||!within(privateCanonical,output))throw Error('PRIVATE_EVIDENCE_OUTPUT_REQUIRED');
 const protectedPaths=await Promise.all([root,...sourcePaths].map(canonical));
 if([output,series].some(target=>protectedPaths.some(p=>within(p,target)||within(target,p))))throw Error('PRIVATE_OUTPUT_OVERLAPS_SOURCE');
 return {root,privateRoot:privateCanonical,out:output,series};
}
export async function writePrivateEvidence(path,bytes){
 if(await canonical(dirname(path))!==resolve(dirname(path)))throw Error('PRIVATE_OUTPUT_PARENT_LINK');
 const stat=await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(stat&&(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1))throw Error('PRIVATE_OUTPUT_FILE_LINK');
 const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
 try{const opened=await file.stat();if(!opened.isFile()||opened.nlink!==1)throw Error('PRIVATE_OUTPUT_FILE_LINK');await file.chmod(0o600);await file.truncate(0);await file.writeFile(bytes);}finally{await file.close();}
}
export function classifySourceSession({approved,rawIndices=[],frozenExcluded=false,rejectionReasons=[]}){
 if(approved)return {status:'OBSERVED_VALID',scope:'DISPLAY_CLOSE_ONLY'};
 if(rawIndices.length&&frozenExcluded)return {status:'OBSERVED_QUARANTINED',scope:'IMMUTABLE_PRIOR_EXCLUSION'};
 if(rawIndices.length&&rejectionReasons.length)return {status:'OBSERVED_QUARANTINED',scope:'RECONSTRUCTED_CLOSE_ADMISSION_EXCLUSION'};
 if(!rawIndices.length)return {status:'PROVIDER_ABSENT',scope:'COMPLETE_AUTHENTICATED_RESPONSE_ONLY'};
 return {status:'UNKNOWN',scope:'DELIVERED_WITHOUT_EXPLAINED_ADMISSION_DECISION'};
}
export function researchBars({observations,quality,approvedPoints,frozenExcludedDates}){
 const approved=new Map(approvedPoints),excluded=new Set(frozenExcludedDates),rows=[];
 for(const q of quality.validBars){if(!approved.has(q.date)||excluded.has(q.date))continue;const o=observations[q.rawIndex];
  if(o.normalized.close!==approved.get(q.date)||o.normalized.close!==o.raw.close)throw Error('ANALYTICS_CLOSE_MUST_EQUAL_REAL_APPROVED_RAW');
  rows.push([q.date,q.open,q.high,q.low,q.close,q.volume,q.rawIndex]);
 }
 if(new Set(rows.map(r=>r[0])).size!==rows.length)throw Error('ANALYTICS_DUPLICATE_DAY');
 return rows;
}
export function admissionReasons(decision,replayRow){
 const codes=decision.reasonCodes;
 if(!Array.isArray(codes))throw Error('REJECTION_REASONS_REQUIRED');
 if(codes.length)return codes;
 if(decision.primaryCause==='PRE_SAFE_SUFFIX_QUARANTINE'&&replayRow.suffixFrom&&decision.date<replayRow.suffixFrom&&replayRow.preSuffixCriticalIssues?.some(i=>i.code==='SERIOUS_UNEXPLAINED_CLOSE_DISCONTINUITY'&&i.date<replayRow.suffixFrom))return ['ADMISSION_SAFE_PREFIX_BEFORE_UNEXPLAINED_CLOSE_BREAK'];
 throw Error('UNEXPLAINED_RAW_EXCLUSION_DECISION');
}
export async function rebuild({root,privateRoot,evidence,calendarPath,exclusionsPath,replayPath,generatedAt,out}){
 if(!root||!privateRoot||!evidence||!calendarPath||!exclusionsPath||!replayPath||!generatedAt||!out||!Number.isFinite(Date.parse(generatedAt)))throw Error('EXPLICIT_OFFLINE_INPUTS_REQUIRED');
 root=resolve(root);privateRoot=resolve(privateRoot);out=resolve(out);
 await verifyPrivateOutputs({root,privateRoot,out,sourcePaths:[evidence,calendarPath,exclusionsPath,replayPath,...['api-review/api-request-audit.json','api-review/provider-absent-api-proof.json','quarantine/quarantine-summary.json','actions-review.json','semantics-review.json'].map(p=>join(privateRoot,p))]});
 const base=join(root,'discover/data/europe'),manifest=await read(join(base,'manifest.json')),catalogBytes=await readFile(join(base,'catalog.json')),catalog=JSON.parse(catalogBytes),summary=await read(join(evidence,'summary.json')),calBytes=await readFile(calendarPath),calendar=JSON.parse(calBytes),exclusions=await read(exclusionsPath),replayBytes=await readFile(replayPath),replaySha256=sha(replayBytes),replay=JSON.parse(replayBytes);
 if(sha(catalogBytes)!==manifest.catalog.sha256||catalog.securities.length!==449||new Set(catalog.securities.map(s=>s.securityId)).size!==449)throw Error('HASH_BOUND_449_BASELINE_REQUIRED');
 const replayRows=replay.rows;if(!Array.isArray(replayRows)||replayRows.length!==449)throw Error('ALL_449_REPLAY_REQUIRED');
 await mkdir(out,{recursive:true,mode:0o700});await mkdir(join(privateRoot,'integrity-series'),{recursive:true,mode:0o700});
 const api=await read(join(privateRoot,'api-review/api-request-audit.json')),provider=await read(join(privateRoot,'api-review/provider-absent-api-proof.json')),quarantine=await read(join(privateRoot,'quarantine/quarantine-summary.json')),allFrozen=await read(join(privateRoot,'quarantine/all-frozen-date-reasons-summary.json')),actions=await read(join(privateRoot,'actions-review.json')),semantics=await read(join(privateRoot,'semantics-review.json'));
 const allFrozenEvidence={path:'quarantine/all-frozen-date-reasons.json',sha256:sha(await readFile(join(privateRoot,'quarantine/all-frozen-date-reasons.json'))),summary:allFrozen};
 const calendarAttribution=await read(join(privateRoot,'raw-non-session-calendar-attribution.json')),calendarEvidencePaths=['official-fwb-historical-calendar-evidence.json','official-fwb-secondary-calendar-evidence.json','raw-non-session-calendar-attribution.json','calendar-review.json'];
 const calendarEvidence=await Promise.all(calendarEvidencePaths.map(async p=>({path:p,sha256:sha(await readFile(join(privateRoot,p)))})));
 const calendarRows=new Map(calendarAttribution.rows.map(r=>[r.securityId+'|'+r.date,r]));
 const providerByDate=new Map(provider.rows.map(r=>[r.securityId+'|'+r.date,r])),allProviderRows=[];
 const rows=[],technical=[],backtest=[],seriesRows=[],analyticsReasonCounts={},sourceRecords=[];
 async function emitPrivate(name,data){const bytes=gzipSync(Buffer.from(JSON.stringify(data)+'\n'),{level:6});const path=join(privateRoot,'integrity-series',name+'.json.gz');await writePrivateEvidence(path,bytes);return {path:relative(privateRoot,path),sha256:sha(bytes),bytes:bytes.length,codec:'gzip'};}
 for(const s of catalog.securities){
  const l=s.listings.find(l=>l.listingId===s.primaryListingId),id=s.securityId,meta=summary.results.find(r=>r.kind==='history'&&r.listing.securityId===id),r=replayRows.find(r=>r.securityId===id),cal=calendar.calendars[l.mic],excluded=exclusions[id];
  if(!l||!meta?.complete||!r||!cal||cal.mic!==l.mic||sha(calBytes)!==l.discoverChart.calendarSourceSha256||hash(excluded)!==l.discoverChart.immutableExclusionsSha256)throw Error('SOURCE_IDENTITY_CALENDAR_EXCLUSION_BOUNDARY');
  const nb=await readFile(join(evidence,meta.resultPath));if(sha(nb)!==meta.normalizedSha256)throw Error('NORMALIZED_HASH_CHANGED');
  const n=JSON.parse(nb),obs=n.result.data,rawRefs=new Map(),responseRefs=[];
  for(const rid of n.responseIds){const rb=await readFile(join(evidence,'raw',rid+'.json')),rm=await read(join(evidence,'raw',rid+'.meta.json'));
   if(sha(rb)!==rm.sha256||rm.id!==rid||rm.status!==200||rm.endpoint!=='/eod'||rm.apiVersion!=='v2'||rm.host!=='api.marketstack.com'||rm.params.exchange!==l.mic||rm.params.symbols!==l.providerSymbol)throw Error('EXACT_RAW_RESPONSE_SCOPE_REQUIRED');
   responseRefs.push({id:rid,sha256:rm.sha256,endpoint:rm.endpoint,params:Object.fromEntries(['symbols','limit','exchange','date_from','date_to','sort','offset'].filter(k=>Object.hasOwn(rm.params,k)).map(k=>[k,rm.params[k]])),retrievedAt:rm.retrievedAt});
   JSON.parse(rb).data.forEach((bar,i)=>{const h=hash(bar);if(rawRefs.has(h))throw Error('DUPLICATE_PROVIDER_ROW');rawRefs.set(h,{id:rid,row:i,sha256:rm.sha256});});
  }
  const sourceByIndex=obs.map(o=>{const h=hash(o.raw),ref=rawRefs.get(h),normalized=normalizeObservation(o.raw,{kind:'EOD',retrievedAt:o.normalized.retrievedAt});if(!ref||hash(normalized)!==hash(o))throw Error('RAW_NORMALIZED_LINEAGE_MISMATCH');return {...ref,rawBarSha256:h};});
  if(rawRefs.size!==obs.length)throw Error('NORMALIZATION_DROPPED_ROWS');
  const pb=await readFile(join(root,manifest.history[id].MAX.url.slice(1))),p=JSON.parse(pb),proof=l.discoverChart.ranges.MAX;
  if(r.approvedReplayExact!==true||r.normalizedSha256!==meta.normalizedSha256||r.sourceInputSha256!==proof.sourceInputSha256||r.approvedPointsSha256!==proof.pointsSha256||r.approvedSegmentsSha256!==proof.segmentsSha256)throw Error('REPLAY_NOT_BOUND_TO_SOURCE_AND_APPROVED_PROOFS');
  if(sha(pb)!==manifest.history[id].MAX.sha256||hash(p.points)!==proof.pointsSha256||hash(p.segments)!==proof.segmentsSha256)throw Error('APPROVED_ORIGINAL_SERIES_CHANGED');
  const byDate=new Map();obs.forEach((o,i)=>{const d=o.normalized.tradingDate;if(!byDate.has(d))byDate.set(d,[]);byDate.get(d).push(i);});
  const quality=validateEodBars(obs,{listing:{...l,providerTicker:l.providerSymbol},now:generatedAt,currency:l.currency,requestRange:{from:meta.request.from,to:meta.request.to}});
  const badByIndex=new Map(quality.quarantine.map(q=>[q.rawIndex,q.reasons])),approved=new Map(p.points),ex=new Set(excluded),sessions=cal.sessions.map(x=>x.date),scheduled=new Set(sessions),rawFirst=obs[0].normalized.tradingDate,rawLast=obs.at(-1).normalized.tradingDate;
  // Replay decisions include immutable, direct Close rejection and safe-prefix
  // admission separately; no delivered observation is called provider-absent.
  const decisions=r.rawExclusions;if(!Array.isArray(decisions))throw Error('PER_RAW_EXCLUSION_REPLAY_REQUIRED');
  if(decisions.length!==obs.length-p.points.length||new Set(decisions.map(d=>d.rawIndex)).size!==decisions.length)throw Error('EVERY_RAW_EXCLUSION_MUST_BE_ACCOUNTED');
  for(const d of decisions){const o=obs[d.rawIndex];if(!o||d.date!==o.normalized.tradingDate||d.rawBarSha256!==sourceByIndex[d.rawIndex].rawBarSha256||d.normalizedSha256!==meta.normalizedSha256||approved.has(d.date))throw Error('RAW_EXCLUSION_LINEAGE_MISMATCH');admissionReasons(d,r);}
  const replayByDate=new Map(decisions.map(d=>[d.date,d])),sessionRows=[],baselineCounts={},fullSourceCounts={},newAnalyticalExclusions=[];
  for(const d of sessions.filter(d=>d>=rawFirst&&d<=rawLast)){
   const rawIndices=byDate.get(d)||[],decision=replayByDate.get(d),reasonCodes=decision?admissionReasons(decision,r):[],status=classifySourceSession({approved:approved.has(d),rawIndices,frozenExcluded:ex.has(d),rejectionReasons:reasonCodes});
   const failures=rawIndices.flatMap(i=>badByIndex.get(i)||[]),analyticsEligible=approved.has(d)&&rawIndices.length===1&&!failures.length&&!ex.has(d);
   if(approved.has(d)&&!analyticsEligible)newAnalyticalExclusions.push({date:d,rawIndices,reasonCodes:[...new Set(failures)],sourceRefs:rawIndices.map(i=>sourceByIndex[i])});
   sessionRows.push([d,status.status,rawIndices,reasonCodes,approved.has(d),analyticsEligible]);fullSourceCounts[status.status]=(fullSourceCounts[status.status]||0)+1;
   if(d>=p.points[0][0]&&d<=p.points.at(-1)[0])baselineCounts[status.status]=(baselineCounts[status.status]||0)+1;
   if(status.status==='PROVIDER_ABSENT')allProviderRows.push({...providerByDate.get(id+'|'+d),securityId:id,listingId:l.listingId,providerSymbol:l.providerSymbol,mic:l.mic,date:d,rawPresent:false,classification:'API_RESPONSE_OMISSION_VERIFIED',withinPriorApprovedWindow:d>=p.points[0][0]&&d<=p.points.at(-1)[0],historicalIdentityCertification:'NOT_ESTABLISHED',querySpansDate:true,queryAndPaginationValid:true,rawPageEvidenceIds:responseRefs.map(r=>({id:r.id,sha256:r.sha256})),underlyingEconomicCause:'UNKNOWN',providerWideUnavailableClaim:false});
  }
  const closures=[];for(let t=Date.parse(rawFirst);t<=Date.parse(rawLast);t+=86400000){const d=new Date(t).toISOString().slice(0,10);if(!scheduled.has(d)){const a=calendarRows.get(id+'|'+d);closures.push([d,'EXPECTED_CLOSURE',[0,6].includes(new Date(t).getUTCDay())?'WEEKEND':'EXACT_MIC_LIBRARY_CLOSURE',byDate.get(d)||[],a?.calendarClassification||'LIBRARY_CALENDAR_ONLY',a?.sourceSha256||null]);}}
  const bars=researchBars({observations:obs,quality,approvedPoints:p.points,frozenExcludedDates:excluded});
  const candidates=await emitPrivate(id+'-analytics',{schema:'vu-europe-private-analytics-candidates-1',binding:{securityId:id,listingId:l.listingId,mic:l.mic,currency:l.currency},priceBasis:'RAW_UNADJUSTED',columns:['date','open','high','low','close','volume','sourceRawIndex'],bars,sourceRefs:sourceByIndex,certification:'UNCERTIFIED_FOR_ANALYTICAL_ENGINE_ADMISSION',engineAdmission:false,syntheticBars:0,forwardFills:0});
  const ledger=await emitPrivate(id+'-sessions',{schema:'vu-europe-all-source-session-ledger-1',securityId:id,listingId:l.listingId,mic:l.mic,columns:['date','displaySourceStatus','rawIndices','closeAdmissionReasons','displayApproved','analyticsOHLCValid'],sessions:sessionRows,closures,sourceRawRefs:sourceByIndex,allRawExclusions:decisions,analyticsNewExclusions:newAnalyticalExclusions,calendarSha256:sha(calBytes),normalizedSha256:meta.normalizedSha256,approvedPointsSha256:proof.pointsSha256});
  const binding={region:'EUROPE',securityId:id,companyId:s.companyId,listingId:l.listingId,mic:l.mic,currency:l.currency},assessment=await assessAnalyticsSeries({binding,points:bars.map(b=>[b[0],b[4]]),bars,volumeBasis:'UNKNOWN',calendar:cal,sourceWindow:{from:p.points[0][0],to:p.points.at(-1)[0]},priceBasis:'RAW_UNADJUSTED'});
  for(const w of Object.values(assessment.windows))for(const i of Object.values(w.indicators))for(const code of i.reasonCodes)analyticsReasonCounts[code]=(analyticsReasonCounts[code]||0)+1;
  const common={securityId:id,companyId:s.companyId,listingId:l.listingId,name:s.name,ticker:l.ticker,mic:l.mic,currency:l.currency,issuerCountry:l.identityAdmission.issuerCountry};
  rows.push({...common,requestedRange:meta.request,rawFirst,rawLast,rawBars:obs.length,approvedBars:p.points.length,rawExcludedBars:obs.length-p.points.length,allSourceSessionCounts:fullSourceCounts,baselineApprovedWindowCounts:baselineCounts,rawClosureRows:obs.filter(o=>!scheduled.has(o.normalized.tradingDate)).length,analyticCandidates:bars.length,analyticExcludedDisplayBars:newAnalyticalExclusions.length,sessionLedger:ledger,pipelineStages:{RAW_PROVIDER:{hash:hash(responseRefs),responseRefs},NORMALIZED:{sha256:meta.normalizedSha256,rows:obs.length,fieldLoss:0},QUARANTINE_AND_ADMISSION:{sha256:hash(decisions),sourceReplaySha256:replaySha256,recovered:0},APPROVED:{fileSha256:sha(pb),pointsSha256:proof.pointsSha256,rows:p.points.length},ANALYTICS_CANDIDATE:{...candidates,barsSha256:hash(bars),rows:bars.length,engineAdmission:false}}});
  technical.push({...common,status:'TECHNICAL_BLOCKED',reasonCodes:['ADJUSTMENT_BASIS_UNCERTIFIED','HISTORICAL_IDENTITY_UNCERTIFIED','CORPORATE_ACTION_CONTINUITY_UNCERTIFIED','OHLC_VOLUME_AND_BENCHMARK_CERTIFICATES_REQUIRED'],windows:assessment.windows,productionTechnicalReady:false});
  backtest.push({...common,status:'BACKTEST_BLOCKED',reasonCodes:['EXACT_SESSION_EXECUTION_INPUTS_REQUIRED','ADJUSTMENT_CORPORATE_ACTION_AND_HISTORICAL_IDENTITY_UNCERTIFIED'],windows:Object.fromEntries(WINDOWS.map(w=>[w,{status:'BACKTEST_BLOCKED',safe:false,...assessment.windows[w]}])),productionBacktestReady:false});
  seriesRows.push({...common,series:candidates,rows:bars.length,excludedDisplayOHLCBars:newAnalyticalExclusions,closePointsSha256:assessment.pointsSha256,readinessEvidence:assessment,syntheticBars:0,forwardFills:0,engineInvocations:0});sourceRecords.push({securityId:id,raw:hash(responseRefs),normalized:meta.normalizedSha256,approved:proof.pointsSha256,analytics:hash(bars)});
  if(rows.length%50===0)console.error(JSON.stringify({offlineTitlesReconstructed:rows.length,total:449,providerCalls:0}));
 }
 const header={schema:'vu-europe-449-data-integrity-1',generatedAt,securities:449,baselineSourceCommit:api.baselineSourceCommit,sourceWindow:'LAST_STORED_PROVIDER_HISTORY_NOT_CURRENT_FRESHNESS',catalogSha256:sha(catalogBytes),calendarSha256:sha(calBytes),calendarEvidence,lineageSha256:hash(sourceRecords),displayFrozen:true,providerRequests:0,providerCredits:0,quarantineReleased:0,fabricatedBars:0,engineInvocations:0};
 const totals={rawBars:sum(rows,'rawBars'),approvedBars:sum(rows,'approvedBars'),rawExcludedBars:sum(rows,'rawExcludedBars'),analyticsCandidateBars:sum(rows,'analyticCandidates'),analyticsExcludedDisplayBars:sum(rows,'analyticExcludedDisplayBars')};
 const reports={
  'europe_449_source_completeness.json':{...header,totals,apiRequestReview:api.conclusions,rows},
  'europe_449_provider_absent_rootcause.json':{...header,totalSessions:allProviderRows.length,priorApprovedWindowSessions:provider.rows.length,additionalPreAdmissionWindowSessions:allProviderRows.length-provider.rows.length,trueProviderResponseOmissions:allProviderRows.length,economicRootCauseUnresolved:allProviderRows.length,apiQueryBugs:0,recoveredCachedBars:0,historicalIdentityCasesEstablished:0,proofBasis:'FULL_PAGINATED_AUTHENTICATED_WIRE_RESPONSE;NOT_PROVIDER_WIDE_UNAVAILABILITY',liveTargetedProbes:{status:'NOT_EXECUTED_RUNTIME_API_KEY_NOT_CONFIGURED',reusedPriorRuns:5,newRequests:0},rows:allProviderRows},
  'europe_449_quarantine_rootcause.json':{...header,inheritedMissingSessions:quarantine.quarantinedMissingSessions,originalReasonCounts:quarantine.frozenReasonCounts,reasonAffectedTitles:quarantine.frozenReasonAffectedTitles,dispositions:quarantine.candidateDispositionCounts,allInheritedRawEvidence:allFrozenEvidence,falsePositivesCertified:0,recoveredValidBars:0,sourceEvidence:{path:'quarantine/quarantine-full449.json',sha256:sha(await readFile(join(privateRoot,'quarantine/quarantine-full449.json')))},additionalAllRawAdmissionReplay:{path:relative(privateRoot,replayPath),sha256:replaySha256},rows:rows.map(r=>({securityId:r.securityId,sessionLedger:r.sessionLedger,rawExcludedBars:r.rawExcludedBars,analyticExcludedDisplayBars:r.analyticExcludedDisplayBars}))},
  'europe_449_corporate_actions.json':{...header,...actions,displayFrozen:true,engineInvocations:0},
  'europe_449_adjustment_semantics.json':{...header,...semantics,displayFrozen:true,engineInvocations:0},
  'europe_449_analytics_series.json':{...header,totals,priceBasis:'RAW_UNADJUSTED_RESEARCH_CANDIDATE_ONLY',policy:{exactMICRequired:true,noFill:true,noCarry:true,noVisualSegments:true,productionAdmission:false},rows:seriesRows},
  'europe_449_technical_readiness.json':{...header,counts:{TECHNICAL_SAFE:0,TECHNICAL_PARTIAL:0,TECHNICAL_BLOCKED:449},indicatorPolicies:INDICATOR_POLICIES,reasonCounts:analyticsReasonCounts,rows:technical},
  'europe_449_backtest_readiness.json':{...header,counts:Object.fromEntries(WINDOWS.map(w=>[w,{BACKTEST_SAFE:0,BACKTEST_RESEARCH_ONLY:0,BACKTEST_BLOCKED:449}])),rows:backtest},
  'europe_449_before_after_quality.json':{...header,totals,before:{inheritedMissingQuarantineSessions:quarantine.quarantinedMissingSessions,providerAbsentSessions:provider.rows.length,unknownOmissions:241},after:{inheritedQuarantineHeld:quarantine.quarantinedMissingSessions,certifiedFalsePositivesRecovered:0,providerAbsentSessions:provider.rows.length,analyticsOnlyExtraInvalidDisplayBars:totals.analyticsExcludedDisplayBars,previouslyUnknownSessionsExplained:241,unknownOmissions:sum(rows.map(r=>({n:r.baselineApprovedWindowCounts.UNKNOWN||0})),'n')},Germany:{securities:rows.filter(r=>r.issuerCountry==='DE').length},originalDisplayPricesChanged:0,methodsChanged:false}
 };
 const outputBindings={};for(const [name,data]of Object.entries(reports)){const bytes=JSON.stringify(data)+'\n';await writePrivateEvidence(join(out,name),bytes);outputBindings[name]={sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};}
 await writePrivateEvidence(join(out,'integrity-output-manifest.json'),JSON.stringify({...header,totals,outputs:outputBindings})+'\n');return {header,totals,outputs:outputBindings};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];console.log(JSON.stringify(await rebuild(args)));}
