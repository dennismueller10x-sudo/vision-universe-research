// Read-only evidence reconciliation. Uses the existing ETF model; no API client,
// credential access, canonical writes, provider switching, or consumer activation.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {collectGermanDirectoryPages,classifyGermanDirectory} from './audit-marketstack-germany.mjs';
import {officialMnemonic} from './analyze-marketstack-europe.mjs';
import {summarizeUSListingEvidence} from './summarize-marketstack-us-listing-evidence.mjs';
import {probeResponseProvenance} from './marketstack-evidence-provenance.mjs';
const require=createRequire(import.meta.url);
const {normalizeETFHoldings}=require('../../providers/marketstack/etf.js');
const {normalizeBar,normalizeCurrency,assetType}=require('../../providers/marketstack/adapter.js');
const DOCUMENTATION='https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json';
const FAMILY_PATTERNS=[['iShares',/^ishares\b/i],['Xtrackers',/^xtrackers\b/i],['Amundi',/^(?:amundi|lyxor)\b/i],['Vanguard',/^vanguard\b/i],['Invesco',/^invesco\b/i],['SPDR',/^spdr\b/i],['WisdomTree',/^wisdomtree\b/i],['VanEck',/^vaneck\b/i],['Franklin',/^franklin\b/i],['UBS',/^ubs\b/i],['JPMorgan',/^(?:jpm|jpmorgan)\b/i],['HSBC',/^hsbc\b/i]];
const text=x=>typeof x==='string'&&x.trim()?x.trim():null;
const countBy=(rows,fn)=>rows.reduce((out,row)=>{const key=String(fn(row)??'UNKNOWN');out[key]=(out[key]||0)+1;return out;},{});
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||'').slice(0,10))?String(x).slice(0,10):null;
const rowsOf=e=>Array.isArray(e?.data?.data)?e.data.data:Array.isArray(e?.data)?e.data:[];
const endpointOf=e=>String(e?.endpoint||'').replace(/^\//,'');
const metadataOf=e=>e?.data?.data&&!Array.isArray(e.data.data)?e.data.data:e?.data&&!Array.isArray(e.data)?e.data:null;
export function issuerFamilyHint(name){return FAMILY_PATTERNS.find(([,pattern])=>pattern.test(String(name||'').replace(/&amp;/g,'&').trim()))?.[0]||null;}
export function categoryHints(name){
  const n=String(name||'').toLowerCase(),out=[];
  if(/small\s*cap|smallcap/.test(n))out.push('SMALL_CAP');
  if(/world|all.country|acwi|all.world/.test(n))out.push('GLOBAL_EQUITY_NAME_HINT');
  if(/bond|treasury|aggregate|fixed.income/.test(n))out.push('BOND_NAME_HINT');
  if(/dividend/.test(n))out.push('DIVIDEND_NAME_HINT');
  if(/gold/.test(n))out.push('GOLD_NAME_HINT');
  if(/emerging|\bmsci em\b/.test(n))out.push('EMERGING_MARKETS_NAME_HINT');
  if(/s.?&.?p 500|s.?p 500/.test(n))out.push('SP500_NAME_HINT');
  if(/nasdaq/.test(n))out.push('NASDAQ_NAME_HINT');
  return out;
}
/** Public SIX Explorer's explicit ProductLine=ET records. Listing symbols are
 * joined against authenticated XSWX directory observations before admission.
 * ManagementFee is retained under its original name, never substituted for TER. */
export function normalizeSIXETFReference(payload,source){
  const fields=['FundLongName','ValorSymbol','ISIN','TradingBaseCurrency','FundCurrency','ProductLineDesc'];
  if(!Array.isArray(payload?.colNames)||!Array.isArray(payload?.rowData)||fields.some(f=>!payload.colNames.includes(f)))throw new Error('Invalid official SIX ETF reference schema');
  const rows=[];
  for(const values of payload.rowData){
    if(!Array.isArray(values)||values.length!==payload.colNames.length)throw new Error('Invalid official SIX reference row');
    const r=Object.fromEntries(payload.colNames.map((k,i)=>[k,values[i]]));
    if(r.ProductLineDesc!=='Exchange Traded Funds')continue;
    const symbol=text(r.ValorSymbol),isin=text(r.ISIN),currency=normalizeCurrency(r.TradingBaseCurrency);
    if(!symbol||!isin||!currency)continue;
    const known=x=>text(x)&&!/^unknown$/i.test(String(x))?text(x):null;
    // The official mnemonic is not a provider ticker. Resolve its observed
    // namespace from the actual XSWX directory (.SW and .XSWX both occur).
    rows.push({exchangeSymbol:symbol,mic:'XSWX',assetType:'ETF',isin,tradingCurrency:currency,officialName:text(r.FundLongName),
      officialInstrumentType:'ETF',active:null,listingCountry:'CH',officialFundMetadata:{fundCurrency:normalizeCurrency(r.FundCurrency),
        managerReported:known(r.IssuerLongNameDesc),fundLegalEntityReported:known(r.IssuerNameFull),legalStructureCountryReported:known(r.LegalStructureCountryDesc),
        managementFeeReported:r.ManagementFee===null||r.ManagementFee===''?null:Number.isFinite(Number(r.ManagementFee))?Number(r.ManagementFee):null,
        managementFeeIsTER:false,replicationMethodReported:known(r.ReplicationMethodDesc),managementStyleReported:known(r.ManagementStyleDesc),
        benchmarkDescriptionReported:known(r.FundUnderlyingDescription),benchmarkProviderReported:known(r.UnderlyingProviderDesc),UCITSRegulatoryStatus:null,
        source:{...source,columnsUsed:['IssuerLongNameDesc','IssuerNameFull','LegalStructureCountryDesc','ManagementFee','FundCurrency','ReplicationMethodDesc','FundUnderlyingDescription']}}});
  }
  return {source,rows,officialInventory:{mic:'XSWX',rows:rows.length,uniqueISIN:new Set(rows.map(r=>r.isin)).size,activeStatus:'UNKNOWN',providerCoverageProven:false}};
}
/** Reuse the US audit's official venue/type parser. ETF-flagged notes and test
 * symbols stay outside the ETF cohort; no currency, ISIN or tradability guessed. */
export function normalizeUSNasdaqETFReference(directory,asOf='2026-10-01'){
  if(!Array.isArray(directory?.rows))throw new Error('Official NasdaqTrader directory required');
  const queried=directory.rows.map((r,i)=>({securityId:'official-audit-row-'+i,providerSymbol:r.Symbol||r['ACT Symbol'],expectedMics:[]}));
  const summarized=summarizeUSListingEvidence(directory,queried,{asOfDate:asOf,generatedAt:asOf});
  const resolved=summarized.rows.map(r=>r.currentListing).filter(Boolean),ETF=resolved.filter(r=>r.role==='ETF');
  const sources={source_system:'NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY',retrievedAt:directory.retrievedAt,asOf,sources:directory.sources};
  return {source:sources,rows:ETF.filter(r=>r.mic).map(r=>({symbol:r.symbol,exchangeSymbol:r.symbol,mic:r.mic,assetType:'ETF',isin:null,tradingCurrency:null,officialName:r.securityName,
    officialInstrumentType:'ETF',active:null,listingCountry:'US',listingStatus:'CURRENT_LISTING_OBSERVED',officialTypeEvidence:{ETF:r.etfFlag,testIssue:r.testIssue,role:r.role,source:r.source,
      confidence:'EXCHANGE_ETF_FLAG_ROLE_ONLY',fundLegalStructure:'UNKNOWN'}})),
    officialInventory:{scope:'CURRENT_OFFICIAL_US_PRIMARY_LISTING_DIRECTORY',totalRows:directory.rows.length,complete:summarized.completePublicDirectory,
      ETFflagY:resolved.filter(r=>r.etfFlag==='Y').length,ETFRoleRows:ETF.length,ETFRoleKnownMICRows:ETF.filter(r=>r.mic).length,
      ETFRoleUnknownMICRows:ETF.filter(r=>!r.mic).length,testSymbolsExcluded:resolved.filter(r=>r.role==='TEST_SECURITY'&&r.etfFlag==='Y').length,
      ETNFlaggedRowsExcluded:resolved.filter(r=>r.role==='ETN'&&r.etfFlag==='Y').length,duplicateOrAmbiguousSymbols:directory.rows.length-resolved.length,
      ETFRoleCountsByMIC:countBy(ETF,r=>r.mic),
      excludedFlagRecords:resolved.filter(r=>r.etfFlag==='Y'&&['ETN','TEST_SECURITY'].includes(r.role)).map(r=>({symbol:r.symbol,mic:r.mic,role:r.role,name:r.securityName})),
      explicitETCETPNoteNameHintsForLegalStructureReview:ETF.filter(r=>/\bETCs?\b|\bETPs?\b|exchange[- ]traded commodit|\bnotes?\b/i.test(r.securityName||'')).map(r=>({symbol:r.symbol,mic:r.mic,name:r.securityName,state:'REVIEW_ONLY_NOT_AUTOMATIC_EXCLUSION'})),
      activeTradabilityVerified:false,priceHistoryImplied:false}};
}
/** Euronext's filtered JSON response, rather than the mixed tracker download,
 * supplies authoritative ETF/ACTIVE ETF/STRUCTURED ETF classification. */
export function normalizeEuronextETFReference(pages){
  const rows=[],inventories=[],seenPages=new Set(),seenIdentities=new Set(),duplicateIdentityRowsByType={};let replayedPagesIgnored=0;
  const strip=x=>String(x||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
  for(const {payload,source} of pages){
    if(!['ETF','ACTIVE ETF','STRUCTURED ETF'].includes(source?.productTypeFilter))throw new Error('Explicit official ETF type filter required');
    const params=new URLSearchParams(source.requestBody||'');
    if(source.method!=='POST'||params.get('args[productType]')!==source.productTypeFilter)throw new Error('Effective filtered POST provenance required');
    if(!Array.isArray(payload?.aaData)||!Number.isInteger(payload.iTotalDisplayRecords)||payload.iTotalDisplayRecords<0)throw new Error('Invalid filtered Euronext reference');
    const start=source.offset??0;if(!Number.isInteger(start)||start<0||start+payload.aaData.length>payload.iTotalDisplayRecords)throw new Error('Invalid Euronext reference pagination');
    const pageIdentity=JSON.stringify([source.productTypeFilter,start,payload.iTotalDisplayRecords,payload.aaData]);
    if(seenPages.has(pageIdentity)){replayedPagesIgnored++;continue;}seenPages.add(pageIdentity);
    inventories.push({type:source.productTypeFilter,total:payload.iTotalDisplayRecords,offset:source.offset??0,rows:payload.aaData.length,source});
    for(const r of payload.aaData){
      const match=String(r?.[0]||'').match(/\/product\/etfs\/([A-Z]{2}[A-Z0-9]{9}\d)-([A-Z0-9]{4})["']/),displayedMics=strip(r?.[2]).split(',').map(x=>x.trim()),mic=match?.[2],exchangeSymbol=strip(r?.[1]);
      const currency=normalizeCurrency(strip(r?.[4]).match(/^([A-Za-z]{3})\s/)?.[1]);
      if(!match||!displayedMics.includes(mic)||!exchangeSymbol)throw new Error('Invalid Euronext listing identity');
      const key=[source.productTypeFilter,match[1],mic,exchangeSymbol,currency].join('@');
      if(seenIdentities.has(key)){duplicateIdentityRowsByType[source.productTypeFilter]=(duplicateIdentityRowsByType[source.productTypeFilter]||0)+1;continue;}
      seenIdentities.add(key);
      rows.push({exchangeSymbol,mic,isin:match[1],assetType:'ETF',officialInstrumentType:source.productTypeFilter,officialName:strip(r[0]),tradingCurrency:currency,
        listingCountry:({XAMS:'NL',XAMC:'NL',XPAR:'FR',XBRU:'BE',ETFP:'IT',XOSL:'NO'})[mic]||null,active:null,additionalDisplayedVenues:displayedMics.filter(x=>x!==mic),
        tradingCurrencyVerification:currency?'EXPLICIT_OFFICIAL_RESPONSE':'NOT_PROVIDED'});
    }
  }
  const completeByType={};
  for(const type of new Set(inventories.map(p=>p.type))){const records=inventories.filter(p=>p.type===type),totals=new Set(records.map(p=>p.total));let cursor=0,gap=false;
    for(const page of records.sort((a,b)=>a.offset-b.offset)){if(page.offset>cursor)gap=true;cursor=Math.max(cursor,page.offset+page.rows);}
    const uniqueCount=rows.filter(r=>r.officialInstrumentType===type).length;
    completeByType[type]=totals.size===1&&!gap&&cursor===[...totals][0]&&uniqueCount===[...totals][0]&&!duplicateIdentityRowsByType[type];
  }
  const source={source_system:'EURONEXT_OFFICIAL_FILTERED_TRACKER_REFERENCE',sourceHashes:pages.map(p=>p.source.sha256)};
  return {source,rows,officialInventory:{scope:'EURONEXT_FILTERED_ETF_TRACKER_TYPES',reportedByType:Object.fromEntries(inventories.map(x=>[x.type,x.total])),observedRows:rows.length,
    uniqueISIN:new Set(rows.map(r=>r.isin)).size,completeByType,replayedPagesIgnored,duplicateIdentityRowsByType,providerCoverageProven:false,pages:inventories}};
}
function observation(e,run){return {endpoint:endpointOf(e),requestParameters:e.params||{},checkedAt:e.checkedAt||e.retrievedAt||null,retrievedAt:e.retrievedAt||null,
  responseSHA256:createHash('sha256').update(JSON.stringify(e.data??null)).digest('hex'),sourceRun:run||null,
  sourceRunId:e.sourceRunId||null,sourceRunAttribution:e.sourceRunAttribution||'UNKNOWN_ORIGINAL_RUN',sourceRunContentProof:e.sourceRunContentProof||null,
  requestSucceeded:e.ok===true,reason:e.reason||null};}
function lookupSymbol(e){return e.symbol||e.params?.ticker||e.params?.symbols||endpointOf(e).match(/^tickers\/([^/]+)$/)?.[1]||null;}
function expectedIdentity(listing){
  return {symbol:listing.symbol,exchange:listing.mic,currency:listing.tradingCurrency,assetType:'etf',securityId:'audit-security:'+listing.key,listingId:'audit-listing:'+listing.key,isin:listing.isin||undefined};
}
export function summarizeHoldings(payload,listing,context={}){
  if(listing.assetType!=='ETF')return {state:'EXCLUDED_ASSET_TYPE',reason:'ETF_IDENTITY_REQUIRED',symbol:listing.symbol};
  const normalized=normalizeETFHoldings(payload,expectedIdentity(listing),{retrievedAt:context.retrievedAt});
  if(!normalized.ok)return {state:'UNAVAILABLE',reason:normalized.reason,symbol:listing.symbol,providerErrorCode:payload?.code||payload?.error?.code||null};
  const d=normalized.data,h=d.holdings,reported=d.reportDate;
  const age=reported&&context.asOf?Math.floor((Date.parse(context.asOf)-Date.parse(reported))/86400000):null;
  const temporalAnomalies=[];
  if(age!==null&&age<0)temporalAnomalies.push('REPORT_DATE_AFTER_AUDIT_DATE');
  if(context.asOf&&d.signatureDate&&Date.parse(d.signatureDate)>Date.parse(context.asOf))temporalAnomalies.push('SIGNATURE_DATE_AFTER_AUDIT_DATE');
  const duplicates=d.anomalies.filter(a=>a.code==='DUPLICATE_HOLDING_LINE');
  // A model position-key collision is a review flag, not proof that all fields
  // of two reported lines agree. Count exact raw duplicates separately.
  const exactLines=new Set();let duplicateExactPositionLines=0;
  for(const position of h){const raw=position.raw||{},key=JSON.stringify(Object.fromEntries(Object.keys(raw).sort().map(k=>[k,raw[k]])));if(exactLines.has(key))duplicateExactPositionLines++;exactLines.add(key);}
  const derivative=h.filter(x=>x.assetCategory==='DE'||/derivative|futures|swap|option/i.test(x.assetCategory||''));
  const cash=h.filter(x=>x.cashCollateral==='Y'||/cash|stiv/i.test(x.assetCategory||''));
  const countryMissing=h.filter(x=>!x.country);
  const weightDecimals=h.map(x=>String(x.raw?.percent_value||'').split('.')[1]?.length||0);
  const seenISIN=new Set();let duplicateISINLines=0;
  for(const position of h){if(!position.isin)continue;if(seenISIN.has(position.isin))duplicateISINLines++;seenISIN.add(position.isin);}
  return {state:temporalAnomalies.length?'QUARANTINED':'AVAILABLE_PARTIAL',reason:temporalAnomalies[0]||null,temporalAnomalies,symbol:listing.symbol,assetType:'ETF',portfolioScope:d.portfolioScope,
    fundSeriesId:d.fund.seriesId,fundSeriesName:d.fund.seriesName,umbrellaFundName:d.fund.name,
    fundCIK:d.fund.cik,seriesISIN:d.fund.isin,reportDate:reported,actualAsOf:d.actualAsOf,fundFiscalYearEnd:d.fundFiscalYearEnd,dateSemantics:d.dateSemantics,signatureDate:d.signatureDate,
    publicAvailableAt:d.publicAvailableAt,reportAgeDaysAtAudit:age,staleThresholdDays:120,staleForCurrentPortfolio:age===null?null:age>120,
    holdingsLines:h.length,validLines:h.filter(x=>x.valid).length,missingWeights:h.filter(x=>x.weightPercent==null).length,
    signedWeightTotalPercent:d.totalWeightPercent,negativeWeightLines:h.filter(x=>x.weightPercent!==null&&x.weightPercent<0).length,
    weightStringMaxDecimals:weightDecimals.reduce((max,n)=>Math.max(max,n),0),missingISIN:h.filter(x=>!x.isin).length,
    duplicateExactPositionLines,positionKeyCollisionLines:duplicates.length,duplicateISINLines,
    derivativeLines:derivative.length,cashOrCollateralLines:cash.length,missingCountryLines:countryMissing.length,
    reportedAssetCategories:countBy(h,x=>x.assetCategory),reportedCountries:countBy(h,x=>x.country),
    coverage:d.coverage,completeness:'UNKNOWN',fullHoldingsVerified:false,updateFrequency:'UNKNOWN',
    expectedISIN:listing.isin||null,returnedSeriesISINMatchesExpected:listing.isin?d.fund.isin===listing.isin:null,
    ETFShareClassAUM:null,derivedAUMForbidden:true,anomalies:d.anomalies,
    provenance:d.provenance,notes:['Fund-series portfolio is not proven to be the complete ETF share-class portfolio.',
      'Signed derivative weights and distinct collateral legs are retained; equal ISIN alone does not authorize deduplication.',
      'Signature/report/retrieval dates do not establish SEC acceptance or point-in-time public availability.',
      'Sum of holding values is not ETF share-class AUM.']};
}
function metadataField(field,providerStatus,providerEvidence,externalStatus='UNKNOWN',externalEvidence=[],values={}){
  return {field,providerStatus,providerEvidence,externalStatus,externalEvidence,...values};
}
export function buildMetadataMatrix(audit){
  const listingRows=audit.listings,holding=audit.holdingsTests.filter(x=>x.state==='AVAILABLE_PARTIAL');
  const observed=listings=>listings.filter(x=>!x.identityConflict&&(x.metadataObserved||x.history.uniqueBars>0));
  const have=observed(listingRows),external=listingRows.filter(x=>x.officialReference);
  const evidence=path=>({schemaPath:path,source:DOCUMENTATION});
  const matrix=[
    metadataField('ETF_NAME',have.length?'PARTIAL':'UNKNOWN',[evidence('Ticker.name / EODBar.name / ETFAttributes.series_name')],'PARTIAL',['OFFICIAL_EXCHANGE_INSTRUMENT_NAME'],{observedListings:have.length}),
    metadataField('TICKER',have.length?'PARTIAL':'UNKNOWN',[evidence('ETFListItem.ticker / Ticker.symbol')],'PARTIAL',['OFFICIAL_EXCHANGE_MNEMONIC']),
    metadataField('EXCHANGE',have.length?'PARTIAL':'UNKNOWN',[evidence('Ticker.stock_exchange / EODBar.exchange')],'PARTIAL',['OFFICIAL_EXCHANGE_MIC']),
    metadataField('ISIN',listingRows.some(x=>x.providerISIN&&!x.identityConflict)?'PARTIAL':'UNKNOWN',[evidence('Ticker.isin / ETFAttributes.isin')],'PARTIAL',['OFFICIAL_EXCHANGE_ISIN'],{providerObservedListings:listingRows.filter(x=>x.providerISIN&&!x.identityConflict).length,officialMatchedListings:external.filter(x=>x.isin).length,identityConflictsExcluded:true}),
    metadataField('WKN','NOT AVAILABLE',[],external.some(x=>text(x.wkn||x.officialReference?.wkn))?'PARTIAL':'UNKNOWN',
      external.some(x=>text(x.wkn||x.officialReference?.wkn))?['OFFICIAL_XETRA_WKN']:[],{officialObservedListings:external.filter(x=>text(x.wkn||x.officialReference?.wkn)).length,
        rawReferenceValueLengthCounts:countBy(external.filter(x=>text(x.wkn||x.officialReference?.wkn)),r=>String(r.wkn||r.officialReference.wkn).length),
        standardSixCharacterValues:external.filter(x=>/^[A-Z0-9]{6}$/.test(String(x.wkn||x.officialReference?.wkn||''))).length,rawValuesNotSilentlyReformatted:true}),
    metadataField('ISSUER','UNKNOWN',[evidence('ETFHoldings.basics.fund_name is an umbrella trust name, not verified asset-manager identity')],'UNKNOWN',[],{issuerFamilyNameHintsAvailable:true,hintsAreLegalIssuerVerification:false}),
    metadataField('FUND_DOMICILE','NOT AVAILABLE',[],'UNKNOWN',[],{ISINPrefixIsNotDomicile:true}),
    metadataField('FUND_CURRENCY','NOT AVAILABLE',[],'UNKNOWN',[],{holdingCurrencyIsNotFundCurrency:true}),
    metadataField('TRADING_CURRENCY',listingRows.some(x=>x.history.uniqueBars)?'PARTIAL':'UNKNOWN',[evidence('EODBar.price_currency')],'PARTIAL',['OFFICIAL_EXCHANGE_TRADING_CURRENCY'],{sourceUnitsPreserved:true}),
    metadataField('UCITS_STATUS','NOT AVAILABLE',[],'UNKNOWN',[],{regulatoryStatusVerified:false,providerNameLabelCount:listingRows.filter(x=>/ucits/i.test(x.providerName||'')).length,nameLabelDoesNotVerifyRegulatoryStatus:true}),
    metadataField('INCEPTION_DATE','NOT AVAILABLE',[],'UNKNOWN',[],{officialFirstTradingDateIsNotInception:true}),
    ...['BENCHMARK','TER','OCF','EXPENSE_RATIO','AUM','ACCUMULATING_OR_DISTRIBUTING','REPLICATION_METHOD','PHYSICAL_OR_SYNTHETIC'].map(f=>metadataField(f,'NOT AVAILABLE',[])),
    metadataField('HOLDINGS',holding.length?'PARTIAL':'UNKNOWN',[evidence('ETFHoldings.output.holdings')],'UNKNOWN',[],{availableSampleCount:holding.length,staleSampleCount:holding.filter(x=>x.staleForCurrentPortfolio).length}),
    metadataField('FULL_HOLDINGS','UNKNOWN',[evidence('No completeness/freshness guarantee in inspected holdings payload')],'UNKNOWN',[],{fullHoldingsVerified:false}),
    metadataField('HOLDINGS_WEIGHTS',holding.length?'PARTIAL':'UNKNOWN',[evidence('ETFHoldingSecurity.percent_value')],'UNKNOWN',[],{units:'PERCENTAGE_POINTS',signedWeightsRetained:true}),
    metadataField('SECTOR_ALLOCATION','NOT AVAILABLE',[]),
    metadataField('COUNTRY_ALLOCATION',holding.length?'PARTIAL':'UNKNOWN',[evidence('Holding invested_country; aggregate portfolio allocation absent')],'UNKNOWN',[],{partialRawPositionCountryCodesOnly:true}),
    metadataField('ASSET_ALLOCATION',holding.length?'PARTIAL':'UNKNOWN',[evidence('Holding asset_category; aggregate portfolio allocation absent')],'UNKNOWN',[],{partialRawPositionCategoriesOnly:true}),
    metadataField('DIVIDEND_HISTORY',audit.dividendObservedSymbols.length?'PARTIAL':'UNKNOWN',[evidence('EODBar.dividend / generic dividends endpoint; coverage measured per ETF')],'UNKNOWN',[],{observedSymbols:audit.dividendObservedSymbols}),
    metadataField('HISTORICAL_PRICES',have.some(x=>x.history.uniqueBars)?'PARTIAL':'UNKNOWN',[evidence('EODBar; oldest price does not prove inception')],'UNKNOWN',[],{measuredListings:listingRows.filter(x=>x.history.uniqueBars).length}),
    ...['NAV','TRACKING_DIFFERENCE','TRACKING_ERROR'].map(f=>metadataField(f,'NOT AVAILABLE',[]))
  ];
  const supplementFields={ISSUER:['managerReported','fundLegalEntityReported'],FUND_DOMICILE:['legalStructureCountryReported'],FUND_CURRENCY:['fundCurrency'],BENCHMARK:['benchmarkDescriptionReported'],REPLICATION_METHOD:['replicationMethodReported'],PHYSICAL_OR_SYNTHETIC:['replicationMethodReported']};
  for(const field of matrix){
    const columns=supplementFields[field.field];if(!columns)continue;
    const matches=listingRows.filter(r=>columns.some(c=>r.officialFundMetadata?.[c]));
    if(matches.length){field.externalStatus='PARTIAL';field.externalEvidence=['SIX_OFFICIAL_ETF_EXPLORER_EXACT_IDENTITY_JOIN'];field.externalObservedListings=matches.length;field.externalFieldNames=columns;}
  }
  return {schemaVersion:'marketstack-etf-metadata-matrix-1.1.0',generatedAt:audit.generatedAt,sourceRuns:audit.sourceRuns,
    scope:'INSPECTED_SCHEMAS_AND_AUTHENTICATED_PAYLOADS_ONLY',metadataFieldCount:matrix.length,fields:matrix,
    coverageMatrix:buildETFRequestedMetadataMatrix(audit,matrix),
    unknownsRemainNull:true,noNameDerivedTEROrAUM:true,officialReferenceRoles:['ISIN','WKN','ASSET_TYPE','LISTING_STATUS','TRADING_CURRENCY','FIRST_LISTING_DATE_IF_PRESENT'],
    limitations:['Availability for one observed fund is not global coverage.','Official listing references do not independently establish fund domicile, UCITS regulatory authorization or legal issuer.']};
}
/** Availability is scoped to this inspected sample. A reported external value
 * remains separate from provider support and from verification of its meaning. */
export function buildETFRequestedMetadataMatrix(audit,fields){
  const status=s=>({'NOT AVAILABLE':'NONE',UNKNOWN:'UNVERIFIED',AVAILABLE:'AVAILABLE',PARTIAL:'PARTIAL'})[s]||'UNVERIFIED';
  const mapping={price_history:'HISTORICAL_PRICES',dividends:'DIVIDEND_HISTORY',holdings:'HOLDINGS',holding_weights:'HOLDINGS_WEIGHTS',ISIN:'ISIN',WKN:'WKN',issuer:'ISSUER',UCITS:'UCITS_STATUS',
    'TER/OCF':'TER',AUM:'AUM',benchmark:'BENCHMARK',distribution_policy:'ACCUMULATING_OR_DISTRIBUTING',replication:'REPLICATION_METHOD',domicile:'FUND_DOMICILE',sector_exposure:'SECTOR_ALLOCATION',country_exposure:'COUNTRY_ALLOCATION'};
  const notes={price_history:'Returned-window coverage only; quality-quarantined series and unverified adjustments are excluded from technical/Quant approval.',
    dividends:'Positive EOD dividend observations exist, but every observed dividend series is quarantined; zero verified clean ETF dividend histories.',
    holdings:'Fund-series reports only; completeness, current share-class portfolio and public filing availability are unverified.',
    holding_weights:'Signed reported percentage points retained; duplicates, missing identifiers and weight-total anomalies prevent full portfolio use.',
    ISIN:'European official exchange identity joins and some authenticated provider metadata; US flag-only listings have no assumed ISIN.',
    WKN:'Official Xetra raw national-reference identifier only; current values use a nine-character prefixed format, not independently normalized six-character WKN. No provider field inspected.',issuer:'SIX manager/fund-legal-name fields are reported labels, not verified legal issuer identities.',
    UCITS:'Name labels only; no verified regulatory authorization. Lack of a UCITS label does not prove non-UCITS.',
    'TER/OCF':'SIX ManagementFee remains a distinct reported field and is never converted into TER or OCF.',
    AUM:'Neither fund-series holding-value sums nor synthetic share-class AUM are permitted.',benchmark:'SIX reported benchmark description only; no verified regulatory benchmark identifier.',
    distribution_policy:'Accumulation/distribution name labels cannot substitute for structured verified policy.',replication:'SIX explicitly reported method on exact identities; no extrapolation to other funds.',
    domicile:'SIX legal-structure-country field is retained as reported; ISIN prefixes, venue and manager headquarters do not prove fund domicile.',
    sector_exposure:'No inspected structured sector allocation field.',country_exposure:'Partial raw holding country codes; no verified complete/current country allocation.'};
  const partial=audit.holdingsTests.filter(r=>r.state==='AVAILABLE_PARTIAL');
  const observedCounts={price_history:{listingsWithAtLeastOneAcceptedBar:audit.listings.filter(r=>r.assetType==='ETF'&&r.history.uniqueBars>0).length,
    nonquarantinedObservedSeries:audit.listings.filter(r=>r.assetType==='ETF'&&r.history.coverage==='PARTIAL').length,adjustmentsVerified:0},
    dividends:{positiveEODDividendObservations:audit.barDividendSamples.length,nonquarantinedVerifiedDividendSymbols:audit.dividendObservedSymbols.length},
    holdings:{endpointObservations:audit.holdingsTests.length,returnedPositionReports:audit.holdingsTests.filter(r=>r.holdingsLines>0).length,
      usablePartialReports:partial.length,freshWithin120Days:partial.filter(r=>r.staleForCurrentPortfolio===false).length,verifiedCompleteCurrentPortfolios:0},
    holding_weights:{reportedLines:partial.reduce((n,r)=>n+r.holdingsLines,0),missingWeightLines:partial.reduce((n,r)=>n+r.missingWeights,0),
      negativeWeightLines:partial.reduce((n,r)=>n+r.negativeWeightLines,0),totalWeightAnomalyReports:partial.filter(r=>r.anomalies.some(a=>a.code==='HOLDINGS_TOTAL_REQUIRES_REVIEW')).length}};
  return Object.entries(mapping).map(([field,sourceField])=>{
    const source=fields.find(r=>r.field===sourceField),providerStatus=status(source?.providerStatus),externalStatus=status(source?.externalStatus);
    let availability=providerStatus==='PARTIAL'||externalStatus==='PARTIAL'?'PARTIAL':providerStatus==='AVAILABLE'||externalStatus==='AVAILABLE'?'AVAILABLE':
      providerStatus==='NONE'?'NONE':'UNVERIFIED';
    if(field==='UCITS')availability='UNVERIFIED';
    return {field,status:availability,providerStatus,officialSupplementStatus:externalStatus,scope:'INSPECTED_SAMPLE_NOT_GLOBAL_GUARANTEE',
      sourceField,providerEvidence:source?.providerEvidence||[],officialSupplementEvidence:source?.externalEvidence||[],
      observedCounts:observedCounts[field]||{providerObservedListings:source?.providerObservedListings??null,officialObservedListings:source?.externalObservedListings??source?.officialObservedListings??source?.officialMatchedListings??null,
        ...(field==='WKN'?{rawReferenceValueLengthCounts:source?.rawReferenceValueLengthCounts,standardSixCharacterValues:source?.standardSixCharacterValues}:{} )},
      reliability:notes[field],productionEligibilityGranted:false};
  });
}
/** ISIN deduplication measures security/share-class identity, never unique
 * funds. Fund legal names, names of umbrella trusts, and tickers are not keys. */
export function buildETFIdentityCoverage(audit,{sourceAuditSHA256=null}={}){
  if(!Array.isArray(audit.listings)||audit.listingRecordsScope)throw new Error('Complete private ETF registry required for identity reconciliation');
  const rows=audit.listings.filter(r=>r.assetType==='ETF'),isUS=r=>r.officialReference?.source?.source_system==='NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY';
  if(audit.counts?.classifiedETFListings!==undefined&&audit.counts.classifiedETFListings!==rows.length)throw new Error('Complete private ETF registry count mismatch');
  const european=rows.filter(r=>r.officialReference&&!isUS(r)),us=rows.filter(isUS),other=rows.filter(r=>!r.officialReference);
  const officialGroups=new Map();
  for(const r of european){
    if(!r.isin)continue;
    const group=officialGroups.get(r.isin)||{isin:r.isin,identityScope:'ETF_SECURITY_OR_SHARE_CLASS_NOT_FUND',listingKeys:[],providerSymbols:[],mics:[],listingCountries:[],
      tradingCurrencies:[],activeListingKeys:[],inactiveListingKeys:[],statusUnknownListingKeys:[],UCITSNameLabelListingKeys:[],quarantinedListingKeys:[],sourceHashes:[]};
    group.listingKeys.push(r.key);group.providerSymbols.push(r.symbol);group.mics.push(r.mic);group.listingCountries.push(r.listingCountry);group.tradingCurrencies.push(r.tradingCurrency);
    group[r.active===true?'activeListingKeys':r.active===false?'inactiveListingKeys':'statusUnknownListingKeys'].push(r.key);
    if(r.UCITSNameLabel)group.UCITSNameLabelListingKeys.push(r.key);
    if(r.identityConflict)group.quarantinedListingKeys.push(r.key);
    group.sourceHashes.push(...(r.officialReference?.sourceHashes||[]),...(r.officialReference?.source?.sourceHashes||[]),r.officialReference?.source?.sha256);
    officialGroups.set(r.isin,group);
  }
  const shareClasses=[...officialGroups.values()].map(g=>Object.fromEntries(Object.entries(g).map(([k,v])=>[k,Array.isArray(v)?[...new Set(v.filter(Boolean))].sort():v]))).sort((a,b)=>a.isin.localeCompare(b.isin));
  const usable=audit.holdingsTests.filter(r=>r.state==='AVAILABLE_PARTIAL'),ucits=shareClasses.filter(r=>r.UCITSNameLabelListingKeys.length);
  const holdingsByRegion={};
  for(const report of audit.holdingsTests){
    const matches=rows.filter(r=>r.symbol===report.symbol),countries=new Set(matches.map(r=>r.listingCountry).filter(Boolean));
    const region=countries.size===1&&countries.has('US')?'US':countries.size===1?'EUROPEAN_LISTING':'UNKNOWN_OR_AMBIGUOUS';
    const group=holdingsByRegion[region]||{observations:0,returnedPositionReports:0,usablePartialReports:0,freshWithin120Days:0,verifiedCompleteCurrentPortfolios:0,symbols:[]};
    group.observations++;group.symbols.push(report.symbol);if(report.holdingsLines>0)group.returnedPositionReports++;
    if(report.state==='AVAILABLE_PARTIAL'){group.usablePartialReports++;if(report.staleForCurrentPortfolio===false)group.freshWithin120Days++;}
    holdingsByRegion[region]=group;
  }
  const listingRecords=rows.map(r=>({listingKey:r.key,providerSymbol:r.symbol,mic:r.mic,listingCountry:r.listingCountry||null,tradingCurrency:r.tradingCurrency||null,isin:r.isin||null,
    identityScope:isUS(r)?'CURRENT_US_PRIMARY_MIC_ETF_FLAG_CANDIDATE':r.officialReference?'OFFICIAL_EUROPEAN_ETF_LISTING_IDENTITY':'OTHER_PROVIDER_ROLE_CANDIDATE',
    legalFundIdentityVerified:false,identityConflict:r.identityConflict||null,active:r.active??null,UCITSNameLabel:r.UCITSNameLabel===true,
    UCITSNameLabelEvidence:r.UCITSNameLabel?{observedName:r.providerName||null,method:'UCITS_LABEL_IN_OBSERVED_NAME',regulatoryStatus:'UNVERIFIED'}:null,
    UCITSRegulatoryStatus:null,historyCoverage:r.history.coverage,holdingsCoverage:r.coverage.holdings,companyFundamentals:'NOT_APPLICABLE',productionActivated:false})).sort((a,b)=>a.listingKey.localeCompare(b.listingKey));
  return {schemaVersion:'marketstack-etf-identity-reconciliation-1.0.0',generatedAt:audit.generatedAt,sourceAuditSHA256,sourceRuns:audit.sourceRuns,newPaidCallsMadeByAudit:0,
    productionActivated:false,providerDecision:'DEFERRED',counts:{EuropeanOfficialETFListingCandidates:european.length,
      EuropeanDistinctISINSecurityOrShareClassCandidates:shareClasses.length,EuropeanListingCandidatesMissingISIN:european.filter(r=>!r.isin).length,
      EuropeanDistinctVenueISINCurrencyIdentities:new Set(european.map(r=>JSON.stringify([r.mic,r.isin||'UNKNOWN:'+r.symbol,r.tradingCurrency]))).size,
      EuropeanShareClassesOnMultipleVenues:shareClasses.filter(r=>r.mics.length>1).length,EuropeanShareClassesWithMultipleListingObservations:shareClasses.filter(r=>r.listingKeys.length>1).length,
      EuropeanShareClassesWithAnyKnownActiveListing:shareClasses.filter(r=>r.activeListingKeys.length).length,
      USExactPrimaryMICFlagListingCandidates:us.length,USIdentityAdmissibleFlagListingCandidates:us.filter(r=>!r.identityConflict).length,
      USFlagCandidatesWithObservedNonconflictingISIN:us.filter(r=>r.isin&&!r.identityConflict).length,
      USDistinctObservedNonconflictingISIN:new Set(us.filter(r=>r.isin&&!r.identityConflict).map(r=>r.isin)).size,
      otherProviderRoleCandidates:other.length,verifiedUniqueETFFunds:null,verifiedGlobalETFShareClassCount:null,
      EuropeanUCITSNameLabelListingCandidates:european.filter(r=>r.UCITSNameLabel).length,EuropeanUCITSNameLabelShareClassCandidates:ucits.length,
      regulatoryUCITSVerified:0,holdingsEndpointObservations:audit.holdingsTests.length,
      holdingsEndpointsWithAnyReturnedPositionData:audit.holdingsTests.filter(r=>r.holdingsLines>0).length,
      holdingsEndpointsWithAnyUsablePositionData:usable.length,
      partialHoldingsReports:usable.length,verifiedCompleteCurrentHoldings:0,
      observedDistinctFundSeriesWithPartialHoldings:new Set(usable.map(r=>r.fundSeriesId).filter(Boolean)).size},
    EuropeanCandidatesByListingCountry:countBy(european,r=>r.listingCountry),holdingsStates:countBy(audit.holdingsTests,r=>r.state),holdingsByRegion,
    holdingsReports:audit.holdingsTests.map(r=>({symbol:r.symbol,state:r.state,reason:r.reason||null,fundSeriesId:r.fundSeriesId||null,actualAsOf:r.actualAsOf||null,
      holdingsLines:r.holdingsLines??null,fullHoldingsVerified:false,sourceRunId:r.sourceRunId||null,sourceRunAttribution:r.sourceRunAttribution,
      responseSHA256:r.responseSHA256||null,requestParameters:r.requestParameters||{},publicAvailableAt:r.publicAvailableAt||null})),
    shareClasses,listingRecords,limitations:['ISIN security/share-class counts are not unique fund, umbrella fund or investment strategy counts.',
      'ETF flag roles do not verify US fund legal structure; unidentified US ISINs remain null.',
      'UCITS labels are an explicit unverified name-label estimate, not regulatory status or a complete UCITS census.',
      'Fund-series identifiers observed in a holdings sample do not identify the complete ETF universe.',
      'No API call, equity-fundamental inclusion, consumer activation or provider routing change is performed.']};
}
/** The full joined directory stays private. Public evidence contains its census
 * keys/counts and only bounded representatives or independently tested records. */
export function compactETFAudit(audit){
  const requestedHoldings=new Set(audit.holdingsTests.map(r=>r.symbol));
  const bounded=(rows,key)=>{const counts=new Map();return rows.filter(row=>{const k=key(row),count=counts.get(k)||0;counts.set(k,count+1);return count<3;});};
  return {...audit,fullRegistryListingCount:audit.listings.length,
    listingRecordsScope:'REPRESENTATIVE_OR_ENDPOINT_VALIDATED_OBSERVATIONS_ONLY',
    censusListingKeys:audit.listings.filter(r=>r.assetType==='ETF').map(r=>r.key),
    listings:audit.listings.filter(r=>r.representative||r.metadataObserved||r.history.requests.length||r.identityConflict||requestedHoldings.has(r.symbol)).map(r=>({...r,history:{...r.history,
      anomalyObservations:r.history.anomalies.length,anomalyCountsByReason:countBy(r.history.anomalies,a=>a.reason),
      anomalies:bounded(r.history.anomalies,a=>a.reason),anomalyRecordsScope:'AT_MOST_THREE_OBSERVATIONS_PER_REASON_FULL_COUNTS_PRESERVED'}})),
    barDividendObservationCountsBySymbol:countBy(audit.barDividendSamples,r=>r.symbol+'@'+r.mic),
    barDividendSamples:bounded(audit.barDividendSamples,r=>r.symbol+'@'+r.mic),barDividendRecordsScope:'AT_MOST_THREE_OBSERVATIONS_PER_LISTING_FULL_COUNTS_PRESERVED',
    completePrivateAuditReproducible:true,existingXetraClassificationArtifact:'reports/marketstack/marketstack_xetra_classified_candidates.json'};
}
export function buildETFReferenceJoins(audit){
  return {schemaVersion:'official-etf-reference-joins-1.0.0',generatedAt:audit.generatedAt,consumerEligibility:'NOT_GRANTED',productionActivated:false,
    sources:{officialInventories:audit.officialInventories,originalClassificationSources:audit.officialReferenceSources},
    rows:audit.listings.filter(r=>r.assetType==='ETF'&&r.officialReference&&!r.identityConflict&&r.officialReference.source?.source_system!=='NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY').map(r=>({symbol:officialMnemonic(r.symbol,r.mic),providerSymbol:r.symbol,
      mic:r.mic,isin:r.isin,tradingCurrency:r.tradingCurrency,assetType:'ETF',listingType:null,status:r.active===true?'ACTIVE':r.active===false?'INACTIVE':'UNKNOWN',
      sourceId:r.officialReference.source?.source_system||r.officialReference.sourceId||r.classificationSource,
      sourceReference:r.officialReference,issuerCountry:null,reportingCurrency:null,holdingsCoverage:r.coverage.holdings,historyCoverage:r.coverage.history}))};
}
/** Delivery completeness measures the requested API window, not inception
 * history, corporate-action correctness or acceptance by the quality gates. */
export function summarizeETFFollowUp(endpoints){
  const follow=endpoints.filter(e=>String(e.label||'').startsWith('etf-audit-')&&!e.seeded),windows=new Map();
  for(const e of follow.filter(e=>endpointOf(e)==='eod')){
    const key=JSON.stringify([e.params?.symbols,e.params?.exchange,e.params?.date_from,e.params?.date_to]);
    const w=windows.get(key)||{symbol:e.params?.symbols,mic:e.params?.exchange,requestedFrom:e.params?.date_from,requestedTo:e.params?.date_to,pages:[],uniqueCandleKeys:new Set()};
    const rows=rowsOf(e);for(const row of rows)w.uniqueCandleKeys.add(JSON.stringify([row.symbol,row.exchange,row.date]));
    w.pages.push({offset:e.data?.pagination?.offset??e.params?.offset??0,total:e.data?.pagination?.total??null,count:rows.length,ok:e.ok});windows.set(key,w);
  }
  const historyWindows=[...windows.values()].map(w=>{
    const pages=[...w.pages].sort((a,b)=>a.offset-b.offset),totals=new Set(pages.map(p=>p.total));let cursor=0,contiguous=true;
    for(const page of pages){if(!page.ok||page.offset!==cursor)contiguous=false;cursor=page.offset+page.count;}
    const total=totals.size===1?pages[0]?.total:null,rawRows=pages.reduce((n,p)=>n+p.count,0);
    return {symbol:w.symbol,mic:w.mic,requestedFrom:w.requestedFrom,requestedTo:w.requestedTo,pages:pages.length,reportedTotal:total,rawRows,uniqueCandleKeys:w.uniqueCandleKeys.size,
      requestedWindowDelivered:contiguous&&Number.isInteger(total)&&rawRows===total&&cursor===total&&w.uniqueCandleKeys.size===total,fullInceptionHistoryVerified:false};
  });
  const holdings=follow.filter(e=>endpointOf(e)==='etfholdings');
  return {newMetadataResponsesObserved:follow.filter(e=>endpointOf(e).startsWith('tickers/')).length,newHoldingsRequestsObserved:holdings.length,
    newHoldingsHTTPResponseSuccess:holdings.filter(e=>e.ok).length,newHoldingsTransportFailureReasons:countBy(holdings.filter(e=>!e.ok),e=>e.reason),
    newHistoryPageResponses:historyWindows.reduce((n,w)=>n+w.pages,0),newHistoryWindows:historyWindows.length,
    newHistoryRawRows:historyWindows.reduce((n,w)=>n+w.rawRows,0),newHistoryWindowsDelivered:historyWindows.filter(w=>w.requestedWindowDelivered).length,historyWindows};
}
export function renderETFAuditMarkdown(audit,matrix){
  const c=audit.counts,available=audit.holdingsTests.filter(r=>r.state==='AVAILABLE_PARTIAL');
  const country=Object.entries(audit.officialMatchedETFsByListingCountry).map(([country,n])=>`| ${country} | ${n} |`).join('\n');
  const holdings=audit.holdingsTests.map(r=>`| ${r.symbol} | ${r.state} | ${r.reason||r.reportDate||'UNKNOWN'} | ${r.holdingsLines??'—'} |`).join('\n');
  const f=audit.measuredFollowUp,q=audit.holdingsQuality,u=audit.USListingCensus;
  const identity=buildETFIdentityCoverage(audit).counts;
  const identitySection=`## Listing, share-class and fund reconciliation\n\nThe complete machine artifact marketstack_etf_identity_reconciliation.json reconciles every candidate listing. Its ${identity.EuropeanDistinctISINSecurityOrShareClassCandidates} distinct European ISINs identify securities or share classes, not unique funds. ${identity.EuropeanShareClassesOnMultipleVenues} of those ISINs occur on more than one venue and ${identity.EuropeanShareClassesWithAnyKnownActiveListing} have at least one explicitly active official listing. A unique ETF fund total remains NULL because the available legal fund/share-class mappings do not cover the universe. US flag-only records supply ${identity.USDistinctObservedNonconflictingISIN} distinct nonconflicting observed ISINs and leave the remaining identifiers unknown; ticker and similar fund names are never used to combine funds.\n\n${identity.EuropeanUCITSNameLabelListingCandidates} European listing candidates (${identity.EuropeanUCITSNameLabelShareClassCandidates} distinct ISINs) contain an explicit UCITS name label. This is an unverified name-label estimate, with zero independently verified regulatory UCITS authorizations; the remaining candidates cannot be classified as non-UCITS from absence of that label. ${identity.holdingsEndpointsWithAnyUsablePositionData}/${identity.holdingsEndpointObservations} tested holdings endpoints return usable position data, all partial; zero complete current portfolios are verified. The requested 16-field matrix in marketstack_etf_metadata_matrix.json uses AVAILABLE / PARTIAL / NONE / UNVERIFIED and keeps provider fields separate from official supplements.\n\n`;
  const us=u.officialInventory?`The complete current US primary directory contains ${u.officialInventory.ETFflagY} ETF-flagged records. Excluding ${u.officialInventory.ETNFlaggedRowsExcluded} explicitly named ETNs and ${u.officialInventory.testSymbolsExcluded} test symbols leaves ${u.officialInventory.ETFRoleRows} flag-role candidates; ${u.officialInventory.ETFRoleUnknownMICRows} retain unknown MIC. Exact symbol/current-MIC matches total ${u.exactSymbolAndMICMatches}, of which ${u.identityAdmissibleCandidates} have no observed provider identity/type conflict. ${u.officialFlagRoleKnownMICRowsWithoutExactDirectoryMatch} have no exact match in the measured current-MIC directories. Missing directory matches do not prove provider price unavailability. BATS venue normalization remains unresolved; its provider directory contains one symbol while the official flag cohort includes ${u.officialInventory.ETFRoleCountsByMIC.BATS||0} listings.`:'No complete US official-flag census was supplied.';
  const metadata=matrix.fields.map(r=>`| ${r.field} | ${r.providerStatus} | ${r.externalStatus} |`).join('\n');
  const requestedMetadata=matrix.coverageMatrix.map(r=>`| ${r.field} | ${r.status} | ${r.providerStatus} | ${r.officialSupplementStatus} |`).join('\n');
  return `# Marketstack scale ETF audit\n\nGenerated from measured evidence as of ${audit.generatedAt}. The audit performs zero API calls and does not activate listings or change Tiingo, equity fundamentals, provider routing or product eligibility.\n\n${identitySection}## Universe evidence\n\n${c.officialMatchedETFListings} European provider listing candidates have an exact official ETF identity/classification reference (${c.officialMatchedUniqueETFISIN} distinct ISINs; ${c.officialMatchedUniqueListingIdentities} distinct venue/ISIN/trading-currency identities). Separately, ${c.officialFlagUSMatchedETFListingCandidates} US listing candidates match the NasdaqTrader ETF flag and exact primary MIC; that flag does not independently verify ETF fund legal structure. The combined candidate registry contains ${c.classifiedETFListings} ETF-role records with these different confidence levels, including the European official matched subset above. No verified global ETF total is asserted. Across that full cohort, ${c.activeKnownETFListings} listings have verified active reference status, ${c.inactiveKnownETFListings} have verified inactive status, and ${c.statusUnknownETFListings} retain UNKNOWN status. These are bounded observed candidates, not a complete global ETF universe or unique fund count.\n\n| Listing country | Official matched ETF candidates |\n| --- | ---: |\n${country}\n\nThe current NasdaqTrader directory supplies explicit ETF flags and primary MICs for the US; explicit ETN descriptions and test symbols are excluded, other possible ETP/ETC legal structures remain unresolved, unknown MICs stay unresolved, and trading status, currency and ISIN are never assumed. Provider directory/metadata conflicts remain quarantined. Its current listing presence is independent of price or holdings validation. The Xetra T7 reference, the explicit SIX ETF Explorer records and Euronext filtered ETF/ACTIVE ETF/STRUCTURED ETF JSON responses supply independent type evidence. Euronext's unfiltered tracker CSV mixes products; its GET filter parameters returned identical mixed payloads and cannot establish ETF type. Italy's official ETFplus MIC ETFP is kept separate from the provider's XMIL directory. Swiss repeated symbols with multiple currency lines remain ambiguous unless an existing verified identity disambiguates them.\n\nThe provider etflist endpoint is contaminated by common equities and is never an asset-type authority. Xetra-Gold remains ETC and is excluded from ETF/company admission. ${c.knownIssuerFamilyNameHintGroups} recognized issuer-family name-hint groups are represented; legal issuer and UCITS authorization are not inferred from names or ISIN prefixes.\n\n## US official-flag candidate census\n\n${us}\n\nUS flag-role records remain separate from European official type/ISIN matches. Possible other ETP/ETC structures and note-related name hints require legal-source review; weak names never remove otherwise valid funds. The audit guesses no US ISIN or trading currency and grants no product activation.\n\n## Prices and actions\n\n${c.providerObservedETFListings} classified ETF listings have a listing-level metadata or price endpoint response; ${c.ETFListingsWithMeasuredHistory} have at least one valid returned OHLC bar. ${c.historyQuarantinedListings} history series require review for invalid raw/adjusted OHLC, contradictory observations, or identity violations. These stricter OHLC gates do not rewrite the existing close-chart ingestion behavior. Entire series retain quarantine status when an identity or same-date contradiction exists. The bounded follow-up returned ${f.newHistoryWindows} requested windows in ${f.newHistoryPageResponses} pages (${f.newHistoryRawRows} raw rows); ${f.newHistoryWindowsDelivered} have complete, distinct paginated delivery. Delivery does not establish usable OHLC, full inception history, verified corporate-action adjustments or global realtime coverage. Only ${audit.historyQuality.cleanObservedSeries.length} observed series (${audit.historyQuality.cleanObservedSeries.map(r=>r.symbol).join(', ')||'none'}) pass the strict sampled-series OHLC/currency/identity gates, and corporate-action adjustment verification remains absent.\n\nA dividend response is verified only when its returned listing identity, date and currency agree. Generic dividends lacking venue/currency remain unverified; positive EOD dividends are retained as source observations under the normalized identity. No dividend amounts or raw OHLC are published in this audit.\n\n## Holdings\n\n| Symbol | Measured state | Reason or report date | Holding lines |\n| --- | --- | --- | ---: |\n${holdings}\n\n${available.length} holdings observations are usable as partial fund-series reports; ${c.holdingsSamplesStaleAtAudit} are stale for current portfolio analysis. ${c.holdingsSamplesWithinFreshnessThreshold} reports meet the explicit 120-day freshness threshold (${q.withinFreshnessThresholdSymbols.join(', ')||'none'}); no current complete ETF share-class portfolio has been verified. ${q.requestSucceeded} HTTP-success observations include domain-level no-data responses and must not be counted as usable portfolios. ${q.usablePartialHoldingLines} reported holding lines contain ${q.exactDuplicateLines} exact duplicates, ${q.negativeWeightLines} negative weights, ${q.cashOrCollateralLines} cash/collateral legs and ${q.derivativeLines} explicit derivative-category legs. ${q.holdingsTotalReviewSymbols.length} total-weight anomalies remain uncorrected (${q.holdingsTotalReviewSymbols.join(', ')||'none'}); categories and accounting methodology can also affect totals. Signed derivative positions, cash/collateral legs, missing identifiers and exact duplicate anomalies remain visible. A repeated ISIN alone does not authorize deduplication. Portfolio values are never synthesized into share-class AUM. SEC Form N-PORT and its official version 1.13 XML schema define repPdDate as the actual holdings as-of date and repPdEnd as fiscal year-end. Marketstack date_report_period therefore supplies actualAsOf; end_report_period is retained as fundFiscalYearEnd, even when future. Legacy period fields remain compatible but are not reporting-period boundaries. Report/signature/retrieval dates do not establish SEC public acceptance or point-in-time availability. See https://www.sec.gov/files/formn-port.pdf and https://www.sec.gov/files/edgar/filer-information/specifications/edgar-form-n-port-xml-tech-spec-113.zip.\n\n## Metadata availability\n\nProvider and external-reference availability are separate. SIX reports structured manager/fund legal names, fund currency, legal-structure country, benchmark description and replication fields for matched identities. Its ManagementFee field remains ManagementFee; it is not converted into TER, OCF or expense ratio. Official WKN reference values retain their original source format; raw-value lengths and standard six-character value counts are published in the matrix, with no silent reformatting. UCITS regulatory status, AUM, NAV, tracking difference/error and regulatory inception remain unknown unless separately evidenced.\n\n| Field | Marketstack | Official external supplement |\n| --- | --- | --- |\n${metadata}\n\n### Requested coverage matrix\n\nScope is the inspected sample. PARTIAL does not authorize product activation; the machine matrix records quality counts and semantic limitations for each field.\n\n| Field | Combined observed support | Marketstack | Official supplement |\n| --- | --- | --- | --- |\n${requestedMetadata}\n\n## Request controls and reproduction\n\nThe bounded follow-up plan selects ${audit.holdingsRequestPlan.requestedUnique} new unique holdings requests, at most ${audit.holdingsRequestPlan.maximumCreditsNoRetry} conservatively reserved credits before retries (none planned). Its non-US failure circuit breaker prevents repeated unavailable aliases. Cached checkpoint observations are deduplicated; ${audit.reusedObservationsDeduplicated} reused observations were excluded from independent sample counts. The primary ingestion workflow reports reserved request attempts and conservative estimated credits; provider billing and account balance were not independently measured. The provider decision remains DEFERRED; this follow-up selects none of A/B/C/D and changes no routing.\n\nUse scripts/market/audit-marketstack-etfs.mjs with repeat --probe=private-probe.json, --reference=normalized-t7-references.json, --six-reference=six-etfs-reference.json, --us-reference=current-NasdaqTrader-directory.json, and --euronext-page=filtered-reference-page.json. Public outputs contain census keys, aggregate counts and bounded observed/representative validations. --private-full-out=private-working-path writes the full joined audit; --joined-reference-out=private-working-path exports exact typed references for existing universe gates. --markdown-out=docs/MARKETSTACK_SCALE_ETF_AUDIT.md regenerates this report. No source directory or raw provider response is added to frontend payloads.\n`;
}
export function buildETFAudit({classification,plan,probes=[],asOf='2026-10-01',officialReferences=[],providerSuffixesByMIC={XETR:['.DE'],XFRA:['.XFRA','.F']}}){
  if(!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==date(asOf))throw new Error('Calendar-valid audit date required');
  const registry=new Map(),endpoints=[],sourceRuns=[],snapshotRuns=[],unexpectedETFLabels=[];
  function register(row){const key=row.symbol+'@'+row.mic;const existing=registry.get(key);registry.set(key,{...existing,...row,key,history:existing?.history||{uniqueBars:0,requests:[],anomalies:[]},metadataObserved:existing?.metadataObserved||false});return registry.get(key);}
  for(const r of classification.candidates||[]){if(r.assetType!=='ETF')continue;register({symbol:r.providerSymbol,mic:r.mic,assetType:'ETF',providerName:r.providerName,isin:r.isin,wkn:r.wkn,tradingCurrency:normalizeCurrency(r.tradingCurrency),listingCountry:r.listingCountry,
    active:r.officialStatus==='ACTIVE',assetTypeVerified:true,classificationSource:r.referenceSourceId,officialReference:{sourceId:r.referenceSourceId,isin:r.isin,wkn:r.wkn,currency:r.tradingCurrency,instrumentType:r.officialInstrumentType},consumerEligibility:'NOT_GRANTED',productionActivated:false});}
  for(const r of plan.existingValidatedListings||[]){const existing=registry.get(r.symbol+'@'+r.mic);register({symbol:r.symbol,mic:r.mic,assetType:'ETF',assetTypeVerified:true,classificationSource:r.source,tradingCurrency:normalizeCurrency(r.tradingCurrency),expectedCurrencySource:r.tradingCurrencySource,isin:existing?.isin||null,officialReference:existing?.officialReference||null,consumerEligibility:'NOT_GRANTED',productionActivated:false});}
  for(const r of plan.representatives||[]){const existing=registry.get(r.symbol+'@'+r.mic);register({symbol:r.symbol,mic:r.mic,assetType:r.classification.startsWith('ETC_')?'ETC':existing?.assetType||'UNKNOWN',providerName:r.name||existing?.providerName||null,isin:r.isin||existing?.isin||null,tradingCurrency:normalizeCurrency(r.tradingCurrency||r.catalogCurrency||existing?.tradingCurrency),listingCountry:r.region==='US'?'US':r.region==='GB'?'GB':r.region==='CH'?'CH':existing?.listingCountry||null,
    assetTypeVerified:existing?.assetTypeVerified||r.classification.startsWith('ETC_'),classificationSource:existing?.classificationSource||r.classificationSource,officialReference:existing?.officialReference||null,representative:true,consumerEligibility:'NOT_GRANTED',productionActivated:false});}
  const observationKeys=new Set();let reusedObservationsDeduplicated=0;
  for(const probe of probes){const snapshot=probe.run||null;if(snapshot)snapshotRuns.push({...snapshot,role:'CONTAINER_METADATA_NOT_RESPONSE_ORIGIN'});for(const e of probe.endpoints||[]){
    const key=JSON.stringify([endpointOf(e),e.params,e.checkedAt||e.retrievedAt,e.ok,e.reason,createHash('sha256').update(JSON.stringify(e.data??null)).digest('hex')]);
    if(observationKeys.has(key)){reusedObservationsDeduplicated++;continue;}
    observationKeys.add(key);
    const provenance=probeResponseProvenance(e,probe);
    const sourceRunId=provenance.sourceRunId,sourceRunAttribution=provenance.sourceRunAttribution;
    const sourceRun=sourceRunId?{runId:sourceRunId,attribution:sourceRunAttribution}:null;
    if(sourceRun&&!sourceRuns.some(r=>r.runId===sourceRunId))sourceRuns.push(sourceRun);
    endpoints.push({...e,sourceRunId,sourceRunAttribution,sourceRun});
  }}
  const officialInventories=[],officialJoinEvidence=[],supplementJoinAnomalies=[];
  const providerDirectory=new Set(),providerDirectoryRows=new Map();
  for(const e of endpoints){const mic=endpointOf(e).match(/^exchanges\/([^/]+)\/tickers$/)?.[1];if(!mic||!e.ok)continue;
    for(const r of Array.isArray(e.data?.data?.tickers)?e.data.data.tickers:rowsOf(e))if(r.symbol&&(!r.stock_exchange?.mic||r.stock_exchange.mic===mic)){
      const key=r.symbol+'@'+mic;providerDirectory.add(key);const rows=providerDirectoryRows.get(key)||[];rows.push(r);providerDirectoryRows.set(key,rows);
    }
  }
  const namespaceIndex=new Map();
  for(const key of new Set([...providerDirectory,...registry.keys()])){
    const split=key.lastIndexOf('@'),symbol=key.slice(0,split),mic=key.slice(split+1),namespace=mic+'@'+officialMnemonic(symbol,mic),values=namespaceIndex.get(namespace)||new Set();
    values.add(symbol);namespaceIndex.set(namespace,values);
  }
  for(const ref of officialReferences){
    if(ref.officialInventory)officialInventories.push({...ref.officialInventory,source:ref.source});
    const indexed=new Map();for(const r of ref.rows||[]){
      const symbols=r.symbol?[r.symbol]:[...(namespaceIndex.get(r.mic+'@'+r.exchangeSymbol)||[])];
      if(symbols.length>1){supplementJoinAnomalies.push({mic:r.mic,exchangeSymbol:r.exchangeSymbol,reason:'AMBIGUOUS_PROVIDER_SYMBOL_NAMESPACE',providerSymbols:symbols});continue;}
      for(const symbol of symbols){const key=symbol+'@'+r.mic;const rows=indexed.get(key)||[];rows.push({...r,symbol});indexed.set(key,rows);}
    }
    for(const [key,rows] of indexed){
      let listing=registry.get(key);if(!listing&&!providerDirectory.has(key))continue;
      if(ref.source?.source_system==='NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY'&&!providerDirectory.has(key))continue;
      const matches=rows.filter(r=>(!listing?.isin||r.isin===listing.isin)&&(!listing?.tradingCurrency||!r.tradingCurrency||normalizeCurrency(r.tradingCurrency)===listing.tradingCurrency));
      if(matches.length!==1){supplementJoinAnomalies.push({key,reason:matches.length?'AMBIGUOUS_OFFICIAL_SUPPLEMENT_IDENTITY':'OFFICIAL_SUPPLEMENT_IDENTITY_CONFLICT',officialRows:rows.length});continue;}
      const r=matches[0];if(listing?.assetType==='ETC'||listing?.assetType==='ETN')continue;
      listing=register({...listing,symbol:r.symbol,mic:r.mic,assetType:r.assetType||listing?.assetType||'UNKNOWN',
        assetTypeVerified:r.assetType==='ETF'||listing?.assetTypeVerified,isin:r.isin||listing?.isin||null,
        tradingCurrency:normalizeCurrency(r.tradingCurrency)||listing?.tradingCurrency||null,providerName:listing?.providerName||r.officialName,
        listingCountry:r.listingCountry||listing?.listingCountry,active:r.active??listing?.active??null,listingStatus:r.listingStatus||listing?.listingStatus||null,
        officialReference:{...listing?.officialReference,source:ref.source,isin:r.isin,instrumentType:r.officialInstrumentType,officialTypeEvidence:r.officialTypeEvidence||null},
        officialFundMetadata:r.officialFundMetadata||listing?.officialFundMetadata,classificationSource:'EXACT_OFFICIAL_SUPPLEMENT_SYMBOL_MIC_JOIN',consumerEligibility:'NOT_GRANTED',productionActivated:false});
      if(ref.source?.source_system==='NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY'){
        const observed=providerDirectoryRows.get(key)||[],conflicts=observed.filter(row=>row.item_type&&assetType(row.item_type)==='equity'||
          /\b(?:common stock|ordinary shares|exchange[- ]traded notes?|ETNs?|warrants?|preferred stock)\b/i.test(row.name||'')&&!/\bETF\b/i.test(row.name||''));
        if(conflicts.length){listing.identityConflict='PROVIDER_DIRECTORY_OFFICIAL_ETF_ROLE_CONFLICT';listing.providerDirectoryConflictEvidence=conflicts.map(row=>({name:row.name||null,itemType:row.item_type||null}));}
      }
    }
  }
  for(const reference of officialReferences){
    for(const master of reference.masters||[]){
      officialInventories.push({mic:master.mic,sourceLastUpdate:master.updatedAt,rows:master.rows.length,
        activeETFs:master.rows.filter(r=>r.active&&r.assetType==='ETF').length,
        activeETCs:master.rows.filter(r=>r.active&&r.assetType==='ETC').length,
        activeETNs:master.rows.filter(r=>r.active&&r.assetType==='ETN').length,
        providerCoverageProven:false,sources:reference.sources||[]});
      const suffixes=providerSuffixesByMIC[master.mic];if(!suffixes)continue;
      const directory=collectGermanDirectoryPages(endpoints,[master.mic])[0];
      const joined=classifyGermanDirectory(directory,master.rows,{listingCountry:'DE',providerSuffixes:suffixes});
      officialJoinEvidence.push({mic:master.mic,providerSuffixes:suffixes,directoryComplete:joined.directoryComplete,counts:joined.counts,source:directory.source});
      for(const candidate of joined.listings){
        if(candidate.status!=='CLASSIFIED_CANDIDATE'||candidate.assetType!=='ETF')continue;
        const r=candidate.referenceIdentity;
        register({symbol:candidate.providerSymbol,mic:master.mic,assetType:'ETF',providerName:candidate.providerNames[0]||r.officialName,
          isin:r.isin,wkn:r.wkn,tradingCurrency:normalizeCurrency(r.tradingCurrency),listingCountry:'DE',active:r.active,
          assetTypeVerified:true,classificationSource:'EXACT_OFFICIAL_MIC_MNEMONIC_JOIN',
          officialReference:{...r,sourceHashes:(reference.sources||[]).map(s=>s.sha256).filter(Boolean),sourceLastUpdate:master.updatedAt},consumerEligibility:'NOT_GRANTED',productionActivated:false});
      }
    }
  }
  // Observed provider classification can establish a candidate's type, never
  // override an official ETC/ETN classification or a contradictory official ISIN.
  for(const e of endpoints){const endpoint=endpointOf(e);if(!e.ok||!/^tickers\/[^/]+$/.test(endpoint))continue;const m=metadataOf(e);if(!m)continue;
    const symbol=lookupSymbol(e),exchanges=m.stock_exchanges||(m.stock_exchange?[m.stock_exchange]:[]);const mic=exchanges[0]?.mic||exchanges[0]?.exchange_mic||null;
    if(!symbol||!mic)continue;let listing=registry.get(symbol+'@'+mic);
    if(!listing&&assetType(m.item_type||m.asset_type)==='etf')unexpectedETFLabels.push({symbol,mic,endpoint,reason:'OUTSIDE_CLASSIFIED_OR_DISCOVERED_CANDIDATE_SCOPE'});
    if(!listing){const candidates=[...registry.values()].filter(r=>r.symbol===symbol&&r.assetType==='ETF'&&r.officialReference);
      if(candidates.length===1&&candidates[0].mic!==mic){const candidate=candidates[0];candidate.identityConflict='PROVIDER_METADATA_VENUE_MISMATCH';candidate.metadataObserved=true;candidate.metadataObservation=observation(e,e.sourceRun);candidate.metadataResponseIdentity={symbol:m.symbol||null,mic,isin:m.isin||null,itemType:m.item_type||m.asset_type||null,name:m.name||null};}continue;
    }
    listing.metadataObserved=true;listing.metadataObservation=observation(e,e.sourceRun);listing.providerISIN=m.isin||null;
    listing.metadataResponseIdentity={symbol:m.symbol||null,mic,isin:m.isin||null,itemType:m.item_type||m.asset_type||null,name:m.name||null};
    if(m.symbol!==symbol){listing.identityConflict='PROVIDER_SYMBOL_MISMATCH';continue;}
    listing.metadataType=m.item_type||m.asset_type||null;if(listing.isin&&m.isin&&listing.isin!==m.isin){listing.identityConflict='ISIN_MISMATCH';continue;}
    if(listing.assetType==='ETC'&&assetType(listing.metadataType)==='etf'){listing.identityConflict='PROVIDER_ETF_OFFICIAL_ETC_CONFLICT';continue;}
    listing.providerName=m.name||listing.providerName;
    if(assetType(listing.metadataType)==='etf'){listing.assetType='ETF';listing.assetTypeVerified=true;listing.isin=listing.isin||m.isin||null;}
    else if(listing.metadataType&&listing.assetType==='ETF'){listing.identityConflict='PROVIDER_TYPE_OFFICIAL_ETF_CONFLICT';}
  }
  const barSeen=new Map(),barDividendSamples=[];
  for(const e of endpoints){const endpoint=endpointOf(e);if(!e.ok||!(endpoint==='eod'||endpoint.startsWith('eod/')))continue;
    for(const row of rowsOf(e)){const key=row.symbol+'@'+row.exchange;let listing=registry.get(key);
      if(!listing&&assetType(row.asset_type)==='etf')unexpectedETFLabels.push({symbol:row.symbol,mic:row.exchange,endpoint,date:date(row.date),reason:'OUTSIDE_CLASSIFIED_OR_DISCOVERED_CANDIDATE_SCOPE'});
      if(!listing)continue;listing.providerName=listing.providerName||row.name||null;
      if(listing.assetType==='UNKNOWN'&&assetType(row.asset_type)==='etf'){listing.assetType='ETF';listing.assetTypeVerified=true;listing.classificationSource='AUTHENTICATED_EOD_ASSET_TYPE_WITH_CATALOG_CANDIDATE';}
      const requestKey=JSON.stringify([endpoint,e.params,e.sourceRun?.runId]);if(!listing.history.requests.some(r=>r.key===requestKey))listing.history.requests.push({key:requestKey,...observation(e,e.sourceRun),requestedFrom:e.params?.date_from||null,requestedTo:e.params?.date_to||null,paginationTotal:e.data?.pagination?.total??e.pagination?.total??null});
      if(listing.assetType!=='ETF')continue;
      if(row.asset_type&&assetType(row.asset_type)==='equity')listing.identityConflict='PROVIDER_PRICE_TYPE_OFFICIAL_ETF_CONFLICT';
      if(listing.identityConflict){listing.history.anomalies.push({date:date(row.date),reason:'IDENTITY_CONFLICT',identityConflict:listing.identityConflict});continue;}
      if(!listing.tradingCurrency){listing.history.anomalies.push({date:date(row.date),reason:'EXPECTED_TRADING_CURRENCY_UNVERIFIED'});continue;}
      const checked=normalizeBar(listing.key,row,expectedIdentity(listing),{retrievedAt:e.retrievedAt,adjustmentVerified:false});
      if(!checked.ok){listing.history.anomalies.push({date:date(row.date),reason:checked.reason,providerCurrency:row.price_currency||null,expectedCurrency:listing.tradingCurrency});continue;}
      if(checked.bar.dividend>0)barDividendSamples.push({symbol:listing.symbol,mic:listing.mic,date:checked.bar.date,currency:checked.bar.currency,positiveDividendObserved:true,state:'VERIFIED_EOD_IDENTITY',...observation(e,e.sourceRun)});
      const previous=barSeen.get(key)||new Map(),prior=previous.get(checked.bar.date);
      if(prior&&(['open','high','low','close','volume','currency','splitFactor','dividend'].some(field=>prior[field]!==checked.bar[field])||JSON.stringify(prior.adjustmentObservation)!==JSON.stringify(checked.bar.adjustmentObservation))){
        const values=b=>Object.fromEntries(['open','high','low','close','volume','currency','splitFactor','dividend','adjustmentObservation'].map(field=>[field,b[field]]));
        listing.history.anomalies.push({date:checked.bar.date,reason:'CONTRADICTORY_SAME_DATE_OBSERVATIONS',
          changedFields:Object.keys(values(prior)).filter(field=>JSON.stringify(prior[field])!==JSON.stringify(checked.bar[field])),
          previous:{valueHash:createHash('sha256').update(JSON.stringify(values(prior))).digest('hex'),observation:prior.auditObservation},
          current:{valueHash:createHash('sha256').update(JSON.stringify(values(checked.bar))).digest('hex')},observation:observation(e,e.sourceRun)});
        continue;
      }
      previous.set(checked.bar.date,{...checked.bar,auditObservation:observation(e,e.sourceRun)});barSeen.set(key,previous);
    }
  }
  for(const listing of registry.values()){
    const bars=[...(barSeen.get(listing.key)?.values()||[])].sort((a,b)=>a.date.localeCompare(b.date));listing.history.uniqueBars=bars.length;listing.history.firstObservedDate=bars[0]?.date||null;listing.history.lastObservedDate=bars.at(-1)?.date||null;
    listing.history.adjustmentVerification='UNVERIFIED';listing.history.coverage=listing.identityConflict||listing.history.anomalies.some(x=>x.reason!=='EXPECTED_TRADING_CURRENCY_UNVERIFIED')?'QUARANTINED':bars.length?'PARTIAL':'UNKNOWN';listing.coverage={history:listing.history.coverage,holdings:listing.identityConflict?'QUARANTINED':'UNKNOWN',fundamentals:'NOT_APPLICABLE',realtime:'UNKNOWN'};
    listing.issuerFamilyHint=issuerFamilyHint(listing.providerName);listing.issuerLegalEntity=null;listing.fundDomicile=null;listing.fundCurrency=null;listing.UCITSRegulatoryStatus=null;listing.categoryNameHints=categoryHints(listing.providerName);listing.UCITSNameLabel=/ucits/i.test(listing.providerName||'');
  }
  const holdingsTests=[],dividendSymbols=new Set(barDividendSamples.filter(x=>registry.get(x.symbol+'@'+x.mic)?.history.coverage!=='QUARANTINED').map(x=>x.symbol)),dividendTests=[];
  for(const e of endpoints){const ep=endpointOf(e),symbol=lookupSymbol(e);if(ep==='dividends'&&e.ok){
      const candidates=[...registry.values()].filter(x=>x.symbol===symbol&&x.assetType==='ETF');
      if(!candidates.length)continue;
      for(const row of rowsOf(e)){
        if(!(Number(row.dividend)>0))continue;
        const listing=candidates.length===1?candidates[0]:null,actionDate=date(row.date),currency=normalizeCurrency(row.currency||row.price_currency),mic=row.exchange||row.mic;
        const reason=!listing?'AMBIGUOUS_OR_UNKNOWN_LISTING':listing.identityConflict?'IDENTITY_CONFLICT':row.symbol!==listing.symbol?'SYMBOL_MISMATCH':mic&&mic!==listing.mic?'VENUE_MISMATCH':!actionDate?'INVALID_DATE':
          e.params?.date_from&&actionDate<e.params.date_from||e.params?.date_to&&actionDate>e.params.date_to?'OUTSIDE_REQUESTED_DATE_RANGE':!mic?'VENUE_NOT_PROVIDED':!currency?'CURRENCY_NOT_PROVIDED':currency!==listing.tradingCurrency?'CURRENCY_MISMATCH':null;
        dividendTests.push({...observation(e,e.sourceRun),symbol:row.symbol||null,requestedSymbol:symbol,date:actionDate,mic:mic||null,currency,state:reason?'UNVERIFIED':'VERIFIED',reason});
        if(!reason)dividendSymbols.add(listing.symbol);
      }
    }
    if(ep!=='etfholdings'||!symbol)continue;const listingCandidates=[...registry.values()].filter(x=>x.symbol===symbol&&x.assetType==='ETF');
    if(!listingCandidates.length){holdingsTests.push({symbol,state:'IDENTITY_UNRESOLVED',...observation(e,e.sourceRun)});continue;}
    if(listingCandidates.length>1){holdingsTests.push({symbol,state:'AMBIGUOUS_LISTING',...observation(e,e.sourceRun)});continue;}
    const listing=listingCandidates[0];const tested=listing.identityConflict?{symbol,state:'QUARANTINED',reason:'IDENTITY_CONFLICT'}:e.ok?summarizeHoldings(e.data,listing,{retrievedAt:e.retrievedAt,asOf}):{symbol,state:'TRANSPORT_OR_PROVIDER_UNAVAILABLE',reason:e.reason||'requestFailed',providerErrorCode:e.providerErrorCode||null};
    holdingsTests.push({...observation(e,e.sourceRun),...tested});listing.coverage.holdings=listing.identityConflict||tested.state==='QUARANTINED'?'QUARANTINED':tested.state==='AVAILABLE_PARTIAL'?'PARTIAL':tested.reason==='providerError'?'NONE':'UNKNOWN';
  }
  const listings=[...registry.values()].sort((a,b)=>a.key.localeCompare(b.key));
  const allETF=listings.filter(x=>x.assetType==='ETF'),unknown=listings.filter(x=>x.assetType==='UNKNOWN');
  const isUSFlag=x=>x.officialReference?.source?.source_system==='NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY';
  const officialETF=allETF.filter(x=>x.officialReference&&!isUSFlag(x)),usFlagETF=allETF.filter(isUSFlag),usReference=officialReferences.find(x=>x.source?.source_system==='NASDAQTRADER_OFFICIAL_CURRENT_LISTING_DIRECTORY');
  const families=countBy(officialETF,x=>x.issuerFamilyHint||'UNRESOLVED_NAME_HINT');
  const holdingsSuccess=holdingsTests.filter(x=>x.state==='AVAILABLE_PARTIAL');
  const contamination=endpoints.filter(e=>endpointOf(e)==='etflist'&&e.ok).map(e=>({reportedTotal:e.data?.pagination?.total||null,sampleRows:rowsOf(e).length,sourceRun:e.sourceRun,membershipUsedForClassification:false,knownEquityContaminationProven:rowsOf(e).some(r=>['000001.SZ','000660.KS'].includes(r.ticker))}));
  return {schemaVersion:'marketstack-etf-full-audit-1.0.0',generatedAt:asOf,state:'MEASURED_PARTIAL_CLASSIFIED_UNIVERSE',sourceRuns,snapshotRuns,
    sourceBasis:'OFFICIAL_EXCHANGE_CLASSIFICATION_PLUS_AUTHENTICATED_PROVIDER_EVIDENCE',newPaidCallsMadeByAudit:0,productionActivated:false,reusedObservationsDeduplicated,
    providerDecision:{status:'DEFERRED',selectedOption:null,reason:'Follow-up evidence does not authorize choosing a replacement/complement decision; existing routing and Tiingo remain protected.'},
    counts:{officialMatchedETFListings:officialETF.length,officialFlagUSMatchedETFListingCandidates:usFlagETF.length,globalVerifiedETFUniverseCount:null,
      identityAdmissibleOfficialMatchedETFListings:officialETF.filter(x=>!x.identityConflict).length,
      officialMatchedUniqueETFISIN: new Set(officialETF.map(x=>x.isin).filter(Boolean)).size,officialMatchedETFListingsMissingISIN:officialETF.filter(x=>!x.isin).length,
      officialMatchedUniqueListingIdentities:new Set(officialETF.map(x=>[x.mic,x.isin||'UNKNOWN_ISIN_SYMBOL:'+x.symbol,x.tradingCurrency].join('@'))).size,
      activeKnownETFListings:allETF.filter(x=>x.active===true).length,inactiveKnownETFListings:allETF.filter(x=>x.active===false).length,statusUnknownETFListings:allETF.filter(x=>x.active==null).length,
      classifiedETFListings:allETF.length,providerObservedETFListings:allETF.filter(x=>x.metadataObserved||x.history.requests.length).length,unknownNameCandidates:unknown.length,
      ETFListingsWithMeasuredHistory:allETF.filter(x=>x.history.uniqueBars).length,historyQuarantinedListings:allETF.filter(x=>x.history.coverage==='QUARANTINED').length,
      knownIssuerFamilyNameHintGroups:Object.keys(families).filter(k=>k!=='UNRESOLVED_NAME_HINT').length,holdingsRequestsObserved:holdingsTests.length,holdingsSamplesAvailable:holdingsSuccess.length,
      holdingsSamplesStaleAtAudit:holdingsSuccess.filter(x=>x.staleForCurrentPortfolio).length,holdingsSamplesWithinFreshnessThreshold:holdingsSuccess.filter(x=>x.staleForCurrentPortfolio===false).length,
      fullyVerifiedCurrentHoldings:0,verifiedLegalIssuerEntities:0,UCITSRegulatoryVerified:0,ETCControlsExcluded:listings.filter(x=>x.assetType==='ETC').length},
    officialMatchedETFsByListingCountry:countBy(officialETF,x=>x.listingCountry),officialMatchedETFsByCurrency:countBy(officialETF,x=>x.tradingCurrency),issuerFamilyNameHintCounts:families,
    officialFlagETFListingCandidatesByCountry:countBy(usFlagETF,x=>x.listingCountry),USFlagIssuerFamilyNameHintCounts:countBy(usFlagETF,x=>x.issuerFamilyHint||'UNRESOLVED_NAME_HINT'),
    USFlagCategoryNameHintCounts:countBy(usFlagETF.flatMap(x=>x.categoryNameHints),x=>x),USFlagCategoriesAndIssuersAreNameHintsOnly:true,
    USListingCensus:{officialInventory:officialInventories.find(x=>x.scope==='CURRENT_OFFICIAL_US_PRIMARY_LISTING_DIRECTORY')||null,
      sourceRole:'OFFICIAL_NASDAQTRADER_ETF_FLAG_AND_CURRENT_PRIMARY_MIC',exactSymbolAndMICMatches:usFlagETF.length,
      matchedFlagCandidatesAreNotVerifiedFundLegalStructures:true,byMIC:countBy(usFlagETF,x=>x.mic),
      providerIdentityConflicts:usFlagETF.filter(x=>x.identityConflict).map(x=>({symbol:x.symbol,mic:x.mic,reason:x.identityConflict})),
      identityAdmissibleCandidates:usFlagETF.filter(x=>!x.identityConflict).length,
      officialFlagRoleKnownMICRowsWithoutExactDirectoryMatch:usReference?usReference.rows.length-usFlagETF.length:null,
      unmatchedOfficialListings:usReference?usReference.rows.filter(r=>!providerDirectory.has(r.symbol+'@'+r.mic)).map(r=>({symbol:r.symbol,mic:r.mic,state:'NO_EXACT_CURRENT_PRIMARY_MIC_DIRECTORY_MATCH',providerUnavailabilityProven:false})):[],
      candidateListingPresenceIsNotPriceHistoryOrHoldingsVerification:true,missingISINNeverSynthesized:true,
      providerDirectories:collectGermanDirectoryPages(endpoints,['XNAS','XNYS','ARCX','XASE','BATS','IEXG']).map(x=>({mic:x.mic,complete:x.complete,reportedTotal:x.reportedTotal,observedUniqueSymbols:new Set(x.rows.map(r=>r.symbol)).size,gaps:x.source.gaps}))},
    issuerFamilyGroupingIsNotLegalIssuerVerification:true,unexpectedETFLabels,etflistContamination:contamination,listings,holdingsTests,dividendTests,barDividendSamples,dividendObservedSymbols:[...dividendSymbols].sort(),officialInventories,officialJoinEvidence,supplementJoinAnomalies,
    measuredFollowUp:summarizeETFFollowUp(endpoints),
    holdingsQuality:{observedResponses:holdingsTests.length,requestSucceeded:holdingsTests.filter(x=>x.requestSucceeded).length,states:countBy(holdingsTests,x=>x.state),
      failuresByReason:countBy(holdingsTests.filter(x=>x.state!=='AVAILABLE_PARTIAL'),x=>x.reason||x.state),
      usablePartialSeries:holdingsSuccess.length,expectedShareClassISINMatched:holdingsSuccess.filter(x=>x.returnedSeriesISINMatchesExpected===true).length,
      usablePartialHoldingLines:holdingsSuccess.reduce((n,x)=>n+x.holdingsLines,0),missingISINLines:holdingsSuccess.reduce((n,x)=>n+x.missingISIN,0),
      exactDuplicateLines:holdingsSuccess.reduce((n,x)=>n+x.duplicateExactPositionLines,0),negativeWeightLines:holdingsSuccess.reduce((n,x)=>n+x.negativeWeightLines,0),
      cashOrCollateralLines:holdingsSuccess.reduce((n,x)=>n+x.cashOrCollateralLines,0),derivativeLines:holdingsSuccess.reduce((n,x)=>n+x.derivativeLines,0),
      holdingsTotalReviewSymbols:holdingsSuccess.filter(x=>x.anomalies.some(a=>a.code==='HOLDINGS_TOTAL_REQUIRES_REVIEW')).map(x=>x.symbol),
      withinFreshnessThresholdSymbols:holdingsSuccess.filter(x=>x.staleForCurrentPortfolio===false).map(x=>x.symbol),fullCurrentShareClassPortfoliosVerified:0,NAVVerified:0,AUMDerived:0},
    historyQuality:{states:countBy(allETF.filter(x=>x.history.requests.length||x.identityConflict),x=>x.history.coverage),
      anomalyObservationsByReason:countBy(allETF.flatMap(x=>x.history.anomalies),x=>x.reason),
      listingCountsByAnomalyReason:countBy(allETF.flatMap(x=>[...new Set(x.history.anomalies.map(a=>a.reason))]),x=>x),
      identityConflictedSymbols:allETF.filter(x=>x.identityConflict).map(x=>x.symbol),cleanObservedSeries:allETF.filter(x=>x.history.coverage==='PARTIAL').map(x=>({symbol:x.symbol,mic:x.mic,bars:x.history.uniqueBars,firstObserved:x.history.firstObservedDate,lastObserved:x.history.lastObservedDate})),
      completeInceptionHistoryVerified:0,corporateActionAdjustmentVerified:0},
    holdingsRequestPlan:{requestedUnique:plan.newHoldingsSymbols?.length||0,maximumCreditsNoRetry:plan.estimatedHoldingsCreditsMaximumNoRetry||0,circuitBreaker:plan.nonUSHoldingsCircuitBreaker||null},
    officialReferenceSources:classification.referenceSources||{},limitations:['Full Xetra classification is not a full global ETF universe or unique fund count.',
      'ETC/ETN/fund instruments remain separate; provider etflist membership is untrusted.',
      'ISINs identify share classes/listings; ISIN prefixes do not verify fund domicile.',
      'Name hints do not establish legal issuer, UCITS authorization, accumulation, benchmark or replication.',
      'History counts measure only returned windows; metadata/has_eod flags do not prove full history.',
      'No new product activation or company fundamentals scoring is performed.']};
}
function args(name){return process.argv.filter(x=>x.startsWith('--'+name+'=')).map(x=>x.slice(name.length+3));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const read=p=>JSON.parse(readFileSync(resolve(p),'utf8'));
  const classification=read(args('classification')[0]||'reports/marketstack/marketstack_xetra_classified_candidates.json');
  const plan=read(args('plan')[0]||'reports/marketstack/marketstack_etf_request_plan.json');
  const probes=args('probe').map(read),officialReferences=args('reference').map(read);
  const six=args('six-reference')[0];if(six)officialReferences.push(normalizeSIXETFReference(read(six),read(args('six-source')[0]||six.replace(/\.json$/,'-source.json'))));
  const us=args('us-reference')[0];if(us)officialReferences.push(normalizeUSNasdaqETFReference(read(us),args('as-of')[0]||'2026-10-01'));
  const euro=args('euronext-page');if(euro.length)officialReferences.push(normalizeEuronextETFReference(euro.map(path=>({payload:read(path),source:read(path.replace(/\.json$/,'-source.json'))}))));
  const audit=buildETFAudit({classification,plan,probes,officialReferences,asOf:args('as-of')[0]||'2026-10-01'});
  const evidencePaths=[args('classification')[0]||'reports/marketstack/marketstack_xetra_classified_candidates.json',args('plan')[0]||'reports/marketstack/marketstack_etf_request_plan.json',
    ...args('probe'),...args('reference'),...args('us-reference'),...args('six-reference'),...args('six-source'),...args('euronext-page'),...args('euronext-page').map(p=>p.replace(/\.json$/,'-source.json'))];
  audit.evidenceInputs=[...new Set(evidencePaths)].map((path,inputOrdinal)=>({inputOrdinal,file:basename(path),sha256:createHash('sha256').update(readFileSync(resolve(path))).digest('hex'),
    role:'READ_ONLY_REPRODUCIBILITY_INPUT_NOT_NEW_PROVIDER_REQUEST'}));
  const matrix=buildMetadataMatrix(audit),publicAudit=compactETFAudit(audit);
  const sourceAuditSHA256=createHash('sha256').update(JSON.stringify(publicAudit,null,2)+'\n').digest('hex');
  matrix.sourceAuditSHA256=sourceAuditSHA256;
  const out=resolve(args('out')[0]||'reports/marketstack/marketstack_etf_full_audit.json'),matrixOut=resolve(args('matrix-out')[0]||'reports/marketstack/marketstack_etf_metadata_matrix.json');
  const identityOut=resolve(args('identity-out')[0]||'reports/marketstack/marketstack_etf_identity_reconciliation.json');
  const artifacts=[[out,publicAudit],[matrixOut,matrix],[identityOut,buildETFIdentityCoverage(audit,{sourceAuditSHA256})]],privateFull=args('private-full-out')[0];
  if(privateFull){const privatePath=resolve(privateFull);if(privatePath.startsWith(resolve('reports')+'/')||privatePath.startsWith(resolve('quant/data')+'/'))throw new Error('Full provider directory requires a private working output path');artifacts.push([privatePath,audit]);}
  const referenceOut=args('joined-reference-out')[0];if(referenceOut){const path=resolve(referenceOut);if(path.startsWith(resolve('reports')+'/')||path.startsWith(resolve('quant/data')+'/'))throw new Error('Full joined references require a private working output path');artifacts.push([path,buildETFReferenceJoins(audit)]);}
  for(const [file,value] of artifacts){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
  const markdown=args('markdown-out')[0];if(markdown){const path=resolve(markdown);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,renderETFAuditMarkdown(audit,matrix));}
  console.log(JSON.stringify({state:audit.state,counts:audit.counts,outputs:[basename(out),basename(matrixOut),basename(identityOut)]}));
}
