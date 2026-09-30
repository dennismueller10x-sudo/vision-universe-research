/* =========================================================================
   VISION UNIVERSE QUANT — app/page-method.js                     Methodik

   Beginnt mit der Frage "Warum kann ich dem Ergebnis vertrauen?" und
   verzweigt in Themen. Jede Zahl auf dieser Seite wird aus den
   veroeffentlichten Methodik- und Datenartefakten gelesen oder aus ihnen
   gezaehlt - nichts ist hineingeschrieben, was sich aendern kann.

   Der Abschnitt "Wie die Stufen verteilt sind" ist die oeffentliche
   Antwort auf das Band-Audit: die Stufen sind feste Wertgrenzen, keine
   Anteile, und die gemessene Verteilung steht daneben.
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
    { id: "historie", title: "Historical Replay & Muster", text: "Was ähnliche Situationen früher zeigten – und was nicht." },
    { id: "grenzen", title: "Grenzen & fehlende Daten", text: "Was Quant bewusst nicht sagt, und warum." },
    { id: "versionen", title: "Versionen", text: "Welche Methodik gerade gilt." }
  ];
  var TEMPLATE_LABEL = { BALANCE_SHEET_FINANCIAL: "Banken und bilanzbasierte Finanzunternehmen", INSURANCE_CARRIER: "Versicherer", REAL_ESTATE_TRUST: "Immobilien-REITs" };

  function topicHead(main, t, lead) {
    main.append(el("a", { class: "qx-back", href: X.routes.method(), text: "← Methodik" }),
      el("span", { class: "qx-eyebrow", text: "Methodik" }), el("h1", { class: "qx-h1", text: t.title }), lead ? el("p", { class: "qx-lead", text: lead }) : null);
  }
  function para(t) { return el("p", { text: t }); }

  async function specs(ctx) {
    var shard = await global.QuantShell.loadCompressedJSON("/quant/data/product/factor-evidence-v1/MS.json.gz");
    return shard;
  }

  async function render(main, ctx, topic, params) {
    var t = TOPICS.filter(function (x) { return x.id === topic; })[0];
    if (!t) return start(main, ctx);
    return ({ daten: daten, faktoren: faktoren, gewichtung: gewichtung, branchen: branchen, setups: setups, strategien: strategien, historie: historie, grenzen: grenzen, versionen: versionen })[t.id](main, ctx, t, params);
  }

  function start(main) {
    main.append(el("span", { class: "qx-eyebrow", text: "Methodik" }),
      el("h1", { class: "qx-h1", text: "Warum kann ich dem Ergebnis vertrauen?" }),
      el("p", { class: "qx-lead", text: "Keine Blackbox. Jede Einschätzung hat einen Grund – und jeder Grund führt bis zu den Daten, aus denen er entsteht." }));
    main.append(el("div", { class: "qx-grid qx-grid-2", style: "margin-top:8px" }, [
      X.card([el("h3", { class: "qx-h3", text: "Belegte Daten, mit Stichtag" }), el("p", { class: "qx-small", text: "Geschäftszahlen aus SEC-Meldungen, Kurse von Tiingo. Jede Zahl trägt ihren Stand. Eine Kennzahl zählt erst ab dem Tag, an dem sie öffentlich bekannt war." })]),
      X.card([el("h3", { class: "qx-h3", text: "Gleiche Regeln für jede Aktie" }), el("p", { class: "qx-small", text: "Faktoren, Setups und Strategien folgen versionierten Regeln. Schwellen werden nicht an Ergebnissen optimiert und nicht für einzelne Titel angepasst." })]),
      X.card([el("h3", { class: "qx-h3", text: "Lieber keine Aussage als eine falsche" }), el("p", { class: "qx-small", text: "Fehlt eine Kennzahl, wird sie nicht geschätzt. Reicht die Datenlage nicht, sagt Quant das – mit der Zahl, die fehlt (fail-closed)." })]),
      X.card([el("h3", { class: "qx-h3", text: "Keine Gesamtnote, keine Prognose" }), el("p", { class: "qx-small", text: "Eine einzelne Zahl würde Zielkonflikte verbergen – etwa hohe Qualität bei hohem Preis. Quant zeigt die Eigenschaften einzeln und sagt nie, was passieren wird." })])
    ]));
    main.append(X.section("Themen", null, [el("div", { class: "qx-method-grid" }, TOPICS.map(function (t) {
      return el("a", { class: "qx-row qx-card", style: "border-radius:var(--qx-radius);", href: X.routes.method(t.id) }, [
        el("div", { class: "qx-row-main" }, [el("strong", { text: t.title }), el("div", { class: "qx-row-why", text: t.text })]), el("span", { "aria-hidden": "true", text: "→" })]);
    }))]));
    main.append(el("div", { class: "qx-actions" }, [X.btn("Methodik im Detail (technische Dokumentation)", "/quant/methodology/", "secondary"), X.btn("SEC-Dateninspektor", "/quant/data-inspector/", "secondary")]));
  }

  async function daten(main, ctx, t) {
    topicHead(main, t, "Quant verwendet ausschließlich belegte Quellen – und sagt bei jeder Zahl, von wann sie ist.");
    var sum = await global.QuantShell.loadJSON("/quant/data/product/factor-evidence-v1/summary.json").catch(function () { return null; });
    main.append(el("div", { class: "qx-grid qx-grid-2" }, [
      X.card([el("h3", { class: "qx-h3", text: "Geschäftszahlen: SEC EDGAR" }), para("Umsatz, Gewinn, Cashflow, Bilanz – aus den Pflichtmeldungen der Unternehmen (10-K, 10-Q). Maßgeblich ist, wann eine Zahl öffentlich wurde, nicht der Berichtszeitraum."), X.btn("Rohdaten prüfen", "/quant/data-inspector/", "secondary")]),
      X.card([el("h3", { class: "qx-h3", text: "Kurse: Tiingo" }), para("Tagesschlusskurse, splitbereinigt; während der Handelszeit 5-Minuten-Kurse (IEX) und auf der Aktienseite optional ein laufender Kurs. Dividenden sind in Kursentwicklungen nicht enthalten.")])
    ]));
    if (sum && sum.counts) main.append(X.section("Wie groß ist das Universum?", "Stand " + X.dateDe(sum.asOf || (sum.generatedAt || "").slice(0, 10)) + ".", [el("div", { class: "qx-stats" }, [
      ["US-Titel im Produktuniversum", sum.counts.productUniverse], ["mit veröffentlichter Faktoranalyse", sum.counts.published], ["davon mit Geschäftszahlen", sum.counts.withFundamentals], ["mit belegtem Börsenwert", sum.counts.withMarketCap]
    ].map(function (p) { return el("div", { class: "qx-stat" }, [el("span", { text: p[0] }), el("b", { class: "num", text: typeof p[1] === "number" ? p[1].toLocaleString("de-DE") : "–" })]); }))]));
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
    main.append(el("div", { class: "qx-factors" }, VM.ORDER.map(function (id) {
      var f = VM.FACTORS[id];
      var comps = Object.keys(cs).filter(function (k) { return k.indexOf(id + ":") === 0; }).map(function (k) { return cs[k]; });
      var d = el("details", { class: "qx-factor tone-neutral", id: "m-" + id, open: focus === id ? true : null }, [
        el("summary", {}, [el("span", { class: "qx-factor-name", text: f.name }), el("span", { class: "qx-tag", text: f.method }), el("span", { class: "qx-factor-q", text: f.question })]),
        el("div", { class: "qx-factor-body" }, [para(f.measures), f.notMeasures ? el("p", { class: "qx-small", text: f.notMeasures }) : null, el("p", { class: "qx-small", text: f.higher }),
          id === "revisions" ? X.notice("Derzeit ohne Daten", VM.reasonText("BLOCKED_EXTERNAL")) : null,
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
    var dist = await ctx.distributionRows().catch(function () { return null; });
    if (dist) {
      main.append(X.section("Wie die Stufen verteilt sind", "Die Stufen sind feste Wertgrenzen auf dem Faktorwert – keine Anteile des Marktes. Weil ein Faktorwert ein Mittel aus mehreren Rangplätzen ist, sammeln sich die Werte in der Mitte. „Sehr stark“ ist deshalb viel seltener als jede zehnte Aktie. Gezählt über alle veröffentlichten Werte:", [
        el("div", { class: "qx-card qx-table-wrap", tabindex: "0", "aria-label": "Verteilung der Stufen je Faktor" }, [el("table", { class: "qx-table" }, [
          el("thead", {}, [el("tr", {}, ["Eigenschaft", "bewertet", "sehr stark (≥ 90)", "stark (≥ 75)", "durchschn. (≥ 45)", "schwach (≥ 25)", "sehr schwach"].map(function (h) { return el("th", { text: h }); }))]),
          el("tbody", {}, VM.ORDER.map(function (id) {
            var d = VM.distributionOf(dist[id] || []);
            return el("tr", {}, [el("td", { text: VM.FACTORS[id].name }), el("td", { class: "num", text: d.n.toLocaleString("de-DE") })].concat(VM.BAND_ORDER.map(function (b) {
              return el("td", { class: "num", text: d.n ? (d.bands[b] / d.n * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %" : "–" });
            })));
          }))])]),
        el("p", { class: "qx-small", text: "Auf jeder Aktienseite steht deshalb zusätzlich die gezählte Position: „höher als bei X % der bewerteten Aktien“. Eine Neukalibrierung der Stufen wäre eine neue, versionierte Methodik – sie wird nicht stillschweigend vorgenommen." })
      ], null, "Offen gelegt"));
    }
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
    main.append(el("div", { class: "qx-grid qx-grid-2" }, [
      X.card([el("h3", { class: "qx-h3", text: "Erwartungstrend: ohne Daten" }), para(VM.reasonText("BLOCKED_EXTERNAL")), el("p", { class: "qx-small", text: "Deshalb werden höchstens sechs von sieben Eigenschaften bewertet – für jede Aktie gleich." })]),
      X.card([el("h3", { class: "qx-h3", text: "Keine Gesamtnote" }), para("Ein Gesamtwert ist spezifiziert, aber nicht freigegeben, solange Erwartungstrend, Branchenvergleich und zeitpunktgenaue Historie nicht produktionsreif sind.")]),
      X.card([el("h3", { class: "qx-h3", text: "Fehlende Kennzahlen" }), para("Fehlt eine Kennzahl, fällt ihr Gewicht aus dem Faktor. Unter 80 % Abdeckung entsteht kein Faktorwert. Auf jeder Aktienseite steht, welche Kennzahl fehlt."),
        el("p", { class: "qx-small", text: "Bekannte Lücke: Die Nettoverschuldung liegt derzeit nur für einen kleinen Teil der Aktien vor, weil Schulden- und Cashflow-Zeiträume noch nicht sicher zusammenpassen. Sie wird erst eingerechnet, wenn das belegt ist." })]),
      X.card([el("h3", { class: "qx-h3", text: "Datenarme Aktien" }), para("Junge Aktien, Börsengänge oder selten gehandelte Titel haben oft zu wenig Historie. Quant nennt dann die Zahl: „Für diese Analyse werden 252 Handelstage benötigt; vorhanden sind 116.“")]),
      X.card([el("h3", { class: "qx-h3", text: "ETFs und Vorzugsaktien" }), para(VM.reasonText("NOT_AN_EQUITY_LISTING") + " Kursverlauf und Kursstruktur werden trotzdem gezeigt, wo sie vorliegen.")]),
      X.card([el("h3", { class: "qx-h3", text: "Keine Empfehlung" }), para("Quant ordnet ein. Es gibt keine Kauf- oder Verkaufsempfehlungen, keine Kursziele und keine Wahrscheinlichkeiten für zukünftige Kurse.")])
    ]));
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
