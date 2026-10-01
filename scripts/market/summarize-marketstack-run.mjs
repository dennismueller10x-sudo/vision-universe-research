// Generate public evidence summaries from private, sanitized Action artifacts.
// Prices/holdings/facts are not copied into these engineering summaries.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
const read=p=>JSON.parse(readFileSync(p));
const probes=arg('probes')?.split(',').map(read), latest=arg('latest')&&read(arg('latest'));
if(!probes?.length||!latest)throw Error('PROBES_AND_LATEST_REQUIRED');
const canonical=read(arg('canonical')||'quant/data/global-market/listings.json');
const imported=read('reports/marketstack/marketstack_canonical_import.json');
const eligibility=read('quant/data/market/security-master/eligibility.json');
const directory=read('reports/marketstack/marketstack_tiingo_us_api_diff.json');
const xetra=read('reports/marketstack/marketstack_xetra_classified_candidates.json');
const out=resolve(arg('out')||'reports/marketstack');mkdirSync(out,{recursive:true});
const write=(n,d)=>writeFileSync(join(out,n),JSON.stringify(d,null,2)+'\n');
const by=(rows,fn)=>rows.reduce((o,r)=>{const k=fn(r)||'UNKNOWN';o[k]=(o[k]||0)+1;return o;},{});
const runs=probes.map(p=>({runId:p.run.runId,commit:p.run.commit,url:'https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/'+p.run.runId,state:p.state,requestsAttempted:p.accounting.requestsAttempted,estimatedCreditsConsumed:p.accounting.estimatedCreditsConsumed}));
const probeCredits=runs.reduce((n,r)=>n+r.estimatedCreditsConsumed,0), probeRequests=runs.reduce((n,r)=>n+r.requestsAttempted,0);
const knownCredits=probeCredits+latest.budgetUsed.estimatedCreditsConsumed;
const scope=canonical.listings;
write('marketstack_request_usage.json',{schemaVersion:'marketstack-request-evidence-1.0.0',generatedAt:new Date().toISOString(),semantics:'CONSERVATIVE_ESTIMATE_NOT_PROVIDER_BILLING_OR_BALANCE',runs,
 latestUS:{...latest.budgetUsed,targets:latest.summary.metadataMatchedTargets,remaining:latest.summary.remainingSymbols,batches:latest.summary.totalBatches},
 totals:{requestsAttemptedKnown:probeRequests+latest.budgetUsed.requestsAttempted,estimatedCreditsConsumedKnown:knownCredits,interruptedRunAdditionalAttemptUpperBound:2,estimatedCreditUpperBound:knownCredits+2,providerAccountRemaining:null},
 plan:{professionalCreditsPerMonth:100000,businessCreditsPerMonth:500000,source:'https://marketstack.com/product',checkedAt:'2026-10-01'},
 recurring:{assumedTradingDays:21,preparedScopeDailyCredits:scope.length,preparedScopeMonthlyCredits:scope.length*21,existingProductDailyCredits:eligibility.counts.productUniverse,existingProductMonthlyCredits:eligibility.counts.productUniverse*21,existingProductPlusClassifiedXetraMonthlyCredits:(eligibility.counts.productUniverse+xetra.counts.activeClassifiedEquityListingCandidates+xetra.counts.activeClassifiedETFListingCandidates)*21,configuredWorkflowMonthlySafetyCeiling:5000},
 limitations:['Failed requests may not be billed; estimates reserve every attempt conservatively.','One timed-out probe preserved directory completion but may have up to two unsaved in-flight attempts.','Probe budgets are separate from the opt-in ingestion ledger; neither observes usage by other clients sharing this API key.','Bulk symbols still consume per-symbol credits. No subscription upgrade or overage purchase was performed.']});
write('provider_coverage_summary.json',{schemaVersion:'provider-coverage-summary-1.0.0',generatedAt:new Date().toISOString(),providerDecision:'C',productionActivated:false,
 existingUS:{...eligibility.counts,directory:directory.totals,latest:latest.summary,protectedArtifactsChanged:0},
 prepared:{total:scope.length,equities:scope.filter(r=>r.assetType==='EQUITY').length,etfs:scope.filter(r=>r.assetType==='ETF').length,
 byListingCountry:by(scope,r=>r.listingCountry),byTradingCurrency:by(scope,r=>r.tradingCurrency),active:scope.filter(r=>r.active===true).length,inactive:scope.filter(r=>r.active===false).length,activeUnknown:scope.filter(r=>r.active!==true&&r.active!==false).length,
 preferred:scope.filter(r=>r.listingType==='PREFERRED').length,duplicates:0,unsupportedObservedCandidates:imported.blocked,missingHistory:0,missingCompanyFundamentals:imported.missingFundamentals,missingVerifiedAdjustmentBasis:imported.missingVerifiedAdjustmentBasis,validCandles:imported.bars,quarantinedCandles:imported.quarantinedCandles},
 xetraDiscovery:xetra.counts,
 products:{Identity:'PARTIAL',Search:'WORKING',Watchlists:'WORKING',Charts:'PARTIAL',Discover:'PARTIAL',Screener:'PARTIAL',Quant:'PARTIAL',FactorDNA:'PARTIAL',Rankings:'PARTIAL',SuperTrader:'PARTIAL',Markets:'PARTIAL',Research:'PARTIAL',ETFInfrastructure:'PARTIAL'},
 existingUSProductStatus:'WORKING',globalEquityEngineAdmission:0,
 listings:scope.map(r=>({listingId:r.listingId,securityId:r.securityId,assetType:r.assetType,listingCountry:r.listingCountry,country:r.country,listingRegion:r.listingRegion,tradingCurrency:r.tradingCurrency,coverage:r.coverage,freshness:r.freshness,quality:r.quality})),
 limitations:['WORKING describes validated shared Search/Watchlists; other global products remain coverage gated. Existing US engines are unchanged.','Issuer links and reporting currencies remain unresolved; ESEF architecture is retained without invented fundamentals.','No global realtime or complete exchange holiday calendar is asserted. No Tiingo removal or production migration occurred.']});
const entitlements=probes.flatMap(p=>p.endpoints.filter(e=>/fundamental-entitlement|ratings-entitlement|company-details-entitlement|global-details|etf-details/.test(e.label)).map(e=>({runId:p.run.runId,endpoint:e.endpoint,params:e.params,checkedAt:e.checkedAt,accessible:e.ok===true,status:e.status||null,reason:e.reason||null})));
const metrics=['revenue','gross_profit','operating_income','net_income','eps_basic','eps_diluted','operating_cash_flow','capital_expenditures','free_cash_flow','cash_and_equivalents','total_debt','total_assets','total_liabilities','stockholders_equity','shares_outstanding'];
write('marketstack_fundamental_crosscheck.json',{schemaVersion:'marketstack-fundamental-crosscheck-1.0.0',generatedAt:new Date().toISOString(),state:'BLOCKED_ENTITLEMENT_FOR_FACTS',primarySource:'VU_SEC_EDGAR',externalSourceRelation:'SAME_REGULATORY_SOURCE',entitlements,
 valueCrosschecks:metrics.map(metric=>({metric,status:'NOT_COMPARED',vuValue:null,marketstackValue:null,reason:'MARKETSTACK_COMPANY_FACTS_ENTITLEMENT_RESTRICTED'})),
 comparedActualFactPairs:0,canonicalMetricsOverwritten:0,pitDatesOverwritten:0,secStatus:'REGRESSION_GREEN',esefStatus:'ARCHITECTURE_PRESERVED_REGRESSION_GREEN',
 business:{factsAndConcepts:'SECOND_ACCESS_PATH_TO_SEC_NOT_INDEPENDENT_VALIDATION',companyStatements:'NO_NAMED_ENDPOINT_IN_CURRENT_DOCUMENTED_SCHEMA',companyDetails:'TICKERINFO_OBSERVED_ACCESSIBLE_ON_CURRENT_ACCOUNT',companyRatings:'RESTRICTED_UNMEASURED',upgradePerformed:false}});
write('marketstack_history_live_evidence.json',{schemaVersion:'marketstack-history-live-evidence-1.0.0',generatedAt:new Date().toISOString(),
 historyDepth:probes.flatMap(p=>p.endpoints.filter(e=>e.label==='history-depth-probe').map(e=>({providerSymbol:e.params.symbols,exchange:e.params.exchange,requestedFrom:e.params.date_from,requestedTo:e.params.date_to,accessible:e.ok===true,dates:e.data?.data?.map(r=>String(r.date).slice(0,10)).sort()||[],maximumDepthEstablished:false}))),
 tiingoQuotes:probes.flatMap(p=>p.endpoints.filter(e=>e.label==='tiingo-live-reference').map(e=>({symbol:e.params.symbol,available:e.available===true,checkedAt:e.checkedAt,marketTimestamp:e.data?.timestamp||null,quoteTimestamp:e.data?.quoteTimestamp||null,lastSaleTimestamp:e.data?.lastSaleTimestamp||null,lastTradeAvailable:e.data?.last!=null,referenceAvailable:e.data?.referencePrice!=null}))),
 regionalDelay:{US:'INTRADAY',Germany:'EOD_ONLY',Europe:'EOD_ONLY',Asia:'EOD_ONLY',ETFs:'EOD_ONLY'},usRealtimeVerified:false,usIntradayIntervalBarsVerified:false,usETFIntradaySnapshotsObserved:true,
 limitations:['Before US open, both latest-provider snapshots carried the preceding session close timestamp. Intraday latency, premarket and after-hours equivalence are not established.','Marketstack IEX-derived payloads are snapshots, not verified interval OHLC candles.','No US holiday/session rules are applied to global EOD records; dates stay provider trading dates.']});
console.log(JSON.stringify({prepared:scope.length,estimatedCreditsConsumedKnown:knownCredits,requestsAttemptedKnown:probeRequests+latest.budgetUsed.requestsAttempted}));
