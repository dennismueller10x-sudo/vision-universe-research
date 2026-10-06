/* =========================================================================
   VISION UNIVERSE TECHNICAL — canonical-bars.js
   CANONICAL BAR MODEL + CORPORATE ACTION NORMALIZATION

   Die eine Stelle, an der aus Providerdaten kanonische Kursreihen werden.
   Kein technischer Engine-Code kennt ein Vendor-Feld; alles Weitere rechnet
   auf CanonicalBarSeries.

   Drei Kurswelten (price-adjustment-v1.json):
     RAW             tatsaechliche Prints            Audit, Execution-Replay
     SPLIT_ADJUSTED  multiplikativ um Splits normiert PRIMAERE technische Serie
     TOTAL_RETURN    Splits + Dividenden reinvestiert Performance, TR-Momentum

   Das bestehende Schema (schema.js PriceBar) liefert close = RAW und
   adjustedClose = TOTAL_RETURN. SPLIT_ADJUSTED existierte bisher nicht und
   wird hier aus RAW + Split-Corporate-Actions abgeleitet: jeder Kurs vor
   einem Split wird durch das Produkt der spaeteren Split-Ratios geteilt,
   das Volumen entsprechend multipliziert.

   Serien sind spaltenorientiert (Arrays je Feld): billig zu hashen, zu
   schneiden und zu serialisieren. toBars() liefert bei Bedarf Zeilen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;

  var MODEL_VERSION = "canonical-bars-1.0.0";
  var PRICE_SERIES_TYPES = ["RAW", "SPLIT_ADJUSTED", "TOTAL_RETURN"];
  var SESSION_TYPES = ["REGULAR", "EXTENDED", "AGGREGATED"];
  var TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"];

  /* Pflichtfelder einer CanonicalBar (Zeilenform). */
  var BAR_FIELDS = [
    "instrumentId", "exchange", "timestamp", "timeframe",
    "open", "high", "low", "close", "volume",
    "currency", "sessionType", "priceSeriesType",
    "source", "sourceRevision", "adjustmentFactor", "corporateActionFlags", "dataVersion"
  ];

  var COLUMNS = ["timestamps", "open", "high", "low", "close", "volume", "adjustmentFactor", "corporateActionFlags"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /** Erzeugt eine leere/gefuellte Serie aus Spec + Spalten. */
  function createSeries(spec, columns) {
    spec = spec || {};
    columns = columns || {};
    var n = (columns.timestamps || []).length;
    var s = {
      modelVersion: MODEL_VERSION,
      instrumentId: spec.instrumentId || null,
      exchange: spec.exchange || "UNKNOWN",
      currency: spec.currency || "USD",
      timeframe: spec.timeframe || "1D",
      priceSeriesType: spec.priceSeriesType || "RAW",
      sessionType: spec.sessionType || "REGULAR",
      source: spec.source || "unknown",
      sourceRevision: spec.sourceRevision || null,
      dataVersion: spec.dataVersion || null,
      dataHash: null,
      length: n,
      timestamps: columns.timestamps || [],
      open: columns.open || [],
      high: columns.high || [],
      low: columns.low || [],
      close: columns.close || [],
      volume: columns.volume || [],
      adjustmentFactor: columns.adjustmentFactor || fill(n, 1),
      corporateActionFlags: columns.corporateActionFlags || fill(n, null),
      meta: spec.meta || {}
    };
    s.dataHash = computeDataHash(s);
    if (!s.dataVersion) s.dataVersion = "dv_" + s.dataHash.slice(0, 12);
    return s;
  }

  function fill(n, v) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = v; return a; }

  /** Hash ueber Spalten + Semantik. Aendert sich, sobald eine Bar anders ist. */
  function computeDataHash(s) {
    return Hash.hashValue({
      instrumentId: s.instrumentId, timeframe: s.timeframe, priceSeriesType: s.priceSeriesType,
      sessionType: s.sessionType, source: s.source, sourceRevision: s.sourceRevision,
      timestamps: s.timestamps, open: s.open, high: s.high, low: s.low, close: s.close, volume: s.volume,
      adjustmentFactor: s.adjustmentFactor
    });
  }

  /** Strukturelle Validierung. Liefert Fehler, erfindet nichts. */
  function validateSeries(s) {
    var errors = [];
    if (!s || typeof s !== "object") return { valid: false, errors: ["no series"] };
    if (PRICE_SERIES_TYPES.indexOf(s.priceSeriesType) === -1) errors.push("priceSeriesType unbekannt: " + s.priceSeriesType);
    if (SESSION_TYPES.indexOf(s.sessionType) === -1) errors.push("sessionType unbekannt: " + s.sessionType);
    if (TIMEFRAMES.indexOf(s.timeframe) === -1) errors.push("timeframe unbekannt: " + s.timeframe);
    COLUMNS.forEach(function (c) {
      if (!Array.isArray(s[c])) errors.push("Spalte fehlt: " + c);
      else if (s[c].length !== s.length) errors.push("Spalte " + c + " hat " + s[c].length + " statt " + s.length + " Werte");
    });
    if (errors.length) return { valid: false, errors: errors };
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && !(s.timestamps[i] > s.timestamps[i - 1])) { errors.push("timestamps nicht streng aufsteigend bei " + i); break; }
      var o = s.open[i], h = s.high[i], l = s.low[i], c = s.close[i];
      if (!isNum(o) || !isNum(h) || !isNum(l) || !isNum(c)) { errors.push("nicht-numerischer Kurs bei " + s.timestamps[i]); break; }
      if (h < Math.max(o, c) - 1e-9 || l > Math.min(o, c) + 1e-9) { errors.push("OHLC inkonsistent bei " + s.timestamps[i]); break; }
      if (c <= 0 || l <= 0) { errors.push("nicht-positiver Kurs bei " + s.timestamps[i]); break; }
      if (s.volume[i] !== null && !(isNum(s.volume[i]) && s.volume[i] >= 0)) { errors.push("Volumen ungueltig bei " + s.timestamps[i]); break; }
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /** Validiert eine einzelne CanonicalBar (Zeilenform) gegen die Pflichtfelder. */
  function validateBar(bar) {
    var errors = [];
    BAR_FIELDS.forEach(function (f) { if (!(f in bar)) errors.push("Feld fehlt: " + f); });
    return { valid: errors.length === 0, errors: errors };
  }

  /** Zeilenform — fuer Validierung, Export, AI-Tools. */
  function toBars(s, from, to) {
    var out = [];
    from = from || 0; to = to === undefined ? s.length - 1 : to;
    for (var i = from; i <= to; i++) {
      out.push({
        instrumentId: s.instrumentId, exchange: s.exchange, timestamp: s.timestamps[i], timeframe: s.timeframe,
        open: s.open[i], high: s.high[i], low: s.low[i], close: s.close[i], volume: s.volume[i],
        currency: s.currency, sessionType: s.sessionType, priceSeriesType: s.priceSeriesType,
        source: s.source, sourceRevision: s.sourceRevision,
        adjustmentFactor: s.adjustmentFactor[i], corporateActionFlags: s.corporateActionFlags[i] || [],
        dataVersion: s.dataVersion
      });
    }
    return out;
  }

  /**
   * Generischer Adapter fuer deklarierte OHLCV-Zeilen ({date|timestamp, open,
   * high, low, close, volume}). Die Bereinigungsstufe wird DEKLARIERT, nicht
   * geraten (spec.priceSeriesType). Kein Vendor-Feld wird durchgereicht.
   */
  function fromRows(rows, spec) {
    var cols = { timestamps: [], open: [], high: [], low: [], close: [], volume: [], adjustmentFactor: [], corporateActionFlags: [] };
    var sorted = rows.slice().sort(function (a, b) {
      var ta = a.timestamp || a.date, tb = b.timestamp || b.date; return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    sorted.forEach(function (r) {
      var t = r.timestamp || r.date;
      if (cols.timestamps.length && cols.timestamps[cols.timestamps.length - 1] === t) return; // Duplikat
      cols.timestamps.push(t);
      cols.open.push(+r.open); cols.high.push(+r.high); cols.low.push(+r.low); cols.close.push(+r.close);
      cols.volume.push(isNum(+r.volume) ? +r.volume : null);
      cols.adjustmentFactor.push(isNum(r.adjustmentFactor) ? r.adjustmentFactor : 1);
      cols.corporateActionFlags.push(Array.isArray(r.corporateActionFlags) ? r.corporateActionFlags : null);
    });
    return createSeries(spec, cols);
  }

  /**
   * Aus schema.js-PriceBars (close = RAW, adjustedClose = TOTAL_RETURN) plus
   * Corporate Actions entstehen die drei Kurswelten.
   *
   * SPLIT_ADJUSTED: Kurs_t / Π(ratio aller Splits mit exDate > date_t),
   * Volumen_t * Π(...). Vor einem 4:1-Split werden alle Kurse geviertelt —
   * der Split verschwindet aus der Preisgeometrie, bleibt aber als Flag.
   *
   * TOTAL_RETURN-OHL werden proportional aus dem TR-Faktor abgeleitet
   * (adjustedClose / close). Das ist eine Naeherung und wird als solche
   * markiert (meta.ohlcDerived) — Preislevel werden auf dieser Serie
   * ohnehin nie berechnet.
   */
  function fromPriceBars(bars, corporateActions, spec) {
    spec = spec || {};
    var sorted = bars.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var actions = (corporateActions || []).slice().sort(function (a, b) { return a.exDate < b.exDate ? -1 : 1; });
    var splits = actions.filter(function (a) { return a.type === "split" && isNum(a.ratio) && a.ratio > 0; });
    var flagsByDate = Object.create(null);
    actions.forEach(function (a) {
      var flag = a.type === "split" ? "SPLIT" : (a.type === "dividend" ? "DIVIDEND" : a.type === "special_dividend" ? "SPECIAL_DIVIDEND" : String(a.type).toUpperCase());
      (flagsByDate[a.exDate] = flagsByDate[a.exDate] || []).push(flag);
    });

    var n = sorted.length;
    var raw = { timestamps: [], open: [], high: [], low: [], close: [], volume: [], adjustmentFactor: [], corporateActionFlags: [] };
    var sa = { timestamps: [], open: [], high: [], low: [], close: [], volume: [], adjustmentFactor: [], corporateActionFlags: [] };
    var tr = { timestamps: [], open: [], high: [], low: [], close: [], volume: [], adjustmentFactor: [], corporateActionFlags: [] };
    var hasTR = true;

    /* Kumulierter Split-Faktor rueckwaerts: Produkt der Ratios aller Splits
       NACH der jeweiligen Bar. */
    var factor = new Array(n);
    var acc = 1, si = splits.length - 1;
    for (var i = n - 1; i >= 0; i--) {
      while (si >= 0 && splits[si].exDate > sorted[i].date) { acc *= splits[si].ratio; si--; }
      factor[i] = acc;
    }

    for (var t = 0; t < n; t++) {
      var b = sorted[t];
      var flags = flagsByDate[b.date] || null;
      raw.timestamps.push(b.date); raw.open.push(b.open); raw.high.push(b.high); raw.low.push(b.low); raw.close.push(b.close);
      raw.volume.push(isNum(b.volume) ? b.volume : null); raw.adjustmentFactor.push(1); raw.corporateActionFlags.push(flags);

      var f = factor[t];
      sa.timestamps.push(b.date);
      sa.open.push(round6(b.open / f)); sa.high.push(round6(b.high / f)); sa.low.push(round6(b.low / f)); sa.close.push(round6(b.close / f));
      sa.volume.push(isNum(b.volume) ? Math.round(b.volume * f) : null);
      sa.adjustmentFactor.push(f); sa.corporateActionFlags.push(flags);

      if (!isNum(b.adjustedClose) || b.adjustedClose <= 0) hasTR = false;
      var trf = hasTR ? b.adjustedClose / b.close : 1;
      tr.timestamps.push(b.date);
      tr.open.push(round6(b.open * trf)); tr.high.push(round6(b.high * trf)); tr.low.push(round6(b.low * trf)); tr.close.push(hasTR ? round6(b.adjustedClose) : null);
      tr.volume.push(isNum(b.volume) ? b.volume : null); tr.adjustmentFactor.push(trf); tr.corporateActionFlags.push(flags);
    }

    var base = {
      instrumentId: spec.instrumentId || (sorted[0] && sorted[0].securityId) || null,
      exchange: spec.exchange || "UNKNOWN", currency: spec.currency || (sorted[0] && sorted[0].currency) || "USD",
      timeframe: "1D", sessionType: "REGULAR",
      source: spec.source || (sorted[0] && sorted[0].dataSourceId) || "unknown",
      sourceRevision: spec.sourceRevision || null
    };
    var out = {
      RAW: createSeries(Object.assign({}, base, { priceSeriesType: "RAW" }), raw),
      SPLIT_ADJUSTED: createSeries(Object.assign({}, base, { priceSeriesType: "SPLIT_ADJUSTED",
        meta: { splitsApplied: splits.map(function (s) { return { exDate: s.exDate, ratio: s.ratio }; }) } }), sa),
      TOTAL_RETURN: hasTR
        ? createSeries(Object.assign({}, base, { priceSeriesType: "TOTAL_RETURN", meta: { ohlcDerived: true } }), tr)
        : null,
      corporateActions: actions.map(function (a) { return { type: a.type, exDate: a.exDate, ratio: a.ratio, amount: a.amount }; })
    };
    if (!hasTR) out.totalReturnUnavailableReason = "adjustedClose fehlt oder ungueltig — TOTAL_RETURN nicht ableitbar";
    return out;
  }

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  /** Index der letzten Bar mit timestamp <= ts (-1, wenn keine). */
  function indexAtOrBefore(s, ts) {
    var lo = 0, hi = s.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (s.timestamps[mid] <= ts) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  /**
   * Schneidet die Serie kausal bis einschliesslich Index/Timestamp.
   * Genau hier entsteht Walk-Forward-Sicherheit: die Engines bekommen die
   * geschnittene Serie und koennen spaetere Bars nicht sehen.
   * dataVersion bleibt (dieselbe Datenrevision), dataHash wird neu berechnet.
   */
  function slice(s, cutoff) {
    var end = typeof cutoff === "number" ? cutoff : indexAtOrBefore(s, cutoff);
    if (end < 0) end = -1;
    var cols = {};
    COLUMNS.forEach(function (c) { cols[c] = s[c].slice(0, end + 1); });
    var out = createSeries({
      instrumentId: s.instrumentId, exchange: s.exchange, currency: s.currency, timeframe: s.timeframe,
      priceSeriesType: s.priceSeriesType, sessionType: s.sessionType, source: s.source,
      sourceRevision: s.sourceRevision, dataVersion: s.dataVersion,
      meta: Object.assign({}, s.meta, { slicedFrom: s.dataHash, cutoffIndex: end })
    }, cols);
    return out;
  }

  /** Kopie mit veraenderten Bars = neue Datenrevision (neuer dataVersion). */
  function revise(s, patches, sourceRevision) {
    var cols = {};
    COLUMNS.forEach(function (c) { cols[c] = s[c].slice(); });
    (patches || []).forEach(function (p) {
      var i = typeof p.index === "number" ? p.index : indexAtOrBefore(s, p.timestamp);
      if (i < 0) return;
      ["open", "high", "low", "close", "volume"].forEach(function (k) { if (isNum(p[k])) cols[k][i] = p[k]; });
    });
    return createSeries({
      instrumentId: s.instrumentId, exchange: s.exchange, currency: s.currency, timeframe: s.timeframe,
      priceSeriesType: s.priceSeriesType, sessionType: s.sessionType, source: s.source,
      sourceRevision: sourceRevision || ((s.sourceRevision || "rev") + "+1"),
      meta: Object.assign({}, s.meta, { revisedFrom: s.dataVersion })
    }, cols);
  }

  /** Nur Serialisierung: nichts Neues, nur Spalten + Spec. */
  function serialize(s) {
    var o = {};
    Object.keys(s).forEach(function (k) { o[k] = s[k]; });
    return o;
  }
  function deserialize(o) {
    var cols = {};
    COLUMNS.forEach(function (c) { cols[c] = o[c]; });
    var s = createSeries(o, cols);
    if (o.dataVersion) s.dataVersion = o.dataVersion;
    return s;
  }

  var api = {
    MODEL_VERSION: MODEL_VERSION,
    PRICE_SERIES_TYPES: PRICE_SERIES_TYPES, SESSION_TYPES: SESSION_TYPES, TIMEFRAMES: TIMEFRAMES,
    BAR_FIELDS: BAR_FIELDS, COLUMNS: COLUMNS,
    createSeries: createSeries, computeDataHash: computeDataHash,
    validateSeries: validateSeries, validateBar: validateBar, toBars: toBars,
    fromRows: fromRows, fromPriceBars: fromPriceBars,
    indexAtOrBefore: indexAtOrBefore, slice: slice, revise: revise,
    serialize: serialize, deserialize: deserialize
  };

  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.CanonicalBars = api; }
})(typeof window !== "undefined" ? window : globalThis);
