/* Vision Universe Quant — SEC Data Inspector (/quant/data-inspector).

   Internes Validierungswerkzeug, kein Konsumenten-Dashboard. Es zeigt jede
   normalisierte SEC-Fundamentalzahl mit ihrer Herkunft: SEC-Concept,
   Accession Number, Formular, Einreichungsdatum und ab wann der Wert im
   Backtest ueberhaupt sichtbar sein darf.

   Diese Seite benutzt bewusst NICHT S.page(): dessen Mock-Banner gehoert zum
   synthetischen Modelluniversum, und SEC-Daten sind keine Mock-Daten. Sie
   traegt stattdessen einen eigenen Herkunftshinweis. Die uebrige Shell
   (Navigation, Kopfzeile, Zustandsboxen) wird unveraendert mitbenutzt. */
(function () {
  "use strict";
  var S = window.QuantShell, el = S.el;
  var DATA = S.BASE + "data/sec/";

  var state = { index: null, view: null, metric: "revenue", period: "all", showMissing: true };

  function periodLabel(row) {
    if (!row.fiscal_year) return row.fiscal_period || "—";
    return row.fiscal_period === "FY"
      ? "FY" + row.fiscal_year
      : "FY" + row.fiscal_year + " " + row.fiscal_period;
  }

  function formatValue(row) {
    if (row.value === null || row.value === undefined) return "—";
    if (row.unit === "USD" && Math.abs(row.value) >= 1e6) {
      return (row.value / 1e9).toLocaleString("de-DE", { maximumFractionDigits: 3 }) + " Mrd.";
    }
    return row.value.toLocaleString("de-DE", { maximumFractionDigits: 4 });
  }

  /* ------------------------------------------------------------- Herkunft */

  function originNote(view) {
    var profile = (view && view.profile) || {};
    return el("div", { class: "q-state" }, [
      el("b", { text: "Echte SEC-Daten · Primaerquelle" }),
      el("span", { text:
        "Alle Werte stammen aus data.sec.gov (Company Facts, XBRL). Abgeleitete "
        + "Kennzahlen sind in der Spalte Quelle als VU DERIVED gekennzeichnet und "
        + "nie als SEC-Meldung ausgegeben. "
        + (profile.name ? profile.name + " · SIC " + (profile.sic || "—") + " · " : "")
        + "Restatement-Policy: " + ((view && view.policy) || "—") + "." })
    ]);
  }

  function notIngestedNote() {
    return el("div", { class: "q-state q-state--warn" }, [
      el("b", { text: "Noch keine SEC-Daten ingestiert" }),
      el("span", { text:
        "Der Workflow „Update SEC fundamentals\" erzeugt sie gegen data.sec.gov. "
        + "Bis dahin tragen die Artefakte unter quant/data/sec/ absichtlich "
        + "status \"not_generated\" — es werden hier keine Platzhalterzahlen gezeigt." })
    ]);
  }

  /* -------------------------------------------------------------- Tabelle */

  var COLUMNS = ["Periode", "Wert", "Einheit", "Periodenende", "Verfuegbar ab",
                 "Formular", "Accession", "SEC Concept", "Quelle", "Transformation",
                 "Qualitaet"];

  function factTable(view) {
    var rows = (view.rows || []).filter(function (row) {
      if (row.metric !== state.metric) return false;
      if (!state.showMissing && !row.available) return false;
      if (state.period === "FY") return row.fiscal_period === "FY";
      if (state.period === "Q") return /^Q[1-4]$/.test(row.fiscal_period || "");
      return true;
    });
    rows.sort(function (a, b) {
      return (b.fiscal_year - a.fiscal_year)
        || String(a.fiscal_period).localeCompare(String(b.fiscal_period));
    });

    if (!rows.length) {
      return S.stateBox("Keine Zeilen", "Fuer diese Auswahl liegt nichts vor.", "warn");
    }

    var head = el("tr", {}, COLUMNS.map(function (label) {
      return el("th", { scope: "col", class: label === "Wert" ? "num" : null, text: label });
    }));
    var body = rows.map(function (row) {
      if (!row.available) {
        return el("tr", { class: "is-missing" }, [
          el("td", { text: periodLabel(row) }),
          el("td", { class: "num", text: "—" }),
          el("td", { colspan: "8", text: row.reason || "nicht verfuegbar" }),
          el("td", {}, [el("span", { class: "tag tag--UNKNOWN", text: "UNKNOWN" })])
        ]);
      }
      var isDerived = row.source === "VISION_UNIVERSE_DERIVED";
      return el("tr", {}, [
        el("td", { text: periodLabel(row) }),
        el("td", { class: "num", text: formatValue(row) }),
        el("td", { text: row.unit || "" }),
        el("td", { text: row.period_end || "" }),
        el("td", { text: String(row.available_from || "").slice(0, 10) }),
        el("td", { text: row.form || "" }),
        el("td", { text: row.accession || "" }),
        el("td", { text: row.concept || "" }),
        el("td", {}, [el("span", {
          class: "tag " + (isDerived ? "tag--derived" : "tag--sec"),
          text: isDerived ? "VU DERIVED" : "SEC"
        })]),
        el("td", { text: row.transformation || "" }),
        el("td", {}, [el("span", { class: "tag tag--" + row.quality, text: row.quality })])
      ]);
    });

    return el("div", { class: "vu-scroll" }, [
      el("table", { class: "vu-facts" }, [el("thead", {}, [head]), el("tbody", {}, body)])
    ]);
  }

  /* ------------------------------------------------------------ Steuerung */

  function controls(root) {
    var companies = state.index.companies || [];
    var metrics = [];
    (state.view.rows || []).forEach(function (row) {
      if (metrics.indexOf(row.metric) === -1) metrics.push(row.metric);
    });
    metrics.sort();
    if (metrics.indexOf(state.metric) === -1 && metrics.length) state.metric = metrics[0];

    function select(label, options, current, onChange) {
      var node = el("select", { onchange: function (e) { onChange(e.target.value); } },
        options.map(function (o) {
          return el("option", { value: o.value, text: o.label, selected: o.value === current });
        }));
      return el("label", {}, [el("span", { text: label }), node]);
    }

    return el("div", { class: "vu-controls" }, [
      select("Unternehmen", companies.map(function (c) {
        return { value: c.file, label: c.ticker + " — " + c.name };
      }), state.current, function (file) { load(file, root); }),
      select("Kennzahl", metrics.map(function (m) { return { value: m, label: m }; }),
        state.metric, function (m) { state.metric = m; render(root); }),
      select("Periode", [
        { value: "all", label: "Alle" },
        { value: "FY", label: "Nur Geschaeftsjahre" },
        { value: "Q", label: "Nur Quartale" }
      ], state.period, function (p) { state.period = p; render(root); }),
      el("label", { class: "vu-check" }, [
        el("input", {
          type: "checkbox", checked: state.showMissing,
          onchange: function (e) { state.showMissing = e.target.checked; render(root); }
        }),
        el("span", { text: "Fehlende Werte mit Begruendung anzeigen" })
      ])
    ]);
  }

  /* ------------------------------------------------- Coverage und Gates */

  function coveragePanel(matrix) {
    if (!matrix || matrix.status === "not_generated" || !matrix.grid
        || !Object.keys(matrix.grid).length) {
      return S.stateBox("Coverage-Matrix", "Noch nicht gemessen. Erzeugt der Workflow "
        + "„Update SEC fundamentals\" gegen data.sec.gov.", "warn");
    }
    var years = Object.keys(matrix.grid).sort().reverse();
    var tickers = [];
    years.forEach(function (y) {
      Object.keys(matrix.grid[y]).forEach(function (t) {
        if (tickers.indexOf(t) === -1) tickers.push(t);
      });
    });
    var head = el("tr", {}, [el("th", { text: "Jahr" })].concat(tickers.map(function (t) {
      return el("th", { text: t });
    })));
    var body = years.map(function (year) {
      return el("tr", {}, [el("td", { text: year })].concat(tickers.map(function (t) {
        var status = matrix.grid[year][t] || "MISSING";
        return el("td", { class: "cov--" + status, text: status });
      })));
    });
    return el("div", { class: "vu-scroll" }, [
      el("table", { class: "vu-facts" }, [el("thead", {}, [head]), el("tbody", {}, body)])
    ]);
  }

  function qualityPanel(view) {
    var summary = (view && view.quality_summary) || null;
    var errors = (view && view.quality_errors) || { total: 0, shown: 0, findings: [] };
    if (!summary) {
      return S.stateBox("Datenqualitaet", "Noch nicht gemessen.", "warn");
    }
    var severity = summary.by_severity || {};
    var head = el("p", { class: "q-lead", text:
      "Regelwerk " + (summary.rules_version || "—") + " · "
      + (severity.ERROR || 0) + " ERROR · " + (severity.WARNING || 0) + " WARNING · "
      + (severity.INFO || 0) + " INFO. Befunde werden markiert, nie korrigiert." });
    if (!errors.total) {
      return el("div", {}, [head, el("div", { class: "q-state" }, [
        el("b", { text: "Keine ERROR-Befunde" }),
        el("span", { text: "Die verbleibenden Befunde sind WARNING oder INFO und "
          + "stehen im (nicht committeten) Factbook." })
      ])]);
    }
    var rows = errors.findings.map(function (finding) {
      return el("tr", {}, [
        el("td", { text: finding.code || "" }),
        el("td", { text: finding.metric || finding.concept || "" }),
        el("td", { text: finding.message || "" }),
        el("td", { text: finding.accession || "" })
      ]);
    });
    var table = el("div", { class: "vu-scroll" }, [
      el("table", { class: "vu-facts" }, [
        el("thead", {}, [el("tr", {}, ["Code", "Kennzahl / Concept", "Befund", "Accession"]
          .map(function (label) { return el("th", { scope: "col", text: label }); }))]),
        el("tbody", {}, rows)
      ])
    ]);
    var note = errors.shown < errors.total
      ? el("p", { class: "q-lead", text: errors.shown + " von " + errors.total
          + " ERROR-Befunden gezeigt." })
      : null;
    return el("div", {}, note ? [head, note, table] : [head, table]);
  }

  function gatesPanel(report) {
    var results = (report && report.provider_level && report.provider_level.results) || [];
    if (!results.length) {
      return S.stateBox("Qualifikations-Gates", "Noch nicht gelaufen. Die Gates A/B/C aus "
        + "quant/engines/gate-tests.js laufen gegen den SEC-Adapter, sobald echte Daten "
        + "vorliegen.", "warn");
    }
    return el("div", {}, results.map(function (gate) {
      return el("div", { class: "gate" }, [
        el("span", { class: "gate__status gate__status--" + gate.status, text: gate.status }),
        el("div", {}, [
          el("strong", { text: gate.gate }),
          el("div", { class: "gate__reason", text: gate.reason })
        ])
      ]);
    }));
  }

  /* ----------------------------------------------------------- Rendering */

  function render(root) {
    S.clear(root);
    root.appendChild(el("header", {}, [
      el("p", { class: "q-kicker", text: "Internes Validierungswerkzeug" }),
      el("h1", { class: "q-h1", text: "SEC Data Inspector" }),
      el("p", { class: "q-lead", text:
        "Jede normalisierte Fundamentalzahl mit ihrer Herkunft: SEC-Concept, Accession "
        + "Number, Formular, Einreichungsdatum und der Zeitpunkt, ab dem der Wert im "
        + "Backtest sichtbar sein darf." })
    ]));

    if (!state.index || !(state.index.companies || []).length) {
      root.appendChild(notIngestedNote());
    } else if (state.view) {
      root.appendChild(originNote(state.view));
      root.appendChild(controls(root));
      root.appendChild(factTable(state.view));
    }

    if (state.view) {
      root.appendChild(el("h2", { class: "q-h2", text: "Datenqualitaet" }));
      root.appendChild(qualityPanel(state.view));
    }

    root.appendChild(el("h2", { class: "q-h2", text: "Coverage-Matrix" }));
    root.appendChild(el("div", { id: "vu-coverage" }, [S.loading()]));
    root.appendChild(el("h2", { class: "q-h2", text: "Qualifikations-Gates" }));
    root.appendChild(el("div", { id: "vu-gates" }, [S.loading()]));

    loadPanel("coverage_matrix.json", "#vu-coverage", coveragePanel);
    loadPanel("pit_gates.json", "#vu-gates", gatesPanel);
  }

  function loadPanel(file, selector, build) {
    S.loadJSON(DATA + file, { attempts: 1 })
      .then(function (payload) { S.mount(S.$(selector), build(payload)); })
      .catch(function () { S.mount(S.$(selector), build(null)); });
  }

  function load(file, root) {
    state.current = file;
    S.loadJSON(DATA + file).then(function (view) {
      state.view = view;
      render(root);
    }).catch(function (err) {
      S.mount(root, [S.errorBox(err)]);
    });
  }

  /* --------------------------------------------------------------- Start */

  S.renderNav(S.BASE + "data-inspector/");
  var root = S.$("#q-main");
  S.mount(root, S.loading());

  S.loadJSON(DATA + "inspector_index.json", { attempts: 1 })
    .then(function (index) {
      state.index = index;
      var companies = index.companies || [];
      if (!companies.length) { render(root); return; }
      load(companies[0].file, root);
    })
    .catch(function () { state.index = { companies: [] }; render(root); });
})();
