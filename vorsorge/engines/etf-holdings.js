/* =========================================================================
   VISION UNIVERSE VORSORGE — etf-holdings.js   (UMD: Node + Browser)

   KANONISCHE HOLDINGS (ETF_HOLDINGS_SCHEMA_VERSION 2.0.0)

   Ein Snapshot = ein Bestand eines Fonds zu EINEM Stichtag (asOf = Datum
   des Bestands, NICHT Einreichungs- oder Abrufdatum). Gewichte sind
   Dezimalbrueche (0.068 = 6,8 %). Die Quelleinheit wird je Datei aus der
   Summe erkannt oder ausdruecklich angegeben - nie je Zeile geraten.

   Holdings sind nicht nur Aktien: EQUITY, BOND, CASH, FUTURE, OPTION, SWAP,
   FORWARD, FUND, ETF, COMMODITY, DERIVATIVE, UNKNOWN.

   Funktionen
     inferWeightUnit(values)      "percent" | "fraction" | null
     parseNumber(raw)             "6,80 %", "1.234,5", "(0.5)" -> Zahl
     normalizeAssetType(raw)      Klartext/N-PORT-Code -> Enum
     snapshot(meta, rows)         kanonischer Snapshot inkl. contentHash
     qualityGates(snap, prev)     { errors, warnings }
     concentration(snap)          Top 1/5/10/20, HHI, effektive Anzahl
     exposures(snap)              Laender, Sektoren, Anlageklassen, Waehrungen
     mapToCompanies(snap, index)  Zuordnung zum VU-Aktienstamm (ISIN > CUSIP > Ticker+Boerse)
     factorExposure(snap, scores) gewichtete Faktoren mit Abdeckung (Mindestabdeckung)
     summary(snap, fund)          deterministische Kurzbeschreibung (nur aus Daten)
   ========================================================================= */
(function (global) {
  "use strict";
  var SCHEMA = "2.0.0";
  var ASSET_TYPES = ["EQUITY", "BOND", "CASH", "FUTURE", "OPTION", "SWAP", "FORWARD", "FUND", "ETF", "COMMODITY", "DERIVATIVE", "UNKNOWN"];
  var DERIVATIVES = { FUTURE: 1, OPTION: 1, SWAP: 1, FORWARD: 1, DERIVATIVE: 1 };
  var ROW_FIELDS = ["holdingId", "holdingIsin", "holdingCusip", "holdingSedol", "holdingTicker", "holdingExchange", "holdingName", "assetType",
    "weight", "marketValue", "marketValueCurrency", "shares", "country", "sector", "industry", "currency", "maturityDate", "coupon",
    "derivativeType", "underlying", "payoff", "sourceRowId", "confidence"];

  /* ---------------------------------------------------------- Zahlen */
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    var s = String(raw).trim().replace(/[\s %]/g, "").replace(/^\$|^€/, "");
    if (!s || s === "-" || /^n\/?a$/i.test(s)) return null;
    var neg = /^\(.*\)$/.test(s); if (neg) s = s.slice(1, -1);
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var v = Number(s);
    return Number.isFinite(v) ? (neg ? -v : v) : null;
  }
  /**
   * Einheit einer Gewichtsspalte aus der Summe: ~100 -> Prozent, ~1 -> Dezimal.
   * Hebel- oder Derivatefonds koennen davon abweichen - dann null (Einheit muss angegeben werden).
   */
  function inferWeightUnit(values) {
    var sum = 0, n = 0, max = 0;
    (values || []).forEach(function (v) { if (Number.isFinite(v)) { sum += Math.abs(v); n++; if (Math.abs(v) > max) max = Math.abs(v); } });
    if (!n) return null;
    if (sum >= 40 && sum <= 160) return "percent";
    if (sum >= 0.4 && sum <= 1.6 && max <= 1) return "fraction";
    if (max > 1.5) return "percent";
    return null;
  }

  /* ------------------------------------------------------- Anlageart */
  var NPORT_CAT = { EC: "EQUITY", EP: "EQUITY", DBT: "BOND", "ABS-MBS": "BOND", "ABS-ASBS": "BOND", "ABS-CBDO": "BOND", "ABS-O": "BOND",
    STIV: "FUND", RA: "CASH", LON: "BOND", DCO: "DERIVATIVE", DCR: "DERIVATIVE", DE: "DERIVATIVE", DFE: "DERIVATIVE", DIR: "DERIVATIVE",
    DO: "DERIVATIVE", SN: "BOND", COMM: "COMMODITY", RE: "UNKNOWN", OTHER: "UNKNOWN" };
  var NPORT_DERIV = { FUT: "FUTURE", FWD: "FORWARD", SWP: "SWAP", OPT: "OPTION", SWO: "OPTION", WAR: "OPTION", OTH: "DERIVATIVE" };
  function normalizeAssetType(raw, derivCat) {
    if (derivCat && NPORT_DERIV[String(derivCat).toUpperCase()]) return NPORT_DERIV[String(derivCat).toUpperCase()];
    var u = String(raw || "").trim();
    if (!u) return "UNKNOWN";
    if (NPORT_CAT[u.toUpperCase()]) return NPORT_CAT[u.toUpperCase()];
    var s = u.toLowerCase();
    if (/futur/.test(s)) return "FUTURE";
    if (/option|warrant|optionsschein/.test(s)) return "OPTION";
    if (/swap/.test(s)) return "SWAP";
    if (/forward|fx contract|devisentermin|currency contract/.test(s)) return "FORWARD";
    if (/\betf\b|exchange traded fund/.test(s)) return "ETF";
    if (/money market|geldmarkt|cash|bargeld|liquidit|collateral|margin|repo/.test(s)) return /money market fund|geldmarktfonds/.test(s) ? "FUND" : "CASH";
    if (/fund|fonds|investment compan/.test(s)) return "FUND";
    if (/equity|aktie|stock|common|preferred|reit|adr|gdr/.test(s)) return "EQUITY";
    if (/bond|fixed income|anleihe|treasury|note|bill|debt|rente|obligation|mbs|abs|loan/.test(s)) return "BOND";
    if (/commodit|rohstoff|gold|silver|bullion/.test(s)) return "COMMODITY";
    if (/deriv/.test(s)) return "DERIVATIVE";
    return "UNKNOWN";
  }

  /* --------------------------------------------------------- Schluessel */
  /** Identitaet einer Position ueber Snapshots hinweg: ISIN > CUSIP > SEDOL > Ticker+Boerse > Name. Ticker-Wechsel aendern die Identitaet nicht, solange ISIN/CUSIP bleiben. */
  function holdingKey(h) {
    if (h.holdingIsin) return "ISIN:" + h.holdingIsin;
    if (h.holdingCusip) return "CUSIP:" + h.holdingCusip;
    if (h.holdingSedol) return "SEDOL:" + h.holdingSedol;
    if (h.assetType === "CASH") return "CASH:" + (h.currency || h.marketValueCurrency || "XXX");
    if (h.holdingTicker) return "TICKER:" + h.holdingTicker + "@" + (h.holdingExchange || "");
    return "NAME:" + String(h.holdingName || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  function round(x, d) { if (x === null || x === undefined || !Number.isFinite(x)) return null; var f = Math.pow(10, d); return Math.round(x * f) / f; }

  /**
   * Baut einen kanonischen Snapshot.
   * meta: { fundId, shareClassId, symbol, asOf, publishedAt, retrievedAt, source, sourceType, sourceUrl, weightUnit?, totalNetAssets?, currency? }
   * rows: Zeilen mit Rohwerten (weight als Zahl oder Text in meta.weightUnit / erkannt).
   */
  function snapshot(meta, rows) {
    meta = meta || {};
    var raw = (rows || []).map(function (r) { return parseNumber(r.weight); });
    var unit = meta.weightUnit || inferWeightUnit(raw);
    var issues = [];
    if (!unit) issues.push("WEIGHT_UNIT_UNKNOWN");
    var holdings = (rows || []).map(function (r, i) {
      var w = raw[i];
      var h = {};
      ROW_FIELDS.forEach(function (k) { h[k] = r[k] === undefined || r[k] === "" ? null : r[k]; });
      h.assetType = ASSET_TYPES.indexOf(r.assetType) >= 0 ? r.assetType : normalizeAssetType(r.assetType, r.derivativeType);
      h.weight = w === null || !unit ? null : round(unit === "percent" ? w / 100 : w, 8);
      h.marketValue = parseNumber(r.marketValue);
      h.shares = parseNumber(r.shares);
      h.coupon = parseNumber(r.coupon);
      h.holdingName = r.holdingName ? String(r.holdingName).trim() : null;
      h.sourceRowId = r.sourceRowId !== undefined && r.sourceRowId !== null ? String(r.sourceRowId) : String(i + 1);
      h.confidence = r.confidence || "HIGH";
      h.holdingId = holdingKey(h);
      return h;
    });
    // Deterministische Reihenfolge: Gewicht absteigend, dann Schluessel.
    holdings.sort(function (a, b) { return (b.weight || 0) - (a.weight || 0) || (a.holdingId < b.holdingId ? -1 : a.holdingId > b.holdingId ? 1 : 0); });
    var hashInput = holdings.map(function (h) { return h.holdingId + "|" + (h.weight === null ? "" : h.weight.toFixed(6)); }).join("\n");
    var contentHash = fnv(hashInput) + fnv(hashInput.split("").reverse().join(""));
    var asOf = meta.asOf || null;
    return {
      schemaVersion: SCHEMA, snapshotId: (meta.fundId || meta.symbol || "?") + "@" + asOf + "#" + (meta.source || "?"),
      fundId: meta.fundId || null, shareClassId: meta.shareClassId || null, symbol: meta.symbol || null,
      asOf: asOf, publishedAt: meta.publishedAt || null, retrievedAt: meta.retrievedAt || null,
      source: meta.source || null, sourceType: meta.sourceType || null, sourceUrl: meta.sourceUrl || null,
      weightUnitDetected: unit, totalNetAssets: meta.totalNetAssets || null, currency: meta.currency || null,
      holdingsCount: holdings.length, contentHash: contentHash, issues: issues, holdings: holdings
    };
  }

  /* ---------------------------------------------------- Qualitaet */
  function qualityGates(s, prev, opts) {
    opts = opts || {};
    var errors = [], warnings = [];
    if (!s || s.schemaVersion !== SCHEMA) return { errors: ["SCHEMA_VERSION"], warnings: [] };
    if (!s.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(s.asOf)) errors.push("INVALID_AS_OF");
    var today = opts.today || new Date().toISOString().slice(0, 10);
    if (s.asOf && s.asOf > today) errors.push("FUTURE_AS_OF");
    if (s.issues.indexOf("WEIGHT_UNIT_UNKNOWN") >= 0) errors.push("WEIGHT_UNIT_UNKNOWN");
    if (!s.holdings.length) errors.push("NO_HOLDINGS");
    var seen = {}, dup = 0, neg = 0, negNonDeriv = 0, over = 0, overHard = 0, noName = 0, noId = 0, sum = 0, nullW = 0;
    s.holdings.forEach(function (h) {
      if (seen[h.holdingId] && !DERIVATIVES[h.assetType] && h.assetType !== "CASH") dup++;
      seen[h.holdingId] = 1;
      if (h.weight === null) { nullW++; return; }
      if (h.weight < 0) { neg++; if (!DERIVATIVES[h.assetType] && h.assetType !== "CASH" && !/short/i.test(h.payoff || "")) negNonDeriv++; }
      if (h.weight > 1) over++;
      if (h.weight > 3 && !DERIVATIVES[h.assetType]) overHard++;   // Optionsbeine (Nominalwert) duerfen weit darueber liegen
      sum += h.weight;
      if (!h.holdingName) noName++;
      if (!h.holdingIsin && !h.holdingCusip && !h.holdingSedol && !h.holdingTicker && h.assetType !== "CASH") noId++;
    });
    if (dup) warnings.push("DUPLICATE_ROWS " + dup);
    if (negNonDeriv) warnings.push("NEGATIVE_WEIGHTS_NON_DERIVATIVE " + negNonDeriv);
    // > 100 % kommt bei Dachfonds (ein ETF als einzige Position), Covered-Call- und Hebelfonds real vor (Anteil am Nettovermoegen).
    if (overHard) errors.push("WEIGHT_ABOVE_300 " + overHard);
    else if (over) warnings.push("WEIGHT_ABOVE_100 " + over);
    if (noName) warnings.push("MISSING_NAMES " + noName);
    if (noId > s.holdings.length * 0.5) warnings.push("MISSING_IDENTIFIERS " + noId);
    if (nullW > s.holdings.length * 0.2) errors.push("MISSING_WEIGHTS " + nullW);
    var derivHeavy = s.holdings.some(function (h) { return DERIVATIVES[h.assetType] && Math.abs(h.weight || 0) > 0.05; });
    if (!derivHeavy && (sum < 0.5 || sum > 1.5)) errors.push("IMPLAUSIBLE_TOTAL " + round(sum, 4));
    else if (!derivHeavy && (sum < 0.9 || sum > 1.1)) warnings.push("TOTAL_OUTSIDE_90_110 " + round(sum, 4));
    if (opts.staleDays && s.asOf) {
      var age = (Date.parse(today) - Date.parse(s.asOf)) / 864e5;
      if (age > opts.staleDays) warnings.push("STALE " + Math.round(age) + "d");
    }
    if (prev && prev.holdings && prev.holdings.length >= 20 && s.holdings.length < prev.holdings.length * 0.5) errors.push("COVERAGE_COLLAPSE " + prev.holdings.length + "->" + s.holdings.length);
    if (prev && prev.contentHash === s.contentHash && prev.asOf !== s.asOf) warnings.push("IDENTICAL_CONTENT_NEW_DATE");
    return { errors: errors, warnings: warnings, totalWeight: round(sum, 6) };
  }

  /* --------------------------------------------- Konzentration / Exposure */
  function longs(s) { return s.holdings.filter(function (h) { return h.weight !== null && h.weight > 0 && !DERIVATIVES[h.assetType]; }); }
  function concentration(s) {
    var l = longs(s), w = l.map(function (h) { return h.weight; });
    function top(n) { var t = 0; for (var i = 0; i < Math.min(n, w.length); i++) t += w[i]; return round(t, 6); }
    var tot = w.reduce(function (a, b) { return a + b; }, 0);
    var hhi = tot ? w.reduce(function (a, b) { return a + Math.pow(b / tot, 2); }, 0) : null;
    var nonCash = l.filter(function (h) { return h.assetType !== "CASH"; }).length;
    return { positions: nonCash, top1: top(1), top5: top(5), top10: top(10), top20: top(20), hhi: round(hhi, 6), effectiveNumber: hhi ? round(1 / hhi, 1) : null };
  }
  function exposures(s, opts) {
    opts = opts || {};
    function by(key, label) {
      var m = {}, tot = 0;
      s.holdings.forEach(function (h) {
        if (h.weight === null || DERIVATIVES[h.assetType]) return;
        var k = (opts.lookup && opts.lookup(h, key)) || h[key] || (key === "country" && h.assetType === "CASH" ? "CASH" : "UNASSIGNED");
        m[k] = (m[k] || 0) + h.weight; tot += h.weight;
      });
      return Object.keys(m).map(function (k) { return { key: k, weight: round(m[k], 6) }; })
        .sort(function (a, b) { return b.weight - a.weight || (a.key < b.key ? -1 : 1); });
    }
    var deriv = s.holdings.filter(function (h) { return DERIVATIVES[h.assetType]; });
    return { countries: by("country"), sectors: by("sector"), industries: by("industry"), assetTypes: by("assetType"), currencies: by("currency"),
      cashWeight: round(s.holdings.filter(function (h) { return h.assetType === "CASH"; }).reduce(function (a, h) { return a + (h.weight || 0); }, 0), 6),
      derivativeCount: deriv.length, derivativeGrossWeight: round(deriv.reduce(function (a, h) { return a + Math.abs(h.weight || 0); }, 0), 6) };
  }

  /* ------------------------------------------------- VU-Aktienstamm */
  /**
   * index: { byIsin: {ISIN: company}, byCusip: {CUSIP: company}, byTicker: {"TICKER": company} } (Ticker nur US-Boersen).
   * Kein unscharfer Namensabgleich. Unsicher -> unresolved.
   */
  var US_EXCH = /^(NYSE|NASDAQ|NMS|NAS|ARCA|NYSE ARCA|BATS|CBOE|AMEX|NYSE MKT|NYSE AMERICAN|XNYS|XNAS|ARCX|BATS GLOBAL|US)$/i;
  function mapToCompanies(s, index) {
    var mapped = 0, mappedW = 0, eqW = 0, unresolved = [];
    s.holdings.forEach(function (h) {
      if (h.assetType !== "EQUITY") return;
      eqW += Math.max(0, h.weight || 0);
      var c = null, how = null;
      if (h.holdingIsin && index.byIsin && index.byIsin[h.holdingIsin]) { c = index.byIsin[h.holdingIsin]; how = "ISIN"; }
      else if (h.holdingCusip && index.byCusip && index.byCusip[h.holdingCusip]) { c = index.byCusip[h.holdingCusip]; how = "CUSIP"; }
      else if (h.holdingTicker && index.byTicker && (!h.holdingExchange || US_EXCH.test(h.holdingExchange)) && (h.country === "US" || !h.country || US_EXCH.test(h.holdingExchange || ""))) {
        var t = String(h.holdingTicker).toUpperCase().replace(/\s+/g, "").replace(/\//g, ".");
        if (index.byTicker[t]) { c = index.byTicker[t]; how = "TICKER_US_EXCHANGE"; }
      }
      if (c) { h.vuCompanyId = c.id || c.ticker; h.vuTicker = c.ticker || null; h.matchMethod = how; mapped++; mappedW += Math.max(0, h.weight || 0);
        if (!h.sector && c.sector) { h.sector = c.sector; h.sectorSource = "VU_COMPANY_MASTER"; }
        if (!h.country && c.country) { h.country = c.country; h.countrySource = "VU_COMPANY_MASTER"; } }
      else unresolved.push(h.holdingId);
    });
    return { mappedCount: mapped, mappedWeight: round(mappedW, 6), equityWeight: round(eqW, 6),
      mappedShareOfEquity: eqW ? round(mappedW / eqW, 4) : null, unresolvedCount: unresolved.length };
  }

  /**
   * Gewichtete Faktorwerte: scores = { vuCompanyId: { quality: 0..100, ... } }. Unter minCoverage (Anteil am Aktiengewicht) -> null.
   */
  function factorExposure(s, scores, factors, minCoverage) {
    minCoverage = minCoverage === undefined ? 0.7 : minCoverage;
    var eqW = 0; s.holdings.forEach(function (h) { if (h.assetType === "EQUITY" && h.weight > 0) eqW += h.weight; });
    var out = {};
    (factors || []).forEach(function (f) {
      var w = 0, acc = 0;
      s.holdings.forEach(function (h) {
        var sc = h.vuCompanyId && scores[h.vuCompanyId];
        var v = sc && sc[f];
        if (h.assetType === "EQUITY" && h.weight > 0 && Number.isFinite(v)) { w += h.weight; acc += h.weight * v; }
      });
      var cov = eqW ? w / eqW : 0;
      out[f] = { value: cov >= minCoverage && w ? round(acc / w, 1) : null, coverage: round(cov, 4) };
    });
    return out;
  }


  /* ------------------------------------------- SIC -> Wirtschaftszweig */
  /** Naeherung SEC-SIC -> elf Sektoren (Bezeichnung "Wirtschaftszweig (SEC-SIC)", nicht GICS). */
  var SECTORS_DE = { TECH: "Technologie", HEALTH: "Gesundheit", FIN: "Finanzen", RE: "Immobilien", ENERGY: "Energie", MAT: "Grundstoffe",
    IND: "Industrie", DISC: "Zyklischer Konsum", STAPLES: "Basiskonsum", COMM: "Kommunikation", UTIL: "Versorger" };
  function sicSector(sic) {
    var s = Number(sic);
    if (!Number.isFinite(s) || s <= 0) return null;
    var R = [[100, 999, "STAPLES"], [1000, 1099, "MAT"], [1200, 1399, "ENERGY"], [1400, 1499, "MAT"], [1500, 1799, "IND"], [2000, 2199, "STAPLES"],
      [2200, 2399, "DISC"], [2400, 2499, "MAT"], [2500, 2599, "DISC"], [2600, 2699, "MAT"], [2700, 2799, "COMM"], [2800, 2829, "MAT"], [2830, 2836, "HEALTH"],
      [2840, 2844, "STAPLES"], [2845, 2899, "MAT"], [2900, 2999, "ENERGY"], [3000, 3099, "MAT"], [3100, 3199, "DISC"], [3200, 3399, "MAT"], [3400, 3499, "IND"],
      [3500, 3569, "IND"], [3570, 3579, "TECH"], [3580, 3629, "IND"], [3630, 3639, "DISC"], [3640, 3659, "IND"], [3660, 3679, "TECH"], [3680, 3699, "IND"],
      [3710, 3716, "DISC"], [3750, 3751, "DISC"], [3700, 3799, "IND"], [3800, 3839, "TECH"], [3840, 3859, "HEALTH"], [3860, 3899, "TECH"], [3900, 3999, "DISC"],
      [4000, 4799, "IND"], [4800, 4899, "COMM"], [4950, 4959, "IND"], [4900, 4999, "UTIL"], [5122, 5122, "HEALTH"], [5140, 5149, "STAPLES"], [5171, 5172, "ENERGY"],
      [5000, 5199, "IND"], [5331, 5331, "STAPLES"], [5400, 5499, "STAPLES"], [5912, 5912, "STAPLES"], [5200, 5999, "DISC"], [6500, 6553, "RE"], [6798, 6798, "RE"],
      [6000, 6999, "FIN"], [7000, 7299, "DISC"], [7310, 7319, "COMM"], [7370, 7379, "TECH"], [7380, 7389, "IND"], [7500, 7599, "DISC"], [7800, 7899, "COMM"],
      [7900, 7999, "DISC"], [8000, 8099, "HEALTH"], [8731, 8731, "HEALTH"], [8100, 8999, "IND"]];
    for (var i = 0; i < R.length; i++) if (s >= R[i][0] && s <= R[i][1]) return R[i][2];
    return null;
  }

  /* ------------------------------------------------------- Kurztext */
  var COUNTRY_DE = { US: "USA", JP: "Japan", GB: "Großbritannien", DE: "Deutschland", FR: "Frankreich", CH: "Schweiz", CA: "Kanada", CN: "China",
    TW: "Taiwan", IN: "Indien", KR: "Südkorea", NL: "Niederlande", AU: "Australien", SE: "Schweden", DK: "Dänemark", IT: "Italien", ES: "Spanien",
    IE: "Irland", HK: "Hongkong", BR: "Brasilien" };
  function pct(x) { return (Math.round(x * 1000) / 10).toLocaleString("de-DE") + " %"; }
  function summary(s, ex, conc) {
    if (!s || !s.holdings.length) return null;
    ex = ex || exposures(s); conc = conc || concentration(s);
    var parts = [];
    var eq = (ex.assetTypes.filter(function (a) { return a.key === "EQUITY"; })[0] || {}).weight || 0;
    var bd = (ex.assetTypes.filter(function (a) { return a.key === "BOND"; })[0] || {}).weight || 0;
    var kind = eq >= 0.8 ? "Aktien-ETF" : bd >= 0.8 ? "Anleihen-ETF" : "ETF";
    parts.push((conc.positions >= 500 ? "Breit gestreuter " : "") + kind + " mit " + conc.positions.toLocaleString("de-DE") + " Positionen.");
    var cl = ex.countries.filter(function (x) { return x.key !== "CASH" && x.weight > 0; }), tot = cl.reduce(function (a, x) { return a + x.weight; }, 0);
    var c = cl.filter(function (x) { return x.key !== "UNASSIGNED"; })[0];
    if (c && tot > 0 && c.weight / tot >= 0.3) parts.push("Rund " + pct(Math.min(1, c.weight / tot)) + " der Positionen entfallen auf " + (COUNTRY_DE[c.key] || c.key) + ".");
    if (conc.positions >= 10 && conc.top10 !== null) parts.push("Die zehn größten Positionen machen " + pct(conc.top10) + " des Gewichts aus.");
    return parts.join(" ");
  }

  var api = { SCHEMA: SCHEMA, ETF_HOLDINGS_SCHEMA_VERSION: SCHEMA, ASSET_TYPES: ASSET_TYPES, ROW_FIELDS: ROW_FIELDS, DERIVATIVES: DERIVATIVES,
    parseNumber: parseNumber, inferWeightUnit: inferWeightUnit, normalizeAssetType: normalizeAssetType, holdingKey: holdingKey, fnv: fnv,
    snapshot: snapshot, qualityGates: qualityGates, concentration: concentration, exposures: exposures, mapToCompanies: mapToCompanies,
    factorExposure: factorExposure, summary: summary, COUNTRY_DE: COUNTRY_DE, sicSector: sicSector, SECTORS_DE: SECTORS_DE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Holdings = api; }
})(typeof window !== "undefined" ? window : globalThis);
