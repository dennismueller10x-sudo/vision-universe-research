/* Select only verifiable GitHub event ancestry; never waive protected changes. */
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
export const protectedPaths=['quant','discover','supertrader','screener','providers','scripts/market','scripts/quant'];
const sha=value=>/^[a-f0-9]{40}$/.test(value||'');
const git=(args,cwd)=>spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:4*1024*1024});
export function productionBaseline({eventName,eventPath,pinnedSha,cwd=process.cwd()}){
 const event=['pull_request','push'].includes(eventName)&&eventPath?JSON.parse(readFileSync(eventPath,'utf8')):null;
 let baseline=pinnedSha,baselineBasis='PINNED_PREPARATION_PRODUCTION_BASE';
 if(eventName==='pull_request'&&event){
  const eventBase=event.pull_request?.base?.sha,eventHead=event.pull_request?.head?.sha;
  const ancestry=git(['show','-s','--format=%P','HEAD'],cwd),parents=ancestry.stdout.trim().split(/\s+/);
  if(ancestry.status||parents.length!==2||parents[1]!==eventHead||!parents.every(sha)||!sha(eventBase)||git(['merge-base','--is-ancestor',eventBase,parents[0]],cwd).status)throw Error('TRUSTED_PR_CHECKED_OUT_MERGE_ANCESTRY_REQUIRED');
  baseline=parents[0];baselineBasis='TRUSTED_GITHUB_PR_CHECKOUT_FIRST_PARENT';
 }else if(eventName==='push'&&event){
  const head=git(['rev-parse','HEAD'],cwd);
  if(event.ref!=='refs/heads/main'||!sha(event.before)||!sha(event.after)||head.status||head.stdout.trim()!==event.after||git(['merge-base','--is-ancestor',event.before,event.after],cwd).status)throw Error('TRUSTED_MAIN_PUSH_ANCESTRY_REQUIRED');
  baseline=event.before;baselineBasis='TRUSTED_GITHUB_MAIN_PUSH_PREVIOUS_HEAD';
 }
 if(!sha(baseline))throw Error('EXACT_PRODUCTION_BASE_SHA_REQUIRED');
 return {baseline,baselineBasis,eventBaseSha:event?.pull_request?.base?.sha||event?.before||null};
}
export function identicalProtectedInputs(baseline,cwd=process.cwd()){
 if(!sha(baseline))throw Error('EXACT_PRODUCTION_BASE_SHA_REQUIRED');
 const diff=git(['diff','--name-only',baseline,'HEAD','--',...protectedPaths],cwd);
 if(diff.status||diff.stdout.trim())throw Error('PRE_EXISTING_CLASSIFICATION_REQUIRES_IDENTICAL_PROTECTED_INPUTS');
 return [];
}
