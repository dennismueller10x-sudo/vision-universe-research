// Private, additive publication intent for the existing history-store writer.
// This function never contacts R2 and never exports provider bars publicly.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,lstatSync} from 'node:fs';
import {join,dirname,resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function safePath(file){for(let path=resolve(file);;path=dirname(path)){try{const stat=lstatSync(path);if(stat.isSymbolicLink()||stat.isFile()&&stat.nlink>1)throw Error('HISTORY_INTENT_LINK_REJECTED');}catch(error){if(error.code!=='ENOENT')throw error;}if(dirname(path)===path)break;}}
export function prepareHistoryPublication({marketStoreDir,outputRoot,additions,publicationManifestSha256,sourceCommit}){
 marketStoreDir=resolve(marketStoreDir);outputRoot=resolve(outputRoot);
 if(!outputRoot.includes(sep+'.market-cache'+sep)||!relative(outputRoot,marketStoreDir).startsWith('..')||!relative(marketStoreDir,outputRoot).startsWith('..'))throw Error('HISTORY_INTENT_PRIVATE_SEPARATE_OUTPUT_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(publicationManifestSha256||''))throw Error('HISTORY_INTENT_PUBLICATION_HASH_REQUIRED');
 if(!/^[a-f0-9]{40}$/.test(sourceCommit||''))throw Error('HISTORY_INTENT_SOURCE_COMMIT_REQUIRED');
 safePath(outputRoot);safePath(marketStoreDir);
 if(new Set(additions.map(r=>r.ticker)).size!==additions.length||new Set(additions.map(r=>r.securityId)).size!==additions.length)throw Error('DUPLICATE_HISTORY_INTENT');
 const rows=[];
 for(const row of additions){
  if(!/^[A-Z0-9.-]{1,12}$/.test(row.ticker)||!/^ref_[A-Z0-9.-]+$/.test(row.securityId))throw Error('INVALID_HISTORY_INTENT_IDENTITY');
  const source=join(marketStoreDir,'tiingo/daily',row.securityId+'.json');
  if(!existsSync(source)||lstatSync(source).isSymbolicLink()||lstatSync(source).nlink>1)throw Error('HISTORY_INTENT_SOURCE_UNSAFE');
  const bytes=readFileSync(source),payload=JSON.parse(bytes);
  if(payload.ticker!==row.ticker||payload.securityId!==row.securityId||payload.provider!=='tiingo'||!payload.bars?.length||payload.bars.some(b=>b.securityId!==row.securityId))throw Error('HISTORY_INTENT_SOURCE_IDENTITY_MISMATCH');
  const path='private-histories/tiingo/daily/'+row.securityId+'.json',target=join(outputRoot,path);
  safePath(source);safePath(target);
  mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);
  rows.push({ticker:row.ticker,securityId:row.securityId,path,sha256:sha(bytes),bars:payload.bars.length,firstDate:payload.bars[0].date,latestDate:payload.bars.at(-1).date,precondition:'ABSENT_OR_EXACT_SAME_SOURCE_CONTENT',existingObjectOverwriteAllowed:false});
 }
 const plan={schemaVersion:'tiingo2-private-history-publication-intent-1.0.0',sourceCommit,publicationManifestSha256,owner:'quant/engines/history-store.js',transport:'AUTHENTICATED_ENCRYPTED_PACKAGE_ONLY',writer:'EXISTING_HISTORY_STORE_WITH_CURRENT_ZERO_COST_PREFLIGHT',operation:'APPEND_NEW_SECURITIES_ONLY',rows,protectedExistingSecuritiesUpdated:[],productionWrites:0,requiredGates:['CURRENT_STORAGE_PREFLIGHT','PROVIDER_IDENTITY','CURRENT_INDEX_CAS','CORPORATE_ACTIONS','PUBLISHED_PRODUCT_MANIFEST_HASH'],rollback:'ROLL_BACK_CANONICAL_MEMBERSHIP_AND_PROJECTIONS_KEEP_ADDITIVE_HISTORIES_FOR_RETENTION'};
 const manifest=join(outputRoot,'history-publication-plan.json');safePath(manifest);mkdirSync(dirname(manifest),{recursive:true});writeFileSync(manifest,JSON.stringify(plan,null,2)+'\n');return plan;
}
