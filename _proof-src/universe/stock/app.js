/* Vision Universe — Full Universe, Einzeltitel (/universe/stock/?ticker=ORCL).

   Dieselbe Abfolge wie /quant/stock/: Kopf, Datenstatus, Kursverlauf,
   Faktoren, Rohdaten, Herkunft. Was fehlt, sagt warum es fehlt - in
   normalem Deutsch. Die rohen Diagnosemarken (INSUFFICIENT_HISTORY,
   large_move_matching_split_ratio) stehen im aufklappbaren Teil, nicht
   als Ueberschrift. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, Charts = window.QuantCharts,
      Ranges = window.VUChartRanges, P = window.VUProof, el = S.el;

  var GOLDEN_DAILY = "/quant/data/market/golden-preview/daily/ref_";
  var GOLDEN_CAPS = "/quant/data/market/golden-preview/capabilities/";

  /* Diagnosemarken -> Klartext. Die Marke selbst bleibt erhalten (sie ist
     die pruefbare Angabe), aber sie ist nicht das, was der Eigentuemer
     zuerst lesen soll. */
  var STATUS_TEXT = {
    CALCULATED: null,
    INSUFFICIENT_HISTORY: "zu wenig Historie",
    SOURCE_MISSING: "liefert der Zugang nicht",
    NOT_APPLICABLE: "nicht anwendbar",
    WITHHELD_REDISTRIBUTION: "zurueckgehalten"
  };

  var QUALITY_TEXT = {
    clean: "Kursreihe ohne Auffaelligkeit.",
    large_move: "Mindestens ein sehr grosser Tagessprung in der Reihe. Er kann echt sein - oder eine Luecke in der Bereinigung.",
    large_move_matching_split_ratio: "Ein grosser Tagessprung passt zu einem bekannten Splitverhaeltnis. Ein Hinweis auf eine unvollstaendige Bereinigung, keine Feststellung.",
    dividend_not_in_adjusted: "Eine Dividende ist im bereinigten Kurs nicht wiederzufinden.",
    split_not_adjusted: "Ein Split ist im bereinigten Kurs nicht verrechnet.",
    stale_last_bar: "Der letzte Kurstag liegt weiter zurueck, als der Handelskalender erwarten laesst.",
    implausible_split: "Das gemeldete Splitverhaeltnis passt nicht zur Kursreihe.",
    insufficient_history: "Die Reihe ist zu kurz fuer die Auswertung.",
    insufficient_history_for_factors: "Die Reihe reicht fuer einen Teil der Faktoren nicht aus."
  };

  var ADJUSTMENT_TEXT = {
    TOTAL_RETURN: "Total Return (Splits und Dividenden verrechnet)",
    SPLIT_ONLY: "nur splitbereinigt",
    RAW: "unbereinigt",
    UNKNOWN: "nicht bestimmbar"
  };

  var chartState = {};

  P.page({
    nav: P.BASE + "stock/",
    render: function (meta, index, root) {
      var ticker = (S.param("ticker") || "").toUpperCase();

      root.appendChild(sprungLeiste(index, ticker));

      if (!ticker) {
        root.appendChild(S.stateBox("Kein Titel gewaehlt",
          "Gib oben einen Ticker ein. Jeder der " + S.num(index.count, 0) +
          " ausgelieferten Titel hat eine eigene Seite.", "empty"));
        return;
      }

      if (index.tickers.indexOf(ticker) === -1) {
        root.appendChild(S.stateBox("Nicht im ausgelieferten Universum",
          "Fuer " + ticker + " gibt es in diesem Universum (" + meta.gate + ", " +
          S.num(index.count, 0) + " Titel) keinen Eintrag. Das Universum ist regelbasiert " +
          "gezogen: Primaerboerse, USD, aktiv, ausreichend Historie, kein OTC.", "empty"));
        root.appendChild(el("p", { style: "margin-top:16px" }, [
          el("a", { class: "q-btn q-btn--ghost q-btn--sm", href: P.BASE, text: "Zur Suche" })
        ]));
        return;
      }

      return P.loadRow(ticker).then(function (row) {
        if (!row) {
          root.appendChild(S.stateBox("Zeile nicht gefunden",
            "Der Titel steht im Verzeichnis, sein Datenbuendel fehlt. Das ist ein Baufehler, " +
            "keine Datenluecke - bitte melden.", "error"));
          return;
        }
        return zeichne(root, meta, row);
      });
    }
  });

  function zeichne(root, meta, row) {
    var istGolden = (meta.chart && meta.chart.historical && meta.chart.historical.scope || [])
      .indexOf(row.ticker) !== -1;

    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker", text:
        (row.sector && row.sector !== "UNKNOWN" ? row.sector : "Sektor nicht geliefert") +
        " · " + (row.exchange || "–") + (row.isCanary ? " · Canary" : "") }),
      el("h1", { class: "q-h1", style: "margin-bottom:4px", text: row.ticker }),
      el("p", { class: "q-lead", style: "margin-bottom:6px",
        text: row.name || "Firmenname: im Anbieteruniversum nicht enthalten" }),
      el("p", { class: "q-note", text:
        "Realer Titel aus dem ausgelieferten Universum. Kein synthetischer Modelltitel, kein VU Quant " +
        "Score - was hier steht, ist aus der echten Kursreihe gerechnet." })
    ]));

    var statusHost = el("div", {});
    root.appendChild(C.section("Datenstatus",
      "Jede Datenklasse einzeln, nicht pauschal fuers ganze Produkt.", statusHost));

    var chartHost = el("div", {});
    root.appendChild(chartHost);

    root.appendChild(faktorAbschnitt(row, meta));
    root.appendChild(stammdatenAbschnitt(row));
    if (row.technical) root.appendChild(technicalAbschnitt(row));
    root.appendChild(herkunftAbschnitt(meta, row));

    S.mount(statusHost, el("div", { class: "q-metrics" }, [
      kachel("Stammdaten & Historie", "REAL · TIINGO", "good",
        S.num(row.bars, 0) + " Handelstage, " + S.formatDate(row.historyFrom) + " bis " +
        S.formatDate(row.historyTo)),
      kachel("Faktorzeile (Quantum)",
        row.factorsStatus === "PRESENT" ? "REAL · BERECHNET" : "UNAVAILABLE",
        row.factorsStatus === "PRESENT" ? "good" : "poor",
        row.factorsStatus === "PRESENT"
          ? "Stand " + S.formatDate(row.factors.asOf) + " · Basis " + basisText(row.factors.basis)
          : "Fuer diesen Titel ist keine Faktorzeile ausgeliefert - die Kursreihe hat den " +
            "Qualitaetstest nicht bestanden."),
      kachel("Kursverlauf / Chart", istGolden ? "REAL · TIINGO · EOD" : "UNAVAILABLE",
        istGolden ? "good" : "poor",
        istGolden ? "Freigegebene Kursreihe (Eigentuemerentscheidung, Development Preview)"
                  : "Fuer diesen Titel ist keine Kursreihe ausgeliefert."),
      kachel("Technical Intelligence", row.technical ? "REAL · PRECOMPUTED" : "UNAVAILABLE",
        row.technical ? "good" : "poor",
        row.technical ? "Trend " + (row.trend || "–") : "Braucht dieselbe Kursreihe wie der Chart.")
    ]));

    if (istGolden) {
      return S.loadJSON(GOLDEN_DAILY + row.ticker + ".json", { attempts: 1 })
        .catch(function () { return null; })
        .then(function (market) {
          S.loadJSON(GOLDEN_CAPS + row.ticker + ".json", { attempts: 1 })
            .catch(function () { return null; })
            .then(function (cap) { chartHost.appendChild(chartBelege(meta, cap)); });
          if (!market) { S.mount(chartHost, chartFehlt(meta, row)); return; }
          S.mount(chartHost, chartAbschnitt(row.ticker, market, meta));
        });
    }
    S.mount(chartHost, chartFehlt(meta, row));
  }

  /* ---------------------------------------------------------- Kursverlauf */

  function chartAbschnitt(ticker, market, meta) {
    var wrap = el("div", { style: "margin-top:8px" });
    chartState[ticker] = chartState[ticker] || Ranges.DEFAULT_RANGE;
    zeichneChart(ticker, market, wrap);
    return C.section("Kursverlauf (Tagesschluss)",
      "Echte Tiingo-EOD-Kurse, " + S.num(market.barCount, 0) + " Handelstage von " +
      S.formatDate(market.first) + " bis " + S.formatDate(market.last) + ". Dieselbe " +
      "Zeitraumleiste wie auf /quant/markt/ und /quant/stock/.", wrap);
  }

  function zeichneChart(ticker, market, wrap) {
    var daten = { eod: market.bars || [], intraday: [], adjustmentStatus: market.adjustmentStatus || "RAW" };
    var res = Ranges.selectRange(chartState[ticker], daten, { gates: {} });
    var host = el("div", { class: "q-chart-wrap" });
    if (res.ok) {
      host.appendChild(Charts.candlestickChart({
        bars: res.bars,
        title: ticker + " — " + res.rangeId,
        description: "Tagesschluss, " + res.bars.length + " Kurspunkte, " + res.from + " bis " + res.to + ".",
        yFormat: function (v) { return v.toFixed(2); }
      }));
    } else {
      var box = S.stateBox("Zeitraum nicht verfuegbar", res.message, "empty");
      if (res.suggestion) box.appendChild(el("p", { class: "q-note", text: "Verfuegbar ist zum Beispiel " + res.suggestion + "." }));
      host.appendChild(box);
    }
    S.mount(wrap, [
      zeitraumLeiste(daten, chartState[ticker], function (id) {
        chartState[ticker] = id; zeichneChart(ticker, market, wrap);
      }),
      host
    ]);
  }

  function zeitraumLeiste(daten, aktiv, onSelect) {
    return el("div", { class: "q-rangebar", role: "group", "aria-label": "Zeitraum" },
      Ranges.rangeBar(daten, { gates: {} }).map(function (r) {
        return el("button", {
          type: "button",
          class: "q-range" + (r.id === aktiv ? " is-active" : "") + (r.available ? "" : " is-off"),
          "aria-pressed": r.id === aktiv ? "true" : "false",
          title: r.available ? "Tagesschluss" : r.message,
          text: r.label,
          onclick: function () { onSelect(r.id); }
        });
      }));
  }

  /* Kein Chart - und der Grund dafuer, nicht ein leeres Feld. */
  function chartFehlt(meta, row) {
    var hist = (meta.chart && meta.chart.historical) || {};
    var frei = hist.scope || [];
    var abschnitt = C.section("Kursverlauf",
      "Fuer diesen Titel ist keine Kursreihe ausgeliefert.",
      el("div", {}, [
        S.unavailable("Keine Kursreihe fuer " + row.ticker,
          "Die Faktoren dieses Titels sind aus einer echten Kursreihe gerechnet - die Reihe selbst " +
          "liegt aber in keiner Auslieferung. Der vollstaendige Kursbestand (rund 7,4 GB) blieb in der " +
          "Arbeitsablage des Laufs; ausgeliefert sind nur die daraus abgeleiteten Zustaende. " +
          "Freigegeben und mit Chart sichtbar sind derzeit: " + (frei.join(", ") || "keine") + "."),
        frei.length ? el("div", { class: "q-btn-row", style: "margin-top:14px" }, frei.map(function (t) {
          return el("a", { class: "q-btn q-btn--ghost q-btn--sm", href: P.stockHref(t),
                           text: "Chart-Beispiel: " + t });
        })) : null
      ]));
    var wrap = el("div", {});
    wrap.appendChild(abschnitt);
    wrap.appendChild(chartBelege(meta, null));
    return wrap;
  }

  /* Die drei Chart-Arten getrennt - so, wie sie tatsaechlich stehen. */
  function chartBelege(meta, cap) {
    var chart = meta.chart || {};
    var rt = chart.realtime || {}, intra = chart.intraday || {};
    var zeilen = [
      zeile("Historisch (Tagesschluss)",
        (chart.historical && chart.historical.scope || []).length
          ? "AUSGELIEFERT · " + (chart.historical.scope || []).length + " Titel" : "NICHT AUSGELIEFERT",
        (chart.historical && chart.historical.scope || []).length ? "good" : "poor",
        (chart.historical && chart.historical.note) || ""),
      zeile("Intraday", "NICHT AUSGELIEFERT", "poor", intra.note || ""),
      zeile("Realtime / Live", "NICHT IN DIESER AUSLIEFERUNG", "poor", rt.note || "")
    ];
    var belegText = rt.backendProof
      ? "Backend-Beleg (" + S.formatDateTime(rt.backendProof.generatedAt) + "): LIVE_CHART_READY = " +
        rt.backendProof.LIVE_CHART_READY + " ueber " + (rt.backendProof.wsUrl || "WebSocket") +
        ". Das belegt den Strom im Backend. Es belegt keinen laufenden Chart im Browser, und es wird " +
        "hier nicht als solcher gezaehlt. Kursart laut Anbieter: " +
        (rt.backendProof.priceType || "UNSPECIFIED") + "."
      : null;

    var kinder = [
      el("p", { class: "q-note", style: "margin-bottom:10px", text:
        "Drei getrennte Fragen: gespeicherte Historie, Intraday-Bars, laufender Strom. " +
        "Nichts davon wird simuliert - wo nichts laeuft, steht warum." }),
      el("div", { class: "q-metrics" }, zeilen),
      belegText ? el("p", { class: "q-note", style: "margin-top:10px", text: belegText }) : null
    ];

    if (cap && cap.findings) kinder.push(kapazitaeten(cap));

    return C.disclosure("Chart — Datenlage im Einzelnen", kinder);
  }

  var CAP_LABEL = {
    historicalIntraday: "Intraday-Historie (5-Minuten-Bars)",
    latestQuote: "Kursabfrage — Preisfeld befuellt?",
    realtimeQuote: "Kursabfrage — Zeitstempel aktuell?",
    delayedQuote: "Kursabfrage — verzoegert?",
    extendedHoursBars: "Erweiterte Handelszeiten — Kursverlauf",
    extendedHoursRealtime: "Erweiterte Handelszeiten — aktuell?",
    realtimeStream: "WebSocket-Strom (IEX Realtime)"
  };

  function kapazitaeten(cap) {
    var reihen = Object.keys(CAP_LABEL).map(function (key) {
      var f = (cap.findings || []).filter(function (x) { return x.capability === key; })[0];
      if (!f) return null;
      var detail = (f.evidence && (f.evidence.interpretation || f.evidence.reason)) || "";
      var ton = f.result === "PASSED" ? "strong" : f.result === "ERROR" ? "poor" : "neutral";
      return el("div", { class: "q-metric" }, [
        el("span", { text: CAP_LABEL[key] }),
        el("b", {}, [P.toneChip(f.result, ton)]),
        detail ? el("em", { text: detail }) : null
      ]);
    }).filter(Boolean);
    return el("div", { style: "margin-top:14px" }, [
      el("p", { class: "q-note", style: "margin-bottom:8px", text:
        "Laufzeitmessung gegen den echten Zugang vom " + S.formatDateTime(cap.generatedAt) +
        ". UNKNOWN ist ein Ergebnis, keine Luecke: zum Messzeitpunkt war die Boerse geschlossen." }),
      el("div", { class: "q-metrics" }, reihen)
    ]);
  }

  /* -------------------------------------------------------------- Faktoren */

  var GRUPPEN = [
    { titel: "Trend — Lage zu den gleitenden Durchschnitten", felder: [
      ["priceAboveSMA20", "Ueber SMA20", "bool"], ["distanceToSMA20", "Abstand SMA20", "pct"],
      ["priceAboveSMA50", "Ueber SMA50", "bool"], ["distanceToSMA50", "Abstand SMA50", "pct"],
      ["priceAboveSMA100", "Ueber SMA100", "bool"], ["distanceToSMA100", "Abstand SMA100", "pct"],
      ["priceAboveSMA200", "Ueber SMA200", "bool"], ["distanceToSMA200", "Abstand SMA200", "pct"],
      ["aboveAllSMA", "Ueber allen vier", "bool"], ["aboveSMA20And50And200", "Ueber 20/50/200", "bool"]
    ]},
    { titel: "52-Wochen-Band", felder: [
      ["distanceTo52wHigh", "Abstand zum Hoch", "pct"], ["distanceTo52wLow", "Abstand zum Tief", "pct"],
      ["newHigh52w", "Neues Hoch", "bool"], ["closeAtHigh52w", "Schluss am Hoch", "bool"],
      ["within5PctOf52wHigh", "Naeher als 5 % am Hoch", "bool"]
    ]},
    { titel: "Momentum", felder: [
      ["returns.1M", "Rendite 1 Monat", "pct"], ["returns.3M", "Rendite 3 Monate", "pct"],
      ["returns.6M", "Rendite 6 Monate", "pct"], ["returns.12M", "Rendite 12 Monate", "pct"],
      ["return12M1M", "12 Monate ohne den letzten", "pct"],
      ["momentumAcceleration", "Beschleunigung", "pct"]
    ]},
    { titel: "Relative Staerke gegen den Vergleichsindex", felder: [
      ["relativeStrength.1M", "1 Monat", "pct"], ["relativeStrength.3M", "3 Monate", "pct"],
      ["relativeStrength.6M", "6 Monate", "pct"], ["relativeStrength.12M", "12 Monate", "pct"]
    ]},
    { titel: "Risiko", felder: [
      ["volatility20d", "Volatilitaet 20 Tage", "pct"], ["volatility60d", "Volatilitaet 60 Tage", "pct"],
      ["volatility252d", "Volatilitaet 252 Tage", "pct"], ["maxDrawdown252d", "Groesster Rueckgang 252 Tage", "pct"]
    ]},
    { titel: "Volumen", felder: [
      ["avgVolume20d", "Durchschnitt 20 Tage", "count"], ["avgVolume60d", "Durchschnitt 60 Tage", "count"],
      ["volumeRatio20over60", "Verhaeltnis 20/60", "ratio"], ["volumeSpikeRatio", "Ausschlag", "ratio"],
      ["volumeBreakout", "Ausbruch", "bool"]
    ]}
  ];

  function pfad(obj, id) {
    var p = id.indexOf(".");
    if (p < 0) return obj ? obj[id] : undefined;
    var g = obj ? obj[id.slice(0, p)] : null;
    return g ? g[id.slice(p + 1)] : undefined;
  }

  function faktorAbschnitt(row, meta) {
    if (row.factorsStatus !== "PRESENT") {
      return C.section("Quantum — gemessene Faktoren",
        "Fuer diesen Titel ist keine Faktorzeile ausgeliefert.",
        S.unavailable("Keine Faktoren fuer " + row.ticker,
          "Die Kursreihe dieses Titels hat den Qualitaetstest des Laufs nicht bestanden" +
          (row.dataQualityReason ? " (" + klartext(row.dataQualityReason) + ")" : "") +
          ". Es wird hier kein Ersatzwert gezeigt: eine Null waere eine Aussage, die niemand gemacht hat."));
    }

    /* fieldStatus steht als Vorlage in meta.json, nicht je Zeile - das
       spart im Buendel mehr als die Haelfte. Hier wird er aufgelegt. */
    var werte = row.factors.values;
    var status = (typeof row.factors.fieldStatusRef === "number"
      ? (meta.fieldStatusTemplates || [])[row.factors.fieldStatusRef]
      : row.factors.fieldStatus) || {};
    var gruppen = GRUPPEN.map(function (g) {
      return el("div", { class: "u-factor-group" }, [
        el("h4", { text: g.titel }),
        el("div", { class: "q-metrics" }, g.felder.map(function (f) {
          return kachelFaktor(f[0], f[1], f[2], pfad(werte, f[0]), pfad(status, f[0]));
        }))
      ]);
    });

    return C.section("Quantum — gemessene Faktoren",
      "Stand " + S.formatDate(row.factors.asOf) + ", gerechnet auf " + basisText(row.factors.basis) +
      ". Absolute Kursniveaus (SMA-Werte, 52-Wochen-Marken, letzter Kurs) sind zurueckgehalten; " +
      "gezeigt werden Zustaende, Abstaende und Renditen.",
      el("div", {}, gruppen));
  }

  function kachelFaktor(id, label, art, wert, status) {
    if (status && status !== "CALCULATED") {
      return el("div", { class: "q-metric" }, [
        el("span", { text: label }),
        el("b", { class: "na", text: STATUS_TEXT[status] || "keine Daten" }),
        el("em", { text: status === "INSUFFICIENT_HISTORY"
          ? "Die Kursreihe reicht fuer diesen Zeitraum nicht weit genug zurueck."
          : "Diese Angabe ist in dieser Auslieferung nicht enthalten." })
      ]);
    }
    if (wert === null || wert === undefined) {
      return el("div", { class: "q-metric" }, [
        el("span", { text: label }), el("b", { class: "na", text: "keine Daten" })
      ]);
    }
    if (art === "bool") {
      return el("div", { class: "q-metric" }, [
        el("span", { text: label }), el("b", {}, [P.boolChip(wert, "ja", "nein")])
      ]);
    }
    var text = art === "pct" ? P.pct(wert)
             : art === "count" ? P.compact(wert)
             : S.num(wert, 2);
    return el("div", { class: "q-metric" }, [
      el("span", { text: label }), el("b", { text: text })
    ]);
  }

  /* ------------------------------------------------------------ Stammdaten */

  function stammdatenAbschnitt(row) {
    var eintraege = [
      { label: "Boerse", value: row.exchange || "–" },
      { label: "Land / Waehrung", value: (row.country || "–") + " · " + (row.currency || "–") },
      { label: "Instrumententyp", value: lesbar(row.instrumentType) },
      { label: "Sektor", value: row.sector && row.sector !== "UNKNOWN" ? row.sector : "nicht geliefert",
        hint: row.sectorStatus === "CURATED" ? "kuratiert" : "der Zugang liefert keinen Sektor" },
      { label: "Gelistet seit", value: S.formatDate(row.listedSince) },
      { label: "Aktiv gelistet", value: row.active === null ? "–" : row.active ? "ja" : "nein" },
      { label: "Handelstage", value: S.num(row.bars, 0) },
      { label: "Historie", value: row.historyYears ? S.num(row.historyYears, 1) + " Jahre" : "–",
        hint: S.formatDate(row.historyFrom) + " bis " + S.formatDate(row.historyTo) },
      { label: "Splits / Dividenden", value: S.num(row.splits, 0) + " / " + S.num(row.dividends, 0) },
      { label: "Kursbereinigung", value: ADJUSTMENT_TEXT[row.adjustment] || row.adjustment || "–" },
      { label: "Letzter Kurstag hinter dem Kalender", value: row.staleTradingDays === null ? "–" :
          S.num(row.staleTradingDays, 0) + (row.staleTradingDays === 1 ? " Handelstag" : " Handelstage") }
    ];

    var qualitaet = el("div", { class: "q-card q-card--flat", style: "margin-top:16px" }, [
      el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap" }, [
        el("b", { text: "Datenqualitaet der Kursreihe" }),
        P.qualityChip(row.dataQuality)
      ]),
      el("p", { class: "q-note", style: "margin-top:8px", text: klartext(row.dataQualityReason) }),
      row.dataQualityReason
        ? el("p", { class: "q-note", text: "Pruefmarke des Laufs: " + row.dataQualityReason })
        : null
    ]);

    return C.section("Stammdaten und Historie",
      "Was der Lauf ueber diesen Titel festgestellt hat.",
      el("div", {}, [C.metricGrid(eintraege), qualitaet]));
  }

  function technicalAbschnitt(row) {
    return C.section("Technical Intelligence",
      "Vorberechnet, aus derselben Kursreihe.",
      C.metricGrid([
        { label: "Status", value: lesbar(row.technical) },
        { label: "Trend", value: lesbar(row.trend) },
        { label: "Elliott", value: lesbar(row.elliott),
          hint: "kein erfundener Count bei Ambiguitaet" },
        { label: "Elliott-Konfidenz", value: row.elliottConfidence === null ? "–" : S.num(row.elliottConfidence, 0) }
      ]));
  }

  function herkunftAbschnitt(meta, row) {
    return el("div", { style: "margin-top:32px" }, [
      C.disclosure("Datenherkunft (Provenance)", [
        el("div", { class: "q-metrics" }, [
          S.provenanceTag("Kursdaten-Provider", "TIINGO", "neutral"),
          S.provenanceTag("Faktor-Engine", (meta.factorArtefact && meta.factorArtefact.gate) || meta.gate, "neutral"),
          S.provenanceTag("Snapshot", meta.dataSnapshotId || "–", "neutral"),
          S.provenanceTag("Quelle der Zeile", row.factorsSource === "DURABLE_ARTEFACT"
            ? "DAUERHAFTES ARTEFAKT" : row.factorsSource || "–", "neutral"),
          S.provenanceTag("Mock", "nein", "good")
        ]),
        el("p", { class: "q-note", style: "margin-top:10px", text:
          "Die Faktorzeilen stammen aus dem committeten Artefakt des FULL_UNIVERSE-Laufs " +
          ((meta.factorArtefact && meta.factorArtefact.generatedAt)
            ? "(" + S.formatDateTime(meta.factorArtefact.generatedAt) + ", " +
              S.num(meta.factorArtefact.securities, 0) + " Zeilen)" : "") +
          ". Es wurde fuer diese Seite nichts nachgerechnet und nichts beim Anbieter geholt. " +
          "Auslieferung: " + ((meta.factorArtefact && meta.factorArtefact.entitlement) || "–") + "." })
      ])
    ]);
  }

  /* ---------------------------------------------------------------- Helfer */

  function sprungLeiste(index, ticker) {
    var eingabe = el("input", {
      class: "q-input", type: "search", id: "u-jump", autocomplete: "off",
      placeholder: "Ticker — z. B. ORCL", value: ticker || ""
    });
    function los() {
      var t = eingabe.value.trim().toUpperCase();
      if (t) location.href = P.stockHref(t);
    }
    eingabe.addEventListener("keydown", function (e) { if (e.key === "Enter") los(); });
    return el("div", { class: "q-card q-card--flat", style: "margin-bottom:20px" }, [
      el("div", { class: "u-search" }, [
        el("div", { class: "q-field" }, [
          el("label", { for: "u-jump", text: "Titel oeffnen (" + S.num(index.count, 0) + " ausgeliefert)" }),
          eingabe
        ]),
        el("button", { class: "q-btn q-btn--sm", type: "button", text: "Oeffnen", onclick: los }),
        el("a", { class: "q-btn q-btn--ghost q-btn--sm", href: P.BASE, text: "Zur Suche" })
      ])
    ]);
  }

  function kachel(label, wert, ton, hinweis) {
    return el("div", { class: "q-metric" }, [
      el("span", { text: label }),
      el("b", {}, [P.toneChip(wert, ton === "good" ? "strong" : ton === "poor" ? "poor" : "neutral")]),
      hinweis ? el("em", { text: hinweis }) : null
    ]);
  }

  function zeile(label, wert, ton, hinweis) { return kachel(label, wert, ton, hinweis); }

  function klartext(reason) {
    if (!reason) return "Ohne Befund.";
    return QUALITY_TEXT[reason] ||
      "Der Lauf hat diesen Titel mit einer eigenen Pruefmarke versehen.";
  }

  function basisText(basis) {
    return basis === "adjustedClose" ? "bereinigten Schlusskursen"
         : basis === "close" ? "Schlusskursen" : (basis || "–");
  }

  function lesbar(v) {
    if (!v) return "–";
    return String(v).replace(/_/g, " ").toLowerCase()
      .replace(/^./, function (c) { return c.toUpperCase(); });
  }
})();
