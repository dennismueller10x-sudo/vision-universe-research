/* =========================================================================
   VISION UNIVERSE TECHNICAL — screener-contract.js (AP2)

   Maschinenlesbarer Datenvertrag fuer technical/data/screener-v1.json,
   meta.json und index-v1.json. Grundlage fuer Frontend, DQ und Tests;
   Dokumentation: docs/technical/DATA_CONTRACT.md (Spaltentabelle aus
   diesem Modul erzeugt, scripts/technical/contract-doc.mjs).

   Je Spalte: Typ, ob null erlaubt ist, Wertebereich, Enum-Werte (aus dem
   Abfragekatalog), Ganzzahl. Dazu spaltenuebergreifende Regeln:
     - "Tage seit" < Pruefraum, belegter Wert nur mit Pruefraum;
     - fresh => asOf = Stichtag; frozenSince => nicht fresh;
     - Daten nie nach dem Stichtag; Formationsliste als Tupel.
   Unbekannte oder fehlende Spalten sind Verstoesse: eine neue Spalte
   braucht einen Vertragseintrag (bewusste Entscheidung, Doku).

   Reine Pruefung, kein I/O. UMD: globalThis.VUTechnical.ScreenerContract
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Q = isNode ? require("./technical-query.js") : global.VUTechnical.Query;

  var CONTRACT_VERSION = "technical-screener-contract-1.1.0";
  var SCHEMAS = { screener: /^vu-technical-screener-1\./, meta: /^vu-technical-meta-1\./, index: /^vu-technical-index-1\./ };
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  /* Wertebereiche der Abfragefelder (alle Zeitrahmen). Ohne Eintrag: endliche Zahl. pct = Anteil (0,05 = 5 %). */
  var RANGES = {
    rsi14: [0, 100], stochK: [0, 100], mfi14: [0, 100], adx: [0, 100], choppiness14: [0, 100], connorsRsi: [0, 100],
    williamsR: [-100, 0], aroonOsc: [-100, 100], cmf20: [-1, 1], elderImpulse: [-1, 1],
    /* ATR % und relatives Volumen sind nach oben offen: Reverse-Split-Ketten (WHLR: Wochenschluss 402.408 -> 0,357 in
       70 Wochen, split-bereinigt) und Volumen-Median 0 ergeben echte, extreme Werte. */
    atrPct: [0, Infinity], relVol: [0, Infinity], ulcer14: [0, Infinity], histVol20: [0, Infinity], close: [0, Infinity],
    distHigh52w: [-1, 0], distHigh200w: [-1, 0],
    chg1d: [-1, Infinity], distSma200: [-1, Infinity], sma200Slope21: [-1, Infinity], distSma50: [-1, Infinity], distEma200: [-1, Infinity], distChandelierLong: [-1, Infinity],
    roc21: [-1, Infinity], roc63: [-1, Infinity], roc126: [-1, Infinity], roc252: [-1, Infinity]
  };
  var INTEGER = { elderImpulse: 1, aroonOsc: 1 };
  var FORMATION_STATES = { DETECTED: 1, CONFIRMED: 1 };

  /* Spalten ausserhalb des Abfragekatalogs. */
  var EXTRA = {
    s: { type: "string", nullable: false, label: "Kürzel (eindeutig)" },
    n: { type: "string", nullable: true, label: "Name" },
    sid: { type: "string", nullable: false, label: "securityId (core/identity.js)" },
    asOf: { type: "date", nullable: false, label: "letzter Bar des Titels" },
    bars: { type: "int", nullable: false, range: [1, Infinity], label: "Tagesbars im Analysefenster" },
    weeks: { type: "int", nullable: false, range: [0, Infinity], label: "Wochenschlüsse (lange Reihe)" },
    spark: { type: "spark", nullable: false, label: "letzte ≤ 60 Schlüsse, 0..99 normiert" },
    suspectJumpAt: { type: "date", nullable: true, label: "jüngster Kurssprung mit Datenverdacht (60 Bars)" },
    formations: { type: "formations", nullable: true, label: "aktive Formationen [Typ, Zustand, erkannt, Ausbruchstag, Richtung, Kennzeichen]" },
    distSma50: { type: "pct", nullable: true, range: [-1, Infinity], label: "Abstand zur SMA 50 (nur Anzeige)" },
    frozenSince: { type: "date", nullable: true, optional: true, label: "erster Tag des unveränderten Schlusskurses im Fenster der Tagesbars (Datenqualitätshinweis, ab screen-row 1.10.0)" }
  };

  /** Spezifikation aller Spalten: { key: { type, nullable, range?, values?, integer?, window?, label, field? } } */
  function columns() {
    var out = {};
    Q.FIELDS.forEach(function (f) {
      f.tfs.forEach(function (tf) {
        var key = Q.columnKey(f.id, tf), spec = { field: f.id, tf: tf, label: Q.labelOf(f, tf), nullable: f.id !== "fresh" && f.id !== "hasVolume" };
        if (f.kind === "bool") spec.type = "bool";
        else if (f.kind === "enum") {
          spec.type = f.id === "structure" ? "enum" : "enumList";
          spec.values = Object.keys(f.values).concat(Object.keys(f.legacyValues || {}));
        } else {
          spec.type = f.window ? "int" : f.kind === "pct" ? "pct" : "num";
          if (RANGES[f.id]) spec.range = RANGES[f.id];
          if (f.window) { spec.range = [0, Infinity]; spec.window = tf === "1D" ? f.window : f.window + "@" + tf; }
          if (INTEGER[f.id]) spec.integer = true;
        }
        out[key] = spec;
      });
      if (f.window) f.tfs.forEach(function (tf) {
        var wk = tf === "1D" ? f.window : f.window + "@" + tf;
        if (!out[wk]) out[wk] = { type: "int", nullable: true, range: [1, Infinity], label: "Prüfraum in " + { "1D": "Handelstagen", "1W": "Wochen", "1M": "Monaten" }[tf] };
      });
    });
    Object.keys(EXTRA).forEach(function (k) { out[k] = EXTRA[k]; });
    return out;
  }

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function valueError(spec, v, asOf) {
    if (v === null || v === undefined) return spec.nullable ? null : "NULL";
    switch (spec.type) {
      case "bool": return typeof v === "boolean" ? null : "TYPE";
      case "string": return typeof v === "string" && v.length ? null : "TYPE";
      case "date": return typeof v === "string" && DATE.test(v) ? (asOf && v > asOf ? "AFTER_ASOF" : null) : "TYPE";
      case "enum": return typeof v === "string" ? (spec.values.indexOf(v) >= 0 ? null : "ENUM") : "TYPE";
      case "enumList":
        if (!Array.isArray(v)) return "TYPE";
        for (var i = 0; i < v.length; i++) if (spec.values.indexOf(v[i]) < 0) return "ENUM";
        return v.length === new Set(v).size ? null : "DUPLICATE";
      case "spark":
        if (!Array.isArray(v) || v.length > 60) return "TYPE";
        for (var j = 0; j < v.length; j++) if (!(Number.isInteger(v[j]) && v[j] >= 0 && v[j] <= 99)) return "RANGE";
        return null;
      case "formations":
        if (!Array.isArray(v)) return "TYPE";
        for (var k = 0; k < v.length; k++) {
          var x = v[k];
          if (!Array.isArray(x) || x.length !== 6 || !Q.FORMATION_TYPES[x[0]] || !FORMATION_STATES[x[1]] || !DATE.test(x[2] || "")) return "FORMATION";
          if (asOf && x[2] > asOf) return "AFTER_ASOF";
          if (x[3] !== null && (!DATE.test(x[3]) || x[3] < x[2] || (asOf && x[3] > asOf))) return "FORMATION_BREAKOUT";
          if (x[4] !== null && x[4] !== "UP" && x[4] !== "DOWN") return "FORMATION";
          if (typeof x[5] !== "string" || !/^B?V?O?$/.test(x[5])) return "FORMATION";
        }
        return null;
      default: {
        if (!isNum(v)) return "TYPE";
        if ((spec.type === "int" || spec.integer) && !Number.isInteger(v)) return "INTEGER";
        var r = spec.range;
        return r && (v < r[0] || v > r[1]) ? "RANGE" : null;
      }
    }
  }

  /**
   * Prueft screener-v1.json (und optional meta/index) gegen den Vertrag.
   * @returns {{ ok, contract, checked, errors: [{code, column, ticker?, value?}], counts: Object<code, n> }}
   * errors ist je Code und Spalte auf 5 Beispiele begrenzt; counts zaehlt alle.
   */
  function check(artifact, meta, index) {
    var errors = [], counts = {}, seen = {};
    function bad(code, column, ticker, value) {
      counts[code] = (counts[code] || 0) + 1;
      var k = code + "|" + column;
      seen[k] = (seen[k] || 0) + 1;
      if (seen[k] <= 5) errors.push({ code: code, column: column, ticker: ticker === undefined ? null : ticker, value: value === undefined ? null : value });
    }
    if (!artifact || !artifact.cols || !Array.isArray(artifact.cols.s)) { bad("NO_ARTIFACT", "*"); return result(); }
    var cols = artifact.cols, n = cols.s.length, spec = columns(), asOf = artifact.asOf;
    if (!SCHEMAS.screener.test(artifact.schemaVersion || "")) bad("SCHEMA", "schemaVersion", null, artifact.schemaVersion);
    if (!DATE.test(asOf || "")) bad("ASOF", "asOf", null, asOf);
    if (artifact.count !== n) bad("COUNT", "count", null, artifact.count);
    ["row", "query", "indicators", "formations"].forEach(function (k) { if (!artifact.versions || typeof artifact.versions[k] !== "string") bad("VERSIONS", "versions." + k); });
    Object.keys(cols).forEach(function (k) {
      if (!spec[k]) bad("UNKNOWN_COLUMN", k);
      if (!Array.isArray(cols[k]) || cols[k].length !== n) bad("LENGTH", k);
    });
    Object.keys(spec).forEach(function (k) { if (!cols[k] && !spec[k].optional) bad("MISSING_COLUMN", k); });
    var tickers = {};
    for (var i = 0; i < n; i++) {
      var tk = cols.s[i], rowAsOf = cols.asOf ? cols.asOf[i] : null;
      if (tickers[tk]) bad("DUPLICATE_TICKER", "s", tk); tickers[tk] = 1;
      Object.keys(cols).forEach(function (k) {
        if (!spec[k] || !Array.isArray(cols[k])) return;
        var e = valueError(spec[k], cols[k][i], k === "asOf" ? asOf : rowAsOf || asOf);
        if (e) bad(e, k, tk, cols[k][i]);
        var w = spec[k].window;
        if (w && cols[w] && isNum(cols[k][i])) {
          if (!isNum(cols[w][i])) bad("DAYS_WITHOUT_WINDOW", k, tk, cols[k][i]);
          else if (cols[k][i] >= cols[w][i]) bad("DAYS_OUTSIDE_WINDOW", k, tk, cols[k][i]);
        }
      });
      if (cols.fresh && cols.fresh[i] === true && rowAsOf !== asOf) bad("FRESH_NOT_ON_ASOF", "fresh", tk, rowAsOf);
      if (cols.frozenSince && cols.frozenSince[i] && cols.fresh && cols.fresh[i] !== false) bad("FROZEN_BUT_FRESH", "frozenSince", tk, cols.frozenSince[i]);
    }
    if (meta) {
      if (!SCHEMAS.meta.test(meta.schemaVersion || "")) bad("SCHEMA", "meta.schemaVersion", null, meta.schemaVersion);
      if (meta.asOf !== asOf) bad("META_ASOF", "meta.asOf", null, meta.asOf);
      if (!meta.counts || meta.counts.rows !== n) bad("META_COUNT", "meta.counts.rows");
      else {
        var fresh = cols.fresh ? cols.fresh.filter(function (x) { return x === true; }).length : null;
        if (fresh !== null && (meta.counts.fresh !== fresh || meta.counts.stale !== n - fresh)) bad("META_COUNT", "meta.counts.fresh");
      }
      if (JSON.stringify(meta.versions) !== JSON.stringify(artifact.versions)) bad("META_VERSIONS", "meta.versions");
    }
    if (index) {
      if (!SCHEMAS.index.test(index.schemaVersion || "")) bad("SCHEMA", "index.schemaVersion", null, index.schemaVersion);
      if (index.asOf !== asOf) bad("INDEX_ASOF", "index.asOf", null, index.asOf);
      if (!Array.isArray(index.s) || index.count !== index.s.length) bad("INDEX_COUNT", "index.count");
      else index.s.forEach(function (t) { if (!tickers[t]) bad("INDEX_UNKNOWN_TICKER", "index.s", t); });
    }
    return result();
    function result() {
      return { ok: errors.length === 0, contract: CONTRACT_VERSION, checked: artifact && artifact.cols && artifact.cols.s ? artifact.cols.s.length : 0, errors: errors, counts: counts };
    }
  }

  var api = { CONTRACT_VERSION: CONTRACT_VERSION, SCHEMAS: SCHEMAS, RANGES: RANGES, EXTRA: EXTRA, columns: columns, check: check, valueError: valueError };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ScreenerContract = api; }
})(typeof window !== "undefined" ? window : globalThis);
