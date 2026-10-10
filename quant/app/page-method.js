/* =========================================================================
   VISION UNIVERSE QUANT — app/page-method.js                     Methodik

   Beginnt mit der Frage "Warum kann ich dem Ergebnis vertrauen?" und
   verzweigt in Themen. Jede Zahl auf dieser Seite wird aus den
   veroeffentlichten Methodik- und Datenartefakten gelesen oder aus ihnen
   gezaehlt - nichts ist hineingeschrieben, was sich aendern kann.

   Der Abschnitt "Wie die Stufen verteilt sind" ist die oeffentliche
   Antwort auf das Band-Audit: seit factor-band-2.0.0 ist die Stufe die
   gezaehlte Position unter allen bewerteten Aktien; welcher Faktorwert
   heute fuer welche Stufe reicht, steht daneben.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;

  var TOPICS = [
    { id: "daten", title: "Daten", text: "Woher die Zahlen kommen und wie aktuell sie sind." },
    { id: "faktoren", title: "Die sieben Eigenschaften", text: "Was jeder Faktor misst – und was nicht." },
    { id: "gewichtung", title: "Gewichtung & Vergleich", text: "Wie Kennzahlen eingeordnet und zusammengeführt werden." },
    { id: "branchen", title: "Branchenvorlagen", text: "Warum Banken, Versicherer und REITs eigene Kennzahlen bekommen." },
    { id: "setups", title: "Setups", text: "Wie ein Setup entsteht, bestätigt wird oder endet." },
    { id: "strategien", title: "Strategien", text: "Wie ein Anlagestil geprüft wird – ohne Trefferquote." },
    { id: "chartbild", title: "Chartbild & Wellen", text: "Wie Szenarien, Zonen und Elliott-Zählungen entstehen – und was die Evidenz zeigt." },
    { id: "historie", title: "Historical Replay & Muster", text: "Was ähnliche Situationen früher zeigten – und was nicht." },
    { id: "grenzen", title: "Grenzen & fehlende Daten", text: "Was Quant bewusst nicht sagt, und warum." },
    { id: "versionen", title: "Versionen", text: "Welche Methodik gerade gilt." }
  ];
  var TEMPLATE_LABEL = { BALANCE_SHEET_FINANCIAL: "Banken und bilanzbasierte Finanzunternehmen", INSURANCE_CARRIER: "Versicherer", REAL_ESTATE_TRUST: "Immobilien-REITs" };

  function topicHead(main, t, lead) {
    main.append(tabs(t.id), el("a", { class: "v2-back qx-back", href: X.routes.method(), text: "← Methodik" }),
      el("span", { class: "v2-eyebrow", text: "Methodik" }), el("h1", { class: "qx-h1", text: t.title }), lead ? el("p", { class: "v2-lead qx-lead", text: lead }) : null);
  }
  function para(t) { return el("p", { text: t }); }

  /* Welche Eigenschaft traegt heute fuer KEINE Aktie einen Wert - gezaehlt
     aus den veroeffentlichten Werten, nicht als Name in den Code
     geschrieben. Der Grund kommt aus dem Faktordatensatz einer Aktie. */
  async function emptyFactors(ctx) {
    var r = await Promise.all([ctx.distributionRows().catch(function () { return null; }), ctx.api.getFactorEvidence("MSFT").catch(function () { return null; })]);
    var dist = r[0], sample = r[1];
    if (!dist) return { dist: null, empty: [] };
    var empty = VM.ORDER.filter(function (id) { return !(dist[id] && dist[id].length); }).map(function (id) {
      var f = sample && sample.factors ? sample.factors.filter(function (x) { return x.id === id; })[0] : null;
      return { id: id, name: VM.FACTORS[id].name, text: VM.reasonText(f && f.reason) };
    });
    return { dist: dist, empty: empty };
  }

  async function specs(ctx) {
    var shard = await global.QuantShell.loadCompressedJSON("/quant/data/product/factor-evidence-v1/MS.json.gz");
    return shard;
  }

  async function render(main, ctx, topic, params) {
    var t = TOPICS.filter(function (x) { return x.id === topic; })[0];
    if (!t) return start(main, ctx);
    return ({ daten: daten, faktoren: faktoren, gewichtung: gewichtung, branchen: branchen, setups: setups, strategien: strategien, chartbild: function (m, c, t, p) { return global.QXLoadChartbild().then(function (CB) { return CB.method(m, c, t, topicHead); }); }, historie: historie, grenzen: grenzen, versionen: versionen })[t.id](main, ctx, t, params);
  }

  var TOPIC_ICON = { daten: "data", faktoren: "bars", gewichtung: "filter", branchen: "network", setups: "setups", strategien: "trend", chartbild: "setups", historie: "clock", grenzen: "warn", versionen: "doc" };
  /* Die Tabs der Konzept-Tafel "Methodik, Vertrauen & Transparenz". */
  var TABS = [[null, "Überblick"], ["faktoren", "Faktoren"], ["daten", "Daten"], ["historie", "Backtesting"], ["grenzen", "Grenzen"]];
  function tabs(current) {
    return el("nav", { class: "q-tabs", "aria-label": "Methodik" }, TABS.map(function (t) {
      return el("a", { href: X.routes.method(t[0] || undefined), "aria-current": t[0] === current ? "true" : "false", text: t[1] });
    }));
  }

  /* Die Stufen-Skala: Grenzen der POSITION unter allen bewerteten Aktien
     (VM.BAND_MIN, gespiegelt aus der Engine, factor-band-2.0.0). */
  var BAND_SCALE_TEXT = { VERY_WEAK: "schwächstes Viertel", WEAK: "25–45 %", NEUTRAL: "45–75 %", STRONG: "75–90 %", VERY_STRONG: "stärkste 10 %" };
  function bandScale() {
    var order = VM.BAND_ORDER.slice().reverse(), words = { VERY_WEAK: "sehr schwach", WEAK: "schwach", NEUTRAL: "durchschnittlich", STRONG: "stark", VERY_STRONG: "sehr stark" };
    return el("div", { class: "q-bands", role: "list", "aria-label": "Stufen nach Position unter allen bewerteten Aktien" }, order.map(function (b, i) {
      return el("div", { class: "b" + (i + 1), role: "listitem" }, [el("b", { class: "num", text: BAND_SCALE_TEXT[b] }), el("small", { text: words[b] })]);
    }));
  }

  function start(main) {
    main.append(el("header", { class: "q-hero q-hero--method" }, [X.globe(),
      el("p", { class: "q-kicker", text: "Methodik" }),
      el("h1", { class: "qx-h1", text: "Transparenz schafft Vertrauen." }),
      el("p", { class: "q-hero-lead v2-lead qx-lead", text: "Keine Blackbox. Jede Einschätzung hat einen Grund – und jeder Grund führt bis zu den Daten, aus denen er entsteht." })]),
      tabs(null));
    /* Abgrenzung in drei Saetzen (Produktpositionierung 04.10.2026). */
    main.append(X.section("Quant, Screener, Discover – was ist was?", null, [el("div", { class: "q-roles" }, [
      ["Quant", "Beobachtet Zustände und Veränderungen nach festen Regeln und vergleicht sie mit dem, was früher im ganzen Markt geschah. Quant meldet sich – du musst nicht suchen.", X.routes.radar(), "Zum Radar"],
      ["Quant Screener", "Findet Aktien, die deine Bedingungen heute erfüllen. Du gibst die Bedingung vor; eine Veränderung oder ein historischer Vergleich ist das nicht.", X.routes.screener(), "Zum Screener"],
      ["Discover", "Entdecken: Themen, Unternehmen und Marktwelten. Keine Regeln, keine Backtests – dafür der Überblick.", "/discover/", "Zu Discover"]
    ].map(function (r) { return el("div", { class: "q-role" }, [el("h3", { text: r[0] }), el("p", { text: r[1] }), el("p", {}, [X.link(r[3], r[2])])]); }))]));
    main.append(X.section("So arbeitet Quant", null, [el("div", { class: "q-rows v2-world-directory qx-method-grid" }, TOPICS.map(function (t) {
      return el("a", { class: "q-rowlink", href: X.routes.method(t.id) }, [el("span", { class: "q-icon", "aria-hidden": "true" }, [X.icon(TOPIC_ICON[t.id] || "doc")]),
        el("span", {}, [el("strong", { text: t.title }), el("small", { text: t.text })])]);
    }))]));
    /* Owner-Auftrag "Quant Daily Usefulness": die Begriffe bleiben intern
       sauber getrennt - die Oberflaeche erklaert sie in Alltagssprache. */
    main.append(X.section("Acht Begriffe, sauber getrennt", "Jede Aussage auf Quant gehört zu genau einer dieser Fragen.", [el("dl", { class: "q-terms" }, [].concat.apply([], [
      ["Faktor", "Wie gut ist die Aktie in einer Eigenschaft – im Vergleich zu allen anderen?"],
      ["Veränderung", "Was bewegt sich gerade – wird eine Eigenschaft besser oder schlechter?"],
      ["Setup", "Entsteht im Kursbild eine konkrete Situation – und wie weit ist sie?"],
      ["Anlagestil", "Zu welcher Strategie passt die Aktie heute?"],
      ["Rückblick", "Was geschah bei dieser Aktie früher in derselben Kurslage?"],
      ["Marktmuster", "Was geschah im ganzen Markt in ähnlichen Fällen?"],
      ["Backtest", "Wie hätte eine fest definierte Regel historisch abgeschnitten? (noch nicht freigegeben)"],
      ["Radar", "Was ist heute neu – welcher Zustand hat sich seit dem letzten Stand geändert?"]
    ].map(function (x) { return [el("dt", { text: x[0] }), el("dd", { text: x[1] })]; })))]));
    main.append(X.section("Unsere Prinzipien", null, [el("div", { class: "q-principles qx-principles" }, [
      el("span", { class: "q-shield", "aria-hidden": "true" }, [X.icon("shield")]),
      el("div", {}, [el("b", { text: "Datenbasiert. Nachvollziehbar. Unabhängig." })].concat(
        ["Belegte Daten mit Stichtag", "Gleiche Regeln für jede Aktie", "Lieber keine Aussage als eine falsche", "Keine Gesamtnote, keine Prognose"].map(function (x) { return el("span", { text: x }); })))]),
      el("ol", { class: "q-rows q-principle-list" }, [
        ["Belegte Daten, mit Stichtag", "Geschäftszahlen aus SEC-Meldungen, Kurse von Tiingo. Jede Zahl trägt ihren Stand. Eine Kennzahl zählt erst ab dem Tag, an dem sie öffentlich bekannt war."],
        ["Gleiche Regeln für jede Aktie", "Faktoren, Setups und Strategien folgen versionierten Regeln. Schwellen werden nicht an Ergebnissen optimiert und nicht für einzelne Titel angepasst."],
        ["Lieber keine Aussage als eine falsche", "Fehlt eine Kennzahl, wird sie nicht geschätzt. Reicht die Datenlage nicht, sagt Quant das – mit der Zahl, die fehlt."],
        ["Keine Gesamtnote, keine Prognose", "Eine einzelne Zahl würde Zielkonflikte verbergen – etwa hohe Qualität bei hohem Preis. Quant zeigt die Eigenschaften einzeln und sagt nie, was passieren wird."]
      ].map(function (p, i) { return el("li", { class: "q-rowlink is-static" }, [el("span", { class: "q-num", text: "0" + (i + 1) }), el("span", {}, [el("strong", { text: p[0] }), el("small", { text: p[1] })])]); }))]));
    main.append(X.section("Wie ein Faktorwert zu lesen ist", "Jeder Faktor ist ein Wert von 0 bis 100, gebildet aus Rangplätzen im Vergleich zu anderen US-Aktien. Die Stufe sagt, wo dieser Wert unter allen bewerteten Aktien liegt.", [bandScale(),
      el("p", { class: "qx-small", text: "„Sehr stark“ heißt: höher als mindestens 90 % der bewerteten Aktien – gezählt am selben Stichtag, je Eigenschaft. Die Stufe ist damit eine relative Einordnung, kein absolutes Gütesiegel: Sie sagt, wie eine Aktie im Vergleich dasteht, nicht, ob sie für sich genommen gut ist." })],
      { href: X.routes.method("faktoren"), label: "Verteilung ansehen" }));
    main.append(X.section("Grenzen offenlegen", "Was Quant bewusst nicht sagt – und wo die Daten derzeit enden.", [el("div", { class: "q-limits" }, [
      ["ban", "Keine Empfehlung", "Quant ordnet ein. Keine Kauf- oder Verkaufsempfehlungen, keine Wahrscheinlichkeiten für künftige Kurse. Setup-Marken sind gekennzeichnete Szenarien."],
      ["nodata", "Fehlende Daten", "Fehlt eine Kennzahl, fällt ihr Gewicht heraus. Unter 80 % Abdeckung entsteht kein Faktorwert."],
      ["clock", "Datenarme Aktien", "Junge oder selten gehandelte Titel haben oft zu wenig Historie – Quant nennt dann die fehlende Zahl."],
      ["bars", "Backtesting", "Strategie-Backtests sind noch nicht freigegeben. Deshalb zeigt Quant keine Trefferquoten."]
    ].map(function (x) { return el("div", {}, [el("span", { class: "q-icon", "aria-hidden": "true" }, [X.icon(x[0])]), el("b", { text: x[1] }), el("span", { text: x[2] })]); }))],
      { href: X.routes.method("grenzen"), label: "Alle Grenzen" }));
    main.append(X.section("Transparenz-Matrix", "Was du bei Quant nachprüfen kannst – und was es (noch) nicht gibt.", [el("div", { class: "q-matrix" }, [
      el("div", { class: "is-yes" }, [el("h3", { text: "Offen gelegt" }), el("ul", {}, [
        "Datenquellen und Stichtag jeder Zahl (SEC EDGAR, Tiingo)", "Kennzahlen, Gewichte und Rohwerte jedes Faktors", "Bedingungen jedes Setups und jeder Strategie",
        "Alle Vergleichsfälle im Rückblick – nie ein herausgegriffener", "Versionen jeder Regel"].map(function (x) { return el("li", { text: x }); }))]),
      el("div", { class: "is-no" }, [el("h3", { text: "Gibt es bewusst nicht – oder noch nicht" }), el("ul", {}, [
        "Gesamtnote oder Rangliste", "Kursziele und Prognosen", "Trefferquoten (Backtesting noch nicht freigegeben)", "Sentiment- und News-Auswertung", "Erwartungstrend (keine zeitpunktgenaue Quelle)"].map(function (x) { return el("li", { text: x }); }))])])]));
    main.append(X.actions([X.btn("Methodik im Detail (technische Dokumentation)", "/quant/methodology/", "secondary"), X.btn("SEC-Dateninspektor", "/quant/data-inspector/", "secondary")]));
  }

  async function daten(main, ctx, t) {
    topicHead(main, t, "Quant verwendet ausschließlich belegte Quellen – und sagt bei jeder Zahl, von wann sie ist.");
    var sum = await global.QuantShell.loadJSON("/quant/data/product/factor-evidence-v1/summary.json").catch(function () { return null; });
    main.append(el("div", { class: "qx-grid qx-grid-2" }, [
      X.card([el("h3", { class: "qx-h3", text: "Geschäftszahlen: SEC EDGAR" }), para("Umsatz, Gewinn, Cashflow, Bilanz – aus den Pflichtmeldungen der Unternehmen (10-K, 10-Q). Maßgeblich ist, wann eine Zahl öffentlich wurde, nicht der Berichtszeitraum."), X.btn("Rohdaten prüfen", "/quant/data-inspector/", "secondary")]),
      X.card([el("h3", { class: "qx-h3", text: "Kurse: Tiingo" }), para("Tagesschlusskurse, splitbereinigt; während der Handelszeit 5-Minuten-Kurse (IEX) und auf der Aktienseite optional ein laufender Kurs. Dividenden sind in Kursentwicklungen nicht enthalten.")])
    ]));
    if (sum && sum.counts) main.append(X.section("Wie groß ist das Universum?", "Stand " + X.dateDe(sum.asOf || (sum.generatedAt || "").slice(0, 10)) + ".", [el("div", { class: "dv2-valuation-grid qx-stats" }, [
      ["US-Titel im Produktuniversum", sum.counts.productUniverse], ["mit veröffentlichter Faktoranalyse", sum.counts.published], ["davon mit Geschäftszahlen", sum.counts.withFundamentals], ["mit belegtem Börsenwert", sum.counts.withMarketCap]
    ].map(function (p) { return el("div", { class: "dv2-valuation-card qx-stat" }, [el("span", { text: p[0] }), el("b", { class: "num", text: typeof p[1] === "number" ? p[1].toLocaleString("de-DE") : "–" })]); }))]));
    main.append(X.section("Wie aktuell?", null, [el("ul", {}, [
      el("li", { text: "Tageskurse und Faktoren werden an jedem Handelstag nach Börsenschluss neu berechnet und veröffentlicht." }),
      el("li", { text: "5-Minuten-Kurse werden während der Sitzung im Takt erneuert; die Seite nennt den Stand mit Uhrzeit." }),
      el("li", { text: "Geschäftszahlen erscheinen, sobald eine neue Meldung vorliegt." }),
      el("li", { text: "Liegt eine Auswertung hinter dem Kurs zurück, steht das auf der Seite – mit der Zahl der Handelstage." })])]));
  }

  async function faktoren(main, ctx, t, params) {
    topicHead(main, t, "Sieben Eigenschaften, jede für sich eingeordnet. Keine Gesamtnote.");
    var shard = await specs(ctx).catch(function () { return null; });
    var cs = (shard && shard.componentSpecs) || {};
    var focus = params && params.get("faktor");
    var gap = await emptyFactors(ctx);
    var emptyText = {}; gap.empty.forEach(function (e) { emptyText[e.id] = e.text; });
    main.append(el("div", { class: "qx-factors" }, VM.ORDER.map(function (id) {
      var f = VM.FACTORS[id];
      var comps = Object.keys(cs).filter(function (k) { return k.indexOf(id + ":") === 0; }).map(function (k) { return cs[k]; });
      var d = el("details", { class: "qx-factor tone-neutral", id: "m-" + id, open: focus === id ? true : null }, [
        el("summary", {}, [el("span", { class: "qx-factor-name", text: f.name }), el("span", { class: "dx-index-badge qx-tag", text: f.method }), el("span", { class: "qx-factor-q", text: f.question })]),
        el("div", { class: "qx-factor-body" }, [para(f.measures), f.notMeasures ? el("p", { class: "qx-small", text: f.notMeasures }) : null, el("p", { class: "qx-small", text: f.higher }),
          emptyText[id] ? X.notice("Derzeit für keine Aktie ein Wert", emptyText[id]) : null,
          comps.length ? el("div", {}, comps.map(function (c) {
            return el("div", { class: "qx-comp" }, [el("span", { text: c.label }), el("b", { text: Math.round(c.weight * 100) + " %" }),
              el("small", { text: (c.direction === "lower" ? "Niedriger ist besser" : "Höher ist besser") + " · " + VM.windowText(c.window) + " · " + c.input + (c.note ? " · " + c.note : "") })]);
          })) : null])]);
      return d;
    })));
    main.append(X.section("Warum kann eine sehr profitable Aktie bei „Bilanz- & Ergebnisqualität“ schwach sein?", null, [X.card([
      para("Dieser Faktor fragt nicht, wie viel ein Unternehmen verdient – das misst die Profitabilität. Er fragt, wie belastbar Bilanz und ausgewiesene Gewinne sind: Sind die Gewinne durch echten Zahlungsfluss gedeckt? Wie hoch ist das Eigenkapital? War die Marge über fünf Jahre stabil?"),
      para("Ein Beispiel ist NVIDIA (Stand der Prüfung: 28.09.2026). Eigenkapitalquote (76 %) und fünf von fünf Jahren mit positivem freien Zahlungsfluss sind stark. Schwach sind zwei Kennzahlen: Der ausgewiesene Gewinn der letzten zwölf Monate lag deutlich über dem operativen Zahlungsfluss, ein großer Teil davon nicht-operative Erträge und gebundenes Umlaufvermögen. Und die operative Marge hat sich in fünf Jahren stark verändert (16 % bis 62 %) – ein struktureller Anstieg, den die Stabilitätsmessung als Schwankung zählt. Die Verschuldungskennzahl fehlt für diesen Titel und fällt aus der Gewichtung."),
      el("p", { class: "qx-small", text: "Das Ergebnis wurde nachgerechnet und ist kein Rechenfehler. Es ist eine Aussage über Bilanz- und Ergebnisqualität, nicht über die Qualität des Geschäfts. Deshalb heißt der Faktor so – und deshalb steht er neben der Profitabilität, nicht an ihrer Stelle." })
    ])], null, "Nachgeprüft"));
    var dist = gap.dist;
    if (dist) main.append(await histogramSection(ctx, dist, focus));
    if (dist) {
      main.append(X.section("Welcher Wert reicht heute für welche Stufe?", "Die Stufe ist die Position unter allen bewerteten Aktien. Weil ein Faktorwert ein Mittel aus mehreren Rangplätzen ist, liegen die Werte je Eigenschaft unterschiedlich eng beieinander – derselbe Wert kann deshalb bei einer Eigenschaft „stark“ und bei einer anderen „durchschnittlich“ sein. Gezählt über alle veröffentlichten Werte:", [
        el("div", { class: "qx-card qx-table-wrap", tabindex: "0", "aria-label": "Mindestwert je Stufe und Eigenschaft" }, [el("table", { class: "qx-table" }, [
          el("thead", {}, [el("tr", {}, ["Eigenschaft", "bewertet", "sehr stark ab", "stark ab", "durchschn. ab", "schwach ab"].map(function (h) { return el("th", { text: h }); }))]),
          el("tbody", {}, VM.ORDER.map(function (id) {
            var d = VM.distributionOf(dist[id] || []);
            return el("tr", {}, [el("td", { text: VM.FACTORS[id].name }), el("td", { class: "num", text: d.n.toLocaleString("de-DE") })].concat(["VERY_STRONG", "STRONG", "NEUTRAL", "WEAK"].map(function (b) {
              return el("td", { class: "num", text: d.n && typeof d.cuts[b] === "number" ? "Wert " + Math.ceil(d.cuts[b]) : "–" });
            })));
          }))])]),
        el("p", { class: "qx-small", text: "Auf jeder Aktienseite steht neben der Stufe die gezählte Position: „höher als bei X % der bewerteten Aktien“ – dieselbe Zählung, aus der die Stufe kommt. Bis zur Fassung factor-band 1 waren die Stufen feste Wertgrenzen (ab 90, 75, 45, 25); sie klangen nach Anteilen, waren aber keine. Fassung factor-band-2.0.0, Methodik: factor-bands-v2.json." })
      ], null, "Offen gelegt"));
    }
  }

  /* Verteilung eines Faktors als Histogramm (10er-Klassen), gezaehlt aus
     allen veroeffentlichten Werten; NVIDIA als markiertes Beispiel - der
     Titel, an dem das Band-Audit gefuehrt wurde. */
  async function histogramSection(ctx, dist, focus) {
    var ex = await ctx.api.getFactorEvidence("NVDA").catch(function () { return null; });
    var exScore = {};
    ((ex && ex.factors) || []).forEach(function (f) { if (f.state === "AVAILABLE" && typeof f.score === "number") exScore[f.id] = f.score; });
    var ids = VM.ORDER.filter(function (id) { return dist[id] && dist[id].length; });
    var cur = ids.indexOf(focus) >= 0 ? focus : ids.indexOf("profitability") >= 0 ? "profitability" : ids[0];
    var host = el("div", { class: "q-hist" });
    var pick = el("div", { class: "q-chips", role: "group", "aria-label": "Faktor wählen" });
    function draw() {
      var vals = dist[cur] || [], bins = []; for (var k = 0; k < 20; k++) bins.push(0);
      var sortedCur = vals.slice().sort(function (a, b) { return a - b; });
      vals.forEach(function (v) { bins[Math.min(19, Math.max(0, Math.floor(v / 5)))]++; });
      var max = Math.max.apply(null, bins) || 1, W = 800, H = 220, bw = W / 20;
      var ns = "http://www.w3.org/2000/svg";
      /* Farben als CSS-Variablen (--q-band-*, app.css): sie folgen dem
         Schema Hell/Dunkel ohne Neuzeichnen. */
      function s(tag, a) { var n = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { n.setAttribute(k, a[k]); }); return n; }
      var svg = s("svg", { viewBox: "0 0 " + W + " " + (H + 22), role: "img", "aria-label": "Verteilung " + VM.FACTORS[cur].name + ": " + bins.map(function (b, i) { return (i * 5) + "–" + (i * 5 + 4) + ": " + b; }).join(", ") });
      bins.forEach(function (b, i) {
        var h = Math.max(1, b / max * (H - 14));
        var band = VM.bandIn(sortedCur, i * 5 + 2.5);
        svg.append(s("rect", { x: i * bw + 2, y: H - h, width: bw - 4, height: h, rx: 3, style: "fill:var(" + ({ VERY_WEAK: "--q-band-1", WEAK: "--q-band-2", NEUTRAL: "--q-band-3", STRONG: "--q-band-4", VERY_STRONG: "--q-band-5" }[band] || "--q-band-none") + ")" }));
        if (i % 2 === 0) { var t = s("text", { x: i * bw, y: H + 16, "text-anchor": i ? "middle" : "start", class: "q-hist-axis" }); t.textContent = String(i * 5); svg.append(t); }
      });
      var mark = exScore[cur];
      if (typeof mark === "number") {
        var x = mark / 100 * W;
        svg.append(s("line", { x1: x, x2: x, y1: 0, y2: H, style: "stroke:var(--q-hist-mark)", "stroke-width": 2, "stroke-dasharray": "4 3" }));
        var lt = s("text", { x: x > W - 90 ? x - 6 : x + 6, y: 12, "text-anchor": x > W - 90 ? "end" : "start", class: "q-hist-axis", "font-weight": "800" }); lt.textContent = "NVDA " + Math.round(mark); svg.append(lt);
      }
      host.replaceChildren(el("p", { class: "q-hist-title" }, [el("b", { text: VM.FACTORS[cur].name + " " }), el("span", { text: vals.length.toLocaleString("de-DE") + " bewertete Aktien" })]), svg);
      pick.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.factor === cur ? "true" : "false"); });
    }
    ids.forEach(function (id) { pick.append(el("button", { type: "button", class: "q-chip", dataset: { factor: id }, text: VM.FACTORS[id].name, onclick: function () { cur = id; draw(); } })); });
    draw();
    return X.section("Wie sich die Werte verteilen", "Anzahl der Aktien je Wertebereich (Klassen zu 5 Punkten), gezählt aus allen veröffentlichten Faktorwerten. Die Farben zeigen die Stufe, die ein Wert dieser Klasse heute erreicht (Position unter allen bewerteten Aktien); die gestrichelte Linie zeigt NVIDIA als Beispiel.", [pick, host, bandScale()], null, "Offen gelegt");
  }

  async function gewichtung(main, ctx, t) {
    topicHead(main, t, "Jede Kennzahl wird im Vergleich eingeordnet; der Faktor ist das gewichtete Mittel der vorhandenen Kennzahlen.");
    main.append(el("ol", { class: "qx-card", style: "padding-left:36px;display:grid;gap:10px" }, [
      el("li", { text: "Extreme Werte werden an den Rändern gekappt (2 % / 98 %), damit ein Ausreißer nicht die Skala bestimmt." }),
      el("li", { text: "Jede Kennzahl bekommt einen Rangplatz von 0 bis 100 – in der eigenen Branche (mindestens 20 vergleichbare Unternehmen), sonst im Wirtschaftszweig (40), sonst im Gesamtmarkt (200)." }),
      el("li", { text: "Branchen- und Gesamtmarkt-Rang werden 70 : 30 gemischt." }),
      el("li", { text: "Der Faktorwert ist das gewichtete Mittel der vorhandenen Kennzahlen. Fehlt eine, fällt ihr Gewicht heraus – es wird nichts geschätzt. Unter 80 % Abdeckung gibt es keinen Faktorwert." }),
      el("li", { text: "Eine Gesamtnote aus allen sieben Faktoren wird bewusst nicht veröffentlicht." })
    ]), el("div", { class: "qx-actions" }, [X.btn("Gewichte je Kennzahl", X.routes.method("faktoren"), "secondary")]));
  }

  async function branchen(main, ctx, t) {
    topicHead(main, t, "Für manche Unternehmensarten sind die allgemeinen Kennzahlen nicht aussagekräftig. Sie bekommen eigene, versionierte Vorlagen.");
    var shard = await specs(ctx).catch(function () { return null; });
    var cs = (shard && shard.componentSpecs) || {};
    main.append(para("Eine Bank hat keine „Bruttomarge“, eine Versicherung verwaltet fremdes Geld in der Bilanz, ein REIT schüttet fast alles aus. Für diese drei Gruppen ersetzt eine Vorlage die Kennzahlen von Qualität, Bewertung und Profitabilität – Wachstum, Kursstärke und Risiko bleiben allgemein. Verglichen wird innerhalb der Gruppe."));
    main.append(el("div", { class: "qx-grid qx-grid-3" }, Object.keys(TEMPLATE_LABEL).map(function (k) {
      var comps = Object.keys(cs).filter(function (x) { return x.indexOf(k + ":") === 0; });
      return X.card([el("h3", { class: "qx-h3", text: TEMPLATE_LABEL[k] }), el("ul", { class: "qx-small" }, comps.map(function (c) {
        var s = cs[c], fid = c.split(":")[1];
        return el("li", { text: (VM.FACTORS[fid] ? VM.FACTORS[fid].name + ": " : "") + s.label + " (" + Math.round(s.weight * 100) + " %)" });
      }))]);
    })));
  }

  async function setups(main, ctx, t) {
    topicHead(main, t, "Ein Setup beschreibt, was im Kursbild einer Aktie am Stichtag beobachtbar ist. Es ist keine Kaufempfehlung und kein Kursziel.");
    var idx = await ctx.api.getSetupScreenIndex().catch(function () { return null; });
    main.append(el("ol", { class: "qx-ladder", style: "max-width:640px" }, VM.SETUP_STAGES.map(function (s, i) { return el("li", { class: i === 3 ? "is-now" : "is-past", text: s.label }); })));
    main.append(el("div", { class: "qx-grid qx-grid-2" }, VM.SETUP_STAGES.map(function (s) {
      var st = idx && idx.state === "AVAILABLE" ? idx.states.filter(function (x) { return x.state === s.id; })[0] : null;
      return X.card([el("h3", { class: "qx-h3", text: s.label }), el("p", { class: "qx-small", text: s.short + "." }),
        st ? el("ul", { class: "qx-small" }, st.rules.map(function (r) { return el("li", { text: r.plain + " (" + r.matched.toLocaleString("de-DE") + " Aktien)" }); })) : null]);
    })));
    main.append(el("p", { class: "qx-small", text: "Die Stufen werden in fester Reihenfolge geprüft; die erste zutreffende Regel entscheidet. Verlaufszustände wie „läuft“ oder „beendet“ brauchen eine lückenlose Beobachtungshistorie und sind noch nicht freigeschaltet." + (idx && idx.state === "AVAILABLE" ? " Zuordnung " + idx.mappingVersion + ", freigegeben am " + X.dateDe(idx.approval && idx.approval.approvedAt) + "." : "") }));
  }

  async function strategien(main, ctx, t) {
    topicHead(main, t, "Ein Anlagestil ist eine Liste von Bedingungen an die sieben Eigenschaften. Quant zählt, welche davon eine Aktie heute erfüllt.");
    var p = await ctx.api.getStrategyProfiles().catch(function () { return null; });
    main.append(X.card([
      para("Passt eine Aktie? Das Verhältnis aus dem Gewicht der erfüllten Bedingungen und dem Gewicht aller messbaren Bedingungen. Eine Bedingung ohne Wert zählt weder als erfüllt noch als verletzt – sie wird als offen ausgewiesen."),
      para("Es gibt bewusst keine Trefferquote und keine historische Rendite eines Stils. Das wäre ein Backtest, und der bleibt geschlossen, bis Universum, Kapitalmaßnahmen und Ausführungsregeln zertifiziert sind."),
      el("p", { class: "qx-small", text: p && p.contract ? "Methodik " + p.contract.methodologyVersion + " · Schwellen gleich für jede Aktie, nicht an Ergebnissen optimiert." : "" })]));
    if (p && p.contract) main.append(el("div", { class: "qx-list", style: "margin-top:14px" }, p.contract.profiles.map(function (pr) {
      return el("a", { class: "qx-row", href: X.routes.strategy(pr.profileId) }, [el("div", { class: "qx-row-main" }, [el("strong", { text: pr.label }),
        el("div", { class: "qx-row-why", text: pr.conditions.map(function (c) { return (VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id) + " ≥ " + c.value; }).join(" · ") })]), el("span", { text: "→" })]);
    })));
  }

  async function historie(main, ctx, t) {
    topicHead(main, t, "Was geschah früher in ähnlichen Situationen? Drei Blickwinkel – und klare Grenzen.");
    main.append(X.actions([X.btn("Zum Backtesting: Regel oder Setup wählen", X.routes.backtest(), "secondary")]));
    /* Der gemessene Stand der Evidenzarten (evidence-status-v1). */
    var ev = await ctx.api.getEvidenceStatus().catch(function () { return null; });
    if (ev && ev.state === "AVAILABLE") {
      main.append(X.section(["Null", "Eine", "Zwei", "Drei", "Vier", "Fünf", "Sechs"][ev.kinds.length] + " Arten historischer Evidenz", "Streng getrennt. Zahlen gibt es nur, wo die Methodik sie trägt – sonst steht da, was fehlt.", [el("div", { class: "q-evkinds" }, ev.kinds.map(function (k) {
        var pub = k.state === "PUBLISHED";
        return el("div", { class: "q-evkind " + (pub ? "is-on" : "is-off") }, [el("b", { text: k.label }), el("span", { class: "q-evkind-state", text: pub ? "veröffentlicht" : "zurückgehalten" }),
          el("p", { text: k.question }),
          pub ? el("p", { class: "qx-small", text: (k.gate && k.gate.rule) || "" }) : el("ul", {}, (k.checks || []).map(function (c) { return el("li", { class: c.state === "PASS" ? "is-pass" : "is-fail" }, [el("span", { text: (c.state === "PASS" ? "✓ " : "✗ ") + c.label }), el("small", { text: " – nötig: " + c.required + " · heute: " + c.measured })]); }))]);
      })), ev.measures && ev.measures.HISTORICAL_REPLAY_COVERAGE ? el("p", { class: "qx-small", text: "Rückblick heute: für " + ev.measures.HISTORICAL_REPLAY_COVERAGE.sufficient.m6.toLocaleString("de-DE") + " von " + ev.measures.HISTORICAL_REPLAY_COVERAGE.universe.toLocaleString("de-DE") + " Aktien reichen die Vergleichsfälle für Zahlen nach 6 Monaten (mindestens 10 abgeschlossene Fälle); bei " + ev.measures.HISTORICAL_REPLAY_COVERAGE.broad.m6.toLocaleString("de-DE") + " ist die Evidenz breit (ab 30)." }) : null]));
    }
    main.append(el("div", { class: "qx-grid qx-grid-3" }, [
      X.card([el("h3", { class: "qx-h3", text: "1 · Dieselbe Aktie, dieselbe Kurslage" }), el("p", { class: "qx-small", text: "Wann stand die Aktie schon einmal in genau dieser Kurslage (etwa nahe am Jahreshoch, über der 40-Wochen-Linie)? Gezählt wird die erste Woche jeder zusammenhängenden Phase – eine zwölf Wochen lange Lage ist ein Fall, nicht zwölf." })]),
      X.card([el("h3", { class: "qx-h3", text: "2 · Was danach geschah" }), el("p", { class: "qx-small", text: "Für jeden Fall die Kursentwicklung nach 3, 6 und 12 Monaten: Median, Anteil der Fälle im Plus, typischer Rückgang. Erst ab 10 abgeschlossenen Fällen – darunter wäre ein Median Zufall, und es wird keiner gezeigt." })]),
      X.card([el("h3", { class: "qx-h3", text: "3 · Der ganze Markt" }), el("p", { class: "qx-small", text: "Vorregistrierte Muster über alle Aktien seit Jahrzehnten: Wie oft folgte in ähnlichen Lagen ein starker Gewinn oder ein deutlicher Verlust – verglichen mit der Grundgesamtheit? Nur Muster, die auch außerhalb des Zeitraums hielten, in dem sie gefunden wurden." })])
    ]));
    main.append(X.section("Grenzen", null, [el("ul", {}, [
      el("li", { text: "Keine Prognose: Vergangene Fälle sagen nicht, was diese Aktie tun wird." }),
      el("li", { text: "Wochenraster: Rückschläge innerhalb einer Woche sind unsichtbar." }),
      el("li", { text: "Überlappende Zeitfenster: Fälle sind nicht unabhängig voneinander." }),
      el("li", { text: "Überlebende: Eine Aktie mit langer Historie ist per Konstruktion eine, die überlebt hat; das hebt absolute Quoten." }),
      el("li", { text: "Nur Kursbedingungen bei der eigenen Historie – die Geschäftslage der Vergangenheit fließt nicht ein." }),
      el("li", { text: "Kursentwicklung ohne Dividenden." }),
      el("li", { text: "Nie ein einzelner herausgesuchter Fall – immer die ganze Menge oder nichts." })])]));
  }

  async function grenzen(main, ctx, t) {
    topicHead(main, t, "Was Quant bewusst nicht sagt – und wo die Daten derzeit enden.");
    var gap = await emptyFactors(ctx);
    main.append(el("div", { class: "qx-grid qx-grid-2" }, [].concat(gap.empty.map(function (e) {
      return X.card([el("h3", { class: "qx-h3", text: e.name + ": derzeit ohne Werte" }), para(e.text),
        el("p", { class: "qx-small", text: "Deshalb werden für jede Aktie höchstens " + (VM.ORDER.length - gap.empty.length) + " von " + VM.ORDER.length + " Eigenschaften bewertet – für alle gleich." })]);
    }), [
      X.card([el("h3", { class: "qx-h3", text: "Keine Gesamtnote" }), para("Ein Gesamtwert ist spezifiziert, aber nicht freigegeben, solange Erwartungstrend, Branchenvergleich und zeitpunktgenaue Historie nicht produktionsreif sind.")]),
      X.card([el("h3", { class: "qx-h3", text: "Fehlende Kennzahlen" }), para("Fehlt eine Kennzahl, fällt ihr Gewicht aus dem Faktor. Unter 80 % Abdeckung entsteht kein Faktorwert. Auf jeder Aktienseite steht, welche Kennzahl fehlt."),
        el("p", { class: "qx-small", text: "Bekannte Lücke: Die Nettoverschuldung liegt derzeit nur für einen kleinen Teil der Aktien vor, weil Schulden- und Cashflow-Zeiträume noch nicht sicher zusammenpassen. Sie wird erst eingerechnet, wenn das belegt ist." })]),
      X.card([el("h3", { class: "qx-h3", text: "Datenarme Aktien" }), para("Junge Aktien, Börsengänge oder selten gehandelte Titel haben oft zu wenig Historie. Quant nennt dann die Zahl: „Für diese Analyse werden 252 Handelstage benötigt; vorhanden sind 116.“")]),
      X.card([el("h3", { class: "qx-h3", text: "ETFs und Vorzugsaktien" }), para(VM.reasonText("NOT_AN_EQUITY_LISTING") + " Kursverlauf und Kursstruktur werden trotzdem gezeigt, wo sie vorliegen.")]),
      X.card([el("h3", { class: "qx-h3", text: "Keine Empfehlung" }), para("Quant ordnet ein. Es gibt keine Kauf- oder Verkaufsempfehlungen, keine Kursziele und keine Wahrscheinlichkeiten für zukünftige Kurse.")])
    ])));
  }

  async function versionen(main, ctx, t) {
    topicHead(main, t, "Jede Regel ist versioniert. Eine geänderte Regel ist eine neue Version – nie eine stille Anpassung.");
    var r = await Promise.all([ctx.api.getFactorEvidence("MSFT").catch(function () { return null; }), ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyProfiles().catch(function () { return null; })]);
    var rows = [["Faktoren", r[0] && r[0].methodologyVersion], ["abgeleitet aus", r[0] && r[0].derivedFrom], ["Veränderung", r[0] && r[0].change && r[0].change.methodologyVersion],
      ["Setups", r[1] && r[1].state === "AVAILABLE" ? r[1].engineVersion + " · " + r[1].mappingVersion : null], ["Strategien", r[2] && r[2].contract && r[2].contract.methodologyVersion],
      ["Historical Replay", "historical-cases-1.0.0 · pattern-research-1.0.0"], ["Produktsprache", VM.VERSION]];
    main.append(X.card([el("dl", { class: "qx-kv" }, [].concat.apply([], rows.map(function (x) { return [el("dt", { text: x[0] }), el("dd", { class: "num", text: x[1] || "–" })]; })))]),
      el("div", { class: "qx-actions" }, [X.btn("Alle Methodikdateien", "/quant/methodology/", "secondary")]));
  }

  global.QXMethod = { render: render, TOPICS: TOPICS };
})(window);
