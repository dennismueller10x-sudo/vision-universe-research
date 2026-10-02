#!/usr/bin/env node
/** Read-only product-fitness experiment. Existing SEC/ESEF sources own facts.
 * No network access, production publication, inferred company merge or FX rate.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const FundamentalInputs = require('../../quant/engines/fundamental-inputs.js');
const GlobalEquities = require('../../quant/engines/global-equities.js');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const date = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const emptyValuations = () => Object.fromEntries(['marketCap', 'pe', 'ps', 'pb', 'evSales', 'evEbitda', 'fcfYield'].map(k => [k, null]));

/** Existing trusted internal identity and independently verified provider identity
 * are separate claims. A matching symbol/MIC alone does not certify the issuer.
 * The caller supplies evidence, never a synthetic ADR ratio or implied FX.
 */
export function evaluateSecFusion({ listing, doc, quote, cutoff, issuerListings = [], providerIdentityVerified = false, shareCountPriceBasisVerified = false }) {
  const blockers = [];
  const fail = (b) => { if (!blockers.includes(b)) blockers.push(b); };
  const validCutoff = date(cutoff);
  if (!validCutoff) fail('INVALID_AS_OF_DATE');
  const internalJoin = Boolean(listing?.companyId && listing?.securityId && doc?.cik &&
    doc.schema === FundamentalInputs.CONSUMER_SCHEMA &&
    listing.cik === doc.cik && doc.securityIds?.includes(listing.securityId));
  if (!internalJoin) fail('CANONICAL_COMPANY_SECURITY_JOIN_UNVERIFIED');
  if (doc?.dataSource?.pitCapable !== true || doc?.dataSource?.isMock !== false) fail('CANONICAL_PIT_SOURCE_UNVERIFIED');
  if (!providerIdentityVerified) fail('PROVIDER_ISSUER_IDENTITY_UNVERIFIED');
  if (!shareCountPriceBasisVerified) fail('SHARE_COUNT_PRICE_CORPORATE_ACTION_BASIS_UNVERIFIED');
  const quoteIdentity = Boolean(quote && quote.securityId === listing?.securityId &&
    quote.providerSymbol === listing?.providerSymbol && quote.mic === listing?.mic);
  if (!quoteIdentity) fail('PROVIDER_LISTING_IDENTITY_MISMATCH');
  if (!quote?.validLatest || !date(quote.tradingDate) || (validCutoff && quote.tradingDate > cutoff)) fail('LATEST_PRICE_NOT_VALIDATED_AT_CUTOFF');
  const o = quote?.observation;
  if (!o || ![o.open, o.high, o.low, o.close].every(v => finite(v) && v > 0) ||
    o.low > Math.min(o.open, o.close) || o.high < Math.max(o.open, o.close) || o.low > o.high) fail('PRICE_OHLC_INVALID');
  if (!listing?.tradingCurrency || !quote?.normalizedCurrency || quote.normalizedCurrency !== listing.tradingCurrency) fail('TRADING_CURRENCY_UNVERIFIED_OR_MISMATCH');
  const reportingCurrency = doc?.units?.revenue || doc?.units?.net_income || doc?.units?.total_assets || null;
  if (!reportingCurrency || !/^[A-Z]{3}$/.test(reportingCurrency)) fail('REPORTING_CURRENCY_UNVERIFIED');
  const currencyGate = GlobalEquities.valuationGate(listing, reportingCurrency);
  if (currencyGate) fail(currencyGate);
  if (!['ORDINARY', 'ADR'].includes(listing?.listingType)) fail('SHARE_CLASS_BASIS_UNVERIFIED');
  if (listing?.assetType !== 'EQUITY') fail('COMPANY_SECURITY_ASSET_TYPE_UNVERIFIED');
  if (issuerListings.length !== 1 || issuerListings[0] !== listing?.securityId || (doc?.securityIds?.length || 0) !== 1) fail('SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING');
  const unpriced = validCutoff && doc ? FundamentalInputs.compute(doc, cutoff, null) : null;
  const shares = unpriced?.shares;
  const shareEntry = doc?.ttm?.shares_outstanding;
  if (!shares || !shareEntry || shareEntry.unit !== 'shares' || shareEntry.kind !== 'INSTANT' ||
    !date(shareEntry.end) || shareEntry.end > cutoff || !date(shareEntry.filed) || shareEntry.filed > cutoff ||
    !(shares.value > 0)) fail('NO_SAFE_PIT_INSTANT_SHARES');
  if (!unpriced) fail('CANONICAL_FUNDAMENTALS_DOCUMENT_UNAVAILABLE');
  const adjustedShares = shares ? GlobalEquities.listingShares(shares.value, listing) : null;
  if (shares && !finite(adjustedShares)) fail('LISTING_SHARE_BASIS_UNVERIFIED');
  if (finite(adjustedShares) && finite(o?.close) && (!finite(adjustedShares * o.close) || adjustedShares * o.close <= 0)) fail('MARKET_CAP_ARITHMETIC_INVALID');
  if (typeof o?.reportedCurrency !== 'string' || o.reportedCurrency.toUpperCase() !== quote?.normalizedCurrency) fail('PROVIDER_REPORTED_CURRENCY_UNVERIFIED_OR_MISMATCH');
  const safe = blockers.length === 0;
  const marketCap = safe ? adjustedShares * o.close : null;
  const valuations = emptyValuations();
  const fields = {};
  const ttm = (metric) => {
    const entry = doc?.ttm?.[metric];
    const val = validCutoff && doc ? FundamentalInputs.ttmValue(doc, metric, cutoff) : null;
    if (!val || !entry || entry.kind !== 'TTM' || entry.unit !== reportingCurrency || !date(val.filed) || val.filed > cutoff ||
      !date(entry.end) || entry.end > cutoff || entry.end !== unpriced?.referenceEnd) return null;
    return val.value;
  };
  const instant = (metric) => {
    const entry = doc?.ttm?.[metric];
    const val = validCutoff && doc ? FundamentalInputs.ttmValue(doc, metric, cutoff) : null;
    if (!val || !entry || entry.kind !== 'INSTANT' || entry.unit !== reportingCurrency || !date(val.filed) || val.filed > cutoff || !date(entry.end) ||
      entry.end > cutoff || entry.end !== unpriced?.referenceEnd) return null;
    return val.value;
  };
  if (safe) {
    valuations.marketCap = marketCap;
    const revenue = ttm('revenue'), income = ttm('net_income'), fcf = ttm('free_cash_flow');
    // The existing engine permits a reported annual equity instant within its
    // 400-day balance-sheet window. Preserve that rule and expose its period.
    const annualEquity = FundamentalInputs.annualSeries(doc, 'stockholders_equity', cutoff)
      .filter(e => date(e.end) && date(e.filed) && e.filed <= cutoff && e.end <= unpriced.referenceEnd).at(-1);
    const alignedEquity = doc.units.stockholders_equity === reportingCurrency
      ? FundamentalInputs.periodAligned(annualEquity, unpriced.referenceEnd) : null;
    const equity = instant('stockholders_equity') ?? alignedEquity?.value ?? null;
    const netDebt = instant('net_debt'), ebitda = ttm('ebitda');
    if (income > 0) valuations.pe = marketCap / income;
    if (revenue > 0) valuations.ps = marketCap / revenue;
    if (equity > 0) valuations.pb = marketCap / equity;
    if (finite(fcf)) valuations.fcfYield = fcf / marketCap;
    if (finite(netDebt) && marketCap + netDebt > 0) {
      if (revenue > 0) valuations.evSales = (marketCap + netDebt) / revenue;
      if (ebitda > 0) valuations.evEbitda = (marketCap + netDebt) / ebitda;
    }
  }
  for (const [key, v] of Object.entries(valuations)) fields[key] = {
    status: finite(v) ? 'AVAILABLE' : 'BLOCKED',
    reason: safe ? (finite(v) ? null : 'MISSING_POSITIVE_ALIGNED_PIT_METRIC') : 'UNSAFE_IDENTITY_PRICE_OR_SHARE_BASIS'
  };
  const priced = safe ? FundamentalInputs.compute(doc, cutoff, marketCap) : null;
  return { internalJoin, providerIdentityVerified, shareCountPriceBasisVerified, safeValuation: safe, blockers, fields, valuations,
    fundamentalRawCount: Object.keys(unpriced?.raws || {}).length,
    pricedFundamentalRawCount: Object.keys(priced?.raws || {}).length,
    fundamentalsAsOf: unpriced?.fundamentalsAsOf || null,
    availableAt: unpriced?.availableAt || null,
    sharesFiledAt: shareEntry?.filed || null,
    reportingCurrency,
    fullQuantEligibility: 'BLOCKED', // Price-history, technical and methodology gates are separately required.
    sourceAvailability: 'EXISTING_SEC_FILING_DATE_CONSERVATIVE_EOD',
    balanceSheetAlignmentPolicy: { maxAgeDays: FundamentalInputs.STALE_INSTANT_DAYS,
      equityAnnualFallback: true, enterpriseValueAnnualDebtFallback: false },
    isolatedOnly: true };
}

/** Official facts remain company-owned. An exact LEI and ISIN proves this
 * particular listing join; it is never replaced by a company-name match.
 */
export function evaluateOfficialFusion({ listing, official, cutoff }) {
  const validCutoff = date(cutoff);
  const exactCompanyJoin = Boolean(listing?.assetType === 'EQUITY' && listing?.issuerLEI && listing?.isin &&
    official?.companyId && listing.issuerLEI === official.lei && listing.isin === official.isin &&
    (!listing.companyId || listing.companyId === official.companyId));
  const beforeCutoff = validCutoff && typeof official?.availableAt === 'string' &&
    Number.isFinite(Date.parse(official.availableAt)) && Date.parse(official.availableAt) <= Date.parse(`${cutoff}T23:59:59.999Z`);
  const facts = exactCompanyJoin && beforeCutoff ? (official.facts || []).filter(f => {
    const p = official.provenance?.[`${f.metricId}|${f.periodEnd}|${f.fiscalPeriod}`];
    return finite(f.value) && date(f.periodEnd) && f.periodEnd <= cutoff && f.availableAt &&
      Number.isFinite(Date.parse(f.availableAt)) && Date.parse(f.availableAt) <= Date.parse(`${cutoff}T23:59:59.999Z`) &&
      f.securityId === official.companyId && f.currency === listing.tradingCurrency && p &&
      p.sourceSystem === official.sourceSystem && p.documentId === f.sourceFilingId &&
      p.normalizedValue === f.value && p.currency === f.currency && p.availableAt === f.availableAt;
  }) : [];
  const blockers = [];
  if (!exactCompanyJoin) blockers.push('EXACT_OFFICIAL_COMPANY_LEI_ISIN_JOIN_UNVERIFIED');
  if (!beforeCutoff) blockers.push('OFFICIAL_FILING_NOT_PUBLIC_AT_CUTOFF');
  if (facts.length !== (official?.facts?.length || 0)) blockers.push('SOME_FACTS_FAIL_PIT_CURRENCY_OR_PROVENANCE');
  if (!official?.facts?.length) blockers.push('OFFICIAL_CANONICAL_FACTS_MISSING');
  blockers.push('NO_COMPLETE_STANDALONE_QUARTER_TTM_EXPORT', 'NO_VERIFIED_LISTING_SHARE_BASIS', 'PRICE_ADJUSTMENTS_UNVERIFIED');
  return { companyId: exactCompanyJoin ? official.companyId : null, exactCompanyJoin,
    eligibleFacts: facts.length, annualMetrics: [...new Set(facts.map(f => f.metricId))].sort(),
    periods: [...new Set(facts.map(f => f.periodEnd))].sort(),
    annualOnly: facts.length > 0 && facts.every(f => f.fiscalPeriod === 'FY'), fullQuantEligibility: 'BLOCKED',
    safeValuation: false, valuations: emptyValuations(), blockers,
    availableAt: beforeCutoff ? official.availableAt : null, isolatedOnly: true };
}

function sanitizeEvaluation(result) {
  const { valuations, ...rest } = result;
  return { ...rest, valuationValues: emptyValuations(), valuationValuesPublished: false };
}
function semanticallyStable(value) {
  if (Array.isArray(value)) return value.map(semanticallyStable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(k => !['retrievedAt', 'ingestedAt'].includes(k)).map(k => [k, semanticallyStable(value[k])]));
  return value;
}

export function buildFusionReport({ root = ROOT, usLatestPath, cutoff = '2026-09-30', generatedAt = '2026-10-02T04:30:00.000Z', esefReplayPath = null, freshHistoryPath = null } = {}) {
  const sources = [], consumed = new Map();
  const load = (path, privateArtifact = false) => {
    const absolute = resolve(root, path); const bytes = readFileSync(absolute);
    consumed.set(absolute, hash(bytes)); sources.push({ path: privateArtifact ? (path === freshHistoryPath ? 'PRIVATE_PRODUCT_FITNESS_RETEST' : 'PRIVATE_RETAINED_US_LATEST') : path, sha256: hash(bytes), privateArtifact });
    return JSON.parse(bytes);
  };
  const global = load('quant/data/universe/global-equities.json');
  const listings = load('quant/data/global-market/listings.json').listings;
  const peer = load('quant/data/product/sic-peer-taxonomy-v1.json');
  const securityMaster = load('quant/data/market/security-master/us-security-master.json').rows;
  const peerColumns = Object.fromEntries(peer.rowColumns.map((k, i) => [k, i]));
  const lookup = new Map(peer.rows.map(r => [r[peerColumns.ticker], r]));
  const prices = usLatestPath ? load(usLatestPath, true).rows : [];
  const entitlement = load('reports/marketstack/marketstack_fundamental_crosscheck.json');
  const officialPaths = readdirSync(join(root, 'quant/data/fundamentals/official')).filter(p => p.endsWith('.json')).sort();
  const official = officialPaths.map(p => load(`quant/data/fundamentals/official/${p}`));
  const companies = [], companyDocuments = new Map();
  const secCompany = (ticker, local = false) => {
    const p = lookup.get(ticker); const cik = p?.[peerColumns.cik];
    const companyId = p?.[peerColumns.issuerId] || null;
    const docPath = cik ? `quant/data/sec/consumer/CIK${cik}.json` : null;
    const doc = docPath && existsSync(join(root, docPath)) ? load(docPath) : null;
    if (doc) companyDocuments.set(companyId, { companyId, sourceSystem: 'SEC_EDGAR', sourcePath: docPath,
      sourceSHA256: sources.at(-1).sha256, canonicalDocuments: 1, factOwnership: 'COMPANY',
      securityIds: doc.securityIds, ttmMetrics: Object.keys(doc.ttm || {}).sort(), annualMetricCount: Object.keys(doc.annual || {}).length });
    const baselineGlobal = global.listings.find(l => l.securityId === p?.[peerColumns.securityId]);
    const quote = prices.find(q => q.securityId === p?.[peerColumns.securityId]);
    // Plain US ordinary mapping is the existing canonical internal security,
    // not an inferred independent Marketstack issuer verification.
    const master = securityMaster.find(r => r.ticker === ticker && r.baseline_security_id === p?.[peerColumns.securityId]);
    const listing = baselineGlobal || { companyId, cik, securityId: p?.[peerColumns.securityId], ticker,
      providerSymbol: quote?.providerSymbol, mic: quote?.mic, tradingCurrency: quote?.expectedCurrency,
      assetType: master?.instrument_type === 'EQUITY_COMMON' ? 'EQUITY' : null,
      listingType: master?.instrument_type === 'EQUITY_COMMON' ? 'ORDINARY' : 'UNVERIFIED' };
    const issuerListings = peer.rows.filter(r => r[peerColumns.cik] === cik).map(r => r[peerColumns.securityId]);
    const evaluation = evaluateSecFusion({ listing, doc, quote, cutoff, issuerListings, providerIdentityVerified: false });
    companies.push({ name: doc?.name || ticker, companyId, cik: cik || null,
      listingIds: baselineGlobal ? [baselineGlobal.listingId] : [], securityIds: doc?.securityIds || [],
      sampleRole: local ? 'EXISTING_US_REGISTRANT_REFERENCE_ONLY_NOT_LOCAL_JOIN' : 'US_CONTROL',
      exactCompanyJoin: evaluation.internalJoin, fundamentalsStatus: doc ? 'EXISTING_SEC_CANONICAL' : 'MISSING',
      fullQuantEligibility: 'BLOCKED', valuationStatus: evaluation.safeValuation ? 'READY' : 'BLOCKED',
      blockers: evaluation.blockers, evaluation: sanitizeEvaluation(evaluation) });
  };
  for (const ticker of ['AAPL', 'NVDA', 'TSM']) secCompany(ticker);
  // Local listings never inherit fundamentals merely because a SEC registrant
  // has the same displayed name or a US ADR ticker.
  for (const ticker of ['SAP', 'SIE', 'RHM', 'ASML', 'MC', 'NOVO-B']) {
    const listing = listings.find(l => l.ticker === ticker && l.listingRegion === 'EUROPE');
    const doc = official.find(d => d.lei && d.lei === listing?.issuerLEI && d.isin === listing?.isin);
    const evaluation = doc ? evaluateOfficialFusion({ listing, official: doc, cutoff }) : null;
    if (doc) companyDocuments.set(doc.companyId, { companyId: doc.companyId, sourceSystem: doc.sourceSystem,
      canonicalDocuments: 1, factOwnership: 'COMPANY', canonicalFactCount: doc.facts.length,
      documentSHA256: doc.documentSha256, manifestSHA256: doc.manifestSha256, annualOnly: true });
    const historyPath = listing ? `quant/data/global-market/history/${listing.listingId}.json` : null;
    const history = historyPath && existsSync(join(root, historyPath)) ? load(historyPath) : null;
    companies.push({ name: listing?.companyName || ticker, companyId: evaluation?.companyId || listing?.companyId || null,
      issuerLEI: listing?.issuerLEI || null, isin: listing?.isin || null,
      listingIds: listing ? [listing.listingId] : [], securityIds: listing ? [listing.securityId] : [],
      providerSymbol: listing?.providerSymbol || null, tradingCurrency: listing?.tradingCurrency || null,
      sampleRole: 'LOCAL_EUROPEAN_LISTING', exactCompanyJoin: evaluation?.exactCompanyJoin || false,
      fundamentalsStatus: doc ? 'OFFICIAL_ANNUAL_PARTIAL' : 'NO_EXACT_LINKED_CANONICAL_FUNDAMENTALS',
      priceHistory: history ? { bars: history.bars.length, firstDate: history.bars[0]?.date || null,
        lastDate: history.bars.at(-1)?.date || null, displayOnly: history.displayOnly === true,
        adjustmentStatus: history.adjustmentStatus } : null,
      fullQuantEligibility: 'BLOCKED', valuationStatus: 'BLOCKED',
      blockers: evaluation?.blockers || ['EXACT_COMPANY_FUNDAMENTALS_JOIN_MISSING', 'PRICE_ADJUSTMENTS_UNVERIFIED'],
      evaluation: evaluation ? sanitizeEvaluation(evaluation) : null });
  }
  for (const ticker of ['SAP', 'ASML', 'NVO']) secCompany(ticker, true);
  const replay = esefReplayPath ? JSON.parse(readFileSync(esefReplayPath)) : null;
  const retained = official.find(d => d.lei === 'IOG4E947OATN0KJYSD45');
  let esefReplay = { performed: false, reason: 'OPTIONAL_CACHED_REPLAY_NOT_SUPPLIED' };
  if (replay && retained) {
    const a = semanticallyStable(retained), b = semanticallyStable(replay);
    const issuesA = a.issues.map(x => JSON.stringify(x)).sort(), issuesB = b.issues.map(x => JSON.stringify(x)).sort();
    delete a.issues; delete b.issues;
    esefReplay = { performed: true, networkRequests: 0, canonicalFacts: replay.facts.length,
      issues: replay.issues.length, semanticFieldsIdentical: JSON.stringify(a) === JSON.stringify(b),
      diagnosticMultisetIdentical: JSON.stringify(issuesA) === JSON.stringify(issuesB),
      retainedSourceSHA256: hash(readFileSync(join(root, 'quant/data/fundamentals/official', officialPaths[official.indexOf(retained)]))),
      replaySourceSHA256: hash(readFileSync(esefReplayPath)) };
  }
  const unchanged = [...consumed].every(([p, sha]) => hash(readFileSync(p)) === sha);
  const counterfactualChecks = ['AAPL', 'NVDA'].map(ticker => {
    const p = lookup.get(ticker), cik = p[peerColumns.cik], doc = JSON.parse(readFileSync(join(root, `quant/data/sec/consumer/CIK${cik}.json`)));
    const q = prices.find(q => q.securityId === p[peerColumns.securityId]);
    if (!q) return { ticker, performed: false, reason: 'PRIVATE_CACHED_PRICE_MISSING' };
    const l = { companyId: p[peerColumns.issuerId], cik, securityId: p[peerColumns.securityId], ticker,
      providerSymbol: q.providerSymbol, mic: q.mic, tradingCurrency: q.expectedCurrency, listingType: 'ORDINARY', assetType: 'EQUITY' };
    const result = evaluateSecFusion({ listing: l, doc, quote: q, cutoff,
      issuerListings: [l.securityId], providerIdentityVerified: true, shareCountPriceBasisVerified: true });
    return { ticker, performed: true, counterfactualOnly: true,
      assumedMissingEvidence: ['INDEPENDENT_MARKETSTACK_ISSUER_IDENTITY_VERIFICATION',
        'SHARE_COUNT_PRICE_BASIS_WITH_NO_UNMODELED_INTERVENING_CORPORATE_ACTION'],
      conditionalValuationFields: Object.entries(result.fields).filter(([,v]) => v.status === 'AVAILABLE').map(([k]) => k),
      conditionalFundamentalRawCount: result.pricedFundamentalRawCount,
      actualProductionAdmission: false };
  });
  const freshEvidence = freshHistoryPath ? load(freshHistoryPath, true) : null;
  const freshUSClosingPriceRetest = ['AAPL', 'NVDA'].map(ticker => {
    const endpoint = freshEvidence?.endpoints?.find(e => e.ok === true && e.endpoint === 'eod' && e.params?.symbols === ticker && e.params?.exchange === 'XNAS');
    if (!endpoint) return { ticker, performed: false, reason: 'FRESH_RETEST_NOT_SUPPLIED' };
    const bars = endpoint.data?.data || [];
    const bar = bars.findLast(b => b.date?.slice(0, 10) === cutoff && b.symbol === ticker && b.exchange === 'XNAS');
    const p = lookup.get(ticker), cik = p?.[peerColumns.cik];
    const doc = cik ? JSON.parse(readFileSync(join(root, `quant/data/sec/consumer/CIK${cik}.json`))) : null;
    const old = prices.find(q => q.securityId === p?.[peerColumns.securityId]);
    const currency = typeof bar?.price_currency === 'string' ? bar.price_currency.toUpperCase() : null;
    const l = { companyId: p?.[peerColumns.issuerId], cik, securityId: p?.[peerColumns.securityId],
      providerSymbol: ticker, mic: 'XNAS', tradingCurrency: 'USD', assetType: 'EQUITY', listingType: 'ORDINARY' };
    const q = bar ? { securityId: l.securityId, providerSymbol: bar.symbol, mic: bar.exchange,
      tradingDate: bar.date.slice(0, 10), normalizedCurrency: currency,
      validLatest: currency === 'USD', observation: { open: bar.open, high: bar.high, low: bar.low,
        close: bar.close, reportedCurrency: bar.price_currency } } : null;
    const evaluation = evaluateSecFusion({ listing: l, doc, quote: q, cutoff,
      issuerListings: [l.securityId], providerIdentityVerified: false, shareCountPriceBasisVerified: false });
    const sameOldDate = old?.tradingDate === bar?.date?.slice(0, 10);
    return { ticker, performed: true, sourceRunId: endpoint.sourceRunId || freshEvidence.run?.runId || null,
      checkedAt: endpoint.checkedAt, historicalBars: bars.length,
      historicalExplicitExpectedCurrencyBars: bars.filter(b => typeof b.price_currency === 'string' && b.price_currency.toUpperCase() === 'USD').length,
      requestedMIC: endpoint.params.exchange, observedMIC: bar?.exchange || null,
      observedSymbol: bar?.symbol || null, observedTradingDate: bar?.date?.slice(0, 10) || null,
      observedCurrency: currency, priceSnapshotRevisions: {
        comparablePreviousClosingDate: sameOldDate,
        closeRelativeDeltaRatio: sameOldDate && finite(old?.observation?.close) && old.observation.close > 0 && finite(bar?.close)
          ? Math.round((bar.close / old.observation.close - 1) * 1e10) / 1e10 : null,
        historicalRestatementCertification: false },
      evaluation: sanitizeEvaluation(evaluation), actualProductionAdmission: false,
      acceptedBaselineCoverageDenominatorsChanged: false };
  });
  // Optional fresh reads are included in the same protected byte check.
  const allSourcesUnchanged = [...consumed].every(([p, sha]) => hash(readFileSync(p)) === sha);
  return { schemaVersion: 'marketstack-fundamental-price-fusion-1.0.0', generatedAt, asOfDate: cutoff,
    experiment: 'ISOLATED_READ_ONLY_COMPANY_LEVEL_JOIN', sourceSystems: ['MARKETSTACK_PRICES', 'EXISTING_SEC_EDGAR', 'EXISTING_OFFICIAL_ESEF'],
    requestsMade: 0, estimatedAdditionalMarketstackCredits: 0, canonicalWrites: 0, productionRoutingChanged: false,
    sources, engines: [
      { path: 'quant/engines/fundamental-inputs.js', sha256: hash(readFileSync(join(root, 'quant/engines/fundamental-inputs.js'))), version: FundamentalInputs.VERSION },
      { path: 'quant/engines/global-equities.js', sha256: hash(readFileSync(join(root, 'quant/engines/global-equities.js'))), version: GlobalEquities.VERSION }
    ], protectedSourceBytesUnchanged: unchanged && allSourcesUnchanged, sourceOwnership: 'ONE_CANONICAL_FUNDAMENTALS_DOCUMENT_PER_COMPANY_NOT_PER_LISTING',
    companies, companyDocuments: [...companyDocuments.values()].sort((a,b) => a.companyId.localeCompare(b.companyId)),
    summary: { sampledCases: companies.length, exactCanonicalInternalJoins: companies.filter(c => c.exactCompanyJoin).length,
      sampledLocalListings: companies.filter(c => c.sampleRole === 'LOCAL_EUROPEAN_LISTING').length,
      localExactOfficialJoins: companies.filter(c => c.sampleRole === 'LOCAL_EUROPEAN_LISTING' && c.exactCompanyJoin).length,
      fullQuantReady: companies.filter(c => c.fullQuantEligibility === 'READY').length,
      safeValuationReady: companies.filter(c => c.evaluation?.safeValuation === true).length,
      conditionalUSValuationExperiments: counterfactualChecks.filter(c => c.performed).length },
    counterfactualChecks, freshUSClosingPriceRetest, esefReplay,
    professionalFundamentals: { sourcePath: 'reports/marketstack/marketstack_fundamental_crosscheck.json',
      state: entitlement.state, sameRegulatorySource: entitlement.externalSourceRelation,
      newEntitlementRequests: 0, accessibleCanonicalFactComparison: false },
    limitations: [
      'Internal CIK/security joins are proven in existing canonical data; independent Marketstack issuer identity is not established by ticker/MIC alone.',
      'Local SAP/ASML/Novo do not inherit US SEC documents without a verified local security-to-company bridge.',
      'LVMH exact LEI+ISIN permits an isolated company projection, but FY 2023/2024 facts do not supply a complete current quarterly/TTM Quant contract.',
      'Date-only SEC filing availability uses the existing conservative EOD contract; this experiment does not certify intraday historical acceptance times.',
      'No fabricated FX, ADR ratio, class-specific shares, fundamentals, period or derived TTM is introduced.',
      'Conditional US calculations demonstrate existing-engine feasibility only; they do not supply missing independent identity evidence or admit production scores.'
    ] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const i=a.indexOf('='); return [a.slice(2,i), a.slice(i+1)]; }));
  const report = buildFusionReport({ usLatestPath: args['us-latest'], esefReplayPath: args['esef-replay'], freshHistoryPath: args['fresh-history'], cutoff: args['as-of'] || '2026-09-30', generatedAt: args['generated-at'] || '2026-10-02T04:30:00.000Z' });
  const out = resolve(args.out || join(ROOT, 'reports/marketstack/fundamental_price_fusion_validation.json'));
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ out, summary: report.summary, sourceBytesUnchanged: report.protectedSourceBytesUnchanged }));
}
