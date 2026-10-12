// Current-only orchestration. No historical performance, rule or fact synthesis.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadCurrentScannerWithReceipts} from './current-source-receipts.mjs';
import {methods,prepareSourceFeatures} from '../tournament/methods.mjs';
import {currentScan,currentConsensus} from './runner-v2.mjs';
import {encryptForOwner} from '../../validation/lib.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../../..');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const isDay=x=>typeof x==='string'&&DAY.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const success=new Set(['READY','OK','AVAILABLE','PARTIAL']);
export const CURRENT_RERUN_SCHEMA='supertrader-certification-current-private-2.0.0';
export const CURRENT_INPUT_MAX_BYTES=8*1024*1024;
const MAX_SEALED_BYTES=32*1024*1024;
const MAX_REPORT_PAIR_BYTES=24*1024*1024;

export function parseCurrentRerunArguments(argv){
  const result={},seen=new Set();
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if(!['--out','--freeze','--eligibility','--as-of'].includes(flag)||seen.has(flag))throw new Error('INVALID_OR_DUPLICATE_CURRENT_ARGUMENT');
    seen.add(flag);const value=argv[++i];
    if(typeof value!=='string'||!value.trim()||value.startsWith('--'))throw new Error('CURRENT_ARGUMENT_VALUE_REQUIRED');
    result[{'--out':'out','--freeze':'freezePath','--eligibility':'eligibilityPath','--as-of':'asOf'}[flag]]=value;
  }
  if(Object.keys(result).length!==4||!isDay(result.asOf))throw new Error('EXPLICIT_CURRENT_OUT_FREEZE_ELIGIBILITY_VALID_DAY_REQUIRED');
  return result;
}

export function validateCurrentEligibility(document,definitions=methods){
  if(document?.schema!=='supertrader-method-eligibility-2.0.0'||!Array.isArray(document.methods))throw new Error('CURRENT_ELIGIBILITY_SCHEMA_REQUIRED');
  const expected=new Set(definitions.map(m=>m.id)),found=new Set();
  for(const row of document.methods){
    if(!expected.has(row.id)||found.has(row.id)||!['ELIGIBLE','PARTIAL','BLOCKED'].includes(row.eligibility)||
       (row.method_id!==undefined&&row.method_id!==row.id))throw new Error('CURRENT_ELIGIBILITY_KNOWN_UNIQUE_METHOD_ROWS_REQUIRED');
    if(row.eligibility==='ELIGIBLE'&&row.fully_certified!==true)throw new Error('ELIGIBLE_REQUIRES_EXPLICIT_FULL_CERTIFICATION');
    found.add(row.id);
  }
  if(found.size!==expected.size)throw new Error('CURRENT_ELIGIBILITY_ALL_FROZEN_METHODS_REQUIRED');
  return new Map(document.methods.map(row=>[row.id,row]));
}

// Same source algorithms and full-prefix N; only the conservative admission
// label is added. No annual fact, issuer identity or priceSource is invented.
export function scanCurrentData(current,{asOf,eligibility,protocol,definitions=methods,scan=currentScan}={}){
  const admission=validateCurrentEligibility(eligibility,definitions);
  const available=current.state==='AVAILABLE'&&current.formationDate===asOf;
  if(available){
    prepareSourceFeatures(current);
    const originals=new Map(current.securities.map(s=>[s.id,s]));
    for(const s of current.scanner||[])s.sourceFeatures=originals.get(s.id)?.sourceFeatures;
  }
  const scans=definitions.map(method=>{
    const row=admission.get(method.id);
    const observed=available?scan(current,method,protocol,asOf):{id:method.id,asOf:null,status:'BLOCKED_DATA',reason:current.reason||'EXACT_CURRENT_CLOSED_SESSION_UNAVAILABLE',numberMatches:null,candidates:[]};
    const blocked=row.eligibility==='BLOCKED'||!available;
    return {...observed,eligibility:blocked?'BLOCKED':row.eligibility,fullyCertified:!blocked&&row.eligibility==='ELIGIBLE',
      sourceScanStatus:observed.status,status:blocked?'BLOCKED_DATA':observed.status,
      ...(blocked?{numberMatches:null,candidates:[],unranked:true,blockingReasons:row.reason_codes||['CURRENT_INPUTS_UNAVAILABLE']}:{}),
      certificationReasons:row.reason_codes||[],confidenceCeiling:row.overall_confidence||'UNAVAILABLE'};
  });
  const eligibleIds=scans.filter(s=>s.eligibility==='ELIGIBLE'&&success.has(s.status)).map(s=>s.id);
  const diagnosticIds=scans.filter(s=>['ELIGIBLE','PARTIAL'].includes(s.eligibility)&&success.has(s.status)).map(s=>s.id);
  return {scans,consensus:{qualifiedEligible:currentConsensus(scans,eligibleIds),qualifiedEligibleMethodIds:eligibleIds,
    partialDiagnostic:currentConsensus(scans,diagnosticIds),partialDiagnosticMethodIds:diagnosticIds,
    eligibleStrongMethods:[],strongMethods:[],strongMethodsGate:'FINAL_HISTORICAL_RERUN_REVIEW_REQUIRED',notAnIndependentTradingScore:true}};
}

function privateDirectory(out){
  const dest=path.resolve(out),inside=p=>p===ROOT||p.startsWith(ROOT+path.sep);
  if(inside(dest))throw new Error('PRIVATE_CURRENT_OUTPUT_MUST_BE_OUTSIDE_REPO');
  let ancestor=dest;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  if(inside(fs.realpathSync(ancestor)))throw new Error('PRIVATE_CURRENT_OUTPUT_ALIAS_POINTS_INSIDE_REPO');
  fs.mkdirSync(dest,{recursive:true,mode:0o700});
  if(fs.lstatSync(dest).isSymbolicLink()||inside(fs.realpathSync(dest)))throw new Error('PRIVATE_CURRENT_OUTPUT_SYMLINK_FORBIDDEN');
  return dest;
}
function encryptionKeys(){return [['owner',fs.readFileSync(path.join(ROOT,'scripts/supertrader/validation/results-public-key.pem'),'utf8')],
  ['session',fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/tournament/session-public-key.pem'),'utf8')]];}
function sealBytes(out,stem,bytes,keys,{maxPairBytes=Infinity}={}){
  const files=[];
  for(const [audience,key]of keys){const body=Buffer.from(JSON.stringify(encryptForOwner(key,bytes))+'\n');
    if(body.length>MAX_SEALED_BYTES)throw new Error('CURRENT_ENCRYPTED_ARTIFACT_EXCEEDS_BOUND');
    if(files.reduce((sum,f)=>sum+f.bytes,0)+body.length>maxPairBytes)throw new Error('CURRENT_ROOT_REPORT_PAIR_EXCEEDS_BOUND');
    const name=`${stem}.${audience}.sealed.json`;fs.writeFileSync(path.join(out,name),body,{mode:0o600});files.push({file:name,sha256:sha(body),bytes:body.length});
  }
  return files;
}
function metadataReceipts(){
  return ['quant/data/market/scale/universe-FULL_UNIVERSE.json','quant/data/market/security-master/eligibility.json',
    'quant/data/market/security-master/company-names.json','quant/data/sec/consumer/index.json'].map(file=>({file,
      status:fs.existsSync(path.join(ROOT,file))?'AVAILABLE':'MISSING',sha256:fs.existsSync(path.join(ROOT,file))?sha(fs.readFileSync(path.join(ROOT,file))):null,
      scope:'CURRENT_REPO_METADATA_SNAPSHOT_NOT_HISTORICAL_CERTIFICATION'}));
}

// Lossless bounded export for independent source-prefix replay. The large
// current object is never serialized as one string; scanners join exact IDs.
export function exportCurrentInputs(current,{out,keys,maxBytes=CURRENT_INPUT_MAX_BYTES}={}){
  if(!Number.isInteger(maxBytes)||maxBytes<128||maxBytes>CURRENT_INPUT_MAX_BYTES)throw new Error('INVALID_CURRENT_INPUT_EXPORT_BOUND');
  const inputOut=path.join(out,'inputs');fs.mkdirSync(inputOut,{recursive:true,mode:0o700});
  const inputSeal=(stem,bytes)=>sealBytes(inputOut,stem,bytes,keys).map(f=>({...f,file:'inputs/'+f.file}));
  const chunks=[],pieces=[];let size=0,ordinal=0;
  // Include JSON framing in the plaintext limit, including the next ordinal.
  const framingBytes=()=>Buffer.byteLength(`{"schema":"supertrader-current-security-inputs-2.0.0","ordinal":${ordinal+1},"securities":[]}`);
  const flush=()=>{if(!pieces.length)return;ordinal++;const bytes=Buffer.from(`{"schema":"supertrader-current-security-inputs-2.0.0","ordinal":${ordinal},"securities":[${pieces.join(',')}]}`);
    chunks.push({ordinal,securityCount:pieces.length,plaintextSha256:sha(bytes),files:inputSeal(`current-input-securities-${String(ordinal).padStart(4,'0')}`,bytes)});pieces.length=0;size=0;};
  for(const security of current.securities||[]){const text=JSON.stringify(security),bytes=Buffer.byteLength(text)+1;
    if(bytes+framingBytes()>maxBytes)throw new Error('ONE_CURRENT_SECURITY_EXCEEDS_EXPORT_BOUND');
    if(size+bytes+framingBytes()>maxBytes)flush();pieces.push(text);size+=bytes;
  }
  flush();
  const header={schema:'supertrader-current-input-manifest-private-2.0.0',state:current.state,formationDate:current.formationDate||null,
    universeId:current.universeId||null,fingerprint:current.fingerprint||null,coverage:current.coverage||null,limitations:current.limitations||[],
    benchmark:current.benchmark||null,calendar:current.calendar||[],scannerIds:(current.scanner||[]).map(s=>s.id),
    scannerPrefixLengths:(current.scanner||[]).map(s=>({id:s.id,bars:s.bars.length})),
    sourceReceiptCoverage:current.sourceReceiptCoverage||null,privateSourceReceiptDiagnostics:current.privateSourceReceiptDiagnostics||null,chunks};
  const files=inputSeal('current-input-manifest',Buffer.from(JSON.stringify(header)));
  return {schema:'supertrader-current-input-export-receipt-2.0.0',securityChunks:chunks.length,securityCount:(current.securities||[]).length,files,
    chunkFiles:chunks.flatMap(c=>c.files),scope:'LOSSLESS_CANONICAL_CURRENT_SOURCE_PREFIXES_PRIVATE_ENCRYPTED'};
}

export async function runCurrentRerun(options,deps={}){
  if(!isDay(options?.asOf))throw new Error('EXPLICIT_CURRENT_VALID_DAY_REQUIRED');
  const out=privateDirectory(options.out),keys=deps.keys||encryptionKeys(),freezeBytes=fs.readFileSync(options.freezePath),eligibilityBytes=fs.readFileSync(options.eligibilityPath);
  const freeze=JSON.parse(freezeBytes),eligibility=JSON.parse(eligibilityBytes);
  const assertV2=deps.assertFreezeV2||(await import('./freeze-v2.mjs')).assertFreezeV2;
  assertV2(freeze);validateCurrentEligibility(eligibility);
  if(JSON.stringify(freeze.eligibility)!==JSON.stringify(eligibility))throw new Error('CURRENT_ELIGIBILITY_NOT_IDENTICAL_TO_FREEZE');
  const eligibilityContractPath='scripts/supertrader/research/certification/SUPERTRADER-METHOD-ELIGIBILITY.json';
  if(freeze.files?.[eligibilityContractPath]!==sha(eligibilityBytes))throw new Error('CURRENT_ELIGIBILITY_BYTES_NOT_FROZEN_CONTRACT');
  const before=metadataReceipts(),openedAt=new Date().toISOString();
  const current=await(deps.loader||loadCurrentScannerWithReceipts)({asOf:options.asOf,lookbackBars:1000000,maxStaleDays:0});
  const after=metadataReceipts();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('CURRENT_METADATA_CHANGED_DURING_LOAD');
  const protocol=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/tournament/protocol.json')));
  const {scans,consensus}=scanCurrentData(current,{asOf:options.asOf,eligibility,protocol,scan:deps.scan||currentScan});
  const exact=current.state==='AVAILABLE'&&current.formationDate===options.asOf;
  const inputExport=exportCurrentInputs(current,{out,keys});
  const report={schema:CURRENT_RERUN_SCHEMA,openedAt,closedAt:new Date().toISOString(),freeze,freezeFileHash:sha(freezeBytes),eligibility,eligibilityFileHash:sha(eligibilityBytes),protocol,
    requestedAsOf:options.asOf,currentAsOf:exact?current.formationDate:null,currentCoverage:current.coverage||null,currentLimitations:current.limitations||[],
    currentFingerprint:current.fingerprint||null,currentScans:scans,consensus,inputManifestReceipt:inputExport,metadataSourceReceipts:before,
    missingPriceSourceContracts:(current.securities||[]).filter(s=>!s.priceSource).length,
    sourceReceiptCoverage:current.sourceReceiptCoverage||null,
    sourceScope:'FRESH_EXISTING_R2_READ_CURRENT_METADATA_NOT_RETROSPECTIVE_ISSUER_OR_FACT_CERTIFICATION',historicalCalculation:'NOT_RUN_CURRENT_ONLY',
    forwardLedger:{status:'PREPARED_NOT_LIVE',records:[],methods:methods.map(m=>({id:m.id,priority:'UNRANKED',records:[],baselineSnapshot:scans.find(s=>s.id===m.id),baselineIsPostFreezeSignal:false}))},
    status:exact?'CURRENT_SCANNED_REVIEW_PENDING':'CURRENT_BLOCKED_DATA',privateDiagnostics:current.privateDiagnostics||null};
  sealBytes(out,'current-rerun-results',Buffer.from(JSON.stringify(report)),keys,{maxPairBytes:MAX_REPORT_PAIR_BYTES});
  const status={schema:'supertrader-current-rerun-safe-status-2.0.0',status:report.status,mode:'CURRENT_ONLY',methods:scans.length,
    eligibleMethods:scans.filter(s=>s.eligibility==='ELIGIBLE').length,partialMethods:scans.filter(s=>s.eligibility==='PARTIAL').length,
    blockedMethods:scans.filter(s=>s.eligibility==='BLOCKED').length,exactClosedSessionAvailable:exact,
    sourceInputChunks:inputExport.securityChunks,historicalPerformanceCalculated:false,forwardRecords:0,finalReviewPending:true};
  fs.writeFileSync(path.join(out,'safe-status.json'),JSON.stringify(status,null,2)+'\n',{mode:0o600});
  return {status,report};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let out;
  try{const options=parseCurrentRerunArguments(process.argv.slice(2));out=privateDirectory(options.out);const result=await runCurrentRerun(options);console.log(JSON.stringify(result.status));}
  catch(error){try{if(out){sealBytes(out,'current-rerun-error',Buffer.from(JSON.stringify({error:String(error.message),stack:error.stack||null})),encryptionKeys());
      fs.writeFileSync(path.join(out,'safe-status.json'),JSON.stringify({schema:'supertrader-current-rerun-safe-status-2.0.0',status:'CURRENT_RERUN_FAILED',historicalPerformanceCalculated:false})+'\n',{mode:0o600});}}catch{/* No private diagnostics escape encryption failures. */}
    process.stderr.write('CURRENT_RERUN_FAILED\n');process.exitCode=1;}
}
