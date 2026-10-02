// Deterministic read-only rollup. No data admission, provider routing or credentials.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function eodEconomics(n,{sessions=21,batchSize=100,historyPages=4}={}) {
  if(!Number.isSafeInteger(n)||n<0||!Number.isSafeInteger(sessions)||sessions<0||!Number.isSafeInteger(batchSize)||batchSize<1||!Number.isSafeInteger(historyPages)||historyPages<1)throw Error('INVALID_ECONOMIC_SCENARIO');
  return {listings:n,creditsPerDailyEod:n,monthlyEodCredits:n*sessions,
    minimumDailyHttpRequests:Math.ceil(n/batchSize),sessionAssumption:sessions,
    historyPagesPerListing:historyPages,oneTimeHistoryCredits:n*historyPages,
    oneTimeMetadataSplitsDividendsCredits:n*3,
    note:'Credits estimated per symbol per endpoint/page, not per batched HTTP request. Actual costs, retries, venue partitions and entitlements remain account-specific.'};
}
export function etfEconomics(n){return {...eodEconomics(n),weeklyHoldingsRefreshCredits:n,
  monthlyWeeklyHoldingsEstimate:Math.ceil(n*52/12),monthlyMetadataRefreshCredits:n,
  holdingsCostDoesNotEstablishCoverage:true};}
export function intradayEconomics(n,{sessions=21,minutes=390,refreshMinutes=5}={}){
  if(!Number.isSafeInteger(n)||n<0||![sessions,minutes,refreshMinutes].every(x=>Number.isSafeInteger(x)&&x>0))throw Error('INVALID_INTRADAY_SCENARIO');
  return {symbols:n,sessionMinutes:minutes,refreshMinutes,sessions,estimatedSymbolEndpointCredits:n*Math.ceil(minutes/refreshMinutes)*sessions,
    scope:'SCENARIO_ONLY_US_SESSION_NOT_APPLIED_GLOBALLY',empiricalRealtimeClaim:false};
}
const requirements=[
  {capability:'EOD Charts',tiingoUS:'READY',marketstackUS:'PARTIAL',marketstackGermany:'PARTIAL',marketstackEurope:'PARTIAL',ETF:'PARTIAL'},
  {capability:'Live/Intraday',tiingoUS:'PARTIAL',marketstackUS:'PARTIAL',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'BLOCKED'},
  {capability:'Technical Indicators',tiingoUS:'PARTIAL',marketstackUS:'BLOCKED',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'BLOCKED'},
  {capability:'Quant Technical',tiingoUS:'PARTIAL',marketstackUS:'BLOCKED',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'BLOCKED'},
  {capability:'Quant Full',tiingoUS:'PARTIAL',marketstackUS:'BLOCKED',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'BLOCKED'},
  {capability:'Screener Technical',tiingoUS:'PARTIAL',marketstackUS:'BLOCKED',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'BLOCKED'},
  {capability:'Screener Fundamental',tiingoUS:'PARTIAL',marketstackUS:'BLOCKED',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'BLOCKED'},
  {capability:'SuperTrader',tiingoUS:'PARTIAL',marketstackUS:'BLOCKED',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'BLOCKED'},
  {capability:'Backtesting',tiingoUS:'PARTIAL',marketstackUS:'UNSAFE',marketstackGermany:'UNSAFE',marketstackEurope:'UNSAFE',ETF:'UNSAFE'},
  {capability:'ETF Holdings',tiingoUS:'N/A',marketstackUS:'PARTIAL',marketstackGermany:'BLOCKED',marketstackEurope:'BLOCKED',ETF:'PARTIAL'}
];
export function buildFitnessSummary(inputs,{generatedAt='2026-10-02T00:00:00Z',accounting=null,tests=null}={}){
  const {us,germany,europe,adjustments,technical,quant,supertrader,backtest,screener,fusion,etfs,holdings,metadata,live,baseline,qualityFinal}=inputs;
  const entries=Object.values(accounting?.runs??{}),newCredits=entries.reduce((n,r)=>n+(r.estimatedCreditsConsumed??0),0),newRequests=entries.reduce((n,r)=>n+(r.requestsAttempted??0),0);
  return {schemaVersion:'marketstack-provider-product-fitness-1.0.0',generatedAt,acceptedBaseline:'bf84b7ae99b1d291de6b61d1f7ba42ef262c6eb1',
    providerDecision:'DEFERRED_TO_OWNER',productionChanged:false,tiingoRemoved:false,secReplaced:false,esefReplaced:false,
    executiveResult:'Useful measured metadata and bounded native-currency EOD chart foundation. Full technical/Quant/SuperTrader/backtest admission is not established. ETF complete-current portfolio analysis is unsupported by the tested holdings.',
    us:{...us.totals,protectedConsumerCoverage:us.protectedConsumerCoverage,currentCommonClassCoverage:us.currentCommonClassCoverage,indexCoverage:us.indexCoverage,namedGapArtifact:'reports/marketstack/us_gap_relevance.json'},germany:germany.counts,europe:{counts:europe.counts,countries:europe.countries},
    adjustments:{summary:adjustments.summary,compatibilityMatrix:adjustments.compatibilityMatrix,fullUSWindowValidation:adjustments.usFullWindowStudy??null},
    engineValidation:{technical:technical.summary,quant:quant.summary,supertrader:supertrader.summary,backtest:backtest.summary,backtestClassification:backtest.status},
    fundamentals:fusion.summary,etfs:etfs.counts,holdings:holdings.sample,metadata:metadata.fields??metadata.matrix??metadata,
    inheritedQualityFlags:{...baseline.quality,finalClassification:qualityFinal?.totals??null},live:{sourceAsOf:live.generatedAt,measuredRegionalDelay:live.regionalDelay,realtimeVerified:live.usRealtimeVerified,
      intradayBarsVerified:live.usIntradayIntervalBarsVerified,quoteFreshnessUnverifiedForNewRun:true},
    screener:{isolatedExistingEngineValidation:screener,metadataFilters:['country','listingCountry','MIC','exchange','tradingCurrency','assetType'],metadata:'PARTIAL',
      technicalFilters:['price','volume','liquidity','52weekHigh','SMA50','SMA200','momentum'],technical:'BLOCKED',
      fundamentalFilters:['marketCap','revenueGrowth','EPSGrowth','margin','profitability','valuation'],fundamental:'BLOCKED',
      missingValuesBecomeZero:false,reasons:['Native turnover cannot be substituted for USD liquidity.','Metadata-only identities and bounded charts do not satisfy adjustment/history gates.','European annual facts do not imply a complete PIT TTM factor panel.']},
    productFitnessMatrix:requirements,
    matrixScope:'Capabilities under measured coverage and unchanged hard gates, not universal instrument-level availability. READY Tiingo EOD preserves existing consumer handling; PARTIAL source-wide cells preserve missing-factor, stale quote and backtest-publication gates. ETF equity-company factors remain outside scope.',
    requestEconomics:{additionalEstimatedCredits:newCredits,additionalHttpRequests:newRequests,
      priorTrackedCumulativeCreditsRange:[13065,13067],trackedCumulativeCreditsRange:[13065+newCredits,13067+newCredits],
      actualMonthlyBillAndRemainingBalance:null,advertisedProfessionalCredits:100000,advertisedBalanceIfOnlyTrackedUsage:[100000-13067-newCredits,100000-13065-newCredits],
      sufficientForAnother75CreditBoundedRunUnderAdvertisedAssumption:13067+newCredits+75<100000,
      eod:[500,1000,5000,10000].map(n=>eodEconomics(n)),etf:[100,500,1000].map(etfEconomics),intraday:[10,100,500].map(n=>intradayEconomics(n)),
      creditSource:'Existing request accounting conservatively reserves symbol endpoint units; not independently reconciled billing. No pricing or purchasing decision.',
      economicsFinding:'Daily EOD 5,000 listings at21 sessions alone estimates105,000 credits. Batching reduces HTTP requests but does not remove per-symbol credit costs.'},
    tests,remainingBlockers:['Independent full-window issuer/currency/quote-unit proof is incomplete.',
      'Provider OHLC and action endpoint inconsistencies and unverified per-field adjustment basis.',
      'Exchange session completeness and historical universe/delisting evidence insufficient for published backtests.',
      'European canonical PIT TTM fundamentals and aligned share/FX/ADR valuation basis incomplete.',
      'No verified full-current ETF portfolios or authoritative fee/UCITS/benchmark/exposure metadata.'],
    decisionInputs:{tiingoStrengths:['Existing protected consumer delivery and historical SEC-linked US workflows.','Established split/price semantics and existing live infrastructure retained.'],
      marketstackEnables:['Measured European/global listing metadata and bounded native-currency prices.','Provider-independent canonical chart/search/watchlist foundation.'],
      marketstackStillNeeds:['Consistent independently checked full OHLCV/action histories and listing quote units.','Exact company/security/provider joins with canonical SEC/ESEF PIT fundamentals.'],
      secondaryEtfRequirements:holdings.requiredSecondaryData??null,commercialDecisionMade:false}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
  const root=arg('reports','reports/marketstack'),names={us:'us_gap_relevance.json',germany:'germany_company_master.json',europe:'europe_company_coverage.json',adjustments:'marketstack_adjustment_validation.json',
    technical:'technical_indicator_crosscheck.json',quant:'quant_marketstack_fitness.json',supertrader:'supertrader_marketstack_fitness.json',backtest:'backtest_marketstack_fitness.json',screener:'screener_marketstack_fitness.json',fusion:'fundamental_price_fusion_validation.json',
    etfs:'global_etf_coverage.json',holdings:'etf_holdings_quality.json',metadata:'etf_metadata_matrix.json',live:'marketstack_history_live_evidence.json',baseline:'marketstack_scale_summary.json',qualityFinal:'us_marketstack_quality_final.json'};
  const inputs={},sources=[];for(const [key,name]of Object.entries(names)){const path=join(root,name),bytes=readFileSync(path);inputs[key]=JSON.parse(bytes);sources.push({path,sha256:sha(bytes)});}
  const accountingPath=arg('accounting',null),testsPath=arg('tests',null);
  const accounting=accountingPath?JSON.parse(readFileSync(accountingPath)):null,tests=testsPath?JSON.parse(readFileSync(testsPath)):null;
  if(accountingPath)sources.push({kind:'PRIVATE_REQUEST_CHECKPOINT',sha256:sha(readFileSync(accountingPath))});
  if(testsPath)sources.push({path:testsPath,sha256:sha(readFileSync(testsPath))});
  const sourceTimes=[...Object.values(inputs).map(i=>i.generatedAt),tests?.generatedAt,...Object.values(accounting?.runs??{}).map(r=>r.finishedAt)].filter(t=>typeof t==='string'&&Number.isFinite(Date.parse(t)));
  const generatedAt=arg('generated-at',sourceTimes.length?new Date(Math.max(...sourceTimes.map(Date.parse))).toISOString():'2026-10-02T00:00:00Z');
  const result=buildFitnessSummary(inputs,{accounting,tests,generatedAt});result.inputProvenance=sources;
  const out=arg('out',join(root,'provider_product_fitness_summary.json'));mkdirSync(resolve(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({out,additionalCredits:result.requestEconomics.additionalEstimatedCredits,decision:result.providerDecision}));
}
