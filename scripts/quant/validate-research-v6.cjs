#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const C=require('../../quant/engines/research-contract.cjs');
const Adapter=require('../../quant/engines/weekly-real-adapter.cjs');
const Weekly=require('./run-real-weekly-backtest.cjs');
const Benchmark=require('../../quant/engines/weekly-benchmark.cjs');
const Source=require('../../quant/engines/research-weekly-source.cjs');
const MC=require('../../quant/engines/research-monte-carlo.cjs');
const ROOT=path.resolve(__dirname,'../..');
function interpretIsolationLog(log,logHash) {
  const childFailed=/Suite selbst ist nicht gruen/.test(log);
  return {id:'isolation-child-suite',state:childFailed?'FAIL':'PASS',reason:childFailed?'CHILD_SUITE_FAILED_OR_TIMED_OUT_SEE_ISOLATION_LOG':'CHILD_SUITE_COMPLETED_WITHOUT_REPORTED_FAILURE',logHash};
}
function main(args=process.argv.slice(2)) {
  const opts={};for(let i=0;i<args.length;i+=2){if(!['--out','--suites'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('INVALID_VALIDATION_ARGUMENTS');opts[args[i]]=args[i+1];}
  if(!opts['--out'])throw Error('PRIVATE_OUTPUT_REQUIRED');
  const out=path.resolve(opts['--out']);if(!path.relative(ROOT,out).startsWith('..'+path.sep))throw Error('OUTPUT_MUST_BE_PRIVATE_OUTSIDE_REPOSITORY');
  fs.mkdirSync(out,{recursive:true,mode:0o700});if(!path.relative(ROOT,fs.realpathSync(out)).startsWith('..'+path.sep))throw Error('OUTPUT_MUST_BE_PRIVATE_OUTSIDE_REPOSITORY');
  const suites=(opts['--suites']||'quant,core,sec,pit,consumers,isolation,real').split(',');
  const known=['quant','core','sec','pit','consumers','isolation','real'];if(suites.some(x=>!known.includes(x))||new Set(suites).size!==suites.length)throw Error('UNKNOWN_OR_DUPLICATE_SUITE');
  const checks=[];
  const run=(id,command,argv)=>{
    console.log('START '+id);const file=path.join(out,id+'.log'),fd=fs.openSync(file,'w',0o600),started=performance.now();
    let result;try{result=cp.spawnSync(command,argv,{cwd:ROOT,env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH},stdio:['ignore',fd,fd],timeout:1800000});}finally{fs.closeSync(fd);}
    const log=fs.readFileSync(file,'utf8');const totals={};for(const field of ['tests','pass','fail','skipped']){const m=log.match(new RegExp('^# '+field+' (\\d+)','m'));if(m)totals[field]=Number(m[1]);}
    const row={id,command:[command,...argv],exitCode:result.status,signal:result.signal||null,state:result.status===0?'PASS':'FAIL',durationMs:performance.now()-started,logHash:C.shaFile(file),...totals};checks.push(row);console.log(JSON.stringify(row));return row;
  };
  if(suites.includes('quant'))run('quant',process.execPath,['--test','quant/tests/*.test.mjs']);
  if(suites.includes('core'))run('core',process.execPath,['--test','core/tests/*.test.mjs']);
  if(suites.includes('sec'))run('sec-python','python3',['-m','unittest','discover','-s','scripts/quant/tests','-p','test_*.py']);
  if(suites.includes('pit'))run('sec-pit-python','python3',['-m','unittest','discover','-s','scripts/vu2','-p','test*.py']);
  if(suites.includes('consumers'))run('consumers',process.execPath,['--test','worker/tests/*.test.mjs','discover/tests/live-stream.test.mjs','discover/tests/live-hub.test.mjs']);
  if(suites.includes('isolation')) {
    run('test-isolation',process.execPath,['scripts/quality/check-test-isolation.mjs']);
    const log=fs.readFileSync(path.join(out,'test-isolation.log'),'utf8');
    // The existing isolation CLI intentionally exits zero when only its child
    // test suite failed/timed out. Preserve that independent result explicitly.
    checks.push(interpretIsolationLog(log,C.shaFile(path.join(out,'test-isolation.log'))));
  }
  if(suites.includes('real')) {
    const data=Adapter.load(ROOT,'ref_NVDA');let benchmark;try{benchmark=Benchmark.load(ROOT);}catch(e){benchmark={error:e.message};}
    for(const period of ['1Y','3Y','5Y','10Y','MAX']){
      const a=Weekly.run(data,{period,benchmark}),b=Weekly.run(data,{period,benchmark});
      const name='real-NVDA-'+period,file=path.join(out,name+'.json');fs.writeFileSync(file,JSON.stringify(a),{mode:0o600});
      checks.push({id:name+'-determinism',state:a.resultHash===b.resultHash?'PASS':'FAIL',inputHash:a.inputHash,resultHash:a.resultHash,completedTrades:a.trades.length,equityObservations:a.equity.length});
      run(name+'-python','python3',['scripts/quant/verify-real-weekly-backtest.py',file]);
    }
    for(const model of ['TRADE_IID','CIRCULAR_BLOCK']){
      const config={root:ROOT,securityId:'ref_NVDA',period:'MAX',model,seed:20261025,simulations:10000,horizon:model==='TRADE_IID'?21:52,retainPaths:4};if(model==='CIRCULAR_BLOCK')config.blockLength=13;
      const {input,sourceEvidence}=Source.loadWeeklyMonteCarloInput(config),result=MC.runMonteCarlo(input);
      const prefix=path.join(out,'mc-'+model);fs.writeFileSync(prefix+'-input.json',JSON.stringify(input),{mode:0o600});fs.writeFileSync(prefix+'-result.json',JSON.stringify(result),{mode:0o600});
      checks.push({id:'mc-'+model+'-source',state:'PASS',scope:sourceEvidence.dataEligibility,sourceEvidence,inputHash:result.inputHash,resultHash:result.resultHash});
      run('mc-'+model+'-python','python3',['scripts/quant/verify-research-monte-carlo.py',prefix+'-input.json',prefix+'-result.json']);
    }
    const loader=Adapter.createLoader(ROOT);
    for(const id of ['ref_AAPL','ref_BGC','ref_AAAC','ref_AACT']){try{loader(id);checks.push({id:'blocked-'+id,state:'FAIL',reason:'EXPECTED_SOURCE_HOLD_NOT_RAISED'});}catch(e){checks.push({id:'blocked-'+id,state:'PASS',reason:e.message,performancePayload:false});}}
    try{const arm=loader('ref_ARM');for(const period of ['1Y','3Y','5Y','10Y','MAX']){const r=Weekly.run(arm,{period,benchmark});checks.push({id:'young-ARM-'+period,state:'PASS',complete:r.history.window.complete,inputHash:r.inputHash,resultHash:r.resultHash});}}catch(e){checks.push({id:'young-ARM',state:'FAIL',reason:e.message});}
  }
  const body={schemaVersion:'quant-v6-validation-1.0.0',createdAt:new Date().toISOString(),baseMain:'675eeb97f2fbe924a991d32fa72387502ded67c5',gitHead:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),runtime:C.runtime(),suites,checks,state:checks.every(c=>c.state==='PASS')?'PASS':'FAIL',certification:'NOT_CERTIFIED',productionApproved:false,limitation:'Engine validation and observed reference checks do not establish full historical universes or independent predictive evidence.'};
  fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify({...body,reportHash:C.hash(body)},null,2)+'\n',{mode:0o600});
  console.log('VALIDATION '+body.state+' '+path.join(out,'validation.json'));if(body.state!=='PASS')process.exitCode=1;
}
if(require.main===module){try{main();}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={main,interpretIsolationLog};
