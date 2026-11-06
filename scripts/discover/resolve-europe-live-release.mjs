/** Read-only publication target verification. Pages intentionally publishes a
 * newer main head; test its real SHA only when protected product/data inputs
 * are identical to the reviewed baseline. No deployment, refresh or schedules.
 * Anchor: the QA first waits for a verified main release that contains the
 * required commit (awaitPublishedRelease) and then reviews exactly that
 * published commit, so protected-code changes merged between the refresh and
 * the release are part of the reviewed code instead of a false mismatch. */
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {mkdir,writeFile,appendFile} from 'node:fs/promises';import {dirname,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {publicTarget} from './europe-public-live-qa.mjs';
const exec=promisify(execFile),isSha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const codeScope=['core','discover','scripts/discover','scripts/marketstack','quant/ui','quant/engines',':(exclude)discover/data',':(exclude)discover/live',':(exclude)core/tests',':(exclude)discover/tests',':(exclude)scripts/discover/tests',':(exclude)scripts/marketstack/tests',...['europe-public-live-qa.mjs','global-live-qa.mjs','europe-continuity-live-qa.mjs','resolve-europe-live-release.mjs'].map(p=>':(exclude)scripts/discover/'+p)];
const dataScope=['discover/data/europe','discover/data/search/GLOBAL.json','discover/data/search/US_REAL.json','discover/data/global/home.json'];
async function git(root,args){return (await exec('git',args,{cwd:root,maxBuffer:1024*1024})).stdout.trim();}
export async function verifyPublishedSource({root,baseline,actual}){
 if(!isSha(baseline)||!isSha(actual))throw Error('VALID_BASELINE_AND_ACTUAL_SHA_REQUIRED');
 await git(root,['cat-file','-e',baseline+'^{commit}']);
 try{await git(root,['cat-file','-e',actual+'^{commit}']);}catch{await git(root,['fetch','--quiet','--no-tags','origin',actual]);}
 try{await git(root,['merge-base','--is-ancestor',baseline,actual]);}catch{throw Error('PUBLISHED_RELEASE_NOT_READY');}
 for(const [scope,paths]of [['code',codeScope],['canonicalData',dataScope]]){const changed=await git(root,['diff','--name-only',baseline,actual,'--',...paths]);if(changed)throw Error('PUBLISHED_PROTECTED_SCOPE_CHANGED:'+scope+':'+changed);}
 return {baselineSourceCommit:baseline,actualSourceCommit:actual,baselineIncluded:true,protectedProductCodeUnchanged:true,protectedEuropeAndSearchDataUnchanged:true};
}
/** Bind the checked-out reviewed QA ref to its latest production-affecting
 * first-parent commit. Tests and QA runners do not need a site deployment.
 * Runtime and canonical data remain byte-identical to the reviewed checkout. */
export async function productionBaselineFor({root,reviewed}){
 if(!isSha(reviewed))throw Error('VALID_REVIEWED_SHA_REQUIRED');
 await git(root,['cat-file','-e',reviewed+'^{commit}']);
 const candidates=await Promise.all([codeScope,dataScope].map(paths=>git(root,['log','--first-parent','-1','--format=%H',reviewed,'--',...paths])));
 if(candidates.some(s=>!isSha(s)))throw Error('PRODUCTION_BASELINE_NOT_FOUND');
 const history=(await git(root,['rev-list','--first-parent',reviewed])).split('\n');
 const baseline=history.find(sha=>candidates.includes(sha));
 if(!baseline)throw Error('PRODUCTION_BASELINE_NOT_ON_REVIEWED_CHAIN');
 await verifyPublishedSource({root,baseline,actual:reviewed});
 return {reviewedQaSourceCommit:reviewed,productionBaselineSourceCommit:baseline};
}
/** Shared delivery read: the public release-delivery.json, PASS and a real SHA. */
async function readDelivery({target,fetcher,attempt,tag}){
 const response=await fetcher(target+'/release-delivery.json?'+tag+'&attempt='+attempt,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)return null;const metadata=await response.json();
 if(metadata.status!=='PASS'||!isSha(metadata.sourceCommit))throw Error('INVALID_PUBLISHED_DELIVERY_METADATA');return metadata.sourceCommit;
}
async function present(root,sha){try{await git(root,['cat-file','-e',sha+'^{commit}']);}catch{await git(root,['fetch','--quiet','--no-tags','origin',sha]);}}
/** The published commit must contain the required (e.g. refresh data) commit
 * and lie on main's history: a release of another branch never counts. */
export async function verifyPublishedContains({root,required,actual,mainRef,refreshMain=async()=>{}}){
 if(!isSha(required)||!isSha(actual))throw Error('VALID_REQUIRED_AND_ACTUAL_SHA_REQUIRED');
 await git(root,['cat-file','-e',required+'^{commit}']);await present(root,actual);
 try{await git(root,['merge-base','--is-ancestor',required,actual]);}catch{throw Error('PUBLISHED_RELEASE_NOT_READY');}
 if(mainRef){await refreshMain();try{await git(root,['merge-base','--is-ancestor',actual,mainRef]);}catch{throw Error('PUBLISHED_RELEASE_NOT_ON_MAIN');}}
 return {requiredSourceCommit:required,publishedSourceCommit:actual,requiredIncluded:true,publishedOnMain:Boolean(mainRef)};
}
/** Step 1 of the QA: wait until the site serves a verified main release that
 * contains the required commit, and report its SHA. The QA then checks out
 * exactly that commit, so its assertions are the published code's own. */
export async function awaitPublishedRelease({root=process.cwd(),required,mainRef,origin,fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),deadlineMs=40*60*1000,refreshMain=async()=>{}}){
 if(!isSha(required))throw Error('VALID_REQUIRED_SHA_REQUIRED');await git(root,['cat-file','-e',required+'^{commit}']);
 const target=publicTarget(origin),deadline=Date.now()+deadlineMs;let attempts=0;
 while(Date.now()<deadline){attempts++;const actual=await readDelivery({target,fetcher,attempt:attempts,tag:'required='+required});
  if(actual){try{return {...await verifyPublishedContains({root,required,actual,mainRef,refreshMain}),observedAt:new Date().toISOString(),attempts};}catch(e){if(e.message!=='PUBLISHED_RELEASE_NOT_READY')throw e;}}
  await pause(15000);
 }throw Error('REQUIRED_RELEASE_NOT_PUBLISHED');
}
export async function resolvePublishedTarget({root=process.cwd(),baseline,required,mainRef,origin,fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),deadlineMs=20*60*1000,refreshMain=async()=>{}}){
 if(!isSha(baseline))throw Error('VALID_BASELINE_SHA_REQUIRED');if(required!==undefined&&!isSha(required))throw Error('VALID_REQUIRED_SHA_REQUIRED');
 const reviewed=await productionBaselineFor({root,reviewed:baseline});baseline=reviewed.productionBaselineSourceCommit;const target=publicTarget(origin),deadline=Date.now()+deadlineMs;let attempts=0;
 while(Date.now()<deadline){attempts++;const actual=await readDelivery({target,fetcher,attempt:attempts,tag:'continuity_baseline='+baseline});
  if(actual){try{const source=await verifyPublishedSource({root,baseline,actual});let contained={};if(required)contained=await verifyPublishedContains({root,required,actual,mainRef,refreshMain});
    return {...reviewed,...source,...contained,observedAt:new Date().toISOString(),attempts};}catch(e){if(e.message!=='PUBLISHED_RELEASE_NOT_READY')throw e;}
  }await pause(5000);
 }throw Error('VERIFIED_PUBLISHED_RELEASE_NOT_OBSERVED');
}
const fetchMain=(root,mainRef)=>async()=>{await git(root,['fetch','--quiet','--no-tags','origin','+refs/heads/main:'+mainRef]);};
export async function run(){const root=process.cwd(),required=process.env.REQUIRED_SOURCE_SHA||undefined,mainRef=process.env.MAIN_REF||undefined,refreshMain=mainRef?fetchMain(root,mainRef):async()=>{};
 if(process.env.AWAIT_ONLY==='1'){const record=await awaitPublishedRelease({root,required,mainRef,origin:process.env.SITE_URL,refreshMain});if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'published_sha='+record.publishedSourceCommit+'\n');console.log(JSON.stringify(record));return record;}
 const record=await resolvePublishedTarget({root,baseline:process.env.BASELINE_SOURCE_SHA,required,mainRef,origin:process.env.SITE_URL,refreshMain}),path=resolve(process.env.RELEASE_TARGET_OUT||'/tmp/europe-published-target.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(record,null,2)+'\n');if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,'EXPECTED_SOURCE_SHA='+record.actualSourceCommit+'\n');console.log(JSON.stringify(record));return record;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await run();}catch(e){console.error(String(e.stack||e));process.exitCode=1;}}
