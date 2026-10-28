/* =========================================================================
   VISION UNIVERSE - split-evidence-supplements.js

   BELEGTE SPLITS, DIE DER ANBIETER NICHT FUEHRT

   Der splitFactor des Anbieters ist die eine Quelle der Split-Bereinigung
   (ADR-002). Fehlt dort ein Split, der in den SEC-Originalen steht (PZZA,
   2:1 als Aktiendividende, Ex-Tag 2013-12-30), springt die bereinigte
   Reihe um den Faktor. Diese Datei liefert solche Splits als
   Daten - einzeln benannt, mit Accession, URL, sha256 und woertlichem
   Zitat (quant/config/split-evidence-supplements.json).

   Sie rechnet NICHTS. Ob und wo ein Eintrag wirkt, entscheidet allein
   quant/engines/return-series.js#splitFactors (supplementPlan) - damit
   bleibt es bei genau einer Ableitung der Splitfaktoren.

   Im Browser ist diese Datei nicht geladen; dort wirkt kein Eintrag
   (return-series.js faellt dann auf "keine Ergaenzung" zurueck). Die
   veroeffentlichten Reihen entstehen in Node.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var SCHEMA = "split-evidence-supplements-1.0.0";
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
  var SHA256 = /^[0-9a-f]{64}$/;
  var SEC_URL = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.\-]+$/;
  var SECURITY_ID = /^ref_[A-Z0-9_]{1,24}$/;

  function isDate(v) {
    if (typeof v !== "string" || !DATE.test(v)) return false;
    var d = new Date(v + "T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  }
  function weekday(v) { var n = new Date(v + "T00:00:00Z").getUTCDay(); return n >= 1 && n <= 5; }

  /**
   * Prueft die Datei vollstaendig. `identity` (core/identity.js) ist
   * optional; ist es da, muss securityId genau die aus dem Ticker sein
   * (ADR-001, keine eigene "ref_"-Bildung).
   */
  function validate(config, identity) {
    var errors = [];
    if (!config || config.schemaVersion !== SCHEMA) errors.push("SCHEMA_VERSION");
    if (!config || !Number.isInteger(config.version) || config.version < 1) errors.push("VERSION");
    if (!config || !Array.isArray(config.entries)) return { valid: false, errors: errors.concat(["ENTRIES_MISSING"]) };
    var seenId = {}, seenEvent = {};
    config.entries.forEach(function (e, i) {
      var at = ":" + i;
      if (!e || typeof e !== "object") { errors.push("ENTRY_INVALID" + at); return; }
      if (typeof e.id !== "string" || !/^[A-Z0-9][A-Z0-9.\-]{3,60}$/.test(e.id)) errors.push("ID_INVALID" + at);
      else if (seenId[e.id]) errors.push("DUPLICATE_ID:" + e.id);
      else seenId[e.id] = true;
      if (typeof e.ticker !== "string" || !/^[A-Z0-9.\-]{1,12}$/.test(e.ticker)) errors.push("TICKER_INVALID" + at);
      if (typeof e.securityId !== "string" || !SECURITY_ID.test(e.securityId)) errors.push("SECURITY_ID_INVALID" + at);
      else if (identity && typeof e.ticker === "string" && identity.securityIdForTicker(e.ticker) !== e.securityId) errors.push("SECURITY_ID_NOT_FROM_IDENTITY" + at);
      if (typeof e.cik !== "string" || !/^\d{10}$/.test(e.cik)) errors.push("CIK_INVALID" + at);
      /* Nur Vorwaertssplits/Aktiendividenden > 1 und Zusammenlegungen < 1, nie 1, nie <= 0. */
      if (typeof e.ratio !== "number" || !Number.isFinite(e.ratio) || e.ratio <= 0 || e.ratio === 1) errors.push("RATIO_INVALID" + at);
      ["recordDate", "payableDate", "exDate", "verifiedAt"].forEach(function (k) { if (!isDate(e[k])) errors.push(k.toUpperCase() + "_INVALID" + at); });
      if (isDate(e.exDate) && !weekday(e.exDate)) errors.push("EX_DATE_NOT_WEEKDAY" + at);
      if (isDate(e.recordDate) && isDate(e.payableDate) && !(e.recordDate <= e.payableDate)) errors.push("RECORD_AFTER_PAYABLE" + at);
      /* Ex-Tag nach FINRA/UPC 11140(b)(2) (>= 25 %): nach dem Zahltag, hoechstens 4 Kalendertage (Wochenende + Feiertag). */
      if (isDate(e.payableDate) && isDate(e.exDate)) {
        var gap = (Date.parse(e.exDate) - Date.parse(e.payableDate)) / 864e5;
        if (!(gap >= 1 && gap <= 4)) errors.push("EX_DATE_NOT_AFTER_PAYABLE" + at);
      }
      if (isDate(e.verifiedAt) && isDate(e.exDate) && !(e.verifiedAt > e.exDate)) errors.push("VERIFIED_BEFORE_EVENT" + at);
      if (typeof e.exDateBasis !== "string" || e.exDateBasis.length < 20) errors.push("EX_DATE_BASIS_MISSING" + at);
      if (!Array.isArray(e.evidence) || !e.evidence.length) errors.push("EVIDENCE_MISSING" + at);
      else e.evidence.forEach(function (d, j) {
        var dt = at + "." + j;
        if (!d || typeof d.accession !== "string" || !ACCESSION.test(d.accession)) errors.push("ACCESSION_INVALID" + dt);
        else if (typeof d.url !== "string" || !SEC_URL.test(d.url)) errors.push("URL_INVALID" + dt);
        else if (d.url.indexOf("/" + d.accession.replace(/-/g, "") + "/") < 0) errors.push("URL_NOT_OF_ACCESSION" + dt);
        else if (typeof e.cik === "string" && d.url.indexOf("/edgar/data/" + String(Number(e.cik)) + "/") < 0) errors.push("URL_NOT_OF_CIK" + dt);
        if (!d || typeof d.sha256 !== "string" || !SHA256.test(d.sha256)) errors.push("SHA256_INVALID" + dt);
        if (!d || typeof d.quote !== "string" || d.quote.length < 40) errors.push("QUOTE_MISSING" + dt);
        if (!d || !isDate(d.filed)) errors.push("FILED_INVALID" + dt);
        else if (isDate(e.verifiedAt) && d.filed > e.verifiedAt) errors.push("FILED_AFTER_VERIFICATION" + dt);
      });
      if (typeof e.securityId === "string" && isDate(e.exDate)) {
        var key = e.securityId + "|" + e.exDate;
        if (seenEvent[key]) errors.push("DUPLICATE_EVENT:" + key);
        seenEvent[key] = true;
      }
    });
    return { valid: errors.length === 0, errors: errors };
  }

  /** securityId -> Eintraege (nach Ex-Tag). Wirft bei ungueltiger Datei: eine kaputte Ergaenzung wirkt nie still. */
  function index(config, identity) {
    var v = validate(config, identity);
    if (!v.valid) throw new Error("SPLIT_EVIDENCE_SUPPLEMENTS_INVALID:" + v.errors.join(","));
    var map = {};
    config.entries.forEach(function (e) { (map[e.securityId] = map[e.securityId] || []).push(e); });
    Object.keys(map).forEach(function (k) { map[k].sort(function (a, b) { return a.exDate < b.exDate ? -1 : 1; }); });
    return map;
  }

  var DEFAULT = null, DEFAULT_INDEX = {};
  if (isNode) {
    DEFAULT = require("../config/split-evidence-supplements.json");
    DEFAULT_INDEX = index(DEFAULT, require("../../core/identity.js"));
  }

  /** Eintraege einer Wertpapier-ID aus der versionierten Datei (oder aus `idx`, fuer Tests). */
  function forSecurity(securityId, idx) {
    var map = idx || DEFAULT_INDEX;
    return (securityId && map[securityId]) ? map[securityId] : [];
  }

  var api = { SCHEMA: SCHEMA, validate: validate, index: index, forSecurity: forSecurity, config: DEFAULT };
  if (isNode) module.exports = api;
  else global.VUSplitEvidenceSupplements = api;
})(typeof window !== "undefined" ? window : globalThis);
