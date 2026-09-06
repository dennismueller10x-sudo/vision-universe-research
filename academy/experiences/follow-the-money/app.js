/* Follow the Money — experience-specific glue.
   Wires academy/engines/financial-model-engine.js (calculation) to
   academy/shell/experience-shell.js (UI primitives) using the content in
   ./data.json. No calculation logic and no hardcoded copy lives here. */
(function () {
  "use strict";
  var Shell = window.AcademyShell;
  var Engine = window.FinancialModelEngine;

  var FORMATTERS = {
    pct0: function (v) { return Shell.fmtPct(v, 0); },
    pct1: function (v) { return Shell.fmtPct(v, 1); },
    days: function (v) { return Math.round(v) + " Tage"; }
  };

  var state = { assumptions: Object.assign({}, Engine.DEFAULT_ASSUMPTIONS), tab: "income", model: null };

  function renderHero(data) {
    Shell.$("#hero-hook").textContent = data.hook;
  }

  function renderActs(data) {
    var mount = Shell.$("#acts-mount");
    mount.innerHTML = "";
    var actEls = data.acts.map(function (act) {
      var node = Shell.el("article", { class: "vu-a-act", id: "act-" + act.id });
      var labelRow = Shell.el("div", { class: "vu-a-act-label" }, [document.createTextNode(act.label + "  ")]);
      labelRow.appendChild(Shell.createEvidenceTag(act.evidence));
      node.appendChild(labelRow);
      node.appendChild(Shell.el("h3", { class: "vu-a-act-title", text: act.title }));
      act.body.forEach(function (p) { node.appendChild(Shell.el("p", { class: "vu-a-body", text: p })); });
      mount.appendChild(node);
      return node;
    });
    Shell.initScrollytelling(actEls);
  }

  function renderControls(data) {
    var mount = Shell.$("#controls-mount");
    mount.innerHTML = "";
    data.controls.forEach(function (cfg) {
      var range = Engine.ASSUMPTION_RANGES[cfg.key];
      var control = Shell.createControl({
        label: cfg.label,
        value: state.assumptions[cfg.key],
        min: range.min, max: range.max, step: range.step,
        format: FORMATTERS[cfg.format] || String,
        hint: cfg.hint,
        onChange: function (v) {
          state.assumptions[cfg.key] = v;
          recompute();
        }
      });
      mount.appendChild(control.el);
    });
  }

  function incomeWaterfallItems(model) {
    var is1 = model.year1.incomeStatement;
    return [
      { label: "Revenue", value: is1.revenue, kind: "total" },
      { label: "COGS", value: -is1.cogs, kind: "decrease" },
      { label: "Gross Profit", value: is1.grossProfit, kind: "total" },
      { label: "Opex", value: -is1.opex, kind: "decrease" },
      { label: "D&A", value: -is1.da, kind: "decrease" },
      { label: "Operating Income", value: is1.operatingIncome, kind: "total" },
      { label: "Taxes", value: -is1.taxes, kind: "decrease" },
      { label: "Net Income", value: is1.netIncome, kind: "total" }
    ];
  }

  function bridgeWaterfallItems(model) {
    var b = model.bridge;
    return [
      { label: "Net Income", value: b.netIncome, kind: "total" },
      { label: "+ D&A", value: b.da, kind: "increase" },
      { label: "+ SBC", value: b.sbc, kind: "increase" },
      { label: "− Δ Working Capital", value: -b.deltaWC, kind: "decrease" },
      { label: "Operating Cash Flow", value: b.cfo, kind: "total" },
      { label: "− CapEx", value: -b.capex, kind: "decrease" },
      { label: "Free Cash Flow", value: b.fcf, kind: "total" }
    ];
  }

  function renderChart() {
    var mount = Shell.$("#chart-mount");
    var items = state.tab === "income" ? incomeWaterfallItems(state.model) : bridgeWaterfallItems(state.model);
    Shell.renderWaterfall(mount, items, {
      title: state.tab === "income" ? "Income Statement" : "Cash Bridge",
      unit: ""
    });
  }

  function metricTone(key, v) {
    if (key === "cashConversion") return v == null ? "" : (v < 0.55 ? "negative" : v > 1.05 ? "positive" : "");
    return "";
  }

  function renderMetrics() {
    var mount = Shell.$("#metrics-mount");
    mount.innerHTML = "";
    var m = state.model.metrics;
    var cashGap = state.model.year1.incomeStatement.netIncome - state.model.bridge.fcf;
    var tiles = [
      ["Gross Margin", Shell.fmtPct(m.grossMarginPct, 1), ""],
      ["Operating Margin", Shell.fmtPct(m.operatingMarginPct, 1), ""],
      ["Net Margin", Shell.fmtPct(m.netMarginPct, 1), ""],
      ["FCF Margin", Shell.fmtPct(m.fcfMarginPct, 1), m.fcfMarginPct < 0 ? "negative" : ""],
      ["Cash Conversion", m.cashConversion == null ? "—" : m.cashConversion.toFixed(2) + "×", metricTone("cashConversion", m.cashConversion)],
      ["Net Income − FCF", Shell.fmtCurrency(cashGap, { forceSign: true }), cashGap > 0 ? "negative" : "positive"]
    ];
    tiles.forEach(function (t) { mount.appendChild(Shell.createMetric(t[0], t[1], t[2])); });
  }

  function recompute() {
    state.model = Engine.computeModel(state.assumptions);
    renderChart();
    renderMetrics();
  }

  function wireTabs() {
    Shell.$all(".vu-a-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.tab = btn.getAttribute("data-tab");
        Shell.$all(".vu-a-tab").forEach(function (b) {
          var active = b === btn;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", String(active));
        });
        renderChart();
      });
    });
  }

  function renderRelated(data, concepts) {
    Shell.renderRelatedConcepts(Shell.$("#related-mount"), data.relatedConcepts, concepts);
  }

  function renderIntegrations(data) {
    var mount = Shell.$("#integrations-mount");
    mount.innerHTML = "";
    data.visionUniverseIntegrations.forEach(function (it) {
      var card = Shell.el("a", { class: "vu-a-integration-card", href: it.href }, [
        Shell.el("b", { text: it.label }),
        Shell.el("span", { text: it.detail })
      ]);
      mount.appendChild(card);
    });
  }

  function renderMethodology(data) {
    Shell.renderMethodologyAndSources(Shell.$("#methodology-mount"), data.methodology, data.sources);
  }

  async function init() {
    var data = await Shell.loadJSON("./data.json");
    var concepts = await Shell.loadJSON("/academy/data/concepts.json").catch(function () { return null; });

    renderHero(data);
    renderActs(data);
    renderControls(data);
    recompute();
    wireTabs();
    renderRelated(data, concepts);
    renderIntegrations(data);
    renderMethodology(data);
  }

  init();
})();
