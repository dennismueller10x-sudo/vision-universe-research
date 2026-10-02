import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { evaluateSecFusion, evaluateOfficialFusion, buildFusionReport } from '../../scripts/market/validate-marketstack-fundamental-price-fusion.mjs';
const require = createRequire(import.meta.url);
const Inputs = require('../engines/fundamental-inputs.js');
const apple = JSON.parse(readFileSync(new URL('../data/sec/consumer/CIK0000320193.json', import.meta.url)));
const listing = { companyId: 'iss_cik_0000320193', cik: apple.cik, securityId: 'ref_AAPL', providerSymbol: 'AAPL', mic: 'XNAS', tradingCurrency: 'USD', listingType: 'ORDINARY', assetType: 'EQUITY' };
const quote = { securityId: 'ref_AAPL', providerSymbol: 'AAPL', mic: 'XNAS', validLatest: true, tradingDate: '2026-09-30', normalizedCurrency: 'USD', observation: { reportedCurrency: 'USD', open: 100, high: 102, low: 99, close: 101 } };
const args = () => ({ listing: structuredClone(listing), doc: structuredClone(apple), quote: structuredClone(quote), cutoff: '2026-09-30', issuerListings: ['ref_AAPL'], providerIdentityVerified: true, shareCountPriceBasisVerified: true });
const evaluate = (change) => { const a=args(); change?.(a); return evaluateSecFusion(a); };
const officialPath = new URL('../data/fundamentals/official/e445f306efaefa02af884472a00f9aa23548b05e46ed72b23579e1f2a9c8591c.json', import.meta.url);
const official = JSON.parse(readFileSync(officialPath));
const lvmh = { assetType: 'EQUITY', issuerLEI: official.lei, isin: official.isin, companyId: null, tradingCurrency: 'EUR' };

test('real SEC document supports isolated conditional valuation through existing engine without mutation', () => {
  const a=args(), before=JSON.stringify(a), r=evaluateSecFusion(a);
  assert.equal(r.safeValuation, true); assert.deepEqual(r.blockers, []);
  assert.equal(r.valuations.marketCap, apple.ttm.shares_outstanding.v * 101);
  assert.equal(r.valuations.pe, r.valuations.marketCap / apple.ttm.net_income.v);
  assert.equal(r.valuations.ps, r.valuations.marketCap / apple.ttm.revenue.v);
  const raw=Inputs.compute(apple, '2026-09-30', r.valuations.marketCap).raws;
  assert.equal(r.valuations.fcfYield, raw.fcfYield);
  assert.equal(r.valuations.pb, 1 / raw.bookToMarket);
  assert.equal(r.valuations.evSales, null); assert.equal(r.valuations.evEbitda, null);
  assert.equal(JSON.stringify(a), before); assert.equal(r.fullQuantEligibility, 'BLOCKED');
});
test('symbol and MIC similarity does not certify independent provider issuer identity', () => {
  const r=evaluate(a=>{a.providerIdentityVerified=false;});
  assert.equal(r.safeValuation,false); assert.ok(r.blockers.includes('PROVIDER_ISSUER_IDENTITY_UNVERIFIED'));
  assert.ok(Object.values(r.valuations).every(v=>v===null));
});
test('an exact internal security without matching company CIK cannot join',()=>{
  const r=evaluate(a=>{a.listing.cik='0001045810';});assert.equal(r.internalJoin,false);
});
test('multiple share classes do not receive duplicated issuer market capitalizations',()=>{
  const r=evaluate(a=>{a.issuerListings.push('ref_AAPL.B');});
  assert.ok(r.blockers.includes('SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING'));assert.equal(r.valuations.marketCap,null);
});
test('multiple SEC security IDs also block class-level valuation',()=>{
  const r=evaluate(a=>{a.doc.securityIds.push('ref_OTHER');});assert.equal(r.safeValuation,false);
});
test('future filing shares are excluded by existing PIT engine',()=>{
  const r=evaluate(a=>{a.cutoff='2026-07-30';a.quote.tradingDate='2026-07-30';});
  assert.ok(r.blockers.includes('NO_SAFE_PIT_INSTANT_SHARES'));assert.equal(r.valuations.marketCap,null);
});
test('weighted-average shares never substitute for instant shares outstanding',()=>{
  const r=evaluate(a=>{a.doc.ttm.shares_outstanding.kind='TTM';});assert.equal(r.safeValuation,false);
});
test('unknown share unit blocks an otherwise valid share count',()=>{
  const r=evaluate(a=>{a.doc.ttm.shares_outstanding.unit='shares_m';});assert.equal(r.safeValuation,false);
});
test('ADR ratio must have source and share basis',()=>{
  const r=evaluate(a=>{a.listing.listingType='ADR';a.listing.adrRatio=2;});
  assert.ok(r.blockers.includes('ADR_RATIO_UNVERIFIED'));assert.equal(r.valuations.marketCap,null);
});
test('verified ADR ordinary basis is converted once by accepted global identity engine',()=>{
  const r=evaluate(a=>Object.assign(a.listing,{listingType:'ADR',adrRatio:2,adrRatioSource:'test-only-source',shareCountBasis:'ORDINARY',shareCountBasisSource:'test-only-shares'}));
  assert.equal(r.safeValuation,true);assert.equal(r.valuations.marketCap,apple.ttm.shares_outstanding.v / 2 * 101);
});
test('different reporting/trading currencies need explicit FX and stay unavailable',()=>{
  const r=evaluate(a=>{a.listing.tradingCurrency='EUR';a.quote.normalizedCurrency='EUR';});
  assert.ok(r.blockers.includes('REPORTING_TRADING_CURRENCY_MISMATCH'));assert.equal(r.valuations.pe,null);
});
test('provider quote reported currency mismatch blocks valuation',()=>{
  const r=evaluate(a=>{a.quote.normalizedCurrency='EUR';});assert.equal(r.safeValuation,false);
});
test('wrong exchange or provider symbol cannot join a current price',()=>{
  for(const field of ['mic','providerSymbol']){const r=evaluate(a=>{a.quote[field]='WRONG';});assert.ok(r.blockers.includes('PROVIDER_LISTING_IDENTITY_MISMATCH'));}
});
test('freshness gate and invalid OHLC both fail closed',()=>{
  assert.equal(evaluate(a=>{a.quote.validLatest=false;}).safeValuation,false);
  assert.ok(evaluate(a=>{a.quote.observation.high=90;}).blockers.includes('PRICE_OHLC_INVALID'));
});
test('invalid as-of dates are rejected without exceptions or false readiness',()=>{
  for(const cutoff of ['2026-99-99','2026-02-31','garbage',null]){const r=evaluate(a=>{a.cutoff=cutoff;});assert.equal(r.safeValuation,false);}
});
test('future-period instant shares are rejected even when filing labels claim earlier availability',()=>{
  const r=evaluate(a=>{a.doc.ttm.shares_outstanding.end='2026-12-31';});assert.equal(r.safeValuation,false);
});
test('ESEF exact legal identifier and ISIN projection keeps company ownership',()=>{
  const before=JSON.stringify(official),r=evaluateOfficialFusion({listing:lvmh,official,cutoff:'2026-09-30'});
  assert.equal(r.exactCompanyJoin,true);assert.equal(r.companyId,official.companyId);assert.equal(r.eligibleFacts,12);
  assert.equal(r.annualOnly,true);assert.equal(r.fullQuantEligibility,'BLOCKED');assert.equal(r.safeValuation,false);
  assert.equal(JSON.stringify(official),before);
});
test('European similarly named company with wrong LEI or ISIN is not merged',()=>{
  for(const k of ['issuerLEI','isin']){const r=evaluateOfficialFusion({listing:{...lvmh,[k]:'WRONG'},official,cutoff:'2026-09-30'});assert.equal(r.exactCompanyJoin,false);assert.equal(r.eligibleFacts,0);}
});
test('LVMH historical facts become available on publication, never at period end',()=>{
  const r=evaluateOfficialFusion({listing:lvmh,official,cutoff:'2024-12-31'});
  assert.equal(r.eligibleFacts,0);assert.ok(r.blockers.includes('OFFICIAL_FILING_NOT_PUBLIC_AT_CUTOFF'));
});
test('ESEF currency or missing provenance is never quietly accepted',()=>{
  const mismatch=evaluateOfficialFusion({listing:{...lvmh,tradingCurrency:'USD'},official,cutoff:'2026-09-30'});assert.equal(mismatch.eligibleFacts,0);
  const doc=structuredClone(official);delete doc.provenance['revenue|2024-12-31|FY'];
  const r=evaluateOfficialFusion({listing:lvmh,official:doc,cutoff:'2026-09-30'});assert.equal(r.eligibleFacts,11);
});
test('report reproduction is deterministic, excludes raw prices and never promotes local price-only stocks',()=>{
  const a=buildFusionReport(),b=buildFusionReport();assert.deepEqual(a,b);
  assert.equal(a.requestsMade,0);assert.equal(a.canonicalWrites,0);assert.equal(a.protectedSourceBytesUnchanged,true);
  assert.equal(a.summary.localExactOfficialJoins,1);assert.equal(a.summary.fullQuantReady,0);
  assert.ok(a.companies.filter(c=>c.sampleRole==='LOCAL_EUROPEAN_LISTING').every(c=>c.fullQuantEligibility==='BLOCKED'));
  assert.ok(a.companyDocuments.every(d=>d.canonicalDocuments===1));
  assert.ok(!JSON.stringify(a).includes('"close":'));
});

test('duration balance-sheet data cannot enter P/B or enterprise value',()=>{
  const r=evaluate(a=>{a.doc.annual.stockholders_equity=[];a.doc.ttm.stockholders_equity={v:100,end:a.doc.ttm.revenue.end,filed:'2026-07-31',unit:'USD',kind:'TTM'};a.doc.ttm.net_debt={v:100,end:a.doc.ttm.revenue.end,filed:'2026-07-31',unit:'USD',kind:'TTM'};});
  assert.equal(r.valuations.pb,null);assert.equal(r.valuations.evSales,null);assert.equal(r.valuations.evEbitda,null);
});
test('observed provider currency must be present and agree with normalized contract',()=>{
  for(const value of [null,'EUR']){const r=evaluate(a=>{a.quote.observation.reportedCurrency=value;});assert.equal(r.safeValuation,false);}
});
test('ETF and unknown asset types do not enter company valuations',()=>{
  for(const value of [null,'ETF'])assert.equal(evaluate(a=>{a.listing.assetType=value;}).safeValuation,false);
});
test('nonfinite capitalization cannot create false safe arithmetic',()=>{
  const r=evaluate(a=>{a.doc.ttm.shares_outstanding.v=Number.MAX_VALUE;});assert.equal(r.safeValuation,false);assert.equal(r.valuations.marketCap,null);
});
test('official facts retain company ownership and exact normalized provenance',()=>{
  for(const mutate of [f=>{f.securityId='another-company';},f=>{f.value+=1;}]){
    const doc=structuredClone(official);mutate(doc.facts[0]);
    const r=evaluateOfficialFusion({listing:lvmh,official:doc,cutoff:'2026-09-30'});assert.equal(r.eligibleFacts,11);
  }
});

test('a filed share count does not prove its post-split price basis',()=>{
  const r=evaluate(a=>{a.shareCountPriceBasisVerified=false;});assert.equal(r.safeValuation,false);
  assert.ok(r.blockers.includes('SHARE_COUNT_PRICE_CORPORATE_ACTION_BASIS_UNVERIFIED'));assert.equal(r.valuations.marketCap,null);
});
test('published real provider retest retains explicit bounds and never certifies production valuation',()=>{
  const report=JSON.parse(readFileSync(new URL('../../reports/marketstack/fundamental_price_fusion_validation.json',import.meta.url)));
  assert.equal(report.summary.safeValuationReady,0);assert.equal(report.summary.fullQuantReady,0);
  assert.equal(report.freshUSClosingPriceRetest.length,2);
  for(const r of report.freshUSClosingPriceRetest){
    assert.equal(r.observedTradingDate,report.asOfDate);assert.ok(r.checkedAt <= report.generatedAt);
    assert.equal(r.actualProductionAdmission,false);assert.equal(r.evaluation.safeValuation,false);
    assert.ok(r.historicalExplicitExpectedCurrencyBars <= r.historicalBars);
    assert.equal(r.acceptedBaselineCoverageDenominatorsChanged,false);
  }
});
