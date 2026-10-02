#!/usr/bin/env node
/** Read-only enrichment of the accepted PR334 census. No provider calls or admission writes. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateGates, REQUIREMENTS } from '../supertrader/engine/gates.mjs';

export const COUNTRIES = ['DE','FR','NL','BE','IT','ES','AT','CH','GB','DK','SE','NO','FI'];
export const CAPABILITIES = ['SEARCH','CHART','WATCHLIST','SCREENER_TECHNICAL','SCREENER_FUNDAMENTAL','QUANT_TECHNICAL','QUANT_FULL','SUPERTRADER','BACKTEST'];
const EQUITY_TYPES = new Set(['ORDINARY_SHARE','PREFERRED_SHARE','DEPOSITARY_RECEIPT','CONVERTIBLE_SHARE','PREFERRED_CONVERTIBLE_SHARE','OTHER_EQUITY']);
const GERMAN_TYPES = new Set(['ORDINARY_SHARE','PREFERRED_SHARE']);
const sorted = xs => [...new Set(xs.filter(x => x !== null && x !== undefined))].sort();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const validCurrency = currency => ['USD','EUR','GBP','CHF','DKK','SEK','NOK','JPY','KRW','TWD','HKD','CNY','INR','BRL','CAD','AUD','NZD','ZAR','PLN','CZK','HUF','ILS','SGD','TRY','MXN'].includes(currency);
const identityKey = x => [x.isin,x.mic,x.tradingCurrency].join('|');

export function latestSourceTimestamp(values) {
  let latest=null,latestEpoch=null;
  for(const value of values) {
    if(typeof value!=='string' || !Number.isFinite(Date.parse(value)))continue;
    const fraction=/\.(\d{1,9})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] || '';
    const epoch=BigInt(Date.parse(value))*1000000n + BigInt(fraction.padEnd(9,'0').slice(3));
    if(latestEpoch===null || epoch>latestEpoch) {latest=value;latestEpoch=epoch;}
  }
  return latest;
}

export function verifyExistingBacktestGateReport(report) {
  if (!report || report.engine !== 'scripts/supertrader/engine/gates.mjs' || !REQUIREMENTS[report.variantId]?.length || !report.coverage || !report.extra ||
    report.engineSHA256 !== sha(readFileSync(new URL('../supertrader/engine/gates.mjs',import.meta.url)))) return false;
  const expected = evaluateGates(report.variantId,report.coverage,report.extra);
  if (expected.status !== 'BACKTEST_READY' || expected.metricsPublishable !== true || expected.failedGates.length ||
    JSON.stringify(expected) !== JSON.stringify(report.result)) return false;
  return report.reportSHA256 === sha(JSON.stringify({ engine:report.engine, engineSHA256:report.engineSHA256, variantId:report.variantId, coverage:report.coverage, extra:report.extra, result:report.result }));
}

export function inspectHistory(history, listing) {
  if (!history) return { status:'NOT_DELIVERED', bars:0, firstDate:null, lastDate:null, validCloseSeries:false, fullOHLCV:false };
  if (history.listingId !== listing.listingId || history.securityId !== listing.securityId || history.currency !== listing.tradingCurrency) {
    return { status:'IDENTITY_OR_CURRENCY_MISMATCH', bars:0, firstDate:null, lastDate:null, validCloseSeries:false, fullOHLCV:false };
  }
  const rows = Array.isArray(history.bars) ? history.bars : [];
  let previous = '', valid = rows.length > 0;
  for (const bar of rows) {
    const timestamp = typeof bar.date === 'string' ? Date.parse(bar.date + 'T00:00:00Z') : NaN;
    const date = typeof bar.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === bar.date;
    if (!date || bar.date <= previous || !Number.isFinite(bar.close) || bar.close <= 0) valid = false;
    previous = bar.date;
  }
  const fullOHLCV = valid && rows.every(b => ['open','high','low','close','volume'].every(k => Number.isFinite(b[k])) && b.low > 0 && b.volume >= 0 && b.low <= Math.min(b.open,b.close) && b.high >= Math.max(b.open,b.close));
  return { status:valid ? 'VALID_BOUNDED_CLOSE_SERIES' : 'INVALID_CLOSE_SERIES', bars:rows.length, firstDate:rows[0]?.date || null,
    lastDate:rows.at(-1)?.date || null, validCloseSeries:valid, fullOHLCV, adjustmentStatus:history.adjustmentStatus || 'unknown',
    quarantinedProviderCandles:history.quality?.quarantinedCandles ?? null, priceBasis:history.quality?.priceBasis || null };
}

/** Promotion needs exact, full-history evidence; bounded split tests never qualify. */
export function assessProducts(row, policy, evidence = null) {
  const eligibility = Object.fromEntries(CAPABILITIES.map(k => [k,'BLOCKED']));
  const reasons = [];
  const identity = row.canonicalListingPresent && row.assetType === 'EQUITY' && row.issuerVerified && !row.identityConflict;
  const currency = validCurrency(row.tradingCurrency) && row.currencySourceVerified;
  if (identity) eligibility.SEARCH = eligibility.WATCHLIST = 'READY';
  if (!identity) reasons.push('CANONICAL_OR_EXACT_ISSUER_IDENTITY_NOT_ESTABLISHED');
  if (!currency) reasons.push('NATIVE_TRADING_CURRENCY_UNVERIFIED');
  if (!row.history.validCloseSeries) reasons.push(row.history.status === 'IDENTITY_OR_CURRENCY_MISMATCH' ? 'HISTORY_IDENTITY_OR_CURRENCY_MISMATCH' : 'VALID_CHART_HISTORY_NOT_DELIVERED');
  if (!row.latestPriceFresh) reasons.push('RECENT_PRICE_NOT_VALIDATED');
  if (identity && currency && row.history.validCloseSeries && row.latestPriceFresh && row.referenceActive !== false && row.issuerEntityStatus === 'ACTIVE') eligibility.CHART = 'PARTIAL';
  if (row.history.status === 'IDENTITY_OR_CURRENCY_MISMATCH' || row.history.status === 'INVALID_CLOSE_SERIES') eligibility.CHART = 'UNSAFE';

  const exactEvidence = evidence?.validated === true && evidence.listingId === row.listingId && evidence.isin === row.isin && evidence.mic === row.mic && evidence.currency === row.tradingCurrency &&
    /^[a-f0-9]{64}$/.test(row.historySHA256 || '') && evidence.historySHA256 === row.historySHA256;
  const facts = exactEvidence ? evidence : {};
  if (row.history.bars < policy.minHistoryBars) reasons.push('EXISTING_MINIMUM_HISTORY_NOT_MET');
  if (!row.exchangeTimezone) reasons.push('EXCHANGE_TIMEZONE_UNVERIFIED');
  if (row.referenceActive !== true) reasons.push('OFFICIAL_ACTIVE_LISTING_STATUS_UNVERIFIED_OR_INACTIVE');
  if (row.issuerEntityStatus !== 'ACTIVE') reasons.push('OFFICIAL_ACTIVE_ISSUER_STATUS_UNVERIFIED_OR_INACTIVE');
  if (!row.history.fullOHLCV && facts.fullHistoryOHLCVVerified !== true) reasons.push('COMPLETE_OHLCV_HISTORY_UNVERIFIED');
  if (facts.historyCompletenessVerified !== true) reasons.push('HISTORY_SESSION_COMPLETENESS_UNVERIFIED');
  if (facts.corporateActionsVerified !== true || facts.adjustmentSemanticsVerified !== true || facts.volumeBasisVerified !== true) reasons.push('FULL_HISTORY_CORPORATE_ACTION_AND_VOLUME_BASIS_UNVERIFIED');
  const turnover = Number.isFinite(facts.avgDailyTurnoverUSD) && facts.avgDailyTurnoverUSD >= policy.minDailyTurnoverUSD && facts.turnoverFXVerified === true;
  if (!turnover) reasons.push('EXISTING_USD_TURNOVER_POLICY_UNVERIFIED_NO_FX_SYNTHESIS');
  if (facts.primarySelectionVerified !== true) reasons.push('EXISTING_PRIMARY_OR_ADR_SELECTION_NOT_ESTABLISHED');
  const technical = identity && currency && row.latestPriceFresh && row.referenceActive === true && row.issuerEntityStatus === 'ACTIVE' && row.history.validCloseSeries && row.history.bars >= policy.minHistoryBars &&
    Boolean(row.exchangeTimezone) && row.history.fullOHLCV === true && exactEvidence && facts.sourceProvenanceVerified === true && facts.fullHistoryOHLCVVerified === true && facts.historyCompletenessVerified === true && facts.corporateActionsVerified === true &&
    ['PROVIDER_SPLIT_ADJUSTED','VU_SPLIT_ADJUSTED'].includes(facts.adjustmentBasis) && facts.adjustmentSemanticsVerified === true && facts.volumeBasisVerified === true && facts.primarySelectionVerified === true && turnover && facts.technicalEngineValidated === true;
  if (technical) {
    const ready = facts.adjustmentBasis === 'VU_SPLIT_ADJUSTED' ? 'READY_WITH_VU_ADJUSTMENT' : 'READY';
    eligibility.CHART = eligibility.SCREENER_TECHNICAL = eligibility.QUANT_TECHNICAL = ready;
    if (facts.supertraderEngineValidated === true) eligibility.SUPERTRADER = ready;
    if (facts.backtestValidated === true && facts.backtestCalendarVerified === true && facts.backtestPITCorporateActionsVerified === true &&
      facts.backtestSeriesBasis === 'TOTAL_RETURN_ADJUSTED' && facts.backtestDividendPolicyVerified === true && facts.backtestSurvivorshipPITUniverseVerified === true &&
      facts.backtestDelistingRightsVerified === true && facts.backtestExistingGatesPublishable === true && facts.backtestGateReportSHA256 === facts.existingGateReport?.reportSHA256 &&
      verifyExistingBacktestGateReport(facts.existingGateReport)) eligibility.BACKTEST = ready;
    if (facts.fundamentalCompanyJoinValidated === true && facts.fullCanonicalFactorsVerified === true && facts.PITVerified === true && facts.valuationShareBasisVerified === true && facts.valuationCurrencyBasisVerified === true) {
      eligibility.SCREENER_FUNDAMENTAL = eligibility.QUANT_FULL = ready;
    }
  }
  if (row.fundamentals?.fullCanonicalFactorsVerified !== true) reasons.push('COMPANY_FUNDAMENTALS_OR_FULL_QUANT_FACTOR_COVERAGE_INCOMPLETE');
  if (row.fundamentals?.valuationShareBasisVerified !== true) reasons.push('VALUATION_SHARE_CLASS_ADR_AND_CURRENCY_BASIS_UNVERIFIED');
  return { eligibility, blockingEvidence:sorted(reasons), isolatedEvidenceAccepted:exactEvidence, productionActivated:false };
}

function bestStatus(rows, capability) {
  const values = rows.map(x => x.products.eligibility[capability]);
  return ['READY','READY_WITH_VU_ADJUSTMENT','PARTIAL','BLOCKED','UNSAFE'].find(x => values.includes(x)) || 'BLOCKED';
}
function groupCompanies(rows, companiesByLEI) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.issuerLEI)) groups.set(row.issuerLEI, []);
    groups.get(row.issuerLEI).push(row);
  }
  return [...groups].map(([lei, listings]) => {
    const source = companiesByLEI.get(lei) || {};
    const securities = new Map();
    for (const row of listings) {
      if (!securities.has(row.isin)) securities.set(row.isin, []);
      securities.get(row.isin).push(row);
    }
    return { companyId:source.companyId || source.analyticalCompanyId || 'LEI:' + lei, companyIdNamespace:'ACCEPTED_ANALYTICAL_REGULATORY_ISSUER_NOT_NEW_CANONICAL_COMPANY',
      canonicalCompanyIds:sorted(listings.map(x => x.canonicalCompanyId)), issuerLEI:lei, companyName:source.legalName || listings[0].companyName,
      verifiedCompanionFusionCompanyIds:sorted(listings.filter(x => x.fundamentals.exactCompanyJoin).map(x => x.fundamentals.canonicalCompanyId)),
      fundamentalsJoinStatus:listings.some(x => x.fundamentals.exactCompanyJoin) ? 'EXACT_COMPANION_COMPANY_JOIN_PARTIAL_FUNDAMENTALS' : 'UNVERIFIED_CANONICAL_COMPANY_JOIN',
      issuerAssociationStatus:listings.every(x => x.issuerAssociationAssessment?.status === 'CONTRADICTED_QUOTED_ISSUER_ASSOCIATION') ? 'QUARANTINED_REFERENCE_ASSOCIATION' : 'REFERENCE_ASSOCIATION_NOT_INDEPENDENTLY_UNIVERSALLY_REVERIFIED',
      includedInSupportedCompanyCount:listings.some(x => x.issuerAssociationAssessment?.status !== 'CONTRADICTED_QUOTED_ISSUER_ASSOCIATION'),
      domicile:listings[0].domicile, entityStatus:source.entityStatus || source.issuerEntityStatus || listings[0].issuerEntityStatus,
      incorporationJurisdiction:source.incorporationJurisdiction || null, headquartersCountry:source.headquartersCountry || null,
      sector:null, industry:null, marketCap:null, marketCapBasis:'NOT_COMPUTED_WITHOUT_VERIFIED_COMPANY_SHARE_CLASS_AND_FX_BASIS',
      uniqueSecurities:securities.size, uniqueListings:listings.length, activeSecurities:[...securities.values()].filter(xs => xs.some(x => x.referenceActive === true)).length,
      documentedProviderProblemListings:listings.filter(x => x.qualityAssessment.documentedProblem).map(x => ({ listingIdentity:x.listingIdentity, reason:x.qualityAssessment.classification })),
      readinessBlockerCategory:listings.some(x => x.qualityAssessment.documentedProblem) ? 'DOCUMENTED_PROBLEM_ON_ONE_OR_MORE_LISTINGS_NOT_A_COMPANY_WIDE_REJECTION' : 'INCOMPLETE_FITNESS_EVIDENCE',
      selectedResearchListing:listings.find(x => x.selectedResearchListing)?.listingId || null,
      productEligibility:Object.fromEntries(CAPABILITIES.map(k => [k,bestStatus(listings,k)])),
      securities:[...securities].sort(([a],[b]) => a.localeCompare(b,'en')).map(([isin, xs]) => ({ securityId:xs[0].securityId, isin, shareType:xs[0].shareType,
        referenceActive:xs.some(x => x.referenceActive === true), listingIdentities:xs.map(x => x.listingIdentity), listingIds:sorted(xs.map(x => x.listingId)),
        providerSymbols:sorted(xs.flatMap(x => x.providerSymbols)), productEligibility:Object.fromEntries(CAPABILITIES.map(k => [k,bestStatus(xs,k)])) })),
      listingIdentities:listings.map(x => x.listingIdentity) };
  }).sort((a,b) => a.companyId.localeCompare(b.companyId,'en'));
}
function countReady(rows, capability) { return rows.filter(x => ['READY','READY_WITH_VU_ADJUSTMENT'].includes(x.products.eligibility[capability])).length; }
function countReadySecurities(rows, capability) { return new Set(rows.filter(x => ['READY','READY_WITH_VU_ADJUSTMENT'].includes(x.products.eligibility[capability])).map(x => x.isin)).size; }

/** Lossless report-only interning. The browser/product directory never loads this audit. */
export function compactEuropeCoverage(artifact) {
  const dictionaries={history:[],fundamentals:[],products:[],eligibility:[],quality:[],issuerAssociation:[]}, indexes=Object.fromEntries(Object.keys(dictionaries).map(k=>[k,new Map()]));
  const intern=(kind,value)=>{
    const key=JSON.stringify(value);let id=indexes[kind].get(key);
    if(id===undefined){id=dictionaries[kind].length;indexes[kind].set(key,id);dictionaries[kind].push(value);}
    return {$ref:'#/dictionaries/'+kind+'/'+id};
  };
  const defaultsOf=rows=> {
    if(!rows.length)return {};
    const defaults={};
    for(const key of Object.keys(rows[0])) {
      const frequencies=new Map();
      for(const row of rows) { const value=row[key];if(value===null || ['string','boolean','number'].includes(typeof value)) {
        const encoded=JSON.stringify(value);frequencies.set(encoded,(frequencies.get(encoded)||0)+1);
      }}
      for(const [encoded,count] of frequencies) if(count>rows.length/2) {defaults[key]=JSON.parse(encoded);break;}
    }
    return defaults;
  };
  const omitDefaults=(row,defaults)=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!Object.hasOwn(defaults,key) || JSON.stringify(value)!==JSON.stringify(defaults[key])));
  const listingDefaults=defaultsOf(artifact.listings), companyDefaults=defaultsOf(artifact.companies);
  const listings=artifact.listings.map(row=>{const out=omitDefaults(row,listingDefaults);
    out.history=intern('history',row.history);out.fundamentals=intern('fundamentals',row.fundamentals);out.products=intern('products',row.products);
    if(row.qualityAssessment)out.qualityAssessment=intern('quality',row.qualityAssessment);
    if(row.issuerAssociationAssessment)out.issuerAssociationAssessment=intern('issuerAssociation',row.issuerAssociationAssessment);return out;});
  const companies=artifact.companies.map(row=>{const out=omitDefaults(row,companyDefaults);out.productEligibility=intern('eligibility',row.productEligibility);
    out.securities=row.securities.map(security=>({...security,productEligibility:intern('eligibility',security.productEligibility)}));return out;});
  return {...artifact,schemaVersion:'marketstack-company-product-readiness-1.1.0',dictionaryEncoding:'LOSSLESS_JSON_POINTER_VALUES_AND_SHARED_ROW_DEFAULTS',
    listingDefaults,companyDefaults,dictionaries,companies,listings};
}
export function expandCompanyCoverage(artifact) {
  if(!artifact.dictionaryEncoding)return artifact;
  if(artifact.dictionaryEncoding!=='LOSSLESS_JSON_POINTER_VALUES_AND_SHARED_ROW_DEFAULTS')throw Error('UNKNOWN_COMPANY_COVERAGE_ENCODING');
  const deref=value=>{
    if(!value || typeof value!=='object' || !value.$ref)return value;
    const match=/^#\/dictionaries\/(history|fundamentals|products|eligibility|quality|issuerAssociation)\/(\d+)$/.exec(value.$ref);
    if(!match || !artifact.dictionaries?.[match[1]]?.[Number(match[2])])throw Error('INVALID_COMPANY_COVERAGE_REFERENCE');
    return artifact.dictionaries[match[1]][Number(match[2])];
  };
  return {...artifact,listings:artifact.listings.map(row=>({...artifact.listingDefaults,...row,history:deref(row.history),fundamentals:deref(row.fundamentals),products:deref(row.products),
    ...(row.qualityAssessment ? {qualityAssessment:deref(row.qualityAssessment)} : {}),
    ...(row.issuerAssociationAssessment ? {issuerAssociationAssessment:deref(row.issuerAssociationAssessment)} : {})})),
    companies:artifact.companies.map(row=>({...artifact.companyDefaults,...row,productEligibility:deref(row.productEligibility),securities:row.securities.map(security=>({...security,productEligibility:deref(security.productEligibility)}))}))};
}
function countStats(rows, companies) {
  const active = rows.filter(x => x.referenceActive === true);
  return { provenCompanies:companies.length, uniqueEquitySecurities:new Set(rows.map(x => x.isin)).size, uniqueEquityListings:rows.length,
    activeEquities:new Set(active.map(x => x.isin)).size, activeCompanies:new Set(active.map(x => x.issuerLEI)).size,
    selectedBoundedResearchCompanies:new Set(rows.filter(x => x.selectedResearchListing).map(x => x.issuerLEI)).size,
    consumerPolicyCertifiedEquities:countReadySecurities(rows,'QUANT_TECHNICAL'), consumerPolicyActualEligibleEquities:null,
    searchableListings:countReady(rows,'SEARCH'), watchlistCompatibleListings:countReady(rows,'WATCHLIST'),
    boundedChartListings:rows.filter(x => ['READY','READY_WITH_VU_ADJUSTMENT','PARTIAL'].includes(x.products.eligibility.CHART)).length,
    technicalDataEligible:countReadySecurities(rows,'SCREENER_TECHNICAL'), quantTechnicalEligible:countReadySecurities(rows,'QUANT_TECHNICAL'), quantFullEligible:countReadySecurities(rows,'QUANT_FULL'),
    supertraderEligible:countReadySecurities(rows,'SUPERTRADER'), backtestEligible:countReadySecurities(rows,'BACKTEST'),
    usableBoundedChartCompanies:new Set(rows.filter(x => ['READY','READY_WITH_VU_ADJUSTMENT','PARTIAL'].includes(x.products.eligibility.CHART)).map(x => x.issuerLEI)).size };
}

export function buildCompanyMasters({ germany, europe, canonical, policy, calendar, issuerReference = null, issuerRoleControls = null, histories = new Map(), historyHashes = new Map(), fusion = null, fitnessEvidence = null, asOf = '2026-10-02', provenance = [] }) {
  const canonicalByKey = new Map();
  for (const row of canonical.listings || []) {
    const key = identityKey(row);
    if (canonicalByKey.has(key)) throw Error('DUPLICATE_CANONICAL_ISIN_MIC_CURRENCY');
    canonicalByKey.set(key,row);
  }
  const germanByKey = new Map((germany.listings || []).map(x => [x.listingIdentityKey,x]));
  const issuerReferenceByISIN=new Map((issuerReference?.records || []).map(x=>[x.isin,x]));
  const issuerRoleByAssociation=new Map();
  for(const control of issuerRoleControls?.controls || []) {
    if(control.classification !== 'CONTRADICTED_QUOTED_ISSUER_ASSOCIATION' || !control.referenceIssuerLEI || !control.isin || !control.sources?.length ||
      control.sources.some(x=>x.status!==200 || !/^https:\/\//.test(x.url || '') || !/^[a-f0-9]{64}$/.test(x.sha256 || '')))throw Error('UNVERIFIED_ISSUER_ROLE_CONTROL');
    issuerRoleByAssociation.set(control.isin+'|'+control.referenceIssuerLEI,control);
  }
  const fusionByListing = new Map();
  for (const company of fusion?.companies || []) if (company.exactCompanyJoin === true && company.companyId && company.issuerLEI) {
    for (const id of company.listingIds || []) fusionByListing.set(id,company);
  }
  const evidenceByListing = new Map();
  if (fitnessEvidence) {
    if (fitnessEvidence.schemaVersion !== 'marketstack-listing-product-fitness-evidence-1.0.0') throw Error('UNSUPPORTED_LISTING_FITNESS_EVIDENCE_SCHEMA');
    for (const row of fitnessEvidence.listings || []) {
      if (evidenceByListing.has(row.listingId)) throw Error('DUPLICATE_FITNESS_EVIDENCE');
      evidenceByListing.set(row.listingId,row);
    }
  }
  const enrich = source => {
    const key = source.listingIdentityKey || [source.isin,source.mic,source.tradingCurrency].join('|');
    const c = canonicalByKey.get(key) || null;
    const german = germanByKey.get(key);
    const issuerLEI = source.issuerLEI;
    const issuerRoleControl=issuerRoleByAssociation.get(source.isin+'|'+issuerLEI);
    const referenceIssuerVerified = Boolean(issuerLEI && (source.analyticalCompanyId || source.companyId) === 'LEI:' + issuerLEI && (source.domicileCountry || source.issuerDomicile));
    const issuerVerified=referenceIssuerVerified && !issuerRoleControl;
    const companyFusion = c && fusionByListing.get(c.listingId);
    const exactFusion = Boolean(companyFusion && companyFusion.issuerLEI === issuerLEI && companyFusion.isin === source.isin);
    const history = inspectHistory(c && histories.get(c.listingId), c || {});
    const age = history.lastDate ? Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(history.lastDate + 'T00:00:00Z')) / 86400000) : null;
    const maxAge = germany.selectionPolicy?.inheritedPriceFreshnessCalendarDays ?? 7;
    const row = { listingIdentity:key, listingId:c?.listingId || null, securityId:c?.securityId || 'sec_isin_' + source.isin,
      analyticalCompanyId:source.analyticalCompanyId || source.companyId || null, canonicalCompanyId:c?.companyId || null,
      issuerLEI, companyName:source.legalName || source.issuerName || null, isin:source.isin,
      ticker:c?.ticker || null, providerSymbol:c?.providerSymbol || source.providerSymbol || source.providerSymbols?.[0] || null,
      providerSymbols:sorted(source.providerAliases || source.providerSymbols || [source.providerSymbol]), exchange:c?.exchange || null, mic:source.mic,
      shareType:source.shareType || source.verifiedSecurityType, domicile:source.domicileCountry || source.issuerDomicile || null,
      listingCountry:source.listingCountry || (german ? 'DE' : null), tradingCurrency:source.tradingCurrency, reportingCurrency:c?.reportingCurrency || null,
      sector:null, industry:null, marketCap:null, issuerVerified, issuerEntityStatus:source.issuerEntityStatus || null,
      referenceActive:source.instrumentActive ?? source.listingActive ?? null,
      canonicalListingPresent:Boolean(c), assetType:c?.assetType || source.assetType || 'EQUITY',
      identityConflict:Boolean(issuerRoleControl || source.issuerConflict || source.statusConflict || source.assetTypeConflict || ['IDENTITY_CONFLICT','QUARANTINED'].includes(german?.providerIdentityStatus)),
      issuerAssociationAssessment:{ status:issuerRoleControl ? 'CONTRADICTED_QUOTED_ISSUER_ASSOCIATION' : 'ACCEPTED_REFERENCE_ASSOCIATION_NOT_UNIVERSALLY_REVERIFIED',
        referenceIssuerVerified, referenceStatus:issuerReferenceByISIN.get(source.isin)?.status || null,
        quotedIssuerName:issuerRoleControl?.quotedIssuerName || null, quotedIssuerPublicReferenceCountry:issuerRoleControl?.quotedIssuerPublicReferenceCountry || null,
        evidence:issuerRoleControl?.evidence || null, evidenceSource:'reports/marketstack/marketstack_issuer_role_controls.json', sourceControlsAreCanonicalRewrite:false },
      providerIdentityStatus:german?.providerIdentityStatus || (c ? 'ACCEPTED_CANONICAL_LISTING' : 'NOT_TESTED'),
      currencySourceVerified:Boolean(c?.currencySource?.source_system && validCurrency(c?.tradingCurrency)),
      exchangeTimezone:calendar.exchanges?.[source.mic]?.timezone || null,
      selectedResearchListing:german?.selectedConsumerListing === true, researchSelectionIsProductionConsumerEligibility:false,
      history, historySHA256:c ? historyHashes.get(c.listingId) || null : null,
      latestPriceDate:history.lastDate || german?.latestValidatedDate || null, latestPriceCalendarAgeDays:age,
      latestPriceFresh:history.validCloseSeries && age !== null && age >= 0 && age <= maxAge,
      latestPriceValidity:history.validCloseSeries ? 'ACCEPTED_BOUNDED_CLOSE_NOT_FULL_OHLC_CERTIFICATION' : german?.priceValidationStatus || 'NOT_TESTED',
      corporateActionCoverage:c?.coverage?.corporate_actions || 'UNKNOWN', adjustmentBasis:c?.corporateActionBasis || 'UNVERIFIED',
      fundamentals:{ availability:exactFusion ? companyFusion.fundamentalsStatus : 'UNVERIFIED_EXACT_COMPANY_JOIN',
        exactCompanyJoin:exactFusion, canonicalCompanyId:exactFusion ? companyFusion.companyId : c?.companyId || null,
        SEC:exactFusion && companyFusion.sampleRole === 'US_SEC_CONTROL' ? 'PARTIAL' : 'UNVERIFIED_LOCAL_LISTING_COMPANY_LINK',
        ESEF:exactFusion && companyFusion.sampleRole === 'LOCAL_EUROPEAN_LISTING' && companyFusion.fundamentalsStatus === 'OFFICIAL_ANNUAL_PARTIAL' ? 'PARTIAL' : 'UNVERIFIED',
        fullCanonicalFactorsVerified:false, valuationShareBasisVerified:false },
      logoStatus:'UNVERIFIED_EXACT_COMPANY_ASSET_LINK', searchStatus:c ? 'ACCEPTED_CANONICAL_DIRECTORY' : 'NOT_IN_CANONICAL_DIRECTORY',
      chartStatus:c && history.validCloseSeries ? 'ACCEPTED_BOUNDED_NATIVE_CURRENCY_CHART' : 'NOT_DELIVERED', watchlistStatus:c ? 'ACCEPTED_LISTING_ID_COMPATIBLE' : 'NOT_IN_CANONICAL_DIRECTORY' };
    const qualityCategory = row.identityConflict ? 'DOCUMENTED_IDENTITY_OR_PROVIDER_QUARANTINE' :
      ['INVALID_CLOSE_SERIES','IDENTITY_OR_CURRENCY_MISMATCH'].includes(history.status) ? 'DOCUMENTED_HISTORY_CONTRACT_ERROR' :
      history.quarantinedProviderCandles > 0 ? 'DOCUMENTED_REJECTED_PROVIDER_CANDLES_IN_HISTORY' : german?.priceValidationStatus === 'MISSING' ? 'DOCUMENTED_MISSING_LATEST_BOUNDED_WINDOW' : 'VALIDATION_INCOMPLETE_NO_ADDITIONAL_DEFECT_CLAIM';
    row.qualityAssessment={ classification:qualityCategory, documentedProblem:qualityCategory !== 'VALIDATION_INCOMPLETE_NO_ADDITIONAL_DEFECT_CLAIM',
      boundedPriceValidation:german?.priceValidationStatus || null, providerIdentityStatus:row.providerIdentityStatus, fullHistorySafety:'NOT_ESTABLISHED' };
    row.products = assessProducts(row,policy,evidenceByListing.get(c?.listingId));
    return row;
  };
  const germanRows = germany.listings.filter(x => x.issuerDomicileClassification === 'GERMAN_DOMICILED_ISSUER' && GERMAN_TYPES.has(x.shareType)).map(enrich).sort((a,b) => a.listingIdentity.localeCompare(b.listingIdentity,'en'));
  const germanCompanies = groupCompanies(germanRows,new Map(germany.germanCompanies.map(x => [x.issuerLEI,x])));
  const supportedGermanRows=germanRows.filter(x=>x.issuerAssociationAssessment.status!=='CONTRADICTED_QUOTED_ISSUER_ASSOCIATION');
  const supportedGermanCompanies=groupCompanies(supportedGermanRows,new Map(germany.germanCompanies.map(x => [x.issuerLEI,x])));
  const europeRows = europe.listings.filter(x => x.assetType === 'EQUITY' && EQUITY_TYPES.has(x.verifiedSecurityType) && COUNTRIES.includes(x.issuerDomicile) && x.companyId && !x.issuerConflict).map(enrich).sort((a,b) => a.listingIdentity.localeCompare(b.listingIdentity,'en'));
  const europeCompanies = groupCompanies(europeRows,new Map(europe.companies.map(x => [x.lei,x])));
  const supportedEuropeRows=europeRows.filter(x=>x.issuerAssociationAssessment.status!=='CONTRADICTED_QUOTED_ISSUER_ASSOCIATION');
  const supportedEuropeCompanies=groupCompanies(supportedEuropeRows,new Map(europe.companies.map(x => [x.lei,x])));
  const unresolvedGerman = germany.listings.filter(x => x.issuerDomicileClassification === 'AMBIGUOUS_ISSUER_DOMICILE').map(x => ({ listingIdentity:x.listingIdentityKey, isin:x.isin, providerSymbol:x.providerSymbol,
    mic:x.mic, officialName:x.officialName, shareType:x.shareType, candidateGermanISINPrefix:x.isin?.startsWith('DE') === true,
    domicileProof:false, reason:'EXACT_ISSUER_DOMICILE_UNRESOLVED_ISIN_PREFIX_AND_VENUE_ARE_NOT_COMPANY_PROOF' }));
  const ambiguousISINs=new Set(unresolvedGerman.map(x=>x.isin)), probableByLEI=new Map();
  for(const reference of issuerReference?.records || []) if(ambiguousISINs.has(reference.isin) && reference.status === 'REGULATORY_ISSUER_CONFLICT' && reference.issuerConflict === true &&
    reference.domicileCountry === 'DE' && reference.domicileBasis === 'GLEIF_LEGAL_ADDRESS_COUNTRY' && /^[A-Z0-9]{20}$/.test(reference.lei || '') &&
    reference.sourceEvidence?.leiRecordURL === 'https://api.gleif.org/api/v1/lei-records/'+reference.lei && /^[a-f0-9]{64}$/.test(reference.sourceEvidence?.leiBatchResponseSHA256 || '')) {
    if(!probableByLEI.has(reference.lei))probableByLEI.set(reference.lei,{ candidateIssuerLEI:reference.lei, companyName:reference.legalName, referenceLegalDomicile:'DE',
      issuerToSecurityAssociation:'PROBABLE_NOT_PROVEN_REGULATORY_ISSUER_CONFLICT', securityISINs:[], conflictingRegulatoryIssuerLEIs:[],sourceEvidence:reference.sourceEvidence,
      canonicalCompanyId:null, includedInProvenCompanyCount:false, includedInActiveEquityCount:false, productionActivated:false });
    const candidate=probableByLEI.get(reference.lei);candidate.securityISINs=sorted([...candidate.securityISINs,reference.isin]);
    candidate.conflictingRegulatoryIssuerLEIs=sorted([...candidate.conflictingRegulatoryIssuerLEIs,...(reference.conflictingRegulatoryIssuerLEIs || [])]);
  }
  const probableGermanCompanies=[...probableByLEI.values()].sort((a,b)=>a.candidateIssuerLEI.localeCompare(b.candidateIssuerLEI,'en'));
  const deExtra = europeCompanies.filter(x => x.domicile === 'DE' && !germanCompanies.some(y => y.issuerLEI === x.issuerLEI)).map(x => ({ companyId:x.companyId, companyName:x.companyName, securityISINs:x.securities.map(y => y.isin), scope:'BROADER_EUROPEAN_CFI_EQUITY_OR_DEPOSITARY_RECEIPT_SCOPE_NOT_GERMAN_ORDINARY_PREFERRED_UNIVERSE_ADDITION' }));
  const generatedAt=latestSourceTimestamp([germany.generatedAt,europe.generatedAt,canonical.generatedAt,issuerReference?.generatedAt,issuerRoleControls?.generatedAt,
    fusion?.generatedAt,fitnessEvidence?.generatedAt,...[...histories.values()].map(x=>x.retrievedAt)]) || asOf + 'T00:00:00.000Z';
  const common = { schemaVersion:'marketstack-company-product-readiness-1.0.0', generatedAt,evaluationDate:asOf,
    scope:'ACCEPTED_PR334_REGULATORY_ISSUER_AND_LISTING_CENSUS_READ_ONLY_PRODUCT_EVIDENCE', evidenceSnapshotAsOf:germany.marketDataSnapshotAsOf || germany.generatedAt,
    productionActivated:false, providerDecision:null, MarketstackRequests:0, MarketstackCredits:0, inputProvenance:provenance,
    policy:{ source:'quant/config/global-equities.json', minHistoryBars:policy.minHistoryBars, minDailyTurnoverUSD:policy.minDailyTurnoverUSD, rawCurrencyConversionPerformed:false,
      boundedChartSupportIsTechnicalOrConsumerAdmission:false, companyDeduplication:'EXACT_REGULATORY_ISSUER_LEI', securityDeduplication:'EXACT_ISIN', listingDeduplication:'ISIN|MIC|TRADING_CURRENCY' },
    limitations:['Analytical LEI company IDs are the accepted census namespace; absent canonical company links remain null. No production identities are created.',
      'Official active reference status is a snapshot, not a guarantee of continuous trading or liquidity.',
      'Only accepted canonical bounded close histories support PARTIAL EOD charts. They cannot certify full OHLCV, action adjustments, technical strategies or backtests.',
      'Consumer policy certification and technical product validation are separate from 218 bounded German research proposals. Complete consumer-eligible counts remain unknown.',
      'No company fundamental data is copied per listing. Exact companion fusion evidence is referenced; full-factor and valuation safety remain separate hard gates.',
      'Germany ordinary/preferred company scope (432) differs from broader Europe CFI equity scope including depositary issuers; country counts do not claim complete national universes.',
      'Accepted PR334 reference-association counts remain visible. Three exact FIRDS issuer associations are contradicted by official quoted-issuer evidence and excluded from supported product-fitness counts without rewriting source censuses or canonical identities.',
      'Unknown sector, industry, market cap, logos and unproven reporting currencies are not filled from name similarity, listing venue or ordinary/ADR share assumptions.'] };
  const germanyMaster = { ...common, counts:{...countStats(supportedGermanRows,supportedGermanCompanies), PROVEN_GERMAN_COMPANIES:supportedGermanCompanies.length,
    acceptedReferenceMappedCompanies:germanCompanies.length,acceptedReferenceActiveEquitySecurities:new Set(germanRows.filter(x=>x.referenceActive===true).map(x=>x.isin)).size,
    acceptedReferenceEquityListings:germanRows.length, knownContradictedIssuerCompanyAssociations:germanCompanies.length-supportedGermanCompanies.length,
    directANNAUncontradictedCompanyAssociations:new Set(supportedGermanRows.filter(x=>x.issuerAssociationAssessment.referenceStatus==='EXACT_GLEIF_ISIN_LEI_REFERENCE').map(x=>x.issuerLEI)).size,
    supportedCompanyCountScope:'REFERENCE_ASSOCIATIONS_AFTER_EXACT_KNOWN_ISSUER_ROLE_QUARANTINES_NOT_ALL_ISSUERS_INDEPENDENTLY_REVERIFIED',
    PROBABLE_GERMAN_COMPANIES:probableGermanCompanies.length, UNRESOLVED_GERMAN_CANDIDATE_SECURITY_ISINS:new Set(unresolvedGerman.filter(x => x.candidateGermanISINPrefix).map(x => x.isin)).size,
    unresolvedIssuerListingsOnGermanVenues:unresolvedGerman.length, completeGermanCompanyUniverse:null, broaderEuropeanScopeAdditionalGermanIssuers:deExtra.length },
    completenessEvidence:{ rawGermanVenueEquityListings:germany.counts.distinctEquityListingIdentities, foreignOrdinaryPreferredListings:germany.counts.ForeignEquitiesTradedOnGermanVenuesVerified,
      probableCompanyCountState:'OBSERVED_GLEIF_GERMAN_LEGAL_ISSUER_WITH_CONFLICTING_SECURITY_ASSOCIATION_NOT_COMPLETE_UNIVERSE', probableGermanCompanies, additionalBroaderScopeIssuers:deExtra,
      nationalCompleteness:'UNPROVEN_PROVIDER_TYPING_AND_DOMICILE_GAPS', unresolvedCandidates:unresolvedGerman }, companies:germanCompanies, listings:germanRows };
  const germanyEligibility = { ...common, counts:germanyMaster.counts, companies:germanCompanies.map(x => ({ companyId:x.companyId, companyName:x.companyName, selectedResearchListing:x.selectedResearchListing, eligibility:x.productEligibility })),
    listings:germanRows.map(x => ({ listingId:x.listingId, listingIdentity:x.listingIdentity, companyId:x.analyticalCompanyId, securityId:x.securityId, isin:x.isin, providerSymbol:x.providerSymbol, mic:x.mic,
      eligibility:x.products.eligibility, blockingEvidence:x.products.blockingEvidence, historyBars:x.history.bars, historySHA256:x.historySHA256, selectedResearchListing:x.selectedResearchListing, productionActivated:false })) };
  const europeCoverage = { ...common, counts:{...countStats(supportedEuropeRows,supportedEuropeCompanies),acceptedReferenceMappedCompanies:europeCompanies.length,
    acceptedReferenceActiveEquitySecurities:new Set(europeRows.filter(x=>x.referenceActive===true).map(x=>x.isin)).size,
    knownContradictedIssuerCompanyAssociations:europeCompanies.length-supportedEuropeCompanies.length,
    supportedCompanyCountScope:'REFERENCE_ASSOCIATIONS_AFTER_EXACT_KNOWN_ISSUER_ROLE_QUARANTINES_NOT_ALL_ISSUERS_INDEPENDENTLY_REVERIFIED'}, countries:COUNTRIES.map(country => {
    const rows = supportedEuropeRows.filter(x => x.domicile === country), companies = supportedEuropeCompanies.filter(x => x.domicile === country), venue = europe.countries.find(x => x.country === country);
    return { country, countBasis:'PROVEN_ISSUER_LEGAL_DOMICILE_ACROSS_ALL_OBSERVED_EUROPEAN_VENUES', ...countStats(rows,companies),
      acceptedReferenceMappedCompanies:europeCompanies.filter(x=>x.domicile===country).length,
      acceptedReferenceActiveEquitySecurities:new Set(europeRows.filter(x=>x.domicile===country&&x.referenceActive===true).map(x=>x.isin)).size,
      venueETFListingCandidates:venue?.uniqueETFListings ?? null, venueUnclassifiedInstruments:venue?.unclassifiedInstruments ?? null,
      unresolvedDomicileCandidates:null, completeCompanyUniverse:null, rawVenueObservations:venue?.rawObservations ?? null };
  }), unresolvedIssuerListings:europe.listings.filter(x => x.assetType === 'EQUITY' && !x.companyId).map(x => ({ listingIdentity:x.listingIdentity, isin:x.isin, listingCountry:x.listingCountry,
    issuerResolutionState:x.issuerResolutionState, domicile:null, scope:'UNASSIGNED_TO_COUNTRY_NO_VENUE_DOMICILE_INFERENCE' })), companies:europeCompanies, listings:europeRows };
  return { germanyMaster, germanyEligibility, europeCoverage };
}

export function run(root = process.cwd(), options = {}) {
  root = resolve(root);
  const inputs = [];
  const load = file => { const path = resolve(root,file), bytes = readFileSync(path); inputs.push({ inputPath:relative(root,path).split('\\').join('/'), sha256:sha(bytes) }); return JSON.parse(bytes); };
  const germany = load('reports/marketstack/germany_company_listing_finalization.json'), europe = load('reports/marketstack/europe_company_listing_census.json');
  const issuerReference=load('reports/marketstack/germany_company_issuer_reference.json');
  const issuerRoleControls=load('reports/marketstack/marketstack_issuer_role_controls.json');
  const canonical = load('quant/data/global-market/listings.json'), policy = load('quant/config/global-equities.json'), calendar = load('quant/config/market-calendar.json');
  inputs.push({ inputPath:'scripts/market/build-marketstack-company-product-masters.mjs',sha256:sha(readFileSync(join(root,'scripts/market/build-marketstack-company-product-masters.mjs'))) });
  inputs.push({ inputPath:'scripts/supertrader/engine/gates.mjs',sha256:sha(readFileSync(join(root,'scripts/supertrader/engine/gates.mjs'))) });
  const histories = new Map(), historyHashes = new Map();
  for (const row of canonical.listings) {
    if (!/^[A-Za-z0-9_-]+$/.test(row.listingId)) throw Error('UNSAFE_LISTING_ID');
    const file = 'quant/data/global-market/history/' + row.listingId + '.json';
    if (existsSync(join(root,file))) { histories.set(row.listingId,load(file)); historyHashes.set(row.listingId,inputs.at(-1).sha256); }
  }
  const fusionPath = options.fusion || 'reports/marketstack/fundamental_price_fusion_validation.json';
  const fusion = existsSync(resolve(root,fusionPath)) ? load(fusionPath) : null;
  const fitnessEvidence = options.fitnessEvidence ? load(options.fitnessEvidence) : null;
  const out = buildCompanyMasters({ germany,europe,canonical,policy,calendar,issuerReference,issuerRoleControls,histories,historyHashes,fusion,fitnessEvidence,asOf:options.asOf || '2026-10-02',provenance:inputs });
  const destination = resolve(root,options.output || 'reports/marketstack'); mkdirSync(destination,{recursive:true});
  for (const [name,data] of [['germany_company_master',out.germanyMaster],['germany_product_eligibility',out.germanyEligibility],['europe_company_coverage',compactEuropeCoverage(out.europeCoverage)]]) writeFileSync(join(destination,name+'.json'),JSON.stringify(data,null,name==='europe_company_coverage' ? undefined : 2)+'\n');
  if (options.document !== false) writeFileSync(join(root,'docs/MARKETSTACK_COMPANY_PRODUCT_READINESS.md'), renderDocument(out));
  return out;
}

function renderDocument({germanyMaster:g,europeCoverage:e}) {
  const esc = text => String(text ?? '').replaceAll('|','\\|').replaceAll('\n',' ');
  return `# Marketstack company product readiness\n\nThis read-only report enriches the accepted PR334 census; it adds no provider calls or production admission. Reproduce with \`node scripts/market/build-marketstack-company-product-masters.mjs\`. Fixed evaluation date: ${g.evaluationDate}. Report provenance timestamp: ${g.generatedAt}, the latest input timestamp, including public issuer-role controls. Input bytes, including each accepted close-history file, are hashed in the machine artifacts.\n\nGerman venues contain ${g.completenessEvidence.rawGermanVenueEquityListings} distinct equity-candidate listings, not that many German companies. The accepted reference baseline identifies **${g.counts.acceptedReferenceMappedCompanies} issuer associations, ${g.counts.acceptedReferenceActiveEquitySecurities} reference-active share classes** and ${g.counts.acceptedReferenceEquityListings} listings. The issuer-role cross-check quarantines ${g.counts.knownContradictedIssuerCompanyAssociations} exact FIRDS associations: EVT Limited mapped to Greater Union Filmpalast GmbH; Nippon Carbon mapped to Kornmeyer Carbon-Group GmbH; Sixty Six Capital mapped to Northern Data AG. Public official issuer sources contradict those security associations. After these known quarantines, **${g.counts.provenCompanies} supported German company associations and ${g.counts.activeEquities} reference-active classes** remain. Of these, ${g.counts.directANNAUncontradictedCompanyAssociations} company associations have direct ANNA mapping; the remaining two are uncontradicted FIRDS-only references. This is not a claim that every remaining issuer has been independently reverified. The source census and all 432 named reference rows are preserved with explicit exclusion status. ${g.counts.selectedBoundedResearchCompanies} companies have a selected bounded research proposal. ${g.counts.usableBoundedChartCompanies} companies have at least one accepted recent native-currency bounded close chart; this is PARTIAL EOD support, not technical or full Quant certification.\n\n**Certified technical, full Quant, SuperTrader and backtest admissions: ${g.counts.quantTechnicalEligible}/${g.counts.quantFullEligible}/${g.counts.supertraderEligible}/${g.counts.backtestEligible}.** Complete consumer-eligible and complete national-universe counts remain unknown. The existing policy requires ${g.policy.minHistoryBars} bars and $${g.policy.minDailyTurnoverUSD.toLocaleString('en-US')} average daily turnover. No FX conversion, market-cap threshold or admission-policy relaxation is introduced.\n\nThe broader European equity census includes depositary-receipt and other CFI-equity classes. Its German domicile count differs by scope; the ${g.counts.broaderEuropeanScopeAdditionalGermanIssuers} extra issuers are listed separately in the master and do not increase the German ordinary/preferred count. ${g.counts.unresolvedIssuerListingsOnGermanVenues} German-venue listings have unresolved issuer domicile; ${g.counts.UNRESOLVED_GERMAN_CANDIDATE_SECURITY_ISINS} unresolved ISIN has a DE prefix. A prefix or venue is not domicile evidence. ${g.counts.PROBABLE_GERMAN_COMPANIES} probable German issuer association is separately recorded: ERWE Immobilien AG has a German GLEIF legal address but conflicting ANNA/FIRDS issuer mappings. It remains excluded from both the accepted 432 reference-company associations and the supported-company/active-equity counts; the complete probable universe remains unknown.\n\nSearch/watchlist READY means an existing accepted canonical listing can be addressed by identity; it does not activate a new consumer-universe member. Chart PARTIAL means accepted bounded native close data only. Technical/Quant/SuperTrader/backtest readiness additionally requires full-history OHLCV, exact currency, session completeness, independently established action/volume semantics, sufficient history, verified USD liquidity and existing primary/ADR selection. Full Quant also needs an exact company fundamentals join, PIT coverage and valuation basis. Bounded split tests never promote full histories. Missing data remains null. ${g.companies.filter(x=>x.documentedProviderProblemListings.length>0).length} German companies have at least one listing with a documented rejected provider candle, missing sampled current window, or identity quarantine; the affected listing and evidence are identified separately. A problem at one venue is not a company-wide rejection. Other blocked capabilities remain incomplete validation, not a claim that the provider is defect-free.\n\nCompany IDs beginning LEI: retain the accepted analytical regulatory issuer namespace. Canonical Company IDs remain separate and null where unlinked. Sector, industry, market cap and logos remain unverified rather than inferred from similar names. An exact companion fundamentals join is referenced without copying financial facts to every listing.\n\n## Europe by issuer domicile\n\n|Country|Supported company associations|Reference-active securities|Bounded chart companies|Technical certified|Full Quant certified|SuperTrader certified|Backtest certified|Venue ETF candidates|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${e.countries.map(x => `|${x.country}|${x.provenCompanies}|${x.activeEquities}|${x.usableBoundedChartCompanies}|${x.technicalDataEligible}|${x.quantFullEligible}|${x.supertraderEligible}|${x.backtestEligible}|${x.venueETFListingCandidates}|`).join('\n')}\n\nEquity-company columns use issuer domicile across observed European venues; ETF and raw/unclassified instrument columns use venue geography. Neither claims complete national coverage. Unresolved issuers are left unassigned to countries.\n\n## Named German company master\n\nAll 432 accepted named reference-company rows remain in the machine master and table, including the three explicitly quarantined associations. Supported counts exclude them; no new identity or parent mapping is synthesized. The machine master contains all company, security and listing identities, history ranges, native currencies, coverage evidence and blocked-capability reasons. This table chooses one research listing when available; otherwise it lists observed symbols without selecting a production primary listing.\n\n|Company|Issuer LEI|Issuer association|Active classes|Observed symbols|Research listing|Chart|Technical Quant|Full Quant|SuperTrader|Backtest|\n|---|---|---|---:|---|---|---|---|---|---|---|\n${g.companies.map(x => { const rows=g.listings.filter(y=>y.issuerLEI===x.issuerLEI);return `|${esc(x.companyName)}|${x.issuerLEI}|${x.issuerAssociationStatus}|${x.activeSecurities}|${esc(sorted(rows.map(y=>y.providerSymbol)).join(', '))}|${esc(rows.find(y=>y.selectedResearchListing)?.providerSymbol || '')}|${x.productEligibility.CHART}|${x.productEligibility.QUANT_TECHNICAL}|${x.productEligibility.QUANT_FULL}|${x.productEligibility.SUPERTRADER}|${x.productEligibility.BACKTEST}|`; }).join('\n')}\n\nThe Europe artifact uses lossless JSON-pointer value dictionaries and shared row defaults to avoid repeating gate/provenance objects. Import \`expandCompanyCoverage\` from the builder to restore every company/security/listing field; top-level counts and countries are directly readable. This audit is not a browser payload.\n\nMachine artifacts: [Germany master](../reports/marketstack/germany_company_master.json), [Germany per-listing eligibility](../reports/marketstack/germany_product_eligibility.json), [Europe master and per-listing coverage](../reports/marketstack/europe_company_coverage.json). All values describe this measured snapshot, not a provider cutover or commercial decision.\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = name => { const p = process.argv.indexOf('--'+name); return p >= 0 ? process.argv[p+1] : undefined; };
  const out = run(arg('root') || process.cwd(),{ output:arg('output'),asOf:arg('as-of'),fusion:arg('fusion'),fitnessEvidence:arg('fitness-evidence') });
  console.log(JSON.stringify({ germany:out.germanyMaster.counts,europe:out.europeCoverage.counts,MarketstackCredits:0 }));
}
