/**
 * Independent numeric review of one calibration construction.
 * Deliberately imports NOTHING from the accounting, portfolio or metrics modules: it re-derives equity,
 * metrics, execution prices, costs, timing and calendar alignment from the raw fills, trades, curve and
 * source bars with its own code. Output is PASS/FAIL per check with counts only (no ids, no values).
 */
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const close=(a,b,rel=1e-9,abs=1e-9)=>Math.abs(a-b)<=Math.max(abs,rel*Math.max(Math.abs(a),Math.abs(b)));

function lastOnOrBefore(bars,date){let lo=0,hi=bars.length;while(lo<hi){const m=(lo+hi)>>1;if(bars[m].date<=date)lo=m+1;else hi=m;}return lo?bars[lo-1]:null;}
function exactBar(bars,date){const b=lastOnOrBefore(bars,date);return b&&b.date===date?b:null;}
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
function metricsFromCurve(curve,initial){
 const returns=[];
 if(curve[0].equity!==initial)returns.push(curve[0].equity/initial-1);
 for(let i=1;i<curve.length;i++)returns.push(curve[i].equity/curve[i-1].equity-1);
 let peak=initial,dd=0;for(const p of curve){peak=Math.max(peak,p.equity);dd=Math.min(dd,p.equity/peak-1);}
 const m=mean(returns),sd=returns.length>1?Math.sqrt(returns.reduce((s,r)=>s+(r-m)**2,0)/(returns.length-1)):null;
 const days=(Date.parse(curve.at(-1).date+'T00:00:00Z')-Date.parse(curve[0].date+'T00:00:00Z'))/86400000;
 const final=curve.at(-1).equity;
 return{totalReturn:final/initial-1,cagr:days>0?(final/initial)**(365.25/days)-1:null,maxDrawdown:dd,annualizedVolatility:sd===null?null:sd*Math.sqrt(252)};
}

export function reviewBook({key,book,metrics,data,protocol,costMode,formationDates}){
 const initial=protocol.execution.initialCapital;
 const slip=(costMode==='SOURCE_GROSS'?0:protocol.execution.slippageBpsPerSide)/10000,comm=(costMode==='SOURCE_GROSS'?0:protocol.execution.commissionBpsPerSide)/10000;
 const byId=new Map(data.securities.map(s=>[s.id,s]));
 const checks=[],add=(id,hard,checked,violations,note)=>checks.push({id,hard,status:violations===0?'PASS':(hard?'FAIL':'INFO'),checked,violations,...(note?{note}:{})});

 // R1 metrics re-derived from the curve
 const mine=metricsFromCurve(book.curve,initial);let bad=0,n=0;
 for(const k of ['totalReturn','cagr','maxDrawdown','annualizedVolatility']){n++;const a=mine[k],b=metrics?.[k];if(!(a===null&&b===null)&&!(finite(a)&&finite(b)&&close(a,b,1e-12,1e-12)))bad++;}
 add('R1_METRICS_REDERIVED_FROM_CURVE',true,n,bad);

 // R2 calendar alignment
 const cal=data.calendar;bad=book.curve.length!==cal.length?1:0;for(let i=0;i<Math.min(cal.length,book.curve.length);i++)if(book.curve[i].date!==cal[i])bad++;
 add('R2_CURVE_DATES_EQUAL_FROZEN_CALENDAR',true,cal.length,bad);

 // R3 exposure and equity sanity
 bad=0;for(const p of book.curve)if(!(finite(p.equity)&&p.equity>=0&&finite(p.exposure)&&p.exposure>=-1e-12&&p.exposure<=1+1e-9))bad++;
 add('R3_EQUITY_NONNEGATIVE_EXPOSURE_WITHIN_0_1',true,book.curve.length,bad);

 // R4 execution prices come from that day's open (next-session-open convention, slippage only in costed mode)
 let checked=0,badPrice=0,badTerminal=0,missingBar=0,quarantineFills=0,badQuarantine=0;
 for(const f of book.fills){
  const s=byId.get(f.id),b=s?exactBar(s.bars,f.date):null;
  if(!b){
   // A data-quarantine terminal has no source bar on its date: the engine liquidates at the frozen last close.
   if(f.reason==='TERMINAL_SCENARIO'&&s?.terminal?.kind==='DATA_QUARANTINE'&&s.terminal.date===f.date&&finite(s.terminal.lastClose)){
    quarantineFills++;const ratio=f.price/(s.terminal.lastClose*(1-slip));
    if(!(close(ratio,1,1e-9,1e-9)||close(ratio,0.7,1e-9,1e-9)||close(ratio,0,1e-9,1e-9)))badQuarantine++;
    continue;
   }
   missingBar++;continue;
  }
  checked++;
  if(f.reason==='TERMINAL_SCENARIO'){
   const ratio=f.price/(b.close*(1-slip));
   if(!(close(ratio,1,1e-9,1e-9)||close(ratio,0.7,1e-9,1e-9)||close(ratio,0,1e-9,1e-9)))badTerminal++;
  }else{
   const expected=f.side==='BUY'?b.open*(1+slip):b.open*(1-slip);
   if(!close(f.price,expected,1e-9,0))badPrice++;
  }
 }
 add('R4_FILL_PRICES_EQUAL_SESSION_OPEN_PLUS_SLIPPAGE',true,checked,badPrice+missingBar);
 checks.push({id:'R4d_DIAGNOSTIC_SPLIT_CHECKED_IS_FILLS_WITHOUT_SOURCE_BAR_VIOLATIONS_IS_PRICE_MISMATCHES',hard:false,status:'INFO',checked:missingBar,violations:badPrice});
 add('R4b_TERMINAL_FILL_PRICE_IS_LAST_CLOSE_TIMES_SCENARIO_FACTOR',true,book.fills.filter(f=>f.reason==='TERMINAL_SCENARIO').length-quarantineFills,badTerminal);
 add('R4c_QUARANTINE_TERMINAL_FILL_PRICE_IS_FROZEN_LAST_CLOSE_TIMES_SCENARIO_FACTOR',true,quarantineFills,badQuarantine);

 // R5 no look-ahead: every non-terminal fill happens on the first session AFTER a formation date
 const next=new Set();for(const f of formationDates){let lo=0,hi=cal.length;while(lo<hi){const m=(lo+hi)>>1;if(cal[m]<=f)lo=m+1;else hi=m;}if(lo<cal.length)next.add(cal[lo]);}
 bad=0;checked=0;for(const f of book.fills){if(f.reason==='TERMINAL_SCENARIO')continue;checked++;if(!next.has(f.date))bad++;}
 add('R5_EVERY_ORDER_FILLS_ON_FIRST_SESSION_AFTER_A_FORMATION_DATE',true,checked,bad);

 // R6 terminal fills only on the security's terminal date
 bad=0;checked=0;for(const f of book.fills){if(f.reason!=='TERMINAL_SCENARIO')continue;checked++;const s=byId.get(f.id);if(!s?.terminal||s.terminal.date!==f.date)bad++;}
 add('R6_TERMINAL_FILLS_ON_TERMINAL_DATE',true,checked,bad);

 // R7 execution cost recomputation
 let costs=0;for(const f of book.fills){const gross=f.shares*f.price,fee=gross*comm;if(f.side==='BUY'){const open=f.price/(1+slip);costs+=f.shares*(f.price-open)+fee;}else{const mark=slip<1?f.price/(1-slip):f.price;costs+=f.shares*(mark-f.price)+fee;}}
 add('R7_EXECUTION_COSTS_RECOMPUTED_FROM_FILLS',true,book.fills.length,close(costs,book.executionCosts,1e-9,1e-6)?0:1);

 // R8 cash and equity replay from fills + dividends + ending positions marked at the last available close
 let buys=0,sells=0;for(const f of book.fills){if(f.side==='BUY')buys+=f.shares*f.price*(1+comm);else sells+=f.shares*f.price*(1-comm);}
 const cash=initial-buys+sells+book.dividends,last=cal.at(-1);let pos=0;
 for(const p of book.endingPositions){const s=byId.get(p.id),b=s?lastOnOrBefore(s.bars,last):null;pos+=b?p.shares*b.close:Number.NaN;}
 const replayEquity=cash+pos,actual=book.curve.at(-1).equity;
 add('R8_FINAL_EQUITY_REPLAYED_FROM_FILLS_DIVIDENDS_AND_ENDING_POSITIONS',true,1,finite(replayEquity)&&close(replayEquity,actual,1e-9,1e-5)?0:1,finite(replayEquity)?undefined:'ENDING_POSITION_MARK_UNAVAILABLE');

 // R9 benchmark alignment: every curve session exists in the benchmark series
 const bench=data.benchmark?.bars||data.spyBars||[];bad=0;for(const p of book.curve)if(!exactBar(bench,p.date))bad++;
 add('R9_BENCHMARK_HAS_EVERY_CURVE_SESSION',true,book.curve.length,bad);

 // R10 data-quality census (informational): implausible adjusted price levels that were actually traded
 const traded=new Set(book.fills.map(f=>f.id));let implausibleTraded=0,implausibleAny=0;
 for(const s of data.securities){let mx=0;for(const b of s.bars)if(b.close>mx)mx=b.close;if(mx>1e6){implausibleAny++;if(traded.has(s.id))implausibleTraded++;}}
 checks.push({id:'R10_DATA_QUALITY_CENSUS_IMPLAUSIBLE_PRICE_LEVEL_OVER_1E6',hard:false,status:implausibleTraded?'INFO':'PASS',checked:data.securities.length,violations:implausibleTraded,securitiesAboveThreshold:implausibleAny,note:'informational; contract unchanged'});
 const hardFail=checks.filter(c=>c.hard&&c.status==='FAIL');
 return{book:key,status:hardFail.length?'FAIL':'PASS',hardChecks:checks.filter(c=>c.hard).length,failedHardChecks:hardFail.map(c=>c.id),checks};
}

export function reviewConstruction({run,metrics,data,protocol,costMode,methodId}){
 const formationDates=(run.formations||[]).map(f=>f.date);
 const books=['top','bottom','eligibleUniverse'].filter(k=>run[k]).map(k=>reviewBook({key:k,book:run[k],metrics:metrics[k],data,protocol,costMode,formationDates}));
 return{schema:'supertrader-calibration-v3-independent-numeric-review-1.0.0',methodId,costMode,status:books.every(b=>b.status==='PASS')?'PASS':'FAIL',books,independence:'SEPARATE_CODE_PATH_NO_ACCOUNTING_OR_METRICS_IMPORTS; SAME_AUTHOR_SEE_ADVERSARIAL_REVIEW',valuesPublished:false};
}
