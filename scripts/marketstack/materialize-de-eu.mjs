/** The registered local-directory/close-series producer. Private development only. */
import {mkdirSync,writeFileSync,existsSync,readFileSync,renameSync,mkdtempSync,rmSync,readdirSync,lstatSync,chmodSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
const require=createRequire(import.meta.url),Identity=require('../../core/identity.js'),Published=require('../../quant/engines/published-close.js'),Core=require('../../core/client.js');
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function treeEntries(root){
 const entries=[];
 function walk(path,relative=''){
  const stat=lstatSync(path);
  if(stat.isSymbolicLink())throw Error('PUBLISH_TREE_SYMLINK_REJECTED');
  if(!stat.isDirectory()&&!stat.isFile())throw Error('PUBLISH_TREE_FILE_TYPE_REJECTED');
  if(stat.isFile()&&stat.nlink!==1)throw Error('PUBLISH_TREE_LINK_REJECTED');
  entries.push({relative,directory:stat.isDirectory(),mode:stat.mode&0o777});
  if(stat.isDirectory())for(const name of readdirSync(path).sort())walk(join(path,name),relative?relative+'/'+name:name);
 }
 walk(root);return entries;
}
function sameTree(stage,target){
 const a=treeEntries(stage),b=treeEntries(target);
 if(a.length!==b.length)return false;
 for(let i=0;i<a.length;i++)if(a[i].relative!==b[i].relative||a[i].directory!==b[i].directory||
  !a[i].directory&&!readFileSync(join(stage,a[i].relative)).equals(readFileSync(join(target,b[i].relative))))return false;
 return true;
}
function privateModes(target){
 // Tighten older producer output without writing files or changing mtimes.
 for(const entry of treeEntries(target)){const mode=entry.directory?0o700:0o600;if(entry.mode!==mode)chmodSync(join(target,entry.relative),mode);}
}
export function provenIssuerCountry(row){
 if(/^[A-Z]{2}$/.test(row.companyCountry||''))return row.companyCountry;
 const c=row.companyReference,e=c?.evidence;
 let issuerId;try{issuerId=Identity.companyIdForLEI(c?.lei);}catch{return null;}
 if(!row.issuerLEI&&!row.referencedIssuerId||row.issuerLEI&&row.issuerLEI!==c.lei||row.referencedIssuerId&&row.referencedIssuerId!==issuerId)return null;
 const exactSource=c?.basis==='EXACT_GLEIF_ISIN_LEI_REFERENCE'&&e?.sourceSystem==='GLEIF_ANNA_ISIN_TO_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE'||
  c?.basis==='EXACT_ESMA_ISIN_LEI_REFERENCE'&&e?.sourceSystem==='ESMA_FIRDS_EXACT_ISIN_ISSUER_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE'&&/^[a-f0-9]{64}$/.test(e.regulatoryResponseSHA256||'');
 return exactSource&&
  /^[a-f0-9]{64}$/.test(e.leiBatchResponseSHA256||'')&&e.leiRecordURL==='https://api.gleif.org/api/v1/lei-records/'+c.lei&&
  /^[A-Z]{2}$/.test(c.domicileCountry||'')?c.domicileCountry:null;
}
export function directory(rows,asOf,dataAsOf=asOf){
 if(!day(asOf)||!day(dataAsOf)||dataAsOf<asOf)throw Error('FIXED_AS_OF_REQUIRED');
 const seen=new Set();const listings=rows.map(row=>{
  const listingId=Identity.listingIdFor(row),securityId=Identity.securityIdForISIN(row.isin);
  if(seen.has(listingId))throw Error('DUPLICATE_LISTING');seen.add(listingId);
  if(row.assetType!=='EQUITY'||row.mappingStatus!=='VERIFIED'||!row.mappingSource||!Array.isArray(row.indexMemberships)||
     !/^[A-Z]{3}$/.test(row.tradingCurrency||'')||!['MAJOR','MINOR'].includes(row.quoteUnit)||!Identity.normalizeTicker(row.ticker))throw Error('UNVERIFIED_LOCAL_LISTING');
  if(row.listingCountry==='US')throw Error('US_OUT_OF_SCOPE');
  return {...row,companyCountry:provenIssuerCountry(row),listingId,securityId,indexMemberships:[...new Set(row.indexMemberships)].sort(),region:'EUROPE'};
 }).sort((a,b)=>a.listingId.localeCompare(b.listingId));
 return {schemaVersion:'de-eu-directory-1.0.0',state:listings.length?'PRIVATE_DEVELOPMENT':'DISABLED',privateDevelopment:true,publicDisplay:false,referenceAsOf:asOf,dataAsOf,listings};
}
export function closeSeries(row,history,{asOf,expectedSession=null,lastProvenCompletedSession=null}={}){
 if(!day(asOf)||expectedSession&&(!day(expectedSession)||expectedSession>asOf)||lastProvenCompletedSession&&(!day(lastProvenCompletedSession)||lastProvenCompletedSession>asOf)||expectedSession&&lastProvenCompletedSession&&expectedSession<lastProvenCompletedSession)throw Error('FIXED_AS_OF_REQUIRED');
 if(!history||history.mic!==row.mic||history.isin!==row.isin||history.currency!==row.tradingCurrency||history.quoteUnit!==row.quoteUnit||history.provider!=='marketstack'||!history.sourceEvidence)throw Error('HISTORY_IDENTITY_EVIDENCE_REQUIRED');
 if(history.adjustmentStatus?.verified===true&&history.adjustmentStatus.priceSeriesType!=='SPLIT_ADJUSTED')throw Error('UNSUPPORTED_VERIFIED_BASIS');
 if(history.points&&history.bars){
  const projected=history.bars.map(b=>[b.date,Published.roundClose(b.close)]);
  if(JSON.stringify(history.points)!==JSON.stringify(projected))throw Error('COMPETING_HISTORY_PROJECTION');
 }
 const input=history.points||history.bars?.map(b=>[b.date,b.close]);if(!Array.isArray(input)||!input.length)throw Error('MISSING_HISTORY');
 let prev=null;const points=input.map(p=>{
  if(!Array.isArray(p)||!day(p[0])||p[0]>asOf||prev&&p[0]<=prev||!Number.isFinite(p[1])||p[1]<=0)throw Error('INVALID_HISTORY');
  prev=p[0];return [p[0],Published.roundClose(p[1])];
 });
 const last=points.at(-1)[0];if(expectedSession&&last>expectedSession)throw Error('FUTURE_SESSION');
 return {schemaVersion:'de-eu-close-series-1.0.0',privateDevelopment:true,publicDisplay:false,listingId:row.listingId,securityId:row.securityId,
  mic:row.mic,currency:row.tradingCurrency,quoteUnit:row.quoteUnit,provider:'marketstack',apiVersion:history.apiVersion||'v2',kind:'EOD_CLOSE',
  basis:history.adjustmentStatus?.verified===true?'SPLIT_ADJUSTED':'PROVIDER_REPORTED_UNVERIFIED',sourceEvidence:history.sourceEvidence,
  asOf:last,expectedSession,...(lastProvenCompletedSession?{lastProvenCompletedSession}:{}),retrievedAt:history.retrievedAt||null,freshness:history.cacheOnly===true?'STALE_CACHE':expectedSession?(last===expectedSession?'CURRENT':'STALE'):lastProvenCompletedSession&&last<lastProvenCompletedSession?'STALE':'UNKNOWN',
  changeVerified:history.changeVerified===true&&history.adjustmentStatus?.verified===true,quality:history.quality||{status:'PARTIAL',reason:'UNKNOWN_ADJUSTMENT_BASIS'},points};
}
export function readPrivateHistory(historiesDir,listingId){
 assertPrivateOutput(historiesDir,{allowCache:true});rejectSymlinkAncestors(historiesDir);
 if(!/^lst_[A-Z0-9]{4}_[A-Z0-9]{12}$/.test(listingId))throw Error('CANONICAL_HISTORY_ID_REQUIRED');
 const p=join(historiesDir,listingId+'.json');rejectSymlinkAncestors(p);if(!existsSync(p))return null;
 const stat=lstatSync(p);if(!stat.isFile()||stat.nlink!==1)throw Error('HISTORY_INPUT_FILE_TYPE_REJECTED');
 return JSON.parse(readFileSync(p,'utf8'));
}
export function certifiedReadiness(proofs,series,inputSeriesHash){
 const states={chart:['CHART_READY','CHART_READY_WITH_LIMITATION','CHART_BLOCKED'],technical:['TECHNICAL_READY','TECHNICAL_PARTIAL','TECHNICAL_BLOCKED'],latestEod:['FRESH_CURRENT_SESSION','FRESH_LAST_VALID_SESSION','DELAYED_EXPECTED','STALE','MISSING','INVALID','UNKNOWN']};
 const result={};
 for(const [name,allowed]of Object.entries(states)){
  const p=proofs?.[name];
  if(!p){result[name]={status:'NOT_TESTED',state:name==='latestEod'?'UNKNOWN':'NOT_TESTED',cause:'MISSING_CERTIFICATION_EVIDENCE'};continue;}
  if(!['READY','PARTIAL','BLOCKED','NOT_TESTED','NOT_APPLICABLE'].includes(p.status)||!allowed.includes(p.state)&&p.state!=='NOT_TESTED'||
   !series||!inputSeriesHash||p.inputSeriesHash!==inputSeriesHash||p.asOf!==series.asOf||
   !Array.isArray(p.evidence)||!p.evidence.length||p.evidence.some(e=>typeof e!=='string'||!e.trim())||
   !day(p.window?.start)||!day(p.window?.end)||p.window.start>p.window.end||p.window.start<series.points[0][0]||p.window.end>series.asOf)throw Error('READINESS_INPUT_EVIDENCE_MISMATCH');
  if(name==='chart'&&((p.status==='READY'&&p.state!=='CHART_READY')||(p.status==='PARTIAL'&&p.state!=='CHART_READY_WITH_LIMITATION')||(p.status==='BLOCKED'&&p.state!=='CHART_BLOCKED')))throw Error('READINESS_STATUS_STATE_MISMATCH');
  if(name==='chart'&&['READY','PARTIAL'].includes(p.status)&&(p.window.end!==series.asOf||
   p.status==='READY'&&series.freshness!=='CURRENT'||
   p.status==='PARTIAL'&&series.freshness!=='CURRENT'&&!(series.freshness==='STALE'&&p.lagSessions===1&&p.expectedLastSession===series.expectedSession&&p.freshnessPolicy?.maxLagSessions===1)))throw Error('READINESS_CHART_FRESHNESS_CONTRADICTION');
  if(name==='technical'&&((p.status==='READY'&&p.state!=='TECHNICAL_READY')||(p.status==='PARTIAL'&&p.state!=='TECHNICAL_PARTIAL')||(p.status==='BLOCKED'&&p.state!=='TECHNICAL_BLOCKED')))throw Error('READINESS_STATUS_STATE_MISMATCH');
  if(name==='latestEod'&&p.status==='READY'&&!['FRESH_CURRENT_SESSION','FRESH_LAST_VALID_SESSION'].includes(p.state))throw Error('READINESS_STATUS_STATE_MISMATCH');
  if(name==='latestEod'&&p.status==='READY'&&(!day(series.expectedSession)||series.asOf!==series.expectedSession||series.freshness!=='CURRENT'||
   p.state==='FRESH_CURRENT_SESSION'&&(!day(p.dataAsOf)||p.asOf!==p.dataAsOf)))throw Error('READINESS_FRESHNESS_CONTRADICTION');
  result[name]=p;
 }
 return result;
}
// Validate full private input first; compact only the consumer projection.
const CONSUMER_FIELDS=['name','companyName','isin','mic','listingId','securityId','companyId','referencedIssuerId','companyAssociationStatus','companyCountry','listingCountry','ticker','localTicker','aliases','assetType','shareClass','tradingCurrency','quoteUnit','indexMemberships','mappingStatus','mappingSource','providerSymbol','providerStatus','providerVerified','currentProviderVerified','primaryListingVerified','alternativeListing','listingPreference','tier','logo','sector','industry','description','region','readiness'];
const proofHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function compactProof(value){if(!value?.evidence?.length)return value;return {...value,evidence:['private-proof:sha256:'+proofHash(value)],fullProofHash:proofHash(value),evidenceCount:value.evidence.length,evidenceHash:proofHash(value.evidence)};}
function compactConsumerRow(row){const out=Object.fromEntries(CONSUMER_FIELDS.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));return {...out,privateMetadataHash:proofHash(row),readiness:Object.fromEntries(Object.entries(row.readiness).map(([name,value])=>[name,compactProof(value)]))};}
export function materialize({rows,histories={},historiesDir=null,asOf,referenceAsOf=asOf,expectedSessions={},lastProvenCompletedSessions={},technicalFields={},readiness={},compactConsumerProjection=false,out,disabled=false}){
 out=resolve(out);if(!disabled)assertPrivateOutput(out);else rejectSymlinkAncestors(out);
 if(historiesDir){if(Object.keys(histories).length)throw Error('COMPETING_HISTORY_INPUTS');assertPrivateOutput(historiesDir,{allowCache:true});rejectSymlinkAncestors(historiesDir);}
 const d=directory(disabled?[]:rows,referenceAsOf,asOf),series={},historyHashes={};
 // Read each private normalized file independently. A full European cache can
 // exceed V8's single-string limit; only the canonical projections stay in memory.
 for(const r of d.listings){
  let h=histories[r.listingId];
  if(historiesDir)h=readPrivateHistory(historiesDir,r.listingId);
  if(h){series[r.listingId]=closeSeries(r,h,{asOf,expectedSession:expectedSessions[r.mic]||null,lastProvenCompletedSession:lastProvenCompletedSessions[r.mic]||null});if(h.bars)historyHashes[r.listingId]=createHash('sha256').update(JSON.stringify(h.bars)).digest('hex');}
 }
 for(const r of d.listings)for(const field of Object.values(technicalFields[r.listingId]||{}))if(field.status==='READY'){
  const s=series[r.listingId],hash=historyHashes[r.listingId];
  if(!s||!hash||field.inputSeriesHash!==hash||!Number.isFinite(field.value)||!Array.isArray(field.evidence)||!field.evidence.length||
   field.asOf!==s.asOf||!day(field.window?.from)||!day(field.window?.to)||field.window.to!==s.asOf||field.window.from>s.asOf||field.window.from<s.points[0][0])throw Error('TECHNICAL_INPUT_EVIDENCE_MISMATCH');
 }
 for(const r of d.listings){
  const s=series[r.listingId];
  r.readiness=certifiedReadiness(readiness[r.listingId],s,historyHashes[r.listingId]);
  if(s){
   s.readiness=r.readiness;
   const proof=r.readiness.chart;
   if(['READY','PARTIAL'].includes(proof.status)){
    s.chartWindow=proof.window;s.chartPoints=s.points.filter(p=>p[0]>=proof.window.start&&p[0]<=proof.window.end);
    if(!s.chartPoints.length||s.chartPoints[0][0]!==proof.window.start||s.chartPoints.at(-1)[0]!==proof.window.end)throw Error('CHART_WINDOW_NOT_MATERIALIZED');
   }
  }
 }
 const target=join(out,'core/data/de-eu'),backup=target+'.previous';rejectSymlinkAncestors(target);rejectSymlinkAncestors(backup);
 if(existsSync(backup))throw Error('PUBLISH_RECOVERY_REQUIRED');
 mkdirSync(dirname(target),{recursive:true,mode:disabled?0o755:0o700});
 // Keep staging outside the existing output tree when both paths share a
 // filesystem. A mount boundary retains the original same-filesystem staging.
 const stageParent=lstatSync(dirname(out)).dev===lstatSync(dirname(target)).dev?dirname(out):dirname(target);
 const stage=mkdtempSync(join(stageParent,'.de-eu-stage-'));
 const write=(p,v)=>{mkdirSync(dirname(p),{recursive:true,mode:disabled?0o755:0o700});writeFileSync(p,JSON.stringify(v)+'\n',{mode:disabled?0o644:0o600});};
 if(compactConsumerProjection){d.listings=d.listings.map(compactConsumerRow);for(const row of d.listings){const s=series[row.listingId];if(s)s.readiness=row.readiness;}}
 const result=changed=>({listings:d.listings.length,series:Object.keys(series).length,privateDevelopment:true,publicDisplay:false,changed});
 try{
  write(join(stage,'listings.json'),d);for(const [id,s]of Object.entries(series))write(join(stage,'series',id+'.json'),s);
  if(!disabled)write(join(stage,'screener.json'),{schemaVersion:'de-eu-screener-1.0.0',privateDevelopment:true,publicDisplay:false,
   referenceAsOf:d.referenceAsOf,dataAsOf:d.dataAsOf,listings:d.listings.map(r=>({...r,
    price:series[r.listingId]?Core.listingLatestPriceData(series[r.listingId],r.ticker):null,fields:technicalFields[r.listingId]||{}}))});
  const prior=existsSync(target);
  if(prior&&sameTree(stage,target)){if(!disabled)privateModes(target);return result(false);}
  // Validate the full existing tree even when its file list already differs.
  if(prior){treeEntries(target);renameSync(target,backup);}
  try{renameSync(stage,target);}catch(e){if(prior)renameSync(backup,target);throw e;}
  if(prior)rmSync(backup,{recursive:true,force:true});
  return result(true);
 }finally{rmSync(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3),out=arg('out'),asOf=arg('as-of');
 if(!out||!asOf)throw Error('EXPLICIT_OUTPUT_AND_AS_OF_REQUIRED');const disabled=process.argv.includes('--disabled');
 const input=disabled?{}:JSON.parse(readFileSync(arg('input'),'utf8'));
 console.log(JSON.stringify(materialize({...input,rows:input.rows||[],out,asOf,disabled})));
}
