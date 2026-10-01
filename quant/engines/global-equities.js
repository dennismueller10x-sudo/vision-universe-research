/* Additive global identity and policy. Existing IDs are never replaced.
   Country describes the company; listingCountry describes the trading venue.
   No name-based company merging and no inferred depositary ratios. */
(function (global) {
  "use strict";
  var EUROPE = "DE FR NL BE ES IT AT CH GB SE DK NO FI IE PT LU IS GR PL CZ HU RO BG HR EE LV LT CY MT SI SK LI".split(" ");
  var CURRENCIES = "USD EUR CHF GBP DKK SEK NOK JPY KRW TWD HKD CNY INR BRL CAD AUD NZD ZAR MXN CLP ARS ILS SGD IDR MYR THB PLN CZK HUF TRY AED SAR".split(" ");
  function region(country) {
    if (!country) return null;
    if (EUROPE.indexOf(country) >= 0) return "EUROPE";
    if (country === "US" || country === "CA") return "NORTH_AMERICA";
    if ("BR MX CL AR CO PE UY".split(" ").indexOf(country) >= 0) return "LATIN_AMERICA";
    if ("JP KR TW CN HK IN SG ID MY TH".split(" ").indexOf(country) >= 0) return "ASIA_PACIFIC";
    return "OTHER";
  }
  function listingKey(row) { return String(row.ticker || row.symbol || "").toUpperCase() + "@" + String(row.mic || row.exchange || "").toUpperCase(); }
  function geographyQuery(text) {
    var q = String(text || "").trim().toLowerCase().replace(/\b(stocks?|equities|aktien)\b/g, "").trim();
    if (["europe", "european", "europa", "europaische", "europäische"].indexOf(q) >= 0) return { region: "EUROPE" };
    var countries = { de: "DE", germany: "DE", german: "DE", deutschland: "DE", deutsche: "DE",
      fr: "FR", france: "FR", french: "FR", frankreich: "FR", nl: "NL", netherlands: "NL", niederlande: "NL",
      ch: "CH", switzerland: "CH", schweiz: "CH", gb: "GB", uk: "GB", dk: "DK", denmark: "DK", dänemark: "DK" };
    return countries[q] ? { country: countries[q] } : null;
  }
  function validate(layer) {
    if (!layer || layer.schemaVersion !== "global-equities-1.0.0") throw Error("GLOBAL_SCHEMA_INVALID");
    var companies = new Set();
    (layer.companies || []).forEach(function (c) {
      if (!c.companyId || companies.has(c.companyId) || !c.source) throw Error("GLOBAL_COMPANY_IDENTITY_INVALID");
      companies.add(c.companyId);
    });
    var ids = new Set(), listingIds = new Set(), keys = new Set();
    (layer.listings || []).forEach(function (r) {
      if (!r.securityId || !r.listingId || !r.companyId || !r.ticker || !r.exchange || !r.mic) throw Error("GLOBAL_IDENTITY_INCOMPLETE");
      if (companies.size && !companies.has(r.companyId)) throw Error("GLOBAL_COMPANY_NOT_FOUND");
      if (ids.has(r.securityId) || listingIds.has(r.listingId) || keys.has(listingKey(r))) throw Error("GLOBAL_DUPLICATE_LISTING");
      ids.add(r.securityId); listingIds.add(r.listingId); keys.add(listingKey(r));
      if (!/^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(r.ticker)) throw Error("GLOBAL_SYMBOL_INVALID");
      if (CURRENCIES.indexOf(r.tradingCurrency) < 0) throw Error("GLOBAL_CURRENCY_INVALID");
      if (r.country && !/^[A-Z]{2}$/.test(r.country)) throw Error("GLOBAL_COUNTRY_INVALID");
      if (r.assetType !== "EQUITY" || ["ADR", "ORDINARY", "UNVERIFIED"].indexOf(r.listingType) < 0) throw Error("GLOBAL_NON_EQUITY");
      if (!r.source || !r.sourceUpdatedAt) throw Error("GLOBAL_PROVENANCE_MISSING");
      if (r.adrRatio !== null && r.adrRatio !== undefined && (!Number.isFinite(r.adrRatio) || !(r.adrRatio > 0) || !r.adrRatioSource)) throw Error("GLOBAL_ADR_RATIO_UNVERIFIED");
    });
    return layer;
  }
  function overlay(securities, layer) {
    validate(layer);
    var byId = new Map((layer.listings || []).map(function (r) { return [r.securityId, r]; }));
    return securities.map(function (s) {
      var g = byId.get(s.securityId || s.masterMemberId);
      if (!g) return s;
      if (String(s.ticker || s.symbol).toUpperCase() !== g.ticker ||
          (s.mic && s.mic !== g.mic) || (s.exchange && String(s.exchange).toUpperCase() !== g.exchange.toUpperCase())) throw Error("GLOBAL_LISTING_MISMATCH");
      return Object.assign({}, s, {
        companyId: g.companyId, listingId: g.listingId, companyCountry: g.country,
        providerSymbol: g.providerSymbol,
        region: region(g.country), domicile: g.domicile || null,
        listingCountry: g.listingCountry, tradingCurrency: g.tradingCurrency,
        reportingCurrency: g.reportingCurrency || null, listingType: g.listingType,
        adrRatio: g.adrRatio || null, adrRatioSource: g.adrRatioSource || null,
        shareCountBasis: g.shareCountBasis || null, shareCountBasisSource: g.shareCountBasisSource || null,
        epsBasis: g.epsBasis || null, epsBasisSource: g.epsBasisSource || null,
        assetIdentity: g.companyId, coverage: g.coverage, globalSource: g.source,
        globalSourceUpdatedAt: g.sourceUpdatedAt
      });
    });
  }
  // Candidate selection consumes verified coverage/liquidity, never a ticker list.
  function selectPreferred(listings, policy) {
    policy = policy || {};
    var eligible = (listings || []).filter(function (r) {
      return r.active === true && r.assetType === "EQUITY" && r.otc !== true &&
        r.coverage && r.coverage.price === "VERIFIED" &&
        Number.isFinite(r.avgDailyTurnoverUSD) && r.avgDailyTurnoverUSD >= (policy.minDailyTurnoverUSD || 5000000) &&
        r.historyBars >= (policy.minHistoryBars || 250);
    });
    var adrs = eligible.filter(function (r) { return r.listingType === "ADR" && r.listingCountry === "US"; });
    var primaries = eligible.filter(function (r) { return r.primaryListing === true; });
    var pool = adrs.length ? adrs : primaries;
    pool.sort(function (a, b) { return b.avgDailyTurnoverUSD - a.avgDailyTurnoverUSD || listingKey(a).localeCompare(listingKey(b)); });
    return pool[0] || null;
  }
  function valuationGate(listing, reportingCurrency) {
    if (!listing) return null; // protected legacy path
    var trading = listing.tradingCurrency || listing.currency;
    if (reportingCurrency && trading && reportingCurrency !== trading) return trading === "USD" ? "NON_USD_REPORTING" : "REPORTING_TRADING_CURRENCY_MISMATCH";
    if (listing.listingType === "ADR" && (!Number.isFinite(listing.adrRatio) || !(listing.adrRatio > 0) || !listing.adrRatioSource)) return "ADR_RATIO_UNVERIFIED";
    if (listing.listingType === "ADR" && (["ORDINARY", "LISTING"].indexOf(listing.shareCountBasis) < 0 || !listing.shareCountBasisSource)) return "SHARE_BASIS_UNVERIFIED";
    if (listing.listingType === "UNVERIFIED" && listing.companyCountry && listing.companyCountry !== listing.listingCountry) return "SHARE_BASIS_UNVERIFIED";
    return null;
  }
  // adrRatio means ordinary shares represented by one ADR. Counts and EPS
  // are converted only with separately verified input-basis evidence.
  function listingShares(count, listing) {
    if (!Number.isFinite(count) || count <= 0 || valuationGate(listing, null)) return null;
    return listing && listing.listingType === "ADR" && listing.shareCountBasis === "ORDINARY" ? count / listing.adrRatio : count;
  }
  function listingEps(eps, listing) {
    if (!Number.isFinite(eps)) return null;
    if (!listing || listing.listingType !== "ADR") return eps;
    if (!Number.isFinite(listing.adrRatio) || !(listing.adrRatio > 0) || !listing.adrRatioSource || !listing.epsBasisSource) return null;
    return listing.epsBasis === "ORDINARY" ? eps * listing.adrRatio : listing.epsBasis === "LISTING" ? eps : null;
  }
  function priceQuality(points) {
    var issues = [], dates = new Set(), previous = null;
    if (!Array.isArray(points) || points.length < 2) return ["PRICE_HISTORY_MISSING"];
    points.forEach(function (p) {
      if (!Array.isArray(p) || !/^\d{4}-\d{2}-\d{2}$/.test(p[0]) || !Number.isFinite(p[1]) || p[1] <= 0) {
        issues.push("PRICE_POINT_INVALID"); return;
      }
      if (dates.has(p[0])) issues.push("DUPLICATE_PRICE_DATE");
      if (previous && p[0] < previous[0]) issues.push("PRICE_DATES_UNSORTED");
      // Diagnostic only: a corporate action can explain large valid moves.
      if (previous && (p[1] / previous[1] > 5 || p[1] / previous[1] < 0.2)) issues.push("PRICE_SPIKE_REVIEW");
      dates.add(p[0]); previous = p;
    });
    return Array.from(new Set(issues));
  }
  var api = { VERSION: "global-equities-1.0.0", EUROPE: EUROPE, region: region, listingKey: listingKey,
    validate: validate, overlay: overlay, selectPreferred: selectPreferred, valuationGate: valuationGate, priceQuality: priceQuality, geographyQuery: geographyQuery,
    listingShares: listingShares, listingEps: listingEps };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUGlobalEquities = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
