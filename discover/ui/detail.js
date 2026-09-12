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
      bars: null, weeklyBars: null, bundle: null, mehrOffen: false
    };
  }

  function loadSeries(detail) {
    var series = detail.series || {};
    if (series.source === "technical-instrument" && series.path) {
      return S.loadJSON(series.path).then(function (payload) {
        return { bars: payload.bars, bundle: payload.bundle || null,
                 priceSeriesType: payload.priceSeriesType || null };
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

    root.appendChild(why(detail));
    root.appendChild(ueberblick(detail));
    root.appendChild(waage(detail));
    root.appendChild(unternehmen(detail));
    root.appendChild(continueDiscovery(detail, options));

    /* Ab hier die Analyse. Der Anfaenger muss nicht hierher; der Profi
       kommt mit einem Wisch. */
    root.appendChild(kapitelTrenner());
    root.appendChild(belege(detail));
    root.appendChild(panels(detail));
    root.appendChild(technicalIntelligence(detail));
    root.appendChild(provenance(detail));

    loadSeries(detail).then(function (loaded) {
      S.clear(chartHost);
      chartHost.appendChild(el("h2", { text: "Kursverlauf" }));
      if (!loaded) { chartHost.appendChild(noSeries(detail)); return; }
      state.bars = loaded.bars;
      state.weeklyBars = loaded.weeklyBars || null;
      state.bundle = loaded.bundle;
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
                       text: isNum(change) ? C().pctPoints(change) + " heute" : "" })
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
        D.Artwork.stockArtwork(detail, { width: 720, height: 220, ticker: false,
                                         scale: "hero", nodes: true })
      ]) : null,
      el("div", { class: "dx-dhero-inner" }, [
        el("div", {}, [
          el("h1", { text: detail.companyName || detail.symbol }),
          el("p", { class: "dx-dhero-meta" }, [detail.symbol, detail.exchange, detail.sector,
                                               detail.universeLabel]
            .filter(Boolean).map(function (t) { return el("span", { text: t }); })),
          text.story ? el("p", { class: "dx-dhero-story" }, [
            el("i", { class: "dx-story-dot", "aria-hidden": "true" }),
            document.createTextNode(text.story)
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
    daten.zeilen.forEach(function (z) {
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
    if (!w.dafuer.length && !w.beachten.length) return null;

    function spalte(titel, eintraege, art) {
      var host = el("div", { class: "dx-waage-spalte dx-waage-spalte--" + art }, [
        el("h3", { text: titel })
      ]);
      var liste = el("ul", {});
      eintraege.forEach(function (e) {
        liste.appendChild(el("li", {}, [
          el("i", { class: "dx-waage-marke", "aria-hidden": "true",
                    text: art === "pro" ? "+" : "−" }),
          el("div", {}, [
            el("b", { text: e.text }),
            e.beleg ? el("span", { text: e.beleg }) : null
          ])
        ]));
      });
      host.appendChild(liste);
      return host;
    }

    return el("section", { class: "dx-chapter dx-fade" }, [
      el("h2", { text: "Dafür und dagegen" }),
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
      el("h2", { text: "Das Unternehmen" })
    ]);

    if (g.status !== "CALCULATED") {
      section.appendChild(el("p", { class: "dx-why-empty",
        text: g.message || "Für diesen Titel liegen keine Geschäftszahlen vor. Vision Universe " +
              "zeigt nur, was aus der Kursreihe folgt — und nicht mehr." }));
      return section;
    }

    var K = D.Klartext;
    var zahlen = [
      { label: "Umsatz (12 Monate)", wert: geld(g.umsatzTTM),
        zusatz: isNum(g.umsatzWachstum) ? K.prozent(g.umsatzWachstum) + " gegenüber dem Vorjahr" : null,
        ton: tonVon(g.umsatzWachstum) },
      { label: "Gewinn (12 Monate)", wert: geld(g.gewinnTTM),
        zusatz: isNum(g.gewinnWachstum) ? K.prozent(g.gewinnWachstum) + " gegenüber dem Vorjahr" : null,
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

    var quelle = g.quelle === "SEC_CANONICAL"
      ? "Aus den Quartalsberichten bei der SEC, Zeitraum " +
        (g.zeitraum && g.zeitraum.von ? g.zeitraum.von + " bis " + g.zeitraum.bis : "unbekannt") +
        ". Zwölfmonatswerte aus den vier jüngsten abgeschlossenen Quartalen."
      : "Synthetische Kennzahlen des Vision-Universe-Modelluniversums — erzeugt, nicht gemessen.";
    section.appendChild(el("p", { class: "dx-kapitel-fuss", text: quelle }));
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
    return el("div", { class: "dx-trenner dx-fade" }, [
      el("span", { text: "Ab hier: die Analyse" }),
      el("p", { text: "Alle Kennzahlen, aus denen die Einordnungen oben entstehen — " +
                      "Scores, Perzentile, technische Lage und Herkunft der Daten." })
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
    section.appendChild(el("p", { class: "dx-kapitel-fuss",
      text: "Jeder Satz folgt aus einer ausgelieferten Kennzahl und einer festen Schwelle " +
            "(discover/engines/narrative.js). Keine Formulierung entsteht aus einem Sprachmodell, " +
            "und kein Befund ohne seine Zahl." }));
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
    var daily = { eod: barsAsRows(state.bars), intraday: [] };
    var weekly = state.weeklyBars ? { eod: barsAsRows(state.weeklyBars), intraday: [] } : null;

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

    var leiste = Ranges.rangeBar(weekly || daily, { gates: gates });
    leiste.forEach(function (r) {
      /* Die Leiste zeigt die Zeitraeume, in denen ein Mensch denkt:
         heute, eine Woche, ein Monat, ein halbes Jahr, ein Jahr, fuenf
         Jahre, alles. Drei Jahre und zehn Jahre liegen dazwischen, ohne
         eine eigene Frage zu beantworten - sie sind auf der Analyseebene
         ueber dieselbe Engine erreichbar. */
      if (["3M", "YTD", "3Y", "10Y"].indexOf(r.id) !== -1) return;
      /* Die Engine nennt den Zeitraum "5T", weil sie in Handelstagen
         denkt. Ein Mensch sagt "1 Woche". Umbenannt wird nur die
         Beschriftung - die Auswahl bleibt dieselbe Engine-Entscheidung. */
      var beschriftung = r.id === "5D" ? "1W" : r.label;
      var knopf = el("button", { type: "button", text: beschriftung,
        "aria-pressed": String(r.id === state.range), disabled: !r.available,
        title: r.available ? "" : (r.message || "Nicht verfügbar") });
      knopf.addEventListener("click", function () {
        if (!r.available) return;
        state.range = r.id;
        Array.prototype.forEach.call(tf.children, function (b) {
          b.setAttribute("aria-pressed", String(b.textContent === beschriftung));
        });
        zeichnen();
      });
      tf.appendChild(knopf);
    });

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

  /** Schnellzugriff, darunter auf Wunsch die ganze Liste. */
  function controlBar(state, redraw) {
    var host = el("div", {});
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

  /** Ohne Kursreihe: der Renditepfad gross, plus der Grund. */
  function noSeries(detail) {
    var host = el("div", {});
    if (Array.isArray(detail.performancePath) && detail.performancePath.length > 2) {
      var chart = C().pathChart(detail.performancePath, { width: 900, height: 300,
        label: detail.symbol + ": Renditepfad über zwölf Monate" });
      chart.setAttribute("class", "dx-spark dx-hero-chart");
      host.appendChild(el("div", { class: "dx-chart", style: "padding:22px" }, [
        chart,
        el("p", { style: "margin:14px 2px 0;font-size:12px;color:var(--discover-dim);line-height:1.6",
          text: "Rebasiert auf 100, zurückgerechnet aus den ausgelieferten Renditen über 12, 6, " +
                "3 und 1 Monat. Vier Stützstellen und der heutige Stand — zwischen ihnen wird " +
                "nichts behauptet." })
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
    body.push(el("p", { style: "margin:14px 0 0;font-size:11.5px;color:var(--discover-dim);line-height:1.6",
      text: wave.disclaimer ||
        "Elliott Wave wird ausschließlich aus der bestehenden Vision-Universe-Engine gelesen. " +
        "Discover erzeugt keine eigene Wellenzählung." }));

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

  function provenance(detail) {
    var series = detail.series || {};
    return el("section", { class: "dx-foot dx-fade" }, [
      el("div", {}, [
        el("b", { text: "Datenherkunft: " }),
        document.createTextNode([
          detail.dataMode === "real" ? "reale Marktdaten (" + (detail.provider || "Anbieter") + ")"
                                     : "synthetisches Modelluniversum",
          "Stand " + (detail.asOf || "unbekannt"),
          "Universum " + detail.universeLabel,
          series.available ? "Kursreihe: " + (series.priceSeriesType || "unbekannt")
                           : "keine Kursreihe ausgeliefert",
          detail.dataQuality ? "Datenqualität " + detail.dataQuality : null
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
