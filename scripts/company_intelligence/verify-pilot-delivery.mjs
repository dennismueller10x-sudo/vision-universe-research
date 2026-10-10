/* Authenticated R2 -> actual read-only API -> consumer contract, via loopback only. */
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
const require=createRequire(import.meta.url), {createHandler}=require('./pilot-handler.cjs'), contract=require('../../company-intelligence/api/contract.js');
const config=require('../../company-intelligence/config/rollout.js');
const namespace=process.env.PILOT_NAMESPACE;
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace||''))throw Error('INVALID_PILOT_NAMESPACE');
const driver=createS3DriverFromEnv();
const handler=createHandler({env:{COMPANY_INTELLIGENCE_ENABLED:'true',COMPANY_INTELLIGENCE_CONSUMER_NAMESPACE:namespace},getDriver:async()=>driver});
const server=createServer((req,res)=>handler(req,res).catch(()=>{res.statusCode=500;res.end('{}')}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const base=`http://127.0.0.1:${server.address().port}/api/company-intelligence?asset=`;
 let available=0,unavailable=0;
 for(const ticker of config.cohort){const value=await contract.load(ticker,{enabled:true,base});if(value.state==='AVAILABLE'){if(value.coverage?.sources||value.coverage?.sec)throw Error('PRIVATE_DATA_EXPOSED');available++;}else if(['NO_COMPANY_DATA','UNKNOWN_TICKER'].includes(value.reason))unavailable++;else throw Error('DELIVERY_CONTRACT_FAILED');}
 if(!available)throw Error('PILOT_HAS_NO_CONSUMER_DATA');
 for(const path of ['../state.sqlite','state/index.json','snapshots/../../ledger.json']){const r=await fetch(base+encodeURIComponent(path));if(r.status!==400)throw Error('PRIVATE_PATH_NOT_REJECTED');}
 const report={status:'PASS',transport:'AUTHENTICATED_R2_TO_LOOPBACK_API_TO_BROWSER_CONTRACT',availableTickers:available,unavailableTickers:unavailable,privatePathsRejected:3};
 writeFileSync(process.env.RUNNER_TEMP+'/pilot-delivery.json',JSON.stringify(report));console.log(JSON.stringify(report));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
