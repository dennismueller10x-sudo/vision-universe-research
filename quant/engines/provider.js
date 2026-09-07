/* =========================================================================
   VISION UNIVERSE QUANT — provider.js
   PROVIDER ABSTRACTION (§8, §9, §78, §79)

   Sieben Interfaces trennen das kanonische Modell von jedem Vendor.
   Oberhalb dieser Schicht existiert kein vendor-spezifisches Feld — weder
   im Frontend noch in Quant Engine, Screener, Backtester, AI oder Strategy
   Engine. Ein Adapter ist der EINZIGE Ort, an dem ein Vendor-Payload
   vorkommen darf.

       Vendor -> Adapter -> Canonical Schema -> Domain Engine -> API -> UI

   V1 laeuft vollstaendig auf dem MockProvider. Kein API-Key, kein Vertrag,
   keine Netzwerkabhaengigkeit (§7).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSchema;

  /* ---------------------------------------------------------------------
     Interface-Definitionen. Ohne TypeScript wird der Vertrag zur Laufzeit
     geprueft: registerProvider() akzeptiert nur Objekte, die alle Methoden
     ihres Interfaces tatsaechlich implementieren.
     --------------------------------------------------------------------- */
  var INTERFACES = {
    ReferenceDataProvider: {
      methods: ["getSecurities", "getSecurity", "getExchanges", "getUniverse", "getUniverseMembership", "healthCheck"],
      description: "Security Master, Exchanges, Universen und historische Mitgliedschaften."
    },
    MarketDataProvider: {
      methods: ["getPriceBars", "getLatestPrice", "getBenchmarkBars", "getPricePanel", "healthCheck"],
      description: "Tages-OHLCV inklusive total-return-adjustierter Schlusskurse. getPricePanel liefert dieselben Daten als Bulk-Panel (typisierte Arrays): Cross-Sectional-Quant ueber 500 Titel und 20 Jahre laesst sich nicht sinnvoll ueber Einzelabrufe bedienen — echte Anbieter stellen dafuer ebenfalls Bulk-/Parquet-Zugriffe bereit."
    },
    FundamentalDataProvider: {
      methods: ["getFacts", "getFilings", "getFactPanel", "healthCheck"],
      description: "Bitemporale Fundamentaldaten. getFacts MUSS Point-in-Time unterstuetzen. getFactPanel ist die Bulk-Variante fuer die Quant Engine und unterliegt derselben availableAt-Regel."
    },
    EstimateDataProvider: {
      methods: ["getEstimates", "getRevisionHistory", "healthCheck"],
      description: "Analystenschaetzungen und Revisionen. In V1 bewusst ohne Daten (§16)."
    },
    CorporateActionsProvider: {
      methods: ["getCorporateActions", "healthCheck"],
      description: "Splits, Dividenden, Delistings, Mergers, Symbolwechsel."
    },
    MacroDataProvider: {
      methods: ["getIndicator", "getIndicators", "healthCheck"],
      description: "Makro-Zeitreihen. Extension Point — das bestehende /macro-Produkt bleibt unberuehrt."
    },
    NewsDataProvider: {
      methods: ["getNews", "healthCheck"],
      description: "Nachrichten je Security. Extension Point."
    }
  };

  /* Provider-Gesundheit. "unavailable" fuehrt NIE zu erfundenen Werten,
     sondern zu einem sichtbaren Hinweis in der UI (§93, §76). */
  var HEALTH_STATUS = ["ok", "degraded", "unavailable", "not_configured"];

  function makeHealth(status, fields) {
    fields = fields || {};
    if (HEALTH_STATUS.indexOf(status) === -1) throw new Error("unknown health status: " + status);
    return {
      status: status,
      provider: fields.provider || "unknown",
      message: fields.message || "",
      checkedAt: fields.checkedAt || new Date().toISOString(),
      capabilities: fields.capabilities || []
    };
  }

  /* Ergebnis-Huelle fuer alles, was aus einem Provider kommt. Erzwingt,
     dass jeder Datenpunkt seine Herkunft mitfuehrt (§14) und dass fehlende
     Daten als "unavailable" statt als Wert zurueckkommen (§76). */
  function ok(data, provenance) {
    return { available: true, data: data, provenance: provenance, reason: null };
  }
  function unavailable(reason, provenance) {
    return { available: false, data: null, provenance: provenance || null, reason: reason };
  }

  function missingMethods(iface, impl) {
    var spec = INTERFACES[iface];
    if (!spec) throw new Error("unknown provider interface: " + iface);
    if (!impl || typeof impl !== "object") return spec.methods.slice();
    return spec.methods.filter(function (m) { return typeof impl[m] !== "function"; });
  }

  function implementsInterface(iface, impl) {
    return missingMethods(iface, impl).length === 0;
  }

  /* ---------------------------------------------------------------------
     Registry. Die Domain Engines fragen ausschliesslich die Registry und
     kennen nie einen konkreten Adapter.
     --------------------------------------------------------------------- */
  function createRegistry() {
    var slots = Object.create(null);

    return {
      register: function (iface, impl) {
        var missing = missingMethods(iface, impl);
        if (missing.length) {
          throw new Error("Provider does not implement " + iface + ": missing " + missing.join(", "));
        }
        slots[iface] = impl;
        return this;
      },
      /** Registriert einen Adapter fuer alle Interfaces, die er erfuellt. */
      registerAll: function (impl) {
        var self = this;
        Object.keys(INTERFACES).forEach(function (iface) {
          if (implementsInterface(iface, impl)) self.register(iface, impl);
        });
        return this;
      },
      get: function (iface) {
        var impl = slots[iface];
        if (!impl) throw new Error("No provider registered for " + iface);
        return impl;
      },
      has: function (iface) { return !!slots[iface]; },
      list: function () { return Object.keys(slots); },
      health: function () {
        var out = {};
        Object.keys(slots).forEach(function (iface) {
          try { out[iface] = slots[iface].healthCheck(); }
          catch (e) { out[iface] = makeHealth("unavailable", { message: String(e && e.message || e) }); }
        });
        return out;
      }
    };
  }

  /* Prozessweite Standard-Registry. Der MockProvider registriert sich beim
     Laden selbst (siehe mock-provider.js). */
  var defaultRegistry = createRegistry();

  /* ---------------------------------------------------------------------
     Guard gegen Vendor-Leakage (§9). Wird in Tests und im Ingest benutzt.
     Ein Adapter darf Vendor-Felder kennen; alles oberhalb nicht.
     --------------------------------------------------------------------- */
  var VENDOR_MARKERS = [
    "twelve_data", "twelveData", "twelvedata",
    "intrinio", "eodhd", "eod_historical",
    "tiingo", "polygon", "alphavantage", "alpha_vantage",
    "refinitiv", "lseg", "factset", "bloomberg", "capitaliq", "capital_iq",
    "morningstar", "yfinance", "yahoo_finance"
  ];

  /** Sucht Vendor-Marker in Objekt-Keys eines kanonischen Records. */
  function findVendorLeakage(value, path, out) {
    out = out || [];
    path = path || "$";
    if (value === null || typeof value !== "object") return out;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length && i < 50; i++) findVendorLeakage(value[i], path + "[" + i + "]", out);
      return out;
    }
    Object.keys(value).forEach(function (k) {
      var lower = k.toLowerCase();
      VENDOR_MARKERS.forEach(function (m) {
        if (lower.indexOf(m.toLowerCase()) !== -1) out.push(path + "." + k);
      });
      findVendorLeakage(value[k], path + "." + k, out);
    });
    return out;
  }

  var api = {
    INTERFACES: INTERFACES,
    HEALTH_STATUS: HEALTH_STATUS,
    VENDOR_MARKERS: VENDOR_MARKERS,
    makeHealth: makeHealth,
    ok: ok,
    unavailable: unavailable,
    implementsInterface: implementsInterface,
    missingMethods: missingMethods,
    createRegistry: createRegistry,
    registry: defaultRegistry,
    findVendorLeakage: findVendorLeakage
  };

  if (isNode) module.exports = api;
  else global.VUProvider = api;
})(typeof window !== "undefined" ? window : globalThis);
