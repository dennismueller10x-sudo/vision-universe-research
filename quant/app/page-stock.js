/* =========================================================================
   VISION UNIVERSE QUANT — app/page-stock.js              Die Aktienanalyse

   Die Seite ist wie Discovers Aktienseite gebaut - mit denselben Klassen
   (article.dv2-stock, dx-dhero, dx-chapter, dx-waage, dx-zahlen ...), damit
   sie aussieht und sich liest wie Discover. Sie beantwortet in dieser
   Reihenfolge:

     Kopf        Logo, Name, Kurs                     dx-dhero
     Chart       ein Chart, elf Zeitraeume            dx-chapter--chart
     Blick       Quant-Einordnung in einem Satz       dv2-stock-context
     Einstieg    01-06 als Sprungmarken               dv2-research-entry
     Waage       Spricht dafuer / dagegen / offen     dx-waage
     01          Sieben Eigenschaften -> Rohdaten     dx-zahlen
     02          Was veraendert sich?                 dx-chapter--journey
     03          Setup: Wo / Warum / Naechstes / Ungueltig   dv2-stock-valuation
     04          Anlagestil: Erfuellt / Offen / Nicht erfuellt
     05          Historical Replay, drei Ebenen       dx-bewertung-bild
     06          Kursstruktur, Unternehmenszahlen, Daten und Grenzen

   Jede Aussage kommt aus dem View Model (app/view-model.js), das nur
   veroeffentlichte Vertraege liest. Wo Daten fehlen, steht warum - mit
   Zahl, wo es eine gibt. Die qx-Klassen sind Anker fuer Tests, keine
   Gestaltung.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;

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

  /* Die Stil-Grafik (bis 0,45 MB) haengt erst ein, wenn ihre Karte sichtbar
     wird - wie die Logo-Zeile unten. loading="lazy" allein reichte nicht:
     der Browser laedt bis weit unterhalb des Bildschirms vor, und ob das vor
     oder nach dem ersten Bild geschah, war Zufall (Ressourcenbudget der
     Aktienseite mal 5,50, mal 5,92 MB bei identischem Stand). */
  function artOnSight(src) {
    var img = el("img", { class: "v2-collection-image", alt: "", width: "1254", height: "1254", loading: "lazy", decoding: "async" });
    if (!global.IntersectionObserver) { img.src = src; return img; }
    var io = new global.IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); img.src = src; }
    }, { rootMargin: "0px" });
    io.observe(img);
    return img;
  }

  function foot(text) { return el("p", { class: "dx-kapitel-fuss", text: text }); }

  /* ------------------------------------------------ Faktor-Zeile
     Erste Ebene: Name, Wert, Balken, Stufe und Position - eine Zeile zum
     Ueberfliegen. Wert und Stufe bleiben getrennt (factor-band-2.0.0): die
     Stufe kommt aus der Position unter allen bewerteten Aktien, der Wert
     steht als Zahl daneben. Antippen: Warum (die staerksten und
     schwaechsten Kennzahlen); darunter, woraus der Wert besteht, und die
     Rohdaten mit Methodik. */
  function positionWord(f) {
    if (!f.rank || typeof f.rank.share !== "number" || !isFinite(f.rank.share)) return null;
    var p = Math.floor(f.rank.share * 100);
    return p >= 50 ? "Top " + Math.max(1, 100 - p) + " %" : "höher als " + p + " %";
  }
  function driverLine(c) { return c.label + (c.value ? " " + c.value : ""); }
  function factorCard(f, ticker, nowhere) {
    var available = f.state === "AVAILABLE";
    var d = el("details", { class: "qx-factor q-frow tone-" + f.tone + (available ? "" : " is-off"), id: "faktor-" + f.id, dataset: { factor: f.id } });
    var pos = available ? positionWord(f) : null;
    d.append(el("summary", {}, [
      el("span", { class: "q-frow-name", text: f.name }),
      el("b", { class: "q-frow-score num", text: available ? String(Math.round(f.score)) : "–" }),
      el("span", { class: "q-frow-bar", "aria-hidden": "true" }, available ? [el("i", { style: "width:" + Math.max(2, Math.min(100, f.score)) + "%" })] : []),
      el("span", { class: "q-frow-meta" }, available ? [X.pill(f.word || f.label, f.tone), pos ? el("small", { text: pos }) : null]
        : [el("small", { text: nowhere ? "Für keine Aktie messbar" : "Nicht bewertbar" })])
    ]));
    var body = el("div", { class: "qx-factor-body" });
    d.append(body);
    var built = false;
    d.addEventListener("toggle", function () {
      if (!d.open || built) return; built = true;
      if (available) {
        body.append(el("div", { class: "q-fdetail" }, [
          el("p", { class: "q-fdetail-score" }, [el("b", { class: "num", text: String(Math.round(f.score)) }), el("span", { text: " / 100" })]),
          X.pill(f.word || f.label, f.tone),
          f.rankText ? el("p", { class: "q-fdetail-rank", text: f.rankText }) : null]));
        var up = f.drivers.up.slice(0, 3), down = f.drivers.down.slice(0, 3);
        body.append(el("h3", { class: "qx-sub", text: "Warum?" }));
        body.append(up.length || down.length ? el("ul", { class: "q-why" }, up.map(function (c) {
          return el("li", { class: "is-up" }, [el("i", { "aria-hidden": "true", text: "+" }), el("span", { text: driverLine(c) })]);
        }).concat(down.map(function (c) {
          return el("li", { class: "is-down" }, [el("i", { "aria-hidden": "true", text: "−" }), el("span", { text: driverLine(c) })]);
        }))) : el("p", { class: "qx-small", text: f.why }));
      } else {
        body.append(el("p", { class: "dx-zahlen-satz", text: (nowhere ? "Für diese Eigenschaft hat heute keine Aktie einen Wert – sie zählt deshalb nirgends mit. " : "") + (f.missingText || "") }));
      }
      /* NVDA-Audit: wer "schwach" liest, soll hier lesen, was der Faktor
         NICHT misst - dort, wo die Frage entsteht. */
      if (f.id === "quality" && available && f.tone === "bad") {
        body.append(el("p", { class: "dx-bewertung-lesart", text: "Wichtig: Dieser Faktor bewertet Bilanz und die Deckung der Gewinne durch Zahlungsfluss – nicht, wie profitabel oder erfolgreich das Geschäft ist. Ein Unternehmen kann hier schwach und in der Profitabilität sehr stark sein." }));
      }
      /* Ebene 2: woraus der Wert besteht - jede Kennzahl mit Wert und
         Balken. Punkte, Gewichte, Vergleichsgruppe und Formeln: Ebene 3. */
      if (f.components.length) body.append(el("h3", { class: "qx-sub", text: "Woraus der Wert besteht" + (f.coverageText ? " · " + f.coverageText : "") }));
      f.components.forEach(function (c) {
        var ok = c.state === "AVAILABLE";
        body.append(el("div", { class: "dx-bewertung-zeile qx-comp" + (ok ? "" : " is-missing"), dataset: { component: c.id } }, [
          el("span", { class: "dx-bewertung-name", text: c.label }),
          el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [ok ? el("i", { style: "width:" + Math.max(2, Math.min(100, c.score)).toFixed(1) + "%" }) : null]),
          el("b", { class: "num", text: ok ? (c.value || "–") : "fehlt" }),
          el("small", { text: ok ? "Punkte " + c.scoreText + " · Gewicht " + (c.weightText || "–") : c.missing + " Gewicht " + (c.weightText || "–") + " – der Faktor wird aus den übrigen Kennzahlen gebildet." })
        ]));
      });
      body.append(X.more("Rohdaten und Berechnung", function () {
        var kids = [el("p", { class: "dx-bewertung-erklaerung" }, [el("b", { text: f.question + " " }), document.createTextNode(f.measures + (f.notMeasures ? " " + f.notMeasures : ""))]),
          available ? el("div", { class: "dx-firma" }, [
            el("div", {}, [el("span", { text: "Einordnung" }), el("b", { text: f.label })]),
            f.rankText ? el("div", {}, [el("span", { text: "Position im Markt" }), el("b", { text: f.rankText.replace(/\.$/, "") })]) : null,
            el("div", {}, [el("span", { text: "Datenabdeckung" }), el("b", { text: f.coverageText || "–" })]),
            f.confidence ? el("div", {}, [el("span", { text: "Belastbarkeit" }), el("b", { text: f.confidence })]) : null]) : null,
          el("p", { class: "qx-small", text: f.components.filter(function (c) { return c.state === "AVAILABLE" && (c.peer || c.window || c.direction); }).map(function (c) {
            return c.label + ": " + [c.direction, c.peer ? c.peer.level + (c.peer.size ? " (" + c.peer.size + " Unternehmen)" : "") : null, c.window ? "Zeitraum " + c.window : null].filter(Boolean).join(" · ");
          }).join(" | ") || null }),
          el("p", { class: "qx-small", text: f.reference }),
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

  /* ------------------------------------------------ Jetzt
     Die erste Ebene der Seite: was gerade passiert (Radar-Ereignisse) und
     drei Antworten - Setup, historische Evidenz, Staerke. Jede Antwort ist
     eine Aussage mit ihren Schluesselzahlen und fuehrt mit einem Tipp in
     ihr Kapitel; die Herleitung steht dort, nicht hier. */
  function answerCard(href, iconId, kicker, kids, tone, cls) {
    return el("a", { class: "q-answer tone-" + (tone || "unknown") + (cls ? " " + cls : ""), href: href }, [
      el("span", { class: "q-answer-icon", "aria-hidden": "true" }, [X.icon(iconId)]),
      el("span", { class: "q-answer-body" }, [el("span", { class: "q-answer-kicker", text: kicker })].concat(kids)),
      el("span", { class: "q-answer-go", "aria-hidden": "true", text: "›" })]);
  }
  function answerTitle(text) { return el("b", { class: "q-answer-title", text: text }); }
  function answerLine(text) { return el("span", { class: "q-answer-line", text: text }); }

  /* Staerke: das Urteil der Faktoren und wie viele stark, mittel, schwach
     sind - die Zaehlung aus denselben Stufen wie die Faktorzeilen. */
  function factorAnswer(vm, factors, factorsReason, missingNote) {
    var o = vm.overall;
    if (vm.factorState !== "AVAILABLE") {
      return answerCard("#grenzen", "nodata", "Stärke", [answerTitle(factorsReason === "NOT_AN_EQUITY_LISTING" ? "Keine Unternehmensanalyse für diesen Titel" : "Noch keine Einordnung möglich"),
        answerLine(VM.reasonText(factorsReason, "Für diesen Titel ist keine Faktoranalyse veröffentlicht.") + " " + missingNote)], "unknown", "qx-verdict-none");
    }
    return answerCard("#einordnung", "bars", "Stärke", [
      el("span", { class: "qx-verdict-top", dataset: { tone: o.tone } }, [answerTitle(o.text), answerLine(o.sub)])], o.tone);
  }
  /* Wie viele Eigenschaften stark, mittel, schwach sind - gezaehlt aus
     denselben Stufen (tone) wie die Faktorzeilen. */
  function factorCounts(factors) {
    var n = { good: 0, neutral: 0, bad: 0 };
    factors.forEach(function (f) { if (f.state === "AVAILABLE" && n[f.tone] !== undefined) n[f.tone]++; });
    return el("span", { class: "q-counts" }, [["good", "stark"], ["neutral", "mittel"], ["bad", "schwach"]].map(function (k) {
      return el("span", { class: "tone-" + k[0] + (n[k[0]] ? "" : " is-zero") }, [el("b", { class: "num", text: String(n[k[0]]) }), el("span", { text: " " + k[1] })]);
    }));
  }

  /* Historie: zuerst ein marktweit GETESTETES Signal, das gerade ausloest -
     immer mit dem Markt daneben. Sonst die nur BEOBACHTETE Vergangenheit
     dieser Aktie, ausdruecklich ohne Marktvergleich. Sonst der Satz, dass
     es nichts Getestetes gibt. Keine Quote ohne Stufe. */
  function evidenceAnswer(card, vm) {
    var E = global.QXEvidence, T = Radar ? Radar.TYPE : {};
    var tested = card ? (card.events || []).filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; })[0] : null;
    if (tested && E) {
      var b = tested.backtest, e = E.edgeOf(b);
      return answerCard("#historie", "trend", "Historisch getestet · „" + ((T[tested.eventType] || {}).label || tested.eventType) + "“", [
        answerTitle(e.label),
        el("span", { class: "q-mini-compare", role: "img", "aria-label": "Signal " + E.share1(b.positiveShare) + ", Markt " + E.share1(b.basePositiveShare) + ", Unterschied " + E.pp(b.deltaPositiveShare) }, [
          el("span", { class: "is-signal" }, [el("small", { text: "Signal" }), el("i", { style: "--v:" + Math.round((b.positiveShare || 0) * 100) + "%" }), el("b", { class: "num", text: E.share1(b.positiveShare) })]),
          el("span", { class: "is-base" }, [el("small", { text: "Markt" }), el("i", { style: "--v:" + Math.round((b.basePositiveShare || 0) * 100) + "%" }), el("b", { class: "num", text: E.share1(b.basePositiveShare) })])]),
        answerLine(E.pp(b.deltaPositiveShare) + " gegenüber dem Markt · Vertrauen " + (E.TRUST_SHORT[b.trust] || "nicht bereit"))], e.tone === "up" ? "good" : e.tone === "down" ? "bad" : "neutral");
    }
    var same = (vm.replay.levels || []).filter(function (lv) { return lv.id === "SAME_STOCK"; })[0];
    var main = same && same.state === "AVAILABLE" ? ((same.horizons || []).filter(function (h) { return h.id === "m6" && h.sufficient; })[0] || (same.horizons || []).filter(function (h) { return h.sufficient; }).slice(-1)[0]) : null;
    if (main) {
      return answerCard("#historie", "clock", "Historisch beobachtet · nur diese Aktie", [answerTitle(main.positivePct + " der Fälle lagen " + "nach " + String(main.label).replace(/Monate$/, "Monaten") + " höher"),
        answerLine(main.completed + " ähnliche Fälle seit " + String(same.from).slice(0, 4) + " · ohne Marktvergleich, nicht getestet")], "neutral");
    }
    return answerCard("#historie", "clock", "Historie", [answerTitle("Kein getestetes Signal aktiv"), answerLine("Zu dieser Lage gibt es gerade keine marktweit getestete Auswertung.")], "unknown");
  }

  function verdictCard(vm, nowHost, answers) {
    var node = el("section", { class: "dv2-stock-context qx-glance q-now-card" + (vm.factorState === "AVAILABLE" ? " qx-verdict-card" : " qx-verdict-none"), id: "einordnung-kurz" }, [
      el("h2", { class: "q-now-title", text: "Was ist jetzt wichtig?" }), nowHost || null, el("div", { class: "q-answers" }, answers)]);
    if (vm.returns && vm.returns.state === "AVAILABLE") {
      node.append(el("div", { class: "dx-zeitachse qx-returns", id: "rendite", role: "group", "aria-label": "Kursentwicklung" }, vm.returns.rows.map(function (r) {
        return el("div", {}, [el("span", { text: r.label.replace("12 Monate ohne den letzten", "12 Monate*") }), el("b", { class: "num " + (r.priceRaw > 0 ? "up" : r.priceRaw < 0 ? "down" : ""), text: r.price })]);
      })), X.more("Kurs und Ausschüttungen", function () { return el("p", { class: "qx-small qx-return-kinds", text: vm.returns.rows.map(function (r) { return r.label.replace("12 Monate ohne den letzten", "12 Monate*") + ": Kursstärke " + r.price + ", Anlegerrendite " + r.investor; }).join(" · ") + "." +
        (vm.returns.rows.some(function (r) { return /ohne den letzten/.test(r.label); }) ? " *12 Monate ohne den letzten Monat." : "") + " Kursstärke misst nur den Kurs, die Anlegerrendite rechnet Ausschüttungen mit ein. " + vm.returns.text }); }));
    }
    return node;
  }

  /* ------------------------------------------------ Die Waage
     Spricht dafuer / dagegen wie Discovers "Was dafür spricht — und was
     dagegen" (dx-waage). Drei Punkte je Seite offen, der Rest dahinter;
     und was NICHT bewertet wurde, steht dabei. */
  function balanceSection(vm, hidden) {
    var o = vm.overall, pc = vm.proCon;
    var ART = { good: "pro", bad: "contra" };
    function punkt(i, art) {
      return el("li", {}, [el("i", { class: "dx-waage-marke", "aria-hidden": "true", text: art === "pro" ? "+" : "−" }),
        el("div", {}, [el("a", { href: "#faktor-" + i.factorId, class: "qx-waage-link" }, [el("b", { text: i.title + " (" + Math.round(i.score) + ")" })]),
          el("span", { text: i.text + (i.caveat ? " " + i.caveat : "") })])]);
    }
    function col(title, tone, items, empty) {
      var art = ART[tone];
      var host = el("div", { class: "dx-waage-spalte dx-waage-spalte--" + art + " qx-pc-col tone-" + tone }, [el("h3", { text: title })]);
      if (!items.length) { host.append(el("p", { class: "qx-pc-empty", text: empty })); return host; }
      host.append(el("ul", {}, items.slice(0, 3).map(function (i) { return punkt(i, art); })));
      if (items.length > 3) host.append(el("details", { class: "dx-weitere dx-waage-weitere" }, [el("summary", { text: "Weitere Punkte (" + (items.length - 3) + ")" }),
        el("ul", {}, items.slice(3).map(function (i) { return punkt(i, art); }))]));
      return host;
    }
    var kids = [el("h3", { class: "qx-waage-title", text: "Was dafür spricht — und was dagegen" }), el("div", { class: "dx-waage" }, [
      col("Spricht dafür", "good", pc.pro, "Keine der gemessenen Eigenschaften ist stark."),
      col("Spricht dagegen", "bad", pc.con, "Keine der gemessenen Eigenschaften ist schwach.")
    ])];
    if (pc.middle.length) kids.push(el("p", { class: "qx-middle" }, [el("b", { text: "Im Mittelfeld: " }), el("span", { text: pc.middle.map(function (m) { return m.title.replace(": durchschnittlich", "") + " (" + Math.round(m.score) + ")"; }).join(", ") + "." })]));
    var open = pc.open.filter(function (i) { return !(hidden || []).some(function (f) { return f.id === i.factorId; }); });
    if (open.length) kids.push(el("details", { class: "dx-weitere" }, [el("summary", { text: "Noch nicht bewertbar (" + open.length + ")" }),
      el("ul", { class: "dx-kann" }, open.map(function (i) { return el("li", { class: "nein" }, [el("b", { text: i.title }), el("span", { text: " – " + i.text })]); }))]));
    kids.push(foot("Eine Gesamtnote gibt es bewusst nicht: Sie würde den Zielkonflikt verbergen, auf den es ankommt – etwa hohe Qualität bei anspruchsvoller Bewertung. Einordnung im Vergleich zu allen anderen Aktien – keine Empfehlung."));
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
    /* Wo die Aktie steht, was als Naechstes fehlt und was sie ungueltig
       macht, zeigt die Setup-Karte darueber; hier steht nur das Warum. */
    if (s.why) kids.push(el("p", { class: "dx-bewertung-satz" }, [el("b", { text: "Warum? " }), el("span", { text: s.why })]));
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
    var b = s.best, art = strategyArt(b.id);
    var kids = [el("p", { class: "dx-bewertung-satz qx-strategy-sentence" }, [el("b", { text: s.sentence })])];
    kids.push(el("a", { class: "v2-collection-link qx-strategy-link", href: X.routes.strategy(b.id) }, [
      el("span", { class: "v2-collection-art" + (art ? " has-image" : ""), "aria-hidden": "true" }, [art ? artOnSight(art) : el("span", { class: "v2-collection-glyph", text: "↗" }),
        el("span", { class: "v2-collection-art-label", text: b.label.split(" · ")[0] })]),
      el("span", { class: "v2-collection-copy" }, [el("strong", { text: b.label }), el("span", { text: b.countText + ". " + b.plain })]),
      el("span", { class: "v2-collection-arrow", text: "→" })]));
    if (!s.fits) kids.push(el("p", { class: "qx-small", text: "Das beschreibt die Nähe zu einem Bedingungssatz und keine Prognose." }));
    if (changeText) kids.push(el("p", { class: "qx-small", text: changeText }));
    kids.push(el("div", { class: "dx-waage qx-waage-3" }, [
      el("div", { class: "dx-waage-spalte dx-waage-spalte--pro qx-pc-col tone-good" }, [el("h3", { text: "Erfüllt" }), conditions(b.met, "Keine Bedingung erfüllt.")]),
      el("div", { class: "dx-waage-spalte qx-pc-col qx-open-col tone-unknown" }, [el("h3", { text: "Offen" }), conditions(b.open, "Alle Bedingungen sind messbar.")]),
      el("div", { class: "dx-waage-spalte dx-waage-spalte--contra qx-pc-col tone-bad" }, [el("h3", { text: "Nicht erfüllt" }), conditions(b.notMet, "Keine Bedingung verletzt.")])
    ]));
    if (b.risk) kids.push(el("p", { class: "qx-small", text: "Typisches Risiko dieses Stils: " + b.risk }));
    /* Anlagestil heisst "welche Art von Investment passt" - nicht "getestete Strategie". */
    kids.push(el("p", { class: "q-setup-evidence" }, [el("span", { class: "q-ev-tier tier-tested is-off", text: "Historische Strategieperformance" }),
      el("span", { text: " " + (s.fits ? "Der Anlagestil passt aktuell. " : "") + "Wie sich dieser Stil historisch entwickelt hat, ist noch nicht getestet und nicht zertifiziert – dafür fehlen die historische Index-Zugehörigkeit und eine längere Faktorhistorie." })]));
    kids.push(X.more("Weitere Anlagestile im Vergleich", function () {
      return [el("div", { class: "qx-list" }, s.others.map(function (o) {
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
  function replaySection(vm, conditionWords, evidence, signalHost) {
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
      var fine = [];
      if (same.conditions && same.conditions.length) fine.push(el("p", { class: "q-ev-note", text: "Ähnlich heißt: " + same.conditions.map(function (id) { return conditionWords[id] || id.replace(/-/g, " "); }).join(" · ") + "." }));
      if (main) {
        box.push(el("div", { class: "q-ev-stats q-ev-stats--4" }, [
          el("div", { class: "q-ev-stat" }, [el("b", { class: "num", text: main.positivePct || "–" }), el("span", { text: "lagen " + nach(main.label) + " höher" })]),
          el("div", { class: "q-ev-stat" }, [el("b", { class: "num " + (main.medianRaw > 0 ? "up" : main.medianRaw < 0 ? "down" : ""), text: main.median || "–" }), el("span", { text: "typisches Ergebnis (Median)" })]),
          el("div", { class: "q-ev-stat" }, [el("b", { class: "num down", text: main.drawdown || "–" }), el("span", { text: "typischer Rückgang zwischendurch" })]),
          el("div", { class: "q-ev-stat" }, [el("b", { class: "num", text: String(main.completed) }), el("span", { text: "abgeschlossene Fälle" })])]));
        var dd = E ? E.drawdownSentence(main.drawdownRaw, main.worstDrawdownRaw) : null;
        if (dd) fine.push(el("p", { class: "q-ev-note", text: dd }));
      } else box.push(el("p", { text: same.text }));
      box.push(el("p", { class: "q-ev-note", text: "Beobachtet, nicht getestet – nur die Vergangenheit dieser Aktie, ohne Marktvergleich." }));
      fine.push(el("p", { class: "q-ev-note", text: "Es gibt keine Vergleichsrate mit dem Markt, die Fälle überlappen sich zeitlich, und Dividenden sind nicht enthalten." }));
      box.push(X.more("Alle Zeitfenster und die Verteilung", function () { return fine.concat(sameStockDetails(same, main)); }));
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
    /* Was noch nicht getestet ist, steht mit seiner Zahl im Aufklapper-Kopf -
       sichtbar, aber nicht als Liste in der ersten Ebene. */
    if (closed.length) c.push(X.more("Noch ohne Test: " + closed.map(function (k) { return k.label; }).join(", "), function () { return el("ul", { class: "q-ev-closed" }, closed.map(function (k) { return el("li", { text: closedKindSentence(k) }); })); }));

    kids.push(el("div", { class: "q-ev-levels" }, [el("div", {}, a), el("div", {}, b), el("div", { class: "is-wide" }, c)]));
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
      return E.signalEvidence(e.backtest, { stock: true, backtestHref: X.routes.backtest(), label: "„" + ((T[e.eventType] || {}).label || e.eventType) + "“ am " + X.dateDe(e.occurredAt) });
    });
  }

  /* ------------------------------------------------ 06 Kursstruktur */
  function technicalSection(t, ticker) {
    if (!t || t.state !== "AVAILABLE") {
      var why = t && VM.technicalReasonText(t.unavailability);
      return [X.notice("Keine Kursstruktur-Auswertung", why || "Für diesen Titel ist keine technische Auswertung veröffentlicht.")];
    }
    var lag = VM.analysisLagText(t.lag);
    return [X.stats([["Trend", t.trend], ["Kursdynamik", t.momentum], ["Schwankung", t.volatility]].concat(t.elliott ? [["Elliott-Wellen", t.elliott]] : []).map(function (p) {
        return X.stat(p[0], (p[1] && p[1].label) || "–");
      })),
      foot("Analyse bis " + X.dateDe(t.asOf) + ". " + (lag || "") + (t.elliott ? " Elliott-Szenarien sind Lesarten des Kursverlaufs, keine Wahrscheinlichkeiten." : "")),
      t.fullWorkspace ? X.actions([X.btn("Technische Analyse & Elliott öffnen", X.routes.technical(ticker), "secondary")])
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
        var node = X.stat(m.label, v, m.description ? m.description.split(".")[0] : null); if (m.description) node.title = m.description; stats.push(node);
      });
    });
    if (!stats.length) return [X.notice("Keine Unternehmenszahlen", "Die Geschäftszahlen dieses Titels erfüllen die Anforderungen der Methodik nicht.")];
    return [el("p", { class: "dv2-valuation-question", text: "Wie verdient " + (s.name && s.name !== s.ticker ? s.name : "das Unternehmen") + " – und wie teuer ist die Aktie?" }),
      X.stats(stats.slice(0, 10)),
      Object.keys(withheld).length ? el("p", { class: "qx-small", text: Object.keys(withheld).map(function (r) { return VM.reasonText(r); }).join(" ") }) : null,
      foot([s.quant.fundamentalsAsOf ? "Geschäftszahlen bis " + X.dateDe(s.quant.fundamentalsAsOf) + (s.quant.availableAt ? " (bekannt seit " + X.dateDe(s.quant.availableAt) + ")" : "") + ", Quelle SEC EDGAR." : "Quelle der Geschäftszahlen: SEC EDGAR.", s.quant.asOf ? "Marktbezogene Kennzahlen bis " + X.dateDe(s.quant.asOf) + "." : null, "Bewertungen sind kein Urteil über einen fairen Preis."].filter(Boolean).join(" ")),
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
  /* Die Bestaetigungsregel der Szenario-Engine (scenario-engine.js
     whatMustHappen) in Alltagssprache: eine kurze Antwort fuer die erste
     Ebene und ein ganzer Satz. Nur Wortwahl, keine neue Regel - der
     Originalsatz steht unter "Wie wird das berechnet?". Unbekannte Saetze
     erscheinen unveraendert. */
  var TRIGGER_PLAIN = {
    "Kurs haelt die Entry Zone bzw. das letzte Strukturtief und erzeugt ein neues Higher High.": ["Neues Hoch", "Der Kurs hält die Einstiegszone oder das letzte Tief und bildet danach ein neues Hoch."],
    "Kurs scheitert an der Entry Zone bzw. dem letzten Strukturhoch und erzeugt ein neues Lower Low.": ["Neues Tief", "Der Kurs scheitert an der Einstiegszone oder am letzten Hoch und bildet danach ein neues Tief."],
    "Kurs korrigiert tiefer (61.8–78.6 % des Referenz-Swings), haelt aber den Swing-Ursprung.": ["Rücksetzer, der hält", "Der Kurs setzt tiefer zurück (61,8–78,6 % der letzten Bewegung), hält aber deren Ausgangspunkt."]
  };
  function triggerPlain(t) { return t ? (TRIGGER_PLAIN[t] || [t, t]) : null; }
  function away(v, price) {
    if (typeof v !== "number" || typeof price !== "number" || !(price > 0)) return null;
    var x = (v / price - 1) * 100;
    return (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %";
  }
  /* Was die Setup-Karte und die Setup-Antwort oben brauchen - EINE Ableitung
     aus Setup-Beobachtung und technischem Szenario, nicht zwei. */
  function setupFacts(vm, ws) {
    var st = vm.setup, ts = ws && ws.state === "AVAILABLE" ? ws.tradeSetup : null, sc = null;
    if (ws && ws.state === "AVAILABLE" && ws.scenarios && ws.scenarios.length) {
      sc = ws.scenarios.filter(function (x) { return ts && x.id === ts.scenarioId; })[0] || ws.scenarios.filter(function (x) { return x.kind === "PRIMARY"; })[0] || null;
    }
    var inv = sc && sc.invalidation && typeof sc.invalidation.price === "number" ? sc.invalidation.price : st.invalidation && st.invalidation.price;
    return { st: st, ts: ts, sc: sc, inv: typeof inv === "number" ? inv : null, bear: !!(sc && sc.direction && sc.direction !== "BULLISH"),
      targets: sc && sc.targets ? sc.targets.slice(0, 2) : [], stop: sc && sc.stop && typeof sc.stop.price === "number" ? sc.stop.price : null,
      entry: sc && sc.entry ? sc.entry : null, trigger: triggerPlain(sc && sc.confirmation),
      open: st.next && st.next.conditions ? st.next.conditions : [], holding: st.invalidation && st.invalidation.conditions ? st.invalidation.conditions : [],
      on: st.state === "CONFIRMED", none: st.state === "UNAVAILABLE" || st.state === "NO_SETUP", status: st.state === "UNAVAILABLE" ? "Kein Setup beobachtet" : st.label };
  }
  function statusPill(F) { return el("span", { class: "q-status " + (F.on ? "is-on" : F.none ? "" : "is-wait"), text: F.status }); }

  /* Setup oben auf der Seite: Zustand und die drei Marken, sobald das
     Szenario geladen ist. */
  function setupAnswer(vm, ws) {
    var F = setupFacts(vm, ws);
    if (F.st.state === "UNAVAILABLE") return answerCard("#setup", "setups", "Setup", [answerTitle("Kein Setup beobachtet"), answerLine(F.st.text)], "unknown");
    if (F.bear) return answerCard("#setup", "setups", "Setup", [answerTitle(F.status), answerLine("Basisszenario " + (F.sc.direction === "BEARISH" ? "abwärts" : "ohne klare Richtung") + " – kein Einstieg ausgewiesen")], F.none ? "unknown" : "neutral");
    var facts = [F.entry ? ["Interessant", zone(F.entry)] : null, F.inv !== null ? ["Ungültig", usd(F.inv)] : null, F.targets[0] ? ["Ziel 1", zone(F.targets[0])] : null].filter(Boolean);
    return answerCard("#setup", "setups", "Setup", [answerTitle(F.status),
      facts.length ? el("span", { class: "q-answer-facts" }, facts.map(function (x) { return el("span", { class: "is-" + (x[0] === "Ungültig" ? "down" : x[0] === "Ziel 1" ? "up" : "entry") }, [el("small", { text: x[0] }), el("b", { class: "num", text: x[1] })]); })) : null,
      F.trigger ? answerLine("Bestätigung: " + F.trigger[0]) : F.st.next && F.st.next.text ? answerLine(F.st.next.text) : null], F.on ? "good" : F.none ? "unknown" : "neutral");
  }

  /* Die Marken des Szenarios auf einer Linie: Stop, Einstiegszone, Kurs,
     Ziele - dieselben Zahlen wie in den Antworten darunter, als Bild. */
  function priceStrip(price, stop, entry, targets) {
    var pts = [price, stop].concat(entry ? [entry.zoneLow, entry.zoneHigh] : []);
    targets.forEach(function (t) { pts.push(t.zoneLow, t.zoneHigh); });
    pts = pts.filter(function (v) { return typeof v === "number" && isFinite(v); });
    if (typeof price !== "number" || typeof stop !== "number" || !targets.length || pts.length < 3) return null;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = hi - lo;
    if (!(span > 0)) return null;
    function at(v) { return ((v - lo) / span * 100).toFixed(2) + "%"; }
    function band(cls, z, label) {
      return el("span", { class: "q-ps-band " + cls, style: "left:" + at(z.zoneLow) + ";width:calc(" + at(z.zoneHigh) + " - " + at(z.zoneLow) + " + 3px)" }, [el("small", { text: label })]);
    }
    var kids = [el("span", { class: "q-ps-risk", style: "left:0;width:" + at(price) })];
    if (entry) kids.push(band("is-entry", entry, "Interessant"));
    targets.forEach(function (t, i) { kids.push(band("is-target", t, "Ziel " + (i + 1))); });
    kids.push(el("span", { class: "q-ps-mark is-stop", style: "left:" + at(stop) }, [el("small", { text: "Stop" })]));
    kids.push(el("span", { class: "q-ps-mark is-now", style: "left:" + at(price) }, [el("small", { text: "Kurs " + usd(price) })]));
    return el("div", { class: "q-pricestrip" }, [el("div", { class: "q-ps-track", role: "img",
      "aria-label": "Kurs " + usd(price) + ", Stop " + usd(stop) + (entry ? ", interessant " + zone(entry) : "") + ", " + targets.map(function (t, i) { return "Ziel " + (i + 1) + " " + zone(t); }).join(", ") }, kids)]);
  }

  /* ------------------------------------------------ Setup-Karte
     Erste Ebene: Zustand, die Strecke Stop - Einstieg - Kurs - Ziele, das
     Chance-Risiko-Verhaeltnis und hoechstens vier Antworten. Danach, was
     zur naechsten Stufe fehlt. Alles Weitere - was das Setup ungueltig
     macht, Verlauf und Stufen, wie gerechnet wird - je einen Tipp tiefer.
     Einstieg, Stop und Ziele sind ein gekennzeichnetes Szenario der
     technischen Auswertung, nie eine Empfehlung. */
  function answerRow(cls, label, value, note) {
    return el("div", { class: "q-sa " + cls + (value ? "" : " is-missing") }, [el("dt", { text: label }), el("dd", {}, [el("b", { class: "num", text: value || "nicht berechnet" }), note ? el("small", { text: note }) : null])]);
  }
  function drill(title, build, open) { return X.more(title, build, { open: !!open }); }
  function renderSetupCard(host, vm, ws, technical, ticker, lifecycleBox, price, card) {
    var F = setupFacts(vm, ws), st = F.st, sc = F.sc, ts = F.ts, nx = st.next;
    var kids = [el("div", { class: "q-setup-head" }, [statusPill(F), !F.bear && sc && sc.entry && ENTRY_WORDS[sc.entryStatus] ? el("span", { class: "q-setup-where", text: ENTRY_WORDS[sc.entryStatus] }) : null])];
    var how = function () {
      return [nx && nx.text ? el("p", { class: "qx-small", text: nx.text }) : null,
        sc && sc.confirmation ? el("p", { class: "qx-small", text: "Bestätigungsregel des Szenarios im Wortlaut: „" + sc.confirmation + "“" }) : null,
        el("p", { class: "q-scenario-note", text: sc
          ? "Technische Auswertung vom " + X.dateDe(ws.asOf) + " (" + sc.label + ", " + sc.status + "). Die Marken zeigen, wo das Szenario rechnerisch ansetzt, ungültig wird und auf Widerstand trifft – keine Empfehlung, keine Order."
          : technical && technical.state === "AVAILABLE" && technical.fullWorkspace && !ws ? "Die Szenario-Marken werden geladen …"
          : "Einstieg, Stop-Loss und Ziele rechnet Quant nur für Titel mit vollständiger technischer Auswertung – für diesen Titel liegt sie nicht vor. " + (F.inv !== null ? "Die Invalidierung stammt aus der Setup-Beobachtung." : "Quant setzt keine Ersatzwerte.") }),
        ts && ts.status === "COMPLETE_LOW_RR" ? el("p", { class: "qx-small", text: "Bis Ziel 1 liegt das Chance-Risiko-Verhältnis zum Teil unter der Mindestschwelle der Methodik." }) : null,
        el("p", { class: "q-setup-links" }, [technical && technical.fullWorkspace ? X.link("Technische Analyse öffnen", X.routes.technical(ticker)) : null, X.link("Wie Setups entstehen", X.routes.method("setups"))].filter(Boolean))];
    };
    if (st.state === "UNAVAILABLE") {
      kids.push(el("p", { class: "q-setup-none", text: st.text }));
      kids.push(drill("Wie wird das berechnet?", how));
      host.replaceChildren(el("div", { class: "q-setup" }, kids));
      return;
    }
    if (F.bear) {
      kids.push(el("dl", { class: "q-setup-answers" }, [
        answerRow("is-entry", "Basisszenario", sc.direction === "BEARISH" ? "Abwärts" : "Ohne klare Richtung", "kein Einstieg ausgewiesen – ein Setup ist hier eine Aufwärts-Situation"),
        answerRow("is-inv", "Ungültig über", F.inv !== null ? usd(F.inv) : null, F.inv !== null ? "Schluss darüber: Abwärtsszenario ungültig" : null),
        answerRow("is-target is-down", "Zielzonen abwärts", F.targets.length ? F.targets.map(zone).join(" · ") : null, null)]));
    } else {
      kids.push(priceStrip(price, F.stop !== null ? F.stop : F.inv, F.entry, F.targets));
      if (ts && ts.riskReward && typeof ts.riskReward.low === "number") {
        kids.push(el("p", { class: "q-rr" + (ts.status === "COMPLETE_LOW_RR" ? " is-low" : "") }, [el("span", { text: "Chance/Risiko" }),
          el("b", { class: "num", text: "bis Ziel 1: " + ratio(ts.riskReward.low, ts.riskReward.high) + (typeof ts.riskReward.target2Low === "number" ? " · bis Ziel 2: " + ratio(ts.riskReward.target2Low, ts.riskReward.target2High) : "") }),
          ts.status === "COMPLETE_LOW_RR" ? el("small", { text: "zum Teil unter der Mindestschwelle" }) : null]));
      }
      var stopNote = F.stop !== null && F.stop !== F.inv ? "Stop " + usd(F.stop) : null;
      kids.push(el("dl", { class: "q-setup-answers" }, [
        answerRow("is-entry", "Interessant ab", F.entry ? zone(F.entry) : null, F.entry ? [ENTRY_WORDS[sc.entryStatus] ? null : "Zone laut Szenario", away(F.entry.zoneHigh, price) ? "Obergrenze " + away(F.entry.zoneHigh, price) + " vom Kurs" : null].filter(Boolean).join(" · ") || null : null),
        answerRow("is-trigger", "Bestätigt wenn", F.trigger ? F.trigger[0] : null, F.trigger && F.trigger[1] !== F.trigger[0] ? F.trigger[1] : null),
        answerRow("is-inv", "Ungültig unter", F.inv !== null ? usd(F.inv) : null, F.inv !== null ? [away(F.inv, price) ? away(F.inv, price) + " vom Kurs" : null, "Schluss darunter: Szenario ungültig", stopNote].filter(Boolean).join(" · ") : null),
        answerRow("is-target", "Ziele", F.targets.length ? F.targets.map(zone).join(" · ") : null, F.targets.length && typeof price === "number" ? F.targets.map(function (t, i) { return "Ziel " + (i + 1) + " " + away(t.zoneLow, price); }).join(" · ") + " vom Kurs" : null)]));
    }
    /* Was fehlt zur naechsten Stufe: die offenen Bedingungen mit ihrem
       heutigen Wert - und als Zaehlung, sobald der Radar sie liefert. */
    var next = card && card.next && card.next.total ? card.next : null;
    var openN = next ? next.open.length : F.open.filter(function (c) { return c.state !== "MET"; }).length;
    var nextLabel = next ? lifecycleLabel(next.state) : nx && nx.label;
    var missing = el("div", { class: "q-missing" }, [
      el("p", { class: "q-missing-head" }, [el("b", { text: st.state === "SETUP_FORMING" || !nextLabel ? "Was fehlt zur Bestätigung?" : "Was fehlt bis „" + nextLabel + "“?" }),
        next ? el("span", { class: "num", text: (next.total - openN) + " von " + next.total + " erfüllt" }) : null]),
      next ? el("span", { class: "q-progress", role: "img", "aria-label": (next.total - openN) + " von " + next.total + " Bedingungen für „" + nextLabel + "“ erfüllt" }, [el("i", { style: "width:" + Math.round((next.total - openN) / next.total * 100) + "%" })]) : null,
      F.open.length ? el("ul", { class: "q-checks-mini" }, F.open.map(function (c) {
        return el("li", { class: c.state === "MET" ? "is-met" : c.state === "OPEN" ? "is-open" : "is-miss" }, [el("i", { "aria-hidden": "true", text: c.state === "MET" ? "✓" : c.state === "OPEN" ? "–" : "○" }),
          el("span", {}, [el("b", { text: c.label }), c.value ? el("small", { text: c.value }) : null])]);
      })) : el("p", { class: "qx-small", text: st.state === "CONFIRMED" ? "Nichts – das Setup ist bestätigt. Höhere Stufen brauchen eine längere Beobachtungsreihe." : "Keine offene Bedingung für eine höhere Stufe." })]);
    kids.push(missing);
    kids.push(el("div", { class: "q-drills" }, [
      F.none && !F.holding.length ? null : drill("Was würde das Setup ungültig machen?" + (F.holding.length ? " · " + F.holding.filter(function (c) { return c.state === "MET"; }).length + " von " + F.holding.length + " halten" : ""), function () {
        return [st.invalidation && st.invalidation.text ? el("p", { class: "qx-small", text: st.invalidation.text }) : null, conditions(F.holding, "Keine tragende Bedingung veröffentlicht.")];
      }),
      drill("Verlauf und Stufen", function () { return [lifecycleBox, setupSection(vm)]; }),
      drill("Wie wird das berechnet?", how)]));
    host.replaceChildren(el("div", { class: "q-setup" }, kids));
  }

  /* "Was ist jetzt wichtig?" - die Radar-Ereignisse dieser Aktie. Ihr
     naechster Schritt steht in der Setup-Antwort, die Historie in der
     Evidenz-Antwort darunter. */
  var Radar = global.VUQuantRadar;
  function eventLine(e) {
    var t = Radar && Radar.TYPE[e.eventType];
    return el("li", { class: "q-ev tone-" + (e.direction || (t && t.tone) || "info") }, [
      el("b", { text: t ? t.label : e.eventType }), el("span", { text: e.explanation }), el("small", { text: X.dateDe(e.occurredAt) })]);
  }
  function nowContent(ticker, radar) {
    var out = [];
    var card = radar && radar.state === "AVAILABLE" ? radar.card : null;
    if (card && card.events.length) {
      out.push(el("ul", { class: "q-events" }, card.events.slice(0, 3).map(eventLine)));
    } else if (radar && radar.state === "AVAILABLE") {
      out.push(el("p", { class: "q-now-none", text: "Zum letzten Stand (" + X.dateDe(radar.radarAsOf) + ") meldet Quant für diese Aktie keine neue Veränderung." }));
    }
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
    return el("div", { class: "q-lifecycle" }, [
      el("ol", { "aria-label": "Lebenszyklus eines Setups" }, Radar.LIFECYCLE.filter(function (x) { return x.id !== "NO_SETUP"; }).map(function (x) {
        var now = x.id === lc.current;
        return el("li", { class: (now ? "is-now " : "") + (x.tier === "PATH_DEPENDENT" ? "is-closed" : ""), "aria-current": now ? "step" : null }, [el("span", { text: x.label })]);
      })),
      el("p", { class: "qx-small", text: (lc.current === "NO_SETUP" ? "Derzeit kein Setup" : lifecycleLabel(lc.current) + " " + (lc.sinceIsLowerBound ? "mindestens seit " : "seit ") + X.dateDe(lc.since)) +
        (lc.previous ? " · vorher " + lifecycleLabel(lc.previous) + " (" + X.dateDe(lc.previousAsOf) + ")" : "") +
        ". Die gestrichelten Stufen ab „Trend läuft“ brauchen eine längere Beobachtungsreihe und sind noch nicht freigeschaltet (" + (lc.snapshots || []).length + " veröffentlichte Stichtage)." })]);
  }

  /* Jedes Kapitel traegt Discovers Kapitelklasse - dieselben Baender wie
     auf Discovers Aktienseite (Zahlen, Gold, Tafel). */
  var CHAPTER_CLASS = { einordnung: "dx-chapter--zahlen", veraenderung: "dx-chapter--journey",
    setup: "dv2-stock-valuation", historie: "qx-replay-chapter", zahlen: "dv2-stock-valuation qx-figures", grenzen: "qx-limits" };

  /**
   * @param {HTMLElement} main
   * @param {string} ticker
   * @param {object} ctx {api, distribution(): Promise, patternWords(): Promise}
   * @returns {function} dispose
   */
  async function render(main, ticker, ctx) {
    var api = ctx.api, disposers = [];
    var page = el("article", { class: "dv2-stock qx-stock q-stock" });
    main.append(page);
    var heroHost = el("div", { class: "qx-hero-host" }), bodyHost = el("div", { class: "qx-body-host" }, [X.loading("Analyse wird geladen …")]);
    page.append(heroHost, bodyHost);

    var brief = await api.getIntelligenceBrief(ticker).catch(function () { return null; });
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
       Wie im Konzept: zurueck, Logo, Name, Kurs - und der Stern zum Beobachten. */
    function watchText(on) { return on ? "★ Beobachtet" : "☆ Beobachten"; }
    var watchBtn = el("button", { type: "button", class: "v2-watch-button qx-watch", "aria-pressed": X.watch.has(ticker) ? "true" : "false",
      text: watchText(X.watch.has(ticker)) });
    watchBtn.addEventListener("click", function () { var on = X.watch.toggle(ticker); watchBtn.setAttribute("aria-pressed", on ? "true" : "false"); watchBtn.textContent = watchText(on); });
    var eodBars = s.chart && s.chart.state === "AVAILABLE" ? (s.chart.bars || []) : [];
    var eod = eodBars.map(function (b) { return [b.date, b.close]; });
    var last = eod.length ? eod[eod.length - 1] : null, prev = eod.length > 1 ? eod[eod.length - 2] : null;
    var quote = el("div", { class: "dx-price qx-quote", "aria-live": "polite" });
    function setQuote(price, delta, when) {
      quote.replaceChildren(el("b", { class: "num", text: X.money(price, "USD") }),
        el("span", { class: "num " + (delta > 0 ? "up" : delta < 0 ? "down" : ""), text: typeof delta === "number" ? X.signed(delta, 2) + " zum Vortag" : "" }),
        el("small", { text: when }));
    }
    /* Der Kurs im Kopf ist der veroeffentlichte Kurs des Dienstes - ohne
       zweiten Weg zur Zahl. Ist die Anzeige nicht freigegeben, bleibt sie es,
       auch wenn eine Reihe geladen waere. */
    var priceAllowed = !(s.price && s.price.reason === "DISPLAY_NOT_PERMITTED");
    if (!priceAllowed) { eod = []; last = null; prev = null; }
    var hasDailyPrice = priceAllowed && s.price && typeof s.price.value === "number";
    if (hasDailyPrice) {
      setQuote(s.price.value, last && prev && prev[1] > 0 ? (last[1] / prev[1] - 1) * 100 : null,
        "Schlusskurs am " + X.dateDe(s.price.asOf || (last && last[0]) || s.asOf) + " · USD");
    } else {
      quote.replaceChildren(el("b", { class: "qx-quote-none", text: priceAllowed ? "Kein Kurs veröffentlicht" : "Kurs nicht freigegeben" }), el("small", { text: priceAllowed ? "Für diesen Titel liegt kein veröffentlichter Kurs vor." : VM.reasonText("DISPLAY_NOT_PERMITTED") }));
    }
    await ctx.loadNames().catch(function () { return null; });
    var entry = ctx.entries[ticker] || {};
    var kind = s.securityType || entry.t || null;
    var KIND = { ETF: "ETF", PREFERRED: "Vorzugsaktie", ADR: "ADR (Hinterlegungsschein)" };
    var tags = [kind && kind !== "COMMON_STOCK" ? el("span", { class: "dx-index-badge qx-tag", text: KIND[kind] || "keine Stammaktie" }) : null,
      entry.il > 1 ? el("span", { class: "dx-index-badge qx-tag", text: "eine von " + entry.il + " Aktiengattungen" }) : null].filter(Boolean);
    heroHost.append(el("section", { class: "q-stock-head qx-stock-hero" }, [
      el("a", { class: "q-back qx-back", href: X.routes.stocks(), "aria-label": "Zurück zu Aktien", text: "←" }),
      X.logo(ticker, displayName || ticker, "lg", { onlyLogo: true }),
      el("div", { class: "q-stock-name" }, [
        el("h1", { text: displayName || "Aktienanalyse" }),
        displayName ? null : el("p", { class: "qx-small", text: "Firmenname nicht veröffentlicht" }),
        el("p", { class: "q-stock-meta qx-stock-id" }, [el("b", { text: ticker }), s.industry ? el("span", { text: s.industry }) : null, el("span", { text: "US-Aktie" })].concat(tags))
      ]),
      el("div", { class: "q-stock-price" }, [quote, watchBtn])
    ]));
    var idn = VM.identityNote(s);
    if (idn) heroHost.append(el("div", { class: "dx-note qx-notice", role: "note", dataset: { conflict: idn.kind || "" } }, [
      el("b", { text: idn.title }), el("p", { text: idn.shown }), el("p", { class: "qx-small", text: idn.why })]));

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
    bodyHost.replaceChildren();

    /* ---------------------------------------------------------- Chart */
    var chart = !priceAllowed ? { node: X.section("Kursverlauf", null, [X.notice("Kursverlauf nicht freigegeben", VM.reasonText("DISPLAY_NOT_PERMITTED"))], null, null, "kurs", "dx-chapter--chart"), dispose: function () {} }
      : global.VUQuantChart.create({ ticker: ticker, eod: eod, currency: "USD",
      /* Zwei Schreibweisen derselben Aussage: "splitAdjusted" (Golden-Rekonstruktion)
         und "SPLIT_ADJUSTED" (veroeffentlichte Reihe, alle anderen Titel). Nur die
         erste zu pruefen hiess: "nicht splitbereinigt" unter fast jedem Chart. */
      adjusted: !!(s.chart && /^(splitAdjusted|SPLIT_ADJUSTED)$/.test(s.chart.adjustmentStatus || "")), splitEvents: s.chart && s.chart.splitEvents,
      longPath: s.masterMemberId && /^[A-Za-z0-9_-]+$/.test(s.masterMemberId) ? "/quant/data/market/discover-series-long/" + s.masterMemberId + ".json" : null,
      loadJSON: global.QuantShell.loadJSON,
      realtime: function () { return api.getRealtimeCapability(ticker); },
      onPrice: function (p) { if (typeof p.price === "number" && (p.live || !hasDailyPrice)) setQuote(p.price, p.delta, p.when + " · USD"); } });
    disposers.push(chart.dispose);

    /* Aufbau nach Owner-Auftrag "Progressive Disclosure" (07.10.2026):
       Aussage -> Beweis -> Tiefe.
         1 Aktie, Kurs, Chart
         2 Jetzt: Ereignisse und drei Antworten (Setup, Evidenz, Staerke)
         3 Setup   4 Historische Evidenz   5 Faktoren
         6 Mehr: Pro/Contra, Radar und Benachrichtigungen, Bewegung,
           Anlagestil, Kursstruktur, Kennzahlen, News, Daten und Grenzen -
           je einen Tipp tief, nichts entfaellt.
       Ersetzt die Reihenfolge "Quant Daily Usefulness" (01.10.2026). */
    var hasFactors = vm.factorState === "AVAILABLE";
    var o = vm.overall;
    /* Ein Faktor, den heute KEINE Aktie traegt, ist keine Aussage ueber
       diese Aktie: er steht als schmale Zeile am Ende der Liste, nicht als
       grosse leere Karte. Gezaehlt aus der veroeffentlichten Verteilung,
       nicht an einen Namen geschrieben - traegt er eines Tages Werte,
       steht er von allein wieder in der Reihe. */
    var marketEmpty = vm.factors.filter(function (f) { return f.state !== "AVAILABLE" && dist && Array.isArray(dist[f.id]) && dist[f.id].length === 0; });
    var shownFactors = vm.factors.filter(function (f) { return marketEmpty.indexOf(f) < 0; });
    var TABS = [["einordnung-kurz", "Jetzt"], ["setup", "Setup"], ["historie", "Evidenz"], ["einordnung", hasFactors && o.rated > 0 ? "Faktoren" : null], ["mehr", "Mehr"]]
      .filter(function (t) { return t[1]; });
    var tabs = el("nav", { class: "q-tabs qx-toc", "aria-label": "Abschnitte der Analyse" }, TABS.map(function (t, i) {
      return el("a", { href: "#" + t[0], "aria-current": i === 0 ? "true" : "false", dataset: { target: t[0] }, text: t[1] });
    }));
    bodyHost.append(tabs);
    if (global.IntersectionObserver) {
      var spy = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          tabs.querySelectorAll("a").forEach(function (a) { a.setAttribute("aria-current", a.dataset.target === e.target.id ? "true" : "false"); });
        });
      }, { rootMargin: "-30% 0px -60% 0px" });
      disposers.push(function () { spy.disconnect(); });
      setTimeout(function () { TABS.forEach(function (t) { var n = document.getElementById(t[0]); if (n) spy.observe(n); }); }, 0);
    }

    /* 1 + 2: Chart und daneben "Was ist jetzt wichtig?". Radar, Lebenszyklus
       und das technische Szenario kommen nach und fuellen die Antworten. */
    var nowHost = el("div", { class: "q-now", "aria-live": "polite" }, [el("p", { class: "qx-small", text: "Was sich bei dieser Aktie zuletzt verändert hat, wird geladen …" })]);
    var setupAnswerHost = el("div", { class: "q-answer-host" }, [setupAnswer(vm, null)]);
    var evidenceAnswerHost = el("div", { class: "q-answer-host", "aria-live": "polite" }, [evidenceAnswer(null, vm)]);
    var layout = el("div", { class: "qx-stock-layout" });
    layout.append(chart.node);
    layout.append(verdictCard(vm, nowHost, [setupAnswerHost, evidenceAnswerHost,
      factorAnswer(vm, shownFactors, factors && factors.reason, "Quant bildet keine Ersatzwerte.")]));
    bodyHost.append(layout);
    if (global.VUCompanyIntelligenceStock) disposers.push(global.VUCompanyIntelligenceStock.mount(bodyHost, ticker));

    /* 3: Setup. Einstieg, Stop und Ziele aus der technischen Auswertung
       (Owner-Entscheid 30.09.2026), darunter, was zur Bestaetigung fehlt. */
    var lifecycleBox = el("div", { class: "q-lifecycle-host" }, [el("p", { class: "qx-small", text: "Der Verlauf wird geladen …" })]);
    var cardPromise = api.getRadarCard ? api.getRadarCard(ticker).catch(function () { return null; }) : Promise.resolve(null);
    var lcPromise = api.getSetupLifecycle ? api.getSetupLifecycle(ticker).catch(function () { return null; }) : Promise.resolve(null);
    var wsPromise = technical && technical.state === "AVAILABLE" && technical.fullWorkspace && api.getTechnicalWorkspace
      ? api.getTechnicalWorkspace(ticker).catch(function () { return null; }) : Promise.resolve(null);
    var stripPrice = hasDailyPrice ? s.price.value : null;
    var setupCard = el("div", { class: "q-setup-wrap" });
    var live = { ws: null, card: null };
    function paintSetup() {
      renderSetupCard(setupCard, vm, live.ws, technical, ticker, lifecycleBox, stripPrice, live.card);
      setupAnswerHost.replaceChildren(setupAnswer(vm, live.ws));
    }
    paintSetup();
    Promise.all([cardPromise, lcPromise]).then(function (rl) {
      if (!nowHost.isConnected) return;
      var card = rl[0] && rl[0].state === "AVAILABLE" ? rl[0].card : null;
      nowHost.replaceChildren.apply(nowHost, nowContent(ticker, rl[0]));
      evidenceAnswerHost.replaceChildren(evidenceAnswer(card, vm));
      lifecycleBox.replaceChildren(lifecycleView(rl[1]) || el("p", { class: "qx-small", text: "Für diese Aktie ist kein Setup-Verlauf veröffentlicht." }));
      live.card = card; paintSetup();
    });
    wsPromise.then(function (ws) { if (!ws || !setupCard.isConnected) return; live.ws = ws; paintSetup(); });
    var evidenceP = api.getEvidenceStatus ? api.getEvidenceStatus().catch(function () { return null; }) : Promise.resolve(null);
    /* Setup und Evidenz direkt verbunden - aber nie mit Signal-Backtests vermischt. */
    var setupEvidence = el("div", { class: "q-setup-evidence" });
    evidenceP.then(function (ev) {
      var k = ev && ev.state === "AVAILABLE" ? ev.kinds.filter(function (x) { return x.id === "SETUP_BACKTEST" || /Setup/.test(x.label || ""); })[0] : null;
      if (!setupEvidence.isConnected || vm.setup.state === "UNAVAILABLE") return;
      setupEvidence.replaceChildren(el("p", {}, [el("span", { class: "q-ev-tier tier-tested is-off", text: "Historische Evidenz zu Setups" }),
        el("span", { text: k && k.state !== "WITHHELD" ? " Setup-Ergebnisse siehe Backtesting." : " Noch zu wenige Fälle für einen Test." })]),
        k && k.state === "WITHHELD" ? X.more("Warum noch nicht?", function () { return el("p", { class: "qx-small", text: closedKindSentence(k) + " Setup-Ergebnisse werden nicht mit den marktweiten Signal-Backtests vermischt." }); }) : null);
    });
    var duo = el("div", { class: "q-pair" });
    bodyHost.append(duo);
    duo.append(X.section("Wie weit ist die Aktie im Setup?", "Einstieg, Stop und Ziele laut technischem Szenario – keine Empfehlung.",
      [setupCard, setupEvidence], null, "Setup", "setup"));

    /* 4: Was geschah frueher? Diese Aktie (beobachtet), das marktweit
       getestete Signal (mit Base Rate), zertifiziert. */
    var evidence = await evidenceP;
    var signalHost = el("div", { class: "q-ev-signal-host", "aria-live": "polite" }, [el("p", { class: "qx-small", text: "Getestete Signale werden geladen …" })]);
    duo.append(X.section("Was geschah früher in ähnlichen Situationen?", "Diese Aktie selbst und das marktweit getestete Signal – getrennt. Keine Prognose.", replaySection(vm, words, evidence, signalHost), { href: X.routes.method("historie"), label: "Wie das gerechnet wird" }, "Evidenz", "historie"));
    cardPromise.then(function (rc) {
      if (!signalHost.isConnected) return;
      var card = rc && rc.state === "AVAILABLE" ? rc.card : null;
      signalHost.replaceChildren.apply(signalHost, signalEvidenceFor(card));
      /* Ohne ausloesendes Signal spricht die Zertifizierungszeile von der Aktie, nicht von "diesem Signal". */
      var tested = ((card && card.events) || []).some(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; });
      var certHost = signalHost.closest ? signalHost.closest(".qx-replay") : null, certLine = certHost ? certHost.querySelector(".q-ev-cert") : null;
      if (!tested && certLine && global.QXEvidence) certLine.replaceWith(global.QXEvidence.certifiedLine(null, { subject: "diese Aktie" }));
    });

    /* 5: Faktoren - eine Zeile je Eigenschaft, staerkste zuerst; antippen
       fuehrt bis zu den Rohdaten. */
    if (hasFactors && o.rated > 0) {
      bodyHost.append(X.section("Was macht diese Aktie stark oder schwach?", null, [
        el("div", { class: "q-fsum" }, [el("b", { class: "q-fsum-title tone-" + o.tone, text: o.text }), factorCounts(shownFactors),
          el("small", { text: "Wert 0–100 · Stufe nach Position unter allen bewerteten Aktien. Eine Gesamtnote gibt es bewusst nicht – jede Eigenschaft steht für sich." })]),
        /* Immer die Reihenfolge des Kanons (View Model, aus factor-evidence.js):
           jede Aktie liest sich gleich, eine Eigenschaft steht immer am selben Platz. */
        el("div", { class: "dx-zahlen qx-factors q-frows" }, vm.factors.map(function (f) { return factorCard(f, ticker, marketEmpty.indexOf(f) >= 0); })),
        X.more("Wie Wert und Stufe entstehen", function () {
          return foot("Wert 0–100: gewichtetes Mittel der Rangplätze der einzelnen Kennzahlen, 50 ist die Mitte. Die Stufe ist die Position unter allen bewerteten Aktien (stärkste 10 % sehr stark, bis 75 % stark, ab 45 % durchschnittlich, ab 25 % schwach) – eine relative Einordnung, kein absolutes Urteil. „Top 3 %“ heißt: höher als bei 97 % der bewerteten Aktien. Stand " + X.dateDe(vm.asOf && vm.asOf.factors) + (vm.asOf && vm.asOf.fundamentals ? ", Geschäftszahlen bis " + X.dateDe(vm.asOf.fundamentals) : "") + ".");
        })],
        { href: X.routes.method("faktoren"), label: "Wie Faktoren entstehen →" }, "Faktoren", "einordnung"));
    } else if (!hasFactors) {
      bodyHost.append(X.section("Eigenschaften", null, [X.notice("Keine Faktoren", VM.reasonText(factors && factors.reason, "Für diesen Titel ist keine Faktoranalyse veröffentlicht."))], null, "Faktoren", "einordnung"));
    }

    /* 6: Mehr. Jede Tiefe einen Tipp entfernt; der Kopf jeder Zeile sagt,
       was darin steht. Die Abschnitte entstehen sofort (Pruefungen und
       Sprungmarken finden sie), sichtbar werden sie mit dem Aufklappen. */
    function fold(id, iconId, title, hint, node) {
      return el("details", { class: "q-fold", id: "mehr-" + id }, [el("summary", {}, [
        el("span", { class: "q-fold-icon", "aria-hidden": "true" }, [X.icon(iconId)]),
        el("span", { class: "q-fold-title" }, [el("b", { text: title }), hint ? el("small", { text: hint }) : null])]), node]);
    }
    var folds = [];
    if (hasFactors && o.rated >= 3) folds.push(fold("dafuer", "bars", "Pro und Contra", vm.proCon.pro.length + " dafür · " + vm.proCon.con.length + " dagegen", X.section("Was spricht dafür – und was dagegen?", null, balanceSection(vm, marketEmpty), null, "Pro und Contra", "dafuer")));
    /* Radar-Status: Zustand jetzt und davor, seit wann, Ausloeser,
       naechste Bedingung, Evidenzstand - und die Benachrichtigungen. */
    var trackHost = el("div", { class: "q-track-host", "aria-live": "polite" }, [el("p", { class: "qx-small", text: "Radar-Status wird geladen …" })]);
    var alertHost = global.QXEvidence && global.QXEvidence.alertPanel ? global.QXEvidence.alertPanel(ticker) : null;
    folds.push(fold("radar", "network", "Radar und Benachrichtigungen", "Was Quant verfolgt · Alarme", X.section("Radar-Status", "Was Quant für diese Aktie verfolgt – mit Datum und historischem Beleg. Keine Empfehlung.", [trackHost, alertHost].filter(Boolean),
      { href: X.routes.backtest(), label: "Backtesting" }, "Radar", "radar-status")));
    (api.getSignalTracking ? api.getSignalTracking(ticker).catch(function () { return null; }) : Promise.resolve(null)).then(function (tr) {
      if (!trackHost.isConnected) return;
      var kids = global.QXEvidence ? global.QXEvidence.trackingSection(tr, ctx) : null;
      trackHost.replaceChildren.apply(trackHost, kids || [el("p", { class: "qx-small", text: tr && tr.reason === "NOT_IN_SETUP_UNIVERSE" ? "Diese Aktie gehört nicht zum Setup-Universum; der Radar verfolgt sie nicht." : "Für diese Aktie liegt kein Radar-Status vor." })]);
    });
    if (vm.change.state === "AVAILABLE") {
      var moving = vm.change.items.filter(function (i) { return i.tone !== "neutral"; });
      var still = vm.change.items.filter(function (i) { return i.tone === "neutral"; });
      var changeItem = function (i) {
        return el("li", { class: "qx-change tone-" + i.tone }, [el("i", { class: "dx-story-dot", "aria-hidden": "true" }), el("span", { text: i.text }), el("small", { text: i.group + " · " + (i.window || "") + (i.to ? " · " + i.to : "") })]);
      };
      folds.push(fold("veraenderung", "trend", "In Bewegung", moving.length ? moving.length + " deutliche Veränderung" + (moving.length === 1 ? "" : "en") : "keine deutliche Veränderung", X.section("Was verändert sich gerade?", vm.change.text + " Stand " + X.dateDe(vm.change.asOf) + ".", [
        moving.length ? el("ul", { class: "dx-story-list dx-story-list--detail qx-changes" }, moving.map(changeItem)) : el("p", { class: "dx-journey-satz", text: "Keine deutliche Veränderung." }),
        still.length ? X.more("Unverändert (" + still.length + ")", function () { return el("ul", { class: "dx-story-list dx-story-list--detail qx-changes" }, still.map(changeItem)); }) : null,
        vm.change.open.length ? X.more("Nicht messbar (" + vm.change.open.length + ")", function () { return vm.change.open.map(function (x) { return el("p", { class: "qx-small" }, [el("b", { text: x.label + ": " }), el("span", { text: x.text })]); }); }) : null,
        X.more("Wie die Veränderung gemessen wird", function () { return vm.change.items.map(function (i) { return el("p", { class: "qx-small" }, [el("b", { text: i.label + ": " }), el("span", { text: (i.how || "") + (i.from && i.to ? " (" + i.from + " → " + i.to + ")" : "") })]); }); })
      ], null, "In Bewegung", "veraenderung")));
    }
    folds.push(fold("strategie", "strategien", "Anlagestil", vm.strategy.state === "AVAILABLE" && vm.strategy.best ? vm.strategy.best.label : "Welcher Stil passt?", X.section("Welche Strategie passt?", "Geprüft wird, welche Bedingungen eines Anlagestils die Aktie heute erfüllt.", strategySection(vm, assignment), { href: X.routes.strategies(), label: "Alle Strategien →" }, "Anlagestil", "strategie")));
    /* Absagen stehen EINMAL, gesammelt unter "Daten und Grenzen" - nicht als
       Stapel von Hinweisen quer ueber die Seite. */
    if (technical && technical.state === "AVAILABLE") folds.push(fold("technik", "trend", "Kursstruktur", "Trend, Dynamik, Schwankung", X.section("Kursstruktur", "Trend, Dynamik und Schwankung aus der technischen Analyse.", technicalSection(technical, ticker), null, "Technik und Elliott-Wellen", "technik")));
    var figures = s.quant && s.quant.state === "AVAILABLE" ? figuresSection(s, ticker) : null;
    if (figures && !(figures.length === 1 && figures[0].classList && figures[0].classList.contains("qx-notice"))) folds.push(fold("zahlen", "data", "Kennzahlen", "Marge, Wachstum, Bewertung", X.section("Kennzahlen", null, figures, null, "Unternehmenszahlen", "zahlen")));
    /* News: Quant hat keine eigene Nachrichtenquelle. Die Zeile bleibt und
       sagt das (Owner-Entscheid: ehrlich befuellt). */
    folds.push(fold("news", "news", "News", "noch nicht angebunden", el("section", { class: "qx-section q-news", id: "news" }, [
      el("div", { class: "q-sec-head" }, [el("h2", { text: "News" })]),
      el("div", { class: "q-tile is-off" }, [el("span", { class: "q-icon", "aria-hidden": "true" }, [X.icon("news")]),
        el("span", {}, [el("strong", { text: "Noch nicht verfügbar" }), el("small", { text: "Nachrichten sind in Quant noch nicht angebunden – Quant wertet Kurse und SEC-Meldungen aus, keine Schlagzeilen. Aktuelle Nachrichten findest du im News-Bereich von Vision Universe." })])]),
      X.actions([X.btn("Zu Vision Universe News", "/news/", "secondary")])])));

    /* Daten & Grenzen. Was fehlt, bildet der Vertrag (quant/engines/journey-shape.js) -
       dieselbe Regel wie die Messung, keine zweite Fassung in der Seite. */
    var Shape = global.VUJourneyShape;
    var shape = Shape ? Shape.assess(Shape.stationsFrom({ stock: s, factors: factors, setup: setup, patterns: patterns, technical: technical })) : { groups: [] };
    var gapNodes = (shape.groups || []).map(function (g) {
      return el("li", { class: "nein qx-open", dataset: { cause: g.causeId || "" } }, [el("b", { text: g.headline }), el("span", { text: " – " + g.explanation + (g.outlook ? " " + g.outlook : "") + (g.areas && g.areas.length ? " Betrifft: " + g.areas.join(" · ") + "." : "") })]);
    });
    /* Die konkreten Gruende mit Zahl, dort wo ein Leser nach ihnen sucht. */
    if (technical && technical.state !== "AVAILABLE") { var tr = VM.technicalReasonText(technical.unavailability); if (tr) gapNodes.push(el("li", { class: "nein" }, [el("b", { text: "Kursstruktur" }), el("span", { text: " – " + tr })])); }
    if (patterns && patterns.state !== "AVAILABLE") { var pr = VM.patternReasonText(patterns.unavailability); if (pr) gapNodes.push(el("li", { class: "nein" }, [el("b", { text: "Marktmuster" }), el("span", { text: " – " + pr })])); }
    marketEmpty.forEach(function (f) { gapNodes.push(el("li", { class: "nein" }, [el("b", { text: f.name }), el("span", { text: " – für keine Aktie messbar. " + (f.missingText || "") })])); });
    if (entry.v === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") gapNodes.push(el("li", { class: "nein" }, [el("b", { text: "Börsenwert" }), el("span", { text: " – " + VM.reasonText("SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") + (entry.il > 1 ? " Das Unternehmen hat " + entry.il + " börsennotierte Aktiengattungen." : "") })]));
    var limits = X.section("Daten und Grenzen", "Was Quant für diese Aktie weiß – und was nicht.", [
      el("dl", { class: "qx-kv" }, [
        el("dt", { text: "Kurs" }), el("dd", { text: last ? "Tiingo, Tagesschluss bis " + X.dateDe(last[0]) : "keine veröffentlichte Tagesreihe" }),
        el("dt", { text: "Geschäftszahlen" }), el("dd", { text: vm.asOf && vm.asOf.fundamentals ? "SEC EDGAR, bis " + X.dateDe(vm.asOf.fundamentals) : "keine" }),
        el("dt", { text: "Faktoren" }), el("dd", { text: vm.asOf ? "Stand " + X.dateDe(vm.asOf.factors) : "keine" }),
        el("dt", { text: "Setup" }), el("dd", { text: vm.setup.asOf ? "Stand " + X.dateDe(vm.setup.asOf) : "keins" })
      ]),
      gapNodes.length ? el("div", { dataset: { journeyShape: shape.shape || "" } }, [el("h3", { class: "qx-sub", text: "Was fehlt – und warum" }), el("ul", { class: "dx-kann" }, gapNodes)]) : null,
      foot(vm.isNot),
      X.actions([X.btn("Methodik", X.routes.method(), "secondary"), X.btn("SEC-Daten prüfen", "/quant/data-inspector/", "secondary")])
    ], null, "Transparenz", "grenzen");
    /* Fehlt einer Aktie Wesentliches (Journey-Form nicht FULL), SIND die
       Grenzen die Aussage: dann steht das Kapitel offen vor "Mehr" und
       nicht eingeklappt darin. */
    var thin = !hasFactors || (shape.shape && shape.shape !== "FULL");
    if (!thin) folds.push(fold("grenzen", "shield", "Daten und Grenzen", gapNodes.length ? gapNodes.length + " Lücke" + (gapNodes.length === 1 ? "" : "n") + " benannt · Quellen und Stichtage" : "Quellen und Stichtage", limits));
    else bodyHost.append(limits);
    var links = [technical && technical.state === "AVAILABLE" ? [X.routes.technical(ticker), "trend", "Technische Analyse", "Chart mit Marken und Elliott-Wellen"] : null,
      s.quant && s.quant.state === "AVAILABLE" ? [X.routes.fundamentals(ticker), "data", "Finanzdaten", "Unternehmenszahlen über die Jahre"] : null,
      [X.routes.compare([ticker]), "bars", "Vergleichen", "Mit anderen Aktien nebeneinander"],
      ["/discover/#/s/US_REAL/" + encodeURIComponent(ticker), "aktien", "In Discover ansehen", "Unternehmen, Kurs und Einordnung"]].filter(Boolean);
    bodyHost.append(X.section("Mehr zu dieser Aktie", null, [
      el("nav", { class: "q-more-links", "aria-label": "Weitere Ansichten dieser Aktie" }, links.map(function (l) {
        return el("a", { href: l[0] }, [el("span", { class: "q-fold-icon", "aria-hidden": "true" }, [X.icon(l[1])]), el("span", { class: "q-fold-title" }, [el("b", { text: l[2] }), el("small", { text: l[3] })]), el("span", { class: "q-answer-go", "aria-hidden": "true", text: "›" })]);
      })),
      el("div", { class: "q-folds" }, folds)], null, "Mehr", "mehr"));
    Object.keys(CHAPTER_CLASS).forEach(function (id) { var n = bodyHost.querySelector("#" + id); if (n) CHAPTER_CLASS[id].split(" ").forEach(function (c) { n.classList.add(c); }); });
    /* Urheber und Lizenz des Logos stehen am Ende der Seite. Das Verzeichnis
       dahinter ist 1,7 MB gross - es wird erst geladen, wenn der Fuss in
       Sichtweite kommt, nicht mit dem ersten Bild. */
    var L = global.VUDiscover && global.VUDiscover.Logos;
    if (L && L.creditLine) {
      var creditHost = el("section", { class: "dx-foot qx-logo-credit" });
      bodyHost.append(creditHost);
      var showCredit = function () { if (!creditHost.childNodes.length) creditHost.append(L.creditLine(ticker)); };
      if (global.IntersectionObserver) {
        var io = new global.IntersectionObserver(function (entries) { if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); showCredit(); } }, { rootMargin: "400px 0px" });
        io.observe(creditHost); disposers.push(function () { io.disconnect(); });
      } else showCredit();
    }

    return function () { disposers.forEach(function (d) { try { d(); } catch (e) { /* bereits beendet */ } }); };
  }

  global.QXStock = { render: render, factorCard: factorCard, strategyArt: strategyArt };
})(window);
