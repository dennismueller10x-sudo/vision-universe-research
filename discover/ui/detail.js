/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/detail.js

   Die Stock-Detailansicht.

   Aufbau in Kapiteln statt in Kacheln:

     1. Kopf          Name, Signale, Leadership Score, Kurs oder dessen Grund
     2. Warum hier?   deterministische Begruendung aus discover/engines/narrative.js
     3. Chart         gross, mit Zeitraeumen und Ueberlagerungen
     4. Kennzahlen    Scores mit ihrer Herleitung
     5. Technical     Elliott/Struktur, gelesen aus der bestehenden Engine
     6. Weiter        wo der Titel sonst steht, und wer ihm nahesteht

   WIEDERVERWENDUNG STATT ZWEITER ENGINE

   Der grosse Chart ist der BESTEHENDE Technical-Chart
   (QuantCharts.technicalChart). Er wird nicht nachgebaut, sondern in eine
   dunkle Flaeche gestellt; seine Farben kommen aus CSS-Variablen, die im
   Discover-Stylesheet dunkel belegt werden. Die Zeitraumleiste kommt aus
   VUChartRanges - derselben Datei, die auch entscheidet, dass 1T und 1W
   ohne Intraday-Freigabe nicht verfuegbar sind.
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

  /* Schnellzugriff und "Erweitert": die Leiste zeigt sechs Schalter, nicht
     sechzehn. Alles weitere liegt eine Ebene tiefer (§13). */
  var OVERLAYS = [
    { id: "ema20", group: "quick", label: "EMA 20", source: "indicator", style: "ma-ema20",
      fn: function (I, c) { return I.ema(c, 20); } },
    /* Keine Linie ist von Haus aus an.

       Vorher lagen SMA 50 und SMA 200 auf jedem Chart, bevor jemand
       danach gefragt hatte, und darunter lief ein rot-gruenes
       Volumenhistogramm. Das ist die Voreinstellung einer
       Handelsoberflaeche: dort weiss man, was diese Linien bedeuten. Auf
       einer Seite, die jemand oeffnet, um zu sehen wie sich eine Aktie
       entwickelt hat, sind sie Laerm. Sie sind nicht verschwunden - sie
       liegen einen Klick entfernt unter "Werkzeuge". */
    { id: "sma50", group: "quick", label: "SMA 50", source: "indicator", style: "ma-sma50",
      fn: function (I, c) { return I.sma(c, 50); } },
    { id: "sma200", group: "quick", label: "SMA 200", source: "indicator", style: "ma-sma200",
      fn: function (I, c) { return I.sma(c, 200); } },
    { id: "bbUpper", group: "quick", label: "Bollinger", source: "indicator", multi: true, style: "bb" },
    { id: "high52w", group: "quick", label: "52W-Level", source: "level" },
    { id: "SUPPORT_RESISTANCE", group: "quick", label: "Struktur", source: "layer" },

    { id: "ema50", group: "more", label: "EMA 50", source: "indicator", style: "ma-ema50",
      fn: function (I, c) { return I.ema(c, 50); } },
    { id: "ema100", group: "more", label: "EMA 100", source: "indicator", style: "ma-ema100",
      fn: function (I, c) { return I.ema(c, 100); } },
    { id: "ema200", group: "more", label: "EMA 200", source: "indicator", style: "ma-ema200",
      fn: function (I, c) { return I.ema(c, 200); } },
    { id: "STRUCTURE", group: "more", label: "Marktstruktur", source: "layer" },
    { id: "FIBONACCI", group: "more", label: "Fibonacci", source: "layer" },
    { id: "ELLIOTT", group: "more", label: "Elliott (Beta)", source: "layer" }
  ];

  var PANES = [
    { id: "volume", label: "Volumen" },
    { id: "rsi", label: "RSI 14" },
    { id: "macd", label: "MACD" },
    { id: "relativeVolume", label: "Rel. Volumen" },
    { id: "atr", label: "ATR 14" }
  ];

  function createState(detail) {
    return {
      detail: detail, range: "1Y",
      overlays: OVERLAYS.reduce(function (acc, o) { acc[o.id] = o.on === true; return acc; }, {}),
      panes: PANES.reduce(function (acc, p) { acc[p.id] = p.on === true; return acc; }, {}),
      bars: null, weeklyBars: null, bundle: null, mehrOffen: false,
      /* V4 §12-15: Verbraucher-Chart zuerst (Linie, Zeitraum, Kurs); der
         Analyse-Chart (Kerzen, Volumen, Overlays) ist ein Werkzeug. */
      dailyPoints: null, weeklyPoints: null, seriesAsOf: null, pro: false,
      /* Der Tagesverlauf aus dem Live-Hub (Snapshot + Beschriftung). */
      intraday: null, redraw: null
    };
  }

  /* Das Live-Abonnement der Aktienseite - eines je Seite, gekuendigt,
     sobald die naechste Seite gezeichnet wird. */
  var detailAbo = null;
  var detailResize = null;

  /* V4 §13: die lange Wochenreihe (5J, Max) aus der Historienablage, wenn
     der Build sie am Titel nennt. Fehlt sie, bleiben 5J und Max ehrlich
     gesperrt - nichts wird aus einem Jahr auf fuenf gestreckt. */
  function langeReihe(series) {
    if (!series.long || !series.long.path) return Promise.resolve(null);
    var Loader = D.SeriesLoader;
    var holen = Loader ? Loader.get(series.long.path) : S.loadJSON(series.long.path);
    return holen.catch(function () { return null; });
  }
  function wochenPunkte(lang, daily) {
    var SS = global.VUQuant && global.VUQuant.SeriesSampling;
    if (!SS) return null;
    if (lang && Array.isArray(lang.points) && lang.points.length) return SS.mergeWeeklyWithDaily(lang.points, daily || []);
    return null;
  }
  function punkteAlsBars(punkte) {
    var close = punkte.map(function (p) { return p[1]; });
    return { timestamps: punkte.map(function (p) { return p[0]; }), open: close.slice(), high: close.slice(),
             low: close.slice(), close: close, volume: close.map(function () { return null; }) };
  }

  function loadSeries(detail) {
    var series = detail.series || {};
    if (series.source === "technical-instrument" && series.path) {
      return Promise.all([S.loadJSON(series.path), langeReihe(series)]).then(function (teile) {
        var payload = teile[0], lang = teile[1];
        var b = payload.bars || {};
        var daily = (b.timestamps || []).map(function (t, i) { return [String(t).slice(0, 10), b.close[i]]; });
        var wochen = wochenPunkte(lang, daily);
        return { bars: payload.bars, bundle: payload.bundle || null,
                 dailyPoints: daily, weeklyPoints: wochen, weeklyBars: wochen ? punkteAlsBars(wochen) : null,
                 priceSeriesType: payload.priceSeriesType || null,
                 asOf: daily.length ? daily[daily.length - 1][0] : null };
      });
    }
    /* Kompakte Reihe (ein Jahr Tagesschluss): dieselbe Datei wie der
       Micro-Chart der Karte. Sie traegt nur Schlusskurse - Open/High/Low
       sind deshalb der Schluss, Volumen fehlt, und 5J/Max bleiben
       gesperrt, weil die Reihe sie nicht hergibt. */
    if (series.source === "discover-series" && series.path) {
      var Loader = D.SeriesLoader;
      var holen = Loader ? Loader.get(series.path) : S.loadJSON(series.path);
      return Promise.all([holen, langeReihe(series)]).then(function (teile) {
        var reihe = teile[0], lang = teile[1];
        var dates = reihe.points.map(function (p) { return p[0]; });
        var close = reihe.points.map(function (p) { return p[1]; });
        var wochen = wochenPunkte(lang, reihe.points);
        return { bars: { timestamps: dates, open: close.slice(), high: close.slice(), low: close.slice(),
                         close: close, volume: close.map(function () { return null; }) },
                 dailyPoints: reihe.points, weeklyPoints: wochen,
                 weeklyBars: wochen ? punkteAlsBars(wochen) : null, bundle: null,
                 priceSeriesType: reihe.priceSeriesType || null, closeOnly: true, asOf: reihe.asOf || reihe.to || null };
      });
    }
    if (series.source === "inline" && series.inline) {
      var d = series.inline.daily, w = series.inline.weekly;
      return Promise.resolve({
        bars: { timestamps: d.dates, open: d.open, high: d.high, low: d.low,
                close: d.close, volume: d.volume },
        weeklyBars: w && w.dates && w.dates.length
          ? { timestamps: w.dates, open: w.close, high: w.close, low: w.close,
              close: w.close, volume: w.close.map(function () { return null; }) }
          : null,
        bundle: null, priceSeriesType: series.priceSeriesType || null
      });
    }
    return Promise.resolve(null);
  }

  /* =================================================================== */
  function render(root, detail, options) {
    options = options || {};
    var state = createState(detail);
    S.clear(root);
    if (detailAbo) { detailAbo(); detailAbo = null; }
    if (detailResize) { global.removeEventListener("resize", detailResize); detailResize = null; }
    /* Der grosse Chart ist pixelgenau gezeichnet: dreht sich das Telefon,
       wird er neu gezeichnet (entprellt). */
    var letzteBreite = global.innerWidth, resizeTimer = null;
    detailResize = function () {
      if (global.innerWidth === letzteBreite) return;
      letzteBreite = global.innerWidth;
      if (resizeTimer) global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(function () { if (state.redraw) state.redraw(); }, 180);
    };
    global.addEventListener("resize", detailResize);

    /* Die Farbwelt des Titels steht am Kopf der Seite und hoert weiter
       unten auf. Das ist keine Laune: oben wird entdeckt, unten wird
       gelesen. Ein Chart, um den herum eine Kategoriefarbe leuchtet,
       faerbt die Lektuere - und ein RSI ist nicht blau, weil der Titel ein
       Marktfuehrer ist. Die Regel steckt deshalb im Markup: das Attribut
       haengt am Kopfbereich, nicht am ganzen Dokument. */
    var welt = detail.world || null;
    if (welt) root.setAttribute("data-world", welt);
    else root.removeAttribute("data-world");

    root.appendChild(el("a", { class: "dx-back", href: "#/u/" + (options.universeId || "US_REAL") }, [
      document.createTextNode("← Discover")
    ]));
    root.appendChild(hero(detail));

    /* Die Reihenfolge der Seite ist das Produkt.

       Zuerst der Kurs und sein Verlauf - das ist die Frage, mit der
       jemand eine Aktienseite oeffnet. Dann in einem Satz, warum dieser
       Titel ueberhaupt auffaellt. Dann vier Worte zum Unternehmen und zur
       Aktie. Dann beide Seiten der Waage. Dann die Geschaeftszahlen. Und
       erst danach, fuer den, der so weit liest, die Analyse mit allem,
       was gerechnet wurde.

       Frueher stand die Beweisfuehrung an dritter Stelle und der Chart an
       vierter. Das ist die Reihenfolge eines Berichts, nicht die einer
       Seite, die jemand zum ersten Mal sieht. */
    var chartHost = el("section", { class: "dx-chapter dx-chapter--chart dx-fade" });
    root.appendChild(chartHost);
    chartHost.appendChild(el("h2", { text: "Kursverlauf" }));
    chartHost.appendChild(el("div", { class: "dx-chart", style: "height:320px" }));

    /* Ein Kapitel, das fuer diesen Titel nichts zu sagen hat (kein Signal,
       keine Belege), gibt null zurueck - und faellt dann weg, statt die
       Seite zu Fall zu bringen. Im grossen Universum ist das der
       Normalfall fuer viele Titel ohne Discovery-Signal. */
    /* Die Streaming-Reihenfolge (Auftrag §36): Kopf, warum interessant,
       Kurs, in 30 Sekunden, das Unternehmen, damals vs. heute, die
       Entwicklung, heute, Bewertung, dafuer und dagegen, dann Quant und
       Technik, dann die naechste Aktie. */
    /* V4.1 §23: Kopf, Kurs, grosser Chart, warum interessant, in 30
       Sekunden, das Geschaeft in Klartext, die grosse Fundamental Journey,
       das Unternehmen in Zahlen (Cluster), damals vs. heute, Bewertung,
       Chancen und Risiken, weiter entdecken - und erst dann die Analyse. */
    var DF = D.DetailFundamentals || {};
    var kapitel = function (node) { if (node) root.appendChild(node); };
    kapitel(why(detail));
    kapitel(ueberblick(detail));
    kapitel(unternehmen(detail));
    if (DF.journey) kapitel(DF.journey(detail));
    if (DF.heute) kapitel(DF.heute(detail));
    if (DF.damalsHeute) kapitel(DF.damalsHeute(detail));
    if (DF.bewertung) kapitel(DF.bewertung(detail));
    kapitel(waage(detail));

    /* Ab hier die Analyse. Der Anfaenger muss nicht hierher; der Profi
       kommt mit einem Wisch. V4.1 §25: auf dem Telefon ist sie
       zugeklappt (ein Tipp oeffnet sie), am Schreibtisch offen - nichts
       davon ist geloescht, es steht nur nach dem Verstehen. */
    var analyse = el("details", { class: "dx-analyse dx-fade" }, [kapitelTrenner()]);
    var telefon = !!(global.matchMedia && global.matchMedia("(max-width: 860px)").matches);
    if (!telefon) analyse.open = true;
    [belege(detail), panels(detail), technicalIntelligence(detail)].forEach(function (node) {
      if (node) analyse.appendChild(node);
    });
    kapitel(analyse);
    kapitel(continueDiscovery(detail, options));
    if (DF.nextDiscovery) kapitel(DF.nextDiscovery(detail, options));
    kapitel(provenance(detail));

    /* Der Tagesverlauf kommt aus demselben Hub wie die Karte: ein Strom je
       Titel. Er wird abgewartet, bevor der Chart entsteht - damit der
       Standard-Zeitraum 1T ist, wenn es einen gibt, und 1J, wenn nicht. */
    var Hub = D.LiveHub;
    var liveErst = new Promise(function (resolve) {
      if (!Hub || !Hub.enabled() || detail.dataMode !== "real") { resolve(null); return; }
      var erledigt = false;
      /* Die Aktienseite ist der EINZIGE Ort, der den Strom benutzt
         (Zero-Cost Realtime V1 §6). live() beginnt mit demselben
         Snapshot wie subscribe() - der Chart ist also nie leer - und
         schreibt danach fort, falls ein Strom zustande kommt. Kommt
         keiner, ist das hier Zeile fuer Zeile das alte Verhalten. */
      detailAbo = (Hub.live || Hub.subscribe)(detail.symbol, function (p) {
        state.intraday = p.snapshot ? p : null;
        if (!erledigt) { erledigt = true; resolve(state.intraday); return; }
        if (state.redraw && state.range === "1D") state.redraw();
      });
      /* Ein Hub, der nicht antwortet, haelt die Seite nicht auf. */
      global.setTimeout(function () { if (!erledigt) { erledigt = true; resolve(null); } }, 4000);
    });

    Promise.all([loadSeries(detail), liveErst]).then(function (teile) {
      var loaded = teile[0];
      S.clear(chartHost);
      /* Ohne Kursreihe heisst das Kapitel nicht "Kursverlauf" - es zeigt
         keinen. Es zeigt die Wertentwicklung ueber vier Zeitraeume. */
      var hatChart = !!loaded || !!state.intraday;
      chartHost.appendChild(el("h2", { text: hatChart ? "Kursverlauf" : "Wertentwicklung" }));
      if (!hatChart) { chartHost.appendChild(noSeries(detail)); return; }
      if (loaded) {
        state.bars = loaded.bars;
        state.weeklyBars = loaded.weeklyBars || null;
        state.bundle = loaded.bundle;
        state.dailyPoints = loaded.dailyPoints || null;
        state.weeklyPoints = loaded.weeklyPoints || null;
        state.seriesAsOf = loaded.asOf || null;
      }
      if (state.intraday) state.range = "1D";
      else if (!loaded) { chartHost.appendChild(noSeries(detail)); return; }
      chartHost.appendChild(chartSection(state));
    }).catch(function (err) {
      S.clear(chartHost);
      chartHost.appendChild(C().note("Kursreihe nicht ladbar",
        "Die Kursreihe konnte nicht geladen werden: " + (err && err.message ? err.message : err)));
    });
  }

  /* ------------------------------------------------------------- Kopf */
  function hero(detail) {
    var preis = C().valueOf(detail.price);
    var change = C().valueOf(detail.changePercent);
    var m = detail.metrics;

    var text = detail.plain || (D.Klartext ? D.Klartext.karte(detail, {}) : {});

    /* Ebene 2 beginnt mit dem, was auf der Karte stand - und fuehrt es
       weiter. Rechts steht deshalb nicht mehr der Leadership Score (eine
       Zahl auf einer Skala, die niemand kennt), sondern der Kurs, wo er
       ausgeliefert werden darf, sonst die grosse Klartext-Zahl. Der Score
       steht weiter unten im Kapitel fuer die Analyse. */
    var rechts = isNum(preis)
      ? el("div", { class: "dx-price" }, [
          el("b", { class: "num", text: C().money(preis) }),
          el("span", { class: C().toneClass(change),
                       /* Schluss gegen Vortagesschluss - am Wochenende ist das nicht "heute". */
                       text: isNum(change) ? C().pctPoints(change) + " zum Vortag" : "" })
        ])
      : (text.zahl
          ? el("div", { class: "dx-price" }, [
              el("b", { class: "num " + (text.zahl.ton || ""), text: text.zahl.wert }),
              el("span", { style: "color:var(--discover-muted);font-weight:600",
                           text: text.zahl.label }),
              el("small", { text: C().STATUS_TEXT[C().statusOf(detail.price)] ||
                                  "Kein Kurs ausgeliefert" })
            ])
          : el("div", { class: "dx-price" }, [
              el("small", { text: C().STATUS_TEXT[C().statusOf(detail.price)] ||
                                  "Kein Kurs ausgeliefert" })
            ]));

    /* Die Zeitachse: dieselben Renditen, als Zeile gelesen. Vier Zahlen,
       die jeder einordnen kann - und der Einstieg in alles Weitere. */
    var achse = (detail.zeitachse && detail.zeitachse.length)
      ? detail.zeitachse
      : (D.Klartext ? D.Klartext.zeitachse(detail) : []);
    var zeitleiste = achse.length
      ? el("div", { class: "dx-zeitachse" }, achse.map(function (e) {
          return el("div", {}, [
            el("span", { text: e.label }),
            el("b", { class: "num " + (isNum(e.roh) ? C().toneClass(e.roh) : ""), text: e.wert })
          ]);
        }))
      : null;

    return el("section", { class: "dx-dhero dx-fade in", "data-world": detail.world || null }, [
      el("div", { class: "dx-dhero-bg" }),
      /* Dasselbe Datenbild wie auf dem Poster, nur groesser - damit die
         Seite nicht bei null anfaengt, sondern dort weitermacht, wo man
         geklickt hat. */
      D.Artwork ? el("div", { class: "dx-dhero-art", "aria-hidden": "true" }, [
        C().lazyArtwork(detail, { width: 720, height: 220, ticker: false, scale: "hero", range: "1J" })
      ]) : null,
      el("div", { class: "dx-dhero-inner" }, [
        el("div", {}, [
          el("h1", { text: detail.companyName || detail.symbol }),
          el("p", { class: "dx-dhero-meta" }, [detail.symbol, detail.exchange, detail.sector,
                                               detail.universeLabel]
            .filter(Boolean).map(function (t) { return el("span", { text: t }); })),
          /* V4 §19: Index-Mitgliedschaft mit Herkunft und Stichtag - aus den
             veroeffentlichten Fondsbestaenden, nicht geraten. */
          Array.isArray(detail.indexMemberships) && detail.indexMemberships.length
            ? el("p", { class: "dx-index-badges" }, detail.indexMemberships.map(function (ix) {
                return el("span", { class: "dx-index-badge",
                  title: ix.indexName + " – Mitglied laut " + (ix.proxy ? "Bestand des Fonds " + ix.proxy : "Liste des Indexeigentümers") +
                         ", Stichtag " + C().dateShort(ix.asOf) + (isNum(ix.weight) ? ", Gewicht " + ix.weight.toFixed(2).replace(".", ",") + " %" : "") },
                  [document.createTextNode(ix.shortLabel || ix.indexId)]);
              }))
            : null,
          text.story ? el("p", { class: "dx-dhero-story" }, [
            el("i", { class: "dx-story-dot", "aria-hidden": "true" }),
            document.createTextNode(text.story)
          ]) : null,
          /* Fundamentaler Kontext im Kopf: ein Satz aus den Jahresabschluessen,
             mit den Geschaeftsjahren, aus denen er stammt (nie ohne). */
          detail.hook && detail.hook.text ? el("p", { class: "dx-dhero-hook" }, [
            el("i", { class: "dx-hook-mark", "aria-hidden": "true" }),
            document.createTextNode(detail.hook.text),
            el("span", { class: "dx-hero-hook-src", text: "Geschäftsjahre " + detail.hook.from + "–" + detail.hook.to })
          ]) : null,
          el("div", { class: "dx-dhero-sigs" },
             (detail.badges || []).map(function (b) { return C().signalChip(b); }))
        ]),
        el("div", { class: "dx-dhero-right" }, [rechts])
      ]),
      zeitleiste,
      detail.jahresspanne ? spanne(detail) : null,
      detail.dataMode === "mock"
        ? el("div", { style: "position:relative;margin-top:22px" }, [
            C().note("Modelltitel",
              "Dieser Titel stammt aus dem synthetischen Vision-Universe-Modelluniversum. " +
              "Kurse, Kennzahlen und Signale sind erzeugt, nicht gemessen.", "warm")
          ])
        : null,
      detail.discoveryEligible === false
        ? el("div", { style: "position:relative;margin-top:22px" }, [
            C().note("Nicht in den Discovery-Reihen", detail.ineligibleMessage || "")
          ])
        : null
    ]);
  }

  /**
   * Die Jahresspanne als Band.
   *
   * Zwei Zahlen - Abstand zum Hoch, Abstand zum Tief - ergeben eine Lage,
   * und eine Lage sieht man schneller, als man sie liest. Der Satz
   * darunter sagt dasselbe noch einmal in Worten: die Position ist damit
   * nie nur grafisch codiert.
   */
  function spanne(detail) {
    var j = detail.jahresspanne;
    return el("div", { class: "dx-spanne" }, [
      el("div", { class: "dx-spanne-bar" }, [
        el("i", { style: "left:" + (Math.max(0, Math.min(1, j.position)) * 100).toFixed(1) + "%" })
      ]),
      el("div", { class: "dx-spanne-enden" }, [
        el("span", { text: "Jahrestief" }),
        el("span", { text: "Jahreshoch" })
      ]),
      el("p", { text: j.satz })
    ]);
  }

  /**
   * Der Marktstruktur-Zustand als Satz.
   *
   * Die bestehende Engine liefert hier ein Objekt - Regime, Labels des
   * letzten Hochs und Tiefs, Pivots mit Kursniveaus. Frueher stand dieses
   * Objekt ungefiltert in der Zeile und der Browser schrieb dafuer
   * "[object Object]". Gelesen werden deshalb genau die drei Felder, die
   * eine Aussage tragen; die Pivotkurse bleiben aussen vor - sie waeren
   * absolute Kursniveaus, und die gehoeren nicht in eine Uebersicht.
   */
  function strukturText(state) {
    if (!state || typeof state !== "object") return "verfügbar";
    var REGIME = { BULLISH: "Aufwärtsstruktur", BEARISH: "Abwärtsstruktur",
                   NEUTRAL: "keine klare Struktur", RANGE: "Seitwärtsspanne" };
    var teile = [];
    var regime = state.confirmedRegime || state.regime;
    if (regime) teile.push(REGIME[regime] || String(regime));
    if (state.lastHighLabel && state.lastLowLabel) {
      teile.push(state.lastHighLabel + "/" + state.lastLowLabel);
    }
    return teile.length ? teile.join(" · ") : "verfügbar";
  }

  /* --------------------------------------------- Warum ist er hier? (§12) */
  /**
   * "Warum steht diese Aktie hier?" - auf Ebene 2 EIN Satz.
   *
   * Vorher stand hier ein Raster aus fuenf Befunden: Leadership Score,
   * Perzentil, Vorsprung gegen die Benchmark, Momentum Score. Alles
   * richtig gerechnet, alles belegt - und alles unverstaendlich fuer
   * jemanden, der die Begriffe nicht kennt. Der Befund ist nicht
   * verschwunden: er steht vollstaendig ein Kapitel tiefer, unter
   * "Die Belege". Hier oben steht der Satz, den man lesen kann, ohne
   * etwas nachzuschlagen.
   */
  function why(detail) {
    var befund = D.Narrative.explain(detail);
    var section = el("section", { class: "dx-why dx-fade" }, [
      el("h2", { text: "Warum " + (detail.companyName || detail.symbol) + " hier steht" })
    ]);

    if (befund.empty) {
      section.appendChild(el("p", { class: "dx-why-empty", text: befund.emptyMessage }));
      return section;
    }

    var satz = D.Klartext ? D.Klartext.begruendung(detail, detail.plain) : null;
    section.appendChild(el("p", { class: "dx-why-lead", text: satz || befund.headline.text }));
    return section;
  }

  /* ------------------------------------------------ Die Aktie in 30 Sekunden */
  /**
   * Vier Worte und vier Zahlen.
   *
   * Das ist die Sektion, die den Unterschied zwischen einem Datenblatt und
   * einem Produkt ausmacht: Wachstum, Bewertung, Trend, Risiko - jeweils
   * als Wort, das jeder versteht, mit der Zahl daneben, aus der es folgt.
   * Wo die Grundlage fehlt, steht das Wort nicht da, sondern der Grund.
   *
   * "Was bedeutet das?" klappt die Erklaerung auf. Nicht als Tooltip an
   * jedem Wort - sondern einmal je Begriff, dort wo er zum ersten Mal
   * auftaucht.
   */
  function ueberblick(detail) {
    if (!D.Einordnung) return null;
    var daten = D.Einordnung.ueberblick(detail);
    var name = detail.companyName || detail.symbol;
    var section = el("section", { class: "dx-chapter dx-fade" }, [
      el("h2", { text: name + " in 30 Sekunden" })
    ]);

    var gitter = el("div", { class: "dx-30" });
    /* Profitabilitaet, Cashflow, Bilanz, Verwaesserung aus den
       Jahresabschluessen (detail-fundamentals.js) - nur wo Daten vorliegen. */
    /* Die fundamentalen Einordnungen (Profitabilitaet, Cashflow, Bilanz)
       stehen in V4.1 auf den Zahlen-Karten; hier nur, wenn es die Karten
       fuer diesen Titel nicht gibt. */
    var DF = D.DetailFundamentals;
    var f = detail.fundamentals;
    var hatCluster = !!(f && f.available && f.latest && f.latest.available);
    var zusatz = !hatCluster && DF && DF.healthZeilen ? DF.healthZeilen(detail) : [];
    var zeilen = daten.zeilen.slice(0, 2).concat(zusatz).concat(daten.zeilen.slice(2));
    zeilen.forEach(function (z) {
      var erklaerung = D.Einordnung.erklaerung(z.id);
      var zelle = el("div", { class: "dx-30-zelle" + (z.wert ? "" : " dx-30-zelle--leer") }, [
        el("span", { class: "dx-30-label", text: z.label }),
        z.wert
          ? el("b", { class: "dx-30-wert " + (z.ton || ""), text: z.wert })
          : el("b", { class: "dx-30-wert dx-30-wert--leer", text: "Keine Angabe" }),
        el("span", { class: "dx-30-beleg", text: z.beleg || z.fehlt || "" })
      ]);
      if (z.wert && erklaerung) {
        var auf = el("details", { class: "dx-was" }, [
          el("summary", { text: "Was bedeutet das?" }),
          el("p", { text: erklaerung })
        ]);
        zelle.appendChild(auf);
      }
      gitter.appendChild(zelle);
    });
    section.appendChild(gitter);
    return section;
  }

  /* ------------------------------------------------------------- Die Waage */
  /**
   * Dafuer und dagegen - aber ohne Meinung.
   *
   * Jede Zeile ist eine Beobachtung mit ihrer Zahl. Die Sektion sagt
   * ausdruecklich, dass sie keine Empfehlung ist; das ist kein
   * Kleingedrucktes, sondern der Unterschied zwischen Einordnung und Rat.
   */
  function waage(detail) {
    if (!D.Einordnung) return null;
    var w = D.Einordnung.waage(detail);
    /* Belegte Chancen und Risiken aus den Fundamentals dazu (ohne Dopplung). */
    var DF = D.DetailFundamentals;
    if (DF && DF.waageZeilen) {
      var extra = DF.waageZeilen(detail);
      var ids = {}; w.dafuer.concat(w.beachten).forEach(function (e) { ids[e.id] = true; });
      extra.dafuer.forEach(function (e) { if (!ids[e.id]) w.dafuer.push(e); });
      extra.beachten.forEach(function (e) { if (!ids[e.id]) w.beachten.push(e); });
    }
    if (!w.dafuer.length && !w.beachten.length) return null;

    /* V4.1 §24: kompakt. Drei Punkte je Seite stehen offen - jeder mit
       seinem Beleg; was darueber hinausgeht, liegt hinter "Weitere
       Punkte", statt die Seite zu einer Liste zu machen. */
    var OFFEN = 3;
    function punkt(e, art) {
      return el("li", {}, [
        el("i", { class: "dx-waage-marke", "aria-hidden": "true",
                  text: art === "pro" ? "+" : "−" }),
        el("div", {}, [
          el("b", { text: e.text }),
          e.beleg ? el("span", { text: e.beleg }) : null
        ])
      ]);
    }
    function spalte(titel, eintraege, art) {
      var host = el("div", { class: "dx-waage-spalte dx-waage-spalte--" + art }, [
        el("h3", { text: titel })
      ]);
      var liste = el("ul", {});
      eintraege.slice(0, OFFEN).forEach(function (e) { liste.appendChild(punkt(e, art)); });
      host.appendChild(liste);
      var rest = eintraege.slice(OFFEN);
      if (rest.length) {
        var mehr = el("ul", {});
        rest.forEach(function (e) { mehr.appendChild(punkt(e, art)); });
        host.appendChild(el("details", { class: "dx-weitere dx-waage-weitere" }, [
          el("summary", { text: "Weitere Punkte (" + rest.length + ")" }),
          mehr
        ]));
      }
      return host;
    }

    return el("section", { class: "dx-chapter dx-fade" }, [
      el("p", { class: "dx-kicker", text: "Chancen und Risiken" }),
      el("h2", { text: "Was dafür spricht — und was dagegen" }),
      el("div", { class: "dx-waage" }, [
        spalte("Das spricht dafür", w.dafuer, "pro"),
        spalte("Das sollte man beachten", w.beachten, "contra")
      ]),
      el("p", { class: "dx-kapitel-fuss", text: w.hinweis })
    ]);
  }

  /* --------------------------------------------------------- Das Unternehmen */
  /**
   * Umsatz, Gewinn, Marge - in der Sprache, in der man darueber redet.
   *
   * Fuer 493 der 498 realen Titel liefert der Anbieter keine
   * Geschaeftszahlen. Dann steht hier kein leeres Raster und kein
   * Platzhalter, sondern ein Satz, der sagt, was fehlt und warum.
   */
  function unternehmen(detail) {
    var g = detail.geschaeftszahlen;
    if (!g) return null;
    var name = detail.companyName || detail.symbol;
    var section = el("section", { class: "dx-chapter dx-fade" }, [
      el("p", { class: "dx-kicker", text: "Das Unternehmen" }),
      el("h2", { text: "Was macht " + name + "?" })
    ]);
    /* Womit die Firma Geld verdient (redaktionell) und wo sie steht. */
    var beschreibung = [detail.was || null, detail.sector ? "Sektor " + detail.sector : null, detail.industry ? "Branche " + detail.industry : null,
                        detail.exchange ? "Notiert an der " + detail.exchange : null].filter(Boolean);
    if (beschreibung.length) section.appendChild(el("p", { class: "dx-chapter-lead", text: beschreibung.join(" · ") }));
    else section.appendChild(el("p", { class: "dx-chapter-lead dx-why-empty", text: "Für diesen Titel ist keine Beschreibung des Geschäfts hinterlegt — erfunden wird keine." }));
    if (g.status !== "CALCULATED") {
      section.appendChild(el("p", { class: "dx-why-empty",
        text: g.message || "Für diesen Titel liegen keine Geschäftszahlen vor. Vision Universe " +
              "zeigt nur, was aus der Kursreihe folgt — und nicht mehr." }));
      return section;
    }

    var K = D.Klartext;
    var fu = detail.fundamentals;
    if (fu && fu.available && fu.latest && fu.latest.available) {
      /* Die Zahlen stehen auf den Karten "Das Unternehmen in Zahlen". */
      return section;
    }
    var zahlen = [
      { label: g.basis === "FY" ? "Umsatz (Geschäftsjahr)" : "Umsatz (12 Monate)", wert: geld(g.umsatzTTM),
        zusatz: isNum(g.umsatzWachstum) ? K.prozent(g.umsatzWachstum) + (g.basis === "FY" ? " gegenüber dem Vorjahr" : " gegenüber den zwölf Monaten davor") : null,
        ton: tonVon(g.umsatzWachstum) },
      { label: g.basis === "FY" ? "Gewinn (Geschäftsjahr)" : "Gewinn (12 Monate)", wert: geld(g.gewinnTTM),
        zusatz: isNum(g.gewinnWachstum) ? K.prozent(g.gewinnWachstum) + (g.basis === "FY" ? " gegenüber dem Vorjahr" : " gegenüber den zwölf Monaten davor") : null,
        ton: tonVon(g.gewinnWachstum) },
      { label: "Vom Umsatz bleibt als Gewinn", wert: isNum(g.marge) ? K.prozent(g.marge, false) : "–",
        zusatz: null, ton: null },
      g.kgvStatus === "CALCULATED"
        ? { label: "Kurs-Gewinn-Verhältnis", wert: String(Math.round(g.kgv * 10) / 10).replace(".", ","),
            zusatz: "Das Wievielfache des Jahresgewinns die Aktie kostet", ton: null }
        : null,
      isNum(g.dividendenRendite)
        ? { label: "Dividendenrendite", wert: K.prozent(g.dividendenRendite, false),
            zusatz: null, ton: null }
        : null
    ].filter(Boolean);

    var gitter = el("div", { class: "dx-firma" });
    zahlen.forEach(function (z) {
      gitter.appendChild(el("div", {}, [
        el("span", { text: z.label }),
        el("b", { class: "num", text: z.wert }),
        z.zusatz ? el("em", { class: z.ton || "", text: z.zusatz }) : null
      ]));
    });
    section.appendChild(gitter);
    section.appendChild(el("p", { class: "dx-kapitel-fuss dx-kapitel-fuss--link" }, [
      document.createTextNode((g.basis === "TTM" ? "Zwölfmonatswerte aus den vier jüngsten Quartalen" : "Geschäftsjahr " + (g.zeitraum && g.zeitraum.fy ? g.zeitraum.fy : "")) + " · "),
      el("a", { href: "#/daten", text: "Daten & Quellen" })
    ]));
    return section;
  }

  function tonVon(v) { return isNum(v) ? (v > 0 ? "up" : (v < 0 ? "down" : "")) : ""; }

  /* Millionen, wie man sie ausspricht: 302.969 Mio. $ liest niemand,
     303 Mrd. $ schon. */
  function geld(millionen) {
    if (!isNum(millionen)) return "–";
    var v = millionen;
    if (Math.abs(v) >= 1000) {
      return (Math.round(v / 100) / 10).toFixed(1).replace(".", ",") + " Mrd. $";
    }
    return Math.round(v) + " Mio. $";
  }

  /* Die Grenze zwischen Verstehen und Analysieren. Sie ist sichtbar,
     damit niemand aus Versehen in Ebene 3 landet und denkt, er habe
     etwas nicht verstanden. */
  function kapitelTrenner() {
    return el("summary", { class: "dx-trenner" }, [
      el("span", { text: "Ab hier: die Analyse" }),
      el("p", { text: "Alle Kennzahlen, aus denen die Einordnungen oben entstehen — " +
                      "Scores, Perzentile und technische Lage." }),
      el("b", { class: "dx-trenner-schalter", "aria-hidden": "true" })
    ]);
  }

  /**
   * Dieselben Befunde ausfuehrlich - Ebene 3.
   *
   * Hier darf stehen, was oben nicht stehen durfte: Score, Perzentil,
   * Vorsprung gegen die Benchmark, und der Gegenpunkt dazu. Wer bis
   * hierher gescrollt hat, will genau das.
   */
  function belege(detail) {
    var befund = D.Narrative.explain(detail);
    if (befund.empty) return null;
    var section = el("section", { class: "dx-chapter dx-fade" }, [
      el("h2", { text: "Die Belege" }),
      el("p", { class: "dx-kapitel-lead", text: befund.headline.text })
    ]);

    var grid = el("div", { class: "dx-why-grid" });
    befund.reasons.forEach(function (reason) {
      grid.appendChild(el("div", { class: "dx-why-item" }, [
        el("h3", { text: reason.title }),
        el("p", { text: reason.text })
      ]));
    });
    befund.counterpoints.forEach(function (punkt) {
      grid.appendChild(el("div", { class: "dx-why-item dx-why-item--counter" }, [
        el("h3", { text: punkt.title + " — dagegen" }),
        el("p", { text: punkt.text })
      ]));
    });
    section.appendChild(grid);
    section.appendChild(el("p", { class: "dx-kapitel-fuss", text: "Jeder Satz folgt aus einer Kennzahl und einer festen Schwelle — kein Sprachmodell, kein Befund ohne Zahl." }));
    return section;
  }

  /* ------------------------------------------------------------- Chart */
  function chartSection(state) {
    var wrap = el("div", {});
    var tf = el("div", { class: "dx-tf", role: "group", "aria-label": "Zeitraum" });
    var chartBox = el("div", { class: "dx-chart" });
    var controls = el("div", {});
    var paneHost = el("div", {});

    var gates = (global.VUDiscoverMeta && global.VUDiscoverMeta.gates) || {};
    /* Der Tagesverlauf als Zeilen fuer die Zeitraum-Engine: sie entscheidet
       damit, ob 1T verfuegbar ist - dieselbe Regel wie ueberall (Gate vor
       Daten). Gezeichnet wird 1T aus dem Snapshot selbst. */
    var intradayRows = intradayAlsZeilen(state.intraday);
    var daily = { eod: state.bars ? barsAsRows(state.bars) : [], intraday: intradayRows };
    var weekly = state.weeklyBars ? { eod: barsAsRows(state.weeklyBars), intraday: intradayRows } : null;

    function quelleFuer(rangeId) {
      var mitTag = Ranges.selectRange(rangeId, daily, { gates: gates });
      if (mitTag.ok) {
        var range = Ranges.byId(rangeId);
        var deckt = !range || !range.days ||
          (Date.parse(mitTag.to) - Date.parse(mitTag.from)) / 86400000 >= range.days * 0.9;
        if (deckt || !weekly) return { bars: state.bars, selection: mitTag, grain: "daily" };
      }
      if (weekly) {
        var mitWoche = Ranges.selectRange(rangeId, weekly, { gates: gates });
        if (mitWoche.ok) return { bars: state.weeklyBars, selection: mitWoche, grain: "weekly" };
      }
      return { bars: state.bars, selection: mitTag, grain: "daily" };
    }

    /* V4 §13: die Zeitraeume, in denen ein Mensch denkt. 1T aus dem
       Tagesverlauf (Gate vor Daten, wie ueberall), 1W bis 1J aus der
       Tagesreihe, 5J und Max aus der Wochenreihe - jeder Zeitraum nur, wenn
       die Reihe ihn wirklich traegt. Ein gesperrter Knopf sagt, warum. */
    var SS = global.VUQuant && global.VUQuant.SeriesSampling;
    var engineLeiste = Ranges.rangeBar(weekly || daily, { gates: gates });
    var eintag = engineLeiste.filter(function (r) { return r.id === "1D"; })[0] || { id: "1D", label: "1T", available: false, message: "Kein Tagesverlauf" };
    var leiste = [eintag].concat(verbraucherZeitraeume(state, SS));
    leiste.forEach(function (r) {
      var knopf = el("button", { type: "button", text: r.label,
        "aria-pressed": String(r.id === state.range), disabled: !r.available,
        title: r.available ? "" : (r.message || "Nicht verfügbar") });
      knopf.addEventListener("click", function () {
        if (!r.available) return;
        state.range = r.id;
        Array.prototype.forEach.call(tf.children, function (b) {
          b.setAttribute("aria-pressed", String(b.textContent === r.label));
        });
        zeichnen();
        if (D.Analytics && D.Analytics.track) D.Analytics.track("detail:range", { symbol: state.detail.symbol, range: r.id });
      });
      tf.appendChild(knopf);
    });
    /* Wenn der Standard-Zeitraum nicht verfuegbar ist, der erste verfuegbare. */
    if (!leiste.some(function (r) { return r.id === state.range && r.available; })) {
      var erster = leiste.filter(function (r) { return r.available; })[0];
      if (erster) { state.range = erster.id; Array.prototype.forEach.call(tf.children, function (b) { b.setAttribute("aria-pressed", String(b.textContent === erster.label)); }); }
    }

    wrap.appendChild(el("div", { class: "dx-chart-head" }, [tf]));
    wrap.appendChild(chartBox);
    /* Die Werkzeuge sind zugeklappt. Wer sie braucht, findet sie in einer
       Zeile; wer sie nicht kennt, wird von ihnen nicht aufgehalten. */
    var werkzeuge = el("details", { class: "dx-werkzeuge" }, [
      el("summary", { text: "Chart-Werkzeuge" })
    ]);
    werkzeuge.appendChild(controls);
    werkzeuge.appendChild(paneHost);
    wrap.appendChild(werkzeuge);

    var gesperrt = leiste.filter(function (r) { return !r.available && r.reason === "gateDisabled"; });
    if (gesperrt.length) {
      /* Eigener Text statt des Engine-Wortlauts: derselbe Inhalt, aber in
         der Schreibweise dieser Oberfläche. Der Grund der Engine steht am
         Knopf (title) und bleibt damit nachlesbar. */
      wrap.appendChild(el("p", { class: "dx-inline-note", style: "margin-left:0;margin-right:0" }, [
        el("b", { text: "Intraday nicht freigeschaltet · " }),
        document.createTextNode("Der Tagesverlauf braucht Kursdaten im Minutentakt. " +
          "Die sind derzeit nicht freigeschaltet, und aus Tagesschlusskursen lässt sich " +
          "kein Tagesverlauf bauen — einer, der so aussähe, wäre erfunden.")
      ]));
    }

    function zeichnen() {
      state.redraw = zeichnen;
      if (state.range === "1D") { zeichneIntraday(state, chartBox, paneHost, controls); return; }
      if (!state.pro || state.range === "1W") { zeichneVerbraucher(state, chartBox, paneHost, controls, zeichnen); return; }
      var gewaehlt = quelleFuer(state.range);
      var selection = gewaehlt.selection;
      var aktiveBars = gewaehlt.bars;
      S.clear(chartBox);
      S.clear(paneHost);
      if (!selection.ok) {
        chartBox.appendChild(C().emptyState("Zeitraum nicht verfügbar",
          selection.message + (selection.suggestion ? " Verfügbar wäre: " + selection.suggestion + "." : "")));
        return;
      }

      var grenzen = sliceBounds(aktiveBars, selection.from, selection.to);
      var slice = sliceBars(aktiveBars, grenzen);
      var I = D.Indicators;
      var voll = aktiveBars.close;
      var cut = function (arr) { return arr.slice(grenzen.start, grenzen.end + 1); };

      var series = {}, annotations = [];
      OVERLAYS.forEach(function (o) {
        if (!state.overlays[o.id] || o.source !== "indicator" || !o.fn) return;
        series[o.id] = cut(o.fn(I, voll));
        annotations.push(seriesAnnotation(o.id, o.label, o.style));
      });
      if (state.overlays.bbUpper) {
        var bb = I.bollinger(voll, 20, 2);
        series.bbUpper = cut(bb.upper); series.bbLower = cut(bb.lower); series.bbMiddle = cut(bb.middle);
        annotations.push(seriesAnnotation("bbUpper", "Bollinger oben", "bb"));
        annotations.push(seriesAnnotation("bbLower", "Bollinger unten", "bb"));
        annotations.push(seriesAnnotation("bbMiddle", "Bollinger Mitte", "bb-mid"));
      }
      if (state.overlays.high52w) {
        var hoch = Math.max.apply(null, slice.high.filter(isNum).slice(-252));
        var tief = Math.min.apply(null, slice.low.filter(isNum).slice(-252));
        annotations.push(levelAnnotation(hoch, "52W Hoch", slice.timestamps[0],
                                         slice.timestamps[slice.timestamps.length - 1]));
        annotations.push(levelAnnotation(tief, "52W Tief", slice.timestamps[0],
                                         slice.timestamps[slice.timestamps.length - 1]));
      }
      if (state.bundle && state.bundle.annotations) {
        var ebenen = OVERLAYS.filter(function (o) { return o.source === "layer" && state.overlays[o.id]; })
                             .map(function (o) { return o.id; });
        if (ebenen.length) {
          state.bundle.annotations.annotations.forEach(function (a) {
            if ((a.layers || []).some(function (l) { return ebenen.indexOf(l) !== -1; })) annotations.push(a);
          });
        }
      }

      var chart = QC.technicalChart({
        bars: slice, range: "MAX",
        mode: gewaehlt.grain === "daily" && slice.timestamps.length <= 190 ? "candles" : "line",
        series: series, annotations: annotations,
        height: global.innerWidth < 860 ? 300 : 480,
        showVolume: state.panes.volume !== false && gewaehlt.grain === "daily",
        futureBars: 0, precision: 2
      });
      chart.classList.add("q-tchart");
      chartBox.appendChild(chart);
      var legendeNode = legend(state, gewaehlt.grain);
      if (legendeNode) chartBox.appendChild(legendeNode);
      if (gewaehlt.grain === "weekly") {
        chartBox.appendChild(el("p", { style: "margin:4px 10px 10px;font-size:11.5px;color:var(--discover-dim)",
          text: "Dieser Zeitraum wird aus der Wochenreihe gezeichnet: Schlusskurse je Woche, " +
                "kein Volumen und keine Kerzen — Hoch und Tief einer Woche werden nicht " +
                "ausgeliefert und nicht geschätzt." }));
      }
      S.clear(controls);
      controls.appendChild(controlBar(state, zeichnen));
      renderPanes(state, slice, paneHost, grenzen, aktiveBars);
    }

    zeichnen();
    return wrap;
  }

  /* Der Tagesverlauf auf der Aktienseite: derselbe Renderer wie auf der
     Karte (ein Chart-Engine fuer Intraday), groesser und mit Zeitachse.
     Keine Overlays: gleitende Durchschnitte ueber 5-Minuten-Kurse waeren
     andere Kennzahlen als die der Tagesreihe, und der Werkzeugkasten
     bleibt deshalb zu. */
  var VERBRAUCHER_ZEITRAEUME = [
    { id: "1W", label: "1W", quelle: "daily", wort: "in einer Woche", tage: 7 },
    { id: "1M", label: "1M", quelle: "daily", wort: "in einem Monat", tage: 31 },
    { id: "6M", label: "6M", quelle: "daily", wort: "in sechs Monaten", tage: 183 },
    { id: "1Y", label: "1J", quelle: "daily", wort: "in einem Jahr", tage: 366 },
    { id: "5Y", label: "5J", quelle: "weekly", wort: "in fünf Jahren", tage: 1827 },
    { id: "MAX", label: "Max", quelle: "weekly", wort: "seit Beginn der Reihe", tage: null }
  ];
  function tageZwischen(a, b) { return (Date.parse(b) - Date.parse(a)) / 86400000; }
  function verbraucherZeitraeume(state, SS) {
    var daily = state.dailyPoints || [], weekly = state.weeklyPoints || null;
    return VERBRAUCHER_ZEITRAEUME.map(function (z) {
      var out = { id: z.id, label: z.label, available: false, message: null };
      if (!SS) { out.message = "Zeitraum-Engine nicht geladen"; return out; }
      var punkte = z.quelle === "weekly" ? (weekly || null) : daily;
      if (z.id === "MAX") {
        punkte = weekly || daily;
        out.available = punkte.length >= 5;
        if (!out.available) out.message = "Keine Kursreihe";
        return out;
      }
      if (!punkte || punkte.length < 2) { out.message = z.quelle === "weekly" ? "Für diesen Titel liegt noch keine lange Kursreihe vor." : "Keine Kursreihe"; return out; }
      var deckung = tageZwischen(punkte[0][0], punkte[punkte.length - 1][0]);
      /* Ein Zeitraum ist verfuegbar, wenn die Reihe mindestens 60 % davon
         traegt; bei weniger sagt der Knopf, wie weit sie reicht. */
      if (deckung >= z.tage * 0.6) out.available = true;
      else out.message = "Die Kursreihe reicht nur " + Math.round(deckung) + " Tage zurück (ab " + C().dateShort(punkte[0][0]) + ").";
      return out;
    });
  }

  /* Der Verbraucher-Chart: eine Linie, der Kurs, die Veraenderung im
     Zeitraum, das Datum. Kein Rahmen, kein Werkzeugkasten, keine Fachbegriffe.
     Farbe folgt der Welt, aus der man kommt; Gruen und Rot bleiben den Zahlen. */
  function zeichneVerbraucher(state, chartBox, paneHost, controls, redraw) {
    var SS = global.VUQuant && global.VUQuant.SeriesSampling, MC = D.MicroChart;
    S.clear(chartBox); S.clear(paneHost); S.clear(controls);
    var z = VERBRAUCHER_ZEITRAEUME.filter(function (x) { return x.id === state.range; })[0] || VERBRAUCHER_ZEITRAEUME[3];
    var punkte = z.quelle === "weekly" ? (state.weeklyPoints || state.dailyPoints || []) : (state.dailyPoints || []);
    if (z.id === "MAX") punkte = state.weeklyPoints || state.dailyPoints || [];
    if (!SS || !MC || !MC.renderRange || punkte.length < 2) {
      chartBox.appendChild(C().emptyState("Zeitraum nicht verfügbar", "Für diesen Zeitraum liegt keine Kursreihe vor."));
      return;
    }
    var sel = SS.sliceRange(punkte, z.id, punkte[punkte.length - 1][0]);
    if (sel.points.length < 2) { chartBox.appendChild(C().emptyState("Zeitraum nicht verfügbar", "Zu wenige Kurse im Zeitraum.")); return; }
    var erster = sel.points[0][1], letzter = sel.points[sel.points.length - 1][1];
    var veraenderung = erster > 0 ? (letzter / erster - 1) * 100 : null;
    var mobil = global.innerWidth < 860;
    /* Kopf: der Kurs, die Veraenderung im Zeitraum, das Datum - mit
       Frische-Zustand der Tagesreihe (Freshness-Vertrag, Tagesreihen). */
    var kopf = el("div", { class: "dx-chart-hero" }, [
      el("div", { class: "dx-chart-hero-preis" }, [
        el("b", { class: "num", text: C().money(letzter) }),
        el("span", { class: "num " + C().toneClass(veraenderung), text: isNum(veraenderung) ? prozentGross(veraenderung) : "" }),
        el("span", { class: "dx-chart-hero-wort", text: z.wort })
      ]),
      el("div", { class: "dx-chart-hero-meta" }, [
        el("span", { class: "dx-chart-hero-span", text: C().dateShort(sel.from) + " – " + C().dateShort(sel.to) +
          (z.quelle === "weekly" ? " · Wochenschlusskurse" : " · Tagesschlusskurse") + " · split-bereinigt" }),
        frischeTages(state)
      ])
    ]);
    chartBox.appendChild(kopf);
    /* V4.1 §5: der Chart ist die Hauptflaeche. Die viewBox ist pixelgenau
       (Breite des Kastens, Hoehe als Anteil des Bildschirms), damit die
       Schrift nicht mitskaliert und die Linie auf dem Telefon so hoch ist
       wie ein halber Bildschirm. */
    var mass = chartMass(chartBox, mobil);
    var svgNode = MC.renderRange(sel.points, { width: mass.w, height: mass.h, symbol: state.detail.symbol,
                                                 range: z.id, label: z.wort, grain: z.quelle });
    if (svgNode && svgNode.getAttribute("data-scale") === "log") {
      kopf.querySelector(".dx-chart-hero-span").textContent += " · logarithmische Kursachse";
    }
    var rahmen = el("div", { class: "dx-range-chart-wrap", "data-range": z.id, "data-grain": z.quelle,
                             "data-direction": svgNode ? svgNode.getAttribute("data-direction") : null });
    rahmen.appendChild(svgNode);
    chartBox.appendChild(rahmen);
    beruehrung(svgNode, kopf, {
      preis: function (pt) { return C().money(pt.close); },
      delta: function (pt) { return erster > 0 ? (pt.close / erster - 1) * 100 : null; },
      wann: function (pt) { return C().dateShort(pt.date); },
      wort: z.wort
    });
    if (!sel.complete) {
      chartBox.appendChild(el("p", { class: "dx-intraday-note", text: "Die Kursreihe beginnt am " + C().dateShort(sel.from) + " — der Zeitraum ist deshalb kürzer als gewählt." }));
    }
    controls.appendChild(controlBar(state, redraw));
  }

  /* "Schluss Montag" / "Schluss Fr., 11.09. · nicht aktuell" - die Frische
     der Tagesreihe aus demselben Vertrag wie der Tagesverlauf. */
  function frischeTages(state) {
    var Hub = D.LiveHub, FR = global.VURealtime && global.VURealtime.Freshness;
    var asOf = state.seriesAsOf;
    if (!asOf || !FR || !Hub || !Hub.resolution) return null;
    var r = Hub.resolution();
    if (!r) return null;
    var meta = (global.VUDiscoverMeta && global.VUDiscoverMeta.realtime && global.VUDiscoverMeta.realtime.intraday) || {};
    var f = FR.assess({ resolution: r, series: { to: asOf, asOf: asOf }, kind: "daily", now: new Date(),
                        options: meta.freshness ? { graceHours: meta.freshness.graceHours, graceMinutes: meta.freshness.graceMinutes } : null });
    return el("span", { class: "dx-live-label dx-live-label--" + f.label.tone, "data-freshness": f.freshnessState,
                        title: f.freshnessState === "STALE" ? "Die Tagesreihe ist älter als der letzte Handelstag (" + f.expectedSessionDate + ")." : "" },
      [el("i", { "aria-hidden": "true" }), document.createTextNode(f.label.label)]);
  }

  /* "+27,8 %" bis 100, darueber ohne Nachkommastellen und mit
     Tausenderpunkt: "+545.625 %" statt "+545625,00 %". */
  function prozentGross(v) {
    var abs = Math.abs(v);
    var text = abs >= 100 ? Math.round(abs).toLocaleString("de-DE") : abs.toFixed(abs >= 10 ? 1 : 2).replace(".", ",");
    return (v > 0 ? "+" : v < 0 ? "−" : "") + text + " %";
  }

  /* Die Ortszeit der Boerse zu einem Zeitstempel - dieselbe Sprache, in
     der die Punkte des Snapshots stehen ("10:15"). */
  function ortszeit(iso, zone) {
    try {
      return new Intl.DateTimeFormat("de-DE", { timeZone: zone || "America/New_York",
                                                hour: "2-digit", minute: "2-digit", hour12: false })
        .format(new Date(iso));
    } catch (err) { return null; }
  }

  /**
   * Der Snapshot, fortgeschrieben um den laufenden Kurs - falls es einen
   * gibt und er frisch ist.
   *
   * Was hier passiert und was nicht: der letzte Punkt der Reihe wird
   * ersetzt oder ein neuer angehaengt. Dazwischen wird nichts
   * interpoliert, nichts geglaettet und nichts erfunden. Das Original
   * bleibt unangetastet - gezeichnet wird eine Kopie.
   *
   * Die Zahl ist eine Kursreferenz aus einem Teilmarkt (Tiingo IEX,
   * Stufe 6), kein Abschluss. Deshalb steht sie in derselben Reihe wie
   * die Bars desselben Anbieters und derselben Boerse - und nirgends
   * steht "Last Trade".
   */
  function mitLaufendemKurs(p) {
    var snap = p && p.snapshot;
    var live = p && p.live;
    if (!snap || !live || !live.fresh || !isNum(live.price) || snap.regularComplete) return snap;
    var zeit = ortszeit(live.at, snap.timezone);
    if (!zeit) return snap;
    var punkte = (snap.points || []).slice();
    var letzter = punkte.length ? punkte[punkte.length - 1] : null;
    if (letzter && String(letzter[0]) > zeit) return snap;      /* Nachzuegler: nichts tun */
    if (letzter && String(letzter[0]) === zeit) punkte[punkte.length - 1] = [zeit, live.price];
    else punkte.push([zeit, live.price]);
    var kopie = {};
    Object.keys(snap).forEach(function (k) { kopie[k] = snap[k]; });
    kopie.points = punkte;
    kopie.pointCount = punkte.length;
    kopie.asOf = live.at;
    kopie.asOfLocal = zeit;
    kopie.streaming = true;
    return kopie;
  }

  function zeichneIntraday(state, chartBox, paneHost, controls) {
    var MC = D.MicroChart;
    var p = state.intraday;
    S.clear(chartBox); S.clear(paneHost); S.clear(controls);
    if (!p || !p.snapshot || !MC || !MC.renderIntraday) {
      chartBox.appendChild(C().emptyState("Kein Tagesverlauf",
        "Für diesen Titel liegt kein Tagesverlauf vor."));
      return;
    }
    var mobil = global.innerWidth < 860;
    var snap = mitLaufendemKurs(p);
    /* Kopf wie beim Zeitraum-Chart: letzter Kurs, Veraenderung gegen den
       Vortagesschluss, das Wort dazu - eine Sprache fuer alle Zeitraeume. */
    var punkte = (snap.points || []).filter(function (x) { return x && isNum(x[1]); });
    var letzterKurs = punkte.length ? punkte[punkte.length - 1][1] : null;
    var basis = isNum(snap.previousClose) ? snap.previousClose : (punkte.length ? punkte[0][1] : null);
    var tagesDelta = isNum(letzterKurs) && isNum(basis) && basis > 0 ? (letzterKurs / basis - 1) * 100 : null;
    var kopf = el("div", { class: "dx-chart-hero" }, [
      el("div", { class: "dx-chart-hero-preis" }, [
        el("b", { class: "num", text: isNum(letzterKurs) ? C().money(letzterKurs) : "" }),
        el("span", { class: "num " + C().toneClass(tagesDelta), text: isNum(tagesDelta) ? prozentGross(tagesDelta) : "" }),
        el("span", { class: "dx-chart-hero-wort", text: snap.regularComplete ? "am " + C().dateShort(snap.sessionDate) : "heute" })
      ]),
      el("div", { class: "dx-chart-hero-meta" }, [
        el("span", { class: "dx-chart-hero-span", text: (isNum(snap.previousClose) ? "seit Vortagesschluss " + C().money(snap.previousClose) : "seit dem ersten Kurs des Tages") + " · 5-Minuten-Kurse" }),
        C().liveLabel(p.label, snap)
      ])
    ]);
    chartBox.appendChild(kopf);
    var mass = chartMass(chartBox, mobil);
    var svgNode = MC.renderIntraday(snap, { width: mass.w, height: mass.h,
                                            axis: true, symbol: state.detail.symbol,
                                            label: p.label && p.label.label });
    if (!svgNode) {
      chartBox.appendChild(C().emptyState("Kein Tagesverlauf", "Der Snapshot dieses Titels ist unvollständig."));
      return;
    }
    svgNode.classList.add("dx-intraday-chart");
    var rahmen = el("div", { class: "dx-intraday",
                             "data-live": snap.regularComplete ? "complete" : (snap.streaming ? "streaming" : "running"),
                             "data-freshness": (p.freshness && p.freshness.freshnessState) || "",
                             "data-direction": svgNode.getAttribute("data-direction") });
    rahmen.appendChild(svgNode);
    chartBox.appendChild(rahmen);
    beruehrung(svgNode, kopf, {
      preis: function (pt) { return C().money(pt.close); },
      delta: function (pt) { return isNum(basis) && basis > 0 ? (pt.close / basis - 1) * 100 : null; },
      wann: function (pt) { return pt.time + " New York"; },
      wort: snap.regularComplete ? "am " + C().dateShort(snap.sessionDate) : "heute"
    });
    var text = " · 5-Minuten-Kurse · Uhrzeiten New York" +
      (isNum(snap.previousClose) ? " · Startlinie: Vortagesschluss" : " · Startlinie: erster Kurs des Tages") +
      (p.freshness && p.freshness.freshnessState === "STALE"
        ? " · dieser Stand ist nicht der letzte Handelstag (" + (p.freshness.expectedSessionDate || "") + " erwartet); neuere Kurse folgen mit dem nächsten Datenlauf"
        : snap.regularComplete ? ""
          : snap.streaming
            ? " · der Kurs läuft mit; die letzte Zahl ist eine Kursreferenz aus einem Teilmarkt, kein Abschluss"
            : " · die Sitzung läuft, der Verlauf wächst mit dem nächsten Stand");
    chartBox.appendChild(el("p", { class: "dx-intraday-note" }, [el("span", { text: text.replace(/^ · /, "") })]));
  }

  /* Die Masse des grossen Charts: so breit wie der Kasten, auf dem Telefon
     rund die Haelfte des Bildschirms hoch (V4.1 §5: 50-70 % eines
     Viewports als Hauptflaeche), am Schreibtisch 440 px. */
  function chartMass(chartBox, mobil) {
    var w = Math.round(chartBox.getBoundingClientRect().width || chartBox.clientWidth || 0);
    if (!w) w = mobil ? Math.max(320, global.innerWidth - 32) : 1120;
    var h = mobil ? Math.round(Math.max(300, Math.min(global.innerHeight * 0.52, 480))) : 440;
    return { w: w, h: h };
  }

  /* V4.1 §5: Beruehrung. Finger oder Zeiger auf dem Chart zeigen den Kurs an
     dieser Stelle - im Kopf (Kurs, Veraenderung, Datum) und als Marke im
     Bild. Loslassen stellt den letzten Kurs wieder her. Senkrechtes
     Wischen bleibt Blaettern (touch-action: pan-y). */
  function beruehrung(svgNode, kopf, fmt) {
    if (!svgNode || !svgNode.__punkte || svgNode.__punkte.length < 2) return;
    var punkte = svgNode.__punkte, basis = svgNode.__basis || {};
    var preisNode = kopf.querySelector(".dx-chart-hero-preis > b");
    var deltaNode = kopf.querySelector(".dx-chart-hero-preis > span.num");
    var wortNode = kopf.querySelector(".dx-chart-hero-wort");
    var original = { preis: preisNode.textContent, delta: deltaNode.textContent, deltaClass: deltaNode.className, wort: wortNode.textContent };
    var ns = "http://www.w3.org/2000/svg";
    var g = document.createElementNS(ns, "g"); g.setAttribute("class", "dx-scrub"); g.setAttribute("aria-hidden", "true");
    var linie = document.createElementNS(ns, "line"); linie.setAttribute("class", "dx-scrub-line");
    var punkt = document.createElementNS(ns, "circle"); punkt.setAttribute("class", "dx-scrub-node"); punkt.setAttribute("r", "5");
    g.appendChild(linie); g.appendChild(punkt);
    var vb = (svgNode.getAttribute("viewBox") || "0 0 0 0").split(" ").map(Number);
    var aktiv = false;
    function naechster(clientX) {
      var r = svgNode.getBoundingClientRect();
      var x = (clientX - r.left) / Math.max(1, r.width) * vb[2];
      var best = punkte[0], d = Infinity;
      for (var i = 0; i < punkte.length; i++) { var dd = Math.abs(punkte[i].x - x); if (dd < d) { d = dd; best = punkte[i]; } }
      return best;
    }
    function zeigen(pt) {
      if (!aktiv) { aktiv = true; svgNode.appendChild(g); svgNode.classList.add("dx-scrubbing"); }
      linie.setAttribute("x1", pt.x); linie.setAttribute("x2", pt.x);
      linie.setAttribute("y1", basis.padTop || 0); linie.setAttribute("y2", vb[3] - (basis.padBottom || 0));
      punkt.setAttribute("cx", pt.x); punkt.setAttribute("cy", pt.y);
      preisNode.textContent = fmt.preis(pt);
      var delta = fmt.delta(pt);
      deltaNode.textContent = isNum(delta) ? prozentGross(delta) : "";
      deltaNode.className = "num " + C().toneClass(delta);
      wortNode.textContent = fmt.wann(pt);
    }
    function ende() {
      if (!aktiv) return;
      aktiv = false;
      if (g.parentNode) g.parentNode.removeChild(g);
      svgNode.classList.remove("dx-scrubbing");
      preisNode.textContent = original.preis; deltaNode.textContent = original.delta;
      deltaNode.className = original.deltaClass; wortNode.textContent = original.wort;
    }
    svgNode.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; zeigen(naechster(e.clientX)); });
    svgNode.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" ? true : aktiv) zeigen(naechster(e.clientX)); });
    svgNode.addEventListener("pointerup", ende);
    svgNode.addEventListener("pointercancel", ende);
    svgNode.addEventListener("pointerleave", ende);
    svgNode.addEventListener("touchend", ende, { passive: true });
  }

  function intradayAlsZeilen(p) {
    if (!p || !p.snapshot || !Array.isArray(p.snapshot.points)) return [];
    var snap = p.snapshot;
    return snap.points.map(function (pt) {
      return { date: snap.sessionDate, timestamp: snap.sessionDate + "T" + pt[0], close: pt[1],
               open: pt[1], high: pt[1], low: pt[1], volume: null };
    });
  }

  /** Schnellzugriff, darunter auf Wunsch die ganze Liste. */
  function controlBar(state, redraw) {
    var host = el("div", {});
    /* V4 §15: der Analyse-Chart ist ein Werkzeug, kein Standard. */
    var pro = el("label", { class: "dx-pro-toggle" }, [
      el("input", { type: "checkbox", checked: state.pro ? "checked" : null }),
      el("span", { text: "Analyse-Chart: Kerzen, Volumen, Overlays und Indikatoren" })
    ]);
    pro.querySelector("input").addEventListener("change", function (e) {
      state.pro = !!e.target.checked;
      if (state.pro && state.range === "1W") state.range = "1M";
      redraw();
      if (D.Analytics && D.Analytics.track) D.Analytics.track("detail:pro", { symbol: state.detail.symbol, on: state.pro });
    });
    host.appendChild(pro);
    if (!state.pro) return host;
    var schnell = el("div", { class: "dx-controls" }, [
      el("span", { class: "dx-ctrl-label", text: "Overlay" })
    ]);
    OVERLAYS.filter(function (o) { return o.group === "quick"; })
      .forEach(function (o) { schnell.appendChild(overlayButton(state, o, redraw)); });

    var mehr = el("button", { class: "dx-ctrl", type: "button",
      "aria-expanded": String(state.mehrOffen), text: state.mehrOffen ? "Weniger" : "Erweitert ›" });
    schnell.appendChild(mehr);
    host.appendChild(schnell);

    var erweitert = el("div", { class: "dx-more-controls", hidden: !state.mehrOffen });
    var reihe = el("div", { class: "dx-controls" }, [
      el("span", { class: "dx-ctrl-label", text: "Technik" })
    ]);
    OVERLAYS.filter(function (o) { return o.group === "more"; })
      .forEach(function (o) { reihe.appendChild(overlayButton(state, o, redraw)); });
    var panels = el("div", { class: "dx-controls" }, [
      el("span", { class: "dx-ctrl-label", text: "Panels" })
    ]);
    PANES.forEach(function (p) {
      var knopf = el("button", { class: "dx-ctrl", type: "button", text: p.label,
                                 "aria-pressed": String(!!state.panes[p.id]) });
      knopf.addEventListener("click", function () {
        state.panes[p.id] = !state.panes[p.id];
        knopf.setAttribute("aria-pressed", String(state.panes[p.id]));
        redraw();
      });
      panels.appendChild(knopf);
    });
    erweitert.appendChild(reihe);
    erweitert.appendChild(panels);
    host.appendChild(erweitert);

    mehr.addEventListener("click", function () {
      state.mehrOffen = !state.mehrOffen;
      erweitert.hidden = !state.mehrOffen;
      mehr.setAttribute("aria-expanded", String(state.mehrOffen));
      mehr.textContent = state.mehrOffen ? "Weniger" : "Erweitert ›";
    });
    return host;
  }

  function overlayButton(state, o, redraw) {
    var ohneBundle = o.source === "layer" && !(state.bundle && state.bundle.annotations);
    var knopf = el("button", { class: "dx-ctrl", type: "button", text: o.label,
      "aria-pressed": String(!!state.overlays[o.id]), disabled: ohneBundle,
      title: ohneBundle
        ? "Für diesen Titel liegt keine vorberechnete Technical-Intelligence-Analyse vor."
        : "" });
    knopf.addEventListener("click", function () {
      state.overlays[o.id] = !state.overlays[o.id];
      knopf.setAttribute("aria-pressed", String(state.overlays[o.id]));
      redraw();
    });
    return knopf;
  }

  function renderPanes(state, slice, host, grenzen, aktiveBars) {
    var I = D.Indicators;
    var dates = slice.timestamps;
    var voll = aktiveBars.close;
    var cut = function (arr) { return arr.slice(grenzen.start, grenzen.end + 1); };

    if (state.panes.rsi) {
      host.appendChild(pane("RSI 14", QC.lineChart({
        dates: dates, height: 120, yDomain: [0, 100],
        series: [{ values: cut(I.rsi(voll, 14)), className: "line-primary" },
                 { values: dates.map(function () { return 70; }), className: "line-muted" },
                 { values: dates.map(function () { return 30; }), className: "line-muted" }],
        yFormat: function (v) { return String(Math.round(v)); }, title: "RSI 14"
      }), "Überkauft ab 70, überverkauft unter 30 — eine Konvention, keine Regel."));
    }
    if (state.panes.macd) {
      var macd = I.macd(voll, 12, 26, 9);
      host.appendChild(pane("MACD 12/26/9", QC.lineChart({
        dates: dates, height: 130,
        series: [{ values: cut(macd.macd), className: "line-primary" },
                 { values: cut(macd.signal), className: "line-compare" }],
        yFormat: function (v) { return v.toFixed(2); }, title: "MACD"
      }), "MACD-Linie gegen Signallinie. Der Abstand ist das Histogramm."));
    }
    if (state.panes.relativeVolume) {
      host.appendChild(pane("Relatives Volumen", QC.lineChart({
        dates: dates, height: 110,
        series: [{ values: cut(I.relativeVolume(aktiveBars.volume, 20)), className: "line-primary" },
                 { values: dates.map(function () { return 1; }), className: "line-muted" }],
        yFormat: function (v) { return v.toFixed(1) + "x"; }, title: "Relatives Volumen"
      }), "Tagesvolumen gegen den Median der zwanzig Vortage — dieselbe Definition wie in der " +
          "bestehenden Technical-Engine."));
    }
    if (state.panes.atr) {
      host.appendChild(pane("ATR 14", QC.lineChart({
        dates: dates, height: 110,
        series: [{ values: cut(I.atr(barsAsRows(aktiveBars), 14)), className: "line-primary" }],
        yFormat: function (v) { return v.toFixed(2); }, title: "ATR"
      }), "Durchschnittliche wahre Handelsspanne — das Maß für Bewegungsraum."));
    }
  }

  function pane(title, chart, note) {
    return el("div", { class: "dx-chart", style: "margin-top:14px" }, [
      el("h3", { style: "margin:2px 8px 8px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--discover-dim)",
                 text: title }),
      el("div", { class: "q-tchart" }, [chart]),
      note ? el("p", { style: "margin:8px;font-size:11.5px;color:var(--discover-dim)", text: note }) : null
    ]);
  }

  function legend(state, grain) {
    var einheit = grain === "weekly" ? " (Wochen)" : "";
    var items = [];
    OVERLAYS.forEach(function (o) {
      if (!state.overlays[o.id] || o.source !== "indicator") return;
      items.push(el("span", {}, [el("i", { class: "dx-legend-" + o.style }),
                                 document.createTextNode(o.label + einheit)]));
    });
    if (state.overlays.bbUpper) {
      items.push(el("span", {}, [el("i", { class: "dx-legend-bb" }),
                                 document.createTextNode("Bollinger 20/2")]));
    }
    /* Ohne Ueberlagerung keine Legende: "Keine Ueberlagerung aktiv" ist
       eine Auskunft ueber ein Werkzeug, das der Leser gar nicht geoeffnet
       hat. */
    if (!items.length) return null;
    return el("div", { class: "dx-legend" }, items);
  }

  function seriesAnnotation(ref, label, style) {
    return { annotationId: "dx_" + ref, type: "SERIES", layers: ["AUTO"], startTime: null,
             endTime: null, startPrice: null, endPrice: null, label: label, status: "CONFIRMED",
             method: "discover:indicator", degree: null, scenarioId: null, evidenceRef: null,
             confidence: null, semanticStyle: style, zOrder: 5, meta: { seriesRef: ref } };
  }
  function levelAnnotation(price, label, from, to) {
    return { annotationId: "dx_level_" + label, type: "LEVEL", layers: ["AUTO"], startTime: from,
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
    var cut = function (a) { return a ? a.slice(bounds.start, bounds.end + 1) : []; };
    return { timestamps: cut(bars.timestamps), open: cut(bars.open), high: cut(bars.high),
             low: cut(bars.low), close: cut(bars.close), volume: cut(bars.volume) };
  }

  /** Ohne Kursreihe: die Renditeleiter gross, plus der Grund.

      Vorher stand hier der rebasierte Renditepfad als Kurve. Er war
      rechnerisch korrekt und sah trotzdem aus wie ein Kurschart - seit
      V3 gibt es ohne Kursreihe keine Kurve mehr, nur die vier Renditen
      als Balken (Chart Truth Contract, §12). */
  function noSeries(detail) {
    var host = el("div", {});
    var MC = D.MicroChart;
    var leiter = MC ? MC.ladder(detail.metrics, { width: 900, height: 260, values: true,
                                                    symbol: detail.symbol }) : null;
    if (leiter) {
      leiter.classList.add("dx-ladder-gross");
      host.appendChild(el("div", { class: "dx-chart", style: "padding:22px" }, [
        el("p", { class: "dx-chart-head", style: "margin:0 0 10px" }, [
          el("b", { text: "Rendite über 1, 3, 6 und 12 Monate" }),
          el("span", { text: " · als Balken, nicht als Kurskurve" })
        ]),
        leiter,
        el("p", { style: "margin:14px 2px 0;font-size:12px;color:var(--discover-dim);line-height:1.6",
          text: "Vier Zeiträume, vier gerechnete Renditen — dazwischen wird nichts behauptet. " +
                "Für diesen Titel liegt noch keine Kursreihe vor; deshalb gibt es hier keinen " +
                "Kursverlauf, und keiner wird geschätzt." })
      ]));
    }
    host.appendChild(el("div", { style: "margin-top:18px" }, [
      C().note("Keine Kursreihe in dieser Auslieferung",
        (detail.series && detail.series.message) ||
        "Für diesen Titel wird keine Kursreihe ausgeliefert.")
    ]));
    return host;
  }

  /* ---------------------------------------------------------- Kennzahlen */
  function panels(detail) {
    var m = detail.metrics;
    var section = el("section", { class: "dx-chapter dx-fade" }, [
      el("h2", { text: "Kennzahlen und Herleitung" })
    ]);
    var grid = el("div", { class: "dx-panels" });

    grid.appendChild(scorePanel("Market Leadership", detail.scores.leadership,
      m.leadershipPercentile, Object.assign({ zeigeMethodik: true }, detail)));
    grid.appendChild(scorePanel("Momentum", detail.scores.momentum, m.momentumPercentile, detail));
    grid.appendChild(scorePanel("Relative Stärke", detail.scores.relativeStrength,
      m.relativeStrengthPercentile, detail));

    grid.appendChild(el("div", { class: "dx-panel" }, [
      el("h3", { text: "Rendite" }),
      el("div", { class: "dx-kv" }, [
        kv("1 Monat", m.return1M), kv("3 Monate", m.return3M), kv("6 Monate", m.return6M),
        kv("12 Monate", m.return12M), kv("12-1 Monate", m.return12M1M)
      ])
    ]));
    grid.appendChild(el("div", { class: "dx-panel" }, [
      el("h3", { text: "Relative Stärke gegen Benchmark" }),
      el("div", { class: "dx-kv" }, [
        kv("1 Monat", m.relativeStrength1M), kv("3 Monate", m.relativeStrength3M),
        kv("6 Monate", m.relativeStrength6M), kv("12 Monate", m.relativeStrength12M)
      ]),
      el("p", { text: "Differenz der Log-Renditen — dieselbe Definition wie in der bestehenden " +
                      "Relative-Strength-Engine." })
    ]));
    grid.appendChild(el("div", { class: "dx-panel" }, [
      el("h3", { text: "Marktstruktur" }),
      el("div", { class: "dx-kv" }, [
        kv("Zum 52W-Hoch", m.distanceTo52wHigh), kv("Zum 52W-Tief", m.distanceTo52wLow),
        kv("Max. Drawdown 252T", m.maxDrawdown252d), kv("Volatilität 252T", m.volatility252d),
        kvText("Trendstruktur", isNum(m.trendAlignment)
          ? Math.round(m.trendAlignment * 4) + " von 4 Durchschnitten überschritten" : "–"),
        kvText("Volumen 20/60", isNum(m.volumeRatio20over60)
          ? m.volumeRatio20over60.toFixed(2) + "x" : "–")
      ])
    ]));
    if (detail.ranks.sector) {
      grid.appendChild(el("div", { class: "dx-panel" }, [
        el("h3", { text: "Sektorrang" }),
        el("div", { class: "big num" }, [document.createTextNode("#" + detail.ranks.sector.rank),
          el("small", { text: "von " + detail.ranks.sector.of })]),
        el("p", { text: detail.ranks.sector.sector + " — nach Leadership Score, innerhalb von " +
                        detail.universeLabel + "." })
      ]));
    }
    section.appendChild(grid);
    return section;
  }

  function scorePanel(title, score, percentile, detail) {
    var node = el("div", { class: "dx-panel" }, [el("h3", { text: title })]);
    if (!score || score.status !== "SCORED" || !isNum(score.score)) {
      node.appendChild(el("div", { class: "big", style: "color:var(--discover-dim)", text: "INCOMPLETE" }));
      node.appendChild(el("p", { text: (score && score.reason) ||
        "Nicht genug Kennzahlen für einen belastbaren Score." }));
      return node;
    }
    node.appendChild(el("div", { class: "big num" }, [
      document.createTextNode(String(Math.round(score.score))),
      isNum(percentile) ? el("small", { text: "Perzentil " + Math.round(percentile) }) : null
    ]));
    var bars = el("div", { class: "dx-bars" });
    (score.contributions || []).forEach(function (c) {
      var fehlt = c.status !== "CALCULATED";
      bars.appendChild(el("div", { class: "dx-contrib" + (fehlt ? " missing" : "") }, [
        el("span", { text: c.label, title: c.label }),
        el("div", { class: "track" }, [
          el("i", { style: "width:" + (fehlt ? 100 : Math.round((c.normalized || 0) * 100)) + "%" })
        ]),
        el("b", { text: fehlt ? "fehlt" : Math.round((c.normalized || 0) * 100) + "%" })
      ]));
    });
    node.appendChild(bars);
    node.appendChild(el("p", { text: detail.zeigeMethodik
      ? "Abdeckung " + Math.round((score.coverage || 0) * 100) + " %. Gewichte und Schwellen " +
        "stehen in discover/methodology/discover-v1.json; die Balken zeigen den normierten " +
        "Beitrag jeder Komponente."
      : "Abdeckung " + Math.round((score.coverage || 0) * 100) + " %." }));
    return node;
  }

  function kv(label, value) {
    return el("div", {}, [el("span", { text: label }),
      el("b", { class: "num " + C().toneClass(value), text: C().pct(value) })]);
  }
  function kvText(label, text) {
    return el("div", {}, [el("span", { text: label }), el("b", { text: text })]);
  }

  /* -------------------------------------------- Technical Intelligence */
  function technicalIntelligence(detail) {
    var ti = detail.technicalIntelligence || { layers: {} };
    var wave = ti.layers.elliottWave || { status: "unavailable" };
    var labels = { available: "Verfügbar", lowConfidence: "Geringe Konfidenz",
                   calculating: "Wird berechnet", unavailable: "Nicht verfügbar" };

    var body = [
      el("div", { class: "dx-ti-head" }, [
        el("h3", { style: "margin:0;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--discover-dim)",
                   text: "Technical Intelligence — Elliott Wave" }),
        el("span", { class: "dx-ti-state dx-ti-state--" + wave.status,
                     text: labels[wave.status] || wave.status })
      ])
    ];
    if (wave.status === "available" || wave.status === "lowConfidence") {
      body.push(el("p", { style: "margin:14px 0 0;font-size:17px;font-weight:600;letter-spacing:-.01em",
        text: [wave.currentWave ? "Welle " + wave.currentWave : null, wave.patternType,
               wave.degreeScale ? "Skala " + wave.degreeScale : null].filter(Boolean).join(" · ") }));
      body.push(el("div", { class: "dx-kv" }, [
        kvText("Method Fit", isNum(wave.confidence) ? wave.confidence + " / 100" : "–"),
        kvText("Engine", wave.sourceEngine || "–"),
        kvText("Repainting", wave.repaintingPolicy || "–"),
        kvText("Stand", wave.asOf || "–")
      ]));
    } else {
      body.push(el("p", { style: "margin:14px 0 0;font-size:13px;color:var(--discover-muted);line-height:1.6",
        text: wave.message || "Für diesen Titel liegt keine Wellenzählung vor." }));
    }
    /* Der Hinweis zur Herkunft steht nur, wo es ein Ergebnis gibt; ohne
       Ergebnis genuegt der Satz darueber (V4.1 §25: keine leeren Kapitel
       mit Fusstext). */
    if (wave.status === "available" || wave.status === "lowConfidence") {
      body.push(el("p", { style: "margin:14px 0 0;font-size:11.5px;color:var(--discover-dim);line-height:1.6",
        text: wave.disclaimer ||
          "Elliott Wave wird ausschließlich aus der bestehenden Vision-Universe-Engine gelesen. " +
          "Discover erzeugt keine eigene Wellenzählung." }));
    }

    var weitere = [];
    ["marketStructure", "supportResistance"].forEach(function (key) {
      var layer = ti.layers[key];
      if (!layer) return;
      weitere.push(kvText(key === "marketStructure" ? "Marktstruktur" : "Support / Resistance",
        layer.status === "available"
          ? (key === "marketStructure" ? strukturText(layer.state) : layer.zones + " Zonen")
          : "nicht verfügbar"));
    });
    if (weitere.length) body.push(el("div", { class: "dx-kv" }, weitere));

    return el("section", { class: "dx-chapter dx-fade" }, [
      el("div", { class: "dx-ti" }, body)
    ]);
  }

  /* ------------------------------------------- Weiter entdecken (§14) */
  function continueDiscovery(detail, options) {
    var section = el("section", { class: "dx-chapter dx-fade" });
    var universeId = options.universeId || detail.universeId;

    if (detail.memberships && detail.memberships.length) {
      section.appendChild(el("h2", { text: "Auch enthalten in" }));
      var chips = el("div", { class: "dx-chips", style: "margin-bottom:34px" });
      detail.memberships.forEach(function (m) {
        chips.appendChild(el("a", { class: "dx-chip",
          href: "#/c/" + universeId + "/" + m.rowId }, [
          el("b", { text: m.title }),
          el("i", { text: "Rang " + m.rank + " von " + m.of })
        ]));
      });
      section.appendChild(chips);
    }

    if (detail.similar && detail.similar.length) {
      var titel = detail.sector && detail.sectorStatus === "CURATED"
        ? "Ähnliche Titel aus " + detail.sector : "Ähnliches Kursverhalten";
      section.appendChild(C().railHead(titel,
        "Nächste Nachbarn nach Leadership Score — ein Vergleich des Kursverhaltens, keine " +
        "Aussage über das Geschäftsmodell.", {}));
      var track = el("div", { class: "dx-rail", role: "list",
                              style: "padding-left:0;padding-right:0" });
      detail.similar.forEach(function (card) {
        var item = C().poster(card, { rowId: "market-leaders", universeId: universeId,
                                      variant: "compact" });
        item.setAttribute("role", "listitem");
        track.appendChild(item);
      });
      /* Vorladen, was als Naechstes kommt - und nur das.

         Wer die dritte Karte sieht, oeffnet als Naechstes wahrscheinlich
         die vierte; deren Seite liegt dann schon im Cache des Browsers.
         Alle acht auf einmal zu laden waere fuer den Nutzer teurer als
         der gesparte Moment wert ist. */
      section.appendChild(C().withRailNav(track, {
        label: "aehnliche-titel",
        prefetch: function (index) {
          var karte = detail.similar[index];
          if (!karte || !D.Swipe) return;
          D.Swipe.vorladen("/discover/data/stocks/" + universeId + "/" + karte.symbol + ".json");
        }
      }));
    }
    return section;
  }

  /* V4.1 §11: eine Zeile - Stand, Weg zu Daten & Quellen, Hinweis. Die
     Herkunft (Anbieter, Lizenz, Methodik, Versionen) steht auf der
     Seite Daten & Quellen, nicht unter jeder Aktie. */
  function provenance(detail) {
    return el("section", { class: "dx-foot dx-fade" }, [
      el("div", { class: "dx-foot-links" }, [
        document.createTextNode("Stand " + (detail.asOf ? C().dateShort(detail.asOf) : "unbekannt") + " · "),
        el("a", { href: "#/daten", text: "Daten & Quellen" }),
        document.createTextNode(" · " + (detail.disclaimer || "Keine Anlageempfehlung."))
      ])
    ]);
  }

  /* ===================================================== Aktienseite aus
     dem Company Master

     Fuer einen Titel, fuer den KEINE Discover-Payload ausgeliefert wird -
     also fuer die grosse Mehrheit des erweiterten Universums. Vorher
     endete dieser Weg in einem Leerzustand mit der Ueberschrift "Keine
     Detailseite". Das war korrekt und trotzdem falsch: die Seite wusste
     sehr wohl etwas ueber den Titel, sie zeigte es nur nicht.

     Was hier steht, ist ausschliesslich, was im Master steht: Identitaet,
     Handelsplatz, Gattung, Listungsstand - und was der Datenweg fuer
     diesen Titel kann und was nicht. Keine Kennzahl, kein Chart, keine
     erfundene Null (§48). */
  function renderInstrument(root, result, options) {
    options = options || {};
    var inst = result.instrument;
    var caps = result.capabilities || {};
    S.clear(root);
    root.removeAttribute("data-world");

    root.appendChild(el("a", { class: "dx-back", href: "#/u/" + (options.universeId || "US_REAL") }, [
      document.createTextNode("← Discover")
    ]));

    var gattung = {
      COMMON_STOCK: "Stammaktie", ADR: "American Depositary Receipt", PREFERRED: "Vorzugsaktie",
      ETF: "ETF", ETN: "ETN", FUND: "Fonds", WARRANT: "Optionsschein",
      OTHER: "sonstiges Instrument", UNKNOWN: "Gattung nicht bestimmbar"
    }[inst.securityType] || inst.securityType;

    var kopf = el("header", { class: "dx-hero dx-hero--schmal" }, [
      el("p", { class: "dx-hero-kicker", text: [inst.exchange, gattung,
                inst.active === false ? "nicht mehr gelistet" : null]
                .filter(Boolean).join(" · ") }),
      el("h1", { text: inst.companyName || inst.symbol }),
      el("p", { class: "dx-hero-sub", text: inst.companyName
        ? inst.symbol + " · " + (inst.country || "Land unbekannt")
        : "Für diesen Titel liegt kein Firmenname vor. Die Tickerliste des Kursanbieters " +
          "führt keine Namen; angezeigt wird deshalb das Kürzel." })
    ]);
    root.appendChild(kopf);

    /* Stammdaten. Jede Zeile ist eine Angabe aus dem Master, keine
       abgeleitete Aussage. */
    var zeilen = [
      ["Kürzel", inst.symbol],
      ["Interne Kennung", inst.instrumentId],
      ["Handelsplatz", inst.exchange + (inst.mic ? " (" + inst.mic + ")" : "")],
      ["Gattung", gattung + (inst.shareClass ? " · Klasse " + inst.shareClass : "")],
      ["Land", inst.country || "nicht bestimmbar"],
      ["Währung", inst.currency || "nicht angegeben"],
      ["Erster Handelstag", inst.firstTradeDate || "nicht angegeben"],
      ["Status", inst.active === false
        ? "beendet" + (inst.delistedAt ? " am " + inst.delistedAt : "")
        : (inst.active === true ? "laufendes Listing" : "nicht belegbar")],
      ["CIK (SEC)", inst.cik || "keine"]
    ];
    var tabelle = el("section", { class: "dx-chapter dx-fade" }, [
      el("h2", { text: "Stammdaten" }),
      el("dl", { class: "dx-stammdaten" }, zeilen.reduce(function (acc, z) {
        acc.push(el("dt", { text: z[0] }));
        acc.push(el("dd", { text: String(z[1]) }));
        return acc;
      }, []))
    ]);
    root.appendChild(tabelle);

    /* Was diese Seite zeigen KANN - und was nicht, mit Grund. Das ist die
       eigentliche Nachricht der Seite. */
    var kannListe = [
      ["Kursverlauf", caps.HAS_PRICE_HISTORY,
       "Für diesen Titel wird keine Kursreihe ausgeliefert. Der Datenweg kann sie liefern; " +
       "die Reihen selbst bleiben bis zur Lizenzklärung in der Arbeitsablage."],
      ["Kursstand", caps.HAS_PRICE_SNAPSHOT,
       "Absolute Kursniveaus realer Titel werden nach der Redistributionsregel nicht ausgeliefert."],
      ["Geschäftszahlen", caps.HAS_FUNDAMENTALS,
       inst.cik
         ? "Der Titel hat eine CIK; normalisierte Geschäftszahlen liegen noch nicht vor."
         : "Ohne CIK gibt es keinen SEC-Einreicher, dem Geschäftszahlen zuzuordnen wären."],
      ["Bewertung", caps.HAS_VALUATION, "Bewertungskennzahlen brauchen Geschäftszahlen."],
      ["Analystenschätzungen", caps.HAS_ANALYSTS,
       "Analystendaten sind lizenzpflichtig und nicht Teil dieses Systems."],
      ["Themen", caps.HAS_THEMES, "Themen sind im Modell vorgesehen und noch nicht befüllt."]
    ];
    root.appendChild(el("section", { class: "dx-chapter dx-fade" }, [
      el("h2", { text: "Was für diesen Titel vorliegt" }),
      el("ul", { class: "dx-kann" }, kannListe.map(function (k) {
        return el("li", { class: k[1] ? "ja" : "nein" }, [
          el("b", { text: k[0] }),
          document.createTextNode(k[1] ? " liegt vor" : " liegt nicht vor — " + k[2])
        ]);
      }))
    ]));

    if (result.alternateListings && result.alternateListings.length) {
      root.appendChild(el("section", { class: "dx-chapter dx-fade" }, [
        el("h2", { text: "Weitere Listings unter diesem Kürzel" }),
        el("p", { class: "dx-hint", text:
          "Dasselbe Kürzel wird an mehr als einem Handelsplatz geführt. Genau dafür trägt " +
          "jedes Instrument eine eigene Kennung und nicht nur einen Ticker." }),
        el("ul", { class: "dx-kann" }, result.alternateListings.map(function (a) {
          return el("li", {}, [el("b", { text: a.exchange || "unbekannter Platz" }),
                               document.createTextNode(" · " + a.instrumentId)]);
        }))
      ]));
    }

    root.appendChild(el("footer", { class: "dx-foot" }, [
      el("div", {}, [
        el("b", { text: "Quelle: " }),
        document.createTextNode("Vision Universe® Company Master · " +
          (result.masterVersion || "company-master") + " · Stand " + (result.asOf || "unbekannt"))
      ]),
      el("div", { style: "margin-top:6px" }, [document.createTextNode(
        "Diese Seite zeigt ausschließlich, was über den Titel bekannt ist. Für Kennzahlen, " +
        "Verlaufsbild und Einordnung braucht es Daten, die für diesen Titel nicht ausgeliefert " +
        "werden — sie werden hier nicht ersetzt.")])
    ]));
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Detail = { render: render, renderInstrument: renderInstrument,
                               OVERLAYS: OVERLAYS, PANES: PANES };
})(window);
