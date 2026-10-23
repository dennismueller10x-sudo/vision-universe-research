import fs from 'node:fs';
import path from 'node:path';
import{fileURLToPath}from 'node:url';
import{loadHistoricalData,loadCurrentScannerInputs}from './data.mjs';
import{methods,historicalParticipants,dataBlocked,distinctivenessProduct,prepareSourceFeatures}from './methods.mjs';
import{assertFreeze}from './freeze.mjs';
import{runMethod,benchmarkCurve,currentScan,currentConsensus,populateForwardReturns,marketRegime}from './runner.mjs';
import{portfolioMetrics,signalMetrics,regimeMetrics,methodOverlap,rankEvidence}from './metrics.mjs';
import{encryptForOwner}from '../../validation/lib.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const protocol=JSON.parse(fs.readFileSync(path.join(dir,'protocol.json')));
const freeze=JSON.parse(fs.readFileSync(path.join(dir,'SUPERTRADER-METHOD-FREEZES.json')));
let out;
/** Parse orchestration only; importing this module never loads data or runs engines. */
export function parseRunArguments(argv,allowedMethodIds=historicalParticipants.map(m=>m.id)){
 const options={out:null,only:null,skipCurrent:false,currentOnly:false},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(!['--out','--only','--skip-current','--current-only'].includes(flag))throw new Error('UNKNOWN_RUN_ARGUMENT');
  if(seen.has(flag))throw new Error('DUPLICATE_RUN_ARGUMENT');seen.add(flag);
  if(flag==='--skip-current'){options.skipCurrent=true;continue;}
  if(flag==='--current-only'){options.currentOnly=true;continue;}
  const value=argv[++i];if(typeof value!=='string'||!value.trim()||value.startsWith('--'))throw new Error('RUN_ARGUMENT_VALUE_REQUIRED');
  if(flag==='--out')options.out=value;
  else options.only=value.split(',').map(id=>id.trim());
 }
 if(!options.out)throw new Error('EXPLICIT_OUT_REQUIRED');
 if(options.currentOnly&&(options.only!==null||options.skipCurrent))throw new Error('CONFLICTING_RUN_MODES');
 if(options.only!==null){
  if(options.only.some(id=>!id||!allowedMethodIds.includes(id)))throw new Error('ONLY_REQUIRES_FROZEN_HISTORICAL_PARTICIPANT_IDS');
  if(new Set(options.only).size!==options.only.length)throw new Error('DUPLICATE_ONLY_METHOD_ID');
 }
 options.selectedMethodIds=options.currentOnly?[]:allowedMethodIds.filter(id=>options.only===null||options.only.includes(id));
 return options;
}
function publicStatus(row){for(const v of Object.values(row))if(!(typeof v==='boolean'||typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v)||Number.isSafeInteger(v)))throw new Error('PUBLIC_OUTPUT_REJECTED');console.log(JSON.stringify(row));}
function seal(name,obj){const buf=Buffer.from(JSON.stringify(obj));for(const [tag,file]of [['owner',path.join(dir,'../../validation/results-public-key.pem')],['session',path.join(dir,'session-public-key.pem')]])fs.writeFileSync(path.join(out,`${name}.${tag}.sealed.json`),encryptForOwner(fs.readFileSync(file,'utf8'),buf));}
function matchedExposure(curve,benchmark){const bm=new Map(benchmark.map(p=>[p.date,p.equity]));let equity=protocol.execution.initialCapital;return curve.map((p,i)=>{if(i){const r=bm.get(p.date)/bm.get(curve[i-1].date)-1;equity*=1+curve[i-1].exposure*r;}return{date:p.date,equity,exposure:p.exposure,n:p.n};});}
function diagnosticAttribution(run,benchmark){const matched=matchedExposure(run.curve,benchmark),pm=portfolioMetrics(run.curve,{initialCapital:protocol.execution.initialCapital}),bm=portfolioMetrics(benchmark,{initialCapital:protocol.execution.initialCapital}),em=portfolioMetrics(matched,{initialCapital:protocol.execution.initialCapital});return{exposureMatchedBenchmarkMetrics:em,methodMinusExposureMatchedCagr:pm.cagr-em.cagr,exposureAndCashBenchmarkCagrDifference:em.cagr-bm.cagr,transactionCosts:run.executionCosts,dividends:run.dividends,signalEffect:'GROSS_FORWARD_EXCESS_REPORTED_SEPARATELY',sizingEffect:'NOT_CAUSALLY_IDENTIFIED',exitEffect:'NOT_CAUSALLY_IDENTIFIED',cashReturn:0,interpretation:'Descriptive benchmark substitution with lagged exposure; residual includes selection, sizing, exits and costs, not an additive causal decomposition.'};}
function conditionalPortfolio(run,data){const bm=data.benchmark.bars,groups={};for(let i=1;i<run.curve.length;i++){const regime=marketRegime(bm,run.curve[i-1].date,protocol),r=run.curve[i].equity/run.curve[i-1].equity-1;for(const label of [regime.trend,regime.vol,regime.era]){if(!groups[label])groups[label]=[];groups[label].push(r);}}return Object.fromEntries(Object.entries(groups).map(([label,returns])=>[label,{sessions:returns.length,meanDaily:returns.reduce((s,r)=>s+r,0)/returns.length,conditionalCompoundedReturn:returns.reduce((s,r)=>s*(1+r),1)-1,notContiguousTimeSeries:true,cagr:null}]));}
async function scannerSnapshot(skipCurrent=false){
 if(skipCurrent){
  const current={state:'SKIPPED',reason:'SKIP_CURRENT_FLAG',coverage:{status:'SKIPPED_ORCHESTRATION'},limitations:[],fingerprint:null};
  return{current,asOf:null,scans:methods.map(method=>({id:method.id,status:'SKIPPED_ORCHESTRATION',reason:current.reason,asOf:null,numberMatches:0,candidates:[]}))};
 }
 publicStatus({phase:'CURRENT_SCAN_STARTED'});
 const current=await loadCurrentScannerInputs({asOf:new Date().toISOString().slice(0,10),lookbackBars:1000000});
 if(current.state==='AVAILABLE'){
  prepareSourceFeatures(current);
  const originals=new Map(current.securities.map(s=>[s.id,s]));
  for(const security of current.scanner){const original=originals.get(security.id);security.sourceFeatures=original.sourceFeatures;}
 }
 const asOf=current.formationDate||current.benchmark?.bars.at(-1)?.date||null;
 const scans=current.state==='AVAILABLE'&&asOf?methods.map(method=>currentScan(current,method,protocol,asOf)):methods.map(method=>({id:method.id,status:'BLOCKED_DATA',reason:current.reason,asOf:null,numberMatches:0,candidates:[]}));
 return{current,asOf,scans};
}
function forwardLedger(scans,adequate,methodIds,unranked=false){return{schema:'supertrader-research-forward-ledger-1.0.0',freezeAt:freeze.frozenAt,preparedAt:new Date().toISOString(),status:'PREPARED_NOT_LIVE',methods:methodIds.map(id=>({id,priority:unranked?'UNRANKED':adequate.includes(id)?'HIGH':'LOW',rulebookHash:freeze.methods.find(m=>m.id===id).rulebookHash,records:[],baselineSnapshot:scans.find(s=>s.id===id),baselineIsPostFreezeSignal:false,appendPolicy:'Only later chronological observations with asOf AFTER freeze.frozenAt; immutable records; no rule changes.'}))};}
async function currentOnlyReport(openedAt,options){
 const{current,asOf,scans}=await scannerSnapshot();
 const consensus={strongMethods:currentConsensus(scans,[]),allFrozenDiagnostic:currentConsensus(scans,historicalParticipants.map(m=>m.id)),notAnIndependentTradingScore:true,eligibleStrongMethods:[],strongMethodsGate:'HISTORICAL_RESULTS_NOT_MEASURED_IN_CURRENT_ONLY'};
 const report={schema:'supertrader-current-only-private-1.0.0',openedAt,closedAt:new Date().toISOString(),freeze,protocol,selectedMethodIds:options.selectedMethodIds,currentMethodIds:methods.map(m=>m.id),currentCoverage:current.coverage||null,currentLimitations:current.limitations||null,currentFingerprint:current.fingerprint||null,currentAsOf:asOf,currentScans:scans,consensus,forwardLedger:forwardLedger(scans,[],methods.map(m=>m.id),true),historicalCalculation:'NOT_RUN_CURRENT_ONLY',dataBlocked,status:current.state==='AVAILABLE'&&asOf?'CURRENT_SCANNED_REVIEW_PENDING':'CURRENT_BLOCKED_DATA',privateDiagnostics:current.privateDiagnostics||null};
 seal('tournament-results',report);
 fs.writeFileSync(path.join(out,'tournament-status.json'),JSON.stringify({status:report.status,mode:'CURRENT_ONLY',selectedMethodIds:[],methodsImplemented:methods.length,participants:0,currentScanCompleted:current.state==='AVAILABLE'&&Boolean(asOf),currentMethods:scans.length,finalReviewPending:true},null,2)+'\n');
 publicStatus({phase:'CURRENT_ONLY_COMPLETED',methods:scans.length,currentCompleted:current.state==='AVAILABLE'&&Boolean(asOf)});
}
async function main(options){
 assertFreeze(freeze);publicStatus({phase:'FREEZE_VERIFIED',methods:methods.length});
 const openedAt=new Date().toISOString();
 if(options.currentOnly)return currentOnlyReport(openedAt,options);
 const selectedMethodIds=options.selectedMethodIds;
 const participants=historicalParticipants.filter(m=>selectedMethodIds.includes(m.id));
 const data=await loadHistoricalData({...protocol.window});
 if(data.state!=='AVAILABLE'||!data.coverage.benchmarkAvailable){seal('tournament-data-blocked',{selectedMethodIds,state:data.state,reason:data.reason,diagnostics:data.privateDiagnostics||null,coverage:data.coverage||null,limitations:data.limitations||null});fs.writeFileSync(path.join(out,'tournament-status.json'),JSON.stringify({status:'BLOCKED_DATA',selectedMethodIds,reason:data.reason||'BENCHMARK_MISSING'}));throw new Error('HISTORICAL_DATA_BLOCKED');}
 // Raw input arrays are not required after canonical preparation; avoid retaining
 // a second full copy of every historical row during six independent runs.
 delete data.segs;delete data.spyRaw;delete data.spyAdj;delete data.spyTR;
 prepareSourceFeatures(data);
 seal('tournament-data-ready',{freeze,protocol,openedAt,selectedMethodIds,dataFingerprint:data.fingerprint,dataCoverage:data.coverage,dataLimitations:data.limitations,status:'FINGERPRINTED_BEFORE_FIRST_PERFORMANCE_CALCULATION'});
 const benchmark=benchmarkCurve(data,protocol.execution.initialCapital),benchmarkMetrics=portfolioMetrics(benchmark,{initialCapital:protocol.execution.initialCapital});
 publicStatus({phase:'HISTORICAL_DATA_READY',securities:data.securities.length,sessions:data.calendar.length});
 const results=[];
 for(const method of participants){
  publicStatus({phase:'METHOD_STARTED',method:method.id});
  const run=runMethod(data,method,protocol),portfolio=portfolioMetrics(run.curve,{initialCapital:protocol.execution.initialCapital,turnover:run.turnover,trades:run.trades,executionCosts:run.executionCosts});
  const sensitivity=[];
  for(const variant of [{costMultiplier:2,scenario:protocol.delisting.baseline},{costMultiplier:1,scenario:'LAST_OBSERVED_PRICE'},{costMultiplier:1,scenario:'DISTRESS_ZERO_OTHER_MINUS_30'}]){
   const measured=runMethod(data,method,protocol,{...variant,measureSignals:false});
   const metrics=portfolioMetrics(measured.curve,{initialCapital:protocol.execution.initialCapital,turnover:measured.turnover,trades:measured.trades,executionCosts:measured.executionCosts});
   const forward=run.signals.map(s=>({...s,forward:{}}));populateForwardReturns(forward,data,protocol,undefined,variant.scenario);
   sensitivity.push({...variant,portfolioMetrics:metrics,signalMetrics:signalMetrics(forward),reconciliation:measured.reconciliation});
  }
  const sm=signalMetrics(run.signals),rm=regimeMetrics(run.signals);
  const row={id:method.id,executable:true,fidelityCategory:method.id.startsWith('TURTLE')||method.id.startsWith('WEINSTEIN')||method.id.startsWith('KULLAMAGI')?'LEGENDARY':'SYSTEMATIC',portfolioMetrics:portfolio,signalMetrics:sm,regimeMetrics:rm,dataQuality:{pitListings:true,canonicalPrices:true,terminalScenarioUncertainty:true,missingRequiredPitFundamentals:false},distinctivenessProductScore:distinctivenessProduct[method.id],comparisonsAdequate:true,riskSpecialist:method.id==='LOW_VOLATILITY',sensitivities:{costPass:sensitivity[0].portfolioMetrics.cagr>=benchmarkMetrics.cagr-.01,terminalPass:sensitivity.slice(1).every(s=>Math.sign(s.portfolioMetrics.cagr-benchmarkMetrics.cagr)===Math.sign(portfolio.cagr-benchmarkMetrics.cagr)&&Math.sign(s.signalMetrics.horizons[63].meanExcess)===Math.sign(sm.horizons[63].meanExcess))},adversarialReviewPass:false};
  const preliminary=rankEvidence(row,benchmarkMetrics,protocol);
  results.push({...row,ranking:preliminary,run,sensitivity,attribution:diagnosticAttribution(run,benchmark),conditionalPortfolio:conditionalPortfolio(run,data),marketCapRobustness:{status:'MISSING_PIT_MARKET_CAP',large:null,midSmall:null},reviewStatus:'PENDING_FINAL_ADVERSARIAL_REVIEW'});
  // Persist encrypted incremental checkpoints for recovery, never raw results.
  seal('tournament-checkpoint',{freeze,protocol,openedAt,selectedMethodIds,results,benchmarkMetrics,dataCoverage:data.coverage,dataFingerprint:data.fingerprint});
  publicStatus({phase:'METHOD_COMPLETED',method:method.id,signals:run.signals.length,tier:preliminary.tier,confidence:preliminary.confidence});
 }
 const overlap=methodOverlap(results.map(r=>({id:r.id,signals:r.run.signals,curve:r.run.curve})));
 // No historical price objects are needed for the fresh scanner after metrics.
 // Release them before loading full current source prefixes for causal N20.
 data.securities.length=0;data.benchmark.bars.length=0;data.spyBars=[];
 const{current,asOf,scans}=await scannerSnapshot(options.skipCurrent);
 const adequate=results.filter(r=>['A','B'].includes(r.ranking.tier)).map(r=>r.id);
 const consensus={strongMethods:currentConsensus(scans,adequate),allFrozenDiagnostic:currentConsensus(scans,historicalParticipants.map(m=>m.id)),notAnIndependentTradingScore:true,eligibleStrongMethods:adequate};
 const ledger=forwardLedger(scans,adequate,results.map(r=>r.id));
 const report={schema:'supertrader-full-tournament-private-1.0.0',openedAt,closedAt:new Date().toISOString(),freeze,protocol,selectedMethodIds,overlapScope:'SELECTED_HISTORICAL_PARTICIPANTS_ONLY',dataFingerprint:data.fingerprint,dataCoverage:data.coverage,dataLimitations:data.limitations,currentCoverage:current.coverage,currentLimitations:current.limitations,currentFingerprint:current.fingerprint,currentAsOf:asOf,benchmarkMetrics,results,dataBlocked,overlap,currentScans:scans,consensus,forwardLedger:ledger,allHistoricalResults:'SEEN_HISTORICAL_DATA',status:current.state==='SKIPPED'?'HISTORICAL_MEASURED_CURRENT_SKIPPED':current.state==='AVAILABLE'?'MEASURED_REVIEW_PENDING':'HISTORICAL_MEASURED_CURRENT_BLOCKED'};
 seal('tournament-results',report);
 const status={status:report.status,selectedMethodIds,methodsImplemented:methods.length,participants:results.length,securities:data.coverage.usableSegments,sessions:data.calendar.length,currentScanCompleted:current.state==='AVAILABLE',currentMethods:scans.length,finalReviewPending:true,methods:results.map(r=>({id:r.id,tier:r.ranking.tier,confidence:r.ranking.confidence,signal:r.ranking.signalClassification,portfolio:r.ranking.portfolioClassification,risk:r.ranking.riskClassification,signals:r.run.signals.length,currentMatches:scans.find(s=>s.id===r.id).numberMatches}))};
 fs.writeFileSync(path.join(out,'tournament-status.json'),JSON.stringify(status,null,2)+'\n');publicStatus({phase:'TOURNAMENT_MEASURED',participants:results.length,currentCompleted:current.state==='AVAILABLE'});
}
async function runCLI(){
 try{
  // Establish a private error destination before validating method selection.
  // A missing --out cannot produce a deliverable; its console error stays generic.
  const raw=process.argv.slice(2),outIndex=raw.indexOf('--out');
  if(outIndex>=0&&typeof raw[outIndex+1]==='string'&&raw[outIndex+1]&&!raw[outIndex+1].startsWith('--')){out=raw[outIndex+1];fs.mkdirSync(out,{recursive:true});}
  const options=parseRunArguments(raw);out=options.out;
  await main(options);
 }catch(error){
  if(out){try{seal('tournament-error',{error:String(error?.message||error),stack:String(error?.stack||''),at:new Date().toISOString()});}catch{/* Never expose private diagnostics when output storage or encryption itself fails. */}}
  publicStatus({phase:'RUN_FAILED'});process.exitCode=1;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runCLI();
