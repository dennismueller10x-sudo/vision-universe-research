#!/usr/bin/env node
/* Execution ledger for the existing signal study, not a replacement signal engine.
   One funded position at a time; overlapping events remain in the exclusion ledger.
   Round-trip costs are charged at exit as in Signal.outcome (gross exit value * bps).
   No forced liquidation or completed M6 claim for an unfinished final position. */
const fs=require('node:fs'), path=require('node:path');
const Adapter=require('../../quant/engines/weekly-real-adapter.cjs');
const History=require('../../quant/engines/backtest-history.js');
const Signal=require('../../quant/engines/signal-backtest.js');
function run(data,{period='MAX',asOf=data.asOf}={}) {
  if(asOf>data.asOf) throw Error('AS_OF_AFTER_SOURCE');
  const points=data.points.filter(p=>p[0]<=asOf), dates=points.map(p=>p[0]), close=points.map(p=>p[1]);
  const eligibility=History.resolve([{id:'weeklyPrices',dates,warmupBars:Signal.WARMUP_WEEKS,trailingBars:1,coverageStatus:'LIMITED',source:data.sourceHash}],{asOf});
  const window=History.windowFor(period,eligibility,dates.at(-1));
  if(window.state!=='AVAILABLE') throw Error('HISTORY_UNAVAILABLE');
  const start=dates.findIndex(d=>d>=window.startDate), end=dates.length-1;
  const rule=Signal.RULE_BY_ID.NEW_52W_HIGH, events=Signal.detectEvents(close,rule);
  const eventSet=new Set(events), trades=[], exclusions=[], equity=[];
  let cash=100000, position=null;
  for(let i=start;i<=end;i++) {
    if(position && i===position.exitIndex) {
      const gross=position.units*close[i], fees=gross*Signal.FRICTIONS.roundTripBps/10000, slippage=gross*Signal.FRICTIONS.slippageBps/10000;
      const outcome=Signal.outcome(close,position.entryIndex,26);
      cash=gross-fees-slippage;
      trades.push({...position,exitDate:dates[i],exitPrice:close[i],grossExitValue:gross,fees,slippage,netExitValue:cash,netReturn:outcome.ret,completed:true}); position=null;
    }
    if(eventSet.has(i-1) && i-1>=start) {
      if(position) exclusions.push({signalDate:dates[i-1],reason:'POSITION_ALREADY_OPEN'});
      else { position={signalDate:dates[i-1],entryDate:dates[i],entryIndex:i,exitIndex:i+26,entryPrice:close[i],entryCapital:cash,units:cash/close[i]}; cash=0; }
    }
    equity.push({date:dates[i],value:position?position.units*close[i]:cash,benchmark:100000*close[i]/close[start]});
  }
  if(eventSet.has(end)) exclusions.push({signalDate:dates[end],reason:'NEXT_WEEK_CLOSE_UNAVAILABLE'});
  const dd=values=>{let peak=values[0],worst=0;for(const v of values){peak=Math.max(peak,v);worst=Math.min(worst,v/peak-1);}return worst;};
  const final=equity.at(-1), years=(Date.parse(final.date)-Date.parse(equity[0].date))/86400000/365.2425;
  const input={adapterCodeHash:Adapter.hash(fs.readFileSync(require.resolve('../../quant/engines/weekly-real-adapter.cjs'),'utf8')),historyCodeHash:Adapter.hash(fs.readFileSync(require.resolve('../../quant/engines/backtest-history.js'),'utf8')),initialCapital:100000,currency:data.currency,horizonWeeks:26,historyResolverVersion:History.VERSION,signalCodeHash:Adapter.hash(fs.readFileSync(require.resolve('../../quant/engines/signal-backtest.js'),'utf8')),executionCodeHash:Adapter.hash(fs.readFileSync(__filename,'utf8')),version:'real-weekly-ledger-1.0.0',sourceHash:data.sourceHash,sourceBytesHash:data.sourceBytesHash,identityHash:data.identityHash,listingId:data.listingId,ruleId:rule.id,ruleVersion:rule.version,params:rule.params,signalEngineVersion:Signal.VERSION,period,asOf,start:equity[0].date,end:final.date,warmup:Signal.WARMUP_WEEKS,cooldown:Signal.COOLDOWN_WEEKS,entry:'NEXT_WEEK_CLOSE',exit:'ENTRY_PLUS_26_WEEK_CLOSE',overlap:'SKIP_WHILE_OPEN',costs:Signal.FRICTIONS,returnBasis:'PRICE_RETURN'};
  const result={schemaVersion:'real-weekly-backtest-1.0.0',status:'HISTORICAL_PRICE_SIMULATION',certification:'NOT_CERTIFIED',input,inputHash:Adapter.hash(input),provenance:{...data,points:undefined},history:{...eligibility,window,firstEligibleTradeDate:dates[Signal.WARMUP_WEEKS+1],latestTradeDate:dates.at(-1),latestCompletedM6EntryDate:dates.at(-27)||null,latestCompletedM6SignalDate:dates.at(-28)||null},trades,openPosition:position?{...position,completed:false,markDate:final.date,markPrice:close.at(-1),value:position.units*close.at(-1)}:null,exclusions,equity,metrics:{completedTrades:trades.length,totalReturn:final.value/100000-1,cagr:years>0?(final.value/100000)**(1/years)-1:null,maxDrawdown:dd(equity.map(x=>x.value)),fees:trades.reduce((a,t)=>a+t.fees,0),slippage:trades.reduce((a,t)=>a+t.slippage,0)},benchmark:{id:'SAME_LISTING_BUY_AND_HOLD',returnBasis:'PRICE_RETURN',costsBps:0,totalReturn:final.benchmark/100000-1,cagr:(final.benchmark/100000)**(1/years)-1,maxDrawdown:dd(equity.map(x=>x.benchmark))},marketBenchmark:{id:'SPY',state:'UNAVAILABLE',reason:'NO_VERIFIED_FULL_RANGE_PRICE_SERIES_IN_REPOSITORY'}};
  result.resultHash=Adapter.hash(result); return result;
}
if(require.main===module){const args=process.argv.slice(2);const get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback; const root=path.resolve(__dirname,'../..');const result=run(Adapter.load(root,get('--security','ref_NVDA')),{period:get('--period','MAX')});const output=get('--output',null); if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify({inputHash:result.inputHash,resultHash:result.resultHash,history:result.history,metrics:result.metrics,benchmark:result.benchmark}));}
module.exports={run};
