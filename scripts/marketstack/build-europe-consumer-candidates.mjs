/** Offline only: frozen private directory evidence -> bounded regional maps.
 * VERIFIED describes independent listing identity, never a provider quote,
 * liquidity, strategy, display-rights or product-admission certification. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
const require=createRequire(import.meta.url),Identity=require('../../core/identity.js');
const COUNTRIES=['DE','FR','NL','CH','GB','SE','DK','NO','FI','ES','IT','AT','BE'];
const SHARES=new Set(['ORDINARY_SHARE','REGISTERED_ORDINARY_SHARE','PREFERRED_SHARE']);
const BASIS='EXACT_REGULATORY_ISIN_LEI_AND_OPERATOR_ISIN_MIC_REFERENCE';
const MAJOR_CURRENCIES=new Set(['EUR','CHF','SEK','NOK','DKK']);
const symbol=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(v)?v:null;
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const strings=v=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.length))].sort():[];
function issuerId(row){const lei=row.issuerLEI||row.companyReference?.lei;try{return lei?Identity.companyIdForLEI(lei):null;}catch{return null;}}
function identitySources(row,core){return strings(core?(Array.isArray(row.mappingSource)?row.mappingSource:row.mappingSourceIds):row.metadataSourceIds);}
function proof(row,core){
 const sources=identitySources(row,core),share=row.shareClass,security=row.securityEvidence;
 if(core)return row.mappingStatus==='VERIFIED'&&sources.length>0&&(SHARES.has(share)||row.officialInstrumentType==='CS'&&row.indexMemberships?.length>0);
 const cfi=security?.cfiCodes||[];
 const shareProof=SHARES.has(share)&&!!(security?.responseSHA256||security?.sourceResponseSHA256)&&cfi.some(c=>share==='PREFERRED_SHARE'?/^EP[A-Z]{4}$/.test(c):/^ES[A-Z]{4}$/.test(c));
 return row.mappingBasis===BASIS&&sources.length>0&&shareProof&&!!row.issuerEvidence&&!!issuerId(row);
}
function providerAssociation(row,{providerSymbol,isin,mic,core}){
 const evidence=row.providerIdentityEvidence;
 const exact=row.historicalProviderIdentity==='EXACT_IDENTITY_VERIFIED'&&!!providerSymbol&&
  evidence?.providerSymbol===providerSymbol&&Identity.normalizeISIN(evidence?.isin)===isin&&evidence?.mic===mic&&
  /^[a-f0-9]{64}$/.test(evidence?.sourceHash||'')&&typeof evidence?.sourcePath==='string'&&evidence.sourcePath.length>0;
 if(!exact)return {basis:providerSymbol?'REQUEST_CANDIDATE_REQUIRE_RESPONSE_ISIN':'UNRESOLVED',evidence:null};
 const basis=core&&typeof row.providerIdentityBasis==='string'&&row.providerIdentityBasis.startsWith('HISTORICAL_EXACT_ISIN_MIC')?
  row.providerIdentityBasis:'HISTORICAL_EXACT_ISIN_MIC_RESPONSE_ASSOCIATION';
 return {basis,evidence:{providerSymbol,isin,mic,sourceHash:evidence.sourceHash,sourcePath:evidence.sourcePath,
  gitSHA:evidence.gitSHA||null,jsonPointer:evidence.jsonPointer||null,checkedAt:evidence.checkedAt||null}};
}
function normalize(row,{asOf,core=false}){
 const isin=Identity.normalizeISIN(row.isin),mic=typeof row.mic==='string'?row.mic.trim().toUpperCase():null;
 const fail=(cause,reason)=>({rejected:{name:row.name||null,isin:row.isin||null,mic:row.mic||null,cause,reason,tier:row.tier||null}});
 if(!isin||!mic||!/^[A-Z0-9]{4}$/.test(mic))return fail('MAPPING_ERROR','Invalid canonical ISIN or MIC.');
 if(row.assetType&&row.assetType!=='EQUITY'||row.shareClass&&!SHARES.has(row.shareClass)&&!(core&&row.officialInstrumentType==='CS'&&row.indexMemberships?.length))return fail('CURRENT_POLICY_INELIGIBLE','Only proven ordinary and legitimate local preferred equity classes are eligible.');
 if(!core&&!COUNTRIES.includes(row.issuerDomicile))return fail('CURRENT_POLICY_INELIGIBLE','Issuer domicile is outside the requested country selection or unresolved.');
 if(row.effectiveDate&&(!day(row.effectiveDate)||row.effectiveDate>asOf)||row.identityChangeEvidence?.effectiveDate>asOf||(row.referenceEvidence||[]).some(e=>e.effectiveDate&&(!day(e.effectiveDate)||e.effectiveDate>asOf)))return fail('REFERENCE_UNRESOLVED','Announced membership or share-class change is not effective.');
 if(row.listingActive===false||row.officialActive===false&&row.officialActivityStatus==='INACTIVE'||row.issuerEntityStatus&&row.issuerEntityStatus!=='ACTIVE')return fail('CURRENT_POLICY_INELIGIBLE','Explicit inactive listing or issuer.');
 if(row.officialActivityStatus==='NOT_IN_CURRENT_XETRA_REFERENCE')return fail('REFERENCE_UNRESOLVED','Historical listing absent from current Xetra reference; review without declaring it inactive.');
 if(!proof(row,core))return fail('MAPPING_ERROR','Independent share-class, ISIN/MIC and source evidence is incomplete.');
 const currency=row.tradingCurrency;
 if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))return fail('MAPPING_ERROR','Verified listing trading currency is required; no domicile/country fallback.');
 let quoteUnit=null,quoteUnitBasis=null;
 if(MAJOR_CURRENCIES.has(currency)){quoteUnit='MAJOR';quoteUnitBasis='INDEPENDENT_LISTING_TRADING_CURRENCY_MAJOR_UNIT';}
 else if(['MAJOR','MINOR'].includes(row.quoteUnit)&&row.quoteUnitEvidence){quoteUnit=row.quoteUnit;quoteUnitBasis='EXPLICIT_LISTING_QUOTE_UNIT_EVIDENCE';}
 if(!quoteUnit)return fail('MISSING_FX_OR_SHARE_BASIS','Currency/quotation unit must be proved explicitly; GBP/GBX is not inferred.');
 const candidates=strings(row.providerSymbolCandidates||row.providerAliases||[]).map(symbol).filter(Boolean);
 const explicit=symbol(row.providerSymbol||row.selectedCoreProviderCandidate);
 if(explicit&&!candidates.includes(explicit))candidates.unshift(explicit);
 const quarantined=!!row.providerQuarantineReasons?.length||row.historicalProviderIdentity==='QUARANTINED';
 const providerSymbol=quarantined?null:explicit||candidates[0]||null;
 const ticker=Identity.normalizeTicker(row.ticker||row.localTicker||row.officialLocalTicker)||Identity.normalizeTicker(providerSymbol);
 if(!ticker)return fail('MAPPING_ERROR','No source-backed exchange ticker or observed provider symbol; a provider symbol is never fabricated.');
 const referencedIssuerId=issuerId(row),mappingSource=identitySources(row,core),association=providerAssociation(row,{providerSymbol,isin,mic,core});
 const normalized={name:String(row.name||row.officialInstrumentName||''),isin,mic,securityId:Identity.securityIdForISIN(isin),listingId:Identity.listingIdFor({isin,mic}),
  companyId:null,referencedIssuerId,issuerLEI:row.issuerLEI||row.companyReference?.lei||null,companyCountry:row.issuerDomicile||row.companyReference?.domicileCountry||null,
  companyAssociationStatus:'EXISTING_VU_COMPANY_ASSOCIATION_UNRESOLVED',ticker,localTicker:row.localTicker||row.officialLocalTicker||null,
  tickerBasis:row.ticker||row.localTicker||row.officialLocalTicker?'SOURCE_EXCHANGE_TICKER':'OBSERVED_PROVIDER_SYMBOL_NO_MNEMONIC_INFERENCE',
  assetType:'EQUITY',shareClass:row.shareClass,listingCountry:row.listingCountry||null,tradingCurrency:currency,quoteUnit,quoteUnitBasis,
  mappingStatus:'VERIFIED',mappingSource,mappingVerification:'INDEPENDENT_LISTING_IDENTITY_ONLY',
  providerSymbol,providerSymbolCandidates:candidates,providerVerified:false,currentProviderVerified:false,
  providerStatus:quarantined?'HISTORICAL_PROVIDER_CONTRADICTION':providerSymbol?'HISTORICAL_CANDIDATE_REVALIDATION_REQUIRED':'PROVIDER_SYMBOL_UNRESOLVED',
  providerIdentityBasis:association.basis,providerIdentityEvidence:association.evidence,
  providerQuarantineReasons:strings(row.providerQuarantineReasons),indexMemberships:core?strings(row.indexMemberships):[],
  tier:core?'A':row.tier,tierBasis:core?'MANDATORY_CORE_SELECTION':row.tierBasis||null,
  alternativeListing:row.alternativeListing===true,listingPreference:row.alternativeListing===true?'ALTERNATIVE_HOME_LISTING_UNAVAILABLE':'VERIFIED_LOCAL_VENUE_PRIMARY_STATUS_UNCONFIRMED',preferredMIC:row.preferredMIC||null,preferredMICs:strings(row.preferredMICs),
  selectionReason:row.selectionReason||row.alternativeListing===true&&'EXPLICIT_VERIFIED_ALTERNATIVE_VENUE'||null,
  primaryListingVerified:row.primaryListingVerified===true,officialReportedPrimaryMIC:row.officialReportedPrimaryMIC||row.officialReportedPrimaryMarketMIC||null,
  officialActivityStatus:row.officialActivityStatus||row.officialActive===true&&'CURRENT_OFFICIAL_ACTIVE'||'UNCONFIRMED',
  listingActive:row.listingActive===true||row.officialActive===true?true:null,liquidityCertified:false,
  referenceEvidence:core?row.referenceEvidence||[]:[],sourceEvidence:{issuer:row.issuerEvidence||row.companyReference?.evidence||null,security:row.securityEvidence||null,listingSourceIds:mappingSource},
  priceRelease:'NOT_GRANTED',productAdmission:'NOT_GRANTED',publicDisplay:false,privateDevelopment:true};
 return {row:normalized};
}
/** Preserve core selection exactly; no diagnostic alternative changes its MIC. */
export function buildCandidates({source,coreMap,boundedGermanTierC=false}){
 if(!source||!Array.isArray(source.listings)||!coreMap||!Array.isArray(coreMap.listings)||!day(coreMap.asOf))throw Error('EXPLICIT_FROZEN_INPUTS_REQUIRED');
 if(source.sourceDate&&(!day(source.sourceDate)||source.sourceDate>coreMap.asOf))throw Error('FUTURE_OR_INVALID_REFERENCE_SOURCE');
 const asOf=coreMap.asOf,coreISINs=new Set(),coreRows=[],germany=[],europe=[],rejected=[],deferred=[];
 for(const input of coreMap.listings){
  const isin=Identity.normalizeISIN(input.isin);if(isin&&coreISINs.has(isin))throw Error('DUPLICATE_CORE_SHARE_CLASS');if(isin)coreISINs.add(isin);
  const value=normalize(input,{asOf,core:true});if(value.rejected)rejected.push({...value.rejected,selection:'CORE'});else coreRows.push(value.row);
 }
 const seen=new Set();
 for(const input of source.listings){
  const isin=Identity.normalizeISIN(input.isin);if(coreISINs.has(isin))continue;
  if(isin&&seen.has(isin))throw Error('DUPLICATE_EXPANSION_SHARE_CLASS');if(isin)seen.add(isin);
  const boundedC=boundedGermanTierC===true&&input.tier==='C_REFERENCE_ONLY'&&input.issuerDomicile==='DE'&&input.mic==='XETR'&&input.listingActive===true&&input.officialActivityStatus==='CURRENT_OFFICIAL_ACTIVE'&&input.alternativeListing!==true;
  if(!['A','B','B_CANDIDATE'].includes(input.tier)&&!boundedC){deferred.push({isin:input.isin,mic:input.mic,cause:'CURRENT_POLICY_INELIGIBLE',reason:'Tier C/reference-only is outside the current bounded expansion.'});continue;}
  const value=normalize(input,{asOf});if(value.rejected){rejected.push({...value.rejected,selection:'EXPANSION'});continue;}
  (input.issuerDomicile==='DE'?germany:europe).push(value.row);
 }
 const sort=rows=>rows.sort((a,b)=>a.listingId.localeCompare(b.listingId));
 const sourceEvidence={bootstrapSHA256:sha(source),coreMapSHA256:sha(coreMap),historicalSourceDate:source.sourceDate||null,gitSHA:source.gitSHA||null};
 const map=(selection,listings)=>({schemaVersion:'de-eu-listing-map-1.0.0',asOf,selection,selectionFrozen:true,privateDevelopment:true,publicDisplay:false,sourceEvidence,listings:sort(listings),counts:{shareClasses:listings.length,listings:listings.length,referencedCompanies:new Set(listings.map(r=>r.referencedIssuerId).filter(Boolean)).size,providerSymbolCandidates:listings.filter(r=>r.providerSymbol).length,currentProviderVerified:0}});
 const alternativeDiagnostics=source.listings.filter(r=>coreISINs.has(Identity.normalizeISIN(r.isin))).flatMap(r=>(r.availableListingAlternatives||[]).filter(a=>a.mic!==coreMap.listings.find(c=>c.isin===r.isin)?.mic).map(a=>({isin:r.isin,name:r.name,mic:a.mic,tradingCurrency:a.currency,providerSymbolCandidates:strings(a.providerSymbolCandidates),status:'DIAGNOSTIC_ONLY_NOT_SELECTED',providerVerified:false,reason:'Exact cached alternative requires separate response validation; preferred core selection is preserved.'})));
 const unresolvedCore=coreRows.filter(r=>!r.providerSymbol).map(r=>({listingId:r.listingId,isin:r.isin,ticker:r.localTicker,status:'BLOCKED',cause:'MAPPING_ERROR',reason:'No verified cached preferred provider symbol; no automatic symbol convention is constructed.'}));
 return {core:map('MANDATORY_CORE',coreRows),germany:map(boundedGermanTierC?'GERMANY_BOUNDED_CURRENT_XETRA_TIER_C':'GERMANY_A_B_EXPANSION',germany),europe:map('EUROPE_A_B_EXPANSION',europe),diagnostics:{schemaVersion:'europe-consumer-candidate-diagnostics-1.0.0',asOf,privateDevelopment:true,publicDisplay:false,sourceEvidence,rejected,deferred,alternativeDiagnostics,unresolvedCore,newRequests:0,newEstimatedSymbolCredits:0,currentProviderVerified:0}};
}
function privatePath(value){
 const path=assertPrivateOutput(value,{allowCache:true});
 let parent=path;
 for(;;){
  if(existsSync(join(parent,'.git'))&&!path.startsWith(join(parent,'.market-cache')+sep))throw Error('PRIVATE_INPUT_OUTPUT_IN_GIT_REPOSITORY_REJECTED');
  if(dirname(parent)===parent)break;parent=dirname(parent);
 }
 return path;
}
export function run(argv=process.argv.slice(2)){
 const option=n=>{const ix=argv.indexOf('--'+n);return ix>=0?argv[ix+1]:argv.find(v=>v.startsWith('--'+n+'='))?.slice(n.length+3);};
 const sourcePath=option('source'),corePath=option('core-map'),outPath=option('out');if(!sourcePath||!corePath||!outPath)throw Error('EXPLICIT_PRIVATE_SOURCE_CORE_MAP_OUT_REQUIRED');
 privatePath(sourcePath);privatePath(corePath);const out=privatePath(outPath);
 const result=buildCandidates({source:JSON.parse(readFileSync(resolve(sourcePath),'utf8')),coreMap:JSON.parse(readFileSync(resolve(corePath),'utf8')),boundedGermanTierC:argv.includes('--bounded-germany-tier-c')});
 const files={'core_listing_map.json':result.core,'germany_ab_listing_map.json':result.germany,'europe_ab_listing_map.json':result.europe,'europe_consumer_candidate_diagnostics.json':result.diagnostics};
 for(const name of Object.keys(files))rejectSymlinkAncestors(join(out,name));mkdirSync(out,{recursive:true,mode:0o700});chmodSync(out,0o700);
 for(const [name,value]of Object.entries(files)){const path=join(out,name);writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);}
 return {core:result.core.counts,germany:result.germany.counts,europe:result.europe.counts,rejected:result.diagnostics.rejected.length,currentProviderVerified:0,newRequests:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(run()));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'PRIVATE_CANDIDATE_INPUT_FAILURE');process.exitCode=1;}}
