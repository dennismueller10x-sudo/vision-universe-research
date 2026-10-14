// V3 copy of portfolio-calibration-v2: identical construction and tolerance; only adds an identity-free failure trace to the reconciliation error.
import {createBook,equityAt,creditDividends,executeTargets,settleTerminals,markClose,reconcileBook} from './accounting-budget-v2.mjs';
import {populateForwardReturns} from './runner-certified-v2.mjs';
import {getReferenceMethod,evaluateReference} from './reference-engines.mjs';
export {populateForwardReturns as guardedSignalOutcomes};
const ok=new Set(['READY','PARTIAL']);
const positive=x=>Number.isFinite(x)&&x>0;
const monthNumber=d=>Number(d.slice(0,4))*12+Number(d.slice(5,7));
function indexAt(bars,date){let lo=0,hi=bars.length;while(lo<hi){const m=(lo+hi)>>1;if(bars[m].date<date)lo=m+1;else hi=m;}return bars[lo]?.date===date?lo:-1;}
function lastBefore(bars,date){let lo=0,hi=bars.length;while(lo<hi){const m=(lo+hi)>>1;if(bars[m].date<=date)lo=m+1;else hi=m;}return bars[lo-1];}
function sourceCalendar(data){return(data.benchmark?.bars||data.spyBars||[]).map(b=>b.date);}
function monthlyLastDates(calendar){const result=new Map();for(const d of calendar)result.set(d.slice(0,7),d);return result;}
function assertData(data,protocol){
 if(!Array.isArray(data?.calendar)||!data.calendar.length||!Array.isArray(data.securities)||!data.securities.length)throw Error('REFERENCE_DATA_REQUIRED');
 if(data.calendar.some((d,i)=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||(i&&data.calendar[i-1]>=d)))throw Error('INVALID_MEASUREMENT_CALENDAR');
 if(data.calendar[0]!==protocol.window.from||data.calendar.at(-1)!==protocol.window.to)throw Error('EXACT_FROZEN_WINDOW_REQUIRED');
 if(new Set(data.securities.map(s=>s.id)).size!==data.securities.length)throw Error('DUPLICATE_SECURITY_ID');
 if(data.certifiedCashEvents?.length)throw Error('NONEMPTY_CERTIFIED_CASH_OUTCOME_CONTRACT_NOT_SUPPORTED');
 if(protocol.execution.timing!=='NEXT_SESSION_OPEN'||protocol.execution.slippageBpsPerSide!==10||protocol.execution.commissionBpsPerSide!==1||protocol.execution.leverage||protocol.execution.shorting||protocol.execution.cashReturn!==0)throw Error('UNCHANGED_COMMON_EXECUTION_CONTRACT_REQUIRED');
 const calendar=sourceCalendar(data);if(!calendar.length||calendar.some((d,i)=>typeof d!=='string'||(i&&calendar[i-1]>=d)))throw Error('SOURCE_BENCHMARK_CALENDAR_REQUIRED');
 if(data.calendar.some(d=>indexAt(data.benchmark?.bars||data.spyBars,d)<0))throw Error('MEASUREMENT_NOT_IN_SOURCE_CALENDAR');
 return calendar;
}
export function calibrationFormationContext(data,method,asOf,{riskFreeDaily=[]}={}){
 const length=method.kind==='LOW_VOL'?900:method.kind==='GH'?500:method.kind==='JT'?300:1;
 const securities=[];
 for(const s of data.securities){const i=indexAt(s.bars,asOf);if(i<0||s.dataQuarantine?.from<=asOf||s.terminal?.date<=asOf)continue;securities.push({id:s.id,ticker:s.ticker,bars:s.bars.slice(Math.max(0,i+1-length),i+1),dataQuarantine:s.dataQuarantine,terminal:s.terminal});}
 return{asOf,securities,riskFreeDaily,sessionCalendar:sourceCalendar(data)};
}
export function warmstartFormationDates(data,method){
 const firstMonth=monthNumber(data.calendar[0]),months=monthlyLastDates(sourceCalendar(data)),dates=[];
 for(let offset=method.portfolioSemantics.cohortMonths;offset>=1;offset--){
  const n=firstMonth-offset,year=Math.floor((n-1)/12),month=n-year*12,key=`${year}-${String(month).padStart(2,'0')}`,date=months.get(key);
  if(!date||date>=data.calendar[0])throw Error('MISSING_PREMEASUREMENT_FORMATION');dates.push(date);
 }
 return dates;
}
export function combineReferenceCohorts(cohorts,leg,cohortMonths){
 const combined=new Map();for(const c of cohorts)for(const t of c[leg]){const existing=combined.get(t.id);if(existing)existing.weight+=t.weight/cohortMonths;else combined.set(t.id,{id:t.id,ticker:t.ticker,weight:t.weight/cohortMonths});}
 return[...combined.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
function freezeCohort(result){return{formationDate:result.asOf,month:monthNumber(result.asOf),top:result.topTargets.map(t=>({...t})),bottom:result.bottomTargets.map(t=>({...t})),eligibleUniverse:result.ranked.map(t=>({id:t.id,ticker:t.ticker,weight:1/result.ranked.length}))};}
function barsOn(data,date){const bars=new Map();for(const s of data.securities){const i=indexAt(s.bars,date);if(i>=0)bars.set(s.id,s.bars[i]);}return bars;}
function terminalRows(data,date){return data.securities.filter(s=>s.terminal?.date===date).map(s=>{const last=lastBefore(s.bars,date),i=s.bars.indexOf(last);return{...s.terminal,id:s.id,trailingRawReturn60:i>=60?last.close/s.bars[i-60].close-1:null};});}
function terminalFactor(security,end,scenario){
 const last=lastBefore(security.bars,end),prior=security.bars.indexOf(last),distress=last.rawClose<1||(prior>=60&&last.close/security.bars[prior-60].close-1<=-0.5);
 return security.terminal.delistClass==='ACQUISITION'||scenario==='LAST_OBSERVED_PRICE'?1:scenario==='DISTRESS_ZERO_OTHER_MINUS_30'&&distress?0:0.7;
}
/** Independent source monthly close-to-close contribution oracle; not a next-open execution claim. */
export function sourceMonthContributions(data,cohorts,leg,startDate,endDate,cohortMonths,{scenario}={}){
 const byId=new Map(data.securities.map(s=>[s.id,s])),contributions=[],missing=[];
 for(const c of cohorts)for(const t of c[leg]){
  const s=byId.get(t.id),start=s&&s.bars[indexAt(s.bars,startDate)],end=s&&s.bars[indexAt(s.bars,endDate)],terminal=s?.terminal?.date>startDate&&s.terminal.date<=endDate?s.terminal:null;
  if(!start||!positive(start.totalReturnIndex)||terminal?.kind==='DATA_QUARANTINE'||(!end&&!terminal)){missing.push({id:t.id,cohortFormation:c.formationDate,reason:'MISSING_SOURCE_RETURN_OR_QUARANTINE'});continue;}
  const final=terminal?lastBefore(s.bars,terminal.date):end;if(!positive(final?.totalReturnIndex)){missing.push({id:t.id,cohortFormation:c.formationDate,reason:'INVALID_TOTAL_RETURN'});continue;}
  const factor=terminal?terminalFactor(s,terminal.date,scenario):1,r=final.totalReturnIndex/start.totalReturnIndex*factor-1,weight=t.weight/cohortMonths;
  contributions.push({id:t.id,cohortFormation:c.formationDate,weight,return:r,contribution:weight*r,terminalScenarioUncertainty:Boolean(terminal)});
 }
 const totalWeight=contributions.reduce((s,c)=>s+c.weight,0);
 return{startDate,endDate,status:missing.length?'DATA_GAP':'READY',return:missing.length?null:contributions.reduce((s,c)=>s+c.contribution,0),expectedInvestedWeight:cohorts.reduce((s,c)=>s+c[leg].reduce((n,t)=>n+t.weight/cohortMonths,0),0),coveredWeight:totalWeight,contributions,missing,basis:'MONTHLY_CLOSE_TOTAL_RETURN_COHORT_CONTRIBUTIONS_WITH_SEPARATE_TERMINAL_SCENARIO',matchingNextOpenExecution:false,missingPolicy:'FAIL_MONTH_NO_SURVIVOR_RENORMALIZATION'};
}
function heldSnapshot(book,bars){const equity=equityAt(book,bars);return[...book.positions.values()].map(p=>({id:p.id,ticker:p.ticker,shares:p.shares,weight:equity?p.shares*(bars.get(p.id)?.close??book.lastMarks.get(p.id)??p.entryPrice)/equity:0})).sort((a,b)=>a.id.localeCompare(b.id,'en'));}
function bookTrace(book,reconciliation,leg){
 const realized=book.trades.reduce((a,t)=>a+t.pnl,0),last=book.curve.at(-1);
 return{leg,reconciliation,tolerance:Math.max(1e-6,reconciliation.actual*1e-10),initialCapital:book.initialCapital,cash:book.cash,realizedPnl:realized,tradeCount:book.trades.length,fillCount:book.fills.length,openPositions:book.positions.size,receivableCount:book.receivables.size,curveLength:book.curve.length,lastCurveDate:last?.date??null,lastCurveEquity:last?.equity??null,cashPrecisionCorrections:(book.cashPrecisionCorrections??[]).length,rejections:book.rejections.length,corporateActionAuditEntries:book.corporateActionAudit.length};
}
function finishBook(book,leg){const reconciliation=reconcileBook(book);if(!reconciliation.pass){const e=Error('REFERENCE_BOOK_RECONCILIATION_FAILED');e.bookTrace=bookTrace(book,reconciliation,leg);throw e;}return{curve:book.curve,trades:book.trades,fills:book.fills,endingPositions:[...book.positions.values()],turnover:book.turnover,executionCosts:book.executionCosts,dividends:book.dividends,terminalCount:book.terminalCount,rejections:book.rejections,reconciliation,cashPrecisionCorrections:book.cashPrecisionCorrections??[]};}
export function runReferencePortfolio(data,methodOrId,protocol,{costMode='SOURCE_GROSS',scenario=protocol.delisting.baseline,riskFreeDaily=[],onDayClose=null}={}){
 const method=typeof methodOrId==='string'?getReferenceMethod(methodOrId):methodOrId,calendar=assertData(data,protocol),cohortMonths=method.portfolioSemantics.cohortMonths;
 if(!['SOURCE_GROSS','SAME_TOURNAMENT_NET'].includes(costMode))throw Error('FROZEN_COST_MODE_REQUIRED');
 if(![protocol.delisting.baseline,...protocol.delisting.sensitivity].includes(scenario))throw Error('FROZEN_TERMINAL_SCENARIO_REQUIRED');
 const cfg={...protocol.execution,...(costMode==='SOURCE_GROSS'?{slippageBpsPerSide:0,commissionBpsPerSide:0}:{})},books={top:createBook(cfg.initialCapital),...(method.kind==='EW'?{}:{bottom:createBook(cfg.initialCapital)}),...(method.kind==='LOW_VOL'?{eligibleUniverse:createBook(cfg.initialCapital)}:{})};
 const cohorts=[],formations=[],monthly=[],warmstartDates=warmstartFormationDates(data,method);
 for(const date of warmstartDates){const result=evaluateReference(method,calibrationFormationContext(data,method,date,{riskFreeDaily}));formations.push({date,warmstart:true,status:result.status,eligibleCount:result.eligibleCount||0,bucketSize:result.bucketSize||0,rejections:result.rejections});if(!ok.has(result.status))return{methodId:method.id,status:'BLOCKED_WARMSTART',reason:result.reason,formations,sourceGradeCeiling:'PARTIAL',outcomesRun:false};cohorts.push(freezeCohort(result));}
 let pending={asOf:warmstartDates.at(-1),top:combineReferenceCohorts(cohorts,'top',cohortMonths),bottom:combineReferenceCohorts(cohorts,'bottom',cohortMonths),...(method.kind==='LOW_VOL'?{eligibleUniverse:combineReferenceCohorts(cohorts,'eligibleUniverse',cohortMonths)}:{})},previousMonthClose=warmstartDates.at(-1),previousEquity={top:cfg.initialCapital,bottom:cfg.initialCapital,eligibleUniverse:cfg.initialCapital};
 for(let di=0;di<data.calendar.length;di++){
  const date=data.calendar[di],bars=barsOn(data,date),terminals=terminalRows(data,date);
  for(const t of terminals)if(t.kind==='DATA_QUARANTINE'&&!bars.has(t.id))bars.set(t.id,{date,open:t.lastClose,close:t.lastClose,rawClose:Infinity,dividend:0});
  for(const [leg,book]of Object.entries(books)){
   creditDividends(book,bars);let turnover=0;if(pending)turnover=executeTargets(book,pending[leg],bars,date,cfg,{asOf:pending.asOf});
   const before=equityAt(book,bars),terminalTurn=settleTerminals(book,bars,terminals,date,cfg,scenario);if(before>0){turnover+=terminalTurn/before;book.turnover+=terminalTurn/before;}markClose(book,bars,date,turnover);if(onDayClose)onDayClose({leg,date,book,bars,terminals});
  }
  pending=null;
  const monthEnd=di===data.calendar.length-1||date.slice(0,7)!==data.calendar[di+1].slice(0,7);if(!monthEnd)continue;
  const legs={};for(const [leg,book]of Object.entries(books)){const equity=book.curve.at(-1).equity;legs[leg]={executionReturn:equity/previousEquity[leg]-1,sourceOracle:sourceMonthContributions(data,cohorts,leg,previousMonthClose,date,cohortMonths,{scenario}),holdings:heldSnapshot(book,bars),equity,exposure:book.curve.at(-1).exposure,positionCount:book.positions.size,turnover:book.curve.filter(p=>p.date.slice(0,7)===date.slice(0,7)).reduce((s,p)=>s+p.turnover,0)};previousEquity[leg]=equity;}
  monthly.push({month:date.slice(0,7),date,legs,rankSpread:legs.bottom?{execution:legs.top.executionReturn-legs.bottom.executionReturn,source:legs.top.sourceOracle.return===null||legs.bottom.sourceOracle.return===null?null:legs.top.sourceOracle.return-legs.bottom.sourceOracle.return,basis:'ARITHMETIC_DIFFERENCE_OF_INDEPENDENT_LONG_LEG_MONTHLY_RETURNS',fundedFactorCagr:null}:null,cohortFormations:cohorts.map(c=>c.formationDate)});
  previousMonthClose=date;
  while(cohorts.length&&monthNumber(date)-cohorts[0].month>=cohortMonths)cohorts.shift();
  const result=evaluateReference(method,calibrationFormationContext(data,method,date,{riskFreeDaily}));formations.push({date,warmstart:false,status:result.status,eligibleCount:result.eligibleCount||0,bucketSize:result.bucketSize||0,rejections:result.rejections,topTargets:result.topTargets,bottomTargets:result.bottomTargets,...(method.kind==='LOW_VOL'?{eligibleUniverseTargets:result.ranked.map(t=>({id:t.id,ticker:t.ticker,weight:1/result.ranked.length}))}:{})});
  if(ok.has(result.status))cohorts.push(freezeCohort(result));
  pending={asOf:date,top:combineReferenceCohorts(cohorts,'top',cohortMonths),bottom:combineReferenceCohorts(cohorts,'bottom',cohortMonths),...(method.kind==='LOW_VOL'?{eligibleUniverse:combineReferenceCohorts(cohorts,'eligibleUniverse',cohortMonths)}:{})};
 }
 const partial=formations.some(f=>f.status!=='READY')||Object.values(books).some(b=>b.rejections.length)||monthly.some(m=>Object.values(m.legs).some(l=>l.sourceOracle.status!=='READY'));
 return{methodId:method.id,status:partial?'PARTIAL':'READY',costMode,scenario,universeClassification:'OBSERVED_ONLY',sourceGradeCeiling:'PARTIAL',originalReplication:false,comparisonStatus:'SOURCE_RECIPE_TRANSFER_NOT_ORIGINAL_SAMPLE_OR_MATCHED_STOCK_ORACLE',executionConvention:'NEXT_SESSION_OPEN_SEPARATE_FROM_SOURCE_MONTHLY_CLOSE_ORACLE',warmstartDates,formations,monthly,top:finishBook(books.top,'top'),bottom:books.bottom?finishBook(books.bottom,'bottom'):null,...(books.eligibleUniverse?{eligibleUniverse:finishBook(books.eligibleUniverse,'eligibleUniverse'),eligibleUniverseBasis:'EXACT_SAME_LOW_VOL_RANK_ELIGIBLE_CROSS_SECTION_EQUAL_WEIGHT_NOT_GENERIC_SINGLE_BAR_EW'}:{}),pendingNextOpenTargets:pending,signalMeasurementPerformed:false,sourceRiskFreeVintage:method.kind==='LOW_VOL'?'EX_POST_OBSERVED_FRENCH_NOT_ORIGINAL_DATASTREAM':null};
}
