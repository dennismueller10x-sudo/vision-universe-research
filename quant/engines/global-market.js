/* Additive listing/fund contract. Existing US master and EQUITY overlay stay authoritative.
   Missing issuer/security identifiers remain unresolved, never merged by name or ticker. */
(function (global) {
  'use strict';
  var STATES = ['FULL','PARTIAL','NONE','UNKNOWN'];
  var LEVELS = ['REALTIME','NEAR_REALTIME','DELAYED','INTRADAY','EOD_ONLY','UNAVAILABLE','UNKNOWN'];
  function validDate(date) { return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date; }
  function priceIssues(bars) {
    var issues = [], dates = new Set(), last = null;
    if (!Array.isArray(bars) || !bars.length) return ['MISSING_HISTORY'];
    bars.forEach(function (b) {
      if (!b || !validDate(b.date)) { issues.push('INVALID_DATE'); return; }
      if (dates.has(b.date)) issues.push('DUPLICATE_CANDLE');
      if (last && b.date < last.date) issues.push('UNSORTED_CANDLES');
      dates.add(b.date);
      if (['open','high','low','close'].some(function (k) { return !Number.isFinite(b[k]) || b[k] <= 0; })) issues.push('INVALID_PRICE');
      else if (b.low > Math.min(b.open,b.close) || b.high < Math.max(b.open,b.close) || b.high < b.low) issues.push('IMPOSSIBLE_OHLC');
      if (b.volume !== null && b.volume !== undefined && (!Number.isFinite(b.volume) || b.volume < 0)) issues.push('INVALID_VOLUME');
      if (last && last.close > 0 && (b.close/last.close > 5 || b.close/last.close < 0.2) && (!b.splitFactor || b.splitFactor === 1)) issues.push('SPIKE_REQUIRES_REVIEW');
      last = b;
    });
    return Array.from(new Set(issues));
  }
  function validateListing(r) {
    if (!r || !/^vu_[a-f0-9]+$/.test(r.listingId || '') || !r.securityId || !/^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(r.ticker || '') || !/^[A-Z0-9]{4}$/.test(r.mic || '') || !r.exchange) throw Error('GLOBAL_LISTING_IDENTITY_INVALID');
    if (['EQUITY','ETF'].indexOf(r.assetType) < 0 || !r.classificationSource) throw Error('ASSET_CLASS_UNVERIFIED');
    if (!/^[A-Z]{3}$/.test(r.tradingCurrency || '') || !/^[A-Z]{2}$/.test(r.listingCountry || '')) throw Error('GLOBAL_LISTING_CURRENCY_OR_COUNTRY_INVALID');
    if (r.reportingCurrency && !/^[A-Z]{3}$/.test(r.reportingCurrency)) throw Error('REPORTING_CURRENCY_INVALID');
    if (!r.source || !r.sourceUpdatedAt || !Number.isFinite(Date.parse(r.sourceUpdatedAt))) throw Error('GLOBAL_PROVENANCE_MISSING');
    if (r.assetType === 'ETF' && (r.companyId || !r.fundId)) throw Error('ETF_COMPANY_CONFUSION');
    if (r.coverage && Object.values(r.coverage).some(function (v) { return STATES.indexOf(v) < 0; })) throw Error('GLOBAL_COVERAGE_INVALID');
    if (r.price && (r.price.value <= 0 || !Number.isFinite(r.price.value) || !validDate(r.price.asOf) || LEVELS.indexOf(r.price.delayState) < 0)) throw Error('GLOBAL_PRICE_INVALID');
    if (r.listingType === 'ADR' && r.adrRatio !== null && r.adrRatio !== undefined && (!Number.isFinite(r.adrRatio) || r.adrRatio <= 0 || !r.adrRatioSource)) throw Error('ADR_RATIO_UNVERIFIED');
    return r;
  }
  function priceObservations(bars, type) {
    var observations=[],previous=null,threshold=type==='ETF'?0.12:0.30;
    (bars||[]).forEach(function(b){
      if(previous&&previous.close>0&&Math.abs(b.close/previous.close-1)>threshold&&(!b.splitFactor||b.splitFactor===1)) observations.push({date:b.date,previousDate:previous.date,change:b.close/previous.close-1,reason:'UNEXPLAINED_JUMP_REQUIRES_REVIEW'});
      previous=b;
    });
    return observations;
  }
  function validate(layer) {
    if (!layer || layer.schemaVersion !== 'global-market-1.0.0' || !Array.isArray(layer.listings)) throw Error('GLOBAL_MARKET_SCHEMA_INVALID');
    var ids = new Set(), keys = new Set();
    layer.listings.forEach(function (r) { validateListing(r); var key = r.ticker + '@' + r.mic; if (ids.has(r.listingId) || keys.has(key)) throw Error('DUPLICATE_GLOBAL_LISTING'); ids.add(r.listingId); keys.add(key); });
    return layer;
  }
  function equityEligible(r, requirement) {
    return !!(r && r.assetType === 'EQUITY' && r.listingType !== 'PREFERRED' && r.active === true && r.coverage && r.coverage[requirement || 'fundamentals'] === 'FULL');
  }
  function holdingsQuality(holdings, options) {
    options = options || {}; var issues = [], ids = new Set(), sum = 0, missing = 0;
    (holdings || []).forEach(function (h) {
      var key = h.positionId || (h.isin ? 'isin:' + h.isin : null);
      if (key && ids.has(key)) issues.push('DUPLICATE_HOLDING'); if (key) ids.add(key);
      if (h.weight === null || h.weight === undefined) missing++;
      else if (!Number.isFinite(h.weight) || Math.abs(h.weight) > 1 || (h.weight < 0 && h.assetCategory !== 'DE' && h.payoffProfile !== 'Short')) issues.push('INVALID_HOLDING_WEIGHT'); else sum += h.weight;
    });
    // Partial disclosure/derivatives cannot be assumed to sum to 100%.
    if (options.complete === true && (missing || Math.abs(sum - 1) > 0.05)) issues.push('HOLDINGS_TOTAL_ANOMALY');
    return { issues: Array.from(new Set(issues)), positions: (holdings || []).length, missingWeights: missing, knownWeightTotal: sum, complete: options.complete === true };
  }
  var api = { VERSION:'global-market-1.0.0',validate:validate,validateListing:validateListing,priceIssues:priceIssues,priceObservations:priceObservations,equityEligible:equityEligible,holdingsQuality:holdingsQuality,validDate:validDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.VUGlobalMarket = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
