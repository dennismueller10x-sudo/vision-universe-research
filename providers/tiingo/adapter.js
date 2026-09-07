/* =========================================================================
   VISION UNIVERSE — providers/tiingo/adapter.js   (Phase 4A)

   Tiingo als Marktdatenquelle. Node-only, serverseitig.

   Warum dieser Adapter mehr kann als der von Twelve Data: Tiingo liefert in
   derselben Antwort den unbereinigten und den bereinigten Kurs, dazu
   splitFactor und divCash je Handelstag. Damit laesst sich die
   Bereinigungssemantik aus Phase 3 zum ersten Mal vollstaendig bedienen -
   RAW und TOTAL_RETURN nebeneinander, statt einer Reihe, von der man raten
   muss, was sie bedeutet.

   Was dieser Adapter NICHT tut:

   - Er behauptet die Bereinigungsstufe nicht auf Verdacht. Sekundaerquellen
     berichten, adjClose sei split- UND dividendenbereinigt; das ist
     plausibel und unbelegt. Die Faehigkeit steht deshalb auf null
     (ungeprueft), und scripts/market/verify-tiingo-adjustment.mjs weist sie
     an echten Daten nach - an einem bekannten Split und einem bekannten
     Dividendenstichtag. Erst danach darf sie true werden.

   - Er faellt ohne Schluessel nicht auf Demo-Daten zurueck. Er meldet
     notConfigured und stellt keine Anfrage.

   - Er erfindet keine Felder ausserhalb des kanonischen Modells. Alles
     Tiingo-Spezifische endet in dieser Datei.

   Der Schluessel steht bei Tiingo im Authorization-Header, nicht in der URL.
   Das ist ein echter Vorteil gegenueber Twelve Data: eine geloggte URL
   verraet ihn nicht.
   ========================================================================= */
"use strict";

const path = require("path");
const engines = path.join(__dirname, "..", "..", "quant", "engines");

const Provider = require(path.join(engines, "provider.js"));
const Schema = require(path.join(engines, "schema.js"));
const Capabilities = require(path.join(engines, "capabilities.js"));
const MarketClient = require(path.join(engines, "market-client.js"));

const PROVIDER_ID = "tiingo";
const DATA_SOURCE_ID = "ds_tiingo";
const DEFAULT_BASE_URL = "https://api.tiingo.com";

/* Die Grenzen des kostenlosen Zugangs laut Kontoseite (Stand 2026-09).
   Bewusst als Standardwert im Code und nicht als Vertragsgrundlage: sie
   aendern sich, und die Kontoseite ist die Quelle, nicht diese Datei.

   Die Stundengrenze ist der eigentliche Engpass. 50 Anfragen pro Stunde
   heissen: ein Erstimport von 20 Titeln braucht eine knappe halbe Stunde,
   wenn man ihn ernst nimmt, und wenige Minuten, wenn man ihn nicht ernst
   nimmt und danach eine Stunde gesperrt ist. */
const FREE_LIMITS = {
  requestsPerMinute: 20,
  requestsPerHour: 50,
  requestsPerDay: 1000,
  bytesPerMonth: 2 * 1024 * 1024 * 1024,   // 2 GB
  concurrency: 1,
  maxRetries: 3,
  baseBackoffMs: 1000
};

/* Der kostenpflichtige Zugang aendert ausschliesslich diese Zahlen, nicht
   den Adapter. Genau das ist der Sinn der Trennung (§28). */
const COMMERCIAL_LIMITS = {
  requestsPerMinute: 100,
  requestsPerHour: 5000,
  requestsPerDay: 50000,
  bytesPerMonth: Infinity,
  concurrency: 4,
  maxRetries: 3,
  baseBackoffMs: 500
};

/**
 * Faehigkeiten des kostenlosen Zugangs.
 *
 * Drei Zustaende wie in Phase 2: true zugesichert, false ausdruecklich
 * nicht vorhanden, null ungeprueft. Der wichtigste Eintrag ist
 * adjustedPrices auf null - siehe Modulkopf.
 */
function freePlanCapabilities(overrides) {
  return Capabilities.declare(PROVIDER_ID, Object.assign({
    plan: "free",
    market: {
      historicalDaily: true,
      daily: true,
      /* Diese vier sind der Grund, warum Tiingo hier ueberhaupt untersucht
         wird. Alle vier stehen auf null, bis sie an echten Daten belegt
         sind - die Antwortform ist bekannt, ihr Verhalten nicht. */
      adjustedPrices: null,
      splitAdjustedPrices: null,
      splits: null,
      dividends: null,

      intraday: null,          // IEX, Verfuegbarkeit im Free-Tarif offen
      historicalIntraday: null,
      realtime: null,
      websocket: null,
      delayed: null,
      symbolSearch: null,
      marketStatus: false,     // kein entsprechender Endpunkt bekannt
      bulkQuotes: null
    },
    fundamental: {
      /* Tiingo bietet Fundamentaldaten an, aber sie sind nicht Gegenstand
         dieser Phase und im Free-Tarif eingeschraenkt. Ungeprueft, nicht
         ausgeschlossen. */
      annual: null, quarterly: null, asReported: null, standardized: null,
      pointInTime: null, restatements: null, filingDates: null,
      delistedSecurities: null, historicalUniverse: null
    },
    reference: { securityMaster: true, exchanges: null, isin: null, delisted: null },
    limits: FREE_LIMITS,
    notes: {
      adjustedPrices:
        "Tiingo liefert adjOpen/adjHigh/adjLow/adjClose/adjVolume neben den unbereinigten " +
        "Werten. Sekundaerquellen berichten, die Bereinigung umfasse Splits UND Dividenden - " +
        "das waere TOTAL_RETURN nach price-adjustment-v1.json. Zugesichert ist es nicht. " +
        "Nachweis fuehrt scripts/market/verify-tiingo-adjustment.mjs an einem bekannten Split " +
        "und einem bekannten Dividendenstichtag.",
      splits:
        "splitFactor steht je Handelstag in der Kursreihe (1 = kein Split). Ein eigener " +
        "Ereignis-Endpunkt existiert zusaetzlich. Ob der Free-Tarif ihn freigibt, ist offen.",
      dividends:
        "divCash steht je Handelstag in der Kursreihe (0 = keine Ausschuettung).",
      intraday:
        "IEX-Daten sind laut Anbieter im Free-Tarif fuer nicht-anzeigende Nutzung enthalten. " +
        "Was das konkret zulaesst, ist eine Lizenz- und keine technische Frage - siehe " +
        "MarketDataDisplayPolicy.",
      requestsPerHour:
        "50 Anfragen pro Stunde sind der eigentliche Engpass, nicht die 1000 pro Tag. " +
        "Ein Erstimport muss das Stundenfenster einplanen."
    }
  }, overrides || {}));
}

function commercialPlanCapabilities(overrides) {
  const base = freePlanCapabilities();
  return Capabilities.declare(PROVIDER_ID, Object.assign({
    plan: "commercial",
    /* Bewusst dieselben Faehigkeiten wie im Free-Tarif: ein hoeheres
       Kontingent macht aus einer ungepruefte Faehigkeit keine gepruefte.
       Was der kostenpflichtige Zugang zusaetzlich kann, gehoert hier erst
       hinein, wenn es jemand nachgesehen hat. */
    market: base.sets.market,
    fundamental: base.sets.fundamental,
    reference: base.sets.reference,
    limits: COMMERCIAL_LIMITS,
    notes: Object.assign({}, base.notes, {
      plan: "Nur die Kontingente unterscheiden sich. Faehigkeiten sind unveraendert " +
            "uebernommen und muessen fuer diesen Tarif erneut geprueft werden."
    })
  }, overrides || {}));
}

/* --------------------------------------------------------------- Adapter */

function createTiingoProvider(options) {
  options = options || {};
  const apiKey = options.apiKey || null;
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const capabilities = options.capabilities || freePlanCapabilities();
  const symbols = options.symbolRegistry || null;

  const client = MarketClient.createMarketClient({
    providerId: PROVIDER_ID,
    fetchImpl: options.fetchImpl || null,
    now: options.now,
    sleep: options.sleep,
    limits: Object.assign({}, capabilities.limits || FREE_LIMITS, options.limits || {}),
    ttl: Object.assign({
      /* Tageshistorie aendert sich einmal taeglich nach Boersenschluss.
         Sie stundenlang erneut abzurufen verbrennt genau das Kontingent,
         das der Erstimport braucht. */
      dailyBars: 6 * 3600e3,
      historicalBars: 30 * 24 * 3600e3,
      corporateActions: 24 * 3600e3,
      intradayBars: 60e3,
      quote: 30e3,
      symbolSearch: 24 * 3600e3,
      metadata: 30 * 24 * 3600e3
    }, options.ttl || {})
  });

  /* Der Schluessel geht in den Header, nicht in die URL. Damit verraet ihn
     auch eine vollstaendig protokollierte Anfrage-URL nicht. */
  function headers() {
    return apiKey
      ? { "Content-Type": "application/json", "Authorization": "Token " + apiKey }
      : { "Content-Type": "application/json" };
  }

  function url(endpointPath, params) {
    const query = new URLSearchParams(params || {});
    const q = query.toString();
    return baseUrl + endpointPath + (q ? "?" + q : "");
  }

  function notConfigured(what) {
    return {
      available: false, data: null, reason: "notConfigured",
      message: "Kein Tiingo-Zugang konfiguriert (" + what + "). Es wird nichts abgerufen und " +
               "ausdruecklich NICHT auf Demo-Daten zurueckgefallen."
    };
  }

  /* Tiingo meldet Fehler mit passendem HTTP-Status und einem detail-Feld.
     Anders als Twelve Data kommen sie nicht mit HTTP 200. */
  function detectError(body) {
    if (!body || typeof body !== "object") return null;
    if (body.detail && !Array.isArray(body)) {
      return { status: 400, message: String(body.detail) };
    }
    return null;
  }

  function detectSeriesError(body) {
    const known = detectError(body);
    if (known) return known;
    if (!Array.isArray(body)) {
      return { status: 502, message: "Antwort ist keine Kursreihe (Array erwartet)." };
    }
    return null;
  }

  /**
   * Welche Bereinigungsstufe traegt eine Reihe dieses Zugangs?
   *
   * Faellt bewusst auf die strengere Stufe zurueck, solange die Faehigkeit
   * ungeprueft ist. Eine Reihe faelschlich als TOTAL_RETURN auszuweisen
   * waere schlimmer, als eine brauchbare Reihe zu niedrig einzustufen: das
   * eine kostet eine Kennzahl, das andere erzeugt eine falsche.
   */
  function seriesAdjustmentStatus() {
    if (Capabilities.supports(capabilities, "market", "adjustedPrices")) return "adjusted";
    if (Capabilities.supports(capabilities, "market", "splitAdjustedPrices")) return "splitAdjusted";
    return "unknown";
  }

  function resolveSymbol(securityId) {
    if (!symbols) return { resolved: true, symbol: securityId };
    return symbols.toProvider(PROVIDER_ID, securityId);
  }

  function num(v) {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Tiingo-Zeile -> kanonische PriceBar.
   *
   * Der Kern der Phase: raw und adjusted bleiben getrennt erhalten, und die
   * Kapitalmassnahme des Tages faehrt mit. Wer spaeter fragt, ob eine Reihe
   * hochgestuft werden kann, findet die Antwort in splitFactor und dividend -
   * nicht in einer Annahme.
   */
  function toPriceBar(securityId, row, currency, status) {
    const close = num(row.close);
    if (close === null) return null;
    const date = String(row.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    /* adjustedClose traegt nur dann einen Wert, wenn die Bereinigung als
       Total Return bestaetigt ist. Solange sie ungeprueft ist, bleibt das
       Feld leer - die Rohwerte stehen daneben und gehen nicht verloren. */
    const trusted = status === "adjusted";

    return {
      securityId: securityId,
      date: date,
      open: num(row.open),
      high: num(row.high),
      low: num(row.low),
      close: close,
      volume: num(row.volume) === null ? 0 : num(row.volume),

      adjustedOpen:   num(row.adjOpen),
      adjustedHigh:   num(row.adjHigh),
      adjustedLow:    num(row.adjLow),
      adjustedClose:  trusted ? num(row.adjClose) : null,
      adjustedVolume: num(row.adjVolume),

      /* 1 und 0 heissen "an diesem Tag ist nichts passiert" - ein Befund,
         kein fehlender Wert. Nur wenn das Feld ganz fehlt, ist es null. */
      splitFactor: row.splitFactor === undefined ? null : num(row.splitFactor),
      dividend:    row.divCash === undefined ? null : num(row.divCash),

      adjustmentStatus: status,
      currency: currency || "USD",
      dataSourceId: DATA_SOURCE_ID
    };
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  /**
   * asOf ist der Stichtag, auf den sich die Daten beziehen.
   *
   * Bei einer Kursreihe ist das der letzte enthaltene Handelstag. Bei
   * Stammdaten und Kapitalmassnahmen gibt es keinen solchen Tag - dort ist
   * es der Abrufzeitpunkt, denn genau das sagt die Angabe aus: dies ist der
   * Stand, den wir zu diesem Zeitpunkt kannten. Ein leeres Feld waere hier
   * keine Vorsicht, sondern eine fehlende Auskunft.
   */
  function provenance(asOf, adjustmentStatus) {
    return Schema.makeProvenance({
      provider: PROVIDER_ID,
      source: "Tiingo",
      asOf: asOf || today(),
      ingestedAt: new Date().toISOString(),
      dataSnapshotId: "live_" + PROVIDER_ID + "_" + (asOf || "now"),
      isMock: false,
      adjustmentStatus: adjustmentStatus
    });
  }

  function toEnvelope(res, asOf, status) {
    if (!res || res.ok !== true) {
      return {
        available: false, data: null,
        reason: (res && res.reason) || "requestFailed",
        message: (res && res.message) || "Abruf fehlgeschlagen.",
        status: (res && res.status) || null
      };
    }
    return {
      available: true, data: res.data,
      provenance: provenance(asOf, status),
      fromCache: !!res.fromCache, stale: !!res.stale,
      latencyMs: res.latencyMs || null
    };
  }

  /* ------------------------------------------------------------ Interface */

  const api = {
    providerId: PROVIDER_ID,
    capabilities: capabilities,
    isMock: false,

    /** Welche Bereinigung dieser Zugang liefert. */
    adjustmentStatus: seriesAdjustmentStatus,

    /**
     * Tageskurse. Die Kernmethode dieser Phase.
     *
     * @param {string} securityId
     * @param {object} opts {from, to}
     */
    getDailyBars: function (securityId, opts) {
      opts = opts || {};
      if (!apiKey) return Promise.resolve(notConfigured("Tageskurse"));
      if (Capabilities.explicitlyMissing(capabilities, "market", "historicalDaily")) {
        return Promise.resolve(Capabilities.capabilityMissing(PROVIDER_ID, "market", "historicalDaily"));
      }
      const mapping = resolveSymbol(securityId);
      if (!mapping.resolved) {
        return Promise.resolve({ available: false, data: null, reason: "symbolUnmapped",
                                 message: mapping.reason });
      }

      const status = seriesAdjustmentStatus();
      const params = { format: "json" };
      if (opts.from) params.startDate = opts.from;
      if (opts.to) params.endDate = opts.to;
      if (opts.resampleFreq) params.resampleFreq = opts.resampleFreq;

      return client.request({
        kind: opts.from ? "historicalBars" : "dailyBars",
        url: url("/tiingo/daily/" + encodeURIComponent(mapping.symbol) + "/prices", params),
        params: params,
        headers: headers(),
        detectError: detectSeriesError,
        /* Ein Historienabruf ueber 20 Jahre darf laenger warten als eine
           Kursabfrage - er laeuft in einem Importlauf, nicht in einer
           Oberflaeche. */
        maxWaitMs: opts.maxWaitMs || 65000,
        parse: function (body) {
          const bars = body.map((r) => toPriceBar(securityId, r, opts.currency, status))
                           .filter(Boolean);
          bars.sort((a, b) => (a.date < b.date ? -1 : 1));
          return {
            securityId: securityId,
            providerSymbol: mapping.symbol,
            currency: opts.currency || "USD",
            adjustmentStatus: status,
            bars: bars
          };
        }
      }).then((res) => toEnvelope(res, res.ok && res.data.bars.length
        ? res.data.bars[res.data.bars.length - 1].date : null, status));
    },

    /** Vollstaendige Historie. Gleicher Endpunkt, anderer Zeitraum. */
    getHistoricalBars: function (securityId, opts) {
      return api.getDailyBars(securityId, Object.assign({ from: "1990-01-01" }, opts || {}));
    },

    /** Stammdaten eines Titels: Name, Boerse, Zeitraum der Historie. */
    getMetadata: function (securityId) {
      if (!apiKey) return Promise.resolve(notConfigured("Stammdaten"));
      const mapping = resolveSymbol(securityId);
      if (!mapping.resolved) {
        return Promise.resolve({ available: false, data: null, reason: "symbolUnmapped",
                                 message: mapping.reason });
      }
      return client.request({
        kind: "metadata",
        url: url("/tiingo/daily/" + encodeURIComponent(mapping.symbol)),
        headers: headers(),
        detectError: detectError,
        parse: function (body) {
          return {
            securityId: securityId,
            providerSymbol: body.ticker || mapping.symbol,
            name: body.name || null,
            exchange: body.exchangeCode || null,
            description: body.description || null,
            startDate: body.startDate || null,
            endDate: body.endDate || null
          };
        }
      }).then((res) => toEnvelope(res, null, null));
    },

    /**
     * Intraday-Bars ueber IEX.
     *
     * Ob der kostenlose Zugang das freigibt, ist ungeprueft. Bei einer
     * ungepruefte Faehigkeit wird die Anfrage trotzdem gestellt - das ist
     * die einzige Art, sie zu pruefen. Bei einer ausdruecklich fehlenden
     * nicht.
     */
    getIntradayBars: function (securityId, opts) {
      opts = opts || {};
      if (!apiKey) return Promise.resolve(notConfigured("Intraday-Kurse"));
      if (Capabilities.explicitlyMissing(capabilities, "market", "intraday")) {
        return Promise.resolve(Capabilities.capabilityMissing(PROVIDER_ID, "market", "intraday",
          "Fuer Intraday-Daten ist ein anderer Zugang noetig."));
      }
      const mapping = resolveSymbol(securityId);
      if (!mapping.resolved) {
        return Promise.resolve({ available: false, data: null, reason: "symbolUnmapped",
                                 message: mapping.reason });
      }
      const params = { resampleFreq: opts.interval || "5min", format: "json" };
      if (opts.from) params.startDate = opts.from;
      if (opts.to) params.endDate = opts.to;

      return client.request({
        kind: "intradayBars",
        url: url("/iex/" + encodeURIComponent(mapping.symbol) + "/prices", params),
        params: params,
        headers: headers(),
        detectError: detectSeriesError,
        parse: function (body) {
          return {
            securityId: securityId,
            interval: params.resampleFreq,
            bars: body.map((r) => ({
              securityId: securityId,
              timestamp: r.date,
              open: num(r.open), high: num(r.high), low: num(r.low), close: num(r.close),
              volume: num(r.volume) === null ? 0 : num(r.volume),
              currency: "USD",
              dataSourceId: DATA_SOURCE_ID
            }))
          };
        }
      }).then((res) => toEnvelope(res, null, "raw"));
    },

    /** Letzter Kurs ueber IEX. */
    getQuote: function (securityId) {
      if (!apiKey) return Promise.resolve(notConfigured("Kursabfrage"));
      const mapping = resolveSymbol(securityId);
      if (!mapping.resolved) {
        return Promise.resolve({ available: false, data: null, reason: "symbolUnmapped",
                                 message: mapping.reason });
      }
      return client.request({
        kind: "quote",
        url: url("/iex/" + encodeURIComponent(mapping.symbol)),
        headers: headers(),
        detectError: detectSeriesError,
        parse: function (body) {
          const row = Array.isArray(body) ? body[0] : body;
          if (!row) return null;
          return {
            securityId: securityId,
            providerSymbol: row.ticker || mapping.symbol,
            last: num(row.last),
            previousClose: num(row.prevClose),
            open: num(row.open), high: num(row.high), low: num(row.low),
            volume: num(row.volume) === null ? 0 : num(row.volume),
            timestamp: row.timestamp || null,
            currency: "USD",
            dataSourceId: DATA_SOURCE_ID
          };
        }
      }).then((res) => toEnvelope(res, null, "raw"));
    },

    /**
     * Kapitalmassnahmen.
     *
     * Tiingo fuehrt splitFactor und divCash in der Kursreihe selbst. Diese
     * Methode liest sie von dort ab, statt einen eigenen Endpunkt zu
     * verlangen: die Daten sind ohnehin da, und ein zweiter Abruf kostet im
     * Stundenkontingent genauso viel wie ein erster.
     */
    getCorporateActions: function (securityId, opts) {
      opts = opts || {};
      if (!apiKey) return Promise.resolve(notConfigured("Kapitalmassnahmen"));

      return api.getDailyBars(securityId, { from: opts.from || "1990-01-01", to: opts.to })
        .then(function (res) {
          if (!res.available) return res;
          const actions = [];
          for (const bar of res.data.bars) {
            if (bar.splitFactor !== null && bar.splitFactor !== 1) {
              actions.push({
                actionId: "tiingo_split_" + securityId + "_" + bar.date,
                securityId: securityId,
                type: "split",
                exDate: bar.date,
                /* Tiingo nennt kein Ankuendigungsdatum. Das Ex-Datum als
                   announcedAt zu setzen waere eine Behauptung ueber
                   Point-in-Time-Verfuegbarkeit, die hier niemand pruefen
                   kann - deshalb bleibt es das Ex-Datum, und der Vermerk
                   sagt es. */
                announcedAt: bar.date,
                ratio: bar.splitFactor,
                notes: "Aus splitFactor der Kursreihe abgeleitet. Kein Ankuendigungsdatum " +
                       "verfuegbar; announcedAt entspricht dem Ex-Datum.",
                dataSourceId: DATA_SOURCE_ID
              });
            }
            if (bar.dividend !== null && bar.dividend > 0) {
              actions.push({
                actionId: "tiingo_div_" + securityId + "_" + bar.date,
                securityId: securityId,
                type: "dividend",
                exDate: bar.date,
                announcedAt: bar.date,
                amount: bar.dividend,
                currency: bar.currency,
                notes: "Aus divCash der Kursreihe abgeleitet. Kein Ankuendigungsdatum verfuegbar.",
                dataSourceId: DATA_SOURCE_ID
              });
            }
          }
          const bars = res.data.bars;
          return {
            available: true, data: actions,
            provenance: provenance(bars.length ? bars[bars.length - 1].date : null,
                                   res.data.adjustmentStatus),
            fromCache: !!res.fromCache
          };
        });
    },

    healthCheck: function () {
      if (!apiKey) {
        return Provider.makeHealth("not_configured", {
          provider: PROVIDER_ID,
          message: "Kein TIINGO_API_KEY gesetzt. Der Adapter stellt keine Anfragen."
        });
      }
      const h = client.health();
      const map = { available: "ok", degraded: "degraded", offline: "unavailable",
                    quotaExceeded: "degraded", authError: "unavailable",
                    notConfigured: "not_configured" };
      return Provider.makeHealth(map[h.status] || "degraded", {
        provider: PROVIDER_ID,
        message: h.message || ("Status: " + h.status),
        quota: h.quota
      });
    },

    /* Diagnose. Traegt bewusst keinen Bezug zu Zugangsdaten. */
    stats: function () { return client.stats(); },
    quota: function () { return client.quota(); },
    rawHealth: function () { return client.health(); },
    clearCache: function () { return client.clearCache(); }
  };

  return api;
}

module.exports = {
  PROVIDER_ID,
  DATA_SOURCE_ID,
  DEFAULT_BASE_URL,
  FREE_LIMITS,
  COMMERCIAL_LIMITS,
  freePlanCapabilities,
  commercialPlanCapabilities,
  createTiingoProvider
};
