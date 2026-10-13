/** Offline evidence replay only. The existing Close gate and safe-suffix policy
 * are reused verbatim; source files, prices, display and readiness are never written. */
import {readFileSync,writeFileSync,mkdirSync,realpathSync,existsSync,lstatSync,chmodSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,relative,dirname,basename,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluateCloseChart} from './europe-discover-chart-quality.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),digest=x=>hash(JSON.stringify(x)),read=p=>JSON.parse(readFileSync(p,'utf8'));
const SHA=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function checked(path,sha,code){if(!SHA(sha))throw Error(code);const bytes=readFileSync(path);if(hash(bytes)!==sha)throw Error(code);return bytes;}
function scopedPath(root,path){if(typeof path!=='string')throw Error('SCOPED_EVIDENCE_PATH_REQUIRED');const target=resolve(root,path),rel=relative(realpathSync(root),realpathSync(target));if(rel.startsWith('..')||isAbsolute(rel))throw Error('SCOPED_EVIDENCE_PATH_REQUIRED');return target;}
function canonical(path){const p=resolve(path);return existsSync(p)?realpathSync(p):join(canonical(dirname(p)),basename(p));}
function within(root,path){const rel=relative(root,path);return rel===''||!rel.startsWith('..')&&!isAbsolute(rel);}
export function verifyOfflineInputs({root,evidence,calendarPath,exclusionsPath,out,qualitySourcesPath}={}){
 if([root,evidence,calendarPath,exclusionsPath,out,qualitySourcesPath].some(x=>typeof x!=='string'||!x))throw Error('EXPLICIT_OFFLINE_INPUTS_REQUIRED');
 const sources=read(qualitySourcesPath).sources;if(!Array.isArray(sources)||sources.length!==2||new Set(sources.map(s=>s.sha256)).size!==2)throw Error('FROZEN_QUALITY_SOURCE_PINS_REQUIRED');
 for(const src of sources){if(typeof src.path!=='string'||typeof src.manifestPath!=='string')throw Error('FROZEN_QUALITY_SOURCE_PINS_REQUIRED');checked(src.path,src.sha256,'FROZEN_QUALITY_SOURCE_HASH');checked(src.manifestPath,src.manifestSha256,'FROZEN_QUALITY_MANIFEST_HASH');}
 const output=canonical(out),protectedPaths=[root,evidence,calendarPath,exclusionsPath,qualitySourcesPath,...sources.flatMap(s=>[s.path,s.manifestPath])].map(canonical);
 if(protectedPaths.some(p=>within(p,output)||within(output,p)))throw Error('PRIVATE_REPLAY_OUTPUT_MUST_NOT_OVERLAP_SOURCES');
 for(const name of ['raw-approval-replay.json','raw-approval-replay-summary.json']){const stat=lstatSync(join(output,name),{throwIfNoEntry:false});if(stat&&(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1))throw Error('PRIVATE_REPLAY_OUTPUT_MUST_NOT_LINK_TO_SOURCES');}
 return {out:output};
}
/** Small-scope reusable replay used by the full-universe runner and negative tests.
 * It returns private audit evidence, never an admission or publication result. */
export function replayListingSource({root,evidence,security:s,manifest,calendarBytes,exclusions,summary}){
 const sid=s.securityId,l=s.listings.find(l=>l.listingId===s.primaryListingId),base=l?.discoverChart,proof=base?.ranges?.MAX,meta=summary.results.find(r=>r.kind==='history'&&r.listing.securityId===sid);
 if(!l||!proof||!meta?.complete||meta.ok!==true)throw Error('COMPLETE_EXACT_LISTING_HISTORY_REQUIRED:'+sid);
 const bytes=checked(scopedPath(evidence,meta.resultPath),meta.normalizedSha256,'NORMALIZED_HISTORY_HASH:'+sid),entry=JSON.parse(bytes),responses=[],rawByKey=new Map(),cal=JSON.parse(calendarBytes),calSha=hash(calendarBytes);
 for(const id of entry.responseIds){if(!/^\d{6}$/.test(id))throw Error('RAW_RESPONSE_ID_REQUIRED');const rb=readFileSync(scopedPath(evidence,'raw/'+id+'.json')),r=read(scopedPath(evidence,'raw/'+id+'.meta.json'));if(r.id!==id||r.status!==200||r.endpoint!=='/eod'||r.host!=='api.marketstack.com'||r.apiVersion!=='v2'||r.sha256!==hash(rb)||r.params.exchange!==l.mic||r.params.symbols!==l.providerSymbol)throw Error('AUTHENTICATED_EXACT_LISTING_SCOPE:'+sid);responses.push(r);for(const raw of JSON.parse(rb).data||[]){const key=raw.date+'|'+raw.symbol;if(!rawByKey.has(key))rawByKey.set(key,[]);rawByKey.get(key).push({raw,r});}}
 const observations=entry.result.data.map(o=>{const matches=rawByKey.get(o.raw.date+'|'+o.raw.symbol)||[],bound=matches.find(b=>digest(b.raw)===digest(o.raw));if(!bound)throw Error('RAW_NORMALIZED_OBSERVATION_BINDING:'+sid);return {...o,provenance:{rawResponseId:bound.r.id,rawSha256:bound.r.sha256,normalizedSha256:meta.normalizedSha256,responses}};});
 if(digest(observations)!==proof.sourceInputSha256)throw Error('EXACT_ORIGINAL_SOURCE_INPUT_SHA:'+sid);if(digest(exclusions[sid])!==proof.immutableExclusionsSha256||calSha!==proof.calendarSourceSha256)throw Error('EXACT_ORIGINAL_SOURCE_POLICY_SHA:'+sid);
 const listing={...l,listingKey:l.listingId,securityId:sid,companyId:s.companyId,isin:s.isin,quoteUnit:base.quoteUnit,quoteBasis:base.quoteBasis},calendar={...cal.calendars[l.mic],sourceSha256:calSha},now=proof.evaluatedAt;
 const all=evaluateCloseChart({listing,observations,calendar,now,excludedQuarantineDates:exclusions[sid]});let evaluated=all,suffixFrom=null;
 if(all.criticalIssues.length){const last=all.criticalIssues.map(i=>i.date).filter(Boolean).sort().at(-1);if(last){suffixFrom=new Date(Date.parse(last)+86400000).toISOString().slice(0,10);evaluated=evaluateCloseChart({listing,observations,calendar,now,excludedQuarantineDates:exclusions[sid],displayRange:{from:suffixFrom}});}}
 const binding=manifest.history[sid].MAX;if(typeof binding.url!=='string'||!binding.url.startsWith('/discover/data/europe/'))throw Error('APPROVED_SERIES_SCOPE_REQUIRED');const seriesBytes=checked(scopedPath(root,binding.url.slice(1)),binding.sha256,'CURRENT_APPROVED_SOURCE_BYTES:'+sid),series=JSON.parse(seriesBytes);
 if(digest(evaluated.points)!==proof.pointsSha256||digest(evaluated.points)!==digest(series.points)||digest(evaluated.segments)!==proof.segmentsSha256||digest(evaluated.segments)!==digest(series.segments))throw Error('APPROVED_REPLAY_MISMATCH:'+sid);
 if(evaluated.chartStatus==='CHART_BLOCKED'||!series.points.length)throw Error('APPROVED_REPLAY_HAS_NO_SAFE_CHART:'+sid);
 const approved=new Map(series.points),excluded=new Set(exclusions[sid]),rejected=new Map(all.rejectedObservations.map(r=>[r.index,r])),sessionDates=new Set(calendar.sessions.map(r=>r.date)),first=series.points[0][0],last=series.points.at(-1)[0],rawExclusions=[];let immutableCount=0,additionalCount=0;
 const criticalAt=new Map(all.criticalIssues.map(i=>[i.date,i]));
 for(const [rawIndex,o]of observations.entries()){
  const date=o.normalized.tradingDate;if(approved.has(date)){if(approved.get(date)!==o.raw.close)throw Error('SOURCE_CLOSE_NOT_EXACT:'+sid+':'+date);continue;}
  const inherited=excluded.has(date),before=date<first,after=date>last,reasonCodes=rejected.get(rawIndex)?.reasonCodes||[],critical=criticalAt.get(date),rawRuleReasons=reasonCodes.filter(r=>r!=='IMMUTABLE_PRIOR_RAW_QUARANTINE');let primaryCause;
  if(inherited)primaryCause='IMMUTABLE_PRIOR_RAW_QUARANTINE';else if(suffixFrom&&date<suffixFrom)primaryCause='PRE_SAFE_SUFFIX_QUARANTINE';else if(rawRuleReasons.length)primaryCause=rawRuleReasons.includes('INVALID_CLOSE')?'INVALID_CLOSE':rawRuleReasons.includes('NON_SESSION_OR_UNCOMPLETED_DATE')?'NON_SESSION_OR_UNCOMPLETED_DATE':'CLOSE_SOURCE_SCOPE_REJECTION';else if(critical)primaryCause=critical.code;else throw Error('UNEXPLAINED_RAW_APPROVAL_EXCLUSION:'+sid+':'+date);
  if(inherited)immutableCount++;else additionalCount++;
  rawExclusions.push({date,rawIndex,close:o.raw.close,reasonCodes,primaryCause,inheritedImmutableExclusion:inherited,withinApprovedSpan:!before&&!after,expectedMicSession:sessionDates.has(date),suffixFrom:suffixFrom&&date<suffixFrom?suffixFrom:null,criticalIssue:critical||null,rawResponseId:o.provenance.rawResponseId,rawSha256:o.provenance.rawSha256,normalizedSha256:meta.normalizedSha256,rawBarSha256:digest(o.raw),quarantineReleased:false});
 }
 const counts={raw:observations.length,approved:series.points.length,excluded:rawExclusions.length,immutableExcludedRaw:immutableCount,additionalExcludedRaw:additionalCount};if(counts.raw-counts.approved!==counts.excluded)throw Error('LISTING_RAW_APPROVED_ACCOUNTING:'+sid);
 return {securityId:sid,listingId:l.listingId,mic:l.mic,currency:l.currency,providerSymbol:l.providerSymbol,normalizedPath:join(evidence,meta.resultPath),normalizedSha256:meta.normalizedSha256,rawResponseRefs:responses.map(r=>({id:r.id,sha256:r.sha256,params:r.params,status:r.status})),sourceInputSha256:proof.sourceInputSha256,approvedPointsSha256:proof.pointsSha256,approvedSegmentsSha256:proof.segmentsSha256,approvedFirstDate:first,approvedLastDate:last,originalEvaluationAt:now,originalChartStatus:evaluated.chartStatus,suffixFrom,preSuffixCriticalIssues:all.criticalIssues,approvedReplayExact:true,counts,rawExclusions};
}
/** Private evidence writer: output permissions do not depend on the caller's umask. */
export function writePrivateReplayArtifacts(options,result){
 const {out}=verifyOfflineInputs(options);mkdirSync(out,{recursive:true,mode:0o700});chmodSync(out,0o700);
 for(const [name,bytes]of [['raw-approval-replay.json',JSON.stringify(result)+'\n'],['raw-approval-replay-summary.json',JSON.stringify({...result,rows:undefined},null,2)+'\n']]){const path=join(out,name);writeFileSync(path,bytes,{mode:0o600});chmodSync(path,0o600);}
}
export function replayEuropeIntegritySource(options={}){
 const {root,evidence,calendarPath,exclusionsPath,onProgress=()=>{}}=options;verifyOfflineInputs(options);const catalogBytes=readFileSync(join(root,'discover/data/europe/catalog.json')),catalog=JSON.parse(catalogBytes),manifest=read(join(root,'discover/data/europe/manifest.json')),calendarBytes=readFileSync(calendarPath),exclusions=read(exclusionsPath),summary=read(join(evidence,'summary.json'));
 if(hash(catalogBytes)!==manifest.catalog.sha256||catalog.securities.length!==449||new Set(catalog.securities.map(s=>s.securityId)).size!==449)throw Error('EXACT449_CATALOG_REQUIRED');
 const totals={raw:0,approved:0,rawExcluded:0,immutableExcludedRaw:0,additionalExcludedRaw:0,additionalInSpan:0,additionalPrefix:0,additionalSuffix:0},reasons={},additionalReasons={},primaryCauses={},titles=new Map(),rows=[];
 const bump=(c,k,sid)=>{c[k]=(c[k]||0)+1;if(c===reasons){if(!titles.has(k))titles.set(k,new Set());titles.get(k).add(sid);}};
 for(const [index,s]of catalog.securities.entries()){
  const row=replayListingSource({root,evidence,security:s,manifest,calendarBytes,exclusions,summary});rows.push(row);totals.raw+=row.counts.raw;totals.approved+=row.counts.approved;
  for(const x of row.rawExclusions){totals.rawExcluded++;if(x.inheritedImmutableExclusion)totals.immutableExcludedRaw++;else{totals.additionalExcludedRaw++;if(x.date<row.approvedFirstDate)totals.additionalPrefix++;else if(x.date>row.approvedLastDate)totals.additionalSuffix++;else totals.additionalInSpan++;}bump(primaryCauses,x.primaryCause);for(const code of x.reasonCodes){bump(reasons,code,row.securityId);if(!x.inheritedImmutableExclusion)bump(additionalReasons,code);}}
  if(index%50===0)onProgress({processed:index+1,totals:{...totals}});
 }
 if(totals.raw-totals.approved!==totals.rawExcluded||totals.rawExcluded!==totals.immutableExcludedRaw+totals.additionalExcludedRaw)throw Error('RAW_APPROVED_ACCOUNTING');
 const result={schema:'vu-europe-449-raw-approval-replay-1',reviewer:'B_INDEPENDENT_QUARANTINE',all449ExactSourceInputAndPointsAndSegmentsVerified:true,sourceCalendarSha256:hash(calendarBytes),totals,allRawExclusionReasonCounts:reasons,additionalRawExclusionReasonCounts:additionalReasons,primaryCauseCounts:primaryCauses,reasonAffectedTitles:Object.fromEntries([...titles].map(([k,v])=>[k,v.size])),sourceScope:'ALL_RAW_BARS_WITH_NO_APPROVED_CLOSE;NOT_ONLY_IN_SPAN_MISSING_SESSIONS',noProviderCalls:true,quarantineReleased:0,productionWrites:0,rows};
 writePrivateReplayArtifacts(options,result);return {...result,rows:undefined};
}
export const replay449=replayEuropeIntegritySource;
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1])throw Error('EXPLICIT_CLI_FLAG_VALUE_REQUIRED');args[process.argv[i].slice(2)]=process.argv[i+1];}console.log(JSON.stringify(replayEuropeIntegritySource({...args,onProgress:p=>console.log(JSON.stringify(p))})));}
