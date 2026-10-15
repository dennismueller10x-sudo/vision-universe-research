/**
 * Final V3 pre-measurement freeze, built inside the runner from the capture that
 * was just verified. It binds input hashes, the reference artifact, the
 * transitive code closure of the measurement runner and the frozen contract
 * files. Nothing here reads provider values or computes performance.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {computeContentBinding} from './capture-v3-inrunner.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const demand=(ok,code)=>{if(!ok)throw new Error(code);};
export const FREEZE_V3_SCHEMA='supertrader-calibration-v3-final-freeze-1.0.0';
const rel=(root,f)=>path.relative(root,f).split(path.sep).join('/');

export const CONTRACT_FILES=[
 'scripts/supertrader/research/calibration/protocol.json',
 'scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-METHODS.json',
 'scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-FREEZE-V2.json',
 'scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-FREEZE-V3.json',
 'scripts/supertrader/research/calibration/CALIBRATION-V3-REFERENCE-SOURCE-PLAN.json',
 'scripts/supertrader/research/tournament/protocol.json',
 '.github/workflows/supertrader-calibration-v3.yml',
 '.github/workflows/supertrader-calibration-v3-pipeline.yml'
];
export const ENTRY_POINTS=[
 'scripts/supertrader/research/calibration/run-calibration-v3.mjs',
 'scripts/supertrader/research/calibration/capture-v3-inrunner.mjs',
 'scripts/supertrader/research/calibration/capture-reference-v3.mjs',
 'scripts/supertrader/research/calibration/freeze-v3.mjs',
 'scripts/supertrader/research/calibration/run-post-calibration-v3.mjs',
 'scripts/supertrader/research/calibration/build-completion-v3.mjs'
];

/** Static relative import/require closure (ESM `from './x'` and `require('./x')`). */
export function importClosure(entries,root=ROOT){
 const seen=new Set(),queue=entries.map(e=>path.resolve(root,e));
 while(queue.length){
  const file=queue.pop();if(seen.has(file))continue;
  demand(file.startsWith(root+path.sep)&&fs.existsSync(file),'FREEZE_CODE_FILE_MISSING');
  seen.add(file);if(!/\.(mjs|js)$/.test(file))continue;
  const text=fs.readFileSync(file,'utf8');
  for(const m of text.matchAll(/(?:from\s+|import\(\s*|require\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){
   const target=path.resolve(path.dirname(file),m[1]);
   if(fs.existsSync(target)&&fs.statSync(target).isFile())queue.push(target);
  }
 }
 return [...seen].map(f=>rel(root,f)).sort();
}

export function hashFiles(files,root=ROOT){
 return Object.fromEntries(files.slice().sort().map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
}

export function normalizedReference(bytes){const x=JSON.parse(bytes);delete x.createdAt;return sha(Buffer.from(JSON.stringify(x)));}
export function buildFreezeV3({root=ROOT,captureReceipt,inputDir,referenceParsedPath,runId=null,codeCommit=null,now=new Date().toISOString()}){
 demand(captureReceipt?.status==='V3_CANONICAL_CAPTURE_VERIFIED_IN_RUNNER','CAPTURE_RECEIPT_NOT_VERIFIED');
 demand(captureReceipt.counts.usableSegments===captureReceipt.counts.verifiedSecurities&&captureReceipt.counts.parts>0,'CAPTURE_COUNTS_INCONSISTENT');
 demand(captureReceipt.contentBinding?.schema==='supertrader-calibration-v3-content-binding-1.0.0','CAPTURE_CONTENT_BINDING_REQUIRED');
 const manifestBytes=fs.readFileSync(path.join(inputDir,'canonical-dataset-manifest.json')),inputsBytes=fs.readFileSync(path.join(inputDir,'data-certification-inputs.json'));
 demand(sha(manifestBytes)===captureReceipt.inputs.manifestSha256&&sha(inputsBytes)===captureReceipt.inputs.sourceMetadataSha256,'CAPTURE_RECEIPT_DISK_HASH_MISMATCH');
 const parsedBytes=fs.readFileSync(referenceParsedPath),parsed=JSON.parse(parsedBytes);
 demand(parsed.schema==='vision-universe-calibration-v3-parsed-reference-private-1.0.0'&&parsed.noPostResultToleranceChanges===true,'REFERENCE_PARSED_SCHEMA_INVALID');
 const code=importClosure(ENTRY_POINTS,root),files=hashFiles([...new Set([...code,...CONTRACT_FILES])],root);
 const protocol=JSON.parse(fs.readFileSync(path.join(root,'scripts/supertrader/research/tournament/protocol.json')));
 const body={
  schema:FREEZE_V3_SCHEMA,status:'FROZEN_BEFORE_PERFORMANCE',
  frozenBeforePerformance:true,registeredBeforePerformance:true,strategyDefinitionsChanged:false,postResultTuningAllowed:false,
  createdAt:now,provenance:{workflowRunId:runId,codeCommit,runnerNode:process.version},
  inputBasis:'NEW_AUTHORIZED_CAPTURE_VERIFIED_IN_RUNNER; EARLIER_ENCRYPTED_500_PART_CAPTURE_IS_HISTORICAL_EVIDENCE_ONLY',
  inputReceipts:[
   {role:'CANONICAL_MANIFEST_PLAINTEXT',sha256:sha(manifestBytes),bytes:manifestBytes.length},
   {role:'CANONICAL_SOURCE_PROVENANCE_INPUTS',sha256:sha(inputsBytes),bytes:inputsBytes.length},
   {role:'CANONICAL_PART_HASH_LIST',sha256:sha(Buffer.from(JSON.stringify(captureReceipt.inputs.parts))),parts:captureReceipt.inputs.parts.length,securities:captureReceipt.counts.usableSegments},
   {role:'REFERENCE_PARSED_PLAINTEXT',sha256:sha(parsedBytes),bytes:parsedBytes.length,sourcePlanSha256:parsed.sourcePlanSha256,parserSha256:parsed.parserSha256},
   {role:'REFERENCE_PARSED_NORMALIZED',sha256:normalizedReference(parsedBytes),excludes:['createdAt'],sourcePlanSha256:parsed.sourcePlanSha256,parserSha256:parsed.parserSha256},
   {role:'CANONICAL_CONTENT_BINDING',sha256:sha(Buffer.from(JSON.stringify(captureReceipt.contentBinding))),binding:captureReceipt.contentBinding}
  ],
  captureReceipt:{provenance:captureReceipt.provenance,counts:captureReceipt.counts,rejections:captureReceipt.rejections,contract:captureReceipt.contract,manifestSha256:captureReceipt.inputs.manifestSha256,sourceMetadataSha256:captureReceipt.inputs.sourceMetadataSha256,sourceObjectSetSha256:captureReceipt.inputs.sourceObjectSetSha256,readReceiptSetSha256:captureReceipt.inputs.readReceiptSetSha256},
  contracts:{
   universe:{id:protocol.universe.id,window:protocol.window,fileSha256:files['scripts/supertrader/research/tournament/protocol.json']},
   execution:protocol.execution,delisting:protocol.delisting,
   corporateAction:{rule:'UNCHANGED_FROZEN_LOADER_SPLIT_VALIDATION',files:Object.fromEntries(Object.entries(files).filter(([f])=>/quant\/engines\/(return-series|published-close)|tournament\/data\.mjs|canonical-input\.mjs|data-inventory\.mjs/.test(f)))},
   cost:{slippageBpsPerSide:protocol.execution.slippageBpsPerSide,commissionBpsPerSide:protocol.execution.commissionBpsPerSide,costModes:['SOURCE_GROSS','SAME_TOURNAMENT_NET']},
   tolerance:{reconciliation:'max(1e-6, actual*1e-10) inherited from accounting-budget-v2; no post-result adjustment'},
   referenceConstruction:{parsedSha256:sha(parsedBytes),parserSha256:parsed.parserSha256,sourcePlanSha256:parsed.sourcePlanSha256}
  },
  methods:{measurable:['CAL_JT1993_6_6_REBALANCED_EW_NO_SKIP','CAL_GH2004_52WH_30_6_NO_SKIP','CAL_BLITZVANVLIET2007_US_LOWVOL_LOG_EXCESS','CALIB_EQUAL_WEIGHT'],dataBlocked:['gross_profitability_novy_marx','piotroski_value_fscore','value_plus_momentum','buyback_announcement_event']},
  files
 };
 const freezeId='V3-'+sha(Buffer.from(JSON.stringify(body))).slice(0,16);
 return {...body,freezeId};
}

export function verifyFreezeV3(freeze,{root=ROOT}={}){
 demand(freeze?.schema===FREEZE_V3_SCHEMA&&freeze.status==='FROZEN_BEFORE_PERFORMANCE'&&freeze.frozenBeforePerformance===true&&freeze.registeredBeforePerformance===true,'V3_FREEZE_STATUS_INVALID');
 demand(freeze.strategyDefinitionsChanged===false&&freeze.postResultTuningAllowed===false,'V3_FREEZE_MUTATION_FLAGS_INVALID');
 const {freezeId,...body}=freeze;demand(freezeId==='V3-'+sha(Buffer.from(JSON.stringify(body))).slice(0,16),'V3_FREEZE_ID_MISMATCH');
 demand(freeze.files&&Object.keys(freeze.files).length>10,'V3_FREEZE_FILE_BINDINGS_REQUIRED');
 for(const [f,digest] of Object.entries(freeze.files)){
  demand(!path.isAbsolute(f)&&!f.split('/').includes('..')&&/^[a-f0-9]{64}$/.test(digest),'V3_FREEZE_PATH_INVALID');
  const file=path.resolve(root,f);demand(file.startsWith(root+path.sep)&&fs.existsSync(file)&&sha(fs.readFileSync(file))===digest,'V3_FROZEN_FILE_CHANGED');
 }
 const rolesRequired=['CANONICAL_MANIFEST_PLAINTEXT','CANONICAL_SOURCE_PROVENANCE_INPUTS','CANONICAL_PART_HASH_LIST','REFERENCE_PARSED_PLAINTEXT','REFERENCE_PARSED_NORMALIZED','CANONICAL_CONTENT_BINDING'];
 for(const role of rolesRequired)demand(freeze.inputReceipts?.filter(r=>r.role===role).length===1,'V3_FREEZE_INPUT_RECEIPT_REQUIRED');
 return true;
}

/** Re-hashes the private inputs against the freeze. Part hashes are verified by the canonical reader. */
export function verifyInputsAgainstFreeze(freeze,{inputDir,referenceParsedPath}){
 const get=role=>freeze.inputReceipts.find(r=>r.role===role);
 demand(sha(fs.readFileSync(path.join(inputDir,'canonical-dataset-manifest.json')))===get('CANONICAL_MANIFEST_PLAINTEXT').sha256,'FROZEN_CANONICAL_MANIFEST_MISMATCH');
 demand(sha(fs.readFileSync(path.join(inputDir,'data-certification-inputs.json')))===get('CANONICAL_SOURCE_PROVENANCE_INPUTS').sha256,'FROZEN_SOURCE_METADATA_MISMATCH');
 demand(sha(fs.readFileSync(referenceParsedPath))===get('REFERENCE_PARSED_PLAINTEXT').sha256,'FROZEN_REFERENCE_PARSED_MISMATCH');
 const manifest=JSON.parse(fs.readFileSync(path.join(inputDir,'canonical-dataset-manifest.json')));
 const list=sha(Buffer.from(JSON.stringify(manifest.parts.map(({stem,sha256,plaintextBytes,securities})=>({stem,sha256,plaintextBytes,securities})))));
 demand(list===get('CANONICAL_PART_HASH_LIST').sha256,'FROZEN_PART_HASH_LIST_MISMATCH');
 return true;
}

/** Cross-job verification: a re-capture holds the same input iff its content binding equals the frozen one. */
export function verifyContentAgainstFreeze(freeze,{inputDir,referenceParsedPath}){
 const get=role=>freeze.inputReceipts.find(r=>r.role===role);
 const frozen=get('CANONICAL_CONTENT_BINDING').binding,actual=computeContentBinding(inputDir);
 const differing=Object.keys(frozen).filter(k=>JSON.stringify(frozen[k])!==JSON.stringify(actual[k]));
 demand(differing.length===0,'CONTENT_BINDING_MISMATCH_'+differing.map(k=>k.replace(/[^A-Za-z0-9]/g,'').toUpperCase()).join('_AND_'));
 demand(normalizedReference(fs.readFileSync(referenceParsedPath))===get('REFERENCE_PARSED_NORMALIZED').sha256,'FROZEN_REFERENCE_CONTENT_MISMATCH');
 return {contentBindingVerified:true,parts:actual.parts,securities:actual.securities};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),arg=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null;};
 try{
  const cmd=a[0];
  if(cmd==='build'){
   const receipt=JSON.parse(fs.readFileSync(arg('--capture-receipt'),'utf8'));
   const freeze=buildFreezeV3({captureReceipt:receipt,inputDir:arg('--input-dir'),referenceParsedPath:arg('--reference-parsed'),runId:process.env.GITHUB_RUN_ID||null,codeCommit:process.env.GITHUB_SHA||null});
   verifyFreezeV3(freeze);fs.writeFileSync(arg('--out'),JSON.stringify(freeze,null,2)+'\n',{flag:'wx'});
   process.stdout.write(JSON.stringify({status:freeze.status,freezeId:freeze.freezeId,files:Object.keys(freeze.files).length,freezeFileSha256:sha(fs.readFileSync(arg('--out')))})+'\n');
  }else if(cmd==='verify'){
   const freeze=JSON.parse(fs.readFileSync(arg('--freeze'),'utf8'));verifyFreezeV3(freeze);
   if(arg('--input-dir')){if(a.includes('--content'))process.stdout.write(JSON.stringify(verifyContentAgainstFreeze(freeze,{inputDir:arg('--input-dir'),referenceParsedPath:arg('--reference-parsed')}))+'\n');else verifyInputsAgainstFreeze(freeze,{inputDir:arg('--input-dir'),referenceParsedPath:arg('--reference-parsed')});}
   process.stdout.write(JSON.stringify({status:'V3_FREEZE_VERIFIED',freezeId:freeze.freezeId})+'\n');
  }else throw new Error('UNKNOWN_FREEZE_COMMAND');
 }catch(e){process.stderr.write(JSON.stringify({status:'V3_FREEZE_FAILED_CLOSED',code:/^[A-Z0-9_]+$/.test(e.message)?e.message:('FREEZE_FAILURE'+(/^[A-Z0-9_]+$/.test(e.code||'')?'_'+e.code:''))})+'\n');process.exitCode=1;}
}
