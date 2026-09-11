/* =========================================================================
   VISION UNIVERSE DISCOVER — contract.js

   Der isolierte Discover-Datenvertrag (§13 des Auftrags).

   Warum ein eigener Contract und nicht der bestehende Security-Schema-
   Eintrag aus quant/engines/schema.js: der beschreibt ein Wertpapier mit
   Fundamentaldaten und Point-in-Time-Historie. Eine Discovery Card
   beschreibt einen ZUSTAND ("ist gerade auf einem Jahreshoch") und braucht
   dafuer Felder, die es dort nicht gibt - und keines der Felder, die dort
   zaehlen. Zwei Vertraege, weil es zwei Fragen sind. Der bestehende bleibt
   unveraendert.

   DIE WICHTIGSTE REGEL DIESER DATEI

   Jedes Feld hat einen Wert UND einen Status. Ein fehlender Kurs ist nicht
   `0` und nicht `null` ohne Erklaerung, sondern:

     CALCULATED               aus Daten gerechnet
     WITHHELD_REDISTRIBUTION  vorhanden, aber nicht auslieferbar
     SOURCE_MISSING           die Quelle liefert es nicht
     INSUFFICIENT_HISTORY     zu wenig Historie fuer diese Kennzahl
     NOT_APPLICABLE           fuer dieses Instrument sinnlos

   Das ist keine Formalie. In diesem Repository bleiben absolute Kursniveaus
   realer Titel nach der Redistributionsregel zurueck; eine Card, die
   deshalb "0,00 $" zeigte, waere eine Falschaussage. Der Status ist der
   Grund, warum die Oberflaeche stattdessen etwas anderes zeigen kann.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var CONTRACT_VERSION = "discover-contract-1.0.0";

  var FIELD_STATUS = [
    "CALCULATED", "WITHHELD_REDISTRIBUTION", "SOURCE_MISSING",
    "INSUFFICIENT_HISTORY", "NOT_APPLICABLE"
  ];

  var DATA_MODES = ["real", "mock"];

  var SIGNALS = [
    "new52WeekHigh", "nearHigh", "marketLeader", "momentumLeader",
    "relativeStrengthLeader", "breakout", "trendIntact", "sectorLeader"
  ];

  var METRICS = [
    "distanceTo52wHigh", "distanceTo52wLow", "return1M", "return3M", "return6M",
    "return12M", "return12M1M", "momentumAcceleration", "relativeStrength1M",
    "relativeStrength3M", "relativeStrength6M", "relativeStrength12M",
    "volatility252d", "maxDrawdown252d", "volumeRatio20over60", "volumeSpikeRatio",
    "trendAlignment", "leadershipScore", "momentumScore", "relativeStrengthScore",
    "breakoutScore", "leadershipPercentile", "momentumPercentile",
    "relativeStrengthPercentile"
  ];

  /* Technical-Intelligence-Zustaende (§7). Bewusst dieselben vier Worte wie
     im Auftrag: die Oberflaeche soll sagen koennen "wird berechnet" oder
     "geringe Konfidenz", ohne dass daraus eine Zaehlung erfunden wird. */
  var TI_STATUS = ["unavailable", "calculating", "available", "lowConfidence"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Ein Feld mit Wert und Status.
   * value darf null sein - dann MUSS der Status erklaeren, warum.
   */
  function field(value, status) {
    if (value === undefined) value = null;
    if (!status) status = isNum(value) || typeof value === "boolean" ? "CALCULATED" : "SOURCE_MISSING";
    if (FIELD_STATUS.indexOf(status) === -1) {
      throw new Error("discover/contract: unbekannter Feldstatus " + status);
    }
    if (value !== null && status !== "CALCULATED") {
      /* Ein Wert mit einem Nicht-CALCULATED-Status ist ein Widerspruch:
         entweder er ist da, dann ist er gerechnet, oder er fehlt. */
      throw new Error("discover/contract: Feld traegt Wert und Status " + status);
    }
    return { value: value, status: status };
  }

  function valueOf(f) {
    if (f === null || f === undefined) return null;
    if (typeof f === "object" && "value" in f) return f.value;
    return f;
  }

  function statusOf(f) {
    if (f === null || f === undefined) return "SOURCE_MISSING";
    if (typeof f === "object" && "status" in f) return f.status;
    return isNum(f) || typeof f === "boolean" ? "CALCULATED" : "SOURCE_MISSING";
  }

  /**
   * Der Discover-Datensatz eines Titels.
   *
   * @param {object} raw
   * @returns {object} normalisiert, mit festen Feldern
   */
  function normalizeStock(raw) {
    raw = raw || {};
    var out = {
      contractVersion: CONTRACT_VERSION,
      symbol: String(raw.symbol || raw.ticker || "").toUpperCase(),
      securityId: raw.securityId || null,
      companyName: raw.companyName || null,
      companyNameStatus: raw.companyName ? "CALCULATED" : (raw.companyNameStatus || "SOURCE_MISSING"),
      universeId: raw.universeId || null,
      dataMode: DATA_MODES.indexOf(raw.dataMode) === -1 ? "mock" : raw.dataMode,
      isMock: raw.dataMode !== "real",
      provider: raw.provider || null,
      exchange: raw.exchange || null,
      currency: raw.currency || "USD",
      sector: raw.sector || null,
      sectorStatus: raw.sectorStatus || (raw.sector ? "CURATED" : "SOURCE_MISSING"),
      industry: raw.industry || null,
      marketCap: raw.marketCap === undefined ? null : raw.marketCap,
      capBucket: raw.capBucket || null,
      /* Preis und Tagesveraenderung sind die beiden Felder, die in diesem
         Repository fuer reale Titel regelmaessig NICHT ausgeliefert werden
         duerfen. Sie tragen deshalb immer ihren Status mit. */
      price: raw.price && typeof raw.price === "object" ? raw.price : field(raw.price, raw.priceStatus),
      changePercent: raw.changePercent && typeof raw.changePercent === "object"
        ? raw.changePercent : field(raw.changePercent, raw.changePercentStatus),
      sparkline: Array.isArray(raw.sparkline) ? raw.sparkline : null,
      sparklineStatus: Array.isArray(raw.sparkline) ? "CALCULATED"
        : (raw.sparklineStatus || "SOURCE_MISSING"),
      hasPriceSeries: !!raw.hasPriceSeries,
      signals: {},
      metrics: {},
      metricStatus: {},
      badges: Array.isArray(raw.badges) ? raw.badges : [],
      dataQuality: raw.dataQuality || null,
      dataQualityReason: raw.dataQualityReason || null,
      asOf: raw.asOf || null,
      updatedAt: raw.updatedAt || null
    };

    SIGNALS.forEach(function (s) {
      out.signals[s] = (raw.signals && raw.signals[s] === true) || false;
    });

    var metrics = raw.metrics || {};
    var status = raw.metricStatus || {};
    METRICS.forEach(function (m) {
      var v = metrics[m];
      out.metrics[m] = isNum(v) ? v : null;
      out.metricStatus[m] = isNum(v) ? "CALCULATED"
        : (status[m] && FIELD_STATUS.indexOf(status[m]) !== -1 ? status[m] : "SOURCE_MISSING");
    });

    return out;
  }

  /**
   * Prueft einen normalisierten Datensatz. Wirft beim ersten Verstoss -
   * ein halb gueltiger Datensatz, der es bis in die Oberflaeche schafft,
   * kostet mehr als ein fehlgeschlagener Build.
   */
  function assertStock(stock) {
    if (!stock || typeof stock !== "object") throw new Error("discover/contract: kein Objekt");
    if (!/^[A-Z0-9.\-]{1,12}$/.test(stock.symbol || "")) {
      throw new Error("discover/contract: ungueltiges Symbol " + JSON.stringify(stock.symbol));
    }
    if (DATA_MODES.indexOf(stock.dataMode) === -1) {
      throw new Error("discover/contract: unbekannter dataMode " + stock.dataMode);
    }
    if (stock.dataMode === "real" && stock.isMock !== false) {
      throw new Error("discover/contract: " + stock.symbol + " ist real und zugleich als Mock markiert");
    }
    [["price", stock.price], ["changePercent", stock.changePercent]].forEach(function (pair) {
      var f = pair[1];
      if (!f || typeof f !== "object" || !("value" in f) || !("status" in f)) {
        throw new Error("discover/contract: " + pair[0] + " ohne Wert/Status-Paar");
      }
      if (f.value !== null && f.status !== "CALCULATED") {
        throw new Error("discover/contract: " + pair[0] + " traegt Wert mit Status " + f.status);
      }
      if (f.value === null && f.status === "CALCULATED") {
        throw new Error("discover/contract: " + pair[0] + " ohne Wert, aber Status CALCULATED");
      }
    });
    METRICS.forEach(function (m) {
      var v = stock.metrics[m];
      var st = stock.metricStatus[m];
      if (v !== null && st !== "CALCULATED") {
        throw new Error("discover/contract: Metrik " + m + " traegt Wert mit Status " + st);
      }
      if (v === null && st === "CALCULATED") {
        throw new Error("discover/contract: Metrik " + m + " ohne Wert, aber Status CALCULATED");
      }
    });
    /* Ein Signal ohne die Kennzahl, aus der es entsteht, waere eine
       Behauptung. Die beiden teuersten pruefen wir direkt. */
    if (stock.signals.new52WeekHigh && stock.metrics.distanceTo52wHigh === null) {
      throw new Error("discover/contract: " + stock.symbol + " meldet neues 52-Wochen-Hoch ohne Abstandskennzahl");
    }
    if (stock.signals.marketLeader && stock.metrics.leadershipScore === null) {
      throw new Error("discover/contract: " + stock.symbol + " meldet Market Leader ohne Leadership Score");
    }
    return stock;
  }

  /** Die schlanke Form fuer Zeilen-Payloads: kein Feld, das die Card nicht zeigt. */
  function toCard(stock) {
    return {
      symbol: stock.symbol,
      companyName: stock.companyName,
      dataMode: stock.dataMode,
      sector: stock.sector,
      exchange: stock.exchange,
      marketCap: stock.marketCap,
      capBucket: stock.capBucket,
      price: stock.price,
      changePercent: stock.changePercent,
      sparkline: stock.sparkline,
      sparklineStatus: stock.sparklineStatus,
      signals: stock.signals,
      metrics: stock.metrics,
      metricStatus: stock.metricStatus,
      badges: stock.badges,
      dataQuality: stock.dataQuality,
      asOf: stock.asOf
    };
  }

  var api = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    FIELD_STATUS: FIELD_STATUS, DATA_MODES: DATA_MODES,
    SIGNALS: SIGNALS, METRICS: METRICS, TI_STATUS: TI_STATUS,
    field: field, valueOf: valueOf, statusOf: statusOf,
    normalizeStock: normalizeStock, assertStock: assertStock, toCard: toCard
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Contract = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
