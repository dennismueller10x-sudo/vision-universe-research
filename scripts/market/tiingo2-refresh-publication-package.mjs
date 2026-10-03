// Refresh final public bytes using an authenticated, previously QA-bound
// package. No providers, builders, publication or production storage writes.
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {attachCanonicalProjections,verifyStagedCanonicalPublication,isProductizationProjectionPath,CANONICAL_PUBLICATION_PATHS,PRODUCTIZATION_QA_SCHEMA,REQUIRED_PUBLICATION_QA} from './tiingo2-publication.mjs';
import {validatePreparedHistoryPlan} from './tiingo2-finalize-preview.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(readFileSync(p));
const encode=d=>Buffer.from(JSON.stringify(d,null,2)+'\n');
const dataPrefixes=['quant/data/','discover/data/','discover/logos/','screener/data/','supertrader/data/','assets/logos/'];
function safe(path){for(let p=resolve(path);;p=dirname(p)){try{const s=lstatSync(p);if(s.isSymbolicLink()||s.isFile()&&s.nlink>1)throw Error('REFRESH_LINK_REJECTED');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}return path;}
function inside(root,path){if(typeof path!=='string'||!path||path.includes('\\')||path.split('/').includes('..')||resolve(path)===path)throw Error('REFRESH_PATH_REJECTED');const p=resolve(root,path),rel=relative(root,p);if(!rel||rel.startsWith('..'+sep))throw Error('REFRESH_PATH_REJECTED');return safe(p);}
function privatePath(root,path){path=resolve(path);if(!relative(root,path).startsWith('.market-cache'+sep))throw Error('REFRESH_PRIVATE_OUTPUT_REQUIRED');return safe(path);}
function scan(path){safe(path);const s=lstatSync(path);if(s.isDirectory())for(const n of readdirSync(path))scan(join(path,n));else if(!s.isFile())throw Error('REFRESH_FILE_TYPE_REJECTED');}
function put(path,bytes){safe(path);if(existsSync(path)){if(!readFileSync(path).equals(bytes))throw Error('REFRESH_IMMUTABLE_CONTENT_CONFLICT');return;}mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,bytes,{flag:'wx',mode:0o600});}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:32*1024*1024});}
function fileSha(path){return existsSync(path)?sha(readFileSync(path)):null;}
function validHash(value){return /^[a-f0-9]{64}$/.test(value||'');}
function assetReferenced(value,path){if(typeof value==='string')return value===path||value.endsWith('/'+path)||value==='files/wide/PASW.png';if(!value||typeof value!=='object')return false;return Object.entries(value).some(([key,v])=>assetReferenced(key,path)||assetReferenced(v,path));}

/** A historical audit may replace its formerly mutable baseline reference
 * with a content-addressed snapshot. It remains source provenance, never a
 * current membership or product projection. Only these exact metadata fields
 * may change, and the snapshot must equal the original Git/raw baseline. */
export function validateSourceOnlyHistoricalProvenance({baselineRoot,shadowRoot,changed}){
 const path='quant/data/market/security-master/reconciliation.json';
 const snapshotPrefix='quant/data/market/security-master/baselines/';
 const possible=changed.filter(p=>p===path||p.startsWith(snapshotPrefix));if(!possible.length)return [];
 const before=read(inside(baselineRoot,path)),after=read(inside(shadowRoot,path)),e=after.nonDestructive,source=CANONICAL_PUBLICATION_PATHS.raw;
 const snapshot=snapshotPrefix+'universe-FULL_UNIVERSE.'+e?.baselineSha256+'.json.gz';
 if(possible.length!==2||!possible.includes(path)||!possible.includes(snapshot)||!validHash(e?.baselineSha256)||e.baselineFile!==snapshot||e.baselineSourceFile!==source||e.baselineSourceCommit!==before.run?.commit||!/^[a-f0-9]{40}$/.test(e.baselineSourceCommit)||before.nonDestructive?.baselineFile!==source)throw Error('REFRESH_HISTORICAL_PROVENANCE_INVALID');
 const expected={...before,nonDestructive:{...before.nonDestructive,baselineFile:snapshot,baselineSourceFile:source,baselineSha256:e.baselineSha256,baselineSourceCommit:e.baselineSourceCommit}};
 if(JSON.stringify(after)!==JSON.stringify(expected))throw Error('REFRESH_HISTORICAL_AUDIT_ROWS_CHANGED');
 const compressed=readFileSync(inside(shadowRoot,snapshot)),bytes=gunzipSync(compressed),originalBytes=execFileSync('git',['-C',baselineRoot,'show',e.baselineSourceCommit+':'+source],{maxBuffer:32*1024*1024});
 const count=JSON.parse(bytes).securities?.length;
 if(sha(bytes)!==e.baselineSha256||!bytes.equals(originalBytes)||fileSha(inside(baselineRoot,source))!==e.baselineSha256||count!==before.nonDestructive.baselineCount||count!==before.nonDestructive.baselinePreserved||before.nonDestructive.baselineRemoved!==0)throw Error('REFRESH_HISTORICAL_SNAPSHOT_NOT_ORIGINAL');
 return possible.map(path=>({path,sha256:fileSha(inside(shadowRoot,path)),category:'SOURCE_ONLY_HISTORICAL_PROVENANCE'}));
}

/** The caller must authenticate/decrypt with tiingo2-cache.open first and bind
 * the expected manifest/source commit to the trusted original Actions run. */
export function validateOriginalPublicationPackage({originalPreparedRoot,expectedManifestSha256}){
 originalPreparedRoot=resolve(originalPreparedRoot);scan(originalPreparedRoot);
 const stage=join(originalPreparedRoot,'canonical-stage'),manifestBytes=readFileSync(join(stage,'manifest.json')),manifest=JSON.parse(manifestBytes),proof=read(join(stage,'qa-proof.json'));
 if(!validHash(expectedManifestSha256)||sha(manifestBytes)!==expectedManifestSha256||manifest.schemaVersion!=='tiingo2-canonical-publication-1.0.0'||manifest.removals?.length||!Array.isArray(manifest.additions)||!manifest.additions.length||!Array.isArray(manifest.files)||!manifest.baselineHashes||manifest.projectionStatus!=='MATERIALIZED_AND_VERIFIED'||proof.schemaVersion!==PRODUCTIZATION_QA_SCHEMA||proof.manifestSha256!==expectedManifestSha256||proof.productReadinessSha256!==manifest.productizationReadinessSha256||proof.productionWrites!==0||REQUIRED_PUBLICATION_QA.some(k=>proof.checks?.[k]!=='PASS'))throw Error('ORIGINAL_PUBLICATION_PROOF_INVALID');
 const receipt=read(join(stage,'applied.json'));
 if(receipt.status!=='APPLIED'||receipt.manifestSha256!==expectedManifestSha256||JSON.stringify(receipt.files)!==JSON.stringify(manifest.files)||JSON.stringify(receipt.baselineHashes)!==JSON.stringify(manifest.baselineHashes))throw Error('ORIGINAL_ROLLBACK_RECEIPT_INVALID');
 const paths=new Set();for(const f of manifest.files){if(paths.has(f.path))throw Error('ORIGINAL_DUPLICATE_PATH');paths.add(f.path);
  const bytes=readFileSync(inside(stage,f.stagedPath));if(sha(bytes)!==f.stagedSha256||bytes.length!==f.bytes||manifest.baselineHashes[f.path]!==f.baselineSha256)throw Error('ORIGINAL_STAGED_BYTES_INVALID');
  if(f.baselineSha256!==null&&(!validHash(f.baselineSha256)||fileSha(inside(stage,'rollback/'+f.path))!==f.baselineSha256))throw Error('ORIGINAL_ROLLBACK_BYTES_INVALID');
 }
 const historyBytes=readFileSync(join(originalPreparedRoot,'history-publication-plan.json')),history=JSON.parse(historyBytes);
 if(proof.historyPlanSha256!==sha(historyBytes))throw Error('ORIGINAL_HISTORY_PROOF_INVALID');
 validatePreparedHistoryPlan({history,additions:manifest.additions,publicationManifestSha256:expectedManifestSha256});
 for(const row of history.rows){const bytes=readFileSync(inside(originalPreparedRoot,row.path)),payload=JSON.parse(bytes);
  if(sha(bytes)!==row.sha256||payload.ticker!==row.ticker||payload.securityId!==row.securityId||payload.provider!=='tiingo'||payload.bars?.length!==row.bars||payload.bars.some(b=>b.securityId!==row.securityId))throw Error('ORIGINAL_PRIVATE_HISTORY_INVALID');
 }
 return {stage,manifest,proof,history,historySha256:sha(historyBytes)};
}

export function prepareRefreshedPublicationPackage({root=process.cwd(),originalPreparedRoot,workDir,preparedRoot,expectedManifestSha256,originalSourceCommit,expectedSourceCommit,runId}={}){
 root=resolve(root);safe(root);originalPreparedRoot=privatePath(root,originalPreparedRoot);workDir=privatePath(root,workDir);preparedRoot=privatePath(root,preparedRoot);
 if(!runId||![originalSourceCommit,expectedSourceCommit].every(h=>/^[a-f0-9]{40}$/.test(h||''))||git(root,['rev-parse','HEAD']).trim()!==expectedSourceCommit)throw Error('REFRESH_SOURCE_BINDING_INVALID');
 if([originalPreparedRoot,preparedRoot].some(p=>p===workDir||p.startsWith(workDir+sep)||workDir.startsWith(p+sep))||originalPreparedRoot===preparedRoot||originalPreparedRoot.startsWith(preparedRoot+sep)||preparedRoot.startsWith(originalPreparedRoot+sep)||existsSync(workDir)||existsSync(preparedRoot))throw Error('REFRESH_NEW_SEPARATE_OUTPUT_REQUIRED');
 const original=validateOriginalPublicationPackage({originalPreparedRoot,expectedManifestSha256}),sourceHead=git(root,['rev-parse','HEAD']).trim();
 // Use tracked final bytes exclusively; uncommitted data must never become a
 // package accidentally. Code/config are separately covered by full final QA.
 if(git(root,['status','--porcelain','--untracked-files=all','--',...dataPrefixes.map(p=>p.slice(0,-1))]).trim())throw Error('REFRESH_FINAL_PUBLIC_TREE_NOT_COMMITTED');
 const baselineRoot=join(workDir,'baseline-root'),shadowRoot=join(workDir,'shadow-root');mkdirSync(workDir,{recursive:true,mode:0o700});
 git(root,['worktree','add','--detach',baselineRoot,originalSourceCommit]);git(root,['worktree','add','--detach',shadowRoot,expectedSourceCommit]);
 for(const tree of [baselineRoot,shadowRoot])for(const prefix of dataPrefixes)if(existsSync(join(tree,prefix)))scan(join(tree,prefix));
 for(const [path,expected]of Object.entries(original.manifest.baselineHashes))if(fileSha(inside(baselineRoot,path))!==expected)throw Error('ORIGINAL_SOURCE_BASELINE_HASH_MISMATCH:'+path);
 const paths=new Set(original.manifest.files.map(f=>f.path));
 const changed=git(root,['diff','--name-only','--no-renames',originalSourceCommit,expectedSourceCommit,'--',...dataPrefixes.map(p=>p.slice(0,-1))]).trim().split('\n').filter(Boolean);
 const sourceOnly=validateSourceOnlyHistoricalProvenance({baselineRoot,shadowRoot,changed}),sourceOnlyPaths=new Set(sourceOnly.map(r=>r.path));
 for(const path of changed){if(sourceOnlyPaths.has(path))continue;if(!isProductizationProjectionPath(path)&&path!==CANONICAL_PUBLICATION_PATHS.raw)throw Error('REFRESH_UNSUPPORTED_PUBLIC_DIFF:'+path);paths.add(path);}
 const omitted=[];for(const path of paths){if(existsSync(inside(shadowRoot,path)))continue;
  // The quarantined PASW wide asset was first introduced by the old stage.
  // Omitting it is safe only when no baseline asset or final alias exists.
  const entry=original.manifest.files.find(f=>f.path===path),index=read(join(shadowRoot,'discover/logos/index.json')),creditsPath=join(shadowRoot,'discover/logos/credits.json'),credits=existsSync(creditsPath)?read(creditsPath):{};
  if(path!=='discover/logos/files/wide/PASW.png'||entry?.baselineSha256!==null||existsSync(inside(baselineRoot,path))||Object.hasOwn(index.wide??{},'PASW')||index.wide?.includes?.('PASW')||assetReferenced(index,path)||assetReferenced(credits,path))throw Error('REFRESH_BASELINE_OR_UNPROVED_REMOVAL:'+path);
  omitted.push(path);paths.delete(path);
 }
 const stage=join(workDir,'canonical-stage');mkdirSync(stage,{recursive:true,mode:0o700});
 const manifest=structuredClone(original.manifest);manifest.runId=runId;manifest.status='STAGED_ONLY';manifest.canonicalFilesWritten=false;manifest.files=manifest.files.filter(f=>!omitted.includes(f.path));
 manifest.publicationRefresh={schemaVersion:'tiingo2-publication-package-refresh-1',originalManifestSha256:expectedManifestSha256,originalHistoryPlanSha256:original.historySha256,originalSourceCommit,finalSourceCommit:sourceHead,omittedNewAssets:omitted,sourceOnlyHistoricalProvenance:sourceOnly,providerCalls:0,historyRebuilds:0,productionWrites:0};
 for(const f of manifest.files){put(inside(stage,f.stagedPath),readFileSync(inside(original.stage,f.stagedPath)));if(f.baselineSha256!==null)put(inside(stage,'rollback/'+f.path),readFileSync(inside(original.stage,'rollback/'+f.path)));}
 put(join(stage,'manifest.json'),encode(manifest));
 const raw=manifest.files.find(f=>f.path===CANONICAL_PUBLICATION_PATHS.raw);if(raw&&fileSha(inside(shadowRoot,raw.path))!==raw.stagedSha256)throw Error('REFRESH_RAW_MEMBERSHIP_CHANGED');
 const attached=attachCanonicalProjections({root:baselineRoot,staged:{manifestPath:join(stage,'manifest.json')},preparedFiles:[...paths].filter(isProductizationProjectionPath).sort().map(path=>({path,bytes:readFileSync(inside(shadowRoot,path))})),productizationReadiness:original.manifest.productizationReadiness});
 const verified=verifyStagedCanonicalPublication({root:baselineRoot,staged:attached});
 for(const entry of attached.files){const before=inside(baselineRoot,entry.path),backup=inside(stage,'rollback/'+entry.path);if(entry.baselineSha256!==null&&!existsSync(backup))put(backup,readFileSync(before));if(entry.baselineSha256!==null&&fileSha(backup)!==entry.baselineSha256)throw Error('REFRESH_ROLLBACK_BYTES_INVALID');}
 for(const row of original.history.rows){const source=inside(originalPreparedRoot,row.path),target=inside(preparedRoot,row.path);mkdirSync(dirname(target),{recursive:true,mode:0o700});copyFileSync(source,target);if(fileSha(target)!==row.sha256)throw Error('REFRESH_HISTORY_BYTES_CHANGED');}
 const history={...original.history,publicationManifestSha256:verified.manifestSha256};put(join(preparedRoot,'history-publication-plan.json'),encode(history));
 if(git(root,['rev-parse','HEAD']).trim()!==sourceHead||git(root,['status','--porcelain','--untracked-files=all','--',...dataPrefixes.map(p=>p.slice(0,-1))]).trim())throw Error('REFRESH_SOURCE_CHANGED_DURING_PREPARATION');
 const result={schemaVersion:'tiingo2-publication-package-refresh-1',state:'STAGED_REQUIRES_FINAL_QA',runId,sourceCommit:sourceHead,originalSourceCommit,originalManifestSha256:expectedManifestSha256,manifestSha256:verified.manifestSha256,files:verified.files,additions:verified.additions,privateHistories:history.rows.length,privateHistoriesRebuilt:0,omittedNewAssets:omitted,baselineRoot,shadowRoot,stage:attached.manifestPath,preparedRoot,providerCalls:0,productionWrites:0,productionPublishAllowed:false,requiredGates:['FINAL_EXACT_BYTE_QA','CURRENT_PRODUCTION_BASELINE_CAS','CURRENT_STORAGE_PREFLIGHT']};
 put(join(workDir,'run-result.json'),encode(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const mapping={'--root':'root','--original-prepared':'originalPreparedRoot','--work-dir':'workDir','--prepared-root':'preparedRoot','--original-manifest-sha':'expectedManifestSha256','--original-source-commit':'originalSourceCommit','--source-commit':'expectedSourceCommit','--run-id':'runId'},args={};for(let i=2;i<process.argv.length;i+=2){const key=mapping[process.argv[i]];if(!key||args[key]||!process.argv[i+1])throw Error('INVALID_REFRESH_ARGUMENT');args[key]=process.argv[i+1];}try{console.log(JSON.stringify(prepareRefreshedPublicationPackage(args)));}catch(e){console.error(e.message);process.exitCode=1;}}
