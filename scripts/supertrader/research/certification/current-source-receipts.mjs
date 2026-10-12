/** Current read-only source capture around the unchanged scanner input loader. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadCurrentScannerInputs} from '../tournament/data.mjs';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const Store=require('../../../../quant/engines/history-store.js'),Guard=require('../../../../quant/engines/zero-cost-guard.js');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function loadCurrentScannerWithReceipts(options={}){
 const read=options.readJson||(p=>JSON.parse(fs.readFileSync(path.join(options.root||root,p),'utf8')));
 const universe=options.universe||(options.listings?{securities:options.listings}:await read('quant/data/market/scale/universe-FULL_UNIVERSE.json'));
 const eligibility=options.eligibility||await read('quant/data/market/security-master/eligibility.json');
 const companyNames=options.companyNames||await Promise.resolve().then(()=>read('quant/data/market/security-master/company-names.json')).catch(()=>null);
 const fundamentalIndex=options.fundamentalIndex||await Promise.resolve().then(()=>read('quant/data/sec/consumer/index.json')).catch(()=>null);
 let driver=options.driver;if(!driver){const {createS3DriverFromEnv}=await import('../../../market/storage/s3-driver.mjs');driver=createS3DriverFromEnv(process.env);}
 const budget=Guard.createBudget({classAOperations:0,classBOperations:30000}),receipts=new Map(),requested=new Map();
 const readOnly={kind:driver.kind,async get(key){budget.consumeClassB(1,'CURRENT_SOURCE_READ_ONLY_GET');const raw=await driver.get(key);if(raw){budget.noteDownload(raw.length);receipts.set(key,{sourceKey:key,sha256:hash(raw),capturedAt:new Date().toISOString()});}return raw;}};
 const store=Store.createHistoryStore({driver:readOnly,provider:'tiingo',market:'US',budget:Guard.createBudget({unmetered:true})});
 const usage=await store.readUsage();if(Guard.evaluate({usage,estimate:Guard.estimateOperations({kind:'VALIDATION_ANALYZE',objectReads:universe.securities.length+2}),operation:'VALIDATION_ANALYZE'}).verdict!==Guard.ALLOWED)throw Error('ZERO_COST_GUARD_BLOCKED');
 const getSeries=async symbol=>{const key=store.seriesKey(symbol),series=await store.getSeries(symbol);if(series&&receipts.has(key))requested.set(symbol,receipts.get(key));return series;};
 const data=await loadCurrentScannerInputs({...options,listings:universe.securities,eligibility,companyNames,fundamentalIndex,getSeries});
 const byTicker=new Map();for(const row of universe.securities){if(byTicker.has(row.ticker))throw Error('DUPLICATE_CURRENT_TICKER_SOURCE');byTicker.set(row.ticker,row);}
 const missing=[];
 const attach=(security,receipt)=>{if(!receipt)return false;security.priceSource={provider:'Tiingo',sourceKey:receipt.sourceKey,sha256:receipt.sha256,capturedAt:receipt.capturedAt,canonicalContractHash:data.coverage?.canonicalContractHash||null,dataFingerprint:data.fingerprint||null,publicationTimeCertification:'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL',currencyCertification:'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL'};return true;};
 for(const security of data.securities||[]){const u=byTicker.get(security.ticker),symbol=u?.providerSymbol||u?.ticker;if(!symbol||!attach(security,requested.get(symbol)))missing.push(security.id);}
 if(data.benchmark)attach(data.benchmark,requested.get('SPY'));
 // The frozen loader normally shares references; preserve provenance if a
 // formation prefix was copied because a source object included future dates.
 const sourceById=new Map((data.securities||[]).map(s=>[s.id,s.priceSource]));for(const s of data.scanner||[])if(sourceById.get(s.id))s.priceSource=sourceById.get(s.id);
 data.sourceReceiptCoverage={state:missing.length?'PARTIAL':'CAPTURED_SOURCE_ONLY_NOT_PIT_CERTIFIED',actualGetCalls:budget.spent.classB,writeCalls:budget.spent.classA,securityReceipts:(data.securities||[]).filter(s=>s.priceSource).length,missingSecurityReceipts:missing.length,benchmarkReceipt:Boolean(data.benchmark?.priceSource)};
 Object.defineProperty(data,'privateSourceReceiptDiagnostics',{enumerable:false,value:{schema:'supertrader-current-source-receipts-1.0.0',actualReceipts:[...receipts.values()],missingListingIds:missing,missingContracts:['EXACT_HISTORICAL_PRICE_PUBLICATION_TIMESTAMP','PIT_UNIVERSE_COMPLETENESS','HISTORICAL_ISSUER_CLASS_LINK'],performanceCalculated:false}});
 return data;
}
