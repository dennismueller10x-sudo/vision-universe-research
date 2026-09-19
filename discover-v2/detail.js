/* Discover 2.0 is a view of the canonical Discover detail contract.
 * All series, source states, valuation and fundamental charts are rendered
 * by Discover 1.0's shared modules. This adapter only composes their DOM. */
(function (global) {
  "use strict";
  var V = global.VUDiscoverV2 = global.VUDiscoverV2 || {};
  var cleanup = null;
  var serial = 0;

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function disclose(content, label) {
    if (!content) return null;
    var box = node("details", "dv2-detail-disclosure");
    box.appendChild(node("summary", "", label));
    content.parentNode.insertBefore(box, content);
    box.appendChild(content);
    return box;
  }
  function render(root, detail, ctx) {
    dispose();
    root.replaceChildren();
    var page = node("article", "dv2-stock");
    root.appendChild(page);
    var hub = global.VUDiscover.LiveHub;
    var method = hub && (hub.live ? "live" : "subscribe");
    var original = method && hub[method];
    var unsubscribers = [], observer = null, disposed = false;
    cleanup = function () {
      if (disposed) return;
      disposed = true;
      if (observer) observer.disconnect();
      unsubscribers.forEach(function (unsubscribe) { unsubscribe(); });
    };
    /* The shared renderer subscribes synchronously but exposes no dispose.
     * Capture its existing subscription's disposer, never create another
     * subscription or leave the shared method replaced after render. Both
     * our route and the renderer may dispose; the returned guard is once-only. */
    if (original) hub[method] = function () {
      var unsubscribe = original.apply(hub, arguments), finished = false;
      var once = function () {
        if (finished) return;
        finished = true;
        if (typeof unsubscribe === "function") unsubscribe();
      };
      unsubscribers.push(once);
      return once;
    };
    try {
      global.VUDiscover.Detail.render(page, detail, ctx || {});
      compose(page, detail);
      observer = neutralCharts(page);
    } catch (error) {
      dispose();
      throw error;
    } finally {
      if (original) hub[method] = original;
    }
    return page;
  }
  function renderInstrument(root, detail, ctx) {
    dispose();
    root.replaceChildren();
    var page = node("article", "dv2-stock dv2-stock--identity");
    root.appendChild(page);
    global.VUDiscover.Detail.renderInstrument(page, detail, ctx || {});
    page.querySelectorAll(".dx-fade").forEach(function (n) { n.classList.add("in"); });
    return page;
  }
  function compose(page, detail) {
    var id = "dv2-stock-" + (++serial);
    var hero = page.querySelector(".dx-dhero");
    var chart = page.querySelector(".dx-chapter--chart");
    var journey = page.querySelector(".dx-chapter--journey");
    var valuation = page.querySelector(".dx-chapter--bewertung");
    var analysis = page.querySelector(".dx-analyse");
    page.querySelectorAll(".dx-fade").forEach(function (n) { n.classList.add("in"); });
    var back = page.querySelector(".dx-back");
    if (back) back.textContent = "← Aktien entdecken";

    /* Move the existing nodes, preserving their source values, live bindings
     * and listeners. The chart's own price is the sole price when loaded. */
    if (hero && chart) {
      var context = node("section", "dv2-stock-context");
      context.setAttribute("aria-label", "Was bei dieser Aktie auffällt");
      [".dx-dhero-story", ".dx-dhero-hook", ".dx-dhero-sigs", ".dx-zeitachse", ".dx-spanne"].forEach(function (selector) {
        var item = hero.querySelector(selector);
        if (item) context.appendChild(item);
      });
      if (context.textContent.trim()) chart.insertAdjacentElement("afterend", context);
      /* Decorative poster duplicates the interactive chart directly below. */
      var art = hero.querySelector(".dx-dhero-art");
      if (art) art.remove();
    }
    if (journey) {
      var kicker = journey.querySelector(".dx-kicker");
      if (kicker) kicker.textContent = "Hinter dem Kurs";
      var story = journey.querySelector(".dx-story-list");
      var stage = journey.querySelector(".dx-journey--stage");
      if (story && stage) stage.insertAdjacentElement("afterend", story);
      var instruction = node("p", "dv2-detail-intro", "Umsatz, Gewinn oder Cashflow? Wähle eine Kennzahl und entdecke die Entwicklung.");
      if (stage) journey.insertBefore(instruction, stage);
    }
    disclose(page.querySelector(".dx-chapter--damals"), "Damals und heute im direkten Vergleich");
    if (analysis) analysis.open = false;

    var nav = node("nav", "dv2-stock-nav");
    nav.setAttribute("aria-label", "Auf dieser Aktienseite");
    [[chart, "Kurs"], [journey, "Unternehmen"], [valuation, "Bewertung"], [analysis, "Analyse"]].forEach(function (entry, index) {
      if (!entry[0]) return;
      entry[0].id = index === 1 ? "journey" : id + "-" + index;
      var button = node("button", "", entry[1]);
      button.type = "button";
      button.setAttribute("aria-controls", entry[0].id);
      button.addEventListener("click", function () {
        if (entry[0].tagName === "DETAILS") entry[0].open = true;
        var reduced = global.matchMedia("(prefers-reduced-motion: reduce)").matches;
        entry[0].scrollIntoView({ block: "start", behavior: reduced ? "instant" : "smooth" });
      });
      nav.appendChild(button);
    });
    if (chart) chart.insertAdjacentElement("afterend", nav);

    /* Shared fundamental renderers supply genuine tab controls. Complete
     * their keyboard interaction without changing a track or calculation. */
    page.querySelectorAll('[role="tablist"]').forEach(function (list, listIndex) {
      var tabs = Array.from(list.querySelectorAll('[role="tab"]'));
      var panel = list.nextElementSibling;
      if (panel) {
        panel.id = id + "-panel-" + listIndex;
        panel.setAttribute("role", "tabpanel");
      }
      function sync() {
        tabs.forEach(function (tab, index) {
          tab.id = id + "-tab-" + listIndex + "-" + index;
          tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
          if (panel) {
            tab.setAttribute("aria-controls", panel.id);
            if (!tab.tabIndex) panel.setAttribute("aria-labelledby", tab.id);
          }
        });
      }
      list.addEventListener("click", sync);
      list.addEventListener("keydown", function (event) {
        var index = tabs.indexOf(document.activeElement);
        if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        var next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
          (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click();
        tabs[next].focus();
        sync();
      });
      sync();
    });
  }
  function neutralCharts(page) {
    var chart = page.querySelector(".dx-chapter--chart");
    if (!chart) return null;
    function update() {
      chart.querySelectorAll("svg.dx-range-chart,svg.dx-micro--intraday").forEach(function (svg) {
        /* These are the canonical renderer's exact, unrounded scrub values.
         * Intraday __basis.close already uses previousClose when supplied,
         * so a session returning to yesterday's close is neutral even when
         * it differs from today's first point. Missing never means zero. */
        var points = svg.__punkte, basis = svg.__basis;
        if (!Array.isArray(points) || !points.length || !basis) return;
        var first = basis.close, last = points[points.length - 1].close;
        if (typeof first !== "number" || !Number.isFinite(first) || first <= 0 ||
            typeof last !== "number" || !Number.isFinite(last) || last !== first) return;
        svg.setAttribute("data-direction", "neutral");
        var wrap = svg.closest(".dx-range-chart-wrap,.dx-intraday");
        if (wrap) wrap.setAttribute("data-direction", "neutral");
      });
    }
    var observer = new MutationObserver(update);
    observer.observe(chart, { childList: true, subtree: true });
    update();
    return observer;
  }
  function dispose() { if (cleanup) cleanup(); cleanup = null; }
  V.Detail = { render: render, renderInstrument: renderInstrument, dispose: dispose };
})(window);
