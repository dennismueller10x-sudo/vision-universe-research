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

  var state = { assumptions: Object.assign({}, Engine.DEFAULT_ASSUMPTIONS), tab: "income", model: null, profileId: "standard" };
  var controlInstances = {};

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

  // ---- Branchenprofile: illustrative Archetypen, keine echten Firmen -----
  function renderProfiles(data) {
    var mount = Shell.$("#profiles-mount");
    mount.innerHTML = "";
    (data.industryProfiles || []).forEach(function (profile) {
      var pill = Shell.el("button", {
        type: "button", class: "vu-a-profile-pill" + (profile.id === state.profileId ? " is-active" : ""),
        title: profile.description
      }, [document.createTextNode(profile.label)]);
      pill.addEventListener("click", function () { applyProfile(profile); });
      mount.appendChild(pill);
    });
    var note = Shell.$("#profiles-note-mount");
    if (!note) {
      note = Shell.el("p", { id: "profiles-note-mount", class: "vu-a-profile-note" });
      mount.parentNode.appendChild(note);
    }
    note.textContent = data.industryProfileNote || "";
  }

  function applyProfile(profile) {
    state.profileId = profile.id;
    state.assumptions = Object.assign({}, Engine.DEFAULT_ASSUMPTIONS, profile.assumptions || {});
    Object.keys(controlInstances).forEach(function (key) {
      controlInstances[key].set(state.assumptions[key]);
    });
    Shell.$all(".vu-a-profile-pill").forEach(function (p) {
      p.classList.toggle("is-active", p.textContent === profile.label);
    });
    recompute();
  }

  function renderControls(data) {
    var mount = Shell.$("#controls-mount");
    mount.innerHTML = "";
    controlInstances = {};
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
      controlInstances[cfg.key] = control;
      mount.appendChild(control.el);
    });
  }

  function incomeWaterfallItems(model) {
    var is1 = model.year1.incomeStatement;
    return [
      { label: "Umsatz", value: is1.revenue, kind: "total" },
      { label: "Herstellkosten (COGS)", shortLabel: "Herstellk.", value: -is1.cogs, kind: "decrease" },
      { label: "Bruttogewinn", value: is1.grossProfit, kind: "total" },
      { label: "Betriebskosten (Opex)", shortLabel: "Opex", value: -is1.opex, kind: "decrease" },
      { label: "Abschreibungen (D&A)", shortLabel: "D&A", value: -is1.da, kind: "decrease" },
      { label: "Operatives Ergebnis (EBIT)", shortLabel: "EBIT", value: is1.operatingIncome, kind: "total" },
      { label: "Steuern", value: -is1.taxes, kind: "decrease" },
      { label: "Jahresüberschuss", shortLabel: "Gewinn", value: is1.netIncome, kind: "total" }
    ];
  }

  function bridgeWaterfallItems(model) {
    var b = model.bridge;
    return [
      { label: "Jahresüberschuss", shortLabel: "Gewinn", value: b.netIncome, kind: "total" },
      { label: "+ Abschreibungen", shortLabel: "+ D&A", value: b.da, kind: "increase" },
      { label: "+ Aktienvergütung (SBC)", shortLabel: "+ SBC", value: b.sbc, kind: "increase" },
      { label: "− Δ Working Capital", shortLabel: "− ΔWC", value: -b.deltaWC, kind: "decrease" },
      { label: "Operativer Cashflow (CFO)", shortLabel: "CFO", value: b.cfo, kind: "total" },
      { label: "− Investitionen (CapEx)", shortLabel: "− CapEx", value: -b.capex, kind: "decrease" },
      { label: "Free Cash Flow", shortLabel: "FCF", value: b.fcf, kind: "total" }
    ];
  }

  function renderChart() {
    var mount = Shell.$("#chart-mount");
    var items = state.tab === "income" ? incomeWaterfallItems(state.model) : bridgeWaterfallItems(state.model);
    Shell.renderWaterfall(mount, items, {
      title: state.tab === "income" ? "Gewinn- und Verlustrechnung" : "Cashflow-Brücke",
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
      ["Bruttomarge", Shell.fmtPct(m.grossMarginPct, 1), ""],
      ["Operative Marge", Shell.fmtPct(m.operatingMarginPct, 1), ""],
      ["Nettomarge", Shell.fmtPct(m.netMarginPct, 1), ""],
      ["FCF-Marge", Shell.fmtPct(m.fcfMarginPct, 1), m.fcfMarginPct < 0 ? "negative" : ""],
      ["Cash Conversion", m.cashConversion == null ? "—" : m.cashConversion.toFixed(2) + "×", metricTone("cashConversion", m.cashConversion)],
      ["Gewinn − FCF", Shell.fmtCurrency(cashGap, { forceSign: true }), cashGap > 0 ? "negative" : "positive"]
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
    renderProfiles(data);
    renderControls(data);
    recompute();
    wireTabs();
    renderRelated(data, concepts);
    renderIntegrations(data);
    renderMethodology(data);
  }

  init();
})();
