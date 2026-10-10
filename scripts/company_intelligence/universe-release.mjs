/* Main-only controlled activation. No private-ledger writes; verified public
   objects and immutable 46-stock rollback are preserved before the gate moves. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {prefixFor,preflight} from './public-delivery.mjs';
import {goodState,downloadGood,prepareCandidate,commitGood,activationKey,goodKey} from './refresh-storage.mjs';
import {universeConfig,universeApproved} from './universe-approval.mjs';
import {refreshConfig} from './refresh-approval.mjs';
import {universeContracts} from './universe-contract.mjs';
import {universeChanges} from './universe-regression.mjs';
import {consumerCacheDriver,saveConsumerCache} from './consumer-release-cache.mjs';
import {prepareFrozenRollback} from './frozen-rollback.mjs';
import {releaseHealth,updateAcceptedHealth} from './release-health.mjs';
import {sync,prefixFor as privatePrefix} from './sync-state.mjs';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1],read=p=>JSON.parse(readFileSync(p));
const driver=createS3DriverFromEnv(),temporary=resolve(arg('--temporary'));mkdirSync(temporary,{recursive:true});
const out=join(temporary,'evidence','release.json');mkdirSync(join(temporary,'evidence'),{recursive:true});
const save=v=>writeFileSync(out,JSON.stringify(v,null,2)+'\n');
const python=(f,a)=>execFileSync('python3',['scripts/company_intelligence/'+f,...a],{stdio:['ignore','ignore','pipe'],timeout:900000,maxBuffer:1024*1024});
async function pointer(state,extra={}){
 const bytes=Buffer.from(JSON.stringify({schema:1,state,approvalId:universeConfig.approvalId,changedAt:new Date().toISOString(),...extra}));
 await driver.put(activationKey(),bytes);assert(Buffer.from(await driver.get(activationKey())).equals(bytes),'ACTIVATION_READBACK_FAILED');
}
async function restore46(){
 const frozen=await goodState(driver,universeConfig.rollbackNamespace);assert(frozen,'IMMUTABLE_46_ROLLBACK_REQUIRED');
 const directory=join(temporary,'rollback-consumer');await downloadGood(driver,{namespace:universeConfig.rollbackNamespace,output:directory});
  // The downloader copies public assets only; publication needs the separately
  // authenticated certificate, reattached exclusively in this private runner.
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(frozen.manifest)+'\n');
 const previous=await goodState(driver,refreshConfig.consumerNamespace);
 assert(previous&&previous.manifest.tickers.length===46,'SAFE_LEGACY_SCOPE_REQUIRED');
 preflight(directory,frozen.manifest);
 // Fail closed to the already verified legacy GOOD before copying rollback
 // bytes; a storage failure must not leave the full-universe gate enabled.
 await pointer('ROLLBACK_46',{generation:frozen.generation});
 const candidate=await prepareFrozenRollback(driver,{namespace:refreshConfig.consumerNamespace,directory,good:previous,frozen});
 await commitGood(driver,{namespace:refreshConfig.consumerNamespace,payloadNamespace:candidate.payloadNamespace,manifest:candidate.manifest,health:frozen.health,inventory:frozen.inventory,expectedGood:previous});
 await pointer('ROLLBACK_46',{generation:frozen.generation});
 return {generation:frozen.generation,stockCount:46,issuerCount:45};
}
let activationWritten=false;
try{
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_REPOSITORY,'dennismueller10x-sudo/vision-universe-research');
 if(args[0]==='health'){
  const good=await goodState(driver,universeConfig.consumerNamespace);assert(good,'ACCEPTED_FULL_GOOD_REQUIRED');
  const receiptKey=prefixFor(universeConfig.consumerNamespace)+'release-acceptance.json',receipt=JSON.parse(await driver.get(receiptKey));
  assert.equal(receipt.status,'R2_CANDIDATE_ACCEPTED');assert.equal(receipt.generation,good.generation,'HEALTH_RECEIPT_GENERATION_MISMATCH');
  const currentKey=privatePrefix(refreshConfig.stateNamespace)+'index.json',before=await driver.get(currentKey);
  const snapshot=join(temporary,'health-current.tar.gz'),pulled=await sync(driver,{direction:'pull',namespace:refreshConfig.stateNamespace,file:snapshot});
  assert.equal(pulled.status,'RESTORED');assert.equal(pulled.sha256,receipt.privateCheckpointSha256);
  const state=join(temporary,'health-fresh-state');python('checkpoint.py',['restore','--snapshot',snapshot,'--state',state,'--sha256',pulled.sha256]);
  const source=read(join(state,'latest-run.json'));
  const builtAt=receipt.consumerBuiltAt||(await driver.head(receiptKey)).lastModified;
  const health=releaseHealth(source,{privateGeneration:receipt.privateGeneration,checkpointSha256:pulled.sha256,expectedCheckpointSha256:good.manifest.refreshValidation.checkpointSha256,generatedAt:good.manifest.generatedAt,builtAt});
  assert(Buffer.from(await driver.get(currentKey)).equals(before),'CURRENT_CHANGED_DURING_HEALTH_REPAIR');
  const result=await updateAcceptedHealth(driver,{namespace:universeConfig.consumerNamespace,expectedGood:good,health});
  save({status:'HEALTH_RECONCILED',...result,lastSuccessfulPrivateRefresh:health.lastSuccessfulRefresh,lastSuccessfulConsumerBuild:health.lastSuccessfulConsumerBuild,privateStateModified:false,consumerAssetsModified:false});
 }else if(args[0]==='rollback'){
  const rollback=await restore46();save({status:'ROLLED_BACK',...rollback,privateStateModified:false});console.log(JSON.stringify({status:'ROLLED_BACK',generation:rollback.generation}));
 }else{
  assert.equal(args[0],'activate');assert(universeConfig.enabled,'UNIVERSE_CONFIGURATION_DISABLED');
  const audit=read(join(temporary,'evidence/audit.json')),browser=read(join(temporary,'evidence/browser.json')),scaling=read(arg('--scaling'));
  assert(audit.freshRestoreVerified&&audit.allConsumerBytesReproduced&&audit.consumerContracts?.status==='PASS');
  assert.equal(browser.status,'PASS');assert.equal(browser.generation,audit.generation);
  assert(scaling.verification&&scaling.status==='SUCCESS'&&scaling.cohortIssuers>45&&scaling.freshRestoreVerified&&scaling.published&&scaling.candidateQA?.status==='PASS','FULL_UNIVERSE_SCALE_ACCEPTANCE_REQUIRED');
  assert(scaling.privateCompanies>=universeConfig.minimumPrivatePayloads);
  const directory=join(temporary,'first/consumer'),m=read(join(directory,'manifest.json'));
  const known=await goodState(driver,refreshConfig.consumerNamespace);assert(known&&known.manifest.tickers.length===46,'LATEST_GOOD_46_REQUIRED');
  const delivery=await(await fetch('https://research.visionuniverse.de/company-intelligence-delivery.json?freeze='+Date.now())).json();assert.equal(delivery.generation,known.generation);assert.equal(delivery.cohortStocks,46);assert.equal(delivery.issuers,45);
  const release=await(await fetch('https://research.visionuniverse.de/release-delivery.json?freeze='+Date.now())).json();
  const old=join(temporary,'known-good-46');await downloadGood(driver,{namespace:refreshConfig.consumerNamespace,output:old});
  writeFileSync(join(old,'manifest.json'),JSON.stringify(known.manifest)+'\n');
  const existingFrozen=await goodState(driver,universeConfig.rollbackNamespace);
  if(existingFrozen)assert.equal(existingFrozen.generation,known.generation,'ROLLBACK_FREEZE_ALREADY_EXISTS_WITH_DIFFERENT_GENERATION');
  else{
   const frozen=await prepareCandidate(driver,{namespace:universeConfig.rollbackNamespace,directory:old,good:null});
   await commitGood(driver,{namespace:universeConfig.rollbackNamespace,payloadNamespace:frozen.payloadNamespace,manifest:frozen.manifest,health:known.health,inventory:known.inventory,expectedGood:null});
  }
  // Empty fresh directory proves all rollback bytes independent of the live slot.
  const rollback=await downloadGood(driver,{namespace:universeConfig.rollbackNamespace,output:join(temporary,'fresh-rollback')});assert.equal(rollback.generation,known.generation);
  const changes=universeChanges(directory,old);const structural=await universeContracts(directory);
  m.productionApproval=universeConfig.approvalId;m.releaseState='APPROVED_CONTROLLED_PRODUCTION';
  m.refreshValidation={status:'PASS',structural:'PASS',privateCompanies:audit.privatePayloadCount,checkpointSha256:audit.r2CheckpointSha256,codeSha:process.env.GITHUB_SHA};assert(universeApproved(m));
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(m)+'\n');preflight(directory,m);
  const previous=await goodState(driver,universeConfig.consumerNamespace);
  const candidate=await prepareCandidate(driver,{namespace:universeConfig.consumerNamespace,directory,good:previous});
  const source=read(join(temporary,'first-state','latest-run.json'));
  const health=releaseHealth(source,{privateGeneration:audit.authoritativeStateGeneration,checkpointSha256:audit.r2CheckpointSha256,expectedCheckpointSha256:m.refreshValidation.checkpointSha256,generatedAt:m.generatedAt,builtAt:new Date().toISOString()});
  const inventory=Object.fromEntries(Object.entries(m.eligibility).map(([cid,r])=>[cid,{tickers:r.tickers,status:r.status,modules:r.modules}]));
  await commitGood(driver,{namespace:universeConfig.consumerNamespace,payloadNamespace:candidate.payloadNamespace,manifest:candidate.manifest,health,inventory,expectedGood:previous});
  const restored=await downloadGood(driver,{namespace:universeConfig.consumerNamespace,output:join(temporary,'fresh-public')});assert.equal(restored.generation,m.generation);
  // Public downloads intentionally exclude the private validation certificate.
  // Reattach the independently verified GOOD manifest in the private runner only.
  writeFileSync(join(temporary,'fresh-public','manifest.json'),JSON.stringify(restored.good.manifest)+'\n');
  await universeContracts(join(temporary,'fresh-public'));
  // Exercise the exact cached downloader before activation, without caching
  // the private manifest just reattached for contract validation.
  const cacheRoot=join(temporary,'ci-public-cache');
  await saveConsumerCache(join(temporary,'fresh-public'),restored.good,cacheRoot);
  assert(!readFileSync(join(cacheRoot,'index.json')).includes(Buffer.from('refreshValidation')));
  const cached=consumerCacheDriver(driver,restored.good,cacheRoot);
  const warm=await downloadGood(cached.driver,{namespace:universeConfig.consumerNamespace,output:join(temporary,'fresh-public-cached')});
  assert.equal(warm.generation,m.generation);assert(cached.stats.cachedAssets>=Object.keys(m.assets).length);assert(cached.stats.remoteAssets<=1);
  const certificate={schema:1,status:'R2_CANDIDATE_ACCEPTED',generation:m.generation,codeSha:process.env.GITHUB_SHA,privateGeneration:audit.authoritativeStateGeneration,privateCheckpointSha256:audit.r2CheckpointSha256,consumerBuiltAt:health.lastSuccessfulConsumerBuild,
   rollback:{generation:known.generation,codeSha:release.sourceCommit,stocks:46,issuers:45,namespace:universeConfig.rollbackNamespace,freshReadback:true},structural,consumerCache:cached.stats,browserCases:browser.cases.length,scalingRunId:scaling.runId,changes,privateStateModified:false};
  await driver.put(prefixFor(universeConfig.consumerNamespace)+'release-acceptance.json',Buffer.from(JSON.stringify(certificate)));
  const receipt=JSON.parse(await driver.get(prefixFor(universeConfig.consumerNamespace)+'release-acceptance.json'));assert.equal(receipt.generation,m.generation);
  activationWritten=true;await pointer('AVAILABLE',{generation:m.generation,rollbackGeneration:known.generation});
  save({...certificate,status:'ACTIVATED_AWAITING_PRODUCTION_QA'});console.log(JSON.stringify({status:'ACTIVATED_AWAITING_PRODUCTION_QA',generation:m.generation,issuers:Object.keys(m.eligibility).length,stocks:m.tickers.length}));
 }
}catch(error){
 if(activationWritten)await restore46();
 save({status:'FAIL',activationWritten,privateStateModified:false,code:error.code||'RELEASE_ACCEPTANCE_FAILED',message:String(error.message).slice(0,300)});
 console.error('UNIVERSE_RELEASE_ACCEPTANCE_FAILED');process.exitCode=1;
}
