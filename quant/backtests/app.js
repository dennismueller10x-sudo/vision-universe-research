/* Vision Universe Quant — Backtest-Ergebnis
   (/quant/backtests/?id=... → kanonisch /backtests/{id}).

   Keine Renditezahl ohne Methodik (§43). Die Seite zeigt deshalb neben
   Performance und Risiko immer auch: Annahmen, Datenintegritaet,
   Reproduktionshash, Robustheit, Trust Score und die Grenzen des Tests.

   Und den wichtigsten Teil (§47): WHAT THE STRATEGY OWNS TODAY —
   dieselbe Definition auf den aktuellen Datenstand angewendet. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, Charts = window.QuantCharts, el = S.el;
  var Api = window.QuantApi, Strategy = window.VUStrategy, Query = window.VUQuery;

  S.page({
    nav: S.BASE + "backtests/",
    need: [],
    render: function (data, root) {
      var id = S.param("id");
      return Api.listBacktests().then(function (all) {
        if (!id) return renderIndex(root, all, data);
        var run = all.filter(function (b) { return b.backtestId === id; })[0];
        if (!run) {
          root.appendChild(S.stateBox("Backtest nicht gefunden",
            "Backtests werden lokal in diesem Browser gespeichert. Der Lauf " + id +
            " liegt hier nicht vor — moeglicherweise wurde er in einem anderen Browser oder Profil erzeugt.", "empty"));
          return renderIndex(root, all, data, true);
        }
        renderResult(root, run, data);
      });
    }
  });

  /* -------------------------------------------------------------- Uebersicht */
  function renderIndex(root, all, data, asAppendix) {
    if (!asAppendix) {
      root.appendChild(el("header", {}, [
        el("p", { class: "q-kicker", text: "Backtests" }),
        el("h1", { class: "q-h1", text: "Evidenz statt Equity Curve." }),
        el("p", { class: "q-lead", text:
          "Jeder Lauf traegt seine Annahmen, seinen Reproduktionshash und einen Trust Score, der die " +
          "methodische Guete bewertet — nicht die Rendite." })
      ]));
    }

    if (!all.length) {
      root.appendChild(el("div", { style: "margin-top:24px" }, [
        S.stateBox("Noch kein Backtest",
          "Starte einen Lauf aus der Strategie-Bibliothek oder dem Strategy Lab. " +
          "Ergebnisse werden lokal in diesem Browser gespeichert.", "empty"),
        el("div", { class: "q-btn-row", style: "margin-top:16px" }, [
          el("a", { class: "q-btn", href: S.BASE + "strategies/", text: "Zur Strategie-Bibliothek" }),
          el("a", { class: "q-btn q-btn--ghost", href: S.BASE + "strategies/builder/", text: "Strategy Lab" })
        ])
      ]));
      return;
    }

    root.appendChild(C.section("Gespeicherte Laeufe", "Die letzten Backtests dieses Browsers.",
      el("div", { class: "q-rows" }, all.map(function (b) {
        return el("a", { class: "q-row", href: S.BASE + "backtests/?id=" + encodeURIComponent(b.backtestId) }, [
          el("span", { class: "q-row-rank", text: b.trustScore ? String(Math.round(b.trustScore.score)) : "" }),
          el("span", { class: "q-row-main" }, [
            el("b", { text: (b.strategyName || b.strategyId || "Unbenannte Strategie") +
                            (b.strategyVersion ? " · V" + b.strategyVersion : "") }),
            el("span", { text: S.formatDate(b.startDate) + " – " + S.formatDate(b.endDate) +
                               " · " + b.rebalanceCount + " Rebalancings · " + b.reproductionHash })
          ]),
          el("span", {}),
          el("span", { class: "q-row-score", text: Number.isFinite(b.metrics.cagr) ? S.num(b.metrics.cagr, 1) + " %" : "–" })
        ]);
      }))));
  }

  /* ----------------------------------------------------------------- Ergebnis */
  function renderResult(root, run, data) {
    var m = run.metrics;

    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker" }, [
        el("a", { href: S.BASE + "backtests/", text: "Backtests", style: "text-decoration:none" }),
        document.createTextNode(" · " + S.formatDate(run.startDate) + " – " + S.formatDate(run.endDate))
      ]),
      el("h1", { class: "q-h1", text: run.strategyName || "Backtest" }),
      el("p", { class: "q-lead", text:
        "Point-in-Time-Test ueber " + S.num(m.years, 1) + " Jahre mit " + run.rebalanceCount +
        " Rebalancing-Terminen. Alle Zahlen beruhen auf synthetischen Daten und sind kein Beleg fuer " +
        "reale historische Wertentwicklung." })
    ]));

    root.appendChild(headlineMetrics(m));
    root.appendChild(equitySection(run));
    root.appendChild(drawdownSection(run));
    root.appendChild(riskSection(m));
    root.appendChild(annualSection(m));
    root.appendChild(trustSection(run));
    root.appendChild(robustnessSection(run));
    root.appendChild(currentHoldingsSection(run));
    root.appendChild(portfolioHistorySection(run));
    root.appendChild(tradesSection(run));
    root.appendChild(methodologySection(run));

    root.appendChild(el("div", { style: "margin-top:26px" }, [
      C.askBar("Frage zu diesem Backtest …", run.backtestId)
    ]));
  }

  function headlineMetrics(m) {
    var bm = m.benchmark || {};
    return el("div", { style: "margin-top:22px" }, [
      C.metricGrid([
        { label: "CAGR", value: fmtPct(m.cagr), hint: "Benchmark " + fmtPct(bm.cagr) },
        { label: "Gesamtrendite", value: fmtPct(m.totalReturn), hint: "Benchmark " + fmtPct(bm.totalReturn) },
        { label: "Max. Drawdown", value: fmtPct(m.maxDrawdown), hint: "Benchmark " + fmtPct(bm.maxDrawdown) },
        { label: "Sharpe", value: S.num(m.sharpe, 2), hint: "Sortino " + S.num(m.sortino, 2) }
      ])
    ]);
  }

  function equitySection(run) {
    var eq = run.equity;
    var series = [{ values: eq.values, className: "line-primary" }];
    if (eq.benchmark) series.push({ values: eq.benchmark, className: "line-benchmark" });

    return C.section("Wertentwicklung",
      "Startkapital 100.000. Total-Return-Basis, Transaktionskosten und Slippage sind abgezogen.",
      el("div", {}, [
        el("div", { class: "q-chart-wrap" }, [
          Charts.lineChart({
            dates: eq.dates, series: series, height: 280,
            title: "Wertentwicklung gegen Benchmark",
            yFormat: function (v) { return Math.round(v / 1000) + "k"; }
          })
        ]),
        el("div", { class: "q-legend" }, [
          el("span", { text: "Strategie" }),
          eq.benchmark ? el("span", { class: "lg-benchmark", text: run.benchmarkLabel || "Benchmark" }) : null
        ])
      ]));
  }

  function drawdownSection(run) {
    if (!run.equity.drawdown) return el("div", {});
    return C.section("Drawdown",
      "Keine Renditezahl ohne ihren Verlustpfad. Der tiefste Rueckgang zeigt, was zwischenzeitlich auszuhalten war.",
      el("div", {}, [
        el("div", { class: "q-chart-wrap" }, [
          Charts.drawdownChart({ values: run.equity.drawdown, dates: run.equity.dates, height: 170 })
        ]),
        el("p", { class: "q-note", style: "margin-top:8px", text:
          "Maximaler Drawdown " + fmtPct(run.metrics.maxDrawdown) +
          (Number.isFinite(run.metrics.recoveryDays)
            ? " · Erholung nach " + S.num(run.metrics.recoveryDays, 0) + " Handelstagen"
            : " · bis zum Ende des Testzeitraums nicht vollstaendig aufgeholt") })
      ]));
  }

  function riskSection(m) {
    return C.section("Risiko und Umsetzung", null, C.metricGrid([
      { label: "Volatilitaet", value: fmtPct(m.volatility), hint: "annualisiert" },
      { label: "Calmar", value: S.num(m.calmar, 2), hint: "CAGR je Einheit Drawdown" },
      { label: "Bestes Jahr", value: m.bestYear ? fmtPct(m.bestYear.value) : "–", hint: m.bestYear ? m.bestYear.year : null },
      { label: "Schlechtestes Jahr", value: m.worstYear ? fmtPct(m.worstYear.value) : "–", hint: m.worstYear ? m.worstYear.year : null },
      { label: "Turnover", value: fmtPct(m.turnover), hint: "einseitig pro Jahr" },
      { label: "Transaktionskosten", value: Number.isFinite(m.totalCosts) ? "$" + S.num(m.totalCosts, 0) : "–", hint: m.tradeCount + " Trades" },
      { label: "Trefferquote", value: fmtPct(m.hitRate), hint: "Perioden mit positivem Ergebnis" },
      { label: "Positionen", value: S.num(m.averageHoldings, 1), hint: "im Durchschnitt" }
    ]));
  }

  function annualSection(m) {
    var years = Object.keys(m.annualReturns || {}).sort();
    if (!years.length) return el("div", {});
    var items = years.map(function (y) { return { label: y.slice(2), value: m.annualReturns[y] }; });
    return C.section("Jahresrenditen", "Einzelne Kalenderjahre, inklusive angefangener Randjahre.",
      el("div", {}, [
        el("div", { class: "q-chart-wrap" }, [Charts.barChart({ items: items, height: 200 })]),
        m.benchmark && m.benchmark.annualReturns
          ? el("div", { class: "q-table-wrap", style: "margin-top:14px" }, [
              el("table", { class: "q-table" }, [
                el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: "Jahr" })].concat(
                  years.map(function (y) { return el("th", { scope: "col", text: y }); })))]),
                el("tbody", {}, [
                  el("tr", {}, [el("td", { text: "Strategie" })].concat(years.map(function (y) {
                    return el("td", { text: fmtPct(m.annualReturns[y]) }); }))),
                  el("tr", {}, [el("td", { text: "Benchmark" })].concat(years.map(function (y) {
                    return el("td", { text: fmtPct(m.benchmark.annualReturns[y]) }); })))
                ])
              ])
            ])
          : null
      ]));
  }

  function trustSection(run) {
    var ts = run.trustScore;
    if (!ts) return el("div", {});
    var blocks = Object.keys(ts.blocks).map(function (key) {
      var block = ts.blocks[key];
      return el("div", { style: "margin-bottom:18px" }, [
        el("p", { class: "q-kicker", style: "margin-bottom:8px",
                  text: block.label + " · " + S.num(block.points, 1) + " / " + block.maxPoints }),
        el("div", { class: "q-trust-checks" }, block.checks.map(function (check) {
          return el("div", { class: "q-trust-check " + check.status, title: check.note || "" }, [
            el("i", { text: check.status === "pass" ? "✓" : check.status === "partial" ? "△" : "✗" }),
            el("span", {}, [
              el("span", { text: check.label }),
              check.note ? el("small", { style: "display:block;white-space:normal;margin-top:2px", text: check.note }) : null
            ]),
            el("small", { text: S.num(check.points, 1) + "/" + check.maxPoints })
          ]);
        }))
      ]);
    });

    return C.section("Backtest Trust Score",
      "Bewertet die methodische Guete dieses Tests, nicht seine Rendite.",
      el("div", { class: "q-card" }, [
        el("div", { class: "q-trust" }, [
          el("div", {}, [
            C.scoreOrb(ts.score, { label: "Trust" }),
            el("p", { class: "q-note", style: "margin-top:10px;max-width:170px", text: ts.label })
          ]),
          el("div", {}, blocks)
        ]),
        ts.appliedCaps.length
          ? el("div", { class: "q-trust-caps" }, [
              el("b", { text: "Harte Obergrenze aktiv" }),
              el("ul", { style: "margin:6px 0 0;padding-left:18px" }, ts.appliedCaps.map(function (cap) {
                return el("li", { text: cap.label + " → hoechstens " + cap.maxScore + " Punkte" });
              }))
            ])
          : null,
        C.disclosure("Was dieser Test nicht zeigt", [
          el("ul", { style: "margin:0;padding-left:18px;line-height:1.7" }, ts.limitations.map(function (l) {
            return el("li", {}, [el("b", { text: l.label + ": " }), document.createTextNode(l.note)]);
          }))
        ], true)
      ]));
  }

  function robustnessSection(run) {
    if (!run.subperiods || !run.subperiods.length) return el("div", {});
    return C.section("Robustheit — Teilperioden",
      "Ein Ergebnis, das nur in einem Abschnitt entsteht, ist kein robustes Ergebnis.",
      el("div", { class: "q-table-wrap" }, [
        el("table", { class: "q-table" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { scope: "col", text: "Abschnitt" }), el("th", { scope: "col", text: "Gesamtrendite" }),
            el("th", { scope: "col", text: "CAGR" }), el("th", { scope: "col", text: "Max. Drawdown" })
          ])]),
          el("tbody", {}, run.subperiods.map(function (p) {
            return el("tr", {}, [
              el("td", { text: S.formatDate(p.from) + " – " + S.formatDate(p.to) }),
              el("td", { text: fmtPct(p.totalReturn) }),
              el("td", { text: fmtPct(p.cagr) }),
              el("td", { text: fmtPct(p.maxDrawdown) })
            ]);
          }))
        ])
      ]));
  }

  function currentHoldingsSection(run) {
    var ch = run.currentHoldings;
    if (!ch) return el("div", {});
    return C.section("Was die Strategie heute halten wuerde",
      ch.statement + " Der Datenstand ist " + S.formatDate(ch.asOf) + "; " + ch.screenedCount +
      " von " + ch.universeSize + " Titeln erfuellen die Filter, " + ch.eligibleCount + " sind rankbar.",
      el("div", {}, [
        el("div", { class: "q-table-wrap" }, [
          el("table", { class: "q-table" }, [
            el("thead", {}, [el("tr", {}, [
              el("th", { scope: "col", text: "#" }), el("th", { scope: "col", text: "Ticker" }),
              el("th", { scope: "col", text: "Sektor" }), el("th", { scope: "col", text: "Gewicht" }),
              el("th", { scope: "col", text: "Rank" }), el("th", { scope: "col", text: "Quant" }),
              el("th", { scope: "col", text: "Quality" }), el("th", { scope: "col", text: "Momentum" }),
              el("th", { scope: "col", text: "Value" }), el("th", { scope: "col", text: "Growth" })
            ])]),
            el("tbody", {}, ch.holdings.map(function (h) {
              return el("tr", {}, [
                el("td", { text: String(h.rank) }),
                el("td", {}, [el("a", { href: S.BASE + "stock/?ticker=" + h.ticker, text: h.ticker, title: h.name })]),
                el("td", { style: "text-align:left", text: h.sector }),
                el("td", { text: S.num(h.weight * 100, 1) + " %" }),
                el("td", { text: S.num(h.rankScore, 0) }),
                el("td", { text: S.num(h.quantScore, 0) }),
                el("td", { text: S.num(h.qualityScore, 0) }),
                el("td", { text: S.num(h.momentumScore, 0) }),
                el("td", { text: S.num(h.valueScore, 0) }),
                el("td", { text: S.num(h.growthScore, 0) })
              ]);
            }))
          ])
        ]),
        el("p", { class: "q-note", style: "margin-top:12px", text:
          "Diese Liste ist das Ergebnis der Strategieregeln auf dem aktuellen Datenstand. Sie ist keine " +
          "Kaufempfehlung und beruecksichtigt weder persoenliche Umstaende noch Anlageziele." })
      ]));
  }

  function portfolioHistorySection(run) {
    if (!run.rebalances || !run.rebalances.length) return el("div", {});
    var recent = run.rebalances.slice().reverse();
    return C.section("Portfolio-Historie",
      "Die letzten " + recent.length + " von " + run.rebalanceCount + " Rebalancing-Terminen.",
      C.disclosure("Rebalancing-Termine anzeigen", [
        el("div", { class: "q-table-wrap" }, [
          el("table", { class: "q-table" }, [
            el("thead", {}, [el("tr", {}, [
              el("th", { scope: "col", text: "Entscheidung" }), el("th", { scope: "col", text: "Ausfuehrung" }),
              el("th", { scope: "col", text: "Universum" }), el("th", { scope: "col", text: "Gefiltert" }),
              el("th", { scope: "col", text: "Positionen" }), el("th", { scope: "col", text: "Turnover" }),
              el("th", { scope: "col", text: "Kosten" }), el("th", { scope: "col", text: "Top-Positionen" })
            ])]),
            el("tbody", {}, recent.map(function (r) {
              return el("tr", {}, [
                el("td", { text: S.formatDate(r.decisionDate) }),
                el("td", { text: S.formatDate(r.executionDate) }),
                el("td", { text: S.num(r.universeSize, 0) }),
                el("td", { text: S.num(r.screenedCount, 0) }),
                el("td", { text: S.num(r.selected, 0) }),
                el("td", { text: S.num(r.turnover, 1) + " %" }),
                el("td", { text: "$" + S.num(r.costs, 0) }),
                el("td", { style: "text-align:left", text: r.holdings.slice(0, 5).map(function (h) { return h.ticker; }).join(", ") })
              ]);
            }))
          ])
        ])
      ]));
  }

  function tradesSection(run) {
    if (!run.trades || !run.trades.length) return el("div", {});
    var recent = run.trades.slice().reverse();
    return C.section("Trades",
      "Die letzten " + recent.length + " von " + run.tradeCount + " Ausfuehrungen, jeweils mit Kosten.",
      C.disclosure("Trades anzeigen", [
        el("div", { class: "q-table-wrap" }, [
          el("table", { class: "q-table" }, [
            el("thead", {}, [el("tr", {}, [
              el("th", { scope: "col", text: "Datum" }), el("th", { scope: "col", text: "Ticker" }),
              el("th", { scope: "col", text: "Seite" }), el("th", { scope: "col", text: "Stueck" }),
              el("th", { scope: "col", text: "Kurs" }), el("th", { scope: "col", text: "Volumen" }),
              el("th", { scope: "col", text: "Kosten" }), el("th", { scope: "col", text: "Grund" })
            ])]),
            el("tbody", {}, recent.slice(0, 120).map(function (t) {
              return el("tr", {}, [
                el("td", { text: S.formatDate(t.date) }),
                el("td", {}, [el("a", { href: S.BASE + "stock/?ticker=" + t.ticker, text: t.ticker })]),
                el("td", { text: { open: "Aufbau", close: "Schliessung", adjust: "Anpassung" }[t.side] || t.side }),
                el("td", { text: S.num(t.shares, 2) }),
                el("td", { text: "$" + S.num(t.price, 2) }),
                el("td", { text: "$" + S.num(t.grossValue, 0) }),
                el("td", { text: "$" + S.num(t.costs, 2) }),
                el("td", { style: "text-align:left", text: { rebalance: "Rebalancing", exit: "Ausstieg", delisting: "Delisting" }[t.reason] || t.reason })
              ]);
            }))
          ])
        ])
      ]));
  }

  function methodologySection(run) {
    var described = Strategy.describe(run.definition);
    var caps = run.capabilities || {};
    return el("div", { style: "margin-top:34px" }, [
      C.disclosure("Methodik dieses Laufs", [
        el("dl", { class: "q-kv" }, [
          el("dt", { text: "Zeitraum" }), el("dd", { text: S.formatDate(run.startDate) + " – " + S.formatDate(run.endDate) }),
          el("dt", { text: "Universum" }), el("dd", { text: described.universe }),
          el("dt", { text: "Benchmark" }), el("dd", { text: run.benchmarkLabel || "–" }),
          el("dt", { text: "Rebalancing" }), el("dd", { text: described.rebalance + ", " + run.rebalanceCount + " Termine" }),
          el("dt", { text: "Ausfuehrung" }), el("dd", { text: described.execution }),
          el("dt", { text: "Liquiditaetsgrenze" }), el("dd", { text: "$" + S.num(run.executionAssumptions.minDollarVolumeM, 0) + " Mio./Tag, Market Cap ≥ $" + S.num(run.executionAssumptions.minMarketCapM, 0) + " Mio." }),
          el("dt", { text: "Point-in-Time" }), el("dd", { text: caps.pointInTimeFundamentals ? "ja — availableAt ≤ Entscheidungszeitpunkt" : "nein" }),
          el("dt", { text: "Delistete Titel" }), el("dd", { text: caps.delistedSecurities ? "im historischen Universum enthalten" : "nicht enthalten" }),
          el("dt", { text: "Datenquelle" }), el("dd", { text: "Synthetischer Mock-Datensatz, Snapshot " + run.dataSnapshotId }),
          el("dt", { text: "Engine-Version" }), el("dd", { text: run.engineVersion }),
          el("dt", { text: "Backtest-Methodik" }), el("dd", { text: run.methodologyVersion }),
          el("dt", { text: "Quant-Methodik" }), el("dd", { text: run.quantMethodologyVersion }),
          el("dt", { text: "Strategie-Hash" }), el("dd", { text: run.reproductionInput.strategyVersionHash })
        ])
      ]),
      C.disclosure("Reproduzierbarkeit", [
        el("p", { class: "q-note", text:
          "Der Reproduktionshash wird aus Strategieversion, Datensnapshot, Engine-Version, Methodikversion, " +
          "Ausfuehrungsannahmen und Zeitraum gebildet — nicht aus dem Ergebnis. Gleiche Eingaben ergeben " +
          "denselben Hash und dasselbe Ergebnis." }),
        el("pre", { class: "q-code", text: run.reproductionHash + "\n\n" + JSON.stringify(run.reproductionInput, null, 2) })
      ]),
      C.disclosure("Strategy Definition (JSON)", [
        el("pre", { class: "q-code", text: JSON.stringify(run.definition, null, 2) })
      ])
    ]);
  }

  function fmtPct(v) { return Number.isFinite(v) ? S.num(v, 1) + " %" : "–"; }
})();
