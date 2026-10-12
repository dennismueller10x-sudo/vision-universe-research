/* Existing full-state runner with an optional bounded onboarding batch.
   No model, paid service, partial state promotion or production gate change. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {runRefresh} from './refresh-run.mjs';
import assert from 'node:assert/strict';
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
 }catch(error){
  const text=String(error.stderr||'');
  const code=text.match(/(?:ValueError|RuntimeError): ([A-Z0-9_:-]+)\s*$/)?.[1];
  const line=[...text.matchAll(/File "[^\n]*\/(source_onboarding\.py|current_state_acceptance\.py)", line (\d+)/g)].at(-1);
  throw Error(code||'ONBOARDING_'+(text.match(/([A-Za-z]+Error):[^\n]*\s*$/)?.[1]||'PROCESS_FAILURE').toUpperCase()+(line?'_L'+line[2]:''));
 }
 return JSON.parse(readFileSync(out));
}:undefined;
const validateContent=async({state,consumer,temporary,identityRoot})=>{
 const audit=join(temporary,'profile-source-funnel.json'),sample=join(temporary,'profile-sample.json');
 const decisions=join(temporary,'eligibility-decisions.json');
 execFileSync('python3',['scripts/company_intelligence/profile_source_audit.py','--state',state,'--identity-root',identityRoot,'--eligibility',decisions,'--out',audit],{stdio:['ignore','ignore','pipe'],timeout:300000});
 const funnel=JSON.parse(readFileSync(audit)),m=JSON.parse(readFileSync(join(consumer,'manifest.json')));
 const mandatory={};
 for(const cid of ['iss_cik_0001633917','iss_cik_0001652130']){
  const p=JSON.parse(readFileSync(join(consumer,`snapshots/${m.generation}/${cid}.json`)));
  assert.equal(p.companyProfile?.language,'de','MANDATORY_GERMAN_PROFILE_REQUIRED');
  assert.equal(m.eligibility[cid]?.modules.profile,true,'MANDATORY_PROFILE_ELIGIBILITY_REQUIRED');
  const counts=funnel.mandatoryCases[cid];
  mandatory[cid]={ledgerNews:counts.ledgerNewsCount,policyAllowedNews:counts.policyAllowedNews,policyExcludedNews:counts.policyExcludedNews,consumerNews:p.news.length,provenPollableSources:counts.provenPollableSources,profileVersion:p.companyProfile.profileVersion};
 }
 execFileSync('python3',['scripts/company_intelligence/profile_samples.py','--state',state,'--consumer',consumer,'--decisions',decisions,'--out',sample],{stdio:['ignore','ignore','pipe'],timeout:300000});
 const sampling=JSON.parse(readFileSync(sample));
 if(Object.keys(sampling.groupShortfalls).length)throw Error('REQUIRED_PROFILE_SAMPLE_INCOMPLETE');
 execFileSync('node',['scripts/company_intelligence/universe-browser-qa.mjs','--consumer',consumer,'--sample',sample,'--out',join(temporary,'profile-browser-qa.json')],{stdio:['ignore','ignore','pipe'],timeout:1800000,maxBuffer:1024*1024});
 return {status:'PASS',mandatory,sample:sampling.availableGroupCounts};
};
const report=await runRefresh(driver,{temporary:resolve(arg('--temporary')),identityRoot:arg('--identity-root'),
 verification,universe:true,network:true,financial:false,runId:process.env.GITHUB_RUN_ID||'profile-source-verification',beforeBuild,validateContent});
console.log(JSON.stringify(report));
if(report.status!=='SUCCESS')process.exitCode=1;
