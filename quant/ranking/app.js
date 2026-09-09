/* Vision Universe Quant — VU Quant Ranking (/quant/ranking).
   Eine Engine, viele Sichten: Gesamt, je Faktor, je Sektor, je Industrie.
   Die Listen selbst kommen aus quant/data/securities.json — die Sortierung
   ist eine Darstellungsfrage, keine zweite Berechnung. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, el = S.el;

  var VIEWS = [
    { id: "quantScore", label: "VU Quant Score", note: "Perzentilrang des Composite im Gesamtuniversum." },
    { id: "qualityScore", label: "Quality", note: "Profitabilitaet, Cash-Erzeugung und Bilanzsicherheit." },
    { id: "momentumScore", label: "Momentum", note: "Relative Kursstaerke ueber mehrere Horizonte." },
    { id: "growthScore", label: "Growth", note: "Wachstum von Umsatz, Ergebnis, Cashflow und Marge." },
    { id: "valueScore", label: "Value", note: "Bewertung gegen Ertrag, Cashflow und Unternehmenswert." },
    { id: "riskScore", label: "Risk", note: "Hoeherer Score bedeutet geringeres Risiko." },
    { id: "scoreVelocity30d", label: "Score-Velocity", note: "Veraenderung des VU Quant Score ueber 30 Tage." }
  ];

  var state = { view: S.param("view", "quantScore"), sector: S.param("sector", ""), industry: "", limit: 50 };

  S.page({
    nav: S.BASE + "ranking/",
    need: ["securities"],
    render: function (data, root) {
      var rows = data.securities.rows.filter(function (r) { return r.status === "active"; });
      if (!VIEWS.some(function (v) { return v.id === state.view; })) state.view = "quantScore";

      root.appendChild(el("header", {}, [
        el("p", { class: "q-kicker", text: "Ranking" }),
        el("h1", { class: "q-h1", text: "VU Quant Ranking" }),
        el("p", { class: "q-lead", text:
          "Dieselbe Quant Engine, unterschiedliche Sichten. Alle Werte sind Perzentile innerhalb des " +
          "Modelluniversums zum Modellstand " + S.formatDate(data.meta.asOf) + "." })
      ]));

      /* Phase 6, Live-Feedback: "Ranking zeigt weiterhin Mock-Titel" - die
         Golden Five sind hier nie erschienen, weil diese Seite ausschliesslich
         data.securities.rows (das synthetische Modelluniversum) laedt.
         Eigener Abschnitt, NICHT ins Perzentil-Ranking unten gemischt: eine
         Vergleichsgruppe von fuenf Titeln aus vier Sektoren erfuellt
         normalization.js' Mindestgroesse (12 Peers) nicht. */
      root.appendChild(C.goldenFiveTeaser("Golden Universe — reale Unternehmen (ausserhalb dieses Rankings)",
        "Fuenf reale Titel mit echten SEC-Fundamentaldaten und (Development Preview) echten Tiingo-Kursen. " +
        "Das Perzentil-Ranking unten arbeitet ausschliesslich auf dem synthetischen Modelluniversum " +
        "(Demo-Daten) - fuer diese fuenf Titel gibt es bewusst keinen VU Quant Score. Details direkt anklicken:"));

      var pills = el("div", { class: "q-pillbar", style: "margin:22px 0 14px", role: "tablist" });
      VIEWS.forEach(function (v) {
        pills.appendChild(el("button", {
          class: "q-pill" + (v.id === state.view ? " on" : ""), type: "button", role: "tab",
          "aria-selected": String(v.id === state.view), text: v.label,
          onclick: function () { state.view = v.id; state.limit = 50; sync(); }
        }));
      });
      root.appendChild(pills);

      var sectors = unique(rows.map(function (r) { return r.sector; })).sort();
      var filterBar = el("div", { class: "q-grid q-grid--3", style: "margin-bottom:18px" }, [
        field("Sektor", selectEl(["Alle Sektoren"].concat(sectors), state.sector, function (v) {
          state.sector = v; state.industry = ""; state.limit = 50; sync();
        })),
        field("Industrie", industrySelect(rows)),
        field("Anzeige", selectEl(["50", "100", "250"], String(state.limit), function (v) {
          state.limit = parseInt(v, 10); sync();
        }))
      ]);
      root.appendChild(filterBar);

      var noteEl = el("p", { class: "q-note", style: "margin:0 0 12px" });
      var listMount = el("div", {});
      root.appendChild(noteEl);
      root.appendChild(listMount);
      root.appendChild(C.methodologyPanel({ methodologyVersion: data.securities.methodologyVersion }, data.meta));

      function industrySelect(all) {
        var pool = state.sector ? all.filter(function (r) { return r.sector === state.sector; }) : all;
        var industries = unique(pool.map(function (r) { return r.industry; })).sort();
        return selectEl(["Alle Industrien"].concat(industries), state.industry, function (v) {
          state.industry = v; state.limit = 50; sync();
        });
      }

      function sync() {
        var view = VIEWS.filter(function (v) { return v.id === state.view; })[0];
        var filtered = rows.filter(function (r) {
          if (state.sector && r.sector !== state.sector) return false;
          if (state.industry && r.industry !== state.industry) return false;
          return Number.isFinite(r[view.id]);
        }).sort(function (a, b) { return b[view.id] - a[view.id]; });

        S.$$(".q-pill", pills).forEach(function (b, i) {
          var on = VIEWS[i].id === state.view;
          b.classList.toggle("on", on);
          b.setAttribute("aria-selected", String(on));
        });
        S.mount(filterBar, [
          field("Sektor", selectEl(["Alle Sektoren"].concat(sectors), state.sector, function (v) {
            state.sector = v; state.industry = ""; state.limit = 50; sync();
          })),
          field("Industrie", industrySelect(rows)),
          field("Anzeige", selectEl(["50", "100", "250"], String(state.limit), function (v) {
            state.limit = parseInt(v, 10); sync();
          }))
        ]);

        noteEl.textContent = view.note + " " + S.num(filtered.length, 0) + " Titel erfuellen die Auswahl" +
          (filtered.length > state.limit ? ", angezeigt werden die ersten " + state.limit + "." : ".");

        S.mount(listMount, filtered.length
          ? C.stockList(filtered.slice(0, state.limit), {
              ranked: true, scoreField: state.view,
              deltaField: state.view === "quantScore" ? "scoreVelocity30d" : null
            })
          : S.stateBox("Keine Treffer", "Zu dieser Auswahl gibt es im Modelluniversum keine Wertpapiere.", "empty"));
      }

      sync();
    }
  });

  function field(label, control) {
    return el("div", { class: "q-field" }, [el("label", { text: label }), control]);
  }

  function selectEl(options, value, onChange) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.selectedIndex === 0 ? "" : sel.value); } });
    options.forEach(function (o, i) {
      sel.appendChild(el("option", { value: i === 0 ? "" : o, text: o, selected: (i === 0 ? !value : o === value) ? true : null }));
    });
    return sel;
  }

  function unique(list) {
    var seen = Object.create(null), out = [];
    list.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }
})();
