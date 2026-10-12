/** Read-only publication target verification. Pages intentionally publishes a
 * newer main head; test its real SHA only when protected product/data inputs
 * are identical to the reviewed baseline. No deployment, refresh or schedules. */
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {mkdir,writeFile,appendFile} from 'node:fs/promises';import {dirname,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {publicTarget} from './europe-public-live-qa.mjs';
const exec=promisify(execFile),isSha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const codeScope=['core','discover','scripts/discover','scripts/marketstack','quant/ui','quant/engines',':(exclude)discover/data',':(exclude)discover/live',':(exclude)core/tests',':(exclude)discover/tests',':(exclude)scripts/discover/tests',':(exclude)scripts/marketstack/tests'];
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
export async function resolvePublishedTarget({root=process.cwd(),baseline,origin,fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),deadlineMs=20*60*1000}){
 if(!isSha(baseline))throw Error('VALID_BASELINE_SHA_REQUIRED');const target=publicTarget(origin),deadline=Date.now()+deadlineMs;let attempts=0;
 while(Date.now()<deadline){attempts++;const response=await fetcher(target+'/release-delivery.json?continuity_baseline='+baseline+'&attempt='+attempts,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(response.ok){const metadata=await response.json();if(metadata.status!=='PASS'||!isSha(metadata.sourceCommit))throw Error('INVALID_PUBLISHED_DELIVERY_METADATA');
   try{return {...await verifyPublishedSource({root,baseline,actual:metadata.sourceCommit}),observedAt:new Date().toISOString(),attempts};}catch(e){if(e.message!=='PUBLISHED_RELEASE_NOT_READY')throw e;}
  }await pause(5000);
 }throw Error('VERIFIED_PUBLISHED_RELEASE_NOT_OBSERVED');
}
export async function run(){const record=await resolvePublishedTarget({baseline:process.env.BASELINE_SOURCE_SHA,origin:process.env.SITE_URL}),path=resolve(process.env.RELEASE_TARGET_OUT||'/tmp/europe-published-target.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(record,null,2)+'\n');if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,'EXPECTED_SOURCE_SHA='+record.actualSourceCommit+'\n');console.log(JSON.stringify(record));return record;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await run();}catch(e){console.error(String(e.stack||e));process.exitCode=1;}}
