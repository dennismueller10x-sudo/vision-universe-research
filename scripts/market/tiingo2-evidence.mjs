/** Incremental, private Tiingo evidence. Never writes canonical or SEC data. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Quality=require('../../quant/engines/market-quality.js');
const Factors=require('../../quant/engines/market-factors.js');
export const EVIDENCE_RULE='tiingo2-evidence-5';
const sha=x=>createHash('sha256').update(x).digest('hex');
function atomic(file,value){mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(value));renameSync(file+'.tmp',file);}
const priceColumns=['adjOpen','adjHigh','adjLow','adjClose'];
const rawColumns=['open','high','low','close','volume','splitFactor','divCash'];
const barDate=row=>String(row?.date||'').slice(0,10);
const closeRatio=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(Math.abs(a),Math.abs(b),1e-12);
/** Rebase cached adjusted values only when authoritative overlap demonstrates
 * one historical price multiplier and one volume multiplier. Raw revisions,
 * missing overlap and changes in listing generation require a full refetch. */
export function mergeIncrementalRows(previous, refreshed, overlapStart){
 if(!Array.isArray(previous)||!previous.length||!Array.isArray(refreshed)||!refreshed.length)return {ok:false,reason:'MISSING_OVERLAP'};
 const ordered=rows=>rows.every((r,i)=>/^\d{4}-\d{2}-\d{2}$/.test(barDate(r))&&(!i||barDate(rows[i-1])<barDate(r)));
 if(!ordered(previous)||!ordered(refreshed)||refreshed.some(r=>barDate(r)<overlapStart))return {ok:false,reason:'INVALID_OVERLAP_ORDER'};
 const fresh=new Map(refreshed.map(r=>[barDate(r),r])),overlap=previous.filter(r=>barDate(r)>=overlapStart);
 if(!overlap.length)return {ok:false,reason:'MISSING_OVERLAP'};
 let priceMultiplier=null,volumeMultiplier=null;
 for(const old of overlap){
  const current=fresh.get(barDate(old));if(!current)return {ok:false,reason:'MISSING_OVERLAP'};
  if(rawColumns.some(k=>old[k]!==current[k]))return {ok:false,reason:'RAW_OVERLAP_REVISED'};
  for(const column of priceColumns){
   if(!Number.isFinite(old[column])||old[column]<=0||!Number.isFinite(current[column])||current[column]<=0)return {ok:false,reason:'INVALID_ADJUSTED_OVERLAP'};
   const multiplier=current[column]/old[column];
   if(priceMultiplier===null)priceMultiplier=multiplier;
   else if(!closeRatio(multiplier,priceMultiplier))return {ok:false,reason:'NONCONSTANT_PRICE_ADJUSTMENT'};
  }
  if(!Number.isFinite(old.adjVolume)||old.adjVolume<0||!Number.isFinite(current.adjVolume)||current.adjVolume<0)return {ok:false,reason:'INVALID_VOLUME_OVERLAP'};
  if(old.adjVolume===0){if(current.adjVolume!==0)return {ok:false,reason:'NONCONSTANT_VOLUME_ADJUSTMENT'};}
  else{
   const multiplier=current.adjVolume/old.adjVolume;
   if(multiplier<=0)return {ok:false,reason:'INVALID_VOLUME_OVERLAP'};
   if(volumeMultiplier===null)volumeMultiplier=multiplier;
   else if(!closeRatio(multiplier,volumeMultiplier))return {ok:false,reason:'NONCONSTANT_VOLUME_ADJUSTMENT'};
  }
 }
 // All-zero overlap volume cannot establish a historical volume multiplier.
 if(volumeMultiplier===null&&previous.some(r=>barDate(r)<overlapStart&&r.adjVolume!==0))return {ok:false,reason:'VOLUME_ADJUSTMENT_UNRESOLVED'};
 volumeMultiplier??=1;
 const older=previous.filter(r=>barDate(r)<overlapStart).map(r=>({...r,...Object.fromEntries(priceColumns.map(k=>[k,r[k]*priceMultiplier])),adjVolume:r.adjVolume*volumeMultiplier}));
 if(previous.some(r=>barDate(r)<overlapStart&&(priceColumns.some(k=>!Number.isFinite(r[k])||r[k]<=0)||!Number.isFinite(r.adjVolume)||r.adjVolume<0)))return {ok:false,reason:'INVALID_CACHED_ADJUSTMENTS'};
 if(older.some(r=>priceColumns.some(k=>!Number.isFinite(r[k])||r[k]<=0)||!Number.isFinite(r.adjVolume)||r.adjVolume<0))return {ok:false,reason:'INVALID_REBASED_HISTORY'};
 return {ok:true,rows:[...older,...refreshed],priceMultiplier,volumeMultiplier,overlapBars:overlap.length};
}
export function normalizeBars(rows){
 if(!Array.isArray(rows))throw Error('INVALID_PRICE_RESPONSE');
 const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
 return rows.map(r=>({date:String(r.date||'').slice(0,10),open:number(r.open),high:number(r.high),low:number(r.low),close:number(r.close),volume:number(r.volume),
  adjustedOpen:number(r.adjOpen),adjustedHigh:number(r.adjHigh),adjustedLow:number(r.adjLow),adjustedClose:number(r.adjClose),adjustedVolume:number(r.adjVolume),
  splitFactor:number(r.splitFactor),dividend:number(r.divCash),currency:null,adjustmentStatus:'adjusted'}));
}
export function assessEvidence(rows,{ticker,today,currency,metadata={}}){
 const bars=normalizeBars(rows),payload={ticker,bars,adjustmentStatus:'adjusted',provenance:{provider:'tiingo',fetchedAt:today}},
  validation=Quality.validateBars(bars,{today,adjustmentStatus:'adjusted'}),adjustment=Quality.validateAdjustmentConsistency(bars,{claimedStatus:'TOTAL_RETURN',dividendConvention:'TIINGO_REINVESTMENT_CLOSE'}),
  actions=Quality.classifyCorporateActions?Quality.classifyCorporateActions(bars,{dividendConvention:'TIINGO_REINVESTMENT_CLOSE'}):{ok:false,status:'UNKNOWN',events:[],counts:{}},
  quality=Quality.assessSeries(payload,{today,dividendConvention:'TIINGO_REINVESTMENT_CLOSE'});
 const last=bars.at(-1), valid=validation.ok&&bars.length>0&&validation.bars.length===bars.length,
  latestValid=!!last&&[last.open,last.high,last.low,last.close].every(x=>typeof x==='number'&&x>0)&&last.high>=Math.max(last.open,last.close,last.low)&&last.low<=Math.min(last.open,last.close),
  caValid=adjustment.ok&&actions.ok===true;
 const legacyFalseSplitDates=(adjustment.observed?.splitEvidence||[]).filter(e=>e.rawMovePct>=Quality.DEFAULTS.splitJumpPct&&e.adjustedMovePct>Quality.DEFAULTS.splitResidualPct).map(e=>e.date);
 let factors=null;
 if(valid&&latestValid&&caValid)factors=Factors.computeFactors(payload,{module:'quantV2Momentum'});
 // Actual calculations remain private: public reports carry field status, never prices.
 const factorSummary=factors?{status:factors.status,bars:factors.bars,basis:factors.basis,fieldStatus:factors.fieldStatus}:null;
 return {metadata:{ticker:metadata.ticker||ticker,name:metadata.name||null,securityDescription:metadata.description||null,exchange:metadata.exchangeCode||metadata.exchange||null,startDate:metadata.startDate||null,endDate:metadata.endDate||null},
  price:{historyValid:valid,latestValid,corporateActionFixed:caValid&&legacyFalseSplitDates.length>0,legacySplitGateFalseRejectionCorrected:adjustment.ok&&legacyFalseSplitDates.length>0,legacyFalseSplitDates,latestDate:last?.date||null,bars:bars.length,firstDate:bars[0]?.date||null,currency:currency||null,corporateActionValid:caValid,quality:quality.status,
   findingCodes:[...new Set([...validation.findings,...adjustment.findings,...quality.findings].map(x=>x.code))]},
  corporateActions:{ok:actions.ok,status:actions.status,counts:actions.counts,events:(actions.events||[]).map(e=>({date:e.date,status:e.status||e.classification,classification:e.classification||e.status,reason:e.reason,evidence:e.evidence}))},
  marketFactors:{materialized:!!factors&&factors.status!=='UNAVAILABLE',basisValid:caValid,summary:factorSummary},
  source:{provider:'tiingo',rule:EVIDENCE_RULE,observedAt:today,responseSha256:sha(JSON.stringify(rows))}};
}
export async function collectEvidence(candidates,{workDir,today,apiKey=process.env.TIINGO_API_KEY,fetchImpl=fetch,maxSymbols=600,onProgress=()=>{}}){
 if(!Number.isInteger(maxSymbols)||maxSymbols<0||maxSymbols>1000)throw Error('INVALID_SYMBOL_BUDGET');
 const results=new Map(), unique=new Map();
 for(const c of candidates)if(!unique.has(c.ticker))unique.set(c.ticker,c);
 const stateFile=join(workDir,'evidence-state.json'),state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{};
 const indexFile=join(workDir,'evidence-index.json'),index=existsSync(indexFile)?JSON.parse(readFileSync(indexFile,'utf8')):{};
 const listingIndexKey=c=>sha(JSON.stringify({ticker:c.ticker,exchange:c.exchange||null,start:c.startDate||c.start_date||null}));
 const indexCache=(candidate,key,cached)=>{if(!Array.isArray(cached.rows)||!cached.rows.length||!cached.metadata)return;
  const observed=cached.summary?.source?.observedAt;if(!observed||observed>today)return;
  const id=listingIndexKey(candidate);if(!index[id]||index[id].observedAt<=observed){index[id]={key,observedAt:observed,ticker:candidate.ticker,exchange:candidate.exchange||null,start:candidate.startDate||candidate.start_date||null};atomic(indexFile,index);}};
 const stateKey=c=>c.ticker+'|'+(c.startDate||c.start_date||'unknown');
 const queue=[...unique.values()].sort((a,b)=>String(state[stateKey(a)]||'').localeCompare(String(state[stateKey(b)]||'')));
 let requests=0,completed=0,probed=0,stopped=null;
 for(const candidate of queue){
  const ticker=candidate.ticker;
  if(!/^[A-Z0-9._-]+$/.test(ticker))throw Error('INVALID_PROVIDER_SYMBOL');
  const key=sha(JSON.stringify({ticker,today,start:candidate.startDate||candidate.start_date||null,rule:EVIDENCE_RULE})),file=join(workDir,'evidence',key+'.json');
  // Gate changes revalidate cached raw inputs; they do not refetch full histories.
  if(!existsSync(file))for(const rule of ['tiingo2-evidence-4','tiingo2-evidence-3','tiingo2-evidence-2','tiingo2-evidence-1']){
   const oldKey=sha(JSON.stringify({ticker,today,start:candidate.startDate||candidate.start_date||null,rule})),oldFile=join(workDir,'evidence',oldKey+'.json');
   if(!existsSync(oldFile))continue;
   const old=JSON.parse(readFileSync(oldFile,'utf8'));
   if(old.key!==oldKey)throw Error('EVIDENCE_CACHE_MISMATCH');
   if(Array.isArray(old.rows)&&old.metadata){const summary=assessEvidence(old.rows,{ticker,today,currency:candidate.currency,metadata:old.metadata});atomic(file,{key,metadata:old.metadata,rows:old.rows,summary});break;}
  }
  if(existsSync(file)){const cached=JSON.parse(readFileSync(file,'utf8'));if(cached.key!==key)throw Error('EVIDENCE_CACHE_MISMATCH');
   if(cached.metadata&&cached.summary?.metadata&&!Object.hasOwn(cached.summary.metadata,'securityDescription')){cached.summary.metadata.securityDescription=cached.metadata.description||null;atomic(file,cached);}
   indexCache(candidate,key,cached);results.set(ticker,cached.summary);completed++;continue;}
  if(probed>=maxSymbols){stopped='SYMBOL_BUDGET_REACHED';continue;}
  if(!apiKey){results.set(ticker,{state:'NOT_PROBED',reason:'TIINGO_CREDENTIAL_NOT_CONFIGURED'});completed++;continue;}
  try{
   probed++;
   const call=async path=>{requests++;const response=await fetchImpl('https://api.tiingo.com'+path,{headers:{Authorization:'Token '+apiKey,Accept:'application/json'},signal:AbortSignal.timeout(60000)});
    if([401,403,429].includes(response.status)){const error=Error('PROVIDER_STOP_'+response.status);error.stop=true;throw error;}
    if(!response.ok){const error=Error('PROVIDER_HTTP_'+response.status);error.terminal=[400,404,410,422].includes(response.status);throw error;}return response.json();};
   const meta=await call('/tiingo/daily/'+encodeURIComponent(ticker));
   // Query the candidate listing period, so a recycled ticker never imports its old issuer history.
   const start=candidate.startDate||candidate.start_date||meta.startDate;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start||''))throw Error('LISTING_PERIOD_MISSING');
   const getRows=from=>call('/tiingo/daily/'+encodeURIComponent(ticker)+'/prices?startDate='+from+'&endDate='+today+'&resampleFreq=daily');
   let rows,fetchMode='FULL_LISTING_HISTORY',incremental=null;
   const priorIndex=index[listingIndexKey(candidate)];
   const exchangeMatches=m=>!candidate.exchange||String(m.exchangeCode||m.exchange||'').toUpperCase()===String(candidate.exchange).toUpperCase();
   if(priorIndex&&priorIndex.observedAt<today&&meta.startDate===start&&String(meta.ticker||ticker).toUpperCase()===ticker&&exchangeMatches(meta)){
    if(!/^[a-f0-9]{64}$/.test(priorIndex.key))throw Error('EVIDENCE_INDEX_MISMATCH');
    const priorFile=join(workDir,'evidence',priorIndex.key+'.json');
    if(existsSync(priorFile)){
     const prior=JSON.parse(readFileSync(priorFile,'utf8'));
     if(prior.key!==priorIndex.key)throw Error('EVIDENCE_CACHE_MISMATCH');
     if(Array.isArray(prior.rows)&&prior.rows.length&&prior.metadata?.startDate===start&&String(prior.metadata?.ticker||ticker).toUpperCase()===ticker&&exchangeMatches(prior.metadata)){
      const overlapStart=barDate(prior.rows[Math.max(0,prior.rows.length-5)]);
      const refreshed=await getRows(overlapStart),merged=mergeIncrementalRows(prior.rows,refreshed,overlapStart);
      if(merged.ok){rows=merged.rows;fetchMode='INCREMENTAL_REBASED';incremental={overlapStart,overlapBars:merged.overlapBars,priceMultiplier:merged.priceMultiplier,volumeMultiplier:merged.volumeMultiplier};}
      else{fetchMode='FULL_FALLBACK';incremental={overlapStart,fallbackReason:merged.reason};}
     }
    }
   }
   if(!rows)rows=await getRows(start);
   const summary=assessEvidence(rows,{ticker,today,currency:candidate.currency,metadata:meta});
   summary.source.fetchMode=fetchMode;summary.source.incremental=incremental;
   const cached={key,metadata:meta,rows,summary};atomic(file,cached);indexCache(candidate,key,cached);results.set(ticker,summary);state[stateKey(candidate)]=today;atomic(stateFile,state);completed++;onProgress({completed,requests,ticker});
  }catch(error){const summary={state:'NOT_PROBED',reason:/^PROVIDER_HTTP_\d+$|^PROVIDER_STOP_\d+$|^LISTING_PERIOD_MISSING$/.test(error.message)?error.message:'PROVIDER_EVIDENCE_FAILED'};
   results.set(ticker,summary);completed++;if(error.terminal)atomic(file,{key,summary});
   if(!error.stop){state[stateKey(candidate)]=today;atomic(stateFile,state);}if(error.stop){stopped=error.message;break;}}
 }
 return {results,requests,completed,pending:unique.size-completed,stopped};
}
