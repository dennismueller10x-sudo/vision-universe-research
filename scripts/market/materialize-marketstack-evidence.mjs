/** Deterministic, read-only materialization of private cached evidence.
 * Performs no provider/GitHub request and never rewrites source checkpoints. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,openSync,closeSync,renameSync,unlinkSync,constants} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateCheckpoint} from './recover-marketstack-scale.mjs';
import {requestKey,seedPages} from './scale-marketstack.mjs';
import {responseProvenance} from './marketstack-evidence-provenance.mjs';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fail=code=>{throw Error('EVIDENCE_MATERIALIZATION_'+code);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const repositoryRoot=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export function canonicalJSONValue(value){
  if(Array.isArray(value))return value.map(canonicalJSONValue);
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalJSONValue(value[key])]));
  return value;
}
export function responseContentFingerprint(entry){
  const legacyCanonical=typeof entry?.endpoint==='string'&&entry.endpoint.replace(/^\//,'')==='canonical-quote'&&entry.ok==null&&typeof entry.available==='boolean';
  if(!object(entry)||typeof entry.endpoint!=='string'||!entry.endpoint||!object(entry.params||{})||typeof entry.ok!=='boolean'&&!legacyCanonical)fail('INVALID_RESPONSE');
  return digest(JSON.stringify(canonicalJSONValue({endpoint:entry.endpoint.replace(/^\//,''),requestKey:requestKey(entry.endpoint,entry.params||{}),
    checkedAt:entry.checkedAt??null,ok:entry.ok??null,reason:entry.reason??null,data:entry.data??null})));
}
export function validateOriginalActionProbe(probe){
  if(!object(probe)||probe.schemaVersion!=='marketstack-probe-1.0.0'||!object(probe.run)||probe.run.source!=='github-actions'||
    !/^\d+$/.test(String(probe.run.runId||''))||probe.run.snapshotRunId!=null||probe.run.role!=null||!object(probe.accounting)||
    probe.accounting.provider!=='marketstack'||!Array.isArray(probe.endpoints))fail('ORIGINAL_SINGLE_RUN_PROBE_REQUIRED');
  for(const key of ['requestsAttempted','estimatedCreditsConsumed'])if(!Number.isSafeInteger(probe.accounting[key])||probe.accounting[key]<0)fail('INVALID_ORIGINAL_PROBE_LEDGER');
  if(Object.values(probe.accounting).some(value=>object(value)&&value.startedAt))fail('ORIGINAL_SINGLE_RUN_PROBE_REQUIRED');
  for(const entry of probe.endpoints){
    responseContentFingerprint({...entry,params:entry.params||{}});
    if(entry.seeded||entry.sourceRunId!=null&&String(entry.sourceRunId)!==String(probe.run.runId)||
      entry.runId!=null&&String(entry.runId)!==String(probe.run.runId))fail('ORIGINAL_SINGLE_RUN_PROBE_REQUIRED');
  }
  return String(probe.run.runId);
}
/** Exact transformed-content proof can recover a seeded response's origin.
 * Similar payloads, same symbols, or overlapping run intervals cannot. */
export function indexOriginalActionProbes(originals=[]){
  const index=new Map(),inputs=[];
  for(const original of originals){
    const probe=original.probe||original,runId=validateOriginalActionProbe(probe);
    const sha256=original.sha256||digest(JSON.stringify(canonicalJSONValue(probe)));
    inputs.push({runId,sha256,file:original.file?basename(original.file):null});
    for(const entry of seedPages(probe)){
      const hash=responseContentFingerprint(entry),matches=index.get(hash)||new Map(),proofs=matches.get(runId)||new Set();
      proofs.add(sha256);matches.set(runId,proofs);index.set(hash,matches);
    }
  }
  return {index,inputs:inputs.sort((a,b)=>a.runId.localeCompare(b.runId)||a.sha256.localeCompare(b.sha256))};
}
export function materializeResponse(entry,task,checkpoint,index){
  const origin=responseProvenance(entry,checkpoint,task);
  if(origin.sourceRunId)return {...entry,...origin};
  const hash=responseContentFingerprint(entry),matches=index.get(hash);
  if(matches?.size===1){
    const [runId,proofs]=[...matches][0];
    return {...entry,sourceRunId:runId,sourceRunAttribution:'ORIGINAL_ACTION_PROBE_CONTENT_MATCH',
      sourceRunContentProof:{canonicalResponseSHA256:hash,originalActionProbeSHA256s:[...proofs].sort(),
        matchRule:'ENDPOINT_REQUESTKEY_CHECKEDAT_OK_REASON_DATA_CANONICAL_JSON'}};
  }
  if(matches?.size>1)return {...entry,sourceRunId:null,sourceRunAttribution:'UNKNOWN_AMBIGUOUS_ORIGINAL_ACTION_PROBE_CONTENT_MATCH',
    sourceRunContentProof:{canonicalResponseSHA256:hash,candidateOriginalActionRunIds:[...matches.keys()].sort()}};
  return {...entry,...origin};
}
function checkedPrivatePath(path){
  if(typeof path!=='string'||!path)fail('PRIVATE_PATH_REQUIRED');
  const absolute=resolve(path);
  if(/\/(?:reports|public|www|dist|assets|data)(?:\/|$)/.test(absolute)||
    absolute.startsWith(repositoryRoot+'/')&&!absolute.startsWith(join(repositoryRoot,'.market-cache')+'/'))fail('PRIVATE_PATH_REQUIRED');
  for(let part=absolute;;part=dirname(part)){
    try{if(lstatSync(part).isSymbolicLink())fail('UNSAFE_SYMLINK_PATH');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(dirname(part)===part)break;
  }
  return absolute;
}
const readJSON=file=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{fail('INVALID_JSON');}};
export function materializeMarketstackEvidence({workingDirectory,originalProbePaths=[],output}){
  const root=checkedPrivatePath(workingDirectory),out=checkedPrivatePath(output||join(root,'probe-provenance.json'));
  if(out===join(root,'checkpoint.json')||out.startsWith(join(root,'responses')+'/'))fail('OUTPUT_MUST_NOT_REPLACE_SOURCE_EVIDENCE');
  const checkpointFile=join(root,'checkpoint.json');checkedPrivatePath(checkpointFile);
  const checkpoint=readJSON(checkpointFile),status=validateCheckpoint(checkpoint,root);
  if(typeof checkpoint.updatedAt!=='string'||!Number.isFinite(Date.parse(checkpoint.updatedAt)))fail('INVALID_CHECKPOINT_UPDATED_AT');
  const originals=originalProbePaths.map(path=>{
    const file=checkedPrivatePath(path),bytes=readFileSync(file);
    let probe;try{probe=JSON.parse(bytes.toString('utf8'));}catch{fail('INVALID_ORIGINAL_PROBE_JSON');}
    return {file,sha256:digest(bytes),probe};
  });
  if(originalProbePaths.some(path=>resolve(path)===out))fail('OUTPUT_MUST_NOT_REPLACE_SOURCE_EVIDENCE');
  const {index,inputs}=indexOriginalActionProbes(originals),endpoints=[],attributionCounts={},sourceRunCounts={};
  for(const key of Object.keys(checkpoint.tasks).sort()){
    const task=checkpoint.tasks[key],entry=readJSON(join(root,task.file)),response=materializeResponse(entry,task,checkpoint,index);
    endpoints.push(response);attributionCounts[response.sourceRunAttribution]=(attributionCounts[response.sourceRunAttribution]||0)+1;
    const source=response.sourceRunId||'UNKNOWN';sourceRunCounts[source]=(sourceRunCounts[source]||0)+1;
  }
  const result={schemaVersion:'marketstack-materialized-evidence-1.0.0',generatedAt:checkpoint.updatedAt,
    run:{snapshotRunId:checkpoint.lastRun?.runId||null,role:'REPLAY_CONTAINER_NOT_ORIGINAL_RESPONSE_RUN'},accounting:canonicalJSONValue(checkpoint.runs),
    provenance:{checkpointSHA256:digest(readFileSync(checkpointFile)),originalActionProbeInputs:inputs,attributionCounts,sourceRunCounts,
      taskCount:endpoints.length,originalResponseTimestampsPreserved:true,newProviderRequests:0},endpoints};
  // Sort task selection and proof keys, retaining the response body's original
  // object order so existing raw-payload hashes are not changed by replay.
  const bytes=JSON.stringify(result,null,2)+'\n',temporary=out+'.tmp';checkedPrivatePath(temporary);
  mkdirSync(dirname(out),{recursive:true});let fd,created=false;
  try{
    fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    created=true;
    writeFileSync(fd,bytes);closeSync(fd);fd=undefined;renameSync(temporary,out);
  }catch(error){if(fd!==undefined)closeSync(fd);if(created&&existsSync(temporary))unlinkSync(temporary);
    if(error.message?.startsWith('EVIDENCE_MATERIALIZATION_'))throw error;fail('ATOMIC_OUTPUT_FAILED');}
  return {ok:true,taskCount:endpoints.length,sourceRunCount:Object.keys(sourceRunCounts).filter(id=>id!=='UNKNOWN').length,
    attributionCounts,sourceRunCounts,estimatedCreditsConsumed:status.totalCredits,newProviderRequests:0,sha256:digest(bytes),bytes:Buffer.byteLength(bytes)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=name=>process.argv.filter(value=>value.startsWith('--'+name+'=')).map(value=>value.slice(name.length+3));
  try{console.log(JSON.stringify(materializeMarketstackEvidence({workingDirectory:args('working-directory')[0],originalProbePaths:args('original-probe'),output:args('out')[0]})));}
  catch(error){const reason=/^(EVIDENCE_MATERIALIZATION_|RECOVERY_REQUIRED_)/.test(error.message||'')?error.message:'EVIDENCE_MATERIALIZATION_FAILED';
    console.error(JSON.stringify({ok:false,reason}));process.exitCode=1;}
}
