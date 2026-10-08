/* Optional Europe contract; no provider calls, paths, schedules or US migration.
 * Identity is supplied by the canonical catalog, never invented from tickers.
 * Public use requires evidence for the specific data path (ADR-001/002/003).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.EuropeMarketData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var CONTRACT_VERSION = "core-europe-contract-1.0.0";
  var WATCHLIST_KEY = "vu.core.europe.watchlist.v1";
  var FRESH = ["CURRENT", "LAST_VALID_SESSION"];
  var METRICS = ["high52w", "sma20", "sma50", "sma200", "momentum", "relativeStrength", "volatility", "drawdown", "breakout"];
  function available(source, asOf, data) {
    return { state: "AVAILABLE", reason: null, source: source || null, asOf: asOf || null, data: data };
  }
  function unavailable(reason, source) {
    return { state: "UNAVAILABLE", reason: reason, source: source || null, asOf: null, data: null };
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function opaque(value) { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(value); }
  function validDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function numeric(value) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
  function optionalMetrics(metrics, benchmark) {
    var result = {};
    METRICS.forEach(function (name) { result[name] = numeric(metrics && metrics[name]); });
    if (!validBenchmark(benchmark)) result.relativeStrength = null;
    return result;
  }
  function validBenchmark(b) {
    return !!b && b.region === "EUROPE" && b.status === "VALIDATED" && opaque(b.securityId) && !!b.evidenceRef;
  }
  function licensed(rights, scope) {
    return !!rights && rights.display === true && rights.commercial === true &&
      typeof rights.evidenceRef === "string" && rights.evidenceRef.trim().length > 0 &&
      Array.isArray(rights.dataPaths) && rights.dataPaths.indexOf(scope) >= 0;
  }
  function evidenced(value, status) { return !!value && value.status === status && !!value.evidenceRef; }
  function projectionBound(value, security, listing, required) {
    if (!value) return false;
    var dimensions = {securityId:security.securityId, listingId:listing.listingId, currency:listing.currency};
    return Object.keys(dimensions).every(function (key) {
      return required ? value[key] === dimensions[key] : value[key] === undefined || value[key] === dimensions[key];
    });
  }
  function fundamentalsBound(s, l) {
    var f = s.fundamentals, m = f && f.identity && f.identity.mapping;
    return !!f && f.version === "marketstack-europe-fundamentals-1.0.0" && !!m &&
      f.identity.status === "VERIFIED" && m.companyId === s.companyId && m.securityId === s.securityId &&
      !!s.isin && m.isin === s.isin && !!m.shareClassId && (!s.shareClassId || m.shareClassId === s.shareClassId) &&
      m.listingId === l.listingId && !!l.mic && m.mic === l.mic && !!l.currency && m.listingCurrency === l.currency &&
      Array.isArray(f.identity.provenance) && f.identity.provenance.length > 0;
  }
  function fullFundamentals(s, l) {
    var f = s.fundamentals;
    return fundamentalsBound(s, l) && f.status === "VALIDATED" &&
      f.sourcePolicy === "ESEF_OFFICIAL_FILINGS_PRIMARY_SEC_ACTUAL_FILER_ONLY" &&
      f.engineInputsValid === true && f.fundamentalsCurrent === true && f.currencyBasisValid === true &&
      f.sharesBasisValid === true && Array.isArray(f.acceptedFilings) && f.acceptedFilings.length > 0;
  }
  function readiness(security, listing, rights, now) {
    var s = security || {}, l = listing || {};
    var identity = s.acceptance === "ACCEPTED" && s.identity && s.identity.status === "VERIFIED" &&
      opaque(s.companyId) && opaque(s.securityId) && opaque(l.listingId);
    var cutoff = String(now || new Date().toISOString()).slice(0,10);
    var latestStatus = l.latest && l.latest.status || "MISSING";
    if (FRESH.indexOf(latestStatus) >= 0 && (!validDate(l.latest.date) || l.latest.date > cutoff)) latestStatus = "INVALID";
    var fresh = FRESH.indexOf(latestStatus) >= 0;
    var history = !!l.history && l.history.valid === true && l.history.observations > 0;
    var prices = evidenced(l.priceQuality, "VALIDATED") && projectionBound(l.priceQuality,s,l,false);
    var adjusted = evidenced(l.adjustment, "ADJUSTMENT_CERTIFIED") && projectionBound(l.adjustment,s,l,false);
    var benchmark = validBenchmark(l.benchmark);
    var technical = identity && fresh && history && prices && adjusted && benchmark && projectionBound(l.technical,s,l,true) && l.technical.engineProjection === true &&
      l.technical.status === "TECHNICAL_READY";
    var fundamental = fullFundamentals(s, l);
    var quant = identity && technical && fundamental ? "QUANT_FULL" :
      identity && technical ? (fundamentalsBound(s, l) && s.fundamentals.status === "PARTIAL" &&
        s.fundamentals.validFilingCount > 0 ? "QUANT_PARTIAL" : "QUANT_TECHNICAL_ONLY") : "QUANT_BLOCKED";
    var actions = evidenced(l.corporateActions, "VALIDATED") && projectionBound(l.corporateActions,s,l,false);
    var strict = identity && fresh && history && prices && adjusted && actions && benchmark && l.priceQuality.volumeValid === true;
    var trader = strict && l.history.strategyHistoryValid === true;
    var backtest = strict && l.history.backtestHistoryValid === true;
    var chart = identity && history && prices && latestStatus !== "INVALID" ? (adjusted ? "CHART_READY" : "CHART_LIMITED") : "CHART_BLOCKED";
    var tier = identity ? 1 : 0;
    if (tier && chart !== "CHART_BLOCKED") tier = 2;
    if (tier >= 2 && technical && fresh) tier = 3;
    if (tier >= 3 && quant === "QUANT_FULL") tier = 4;
    if (tier >= 4 && trader && backtest) tier = 5;
    var scopes = ["IDENTITY", adjusted ? "CANONICAL_EOD" : "RAW_EOD", "TECHNICAL", "QUANT", "STRATEGY"];
    var publicTier = 0;
    for (var i = 0; i < tier && licensed(rights, scopes[i]); i++) publicTier = i + 1;
    return {
      IDENTITY: identity ? "VERIFIED" : "BLOCKED", LATEST_EOD: latestStatus,
      SNAPSHOT: l.snapshot && l.snapshot.status || "UNAVAILABLE", HISTORY: history ? "AVAILABLE" : "MISSING",
      CHART: chart, LOGO: s.logo && s.logo.status || "LOGO_MISSING",
      SEARCH: identity ? "READY" : "BLOCKED", WATCHLIST: identity ? "READY" : "BLOCKED",
      DISCOVER: identity && fresh && chart !== "CHART_BLOCKED" ? "READY" : "BLOCKED",
      SCREENER: identity && fresh && prices ? "READY" : "BLOCKED",
      TECHNICAL: l.technical && l.technical.engineProjection === true && !projectionBound(l.technical,s,l,true) ? "TECHNICAL_BLOCKED" :
        technical ? "TECHNICAL_READY" : identity && history && prices ? "TECHNICAL_PARTIAL" : "TECHNICAL_BLOCKED",
      RS: benchmark ? "RS_READY" : "RS_BLOCKED", FUNDAMENTALS: fundamental ? "VALIDATED" : "MISSING_OR_PARTIAL",
      QUANT: quant, SUPERTRADER: trader ? "READY" : "BLOCKED", BACKTEST: backtest ? "BACKTEST_READY" :
        identity && history && prices ? "RESEARCH_ONLY" : "BLOCKED",
      adjustmentStatus: l.adjustment && l.adjustment.status || "ADJUSTMENT_UNKNOWN",
      priceBasis: adjusted ? "CANONICAL_SPLIT_ADJUSTED" : "RAW_UNADJUSTED",
      population: "EUROPE_SEPARATE_READINESS", rankingEligible: false, dataTier: tier, publicTier: publicTier,
      publication: publicTier === tier && tier > 0 ? "RIGHTS_CONFIRMED_FOR_TIER" : "RIGHTS_GATE_CLOSED_OR_PARTIAL"
    };
  }
  function catalogIndex(catalog, protectedIds) {
    var rows = Array.isArray(catalog) ? catalog : catalog && catalog.securities || [];
    var protectedSet = new Set(protectedIds || []), securities = new Map(), listings = new Map();
    rows.forEach(function (original) {
      var row = clone(original);
      if (row.region !== "EUROPE" || !opaque(row.securityId) || !opaque(row.companyId) ||
          protectedSet.has(row.securityId) || securities.has(row.securityId)) throw Error("INVALID_EUROPE_CATALOG_IDENTITY");
      if (!Array.isArray(row.listings) || !row.listings.length) throw Error("EUROPE_LISTINGS_REQUIRED");
      row.listings.forEach(function (l) {
        if (!opaque(l.listingId) || l.country === "US" || listings.has(l.listingId) ||
            protectedSet.has(l.listingId)) throw Error("INVALID_EUROPE_LISTING_IDENTITY");
        listings.set(l.listingId, { security: row, listing: l });
      });
      if (!row.listings.some(function (l) { return l.listingId === row.primaryListingId; })) throw Error("EUROPE_PRIMARY_LISTING_REQUIRED");
      securities.set(row.securityId, row);
    });
    return { securities: securities, listings: listings };
  }
  /** Map the accepted output of buildEuropeEquityUniverse without promoting
   * review candidates or treating directory identity as price/rights evidence.
   * Evidence overlays are keyed by exact listingKey/companyKey only.
   */
  function fromFoundation(universe, options) {
    var u = universe || {}, opts = options || {}, all = new Map(), result = [];
    (u.listings || []).forEach(function (l) {
      if (l.status === "ACCEPTED" && Array.isArray(l.identityEvidence) && l.identityEvidence.some(function (e) {
        return e.verified === true && (e.source || e.provenance && e.provenance.source);
      })) all.set(l.listingKey, l);
    });
    (u.securities || []).forEach(function (s) {
      var primary = all.get(s.primaryListing);
      if (!primary || primary.securityId !== s.securityId || primary.companyKey !== s.companyKey) return;
      var listings = (s.listings || []).map(function (key) { return all.get(key); }).filter(function (l) {
        return l && l.securityId === s.securityId && l.companyKey === s.companyKey;
      }).map(function (l) {
        var evidence = opts.listingEvidence && opts.listingEvidence[l.listingKey] || {};
        return { listingId: l.listingKey, instrumentId: l.instrumentId || null,
          ticker: l.symbol || l.providerSymbol, providerSymbol: l.providerSymbol, mic: l.mic,
          exchange: l.providerExchangeCode || l.mic, country: l.exchangeCountry || null,
          currency: l.currency || null, aliases: [l.canonicalTicker].filter(Boolean),
          latest: clone(evidence.latest || {}), history: clone(evidence.history || {}),
          priceQuality: clone(evidence.priceQuality || {}), adjustment: clone(evidence.adjustment || {}),
          corporateActions: clone(evidence.corporateActions || {}), benchmark: clone(evidence.benchmark || {}),
          technical: clone(evidence.technical || {}), snapshot: clone(evidence.snapshot || {}),
          provenance: { identityEvidence: clone(l.identityEvidence) } };
      });
      var companyEvidence = opts.companyEvidence && opts.companyEvidence[s.companyKey] || {};
      result.push({ region: "EUROPE", securityId: s.securityId, companyId: s.companyKey,
        instrumentId: primary.instrumentId || null, name: primary.name || null,
        ticker: primary.symbol || primary.providerSymbol, canonicalTicker: s.canonicalTicker,
        isin: s.isin || null, shareClassId: s.securityKey || null, aliases: clone(s.aliases || []), primaryListingId: s.primaryListing,
        acceptance: "ACCEPTED", identity: { status: "VERIFIED" }, listings: listings,
        indexes: clone(primary.indexMembership || []),
        fundamentals: clone(companyEvidence.fundamentals || {}), logo: clone(companyEvidence.logo || {}) });
    });
    var catalog = { securities: result };
    catalogIndex(catalog, opts.protectedIds);
    return catalog;
  }
  /** usClient is the existing Tiingo-backed core client, passed through verbatim.
   * loadSeries receives canonical IDs and returns a normalized canonical series.
   * It is NOT an HTTP provider client. No storage paths are defined here.
   */
  function create(options) {
    var opts = Object.assign({}, options || {});
    opts.rights = clone(opts.rights || {});
    opts.protectedIds = (opts.protectedIds || []).slice();
    if (!opts.usClient) throw Error("EXISTING_US_CLIENT_REQUIRED");
    if (opts.audience && ["public", "research"].indexOf(opts.audience) < 0) throw Error("INVALID_AUDIENCE");
    var index = catalogIndex(opts.catalog, opts.protectedIds), cache = new Map();
    var source = opts.source || "VU_CANONICAL_EUROPE";
    function gate(scope) { return opts.audience === "research" || licensed(opts.rights, scope); }
    function resolve(ref) {
      if (!ref || ref.region !== "EUROPE") return null;
      var hit;
      if (ref.listingId) {
        hit = index.listings.get(ref.listingId);
        if (hit && ref.securityId && hit.security.securityId !== ref.securityId) return null;
      } else {
        var s = index.securities.get(ref.securityId);
        hit = s && index.listings.get(s.primaryListingId);
      }
      return hit && readiness(hit.security, hit.listing).IDENTITY === "VERIFIED" ? hit : null;
    }
    function us(method, args) {
      if (typeof opts.usClient[method] !== "function") return unavailable("US_CONTRACT_METHOD_UNAVAILABLE");
      return opts.usClient[method].apply(opts.usClient, args);
    }
    function project(hit) {
      var s = hit.security, l = hit.listing;
      return { region: "EUROPE", companyId: s.companyId, securityId: s.securityId, instrumentId: s.instrumentId || null,
        listingId: l.listingId, primaryListingId: s.primaryListingId, name: s.name || null,
        ticker: l.ticker || s.ticker || null, providerSymbol: l.providerSymbol || null, mic: l.mic || null,
        exchange: l.exchange || null, country: l.country || null, currency: l.currency || null,
        isin: s.isin || null, aliases: clone(s.aliases || []), contract: CONTRACT_VERSION };
    }
    function readHit(ref, scope) {
      if (!gate(scope)) return { error: unavailable("DISPLAY_RIGHTS_UNCONFIRMED", source) };
      var hit = resolve(ref);
      return hit ? { hit: hit } : { error: unavailable("CANONICAL_ID_NOT_ACCEPTED", source) };
    }
    async function getSecurity(ref) {
      if (!ref || ref.region !== "EUROPE") return us("getSecurity", arguments);
      var r = readHit(ref, "IDENTITY");
      return r.error || available(source, null, project(r.hit));
    }
    async function getPriceSeries(ref, seriesOptions) {
      if (!ref || ref.region !== "EUROPE") return us("getPriceSeries", arguments);
      var resolved = resolve(ref);
      if (!resolved) return unavailable("CANONICAL_ID_NOT_ACCEPTED", source);
      var r = { hit: resolved };
      var h = r.hit, state = readiness(h.security, h.listing, opts.rights, opts.now), o = seriesOptions || {};
      if (state.CHART === "CHART_BLOCKED") return unavailable("CHART_BLOCKED", source);
      var range = o.range || "1Y", basis = o.basis || state.priceBasis;
      if (!gate(basis === "RAW_UNADJUSTED" ? "RAW_EOD" : "CANONICAL_EOD")) return unavailable("DISPLAY_RIGHTS_UNCONFIRMED", source);
      if (["1Y", "3Y", "5Y", "10Y", "MAX"].indexOf(range) < 0) return unavailable("INVALID_RANGE", source);
      if (basis !== "RAW_UNADJUSTED" && (basis !== "CANONICAL_SPLIT_ADJUSTED" || state.adjustmentStatus !== "ADJUSTMENT_CERTIFIED"))
        return unavailable("ADJUSTMENT_BASIS_NOT_CERTIFIED", source);
      if (typeof opts.loadSeries !== "function") return unavailable("SOURCE_MISSING", source);
      var request = { region: "EUROPE", securityId: h.security.securityId, listingId: h.listing.listingId, range: range, basis: basis };
      var key = JSON.stringify(request), pending = cache.get(key);
      if (!pending) {
        pending = Promise.resolve().then(function () { return opts.loadSeries(request); }).then(function (series) { return clone(series); });
        cache.set(key, pending);
      }
      var s;
      try { s = await pending; } catch (_) { cache.delete(key); return unavailable("SOURCE_MISSING", source); }
      if (!s || s.securityId !== request.securityId || s.listingId !== request.listingId || s.basis !== basis ||
          !s.provenance || !s.provenance.evidenceRef || !s.currency || s.currency !== h.listing.currency)
        return unavailable("CANONICAL_SERIES_CONTRACT_MISMATCH", source);
      if (basis === "CANONICAL_SPLIT_ADJUSTED" && (!evidenced(s.adjustment, "ADJUSTMENT_CERTIFIED") ||
          s.adjustment.method !== "VU_CANONICAL_SPLIT_FACTORS")) return unavailable("ADJUSTMENT_BASIS_NOT_CERTIFIED", source);
      var points = s.points;
      if (!Array.isArray(points) || !points.length) return unavailable("EMPTY_SERIES", source);
      for (var i = 0; i < points.length; i++) {
        if (!Array.isArray(points[i]) || !validDate(points[i][0]) || points[i][0] > String(opts.now || new Date().toISOString()).slice(0,10) || !(numeric(points[i][1]) > 0) ||
            (i > 0 && points[i - 1][0] >= points[i][0])) return unavailable("INVALID_CANONICAL_SERIES", source);
      }
      if (FRESH.indexOf(state.LATEST_EOD) >= 0 && !validDate(h.listing.latest && h.listing.latest.date))
        return unavailable("CANONICAL_LATEST_DATE_UNVERIFIED", source);
      if (validDate(h.listing.latest && h.listing.latest.date) && points[points.length - 1][0] !== h.listing.latest.date)
        return unavailable("CANONICAL_SERIES_LATEST_DATE_MISMATCH", source);
      return available(source, points[points.length - 1][0], {
        securityId: request.securityId, listingId: request.listingId, ticker: h.listing.ticker || null,
        grain: s.grain || "daily", range: range, basis: basis, currency: s.currency, points: clone(points),
        from: points[0][0], to: points[points.length - 1][0], adjustmentStatus: state.adjustmentStatus,
        freshness: state.LATEST_EOD, sessionContinuity: s.sessionContinuity || "UNKNOWN", provenance: clone(s.provenance)
      });
    }
    async function getLatestPrice(ref) {
      if (!ref || ref.region !== "EUROPE") return us("getLatestPrice", arguments);
      var series = await getPriceSeries(ref);
      if (series.state !== "AVAILABLE") return series;
      var d = series.data, last = d.points[d.points.length - 1], prev = d.points.length > 1 ? d.points[d.points.length - 2] : null;
      var adjacent = d.sessionContinuity === "VALIDATED";
      return available(series.source, last[0], { securityId: d.securityId, listingId: d.listingId, ticker: d.ticker,
        close: last[1], date: last[0], previousClose: prev ? prev[1] : null, previousDate: prev ? prev[0] : null,
        changePercent: prev && adjacent ? Math.round((last[1] / prev[1] - 1) * 1e6) / 1e4 : null,
        changeReason: adjacent ? null : "SESSION_CONTINUITY_UNKNOWN", basis: d.basis, currency: d.currency,
        kind: "EOD_CLOSE", freshness: d.freshness, provenance: d.provenance });
    }
    async function search(query, searchOptions) {
      if (!gate("IDENTITY")) return unavailable("DISPLAY_RIGHTS_UNCONFIRMED", source);
      var q = String(query || "").trim().toLocaleLowerCase("en"), hits = [];
      if (!q) return available(source, null, { region: "EUROPE", results: [] });
      var limit = searchOptions && searchOptions.limit || 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return unavailable("INVALID_SEARCH_LIMIT", source);
      index.securities.forEach(function (s) {
        var primary = index.listings.get(s.primaryListingId);
        if (!resolve({ region: "EUROPE", securityId: s.securityId })) return;
        var fields = [s.name, s.ticker, s.isin].concat(s.aliases || []);
        s.listings.forEach(function (l) { fields = fields.concat([l.ticker, l.providerSymbol, l.mic, l.exchange, l.country, l.countryName], l.aliases || []); });
        if (fields.some(function (f) { return typeof f === "string" && f.toLocaleLowerCase("en").indexOf(q) >= 0; })) hits.push(project(primary));
      });
      hits.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "en") || a.securityId.localeCompare(b.securityId, "en"); });
      return available(source, null, { region: "EUROPE", results: hits.slice(0, limit) });
    }
    async function getReadiness(ref) {
      var r = readHit(ref, "IDENTITY");
      return r.error || available(source, null, readiness(r.hit.security, r.hit.listing, opts.rights, opts.now));
    }
    async function getScreenerRow(ref) {
      var resolved = resolve(ref);
      if (!resolved) return unavailable("CANONICAL_ID_NOT_ACCEPTED", source);
      var r = { hit: resolved };
      var h = r.hit, state = readiness(h.security, h.listing, opts.rights, opts.now);
      if (state.SCREENER !== "READY") return unavailable("SCREENER_BLOCKED", source);
      var price = await getLatestPrice(ref);
      if (price.state !== "AVAILABLE") return price;
      var metrics = gate("TECHNICAL") && projectionBound(h.listing.technical,h.security,h.listing,true) && h.listing.technical.engineProjection === true &&
        state.TECHNICAL !== "TECHNICAL_BLOCKED" ? optionalMetrics(h.listing.technical.metrics, h.listing.benchmark) : optionalMetrics();
      return available(source, price.asOf, Object.assign(project(h), metrics, {
        price: price.data.close, priceBasis: price.data.basis, freshness: state.LATEST_EOD,
        volume: h.listing.priceQuality.volumeValid === true && numeric(h.listing.latest && h.listing.latest.volume) >= 0 ? numeric(h.listing.latest && h.listing.latest.volume) : null,
        volumeValid: h.listing.priceQuality.volumeValid === true,
        indexes: h.security.indexes || [], historyLength: h.listing.history.observations, RS: state.RS
      }));
    }
    async function getTechnicalData(ref) {
      var r = readHit(ref, "TECHNICAL");
      if (r.error) return r.error;
      var h = r.hit, state = readiness(h.security, h.listing, opts.rights, opts.now);
      if (state.TECHNICAL === "TECHNICAL_BLOCKED" || !projectionBound(h.listing.technical,h.security,h.listing,true) || h.listing.technical.engineProjection !== true)
        return unavailable("TECHNICAL_INPUTS_NOT_VALIDATED", source);
      return available(source, h.listing.technical.asOf, { securityId: h.security.securityId, listingId: h.listing.listingId,
        status: state.TECHNICAL, metrics: optionalMetrics(h.listing.technical.metrics, h.listing.benchmark),
        RS: state.RS, benchmark: validBenchmark(h.listing.benchmark) ? clone(h.listing.benchmark) : null,
        methodology: h.listing.technical.methodology || null, priceBasis: state.priceBasis });
    }
    async function getQuantData(ref) {
      if (!ref || ref.region !== "EUROPE") return us("getQuantData", arguments);
      var r = readHit(ref, "QUANT");
      if (r.error) return r.error;
      return available(source, null, { securityId: r.hit.security.securityId,
        readiness: readiness(r.hit.security, r.hit.listing, opts.rights, opts.now).QUANT, population: "EUROPE_SEPARATE_READINESS",
        rankingEligible: false, score: null, rank: null });
    }
    async function getIntraday(ref) {
      if (!ref || ref.region !== "EUROPE") return us("getIntraday", arguments);
      var r = readHit(ref, "SNAPSHOT");
      if (r.error) return r.error;
      var snapshot = r.hit.listing.snapshot;
      var nowMs = Date.parse(opts.now || new Date().toISOString()), at = snapshot && Date.parse(snapshot.asOf);
      if (!snapshot || !snapshot.provenance || !snapshot.provenance.evidenceRef || !snapshot.asOf ||
          typeof snapshot.asOf !== "string" || !validDate(snapshot.asOf.slice(0, 10)) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.asOf) ||
          !Number.isFinite(at) || !Number.isFinite(nowMs) || at > nowMs || !(numeric(snapshot.price) > 0) ||
          snapshot.securityId !== r.hit.security.securityId || snapshot.listingId !== r.hit.listing.listingId ||
          snapshot.currency !== r.hit.listing.currency ||
          !["REALTIME_OBSERVED", "SNAPSHOT_CURRENT", "SNAPSHOT_DELAY_UNKNOWN"].includes(snapshot.status))
        return unavailable("SNAPSHOT_NOT_AVAILABLE", source);
      return available(source, snapshot.asOf, { securityId: r.hit.security.securityId, listingId: r.hit.listing.listingId,
        status: snapshot.status, guaranteedRealtime: false, delayMinutes: numeric(snapshot.delayMinutes),
        price: numeric(snapshot.price), provenance: clone(snapshot.provenance) });
    }
    async function getFundamentals(ref) {
      if (!ref || ref.region !== "EUROPE") return us("getFundamentals", arguments);
      var r = readHit(ref, "FUNDAMENTALS");
      if (r.error) return r.error;
      var f = r.hit.security.fundamentals;
      if (!fullFundamentals(r.hit.security, r.hit.listing)) return unavailable("FUNDAMENTALS_NOT_VALIDATED", source);
      return available(source, f.asOf, clone(f));
    }
    async function getCorporateActions(ref) {
      if (!ref || ref.region !== "EUROPE") return us("getCorporateActions", arguments);
      var r = readHit(ref, "CORPORATE_ACTIONS");
      if (r.error) return r.error;
      var actions = r.hit.listing.corporateActions;
      if (!evidenced(actions, "VALIDATED") || !projectionBound(actions,r.hit.security,r.hit.listing,false) || !Array.isArray(actions.events)) return unavailable("CORPORATE_ACTIONS_NOT_VALIDATED", source);
      return available(source, actions.asOf, clone(actions));
    }
    async function getLogo(ref) {
      var r = readHit(ref, "IDENTITY");
      if (r.error) return r.error;
      var logo = r.hit.security.logo || {};
      if (typeof opts.logoResolver !== "function" || !logo.key) return available(source, null, { status: logo.status || "LOGO_MISSING", key: null, fallback: true });
      // Resolver must be the central logo pipeline; no provider URL fallback.
      return available(source, null, { status: logo.status || "LOGO_FALLBACK", key: logo.key,
        asset: await opts.logoResolver(logo.key), fallback: logo.status !== "LOGO_VALID" });
    }
    return { CONTRACT_VERSION: CONTRACT_VERSION, universeId: "EUROPE", getSecurity: getSecurity,
      getPriceSeries: getPriceSeries, getLatestPrice: getLatestPrice, getIntraday: getIntraday,
      getFundamentals: getFundamentals, getCorporateActions: getCorporateActions, getQuantData: getQuantData,
      getTechnicalData: getTechnicalData, getScreenerRow: getScreenerRow, getReadiness: getReadiness,
      search: search, getLogo: getLogo,
      getNews: function () { return us("getNews", arguments); },
      stockPage: function (ref) { return ref && ref.region === "EUROPE" ? Promise.resolve(unavailable("PRODUCT_PAGE_NOT_CONNECTED", source)) : us("stockPage", arguments); },
      discoverIndex: function () { return us("discoverIndex", arguments); } };
  }
  /** A separate canonical-ID store; never reads/writes a legacy ticker store. */
  function createWatchlist(options) {
    var opts = Object.assign({},options || {}), storage = opts.storage;
    opts.protectedIds = (opts.protectedIds || []).slice();
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw Error("WATCHLIST_STORAGE_REQUIRED");
    var index = catalogIndex(opts.catalog, opts.protectedIds), ids = [];
    function validate(values) {
      if (!Array.isArray(values) || values.length > 500 || new Set(values).size !== values.length ||
          values.some(function (id) { return !opaque(id) || (opts.protectedIds || []).includes(id); })) throw Error("INVALID_EUROPE_WATCHLIST");
      return values.slice();
    }
    function reload() {
      var raw = storage.getItem(WATCHLIST_KEY);
      if (raw === null) { ids = []; return ids.slice(); }
      if (typeof raw !== "string" || raw.length > 100000) throw Error("INVALID_SAVED_EUROPE_WATCHLIST");
      var saved;
      try { saved = JSON.parse(raw); } catch (_) { throw Error("INVALID_SAVED_EUROPE_WATCHLIST"); }
      if (!saved || saved.version !== CONTRACT_VERSION || saved.region !== "EUROPE") throw Error("INVALID_SAVED_EUROPE_WATCHLIST");
      ids = validate(saved.securityIds);
      return ids.slice();
    }
    function save() {
      var clean = validate(ids);
      storage.setItem(WATCHLIST_KEY, JSON.stringify({ version: CONTRACT_VERSION, region: "EUROPE", securityIds: clean }));
      return clean;
    }
    function add(id) {
      var row = index.securities.get(id);
      var listing = row && row.listings.find(function (l) { return l.listingId === row.primaryListingId; });
      if (!row || readiness(row, listing).WATCHLIST !== "READY") throw Error("CANONICAL_ID_NOT_ACCEPTED");
      if (!ids.includes(id)) ids = validate(ids.concat(id));
      return ids.slice();
    }
    function remove(id) { ids = ids.filter(function (value) { return value !== id; }); return ids.slice(); }
    return { key: WATCHLIST_KEY, add: add, save: save, reload: reload, remove: remove, values: function () { return ids.slice(); } };
  }
  return { CONTRACT_VERSION: CONTRACT_VERSION, WATCHLIST_KEY: WATCHLIST_KEY, create: create,
    readiness: readiness, optionalMetrics: optionalMetrics, createWatchlist: createWatchlist, fromFoundation: fromFoundation };
});
