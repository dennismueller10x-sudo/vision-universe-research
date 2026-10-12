/** Isolated source-evidence gates. Observed rows are never a market denominator. */
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url);
const Identity=require('../../../../core/identity.js');
const Master=require('../../../../quant/engines/company-master.js');
export const UNIVERSE_CERT_VERSION='supertrader-universe-certification-1.0.0';
export const PANEL_STATES=Object.freeze(['PIT_COMPLETE','PIT_PARTIAL','OBSERVED_ONLY']);
const iso=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const CIK=c=>typeof c==='string'&&/^\d{10}$/.test(c);
const official=e=>{try{const u=new URL(e?.url);return u.protocol==='https:'&&(u.hostname==='sec.gov'||u.hostname.endsWith('.sec.gov')||['nasdaq.com','www.nasdaq.com','nasdaqtrader.com','www.nasdaqtrader.com','nyse.com','www.nyse.com'].includes(u.hostname))&&typeof e.locator==='string'&&e.locator.length>0&&/^[a-f0-9]{64}$/.test(e.sha256||'');}catch{return false;}};
export function canonicalListing(listing){
 const ticker=Identity.normalizeTicker(listing?.ticker),start=listing?.startDate,end=listing?.listEnd??listing?.endDate??null;
 if(!ticker||ticker!==listing.ticker||!iso(start)||(end!==null&&(!iso(end)||end<start)))throw Error('LISTING_SOURCE_IDENTITY_INVALID');
 if(listing.id!==`tiingo:${listing.exchange}:${ticker}:${start}`||!listing.exchange)throw Error('LISTING_IDENTITY_CONFLICT');
 const securityId=Identity.securityIdForTicker(ticker);
 if(listing.securityId&&listing.securityId!==securityId)throw Error('CANONICAL_SECURITY_ID_CONFLICT');
 return {...listing,securityId,startDate:start,endDate:end};
}
/** A historical source-content review is required, not a current SEC profile. */
export function certifyHistoricalIdentity(listing,evidence=[],asOf=null){
 const l=canonicalListing(listing),unverified=reason=>({status:'UNVERIFIED',reason,historical:false,listingId:l.id,securityId:l.securityId,issuerId:null,cik:null,validFrom:null,validTo:null,knownFrom:null,source:null,issuerStructure:'UNKNOWN'});
 if(asOf!==null&&!iso(asOf))throw Error('INVALID_FORMATION_DATE');
 const usable=[];
 for(const e of evidence){
  const a=e?.assertions;
  if(e.type!=='HISTORICAL_ISSUER_SECURITY_LINK'||e.historical!==true||e.sourceSnapshotScope==='CURRENT_ONLY'||!a||!official(e.officialSource))continue;
  if(e.review?.status!=='PASS'||e.review.assertionHash!==hash(a)||!e.review.reviewer||!iso(e.review.reviewedAt))continue;
  if(a.listingId!==l.id||a.securityId!==l.securityId||a.ticker!==l.ticker||!CIK(a.cik)||a.issuerId!==Master.issuerIdFromCik(a.cik))continue;
  if(a.relationship!=='ISSUER_SECURITY'||a.admissionConfirmed!==true||!iso(a.validFrom)||!iso(a.knownFrom)||a.validFrom<l.startDate)continue;
  if(a.validTo!==null&&a.validTo!==undefined&&(!iso(a.validTo)||a.validTo<a.validFrom||(l.endDate&&a.validTo>l.endDate)))continue;
  if(asOf&&(a.validFrom>asOf||(a.validTo&&a.validTo<asOf)||a.knownFrom>=asOf))continue;
  usable.push(e);
 }
 if(!usable.length)return unverified('NO_REVIEWED_HISTORICAL_SECURITY_ISSUER_LINK');
 if(new Set(usable.map(e=>e.assertions.cik)).size!==1)return unverified('CONFLICTING_HISTORICAL_ISSUER_LINKS');
 const e=usable.sort((a,b)=>a.assertions.knownFrom.localeCompare(b.assertions.knownFrom)||hash(a).localeCompare(hash(b)))[0],a=e.assertions;
 const single=a.issuerStructure==='SINGLE_CLASS'&&a.classRosterComplete===true&&Array.isArray(a.classListingIds)&&a.classListingIds.length===1&&a.classListingIds[0]===l.id;
 return {status:'VERIFIED',historical:true,issuerId:a.issuerId,cik:a.cik,listingId:l.id,securityId:l.securityId,validFrom:a.validFrom,validTo:a.validTo??null,knownFrom:a.knownFrom,source:{...e.officialSource,review:e.review},issuerStructure:single?'SINGLE_CLASS':'UNKNOWN',independentSourceContentReviewRequired:true};
}
export function listingAtDate(listing,date,certificate=null){
 if(!iso(date))throw Error('INVALID_FORMATION_DATE');const l=canonicalListing(listing);
 if(date<l.startDate||(l.endDate&&date>l.endDate))return {status:'OUTSIDE_OBSERVED_LISTING_INTERVAL',admissible:false};
 const verified=certificate?.status==='VERIFIED'&&certificate.historical===true&&certificate.listingId===l.id&&certificate.securityId===l.securityId&&iso(certificate.knownFrom)&&certificate.knownFrom<date&&certificate.validFrom<=date&&(!certificate.validTo||certificate.validTo>=date);
 return {status:verified?'HISTORICAL_LISTING_LINK_CERTIFIED':'OBSERVED_INTERVAL_ONLY',admissible:verified,observedMember:true};
}
function populationGate(listings,certificates,population,window){
 if(!population)return {status:'NOT_ESTABLISHED',reason:'INDEPENDENT_HISTORICAL_MARKET_DENOMINATOR_MISSING'};
 if(population.status!=='REVIEWED_COMPLETE_OFFICIAL_POPULATION'||!official(population.officialSource)||population.review?.status!=='PASS'||population.review.assertionHash!==hash(population.assertions))return {status:'NOT_ESTABLISHED',reason:'POPULATION_SOURCE_NOT_INDEPENDENTLY_CERTIFIED'};
 const a=population.assertions,dates=a?.formationDates;
 if(a?.scope!=='US_EXCHANGE_COMMON_ADR_REIT'||a.from!==window.from||a.to!==window.to||!Array.isArray(dates)||!dates.length||a.completeFormationCalendar!==true)return {status:'NOT_ESTABLISHED',reason:'POPULATION_SCOPE_OR_CALENDAR_INCOMPLETE'};
 const byId=new Map(listings.map(l=>[l.id,l]));
 for(const date of dates){
  if(!iso(date)||date<window.from||date>window.to)return {status:'NOT_ESTABLISHED',reason:'POPULATION_DATE_INVALID'};
  const expected=a.listingIdsByDate?.[date];if(!Array.isArray(expected)||new Set(expected).size!==expected.length)return {status:'NOT_ESTABLISHED',reason:'POPULATION_DATE_MEMBERSHIP_MISSING'};
  const actual=listings.filter(l=>l.startDate<=date&&(!l.endDate||l.endDate>=date)).map(l=>l.id).sort();
  if(JSON.stringify(actual)!==JSON.stringify([...expected].sort()))return {status:'NOT_ESTABLISHED',reason:'OBSERVED_OFFICIAL_POPULATION_MISMATCH'};
  if(expected.some(id=>!byId.has(id)||!listingAtDate(byId.get(id),date,certificates.get(id)).admissible))return {status:'NOT_ESTABLISHED',reason:'POPULATION_MEMBER_LINK_UNCERTIFIED'};
 }
 return {status:'VERIFIED_COMPLETE_WITHIN_EXPLICIT_SCOPE',source:population.officialSource,formationDates:dates.length,scope:a.scope};
}
export function certifyUniversePanel({listings=[],providerRows=[],identityEvidence=[],populationEvidence=null,window,asOf,canonicalData=null}={}){
 if(!window||!iso(window.from)||!iso(window.to)||window.from>window.to||!iso(asOf))throw Error('EXPLICIT_VALID_WINDOW_AND_ASOF_REQUIRED');
 const ids=new Set(),ls=listings.map(l=>{const v=canonicalListing(l);if(ids.has(v.id))throw Error('DUPLICATE_LISTING_ID');ids.add(v.id);return v;});
 const certificates=new Map(ls.map(l=>[l.id,certifyHistoricalIdentity(l,identityEvidence,null)]));
 const verified=[...certificates.values()].filter(c=>c.status==='VERIFIED').length,population=populationGate(ls,certificates,populationEvidence,window);
 const state=population.status==='VERIFIED_COMPLETE_WITHIN_EXPLICIT_SCOPE'?'PIT_COMPLETE':verified?'PIT_PARTIAL':'OBSERVED_ONLY';
 const reuse=ls.filter(l=>l.reusedLater).length,closed=ls.filter(l=>l.endDate).length;
 const missing=state==='PIT_COMPLETE'?[]:['HISTORICAL_POPULATION_DENOMINATOR_UNCERTIFIED','DELISTED_POPULATION_COMPLETENESS_UNCERTIFIED'];
 const priceState=canonicalData?.state==='AVAILABLE'?'OBSERVED_CANONICAL_PRICES':'NOT_PROBED';
 const methodCoverage=Object.fromEntries(['cross_sectional_momentum','52_week_high_effect','LOW_VOLATILITY','TURTLE_S2_EQUITY_DAILY','WEINSTEIN_STAGE_DAILY','KULLAMAGI_DAILY_ADAPTATION','GROSS_PROFITABILITY','PIOTROSKI','GREENBLATT','VALUE_MOMENTUM'].map(id=>[id,{universe:state,prices:priceState,historicalIssuerLink:verified?'PARTIAL':'UNVERIFIED',historicalClassRoster:'UNVERIFIED',marketEquity:'NOT_CERTIFIED',annualFundamentals:'NOT_CERTIFIED',performanceCalculated:false}]));
 return {schema:UNIVERSE_CERT_VERSION,state,asOf,window,counts:{providerListingRecords:providerRows.length,observedListingGenerations:ls.length,closedObservedListings:closed,reusedEarlierListings:reuse,verifiedHistoricalIssuerLinks:verified,canonicalObservedSegments:canonicalData?.coverage?.usableSegments??null},countUnitsDistinct:true,marketDenominator:null,coveragePercentage:null,populationEvidence:population,missing,methodCoverage,listingCertificates:[...certificates.values()],rights:{providerDerived:'PRIVATE_OWNER_SESSION_ONLY_EXISTING_PROVIDER_RIGHTS_UNCONFIRMED',secSources:'OFFICIAL_FREE_SEC_EDGAR_SOURCE_DATA',newPaidProvider:false},limitations:['CANONICAL_PRICE_VALIDITY_IS_NOT_UNIVERSE_COMPLETENESS','SEC_CURRENT_TICKERS_OR_FORMER_NAMES_DO_NOT_PROVE_HISTORICAL_SECURITY_LINKS','CURRENT_CIK_NOT_APPLIED_TO_OLDER_TICKER_GENERATIONS','ADR_RATIO_AND_MULTI_CLASS_MARKET_EQUITY_REQUIRE_SEPARATE_CERTIFICATION']};
}
