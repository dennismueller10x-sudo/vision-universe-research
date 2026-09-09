/* Vision Universe Quant — Screener (/quant/screener → kanonisch /screener).

   Wichtigste Eigenschaft dieser Seite: sie besitzt KEINE eigene Filterlogik.
   Der visuelle Regelbauer und der VUQL-Editor erzeugen beide denselben
   typisierten Query-AST, und ausgefuehrt wird ausschliesslich
   VUQuery.execute() — dieselbe Funktion, die auch das AI-Tool screenStocks()
   aufruft (§27). Zwei Filterimplementierungen waeren der sicherste Weg,
   dass Screener-Ergebnis und Strategie-Universum auseinanderlaufen. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, el = S.el;
  var Query = window.VUQuery, VUQL = window.VUQL, Catalog = window.VUCatalog;

  var STORAGE_KEY = "vu.quant.screen.v1";

  var DEFAULT_QUERY = Query.createQuery({
    filters: [
      { field: "sector", operator: "eq", value: "Technology" },
      { field: "freeCashFlow", operator: "gt", value: 0 },
      { field: "momentum6m", operator: "gte", value: 80, scale: "percentile" }
    ],
    sort: [{ field: "quantScore", direction: "desc" }],
    limit: 25
  });

  var state = { query: null, rows: [], result: null, view: "rows" };

  S.page({
    nav: S.BASE + "screener/",
    need: ["securities"],
    render: function (data, root) {
      state.rows = data.securities.rows;
      state.query = restoreQuery();

      root.appendChild(el("header", {}, [
        el("p", { class: "q-kicker", text: "Screener" }),
        el("h1", { class: "q-h1", text: "Regeln statt Bauchgefuehl." }),
        el("p", { class: "q-lead", text:
          "Der visuelle Regelbauer und VUQL erzeugen dasselbe typisierte Abfrageobjekt. " +
          "Ausgefuehrt wird nur, was die Validierung besteht." })
      ]));

      /* Phase 6, Live-Feedback: der Screener liest ausschliesslich das
         synthetische Modelluniversum (data.securities.rows); die Golden
         Five tauchten hier nie auf. Eigener, klar getrennter Baustein statt
         Vermischung mit dem Regelbauer unten (der auf 12+ Peers fuer
         Perzentil-Filter angewiesen ist). */
      root.appendChild(C.goldenFiveTeaser("Golden Universe — reale Unternehmen (ausserhalb dieses Screeners)",
        "Fuenf reale Titel mit echten SEC-Fundamentaldaten und (Development Preview) echten Tiingo-Kursen. " +
        "Der Regelbauer unten arbeitet ausschliesslich auf dem synthetischen Modelluniversum " +
        "(Demo-Daten) - Perzentil-Filter brauchen eine Vergleichsgruppe von brauchbarer Groesse, die fuenf " +
        "Titel aus vier Sektoren nicht bilden. Golden-Five-Details direkt anklicken:"));

      var builderMount = el("div", { class: "q-card", style: "margin-top:24px" });
      var vuqlMount = el("div", { style: "margin-top:14px" });
      var errorMount = el("div", { style: "margin-top:14px" });
      var resultMount = el("div", { style: "margin-top:26px" });

      root.appendChild(builderMount);
      root.appendChild(vuqlMount);
      root.appendChild(errorMount);
      root.appendChild(resultMount);
      root.appendChild(C.disclosure("Kanonische Abfrage (JSON-AST)", [
        el("p", { class: "q-note", text:
          "VUQL ist die lesbare Darstellung. Kanonisch — und das, was Validierung, Screener-Engine, " +
          "Strategy Engine und AI tatsaechlich verarbeiten — ist dieses versionierte Objekt." }),
        el("pre", { class: "q-code", id: "q-ast" })
      ]));
      root.appendChild(C.methodologyPanel({ methodologyVersion: data.securities.methodologyVersion }, data.meta));

      function run() {
        persistQuery(state.query);
        S.mount(builderMount, buildBuilder());
        S.mount(vuqlMount, buildVuql());
        S.$("#q-ast").textContent = JSON.stringify(state.query, null, 2);

        var validation = Query.validate(state.query);
        if (!validation.valid) {
          S.mount(errorMount, validationBox(validation));
          S.mount(resultMount, S.stateBox("Nicht ausgefuehrt",
            "Eine ungueltige Abfrage wird nicht ausgefuehrt. Korrigiere die oben genannten Punkte.", "empty"));
          return;
        }
        S.mount(errorMount, validation.warnings.length ? warningBox(validation.warnings) : []);

        state.result = Query.execute(state.query, state.rows, {
          asOf: data.meta.asOf,
          methodologyVersion: data.meta.methodologyVersions.quant,
          dataSnapshotId: data.meta.dataSnapshotId
        });
        S.mount(resultMount, buildResult(data));
      }

      /* ---------------------------------------------------- Regelbauer */
      function buildBuilder() {
        var nodes = [el("h2", { class: "q-h3", style: "margin-bottom:12px", text: "Regeln" })];

        state.query.filters.forEach(function (filter, index) {
          nodes.push(filterRow(filter, index));
        });

        nodes.push(el("div", { class: "q-btn-row", style: "margin-top:14px" }, [
          el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "+ Regel", onclick: function () {
            state.query.filters.push({ field: "quantScore", operator: "gte", value: 70, scale: "raw" });
            run();
          }}),
          el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "Zuruecksetzen", onclick: function () {
            state.query = JSON.parse(JSON.stringify(DEFAULT_QUERY)); run();
          }})
        ]));

        nodes.push(el("div", { class: "q-grid q-grid--3", style: "margin-top:20px;padding-top:16px;border-top:1px solid var(--line)" }, [
          labeled("Sortieren nach", fieldSelect(state.query.sort[0].field, function (v) {
            state.query.sort[0].field = v; run();
          }, function (f) { return f.type === "number"; })),
          labeled("Richtung", simpleSelect([["desc", "Absteigend"], ["asc", "Aufsteigend"]], state.query.sort[0].direction, function (v) {
            state.query.sort[0].direction = v; run();
          })),
          labeled("Maximal", simpleSelect([["10", "10"], ["25", "25"], ["50", "50"], ["100", "100"], ["250", "250"]],
            String(state.query.limit), function (v) { state.query.limit = parseInt(v, 10); run(); }))
        ]));
        return nodes;
      }

      function filterRow(filter, index) {
        var field = Catalog.field(filter.field);
        var allowedOps = Object.keys(Catalog.OPERATORS).filter(function (op) {
          var effectiveType = filter.scale === "percentile" ? "number" : (field ? field.type : "number");
          return Catalog.OPERATORS[op].types.indexOf(effectiveType) !== -1;
        });

        return el("div", { class: "q-filter-row" }, [
          labeled("Feld", fieldSelect(filter.field, function (v) {
            filter.field = v;
            var f = Catalog.field(v);
            if (filter.scale === "percentile" && !f.percentileAvailable) filter.scale = "raw";
            if (f.type !== "number" && filter.scale === "raw") {
              filter.operator = "eq";
              filter.value = (f.values && f.values[0]) || "";
            } else if (typeof filter.value !== "number") {
              filter.operator = "gte"; filter.value = 0;
            }
            run();
          })),
          labeled("Skala", simpleSelect(
            [["raw", "Rohwert"]].concat(field && field.percentileAvailable ? [["percentile", "Perzentil"]] : []),
            filter.scale, function (v) {
              filter.scale = v;
              if (v === "percentile" && typeof filter.value !== "number") { filter.value = 80; filter.operator = "gte"; }
              run();
            })),
          labeled("Operator", simpleSelect(allowedOps.map(function (op) { return [op, Catalog.OPERATORS[op].label]; }),
            filter.operator, function (v) {
              filter.operator = v;
              if (v === "between" && !Array.isArray(filter.value)) filter.value = [0, 100];
              if (v !== "between" && Array.isArray(filter.value) && v !== "in" && v !== "notIn") filter.value = filter.value[0];
              if ((v === "in" || v === "notIn") && !Array.isArray(filter.value)) filter.value = [filter.value];
              run();
            })),
          labeled("Wert", valueControl(filter)),
          el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", "aria-label": "Regel entfernen", text: "Entfernen",
            onclick: function () { state.query.filters.splice(index, 1); run(); } })
        ]);
      }

      function valueControl(filter) {
        var field = Catalog.field(filter.field);
        if (filter.scale === "raw" && field && field.type === "enum" && filter.operator !== "in" && filter.operator !== "notIn") {
          return simpleSelect((field.values || []).map(function (v) { return [v, v]; }), filter.value, function (v) {
            filter.value = v; run();
          });
        }
        var input = el("input", {
          class: "q-input", type: "text",
          value: Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value),
          onchange: function () {
            var raw = input.value.trim();
            if (filter.operator === "in" || filter.operator === "notIn") {
              filter.value = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
            } else if (filter.operator === "between") {
              filter.value = raw.split(",").map(function (s) { return parseFloat(s.trim()); });
            } else if (filter.scale === "percentile" || (field && field.type === "number")) {
              var n = parseFloat(raw.replace(",", "."));
              filter.value = Number.isFinite(n) ? n : raw;
            } else {
              filter.value = raw;
            }
            run();
          }
        });
        return input;
      }

      /* --------------------------------------------------------- VUQL */
      function buildVuql() {
        var textarea = el("textarea", {
          class: "q-textarea", id: "q-vuql", spellcheck: "false",
          "aria-label": "VUQL-Abfrage", text: VUQL.serialize(state.query)
        });
        var status = el("p", { class: "q-note", style: "margin:8px 0 0" });

        return C.disclosure("VUQL — lesbare Darstellung derselben Abfrage", [
          el("p", { class: "q-note", text:
            "VUQL ist teilbar und versionierbar. Es ist nicht die interne Wahrheit: geparst wird nach JSON-AST, " +
            "und nur ein gueltiger AST wird ausgefuehrt." }),
          textarea,
          el("div", { class: "q-btn-row", style: "margin-top:10px" }, [
            el("button", { class: "q-btn q-btn--sm", type: "button", text: "VUQL uebernehmen", onclick: function () {
              var parsed = VUQL.parse(textarea.value);
              if (!parsed.ok) {
                status.textContent = "Nicht uebernommen: " + parsed.errors.map(function (e) {
                  return (e.line ? "Zeile " + e.line + ": " : "") + e.message;
                }).join(" · ");
                status.style.color = "var(--red-ink)";
                return;
              }
              state.query = parsed.query;
              run();
            }}),
            el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "Aus Regeln neu erzeugen", onclick: function () {
              textarea.value = VUQL.serialize(state.query);
              status.textContent = "";
            }})
          ]),
          status
        ], true);
      }

      /* ------------------------------------------------------ Ergebnis */
      function buildResult(data) {
        var res = state.result;
        var head = el("div", { class: "q-section-head" }, [
          el("div", {}, [
            el("h2", { class: "q-h2", text: S.num(res.matchedCount, 0) + " Treffer" }),
            el("p", { text: "Universum " + S.num(res.universeSize, 0) + " Titel · Modellstand " + S.formatDate(res.asOf) +
                            (res.truncated ? " · angezeigt: " + res.returnedCount : "") })
          ]),
          el("div", { class: "q-btn-row" }, [
            el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button",
              text: state.view === "rows" ? "Spaltenansicht" : "Kartenansicht",
              onclick: function () { state.view = state.view === "rows" ? "table" : "rows"; run(); } }),
            el("a", { class: "q-btn q-btn--sm", href: S.BASE + "strategies/builder/?fromScreen=1",
              text: "Als Strategie weiterbauen" })
          ])
        ]);

        var body = res.rows.length === 0
          ? S.stateBox("Keine Treffer",
              "Kein Wertpapier im Modelluniversum erfuellt alle Regeln gleichzeitig. Fehlende Daten erfuellen " +
              "grundsaetzlich keinen Filter — ein Unternehmen ohne ROIC gilt nicht automatisch als ROIC ≥ 10 %.", "empty")
          : (state.view === "table" ? resultTable(res.rows) : C.stockList(res.rows, { ranked: true }));

        var interp = el("div", { class: "q-card q-card--flat", style: "margin-top:18px" }, [
          el("h3", { class: "q-h3", style: "margin-bottom:10px", text: "So wurde die Abfrage gelesen" }),
          el("dl", { class: "q-kv" }, [].concat.apply([], Query.describeQuery(state.query).filters.map(function (f, i) {
            return [el("dt", { text: "Regel " + (i + 1) }), el("dd", { text: f })];
          })).concat([
            el("dt", { text: "Sortierung" }), el("dd", { text: Query.describeQuery(state.query).sort.join(", ") }),
            el("dt", { text: "Universum" }), el("dd", { text: Query.describeQuery(state.query).universe }),
            el("dt", { text: "Abfrage-Hash" }), el("dd", { text: res.queryHash })
          ]))
        ]);

        return [head, body, interp];
      }

      function resultTable(rows) {
        var columns = [
          { id: "ticker", label: "Ticker" },
          { id: "quantScore", label: "Quant" },
          { id: "qualityScore", label: "Quality" },
          { id: "momentumScore", label: "Momentum" },
          { id: "growthScore", label: "Growth" },
          { id: "valueScore", label: "Value" },
          { id: "riskScore", label: "Risk" },
          { id: "marketCap", label: "Market Cap" },
          { id: "revenueGrowth", label: "Umsatzwachstum" },
          { id: "fcfYield", label: "FCF-Rendite" },
          { id: "distanceTo52wHigh", label: "Abstand 52W" },
          { id: "coverage", label: "Coverage" }
        ];
        var thead = el("tr", {}, columns.map(function (c) { return el("th", { scope: "col", text: c.label }); }));
        var tbody = rows.map(function (r) {
          return el("tr", {}, columns.map(function (c) {
            if (c.id === "ticker") {
              return el("td", {}, [el("a", { href: S.BASE + "stock/?ticker=" + r.ticker, text: r.ticker, title: r.name })]);
            }
            var v = r[c.id];
            if (c.id === "coverage") {
              return el("td", { class: Number.isFinite(v) ? null : "na", text: Number.isFinite(v) ? Math.round(v * 100) + " %" : "–" });
            }
            var isScore = /Score$/.test(c.id);
            return el("td", {
              class: Number.isFinite(v) ? null : "na",
              text: Number.isFinite(v) ? (isScore ? S.num(v, 0) : S.fmt(c.id, v)) : "–"
            });
          }));
        });
        return el("div", { class: "q-table-wrap" }, [
          el("table", { class: "q-table" }, [
            el("thead", {}, [thead]),
            el("tbody", {}, tbody)
          ])
        ]);
      }

      run();
    }
  });

  /* ------------------------------------------------------------- Helfer */
  function labeled(label, control) {
    return el("div", { class: "q-field" }, [el("label", { text: label }), control]);
  }

  function fieldSelect(value, onChange, filterFn) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.value); } });
    var byCategory = {};
    Catalog.FIELD_LIST.filter(function (f) { return !filterFn || filterFn(f); }).forEach(function (f) {
      (byCategory[f.category] || (byCategory[f.category] = [])).push(f);
    });
    var CATEGORY_LABEL = {
      reference: "Stammdaten", market: "Markt", quality: "Quality", momentum: "Momentum",
      value: "Value", growth: "Growth", risk: "Risk", income: "Ausschuettung", score: "Scores"
    };
    Object.keys(byCategory).forEach(function (cat) {
      var group = el("optgroup", { label: CATEGORY_LABEL[cat] || cat });
      byCategory[cat].forEach(function (f) {
        group.appendChild(el("option", { value: f.id, text: f.label, selected: f.id === value ? true : null }));
      });
      sel.appendChild(group);
    });
    return sel;
  }

  function simpleSelect(pairs, value, onChange) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.value); } });
    pairs.forEach(function (p) {
      sel.appendChild(el("option", { value: p[0], text: p[1], selected: String(p[0]) === String(value) ? true : null }));
    });
    return sel;
  }

  function validationBox(validation) {
    return el("div", { class: "q-state q-state--error" }, [
      el("b", { text: "Abfrage ist ungueltig und wurde nicht ausgefuehrt" }),
      el("ul", { style: "margin:6px 0 0;padding-left:20px" }, validation.errors.map(function (e) {
        return el("li", { text: e });
      }))
    ]);
  }

  function warningBox(warnings) {
    return el("div", { class: "q-mock-banner", style: "margin:0" }, [
      el("span", { class: "q-mock-dot" }),
      el("div", {}, [el("b", { text: "Hinweis zur Abfrage" }), el("span", { text: warnings.join(" · ") })])
    ]);
  }

  function persistQuery(query) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(query)); } catch (e) { /* privater Modus */ }
  }
  function restoreQuery() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Query.validate(parsed).valid) return parsed;
      }
    } catch (e) { /* ignorieren */ }
    return JSON.parse(JSON.stringify(DEFAULT_QUERY));
  }

  window.QuantScreenerStorageKey = STORAGE_KEY;
})();
