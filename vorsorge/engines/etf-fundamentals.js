/* =========================================================================
   VISION UNIVERSE VORSORGE — etf-fundamentals.js   (UMD: Node + Browser)

   KANONISCHER FONDSDATEN-VERTRAG (ETF_FUNDAMENTALS_SCHEMA_VERSION 2.0.0)

   Ein Datensatz je Share Class. Jedes wichtige Feld traegt seine Herkunft:
     { value, unit, source, sourceType, sourceUrl, asOf, retrievedAt,
       confidence, originalField, originalValue }

   Einheiten (verbindlich, damit nichts verrutscht):
     ter, ongoingCharges, expenseRatio, managementFee   Dezimalbruch (0.002 = 0,20 %)
     aum, nav                                           Betrag in aumCurrency / navCurrency
   TER, Ongoing Charges, Expense Ratio und Management Fee sind VERSCHIEDENE
   Felder und werden nie gleichgesetzt.

   Zusammenfuehren (merge): je Feld gewinnt die Quelle mit der hoeheren
   Quellenart (PRIMARY_ISSUER > REGULATORY > MARKET_DATA_PROVIDER > DERIVED
   > HEURISTIC > USER_INPUT), bei Gleichstand das juengere asOf. Abweichende
   Werte werden nicht verworfen, sondern als Konflikt gespeichert (mit
   Grund: anderes Datum oder echter Widerspruch).

   Bezeichner: ISIN (ISO 6166, Pruefziffer), CUSIP (Pruefziffer), SEDOL
   (Pruefziffer), WKN (6 Zeichen, nur aus offizieller Quelle - nie geraten).
   ========================================================================= */
(function (global) {
  "use strict";
  var SCHEMA = "2.0.0";

  var SOURCE_TYPES = ["PRIMARY_ISSUER", "REGULATORY", "MARKET_DATA_PROVIDER", "DERIVED", "HEURISTIC", "USER_INPUT"];
  var SOURCE_RANK = {}; SOURCE_TYPES.forEach(function (t, i) { SOURCE_RANK[t] = SOURCE_TYPES.length - i; });
  var CONFIDENCE = ["HIGH", "MEDIUM", "LOW"];

  var FIELDS = ["fundId", "shareClassId", "listingId", "name", "issuer", "isin", "wkn", "cusip", "sedol", "domicile", "ucits",
    "legalStructure", "assetClass", "category", "subCategory", "benchmarkName", "benchmarkIdentifier", "replicationMethod",
    "distributionPolicy", "distributionFrequency", "fundCurrency", "listingCurrency", "ter", "ongoingCharges", "expenseRatio",
    "netExpenseRatio", "managementFee", "aum", "aumLevel", "aumCurrency", "nav", "navCurrency", "inceptionDate",
    "shareClassInceptionDate", "listingDate", "exchange", "ticker", "countryOfListing", "hedged", "hedgedCurrency",
    "securitiesLending", "numberOfHoldings", "fundStatus"];
  /** Felder, die als Provenienz-Objekt gefuehrt werden (alle ausser den reinen Schluesseln). */
  var KEY_FIELDS = ["fundId", "shareClassId", "listingId"];

  var ENUMS = {
    replicationMethod: ["PHYSICAL", "FULL_REPLICATION", "OPTIMIZED_SAMPLING", "SYNTHETIC", "SWAP_BASED", "UNKNOWN"],
    distributionPolicy: ["ACCUMULATING", "DISTRIBUTING", "UNKNOWN"],
    distributionFrequency: ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "IRREGULAR", "NONE", "UNKNOWN"],
    ucits: [true, false, "UNKNOWN"],
    aumLevel: ["FUND", "SHARE_CLASS", "UNKNOWN"],
    fundStatus: ["ACTIVE", "CLOSED", "LIQUIDATING", "LIQUIDATED", "MERGED", "UNKNOWN"]
  };

  /* --------------------------------------------------------- Bezeichner */
  function charVal(c) { var d = c.charCodeAt(0); return d >= 48 && d <= 57 ? d - 48 : d - 55; }
  /** ISIN: 2 Buchstaben Land, 9 alphanumerisch, Pruefziffer (Luhn ueber die Ziffernfolge). */
  function isValidIsin(s) {
    s = String(s || "").toUpperCase().trim();
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return false;
    var digits = s.slice(0, 11).split("").map(function (c) { return String(charVal(c)); }).join("");
    var sum = 0, dbl = true;
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = +digits[i];
      if (dbl) { n *= 2; if (n > 9) n -= 9; }
      sum += n; dbl = !dbl;
    }
    return (10 - (sum % 10)) % 10 === +s[11];
  }
  function isValidCusip(s) {
    s = String(s || "").toUpperCase().trim();
    if (!/^[0-9A-Z*@#]{8}[0-9]$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 8; i++) {
      var c = s[i], v = /[0-9]/.test(c) ? +c : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : c === "*" ? 36 : c === "@" ? 37 : 38;
      if (i % 2 === 1) v *= 2;
      sum += Math.floor(v / 10) + (v % 10);
    }
    return (10 - (sum % 10)) % 10 === +s[8];
  }
  function isValidSedol(s) {
    s = String(s || "").toUpperCase().trim();
    if (!/^[0-9BCDFGHJKLMNPQRSTVWXYZ]{6}[0-9]$/.test(s)) return false;
    var w = [1, 3, 1, 7, 3, 9], sum = 0;
    for (var i = 0; i < 6; i++) sum += charVal(s[i]) * w[i];
    return (10 - (sum % 10)) % 10 === +s[6];
  }
  /** WKN: sechs Zeichen, Ziffern und Grossbuchstaben ohne I und O. Formatpruefung - die Quelle muss offiziell sein. */
  function isValidWkn(s) { return /^[0-9A-HJ-NP-Z]{6}$/.test(String(s || "").toUpperCase().trim()); }
  function cleanId(kind, s) {
    if (s === null || s === undefined) return null;
    s = String(s).toUpperCase().replace(/\s+/g, "");
    if (!s || /^(-|N\/?A|NONE|NULL|0+)$/.test(s)) return null;
    var ok = kind === "isin" ? isValidIsin(s) : kind === "cusip" ? isValidCusip(s) : kind === "sedol" ? isValidSedol(s) : kind === "wkn" ? isValidWkn(s) : true;
    return ok ? s : null;
  }

  /* ------------------------------------------------------- Emittenten */
  var ISSUERS = [
    ["BLACKROCK", /\b(i ?shares|blackrock)\b/i],
    ["VANGUARD", /\bvanguard\b/i],
    ["AMUNDI", /\b(amundi|lyxor)\b/i],
    ["DWS", /\b(xtrackers|dws|db x-trackers)\b/i],
    ["STATE_STREET", /\b(spdr|state street|ssga)\b/i],
    ["INVESCO", /\b(invesco|powershares)\b/i],
    ["WISDOMTREE", /\bwisdom ?tree\b/i],
    ["UBS", /\bubs\b/i],
    ["JPMORGAN", /\b(j\.? ?p\.? ?morgan|jpmorgan)\b/i],
    ["FIDELITY", /\bfidelity\b/i],
    ["HSBC", /\bhsbc\b/i],
    ["VANECK", /\bvan ?eck\b/i],
    ["FRANKLIN_TEMPLETON", /\b(franklin|templeton)\b/i],
    ["BNP_PARIBAS", /\b(bnp|bnp paribas)\b/i],
    ["LEGAL_GENERAL", /\b(l&g|legal (and|&) general)\b/i],
    ["GLOBAL_X", /\bglobal ?x\b/i],
    ["FIRST_TRUST", /\bfirst trust\b/i],
    ["SCHWAB", /\bschwab\b/i],
    ["PROSHARES", /\bproshares\b/i],
    ["DIREXION", /\bdirexion\b/i],
    ["ARK", /\bark (invest|innovation|genomic|next|fintech|space|autonomous|21shares|israel|blockchain)/i],
    ["DIMENSIONAL", /\bdimensional\b/i],
    ["JANUS_HENDERSON", /\bjanus\b/i],
    ["PIMCO", /\bpimco\b/i],
    ["GOLDMAN_SACHS", /\bgoldman\b/i]
  ];
  function normalizeIssuer(text) {
    var t = String(text || "");
    for (var i = 0; i < ISSUERS.length; i++) if (ISSUERS[i][1].test(t)) return ISSUERS[i][0];
    return null;
  }

  /* ---------------------------------------------------- Normalisierung */
  /** Kosten in Dezimalbruch. unit: "percent" (0.20 = 0,20 %), "bps", "fraction". Ohne Einheit kein Raten. */
  function normalizeCost(raw, unit) {
    if (raw === null || raw === undefined || raw === "") return null;
    var s = String(raw).trim().replace(/\s/g, ""), hadPct = /%$/.test(s);
    s = s.replace(/%$/, "");
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    var v = Number(s);
    if (!Number.isFinite(v)) return null;
    var u = hadPct ? "percent" : unit;
    if (u === "percent") v = v / 100;
    else if (u === "bps") v = v / 10000;
    else if (u !== "fraction") return null;
    return v >= 0 && v < 0.1 ? Math.round(v * 1e7) / 1e7 : null;
  }
  function normalizeReplication(raw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return null;
    if (/swap|synthetic|synthetisch|indirect|indirekt|unfunded|funded swap/.test(s)) return /swap/.test(s) ? "SWAP_BASED" : "SYNTHETIC";
    if (/sampl|optimi|optimiert|stratified/.test(s)) return "OPTIMIZED_SAMPLING";
    if (/full|vollst|complete/.test(s)) return "FULL_REPLICATION";
    if (/physi|direct|direkt/.test(s)) return "PHYSICAL";
    return "UNKNOWN";
  }
  function normalizeDistribution(raw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return null;
    if (/\b(acc|accumulating|thesaur|capitali[sz]ation|capitalisation|reinvest)/.test(s)) return "ACCUMULATING";
    if (/\b(dist|distributing|aussch|income|inc\b|dividend)/.test(s)) return "DISTRIBUTING";
    return "UNKNOWN";
  }
  function normalizeFrequency(raw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return null;
    if (/month|monat/.test(s)) return "MONTHLY";
    if (/quarter|viertelj|quartal/.test(s)) return "QUARTERLY";
    if (/semi|halbj|half/.test(s)) return "SEMI_ANNUAL";
    if (/annual|jaehrl|jährl|yearly/.test(s)) return "ANNUAL";
    if (/none|keine|no distribution/.test(s)) return "NONE";
    return "UNKNOWN";
  }
  function normalizeUcits(raw) {
    if (raw === true || raw === false) return raw;
    var s = String(raw || "").toLowerCase().trim();
    if (/^(yes|ja|true|y|1|ucits)$/.test(s)) return true;
    if (/^(no|nein|false|n|0|non-ucits)$/.test(s)) return false;
    return "UNKNOWN";
  }
  function isoDate(raw) {
    if (!raw) return null;
    var s = String(raw).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + "-" + m[2] + "-" + m[3];
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) return m[3] + "-" + pad(m[2]) + "-" + pad(m[1]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return m[3] + "-" + pad(m[1]) + "-" + pad(m[2]); // US M/D/Y
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + "-" + m[2] + "-" + m[3];
    var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/)) && MON[m[1].toLowerCase()]) return m[3] + "-" + pad(MON[m[1].toLowerCase()]) + "-" + pad(m[2]);
    if ((m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{4})$/)) && MON[m[2].toLowerCase()]) return m[3] + "-" + pad(MON[m[2].toLowerCase()]) + "-" + pad(m[1]);
    return null;
  }
  function pad(n) { return (+n < 10 ? "0" : "") + (+n); }

  /* --------------------------------------------------------- Provenienz */
  /**
   * Ein Feld mit Herkunft. ctx: { source, sourceType, sourceUrl, asOf, retrievedAt, confidence, originalField, originalValue, unit }
   * Liefert null, wenn kein Wert vorliegt (fehlend bleibt fehlend).
   */
  function field(value, ctx) {
    if (value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value))) return null;
    ctx = ctx || {};
    var f = { value: value, source: ctx.source || null, sourceType: ctx.sourceType || null, sourceUrl: ctx.sourceUrl || null,
      asOf: ctx.asOf || null, retrievedAt: ctx.retrievedAt || null, confidence: ctx.confidence || "MEDIUM" };
    if (ctx.unit) f.unit = ctx.unit;
    if (ctx.originalField) f.originalField = ctx.originalField;
    if (ctx.originalValue !== undefined && ctx.originalValue !== value) f.originalValue = ctx.originalValue;
    return f;
  }
  function valueOf(f) { return f && typeof f === "object" && "value" in f ? f.value : f === undefined ? null : f; }

  function sameValue(k, a, b) {
    if (a === b) return true;
    if (typeof a === "number" && typeof b === "number") {
      if (/^(ter|ongoingCharges|expenseRatio|netExpenseRatio|managementFee)$/.test(k)) return Math.abs(a - b) < 0.00005;
      return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.01;
    }
    if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
    return false;
  }
  function better(a, b) {
    var ra = SOURCE_RANK[a.sourceType] || 0, rb = SOURCE_RANK[b.sourceType] || 0;
    if (ra !== rb) return ra > rb;
    return String(a.asOf || "") > String(b.asOf || "");
  }

  /**
   * Fuehrt mehrere Quell-Datensaetze (je { fields: { name: fieldObj } }) zu einem kanonischen Datensatz zusammen.
   * Liefert { record, conflicts }.
   */
  function merge(sources, keys) {
    var out = { schemaVersion: SCHEMA }, conflicts = [];
    KEY_FIELDS.forEach(function (k) { out[k] = keys && keys[k] || null; });
    FIELDS.forEach(function (k) {
      if (KEY_FIELDS.indexOf(k) >= 0) return;
      var cands = [];
      (sources || []).forEach(function (s) { var f = s && s.fields && s.fields[k]; if (f && f.value !== null && f.value !== undefined) cands.push(f); });
      if (!cands.length) { out[k] = null; return; }
      var best = cands[0];
      cands.forEach(function (c) { if (better(c, best)) best = c; });
      out[k] = best;
      cands.forEach(function (c) {
        if (c === best || sameValue(k, c.value, best.value)) return;
        conflicts.push({ field: k, chosen: { value: best.value, source: best.source, asOf: best.asOf },
          other: { value: c.value, source: c.source, asOf: c.asOf },
          reason: c.asOf && best.asOf && c.asOf !== best.asOf ? "AS_OF_DIFFERS" : "VALUE_CONFLICT" });
      });
    });
    out.missingFields = FIELDS.filter(function (k) { return KEY_FIELDS.indexOf(k) < 0 && out[k] === null; });
    out.conflicts = conflicts;
    return { record: out, conflicts: conflicts };
  }

  /** Prueft einen kanonischen Datensatz. Liefert Fehlerliste (leer = gueltig). */
  function validate(rec) {
    var e = [];
    if (!rec || rec.schemaVersion !== SCHEMA) e.push("SCHEMA_VERSION");
    if (!rec) return e;
    if (!rec.shareClassId) e.push("MISSING_shareClassId");
    var isin = valueOf(rec.isin), cusip = valueOf(rec.cusip), sedol = valueOf(rec.sedol), wkn = valueOf(rec.wkn);
    if (isin && !isValidIsin(isin)) e.push("INVALID_ISIN");
    if (cusip && !isValidCusip(cusip)) e.push("INVALID_CUSIP");
    if (sedol && !isValidSedol(sedol)) e.push("INVALID_SEDOL");
    if (wkn && !isValidWkn(wkn)) e.push("INVALID_WKN");
    ["ter", "ongoingCharges", "expenseRatio", "netExpenseRatio", "managementFee"].forEach(function (k) {
      var v = valueOf(rec[k]);
      if (v !== null && !(typeof v === "number" && v >= 0 && v < 0.1)) e.push("COST_OUT_OF_RANGE_" + k);
    });
    var aum = valueOf(rec.aum);
    if (aum !== null && !(typeof aum === "number" && aum >= 0)) e.push("AUM_INVALID");
    if (aum !== null && !valueOf(rec.aumCurrency)) e.push("AUM_WITHOUT_CURRENCY");
    Object.keys(ENUMS).forEach(function (k) {
      var v = valueOf(rec[k]);
      if (v !== null && ENUMS[k].indexOf(v) === -1) e.push("ENUM_" + k);
    });
    FIELDS.forEach(function (k) {
      var f = rec[k];
      if (KEY_FIELDS.indexOf(k) >= 0 || f === null || f === undefined) return;
      if (typeof f !== "object" || !("value" in f)) { e.push("NO_PROVENANCE_" + k); return; }
      if (!f.source) e.push("NO_SOURCE_" + k);
      if (f.sourceType && SOURCE_TYPES.indexOf(f.sourceType) === -1) e.push("BAD_SOURCE_TYPE_" + k);
      if (f.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(f.asOf)) e.push("BAD_AS_OF_" + k);
    });
    return e;
  }

  /** Abdeckung ueber eine Liste kanonischer Datensaetze: Anteil mit Wert je Feld. */
  function coverage(records, fields) {
    var n = (records || []).length, out = {};
    (fields || FIELDS).forEach(function (k) {
      var c = 0; (records || []).forEach(function (r) { if (valueOf(r[k]) !== null) c++; });
      out[k] = { count: c, ratio: n ? c / n : 0 };
    });
    return { total: n, fields: out };
  }

  /**
   * Kompakte Auslieferung ohne Informationsverlust (ETF-Detaildateien):
   * - Felder ohne Wert (null) und Herkunftsangaben mit null entfallen (fehlend = null),
   * - die Quell-URL steht einmal je Quelle in sourceUrls statt in jedem Feld.
   * expand() stellt das Fundamentals-2.0-Objekt wieder her.
   */
  function compact(fu) {
    if (!fu) return fu;
    var out = {}, urls = {};
    Object.keys(fu).forEach(function (k) {
      var v = fu[k];
      if (v === null || v === undefined) return;
      if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) {
        var o = {};
        Object.keys(v).forEach(function (kk) {
          var x = v[kk];
          if (x === null || x === undefined) return;
          if (kk === "sourceUrl" && v.source) { if (!(v.source in urls)) urls[v.source] = x; if (urls[v.source] === x) return; }
          o[kk] = x;
        });
        out[k] = o;
      } else out[k] = v;
    });
    if (Object.keys(urls).length) out.sourceUrls = urls;
    return out;
  }
  var PROV_KEYS = ["value", "source", "sourceType", "sourceUrl", "asOf", "retrievedAt", "confidence"];
  function expand(c) {
    if (!c) return c;
    var urls = c.sourceUrls || {}, out = {};
    Object.keys(c).forEach(function (k) {
      if (k === "sourceUrls") return;
      var v = c[k];
      if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) {
        var o = {}; PROV_KEYS.forEach(function (kk) { o[kk] = kk in v ? v[kk] : kk === "sourceUrl" ? (urls[v.source] || null) : null; });
        Object.keys(v).forEach(function (kk) { if (!(kk in o)) o[kk] = v[kk]; });
        out[k] = o;
      } else out[k] = v;
    });
    FIELDS.forEach(function (f) { if (!(f in out)) out[f] = null; });
    return out;
  }

  var api = { SCHEMA: SCHEMA, ETF_FUNDAMENTALS_SCHEMA_VERSION: SCHEMA, compact: compact, expand: expand, FIELDS: FIELDS, ENUMS: ENUMS, SOURCE_TYPES: SOURCE_TYPES, CONFIDENCE: CONFIDENCE,
    isValidIsin: isValidIsin, isValidCusip: isValidCusip, isValidSedol: isValidSedol, isValidWkn: isValidWkn, cleanId: cleanId,
    normalizeIssuer: normalizeIssuer, normalizeCost: normalizeCost, normalizeReplication: normalizeReplication,
    normalizeDistribution: normalizeDistribution, normalizeFrequency: normalizeFrequency, normalizeUcits: normalizeUcits, isoDate: isoDate,
    field: field, valueOf: valueOf, merge: merge, validate: validate, coverage: coverage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Fundamentals = api; }
})(typeof window !== "undefined" ? window : globalThis);
