'use strict';

// Ingestion-only ETF/fund portfolio observations. Never company fundamentals.
function text(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return !s || /^(?:n\/a|null|none)$/i.test(s) ? null : s;
}
function number(value) {
  const s = text(value);
  if (s === null || typeof value === 'boolean') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function date(value) {
  const s = text(value);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s ? s : null;
}

function normalizeETFHoldings(payload, identity, options = {}) {
  if (!identity || String(identity.asset_type || identity.assetType).toUpperCase() !== 'ETF' ||
      (!identity.securityId && !identity.security_id) || (!identity.listingId && !identity.listing_id)) {
    return {ok: false, reason: 'etfIdentityRequired'};
  }
  if (payload && (payload.error || Number(payload.code) >= 400)) {
    return {ok: false, reason: 'providerError', code: payload.code || payload.error.code || null};
  }
  const attributes = payload && payload.output && payload.output.attributes;
  const rows = payload && payload.output && payload.output.holdings;
  if (!attributes || !Array.isArray(rows)) return {ok: false, reason: 'invalidHoldingsResponse'};
  const symbol = text(identity.provider_symbol || identity.symbol);
  if (!symbol || text(attributes.ticker) !== symbol) return {ok: false, reason: 'symbolMismatch'};
  if (identity.isin && text(attributes.isin) !== identity.isin) return {ok: false, reason: 'isinMismatch'};
  const reportDate = date(attributes.end_report_period || attributes.date_report_period);
  if (!reportDate) return {ok: false, reason: 'reportDateMissing'};
  const anomalies = [], seen = new Map();
  const holdings = rows.map((row, index) => {
    const s = row && row.investment_security;
    if (!s || typeof s !== 'object') {
      anomalies.push({code: 'INVALID_HOLDING', index});
      return {index, valid: false, raw: row};
    }
    const weightPercent = number(s.percent_value);
    if (weightPercent === null) anomalies.push({code: 'MISSING_OR_INVALID_WEIGHT', index});
    if (weightPercent !== null && Math.abs(weightPercent) > 100) anomalies.push({code: 'EXTREME_HOLDING_WEIGHT', index});
    const h = {index, valid: true, name: text(s.name), title: text(s.title), isin: text(s.isin),
      cusip: text(s.cusip), lei: text(s.lei), currency: text(s.currency), country: text(s.invested_country),
      units: text(s.units), balance: number(s.balance), valueUSD: number(s.value_usd),
      weightPercent, weightFraction: weightPercent === null ? null : weightPercent / 100,
      assetCategory: text(s.asset_category), payoffProfile: text(s.payoff_profile),
      cashCollateral: text(s.cash_collateral), nonCashCollateral: text(s.non_cash_collateral),
      loanByFund: text(s.loan_by_fund), issuerCategory: text(s.issuer_category),
      fairValueLevel: text(s.fair_value_level), raw: {...s}};
    // Cash collateral and derivative legs must not disappear through equity-style deduplication.
    const key = JSON.stringify([h.isin || h.cusip || h.lei || h.title, h.currency, h.assetCategory,
      h.payoffProfile, h.cashCollateral, h.nonCashCollateral, h.units, h.balance, h.valueUSD]);
    if (seen.has(key)) anomalies.push({code: 'DUPLICATE_HOLDING_LINE', index, previousIndex: seen.get(key)});
    else seen.set(key, index);
    return h;
  });
  const weights = holdings.filter(h => h.valid && h.weightPercent !== null).map(h => h.weightPercent);
  const totalWeightPercent = weights.length ? weights.reduce((a, b) => a + b, 0) : null;
  if (totalWeightPercent !== null && Math.abs(totalWeightPercent - 100) > (options.totalTolerancePercent ?? 2)) {
    anomalies.push({code: 'HOLDINGS_TOTAL_REQUIRES_REVIEW', totalWeightPercent});
  }
  return {ok: true, data: {
    schemaVersion: 'etf-holdings-1.0.0', assetType: 'etf',
    securityId: identity.securityId || identity.security_id, listingId: identity.listingId || identity.listing_id,
    fund: {name: text(payload.basics && payload.basics.fund_name), cik: text(payload.basics && payload.basics.cik),
      secFileNumber: text(payload.basics && payload.basics.file_number), lei: text(payload.basics && payload.basics.reg_lei),
      seriesName: text(attributes.series_name), seriesId: text(attributes.series_id),
      seriesLEI: text(attributes.series_lei), isin: text(attributes.isin)},
    portfolioScope: 'REPORTED_FUND_SERIES', reportDate,
    reportPeriodStart: date(attributes.date_report_period), reportPeriodEnd: date(attributes.end_report_period),
    signatureDate: date(payload.output.signature && payload.output.signature.date_signed),
    publicAvailableAt: null, // A signature is not an SEC acceptance/publication timestamp.
    holdings, coverage: holdings.some(h => h.valid) ? 'PARTIAL' : 'NONE',
    completeness: 'UNKNOWN', totalWeightPercent, anomalies,
    provenance: {provider: 'marketstack', endpoint: 'etfholdings', provider_symbol: symbol,
      retrieved_at: options.retrievedAt || null, source_document: null,
      source_filing_id: null, source_system: 'MARKETSTACK_REGULATORY_FUND_REPORT',
      regulatory_source_inferred: 'SEC', regulatory_source_verified: false}
  }};
}

module.exports = {normalizeETFHoldings};
