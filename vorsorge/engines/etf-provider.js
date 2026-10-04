/* =========================================================================
   VISION UNIVERSE VORSORGE — etf-provider.js   (etf-provider-1.0.0)

   ETFProviderAdapter: die Naht zwischen Datenanbieter und ETF-Stamm.

   Tiingo ist Anbieter 1. Die Produktsaeule haengt nicht an Tiingo: jeder
   Anbieter liefert Datensaetze in derselben Huelle

     { provider, providerSymbol, canonicalETFId, timestamp,
       fieldCoverage, dataQuality, fields, prices? }

   und die Registry fuehrt sie feldweise zusammen - nach einer festen
   Rangfolge je Feld (Emittent schlaegt Boerse schlaegt Kursanbieter fuer
   Stammdaten; Kursanbieter fuer Kurse). Ein Anbieter, der nicht
   angeschlossen ist, steht mit Status NOT_CONNECTED in der Registry und
   liefert nichts - er erfindet keine Werte.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "etf-provider-1.0.0";

  /* Angeschlossene und vorbereitete Anbieter. capabilities = Felder, die
     der Anbieter grundsaetzlich liefern kann (laut Produktbeschreibung).
     Die tatsaechliche Abdeckung misst fieldCoverage je Datensatz. */
  var PROVIDERS = {
    tiingo: { label: "Tiingo", status: "CONNECTED", kind: "MARKET_DATA", rank: { meta: 50, prices: 10 },
      capabilities: ["symbol", "name", "exchange", "currency", "inceptionDate", "prices", "dividends", "splits", "description"] },
    issuer: { label: "ETF-Emittenten (Factsheets, Holdings-Dateien)", status: "NOT_CONNECTED", kind: "ISSUER", rank: { meta: 10, prices: 90 },
      capabilities: ["isin", "ter", "fundSize", "holdings", "holdingsCount", "distributionPolicy", "replicationMethod", "benchmark", "domicile"] },
    deutsche_boerse: { label: "Deutsche Börse (Xetra)", status: "NOT_CONNECTED", kind: "EXCHANGE", rank: { meta: 20, prices: 20 },
      capabilities: ["isin", "wkn", "symbol", "exchange", "currency", "prices"] },
    euronext: { label: "Euronext", status: "NOT_CONNECTED", kind: "EXCHANGE", rank: { meta: 20, prices: 20 }, capabilities: ["isin", "symbol", "exchange", "currency", "prices"] },
    lseg: { label: "LSEG", status: "NOT_CONNECTED", kind: "EXCHANGE", rank: { meta: 20, prices: 20 }, capabilities: ["isin", "symbol", "exchange", "currency", "prices"] },
    six: { label: "SIX Swiss Exchange", status: "NOT_CONNECTED", kind: "EXCHANGE", rank: { meta: 20, prices: 20 }, capabilities: ["isin", "symbol", "exchange", "currency", "prices"] },
    morningstar: { label: "Morningstar", status: "NOT_CONNECTED", kind: "LICENSED_DATA", rank: { meta: 15, prices: 30 },
      capabilities: ["isin", "ter", "fundSize", "holdings", "category", "trackingDifference", "distributionPolicy"] }
  };

  /* Status je Datenfeld und Anbieter (intern, keine Marketingdarstellung). */
  var STATUS_MATRIX = {
    tiingo: { prices: "ACTIVE", totalReturn: "ACTIVE_WHERE_RECONSTRUCTED", metadata: "PARTIAL", holdings: "NOT_AVAILABLE", costs: "NOT_AVAILABLE", isin: "NOT_AVAILABLE", ucits: "NOT_AVAILABLE" },
    european_exchange: { prices: "NOT_CONNECTED", metadata: "NOT_CONNECTED", isin: "NOT_CONNECTED" },
    issuer_feeds: { holdings: "NOT_CONNECTED", costs: "NOT_CONNECTED", distribution: "NOT_CONNECTED", replication: "NOT_CONNECTED" }
  };
  /* Mapping-Vertrag fuer einen zweiten Anbieter: Quellfeld -> kanonisches Feld,
     Typ und Pflicht. Ein Adapter liefert nur, was dieser Vertrag kennt. */
  var MAPPING_CONTRACT = { version: "vu-etf-provider-mapping-1.0.0", identity: ["isin", "wkn", "providerSymbol", "exchangeMic", "currency"],
    fields: {
      isin: { type: "string", pattern: "^[A-Z]{2}[A-Z0-9]{9}[0-9]$", required: true },
      wkn: { type: "string", pattern: "^[A-Z0-9]{6}$" }, ter: { type: "number", unit: "fraction p.a.", range: [0, 0.05] },
      fundSize: { type: "number", unit: "currency" }, fundSizeCurrency: { type: "string" },
      distributionPolicy: { type: "enum", values: ["DISTRIBUTING", "ACCUMULATING"] },
      replicationMethod: { type: "enum", values: ["FULL_PHYSICAL", "SAMPLING", "SYNTHETIC_SWAP"] },
      domicile: { type: "string" }, ucits: { type: "boolean" }, benchmark: { type: "string" },
      inceptionDate: { type: "date" }, nav: { type: "number" }, navDate: { type: "date" },
      trackingDifference: { type: "number", unit: "fraction p.a." }, holdings: { type: "contract", contract: "etf-holdings-2.0.0" }
    },
    rules: ["Kein Feld ohne Quelle und Stichtag.", "ISIN ist der Schluessel fuer FUND/SHARE CLASS; ohne ISIN kein Merge mit Tiingo-Listings.", "Konflikte zwischen Anbietern werden protokolliert, nicht still ueberschrieben."] };

  /** Prueft einen Fremddatensatz gegen den Mapping-Vertrag. */
  function validateMapped(fields) {
    var errors = [];
    Object.keys(fields || {}).forEach(function (k) {
      var spec = MAPPING_CONTRACT.fields[k];
      var v = fields[k];
      if (!spec) { errors.push("UNKNOWN_FIELD_" + k); return; }
      if (v === null || v === undefined) return;
      if (spec.type === "number" && !(typeof v === "number" && isFinite(v))) errors.push("NOT_NUMBER_" + k);
      if (spec.range && (v < spec.range[0] || v > spec.range[1])) errors.push("OUT_OF_RANGE_" + k);
      if (spec.pattern && !(new RegExp(spec.pattern)).test(String(v))) errors.push("BAD_FORMAT_" + k);
      if (spec.type === "enum" && spec.values.indexOf(v) < 0) errors.push("BAD_ENUM_" + k);
    });
    if (fields && !fields.isin && MAPPING_CONTRACT.fields.isin.required) errors.push("MISSING_isin");
    return errors;
  }

  function coverage(fields, wanted) {
    var list = wanted || Object.keys(fields || {});
    if (!list.length) return { ratio: 0, present: [], missing: [] };
    var present = list.filter(function (k) { return fields && fields[k] !== null && fields[k] !== undefined; });
    return { ratio: present.length / list.length, present: present, missing: list.filter(function (k) { return present.indexOf(k) === -1; }) };
  }

  /** Huelle fuer einen Datensatz - jede Adapter-Ausgabe geht hier durch. */
  function record(provider, providerSymbol, canonicalETFId, fields, opts) {
    if (!PROVIDERS[provider]) throw new Error("UNKNOWN_PROVIDER:" + provider);
    opts = opts || {};
    var cov = coverage(fields, opts.expected);
    return {
      provider: provider, providerSymbol: providerSymbol, canonicalETFId: canonicalETFId || null,
      timestamp: opts.timestamp || null,
      fieldCoverage: Math.round(cov.ratio * 1000) / 1000, missingFields: cov.missing,
      dataQuality: opts.dataQuality || (cov.ratio >= 0.8 ? "GOOD" : cov.ratio >= 0.4 ? "PARTIAL" : "SPARSE"),
      fields: fields || {}, prices: opts.prices || null
    };
  }

  /**
   * Tiingo-Adapter ueber bereits geladene Daten (Stammzeilen + Reihen).
   * Ohne Netz: der Adapter liest, was der Build ausgeliefert hat.
   */
  function createTiingoAdapter(source) {
    source = source || {};
    var rows = source.rows || [];
    var series = source.series || {};
    var bySym = {};
    rows.forEach(function (r) { bySym[r.symbol] = r; });
    var EXPECTED = ["symbol", "name", "exchange", "currency", "inceptionDate"];
    return {
      provider: "tiingo",
      status: PROVIDERS.tiingo.status,
      capabilities: function () { return PROVIDERS.tiingo.capabilities.slice(); },
      listSymbols: function () { return Object.keys(bySym).sort(); },
      getMetadata: function (symbol) {
        var r = bySym[symbol];
        if (!r) return null;
        return record("tiingo", symbol, r.canonicalETFId, {
          symbol: r.symbol, name: r.name || null, exchange: r.exchange || null, currency: r.currency || null,
          inceptionDate: r.firstTradeDate || null
        }, { expected: EXPECTED, timestamp: source.asOf || null });
      },
      getPrices: function (symbol) {
        var s = series[symbol];
        if (!s || !s.points || !s.points.length) return null;
        return record("tiingo", symbol, bySym[symbol] && bySym[symbol].canonicalETFId, { priceSeriesType: s.priceSeriesType || "SPLIT_ADJUSTED" },
          { expected: ["priceSeriesType"], timestamp: s.asOf || null, prices: s.points });
      }
    };
  }

  /** Platzhalter fuer einen noch nicht angeschlossenen Anbieter: liefert nichts. */
  function createDisconnectedAdapter(provider) {
    if (!PROVIDERS[provider]) throw new Error("UNKNOWN_PROVIDER:" + provider);
    return {
      provider: provider, status: "NOT_CONNECTED",
      capabilities: function () { return PROVIDERS[provider].capabilities.slice(); },
      listSymbols: function () { return []; },
      getMetadata: function () { return null; },
      getPrices: function () { return null; }
    };
  }

  /**
   * Feldweise Zusammenfuehrung. Kleinerer Rang gewinnt. Leere Werte
   * ueberschreiben nie gefuellte. Ergebnis traegt je Feld die Quelle.
   */
  function merge(records, kind) {
    var key = kind === "prices" ? "prices" : "meta";
    var sorted = (records || []).filter(Boolean).slice().sort(function (a, b) {
      return PROVIDERS[a.provider].rank[key] - PROVIDERS[b.provider].rank[key];
    });
    var fields = {}, provenance = {};
    sorted.forEach(function (r) {
      Object.keys(r.fields || {}).forEach(function (f) {
        var v = r.fields[f];
        if (v === null || v === undefined) return;
        if (!(f in fields)) { fields[f] = v; provenance[f] = { provider: r.provider, timestamp: r.timestamp }; }
      });
    });
    var prices = null;
    sorted.some(function (r) { if (r.prices && r.prices.length) { prices = { provider: r.provider, points: r.prices, timestamp: r.timestamp }; return true; } return false; });
    return { fields: fields, provenance: provenance, prices: prices, providers: sorted.map(function (r) { return r.provider; }) };
  }

  function registry(adapters) {
    var list = (adapters || []).slice();
    return {
      adapters: list,
      status: function () {
        return Object.keys(PROVIDERS).map(function (p) {
          var a = list.filter(function (x) { return x.provider === p; })[0];
          return { provider: p, label: PROVIDERS[p].label, kind: PROVIDERS[p].kind, status: a ? a.status : "NOT_CONNECTED", capabilities: PROVIDERS[p].capabilities };
        });
      },
      metadata: function (symbol) { return merge(list.map(function (a) { return a.getMetadata(symbol); }), "meta"); },
      prices: function (symbol) { return merge(list.map(function (a) { return a.getPrices(symbol); }), "prices").prices; }
    };
  }

  var api = { VERSION: VERSION, PROVIDERS: PROVIDERS, STATUS_MATRIX: STATUS_MATRIX, MAPPING_CONTRACT: MAPPING_CONTRACT, validateMapped: validateMapped, record: record, coverage: coverage,
    createTiingoAdapter: createTiingoAdapter, createDisconnectedAdapter: createDisconnectedAdapter,
    merge: merge, registry: registry };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Provider = api; }
})(typeof window !== "undefined" ? window : globalThis);
