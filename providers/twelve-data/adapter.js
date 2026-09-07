/* =========================================================================
   VISION UNIVERSE — TWELVE DATA ADAPTER (Phase 2, §12)

   Der einzige Ort im System, an dem Twelve-Data-spezifische Felder
   vorkommen duerfen. Nach aussen liefert dieser Adapter ausschliesslich
   kanonische Objekte aus quant/engines/schema.js.

   WO DIESER ADAPTER LAEUFT: serverseitig — in der GitHub Action oder
   lokal. NIEMALS im Browser. Vision Universe wird statisch von GitHub Pages
   ausgeliefert; ein Schluessel im Browser waere ein oeffentlicher
   Schluessel. Der Adapter liest ihn aus der Umgebung und existiert im
   ausgelieferten Frontend gar nicht erst.

   EINE INHALTLICHE WARNUNG, DIE ARCHITEKTUR GEWORDEN IST:
   Kostenlose Zugaenge liefern in aller Regel UNBEREINIGTE Kurse. Die Quant
   Engine rechnet Renditen aber auf total-return-adjustierten Kursen. Wer
   unbereinigte Schlusskurse als adjustedClose einspeist, erzeugt an jedem
   Split einen scheinbaren Kurssturz von 50 % oder mehr — und der Backtest
   rechnet ihn als echten Verlust. Dieser Adapter setzt adjustedClose
   deshalb auf null, solange die Bereinigung nicht bestaetigt ist, und
   markiert jede Bar mit adjustmentStatus.
   ========================================================================= */
"use strict";

const path = require("path");
const ENGINES = path.join(__dirname, "..", "..", "quant", "engines");
const Capabilities = require(path.join(ENGINES, "capabilities.js"));
const MarketClient = require(path.join(ENGINES, "market-client.js"));
const Provider = require(path.join(ENGINES, "provider.js"));
const Schema = require(path.join(ENGINES, "schema.js"));

const PROVIDER_ID = "twelve-data";
const DEFAULT_BASE_URL = "https://api.twelvedata.com";
const DATA_SOURCE_ID = "ds_twelve_data";

/* Konservative Startwerte fuer einen kostenlosen Zugang. Sie sind
   ausdruecklich konfigurierbar und KEINE Aussage ueber das Angebot des
   Anbieters — Kontingente aendern sich, und eine hier fest verdrahtete
   Zahl waere ab dem Tag ihrer Aufnahme potenziell falsch. Die tatsaechlich
   geltenden Werte gehoeren in die Umgebungsvariablen. */
const DEFAULT_LIMITS = {
  requestsPerMinute: 8,
  requestsPerDay: 800,
  concurrency: 1,
  maxRetries: 3,
  baseBackoffMs: 800
};

/**
 * Faehigkeiten eines kostenlosen Zugangs.
 *
 * `null` heisst "ungeprueft", nicht "nein". Was hier auf false steht, wurde
 * bewusst als nicht verfuegbar angenommen, bis ein Zugang das Gegenteil
 * zeigt — die vorsichtige Annahme ist die, bei der nichts faelschlich als
 * echt gilt.
 */
function freePlanCapabilities(overrides) {
  return Capabilities.declare(PROVIDER_ID, Object.assign({
    plan: "free",
    market: {
      daily: true,
      historicalDaily: true,
      symbolSearch: true,
      marketStatus: true,
      delayed: true,
      realtime: false,
      intraday: true,
      historicalIntraday: false,
      websocket: false,
      /* Der kritische Punkt: ohne bestaetigte Bereinigung keine
         Total-Return-Rechnung. */
      adjustedPrices: false,
      /* Bewusst null, nicht true: die Tageshistorie SIEHT splitbereinigt aus
         (siehe notes), aber zugesichert ist es nicht. null heisst
         "ungeprueft" und verhindert, dass die Engine sich darauf verlaesst. */
      splitAdjustedPrices: null,
      splits: false,
      dividends: false,
      bulkQuotes: false
    },
    fundamental: {
      pointInTime: false, restatements: false, filingDates: null,
      delistedSecurities: false, historicalUniverse: false
    },
    reference: { securityMaster: true, exchanges: true, isin: null, delisted: false },
    limits: DEFAULT_LIMITS,
    notes: {
      adjustedPrices: "Total-Return-Bereinigung (Splits UND Dividenden) ist bei kostenlosen Zugaengen " +
        "nicht enthalten; es gibt kein adjusted_close-Feld. Der Adapter liefert deshalb " +
        "adjustedClose = null statt eines unbereinigten Kurses, der an jedem Split einen " +
        "Scheinverlust erzeugen wuerde.",
      splitAdjustedPrices: "Empirisch spricht viel dafuer, dass die Tageshistorie splitbereinigt " +
        "geliefert wird: in bereits abgerufenen Reihen dieses Repositories steht NVDA im Juli 2021 " +
        "bei rund 18 USD - das ist der um 4:1 (2021) und 10:1 (2024) bereinigte Kurs, unbereinigt " +
        "waeren es rund 726 USD. Zugesichert ist das nirgends, deshalb null statt true. Wer das " +
        "verifiziert, setzt splitAdjustedPrices: true ueber die overrides und traegt Datum und " +
        "Beleg in docs/VU_PROVIDER_CAPABILITIES.md nach.",
      delistedSecurities: "Delistete Titel sind nicht abrufbar. Fuer survivorship-bias-freie Backtests " +
        "ist dieser Zugang damit nicht geeignet.",
      pointInTime: "Keine availableAt-Zeitachse. Fuer historische Fundamental-Backtests ungeeignet."
    }
  }, overrides || {}));
}

/**
 * Erzeugt den Adapter.
 *
 * @param {object} options
 *   apiKey      Pflicht fuer echte Abrufe. Fehlt er, meldet der Adapter
 *               `notConfigured` und stellt keine Anfrage — er faellt NICHT
 *               stillschweigend auf Mock-Daten zurueck.
 *   symbolRegistry  symbol-mapping.js Registry
 *   fetchImpl   injizierbar (Action: globalThis.fetch, Test: Stub)
 */
function createTwelveDataProvider(options) {
  options = options || {};
  const apiKey = options.apiKey || null;
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const capabilities = options.capabilities || freePlanCapabilities();
  const symbols = options.symbolRegistry || null;

  const client = MarketClient.createMarketClient({
    providerId: PROVIDER_ID,
    fetchImpl: options.fetchImpl,
    now: options.now,
    sleep: options.sleep,
    limits: Object.assign({}, DEFAULT_LIMITS, capabilities.limits || {}, options.limits || {}),
    ttl: options.ttl
  });

  function notConfigured(what) {
    return {
      available: false, data: null, reason: "notConfigured",
      message: "Kein TWELVE_DATA_API_KEY gesetzt. " + what + " wird nicht abgerufen. " +
               "Der Adapter faellt bewusst nicht auf Demo-Daten zurueck — das waere ein stiller Mock-Fallback."
    };
  }

  function url(endpoint, params) {
    const query = new URLSearchParams(Object.assign({}, params, { apikey: apiKey }));
    return baseUrl + "/" + endpoint + "?" + query.toString();
  }

  /* Der Anbieter meldet Fehler teilweise mit HTTP 200 im Body. Ohne diese
     Erkennung landete ein Fehlerobjekt als "erfolgreiche" Antwort im Cache. */
  function detectError(body) {
    if (!body || typeof body !== "object") return null;
    if (body.status === "error" || (body.code && body.code >= 400)) {
      return { status: body.code || 400, message: body.message || "Anbieterfehler" };
    }
    return null;
  }

  function provenance(asOf, adjustmentStatus) {
    return Schema.makeProvenance({
      provider: PROVIDER_ID,
      source: "twelve-data-api",
      asOf: asOf || new Date().toISOString().slice(0, 10),
      ingestedAt: new Date().toISOString(),
      dataSnapshotId: "live_" + PROVIDER_ID + "_" + (asOf || "now"),
      isMock: false
    });
  }

  /**
   * Drei ehrliche Zustaende statt eines Ja/Nein.
   *
   *   "adjusted"      Splits UND Dividenden bereinigt -> Total Return moeglich
   *   "splitAdjusted" nur Splits bereinigt -> Charts ja, Total Return nein
   *   "unadjusted"    keine Bereinigung -> jeder Split liest sich als Absturz
   *
   * Eine ungeprueft gelassene Faehigkeit (null) faellt bewusst auf den
   * strengeren Zustand zurueck. Im Zweifel lieber zu wenig behaupten.
   */
  function seriesAdjustmentStatus() {
    if (Capabilities.supports(capabilities, "market", "adjustedPrices")) return "adjusted";
    if (Capabilities.supports(capabilities, "market", "splitAdjustedPrices")) return "splitAdjusted";
    return "unadjusted";
  }

  function resolveSymbol(securityId) {
    if (!symbols) return { resolved: true, symbol: securityId };
    return symbols.toProvider(PROVIDER_ID, securityId);
  }

  /* ---------------------------------------------------------------- Mapping */

  /**
   * Vendor-Bar -> kanonische PriceBar.
   *
   * adjustedClose bleibt null, solange die Bereinigung nicht als Faehigkeit
   * bestaetigt ist. Ein unbereinigter Kurs an dieser Stelle waere kein
   * ungenauer Wert, sondern ein falscher.
   */
  function toPriceBar(securityId, row, currency, status) {
    const num = (v) => {
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const close = num(row.close);
    if (close === null) return null;
    const date = String(row.datetime || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    return {
      securityId: securityId,
      date: date,
      open: num(row.open),
      high: num(row.high),
      low: num(row.low),
      close: close,
      /* Kanonisch, aber ehrlich: adjustedClose traegt nur dann einen Wert,
         wenn Splits UND Dividenden bereinigt sind. Ein splitbereinigter Kurs
         ist fuer Total Return genauso falsch wie ein unbereinigter - nur
         weniger auffaellig, was ihn gefaehrlicher macht. */
      adjustedClose: status === "adjusted"
        ? num(row.adjusted_close !== undefined ? row.adjusted_close : row.close)
        : null,
      volume: num(row.volume) === null ? 0 : num(row.volume),
      currency: currency || "USD",
      dataSourceId: DATA_SOURCE_ID,
      adjustmentStatus: status
    };
  }

  /* -------------------------------------------------------------- Interface */

  const api = {
    providerId: PROVIDER_ID,
    capabilities: capabilities,
    isMock: false,

    /** Welche Bereinigung dieser Zugang liefert: adjusted | splitAdjusted | unadjusted. */
    adjustmentStatus: seriesAdjustmentStatus,

    /** Tages-Bars. Kernmethode fuer die Praekomputation. */
    getDailyBars: function (securityId, opts) {
      opts = opts || {};
      if (!apiKey) return Promise.resolve(notConfigured("Tageskurse"));
      if (!Capabilities.supports(capabilities, "market", "historicalDaily")) {
        return Promise.resolve(Capabilities.capabilityMissing(PROVIDER_ID, "market", "historicalDaily"));
      }
      const mapping = resolveSymbol(securityId);
      if (!mapping.resolved) return Promise.resolve({ available: false, data: null, reason: "symbolUnmapped", message: mapping.reason });

      const status = seriesAdjustmentStatus();
      const params = { symbol: mapping.symbol, interval: "1day", outputsize: String(opts.outputsize || 500), format: "JSON" };
      if (opts.from) params.start_date = opts.from;
      if (opts.to) params.end_date = opts.to;

      return client.request({
        kind: "dailyBars", url: url("time_series", params), params: params, detectError: detectError,
        parse: function (body) {
          const currency = (body.meta && body.meta.currency) || "USD";
          const rows = Array.isArray(body.values) ? body.values : [];
          const bars = rows.map((r) => toPriceBar(securityId, r, currency, status)).filter(Boolean);
          /* Der Anbieter liefert absteigend; die Engine erwartet aufsteigend. */
          bars.sort((a, b) => (a.date < b.date ? -1 : 1));
          return { securityId: securityId, providerSymbol: mapping.symbol, currency: currency,
                   adjustmentStatus: status, bars: bars };
        }
      }).then((res) => toEnvelope(res, opts.to));
    },

    getHistoricalBars: function (securityId, opts) {
      return api.getDailyBars(securityId, Object.assign({ outputsize: 5000 }, opts || {}));
    },

    getIntradayBars: function (securityId, opts) {
      opts = opts || {};
      if (!apiKey) return Promise.resolve(notConfigured("Intraday-Kurse"));
      if (!Capabilities.supports(capabilities, "market", "intraday")) {
        return Promise.resolve(Capabilities.capabilityMissing(PROVIDER_ID, "market", "intraday",
          "Fuer Intraday-Daten ist ein anderer Zugang noetig."));
      }
      const mapping = resolveSymbol(securityId);
      if (!mapping.resolved) return Promise.resolve({ available: false, data: null, reason: "symbolUnmapped", message: mapping.reason });
      const params = { symbol: mapping.symbol, interval: opts.interval || "5min",
                       outputsize: String(opts.outputsize || 100), format: "JSON" };
      return client.request({
        kind: "intradayBars", url: url("time_series", params), params: params, detectError: detectError,
        parse: function (body) {
          const currency = (body.meta && body.meta.currency) || "USD";
          const rows = Array.isArray(body.values) ? body.values : [];
          return { securityId: securityId, interval: params.interval, currency: currency,
                   bars: rows.map((r) => ({
                     securityId: securityId, timestamp: r.datetime,
                     open: parseFloat(r.open), high: parseFloat(r.high),
                     low: parseFloat(r.low), close: parseFloat(r.close),
                     volume: parseFloat(r.volume) || 0, currency: currency,
                     dataSourceId: DATA_SOURCE_ID
                   })).reverse() };
        }
      }).then((res) => toEnvelope(res));
    },

    getQuote: function (securityId) {
      if (!apiKey) return Promise.resolve(notConfigured("Kursabfrage"));
      const mapping = resolveSymbol(securityId);
      if (!mapping.resolved) return Promise.resolve({ available: false, data: null, reason: "symbolUnmapped", message: mapping.reason });
      const params = { symbol: mapping.symbol, format: "JSON" };
      return client.request({
        kind: "quote", url: url("quote", params), params: params, detectError: detectError,
        parse: function (body) {
          const close = parseFloat(body.close);
          return {
            securityId: securityId, providerSymbol: mapping.symbol,
            date: String(body.datetime || "").slice(0, 10),
            close: Number.isFinite(close) ? close : null,
            /* Der Anbieter kennzeichnet verzoegerte Kurse; ohne diese
               Angabe wird "verzoegert" angenommen statt "live". */
            quoteType: body.is_market_open === true ? "delayed" : "endOfDay",
            currency: body.currency || "USD",
            previousClose: parseFloat(body.previous_close) || null,
            dataSourceId: DATA_SOURCE_ID
          };
        }
      }).then((res) => toEnvelope(res));
    },

    getMarketStatus: function (exchange) {
      if (!apiKey) return Promise.resolve(notConfigured("Boersenstatus"));
      if (!Capabilities.supports(capabilities, "market", "marketStatus")) {
        return Promise.resolve(Capabilities.capabilityMissing(PROVIDER_ID, "market", "marketStatus"));
      }
      const params = { exchange: exchange || "NASDAQ" };
      return client.request({
        kind: "marketStatus", url: url("market_state", params), params: params, detectError: detectError,
        parse: function (body) {
          const row = Array.isArray(body) ? body[0] : body;
          return { exchange: (row && row.name) || exchange || "NASDAQ",
                   isOpen: !!(row && row.is_market_open),
                   timeAfterOpen: (row && row.time_after_open) || null,
                   dataSourceId: DATA_SOURCE_ID };
        }
      }).then((res) => toEnvelope(res));
    },

    getSymbolSearch: function (query) {
      if (!apiKey) return Promise.resolve(notConfigured("Symbolsuche"));
      if (!Capabilities.supports(capabilities, "market", "symbolSearch")) {
        return Promise.resolve(Capabilities.capabilityMissing(PROVIDER_ID, "market", "symbolSearch"));
      }
      const params = { symbol: query };
      return client.request({
        kind: "symbolSearch", url: url("symbol_search", params), params: params, detectError: detectError,
        parse: function (body) {
          const rows = Array.isArray(body.data) ? body.data : [];
          return rows.slice(0, 25).map((r) => ({
            providerSymbol: r.symbol, name: r.instrument_name, exchange: r.exchange,
            mic: r.mic_code || null, country: r.country, currency: r.currency,
            instrumentType: r.instrument_type
          }));
        }
      }).then((res) => toEnvelope(res));
    },

    /* Corporate Actions sind im kostenlosen Zugang nicht enthalten. Das
       wird als fehlende Faehigkeit gemeldet — nicht als leere Liste, die
       aussaehe, als haette es keine Splits gegeben. */
    getCorporateActions: function (securityId) {
      if (!Capabilities.supports(capabilities, "market", "splits") &&
          !Capabilities.supports(capabilities, "market", "dividends")) {
        return Promise.resolve(Capabilities.capabilityMissing(PROVIDER_ID, "market", "splits",
          "Ohne Corporate Actions sind Total-Return-Reihen nicht rekonstruierbar."));
      }
      return Promise.resolve({ available: false, data: null, reason: "notImplemented",
        message: "Corporate Actions sind fuer diesen Adapter noch nicht implementiert." });
    },

    healthCheck: function () {
      const h = client.health();
      if (!apiKey) {
        return Provider.makeHealth("not_configured", {
          provider: PROVIDER_ID,
          message: "TWELVE_DATA_API_KEY fehlt. Ohne Schluessel werden keine Anfragen gestellt.",
          capabilities: []
        });
      }
      const map = { available: "ok", degraded: "degraded", offline: "unavailable",
                    quotaExceeded: "degraded", authError: "unavailable", notConfigured: "not_configured" };
      return Provider.makeHealth(map[h.status] || "degraded", {
        provider: PROVIDER_ID,
        message: h.message || ("Status: " + h.status),
        capabilities: Object.keys(capabilities.sets.market).filter((c) => capabilities.sets.market[c] === true)
      });
    },

    stats: function () { return client.stats(); },
    quota: function () { return client.quota(); },
    rawHealth: function () { return client.health(); }
  };

  function toEnvelope(res, asOf) {
    if (res.ok) {
      return {
        available: true, data: res.data,
        provenance: provenance(asOf), fromCache: !!res.fromCache, stale: !!res.stale,
        reason: res.stale ? "stale" : null,
        message: res.stale ? "Daten stammen aus dem Cache; ein aktueller Abruf war nicht moeglich." : null
      };
    }
    return { available: false, data: null, reason: res.reason || "requestFailed",
             message: res.message || "Abruf fehlgeschlagen.", status: res.status || null };
  }

  return api;
}

module.exports = {
  PROVIDER_ID,
  DATA_SOURCE_ID,
  DEFAULT_BASE_URL,
  DEFAULT_LIMITS,
  freePlanCapabilities,
  createTwelveDataProvider
};
