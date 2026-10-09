/** The registered local-directory/close-series producer. Private development only. */
import {mkdirSync,writeFileSync,existsSync,readFileSync,renameSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
const require=createRequire(import.meta.url),Identity=require('../../core/identity.js'),Published=require('../../quant/engines/published-close.js');
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function directory(rows,asOf,dataAsOf=asOf){
 if(!day(asOf)||!day(dataAsOf)||dataAsOf<asOf)throw Error('FIXED_AS_OF_REQUIRED');
 const seen=new Set();const listings=rows.map(row=>{
  const listingId=Identity.listingIdFor(row),securityId=Identity.securityIdForISIN(row.isin);
  if(seen.has(listingId))throw Error('DUPLICATE_LISTING');seen.add(listingId);
  if(row.assetType!=='EQUITY'||row.mappingStatus!=='VERIFIED'||!row.mappingSource||!Array.isArray(row.indexMemberships)||!row.indexMemberships.length||
     !/^[A-Z]{3}$/.test(row.tradingCurrency||'')||!['MAJOR','MINOR'].includes(row.quoteUnit)||!Identity.normalizeTicker(row.ticker))throw Error('UNVERIFIED_LOCAL_LISTING');
  if(row.listingCountry==='US')throw Error('US_OUT_OF_SCOPE');
  return {...row,listingId,securityId,indexMemberships:[...new Set(row.indexMemberships)].sort(),region:'EUROPE'};
 }).sort((a,b)=>a.listingId.localeCompare(b.listingId));
 return {schemaVersion:'de-eu-directory-1.0.0',state:listings.length?'PRIVATE_DEVELOPMENT':'DISABLED',privateDevelopment:true,publicDisplay:false,referenceAsOf:asOf,dataAsOf,listings};
}
export function closeSeries(row,history,{asOf,expectedSession=null}={}){
 if(!day(asOf)||expectedSession&&!day(expectedSession))throw Error('FIXED_AS_OF_REQUIRED');
 if(!history||history.mic!==row.mic||history.isin!==row.isin||history.currency!==row.tradingCurrency||history.quoteUnit!==row.quoteUnit||history.provider!=='marketstack'||!history.sourceEvidence)throw Error('HISTORY_IDENTITY_EVIDENCE_REQUIRED');
 if(history.adjustmentStatus?.verified===true&&history.adjustmentStatus.priceSeriesType!=='SPLIT_ADJUSTED')throw Error('UNSUPPORTED_VERIFIED_BASIS');
 const input=history.points||history.bars?.map(b=>[b.date,b.close]);if(!Array.isArray(input)||!input.length)throw Error('MISSING_HISTORY');
 let prev=null;const points=input.map(p=>{
  if(!Array.isArray(p)||!day(p[0])||p[0]>asOf||prev&&p[0]<=prev||!Number.isFinite(p[1])||p[1]<=0)throw Error('INVALID_HISTORY');
  prev=p[0];return [p[0],Published.roundClose(p[1])];
 });
 const last=points.at(-1)[0];if(expectedSession&&last>expectedSession)throw Error('FUTURE_SESSION');
 return {schemaVersion:'de-eu-close-series-1.0.0',privateDevelopment:true,publicDisplay:false,listingId:row.listingId,securityId:row.securityId,
  mic:row.mic,currency:row.tradingCurrency,quoteUnit:row.quoteUnit,provider:'marketstack',apiVersion:history.apiVersion||'v2',kind:'EOD_CLOSE',
  basis:history.adjustmentStatus?.verified===true?'SPLIT_ADJUSTED':'PROVIDER_REPORTED_UNVERIFIED',sourceEvidence:history.sourceEvidence,
  asOf:last,expectedSession,retrievedAt:history.retrievedAt||null,freshness:history.cacheOnly===true?'STALE_CACHE':expectedSession?(last===expectedSession?'CURRENT':'STALE'):'UNKNOWN',
  changeVerified:history.changeVerified===true&&history.adjustmentStatus?.verified===true,quality:history.quality||{status:'PARTIAL',reason:'UNKNOWN_ADJUSTMENT_BASIS'},points};
}
export function materialize({rows,histories={},asOf,referenceAsOf=asOf,expectedSessions={},out,disabled=false}){
 out=resolve(out);if(!disabled)assertPrivateOutput(out);else rejectSymlinkAncestors(out);
 const d=directory(disabled?[]:rows,referenceAsOf,asOf),series={};
 for(const r of d.listings)if(histories[r.listingId])series[r.listingId]=closeSeries(r,histories[r.listingId],{asOf,expectedSession:expectedSessions[r.mic]||null});
 const target=join(out,'core/data/de-eu');rejectSymlinkAncestors(target);rejectSymlinkAncestors(target+'.previous');mkdirSync(dirname(target),{recursive:true});
 const stage=mkdtempSync(join(dirname(target),'.de-eu-stage-'));
 const write=(p,v)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(v)+'\n');};
 write(join(stage,'listings.json'),d);for(const [id,s]of Object.entries(series))write(join(stage,'series',id+'.json'),s);
 const backup=target+'.previous';if(existsSync(backup))throw Error('PUBLISH_RECOVERY_REQUIRED');
 const prior=existsSync(target);if(prior)renameSync(target,backup);
 try{renameSync(stage,target);}catch(e){if(prior)renameSync(backup,target);throw e;}
 if(prior)rmSync(backup,{recursive:true,force:true});
 return {listings:d.listings.length,series:Object.keys(series).length,privateDevelopment:true,publicDisplay:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3),out=arg('out'),asOf=arg('as-of');
 if(!out||!asOf)throw Error('EXPLICIT_OUTPUT_AND_AS_OF_REQUIRED');const disabled=process.argv.includes('--disabled');
 const input=disabled?{}:JSON.parse(readFileSync(arg('input'),'utf8'));
 console.log(JSON.stringify(materialize({...input,rows:input.rows||[],out,asOf,disabled})));
}
