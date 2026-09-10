/* Vision Universe — Full Universe, Screener (/universe/screener/).

   Dieselbe Bedienung wie /quant/screener/: Regeln bauen, sortieren,
   begrenzen. Der Unterschied liegt unter der Oberflaeche.

   /quant/screener/ laeuft auf dem synthetischen Modelluniversum und
   filtert dort auf Perzentilraenge (momentum6m >= 80). Hier gibt es keine
   Perzentile - hier gibt es gemessene Groessen aus echten Kursreihen. Ein
   Feld heisst deshalb "Rendite 12M" und nicht "momentum12m": derselbe
   Name mit anderer Bedeutung waere die schlimmste Variante.

   ZWEI DINGE, DIE DIESE SEITE NIE TUT

   Sie zaehlt einen fehlenden Wert nie als erfuellt - ein Titel ohne
   Faktorzeile ist nicht "unter SMA200", er ist unbekannt. Und sie zeigt
   nie eine leere Liste ohne Grund: "keine Treffer" und "nicht auswertbar"
   sind zwei verschiedene Antworten. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, P = window.VUProof, el = S.el;

  var STORAGE_KEY = "vu.universe.screen.v1";

  var VORGABE = {
    filters: [
      { field: "priceAboveSMA200", operator: "isTrue", value: true },
      { field: "returns.12M", operator: "gte", value: 20 },
      { field: "volatility252d", operator: "lte", value: 60 }
    ],
    sort: { field: "relativeStrength.12M", direction: "desc" },
    limit: 50
  };

  var OPERATOREN = {
    gte: { label: "≥", types: ["number"] },
    lte: { label: "≤", types: ["number"] },
    gt: { label: ">", types: ["number"] },
    lt: { label: "<", types: ["number"] },
    between: { label: "zwischen", types: ["number"] },
    eq: { label: "ist", types: ["enum"] },
    ne: { label: "ist nicht", types: ["enum"] },
    isTrue: { label: "trifft zu", types: ["bool"] },
    isFalse: { label: "trifft nicht zu", types: ["bool"] }
  };

  var KATEGORIE = { reference: "Stammdaten", trend: "Trend", range: "52-Wochen-Band",
                    momentum: "Momentum", risk: "Risiko", volume: "Volumen" };

  var state = { query: null, view: "table" };

  P.page({
    nav: P.BASE + "screener/",
    render: function (meta, index, root) {
      state.query = wiederherstellen(index);

      root.appendChild(el("header", {}, [
        el("p", { class: "q-kicker", text: "Screener · Full Universe" }),
        el("h1", { class: "q-h1", text: "Regeln auf dem ganzen Markt." }),
        el("p", { class: "q-lead", text:
          "Dieselben Regeln wie im bekannten Screener, angewandt auf " + S.num(index.withFactors, 0) +
          " gemessene Faktorzeilen aus " + S.num(index.count, 0) + " ausgelieferten Titeln." })
      ]));

      var bauer = el("div", { class: "q-card", style: "margin-top:24px" });
      var ergebnis = el("div", { style: "margin-top:26px" });
      root.appendChild(bauer);
      root.appendChild(ergebnis);
      root.appendChild(fragenAbschnitt(meta));

      /* Zwei Stufen, und der Unterschied ist kein Feinschliff.

         Wer eine Zahl tippt, aendert das Ergebnis - nicht die Regelzeile.
         Baut man beim change-Ereignis eines Eingabefeldes den ganzen
         Regelbauer neu, entfernt man das Feld, waehrend der Browser noch
         mitten in dessen Ereignisbehandlung steckt: der Fokus springt,
         und Chrome wirft "removeChild: node is no longer a child".
         Deshalb zeichnet nur der Feld-/Operatorwechsel die Regeln neu,
         und auch der erst nach dem laufenden Ereignis. */
      function neuBerechnen() {
        merken(state.query);
        S.mount(ergebnis, baueErgebnis(index, meta, lauf, neuBerechnen));
      }
      function lauf() {
        merken(state.query);
        setTimeout(function () {
          S.mount(bauer, baueRegeln(index, lauf, neuBerechnen));
          S.mount(ergebnis, baueErgebnis(index, meta, lauf, neuBerechnen));
        }, 0);
      }
      S.mount(bauer, baueRegeln(index, lauf, neuBerechnen));
      neuBerechnen();
    }
  });

  /* ----------------------------------------------------------- Regelbauer */

  function baueRegeln(index, lauf, neuBerechnen) {
    var knoten = [el("h2", { class: "q-h3", style: "margin-bottom:12px", text: "Regeln" })];

    state.query.filters.forEach(function (filter, i) {
      knoten.push(regelZeile(index, filter, i, lauf, neuBerechnen));
    });

    knoten.push(el("div", { class: "q-btn-row", style: "margin-top:14px" }, [
      el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "+ Regel",
        onclick: function () {
          state.query.filters.push({ field: "distanceTo52wHigh", operator: "gte", value: -10 });
          lauf();
        } }),
      el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "Zuruecksetzen",
        onclick: function () { state.query = JSON.parse(JSON.stringify(VORGABE)); lauf(); } })
    ]));

    knoten.push(el("div", { class: "q-grid q-grid--3", style: "margin-top:20px;padding-top:16px;border-top:1px solid var(--line)" }, [
      /* Sortierung und Grenze aendern das Ergebnis, nicht die Regeln -
         also wird auch nur das Ergebnis neu gezeichnet. */
      beschriftet("Sortieren nach", feldAuswahl(index, state.query.sort.field, function (v) {
        state.query.sort.field = v; neuBerechnen();
      }, function (f) { return f.type === "number"; })),
      beschriftet("Richtung", auswahl([["desc", "Absteigend"], ["asc", "Aufsteigend"]],
        state.query.sort.direction, function (v) { state.query.sort.direction = v; neuBerechnen(); })),
      beschriftet("Maximal", auswahl([["25", "25"], ["50", "50"], ["100", "100"], ["250", "250"], ["1000", "1000"]],
        String(state.query.limit), function (v) { state.query.limit = parseInt(v, 10); neuBerechnen(); }))
    ]));

    return knoten;
  }

  function regelZeile(index, filter, i, lauf, neuBerechnen) {
    var feld = P.fieldById(index, filter.field);
    var typ = feld ? feld.type : "number";
    var erlaubt = Object.keys(OPERATOREN).filter(function (op) {
      return OPERATOREN[op].types.indexOf(typ) !== -1;
    });

    return el("div", { class: "q-filter-row" }, [
      beschriftet("Feld", feldAuswahl(index, filter.field, function (v) {
        filter.field = v;
        var f = P.fieldById(index, v);
        if (f.type === "bool") { filter.operator = "isTrue"; filter.value = true; }
        else if (f.type === "enum") {
          filter.operator = "eq";
          filter.value = (index.enums[v] || [])[0] || "";
        } else if (typeof filter.value !== "number") { filter.operator = "gte"; filter.value = 0; }
        lauf();
      })),
      beschriftet("Operator", auswahl(erlaubt.map(function (op) { return [op, OPERATOREN[op].label]; }),
        filter.operator, function (v) {
          filter.operator = v;
          if (v === "between" && !Array.isArray(filter.value)) filter.value = [0, 100];
          if (v !== "between" && Array.isArray(filter.value)) filter.value = filter.value[0];
          if (v === "isTrue") filter.value = true;
          if (v === "isFalse") filter.value = false;
          lauf();
        })),
      beschriftet(wertLabel(feld), wertFeld(index, filter, neuBerechnen)),
      el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "Entfernen",
        "aria-label": "Regel entfernen",
        onclick: function () { state.query.filters.splice(i, 1); lauf(); } })
    ]);
  }

  function wertLabel(feld) {
    if (!feld) return "Wert";
    if (feld.type === "bool") return "—";
    if (feld.unit === "pct") return "Wert in %";
    return "Wert";
  }

  /* Bekommt bewusst neuBerechnen und nicht lauf: ein geaenderter Wert
     rechnet neu, baut aber die Zeile nicht neu unter dem Cursor weg. */
  function wertFeld(index, filter, neuBerechnen) {
    var feld = P.fieldById(index, filter.field);
    if (!feld || feld.type === "bool") {
      return el("span", { class: "q-note", text: "kein Wert noetig" });
    }
    if (feld.type === "enum") {
      return auswahl((index.enums[feld.id] || []).slice().sort().map(function (v) { return [v, v]; }),
        filter.value, function (v) { filter.value = v; neuBerechnen(); });
    }
    var eingabe = el("input", {
      class: "q-input", type: "text", inputmode: "decimal",
      value: Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value),
      onchange: function () {
        var roh = eingabe.value.trim().replace(/,(\d)/g, ".$1");
        if (filter.operator === "between") {
          filter.value = roh.split(/[;,]/).map(function (s) { return parseFloat(s.trim()); });
        } else {
          var n = parseFloat(roh);
          filter.value = Number.isFinite(n) ? n : 0;
        }
        neuBerechnen();
      }
    });
    return eingabe;
  }

  /* ------------------------------------------------------------ Ausfuehrung

     Auf den Spalten, nicht auf 5.683 Objekten: der Filter laeuft bei jedem
     Tastendruck neu, und das soll er auch auf einem Telefon tun. */

  function fuehreAus(index) {
    var n = index.count;
    var treffer = [], nichtAuswertbar = 0;

    var regeln = state.query.filters.map(function (f) {
      var feld = P.fieldById(index, f.field);
      return { f: f, feld: feld, spalte: index.columns[f.field] };
    }).filter(function (r) { return r.feld && r.spalte; });

    var sortFeld = P.fieldById(index, state.query.sort.field);
    var sortSpalte = index.columns[state.query.sort.field];

    for (var i = 0; i < n; i++) {
      var passt = true, unbekannt = false;
      for (var r = 0; r < regeln.length; r++) {
        var w = regeln[r].spalte[i];
        if (w === null || w === undefined) { unbekannt = true; passt = false; break; }
        if (!trifftZu(regeln[r], w)) { passt = false; break; }
      }
      if (unbekannt) nichtAuswertbar++;
      if (passt) treffer.push(i);
    }

    if (sortSpalte) {
      var richtung = state.query.sort.direction === "asc" ? 1 : -1;
      treffer.sort(function (a, b) {
        var va = sortSpalte[a], vb = sortSpalte[b];
        /* Fehlende Sortierwerte gehoeren ans Ende - in beide Richtungen.
           Sonst fuehrt "aufsteigend" eine Liste von Luecken an. */
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va - vb) * richtung;
      });
    }

    return { indices: treffer, notEvaluable: nichtAuswertbar, universe: n, sortField: sortFeld };
  }

  function trifftZu(regel, w) {
    var f = regel.f, feld = regel.feld;
    if (feld.type === "bool") {
      return f.operator === "isTrue" ? w === 1 : w === 0;
    }
    if (feld.type === "enum") {
      /* Enum-Spalten tragen den Index in die Werteliste. Verglichen wird
         ueber den Index, nicht ueber die Zeichenkette: eine Umwandlung je
         Zeile waere bei 5.683 Zeilen und jedem Tastendruck reine
         Verschwendung. Den Index setzt bereiteEnums() einmal je Lauf. */
      return f.operator === "eq" ? w === f._idx : w !== f._idx;
    }
    var v = feld.unit === "pct" ? f.value / 100 : f.value;
    switch (f.operator) {
      case "gte": return w >= v;
      case "lte": return w <= v;
      case "gt": return w > v;
      case "lt": return w < v;
      case "between":
        var a = Array.isArray(f.value) ? f.value[0] : 0, b = Array.isArray(f.value) ? f.value[1] : 0;
        if (feld.unit === "pct") { a = a / 100; b = b / 100; }
        return w >= Math.min(a, b) && w <= Math.max(a, b);
      default: return false;
    }
  }

  /* Enum-Filter brauchen den Index ihres Wertes. Er wird einmal je Lauf
     gesetzt, nicht je Zeile. */
  function bereiteEnums(index) {
    state.query.filters.forEach(function (f) {
      var feld = P.fieldById(index, f.field);
      if (feld && feld.type === "enum") {
        f._idx = (index.enums[f.field] || []).indexOf(f.value);
      }
    });
  }

  /* ------------------------------------------------------------- Ergebnis */

  function baueErgebnis(index, meta, lauf, neuBerechnen) {
    bereiteEnums(index);
    var res = fuehreAus(index);
    var sichtbar = res.indices.slice(0, state.query.limit);

    var kopf = el("div", { class: "q-section-head" }, [
      el("div", {}, [
        el("h2", { class: "q-h2", text: S.num(res.indices.length, 0) + " Treffer" }),
        el("p", { text: "Universum " + S.num(res.universe, 0) + " Titel · Datenstand " +
          S.formatDate(meta.asOf) +
          (res.indices.length > sichtbar.length ? " · angezeigt: " + S.num(sichtbar.length, 0) : "") })
      ]),
      el("div", { class: "q-btn-row" }, [
        el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button",
          text: state.view === "table" ? "Kompaktansicht" : "Spaltenansicht",
          onclick: function () { state.view = state.view === "table" ? "rows" : "table"; neuBerechnen(); } })
      ])
    ]);

    var koerper = sichtbar.length
      ? (state.view === "table" ? ergebnisTabelle(index, sichtbar, res) : ergebnisListe(index, sichtbar, res))
      : S.stateBox("Keine Treffer",
          "Kein Titel im ausgelieferten Universum erfuellt alle Regeln gleichzeitig. " +
          "Fehlende Werte erfuellen grundsaetzlich keine Regel - ein Titel ohne Faktorzeile gilt " +
          "nicht automatisch als 'unter SMA200'.", "empty");

    var lesart = el("div", { class: "q-card q-card--flat", style: "margin-top:18px" }, [
      el("h3", { class: "q-h3", style: "margin-bottom:10px", text: "So wurde gelesen" }),
      el("dl", { class: "q-kv" }, [].concat.apply([], state.query.filters.map(function (f, i) {
        return [el("dt", { text: "Regel " + (i + 1) }), el("dd", { text: regelText(index, f) })];
      })).concat([
        el("dt", { text: "Sortierung" }),
        el("dd", { text: (res.sortField ? res.sortField.label : state.query.sort.field) + " " +
          (state.query.sort.direction === "asc" ? "aufsteigend" : "absteigend") }),
        el("dt", { text: "Nicht auswertbar" }),
        el("dd", { text: S.num(res.notEvaluable, 0) + " Titel - mindestens ein Wert der Regeln fehlt " +
          "fuer sie. Sie zaehlen weder als Treffer noch als Gegenbeweis." })
      ]))
    ]);

    return [kopf, koerper, lesart];
  }

  function ergebnisTabelle(index, indices, res) {
    var spalten = [
      { id: "ticker", label: "Ticker" },
      { id: "exchange", label: "Boerse" },
      { id: "sector", label: "Sektor" },
      { id: "dataQuality", label: "Qualitaet" }
    ];
    /* Das Sortierfeld gehoert in die Tabelle - sonst sortiert die Liste
       nach einer Zahl, die niemand sieht. */
    var sortId = state.query.sort.field;
    var zusatz = [sortId].concat(state.query.filters.map(function (f) { return f.field; }))
      .filter(function (id, i, arr) { return arr.indexOf(id) === i; })
      .filter(function (id) { return ["ticker", "exchange", "sector", "dataQuality"].indexOf(id) === -1; })
      .slice(0, 6);
    zusatz.forEach(function (id) {
      var feld = P.fieldById(index, id);
      if (feld) spalten.push({ id: id, label: feld.label + (id === sortId ? " ↓" : ""), feld: feld });
    });

    return el("div", { class: "q-table-wrap" }, [
      el("table", { class: "q-table u-sticky" }, [
        el("thead", {}, [el("tr", {}, spalten.map(function (c) {
          return el("th", { scope: "col", text: c.label });
        }))]),
        el("tbody", {}, indices.map(function (i) {
          var r = P.rowAt(index, i);
          return el("tr", {}, spalten.map(function (c) {
            if (c.id === "ticker") return el("td", {}, [el("a", { href: P.stockHref(r.ticker), text: r.ticker })]);
            if (c.id === "dataQuality") return el("td", {}, [P.qualityChip(r.dataQuality)]);
            if (c.id === "exchange" || c.id === "sector") {
              var v = r[c.id];
              return el("td", { class: v && v !== "UNKNOWN" ? null : "na", text: v || "–" });
            }
            var w = r[c.id];
            if (w === null) return el("td", { class: "na" }, [P.missing("kein Wert ausgeliefert")]);
            if (c.feld && c.feld.type === "bool") return el("td", {}, [P.boolChip(w, "ja", "nein")]);
            return el("td", { text: P.fmtField(c.feld, w) });
          }));
        }))
      ])
    ]);
  }

  function ergebnisListe(index, indices, res) {
    var sortId = state.query.sort.field, sortFeld = res.sortField;
    return el("div", { class: "q-rows" }, indices.map(function (i, rang) {
      var r = P.rowAt(index, i);
      return el("a", { class: "q-row", href: P.stockHref(r.ticker) }, [
        el("span", { class: "q-row-rank", text: String(rang + 1) }),
        el("span", { class: "q-row-main" }, [
          el("b", { text: r.ticker }),
          el("span", { text: (r.sector && r.sector !== "UNKNOWN" ? r.sector : "Sektor nicht geliefert") +
            " · " + (r.exchange || "–") })
        ]),
        el("span", { class: "q-row-score" }, [
          el("b", { text: P.fmtField(sortFeld, r[sortId]) }),
          el("span", { text: sortFeld ? sortFeld.label : sortId })
        ])
      ]);
    }));
  }

  function regelText(index, f) {
    var feld = P.fieldById(index, f.field);
    var name = feld ? feld.label : f.field;
    if (!feld) return name;
    if (feld.type === "bool") return name + " " + (f.operator === "isTrue" ? "trifft zu" : "trifft nicht zu");
    if (feld.type === "enum") return name + " " + OPERATOREN[f.operator].label + " " + f.value;
    var einheit = feld.unit === "pct" ? " %" : "";
    if (f.operator === "between" && Array.isArray(f.value)) {
      return name + " zwischen " + f.value[0] + einheit + " und " + f.value[1] + einheit;
    }
    return name + " " + OPERATOREN[f.operator].label + " " + f.value + einheit;
  }

  /* -------------------------------------------------- Die 18 Laufffragen */

  function fragenAbschnitt(meta) {
    var fragen = meta.screenerQuestions || [];
    if (!fragen.length) return el("div", {});

    var zaehl = fragen.filter(function (q) { return q.kind !== "ranked"; });
    var rang = fragen.filter(function (q) { return q.kind === "ranked"; });

    var zaehlListe = el("div", { class: "q-metrics" }, zaehl.map(function (q) {
      return el("div", { class: "q-metric" }, [
        el("span", { text: q.label }),
        el("b", { text: q.resultStatus === "PRESENT" ? S.num(q.matched, 0) : "keine Daten" }),
        el("em", { text: q.resultStatus === "PRESENT"
          ? "von " + S.num(q.evaluatedOf || q.evaluated, 0) + " auswertbaren Titeln · " +
            S.num(q.notEvaluable || 0, 0) + " nicht auswertbar"
          : (q.resultStatusReason || "im Lauf nicht beantwortet") })
      ]);
    }));

    var rangListe = rang.map(function (q) {
      if (q.resultStatus !== "PRESENT") {
        return C.disclosure(q.label + " — keine Rangliste", [
          el("p", { class: "q-note", text: q.resultStatusReason || "Im Lauf nicht beantwortet." })
        ]);
      }
      return C.disclosure(q.label + " — Top " + q.entries.length +
          " von " + S.num(q.evaluated || 0, 0) + " auswertbaren", [
        q.tickersNote ? el("p", { class: "q-note", style: "margin-bottom:8px", text: q.tickersNote }) : null,
        el("div", { class: "q-table-wrap" }, [
          el("table", { class: "q-table" }, [
            el("thead", {}, [el("tr", {}, [
              el("th", { scope: "col", text: "#" }), el("th", { scope: "col", text: "Ticker" }),
              el("th", { scope: "col", text: "Wert" }), el("th", { scope: "col", text: "Qualitaet" })
            ])]),
            el("tbody", {}, q.entries.map(function (e, i) {
              return el("tr", {}, [
                el("td", { text: String(i + 1) }),
                el("td", {}, [el("a", { href: P.stockHref(e.ticker), text: e.ticker })]),
                el("td", { text: Number.isFinite(e.value) ? P.pct(e.value) : "–" }),
                el("td", {}, [P.qualityChip(e.dataQuality)])
              ]);
            }))
          ])
        ])
      ]);
    });

    return C.section("Die 18 Fragen des Laufs",
      "Nicht im Browser gerechnet: diese Zahlen stammen aus dem FULL_UNIVERSE-Lauf selbst und " +
      "decken alle auswertbaren Titel ab. Die Qualitaetsmarke steht neben jedem Rangwert - an der " +
      "Spitze einer Momentumliste stehen sonst Titel, deren Wert eine Bereinigungsluecke ist und " +
      "kein Kursverlauf.",
      el("div", {}, [zaehlListe, el("div", { style: "margin-top:18px" }, rangListe)]));
  }

  /* ---------------------------------------------------------------- Helfer */

  function beschriftet(label, control) {
    return el("div", { class: "q-field" }, [el("label", { text: label }), control]);
  }

  function feldAuswahl(index, wert, onChange, filterFn) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.value); } });
    var nachKategorie = {};
    index.fields.filter(function (f) { return !filterFn || filterFn(f); }).forEach(function (f) {
      (nachKategorie[f.category] || (nachKategorie[f.category] = [])).push(f);
    });
    Object.keys(nachKategorie).forEach(function (kat) {
      var gruppe = el("optgroup", { label: KATEGORIE[kat] || kat });
      nachKategorie[kat].forEach(function (f) {
        gruppe.appendChild(el("option", { value: f.id, text: f.label,
          selected: f.id === wert ? true : null }));
      });
      sel.appendChild(gruppe);
    });
    return sel;
  }

  function auswahl(paare, wert, onChange) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.value); } });
    paare.forEach(function (p) {
      sel.appendChild(el("option", { value: p[0], text: p[1],
        selected: String(p[0]) === String(wert) ? true : null }));
    });
    return sel;
  }

  function merken(query) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(query)); } catch (e) { /* privater Modus */ }
  }
  function wiederherstellen(index) {
    try {
      var roh = localStorage.getItem(STORAGE_KEY);
      if (roh) {
        var q = JSON.parse(roh);
        if (q && Array.isArray(q.filters) && q.sort &&
            q.filters.every(function (f) { return P.fieldById(index, f.field); }) &&
            P.fieldById(index, q.sort.field)) return q;
      }
    } catch (e) { /* ignorieren */ }
    return JSON.parse(JSON.stringify(VORGABE));
  }
})();
