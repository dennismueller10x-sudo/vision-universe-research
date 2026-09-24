/* The Discover stock page: a view of the canonical Discover detail contract.
 * All series, source states, valuation and fundamental charts are rendered
 * by the shared Discover modules (discover/ui, discover/engines). This adapter
 * only composes their DOM. */
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
    var unsubscribers = [], observers = [], disposed = false;
    cleanup = function () {
      if (disposed) return;
      disposed = true;
      observers.forEach(function (observer) { observer.disconnect(); });
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
      var fundamentalObserver = compose(page, detail);
      var chartObserver = neutralCharts(page);
      if (fundamentalObserver) observers.push(fundamentalObserver);
      if (chartObserver) observers.push(chartObserver);
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
    var business = Array.from(page.children).find(function (section) {
      var kicker = section.querySelector && section.querySelector(".dx-kicker");
      return kicker && kicker.textContent.trim() === "Das Unternehmen";
    });
    var riskGrid = page.querySelector(".dx-waage");
    var risks = riskGrid && riskGrid.closest("section");
    var overview = page.querySelector(".dx-30");
    if (overview) disclose(overview.closest("section"), "Die Aktie auf einen Blick");
    page.querySelectorAll(".dx-fade").forEach(function (n) { n.classList.add("in"); });
    var back = page.querySelector(".dx-back");
    if (back) back.textContent = "← Aktien entdecken";

    /* Move the existing nodes, preserving their source values, live bindings
     * and listeners. The chart's own price is the sole price when loaded. */
    if (hero && chart) {
      var context = node("section", "dv2-stock-context");
      context.setAttribute("aria-label", "Was bei dieser Aktie auffällt");
      context.appendChild(node("p", "dv2-detail-eyebrow", "Der Blick auf die Aktie"));
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
      if (kicker) kicker.textContent = "02 / Das Geschäft in Bewegung";
      var story = journey.querySelector(".dx-story-list");
      var stage = journey.querySelector(".dx-journey--stage");
      if (story && stage) stage.insertAdjacentElement("afterend", story);
      var instruction = node("p", "dv2-detail-intro", "Kennzahl wählen. Balken antippen, Geschäftsjahr vergleichen.");
      if (stage) journey.insertBefore(instruction, stage);
    }
    disclose(page.querySelector(".dx-chapter--damals"), "Damals und heute im direkten Vergleich");
    if (analysis) analysis.open = false;

    var research = node("section", "dv2-research-entry");
    research.appendChild(node("p", "dv2-detail-eyebrow", "Vom Kurs zum Unternehmen"));
    research.appendChild(node("h2", "", (detail.companyName || detail.symbol) + " verstehen."));
    var nav = node("nav", "dv2-stock-nav");
    nav.setAttribute("aria-label", "Auf dieser Aktienseite");
    [[business, "Geschäft", "Womit verdient es Geld?"], [journey, "Entwicklung", "Wie wächst es?"], [valuation, "Bewertung", "Was kostet die Aktie?"], [risks, "Risiken", "Was sollte ich hinterfragen?"]].forEach(function (entry, index) {
      if (!entry[0]) return;
      entry[0].id = index === 1 ? "journey" : id + "-" + index;
      var button = node("button", "");
      button.appendChild(node("span", "dv2-research-number", "0" + (index + 1)));
      button.appendChild(node("b", "", entry[1]));
      button.appendChild(node("small", "", entry[2]));
      button.type = "button";
      button.setAttribute("aria-controls", entry[0].id);
      button.addEventListener("click", function () {
        if (entry[0].tagName === "DETAILS") entry[0].open = true;
        var reduced = global.matchMedia("(prefers-reduced-motion: reduce)").matches;
        entry[0].scrollIntoView({ block: "start", behavior: reduced ? "instant" : "smooth" });
      });
      nav.appendChild(button);
    });
    research.appendChild(nav);
    if (nav.children.length) {
      var contextEnd = page.querySelector(".dv2-stock-context") || chart;
      if (contextEnd) contextEnd.insertAdjacentElement("afterend", research);
    }
    if (business) {
      business.classList.add("dv2-stock-business");
      var businessKicker = business.querySelector(".dx-kicker");
      if (businessKicker) businessKicker.textContent = "01 / Das Unternehmen";
    }
    if (valuation) {
      valuation.classList.add("dv2-stock-valuation");
      var valuationKicker = valuation.querySelector(".dx-kicker");
      if (valuationKicker) valuationKicker.textContent = "03 / Bewertung einordnen";
      var valuationTitle = valuation.querySelector("h2");
      if (valuationTitle) {
        var valuationQuestion = node("p", "dv2-valuation-question", valuationTitle.textContent);
        valuationTitle.textContent = "Bewertung";
        valuationTitle.insertAdjacentElement("afterend", valuationQuestion);
      }
      addValuationComponents(valuation, detail);
    }
    if (risks) {
      risks.classList.add("dv2-stock-risks");
      var risksKicker = risks.querySelector(".dx-kicker");
      if (risksKicker) risksKicker.textContent = "04 / Chancen und Risiken";
    }
    /* Existing contracts provide the neighbors and collection destinations.
     * Give them a visible new exploration stage without inventing a rank. */
    var next = page.querySelector(".dx-chapter--next");
    Array.from(page.children).forEach(function (section) {
      if (section.querySelector && section.querySelector(".dx-rail")) section.classList.add("dv2-stock-neighbors");
    });
    if (next) {
      next.classList.add("dv2-stock-next");
      var nextKicker = next.querySelector(".dx-kicker");
      if (nextKicker) nextKicker.textContent = "Weiter im Vision Universe";
    }
    if (!next) {
      next = node("section", "dv2-stock-next dx-chapter");
      next.appendChild(node("p", "dv2-detail-eyebrow", "Die nächste Perspektive"));
      next.appendChild(node("h2", "", "Eine Aktie weiter."));
      var foot = page.querySelector(".dx-foot");
      page.insertBefore(next, foot || null);
    }
    if (!next.querySelector('a[href^="#/einzeln/"]')) {
      var onward = node("a", "dx-btn", "Weiter swipen →");
      onward.href = "#/einzeln/" + encodeURIComponent(detail.universeId || "US_REAL");
      next.appendChild(onward);
    }

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
    return interactiveFundamentalBars(journey, detail);
  }
  function number(value, digits) {
    return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  /* O-12: die Waehrungsdarstellung kommt aus dem zentralen Contract.

     Diese Datei ist nach dem Merge des Currency Layers entstanden und
     brachte eine vierte eigene Skalenleiter mit - genau die Art von
     Wiederholung, die ONE DATA CORE abbauen soll. Der Regression Guard
     hat sie beim Zusammenfuehren gemeldet.

     Die Ausgabe bleibt Zeichen fuer Zeichen dieselbe: ueber 1 Mio. die
     gekuerzte Stufe mit einer Nachkommastelle, darunter der volle
     Betrag mit zweien. Die Leiter selbst ist zentral, die Anzahl der
     Nachkommastellen bleibt die Entscheidung dieser Flaeche. */
  function vuFormat(fn, value, currency, opts) {
    var F = (typeof VUFx !== "undefined" && VUFx && VUFx.Format) ? VUFx.Format : null;
    return (F && typeof F[fn] === "function") ? F[fn](value, currency || "USD", opts) : null;
  }
  /* Umgerechnet wird im Vertrag, formatiert hier.

     `when` ist der Stichtag der Bewertung. Ohne ihn bleibt der Betrag in
     Originalwaehrung - ein richtiger Dollarbetrag ist besser als ein
     Euro-Betrag zum falschen Kurs (§39). */
  function compactMoney(value, when) {
    var L = (typeof VUFx !== "undefined" && VUFx) ? VUFx.layer : null;
    var cur = "USD";
    if (L && when) {
      var m = L.money(value, "USD", when, "MARKET_PRICE");
      if (m && m.conversionAvailable && m.display && Number.isFinite(m.display.value)) {
        value = m.display.value;
        cur = m.display.currency;
      }
    }
    var zentral = Math.abs(value) >= 1e6
      ? vuFormat("formatCompact", value, cur, { numberLocale: "de-DE", decimals: 1 })
      : vuFormat("formatPrice", value, cur, { numberLocale: "de-DE", decimals: 2 });
    if (zentral) return zentral;
    /* Rueckfall ohne geladenen Core. Eine zentrale Formatierung, die
       eine Seite leer laesst, waere schlechter als die verteilte. */
    var abs = Math.abs(value), scale = 1, suffix = " $";
    if (abs >= 1e12) { scale = 1e12; suffix = " Bio. $"; }
    else if (abs >= 1e9) { scale = 1e9; suffix = " Mrd. $"; }
    else if (abs >= 1e6) { scale = 1e6; suffix = " Mio. $"; }
    return number(value / scale, scale === 1 ? 2 : 1) + suffix;
  }
  function addValuationComponents(section, detail) {
    var fundamentals = detail && detail.fundamentals;
    var valuation = fundamentals && fundamentals.valuation;
    if (!valuation || !valuation.available || section.querySelector(".dv2-valuation-components")) return;
    var cards = [];
    function add(label, value, note) {
      if (value === null || value === undefined || value === "" || !Number.isFinite(typeof value === "number" ? value : NaN)) return;
      cards.push({ label: label, value: value, note: note });
    }
    if (valuation.marketCap && Number.isFinite(valuation.marketCap.value))
      cards.push({ label: "Marktkapitalisierung",
                   text: compactMoney(valuation.marketCap.value, (detail && detail.asOf) || null),
                   note: "Kurs × ausgegebene Aktien" });
    if (valuation.pe) add("KGV", valuation.pe.value, "Kurs ÷ Gewinn je Aktie · " + valuation.pe.basis);
    if (valuation.ps) add("KUV", valuation.ps.value, "Marktwert ÷ Umsatz · " + valuation.ps.basis);
    if (valuation.pe && Number.isFinite(valuation.pe.value) && valuation.pe.value > 0)
      cards.push({ label: "Gewinnrendite", text: number(100 / valuation.pe.value, 1) + " %", note: "Gewinn je Aktie ÷ Kurs · " + valuation.pe.basis });
    if (valuation.context && Number.isFinite(valuation.context.peMedian))
      add("KGV Marktmedian", valuation.context.peMedian, "Breiter Markt · " + (valuation.context.peCount || 0).toLocaleString("de-DE") + " profitable Unternehmen");
    if (valuation.relative && Number.isFinite(valuation.relative.peVsMedian))
      add("KGV / Markt", valuation.relative.peVsMedian, valuation.relative.label || "Verhältnis zum breiten Markt");
    if (valuation.fcfYield) {
      var yieldValue = valuation.fcfYield.value;
      if (Number.isFinite(yieldValue) && yieldValue > 0)
        add("Marktwert / Free Cashflow", 1 / yieldValue, "Kehrwert der Free-Cashflow-Rendite · " + valuation.fcfYield.basis);
      if (Number.isFinite(yieldValue))
        cards.push({ label: "Free-Cashflow-Rendite", text: number(yieldValue * 100, 1) + " %", note: "Free Cashflow ÷ Marktwert · " + valuation.fcfYield.basis });
    }
    cards.forEach(function (card) {
      if (!card.text) card.text = number(card.value, 1) + "×";
    });
    if (!cards.length) return;
    var block = node("section", "dv2-valuation-components");
    block.setAttribute("aria-label", "Bewertungsbausteine");
    block.appendChild(node("h3", "", "Bewertungsbausteine"));
    block.appendChild(node("p", "", "Die wichtigsten Verhältnisse auf einen Blick. Jeder Baustein nutzt dieselben ausgelieferten Unternehmenszahlen wie die Detailanalyse."));
    var grid = node("div", "dv2-valuation-grid");
    cards.forEach(function (card) {
      var item = node("div", "dv2-valuation-card");
      item.appendChild(node("span", "", card.label));
      item.appendChild(node("b", "num", card.text));
      item.appendChild(node("small", "", card.note));
      grid.appendChild(item);
    });
    block.appendChild(grid);
    var tabs = section.querySelector(".dx-bewertung-tabs");
    section.insertBefore(block, tabs || section.querySelector(".dx-weitere") || null);
  }
  function journeyTrack(detail, trackId) {
    var tracks = detail && detail.fundamentals && detail.fundamentals.journey && detail.fundamentals.journey.tracks;
    if (!tracks || !trackId) return [];
    if (trackId.indexOf("margins.") === 0) return tracks.margins && tracks.margins[trackId.slice(8)] || [];
    return tracks[trackId] || [];
  }
  function selectedChange(first, current, margin) {
    if (!first || !current || typeof first.v !== "number" || typeof current.v !== "number") return null;
    if (margin) {
      var points = (current.v - first.v) * 100;
      return { text: (points >= 0 ? "+" : "−") + Math.abs(points).toFixed(1).replace(".", ",") + " Pp.", value: points };
    }
    if (first.v <= 0) return null;
    var change = current.v / first.v - 1;
    var percent = Math.abs(change * 100);
    var formatted = percent >= 1000 ? Math.round(percent).toLocaleString("de-DE") : percent.toFixed(0).replace(".", ",");
    return { text: (change >= 0 ? "+" : "−") + formatted + " %", value: change };
  }
  function interactiveFundamentalBars(journey, detail) {
    if (!journey) return null;
    var chart = journey.querySelector(".dx-journey-bild");
    if (!chart) return null;
    function selectBar(bar) {
      var bars = Array.from(chart.querySelectorAll(".dx-journey-bar"));
      var index = bars.indexOf(bar);
      if (index < 0) return;
      bars.forEach(function (candidate, candidateIndex) {
        var selected = candidateIndex === index;
        candidate.classList.toggle("is-selected", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      });
      chart.classList.add("has-bar-selection");
      var title = bar.querySelector("title");
      var match = title && title.textContent.match(/^GJ\s+([^:]+):\s*(.+)$/);
      var current = journey.querySelector(".dx-journey-nach");
      if (!match || !current) return;
      var value = current.querySelector("b"), year = current.querySelector("span");
      if (value) value.textContent = match[2];
      if (year) year.textContent = "GJ " + match[1];
      current.setAttribute("aria-live", "polite");
      var activeTab = journey.querySelector('.dx-journey-tab[aria-selected="true"]');
      var trackId = activeTab && activeTab.getAttribute("data-track");
      var points = journeyTrack(detail, trackId);
      var point = points[index], first = points[0];
      var delta = journey.querySelector(".dx-journey-delta");
      var change = selectedChange(first, point, trackId && trackId.indexOf("margins.") === 0);
      if (delta && change) {
        var deltaValue = delta.querySelector("b"), deltaYears = delta.querySelector("span");
        if (deltaValue) deltaValue.textContent = change.text;
        if (deltaYears) deltaYears.textContent = Math.max(0, point.fy - first.fy) + " Jahre";
        delta.className = "dx-journey-delta num " + (change.value > 0 ? "up" : change.value < 0 ? "down" : "");
      }
    }
    function enhance() {
      chart.querySelectorAll(".dx-journey-wert").forEach(function (label) { label.remove(); });
      var svg = chart.querySelector(".dx-journey-svg");
      if (svg && !svg.hasAttribute("data-year-selection")) {
        svg.setAttribute("role", "group");
        svg.setAttribute("aria-label", (svg.getAttribute("aria-label") || "Jahresreihe") + ". Geschäftsjahr auswählen.");
        svg.setAttribute("data-year-selection", "true");
      }
      var bars = Array.from(chart.querySelectorAll(".dx-journey-bar"));
      if (!bars.length) return;
      bars.forEach(function (bar, index) {
        var title = bar.querySelector("title");
        bar.setAttribute("role", "button");
        bar.setAttribute("tabindex", "0");
        bar.setAttribute("aria-label", (title ? title.textContent : "Geschäftsjahr " + (index + 1)) + " auswählen");
      });
      selectBar(bars.find(function (bar) { return bar.classList.contains("is-selected"); }) || bars[bars.length - 1]);
    }
    chart.addEventListener("click", function (event) {
      var bar = event.target.closest && event.target.closest(".dx-journey-bar");
      if (!bar || !chart.contains(bar)) return;
      selectBar(bar);
      if (bar.focus) bar.focus();
    });
    chart.addEventListener("keydown", function (event) {
      var bar = event.target.closest && event.target.closest(".dx-journey-bar");
      if (!bar || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      selectBar(bar);
    });
    var observer = new MutationObserver(enhance);
    observer.observe(chart, { childList: true, subtree: true });
    enhance();
    return observer;
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
      chart.querySelectorAll("svg.dx-micro--intraday").forEach(scaleIntradayFromPreviousClose);
    }
    var observer = new MutationObserver(update);
    observer.observe(chart, { childList: true, subtree: true });
    update();
    return observer;
  }
  function scaleIntradayFromPreviousClose(svg) {
    if (svg.hasAttribute("data-v2-previous-close-scale")) return;
    var points = svg.__punkte, basis = svg.__basis;
    if (!Array.isArray(points) || points.length < 2 || !basis || !Number.isFinite(basis.previousClose)) return;
    var view = String(svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
    if (view.length !== 4 || view.some(function (n) { return !Number.isFinite(n); })) return;
    var height = view[3], base = basis.previousClose;
    var values = points.map(function (point) { return point.close; }).filter(Number.isFinite);
    if (values.length < 2) return;
    var low = Math.min.apply(null, values.concat([base]));
    var high = Math.max.apply(null, values.concat([base]));
    if (low === high) return;
    /* No artificial range below a wholly positive session (or above a
       wholly negative one): 0 % is the real previous close and becomes
       the visual origin. A crossing session still shows both sides. */
    var span = high - low;
    if (low < base && high > base) {
      low -= span * .025; high += span * .025;
    } else if (high <= base) low -= span * .025;
    else high += span * .025;
    var top = basis.padTop, bottom = height - basis.padBottom;
    var y = function (value) { return bottom - ((value - low) / (high - low)) * (bottom - top); };
    points.forEach(function (point) { point.y = y(point.close); });
    var path = points.map(function (point, index) { return (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1); }).join(" ");
    var line = svg.querySelector(".dx-art-line");
    if (line) line.setAttribute("d", path);
    var fill = svg.querySelector(".dx-art-fill");
    if (fill) fill.setAttribute("d", path + " L" + points[points.length - 1].x.toFixed(1) + " " + y(base).toFixed(1) + " L" + points[0].x.toFixed(1) + " " + y(base).toFixed(1) + " Z");
    var baseLine = svg.querySelector(".dx-art-base");
    if (baseLine) { baseLine.setAttribute("y1", y(base).toFixed(1)); baseLine.setAttribute("y2", y(base).toFixed(1)); }
    var last = points[points.length - 1];
    svg.querySelectorAll(".dx-art-node,.dx-art-node-ring").forEach(function (circle) {
      circle.setAttribute("cy", last.y.toFixed(1));
    });
    var lastLabel = svg.querySelector(".dx-micro-price");
    if (lastLabel) lastLabel.setAttribute("y", (last.y + 3.5).toFixed(1));
    var baseLabel = svg.querySelector(".dx-micro-base");
    if (baseLabel) baseLabel.setAttribute("y", (y(base) + 3.5).toFixed(1));
    svg.setAttribute("data-v2-previous-close-scale", "true");
    var wrap = svg.closest(".dx-intraday");
    if (wrap) wrap.setAttribute("data-v2-scale", "previous-close");
  }
  function dispose() { if (cleanup) cleanup(); cleanup = null; }
  V.Detail = { render: render, renderInstrument: renderInstrument, dispose: dispose };
})(window);
