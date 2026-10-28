/* =========================================================================
   VISION UNIVERSE TECHNICAL — technical-query.js
   STRUKTURIERTE, VALIDIERBARE SCREENER-ABFRAGE

   Modell (bewusst deckungsgleich mit screener/engine/query.js, damit
   Werkzeuge wie vu-ask beide Welten gleich ansprechen koennen):

     { v: 1, timeframe: "1D"|"1W"|"1M", logic: "AND"|"OR",
       groups: [{ op: "AND"|"OR", filters: [{ field, op, value, value2? }] }],
       sort: { field, dir: "asc"|"desc" } | null, limit }

   Operatoren:  Zahl  gt gte lt lte between
                Wahr  is
                Liste in (Treffer, wenn einer der Werte vorkommt)

   KI-VORBEREITUNG: jsonSchema() liefert das Ausgabeschema fuer ein
   Sprachmodell (Structured Output). Das Modell UEBERSETZT nur; validate()
   prueft jede Antwort, evaluate() rechnet deterministisch auf dem
   Datensatz. Kein Modellaufruf in diesem Modul.

   Fehlende Werte erfuellen keine Bedingung; der Trichter zeigt, wie viele
   Titel ein Filter wegen fehlender Daten verliert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var QUERY_VERSION = "technical-query-1.9.0";
  var TIMEFRAMES = { "1D": "Tag", "1W": "Woche", "1M": "Monat" };
  var MAX_GROUPS = 6, MAX_FILTERS = 30, MAX_LIMIT = 500;

  var FORMATION_TYPES = {
    SYMMETRICAL_TRIANGLE: "Symmetrisches Dreieck", ASCENDING_TRIANGLE: "Aufsteigendes Dreieck", DESCENDING_TRIANGLE: "Absteigendes Dreieck",
    BULL_FLAG: "Bullische Flagge", BEAR_FLAG: "Bärische Flagge", BULL_PENNANT: "Bullischer Wimpel", BEAR_PENNANT: "Bärischer Wimpel",
    RISING_WEDGE: "Steigender Keil", FALLING_WEDGE: "Fallender Keil", DOUBLE_TOP: "Doppeltop", DOUBLE_BOTTOM: "Doppelboden",
    HEAD_AND_SHOULDERS: "Schulter-Kopf-Schulter", INVERSE_HEAD_AND_SHOULDERS: "Umgekehrte Schulter-Kopf-Schulter",
    RECTANGLE: "Seitwärtsrange (Rechteck)", CUP_WITH_HANDLE: "Tasse mit Henkel",
    SUPPORT_TRENDLINE: "Steigende Unterstützungslinie", RESISTANCE_TRENDLINE: "Fallende Widerstandslinie",
    ASCENDING_CHANNEL: "Aufwärtskanal", DESCENDING_CHANNEL: "Abwärtskanal",
    RANGE_BREAKOUT: "Range-Ausbruch", RESISTANCE_BREAKOUT: "Ausbruch über Widerstand", VOLATILITY_CONTRACTION: "Volatilitätskontraktion",
    GAP_UP: "Kurslücke nach oben", GAP_DOWN: "Kurslücke nach unten"
  };
  /* Kerzenmuster (candlesticks.js, docs/technical/CANDLESTICKS.md); Ids wie dort, Namen deutsch. */
  var CANDLE_TYPES = {
    doji: "Doji", dragonflyDoji: "Libellen-Doji", gravestoneDoji: "Grabstein-Doji", longLeggedDoji: "Long-Legged Doji",
    hammer: "Hammer", hangingMan: "Hanging Man", invertedHammer: "Umgekehrter Hammer", shootingStar: "Shooting Star",
    marubozu: "Marubozu", spinningTop: "Spinning Top", engulfing: "Engulfing (umschließend)", harami: "Harami",
    haramiCross: "Harami Cross", piercing: "Piercing Line", darkCloudCover: "Dark Cloud Cover", tweezer: "Tweezer Top/Bottom",
    kicking: "Kicker (Kicking)", morningStar: "Morning Star", eveningStar: "Evening Star", morningDojiStar: "Morning Doji Star",
    eveningDojiStar: "Evening Doji Star", abandonedBaby: "Abandoned Baby", threeWhiteSoldiers: "Three White Soldiers",
    threeBlackCrows: "Three Black Crows", threeInside: "Three Inside Up/Down", threeOutside: "Three Outside Up/Down",
    threeMethods: "Rising/Falling Three Methods"
  };
  var STRUCTURES = { BULLISH: "Aufwärtsstruktur", BEARISH: "Abwärtsstruktur", RANGE: "Seitwärts", NEUTRAL: "Neutral" };

  var ALL = ["1D", "1W", "1M"], D = ["1D"];
  /* group, id, label, kind (num|pct|bool|enum), tfs, hint; Labels mit Zeitrahmenvarianten als Objekt. */
  var FIELDS = [
    { id: "aboveSma200", group: "Trend", kind: "bool", tfs: ALL, label: { "1D": "Kurs über SMA 200", "1W": "Kurs über 40-Wochen-Linie", "1M": "Kurs über 10-Monats-Linie" } },
    { id: "aboveSma50", group: "Trend", kind: "bool", tfs: ALL, label: { "1D": "Kurs über SMA 50", "1W": "Kurs über 10-Wochen-Linie", "1M": "Kurs über 5-Monats-Linie" } },
    { id: "sma50AboveSma200", group: "Trend", kind: "bool", tfs: ALL, label: { "1D": "SMA 50 über SMA 200", "1W": "10- über 40-Wochen-Linie", "1M": "5- über 10-Monats-Linie" } },
    { id: "aboveEma20", group: "Trend", kind: "bool", tfs: D, label: "Kurs über EMA 20" },
    { id: "aboveEma50", group: "Trend", kind: "bool", tfs: D, label: "Kurs über EMA 50" },
    { id: "aboveEma200", group: "Trend", kind: "bool", tfs: D, label: "Kurs über EMA 200" },
    { id: "distEma200", group: "Trend", kind: "pct", tfs: D, label: "Abstand zur EMA 200" },
    { id: "distSma200", group: "Trend", kind: "pct", tfs: ALL, label: { "1D": "Abstand zur SMA 200", "1W": "Abstand zur 40-Wochen-Linie", "1M": "Abstand zur 10-Monats-Linie" } },
    { id: "adx", group: "Trend", kind: "num", tfs: ALL, label: { "1D": "ADX 14 (Trendstärke)", "1W": "ADX 14 (Woche)", "1M": "ADX 14 (Monat)" } },
    { id: "supertrendUp", group: "Trend", kind: "bool", tfs: D, label: "Supertrend (10, 3) aufwärts" },
    { id: "structure", group: "Trend", kind: "enum", tfs: D, label: "Marktstruktur (Swings)", values: STRUCTURES },
    { id: "psarUp", group: "Trend", kind: "bool", tfs: D, label: "Parabolic SAR unter dem Kurs (aufwärts)" },
    { id: "aboveCloud", group: "Trend", kind: "bool", tfs: D, label: "Kurs über der Ichimoku-Wolke" },
    { id: "aroonOsc", group: "Trend", kind: "num", tfs: D, label: "Aroon-Oszillator 25 (−100 bis 100)" },
    { id: "newHigh52w", group: "Hochs", kind: "bool", tfs: ALL, label: { "1D": "Neues 52-Wochen-Hoch (Tageshoch)", "1W": "52-Wochen-Hoch (Wochenschluss)", "1M": "12-Monats-Hoch (Monatsschluss)" } },
    { id: "distHigh52w", group: "Hochs", kind: "pct", tfs: ALL, label: { "1D": "Abstand zum 52-Wochen-Hoch", "1W": "Abstand zum 52-Wochen-Schlusshoch", "1M": "Abstand zum 12-Monats-Schlusshoch" } },
    { id: "newHigh200w", group: "Hochs", kind: "bool", tfs: ALL, tfIndependent: true, label: "Neues 200-Wochen-Hoch (Wochenschluss)" },
    { id: "distHigh200w", group: "Hochs", kind: "pct", tfs: ALL, tfIndependent: true, label: "Abstand zum 200-Wochen-Schlusshoch" },
    { id: "rsi14", group: "Momentum", kind: "num", tfs: ALL, label: { "1D": "RSI 14", "1W": "RSI 14 (Woche)", "1M": "RSI 14 (Monat)" } },
    { id: "macdPositive", group: "Momentum", kind: "bool", tfs: ALL, label: { "1D": "MACD-Histogramm positiv", "1W": "MACD-Histogramm positiv (Woche)", "1M": "MACD-Histogramm positiv (Monat)" } },
    { id: "stochK", group: "Momentum", kind: "num", tfs: ALL, label: { "1D": "Stochastik %K (14, 3)", "1W": "Stochastik %K (14, 3, Woche)", "1M": "Stochastik %K (14, 3, Monat)" } },
    { id: "cci20", group: "Momentum", kind: "num", tfs: D, label: "CCI 20" },
    /* ROC seit 1.8.0 (L7) auch je Woche/Monat: dieselbe Kalenderspanne in Wochen- bzw. Monatsbars. */
    { id: "roc21", group: "Momentum", kind: "pct", tfs: ALL, label: { "1D": "Kursänderung 21 Tage (ROC)", "1W": "Kursänderung 4 Wochen (ROC)", "1M": "Kursänderung 1 Monat (ROC)" } },
    { id: "roc63", group: "Momentum", kind: "pct", tfs: ALL, label: { "1D": "Kursänderung 63 Tage (ROC, 3 Monate)", "1W": "Kursänderung 13 Wochen (ROC)", "1M": "Kursänderung 3 Monate (ROC)" } },
    { id: "roc126", group: "Momentum", kind: "pct", tfs: ALL, label: { "1D": "Kursänderung 126 Tage (ROC, 6 Monate)", "1W": "Kursänderung 26 Wochen (ROC)", "1M": "Kursänderung 6 Monate (ROC)" } },
    { id: "roc252", group: "Momentum", kind: "pct", tfs: ALL, label: { "1D": "Kursänderung 252 Tage (ROC, 12 Monate)", "1W": "Kursänderung 52 Wochen (ROC)", "1M": "Kursänderung 12 Monate (ROC)" } },
    { id: "williamsR", group: "Momentum", kind: "num", tfs: D, label: "Williams %R 14 (−100 bis 0)" },
    /* L9 (seit 1.9.0): weitere Katalogindikatoren am Stichtag, nur Tag. */
    { id: "connorsRsi", group: "Momentum", kind: "num", tfs: D, label: "Connors RSI (3/2/100)" },
    { id: "zScore20", group: "Momentum", kind: "num", tfs: D, label: "Z-Score 20 (Abstand zum 20-Tage-Mittel in Standardabweichungen)" },
    { id: "elderImpulse", group: "Momentum", kind: "num", tfs: D, label: "Elder Impulse (+1 grün, 0 blau, −1 rot)" },
    { id: "vortexBull", group: "Trend", kind: "bool", tfs: D, label: "Vortex: VI+ über VI− (14)" },
    { id: "hmaRising", group: "Trend", kind: "bool", tfs: D, label: "Hull MA 20 steigt" },
    { id: "distChandelierLong", group: "Trend", kind: "pct", tfs: D, label: "Abstand zum Chandelier-Stop (lang, 22/3)" },
    { id: "newHigh20d", group: "Hochs", kind: "bool", tfs: D, label: "Schluss über dem 20-Tage-Hoch (Donchian-Ausbruch)" },
    { id: "newLow20d", group: "Hochs", kind: "bool", tfs: D, label: "Schluss unter dem 20-Tage-Tief (Donchian-Ausbruch)" },
    { id: "choppiness14", group: "Volatilität", kind: "num", tfs: D, label: "Choppiness Index 14 (unter 38,2 Trend, über 61,8 seitwärts)" },
    { id: "histVol20", group: "Volatilität", kind: "pct", tfs: D, label: "Historische Volatilität 20 Tage (annualisiert)" },
    { id: "ulcer14", group: "Volatilität", kind: "pct", tfs: D, label: "Ulcer Index 14 (Rückschlagsrisiko)" },
    { id: "rs3m", group: "Relative Stärke", kind: "pct", tfs: D, label: "Relative Stärke 3 Monate ggü. S&P 500 (SPY)" },
    { id: "rs6m", group: "Relative Stärke", kind: "pct", tfs: D, label: "Relative Stärke 6 Monate ggü. S&P 500 (SPY)" },
    { id: "rsPositive", group: "Relative Stärke", kind: "bool", tfs: D, label: "Positive relative Stärke (6 Monate)" },
    { id: "relVol", group: "Volumen", kind: "num", tfs: ALL, label: { "1D": "Relatives Volumen (zum 20-Tage-Median)", "1W": "Relatives Wochenvolumen (zum 20-Wochen-Median)", "1M": "Relatives Monatsvolumen (zum 20-Monats-Median)" } },
    { id: "volAboveAvg", group: "Volumen", kind: "bool", tfs: ALL, label: { "1D": "Volumen über Durchschnitt", "1W": "Wochenvolumen über Durchschnitt", "1M": "Monatsvolumen über Durchschnitt" } },
    { id: "volSpike", group: "Volumen", kind: "bool", tfs: ALL, label: { "1D": "Volumenspitze (≥ 2× Median)", "1W": "Volumenspitze in der Woche (≥ 2× Median)", "1M": "Volumenspitze im Monat (≥ 2× Median)" } },
    { id: "mfi14", group: "Volumen", kind: "num", tfs: D, label: "Money Flow Index 14" },
    { id: "obvRising", group: "Volumen", kind: "bool", tfs: D, label: "OBV steigt (20 Tage)" },
    { id: "cmf20", group: "Volumen", kind: "num", tfs: D, label: "Chaikin Money Flow 20 (−1 bis 1)" },
    { id: "atrPct", group: "Volatilität", kind: "pct", tfs: ALL, label: { "1D": "ATR 14 in % des Kurses", "1W": "ATR 14 (Woche) in % des Kurses", "1M": "ATR 14 (Monat) in % des Kurses" } },
    { id: "bbPctB", group: "Volatilität", kind: "num", tfs: D, label: "Bollinger %B (20, 2)" },
    { id: "bbSqueeze", group: "Volatilität", kind: "bool", tfs: D, label: "Bollinger-Enge (Breite im unteren 20-%-Perzentil)" },
    { id: "insideBar", group: "Volatilität", kind: "bool", tfs: ALL, label: { "1D": "Inside Bar (Hoch und Tief innerhalb des Vortags)", "1W": "Inside Week (Hoch und Tief innerhalb der Vorwoche)", "1M": "Inside Month (Hoch und Tief innerhalb des Vormonats)" } },
    { id: "nr7", group: "Volatilität", kind: "bool", tfs: ALL, label: { "1D": "NR7 (engste Tagesspanne der letzten 7 Tage)", "1W": "NR7 (engste Wochenspanne der letzten 7 Wochen)", "1M": "NR7 (engste Monatsspanne der letzten 7 Monate)" } },
    /* Kerzenmuster am Stichtag bzw. an der letzten abgeschlossenen Wochen-/Monatskerze (seit 1.8.0);
       neutral = ohne Richtung (Doji, Long-Legged Doji, Spinning Top). */
    { id: "candleBullish", group: "Kerzenmuster", kind: "enum", multi: true, tfs: ALL, label: { "1D": "Bullisches Kerzenmuster am Stichtag", "1W": "Bullisches Kerzenmuster (Wochenkerze)", "1M": "Bullisches Kerzenmuster (Monatskerze)" }, values: CANDLE_TYPES },
    { id: "candleBearish", group: "Kerzenmuster", kind: "enum", multi: true, tfs: ALL, label: { "1D": "Bärisches Kerzenmuster am Stichtag", "1W": "Bärisches Kerzenmuster (Wochenkerze)", "1M": "Bärisches Kerzenmuster (Monatskerze)" }, values: CANDLE_TYPES },
    { id: "candleNeutral", group: "Kerzenmuster", kind: "enum", multi: true, tfs: ALL, label: { "1D": "Neutrales Kerzenmuster am Stichtag (Unentschlossenheit)", "1W": "Neutrales Kerzenmuster (Wochenkerze)", "1M": "Neutrales Kerzenmuster (Monatskerze)" }, values: CANDLE_TYPES },
    { id: "formationActive", group: "Chartmuster", kind: "enum", multi: true, tfs: D, label: "Formation erkannt oder bestätigt", values: FORMATION_TYPES },
    { id: "formationConfirmed", group: "Chartmuster", kind: "enum", multi: true, tfs: D, label: "Formation bestätigt", values: FORMATION_TYPES },
    { id: "formationOpen", group: "Chartmuster", kind: "enum", multi: true, tfs: D, label: "Formation offen (noch ohne Ausbruch)", values: FORMATION_TYPES },
    /* Ereignisse (Audit B12): Handelstage seit dem juengsten Ereignis, 0 = am Stichtag. `window` nennt die Spalte
       mit der Laenge des Pruefraums: Feld leer + Fenster W = kein Ereignis in den letzten W Handelstagen;
       beides leer = nicht pruefbar (fehlender Wert). Linien aus der Vollhistorie (chartSeries). */
    { id: "goldenCrossDays", window: "smaCrossWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit Golden Cross (SMA 50 kreuzt SMA 200 aufwärts)" },
    { id: "deathCrossDays", window: "smaCrossWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit Death Cross (SMA 50 kreuzt SMA 200 abwärts)" },
    { id: "crossAboveSma200Days", window: "sma200CrossWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit Schluss über SMA 200 gekreuzt" },
    { id: "crossBelowSma200Days", window: "sma200CrossWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit Schluss unter SMA 200 gekreuzt" },
    { id: "rsiExitOversoldDays", window: "rsiEventWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit RSI 14 von unten über 30" },
    { id: "rsiExitOverboughtDays", window: "rsiEventWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit RSI 14 von oben unter 70" },
    { id: "newHigh52wDays", window: "high52wWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit neuem 52-Wochen-Hoch (prüfbar 18 Tage)" },
    { id: "formationNewDays", window: "formationWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit der jüngsten Formations-Erkennung" },
    { id: "candleBullDays", window: "candleWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit einem bullischen Kerzenmuster" },
    { id: "candleBearDays", window: "candleWindow", group: "Ereignisse", kind: "num", tfs: D, label: "Tage seit einem bärischen Kerzenmuster" },
    { id: "close", group: "Kurs", kind: "num", tfs: D, label: "Schlusskurs (USD)" },
    { id: "chg1d", group: "Kurs", kind: "pct", tfs: D, label: "Tagesänderung" },
    { id: "hasVolume", group: "Datenqualität", kind: "bool", tfs: D, label: "Volumendaten vorhanden" },
    { id: "fresh", group: "Datenqualität", kind: "bool", tfs: D, label: "Kursstand aktuell" }
  ];
  var BY_ID = {};
  FIELDS.forEach(function (f) { BY_ID[f.id] = f; });

  function field(id) { return BY_ID[id] || null; }
  function labelOf(f, tf) { return typeof f.label === "string" ? f.label : (f.label[tf] || f.label["1D"]); }
  /** Spaltenname im Datensatz: Tag ohne Suffix, Woche/Monat mit "@1W"/"@1M". */
  function columnKey(id, tf) { var f = field(id); return !f || f.tfIndependent || tf === "1D" ? id : id + "@" + tf; }
  /* "nin" = keiner der Werte (z. B. "ohne Kurslücke"); fehlende Werte bleiben unbekannt, nicht "erfüllt". */
  function opsFor(kind) { return kind === "bool" ? ["is"] : kind === "enum" ? ["in", "nin"] : ["gt", "gte", "lt", "lte", "between"]; }

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Prueft und normalisiert eine Abfrage. Wirft nie; liefert { ok, query, errors[] }.
   * Fehlercodes sind stabil (Tests, KI-Rueckmeldung).
   */
  function validate(input) {
    var errors = [];
    function err(code, path) { errors.push({ code: code, path: path }); }
    var q = input && typeof input === "object" ? input : {};
    var tf = q.timeframe === undefined ? "1D" : q.timeframe;
    if (!TIMEFRAMES[tf]) err("INVALID_TIMEFRAME", "timeframe");
    var logic = q.logic === undefined ? "AND" : q.logic;
    if (logic !== "AND" && logic !== "OR") err("INVALID_LOGIC", "logic");
    var groups = Array.isArray(q.groups) ? q.groups : [];
    if (!Array.isArray(q.groups)) err("GROUPS_REQUIRED", "groups");
    if (groups.length > MAX_GROUPS) err("TOO_MANY_GROUPS", "groups");
    var count = 0, outGroups = [];
    groups.slice(0, MAX_GROUPS).forEach(function (g, gi) {
      var gp = "groups[" + gi + "]";
      var op = g && g.op === undefined ? "AND" : g && g.op;
      if (op !== "AND" && op !== "OR") err("INVALID_GROUP_OP", gp + ".op");
      var fl = g && Array.isArray(g.filters) ? g.filters : [];
      if (!g || !Array.isArray(g.filters)) err("FILTERS_REQUIRED", gp + ".filters");
      var outF = [];
      fl.forEach(function (x, fi) {
        var p = gp + ".filters[" + fi + "]";
        count++;
        var f = x && field(x.field);
        if (!f) return err("UNKNOWN_FIELD", p + ".field");
        /* Zeitrahmen je Filter (Mehrzeitrahmen): ohne Angabe gilt der Zeitrahmen der Abfrage. */
        var ftf = x.tf === undefined || x.tf === null ? tf : x.tf;
        if (!TIMEFRAMES[ftf]) return err("INVALID_TIMEFRAME", p + ".tf");
        if (TIMEFRAMES[tf] && f.tfs.indexOf(ftf) < 0) return err("FIELD_NOT_AVAILABLE_FOR_TIMEFRAME", p + ".field");
        if (opsFor(f.kind).indexOf(x.op) < 0) return err("INVALID_OPERATOR", p + ".op");
        var o = { id: "f" + gi + "_" + fi, field: f.id, op: x.op };
        if (ftf !== tf) o.tf = ftf;
        if (f.kind === "bool") { if (typeof x.value !== "boolean") return err("INVALID_VALUE", p + ".value"); o.value = x.value; }
        else if (f.kind === "enum") {
          var vals = Array.isArray(x.value) ? x.value : [];
          if (!vals.length || vals.some(function (v) { return !Object.prototype.hasOwnProperty.call(f.values, v); })) return err("INVALID_VALUE", p + ".value");
          o.value = vals.slice();
        } else {
          if (!isNum(x.value)) return err("INVALID_VALUE", p + ".value");
          o.value = x.value;
          if (x.op === "between") { if (!isNum(x.value2) || x.value2 < x.value) return err("INVALID_VALUE2", p + ".value2"); o.value2 = x.value2; }
        }
        outF.push(o);
      });
      outGroups.push({ id: "g" + gi, op: op === "OR" ? "OR" : "AND", filters: outF });
    });
    if (count > MAX_FILTERS) err("TOO_MANY_FILTERS", "groups");
    var sort = null;
    if (q.sort) {
      var sf = field(q.sort.field);
      if (!sf || sf.kind === "enum") err("INVALID_SORT", "sort.field");
      else if (TIMEFRAMES[tf] && sf.tfs.indexOf(tf) < 0) err("FIELD_NOT_AVAILABLE_FOR_TIMEFRAME", "sort.field");
      else sort = { field: sf.id, dir: q.sort.dir === "asc" ? "asc" : "desc" };
    }
    var limit = q.limit === undefined ? 100 : q.limit;
    if (!isNum(limit) || limit < 1 || limit > MAX_LIMIT || limit !== Math.floor(limit)) { err("INVALID_LIMIT", "limit"); limit = 100; }
    var out = { v: 1, timeframe: TIMEFRAMES[tf] ? tf : "1D", logic: logic === "OR" ? "OR" : "AND", groups: outGroups, sort: sort, limit: limit };
    return { ok: errors.length === 0, query: out, errors: errors };
  }

  /* ----------------------------------------------------------- Datensatz */
  /** Datensatz aus dem Artefakt technical/data/screener-v1.json (spaltenbasiert). */
  function createDataset(artifact) {
    if (!artifact || !artifact.cols || !Array.isArray(artifact.cols.s)) throw new Error("INVALID_DATASET");
    var cols = artifact.cols, n = cols.s.length, index = {};
    for (var i = 0; i < n; i++) index[cols.s[i]] = i;
    return {
      size: n, meta: artifact, cols: cols,
      column: function (key) { return cols[key] || null; },
      indexOf: function (sym) { return index[sym] === undefined ? -1 : index[sym]; },
      row: function (i) { var o = {}; Object.keys(cols).forEach(function (k) { o[k] = cols[k][i]; }); return o; }
    };
  }

  /** Praedikat: true | false | null (null = kein Wert). */
  function compile(ds, filter, tf) {
    var f = field(filter.field), c = ds.column(columnKey(filter.field, filter.tf || tf));
    if (!f || !c) return function () { return null; };
    if (f.kind === "bool") return function (i) { var v = c[i]; return v === null || v === undefined ? null : !!v === filter.value; };
    if (f.kind === "enum") {
      var want = {}; filter.value.forEach(function (v) { want[v] = true; });
      return function (i) {
        var v = c[i]; if (v === null || v === undefined) return null;
        var hit = false;
        if (Array.isArray(v)) { for (var k = 0; k < v.length && !hit; k++) if (want[v[k]]) hit = true; }
        else hit = !!want[v];
        return filter.op === "nin" ? !hit : hit;
      };
    }
    var a = filter.value, b = filter.value2;
    var test = { gt: function (v) { return v > a; }, gte: function (v) { return v >= a; }, lt: function (v) { return v < a; }, lte: function (v) { return v <= a; },
                 between: function (v) { return v >= a && v <= b; } }[filter.op];
    var w = f.window ? ds.column(f.window) : null;
    if (!w) return function (i) { var v = c[i]; return isNum(v) ? test(v) : null; };
    /* Ereignisfeld: leerer Wert mit Pruefraum W heisst "mindestens W Tage her (oder nie)". Entschieden wird nur,
       was daraus sicher folgt; sonst bleibt der Wert unbekannt (null), nie geraten. */
    var whenAbsent = {
      lte: function (W) { return a < W ? false : null; }, lt: function (W) { return a <= W ? false : null; },
      gt: function (W) { return W > a ? true : null; }, gte: function (W) { return W >= a ? true : null; },
      between: function (W) { return b < W ? false : null; }
    }[filter.op];
    return function (i) {
      var v = c[i]; if (isNum(v)) return test(v);
      var W = w[i]; return isNum(W) ? whenAbsent(W) : null;
    };
  }

  /**
   * Wertet eine (validierte) Abfrage aus.
   * @returns {{indices, count, universe, funnel, matched: Object<i, number>}}
   */
  function evaluate(ds, query) {
    var v = validate(query);
    if (!v.ok) return { error: "INVALID_QUERY", errors: v.errors };
    var q = v.query, n = ds.size, tf = q.timeframe;
    var groups = q.groups.filter(function (g) { return g.filters.length; });
    var compiled = {};
    groups.forEach(function (g) { g.filters.forEach(function (f) { compiled[f.id] = compile(ds, f, tf); }); });
    var matched = new Array(n);
    for (var z = 0; z < n; z++) matched[z] = 0;
    function groupPass(g, i) {
      var any = false, all = true;
      g.filters.forEach(function (f) { var r = compiled[f.id](i); if (r === true) { any = true; matched[i]++; } else all = false; });
      return g.op === "OR" ? any : all;
    }
    var funnel = [{ kind: "start", label: "Ausgangsuniversum", count: n, lost: 0, missing: 0 }];
    var alive = [], i;
    if (!groups.length) { for (i = 0; i < n; i++) alive.push(i); }
    else if (q.logic === "AND") {
      var cur = []; for (i = 0; i < n; i++) cur.push(i);
      groups.forEach(function (g, gi) {
        if (g.op === "AND") {
          g.filters.forEach(function (f) {
            var next = [], missing = 0;
            cur.forEach(function (k) { var r = compiled[f.id](k); if (r === true) { next.push(k); matched[k]++; } else if (r === null) missing++; });
            funnel.push({ kind: "filter", label: describeFilter(f, tf), count: next.length, lost: cur.length - next.length, missing: missing });
            cur = next;
          });
        } else {
          var keep = cur.filter(function (k) { return groupPass(g, k); });
          funnel.push({ kind: "group", label: "Gruppe " + (gi + 1) + " (ODER)", count: keep.length, lost: cur.length - keep.length, missing: 0 });
          cur = keep;
        }
      });
      alive = cur;
    } else {
      var hit = new Array(n);
      groups.forEach(function (g, gi) {
        var c = 0;
        for (var k = 0; k < n; k++) if (groupPass(g, k)) { hit[k] = true; c++; }
        funnel.push({ kind: "group", label: "Gruppe " + (gi + 1) + " allein", count: c, lost: n - c, missing: 0, standalone: true });
      });
      for (i = 0; i < n; i++) if (hit[i]) alive.push(i);
      funnel.push({ kind: "union", label: "Mindestens eine Gruppe erfüllt (ODER)", count: alive.length, lost: n - alive.length, missing: 0 });
    }
    /* Sortierung: gewaehltes Feld, sonst Zahl erfuellter Bedingungen, dann Kuerzel. Fehlende Werte ans Ende. */
    var sym = ds.column("s");
    var sc = q.sort ? ds.column(columnKey(q.sort.field, tf)) : null, dir = q.sort && q.sort.dir === "asc" ? 1 : -1;
    alive.sort(function (x, y) {
      if (sc) {
        var a = sc[x], b = sc[y], an = typeof a === "boolean" ? +a : a, bn = typeof b === "boolean" ? +b : b;
        var ax = isNum(an), bx = isNum(bn);
        if (ax !== bx) return ax ? -1 : 1;
        if (ax && an !== bn) return (an - bn) * dir;
      }
      if (matched[x] !== matched[y]) return matched[y] - matched[x];
      return sym[x] < sym[y] ? -1 : sym[x] > sym[y] ? 1 : 0;
    });
    return { query: q, count: alive.length, universe: n, indices: alive.slice(0, q.limit), funnel: funnel, matched: matched };
  }

  /* ------------------------------------------------------------ Sprache */
  var OPS_DE = { gt: "über", gte: "mindestens", lt: "unter", lte: "höchstens", between: "zwischen" };
  function fmtValue(f, v) { return f.kind === "pct" ? (Math.round(v * 1000) / 10).toLocaleString("de-DE") + " %" : String(v).replace(".", ","); }
  function describeFilter(x, tf) {
    var f = field(x.field); if (!f) return x.field;
    /* Eigener Zeitrahmen: Beschriftung dieses Zeitrahmens; Zusatz nur, wenn die Beschriftung ihn nicht schon nennt. */
    var own = x.tf && x.tf !== (tf || "1D"), l = labelOf(f, x.tf || tf || "1D");
    if (own && l === labelOf(f, tf || "1D")) l += " (" + TIMEFRAMES[x.tf] + ")";
    if (f.kind === "bool") return x.value ? l : "nicht: " + l;
    if (f.kind === "enum") return l + (x.op === "nin" ? ": keine von " : ": ") + x.value.map(function (v) { return f.values[v] || v; }).join(x.op === "nin" ? ", " : " oder ");
    if (x.op === "between") return l + " zwischen " + fmtValue(f, x.value) + " und " + fmtValue(f, x.value2);
    return l + " " + OPS_DE[x.op] + " " + fmtValue(f, x.value);
  }
  function describe(query) {
    var v = validate(query); if (!v.ok) return null;
    var q = v.query;
    var parts = q.groups.filter(function (g) { return g.filters.length; }).map(function (g) {
      var t = g.filters.map(function (f) { return describeFilter(f, q.timeframe); }).join(g.op === "OR" ? " oder " : " und ");
      return g.filters.length > 1 ? "(" + t + ")" : t;
    });
    return (parts.join(q.logic === "OR" ? " oder " : " und ") || "Alle Titel") + " · Zeitrahmen " + TIMEFRAMES[q.timeframe];
  }

  /**
   * Ausgabeschema fuer ein Sprachmodell (JSON Schema 2020-12). Das Modell darf NUR dieses Objekt liefern;
   * die Engine prueft es danach mit validate(). Feld- und Wertelisten kommen aus dem Katalog — eine Quelle.
   */
  function jsonSchema() {
    var filterVariants = FIELDS.map(function (f) {
      var props = { field: { const: f.id }, op: { enum: opsFor(f.kind) }, tf: { enum: f.tfs, description: "Optional: eigener Zeitrahmen dieses Filters (sonst der der Abfrage)" } };
      if (f.kind === "bool") props.value = { type: "boolean" };
      else if (f.kind === "enum") props.value = { type: "array", minItems: 1, items: { enum: Object.keys(f.values) } };
      else { props.value = { type: "number" }; props.value2 = { type: "number" }; }
      return { type: "object", description: labelOf(f, "1D") + (f.kind === "pct" ? " (Anteil, 0,05 = 5 %)" : "") + " · Zeitrahmen: " + f.tfs.join(", "),
               properties: props, required: ["field", "op", "value"], additionalProperties: false };
    });
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema", $id: "vu-technical-query-1", title: "Vision Universe Technical Screener-Abfrage",
      type: "object", additionalProperties: false, required: ["timeframe", "logic", "groups"],
      properties: {
        v: { const: 1 }, timeframe: { enum: Object.keys(TIMEFRAMES) }, logic: { enum: ["AND", "OR"] },
        groups: { type: "array", maxItems: MAX_GROUPS, items: { type: "object", additionalProperties: false, required: ["op", "filters"],
          properties: { op: { enum: ["AND", "OR"] }, filters: { type: "array", minItems: 1, items: { oneOf: filterVariants } } } } },
        sort: { type: ["object", "null"], properties: { field: { enum: FIELDS.filter(function (f) { return f.kind !== "enum"; }).map(function (f) { return f.id; }) }, dir: { enum: ["asc", "desc"] } } },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT }
      }
    };
  }

  /* Vorlagen: sichtbare Einstiege der Startseite und des Screeners (Beispiele aus dem Produktauftrag). */
  var PRESETS = [
    { id: "breakout", title: "Breakout-Kandidaten", description: "Bestätigter Ausbruch über Widerstand oder aus einer Range",
      query: { timeframe: "1D", logic: "AND", groups: [{ op: "OR", filters: [{ field: "formationConfirmed", op: "in", value: ["RESISTANCE_BREAKOUT", "RANGE_BREAKOUT"] }] }], sort: { field: "relVol", dir: "desc" } } },
    { id: "trend", title: "Trendfolge", description: "Kurs über SMA 50 und 200, SMA 50 über SMA 200, ADX über 25",
      query: { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "aboveSma50", op: "is", value: true }, { field: "aboveSma200", op: "is", value: true }, { field: "sma50AboveSma200", op: "is", value: true }, { field: "adx", op: "gt", value: 25 }] }], sort: { field: "adx", dir: "desc" } } },
    { id: "triangles", title: "Dreiecksformationen", description: "Symmetrische, aufsteigende und absteigende Dreiecke in Bildung oder bestätigt",
      query: { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "formationActive", op: "in", value: ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"] }] }], sort: { field: "distHigh52w", dir: "desc" } } },
    { id: "high52", title: "52-Wochen-Hochs", description: "Tageshoch auf neuem 52-Wochen-Hoch",
      query: { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "newHigh52w", op: "is", value: true }] }], sort: { field: "rs6m", dir: "desc" } } },
    { id: "aboveSma200", title: "Über SMA 200", description: "Schlusskurs über dem 200-Tage-Durchschnitt",
      query: { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "aboveSma200", op: "is", value: true }] }], sort: { field: "distSma200", dir: "desc" } } },
    { id: "high200w", title: "200-Wochen-Hochs", description: "Wochenschluss auf dem höchsten Stand seit 200 Wochen",
      query: { timeframe: "1W", logic: "AND", groups: [{ op: "AND", filters: [{ field: "newHigh200w", op: "is", value: true }] }], sort: { field: "rsi14", dir: "desc" } } },
    { id: "bullflag", title: "Bullische Flaggen und Wimpel", description: "Fortsetzungsformationen nach starkem Anstieg",
      query: { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "formationActive", op: "in", value: ["BULL_FLAG", "BULL_PENNANT"] }] }], sort: { field: "relVol", dir: "desc" } } },
    { id: "contraction", title: "Volatilitätskontraktion", description: "Schrumpfende Rücksetzer über der SMA 50",
      query: { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "formationActive", op: "in", value: ["VOLATILITY_CONTRACTION"] }] }], sort: { field: "distHigh52w", dir: "desc" } } }
  ];

  var api = {
    QUERY_VERSION: QUERY_VERSION, TIMEFRAMES: TIMEFRAMES, FIELDS: FIELDS, FORMATION_TYPES: FORMATION_TYPES, CANDLE_TYPES: CANDLE_TYPES, STRUCTURES: STRUCTURES, PRESETS: PRESETS,
    MAX_GROUPS: MAX_GROUPS, MAX_FILTERS: MAX_FILTERS,
    field: field, labelOf: labelOf, columnKey: columnKey, opsFor: opsFor,
    validate: validate, createDataset: createDataset, evaluate: evaluate, describe: describe, describeFilter: describeFilter, jsonSchema: jsonSchema
  };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Query = api; }
})(typeof window !== "undefined" ? window : globalThis);
