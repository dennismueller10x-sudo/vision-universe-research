// Bind all QA to the exact prepared bytes. No deployment or production apply.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {verifyStagedCanonicalPublication,PRODUCTIZATION_QA_SCHEMA,REQUIRED_PUBLICATION_QA} from './tiingo2-publication.mjs';
import {budgets} from '../vu2/resource-budget.mjs';
const read=p=>JSON.parse(readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
export function validatePreviewQa({summary,readinessBytes,shadowQa,browserQa,legacyBrowser,accessibility,resources,smoke,release}){
 const readinessSha256=sha(readinessBytes),rows=JSON.parse(readinessBytes).rows;
 if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r.ticker||!r.securityId||!r.instrumentId)||['ticker','securityId','instrumentId'].some(k=>new Set(rows.map(r=>r[k])).size!==rows.length))throw Error('SCOPED_CANONICAL_READINESS_REQUIRED');
 const scoped=rows.length;
 if(summary.attachmentBlocker||summary.removed!==0||summary.productionWrites!==0)throw Error('PUBLICATION_PREPARATION_BLOCKED');
 if(shadowQa.sourceReadinessSha256!==readinessSha256||shadowQa.findings?.length||!shadowQa.checks?.length||shadowQa.checks.some(r=>r.status!=='PASS')||shadowQa.productionWrites!==0)throw Error('PROTECTED_SHADOW_QA_NOT_GREEN');
 for(const engine of ['chromium','webkit']){
  const proof=browserQa.find(r=>r.engine===engine);
  if(!proof||proof.sourceReadinessSha256!==readinessSha256||proof.scopedTitles!==scoped||proof.findings?.length||!proof.checks?.length||proof.checks.some(r=>r.status!=='PASS')||proof.productionWrites!==0)throw Error('SCOPED_BROWSER_QA_NOT_GREEN:'+engine);
 }
 if(legacyBrowser.findings?.length||!legacyBrowser.checks?.length||legacyBrowser.checks.some(r=>r.pass!==true))throw Error('BASELINE_BROWSER_QA_NOT_GREEN');
 if(!accessibility.results?.length||accessibility.results.some(r=>r.violations?.length))throw Error('ACCESSIBILITY_QA_NOT_GREEN');
 const expectedMeasurements=new Set(Object.keys(budgets).flatMap(view=>[1440,390].map(width=>view+'|'+width)));
 if(resources.results?.length!==expectedMeasurements.size||new Set(resources.results.map(r=>r.view+'|'+r.width)).size!==expectedMeasurements.size||resources.results.some(r=>!expectedMeasurements.has(r.view+'|'+r.width)||!r.pass||JSON.stringify(r.budget)!==JSON.stringify(budgets[r.view])||!Number.isFinite(r.decodedBytes)||r.decodedBytes<0||!Number.isFinite(r.requests)||!Number.isInteger(r.requests)||r.requests<0||r.decodedBytes>budgets[r.view].decodedBytes||r.requests>budgets[r.view].requests))throw Error('UNCHANGED_RESOURCE_BUDGET_NOT_GREEN');
 if(!smoke.clean||smoke.failures!==0||smoke.checks<148||release.status!=='PASS')throw Error('RELEASE_QA_NOT_GREEN');
 return {readinessSha256,scopedTitles:scoped,engines:['chromium','webkit'],productionWrites:0};
}
export function validatePreparedHistoryPlan({history,additions,publicationManifestSha256}){
 const expected=new Set(additions.map(r=>r.ticker+'|'+r.securityId));
 if(history.publicationManifestSha256!==publicationManifestSha256||history.productionWrites!==0||!Array.isArray(history.rows)||history.rows.length!==additions.length||expected.size!==additions.length)throw Error('PRIVATE_HISTORY_PUBLICATION_BINDING_FAILED');
 const observed=new Set();
 for(const row of history.rows){const key=row.ticker+'|'+row.securityId;if(!expected.has(key)||observed.has(key)||row.path!=='private-histories/tiingo/daily/'+row.securityId+'.json'||row.existingObjectOverwriteAllowed!==false||!Number.isInteger(row.bars)||row.bars<2)throw Error('PRIVATE_HISTORY_IDENTITY_BINDING_FAILED');observed.add(key);}
 return true;
}
export function finalizeProductizationPreview({root=process.cwd(),workDir=join(root,'.market-cache/tiingo2-productization'),out=join(root,'.verification/tiingo2-productization'),releaseOutput,preparedRoot=join(root,'.market-cache/prepared/tiingo2')}={}){
 root=resolve(root);workDir=resolve(workDir);out=resolve(out);preparedRoot=resolve(preparedRoot);
 const run=read(join(workDir,'run-result.json')),summary=read(join(out,'tiingo2_productization_status.json'));
 const readinessPath=join(out,'tiingo2_product_readiness.json'),readinessBytes=readFileSync(readinessPath);
 const qa=validatePreviewQa({summary,readinessBytes,shadowQa:read(join(out,'tiingo2_product_shadow_qa.json')),browserQa:['chromium','webkit'].map(engine=>read(join(out,'browser-products','tiingo2_product_browser_'+engine+'.json'))),legacyBrowser:read(join(out,'browser/results.json')),accessibility:read(join(out,'browser/accessibility.json')),resources:read(join(out,'browser/resource-budgets.json')),smoke:read(join(out,'release-smoke.json')),release:read(join(releaseOutput||run.releaseOutput,'release-delivery.json'))});
 const verified=verifyStagedCanonicalPublication({root,staged:{manifestPath:run.stage}});
 if(verified.manifestSha256!==summary.manifestSha256||!verified.productReadinessSha256)throw Error('PUBLICATION_QA_MANIFEST_BINDING_FAILED');
 const historyPath=join(preparedRoot,'history-publication-plan.json'),history=read(historyPath);
 const manifest=read(run.stage);
 if(!['canonicalMaterialized','currentProduction','proposedConsumer'].every(k=>Number.isSafeInteger(summary[k])&&summary[k]>=0)||summary.canonicalMaterialized!==manifest.additions.length||summary.proposedConsumer-summary.currentProduction!==manifest.additions.length)throw Error('PUBLICATION_SUMMARY_COUNT_BINDING_FAILED');
 validatePreparedHistoryPlan({history,additions:manifest.additions,publicationManifestSha256:verified.manifestSha256});
 const scope=new Map(JSON.parse(readinessBytes).rows.map(r=>[r.ticker,r]));if(manifest.additions.some(r=>scope.get(r.ticker)?.securityId!==r.securityId))throw Error('PUBLICATION_QA_SCOPE_BINDING_FAILED');
 for(const row of history.rows){const path=resolve(preparedRoot,row.path);if(!path.startsWith(preparedRoot+'/private-histories/')||!existsSync(path)||sha(readFileSync(path))!==row.sha256||row.existingObjectOverwriteAllowed!==false)throw Error('PRIVATE_HISTORY_PREPARATION_INVALID');}
 const proof={schemaVersion:PRODUCTIZATION_QA_SCHEMA,manifestSha256:verified.manifestSha256,productReadinessSha256:verified.productReadinessSha256,checks:Object.fromEntries(REQUIRED_PUBLICATION_QA.map(name=>[name,'PASS'])),scopedQa:qa,historyPlanSha256:sha(readFileSync(historyPath)),productionWrites:0};
 writeFileSync(join(workDir,'canonical-stage/qa-proof.json'),JSON.stringify(proof,null,2)+'\n');
 summary.publicationState='READY_FOR_REVIEWED_PRODUCTION_PUBLICATION';summary.qa=proof;
 writeFileSync(join(out,'tiingo2_productization_status.json'),JSON.stringify(summary,null,2)+'\n');
 const final=read(join(out,'tiingo2_final_consumer_universe.json'));final.publicationState=summary.publicationState;final.qaManifestSha256=verified.manifestSha256;writeFileSync(join(out,'tiingo2_final_consumer_universe.json'),JSON.stringify(final,null,2)+'\n');
 writeFileSync(join(out,'tiingo2_publication_qa.json'),JSON.stringify(proof,null,2)+'\n');return {publicationState:summary.publicationState,...verified,productionWrites:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};console.log(JSON.stringify(finalizeProductizationPreview({out:arg('--out'),releaseOutput:arg('--release-output')})));}
