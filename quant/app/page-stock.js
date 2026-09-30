/* =========================================================================
   VISION UNIVERSE QUANT — app/page-stock.js              Die Aktienanalyse

   Die Seite beantwortet in dieser Reihenfolge:

     1  Wie steht die Aktie da?         Kurs, ein Chart, Quant-Einordnung
     2  Warum?                           Spricht dafür / dagegen / offen
     3  Woran gemessen?                  Sieben Eigenschaften -> Komponenten
                                         -> Rohwerte -> Methodik
     4  Was verändert sich?              Change Engine
     5  Gibt es ein Setup?               Wo / Warum / Was als Nächstes / Ungültig
     6  Welcher Anlagestil passt?        Erfüllt / Offen / Nicht erfüllt
     7  Was geschah früher?              Historical Replay, drei Ebenen
     8  Kursstruktur                     Technik und Elliott
     9  Unternehmenszahlen               Geschäft, Bewertung, Risiko
    10  Daten und Grenzen                Stichtage, Quellen, was fehlt

   Jede Aussage kommt aus dem View Model (app/view-model.js), das nur
   veroeffentlichte Vertraege liest. Wo Daten fehlen, steht warum - mit
   Zahl, wo es eine gibt.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;

  var CHANGE_MARK = { good: "↑", bad: "↓", neutral: "→" };

  function factorCard(f, ticker) {
    var d = el("details", { class: "qx-factor tone-" + f.tone, id: "faktor-" + f.id, dataset: { factor: f.id } });
    var summary = el("summary", {}, [
      el("span", { class: "qx-factor-name", text: f.name }),
      X.pill(f.label, f.tone),
      el("span", { class: "qx-factor-q", text: f.state === "AVAILABLE" ? f.why : f.missingText })
    ]);
    if (f.state === "AVAILABLE") {
      summary.append(el("div", { class: "qx-meter", role: "img", "aria-label": f.name + ": Wert " + Math.round(f.score) + " von 100" }, [el("i", { style: "width:" + Math.max(2, Math.min(100, f.score)) + "%" })]));
    }
    d.append(summary);
    var body = el("div", { class: "qx-factor-body" });
    d.append(body);
    var built = false;
    d.addEventListener("toggle", function () {
      if (!d.open || built) return; built = true;
      body.append(el("p", { class: "qx-factor-why" }, [el("strong", { text: f.question + " " }), document.createTextNode(f.measures + (f.notMeasures ? " " + f.notMeasures : ""))]));
      if (f.state === "AVAILABLE") {
        var facts = el("dl", { class: "qx-kv" }, [
          el("dt", { text: "Einordnung" }), el("dd", { text: f.label }),
          f.rankText ? el("dt", { text: "Position im Markt" }) : null, f.rankText ? el("dd", { text: f.rankText.replace(/\.$/, "") }) : null,
          el("dt", { text: "Datenabdeckung" }), el("dd", { text: f.coverageText || "–" }),
          f.confidence ? el("dt", { text: "Belastbarkeit" }) : null, f.confidence ? el("dd", { text: f.confidence }) : null
        ]);
        body.append(facts);
      }
      if (f.components.length) {
        body.append(el("h4", { class: "qx-h3", style: "font-size:15px;margin-top:14px", text: "Woraus der Wert besteht" }));
        f.components.forEach(function (c) {
          var row = el("div", { class: "qx-comp" + (c.state !== "AVAILABLE" ? " is-missing" : ""), dataset: { component: c.id } }, [
            el("span", { text: c.label }),
            el("b", { class: "num", text: c.state === "AVAILABLE" ? (c.value || "–") : "fehlt" })
          ]);
          if (c.state === "AVAILABLE") {
            row.append(el("div", { class: "qx-comp-bar", "aria-hidden": "true" }, [el("i", { style: "left:" + Math.max(0, Math.min(100, c.score)) + "%" })]));
            row.append(el("small", { text: "Punkte " + c.scoreText + " · Gewicht " + (c.weightText || "–") + " · " + (c.direction || "") +
              (c.peer ? " · " + c.peer.level + (c.peer.size ? " (" + c.peer.size + " Unternehmen)" : "") : "") + (c.window ? " · Zeitraum: " + c.window : "") }));
          } else {
            row.append(el("small", { text: c.missing + " Gewicht " + (c.weightText || "–") + " – der Faktor wird aus den übrigen Kennzahlen gebildet." }));
          }
          body.append(row);
        });
      }
      body.append(X.more("Rohdaten und Berechnung", function () {
        var kids = [el("p", { class: "qx-small", text: f.reference }),
          el("p", { class: "qx-small", text: "Jede Kennzahl wird im Vergleich eingeordnet (Rangplatz 0–100, extreme Werte an den Rändern gekappt), der Faktorwert ist das gewichtete Mittel der vorhandenen Kennzahlen. Fehlende Kennzahlen werden nicht ersetzt; ihr Gewicht fällt heraus." })];
        f.components.forEach(function (c) {
          kids.push(el("div", { class: "qx-code", text: c.label + "\n  Formel: " + (c.input || "–") + "\n  Rohwert: " + (c.value || "–") +
            "\n  Punkte: " + (c.score === null ? "–" : c.score) + (c.peer ? " (Vergleichsgruppe " + c.peer.percentile + ", Gesamtmarkt " + c.universePercentile + ")" : "") +
            "\n  Gewicht: " + (c.weightText || "–") + (c.note ? "\n  Hinweis: " + c.note : "") + (c.reason ? "\n  Status: fehlt" : "") }));
        });
        kids.push(X.link("Methodik dieses Faktors", X.routes.method("faktoren") + "?faktor=" + f.id, "qx-btn ghost"));
        return kids;
      }));
      /* NVDA-Audit: ein Nutzer, der "schwach" liest, soll hier lesen, was
         der Faktor NICHT misst - dort, wo die Frage entsteht. */
      if (f.id === "quality" && f.state === "AVAILABLE" && f.tone === "bad") {
        body.append(el("p", { class: "qx-small", text: "Wichtig: Dieser Faktor bewertet Bilanz und die Deckung der Gewinne durch Zahlungsfluss – nicht, wie profitabel oder erfolgreich das Geschäft ist. Ein Unternehmen kann hier schwach und in der Profitabilität sehr stark sein." }));
      }
    });
    return d;
  }

  function conditions(list, emptyText) {
    if (!list || !list.length) return el("p", { class: "qx-small", text: emptyText });
    return el("ul", { class: "qx-conds" }, list.map(function (c) {
      var tone = c.state === "MET" ? "good" : c.state === "NOT_MET" ? "bad" : "unknown";
      return el("li", { class: "tone-" + tone }, [
        el("span", { "aria-hidden": "true", text: c.state === "MET" ? "✓" : c.state === "NOT_MET" ? "✗" : "–" }),
        el("div", {}, [el("span", { text: c.label + (c.state === "OPEN" ? " – nicht messbar" : "") }),
          el("small", { text: ([c.demand, c.value || c.value2].filter(function (x) { return x && typeof x === "string"; }).join(" · ") || c.text || "") + (c.state === "OPEN" ? " · zählt weder als erfüllt noch als verletzt" : "") })])
      ]);
    }));
  }

  function verdictCard(vm) {
    var o = vm.overall, pc = vm.proCon;
    /* Zu wenig Messbares fuer ein Bild: keine leeren Spalten, sondern die
       Gruende - einmal je Grund, mit Zahl, wo es eine gibt. */
    if (o.rated < 3) {
      return X.card([el("div", { class: "qx-verdict" }, [
        el("div", { class: "qx-verdict-top tone-unknown" }, [el("span", { class: "qx-eyebrow", text: "Quant-Einordnung" }), el("h2", { text: o.text }),
          el("p", { class: "qx-small", style: "margin:0", text: o.sub + " Quant bildet keine Ersatzwerte." })]),
        pc.pro.length || pc.con.length || pc.middle.length ? el("p", { class: "qx-small", style: "margin:0" }, [el("b", { text: "Gemessen: " }),
          document.createTextNode(pc.pro.concat(pc.middle, pc.con).map(function (i) { return i.title + " (" + Math.round(i.score) + ")"; }).join(" · "))]) : null,
        el("div", { class: "qx-open" }, [el("strong", { text: "Warum noch keine Einordnung" })].concat(vm.gaps.map(function (g) {
          return el("p", { style: "margin:6px 0 0" }, [el("b", { text: g.names.join(", ") + ": " }), document.createTextNode(g.text)]);
        })))
      ])], "qx-verdict-card");
    }
    var top = el("div", { class: "qx-verdict-top tone-" + o.tone }, [
      el("span", { class: "qx-eyebrow", text: "Quant-Einordnung" }),
      el("h2", { text: o.text }),
      el("p", { class: "qx-small", style: "margin:0", text: o.sub + " Eine Gesamtnote gibt es bewusst nicht: Sie würde den Zielkonflikt verbergen, auf den es ankommt – etwa hohe Qualität bei anspruchsvoller Bewertung." })
    ]);
    function col(title, tone, items, empty) {
      return el("div", { class: "qx-pc-col tone-" + tone }, [el("h3", { text: title }),
        items.length ? el("ul", {}, items.map(function (i) {
          return el("li", {}, [el("a", { href: "#faktor-" + i.factorId, style: "text-decoration:none" }, [el("strong", { text: i.title + " (" + Math.round(i.score) + ")" })]),
            el("span", { text: i.text }), i.caveat ? el("em", { text: i.caveat }) : null]);
        })) : el("p", { class: "qx-pc-empty", text: empty })]);
    }
    var kids = [top, el("div", { class: "qx-pc" }, [
      col("Spricht dafür", "good", pc.pro, "Keine der gemessenen Eigenschaften ist stark."),
      col("Spricht dagegen", "bad", pc.con, "Keine der gemessenen Eigenschaften ist schwach.")
    ])];
    if (pc.middle.length) kids.push(el("p", { class: "qx-small", style: "margin:0", text: "Im Mittelfeld: " + pc.middle.map(function (m) { return m.title.replace(": durchschnittlich", "") + " (" + Math.round(m.score) + ")"; }).join(", ") + "." }));
    if (pc.open.length) kids.push(el("div", { class: "qx-open" }, [el("strong", { text: "Noch nicht bewertbar" })].concat(pc.open.map(function (i) {
      return el("p", { style: "margin:2px 0" }, [el("b", { text: i.title + ": " }), document.createTextNode(i.text)]);
    }))));
    if (vm.change && vm.change.headline && vm.change.headline.length) {
      kids.push(el("p", { class: "qx-small", style: "margin:0" }, [el("b", { text: "Was sich gerade verändert: " }), document.createTextNode(vm.change.headline.join(" · ") + ".")]));
    }
    kids.push(el("p", { class: "qx-small", style: "margin:0", text: "Einordnung im Vergleich zu allen anderen Aktien – keine Empfehlung." }));
    return X.card([el("div", { class: "qx-verdict" }, kids)], "qx-verdict-card");
  }

  function setupSection(vm, ticker) {
    var s = vm.setup;
    if (s.state === "UNAVAILABLE") return [X.notice("Keine Setup-Beobachtung", s.text)];
    var ladder = el("ol", { class: "qx-ladder", "aria-label": "Stufen eines Setups" }, s.stages.map(function (st, i) {
      return el("li", { class: i === s.stageIndex ? "is-now" : i < s.stageIndex ? "is-past" : null, "aria-current": i === s.stageIndex ? "step" : null, text: st.label });
    }));
    var qa = el("dl", { class: "qx-qa" }, [
      el("div", {}, [el("dt", { text: "Wo steht die Aktie?" }), el("dd", { text: s.label + (s.stageIndex < 0 ? "" : " – " + (s.stages[s.stageIndex] || {}).short) + "." })]),
      s.why ? el("div", {}, [el("dt", { text: "Warum?" }), el("dd", { text: s.why })]) : null,
      s.next ? el("div", {}, [el("dt", { text: "Was müsste als Nächstes passieren?" }), el("dd", {}, [document.createTextNode(s.next.text), conditions(s.next.conditions, "")])]) : null,
      s.invalidation ? el("div", {}, [el("dt", { text: "Was würde das Setup ungültig machen?" }), el("dd", {}, [
        document.createTextNode(s.invalidation.text + (s.invalidation.price ? " Die beschriebene Invalidierungsmarke liegt bei " + X.money(s.invalidation.price) + "." : "")),
        conditions(s.invalidation.conditions, "")])]) : null
    ]);
    var kids = [el("div", { class: "qx-card" }, [
      el("div", { style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap" }, [X.pill(s.label, s.state === "CONFIRMED" ? "good" : s.state === "NO_SETUP" ? "unknown" : "neutral"),
        el("span", { class: "qx-small", text: "Datenstand des Laufs " + X.dateDe(s.asOf) + " – das ist der Stand der technischen Auswertung, nicht dem täglichen Kursstand gleichzusetzen" + (s.previous && s.previous.label && s.previous.asOf && s.asOf && s.previous.asOf < s.asOf ? " · vorher: " + s.previous.label + " (" + X.dateDe(s.previous.asOf) + ")" : "") + "." })]),
      ladder, qa,
      el("p", { class: "qx-small", text: "Ein Setup beschreibt, was am Stichtag im Kursbild beobachtbar ist – kein Kursziel, keine Einstiegsregel und keine Aussage darüber, ob es eintritt." }),
      X.more("Alle geprüften Bedingungen", function () { return [conditions(s.conditions, "Keine Bedingungen veröffentlicht."), X.link("Wie Setups entstehen", X.routes.method("setups"), "qx-btn ghost")]; })
    ])];
    return kids;
  }

  function strategySection(vm, change) {
    var s = vm.strategy;
    var changeText = VM.assignmentChangeText(change);
    if (s.state !== "AVAILABLE") return [X.notice("Kein Anlagestil prüfbar", s.text), changeText ? el("p", { class: "qx-small", text: changeText }) : null];
    var b = s.best;
    return [el("div", { class: "qx-card" }, [
      el("h3", { class: "qx-h3", text: s.sentence }),
      el("p", { class: "qx-small", style: "margin-top:0", text: b.label + ": " + b.countText + "." + (s.fits ? "" : " Das beschreibt die Nähe zu einem Bedingungssatz und keine Prognose.") }),
      el("p", { class: "qx-muted", style: "margin-top:0", text: b.plain }),
      changeText ? el("p", { class: "qx-small", text: changeText }) : null,
      el("div", { class: "qx-grid qx-grid-3", style: "margin-top:12px" }, [
        el("div", { class: "qx-pc-col tone-good" }, [el("h3", { text: "Erfüllt" }), conditions(b.met, "Keine Bedingung erfüllt.")]),
        el("div", { class: "qx-pc-col tone-unknown" }, [el("h3", { text: "Offen" }), conditions(b.open, "Alle Bedingungen sind messbar.")]),
        el("div", { class: "qx-pc-col tone-bad" }, [el("h3", { text: "Nicht erfüllt" }), conditions(b.notMet, "Keine Bedingung verletzt.")])
      ]),
      b.risk ? el("p", { class: "qx-small", text: "Typisches Risiko dieses Stils: " + b.risk }) : null,
      el("div", { class: "qx-actions" }, [X.btn("Strategie „" + b.label.split(" · ")[0] + "“ ansehen", X.routes.strategy(b.id), "secondary")]),
      X.more("Weitere Anlagestile im Vergleich", function () {
        return [el("div", { class: "qx-list" }, s.others.map(function (o) {
          var met = o.conditions.filter(function (c) { return c.state === "MET"; }).length;
          return el("a", { class: "qx-row", href: X.routes.strategy(o.id) }, [
            el("div", { class: "qx-row-main" }, [el("div", { class: "qx-row-title" }, [el("strong", { text: o.label })]),
              el("div", { class: "qx-row-why", text: o.countText })]),
            el("div", { class: "qx-row-side", text: (o.bandLabel || "") })]);
        })), el("p", { class: "qx-small", text: "Gezählt werden erfüllte Bedingungen – keine Trefferquote und keine historische Erfolgsaussage." })];
      })
    ])];
  }

  function replaySection(vm, conditionWords) {
    var r = vm.replay, kids = [];
    r.levels.forEach(function (lv) {
      var c = [el("h3", { class: "qx-h3", text: lv.title })];
      if (lv.id === "SAME_STOCK") {
        if (lv.conditions && lv.conditions.length) {
          c.push(el("p", { class: "qx-small", text: "Heutige Lage: " + lv.conditions.map(function (id) { return conditionWords[id] || id.replace(/-/g, " "); }).join(" · ") + "." }));
        }
        c.push(el("p", { text: lv.text }));
        if (lv.state === "AVAILABLE") {
          c.push(el("div", { class: "qx-horizons" }, lv.horizons.map(function (h) {
            return el("div", { class: "qx-horizon" }, [el("span", { text: "nach " + h.label }),
              el("b", { class: "num " + (h.medianRaw > 0 ? "tone-good" : h.medianRaw < 0 ? "tone-bad" : ""), style: "color:var(--tone,inherit)", text: h.median || "–" }),
              el("small", { text: h.sufficient ? "Median · " + (h.positiveText || "") + (h.drawdown ? " · typischer Rückgang " + h.drawdown : "") : "zu wenige abgeschlossene Fälle" })]);
          })));
        }
        var lastCase = (lv.horizons || []).map(function (h) { return h.lastCase; }).filter(Boolean).sort().pop();
        if (lv.state === "AVAILABLE" && lastCase) c.push(el("p", { class: "qx-small", text: "Letzter abgeschlossener Vergleichsfall: " + X.dateDe(lastCase) + ". Gezeigt werden immer alle Fälle zusammen, nie ein einzelner herausgegriffener." }));
        if (lv.limits && lv.limits.length) c.push(X.more("Grenzen dieses Vergleichs", function () { return el("ul", { class: "qx-small" }, lv.limits.map(function (l) { return el("li", { text: l }); })); }));
      } else if (lv.state === "AVAILABLE") {
        c.push(el("p", { text: lv.text }));
        var up = lv.upside, down = lv.downside;
        function bar(label, value, base, tone) {
          var w = Math.max(2, Math.min(100, (value || 0) * 250));
          return el("div", { class: "qx-bar2 tone-" + tone }, [el("span", { text: label }), el("div", {}, [el("i", { style: "width:" + w + "%" })]), el("b", { class: "num", text: VM.pct(value, 1) })]);
        }
        if (up && down) {
          c.push(el("div", { class: "qx-bars2", role: "img", "aria-label": up.sentence + " " + down.sentence }, [
            bar("Starker Gewinn", up.conditional, up.base, "good"), bar("… im Markt", up.base, null, "unknown"),
            bar("Deutlicher Verlust", down.conditional, down.base, "bad"), bar("… im Markt", down.base, null, "unknown")]));
          c.push(el("p", { class: "qx-small", text: up.sentence + " " + down.sentence + " Zeitraum: " + lv.horizonMonths + " Monate." }));
        }
        c.push(el("p", { class: "qx-small", text: [lv.sample, lv.robust, lv.coverageText].filter(Boolean).join(" ") }));
      } else c.push(el("p", { class: "qx-muted", text: lv.text }));
      kids.push(el("div", { class: "qx-card" }, c));
    });
    kids.push(el("p", { class: "qx-small", text: r.isNot + " Die Fälle überlappen sich zeitlich und sind nicht unabhängig; Dividenden sind nicht enthalten." }));
    kids.push(X.link("Wie Historical Replay rechnet", X.routes.method("historie"), "qx-btn ghost"));
    return [el("div", { class: "qx-replay" }, kids)];
  }

  function technicalSection(t, ticker) {
    if (!t || t.state !== "AVAILABLE") {
      var why = t && VM.technicalReasonText(t.unavailability);
      return [X.notice("Keine Kursstruktur-Auswertung", why || "Für diesen Titel ist keine technische Auswertung veröffentlicht.")];
    }
    var lag = VM.analysisLagText(t.lag);
    return [el("div", { class: "qx-card" }, [
      el("div", { class: "qx-stats" }, [["Trend", t.trend], ["Kursdynamik", t.momentum], ["Schwankung", t.volatility]].concat(t.elliott ? [["Elliott-Wellen", t.elliott]] : []).map(function (p) {
        return el("div", { class: "qx-stat" }, [el("span", { text: p[0] }), el("b", { text: (p[1] && p[1].label) || "–" })]);
      })),
      el("p", { class: "qx-small", text: "Analyse bis " + X.dateDe(t.asOf) + ". " + (lag || "") + (t.elliott ? " Elliott-Szenarien sind Lesarten des Kursverlaufs, keine Wahrscheinlichkeiten." : "") }),
      t.fullWorkspace ? el("div", { class: "qx-actions" }, [X.btn("Technische Analyse & Elliott öffnen", X.routes.technical(ticker), "secondary")])
        : el("p", { class: "qx-small", text: (VM.technicalReasonText(t.unavailability) || "Eine vollständige technische Auswertung ist für diesen Titel noch nicht veröffentlicht.") })
    ])];
  }

  function figuresSection(s, ticker) {
    if (!s.quant || s.quant.state !== "AVAILABLE") return [X.notice("Keine Unternehmenszahlen", "Für diesen Titel liegen keine auswertbaren Geschäftszahlen aus SEC-Meldungen vor.")];
    var wanted = { quality: ["operatingMargin", "fcfMargin", "netMargin"], growth: ["revenueGrowth", "epsGrowth"], value: ["priceEarnings", "priceSales", "earningsYield", "priceToFcf", "fcfYield"], risk: ["volatility", "maxDrawdown"] };
    var stats = [], withheld = {};
    s.quant.families.forEach(function (fam) {
      (fam.metrics || []).forEach(function (m) {
        if (!wanted[fam.id] || wanted[fam.id].indexOf(m.metricId) < 0) return;
        /* Bewusst zurueckgehalten ist nicht dasselbe wie fehlend: der Wert
           steht als "bewusst nicht genannt" da, der Grund darunter. */
        if (m.reason === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING" || m.reason === "DISPLAY_NOT_PERMITTED") {
          withheld[m.reason] = true;
          stats.push(el("div", { class: "qx-stat" }, [el("span", { text: m.label }), el("b", { text: "Bewusst nicht genannt" })]));
          return;
        }
        if (m.state !== "AVAILABLE" || typeof m.value !== "number") return;
        var v = m.value.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + (m.unit === "pct" ? " %" : m.unit === "x" ? " ×" : m.metricId === "marginExpansion" ? " Pp." : "");
        stats.push(el("div", { class: "qx-stat", title: m.description || "" }, [el("span", { text: m.label }), el("b", { class: "num", text: v })]));
      });
    });
    if (!stats.length) return [X.notice("Keine Unternehmenszahlen", "Die Geschäftszahlen dieses Titels erfüllen die Anforderungen der Methodik nicht.")];
    return [el("div", { class: "qx-stats" }, stats.slice(0, 10)),
      Object.keys(withheld).length ? el("p", { class: "qx-small", text: Object.keys(withheld).map(function (r) { return VM.reasonText(r); }).join(" ") }) : null,
      el("p", { class: "qx-small", text: [s.quant.fundamentalsAsOf ? "Geschäftszahlen bis " + X.dateDe(s.quant.fundamentalsAsOf) + (s.quant.availableAt ? " (bekannt seit " + X.dateDe(s.quant.availableAt) + ")" : "") + ", Quelle SEC EDGAR." : "Quelle der Geschäftszahlen: SEC EDGAR.", s.quant.asOf ? "Marktbezogene Kennzahlen bis " + X.dateDe(s.quant.asOf) + "." : null, "Bewertungen sind kein Urteil über einen fairen Preis."].filter(Boolean).join(" ") }),
      el("div", { class: "qx-actions" }, [X.btn("Entwicklung über die Jahre", X.routes.fundamentals(ticker), "secondary")])];
  }

  /**
   * @param {HTMLElement} main
   * @param {string} ticker
   * @param {object} ctx {api, distribution(): Promise, patternWords(): Promise}
   * @returns {function} dispose
   */
  async function render(main, ticker, ctx) {
    var api = ctx.api, disposers = [];
    main.append(el("a", { class: "qx-back", href: X.routes.stocks(), text: "← Aktien" }));
    var heroHost = el("div"), bodyHost = el("div", {}, [X.loading("Analyse wird geladen …")]);
    main.append(heroHost, bodyHost);

    var brief = await api.getIntelligenceBrief(ticker).catch(function () { return null; });
    var src = (brief && brief.sources) || {};
    var s = src.stock || await api.getStockIntelligence(ticker).catch(function () { return null; });
    if (!s) { X.recent.add(ticker); bodyHost.replaceChildren(X.notice("Daten derzeit nicht verfügbar", "Die Daten dieses Titels konnten gerade nicht geladen werden. Bitte versuche es später erneut.")); return function () {}; }
    if (s.identityState === "UNAVAILABLE" || (s.state !== "AVAILABLE" && s.reason === "INVALID_IDENTITY")) {
      heroHost.append(el("h1", { class: "qx-h1", text: "Aktie nicht gefunden" }));
      bodyHost.replaceChildren(X.notice("„" + ticker + "“ ist nicht im Analyseuniversum", "Quant analysiert US-Aktien mit belegten Kurs- und SEC-Daten. Fonds und ETFs wie SPY oder QQQ gehören nicht dazu – ihre Kurse findest du in Discover. Prüfe sonst das Kürzel oder suche nach dem Namen."),
        el("div", { class: "qx-actions" }, [X.btn("Aktie suchen", X.routes.stocks())]));
      return function () {};
    }
    X.recent.add(ticker);
    document.title = (s.name && s.name !== ticker ? s.name + " (" + ticker + ")" : ticker) + " – Quant-Analyse · Vision Universe®";

    /* ---------------------------------------------------------- Hero */
    var watchBtn = el("button", { type: "button", class: "qx-watch", "aria-pressed": X.watch.has(ticker) ? "true" : "false",
      text: X.watch.has(ticker) ? "♥ Gemerkt" : "♡ Merken" });
    watchBtn.addEventListener("click", function () { var on = X.watch.toggle(ticker); watchBtn.setAttribute("aria-pressed", on ? "true" : "false"); watchBtn.textContent = on ? "♥ Gemerkt" : "♡ Merken"; });
    var eodBars = s.chart && s.chart.state === "AVAILABLE" ? (s.chart.bars || []) : [];
    var eod = eodBars.map(function (b) { return [b.date, b.close]; });
    var last = eod.length ? eod[eod.length - 1] : null, prev = eod.length > 1 ? eod[eod.length - 2] : null;
    var quote = el("div", { class: "qx-quote", "aria-live": "polite" });
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
      quote.replaceChildren(el("b", { style: "font-size:24px", text: priceAllowed ? "Kein Kurs veröffentlicht" : "Kurs nicht freigegeben" }), el("small", { text: priceAllowed ? "Für diesen Titel liegt kein veröffentlichter Kurs vor." : VM.reasonText("DISPLAY_NOT_PERMITTED") }));
    }
    await ctx.loadNames().catch(function () { return null; });
    var entry = ctx.entries[ticker] || {};
    var kind = s.securityType || entry.t || null;
    var KIND = { ETF: "ETF", PREFERRED: "Vorzugsaktie", ADR: "ADR (Hinterlegungsschein)" };
    var idLine = el("div", { class: "qx-stock-id" }, [el("b", { text: ticker }), s.industry ? el("span", { text: "· " + s.industry }) : null,
      kind && kind !== "COMMON_STOCK" ? el("span", { class: "qx-tag", text: KIND[kind] || "keine Stammaktie" }) : null,
      entry.il > 1 ? el("span", { class: "qx-tag", text: "eine von " + entry.il + " Aktiengattungen" }) : null]);
    heroHost.append(el("header", { class: "qx-stock-hero" }, [
      el("div", { class: "qx-stock-top" }, [el("h1", { text: X.companyName(s) === "Firmenname nicht veröffentlicht" ? "Aktienanalyse" : s.name }), watchBtn]),
      X.companyName(s) === "Firmenname nicht veröffentlicht" ? el("p", { class: "qx-small", style: "margin:0", text: "Firmenname nicht veröffentlicht" }) : null,
      idLine, quote]));
    var idn = VM.identityNote(s);
    if (idn) heroHost.append(el("div", { class: "qx-notice", role: "note", dataset: { conflict: idn.kind || "" } }, [
      el("strong", { text: idn.title }), el("p", { text: idn.shown }), el("p", { class: "qx-small", text: idn.why })]));

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
    var chart = !priceAllowed ? { node: X.notice("Kursverlauf nicht freigegeben", VM.reasonText("DISPLAY_NOT_PERMITTED")), dispose: function () {} } : global.VUQuantChart.create({ ticker: ticker, eod: eod, currency: "USD",
      adjusted: s.chart && s.chart.adjustmentStatus === "splitAdjusted", splitEvents: s.chart && s.chart.splitEvents,
      longPath: s.masterMemberId && /^[A-Za-z0-9_-]+$/.test(s.masterMemberId) ? "/quant/data/market/discover-series-long/" + s.masterMemberId + ".json" : null,
      loadJSON: global.QuantShell.loadJSON,
      onPrice: function (p) { if (typeof p.price === "number" && (p.live || !hasDailyPrice)) setQuote(p.price, p.delta, p.when + " · USD"); } });
    disposers.push(chart.dispose);

    var layout = el("div", { class: "qx-stock-layout" }, [chart.node]);
    bodyHost.append(layout);

    var hasFactors = vm.factorState === "AVAILABLE";
    if (hasFactors) layout.append(verdictCard(vm));
    else {
      var reason = factors && factors.reason;
      layout.append(X.card([el("span", { class: "qx-eyebrow", text: "Quant-Einordnung" }),
        el("h2", { class: "qx-h2", text: reason === "NOT_AN_EQUITY_LISTING" ? "Keine Unternehmensanalyse für diesen Titel" : "Noch keine Einordnung möglich" }),
        el("p", { text: VM.reasonText(reason, "Für diesen Titel ist keine Faktoranalyse veröffentlicht.") }),
        el("p", { class: "qx-small", text: "Quant bildet keine Ersatzwerte. Was vorhanden ist, steht weiter unten; was fehlt, steht unter „Daten und Grenzen“." })]));
    }

    /* ------------------------------------------------------ Navigation */
    var toc = [["einordnung", "Faktoren", hasFactors && vm.overall.rated > 0], ["rendite", "Ertrag", !!(vm.returns && vm.returns.state === "AVAILABLE")], ["veraenderung", "Veränderung", vm.change.state === "AVAILABLE"], ["setup", "Setup", vm.setup.state !== "UNAVAILABLE"],
      ["strategie", "Strategie", vm.strategy.state === "AVAILABLE"], ["historie", "Historie", true], ["technik", "Kursstruktur", !!(technical && technical.state === "AVAILABLE")], ["zahlen", "Zahlen", !!(s.quant && s.quant.state === "AVAILABLE")], ["grenzen", "Daten & Grenzen", true]]
      .filter(function (t) { return t[2]; });
    bodyHost.append(el("nav", { class: "qx-toc", "aria-label": "Abschnitte der Analyse" }, toc.map(function (t) {
      return el("a", { href: "#" + t[0], onclick: function (e) { e.preventDefault(); var n = document.getElementById(t[0]); if (n) n.scrollIntoView({ behavior: "smooth", block: "start" }); }, text: t[1] });
    })));

    if (hasFactors && vm.overall.rated > 0) {
      bodyHost.append(X.section("Was macht diese Aktie stark oder schwach?", "Sieben Eigenschaften, jede wird im Vergleich zu allen anderen Aktien eingeordnet. Antippen zeigt, woraus der Wert besteht – bis zu den Rohdaten.",
        [el("div", { class: "qx-factors" }, vm.factors.map(function (f) { return factorCard(f, ticker); })),
          el("p", { class: "qx-small", text: "Wert 0–100: gewichtetes Mittel der Rangplätze der einzelnen Kennzahlen, 50 ist die Mitte. Die Stufen sind feste Wertgrenzen (ab 90 sehr stark, ab 75 stark, ab 45 durchschnittlich, ab 25 schwach) – keine Anteile des Marktes. Die Position im Markt ist deshalb eigens gezählt. Stand " + X.dateDe(vm.asOf && vm.asOf.factors) + (vm.asOf && vm.asOf.fundamentals ? ", Geschäftszahlen bis " + X.dateDe(vm.asOf.fundamentals) : "") + "." })],
        { href: X.routes.method("faktoren"), label: "Wie Faktoren entstehen →" }, "Die sieben Eigenschaften", "einordnung"));
    }
    if (vm.returns && vm.returns.state === "AVAILABLE") {
      bodyHost.append(X.section("Kurs und Ertrag", "Die Kursstärke misst nur den Kurs. Die Anlegerrendite rechnet Ausschüttungen mit ein – deshalb können beide Zahlen verschieden sein.", [X.card([
        el("div", { class: "qx-stats qx-returns" }, vm.returns.rows.map(function (r) {
          return el("div", { class: "qx-stat" }, [el("span", { text: r.label }), el("p", { class: "qx-small", style: "margin:4px 0 0;color:var(--qx-ink)", text: "Kursstärke " + r.price + " · Anlegerrendite " + r.investor })]);
        })),
        el("p", { class: "qx-small", text: vm.returns.text })])], null, "Kursentwicklung", "rendite"));
    }
    if (vm.change.state === "AVAILABLE") {
      var moving = vm.change.items.filter(function (i) { return i.tone !== "neutral"; });
      var still = vm.change.items.filter(function (i) { return i.tone === "neutral"; });
      function changeItem(i) {
        return el("div", { class: "qx-change tone-" + i.tone }, [el("span", { class: "qx-change-mark", "aria-hidden": "true", text: CHANGE_MARK[i.tone] }),
          el("strong", { text: i.text }), el("span", { text: i.group + " · " + (i.window || "") + (i.to ? " · " + i.to : "") })]);
      }
      bodyHost.append(X.section("Was verändert sich gerade?", vm.change.text + " Stand " + X.dateDe(vm.change.asOf) + ".", [
        moving.length ? el("div", { class: "qx-changes" }, moving.map(changeItem)) : el("p", { class: "qx-muted", text: "Keine deutliche Veränderung." }),
        still.length ? X.more("Unverändert (" + still.length + ")", function () { return el("div", { class: "qx-changes" }, still.map(changeItem)); }) : null,
        vm.change.open.length ? X.more("Nicht messbar (" + vm.change.open.length + ")", function () { return vm.change.open.map(function (o) { return el("p", { class: "qx-small" }, [el("b", { text: o.label + ": " }), document.createTextNode(o.text)]); }); }) : null,
        X.more("Wie die Veränderung gemessen wird", function () { return vm.change.items.map(function (i) { return el("p", { class: "qx-small" }, [el("b", { text: i.label + ": " }), document.createTextNode((i.how || "") + (i.from && i.to ? " (" + i.from + " → " + i.to + ")" : ""))]); }); })
      ], null, "Veränderung", "veraenderung"));
    }
    if (vm.setup.state !== "UNAVAILABLE") bodyHost.append(X.section("Wie weit ist die Aktie im Setup?", "Wo die Aktie im Kursbild steht, warum – und was als Nächstes passieren müsste.", setupSection(vm, ticker), null, "Kursbild", "setup"));
    if (vm.strategy.state === "AVAILABLE") bodyHost.append(X.section("Welche Strategie passt?", "Geprüft wird, welche Bedingungen eines Anlagestils die Aktie heute erfüllt.", strategySection(vm, assignment), { href: X.routes.strategies(), label: "Alle Strategien →" }, "Anlagestil", "strategie"));
    bodyHost.append(X.section("Was geschah früher in ähnlichen Situationen?", "Was früher geschah – bei dieser Aktie in derselben Kurslage und im gesamten Markt in ähnlichen Lagen.", replaySection(vm, words), null, "Rückblick", "historie"));
    /* Absagen stehen EINMAL, gesammelt unter "Daten und Grenzen" - nicht als
       Stapel von Hinweisen quer ueber die Seite. */
    if (technical && technical.state === "AVAILABLE") bodyHost.append(X.section("Kursstruktur", "Trend, Dynamik und Schwankung aus der technischen Analyse.", technicalSection(technical, ticker), null, "Technik und Elliott-Wellen", "technik"));
    var figures = s.quant && s.quant.state === "AVAILABLE" ? figuresSection(s, ticker) : null;
    if (figures && !(figures.length === 1 && figures[0].classList && figures[0].classList.contains("qx-notice"))) bodyHost.append(X.section("Unternehmenszahlen", "Die wichtigsten Kennzahlen aus Geschäft, Bewertung und Risiko.", figures, null, "Geschäftszahlen", "zahlen"));

    /* ------------------------------------------------- Daten & Grenzen */
    /* Was fehlt, bildet der Vertrag (quant/engines/journey-shape.js) - dieselbe
       Regel wie die Messung, keine zweite Fassung in der Seite. */
    var Shape = global.VUJourneyShape;
    var shape = Shape ? Shape.assess(Shape.stationsFrom({ stock: s, factors: factors, setup: setup, patterns: patterns, technical: technical })) : { groups: [] };
    var gapNodes = (shape.groups || []).map(function (g) {
      return el("div", { class: "qx-open", style: "margin-top:8px", dataset: { cause: g.causeId || "" } }, [el("strong", { text: g.headline }),
        el("p", { style: "margin:4px 0 0", text: g.explanation }), g.outlook ? el("p", { class: "qx-small", style: "margin:4px 0 0", text: g.outlook }) : null,
        g.areas && g.areas.length ? el("p", { class: "qx-small", style: "margin:4px 0 0", text: "Betrifft: " + g.areas.join(" · ") }) : null]);
    });
    /* Die konkreten Gruende mit Zahl, dort wo ein Leser nach ihnen sucht. */
    if (technical && technical.state !== "AVAILABLE") { var tr = VM.technicalReasonText(technical.unavailability); if (tr) gapNodes.push(el("p", { class: "qx-small", text: "Kursstruktur: " + tr })); }
    if (patterns && patterns.state !== "AVAILABLE") { var pr = VM.patternReasonText(patterns.unavailability); if (pr) gapNodes.push(el("p", { class: "qx-small", text: "Marktmuster: " + pr })); }
    if (entry.v === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") gapNodes.push(el("p", { class: "qx-small", text: "Börsenwert: " + VM.reasonText("SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") + (entry.il > 1 ? " Das Unternehmen hat " + entry.il + " börsennotierte Aktiengattungen." : "") }));
    bodyHost.append(X.section("Daten und Grenzen", "Was Quant für diese Aktie weiß – und was nicht.", [X.card([
      el("dl", { class: "qx-kv" }, [
        el("dt", { text: "Kurs" }), el("dd", { text: last ? "Tiingo, Tagesschluss bis " + X.dateDe(last[0]) : "keine veröffentlichte Tagesreihe" }),
        el("dt", { text: "Geschäftszahlen" }), el("dd", { text: vm.asOf && vm.asOf.fundamentals ? "SEC EDGAR, bis " + X.dateDe(vm.asOf.fundamentals) : "keine" }),
        el("dt", { text: "Faktoren" }), el("dd", { text: vm.asOf ? "Stand " + X.dateDe(vm.asOf.factors) : "keine" }),
        el("dt", { text: "Setup" }), el("dd", { text: vm.setup.asOf ? "Stand " + X.dateDe(vm.setup.asOf) : "keins" })
      ]),
      gapNodes.length ? el("div", { dataset: { journeyShape: shape.shape || "" } }, [el("h3", { class: "qx-h3", style: "font-size:15px", text: "Was fehlt – und warum" })].concat(gapNodes)) : null,
      el("p", { class: "qx-small", text: vm.isNot }),
      el("div", { class: "qx-actions" }, [X.btn("Methodik", X.routes.method(), "secondary"), X.btn("SEC-Daten prüfen", "/quant/data-inspector/", "secondary"), X.btn("Vergleichen", X.routes.compare([ticker]), "secondary")])
    ])], null, "Transparenz", "grenzen"));

    if (location.hash.indexOf("#faktor-") >= 0) { /* bereits gerendert */ }
    return function () { disposers.forEach(function (d) { try { d(); } catch (e) { /* bereits beendet */ } }); };
  }

  global.QXStock = { render: render, factorCard: factorCard };
})(window);
