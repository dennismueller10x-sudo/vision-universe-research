/* Vision Universe — Full Universe, Startseite (/universe/).

   Die Frage, die diese Seite beantwortet: ist der ganze Markt wirklich da
   und erreichbar? Nicht "sind fuenf Beispiele da". Deshalb steht die
   Suche ueber ALLE ausgelieferten Titel ganz oben, und jede Zeile fuehrt
   in die Einzeltitelansicht. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, P = window.VUProof, el = S.el;

  var state = { q: "", exchange: "", sector: "", quality: "", onlyFactors: false, limit: 100 };

  P.page({
    nav: P.BASE,
    render: function (meta, index, root) {
      root.appendChild(el("header", {}, [
        el("p", { class: "q-kicker", text: "Full Universe · " + meta.gate }),
        el("h1", { class: "q-h1", text: "Das ganze ausgelieferte Universum." }),
        el("p", { class: "q-lead", text:
          "Dieselbe Quant-Oberflaeche wie bisher - nur mit " + S.num(index.count, 0) + " echten Titeln " +
          "darin statt einer Auswahl. Jeder davon ist suchbar und hat eine eigene Seite." })
      ]));

      root.appendChild(C.section("Umfang", "Was gemessen wurde, und wie weit es reicht.",
        C.metricGrid([
          { label: "Titel im Universum", value: S.num(index.count, 0),
            hint: "regelbasiert aus dem Anbieteruniversum" },
          { label: "mit Faktorzeile", value: S.num(index.withFactors, 0),
            hint: quotient(index.withFactors, index.count) + " der Titel" },
          { label: "Boersen", value: S.num(werteZahl(index, "exchange"), 0) },
          { label: "Sektoren belegt", value: S.num(sektorenBelegt(index), 0),
            hint: "der Rest traegt UNKNOWN - der Zugang liefert keinen Sektor" },
          { label: "Datenstand", value: S.formatDate(meta.asOf) },
          { label: "Snapshot", value: meta.dataSnapshotId || "–" }
        ])));

      /* ------------------------------------------------------- Suche */
      var eingabe = el("input", {
        class: "q-input", type: "search", id: "u-q", autocomplete: "off",
        placeholder: "Ticker suchen — z. B. ORCL, TSLA, KO …",
        oninput: function () { state.q = eingabe.value.trim().toUpperCase(); state.limit = 100; zeichne(); }
      });

      var facetten = el("div", { class: "u-facets" });
      var zaehler = el("div", { class: "u-count" });
      var trefferHost = el("div", {});

      root.appendChild(C.section("Suche im gesamten Universum",
        "Tippen genuegt. Die Liste unten zaehlt immer alle Treffer, nicht nur die sichtbaren.",
        el("div", {}, [
          el("div", { class: "u-search" }, [
            el("div", { class: "q-field" }, [el("label", { for: "u-q", text: "Ticker" }), eingabe])
          ]),
          facetten, zaehler, trefferHost
        ])));

      /* ------------------------------------------------- Chart-Nachweis */
      root.appendChild(chartNachweis(meta));

      root.appendChild(C.section("Screener", "Regeln auf gemessenen Faktorzeilen ueber das volle Universum.",
        el("div", {}, [
          el("p", { class: "q-note", text:
            "Der Screener arbeitet auf denselben " + S.num(index.withFactors, 0) + " Faktorzeilen, die auch " +
            "der Einzeltitel zeigt - und auf denselben 18 Fragen, die der Lauf beantwortet hat." }),
          el("div", { class: "q-btn-row", style: "margin-top:12px" }, [
            el("a", { class: "q-btn", href: P.BASE + "screener/", text: "Screener oeffnen" })
          ])
        ])));

      root.appendChild(el("div", { style: "margin-top:32px" }, [
        C.disclosure("Was in diesem Nachweis steht - und was nicht", [
          el("dl", { class: "q-kv" }, [].concat.apply([], [
            ["Abgeleitetes Universum", umfangText(meta, "derivedUniverse")],
            ["Kurshistorien-Bestand", umfangText(meta, "fullHistoricalOhlcvStore")],
            ["Kursniveaus", umfangText(meta, "priceLevels")],
            ["VU Quant Score", "Nicht vorhanden. Er braucht Fundamentaldaten; die liegen fuer dieses " +
              "Universum nicht vor. Eine Ersatzzahl waere eine Erfindung."],
            ["Faktorartefakt", (meta.factorArtefact && meta.factorArtefact.present)
              ? S.num(meta.factorArtefact.securities, 0) + " Zeilen, erzeugt " +
                S.formatDate(meta.factorArtefact.generatedAt) + ", Auslieferung: " +
                (meta.factorArtefact.entitlement || "–")
              : "nicht vorhanden"]
          ].map(function (p) { return [el("dt", { text: p[0] }), el("dd", { text: p[1] })]; }))
        )])
      ]));

      // -------------------------------------------------------- Zeichnen
      var alle = null;   /* einmal aufgebaut, danach nur gefiltert */

      function reihen() {
        if (!alle) {
          alle = new Array(index.count);
          for (var i = 0; i < index.count; i++) alle[i] = P.rowAt(index, i);
        }
        return alle;
      }

      function treffer() {
        var q = state.q;
        return reihen().filter(function (r) {
          if (q && r.ticker.indexOf(q) !== 0 && r.ticker.indexOf(q) === -1) return false;
          if (state.exchange && r.exchange !== state.exchange) return false;
          if (state.sector && r.sector !== state.sector) return false;
          if (state.quality && (r.dataQuality || "") !== state.quality) return false;
          if (state.onlyFactors && !r.hasFactors) return false;
          return true;
        }).sort(function (a, b) {
          /* Ein exakter Treffer gehoert nach oben, danach die Praefixe,
             dann alles Uebrige alphabetisch. Wer "KO" sucht, meint KO. */
          if (q) {
            var ra = rang(a.ticker, q), rb = rang(b.ticker, q);
            if (ra !== rb) return ra - rb;
          }
          return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
        });
      }

      function rang(t, q) { return t === q ? 0 : t.indexOf(q) === 0 ? 1 : 2; }

      function zeichne() {
        S.mount(facetten, [
          auswahl("Boerse", werte(index, "exchange"), state.exchange, function (v) { state.exchange = v; state.limit = 100; zeichne(); }),
          auswahl("Sektor", werte(index, "sector"), state.sector, function (v) { state.sector = v; state.limit = 100; zeichne(); }),
          auswahl("Datenqualitaet", werte(index, "dataQuality"), state.quality, function (v) { state.quality = v; state.limit = 100; zeichne(); }),
          el("div", { class: "q-field" }, [
            el("label", { text: "Faktorzeile" }),
            simpel([["", "alle Titel"], ["1", "nur mit Faktorzeile"]], state.onlyFactors ? "1" : "",
              function (v) { state.onlyFactors = v === "1"; state.limit = 100; zeichne(); })
          ])
        ]);

        var res = treffer();
        var sichtbar = res.slice(0, state.limit);

        S.mount(zaehler, [
          el("b", { text: S.num(res.length, 0) + (res.length === 1 ? " Titel" : " Titel") }),
          el("span", { class: "q-note", text: res.length > sichtbar.length
            ? "angezeigt: " + S.num(sichtbar.length, 0) + " von " + S.num(res.length, 0) +
              " · durchsucht: " + S.num(index.count, 0)
            : "durchsucht: " + S.num(index.count, 0) + " Titel" })
        ]);

        if (!res.length) {
          S.mount(trefferHost, S.stateBox("Kein Titel gefunden",
            "Im ausgelieferten Universum gibt es keinen Titel, der alle gesetzten Merkmale traegt. " +
            "Die Suche vergleicht Ticker; Firmennamen liefert der Zugang fuer dieses Universum nicht.", "empty"));
          return;
        }

        var mehr = res.length > sichtbar.length
          ? el("div", { class: "q-btn-row", style: "margin-top:14px" }, [
              el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button",
                text: "Weitere 250 anzeigen",
                onclick: function () { state.limit += 250; zeichne(); } })
            ])
          : null;

        S.mount(trefferHost, [tabelle(sichtbar), mehr]);
      }

      zeichne();
    }
  });

  /* ------------------------------------------------------------ Bausteine */

  function tabelle(rows) {
    var spalten = [
      { id: "ticker", label: "Ticker" },
      { id: "exchange", label: "Boerse" },
      { id: "sector", label: "Sektor" },
      { id: "dataQuality", label: "Qualitaet" },
      { id: "historyYears", label: "Historie" },
      { id: "returns.12M", label: "Rendite 12M" },
      { id: "distanceToSMA200", label: "Abstand SMA200" },
      { id: "priceAboveSMA200", label: "Ueber SMA200" }
    ];
    return el("div", { class: "q-table-wrap" }, [
      el("table", { class: "q-table u-sticky" }, [
        el("thead", {}, [el("tr", {}, spalten.map(function (c) {
          return el("th", { scope: "col", text: c.label });
        }))]),
        el("tbody", {}, rows.map(function (r) {
          return el("tr", {}, spalten.map(function (c) { return zelle(r, c); }));
        }))
      ])
    ]);
  }

  function zelle(r, c) {
    if (c.id === "ticker") {
      return el("td", {}, [el("a", { href: P.stockHref(r.ticker), text: r.ticker })]);
    }
    if (c.id === "dataQuality") return el("td", {}, [P.qualityChip(r.dataQuality)]);
    if (c.id === "priceAboveSMA200") {
      return el("td", {}, [r[c.id] === null ? P.missing("keine Faktorzeile ausgeliefert")
                                            : P.boolChip(r[c.id], "ja", "nein")]);
    }
    if (c.id === "historyYears") {
      return el("td", { class: Number.isFinite(r[c.id]) ? null : "na",
        text: Number.isFinite(r[c.id]) ? S.num(r[c.id], 1) + " J." : "–" });
    }
    if (c.id === "exchange" || c.id === "sector") {
      var v = r[c.id];
      return el("td", { class: v && v !== "UNKNOWN" ? null : "na", text: v || "–" });
    }
    var wert = r[c.id];
    if (wert === null) return el("td", { class: "na" }, [P.missing("keine Faktorzeile ausgeliefert")]);
    return el("td", { text: P.pct(wert) });
  }

  function chartNachweis(meta) {
    var chart = meta.chart || {};
    var hist = chart.historical || {}, intra = chart.intraday || {}, rt = chart.realtime || {};
    var titel = hist.scope || [];

    var karten = el("div", { class: "q-metrics" }, [
      el("div", { class: "q-metric" }, [
        el("span", { text: "Historischer Chart (EOD)" }),
        el("b", {}, [P.toneChip(titel.length ? "REAL · " + titel.length + " Titel" : "UNAVAILABLE",
                                titel.length ? "strong" : "poor")]),
        el("em", { text: hist.note || "" })
      ]),
      el("div", { class: "q-metric" }, [
        el("span", { text: "Intraday-Chart" }),
        el("b", {}, [P.toneChip("UNAVAILABLE", "poor")]),
        el("em", { text: intra.note || "" })
      ]),
      el("div", { class: "q-metric" }, [
        el("span", { text: "Realtime / Live-Chart" }),
        el("b", {}, [P.toneChip("NICHT IN DIESER AUSLIEFERUNG", "poor")]),
        el("em", { text: rt.note || "" })
      ])
    ]);

    var links = titel.length
      ? el("div", { class: "q-btn-row", style: "margin-top:14px" }, titel.map(function (t) {
          return el("a", { class: "q-btn q-btn--ghost q-btn--sm", href: P.stockHref(t),
                           text: t + " — Kursverlauf ansehen" });
        }))
      : null;

    var belegt = rt.backendProof
      ? el("p", { class: "q-note", style: "margin-top:12px", text:
          "Backend-Beleg vom " + S.formatDateTime(rt.backendProof.generatedAt) + ": LIVE_CHART_READY = " +
          rt.backendProof.LIVE_CHART_READY + " ueber " + (rt.backendProof.wsUrl || "WebSocket") +
          ". Das ist ein Nachweis im Backend, kein Chart im Browser - und wird hier ausdruecklich " +
          "nicht als Produkterfolg gezaehlt. Kursart laut Anbieter: " +
          (rt.backendProof.priceType || "UNSPECIFIED") + "." })
      : null;

    return C.section("Chart — was wirklich laeuft",
      "Drei getrennte Fragen, drei getrennte Antworten. Nichts davon ist simuliert.",
      el("div", {}, [karten, links, belegt]));
  }

  /* ---------------------------------------------------------- Helfer */

  function werte(index, feldId) {
    var liste = (index.enums[feldId] || []).slice().sort();
    return [["", "alle"]].concat(liste.map(function (v) { return [v, v]; }));
  }
  function werteZahl(index, feldId) { return (index.enums[feldId] || []).length; }
  function sektorenBelegt(index) {
    return (index.enums.sector || []).filter(function (s) { return s !== "UNKNOWN"; }).length;
  }
  function quotient(a, b) { return b ? S.num((a / b) * 100, 1) + " %" : "–"; }

  function umfangText(meta, key) {
    var s = (meta.datasetScope || {})[key];
    if (!s) return "–";
    var kopf = s.status + (s.securities ? " · " + S.num(s.securities, 0) + " Titel" : "") +
               (s.approximateSize ? " · " + s.approximateSize : "");
    return kopf + " — " + (s.note || "");
  }

  function auswahl(label, paare, wert, onChange) {
    return el("div", { class: "q-field" }, [
      el("label", { text: label }), simpel(paare, wert, onChange)
    ]);
  }
  function simpel(paare, wert, onChange) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.value); } });
    paare.forEach(function (p) {
      sel.appendChild(el("option", { value: p[0], text: p[1], selected: String(p[0]) === String(wert) ? true : null }));
    });
    return sel;
  }
})();
