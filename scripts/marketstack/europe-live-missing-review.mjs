/** Missing-session conclusions from hash-replayed live scopes, never from errors,
 * a second venue, display continuity, or guessed economic/listing history. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadLiveQuarantineProbe} from './europe-live-quarantine-review.mjs';
import {validIsin} from './europe-universe.mjs';
const require=createRequire(import.meta.url),{normalizeObservation}=require('../../providers/marketstack/audit-adapter.js');
export const REQUIRED_ABSENCE_VARIANTS=Object.freeze(['FILTERED_EXACT','BROADER_DATE','EXCHANGE_UNFILTERED']);
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=o=>sha(JSON.stringify(o));
const isSha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const check=(yes,code)=>{if(!yes)throw Error(code);};
const key=(id,window)=>id+'|'+window;
const bindingSame=(a,l)=>a?.securityId===l.securityId&&a?.listingId===l.listingId&&a?.mic===l.mic&&a?.currency===l.currency&&a?.isin===l.isin&&(a.providerTicker??a.providerSymbol)===l.symbol;
const proof=p=>p.absenceProven===true&&p.paginationVerified===true&&p.scopeVerified===true&&isSha(p.normalizedSha256)&&!(p.failures||[]).length;
const proofRef=p=>({variant:p.operation?.variant||null,windowId:p.operation?.windowId||null,normalizedSha256:p.normalizedSha256||null,paginationVerified:p.paginationVerified===true,scopeVerified:p.scopeVerified===true,complete:proof(p),failures:[...(p.failures||[])]});
function sourceRef(o,p){const s=o.sourceBindings||{},params={};for(const k of ['symbols','exchange','date_from','date_to','sort','limit','offset'])if(s.params?.[k]!==undefined)params[k]=s.params[k];return {id:s.id||s.rawResponseId||null,rawResponseId:s.rawResponseId||s.id||null,responseHash:s.responseHash||s.rawSha256||null,rawSha256:s.rawSha256||s.responseHash||null,rawIndexInPage:s.rawIndexInPage??s.rowIndex??null,rowIndex:s.rowIndex??s.rawIndexInPage??null,rawBarSha256:o.rawHash||s.rawBarSha256||null,normalizedSha256:p.normalizedSha256,endpoint:s.endpoint||null,host:s.host||null,apiVersion:s.apiVersion||null,status:s.status??null,retrievedAt:s.retrievedAt||null,params};}
function metadataReady(metadata,l,symbol,exactSecurity=false){
 return metadata.some(m=>m.evidenceVerified===true&&isSha(m.normalizedSha256)&&m.securityId===l.securityId&&m.listingId===l.listingId&&m.symbol===symbol&&m.mic===l.mic&&m.success===true&&m.venueVerified===true&&m.identityConflict!==true&&(!exactSecurity||m.exactSecurityVerified===true));
}
function observed(p,l,date,metadata){
 if(!proof(p))return [];
 const symbol=p.operation.querySymbol||l.symbol;
 if(symbol!==l.symbol&&!metadataReady(metadata,l,symbol,true))return [];
 return (p.observations||[]).filter(o=>{
  const n=o.normalized,r=o.raw;
  return n?.tradingDate===date&&n.providerTicker===symbol&&n.providerExchange===l.mic&&typeof r?.date==='string'&&r.date.slice(0,10)===date&&r.symbol===symbol&&r.exchange===l.mic&&
   (!n.isin||n.isin===l.isin)&&(!n.currency||n.currency===l.currency)&&(!r.price_currency||r.price_currency===l.currency)&&(!r.currency||r.currency===l.currency)&&
   isSha(o.rawHash||o.sourceBindings?.rawBarSha256)&&isSha(o.sourceBindings?.responseHash||o.sourceBindings?.rawSha256);
 });
}
function quality(o,l){const r=o.raw;return {closeValid:finite(r.close)&&r.close>0,ohlcValid:['open','high','low','close'].every(k=>finite(r[k])&&r[k]>0)&&r.high>=Math.max(r.open,r.close,r.low)&&r.low<=Math.min(r.open,r.close,r.high),volumeValid:finite(r.volume)&&r.volume>=0,currencyExplicit:r.price_currency===l.currency||r.currency===l.currency,pricesFabricated:false,analyticalAdmission:false};}
function historicalCause(evidence,l,date,verify){const types=new Set(['PRE_LISTING','POST_DELISTING','TRADING_SUSPENSION_SUPPORTED','LISTING_TRANSITION']);return evidence.find(e=>types.has(e.classification)&&e.securityId===l.securityId&&e.listingId===l.listingId&&e.mic===l.mic&&e.isin===l.isin&&e.currency===l.currency&&e.from<=date&&e.to>=date&&isSha(e.sourceSha256)&&['OFFICIAL_EXCHANGE','OFFICIAL_ISSUER','OFFICIAL_REGISTER'].includes(e.sourceType)&&verify(e)===true);}

/** Probes must come from an independent archive/pagination replay, e.g.
 * loadLiveQuarantineProbe. A normalized result's `complete` flag alone is insufficient. */
export function evaluateMissingSessions({plan,probes=[],metadata=[],historicalEvidence=[],verifyHistoricalEvidence=()=>false}){
 check(plan?.version===1&&Array.isArray(plan.listings)&&isSha(plan.sourceBindings?.catalogSha256),'SOURCE_BOUND_PLAN_REQUIRED');
 const byWindow=new Map();for(const p of probes){const op=p.operation||{},k=key(op.listing?.securityId,op.windowId);if(!byWindow.has(k))byWindow.set(k,[]);byWindow.get(k).push(p);}
 const rows=[],securities=[];const counts={},recoveryCounts={};
 for(const l of plan.listings){const sr={securityId:l.securityId,listingId:l.listingId,missingSessions:0,statusCounts:{},freshPrimaryMetadataVenueVerified:metadataReady(metadata,l,l.symbol),status:'NO_MISSING_TARGETS'};
  for(const w of l.windows||[])for(const t of w.targetDates||[]){if(t.kind!=='MISSING')continue;sr.missingSessions++;
   const all=byWindow.get(key(l.securityId,w.windowId))||[],scoped=all.filter(p=>bindingSame(p.operation?.listing,l)&&p.operation.from<=t.date&&p.operation.to>=t.date),ps=scoped.filter(p=>REQUIRED_ABSENCE_VARIANTS.includes(p.operation.variant)||p.operation.variant==='VERIFIED_ALIAS');
   const byVariant=new Map(REQUIRED_ABSENCE_VARIANTS.map(v=>[v,ps.filter(p=>p.operation.variant===v)]));
   const rawTargetPresent=ps.some(p=>proof(p)&&(p.observations||[]).some(o=>o.normalized?.tradingDate===t.date));
   const present=ps.flatMap(p=>observed(p,l,t.date,metadata).map(o=>({p,o,q:quality(o,l)}))),valid=present.filter(x=>x.q.closeValid),rawHashes=new Set(valid.map(x=>x.o.rawHash||x.o.sourceBindings.rawBarSha256));
   let classification='UNKNOWN',recoveryStatus='NOT_RECOVERED',reasonCodes=[],recovered=false,selected=null,history=null;
   if(rawHashes.size>1)reasonCodes.push('CONFLICTING_LIVE_VARIANT_BARS');
   else if(valid.length){selected=valid.find(x=>x.p.operation.variant==='FILTERED_EXACT')||valid[0];recovered=true;recoveryStatus=selected.p.operation.variant==='FILTERED_EXACT'?'RECOVERED_PRIMARY_QUERY':'RECOVERED_ALTERNATE_QUERY';
    const primaryAbsent=byVariant.get('FILTERED_EXACT').length>0&&byVariant.get('FILTERED_EXACT').every(p=>proof(p)&&observed(p,l,t.date,metadata).length===0);
    if(selected.p.operation.variant==='FILTERED_EXACT'){classification='RECOVERED_PRIMARY_QUERY';reasonCodes.push('PREVIOUSLY_ABSENT_ROW_NOW_RETURNED');}
    else if(selected.p.operation.variant==='BROADER_DATE'&&primaryAbsent){classification='QUERY_FILTER_BUG';reasonCodes.push('SAME_SYMBOL_MIC_BROADER_SCOPE_RETURNS_FILTERED_ABSENCE');}
    else if(selected.p.operation.variant==='VERIFIED_ALIAS'&&metadataReady(metadata,l,selected.p.operation.querySymbol,true)&&primaryAbsent){classification='SYMBOL_MAPPING_BUG';reasonCodes.push('FRESH_EXACT_ISIN_MIC_ALIAS_RETURNS_PRIMARY_SYMBOL_ABSENCE');}
    else if(selected.p.operation.variant==='EXCHANGE_UNFILTERED'&&primaryAbsent&&selected.p.operation.exchangeMappingVerified===true){classification='MIC_MAPPING_BUG';reasonCodes.push('CERTIFIED_EXCHANGE_MAPPING_FILTER_DIFFERENCE');}
    else reasonCodes.push(selected.p.operation.variant==='EXCHANGE_UNFILTERED'?'EXCHANGE_FILTER_DIFFERENCE_MAPPING_CAUSE_UNPROVEN':'ALTERNATE_ROW_PRESENT_PRIMARY_CAUSE_UNRESOLVED');
   }else if(present.length){reasonCodes.push('LIVE_ROW_PRESENT_BUT_CLOSE_INVALID');recoveryStatus='FOUND_INVALID_BAR';}
   else if(rawTargetPresent){reasonCodes.push('LIVE_TARGET_ROW_PRESENT_WITH_UNRESOLVED_IDENTITY_CURRENCY_OR_SOURCE_PROOF');recoveryStatus='FOUND_UNUSABLE_BAR';}
   else {history=historicalCause(historicalEvidence,l,t.date,verifyHistoricalEvidence);
    const allRequired=REQUIRED_ABSENCE_VARIANTS.every(v=>byVariant.get(v).length>0&&byVariant.get(v).every(proof));
    const aliasIncomplete=ps.some(p=>p.operation.variant==='VERIFIED_ALIAS'&&!proof(p));
    if(history){classification=history.classification;reasonCodes.push('OFFICIAL_HISTORICAL_INTERVAL_PROVEN');}
    else if(allRequired&&!aliasIncomplete&&metadataReady(metadata,l,l.symbol)){classification='PROVIDER_CONFIRMED_MISSING';reasonCodes.push('ALL_REQUIRED_LIVE_QUERY_SCOPES_COMPLETE_AND_ABSENT');}
    else{for(const v of REQUIRED_ABSENCE_VARIANTS){if(!byVariant.get(v).length)reasonCodes.push(v+'_NOT_PROBED');else if(!byVariant.get(v).every(proof))reasonCodes.push(v+'_ERROR_OR_INCOMPLETE');}if(aliasIncomplete)reasonCodes.push('VERIFIED_ALIAS_ERROR_OR_INCOMPLETE');if(!metadataReady(metadata,l,l.symbol))reasonCodes.push('CURRENT_PRIMARY_METADATA_VENUE_UNVERIFIED');if(all.length!==scoped.length)reasonCodes.push('WRONG_LISTING_MIC_OR_DATE_SCOPE_REJECTED');}
   }
   const row={securityId:l.securityId,listingId:l.listingId,symbol:l.symbol,mic:l.mic,currency:l.currency,date:t.date,windowId:w.windowId,oldReasonCode:t.reasonCode,oldEvidenceSha256:plan.sourceBindings.missingSha256||null,classification,recoveryStatus,recovered,reasonCodes,claimScope:'OBSERVED_LIVE_API_QUERY_BEHAVIOR_FOR_SOURCE_BOUND_LISTING',economicCause:history?.classification||'UNKNOWN',historicalCalendarCertification:'SEPARATE_CALENDAR_EVIDENCE_REQUIRED',productionReleased:false,syntheticBar:false,probes:ps.map(proofRef),newEvidence:selected?{rawBarSha256:selected.o.rawHash||selected.o.sourceBindings.rawBarSha256,rawResponseSha256:selected.o.sourceBindings.responseHash||selected.o.sourceBindings.rawSha256,normalizedSha256:selected.p.normalizedSha256,sourceBindings:sourceRef(selected.o,selected.p),variant:selected.p.operation.variant,quality:selected.q}:null,historicalEvidenceSha256:history?.sourceSha256||null};
   rows.push(row);counts[classification]=(counts[classification]||0)+1;recoveryCounts[recoveryStatus]=(recoveryCounts[recoveryStatus]||0)+1;sr.statusCounts[classification]=(sr.statusCounts[classification]||0)+1;
  }
  if(sr.missingSessions)sr.status=sr.statusCounts.UNKNOWN?'PARTIAL_ROOT_CAUSE':'CLASSIFIED';securities.push(sr);
 }
 check(new Set(rows.map(r=>r.securityId+'|'+r.date)).size===rows.length,'DUPLICATE_MISSING_SESSION_TARGET');
 if(Number.isInteger(plan.coverage?.missingSessions))check(rows.length===plan.coverage.missingSessions,'MISSING_SESSION_COVERAGE_LOSS');
 return {schema:'vu-europe-449-live-missing-review-1',sourceBindings:plan.sourceBindings,securities:securities.length,totalMissingSessions:rows.length,counts,recoveryCounts,recoveredSessions:rows.filter(r=>r.recovered).length,providerConfirmedMissing:counts.PROVIDER_CONFIRMED_MISSING||0,stillUnknown:counts.UNKNOWN||0,queryBugs:counts.QUERY_FILTER_BUG||0,mappingBugs:(counts.SYMBOL_MAPPING_BUG||0)+(counts.MIC_MAPPING_BUG||0),paginationBugs:0,paginationBugCertification:'REQUIRES_EXPLICIT_COMPARED_PAGE_SEQUENCE_PROOF_NOT_FAILED_REQUEST',productionWrites:0,fabricatedBars:0,rows,listingStatuses:securities};
}

function scopedPath(root,path){const p=realpathSync(resolve(root,path)),r=relative(realpathSync(root),p);check(!r.startsWith('..')&&!isAbsolute(r),'LIVE_ARCHIVE_PATH_ESCAPE');return p;}
function readBound(root,path,plainHash,compressedHash){const b=readFileSync(scopedPath(root,path));if(path.endsWith('.gz')){check(isSha(compressedHash)&&sha(b)===compressedHash,'LIVE_COMPRESSED_HASH_MISMATCH');const plain=gunzipSync(b);check(isSha(plainHash)&&sha(plain)===plainHash,'LIVE_NORMALIZED_HASH_MISMATCH');return plain;}check(isSha(plainHash)&&sha(b)===plainHash,'LIVE_NORMALIZED_HASH_MISMATCH');return b;}
/** Metadata proof is reconstructed from original HTTP bytes, not summary booleans. */
export function loadLiveMetadataProof({root,entry,rawManifest}){
 const op=entry.operation||{},l=op.listing||{},base={securityId:l.securityId,listingId:l.listingId,symbol:op.symbol,mic:l.mic,normalizedSha256:entry.normalizedSha256,evidenceVerified:false,success:false,venueVerified:false,exactSecurityVerified:false,identityConflict:false};
 try{const n=JSON.parse(readBound(root,entry.resultPath,entry.normalizedSha256,entry.normalizedCompressedSha256));check(hash(n.operation)===hash(op)&&hash(n.responseIds)===hash(entry.responseIds),'METADATA_OPERATION_BINDING_MISMATCH');check(n.result?.ok===true&&entry.ok===true&&n.responseIds?.length===1,'METADATA_NOT_SUCCESSFUL_SINGLE_RESPONSE');
  const id=n.responseIds[0],m=rawManifest.find(m=>m.id===id);check(m&&m.endpoint==='/tickers/'+encodeURIComponent(op.symbol)&&m.status===200&&m.host==='api.marketstack.com'&&m.apiVersion==='v2','METADATA_EXACT_ENDPOINT_REQUIRED');
  const meta=JSON.parse(readFileSync(scopedPath(root,'raw/'+id+'.meta.json')));check(hash(meta)===hash(m),'METADATA_RAW_MANIFEST_MISMATCH');const b=JSON.parse(readBound(root,m.path||'raw/'+id+'.json.gz',m.sha256,m.compressedSha256)),body=b.data??b,rows=Array.isArray(body)?body:[body],observed=n.result.observations||[];check(observed.length===rows.length&&observed.every(o=>rows.some(r=>hash(r)===hash(o.raw))),'METADATA_RAW_CONTAINMENT_MISMATCH');
  const candidates=rows.filter(r=>{const v=normalizeObservation(r,{kind:'METADATA'}).normalized;return v.providerTicker===op.symbol&&[v.providerExchange,...(r.stock_exchanges||[]).map(e=>e.mic??e.exchange_mic)].includes(l.mic)&&r.active!==false&&r.is_active!==false;});
  check(candidates.length===1,'METADATA_PRIMARY_VENUE_AMBIGUOUS');const v=normalizeObservation(candidates[0],{kind:'METADATA'}).normalized;return {...base,evidenceVerified:true,success:true,venueVerified:true,exactSecurityVerified:validIsin(l.isin)&&validIsin(v.isin)&&v.isin===l.isin&&(!v.currency||v.currency===l.currency),identityConflict:!!(v.isin&&v.isin!==l.isin||v.currency&&v.currency!==l.currency)};
 }catch(error){return {...base,failures:[error.message]};}
}
/** Replay every complete archive scope before projecting its observations.
 * The retained target set comes from the source-bound plan, never an untrusted
 * operation's targetDates. Absence/hash/pagination proofs remain full-scope. */
export function loadSecurityMissingProbes({root,entries,rawManifest,dates,loadProbe=loadLiveQuarantineProbe}){
 const wanted=new Set(dates);
 return entries.map(entry=>{const probe=loadProbe({root,entry,rawManifest});return {...probe,observations:(probe.observations||[]).filter(o=>wanted.has(o.normalized?.tradingDate))};});
}
/** At most one listing's probes survive at once; output rows retain all source
 * bindings and decisions. The pure evaluator and its classification rules stay
 * identical to evaluating all validated, unprojected probes in one call. */
export function evaluateMissingEvidenceSequential({plan,entries,root,rawManifest,loadProbe=loadLiveQuarantineProbe,loadMetadata=loadLiveMetadataProof}){
 check(plan?.version===1&&Array.isArray(plan.listings)&&isSha(plan.sourceBindings?.catalogSha256),'SOURCE_BOUND_PLAN_REQUIRED');
 const bySecurity=new Map();for(const entry of entries){const sid=entry.operation?.listing?.securityId;if(!bySecurity.has(sid))bySecurity.set(sid,[]);bySecurity.get(sid).push(entry);}
 const report=evaluateMissingSessions({plan:{...plan,listings:[],coverage:{...plan.coverage,missingSessions:0}}});
 for(const listing of plan.listings){
  const current=bySecurity.get(listing.securityId)||[],dates=(listing.windows||[]).flatMap(w=>(w.targetDates||[]).filter(t=>t.kind==='MISSING').map(t=>t.date));
  const probes=loadSecurityMissingProbes({root,entries:current.filter(e=>e.operation?.kind==='history'),rawManifest,dates,loadProbe});
  const metadata=current.filter(e=>e.operation?.kind==='metadata').map(entry=>loadMetadata({root,entry,rawManifest}));
  const part=evaluateMissingSessions({plan:{...plan,listings:[listing],coverage:{...plan.coverage,missingSessions:dates.length}},probes,metadata});
  report.rows.push(...part.rows);report.listingStatuses.push(...part.listingStatuses);
  for(const field of ['securities','totalMissingSessions','recoveredSessions','providerConfirmedMissing','stillUnknown','queryBugs','mappingBugs'])report[field]+=part[field];
  for(const field of ['counts','recoveryCounts'])for(const [key,value]of Object.entries(part[field]))report[field][key]=(report[field][key]||0)+value;
 }
 check(new Set(report.rows.map(r=>r.securityId+'|'+r.date)).size===report.rows.length,'DUPLICATE_MISSING_SESSION_TARGET');
 if(Number.isInteger(plan.coverage?.missingSessions))check(report.rows.length===plan.coverage.missingSessions,'MISSING_SESSION_COVERAGE_LOSS');
 return report;
}
export function reviewLiveMissingEvidence({plan,liveEvidenceRoot,outputPath}){
 const summary=JSON.parse(readFileSync(join(liveEvidenceRoot,'summary.json'),'utf8')),rawManifest=JSON.parse(readFileSync(join(liveEvidenceRoot,'raw-manifest.json'),'utf8'));check(summary.planSha256===hash(plan)&&hash(summary.sourceBindings)===hash(plan.sourceBindings),'LIVE_PLAN_SUMMARY_BINDING_MISMATCH');
 const report=evaluateMissingEvidenceSequential({plan,entries:summary.results||[],root:liveEvidenceRoot,rawManifest});
 if(outputPath){mkdirSync(dirname(resolve(outputPath)),{recursive:true,mode:0o700});writeFileSync(outputPath,JSON.stringify(report)+'\n',{mode:0o600});}return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)];}));check(args['--plan']&&args['--evidence']&&args['--out'],'PLAN_PRIVATE_EVIDENCE_OUTPUT_REQUIRED');const report=reviewLiveMissingEvidence({plan:JSON.parse(readFileSync(args['--plan'],'utf8')),liveEvidenceRoot:args['--evidence'],outputPath:args['--out']});console.log(JSON.stringify({securities:report.securities,totalMissingSessions:report.totalMissingSessions,counts:report.counts,recoveryCounts:report.recoveryCounts}));}
