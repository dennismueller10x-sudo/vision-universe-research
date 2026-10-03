// Apply only to the internal draft-PR checkout after exact-byte QA. Never main,
// production storage, routing, Actions config or provider cache publication.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {applyCanonicalPublication} from './tiingo2-publication.mjs';
export function validatePreviewTarget({eventName,headRef,headRepo,repository,expectedHead,currentHead}){
 if(eventName!=='pull_request'||headRef!=='codex/tiingo2-productization'||headRepo!==repository||!expectedHead||currentHead!==expectedHead)throw Error('INTERNAL_REVIEW_BRANCH_REQUIRED');return true;
}
export function applyReviewedPreview({root=process.cwd(),event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH)),out=join(root,'.verification/tiingo2-productization'),workDir=join(root,'.market-cache/tiingo2-productization')}={}){
 validatePreviewTarget({eventName:process.env.GITHUB_EVENT_NAME,headRef:event.pull_request?.head.ref,headRepo:event.pull_request?.head.repo.full_name,repository:process.env.GITHUB_REPOSITORY,expectedHead:event.pull_request?.head.sha,currentHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()});
 const run=JSON.parse(readFileSync(join(workDir,'run-result.json'))),proof=JSON.parse(readFileSync(join(workDir,'canonical-stage/qa-proof.json'))),summary=JSON.parse(readFileSync(join(out,'tiingo2_productization_status.json')));
 if(summary.publicationState!=='READY_FOR_REVIEWED_PRODUCTION_PUBLICATION'||proof.scopedQa?.engines?.join(',')!=='chromium,webkit')throw Error('REVIEW_BRANCH_QA_NOT_GREEN');
 const receipt=applyCanonicalPublication({root,staged:{manifestPath:run.stage},qaProof:proof});
 writeFileSync(join(workDir,'preview-paths.nul'),receipt.files.map(r=>r.path).join('\0')+'\0');
 const evidence={state:'CANONICAL_MATERIALIZED_IN_DRAFT_PR',branch:event.pull_request.head.ref,sourceCommit:event.pull_request.head.sha,manifestSha256:receipt.manifestSha256,files:receipt.files.length,added:JSON.parse(readFileSync(run.stage)).additions.map(r=>r.ticker),removed:[],productionWrites:0,productionHistoryWrites:0,rollback:'EXACT_BEFORE_IMAGES_IN_AUTHENTICATED_PUBLICATION_PACKAGE'};
 writeFileSync(join(out,'tiingo2_review_branch_materialization.json'),JSON.stringify(evidence,null,2)+'\n');return evidence;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(applyReviewedPreview()));
