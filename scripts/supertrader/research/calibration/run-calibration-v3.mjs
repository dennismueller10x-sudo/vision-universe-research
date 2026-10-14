/**
 * V3 calibration stock construction for ONE reference method per invocation.
 * Same construction, accounting and tolerance as V2; only the freeze gate (V3
 * freeze, new inputs) and the failure diagnostics differ. Private values are
 * sealed to the owner/session public keys; the public summary carries only
 * status, counts, hashes, codes and sign classes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadCanonicalData} from '../certification/canonical-input.mjs';
import {prepareRerunData} from '../certification/run-rerun.mjs';
import {portfolioMetrics} from '../tournament/metrics.mjs';
import * as Listing from '../../validation/lib.mjs';
import {referenceMethods} from './reference-engines.mjs';
import {runReferencePortfolio} from './portfolio-calibration-v3.mjs';
import {referenceFrame,monthlyEffect,sourceLogRisk} from './run-calibration-v2.mjs';
import {verifyFreezeV3,verifyInputsAgainstFreeze} from './freeze-v3.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const demand=(ok,code)=>{if(!ok)throw new Error(code);};
const baseProtocol=JSON.parse(fs.readFileSync(path.join(HERE,'../tournament/protocol.json')));
// Registry ids (BACKTEST-CALIBRATION-METHODS.json) -> frozen engine ids (reference-engines.mjs); same parameters, no new method.
export const ENGINE_ID={CAL_JT1993_6_6_REBALANCED_EW_NO_SKIP:'CALIB_JT6_6_NO_SKIP',CAL_GH2004_52WH_30_6_NO_SKIP:'CALIB_GH52WH',CAL_BLITZVANVLIET2007_US_LOWVOL_LOG_EXCESS:'CALIB_LOW_VOL',CALIB_EQUAL_WEIGHT:'CALIB_EQUAL_WEIGHT'};
const direction=x=>!Number.isFinite(x)?'UNAVAILABLE':x>0?'POSITIVE':x<0?'NEGATIVE':'ZERO';

function parseArgs(argv){
 const allowed=['--freeze','--input-dir','--reference-parsed','--out','--public-out','--method'],out={};
 for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1];demand(allowed.includes(k)&&!(k in out)&&v&&!v.startsWith('--'),'EXPLICIT_UNIQUE_V3_ARGUMENTS_REQUIRED');out[k]=v;}
 demand(allowed.every(k=>out[k]),'ALL_V3_ARGUMENTS_REQUIRED');return out;
}

/** JSON-equivalent serializer that never builds one string above the V8 limit (~512 MB); returns a Buffer. */
export function serializeLarge(value){
 const parts=[];
 const push=s=>parts.push(Buffer.from(s));
 const walk=(v,depth)=>{
  if(v===null||typeof v!=='object'||depth>=5){push(JSON.stringify(v)??'null');return;}
  if(Array.isArray(v)){
   push('[');
   for(let i=0;i<v.length;i+=1000){const slice=JSON.stringify(v.slice(i,i+1000));push((i?',':'')+slice.slice(1,-1));}
   push(']');return;
  }
  push('{');let first=true;
  for(const [k,x] of Object.entries(v)){
   if(x===undefined||typeof x==='function'||typeof x==='symbol')continue;
   push((first?'':',')+JSON.stringify(k)+':');first=false;walk(x,depth+1);
  }
  push('}');
 };
 walk(value,0);return Buffer.concat(parts);
}
function seal(file,bytes){
 const keys=[['owner','scripts/supertrader/validation/results-public-key.pem'],['session','scripts/supertrader/research/tournament/session-public-key.pem']];
 const written=[];
 for(const [aud,p] of keys){const name=`${file}.${aud}.sealed.json`,sealed=Listing.encryptForOwner(fs.readFileSync(path.join(ROOT,p),'utf8'),bytes);fs.writeFileSync(name,sealed,{mode:0o600,flag:'wx'});written.push({audience:aud,name:path.basename(name),sha256:sha(Buffer.from(sealed)),bytes:Buffer.byteLength(sealed)});}
 return written;
}
function publicTrace(trace){
 if(!trace)return null;
 const r=trace.reconciliation;
 return{leg:trace.leg,pass:false,absoluteDifference:r.absoluteDifference,tolerance:trace.tolerance,relativeDifference:r.actual?r.absoluteDifference/Math.abs(r.actual):null,tradeCount:trace.tradeCount,fillCount:trace.fillCount,openPositions:trace.openPositions,receivableCount:trace.receivableCount,curveLength:trace.curveLength,lastCurveDate:trace.lastCurveDate,cashPrecisionCorrections:trace.cashPrecisionCorrections,rejections:trace.rejections,corporateActionAuditEntries:trace.corporateActionAuditEntries};
}

export async function runMethodV3(args){
 const out=path.resolve(args['--out']);demand(out.startsWith('/workspace/private/'),'PRIVATE_OUTPUT_REQUIRED');fs.mkdirSync(out,{recursive:true,mode:0o700});
 const inputDir=path.resolve(args['--input-dir']);demand(inputDir.startsWith('/workspace/private/'),'PRIVATE_INPUT_REQUIRED');
 const freezeBytes=fs.readFileSync(args['--freeze']),freeze=JSON.parse(freezeBytes);
 verifyFreezeV3(freeze);verifyInputsAgainstFreeze(freeze,{inputDir,referenceParsedPath:args['--reference-parsed']});
 demand(freeze.methods.measurable.includes(args['--method']),'METHOD_NOT_MEASURABLE_UNDER_FREEZE');
 const method=referenceMethods.find(m=>m.id===ENGINE_ID[args['--method']]);demand(method,'REGISTERED_REFERENCE_METHOD_REQUIRED');
 const parsedBytes=fs.readFileSync(args['--reference-parsed']),parsed=JSON.parse(parsedBytes);
 const sourceMetadataSha=freeze.inputReceipts.find(r=>r.role==='CANONICAL_SOURCE_PROVENANCE_INPUTS').sha256;
 const data=await loadCanonicalData(inputDir,{sourceProvenanceOverlay:true,expectedSourceMetadataSha256:sourceMetadataSha});
 const prepared=prepareRerunData(data,baseProtocol);
 const contract=JSON.parse(fs.readFileSync(path.join(HERE,'protocol.json')));
 const riskFreeDaily=parsed.dailyRF?.rows??parsed.riskFreeDaily??[];
 const frame=referenceFrame(prepared.data,method,baseProtocol,contract);
 const summary={schema:'supertrader-calibration-v3-method-public-summary-1.0.0',freezeId:freeze.freezeId,freezeFileSha256:sha(freezeBytes),methodId:args['--method'],engineMethodId:method.id,runnerNode:process.version,results:[],performanceNumbersPublished:false};
 for(const costMode of ['SOURCE_GROSS','SAME_TOURNAMENT_NET']){
  verifyFreezeV3(freeze);
  const entry={costMode};
  try{
   const run=runReferencePortfolio(frame.data,method,frame.protocol,{costMode,riskFreeDaily});
   const metrics=Object.fromEntries(['top','bottom','eligibleUniverse'].map(k=>[k,run[k]?portfolioMetrics(run[k].curve,{initialCapital:baseProtocol.execution.initialCapital,turnover:run[k].turnover,trades:run[k].trades,executionCosts:run[k].executionCosts}):null]));
   metrics.effect=monthlyEffect(run);
   metrics.sourceLogRisk=sourceLogRisk(run,riskFreeDaily,frame.data.benchmark?.bars?.map(b=>b.date)??frame.data.calendar);
   const artifact={schema:'supertrader-calibration-v3-stock-construction-private-1.0.0',freezeId:freeze.freezeId,methodId:args['--method'],engineMethodId:method.id,costMode,window:frame.protocol.window,run,metrics};
   const bytes=serializeLarge(artifact);
   const base=path.join(out,`${args['--method']}-${costMode}`);
   Object.assign(entry,{status:run.status,plaintextSha256:sha(bytes),plaintextBytes:bytes.length,sealed:seal(base,bytes),
    formations:{total:run.formations.length,ready:run.formations.filter(f=>f.status==='READY').length,partial:run.formations.filter(f=>f.status==='PARTIAL').length,other:run.formations.filter(f=>!['READY','PARTIAL'].includes(f.status)).length},
    months:run.monthly.length,dustWriteOffs:Object.fromEntries(['top','bottom','eligibleUniverse'].filter(k=>run[k]).map(k=>[k,{count:run[k].dustWriteOffs.count,totalMarkValue:run[k].dustWriteOffs.totalMarkValue,largestMarkValue:run[k].dustWriteOffs.largestMarkValue}])),reconciliation:Object.fromEntries(['top','bottom','eligibleUniverse'].filter(k=>run[k]).map(k=>[k,{pass:run[k].reconciliation.pass,absoluteDifference:run[k].reconciliation.absoluteDifference}])),
    sourceSpreadDirection:direction(metrics.effect.monthlySourceSpreadMean),sourceSpreadValidMonths:metrics.effect.sourceSpreadValidMonths});
  }catch(error){
   const code=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PRIVATE_RUN_FAILURE';
   Object.assign(entry,{status:'FAILED_CLOSED',errorCode:code,bookTrace:publicTrace(error.bookTrace)});
   entry.errorClass=error.name;entry.errorHint=/^[A-Za-z ,.:'()_-]{1,80}$/.test(error.message)&&!/^[A-Z0-9_]+$/.test(error.message)?error.message:null;entry.sealedFailure=seal(path.join(out,`${args['--method']}-${costMode}.failure`),Buffer.from(JSON.stringify({schema:'supertrader-calibration-v3-failure-private-1.0.0',freezeId:freeze.freezeId,methodId:args['--method'],engineMethodId:method.id,costMode,errorName:error.name,message:error.message,stack:error.stack,bookTrace:error.bookTrace??null,parameterChanges:false})));
  }
  summary.results.push(entry);if(global.gc)global.gc();
 }
 summary.verdict=summary.results.every(r=>r.status!=='FAILED_CLOSED')?'MEASURED_REVIEW_PENDING':'FAILED_CLOSED_CAUSE_RECORDED';
 fs.mkdirSync(path.dirname(path.resolve(args['--public-out'])),{recursive:true});
 fs.writeFileSync(args['--public-out'],JSON.stringify(summary,null,2)+'\n');
 return summary;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const s=await runMethodV3(parseArgs(process.argv.slice(2)));process.stdout.write(JSON.stringify({methodId:s.methodId,verdict:s.verdict,results:s.results.map(r=>({costMode:r.costMode,status:r.status,errorCode:r.errorCode??null,reconciliationDifference:r.bookTrace?.absoluteDifference??null}))})+'\n');}
 catch(e){process.stderr.write(JSON.stringify({phase:'V3_METHOD_OPERATIONAL_FAILURE',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'PRIVATE_IO_ERROR'})+'\n');process.exitCode=1;}
}
