/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/detail.js

   Die Stock-Discovery-Detailansicht (§5, §6, §7 des Auftrags).

   WIEDERVERWENDUNG STATT ZWEITER ENGINE

   Der grosse Chart ist der BESTEHENDE Technical-Chart
   (QuantCharts.technicalChart aus quant/ui/technical-chart.js). Er nimmt
   Bars, eine Serienkarte und ChartAnnotation-Objekte entgegen - genau das,
   was fuer Ueberlagerungen gebraucht wird. Eine zweite Chart-Engine zu
   bauen waere im Auftrag ausdruecklich ausgeschlossen, und sie waere auch
   sachlich falsch: dann gaebe es zwei Darstellungen derselben Kurse.

   Die Zeitraumleiste kommt aus VUChartRanges - derselben Datei, die auch
   entscheidet, dass 1D und 5D ohne Intraday-Freigabe NICHT verfuegbar
   sind. Ein abgeblendeter Knopf mit Begruendung ist die ehrliche
   Darstellung; ein Tageschart aus Tagesschlusskursen waere eine erfundene.

   Neu ist nur, was es noch nicht gab: die Berechnung der zusaetzlichen
   Ueberlagerungen (EMA, MACD, Bollinger, ATR, relatives Volumen) aus
   discover/engines/indicators.js - zur Laufzeit, auf dem gerade
   sichtbaren Fenster.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var QC = global.QuantCharts;
  var Ranges = global.VUChartRanges;
  var D = global.VUDiscover;
  var el = S.el;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function C() { return D.Cards; }

  /* Welche Ueberlagerungen gibt es, und woraus entstehen sie?
     `source: "indicator"` wird hier gerechnet, `source: "layer"` kommt aus
     dem bestehenden Technical-Bundle und wird nur ein- oder ausgeblendet. */
  var OVERLAYS = [
    { id: "ema20", group: "Gleitende Durchschnitte", label: "EMA 20", source: "indicator", fn: function (I, c) { return I.ema(c, 20); }, style: "ma-ema20" },
    { id: "ema50", group: "Gleitende Durchschnitte", label: "EMA 50", source: "indicator", fn: function (I, c) { return I.ema(c, 50); }, style: "ma-ema50" },
    { id: "ema100", group: "Gleitende Durchschnitte", label: "EMA 100", source: "indicator", fn: function (I, c) { return I.ema(c, 100); }, style: "ma-ema100" },
    { id: "ema200", group: "Gleitende Durchschnitte", label: "EMA 200", source: "indicator", fn: function (I, c) { return I.ema(c, 200); }, style: "ma-ema200" },
    { id: "sma50", group: "Gleitende Durchschnitte", label: "SMA 50", source: "indicator", fn: function (I, c) { return I.sma(c, 50); }, style: "ma-sma50", on: true },
    { id: "sma200", group: "Gleitende Durchschnitte", label: "SMA 200", source: "indicator", fn: function (I, c) { return I.sma(c, 200); }, style: "ma-sma200", on: true },
    { id: "bbUpper", group: "Volatilitaet", label: "Bollinger", source: "indicator", multi: true, style: "bb" },
    { id: "high52w", group: "Marktstruktur", label: "52W Hoch/Tief", source: "level" },
    { id: "SUPPORT_RESISTANCE", group: "Marktstruktur", label: "Support / Resistance", source: "layer" },
    { id: "STRUCTURE", group: "Marktstruktur", label: "Marktstruktur", source: "layer" },
    { id: "FIBONACCI", group: "Marktstruktur", label: "Fibonacci", source: "layer" },
    { id: "ELLIOTT", group: "Technical Intelligence", label: "Elliott Wave (Beta)", source: "layer" }
  ];

  var PANES = [
    { id: "volume", label: "Volumen", on: true },
    { id: "relativeVolume", label: "Rel. Volumen" },
    { id: "rsi", label: "RSI 14" },
    { id: "macd", label: "MACD" },
    { id: "atr", label: "ATR 14" },
    { id: "rs", label: "Relative Staerke" }
  ];

  /* ------------------------------------------------------------- Zustand */
  function createState(detail) {
    return {
      detail: detail,
      range: "1Y",
      overlays: OVERLAYS.reduce(function (acc, o) { acc[o.id] = o.on === true; return acc; }, {}),
      panes: PANES.reduce(function (acc, p) { acc[p.id] = p.on === true; return acc; }, {}),
      bars: null, bundle: null, benchmark: null, loadError: null
    };
  }

  /** Bars aus dem bestehenden Instrument-Payload oder aus der Inline-Reihe. */
  function loadSeries(detail) {
    var series = detail.series || {};
    if (series.source === "technical-instrument" && series.path) {
      return S.loadJSON(series.path).then(function (payload) {
        return { bars: payload.bars, bundle: payload.bundle || null,
                 priceSeriesType: payload.priceSeriesType || null, source: "technical-instrument" };
      });
    }
    if (series.source === "inline" && series.inline) {
      var d = series.inline.daily;
      var w = series.inline.weekly;
      return Promise.resolve({
        bars: { timestamps: d.dates, open: d.open, high: d.high, low: d.low,
                close: d.close, volume: d.volume },
        /* Die Wochenreihe traegt die langen Zeitraeume. Sie hat nur
           Schlusskurse - daraus Kerzen zu zeichnen hiesse, Hoch und Tief
           zu erfinden, also bleibt es dort eine Linie ohne Volumen. */
        weeklyBars: w && w.dates && w.dates.length
          ? { timestamps: w.dates, open: w.close, high: w.close, low: w.close,
              close: w.close, volume: w.close.map(function () { return null; }) }
          : null,
        bundle: null,
        priceSeriesType: series.priceSeriesType || null, source: "inline"
      });
    }
    return Promise.resolve(null);
  }

  /* ------------------------------------------------------------- Aufbau */
  function render(root, detail) {
    var state = createState(detail);
    S.clear(root);

    root.appendChild(header(detail));

    var chartHost = el("div", { class: "d-fade in" });
    root.appendChild(chartHost);
    chartHost.appendChild(C().skeletonRail(3));

    root.appendChild(panels(detail));
    root.appendChild(technicalIntelligencePanel(detail));
    root.appendChild(provenance(detail));

    loadSeries(detail).then(function (loaded) {
      S.clear(chartHost);
      if (!loaded) {
        chartHost.appendChild(noSeriesState(detail));
        return;
      }
      state.bars = loaded.bars;
      state.weeklyBars = loaded.weeklyBars || null;
      state.bundle = loaded.bundle;
      state.priceSeriesType = loaded.priceSeriesType;
      chartHost.appendChild(chartSection(state));
    }).catch(function (err) {
      S.clear(chartHost);
      chartHost.appendChild(C().notice("Kursreihe nicht ladbar",
        "Die Kursreihe konnte nicht geladen werden: " + (err && err.message ? err.message : err)));
    });
  }

  function header(detail) {
    var price = C().valueOf(detail.price);
    var change = C().valueOf(detail.changePercent);
    var priceBlock;

    if (isNum(price)) {
      priceBlock = el("div", { class: "d-detail-price" }, [
        el("b", { text: C().money(price) }),
        el("span", { class: C().toneClass(change),
                     text: isNum(change) ? C().pctPoints(change) + " heute" : "" })
      ]);
    } else {
      /* Kein Preis - und der Grund steht da, wo sonst der Preis stuende. */
      priceBlock = el("div", { class: "d-detail-price" }, [
        el("span", { class: "d-na",
          text: C().STATUS_TEXT[C().statusOf(detail.price)] || "Kein Kurs ausgeliefert" }),
        isNum(detail.metrics.distanceTo52wHigh)
          ? el("b", { style: "font-size:22px;margin-top:6px",
                      text: C().pct(detail.metrics.distanceTo52wHigh) })
          : null,
        isNum(detail.metrics.distanceTo52wHigh)
          ? el("span", { style: "font-weight:600;color:var(--muted)", text: "zum 52-Wochen-Hoch" })
          : null
      ]);
    }

    return el("div", { class: "d-fade in" }, [
      el("a", { class: "d-back", href: "#/", text: "← Discover" }),
      el("div", { class: "d-detail-head" }, [
        el("div", { class: "d-detail-id" }, [
          el("h1", { text: detail.companyName || detail.symbol }),
          el("p", { text: [detail.symbol, detail.exchange, detail.sector,
                           detail.universeLabel].filter(Boolean).join(" · ") })
        ]),
        priceBlock
      ]),
      el("div", { class: "d-badges", style: "margin-top:10px" },
         (detail.badges || []).map(function (b) { return C().badge(b); })),
      detail.dataMode === "mock"
        ? C().notice("Modelltitel",
            "Dieser Titel stammt aus dem synthetischen Vision-Universe-Modelluniversum. " +
            "Kurse, Kennzahlen und Signale sind erzeugt, nicht gemessen - sie zeigen, wie " +
            "Discover rechnet, und sagen nichts ueber einen realen Markt aus.")
        : null,
      detail.discoveryEligible === false
        ? C().notice("Nicht in den Discovery-Zeilen", detail.ineligibleMessage ||
            "Dieser Titel ist von den Discovery-Zeilen ausgenommen.")
        : null
    ]);
  }

  /* -------------------------------------------------------------- Chart */
  function chartSection(state) {
    var wrap = el("section", {});
    var tfBar = el("div", { class: "d-tf", role: "group", "aria-label": "Zeitraum" });
    var chartBox = el("div", { class: "d-chart-box" });
    var overlayBar = el("div", {});
    var paneHost = el("div", {});

    var gates = (global.VUDiscoverMeta && global.VUDiscoverMeta.gates) || {};
    var daily = { eod: barsAsRows(state.bars), intraday: [] };
    var weekly = state.weeklyBars ? { eod: barsAsRows(state.weeklyBars), intraday: [] } : null;

    /* Welche Reihe bedient welchen Zeitraum? Die Tagesreihe, solange sie
       reicht - danach die Wochenreihe. Ein "5J", das stillschweigend nur
       zwei Jahre zeigt, waere der schlimmere Fall: er sieht vollstaendig aus. */
    function sourceFor(rangeId) {
      var mitTag = Ranges.selectRange(rangeId, daily, { gates: gates });
      if (mitTag.ok) {
        var range = Ranges.byId(rangeId);
        var deckt = !range || !range.days ||
          (Date.parse(mitTag.to) - Date.parse(mitTag.from)) / 86400000 >= range.days * 0.9;
        if (deckt || !weekly) return { data: daily, bars: state.bars, selection: mitTag, grain: "daily" };
      }
      if (weekly) {
        var mitWoche = Ranges.selectRange(rangeId, weekly, { gates: gates });
        if (mitWoche.ok) return { data: weekly, bars: state.weeklyBars, selection: mitWoche, grain: "weekly" };
      }
      return { data: daily, bars: state.bars, selection: mitTag, grain: "daily" };
    }

    var bar = Ranges.rangeBar(weekly || daily, { gates: gates });

    bar.forEach(function (r) {
      if (["5D", "6M", "MAX"].indexOf(r.id) !== -1 && r.id !== state.range) return;
      var button = el("button", {
        type: "button", "aria-pressed": String(r.id === state.range),
        disabled: !r.available,
        title: r.available ? "" : (r.message || "Nicht verfuegbar"),
        text: r.id
      });
      button.addEventListener("click", function () {
        if (!r.available) return;
        state.range = r.id;
        S.$$("button", tfBar).forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.textContent === r.id));
        });
        draw();
      });
      tfBar.appendChild(button);
    });

    var unavailable = bar.filter(function (r) { return !r.available && r.reason === "gateDisabled"; });
    wrap.appendChild(tfBar);
    wrap.appendChild(chartBox);
    wrap.appendChild(overlayControls(state, draw, overlayBar));
    wrap.appendChild(paneHost);
    if (unavailable.length) {
      wrap.appendChild(C().notice("Intraday nicht freigeschaltet",
        unavailable[0].message || "Kurze Zeitraeume brauchen Intraday-Daten.", "info"));
    }

    function draw() {
      var chosen = sourceFor(state.range);
      var selection = chosen.selection;
      var activeBars = chosen.bars;
      S.clear(chartBox);
      S.clear(paneHost);
      if (!selection.ok) {
        chartBox.appendChild(C().emptyState("Zeitraum nicht verfuegbar",
          selection.message + (selection.suggestion ? " Verfuegbar waere: " + selection.suggestion + "." : "")));
        return;
      }
      var bounds = sliceBounds(activeBars, selection.from, selection.to);
      var slice = sliceBars(activeBars, bounds);
      var closes = slice.close;
      var I = D.Indicators;

      /* Ueberlagerungen werden auf der VOLLEN Reihe gerechnet und erst
         danach auf das sichtbare Fenster geschnitten. Wer sie nur auf dem
         Fenster rechnet, bekommt einen SMA 200, der im Ein-Jahres-Chart
         erst nach 200 Tagen beginnt - und das sieht aus wie ein Datenloch,
         obwohl die Historie da ist. */
      var full = activeBars.close;
      var cut = function (arr) { return arr.slice(bounds.start, bounds.end + 1); };

      var series = {};
      var annotations = [];
      OVERLAYS.forEach(function (o) {
        if (!state.overlays[o.id]) return;
        if (o.source === "indicator" && o.fn) {
          series[o.id] = cut(o.fn(I, full));
          annotations.push(seriesAnnotation(o.id, o.label, o.style));
        }
      });
      if (state.overlays.bbUpper) {
        var bb = I.bollinger(full, 20, 2);
        series.bbUpper = cut(bb.upper); series.bbLower = cut(bb.lower); series.bbMiddle = cut(bb.middle);
        annotations.push(seriesAnnotation("bbUpper", "Bollinger oben", "bb"));
        annotations.push(seriesAnnotation("bbLower", "Bollinger unten", "bb"));
        annotations.push(seriesAnnotation("bbMiddle", "Bollinger Mitte", "bb-mid"));
      }
      if (state.overlays.high52w) {
        var high = Math.max.apply(null, slice.high.filter(isNum).slice(-252));
        var low = Math.min.apply(null, slice.low.filter(isNum).slice(-252));
        annotations.push(levelAnnotation(high, "52W Hoch", slice.timestamps[0], slice.timestamps[slice.timestamps.length - 1]));
        annotations.push(levelAnnotation(low, "52W Tief", slice.timestamps[0], slice.timestamps[slice.timestamps.length - 1]));
      }
      /* Ebenen aus dem bestehenden Bundle: nur durchgereicht, nichts davon
         wird hier gerechnet. */
      if (state.bundle && state.bundle.annotations) {
        var active = OVERLAYS.filter(function (o) { return o.source === "layer" && state.overlays[o.id]; })
                             .map(function (o) { return o.id; });
        if (active.length) {
          state.bundle.annotations.annotations.forEach(function (a) {
            if ((a.layers || []).some(function (l) { return active.indexOf(l) !== -1; })) annotations.push(a);
          });
        }
      }

      var chart = QC.technicalChart({
        bars: slice, range: "MAX",
        mode: chosen.grain === "daily" && slice.timestamps.length <= 190 ? "candles" : "line",
        series: series, annotations: annotations,
        height: window.innerWidth < 760 ? 320 : 460,
        showVolume: state.panes.volume !== false && chosen.grain === "daily",
        futureBars: 0,
        precision: 2
      });
      chart.classList.add("q-tchart");
      chartBox.appendChild(el("div", { style: "overflow-x:auto" }, [chart]));
      chartBox.appendChild(legend(state, series, chosen.grain));
      if (chosen.grain === "weekly") {
        chartBox.appendChild(el("p", {
          style: "margin:8px 2px 0;font-size:11.5px;color:var(--muted)",
          text: "Dieser Zeitraum wird aus der Wochenreihe gezeichnet: Schlusskurse je Woche, " +
                "kein Volumen und keine Kerzen - Hoch und Tief einer Woche werden nicht " +
                "ausgeliefert und nicht geschaetzt." }));
      }

      renderPanes(state, slice, paneHost, bounds, activeBars);
    }

    draw();
    return wrap;
  }

  function overlayControls(state, redraw, host) {
    var groups = {};
    OVERLAYS.forEach(function (o) { (groups[o.group] = groups[o.group] || []).push(o); });
    S.clear(host);
    Object.keys(groups).forEach(function (name) {
      var row = el("div", { class: "d-ov-group" }, [el("span", { class: "d-ov-label", text: name })]);
      groups[name].forEach(function (o) {
        var disabled = o.source === "layer" && !(state.bundle && state.bundle.annotations);
        var button = el("button", {
          class: "d-ov", type: "button", "aria-pressed": String(!!state.overlays[o.id]),
          disabled: disabled,
          title: disabled ? "Fuer diesen Titel liegt keine vorberechnete Technical-Intelligence-Analyse vor." : "",
          text: o.label
        });
        button.addEventListener("click", function () {
          state.overlays[o.id] = !state.overlays[o.id];
          button.setAttribute("aria-pressed", String(state.overlays[o.id]));
          redraw();
        });
        row.appendChild(button);
      });
      host.appendChild(row);
    });
    var paneRow = el("div", { class: "d-ov-group" }, [el("span", { class: "d-ov-label", text: "Panels" })]);
    PANES.forEach(function (p) {
      var button = el("button", { class: "d-ov", type: "button",
                                  "aria-pressed": String(!!state.panes[p.id]), text: p.label });
      button.addEventListener("click", function () {
        state.panes[p.id] = !state.panes[p.id];
        button.setAttribute("aria-pressed", String(state.panes[p.id]));
        redraw();
      });
      paneRow.appendChild(button);
    });
    host.appendChild(paneRow);
    return host;
  }

  function renderPanes(state, slice, host, bounds, activeBars) {
    var I = D.Indicators;
    var dates = slice.timestamps;
    /* Dieselbe Vorlaufregel wie bei den Ueberlagerungen: RSI, MACD und ATR
       brauchen Bars VOR dem Fenster, sonst beginnt jede Linie bei null. */
    var fullCloses = activeBars.close;
    var cutSeries = function (arr) { return arr.slice(bounds.start, bounds.end + 1); };
    var closes = cutSeries(fullCloses);

    if (state.panes.rsi) {
      var rsi = cutSeries(I.rsi(fullCloses, 14));
      host.appendChild(pane("RSI 14", QC.lineChart({
        dates: dates, height: 120, yDomain: [0, 100],
        series: [{ values: rsi, className: "line-primary" },
                 { values: dates.map(function () { return 70; }), className: "line-muted" },
                 { values: dates.map(function () { return 30; }), className: "line-muted" }],
        yFormat: function (v) { return String(Math.round(v)); },
        title: "RSI 14"
      }), "Ueberkauft ab 70, ueberverkauft unter 30 - eine Konvention, keine Regel."));
    }
    if (state.panes.macd) {
      var macdFull = I.macd(fullCloses, 12, 26, 9);
      var macd = { macd: cutSeries(macdFull.macd), signal: cutSeries(macdFull.signal) };
      host.appendChild(pane("MACD 12/26/9", QC.lineChart({
        dates: dates, height: 130,
        series: [{ values: macd.macd, className: "line-primary" },
                 { values: macd.signal, className: "line-compare" }],
        yFormat: function (v) { return v.toFixed(2); }, title: "MACD"
      }), "MACD-Linie gegen Signallinie. Der Abstand ist das Histogramm."));
    }
    if (state.panes.atr) {
      var atr = cutSeries(I.atr(barsAsRows(activeBars), 14));
      host.appendChild(pane("ATR 14", QC.lineChart({
        dates: dates, height: 110,
        series: [{ values: atr, className: "line-primary" }],
        yFormat: function (v) { return v.toFixed(2); }, title: "ATR"
      }), "Durchschnittliche wahre Handelsspanne - das Mass fuer Bewegungsraum."));
    }
    if (state.panes.relativeVolume) {
      var rv = cutSeries(I.relativeVolume(activeBars.volume, 20));
      host.appendChild(pane("Relatives Volumen", QC.lineChart({
        dates: dates, height: 110,
        series: [{ values: rv, className: "line-primary" },
                 { values: dates.map(function () { return 1; }), className: "line-muted" }],
        yFormat: function (v) { return v.toFixed(1) + "x"; }, title: "Relatives Volumen"
      }), "Tagesvolumen im Verhaeltnis zum eigenen 20-Tage-Schnitt."));
    }
    if (state.panes.rs) {
      host.appendChild(pane("Relative Staerke", null,
        "Die relative Staerke gegenueber Index und Sektor wird periodisch im Build gerechnet " +
        "(Werte im Panel unten). Eine Laufzeitreihe braucht die Benchmark-Kursreihe, und die " +
        "wird fuer dieses Modul nicht ausgeliefert."));
    }
  }

  function pane(title, chart, note) {
    return el("div", { class: "d-chart-box", style: "margin-top:12px" }, [
      el("h3", { style: "margin:0 0 6px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)",
                 text: title }),
      chart,
      note ? el("p", { style: "margin:6px 0 0;font-size:11.5px;color:var(--muted)", text: note }) : null
    ]);
  }

  function legend(state, series, grain) {
    var items = [];
    /* Ein gleitender Durchschnitt zaehlt Bars, nicht Tage. Auf der
       Wochenreihe ist "SMA 50" ein Jahr und kein Quartal - das gehoert in
       die Beschriftung, sonst liest es sich wie dieselbe Linie. */
    var einheit = grain === "weekly" ? " (Wochen)" : "";
    OVERLAYS.forEach(function (o) {
      if (!state.overlays[o.id] || o.source !== "indicator") return;
      items.push(el("span", {}, [el("i", { class: "d-legend-" + o.style }),
                                 document.createTextNode(o.label + einheit)]));
    });
    if (state.overlays.bbUpper) items.push(el("span", {}, [el("i", { class: "d-legend-bb" }), document.createTextNode("Bollinger 20/2")]));
    if (!items.length) return el("div", { class: "d-chart-legend" }, [
      el("span", { text: "Keine Ueberlagerung aktiv" })]);
    return el("div", { class: "d-chart-legend" }, items);
  }

  function seriesAnnotation(ref, label, style) {
    return { annotationId: "d_" + ref, type: "SERIES", layers: ["AUTO"], startTime: null,
             endTime: null, startPrice: null, endPrice: null, label: label, status: "CONFIRMED",
             method: "discover:indicator", degree: null, scenarioId: null, evidenceRef: null,
             confidence: null, semanticStyle: style, zOrder: 5, meta: { seriesRef: ref } };
  }

  function levelAnnotation(price, label, from, to) {
    return { annotationId: "d_level_" + label, type: "LEVEL", layers: ["AUTO"], startTime: from,
             endTime: to, startPrice: price, endPrice: price, label: label, status: "CONFIRMED",
             method: "discover:52w", degree: null, scenarioId: null, evidenceRef: null,
             confidence: null, semanticStyle: "period-level", zOrder: 3, meta: {} };
  }

  function barsAsRows(bars) {
    if (!bars) return [];
    return bars.timestamps.map(function (t, i) {
      return { date: t, open: bars.open[i], high: bars.high[i], low: bars.low[i],
               close: bars.close[i], volume: bars.volume ? bars.volume[i] : null };
    });
  }

  function sliceBounds(bars, from, to) {
    var start = 0, end = bars.timestamps.length - 1;
    for (var i = 0; i < bars.timestamps.length; i++) {
      if (bars.timestamps[i] >= from) { start = i; break; }
    }
    for (var j = bars.timestamps.length - 1; j >= 0; j--) {
      if (bars.timestamps[j] <= to) { end = j; break; }
    }
    return { start: start, end: end };
  }

  function sliceBars(bars, bounds) {
    var start = bounds.start, end = bounds.end;
    var cut = function (a) { return a ? a.slice(start, end + 1) : []; };
    return { timestamps: cut(bars.timestamps), open: cut(bars.open), high: cut(bars.high),
             low: cut(bars.low), close: cut(bars.close), volume: cut(bars.volume) };
  }

  function noSeriesState(detail) {
    var series = detail.series || {};
    return el("div", { style: "margin-top:18px" }, [
      C().notice("Keine Kursreihe in dieser Auslieferung",
        series.message || "Fuer diesen Titel wird keine Kursreihe ausgeliefert."),
      el("div", { class: "d-chart-box", style: "margin-top:12px" }, [
        el("h3", { style: "margin:0 0 10px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)",
                   text: "52-Wochen-Spanne" }),
        C().rangeBar(detail.metrics),
        el("p", { style: "margin:10px 0 0;font-size:12.5px;color:var(--muted)",
          text: "Die Position in der Jahresspanne entsteht ausschliesslich aus den beiden " +
                "ausgelieferten Abstaenden zum Hoch und zum Tief - ohne ein absolutes Kursniveau." })
      ])
    ]);
  }

  /* ------------------------------------------------------------- Panels */
  function panels(detail) {
    var m = detail.metrics;
    var grid = el("div", { class: "d-grid d-fade" });

    grid.appendChild(scorePanel("Market Leadership", detail.scores.leadership,
      m.leadershipPercentile, detail.ranks.universeSize, detail.universeLabel));
    grid.appendChild(scorePanel("Momentum", detail.scores.momentum,
      m.momentumPercentile, detail.ranks.universeSize, detail.universeLabel));
    grid.appendChild(scorePanel("Relative Staerke", detail.scores.relativeStrength,
      m.relativeStrengthPercentile, detail.ranks.universeSize, detail.universeLabel));

    grid.appendChild(el("div", { class: "d-panel" }, [
      el("h3", { text: "Rendite" }),
      el("div", { class: "d-kv" }, [
        kv("1 Monat", m.return1M), kv("3 Monate", m.return3M),
        kv("6 Monate", m.return6M), kv("12 Monate", m.return12M),
        kv("12-1 Monate", m.return12M1M)
      ])
    ]));

    grid.appendChild(el("div", { class: "d-panel" }, [
      el("h3", { text: "Relative Staerke gegen Benchmark" }),
      el("div", { class: "d-kv" }, [
        kv("1 Monat", m.relativeStrength1M), kv("3 Monate", m.relativeStrength3M),
        kv("6 Monate", m.relativeStrength6M), kv("12 Monate", m.relativeStrength12M)
      ]),
      el("p", { text: "Differenz der Log-Renditen gegenueber der Benchmark - dieselbe Definition " +
                      "wie in der bestehenden Relative-Strength-Engine." })
    ]));

    grid.appendChild(el("div", { class: "d-panel" }, [
      el("h3", { text: "Marktstruktur" }),
      el("div", { class: "d-kv" }, [
        kv("Zum 52W-Hoch", m.distanceTo52wHigh), kv("Zum 52W-Tief", m.distanceTo52wLow),
        kv("Max. Drawdown 252T", m.maxDrawdown252d), kv("Volatilitaet 252T", m.volatility252d),
        kvRaw("Trendstruktur", isNum(m.trendAlignment)
          ? Math.round(m.trendAlignment * 4) + " von 4 Durchschnitten ueberschritten" : "–"),
        kvRaw("Volumen 20/60", isNum(m.volumeRatio20over60) ? m.volumeRatio20over60.toFixed(2) + "x" : "–")
      ])
    ]));

    if (detail.ranks.sector) {
      grid.appendChild(el("div", { class: "d-panel" }, [
        el("h3", { text: "Sektorrang" }),
        el("div", { class: "big", text: "#" + detail.ranks.sector.rank }),
        el("p", { text: "von " + detail.ranks.sector.of + " Titeln in " + detail.ranks.sector.sector +
                        " (nach Leadership Score, innerhalb von " + detail.universeLabel + ")." })
      ]));
    }
    return grid;
  }

  function scorePanel(title, score, percentile, universeSize, universeLabel) {
    var node = el("div", { class: "d-panel" }, [el("h3", { text: title })]);
    if (!score || score.status !== "SCORED" || !isNum(score.score)) {
      node.appendChild(el("div", { class: "big d-na", text: "INCOMPLETE" }));
      node.appendChild(el("p", { text: (score && score.reason) ||
        "Nicht genug Kennzahlen fuer einen belastbaren Score." }));
      return node;
    }
    node.appendChild(el("div", { class: "big", text: String(Math.round(score.score)) }));
    node.appendChild(el("p", { text: (isNum(percentile)
      ? "Perzentil " + Math.round(percentile) + " von " + universeSize + " Titeln in " + universeLabel + ". "
      : "") + "Abdeckung " + Math.round((score.coverage || 0) * 100) + " %." }));

    var bars = el("div", { class: "d-bars" });
    (score.contributions || []).forEach(function (c) {
      var missing = c.status !== "CALCULATED";
      bars.appendChild(el("div", { class: "d-bar" + (missing ? " missing" : "") }, [
        el("span", { text: c.label, title: c.label }),
        el("div", { class: "track" }, [
          el("i", { style: "width:" + (missing ? 100 : Math.round((c.normalized || 0) * 100)) + "%" })
        ]),
        el("b", { text: missing ? "fehlt" : Math.round((c.normalized || 0) * 100) + "%" })
      ]));
    });
    node.appendChild(bars);
    node.appendChild(el("p", { text: "Gewichte und Schwellen stehen in " +
      "discover/methodology/discover-v1.json. Der Score ist eine relative Kennzahl, keine Wahrscheinlichkeit." }));
    return node;
  }

  function kv(label, value) {
    return el("div", {}, [
      el("span", { text: label }),
      el("b", { class: C().toneClass(value), text: C().pct(value) })
    ]);
  }
  function kvRaw(label, text) {
    return el("div", {}, [el("span", { text: label }), el("b", { text: text })]);
  }

  /* ------------------------------------------- Technical Intelligence (§7) */
  function technicalIntelligencePanel(detail) {
    var ti = detail.technicalIntelligence || { layers: {} };
    var wave = ti.layers.elliottWave || { status: "unavailable" };
    var labels = { available: "Verfuegbar", lowConfidence: "Geringe Konfidenz",
                   calculating: "Wird berechnet", unavailable: "Nicht verfuegbar" };

    var body = [
      el("div", { class: "d-ti-head" }, [
        el("h3", { style: "margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)",
                   text: "Technical Intelligence — Elliott Wave" }),
        el("span", { class: "d-ti-state d-ti-state--" + wave.status,
                     text: labels[wave.status] || wave.status })
      ])
    ];

    if (wave.status === "available" || wave.status === "lowConfidence") {
      body.push(el("p", { style: "margin:10px 0 0;font-size:14px",
        text: [wave.currentWave ? "Welle " + wave.currentWave : null,
               wave.patternType, wave.degreeScale ? "Skala " + wave.degreeScale : null]
              .filter(Boolean).join(" · ") }));
      body.push(el("div", { class: "d-kv" }, [
        kvRaw("Method Fit", isNum(wave.confidence) ? wave.confidence + " / 100" : "–"),
        kvRaw("Engine", wave.sourceEngine || "–"),
        kvRaw("Repainting", wave.repaintingPolicy || "–"),
        kvRaw("Stand", wave.asOf || "–")
      ]));
    } else {
      body.push(el("p", { style: "margin:10px 0 0;font-size:12.5px;color:var(--muted)",
        text: wave.message || "Fuer diesen Titel liegt keine Wellenzaehlung vor." }));
    }

    body.push(el("p", { style: "margin:10px 0 0;font-size:11.5px;color:var(--muted-2);line-height:1.55",
      text: wave.disclaimer ||
        "Elliott Wave wird ausschliesslich aus der bestehenden Vision-Universe-Engine gelesen. " +
        "Discover erzeugt keine eigene Wellenzaehlung - eine erfundene Zaehlung waere schlimmer " +
        "als keine, weil sie richtig aussieht." }));

    var other = [];
    ["marketStructure", "supportResistance"].forEach(function (key) {
      var layer = ti.layers[key];
      if (!layer) return;
      other.push(kvRaw(key === "marketStructure" ? "Marktstruktur" : "Support / Resistance",
        layer.status === "available"
          ? (key === "marketStructure" ? (layer.state || "verfuegbar") : layer.zones + " Zonen")
          : "nicht verfuegbar"));
    });
    if (other.length) body.push(el("div", { class: "d-kv" }, other));

    return el("section", { class: "d-ti d-fade" }, body);
  }

  function provenance(detail) {
    var series = detail.series || {};
    return el("section", { class: "d-foot d-fade" }, [
      el("div", {}, [
        el("b", { text: "Datenherkunft: " }),
        document.createTextNode([
          detail.dataMode === "real" ? "reale Marktdaten (" + (detail.provider || "Anbieter") + ")"
                                     : "synthetisches Modelluniversum",
          "Stand " + (detail.asOf || "unbekannt"),
          "Universum " + detail.universeLabel,
          series.available ? "Kursreihe: " + (series.priceSeriesType || "unbekannt")
                           : "keine Kursreihe ausgeliefert",
          detail.dataQuality ? "Datenqualitaet " + detail.dataQuality : null
        ].filter(Boolean).join(" · "))
      ]),
      el("div", { style: "margin-top:6px" }, [
        el("b", { text: "Methodik: " }),
        document.createTextNode(detail.methodologyVersion + " · Contract " + detail.contractVersion)
      ]),
      el("div", { style: "margin-top:6px" }, [document.createTextNode(detail.disclaimer || "")])
    ]);
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Detail = { render: render, OVERLAYS: OVERLAYS, PANES: PANES };
})(window);
