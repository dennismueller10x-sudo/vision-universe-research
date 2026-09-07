/* Vision Universe Quant — Strategy Lab (/quant/strategies/builder).

   Power-User-Oberflaeche. Wichtig (§62): dieser Builder und die AI erzeugen
   exakt dasselbe StrategyDefinition-Objekt und benutzen denselben
   Validator. Es gibt keine zweite Strategy Engine — die AI ist nur ein
   weiterer Weg, dieses Objekt zu befuellen. */
(function () {
  "use strict";
  var S = window.QuantShell, C = window.QuantComponents, el = S.el;
  var Api = window.QuantApi, Strategy = window.VUStrategy, Query = window.VUQuery,
      Catalog = window.VUCatalog, VUQL = window.VUQL;

  var DRAFT_KEY = "vu.quant.builder.v1";
  var state = { definition: null, name: "", thesis: "", derivedFrom: null, parentVersion: null };

  S.page({
    nav: S.BASE + "strategies/",
    need: ["securities"],
    render: function (data, root) {
      return initialDefinition().then(function (init) {
        state.definition = init.definition;
        state.name = init.name;
        state.thesis = init.thesis;
        state.derivedFrom = init.derivedFrom;
        state.parentVersion = init.parentVersion;

        root.appendChild(el("header", {}, [
          el("p", { class: "q-kicker", text: "Strategy Lab" }),
          el("h1", { class: "q-h1", text: init.derivedFrom ? "Neue Version ableiten" : "Strategie bauen" }),
          el("p", { class: "q-lead", text: init.derivedFrom
            ? "Version " + init.parentVersion + " von „" + init.name + "“ bleibt unveraendert. Aenderungen erzeugen eine neue Version mit Begruendung."
            : "Universum, Filter, Faktorgewichte, Portfoliokonstruktion und Ausfuehrungsannahmen. " +
              "Das Ergebnis ist ein validiertes Regelwerk, kein gespeicherter Screener-Treffer." })
        ]));

        var formMount = el("div", { style: "margin-top:26px" });
        var previewMount = el("div", { style: "margin-top:26px" });
        root.appendChild(formMount);
        root.appendChild(previewMount);

        /* Zwei Aktualisierungsstufen. Ein Regler oder Zahlenfeld aendert nur
           Werte, nicht die Struktur des Formulars — wuerde dabei das ganze
           Formular neu gebaut, verlieren Regler und Eingabefelder mitten in
           der Bedienung ihren Fokus und lassen sich nicht mehr ziehen.
           Neu aufgebaut wird nur, wenn sich die Struktur wirklich aendert:
           Filter hinzugefuegt, entfernt, Feld, Operator oder Skala gewechselt. */
        function refresh(scope) {
          if (scope !== "preview") S.mount(formMount, buildForm(data, refresh));
          S.mount(previewMount, buildPreview(data, refresh));
          persistDraft();
        }
        refresh();
      });
    }
  });

  function initialDefinition() {
    var fromId = S.param("from");
    var versionParam = parseInt(S.param("version", ""), 10);

    if (fromId) {
      return Api.getStrategy(fromId).then(function (record) {
        if (!record) return blank();
        var version = Strategy.getVersion(record, Number.isFinite(versionParam) ? versionParam : undefined);
        return {
          definition: JSON.parse(JSON.stringify(version.definition)),
          name: record.strategy.name, thesis: record.strategy.thesis,
          derivedFrom: record.strategy.strategyId, parentVersion: version.version
        };
      });
    }

    /* Vom Screener uebernommen: die dort gebauten Regeln werden zu den
       Filtern der Strategie — dieselbe Filterstruktur, keine Uebersetzung. */
    if (S.param("fromScreen")) {
      try {
        var raw = localStorage.getItem("vu.quant.screen.v1");
        if (raw) {
          var query = JSON.parse(raw);
          if (Query.validate(query).valid) {
            var def = Strategy.createDefinition({ universe: query.universe, filters: query.filters });
            return Promise.resolve({ definition: def, name: "Strategie aus Screener",
              thesis: "Aus einer Screener-Auswahl abgeleitetes Regelwerk.", derivedFrom: null, parentVersion: null });
          }
        }
      } catch (e) { /* faellt auf den Entwurf zurueck */ }
    }

    try {
      var draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (draft && Strategy.validate(draft.definition).valid) return Promise.resolve(draft);
    } catch (e) { /* ignorieren */ }
    return Promise.resolve(blank());
  }

  function blank() {
    return {
      definition: Strategy.createDefinition({}),
      name: "Meine Quality-Momentum-Strategie",
      thesis: "Fundamental starke Unternehmen, deren Kursentwicklung die operative Qualitaet bestaetigt.",
      derivedFrom: null, parentVersion: null
    };
  }

  function persistDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        definition: state.definition, name: state.name, thesis: state.thesis,
        derivedFrom: state.derivedFrom, parentVersion: state.parentVersion
      }));
    } catch (e) { /* privater Modus */ }
  }

  /* -------------------------------------------------------------- Formular */
  function buildForm(data, refresh) {
    var def = state.definition;
    var card = el("div", { class: "q-card" });

    card.appendChild(el("h2", { class: "q-h3", style: "margin-bottom:14px", text: "Identitaet" }));
    card.appendChild(el("div", { class: "q-grid q-grid--2" }, [
      field("Name", textInput(state.name, function (v) { state.name = v; persistDraft(); })),
      field("Investment-Thesis", textInput(state.thesis, function (v) { state.thesis = v; persistDraft(); }))
    ]));

    card.appendChild(sectionTitle("Filter", "Vorauswahl des Universums. Fehlende Daten erfuellen keinen Filter."));
    def.filters.forEach(function (filter, index) {
      card.appendChild(filterRow(filter, index, refresh));
    });
    card.appendChild(el("div", { class: "q-btn-row", style: "margin-top:10px" }, [
      el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "+ Filter", onclick: function () {
        def.filters.push({ field: "marketCap", operator: "gte", value: 1000, scale: "raw" });
        refresh();
      }})
    ]));

    card.appendChild(sectionTitle("Ranking", "Gewichte muessen zusammen 100 % ergeben."));
    card.appendChild(rankingEditor(refresh));

    card.appendChild(sectionTitle("Portfoliokonstruktion", null));
    card.appendChild(el("div", { class: "q-grid q-grid--3" }, [
      field("Positionen", numberInput(def.portfolio.positions, 5, 200, 1, function (v) { def.portfolio.positions = v; refresh("preview"); })),
      field("Gewichtung", select([["equal", "Gleichgewichtet"], ["score", "Score-gewichtet"], ["volatility", "Volatilitaetsadjustiert"]],
        def.portfolio.weighting, function (v) { def.portfolio.weighting = v; refresh("preview"); })),
      field("Max. Einzelposition (%)", numberInput(round1(def.portfolio.maxPositionWeight * 100), 0.5, 100, 0.5,
        function (v) { def.portfolio.maxPositionWeight = v / 100; refresh("preview"); })),
      field("Max. Sektorgewicht (%)", numberInput(round1(def.portfolio.maxSectorWeight * 100), 5, 100, 1,
        function (v) { def.portfolio.maxSectorWeight = v / 100; refresh("preview"); })),
      field("Min. Market Cap (Mio. $)", numberInput(def.portfolio.minMarketCapM, 0, 1000000, 50,
        function (v) { def.portfolio.minMarketCapM = v; refresh("preview"); })),
      field("Min. Handelsvolumen (Mio. $/Tag)", numberInput(def.portfolio.minDollarVolumeM, 0, 1000, 1,
        function (v) { def.portfolio.minDollarVolumeM = v; refresh("preview"); }))
    ]));

    card.appendChild(sectionTitle("Rebalancing und Ausfuehrung",
      "Ein auf dem Schlusskurs berechnetes Signal wird fruehestens am Folgetag ausgefuehrt."));
    card.appendChild(el("div", { class: "q-grid q-grid--3" }, [
      field("Rebalancing", select([["monthly", "Monatlich"], ["quarterly", "Quartalsweise"]], def.rebalance,
        function (v) { def.rebalance = v; refresh("preview"); })),
      field("Ausfuehrung", select([["next_open", "Naechste Eroeffnung (T+1)"], ["next_close", "Naechster Schluss (T+1)"]],
        def.execution.timing, function (v) { def.execution.timing = v; refresh("preview"); })),
      field("Transaktionskosten (bps)", numberInput(def.execution.transactionCostsBps, 0, 200, 1,
        function (v) { def.execution.transactionCostsBps = v; refresh("preview"); })),
      field("Slippage (bps)", numberInput(def.execution.slippageBps, 0, 200, 1,
        function (v) { def.execution.slippageBps = v; refresh("preview"); }))
    ]));

    return card;
  }

  function sectionTitle(title, note) {
    return el("div", { style: "margin:24px 0 12px;padding-top:16px;border-top:1px solid var(--line)" }, [
      el("h2", { class: "q-h3", text: title }),
      note ? el("p", { class: "q-note", style: "margin:4px 0 0", text: note }) : null
    ]);
  }

  function filterRow(filter, index, refresh) {
    var fieldDef = Catalog.field(filter.field);
    var allowedOps = Object.keys(Catalog.OPERATORS).filter(function (op) {
      var type = filter.scale === "percentile" ? "number" : (fieldDef ? fieldDef.type : "number");
      return Catalog.OPERATORS[op].types.indexOf(type) !== -1;
    });
    return el("div", { class: "q-filter-row" }, [
      field("Feld", fieldSelect(filter.field, function (v) {
        filter.field = v;
        var f = Catalog.field(v);
        if (filter.scale === "percentile" && !f.percentileAvailable) filter.scale = "raw";
        if (f.type !== "number" && filter.scale === "raw") { filter.operator = "eq"; filter.value = (f.values || [""])[0]; }
        else if (typeof filter.value !== "number") { filter.operator = "gte"; filter.value = 0; }
        refresh();
      })),
      field("Skala", select([["raw", "Rohwert"]].concat(fieldDef && fieldDef.percentileAvailable ? [["percentile", "Perzentil"]] : []),
        filter.scale, function (v) {
          filter.scale = v;
          if (v === "percentile" && typeof filter.value !== "number") { filter.value = 80; filter.operator = "gte"; }
          refresh();
        })),
      field("Operator", select(allowedOps.map(function (op) { return [op, Catalog.OPERATORS[op].label]; }),
        filter.operator, function (v) {
          filter.operator = v;
          if (v === "between" && !Array.isArray(filter.value)) filter.value = [0, 100];
          if ((v === "in" || v === "notIn") && !Array.isArray(filter.value)) filter.value = [filter.value];
          if (v !== "between" && v !== "in" && v !== "notIn" && Array.isArray(filter.value)) filter.value = filter.value[0];
          refresh();
        })),
      field("Wert", valueControl(filter, refresh)),
      el("button", { class: "q-btn q-btn--ghost q-btn--sm", type: "button", text: "Entfernen",
        onclick: function () { state.definition.filters.splice(index, 1); refresh(); } })
    ]);
  }

  function valueControl(filter, refresh) {
    var fieldDef = Catalog.field(filter.field);
    if (filter.scale === "raw" && fieldDef && fieldDef.type === "enum" &&
        filter.operator !== "in" && filter.operator !== "notIn") {
      return select((fieldDef.values || []).map(function (v) { return [v, v]; }), filter.value,
        function (v) { filter.value = v; refresh("preview"); });
    }
    var input = el("input", { class: "q-input", type: "text",
      value: Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value),
      onchange: function () {
        var raw = input.value.trim();
        if (filter.operator === "in" || filter.operator === "notIn") {
          filter.value = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        } else if (filter.operator === "between") {
          filter.value = raw.split(",").map(function (s) { return parseFloat(s.trim().replace(",", ".")); });
        } else if (filter.scale === "percentile" || (fieldDef && fieldDef.type === "number")) {
          var n = parseFloat(raw.replace(",", "."));
          filter.value = Number.isFinite(n) ? n : raw;
        } else { filter.value = raw; }
        refresh("preview");
      }
    });
    return input;
  }

  function rankingEditor(refresh) {
    var def = state.definition;
    var wrap = el("div", {});
    Strategy.RANKABLE_FACTORS.forEach(function (factorId) {
      var entry = def.ranking.factors.filter(function (f) { return f.factor === factorId; })[0];
      var weight = entry ? Math.round(entry.weight * 100) : 0;
      var slider = el("input", {
        type: "range", min: "0", max: "100", step: "5", value: String(weight),
        style: "width:100%", "aria-label": S.FACTOR_LABEL[factorId] + " Gewicht",
        oninput: function () { valueLabel.textContent = slider.value + " %"; },
        onchange: function () {
          setFactorWeight(factorId, parseInt(slider.value, 10) / 100);
          updateSum();
          refresh("preview");
        }
      });
      var valueLabel = el("span", { style: "font-weight:800;min-width:48px;text-align:right", text: weight + " %" });
      wrap.appendChild(el("div", { style: "display:grid;grid-template-columns:110px 1fr auto;gap:12px;align-items:center;margin-bottom:8px" }, [
        el("span", { style: "font-size:13px;font-weight:700", text: S.FACTOR_LABEL[factorId] }),
        slider, valueLabel
      ]));
    });

    var sumNote = el("p", { class: "q-note", style: "margin-top:6px" });
    function updateSum() {
      var total = def.ranking.factors.reduce(function (acc, f) { return acc + f.weight; }, 0);
      var ok = Math.abs(total - 1) < 0.005;
      sumNote.style.color = ok ? "var(--muted-2)" : "var(--red-ink)";
      sumNote.textContent = "Summe: " + Math.round(total * 100) + " %" +
        (ok ? "" : " — muss 100 % ergeben, sonst wird die Strategie abgelehnt.");
    }
    updateSum();
    wrap.appendChild(sumNote);
    return wrap;
  }

  function setFactorWeight(factorId, weight) {
    var factors = state.definition.ranking.factors.filter(function (f) { return f.factor !== factorId; });
    if (weight > 0) factors.push({ factor: factorId, weight: weight });
    state.definition.ranking.factors = factors.sort(function (a, b) {
      return Strategy.RANKABLE_FACTORS.indexOf(a.factor) - Strategy.RANKABLE_FACTORS.indexOf(b.factor);
    });
  }

  /* --------------------------------------------------- Vorschau + Speichern */
  function buildPreview(data, refresh) {
    var def = state.definition;
    var validation = Strategy.validate(def);
    var wrap = el("div", {});

    if (!validation.valid) {
      wrap.appendChild(el("div", { class: "q-state q-state--error" }, [
        el("b", { text: "Strategie ist noch nicht gueltig" }),
        el("ul", { style: "margin:6px 0 0;padding-left:20px" },
          validation.errors.map(function (e) { return el("li", { text: e }); }))
      ]));
      return wrap;
    }

    if (validation.warnings.length) {
      wrap.appendChild(el("div", { class: "q-mock-banner" }, [
        el("span", { class: "q-mock-dot" }),
        el("div", {}, [el("b", { text: "Hinweis" }), el("span", { text: validation.warnings.join(" · ") })])
      ]));
    }

    /* Wie viele Titel erfuellen die Filter heute? Ueber dieselbe Query
       Engine, damit die Vorschau nicht von der Backtest-Auswahl abweicht. */
    var probe = Query.createQuery({
      universe: def.universe,
      filters: def.filters.concat(
        def.portfolio.minMarketCapM > 0 ? [{ field: "marketCap", operator: "gte", value: def.portfolio.minMarketCapM, scale: "raw" }] : [],
        def.portfolio.minDollarVolumeM > 0 ? [{ field: "avgDollarVolume", operator: "gte", value: def.portfolio.minDollarVolumeM, scale: "raw" }] : []
      ),
      sort: [{ field: "quantScore", direction: "desc" }],
      limit: def.portfolio.positions
    });
    var probeResult = Query.execute(probe, data.securities.rows, { asOf: data.meta.asOf });

    var described = Strategy.describe(def);
    wrap.appendChild(el("div", { class: "q-card q-card--flat" }, [
      el("h2", { class: "q-h3", style: "margin-bottom:12px", text: "So wurde die Strategie gelesen" }),
      el("dl", { class: "q-kv" }, [
        el("dt", { text: "Universum" }), el("dd", { text: described.universe }),
        el("dt", { text: "Filter" }), el("dd", { text: described.filters.length ? described.filters.join(" · ") : "keine" }),
        el("dt", { text: "Ranking" }), el("dd", { text: described.ranking.join(" · ") }),
        el("dt", { text: "Positionen" }), el("dd", { text: described.positions + ", " + described.weighting }),
        el("dt", { text: "Grenzen" }), el("dd", { text: "max. " + described.maxPositionWeight + " je Position, " + described.maxSectorWeight + " je Sektor" }),
        el("dt", { text: "Rebalancing" }), el("dd", { text: described.rebalance }),
        el("dt", { text: "Ausfuehrung" }), el("dd", { text: described.execution }),
        el("dt", { text: "Definition-Hash" }), el("dd", { text: Strategy.definitionHash(def) })
      ]),
      el("p", { class: "q-note", style: "margin-top:14px", text:
        probeResult.matchedCount + " von " + probeResult.universeSize + " Titeln erfuellen die Filter zum Modellstand " +
        S.formatDate(data.meta.asOf) + (probeResult.matchedCount < def.portfolio.positions
          ? " — weniger als die gewuenschten " + def.portfolio.positions + " Positionen." : ".") })
    ]));

    if (probeResult.rows.length) {
      wrap.appendChild(C.section("Kandidaten heute",
        "Diese Unternehmen erfuellen aktuell die Filter. Die endgueltige Auswahl trifft das Ranking im Backtest.",
        C.stockList(probeResult.rows.slice(0, 10), { ranked: true })));
    }

    wrap.appendChild(saveAndRun(data, validation));
    return wrap;
  }

  function saveAndRun(data, validation) {
    var wrap = el("div", { style: "margin-top:28px" });
    var reasonInput = el("input", { class: "q-input", type: "text",
      placeholder: state.derivedFrom ? "Warum diese Version? z. B. „Drawdown senken“" : "Initiale Version",
      value: state.derivedFrom ? "" : "Initiale Version" });
    var status = el("div", { style: "margin-top:14px" });

    var saveBtn = el("button", { class: "q-btn", type: "button",
      text: state.derivedFrom ? "Als neue Version speichern" : "Strategie speichern",
      onclick: function () {
        var reason = reasonInput.value.trim();
        if (state.derivedFrom && !reason) {
          S.mount(status, S.stateBox("Begruendung fehlt",
            "Jede neue Version braucht eine Begruendung — sonst laesst sich spaeter nicht nachvollziehen, warum sie existiert.", "error"));
          return;
        }
        var promise = state.derivedFrom
          ? Api.createStrategyVersion(state.derivedFrom, state.definition, reason, state.parentVersion)
          : Api.createStrategy({ name: state.name, thesis: state.thesis, origin: "builder",
                                 definition: state.definition, changeReason: reason || "Initiale Version" });
        promise.then(function (res) {
          if (!res.ok) { S.mount(status, S.stateBox("Nicht gespeichert", res.errors.join(" · "), "error")); return; }
          location.href = S.BASE + "strategies/?id=" + encodeURIComponent(res.record.strategy.strategyId);
        });
      }});

    var runBtn = el("button", { class: "q-btn q-btn--ghost", type: "button", text: "Direkt testen (ab 2011)",
      onclick: function () {
        runBtn.disabled = true; saveBtn.disabled = true;
        S.mount(status, el("div", { class: "q-state", "aria-live": "polite" }, [
          el("b", { text: "Backtest laeuft" }), el("span", { id: "bl-progress", text: "Modelluniversum wird erzeugt …" })
        ]));
        Api.runBacktest({
          definition: state.definition, strategyName: state.name,
          strategyId: state.derivedFrom, strategyVersion: state.parentVersion,
          startDate: "2011-01-03", endDate: data.meta.asOf,
          trustContext: { userOptimized: true }
        }, function (fraction, label) {
          var node = S.$("#bl-progress");
          if (node) node.textContent = Math.round(fraction * 100) + " % · " + label;
        }).then(function (res) {
          runBtn.disabled = false; saveBtn.disabled = false;
          if (!res.ok) { S.mount(status, S.stateBox("Backtest nicht ausgefuehrt", res.errors.join(" · "), "error")); return; }
          location.href = S.BASE + "backtests/?id=" + encodeURIComponent(res.backtestId);
        });
      }});

    S.mount(wrap, [
      el("h2", { class: "q-h3", style: "margin-bottom:12px", text: state.derivedFrom ? "Neue Version" : "Speichern" }),
      el("div", { class: "q-field" }, [
        el("label", { text: state.derivedFrom ? "Aenderungsgrund (Pflicht)" : "Notiz" }), reasonInput
      ]),
      el("div", { class: "q-btn-row", style: "margin-top:14px" }, [saveBtn, runBtn]),
      el("p", { class: "q-note", style: "margin-top:10px", text:
        "Eine als optimiert markierte Strategie ohne Out-of-Sample-Pruefung erreicht im Trust Score hoechstens 75 Punkte." }),
      status,
      C.disclosure("Strategy Definition (JSON)", [
        el("pre", { class: "q-code", text: JSON.stringify(state.definition, null, 2) })
      ]),
      C.disclosure("VUQL der Filter", [
        el("pre", { class: "q-code", text: VUQL.serialize(Query.createQuery({
          universe: state.definition.universe, filters: state.definition.filters,
          sort: [{ field: "quantScore", direction: "desc" }], limit: state.definition.portfolio.positions
        })) })
      ])
    ]);
    return wrap;
  }

  /* ---------------------------------------------------------------- Helfer */
  function field(label, control) { return el("div", { class: "q-field" }, [el("label", { text: label }), control]); }
  function textInput(value, onChange) {
    var input = el("input", { class: "q-input", type: "text", value: value, onchange: function () { onChange(input.value); } });
    return input;
  }
  function numberInput(value, min, max, step, onChange) {
    var input = el("input", { class: "q-input", type: "number", value: String(value), min: min, max: max, step: step,
      onchange: function () {
        var n = parseFloat(input.value.replace(",", "."));
        if (!Number.isFinite(n)) { input.value = String(value); return; }
        onChange(Math.min(max, Math.max(min, n)));
      }});
    return input;
  }
  function select(pairs, value, onChange) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.value); } });
    pairs.forEach(function (p) {
      sel.appendChild(el("option", { value: p[0], text: p[1], selected: String(p[0]) === String(value) ? true : null }));
    });
    return sel;
  }
  function fieldSelect(value, onChange) {
    var sel = el("select", { class: "q-select", onchange: function () { onChange(sel.value); } });
    var byCategory = {};
    Catalog.FIELD_LIST.forEach(function (f) { (byCategory[f.category] || (byCategory[f.category] = [])).push(f); });
    var LABELS = { reference: "Stammdaten", market: "Markt", quality: "Quality", momentum: "Momentum",
                   value: "Value", growth: "Growth", risk: "Risk", income: "Ausschuettung", score: "Scores" };
    Object.keys(byCategory).forEach(function (cat) {
      var group = el("optgroup", { label: LABELS[cat] || cat });
      byCategory[cat].forEach(function (f) {
        group.appendChild(el("option", { value: f.id, text: f.label, selected: f.id === value ? true : null }));
      });
      sel.appendChild(group);
    });
    return sel;
  }
  function round1(v) { return Math.round(v * 10) / 10; }
})();
