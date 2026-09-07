/* Vision Universe Quant — Quant Home (/quant).
   Bewusst nicht ueberladen (§58): Kontext, Top-Scores, groesste
   Veraenderungen, Radar-Teaser, Strategie-Snapshot, Watchlist-Delta.
   Alle Werte kommen aus den praekomputierten Daten in quant/data/**. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, el = S.el;

  S.page({
    nav: S.BASE,
    need: ["securities", "radar", "rankings", "events", "strategies"],
    render: function (data, root) {
      var rows = data.securities.rows;
      var byId = Object.create(null);
      rows.forEach(function (r) { byId[r.securityId] = r; });

      root.appendChild(hero(data, rows));
      root.appendChild(overview(data, rows));
      root.appendChild(topQuant(data, rows));
      root.appendChild(movers(data, byId));
      root.appendChild(momentumLeaders(data, byId));
      root.appendChild(strategySnapshot(data));
      root.appendChild(watchlistTeaser(data));
      root.appendChild(unavailableData(data));
    }
  });

  function hero(data) {
    return el("header", {}, [
      el("p", { class: "q-kicker", text: "Vision Universe® Investment Intelligence" }),
      el("h1", { class: "q-h1", text: "Von der Investmentidee zur Evidenz." }),
      el("p", { class: "q-lead", text:
        "Eine Idee wird zu Regeln, Regeln finden Unternehmen, Unternehmen bekommen ein nachvollziehbares " +
        "Faktorprofil, das Regelwerk wird historisch geprueft — und anschliessend ueberwacht." }),
      el("div", { style: "margin:22px 0 6px" }, [
        C.askBar("Zum Beispiel: profitable Technologiewerte mit starkem Momentum")
      ]),
      el("p", { class: "q-note", style: "margin-top:8px", text:
        "Die Anfrage wird in eine strukturierte, sichtbare Abfrage uebersetzt und von derselben Engine " +
        "ausgefuehrt wie der Screener." })
    ]);
  }

  function overview(data, rows) {
    var scored = rows.filter(function (r) { return r.quantStatus === "scored"; });
    var incomplete = rows.length - scored.length;
    var events = data.events.events.length;
    var upgrades = data.radar.modules.biggest_upgrades.length;

    return C.section("VU Quant Uebersicht", null, C.metricGrid([
      { label: "Universum", value: S.num(rows.length, 0) + " Titel", hint: "aktiv gelistet zum Modellstand" },
      { label: "Vollstaendig bewertet", value: S.num(scored.length, 0), hint: incomplete + " ohne vollstaendigen Score" },
      { label: "Intelligence Events", value: S.num(events, 0), hint: "in den letzten 30 Tagen erkannt" },
      { label: "Quant-Verbesserungen", value: S.num(upgrades, 0), hint: "Score-Anstieg ueber der Radar-Schwelle" }
    ]));
  }

  function topQuant(data, rows) {
    var top = rows
      .filter(function (r) { return r.status === "active" && Number.isFinite(r.quantScore); })
      .sort(function (a, b) { return b.quantScore - a.quantScore; })
      .slice(0, 8);
    return C.section("Top VU Quant Scores",
      "Hoechste Composite-Perzentile im Gesamtuniversum. Der Score beschreibt die relative Position, keine Kaufempfehlung.",
      C.stockList(top, { ranked: true }),
      { href: S.BASE + "ranking/", label: "Vollstaendiges Ranking" });
  }

  function movers(data, byId) {
    var ups = data.radar.modules.biggest_upgrades.slice(0, 6);
    var downs = data.radar.modules.biggest_downgrades.slice(0, 6);

    function column(title, note, items) {
      return el("div", { class: "q-card" }, [
        el("h3", { class: "q-h3", text: title }),
        el("p", { class: "q-note", style: "margin:4px 0 8px", text: note }),
        items.length
          ? C.stockList(items.map(function (i) { return byId[i.securityId] || i; }).filter(Boolean), { deltaField: "scoreVelocity30d" })
          : el("p", { class: "q-note", text: "Keine Veraenderung ueber der Schwelle." })
      ]);
    }

    return C.section("Groesste Quant-Veraenderungen",
      "Score-Momentum ueber 30 Tage. Ein eigener Vision-Universe-Signaltyp — noch nicht historisch validiert.",
      el("div", { class: "q-grid q-grid--2" }, [
        column("Verbesserungen", "VU Quant Score steigt", ups),
        column("Verschlechterungen", "VU Quant Score faellt", downs)
      ]),
      { href: S.BASE + "radar/", label: "Quant Radar" });
  }

  function momentumLeaders(data, byId) {
    var items = data.radar.modules.new_momentum_leaders.slice(0, 6)
      .map(function (i) { return byId[i.securityId]; }).filter(Boolean);
    return C.section("Neue Momentum-Fuehrer",
      "Momentum-Score im obersten Dezil mit weiter steigender Tendenz.",
      C.stockList(items, { scoreField: "momentumScore" }));
  }

  function strategySnapshot(data) {
    var cards = data.strategies.strategies.slice(0, 3).map(function (rec) {
      var def = rec.versions[rec.versions.length - 1].definition;
      return el("a", { class: "q-strategy", href: S.BASE + "strategies/?id=" + encodeURIComponent(rec.strategy.strategyId) }, [
        el("h3", { text: rec.strategy.name }),
        el("p", { text: rec.strategy.thesis.slice(0, 155) + "…" }),
        el("div", { class: "q-strategy-meta" }, [
          el("span", { class: "q-chip", text: def.portfolio.positions + " Positionen" }),
          el("span", { class: "q-chip", text: def.rebalance === "monthly" ? "monatlich" : "quartalsweise" }),
          el("span", { class: "q-chip", text: def.ranking.factors.map(function (f) {
            return window.QuantShell.FACTOR_LABEL[f.factor] + " " + Math.round(f.weight * 100) + "%";
          }).join(" · ") })
        ])
      ]);
    });
    return C.section("Strategien",
      "Jede Strategie ist ein vollstaendiges, versioniertes Regelwerk — historisch testbar und heute anwendbar.",
      el("div", { class: "q-grid q-grid--3" }, cards),
      { href: S.BASE + "strategies/", label: "Strategie-Bibliothek" });
  }

  function watchlistTeaser(data) {
    var events = data.events.events.slice(0, 5);
    return C.section("Watchlist Intelligence",
      "Nicht was du besitzt, sondern was sich veraendert hat.",
      events.length
        ? el("div", { class: "q-rows" }, events.map(function (e) {
            return el("a", { class: "q-row", href: S.BASE + "stock/?ticker=" + e.securityId.replace("sec_", "") }, [
              el("span", { class: "q-row-rank", text: "" }),
              el("span", { class: "q-row-main" }, [
                el("b", { text: e.headline }),
                el("span", { text: C.eventLabel(e.eventType) + " · erkannt am " + S.formatDate(e.detectedAt) })
              ]),
              el("span", {}),
              el("span", { class: "q-chip tone-" + C.severityTone(e.severity), text: e.severity })
            ]);
          }))
        : el("p", { class: "q-note", text: "Keine Ereignisse." }),
      { href: S.BASE + "watchlist/", label: "Watchlist" });
  }

  function unavailableData(data) {
    return C.section("Aktuell nicht verfuegbare Datenklassen", null,
      el("div", { class: "q-grid q-grid--3" }, data.meta.unavailableDatasets.map(function (d) {
        return S.unavailable(d.dataset, d.reason);
      })));
  }

})();
