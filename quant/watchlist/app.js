/* Vision Universe Quant — Watchlist Intelligence (/quant/watchlist).

   Der Unterschied zu einer gewoehnlichen Watchlist ist die Fragestellung
   (§56): nicht "Was steht auf meiner Liste?", sondern "Was hat sich seit
   dem letzten Snapshot veraendert?".

   Alle Deltas stammen aus echten historischen Score-Snapshots, nicht aus
   einer rueckwirkenden Rekonstruktion mit heutigen Daten. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, Charts = window.QuantCharts, el = S.el;
  var Api = window.QuantApi;

  var CHANGE_GROUPS = [
    { id: "upgrades", label: "Quant Upgrades", note: "VU Quant Score deutlich gestiegen.",
      match: function (m, cfg) { return num(m.scoreVelocity30d) && m.scoreVelocity30d >= cfg.radar.quantUpgradeMinDelta; } },
    { id: "downgrades", label: "Quant Downgrades", note: "VU Quant Score deutlich gefallen.",
      match: function (m, cfg) { return num(m.scoreVelocity30d) && m.scoreVelocity30d <= cfg.radar.quantDowngradeMaxDelta; } },
    { id: "high52", label: "52-Wochen-Hoch", note: "Nahe am Jahreshoch bei bestaetigtem Score.",
      match: function (m, cfg) {
        return num(m.distanceTo52wHigh) && m.distanceTo52wHigh <= cfg.radar.near52wHighMaxDistancePct &&
               num(m.quantScore) && m.quantScore >= cfg.radar.near52wHighMinQuantScore;
      } },
    { id: "momentum", label: "Momentum-Veraenderung", note: "Momentum-Faktor deutlich in Bewegung.",
      match: function (m, cfg) { return num(m.factorVelocity.momentum) && Math.abs(m.factorVelocity.momentum) >= cfg.radar.factorBreakoutMinDelta; } },
    { id: "quality", label: "Quality-Veraenderung", note: "Quality-Faktor deutlich in Bewegung.",
      match: function (m, cfg) { return num(m.factorVelocity.quality) && Math.abs(m.factorVelocity.quality) >= cfg.radar.emergingCompounderMinFactorDelta; } },
    { id: "valuation", label: "Bewertungsveraenderung", note: "Value-Faktor deutlich in Bewegung.",
      match: function (m, cfg) { return num(m.factorVelocity.value) && Math.abs(m.factorVelocity.value) >= cfg.radar.emergingCompounderMinFactorDelta; } }
  ];

  function num(v) { return typeof v === "number" && Number.isFinite(v); }

  S.page({
    nav: S.BASE + "watchlist/",
    need: ["securities", "scoreHistory"],
    render: function (data, root) {
      return Api.getWatchlistIntelligence().then(function (intel) {
        var cfg = window.VUMethodology.quant();
        var changed = intel.members.filter(function (m) {
          return CHANGE_GROUPS.some(function (g) { return g.match(m, cfg); });
        });

        root.appendChild(el("header", {}, [
          el("p", { class: "q-kicker", text: "Watchlist Intelligence" }),
          el("h1", { class: "q-h1", text: changed.length
            ? changed.length + " von " + intel.members.length + " Titeln haben sich relevant veraendert."
            : "Keine relevanten Veraenderungen." }),
          el("p", { class: "q-lead", text:
            "Gemeldet werden nur Bewegungen oberhalb der zentral konfigurierten Schwellen. Ein Score, der " +
            "sich um zwei Punkte bewegt, ist kein Ereignis." })
        ]));

        root.appendChild(C.section("Uebersicht", null, C.metricGrid([
          { label: "Beobachtete Titel", value: S.num(intel.members.length, 0) },
          { label: "Mit Veraenderung", value: S.num(changed.length, 0), hint: "ueber der Meldeschwelle" },
          { label: "Ereignisse", value: S.num(intel.events.length, 0), hint: "in den letzten 30 Tagen" },
          { label: "Stand", value: S.formatDate(intel.asOf), hint: intel.methodologyVersion }
        ])));

        CHANGE_GROUPS.forEach(function (group) {
          var matches = intel.members.filter(function (m) { return group.match(m, cfg); });
          if (!matches.length) return;
          root.appendChild(C.section(group.label, group.note,
            C.stockList(matches, { deltaField: deltaFieldFor(group.id) })));
        });

        if (!changed.length) {
          root.appendChild(el("div", { style: "margin-top:24px" }, [
            S.stateBox("Nichts zu melden",
              "Keiner der beobachteten Titel hat eine Veraenderung oberhalb der Schwellen gezeigt. " +
              "Das ist ein Ergebnis, keine leere Seite.", "empty")
          ]));
        }

        root.appendChild(eventsSection(intel));
        root.appendChild(membersSection(intel, data));
        root.appendChild(thresholdsSection(cfg));
      });
    }
  });

  function deltaFieldFor(groupId) {
    return groupId === "upgrades" || groupId === "downgrades" ? "scoreVelocity30d" : null;
  }

  function eventsSection(intel) {
    if (!intel.events.length) {
      return C.section("Ereignisse", null,
        S.stateBox("Keine Ereignisse", "Fuer die beobachteten Titel wurde in den letzten 30 Tagen kein Ereignis erkannt.", "empty"));
    }
    var order = { high: 0, notable: 1, info: 2 };
    var sorted = intel.events.slice().sort(function (a, b) { return order[a.severity] - order[b.severity]; });
    return C.section("Ereignisse", "Nach Schweregrad sortiert.",
      el("div", { class: "q-rows" }, sorted.map(function (e) {
        var ticker = e.securityId.replace("sec_", "");
        return el("a", { class: "q-row", href: S.BASE + "stock/?ticker=" + ticker }, [
          el("span", { class: "q-row-rank" }),
          el("span", { class: "q-row-main" }, [
            el("b", { text: e.headline }),
            el("span", { text: C.eventLabel(e.eventType) + " · " + S.formatDate(e.occurredAt) })
          ]),
          el("span", {}),
          el("span", { class: "q-chip tone-" + C.severityTone(e.severity), text: e.severity })
        ]);
      })));
  }

  function membersSection(intel, data) {
    var history = data.scoreHistory;
    return C.section("Beobachtete Titel", "Score-Verlauf der letzten zwoelf Monate.",
      el("div", { class: "q-table-wrap" }, [
        el("table", { class: "q-table" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { scope: "col", text: "Ticker" }), el("th", { scope: "col", text: "Verlauf" }),
            el("th", { scope: "col", text: "Quant" }), el("th", { scope: "col", text: "30T" }),
            el("th", { scope: "col", text: "60T" }), el("th", { scope: "col", text: "Quality" }),
            el("th", { scope: "col", text: "Momentum" }), el("th", { scope: "col", text: "Value" }),
            el("th", { scope: "col", text: "Aktion" })
          ])]),
          el("tbody", {}, intel.members.map(function (m) {
            var points = window.VURadar.seriesFor(history, m.securityId) || [];
            return el("tr", {}, [
              el("td", {}, [el("a", { href: S.BASE + "stock/?ticker=" + m.ticker, text: m.ticker, title: m.name })]),
              el("td", {}, [Charts.sparkline(points.map(function (p) { return p.score; }), { label: "Score-Verlauf " + m.ticker })]),
              el("td", { class: num(m.quantScore) ? null : "na", text: num(m.quantScore) ? S.num(m.quantScore, 0) : "–" }),
              deltaCell(m.scoreVelocity30d), deltaCell(m.scoreVelocity60d),
              deltaCell(m.factorVelocity.quality), deltaCell(m.factorVelocity.momentum), deltaCell(m.factorVelocity.value),
              el("td", {}, [el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "Entfernen",
                onclick: function () { Api.toggleWatchlist(m.securityId).then(function () { location.reload(); }); } })])
            ]);
          }))
        ])
      ]));
  }

  function deltaCell(value) {
    if (!num(value)) return el("td", { class: "na", text: "–" });
    return el("td", {}, [el("span", { class: "q-delta " + (value > 0 ? "up" : value < 0 ? "down" : "flat"),
                                      text: S.signed(value, 1) })]);
  }

  function thresholdsSection(cfg) {
    return el("div", { style: "margin-top:32px" }, [
      C.disclosure("Meldeschwellen", [
        el("p", { class: "q-note", text:
          "Alle Schwellen stehen zentral in quant-v1.json. Wer sie aendert, aendert sie an einer Stelle — " +
          "und die Aenderung ist als Methodikversion nachvollziehbar." }),
        C.definitionList([
          ["Quant Upgrade", "ab +" + cfg.radar.quantUpgradeMinDelta + " Punkte in 30 Tagen"],
          ["Quant Downgrade", "ab " + cfg.radar.quantDowngradeMaxDelta + " Punkte in 30 Tagen"],
          ["52-Wochen-Hoch", "hoechstens " + cfg.radar.near52wHighMaxDistancePct + " % Abstand bei Quant Score ≥ " + cfg.radar.near52wHighMinQuantScore],
          ["Faktorbewegung", "ab " + cfg.radar.emergingCompounderMinFactorDelta + " Punkten je Faktor"],
          ["Factor Breakout", "ab " + cfg.radar.factorBreakoutMinDelta + " Punkten in mindestens " + cfg.radar.factorBreakoutMinFactors + " Faktoren"],
          ["Snapshot-Intervall", cfg.scoreMomentum.snapshotIntervalDays + " Tage"]
        ])
      ])
    ]);
  }
})();
