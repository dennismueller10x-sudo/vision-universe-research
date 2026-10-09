/* Deterministic Actions runner. No AI, Git commits, universe discovery or secrets
   in outputs. Existing SQLite/checkpoint, HTTP, SEC and R2 paths are reused. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {sync,prefixFor as privatePrefix} from './sync-state.mjs';
import {approval} from './production-approval.mjs';
import {preflight,prefixFor} from './public-delivery.mjs';
import {download} from './download-public.mjs';
import {refreshConfig,frozenInventory,refreshApproved,freshness} from './refresh-approval.mjs';
import {goodState,goodView,downloadGood,prepareCandidate,commitGood,rollbackGood,goodKey} from './refresh-storage.mjs';
const json=p=>JSON.parse(readFileSync(p));const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const {load}=createRequire(import.meta.url)('../../company-intelligence/api/contract.js');
export async function consumerContracts(directory){
 const m=json(join(directory,'manifest.json'));let listings=0;
 for(const ticker of m.tickers){
  const payload=await load(ticker,{enabled:true,expectedGeneration:m.generation,base:'/',fetch:async path=>{
   if(!m.assets[path.slice(1)])return {ok:false,status:404};
   return {ok:true,status:200,json:async()=>json(join(directory,path.slice(1)))};
  }});
  const cid=Object.keys(frozenInventory).find(c=>frozenInventory[c].tickers.includes(ticker));
  if(payload.state!=='AVAILABLE'||payload.companyId!==cid)throw Error('REFRESH_CONSUMER_CONTRACT_FAILED:'+ticker+':'+(payload.reason||'IDENTITY'));
  listings++;
 }
 if(listings!==46)throw Error('REFRESH_CONSUMER_SCOPE_FAILED');return {status:'PASS',listings,issuers:45};
}
function py(script,args){return execFileSync('python3',['scripts/company_intelligence/'+script,...args],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:1200000});}
export function validateChanges(directory,previous){
 const m=json(join(directory,'manifest.json')),old=json(join(previous,'index.json'));
 let profiles=0,news=0,issuers=0,expired=0;
 const cutoff=Date.parse(m.generatedAt)-180*86400000;
 for(const cid of Object.keys(frozenInventory)){
  const p=json(join(directory,`snapshots/${m.generation}/${cid}.json`));
  const prior=json(join(previous,`snapshots/${old.generation}/${cid}.json`));
  if(p.companyId!==cid||!frozenInventory[cid].tickers.every(t=>p.listings.some(l=>l.symbol===t)))throw Error('REFRESH_ISSUER_MAPPING_FAILED');
  if(p.companyProfile?.language!=='de')throw Error('REFRESH_PROFILE_REGRESSION'); profiles++;
  if(prior.latestFinancials?.state==='AVAILABLE'&&(p.latestFinancials?.state!=='AVAILABLE'||(p.latestFinancials.reportingPeriod||'')<(prior.latestFinancials.reportingPeriod||'')))throw Error('REFRESH_FINANCIAL_REGRESSION');
  const ids=new Set(p.news.map(n=>n.newsId));
  if(p.news.length<prior.news.length){
   const lost=prior.news.filter(n=>!ids.has(n.newsId));
   if(lost.some(n=>!Number.isFinite(Date.parse(n.publishedAt||n.publishedDate))||Date.parse(n.publishedAt||n.publishedDate)>=cutoff))throw Error('REFRESH_UNEXPLAINED_NEWS_LOSS');
   expired+=lost.length;
  }
  for(const n of p.news){
   const u=new URL(n.canonicalUrl||n.sourceUrl);
   if(u.protocol!=='https:'||/(^|\.)(globenewswire|businesswire|prnewswire|wallstreet-online|newsfilecorp|accessnewswire)\.(com|de)$/.test(u.hostname))throw Error('REFRESH_SOURCE_POLICY_FAILED');
   if(['body','articleBody','fullText','html','excerpt','summary'].some(k=>k in n))throw Error('REFRESH_ARTICLE_BODY_FORBIDDEN');
  }
  news+=p.news.length;issuers+=p.news.length>0;
 }
 return {status:'PASS',profiles,news,newsIssuers:issuers,expiredNews:expired};
}
export async function runRefresh(driver,{temporary,identityRoot,verification=false,network=true,financial=false,runId='local'}={}){
 const start=Date.now(),root=resolve(temporary);mkdirSync(root,{recursive:true});
 const namespace=verification?'verify-continuous-top46':refreshConfig.stateNamespace;
 const consumerNamespace=verification?'verify-continuous-discover-top46':refreshConfig.consumerNamespace;
 const report={schema:1,runId,startedAt:new Date(start).toISOString(),status:'PIPELINE_FAILURE',published:false,retainedLastGood:true,verification,
  sourcePolicy:refreshConfig.sourceUsagePolicy,cohortStocks:46,cohortIssuers:45,privateOperationalRowsIncluded:false};
 const state=join(root,'state'),consumer=join(root,'consumer'),old=join(root,'previous-consumer'),evidence=join(root,'engine-evidence.json');
 let stage='RESTORE';
 try{
  if(!refreshConfig.enabled)throw Error('REFRESH_DISABLED_BY_APPROVED_CONFIG');
  if(!verification&&(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!=='dennismueller10x-sudo/vision-universe-research'))throw Error('PRODUCTION_MAIN_ONLY');
  const pointerKey=privatePrefix(namespace)+'index.json',initial=await driver.get(pointerKey); const good=await goodState(driver,consumerNamespace);
  const snapshot=join(root,'restore.tar.gz');
  if(initial){await sync(driver,{direction:'pull',namespace,file:snapshot});}
  else{
   const result=await sync(driver,{direction:'pull',namespace:refreshConfig.bootstrapNamespace,file:snapshot});
   if(result.sha256!==refreshConfig.bootstrapSha256)throw Error('FULL_ACCEPTED_BOOTSTRAP_HASH_MISMATCH');
  }
  py('checkpoint.py',['restore','--state',state,'--snapshot',snapshot]);
  const prior=json(join(state,'latest-run.json'));report.restoredGeneration=prior.sourceGeneration||prior.export?.generation||refreshConfig.baselineGeneration;
  if(good)await downloadGood(driver,{namespace:consumerNamespace,output:old});
  else await download(driver,{namespace:approval.namespace,output:old});
  stage='POLL_BUILD';
  const args=['--state',state,'--identity-root',identityRoot,'--consumer',consumer,'--evidence',evidence];
  if(!network)args.push('--offline');if(financial)args.push('--financial');py('continuous_refresh.py',args);
  const engine=json(evidence); const {privateIntegrity,inventory,run,...aggregate}=engine; Object.assign(report,aggregate);
  if(engine.status!=='SUCCESS')throw Error('NO_HEALTHY_REFRESH_LANE');
  report.consumerContracts=await consumerContracts(consumer);
  const checks=validateChanges(consumer,old);report.consumerChecks=checks;
  stage='PRIVATE_CHECKPOINT';
  const packed=join(root,'candidate.tar.gz');py('checkpoint.py',['pack','--state',state,'--snapshot',packed]);
  if(!Buffer.from(await driver.get(pointerKey)||'').equals(Buffer.from(initial||'')))throw Error('CONCURRENT_PRIVATE_GENERATION_ADVANCE');
  const preserved=await sync(driver,{direction:'push',namespace,file:packed,initialize:!initial});report.privatePreservation=preserved;
  stage='FRESH_R2_READBACK';
  const freshPacked=join(root,'fresh.tar.gz');await sync(driver,{direction:'pull',namespace,file:freshPacked});
  if(hash(readFileSync(freshPacked))!==hash(readFileSync(packed)))throw Error('FRESH_PRIVATE_HASH_MISMATCH');
  const fresh=join(root,'fresh-state'),freshConsumer=join(root,'fresh-consumer');py('checkpoint.py',['restore','--state',fresh,'--snapshot',freshPacked]);
  py('continuous_refresh.py',['--reproduce','--state',fresh,'--identity-root',identityRoot,'--consumer',freshConsumer,'--evidence',evidence]);
  const m=json(join(consumer,'manifest.json')),reproduced=json(join(freshConsumer,'manifest.json'));
  if(JSON.stringify(m)!==JSON.stringify(reproduced))throw Error('FRESH_CONSUMER_MANIFEST_MISMATCH');
  for(const path of Object.keys(m.assets))if(!readFileSync(join(consumer,path)).equals(readFileSync(join(freshConsumer,path))))throw Error('FRESH_CONSUMER_BYTES_MISMATCH');
  m.productionApproval=refreshConfig.approvalId;m.releaseState='APPROVED_CONTROLLED_PRODUCTION';
  m.refreshValidation={status:'PASS',profiles:checks.profiles,privateCompanies:engine.privateCompanies,checkpointSha256:hash(readFileSync(packed)),codeSha:process.env.GITHUB_SHA||'local'};
  if(!refreshApproved(m))throw Error('REFRESH_APPROVAL_FAILED');save(join(consumer,'manifest.json'),m);preflight(consumer,m);
  report.freshRestoreVerified=true;report.consumerGeneration=m.generation;report.newPrivateGeneration=engine.sourceGeneration;
  stage='CANDIDATE_QA';
  const qa='scripts/company_intelligence/refresh-qa.mjs';
  execFileSync('node',[qa,'--consumer',consumer,'--out',join(root,'candidate-qa.json')],{encoding:'utf8',timeout:300000,maxBuffer:1024*1024});
  report.candidateQA=json(join(root,'candidate-qa.json'));
  stage='CONSUMER_UPLOAD';
  const result=await prepareCandidate(driver,{namespace:consumerNamespace,directory:consumer,good});
  const health={...engine.health,lastSuccessfulConsumerBuild:new Date().toISOString(),lastSuccessfulConsumerCommit:new Date().toISOString()};
  stage='GOOD_POINTER';
  await commitGood(driver,{namespace:consumerNamespace,payloadNamespace:result.payloadNamespace,manifest:result.manifest,health,inventory,expectedGood:good});
  report.published=true;report.retainedLastGood=false;report.publication={generation:result.generation,status:result.status,uploadedObjects:result.uploadedObjects,uploadedBytes:result.uploadedBytes,unchangedObjects:result.unchangedObjects};report.status='SUCCESS';report.failureStage=null;
 }catch(error){report.status='PIPELINE_FAILURE';report.failureStage=stage;report.failureCode=/^[A-Z0-9_:-]+$/.test(error.message)?error.message:'REFRESH_STAGE_FAILED';}
 const observed=await driver.get(prefixFor(consumerNamespace)+'observed.json').catch(()=>null);
 report.lastSuccessfulProductionPublication=observed?JSON.parse(observed).lastSuccessfulProductionPublication:null;
 report.refreshSLO=freshness(report.health?.lastSuccessfulRefresh);report.publicationSLO=freshness(report.lastSuccessfulProductionPublication);
 report.finishedAt=new Date().toISOString();report.durationSeconds=Math.round((Date.now()-start)/1000);save(join(root,'health.json'),report);
 if(process.env.GITHUB_STEP_SUMMARY)writeFileSync(process.env.GITHUB_STEP_SUMMARY,`Company Intelligence: ${report.status}\n\nStage: ${report.failureStage||'COMPLETE'}\nGeneration: ${report.consumerGeneration||'last-good retained'}\nLast good retained on failure: ${report.retainedLastGood}\nSources: ${report.sourcesChecked||0}; requests: ${(report.publicRequests||0)+(report.secRequests||0)}\n`);
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];const driver=createS3DriverFromEnv();
 try{
  if(args[0]==='rollback')console.log(JSON.stringify(await rollbackGood(driver)));
  else if(args[0]==='health'){
   const good=await goodState(driver),raw=await driver.get(prefixFor(refreshConfig.consumerNamespace)+'observed.json');
   const observed=raw?JSON.parse(raw):{};
   const status={schema:1,checkedAt:new Date().toISOString(),generation:good?.generation||null,
    lastSuccessfulPrivateRefresh:good?.health.lastSuccessfulRefresh||null,
    lastSuccessfulConsumerBuild:good?.health.lastSuccessfulConsumerBuild||null,
    lastSuccessfulProductionPublication:observed.lastSuccessfulProductionPublication||null};
   status.refreshSLO=freshness(status.lastSuccessfulPrivateRefresh);status.buildSLO=freshness(status.lastSuccessfulConsumerBuild);status.publicationSLO=freshness(status.lastSuccessfulProductionPublication);
   status.status=[status.refreshSLO,status.buildSLO,status.publicationSLO].includes('CRITICAL')?'CRITICAL':[status.refreshSLO,status.buildSLO,status.publicationSLO].includes('WARNING')?'WARNING':'HEALTHY';
   if(args.includes('--out'))save(arg('--out'),status);console.log(JSON.stringify(status));
   if(process.env.GITHUB_STEP_SUMMARY)writeFileSync(process.env.GITHUB_STEP_SUMMARY,JSON.stringify(status,null,2)+'\n');
   if(status.status==='CRITICAL')process.exitCode=1;
   if(status.status==='WARNING')console.log('::warning::Company Intelligence successful refresh/publication older than eight hours');
  }
  else if(args[0]==='observe'){
   const origin='https://research.visionuniverse.de',d=await(await fetch(origin+'/company-intelligence-delivery.json?observe='+Date.now())).json();
   const good=await goodState(driver);if(!good||d.generation!==good.generation)throw Error('OBSERVED_PRODUCTION_GENERATION_MISMATCH');
   const observation={schema:1,generation:d.generation,lastSuccessfulProductionPublication:new Date().toISOString()};
   const bytes=Buffer.from(JSON.stringify(observation));
   const key=prefixFor(refreshConfig.consumerNamespace)+'observed.json';await driver.put(key,bytes);
   if(!Buffer.from(await driver.get(key)).equals(bytes))throw Error('OBSERVABILITY_READBACK_FAILED');
   if(args.includes('--health')){
    const p=arg('--health'),health=json(p);Object.assign(health,{lastSuccessfulProductionPublication:observation.lastSuccessfulProductionPublication,publicationSLO:'HEALTHY',productionVerified:true});save(p,health);
   }
   console.log(JSON.stringify({status:'PASS',generation:d.generation}));
  }else{
   const r=await runRefresh(driver,{temporary:arg('--temporary'),identityRoot:arg('--identity-root'),verification:args.includes('--verification'),network:!args.includes('--offline'),financial:args.includes('--financial'),runId:process.env.GITHUB_RUN_ID});
   console.log(JSON.stringify({status:r.status,generation:r.consumerGeneration,published:r.published,failureStage:r.failureStage,failureCode:r.failureCode}));if(r.status!=='SUCCESS')process.exitCode=1;
  }
 }catch{console.error('CONTINUOUS_REFRESH_FAILED');process.exitCode=1;}
}
