/* Vision Universe Quant — Technical Intelligence
   (/quant/technical/?symbol=NVDA)

   Rein darstellend. Jede Zahl stammt aus quant/data/technical/** —
   praekomputiert von scripts/technical/build-technical-data.mjs. Kein
   Wert wird hier berechnet, kein Pivot bestimmt, keine Welle erfunden.

   Information Layering (§64):
     1 Hero: Score, Trend, Primary Scenario, RR, Confidence — einfach lesbar
     2 Chart mit Layern AUTO · STRUCTURE · TREND · MOMENTUM · S/R · FIBONACCI · ELLIOTT
     3 Szenarien (Primary, Alternative, Bear/Invalidation)
     4 Technische Details / Rohmetriken
     5 Methodik, Evidence, Provenienz */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, Charts = window.QuantCharts, el = S.el;
  var BASE = S.BASE + "data/technical/";
  var LAYERS = [["AUTO", "Auto"], ["STRUCTURE", "Struktur"], ["TREND", "Trend"], ["MOMENTUM", "Momentum"], ["SUPPORT_RESISTANCE", "S/R"], ["FIBONACCI", "Fibonacci"], ["ELLIOTT", "Elliott"]];
  var RANGES = ["1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"];
  var state = { layer: "AUTO", range: "5Y", mode: null, showAlt: false, showAltCount: false };

  S.page({
    nav: S.BASE + "technical/",
    need: [],
    banner: false,
    origin: false,
    render: function (data, root) {
      var symbol = (S.param("symbol") || S.param("ticker") || "").toUpperCase();
      return S.loadJSON(BASE + "index.json").then(function (index) {
        var entry = index.instruments.filter(function (r) { return r.instrumentId === symbol; })[0];
        if (!symbol || !entry) return renderIndex(root, index, symbol);
        return Promise.all([S.loadJSON(BASE + "instruments/" + symbol + ".json"), S.loadJSON(BASE + "meta.json")]).then(function (res) {
          renderInstrument(root, res[0], res[1], index);
        });
      });
    }
  });

  // ------------------------------------------------------------- Index
  function renderIndex(root, index, symbol) {
    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker", text: "Technical Intelligence" }),
      el("h1", { class: "q-h1", text: "Marktstruktur, Szenarien, Elliott" }),
      el("p", { class: "q-lead", text: "Autonome technische Analyse: Datenquelle → deterministische Engines → strukturierte Szenarien → Evidenz. Kein Mensch zeichnet ein, kein Sprachmodell erfindet Struktur." })
    ]));
    if (symbol) root.appendChild(S.stateBox("Kein Analysestand fuer " + symbol, "Fuer dieses Symbol liegt keine praekomputierte technische Analyse vor.", "empty"));
    var real = index.instruments.filter(function (r) { return !r.isMock; }), mock = index.instruments.filter(function (r) { return r.isMock; });
    if (real.length) {
      root.appendChild(C.section("Referenztitel (reale Tageskurse)", "Splitbereinigte Tageskurse aus dem Marktdatenbestand des Dashboards; Analyse-Lookback = gesamte verfuegbare Historie.", listOf(real)));
    } else {
      root.appendChild(S.stateBox("Reale Technical-Daten nicht oeffentlich verfuegbar", "Provider-Rohdaten bleiben bis zur geklaerten Redistribution im geschuetzten internen Datenpfad. Es wird nicht auf reale Ticker mit Mock-Kursen zurueckgefallen.", "warn"));
    }
    root.appendChild(C.section("Synthetische Fixtures und Scan-Spitzen (Demo-Daten)", "Modelluniversum mit 20 Jahren Historie, u. a. die 4:1-Split-Fixture VUF011.", listOf(mock)));
    root.appendChild(scanSection());
  }
  function listOf(rows) {
    return el("div", { class: "q-rows" }, rows.map(function (r) {
      return el("a", { class: "q-row", href: S.BASE + "technical/?symbol=" + r.instrumentId }, [
        el("span", { class: "q-row-rank", text: r.isMock ? "Demo" : "" }),
        el("span", { class: "q-row-main" }, [el("b", { text: r.instrumentId }), el("span", { text: (r.name && r.name !== r.instrumentId ? r.name + " · " : "") + "Trend " + label(r.trend) + " · Primary " + label(r.primaryDirection) + (r.elliottStatus ? " · Elliott " + label(r.elliottStatus) : "") })]),
        el("span", { class: "q-row-score" }, [C.scorePill(r.opportunityScore)]),
        el("span", { class: "q-chip", text: S.formatDate(r.asOf) })
      ]);
    }));
  }
  function scanSection() {
    var wrap = el("div", {});
    S.loadJSON(BASE + "scan-mock.json", { attempts: 1 }).then(function (scan) {
      var top = scan.rows.slice(0, 12);
      S.mount(wrap, [
        el("p", { class: "q-note", text: scan.count + " synthetische Titel, Universe " + scan.universeId + ", Methodik " + scan.methodologyVersion + ". Score = methodologischer Setup-Rang, keine Wahrscheinlichkeit." }),
        el("div", { class: "q-table-wrap" }, [el("table", { class: "q-table" }, [
          el("thead", {}, [el("tr", {}, ["Titel", "Score", "Perzentil", "Trend", "Struktur", "Momentum", "RS", "RR", "Setup"].map(function (h) { return el("th", { text: h }); }))]),
          el("tbody", {}, top.map(function (r) {
            return el("tr", {}, [
              el("td", {}, [el("b", { text: r.instrumentId }), el("span", { class: "q-note", text: " " + (r.meta && r.meta.name || "") })]),
              el("td", { text: S.num(r.opportunityScore, 0) }), el("td", { text: S.num(r.scorePercentile, 0) }),
              el("td", { text: label(r.trend) }), el("td", { text: label(r.structure) }), el("td", { text: label(r.momentum) }), el("td", { text: label(r.relativeStrength) }),
              el("td", { text: r.riskReward === null ? "–" : S.num(r.riskReward, 1) }), el("td", { text: label(r.setupStatus) })
            ]);
          }))
        ])])
      ]);
    }).catch(function () { S.mount(wrap, S.stateBox("Kein Scan", "Der Universe-Scan ist nicht verfuegbar.", "empty")); });
    return C.section("Universe Scan — Top Technical Setups", "Dieselben Engines ueber das gesamte Modelluniversum; Filter z. B. technicalScore > 80, RR > 3, Trend bullish (Screener-Integration vorbereitet).", wrap);
  }

  // -------------------------------------------------------- Instrument
  function renderInstrument(root, file, meta, index) {
    var b = file.bundle, p = b.scenarios.primary, setup = b.tradeSetup;
    var prec = precisionOf(b);
    root.appendChild(originNote(file, meta));
    root.appendChild(hero(file, b, p, setup, prec));
    var chartHost = el("div", {});
    root.appendChild(chartSection(file, b, chartHost, prec));
    root.appendChild(scenarioSection(b, prec));
    root.appendChild(setupSection(b, prec));
    root.appendChild(elliottSection(b, prec));
    root.appendChild(stateSection(b, prec));
    root.appendChild(evidenceSection(b));
    root.appendChild(methodologySection(file, b, meta));
    var stamp = S.$("#q-datastamp");
    if (stamp) stamp.textContent = "Datenstand " + S.formatDate(b.dataCutoff) + " · " + b.methodologyVersion;
    drawChart(file, b, chartHost, prec);
  }

  function originNote(file, meta) {
    var lines = file.isMock
      ? ["Demo-Daten: synthetisches Universum (Seed „" + (meta.mockData ? meta.mockData.seed : "") + "“). Keine realen Unternehmen, keine realen Marktdaten."]
      : ["Reale Tageskurse (" + (file.priceSeriesType === "SPLIT_ADJUSTED" ? "splitbereinigt" : file.priceSeriesType) + ") aus dem Marktdatenbestand des Dashboards, Stand " + S.formatDateTime(file.sourceRevision) + ". Tagesschluss, keine Realtime-Daten."];
    return el("section", { class: "q-origin-bar", role: "note" }, [
      el("div", { class: "q-provenance-tags" }, [
        S.provenanceTag("MODE", file.isMock ? "MOCK" : "REAL", file.isMock ? "neutral" : "strong"),
        S.provenanceTag("FORM", "PRECOMPUTED", "neutral"),
        S.provenanceTag("SOURCE", file.isMock ? "MOCK" : String((meta.realData && meta.realData.provider) || "UNKNOWN").toUpperCase(), "neutral"),
        S.provenanceTag("ELLIOTT", "BETA", "neutral")
      ]),
      el("div", { class: "q-origin-row" }, [S.originBadge("marketData", file.isMock ? "mock" : "endOfDay"), el("span", { class: "q-chip", text: "Analyse-Lookback " + file.bundle.analysisLookback.bars + " Bars ab " + S.formatDate(file.bundle.analysisLookback.from) }), el("span", { class: "q-chip", text: "Anzeige ab " + S.formatDate(file.bars.from) })]),
      el("p", { class: "q-origin-note", text: lines[0] })
    ]);
  }

  function hero(file, b, p, setup, prec) {
    var score = b.opportunityScore;
    var dirText = p ? scenarioHeadline(p) : "Unbestimmt";
    return el("header", { class: "q-tech-hero" }, [
      el("p", { class: "q-kicker", text: "Technical Intelligence · " + (file.isMock ? "Demo-Titel" : "Referenztitel") }),
      el("h1", { class: "q-h1", style: "margin-bottom:4px", text: file.instrumentId }),
      el("p", { class: "q-lead", style: "margin-bottom:18px", text: (file.name && file.name !== file.instrumentId ? file.name + " · " : "") + "Schluss " + fmtP(b.lastBar.close, prec) + " am " + S.formatDate(b.dataCutoff) }),
      el("div", { class: "q-tech-hero-grid" }, [
        el("div", { class: "q-tech-orb" }, [C.scoreOrb(score.score, { label: "Technical" }), el("p", { class: "q-note", style: "text-align:center;margin-top:6px", text: "Technical Opportunity Score · " + (score.band ? score.band.label : "") }), el("p", { class: "q-note q-tech-fine", style: "text-align:center", text: "Methodology Rank 0–100, keine Wahrscheinlichkeit" })]),
        el("div", { class: "q-metrics q-tech-hero-metrics" }, [
          C.metricTile("Trend", label(b.trend.direction), b.trend.trendScore === null ? null : "Score " + S.num(b.trend.trendScore, 0) + "/100"),
          C.metricTile("Struktur", label(b.structure.state.regime), (b.structure.state.lastHighLabel || "–") + " / " + (b.structure.state.lastLowLabel || "–")),
          C.metricTile("Primary Scenario", dirText, p ? label(p.status) : null),
          C.metricTile("Risk / Reward", setup.riskReward ? S.num(setup.riskReward.low, 1) + " – " + S.num(setup.riskReward.high, 1) : "–", setup.status === "INCOMPLETE" ? "kein vollstaendiges Setup" : label(setup.status)),
          C.metricTile("Methodology Confidence", p && p.confidence !== null ? S.num(p.confidence, 0) + "/100" : "–", "Method Fit, keine Wahrscheinlichkeit"),
          C.metricTile("Elliott (Beta)", b.elliott && b.elliott.primaryCount && b.elliott.primaryCount.currentWave ? "Welle " + b.elliott.primaryCount.currentWave.label + " " + label(b.elliott.primaryCount.currentWave.status) : (b.elliott ? label(b.elliott.status) : "–"), b.elliott && b.elliott.confidence !== null ? "Method Fit " + b.elliott.confidence + "/100" : null)
        ])
      ]),
      el("p", { class: "q-tech-plain", text: plainLanguage(b) })
    ]);
  }

  /** Layer 1 — ein Satz fuer Einsteiger. */
  function plainLanguage(b) {
    var t = b.trend.direction, st = b.structure.state.regime, p = b.scenarios.primary;
    var s1 = t === "BULLISH" ? "Aufwaertstrend intakt" : t === "BEARISH" ? "Abwaertstrend intakt" : t === "NEUTRAL" ? "Kein klarer Trend" : "Trend unbestimmt";
    var s2 = st === "BULLISH" ? "die Struktur bildet hoehere Hochs und Tiefs" : st === "BEARISH" ? "die Struktur bildet tiefere Hochs und Tiefs" : st === "RANGE" ? "der Kurs pendelt in einer Range" : "die Struktur ist gemischt";
    var s3 = p && p.entryZone ? (p.entryStatus === "ACTIVE" ? "Der Kurs liegt in der Entry Zone des Primary Scenario." : p.entryStatus === "AWAITING_PULLBACK" ? "Das Primary Scenario wartet auf einen Ruecklauf in die Entry Zone." : p.entryStatus === "EXTENDED" ? "Der Kurs ist von der Entry Zone entfernt — kein aktives Setup." : "Kein aktives Setup.") : "Kein handelbares Setup — nur Analyse.";
    return s1 + ", " + s2 + ". " + s3;
  }

  // ---------------------------------------------------------------- Chart
  function chartSection(file, b, host, prec) {
    var controls = el("div", { class: "q-tech-controls" }, [
      el("div", { class: "q-pillbar q-tech-layers", role: "tablist", "aria-label": "Chart-Layer" }, LAYERS.map(function (l) {
        return el("button", { class: "q-pill" + (state.layer === l[0] ? " is-active" : ""), type: "button", role: "tab", dataset: { layer: l[0] }, text: l[1], onclick: function () { state.layer = l[0]; drawChart(file, b, host, prec); } });
      })),
      el("div", { class: "q-pillbar q-tech-ranges", "aria-label": "Zeitraum" }, RANGES.map(function (r) {
        return el("button", { class: "q-pill q-pill--sm" + (state.range === r ? " is-active" : ""), type: "button", dataset: { range: r }, text: r, onclick: function () { state.range = r; drawChart(file, b, host, prec); } });
      })),
      el("div", { class: "q-pillbar", "aria-label": "Darstellung" }, [
        el("button", { class: "q-pill q-pill--sm", type: "button", dataset: { mode: "toggle" }, text: "Kerzen/Linie", onclick: function () { state.mode = state.mode === "candles" ? "line" : "candles"; drawChart(file, b, host, prec); } }),
        el("button", { class: "q-pill q-pill--sm", type: "button", dataset: { alt: "toggle" }, text: "Alternative", onclick: function () { state.showAlt = !state.showAlt; state.showAltCount = state.showAlt; drawChart(file, b, host, prec); } })
      ])
    ]);
    return C.section("Chart", null, el("div", {}, [controls, host, legend()]));
  }
  function legend() {
    return el("div", { class: "q-tech-legend" }, [
      el("span", { class: "lg lg-hist", text: "Historie (bestaetigt)" }), el("span", { class: "lg lg-dev", text: "Developing" }), el("span", { class: "lg lg-proj", text: "Projektion (gestrichelt, rechts vom Now-Divider)" }),
      el("span", { class: "lg lg-entry", text: "Entry Zone" }), el("span", { class: "lg lg-target", text: "Target Zone" }), el("span", { class: "lg lg-inv", text: "Invalidation" })
    ]);
  }
  function drawChart(file, b, host, prec) {
    S.$$(".q-tech-layers .q-pill", host.parentNode).forEach(function (btn) { btn.classList.toggle("is-active", btn.dataset.layer === state.layer); btn.setAttribute("aria-selected", btn.dataset.layer === state.layer ? "true" : "false"); });
    S.$$(".q-tech-ranges .q-pill", host.parentNode).forEach(function (btn) { btn.classList.toggle("is-active", btn.dataset.range === state.range); });
    var anns = b.annotations ? b.annotations.annotations.filter(function (a) { return a.layers.indexOf(state.layer) !== -1; }) : [];
    if (state.showAlt && b.annotations) anns = anns.concat(b.annotations.annotations.filter(function (a) { return a.layers.indexOf("ALTERNATIVE") !== -1 || (state.layer === "ELLIOTT" && a.layers.indexOf("ELLIOTT_ALT") !== -1); }));
    var svg = Charts.technicalChart({
      bars: file.bars, range: state.range, mode: state.mode || undefined, annotations: anns, series: b.chartSeries || {}, precision: prec,
      title: file.instrumentId + " — " + state.layer, description: "Technical Chart mit Layer " + state.layer + ", Zeitraum " + state.range + ". Projektionen rechts des Now-Dividers sind gestrichelt."
    });
    var wrap = el("div", { class: "q-chart-wrap q-tech-chart-wrap" }, [svg]);
    S.mount(host, wrap);
    /* Auf schmalen Viewports beginnt der Chart am rechten Rand: Now-Divider,
       Projektion und Entry Zone sind das, was der Nutzer zuerst sehen soll. */
    if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = wrap.scrollWidth;
  }

  // ------------------------------------------------------------ Szenarien
  function scenarioSection(b, prec) {
    var sc = b.scenarios;
    var cards = sc.scenarios.map(function (s) { return scenarioCard(s, prec, s.type === "PRIMARY"); });
    return C.section("Szenarien", "Kein Kauf-/Verkaufssignal, sondern strukturierte Hypothesen mit objektiver Invalidation. Zielzonen statt Einzelwerte; jede Zone dokumentiert ihre Quelle.", el("div", { class: "q-grid q-grid--3 q-tech-scenarios" }, cards));
  }
  function scenarioHeadline(s) {
    var d = s.direction === "BULLISH" ? "Bullisch" : s.direction === "BEARISH" ? "Bearisch" : s.direction === "NEUTRAL" ? "Neutral" : "Unbestimmt";
    var t = { PULLBACK_TO_SUPPORT: "Fortsetzung nach Ruecklauf", PULLBACK_TO_RESISTANCE: "Fortsetzung nach Ruecklauf", BREAKOUT_RETEST: "Ausbruch / Retest", DEEPER_CORRECTION: "tiefere Korrektur", STRUCTURE_FAILURE: "Strukturbruch", RANGE: "Range", RANGE_BREAKOUT_UP: "Range-Ausbruch oben", RANGE_BREAKDOWN: "Range-Bruch unten", INSUFFICIENT_STRUCTURE: "zu wenig Struktur" }[s.template] || s.template;
    return d + " · " + t;
  }
  function scenarioCard(s, prec, primary) {
    var rows = [];
    if (s.currentStructure) rows.push(["Aktuelle Struktur", s.currentStructure]);
    rows.push(["Entry Zone", s.entryZone ? zoneText(s.entryZone, prec) + " (" + label(s.entryStatus) + ")" : "keine — Analyse ohne handelbaren Einstieg"]);
    if (s.trigger) rows.push(["Trigger", s.trigger.rule]);
    rows.push(["Invalidation", s.invalidation ? fmtP(s.invalidation.price, prec) + " — " + s.invalidation.rule : "–"]);
    s.targetZones.forEach(function (z, k) { rows.push([z.label || ("Target Zone " + (k + 1)), zoneText(z, prec) + " · Quelle: " + z.sources.map(function (x) { return sourceLabel(x); }).join(", ")]); });
    rows.push(["Was muss passieren", s.whatMustHappen]);
    rows.push(["Verfall", s.expiryRule]);
    rows.push(["Methodology Confidence", s.confidence === null ? "–" : S.num(s.confidence, 0) + "/100 (Method Fit, keine Wahrscheinlichkeit)"]);
    return el("div", { class: "q-card q-tech-scenario" + (primary ? " is-primary" : "") }, [
      el("p", { class: "q-kicker", text: s.type === "PRIMARY" ? "Primary Scenario" : s.type === "ALTERNATIVE" ? "Alternative Scenario" : "Bear / Invalidation Scenario" }),
      el("h3", { class: "q-h3", text: scenarioHeadline(s) }),
      el("span", { class: "q-chip", text: label(s.status) }),
      C.definitionList(rows.map(function (r) { return { term: r[0], value: r[1] }; })),
      s.supportingEvidence && s.supportingEvidence.length ? el("details", { class: "q-disclosure" }, [el("summary", { text: "Supporting Evidence (" + s.supportingEvidence.length + ") · Conflicting (" + s.conflictingEvidence.length + ")" }), evidenceList(s.supportingEvidence, "good"), evidenceList(s.conflictingEvidence, "poor")]) : null
    ]);
  }
  function evidenceList(items, tone) {
    return el("ul", { class: "q-tech-evidence q-tech-evidence--" + tone }, items.slice(0, 12).map(function (e) { return el("li", { text: "[" + e.family + "] " + e.statement }); }));
  }

  // -------------------------------------------------------------- Setup
  function setupSection(b, prec) {
    var t = b.tradeSetup;
    if (t.status === "INCOMPLETE") {
      return C.section("Trade Setup", "Ein Setup entsteht nur mit Entry, Invalidation, Target und RR — fehlt eines, gibt es kein Teilsetup.", S.unavailable("Kein vollstaendiges Trade Setup", "Fehlend: " + t.missing.join(", ") + ". Die Analyse bleibt gueltig, ist aber nicht handelbar."));
    }
    var tiles = [
      C.metricTile("Entry Zone", fmtP(t.entry.zoneLow, prec) + " – " + fmtP(t.entry.zoneHigh, prec), label(t.entry.status)),
      C.metricTile("Invalidation / Trade Stop", fmtP(t.tradeStop.price, prec), "Risiko " + S.num(t.riskToInvalidation.pctLow * 100, 1) + " – " + S.num(t.riskToInvalidation.pctHigh * 100, 1) + " % · " + t.riskToInvalidation.atr + " ATR"),
      C.metricTile("Potential Upside", S.num(t.potentialUpside.low * 100, 1) + " – " + S.num(t.potentialUpside.high * 100, 1) + " %", "bis Target Zone 1 bzw. 2"),
      C.metricTile("Risk / Reward (T1)", S.num(t.riskReward.low, 1) + " – " + S.num(t.riskReward.high, 1), t.riskReward.target2Low !== null ? "T2: " + S.num(t.riskReward.target2Low, 1) + " – " + S.num(t.riskReward.target2High, 1) : null),
      C.metricTile("Setup Quality", t.setupQuality === null ? "–" : S.num(t.setupQuality, 0) + "/100", label(t.status))
    ];
    return C.section("Trade Setup", "Risk = Entry − Invalidation, Reward als Range je Zielzone. Kein Positionsmass, keine Ausfuehrung, keine persoenliche Empfehlung.", el("div", { class: "q-metrics" }, tiles));
  }

  // ------------------------------------------------------------ Elliott
  function elliottSection(b, prec) {
    var e = b.elliott;
    if (!e || e.status === "UNAVAILABLE") return C.section("Elliott Wave (Beta)", null, S.unavailable("Elliott-Analyse nicht verfuegbar", e ? (e.detail || label(e.reason)) : "Nicht berechnet."));
    var p = e.primaryCount, hist = e.historicalMap;
    var waves = p.waves.map(function (w) { return el("span", { class: "q-chip q-wave q-wave--" + w.status.toLowerCase(), title: (w.toTime || "") + (w.confirmedAt ? " · bestaetigt " + w.confirmedAt : ""), text: w.label + " " + (w.toPrice ? fmtP(w.toPrice, prec) : "") }); });
    var zones = p.projection.zones.map(function (z) { return el("li", { text: "Welle " + z.label + ": " + zoneText(z, prec) + " (" + z.sources.length + " Quellen)" }); });
    var rows = [
      { term: "Status", value: label(e.status) + (e.reason ? " · " + label(e.reason) : "") },
      { term: "Degree", value: e.degreeIndex + " (Pivot-Skala " + e.degreeScale + ", strukturell, kein Kalenderzeitraum)" },
      { term: "Historical Wave Map", value: hist.patterns.length + " abgeschlossene Muster (" + hist.patterns.map(function (x) { return x.type; }).join(", ") + "), Coverage " + S.num(hist.coverage * 100, 0) + " % der signifikanten Pivots" },
      { term: "Aktuelle Welle", value: p.currentWave ? "Welle " + p.currentWave.label + " (" + p.currentWave.patternType + ") — " + label(p.currentWave.status) + (p.currentWave.note ? " · " + p.currentWave.note : "") : "–" },
      { term: "Invalidation", value: p.invalidation ? p.invalidation.statement + " (Regel " + p.invalidation.ruleId + ")" : "keine — daher keine Projektion" },
      { term: "Elliott Confidence", value: e.confidence + "/100 Method Fit (Fit " + S.num(e.fit * 100, 0) + ", Stabilitaet " + S.num(e.stability * 100, 0) + ") — keine Wahrscheinlichkeit" },
      { term: "Alternative Count", value: e.alternativeCount && e.alternativeCount.currentWave ? "Welle " + e.alternativeCount.currentWave.label + " (" + e.alternativeCount.currentWave.patternType + ") — per Toggle im Chart" : "keine materiell andere valide Alternative" }
    ];
    return C.section("Elliott Wave (Beta)", "Regelbasierte strukturale Hypothesenmaschine: erst die Vergangenheit erklaeren (Labels an echten Pivots), dann die laufende Welle, erst danach Projektion. Harte Regeln sind Gates, Guidelines ranken.", el("div", { class: "q-card" }, [
      C.definitionList(rows),
      el("p", { class: "q-kicker", style: "margin-top:12px", text: "Wave Map (bestaetigt · developing)" }),
      el("div", { class: "q-tech-waves" }, waves),
      zones.length ? el("div", {}, [el("p", { class: "q-kicker", style: "margin-top:12px", text: "Projection Zones (PROJECTED)" }), el("ul", { class: "q-tech-list" }, zones)]) : null
    ]));
  }

  // ------------------------------------------------------- Zustaende
  function stateSection(b, prec) {
    var m = b.momentum, rs = b.relativeStrength, v = b.volatility, vol = b.volume, sr = b.supportResistance, f = b.featuresAtCutoff;
    var blocks = [
      ["Trend", [["Richtung", label(b.trend.direction)], ["Trend Score", S.num(b.trend.trendScore, 0)], ["SMA 50 / 200", fmtP(b.trend.metrics.sma50, prec) + " / " + fmtP(b.trend.metrics.sma200, prec)], ["Abstand 52W-Hoch", pct(b.trend.metrics.distanceTo52wHigh)], ["ADX", S.num(b.trend.metrics.adx, 1)]]],
      ["Momentum", [["Zustand", label(m.state)], ["1M / 3M / 6M / 12M", ["1M", "3M", "6M", "12M"].map(function (h) { return pct(m.horizons[h].return); }).join(" / ")], ["Beschleunigung", m.acceleration === null ? "–" : S.signed(m.acceleration, 2)], ["RSI 14 (erklaerend)", S.num(m.explanatory.rsi14.value, 0)], ["MACD (erklaerend)", m.explanatory.macd.cross || "–"]]],
      ["Relative Staerke", [["Zustand", label(rs.state)], ["vs. Benchmark 3M / 12M", rs.vsBenchmark.status === "OK" ? pct(rs.vsBenchmark.horizons["3M"]) + " / " + pct(rs.vsBenchmark.horizons["12M"]) : "nicht verfuegbar"], ["Relativer Trend (z)", rs.vsBenchmark.ratioTrendZ === undefined || rs.vsBenchmark.ratioTrendZ === null ? "–" : S.num(rs.vsBenchmark.ratioTrendZ, 2)], ["Universum-Perzentil", rs.universeRank ? S.num(rs.universeRank.percentile, 0) : "–"]]],
      ["Volatilitaet", [["Regime", label(v.regime)], ["ATR / ATR %", fmtP(v.metrics.atr, prec) + " / " + pct(v.metrics.atrPct)], ["ATR-Perzentil (1J)", S.num(v.metrics.atrPctPercentile, 0)], ["Realized Vol 20/60", pct(v.metrics.realizedVol) + " / " + pct(v.metrics.realizedVolLong)], ["Kompression", v.compression ? "ja" : "nein"]]],
      ["Volumen", [["Zustand", label(vol.state)], ["Relatives Volumen", vol.metrics ? S.num(vol.metrics.relativeVolume, 2) + "×" : "–"], ["Volumentrend", vol.metrics && vol.metrics.volumeTrend !== null ? pct(vol.metrics.volumeTrend) : "–"], ["Up-Volume-Anteil", vol.metrics && vol.metrics.upVolumeShare !== null ? pct(vol.metrics.upVolumeShare) : "–"]]],
      ["Support / Resistance", [["Naechste Unterstuetzung", sr.nearestSupport ? zoneText(sr.nearestSupport, prec) + " (Staerke " + S.num(sr.nearestSupport.strength, 0) + ", " + sr.nearestSupport.touchCount + " Touches)" : "–"], ["Naechster Widerstand", sr.nearestResistance ? zoneText(sr.nearestResistance, prec) + " (Staerke " + S.num(sr.nearestResistance.strength, 0) + ", " + sr.nearestResistance.touchCount + " Touches)" : "–"], ["Zonen", sr.zones.length + " aktiv"], ["Fibonacci", b.fibonacci.currentRetracement === null ? "–" : "Retracement " + pct(b.fibonacci.currentRetracement) + (b.fibonacci.inRetracementPocket ? " (38.2–61.8)" : "") + " · " + b.fibonacci.clusters.length + " Cluster (auxiliary)"]]]
    ];
    return C.section("Technische Details", "Layer 3/4: Zustaende der unabhaengigen Engines und Rohmetriken. Fehlende Werte werden als fehlend ausgewiesen.", el("div", { class: "q-grid q-grid--3" }, blocks.map(function (bl) {
      return el("div", { class: "q-card q-card--flat" }, [el("p", { class: "q-kicker", text: bl[0] }), C.definitionList(bl[1].map(function (r) { return { term: r[0], value: r[1] }; }))]);
    })));
  }

  function evidenceSection(b) {
    var c = b.confluence;
    var fams = Object.keys(c.families).map(function (k) { var f = c.families[k]; return el("div", { class: "q-tech-family" + (f.value === null ? " is-na" : f.value > 0.2 ? " is-pos" : f.value < -0.2 ? " is-neg" : "") }, [el("b", { text: k.replace(/_/g, " ") }), el("span", { text: f.value === null ? "n/a" : S.signed(f.value, 2) })]); });
    var contrib = Object.keys(b.opportunityScore.contributions).map(function (k) { return { term: k.replace(/_/g, " "), value: S.num(b.opportunityScore.contributions[k], 1) + " / " + b.opportunityScore.maxContribution[k] }; });
    return C.section("Confluence und Score-Zerlegung", "Familienbasiert: RSI, MACD und Moving Averages erhalten keine Extra-Votes. Fibonacci/Elliott sind gekappt (max. 10 Punkte).", el("div", { class: "q-grid q-grid--2" }, [
      el("div", { class: "q-card q-card--flat" }, [el("p", { class: "q-kicker", text: "Signal-Familien (−1 … +1)" }), el("div", { class: "q-tech-families" }, fams), el("p", { class: "q-note", text: "Confluence " + S.num(c.confluenceScore, 0) + "/100 · Konfliktabschlag " + S.num(c.conflictPenalty * 100, 0) + " % · Coverage " + S.num(c.coverage * 100, 0) + " %" })]),
      el("div", { class: "q-card q-card--flat" }, [el("p", { class: "q-kicker", text: "Technical Opportunity Score " + S.num(b.opportunityScore.score, 0) }), C.definitionList(contrib), el("p", { class: "q-note", text: b.opportunityScore.disclaimer })])
    ]));
  }

  function methodologySection(file, b, meta) {
    var prov = [
      { term: "Data Cutoff", value: S.formatDate(b.dataCutoff) }, { term: "Data Version", value: b.dataVersion }, { term: "Data Hash", value: b.dataHash },
      { term: "Price Series", value: b.priceSeriesType + " (" + b.source + ")" }, { term: "Engine Bundle", value: b.bundleVersion }, { term: "Methodology", value: b.methodologyVersion + " · " + (b.elliottMethodologyVersion || "–") },
      { term: "Parameters Hash", value: b.parametersHash }, { term: "Snapshot", value: file.snapshotId }, { term: "Engine Versions", value: Object.keys(b.engineVersions).map(function (k) { return k + " " + b.engineVersions[k]; }).join(" · ") },
      { term: "Repainting Policies", value: Object.keys(b.repaintingPolicies).filter(function (k) { return b.repaintingPolicies[k]; }).map(function (k) { return k + ": " + b.repaintingPolicies[k]; }).join(" · ") }
    ];
    return C.section("Methodik und Provenienz", "Kein Ergebnis ohne Herkunft. Jede Projektion ist auf Daten, Pivots, Struktur, Regeln, Engine- und Methodikversion zurueckfuehrbar.", el("div", {}, [
      C.disclosure("Provenienz dieses Analysestands", [C.definitionList(prov)]),
      C.disclosure("Methodik in Kurzform", [el("ul", { class: "q-tech-list" }, [
        el("li", { text: "Pivots: kausale, volatilitaetsadaptive ZigZag-State-Machine auf vier Skalen; pivotTime ≠ confirmedAt; bestaetigte Pivots werden nie umgeschrieben." }),
        el("li", { text: "Struktur: HH/HL/LH/LL mit ATR-Toleranz, Break of Structure close-basiert, Structure Change formal definiert." }),
        el("li", { text: "Trend 0.35 MA-State + 0.25 Regression + 0.20 Persistenz + 0.10 52W-Naehe + 0.10 Richtungsstaerke; >65 bullisch, <35 bearisch (Designparameter)." }),
        el("li", { text: "Momentum: direkte Multi-Horizon-Returns, volatilitaetsstandardisiert. RSI/MACD nur erklaerend." }),
        el("li", { text: "Support/Resistance: gewichtetes Clustering bestaetigter Pivots; Zonen, keine Linien. Fibonacci nur als Hilfsgeometrie auf objektiven Ankern." }),
        el("li", { text: "Szenarien: Entry aus Retracement × Zone × ATR, Invalidation strukturell, Zielzonen aus Struktur/Measured Move/Fib-Cluster/Elliott-Projektion." }),
        el("li", { text: "Score: methodologischer Setup-Rang, Familien-Confluence ohne Double Counting, Projektion gekappt. Keine Wahrscheinlichkeit, keine Renditeerwartung." }),
        el("li", { text: "Elliott Beta: Standard-Impuls + einfacher Zigzag, harte Regeln als Gates, Historical Wave Map kausal, Confidence = 0.8 Fit + 0.2 Stabilitaet." })
      ])]),
      C.disclosure("Historische Evidenz", [el("p", { class: "q-note", text: "Walk-Forward-Snapshots (Projected vs Actual) liegen fuer Referenztitel vor; die Stichprobe ist zu klein fuer Erfolgsquoten. Es werden keine historischen Trefferquoten angezeigt, bis die Mindeststichprobe (" + (meta.walkForwardCutoffs ? "" : "") + "30 effektive Faelle) erreicht ist." })])
    ]));
  }

  // -------------------------------------------------------------- Hilfen
  function precisionOf(b) { var step = b.scenarios.primary ? b.scenarios.primary.displayStep : 0.01; return step >= 1 ? 0 : step >= 0.1 ? 1 : 2; }
  function fmtP(v, prec) { return v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toLocaleString("de-DE", { minimumFractionDigits: prec, maximumFractionDigits: prec }); }
  function pct(v) { return v === null || v === undefined || !Number.isFinite(v) ? "–" : S.signed(v * 100, 1) + " %"; }
  function zoneText(z, prec) { return fmtP(z.zoneLow, prec) + " – " + fmtP(z.zoneHigh, prec); }
  function sourceLabel(x) { return { RETRACEMENT: "Retracement", SUPPORT_ZONE: "Support-Zone", RESISTANCE_ZONE: "Widerstandszone", PRICE_ZONE: "Preiszone", VOLATILITY: "ATR", STRUCTURE_BREAK: "Strukturbruch", MEASURED_MOVE: "Measured Move " + (x.ratio || ""), FIB_CLUSTER: "Fib-Cluster", ELLIOTT_PROJECTION: "Elliott-Projektion", RANGE_TOP: "Range-Oberkante", GAP_UP: "Gap", GAP_DOWN: "Gap" }[x.type] || x.type; }
  var LABELS = { BULLISH: "bullisch", BEARISH: "bearisch", NEUTRAL: "neutral", UNDETERMINED: "unbestimmt", RANGE: "Range", MIXED: "gemischt", ACTIVE: "aktiv", AWAITING_TRIGGER: "wartet auf Trigger", WEAKENED: "geschwaecht", INVALIDATED: "invalidiert", CONDITIONAL: "bedingt", NONE: "keine",
                 AWAITING_PULLBACK: "wartet auf Ruecklauf", EXTENDED: "zu weit entfernt", BELOW_ZONE: "unter der Zone", COMPLETE: "vollstaendig", COMPLETE_LOW_RR: "vollstaendig, RR niedrig", INCOMPLETE: "unvollstaendig",
                 STRONG_POSITIVE: "stark positiv", POSITIVE: "positiv", NEGATIVE: "negativ", STRONG_NEGATIVE: "stark negativ", STRONG: "stark", OUTPERFORMING: "outperformt", IN_LINE: "im Gleichschritt", UNDERPERFORMING: "underperformt", WEAK: "schwach", UNAVAILABLE: "nicht verfuegbar",
                 LOW: "niedrig", NORMAL: "normal", HIGH: "hoch", BREAKOUT_VOLUME_UP: "Ausbruchsvolumen (oben)", BREAKOUT_VOLUME_DOWN: "Ausbruchsvolumen (unten)", DRY_UP: "Dry-Up", EXPANSION: "Expansion",
                 OK: "ok", LOW_CONFIDENCE: "niedrige Konfidenz", AMBIGUOUS: "mehrdeutig", TOO_FEW_PIVOTS: "zu wenig Pivots", NO_VALID_STRUCTURE: "keine valide Struktur", FIRST_LEG_ONLY: "nur erstes Leg", CONFIRMED: "bestaetigt", DEVELOPING: "developing", PROJECTED: "projiziert" };
  function label(v) { return v === null || v === undefined ? "–" : (LABELS[v] || String(v).toLowerCase().replace(/_/g, " ")); }
})();
