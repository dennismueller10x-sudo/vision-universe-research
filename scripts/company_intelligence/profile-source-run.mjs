/* Existing full-state runner with an optional bounded onboarding batch.
   No model, paid service, partial state promotion or production gate change. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {runRefresh} from './refresh-run.mjs';
import assert from 'node:assert/strict';
import {universeActive} from './refresh-storage.mjs';
import {prepareProfileRecovery,finishProfileRecovery} from './profile-release-recovery.mjs';
// Fehlt die Option, ist der Wert undefined (frueher args[0] = '--temporary': wurde als --run-id an das Onboarding gereicht, argparse Exit 2).
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
const verification=!args.includes('--publish'),driver=createS3DriverFromEnv();
const recover=args.includes('--recover-full-scope');
if(recover&&verification)throw Error('RECOVERY_REQUIRES_EXPLICIT_PRODUCTION_PUBLICATION');
const recovery=recover?await prepareProfileRecovery(driver,resolve(arg('--temporary'))):null;
if(!verification&&!recovery&&!await universeActive(driver))throw Error('CURRENT_FULL_ELIGIBLE_PRODUCTION_REQUIRED');
const sourceBatch=args.includes('--sources');
const beforeBuild=async({state,temporary,identityRoot})=>{
 // Katalog (company-profiles.json) in den wiederhergestellten privaten Zustand saeen: ohne diesen Schritt fehlt geprueften deutschen Fassungen die Quelle (NO_PROFILE_SOURCE).
 execFileSync('python3',['scripts/company_intelligence/profile_catalogue_seed.py','--state',state,'--identity-root',identityRoot,'--out',join(temporary,'profile-catalogue-seed.json')],{stdio:['ignore','ignore','pipe'],timeout:300000});
 execFileSync('python3',['scripts/company_intelligence/profile_source_audit.py','--state',state,'--identity-root',identityRoot,'--out',join(temporary,'profile-before-funnel.json')],{stdio:['ignore','ignore','pipe'],timeout:300000});
 let preparation={sourceRequests:0,universeDiscovery:false};
 if(sourceBatch){
 const out=join(temporary,'source-onboarding.json');
 const sourceRunId=arg('--source-run-id')||`daily-${new Date().toISOString().slice(0,10).replaceAll('-','')}`;
 const sourceLimit=Number(arg('--source-limit')||16);
 try{
  execFileSync('python3',['scripts/company_intelligence/source_onboarding.py','--state',state,'--out',out,
   '--run-id',sourceRunId,'--limit',String(sourceLimit),'--request-budget','200','--max-seconds','600'],
   {stdio:['ignore','ignore','pipe'],timeout:720000,maxBuffer:1024*1024});
 }catch(error){
  const text=String(error.stderr||'');
  // Ende von stderr (nur Python-Traceback, kein Inhalt) neben die Berichte legen: Ursache fuer Exit-/Signal-Faelle ohne Fehlerklasse.
  try{writeFileSync(join(temporary,'source-onboarding-stderr.txt'),`status=${error.status} signal=${error.signal} code=${error.code}\n`+text.slice(-3000));}catch{}
  const code=text.match(/(?:ValueError|RuntimeError): ([A-Z0-9_:-]+)\s*$/)?.[1];
  const line=[...text.matchAll(/File "[^\n]*\/(source_onboarding\.py|current_state_acceptance\.py)", line (\d+)/g)].at(-1);
  // Ohne erkennbare Fehlerklasse (Vorfall 10./11.11.2026, ONBOARDING_PROCESS_FAILURE ohne Ursache): Beendigung des Kindprozesses mitschreiben
  // (Signal bzw. Exit-Status, ggf. Zeitueberschreitung), nur Grossbuchstaben, Ziffern und Unterstriche.
  const ending=error.code==='ETIMEDOUT'?'_TIMEOUT':error.signal?'_'+String(error.signal).replace(/[^A-Z0-9]/g,''):Number.isInteger(error.status)?'_EXIT'+error.status:'';
  throw Error(code||'ONBOARDING_'+(text.match(/([A-Za-z]+Error):[^\n]*\s*$/)?.[1]||'PROCESS_FAILURE').toUpperCase()+(line?'_L'+line[2]:'')+(code?'':ending));
 }
 preparation=JSON.parse(readFileSync(out));
 }
 const metadata=join(temporary,'profile-qa-metadata.json');
 execFileSync('python3',['scripts/company_intelligence/profile_qa_metadata.py','--state',state,'--out',metadata],{stdio:['ignore','ignore','pipe'],timeout:720000});
 return {...preparation,qaMetadata:JSON.parse(readFileSync(metadata))};
};
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
 verification,universe:true,sourceAudit:true,approvedUniverseRecovery:!!recovery,network:true,financial:false,runId:process.env.GITHUB_RUN_ID||'profile-source-verification',beforeBuild,validateContent});
if(recovery&&report.status==='SUCCESS')console.log(JSON.stringify(await finishProfileRecovery(driver,recovery,report)));
console.log(JSON.stringify(report));
if(report.status!=='SUCCESS')process.exitCode=1;
