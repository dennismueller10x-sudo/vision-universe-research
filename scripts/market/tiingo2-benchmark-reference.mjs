// Read only the already-owned benchmark reference. It is never a product or
// a universe member, and no price/store/publication write is permitted here.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {createS3DriverFromEnv} from './storage/s3-driver.mjs';
const require=createRequire(import.meta.url),Store=require('../../quant/engines/history-store.js'),Guard=require('../../quant/engines/zero-cost-guard.js');
export async function restoreBenchmarkReference({marketStoreDir,preflightFile,env=process.env}){
 const pf=JSON.parse(readFileSync(preflightFile));
 const age=Date.now()-Date.parse(pf.generatedAt);
 if(pf.operation!=='READ_ONLY'||pf.measured!==true||pf.offline!==false||pf.provider!=='tiingo'||pf.market!=='US'||pf.verdict?.verdict!==Guard.ALLOWED||!(age>=0&&age<120*60000)||pf.budgetForRun?.unmetered)throw Error('BENCHMARK_READ_ONLY_PREFLIGHT_REQUIRED');
 const source=createS3DriverFromEnv(env),refuse=()=>{throw Error('BENCHMARK_REFERENCE_IS_READ_ONLY');};
 const driver={...source,put:refuse,delete:refuse,list:refuse};
 const store=Store.createHistoryStore({driver,provider:'tiingo',market:'US',budget:Guard.createBudget(pf.budgetForRun)});
 const index=await store.readIndex(),series=await store.getSeries('SPY');
 if(!series||series.ticker!=='SPY'||series.securityId!=='ref_SPY'||series.provider!=='tiingo')throw Error('BENCHMARK_REFERENCE_IDENTITY_INVALID');
 const observedAt=index.symbols?.SPY?.updatedAt;if(!observedAt)throw Error('BENCHMARK_REFERENCE_OBSERVATION_MISSING');
 const path=join(marketStoreDir,'tiingo/daily/ref_SPY.json');mkdirSync(dirname(path),{recursive:true});
 writeFileSync(path,JSON.stringify({...series,updatedAt:observedAt,durableUpdatedAt:observedAt,role:'BENCHMARK_REFERENCE',restoredFrom:'EXISTING_R2_READ_ONLY'}));
 return {ticker:'SPY',role:'BENCHMARK_REFERENCE',bars:series.bars.length,latestDate:series.bars.at(-1)?.date,productionWrites:0};
}
