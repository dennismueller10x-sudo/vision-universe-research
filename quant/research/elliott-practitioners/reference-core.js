/* =========================================================================
   VISION UNIVERSE RESEARCH (INTERN) — elliott-practitioners/reference-core.js

   Reine Logik ohne DOM für die interne Praktiker-Referenzseite
   (docs/technical-intelligence/PRACTITIONER_PROTOCOL.md, Schema
   practitioner-reference-1.2.0). Läuft im Browser (global VUPractitionerCore)
   und in Node (module.exports) — dadurch testbar.

   PRACTITIONER REFERENCE — keine objektive Wahrheit. Diese Datei erzeugt nur
   strukturierte Zeilen aus manueller Erfassung; sie ruft keine Quellen ab.

   Inhalt:
   * validateSchema(schema, value)  – kleiner JSON-Schema-Prüfer (genau die im
     Schema benutzten Schlüsselwörter: type, enum, required, properties,
     additionalProperties:false, items, $ref, minimum, minItems, maxLength,
     pattern, format:uri)
   * domainChecks(record, ctx)      – Protokollregeln (§2, §5, §7) als Fehler/Warnungen
   * computeCutoff(...)             – Spiegel der Stichtagsregel §5 (maßgeblich bleibt
                                      scripts/technical/practitioner/cutoff.mjs)
   * buildRecord(state)             – Formularzustand → Schema-Zeile
   * toJsonl / parseJsonl / classifyImport – Export/Import mit Duplikaterkennung
   * diffRecords(a, b)              – Feldvergleich für die blinde Doppelextraktion
   ========================================================================= */
(function (global) {
  "use strict";

  var SCHEMA_ID = "vu-practitioner-reference-1.2.0";
  var ENUMS = {
    sourceType: ["YOUTUBE", "X", "BLOG", "WEBSITE", "NEWSLETTER_PUBLIC", "PODCAST", "OTHER"],
    viewKind: ["ORIGINAL_PUBLISHED", "LATER_REVISION"],
    precision: ["MINUTE", "HOUR", "DAY"],
    edited: ["NO", "YES", "UNKNOWN"],
    instrumentType: ["STOCK", "ETF", "INDEX_CASH", "FUTURE", "CFD", "CRYPTO_SPOT", "FX", "COMMODITY_SPOT", "UNKNOWN"],
    priceAdjustment: ["SPLIT_ADJUSTED", "UNADJUSTED", "TOTAL_RETURN", "UNKNOWN"],
    mappingQuality: ["EXACT", "PROXY_SAME_UNDERLYING", "PROXY_DIFFERENT_INSTRUMENT", "UNMAPPED"],
    timeframe: ["1D", "1W", "1M", "INTRADAY", "MIXED", "UNKNOWN"],
    elliottSchool: ["CLASSICAL", "PRACTITIONER_SPECIFIC", "NEOWAVE", "UNKNOWN_MIXED"],
    pattern: ["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL", "ZIGZAG", "FLAT", "TRIANGLE", "WXY", "DOUBLE_ZIGZAG", "TRIPLE_ZIGZAG", "COMBINATION", "UNKNOWN"],
    family: ["MOTIVE", "CORRECTIVE", "UNKNOWN"],
    role: ["MOTIVE", "CORRECTIVE", "UNKNOWN"],
    state: ["DEVELOPING", "CONFIRMED_COMPLETE", "UNKNOWN"],
    bias: ["UP", "DOWN", "SIDEWAYS", "UNKNOWN"],
    invDirection: ["below", "above"],
    invBasis: ["CLOSE", "INTRADAY", "UNKNOWN"],
    confidence: ["HIGH", "MEDIUM", "LOW"],
    method: ["HUMAN_FROM_PRIMARY", "LLM_DRAFT_HUMAN_REVIEWED", "LLM_DUAL_INDEPENDENT_PRIMARY", "LLM_DRAFT_UNREVIEWED"],
    referenceQuality: ["A", "B", "C"],
    status: ["CANDIDATE", "INCLUDED", "EXCLUDED", "TEST_FIXTURE"],
    split: ["DEVELOPMENT", "VALIDATION", "HOLDOUT_TEMPORAL", "HOLDOUT_SOURCE", "UNASSIGNED"]
  };
  var DEGREE_RANKS = [
    { v: 0, label: "0 · Minute" }, { v: 1, label: "1 · Minor" }, { v: 2, label: "2 · Intermediate" },
    { v: 3, label: "3 · Primary" }, { v: 4, label: "4 · Cycle" }, { v: 5, label: "5 · Supercycle" }
  ];
  /* Handelsschluss je Markt (§5). EINZIGE Quelle der Stichtagsregel: scripts/technical/practitioner/cutoff.mjs re-exportiert
     genau diese Funktionen (CUTOFF unten), Seite und Pipeline rechnen also identisch.
     Schlusszeit = spaetestmoeglicher Schluss des VU-Tagesbars (konservativ), festgelegt je Reihenquelle, nicht je Anlageklasse:
       tiingo-equity (US-Aktien/ETFs inkl. FEZ, EEM, URTH)  16:00 America/New_York
       tiingo-crypto                                        Bar = UTC-Kalendertag → 24:00 UTC, alle Tage
       tiingo-fx-metals (XAU/XAG/XPT/XPD)                   Bar = UTC-Kalendertag (Stempel 00:00Z) → 24:00 UTC, So–Fr
       eia (WTI/BRENT/NATGAS Spot)                          konservativ Tagesende 24:00 America/New_York
       fred-index (N225)                                    15:30 Asia/Tokyo (TSE-Schluss seit 11/2024; davor 15:00 → konservativ)
       Xetra (keine VU-Reihe)                               17:30 Europe/Berlin */
  var MARKETS = {
    US_EQUITY: { label: "US-Aktien/ETFs (tiingo-equity) · 16:00 America/New_York", tz: "America/New_York", closeH: 16, closeM: 0, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5 },
    XETRA: { label: "Xetra · 17:30 Europe/Berlin", tz: "Europe/Berlin", closeH: 17, closeM: 30, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5 },
    CRYPTO: { label: "Krypto (tiingo-crypto) · UTC-Kalendertag, Schluss 24:00 UTC", tz: "UTC", closeH: 24, closeM: 0, sessionDays: [0, 1, 2, 3, 4, 5, 6], weekFinalDow: 0 },
    FX_METALS_UTC: { label: "Edelmetalle (tiingo-fx-metals) · UTC-Kalendertag, Schluss 24:00 UTC, So–Fr", tz: "UTC", closeH: 24, closeM: 0, sessionDays: [0, 1, 2, 3, 4, 5], weekFinalDow: 5, sundayOpensWeek: true },
    US_ENERGY_EIA: { label: "EIA-Spot Öl/Gas · konservativ 24:00 America/New_York", tz: "America/New_York", closeH: 24, closeM: 0, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5 },
    JP_EQUITY: { label: "Tokio (fred-index N225) · konservativ 15:30 Asia/Tokyo", tz: "Asia/Tokyo", closeH: 15, closeM: 30, sessionDays: [1, 2, 3, 4, 5], weekFinalDow: 5 }
  };
  /* Markt je VU-Reihe (muss mit instrument-map.json seriesMarkets übereinstimmen; Test prüft das). Einzelaktien (us-stock) → US_EQUITY. */
  var SYMBOL_MARKET = {
    SPY: "US_EQUITY", QQQ: "US_EQUITY", DIA: "US_EQUITY", IWM: "US_EQUITY", EEM: "US_EQUITY", FEZ: "US_EQUITY", URTH: "US_EQUITY",
    BTCUSD: "CRYPTO", ETHUSD: "CRYPTO", SOLUSD: "CRYPTO", XRPUSD: "CRYPTO",
    XAUUSD: "FX_METALS_UTC", XAGUSD: "FX_METALS_UTC", XPTUSD: "FX_METALS_UTC", XPDUSD: "FX_METALS_UTC",
    WTI: "US_ENERGY_EIA", BRENT: "US_ENERGY_EIA", NATGAS: "US_ENERGY_EIA", N225: "JP_EQUITY"
  };
  var PROPERTY_ORDER = ["referenceId", "caseId", "version", "revisionOf", "viewKind", "sourceId", "sourceType", "sourceUrl", "crossPosts", "publication", "instrument", "timeframe", "analysisCutoff", "analysisWindow",
    "elliottSchool", "primary", "alternatives", "directionalBias", "structuralScenario", "keySupportZones", "entryZones", "targetZones", "invalidation", "commentarySummary", "extraction", "evidence", "referenceQuality", "status", "exclusionReason", "split"];
  var EVIDENCE_FIELDS = ["primary", "primary.pattern", "primary.degreeLabel", "primary.currentWave", "alternatives", "directionalBias", "structuralScenario", "keySupportZones", "entryZones", "targetZones", "invalidation",
    "timeframe", "instrument", "publication.timestamp", "commentarySummary"];
  var SECOND_PASS_SUFFIX = "-p2";

  // ------------------------------------------------------------------ helpers
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function trim(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function numOrNull(v) { var t = trim(v).replace(/\s/g, "").replace(",", "."); if (t === "") return null; var x = Number(t); return isFinite(x) ? x : NaN; }
  function strOrNull(v) { var t = trim(v); return t === "" ? null : t; }
  function lines(v) { return trim(v).split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function slug(v) { return trim(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x"; }
  function typeOf(v) { return v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v; }
  function get(o, path) { return path.split(".").reduce(function (a, k) { return a === null || a === undefined ? undefined : a[k]; }, o); }

  /* Stabile Serialisierung: Schlüssel sortiert (für Hash/Identitätsvergleich). */
  function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }

  // ------------------------------------------------------------------ JSON-Schema (Teilmenge)
  function validateSchema(schema, value) {
    var errs = [];
    function resolve(s) { if (s && s.$ref) { var p = s.$ref.replace(/^#\//, "").split("/"); return p.reduce(function (a, k) { return a[k]; }, schema); } return s; }
    function typeOk(t, v) { var tv = typeOf(v); if (t === "number") return tv === "number" || tv === "integer"; return tv === t; }
    function walk(s, v, path) {
      s = resolve(s); if (!s) return;
      if (s.type) { var ts = [].concat(s.type); if (!ts.some(function (t) { return typeOk(t, v); })) { errs.push({ path: path || "(Zeile)", msg: "Typ " + typeOf(v) + " statt " + ts.join("|") }); return; } }
      if (s.enum && s.enum.indexOf(v) < 0) errs.push({ path: path, msg: "Wert " + JSON.stringify(v) + " nicht erlaubt (" + s.enum.join(", ") + ")" });
      if (typeof v === "string") {
        if (isNum(s.maxLength) && v.length > s.maxLength) errs.push({ path: path, msg: "länger als " + s.maxLength + " Zeichen (" + v.length + ")" });
        if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push({ path: path, msg: "passt nicht zu " + s.pattern });
        if (s.format === "uri") { var ok = false; try { var u = new URL(v); ok = /^https?:$/.test(u.protocol); } catch (e) { ok = false; } if (!ok) errs.push({ path: path, msg: "keine gültige http(s)-URL" }); }
      }
      if (isNum(v) && isNum(s.minimum) && v < s.minimum) errs.push({ path: path, msg: "kleiner als " + s.minimum });
      if (Array.isArray(v)) {
        if (isNum(s.minItems) && v.length < s.minItems) errs.push({ path: path, msg: "mindestens " + s.minItems + " Eintrag/Einträge nötig" });
        if (s.items) v.forEach(function (x, i) { walk(s.items, x, path + "[" + i + "]"); });
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        (s.required || []).forEach(function (k) { if (!(k in v) || v[k] === undefined) errs.push({ path: (path ? path + "." : "") + k, msg: "Pflichtfeld fehlt" }); });
        var props = s.properties || {};
        Object.keys(v).forEach(function (k) {
          if (props[k]) walk(props[k], v[k], (path ? path + "." : "") + k);
          else if (s.additionalProperties === false) errs.push({ path: (path ? path + "." : "") + k, msg: "Feld im Schema nicht vorgesehen" });
        });
      }
    }
    walk(schema, value, "");
    return errs;
  }

  // ------------------------------------------------------------------ Zeit / Stichtag (§5) — kanonische Regel
  var FMT = {};
  function partsIn(ms, tz) {
    var f = FMT[tz] || (FMT[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }));
    var o = {}; f.formatToParts(new Date(ms)).forEach(function (p) { if (p.type !== "literal") o[p.type] = p.value; });
    var y = +o.year, m = +o.month, d = +o.day, h = +o.hour % 24, mi = +o.minute, se = +o.second;
    return { date: o.year + "-" + o.month + "-" + o.day, minutes: h * 60 + mi, y: y, m: m, d: d, h: h, mi: mi, s: se, year: y, month: m, day: d, hour: h, minute: mi, second: se };
  }
  function validTz(tz) { if (typeof tz !== "string" || !tz) return false; try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch (e) { return false; } }
  function offsetMinutes(ms, tz) { var p = partsIn(ms, tz); return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000); }
  function fmtOffset(min) { var s = min < 0 ? "-" : "+", a = Math.abs(min); return s + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0"); }
  /* "2024-03-12T18:00" (Ortszeit in tz) → "2024-03-12T18:00:00+01:00" */
  function localToIso(local, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(trim(local)); if (!m || !validTz(tz)) return null;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    var off = offsetMinutes(guess - offsetMinutes(guess, tz) * 60000, tz);
    return m[1] + "-" + m[2] + "-" + m[3] + "T" + (m[4] || "00") + ":" + (m[5] || "00") + ":00" + fmtOffset(off);
  }
  function addDays(date, n) { var t = new Date(date + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function weekday(date) { return new Date(date + "T00:00:00Z").getUTCDay(); }
  function isIsoDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s; }
  function marketSpec(key) { var mk = MARKETS[key]; if (!mk) throw new Error("unbekannter Markt " + key); return mk; }
  function marketForSymbol(vuSymbol) { var s = trim(vuSymbol).toUpperCase(); return SYMBOL_MARKET[s] || null; }
  /* Markt für die Seite: zuerst die VU-Reihe (SYMBOL_MARKET), sonst Heuristik aus Typ/Bezeichnung. */
  function guessMarket(instrumentType, vuSymbol, asShown) {
    var bySym = marketForSymbol(vuSymbol); if (bySym) return bySym;
    var s = (trim(vuSymbol) + " " + trim(asShown)).toUpperCase();
    if (instrumentType === "CRYPTO_SPOT" || /BTC|ETH|SOL|XRP|CRYPTO/.test(s)) return "CRYPTO";
    if (/XAU|XAG|XPT|XPD|GOLD|SILVER|SILBER/.test(s)) return "FX_METALS_UTC";
    if (/WTI|BRENT|NATGAS|OIL|CRUDE|ÖL|GAS/.test(s)) return "US_ENERGY_EIA";
    if (/DAX|XETRA|GDAXI|MDAX|TECDAX|GER40|DE40/.test(s)) return "XETRA";
    if (/N225|NIKKEI|JP225/.test(s)) return "JP_EQUITY";
    return "US_EQUITY";
  }
  function zonedToUtc(date, hh, mm, tz) {
    var y = +date.slice(0, 4), mo = +date.slice(5, 7), d = +date.slice(8, 10), guess = Date.UTC(y, mo - 1, d, hh, mm);
    var t = guess - offsetMinutes(guess, tz) * 60000; return guess - offsetMinutes(t, tz) * 60000;
  }
  /* Schlusszeitpunkt (UTC ms) des Tagesbars `date`; closeH 24 = Ende des lokalen Kalendertags. */
  function closeInstant(date, key) {
    var mk = typeof key === "string" ? marketSpec(key) : key;
    return mk.closeH === 24 ? zonedToUtc(addDays(date, 1), 0, 0, mk.tz) : zonedToUtc(date, mk.closeH, mk.closeM, mk.tz);
  }
  function isSessionDay(date, key) { return marketSpec(key).sessionDays.indexOf(weekday(date)) >= 0; }
  var TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
  /* Publikation → Zeitpunkt laut Stempel und frühestmöglicher Zeitpunkt (DAY → 00:00 in publication.timezone, HOUR → Stundenbeginn,
     MINUTE → Sekunden verworfen). Wirft bei fehlendem Offset, unbekannter Zone oder Genauigkeit. */
  function parsePublication(pub) {
    if (!pub || typeof pub !== "object") throw new Error("publication fehlt");
    var m = TS_RE.exec(String(pub.timestamp || ""));
    if (!m) throw new Error("publication.timestamp ist kein ISO-8601 mit Offset: " + pub.timestamp);
    if (!validTz(pub.timezone)) throw new Error("publication.timezone ist keine IANA-Zone: " + pub.timezone);
    var ms = Date.parse(pub.timestamp); if (!isFinite(ms)) throw new Error("publication.timestamp nicht lesbar: " + pub.timestamp);
    var prec = pub.timestampPrecision, datePart = m[1] + "-" + m[2] + "-" + m[3], earliest;
    if (prec === "DAY") earliest = Math.min(ms, zonedToUtc(datePart, 0, 0, pub.timezone));
    else if (prec === "HOUR") earliest = ms - (+m[5]) * 60000 - (+(m[6] || 0)) * 1000;
    else if (prec === "MINUTE") earliest = ms - (+(m[6] || 0)) * 1000;
    else throw new Error("publication.timestampPrecision unbekannt: " + prec);
    var off = m[7] === "Z" ? 0 : (m[7][0] === "-" ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(4, 6));
    return { instantMs: ms, earliestMs: earliest, statedOffsetMinutes: off, zoneOffsetMinutes: offsetMinutes(ms, pub.timezone), datePart: datePart, precision: prec };
  }
  function timestampConsistency(pub) {
    var p = parsePublication(pub);
    return p.statedOffsetMinutes === p.zoneOffsetMinutes ? null : "Offset " + p.statedOffsetMinutes + " min im Zeitstempel passt nicht zu " + pub.timezone + " (" + p.zoneOffsetMinutes + " min zu diesem Zeitpunkt)";
  }
  /* analysisCutoff = letzter TAGESbar, dessen Schluss strikt vor dem frühestmöglichen Veröffentlichungszeitpunkt lag. Gespeichert wird
     IMMER dieser Tages-Stichtag (auch bei 1W/1M); Wochenabschluss und Einrasten auf vorhandene Bars macht ausschließlich replay.mjs. */
  function computeAnalysisCutoff(publication, key) {
    var mk = marketSpec(key), p = parsePublication(publication), eff = p.earliestMs;
    var d = addDays(partsIn(eff, mk.tz).date, 1);
    for (var k = 0; k < 20; k++, d = addDays(d, -1)) {
      if (!isSessionDay(d, key)) continue;
      var ci = closeInstant(d, key);
      if (ci < eff) return { analysisCutoff: d, closeInstantUtc: new Date(ci).toISOString(), effectivePublicationUtc: new Date(eff).toISOString(), market: key,
                             rule: p.precision + ": letzter Schluss strikt vor " + new Date(eff).toISOString() + " (" + mk.label + ")" };
    }
    throw new Error("kein Stichtag gefunden");
  }
  /* Ende (letzte Sitzung) der letzten zum Stichtag abgeschlossenen Woche (Mo–So-Woche; bei sundayOpensWeek gehört der Sonntag zur Folgewoche). */
  function lastCompleteWeekEnd(cutoffDate, key) {
    var mk = marketSpec(key), monday = addDays(cutoffDate, -((weekday(cutoffDate) + 6) % 7)), fin = addDays(monday, (mk.weekFinalDow + 6) % 7);
    return cutoffDate >= fin ? fin : addDays(fin, -7);
  }
  /* Wochenschlüssel (Montag); bei sundayOpensWeek zählt ein Sonntagsbar zur folgenden Woche. */
  function weekKey(date, key) {
    var mk = key ? marketSpec(key) : null, d = mk && mk.sundayOpensWeek && weekday(date) === 0 ? addDays(date, 1) : date;
    return addDays(d, -((weekday(d) + 6) % 7));
  }
  function snapToBars(sortedDates, date) {
    var lo = 0, hi = sortedDates.length - 1, ans = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (sortedDates[mid] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans < 0 ? null : { index: ans, date: sortedDates[ans] };
  }
  function sessionDaysBetween(a, b, key) {
    if (a === b) return 0;
    var sgn = a < b ? 1 : -1, x = a < b ? a : b, y = a < b ? b : a, n = 0;
    for (var d = addDays(x, 1); d <= y; d = addDays(d, 1)) if (isSessionDay(d, key)) n++;
    return sgn * n;
  }
  /* Formular: speichert NUR den Tages-Stichtag (identisch zur Pipeline). Wochenende und Einrasten werden nur als Hinweis gezeigt. */
  function computeCutoff(o) {
    var key = MARKETS[o.market] ? o.market : "US_EQUITY", c;
    try { c = computeAnalysisCutoff({ timestamp: trim(o.timestamp), timestampPrecision: o.precision, timezone: o.timezone }, key); }
    catch (e) { return { date: null, rule: e.message }; }
    var rule = c.rule, info = {};
    if (o.timeframe === "1W" || o.timeframe === "1M") { info.weeklyBarEnd = lastCompleteWeekEnd(c.analysisCutoff, key); rule += " · Hinweis: Replay nutzt Wochen bis " + info.weeklyBarEnd + (o.timeframe === "1M" ? " (1M auf Wochenbasis)" : ""); }
    if (o.dates && o.dates.length) { var sn = snapToBars(o.dates, info.weeklyBarEnd || c.analysisCutoff); info.lastVuBar = sn ? sn.date : null; rule += sn ? " · letzter VU-Bar " + sn.date : " · keine VU-Daten bis zum Stichtag"; }
    return { date: c.analysisCutoff, dailyDate: c.analysisCutoff, weeklyBarEnd: info.weeklyBarEnd || null, lastVuBar: info.lastVuBar || null, rule: rule };
  }
  var CUTOFF = { MARKETS: MARKETS, SYMBOL_MARKET: SYMBOL_MARKET, marketForSymbol: marketForSymbol, parsePublication: parsePublication, timestampConsistency: timestampConsistency,
    computeAnalysisCutoff: computeAnalysisCutoff, lastCompleteWeekEnd: lastCompleteWeekEnd, weekKey: weekKey, snapToBars: snapToBars, sessionDaysBetween: sessionDaysBetween,
    closeInstant: closeInstant, isSessionDay: isSessionDay, zonedToUtc: zonedToUtc, zonedParts: partsIn, tzOffsetMinutes: offsetMinutes, localDate: function (ms, tz) { return partsIn(ms, tz).date; },
    addDays: addDays, dow: weekday, isIsoDate: isIsoDate, isValidTimeZone: validTz };

  // ------------------------------------------------------------------ Reihen
  /* Tagesreihe → Wochenreihe (letzter Handelstag je Woche, Wochenende Freitag; wie scripts/technical/elliott-practitioner-benchmark.mjs). */
  function toWeekly(points) {
    var wk = new Map();
    points.forEach(function (p) { var wd = weekday(p[0]), fri = addDays(p[0], (5 - wd + 7) % 7); wk.set(fri, p); });
    return Array.from(wk.values());
  }

  // ------------------------------------------------------------------ IDs
  function makeCaseId(sourceId, vuSymbol, timestamp, scenarioVersion) {
    return [trim(sourceId) || "?", trim(vuSymbol) || "UNMAPPED", trim(timestamp).slice(0, 10) || "?", "s" + (scenarioVersion || 1)].join("|");
  }
  /* pr_<quelle>_<symbol>_<JJJJMMTT>_<url-hash6>_v<version> — der URL-Hash trennt mehrere Analysen derselben Quelle am selben Tag. */
  function makeReferenceId(sourceId, vuSymbol, asShown, timestamp, version, url) {
    var d = trim(timestamp).slice(0, 10).replace(/-/g, "");
    return "pr_" + slug(sourceId) + "_" + slug(vuSymbol || asShown || "unmapped") + "_" + (d || "x") + "_" + fnv1a(norm(url)).slice(-6) + "_v" + (version || 1);
  }
  function isSecondPass(rec) { return !!rec && typeof rec.referenceId === "string" && rec.referenceId.slice(-SECOND_PASS_SUFFIX.length) === SECOND_PASS_SUFFIX; }
  function firstPassIdOf(rec) { return isSecondPass(rec) ? rec.referenceId.slice(0, -SECOND_PASS_SUFFIX.length) : rec.referenceId; }

  // ------------------------------------------------------------------ Formularzustand → Zeile
  function zonesOf(list) { return (list || []).map(function (z) { return { low: numOrNull(z.low), high: numOrNull(z.high), label: strOrNull(z.label) }; }).filter(function (z) { return z.low !== null || z.high !== null || z.label; }); }
  function buildRecord(s) {
    s = s || {};
    var ts = trim(s.timestamp) || (s.localDateTime ? localToIso(s.localDateTime, s.timezone) : "") || "";
    var version = parseInt(s.version, 10) || 1;
    var vuSymbol = strOrNull(s.vuSymbol);
    var secondPass = !!s.secondPassOf;
    var refId = trim(s.referenceId) || (secondPass ? trim(s.secondPassOf) + SECOND_PASS_SUFFIX : makeReferenceId(s.sourceId, vuSymbol, s.asShown, ts, version, s.sourceUrl));
    var r = {};
    r.referenceId = refId;
    r.caseId = trim(s.caseId) || makeCaseId(s.sourceId, vuSymbol, ts, s.scenarioVersion || version);
    r.version = version;
    r.revisionOf = strOrNull(s.revisionOf);
    r.viewKind = s.viewKind || (r.revisionOf ? "LATER_REVISION" : "ORIGINAL_PUBLISHED");
    r.sourceId = trim(s.sourceId);
    r.sourceType = s.sourceType || undefined;
    r.sourceUrl = trim(s.sourceUrl);
    r.crossPosts = lines(s.crossPosts);
    r.publication = { timestamp: ts, timestampPrecision: s.precision || undefined, timezone: trim(s.timezone), basis: trim(s.timestampBasis), editedAfterPublication: s.edited || "UNKNOWN", editNote: strOrNull(s.editNote) };
    r.instrument = { asShown: trim(s.asShown), instrumentType: s.instrumentType || undefined, priceAdjustment: s.priceAdjustment || "UNKNOWN", vuSymbol: vuSymbol, mappingQuality: s.mappingQuality || (vuSymbol ? undefined : "UNMAPPED"), levelScale: numOrNull(s.levelScale) };
    r.timeframe = s.timeframe || undefined;
    r.analysisCutoff = trim(s.analysisCutoff);
    var ws = strOrNull(s.windowStart), we = strOrNull(s.windowEnd);
    r.analysisWindow = ws || we ? { start: ws || "", end: we || "" } : null;
    r.elliottSchool = s.elliottSchool || undefined;
    r.primary = s.noPrimary ? null : {
      pattern: s.pPattern || "UNKNOWN", family: s.pFamily || "UNKNOWN", degreeLabel: strOrNull(s.pDegreeLabel),
      degreeRank: trim(s.pDegreeRank) === "" ? null : parseInt(s.pDegreeRank, 10), currentWave: strOrNull(s.pCurrentWave),
      currentWaveRole: s.pRole || "UNKNOWN", state: s.pState || "UNKNOWN", nextMoveAfterCurrent: s.pNextAfter || "UNKNOWN", waveStartDate: strOrNull(s.pWaveStartDate), waveStartPrice: numOrNull(s.pWaveStartPrice)
    };
    r.alternatives = (s.alternatives || []).map(function (a) { return { pattern: trim(a.pattern) || "UNKNOWN", currentWave: strOrNull(a.currentWave), directionalBias: a.directionalBias || "UNKNOWN", trigger: numOrNull(a.trigger), note: strOrNull(a.note) }; })
      .filter(function (a) { return a.pattern !== "UNKNOWN" || a.currentWave || a.trigger !== null || a.note || a.directionalBias !== "UNKNOWN"; });
    r.directionalBias = s.directionalBias || undefined;
    r.structuralScenario = strOrNull(s.structuralScenario);
    r.keySupportZones = zonesOf(s.supportZones); r.entryZones = zonesOf(s.entryZones); r.targetZones = zonesOf(s.targetZones);
    var ip = numOrNull(s.invPrice);
    r.invalidation = ip === null ? null : { price: ip, direction: s.invDirection || undefined, basis: s.invBasis || "UNKNOWN" };
    r.commentarySummary = trim(s.summary);
    r.extraction = { confidence: s.confidence || undefined, extractor: trim(s.extractor), method: s.method || undefined, secondPass: strOrNull(s.secondPassRef), ambiguities: lines(s.ambiguities) };
    r.evidence = (s.evidence || []).map(function (e) { return { field: trim(e.field), locator: strOrNull(e.locator), note: trim(e.note) }; }).filter(function (e) { return e.field || e.note || e.locator; });
    if (s.referenceQuality) r.referenceQuality = s.referenceQuality;
    r.status = secondPass ? "EXCLUDED" : s.status || "CANDIDATE";
    r.exclusionReason = secondPass ? "SECOND_PASS: unabhängige Zweitextraktion von " + trim(s.secondPassOf) + " (zählt nicht als eigener Fall)" : strOrNull(s.exclusionReason);
    r.split = s.split || "UNASSIGNED";
    return ordered(stripUndefined(r));
  }
  function stripUndefined(o) {
    if (Array.isArray(o)) return o.map(stripUndefined);
    if (o && typeof o === "object") { var r = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined) r[k] = stripUndefined(o[k]); }); return r; }
    return o;
  }
  function ordered(r) { var o = {}; PROPERTY_ORDER.forEach(function (k) { if (k in r) o[k] = r[k]; }); Object.keys(r).forEach(function (k) { if (!(k in o)) o[k] = r[k]; }); return o; }

  /* Umkehrung für "Bearbeiten": Zeile → Formularzustand. */
  function recordToState(r) {
    var p = r.primary || {}, i = r.instrument || {}, pub = r.publication || {}, x = r.extraction || {}, inv = r.invalidation || {};
    function z(list) { return (list || []).map(function (q) { return { low: q.low === null || q.low === undefined ? "" : String(q.low), high: q.high === null || q.high === undefined ? "" : String(q.high), label: q.label || "" }; }); }
    return {
      referenceId: r.referenceId, caseId: r.caseId, version: r.version, revisionOf: r.revisionOf || "", viewKind: r.viewKind || "", sourceId: r.sourceId, sourceType: r.sourceType, sourceUrl: r.sourceUrl,
      crossPosts: (r.crossPosts || []).join("\n"), timestamp: pub.timestamp, precision: pub.timestampPrecision, timezone: pub.timezone, timestampBasis: pub.basis, edited: pub.editedAfterPublication, editNote: pub.editNote || "",
      asShown: i.asShown, instrumentType: i.instrumentType, priceAdjustment: i.priceAdjustment, vuSymbol: i.vuSymbol || "", mappingQuality: i.mappingQuality, levelScale: i.levelScale === null || i.levelScale === undefined ? "" : String(i.levelScale),
      timeframe: r.timeframe, analysisCutoff: r.analysisCutoff, windowStart: r.analysisWindow ? r.analysisWindow.start : "", windowEnd: r.analysisWindow ? r.analysisWindow.end : "", elliottSchool: r.elliottSchool,
      noPrimary: r.primary === null, pPattern: p.pattern || "", pFamily: p.family || "", pDegreeLabel: p.degreeLabel || "", pDegreeRank: p.degreeRank === null || p.degreeRank === undefined ? "" : String(p.degreeRank),
      pCurrentWave: p.currentWave || "", pRole: p.currentWaveRole || "", pState: p.state || "", pNextAfter: p.nextMoveAfterCurrent || "", pWaveStartDate: p.waveStartDate || "", pWaveStartPrice: p.waveStartPrice === null || p.waveStartPrice === undefined ? "" : String(p.waveStartPrice),
      alternatives: (r.alternatives || []).map(function (a) { return { pattern: a.pattern || "", currentWave: a.currentWave || "", directionalBias: a.directionalBias || "", trigger: a.trigger === null || a.trigger === undefined ? "" : String(a.trigger), note: a.note || "" }; }),
      directionalBias: r.directionalBias, structuralScenario: r.structuralScenario || "", supportZones: z(r.keySupportZones), entryZones: z(r.entryZones), targetZones: z(r.targetZones),
      invPrice: inv.price === undefined || inv.price === null ? "" : String(inv.price), invDirection: inv.direction || "", invBasis: inv.basis || "",
      summary: r.commentarySummary || "", confidence: x.confidence, extractor: x.extractor, method: x.method, secondPassRef: x.secondPass || "", ambiguities: (x.ambiguities || []).join("\n"),
      evidence: (r.evidence || []).map(function (e) { return { field: e.field, locator: e.locator || "", note: e.note }; }), referenceQuality: r.referenceQuality || "", status: r.status, exclusionReason: r.exclusionReason || "", split: r.split || "UNASSIGNED"
    };
  }

  // ------------------------------------------------------------------ Protokollregeln
  var FAMILY_OF = { IMPULSE: "MOTIVE", LEADING_DIAGONAL: "MOTIVE", ENDING_DIAGONAL: "MOTIVE", ZIGZAG: "CORRECTIVE", FLAT: "CORRECTIVE", TRIANGLE: "CORRECTIVE", WXY: "CORRECTIVE", DOUBLE_ZIGZAG: "CORRECTIVE", TRIPLE_ZIGZAG: "CORRECTIVE", COMBINATION: "CORRECTIVE" };
  var LOCATOR_TIME = /^(\d{1,2}:)?\d{1,3}:\d{2}$/;
  /* ctx: { cutoffClose, firstPass (Zeile der Erstextraktion bei Zweitdurchgang), existing (bekannte Zeilen) } */
  function domainChecks(r, ctx) {
    ctx = ctx || {}; var E = [], W = [];
    if (!r || typeof r !== "object") return { errors: ["keine Zeile"], warnings: [] };
    var x = r.extraction || {}, pub = r.publication || {}, ins = r.instrument || {};
    if (x.confidence === "LOW") W.push("Extraktionssicherheit LOW → nicht benchmarkfähig (nur Kandidat, §3).");
    if (x.confidence === "LOW" && r.status === "INCLUDED") E.push("LOW darf nicht INCLUDED sein (§3).");
    if (x.method === "LLM_DRAFT_UNREVIEWED") W.push("Methode LLM_DRAFT_UNREVIEWED → zählt nie (§7).");
    if (x.method === "LLM_DRAFT_UNREVIEWED" && r.status === "INCLUDED") E.push("LLM_DRAFT_UNREVIEWED darf nicht INCLUDED sein (§7).");
    if (x.extractor && (/@/.test(x.extractor) || !/^[A-Za-z0-9_-]{2,24}$/.test(x.extractor))) E.push("Extraktor-ID muss pseudonym sein (2–24 Zeichen A–Z, 0–9, _ -; keine Namen/E-Mails).");
    if (pub.timestamp && !/([+-]\d{2}:\d{2}|Z)$/.test(pub.timestamp)) E.push("Zeitstempel ohne Zeitzonen-Offset.");
    if (pub.timezone && !validTz(pub.timezone)) E.push("Zeitzone ist keine gültige IANA-Zone: " + pub.timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.analysisCutoff || "")) E.push("analysisCutoff fehlt (YYYY-MM-DD; wird aus dem Zeitstempel berechnet).");
    else if (pub.timestamp) {
      var pubDate = String(pub.timestamp).slice(0, 10);
      if (r.analysisCutoff > pubDate) E.push("analysisCutoff " + r.analysisCutoff + " liegt nach der Veröffentlichung (" + pubDate + ").");
      if (pub.timestampPrecision === "DAY" && r.analysisCutoff >= pubDate) E.push("Genauigkeit DAY: Stichtag muss vor dem Veröffentlichungsdatum liegen (§5).");
    }
    if (pub.editedAfterPublication === "YES" && !pub.editNote) W.push("Nachträglich bearbeitet: bitte editNote ausfüllen; nur die ursprüngliche Aussage zählt.");
    if (ins.vuSymbol === null && ins.mappingQuality && ins.mappingQuality !== "UNMAPPED") E.push("Ohne VU-Reihe muss mappingQuality UNMAPPED sein (§6).");
    if (ins.vuSymbol && ins.mappingQuality === "UNMAPPED") W.push("VU-Reihe gesetzt, aber mappingQuality UNMAPPED.");
    if (ins.mappingQuality === "UNMAPPED") W.push("UNMAPPED: Fall bleibt Kandidat, wird gezählt, aber nicht gerechnet (§6).");
    if (ins.mappingQuality === "PROXY_DIFFERENT_INSTRUMENT" && !isNum(ins.levelScale)) W.push("Proxy anderes Instrument ohne levelScale: Niveaus nur prozentual/ATR vergleichbar.");
    if (r.timeframe === "INTRADAY") W.push("INTRADAY nur, wenn Zeitpunkt und Daten exakt rekonstruierbar sind (§2.2).");
    if (r.viewKind === "LATER_REVISION" && !r.revisionOf) E.push("LATER_REVISION braucht revisionOf.");
    if (r.revisionOf && r.revisionOf === r.referenceId) E.push("revisionOf verweist auf sich selbst.");
    var p = r.primary;
    var hasCount = !!(p && ((p.pattern && p.pattern !== "UNKNOWN") || p.currentWave)), hasInv = !!(r.invalidation && isNum(r.invalidation.price)), hasTarget = (r.targetZones || []).length > 0;
    if (!hasCount && !hasInv && !hasTarget) E.push("Einschluss §2.3: mindestens Wellenzählung/Muster, Invalidation oder Zielzone nötig.");
    if (p && p.pattern && FAMILY_OF[p.pattern] && p.family && p.family !== "UNKNOWN" && FAMILY_OF[p.pattern] !== p.family) W.push("Muster " + p.pattern + " gehört zur Familie " + FAMILY_OF[p.pattern] + ", erfasst: " + p.family + ".");
    if (p && p.degreeRank !== null && p.degreeRank !== undefined && (p.degreeRank < 0 || p.degreeRank > 5)) W.push("degreeRank außerhalb 0–5.");
    if (p && p.currentWave && !/^[\(\[\{]?[0-9ivxIVXa-eA-EwxyzWXYZ]{1,4}[\)\]\}]?$/.test(p.currentWave)) W.push("Wellenlabel ungewöhnlich: " + p.currentWave + " (Label-Syntax prüfen).");
    if (r.invalidation && hasInv && !r.invalidation.direction) E.push("Invalidation: Richtung (below/above) fehlt.");
    if (r.invalidation && hasInv && r.invalidation.direction && (r.directionalBias === "UP" && r.invalidation.direction === "above" || r.directionalBias === "DOWN" && r.invalidation.direction === "below")) W.push("Invalidation " + r.invalidation.direction + " passt nicht zur Richtung " + r.directionalBias + " — prüfen oder unter ambiguities notieren.");
    ["keySupportZones", "entryZones", "targetZones"].forEach(function (k) { (r[k] || []).forEach(function (z, i) { if (!isNum(z.low) || !isNum(z.high)) E.push(k + "[" + i + "]: unten und oben als Zahl nötig."); else if (z.low > z.high) E.push(k + "[" + i + "]: unten > oben."); }); });
    if ((r.commentarySummary || "").length > 400) E.push("Kurzfassung > 400 Zeichen.");
    if (/[„“"«»]/.test(r.commentarySummary || "")) W.push("Kurzfassung enthält Anführungszeichen — keine Zitate/Transkripte, nur eigene Worte.");
    if (!(r.evidence || []).length) E.push("Mindestens ein Beleg (Feld + Notiz) nötig.");
    (r.evidence || []).forEach(function (e, i) {
      if (!e.field || !e.note) E.push("Beleg " + (i + 1) + ": Feld und Notiz nötig.");
      if (e.note && e.note.length > 200) E.push("Beleg " + (i + 1) + ": Notiz > 200 Zeichen.");
      if ((r.sourceType === "YOUTUBE" || r.sourceType === "PODCAST") && e.locator && !LOCATOR_TIME.test(e.locator)) W.push("Beleg " + (i + 1) + ": Locator bei Video/Podcast als mm:ss angeben.");
      if ((r.sourceType === "YOUTUBE" || r.sourceType === "PODCAST") && !e.locator) W.push("Beleg " + (i + 1) + ": Videozeit (mm:ss) fehlt.");
    });
    if (r.analysisWindow && ((r.analysisWindow.start && !LOCATOR_TIME.test(r.analysisWindow.start)) || (r.analysisWindow.end && !LOCATOR_TIME.test(r.analysisWindow.end)))) W.push("analysisWindow bitte als mm:ss.");
    if (r.status === "EXCLUDED" && !r.exclusionReason) E.push("EXCLUDED braucht exclusionReason.");
    // Plausibilität §7: Niveau im Kursbereich des Stichtags ±60 %
    if (isNum(ctx.cutoffClose) && ins.mappingQuality !== "UNMAPPED") {
      var scale = isNum(ins.levelScale) ? ins.levelScale : ins.mappingQuality === "PROXY_DIFFERENT_INSTRUMENT" ? null : 1;
      if (scale !== null) {
        var lv = []; if (hasInv) lv.push(["Invalidation", r.invalidation.price]);
        ["keySupportZones", "entryZones", "targetZones"].forEach(function (k) { (r[k] || []).forEach(function (z) { if (isNum(z.low)) lv.push([k, z.low]); if (isNum(z.high)) lv.push([k, z.high]); }); });
        (r.alternatives || []).forEach(function (a) { if (isNum(a.trigger)) lv.push(["Alternative-Trigger", a.trigger]); });
        lv.forEach(function (q) { var v = q[1] * scale; if (v < ctx.cutoffClose * 0.4 || v > ctx.cutoffClose * 1.6) W.push(q[0] + " " + q[1] + (scale !== 1 ? " (×" + scale + ")" : "") + " liegt außerhalb ±60 % des Stichtagskurses " + Math.round(ctx.cutoffClose * 100) / 100 + "."); });
      }
    }
    if (ctx.firstPass) {
      if (ctx.firstPass.extraction && x.extractor && ctx.firstPass.extraction.extractor === x.extractor) E.push("Zweitextraktion muss von einer anderen Person (anderer Code) stammen.");
      if (ctx.firstPass.caseId !== r.caseId) E.push("Zweitextraktion muss dieselbe caseId tragen.");
    }
    return { errors: E, warnings: W };
  }
  function validateRecord(schema, r, ctx) {
    var se = schema ? validateSchema(schema, r).map(function (e) { return e.path + ": " + e.msg; }) : ["Schema nicht geladen — Export gesperrt."];
    var d = domainChecks(r, ctx);
    return { errors: se.concat(d.errors), warnings: d.warnings, ok: !se.length && !d.errors.length, benchmarkEligible: !se.length && !d.errors.length && r.extraction && r.extraction.confidence !== "LOW" && r.extraction.method !== "LLM_DRAFT_UNREVIEWED" && r.status !== "EXCLUDED" && !isSecondPass(r) };
  }

  // ------------------------------------------------------------------ JSONL
  function toJsonlLine(r) { return JSON.stringify(ordered(r)); }
  function toJsonl(list) { return list.map(toJsonlLine).join("\n") + (list.length ? "\n" : ""); }
  function parseJsonl(text) {
    var out = [], errors = [];
    String(text || "").split(/\r?\n/).forEach(function (ln, i) {
      var t = ln.trim(); if (!t) return;
      try { var o = JSON.parse(t); if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("kein Objekt"); out.push({ line: i + 1, record: o }); }
      catch (e) { errors.push({ line: i + 1, msg: "kein gültiges JSON: " + e.message }); }
    });
    return { records: out, errors: errors };
  }
  /* Einordnung eines eingehenden Datensatzes gegenüber vorhandenen:
     DUPLICATE (gleiche referenceId, identischer Inhalt) · CONFLICT (gleiche referenceId, anderer Inhalt) ·
     SECOND_PASS (Zweitextraktion zu vorhandener Erstfassung) · REVISION (revisionOf/Version > vorhandene) ·
     COLLISION_CASE / COLLISION_URL (gleiche caseId bzw. sourceUrl unter anderer referenceId → möglicher Doppelfall) · NEW */
  function classifyImport(rec, existing) {
    var same = existing.filter(function (e) { return e.referenceId === rec.referenceId; })[0];
    if (same) return { kind: canonical(same) === canonical(rec) ? "DUPLICATE" : "CONFLICT", other: same.referenceId };
    if (isSecondPass(rec)) { var fp = firstPassIdOf(rec), first = existing.filter(function (e) { return e.referenceId === fp; })[0]; return { kind: "SECOND_PASS", other: first ? first.referenceId : fp, firstMissing: !first }; }
    if (rec.revisionOf && existing.some(function (e) { return e.referenceId === rec.revisionOf; })) return { kind: "REVISION", other: rec.revisionOf };
    var byCase = existing.filter(function (e) { return !isSecondPass(e) && e.caseId === rec.caseId; })[0];
    if (byCase) return { kind: "COLLISION_CASE", other: byCase.referenceId };
    var url = norm(rec.sourceUrl), byUrl = url ? existing.filter(function (e) { return !isSecondPass(e) && (norm(e.sourceUrl) === url || (e.crossPosts || []).map(norm).indexOf(url) >= 0); })[0] : null;
    if (byUrl) return { kind: "COLLISION_URL", other: byUrl.referenceId };
    return { kind: "NEW", other: null };
  }
  function norm(u) { return trim(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, ""); }

  // ------------------------------------------------------------------ Diff (Doppelextraktion)
  var DIFF_FIELDS = ["sourceType", "publication.timestamp", "publication.timestampPrecision", "instrument.asShown", "instrument.instrumentType", "instrument.priceAdjustment", "instrument.vuSymbol", "instrument.mappingQuality", "instrument.levelScale",
    "timeframe", "analysisCutoff", "elliottSchool", "primary.pattern", "primary.family", "primary.degreeLabel", "primary.degreeRank", "primary.currentWave", "primary.currentWaveRole", "primary.state", "primary.nextMoveAfterCurrent", "primary.waveStartDate", "primary.waveStartPrice",
    "alternatives", "directionalBias", "structuralScenario", "keySupportZones", "entryZones", "targetZones", "invalidation.price", "invalidation.direction", "invalidation.basis", "extraction.confidence"];
  var FREE_TEXT = { structuralScenario: true };
  function normLabel(v) { return trim(v).toLowerCase().replace(/[()\[\]{}\s]/g, ""); }
  function fmtVal(v) { if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "–"; if (Array.isArray(v)) return v.map(function (z) { return z && typeof z === "object" ? ("low" in z ? z.low + "–" + z.high : [z.pattern, z.currentWave, z.directionalBias].filter(Boolean).join("/")) : String(z); }).join("; "); return String(v); }
  function relClose(a, b, tol) { return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-9); }
  function diffRecords(a, b) {
    var rows = DIFF_FIELDS.map(function (f) {
      var va = get(a, f), vb = get(b, f), empty = function (v) { return v === null || v === undefined || v === "" || v === "UNKNOWN" || (Array.isArray(v) && !v.length); };
      var st;
      if (empty(va) && empty(vb)) st = "BOTH_EMPTY";
      else if (empty(va) || empty(vb)) st = "DIFF";
      else if (isNum(va) && isNum(vb)) st = va === vb ? "EQUAL" : relClose(va, vb, 0.005) ? "CLOSE" : "DIFF";
      else if (Array.isArray(va) && Array.isArray(vb)) {
        if (va.length !== vb.length) st = "DIFF";
        else if (va[0] && "low" in va[0]) { var sa = va.slice().sort(function (p, q) { return p.low - q.low; }), sb = vb.slice().sort(function (p, q) { return p.low - q.low; }); st = sa.every(function (z, i) { return z.low === sb[i].low && z.high === sb[i].high; }) ? "EQUAL" : sa.every(function (z, i) { return relClose(z.low, sb[i].low, 0.005) && relClose(z.high, sb[i].high, 0.005); }) ? "CLOSE" : "DIFF"; }
        else { var ka = va.map(function (x) { return x.pattern + "/" + normLabel(x.currentWave) + "/" + x.directionalBias; }).sort().join("|"), kb = vb.map(function (x) { return x.pattern + "/" + normLabel(x.currentWave) + "/" + x.directionalBias; }).sort().join("|"); st = ka === kb ? "EQUAL" : "DIFF"; }
      }
      else if (FREE_TEXT[f]) st = trim(va).toLowerCase() === trim(vb).toLowerCase() ? "EQUAL" : "TEXT";
      else st = String(va) === String(vb) ? "EQUAL" : typeof va === "string" && normLabel(va) === normLabel(vb) ? "CLOSE" : "DIFF";
      return { field: f, a: fmtVal(va), b: fmtVal(vb), status: st };
    });
    var cmp = rows.filter(function (r) { return r.status !== "BOTH_EMPTY" && r.status !== "TEXT"; });
    return { rows: rows, compared: cmp.length, agree: cmp.filter(function (r) { return r.status === "EQUAL" || r.status === "CLOSE"; }).length, differ: cmp.filter(function (r) { return r.status === "DIFF"; }).length };
  }

  // ------------------------------------------------------------------ Hash (FNV-1a, nur Identität – SHA-256 macht die Seite über WebCrypto)
  function fnv1a(text) { var x = 0x811c9dc5; for (var i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return "fnv1a:" + x.toString(16).padStart(8, "0"); }

  var api = {
    SCHEMA_ID: SCHEMA_ID, ENUMS: ENUMS, DEGREE_RANKS: DEGREE_RANKS, MARKETS: MARKETS, PROPERTY_ORDER: PROPERTY_ORDER, EVIDENCE_FIELDS: EVIDENCE_FIELDS, DIFF_FIELDS: DIFF_FIELDS, FAMILY_OF: FAMILY_OF, SECOND_PASS_SUFFIX: SECOND_PASS_SUFFIX,
    validateSchema: validateSchema, domainChecks: domainChecks, validateRecord: validateRecord,
    localToIso: localToIso, validTz: validTz, computeCutoff: computeCutoff, zonedToUtc: zonedToUtc, guessMarket: guessMarket, addDays: addDays, toWeekly: toWeekly, CUTOFF: CUTOFF, SYMBOL_MARKET: SYMBOL_MARKET,
    makeCaseId: makeCaseId, makeReferenceId: makeReferenceId, isSecondPass: isSecondPass, firstPassIdOf: firstPassIdOf,
    buildRecord: buildRecord, recordToState: recordToState, toJsonlLine: toJsonlLine, toJsonl: toJsonl, parseJsonl: parseJsonl, classifyImport: classifyImport,
    diffRecords: diffRecords, canonical: canonical, fnv1a: fnv1a, numOrNull: numOrNull
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUPractitionerCore = api;
})(typeof window !== "undefined" ? window : globalThis);
