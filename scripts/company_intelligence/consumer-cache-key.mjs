/* Cache identity only; no manifest, checkpoint, credentials or operational state
   is saved. Each stage still reads/validates authoritative R2 GOOD. */
import {appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {approval} from './production-approval.mjs';
import {prefixFor} from './public-delivery.mjs';
import {activeNamespace,goodState} from './refresh-storage.mjs';
let key='';
if(process.env.COMPANY_INTELLIGENCE_OFF!=='true'&&approval.deliveryEnabled){
 const driver=createS3DriverFromEnv();
 const raw=await driver.get(prefixFor(approval.namespace)+'gate.json');
 if(raw&&JSON.parse(raw).state==='AVAILABLE'){
  const good=await goodState(driver,await activeNamespace(driver));
  if(good?.manifest.scope==='PER_ISSUER_ELIGIBILITY'){
   const identity=[good.generation,good.previous?.generation||'',good.manifest.sourceUsagePolicy];
   key='ci-safe-consumer-v1-'+createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }
 }
}
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'key='+key+'\n');
console.log(JSON.stringify({consumerCacheEnabled:!!key}));
