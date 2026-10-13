// Isolated data/execution integration: original method logic remains frozen.
// Mechanical baseline runner copy; audited changes preserve source fields,
// invalidate known conflicting facts, and carry certified cash-event clocks.
import {createBook,equityAt,creditDividends,executeTargets,settleTerminals,markClose,reconcileBook} from '../certification/execution-audit-accounting.mjs';
import {processCertifiedCashEvents} from '../certification/execution-audit.mjs';

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
 const inputKnowledgeBoundUTC=asOf+'T00:00:00.000Z';
 const visibleInvalidations=(security.fundamentalInvalidations||[]).filter(row=>typeof row.knownFrom==='string'&&row.knownFrom<asOf);
 const fundamentals=security.fundamentals.filter(f=>f.availableAt<asOf).filter(f=>!visibleInvalidations.some(row=>row.key===f.key&&row.periodEnd===f.periodEnd));
 const fiscalPeriodLinks=(security.fiscalPeriodLinks||[]).filter(link=>typeof link.knownFrom==='string'&&link.knownFrom<asOf);
 return{id:security.id,ticker:security.ticker,bars,asOf,preSignalN,fundamentals,listing:security.listing,terminal:security.terminal&&security.terminal.date<=asOf?security.terminal:null,dataQuarantine:security.dataQuarantine?.from<=asOf?security.dataQuarantine:null,
  priceSource:security.priceSource,issuerCik:security.issuerCik,issuerCikConflict:security.issuerCikConflict,issuerCikEvidence:security.issuerCikEvidence,fiscalPeriodLinks,inputKnowledgeBoundUTC,
  formationCutoffUTC:inputKnowledgeBoundUTC,formationCutoffBasis:'CONSERVATIVE_INPUT_KNOWLEDGE_BOUND_NOT_ACTUAL_SIGNAL_TIMESTAMP'};
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
  if(eligibleAt(s,i,protocol)||(isStateful(method)&&book?.positions.has(s.id)))securities.push(snapshot(s,i,asOf,methodLookback(method)));
 }
 const benchmarkBars=data.benchmark?.bars||data.spyBars||[];
 const market={bars:benchmarkBars.filter(b=>b.date<=asOf).slice(-400)};
 const marks=indexed.days.get(asOf)||new Map(),equity=book?equityAt(book,marks):1;
 const positions=book?[...book.positions.values()].map(p=>{const s=indexed.byId.get(p.id),i=indexed.positions.get(p.id).get(asOf),b=i===undefined?null:s.bars[i],factor=b?.splitAdjustmentFactor||1;
  return{id:p.id,weight:p.shares*(b?.close||book.lastMarks.get(p.id))/equity,entryPrice:p.entryPrice*factor,entry:p.entryPrice*factor,stop:p.stop===null?null:p.stop*factor,entryN:p.entryN===null?null:p.entryN*factor,entryDate:p.entryDate,heldSessions:data.calendar.filter(d=>d>p.entryDate&&d<=asOf).length,partialDone:p.partialDone};
 }):[];
 return{asOf,securities,market,positions,state:{},formation:true,inputKnowledgeBoundUTC:asOf+'T00:00:00.000Z',formationCutoffUTC:asOf+'T00:00:00.000Z',formationCutoffBasis:'CONSERVATIVE_INPUT_KNOWLEDGE_BOUND_NOT_ACTUAL_SIGNAL_TIMESTAMP'};
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
// A setup census shares already-built causal snapshots, but removes portfolio
// positions and rechecks common raw-price/liquidity eligibility. Engine trace
// decisions include setups rejected only by portfolio capacity; rejected stop,
// history or N checks do not become signals. Execution receives the original
// portfolio result and never these measurement-only rows.
export function statefulSetupCensus(data,method,context,protocol,indexed=indexData(data)){
 if(!isStateful(method))throw new Error('STATEFUL_SETUP_CENSUS_REQUIRED');
 const securities=context.securities.filter(s=>{const source=indexed.byId.get(s.id),i=indexed.positions.get(s.id)?.get(context.asOf);return source&&i!==undefined&&eligibleAt(source,i,protocol);});
 const result=method.evaluate({...context,securities,positions:[],state:{}}),byId=new Map(securities.map(s=>[s.id,s])),seen=new Set(),setups=[];
 if(success.has(result.status))for(const trace of result.ruleTrace||[]){
  if(!['ENTRY_CANDIDATE','ENTER','REJECT_PORTFOLIO_CAP'].includes(trace.decision)||!byId.has(trace.id)||seen.has(trace.id))continue;
  const security=byId.get(trace.id);seen.add(trace.id);
  setups.push({id:security.id,ticker:security.ticker,ruleTrace:trace,measurementBasis:'PORTFOLIO_INDEPENDENT_COMMON_ELIGIBLE_SETUP',setupOnly:true});
 }
 return{status:result.status,eligible:securities.length,setups,result};
}
function collectSignals(selected,result,asOf,regime,signals){
 for(const t of selected)signals.push({id:t.id,ticker:t.ticker,date:asOf,ruleTrace:t.ruleTrace||result.ruleTrace?.find(r=>r.id===t.id)||result.ruleTrace||[],...(t.measurementBasis?{measurementBasis:t.measurementBasis,setupOnly:true}:{}),regime,forward:{}});
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
 // Portfolio entitlement primitives exist, but fixed-horizon signal outcomes are
 // not yet independently certified for a nonempty cash ledger. Fail closed.
 if(data.certifiedCashEvents?.length)throw new Error('CERTIFIED_CASH_SIGNAL_OUTCOME_CONTRACT_NOT_INTEGRATED');
 const indexed=indexData(data),book=createBook(protocol.execution.initialCapital),cfg={...protocol.execution,slippageBpsPerSide:protocol.execution.slippageBpsPerSide*costMultiplier,commissionBpsPerSide:protocol.execution.commissionBpsPerSide*costMultiplier};
 const signals=[],cohorts=[],states={},formationCounts={},setupFormationCounts={};let pending=null,blocked=0;
 for(let di=0;di<data.calendar.length;di++){
  const date=data.calendar[di],bars=indexed.days.get(date)||new Map(),certifiedEvents=data.certifiedCashEvents||[],clocks=data.certifiedSessionClocks?.[date];
  if(certifiedEvents.length){if(!clocks?.beforeOpenUTC||!clocks?.afterCloseUTC)throw new Error('CERTIFIED_EVENT_SESSION_CLOCK_REQUIRED');processCertifiedCashEvents(book,certifiedEvents,{date,asOfTimestamp:clocks.beforeOpenUTC});}
  creditDividends(book,bars);let turnover=0;
  if(pending){turnover=executeTargets(book,pending.targets,bars,date,cfg,{stateful:isStateful(method),signals:pending.signals,asOf:pending.asOf,validateEntryFill:method.validateEntryFill,certifiedEvents,asOfTimestamp:clocks?.beforeOpenUTC});
   pending=null;
  }
  const terminals=terminalRows(data,date);
  for(const t of terminals)if(t.kind==='DATA_QUARANTINE'&&!bars.has(t.id)){
   bars.set(t.id,{date,open:t.lastClose,close:t.lastClose,rawClose:Infinity,dividend:0});
  }
  const before=equityAt(book,bars);const terminalTurn=settleTerminals(book,bars,terminals,date,cfg,scenario,{certifiedEvents,asOfTimestamp:clocks?.afterCloseUTC});if(before>0){turnover+=terminalTurn/before;book.turnover+=terminalTurn/before;}
  if(certifiedEvents.length)processCertifiedCashEvents(book,certifiedEvents,{date,asOfTimestamp:clocks.afterCloseUTC});
  markClose(book,bars,date,turnover);
  if(!scheduled(method,data.calendar,di))continue;
  if(method.portfolioSemantics.targetWeightScope==='NEW_COHORT'){
   const month=monthNumber(date);while(cohorts.length&&month-cohorts[0].month>=method.portfolioSemantics.cohortMonths)cohorts.shift();
  }
  const context=formationContext(data,method,date,book,protocol,indexed);
  const regime=measureSignals?marketRegime(data.benchmark?.bars||data.spyBars,date,protocol):null;
  if(measureSignals&&isStateful(method)){
   const census=statefulSetupCensus(data,method,context,protocol,indexed);
   setupFormationCounts[census.status]=(setupFormationCounts[census.status]||0)+1;
   if(success.has(census.status))collectSignals(census.setups,{},date,regime,signals);
  }
  const result=method.evaluate(context);
  formationCounts[result.status]=(formationCounts[result.status]||0)+1;
  if(!success.has(result.status)){blocked++;if(method.portfolioSemantics.targetWeightScope==='NEW_COHORT')pending={asOf:date,targets:combineCohorts(cohorts,method.portfolioSemantics.cohortCapitalFraction),signals:[]};continue;}
  if(measureSignals&&!isStateful(method))collectSignals(result.targets,result,date,regime,signals);
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
 return{id:method.id,curve:book.curve,signals,trades:book.trades,turnover:book.turnover,executionCosts:book.executionCosts,dividends:book.dividends,terminalCount:book.terminalCount,formationCounts,blockedFormations:blocked,signalCensus:{basis:isStateful(method)?'PORTFOLIO_INDEPENDENT_COMMON_ELIGIBLE_SETUP':'ACADEMIC_FORMATION_SELECTION',measured:measureSignals,formationCounts:setupFormationCounts},rejections:book.rejections,reconciliation,scenario,costMultiplier,states,pendingForwardTargets:pending,endingPositions:[...book.positions.values()]};
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
   if(!(Number.isFinite(entry.open)&&entry.open>0&&Number.isFinite(benchEntry.open)&&benchEntry.open>0)){s.forward[horizon]={censored:true,reason:'INVALID_EXECUTION_OPEN'};continue;}
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
export function issuerCikStatusAt(security,asOf){
 if(!security?.issuerCik)return 'UNAVAILABLE';
 const e=security.issuerCikEvidence;
 return e?.status==='VERIFIED'&&e.historical===true&&typeof e.validFrom==='string'&&e.validFrom<=asOf&&(e.validTo===null||typeof e.validTo==='string'&&e.validTo>=asOf)&&typeof e.knownFrom==='string'&&e.knownFrom<asOf&&e.listingId===security.listing?.id?'VERIFIED':'UNVERIFIED';
}
export function currentScan(data,method,protocol,asOf){
 const prepared={...data,securities:data.scanner||data.securities};
 // Signal-day equality is mandatory. Recent-but-not-current histories do not
 // join a cross-section whose other observations are dated today.
 const fresh=prepared.securities.filter(s=>s.bars.at(-1)?.date===asOf);
 prepared.securities=fresh;
 const context=formationContext(prepared,method,asOf,null,protocol),census=isStateful(method)?statefulSetupCensus(prepared,method,context,protocol):null,result=census?census.result:method.evaluate(context);
 const selectedTargets=new Map(result.targets.map(t=>[t.id,t])),matches=census?census.setups:result.targets;
 const candidates=matches.map(t=>{const target=selectedTargets.get(t.id),security=fresh.find(s=>s.id===t.id),issuerCik=security?.issuerCik||null,issuerCikStatus=issuerCikStatusAt(security,asOf),sameIssuer=issuerCik?fresh.filter(s=>String(s.issuerCik)===String(issuerCik)).map(s=>s.ticker):[];return{id:t.id,ticker:t.ticker,weight:census?(target?.weight??null):t.weight,score:census?(target?.score??null):(t.score??null),...(census?{portfolioAdmission:target?'CAP_SELECTED':'SOURCE_SETUP_ONLY',portfolioTarget:target||null,measurementBasis:t.measurementBasis}:{}),reason:t.ruleTrace||result.ruleTrace?.find(r=>r.id===t.id)||result.signals?.find(r=>r.id===t.id)||null,signalAsOf:asOf,signalFreshness:'CLOSED_SESSION',keyRulesSatisfied:true,issuerCik,issuerCikStatus,sameIssuerBasis:'METADATA_DIAGNOSTIC_NOT_CONTINUOUS_HISTORICAL_CLASS_PROOF',sameIssuerSecurities:sameIssuer,identityFlags:[...(!issuerCik?['ISSUER_CIK_UNAVAILABLE']:[]),...(issuerCikStatus==='UNVERIFIED'?['ISSUER_CIK_UNVERIFIED']:[]),...(sameIssuer.length>1?['MULTIPLE_SECURITIES_SAME_ISSUER']:[]),...(security?.instrumentType==='ADR'?['ADR_SEPARATE_CLASS']:[]),...(security?.issuerCikConflict?['ISSUER_CIK_CONFLICT']:[])],regimeCompatibility:method.id==='WEINSTEIN_STAGE_DAILY'?'ENGINE_MARKET_GATE':'NO_SOURCE_REGIME_GATE',researchOnly:true};});
 return{id:method.id,asOf,status:result.status,numberMatches:candidates.length,candidates,...(census?{matchBasis:'STATEFUL_SOURCE_SETUP_CENSUS',portfolioAdmittedMatches:result.targets.length}:{}),formationTiming:'RESEARCH_SNAPSHOT; scheduled trading dates remain frozen',dataLimitations:data.limitations,universeExamined:context.securities.length};
}
export function currentConsensus(scans,eligibleMethodIds){
 const eligible=new Set(eligibleMethodIds),map=new Map();
 for(const scan of scans)if(eligible.has(scan.id))for(const c of scan.candidates){if(!map.has(c.id))map.set(c.id,{id:c.id,ticker:c.ticker,methods:[],asOf:scan.asOf,researchOnly:true});map.get(c.id).methods.push(scan.id);}
 return[...map.values()].filter(c=>c.methods.length>=2).map(c=>({...c,methodCount:c.methods.length})).sort((a,b)=>b.methodCount-a.methodCount||a.id.localeCompare(b.id));
}
