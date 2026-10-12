import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {loadCurrentScannerWithReceipts} from '../research/certification/current-source-receipts.mjs';
const require=createRequire(import.meta.url),Store=require('../../../quant/engines/history-store.js'),Codec=require('../../../quant/engines/bar-codec.js');
function fixture(){
 const calls=[],objects=new Map(),driver={kind:'fixture',async get(key){calls.push(key);return objects.get(key)||null;},async put(){throw Error('NO_WRITES');},async list(){throw Error('NO_LIST');}},s=Store.createHistoryStore({driver:{kind:'fs'},provider:'tiingo',market:'US'});
 const bars=[{date:'2026-10-08',open:100,high:101,low:99,close:100,volume:1000,dividend:0,splitFactor:1,adjustedClose:100},{date:'2026-10-09',open:100,high:101,low:99,close:100,volume:1000,dividend:0,splitFactor:1,adjustedClose:100}];
 for(const ticker of ['SPY','ABC.A'])objects.set(s.seriesKey(ticker),Codec.encode({ticker,bars},{codec:s.codec}).buffer);
 return {calls,objects,stockKey:s.seriesKey('ABC.A'),options:{driver,asOf:'2026-10-12',lookbackBars:1000000,listings:[{ticker:'ABC',providerSymbol:'ABC.A',exchange:'NASDAQ',startDate:'2020-01-01',active:true,securityId:'ref_ABC'}],eligibility:{decisions:[{ticker:'ABC',start_date:'2020-01-01',instrument_type:'EQUITY_COMMON',product_eligibility:'ELIGIBLE'}]},companyNames:{rows:[]},fundamentalIndex:{byTicker:{}}}};
}
test('current provenance comes from exact raw object bytes and explicit requested provider symbol',async()=>{
 const f=fixture(),d=await loadCurrentScannerWithReceipts(f.options);assert.equal(d.state,'AVAILABLE');assert.equal(d.securities.length,1);const source=d.securities[0].priceSource;assert.equal(source.sourceKey,f.stockKey);assert.equal(source.sha256,crypto.createHash('sha256').update(f.objects.get(f.stockKey)).digest('hex'));assert.equal(d.scanner[0].priceSource.sha256,source.sha256);assert.equal(d.sourceReceiptCoverage.writeCalls,0);assert.equal(d.sourceReceiptCoverage.actualGetCalls,f.calls.length);assert.equal(d.sourceReceiptCoverage.benchmarkReceipt,true);assert.equal(source.currencyCertification,'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL');assert.equal(source.publicationTimeCertification,'NOT_ESTABLISHED_BY_OBJECT_RETRIEVAL');assert.equal('currency' in source,false);assert.equal('availableAt' in source,false);
});
test('source missing-contract diagnostics remain non-enumerable and duplicate source rows hard fail',async()=>{
 const f=fixture(),d=await loadCurrentScannerWithReceipts(f.options);assert.equal(Array.isArray(d.privateSourceReceiptDiagnostics.actualReceipts),true);assert.equal(JSON.stringify(d).includes('privateSourceReceiptDiagnostics'),false);assert.equal(d.privateSourceReceiptDiagnostics.missingContracts.includes('HISTORICAL_ISSUER_CLASS_LINK'),true);
 const dup=fixture();dup.options.listings.push({...dup.options.listings[0]});await assert.rejects(loadCurrentScannerWithReceipts(dup.options),/DUPLICATE_CURRENT_TICKER_SOURCE/);
});
