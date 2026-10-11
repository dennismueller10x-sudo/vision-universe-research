import {createBook,equityAt,creditDividends,executeTargets,settleTerminals,markClose,reconcileBook} from './accounting.mjs';

const success = new Set(['READY','PARTIAL','OK']);
const mean = xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
function barIndex(bars,date){let lo=0,hi=bars.length;while(lo<hi){const m=(lo+hi)>>1;if(bars[m].date<date)lo=m+1;else hi=m;}return bars[lo]?.date===date?lo:undefined;}
function indexData(data){
 const byId=new Map(data.securities.map(s=>[s.id,s]));
 const positions=new Map(data.securities.map(s=>[s.id,{get:date=>barIndex(s.bars,date)}]));
 const days={get:date=>new Map(data.securities.map(s=>[s.id,s.bars[barIndex(s.bars,date)]]).filter(([,b])=>b))};
 return{byId,positions,days};
}
export function marketRegime(benchmarkBars,asOf,protocol){
 const known=benchmarkBars.filter(b=>b.date<=asOf),closes=known.map(b=>b.close),last=known.at(-1);
 if(!last||closes.length<protocol.regimes.trendSmaSessions)return{trend:'UNKNOWN',vol:'UNKNOWN',era:asOf<=protocol.regimes.earlyEnd?'EARLY':'LATE'};
 const avg=mean(closes.slice(-protocol.regimes.trendSmaSessions)),relative=last.close/avg-1;
 const returns=known.slice(-protocol.regimes.volatilitySessions-1).map((b,i,a)=>i?Math.log(b.totalReturnIndex/a[i-1].totalReturnIndex):null).slice(1),mu=mean(returns);
 const vol=Math.sqrt(returns.reduce((s,x)=>s+(x-mu)**2,0)/(returns.length-1))*Math.sqrt(252);
 return{trend:relative>protocol.regimes.sidewaysBand?'BULL':relative< -protocol.regimes.sidewaysBand?'BEAR':'SIDEWAYS',vol:vol>=protocol.regimes.highVolAnnualized?'HIGH_VOL':vol<=protocol.regimes.lowVolAnnualized?'LOW_VOL':'MID_VOL',era:asOf<=protocol.regimes.earlyEnd?'EARLY':'LATE'};
}
function snapshot(security,index,asOf,lookback){
 const known=security.bars.slice(Math.max(0,index+1-lookback),index+1),factor=known.at(-1)?.splitAdjustmentFactor||1,anchor=known[0]?.totalReturnIndex||1;
 // Multiplicative TR-index normalization cancels in every source ratio. Retain
 // canonical values; copying every bar on every day would obscure this identity.
 const bars=factor===1?known:known.map(b=>({date:b.date,open:b.open*factor,high:b.high*factor,low:b.low*factor,close:b.close*factor,volume:b.volume/factor,dividend:b.dividend*factor,totalReturnIndex:b.totalReturnIndex,rawClose:b.rawClose,rawVolume:b.rawVolume}));
 const preSignalN=index>0&&security.sourceFeatures?.turtleN20?.[index-1]>0?{asOf:security.bars[index-1].date,method:'TURTLE_N20_FULL_PREFIX',value:security.sourceFeatures.turtleN20[index-1]*factor}:undefined;
 return{id:security.id,ticker:security.ticker,bars,asOf,preSignalN,fundamentals:security.fundamentals.filter(f=>f.availableAt<asOf),listing:security.listing,terminal:security.terminal&&security.terminal.date<=asOf?security.terminal:null,dataQuarantine:security.dataQuarantine?.from<=asOf?security.dataQuarantine:null};
}
function eligibleAt(s,i,protocol){
 const b=s.bars[i],n=protocol.universe.dollarVolumeSessions;
 if(i<n-1||!(b.rawClose>=protocol.universe.priceFloorRaw))return false;
 const dv=mean(s.bars.slice(i-n+1,i+1).map(b=>b.rawClose*b.rawVolume));
 return dv>=protocol.universe.dollarVolumeFloor;
}
function isStateful(method){return method.portfolioSemantics?.mode==='STATEFUL_DAILY'||method.portfolioSemantics?.targetWeightScope==='STATEFUL';}
function methodLookback(method){return method.id==='LOW_VOLATILITY'?900:isStateful(method)?400:500;}
function minLookback(method){return method.id==='TURTLE_S2_EQUITY_DAILY'?56:method.id==='WEINSTEIN_STAGE_DAILY'?170:method.id==='KULLAMAGI_DAILY_ADAPTATION'?200:2;}
export function formationContext(data,method,asOf,book,protocol,indexed=indexData(data)){
 const securities=[];
 for(const s of data.securities){const i=indexed.positions.get(s.id).get(asOf);if(i===undefined||i+1<minLookback(method))continue;
  if(s.dataQuarantine?.from<=asOf)continue;
  if(eligibleAt(s,i,protocol)||book?.positions.has(s.id))securities.push(snapshot(s,i,asOf,methodLookback(method)));
 }
 const benchmarkBars=data.benchmark?.bars||data.spyBars||[];
 const market={bars:benchmarkBars.filter(b=>b.date<=asOf).slice(-400)};
 const marks=indexed.days.get(asOf)||new Map(),equity=book?equityAt(book,marks):1;
 const positions=book?[...book.positions.values()].map(p=>{const s=indexed.byId.get(p.id),i=indexed.positions.get(p.id).get(asOf),b=i===undefined?null:s.bars[i],factor=b?.splitAdjustmentFactor||1;
  return{id:p.id,weight:p.shares*(b?.close||book.lastMarks.get(p.id))/equity,entryPrice:p.entryPrice*factor,entry:p.entryPrice*factor,stop:p.stop===null?null:p.stop*factor,entryN:p.entryN===null?null:p.entryN*factor,entryDate:p.entryDate,heldSessions:data.calendar.filter(d=>d>p.entryDate&&d<=asOf).length,partialDone:p.partialDone};
 }):[];
 return{asOf,securities,market,positions,state:{},formation:true};
}
function monthlySchedule(calendar,i){return i===calendar.length-1||calendar[i].slice(0,7)!==calendar[i+1].slice(0,7);}
function scheduled(method,calendar,i){
 if(isStateful(method))return true;
 const rebalance=method.portfolioSemantics?.rebalance;
 if(rebalance==='ANNUAL_JUNE')return monthlySchedule(calendar,i)&&calendar[i].slice(5,7)==='06';
 if(rebalance==='ANNUAL_BATCH')return monthlySchedule(calendar,i)&&calendar[i].slice(5,7)==='12';
 if(['MONTHLY','MONTHLY_FORMATION'].includes(rebalance))return monthlySchedule(calendar,i);
 throw new Error('METHOD_SCHEDULE_REQUIRED');
}
const monthNumber=date=>Number(date.slice(0,4))*12+Number(date.slice(5,7));
function targetsInExecutionBasis(result,context,indexed){
 return result.targets.map(t=>{const s=indexed.byId.get(t.id),i=indexed.positions.get(t.id).get(context.asOf),factor=s.bars[i].splitAdjustmentFactor||1;
  return{...t,stopLevel:Number.isFinite(t.stopLevel)?t.stopLevel/factor:undefined,initialStopDistance:Number.isFinite(t.initialStopDistance)?t.initialStopDistance/factor:undefined,initialRiskUnit:Number.isFinite(t.initialRiskUnit)?t.initialRiskUnit/factor:undefined,maxInitialStopDistance:Number.isFinite(t.maxInitialStopDistance)?t.maxInitialStopDistance/factor:undefined};
 });
}
function combineCohorts(cohorts,fraction){const combined=new Map();for(const c of cohorts)for(const t of c.targets){if(!combined.has(t.id))combined.set(t.id,{...t,weight:0});combined.get(t.id).weight+=t.weight*fraction;}return[...combined.values()];}
function collectSignals(method,result,asOf,regime,signals){
 let selected;
 if(isStateful(method)){
  selected=(result.signals||[]).filter(s=>['ENTER','ENTRY','BUY'].includes(s.action));
 }else selected=result.targets;
 for(const t of selected)signals.push({id:t.id,ticker:t.ticker,date:asOf,ruleTrace:t.ruleTrace||result.ruleTrace?.find(r=>r.id===t.id)||result.ruleTrace||[],regime,forward:{}});
}
function terminalRows(data,date){return data.securities.filter(s=>s.terminal?.date===date).map(s=>({...s.terminal,id:s.id,trailingRawReturn60:s.bars.length>60?s.bars.at(-1).close/s.bars.at(-61).close-1:null}));}
export function benchmarkCurve(data,capital){
 const bars=data.benchmark?.bars||data.spyBars||[];
 const byDate=new Map(bars.map(b=>[b.date,b])),first=byDate.get(data.calendar[0]);
 if(!first?.totalReturnIndex)throw new Error('CANONICAL_BENCHMARK_REQUIRED');
 return data.calendar.map(date=>{const b=byDate.get(date);if(!b?.totalReturnIndex)throw new Error('BENCHMARK_DATE_GAP');return{date,equity:capital*b.totalReturnIndex/first.totalReturnIndex,exposure:1,n:1};});
}
export function runMethod(data,method,protocol,{costMultiplier=1,scenario=protocol.delisting.baseline,measureSignals=true}={}){
 if(data.calendar[0]<protocol.window.from||data.calendar.at(-1)>protocol.window.to)throw new Error('WINDOW_MISMATCH');
 const indexed=indexData(data),book=createBook(protocol.execution.initialCapital),cfg={...protocol.execution,slippageBpsPerSide:protocol.execution.slippageBpsPerSide*costMultiplier,commissionBpsPerSide:protocol.execution.commissionBpsPerSide*costMultiplier};
 const signals=[],cohorts=[],states={},formationCounts={};let pending=null,blocked=0;
 for(let di=0;di<data.calendar.length;di++){
  const date=data.calendar[di],bars=indexed.days.get(date)||new Map();creditDividends(book,bars);let turnover=0;
  if(pending){turnover=executeTargets(book,pending.targets,bars,date,cfg,{stateful:isStateful(method),signals:pending.signals,asOf:pending.asOf,validateEntryFill:method.validateEntryFill});
   pending=null;
  }
  const terminals=terminalRows(data,date);
  for(const t of terminals)if(t.kind==='DATA_QUARANTINE'&&!bars.has(t.id)){
   bars.set(t.id,{date,open:t.lastClose,close:t.lastClose,rawClose:Infinity,dividend:0});
  }
  const before=equityAt(book,bars);const terminalTurn=settleTerminals(book,bars,terminals,date,cfg,scenario);if(before>0){turnover+=terminalTurn/before;book.turnover+=terminalTurn/before;}
  markClose(book,bars,date,turnover);
  if(!scheduled(method,data.calendar,di))continue;
  if(method.portfolioSemantics.targetWeightScope==='NEW_COHORT'){
   const month=monthNumber(date);while(cohorts.length&&month-cohorts[0].month>=method.portfolioSemantics.cohortMonths)cohorts.shift();
  }
  const context=formationContext(data,method,date,book,protocol,indexed),result=method.evaluate(context);
  formationCounts[result.status]=(formationCounts[result.status]||0)+1;
  if(!success.has(result.status)){blocked++;if(method.portfolioSemantics.targetWeightScope==='NEW_COHORT')pending={asOf:date,targets:combineCohorts(cohorts,method.portfolioSemantics.cohortCapitalFraction),signals:[]};continue;}
  const regime=marketRegime(data.benchmark?.bars||data.spyBars,date,protocol);
  if(measureSignals)collectSignals(method,result,date,regime,signals);
  let targets=targetsInExecutionBasis(result,context,indexed);
  if(method.portfolioSemantics.targetWeightScope==='NEW_COHORT'){
   cohorts.push({month:monthNumber(date),targets});
   targets=combineCohorts(cohorts,method.portfolioSemantics.cohortCapitalFraction);
  }
  states[date]={status:result.status,selected:result.targets.length,eligible:context.securities.length};
  pending={asOf:date,targets,signals:result.signals||[]};
 }
 const reconciliation=reconcileBook(book);if(!reconciliation.pass)throw new Error('ACCOUNTING_RECONCILIATION_FAILED');
 if(measureSignals)populateForwardReturns(signals,data,protocol,indexed,scenario);
 return{id:method.id,curve:book.curve,signals,trades:book.trades,turnover:book.turnover,executionCosts:book.executionCosts,dividends:book.dividends,terminalCount:book.terminalCount,formationCounts,blockedFormations:blocked,rejections:book.rejections,reconciliation,scenario,costMultiplier,states,pendingForwardTargets:pending,endingPositions:[...book.positions.values()]};
}
// Start every signal return at the first available benchmark session AFTER the
// signal date, at its open. Compare SPY over exactly the same timestamps.
export function populateForwardReturns(signals,data,protocol,indexed=indexData(data),scenario=protocol.delisting.baseline){
 const calendar=data.calendar,calPos=new Map(calendar.map((d,i)=>[d,i]));
 const benchmarkBars=data.benchmark?.bars||data.spyBars||[],spy=new Map(benchmarkBars.map(b=>[b.date,b]));
 for(const s of signals){const formation=calPos.get(s.date),entryPos=formation+1,entryDate=calendar[entryPos],security=indexed.byId.get(s.id),entryIndex=indexed.positions.get(s.id)?.get(entryDate),entry=security?.bars[entryIndex],benchEntry=spy.get(entryDate);
  s.entryDate=entryDate||null;
  for(const horizon of protocol.signals.horizonsSessions){
   const endDate=calendar[entryPos+horizon-1],endIndex=indexed.positions.get(s.id)?.get(endDate),end=security?.bars[endIndex],benchEnd=spy.get(endDate);
   if(!entry||!endDate||!benchEntry||!benchEnd){s.forward[horizon]={censored:true,reason:'WINDOW_OR_ENTRY_UNAVAILABLE'};continue;}
   const terminal=security.terminal&&security.terminal.date>=entryDate&&security.terminal.date<=endDate?security.terminal:null;
   if(!end&&!terminal){s.forward[horizon]={censored:true,reason:'PRICE_DATA_GAP'};continue;}
   if(terminal?.kind==='DATA_QUARANTINE'){s.forward[horizon]={censored:true,reason:'DATA_QUARANTINE',terminalScenarioUncertainty:true};continue;}
   const last=end||security.bars.at(-1),distress=last.rawClose<1||(security.bars.length>60&&last.close/security.bars.at(-61).close-1<=-0.5);
   const terminalFactor=terminal?(terminal.delistClass==='ACQUISITION'||scenario==='LAST_OBSERVED_PRICE'?1:scenario==='DISTRESS_ZERO_OTHER_MINUS_30'&&distress?0:0.7):1;
   const total=last.totalReturnIndex/entry.totalReturnIndex*entry.close/entry.open*terminalFactor-1;
   const bench=benchEnd.totalReturnIndex/benchEntry.totalReturnIndex*benchEntry.close/benchEntry.open-1;
   const rows=security.bars.slice(entryIndex,(endIndex??security.bars.length-1)+1),excursions=rows.map(b=>b.totalReturnIndex/entry.totalReturnIndex*entry.close/entry.open-1);
   s.forward[horizon]={return:total,excess:total-bench,benchmarkReturn:bench,mfe:Math.max(0,...excursions),mae:Math.min(0,...excursions,...(terminal?[total]:[])),excursionBasis:'TOTAL_RETURN_CLOSE',censored:false,terminalScenarioUncertainty:Boolean(terminal),endDate};
  }
 }
}
export function currentScan(data,method,protocol,asOf){
 const prepared={...data,securities:data.scanner||data.securities};
 // Signal-day equality is mandatory. Recent-but-not-current histories do not
 // join a cross-section whose other observations are dated today.
 const fresh=prepared.securities.filter(s=>s.bars.at(-1)?.date===asOf);
 prepared.securities=fresh;
 const context=formationContext(prepared,method,asOf,null,protocol),result=method.evaluate(context);
 const candidates=result.targets.map(t=>{const security=fresh.find(s=>s.id===t.id),issuerCik=security?.issuerCik||null,sameIssuer=issuerCik?fresh.filter(s=>String(s.issuerCik)===String(issuerCik)).map(s=>s.ticker):[];return{id:t.id,ticker:t.ticker,weight:t.weight,score:t.score??null,reason:t.ruleTrace||result.ruleTrace?.find(r=>r.id===t.id)||result.signals?.find(r=>r.id===t.id)||null,signalAsOf:asOf,signalFreshness:'CLOSED_SESSION',keyRulesSatisfied:true,issuerCik,sameIssuerSecurities:sameIssuer,identityFlags:[...(!issuerCik?['ISSUER_CIK_UNAVAILABLE']:[]),...(sameIssuer.length>1?['MULTIPLE_SECURITIES_SAME_ISSUER']:[]),...(security?.instrumentType==='ADR'?['ADR_SEPARATE_CLASS']:[]),...(security?.issuerCikConflict?['ISSUER_CIK_CONFLICT']:[])],regimeCompatibility:method.id==='WEINSTEIN_STAGE_DAILY'?'ENGINE_MARKET_GATE':'NO_SOURCE_REGIME_GATE',researchOnly:true};});
 return{id:method.id,asOf,status:result.status,numberMatches:candidates.length,candidates,formationTiming:'RESEARCH_SNAPSHOT; scheduled trading dates remain frozen',dataLimitations:data.limitations,universeExamined:context.securities.length};
}
export function currentConsensus(scans,eligibleMethodIds){
 const eligible=new Set(eligibleMethodIds),map=new Map();
 for(const scan of scans)if(eligible.has(scan.id))for(const c of scan.candidates){if(!map.has(c.id))map.set(c.id,{id:c.id,ticker:c.ticker,methods:[],asOf:scan.asOf,researchOnly:true});map.get(c.id).methods.push(scan.id);}
 return[...map.values()].filter(c=>c.methods.length>=2).map(c=>({...c,methodCount:c.methods.length})).sort((a,b)=>b.methodCount-a.methodCount||a.id.localeCompare(b.id));
}
