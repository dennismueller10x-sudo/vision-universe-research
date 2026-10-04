import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { runRefresh } from '../../scripts/market/tiingo2-refresh.mjs';
import { EVIDENCE_RULE } from '../../scripts/market/tiingo2-evidence.mjs';

function zip(content) {
 const data=Buffer.from(content),compressed=deflateRawSync(data),filename=Buffer.from('supported_tickers.csv');
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+compressed.length,16);
 return Buffer.concat([local,filename,compressed,central,filename,end]);
}
async function fixture({officialName,providerName,secName,providerTicker='IPO'},check){
 const root=mkdtempSync(join(tmpdir(),'vu-refresh-identity-')),today='2026-10-02',start='2026-09-01',ticker='IPO',workDir=join(root,'.market-cache/tiingo2');
 const put=(path,value,json=true)=>{const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,json?JSON.stringify(value):value);return file;};
 try{
  put('quant/data/market/scale/universe-FULL_UNIVERSE.json',{securities:[{ticker:'KEEP',securityId:'ref_KEEP',exchange:'NASDAQ',assetType:'Stock',startDate:'2010-01-01',endDate:today,active:true}]});
  put('quant/data/market/security-master/eligibility.json',{decisions:[{ticker:'KEEP',securityId:'ref_KEEP',exchange:'NASDAQ',product_eligibility:'ELIGIBLE',instrument_type:'EQUITY_COMMON',active_status:'ACTIVE'}]});
  put('quant/data/market/security-master/company-names.json',{rows:[]});put('quant/data/universe/cik-map.json',{byTicker:secName?{IPO:{name:secName,cik:'0001234567'}}:{}});
  if(secName)put('quant/data/sec/consumer/CIK0001234567.json',{policy:'as_of_latest',dataSource:{isMock:false},quarterly:{revenues:[{value:100}]}});
  put('quant/data/universe/instruments/KE.json',{instruments:[{symbol:'KEEP',instrumentId:'vu_keep',masterMemberId:'ref_KEEP',legacyIds:['ref_KEEP'],exchange:'NASDAQ',firstTradeDate:'2010-01-01',lastTradeDate:today,active:true}]});
  put('quant/data/market/factors/factors-FULL_UNIVERSE.json',{skipped:[]});
  put('.market-cache/tiingo2/directories/'+today+'-nasdaqlisted.txt','Symbol|Security Name|ETF|Test Issue\nIPO|'+officialName+'|N|N\n',false);
  put('.market-cache/tiingo2/directories/'+today+'-otherlisted.txt','ACT Symbol|Security Name|Exchange|ETF|Test Issue\n',false);
  const fromZip=put('input.zip',zip('ticker,exchange,assetType,priceCurrency,startDate,endDate\nIPO,NASDAQ,Stock,USD,'+start+','+today+'\n'),false);
  const key=createHash('sha256').update(JSON.stringify({ticker,today,start,rule:EVIDENCE_RULE})).digest('hex');
  put('.market-cache/tiingo2/evidence/'+key+'.json',{key,summary:{metadata:{ticker:providerTicker,name:providerName,exchange:'NASDAQ',startDate:start},price:{historyValid:true,latestValid:true,latestDate:today,corporateActionValid:true},marketFactors:{materialized:false,basisValid:true}}});
  const result=await runRefresh({root,workDir,runId:'identity-integration',today,fromZip,offline:true,probe:true,historicalExclusions:new Map(),fetchImpl:()=>{throw Error('Unexpected network request');}});
  await check(result);
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('refresh rejects different companies sharing a first word despite valid price and listing evidence',async()=>{
 await fixture({officialName:'First Citizens BancShares, Inc. - Common Stock',providerName:'First Solar Inc'},result=>{
  assert.equal(result.candidateRows[0].evidence.identity.nameAgreement,false);
  assert.equal(result.policy.rows[0].publicationReady,false);
  assert.deepEqual(result.preview.ADDED,[]);
  assert.equal(result.summary.protectedBaseline.unchanged,true);
 });
});

test('refresh proposes a verified new listing with legal-name punctuation differences without production mutations',async()=>{
 await fixture({officialName:'First Solar, Inc. - Common Stock',providerName:'First Solar Inc'},result=>{
  assert.equal(result.candidateRows[0].evidence.identity.nameAgreement,true);
  assert.deepEqual(result.preview.ADDED.map(row=>row.ticker),['IPO']);
  assert.deepEqual(result.preview.REMOVED,[]);
  assert.equal(result.summary.productionMutations,0);
  assert.equal(result.summary.publication.state,'BLOCKED');
 });
});

test('refresh refuses stale SEC mappings to a different issuer sharing its first word',async()=>{
 await fixture({officialName:'First Solar, Inc. - Common Stock',providerName:'First Solar Inc',secName:'First Citizens BancShares Inc'},result=>{
  assert.equal(result.candidateRows[0].evidence.sec.cik,null);
  assert.equal(result.candidateRows[0].evidence.sec.available,false);
  assert.equal(result.policy.rows[0].productReadiness.secMapped,false);
 });
});

test('refresh blocks provider redirect aliases despite matching company and price evidence',async()=>{
 await fixture({officialName:'First Solar, Inc. - Common Stock',providerName:'First Solar Inc',providerTicker:'OLD'},result=>{
  assert.equal(result.candidateRows[0].evidence.identity.staleAlias,true);
  assert.equal(result.policy.rows[0].publicationReady,false);
  assert.deepEqual(result.preview.ADDED,[]);
 });
});
