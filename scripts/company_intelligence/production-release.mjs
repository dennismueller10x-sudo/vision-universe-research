/* Existing R2 consumer bridge, with exact approved manifest and fail-closed Pages staging. */
import {readFileSync,writeFileSync,readdirSync,unlinkSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {approval,approve,approvedForPublication} from './production-approval.mjs';
import {publish,preflight,prefixFor} from './public-delivery.mjs';
import {download} from './download-public.mjs';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
export async function publishProduction(driver,directory){
 approve(directory);
 const result=await publish(driver,{namespace:approval.namespace,directory});
 if(result.generation!==approval.consumerGeneration)throw Error('PRODUCTION_GENERATION_MISMATCH');
 return result;
}
export async function stageProduction(driver,release,{enabled=approval.deliveryEnabled}={}){
 release=resolve(release);
 const config=resolve(release,'company-intelligence/config');
 // Preparation catalogues and operating configuration have no consumer route.
 if(existsSync(config))for(const f of readdirSync(config))if(f!=='rollout.js')unlinkSync(resolve(config,f));
 if(!enabled){
  // Delivery-only kill switch covers both standalone Discover and the shared
  // renderer already concatenated into Quant. It does not modify repository code.
  for(const path of ['company-intelligence/config/rollout.js','quant/release-bundle.js']){
   const file=resolve(release,path);if(!existsSync(file))continue;
   const text=readFileSync(file,'utf8'),needle='const config = {stage:1,';
   if(text.includes(needle))writeFileSync(file,text.replace(needle,'const config = {stage:0,'));
  }
  return {status:'PRODUCTION_GATE_CLOSED',privateObjectsRead:0};
 }
 const raw=await driver.get(prefixFor(approval.namespace)+'manifest.json');
 if(!raw||!approvedForPublication(JSON.parse(raw)))throw Error('APPROVED_PRODUCTION_POINTER_REQUIRED');
 const manifest=JSON.parse(raw),target=resolve(release,'company-intelligence/data');
 const result=await download(driver,{namespace:approval.namespace,output:target});
 if(result.generation!==approval.consumerGeneration)throw Error('PRODUCTION_GENERATION_MISMATCH');
 // download checks read-back hashes; preflight also validates complete identities/sections.
 preflight(target,manifest);
 writeFileSync(resolve(release,'company-intelligence-delivery.json'),JSON.stringify({...result,approvalId:approval.approvalId,acceptedGeneration:approval.acceptedGeneration,cohortStocks:approval.tickers,issuers:approval.issuers,sourceUsagePolicy:approval.sourceUsagePolicy,checkedAt:new Date().toISOString()})+'\n');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
 try{
  if(args[0]==='approve')console.log(JSON.stringify({status:'APPROVED',generation:approve(arg('--directory')).generation}));
  else if(args[0]==='publish')console.log(JSON.stringify(await publishProduction(createS3DriverFromEnv(),arg('--directory'))));
  else if(args[0]==='stage'){const enabled=approval.deliveryEnabled&&!args.includes('--off');console.log(JSON.stringify(await stageProduction(enabled?createS3DriverFromEnv():null,arg('--release'),{enabled})));}
  else throw Error('INVALID_PRODUCTION_MODE');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
