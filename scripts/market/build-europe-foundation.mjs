// Offline identity-only candidates. Existing canonical listings always win intact.
import{createHash}from'node:crypto';import{createRequire}from'node:module';
import{matchReference}from'./europe-reference-match.mjs';import{effectiveSecurityTypeSource}from'./build-europe-reference.mjs';
const G=createRequire(import.meta.url)('../../quant/engines/global-market.js');
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
const coverage=assetType=>({price_eod:'NONE',price_history:'NONE',intraday:'UNKNOWN',realtime:'UNKNOWN',corporate_actions:'UNKNOWN',fundamentals:'NONE',technical:'NONE',etf_holdings:assetType==='ETF'?'UNKNOWN':'NONE'});
function sourceSummary(source){return Object.fromEntries(['url','source_url','source_system','sourceSystem','sha256','sourceHashes','retrievedAt','retrieved_at','sourceLastUpdate','source_last_update','method','filter','selectionSemantics'].filter(key=>source?.[key]!==undefined).map(key=>[key,source[key]]));}
function verifiedSource(ref,sources){
 let source=sources[ref.sourceId]||ref.sourceReference?.source,classification=null;
 if(ref.assetType==='EQUITY'){
  if(ref.classificationSourceId==='EURONEXT_OFFICIAL_COMMON_STOCK_101'){classification=sources[ref.classificationEvidenceSourceId];if(!effectiveSecurityTypeSource(classification,'101'))return null;}
  else if(ref.classificationSourceId==='EURONEXT_OFFICIAL_PREFERRED_STOCK_106'){classification=sources[ref.classificationEvidenceSourceId];if(!effectiveSecurityTypeSource(classification,'106'))return null;}
  else if(ref.classificationState==='OFFICIAL_XETRA_CS_SHARE_SUBTYPE_UNRESOLVED'&&ref.officialSecurityTypeCode==='CS'&&source?.source_system==='DEUTSCHE_BOERSE_XETRA_T7_REFERENCE')classification=source;
  else if(ref.sourceId==='SIX_OFFICIAL_EQUITY_REFERENCE'&&['RS','BS','SS','PC'].includes(ref.officialSecurityTypeCode))classification=source;
  else if(ref.classificationState==='OFFICIAL_MAIN_MARKET_SHARES_CLASS_SHARE_SUBTYPE_UNRESOLVED'&&source?.rows===source?.pagination?.total&&Number.isInteger(source?.rows))classification=source;
  else return null;
 }else if(ref.assetType==='ETF'){
  const type=ref.sourceReference?.instrumentType||ref.sourceReference?.officialInstrumentType;if(!['ETF','ACTIVE ETF','STRUCTURED ETF'].includes(type))return null;
  const extra=sources.ETF_EXACT_TYPED_REFERENCES;
  if(!source?.url&&!source?.source_url){if(ref.mic==='XETR')source=extra?.originalClassificationSources?.XETRA_T7_2026_10_01;else source=extra?.officialInventories?.find(s=>s.scope==='EURONEXT_FILTERED_ETF_TRACKER_TYPES')?.pages?.[0]?.source;}
  classification=source;
 }else return null;
 if(!/^https:\/\//.test(source?.url||source?.source_url||'')||!(source?.sha256||source?.sourceHashes?.length))return null;
 return{identity:sourceSummary(source),classification:sourceSummary(classification)};
}
export function buildEuropeFoundation({universe,references,existing={schemaVersion:'global-market-1.0.0',listings:[]},generatedAt=universe?.generatedAt||new Date().toISOString()}){
 G.validate(existing);if(!Array.isArray(universe?.listings)||!Array.isArray(references?.rows))throw Error('EUROPE_CLASSIFIED_REFERENCE_INPUTS_REQUIRED');
 const protectedIds=new Set(existing.listings.map(r=>r.listingId)),listings=existing.listings.slice(),byKey=new Map(listings.map(r=>[r.ticker+'@'+r.mic,r])),decisions=[];
 for(const row of universe.listings.slice().sort((a,b)=>a.providerSymbol<b.providerSymbol?-1:a.providerSymbol>b.providerSymbol?1:0)){
  const block=reason=>decisions.push({providerSymbol:row.providerSymbol,mic:row.mic,status:'BLOCKED',reason});
  if(row.classificationState!=='REFERENCE_CLASSIFIED'||!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row.isin||'')||!/^[A-Z]{3}$/.test(row.tradingCurrency||'')||!/^[A-Z]{2}$/.test(row.listingCountry||'')){block('VERIFIED_IDENTITY_TYPE_CURRENCY_REQUIRED');continue;}
  if(row.foundationEligibility==='CENSUS_ONLY_SECONDARY_GERMAN_VENUE'){decisions.push({providerSymbol:row.providerSymbol,mic:row.mic,status:'CENSUS_ONLY',reason:'SECONDARY_GERMAN_VENUE_NOT_ADMITTED'});continue;}
  const result=matchReference({symbol:row.providerSymbol,isin:row.isin,currency:row.tradingCurrency,asset_type:row.assetType,mic:row.mic},row.mic,references.rows),ref=result.reference;
  // Missing reference cannot introduce new rows; exact protected base rows remain unchanged.
  const candidateKey=(ref?.symbol||row.providerSymbol.replace(/\.[A-Z0-9]+$/,''))+'@'+row.mic,prior=byKey.get(candidateKey);
  if(prior){if(prior.isin!==row.isin||prior.mic!==row.mic||prior.tradingCurrency!==row.tradingCurrency||prior.assetType!==row.assetType){block(!prior.isin?'PROTECTED_LISTING_ISIN_UNRESOLVED':'PROTECTED_LISTING_IDENTITY_CONFLICT');continue;}decisions.push({providerSymbol:row.providerSymbol,mic:row.mic,status:protectedIds.has(prior.listingId)?'PROTECTED_BASE_RECORD_PRESERVED':'METADATA_ALIAS_COLLAPSED',listingId:prior.listingId});continue;}
  if(!ref||result.state!=='EXACT_REFERENCE_MATCH'||ref.assetType!==row.assetType||ref.isin!==row.isin||ref.tradingCurrency!==row.tradingCurrency){block('EXACT_TYPED_OFFICIAL_REFERENCE_REQUIRED');continue;}
  if(row.metadataEvidenceEndpoint&&/CONFLICT|MISMATCH/.test(row.referenceMatch)){block('PROVIDER_METADATA_CONFLICT');continue;}
  const provenance=verifiedSource(ref,references.sources||{});if(!provenance){block('OFFICIAL_TYPE_OR_CURRENCY_PROVENANCE_REQUIRED');continue;}
  if(!/^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(ref.symbol||'')){block('OFFICIAL_MNEMONIC_UNSUPPORTED');continue;}
  const sameVenueISIN=listings.filter(r=>r.mic===row.mic&&r.isin===row.isin);if(sameVenueISIN.some(r=>r.tradingCurrency===row.tradingCurrency)){block('SAME_VENUE_SECURITY_ALREADY_PRESENT_WITH_OTHER_MNEMONIC');continue;}
  const knownSecurities=[...new Set(listings.filter(r=>r.isin===row.isin&&r.assetType===row.assetType).map(r=>r.securityId))];if(knownSecurities.length>1){block('PROTECTED_SECURITY_ID_CONFLICT');continue;}
  const sourceUpdatedAt=row.metadataEvidenceCheckedAt||provenance.identity.retrievedAt||provenance.identity.retrieved_at||generatedAt;
  const listing={listingId:'vu_'+hash(ref.symbol+'@'+row.mic),securityId:knownSecurities[0]||'sec_isin_'+ref.isin,companyId:null,fundId:row.assetType==='ETF'?'fund_'+hash(ref.isin):null,ticker:ref.symbol,name:ref.name||row.providerName||null,companyName:row.assetType==='EQUITY'?(ref.name||row.providerName||null):null,assetType:row.assetType,listingType:ref.listingType||'UNKNOWN',isin:ref.isin,mic:row.mic,exchange:row.mic,listingCountry:row.listingCountry,listingRegion:'EUROPE',country:null,region:null,tradingCurrency:ref.tradingCurrency,reportingCurrency:null,displayCurrency:ref.tradingCurrency,primaryListing:null,universeTier:'EUROPE',active:ref.status==='ACTIVE'?true:null,activeBasis:ref.status==='ACTIVE'?'OFFICIAL_INSTRUMENT_STATUS':'UNKNOWN',providerSymbol:row.providerSymbol,providerExchange:row.mic,aliases:[row.providerSymbol],classificationSource:'AUTHENTICATED_DIRECTORY_EXACT_MIC_MNEMONIC_OFFICIAL_TYPE',identitySource:provenance.identity,currencySource:provenance.identity,classificationProvenance:provenance.classification,source:'marketstack',sourceUpdatedAt,identityStatus:'ISSUER_UNLINKED',identityConfidence:'EXACT_DIRECTORY_REFERENCE_JOIN_NOT_PRICE_COVERAGE',corporateActionBasis:'UNVERIFIED',coverage:coverage(row.assetType)};
  try{G.validateListing(listing);}catch(e){block(e.message);continue;}listings.push(listing);byKey.set(ref.symbol+'@'+row.mic,listing);decisions.push({providerSymbol:row.providerSymbol,mic:row.mic,status:'METADATA_FOUNDATION_ADDED',listingId:listing.listingId});
 }
 const layer={...existing,generatedAt,listings};G.validate(layer);return{layer,summary:{schemaVersion:'europe-canonical-foundation-summary-1.0.0',generatedAt,productionActivated:false,publication:'CENTRAL_REVIEW_REQUIRED_NO_PUBLIC_WRITES',protectedBaseRecords:existing.listings.length,metadataRecordsAdded:decisions.filter(r=>r.status==='METADATA_FOUNDATION_ADDED').length,overlapPreserved:decisions.filter(r=>r.status==='PROTECTED_BASE_RECORD_PRESERVED').length,protectedBaseOverlapListings:new Set(decisions.filter(r=>r.status==='PROTECTED_BASE_RECORD_PRESERVED').map(r=>r.listingId)).size,candidateObservations:universe.listings.length,censusOnlyCandidates:decisions.filter(r=>r.status==='CENSUS_ONLY').length,metadataAliasObservationsCollapsed:decisions.filter(r=>r.status==='METADATA_ALIAS_COLLAPSED').length,blocked:decisions.filter(r=>r.status==='BLOCKED').length,total:listings.length,counts:{equities:listings.filter(r=>r.assetType==='EQUITY').length,etfs:listings.filter(r=>r.assetType==='ETF').length,newPriceCoverageGranted:0},decisions}};
}
