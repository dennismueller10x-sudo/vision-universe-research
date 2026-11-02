/* =========================================================================
   VISION UNIVERSE TECHNICAL — engine/templates.js
   STRATEGIE-VORLAGEN (AP8, S1; docs/technical/STRATEGY_TEMPLATES_PLAN.md)

   Eine Vorlage ist eine benannte, erklaerte Kombination bestehender Screener-Filter.
   Sie rechnet nichts Neues: jedes Kriterium ist ein Filter aus technical-query.js und wird
   mit dessen Praedikat (true | false | null) ausgewertet. Je Titel entsteht daraus eine
   Checkliste mit drei Zustaenden:
     PASS     erfuellt
     FAIL     nicht erfuellt
     UNKNOWN  unbekannt (kein Wert, z. B. zu kurze Historie) - zaehlt nie als erfuellt
   Einordnung je Titel:
     FULL        alle Kriterien erfuellt
     NEAR        genau ein Kriterium nicht erfuellt, alle anderen erfuellt ("Fast erfuellt");
                 nur bei Vorlagen mit mindestens NEAR_MIN (3) Kriterien - bei einem oder zwei Kriterien
                 waere fast jeder Titel "fast erfuellt"
     INCOMPLETE  keines nicht erfuellt, aber mindestens eines unbekannt ("unvollstaendig")
     NONE        sonst
   Voraussetzung jeder Vorlage: Kursstand aktuell (fresh). Titel hinter dem Stichtag oder mit
   eingefrorenem Kurs werden nicht eingeordnet, sondern als "ausgeschlossen" gezaehlt.

   Keine Vorlage ist ein Kauf- oder Verkaufssignal; Renditen oder Trefferquoten zeigt sie nicht.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Q = isNode ? require("../../quant/engines/technical/technical-query.js") : global.VUTechnical.Query;

  var TEMPLATES_VERSION = "technical-templates-1.1.0";
  var TRIANGLES = ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"];

  /** Gilt fuer jede Vorlage; die Ansicht zeigt den Text unter den Kriterien. */
  var LIMITS = "Die Vorlage beschreibt den heutigen technischen Zustand. Sie ist kein Kauf- oder Verkaufssignal und sagt nichts über künftige Kurse; Kosten, Ausführung und Unternehmenszahlen sind nicht berücksichtigt.";

  function c(id, label, why, filter) { return { id: id, label: label, why: why, filter: filter }; }

  /*
   * Gruppen in der Auswahl. Reihenfolge = Anzeige.
   * criteria[].filter: Filter im Format von technical-query.js (field, op, value[, tf]) oder
   *   { kind: "formationDirection", types, direction } - Ausbruchsrichtung aus der Spalte "formations"
   *   (Feld 5: UP/DOWN), nur fuer Formationen, die auch formationConfirmed meldet;
   *   oder { kind: "all", filters: [...] } - mehrere Bedingungen als EIN Kriterium (eine nicht erfuellt -> nicht erfuellt,
   *   sonst eine unbekannt -> unbekannt).
   * requires: Abfragefelder, ohne die die Vorlage nicht angeboten wird (Fachmodell-Felder aus S2, AP8).
   */
  var GROUPS = [
    { id: "trend", title: "Trend" },
    { id: "formation", title: "Formationen" },
    { id: "high", title: "Hochs und Ausbrüche" }
  ];

  var TEMPLATES = [
    /* S3 (seit 1.1.0): vollstaendige Trendvorlage mit 8 Kriterien. Angeboten erst, wenn die Felder aus S2 (L1-L4) im
       Katalog stehen. Kein Name einer Person oder eines Anbieters im Produkt (Owner-Entscheidung 30.10.). */
    { id: "establishedUptrend", group: "trend", icon: "trend", title: "Etablierter Aufwärtstrend",
      summary: "Acht Kriterien: Kurs und Durchschnittslinien in Aufwärtsordnung, steigende 200-Tage-Linie, deutlich über dem Jahrestief, nahe am Jahreshoch, relative Stärke im oberen Drittel.",
      requires: ["aboveSma150", "sma150AboveSma200", "sma50AboveSma150", "sma200Rising", "distLow52w", "rsRank"],
      criteria: [
        c("aboveSma150and200", "Kurs über SMA 150 und SMA 200", "Mittel- und langfristiger Trend zeigen nach oben.",
          { kind: "all", filters: [{ field: "aboveSma150", op: "is", value: true }, { field: "aboveSma200", op: "is", value: true }] }),
        c("sma150AboveSma200", "SMA 150 über SMA 200", "Die langfristigen Durchschnittslinien stehen in Aufwärtsordnung.", { field: "sma150AboveSma200", op: "is", value: true }),
        c("sma200Rising", "SMA 200 steigt seit mindestens einem Monat", "Die 200-Tage-Linie liegt höher als vor 21 Handelstagen.", { field: "sma200Rising", op: "is", value: true }),
        c("sma50AboveSma150and200", "SMA 50 über SMA 150 und SMA 200", "Der kürzere Durchschnitt führt die längeren an.",
          { kind: "all", filters: [{ field: "sma50AboveSma150", op: "is", value: true }, { field: "sma50AboveSma200", op: "is", value: true }] }),
        c("aboveSma50", "Kurs über SMA 50", "Auch kurzfristig liegt der Kurs über seinem Durchschnitt.", { field: "aboveSma50", op: "is", value: true }),
        c("aboveLow30", "Mindestens 30 % über dem 52-Wochen-Tief", "Der Kurs hat sich deutlich vom Jahrestief (Tagestief) gelöst.", { field: "distLow52w", op: "gte", value: 0.3 }),
        c("nearHigh", "Höchstens 25 % unter dem 52-Wochen-Hoch", "Der Kurs ist nicht weit vom Jahreshoch entfernt.", { field: "distHigh52w", op: "gte", value: -0.25 }),
        c("rsRank70", "RS-Rang mindestens 70", "Die relative Stärke über 6 Monate gehört zum oberen Drittel aller aktuellen Aktien.", { field: "rsRank", op: "gte", value: 70 })
      ], sort: { field: "rsRank", dir: "desc" } },
    { id: "uptrendBasic", group: "trend", icon: "trend", title: "Aufwärtstrend, vereinfacht",
      summary: "Kurs und Durchschnittslinien in Aufwärtsordnung, nahe am 52-Wochen-Hoch und stärker als der S&P 500.",
      note: "Vereinfachte Fassung mit 5 Kriterien. Die vollständige Trendvorlage mit 8 Kriterien folgt, sobald SMA 150, Steigung der SMA 200, Abstand zum 52-Wochen-Tief und der RS-Rang als Felder freigegeben sind.",
      criteria: [
        c("aboveSma50", "Kurs über SMA 50", "Der mittelfristige Trend zeigt nach oben.", { field: "aboveSma50", op: "is", value: true }),
        c("aboveSma200", "Kurs über SMA 200", "Der langfristige Trend zeigt nach oben.", { field: "aboveSma200", op: "is", value: true }),
        c("sma50AboveSma200", "SMA 50 über SMA 200", "Die Durchschnittslinien stehen in Aufwärtsordnung.", { field: "sma50AboveSma200", op: "is", value: true }),
        c("nearHigh", "Höchstens 25 % unter dem 52-Wochen-Hoch", "Der Kurs ist nicht weit vom Jahreshoch entfernt.", { field: "distHigh52w", op: "gte", value: -0.25 }),
        c("rsPositive", "Stärker als der S&P 500 über 6 Monate", "Die Aktie lief besser als der Gesamtmarkt (SPY).", { field: "rs6m", op: "gt", value: 0 })
      ], sort: { field: "rs6m", dir: "desc" } },
    { id: "trend", group: "trend", icon: "trend", preset: true },
    { id: "aboveSma200", group: "trend", icon: "bars", preset: true },

    { id: "triangleOpen", group: "formation", icon: "triangle", title: "Dreieck in Bildung",
      summary: "Symmetrische, aufsteigende und absteigende Dreiecke, die noch nicht ausgebrochen sind.",
      criteria: [
        c("triangleOpen", "Offenes Dreieck (noch ohne Ausbruch)", "Die Kurse laufen zwischen zwei zusammenlaufenden Linien; eine Richtung ist noch nicht entschieden.", { field: "formationOpen", op: "in", value: TRIANGLES })
      ], sort: { field: "distHigh52w", dir: "desc" } },
    { id: "triangleOpenUptrend", group: "formation", icon: "triangle", title: "Dreieck in Bildung, im Aufwärtstrend",
      summary: "Offene Dreiecke bei Aktien, deren Kurs über der 200-Tage-Linie liegt.",
      criteria: [
        c("triangleOpen", "Offenes Dreieck (noch ohne Ausbruch)", "Die Kurse laufen zwischen zwei zusammenlaufenden Linien; eine Richtung ist noch nicht entschieden.", { field: "formationOpen", op: "in", value: TRIANGLES }),
        c("aboveSma200", "Kurs über SMA 200", "Das Dreieck liegt in einem langfristigen Aufwärtstrend.", { field: "aboveSma200", op: "is", value: true })
      ], sort: { field: "distHigh52w", dir: "desc" } },
    { id: "triangleBreakoutUp", group: "formation", icon: "breakout", title: "Dreieck mit Ausbruch nach oben",
      summary: "Dreiecke, deren Ausbruch über die obere Linie bestätigt ist.",
      note: "Nur Ausbrüche nach oben. Bestätigte Ausbrüche nach unten sind häufiger und hier ausdrücklich nicht enthalten.",
      /* Mit L5 (formationConfirmedUp) ein Abfragefeld, sonst die Richtung aus der Spalte formations (S1). */
      criteria: Q.field("formationConfirmedUp") ? [
        c("triangleUp", "Dreieck mit bestätigtem Ausbruch nach oben", "Ein Schlusskurs lag über der oberen Dreieckslinie; Ausbrüche nach unten zählen nicht.", { field: "formationConfirmedUp", op: "in", value: TRIANGLES })
      ] : [
        c("triangleConfirmed", "Dreieck mit bestätigtem Ausbruch", "Ein Schlusskurs lag jenseits der gezeichneten Dreieckslinie.", { field: "formationConfirmed", op: "in", value: TRIANGLES }),
        c("directionUp", "Ausbruchsrichtung: nach oben", "Der bestätigte Ausbruch ging über die obere Linie, nicht unter die untere.", { kind: "formationDirection", types: TRIANGLES, direction: "UP" })
      ], sort: { field: "relVol", dir: "desc" } },
    { id: "triangles", group: "formation", icon: "triangle", preset: true },
    { id: "bullflag", group: "formation", icon: "flag", preset: true },
    { id: "contraction", group: "formation", icon: "contraction", preset: true },

    { id: "breakout", group: "high", icon: "breakout", preset: true },
    { id: "high52", group: "high", icon: "trophy", preset: true },
    { id: "high200w", group: "high", icon: "trophy", preset: true }
  ];

  /* Erklaerungen zu den bestehenden Vorlagen (Logik unveraendert aus technical-query.js#PRESETS). */
  var PRESET_WHY = {
    breakout: "Der Kurs hat einen Widerstand oder eine Seitwärtsrange per Schlusskurs überwunden.",
    aboveSma200: "Der langfristige Trend zeigt nach oben.",
    triangles: "Ein Dreieck ist erkannt, offen oder bereits bestätigt – in beide Richtungen.",
    high52: "Das Tageshoch erreichte den höchsten Stand der letzten 52 Wochen.",
    high200w: "Der Wochenschluss ist der höchste seit 200 Wochen.",
    bullflag: "Nach einem kräftigen Anstieg läuft der Kurs in einer engen Gegenbewegung.",
    contraction: "Die Rücksetzer werden kleiner, der Kurs bleibt über der SMA 50."
  };
  var PRESET_CRIT_WHY = {
    aboveSma50: "Der mittelfristige Trend zeigt nach oben.", aboveSma200: "Der langfristige Trend zeigt nach oben.",
    sma50AboveSma200: "Die Durchschnittslinien stehen in Aufwärtsordnung.", adx: "Ein ADX über 25 gilt als ausgeprägter Trend, gleich in welche Richtung."
  };

  /* V3: kombinierbare Trendfilter. Sie werden an jede Vorlage angehaengt (UND). */
  var BLOCKS = [
    { id: "kurz", title: "Kurzfristiger Trend", criteria: [
      c("aboveEma20", "Kurs über EMA 20", "Kurzfristig zeigt der Trend nach oben.", { field: "aboveEma20", op: "is", value: true }),
      c("aboveEma50", "Kurs über EMA 50", "Auch die 50-Tage-Linie liegt unter dem Kurs.", { field: "aboveEma50", op: "is", value: true })] },
    { id: "mittel", title: "Mittelfristiger Trend", criteria: [
      c("aboveSma50", "Kurs über SMA 50", "Der mittelfristige Trend zeigt nach oben.", { field: "aboveSma50", op: "is", value: true }),
      c("sma50AboveSma200", "SMA 50 über SMA 200", "Die Durchschnittslinien stehen in Aufwärtsordnung.", { field: "sma50AboveSma200", op: "is", value: true })] },
    { id: "lang", title: "Langfristiger Trend (Woche)", criteria: [
      c("above40w", "Wochenschluss über der 40-Wochen-Linie", "Auf Wochenbasis zeigt der langfristige Trend nach oben.", { field: "aboveSma200", op: "is", value: true, tf: "1W" })] },
    { id: "stark", title: "Ausgeprägter Trend", criteria: [
      c("adx25", "ADX 14 über 25", "Der Trend ist ausgeprägt; der ADX misst die Stärke, nicht die Richtung.", { field: "adx", op: "gt", value: 25 })] }
  ];

  var FRESH = { field: "fresh", op: "is", value: true };
  var NEAR_MIN = 3;

  function presetOf(id) { return Q.PRESETS.filter(function (p) { return p.id === id; })[0] || null; }
  function filterKey(f) { return f.kind === "all" ? "all:" + f.filters.map(filterKey).join("&") : f.kind === "formationDirection" ? "dir:" + f.direction + ":" + f.types.join(",") : [f.field, f.op, JSON.stringify(f.value), f.value2 === undefined ? "" : f.value2, f.tf || ""].join("|"); }

  /** Vollstaendige Vorlage: bestehende Vorlagen aus PRESETS ergaenzt (Titel, Beschreibung, Kriterien, Sortierung). */
  function resolve(t) {
    if (!t.preset) return t;
    var p = presetOf(t.id), tf = p.query.timeframe;
    var filters = [].concat.apply([], p.query.groups.map(function (g) { return g.filters; }));
    return { id: t.id, group: t.group, icon: t.icon, preset: true, title: p.title, summary: p.description, timeframe: tf, sort: p.query.sort || null,
      criteria: filters.map(function (f) {
        var x = Object.assign({}, f); if (tf !== "1D" && !x.tf) x.tf = tf;
        return c(f.field, Q.describeFilter(f, tf), PRESET_CRIT_WHY[f.field] || PRESET_WHY[t.id] || "", x);
      }) };
  }
  /** Vorlage nur anbieten, wenn alle benoetigten Felder im Abfragekatalog stehen. */
  function available(t) { return !(t.requires || []).some(function (f) { return !Q.field(f); }); }
  var RESOLVED = TEMPLATES.filter(available).map(resolve);
  function list() { return RESOLVED.slice(); }
  function get(id) { return RESOLVED.filter(function (t) { return t.id === id; })[0] || null; }
  function block(id) { return BLOCKS.filter(function (b) { return b.id === id; })[0] || null; }

  /** Vorlage plus gewaehlte Trendfilter; doppelte Kriterien (gleicher Filter) nur einmal. */
  function compose(id, blockIds) {
    var t = get(id); if (!t) return null;
    var seen = {}, crit = [];
    function add(x, from) { var k = filterKey(x.filter); if (seen[k]) return; seen[k] = 1; crit.push(Object.assign({ from: from }, x)); }
    t.criteria.forEach(function (x) { add(x, null); });
    var used = [];
    (blockIds || []).forEach(function (b) { var B = block(b); if (B && used.indexOf(b) < 0) { used.push(b); B.criteria.forEach(function (x) { add(x, b); }); } });
    return Object.assign({}, t, { criteria: crit, blocks: used });
  }

  /** Praedikat je Kriterium: function(i) -> true | false | null. */
  function predicate(ds, filter) {
    if (filter.kind === "all") {
      var ps = filter.filters.map(function (f) { return predicate(ds, f); });
      return function (i) {
        var unknown = false;
        for (var k = 0; k < ps.length; k++) { var r = ps[k](i); if (r === false) return false; if (r !== true) unknown = true; }
        return unknown ? null : true;
      };
    }
    if (filter.kind === "formationDirection") {
      var fc = ds.column("formations"), conf = ds.column("formationConfirmed"), types = {};
      filter.types.forEach(function (t) { types[t] = 1; });
      return function (i) {
        var cv = conf && conf[i], fv = fc && fc[i];
        if (cv === null || cv === undefined || fv === null || fv === undefined) return null;
        var confirmed = cv.some(function (t) { return types[t]; });
        if (!confirmed) return false;
        return fv.some(function (e) { return types[e[0]] && e[1] === "CONFIRMED" && e[4] === filter.direction; });
      };
    }
    return Q.predicate(ds, filter, "1D");
  }

  var STATES = ["FULL", "NEAR", "INCOMPLETE"];
  /**
   * Wertet eine (zusammengesetzte) Vorlage ueber den Datensatz aus.
   * @returns {{ full, near, incomplete: Array<{i, states}>, excluded: number, funnel: Array<{id,label,pass,fail,unknown}> }}
   *   states[k] = "PASS" | "FAIL" | "UNKNOWN" je Kriterium (Reihenfolge wie t.criteria).
   */
  function evaluate(ds, t) {
    var preds = t.criteria.map(function (x) { return predicate(ds, x.filter); }), fresh = Q.predicate(ds, FRESH, "1D"), nearOk = preds.length >= NEAR_MIN;
    var out = { full: [], near: [], incomplete: [], excluded: 0, funnel: t.criteria.map(function (x) { return { id: x.id, label: x.label, pass: 0, fail: 0, unknown: 0 }; }) };
    for (var i = 0; i < ds.size; i++) {
      if (fresh(i) !== true) { out.excluded++; continue; }
      var states = new Array(preds.length), fail = 0, unknown = 0;
      for (var k = 0; k < preds.length; k++) {
        var r = preds[k](i);
        if (r === true) { states[k] = "PASS"; out.funnel[k].pass++; }
        else if (r === false) { states[k] = "FAIL"; fail++; out.funnel[k].fail++; }
        else { states[k] = "UNKNOWN"; unknown++; out.funnel[k].unknown++; }
      }
      if (!fail && !unknown) out.full.push({ i: i, states: states });
      else if (fail === 1 && !unknown && nearOk) out.near.push({ i: i, states: states });
      else if (!fail && unknown) out.incomplete.push({ i: i, states: states });
    }
    var sc = t.sort ? ds.column(Q.columnKey(t.sort.field, t.timeframe || "1D")) : null, dir = t.sort && t.sort.dir === "asc" ? 1 : -1, sym = ds.column("s");
    function cmp(a, b) {
      if (sc) {
        var x = sc[a.i], y = sc[b.i], xn = typeof x === "number" && isFinite(x), yn = typeof y === "number" && isFinite(y);
        if (xn !== yn) return xn ? -1 : 1;
        if (xn && x !== y) return (x - y) * dir;
      }
      return sym[a.i] < sym[b.i] ? -1 : sym[a.i] > sym[b.i] ? 1 : 0;
    }
    out.full.sort(cmp); out.incomplete.sort(cmp);
    /* Fast erfuellt: zuerst nach dem fehlenden Kriterium (Reihenfolge der Vorlage), dann wie oben. */
    out.near.sort(function (a, b) { var fa = a.states.indexOf("FAIL"), fb = b.states.indexOf("FAIL"); return fa - fb || cmp(a, b); });
    return out;
  }

  /** Checkliste eines einzelnen Titels (Chart Studio). null, wenn das Kuerzel fehlt. */
  function checklist(ds, t, sym) {
    var i = ds.indexOf(sym); if (i < 0) return null;
    var fresh = Q.predicate(ds, FRESH, "1D")(i) === true;
    var states = t.criteria.map(function (x) { var r = predicate(ds, x.filter)(i); return r === true ? "PASS" : r === false ? "FAIL" : "UNKNOWN"; });
    var fail = states.filter(function (s) { return s === "FAIL"; }).length, unknown = states.filter(function (s) { return s === "UNKNOWN"; }).length;
    return { i: i, fresh: fresh, states: states, pass: states.length - fail - unknown, fail: fail, unknown: unknown,
      status: !fresh ? "EXCLUDED" : !fail && !unknown ? "FULL" : fail === 1 && !unknown && states.length >= NEAR_MIN ? "NEAR" : !fail ? "INCOMPLETE" : "NONE" };
  }

  /** Abfrage fuer den Filter-Baukasten (Anpassen). Kriterien ohne Abfragefeld (Ausbruchsrichtung) entfallen und werden genannt. */
  function toQuery(t) {
    var filters = [FRESH], dropped = [];
    t.criteria.forEach(function (x) {
      if (x.filter.kind === "all") x.filter.filters.forEach(function (f) { filters.push(f); });
      else if (x.filter.kind) dropped.push(x.label); else filters.push(x.filter);
    });
    return { query: { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: filters }], sort: t.sort || null }, dropped: dropped };
  }

  /** Zaehlung je Vorlage ohne Trendfilter: [erfuellt, fast erfuellt, unvollstaendig] (Startseite, index-v1.json). */
  function counts(ds) {
    var o = {};
    RESOLVED.forEach(function (t) { var r = evaluate(ds, t); o[t.id] = [r.full.length, r.near.length, r.incomplete.length]; });
    return o;
  }

  /** Adresse einer Vorlage; blocks = gewaehlte Trendfilter, show = "fast" | "offen". */
  function href(id, blocks, show) {
    var q = [];
    if (blocks && blocks.length) q.push("plus=" + blocks.join(","));
    if (show && show !== "voll") q.push("zeige=" + show);
    return "#/vorlagen/" + encodeURIComponent(id) + (q.length ? "?" + q.join("&") : "");
  }
  /** Gespeicherte Vorlage als Filteradresse ("vorlage=<id>[&plus=a,b]"). */
  function paramsOf(id, blocks) { return "vorlage=" + encodeURIComponent(id) + (blocks && blocks.length ? "&plus=" + blocks.join(",") : ""); }
  function blocksFromParam(v) { return String(v || "").split(",").filter(function (b) { return !!block(b); }); }

  /** Pruefung der Definitionen (Tests): eindeutige IDs, gueltige Filter je Zeitrahmen, keine Signal- oder Renditesprache. */
  function validateAll() {
    var errors = [], ids = {};
    var BANNED = /Kaufsignal|Verkaufssignal|kaufen|verkaufen|Rendite|Gewinn|Chance|empfehl|garantiert|Minervini|IBD/i;
    RESOLVED.concat(BLOCKS.map(function (b) { return Object.assign({ title: b.title, summary: "", group: "block" }, b); })).forEach(function (t) {
      if (ids[t.id]) errors.push("DUP " + t.id); ids[t.id] = 1;
      if (!t.criteria || !t.criteria.length) errors.push("NO_CRITERIA " + t.id);
      [t.title, t.summary, t.note || ""].forEach(function (s) { if (BANNED.test(s)) errors.push("WORDING " + t.id + ": " + s); });
      (t.criteria || []).forEach(function (x) {
        [x.label, x.why].forEach(function (s) { if (BANNED.test(s || "")) errors.push("WORDING " + t.id + "/" + x.id); });
        if (x.filter.kind === "formationDirection") return;
        var v = Q.validate({ timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: x.filter.kind === "all" ? x.filter.filters : [x.filter] }] });
        if (!v.ok) errors.push("FILTER " + t.id + "/" + x.id + " " + JSON.stringify(v.errors));
      });
    });
    return errors;
  }

  var api = { TEMPLATES_VERSION: TEMPLATES_VERSION, GROUPS: GROUPS, BLOCKS: BLOCKS, LIMITS: LIMITS, STATES: STATES, FRESH: FRESH, NEAR_MIN: NEAR_MIN,
    list: list, get: get, block: block, available: available, TEMPLATES: TEMPLATES, compose: compose, predicate: predicate, evaluate: evaluate, checklist: checklist, toQuery: toQuery,
    counts: counts, href: href, paramsOf: paramsOf, blocksFromParam: blocksFromParam, validateAll: validateAll };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Templates = api; }
})(typeof window !== "undefined" ? window : globalThis);
