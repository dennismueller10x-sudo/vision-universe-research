/** Incremental, private Tiingo evidence. Never writes canonical or SEC data. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Quality=require('../../quant/engines/market-quality.js');
const Factors=require('../../quant/engines/market-factors.js');
export const EVIDENCE_RULE='tiingo2-evidence-1';
const sha=x=>createHash('sha256').update(x).digest('hex');
function atomic(file,value){mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(value));renameSync(file+'.tmp',file);}
export function normalizeBars(rows){
 if(!Array.isArray(rows))throw Error('INVALID_PRICE_RESPONSE');
 const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
 return rows.map(r=>({date:String(r.date||'').slice(0,10),open:number(r.open),high:number(r.high),low:number(r.low),close:number(r.close),volume:number(r.volume),
  adjustedOpen:number(r.adjOpen),adjustedHigh:number(r.adjHigh),adjustedLow:number(r.adjLow),adjustedClose:number(r.adjClose),adjustedVolume:number(r.adjVolume),
  splitFactor:number(r.splitFactor),dividend:number(r.divCash),currency:null,adjustmentStatus:'adjusted'}));
}
export function assessEvidence(rows,{ticker,today,currency,metadata={}}){
 const bars=normalizeBars(rows),payload={ticker,bars,adjustmentStatus:'adjusted',provenance:{provider:'tiingo',fetchedAt:today}},
  validation=Quality.validateBars(bars,{today,adjustmentStatus:'adjusted'}),adjustment=Quality.validateAdjustmentConsistency(bars,{claimedStatus:'TOTAL_RETURN'}),
  actions=Quality.classifyCorporateActions?Quality.classifyCorporateActions(bars):{ok:false,status:'UNKNOWN',events:[],counts:{}},
  quality=Quality.assessSeries(payload,{today});
 const last=bars.at(-1), valid=validation.ok&&bars.length>0&&validation.bars.length===bars.length,
  latestValid=!!last&&[last.open,last.high,last.low,last.close].every(x=>typeof x==='number'&&x>0)&&last.high>=Math.max(last.open,last.close,last.low)&&last.low<=Math.min(last.open,last.close),
  caValid=adjustment.ok&&actions.ok===true;
 let factors=null;
 if(valid&&latestValid&&caValid)factors=Factors.computeFactors(payload,{module:'quantV2Momentum'});
 // Actual calculations remain private: public reports carry field status, never prices.
 const factorSummary=factors?{status:factors.status,bars:factors.bars,basis:factors.basis,fieldStatus:factors.fieldStatus}:null;
 return {metadata:{ticker:metadata.ticker||ticker,name:metadata.name||null,exchange:metadata.exchangeCode||metadata.exchange||null,startDate:metadata.startDate||null,endDate:metadata.endDate||null},
  price:{historyValid:valid,latestValid,latestDate:last?.date||null,bars:bars.length,firstDate:bars[0]?.date||null,currency:currency||null,corporateActionValid:caValid,quality:quality.status,
   findingCodes:[...new Set([...validation.findings,...adjustment.findings,...quality.findings].map(x=>x.code))]},
  corporateActions:{ok:actions.ok,status:actions.status,counts:actions.counts,events:(actions.events||[]).map(e=>({date:e.date,status:e.status||e.classification,classification:e.classification||e.status}))},
  marketFactors:{materialized:!!factors&&factors.status!=='UNAVAILABLE',basisValid:caValid,summary:factorSummary},
  source:{provider:'tiingo',rule:EVIDENCE_RULE,observedAt:today,responseSha256:sha(JSON.stringify(rows))}};
}
export async function collectEvidence(candidates,{workDir,today,apiKey=process.env.TIINGO_API_KEY,fetchImpl=fetch,maxSymbols=600,onProgress=()=>{}}){
 if(!Number.isInteger(maxSymbols)||maxSymbols<0||maxSymbols>1000)throw Error('INVALID_SYMBOL_BUDGET');
 const results=new Map(), unique=new Map();
 for(const c of candidates)if(!unique.has(c.ticker))unique.set(c.ticker,c);
 let requests=0,completed=0,probed=0,stopped=null;
 for(const candidate of unique.values()){
  const ticker=candidate.ticker;
  if(!/^[A-Z0-9._-]+$/.test(ticker))throw Error('INVALID_PROVIDER_SYMBOL');
  const key=sha(JSON.stringify({ticker,today,start:candidate.startDate||candidate.start_date||null,rule:EVIDENCE_RULE})),file=join(workDir,'evidence',key+'.json');
  if(existsSync(file)){const cached=JSON.parse(readFileSync(file,'utf8'));if(cached.key!==key)throw Error('EVIDENCE_CACHE_MISMATCH');results.set(ticker,cached.summary);completed++;continue;}
  if(probed>=maxSymbols){stopped='SYMBOL_BUDGET_REACHED';continue;}
  if(!apiKey){results.set(ticker,{state:'NOT_PROBED',reason:'TIINGO_CREDENTIAL_NOT_CONFIGURED'});completed++;continue;}
  try{
   probed++;
   const call=async path=>{requests++;const response=await fetchImpl('https://api.tiingo.com'+path,{headers:{Authorization:'Token '+apiKey,Accept:'application/json'},signal:AbortSignal.timeout(60000)});
    if([401,403,429].includes(response.status)){const error=Error('PROVIDER_STOP_'+response.status);error.stop=true;throw error;}
    if(!response.ok)throw Error('PROVIDER_HTTP_'+response.status);return response.json();};
   const meta=await call('/tiingo/daily/'+encodeURIComponent(ticker));
   // Query the candidate listing period, so a recycled ticker never imports its old issuer history.
   const start=candidate.startDate||candidate.start_date||meta.startDate;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start||''))throw Error('LISTING_PERIOD_MISSING');
   const rows=await call('/tiingo/daily/'+encodeURIComponent(ticker)+'/prices?startDate='+start+'&endDate='+today+'&resampleFreq=daily');
   const summary=assessEvidence(rows,{ticker,today,currency:candidate.currency,metadata:meta});
   atomic(file,{key,metadata:meta,rows,summary});results.set(ticker,summary);completed++;onProgress({completed,requests,ticker});
  }catch(error){results.set(ticker,{state:'NOT_PROBED',reason:error.stop?error.message:'PROVIDER_EVIDENCE_FAILED'});completed++;if(error.stop){stopped=error.message;break;}}
 }
 return {results,requests,completed,pending:unique.size-completed,stopped};
}
