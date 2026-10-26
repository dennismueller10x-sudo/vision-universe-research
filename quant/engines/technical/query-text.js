/* =========================================================================
   VISION UNIVERSE TECHNICAL — query-text.js
   SUCHTEXT -> STRUKTURIERTE SCREENER-ABFRAGE (deterministisch, ohne Modell)

   Vorstufe der KI-Suche. Ein Satz wie
     "Dreieckskonsolidierung über der SMA 200 mit steigendem Volumen"
   wird regelbasiert in die Abfrage aus technical-query.js uebersetzt und
   dort mit validate() geprueft. Was der Parser nicht kennt, meldet er als
   "nicht erkannt" statt es zu raten. Ein spaeteres Sprachmodell liefert
   dasselbe Abfrageformat (contract()); gerechnet wird immer nur hier.

   Grammatik (Bindung wie ueblich: "und" vor "oder"):
     Suche   := Gruppe { "oder" Gruppe }
     Gruppe  := Baustein { ["und" | "mit" | "," | "sowie"] Baustein }
     Baustein:= Begriff (Wortliste unten, z. B. "über SMA 200", "Doppelboden")
              | Kennzahl Vergleich Zahl[%]     "RSI unter 40", "relVol >= 2"
              | Kennzahl "zwischen" Zahl "und" Zahl
              | Feld-ID | "nicht" Feld-ID       kanonisch: "aboveSma200"
              | "formation:" Typ{,Typ} | "bestaetigt:" Typ{,Typ} | "struktur:" Wert
              | "tf:1W" | "Woche" | "Monat"     Zeitrahmen
              | "sort:" Feld ":" ("asc"|"desc") | "sortiert nach" Kennzahl
     Formationen einer Gruppe bilden EINE Liste (eine davon genuegt);
     "Dreieck oder Keil" sind daher ein Baustein, nicht zwei Gruppen.
     "bestätigt" in einer Gruppe verlangt dort bestaetigte Formationen.
     Prozentfelder (Abstaende, Kursaenderungen, relative Staerke) lesen die
     Zahl immer als Prozent: "Abstand zum 52-Wochen-Hoch über -5" = −5 %.

   toText() erzeugt die kanonische Schreibweise; parse(toText(q)) ergibt
   wieder q (Rundreise, getestet).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Q = isNode ? require("./technical-query.js") : global.VUTechnical.Query;
  var TEXT_VERSION = "technical-query-text-1.3.0";

  /* Umlaute und Eszett falten, Kleinschreibung, typografische Zeichen vereinheitlichen. */
  function fold(s) {
    return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[–—]/g, "-").replace(/[„“”"']/g, " ").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/\s+/g, " ").trim();
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  var T = Q.FORMATION_TYPES, ALL_TRI = ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"];
  function b(field, value) { return { field: field, op: "is", value: value }; }
  function n(field, op, value) { return { field: field, op: op, value: value }; }

  /* Begriffe: [Muster (gefaltet), Filter[] | {formations:[]} | {confirmed:true}]. Laengere Muster zuerst geprueft. */
  var TERMS = [
    ["golden cross|sma ?50 (ueber|oberhalb)( der| die)? sma ?200", [b("sma50AboveSma200", true)]],
    ["death cross|sma ?50 (unter|unterhalb)( der| die)? sma ?200", [b("sma50AboveSma200", false)]],
    ["(ueber|oberhalb)( der| dem| die)? (sma ?200|gd ?200|200-tage-(linie|durchschnitt)|200er( linie)?)", [b("aboveSma200", true)]],
    ["(unter|unterhalb)( der| dem| die)? (sma ?200|gd ?200|200-tage-(linie|durchschnitt)|200er( linie)?)", [b("aboveSma200", false)]],
    ["(ueber|oberhalb)( der| dem| die)? (sma ?50|gd ?50|50-tage-(linie|durchschnitt)|50er( linie)?)", [b("aboveSma50", true)]],
    ["(unter|unterhalb)( der| dem| die)? (sma ?50|gd ?50|50-tage-(linie|durchschnitt)|50er( linie)?)", [b("aboveSma50", false)]],
    ["(ueber|oberhalb)( der| dem| die)? (40-?wochen-?(linie|durchschnitt)|10-?monats-?(linie|durchschnitt))", [b("aboveSma200", true)]],
    ["(unter|unterhalb)( der| dem| die)? (40-?wochen-?(linie|durchschnitt)|10-?monats-?(linie|durchschnitt))", [b("aboveSma200", false)]],
    ["(ueber|oberhalb)( der| dem| die)? (10-?wochen-?(linie|durchschnitt)|5-?monats-?(linie|durchschnitt))", [b("aboveSma50", true)]],
    ["(unter|unterhalb)( der| dem| die)? (10-?wochen-?(linie|durchschnitt)|5-?monats-?(linie|durchschnitt))", [b("aboveSma50", false)]],
    ["(ueber|oberhalb)( der| dem| die)? (ema ?200|200-?tage-?ema)", [b("aboveEma200", true)]],
    ["(unter|unterhalb)( der| dem| die)? (ema ?200|200-?tage-?ema)", [b("aboveEma200", false)]],
    ["(ueber|oberhalb)( der| dem| die)? ema ?20", [b("aboveEma20", true)]],
    ["(unter|unterhalb)( der| dem| die)? ema ?20", [b("aboveEma20", false)]],
    ["(ueber|oberhalb)( der| dem| die)? ema ?50", [b("aboveEma50", true)]],
    ["(unter|unterhalb)( der| dem| die)? ema ?50", [b("aboveEma50", false)]],
    ["(ueber|oberhalb)( der)? (ichimoku-?)?wolke|ichimoku (bullisch|positiv)", [b("aboveCloud", true)]],
    ["(unter|unterhalb)( der)? (ichimoku-?)?wolke|ichimoku (baerisch|negativ)", [b("aboveCloud", false)]],
    ["supertrend (aufwaerts|positiv|bullisch|long)", [b("supertrendUp", true)]],
    ["supertrend (abwaerts|negativ|baerisch|short)", [b("supertrendUp", false)]],
    ["(parabolic )?sar (aufwaerts|unter dem kurs|bullisch|long)", [b("psarUp", true)]],
    ["(parabolic )?sar (abwaerts|ueber dem kurs|baerisch|short)", [b("psarUp", false)]],
    ["starke[rnm]? trend|trendstark\\w*", [n("adx", "gt", 25)]],
    ["aufwaertsstruktur|hoehere hochs und hoehere tiefs|hoehere tiefs", [{ field: "structure", op: "in", value: ["BULLISH"] }]],
    ["abwaertsstruktur|tiefere hochs und tiefere tiefs|tiefere hochs", [{ field: "structure", op: "in", value: ["BEARISH"] }]],
    ["(neue[snm]? )?200-?wochen-?hochs?", [b("newHigh200w", true)]],
    ["(neue[snm]? )?(52-?wochen-?hochs?|52w-?hochs?|jahreshochs?)", [b("newHigh52w", true)]],
    ["macd (positiv|bullisch|ueber null)", [b("macdPositive", true)]],
    ["macd (negativ|baerisch|unter null)", [b("macdPositive", false)]],
    ["ueberverkauft\\w*", [n("rsi14", "lt", 30)]],
    ["ueberkauft\\w*", [n("rsi14", "gt", 70)]],
    ["(positive |hohe )?relative staerke|staerker als (der |den )?(markt|s&p( 500)?|spy|index)|outperform\\w*", [b("rsPositive", true)]],
    ["volumenspitzen?|volumenexplosion|volumen-?spike", [b("volSpike", true)]],
    ["(steigende[mnrs]?|hohe[mnrs]?|ueberdurchschnittliche[mnrs]?|erhoehte[mnrs]?) (handels)?volumen|volumen (ueber|oberhalb)( dem)? (durchschnitt|schnitt)", [b("volAboveAvg", true)]],
    ["(steigende[rsn]? obv|obv steigt)", [b("obvRising", true)]],
    ["geldzufluss|kaufdruck|akkumulation", [n("cmf20", "gt", 0)]],
    ["geldabfluss|verkaufsdruck|distribution", [n("cmf20", "lt", 0)]],
    ["bollinger-?enge|(bollinger-?)?squeeze|enge (bollinger-?)?baender", [b("bbSqueeze", true)]],
    /* Formationen */
    ["symmetrische[snm]? dreiecke?", { formations: ["SYMMETRICAL_TRIANGLE"] }],
    ["aufsteigende[snm]? dreiecke?", { formations: ["ASCENDING_TRIANGLE"] }],
    ["absteigende[snm]? dreiecke?", { formations: ["DESCENDING_TRIANGLE"] }],
    ["dreieck\\w*", { formations: ALL_TRI }],
    ["bull(ische[nrm]?)? ?flaggen?|bullflaggen?", { formations: ["BULL_FLAG"] }],
    ["baer(ische[nrm]?)? ?flaggen?|baerflaggen?", { formations: ["BEAR_FLAG"] }],
    ["flaggen?", { formations: ["BULL_FLAG", "BEAR_FLAG"] }],
    ["bull(ische[nrm]?)? ?wimpel", { formations: ["BULL_PENNANT"] }],
    ["baer(ische[nrm]?)? ?wimpel", { formations: ["BEAR_PENNANT"] }],
    ["wimpel", { formations: ["BULL_PENNANT", "BEAR_PENNANT"] }],
    ["steigende[rnm]? keile?", { formations: ["RISING_WEDGE"] }],
    ["fallende[rnm]? keile?", { formations: ["FALLING_WEDGE"] }],
    ["keile?|keilformation\\w*", { formations: ["RISING_WEDGE", "FALLING_WEDGE"] }],
    ["doppel-?boeden|doppel-?boden|double bottom|w-formation", { formations: ["DOUBLE_BOTTOM"] }],
    ["doppel-?tops?|double top|m-formation", { formations: ["DOUBLE_TOP"] }],
    ["(umgekehrte|inverse)[rnm]? (schulter-kopf-schulter|sks|kopf-schulter)\\w*", { formations: ["INVERSE_HEAD_AND_SHOULDERS"] }],
    ["schulter-kopf-schulter\\w*|kopf-schulter\\w*|\\bsks\\b", { formations: ["HEAD_AND_SHOULDERS"] }],
    ["tasse mit henkel|cup (and|with) handle", { formations: ["CUP_WITH_HANDLE"] }],
    ["range-?ausbr\\w*|ausbr\\w* aus (der |einer )?range", { formations: ["RANGE_BREAKOUT"] }],
    ["ausbr\\w* ueber (den |einen )?widerstand|widerstandsausbr\\w*", { formations: ["RESISTANCE_BREAKOUT"] }],
    ["ausbr\\w*|breakouts?", { formations: ["RESISTANCE_BREAKOUT", "RANGE_BREAKOUT"] }],
    ["rechtecke?|seitwaertsrange|trading-?range", { formations: ["RECTANGLE"] }],
    ["aufwaerts-?kanal|steigende[rnm]? kanal", { formations: ["ASCENDING_CHANNEL"] }],
    ["abwaerts-?kanal|fallende[rnm]? kanal", { formations: ["DESCENDING_CHANNEL"] }],
    ["(trend)?kanal\\w*", { formations: ["ASCENDING_CHANNEL", "DESCENDING_CHANNEL"] }],
    ["(steigende )?unterstuetzungslinie|aufwaertstrendlinie", { formations: ["SUPPORT_TRENDLINE"] }],
    ["(fallende )?widerstandslinie|abwaertstrendlinie", { formations: ["RESISTANCE_TRENDLINE"] }],
    ["trendlinien?", { formations: ["SUPPORT_TRENDLINE", "RESISTANCE_TRENDLINE"] }],
    ["volatilitaetskontraktion|\\bvcp\\b", { formations: ["VOLATILITY_CONTRACTION"] }],
    ["(kurs)?luecken? nach oben|gap[- ]?ups?|aufwaertsluecken?", { formations: ["GAP_UP"] }],
    ["(kurs)?luecken? nach unten|gap[- ]?downs?|abwaertsluecken?", { formations: ["GAP_DOWN"] }],
    ["(kurs)?luecken?|gaps?", { formations: ["GAP_UP", "GAP_DOWN"] }],
    ["bestaetigt\\w*|confirmed", { confirmed: true }]
  ];

  /* Kennzahlen fuer Vergleiche (gefaltete Aliasse; Feld-IDs selbst gelten immer). */
  var METRICS = [
    ["abstand zur sma ?200|abstand zum 200er", "distSma200"], ["abstand zur ema ?200", "distEma200"], ["abstand zum 52-?wochen-?hoch", "distHigh52w"], ["abstand zum 200-?wochen-?hoch", "distHigh200w"],
    ["relative staerke 3 ?m(onate)?|rs ?3m", "rs3m"], ["relative staerke( 6 ?m(onate)?)?|rs ?6m", "rs6m"],
    ["relative[mns]? volumen|rel\\. volumen|volumenfaktor", "relVol"], ["williams( ?%r)?|%r", "williamsR"], ["aroon(-?oszillator)?", "aroonOsc"],
    ["chaikin money flow|cmf( ?20)?", "cmf20"], ["money flow index|mfi( ?14)?", "mfi14"], ["stochastik( %k)?|%k", "stochK"],
    ["bollinger %b|%b", "bbPctB"], ["atr( ?%| in %| ?14)?", "atrPct"], ["rsi( ?14)?", "rsi14"], ["adx( ?14)?", "adx"], ["cci( ?20)?", "cci20"],
    ["roc( ?21)?|21-?tage-?(aenderung|performance)|monatsperformance", "roc21"], ["tagesaenderung|tagesperformance", "chg1d"],
    ["schlusskurs|aktienkurs|kurs|preis", "close"]
  ];
  var CMP = [["groesser als|groesser|mehr als|oberhalb|ueber|>", "gt"], ["mindestens|ab|>=", "gte"], ["kleiner als|kleiner|weniger als|unterhalb|unter|<", "lt"], ["hoechstens|bis|<=", "lte"]];
  var STOP = ("aktien aktie titel werte wert alle zeige zeig finde such suche mir mit der die das den dem des ein eine einer einem eines im in auf am an bei von nach " +
    "sowie setup setups formation formationen muster signal signale aktuell gerade derzeit noch bildung tageschart chart charts liegt liegen ist sind " +
    "einem einen im tag taeglich tagesbasis 1d kurs kurse").split(" ");

  var NUMERIC = Q.FIELDS.filter(function (f) { return f.kind === "num" || f.kind === "pct"; });
  /* Innere Gruppen nicht fangend, damit die Positionen von Kennzahl, Vergleich und Zahl fest bleiben. */
  function nc(re) { return re.replace(/\((?!\?)/g, "(?:"); }
  var METRIC_RE = "(" + METRICS.map(function (m) { return nc(m[0]); }).concat(NUMERIC.map(function (f) { return esc(f.id.toLowerCase()); })).join("|") + ")";
  var NUM_RE = "(-?\\d+(?:[.,]\\d+)?)\\s*(%)?(?![\\w-])";
  var CMP_RE = "(>=|<=|>|<|" + CMP.map(function (c) { return c[0].split("|").filter(function (w) { return !/^[<>]=?$/.test(w); }).join("|"); }).join("|") + ")";
  var BETWEEN = new RegExp("\\b" + METRIC_RE + "\\s+zwischen\\s+" + NUM_RE + "\\s+und\\s+" + NUM_RE, "g");
  var COMPARE = new RegExp("(?:^|\\s)" + METRIC_RE + "\\s*" + CMP_RE + "\\s*" + NUM_RE, "g");

  function metricField(alias) {
    for (var i = 0; i < METRICS.length; i++) if (new RegExp("^(?:" + METRICS[i][0] + ")$").test(alias)) return METRICS[i][1];
    for (var k = 0; k < NUMERIC.length; k++) if (NUMERIC[k].id.toLowerCase() === alias) return NUMERIC[k].id;
    return null;
  }
  function cmpOp(word) { for (var i = 0; i < CMP.length; i++) if (new RegExp("^(?:" + CMP[i][0] + ")$").test(word)) return CMP[i][1]; return null; }
  function toNumber(s, f) { var v = Number(String(s).replace(",", ".")); return Q.field(f).kind === "pct" ? Math.round(v * 1e6) / 1e8 : v; }

  /**
   * @returns {{ok, query, errors:[{code, text}], recognized:[string], unknown:[string], canonical}}
 *   recognized: je erkanntem Baustein eine fachliche Beschriftung (z. B. "Kurs über SMA 200").
   * query ist das von validate() normalisierte Objekt (auch bei Fehlern, dann ohne die fehlerhaften Teile).
   */
  function parse(input) {
    var text = " " + fold(input) + " ", slots = [], errors = [], recognized = [];
    function slot(item) { slots.push(item); return " §" + (slots.length - 1) + "§ "; }
    var tf = "1D", sort = null;
    /* Einheiten in Worten: "5 Prozent" = "5 %", "100 Dollar" = 100 (Kurse sind USD) */
    text = text.replace(/(\d)\s*(prozent|pct)(?![\w-])/g, "$1 %").replace(/(\d)\s*(dollar|usd|\$)(?![\w-])/g, "$1");

    /* 1. Kanonische Praefixe und Zeitrahmen-/Sortierangaben */
    text = text.replace(/\btf:(1d|1w|1m)\b/g, function (m, x) { tf = x.toUpperCase(); return " "; });
    text = text.replace(/\bsort:([a-z0-9]+):(asc|desc)\b/g, function (m, id, dir) { var f = metricField(id); if (f) sort = { field: f, dir: dir }; else errors.push({ code: "UNKNOWN_SORT", text: id }); return " "; });
    text = text.replace(new RegExp("sortiert nach " + METRIC_RE + "( (auf|ab)steigend)?", "g"), function (m, a, d) { sort = { field: metricField(a), dir: d && /auf/.test(d) ? "asc" : "desc" }; return " "; });
    text = text.replace(/\b(formation|bestaetigt):([a-z_,]+)/g, function (m, kind, list) {
      var types = list.toUpperCase().split(",").filter(Boolean), bad = types.filter(function (t) { return !T[t]; });
      if (bad.length) { errors.push({ code: "UNKNOWN_FORMATION", text: bad.join(",") }); return " "; }
      return slot({ formations: types, confirmed: kind === "bestaetigt", text: m });
    });
    /* "offen:TYP,TYP" = Formation erkannt, noch ohne Ausbruch (formationOpen) */
    text = text.replace(/\boffen:([a-z_,]+)/g, function (m, list) {
      var types = list.toUpperCase().split(",").filter(Boolean), bad = types.filter(function (t) { return !T[t]; });
      if (bad.length) { errors.push({ code: "UNKNOWN_FORMATION", text: bad.join(",") }); return " "; }
      return slot({ filters: [{ field: "formationOpen", op: "in", value: types }], text: m });
    });
    text = text.replace(/\bstruktur:([a-z,]+)/g, function (m, list) {
      var v = list.toUpperCase().split(",").filter(function (x) { return Q.STRUCTURES[x]; });
      return v.length ? slot({ filters: [{ field: "structure", op: "in", value: v }], text: m }) : " ";
    });

    /* 2. Vergleiche (vor der Zerlegung, weil "zwischen 30 und 50" ein "und" enthaelt) */
    text = text.replace(BETWEEN, function (m, a, x, px, y) { var f = metricField(a); return slot({ filters: [{ field: f, op: "between", value: toNumber(x, f), value2: toNumber(y, f) }], text: m.trim() }); });
    text = text.replace(COMPARE, function (m, a, c, x) { var f = metricField(a), op = cmpOp(c); return f && op ? slot({ filters: [{ field: f, op: op, value: toNumber(x, f) }], text: m.trim() }) : m; });

    /* 3. Begriffe, laengste Treffer zuerst (Reihenfolge der Liste ist die Prioritaet) */
    TERMS.forEach(function (t) {
      text = text.replace(new RegExp("(^|[\\s,;(])(" + t[0] + ")(?=$|[\\s,;)])", "g"), function (m, pre, hit) {
        var d = t[1], item = Array.isArray(d) ? { filters: d, text: hit } : d.formations ? { formations: d.formations, text: hit } : { confirmed: true, text: hit };
        return pre + slot(item);
      });
    });
    /* Kanonische Wahrheitsfelder: "aboveSma200", "nicht aboveSma200" */
    Q.FIELDS.filter(function (f) { return f.kind === "bool"; }).forEach(function (f) {
      text = text.replace(new RegExp("(^|\\s)(nicht\\s+|!)?" + esc(f.id.toLowerCase()) + "(?=\\s|$)", "g"), function (m, pre, neg) { return pre + slot({ filters: [b(f.id, !neg)], text: m.trim() }); });
    });
    /* Zeitrahmen-Woerter erst jetzt ("52-Wochen-Hoch" ist bereits verbraucht) */
    text = text.replace(/\b(woche|wochen|woechentlich|wochenchart|wochenbasis|1w)\b/g, function () { tf = "1W"; return " "; });
    text = text.replace(/\b(monat|monate|monatlich|monatschart|monatsbasis|1m)\b/g, function () { tf = "1M"; return " "; });

    /* 4. Zerlegen in Gruppen ("oder") und Bausteine; Rest = nicht erkannt */
    var unknown = [];
    var parts = text.split(/\s(?:oder|or)\s|\|/);
    var groups = parts.map(function (part) {
      var items = [];
      part.replace(/§(\d+)§/g, function (m, i) { items.push(slots[Number(i)]); return " "; })
        .split(/[\s,;:&()]+/).forEach(function (w) {
          if (!w || STOP.indexOf(w) >= 0 || /^(und|and|sowie|mit|plus)$/.test(w)) return;
          unknown.push(w);
        });
      return items;
    }).filter(function (items) { return items.length; });
    /* Reine Formationsgruppen vor einer weiteren Formationsgruppe: "Dreieck oder Keil über SMA 200" = eine Liste */
    for (var gi = 0; gi < groups.length - 1; gi++) {
      var only = groups[gi].every(function (x) { return x.formations || x.confirmed; });
      var nextHas = groups[gi + 1].some(function (x) { return x.formations; });
      if (only && nextHas) { groups[gi + 1] = groups[gi].concat(groups[gi + 1]); groups.splice(gi, 1); gi--; }
    }

    var qGroups = groups.map(function (items) {
      var filters = [], forms = [], confirmed = false;
      items.forEach(function (x) {
        if (x.confirmed) confirmed = true;
        if (x.formations) x.formations.forEach(function (t) { if (forms.indexOf(t) < 0) forms.push(t); });
        (x.filters || []).forEach(function (f) { filters.push(Object.assign({}, f, f.value && Array.isArray(f.value) ? { value: f.value.slice() } : {})); });
        recognized.push(x.formations ? x.formations.map(function (t) { return T[t]; }).join(" / ") + (x.confirmed ? " (bestätigt)" : "")
          : x.filters ? x.filters.map(function (f) { return Q.describeFilter(f, tf); }).join(", ") : "nur bestätigte Formationen");
      });
      if (forms.length) filters.unshift({ field: confirmed ? "formationConfirmed" : "formationActive", op: "in", value: forms });
      else if (confirmed) errors.push({ code: "CONFIRMED_WITHOUT_FORMATION", text: "bestätigt" });
      return { op: "AND", filters: filters };
    }).filter(function (g) { return g.filters.length; });

    var raw = { v: 1, timeframe: tf, logic: qGroups.length > 1 ? "OR" : "AND", groups: qGroups, sort: sort, limit: 100 };
    if (!qGroups.length) errors.push({ code: "EMPTY", text: "" });
    var v = Q.validate(raw);
    v.errors.forEach(function (e) {
      var m = /groups\[(\d+)\]\.filters\[(\d+)\]/.exec(e.path || ""), f = m && qGroups[+m[1]] && qGroups[+m[1]].filters[+m[2]];
      errors.push({ code: e.code, text: f ? (Q.field(f.field) ? Q.labelOf(Q.field(f.field), "1D") : f.field) : e.path });
    });
    /* Fehlerhafte Filter entfernen, damit der Rest auswertbar bleibt (validate() laesst sie bereits weg). */
    var q = v.query;
    q.groups = q.groups.filter(function (g) { return g.filters.length; });
    if (q.groups.length < 2) q.logic = "AND";
    return {
      ok: errors.length === 0 && unknown.length === 0, query: q, errors: errors, unknown: unknown,
      recognized: recognized, canonical: toText(q)
    };
  }

  function fmtNum(f, v) { return Q.field(f).kind === "pct" ? String(Math.round(v * 1e6) / 1e4) + "%" : String(v); }
  var SYM = { gt: ">", gte: ">=", lt: "<", lte: "<=" };
  /**
   * Kanonische Schreibweise einer (validen) Abfrage; parse() liest sie bedeutungsgleich zurueck
   * (Gruppen mit einem Filter tragen danach "AND"). null, wenn die Abfrage nicht als Text darstellbar ist
   * (ODER-Gruppe mit mehreren Filtern neben anderen Gruppen unter UND).
   */
  function toText(query) {
    var v = Q.validate(query); if (!v.ok) return null;
    var q = v.query, gs = q.groups.filter(function (g) { return g.filters.length; });
    /* Eine ODER-Gruppe mit mehreren Filtern ist nur ausdrueckbar, wenn sie allein steht oder oben ODER gilt. */
    if (gs.some(function (g) { return g.op === "OR" && g.filters.length > 1; })) {
      if (gs.length > 1 && q.logic !== "OR") return null;
      gs = [].concat.apply([], gs.map(function (g) { return g.op === "OR" ? g.filters.map(function (f) { return { filters: [f] }; }) : [g]; }));
    }
    var groups = gs.map(function (g) {
      return g.filters.map(function (x) {
        var f = Q.field(x.field);
        if (f.kind === "bool") return (x.value ? "" : "nicht ") + x.field;
        if (x.field === "formationActive") return "formation:" + x.value.join(",");
        if (x.field === "formationConfirmed") return "bestaetigt:" + x.value.join(",");
        if (x.field === "formationOpen") return "offen:" + x.value.join(",");
        if (x.field === "structure") return "struktur:" + x.value.join(",");
        if (x.op === "between") return x.field + " zwischen " + fmtNum(x.field, x.value) + " und " + fmtNum(x.field, x.value2);
        return x.field + " " + SYM[x.op] + " " + fmtNum(x.field, x.value);
      }).join(" und ");
    });
    var out = groups.join(" oder ");
    if (q.timeframe !== "1D") out = "tf:" + q.timeframe + " " + out;
    if (q.sort) out += " sort:" + q.sort.field + ":" + q.sort.dir;
    return out;
  }

  /**
   * Vertrag fuer einen spaeteren Modellaufruf (nicht aktiv): Das Modell bekommt die Anweisung und das
   * JSON-Schema, liefert NUR die Abfrage, und die Antwort laeuft durch Q.validate(). Kein Netzwerk hier.
   */
  function contract() {
    return {
      version: TEXT_VERSION, status: "VORBEREITET_NICHT_AKTIV",
      instructions: "Übersetze die Beschreibung eines Chart-Setups in genau ein JSON-Objekt nach dem Schema. Erfinde keine Felder, " +
        "keine Formationen und keine Schwellen, die nicht genannt sind. Prozentwerte als Anteil (5 % = 0.05). Wenn etwas nicht abbildbar ist, " +
        "lass es weg; die Anwendung zeigt dem Nutzer, was übernommen wurde.",
      schema: Q.jsonSchema(),
      examples: [
        "Dreieckskonsolidierung über der SMA 200 mit steigendem Volumen",
        "Bestätigter Ausbruch mit Volumenspitze und RSI unter 75",
        "Doppelboden oder inverse Schulter-Kopf-Schulter über der 50-Tage-Linie",
        "Wochenchart: über der 40-Wochen-Linie und RSI über 50"
      ].map(function (t) { return { text: t, query: parse(t).query }; })
    };
  }

  var api = { TEXT_VERSION: TEXT_VERSION, parse: parse, toText: toText, contract: contract, fold: fold };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.QueryText = api; }
})(typeof window !== "undefined" ? window : globalThis);
