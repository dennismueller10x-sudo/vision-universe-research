/** Separate publication-construction diagnostics; never mutates tournament definitions. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadCanonicalData} from '../certification/canonical-input.mjs';
import {prepareRerunData,writePrivateJson} from '../certification/run-rerun.mjs';
import {portfolioMetrics} from '../tournament/metrics.mjs';
import {referenceMethods} from './reference-engines.mjs';
import {runReferencePortfolio} from './portfolio-calibration.mjs';
import {verifyCalibrationFreeze} from './run-post-calibration.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const baseProtocol=JSON.parse(fs.readFileSync(path.join(HERE,'../tournament/protocol.json')));
export function referenceFrame(data,method,protocol,contract){
 if(method.kind!=='LOW_VOL')return {data,protocol};
 const frame=contract.lowVolRfDiagnosticWindow;
 if(!frame||frame.from!=='2018-02-01'||frame.to!=='2026-08-31')throw Error('PREREGISTERED_SOURCE_COVERAGE_FRAME_REQUIRED');
 return {data:{...data,calendar:data.calendar.filter(d=>d>=frame.from&&d<=frame.to),window:{...data.window,...frame}},protocol:{...protocol,window:{...protocol.window,...frame}}};
}
function privateDir(p){const out=path.resolve(p);if(!out.startsWith('/workspace/private/'))throw Error('PRIVATE_OUTPUT_REQUIRED');fs.mkdirSync(out,{recursive:true,mode:0o700});if(!fs.realpathSync(out).startsWith('/workspace/private/'))throw Error('PRIVATE_REAL_OUTPUT_REQUIRED');return out;}
function argumentsOf(argv){const out={};for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];if(!['--freeze','--input-dir','--reference-parsed','--reference-parsed-sha','--out'].includes(key)||out[key]||!value||value.startsWith('--'))throw Error('EXPLICIT_UNIQUE_CALIBRATION_ARGUMENTS_REQUIRED');out[key]=value;}if(Object.keys(out).length!==5||!/^[a-f0-9]{64}$/.test(out['--reference-parsed-sha']))throw Error('ALL_CALIBRATION_PATHS_AND_REFERENCE_DIGEST_REQUIRED');return out;}
export function verifyReferenceParsed(parsed,bytes,expectedDigest,freezeBytes,freeze){
 if(sha(bytes)!==expectedDigest||parsed.freezeFileSha256!==sha(freezeBytes)||parsed.codeSha256!==freeze.referenceArithmetic.codeSha256||parsed.sourcePlanSha256!==freeze.referenceArithmetic.sourcePlanSha256)throw Error('REFERENCE_PARSER_PHYSICAL_AND_FREEZE_BINDING_REQUIRED');
 const expected=freeze.referenceArithmetic.inputReceipts,actual=parsed.referenceInputSha256s;
 if(!actual||Object.keys(actual).length!==expected.length||expected.some(r=>actual[r.id]!==r.sha256))throw Error('EXACT_PARSED_REFERENCE_SOURCE_RECEIPTS_REQUIRED');
 return true;
}
export function monthlyEffect(run){
 const rows=(run.monthly??[]).filter(r=>Number.isFinite(r.rankSpread?.source));
 return {monthlySourceSpreadMean:rows.length?rows.reduce((s,r)=>s+r.rankSpread.source,0)/rows.length:null,sourceSpreadValidMonths:rows.length,sourceSpreadUnavailableMonths:(run.monthly?.length??0)-rows.length,monthlyExecutionSpreadMean:run.bottom&&run.monthly.length?run.monthly.reduce((s,r)=>s+r.rankSpread.execution,0)/run.monthly.length:null,factorEquityCagr:null,sourceAndNextOpenClocksEqual:false};
}
/** Paper-compatible monthly log-relative moments; original-universe replication remains unverified. */
export function sourceLogRisk(run,riskFreeDaily,sessionCalendar){
 if(!run.eligibleUniverse)return null;
 const rf=new Map(riskFreeDaily.map(r=>[r.date,r.returnDecimal])),rows=[],unavailable=[];
 for(const row of run.monthly){
  const names=['top','bottom','eligibleUniverse'];
  const source=row.legs.top.sourceOracle,dates=sessionCalendar.filter(d=>d>source.startDate&&d<=source.endDate);
  if(!dates.length||dates.at(-1)!==source.endDate||dates.some(d=>!Number.isFinite(rf.get(d))||rf.get(d)<=-1)||names.some(k=>!Number.isFinite(row.legs[k]?.sourceOracle?.return)||row.legs[k].sourceOracle.return<=-1)){unavailable.push(row.month);continue;}
  const rfLog=dates.reduce((s,d)=>s+Math.log1p(rf.get(d)),0);
  rows.push({month:row.month,...Object.fromEntries(names.map(k=>[k,Math.log1p(row.legs[k].sourceOracle.return)-rfLog]))});
 }
 const average=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
 const moments=xs=>{if(xs.length<2)return {months:xs.length,annualizedLogExcessMean:null,annualizedVolatility:null,sharpe:null};const mu=average(xs),sd=Math.sqrt(xs.reduce((s,x)=>s+(x-mu)**2,0)/(xs.length-1));return {months:xs.length,annualizedLogExcessMean:mu*12,annualizedVolatility:sd*Math.sqrt(12),sharpe:sd?mu/sd*Math.sqrt(12):null};};
 const result={basis:'SOURCE_CLOSE_TO_CLOSE_MONTHLY_LOG_RELATIVE_RETURN_MINUS_EXACT_FRENCH_RF',originalDatastreamAndFTSEEquivalent:false,allLegsSameEligibleUniverse:true,completeJointMonths:rows.length,unavailableMonths:unavailable,rows,top:moments(rows.map(r=>r.top)),bottom:moments(rows.map(r=>r.bottom)),eligibleUniverse:moments(rows.map(r=>r.eligibleUniverse)),cagr:null};
 if(rows.length>=2){const x=rows.map(r=>r.eligibleUniverse),mx=average(x),variance=x.reduce((s,v)=>s+(v-mx)**2,0);for(const name of ['top','bottom']){const y=rows.map(r=>r[name]),my=average(y),beta=variance?y.reduce((s,v,i)=>s+(v-my)*(x[i]-mx),0)/variance:null;result[name].beta=beta;result[name].annualizedLogCAPMAlpha=beta===null?null:(my-beta*mx)*12;}}
 return result;
}
export async function runCalibration(args){
 const out=privateDir(args['--out']),freezeBytes=fs.readFileSync(args['--freeze']),freeze=JSON.parse(freezeBytes);
 verifyCalibrationFreeze(freeze);
 const contract=JSON.parse(fs.readFileSync(path.join(HERE,'protocol.json')));
 const inputDir=path.resolve(args['--input-dir']);if(!inputDir.startsWith('/workspace/private/'))throw Error('PRIVATE_INPUT_REQUIRED');
 const sourceReceipt=freeze.inputReceipts.find(r=>r.role==='CANONICAL_SOURCE_PROVENANCE_INPUTS');
 if(!sourceReceipt||sha(fs.readFileSync(path.join(inputDir,'data-certification-inputs.json')))!==sourceReceipt.sha256)throw Error('FROZEN_SOURCE_METADATA_REQUIRED');
 const manifestReceipt=freeze.inputReceipts.find(r=>r.role==='CANONICAL_MANIFEST_PLAINTEXT');
 if(!manifestReceipt||sha(fs.readFileSync(path.join(inputDir,'canonical-dataset-manifest.json')))!==manifestReceipt.sha256)throw Error('FROZEN_CANONICAL_MANIFEST_REQUIRED');
 const parsedBytes=fs.readFileSync(args['--reference-parsed']),parsed=JSON.parse(parsedBytes);
 verifyReferenceParsed(parsed,parsedBytes,args['--reference-parsed-sha'],freezeBytes,freeze);
 const data=await loadCanonicalData(inputDir,{sourceProvenanceOverlay:true,expectedSourceMetadataSha256:sourceReceipt.sha256});
 const prepared=prepareRerunData(data,baseProtocol);
 await writePrivateJson(path.join(out,'data-ready.json'),{...prepared.beforePerformance,calibrationFreezeSha256:sha(freezeBytes),referenceParsedSha256:sha(parsedBytes),performanceCalculated:false});
 const terminalPath=path.join(out,'effective-terminal-contracts.json');
 await writePrivateJson(terminalPath,{schema:'calibration-preperformance-effective-terminal-contracts-private-1.0.0',performanceCalculated:false,sourceDataFingerprint:data.fingerprint,effectiveDataFingerprint:prepared.beforePerformance.effectiveDataFingerprint,securities:prepared.data.securities.map(s=>({id:s.id,terminal:s.terminal??null,dataQuarantine:s.dataQuarantine??null}))});
 const receipts=[];
 for(const method of referenceMethods){
  const frame=referenceFrame(prepared.data,method,baseProtocol,contract);
  for(const costMode of ['SOURCE_GROSS','SAME_TOURNAMENT_NET']){
   verifyCalibrationFreeze(freeze);
   verifyReferenceParsed(parsed,fs.readFileSync(args['--reference-parsed']),args['--reference-parsed-sha'],freezeBytes,freeze);
   const riskFreeDaily=parsed.dailyRF?.rows??parsed.riskFreeDaily??[];
   const run=runReferencePortfolio(frame.data,method,frame.protocol,{costMode,riskFreeDaily});
   const metrics=Object.fromEntries(['top','bottom','eligibleUniverse'].map(k=>[k,run[k]?portfolioMetrics(run[k].curve,{initialCapital:baseProtocol.execution.initialCapital,turnover:run[k].turnover,trades:run[k].trades,executionCosts:run[k].executionCosts}):null]));
   metrics.effect=monthlyEffect(run);
   metrics.sourceLogRisk=sourceLogRisk(run,riskFreeDaily,frame.data.benchmark?.bars?.map(b=>b.date)??frame.data.calendar);
   const artifact=path.join(out,method.id+'-'+costMode+'.json');
   await writePrivateJson(artifact,{schema:'supertrader-calibration-stock-construction-private-1.0.0',methodId:method.id,costMode,calibrationFreezeSha256:sha(freezeBytes),sourceDataFingerprint:data.fingerprint,effectiveDataFingerprint:prepared.beforePerformance.effectiveDataFingerprint,referenceParsedSha256:sha(parsedBytes),window:frame.protocol.window,protocol:frame.protocol,methodDefinition:{...method,evaluate:undefined},run,metrics,originalPaperEffectVerdict:null,originalPaperEffectStatus:'BLOCKED_MATCHED_UNIVERSE_AND_SAMPLE',newOutcomeDependentRuleChanges:false});
   receipts.push({id:method.id,costMode,path:artifact,sha256:await shaFile(artifact),bytes:fs.statSync(artifact).size,status:run.status,window:frame.protocol.window,metrics});
   console.log(JSON.stringify({phase:'REFERENCE_CONSTRUCTION_COMPLETED',id:method.id,costMode}));
   if(global.gc)global.gc();
  }
 }
 verifyCalibrationFreeze(freeze);
 verifyReferenceParsed(parsed,fs.readFileSync(args['--reference-parsed']),args['--reference-parsed-sha'],freezeBytes,freeze);
 await writePrivateJson(path.join(out,'calibration-stock-manifest.json'),{schema:'supertrader-calibration-stock-manifest-private-1.0.0',status:'ALL_REGISTERED_STOCK_DIAGNOSTICS_EXECUTED_REVIEW_PENDING',calibrationFreezeSha256:sha(freezeBytes),sourceDataFingerprint:data.fingerprint,effectiveDataFingerprint:prepared.beforePerformance.effectiveDataFingerprint,canonicalInputDirectory:inputDir,canonicalManifestSha256:manifestReceipt.sha256,sourceMetadataSha256:sourceReceipt.sha256,effectiveTerminalContracts:{path:terminalPath,sha256:await shaFile(terminalPath)},referenceParsed:{path:path.resolve(args['--reference-parsed']),sha256:sha(parsedBytes)},protocol:baseProtocol,entries:receipts});
 console.log(JSON.stringify({phase:'CALIBRATION_STOCK_CONSTRUCTIONS_COMPLETED',constructions:receipts.length}));
}
async function shaFile(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let args;try{args=argumentsOf(process.argv.slice(2));await runCalibration(args);}catch(error){if(args?.['--out']?.startsWith('/workspace/private/'))try{await writePrivateJson(path.join(args['--out'],'operational-error.private.json'),{schema:'calibration-operational-error-private-1.0.0',errorName:error.name,message:error.message,stack:error.stack,parameterChanges:false});}catch{}console.error(JSON.stringify({phase:'CALIBRATION_OPERATIONAL_FAILURE',code:/^[A-Z_]+$/.test(error.message)?error.message:'PRIVATE_IO_ERROR'}));process.exitCode=1;}
}
