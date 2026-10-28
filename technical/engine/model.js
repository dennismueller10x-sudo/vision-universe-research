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
  /* Schlanker Index fuer Startseite und Chart Studio (Kuerzel, Namen, Trefferzahlen der Vorlagen) - spart den vollen Datensatz. */
  var INDEX_PATH = "/technical/data/index-v1.json";
  var INDEX_SCHEMA = "vu-technical-index-1.0.0";
  /* Historische Evidenz der Formationen (scripts/technical/world/formation-evidence.mjs). */
  var EVIDENCE_PATH = "/technical/data/formation-evidence.json";
  /* Startseite: "Setups im Fokus" und Ranglisten (Vorlagen aus technical-query.js). */
  var FOCUS = ["breakout", "trend", "triangles"], RANKS = ["high52", "aboveSma200", "high200w", "contraction"];
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
    { id: "tasse", label: "Tasse mit Henkel", types: ["CUP_WITH_HANDLE"] },
    { id: "luecke", label: "Kurslücke", types: ["GAP_UP", "GAP_DOWN"] }
  ];
  var TREND_PILLS = [
    { id: "sma200", field: "aboveSma200" }, { id: "hoch52", field: "newHigh52w" }, { id: "sma50", field: "aboveSma50" },
    { id: "kreuz", field: "sma50AboveSma200" }, { id: "hoch200w", field: "newHigh200w" }, { id: "rs", field: "rsPositive", daily: true },
    { id: "supertrend", field: "supertrendUp", daily: true }, { id: "wolke", field: "aboveCloud", daily: true }, { id: "psar", field: "psarUp", daily: true }
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
  /*
   * Bedeutung gespeicherter Suchen in Worten ("q=..."): Seit query-text 1.5.0 (Audit B12) meinen
   * "Golden Cross"/"Death Cross" das Kreuzungsereignis, vorher den Zustand "SMA 50 ueber/unter SMA 200".
   * Gespeicherte Texte ohne Bedeutungsstand "qv" stammen von vorher und werden einmalig ausdruecklich
   * umgeschrieben, damit sie ihre Bedeutung behalten. Neue Speicherungen tragen qv=2.
   */
  var QUERY_TEXT_SEMANTICS = "2";
  function migrateParams(params) {
    var parts = String(params || "").split("&"), qi = -1, hasQv = false;
    parts.forEach(function (kv, i) { var k = kv.split("=")[0]; if (k === "q") qi = i; if (k === "qv") hasQv = true; });
    if (qi < 0 || hasQv) return { params: params, changed: false, rewritten: false };
    var text;
    try { text = decodeURIComponent(parts[qi].slice(2).replace(/\+/g, " ")); } catch (e) { return { params: params, changed: false, rewritten: false }; }
    var next = text.replace(/golden\s+cross/gi, "SMA 50 über SMA 200").replace(/death\s+cross/gi, "SMA 50 unter SMA 200");
    parts[qi] = "q=" + encodeURIComponent(next);
    parts.push("qv=" + QUERY_TEXT_SEMANTICS);
    return { params: parts.join("&"), changed: true, rewritten: next !== text, from: text, to: next };
  }
  function stampParams(params) { return /(^|&)q=/.test(params) && !/(^|&)qv=/.test(params) ? params + "&qv=" + QUERY_TEXT_SEMANTICS : params; }
  function loadScreens(storage) {
    var list;
    try { var raw = storage && storage.getItem(STORE_KEY); list = raw ? JSON.parse(raw) : []; if (!Array.isArray(list)) return []; }
    catch (e) { return []; }
    list = list.filter(function (x) { return x && x.id && x.name && typeof x.params === "string"; }).slice(0, 50);
    var migrated = false;
    list.forEach(function (x) {
      var m = migrateParams(x.params);
      if (!m.changed) return;
      migrated = true; x.params = m.params;
      if (m.rewritten) x.migrated = { from: m.from, to: m.to, reason: "Golden/Death Cross bedeuten seit Technical-Suche 1.5.0 das Ereignis; die gespeicherte Suche behaelt den Zustand." };
    });
    if (migrated) { try { storage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* bleibt im Speicher migriert */ } }
    return list;
  }
  function saveScreen(storage, name, params, now) {
    params = stampParams(params);
    var list = loadScreens(storage), id = "s" + (now || Date.now()).toString(36);
    list.unshift({ id: id, name: String(name).slice(0, 60), params: params, createdAt: new Date(now || Date.now()).toISOString() });
    try { storage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 50))); return { ok: true, id: id }; } catch (e) { return { ok: false }; }
  }
  /* ---------------------------------------------------------- Evidenz */
  function pctDe(v, d) { return typeof v === "number" && isFinite(v) ? (v * 100).toLocaleString("de-DE", { minimumFractionDigits: d === undefined ? 0 : d, maximumFractionDigits: d === undefined ? 0 : d }) + " %" : "–"; }
  function signedPct(v) { return (v > 0 ? "+" : v < 0 ? "−" : "±") + pctDe(Math.abs(v), 1); }
  /**
   * Ein Satz zur historischen Evidenz eines Formationstyps. Keine Aussage ohne ausreichende Stichprobe;
   * eine Ueberrendite heisst nur "belastbar", wenn sie die Mehrfachtest-Korrektur besteht.
   */
  function evidenceText(e, window) {
    if (!e) return "Für diesen Typ liegt keine historische Auswertung vor.";
    var span = window && window.from ? " (Erkennungen " + dateDe(window.from) + " – " + dateDe(window.to) + ")" : "";
    if (!e.published) return "Zu wenige Fälle für eine Aussage (n = " + e.n.toLocaleString("de-DE") + span + ").";
    return "n = " + e.n.toLocaleString("de-DE") + span + ": nach 20 Handelstagen bestätigt " + pctDe(e.confirmedBy20) + ", invalidiert " + pctDe(e.invalidatedBy20) +
      ", entfallen " + pctDe(e.droppedBy20) + ". Rendite ggü. allen Titeln am selben Tag " + signedPct(e.excess20Mean) + " (± " + pctDe(e.excess20Ci95, 1) + ") – " +
      (e.significant ? "nach Mehrfachtest-Korrektur belastbar, aber nur ein Marktjahr." : "statistisch nicht belastbar.");
  }

  /** Umbenennen bzw. Filter einer gespeicherten Suchstrategie ersetzen (gleiche ID, Zeitstempel "updatedAt"). */
  function updateScreen(storage, id, patch, now) {
    var list = loadScreens(storage), hit = false;
    list = list.map(function (x) {
      if (x.id !== id) return x;
      hit = true;
      var y = Object.assign({}, x, { updatedAt: new Date(now || Date.now()).toISOString() });
      if (patch && typeof patch.name === "string" && patch.name.trim()) y.name = patch.name.trim().slice(0, 60);
      if (patch && typeof patch.params === "string") y.params = stampParams(patch.params);
      return y;
    });
    if (!hit) return false;
    try { storage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  /** Export als JSON (Format vu-technical-screens-1); nur Name und Filteradresse, keine Treffer. */
  function exportScreens(storage) {
    return JSON.stringify({ format: "vu-technical-screens-1", screens: loadScreens(storage).map(function (x) { return { name: x.name, params: x.params, createdAt: x.createdAt }; }) }, null, 1);
  }
  /**
   * Import: nur bekannte Adressparameter (preset, q, muster, trend, ...), gleiche Filteradresse wird nicht doppelt
   * angelegt, hoechstens 50 Eintraege. Liefert { ok, added, skipped, error? }.
   */
  var PARAM_KEYS = ["preset", "q", "qv", "muster", "bestaetigt", "trend", "vol", "rsi", "logik", "sort", "tf"];
  function importScreens(storage, text, now) {
    var doc;
    try { doc = JSON.parse(text); } catch (e) { return { ok: false, added: 0, skipped: 0, error: "KEIN_JSON" }; }
    var items = doc && doc.format === "vu-technical-screens-1" && Array.isArray(doc.screens) ? doc.screens : null;
    if (!items) return { ok: false, added: 0, skipped: 0, error: "FORMAT" };
    var list = loadScreens(storage), have = {}, added = 0, skipped = 0, t = now || Date.now();
    list.forEach(function (x) { have[x.params] = 1; });
    items.forEach(function (x, i) {
      var params = x && typeof x.params === "string" ? x.params : null;
      var okKeys = params !== null && params.split("&").every(function (kv) { return !kv || PARAM_KEYS.indexOf(kv.split("=")[0]) >= 0; });
      if (okKeys) params = migrateParams(params).params;
      if (!okKeys || !x.name || have[params] || list.length >= 50) { skipped++; return; }
      have[params] = 1; added++;
      list.push({ id: "s" + (t + i).toString(36) + "i", name: String(x.name).slice(0, 60), params: params, createdAt: new Date(t).toISOString() });
    });
    try { storage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { return { ok: false, added: 0, skipped: items.length, error: "SPEICHER" }; }
    return { ok: true, added: added, skipped: skipped };
  }

  /* ------------------------------------------------- Filter-Baukasten */
  /* Zeilen { field, op, value, value2 } je Gruppe; Gruppen sind ODER-verknuepft, Zeilen einer Gruppe UND. Prozentfelder
     werden in der Oberflaeche in Prozent eingegeben und als Anteil gespeichert. */
  function builderFromQuery(query) {
    var v = Q.validate(query || { groups: [] }), q = v.query;
    var groups = q.groups.filter(function (g) { return g.filters.length; });
    if (q.logic === "AND" && groups.length > 1) groups = [{ filters: [].concat.apply([], groups.map(function (g) { return g.filters; })) }];
    return { tf: q.timeframe, groups: groups.length ? groups.map(function (g) { return g.filters.map(function (f) { var o = { field: f.field, op: f.op, value: f.value }; if (f.op === "between") o.value2 = f.value2; if (f.tf) o.tf = f.tf; return o; }); }) : [[]] };
  }
  function queryFromBuilder(b) {
    var groups = (b.groups || []).map(function (rows) { return { op: "AND", filters: rows.filter(function (r) { return r && r.field; }) }; }).filter(function (g) { return g.filters.length; });
    return { v: 1, timeframe: b.tf || "1D", logic: groups.length > 1 ? "OR" : "AND", groups: groups, sort: null, limit: 200 };
  }
  /** Eingabetext -> Wert (Komma oder Punkt; Prozentfelder in Prozent). NaN bei ungueltiger Eingabe. */
  function parseFieldInput(fieldId, text) {
    var f = Q.field(fieldId), v = Number(String(text).trim().replace(",", "."));
    if (!f || String(text).trim() === "" || !isFinite(v)) return NaN;
    return f.kind === "pct" ? Math.round(v * 1e6) / 1e8 : v;
  }
  function formatFieldInput(fieldId, v) {
    var f = Q.field(fieldId);
    if (!f || typeof v !== "number" || !isFinite(v)) return "";
    return String(f.kind === "pct" ? Math.round(v * 1e6) / 1e4 : v).replace(".", ",");
  }
  /** Standardzeile fuer ein Feld (sinnvoller Startwert je Art). */
  function defaultRow(fieldId) {
    var f = Q.field(fieldId);
    if (!f) return null;
    if (f.kind === "bool") return { field: f.id, op: "is", value: true };
    if (f.kind === "enum") return { field: f.id, op: "in", value: [Object.keys(f.values)[0]] };
    return { field: f.id, op: "gt", value: f.kind === "pct" ? 0 : 50 };
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

  var BREAK_DIR = { UP: "nach oben", DOWN: "nach unten" };
  /** Zustandsetikett mit den ehrlichen Sonderfaellen (vorlaeufiger Kanal, bei Erkennung bereits ausgebrochen). */
  function stateBadge(f) {
    if (f.state === "CONFIRMED" && f.confirmedAtDetection) return "Bei Erkennung ausgebrochen";
    if (f.state === "DETECTED" && f.provisional) return "Vorläufig";
    return STATE_BADGE[f.state];
  }
  function formationText(f) {
    var lv = f.levels || {}, parts = [], br = f.breakout;
    if (f.state === "CONFIRMED" && f.confirmedAtDetection && br) parts.push("Bei der ersten zuverlässigen Erkennung am " + dateDe(f.detectedAt) + " bereits ausgebrochen (" + BREAK_DIR[br.direction] + ", " + dateDe(br.at) + "); vorher war die Formation nicht erkennbar.");
    else if (f.state === "CONFIRMED" && br) parts.push("Ausbruch " + BREAK_DIR[br.direction] + " am " + dateDe(br.at) + ", erkannt seit " + dateDe(f.detectedAt) + ".");
    else if (f.state === "CONFIRMED" && f.confirmedAt) parts.push("Bestätigt am " + dateDe(f.confirmedAt) + ".");
    else if (f.state === "INVALIDATED" && f.invalidatedAt) parts.push("Invalidiert am " + dateDe(f.invalidatedAt) + (br ? " nach Ausbruch " + BREAK_DIR[br.direction] + " am " + dateDe(br.at) : "") + ".");
    else if (f.provisional) parts.push("Vorläufig erkannt am " + dateDe(f.detectedAt) + " aus vier bestätigten Swing-Punkten; bestätigt erst, wenn ein fünfter Punkt im Kanal liegt.");
    else if (f.directionOpen) parts.push("Erkannt am " + dateDe(f.detectedAt) + ", noch ohne Ausbruch – Richtung offen.");
    else parts.push("Erkannt am " + dateDe(f.detectedAt) + ".");
    var key = isNum(lv.breakout) ? ["Ausbruchsniveau", lv.breakout] : isNum(lv.zoneHigh) ? ["Zone bis", lv.zoneHigh] : isNum(lv.rangeHigh) ? ["Range-Oberkante", lv.rangeHigh]
      : isNum(lv.pivot) ? ["Pivot", lv.pivot] : isNum(lv.lineNow) ? ["Linie heute", lv.lineNow] : isNum(lv.upperNow) ? ["Oberkante heute", lv.upperNow] : null;
    if (key) parts.push(key[0] + " " + price(key[1]) + ".");
    if (isNum(lv.invalidation) && f.state !== "INVALIDATED" && !f.directionOpen) parts.push("Ungültig " + (f.direction === "BEARISH" ? "über " : "unter ") + price(lv.invalidation) + ".");
    return parts.join(" ");
  }

  /** Befundkarten fuer das Chart Studio: Formationen + nachvollziehbare Indikatorzustaende. */
  /* Chart Studio: Schichten im Kurs (beliebig kombinierbar) und Unterfenster (eines zur Zeit). */
  var CHART_LAYERS = [["trend", "Trendlinien"], ["muster", "Muster"], ["niveaus", "Niveaus"], ["sma", "SMA 50/200"], ["ema", "EMA 20/50/200"], ["bb", "Bollinger"],
    ["keltner", "Keltner"], ["donchian", "Donchian"], ["ichimoku", "Ichimoku"], ["supertrend", "Supertrend"], ["psar", "Parabolic SAR"], ["vwma", "VWMA 20"],
    ["hma", "Hull MA 20"], ["chandelier", "Chandelier-Stop"], ["kerzen", "Kerzenmuster"], ["volumen", "Volumen"]];
  var CHART_PANES = [["rsi", "RSI"], ["macd", "MACD"], ["stoch", "Stochastik"], ["adx", "ADX"], ["atr", "ATR"], ["cci", "CCI"], ["williams", "Williams %R"], ["aroon", "Aroon"],
    ["mfi", "MFI"], ["obv", "OBV"], ["cmf", "CMF"], ["roc", "ROC"], ["crsi", "Connors RSI"], ["zscore", "Z-Score"], ["elder", "Elder Impulse"], ["vortex", "Vortex"],
    ["chop", "Choppiness"], ["hv", "Hist. Volatilität"], ["ulcer", "Ulcer"]];
  /**
   * Wo Chart Studio jedes Indikatorfeld des Screeners zeigt (AP5b, Completion-Matrix G4): ["layer"|"pane", id] =
   * Schicht oder Unterfenster, "price" = im Kurs selbst (Kerzen, Tageshoch), "weekly" = Wochenchart, "signals" = Befundkarte.
   * null = noch ohne Darstellung, mit Grund in TECHNICAL_COMPLETION_PLAN.md (G4). Ein neues Feld braucht hier einen Eintrag.
   */
  var FIELD_CHART = {
    aboveSma200: ["layer", "sma"], aboveSma50: ["layer", "sma"], sma50AboveSma200: ["layer", "sma"], distSma200: ["layer", "sma"],
    aboveEma20: ["layer", "ema"], aboveEma50: ["layer", "ema"], aboveEma200: ["layer", "ema"], distEma200: ["layer", "ema"],
    adx: ["pane", "adx"], supertrendUp: ["layer", "supertrend"], structure: ["signals"], psarUp: ["layer", "psar"], aboveCloud: ["layer", "ichimoku"],
    aroonOsc: ["pane", "aroon"], newHigh52w: ["price"], distHigh52w: ["price"], newHigh200w: ["weekly"], distHigh200w: ["weekly"],
    rsi14: ["pane", "rsi"], macdPositive: ["pane", "macd"], stochK: ["pane", "stoch"], cci20: ["pane", "cci"],
    roc21: ["pane", "roc"], roc63: ["pane", "roc"], roc126: ["pane", "roc"], roc252: ["pane", "roc"], williamsR: ["pane", "williams"],
    connorsRsi: ["pane", "crsi"], zScore20: ["pane", "zscore"], elderImpulse: ["pane", "elder"], vortexBull: ["pane", "vortex"],
    hmaRising: ["layer", "hma"], distChandelierLong: ["layer", "chandelier"], newHigh20d: ["layer", "donchian"], newLow20d: ["layer", "donchian"],
    choppiness14: ["pane", "chop"], histVol20: ["pane", "hv"], ulcer14: ["pane", "ulcer"],
    rs3m: null, rs6m: null, rsPositive: null,
    relVol: ["layer", "volumen"], volAboveAvg: ["layer", "volumen"], volSpike: ["layer", "volumen"], mfi14: ["pane", "mfi"], obvRising: ["pane", "obv"],
    cmf20: ["pane", "cmf"], atrPct: ["pane", "atr"], bbPctB: ["layer", "bb"], bbSqueeze: ["layer", "bb"], insideBar: ["price"], nr7: ["price"]
  };

  /**
   * Kerzenmuster als Chartmarken (AP5): je Bar ab `from` die erkannten Muster der Screener-Liste, eingeteilt wie
   * screen-row.js#candleBlock: neutral (Doji, Spinning Top …) nach Musterart, sonst Vorzeichen des Werts (+1 bullisch,
   * −1 baerisch; "both"-Muster je Fall). Bullisch unter dem Tief, baerisch ueber dem Hoch, neutral am Schluss (klein).
   * Beschriftet wird nur die juengste Marke je Richtung, damit der Chart lesbar bleibt.
   * @param patterns Candlesticks.detect(...).patterns   @param meta Candlesticks.PATTERNS   @param names Query.CANDLE_TYPES
   * @returns [{ time, price, tone, size, label?, kind, ids }]
   */
  function candleMarks(S, patterns, meta, names, from) {
    var byId = {}, out = [], lastOf = {};
    (meta || []).forEach(function (p) { byId[p.id] = p; });
    var ids = Object.keys(patterns || {}).filter(function (id) { return byId[id] && names && names[id]; });
    for (var i = Math.max(0, from || 0); i < S.close.length; i++) {
      var hit = { bull: [], bear: [], neutral: [] };
      ids.forEach(function (id) {
        var v = patterns[id][i];
        if (typeof v !== "number" || !isFinite(v) || v === 0) return;
        hit[byId[id].direction === "neutral" ? "neutral" : v > 0 ? "bull" : "bear"].push(id);
      });
      ["bull", "bear", "neutral"].forEach(function (k) {
        if (!hit[k].length) return;
        var price = k === "bull" ? S.low[i] : k === "bear" ? S.high[i] : S.close[i];
        out.push({ time: S.dates[i], price: price, tone: k === "bull" ? "positive" : k === "bear" ? "negative" : "muted", size: k === "neutral" ? 2 : 3.5, kind: k, ids: hit[k] });
        if (k !== "neutral") lastOf[k] = out.length - 1;
      });
    }
    Object.keys(lastOf).forEach(function (k) {
      var m = out[lastOf[k]], first = names[m.ids[0]];
      m.label = first + (m.ids.length > 1 ? " +" + (m.ids.length - 1) : "");
      m.badge = "muted";
    });
    return out;
  }

  function findings(analysis, features, close) {
    var out = [];
    (analysis && analysis.formations || []).forEach(function (f) {
      out.push({ kind: "formation", id: f.id, title: f.name, text: formationText(f), badge: stateBadge(f), tone: STATE_TONE[f.state],
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
      var name = Q.FORMATION_TYPES[f[0]] || f[0], flags = f[5] || "", dir = BREAK_DIR[f[4]];
      if (f[1] === "CONFIRMED" && flags.indexOf("B") >= 0) return name + ": bei Erkennung am " + dateDe(f[2]) + " bereits ausgebrochen" + (dir ? " (" + dir + ")" : "") + ".";
      if (f[1] === "CONFIRMED") return name + ": Ausbruch" + (dir ? " " + dir : "") + (f[3] ? " am " + dateDe(f[3]) : "") + ", erkannt am " + dateDe(f[2]) + ".";
      if (flags.indexOf("V") >= 0) return name + ": vorläufig (vier Swing-Punkte), erkannt am " + dateDe(f[2]) + ".";
      return name + ": in Bildung" + (flags.indexOf("O") >= 0 ? ", Richtung offen" : "") + ", erkannt am " + dateDe(f[2]) + ".";
    }
    return row.structure ? "Marktstruktur: " + (Q.STRUCTURES[row.structure] || row.structure) + "." : "Keine aktive Formation.";
  }
  /** Formationstypen, nach denen eine Abfrage sucht. */
  function wantedFormations(query) {
    var out = [];
    (query.groups || []).forEach(function (g) { g.filters.forEach(function (x) { if (x.field === "formationActive" || x.field === "formationConfirmed" || x.field === "formationOpen") x.value.forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); }); }); });
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

  /**
   * Index aus dem Screener-Datensatz: eine Rechnung fuer Erzeuger (build-screener.mjs) und Rueckfall im Browser.
   * presets = Trefferzahl je Vorlage; focusUnion = Titel in mindestens einer Fokus-Vorlage (je hoechstens 500, wie die Anzeige).
   */
  function homeIndex(artifact) {
    var ds = Q.createDataset(artifact), presets = {}, union = {};
    Q.PRESETS.forEach(function (p) {
      var r = Q.evaluate(ds, Object.assign({}, p.query, { limit: 500 }));
      presets[p.id] = r.count;
      if (FOCUS.indexOf(p.id) >= 0) r.indices.forEach(function (i) { union[i] = 1; });
    });
    return { schemaVersion: INDEX_SCHEMA, asOf: artifact.asOf, count: artifact.count, s: artifact.cols.s.slice(), n: artifact.cols.n.slice(),
      presets: presets, focusUnion: Object.keys(union).length };
  }

  var api = {
    SCREENER_PATH: SCREENER_PATH, META_PATH: META_PATH, EVIDENCE_PATH: EVIDENCE_PATH, evidenceText: evidenceText, INDEX_PATH: INDEX_PATH, INDEX_SCHEMA: INDEX_SCHEMA, FOCUS: FOCUS, RANKS: RANKS, homeIndex: homeIndex, LONG_DIR: LONG_DIR, STORE_KEY: STORE_KEY, LAST_KEY: LAST_KEY,
    PATTERN_PILLS: PATTERN_PILLS, STATE_BADGE: STATE_BADGE, TREND_PILLS: TREND_PILLS, trendLabel: trendLabel,
    parseRoute: parseRoute, chartHref: chartHref, technicalShard: technicalShard, technicalPaths: technicalPaths,
    defaultState: defaultState, stateFromParams: stateFromParams, paramsFromState: paramsFromState, queryFromState: queryFromState,
    loadScreens: loadScreens, saveScreen: saveScreen, migrateParams: migrateParams, QUERY_TEXT_SEMANTICS: QUERY_TEXT_SEMANTICS, deleteScreen: deleteScreen, updateScreen: updateScreen, exportScreens: exportScreens, importScreens: importScreens,
    builderFromQuery: builderFromQuery, queryFromBuilder: queryFromBuilder, parseFieldInput: parseFieldInput, formatFieldInput: formatFieldInput, defaultRow: defaultRow,
    findings: findings, candleMarks: candleMarks, CHART_LAYERS: CHART_LAYERS, CHART_PANES: CHART_PANES, FIELD_CHART: FIELD_CHART, formationText: formationText, hitSentence: hitSentence, wantedFormations: wantedFormations, matchedChips: matchedChips,
    search: search, dateDe: dateDe, price: price, pct: pct, num: num
  };
  if (isNode) module.exports = api;
  else { global.VUTechnicalModel = api; }
})(typeof window !== "undefined" ? window : globalThis);
