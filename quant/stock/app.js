/* Vision Universe Quant — Stock Quant Detail
   (/quant/stock/?ticker=VU0001 → kanonisch /stocks/{ticker}/quant).

   Progressive Disclosure (§65) in einer Seite:
     1 Rating-Band   2 Scores   3 Factor DNA   4 Rohkennzahlen   5 Methodik + Provenance */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, Charts = window.QuantCharts, el = S.el;

  /* Golden Universe (Phase 5): fuenf reale Titel mit echten SEC-Fundamentaldaten
     ausserhalb des synthetischen Modelluniversums. Sie tragen deshalb NIE das
     Mock-Banner dieser Seite — dasselbe Prinzip wie beim SEC Data Inspector,
     der aus demselben Grund S.page() gar nicht benutzt. Diese Seite behaelt
     S.page() (banner:false, siehe unten) und entscheidet selbst pro Zweig. */
  var GOLDEN_FIVE_PANEL = S.BASE + "data/sec/quant-factor-inputs.json";

  S.page({
    nav: S.BASE,
    need: ["securities", "scoreHistory", "events"],
    banner: false,
    render: function (data, root) {
      var ticker = (S.param("ticker") || "").toUpperCase();
      var row = data.securities.rows.filter(function (r) { return r.ticker === ticker; })[0];

      if (!row) {
        return S.loadJSON(GOLDEN_FIVE_PANEL, { attempts: 1 }).catch(function () { return null; })
          .then(function (panel) {
            var sec = panel && panel.securities && panel.securities[ticker];
            if (sec && sec.available) return renderGoldenFive(root, ticker, sec);
            return renderNotFound(root, ticker);
          });
      }

      root.appendChild(S.mockBanner(data.meta));
      if (row.quantStatus === "not_listed") return renderDelisted(root, row, data);

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

  function renderNotFound(root, ticker) {
    root.appendChild(S.stateBox("Wertpapier nicht gefunden",
      ticker ? "Im Modelluniversum existiert kein Titel mit dem Ticker " + ticker + "." :
               "Es wurde kein Ticker uebergeben.", "empty"));
    root.appendChild(el("p", { style: "margin-top:16px" }, [
      el("a", { class: "q-btn q-btn--ghost q-btn--sm", href: S.BASE + "ranking/", text: "Zum Ranking" })
    ]));
  }

  var FACTOR_LABEL = { quality: "Quality", growth: "Growth", value: "Value",
    momentum: "Momentum", risk: "Risk", revisions: "Revisions" };
  /* q-chip kennt nur drei Toene (tone-strong/tone-neutral/tone-poor,
     quant.css:225-227) — dieselben, die die Ranking-Tabelle fuer
     Faktor-Chips benutzt. Keine neue CSS-Klasse fuer diese Seite. */
  var COVERAGE_TONE = { REAL: "strong", PARTIAL: "neutral", UNAVAILABLE: "poor" };
  var COVERAGE_TEXT = { REAL: "REAL · SEC", PARTIAL: "TEILWEISE REAL · SEC", UNAVAILABLE: "UNAVAILABLE" };
  var STATUS_TONE = { good: "strong", warn: "neutral", poor: "poor" };

  /* Golden Universe (Phase 5) — ein realer Titel mit echten SEC-Fundamental-
     daten, praekomputiert von scripts/quant/build-sec-quant-panel.mjs
     (providers/sec/adapter.js -> sec-fact-panel.js -> factors.js). Kein VU
     Quant Score: eine Peer-Perzentilierung ueber fuenf Titel aus vier
     Sektoren waere scheinpraezise (siehe Kopf-Kommentar des Build-Skripts).
     Was hier steht, sind reale Faktor-KOMPONENTEN mit Provenance je Feld —
     nie eine erfundene Ersatzzahl fuer das, was fehlt. */
  function renderGoldenFive(root, ticker, sec) {
    var ref = sec.reference || {};
    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker", text: (ref.sector || "SEC EDGAR") + " · Golden Universe · Real Data" }),
      el("h1", { class: "q-h1", style: "margin-bottom:4px", text: ticker }),
      el("p", { class: "q-lead", style: "margin-bottom:6px", text: ref.name || ticker }),
      el("p", { class: "q-note", text:
        "Kein synthetischer Titel des Modelluniversums. Fundamentaldaten sind echte, primaerquellen-" +
        "geprüfte SEC/EDGAR-Daten (" + S.num(ref.factsCount, 0) + " Fakten aus " + S.num(ref.filingsCount, 0) +
        " Filings). Es gibt fuer diesen Titel keinen VU Quant Score — dazu unten mehr." })
    ]));

    root.appendChild(C.section("Datenstatus",
      "Jede Datenklasse einzeln, nicht pauschal fuers ganze Produkt (DO-NOT-BREAK-Regel #4).",
      el("div", { class: "q-metrics" }, [
        statusTile("Fundamentaldaten", "REAL · SEC EDGAR", "good",
          "Periode bis " + S.formatDate(sec.asOfPeriodEnd) + (sec.restatementStatus === "restated" ? " · restated" : "")),
        statusTile("Marktdaten / Chart", "UNAVAILABLE", "poor",
          "Lizenzpruefung fuer Twelve-Data-/Tiingo-Kurse steht aus — keine echten Kurse auf dieser " +
          "oeffentlichen Development Preview (siehe Data-Provenance unten)."),
        statusTile("Technical Intelligence", "UNAVAILABLE", "poor",
          "Braucht dieselbe Kursreihe wie Marktdaten oben — aus demselben Grund noch nicht real fuer " + ticker + "."),
        statusTile("Elliott Wave (Beta)", "UNAVAILABLE", "poor",
          "Baut auf Technical Intelligence auf und teilt dieselbe Voraussetzung.")
      ])));

    root.appendChild(C.section("Factor DNA — reale SEC-Komponenten, kein Score",
      "Jede Komponente einzeln REAL oder UNAVAILABLE mit Begruendung. Kein Perzentilrang: fuenf Titel " +
      "aus vier Sektoren sind keine brauchbare Vergleichsgruppe (normalization.js verlangt mindestens 12 Peers).",
      el("div", {}, Object.keys(FACTOR_LABEL).map(function (factorId) {
        return factorBlock(factorId, sec.coverage[factorId]);
      }))));

    root.appendChild(el("div", { style: "margin-top:32px" }, [
      C.disclosure("Datenherkunft (Provenance)", [
        el("div", { class: "q-metrics" }, [
          S.provenanceTag("Provider", sec.provenance.provider),
          S.provenanceTag("Quelle", sec.provenance.source),
          S.provenanceTag("Snapshot", sec.provenance.dataSnapshotId),
          S.provenanceTag("Verfuegbar ab", S.formatDate(sec.provenance.availableAt)),
          S.provenanceTag("Mock", sec.provenance.isMock ? "ja" : "nein", sec.provenance.isMock ? "warn" : "good")
        ]),
        el("p", { class: "q-note", style: "margin-top:10px", text:
          "SEC/EDGAR ist eine oeffentliche Behoerdenquelle ohne Lizenzblock (kein LEGAL_REVIEW_REQUIRED). " +
          "Marktdaten (Twelve Data/Tiingo) sind technisch vollstaendig implementiert und laufzeitgeprueft, " +
          "aber ihre oeffentliche Anzeige ist ungeklaert und deshalb auf dieser oeffentlichen Preview " +
          "abgeschaltet — nicht dieselbe Quelle, nicht derselbe Rechtsstatus." })
      ])
    ]));
  }

  function statusTile(label, value, tone, hint) {
    return el("div", { class: "q-metric" }, [
      el("span", { text: label }),
      el("b", {}, [el("span", { class: "q-chip tone-" + (STATUS_TONE[tone] || "neutral"), text: value })]),
      hint ? el("em", { text: hint }) : null
    ]);
  }

  function factorBlock(factorId, coverage) {
    if (!coverage) return null;
    return el("div", { class: "q-card", style: "margin-bottom:12px;padding:14px" }, [
      el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px" }, [
        el("b", { text: FACTOR_LABEL[factorId] }),
        el("span", { class: "q-chip tone-" + (COVERAGE_TONE[coverage.status] || "neutral"),
          text: COVERAGE_TEXT[coverage.status] + " · " + coverage.realCount + "/" + coverage.totalCount })
      ]),
      coverage.components.length
        ? el("div", { class: "q-metrics" }, coverage.components.map(function (c) {
            var field = window.VUCatalog.field(c.fieldId);
            var label = field ? field.label : c.fieldId;
            return C.metricTile(label,
              c.real ? S.fmt(c.fieldId, c.value) : null,
              c.real ? null : c.reason);
          }))
        : el("p", { class: "q-note", text:
            "Keine Komponente moeglich: available:false in quant/methodology/quant-v1.json seit Phase 1 " +
            "— es liegen keine lizenzierten Analystenschaetzungen vor." })
    ]);
  }

  /* Ein Titel, der zum Datenstand nicht mehr gelistet ist, hat keinen
     aktuellen Score — und bekommt auch keinen. Was er hat, ist seine
     Geschichte, und die bleibt im Universum erhalten (§39). */
  function renderDelisted(root, row, data) {
    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker", text: row.sector + " · " + row.industry }),
      el("h1", { class: "q-h1", style: "margin-bottom:4px", text: row.ticker }),
      el("p", { class: "q-lead", text: row.name })
    ]));
    root.appendChild(el("div", { style: "margin-top:18px" }, [
      S.unavailable(
        row.status === "acquired" ? "Seit " + S.formatDate(row.lastTradingDate) + " uebernommen"
                                  : "Seit " + S.formatDate(row.lastTradingDate) + " nicht mehr gelistet",
        "Fuer diesen Titel gibt es zum aktuellen Datenstand keinen Kurs und damit keinen VU Quant Score. " +
        "Er bleibt im historischen Universum enthalten und wird in Backtests bis zu seinem letzten Handelstag " +
        "beruecksichtigt — genau das verhindert Survivorship Bias.")
    ]));
    root.appendChild(C.section("Historische Eckdaten", null, C.metricGrid([
      { label: "Erster Handelstag", value: S.formatDate(row.firstTradingDate) },
      { label: "Letzter Handelstag", value: S.formatDate(row.lastTradingDate) },
      { label: "Status", value: statusLabel(row.status) },
      { label: "Sektor", value: row.sector, hint: row.industry }
    ])));
    root.appendChild(el("div", { class: "q-btn-row", style: "margin-top:20px" }, [
      el("a", { class: "q-btn q-btn--ghost", href: S.BASE + "ranking/", text: "Aktuelles Ranking" })
    ]));
  }

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
