/* =========================================================================
   VISION UNIVERSE QUANT — app/page-stock.js              Die Aktienanalyse

   Owner-Mockup "Quant – Optimiertes UI Konzept" (23.10.2026), auf VU3
   (docs/design/VU3_UI_SYSTEM.md): Ergebnis zuerst, Details auf Klick.
   Sechs kompakte Bereiche derselben Seite:

     1 Ueberblick   VUStockNavigator.head (Kurs, Analysewelten), der eine
                    Kurschart, Quant-Ergebnis mit drei Kennzahlen
     2 einordnung   Die Quant-Eigenschaften bis zu den Rohdaten
     3 dafuer       Staerken & Risiken
     4 veraenderung Aktuelle Veraenderungen (Filter) und Radar-Ereignisse
     5 setup        Setup & Strategie (mit strategie und technik)
     6 historie     Historischer Vergleich (Ueberblick, A/B/C dahinter)
     danach zahlen, Unternehmen (zugeklappt), grenzen (Was fehlt,
     Daten & Methodik). Mobil werden 2-6 nebeneinander gewischt (deck).

   Jede Aussage kommt aus dem View Model (app/view-model.js), das nur
   veroeffentlichte Vertraege liest. Wo Daten fehlen, steht warum - mit
   Zahl, wo es eine gibt. Die qx-Klassen sind Anker fuer Tests, keine
   Gestaltung.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;

  /* Discovers Signalfarben fuer die Faktor-Chips im Kopf. */
  var SIG = { good: "strength", neutral: "quality", bad: "breakout", unknown: "muted" };
  /* Bildwelt der Anlagestile: dieselben Fotografien wie Discovers
     Perspektiven, je nach Sinn zugeordnet. */
  var STRATEGY_ART = {
    "quality-compounder": "langfristige-compounder", "momentum-leader": "momentum-leader", "quality-momentum": "stabile-aufwaertstrends",
    "garp": "qualitaet-zum-preis", "future-leader": "umsatz-waechst-stark", "defensive-quality": "starke-bilanz-wachstum",
    "value-momentum": "comeback", "earnings-revision-leader": "gewinne-beschleunigen"
  };
  function strategyArt(id) {
    var key = STRATEGY_ART[id] || STRATEGY_ART[String(id || "").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")];
    return key ? "/assets/discover-perspektiven/" + key + ".jpeg" : null;
  }

  function foot(text) { return el("p", { class: "dx-kapitel-fuss", text: text }); }
  /* Ein Abschnitt als Karte (qv2-card) bzw. als Teil einer Karte (qv2-sub). */
  function card(node) { node.classList.add("qv2-card"); return node; }
  function sub(node) { node.classList.add("qv2-sub"); return node; }

  /* UI-Konzept 23.10.2026 (Owner-Mockup "Quant – Optimiertes UI Konzept"): Symbole als Linienzeichnung, Farbe nur
     zusaetzlich zur Stufe in Worten und Zeichen. */
  var ICO = {
    quality: "M12 3l8 3v6c0 4.6-3.4 7.9-8 9-4.6-1.1-8-4.4-8-9V6z M9 12l2 2 4-4",
    growth: "M3 17l6-6 4 4 8-8 M15 7h6v6",
    momentum: "M13 2L4 14h7l-1 8 9-12h-7z",
    value: "M3 12V3h9l9 9-9 9z M7.5 7.5h.01",
    profitability: "M12 2v20 M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    revisions: "M4 19h16 M7 15v-4 M12 15V7 M17 15v-6",
    risk: "M12 3l10 18H2z M12 10v5 M12 18h.01",
    up: "M12 19V5 M5 12l7-7 7 7", down: "M12 5v14 M19 12l-7 7-7-7", flat: "M5 12h14",
    check: "M5 12.5l4.5 4.5L19 7", clock: "M12 7v5l3 2 M12 3a9 9 0 100 18 9 9 0 000-18z",
    info: "M12 11v6 M12 7h.01 M12 3a9 9 0 100 18 9 9 0 000-18z", alert: "M12 8v5 M12 16.5h.01 M12 3a9 9 0 100 18 9 9 0 000-18z"
  };
  function ico(id, cls) {
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); if (cls) svg.setAttribute("class", cls);
    String(ICO[id] || ICO.info).split(" M").forEach(function (d, i) { var p = document.createElementNS(ns, "path"); p.setAttribute("d", (i ? "M" : "") + d); svg.append(p); });
    return svg;
  }
  function factorIcon(id, tone) { return el("span", { class: "qv2-ico tone-" + (tone || "unknown"), "aria-hidden": "true" }, [ico(id)]); }

  /* VU3: Erklaertext hinter einer Aufklappzeile (vu-more) statt sichtbar. */
  function moreText(title, text) {
    return el("details", { class: "vu-more qv-more" }, [el("summary", { text: title }), el("div", { class: "vu-more-body qv-more-body" }, [el("p", { text: text })])]);
  }

  /* ------------------------------------------------ 01 Faktor-Karte
     Eine Karte in Discovers Zahlen-Raster (dx-zahlen-karte). Antippen
     klappt sie ueber die ganze Breite auf: Komponenten, Rohwerte,
     Gewichte, Stufe, Referenz, Stichtag, Methodik. */
  /* Stufenzeichen: stark / Mittelfeld / schwach / nicht bewertbar. */
  var TONE_GLYPH = { good: "▲", neutral: "◆", bad: "▼", unknown: "–" };
  function glyphPill(pill, tone) { pill.prepend(el("i", { class: "qx-glyph", "aria-hidden": "true", text: TONE_GLYPH[tone] || "–" })); return pill; }
  function factorCard(f, ticker) {
    var d = el("details", { class: "qx-factor dx-zahlen-karte tone-" + f.tone, id: "faktor-" + f.id, dataset: { factor: f.id } });
    var available = f.state === "AVAILABLE";
    /* Visual First (VU3): Name und Wert in einer Zeile, Stufe mit Zeichen (Bedeutung nie nur ueber Farbe),
       Balken, Position im Markt mit Feldgroesse. Der Begruendungssatz steht in den Details; fehlt die
       Bewertung, bleibt der Grund sichtbar. */
    /* VU3: eine flache Zeile - Name, Stufe mit Zeichen, Wert. Der Balken 0-100 steht oben in der Einordnung
       (factorBars); hier oeffnet die Zeile die Belege bis zu den Rohdaten. */
    /* UI-Konzept 23.10.2026: Symbol, Name mit Stufe, Balken 0-100 und Wert in einer Zeile; der Pfeil sagt "mehr". */
    d.append(el("summary", { class: "qx-frow" }, [
      factorIcon(f.id, available ? f.tone : "unknown"),
      el("span", { class: "qx-fr-name" }, [el("span", { class: "qx-fr-label", text: f.name }),
        glyphPill(X.pill(available ? (f.word || f.label) : "Nicht bewertbar", f.tone), available ? f.tone : "unknown")]),
      el("b", { class: "qx-fr-value num", text: available ? String(Math.round(f.score)) : "–" }),
      available ? el("span", { class: "vu-bar qv2-fbar", "aria-hidden": "true", style: "--v:" + Math.max(2, Math.min(100, f.score)).toFixed(0) }, [el("i")])
        : el("span", { class: "qx-fr-sub", text: f.missingText }),
      el("i", { class: "qv2-chev", "aria-hidden": "true" })
    ]));
    var body = el("div", { class: "qx-factor-body" }, [available && f.why ? el("p", { class: "dx-zahlen-satz qx-fr-why", text: f.why }) : null]);
    d.append(body);
    var built = false;
    d.addEventListener("toggle", function () {
      if (!d.open || built) return; built = true;
      body.append(el("p", { class: "dx-bewertung-erklaerung" }, [el("b", { text: f.question + " " }), document.createTextNode(f.measures + (f.notMeasures ? " " + f.notMeasures : ""))]));
      if (available) {
        body.append(el("div", { class: "dx-firma" }, [
          el("div", {}, [el("span", { text: "Einordnung" }), el("b", { text: f.label })]),
          f.rankText ? el("div", {}, [el("span", { text: "Position im Markt" }), el("b", { text: f.rankText.replace(/\.$/, "") })]) : null,
          el("div", {}, [el("span", { text: "Datenabdeckung" }), el("b", { text: f.coverageText || "–" })]),
          f.confidence ? el("div", {}, [el("span", { text: "Belastbarkeit" }), el("b", { text: f.confidence })]) : null
        ]));
      }
      if (f.components.length) {
        body.append(el("h3", { class: "qx-sub", text: "Woraus der Wert besteht" }));
        f.components.forEach(function (c) {
          var ok = c.state === "AVAILABLE";
          body.append(el("div", { class: "dx-bewertung-zeile qx-comp" + (ok ? "" : " is-missing"), dataset: { component: c.id } }, [
            el("span", { class: "dx-bewertung-name", text: c.label }),
            el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [ok ? el("i", { style: "width:" + Math.max(2, Math.min(100, c.score)).toFixed(1) + "%" }) : null]),
            el("b", { class: "num", text: ok ? (c.value || "–") : "fehlt" }),
            el("small", { text: ok ? "Punkte " + c.scoreText + " · Gewicht " + (c.weightText || "–") + " · " + (c.direction || "") +
              (c.peer ? " · " + c.peer.level + (c.peer.size ? " (" + c.peer.size + " Unternehmen)" : "") : "") + (c.window ? " · Zeitraum: " + c.window : "")
              : c.missing + " Gewicht " + (c.weightText || "–") + " – der Faktor wird aus den übrigen Kennzahlen gebildet." })
          ]));
        });
      }
      /* NVDA-Audit: wer "schwach" liest, soll hier lesen, was der Faktor
         NICHT misst - dort, wo die Frage entsteht. */
      if (f.id === "quality" && available && f.tone === "bad") {
        body.append(el("p", { class: "dx-bewertung-lesart", text: "Wichtig: Dieser Faktor bewertet Bilanz und die Deckung der Gewinne durch Zahlungsfluss – nicht, wie profitabel oder erfolgreich das Geschäft ist. Ein Unternehmen kann hier schwach und in der Profitabilität sehr stark sein." }));
      }
      body.append(X.more("Rohdaten und Berechnung", function () {
        var kids = [el("p", { class: "qx-small", text: f.reference }),
          el("p", { class: "qx-small", text: "Jede Kennzahl wird im Vergleich eingeordnet (Rangplatz 0–100, extreme Werte an den Rändern gekappt), der Faktorwert ist das gewichtete Mittel der vorhandenen Kennzahlen. Fehlende Kennzahlen werden nicht ersetzt; ihr Gewicht fällt heraus." })];
        f.components.forEach(function (c) {
          kids.push(el("pre", { class: "qx-code", text: c.label + "\n  Formel: " + (c.input || "–") + "\n  Rohwert: " + (c.value || "–") +
            "\n  Punkte: " + (c.score === null ? "–" : c.score) + (c.peer ? " (Vergleichsgruppe " + c.peer.percentile + ", Gesamtmarkt " + c.universePercentile + ")" : "") +
            "\n  Gewicht: " + (c.weightText || "–") + (c.note ? "\n  Hinweis: " + c.note : "") + (c.reason ? "\n  Status: fehlt" : "") }));
        });
        kids.push(el("p", { class: "dx-kapitel-fuss dx-kapitel-fuss--link" }, [X.link("Methodik dieses Faktors", X.routes.method("faktoren") + "?faktor=" + f.id)]));
        return kids;
      }));
    });
    return d;
  }

  /* Bedingungen als Liste in Discovers Waage-Form (Marke + Satz + Beleg). */
  function conditions(list, emptyText) {
    if (!list || !list.length) return el("p", { class: "qx-small", text: emptyText });
    return el("ul", { class: "qx-conds" }, list.map(function (c) {
      var tone = c.state === "MET" ? "good" : c.state === "NOT_MET" ? "bad" : "unknown";
      return el("li", { class: "tone-" + tone }, [
        el("i", { class: "dx-waage-marke", "aria-hidden": "true", text: c.state === "MET" ? "✓" : c.state === "NOT_MET" ? "✗" : "–" }),
        el("div", {}, [el("b", { text: c.label + (c.state === "OPEN" ? " – nicht messbar" : "") }),
          el("span", { text: ([c.demand, c.value || c.value2].filter(function (x) { return x && typeof x === "string"; }).join(" · ") || c.text || "") + (c.state === "OPEN" ? " · zählt weder als erfüllt noch als verletzt" : "") })])
      ]);
    }));
  }

  /* Visual First (VU3): Regel-Checkliste. Oben die Zaehlung mit Zeichen (✓ erfuellt, ✗ nicht erfuellt, – nicht messbar) und
     ein Feld je Bedingung, darunter "Bedingungen ansehen" mit der bisherigen Liste (verlangt · aktuell). Ohne Bedingungen: der Satz. */
  function condCheck(list, emptyText, detail) {
    if (!list || !list.length) return conditions(list, emptyText);
    var n = { MET: 0, NOT_MET: 0, OPEN: 0 };
    list.forEach(function (c) { n[c.state === "MET" ? "MET" : c.state === "NOT_MET" ? "NOT_MET" : "OPEN"]++; });
    var WORD = { MET: ["✓", "erfüllt", "good"], NOT_MET: ["✗", "nicht erfüllt", "bad"], OPEN: ["–", "nicht messbar", "unknown"] };
    return el("div", { class: "q-check" }, [
      el("p", { class: "q-check-count" }, [el("b", { class: "num", text: n.MET + " von " + list.length }), el("span", { text: " erfüllt" })].concat(
        ["NOT_MET", "OPEN"].filter(function (k) { return n[k]; }).map(function (k) { return el("span", { class: "q-check-more tone-" + WORD[k][2], text: " · " + WORD[k][0] + " " + n[k] + " " + WORD[k][1] }); }))),
      el("ol", { class: "q-check-cells", "aria-hidden": "true" }, list.map(function (c) {
        var k = c.state === "MET" ? "MET" : c.state === "NOT_MET" ? "NOT_MET" : "OPEN";
        return el("li", { class: "tone-" + WORD[k][2], title: c.label + ": " + WORD[k][1], text: WORD[k][0] });
      })),
      el("details", { class: "q-check-details" }, [el("summary", { text: "Bedingungen ansehen" }), detail || conditions(list, emptyText)])]);
  }

  /* ------------------------------------------------ Die Einordnung
     Die Antwort auf "Wie steht die Aktie da?" in Discovers Form ("Der
     Blick auf die Aktie"): ein Satz, die sieben Eigenschaften als Chips,
     die Kursstaerke auf der Zeitachse - und darunter die Waage (spricht
     dafuer / dagegen). Sie steht direkt hinter dem einen Chart, wie in
     Discover; gemessen wird ihre Lage (M40) im Production-Smoke. */
  /* UI-Konzept 23.10.2026 - Ansicht 1 "Ueberblick & Ergebnis": das Quant-Ergebnis als getoente Karte (Satz der
     Engine, Zaehlung), drei Kennzahlen und der Weg in die Analyse. Die sieben Balken stehen jetzt im Abschnitt
     "Die Quant-Eigenschaften"; Setup, Veraenderungen und Anlagestil stehen in ihren Abschnitten - keine
     Doppelnennung. Keine neue Zahl: jede Kennzahl ist ein Faktorwert mit Beleg weiter unten. */
  var STRIP_WORD = { good: "stark", neutral: "Mittelfeld", bad: "schwach", unknown: "nicht bewertbar" };
  /* Die drei Kennzahlen: staerkste und schwaechste gemessene Eigenschaft, dazu das Risiko (sonst die
     zweitstaerkste) - der schnellste Blick auf das, was traegt und was bremst. */
  function keyFactors(vm) {
    var rated = vm.factors.filter(function (f) { return f.state === "AVAILABLE"; });
    if (!rated.length) return [];
    var bySc = rated.slice().sort(function (a, b) { return b.score - a.score; });
    var pick = [bySc[0]];
    if (bySc.length > 1) pick.push(bySc[bySc.length - 1]);
    var risk = rated.filter(function (f) { return f.id === "risk"; })[0];
    var third = risk && pick.indexOf(risk) < 0 ? risk : bySc.filter(function (f) { return pick.indexOf(f) < 0; })[0];
    if (third) pick.push(third);
    return vm.factors.filter(function (f) { return pick.indexOf(f) >= 0; });
  }
  function keyTiles(vm) {
    var list = keyFactors(vm);
    return list.length ? el("ul", { class: "qv2-keys", "aria-label": "Wichtigste Kennzahlen, Wert 0 bis 100" }, list.map(function (f) {
      return el("li", { class: "tone-" + f.tone }, [el("a", { href: "#faktor-" + f.id, "aria-label": f.name + ": " + Math.round(f.score) + " von 100, " + (f.word || STRIP_WORD[f.tone]) }, [
        el("span", { class: "qv2-key-n", "aria-hidden": "true", text: f.name }),
        el("b", { class: "qv2-key-v num", "aria-hidden": "true", text: String(Math.round(f.score)) }),
        el("small", { class: "qv2-key-w", "aria-hidden": "true", text: TONE_GLYPH[f.tone] + " " + (f.word || STRIP_WORD[f.tone]) })])]);
    })) : null;
  }
  function verdictCard(vm, factorsReason, missingNote) {
    var o = vm.overall;
    /* qx-verdict-card nur, wo es eine Aussage gibt - ein ETF oder ein Titel
       ohne Faktorzeile traegt keine. */
    var node = el("section", { class: "qx-glance qv-glance qv2-glance" + (vm.factorState === "AVAILABLE" ? " qx-verdict-card" : " qx-verdict-none"), id: "einordnung-kurz" });
    if (vm.factorState === "AVAILABLE") {
      node.append(el("div", { class: "qx-verdict-top qv2-result", dataset: { tone: o.tone } }, [
        el("span", { class: "qv2-result-ico", "aria-hidden": "true" }, [ico(o.tone === "good" ? "up" : o.tone === "bad" ? "down" : "flat")]),
        el("div", {}, [el("h2", { class: "qv2-result-k", text: "Was sagt Quant insgesamt?" }),
          el("p", { class: "vu-result qv-result" }, [el("span", { text: o.text })]),
          el("p", { class: "qv-sub", text: o.sub })])]), keyTiles(vm) || el("span"));
      if (o.rated < 3) node.append(el("ul", { class: "dx-kann qx-open" }, vm.gaps.map(function (g) {
        return el("li", { class: "nein" }, [el("b", { text: g.names.join(", ") }), el("span", { text: " – " + g.text })]);
      })));
    } else {
      node.append(el("div", { class: "qx-verdict-top qv2-result", dataset: { tone: "unknown" } }, [
        el("span", { class: "qv2-result-ico", "aria-hidden": "true" }, [ico("info")]),
        el("div", {}, [el("h2", { class: "qv2-result-k", text: "Quant-Ergebnis" }),
          el("p", { class: "vu-result qv-result", text: factorsReason === "NOT_AN_EQUITY_LISTING" ? "Keine Unternehmensanalyse für diesen Titel" : "Noch keine Einordnung möglich" }),
          el("p", { class: "qv-sub", text: VM.reasonText(factorsReason, "Für diesen Titel ist keine Faktoranalyse veröffentlicht.") + " " + missingNote })])]));
    }
    if (vm.factorState === "AVAILABLE" && o.rated > 0) node.append(el("a", { class: "qv2-cta", href: "#einordnung" }, [el("span", { text: "Zur Analyse" }), el("i", { class: "qv2-chev", "aria-hidden": "true" })]));
    node.append(el("p", { class: "qv-limit", text: (vm.factorState === "AVAILABLE" ? "Einordnung im Vergleich zu allen bewerteten US-Aktien – " : "") + "keine Anlageempfehlung, keine Prognose." }));
    return node;
  }
  /* Kursentwicklung (Kursstaerke und Anlegerrendite) - steht im Abschnitt der Eigenschaften, bei der Kursstaerke. */
  function returnsBlock(vm) {
    /* Die Kursentwicklung zeigt der Chart (Zeitraum waehlbar) - hier nur der Unterschied Kursstaerke/Anlegerrendite,
       aufklappbar. Keine zweite Zahlenreihe neben dem Chart. */
    if (!vm.returns || vm.returns.state !== "AVAILABLE") return [];
    return [moreText("Kursstärke und Anlegerrendite", vm.returns.rows.map(function (r) { return r.label.replace("12 Monate ohne den letzten", "12 Monate*") + ": Kursstärke " + r.price + ", Anlegerrendite " + r.investor; }).join(" · ") + "." +
        (vm.returns.rows.some(function (r) { return /ohne den letzten/.test(r.label); }) ? " *12 Monate ohne den letzten Monat." : "") + " Kursstärke misst nur den Kurs, die Anlegerrendite rechnet Ausschüttungen mit ein. " + vm.returns.text)];
  }

  /* ------------------------------------------------ Die Waage
     Spricht dafuer / dagegen wie Discovers "Was dafür spricht — und was
     dagegen" (dx-waage). Drei Punkte je Seite offen, der Rest dahinter;
     und was NICHT bewertet wurde, steht dabei. */
  function balanceSection(vm) {
    var o = vm.overall, pc = vm.proCon;
    var ART = { good: "pro", bad: "contra" };
    /* UI-Konzept 23.10.2026: je Punkt Symbol, Titel mit Wert, ein Satz und der Pfeil zur Eigenschaft. */
    function punkt(i, art) {
      return el("li", {}, [el("a", { href: "#faktor-" + i.factorId, class: "qx-waage-link qv2-pt" }, [
        el("i", { class: "dx-waage-marke", "aria-hidden": "true", text: art === "pro" ? "+" : art === "contra" ? "−" : "◆" }),
        el("span", { class: "qv2-pt-ico", "aria-hidden": "true" }, [ico(i.factorId)]),
        el("span", { class: "qv2-pt-main" }, [el("b", { text: i.title + " (" + Math.round(i.score) + ")" }),
          el("span", { text: i.text + (i.caveat ? " " + i.caveat : "") })]),
        el("i", { class: "qv2-chev", "aria-hidden": "true" })])]);
    }
    function col(title, tone, items, empty, sub) {
      var art = ART[tone];
      /* Staerkste Staerke bzw. groesstes Risiko zuerst. */
      items = items.slice().sort(function (a, b) { return tone === "bad" ? a.score - b.score : b.score - a.score; });
      var host = el("div", { class: "dx-waage-spalte dx-waage-spalte--" + art + " qx-pc-col qv2-panel tone-" + tone }, [
        el("div", { class: "qv2-panel-h" }, [el("span", { class: "qv2-panel-ico", "aria-hidden": "true" }, [ico(tone === "good" ? "up" : "alert")]),
          el("h3", { text: title }), el("small", { text: sub })])]);
      if (!items.length) { host.append(el("p", { class: "qx-pc-empty", text: empty })); return host; }
      /* Die drei staerksten Punkte je Seite sichtbar, weitere dahinter. */
      host.append(el("ul", {}, items.slice(0, 3).map(function (i) { return punkt(i, art); })));
      if (items.length > 3) host.append(el("details", { class: "dx-weitere dx-waage-weitere qx-more" }, [el("summary", { text: "Weitere Punkte (" + (items.length - 3) + ")" }),
        el("ul", {}, items.slice(3).map(function (i) { return punkt(i, art); }))]));
      return host;
    }
    var kids = [el("div", { class: "dx-waage qv2-waage" }, [
      col("Spricht dafür", "good", pc.pro, "Keine der gemessenen Eigenschaften ist stark.", pc.pro.length ? "Top " + Math.min(3, pc.pro.length) + " Stärken" : "Stärken"),
      col("Spricht dagegen", "bad", pc.con, "Keine der gemessenen Eigenschaften ist schwach.", "Haupt-Risiken")
    ])];
    if (pc.middle.length) kids.push(el("div", { class: "qx-middle qv2-panel tone-neutral" }, [el("div", { class: "qv2-panel-h" }, [el("span", { class: "qv2-panel-ico", "aria-hidden": "true" }, [ico("flat")]),
      el("h3", { text: "Im Mittelfeld" })]), el("ul", {}, pc.middle.map(function (m) { return punkt({ factorId: m.factorId, title: m.title.replace(/: [^:]+$/, ""), score: m.score, text: String(m.label || "durchschnittlich").replace(/\s*\(\d+\)$/, "") + " – weder Stärke noch Schwäche" }, "middle"); }))]));
    if (pc.open.length) kids.push(el("details", { class: "dx-weitere qx-more" }, [el("summary", { text: "Noch nicht bewertbar (" + pc.open.length + ")" }),
      el("ul", { class: "dx-kann" }, pc.open.map(function (i) { return el("li", { class: "nein" }, [el("b", { text: i.title }), el("span", { text: " – " + i.text })]); }))]));
    kids.push(foot("Eine Gesamtnote gibt es bewusst nicht: Sie würde Zielkonflikte verbergen, etwa hohe Qualität bei hoher Bewertung. Keine Empfehlung."));
    return kids;
  }

  /* ------------------------------------------------ 03 Setup */
  function setupSection(vm) {
    var s = vm.setup;
    if (s.state === "UNAVAILABLE") return [el("p", { class: "dx-chapter-lead", text: s.text })];
    var kids = [el("p", { class: "dv2-valuation-question", text: s.label })];
    kids.push(el("ol", { class: "qx-ladder", "aria-label": "Stufen eines Setups" }, s.stages.map(function (st, i) {
      return el("li", { class: i === s.stageIndex ? "is-now" : i < s.stageIndex ? "is-past" : null, "aria-current": i === s.stageIndex ? "step" : null, text: st.label });
    })));
    kids.push(el("dl", { class: "qx-qa" }, [
      el("div", { class: "dx-bewertung-satz" }, [el("dt", { text: "Wo steht die Aktie?" }), el("dd", { text: s.label + (s.stageIndex < 0 ? "" : " – " + (s.stages[s.stageIndex] || {}).short) + "." })]),
      s.why ? el("div", { class: "dx-bewertung-satz" }, [el("dt", { text: "Warum?" }), el("dd", { text: s.why })]) : null,
      s.next ? el("div", { class: "dv2-valuation-card" }, [el("dt", { text: "Was müsste als Nächstes passieren?" }), el("dd", {}, [el("p", { text: s.next.text }), conditions(s.next.conditions, "")])]) : null,
      s.invalidation ? el("div", { class: "dv2-valuation-card" }, [el("dt", { text: "Was würde das Setup ungültig machen?" }), el("dd", {}, [
        el("p", { text: s.invalidation.text + (s.invalidation.price ? " Die beschriebene Invalidierungsmarke liegt bei " + X.money(s.invalidation.price) + "." : "") }),
        conditions(s.invalidation.conditions, "")])]) : null
    ]));
    kids.push(X.more("Alle geprüften Bedingungen", function () { return [conditions(s.conditions, "Keine Bedingungen veröffentlicht."), el("p", { class: "dx-kapitel-fuss dx-kapitel-fuss--link" }, [X.link("Wie Setups entstehen", X.routes.method("setups"))])]; }));
    kids.push(foot("Datenstand des Laufs " + X.dateDe(s.asOf) + " – das ist der Stand der technischen Auswertung, nicht dem täglichen Kursstand gleichzusetzen" +
      (s.previous && s.previous.label && s.previous.asOf && s.asOf && s.previous.asOf < s.asOf ? " · vorher: " + s.previous.label + " (" + X.dateDe(s.previous.asOf) + ")" : "") +
      ". Ein Setup beschreibt, was am Stichtag im Kursbild beobachtbar ist – kein Kursziel, keine Einstiegsregel und keine Aussage darüber, ob es eintritt."));
    return kids;
  }

  /* ------------------------------------------------ 04 Anlagestil */
  function strategySection(vm, change) {
    var s = vm.strategy, changeText = VM.assignmentChangeText(change);
    if (s.state !== "AVAILABLE") return [el("p", { class: "dx-chapter-lead", text: s.text }), changeText ? foot(changeText) : null];
    var b = s.best;
    /* VU3: Satz, Regel-Checkliste, ein Link zum Stil - ohne Bildkarte. Risiko, Evidenzstand und die anderen Stile
       stehen hinter "Mehr". */
    /* UI-Konzept 23.10.2026: eine Zeile - Satz, Zaehlung, Weg zum Stil; die Regel-Checkliste steht im Aufklapper. */
    var kids = [el("a", { class: "qv-link qx-strategy-link qv2-strat", href: X.routes.strategy(b.id) }, [el("span", { class: "qv2-ico tone-" + (s.fits ? "good" : "unknown"), "aria-hidden": "true" }, [ico(s.fits ? "check" : "flat")]),
      el("span", {}, [el("strong", { class: "qx-strategy-sentence", text: s.sentence }), el("small", { text: b.countText })]), el("i", { class: "qv2-chev", "aria-hidden": "true" })])];
    /* Visual First (VU3): die Bedingungen als Regel-Checkliste (✓ ✗ –); die Waage Erfuellt / Offen / Nicht erfuellt steht unveraendert dahinter. */
    var check = (condCheck(b.met.concat(b.notMet, b.open), "Keine Bedingungen veröffentlicht.", el("div", { class: "dx-waage qx-waage-3" }, [
      el("div", { class: "dx-waage-spalte dx-waage-spalte--pro qx-pc-col tone-good" }, [el("h3", { text: "Erfüllt" }), conditions(b.met, "Keine Bedingung erfüllt.")]),
      el("div", { class: "dx-waage-spalte qx-pc-col qx-open-col tone-unknown" }, [el("h3", { text: "Offen" }), conditions(b.open, "Alle Bedingungen sind messbar.")]),
      el("div", { class: "dx-waage-spalte dx-waage-spalte--contra qx-pc-col tone-bad" }, [el("h3", { text: "Nicht erfüllt" }), conditions(b.notMet, "Keine Bedingung verletzt.")])
    ])));
    /* VU3-Finalisierung: ein Zuordnungswechsel ist eine Nachricht und bleibt sichtbar; "nichts geaendert" steht mit
       Bedeutung des Stils und den anderen Stilen in EINEM Aufklapper. */
    var changed = change && change.state === "CHANGED";
    if (changeText && changed) kids.push(el("p", { class: "qx-small", text: changeText }));
    kids.push(X.more("Bedingungen, Bedeutung und andere Anlagestile", function () {
      return [check, changeText && !changed ? el("p", { class: "qx-small", text: changeText }) : null, el("p", { class: "qx-small", text: b.plain }),
        s.fits ? null : el("p", { class: "qx-small", text: "Das beschreibt die Nähe zu einem Bedingungssatz und keine Prognose." }),
        b.risk ? el("p", { class: "qx-small", text: "Typisches Risiko dieses Stils: " + b.risk }) : null,
        /* Anlagestil heisst "welche Art von Investment passt" - nicht "getestete Strategie". */
        el("p", { class: "q-setup-evidence" }, [el("span", { class: "q-ev-tier tier-tested is-off", text: "Historische Strategieperformance" }),
          el("span", { text: " " + (s.fits ? "Der Anlagestil passt aktuell. " : "") + "Wie sich dieser Stil historisch entwickelt hat, ist noch nicht getestet und nicht zertifiziert – dafür fehlen die historische Index-Zugehörigkeit und eine längere Faktorhistorie." })]),
        el("h4", { class: "qx-sub-h", text: "Weitere Anlagestile im Vergleich" }),
        el("div", { class: "qx-list" }, s.others.map(function (o) {
        return el("a", { class: "qx-row", href: X.routes.strategy(o.id) }, [
          el("div", { class: "qx-row-main" }, [el("div", { class: "qx-row-title" }, [el("span", { class: "qx-row-name", text: o.label })]), el("div", { class: "qx-row-why", text: o.countText })]),
          el("div", { class: "qx-row-side" }, [o.bandLabel ? el("small", { text: o.bandLabel }) : null])]);
      })), el("p", { class: "qx-small", text: "Gezählt werden erfüllte Bedingungen – keine Trefferquote und keine historische Erfolgsaussage." })];
    }));
    return kids;
  }

  function bucketLabel(d) {
    function p(v) { return (v > 0 ? "+" : "") + Math.round(v * 100); }
    if (d.from === null) return "unter " + p(d.to) + " %";
    if (d.to === null) return "über " + p(d.from) + " %";
    return p(d.from) + " bis " + p(d.to) + " %";
  }
  /* ------------------------------------------------ 05 Rueckblick */
  /* ------------------------------------------------ Was geschah frueher?
     Drei Evidenzstufen, sichtbar getrennt (evidence-language-1.0.0):
       A Historisch beobachtet - diese Aktie in aehnlicher Lage (Replay)
       B Historisch getestet   - marktweit getestetes Signal, mit Base Rate
       C Zertifiziert          - nur mit Status CERTIFIED
     Jede Quote mit Bedeutungssatz; Rueckgang zuerst als Satz. */
  /* Visual First (VU3): Ueberblick der drei Evidenzstufen vor den Einzelheiten - je Stufe Zeichen, Hauptwert und Bezug
     (Stichprobe, Abstand zum Markt, Evidenzstand), ein Tipp springt zur Stufe. Nur Werte, die die Stufen darunter zeigen.
     Die marktweite Stufe kommt mit der Radar-Karte; bis dahin steht sie als "wird geladen" da. */
  /* VU3-Finalisierung: zuerst drei Saetze in Alltagssprache - was frueher bei dieser Aktie geschah, was marktweit
     getestet ist und wie belastbar das ist. Fachbegriffe (beobachtet, getestet, zertifiziert, Point-in-Time) und die
     Pruefbedingungen stehen in "Einzelheiten und Methodik". Nur Werte, die die Einzelheiten belegen; keine Prognose. */
  /* UI-Konzept 23.10.2026 - Ansicht 6: ein Umschalter "Diese Aktie frueher" / "Gesamter Markt", die Hauptzahl gross,
     darunter das typische Ergebnis je Zeitfenster als Balken (nur Fenster mit genug Faellen) und die Aussagekraft als
     eigene Karte. Dieselben Werte wie in "Einzelheiten und Methodik"; nichts davon ist eine Prognose. */
  function evidenceOverview(vm) {
    var E = global.QXEvidence, same = vm.replay.levels.filter(function (lv) { return lv.id === "SAME_STOCK"; })[0];
    var main = same && same.state === "AVAILABLE" ? (same.horizons || []).filter(function (h) { return h.id === "m6" && h.sufficient; })[0] || (same.horizons || []).filter(function (h) { return h.sufficient; }).slice(-1)[0] : null;
    var span = function (label) { return String(label || "").replace(/^(\d+) Monate$/, "$1 Monate"); };
    var nach = function (label) { return "nach " + String(label || "").replace(/Monate$/, "Monaten").replace(/Monat$/, "Monat"); };
    function row(id, label, kids, off) {
      var t = el("div", { class: "q-evo-t" }, kids);
      var li = el("div", { class: "q-evo-row qv2-evpane" + (off ? " is-off" : ""), id: "qv2-ev-" + id, role: "tabpanel" }, [el("span", { class: "q-evo-k", text: label }), t,
        el("a", { class: "q-evo-more", href: "#" + id, "aria-label": label + ": Einzelheiten", text: "Einzelheiten" })]);
      li.qText = t;
      return li;
    }
    function bars(hs) {
      var ok = hs.filter(function (h) { return h.sufficient && typeof h.medianRaw === "number"; });
      if (ok.length < 2) return null;
      var top = Math.max.apply(null, ok.map(function (h) { return Math.abs(h.medianRaw); })) || 1;
      return el("div", { class: "qv2-hbars", role: "img", "aria-label": "Typisches Ergebnis je Zeitfenster: " + ok.map(function (h) { return h.label + " " + h.median; }).join(", ") }, [
        el("div", { class: "qv2-hbar is-start" }, [el("b", { text: "" }), el("i", { style: "--h:2%" }), el("small", { text: "Heute" })])].concat(ok.map(function (h) {
        return el("div", { class: "qv2-hbar " + (h.medianRaw < 0 ? "down" : "up") + (h === main ? " is-main" : "") }, [el("b", { class: "num", text: h.median }),
          el("i", { style: "--h:" + Math.max(4, Math.round(Math.abs(h.medianRaw) / top * 100)) + "%" }), el("small", { text: "+" + String(h.label).replace(/ Monate?$/, " M") })]);
      })));
    }
    var share = main && typeof main.positiveRaw === "number" ? main.positiveRaw : main && main.positivePct ? parseFloat(String(main.positivePct).replace(",", ".")) / 100 : null;
    var stock = main
      ? row("ev-a", "Diese Aktie früher", [el("p", { class: "qv2-ev-big" }, [el("b", { class: "num", text: (main.positivePct || "–") + " höher" })]),
          el("p", { class: "qv2-ev-sub", text: "In " + main.completed + " ähnlichen Lagen stand der Kurs " + span(main.label) + " später in " + (main.positivePct || "–") + " der Fälle höher." + (main.median ? " Typisches Ergebnis " + nach(main.label) + ": " + main.median + "." : "") }),
          bars(same.horizons || []) || (typeof share === "number" && isFinite(share) ? el("span", { class: "vu-bar q-evo-bar", "aria-hidden": "true", style: "--v:" + Math.max(2, Math.min(100, share * 100)).toFixed(0) }, [el("i")]) : null)])
      : row("ev-a", "Diese Aktie früher", [el("p", { class: "qv2-ev-sub", text: same && same.state === "INSUFFICIENT"
          ? "Zu wenige ähnliche Lagen für einen Rückblick (" + (same.episodes || 0) + " Fälle, nötig " + (same.minEpisodes || 10) + ")."
          : "Kein Rückblick möglich – die Kurshistorie reicht nicht aus." })], true);
    var tested = row("ev-b", "Im ganzen Markt", [el("p", { class: "qv2-ev-sub", text: "wird geladen …" })], true);
    tested.hidden = true;
    var tabA = el("button", { type: "button", role: "tab", "aria-selected": "true", "aria-controls": "qv2-ev-ev-a", text: "Diese Aktie früher" + (main ? " (" + main.completed + ")" : "") });
    var tabB = el("button", { type: "button", role: "tab", "aria-selected": "false", "aria-controls": "qv2-ev-ev-b", text: "Gesamter Markt" });
    function pick(a) { tabA.setAttribute("aria-selected", a ? "true" : "false"); tabB.setAttribute("aria-selected", a ? "false" : "true"); stock.hidden = !a; tested.hidden = a; }
    tabA.addEventListener("click", function () { pick(true); }); tabB.addEventListener("click", function () { pick(false); });
    var why = el("span", { class: "q-evo-why", text: (main ? (main.completed < 30 ? "wenige Fälle dieser Aktie · " : "") : "kein Rückblick dieser Aktie · ") + "noch kein zertifizierter Backtest" });
    var strength = el("p", { class: "q-evo-strength qv2-warn" }, [el("span", { class: "qv2-warn-ico", "aria-hidden": "true" }, [ico("alert")]),
      el("span", {}, [el("span", { class: "vu-status q-evo-pill", dataset: { tone: "warn" }, text: "Aussagekraft begrenzt" }), why])]);
    var node = el("div", { class: "q-evo qv2-evo", role: "group", "aria-label": "Rückblick in Kürze" }, [el("div", { class: "qv2-seg", role: "tablist", "aria-label": "Vergleich" }, [tabA, tabB]),
      el("div", { class: "q-evo-rows" }, [stock, tested]), strength]);
    return { node: node, setTested: function (card) {
      var ev = ((card && card.events) || []).filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; })[0];
      var t = tested.qText;
      if (ev && E) {
        var b = ev.backtest, edge = E.edgeOf(b), word = E.EDGE_SHORT[edge.id];
        tested.classList.remove("is-off");
        var d = b.deltaPositiveShare, hasD = typeof d === "number" && isFinite(d);
        t.replaceChildren(el("p", { class: "qv2-ev-big" }, [el("b", { class: "num", text: E.share1(b.positiveShare) + " höher" })]),
          el("p", { class: "qv2-ev-sub" }, [document.createTextNode("Aktien mit demselben getesteten Signal lagen nach 6 Monaten "),
          el("b", { class: "num", text: hasD ? (d === 0 ? "genauso oft" : E.pp(Math.abs(d)).replace(/^[+±]/, "").replace(" Pp", " Prozentpunkte")) : E.share1(b.positiveShare) }),
          document.createTextNode(hasD ? (d === 0 ? " im Plus wie der Markt" : (d > 0 ? " häufiger" : " seltener") + " im Plus als der Markt") + (word ? " – " + word : "") + "." : " der Fälle im Plus.")]));
        if (b.trust !== "USABLE" && b.trust !== "ROBUST") why.textContent = why.textContent.replace("noch kein", "marktweite Belege " + (E.TRUST_SHORT[b.trust] || "nicht bereit") + " · noch kein");
      } else t.replaceChildren(el("p", { class: "qv2-ev-sub", text: "Derzeit löst bei dieser Aktie kein marktweit getestetes Signal aus." }));
    } };
  }
  function replaySection(vm, conditionWords, evidence, signalHost, overview) {
    var r = vm.replay, E = global.QXEvidence, kids = [];
    var nach = function (label) { return "nach " + String(label || "").replace(/Monate$/, "Monaten"); };
    var same = r.levels.filter(function (lv) { return lv.id === "SAME_STOCK"; })[0];
    var wide = r.levels.filter(function (lv) { return lv.id === "MARKET_WIDE"; })[0];

    /* A */
    var a = [el("p", { class: "q-ev-level-title", text: "A · Diese Aktie selbst" })];
    if (same && same.state === "AVAILABLE") {
      var main = (same.horizons || []).filter(function (h) { return h.id === "m6" && h.sufficient; })[0] ||
        (same.horizons || []).filter(function (h) { return h.sufficient; }).slice(-1)[0] || null;
      var box = [el("p", { class: "q-ev-head" }, [el("span", { class: "q-ev-tier tier-observed", text: "Historisch beobachtet" }), el("b", { text: same.episodes + " ähnliche Situationen seit " + String(same.from).slice(0, 4) })])];

      if (main) {
        box.push(el("p", { class: "q-ev-big" }, [el("b", { class: "num", text: main.positivePct || "–" }), el("span", { text: " der Fälle lagen " + nach(main.label) + " höher" })]));
        box.push(el("div", { class: "q-ev-stats" }, [
          el("div", { class: "q-ev-stat" }, [el("b", { class: "num " + (main.medianRaw > 0 ? "up" : main.medianRaw < 0 ? "down" : ""), text: main.median || "–" }), el("span", { text: "typisches Ergebnis (Median) " + nach(main.label) })]),
          el("div", { class: "q-ev-stat" }, [el("b", { class: "num down", text: main.drawdown || "–" }), el("span", { text: "typischer Rückgang zwischendurch" })]),
          el("div", { class: "q-ev-stat" }, [el("b", { class: "num", text: String(main.completed) }), el("span", { text: "abgeschlossene Fälle" })])]));
        var dd = E ? E.drawdownSentence(main.drawdownRaw, main.worstDrawdownRaw) : null;
        if (dd) box.push(el("p", { class: "q-ev-note", text: dd }));
      } else box.push(el("p", { text: same.text }));
      box.push(moreText("Was „ähnlich“ heißt – und was das nicht ist", (same.conditions && same.conditions.length ? "Ähnlich heißt: " + same.conditions.map(function (id) { return conditionWords[id] || id.replace(/-/g, " "); }).join(" · ") + ". " : "") +
        "Beobachtet, nicht getestet: Das beschreibt nur die Vergangenheit dieser Aktie. Es gibt keine Vergleichsrate mit dem Markt, die Fälle überlappen sich zeitlich, und Dividenden sind nicht enthalten."));
      box.push(X.more("Alle Zeitfenster und die Verteilung", function () { return sameStockDetails(same, main); }));
      a.push(el("div", { class: "q-ev-observed" }, box));
    } else a.push(el("p", { class: "qx-muted", text: same ? same.text : "Für diese Aktie liegt kein Rückblick vor." }));

    /* B */
    var bHost = signalHost || el("div", {});
    var b = [el("p", { class: "q-ev-level-title", text: "B · Marktweit getestetes Signal" }), bHost];
    if (wide && wide.state === "AVAILABLE") b.push(X.more("Ähnliche Lagen im ganzen Markt (Musterforschung)", function () { return marketWideDetails(wide); }));
    else if (wide && !(same && same.text === wide.text)) b.push.apply(b, marketWideDetails(wide));

    /* C */
    var c = [el("p", { class: "q-ev-level-title", text: "C · Zertifizierter Backtest" }), E ? E.certifiedLine(null) : null];
    var closed = evidence && evidence.state === "AVAILABLE" ? evidence.kinds.filter(function (k) { return k.state === "WITHHELD"; }) : [];
    if (closed.length) c.push(el("ul", { class: "q-ev-closed" }, closed.map(function (k) { return el("li", { text: closedKindSentence(k) }); })));

    if (overview) kids.push(overview.node);
    /* VU3: der Ueberblick oben traegt die Hauptwerte; die Stufen A und B im Einzelnen stehen hinter "Mehr".
       C (Zertifizierung) bleibt sichtbar - es sagt, was noch fehlt. Ein Tipp auf eine Kachel oeffnet die Einzelheiten. */
    /* VU3-Finalisierung: Stufen A, B und C (Zertifizierung mit den offenen Pruefbedingungen) stehen zusammen in
       "Einzelheiten und Methodik"; die Kurzfassung oben nennt die begrenzte Aussagekraft bereits. */
    var detail = el("details", { class: "vu-more qv-ev-more" }, [el("summary", { text: "Einzelheiten und Methodik" }),
      el("div", { class: "vu-more-body q-ev-levels" }, [el("div", { id: "ev-a" }, a), el("div", { id: "ev-b" }, b), el("div", { class: "is-wide", id: "ev-c" }, c)])]);
    if (overview) overview.node.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("a[href='#ev-a'],a[href='#ev-b']"); if (t) detail.open = true; });
    kids.push(detail);
    kids.push(foot(r.isNot));
    kids.push(el("p", { class: "dx-kapitel-fuss dx-kapitel-fuss--link" }, [X.link("Wie der Rückblick rechnet", X.routes.method("historie")), el("span", { text: " · " }), X.link("Alle getesteten Signale", X.routes.backtest())]));
    return [el("div", { class: "qx-replay" }, kids)];
  }
  /* Ein geschlossener Backtest in einem Satz statt einer Fachliste. */
  function closedKindSentence(k) {
    var fail = (k.checks || []).filter(function (ch) { return ch.state === "FAIL"; });
    var first = fail[0];
    return k.label + ": noch keine Zahlen." + (first ? " Es fehlt unter anderem: " + first.label + " (nötig " + first.required + ", heute " + first.measured + ")." : "") +
      (fail.length > 1 ? " Dazu " + (fail.length - 1) + " weitere Bedingung" + (fail.length > 2 ? "en" : "") + "." : "");
  }
  function sameStockDetails(lv, main) {
    var out = [el("ol", { class: "q-timeline", "aria-label": "Ausgang nach Zeitfenster" }, [el("li", { class: "is-now" }, [el("b", { text: "Heute" }), el("small", { text: "Ausgangslage" })])].concat((lv.horizons || []).map(function (h) {
      return el("li", { class: h.sufficient ? (h.medianRaw > 0 ? "up" : h.medianRaw < 0 ? "down" : "") : "is-off" }, [el("b", { class: "num", text: h.sufficient ? h.median : "–" }),
        el("small", { text: h.label + (h.sufficient ? " · " + h.positivePct + " höher · typ. Rückgang " + (h.drawdown || "–") : " · zu wenige Fälle") })]);
    })))];
    var dist = main && main.distribution;
    if (dist) {
      var most = Math.max.apply(null, dist.map(function (d) { return d.count; })) || 1;
      out.push(el("div", { class: "q-dist", role: "img", "aria-label": "Verteilung der Ausgänge nach " + main.label + ": " + dist.map(function (d) { return bucketLabel(d) + " " + d.count; }).join(", ") }, dist.map(function (d) {
        return el("div", { class: "q-dist-bar " + (d.to !== null && d.to <= 0 ? "down" : "up") }, [el("i", { style: "--h:" + Math.round(d.count / most * 100) + "%" }), el("b", { class: "num", text: String(d.count) }), el("small", { text: bucketLabel(d) })]);
      })), el("p", { class: "qx-small", text: "Verteilung der " + main.completed + " abgeschlossenen Fälle nach " + main.label + " (Kursveränderung)." }));
    }
    if (main && main.chanceRisk !== null && main.chanceRisk !== undefined) out.push(el("p", { class: "qx-small", text: "Typischer größter Anstieg geteilt durch typischen größten Rückgang: " + main.chanceRisk.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " (über 1 heißt: der typische Anstieg war größer als der typische Rückgang)." }));
    var lastCase = (lv.horizons || []).map(function (h) { return h.lastCase; }).filter(Boolean).sort().pop();
    out.push(el("p", { class: "qx-small", text: "Zeitraum " + String(lv.from).slice(0, 4) + "–" + String(lv.to).slice(0, 4) + ", nur Kursbedingungen im Wochenraster." + (lastCase ? " Letzter abgeschlossener Fall: " + X.dateDe(lastCase) + "." : "") + " Gezeigt werden immer alle Fälle zusammen, nie ein einzelner herausgegriffener." }));
    if (lv.limits && lv.limits.length) out.push(el("ul", { class: "qx-small" }, lv.limits.map(function (l) { return el("li", { text: l }); })));
    return out;
  }
  function marketWideDetails(lv) {
    var c = [];
    /* Kein Treffer ist eine Aussage, kein leerer Kasten. */
    if (lv.state !== "AVAILABLE") { c.push(el("p", { class: "qx-muted", text: lv.text })); return c; }
    c.push(el("p", { class: "dx-bewertung-lesart", text: lv.text }));
    var up = lv.upside, down = lv.downside;
    var widest = Math.max(up ? up.conditional || 0 : 0, up ? up.base || 0 : 0, down ? down.conditional || 0 : 0, down ? down.base || 0 : 0, 0.0001);
    function bar(label, value, base, tone) {
      return el("div", { class: "dx-bewertung-zeile" + (base !== null ? " dx-bewertung-zeile--eigen" : "") + " tone-" + tone }, [el("span", { class: "dx-bewertung-name", text: label }),
        el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.max(2, (value || 0) / widest * 100).toFixed(1) + "%" })]),
        el("b", { class: "num", text: VM.pct(value, 1) })]);
    }
    if (up && down) {
      c.push(el("div", { class: "qx-bars2 dx-bewertung-bild", role: "img", "aria-label": up.sentence + " " + down.sentence }, [
        bar("Starker Gewinn", up.conditional, up.base, "good"), bar("… im Markt", up.base, null, "unknown"),
        bar("Deutlicher Verlust", down.conditional, down.base, "bad"), bar("… im Markt", down.base, null, "unknown")]));
      c.push(el("p", { class: "dx-bewertung-erklaerung", text: up.sentence + " " + down.sentence + " Zeitraum: " + lv.horizonMonths + " Monate." }));
    }
    c.push(el("p", { class: "qx-small", text: [lv.sample, lv.robust, lv.coverageText, "Historisch beobachtet: eine Häufigkeitsauswertung, kein Test einer Handelsregel."].filter(Boolean).join(" ") }));
    return c;
  }
  /* B: die marktweit getesteten Signale, die bei dieser Aktie gerade ausloesen. */
  function signalEvidenceFor(card) {
    var E = global.QXEvidence, T = global.VUQuantRadar ? global.VUQuantRadar.TYPE : {};
    var evs = ((card && card.events) || []).filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; }).slice(0, 2);
    if (!evs.length) return [el("p", { class: "qx-muted", text: "Zurzeit löst bei dieser Aktie kein marktweit getestetes Signal aus. Welche Signale getestet sind und wie sie abschnitten, steht im Backtesting." })];
    return evs.map(function (e) {
      return E.signalEvidence(e.backtest, { label: "„" + ((T[e.eventType] || {}).label || e.eventType) + "“ am " + X.dateDe(e.occurredAt) });
    });
  }

  /* ------------------------------------------------ 06 Kursstruktur */
  function technicalSection(t, ticker) {
    if (!t || t.state !== "AVAILABLE") {
      var why = t && VM.technicalReasonText(t.unavailability);
      return [X.notice("Keine Kursstruktur-Auswertung", why || "Für diesen Titel ist keine technische Auswertung veröffentlicht.")];
    }
    var lag = VM.analysisLagText(t.lag);
    /* Keine Elliott-Kachel mehr: t.elliott stammt aus der V1-Engine (technical-signals-v1, "Validierte Zaehlung",
       "Method Fit") und widersprach dem Chartbild (Elliott 3.2.2, das sich meist enthaelt). Elliott steht nur im Chartbild. */
    return [X.stats([["Trend", t.trend], ["Kursdynamik", t.momentum], ["Schwankung", t.volatility]].map(function (p) {
        return X.stat(p[0], (p[1] && p[1].label) || "–");
      })),
      foot("Analyse bis " + X.dateDe(t.asOf) + ". " + (lag || "") + (t.fullWorkspace ? " Szenarien, Zonen und die experimentelle Elliott-Struktur stehen im Chartbild." : "")),
      t.fullWorkspace ? X.actions([X.btn("Chartbild öffnen", X.routes.chartbild(ticker), "secondary")])
        : el("p", { class: "qx-small", text: (VM.technicalReasonText(t.unavailability) || "Eine vollständige technische Auswertung ist für diesen Titel noch nicht veröffentlicht.") })];
  }

  /* ------------------------------------------------ 07 Unternehmenszahlen */
  function figuresSection(s, ticker) {
    if (!s.quant || s.quant.state !== "AVAILABLE") return [X.notice("Keine Unternehmenszahlen", "Für diesen Titel liegen keine auswertbaren Geschäftszahlen aus SEC-Meldungen vor.")];
    var wanted = { quality: ["operatingMargin", "fcfMargin", "netMargin"], growth: ["revenueGrowth", "epsGrowth"], value: ["priceEarnings", "priceSales", "earningsYield", "priceToFcf", "fcfYield"], risk: ["volatility", "maxDrawdown"] };
    var stats = [], withheld = {};
    s.quant.families.forEach(function (fam) {
      (fam.metrics || []).forEach(function (m) {
        if (!wanted[fam.id] || wanted[fam.id].indexOf(m.metricId) < 0) return;
        /* Bewusst zurueckgehalten ist nicht dasselbe wie fehlend: der Wert
           steht als "bewusst nicht genannt" da, der Grund darunter. */
        if (m.reason === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING" || m.reason === "SHARE_COUNT_NOT_OUTSTANDING" || m.reason === "REPORTING_CURRENCY_NOT_LISTING_CURRENCY" || m.reason === "DISPLAY_NOT_PERMITTED") {
          withheld[m.reason] = true; stats.push(X.stat(m.label, "Bewusst nicht genannt")); return;
        }
        if (m.state !== "AVAILABLE" || typeof m.value !== "number") return;
        var v = m.value.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + (m.unit === "pct" ? " %" : m.unit === "x" ? " ×" : m.metricId === "marginExpansion" ? " Pp." : "");
        var node = X.stat(m.label, v); if (m.description) node.title = m.description; stats.push(node);
      });
    });
    if (!stats.length) return [X.notice("Keine Unternehmenszahlen", "Die Geschäftszahlen dieses Titels erfüllen die Anforderungen der Methodik nicht.")];
    return [X.stats(stats.slice(0, 10)),
      Object.keys(withheld).length ? el("p", { class: "qx-small", text: Object.keys(withheld).map(function (r) { return VM.reasonText(r); }).join(" ") }) : null,
      el("p", { class: "qx-small", text: "Bewertungen sind kein Urteil über einen fairen Preis." }),
      X.actions([X.btn("Entwicklung über die Jahre", X.routes.fundamentals(ticker), "secondary")])];
  }

  /* ------------------------------------------------ Setup-Karte
     Einstieg, Stop-Loss, Invalidation, Ziele - als gekennzeichnetes
     Szenario der technischen Auswertung, nie als Empfehlung. Was die
     Auswertung fuer einen Titel nicht rechnet, steht als "nicht berechnet"
     da, mit Grund. */
  var ENTRY_WORDS = { AWAITING_PULLBACK: "Kurs liegt über der Zone – wartet auf Rücksetzer", ENTRY_ZONE: "Kurs liegt in der Zone", IN_LINE: "Kurs liegt in der Zone",
    EXTENDED: "Kurs ist weit über die Zone gelaufen", BELOW_ZONE: "Kurs liegt unter der Zone", AWAITING_TRIGGER: "wartet auf Bestätigung" };
  function usd(n) { return typeof n === "number" && isFinite(n) ? n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " $" : "–"; }
  function zone(z) { return z ? (z.zoneLow === z.zoneHigh ? usd(z.zoneLow) : usd(z.zoneLow).replace(" $", "") + "–" + usd(z.zoneHigh)) : null; }
  function ratio(a, b) { function f(n) { return n.toLocaleString("de-DE", { maximumFractionDigits: 2 }); } return typeof a === "number" ? (typeof b === "number" && b !== a ? f(a) + "–" + f(b) : f(a)) : null; }
  /* Die vier Stufen eines Setups als Leiste (Owner-Mockup): erreicht, aktuell, offen. Spaete Stufen (Trend laeuft,
     Risiko steigt ...) liegen hinter "bestaetigt" - die Leiste steht dann ganz erreicht, der Status nennt die Stufe. */
  function setupStepper(st) {
    var cur = st.state === "UNAVAILABLE" ? 0 : st.stageIndex < 0 ? st.stages.length : st.stageIndex;
    return el("ol", { class: "qv2-steps", "aria-label": "Stufen eines Setups" }, st.stages.map(function (x, i) {
      var now = i === cur, past = i < cur;
      return el("li", { class: now ? "is-now" : past ? "is-past" : null, "aria-current": now ? "step" : null }, [
        el("span", { class: "qv2-step-dot", "aria-hidden": "true" }, [ico(past || (now && i === st.stages.length - 1) ? "check" : "flat")]), el("span", { text: x.label })]);
    }));
  }
  function renderSetupCard(host, vm, ws, technical, ticker, lifecycleNote) {
    var st = vm.setup, sc = null, ts = ws && ws.state === "AVAILABLE" ? ws.tradeSetup : null;
    if (ws && ws.state === "AVAILABLE" && ws.scenarios && ws.scenarios.length) {
      sc = ws.scenarios.filter(function (x) { return ts && x.id === ts.scenarioId; })[0] || ws.scenarios.filter(function (x) { return x.kind === "PRIMARY"; })[0] || null;
    }
    var invPrice = sc && sc.invalidation && typeof sc.invalidation.price === "number" ? sc.invalidation.price : st.invalidation && st.invalidation.price;
    function cell(cls, label, value, note) {
      return el("div", { class: cls + (value ? "" : " is-missing") }, [el("span", { text: label }), el("b", { class: "num", text: value || "nicht berechnet" }), note ? el("small", { text: note }) : null]);
    }
    var targets = sc && sc.targets ? sc.targets.slice(0, 2) : [];
    var on = st.state === "CONFIRMED", status = st.state === "UNAVAILABLE" ? "Kein Setup beobachtet" : st.label;
    /* Ein Abwaertsszenario hat seine Invalidierung UEBER dem Kurs. "Ungueltig
       unter" und "Interessant ab" waeren dort falsch - die Karte sagt dann,
       was das Szenario ist, und zeigt keinen Einstieg (Setups der Setup-
       Engine sind Aufwaerts-Situationen). */
    var bear = !!(sc && sc.direction && sc.direction !== "BULLISH");
    if (bear) {
      host.replaceChildren(el("div", { class: "q-setup" }, [el("div", { class: "q-setup-head" }, [el("h2", {}, [el("strong", { text: "Setup" })]),
          el("span", { class: "q-status " + (on ? "is-on" : st.state === "UNAVAILABLE" ? "" : "is-wait"), text: status })]),
        lifecycleNote || null,
        el("div", { class: "q-levels is-bear", role: "group", "aria-label": "Szenario-Marken" }, [
          cell("is-entry", "Basisszenario", sc.direction === "BEARISH" ? "Abwärts" : "Ohne klare Richtung", "kein Einstieg ausgewiesen"),
          cell("is-inv", "Ungültig über", typeof invPrice === "number" ? usd(invPrice) : null, typeof invPrice === "number" ? "Schluss darüber: Abwärtsszenario ungültig" : null),
          cell("is-target is-down", "Zielzonen abwärts", targets.length ? targets.map(zone).join(" · ") : null, targets.length ? targets.map(function (t, i) { return "Ziel " + (i + 1); }).join(" · ") : null)]),
        el("p", { class: "q-scenario-note", text: "Das technische Basisszenario vom " + X.dateDe(ws.asOf) + " zeigt " + (sc.direction === "BEARISH" ? "abwärts" : "keine klare Richtung") + ". Quant weist dafür keinen Einstieg aus – ein Setup ist hier eine Aufwärts-Situation. Keine Empfehlung." })]));
      return;
    }
    /* UI-Konzept 23.10.2026 - Ansicht 5: Stufenleiste (Kein Setup bis Setup bestaetigt), Status mit Zaehlung der
       Bedingungen, darunter die Marken als Zeilen (Wert rechts) und Chance/Risiko. Die Bedingungen im Einzelnen, der
       Ausloeser, der Verlauf und die Herkunft der Marken stehen in EINEM Aufklapper. */
    var conds = st.conditions || [], met = conds.filter(function (c) { return c.state === "MET"; }).length;
    var statusSub = st.state === "UNAVAILABLE" ? "Für diese Aktie liegt keine Setup-Beobachtung vor."
      : conds.length ? (met === conds.length ? "Alle " + conds.length + " Bedingungen erfüllt." : met + " von " + conds.length + " Bedingungen erfüllt.") : (st.where || "");
    var kids = [el("div", { class: "q-setup-head" }, [el("h2", {}, [el("strong", { text: "Setup" })]),
        el("span", { class: "q-status " + (on ? "is-on" : st.state === "UNAVAILABLE" ? "" : "is-wait"), text: status })]),
      setupStepper(st),
      el("div", { class: "qv2-status tone-" + (on ? "good" : st.state === "UNAVAILABLE" ? "unknown" : "neutral") }, [
        el("span", { class: "qv2-status-ico", "aria-hidden": "true" }, [ico(on ? "check" : st.state === "UNAVAILABLE" ? "flat" : "clock")]),
        el("span", {}, [el("b", { text: status }), el("small", { text: statusSub })])]),
      el("div", { class: "q-levels qv2-levels", role: "group", "aria-label": "Szenario-Marken" }, [
        cell("is-entry", "Interessant ab", sc && sc.entry ? zone(sc.entry) : null, sc && sc.entry ? ENTRY_WORDS[sc.entryStatus] || "Zone laut Szenario" : null),
      ].concat(sc && sc.stop && sc.stop.price === invPrice
        /* Stop und Invalidation auf derselben Marke: eine Zeile statt zwei gleicher Zahlen. */
        ? [cell("is-stop is-inv", "Stop / Ungültig unter", usd(invPrice), "Schluss darunter: Szenario ungültig")]
        : [cell("is-stop", "Stop / Risiko", sc && sc.stop ? usd(sc.stop.price) : null, sc && sc.stop ? "technischer Stop" : null),
          cell("is-inv", "Ungültig unter", typeof invPrice === "number" ? usd(invPrice) : null, typeof invPrice === "number" ? "Schluss darunter: Szenario ungültig" : null)]).concat(targets.length ? targets.map(function (t, i) { return cell("is-target", "Ziel " + (i + 1), zone(t), i ? null : "Zielzone (technisches Szenario)"); })
        : [cell("is-target", "Zielzonen", null, null)]).concat(ts && ts.riskReward && typeof ts.riskReward.low === "number" ? [
        el("div", { class: "is-rr q-rr" }, [el("span", { text: "Chance/Risiko" }),
          el("b", { class: "num", text: "bis Ziel 1: " + ratio(ts.riskReward.low, ts.riskReward.high) }),
          typeof ts.riskReward.target2Low === "number" ? el("b", { class: "num", text: "bis Ziel 2: " + ratio(ts.riskReward.target2Low, ts.riskReward.target2High) }) : null])] : []))];
    var deep = [];
    if (ts && ts.status === "COMPLETE_LOW_RR") deep.push(el("p", { class: "q-scenario-note", text: "Bis Ziel 1 liegt das Chance-Risiko-Verhältnis zum Teil unter der Mindestschwelle der Methodik." }));
    /* "Bestaetigt wenn": der Ausloeser des Szenarios (Satz der Szenario-
       Engine) und die offenen Bedingungen der naechsten Setup-Stufe. Dazu,
       was den Zustand verbessert und was ihn verschlechtert - beides aus
       der Setup-Kaskade, nichts hinzugedacht. */
    var nx = st.next, inv = st.invalidation;
    var trigger = sc && sc.confirmation ? sc.confirmation : null;
    var better = nx && nx.conditions ? nx.conditions : [], worse = inv && inv.conditions ? inv.conditions : [];
    if (better.length || worse.length) deep.push(el("div", { class: "q-moves" }, [
      el("div", { class: "is-up" }, [el("b", { text: "Was müsste als Nächstes passieren?" }), condCheck(better, "Keine offene Bedingung für eine höhere Stufe.")]),
      el("div", { class: "is-down" }, [el("b", { text: "Was würde das Setup ungültig machen?" }), condCheck(worse, "Keine tragende Bedingung veröffentlicht.")])]));
    if (trigger || (nx && nx.text)) deep.push(el("div", { class: "q-trigger" }, [el("span", { text: "Bestätigt wenn" }),
      trigger ? el("p", { text: trigger }) : null, nx && nx.text ? el("p", { class: "qx-small", text: nx.text }) : null]));
    if (lifecycleNote) deep.push(lifecycleNote);
    deep.push(el("p", { class: "qx-small", text: sc
      ? "Szenario der technischen Auswertung vom " + X.dateDe(ws.asOf) + " (" + sc.label + ", " + sc.status + "). Die Marken zeigen, wo das Szenario rechnerisch ansetzt, ungültig wird und auf Widerstand trifft – keine Empfehlung, keine Order."
      : technical && technical.state === "AVAILABLE" && technical.fullWorkspace && !ws ? "Die Szenario-Marken werden geladen …"
      : "Einstieg, Stop-Loss und Ziele rechnet Quant nur für Titel mit vollständiger technischer Auswertung – für diesen Titel liegt sie nicht vor. " + (typeof invPrice === "number" ? "Die Invalidation stammt aus der Setup-Beobachtung." : "Quant setzt keine Ersatzwerte.") }));
    /* "Chartbild öffnen" steht einmal - in der Kursstruktur (#technik) direkt darunter. */
    kids.push(el("details", { class: "vu-more q-setup-more" }, [el("summary", { text: conds.length ? "Alle " + conds.length + " Bedingungen und wie die Marken entstehen" : "Bedingungen und wie die Marken entstehen" }), el("div", { class: "vu-more-body q-setup-body" }, deep)]));
    host.replaceChildren(el("div", { class: "q-setup" }, kids));
  }

  /* Die sieben Eigenschaften als Kacheln (Kopf des Faktor-Kapitels). */
  function factorTiles(vm) {
    return el("div", { class: "q-factor-tiles" }, vm.factors.map(function (f) {
      var ok = f.state === "AVAILABLE";
      return el("a", { class: "q-ftile tone-" + f.tone, href: "#faktor-" + f.id, "aria-label": f.name + ": " + (ok ? Math.round(f.score) + " von 100, " + (f.word || f.label) : "nicht bewertbar") }, [
        el("span", { text: f.name }), el("b", { class: "num", text: ok ? String(Math.round(f.score)) : "–" }),
        ok ? el("i", { style: "--v:" + Math.max(2, Math.min(100, f.score)) + "%", "aria-hidden": "true" }) : null,
        el("small", { text: ok ? (f.word || f.label) : "nicht bewertbar" })]);
    }));
  }

  /* "Was ist jetzt wichtig?" - die Radar-Ereignisse dieser Aktie, ihr
     naechster Schritt und die historische Evidenz in einer Zeile. */
  var Radar = global.VUQuantRadar;
  function eventLine(e) {
    var t = Radar && Radar.TYPE[e.eventType];
    return el("li", { class: "q-ev tone-" + (e.direction || (t && t.tone) || "info") }, [
      el("b", { text: t ? t.label : e.eventType }), el("span", { text: e.explanation }), el("small", { text: X.dateDe(e.occurredAt) })]);
  }
  function nowContent(ticker, radar, lc) {
    var out = [];
    var card = radar && radar.state === "AVAILABLE" ? radar.card : null;
    if (card && card.events.length) {
      out.push(el("ul", { class: "q-events" }, card.events.map(eventLine)));
    } else if (radar && radar.state === "AVAILABLE") {
      out.push(el("p", { class: "q-now-none", text: "Zum letzten Stand (" + X.dateDe(radar.radarAsOf) + ") meldet Quant für diese Aktie keine neue Veränderung." }));
    }
    if (card && card.next && card.next.open && card.next.open.length) {
      out.push(el("p", { class: "q-now-line" }, [el("b", { text: "Nächster Schritt: " }), el("span", { text: "Für „" + lifecycleLabel(card.next.state) + "“ " + (card.next.open.length === 1 ? "fehlt noch eine von " : "fehlen noch " + card.next.open.length + " von ") + card.next.total + " Bedingungen." })]));
    }
    /* UI-Konzept 23.10.2026: Setup-Stufe und Rueckblick (getestet mit Markt, beobachtet ohne Markt) stehen in ihren
       Bereichen "Setup & Strategie" und "Historischer Vergleich" - hier keine Doppelnennung. */
    void lc;
    return out.length ? out : [el("p", { class: "qx-small", text: "Für diese Aktie liegt kein Radar-Stand vor." })];
  }
  function lifecycleLabel(id) {
    var l = Radar ? Radar.LIFECYCLE.filter(function (x) { return x.id === id; })[0] : null;
    return l ? l.label : id;
  }
  /* Der Lebenszyklus als Leiste: entscheidbare Stufen und - gedimmt - die
     Verlaufsstufen, die noch nicht freigeschaltet sind. */
  function lifecycleView(lc) {
    if (!lc || lc.state !== "AVAILABLE" || !Radar) return null;
    /* entscheidbare Stufen in Reihenfolge: was vor der aktuellen liegt, ist erreicht (is-past) */
    var steps = Radar.LIFECYCLE.filter(function (x) { return x.id !== "NO_SETUP" && x.tier !== "PATH_DEPENDENT"; }).map(function (x) { return x.id; });
    return el("div", { class: "q-lifecycle" }, [
      /* VU3-Finalisierung: sichtbar sind die entscheidbaren Stufen; die noch nicht freigeschalteten stehen im Aufklapper. */
      el("ol", { "aria-label": "Lebenszyklus eines Setups" }, Radar.LIFECYCLE.filter(function (x) { return x.id !== "NO_SETUP" && (x.tier !== "PATH_DEPENDENT" || x.id === lc.current); }).map(function (x) {
        var now = x.id === lc.current, past = steps.indexOf(x.id) >= 0 && steps.indexOf(x.id) < steps.indexOf(lc.current);
        return el("li", { class: (now ? "is-now " : past ? "is-past " : "") + (x.tier === "PATH_DEPENDENT" ? "is-closed" : ""), "aria-current": now ? "step" : null }, [el("span", { text: x.label })]);
      })),
      el("p", { class: "qx-small", text: (lc.current === "NO_SETUP" ? "Derzeit kein Setup" : lifecycleLabel(lc.current) + " " + (lc.sinceIsLowerBound ? "mindestens seit " : "seit ") + X.dateDe(lc.since)) +
        (lc.previous ? " · vorher " + lifecycleLabel(lc.previous) + " (" + X.dateDe(lc.previousAsOf) + ")" : "") +
        "." }), moreText("Weitere Stufen, noch nicht freigeschaltet", "Die Stufen " + Radar.LIFECYCLE.filter(function (x) { return x.tier === "PATH_DEPENDENT" && x.id !== lc.current; }).map(function (x) { return "„" + x.label + "“"; }).join(", ") + " brauchen eine längere Beobachtungsreihe und sind noch nicht freigeschaltet (" + (lc.snapshots || []).length + " veröffentlichte Stichtage).")]);
  }

  /* Daten & Grenzen: ohne eigene Ueberschrift - was fehlt, steht sichtbar; Quellen und Stand in "Daten & Methodik". */
  function limitsSection(kids, id) { return el("section", { class: "qx-section qx-limits qv-limits", id: id }, kids); }

  /* UI-Konzept 23.10.2026, iPhone: die Bereiche 2-6 liegen wie im Mockup nebeneinander und werden gewischt (eine Seite,
     keine Unterseiten). Die Pillenleiste darueber springt zum Bereich; die Hoehe folgt dem sichtbaren Bereich, damit
     unter einem kurzen Bereich kein Leerraum steht. Breit (ab 760 px) bleibt das Raster - dort tut diese Funktion nichts. */
  function deck(grid, onSelect) {
    var mq = global.matchMedia ? global.matchMedia("(max-width: 759px)") : null, active = null, raf = 0;
    var ro = global.ResizeObserver ? new global.ResizeObserver(function () { fit(); }) : null;
    function on() { return !!(mq && mq.matches); }
    function cards() { return Array.prototype.filter.call(grid.children, function (n) { return n.tagName === "SECTION"; }); }
    function fit() { grid.style.height = on() && active ? active.offsetHeight + "px" : ""; }
    function pick() {
      raf = 0;
      if (!on()) { if (active && ro) ro.unobserve(active); active = null; fit(); return; }
      var x = grid.scrollLeft, best = null, d = Infinity;
      cards().forEach(function (c) { var dd = Math.abs(c.offsetLeft - x); if (dd < d) { d = dd; best = c; } });
      if (best && best !== active) {
        if (active && ro) ro.unobserve(active);
        active = best; if (ro) ro.observe(active);
        onSelect(best.id);
      }
      fit();
    }
    function later() { if (!raf) raf = (global.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(pick); }
    grid.addEventListener("scroll", later, { passive: true });
    if (mq && mq.addEventListener) mq.addEventListener("change", later);
    setTimeout(pick, 0);
    return { on: on, refresh: later, current: function () { return active ? active.id : null; }, dispose: function () { if (ro) ro.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener("change", later); } };
  }

  /**
   * @param {HTMLElement} main
   * @param {string} ticker
   * @param {object} ctx {api, distribution(): Promise, patternWords(): Promise}
   * @returns {function} dispose
   */
  async function render(main, ticker, ctx) {
    var api = ctx.api, disposers = [];
    /* Stile der Aktienseite laden parallel zu den Daten (app.js#QXStockCss); gezeichnet wird erst mit ihnen. */
    var cssReady = global.QXStockCss ? global.QXStockCss() : Promise.resolve(true);
    var page = el("article", { class: "qx-stock q-stock qv-stock" });
    main.append(page);
    var heroHost = el("div", { class: "qx-hero-host" }), bodyHost = el("div", { class: "qx-body-host" }, [X.loading("Analyse wird geladen …")]);
    page.append(heroHost, bodyHost);

    var brief = await (ctx.takePrefetched && ctx.takePrefetched(ticker) || api.getIntelligenceBrief(ticker).catch(function () { return null; }));
    var src = (brief && brief.sources) || {};
    var s = src.stock || await api.getStockIntelligence(ticker).catch(function () { return null; });
    if (!s) { X.recent.add(ticker); bodyHost.replaceChildren(X.notice("Daten derzeit nicht verfügbar", "Die Daten dieses Titels konnten gerade nicht geladen werden. Bitte versuche es später erneut.")); return function () {}; }
    if (s.identityState === "UNAVAILABLE" || (s.state !== "AVAILABLE" && s.reason === "INVALID_IDENTITY")) {
      heroHost.append(el("section", { class: "v2-message" }, [el("h1", { class: "qx-h1", text: "Aktie nicht gefunden" })]));
      bodyHost.replaceChildren(X.notice("„" + ticker + "“ ist nicht im Analyseuniversum", "Quant analysiert US-Aktien mit belegten Kurs- und SEC-Daten. Fonds und ETFs wie SPY oder QQQ gehören nicht dazu – ihre Kurse findest du in Discover. Prüfe sonst das Kürzel oder suche nach dem Namen."),
        X.actions([X.btn("Aktie suchen", X.routes.stocks())]));
      return function () {};
    }
    X.recent.add(ticker);
    document.title = (s.name && s.name !== ticker ? s.name + " (" + ticker + ")" : ticker) + " – Quant-Analyse · Vision Universe®";
    var displayName = X.companyName(s) === "Firmenname nicht veröffentlicht" ? null : s.name;

    /* ---------------------------------------------------------- Kopf
       VU3: der einheitliche Aktienkopf (VUStockNavigator.head, assets/stock-navigator.js) - Logo, Name, Kuerzel,
       EIN Kurs mit Art und Datum, darunter der Navigator der sieben Analysewelten. Der Kurs ist der
       veroeffentlichte Schlusskurs der Quant-Auswertung (s.price, Tagesreihe). Nur ein LAUFENDER Handelstag
       ersetzt ihn - dann mit "Live" bzw. "Verzögert" und Uhrzeit (onPrice des Charts). Der Chart darunter zeigt
       den Verlauf, aber keinen zweiten Kurs. Ohne Navigator-Skripte (Tests, Ausfall) zeichnet die Seite
       denselben Kopf ohne Navigator. */
    function watchText(on) { return on ? "★ Beobachtet" : "☆ Beobachten"; }
    var watchBtn = el("button", { type: "button", class: "v2-watch-button qx-watch", "aria-pressed": X.watch.has(ticker) ? "true" : "false",
      text: watchText(X.watch.has(ticker)) });
    watchBtn.addEventListener("click", function () { var on = X.watch.toggle(ticker); watchBtn.setAttribute("aria-pressed", on ? "true" : "false"); watchBtn.textContent = watchText(on); });
    var eodBars = s.chart && s.chart.state === "AVAILABLE" ? (s.chart.bars || []) : [];
    var eod = eodBars.map(function (b) { return [b.date, b.close]; });
    var last = eod.length ? eod[eod.length - 1] : null, prev = eod.length > 1 ? eod[eod.length - 2] : null;
    /* Der Kurs im Kopf ist der veroeffentlichte Kurs des Dienstes - ohne
       zweiten Weg zur Zahl. Ist die Anzeige nicht freigegeben, bleibt sie es,
       auch wenn eine Reihe geladen waere. */
    var priceAllowed = !(s.price && s.price.reason === "DISPLAY_NOT_PERMITTED");
    if (!priceAllowed) { eod = []; last = null; prev = null; }
    var hasDailyPrice = priceAllowed && s.price && typeof s.price.value === "number";
    var closePrice = hasDailyPrice ? { value: s.price.value, currency: "USD", changePct: last && prev && prev[1] > 0 ? (last[1] / prev[1] - 1) * 100 : null,
      changeLabel: "zum Vortag", kind: "close", at: X.dateDe(s.price.asOf || (last && last[0]) || s.asOf) } : null;
    var noPrice = [el("b", { class: "qx-quote-none", text: priceAllowed ? "Kein Kurs veröffentlicht" : "Kurs nicht freigegeben" }),
      el("small", { text: priceAllowed ? "Für diesen Titel liegt kein veröffentlichter Kurs vor." : VM.reasonText("DISPLAY_NOT_PERMITTED") })];
    /* Art und Gattungszahl aus dem Eintrag DIESES Titels (Ausschnitt der Liste, bereits fuer den Dienst geladen) -
       nicht aus der ganzen Liste (126 KB), die diese Seite sonst nur dafuer lud. */
    var entry = (await api.getUniverseEntry(ticker)) || {};
    var kind = s.securityType || entry.t || null;
    var KIND = { ETF: "ETF", PREFERRED: "Vorzugsaktie", ADR: "ADR (Hinterlegungsschein)" };
    var tags = [kind && kind !== "COMMON_STOCK" ? el("span", { class: "dx-index-badge qx-tag", text: KIND[kind] || "keine Stammaktie" }) : null,
      entry.il > 1 ? el("span", { class: "dx-index-badge qx-tag", text: "eine von " + entry.il + " Aktiengattungen" }) : null].filter(Boolean);
    var idLine = [el("b", { text: ticker }), s.industry ? el("span", { text: s.industry }) : null].concat(tags).filter(Boolean);
    var hero = el("div", { class: "qx-stock-hero qv-head" });
    heroHost.append(hero);
    var SN = global.VUStockNavigator, SCX = global.VUCore && global.VUCore.StockContext, headApi = null, quote = null;
    try {
      if (SN && SN.head && SCX) headApi = SN.head(hero, { ctx: SCX.fromUs(ticker, { name: s.name }), current: "quant", name: displayName || "Aktienanalyse",
        price: closePrice, back: { href: X.routes.stocks(), label: "Aktien" }, actions: watchBtn });
    } catch (e) { headApi = null; /* Kuerzel ausserhalb des Kontexts: Kopf ohne Navigator */ }
    if (headApi && headApi.el) {
      disposers.push(headApi.dispose);
      var meta = headApi.el.querySelector(".vu-shead-meta");
      if (meta) { meta.classList.add("qx-stock-id"); meta.replaceChildren.apply(meta, idLine.concat(displayName ? [] : [el("span", { text: "Firmenname nicht veröffentlicht" })])); }
      quote = headApi.el.querySelector(".vu-shead-pricebox");
      /* q-stock-price: Anker der Direktlink- und Release-Pruefungen (scripts/vu2/direct-link-lib.mjs) fuer den sichtbaren Kurs. */
      if (quote) { quote.classList.add("qx-quote", "q-stock-price"); quote.setAttribute("aria-live", "polite"); if (!closePrice) quote.replaceChildren.apply(quote, noPrice); }
    } else {
      quote = el("div", { class: "qx-quote q-stock-price vu-shead-pricebox", "aria-live": "polite" }, closePrice ? [el("b", { class: "num", text: X.money(closePrice.value, "USD") }),
        el("small", { text: "Schlusskurs · " + closePrice.at })] : noPrice);
      hero.append(el("header", { class: "vu-shead qv-shead" }, [
        el("a", { class: "vu-shead-back qv-shead-back", href: X.routes.stocks(), text: "← Aktien" }),
        el("div", { class: "vu-shead-id qv-shead-id" }, [X.logo(ticker, displayName || ticker, "lg", { onlyLogo: true }), el("div", { class: "vu-shead-names qv-shead-names" }, [
          el("h1", { class: "vu-shead-name qv-shead-name", text: displayName || "Aktienanalyse" }),
          displayName ? null : el("p", { class: "qx-small", text: "Firmenname nicht veröffentlicht" }),
          el("p", { class: "vu-shead-meta qx-stock-id" }, idLine)]), el("div", { class: "vu-shead-actions qv-shead-actions" }, [watchBtn])]),
        quote]));
    }
    /* Laufender Handelstag: der Chart meldet den letzten Kurs. Der Kopf wechselt dann von "Schlusskurs" auf
       "Live"/"Verzögert" mit Uhrzeit - es bleibt EIN Kurs. */
    function setLive(p) {
      var next = { value: p.price, currency: "USD", changePct: typeof p.delta === "number" ? p.delta : null, changeLabel: "heute", kind: p.kind || "delayed", at: p.at || p.when };
      if (headApi && headApi.setPrice) headApi.setPrice(next);
      else if (quote) quote.replaceChildren(el("b", { class: "num", text: X.money(p.price, "USD") }), el("small", { text: p.when + " · USD" }));
    }
    var idn = VM.identityNote(s);
    if (idn) heroHost.append(el("div", { class: "vu-alert qx-notice qv-alert", role: "note", dataset: { conflict: idn.kind || "" } }, [
      el("div", {}, [el("b", { text: idn.title }), el("p", { text: idn.shown }), el("p", { class: "qx-small", text: idn.why })])]));

    /* ---------------------------------------------------------- Daten */
    var results = await Promise.all([
      src.factors || api.getFactorEvidence(ticker).catch(function () { return null; }),
      src.setup || api.getSetupObservation(ticker).catch(function () { return null; }),
      src.match || api.getStrategyMatch(ticker).catch(function () { return null; }),
      api.getAssignmentChange(ticker).catch(function () { return null; }),
      src.technical || api.getTechnicalIntelligence(ticker).catch(function () { return null; }),
      src.patterns || api.getPatternMatch(ticker).catch(function () { return null; }),
      api.getHistoricalCases(ticker).catch(function () { return null; }),
      ctx.distribution().catch(function () { return null; }),
      ctx.patternWords().catch(function () { return {}; }),
      ctx.hubReady().catch(function () { return false; })
    ]);
    var factors = results[0], setup = results[1], match = results[2], assignment = results[3], technical = results[4], patterns = results[5], cases = results[6], dist = results[7], words = results[8] || {};
    var vm = VM.stock({ ticker: ticker, factors: factors, brief: brief, setup: setup, match: match, cases: cases, patterns: patterns, technical: technical, distribution: dist });
    await cssReady;
    bodyHost.replaceChildren();

    /* ---------------------------------------------------------- Chart */
    var chart = !priceAllowed ? { node: el("section", { class: "qc-chart qv-chart-off", id: "kurs" }, [el("p", { class: "vu-alert qv-alert", text: "Kursverlauf nicht freigegeben. " + VM.reasonText("DISPLAY_NOT_PERMITTED") })]), dispose: function () {} }
      : global.VUQuantChart.create({ ticker: ticker, eod: eod, currency: "USD",
      /* Zwei Schreibweisen derselben Aussage: "splitAdjusted" (Golden-Rekonstruktion)
         und "SPLIT_ADJUSTED" (veroeffentlichte Reihe, alle anderen Titel). Nur die
         erste zu pruefen hiess: "nicht splitbereinigt" unter fast jedem Chart. */
      adjusted: !!(s.chart && /^(splitAdjusted|SPLIT_ADJUSTED)$/.test(s.chart.adjustmentStatus || "")), splitEvents: s.chart && s.chart.splitEvents,
      longPath: s.masterMemberId && /^[A-Za-z0-9_-]+$/.test(s.masterMemberId) ? "/quant/data/market/discover-series-long/" + s.masterMemberId + ".json" : null,
      loadJSON: global.QuantShell.loadJSON,
      realtime: function () { return api.getRealtimeCapability(ticker); },
      onPrice: function (p) { if (typeof p.price === "number" && (p.live || !hasDailyPrice)) setLive(p); } });
    disposers.push(chart.dispose);

    /* Aufbau nach dem Owner-Mockup "Quant – Optimiertes UI Konzept" (23.10.2026): sechs kompakte Bereiche derselben
       Seite, Ergebnis zuerst, Details auf Klick.
         1 Ueberblick & Ergebnis   Kopf mit Kurs und Analysewelten · der eine Chart · Quant-Ergebnis mit drei Kennzahlen
         2 Die Quant-Eigenschaften (#einordnung) - je Eigenschaft Balken 0-100, antippen bis zu den Rohdaten
         3 Staerken & Risiken      (#dafuer) - Spricht dafuer / dagegen / Mittelfeld
         4 Aktuelle Veraenderungen (#veraenderung) - Filter besser/schlechter, dazu was jetzt wichtig ist (Radar)
         5 Setup & Strategie       (#setup mit #strategie und #technik)
         6 Historischer Vergleich  (#historie)
       danach Unternehmenszahlen (#zahlen), Unternehmen & Meldungen (zugeklappt) und Daten & Methodik (#grenzen). */
    var hasFactors = vm.factorState === "AVAILABLE";
    var o = vm.overall;
    /* Die sechs Ansichten als nummerierte Pillen (wie im Mockup); der aktive Bereich ist Lime. */
    var TABS = [["ueberblick", "Überblick"], ["einordnung", !hasFactors || o.rated > 0 ? "Eigenschaften" : null], ["dafuer", hasFactors && o.rated >= 3 ? "Stärken & Risiken" : null], ["veraenderung", "Veränderungen"],
      ["setup", "Setup & Strategie"], ["historie", "Historie"]]
      .filter(function (t) { return t[1]; });
    var tabs = el("nav", { class: "q-tabs qx-toc qv-toc qv2-toc", "aria-label": "Die Ansichten der Analyse" }, TABS.map(function (t, i) {
      return el("a", { href: "#" + t[0], "aria-current": i ? "false" : "true", dataset: { target: t[0] } }, [el("span", { class: "qv2-toc-n", "aria-hidden": "true", text: String(i + 1) }), document.createTextNode(t[1])]);
    }));
    function setCurrent(id) {
      var hit = null;
      tabs.querySelectorAll("a").forEach(function (a) { var on = a.dataset.target === id; a.setAttribute("aria-current", on ? "true" : "false"); if (on) hit = a; });
      if (hit && tabs.scrollWidth > tabs.clientWidth && tabs.scrollTo) tabs.scrollTo({ left: hit.offsetLeft - 16, behavior: "smooth" });
    }
    if (global.IntersectionObserver) {
      var spy = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          /* Mobil liegen 2-6 nebeneinander: dort entscheidet das Wischen (deck), oben nur der Ueberblick. */
          if (swipe && swipe.on()) setCurrent(e.target.id === "ueberblick" ? "ueberblick" : swipe.current());
          else setCurrent(e.target.id);
        });
      }, { rootMargin: "-30% 0px -60% 0px" });
      disposers.push(function () { spy.disconnect(); });
      /* Ganz oben (Kurs, Chart, Ergebnis) ist der Ueberblick aktiv - auch dort, wo das Beobachtungsband ihn nicht trifft. */
      var topRaf = 0, onTop = function () {
        topRaf = 0;
        var lay = document.getElementById("ueberblick"); if (!lay || !lay.isConnected) return;
        if (lay.getBoundingClientRect().bottom > global.innerHeight * 0.45) setCurrent("ueberblick");
        else if (swipe && swipe.on() && tabs.querySelector("a[aria-current=true]") && tabs.querySelector("a[aria-current=true]").dataset.target === "ueberblick") setCurrent(swipe.current());
      };
      var onScroll = function () { if (!topRaf) topRaf = (global.requestAnimationFrame || setTimeout)(onTop); };
      global.addEventListener("scroll", onScroll, { passive: true });
      disposers.push(function () { global.removeEventListener("scroll", onScroll); });
      setTimeout(function () { TABS.forEach(function (t) { var n = document.getElementById(t[0]); if (n) spy.observe(n); }); }, 0);
    }

    /* 1: Chart und daneben das Quant-Ergebnis. */
    var layout = el("div", { class: "qx-stock-layout" });
    layout.id = "ueberblick"; layout.classList.add("qv2-overview");
    layout.append(chart.node);
    layout.append(verdictCard(vm, factors && factors.reason, "Quant bildet keine Ersatzwerte. Was vorhanden ist, steht weiter unten; was fehlt, steht unter „Daten & Methodik“."));
    /* Die Pillen stehen ueber dem Chart und kleben beim Scrollen oben: die sechs Ansichten sind jederzeit sichtbar. */
    bodyHost.append(tabs, layout);
    var grid = el("div", { class: "qv2-grid" });
    bodyHost.append(grid);
    var swipe = deck(grid, setCurrent);
    disposers.push(swipe.dispose);

    /* 2: Die sieben Eigenschaften bis zu den Rohdaten - eine Zeile je Eigenschaft. */
    if (hasFactors && o.rated > 0) {
      grid.append(card(X.section("Was macht diese Aktie stark oder schwach?", "Jede Eigenschaft von 0 bis 100 – antippen zeigt die Belege bis zu den Rohdaten.",
        [el("div", { class: "qx-factors qv-frows" }, vm.factors.map(function (f) { return factorCard(f, ticker); }))].concat(returnsBlock(vm), [
          moreText("Was bedeuten die Eigenschaften?", "Wert 0–100: gewichtetes Mittel der Rangplätze der einzelnen Kennzahlen, 50 ist die Mitte. Die Stufe ist die Position unter allen bewerteten Aktien (stärkste 10 % sehr stark, bis 75 % stark, ab 45 % durchschnittlich, ab 25 % schwach) – eine relative Einordnung, kein absolutes Urteil.")]),
        { href: X.routes.method("faktoren"), label: "Methodik" }, "Die Quant-Eigenschaften", "einordnung")));
    } else if (!hasFactors) {
      grid.append(card(X.section("Eigenschaften", null, [X.notice("Keine Faktoren", VM.reasonText(factors && factors.reason, "Für diesen Titel ist keine Faktoranalyse veröffentlicht."))], null, "Die Quant-Eigenschaften", "einordnung")));
    }

    /* Unternehmenszahlen gehoeren zu den Eigenschaften (Profitabilitaet, Wachstum, Bewertung, Risiko in Rohwerten):
       ein Teil derselben Karte, die Kennzahlen als wischbare Reihe - keine eigene lange Seite danach. */
    var figures = s.quant && s.quant.state === "AVAILABLE" ? figuresSection(s, ticker) : null;
    var einCard = grid.querySelector("#einordnung");
    if (figures && !(figures.length === 1 && figures[0].classList && figures[0].classList.contains("qx-notice"))) {
      var zahlen = X.section("Wie verdient das Unternehmen – und wie teuer ist die Aktie?", null, figures, null, "Unternehmenszahlen", "zahlen");
      if (einCard) einCard.append(sub(zahlen)); else grid.append(card(zahlen));
    }

    /* 3: Staerken & Risiken. */
    if (hasFactors && o.rated >= 3) grid.append(card(X.section("Was spricht dafür – und was dagegen?", null, balanceSection(vm), null, "Stärken & Risiken", "dafuer")));

    /* 4: Aktuelle Veraenderungen - gemessene Veraenderungen mit Filter, darunter die Radar-Ereignisse ("Was ist jetzt
       wichtig?"), die nachladen. */
    var nowHost = el("div", { class: "q-now", "aria-live": "polite" }, [el("p", { class: "qx-small", text: "Was sich bei dieser Aktie zuletzt verändert hat, wird geladen …" })]);
    var changeKids = [];
    if (vm.change.state === "AVAILABLE") {
      var moving = vm.change.items.filter(function (i) { return i.tone !== "neutral"; });
      var still = vm.change.items.filter(function (i) { return i.tone === "neutral"; });
      /* Richtung als Zeichen (▲ besser, ▼ schlechter, ◆ unveraendert); Verschlechterungen stehen zuerst. */
      moving = moving.filter(function (i) { return i.tone === "bad"; }).concat(moving.filter(function (i) { return i.tone !== "bad"; }));
      var changeItem = function (i) {
        return el("li", { class: "qx-change tone-" + i.tone, dataset: { tone: i.tone } }, [el("span", { class: "qv2-ico tone-" + i.tone, "aria-hidden": "true" }, [ico(i.tone === "good" ? "up" : i.tone === "bad" ? "down" : "flat")]),
          el("i", { class: "qx-change-glyph", "aria-hidden": "true", text: TONE_GLYPH[i.tone] || "–" }),
          el("span", { class: "qv2-ch-main" }, [el("span", { class: "qv2-ch-t", text: i.text }), el("small", { text: i.group + " · " + (i.window || "") + (i.to ? " · " + i.to : "") })])]);
      };
      var nGood = vm.change.items.filter(function (i) { return i.tone === "good"; }).length, nBad = vm.change.items.filter(function (i) { return i.tone === "bad"; }).length;
      var SHOW = 4, list = moving.length ? el("ul", { class: "qx-changes" }, moving.map(changeItem)) : null;
      var applyFilter = function (f) {
        if (!list) return;
        var shown = 0;
        Array.prototype.forEach.call(list.children, function (li) { var ok = f === "all" || li.dataset.tone === f; li.hidden = !ok || shown >= SHOW; if (ok) shown++; });
      };
      /* Die Zaehlung als Filter: Alle / Besser / Schlechter (gezaehlt wird dasselbe wie im Satz der Messung). */
      var chips = el("div", { class: "qx-change-tally qv2-chips", role: "group", "aria-label": "Veränderungen filtern" }, [["all", "Alle", moving.length], ["good", "Besser", nGood], ["bad", "Schlechter", nBad]].map(function (c) {
        var b = el("button", { type: "button", class: "tone-" + (c[0] === "all" ? "all" : c[0]) + (c[2] ? "" : " is-zero"), "aria-pressed": c[0] === "all" ? "true" : "false", dataset: { f: c[0] } }, [
          c[0] === "all" ? null : el("i", { "aria-hidden": "true", text: TONE_GLYPH[c[0]] }), document.createTextNode(c[1] + " "), el("b", { class: "num", text: String(c[2]) })]);
        b.addEventListener("click", function () { chips.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); applyFilter(c[0]); });
        return b;
      }));
      applyFilter("all");
      changeKids.push(chips, list || el("p", { class: "qx-small", text: "Keine deutliche Veränderung." }));
      /* Alle Punkte (auch unveraenderte und nicht messbare) und die Messweise in EINEM Aufklapper. */
      changeKids.push(X.more("Alle Veränderungen und wie sie gemessen werden", function () {
        var out = [];
        if (moving.length) out.push(el("h4", { class: "qx-sub-h", text: "Besser oder schlechter (" + moving.length + ")" }), el("ul", { class: "qx-changes" }, moving.map(changeItem)));
        if (still.length) out.push(el("h4", { class: "qx-sub-h", text: "Unverändert (" + still.length + ")" }), el("ul", { class: "qx-changes" }, still.map(changeItem)));
        if (vm.change.open.length) out.push(el("h4", { class: "qx-sub-h", text: "Nicht messbar (" + vm.change.open.length + ")" })), out.push.apply(out, vm.change.open.map(function (x) { return el("p", { class: "qx-small" }, [el("b", { text: x.label + ": " }), el("span", { text: x.text })]); }));
        out.push(el("h4", { class: "qx-sub-h", text: "Wie die Veränderung gemessen wird" }), el("p", { class: "qx-small", text: vm.change.text + " Stand " + X.dateDe(vm.change.asOf) + "." }));
        return out.concat(vm.change.items.map(function (i) { return el("p", { class: "qx-small" }, [el("b", { text: i.label + ": " }), el("span", { text: (i.how || "") + (i.from && i.to ? " (" + i.from + " → " + i.to + ")" : "") })]); }));
      }));
    } else changeKids.push(el("p", { class: "qx-small", text: vm.change.text }));
    changeKids.push(el("div", { class: "qv-now qv2-now" }, [el("h3", { class: "qv-now-h", text: "Was ist jetzt wichtig?" }), nowHost]));
    grid.append(card(X.section("Was verändert sich gerade?", null, changeKids, null, "Aktuelle Veränderungen", "veraenderung")));
    var lifecycleBox = el("div", { class: "q-lifecycle-host" });
    var cardPromise = api.getRadarCard ? api.getRadarCard(ticker).catch(function () { return null; }) : Promise.resolve(null);
    Promise.all([cardPromise,
      api.getSetupLifecycle ? api.getSetupLifecycle(ticker).catch(function () { return null; }) : null]).then(function (rl) {
      if (!nowHost.isConnected) return;
      nowHost.replaceChildren.apply(nowHost, nowContent(ticker, rl[0], rl[1]));
      var lc = lifecycleView(rl[1]);
      if (lc) lifecycleBox.replaceChildren(lc);
    });

    /* 5: Setup & Strategie. Einstieg, Stop und Ziele aus der technischen
       Auswertung (Owner-Entscheid 30.09.2026), darunter Anlagestil und Kursstruktur. */
    var setupCard = el("div", { class: "q-setup-wrap" });
    renderSetupCard(setupCard, vm, null, technical, ticker, lifecycleBox);
    if (technical && technical.state === "AVAILABLE" && technical.fullWorkspace && api.getTechnicalWorkspace) {
      api.getTechnicalWorkspace(ticker).then(function (ws) { if (setupCard.isConnected) renderSetupCard(setupCard, vm, ws, technical, ticker, lifecycleBox); }).catch(function () { return null; });
    }
    var evidenceP = api.getEvidenceStatus ? api.getEvidenceStatus().catch(function () { return null; }) : Promise.resolve(null);
    /* Setup und Evidenz direkt verbunden - aber nie mit Signal-Backtests vermischt. */
    var setupEvidence = el("p", { class: "q-setup-evidence" });
    evidenceP.then(function (ev) {
      var k = ev && ev.state === "AVAILABLE" ? ev.kinds.filter(function (x) { return x.id === "SETUP_BACKTEST" || /Setup/.test(x.label || ""); })[0] : null;
      if (!setupEvidence.isConnected || vm.setup.state === "UNAVAILABLE") return;
      setupEvidence.replaceChildren(el("span", { class: "q-ev-tier tier-tested is-off", text: "Historische Evidenz zu Setups" }),
        el("span", { text: k && k.state !== "WITHHELD" ? " Setup-Ergebnisse siehe Backtesting." : " Zu wenige echte Setup-Fälle für eine Aussage. " + (k ? closedKindSentence(k) : "") + " Setup-Ergebnisse werden nicht mit den marktweiten Signal-Backtests vermischt." }));
    });
    var setupSec = card(X.section("Wie weit ist die Aktie im Setup?", null,
      [setupCard].concat(vm.setup.state !== "UNAVAILABLE" ? [X.more("Die Setup-Stufen im Detail", function () { return [setupEvidence].concat(setupSection(vm)); })] : [setupEvidence]), null, "Setup & Strategie", "setup"));
    grid.append(setupSec);
    var setupKids = [sub(X.section("Welche Strategie passt?", null, strategySection(vm, assignment), { href: X.routes.strategies(), label: "Alle Strategien" }, null, "strategie"))];
    /* Absagen stehen EINMAL, gesammelt unter "Daten & Methodik" - nicht als
       Stapel von Hinweisen quer ueber die Seite. Der technische Ausblick
       (Chartbild-Teaser) steht im Technik-Abschnitt. */
    var cbHost = global.VUTechnicalIntelligence ? el("div", { class: "cb-teaser-host", style: "min-height:1px" }) : null;
    if (technical && technical.state === "AVAILABLE") setupKids.push(sub(X.section("Kursstruktur", null, (cbHost ? [cbHost] : []).concat(technicalSection(technical, ticker)), null, null, "technik")));
    else if (cbHost) setupKids.push(cbHost);
    setupKids.forEach(function (k) { setupSec.append(k); });

    /* 6: Historischer Vergleich. Beobachtet (diese Aktie), getestet
       (marktweites Signal mit Base Rate), zertifiziert. Dazu der Radar-Status
       (Verlauf, Benachrichtigung) hinter einer Aufklappzeile. */
    var evidence = await evidenceP;
    var evOverview = evidenceOverview(vm);
    var signalHost = el("div", { class: "q-ev-signal-host", "aria-live": "polite" }, [el("p", { class: "qx-small", text: "Getestete Signale werden geladen …" })]);
    var trackHost = el("div", { class: "q-track-host", "aria-live": "polite" }, [el("p", { class: "qx-small", text: "Radar-Status wird geladen …" })]);
    var alertHost = global.QXEvidence && global.QXEvidence.alertPanel ? global.QXEvidence.alertPanel(ticker) : null;
    var radarMore = el("details", { class: "vu-more qv-more", id: "radar-status" }, [el("summary", { text: "Radar-Status: was Quant für diese Aktie verfolgt" }), el("div", { class: "vu-more-body qv-more-body" }, [trackHost, alertHost].filter(Boolean))]);
    grid.append(card(X.section("Was geschah früher in ähnlichen Situationen?", null, replaySection(vm, words, evidence, signalHost, evOverview).concat([radarMore]), { href: X.routes.method("historie"), label: "Methodik" }, "Historischer Vergleich", "historie")));
    cardPromise.then(function (rc) {
      if (!signalHost.isConnected) return;
      var card = rc && rc.state === "AVAILABLE" ? rc.card : null;
      signalHost.replaceChildren.apply(signalHost, signalEvidenceFor(card));
      evOverview.setTested(card);
      /* Ohne ausloesendes Signal spricht die Zertifizierungszeile von der Aktie, nicht von "diesem Signal". */
      var tested = ((card && card.events) || []).some(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; });
      var certHost = signalHost.closest ? signalHost.closest(".qx-replay") : null, certLine = certHost ? certHost.querySelector(".q-ev-cert") : null;
      if (!tested && certLine && global.QXEvidence) certLine.replaceWith(global.QXEvidence.certifiedLine(null, { subject: "diese Aktie" }));
    });
    (api.getSignalTracking ? api.getSignalTracking(ticker).catch(function () { return null; }) : Promise.resolve(null)).then(function (tr) {
      if (!trackHost.isConnected) return;
      var kids = global.QXEvidence ? global.QXEvidence.trackingSection(tr, ctx) : null;
      trackHost.replaceChildren.apply(trackHost, kids || [el("p", { class: "qx-small", text: tr && tr.reason === "NOT_IN_SETUP_UNIVERSE" ? "Diese Aktie gehört nicht zum Setup-Universum; der Radar verfolgt sie nicht." : "Für diese Aktie liegt kein Radar-Status vor." })]);
    });

    /* Chartbild-Teaser: Ausblick in einem Satz, Weg zur ganzen Seite. Laedt unabhaengig und erst in Sichtweite
       (wie die Bilder oben): Shard und Stile kosten rund 180 KB, das Ressourcenbudget der Aktienseite gilt dem
       ersten Bild. */
    if (cbHost) {
      var cbLoad = function () { global.VUTechnicalIntelligence.getAnalysis(ticker).then(function (r) {
        if (!cbHost.isConnected || r.state !== "AVAILABLE") return;
        if (global.QXChartbildCss) global.QXChartbildCss();   // Stile der Teaser-Karte (lazy, siehe app.js)
        var a = r.analysis, Ex = global.VUTechnical && global.VUTechnical.TIExplain, p = a.scenarios[0];
        /* Datenstand-Richtlinie: zurueckgehaltene Titel zeigen statt des Ausblicks nur den Hinweis */
        if (a.withheld) {
          cbHost.append(el("a", { class: "cb-teaser cb-tone-flat", href: X.routes.chartbild(ticker) }, [
            el("span", { class: "cb-teaser-k", text: "Technischer Ausblick" }),
            el("b", { class: "cb-teaser-o" }, [el("span", { text: (a.freshness && a.freshness.title) || "Analyse zurückgehalten" })]),
            el("span", { class: "cb-small cb-dim", text: (a.freshness && a.freshness.text) || "" })]));
          return;
        }
        /* §55: kompakte Karte — Ausblick, Schluesselzone, Ungueltig-Linie, Strukturklarheit. */
        var tone = { BULLISH: "up", BEARISH: "down", MIXED: "mixed" }[a.outlook.label] || "flat";
        var cl = a.clarity ? { CLEAR: "klar", MODERATE: "mittel", AMBIGUOUS: "unklar" }[a.clarity.level] : null;
        cbHost.append(el("a", { class: "cb-teaser cb-tone-" + tone, href: X.routes.chartbild(ticker) }, [
          el("span", { class: "cb-teaser-k", text: "Technischer Ausblick" }),
          el("b", { class: "cb-teaser-o" }, [el("span", { class: "cb-dot", "aria-hidden": "true" }), el("span", { text: (Ex && Ex.STRUCTURE[a.outlook.structure]) || ((Ex && Ex.OUTLOOK[a.outlook.label]) || a.outlook.label) })]),
          el("span", { class: "cb-teaser-grid" }, [
            p && p.entryZone ? el("span", {}, [el("small", { text: "Schlüsselzone" }), el("strong", { class: "num", text: Ex.fmt(p.entryZone.zoneLow) + "–" + Ex.fmt(p.entryZone.zoneHigh) })]) : null,
            p && p.invalidation ? el("span", {}, [el("small", { text: p.invalidation.direction === "below" ? "Ungültig unter" : "Ungültig über" }), el("strong", { class: "num", text: Ex.fmt(p.invalidation.price) })]) : null,
            cl ? el("span", {}, [el("small", { text: "Struktur" }), el("strong", { text: cl })]) : null
          ]),
          a.freshness && a.freshness.state === "DELAYED" ? el("span", { class: "cb-small cb-dim", role: "status", text: a.freshness.line }) : null,
          el("span", { class: "cb-teaser-go", text: "Technische Analyse öffnen →" })].filter(Boolean)));
      }).catch(function () { return null; }); };
      if (!global.IntersectionObserver) cbLoad();
      else {
        /* Erst laden, wenn das Teaser-Feld spuerbar im Bild steht (80 px), nicht
           schon, wenn seine Oberkante den Rand beruehrt (Ressourcenbudget der Aktienseite). */
        var cbSpy = new global.IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; })) { cbSpy.disconnect(); cbLoad(); }
        }, { rootMargin: "0px 0px -80px 0px" });
        cbSpy.observe(cbHost);
      }
    }
    /* Unternehmensmeldungen (Company Intelligence) - eigene Komponente, vor den Unternehmenszahlen. */
    /* VU3-Finalisierung: Unternehmensprofil, Meldungen und Geschaeftszahlen (Company Intelligence) sind Discovers
       Kapitel; in Quant stehen sie vollstaendig, aber zugeklappt. Ohne Freigabe (mount haengt nichts an) entfaellt
       auch der Aufklapper. */
    var ciMore = null;
    if (global.VUCompanyIntelligenceStock) {
      var ciHost = el("div", { class: "qv-ci-host" });
      ciMore = el("details", { class: "vu-more qv-ci-more" }, [el("summary", { text: "Unternehmen, Meldungen und Geschäftszahlen" }), el("div", { class: "vu-more-body qv-ci-body" }, [ciHost])]);
      disposers.push(global.VUCompanyIntelligenceStock.mount(ciHost, ticker));
      if (!ciHost.firstChild) ciMore = null;
    }
    swipe.refresh();

    /* ------------------------------------------------- Daten & Methodik */
    /* Was fehlt, bildet der Vertrag (quant/engines/journey-shape.js) - dieselbe
       Regel wie die Messung, keine zweite Fassung in der Seite. Was fehlt, bleibt
       sichtbar; Quellen, Datenstaende und Methodik stehen EINMAL in "Daten & Methodik". */
    var Shape = global.VUJourneyShape;
    var shape = Shape ? Shape.assess(Shape.stationsFrom({ stock: s, factors: factors, setup: setup, patterns: patterns, technical: technical })) : { groups: [] };
    var gapNodes = (shape.groups || []).map(function (g) {
      return el("li", { class: "nein qx-open", dataset: { cause: g.causeId || "" } }, [el("b", { text: g.headline }), el("span", { text: " – " + g.explanation + (g.outlook ? " " + g.outlook : "") + (g.areas && g.areas.length ? " Betrifft: " + g.areas.join(" · ") + "." : "") })]);
    });
    /* Die konkreten Gruende mit Zahl, dort wo ein Leser nach ihnen sucht. */
    if (technical && technical.state !== "AVAILABLE") { var tr = VM.technicalReasonText(technical.unavailability); if (tr) gapNodes.push(el("li", { class: "nein" }, [el("b", { text: "Kursstruktur" }), el("span", { text: " – " + tr })])); }
    if (patterns && patterns.state !== "AVAILABLE") { var pr = VM.patternReasonText(patterns.unavailability); if (pr) gapNodes.push(el("li", { class: "nein" }, [el("b", { text: "Marktmuster" }), el("span", { text: " – " + pr })])); }
    if (entry.v === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") gapNodes.push(el("li", { class: "nein" }, [el("b", { text: "Börsenwert" }), el("span", { text: " – " + VM.reasonText("SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") + (entry.il > 1 ? " Das Unternehmen hat " + entry.il + " börsennotierte Aktiengattungen." : "") })]));
    var creditHost = el("div", { class: "qx-logo-credit" });
    var dm = el("details", { class: "vu-dm qv-dm" }, [
      el("summary", {}, [document.createTextNode("Daten & Methodik"), el("small", { text: "Tiingo · SEC EDGAR" + (last ? " · Kurs bis " + X.dateDe(last[0]) : "") })]),
      el("dl", {}, [
        el("dt", { text: "Kurs" }), el("dd", { text: last ? "Tiingo, Tagesschluss bis " + X.dateDe(last[0]) + "; Tagesverlauf aus veröffentlichten 5-Minuten-Kursen" : "keine veröffentlichte Tagesreihe" }),
        el("dt", { text: "Geschäftszahlen" }), el("dd", { text: vm.asOf && vm.asOf.fundamentals ? "SEC EDGAR, bis " + X.dateDe(vm.asOf.fundamentals) + (vm.asOf.fundamentalsKnown ? " (bekannt seit " + X.dateDe(vm.asOf.fundamentalsKnown) + ")" : "") : "keine" }),
        el("dt", { text: "Kennzahlen" }), el("dd", { text: s.quant && s.quant.asOf ? "marktbezogen bis " + X.dateDe(s.quant.asOf) : "–" }),
        el("dt", { text: "Faktoren" }), el("dd", { text: vm.asOf ? "Stand " + X.dateDe(vm.asOf.factors) : "keine" }),
        el("dt", { text: "Setup" }), el("dd", { text: vm.setup.asOf ? "Stand " + X.dateDe(vm.setup.asOf) + " (technische Auswertung, nicht der tägliche Kursstand)" : "keins" }),
        el("dt", { text: "Nachrichten" }), el("dd", {}, [el("span", { text: "in Quant nicht angebunden – " }), X.link("Vision Universe News", "/news/")])
      ]),
      el("p", { text: vm.isNot }),
      el("p", { class: "qv-dm-links" }, [X.link("Methodik", X.routes.method()), el("span", { text: " · " }), X.link("SEC-Daten prüfen", "/quant/data-inspector/"), el("span", { text: " · " }),
        X.link("Vergleichen", X.routes.compare([ticker])), el("span", { text: " · " }), X.link("In Discover ansehen", "/discover/#/s/US_REAL/" + encodeURIComponent(ticker))]),
      creditHost]);
    bodyHost.append(limitsSection([
      /* Nach den sechs Ansichten EIN kurzer Abschluss: was fehlt (nur wo etwas fehlt), Unternehmen & Meldungen und
         Daten & Methodik - beides zugeklappt. */
      gapNodes.length ? el("div", { class: "qv-gaps", dataset: { journeyShape: shape.shape || "" } }, [el("h2", { class: "qv-gaps-h", text: "Was fehlt – und warum" }), el("ul", { class: "dx-kann" }, gapNodes)]) : null,
      ciMore, dm], "grenzen"));
    /* Urheber und Lizenz des Logos stehen in "Daten & Methodik". Das Verzeichnis
       dahinter ist 1,7 MB gross - es wird erst geladen, wenn der Bereich geoeffnet wird. */
    var L = global.VUDiscover && global.VUDiscover.Logos;
    if (L && L.creditLine) dm.addEventListener("toggle", function () { if (dm.open && !creditHost.childNodes.length) creditHost.append(L.creditLine(ticker)); });

    return function () { disposers.forEach(function (d) { try { d(); } catch (e) { /* bereits beendet */ } }); };
  }

  global.QXStock = { render: render, factorCard: factorCard, strategyArt: strategyArt };
})(window);
