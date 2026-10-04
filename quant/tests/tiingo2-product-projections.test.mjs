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
 prices.provenance={sourceResponseSha256:'9c'.repeat(32)};
 // Reverse split is an action on the ex-date, not a cumulative provider factor.
 for(let i=0;i<100;i++)Object.assign(prices.bars[i],{open:.5,high:.55,low:.45,close:.5,volume:20000,adjustedClose:10,adjustedOpen:10,adjustedHigh:11,adjustedLow:9,adjustedVolume:1000});
 prices.bars[100].splitFactor=.05;
 const chart=projectChart(prices,security,{asOf});
 assert.equal(chart.ready,true);assert.equal(chart.longReady,true);
 assert.equal(chart.daily.priceSeriesType,'SPLIT_ADJUSTED');assert.equal(chart.daily.currency,'USD');
 assert.equal(chart.daily.securityId,'ref_DNA');assert.equal(chart.canonicalProof.splitActions,1);
 assert.equal(chart.daily.sourceResponseSha256,prices.provenance.sourceResponseSha256);
 assert.ok(chart.daily.points.every(([,close])=>close===10));assert.equal(chart.canonicalProof.totalReturnAvailable,true);
 assert.equal(chart.canonicalProof.bars,220);
 for(const value of [undefined,'unverified',123]){
  const input=payload(security);input.provenance={sourceResponseSha256:value};
  assert.equal(Object.hasOwn(projectChart(input,security,{asOf}).daily,'sourceResponseSha256'),false);
 }
});

test('new IPO can have a daily chart before MAX history and Quant readiness',()=>{
 const security=row('IPO'),chart=projectChart(payload(security,40),security,{asOf});
 assert.equal(chart.ready,true);assert.equal(chart.longReady,false);assert.equal(chart.long,null);
 assert.deepEqual(chart.longReasonCodes,['INSUFFICIENT_LONG_CHART_HISTORY']);
});

test('5, 21 and 29 real sessions preserve a price quote but block Charts until session 30',()=>{
 const security=row('HOS');
 for(const count of [5,21,29]){
  const prices=payload(security,count),chart=projectChart(prices,security,{asOf});
  assert.equal(compactSeries(prices,{ticker:'HOS',securityId:'ref_HOS'},{basis:'TEST'}),null);
  assert.equal(chart.ready,false);assert.equal(chart.priceReady,true);
  assert.deepEqual(chart.reasonCodes,['CHART_BLOCKED_SHORT_HISTORY']);
  assert.equal(chart.daily.historyCoverage,'SHORT_HISTORY');assert.equal(chart.daily.points.length,count);
  assert.equal(chart.daily.from,prices.bars[0].date);assert.equal(chart.daily.to,asOf);assert.equal(chart.longReady,false);
 }
 const ready=projectChart(payload(security,30),security,{asOf});
 assert.equal(ready.ready,true);assert.equal(ready.daily.points.length,30);
 assert.deepEqual(ready.reasonCodes,[]);
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

test('DNA historical REVIEW policy resolves through the actual canonical browser directory without changing IDs or classifier metadata',async()=>{
 const actual={...read(resolve('quant/data/universe/instruments/DN.json')).instruments.find(instrument=>instrument.symbol==='DNA'),
  productEligibility:'REVIEW',productEligibilityReason:'UNCONFIRMED:LISTING_INACTIVE',screenerEligible:false,
  screenerReason:'Produktentscheidung des Wertpapierstamms: REVIEW (UNCONFIRMED:LISTING_INACTIVE)'};
 assert.equal(actual.productEligibility,'REVIEW');assert.equal(actual.securityType,'COMMON_STOCK');
 for(const variant of ['valid','issuer-mismatch','preferred','missing-alias','ambiguous-legacy']){
  const sourceRoot=mkdtempSync(join(tmpdir(),'vu-products-dna-')),shadowRoot=join(sourceRoot,'.market-cache/shadow');
  try{
   const canonical=structuredClone(actual);
   if(variant==='issuer-mismatch')canonical.issuerId='iss_cik_0000000001';
   if(variant==='preferred'){canonical.securityType='PREFERRED';canonical.securityClass='PREFERRED';}
   if(variant==='missing-alias')canonical.legacyIds=[];
   const alternate=variant==='ambiguous-legacy'?{...canonical,instrumentId:'vu_abcdef12345678',masterMemberId:'ref_OTHER',legacyIds:['ref_DNA','ref_OTHER']}:null;
   const baseline={shard:'DN',instruments:[actual]},shadow={shard:'DN',instruments:[...(alternate?[alternate]:[]),canonical]};
   put(sourceRoot,'quant/data/universe/instruments/DN.json',baseline);put(shadowRoot,'quant/data/universe/instruments/DN.json',shadow);
   put(shadowRoot,'quant/data/universe/master-manifest.json',{asOf,shards:[{shard:'DN'}]});
   mkdirSync(join(shadowRoot,'quant/config'),{recursive:true});copyFileSync(resolve('quant/config/company-master.json'),join(shadowRoot,'quant/config/company-master.json'));
   const before=readFileSync(join(shadowRoot,'quant/data/universe/instruments/DN.json'),'utf8');
   const result=await materializeProductProjections({sourceRoot,shadowRoot,securities:[{...canonical,ticker:'DNA'}],pricePayloads:new Map(),asOf});
   const proof=result.readiness[0].watchlist;
   assert.equal(readFileSync(join(shadowRoot,'quant/data/universe/instruments/DN.json'),'utf8'),before);
   assert.deepEqual(read(join(sourceRoot,'quant/data/universe/instruments/DN.json')),baseline);
   if(variant==='valid'){
    assert.equal(proof.ready,true);assert.equal(proof.canonicalIdPreserved,true);assert.equal(proof.legacyIdResolved,true);
    assert.equal(proof.persistentSelectionRoundtrip,true);assert.equal(proof.serverEligibilityState,'NOT_ELIGIBLE');
    assert.equal(proof.identitySource,'EXISTING_CANONICAL_BROWSER_DIRECTORY');
    assert.equal(result.readiness[0].instrumentId,actual.instrumentId);assert.equal(result.readiness[0].securityId,actual.masterMemberId);
   }else assert.equal(proof.ready,false,variant);
  }finally{rmSync(sourceRoot,{recursive:true,force:true});}
 }
});

test('a canonical new listing with twenty-one actual sessions retains a quote without chart or full Quant claims',async()=>{
 const sourceRoot=mkdtempSync(join(tmpdir(),'vu-products-short-')),shadowRoot=join(sourceRoot,'.market-cache/shadow');
 try{
  const security=row('HOS');
  put(shadowRoot,'quant/data/universe/instruments/HO.json',{shard:'HO',instruments:[security]});
  put(shadowRoot,'quant/data/universe/master-manifest.json',{asOf,shards:[{shard:'HO'}]});
  mkdirSync(join(shadowRoot,'quant/config'),{recursive:true});copyFileSync(resolve('quant/config/company-master.json'),join(shadowRoot,'quant/config/company-master.json'));
  const result=await materializeProductProjections({sourceRoot,shadowRoot,securities:[security],pricePayloads:new Map([['HOS',payload(security,21)]]),asOf});
  const capability=read(join(shadowRoot,'quant/data/universe/market-capability.json')).members.find(member=>member.m==='ref_HOS');
  assert.equal(capability.i,security.instrumentId);assert.equal(capability.s,'HOS');
  assert.equal(capability.ph,false);assert.equal(capability.ps,true);assert.equal(capability.b,21);
  assert.equal(capability.fr,false);assert.equal(capability.t,null);
  const diagnostic=result.readiness[0];assert.equal(diagnostic.isBaseline,false);
  assert.equal(diagnostic.chart.ready,false);assert.deepEqual(diagnostic.chart.reasonCodes,['CHART_BLOCKED_SHORT_HISTORY']);
  assert.equal(diagnostic.chart.canonicalProof.historyCoverage,'SHORT_HISTORY');assert.equal(diagnostic.chart.dailyPath,null);
  assert.equal(diagnostic.chart.baselinePublished,null);assert.equal(diagnostic.chart.longReady,false);
  assert.equal(diagnostic.watchlist.ready,true);assert.equal(diagnostic.quant.ready,false);
  assert.equal(existsSync(join(sourceRoot,'quant/data/market/discover-series/ref_HOS.json')),false);
 }finally{rmSync(sourceRoot,{recursive:true,force:true});}
});

test('two to four actual listing sessions publish latest-price evidence while existing chart reader stays unavailable',async()=>{
 for(const count of [2,4]){
  const sourceRoot=mkdtempSync(join(tmpdir(),'vu-products-quote-')),shadowRoot=join(sourceRoot,'.market-cache/shadow');
  try{
   const security=row('IPO');
   put(shadowRoot,'quant/data/universe/instruments/IP.json',{shard:'IP',instruments:[security]});
   put(shadowRoot,'quant/data/universe/master-manifest.json',{asOf,shards:[{shard:'IP'}]});
   mkdirSync(join(shadowRoot,'quant/config'),{recursive:true});copyFileSync(resolve('quant/config/company-master.json'),join(shadowRoot,'quant/config/company-master.json'));
   const result=await materializeProductProjections({sourceRoot,shadowRoot,securities:[security],pricePayloads:new Map([['IPO',payload(security,count)]]),asOf});
   const diagnostic=result.readiness[0],capability=read(join(shadowRoot,'quant/data/universe/market-capability.json')).members[0];
   assert.equal(diagnostic.chart.ready,false);assert.equal(diagnostic.chart.priceReady,true);
   assert.deepEqual(diagnostic.chart.reasonCodes,['CHART_BLOCKED_SHORT_HISTORY']);assert.equal(diagnostic.chart.dailyPath,null);
   assert.equal(diagnostic.chart.canonicalProof.bars,count);assert.equal(diagnostic.chart.longReady,false);
   assert.deepEqual(diagnostic.chart.eligibilityEvidence,{priceArtifactPath:'quant/data/market/discover-series/ref_IPO.json'});
   assert.equal(diagnostic.search.ready,true);assert.equal(diagnostic.watchlist.ready,true);assert.equal(diagnostic.quant.ready,false);
   assert.equal(capability.ph,false);assert.equal(capability.ps,true);assert.equal(capability.b,count);
   const compact=read(join(shadowRoot,diagnostic.chart.priceProjectionPath.slice(1)));
   assert.equal(compact.points.length,count);assert.equal(compact.corporateActionStatus,'PASS');
   const window={QuantShell:{loadJSON:async()=>compact}},context={window};
   runInNewContext(readFileSync(resolve('discover/ui/series-loader.js'),'utf8'),context);
   runInNewContext(readFileSync(resolve('discover/ui/microchart.js'),'utf8'),context);
   await assert.rejects(window.VUDiscover.SeriesLoader.get(diagnostic.chart.priceProjectionPath),/Reihe ohne Punkte/);
   assert.equal(window.VUDiscover.MicroChart.hasSeries(compact),false);
  }finally{rmSync(sourceRoot,{recursive:true,force:true});}
 }
 const security=row('IPO');
 for(const mutate of [p=>{p.securityId='ref_WRONG';},p=>{delete p.bars[0].splitFactor;},p=>{p.bars[1].date='2026-09-20';},p=>{p.currency='EUR';},p=>{p.bars[1].close=-1;},p=>{p.bars.reverse();}]){
  const p=payload(security,2);mutate(p);const projected=projectChart(p,security,{asOf});
  assert.equal(projected.ready,false);assert.notEqual(projected.priceReady,true);
 }
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
