/* Vision Universe Quant — Quant Radar (/quant/radar).
   Schnell scanbar (§25): sieben Module, je maximal zwoelf Eintraege,
   alle aus derselben zentral konfigurierten Schwellenlogik. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, el = S.el;

  S.page({
    nav: S.BASE + "radar/",
    need: ["securities", "radar", "events"],
    render: function (data, root) {
      var byId = Object.create(null);
      data.securities.rows.forEach(function (r) { byId[r.securityId] = r; });

      root.appendChild(el("header", {}, [
        el("p", { class: "q-kicker", text: "Radar" }),
        el("h1", { class: "q-h1", text: "Was sich gerade veraendert." }),
        el("p", { class: "q-lead", text:
          "Nicht die hoechsten Scores, sondern die groessten Bewegungen. Score Momentum ist ein eigener " +
          "Vision-Universe-Signaltyp und bislang nicht historisch validiert — er beschreibt eine Veraenderung, " +
          "keine erwartete Rendite." })
      ]));

      var cfg = window.VUMethodology.quant().radar;
      root.appendChild(C.section("Schwellenwerte", null, C.metricGrid([
        { label: "Quant Upgrade ab", value: "+" + cfg.quantUpgradeMinDelta + " Punkte", hint: "ueber 30 Tage" },
        { label: "Quant Downgrade ab", value: cfg.quantDowngradeMaxDelta + " Punkte", hint: "ueber 30 Tage" },
        { label: "Momentum-Fuehrer ab", value: "Score " + cfg.momentumLeaderMinScore },
        { label: "52W-Hoch-Naehe", value: "≤ " + cfg.near52wHighMaxDistancePct + " %", hint: "bei Quant ≥ " + cfg.near52wHighMinQuantScore }
      ])));

      var grid = el("div", { class: "q-grid q-grid--2", style: "margin-top:34px" });
      data.radar.definitions.forEach(function (def) {
        var items = data.radar.modules[def.id] || [];
        grid.appendChild(el("section", { class: "q-radar-module" }, [
          el("header", {}, [
            el("h3", { text: def.label }),
            el("p", { text: def.description })
          ]),
          items.length
            ? el("div", {}, items.map(function (item) {
                var row = byId[item.securityId] || item;
                return el("a", { class: "q-radar-item", href: S.BASE + "stock/?ticker=" + row.ticker }, [
                  el("span", {}, [
                    el("b", { text: row.ticker }),
                    el("span", { text: row.name })
                  ]),
                  el("span", { style: "text-align:right" }, [
                    el("b", { text: Number.isFinite(row.quantScore) ? S.num(row.quantScore, 0) : "–" }),
                    el("span", { class: "q-delta " + deltaClass(item.scoreVelocity30d),
                                 text: Number.isFinite(item.scoreVelocity30d) ? S.signed(item.scoreVelocity30d, 1) : "" })
                  ])
                ]);
              }))
            : el("p", { class: "q-note", style: "padding:12px 0 16px",
                        text: "Kein Titel erfuellt die Kriterien dieses Moduls zum aktuellen Modellstand." })
        ]));
      });
      root.appendChild(grid);

      root.appendChild(C.section("Alle Intelligence Events",
        S.num(data.events.events.length, 0) + " Ereignisse, sortiert nach Schweregrad.",
        eventTable(data.events.events)));
    }
  });

  function deltaClass(v) { return !Number.isFinite(v) ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat"; }

  function eventTable(events) {
    var order = { high: 0, notable: 1, info: 2 };
    var sorted = events.slice().sort(function (a, b) { return (order[a.severity] - order[b.severity]) || 0; });
    return el("div", { class: "q-table-wrap" }, [
      el("table", { class: "q-table" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", { scope: "col", text: "Ticker" }), el("th", { scope: "col", text: "Ereignis" }),
          el("th", { scope: "col", text: "Schwere" }), el("th", { scope: "col", text: "Vorher" }),
          el("th", { scope: "col", text: "Nachher" }), el("th", { scope: "col", text: "Erkannt" })
        ])]),
        el("tbody", {}, sorted.slice(0, 200).map(function (e) {
          var ticker = e.securityId.replace("sec_", "");
          return el("tr", {}, [
            el("td", {}, [el("a", { href: S.BASE + "stock/?ticker=" + ticker, text: ticker })]),
            el("td", { style: "text-align:left", text: C.eventLabel(e.eventType) }),
            el("td", { text: e.severity }),
            el("td", { class: Number.isFinite(e.previousValue) ? null : "na", text: Number.isFinite(e.previousValue) ? S.num(e.previousValue, 0) : "–" }),
            el("td", { class: Number.isFinite(e.newValue) ? null : "na", text: Number.isFinite(e.newValue) ? S.num(e.newValue, 0) : "–" }),
            el("td", { text: S.formatDate(e.detectedAt) })
          ]);
        }))
      ])
    ]);
  }
})();
