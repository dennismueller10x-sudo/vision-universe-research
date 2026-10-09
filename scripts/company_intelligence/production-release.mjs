/* Existing R2 consumer bridge, with exact approved manifest and fail-closed Pages staging. */
import {readFileSync,writeFileSync,readdirSync,unlinkSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {approval,approve,approvedForPublication} from './production-approval.mjs';
import {publish,preflight,prefixFor,readAsset} from './public-delivery.mjs';
import {download} from './download-public.mjs';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {versionConsumerAssets} from './version-consumer-assets.mjs';
import {downloadGood} from './refresh-storage.mjs';
import {safePublicRefresh,refreshConfig} from './refresh-approval.mjs';
export async function publishProduction(driver,directory){
 approve(directory);
 const result=await publish(driver,{namespace:approval.namespace,directory});
 if(result.generation!==approval.consumerGeneration)throw Error('PRODUCTION_GENERATION_MISMATCH');
 const key=prefixFor(approval.namespace)+'gate.json';
 if(!await driver.get(key))await setProductionGate(driver,'STAGED');
 return result;
}
export async function setProductionGate(driver,state){
 if(!['AVAILABLE','DISABLED','STAGED'].includes(state))throw Error('INVALID_PRODUCTION_GATE');
 if(state==='AVAILABLE'){
  const raw=await driver.get(prefixFor(approval.namespace)+'manifest.json');
  if(!raw||!approvedForPublication(JSON.parse(raw)))throw Error('APPROVED_PRODUCTION_POINTER_REQUIRED');
  for(const asset of Object.keys(JSON.parse(raw).assets))await readAsset(driver,{namespace:approval.namespace,asset});
 }
 const key=prefixFor(approval.namespace)+'gate.json',bytes=Buffer.from(JSON.stringify({schema:1,state,generation:approval.consumerGeneration,approvalId:approval.approvalId,changedAt:new Date().toISOString()}));
 await driver.put(key,bytes);const back=await driver.get(key);
 if(!back||!Buffer.from(back).equals(bytes))throw Error('PRODUCTION_GATE_READBACK_FAILED');
 return {status:state,generation:approval.consumerGeneration,privateStateModified:false};
}
export async function verifyProductionConsumer(driver,release){
 const raw=await driver.get(prefixFor(approval.namespace)+'manifest.json');
 if(!raw||!approvedForPublication(JSON.parse(raw)))throw Error('APPROVED_PRODUCTION_POINTER_REQUIRED');
 const manifest=JSON.parse(raw),target=resolve(release,'company-intelligence/data');
 const result=await download(driver,{namespace:approval.namespace,output:target});
 if(result.generation!==approval.consumerGeneration)throw Error('PRODUCTION_GENERATION_MISMATCH');
 preflight(target,manifest);
 writeFileSync(resolve(release,'company-intelligence-delivery.json'),JSON.stringify({...result,approvalId:approval.approvalId,acceptedGeneration:approval.acceptedGeneration,cohortStocks:approval.tickers,issuers:approval.issuers,sourceUsagePolicy:approval.sourceUsagePolicy,checkedAt:new Date().toISOString()})+'\n');
 return result;
}
export async function stageProduction(driver,release,{enabled=approval.deliveryEnabled}={}){
 release=resolve(release);
 const config=resolve(release,'company-intelligence/config');
 // Preparation catalogues and operating configuration have no consumer route.
 if(existsSync(config))for(const f of readdirSync(config))if(f!=='rollout.js')unlinkSync(resolve(config,f));
 if(enabled){
  const raw=await driver.get(prefixFor(approval.namespace)+'gate.json');
  if(!raw)throw Error('PRODUCTION_GATE_MISSING');
  const gate=JSON.parse(raw);
  if(gate.schema!==1||gate.generation!==approval.consumerGeneration||gate.approvalId!==approval.approvalId||!['AVAILABLE','DISABLED','STAGED'].includes(gate.state))throw Error('INVALID_PRODUCTION_GATE');
  if(gate.state!=='AVAILABLE')enabled=false;
 }
 if(!enabled){
  // Delivery-only kill switch covers both standalone Discover and the shared
  // renderer already concatenated into Quant. It does not modify repository code.
  for(const path of ['company-intelligence/config/rollout.js','quant/release-bundle.js']){
   const file=resolve(release,path);if(!existsSync(file))continue;
   const text=readFileSync(file,'utf8'),needle='const config = {stage:1,';
   if(text.includes(needle))writeFileSync(file,text.replace(needle,'const config = {stage:0,productionOff:true,'));
  }
  versionConsumerAssets(release);
  return {status:'PRODUCTION_GATE_CLOSED',privateObjectsRead:0};
 }
 // A healthy rolling GOOD must not depend on the fixed bootstrap remaining
 // younger than the consumer TTL. Legacy is used only until the first GOOD.
 let result;
 const refreshed=await downloadGood(driver,{output:resolve(release,'company-intelligence/data')});
 if(refreshed){
  const {good,...publicResult}=refreshed;
  for(const path of ['company-intelligence/config/rollout.js','quant/release-bundle.js']){
   const file=resolve(release,path);if(!existsSync(file))continue;
   const text=readFileSync(file,'utf8');
   if(!text.includes(approval.consumerGeneration))throw Error('REFRESH_ROLLOUT_BASELINE_MISMATCH');
   writeFileSync(file,text.replaceAll(approval.consumerGeneration,good.generation));
  }
  const observedBytes=await driver.get(prefixFor(refreshConfig.consumerNamespace)+'observed.json');
  const observed=observedBytes?JSON.parse(observedBytes):{};
  writeFileSync(resolve(release,'company-intelligence-refresh.json'),JSON.stringify(safePublicRefresh(good.manifest,{...good.health,...observed},good.inventory))+'\n');
  result={...publicResult,approvalId:good.manifest.productionApproval,cohortStocks:46,issuers:45,sourceUsagePolicy:approval.sourceUsagePolicy,checkedAt:new Date().toISOString()};
  writeFileSync(resolve(release,'company-intelligence-delivery.json'),JSON.stringify(result)+'\n');
 }else result=await verifyProductionConsumer(driver,release);
 versionConsumerAssets(release);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
 try{
  if(args[0]==='approve')console.log(JSON.stringify({status:'APPROVED',generation:approve(arg('--directory')).generation}));
  else if(args[0]==='publish')console.log(JSON.stringify(await publishProduction(createS3DriverFromEnv(),arg('--directory'))));
  else if(args[0]==='enable')console.log(JSON.stringify(await setProductionGate(createS3DriverFromEnv(),'AVAILABLE')));
  else if(args[0]==='disable')console.log(JSON.stringify(await setProductionGate(createS3DriverFromEnv(),'DISABLED')));
  else if(args[0]==='stage'){const enabled=approval.deliveryEnabled&&!args.includes('--off');console.log(JSON.stringify(await stageProduction(enabled?createS3DriverFromEnv():null,arg('--release'),{enabled})));}
  else throw Error('INVALID_PRODUCTION_MODE');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
