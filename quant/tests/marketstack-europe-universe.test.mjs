import test from 'node:test';import assert from 'node:assert/strict';
import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import{analyzeEurope,collectDirectories,matchReference,officialMnemonic,readWorkingEvidence}from'../../scripts/market/analyze-marketstack-europe.mjs';
const endpoint=(offset,rows,total=3)=>({endpoint:'exchanges/XPAR/tickers',ok:true,params:{offset},data:{pagination:{offset,count:rows.length,total},data:{tickers:rows}},checkedAt:'2026-10-01T00:00:00Z'});
test('European directory completeness requires every page and distinct provider symbols',()=>{
 const rows=[{symbol:'A.PA'},{symbol:'B.PA'},{symbol:'C.PA'}];
 let result=analyzeEurope({probes:[{endpoints:[endpoint(0,rows.slice(0,1)),endpoint(2,rows.slice(2))]}]});
 assert.equal(result.coverage.venues.find(r=>r.mic==='XPAR').directoryComplete,false);
 result=analyzeEurope({probes:[{endpoints:[endpoint(0,rows.slice(0,2)),endpoint(2,rows.slice(2))]}]});
 assert.equal(result.coverage.venues.find(r=>r.mic==='XPAR').directoryComplete,true);
 const duplicate=analyzeEurope({probes:[{endpoints:[endpoint(0,[rows[0],rows[0],rows[1]])]}]});assert.equal(duplicate.coverage.venues.find(r=>r.mic==='XPAR').directoryComplete,false);
});
test('exact venue/symbol reference maps currency without inventing issuer country or price coverage',()=>{
 const ref={mic:'XPAR',symbol:'AIR',isin:'NL0000235190',tradingCurrency:'EUR',assetType:'EQUITY',listingType:'COMMON_STOCK',sourceId:'OFFICIAL_COMMON_101'};
 const result=analyzeEurope({probes:[{endpoints:[endpoint(0,[{symbol:'AIR.XPAR',name:'AIRBUS',has_eod:true,has_intraday:true}],1)]}],references:[ref]});
 const row=result.universe.listings[0];assert.equal(row.listingCountry,'FR');assert.equal(row.issuerCountry,null);assert.equal(row.assetType,'EQUITY');assert.equal(row.tradingCurrency,'EUR');assert.equal(row.priceHistoryValidated,false);assert.equal(row.priceHistoryCoverage,'UNKNOWN');assert.equal(row.liveCoverage,'UNKNOWN');assert.equal(row.consumerEligibility,'NOT_GRANTED');
});
test('ambiguous currency or venue matches and provider flags never classify broad tracker products',()=>{
 const row={symbol:'FUND.PA',has_eod:true};const refs=[{mic:'XPAR',symbol:'FUND',isin:'IE0000000001',tradingCurrency:'EUR'},{mic:'XPAR',symbol:'FUND',isin:'IE0000000001',tradingCurrency:'USD'}];
 assert.equal(matchReference(row,'XPAR',refs).state,'AMBIGUOUS_REFERENCE');assert.equal(matchReference(row,'XAMS',refs).state,'NO_EXACT_REFERENCE');
 const result=analyzeEurope({probes:[{endpoints:[endpoint(0,[row],1)]}],references:[{mic:'XPAR',symbol:'FUND',isin:'IE0000000001',tradingCurrency:'EUR',assetType:null}]});assert.equal(result.universe.unclassifiedSamples.find(r=>r.mic==='XPAR').samples[0].assetType,null);assert.equal(result.coverage.venues.find(r=>r.mic==='XPAR').totalETFUniverse,null);
});
test('preferred equities and ETF references remain distinct; UK quote units are not assumed',()=>{
 assert.equal(officialMnemonic('SHEL.L','XLON'),'SHEL');assert.equal(officialMnemonic('SHEL.XAMS','XAMS'),'SHEL');
 const probes=[{endpoints:[endpoint(0,[{symbol:'PREF.PA'},{symbol:'ETF.PA'}],2),{endpoint:'exchanges/XLON/tickers',ok:true,data:{pagination:{offset:0,count:1,total:1},data:{tickers:[{symbol:'SHEL.L'}]}}}]}];
 const references=[{mic:'XPAR',symbol:'PREF',assetType:'EQUITY',listingType:'PREFERRED',tradingCurrency:'EUR'},{mic:'XPAR',symbol:'ETF',assetType:'ETF',tradingCurrency:'EUR'}];const result=analyzeEurope({probes,references});
 assert.equal(result.universe.listings.find(r=>r.providerSymbol==='PREF.PA').listingType,'PREFERRED');assert.equal(result.universe.listings.find(r=>r.providerSymbol==='ETF.PA').assetType,'ETF');assert.equal(result.universe.unclassifiedSamples.find(r=>r.mic==='XLON').samples[0].tradingCurrency,null);assert.match(result.coverage.venues.find(r=>r.mic==='XLON').currencyWarning,/GBP\/GBX/);
});

test('contradictory provider ISIN or exchange is an anomaly and never an exact reference classification',()=>{
 const ref={mic:'XPAR',symbol:'AIR',isin:'NL0000235190',tradingCurrency:'EUR',assetType:'EQUITY'};
 for(const row of [{symbol:'AIR.PA',isin:'FR0000000001'},{symbol:'AIR.PA',isin:ref.isin,stock_exchange:{mic:'XNAS'}}]){
  const result=analyzeEurope({probes:[{endpoints:[endpoint(0,[row],1)]}],references:[ref]});assert.equal(result.universe.listings.length,0);assert.equal(result.coverage.venues.find(r=>r.mic==='XPAR').referenceConflictCount,1);assert.match(result.universe.unclassifiedSamples.find(r=>r.mic==='XPAR').samples[0].referenceMatch,/CONFLICT|MISMATCH/);
 }
});
test('changing totals and dishonest page counts are incomplete instead of an authoritative universe',()=>{
 const rows=[{symbol:'A.PA'},{symbol:'B.PA'},{symbol:'C.PA'}];
 for(const pages of [[endpoint(0,rows.slice(0,2),3),endpoint(2,rows.slice(2),4)],[{...endpoint(0,rows,3),data:{pagination:{offset:0,count:2,total:3},data:{tickers:rows}}}]]){
  const result=analyzeEurope({probes:[{endpoints:pages}]}),venue=result.coverage.venues.find(r=>r.mic==='XPAR');assert.equal(venue.directoryComplete,false);assert.equal(venue.paginationAnomaly,'INVALID_OR_CHANGING_PAGINATION');
 }
});

test('supplied currency/type contradictions and repeated same-symbol metadata conflicts fail closed',()=>{
 const ref={mic:'XPAR',symbol:'AIR',isin:'NL0000235190',tradingCurrency:'EUR',assetType:'EQUITY'};
 for(const row of [{symbol:'AIR.PA',currency:'USD'},{symbol:'AIR.PA',item_type:'fund'}])assert.match(matchReference(row,'XPAR',[ref]).state,/CONFLICT/);
 const repeated=[endpoint(0,[{symbol:'AIR.PA',isin:ref.isin}],1),endpoint(0,[{symbol:'AIR.PA',isin:'FR0000000001'}],1)];
 const result=analyzeEurope({probes:[{endpoints:repeated}],references:[ref]});assert.equal(result.universe.listings.length,0);assert.equal(result.coverage.venues.find(r=>r.mic==='XPAR').referenceConflictCount,1);
 assert.equal(matchReference({symbol:'AIR.PA'},'XPAR',[ref]).state,'EXACT_REFERENCE_MATCH','Missing fields remain unknown rather than an invented contradiction');
});

test('missing middle observation cannot erase earlier identity evidence before a later conflict',()=>{
 const ref={mic:'XPAR',symbol:'AIR',isin:'NL0000235190',tradingCurrency:'EUR',assetType:'EQUITY'};
 const rows=[{symbol:'AIR.PA',isin:ref.isin,currency:'EUR',item_type:'equity',stock_exchange:{mic:'XPAR'}},{symbol:'AIR.PA',name:'Benign revised name'},{symbol:'AIR.PA',isin:'FR0000000001',currency:'USD',item_type:'fund',stock_exchange:{mic:'XNAS'}}];
 const result=analyzeEurope({probes:[{endpoints:rows.map(row=>endpoint(0,[row],1))}],references:[ref]});assert.equal(result.universe.listings.length,0);assert.equal(result.coverage.venues.find(r=>r.mic==='XPAR').referenceConflictCount,1);assert.equal(result.universe.unclassifiedSamples.find(r=>r.mic==='XPAR').samples[0].referenceMatch,'PROVIDER_REPEATED_METADATA_CONFLICT');
});

test('single-ticker metadata ISIN contradictions veto a directory alias even when MIC is echoed',()=>{
 const ref={mic:'XAMS',symbol:'ASML',isin:'NL0010273215',tradingCurrency:'EUR',assetType:'EQUITY'};
 const directory={...endpoint(0,[{symbol:'ASML.XAMS',has_eod:true}],1),endpoint:'exchanges/XAMS/tickers'};
 const metadata={endpoint:'tickers/ASML.XAMS',ok:true,data:{symbol:'ASML',isin:'USN070592100',item_type:'equity',stock_exchange:{mic:'XAMS'}}};
 for(const endpoints of [[metadata,directory],[directory,metadata]]){const result=analyzeEurope({probes:[{endpoints}],references:[ref]});assert.equal(result.universe.listings.length,0);const row=result.universe.unclassifiedSamples.find(r=>r.mic==='XAMS').samples[0];assert.equal(row.referenceMatch,'PROVIDER_ISIN_CONFLICT');assert.equal(row.metadataEvidenceEndpoint,'tickers/ASML.XAMS');}
});

test('canonical metadata-only foundation does not become delivered history through preparation',()=>{
 const canonical={providerSymbol:'AIR.PA',mic:'XPAR',assetType:'EQUITY',tradingCurrency:'EUR',listingRegion:'EUROPE',coverage:{price_history:'NONE',price_eod:'NONE'}};
 const result=analyzeEurope({probes:[{endpoints:[endpoint(0,[{symbol:'AIR.PA'}],1)]}],canonicalListings:[canonical]});
 assert.equal(result.universe.counts.canonicalEuropeanListings,1);assert.equal(result.universe.counts.canonicalEuropeanPriceHistoryValidatedListings,0);assert.equal(result.universe.listings[0].consumerEligibility,'CANONICAL_IDENTITY_METADATA_ONLY');assert.equal(result.universe.listings[0].priceHistoryValidated,false);
});

test('private checkpoint streaming includes single-ticker identity veto and observation provenance',()=>{
 const root=mkdtempSync(join(tmpdir(),'europe-evidence-'));try{mkdirSync(join(root,'responses','2'),{recursive:true});const directory={...endpoint(0,[{symbol:'ASML.XAMS'}],1),endpoint:'exchanges/XAMS/tickers'},metadata={endpoint:'tickers/ASML.XAMS',ok:true,data:{symbol:'ASML',isin:'USN070592100',stock_exchange:{mic:'XAMS'}}};const tasks={};for(const[index,row]of[directory,metadata].entries()){const file='responses/2/'+String(index).repeat(64)+'.json';writeFileSync(join(root,file),JSON.stringify(row));tasks[index]={file,endpoint:row.endpoint,runId:'actual-observation-'+index,checkedAt:'2026-10-01T14:41:33Z'};}writeFileSync(join(root,'checkpoint.json'),JSON.stringify({tasks,lastRun:{runId:'newest-run'}}));
 const result=analyzeEurope({probes:readWorkingEvidence(root),references:[{mic:'XAMS',symbol:'ASML',isin:'NL0010273215',tradingCurrency:'EUR',assetType:'EQUITY'}]});assert.equal(result.universe.listings.length,0);const row=result.universe.unclassifiedSamples.find(r=>r.mic==='XAMS').samples[0];assert.equal(row.referenceMatch,'PROVIDER_ISIN_CONFLICT');assert.equal(row.metadataEvidenceRunId,'actual-observation-1');assert.equal(row.metadataEvidenceCheckedAt,'2026-10-01T14:41:33Z');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('complete regional German venues join legal type census without becoming domestic common equities',()=>{
 const directories=[{...endpoint(0,[{symbol:'FOREIGN.XFRA'}],1),endpoint:'exchanges/XFRA/tickers'}],germanCensus={venues:[{mic:'XFRA',directoryComplete:true}],equityListings:[{providerSymbol:'FOREIGN.XFRA',mic:'XFRA',status:'CLASSIFIED_CANDIDATE',assetType:'EQUITY',listingType:'UNKNOWN',referenceIdentity:{isin:'US0000000001',tradingCurrency:'EUR',active:true}}]};
 const result=analyzeEurope({probes:[{endpoints:directories}],germanCensus});assert.equal(result.universe.counts.venuesAnalyzed,14);assert.equal(result.universe.counts.germanVenueLegalEquityCandidates,1);assert.equal(result.universe.counts.germanDomesticCommonEquities,null);assert.equal(result.universe.counts.distinctClassifiedEquityISINs,1);assert.equal(result.universe.listings[0].issuerCountry,null);assert.equal(result.universe.listings[0].foundationEligibility,'CENSUS_ONLY_SECONDARY_GERMAN_VENUE');
});

test('same-venue metadata aliases veto contradictory official candidates without cross-venue US contamination',()=>{
 const directory={...endpoint(0,[{symbol:'LOCAL.DE'}],1),endpoint:'exchanges/XETR/tickers'},classifiedXetra=[{providerSymbol:'LOCAL.DE',assetType:'EQUITY',isin:'DE0000000001',tradingCurrency:'EUR'}];
 for(const change of [{isin:'US0000000001'},{currency:'USD'},{item_type:'ETF'}]){const metadata={endpoint:'tickers/LOCAL.XETR',ok:true,data:{symbol:'LOCAL',stock_exchange:{mic:'XETR'},...change}};const result=analyzeEurope({probes:[{endpoints:[directory,metadata]}],classifiedXetra});assert.equal(result.universe.listings.length,0);assert.equal(result.coverage.venues.find(r=>r.mic==='XETR').referenceConflictCount,1);}
 const US={endpoint:'tickers/LOCAL',ok:true,data:{symbol:'LOCAL',isin:'US0000000001',stock_exchange:{mic:'XNYS'}}};const safe=analyzeEurope({probes:[{endpoints:[directory,US]}],classifiedXetra});assert.equal(safe.universe.listings.length,1);assert.equal(safe.universe.listings[0].metadataEvidenceEndpoint,null);
});

test('exact official mnemonic resolves same-ISIN multicurrency ETF listings without cross-listing ambiguity',()=>{
 const refs=[{mic:'XETR',symbol:'EURO',isin:'IE0000000001',tradingCurrency:'EUR',assetType:'ETF'},{mic:'XETR',symbol:'DOLLAR',isin:'IE0000000001',tradingCurrency:'USD',assetType:'ETF'}];
 const result=matchReference({symbol:'EURO.DE',isin:'IE0000000001',currency:'EUR',asset_type:'ETF'},'XETR',refs);assert.equal(result.state,'EXACT_REFERENCE_MATCH');assert.equal(result.reference.symbol,'EURO');assert.equal(result.reference.tradingCurrency,'EUR');assert.equal(matchReference({symbol:'EURO.DE',isin:'IE0000000001',currency:'USD'},'XETR',refs).state,'PROVIDER_CURRENCY_CONFLICT');assert.equal(matchReference({symbol:'EURO.DE',isin:'IE0000000002',currency:'EUR'},'XETR',refs).state,'PROVIDER_ISIN_CONFLICT');
});

test('original endpoint source run takes priority over replay container and seeded unknown remains unknown',()=>{
 const directory=endpoint(0,[{symbol:'A.PA'}],1);const r=collectDirectories([{run:{runId:'container'},endpoints:[{...directory,sourceRunId:'original',sourceRunAttribution:'EXPLICIT_RESPONSE_OR_TASK'}]}]);assert.equal(r.get('XPAR').sourceRuns[0].runId,'original');
 const seeded=collectDirectories([{run:{runId:'container'},endpoints:[{...directory,seeded:true}]}]);assert.equal(seeded.get('XPAR').sourceRuns[0].runId,null);assert.equal(seeded.get('XPAR').sourceRuns[0].sourceRunAttribution,'UNKNOWN_SEEDED_ORIGINAL_RUN');
});
test('private metadata/source attribution uses unique checkpoint interval and never latest-run fallback',()=>{
 const root=mkdtempSync(join(tmpdir(),'europe-provenance-'));try{mkdirSync(join(root,'responses','0'),{recursive:true});const file='responses/0/'+'a'.repeat(64)+'.json',observation={endpoint:'tickers/A.PA',ok:true,checkedAt:'2026-10-01T12:01:00Z',data:{symbol:'A.PA'}};writeFileSync(join(root,file),JSON.stringify(observation));const task={endpoint:observation.endpoint,file};writeFileSync(join(root,'checkpoint.json'),JSON.stringify({tasks:{a:task},lastRun:{runId:'newest'},runs:{original:{startedAt:'2026-10-01T12:00:00Z',finishedAt:'2026-10-01T12:02:00Z'}}}));const [entry]=[...readWorkingEvidence(root)];assert.equal(entry.endpoints[0].sourceRunId,'original');assert.equal(entry.endpoints[0].sourceRunAttribution,'CHECKPOINT_INTERVAL_ATTRIBUTION');observation.seeded=true;writeFileSync(join(root,file),JSON.stringify(observation));assert.equal([...readWorkingEvidence(root)][0].endpoints[0].sourceRunId,null);}finally{rmSync(root,{recursive:true,force:true});}
});
