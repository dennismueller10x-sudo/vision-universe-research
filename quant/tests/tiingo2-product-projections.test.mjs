import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,copyFileSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {projectChart,materializeProductProjections} from '../../scripts/market/tiingo2-product-projections.mjs';
import {compactSeries} from '../../scripts/market/publish-discover-series.mjs';
const require=createRequire(import.meta.url),Master=require('../engines/company-master.js'),Directory=require('../engines/instrument-directory.js');
const asOf='2026-10-02';
const row=(symbol,extra={})=>({symbol,ticker:symbol,instrumentId:Master.mintInstrumentId({provider:'tiingo',symbol,exchange:'NASDAQ'},0),masterMemberId:'ref_'+symbol,securityId:'ref_'+symbol,legacyIds:['ref_'+symbol],exchange:'NASDAQ',currency:'USD',companyName:symbol==='NEW'?'Example Software Inc.':'Protected Company Inc.',country:'US',securityType:'COMMON_STOCK',securityClass:'EQUITY_COMMON',productEligibility:'ELIGIBLE',primaryListing:true,active:true,cik:null,issuerId:null,...extra});
function payload(security,length=220){const last=Date.parse(asOf),bars=[];for(let i=0;i<length;i++){const date=new Date(last-(length-i-1)*86400000).toISOString().slice(0,10);bars.push({date,open:10,high:11,low:9,close:10,volume:1000,adjustedOpen:10,adjustedHigh:11,adjustedLow:9,adjustedClose:10,adjustedVolume:1000,splitFactor:1,dividend:0,adjustmentStatus:'adjusted'});}return {ticker:security.symbol,securityId:security.masterMemberId,provider:'tiingo',currency:'USD',updatedAt:asOf,adjustmentStatus:'adjusted',bars};}
const read=p=>JSON.parse(readFileSync(p,'utf8'));
function put(root,path,value){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value));return file;}

test('existing chart projection is independent of fundamentals and uses split semantics and actual source currency',()=>{
 const security=row('DNA',{currency:'USD'}),prices=payload(security);
 // Reverse split is an action on the ex-date, not a cumulative provider factor.
 for(let i=0;i<100;i++)Object.assign(prices.bars[i],{open:.5,high:.55,low:.45,close:.5,volume:20000,adjustedClose:10,adjustedOpen:10,adjustedHigh:11,adjustedLow:9,adjustedVolume:1000});
 prices.bars[100].splitFactor=.05;
 const chart=projectChart(prices,security,{asOf});
 assert.equal(chart.ready,true);assert.equal(chart.longReady,true);
 assert.equal(chart.daily.priceSeriesType,'SPLIT_ADJUSTED');assert.equal(chart.daily.currency,'USD');
 assert.equal(chart.daily.securityId,'ref_DNA');assert.equal(chart.canonicalProof.splitActions,1);
 assert.ok(chart.daily.points.every(([,close])=>close===10));assert.equal(chart.canonicalProof.totalReturnAvailable,true);
 assert.equal(chart.canonicalProof.bars,220);
});

test('new IPO can have a daily chart before MAX history and Quant readiness',()=>{
 const security=row('IPO'),chart=projectChart(payload(security,40),security,{asOf});
 assert.equal(chart.ready,true);assert.equal(chart.longReady,false);assert.equal(chart.long,null);
 assert.deepEqual(chart.longReasonCodes,['INSUFFICIENT_LONG_CHART_HISTORY']);
});

test('short IPO history passes actual existing SeriesLoader and MicroChart while default publisher threshold stays unchanged',async()=>{
 const security=row('HOS'),prices=payload(security,21),chart=projectChart(prices,security,{asOf});
 assert.equal(compactSeries(prices,{ticker:'HOS',securityId:'ref_HOS'},{basis:'TEST'}),null);
 assert.equal(chart.ready,true);assert.equal(chart.daily.historyCoverage,'SHORT_HISTORY');assert.equal(chart.daily.points.length,21);
 assert.equal(chart.daily.from,prices.bars[0].date);assert.equal(chart.daily.to,asOf);assert.equal(chart.longReady,false);
 const window={QuantShell:{loadJSON:async()=>chart.daily}},context={window};
 runInNewContext(readFileSync(resolve('discover/ui/series-loader.js'),'utf8'),context);
 runInNewContext(readFileSync(resolve('discover/ui/microchart.js'),'utf8'),context);
 const loaded=await window.VUDiscover.SeriesLoader.get('/quant/data/market/discover-series/ref_HOS.json');
 assert.equal(window.VUDiscover.MicroChart.hasSeries(loaded),true);
 assert.equal(projectChart(payload(security,4),security,{asOf}).ready,false);
});

test('price identity mismatch, stale history, missing actions and unexplained break fail closed',()=>{
 const security=row('DNA');
 const mismatched=payload(security);mismatched.securityId='ref_OLD';assert.equal(projectChart(mismatched,security,{asOf}).ready,false);
 const stale=payload(security);stale.bars=stale.bars.slice(0,-8);assert.equal(projectChart(stale,security,{asOf}).ready,false);
 const missingAction=payload(security);delete missingAction.bars[50].splitFactor;assert.equal(projectChart(missingAction,security,{asOf}).ready,false);
 const unexplained=payload(security);for(let i=150;i<220;i++)Object.assign(unexplained.bars[i],{open:30,high:33,low:27,close:30,adjustedOpen:30,adjustedHigh:33,adjustedLow:27,adjustedClose:30});
 assert.equal(projectChart(unexplained,security,{asOf}).ready,false);
});

test('shadow productization builds actual canonical search/charts and persistent watchlist identity, preserving unaffected search entries',async()=>{
 const sourceRoot=mkdtempSync(join(tmpdir(),'vu-products-')),shadowRoot=join(sourceRoot,'.market-cache/shadow');
 try{
  const baseline=row('KEEP'),candidate=row('NEW',{companyNameAliases:['Previous Example Software'],symbolAliases:['OLDNEW']});
  put(sourceRoot,'quant/data/universe/instruments/KE.json',{shard:'KE',instruments:[baseline]});
  const protectedEntry={i:baseline.instrumentId,s:'KEEP',n:'Protected Company Inc.',x:'NASDAQ',c:'US',t:'COMMON_STOCK',a:1,cap:['HAS_PROFILE']};
  put(sourceRoot,'quant/data/universe/search/sym/KE.json',{shard:'KE',entries:[protectedEntry]});
  put(sourceRoot,'quant/data/universe/search/name/PR.json',{shard:'PR',entries:[protectedEntry]});
  put(shadowRoot,'quant/data/universe/instruments/KE.json',{shard:'KE',instruments:[baseline]});
  put(shadowRoot,'quant/data/universe/instruments/NE.json',{shard:'NE',instruments:[candidate]});
  put(shadowRoot,'quant/data/universe/master-manifest.json',{asOf,shards:[{shard:'KE'},{shard:'NE'}]});
  mkdirSync(join(shadowRoot,'quant/config'),{recursive:true});copyFileSync(resolve('quant/config/company-master.json'),join(shadowRoot,'quant/config/company-master.json'));
  const prices=payload(candidate);const result=await materializeProductProjections({sourceRoot,shadowRoot,securities:[candidate],pricePayloads:new Map([['NEW',prices]]),asOf});
  assert.deepEqual(result.report.counts,{search:1,chart:1,watchlist:1});
  assert.equal(result.readiness[0].quant.ready,false);assert.equal(result.readiness[0].watchlist.canonicalIdPreserved,true);
  assert.equal(result.readiness[0].watchlist.existingUserStorageTouched,false);
  assert.deepEqual(read(join(shadowRoot,'quant/data/universe/search/sym/KE.json')).entries,[protectedEntry]);
  assert.deepEqual(read(join(shadowRoot,'quant/data/universe/instruments/KE.json')).instruments,[baseline]);
  assert.equal(read(join(shadowRoot,'quant/data/market/discover-series/ref_NEW.json')).sourceBarCount,220);
  assert.equal(read(join(shadowRoot,'quant/data/market/discover-series-long/ref_NEW.json')).sourceBarCount,220);
  assert.equal(existsSync(join(sourceRoot,'quant/data/market/discover-series/ref_NEW.json')),false);
  const directory=Directory.create({loadJSON:async path=>read(join(shadowRoot,path.slice(1)))});
  const alias=await directory.search('OLDNEW');assert.equal(alias.entries[0].i,candidate.instrumentId);
  const oldName=await directory.search('Previous Example Software');assert.equal(oldName.entries[0].i,candidate.instrumentId);
  const chartFlags=(await directory.search('NEW')).entries[0].cap;assert.ok(chartFlags.includes('HAS_PRICE_HISTORY'));assert.ok(!chartFlags.includes('HAS_FUNDAMENTALS'));
  await assert.rejects(materializeProductProjections({sourceRoot,shadowRoot:sourceRoot,securities:[candidate],asOf}),/ISOLATED_PRIVATE_SHADOW_ROOT_REQUIRED/);
 }finally{rmSync(sourceRoot,{recursive:true,force:true});}
});

test('scoped projection cannot remint an existing security ID',async()=>{
 const sourceRoot=mkdtempSync(join(tmpdir(),'vu-products-id-')),shadowRoot=join(sourceRoot,'.market-cache/shadow');
 try{
  const baseline=row('DNA'),changed={...baseline,masterMemberId:'ref_OTHER',legacyIds:['ref_OTHER']};
  put(sourceRoot,'quant/data/universe/instruments/DN.json',{instruments:[baseline]});put(shadowRoot,'quant/data/universe/instruments/DN.json',{instruments:[changed]});
  await assert.rejects(materializeProductProjections({sourceRoot,shadowRoot,securities:[changed],asOf}),/BASELINE_SECURITY_ID_CHANGED/);
 }finally{rmSync(sourceRoot,{recursive:true,force:true});}
});

test('blocked existing refreshes preserve published capability rows and chart bytes without certifying fresh readiness',async()=>{
 const sourceRoot=mkdtempSync(join(tmpdir(),'vu-products-preservation-')),shadowRoot=join(sourceRoot,'.market-cache/shadow');
 try{
  const existing=['AMC','BIRD','AMWL','DNA','KEEP'].map(ticker=>row(ticker)),added=row('NEW'),blockedNew=row('IPO');
  const baselineCaps=existing.map(security=>({m:security.masterMemberId,s:security.symbol,i:security.instrumentId,ph:true,ps:true,b:250,fr:true,q:'PASS',t:'TECHNICAL_READY',f:'2025-01-01',l:asOf,src:'protected-published-evidence',extra:{durable:true}}));
  const baselineDoc={totals:{},members:baselineCaps};
  put(sourceRoot,'quant/data/universe/market-capability.json',baselineDoc);
  for(const security of [...existing,added,blockedNew]){
   const shard=Master.shardKey(security.symbol),path='quant/data/universe/instruments/'+shard+'.json';
   const prior=existsSync(join(shadowRoot,path))?read(join(shadowRoot,path)).instruments:[];
   put(shadowRoot,path,{shard,instruments:[...prior,security]});
   if(existing.includes(security)){
    const old=existsSync(join(sourceRoot,path))?read(join(sourceRoot,path)).instruments:[];
    put(sourceRoot,path,{shard,instruments:[...old,security]});
   }
  }
  put(shadowRoot,'quant/data/universe/master-manifest.json',{asOf,shards:[...new Set([...existing,added,blockedNew].map(security=>Master.shardKey(security.symbol)))].map(shard=>({shard}))});
  mkdirSync(join(shadowRoot,'quant/config'),{recursive:true});copyFileSync(resolve('quant/config/company-master.json'),join(shadowRoot,'quant/config/company-master.json'));
  const oldCharts=new Map();
  for(const security of existing){
   const projected=projectChart(payload(security),security,{asOf}),chart=projected.daily,path='quant/data/market/discover-series/'+security.masterMemberId+'.json';
   put(sourceRoot,path,chart);put(shadowRoot,path,chart);oldCharts.set(security.symbol,readFileSync(join(sourceRoot,path),'utf8'));
   const longPath='quant/data/market/discover-series-long/'+security.masterMemberId+'.json';
   put(sourceRoot,longPath,projected.long);put(shadowRoot,longPath,projected.long);
  }
  const bird=payload(existing.find(security=>security.symbol==='BIRD'));
  for(let i=150;i<220;i++)Object.assign(bird.bars[i],{open:30,high:33,low:27,close:30,adjustedOpen:30,adjustedHigh:33,adjustedLow:27,adjustedClose:30});
  const amwl=payload(existing.find(security=>security.symbol==='AMWL'));amwl.bars=amwl.bars.slice(0,-8);
  const dna=existing.find(security=>security.symbol==='DNA');
  const result=await materializeProductProjections({sourceRoot,shadowRoot,securities:[...existing.filter(security=>security.symbol!=='KEEP'),added,blockedNew],pricePayloads:new Map([['BIRD',bird],['AMWL',amwl],['DNA',payload(dna)],['NEW',payload(added)]]),asOf});
  const caps=read(join(shadowRoot,'quant/data/universe/market-capability.json'));
  for(const ticker of ['AMC','BIRD','AMWL','KEEP']){
   assert.deepEqual(caps.members.find(member=>member.s===ticker),baselineCaps.find(member=>member.s===ticker));
   assert.equal(readFileSync(join(shadowRoot,'quant/data/market/discover-series/ref_'+ticker+'.json'),'utf8'),oldCharts.get(ticker));
  }
  for(const ticker of ['AMC','BIRD','AMWL']){
   const diagnostic=result.readiness.find(item=>item.ticker===ticker);
   assert.equal(diagnostic.chart.ready,false);assert.equal(diagnostic.chart.freshValidationState,'BLOCKED');
   assert.equal(diagnostic.chart.baselinePublished.state,'PRESERVED_BASELINE');
   assert.equal(diagnostic.chart.baselinePublished.priceHistoryDeclared,true);
   assert.equal(diagnostic.chart.baselinePublished.freshValidationIncluded,false);
   assert.match(diagnostic.chart.baselinePublished.dailyArtifactSha256,/^[a-f0-9]{64}$/);
   assert.equal(diagnostic.chart.baselinePublished.longPath,'/quant/data/market/discover-series-long/ref_'+ticker+'.json');
   assert.match(diagnostic.chart.baselinePublished.longArtifactSha256,/^[a-f0-9]{64}$/);
   assert.equal(readFileSync(join(sourceRoot,diagnostic.chart.baselinePublished.longPath.slice(1)),'utf8'),readFileSync(join(shadowRoot,diagnostic.chart.baselinePublished.longPath.slice(1)),'utf8'));
  }
  assert.equal(caps.members.find(member=>member.s==='DNA').src,'tiingo2:actual-canonical-chart-projection');
  assert.equal(caps.members.find(member=>member.s==='NEW').ph,true);
  assert.equal(caps.members.find(member=>member.s==='IPO').ph,false);
  assert.equal(result.readiness.find(item=>item.ticker==='IPO').chart.baselinePublished,null);
  assert.equal(caps.incrementalEvidence.updatedSecurities,3);
  assert.equal(caps.incrementalEvidence.preservedBaselineSecurities,4);
  assert.deepEqual(read(join(sourceRoot,'quant/data/universe/market-capability.json')),baselineDoc);
 }finally{rmSync(sourceRoot,{recursive:true,force:true});}
});
