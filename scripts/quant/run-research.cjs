#!/usr/bin/env node
'use strict';
// Offline Node entrypoint only. No provider fetch, public transport or product registry.
const fs=require('node:fs'),path=require('node:path');
const C=require('../../quant/engines/research-contract.cjs');
const Store=require('../../quant/engines/research-artifacts.cjs');
const V=require('../../quant/engines/research-validation.cjs');
const S=require('../../quant/engines/research-studies.cjs');
const P=require('../../quant/engines/research-portfolio.cjs');
const MC=require('../../quant/engines/research-monte-carlo.cjs');
function recordedSensitivityEvaluator(rows){return p=>{const r=rows.get(V.hash(p));if(!r)throw Error('MISSING_REGISTERED_GRID_RESULT');return r;};}
const METHODS={
  replay:['SAME_STOCK_REPLAY',S.runReplayValidation],pattern:['PATTERN_EVIDENCE',S.runPatternStudy],
  signal:['SIGNAL_BACKTEST',S.runSignalStudy],setup:['SETUP_BACKTEST',S.runSetupStudy],
  strategy:['STRATEGY_BACKTEST',P.runPortfolio],factor:['FACTOR_RANKING_BACKTEST',S.runFactorStudy],
  'monte-carlo':['MONTE_CARLO',MC.runMonteCarlo],
  'walk-forward':['WALK_FORWARD',x=>V.buildWalkForward(x.config,x.events)],
  'out-of-sample':['OUT_OF_SAMPLE',x=>V.aggregateOos(x.partition,x.observations)],
  regime:['MARKET_REGIME',S.analyzeRegimes],event:['EVENT_DRIVEN',S.runEventStudy],
  rebalancing:['PORTFOLIO_REBALANCING',P.runPortfolio],
  sensitivity:['PARAMETER_SENSITIVITY',x=>{
    // A sealed precomputed grid is consumable without evaluating arbitrary source code.
    // Its actual evaluator/data provenance still requires an independent audit.
    if(!Array.isArray(x.results))throw Error('SENSITIVITY_RECORDED_GRID_REQUIRED');
    const rows=new Map();for(const r of x.results){const h=V.hash(r.parameters);if(rows.has(h))throw Error('DUPLICATE_GRID_RESULT');rows.set(h,r.result);}
    if(rows.size!==x.registration.points.length)throw Error('GRID_RESULT_COUNT_MISMATCH');
    return V.runSensitivity(x.registration,recordedSensitivityEvaluator(rows),x.context);
  }]
};
function execute(method,input) {
  if(!Object.hasOwn(METHODS,method))throw Error('UNKNOWN_RESEARCH_METHOD');
  const [area,fn]=METHODS[method],result=fn(input);
  const envelope=C.envelope(area,input,result);
  const files=['quant/engines/research-contract.cjs','quant/engines/research-methodology.cjs','quant/engines/research-studies.cjs','quant/engines/research-portfolio.cjs','quant/engines/research-validation.cjs','quant/engines/research-monte-carlo.cjs','quant/engines/signal-backtest.js','quant/engines/pattern-research.js','quant/engines/setup-engine.js','quant/engines/profile-backtest.js','quant/engines/backtest.js','scripts/quant/run-research.cjs'];
  const repository=path.resolve(__dirname,'../..');
  const dependencies=Object.fromEntries(files.map(p=>[p,C.shaFile(path.join(repository,p))]));
  const body={...envelope,dependencies,dependencyHash:C.hash(dependencies)};delete body.resultHash;
  return {...body,resultHash:C.hash(body)};
}
function cli(args=process.argv.slice(2)) {
  if(args.length===1&&args[0]==='--help'){console.log('Offline research: --method '+Object.keys(METHODS).join('|')+' --input input.json --out /private/research-store');return;}
  const options={};for(let i=0;i<args.length;i+=2){if(!['--method','--input','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('INVALID_ARGUMENTS');options[args[i]]=args[i+1];}
  if(!options['--method']||!options['--input']||!options['--out'])throw Error('METHOD_INPUT_AND_PRIVATE_OUTPUT_REQUIRED');
  if(fs.statSync(options['--input']).size>32*1024*1024)throw Error('RESEARCH_INPUT_BUDGET_EXCEEDED');
  const result=execute(options['--method'],JSON.parse(fs.readFileSync(options['--input'],'utf8')));
  const publication=Store.publish(options['--out'],result);
  console.log(JSON.stringify({area:result.area,...publication,resultHash:result.resultHash,certification:'NOT_CERTIFIED',productionApproved:false}));
}
if(require.main===module){try{cli();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={execute,cli,METHODS,recordedSensitivityEvaluator};
