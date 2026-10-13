/** Private adjustment-field review. Never repairs, synthesizes or adjusts bars.
 * Arithmetic describes observed fields; only an independent exact-bound
 * verifier can certify a field convention. Live probes cannot certify MAX. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,chmodSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync,gzipSync} from 'node:zlib';
export const FIELD_CLASSES=Object.freeze({RAW_OHLC:['open','high','low','close'],ADJUSTED_OHLC:['adj_open','adj_high','adj_low','adj_close'],RAW_VOLUME:['volume'],ADJUSTED_VOLUME:['adj_volume'],SPLIT_FACTOR:['split_factor'],DIVIDEND:['dividend']});
export const STATES=Object.freeze(['CERTIFIED','PARTIAL','CONFLICTING','UNKNOWN']);
const WINDOWS=['1Y','3Y','5Y','MAX'];
const US_MICS=new Set(['XNAS','XNYS','ARCX','XASE','BATS','IEXG']);
const hash=x=>createHash('sha256').update(x).digest('hex');
export const observationHash=x=>hash(JSON.stringify(x));
const validSha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const number=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>number(x)&&x>0;
const rawOf=x=>x?.raw??x;
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const dateOf=x=>String(rawOf(x)?.date??x?.normalized?.tradingDate??'').slice(0,10);
const bump=(o,k)=>o[k]=(o[k]??0)+1;
const unique=x=>[...new Set(x)];
function shiftYear(d,n){const a=new Date(d+'T00:00:00Z'),month=a.getUTCMonth();a.setUTCFullYear(a.getUTCFullYear()-n);if(a.getUTCMonth()!==month)a.setUTCDate(0);return a.toISOString().slice(0,10);}
function geometry(raw,fields){const values=fields.map(f=>raw[f]);if(values.some(v=>v==null))return 'INCOMPLETE';if(!values.every(number))return 'NON_NUMERIC';if(!values.every(positive))return 'NON_POSITIVE';const [o,h,l,c]=values;return h>=Math.max(o,l,c)&&l<=Math.min(o,h,c)?'VALID':'IMPOSSIBLE';}
function fieldValue(raw,f){return Object.hasOwn(raw,f)?{presence:'PRESENT',value:raw[f]}:{presence:'ABSENT'};}
/** Compare every original raw field, including fields introduced by the provider.
 * Null, absence and numeric strings remain different. */
export function compareSemanticsFields(oldObservation,newObservation){
 const old=rawOf(oldObservation),fresh=rawOf(newObservation),fields=unique([...Object.keys(old),...Object.keys(fresh)]).sort();
 return fields.filter(f=>JSON.stringify(fieldValue(old,f))!==JSON.stringify(fieldValue(fresh,f))).map(field=>({field,old:fieldValue(old,field),new:fieldValue(fresh,field)}));
}
function sourceRef(o){return {rawResponseId:o?.provenance?.rawResponseId??null,rawSha256:o?.provenance?.rawSha256??null,rawIndexInPage:o?.provenance?.rawIndexInPage??null,rawBarSha256:observationHash(rawOf(o))};}
/** Four-decimal price rounding is tolerated solely when comparing factors.
 * It never changes OHLC ordering or actual source values. */
function ratiosConflict(raw){const keys=FIELD_CLASSES.RAW_OHLC;if(!keys.every(k=>positive(raw[k])&&positive(raw['adj_'+k])))return false;const ratios=keys.map(k=>raw['adj_'+k]/raw[k]);const tolerances=keys.map(k=>.0001/raw[k]+.0001*raw['adj_'+k]/raw[k]**2);return Math.max(...ratios)-Math.min(...ratios)>Math.max(.001,2*Math.max(...tolerances));}
export function reviewFieldSemantics(observations=[]){
 const classes={};
 for(const [kind,fields]of Object.entries(FIELD_CLASSES)){
  const counts={observations:observations.length,observedRows:0,completeRows:0,missingRows:0,invalidRows:0},reasons=new Set(['INDEPENDENT_FIELD_CONVENTION_NOT_CERTIFIED']);
  const valueCounts=Object.fromEntries(fields.map(f=>[f,{absent:0,null:0,numeric:0,nonNumeric:0,positive:0,zero:0,negative:0}]));
  for(const o of observations){const raw=rawOf(o),present=fields.filter(f=>raw[f]!=null),complete=present.length===fields.length;if(present.length)counts.observedRows++;else counts.missingRows++;if(complete)counts.completeRows++;
   for(const f of fields){const v=raw[f],c=valueCounts[f];if(!Object.hasOwn(raw,f))c.absent++;else if(v==null)c.null++;else if(!number(v))c.nonNumeric++;else{c.numeric++;bump(c,v>0?'positive':v<0?'negative':'zero');}}
   let invalid=false;
   if(kind.endsWith('OHLC')){const g=geometry(raw,fields);if(g==='INCOMPLETE')reasons.add('OHLC_FIELDS_INCOMPLETE');else if(g!=='VALID'){invalid=true;reasons.add('OHLC_'+g);}if(kind==='ADJUSTED_OHLC'&&ratiosConflict(raw)){invalid=true;reasons.add('RAW_ADJUSTED_FIELD_RATIO_CONFLICT');}}
   else if(present.some(f=>!number(raw[f]))){invalid=true;reasons.add('NON_NUMERIC_FIELD');}
   if(kind==='RAW_VOLUME'||kind==='ADJUSTED_VOLUME'){if(present.some(f=>number(raw[f])&&raw[f]<0)){invalid=true;reasons.add('NEGATIVE_VOLUME');}if(present.some(f=>raw[f]===0))reasons.add('ZERO_VOLUME_OBSERVED');reasons.add('SHARES_AND_VOLUME_BASIS_UNVERIFIED');}
   if(kind==='SPLIT_FACTOR'){if(present.some(f=>number(raw[f])&&raw[f]<=0)){invalid=true;reasons.add('NON_POSITIVE_SPLIT_FACTOR');}if(raw.split_factor!==undefined&&raw.split_factor!==null&&raw.split_factor!==1)reasons.add('NON_UNIT_FACTOR_CONVENTION_UNVERIFIED');reasons.add('FACTOR_ONE_DOES_NOT_ESTABLISH_ACTION_ABSENCE');}
   if(kind==='DIVIDEND'){if(number(raw.dividend)&&raw.dividend<0)reasons.add('NEGATIVE_DIVIDEND_CONVENTION_UNVERIFIED');if(number(raw.dividend)&&raw.dividend>0)reasons.add('PROVIDER_CASH_DIVIDEND_OBSERVED');reasons.add('DIVIDEND_DATE_CURRENCY_AND_REINVESTMENT_BASIS_UNVERIFIED');}
   // Partial adjusted OHLC still cannot contain invalid observed price fields.
   if(kind.endsWith('OHLC')&&present.some(f=>!positive(raw[f]))){invalid=true;reasons.add('INVALID_OBSERVED_PRICE_FIELD');}
   if(o.identityScopeVerified===false)reasons.add('SOURCE_LISTING_SCOPE_NOT_VERIFIED');
   if(invalid)counts.invalidRows++;
  }
  const status=counts.invalidRows?'CONFLICTING':counts.observedRows?'PARTIAL':'UNKNOWN';if(!counts.observedRows)reasons.add('NO_OBSERVED_FIELD_VALUES');
  classes[kind]={status,counts,valueCounts,reasonCodes:[...reasons].sort(),independentlyCertified:false};
 }
 return classes;
}
function bindingFor({security,listing,observations,from,to,fieldClass}){return {securityId:security.securityId,listingId:listing.listingId,mic:listing.mic,currency:listing.currency,fieldClass,from,to,observationsSha256:observationHash(observations.map(o=>({raw:rawOf(o),source:sourceRef(o)})))};}
async function certify(fields,{security,listing,observations,from,to,certificates,verifyConvention}){
 if(typeof verifyConvention!=='function')return fields;
 for(const [kind,f]of Object.entries(fields)){
  // Null or contradictory fields are never certified by documentation alone.
  if(f.status!=='PARTIAL'||f.counts.completeRows!==f.counts.observations||observations.some(o=>o.identityScopeVerified===false))continue;
  const cert=certificates?.[kind];if(!cert||!validSha(cert.sourceSha256))continue;
  const binding=bindingFor({security,listing,observations,from,to,fieldClass:kind});let verified=null;
  try{verified=await verifyConvention(kind,structuredClone(cert),structuredClone(binding));}catch{continue;}
  if(verified?.verified!==true||verified.independent!==true||verified.fieldClass!==kind||verified.sourceSha256!==cert.sourceSha256||!Object.keys(binding).every(k=>verified[k]===binding[k]))continue;
  // The independent evidence must define this exact field's convention.
  if(typeof verified.convention!=='string'||!verified.convention.trim())continue;
  f.status='CERTIFIED';f.independentlyCertified=true;f.convention=verified.convention;f.certificateSourceSha256=verified.sourceSha256;f.reasonCodes=f.reasonCodes.filter(c=>c!=='INDEPENDENT_FIELD_CONVENTION_NOT_CERTIFIED');
 }
 return fields;
}
function compareRows(oldObservations,liveObservations){const old=new Map();for(const o of oldObservations){const d=dateOf(o);if(!old.has(d))old.set(d,[]);old.get(d).push(o);}const comparisons=[];
 for(const fresh of liveObservations){const d=dateOf(fresh),previous=old.get(d)??[];for(const before of previous){const changes=compareSemanticsFields(before,fresh);comparisons.push({date:d,status:changes.length?'PROVIDER_FIELDS_CHANGED':'PROVIDER_FIELDS_UNCHANGED',oldEvidence:sourceRef(before),newEvidence:sourceRef(fresh),changes,quarantineReleased:false});}if(!previous.length)comparisons.push({date:d,status:'NO_OLD_RAW_ROW',newEvidence:sourceRef(fresh),changes:null,quarantineReleased:false});}
 return comparisons;
}
export async function reviewSecurityAdjustment({security,oldObservations=[],liveObservations=[],liveOperations=[],corporateActions=null,asOf,certificates={},verifyConvention}={}){
 const listing=security?.listings?.find(l=>l.listingId===security.primaryListingId)??security?.listing;
 if(!security?.securityId||!listing?.listingId||US_MICS.has(listing.mic)||!day(asOf))throw Error('EXACT_EUROPE_SECURITY_AND_ASOF_REQUIRED');
 const observations=[...oldObservations,...liveObservations],first=observations.map(dateOf).filter(d=>day(d)&&d<=asOf).sort()[0]??asOf;
 const windows={};
 for(const window of WINDOWS){const from=window==='MAX'?first:shiftYear(asOf,Number(window[0])),select=items=>items.filter(o=>day(dateOf(o))&&dateOf(o)>=from&&dateOf(o)<=asOf),old=select(oldObservations),fresh=select(liveObservations),all=[...old,...fresh];
  const fields=await certify(reviewFieldSemantics(all),{security,listing,observations:all,from,to:asOf,certificates:certificates[window],verifyConvention});
  windows[window]={from,to:asOf,sourceScope:'OBSERVED_OLD_AND_TARGETED_LIVE_ROWS_NOT_COMPLETE_SERIES_CERTIFICATION',existingObservations:old.length,freshObservations:fresh.length,liveWholeWindowCertified:false,fields,existingFields:reviewFieldSemantics(old),freshProbeFields:reviewFieldSemantics(fresh)};
 }
 const comparisons=compareRows(oldObservations,liveObservations);
 return {securityId:security.securityId,listingId:listing.listingId,mic:listing.mic,currency:listing.currency,providerSymbol:listing.providerSymbol??listing.providerTicker,fields:windows.MAX.fields,windows,sourceHashes:unique(observations.map(o=>sourceRef(o).rawSha256).filter(Boolean)).sort(),comparisons,fieldChanges:comparisons.filter(c=>c.status==='PROVIDER_FIELDS_CHANGED').length,liveOperations:liveOperations.map(o=>({kind:o.kind,from:o.from,to:o.to,variant:o.variant,windowId:o.windowId,ok:o.ok,complete:o.complete,responseIds:o.responseIds})),corporateActionsCertification:['UNKNOWN','PARTIAL','CONFLICTING'].includes(corporateActions?.corporateActionsCertification)?corporateActions.corporateActionsCertification:'UNKNOWN',corporateActionsEvidenceOnly:true,analyticsEvidence:null,rawPreserved:true,adjustmentsApplied:0,quarantineReleased:0,publicationReady:false};
}
export async function buildAdjustmentFinal({catalog,oldBySecurity={},liveBySecurity={},operationsBySecurity={},corporateActions={rows:[]},asOf,certificatesBySecurity={},verifyConvention,expectedCount=449}={}){
 const securities=catalog?.securities;if(!Array.isArray(securities)||securities.length!==expectedCount||new Set(securities.map(s=>s.securityId)).size!==expectedCount)throw Error('EXACT_UNIVERSE_REQUIRED');
 const ca=new Map((corporateActions.rows??[]).map(r=>[r.securityId,r])),rows=[];
 for(const security of [...securities].sort((a,b)=>a.securityId.localeCompare(b.securityId)))rows.push(await reviewSecurityAdjustment({security,oldObservations:oldBySecurity[security.securityId]??[],liveObservations:liveBySecurity[security.securityId]??[],liveOperations:operationsBySecurity[security.securityId]??[],corporateActions:ca.get(security.securityId),asOf,certificates:certificatesBySecurity[security.securityId],verifyConvention}));
 return assembleAdjustmentFinal(rows,asOf);
}
function assembleAdjustmentFinal(rows,asOf){
 const counts=Object.fromEntries(Object.keys(FIELD_CLASSES).map(kind=>[kind,Object.fromEntries(STATES.map(state=>[state,rows.filter(r=>r.fields[kind].status===state).length]))]));
 return {schema:'vu-europe-449-live-adjustment-review-1',asOf,securities:rows.length,scope:'ALL_SECURITY_FIELD_CLASSES;LIVE_ONLY_TARGETED_WINDOWS',counts,arithmeticConsistencyIsIndependentCertification:false,emptyActionEndpointsEstablishAbsence:false,liveWindowsCertifyMaximumHistory:false,rawValuesModified:0,syntheticBarsCreated:0,adjustmentsApplied:0,quarantineReleased:0,publicationReady:false,rows};
}
function checkedJson(root,path,sha,{codec,compressedSha256}={}){
 const realRoot=realpathSync(root),file=realpathSync(resolve(root,path)),rel=relative(realRoot,file);
 if(rel.startsWith('..')||isAbsolute(rel))throw Error('EVIDENCE_PATH_SCOPE');
 const bytes=readFileSync(file);if(codec!==undefined&&codec!=='gzip'&&codec!=='identity')throw Error('UNKNOWN_EVIDENCE_CODEC');
 if(codec==='gzip'){
  if(!validSha(compressedSha256)||hash(bytes)!==compressedSha256)throw Error('COMPRESSED_EVIDENCE_HASH_MISMATCH');
  const plain=gunzipSync(bytes);if(!validSha(sha)||hash(plain)!==sha)throw Error('DECOMPRESSED_EVIDENCE_HASH_MISMATCH');return JSON.parse(plain);
 }
 if(sha&&!validSha(sha)||sha&&hash(bytes)!==sha)throw Error('EVIDENCE_HASH_MISMATCH');return JSON.parse(bytes);
}
export function readSemanticsArchiveIndex({evidence,live=false}){return {manifest:checkedJson(evidence,'raw-manifest.json'),summary:live?checkedJson(evidence,'summary.json'):null};}
/** Authenticate raw bytes and bind normalized rows back to an exact raw row.
 * Historical evidence uses original /eod pages; live evidence uses collector
 * normalized operation records and returns incomplete operations explicitly. */
export function loadSemanticsEvidence({catalog,evidence,live=false,archiveIndex}){
 const index=archiveIndex??readSemanticsArchiveIndex({evidence,live}),manifest=index.manifest,byId=new Map(manifest.map(m=>[m.id,m])),bySecurity={},operationsBySecurity={};if(byId.size!==manifest.length)throw Error('DUPLICATE_RAW_RESPONSE_ID');
 const expected=new Map(catalog.securities.map(s=>{const l=s.listings.find(l=>l.listingId===s.primaryListingId);return [s.securityId,l];}));
 const loadPage=id=>{const m=byId.get(id);if(!m||m.host!=='api.marketstack.com'||m.apiVersion!=='v2'||m.endpoint!=='/eod'||!validSha(m.sha256))throw Error('AUTHENTICATED_RAW_MANIFEST_REQUIRED');const meta=checkedJson(evidence,'raw/'+id+'.meta.json');if(observationHash(meta)!==observationHash(m))throw Error('RAW_METADATA_MANIFEST_MISMATCH');return {m,payload:checkedJson(evidence,m.path??'raw/'+id+'.json',m.sha256,{codec:m.codec,compressedSha256:m.compressedSha256})};};
 if(!live){for(const m of manifest){if(m.endpoint!=='/eod'||m.status!==200)continue;const matched=[...expected].find(([,l])=>l.providerSymbol===m.params.symbols&&l.mic===m.params.exchange);if(!matched)continue;const [sid,l]=matched,{payload}=loadPage(m.id);bySecurity[sid]??=[];for(const [rawIndexInPage,raw]of (payload.data??[]).entries())bySecurity[sid].push({raw,identityScopeVerified:raw.symbol===l.providerSymbol&&raw.exchange===l.mic,provenance:{rawResponseId:m.id,rawSha256:m.sha256,rawIndexInPage}});}return {bySecurity,operationsBySecurity};}
 const summary=index.summary;for(const entry of summary.results??[]){const operation=entry.operation??{},sid=operation.listing?.securityId,l=expected.get(sid);if(!l||operation.kind!=='history')continue;const normalized=checkedJson(evidence,entry.resultPath,entry.normalizedSha256,{codec:entry.codec??(entry.normalizedCompressedSha256?'gzip':undefined),compressedSha256:entry.normalizedCompressedSha256}),result=normalized.result??{};operationsBySecurity[sid]??=[];operationsBySecurity[sid].push({...operation,ok:result.ok===true,complete:result.complete===true&&result.scopeComplete===true,responseIds:normalized.responseIds??[]});const matches=new Map();for(const id of normalized.responseIds??[]){const {m,payload}=loadPage(id);if(m.status!==200)continue;for(const [rawIndexInPage,raw]of (payload.data??[]).entries()){const h=observationHash(raw);if(!matches.has(h))matches.set(h,{raw,provenance:{rawResponseId:id,rawSha256:m.sha256,rawIndexInPage}});}}
  bySecurity[sid]??=[];for(const o of result.data??[]){const bound=matches.get(observationHash(o.raw));if(!bound)throw Error('NORMALIZED_RAW_BINDING_MISMATCH');bySecurity[sid].push({...bound,identityScopeVerified:o.raw.symbol===(l.providerSymbol??l.providerTicker)&&o.raw.exchange===l.mic});}}
 return {bySecurity,operationsBySecurity};
}
export async function buildAdjustmentFinalFromEvidence({catalog,oldEvidence,liveEvidence,corporateActions={rows:[]},asOf,expectedCount=449,onProgress=()=>{},comparisonLedgerRoot,reportRoot,protectedRoots=[]}){
 if(!Array.isArray(catalog?.securities)||catalog.securities.length!==expectedCount||new Set(catalog.securities.map(s=>s.securityId)).size!==expectedCount)throw Error('EXACT_UNIVERSE_REQUIRED');
 const oldIndex=readSemanticsArchiveIndex({evidence:oldEvidence}),freshIndex=readSemanticsArchiveIndex({evidence:liveEvidence,live:true}),ca=new Map((corporateActions.rows??[]).map(r=>[r.securityId,r])),rows=[];
 for(const security of [...catalog.securities].sort((a,b)=>a.securityId.localeCompare(b.securityId))){const scoped={securities:[security]},old=loadSemanticsEvidence({catalog:scoped,evidence:oldEvidence,archiveIndex:oldIndex}),fresh=loadSemanticsEvidence({catalog:scoped,evidence:liveEvidence,live:true,archiveIndex:freshIndex});const row=await reviewSecurityAdjustment({security,oldObservations:old.bySecurity[security.securityId]??[],liveObservations:fresh.bySecurity[security.securityId]??[],liveOperations:fresh.operationsBySecurity[security.securityId]??[],corporateActions:ca.get(security.securityId),asOf});if(comparisonLedgerRoot){const ledger=writeComparisonLedger({root:comparisonLedgerRoot,reportRoot,securityId:security.securityId,comparisons:row.comparisons,protectedRoots:[oldEvidence,liveEvidence,...protectedRoots]});const counts={PROVIDER_FIELDS_CHANGED:0,PROVIDER_FIELDS_UNCHANGED:0,NO_OLD_RAW_ROW:0};for(const c of row.comparisons)bump(counts,c.status);row.comparisonSummary={total:row.comparisons.length,statusCounts:counts,fullEvidencePreservedInPrivateLedger:true};row.comparisonLedger=ledger;delete row.comparisons;}rows.push(row);onProgress({securitiesComplete:rows.length,securitiesTotal:catalog.securities.length});}
 return assembleAdjustmentFinal(rows,asOf);
}
/** Complete comparisons are private compressed evidence. The compact report
 * stores hashes of both actual GZIP bytes and exact decompressed JSON bytes. */
export function writeComparisonLedger({root,reportRoot,securityId,comparisons,protectedRoots=[]}){
 if(typeof securityId!=='string'||!securityId||!Array.isArray(comparisons))throw Error('COMPARISON_LEDGER_INPUT_REQUIRED');
 const directory=resolve(root);mkdirSync(directory,{recursive:true,mode:0o700});const real=realpathSync(directory);
 for(const source of protectedRoots){const r=realpathSync(source),rel=relative(r,real),back=relative(real,r);if((!rel.startsWith('..')&&!isAbsolute(rel))||(!back.startsWith('..')&&!isAbsolute(back)))throw Error('PRIVATE_OUTPUT_SOURCE_OVERLAP');}
 const path=join(real,encodeURIComponent(securityId)+'.json.gz'),stat=lstatSync(path,{throwIfNoEntry:false});
 if(stat&&(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1))throw Error('PRIVATE_OUTPUT_LINK_FORBIDDEN');
 const bytes=Buffer.from(JSON.stringify({schema:'vu-europe-private-field-comparisons-1',securityId,comparisons})+'\n'),compressed=gzipSync(bytes,{level:6});
 chmodSync(real,0o700);writeFileSync(path,compressed,{mode:0o600});chmodSync(path,0o600);
 return {path:reportRoot?relative(resolve(reportRoot),path):path,codec:'gzip',sha256:hash(bytes),compressedSha256:hash(compressed),bytes:bytes.length,compressedBytes:compressed.length,comparisons:comparisons.length};
}
export function writeAdjustmentFinal({out,report,protectedRoots=[]}){const target=resolve(out);mkdirSync(target,{recursive:true,mode:0o700});const real=realpathSync(target);for(const root of protectedRoots){const r=realpathSync(root),rel=relative(r,real),back=relative(real,r);if((!rel.startsWith('..')&&!isAbsolute(rel))||(!back.startsWith('..')&&!isAbsolute(back)))throw Error('PRIVATE_OUTPUT_SOURCE_OVERLAP');}const path=join(real,'europe_449_adjustment_final.json'),s=lstatSync(path,{throwIfNoEntry:false});if(s&&(!s.isFile()||s.isSymbolicLink()||s.nlink!==1))throw Error('PRIVATE_OUTPUT_LINK_FORBIDDEN');chmodSync(real,0o700);writeFileSync(path,JSON.stringify(report)+'\n',{mode:0o600});chmodSync(path,0o600);return {path,sha256:hash(readFileSync(path))};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1])throw Error('EXPLICIT_ARGUMENT_REQUIRED');args[process.argv[i].slice(2)]=process.argv[i+1];}for(const k of ['root','oldEvidence','liveEvidence','out','asOf'])if(!args[k])throw Error('EXPLICIT_'+k.toUpperCase()+'_REQUIRED');const catalog=JSON.parse(readFileSync(join(args.root,'discover/data/europe/catalog.json'),'utf8')),corporateActions=args.corporateActions?JSON.parse(readFileSync(args.corporateActions,'utf8')):{rows:[]};const report=await buildAdjustmentFinalFromEvidence({catalog,oldEvidence:args.oldEvidence,liveEvidence:args.liveEvidence,corporateActions,asOf:args.asOf,comparisonLedgerRoot:args.comparisonLedgerRoot??join(args.out,'field-comparisons'),reportRoot:args.out,protectedRoots:[args.root]});console.log(JSON.stringify(writeAdjustmentFinal({out:args.out,report,protectedRoots:[args.root,args.oldEvidence,args.liveEvidence]})));}
