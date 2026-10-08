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

test('recent scoped latest bars gate history without fabricating provider identity',async()=>{const root=mkdtempSync(join(tmpdir(),'eu-latest-gate-'));let calls=0;
 const listing=s=>({providerTicker:s,mic:'XETR'}),bar=(symbol,date,close=12)=>({symbol,exchange:'XETR',date:date+'T00:00:00+0000',open:11,high:13,low:10,close,volume:2000});
 const plan=basic([{kind:'latestBatch',mic:'XETR',symbols:['HAG.DE','R3NK.DE','OLD.DE'],eligibleSessions:['2026-10-07']},...['HAG.DE','R3NK.DE','OLD.DE'].map(s=>({kind:'history',listing:listing(s),requiresLatest:true}))]);
 try{const r=await ingestEurope({plan,out:join(root,'out'),apiKey:'TESTKEY-latest',fetchImpl:async()=>{calls++;return {status:200,text:async()=>JSON.stringify({pagination:{total:calls===1?3:1,count:calls===1?3:1,limit:1000,offset:0},data:calls===1?[bar('HAG.DE','2026-10-07'),bar('R3NK.DE','2026-10-07',0),bar('OLD.DE','2026-10-06')]:[bar('HAG.DE','2026-10-07')]}),headers:{get:()=>null}}}});assert.equal(calls,2);assert.equal(r.budget.estimatedCredits,4);assert.equal(r.results[1].ok,true);assert.equal(r.results[2].reason,'LATEST_VALID_SCOPED_OBSERVATION_REQUIRED');assert.equal(r.results[3].skipped,true);assert.equal(r.publication,'BLOCKED_RIGHTS_UNVERIFIED');assert.equal(r.productionWrites,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('latest preconditions require a preceding calendar-bounded batch and tickerinfo preserves scope',()=>{assert.throws(()=>validatePlan(basic([{kind:'history',listing:{providerTicker:'SAP.DE',mic:'XETR'},requiresLatest:true}])),/BOUND_PRIOR_BATCH/);assert.throws(()=>validatePlan(basic([{kind:'tickerInfo',symbol:'AAPL',mic:'XNAS'}])),/SCOPE/);assert.equal(validatePlan(basic([{kind:'tickerInfo',symbol:'SXR8.DE',mic:'XETR'}])).estimatedMaximumCredits,1);});

test('newer missing ambiguous failed unbounded or metadata-blocked batches revoke prior latest eligibility', async () => {
 const root=mkdtempSync(join(tmpdir(),'eu-latest-revocation-'));
 const row=(date='2026-10-07')=>({symbol:'SAP.DE',exchange:'XETR',date,open:100,high:101,low:99,close:100,volume:1000});
 const page=rows=>({pagination:{offset:0,limit:1000,count:rows.length,total:rows.length},data:rows});
 const cases=[
  {name:'missing',rows:[]},
  {name:'ambiguous',rows:[row(),row()]},
  {name:'failed',rows:[],status:503},
  {name:'unbounded stale',rows:[row('2020-01-02')],unbounded:true},
  {name:'metadata unresolved',rows:[],requiresMetadata:true}
 ];
 try{for(let i=0;i<cases.length;i++){
  const scenario=cases[i],out=join(root,String(i)),eligibleSessions=['2026-10-07'];let calls=0;
  const second={kind:'latestBatch',mic:'XETR',symbols:['SAP.DE'],...(scenario.unbounded?{}:{eligibleSessions}),...(scenario.requiresMetadata?{requiresMetadata:true}:{})};
  const result=await ingestEurope({plan:basic([
   {kind:'latestBatch',mic:'XETR',symbols:['SAP.DE'],eligibleSessions},second,
   {kind:'history',listing:{providerTicker:'SAP.DE',mic:'XETR'},requiresLatest:true},
   {kind:'splits',listing:{providerTicker:'SAP.DE',mic:'XETR'},requiresLatest:true},
   {kind:'snapshot',listing:{providerTicker:'SAP.DE',mic:'XETR'},requiresLatest:true}
  ]),out,apiKey:'TESTKEY-latest-revocation',fetchImpl:async()=>{
   calls++;return {status:calls===1?200:scenario.status??200,text:async()=>JSON.stringify(page(calls===1?[row()]:scenario.rows)),headers:{get:()=>null}};
  }});
  assert.equal(calls,scenario.requiresMetadata?1:2,scenario.name);
  assert.equal(result.budget.requests,calls,scenario.name);
  for(const operation of result.results.slice(2)){
   assert.equal(operation.reason,'LATEST_VALID_SCOPED_OBSERVATION_REQUIRED',scenario.name);
   assert.equal(operation.skipped,true,scenario.name);
  }
  assert.equal(result.productionWrites,0);
 }}finally{rmSync(root,{recursive:true,force:true});}
});
