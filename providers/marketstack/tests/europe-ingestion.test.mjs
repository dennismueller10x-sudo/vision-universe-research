import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign,constants} from 'node:crypto';
import {validatePlan,privateRoot,hash,signedPayload,verifyIngestionMarker,ingestEurope,ALLOCATIONS} from '../../../scripts/marketstack/europe-ingestion.mjs';
const basic=operations=>({version:1,lease:'discovery',maxCredits:1000,operations});
test('all frozen allocations respect the overall cap and target',()=>{assert.equal(ALLOCATIONS.discovery+ALLOCATIONS.foundation,15000);assert.equal(Object.values(ALLOCATIONS).reduce((a,b)=>a+b),25000);assert.throws(()=>validatePlan({...basic([]),maxCredits:1001}),/ALLOCATION/);assert.throws(()=>validatePlan(basic(Array.from({length:51},()=>({kind:'etfs',maxPages:1})))),/EXCEEDS/);});
test('equity ingestion cannot route US listings or US directories',()=>{assert.throws(()=>validatePlan(basic([{kind:'directory',mic:'XNAS'}])),/MIC/);assert.throws(()=>validatePlan(basic([{kind:'latest',listing:{providerTicker:'AAPL',mic:'XNAS'}}])),/PROTECTED/);assert.throws(()=>validatePlan(basic([{kind:'metadata',symbol:'AAPL'}])),/SCOPE/);assert.throws(()=>validatePlan(basic([{kind:'holdings',symbol:'VOO'}])),/SCOPE/);assert.equal(validatePlan(basic([{kind:'holdings',symbol:'VOO',comparisonOnly:true}])).estimatedMaximumCredits,20);});
test('output rejects repository and dangling symlink paths',()=>{assert.throws(()=>privateRoot(process.cwd()),/OUTSIDE/);const p=mkdtempSync(join(tmpdir(),'eu-boundary-'));try{symlinkSync(join(p,'absent'),join(p,'link'));assert.throws(()=>privateRoot(join(p,'link','out')),/SYMLINK/);}finally{rmSync(p,{recursive:true,force:true});}});
test('signed exact-parent marker binds reviewed plan and only marker change',()=>{const keys=generateKeyPairSync('rsa',{modulusLength:2048}),plan=basic([]),before='a'.repeat(40),marker={version:1,lease:'discovery',sourceSha:before,planHash:hash(JSON.stringify(plan))};marker.signature=sign('sha256',Buffer.from(signedPayload(marker)),{key:keys.privateKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64');const context={before,parents:[before],changedPaths:['scripts/marketstack/europe-live-trigger.json'],plan,publicKey:keys.publicKey.export({type:'spki',format:'pem'})};assert.equal(verifyIngestionMarker(marker,context),true);assert.throws(()=>verifyIngestionMarker(marker,{...context,plan:basic([{kind:'directory',mic:'XETR'}])}),/SOURCE/);assert.throws(()=>verifyIngestionMarker(marker,{...context,changedPaths:[...context.changedPaths,'providers/marketstack/client.js']}),/SOURCE/);});
test('private directory ingestion preserves unknown fields, raw hashes and credit journal',async()=>{const root=mkdtempSync(join(tmpdir(),'eu-ingest-')),out=join(root,'out');const body={pagination:{limit:1000,offset:0,count:1,total:1},data:{mic:'XETR',tickers:[{symbol:'SAP.DE',name:'SAP',isin:'DE0007164600',futureField:{keep:true},stock_exchange:{mic:'XETR'}}]}};try{const summary=await ingestEurope({plan:basic([{kind:'directory',mic:'XETR'}]),out,apiKey:'TESTKEY-marketstack',fetchImpl:async()=>({status:200,text:async()=>JSON.stringify(body),headers:{get:()=>null}})});assert.equal(summary.budget.requests,1);assert.equal(summary.productionWrites,0);const raw=readFileSync(join(out,'raw','000001.json'),'utf8');assert.deepEqual(JSON.parse(raw),body);assert.equal(JSON.parse(readFileSync(join(out,'raw-manifest.json')))[0].sha256,hash(raw));assert.equal(readdirSync(join(out,'normalized')).length,1);assert.equal(readFileSync(join(out,'credits.json.attempts.jsonl'),'utf8').trim().split('\n').length,1);assert.throws(()=>privateRoot(process.cwd()),/OUTSIDE/);}finally{rmSync(root,{recursive:true,force:true});}});
test('gateway retry is bounded once and both attempts are charged',async()=>{const root=mkdtempSync(join(tmpdir(),'eu-holdings-'));let calls=0;const waits=[];try{const summary=await ingestEurope({plan:basic([{kind:'holdings',symbol:'SXR8.DE',market:'EUROPE',retry504Once:true}]),out:join(root,'out'),apiKey:'TESTKEY-marketstack',sleep:async ms=>waits.push(ms),fetchImpl:async()=>{calls++;return {status:504,text:async()=>'{"error":{"type":"internal_error"}}',headers:{get:()=>null}}}});assert.equal(calls,2);assert.deepEqual(waits,[15000]);assert.equal(summary.budget.estimatedCredits,40);assert.equal(summary.results[0].status,504);assert.equal(Object.hasOwn(summary.results[0],'result'),false);}finally{rmSync(root,{recursive:true,force:true});}});
test('latest batches preserve symbol-credit semantics and refuse US exchange scope',()=>{assert.equal(validatePlan(basic([{kind:'latestBatch',mic:'XETR',symbols:['SAP.DE','ALV.DE']}])).estimatedMaximumCredits,2);assert.throws(()=>validatePlan(basic([{kind:'latestBatch',mic:'XNAS',symbols:['AAPL']}])));assert.throws(()=>validatePlan(basic([{kind:'latestBatch',mic:'XETR',symbols:['SAP.DE,ALV.DE']}])));});
test('unresolved exact metadata prevents both latest and expensive history calls',async()=>{const root=mkdtempSync(join(tmpdir(),'eu-meta-'));let calls=0;try{const plan=basic([{kind:'metadata',symbol:'SAP.DE',mic:'XETR',assetKind:'EQUITY',expectedIsin:'DE0007164600'},{kind:'latestBatch',mic:'XETR',symbols:['SAP.DE'],requiresMetadata:true},{kind:'history',listing:{providerTicker:'SAP.DE',mic:'XETR'},requiresMetadata:true}]);const summary=await ingestEurope({plan,out:join(root,'out'),apiKey:'TESTKEY-marketstack',fetchImpl:async()=>{calls++;return {status:200,text:async()=>JSON.stringify({data:{symbol:'SAP.DE',isin:'US0378331005',stock_exchange:{mic:'XNAS'}}}),headers:{get:()=>null}}}});assert.equal(calls,1);assert.equal(summary.budget.estimatedCredits,1);assert.equal(summary.results[1].reason,'METADATA_IDENTITY_UNRESOLVED');assert.equal(summary.results[2].reason,'METADATA_IDENTITY_UNRESOLVED');}finally{rmSync(root,{recursive:true,force:true});}});

test('exact active equity metadata admits only matching latest/history and keeps private source fields',async()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-meta-success-')),out=join(root,'out'),paths=[];
 const metadata={data:{symbol:'SAP.DE',name:'SAP SE',isin:'DE0007164600',asset_type:'COMMON_STOCK',active:true,price_currency:'EUR',stock_exchange:{mic:'XETR'},futureMetadata:{retained:true}}};
 const row={symbol:'SAP.DE',exchange:'XETR',date:'2026-10-07T00:00:00+0000',open:100,high:101,low:99,close:100,volume:1000,price_currency:'EUR',futurePrice:{retained:true}};
 const page={pagination:{offset:0,limit:1000,count:1,total:1},data:[row]};
 try{
  const plan=basic([{kind:'metadata',symbol:'SAP.DE',mic:'XETR',assetKind:'EQUITY',expectedIsin:'DE0007164600'},
   {kind:'latestBatch',mic:'XETR',symbols:['SAP.DE'],requiresMetadata:true},
   {kind:'history',listing:{providerTicker:'SAP.DE',mic:'XETR'},requiresMetadata:true}]);
  const summary=await ingestEurope({plan,out,apiKey:'TESTKEY-marketstack',fetchImpl:async raw=>{
   const url=new URL(raw);paths.push({path:url.pathname,exchange:url.searchParams.get('exchange'),symbols:url.searchParams.get('symbols')});
   return {status:200,text:async()=>JSON.stringify(url.pathname.includes('/tickers/')?metadata:page),headers:{get:()=>null}};
  }});
  assert.equal(summary.budget.requests,3);assert.equal(summary.budget.estimatedCredits,3);
  assert.deepEqual(paths.map(x=>x.path),['/v2/tickers/SAP.DE','/v2/eod/latest','/v2/eod']);
  assert.ok(paths.slice(1).every(x=>x.exchange==='XETR'&&x.symbols==='SAP.DE'));
  const load=i=>JSON.parse(readFileSync(join(out,summary.results[i].resultPath))).result;
  assert.equal(load(0).ingestionIdentityMatched,true);
  assert.equal(load(1).ok,true);assert.equal(load(1).paginationComplete,true);assert.equal(load(1).listingCoverageComplete,true);
  assert.equal(load(1).data[0].raw.futurePrice.retained,true);assert.equal(load(1).canonicalAdmission,false);
  assert.equal(load(2).data[0].raw.futurePrice.retained,true);
  assert.ok(summary.results.every(x=>!Object.hasOwn(x,'result')));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('latest batches quarantine duplicate, missing and foreign observations separately from complete pagination',async()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-latest-ambiguity-')),out=join(root,'out');
 const row=(symbol,date='2026-10-07')=>({symbol,exchange:'XETR',date,open:100,high:101,low:99,close:100,volume:1000});
 const rows=[row('SAP.DE'),row('SAP.DE','2026-10-06'),row('ALV.DE'),row('FOREIGN')];
 try{
  const summary=await ingestEurope({plan:basic([{kind:'latestBatch',mic:'XETR',symbols:['SAP.DE','ALV.DE','BMW.DE']}]),out,apiKey:'TESTKEY-marketstack',
   fetchImpl:async()=>({status:200,text:async()=>JSON.stringify({pagination:{offset:0,limit:1000,count:4,total:4},data:rows}),headers:{get:()=>null}})});
  const result=JSON.parse(readFileSync(join(out,summary.results[0].resultPath))).result;
  assert.equal(result.ok,false);assert.equal(result.complete,false);assert.equal(result.paginationComplete,true);assert.equal(result.listingCoverageComplete,false);
  assert.deepEqual(result.missingSymbols,['BMW.DE']);assert.deepEqual(result.ambiguousSymbols,['SAP.DE']);
  assert.deepEqual(result.data.map(x=>x.normalized.providerTicker),['ALV.DE']);assert.equal(result.rejectedObservations.length,3);
  assert.equal(result.raw[0].data.length,4);assert.equal(summary.budget.estimatedCredits,3);
  assert.equal(result.reason,'LATEST_LISTING_COVERAGE_INCOMPLETE');assert.equal(result.canonicalAdmission,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('explicit fund/debt/warrant or inactive metadata cannot authorize expensive equity history',async()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-fund-metadata-'));
 const variants=[{asset_type:'ETF'},{asset_type:'FUND'},{asset_type:'DEBT'},{asset_type:'WARRANT'},{active:false},{is_active:false},{name:'Sample UCITS ETF'}];
 try{for(let i=0;i<variants.length;i++){
  const out=join(root,String(i));let calls=0;
  const metadata={data:{symbol:'SAP.DE',name:'SAP',isin:'DE0007164600',asset_type:'COMMON_STOCK',stock_exchange:{mic:'XETR'},...variants[i]}};
  const summary=await ingestEurope({plan:basic([{kind:'metadata',symbol:'SAP.DE',mic:'XETR',assetKind:'EQUITY',expectedIsin:'DE0007164600'},
   {kind:'history',listing:{providerTicker:'SAP.DE',mic:'XETR'},requiresMetadata:true}]),out,apiKey:'TESTKEY-marketstack',
   fetchImpl:async()=>{calls++;return {status:200,text:async()=>JSON.stringify(metadata),headers:{get:()=>null}};}});
  assert.equal(calls,1,JSON.stringify(variants[i]));assert.equal(summary.budget.estimatedCredits,1);
  assert.equal(summary.results[1].reason,'METADATA_IDENTITY_UNRESOLVED');
  const result=JSON.parse(readFileSync(join(out,summary.results[0].resultPath))).result;
  assert.equal(result.ingestionIdentityMatched,false);
 }}finally{rmSync(root,{recursive:true,force:true});}
});
