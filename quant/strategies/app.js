/* Vision Universe Quant — Strategie-Bibliothek (/quant/strategies).
   Uebersicht aller Strategien und die Detailansicht einer einzelnen:
   Thesis, Universum, Regeln, Ranking, Gewichtung, Rebalancing,
   Risikokontrollen, Benchmark, Methodik, Lineage (§34, §33). */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, el = S.el;
  var Api = window.QuantApi, Strategy = window.VUStrategy, Query = window.VUQuery, VUQL = window.VUQL;

  S.page({
    nav: S.BASE + "strategies/",
    need: ["securities"],
    render: function (data, root) {
      var id = S.param("id");
      return Api.listStrategies().then(function (all) {
        var records = all.library.concat(all.own);
        if (id) {
          var record = records.filter(function (r) { return r.strategy.strategyId === id; })[0];
          if (!record) {
            root.appendChild(S.stateBox("Strategie nicht gefunden",
              "Unter der ID " + id + " ist keine Strategie hinterlegt.", "empty"));
            return;
          }
          return renderDetail(root, record, data);
        }
        renderLibrary(root, all, data);
      });
    }
  });

  /* ------------------------------------------------------------ Uebersicht */
  function renderLibrary(root, all, data) {
    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker", text: "Strategien" }),
      el("h1", { class: "q-h1", text: "Regelwerke, keine Aktienlisten." }),
      el("p", { class: "q-lead", text:
        "Jede Strategie ist eine vollstaendige, versionierte Definition: Universum, Filter, Ranking, " +
        "Portfoliokonstruktion, Rebalancing und Ausfuehrungsannahmen. Dieselbe Definition laesst sich " +
        "historisch testen und auf den heutigen Datenstand anwenden." })
    ]));

    root.appendChild(C.section("Bibliothek", null,
      el("div", { class: "q-grid q-grid--2" }, all.library.map(function (rec) { return strategyCard(rec); }))));

    if (all.own.length) {
      root.appendChild(C.section("Eigene Strategien",
        "Lokal in diesem Browser gespeichert. Jede Aenderung erzeugt eine neue, unveraenderliche Version.",
        el("div", { class: "q-grid q-grid--2" }, all.own.map(function (rec) { return strategyCard(rec); }))));
    }

    root.appendChild(C.section("Eigene Strategie bauen",
      "Der Strategy Builder und die AI erzeugen exakt dasselbe Objekt — es gibt nur eine Strategy Engine.",
      el("div", { class: "q-btn-row" }, [
        el("a", { class: "q-btn", href: S.BASE + "strategies/builder/", text: "Strategy Lab oeffnen" }),
        el("a", { class: "q-btn q-btn--ghost", href: S.BASE + "ai/", text: "Strategie beschreiben" })
      ])));
  }

  function strategyCard(rec) {
    var version = rec.versions[rec.versions.length - 1];
    var def = version.definition;
    return el("a", { class: "q-strategy", href: S.BASE + "strategies/?id=" + encodeURIComponent(rec.strategy.strategyId) }, [
      el("div", { style: "display:flex;justify-content:space-between;gap:12px;align-items:baseline" }, [
        el("h3", { text: rec.strategy.name }),
        el("span", { class: "q-chip", text: "V" + version.version })
      ]),
      el("p", { text: rec.strategy.thesis }),
      el("div", { class: "q-strategy-meta" }, [
        el("span", { class: "q-chip", text: def.portfolio.positions + " Positionen" }),
        el("span", { class: "q-chip", text: def.rebalance === "monthly" ? "monatlich" : "quartalsweise" }),
        el("span", { class: "q-chip", text: rankingLabel(def) }),
        el("span", { class: "q-chip", text: "max. " + Math.round(def.portfolio.maxSectorWeight * 100) + " % je Sektor" })
      ])
    ]);
  }

  function rankingLabel(def) {
    return def.ranking.factors.map(function (f) {
      return S.FACTOR_LABEL[f.factor] + " " + Math.round(f.weight * 100) + " %";
    }).join(" · ");
  }

  /* --------------------------------------------------------------- Detail */
  function renderDetail(root, record, data) {
    var versionParam = parseInt(S.param("version", ""), 10);
    var version = Number.isFinite(versionParam)
      ? Strategy.getVersion(record, versionParam) : Strategy.getVersion(record);
    var def = version.definition;
    var described = Strategy.describe(def);

    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker" }, [
        el("a", { href: S.BASE + "strategies/", text: "Strategien", style: "text-decoration:none" }),
        document.createTextNode(" · Version " + version.version + " · " +
          (record.strategy.origin === "library" ? "Bibliothek" : record.strategy.origin === "ai" ? "AI-erzeugt" : "selbst gebaut"))
      ]),
      el("h1", { class: "q-h1", text: record.strategy.name }),
      el("p", { class: "q-lead", text: record.strategy.thesis })
    ]));

    if (record.strategy.mainRisk) {
      root.appendChild(el("div", { class: "q-card q-card--flat", style: "margin-top:18px" }, [
        el("p", { class: "q-kicker", style: "margin-bottom:6px", text: "Hauptrisiko" }),
        el("p", { style: "margin:0;font-size:14px;line-height:1.6", text: record.strategy.mainRisk })
      ]));
    }

    root.appendChild(C.section("Regelwerk", null, el("div", { class: "q-card" }, [
      el("dl", { class: "q-kv" }, [
        el("dt", { text: "Universum" }), el("dd", { text: described.universe }),
        el("dt", { text: "Ranking" }), el("dd", { text: described.ranking.join(" · ") }),
        el("dt", { text: "Positionen" }), el("dd", { text: String(described.positions) }),
        el("dt", { text: "Gewichtung" }), el("dd", { text: described.weighting }),
        el("dt", { text: "Max. Einzelposition" }), el("dd", { text: described.maxPositionWeight }),
        el("dt", { text: "Max. Sektorgewicht" }), el("dd", { text: described.maxSectorWeight }),
        el("dt", { text: "Rebalancing" }), el("dd", { text: described.rebalance }),
        el("dt", { text: "Ausfuehrung" }), el("dd", { text: described.execution }),
        el("dt", { text: "Benchmark" }), el("dd", { text: window.VUMethodology.backtest().benchmark.label }),
        el("dt", { text: "Definition-Hash" }), el("dd", { text: version.definitionHash })
      ]),
      el("p", { class: "q-kicker", style: "margin:20px 0 8px", text: "Filter" }),
      def.filters.length
        ? el("ul", { style: "margin:0;padding-left:20px;font-size:14px;line-height:1.8" },
            def.filters.map(function (f) { return el("li", { text: Query.describeFilter(f) }); }))
        : el("p", { class: "q-note", text: "Keine Vorfilter — das Ranking arbeitet auf dem gesamten Universum." })
    ])));

    root.appendChild(C.section("Historischer Test",
      "Die Regeln oben werden Point-in-Time auf das historische Universum angewendet. " +
      "Der Lauf berechnet an jedem Rebalancing-Termin ein vollstaendiges Faktor-Panel und laeuft " +
      "deshalb einige Sekunden.",
      backtestLauncher(record, version, data)));

    root.appendChild(C.section("Strategy Lineage",
      "Strategien sind unveraenderlich. Eine Aenderung erzeugt eine neue Version mit Begruendung.",
      lineageView(record, version)));

    root.appendChild(C.disclosure("VUQL-Darstellung der Filter", [
      el("p", { class: "q-note", text: "Die Filter dieser Strategie als lesbare Abfrage — teilbar und im Screener wiederverwendbar." }),
      el("pre", { class: "q-code", text: VUQL.serialize(Query.createQuery({
        universe: def.universe, filters: def.filters,
        sort: [{ field: "quantScore", direction: "desc" }], limit: def.portfolio.positions
      })) })
    ]));
    root.appendChild(C.disclosure("Vollstaendige Strategy Definition (JSON)", [
      el("p", { class: "q-note", text:
        "Genau dieses Objekt akzeptiert POST /v1/backtests. Natuerliche Sprache wird dort nie entgegengenommen." }),
      el("pre", { class: "q-code", text: JSON.stringify(def, null, 2) })
    ]));

    root.appendChild(el("div", { style: "margin-top:26px" }, [
      C.askBar("Frage zu dieser Strategie …", record.strategy.strategyId)
    ]));
  }

  function backtestLauncher(record, version, data) {
    var wrap = el("div", { class: "q-card" });
    var meta = data.meta;
    var startInput = el("input", { class: "q-input", type: "date", value: "2011-01-03",
      min: window.VUMethodology.backtest().limits.maxHistoryStart, max: meta.asOf });
    var endInput = el("input", { class: "q-input", type: "date", value: meta.asOf,
      min: window.VUMethodology.backtest().limits.maxHistoryStart, max: meta.asOf });
    var status = el("div", { style: "margin-top:14px" });
    var button;

    function run() {
      button.disabled = true;
      var progress = el("div", { class: "q-state", "aria-live": "polite" }, [
        el("b", { text: "Backtest laeuft" }),
        el("span", { id: "bt-progress", text: "Modelluniversum wird erzeugt …" })
      ]);
      S.mount(status, progress);

      Api.runBacktest({
        definition: version.definition,
        strategyId: record.strategy.strategyId,
        strategyVersion: version.version,
        strategyName: record.strategy.name,
        startDate: startInput.value,
        endDate: endInput.value,
        trustContext: { userOptimized: record.strategy.origin !== "library" }
      }, function (fraction, label) {
        var node = S.$("#bt-progress");
        if (node) node.textContent = Math.round(fraction * 100) + " % · " + label;
      }).then(function (res) {
        button.disabled = false;
        if (!res.ok) {
          S.mount(status, S.stateBox("Backtest nicht ausgefuehrt", res.errors.join(" · "), "error"));
          return;
        }
        location.href = S.BASE + "backtests/?id=" + encodeURIComponent(res.backtestId);
      });
    }

    button = el("button", { class: "q-btn", type: "button", text: "Backtest starten", onclick: run });

    S.mount(wrap, [
      el("div", { class: "q-grid q-grid--3" }, [
        el("div", { class: "q-field" }, [el("label", { text: "Start" }), startInput]),
        el("div", { class: "q-field" }, [el("label", { text: "Ende" }), endInput]),
        el("div", { class: "q-field" }, [el("label", { text: " " }), button])
      ]),
      el("p", { class: "q-note", style: "margin-top:10px", text:
        "Datenbestand ab " + S.formatDate(window.VUMethodology.backtest().limits.maxHistoryStart) +
        ". Ein frueheres Startdatum wird abgelehnt statt stillschweigend verschoben." }),
      status
    ]);
    return wrap;
  }

  function lineageView(record, activeVersion) {
    var tree = Strategy.lineage(record);
    var list = el("div", { class: "q-rows" });

    function walk(node, depth) {
      var version = Strategy.getVersion(record, node.version);
      list.appendChild(el("a", {
        class: "q-row",
        href: S.BASE + "strategies/?id=" + encodeURIComponent(record.strategy.strategyId) + "&version=" + node.version,
        style: "padding-left:" + (6 + depth * 22) + "px"
      }, [
        el("span", { class: "q-row-rank", text: "V" + node.version }),
        el("span", { class: "q-row-main" }, [
          el("b", { text: node.changeReason }),
          el("span", { text: S.formatDate(node.createdAt) + " · " + node.definitionHash })
        ]),
        el("span", {}),
        el("span", { class: "q-chip" + (node.version === activeVersion.version ? " tone-strong" : ""),
                     text: node.version === activeVersion.version ? "angezeigt" : "ansehen" })
      ]));
      node.children.forEach(function (child) { walk(child, depth + 1); });
    }
    tree.forEach(function (node) { walk(node, 0); });

    return el("div", {}, [
      list,
      el("div", { class: "q-btn-row", style: "margin-top:14px" }, [
        el("a", {
          class: "q-btn q-btn--ghost q-btn--sm",
          href: S.BASE + "strategies/builder/?from=" + encodeURIComponent(record.strategy.strategyId) +
                "&version=" + activeVersion.version,
          text: "Neue Version im Strategy Lab ableiten"
        })
      ])
    ]);
  }
})();
