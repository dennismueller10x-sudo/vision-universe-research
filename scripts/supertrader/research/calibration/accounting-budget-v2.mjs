// RESEARCH BUG-FIX OVERLAY OFFICIAL_CASH_RECEIVABLE_TWO_STAGE_V2.
// Mechanical copy of frozen accounting.mjs, SHA256 e2a8b535989254b7bc4cb8ce073aa6e114aa1ee236d5892f31255a6069fb833b.
// Ordinary orders/costs unchanged; official events require an independent certificate.
import {receivableValue,receivableUnrealizedPnl,processCertifiedCashEvents,certifyOfficialCashEvent} from '../certification/execution-audit.mjs';
// Versioned infrastructure repair only. Requests, demand, scale, fills, costs,
// target weights, execution timing and order priority below remain unchanged.
export const ACCOUNTING_BUDGET_VERSION='BINARY64_BUDGET_ROUNDOFF_V2';
export const ORIGINAL_ACCOUNTING_SHA256='919215c83df18dad85a0ffd7cb624126cf58b7e05efbc7bb5d06275c192fb996';
export const ORIGINAL_ABSOLUTE_CASH_FLOOR=1e-6;
const UNIT_ROUNDOFF=2**-53,MIN_NORMAL=2**-1022;
function upward(x){if(!Number.isFinite(x)||x<0)throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');if(x===0)return Number.MIN_VALUE;const b=new ArrayBuffer(8),f=new Float64Array(b),u=new BigUint64Array(b);f[0]=x;u[0]+=1n;return f[0];}
function supportedMoney(x){return Number.isFinite(x)&&x>=0&&(x===0||x>=MIN_NORMAL);}
/** Ex-ante positive-cost budget bound, never calibrated from a residual.
 * n positive requests: cost/product and coefficient rounding, n demand adds,
 * reciprocal scale, shares/gross/fee/products and n cash subtractions fit within
 * a conservative 12n+16 elementary-operation envelope. Positive demand errors
 * propagate multiplicatively through scale; final subtraction also depends on
 * cash plus scaled demand. gamma_m=mu/(1-mu). Upward rounding covers computation
 * of the bound itself. m*MIN_VALUE additionally bounds residual underflow.
 * Unsupported operands/overflow fail closed; no risk/cash/weight parameter.
 */
export function budgetRoundingProof({availableCash,demand,scale,requestCosts,requestOperands=[],commissionRate=0,commissionBpsPerSide=commissionRate*10000}){
 if(!supportedMoney(availableCash)||!supportedMoney(demand)||!Number.isFinite(scale)||scale<0||scale>1||(scale>0&&scale<MIN_NORMAL)||!Array.isArray(requestCosts)||requestCosts.some(x=>!supportedMoney(x)||x===0))throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');
 if(!Object.is(requestCosts.reduce((n,x)=>n+x,0),demand)||!Object.is(scale,demand>0?Math.min(1,Math.max(0,availableCash)/demand):1))throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');
 if(!Number.isFinite(commissionRate)||commissionRate<0||(commissionRate>0&&commissionRate<MIN_NORMAL)||!Number.isFinite(commissionBpsPerSide)||commissionBpsPerSide<0||!Object.is(commissionBpsPerSide/10000,commissionRate)||requestOperands.length!==requestCosts.length||(availableCash>0&&demand>0&&scale===0))throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');
 for(const [i,r] of requestOperands.entries()){const shares=r.desired*scale,gross=shares*r.fill,feeProduct=gross*commissionBpsPerSide,fee=feeProduct/10000;if(!Object.is(requestCosts[i],r.desired*r.fill*(1+commissionRate))||!supportedMoney(feeProduct)||(commissionBpsPerSide>0&&gross>0&&feeProduct===0))throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');if(!supportedMoney(r.desired)||r.desired===0||!supportedMoney(r.fill)||r.fill===0||!supportedMoney(shares)||(scale>0&&shares===0)||!supportedMoney(gross)||(shares>0&&gross===0)||!supportedMoney(fee)||(commissionRate>0&&gross>0&&fee===0)||!supportedMoney(gross+fee))throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');}
 const requests=requestCosts.length,operationUpperBound=12*requests+16,t=operationUpperBound*UNIT_ROUNDOFF;
 if(!Number.isSafeInteger(operationUpperBound)||t>=0.5)throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');
 const magnitudeUpper=upward(availableCash+upward(scale*demand)),gammaUpper=upward(t/(1-t)),underflowUpper=upward(operationUpperBound*Number.MIN_VALUE),analyticBound=upward(gammaUpper*magnitudeUpper+underflowUpper),bound=Math.max(ORIGINAL_ABSOLUTE_CASH_FLOOR,analyticBound);
 if(!Number.isFinite(analyticBound)||!Number.isFinite(bound))throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');
 return {version:ACCOUNTING_BUDGET_VERSION,availableCash,demand,scale,requests,operationUpperBound,unitRoundoff:UNIT_ROUNDOFF,analyticBound,originalAbsoluteFloor:ORIGINAL_ABSOLUTE_CASH_FLOOR,bound,computedBeforePurchases:true,observedResidualUsed:false};
}
export function guardedNumericCash(cash,proof){if(!Number.isFinite(cash)||!Number.isFinite(proof?.bound)||proof.bound<0)throw Error('ACCOUNTING_PRECISION_DOMAIN_UNSUPPORTED');if(cash < -proof.bound)throw Error('ACCOUNTING_NEGATIVE_CASH');return Math.max(0,cash);}

// Execution/accounting primitive only. All target weights and exits come from
// frozen method definitions; costs, terminal scenarios and timing from protocol.
export function createBook(capital) {
  if (!(capital > 0)) throw new Error('INVALID_CAPITAL');
  return {initialCapital:capital,cash:capital,positions:new Map(),trades:[],fills:[],curve:[],turnover:0,executionCosts:0,dividends:0,terminalCount:0,rejections:[],lastMarks:new Map(),receivables:new Map(),corporateActionEvents:new Set(),corporateActionAudit:[]};
}
const posValue = (book,bars,field) => [...book.positions.values()].reduce((sum,p)=>sum+p.shares*(bars.get(p.id)?.[field] ?? book.lastMarks.get(p.id) ?? p.entryPrice),0);
export function equityAt(book,bars,field='close') { return book.cash+posValue(book,bars,field)+receivableValue(book); }
function closeShares(book,p,shares,bar,date,cfg,reason,terminalFactor=1) {
  const fraction = shares/p.shares;
  const mark = bar.open*terminalFactor;
  const fill = mark*(1-cfg.slippageBpsPerSide/10000);
  const gross=shares*fill,fee=gross*cfg.commissionBpsPerSide/10000;
  const allocatedCost=p.cost*fraction,allocatedDiv=p.dividends*fraction;
  book.cash+=gross-fee; book.executionCosts+=shares*(mark-fill)+fee;
  book.trades.push({id:p.id,ticker:p.ticker,entryDate:p.entryDate,date,cost:allocatedCost,pnl:gross-fee+allocatedDiv-allocatedCost,returnPct:(gross-fee+allocatedDiv)/allocatedCost-1,reason,transactionCosts:fee+shares*(mark-fill),fraction});
  p.shares-=shares;p.cost-=allocatedCost;p.dividends-=allocatedDiv;
  book.fills.push({id:p.id,date,side:'SELL',shares,price:fill,reason});
  if(p.shares<1e-10)book.positions.delete(p.id);
  return gross;
}
// Ex-date distribution belongs only to yesterday's held shares. A new open
// purchase on the ex-date receives none. Split-adjusted shares are consistent
// with the canonical adjustment basis for the entire stored history.
export function creditDividends(book,bars) {
  for(const p of book.positions.values()) {
    const dividend=bars.get(p.id)?.dividend;
    if(Number.isFinite(dividend)&&dividend>0){const cash=p.shares*dividend;book.cash+=cash;book.dividends+=cash;p.dividends+=cash;}
  }
}
export function executeTargets(book,targets,bars,date,cfg,{stateful=false,signals=[],asOf,validateEntryFill,certifiedEvents=[],asOfTimestamp}={}) {
  if(!asOf||asOf>=date)throw new Error('EXECUTION_MUST_FOLLOW_SIGNAL');
  if(!Array.isArray(targets)||targets.some(t=>!(Number.isFinite(t.weight)&&t.weight>=0)))throw new Error('EXPLICIT_TARGET_WEIGHTS_REQUIRED');
  if(new Set(targets.map(t=>t.id)).size!==targets.length)throw new Error('DUPLICATE_TARGET');
  if(targets.reduce((s,t)=>s+t.weight,0)>1+1e-8)throw new Error('LEVERAGE_NOT_ALLOWED');
  // Explicit corporate-action clock runs before market orders. No certified
  // events means exactly the original path. Event security IDs are listing-bound.
  if(certifiedEvents.length||book.corporateActionBindings?.size){
    const checks=processCertifiedCashEvents(book,certifiedEvents,{date,asOfTimestamp});
    const inactive=new Set([...book.corporateActionBindings.keys(),...checks.filter(c=>c.accepted&&c.status==='EFFECTIVE').map(c=>c.id)]);
    for(const t of targets)if(inactive.has(t.id))book.rejections.push({id:t.id,date,reason:'OFFICIAL_EVENT_SECURITY_NOT_TRADABLE'});
    targets=targets.filter(t=>!inactive.has(t.id));
  }
  const wanted=new Map(targets.map(t=>[t.id,t])),equity=equityAt(book,bars,'open');
  let traded=0;
  for(const [id,p]of [...book.positions]) {
    const bar=bars.get(id);
    if(!bar||bar.date!==date||!(Number.isFinite(bar.open)&&bar.open>0)){book.rejections.push({id,date,reason:'NO_EXECUTABLE_OPEN'});continue;}
    const target=wanted.get(id);
    let q=0;
    if(!target)q=p.shares;
    else if(stateful){const signal=signals.find(s=>s.id===id&&s.sellFraction>0);if(signal)q=p.shares*signal.sellFraction;}
    else q=Math.max(0,p.shares-target.weight*equity/bar.open);
    if(q>1e-10)traded+=closeShares(book,p,q,bar,date,cfg,target?'REBALANCE_OR_PARTIAL':'METHOD_EXIT');
    if(stateful&&q>0&&signals.some(s=>s.id===id&&s.sellFraction>0)){
      p.partialDone=true;
      if(signals.some(s=>s.id===id&&(s.moveStopToBreakEven||s.stopAfterSuccessfulPartial==='BREAK_EVEN')))p.stop=Math.max(p.stop,p.entryPrice);
    }
  }
  // Cash shortfalls caused by common costs are scaled proportionately among all
  // simultaneous requested increases; there is no alphabetical capital edge.
  const requests=[];
  for(const target of targets) {
    const bar=bars.get(target.id),held=book.positions.get(target.id);
    if(stateful&&held)continue;
    if(bar?.date!==date||!(Number.isFinite(bar?.open)&&bar.open>0)){book.rejections.push({id:target.id,date,reason:'NO_EXECUTABLE_OPEN'});continue;}
    const fill=bar.open*(1+cfg.slippageBpsPerSide/10000);
    const stop=Number.isFinite(target.stopLevel)?target.stopLevel:Number.isFinite(target.initialStopDistance)?fill-target.initialStopDistance:null;
    if(stop!==null&&!(stop>0&&fill>stop)){book.rejections.push({id:target.id,date,reason:'ENTRY_STOP_NOT_BELOW_FILL'});continue;}
    let weight=target.weight;
    if(validateEntryFill){const valid=validateEntryFill(target,fill);if(!valid?.accepted){book.rejections.push({id:target.id,date,reason:'METHOD_FILL_VALIDATION_REJECTED'});continue;}if(Number.isFinite(valid.maximumEntryWeight))weight=Math.min(weight,valid.maximumEntryWeight);}
    const desired=Math.max(0,weight*equity/fill-(held?.shares||0));
    if(desired>1e-10)requests.push({target,bar,fill,stop,desired,cost:desired*fill*(1+cfg.commissionBpsPerSide/10000)});
  }
  const demand=requests.reduce((s,r)=>s+r.cost,0),scale=demand>0?Math.min(1,Math.max(0,book.cash)/demand):1;
  const budgetProof=budgetRoundingProof({availableCash:book.cash,demand,scale,requestCosts:requests.map(r=>r.cost),requestOperands:requests.map(r=>({desired:r.desired,fill:r.fill})),commissionRate:cfg.commissionBpsPerSide/10000,commissionBpsPerSide:cfg.commissionBpsPerSide});
  for(const r of requests){
    const shares=r.desired*scale,gross=shares*r.fill,fee=gross*cfg.commissionBpsPerSide/10000;
    if(!(shares>0))continue;
    const p=book.positions.get(r.target.id);
    if(p){p.shares+=shares;p.cost+=gross+fee;}
    else book.positions.set(r.target.id,{id:r.target.id,ticker:r.target.ticker,shares,cost:gross+fee,dividends:0,entryPrice:r.fill,entryDate:date,stop:r.stop,entryN:r.target.initialRiskUnit??null,partialDone:false});
    book.cash-=gross+fee;book.executionCosts+=shares*(r.fill-r.bar.open)+fee;traded+=gross;
    book.fills.push({id:r.target.id,date,side:'BUY',shares,price:r.fill,reason:'METHOD_TARGET'});
  }
  const residual=book.cash;book.cash=guardedNumericCash(residual,budgetProof);
  if(residual<0)(book.cashPrecisionCorrections??=[]).push({date,residual,...budgetProof});
  book.turnover+=traded/equity;
  return traded/equity;
}
export function settleTerminals(book,bars,terminals,date,cfg,scenario,{certifiedEvents=[],asOfTimestamp}={}) {
  if(certifiedEvents.length){
    const checks=processCertifiedCashEvents(book,certifiedEvents,{date,asOfTimestamp});
    const bound=new Set(checks.filter(c=>c.accepted).map(c=>c.id));
    terminals=terminals.filter(t=>!bound.has(t.id));
  }
  let traded=0;
  for(const terminal of terminals){
    const p=book.positions.get(terminal.id);if(!p||terminal.date!==date)continue;
    const bar=bars.get(p.id);if(!bar||bar.date!==date||!(Number.isFinite(bar.close)&&bar.close>0))throw new Error('TERMINAL_WITHOUT_BAR');
    const distress=bar.rawClose<1||(terminal.trailingRawReturn60??0)<=-0.5;
    const factor=terminal.delistClass==='ACQUISITION'?1:scenario==='LAST_OBSERVED_PRICE'?1:scenario==='DISTRESS_ZERO_OTHER_MINUS_30'&&distress?0:0.7;
    traded+=closeShares(book,p,p.shares,{...bar,open:bar.close},date,cfg,'TERMINAL_SCENARIO',factor);book.terminalCount++;
  }
  return traded;
}
export function markClose(book,bars,date,turnover=0) {
  for(const[id,b]of bars)book.lastMarks.set(id,b.close);
  const equity=equityAt(book,bars),mv=posValue(book,bars,'close');
  if(!(equity>=0&&Number.isFinite(equity)))throw new Error('ACCOUNTING_INVALID_EQUITY');
  const point={date,equity,exposure:equity?mv/equity:0,n:book.positions.size,turnover};book.curve.push(point);return point;
}
export function reconcileBook(book) {
  const realized=book.trades.reduce((s,t)=>s+t.pnl,0);
  const open=[...book.positions.values()].reduce((s,p)=>s+p.shares*(book.lastMarks.get(p.id)??p.entryPrice)+p.dividends-p.cost,0);
  const expected=book.initialCapital+realized+open+receivableUnrealizedPnl(book);
  const actual=book.curve.at(-1)?.equity??book.cash;
  return{expected,actual,absoluteDifference:Math.abs(actual-expected),pass:Math.abs(actual-expected)<=Math.max(1e-6,actual*1e-10)};
}

export {processCertifiedCashEvents,certifyOfficialCashEvent};
export const RESEARCH_ACCOUNTING_VERSION='OFFICIAL_CASH_RECEIVABLE_TWO_STAGE_V2';
