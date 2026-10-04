/* =========================================================================
   VISION UNIVERSE VORSORGE — xray.js   (vorsorge-xray-1.0.0)

   Overlap-Engine, Portfolio-X-Ray und Szenario-Lab.

   HOLDINGS-VERTRAG  (etf-holdings-2.0.0)
     { fundId, shareClassId, symbol, asOf, source,
       holdings: [ { holdingIdentifier, isin?, ticker?, name, weight (0..1),
                     country?, sector?, currency?, assetType?, source? } ] }
     Abwaertskompatibel: { id } wird als holdingIdentifier gelesen.

   Ohne Holdings-Datei rechnet die Engine KEINEN Overlap und keine
   Durchschau - sie meldet DATA_PENDING mit der Abdeckung. Nichts wird
   aus dem Namen eines ETFs simuliert.

   Was ohne Holdings belastbar geht, rechnet die Engine trotzdem:
   Gewichtung nach Assetklasse/Region/Waehrung (aus dem ETF-Stamm, mit
   Grundlage), Schwankung und Rueckgang der Portfolio-Kursreihe,
   Korrelationen, Konzentration der ETF-Gewichte.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "vorsorge-xray-1.0.0";
  var A = isNode ? require("./etf-analytics.js") : (global.VUVorsorge && global.VUVorsorge.Analytics);

  var HOLDINGS_CONTRACT = { version: "etf-holdings-2.0.0",
    file: ["fundId", "shareClassId", "symbol", "asOf", "source", "holdings"],
    holding: ["holdingIdentifier", "isin", "ticker", "name", "weight", "country", "sector", "currency", "assetType", "source"],
    required: ["asOf", "source", "holdings"], holdingRequired: ["name", "weight"] };
  function holdingKey(h) { return h.isin || h.holdingIdentifier || h.id || (h.ticker ? "T:" + h.ticker : "N:" + String(h.name || "").toLowerCase()); }
  /** Prueft eine Holdings-Datei gegen den Vertrag. Liefert Fehlerliste (leer = gueltig). */
  function validateHoldingsFile(f) {
    var e = [];
    if (!f || typeof f !== "object") return ["NO_FILE"];
    HOLDINGS_CONTRACT.required.forEach(function (k) { if (!(k in f)) e.push("MISSING_" + k); });
    if (!Array.isArray(f.holdings)) return e.concat("HOLDINGS_NOT_ARRAY");
    var sum = 0;
    f.holdings.forEach(function (h, i) {
      if (!h || !h.name) e.push("HOLDING_" + i + "_NO_NAME");
      if (!(Number.isFinite(h && h.weight) && h.weight >= 0 && h.weight <= 1)) e.push("HOLDING_" + i + "_BAD_WEIGHT");
      else sum += h.weight;
    });
    if (sum > 1.02) e.push("WEIGHTS_EXCEED_100");
    return e;
  }

  function validHoldings(file) {
    return !!(file && Array.isArray(file.holdings) && file.holdings.length && file.holdings.every(function (h) { return h && Number.isFinite(h.weight) && h.weight >= 0; }));
  }

  /** Gewichteter Overlap zweier ETFs: Summe der kleineren Gewichte gemeinsamer Positionen. */
  function overlap(a, b) {
    if (!validHoldings(a) || !validHoldings(b)) {
      return { status: "DATA_PENDING", value: null, common: [], reason: "Für mindestens einen der beiden ETFs liegen noch keine Holdings vor." };
    }
    var mapB = {};
    b.holdings.forEach(function (h) { mapB[holdingKey(h)] = h; });
    var common = [], weighted = 0;
    a.holdings.forEach(function (h) {
      var o = mapB[holdingKey(h)];
      if (!o) return;
      var m = Math.min(h.weight, o.weight);
      weighted += m;
      common.push({ key: holdingKey(h), name: h.name || o.name, weightA: h.weight, weightB: o.weight, overlap: m });
    });
    common.sort(function (x, y) { return y.overlap - x.overlap; });
    var union = a.holdings.length + b.holdings.length - common.length;
    return { status: "CALCULATED", value: weighted, weightedOverlap: weighted, simpleOverlap: union ? common.length / union : 0, commonCount: common.length,
      countA: a.holdings.length, countB: b.holdings.length, common: common, top: common.slice(0, 10),
      asOf: [a.asOf, b.asOf] };
  }

  /**
   * Durchschau: effektive Gewichte je Unternehmen, Land, Sektor.
   * positions = [{ symbol, weight }], holdingsBySymbol = { SYM: holdingsFile }
   */
  function lookThrough(positions, holdingsBySymbol) {
    var total = (positions || []).reduce(function (a, p) { return a + Math.max(0, p.weight || 0); }, 0);
    if (!total) return { status: "NO_POSITIONS" };
    var covered = 0, companies = {}, countries = {}, sectors = {};
    positions.forEach(function (p) {
      var w = Math.max(0, p.weight || 0) / total;
      var file = holdingsBySymbol && holdingsBySymbol[p.symbol];
      if (!validHoldings(file)) return;
      covered += w;
      file.holdings.forEach(function (h) {
        var k = holdingKey(h), eff = w * h.weight;
        var c = companies[k] || (companies[k] = { key: k, name: h.name, weight: 0, via: [] });
        c.weight += eff;
        if (c.via.indexOf(p.symbol) === -1) c.via.push(p.symbol);
        if (h.country) countries[h.country] = (countries[h.country] || 0) + eff;
        if (h.sector) sectors[h.sector] = (sectors[h.sector] || 0) + eff;
      });
    });
    if (covered === 0) return { status: "DATA_PENDING", coverage: 0 };
    function sorted(map) { return Object.keys(map).map(function (k) { return { key: k, weight: map[k] }; }).sort(function (a, b) { return b.weight - a.weight; }); }
    var list = Object.keys(companies).map(function (k) { return companies[k]; }).sort(function (a, b) { return b.weight - a.weight; });
    var multi = list.filter(function (c) { return c.via.length > 1; });
    var duplicateExposure = multi.reduce(function (acc, c) { return acc + c.weight; }, 0);
    return {
      status: covered < 0.999 ? "PARTIAL" : "CALCULATED", coverage: covered, effectiveDuplicateExposure: duplicateExposure,
      companies: list.slice(0, 25), countries: sorted(countries), sectors: sorted(sectors),
      multiplyHeld: multi.slice(0, 10).map(function (c) {
        return { name: c.name, weight: c.weight, via: c.via, text: "Du besitzt " + c.name + " indirekt über " + c.via.length + " ETFs." };
      })
    };
  }

  function normalizeWeights(positions) {
    var total = positions.reduce(function (a, p) { return a + Math.max(0, p.weight || 0); }, 0);
    return positions.filter(function (p) { return p.weight > 0; }).map(function (p) { return Object.assign({}, p, { weight: total ? p.weight / total : 0 }); });
  }

  /**
   * Portfolio-X-Ray auf Basis des ETF-Stamms und der Kursreihen.
   * positions = [{ symbol, weight }]; etfBySymbol = Stammeintraege; seriesBySymbol = { SYM: points }
   */
  function portfolioXRay(positions, etfBySymbol, seriesBySymbol, opts) {
    opts = opts || {};
    var pos = normalizeWeights(positions || []);
    function group(field, labelMap) {
      var map = {}, unknown = 0;
      pos.forEach(function (p) {
        var e = etfBySymbol[p.symbol] || {};
        var k = e[field];
        if (k === null || k === undefined) { unknown += p.weight; return; }
        map[k] = (map[k] || 0) + p.weight;
      });
      var list = Object.keys(map).map(function (k) { return { key: k, label: labelMap ? (labelMap[k] || k) : k, weight: map[k] }; })
        .sort(function (a, b) { return b.weight - a.weight; });
      if (unknown > 0) list.push({ key: "UNKNOWN", label: "Nicht zugeordnet", weight: unknown });
      return list;
    }
    var hhi = pos.reduce(function (a, p) { return a + p.weight * p.weight; }, 0);
    var series = A.portfolioSeries(pos.map(function (p) { return { weight: p.weight, points: seriesBySymbol[p.symbol] || [] }; }));
    var missingSeries = pos.filter(function (p) { return !(seriesBySymbol[p.symbol] && seriesBySymbol[p.symbol].length > 1); }).map(function (p) { return p.symbol; });
    var risk = series.points.length ? A.risk(series.points) : null;
    var perf = series.points.length ? A.performance(series.points) : null;
    var corr = [];
    for (var i = 0; i < pos.length; i++) for (var j = i + 1; j < pos.length; j++) {
      var c = A.correlation(seriesBySymbol[pos[i].symbol] || [], seriesBySymbol[pos[j].symbol] || []);
      corr.push({ a: pos[i].symbol, b: pos[j].symbol, value: c.value, status: c.status });
    }
    var currency = group("currency");
    var base = opts.baseCurrency || "EUR";
    var fxExposure = currency.filter(function (c) { return c.key !== base && c.key !== "UNKNOWN"; }).reduce(function (a, c) { return a + c.weight; }, 0);
    var complex = pos.filter(function (p) { return (etfBySymbol[p.symbol] || {}).complex; }).map(function (p) { return p.symbol; });
    var hold = opts.holdingsBySymbol || {};
    var withHoldings = pos.filter(function (p) { return validHoldings(hold[p.symbol]); }).length;
    var withPrices = pos.length - missingSeries.length;
    var dataState = !pos.length ? "NO_DATA" : withHoldings === pos.length ? "FULL_DATA" : withHoldings > 0 ? "PARTIAL_DATA" : withPrices > 0 ? "PRICE_ONLY_DATA" : "NO_DATA";
    return {
      version: VERSION, positions: pos,
      assetClasses: group("assetClass"), regions: group("region", opts.regionLabels), currencies: currency,
      issuers: group("issuer"), themes: group("theme"),
      concentration: { hhi: hhi, effectiveNumber: hhi > 0 ? 1 / hhi : 0, largest: pos.slice().sort(function (a, b) { return b.weight - a.weight; })[0] || null },
      fxExposure: { baseCurrency: base, share: fxExposure, note: "Handelswährung des Listings. Die Währungen der Fondsinhalte sind ohne Holdings nicht bekannt." },
      series: series, risk: risk, performance: perf, correlations: corr, missingSeries: missingSeries, complexPositions: complex,
      dataState: dataState, coverage: { positions: pos.length, withPrices: withPrices, withHoldings: withHoldings }
    };
  }

  /* --------------------------------------------------------- Szenario-Lab
     Ein Szenario ist ein Schock auf eine klar benannte Eigenschaft. Es wird
     nur angewendet, wo die Eigenschaft belegt ist; der Rest erscheint als
     "nicht berechenbar" mit Anteil. Zinsszenarien brauchen die Duration
     der Anleihe-ETFs - ohne sie rechnet das Lab nicht. */
  var SCENARIOS = [
    { id: "aktien-20", label: "Aktien −20 %", match: { field: "assetClass", equals: "EQUITY" }, shock: -0.20 },
    { id: "aktien-40", label: "Aktien −40 %", match: { field: "assetClass", equals: "EQUITY" }, shock: -0.40 },
    { id: "usd-10", label: "US-Dollar −10 % (aus Euro-Sicht)", match: { field: "currency", equals: "USD" }, shock: -0.10, kind: "FX" },
    { id: "europa+20", label: "Europa +20 %", match: { field: "region", equals: "EUROPE" }, shock: 0.20 },
    { id: "tech-30", label: "Technologie −30 %", requires: "sector", shock: -0.30 },
    { id: "zinsen+2", label: "Zinsen +2 %-Punkte", requires: "duration", shock: null },
    { id: "inflation", label: "Inflation dauerhaft +1 %-Punkt", kind: "PLAN", shock: 0.01 }
  ];

  /**
   * Wendet ein Szenario auf ein Portfolio an.
   * @returns { status, impact (Anteil am Portfolio), affected, notComputable, reason }
   */
  function applyScenario(scenario, positions, etfBySymbol) {
    var pos = normalizeWeights(positions || []);
    if (scenario.kind === "PLAN") return { id: scenario.id, status: "SEE_PLANNER", impact: null, reason: "Inflation wirkt auf die Kaufkraft im Vorsorgeplaner, nicht auf den Kurs." };
    if (scenario.requires === "sector") return { id: scenario.id, status: "DATA_PENDING", impact: null, reason: "Sektorgewichte der ETFs fehlen (Holdings-Daten folgen)." };
    if (scenario.requires === "duration") return { id: scenario.id, status: "DATA_PENDING", impact: null, reason: "Die Zinsempfindlichkeit (Duration) der Anleihe-ETFs liegt nicht vor." };
    var affected = 0, unknown = 0, impact = 0, list = [];
    pos.forEach(function (p) {
      var e = etfBySymbol[p.symbol] || {};
      var v = e[scenario.match.field];
      if (v === null || v === undefined) { unknown += p.weight; return; }
      if (v === scenario.match.equals) {
        var lev = scenario.kind === "FX" ? 1 : (e.inverse ? -(e.leverage || 1) : (e.leverage || 1));
        var s = Math.max(-1, scenario.shock * lev);
        impact += p.weight * s; affected += p.weight;
        list.push({ symbol: p.symbol, weight: p.weight, shock: s });
      }
    });
    return { id: scenario.id, status: unknown > 0.5 ? "LOW_COVERAGE" : "CALCULATED", impact: impact, affected: affected, notClassified: unknown, positions: list,
      reason: unknown > 0 ? "Für " + Math.round(unknown * 100) + " % des Portfolios ist die Eigenschaft nicht belegt; dieser Teil bleibt unverändert gerechnet." : null };
  }

  var api = { VERSION: VERSION, HOLDINGS_CONTRACT: HOLDINGS_CONTRACT, validateHoldingsFile: validateHoldingsFile, SCENARIOS: SCENARIOS, overlap: overlap, lookThrough: lookThrough,
    portfolioXRay: portfolioXRay, applyScenario: applyScenario, normalizeWeights: normalizeWeights, validHoldings: validHoldings };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.XRay = api; }
})(typeof window !== "undefined" ? window : globalThis);
