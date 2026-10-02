import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { assessProducts, inspectHistory, buildCompanyMasters, CAPABILITIES, verifyExistingBacktestGateReport, compactEuropeCoverage, expandCompanyCoverage, latestSourceTimestamp } from '../../scripts/market/build-marketstack-company-product-masters.mjs';
import { evaluateGates } from '../../scripts/supertrader/engine/gates.mjs';

const policy = {minHistoryBars:250,minDailyTurnoverUSD:5000000};
const listing = {listingId:'vu_example',securityId:'sec_isin_DE0000000001',tradingCurrency:'EUR'};
function bars(count=260) { return Array.from({length:count},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:99,high:101,low:98,close:100,volume:100000})); }
function row() { return { ...listing,isin:'DE0000000001',mic:'XETR',assetType:'EQUITY',canonicalListingPresent:true,issuerVerified:true,issuerEntityStatus:'ACTIVE',identityConflict:false,currencySourceVerified:true,
  latestPriceFresh:true,referenceActive:true,exchangeTimezone:'Europe/Berlin',history:{validCloseSeries:true,fullOHLCV:true,bars:260,status:'VALID_BOUNDED_CLOSE_SERIES'},historySHA256:'a'.repeat(64),fundamentals:{} }; }
function gateFixture() {
  const engine='scripts/supertrader/engine/gates.mjs',engineSHA256=createHash('sha256').update(readFileSync(new URL('../../scripts/supertrader/engine/gates.mjs',import.meta.url))).digest('hex');
  const coverage={dailyOhlcvYears:12,delistedWithPriceHistory:10,survivorshipControls:true,historicalMembershipDates:24,splitAdjusted:true,totalReturnUniform:true,delistingReturns:true,usageRightsConfirmed:true};
  const variantId='DARVAS_BOX_N3_VU',extra={baselines:['unit-fixture']},result=evaluateGates(variantId,coverage,extra);
  const report={engine,engineSHA256,variantId,coverage,extra,result};report.reportSHA256=createHash('sha256').update(JSON.stringify(report)).digest('hex');return report;
}
function evidence(r=row()) { const existingGateReport=gateFixture();return { ...listing,listingId:r.listingId,isin:r.isin,mic:r.mic,currency:r.tradingCurrency,historySHA256:r.historySHA256,validated:true,sourceProvenanceVerified:true,
  fullHistoryOHLCVVerified:true,historyCompletenessVerified:true,corporateActionsVerified:true,adjustmentSemanticsVerified:true,volumeBasisVerified:true,avgDailyTurnoverUSD:5000001,turnoverFXVerified:true,
  primarySelectionVerified:true,technicalEngineValidated:true,adjustmentBasis:'VU_SPLIT_ADJUSTED',supertraderEngineValidated:true,backtestValidated:true,backtestCalendarVerified:true,backtestPITCorporateActionsVerified:true,
  backtestSeriesBasis:'TOTAL_RETURN_ADJUSTED',backtestDividendPolicyVerified:true,backtestSurvivorshipPITUniverseVerified:true,backtestDelistingRightsVerified:true,
  backtestExistingGatesPublishable:true,backtestGateReportSHA256:existingGateReport.reportSHA256,existingGateReport };
}

test('accepted close chart evidence cannot turn into technical/Quant/backtest certification',()=>{
  const r=row(); r.history.fullOHLCV=false;
  const result=assessProducts(r,policy);
  assert.equal(result.eligibility.CHART,'PARTIAL');assert.equal(result.eligibility.SEARCH,'READY');assert.equal(result.eligibility.WATCHLIST,'READY');
  for(const key of CAPABILITIES.slice(3)) assert.equal(result.eligibility[key],'BLOCKED');
  assert.equal(result.productionActivated,false);
});
test('exact independently verified full-history evidence supports isolated VU adjusted readiness only',()=>{
  const r=row(), result=assessProducts(r,policy,evidence(r));
  for(const key of ['CHART','SCREENER_TECHNICAL','QUANT_TECHNICAL','SUPERTRADER','BACKTEST']) assert.equal(result.eligibility[key],'READY_WITH_VU_ADJUSTMENT');
  assert.equal(result.eligibility.QUANT_FULL,'BLOCKED');assert.equal(result.eligibility.SCREENER_FUNDAMENTAL,'BLOCKED');assert.equal(result.productionActivated,false);
});
for(const field of ['sourceProvenanceVerified','fullHistoryOHLCVVerified','historyCompletenessVerified','corporateActionsVerified','adjustmentSemanticsVerified','volumeBasisVerified','turnoverFXVerified','primarySelectionVerified','technicalEngineValidated']) {
  test('hard gate does not accept missing '+field,()=>{const e=evidence();delete e[field];const r=assessProducts(row(),policy,e); assert.equal(r.eligibility.QUANT_TECHNICAL,'BLOCKED');assert.equal(r.eligibility.BACKTEST,'BLOCKED');});
}
test('historical dividend/split window success never certifies a whole-history adjustment basis',()=>{
  const e=evidence();e.adjustmentBasis='BOUNDED_SPLIT_CONTROL_MATCH';assert.equal(assessProducts(row(),policy,e).eligibility.QUANT_TECHNICAL,'BLOCKED');
});
test('price-only stored history cannot be declared full OHLCV by a companion boolean',()=>{
  const r=row();r.history.fullOHLCV=false;assert.equal(assessProducts(r,policy,evidence(r)).eligibility.QUANT_TECHNICAL,'BLOCKED');
});
for(const field of ['listingId','isin','mic','currency','historySHA256']) {
  test('companion '+field+' collision fails closed',()=>{const e=evidence();e[field]='wrong';assert.equal(assessProducts(row(),policy,e).eligibility.QUANT_TECHNICAL,'BLOCKED');});
}
test('missing ADR/share and FX valuation basis blocks full Quant independently of technical fitness',()=>{
  const e=evidence(); Object.assign(e,{fundamentalCompanyJoinValidated:true,fullCanonicalFactorsVerified:true,PITVerified:true,valuationShareBasisVerified:false,valuationCurrencyBasisVerified:true});
  assert.equal(assessProducts(row(),policy,e).eligibility.QUANT_FULL,'BLOCKED');e.valuationShareBasisVerified=true;
  assert.equal(assessProducts(row(),policy,e).eligibility.QUANT_FULL,'READY_WITH_VU_ADJUSTMENT');
});
test('backtests require a PIT action policy and verified transaction-calendar basis',()=>{
  const e=evidence();delete e.backtestPITCorporateActionsVerified;assert.equal(assessProducts(row(),policy,e).eligibility.BACKTEST,'BLOCKED');
  e.backtestPITCorporateActionsVerified=true;delete e.backtestCalendarVerified;assert.equal(assessProducts(row(),policy,e).eligibility.BACKTEST,'BLOCKED');
});
test('backtest readiness rechecks the protected existing strategy gates and content hashes',()=>{
  const good=gateFixture();assert.equal(verifyExistingBacktestGateReport(good),true);
  for(const change of [r=>r.result.gates=[],r=>r.coverage.usageRightsConfirmed=false,r=>r.engineSHA256='f'.repeat(64),r=>r.reportSHA256='f'.repeat(64),r=>r.variantId='NO_GATES']) {
    const report=gateFixture();change(report);assert.equal(verifyExistingBacktestGateReport(report),false);
    const e=evidence();e.existingGateReport=report;e.backtestGateReportSHA256=report.reportSHA256;assert.equal(assessProducts(row(),policy,e).eligibility.BACKTEST,'BLOCKED');
  }
});
for(const field of ['backtestSeriesBasis','backtestDividendPolicyVerified','backtestSurvivorshipPITUniverseVerified','backtestDelistingRightsVerified','backtestExistingGatesPublishable','backtestGateReportSHA256']) {
  test('backtest existing hard gate '+field+' is not bypassed by a split-only series',()=>{
    const e=evidence();delete e[field];assert.equal(assessProducts(row(),policy,e).eligibility.BACKTEST,'BLOCKED');
  });
}
test('no FX synthesis or policy relaxation for illiquid or short histories',()=>{
  let r=row(),e=evidence(r);e.avgDailyTurnoverUSD=4999999;assert.equal(assessProducts(r,policy,e).eligibility.QUANT_TECHNICAL,'BLOCKED');
  r.history.bars=249;e.avgDailyTurnoverUSD=5000001;assert.equal(assessProducts(r,policy,e).eligibility.QUANT_TECHNICAL,'BLOCKED');
});
test('GBX is a quote unit requiring a verified scale, not a silent GBP conversion',()=>{
  const r=row();r.tradingCurrency='GBX';const result=assessProducts(r,policy,evidence(r));assert.equal(result.eligibility.CHART,'BLOCKED');assert.equal(result.eligibility.QUANT_TECHNICAL,'BLOCKED');
});
test('unknown timezone and inactive issuer block technical readiness',()=>{
  const r=row();r.exchangeTimezone=null;assert.equal(assessProducts(r,policy,evidence(r)).eligibility.QUANT_TECHNICAL,'BLOCKED');
  r.exchangeTimezone='Europe/Berlin';r.issuerEntityStatus='INACTIVE';assert.equal(assessProducts(r,policy,evidence(r)).eligibility.QUANT_TECHNICAL,'BLOCKED');
});
test('invalid and duplicate chart candles are unsafe, not silently counted or deduplicated',()=>{
  for(const malformed of [[{date:'not-a-date',close:1}],[{date:'2025-02-30',close:1}],[{date:'2025-01-01',close:0}],[{date:'2025-01-01',close:1},{date:'2025-01-01',close:2}]]) {
    const history=inspectHistory({...listing,currency:'EUR',bars:malformed},listing);assert.equal(history.validCloseSeries,false);
    const r=row();r.history=history;assert.equal(assessProducts(r,policy).eligibility.CHART,'UNSAFE');
  }
});
test('history identity and native-currency contracts are enforced before prices are inspected',()=>{
  const history=inspectHistory({...listing,currency:'USD',bars:bars()},listing);assert.equal(history.status,'IDENTITY_OR_CURRENCY_MISMATCH');
  const r=row();r.history=history;assert.equal(assessProducts(r,policy).eligibility.CHART,'UNSAFE');
});
test('OHLCV validation rejects impossible ranges and negative volume',()=>{
  for(const bad of [{high:99},{low:101},{volume:-1}]) {
    const data=bars(2);Object.assign(data[0],bad);assert.equal(inspectHistory({...listing,currency:'EUR',bars:data},listing).fullOHLCV,false);
  }
});

const root=resolve(new URL('../..',import.meta.url).pathname);
const read=file=>expandCompanyCoverage(JSON.parse(readFileSync(resolve(root,file))));
test('report provenance timestamp follows source retrieval while evaluation date remains fixed',()=>{
  const control=read('reports/marketstack/marketstack_issuer_role_controls.json'),fusion=read('reports/marketstack/fundamental_price_fusion_validation.json');
  for(const name of ['germany_company_master','germany_product_eligibility','europe_company_coverage']) {
    const report=read('reports/marketstack/'+name+'.json');assert.equal(report.evaluationDate,'2026-10-02');
    assert(Date.parse(report.generatedAt)>=Date.parse(control.generatedAt));assert(Date.parse(report.generatedAt)>=Date.parse(fusion.generatedAt));
  }
  assert.equal(latestSourceTimestamp(['2026-10-02T04:53:55.667001+00:00','2026-10-02T04:53:55.667917+00:00']), '2026-10-02T04:53:55.667917+00:00');
});
test('Europe report dictionary encoding preserves every company/security/listing field losslessly',()=>{
  const original={listings:[{listingId:'one',domicile:'DE',companyName:'A',history:{bars:0},fundamentals:{availability:'UNVERIFIED'},products:{eligibility:{CHART:'BLOCKED'}}},
    {listingId:'two',domicile:'FR',companyName:'B',history:{bars:0},fundamentals:{availability:'UNVERIFIED'},products:{eligibility:{CHART:'BLOCKED'}}}],
    companies:[{companyId:'A',marketCap:null,productEligibility:{CHART:'BLOCKED'},securities:[{securityId:'S1',productEligibility:{CHART:'BLOCKED'}}]},
      {companyId:'B',marketCap:null,productEligibility:{CHART:'BLOCKED'},securities:[{securityId:'S2',productEligibility:{CHART:'BLOCKED'}}]}]};
  const compact=compactEuropeCoverage(original), expanded=expandCompanyCoverage(compact);
  assert.deepEqual(expanded.listings,original.listings);assert.deepEqual(expanded.companies,original.companies);assert.equal(compact.dictionaries.history.length,1);
});
test('accepted census retains 432 named German companies and 441 active classes without foreign-venue inflation',()=>{
  const g=read('reports/marketstack/germany_company_master.json');
  assert.equal(g.companies.length,432);assert.equal(g.counts.acceptedReferenceActiveEquitySecurities,441);assert.equal(g.listings.length,790);
  assert.equal(g.counts.provenCompanies,429);assert.equal(g.counts.activeEquities,438);assert.equal(g.counts.directANNAUncontradictedCompanyAssociations,427);
  assert.equal(new Set(g.companies.map(x=>x.issuerLEI)).size,432);assert.equal(new Set(g.listings.map(x=>x.isin)).size,441);
  assert(g.listings.every(x=>x.domicile==='DE' && ['ORDINARY_SHARE','PREFERRED_SHARE'].includes(x.shareType)));
  assert(g.companies.every(x=>x.companyName && x.companyId.startsWith('LEI:')));
  assert.equal(g.counts.selectedBoundedResearchCompanies,218);assert.equal(g.counts.consumerPolicyCertifiedEquities,0);assert.equal(g.counts.consumerPolicyActualEligibleEquities,null);
  assert.equal(g.counts.PROBABLE_GERMAN_COMPANIES,1);const probable=g.completenessEvidence.probableGermanCompanies[0];assert.equal(probable.companyName,'ERWE Immobilien AG');
  assert.equal(probable.includedInProvenCompanyCount,false);assert.equal(probable.includedInActiveEquityCount,false);assert.deepEqual(probable.conflictingRegulatoryIssuerLEIs,['984500942ABSAN9EC014']);
});
test('Europe company counts use proven issuer domicile, not listing country, and reference activity remains distinct',()=>{
  const e=read('reports/marketstack/europe_company_coverage.json');
  assert.equal(e.companies.length,3471);assert.equal(e.counts.acceptedReferenceActiveEquitySecurities,3494);assert.equal(e.counts.provenCompanies,3468);assert.equal(e.counts.activeEquities,3491);
  const expected={DE:[431,520],FR:[449,474],NL:[104,120],BE:[101,96],IT:[275,256],ES:[115,139],AT:[46,52],CH:[195,58],GB:[723,789],DK:[116,105],SE:[571,557],NO:[194,191],FI:[148,134]};
  for(const [country,[companies,active]] of Object.entries(expected)){const r=e.countries.find(x=>x.country===country);assert.equal(r.provenCompanies,companies);assert.equal(r.activeEquities,active);assert.equal(r.quantTechnicalEligible,0);assert.equal(r.backtestEligible,0);}
  assert(e.unresolvedIssuerListings.every(x=>x.domicile===null));assert.equal(e.productionActivated,false);
});
test('exact known foreign quoted-issuer contradictions quarantine associations without overwriting accepted identities',()=>{
  const g=read('reports/marketstack/germany_company_master.json');
  const known={'AU000000EVT1':'529900GRCBLM95S5L112','JP3690400001':'391200OQBXV6GL2ATD24','CA83013J1093':'391200LB6JA3HAQWTS32'};
  for(const [isin,lei] of Object.entries(known)){
    const company=g.companies.find(x=>x.issuerLEI===lei);assert(company);assert.equal(company.includedInSupportedCompanyCount,false);assert.equal(company.issuerAssociationStatus,'QUARANTINED_REFERENCE_ASSOCIATION');
    for(const row of g.listings.filter(x=>x.isin===isin)) {assert.equal(row.analyticalCompanyId,'LEI:'+lei);assert.equal(row.issuerVerified,false);assert.equal(row.identityConflict,true);
      assert.equal(row.issuerAssociationAssessment.status,'CONTRADICTED_QUOTED_ISSUER_ASSOCIATION');for(const capability of CAPABILITIES)assert.equal(row.products.eligibility[capability],'BLOCKED');}
  }
  assert.equal(g.counts.boundedChartListings,226);assert.equal(g.counts.usableBoundedChartCompanies,218);
});
test('Dutch ISIN prefixes and valid KGaA legal forms do not trigger blanket foreign/subsidiary exclusions',()=>{
  const g=read('reports/marketstack/germany_company_master.json');
  for(const isin of ['NL00150002Q7','NL0012661870','NL0015000YE1','NL0015000LC2','NL0015285941']) {
    const rows=g.listings.filter(x=>x.isin===isin);assert(rows.length);assert(rows.every(x=>x.issuerAssociationAssessment.status!=='CONTRADICTED_QUOTED_ISSUER_ASSOCIATION'));
  }
  for(const name of ['EUROKAI GmbH & Co. KGaA','paragon GmbH & Co. KGaA','HELLA GmbH & Co. KGaA','DWS Group GmbH & Co. KGaA'])assert.equal(g.companies.find(x=>x.companyName===name).includedInSupportedCompanyCount,true);
});
test('machine provenance covers exact accepted input and price-history bytes',()=>{
  for(const file of ['germany_company_master','germany_product_eligibility','europe_company_coverage']) {
    const artifact=read('reports/marketstack/'+file+'.json');
    for(const source of artifact.inputProvenance) assert.equal(createHash('sha256').update(readFileSync(resolve(root,source.inputPath))).digest('hex'),source.sha256,source.inputPath);
    assert.equal(artifact.MarketstackCredits,0);
  }
});
test('company master preserves unlinked canonical IDs and does not alias regulatory LEIs to SEC CIK issuers',()=>{
  const g=read('reports/marketstack/germany_company_master.json');const sap=g.companies.find(x=>x.issuerLEI==='529900D6BF99LW9R2E68');
  assert(sap);assert.deepEqual(sap.canonicalCompanyIds,[]);assert(g.listings.filter(x=>x.issuerLEI===sap.issuerLEI).every(x=>x.canonicalCompanyId===null));
});
test('canonical duplicate ISIN/MIC/currency identities fail before any count or chart certification',()=>{
  assert.throws(()=>buildCompanyMasters({germany:{listings:[],germanCompanies:[]},europe:{listings:[],companies:[]},canonical:{listings:[{isin:'DE0001',mic:'XETR',tradingCurrency:'EUR'},{isin:'DE0001',mic:'XETR',tradingCurrency:'EUR'}]},policy,calendar:{}}),/DUPLICATE_CANONICAL/);
});
test('no product matrix row claims technical readiness from accepted unverified histories',()=>{
  for(const file of ['germany_company_master','europe_company_coverage']) {
    const data=read('reports/marketstack/'+file+'.json');for(const r of data.listings) {
      for(const key of ['SCREENER_TECHNICAL','SCREENER_FUNDAMENTAL','QUANT_TECHNICAL','QUANT_FULL','SUPERTRADER','BACKTEST']) assert.equal(r.products.eligibility[key],'BLOCKED');
      assert.equal(r.products.productionActivated,false);
    }
  }
});
