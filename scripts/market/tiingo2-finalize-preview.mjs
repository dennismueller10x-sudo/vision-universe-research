/** Read-only finalizer for the current-main shadow package. It binds measured
 * browser budgets and 21 protected output checks, then reseals private history
 * intent against the final QA-bound canonical manifest. It never applies it. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {bindProtectedProductQA,verifyStagedCanonicalPublication} from './tiingo2-publication.mjs';
import {runCurrentShadowQA} from './tiingo2-current-shadow-qa.mjs';
import {prepareHistoryPublication} from './tiingo2-history-preparation.mjs';
import {budgets} from '../vu2/resource-budget.mjs';

const read=path=>JSON.parse(readFileSync(path,'utf8'));
const write=(path,data)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(data,null,2)+'\n');};
export function measuredBrowserBudgetReport({browserDir,stage,sourceCommit}){
 const browser=read(join(browserDir,'resource-budgets.json')),
  checks=read(join(browserDir,'results.json'));
 if(!Array.isArray(checks.findings)||checks.findings.length||!Array.isArray(browser.results)||browser.results.length!==8)
  throw Error('MEASURED_BROWSER_QA_NOT_GREEN');
 const results=browser.results.map(row=>{
  if(!budgets[row.view]||JSON.stringify(row.budget)!==JSON.stringify(budgets[row.view])||row.pass!==true||row.failures?.length)
   throw Error('MEASURED_BROWSER_BUDGET_NOT_GREEN:'+row.view);
  return {view:row.view,width:row.width,decodedBytes:row.decodedBytes,requests:row.requests,
   budget:row.budget,pass:row.pass,failures:row.failures};
 });
 return {schemaVersion:'tiingo2-resource-budget-qa-1',sourceManifestSha256:stage.manifestSha256,sourceCommit,results};
}
export async function finalizeCurrentProductizationPreview({root=process.cwd(),workDir=join(root,'.market-cache/tiingo2-productization'),
 out=join(root,'.verification/tiingo2-current-productization'),browserDir=join(out,'browser')}={}){
 root=resolve(root);workDir=resolve(workDir);out=resolve(out);browserDir=resolve(browserDir);
 const run=read(join(workDir,'run-result.json'));
 if(run.summary!=='PREPARED_AWAITING_RELEASE_AND_BROWSER_QA'||!run.stage||!run.shadowRoot||!run.marketStoreDir)
  throw Error('CURRENT_PRODUCTIZATION_STAGE_NOT_PREPARED');
 const stage=read(run.stage);
 stage.manifestPath=run.stage;
 stage.manifestSha256=createHash('sha256').update(readFileSync(run.stage)).digest('hex');
 if(stage.manifestSha256!==read(join(out,'tiingo2_productization_status.json')).manifestSha256)
  throw Error('CURRENT_STAGE_STATUS_MANIFEST_MISMATCH');
 if(verifyStagedCanonicalPublication({root,staged:stage}).protectedQAStatus!=='UNBOUND')
  throw Error('PRODUCT_QA_ALREADY_BOUND');
 const shadowReport=await runCurrentShadowQA({root,shadow:run.shadowRoot,stage,workDir,
  out:join(out,'tiingo2_current_shadow_qa.json')});
 if(shadowReport.findings.length)throw Error('CURRENT_SHADOW_QA_NOT_GREEN:'+shadowReport.findings.map(row=>row.name).join(','));
 const browserReport=measuredBrowserBudgetReport({browserDir,stage,sourceCommit:shadowReport.sourceCommit});
 write(join(out,'tiingo2_resource_budget_qa.json'),browserReport);
 const factorPopulationReport=read(join(out,'tiingo2_factor_population_qa.json'));
 if(factorPopulationReport.status!=='PASS'||factorPopulationReport.sourceManifestSha256!==stage.manifestSha256||
  factorPopulationReport.sourceReadinessSha256!==stage.productizationReadinessSha256)
  throw Error('CURRENT_FACTOR_POPULATION_QA_NOT_GREEN');
 const finalStage=bindProtectedProductQA({root,staged:stage,shadowReport,browserReport,factorPopulationReport});
 const verified=verifyStagedCanonicalPublication({root,staged:finalStage});
 if(verified.protectedQAStatus!=='BOUND_AND_VERIFIED')throw Error('CURRENT_PRODUCT_QA_BINDING_FAILED');
 const plan=prepareHistoryPublication({marketStoreDir:run.marketStoreDir,outputRoot:join(root,'.market-cache/prepared/tiingo2'),
  additions:finalStage.additions,publicationManifestSha256:finalStage.manifestSha256,sourceCommit:shadowReport.sourceCommit});
 write(join(out,'tiingo2_history_publication_plan.json'),plan);
 const cas={schemaVersion:'tiingo2-current-cas-manifest-1',runId:finalStage.runId,sourceCommit:shadowReport.sourceCommit,
  manifestSha256:finalStage.manifestSha256,protectedQAStatus:verified.protectedQAStatus,
  baselineFiles:finalStage.files.map(row=>({path:row.path,baselineSha256:row.baselineSha256,stagedSha256:row.stagedSha256})),
  state:'VERIFIED_READ_ONLY',productionWrites:0};
 write(join(out,'current_cas_manifest.json'),cas);
 write(join(out,'current_storage_manifest.json'),{schemaVersion:'tiingo2-current-storage-manifest-1',runId:finalStage.runId,
  manifestSha256:finalStage.manifestSha256,sourceCommit:shadowReport.sourceCommit,
  historyIntent:{rows:plan.rows.map(row=>({ticker:row.ticker,securityId:row.securityId,sha256:row.sha256,bars:row.bars})),
   count:plan.rows.length,operation:plan.operation,precondition:'ABSENT_OR_EXACT_SAME_SOURCE_CONTENT'},
  liveStorageBaselineSha256:null,state:'INTENT_SEALED_LIVE_STORAGE_PREFLIGHT_PENDING',productionWrites:0});
 write(join(out,'current_index_manifest.json'),{schemaVersion:'tiingo2-current-index-manifest-1',runId:finalStage.runId,
  manifestSha256:finalStage.manifestSha256,sourceCommit:shadowReport.sourceCommit,
  liveIndexBaselineSha256:null,indexCASRequired:true,state:'LIVE_INDEX_CAS_PENDING',productionWrites:0});
 const currentProduction=read(join(out,'tiingo2_productization_status.json')).currentProduction;
 write(join(out,'current_rollback_manifest.json'),{schemaVersion:'tiingo2-current-rollback-manifest-1',runId:finalStage.runId,
  manifestSha256:finalStage.manifestSha256,sourceCommit:shadowReport.sourceCommit,
  protectedOriginalConsumer:6397,currentProduction,proposedConsumer:currentProduction+finalStage.additions.length,removals:0,
  canonicalFilePreconditions:cas.baselineFiles,canonicalRestoreMethod:'STAGED_EXACT_BYTES_AFTER_APPLY_RECEIPT',
  historyRetention:'KEEP_ADDITIVE_HISTORIES',state:'PLAN_ONLY_NOT_APPLIED',productionWrites:0});
 const result={schemaVersion:'tiingo2-finalized-current-main-preview-1',runId:finalStage.runId,sourceCommit:shadowReport.sourceCommit,
  manifestSha256:finalStage.manifestSha256,productReadinessSha256:finalStage.productizationReadinessSha256,
  additions:finalStage.additions.length,removals:0,protectedQAStatus:verified.protectedQAStatus,
  historyIntentManifestSha256:plan.publicationManifestSha256,productionWrites:0,
  publicationState:'QA_BOUND_PRIVATE_PREVIEW_NOT_PUBLISHED'};
 write(join(out,'tiingo2_finalized_preview.json'),result);
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
 try{console.log(JSON.stringify(await finalizeCurrentProductizationPreview({root:arg('--root'),workDir:arg('--work-dir'),
  out:arg('--out'),browserDir:arg('--browser-dir')})));}
 catch(error){console.error(error.stack);process.exitCode=1;}
}
