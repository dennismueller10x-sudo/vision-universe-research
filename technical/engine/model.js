/* =========================================================================
   VISION UNIVERSE TECHNICAL — engine/model.js
   REINES OBERFLAECHENMODELL (ohne DOM; Browser und Node)

   Routen, Screener-Zustand <-> strukturierte Abfrage (technical-query.js),
   Befundkarten aus Engine-Ergebnissen, Formatierung. Rechnet keine
   Indikatoren: alle Zahlen kommen aus den Engines oder dem Datensatz.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Q = isNode ? require("../../quant/engines/technical/technical-query.js") : global.VUTechnical.Query;

  var SCREENER_PATH = "/technical/data/screener-v1.json";
  var META_PATH = "/technical/data/meta.json";
  var TECH_DIR = "/quant/data/product/technical-signals-v1/";
  var LONG_DIR = "/quant/data/market/discover-series-long/";
  var STORE_KEY = "vu-technical-screens-v1";
  var LAST_KEY = "vu-technical-last-ticker-v1";

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* ------------------------------------------------------------ Routen */
  var TICKER = /^[A-Z0-9.-]{1,12}$/;
  function parseRoute(hash) {
    var h = String(hash || "").replace(/^#\/?/, ""), qi = h.indexOf("?");
    var path = (qi >= 0 ? h.slice(0, qi) : h).split("/").filter(Boolean), params = {};
    if (qi >= 0) h.slice(qi + 1).split("&").forEach(function (kv) { if (!kv) return; var p = kv.split("="); params[decodeURIComponent(p[0])] = decodeURIComponent(p.slice(1).join("=") || ""); });
    var head = path[0] || "";
    if (!head) return { view: "home", params: params };
    if (head === "screener") return { view: "screener", tab: path[1] === "gespeichert" ? "saved" : "build", params: params };
    if (head === "methodik") return { view: "method", params: params };
    if (head === "chart") {
      var t = String(path[1] || "").toUpperCase();
      return TICKER.test(t) ? { view: "chart", ticker: t, tab: path[2] === "signale" ? "signals" : "chart", params: params } : { view: "chart", ticker: null, params: params };
    }
    return { view: "notfound", params: params };
  }
  function chartHref(ticker, tab) { return "#/chart/" + encodeURIComponent(ticker) + (tab === "signals" ? "/signale" : ""); }
  /** Zweistelliger Schluessel der technical-signals-Scherben (wie quant/api/product-services.js#technicalShard). */
  function technicalShard(ticker) { return (String(ticker) + "_").slice(0, 2); }
  function technicalPaths(ticker) { return [TECH_DIR + "by-ticker/" + ticker + ".json.gz", TECH_DIR + technicalShard(ticker) + ".json.gz"]; }

  /* ------------------------------------------------- Screener-Zustand */
  var PATTERN_PILLS = [
    { id: "dreieck", label: "Dreiecksformation", types: ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"] },
    { id: "breakout", label: "Breakout", types: ["RESISTANCE_BREAKOUT", "RANGE_BREAKOUT"] },
    { id: "flagge", label: "Flagge", types: ["BULL_FLAG", "BEAR_FLAG"] },
    { id: "wimpel", label: "Wimpel", types: ["BULL_PENNANT", "BEAR_PENNANT"] },
    { id: "doppelboden", label: "Doppelboden", types: ["DOUBLE_BOTTOM"] },
    { id: "doppeltop", label: "Doppeltop", types: ["DOUBLE_TOP"] },
    { id: "sks", label: "Kopf-Schulter", types: ["HEAD_AND_SHOULDERS", "INVERSE_HEAD_AND_SHOULDERS"] },
    { id: "keil", label: "Keil", types: ["RISING_WEDGE", "FALLING_WEDGE"] },
    { id: "kanal", label: "Trendkanal", types: ["ASCENDING_CHANNEL", "DESCENDING_CHANNEL"] },
    { id: "kontraktion", label: "Volatilitätskontraktion", types: ["VOLATILITY_CONTRACTION"] },
    { id: "range", label: "Range", types: ["RECTANGLE"] },
    { id: "tasse", label: "Tasse mit Henkel", types: ["CUP_WITH_HANDLE"] }
  ];
  var TREND_PILLS = [
    { id: "sma200", field: "aboveSma200" }, { id: "hoch52", field: "newHigh52w" }, { id: "sma50", field: "aboveSma50" },
    { id: "kreuz", field: "sma50AboveSma200" }, { id: "hoch200w", field: "newHigh200w" }, { id: "rs", field: "rsPositive", daily: true },
    { id: "supertrend", field: "supertrendUp", daily: true }
  ];
  function trendLabel(p, tf) { var f = Q.field(p.field); return Q.labelOf(f, tf); }

  function defaultState() { return { tf: "1D", patterns: [], confirmed: false, trends: [], vol: false, rsiMax: null, logic: "AND", sort: "" }; }

  function stateFromParams(p) {
    var s = defaultState();
    if (Q.TIMEFRAMES[p.tf]) s.tf = p.tf;
    var known = function (list, ids) { return String(ids || "").split(",").filter(function (x) { return list.some(function (e) { return e.id === x; }); }); };
    s.patterns = known(PATTERN_PILLS, p.muster);
    s.trends = known(TREND_PILLS, p.trend);
    s.confirmed = p.bestaetigt === "1";
    s.vol = p.vol === "1";
    var r = Number(p.rsi);
    s.rsiMax = p.rsi !== undefined && p.rsi !== "" && isNum(r) && r > 0 && r < 100 ? r : null;
    s.logic = p.logik === "oder" ? "OR" : "AND";
    s.sort = Q.field(p.sort) ? p.sort : "";
    return s;
  }
  function paramsFromState(s) {
    var o = [];
    if (s.tf !== "1D") o.push("tf=" + s.tf);
    if (s.patterns.length) o.push("muster=" + s.patterns.join(","));
    if (s.confirmed) o.push("bestaetigt=1");
    if (s.trends.length) o.push("trend=" + s.trends.join(","));
    if (s.vol) o.push("vol=1");
    if (isNum(s.rsiMax)) o.push("rsi=" + s.rsiMax);
    if (s.logic === "OR") o.push("logik=oder");
    if (s.sort) o.push("sort=" + s.sort);
    return o.join("&");
  }

  /**
   * Zustand -> Abfrage. Chartmuster bilden EINE ODER-Bedingung (irgendeines der gewaehlten Muster);
   * jede weitere Auswahl ist eine eigene Bedingung. logic verknuepft die Bedingungen (UND/ODER).
   * Reine Tagesfelder (Muster, Volumen, RS, Supertrend) entfallen bei Woche/Monat und werden in `dropped`
   * gemeldet, damit die Oberflaeche es sagt.
   */
  function queryFromState(s) {
    var groups = [], dropped = [], tf = s.tf;
    function add(filter) {
      var f = Q.field(filter.field);
      if (f.tfs.indexOf(tf) < 0) { dropped.push(Q.labelOf(f, "1D")); return; }
      groups.push({ op: "AND", filters: [filter] });
    }
    if (s.patterns.length) {
      var types = [];
      s.patterns.forEach(function (id) { PATTERN_PILLS.forEach(function (p) { if (p.id === id) p.types.forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); }); }); });
      add({ field: s.confirmed ? "formationConfirmed" : "formationActive", op: "in", value: types });
    }
    s.trends.forEach(function (id) { TREND_PILLS.forEach(function (p) { if (p.id === id) add({ field: p.field, op: "is", value: true }); }); });
    if (s.vol) add({ field: "volAboveAvg", op: "is", value: true });
    if (isNum(s.rsiMax)) add({ field: "rsi14", op: "lt", value: s.rsiMax });
    var sort = s.sort ? { field: s.sort, dir: s.sort === "rsi14" ? "asc" : "desc" } : null;
    if (sort && Q.field(sort.field).tfs.indexOf(tf) < 0) sort = null;
    return { query: { v: 1, timeframe: tf, logic: s.logic, groups: groups, sort: sort, limit: 200 }, dropped: dropped };
  }

  /* --------------------------------------------- Gespeicherte Strategien */
  function loadScreens(storage) {
    try { var raw = storage && storage.getItem(STORE_KEY); var list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list.filter(function (x) { return x && x.id && x.name && typeof x.params === "string"; }).slice(0, 50) : []; }
    catch (e) { return []; }
  }
  function saveScreen(storage, name, params, now) {
    var list = loadScreens(storage), id = "s" + (now || Date.now()).toString(36);
    list.unshift({ id: id, name: String(name).slice(0, 60), params: params, createdAt: new Date(now || Date.now()).toISOString() });
    try { storage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 50))); return { ok: true, id: id }; } catch (e) { return { ok: false }; }
  }
  function deleteScreen(storage, id) {
    var list = loadScreens(storage).filter(function (x) { return x.id !== id; });
    try { storage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  /* -------------------------------------------------------- Befunde */
  var STATE_TONE = { CONFIRMED: "positive", DETECTED: "watch", INVALIDATED: "negative" };
  var STATE_BADGE = { CONFIRMED: "Bestätigt", DETECTED: "Beobachten", INVALIDATED: "Invalidiert" };
  var FAMILY_ICON = { TRENDLINE: "trend", CHANNEL: "trend", WEDGE: "triangle", TRIANGLE: "triangle", PENNANT: "triangle", FLAG: "flag", RANGE: "range", BREAKOUT: "breakout", CONTRACTION: "contraction", REVERSAL: "reversal", CONTINUATION: "flag" };

  function dateDe(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "–"; }
  function price(v) { return isNum(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: v >= 1 ? 2 : 4, maximumFractionDigits: v >= 1 ? 2 : 4 }) + " $" : "–"; }
  function pct(v, d) { return isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toLocaleString("de-DE", { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }) + " %" : "–"; }
  function num(v, d) { return isNum(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) : "–"; }

  function formationText(f) {
    var lv = f.levels || {}, parts = [];
    if (f.state === "CONFIRMED" && f.confirmedAt) parts.push("Bestätigt am " + dateDe(f.confirmedAt) + ".");
    else if (f.state === "INVALIDATED" && f.invalidatedAt) parts.push("Invalidiert am " + dateDe(f.invalidatedAt) + ".");
    else parts.push("Erkannt am " + dateDe(f.detectedAt) + ".");
    var key = isNum(lv.breakout) ? ["Ausbruchsniveau", lv.breakout] : isNum(lv.zoneHigh) ? ["Zone bis", lv.zoneHigh] : isNum(lv.rangeHigh) ? ["Range-Oberkante", lv.rangeHigh]
      : isNum(lv.pivot) ? ["Pivot", lv.pivot] : isNum(lv.lineNow) ? ["Linie heute", lv.lineNow] : isNum(lv.upperNow) ? ["Oberkante heute", lv.upperNow] : null;
    if (key) parts.push(key[0] + " " + price(key[1]) + ".");
    if (isNum(lv.invalidation) && f.state !== "INVALIDATED") parts.push("Ungültig " + (f.direction === "BEARISH" ? "über " : "unter ") + price(lv.invalidation) + ".");
    return parts.join(" ");
  }

  /** Befundkarten fuer das Chart Studio: Formationen + nachvollziehbare Indikatorzustaende. */
  function findings(analysis, features, close) {
    var out = [];
    (analysis && analysis.formations || []).forEach(function (f) {
      out.push({ kind: "formation", id: f.id, title: f.name, text: formationText(f), badge: STATE_BADGE[f.state], tone: STATE_TONE[f.state],
                 icon: FAMILY_ICON[f.family] || "trend", direction: f.direction, formation: f });
    });
    var F = features || {};
    if (isNum(F.sma200) && isNum(close)) {
      var above = close > F.sma200;
      out.push({ kind: "indicator", id: "sma200", title: above ? "Kurs über SMA 200" : "Kurs unter SMA 200", icon: "bars",
                 text: "Schluss " + price(close) + " · SMA 200 " + price(F.sma200) + " (" + pct(close / F.sma200 - 1, 1) + ").", badge: above ? "Bullisch" : "Bärisch", tone: above ? "positive" : "negative" });
    }
    if (isNum(F.sma50) && isNum(F.sma200)) {
      var golden = F.sma50 > F.sma200;
      out.push({ kind: "indicator", id: "cross", title: golden ? "SMA 50 über SMA 200" : "SMA 50 unter SMA 200", icon: "trend",
                 text: "SMA 50 " + price(F.sma50) + " · SMA 200 " + price(F.sma200) + ".", badge: golden ? "Bullisch" : "Bärisch", tone: golden ? "positive" : "negative" });
    }
    if (isNum(F.rsi14)) {
      var zone = F.rsi14 >= 70 ? ["Überkauft", "watch"] : F.rsi14 <= 30 ? ["Überverkauft", "watch"] : ["Neutral", "neutral"];
      out.push({ kind: "indicator", id: "rsi", title: "RSI 14: " + num(F.rsi14, 1), icon: "pulse", text: "Zonen: über 70 überkauft, unter 30 überverkauft (Wilder).", badge: zone[0], tone: zone[1] });
    }
    if (isNum(F.relativeVolume)) {
      var hiVol = F.relativeVolume >= 2 ? ["Spitze", "positive"] : F.relativeVolume > 1 ? ["Erhöht", "neutral"] : ["Normal", "neutral"];
      out.push({ kind: "indicator", id: "volume", title: "Volumen " + num(F.relativeVolume, 2) + "× des 20-Tage-Medians", icon: "bars",
                 text: "Relatives Volumen des letzten Handelstags.", badge: hiVol[0], tone: hiVol[1] });
    }
    return out;
  }

  /** Ein sachlicher Satz je Treffer (keine Wertung): bevorzugt die gesuchte Formation, sonst die juengste, sonst die Marktstruktur. */
  function hitSentence(row, wanted) {
    var list = row.formations || [], f = null;
    if (wanted && wanted.length) f = list.filter(function (x) { return wanted.indexOf(x[0]) >= 0; })[0] || null;
    f = f || list[0];
    if (f) {
      var name = Q.FORMATION_TYPES[f[0]] || f[0];
      return name + ": " + (f[1] === "CONFIRMED" ? "bestätigt" : "in Bildung") + ", erkannt am " + dateDe(f[2]) + ".";
    }
    return row.structure ? "Marktstruktur: " + (Q.STRUCTURES[row.structure] || row.structure) + "." : "Keine aktive Formation.";
  }
  /** Formationstypen, nach denen eine Abfrage sucht. */
  function wantedFormations(query) {
    var out = [];
    (query.groups || []).forEach(function (g) { g.filters.forEach(function (x) { if (x.field === "formationActive" || x.field === "formationConfirmed") x.value.forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); }); }); });
    return out;
  }

  /** Bedingungen, die ein Treffer erfuellt (Chips in der Trefferliste). */
  function matchedChips(row, query) {
    var chips = [];
    (query.groups || []).forEach(function (g) {
      g.filters.forEach(function (x) {
        var f = Q.field(x.field), v = row[Q.columnKey(x.field, query.timeframe)];
        if (f.kind === "enum" && Array.isArray(v)) v.forEach(function (t) { if (x.value.indexOf(t) >= 0 && chips.indexOf(Q.FORMATION_TYPES[t]) < 0) chips.push(Q.FORMATION_TYPES[t]); });
        else if (f.kind === "bool" && v === x.value) chips.push(Q.labelOf(f, query.timeframe));
        else if ((f.kind === "num" || f.kind === "pct") && isNum(v)) chips.push(Q.labelOf(f, query.timeframe) + " " + (f.kind === "pct" ? pct(v, 1) : num(v, 1)));
      });
    });
    return chips.slice(0, 4);
  }

  /** Suche ueber [{s, n}]: exaktes Kuerzel, Kuerzel-Anfang, Namensanfang, Namensteil. */
  function search(entries, q, limit) {
    var t = String(q || "").trim().toUpperCase();
    if (!t) return [];
    var scored = [];
    entries.forEach(function (e) {
      var name = String(e.n || "").toUpperCase(), score = e.s === t ? 0 : e.s.indexOf(t) === 0 ? 1 : name.indexOf(t) === 0 ? 2 : name.indexOf(t) > 0 ? 3 : -1;
      if (score >= 0) scored.push([score, e]);
    });
    scored.sort(function (a, b) { return a[0] - b[0] || a[1].s.length - b[1].s.length || (a[1].s < b[1].s ? -1 : 1); });
    return scored.slice(0, limit || 8).map(function (x) { return x[1]; });
  }

  var api = {
    SCREENER_PATH: SCREENER_PATH, META_PATH: META_PATH, LONG_DIR: LONG_DIR, STORE_KEY: STORE_KEY, LAST_KEY: LAST_KEY,
    PATTERN_PILLS: PATTERN_PILLS, TREND_PILLS: TREND_PILLS, trendLabel: trendLabel,
    parseRoute: parseRoute, chartHref: chartHref, technicalShard: technicalShard, technicalPaths: technicalPaths,
    defaultState: defaultState, stateFromParams: stateFromParams, paramsFromState: paramsFromState, queryFromState: queryFromState,
    loadScreens: loadScreens, saveScreen: saveScreen, deleteScreen: deleteScreen,
    findings: findings, formationText: formationText, hitSentence: hitSentence, wantedFormations: wantedFormations, matchedChips: matchedChips,
    search: search, dateDe: dateDe, price: price, pct: pct, num: num
  };
  if (isNode) module.exports = api;
  else { global.VUTechnicalModel = api; }
})(typeof window !== "undefined" ? window : globalThis);
