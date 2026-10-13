// Separate source-construction diagnostics. Original tournament definitions are untouched.
const positive = x => Number.isFinite(x) && x > 0;
const mean = xs => xs.reduce((s,x)=>s+x,0)/xs.length;
const validDate = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const dayDistance = (a,b) => (Date.parse(a)-Date.parse(b))/86400000;
function monthEndBefore(date,n){if(!n)return date;const d=new Date(date+'T00:00:00Z');return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-n+1,0)).toISOString().slice(0,10);}
function anchor(rows,date){let lo=0,hi=rows.length;while(lo<hi){const m=(lo+hi)>>1;if(rows[m].date<=date)lo=m+1;else hi=m;}return rows[lo-1];}
function weekKey(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1);return d.toISOString().slice(0,10);}
function deepFreeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(deepFreeze);Object.freeze(x);}return x;}
const sources={JT:{id:'JT1993',url:'https://www.bauer.uh.edu/rsusmel/phd/jegadeesh-titman93.pdf',locator:'pp.68–69, Table I Panel A; published monthly rebalanced returns'},GH:{id:'GH2004',url:'https://www.bauer.uh.edu/TGeorge/papers/gh4-paper.pdf',locator:'pp.2148–2149 Table I/footnote3; six cohorts, no skip'},LV:{id:'LV2007',url:'https://repub.eur.nl/pub/10460/ERS-2007-044-F%26A.pdf',locator:'inner April2007 pp.3–4, p.7 US risk effect'},RF:{id:'FRENCH_DAILY_RF',url:'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip',locator:'RF daily decimal after single percent conversion; observed ex-post snapshot through2026-08-31'}};
const common={classification:'SOURCE_RECIPE_TRANSFER_OBSERVED_ONLY',originalReplication:false,maximumSourceInterpretiveGrade:'PARTIAL',universe:'SUPPLIED_OBSERVED_US_EQUITY_PANEL_NOT_ORIGINAL_CRSP_FTSE',priceFloor:null,liquidityFloor:null,maxPositions:null,maxWeight:null,stopLoss:null,cashBuffer:0,shorts:false,leverage:false,execution:'NEXT_SESSION_OPEN',tieBreak:'SECURITY_ID_ASCENDING',quantileRounding:'CEIL',riskSizing:false};
function method(id,kind,fraction,cohortMonths,source){return deepFreeze({id,version:'1.0.0',kind,parameters:{selectionFraction:fraction,formationMonths:kind==='JT'?6:kind==='GH'?12:kind==='LOW_VOL'?36:0,holdingMonths:cohortMonths},sources:source,portfolioSemantics:{...common,rebalance:'MONTHLY',cohortMonths,weighting:'EQUAL_WEIGHT_WITHIN_FIXED_MEMBERSHIP_COHORT',monthlyRestoration:true,warmstart:cohortMonths===6?'SIX_JULY_DECEMBER_2017_FORMATIONS_BEFORE_JANUARY_2018':'PRIOR_MONTH_FORMATION',spread:'ARITHMETIC_TOP_LONG_MINUS_BOTTOM_LONG_NOT_FUNDED_ACCOUNT'},formalizations:['Observed universe, next-open execution and exact cost layer are declared research conventions.','Ceil quantile counts and stable-ID tie breaks are source-unspecified operational choices.','Missing source universe/rank oracle blocks exact original magnitude certification.',...(kind==='GH'?['Split-adjusted close maximum fixes the source-unspecified daily high-price convention.']:[]),...(kind==='LOW_VOL'?['Weekly log-relative return is log(stock TR ratio) minus sum(log1p(exact daily RF)).','ISO-week last observed session including partial formation week; sample ddof1; original source does not unambiguously specify these conventions.','French daily RF is ex-post observed, not certified identical to original Datastream local RF. Missing RF is unavailable, never zero-filled.']:[])],evaluate(context){return evaluateReference(this,context);}});}
export const referenceMethods=deepFreeze([
 method('CALIB_JT6_6_NO_SKIP','JT',0.1,6,[sources.JT]),
 method('CALIB_GH52WH','GH',0.3,6,[sources.GH]),
 method('CALIB_EQUAL_WEIGHT','EW',1,1,[]),
 method('CALIB_LOW_VOL','LOW_VOL',0.1,1,[sources.LV,sources.RF]),
]);
export function getReferenceMethod(id){const m=referenceMethods.find(x=>x.id===id);if(!m)throw Error('UNKNOWN_CALIBRATION_METHOD');return m;}
function history(s,asOf){
 if(typeof s?.id!=='string'||!s.id||!Array.isArray(s.bars))throw Error('INVALID_SECURITY');
 const bars=s.bars.filter(b=>typeof b?.date==='string'&&b.date<=asOf);
 if(bars.some((b,i)=>!validDate(b.date)||(i&&bars[i-1].date>=b.date)))throw Error('INVALID_HISTORY_ORDER');
 if(bars.at(-1)?.date!==asOf)throw Error('NO_FORMATION_DATE_BAR');
 if(s.dataQuarantine?.from<=asOf)throw Error('DATA_QUARANTINE');
 if(s.terminal?.date<=asOf)throw Error('TERMINAL_ALREADY_REACHED');
 return bars;
}
function endpoint(rows,date){const b=anchor(rows,date);if(!b||dayDistance(date,b.date)>7||!positive(b.totalReturnIndex))throw Error('MISSING_TOTAL_RETURN_ENDPOINT');return b;}
function prepareRiskFree(context){
 if(!Array.isArray(context.riskFreeDaily)||!Array.isArray(context.sessionCalendar))throw Error('RF_CONTRACT_REQUIRED');
 const known=context.riskFreeDaily.filter(r=>typeof r?.date==='string'&&r.date<=context.asOf),map=new Map();
 for(const r of known){if(!validDate(r.date)||map.has(r.date)||!Number.isFinite(r.returnDecimal)||r.returnDecimal<=-1||r.sourceId!=='FRENCH_DAILY_RF')throw Error('INVALID_RF_OBSERVATION');map.set(r.date,r.returnDecimal);}
 const sessions=context.sessionCalendar.filter(d=>d<=context.asOf);
 if(sessions.some((d,i)=>!validDate(d)||(i&&sessions[i-1]>=d)))throw Error('INVALID_RF_SESSION_CALENDAR');
 const dates=[],sums=[0],missing=[0];for(const d of sessions){dates.push(d);sums.push(sums.at(-1)+(map.has(d)?Math.log1p(map.get(d)):0));missing.push(missing.at(-1)+(map.has(d)?0:1));}
 const upper=date=>{let lo=0,hi=dates.length;while(lo<hi){const m=(lo+hi)>>1;if(dates[m]<=date)lo=m+1;else hi=m;}return lo;};
 return(a,b)=>{const start=upper(a),end=upper(b);if(!end||dates[end-1]!==b||end<=start||missing[end]!==missing[start])throw Error('MISSING_EXACT_DAILY_RF');return sums[end]-sums[start];};
}
function score(method,rows,asOf,rf){
 if(method.kind==='EW'){if(!positive(rows.at(-1).close)||!positive(rows.at(-1).totalReturnIndex))throw Error('INVALID_FORMATION_PRICE');return{score:0,trace:{rule:'WHOLE_ELIGIBLE_UNIVERSE_EQUAL_WEIGHT'}};}
 if(method.kind==='JT'){
  const points=[];for(let m=6;m>=0;m--)points.push(endpoint(rows,monthEndBefore(asOf,m)));
  return{score:points.at(-1).totalReturnIndex/points[0].totalReturnIndex-1,trace:{rule:'JT_SIX_MONTH_TOTAL_RETURN_NO_SKIP',dates:points.map(b=>b.date)}};
 }
 if(method.kind==='GH'){
  const cutoff=monthEndBefore(asOf,12),start=anchor(rows,cutoff),window=rows.filter(b=>b.date>cutoff);
  if(!start||dayDistance(cutoff,start.date)>7)throw Error('MISSING_HIGH_PRICE_ANCHOR');
  if(window.some(b=>!positive(b.close))||[start,...window].some((b,i,a)=>i&&dayDistance(b.date,a[i-1].date)>10))throw Error('INCOMPLETE_HIGH_PRICE_HISTORY');
  const high=Math.max(...window.map(b=>b.close));return{score:window.at(-1).close/high,trace:{rule:'GH_TRAILING_CLOSE_PROXIMITY',startDate:window[0].date,endDate:asOf}};
 }
 const cutoff=monthEndBefore(asOf,36),start=endpoint(rows,cutoff),weekly=new Map();
 for(const b of rows)if(b.date>cutoff)weekly.set(weekKey(b.date),b);
 const points=[start,...weekly.values()];
 if(points.some(b=>!positive(b.totalReturnIndex))||points.some((b,i)=>i&&dayDistance(b.date,points[i-1].date)>10))throw Error('INCOMPLETE_WEEKLY_HISTORY');
 const returns=points.slice(1).map((b,i)=>Math.log(b.totalReturnIndex/points[i].totalReturnIndex)-rf(points[i].date,b.date));
 if(returns.length<2)throw Error('INSUFFICIENT_WEEKLY_RETURNS');
 const mu=mean(returns),vol=Math.sqrt(returns.reduce((s,x)=>s+(x-mu)**2,0)/(returns.length-1));
 return{score:-vol,trace:{rule:'LV_WEEKLY_LOG_EXCESS_VOLATILITY',weeklyObservations:returns.length,startDate:start.date,endDate:asOf,rfSource:'FRENCH_DAILY_RF',ddof:1}};
}
export function evaluateReference(method,context){
 if(!validDate(context?.asOf)||!Array.isArray(context.securities))throw Error('INVALID_CALIBRATION_CONTEXT');
 const ids=context.securities.map(s=>s?.id);if(ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length)throw Error('DUPLICATE_OR_INVALID_SECURITY_ID');
 let rf;try{if(method.kind==='LOW_VOL')rf=prepareRiskFree(context);}catch(e){return{methodId:method.id,asOf:context.asOf,status:'DATA_UNAVAILABLE',reason:e.message,ranked:[],topTargets:[],bottomTargets:[],rejections:[]};}
 const ranked=[],rejections=[];
 for(const s of context.securities){try{const bars=history(s,context.asOf),r=score(method,bars,context.asOf,rf);if(!Number.isFinite(r.score))throw Error('NONFINITE_SCORE');ranked.push({id:s.id,ticker:s.ticker||s.id,score:r.score,ruleTrace:r.trace});}catch(e){rejections.push({id:s.id,reason:e.message});}}
 ranked.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id,'en'));
 const n=Math.ceil(ranked.length*method.parameters.selectionFraction),toTargets=xs=>xs.map(s=>({...s,weight:1/xs.length}));
 if(!ranked.length||(method.kind!=='EW'&&2*n>ranked.length))return{methodId:method.id,asOf:context.asOf,status:'DATA_UNAVAILABLE',reason:'INSUFFICIENT_DISJOINT_RANK_BUCKETS',ranked,topTargets:[],bottomTargets:[],rejections};
 return{methodId:method.id,asOf:context.asOf,status:rejections.length?'PARTIAL':'READY',ranked,topTargets:toTargets(ranked.slice(0,n)),bottomTargets:method.kind==='EW'?[]:toTargets(ranked.slice(-n)),rejections,eligibleCount:ranked.length,bucketSize:n,sourceGradeCeiling:'PARTIAL',universeClassification:'OBSERVED_ONLY',rulebook:method.portfolioSemantics};
}
