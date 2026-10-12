/* Existing full-state runner with an optional bounded onboarding batch.
   No model, paid service, partial state promotion or production gate change. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {runRefresh} from './refresh-run.mjs';
import {universeActive} from './refresh-storage.mjs';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
const verification=!args.includes('--publish'),driver=createS3DriverFromEnv();
if(!verification&&!await universeActive(driver))throw Error('CURRENT_FULL_ELIGIBLE_PRODUCTION_REQUIRED');
const sourceBatch=args.includes('--sources');
const beforeBuild=sourceBatch?async({state,temporary})=>{
 const out=join(temporary,'source-onboarding.json');
 try{
  execFileSync('python3',['scripts/company_intelligence/source_onboarding.py','--state',state,'--out',out,
   '--run-id','german-profile-source-20261012','--limit','16','--request-budget','200','--max-seconds','600'],
   {stdio:['ignore','ignore','pipe'],timeout:720000,maxBuffer:1024*1024});
 }catch(error){throw Error(String(error.stderr||'').match(/ValueError: ([A-Z0-9_:-]+)/)?.[1]||'BOUNDED_ONBOARDING_FAILED');}
 return JSON.parse(readFileSync(out));
}:undefined;
const report=await runRefresh(driver,{temporary:resolve(arg('--temporary')),identityRoot:arg('--identity-root'),
 verification,universe:true,network:true,financial:false,runId:process.env.GITHUB_RUN_ID||'profile-source-verification',beforeBuild});
console.log(JSON.stringify(report));
if(report.status!=='SUCCESS')process.exitCode=1;
