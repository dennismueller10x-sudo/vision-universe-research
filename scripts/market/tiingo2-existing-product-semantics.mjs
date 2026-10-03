/** Fail-closed semantic diff of existing consumer payloads. Additive members
 * may change ranks; prices, fundamentals, eligibility and signal evidence
 * cannot be relabeled as a population change. */
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';

const read=path=>{const bytes=readFileSync(path);return JSON.parse(path.endsWith('.gz')?gunzipSync(bytes):bytes);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const numeric=value=>value===null||typeof value==='number'&&Number.isFinite(value);
const DISCOVER_RANK_FIELDS=new Set([
 '/ranks/leadershipPercentile','/ranks/momentumPercentile','/ranks/relativeStrengthPercentile',
 '/ranks/sector/rank','/ranks/sector/of','/ranks/universeSize',
 '/metrics/leadershipPercentile','/metrics/momentumPercentile','/metrics/relativeStrengthPercentile'
]);
const SCREENER_POPULATION_COLUMNS=new Set(['rsPct','momPct']);
function validPercentileShift(left,right,{addedCount,beforePopulation}){
 if(!Number.isFinite(left)||!Number.isFinite(right)||left<0||left>100||right<0||right>100||
    !Number.isInteger(addedCount)||addedCount<0||!Number.isInteger(beforePopulation)||beforePopulation<1)return false;
 const bound=addedCount===0?0:100*addedCount/beforePopulation+0.02;
 return Math.abs(right-left)<=bound;
}
export function compareDiscoverExistingPayload(before,after,{addedCount=0}={}){
 const forbidden=[],allowed=[],shifts=[],beforePopulation=before.ranks?.universeSize;
 const visit=(left,right,path='')=>{
  if(equal(left,right))return;
  if(DISCOVER_RANK_FIELDS.has(path)&&numeric(left)&&numeric(right)){
   let valid=false;
   if(path==='/ranks/universeSize'||path==='/ranks/sector/of'||path==='/ranks/sector/rank')
    valid=Number.isInteger(left)&&Number.isInteger(right)&&right>=left&&right-left<=addedCount;
   else valid=validPercentileShift(left,right,{addedCount,beforePopulation});
   if(valid){allowed.push(path);shifts.push({field:path,before:left,after:right,delta:right-left});return;}
  }
  if(path==='/updatedAt'&&typeof left==='string'&&typeof right==='string'&&Number.isFinite(Date.parse(left))&&
    Number.isFinite(Date.parse(right))&&Date.parse(right)>=Date.parse(left)){allowed.push(path);return;}
  if(left&&right&&typeof left==='object'&&typeof right==='object'&&!Array.isArray(left)&&!Array.isArray(right)){
   for(const key of new Set([...Object.keys(left),...Object.keys(right)]))visit(left[key],right[key],path+'/'+key);
   return;
  }
  if(forbidden.length<20)forbidden.push(path||'/');
 };
 visit(before,after);
 return {status:forbidden.length?'BLOCKED':'PASS',allowed,forbidden,
  largestPopulationShifts:shifts.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,8)};
}
export function compareTechnicalExistingPayload(before,after,{allowedNewTickers=[],verifiedDna=false}={}){
 const allowedNew=new Set(allowedNewTickers),forbidden=[];
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]))
  if(!['schemaVersion','shard','generatedAt','instruments','unavailableSchemaVersion','unavailable'].includes(key))forbidden.push('/unknown-top-level/'+key);
 for(const key of ['schemaVersion','shard','unavailableSchemaVersion'])if(!equal(before[key],after[key]))forbidden.push('/'+key);
 const oldInstruments=before.instruments??{},newInstruments=after.instruments??{},
  oldUnavailable=before.unavailable??{},newUnavailable=after.unavailable??{};
 for(const [ticker,row] of Object.entries(oldInstruments))if(!equal(row,newInstruments[ticker]))forbidden.push('/instruments/'+ticker);
 for(const [ticker,row] of Object.entries(oldUnavailable))if(!equal(row,newUnavailable[ticker])&&
  !(verifiedDna&&ticker==='DNA'&&newInstruments[ticker]&&oldInstruments[ticker]===undefined))forbidden.push('/unavailable/'+ticker);
 for(const ticker of Object.keys(newInstruments))if(!(ticker in oldInstruments)&&!allowedNew.has(ticker)&&!(verifiedDna&&ticker==='DNA'))forbidden.push('/new-instrument/'+ticker);
 for(const ticker of Object.keys(newUnavailable))if(!(ticker in oldUnavailable)&&!allowedNew.has(ticker))forbidden.push('/new-unavailable/'+ticker);
 return {status:forbidden.length?'BLOCKED':'PASS',allowed:['/generatedAt','/new-scoped-members'],forbidden:forbidden.slice(0,20)};
}
export function compareSignalExistingPayload(before,after,{allowedNewTickers=[]}={}){
 const allowedNew=new Set(allowedNewTickers),forbidden=[];
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]))
  if(!['schemaVersion','generatedAt','lookback','scope','results','events','counts'].includes(key))forbidden.push('/unknown-top-level/'+key);
 for(const key of ['schemaVersion','lookback','scope'])if(!equal(before[key],after[key]))forbidden.push('/'+key);
 const oldResults=new Map((before.results??[]).map(row=>[row.ticker,row])),newResults=new Map((after.results??[]).map(row=>[row.ticker,row]));
 if(oldResults.size!==(before.results??[]).length||newResults.size!==(after.results??[]).length)forbidden.push('/duplicate-result');
 for(const [ticker,row] of oldResults)if(!equal(row,newResults.get(ticker)))forbidden.push('/results/'+ticker);
 for(const ticker of newResults.keys())if(!oldResults.has(ticker)&&!allowedNew.has(ticker))forbidden.push('/new-result/'+ticker);
 const oldEvents=new Map((before.events??[]).map(row=>[row.id,row])),newEvents=new Map((after.events??[]).map(row=>[row.id,row]));
 if(oldEvents.size!==(before.events??[]).length||newEvents.size!==(after.events??[]).length)forbidden.push('/duplicate-event');
 for(const [id,row] of oldEvents)if(!equal(row,newEvents.get(id)))forbidden.push('/events/'+id);
 for(const [id,row] of newEvents)if(!oldEvents.has(id)&&!allowedNew.has(row.ticker))forbidden.push('/new-event/'+id);
 if(after.counts?.requested!==after.results?.length||after.counts?.available+after.counts?.unavailable!==after.counts?.requested)
  forbidden.push('/counts');
 return {status:forbidden.length?'BLOCKED':'PASS',allowed:['/generatedAt','/counts','/new-scoped-results-events'],forbidden:forbidden.slice(0,20)};
}
export function compareTechnicalSummaryExistingPayload(before,after,{allowedNewTickers=[],verifiedDna=false}={}){
 const allowedNew=new Set(allowedNewTickers),forbidden=[];
 for(const key of ['schemaVersion','source','artifacts'])if(!equal(before[key],after[key]))forbidden.push('/'+key);
 const oldRows=before.rows??{},newRows=after.rows??{};
 for(const [ticker,row] of Object.entries(oldRows))if(!equal(row,newRows[ticker])&&!(verifiedDna&&ticker==='DNA'))forbidden.push('/rows/'+ticker);
 for(const ticker of Object.keys(newRows))if(!(ticker in oldRows)&&!allowedNew.has(ticker))forbidden.push('/new-row/'+ticker);
 return {status:forbidden.length?'BLOCKED':'PASS',allowed:['/generatedAt','/counts','/reasons','/incremental','/new-scoped-rows'],forbidden:forbidden.slice(0,20)};
}
export function compareScreenerExistingPayload(before,after,{addedCount=0}={}){
 const forbidden=[],allowed=[],shifts=[],oldCols=before.cols??{},newCols=after.cols??{},oldSymbols=oldCols.s??[],newSymbols=newCols.s??[],
  newIndex=new Map(newSymbols.map((ticker,index)=>[ticker,index]));
 if(newIndex.size!==newSymbols.length)forbidden.push('/duplicate-symbol');
 if(!equal(before.columns,after.columns))forbidden.push('/columns');
 const baselineColumns=before.columns??Object.keys(oldCols);
 for(let index=0;index<oldSymbols.length;index++){
  const ticker=oldSymbols[index],next=newIndex.get(ticker);
  if(next===undefined){forbidden.push('/missing/'+ticker);continue;}
  for(const column of baselineColumns){const path='/'+ticker+'/'+column,left=oldCols[column]?.[index],right=newCols[column]?.[next];
   if(equal(left,right))continue;
   if(SCREENER_POPULATION_COLUMNS.has(column)&&validPercentileShift(left,right,{addedCount,beforePopulation:oldSymbols.length})){
    allowed.push(path);shifts.push({ticker,field:column,before:left,after:right,delta:right-left});continue;}
   if(forbidden.length<20)forbidden.push(path);
  }
 }
 return {status:forbidden.length?'BLOCKED':'PASS',allowed:allowed.slice(0,20),allowedCount:allowed.length,forbidden,
  largestPopulationShifts:shifts.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,12)};
}
export function compareChangedExistingProductFiles({root,shadow,stage,baselineScreener,verifiedDna=false}){
 const scope=new Set((stage.additions??[]).map(row=>row.ticker)),findings=[],comparisons=[];
 const screenerPath='screener/data/universe-US_REAL.json',shadowScreener=join(shadow,screenerPath);
 if(!existsSync(shadowScreener))findings.push({name:'EXISTING_PRODUCT_PAYLOAD_MISSING',path:screenerPath});
 else{
  const result=compareScreenerExistingPayload(baselineScreener,read(shadowScreener),{addedCount:scope.size});
  comparisons.push({path:screenerPath,status:result.status,allowedCount:result.allowedCount,
   allowedSample:result.allowed.slice(0,12),largestPopulationShifts:result.largestPopulationShifts,forbidden:result.forbidden});
  if(result.status!=='PASS')findings.push({name:'EXISTING_PRODUCT_SEMANTIC_CHANGE',path:screenerPath,fields:result.forbidden});
 }
 for(const file of stage.files??[]){
  if(!file.projection||file.baselineSha256===null||file.baselineSha256===file.stagedSha256)continue;
  const path=file.path,source=join(root,path),target=join(shadow,path);
  if(path===screenerPath)continue;
  if(!existsSync(source)||!existsSync(target)){findings.push({name:'EXISTING_PRODUCT_PAYLOAD_MISSING',path});continue;}
  let result=null;
  if(/^discover\/data\/stocks\/US_REAL\/[A-Z0-9._-]+\.json$/.test(path)){
   result=compareDiscoverExistingPayload(read(source),read(target),{addedCount:scope.size});
  }else if(/^quant\/data\/product\/technical-signals-v1\/[A-Z0-9_-]{2}\.json\.gz$/.test(path))
   result=compareTechnicalExistingPayload(read(source),read(target),{allowedNewTickers:[...scope],verifiedDna});
  else if(/^quant\/data\/product\/technical-signals-v1\/signals-(?:5|20|60)\.json\.gz$/.test(path))
   result=compareSignalExistingPayload(read(source),read(target),{allowedNewTickers:[...scope]});
  else if(path==='quant/data/product/technical-signals-v1/summary.json')
   result=compareTechnicalSummaryExistingPayload(read(source),read(target),{allowedNewTickers:[...scope],verifiedDna});
  if(!result)continue;
  comparisons.push({path,status:result.status,allowedCount:result.allowedCount??result.allowed.length,
   allowedSample:result.allowed.slice(0,12),largestPopulationShifts:result.largestPopulationShifts??[],forbidden:result.forbidden});
  if(result.status!=='PASS')findings.push({name:'EXISTING_PRODUCT_SEMANTIC_CHANGE',path,fields:result.forbidden});
 }
 return {status:findings.length?'BLOCKED':'PASS',comparisons,findings};
}
