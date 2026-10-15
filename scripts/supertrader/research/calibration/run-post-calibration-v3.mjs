/** V3 copy of run-post-calibration-v2 for ONE method per process: V3 freeze, content-bound inputs, public hash-bound calibration completion, accounting v3. Importing never loads prices or calculates outcomes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {historicalParticipants,prepareSourceFeatures} from '../tournament/methods.mjs';
import {portfolioMetrics,signalMetrics,regimeMetrics,methodOverlap} from '../tournament/metrics.mjs';
import {sealFileStream} from './seal-stream-v3.mjs';
import {verifyFreezeV3,verifyContentAgainstFreeze} from './freeze-v3.mjs';
import {loadCanonicalData} from '../certification/canonical-input.mjs';
import {prepareRerunData,writePrivateJson,sensitivityGates} from '../certification/run-rerun.mjs';
import {runMethod,populateForwardReturns,benchmarkCurve,marketRegime} from './runner-certified-v3.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../../..');
const PROTOCOL=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/tournament/protocol.json')));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const readJSON=file=>JSON.parse(fs.readFileSync(file));
export const POST_CALIBRATION_METHOD_IDS=Object.freeze(historicalParticipants.map(m=>m.id));
export const POST_CALIBRATION_VERSION='V3_CONTENT_BOUND_ACCOUNTING_V3_ALL_SIX_FROZEN_METHODS_ONE_PROCESS_PER_METHOD';
export function verifyCalibrationFreeze(freeze){return verifyFreezeV3(freeze,{root:ROOT});}

export function parsePostCalibrationArguments(argv){
 const options={heapMiB:12000,workerMethod:null},seen=new Set();
 const flags=new Map([['--freeze','freezeFile'],['--input-dir','inputDir'],['--out','out'],['--reference-parsed','referenceParsed'],['--public-out','publicOut'],['--calibration-completion','calibrationCompletionFile'],['--completion-sha','completionSHA'],['--heap-mb','heapMiB'],['--worker-method','workerMethod']]);
 for(let i=0;i<argv.length;i++){
  const flag=argv[i],key=flags.get(flag);if(!key||seen.has(flag))throw Error('UNKNOWN_OR_DUPLICATE_POST_CALIBRATION_ARGUMENT');seen.add(flag);
  const value=argv[++i];if(!value||value.startsWith('--'))throw Error('POST_CALIBRATION_ARGUMENT_VALUE_REQUIRED');options[key]=value;
 }
 for(const k of ['freezeFile','inputDir','out','referenceParsed','publicOut','calibrationCompletionFile'])if(!options[k])throw Error('ALL_V3_POST_CALIBRATION_ARGUMENTS_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(options.completionSHA??''))throw Error('HASH_BOUND_CALIBRATION_COMPLETION_REQUIRED');
 options.heapMiB=Number(options.heapMiB);if(!Number.isSafeInteger(options.heapMiB)||options.heapMiB<4096||options.heapMiB>12000)throw Error('WORKER_HEAP_MUST_BE_4096_TO_12000_MIB');
 if(!POST_CALIBRATION_METHOD_IDS.includes(options.workerMethod))throw Error('ORIGINAL_HISTORICAL_METHOD_WORKER_REQUIRED');
 return options;
}

function privateFile(file,{mkdir=false}={}){
 const p=path.resolve(file);if(!p.startsWith('/workspace/private/'))throw Error('PRIVATE_PATH_REQUIRED');
 if(mkdir)fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});
 const parent=fs.realpathSync(path.dirname(p));if(parent!=='/workspace/private'&&!parent.startsWith('/workspace/private/'))throw Error('PRIVATE_REAL_PARENT_REQUIRED');
 if(fs.existsSync(p)&&!fs.realpathSync(p).startsWith('/workspace/private/'))throw Error('PRIVATE_REAL_FILE_REQUIRED');return p;
}
export async function hashPrivateArtifact(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(privateFile(file)))h.update(chunk);return h.digest('hex');}
export async function writeDurablePrivateArtifact(file,value){
 const p=privateFile(file,{mkdir:true});await writePrivateJson(p,value);
 const fd=fs.openSync(p,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const parent=fs.openSync(path.dirname(p),'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
 return {path:p,sha256:await hashPrivateArtifact(p),bytes:fs.statSync(p).size,durable:true};
}
function frozenFile(freezeFile,expected){const p=path.resolve(freezeFile),bytes=fs.readFileSync(p);if(expected&&hash(bytes)!==expected)throw Error('CALIBRATION_FREEZE_BYTES_CHANGED_DURING_RUN');const freeze=JSON.parse(bytes);verifyCalibrationFreeze(freeze);return {freeze,sha256:hash(bytes)};}
let contentVerified=false;
function sourceChecks(options,freeze){
 privateFile(path.join(options.inputDir,'canonical-dataset-manifest.json'));privateFile(path.join(options.inputDir,'data-certification-inputs.json'));privateFile(options.referenceParsed);
 if(!contentVerified){verifyContentAgainstFreeze(freeze,{inputDir:options.inputDir,referenceParsedPath:options.referenceParsed});contentVerified=true;}
}
function phase(phaseName,method){console.log(JSON.stringify({phase:phaseName,...(method?{method}:{})}));}

/** Post-calibration launch gate (V3): a public, hash-bound completion receipt for exactly this freeze. */
export async function verifyCalibrationCompletion({file,expectedSHA,freezeSHA256,freezeId}={}){
 if(!/^[a-f0-9]{64}$/.test(expectedSHA??'')||!/^[a-f0-9]{64}$/.test(freezeSHA256??''))throw Error('EXACT_COMPLETION_AND_FREEZE_HASHES_REQUIRED');
 const p=path.resolve(file),bytes=fs.readFileSync(p);if(hash(bytes)!==expectedSHA)throw Error('CALIBRATION_COMPLETION_RECEIPT_CHANGED');
 const c=JSON.parse(bytes),calProtocol=path.join(ROOT,'scripts/supertrader/research/calibration/protocol.json');
 if(c.schema!=='supertrader-calibration-v3-completion-1.0.0'||c.status!=='CALIBRATION_COMPLETE_NUMERIC_REVIEW_PASSED'||c.freezeFileSha256!==freezeSHA256||(freezeId&&c.freezeId!==freezeId)||c.protocolSha256!==hash(fs.readFileSync(calProtocol))||!['CERTIFIED','PARTIALLY_CERTIFIED','NOT_CERTIFIED'].includes(c.overallVerdict))throw Error('ACTUAL_V3_CALIBRATION_COMPLETION_REQUIRED');
 const ids=readJSON(path.join(ROOT,'scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-METHODS.json')).referenceScreens.map(s=>s.id),screens=c.referenceScreens;
 if(ids.length!==8||!Array.isArray(screens)||screens.length!==8||new Set(screens.map(s=>s.id)).size!==8||screens.some(s=>!ids.includes(s.id)))throw Error('ALL_EIGHT_EXACT_REGISTERED_CALIBRATION_SCREENS_REQUIRED');
 for(const screen of screens)if(!['COMPLETED','BLOCKED_DATA','BLOCKED_SOURCE','BLOCKED_RULE'].includes(screen.status)||screen.status==='COMPLETED'&&!['PASS','PARTIAL','FAIL'].includes(screen.verdict)||screen.status!=='COMPLETED'&&screen.verdict!==null)throw Error('COMPLETED_OR_HONEST_NULL_BLOCKED_CALIBRATION_SCREENS_REQUIRED');
 const reviews=c.numericReviews;if(!Array.isArray(reviews)||reviews.length!==screens.filter(s=>s.status==='COMPLETED').length*2||reviews.some(r=>r.status!=='PASS'||!/^[a-f0-9]{64}$/.test(r.reviewSha256??'')))throw Error('PASSED_NUMERIC_REVIEW_PER_COMPLETED_SCREEN_AND_COST_MODE_REQUIRED');
 return {path:p,sha256:expectedSHA,freezeId:c.freezeId,freezeFileSha256:freezeSHA256,protocolSha256:c.protocolSha256,overallVerdict:c.overallVerdict,screens:8,numericReviews:reviews.length};
}

/** Source census only: no returns, rankings, signal generation or benchmark performance. */
export function executionOpenSourceCensus(data){
 const sessions=new Set(data.calendar.slice(1)),positive=x=>Number.isFinite(x)&&x>0;
 let stockRows=0,invalidStockRows=0,affectedSecurities=0;
 for(const security of data.securities){let affected=false;for(const bar of security.bars)if(sessions.has(bar.date)){stockRows++;if(!positive(bar.open)){invalidStockRows++;affected=true;}}if(affected)affectedSecurities++;}
 const benchmark=new Map((data.benchmark?.bars||data.spyBars||[]).map(b=>[b.date,b]));let invalidBenchmarkRows=0,missingBenchmarkRows=0;
 for(const date of sessions){const b=benchmark.get(date);if(!b)missingBenchmarkRows++;else if(!positive(b.open))invalidBenchmarkRows++;}
 return {scope:'SOURCE_EXECUTION_SESSION_ROWS_NOT_SIGNAL_INCIDENCE',stockRows,invalidStockRows,affectedSecurities,invalidBenchmarkRows,missingBenchmarkRows,
  priorAffectedSignalCount:null,priorAffectedSignalCountStatus:'UNKNOWN_PRIOR_SIGNAL_ARTIFACTS_NOT_LOADED',earlierResultAttribution:'NOT_ESTABLISHED_FROM_SOURCE_ROWS',performanceCalculated:false};
}

function matchedExposure(curve,benchmark){const bm=new Map(benchmark.map(p=>[p.date,p.equity]));let equity=PROTOCOL.execution.initialCapital;return curve.map((p,i)=>{if(i)equity*=1+curve[i-1].exposure*(bm.get(p.date)/bm.get(curve[i-1].date)-1);return {date:p.date,equity,exposure:p.exposure,n:p.n};});}
function attribution(run,benchmark){
 const options={initialCapital:PROTOCOL.execution.initialCapital},portfolio=portfolioMetrics(run.curve,options),full=portfolioMetrics(benchmark,options),matched=portfolioMetrics(matchedExposure(run.curve,benchmark),options);
 return {exposureMatchedBenchmarkMetrics:matched,methodMinusExposureMatchedCagr:portfolio.cagr-matched.cagr,exposureAndCashBenchmarkCagrDifference:matched.cagr-full.cagr,transactionCosts:run.executionCosts,dividends:run.dividends,cashReturn:0,signalEffect:'GROSS_FORWARD_EXCESS_REPORTED_SEPARATELY',sizingEffect:'NOT_CAUSALLY_IDENTIFIED',exitEffect:'NOT_CAUSALLY_IDENTIFIED',interpretation:'DESCRIPTIVE_LAGGED_EXPOSURE_BENCHMARK_SUBSTITUTION_NOT_ADDITIVE_CAUSAL_DECOMPOSITION'};
}
function conditionalPortfolio(run,data){const groups={};for(let i=1;i<run.curve.length;i++){const regime=marketRegime(data.benchmark?.bars||data.spyBars,run.curve[i-1].date,PROTOCOL),r=run.curve[i].equity/run.curve[i-1].equity-1;for(const label of [regime.trend,regime.vol,regime.era])(groups[label]??=[]).push(r);}return Object.fromEntries(Object.entries(groups).map(([label,returns])=>[label,{sessions:returns.length,meanDaily:returns.reduce((s,r)=>s+r,0)/returns.length,conditionalCompoundedReturn:returns.reduce((s,r)=>s*(1+r),1)-1,notContiguousTimeSeries:true,cagr:null}]));}
const portfolioFor=run=>portfolioMetrics(run.curve,{initialCapital:PROTOCOL.execution.initialCapital,turnover:run.turnover,trades:run.trades,executionCosts:run.executionCosts});

/** One worker's actual method; durable callback must resolve before any performance. */
export async function measurePostCalibrationMethod({data,methodId,freeze,calibrationCompletion,beforePerformance,artifactSink,beforeVariant=()=>{}}={}){
 verifyCalibrationFreeze(freeze);
 if(!POST_CALIBRATION_METHOD_IDS.includes(methodId))throw Error('ORIGINAL_HISTORICAL_METHOD_REQUIRED');
 if(typeof beforePerformance!=='function'||typeof artifactSink!=='function')throw Error('DURABLE_PREFLIGHT_AND_RAW_ARTIFACT_SINKS_REQUIRED');
 const completion=await verifyCalibrationCompletion(calibrationCompletion);
 const prepared=prepareRerunData(data,PROTOCOL),sourceCensus=executionOpenSourceCensus(prepared.data);
 const ready={...prepared.beforePerformance,schema:'post-calibration-method-preperformance-receipt-1.0',methodId,orchestrationVersion:POST_CALIBRATION_VERSION,calibrationCompletion:completion,executionOpenSourceCensus:sourceCensus,originalControls:'NOT_RERUN_SAME_CANONICAL_632_CONTROL_RETAINED',oldScore:null,dataQualityStatus:'OBSERVED_ONLY',terminalSensitivityPolicy:'ALL_PORTFOLIOS_AND_FORWARD_OUTCOMES_RECOMPUTED_NO_OLD_REUSE'};
 const preflightReceipt=await beforePerformance(ready);
 if(preflightReceipt?.durable!==true||!/^[a-f0-9]{64}$/.test(preflightReceipt.sha256??''))throw Error('DURABLE_PREPERFORMANCE_RECEIPT_REQUIRED');
 prepareSourceFeatures(data);const originals=new Map(data.securities.map(s=>[s.id,s]));for(const s of prepared.data.securities)s.sourceFeatures=originals.get(s.id).sourceFeatures;
 await beforeVariant('BASELINE');verifyCalibrationFreeze(freeze);await verifyCalibrationCompletion(calibrationCompletion);
 const benchmark=benchmarkCurve(prepared.data,PROTOCOL.execution.initialCapital),benchmarkMetrics=portfolioMetrics(benchmark,{initialCapital:PROTOCOL.execution.initialCapital});
 const method=historicalParticipants.find(m=>m.id===methodId),baseline=runMethod(prepared.data,method,PROTOCOL);
 if(baseline.reconciliation?.pass!==true)throw Error('BASELINE_ACCOUNTING_RECONCILIATION_REQUIRED');
 const portfolio=portfolioFor(baseline),signal=signalMetrics(baseline.signals),regimes=regimeMetrics(baseline.signals),artifacts=[],sensitivities=[];
 artifacts.push(await artifactSink('baseline-raw.private.json',{schema:'post-calibration-full-raw-method-variant-1.0',methodId,variant:'BASELINE',costMultiplier:1,scenario:PROTOCOL.delisting.baseline,sourceDataFingerprint:ready.sourceDataFingerprint,effectiveDataFingerprint:ready.effectiveDataFingerprint,preflightReceipt,run:baseline,benchmark,benchmarkMetrics,portfolioMetrics:portfolio,signalMetrics:signal,regimeMetrics:regimes,fullRaw:true,sourceRulesUnchanged:true}));
 const variants=[{name:'DOUBLE_COST',costMultiplier:PROTOCOL.execution.costSensitivityMultiplier,scenario:PROTOCOL.delisting.baseline},...PROTOCOL.delisting.sensitivity.map((scenario,i)=>({name:`TERMINAL_${i+1}`,costMultiplier:1,scenario}))];
 for(const variant of variants){
  await beforeVariant(variant.name);verifyCalibrationFreeze(freeze);await verifyCalibrationCompletion(calibrationCompletion);
  const run=runMethod(prepared.data,method,PROTOCOL,{costMultiplier:variant.costMultiplier,scenario:variant.scenario,measureSignals:false});
  if(run.reconciliation?.pass!==true)throw Error('SENSITIVITY_ACCOUNTING_RECONCILIATION_REQUIRED');
  const forward=variant.scenario===PROTOCOL.delisting.baseline?baseline.signals:baseline.signals.map(s=>({...s,forward:{}}));
  if(variant.scenario!==PROTOCOL.delisting.baseline)populateForwardReturns(forward,prepared.data,PROTOCOL,undefined,variant.scenario);
  const pm=portfolioFor(run),sm=signalMetrics(forward);
  const artifact=await artifactSink(variant.name.toLowerCase()+'-raw.private.json',{schema:'post-calibration-full-raw-method-variant-1.0',methodId,variant:variant.name,costMultiplier:variant.costMultiplier,scenario:variant.scenario,sourceDataFingerprint:ready.sourceDataFingerprint,effectiveDataFingerprint:ready.effectiveDataFingerprint,preflightReceipt,run,forwardSignalOutcomes:{basis:'SAME_BASELINE_SOURCE_SETUP_CENSUS_NOT_VARIANT_PORTFOLIO_CONDITIONED',signals:forward,forwardReturnsRecomputed:variant.scenario!==PROTOCOL.delisting.baseline,grossReturnsIgnorePortfolioCosts:true},portfolioMetrics:pm,signalMetrics:sm,fullRaw:true,reusedOld632Artifact:false});
  artifacts.push(artifact);sensitivities.push({costMultiplier:variant.costMultiplier,scenario:variant.scenario,portfolioMetrics:pm,signalMetrics:sm,reconciliation:run.reconciliation,artifact});
 }
 for(const a of artifacts)if(a?.durable!==true||!/^[a-f0-9]{64}$/.test(a.sha256??''))throw Error('FULL_RAW_ARTIFACT_RECEIPTS_REQUIRED');
 const overlapArtifact=await artifactSink('overlap-input.private.json',{id:methodId,signals:baseline.signals.map(s=>({id:s.id,date:s.date})),curve:baseline.curve,sourceDataFingerprint:ready.sourceDataFingerprint,effectiveDataFingerprint:ready.effectiveDataFingerprint});
 return {schema:'post-calibration-method-summary-private-1.0',id:methodId,calibrationCompletion:completion,preflightReceipt,sourceDataFingerprint:ready.sourceDataFingerprint,effectiveDataFingerprint:ready.effectiveDataFingerprint,benchmarkMetrics,portfolioMetrics:portfolio,signalMetrics:signal,regimeMetrics:regimes,sensitivity:sensitivities,sensitivities:sensitivityGates(portfolio,signal,sensitivities,benchmarkMetrics,PROTOCOL),attribution:attribution(baseline,benchmark),conditionalPortfolio:conditionalPortfolio(baseline,prepared.data),executionOpenSourceCensus:sourceCensus,artifacts,overlapArtifact,
  dataQuality:{status:'OBSERVED_ONLY',pitListings:false,canonicalPrices:true,terminalScenarioUncertainty:true,missingRequiredPitFundamentals:false},oldScore:null,ranking:{score:null,tier:null,status:'DEFERRED_POST_CALIBRATION_REVIEW'},qualification:{tierCeiling:'C',confidence:'LOW',fullyQualified:false,status:'RESEARCH_ONLY_REVIEW_PENDING'},terminalSensitivityPolicy:'ACTUAL_NEW_GUARD_PORTFOLIO_RUNS_ALL_VARIANTS_NO_OLD_ARTIFACT_REUSE',originalControlStatus:'NOT_RERUN_SAME_CANONICAL_632_CONTROL_RETAINED',reconciliation:baseline.reconciliation,finalReviewPending:true};
}

function recipients(){return{owner:fs.readFileSync(path.join(ROOT,'scripts/supertrader/validation/results-public-key.pem'),'utf8'),session:fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/tournament/session-public-key.pem'),'utf8')};}
/** Seals every plaintext artifact of this worker (streaming), removes the plaintext, returns the public manifest. */
export async function sealWorkerOutputs(dir,keys=recipients()){
 const manifest=[];
 for(const name of fs.readdirSync(dir).sort()){
  if(name.endsWith('.sealed')||name.endsWith('.partial'))continue;
  const input=path.join(dir,name);if(!fs.statSync(input).isFile())continue;
  const r=await sealFileStream({input,output:input+'.sealed',recipients:keys});
  fs.rmSync(input);manifest.push({name,...r});
 }
 return manifest;
}

async function worker(options,freeze,freezeSHA){
 sourceChecks(options,freeze);
 const localSourceSha=hash(fs.readFileSync(path.join(options.inputDir,'data-certification-inputs.json')));
 const data=loadCanonicalData(options.inputDir,{sourceProvenanceOverlay:true,expectedSourceMetadataSha256:localSourceSha});sourceChecks(options,freeze);
 if(data.sourceProvenanceOverlay?.priceBarsUnchanged!==true||data.sourceProvenanceOverlay?.performanceCalculated!==false)throw Error('UNCHANGED_SOURCE_OVERLAY_PROOF_REQUIRED');
 const calibrationCompletion={file:options.calibrationCompletionFile,expectedSHA:options.completionSHA,freezeSHA256:freezeSHA,freezeId:freeze.freezeId};
 const summary=await measurePostCalibrationMethod({data,methodId:options.workerMethod,freeze,calibrationCompletion,
  beforePerformance:ready=>writeDurablePrivateArtifact(path.join(options.out,'data-ready.private.json'),{...ready,calibrationFreezeFileSHA256:freezeSHA}),
  artifactSink:(name,payload)=>writeDurablePrivateArtifact(path.join(options.out,name),payload),
  beforeVariant:()=>{frozenFile(options.freezeFile,freezeSHA);sourceChecks(options,freeze);},
 });
 frozenFile(options.freezeFile,freezeSHA);sourceChecks(options,freeze);
 await writeDurablePrivateArtifact(path.join(options.out,'summary.private.json'),{...summary,calibrationFreezeFileSHA256:freezeSHA});
 const sealed=await sealWorkerOutputs(options.out);
 const pub={schema:'supertrader-tournament-v3-method-public-summary-1.0.0',methodId:options.workerMethod,freezeId:freeze.freezeId,freezeFileSha256:freezeSHA,completionSha256:options.completionSHA,runnerNode:process.version,
  reconciliation:{baseline:summary.reconciliation?.pass===true,variants:summary.sensitivity?.map(v=>({costMultiplier:v.costMultiplier,scenario:v.scenario,pass:v.reconciliation?.pass===true}))},
  dustWriteOffs:summary.reconciliation?.dustWriteOffs??null,qualification:summary.qualification,ranking:summary.ranking,
  sealedArtifacts:sealed.map(({name,plaintextSha256,plaintextBytes,sealedSha256,sealedBytes,audiences})=>({name,plaintextSha256,plaintextBytes,sealedSha256,sealedBytes,audiences})),
  performanceNumbersPublished:false,verdict:'MEASURED_RECONCILED_REVIEW_PENDING'};
 fs.mkdirSync(path.dirname(path.resolve(options.publicOut)),{recursive:true});fs.writeFileSync(options.publicOut,JSON.stringify(pub,null,2)+'\n');
 phase('POST_CALIBRATION_WORKER_COMPLETE',options.workerMethod);
}

export async function runPostCalibrationCLI(options){
 const {freeze,sha256:freezeSHA}=frozenFile(options.freezeFile,null);sourceChecks(options,freeze);
 await verifyCalibrationCompletion({file:options.calibrationCompletionFile,expectedSHA:options.completionSHA,freezeSHA256:freezeSHA,freezeId:freeze.freezeId});
 privateFile(path.join(options.out,'status.private.json'),{mkdir:true});
 if(fs.readdirSync(options.out).length)throw Error('FRESH_PRIVATE_POST_CALIBRATION_OUTPUT_REQUIRED');
 return worker(options,freeze,freezeSHA);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let options;
 try{options=parsePostCalibrationArguments(process.argv.slice(2));await runPostCalibrationCLI(options);}
 catch(error){if(options?.out)try{await writeDurablePrivateArtifact(path.join(options.out,'error.private.json'),{status:'POST_CALIBRATION_FAILED',reason:String(error.message),stack:error.stack||null});}catch{}phase('POST_CALIBRATION_FAILED');process.exitCode=1;}
}
