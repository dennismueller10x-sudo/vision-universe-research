'use strict';
const Adapter=require('./weekly-real-adapter.cjs');
const Benchmark=require('./weekly-benchmark.cjs');
const Weekly=require('../../scripts/quant/run-real-weekly-backtest.cjs');
const C=require('./research-contract.cjs');
// Recalculate from the existing qualified adapter, never trust uploaded performance metadata.
function loadWeeklyMonteCarloInput({root,securityId,period='MAX',model='CIRCULAR_BLOCK',seed,simulations,horizon,blockLength,retainPaths=0}) {
  if(!['TRADE_IID','CIRCULAR_BLOCK'].includes(model))throw Error('UNKNOWN_MONTE_CARLO_MODEL');
  const data=Adapter.load(root,securityId);
  let benchmark;try{benchmark=Benchmark.load(root);}catch(e){benchmark={error:e.message};}
  const source=Weekly.run(data,{period,benchmark});
  let observations;
  if(model==='TRADE_IID') {
    for(let i=1;i<source.trades.length;i++)if(source.trades[i].entryDate<source.trades[i-1].exitDate)throw Error('OVERLAPPING_FUNDED_TRADES');
    observations=source.trades.filter(t=>t.completed===true).map(t=>({date:t.exitDate,return:t.netReturn}));
  } else {
    let previous=source.equity[0].value;
    if(previous!==source.input.initialCapital)throw Error('INITIAL_EQUITY_REQUIRES_EXPLICIT_START_INTERVAL');
    observations=source.equity.slice(1).map(p=>{if(!(previous>0)||!Number.isFinite(p.value)||p.value<0)throw Error('INVALID_OBSERVED_EQUITY');const r={date:p.date,return:p.value/previous-1};previous=p.value;return r;});
  }
  if(observations.length<2)throw Error('INSUFFICIENT_RESAMPLING_OBSERVATIONS');
  const input={model,seed,simulations,horizon,initialCapital:source.input.initialCapital,observations,returnBasis:source.input.returnBasis,costs:{basis:'ALREADY_NET',modelVersion:source.input.version+':'+source.input.costModel},provenance:{sourceKind:'HISTORICAL_OBSERVED',sourceHash:source.resultHash,sourceVersion:source.schemaVersion,samplingUnit:model==='TRADE_IID'?'NON_OVERLAPPING_TRADE':'REGULAR_PERIOD',scope:'SINGLE_LISTING_HISTORICAL_PRICE_SIMULATION_NOT_MARKET_WIDE_EVIDENCE'},retainPaths};
  if(model==='CIRCULAR_BLOCK')input.blockLength=blockLength;
  const sourceEvidence={schemaVersion:'research-weekly-source-1.0.0',listingId:data.listingId,period,sourceInputHash:source.inputHash,sourceResultHash:source.resultHash,sourceBytesHash:data.sourceBytesHash,identityHash:data.identityHash,sampledObservations:observations.length,completedTrades:source.trades.length,equityPoints:source.equity.length,endCapital:source.equity.at(-1).value,openPosition:!!source.openPosition,sourceWarnings:data.warnings,limitations:['SINGLE_SELECTED_LISTING','PRICE_RETURN_EXCLUDES_DIVIDENDS','NO_UNTOUCHED_HOLDOUT','NO_MARKET_POPULATION_COMPLETENESS',model==='TRADE_IID'?'OPEN_POSITION_AND_IDLE_TIME_EXCLUDED_FROM_TRADE_RESAMPLING':'OPEN_POSITION_MARKS_AND_PAID_COSTS_INCLUDED_NO_FORCED_EXIT'],dataEligibility:'LIMITED_SOURCE_NOT_CERTIFIED',certification:'NOT_CERTIFIED',productionApproved:false};
  return {input,sourceEvidence:{...sourceEvidence,evidenceHash:C.hash(sourceEvidence)}};
}
module.exports={loadWeeklyMonteCarloInput};
