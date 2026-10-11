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
const out=process.argv[process.argv.indexOf('--out')+1];if(!out||!process.argv.includes('--out'))throw new Error('EXPLICIT_OUT_REQUIRED');
fs.mkdirSync(out,{recursive:true});
function publicStatus(row){for(const v of Object.values(row))if(!(typeof v==='boolean'||typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v)||Number.isSafeInteger(v)))throw new Error('PUBLIC_OUTPUT_REJECTED');console.log(JSON.stringify(row));}
function seal(name,obj){const buf=Buffer.from(JSON.stringify(obj));for(const [tag,file]of [['owner',path.join(dir,'../../validation/results-public-key.pem')],['session',path.join(dir,'session-public-key.pem')]])fs.writeFileSync(path.join(out,`${name}.${tag}.sealed.json`),encryptForOwner(fs.readFileSync(file,'utf8'),buf));}
function matchedExposure(curve,benchmark){const bm=new Map(benchmark.map(p=>[p.date,p.equity]));let equity=protocol.execution.initialCapital;return curve.map((p,i)=>{if(i){const r=bm.get(p.date)/bm.get(curve[i-1].date)-1;equity*=1+curve[i-1].exposure*r;}return{date:p.date,equity,exposure:p.exposure,n:p.n};});}
function diagnosticAttribution(run,benchmark){const matched=matchedExposure(run.curve,benchmark),pm=portfolioMetrics(run.curve,{initialCapital:protocol.execution.initialCapital}),bm=portfolioMetrics(benchmark,{initialCapital:protocol.execution.initialCapital}),em=portfolioMetrics(matched,{initialCapital:protocol.execution.initialCapital});return{exposureMatchedBenchmarkMetrics:em,methodMinusExposureMatchedCagr:pm.cagr-em.cagr,exposureAndCashBenchmarkCagrDifference:em.cagr-bm.cagr,transactionCosts:run.executionCosts,dividends:run.dividends,signalEffect:'GROSS_FORWARD_EXCESS_REPORTED_SEPARATELY',sizingEffect:'NOT_CAUSALLY_IDENTIFIED',exitEffect:'NOT_CAUSALLY_IDENTIFIED',cashReturn:0,interpretation:'Descriptive benchmark substitution with lagged exposure; residual includes selection, sizing, exits and costs, not an additive causal decomposition.'};}
function conditionalPortfolio(run,data){const bm=data.benchmark.bars,groups={};for(let i=1;i<run.curve.length;i++){const regime=marketRegime(bm,run.curve[i-1].date,protocol),r=run.curve[i].equity/run.curve[i-1].equity-1;for(const label of [regime.trend,regime.vol,regime.era]){if(!groups[label])groups[label]=[];groups[label].push(r);}}return Object.fromEntries(Object.entries(groups).map(([label,returns])=>[label,{sessions:returns.length,meanDaily:returns.reduce((s,r)=>s+r,0)/returns.length,conditionalCompoundedReturn:returns.reduce((s,r)=>s*(1+r),1)-1,notContiguousTimeSeries:true,cagr:null}]));}
async function main(){
 assertFreeze(freeze);publicStatus({phase:'FREEZE_VERIFIED',methods:methods.length});
 const openedAt=new Date().toISOString();
 const data=await loadHistoricalData({...protocol.window});
 if(data.state!=='AVAILABLE'||!data.coverage.benchmarkAvailable){seal('tournament-data-blocked',{state:data.state,reason:data.reason,diagnostics:data.privateDiagnostics||null,coverage:data.coverage||null,limitations:data.limitations||null});fs.writeFileSync(path.join(out,'tournament-status.json'),JSON.stringify({status:'BLOCKED_DATA',reason:data.reason||'BENCHMARK_MISSING'}));throw new Error('HISTORICAL_DATA_BLOCKED');}
 // Raw input arrays are not required after canonical preparation; avoid retaining
 // a second full copy of every historical row during six independent runs.
 delete data.segs;delete data.spyRaw;delete data.spyAdj;delete data.spyTR;
 prepareSourceFeatures(data);
 seal('tournament-data-ready',{freeze,protocol,openedAt,dataFingerprint:data.fingerprint,dataCoverage:data.coverage,dataLimitations:data.limitations,status:'FINGERPRINTED_BEFORE_FIRST_PERFORMANCE_CALCULATION'});
 const benchmark=benchmarkCurve(data,protocol.execution.initialCapital),benchmarkMetrics=portfolioMetrics(benchmark,{initialCapital:protocol.execution.initialCapital});
 publicStatus({phase:'HISTORICAL_DATA_READY',securities:data.securities.length,sessions:data.calendar.length});
 const results=[];
 for(const method of historicalParticipants){
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
  seal('tournament-checkpoint',{freeze,protocol,openedAt,results,benchmarkMetrics,dataCoverage:data.coverage,dataFingerprint:data.fingerprint});
  publicStatus({phase:'METHOD_COMPLETED',method:method.id,signals:run.signals.length,tier:preliminary.tier,confidence:preliminary.confidence});
 }
 const overlap=methodOverlap(results.map(r=>({id:r.id,signals:r.run.signals,curve:r.run.curve})));
 // No historical price objects are needed for the fresh scanner after metrics.
 // Release them before loading full current source prefixes for causal N20.
 data.securities.length=0;data.benchmark.bars.length=0;data.spyBars=[];
 publicStatus({phase:'CURRENT_SCAN_STARTED'});
 const current=await loadCurrentScannerInputs({asOf:new Date().toISOString().slice(0,10),lookbackBars:1000000});
 if(current.state==='AVAILABLE'){prepareSourceFeatures(current);for(const s of current.scanner){const original=current.securities.find(x=>x.id===s.id);s.sourceFeatures=original.sourceFeatures;}}
 const asOf=current.formationDate||current.benchmark?.bars.at(-1)?.date||null;
 const scans=current.state==='AVAILABLE'&&asOf?methods.map(method=>currentScan(current,method,protocol,asOf)):methods.map(method=>({id:method.id,status:'BLOCKED_DATA',reason:current.reason,asOf:null,numberMatches:0,candidates:[]}));
 const adequate=results.filter(r=>['A','B'].includes(r.ranking.tier)).map(r=>r.id);
 const consensus={strongMethods:currentConsensus(scans,adequate),allFrozenDiagnostic:currentConsensus(scans,historicalParticipants.map(m=>m.id)),notAnIndependentTradingScore:true,eligibleStrongMethods:adequate};
 const ledger={schema:'supertrader-research-forward-ledger-1.0.0',freezeAt:freeze.frozenAt,preparedAt:new Date().toISOString(),status:'PREPARED_NOT_LIVE',methods:results.map(r=>({id:r.id,priority:adequate.includes(r.id)?'HIGH':'LOW',rulebookHash:freeze.methods.find(m=>m.id===r.id).rulebookHash,records:[],baselineSnapshot:scans.find(s=>s.id===r.id),baselineIsPostFreezeSignal:false,appendPolicy:'Only later chronological observations with asOf AFTER freeze.frozenAt; immutable records; no rule changes.'}))};
 const report={schema:'supertrader-full-tournament-private-1.0.0',openedAt,closedAt:new Date().toISOString(),freeze,protocol,dataFingerprint:data.fingerprint,dataCoverage:data.coverage,dataLimitations:data.limitations,currentCoverage:current.coverage,currentLimitations:current.limitations,currentFingerprint:current.fingerprint,currentAsOf:asOf,benchmarkMetrics,results,dataBlocked,overlap,currentScans:scans,consensus,forwardLedger:ledger,allHistoricalResults:'SEEN_HISTORICAL_DATA',status:current.state==='AVAILABLE'?'MEASURED_REVIEW_PENDING':'HISTORICAL_MEASURED_CURRENT_BLOCKED'};
 seal('tournament-results',report);
 const status={status:report.status,methodsImplemented:methods.length,participants:results.length,securities:data.coverage.usableSegments,sessions:data.calendar.length,currentScanCompleted:current.state==='AVAILABLE',currentMethods:scans.length,finalReviewPending:true,methods:results.map(r=>({id:r.id,tier:r.ranking.tier,confidence:r.ranking.confidence,signal:r.ranking.signalClassification,portfolio:r.ranking.portfolioClassification,risk:r.ranking.riskClassification,signals:r.run.signals.length,currentMatches:scans.find(s=>s.id===r.id).numberMatches}))};
 fs.writeFileSync(path.join(out,'tournament-status.json'),JSON.stringify(status,null,2)+'\n');publicStatus({phase:'TOURNAMENT_MEASURED',participants:results.length,currentCompleted:current.state==='AVAILABLE'});
}
main().catch(error=>{seal('tournament-error',{error:String(error?.message||error),stack:String(error?.stack||''),at:new Date().toISOString()});publicStatus({phase:'RUN_FAILED'});process.exitCode=1;});
