/** Isolated read-only orchestration. Importing this module never loads prices or runs outcomes. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import os from 'node:os';
import {historicalParticipants,methods,dataBlocked,distinctivenessProduct,prepareSourceFeatures} from '../tournament/methods.mjs';
import {assertFreezeV2} from './freeze-v2.mjs';
import {terminalClassificationPITOverlay} from './execution-audit.mjs';
import {runMethod,benchmarkCurve,populateForwardReturns,marketRegime} from './runner-v2.mjs';
import {runMethod as originalRunMethod} from '../tournament/runner.mjs';
import {portfolioMetrics,signalMetrics,regimeMetrics,methodOverlap,rankEvidence} from '../tournament/metrics.mjs';

const DIR=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(DIR,'../../../..');
const BASE_DIR=path.join(DIR,'../tournament');
const CANONICAL_MODULE=path.join(DIR,'canonical-input.mjs');
const BASE_PROTOCOL=JSON.parse(fs.readFileSync(path.join(BASE_DIR,'protocol.json')));
const BASE_FREEZE=JSON.parse(fs.readFileSync(path.join(BASE_DIR,'SUPERTRADER-METHOD-FREEZES.json')));
export const RERUN_METHOD_IDS=Object.freeze(historicalParticipants.map(m=>m.id));
export const RERUN_ORCHESTRATION_VERSION='UNCHANGED_RULEBOOK_CERTIFIED_RECEIVER_RERUN_V2';
const TRUE_DATA_QUALITY=Object.freeze({pitListings:false,canonicalPrices:true,terminalScenarioUncertainty:true,missingRequiredPitFundamentals:false});
const OLD_UNTRUSTED_FLAGS=Object.freeze({pitListings:true,canonicalPrices:true,terminalScenarioUncertainty:true,missingRequiredPitFundamentals:false});
const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const validUTC=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x)&&validDay(x.slice(0,10))&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
function quietStatus(phase,method){if(!/^[A-Z_]+$/.test(phase)||method!==undefined&&!RERUN_METHOD_IDS.includes(method))throw Error('PUBLIC_STATUS_ENUM_REQUIRED');console.log(JSON.stringify({phase,...(method?{method}:{})}));}
function privatePath(file,{createParent=false}={}){
 const p=path.resolve(file);if(!p.startsWith('/workspace/private/'))throw Error('PRIVATE_OUTPUT_OR_INPUT_PATH_REQUIRED');
 if(createParent)fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});
 if(!fs.realpathSync(path.dirname(p)).startsWith('/workspace/private/')&&fs.realpathSync(path.dirname(p))!=='/workspace/private')throw Error('PRIVATE_REAL_PARENT_REQUIRED');
 if(fs.existsSync(p)&&!fs.realpathSync(p).startsWith('/workspace/private/'))throw Error('PRIVATE_REAL_PATH_REQUIRED');return p;
}
const readJSON=p=>JSON.parse(fs.readFileSync(p));
/** Bounded JSON serialization; full signals and raw structures are never truncated. */
export async function writePrivateJson(file,value){
 const destination=privatePath(file,{createParent:true}),temp=destination+'.partial';
 if(fs.existsSync(destination)||fs.existsSync(temp))throw Error('PRIVATE_OUTPUT_ALREADY_EXISTS');
 const stream=fs.createWriteStream(temp,{flags:'wx',mode:0o600});let failed=null,chunk='';
 stream.on('error',error=>{failed=error;});
 const emit=async s=>{chunk+=s;if(chunk.length>=65536){const bytes=chunk;chunk='';if(failed)throw failed;if(!stream.write(bytes))await once(stream,'drain');}};
 async function visit(v){
  if(v===null||typeof v!=='object'){const serialized=JSON.stringify(v);await emit(serialized??'null');return;}
  if(Array.isArray(v)){await emit('[');for(let i=0;i<v.length;i++){if(i)await emit(',');await visit(v[i]);}await emit(']');return;}
  await emit('{');let first=true;for(const [key,item] of Object.entries(v)){if(item===undefined||typeof item==='function'||typeof item==='symbol')continue;if(!first)await emit(',');first=false;await emit(JSON.stringify(key)+':');await visit(item);}await emit('}');
 }
 try{await visit(value);if(failed)throw failed;const finished=once(stream,'finish');stream.end(chunk+'\n');await finished;if(failed)throw failed;fs.renameSync(temp,destination);}catch(error){stream.destroy();throw error;}
}

export function parseRerunArguments(argv){
 const options={jobs:2,heapMiB:null,only:null,workerMethod:null,preflightOnly:false,loaderModule:CANONICAL_MODULE},seen=new Set(),valueFlags=new Map([['--input-dir','inputDir'],['--loader-module','loaderModule'],['--freeze','freezeFile'],['--out','out'],['--jobs','jobs'],['--heap-mb','heapMiB'],['--only','only'],['--worker-method','workerMethod']]);
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(seen.has(flag))throw Error('DUPLICATE_RERUN_ARGUMENT');seen.add(flag);
  if(flag==='--preflight-only'){options.preflightOnly=true;continue;}
  const key=valueFlags.get(flag);if(!key)throw Error('UNKNOWN_RERUN_ARGUMENT');const v=argv[++i];if(!v||v.startsWith('--'))throw Error('RERUN_ARGUMENT_VALUE_REQUIRED');options[key]=v;
 }
 for(const key of ['inputDir','freezeFile','out'])if(!options[key])throw Error('EXPLICIT_RERUN_PATHS_REQUIRED');
 if(path.resolve(options.loaderModule)!==CANONICAL_MODULE)throw Error('FROZEN_REPO_CANONICAL_LOADER_REQUIRED');
 options.jobs=Number(options.jobs);if(![1,2].includes(options.jobs))throw Error('LOCAL_JOBS_MUST_BE_ONE_OR_TWO');
 if(options.heapMiB!==null){options.heapMiB=Number(options.heapMiB);if(![4096,6144,8192,12000].includes(options.heapMiB))throw Error('EXPLICIT_SUPPORTED_WORKER_HEAP_REQUIRED');}
 if(options.only!==null){options.only=options.only.split(',').map(s=>s.trim());if(options.only.some(id=>!RERUN_METHOD_IDS.includes(id))||new Set(options.only).size!==options.only.length)throw Error('ONLY_ORIGINAL_HISTORICAL_METHODS_REQUIRED');}
 if(options.workerMethod!==null&&(!RERUN_METHOD_IDS.includes(options.workerMethod)||options.only!==null||options.preflightOnly))throw Error('INVALID_WORKER_METHOD_OR_MODE');
 options.selectedMethodIds=RERUN_METHOD_IDS.filter(id=>options.only===null||options.only.includes(id));return options;
}
function receipt(freeze,role,digest){const rows=freeze.inputReceipts?.filter(r=>r.role===role)??[];if(rows.length!==1||rows[0].sha256!==digest)throw Error('PREDECLARED_INPUT_RECEIPT_MISMATCH');}
function verifyBaselineAndFreeze(freeze){
 assertFreezeV2(freeze);if(freeze.protocolHash!==BASE_FREEZE.protocolHash)throw Error('ORIGINAL_PROTOCOL_HASH_MISMATCH');
 if(!same(BASE_PROTOCOL.window,{warmupFrom:'2015-01-01',from:'2018-01-02',to:'2026-09-30'}))throw Error('ORIGINAL_FIXED_WINDOW_REQUIRED');
 if(freeze.participants.some(id=>!RERUN_METHOD_IDS.includes(id)))throw Error('NEW_HISTORICAL_METHOD_REQUIRES_SEPARATE_ADMISSION_REVIEW');
 if(RERUN_METHOD_IDS.some(id=>!freeze.participants.includes(id)))throw Error('ALL_ORIGINAL_SIX_RECEIVERS_MUST_BE_REGISTERED');
}
export function validateRerunData(data,protocol=BASE_PROTOCOL){
 if(!same(protocol,BASE_PROTOCOL))throw Error('ORIGINAL_PROTOCOL_REQUIRED');
 if(data?.state!=='AVAILABLE'||!Array.isArray(data.securities)||!Array.isArray(data.calendar)||!/^[a-f0-9]{64}$/.test(data.fingerprint??''))throw Error('AVAILABLE_FINGERPRINTED_CANONICAL_DATA_REQUIRED');
 if(!same(data.window,protocol.window))throw Error('EXACT_ORIGINAL_SOURCE_WINDOW_REQUIRED');
 if(data.calendar[0]!==protocol.window.from||data.calendar.at(-1)!==protocol.window.to||data.calendar.some((d,i)=>!validDay(d)||(i>0&&d<=data.calendar[i-1])))throw Error('EXACT_ORIGINAL_WINDOW_AND_CALENDAR_REQUIRED');
 const ids=data.securities.map(s=>s.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error('UNIQUE_CANONICAL_SECURITY_IDS_REQUIRED');
 const benchmark=data.benchmark?.bars||data.spyBars,byDate=new Map((benchmark??[]).map(b=>[b.date,b]));
 if(!benchmark?.length||byDate.size!==benchmark.length||data.calendar.some(date=>{const b=byDate.get(date);return !b||![b.open,b.close,b.totalReturnIndex].every(x=>Number.isFinite(x)&&x>0);}))throw Error('COMPLETE_CANONICAL_BENCHMARK_REQUIRED');
 if(!data.coverage?.benchmarkAvailable)throw Error('SOURCE_BENCHMARK_COVERAGE_REQUIRED');
 if(data.certifiedCashEvents?.length)for(const date of data.calendar){const clock=data.certifiedSessionClocks?.[date];if(!validUTC(clock?.beforeOpenUTC)||!validUTC(clock?.afterCloseUTC)||clock.beforeOpenUTC.slice(0,10)!==date||clock.afterCloseUTC.slice(0,10)!==date||Date.parse(clock.beforeOpenUTC)>=Date.parse(clock.afterCloseUTC))throw Error('CERTIFIED_EXECUTION_SESSION_CLOCKS_REQUIRED');}
 if(data.certifiedCashEvents?.length)throw Error('CERTIFIED_CASH_SIGNAL_OUTCOME_CONTRACT_NOT_INTEGRATED');
 return true;
}
/** Apply source/evidence terminal filter BEFORE any benchmark or strategy performance. */
export function prepareRerunData(data,protocol=BASE_PROTOCOL){
 validateRerunData(data,protocol);
 const {data:filtered,audit}=terminalClassificationPITOverlay(data,{phaseTimestampForDate:date=>data.certifiedSessionClocks?.[date]?.afterCloseUTC});
 const transformed=createHash('sha256');transformed.update(data.fingerprint);for(const s of filtered.securities)transformed.update(JSON.stringify([s.id,s.terminal??null]));
 transformed.update(JSON.stringify(filtered.certifiedCashEvents??[]));transformed.update(JSON.stringify(filtered.certifiedSessionClocks??{}));
 const beforePerformance={schema:'supertrader-rerun-data-ready-private-2.0.0',status:'FINGERPRINTED_AND_TERMINAL_FILTERED_BEFORE_PERFORMANCE',registeredBeforePerformance:true,sourceDataFingerprint:data.fingerprint,effectiveDataFingerprint:transformed.digest('hex'),terminalClassificationPITOverlay:audit,dataCoverage:data.coverage,dataLimitations:data.limitations,sourceProvenanceOverlay:data.sourceProvenanceOverlay??null,window:protocol.window,inputKnowledgePolicy:'SOURCE_DAY_00_UTC_CONSERVATIVE_BOUND_NOT_ACTUAL_SIGNAL_TIMESTAMP',dataQuality:TRUE_DATA_QUALITY,originalNominalDataQualityInputs:{...OLD_UNTRUSTED_FLAGS,trusted:false},qualificationCeiling:'C',currentScanStatus:'NOT_RUN_HISTORICAL_SOURCE_ONLY'};
 return {data:filtered,beforePerformance};
}
function matchedExposure(curve,benchmark,protocol){const bm=new Map(benchmark.map(p=>[p.date,p.equity]));let equity=protocol.execution.initialCapital;return curve.map((p,i)=>{if(i){const r=bm.get(p.date)/bm.get(curve[i-1].date)-1;equity*=1+curve[i-1].exposure*r;}return {date:p.date,equity,exposure:p.exposure,n:p.n};});}
function diagnosticAttribution(run,benchmark,protocol){const matched=matchedExposure(run.curve,benchmark,protocol),pm=portfolioMetrics(run.curve,{initialCapital:protocol.execution.initialCapital}),bm=portfolioMetrics(benchmark,{initialCapital:protocol.execution.initialCapital}),em=portfolioMetrics(matched,{initialCapital:protocol.execution.initialCapital});return {exposureMatchedBenchmarkMetrics:em,methodMinusExposureMatchedCagr:pm.cagr-em.cagr,exposureAndCashBenchmarkCagrDifference:em.cagr-bm.cagr,transactionCosts:run.executionCosts,dividends:run.dividends,signalEffect:'GROSS_FORWARD_EXCESS_REPORTED_SEPARATELY',sizingEffect:'NOT_CAUSALLY_IDENTIFIED',exitEffect:'NOT_CAUSALLY_IDENTIFIED',cashReturn:0,interpretation:'Descriptive benchmark substitution with lagged exposure; residual includes selection, sizing, exits and costs, not an additive causal decomposition.'};}
function conditionalPortfolio(run,data,protocol){const groups={};for(let i=1;i<run.curve.length;i++){const regime=marketRegime(data.benchmark?.bars||data.spyBars,run.curve[i-1].date,protocol),r=run.curve[i].equity/run.curve[i-1].equity-1;for(const label of [regime.trend,regime.vol,regime.era]){(groups[label]??=[]).push(r);}}return Object.fromEntries(Object.entries(groups).map(([label,returns])=>[label,{sessions:returns.length,meanDaily:returns.reduce((s,r)=>s+r,0)/returns.length,conditionalCompoundedReturn:returns.reduce((s,r)=>s*(1+r),1)-1,notContiguousTimeSeries:true,cagr:null}]));}
function benchmarkMetricsFor(data,protocol){const benchmark=benchmarkCurve(data,protocol.execution.initialCapital);return {benchmark,benchmarkMetrics:portfolioMetrics(benchmark,{initialCapital:protocol.execution.initialCapital})};}
function variantList(protocol){return [{costMultiplier:protocol.execution.costSensitivityMultiplier,scenario:protocol.delisting.baseline},...protocol.delisting.sensitivity.map(scenario=>({costMultiplier:1,scenario}))];}
export function sensitivityGates(portfolio,signal,sensitivity,benchmark,protocol=BASE_PROTOCOL){
 const finite=x=>typeof x==='number'&&Number.isFinite(x),baseMean=signal?.horizons?.[63]?.meanExcess;
 const cost=sensitivity.find(s=>s.costMultiplier===protocol.execution.costSensitivityMultiplier&&s.scenario===protocol.delisting.baseline),terminals=protocol.delisting.sensitivity.map(scenario=>sensitivity.find(s=>s.costMultiplier===1&&s.scenario===scenario));
 const costAvailable=finite(cost?.portfolioMetrics?.cagr)&&finite(benchmark?.cagr);
 const terminalAvailable=finite(portfolio?.cagr)&&finite(benchmark?.cagr)&&finite(baseMean)&&terminals.every(s=>finite(s?.portfolioMetrics?.cagr)&&finite(s?.signalMetrics?.horizons?.[63]?.meanExcess));
 return {costPass:costAvailable?cost.portfolioMetrics.cagr>=benchmark.cagr-.01:null,terminalPass:terminalAvailable?terminals.every(s=>Math.sign(s.portfolioMetrics.cagr-benchmark.cagr)===Math.sign(portfolio.cagr-benchmark.cagr)&&Math.sign(s.signalMetrics.horizons[63].meanExcess)===Math.sign(baseMean)):null,costStatus:costAvailable?'AVAILABLE':'UNAVAILABLE',terminalStatus:terminalAvailable?'AVAILABLE':'UNAVAILABLE',missingNeverConvertedToZero:true};
}
function controlFingerprint(sourceDataFingerprint){return hash(JSON.stringify({sourceDataFingerprint,originalFreeze:hash(JSON.stringify(BASE_FREEZE)),protocolHash:BASE_FREEZE.protocolHash,condition:'SAME_NEW_CANONICAL_SOURCE_ORIGINAL_RUNNER_ACCOUNTING_UNFILTERED'}));}
function originalExecutionControl(data,methodId,protocol,benchmark,benchmarkMetrics){
 const method=historicalParticipants.find(m=>m.id===methodId),run=originalRunMethod(data,method,protocol),portfolio=portfolioMetrics(run.curve,{initialCapital:protocol.execution.initialCapital,turnover:run.turnover,trades:run.trades,executionCosts:run.executionCosts}),sm=signalMetrics(run.signals),rm=regimeMetrics(run.signals);
 return {id:methodId,condition:'SAME_NEW_CANONICAL_SOURCE_ORIGINAL_EXECUTION_BEFORE_TERMINAL_OVERLAY',sourceDataFingerprint:data.fingerprint,controlFingerprint:controlFingerprint(data.fingerprint),run,portfolioMetrics:portfolio,signalMetrics:sm,regimeMetrics:rm,attribution:diagnosticAttribution(run,benchmark,protocol),conditionalPortfolio:conditionalPortfolio(run,data,protocol),benchmarkMetrics,scenario:protocol.delisting.baseline,costMultiplier:1,originalMethodDefinitionUnchanged:true,controlOnly:true,fullyQualified:false,classificationHintsTrusted:false,oldNominalScoreNotRecomputed:true};
}
function measurePreparedMethod(data,methodId,protocol,benchmark,benchmarkMetrics){
 const method=historicalParticipants.find(m=>m.id===methodId);if(!method)throw Error('ORIGINAL_METHOD_REQUIRED');
 const run=runMethod(data,method,protocol),portfolio=portfolioMetrics(run.curve,{initialCapital:protocol.execution.initialCapital,turnover:run.turnover,trades:run.trades,executionCosts:run.executionCosts}),sensitivity=[];
 for(const variant of variantList(protocol)){
  const measured=runMethod(data,method,protocol,{...variant,measureSignals:false});
  const pm=portfolioMetrics(measured.curve,{initialCapital:protocol.execution.initialCapital,turnover:measured.turnover,trades:measured.trades,executionCosts:measured.executionCosts});
  // Same source setup census; only terminal forward outcomes vary. No portfolio-conditioned resampling.
  const forward=run.signals.map(s=>({...s,forward:{}}));populateForwardReturns(forward,data,protocol,undefined,variant.scenario);
  sensitivity.push({...variant,portfolioMetrics:pm,signalMetrics:signalMetrics(forward),reconciliation:measured.reconciliation});
 }
 const sm=signalMetrics(run.signals),rm=regimeMetrics(run.signals);
 const row={id:method.id,executable:true,fidelityCategory:method.id.startsWith('TURTLE')||method.id.startsWith('WEINSTEIN')||method.id.startsWith('KULLAMAGI')?'LEGENDARY':'SYSTEMATIC',portfolioMetrics:portfolio,signalMetrics:sm,regimeMetrics:rm,dataQuality:{...TRUE_DATA_QUALITY},distinctivenessProductScore:distinctivenessProduct[method.id],comparisonsAdequate:true,riskSpecialist:method.id==='LOW_VOLATILITY',sensitivities:sensitivityGates(portfolio,sm,sensitivity,benchmarkMetrics,protocol),adversarialReviewPass:false};
 const ranking=rankEvidence(row,benchmarkMetrics,protocol);
 return {...row,ranking,run,sensitivity,attribution:diagnosticAttribution(run,benchmark,protocol),conditionalPortfolio:conditionalPortfolio(run,data,protocol),marketCapRobustness:{status:'MISSING_PIT_MARKET_CAP',large:null,midSmall:null},reviewStatus:'PENDING_FINAL_ADVERSARIAL_REVIEW',qualification:{tierCeiling:'C',status:'PARTIAL_RESEARCH_ONLY',reasonCodes:['DATA_LIMITED','EXECUTION_LIMITED',...(row.fidelityCategory==='LEGENDARY'?['FIDELITY_LIMITED']:[])],confidence:'LOW',fullyQualified:false},rubricInputCertificationAmendment:{registeredBeforePerformance:true,weightsChanged:false,thresholdsChanged:false,actualInputs:row.dataQuality,previousNominalInputs:{...OLD_UNTRUSTED_FLAGS,trusted:false},actualDataComponent:ranking.components.dataQuality,actualTotalScore:ranking.score,untrustedNominalScoreComparison:'OLD_BASELINE_ONLY_NOT_RECOMPUTED_ON_RERUN',counterfactualTierNotComputedOrUsed:true,interpretation:'Correction of unverified PIT-listing input flags, not reclassification of old measured results or a change to the fixed rubric; missing component is never imputed or reweighted.'}};
}
/** Callable original-six rerun. Preflight receipt callback must finish before outcomes. */
export async function runRerunDataset({data,freeze,selectedMethodIds=RERUN_METHOD_IDS,beforePerformance,baselineControlSink,onMethodComplete,protocol=BASE_PROTOCOL}={}){
 verifyBaselineAndFreeze(freeze);if(!same(protocol,BASE_PROTOCOL))throw Error('ORIGINAL_PROTOCOL_REQUIRED');
 if(!Array.isArray(selectedMethodIds)||!selectedMethodIds.length||new Set(selectedMethodIds).size!==selectedMethodIds.length||selectedMethodIds.some(id=>!RERUN_METHOD_IDS.includes(id)))throw Error('ORIGINAL_METHOD_SUBSET_REQUIRED');
 if(typeof beforePerformance!=='function'||typeof baselineControlSink!=='function')throw Error('DURABLE_PREFLIGHT_AND_CONTROL_SINKS_REQUIRED');
 const prepared=prepareRerunData(data,protocol);await beforePerformance(prepared.beforePerformance);
 prepareSourceFeatures(data);const rawById=new Map(data.securities.map(s=>[s.id,s]));for(const security of prepared.data.securities)security.sourceFeatures=rawById.get(security.id).sourceFeatures;
 const {benchmark,benchmarkMetrics}=benchmarkMetricsFor(data,protocol),results=[],controlResults=[];
 for(const id of RERUN_METHOD_IDS.filter(id=>selectedMethodIds.includes(id))){
  let control=originalExecutionControl(data,id,protocol,benchmark,benchmarkMetrics);
  const artifact=await baselineControlSink({schema:'supertrader-same-new-source-original-execution-control-private-2.0.0',status:'DIAGNOSTIC_CONTROL_ONLY_NOT_CERTIFIED_PIT',freeze:BASE_FREEZE,certificationFreeze:freeze,protocol,dataFingerprint:data.fingerprint,dataCoverage:data.coverage,dataLimitations:data.limitations,selectedMethodIds:[id],results:[control],benchmarkMetrics,sourceCondition:'SAME_NEW_CANONICAL_SOURCE_UNFILTERED_ORIGINAL_RUNNER_ACCOUNTING',noClaimMatchingOld589SourceSnapshot:true});
  if(!artifact||typeof artifact.path!=='string'||!/^[a-f0-9]{64}$/.test(artifact.sha256??''))throw Error('DURABLE_CONTROL_ARTIFACT_HASH_REQUIRED');
  await verifyControlArtifactReceipt(artifact);controlResults.push({id,condition:control.condition,sourceDataFingerprint:data.fingerprint,controlFingerprint:control.controlFingerprint,portfolioMetrics:control.portfolioMetrics,signalMetrics:control.signalMetrics,regimeMetrics:control.regimeMetrics,reconciliation:control.run.reconciliation,artifact,controlOnly:true,fullyQualified:false,oldNominalScoreNotRecomputed:true});control=null;
  const row=measurePreparedMethod(prepared.data,id,protocol,benchmark,benchmarkMetrics);results.push(row);if(onMethodComplete)await onMethodComplete(row);
 }
 const overlap=methodOverlap(results.map(r=>({id:r.id,signals:r.run.signals,curve:r.run.curve})));
 return {schema:'supertrader-certification-rerun-private-2.0.0',status:'HISTORICAL_MEASURED_CURRENT_NOT_RUN_REVIEW_PENDING',freeze:BASE_FREEZE,certificationFreeze:freeze,protocol,selectedMethodIds:RERUN_METHOD_IDS.filter(id=>selectedMethodIds.includes(id)),dataFingerprint:prepared.beforePerformance.sourceDataFingerprint,effectiveDataFingerprint:prepared.beforePerformance.effectiveDataFingerprint,dataCoverage:prepared.data.coverage,dataLimitations:prepared.data.limitations,sourceProvenanceOverlay:prepared.beforePerformance.sourceProvenanceOverlay,terminalClassificationPITOverlay:prepared.beforePerformance.terminalClassificationPITOverlay,benchmarkMetrics,results,controlResults,controlFingerprint:controlFingerprint(data.fingerprint),controlCondition:'SAME_NEW_SOURCE_ORIGINAL_EXECUTION_BEFORE_OVERLAY',noClaimMatchingOld589SourceSnapshot:true,comparisonDesign:'OLD589_SOURCE_AND_ORIGINAL_EXECUTION_VS_SAME_NEW_SOURCE_ORIGINAL_EXECUTION_VS_SAME_NEW_SOURCE_V2; descriptive_not_causal',overlap,overlapScope:results.length===6?'FULL_ORIGINAL_SIX_METHODS':'SELECTED_ORIGINAL_METHODS_ONLY',currentScans:[],currentStatus:'NOT_RUN_HISTORICAL_SOURCE_ONLY',dataBlocked,allHistoricalResults:'SEEN_HISTORICAL_DATA',finalReviewPending:true,orchestrationVersion:RERUN_ORCHESTRATION_VERSION};
}
export function verifyCanonicalInputReceipts(options,freeze){
 const modulePath=path.resolve(options.loaderModule??CANONICAL_MODULE);
 if(modulePath!==CANONICAL_MODULE||fs.realpathSync(modulePath)!==modulePath)throw Error('FROZEN_REPO_CANONICAL_LOADER_REQUIRED');
 const manifest=privatePath(path.join(options.inputDir,'canonical-dataset-manifest.json')),sourceInputs=privatePath(path.join(options.inputDir,'data-certification-inputs.json'));
 for(const [role,file]of [['CANONICAL_LOADER_MODULE',modulePath],['CANONICAL_MANIFEST_PLAINTEXT',manifest],['CANONICAL_SOURCE_PROVENANCE_INPUTS',sourceInputs]])receipt(freeze,role,hash(fs.readFileSync(file)));
 return {modulePath,manifest,sourceInputs};
}
async function loadVerifiedCanonical(options,freeze){
 const {modulePath}=verifyCanonicalInputReceipts(options,freeze);
 const loader=await import(pathToFileURL(modulePath).href);if(typeof loader.loadCanonicalData!=='function')throw Error('BOUNDED_CANONICAL_DATA_LOADER_REQUIRED');
 const expectedSourceMetadataSha256=freeze.inputReceipts.find(r=>r.role==='CANONICAL_SOURCE_PROVENANCE_INPUTS').sha256;
 const data=await loader.loadCanonicalData(options.inputDir,{sourceProvenanceOverlay:true,expectedSourceMetadataSha256});verifyCanonicalInputReceipts(options,freeze);validateRerunData(data);
 if(data.sourceProvenanceOverlay?.priceBarsUnchanged!==true||data.sourceProvenanceOverlay?.performanceCalculated!==false)throw Error('SOURCE_PROVENANCE_OVERLAY_PROOF_REQUIRED');
 return data;
}
/** Source-size-only memory planning: no benchmark, evaluator or returns are calculated. */
export function planRerunResources({inputDir,requestedJobs=2,requestedHeapMiB=null,totalMemoryBytes=os.totalmem()}={}){
 const manifestPath=privatePath(path.join(inputDir,'canonical-dataset-manifest.json')),manifest=readJSON(manifestPath);
 if(!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.some(p=>!Number.isSafeInteger(p.plaintextBytes)||p.plaintextBytes<1||p.plaintextBytes>128*1024*1024||!/^canonical-dataset-part-\d{4}$/.test(p.stem)))throw Error('BOUNDED_MANIFEST_PARTS_REQUIRED');
 const totalPlaintextBytes=manifest.parts.reduce((s,p)=>s+p.plaintextBytes,0),sampleMeta=manifest.parts[0],sampleBytes=fs.readFileSync(privatePath(path.join(inputDir,sampleMeta.stem+'.json')));
 if(sampleBytes.length!==sampleMeta.plaintextBytes||hash(sampleBytes)!==sampleMeta.sha256)throw Error('MEMORY_SAMPLE_SOURCE_HASH_MISMATCH');
 if(typeof global.gc==='function')global.gc();const before=process.memoryUsage().heapUsed;
 const sample=JSON.parse(sampleBytes);if(!Array.isArray(sample.securities)||sample.securities.length!==sampleMeta.securities)throw Error('MEMORY_SAMPLE_MEMBERSHIP_MISMATCH');
 if(typeof global.gc==='function')global.gc();const retainedSampleHeapBytes=Math.max(0,process.memoryUsage().heapUsed-before),sampleBars=sample.securities.reduce((n,s)=>n+(s.bars?.length??0),0);
 // JSON parsing transient strings and heterogeneous objects make an exact ratio unavailable.
 // Use measured sample retention with50% margin (minimum1.5x) and2GiB method/forward headroom.
 const ratio=Math.max(1.5,1.5*retainedSampleHeapBytes/sampleBytes.length),estimatedDatasetHeapBytes=totalPlaintextBytes*ratio,estimatedWorkerPeakBytes=estimatedDatasetHeapBytes+2*1024**3;
 const memoryReservedForParentAndOSBytes=2*1024**3,availableForWorkersBytes=Math.max(0,totalMemoryBytes-memoryReservedForParentAndOSBytes);
 const allowTwo=requestedJobs===2&&estimatedWorkerPeakBytes<=6*1024**3&&2*(estimatedWorkerPeakBytes+512*1024**2)<=availableForWorkersBytes;
 const jobs=allowTwo?2:1,heapMiB=requestedHeapMiB??(allowTwo?6144:12000);
 if(heapMiB*1024**2>availableForWorkersBytes/jobs)throw Error('LOCAL_WORKER_HEAP_EXCEEDS_MEMORY_BUDGET');
 if(estimatedDatasetHeapBytes>heapMiB*1024**2-1536*1024**2)throw Error('CANONICAL_WORKLOAD_EXCEEDS_LOCAL_MEMORY_BUDGET');
 return {status:'SOURCE_ONLY_RESOURCE_PLAN_NO_OUTCOMES',requestedJobs,jobs,heapMiB,totalMemoryBytes,totalPlaintextBytes,parts:manifest.parts.length,sourceSecurities:manifest.securities,sampleBars,samplePlaintextBytes:sampleBytes.length,retainedSampleHeapBytes,conservativeHeapToTextRatio:ratio,estimatedDatasetHeapBytes,estimatedWorkerPeakBytes,memoryReservedForParentAndOSBytes,measurementPolicy:'NO_METHOD_OR_BENCHMARK_EVALUATION; source sample only',gcAvailable:typeof global.gc==='function'};
}
async function runWorker(options,freeze){
 const data=await loadVerifiedCanonical(options,freeze),rootOut=privatePath(path.join(options.out,'historical.json'),{createParent:true});
 const report=await runRerunDataset({data,freeze,selectedMethodIds:[options.workerMethod],beforePerformance:ready=>writePrivateJson(path.join(options.out,'data-ready.json'),{...ready,certificationFreezeHash:hash(JSON.stringify(freeze))}),baselineControlSink:async control=>{const file=path.join(options.out,'baseline-control-private.json');await writePrivateJson(file,control);return {path:file,sha256:await hashPrivateFile(file)};},onMethodComplete:row=>writePrivateJson(path.join(options.out,'method-checkpoint.json'),{methodId:row.id,reconciliation:row.run.reconciliation,ranking:row.ranking})});
 report.status='HISTORICAL_MEASURED_CURRENT_SKIPPED';await writePrivateJson(rootOut,report);quietStatus('RERUN_METHOD_COMPLETED',options.workerMethod);
}
async function runPreflight(options,freeze){const data=await loadVerifiedCanonical(options,freeze),prepared=prepareRerunData(data);await writePrivateJson(path.join(options.out,'data-ready.json'),{...prepared.beforePerformance,certificationFreezeHash:hash(JSON.stringify(freeze))});quietStatus('RERUN_PREFLIGHT_COMPLETE');}
export async function verifyControlArtifactReceipt(artifact){
 if(!artifact||typeof artifact.path!=='string'||!/^[a-f0-9]{64}$/.test(artifact.sha256??''))throw Error('DURABLE_CONTROL_ARTIFACT_HASH_REQUIRED');
 const file=privatePath(artifact.path);if(!fs.existsSync(file)||!fs.statSync(file).isFile()||await hashPrivateFile(file)!==artifact.sha256)throw Error('CONTROL_ARTIFACT_CONTENT_RECEIPT_MISMATCH');return true;
}
async function hashPrivateFile(file){const digest=createHash('sha256');for await(const chunk of fs.createReadStream(privatePath(file)))digest.update(chunk);return digest.digest('hex');}
async function readShard(file){const bytes=fs.readFileSync(privatePath(file));return {payload:JSON.parse(bytes),sha256:hash(bytes),path:privatePath(file)};}
async function assembleRerun(options,freeze){
 const shards=[];for(const id of options.selectedMethodIds)shards.push(await readShard(path.join(options.out,id,'historical.json')));
 const first=shards[0].payload,results=[],controlResults=[];
 for(const {payload}of shards){for(const field of ['freeze','certificationFreeze','protocol','dataFingerprint','effectiveDataFingerprint','dataCoverage','dataLimitations','benchmarkMetrics','terminalClassificationPITOverlay','sourceProvenanceOverlay','controlFingerprint'])if(!same(payload[field],first[field]))throw Error('RERUN_SHARD_METADATA_MISMATCH');if(payload.results.length!==1||payload.results[0].run.reconciliation?.pass!==true||!options.selectedMethodIds.includes(payload.results[0].id))throw Error('RERUN_SHARD_INCOMPLETE');if(payload.controlResults?.length!==1||payload.controlResults[0].id!==payload.results[0].id||payload.controlResults[0].reconciliation?.pass!==true||await hashPrivateFile(payload.controlResults[0].artifact.path)!==payload.controlResults[0].artifact.sha256)throw Error('RERUN_CONTROL_ARTIFACT_INCOMPLETE_OR_MISMATCH');results.push(payload.results[0]);controlResults.push(payload.controlResults[0]);}
 if(new Set(results.map(r=>r.id)).size!==options.selectedMethodIds.length)throw Error('RERUN_SHARD_METHOD_COVERAGE_MISMATCH');
 results.sort((a,b)=>RERUN_METHOD_IDS.indexOf(a.id)-RERUN_METHOD_IDS.indexOf(b.id));
 const report={...first,status:'HISTORICAL_MEASURED_CURRENT_NOT_RUN_REVIEW_PENDING',selectedMethodIds:results.map(r=>r.id),results,controlResults:controlResults.sort((a,b)=>RERUN_METHOD_IDS.indexOf(a.id)-RERUN_METHOD_IDS.indexOf(b.id)),overlap:methodOverlap(results.map(r=>({id:r.id,signals:r.run.signals,curve:r.run.curve}))),overlapScope:results.length===6?'FULL_ORIGINAL_SIX_METHODS':'SELECTED_ORIGINAL_METHODS_ONLY'};
 await writePrivateJson(path.join(options.out,'rerun-shard-manifest.json'),{schema:'supertrader-certification-rerun-shard-manifest-2.0.0',certificationFreezeHash:hash(JSON.stringify(freeze)),historicalShards:shards.map(s=>({path:s.path,sha256:s.sha256})),currentShard:null,currentStatus:'NOT_RUN_HISTORICAL_SOURCE_ONLY',rawSignalsPreserved:true});
 await writePrivateJson(path.join(options.out,'baseline-control-summary-private.json'),{schema:'supertrader-same-new-source-original-execution-control-summary-private-2.0.0',status:'FULL_RAW_CONTROL_ARTIFACTS_SEPARATELY_HASH_BOUND',freeze:BASE_FREEZE,certificationFreeze:freeze,protocol:BASE_PROTOCOL,dataFingerprint:report.dataFingerprint,controlFingerprint:report.controlFingerprint,condition:'SAME_NEW_CANONICAL_SOURCE_ORIGINAL_EXECUTION_BEFORE_TERMINAL_OVERLAY',results:report.controlResults,benchmarkMetrics:report.benchmarkMetrics,noClaimMatchingOld589SourceSnapshot:true,fullRawRunsPreserved:true});
 await writePrivateJson(path.join(options.out,'historical.json'),report);return report;
}
export async function runRerunCLI(options){
 const freeze=readJSON(options.freezeFile);verifyBaselineAndFreeze(freeze);
 const output=privatePath(path.join(options.out,'run-status.json'),{createParent:true});if(fs.existsSync(output))throw Error('EXPLICIT_FRESH_OUTPUT_DIRECTORY_REQUIRED');
 if(options.workerMethod)return runWorker(options,freeze);if(options.preflightOnly)return runPreflight(options,freeze);
 const memoryPlan=planRerunResources({inputDir:options.inputDir,requestedJobs:options.jobs,requestedHeapMiB:options.heapMiB});await writePrivateJson(path.join(options.out,'resource-plan.private.json'),memoryPlan);
 // Heavy daily methods begin first; scheduling changes no method definitions or scenarios.
 const queue=['TURTLE_S2_EQUITY_DAILY','KULLAMAGI_DAILY_ADAPTATION','WEINSTEIN_STAGE_DAILY',...RERUN_METHOD_IDS].filter((id,i,a)=>a.indexOf(id)===i&&options.selectedMethodIds.includes(id)),active=new Set();let failed=null;
 const schedule=async()=>{while(queue.length&&!failed){const id=queue.shift(),dir=path.join(options.out,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});quietStatus('RERUN_METHOD_STARTED',id);
  const log=fs.openSync(path.join(dir,'worker-private.log'),'wx',0o600),child=spawn(process.execPath,[`--max-old-space-size=${memoryPlan.heapMiB}`,fileURLToPath(import.meta.url),'--input-dir',options.inputDir,'--loader-module',options.loaderModule,'--freeze',options.freezeFile,'--out',dir,'--worker-method',id],{cwd:ROOT,stdio:['ignore',log,log]});fs.closeSync(log);active.add(child);
  let code;try{[code]=await once(child,'exit');}catch{code=-1;}finally{active.delete(child);}if(code!==0){failed='RERUN_WORKER_FAILED';for(const running of active)running.kill('SIGTERM');break;}quietStatus('RERUN_METHOD_COMPLETED',id);
 }};
 try{await Promise.all(Array.from({length:Math.min(memoryPlan.jobs,queue.length)},schedule));if(failed)throw Error(failed);await assembleRerun(options,freeze);await writePrivateJson(output,{status:'HISTORICAL_MEASURED_REVIEW_PENDING',selectedMethodIds:options.selectedMethodIds,currentStatus:'NOT_RUN_HISTORICAL_SOURCE_ONLY',allOutcomesPrivate:true,finalReviewPending:true});quietStatus('RERUN_HISTORICAL_COMPLETE');}
 catch(error){for(const child of active)child.kill('SIGTERM');throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let options;
 try{options=parseRerunArguments(process.argv.slice(2));await runRerunCLI(options);}catch(error){if(options?.out)try{await writePrivateJson(path.join(options.out,'rerun-error.private.json'),{status:'RERUN_FAILED',reason:String(error?.message||error),stack:String(error?.stack||''),at:new Date().toISOString()});}catch{}quietStatus('RERUN_FAILED');process.exitCode=1;}
}
