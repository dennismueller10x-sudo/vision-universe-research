// Read-only analysis of authenticated cached directories and exact official references.
// No network requests, credentials, canonical publication, or market-data flag inference.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,sep,dirname} from 'node:path';
import{officialMnemonic,evidenceCurrency,evidenceMic,evidenceType,matchReference}from'./europe-reference-match.mjs';
import{analyzeOperatorCandidates,readOperatorEODEvidence}from'./analyze-europe-operator-candidates.mjs';
export{officialMnemonic,matchReference}from'./europe-reference-match.mjs';
export const EUROPEAN_VENUES=[['DE','XETR'],['FR','XPAR'],['NL','XAMS'],['BE','XBRU'],['IT','XMIL'],['ES','XMAD'],['AT','XWBO'],['CH','XSWX'],['GB','XLON'],['DK','XCSE'],['SE','XSTO'],['NO','XOSL'],['FI','XHEL']];
function directoryPayload(endpoint){const payload=endpoint.data||{},rows=Array.isArray(payload)?payload:Array.isArray(payload.data)?payload.data:payload.data?.tickers||[];return{rows,pagination:payload.pagination||endpoint.pagination||null};}
export function* readWorkingEvidence(directory) {
 const root=resolve(directory),checkpoint=JSON.parse(readFileSync(resolve(root,'checkpoint.json')));
 for(const task of Object.values(checkpoint.tasks||{})) {
  if(!task?.file || !/^responses\/[0-9]+\/[a-f0-9]{64}\.json$/.test(task.file))throw Error('INVALID_PRIVATE_EVIDENCE_PATH');
  const path=resolve(root,task.file);if(!path.startsWith(root+sep))throw Error('PRIVATE_EVIDENCE_PATH_ESCAPES_ROOT');
  if(!/^exchanges\/[A-Z0-9]{4}\/tickers$/.test(task.endpoint||'')&&!/^tickers\/[^/]+$/.test(task.endpoint||''))continue;
  const endpoint=JSON.parse(readFileSync(path));
  yield {run:{source:'PRIVATE_WORKING_CHECKPOINT',runId:task.runId||endpoint.runId||checkpoint.lastRun?.runId||null},endpoints:[{...endpoint,checkedAt:endpoint.checkedAt||task.checkedAt||null}]};
 }
}
export function collectDirectories(probes){
 const venues=new Map(),metadata=new Map();
 for(const probe of probes)for(const endpoint of probe.endpoints||[]){
  const match=/^exchanges\/([A-Z0-9]{4})\/tickers$/.exec(endpoint.endpoint||'');if(!endpoint.ok)continue;if(!match){const single=/^tickers\/([^/]+)$/.exec(endpoint.endpoint||'');if(single&&endpoint.data?.symbol){const key=single[1];if(!metadata.has(key))metadata.set(key,[]);metadata.get(key).push({...endpoint,evidenceRunId:probe.run?.runId||null});}continue;}
  const mic=match[1],{rows,pagination}=directoryPayload(endpoint);if(!venues.has(mic))venues.set(mic,{mic,rows:new Map(),pages:[],sourceRuns:[]});const venue=venues.get(mic);
  for(const row of rows)if(row?.symbol){
   const old=venue.rows.get(row.symbol),conflicts=old?['isin','currency','mic','type'].filter(field=>{const get=field==='currency'?evidenceCurrency:field==='mic'?evidenceMic:field==='type'?evidenceType:row=>row.isin;return get(old)&&get(row)&&get(old)!==get(row);}):[];
   const merged={...old,...row};
  if(old){if(!row.isin&&old.isin)merged.isin=old.isin;if(!evidenceCurrency(row)&&evidenceCurrency(old))merged.tradingCurrency=evidenceCurrency(old);if(!evidenceMic(row)&&evidenceMic(old))merged.mic=evidenceMic(old);if(!evidenceType(row)&&evidenceType(old))merged.item_type=evidenceType(old);}
  venue.rows.set(row.symbol,{...merged,...((old?._evidenceConflicts?.length||conflicts.length)?{_evidenceConflicts:[...new Set([...(old?._evidenceConflicts||[]),...conflicts])]}:{})});
  }
  venue.pages.push({offset:pagination?.offset??endpoint.params?.offset??0,count:pagination?.count??rows.length,actualRows:rows.length,validRows:rows.every(row=>row&&typeof row.symbol==='string'&&row.symbol.length>0),parameterOffset:endpoint.params?.offset??null,total:pagination?.total??endpoint.total??null,complete:endpoint.complete===true,checkedAt:endpoint.checkedAt||probe.generatedAt||null});
  if(probe.run&&!venue.sourceRuns.some(r=>r.runId===probe.run.runId))venue.sourceRuns.push(probe.run);
 }
 for(const venue of venues.values()){
  const aliases=new Map();for(const row of venue.rows.values()){const key=officialMnemonic(row.symbol,venue.mic);if(!aliases.has(key))aliases.set(key,[]);aliases.get(key).push(row);}
  for(const[symbol,observations]of metadata)for(const observation of observations){
   const data=observation.data,exact=venue.rows.get(symbol),mnemonic=officialMnemonic(symbol,venue.mic);
   const rows=exact?[exact]:(mnemonic!==symbol||evidenceMic(data)===venue.mic)?aliases.get(mnemonic)||[]:[];
   for(const row of rows){const identity={...row};for(const field of ['isin','item_type','asset_type','type','currency','trading_currency','tradingCurrency','mic','stock_exchange'])if(data[field])identity[field]=data[field];const conflicts=['isin','currency','mic','type'].filter(field=>{const get=field==='currency'?evidenceCurrency:field==='mic'?evidenceMic:field==='type'?evidenceType:row=>row.isin;return get(row)&&get(data)&&get(row)!==get(data);});Object.assign(row,identity,{metadataEvidenceEndpoint:observation.endpoint,metadataEvidenceCheckedAt:observation.checkedAt||null,metadataEvidenceRunId:observation.evidenceRunId});if(conflicts.length||row._evidenceConflicts?.length)row._evidenceConflicts=[...new Set([...(row._evidenceConflicts||[]),...conflicts])];}
  }
 }

 return venues;
}
function complete(venue){
 const totals=venue.pages.map(p=>p.total).filter(Number.isInteger),total=totals.at(-1)??null;
 const valid=total!==null&&totals.every(value=>value===total)&&venue.pages.every(page=>Number.isInteger(page.offset)&&page.offset>=0&&Number.isInteger(page.count)&&page.count>=0&&page.count===page.actualRows&&page.validRows&&(page.parameterOffset===null||page.parameterOffset===page.offset)&&(page.total===null||Number.isInteger(page.total)&&page.total===total)&&page.offset+page.count<=total);
 if(!valid)return{total,complete:false,anomaly:total===null?'UNKNOWN_TOTAL':'INVALID_OR_CHANGING_PAGINATION'};
 let end=0;for(const page of [...venue.pages].sort((a,b)=>a.offset-b.offset)){if(page.offset>end)break;end=Math.max(end,page.offset+page.count);}
 return{total,complete:end>=total&&venue.rows.size===total,anomaly:null};
}
export function analyzeEurope({probes,references=[],referenceSources={},canonicalListings=[],classifiedXetra=[],germanCensus=null,generatedAt=new Date().toISOString(),searchReadiness=null,operatorReferences=null,operatorEODEvidence=[]}){
 const discovered=collectDirectories(probes),venueScope=[...EUROPEAN_VENUES];
 for(const venue of germanCensus?.venues||[])if(venue.directoryComplete===true&&discovered.has(venue.mic)&&!venueScope.some(v=>v[1]===venue.mic))venueScope.push(['DE',venue.mic]);
 for(const mic of ['XLIS','XDUB','XWAR','XATH','XIST','XICE'])if(discovered.has(mic))venueScope.push([({XLIS:'PT',XDUB:'IE',XWAR:'PL',XATH:'GR',XIST:'TR',XICE:'IS'})[mic],mic]);
 const referencesByMic=new Map();for(const ref of references){if(!referencesByMic.has(ref.mic))referencesByMic.set(ref.mic,[]);referencesByMic.get(ref.mic).push(ref);}
 const listings=[],venues=[];
 for(const[listingCountry,mic]of venueScope){
  const venue=discovered.get(mic),prepared=canonicalListings.filter(r=>r.mic===mic);const count=venue?complete(venue):{total:null,complete:false};
  const classified=mic==='XETR'?classifiedXetra:(germanCensus?.equityListings||[]).filter(r=>r.mic===mic&&r.status==='CLASSIFIED_CANDIDATE'&&!r.metadataConflict&&!r.identityConflict).map(r=>({providerSymbol:r.providerSymbol,assetType:r.assetType,isin:r.referenceIdentity?.isin,tradingCurrency:r.referenceIdentity?.tradingCurrency,listingTypeHint:r.listingType,officialStatus:r.referenceIdentity?.active?'ACTIVE':null,referenceSourceId:'GERMANY_EXACT_SAME_VENUE_OFFICIAL_T7_TYPE'}));const classifiedBySymbol=new Map(classified.map(row=>[row.providerSymbol,row]));
  for(const row of venue?.rows.values()||[]){
   let source=classifiedBySymbol.get(row.symbol);const match=matchReference(row,mic,referencesByMic.get(mic)||[]),ref=match.reference;let canonical=prepared.find(r=>r.providerSymbol===row.symbol);
   const sourceConflict=source&&((row.isin&&source.isin&&row.isin!==source.isin)?'PROVIDER_ISIN_CONFLICT':evidenceCurrency(row)&&source.tradingCurrency&&evidenceCurrency(row)!==source.tradingCurrency?'PROVIDER_CURRENCY_CONFLICT':evidenceType(row)&&source.assetType&&evidenceType(row)!==source.assetType?'PROVIDER_ASSET_TYPE_CONFLICT':null);
   const conflict=/CONFLICT|MISMATCH/.test(match.state)||sourceConflict;if(conflict){source=null;canonical=null;if(!/CONFLICT|MISMATCH/.test(match.state))match.state=sourceConflict;}
   const assetType=source?.assetType||ref?.assetType||canonical?.assetType||null;
   const tradingCurrency=source?.tradingCurrency||ref?.tradingCurrency||canonical?.tradingCurrency||null;
   const listingType=source?.listingTypeHint||ref?.listingType||canonical?.listingType||null;
   listings.push({providerSymbol:row.symbol,providerName:row.name||null,mic,listingCountry,issuerCountry:null,issuerRegion:null,assetType,listingType,tradingCurrency,reportingCurrency:null,
    isin:source?.isin||ref?.isin||canonical?.isin||null,classificationState:assetType?'REFERENCE_CLASSIFIED':'UNKNOWN',
    classificationSource:source?(mic==='XETR'?'XETRA_EXACT_ACTIVE_OFFICIAL_REFERENCE':'GERMANY_EXACT_SAME_VENUE_OFFICIAL_T7_TYPE'):ref?.sourceId||canonical?.classificationSource||null,
    referenceMatch:source?'EXACT_REFERENCE_MATCH':canonical&&!ref?'PRIOR_CANONICAL_VALIDATION':match.state,
    officialListingStatus:source?.officialStatus||ref?.status||null,
    hasEODDirectoryFlag:row.has_eod??null,hasIntradayDirectoryFlag:row.has_intraday??null,
    priceHistoryValidated:!!canonical&&['FULL','PARTIAL'].includes(canonical.coverage?.price_history),priceHistoryCoverage:canonical?.coverage?.price_history||'UNKNOWN',
    liveCoverage:canonical?.coverage?.realtime||'UNKNOWN',consumerPrepared:!!canonical,consumerEligibility:canonical?(['FULL','PARTIAL'].includes(canonical.coverage?.price_history)?'PRIOR_BOUNDED_VALIDATION':'CANONICAL_IDENTITY_METADATA_ONLY'):'NOT_GRANTED',referenceSourceId:ref?.sourceId||source?.referenceSourceId||null,metadataEvidenceEndpoint:row.metadataEvidenceEndpoint||null,metadataEvidenceCheckedAt:row.metadataEvidenceCheckedAt||null,metadataEvidenceRunId:row.metadataEvidenceRunId||null,foundationEligibility:listingCountry==='DE'&&mic!=='XETR'?'CENSUS_ONLY_SECONDARY_GERMAN_VENUE':'EXACT_REFERENCE_REVIEW_REQUIRED'});
  }
  const members=listings.filter(r=>r.mic===mic);
  venues.push({mic,listingCountry,requestedCountry:EUROPEAN_VENUES.some(r=>r[0]===listingCountry),primaryRequestedVenue:EUROPEAN_VENUES.some(r=>r[1]===mic),providerReportedInstrumentTotal:count.total,observedUniqueProviderSymbols:venue?.rows.size??0,directoryComplete:count.complete,
   classifiedEquityCandidates:members.filter(r=>r.assetType==='EQUITY').length,classifiedETFCandidates:members.filter(r=>r.assetType==='ETF').length,
   classificationUnknown:members.filter(r=>!r.assetType).length,currencyUnresolved:members.filter(r=>!r.tradingCurrency).length,
   measuredCanonicalEquityListings:prepared.filter(r=>r.assetType==='EQUITY').length,measuredCanonicalETFListings:prepared.filter(r=>r.assetType==='ETF').length,
   measuredCanonicalPriceHistoryListings:prepared.filter(r=>['FULL','PARTIAL'].includes(r.coverage?.price_history)).length,canonicalMetadataOnlyListings:prepared.filter(r=>!['FULL','PARTIAL'].includes(r.coverage?.price_history)).length,
   totalActiveInstruments:null,totalInactiveInstruments:null,totalEquityUniverse:count.complete&&members.every(r=>r.assetType)?members.filter(r=>r.assetType==='EQUITY').length:null,
   totalETFUniverse:count.complete&&members.every(r=>r.assetType)?members.filter(r=>r.assetType==='ETF').length:null,
   priceHistoryCoverage:'UNKNOWN_OUTSIDE_CANONICAL_VALIDATED_SUBSET',liveCoverage:'UNKNOWN_OUTSIDE_CANONICAL_VALIDATED_SUBSET',corporateActionCoverage:'UNKNOWN',
   paginationAnomaly:count.anomaly||null,referenceConflictCount:members.filter(row=>/CONFLICT|MISMATCH/.test(row.referenceMatch)).length,sourceRuns:venue?.sourceRuns||[],currencyWarning:mic==='XLON'?'GBP/GBX quote unit must be verified per listing; no venue currency assumption.':null});
 }
 const limitations=['German venue legal equity candidates include foreign secondary listings; they are not a measured domestic German common-stock universe. Non-Xetra German venues are census-only and excluded from new canonical foundation admission.','Listing country is exchange geography and never inferred issuer domicile.','Directory has_eod/has_intraday flags are provider metadata and do not establish delivered market-data coverage.','Reference candidates retain NOT_GRANTED eligibility until canonical identity/classification/currency/history gates pass.','An official securities category can include rights, warrants and equity certificates; unclassified broad categories remain UNKNOWN.','Active/inactive totals are null unless status has been measured for the complete directory.'];
 const operatorCandidates=analyzeOperatorCandidates(operatorReferences,discovered,operatorEODEvidence);
 const operatorSummary=operatorCandidates?{...operatorCandidates,rows:undefined}:null;
 for(const venue of venues)if(operatorSummary)venue.additionalOfficialOperatorReferences=operatorSummary.inventories.find(r=>r.candidateProviderMIC===venue.mic)||null;
 const counts={requestedCountries:EUROPEAN_VENUES.length,venuesAnalyzed:venues.length,observedProviderListings:listings.length,classifiedEquityCandidates:listings.filter(r=>r.assetType==='EQUITY').length,classifiedETFCandidates:listings.filter(r=>r.assetType==='ETF').length,distinctClassifiedEquityISINs:new Set(listings.filter(r=>r.assetType==='EQUITY'&&r.isin).map(r=>r.isin)).size,distinctClassifiedETFISINs:new Set(listings.filter(r=>r.assetType==='ETF'&&r.isin).map(r=>r.isin)).size,germanVenueLegalEquityCandidates:germanCensus?.counts?.classifiedEquityListingCandidates??listings.filter(r=>r.listingCountry==='DE'&&r.assetType==='EQUITY').length,germanVenueProviderIdentityAdmissibleEquityCandidates:listings.filter(r=>r.listingCountry==='DE'&&r.assetType==='EQUITY').length,germanDomesticCommonEquities:null,classificationUnknown:listings.filter(r=>!r.assetType).length,currencyUnresolved:listings.filter(r=>!r.tradingCurrency).length,canonicalEuropeanListings:canonicalListings.filter(r=>r.listingRegion==='EUROPE').length,canonicalEuropeanPriceHistoryValidatedListings:canonicalListings.filter(r=>r.listingRegion==='EUROPE'&&['FULL','PARTIAL'].includes(r.coverage?.price_history)).length};
 return{universe:{schemaVersion:'europe-marketstack-universe-1.0.0',generatedAt,providerReplacementDecision:'DEFERRED',state:'MEASURED_METADATA_CANDIDATES_NOT_COMPLETE_PRICE_COVERAGE',counts,referenceSources,additionalOfficialOperatorReferences:operatorSummary,limitations,listings:listings.filter(row=>row.assetType),unclassifiedSamples:venues.map(venue=>({mic:venue.mic,totalUnknown:venue.classificationUnknown,samples:listings.filter(row=>row.mic===venue.mic&&!row.assetType).slice(0,20)})),searchReadiness},coverage:{schemaVersion:'europe-exchange-coverage-1.0.0',generatedAt,providerReplacementDecision:'DEFERRED',state:'MEASURED_METADATA_ONLY_OUTSIDE_VALIDATED_SUBSET',counts,additionalOfficialOperatorReferences:operatorSummary,limitations,venues},operatorCandidates};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const args=process.argv.slice(2),paths=args.filter(a=>a.startsWith('--probe=')).map(a=>a.slice(8)),arg=key=>args.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3);
 if((!paths.length&&!arg('working-directory'))||!arg('out'))throw Error('EVIDENCE_AND_OUT_REQUIRED');
 const refs=arg('references')?JSON.parse(readFileSync(arg('references'))):{},canonical=arg('canonical')?JSON.parse(readFileSync(arg('canonical'))).listings:[],xetra=arg('xetra')?JSON.parse(readFileSync(arg('xetra'))).candidates:[];
 const operatorReferences=arg('operator-references')?JSON.parse(readFileSync(arg('operator-references'))):null;
 const result=analyzeEurope({operatorReferences,operatorEODEvidence:readOperatorEODEvidence(arg('working-directory'),operatorReferences,arg('operator-eod-label')),probes:arg('working-directory')?readWorkingEvidence(arg('working-directory')):paths.map(p=>JSON.parse(readFileSync(p))),references:refs.rows||[],referenceSources:refs.sources||{},germanCensus:arg('german-census')?JSON.parse(readFileSync(arg('german-census'))):null,canonicalListings:canonical,classifiedXetra:xetra,searchReadiness:arg('search-readiness')?JSON.parse(readFileSync(arg('search-readiness'))):null});
 mkdirSync(arg('out'),{recursive:true});if(result.operatorCandidates)writeFileSync(resolve(arg('out'),'europe_official_operator_candidates.json'),JSON.stringify(result.operatorCandidates,null,2)+'\n');writeFileSync(resolve(arg('out'),'europe_marketstack_universe.json'),JSON.stringify(result.universe,null,2)+'\n');writeFileSync(resolve(arg('out'),'europe_exchange_coverage.json'),JSON.stringify(result.coverage,null,2)+'\n');if(arg('foundation-out')){const output=resolve(arg('foundation-out'));if(/\/(quant\/data|discover\/data|dashboard\/data|site-release)(\/|$)/.test(output))throw Error('FOUNDATION_OUTPUT_MUST_BE_PRIVATE');const{buildEuropeFoundation}=await import('./build-europe-foundation.mjs');const existing=arg('canonical')?JSON.parse(readFileSync(arg('canonical'))):{schemaVersion:'global-market-1.0.0',listings:[]};const foundation=buildEuropeFoundation({universe:result.universe,references:refs,existing});mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(foundation.layer)+'\n');writeFileSync(resolve(arg('out'),'europe_canonical_foundation_summary.json'),JSON.stringify(foundation.summary,null,2)+'\n');console.log(JSON.stringify({foundation:foundation.summary.total,added:foundation.summary.metadataRecordsAdded,blocked:foundation.summary.blocked}));}console.log(JSON.stringify(result.universe.counts));
}
