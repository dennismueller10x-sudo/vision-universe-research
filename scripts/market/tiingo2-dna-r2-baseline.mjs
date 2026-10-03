/** Read the existing DNA history from the official R2 store under its measured
 * READ_ONLY budget. The decoded bars remain inside the private shadow. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createS3DriverFromEnv} from './storage/s3-driver.mjs';
const require=createRequire(import.meta.url),Store=require('../../quant/engines/history-store.js'),Guard=require('../../quant/engines/zero-cost-guard.js');
const Codec=require('../../quant/engines/bar-codec.js');
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytesSha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readOnlyDnaR2Driver(source){
 const refuse=()=>{throw Error('DNA_R2_BASELINE_READ_ONLY');};
 return {...source,put:refuse,putIfAbsentOrSame:refuse,putIfMatch:refuse,delete:refuse,list:refuse};
}
export function verifyDnaR2ReadOnlyPreflight(pf,{now=Date.now()}={}){
 const age=now-Date.parse(pf?.generatedAt);
 if(pf?.operation!=='READ_ONLY'||pf?.gate!=='FULL_UNIVERSE'||pf?.measured!==true||pf?.offline!==false||
    pf?.provider!=='tiingo'||pf?.market!=='US'||pf?.verdict?.verdict!==Guard.ALLOWED||
    pf?.executionAllowed!==true||!(age>=0&&age<120*60000)||!pf.budgetForRun||pf.budgetForRun.unmetered)
  throw Error('DNA_R2_READ_ONLY_PREFLIGHT_REQUIRED');
 return true;
}
export function verifyDnaR2EncodedObject({indexSymbol,encoded,series,expectedKey}){
 if(!Buffer.isBuffer(encoded)||encoded.length<1||indexSymbol?.key!==expectedKey||
    !Number.isSafeInteger(indexSymbol?.bytes)||indexSymbol.bytes!==encoded.length||
    !/^[a-f0-9]{64}$/.test(indexSymbol.sha256||'')||indexSymbol.sha256!==bytesSha(encoded))
  throw Error('DNA_R2_ENCODED_OBJECT_INDEX_MISMATCH');
 const decoded=Codec.decode(encoded);
 if(JSON.stringify(decoded)!==JSON.stringify(series))throw Error('DNA_R2_ENCODED_OBJECT_DECODE_MISMATCH');
 return {encodedSha256:bytesSha(encoded),encodedBytes:encoded.length,objectKeySha256:sha(expectedKey)};
}
export function verifyDnaR2Snapshot({first,second,series,encoded,expectedKey}){
 const old=first?.index?.symbols?.DNA,newer=second?.index?.symbols?.DNA,bars=series?.bars;
 if(!old||!/^"[^"\r\n]+"$/.test(first?.etag??'')||JSON.stringify(old)!==JSON.stringify(newer)||
    first?.etag!==second?.etag||series?.ticker!=='DNA'||series?.securityId!=='ref_DNA'||
    series?.provider!=='tiingo'||!Array.isArray(bars)||bars.length<300||
    old.barCount!==bars.length||old.first!==bars[0]?.date||old.last!==bars.at(-1)?.date||
    bars.some((bar,index)=>bar.securityId&&bar.securityId!=='ref_DNA'||index&&bar.date<=bars[index-1].date))
  throw Error('DNA_R2_BASELINE_IDENTITY_OR_INDEX_CHANGED');
 const object=verifyDnaR2EncodedObject({indexSymbol:old,encoded,series,expectedKey});
 return {indexSymbolSha256:sha(old),indexETagSha256:sha(first.etag),...object,bars:bars.length,
  firstDate:bars[0].date,latestDate:bars.at(-1).date};
}
export async function restoreDnaR2Baseline({marketStoreDir,preflightFile,env=process.env}){
 const pf=JSON.parse(readFileSync(preflightFile,'utf8'));verifyDnaR2ReadOnlyPreflight(pf);
 const driver=readOnlyDnaR2Driver(createS3DriverFromEnv(env));
 const budget=Guard.createBudget(pf.budgetForRun),store=Store.createHistoryStore({driver,provider:'tiingo',market:'US',budget});
 const first=await store.readIndexSnapshot(),series=await store.getSeries('DNA');
 const expectedKey=store.seriesKey('DNA');
 if(first.index?.symbols?.DNA?.key!==expectedKey)throw Error('DNA_R2_OBJECT_KEY_NOT_INDEX_BOUND');
 budget.consumeClassB(1,'GET DNA encoded object for index SHA verification');
 const encoded=await driver.get(expectedKey);if(encoded)budget.noteDownload(encoded.length);
 const second=await store.readIndexSnapshot();
 const evidence=verifyDnaR2Snapshot({first,second,series,encoded,expectedKey});
 const path=join(marketStoreDir,'tiingo/baseline/ref_DNA.json');mkdirSync(dirname(path),{recursive:true});
 writeFileSync(path,JSON.stringify({schemaVersion:'tiingo2-dna-r2-baseline-1',series,evidence}));
 return {status:'RESTORED_PRIVATE_READ_ONLY',...evidence,productionWrites:0};
}
