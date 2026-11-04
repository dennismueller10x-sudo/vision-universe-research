/** Controlled, append-only Close refresh of the published Europe Discover projection.
 *
 * Baseline: the producer-owned, hash-bound artifacts in discover/data/europe.
 * Every published file is verified against the manifest before use.
 * New data: one bounded Marketstack /eod request per primary listing, from the
 * last published session to the run date. Provider RAW stays in a private
 * directory outside the repository; only hashes reach the public provenance.
 * Rules: existing prices, quarantines, identity and exclusion proofs are never
 * changed; a new observation must pass the unchanged Close evaluator
 * (europe-discover-chart-quality.mjs) and match the published overlap close.
 * Any conflict holds that security at its previous data (it then turns
 * stale through the unchanged freshness gate); nothing is interpolated.
 * Publication: per-stock isolation (core/europe-publication-isolation.js).
 * The 449-security universe stays published; each security is admitted only
 * if it passes the unchanged admission gate on its own, otherwise it is listed
 * as BLOCKED with a reason (no chart, no price). More than 22 blocked (5 %)
 * abort the whole publication.
 * Calendar: rule-based exact-MIC sessions (core/europe-exchange-calendar.js)
 * over a window derived from the data dates and the run date; the producer
 * refuses to run unless that calendar reproduces every published 1Y display
 * window of the baseline bit for bit. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {evaluateCloseChart} from './europe-discover-chart-quality.mjs';
import {assessContinuity,safeDisplayWindow,safeSegments,POLICY as CONTINUITY} from '../discover/europe-chart-continuity.mjs';
import {createEuropeBudget,estimateEuropeBatch} from './europe-credits.mjs';
import {privateRoot} from './europe-ingestion.mjs';
const require=createRequire(import.meta.url);
const Calendar=require('../../core/europe-exchange-calendar.js'),Sessions=require('../../core/europe-session-proof.js'),Admission=require('../../core/europe-discover-eligibility.js'),Home=require('../../core/discover-universe.js'),Isolation=require('../../core/europe-publication-isolation.js');
const {createAuditAdapter}=require('../../providers/marketstack/audit-adapter.js');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=v=>sha(JSON.stringify(v));
const DAY=86400000,shift=(d,n)=>new Date(Date.parse(d)+n*DAY).toISOString().slice(0,10);
// Conservative reservation: one credit per listing request; 449 listings plus
// at most one extra page each still stays below the hard cap.
export const REFRESH_LIMITS=Object.freeze({defaultMaxCredits:600,hardCap:1000,maxPagesPerListing:2,retryPasses:1});
// Monthly quota protection across all runs and all Marketstack consumers:
// a run never starts (from the last observed remainder of the same month) and
// never continues (from the live x-quota-remaining header) when its remaining
// requests would push the account below this reserve. No extra request is
// made to read the quota: the first billed /eod response carries it.
export const QUOTA_POLICY=Object.freeze({minRemaining:5000});
export const CALENDAR_SOURCE_SHA256=hash({version:Calendar.VERSION,rules:Calendar.RULES,window:Calendar.WINDOW});
const visualStatus=q=>q.breaks.some(b=>['UNKNOWN_BREAK','UNSAFE_BREAK'].includes(b.classification))?'CHART_BLOCKED':q.largeGapCount===0&&q.breaks.length===0&&q.missingRatio<=CONTINUITY.readyMissingRatio?'CHART_READY':'CHART_LIMITED';
const yearBefore=d=>(+d.slice(0,4)-1)+d.slice(4);

async function readBound(root,binding){const bytes=await readFile(join(root,binding.url.slice(1)));if(sha(bytes)!==binding.sha256||bytes.length!==binding.bytes)throw Error('PUBLISHED_ARTIFACT_HASH_MISMATCH:'+binding.url);return JSON.parse(bytes);}

/** Verifies the complete published hash chain and returns the baseline. */
export async function loadBaseline(root,dir=join(root,'discover/data/europe')){
 const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')),registry=await readFile(join(root,'core/rights/marketstack-display.json')),rights=JSON.parse(registry);
 if(manifest.publicationAllowed!==true||manifest.securityCount!==449||sha(registry)!==manifest.rightsEvidence?.sha256||rights.status!=='CONFIRMED_BY_OWNER'||rights.rawRedistribution!==false||!rights.display||!rights.commercial||rights.evidenceRef!==manifest.rights?.evidenceRef)throw Error('OWNER_DISPLAY_EVIDENCE_REQUIRED');
 const fileRoot=dir.endsWith('discover/data/europe')?resolve(dir,'../../..'):root;
 const catalog=await readBound(fileRoot,manifest.catalog),calendar=await readBound(fileRoot,manifest.calendar);
 if(catalog.securities?.length!==449||Object.keys(manifest.series).length!==449)throw Error('REVIEWED_449_SET_REQUIRED');
 // The full universe stays published; the blocked list must match the catalog flags.
 Isolation.verify(manifest,catalog,sha);
 const series=new Map(),long=new Map();
 for(const s of catalog.securities){const l=s.listings[0],p=l.discoverChart,one=await readBound(fileRoot,manifest.series[s.securityId]),h=manifest.history?.[s.securityId]?.MAX;
  if(hash(one.points)!==p.pointsSha256||hash(one.segments)!==p.segmentsSha256||!h)throw Error('PUBLISHED_SERIES_PROOF_MISMATCH:'+s.securityId);
  const max=await readBound(fileRoot,h);if(hash(max.points)!==p.ranges.MAX.pointsSha256||hash(max.segments)!==p.ranges.MAX.segmentsSha256)throw Error('PUBLISHED_HISTORY_PROOF_MISMATCH:'+s.securityId);
  series.set(s.securityId,one);long.set(s.securityId,max);}
 return {manifest,catalog,calendar,series,long,rights};
}

export function planRefresh(catalog,now){
 const today=new Date(now).toISOString().slice(0,10);
 const operations=catalog.securities.map(s=>{const l=s.listings[0];return {securityId:s.securityId,listing:{securityId:s.securityId,listingId:l.listingId,providerTicker:l.providerSymbol,mic:l.mic,currency:l.currency,isin:s.isin??null},from:l.discoverChart.lastDate,to:today};});
 if(operations.some(o=>o.from>o.to))throw Error('FUTURE_PUBLISHED_SESSION');
 const estimate=estimateEuropeBatch(operations.map(o=>({endpoint:'/eod',params:{symbols:o.listing.providerTicker},pages:1,attempts:1})));
 const worstCase=estimateEuropeBatch(operations.map(o=>({endpoint:'/eod',params:{symbols:o.listing.providerTicker},pages:REFRESH_LIMITS.maxPagesPerListing,attempts:1})));
 return {operations,today,estimate:{requests:estimate.requests,credits:estimate.credits,worstCaseRequests:worstCase.requests,worstCaseCredits:worstCase.credits,semantics:estimate.semantics}};
}

/** Billing as reported by the provider per response (header names observed in
 * diagnostics run 41661792038): x-increment-usage = credits charged,
 * x-quota-limit / x-quota-remaining = monthly plan and remainder. */
export function usageLedger(){
 const u={responses:0,responsesWithUsage:0,billedCredits:0,quotaLimit:null,quotaRemaining:null,observedAt:null};
 const num=v=>v===undefined||v===null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
 return {
  record(headers={},at=null){u.responses++;const inc=num(headers['x-increment-usage']),lim=num(headers['x-quota-limit']),rem=num(headers['x-quota-remaining']);
   if(inc!==null){u.responsesWithUsage++;u.billedCredits+=inc;}
   if(lim!==null)u.quotaLimit=lim;
   if(rem!==null&&(u.quotaRemaining===null||rem<u.quotaRemaining)){u.quotaRemaining=rem;u.observedAt=at;}},
  get quotaRemaining(){return u.quotaRemaining;},
  summary(){return {actualBilledCredits:u.responses>0&&u.responsesWithUsage===u.responses?u.billedCredits:'UNKNOWN',quota:{limit:u.quotaLimit,remaining:u.quotaRemaining,observedAt:u.observedAt,responses:u.responses,responsesWithUsageHeader:u.responsesWithUsage,source:'MARKETSTACK_RESPONSE_HEADERS'}};}
 };
}

/** Decision for a scheduled run, made from committed data and the rule
 * calendar only (no provider request). Skips non-session days, runs before
 * the close, a second run after an already completed refresh of the day, and
 * runs the last observed quota of the same month cannot afford. */
export function scheduleDecision({manifest,catalog,now,plannedCredits,minRemaining=QUOTA_POLICY.minRemaining}){
 const at=new Date(now).toISOString(),today=at.slice(0,10),mics=[...new Set(catalog.securities.map(s=>s.listings[0].mic))].sort();
 const sessions=mics.map(mic=>[mic,Calendar.sessions(mic,today,today)[0]||null]).filter(([,x])=>x);
 const base={today,now:at,sessionMics:sessions.map(([m])=>m),closedMics:mics.filter(m=>!sessions.some(([x])=>x===m)),plannedCredits,minRemaining};
 if(!sessions.length)return {...base,run:false,reason:'NO_EUROPE_SESSION_TODAY'};
 const lastClose=sessions.map(([,x])=>x.close).sort().at(-1);
 if(Date.parse(at)<Date.parse(lastClose))return {...base,run:false,reason:'BEFORE_LAST_EUROPE_CLOSE',lastClose};
 const prev=manifest.refresh;
 if(prev?.evaluatedAt&&Date.parse(prev.evaluatedAt)>=Date.parse(lastClose))return {...base,run:false,reason:'ALREADY_REFRESHED_AFTER_TODAYS_CLOSE',lastClose,previousRefresh:prev.evaluatedAt};
 const q=prev?.quota;
 if(q&&Number.isFinite(q.remaining)&&typeof q.observedAt==='string'&&q.observedAt.slice(0,7)===today.slice(0,7)&&q.remaining-plannedCredits<minRemaining)return {...base,run:false,reason:'QUOTA_RESERVE_FROM_LAST_RUN',lastClose,lastObservedQuota:q};
 return {...base,run:true,reason:'EUROPE_SESSION_CLOSED',lastClose,lastObservedQuota:q??null};
}

/** Authenticated collection; RAW bytes and the credit ledger stay private. */
export async function collect({operations,apiKey,fetchImpl,privateDir,maxCredits,sleep,minRemaining=QUOTA_POLICY.minRemaining}){
 if(!apiKey||typeof apiKey!=='string')throw Error('MARKETSTACK_API_KEY_NOT_CONFIGURED');
 const out=privateRoot(privateDir);if(existsSync(join(out,'credits.json')))throw Error('REFRESH_RUN_REENTRY_REFUSED');
 mkdirSync(join(out,'raw'),{recursive:true,mode:0o700});
 const budget=createEuropeBudget(join(out,'credits.json'),{maxCredits,targetCredits:maxCredits,hardCap:REFRESH_LIMITS.hardCap,runId:'europe-discover-refresh'});
 let sequence=0,current=[];const usage=usageLedger();
 const api=createAuditAdapter({apiKey,fetchImpl,sleep,sharedBudget:budget,maxCredits,maxRequests:REFRESH_LIMITS.hardCap,maxRetries:0,timeoutMs:90000,cacheTtlMs:0,minIntervalMs:fetchImpl?0:250,onResponse:async response=>{
  usage.record(response.usageHeaders,response.retrievedAt);
  const id='r'+String(++sequence).padStart(5,'0'),bytes=Buffer.from(response.rawText);
  writeFileSync(join(out,'raw',id+'.json.gz'),gzipSync(bytes),{flag:'wx',mode:0o600});
  const meta={id,sha256:sha(bytes),status:response.status,endpoint:response.endpoint,params:response.params,host:response.host,apiVersion:response.apiVersion,retrievedAt:response.retrievedAt};
  writeFileSync(join(out,'raw',id+'.meta.json'),JSON.stringify(meta)+'\n',{flag:'wx',mode:0o600});current.push({meta,body:response.body});}});
 const results=new Map();let terminal=null,remainingOps=operations.length;const FATAL=['authError','quotaExceeded','budgetExceeded','EUROPE_RUN_BUDGET_EXCEEDED','budgetReservationFailed','accountingPersistenceFailed','responsePersistenceFailed','notConfigured','entitlementRestricted'];
 // One bounded retry pass for transient provider failures (each retry is
 // reserved against the same credit cap; fatal account errors stop the run).
 let pending=operations;
 for(let pass=0;pass<=REFRESH_LIMITS.retryPasses&&pending.length&&!terminal;pass++){
 if(pass&&sleep)await sleep(5000);else if(pass)await new Promise(r=>setTimeout(r,5000));
 const failed=[];
 for(const op of pending){
  current=[];
  // Live reserve: the remainder reported by the last billed response must
  // cover every request still planned (one credit each) plus the reserve.
  if(!terminal&&usage.quotaRemaining!==null&&usage.quotaRemaining-remainingOps<minRemaining)terminal='QUOTA_RESERVE_REACHED';
  remainingOps--;
  if(terminal){results.set(op.securityId,{ok:false,reason:terminal});continue;}
  const res=await api.getHistoricalEOD(op.listing,{from:op.from,to:op.to,limit:1000,maxPages:REFRESH_LIMITS.maxPagesPerListing});
  if(!res.ok){const reason=(res.reason||'REQUEST_FAILED')+(res.providerErrorType?':'+res.providerErrorType:'')+(res.status?':HTTP'+res.status:'');if(FATAL.includes(res.reason))terminal=res.reason;else failed.push(op);results.set(op.securityId,{ok:false,reason,attempts:pass+1});continue;}
  const responses=current.map(c=>c.meta),observations=res.data.map(o=>{const page=current.find(c=>Array.isArray(c.body?.data)&&c.body.data.some(r=>hash(r)===hash(o.raw)));if(!page)throw Error('RAW_NORMALIZED_OBSERVATION_BINDING');return {...o,provenance:{rawResponseId:page.meta.id,rawSha256:page.meta.sha256,normalizedSha256:hash(res.data),responses}};});
  results.set(op.securityId,{ok:true,complete:res.complete===true,observations,responses,attempts:pass+1});
 }
 pending=failed;remainingOps=failed.length;
 }
 const status=budget.status();budget.close();
 const summary={requests:status.requests,reservedCredits:status.estimatedCredits,...usage.summary(),minQuotaRemaining:minRemaining,terminalReason:terminal,responses:sequence};
 writeFileSync(join(out,'summary.json'),JSON.stringify(summary)+'\n',{mode:0o600});
 return {results,summary};
}

function micCalendar(mic,from,to){return {verified:true,mic,source:Calendar.VERSION+' '+mic,sourceSha256:CALENDAR_SOURCE_SHA256,sessions:Calendar.sessions(mic,from,to)};}

/** Display window exactly as scripts/discover/rematerialize-europe-continuity.mjs builds it. */
function displayWindow(points,segments,calendar,mic,proof,identitySha){
 const original=assessContinuity({points,segments,calendar,mic}),window=safeDisplayWindow(points,original),segs=safeSegments(window.points,original),q=assessContinuity({points:window.points,segments:segs,calendar,mic});
 return {version:'vu-discover-display-window-2',sourcePointsSha256:proof.pointsSha256,sourceSegmentsSha256:proof.segmentsSha256,calendarSha256:calendar.sourceSha256,identityQuarantineDatesSha256:identitySha,safeHistoryStart:window.safeHistoryStart,truncated:window.truncated,reasonCodes:window.reasons,visualQualityStatus:q.visualQualityStatus,originalVisualQualityStatus:original.visualQualityStatus,longestMissingGapSessions:q.longestMissingGapSessions,missingRatio:q.missingRatio,segmentStartDates:segs.map(g=>g[0][0]),displaySegmentsSha256:hash(segs),chartStatus:visualStatus(q),_window:window,_segments:segs,_q:q};
}
const publicWindow=w=>Object.fromEntries(Object.entries(w).filter(([k])=>!k.startsWith('_')));
const comparable=w=>{const {calendarSha256,...rest}=publicWindow(w);return JSON.stringify(Object.keys(rest).sort().map(k=>[k,rest[k]]));};

/** Long-history windows cannot be recomputed without the private historical
 * calendar, so the previous assessment is extended by the appended tail only.
 * A previously limited or blocked status never improves by extension. */
function extendWindow(old,points,tail,calendar,proof,identitySha){
 const visible=points.filter(p=>p[0]>=old.safeHistoryStart),oldVisible=visible.filter(p=>p[0]<=tail.previousLast),obs=oldVisible.length;
 const oldMissing=Math.round(old.missingRatio*obs/(1-old.missingRatio));
 if(oldMissing/(obs+oldMissing)!==old.missingRatio)throw Error('PREVIOUS_WINDOW_NOT_DECOMPOSABLE');
 const missing=oldMissing+tail.missingSessions,ratio=missing/(visible.length+missing),starts=[...old.segmentStartDates,...tail.majorGapStarts];
 const segs=[];for(const p of visible){if(!segs.length||starts.includes(p[0])&&p[0]!==visible[0][0])segs.push([]);segs.at(-1).push(p);}
 if(segs[0][0][0]!==starts[0])throw Error('DISPLAY_SEGMENT_START_MISMATCH');
 const degrade=s=>s==='BROKEN'?'BROKEN':s==='MAJOR_GAPS'||tail.majorGapStarts.length||ratio>CONTINUITY.maximumMinorMissingRatio?'MAJOR_GAPS':s==='MINOR_GAPS'||missing?'MINOR_GAPS':'CLEAN';
 const chartStatus=old.chartStatus==='CHART_READY'&&!tail.majorGapStarts.length&&ratio<=CONTINUITY.readyMissingRatio?'CHART_READY':old.chartStatus==='CHART_BLOCKED'?'CHART_BLOCKED':'CHART_LIMITED';
 return {...old,sourcePointsSha256:proof.pointsSha256,sourceSegmentsSha256:proof.segmentsSha256,calendarSha256:calendar.sourceSha256,identityQuarantineDatesSha256:identitySha,visualQualityStatus:degrade(old.visualQualityStatus),originalVisualQualityStatus:degrade(old.originalVisualQualityStatus),longestMissingGapSessions:Math.max(old.longestMissingGapSessions,tail.longestGap),missingRatio:ratio,segmentStartDates:segs.map(g=>g[0][0]),displaySegmentsSha256:hash(segs),chartStatus};
}

/** Pure merge step: baseline + authenticated tail -> next projection (no I/O). */
export function mergeRefresh({baseline,results,now,runSummary}){
 const today=new Date(now).toISOString().slice(0,10),catalog=structuredClone(baseline.catalog);
 // Every run re-evaluates every security from scratch: a previous block is
 // neither inherited nor lifted without passing the unchanged gates again.
 for(const s of catalog.securities)for(const l of s.listings)delete l.discoverPublication;
 const window=Calendar.publicationWindow(catalog.securities.map(s=>s.listings[0].discoverChart.lastDate),today);
 const historyFrom=shift(yearBefore(catalog.securities.map(s=>s.listings[0].discoverChart.lastDate).sort()[0]),-10);
 const calendars={},full={};
 for(const s of catalog.securities){const mic=s.listings[0].mic;if(!calendars[mic]){calendars[mic]=micCalendar(mic,window.coverageFrom,window.coverageTo);full[mic]=micCalendar(mic,historyFrom,window.coverageTo);}}
 // Gate: the rule calendar must reproduce every published 1Y display window.
 for(const s of catalog.securities){const l=s.listings[0],old=l.discoverDisplay.ranges['1Y'],se=baseline.series.get(s.securityId);
  const again=displayWindow(se.points,se.segments,full[l.mic],l.mic,l.discoverChart,old.identityQuarantineDatesSha256);
  if(old.identityQuarantineDatesSha256!==hash([])&&again.chartStatus==='CHART_READY'&&old.chartStatus!=='CHART_READY')again.chartStatus='CHART_LIMITED';
  if(comparable(again)!==comparable(old))throw Error('RULE_CALENDAR_DOES_NOT_REPRODUCE_BASELINE:'+s.securityId);
  // Gate: the long window must be decomposable into observations and sessions.
  const max=l.discoverDisplay.ranges.MAX,lp=baseline.long.get(s.securityId).points.filter(p=>p[0]>=max.safeHistoryStart),segs=[];
  for(const p of lp){if(!segs.length||max.segmentStartDates.includes(p[0])&&p[0]!==lp[0][0])segs.push([]);segs.at(-1).push(p);}
  if(hash(segs)!==max.displaySegmentsSha256)throw Error('LONG_DISPLAY_WINDOW_NOT_REPRODUCIBLE:'+s.securityId);}
 const files={series:new Map(),long:new Map()},rows=[];
 for(const s of catalog.securities){
  const l=s.listings[0],base=l.discoverChart,maxOld=base.ranges.MAX,long=baseline.long.get(s.securityId),one=baseline.series.get(s.securityId),r=results.get(s.securityId),cal=full[l.mic];
  const before={securityId:s.securityId,name:s.name,ticker:l.ticker,mic:l.mic,currency:l.currency,lastDate:base.lastDate,lastClose:one.points.at(-1)[1],observations1Y:one.points.length};
  let hold=null,tail=[],evaluated=null,criticalIssues=[],truncatedBefore=null;
  if(!r?.ok)hold='PROVIDER_REQUEST_FAILED:'+(r?.reason||'MISSING');
  else if(!r.complete)hold='PROVIDER_PAGINATION_INCOMPLETE';
  if(!hold){
   const listing={...l,listingKey:l.listingId,securityId:s.securityId,companyId:s.companyId,isin:s.isin,quoteUnit:base.quoteUnit,quoteBasis:base.quoteBasis};
   const overlap=r.observations.filter(o=>o.normalized.tradingDate===base.lastDate);
   if(overlap.some(o=>Number(o.raw.close)!==one.points.at(-1)[1]))hold='OVERLAP_CLOSE_CONFLICT';
   else{
    const newer=r.observations.filter(o=>o.normalized.tradingDate>base.lastDate);
    evaluated=evaluateCloseChart({listing,observations:newer,calendar:cal,now,excludedQuarantineDates:[]});
    if(evaluated.criticalIssues.length){
     // An unexplained break is never repaired or joined: only the verified
     // observations before the first critical date may be appended; the
     // break and everything after it stay unpublished.
     criticalIssues=evaluated.criticalIssues.map(i=>({code:i.code,date:i.date,previousDate:i.previousDate,ratio:i.ratio}));
     const cut=criticalIssues.map(i=>i.date).filter(Boolean).sort()[0];
     const before=cut?newer.filter(o=>o.normalized.tradingDate<cut):[];
     evaluated=before.length?evaluateCloseChart({listing,observations:before,calendar:cal,now,excludedQuarantineDates:[]}):null;
     if(!evaluated||evaluated.criticalIssues.length||!evaluated.points.length)hold='TAIL_CRITICAL_CLOSE_ISSUE';
     else{tail=evaluated.points;truncatedBefore=cut;}
    }
    else tail=evaluated.points;
    const first=tail[0];if(!hold&&first){const ratio=first[1]/long.points.at(-1)[1];if(ratio>=2||ratio<=0.5)hold='UNEXPLAINED_CLOSE_DISCONTINUITY_AT_JOIN';}
   }
  }
  if(!hold&&!tail.length)hold='NO_NEW_COMPLETED_SESSION';
  // Session continuity of the appended tail on the exact-MIC schedule.
  let tailInfo=null;
  if(!hold){
   const idx=new Map(cal.sessions.map((x,i)=>[x.date,i])),seq=[long.points.at(-1),...tail];let missingSessions=0,longestGap=0,majorGapStarts=[],breakBefore=[];
   if(!idx.has(long.points.at(-1)[0]))hold='PREVIOUS_LAST_SESSION_NOT_IN_CALENDAR';
   else for(let i=1;i<seq.length;i++){const g=idx.get(seq[i][0])-idx.get(seq[i-1][0])-1;if(g>0){missingSessions+=g;longestGap=Math.max(longestGap,g);breakBefore.push(seq[i][0]);if(g>CONTINUITY.maximumSmallGapSessions)majorGapStarts.push(seq[i][0]);}}
   tailInfo={previousLast:long.points.at(-1)[0],missingSessions,longestGap,majorGapStarts,breakBefore};
  }
  if(hold){
   // Unchanged prices; only the schedule binding moves to the rule calendar so
   // the unchanged freshness gate can evaluate (and block) the stale listing.
   const bind=p=>{p.calendarMigration={previousSha256:p.calendarSourceSha256,sourceSha256:CALENDAR_SOURCE_SHA256,kind:'RULE_CALENDAR_REPRODUCES_PREVIOUS_SCHEDULE'};p.calendarSource=cal.source;p.calendarSourceSha256=CALENDAR_SOURCE_SHA256;};
   bind(base);Object.values(base.ranges).forEach(bind);Object.values(l.discoverDisplay.ranges).forEach(w=>{w.calendarSha256=CALENDAR_SOURCE_SHA256;});
   rows.push({before,after:{...before,status:'HELD',reason:hold,providerAttempts:r?.attempts??0,criticalIssues}});continue;
  }
  // MAX: append real observations; a missing session starts a new segment
  // exactly as the Close evaluator does.
  const points=[...long.points,...tail],segments=structuredClone(long.segments);
  for(const p of tail){if(tailInfo.breakBefore.includes(p[0]))segments.push([]);segments.at(-1).push(p);}
  const rawHashes=[...new Set(r.responses.map(x=>x.sha256))].sort(),rejected=evaluated.rejectedObservations.filter(x=>!(x.date===today&&x.reasonCodes.every(c=>c==='NON_SESSION_OR_UNCOMPLETED_DATE'))),limited=tailInfo.missingSessions>0||rejected.length>0;
  const maxProof={...maxOld,pointsSha256:hash(points),segmentsSha256:hash(segments),lastDate:points.at(-1)[0],observationCount:points.length,spanDays:(Date.parse(points.at(-1)[0])-Date.parse(points[0][0]))/DAY,chartStatus:limited&&maxOld.chartStatus==='CHART_READY'?'CHART_LIMITED':maxOld.chartStatus,
   calendarSource:cal.source,calendarSourceSha256:CALENDAR_SOURCE_SHA256,evaluatedAt:now,sourceEvaluatedAt:now,sourceInputSha256:hash({previous:maxOld.sourceInputSha256,refresh:evaluated.sourceInputSha256}),
   calendarMigration:{previousSha256:maxOld.calendarSourceSha256,sourceSha256:CALENDAR_SOURCE_SHA256,kind:'RULE_CALENDAR_REPRODUCES_PREVIOUS_SCHEDULE'},
   refresh:{kind:'APPEND_ONLY_AUTHENTICATED_CLOSE',previousLastDate:tailInfo.previousLast,appended:tail.length,missingSessions:tailInfo.missingSessions,rejected:rejected.length,...(truncatedBefore?{unpublishedFrom:truncatedBefore,reason:'UNEXPLAINED_CLOSE_DISCONTINUITY'}:{})}};
  maxProof.status=maxProof.chartStatus;
  maxProof.evidenceRef={verified:true,sha256:hash({previous:maxOld.evidenceRef.sha256,rawResponseSha256:rawHashes,sourceInputSha256:maxProof.sourceInputSha256,pointsSha256:maxProof.pointsSha256,segmentsSha256:maxProof.segmentsSha256,calendarSha256:CALENDAR_SOURCE_SHA256,immutableExclusionsSha256:maxProof.immutableExclusionsSha256})};
  delete maxProof.calendarProof;delete maxProof.sessionEvaluation;
  // 1Y: the trailing year of the same real observations.
  const cut=yearBefore(maxProof.lastDate),shortPoints=points.filter(p=>p[0]>cut),shortSegments=segments.map(g=>g.filter(p=>p[0]>cut)).filter(g=>g.length);
  const shortProof={...maxProof,firstDate:shortPoints[0][0],observationCount:shortPoints.length,spanDays:(Date.parse(maxProof.lastDate)-Date.parse(shortPoints[0][0]))/DAY,pointsSha256:hash(shortPoints),segmentsSha256:hash(shortSegments),chartStatus:base.chartStatus==='CHART_READY'&&!limited?'CHART_READY':'CHART_LIMITED',
   evidenceRef:{verified:true,sha256:hash({parent:maxProof.evidenceRef.sha256,pointsSha256:hash(shortPoints),segmentsSha256:hash(shortSegments)})}};
  shortProof.status=shortProof.chartStatus;
  const ranges={};for(const k of Object.keys(base.ranges)){const {refresh:_r,calendarMigration:_c,...copy}=maxProof;ranges[k]=k==='MAX'?{...maxProof}:copy;}
  Object.keys(base).forEach(k=>delete base[k]);Object.assign(base,shortProof,{ranges});
  l.latest={date:maxProof.lastDate,status:l.latest.status};l.history={...l.history,observations:shortPoints.length};
  // Display windows: 1Y recomputed on the reproduced rule calendar, long
  // windows extended by the tail only.
  const oldDisplay=l.discoverDisplay.ranges,identitySha=oldDisplay['1Y'].identityQuarantineDatesSha256,policies={};
  const w1=displayWindow(shortPoints,shortSegments,cal,l.mic,shortProof,identitySha);
  if(identitySha!==hash([])&&w1.chartStatus==='CHART_READY'&&oldDisplay['1Y'].chartStatus!=='CHART_READY')w1.chartStatus='CHART_LIMITED';
  policies['1Y']=publicWindow(w1);
  const wMax=extendWindow(oldDisplay.MAX,points,tailInfo,cal,maxProof,identitySha);
  for(const k of Object.keys(oldDisplay))if(k!=='1Y')policies[k]=wMax;
  l.discoverDisplay={...l.discoverDisplay,ranges:policies};
  const card={symbol:l.ticker,companyName:s.name,securityId:s.securityId,companyId:s.companyId,listingId:l.listingId,region:'EUROPE',currency:l.currency,asOf:l.latest.date,price:{value:w1._window.points.at(-1)[1]},priceSeries:{points:w1._window.points},visualQualityStatus:w1._q.visualQualityStatus,logoQuality:s.logo?.status==='LOGO_SUSPECT'?'LOGO_FALLBACK':s.logo?.status,performanceComparable:w1._segments.length===1,cardFundamentals:s.cardFundamentals};
  if(s.homeCardQuality)s.homeCardQuality=Home.homeCardQuality(card);
  files.series.set(s.securityId,{...one,points:shortPoints,segments:shortSegments,provenance:{...one.provenance,evidenceRef:shortProof.evidenceRef.sha256,sourceInputSha256:shortProof.sourceInputSha256}});
  files.long.set(s.securityId,{...long,points,segments,provenance:{...long.provenance,evidenceRef:maxProof.evidenceRef.sha256,sourceInputSha256:maxProof.sourceInputSha256}});
  rows.push({before,after:{securityId:s.securityId,lastDate:maxProof.lastDate,lastClose:points.at(-1)[1],observations1Y:shortPoints.length,appended:tail.length,missingSessions:tailInfo.missingSessions,rejected:rejected.length,rawResponseSha256:rawHashes,evidenceRef:maxProof.evidenceRef.sha256,unpublishedFrom:truncatedBefore,criticalIssues,providerAttempts:r.attempts,status:'REFRESHED'}});
 }
 const calendar={schema:'europe-exact-mic-display-calendar-1',generatedAt:now,sourceFileSha256:CALENDAR_SOURCE_SHA256,generator:{version:Calendar.VERSION,module:'/core/europe-exchange-calendar.js',window:'DERIVED_FROM_DATA_AND_RUN_DATE'},calendars:{}};
 for(const [mic,c]of Object.entries(calendars))calendar.calendars[mic]={mic,source:c.source,sourceSha256:CALENDAR_SOURCE_SHA256,coverageFrom:window.coverageFrom,coverageTo:window.coverageTo,sessions:c.sessions};
 const projected=Sessions.refreshCatalog(catalog,calendar,{now});
 const held=rows.filter(x=>x.after.status==='HELD'),byId=new Map(rows.map(x=>[x.before.securityId,x]));
 // Per-stock isolation (owner approval 2026-11-03): every security is judged
 // on its own by the unchanged admission gate. A failing security is published
 // as BLOCKED with its reason (identity kept, no chart, no price); every other
 // one must be admitted. More than POLICY.maxBlocked blocked securities abort.
 const blocked=[];
 for(const s of projected.securities){const l=s.listings[0],e=Admission.evaluate(s,l,now);if(e.DISCOVER_ELIGIBLE)continue;
  const row=byId.get(s.securityId),c=Isolation.classify(row?.after.status==='HELD'?row.after.reason:null,row?.after.criticalIssues,e.discoverReasonCodes);
  blocked.push({securityId:s.securityId,ticker:l.ticker,mic:l.mic,...c,admissionReasons:e.discoverReasonCodes});}
 const ineligible=blocked.map(b=>b.securityId);
 let failure=null,publication=null;
 if(blocked.length>Isolation.POLICY.maxBlocked)failure='BLOCKED_SHARE_LIMIT_EXCEEDED:'+blocked.length+'>'+Isolation.POLICY.maxBlocked+':'+ineligible.slice(0,5).join(',');
 else{
  publication=Isolation.build(blocked,now,sha);
  const flagged=new Map(publication.blocked.map(b=>[b.securityId,b]));
  for(const s of projected.securities){const b=flagged.get(s.securityId);s.listings[0].discoverPublication=b?{status:'BLOCKED',reasonClass:b.reasonClass,reasonCode:b.reasonCode}:{status:'ADMITTED'};}
  // Re-check with the flags: admitted ones still pass every gate, blocked ones
  // are refused by the gate itself (no chart, no price).
  const wrong=projected.securities.filter(s=>Admission.evaluate(s,s.listings[0],now).DISCOVER_ELIGIBLE===flagged.has(s.securityId)).map(s=>s.securityId);
  if(wrong.length)failure='PUBLICATION_ISOLATION_INCONSISTENT:'+wrong.slice(0,5).join(',');
 }
 return {catalog:projected,calendar,files,rows,held,ineligible,blocked,publication,failure,window,runSummary};
}

/** Emits the merged projection into the producer-owned directory. */
export async function writeRefresh({root,out,baseline,merged,now}){
 const output=resolve(out);if(output.startsWith(resolve(root)+'/')&&output!==resolve(root,'discover/data/europe'))throw Error('OWNED_OUTPUT_PATH_REQUIRED');
 const manifest=structuredClone(baseline.manifest);
 async function emit(name,data){const bytes=JSON.stringify(data)+'\n';if(bytes.includes('/workspace/')||bytes.includes('access_key')||bytes.includes('evidenceRoot')||bytes.includes('normalizedPath')||bytes.includes('rawResponseId'))throw Error('PRIVATE_EVIDENCE_DISCLOSURE');const path=join(output,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);return{url:'/discover/data/europe/'+name,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};}
 for(const [id,data]of merged.files.series)manifest.series[id]=await emit('series/'+id+'.json',data);
 for(const [id,data]of merged.files.long){const b=await emit('series-long/'+id+'.json',data);for(const k of Object.keys(manifest.history[id]))manifest.history[id][k]=b;}
 manifest.catalog=await emit('catalog.json',merged.catalog);manifest.calendar=await emit('calendar.json',merged.calendar);
 manifest.generatedAt=now;
 manifest.publication=merged.publication;
 manifest.refresh={kind:'APPEND_ONLY_AUTHENTICATED_CLOSE',evaluatedAt:now,provider:'MARKETSTACK',requests:merged.runSummary.requests,reservedCredits:merged.runSummary.reservedCredits,actualBilledCredits:merged.runSummary.actualBilledCredits??'UNKNOWN',quota:merged.runSummary.quota??null,refreshed:merged.rows.filter(r=>r.after.status==='REFRESHED').length,held:merged.held.map(h=>({securityId:h.before.securityId,reason:h.after.reason})),calendarSha256:CALENDAR_SOURCE_SHA256,calendarWindow:merged.window,schedule:merged.runSummary.scheduled===true};
 Isolation.verify(manifest,merged.catalog,sha);
 await emit('manifest.json',manifest);return manifest;
}

export async function refreshPublication({root=process.cwd(),out,privateDir,now=new Date().toISOString(),apiKey=process.env.MARKETSTACK_API_KEY,fetchImpl,maxCredits=REFRESH_LIMITS.defaultMaxCredits,dryRun=false,reportPath,sleep,scheduled=false,minQuotaRemaining=QUOTA_POLICY.minRemaining}={}){
 if(!out)throw Error('EXPLICIT_OUTPUT_REQUIRED');
 maxCredits=Number(maxCredits);if(!Number.isSafeInteger(maxCredits)||maxCredits<1||maxCredits>REFRESH_LIMITS.hardCap)throw Error('INVALID_CREDIT_CAP');
 const baseline=await loadBaseline(root),plan=planRefresh(baseline.catalog,now);
 if(plan.estimate.credits>maxCredits)throw Error('PLANNED_REQUESTS_EXCEED_CREDIT_CAP');
 minQuotaRemaining=Number(minQuotaRemaining);if(!Number.isSafeInteger(minQuotaRemaining)||minQuotaRemaining<0)throw Error('INVALID_QUOTA_RESERVE');
 // A scheduled run re-checks the schedule decision itself (defence in depth:
 // the workflow preflight is not the only guard against a request).
 const decision=scheduled?scheduleDecision({manifest:baseline.manifest,catalog:baseline.catalog,now,plannedCredits:plan.estimate.credits,minRemaining:minQuotaRemaining}):null;
 if(dryRun||decision&&!decision.run)return {dryRun:dryRun||undefined,skipped:decision&&!decision.run?true:undefined,decision:decision??undefined,plan:plan.estimate,listings:plan.operations.length,from:[...new Set(plan.operations.map(o=>o.from))],to:plan.today,requests:0};
 const {results,summary:collected}=await collect({operations:plan.operations,apiKey,fetchImpl,privateDir,maxCredits,sleep,minRemaining:minQuotaRemaining}),summary={...collected,scheduled:scheduled===true};
 if(summary.terminalReason){if(reportPath)await writeFile(reportPath,JSON.stringify({plan:plan.estimate,run:summary,failure:'PROVIDER_RUN_STOPPED:'+summary.terminalReason},null,1)+'\n');throw Error('PROVIDER_RUN_STOPPED:'+summary.terminalReason);}
 const merged=mergeRefresh({baseline,results,now,runSummary:summary});
 const report={plan:plan.estimate,run:summary,window:merged.window,refreshed:merged.rows.filter(r=>r.after.status==='REFRESHED').length,held:merged.held.map(h=>({securityId:h.before.securityId,reason:h.after.reason,criticalIssues:h.after.criticalIssues})),ineligible:merged.ineligible,admitted:449-merged.blocked.length,blocked:merged.blocked,maxBlocked:Isolation.POLICY.maxBlocked,failure:merged.failure,rows:merged.rows};
 if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,1)+'\n');
 if(merged.failure)throw Error(merged.failure);
 await writeRefresh({root,out,baseline,merged,now});
 return {...report,rows:undefined};
}
