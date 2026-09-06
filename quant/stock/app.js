/* Vision Universe Quant — Stock Quant Detail
   (/quant/stock/?ticker=VU0001 → kanonisch /stocks/{ticker}/quant).

   Progressive Disclosure (§65) in einer Seite:
     1 Rating-Band   2 Scores   3 Factor DNA   4 Rohkennzahlen   5 Methodik + Provenance */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, Charts = window.QuantCharts, el = S.el;

  S.page({
    nav: S.BASE,
    need: ["securities", "scoreHistory", "events"],
    render: function (data, root) {
      var ticker = (S.param("ticker") || "").toUpperCase();
      var row = data.securities.rows.filter(function (r) { return r.ticker === ticker; })[0];

      if (!row) {
        root.appendChild(S.stateBox("Wertpapier nicht gefunden",
          ticker ? "Im Modelluniversum existiert kein Titel mit dem Ticker " + ticker + "." :
                   "Es wurde kein Ticker uebergeben.", "empty"));
        root.appendChild(el("p", { style: "margin-top:16px" }, [
          el("a", { class: "q-btn q-btn--ghost q-btn--sm", href: S.BASE + "ranking/", text: "Zum Ranking" })
        ]));
        return;
      }

      return S.loadFactorDna(ticker).then(function (shard) {
        var dna = shard.securities[row.securityId];
        dna.asOf = shard.asOf;
        dna.methodologyVersion = shard.methodologyVersion;

        root.appendChild(header(row, dna, data));
        root.appendChild(dnaSection(row, dna));
        root.appendChild(historySection(row, data));
        root.appendChild(peerSection(row, data));
        root.appendChild(eventsSection(row, data));
        root.appendChild(rawMetricsSection(row));
        root.appendChild(el("div", { style: "margin-top:32px" }, [
          C.disclosure("Score-Erklaerung: wie sich der Score zusammensetzt", [
            el("p", { class: "q-note", text:
              "Die Faktorbeitraege summieren sich exakt zum Composite. Der VU Quant Score ist anschliessend " +
              "der Perzentilrang dieses Composite im Modelluniversum." }),
            C.contributionTable(dna)
          ]),
          C.methodologyPanel(dna, data.meta),
          C.provenancePanel(dna, data.meta)
        ]));
      });
    }
  });

  function header(row, dna, data) {
    var fixture = row.fixtureId
      ? el("p", { class: "q-note", style: "margin-top:8px", text:
          "Test-Fixture " + row.fixtureId + ": " +
          (data.meta.fixtures.filter(function (f) { return f.fixtureId === row.fixtureId; })[0] || {}).purpose })
      : null;

    return el("header", {}, [
      el("p", { class: "q-kicker", text: row.sector + " · " + row.industry + (row.status !== "active" ? " · " + statusLabel(row.status) : "") }),
      el("h1", { class: "q-h1", style: "margin-bottom:4px", text: row.ticker }),
      el("p", { class: "q-lead", style: "margin-bottom:20px", text: row.name }),
      fixture,
      el("div", { style: "display:flex;gap:26px;align-items:center;flex-wrap:wrap;margin-top:14px" }, [
        C.scoreOrb(dna.score),
        el("div", { style: "min-width:230px;flex:1" }, [
          el("p", { class: "q-kicker", style: "margin-bottom:6px", text: "Einordnung" }),
          el("p", { class: "q-h2", style: "margin-bottom:10px", text: S.bandLabel(dna.score) }),
          el("p", { class: "q-note", text:
            dna.status === "scored"
              ? "Composite " + S.num(dna.compositeScore, 1) + " · Perzentilrang " + S.num(dna.score, 0) +
                " im Universum von " + S.num(data.securities.rows.length, 0) + " Titeln."
              : "Fuer diesen Titel liegt kein vollstaendiger Score vor." })
        ]),
        el("div", { style: "flex:1;min-width:240px" }, [C.coverageBlock(dna)])
      ]),
      el("div", { style: "margin-top:22px" }, [
        C.askBar("Frage zu " + row.ticker + " …", row.ticker)
      ])
    ]);
  }

  function dnaSection(row, dna) {
    return C.section("Factor DNA",
      "Klick auf einen Faktor zeigt seine Komponenten mit Perzentil und Rohwert.",
      el("div", { class: "q-card" }, [C.factorDna(dna, { idSuffix: row.ticker })]));
  }

  function historySection(row, data) {
    var points = window.VURadar.seriesFor(data.scoreHistory, row.securityId);
    if (!points || points.length < 2) {
      return C.section("Score-Historie", null,
        S.stateBox("Noch keine Historie", "Fuer diesen Titel liegen weniger als zwei Score-Snapshots vor.", "empty"));
    }
    var dates = points.map(function (p) { return p.date; });
    var velocity = window.VURadar.computeVelocity(data.scoreHistory, row.securityId, window.VUMethodology.quant());

    var scoreChart = Charts.lineChart({
      dates: dates, height: 220, title: "VU Quant Score im Zeitverlauf",
      yDomain: [0, 100], yFormat: function (v) { return String(Math.round(v)); },
      series: [{ values: points.map(function (p) { return p.score; }), className: "line-primary" }]
    });

    var factorChart = Charts.lineChart({
      dates: dates, height: 200, title: "Faktorverlauf", yDomain: [0, 100],
      yFormat: function (v) { return String(Math.round(v)); },
      series: [
        { values: points.map(function (p) { return p.quality; }), className: "line-primary" },
        { values: points.map(function (p) { return p.momentum; }), className: "line-benchmark" }
      ]
    });

    return C.section("Score-Historie und Score Momentum",
      "Wochentliche Snapshots, jeweils mit dem zum Stichtag verfuegbaren Datenstand berechnet.",
      el("div", {}, [
        el("div", { class: "q-metrics", style: "margin-bottom:16px" }, [
          C.metricTile("Velocity 30 Tage", S.signed(velocity.scoreVelocity30d, 1)),
          C.metricTile("Velocity 60 Tage", S.signed(velocity.scoreVelocity60d, 1)),
          C.metricTile("Beschleunigung", S.signed(velocity.scoreAcceleration, 1)),
          C.metricTile("Snapshots", S.num(velocity.historyPoints, 0))
        ]),
        el("div", { class: "q-chart-wrap" }, [scoreChart]),
        el("p", { class: "q-note", style: "margin:6px 0 18px", text: "VU Quant Score (0–100)" }),
        el("div", { class: "q-chart-wrap" }, [factorChart]),
        el("div", { class: "q-legend" }, [
          el("span", { text: "Quality" }),
          el("span", { class: "lg-benchmark", text: "Momentum" })
        ])
      ]));
  }

  function peerSection(row, data) {
    var peers = data.securities.rows.filter(function (r) {
      return r.industry === row.industry && r.status === "active" && Number.isFinite(r.quantScore);
    }).sort(function (a, b) { return b.quantScore - a.quantScore; });
    var rank = peers.findIndex(function (r) { return r.securityId === row.securityId; }) + 1;

    var sectorPeers = data.securities.rows.filter(function (r) {
      return r.sector === row.sector && r.status === "active" && Number.isFinite(r.quantScore);
    }).sort(function (a, b) { return b.quantScore - a.quantScore; });
    var sectorRank = sectorPeers.findIndex(function (r) { return r.securityId === row.securityId; }) + 1;

    return C.section("Peer-Rang",
      "Vergleichsgruppen der Normalisierung: 70 % Industrie beziehungsweise Sektor, 30 % Gesamtuniversum.",
      el("div", {}, [
        el("div", { class: "q-metrics", style: "margin-bottom:16px" }, [
          C.metricTile("Industrie", rank ? "#" + rank + " von " + peers.length : null, row.industry),
          C.metricTile("Sektor", sectorRank ? "#" + sectorRank + " von " + sectorPeers.length : null, row.sector),
          C.metricTile("Universum", Number.isFinite(row.quantScore) ? S.num(row.quantScore, 0) + ". Perzentil" : null)
        ]),
        C.stockList(peers.slice(0, 6), { ranked: true })
      ]));
  }

  function eventsSection(row, data) {
    var events = data.events.events.filter(function (e) { return e.securityId === row.securityId; });
    return C.section("Quant Radar Events",
      "Erkannte Veraenderungen der letzten 30 Tage.",
      events.length
        ? el("div", { class: "q-rows" }, events.map(function (e) {
            return el("div", { class: "q-row", style: "cursor:default" }, [
              el("span", { class: "q-row-rank" }),
              el("span", { class: "q-row-main" }, [
                el("b", { text: e.headline }),
                el("span", { text: C.eventLabel(e.eventType) })
              ]),
              el("span", {}),
              el("span", { class: "q-chip", text: S.formatDate(e.occurredAt) })
            ]);
          }))
        : S.stateBox("Keine Ereignisse", "Fuer diesen Titel wurde in den letzten 30 Tagen keine Veraenderung oberhalb der Radar-Schwellen erkannt.", "empty"));
  }

  var RAW_GROUPS = [
    { label: "Markt", fields: ["price", "marketCap", "avgDollarVolume"] },
    { label: "Quality", fields: ["roic", "grossProfitability", "fcfMargin", "operatingMargin", "balanceSheetQuality", "leverage"] },
    { label: "Momentum", fields: ["momentum3m", "momentum6m", "momentum12m", "momentum12m1m", "relativeStrength", "distanceTo52wHigh", "priceTo50dma", "priceTo200dma"] },
    { label: "Value", fields: ["earningsYield", "fcfYield", "evToEbitda", "evToSales", "priceToFcf"] },
    { label: "Growth", fields: ["revenueGrowth", "epsGrowth", "fcfGrowth", "marginExpansion"] },
    { label: "Risk", fields: ["volatility", "downsideVolatility", "maxDrawdown", "beta"] },
    { label: "Fundamentaldaten und Ausschuettung", fields: ["revenue", "freeCashFlow", "netIncome", "dividendYield", "consecutiveDividendGrowthYears"] }
  ];

  function rawMetricsSection(row) {
    var blocks = RAW_GROUPS.map(function (group) {
      return el("div", { style: "margin-bottom:18px" }, [
        el("p", { class: "q-kicker", style: "margin-bottom:8px", text: group.label }),
        el("div", { class: "q-metrics" }, group.fields.map(function (id) {
          var field = window.VUCatalog.field(id);
          var value = row[id];
          return C.metricTile(field.label,
            Number.isFinite(value) ? S.fmt(id, value) : null,
            Number.isFinite(row.percentiles && row.percentiles[id]) ? S.num(row.percentiles[id], 0) + ". Perzentil" : null);
        }))
      ]);
    });
    return C.section("Rohkennzahlen",
      "Die Werte, aus denen die Perzentile entstehen. Fehlende Werte werden als fehlend ausgewiesen und nicht ersetzt.",
      el("div", {}, blocks));
  }

  function statusLabel(status) {
    return { active: "aktiv", delisted: "delistet", acquired: "uebernommen", suspended: "ausgesetzt" }[status] || status;
  }
})();
