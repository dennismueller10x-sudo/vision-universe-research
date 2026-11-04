/* =========================================================================
   VISION UNIVERSE CORE — query-engine.js

   EINE ABFRAGE-ENGINE FUER /screener/ UND /technical/.

   Beide Oberflaechen teilen dasselbe Abfragemodell (Gruppen mit UND/ODER,
   Verknuepfung zwischen den Gruppen, Filter mit field/op/value[/value2])
   und werten es hier aus. Was je Welt verschieden ist, bleibt bei ihr:

     screener/engine (fields.js, query.js, engine.js)
       Feldkatalog, Validierung (wirft), URL-Form, Ranking, Why-Match.
     quant/engines/technical/technical-query.js
       Feldkatalog mit Zeitrahmen, Validierung (Fehlerliste), Texte,
       KI-Schema, Vorlagen.

   Diese Datei kennt keine Felder. Sie bekommt Spalten und Filter und
   liefert:
     createDataset   spaltenbasierter Datensatz, optional mit Feldaufloesung
     predicate       Filter -> function(i) -> true | false | null
     run             Gruppen und Verknuepfung -> Treffer, Trichter, Zaehler
     tally           Treffer und fehlende Werte eines Filters im Universum
     compareBy       Sortierung mit fehlenden Werten am Ende

   Grundregel beider Welten: Ein fehlender Wert erfuellt KEINE Bedingung
   (Praedikat null). Der Trichter weist aus, wie viele Titel ein Filter
   wegen fehlender Daten verliert.

   UMD: Browser/Worker (globalThis.VUCore.QueryEngine), Node (require).
   Keine Abhaengigkeiten.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.QueryEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "vu-query-engine-1.0.0";

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function absent(v) { return v === null || v === undefined; }
  function always(r) { return function () { return r; }; }

  /* ----------------------------------------------------------- Datensatz */
  /**
   * Spaltenbasierter Datensatz aus einem Artefakt mit cols.s (Kuerzel).
   * @param resolve optional function(key, cols) -> Spalte | null; das Ergebnis wird je Schluessel zwischengespeichert.
   *                Ohne resolve ist column(key) die Spalte cols[key].
   */
  function createDataset(artifact, resolve) {
    if (!artifact || !artifact.cols || !Array.isArray(artifact.cols.s)) throw new Error("INVALID_DATASET");
    var cols = artifact.cols, n = cols.s.length, index = Object.create(null), cache = Object.create(null);
    for (var i = 0; i < n; i++) index[cols.s[i]] = i;
    function column(key) {
      if (!resolve) return cols[key] || null;
      if (cache[key]) return cache[key];
      var c = resolve(key, cols) || null;
      if (c) cache[key] = c;
      return c;
    }
    return {
      size: n, meta: artifact, cols: cols, column: column,
      symbol: function (k) { return cols.s[k]; },
      indexOf: function (sym) { var k = index[sym]; return k === undefined ? -1 : k; },
      row: function (k) { var o = {}; Object.keys(cols).forEach(function (key) { o[key] = cols[key][k]; }); return o; }
    };
  }

  /* ---------------------------------------------------------- Praedikate */
  /**
   * Praedikat eines Filters ueber eine Spalte: function(i) -> true | false | null (null = kein Wert).
   *
   * @param c      Spalte (Array) oder null -> immer null
   * @param filter { op, value, value2 }   op: gt gte lt lte between eq | is | in nin
   * @param o      {
   *   kind:      "number" | "bool" | "enum"
   *   strict:    Zahl nur, wenn endlich (sonst fehlend); ohne strict fehlt nur null/undefined
   *   eqTol:     Toleranz fuer op "eq"
   *   listOnly:  Listenspalte, in der leer oder fehlend "nicht erfuellt" heisst (false statt null)
   *   window:    Spalte mit der Laenge des Pruefraums eines Ereignisfelds ("Tage seit ...").
   *              Leerer Wert + Fenster W = kein Ereignis in den letzten W Bars. Entschieden wird
   *              nur, was daraus sicher folgt; sonst bleibt der Wert unbekannt (null), nie geraten.
   * }
   */
  function predicate(c, filter, o) {
    o = o || {};
    if (!c) return always(null);
    if (o.kind === "bool") {
      /* Vergleich mit dem Wert selbst: validierte Filter tragen true/false. */
      var want = filter.value;
      return function (i) { var v = c[i]; return absent(v) ? null : !!v === want; };
    }
    if (o.kind === "enum") {
      var set = Object.create(null), neg = filter.op === "nin", listOnly = !!o.listOnly;
      filter.value.forEach(function (v) { set[v] = 1; });
      return function (i) {
        var v = c[i];
        if (listOnly && (!v || !v.length)) return false;
        if (absent(v)) return null;
        var hit = false;
        if (Array.isArray(v)) { for (var k = 0; k < v.length && !hit; k++) if (set[v[k]]) hit = true; }
        else hit = !!set[v];
        return neg ? !hit : hit;
      };
    }
    var a = filter.value, b = filter.value2, tol = o.eqTol;
    var test = {
      gt: function (v) { return v > a; }, gte: function (v) { return v >= a; },
      lt: function (v) { return v < a; }, lte: function (v) { return v <= a; },
      between: function (v) { return v >= a && v <= b; }, eq: function (v) { return Math.abs(v - a) <= tol; }
    }[filter.op];
    var has = o.strict ? isNum : function (v) { return !absent(v); };
    var w = o.window || null;
    if (!w) return function (i) { var v = c[i]; return has(v) ? test(v) : null; };
    var whenAbsent = {
      lte: function (W) { return a < W ? false : null; }, lt: function (W) { return a <= W ? false : null; },
      gt: function (W) { return W > a ? true : null; }, gte: function (W) { return W >= a ? true : null; },
      between: function (W) { return b < W ? false : null; }
    }[filter.op];
    return function (i) {
      var v = c[i]; if (has(v)) return test(v);
      var W = w[i]; return isNum(W) ? whenAbsent(W) : null;
    };
  }

  /** Treffer und fehlende Werte eines Praedikats im ganzen Universum. */
  function tally(n, p) {
    var pass = 0, missing = 0;
    for (var i = 0; i < n; i++) { var r = p(i); if (r === true) pass++; else if (r === null) missing++; }
    return { pass: pass, missing: missing };
  }

  /* ---------------------------------------------------------- Auswertung */
  /**
   * Wertet Gruppen und Verknuepfung aus.
   *
   * @param n       Universumsgroesse
   * @param q       { logic: "AND"|"OR", groups: [{ id, op: "AND"|"OR", filters: [{ id, ... }] }] }
   * @param pred    { filterId: function(i) -> true|false|null }
   * @param o       {
   *   countMatches: je Titel die Zahl erfuellter Bedingungen zaehlen (matched); dann werden
   *                 ODER-Gruppen vollstaendig statt abgekuerzt geprueft
   *   filterStep(f, g, gi)           -> Kopf des Trichterschritts eines Filters ({ kind, label, ... })
   *   groupStep(g, gi, standalone)   -> Kopf des Trichterschritts einer Gruppe
   * }
   * @returns {{ indices: number[] (aufsteigend), funnel, groups: { groupId: Treffer allein }, matched: number[] | null }}
   */
  function run(n, q, pred, o) {
    o = o || {};
    var groups = q.groups.filter(function (g) { return g.filters.length; });
    var count = !!o.countMatches, matched = null, i;
    if (count) { matched = new Array(n); for (i = 0; i < n; i++) matched[i] = 0; }
    function groupPass(g, k) {
      var fl = g.filters, j, r;
      if (count) {
        var any = false, all = true;
        for (j = 0; j < fl.length; j++) { r = pred[fl[j].id](k); if (r === true) { any = true; matched[k]++; } else all = false; }
        return g.op === "OR" ? any : all;
      }
      if (g.op === "OR") { for (j = 0; j < fl.length; j++) if (pred[fl[j].id](k) === true) return true; return false; }
      for (j = 0; j < fl.length; j++) if (pred[fl[j].id](k) !== true) return false;
      return true;
    }
    function step(head, fields) { Object.keys(fields).forEach(function (key) { head[key] = fields[key]; }); return head; }
    var funnel = [{ kind: "start", label: "Ausgangsuniversum", count: n, lost: 0, missing: 0 }];
    var stats = {}, alive = [];
    if (!groups.length) { for (i = 0; i < n; i++) alive.push(i); }
    else if (q.logic === "AND") {
      var cur = []; for (i = 0; i < n; i++) cur.push(i);
      groups.forEach(function (g, gi) {
        if (g.op === "AND") {
          g.filters.forEach(function (f) {
            var p = pred[f.id], next = [], missing = 0;
            for (var k = 0; k < cur.length; k++) { var r = p(cur[k]); if (r === true) { next.push(cur[k]); if (count) matched[cur[k]]++; } else if (r === null) missing++; }
            funnel.push(step(o.filterStep(f, g, gi), { count: next.length, lost: cur.length - next.length, missing: missing }));
            cur = next;
          });
        } else {
          var keep = cur.filter(function (k) { return groupPass(g, k); });
          funnel.push(step(o.groupStep(g, gi, false), { count: keep.length, lost: cur.length - keep.length, missing: 0 }));
          cur = keep;
        }
      });
      alive = cur;
    } else {
      var hit = new Uint8Array(n);
      groups.forEach(function (g, gi) {
        var c = 0;
        for (var k = 0; k < n; k++) if (groupPass(g, k)) { hit[k] = 1; c++; }
        stats[g.id] = c;
        funnel.push(step(o.groupStep(g, gi, true), { count: c, lost: n - c, missing: 0, standalone: true }));
      });
      for (i = 0; i < n; i++) if (hit[i]) alive.push(i);
      funnel.push({ kind: "union", label: "Mindestens eine Gruppe erfüllt (ODER)", count: alive.length, lost: n - alive.length, missing: 0 });
    }
    return { indices: alive, funnel: funnel, groups: stats, matched: matched };
  }

  /* ---------------------------------------------------------- Sortierung */
  /**
   * Vergleichsfunktion fuer Indizes: Wert nach Richtung, fehlende Werte ans Ende.
   * @param key          function(i) -> Wert, oder null (dann nur tie)
   * @param dir          1 aufsteigend, -1 absteigend
   * @param isMissing    function(v) -> true, wenn der Wert fehlt
   * @param tie          function(a, b) bei Gleichstand (Standard 0)
   * @param tieIfMissing auch bei zwei fehlenden Werten tie anwenden (sonst 0)
   */
  function compareBy(key, dir, isMissing, tie, tieIfMissing) {
    tie = tie || function () { return 0; };
    if (!key) return tie;
    return function (a, b) {
      var x = key(a), y = key(b), xm = isMissing(x), ym = isMissing(y);
      if (xm || ym) return xm && ym ? (tieIfMissing ? tie(a, b) : 0) : xm ? 1 : -1;
      return (x - y) * dir || tie(a, b);
    };
  }

  return { VERSION: VERSION, isNum: isNum, createDataset: createDataset, predicate: predicate, tally: tally, run: run, compareBy: compareBy };
});
