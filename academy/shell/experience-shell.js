/* =========================================================================
   VISION UNIVERSE ACADEMY — Experience Shell (experience-shell.js)

   Wiederverwendbare UI-Bausteine fuer jede Academy Experience: Controls
   (Slider+Stepper), Live-Metrics, Evidence-Tags, Waterfall-/Bridge-Chart,
   Methodology/Sources-Panel, Related-Concepts-Chips und ein einfacher
   Scrollytelling-Helper. Enthaelt KEINE Berechnungslogik (die lebt in
   academy/engines/*) und KEINE experience-spezifischen redaktionellen
   Texte (die leben in den jeweiligen data.json-Dateien).
   ========================================================================= */
(function (global) {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  // ---- Formatting ---------------------------------------------------------
  function fmtCurrency(v, opts) {
    opts = opts || {};
    if (typeof v !== "number" || !isFinite(v)) return "—";
    var digits = opts.digits != null ? opts.digits : 0;
    var s = Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    var sign = v < 0 ? "−" : (opts.forceSign ? "+" : "");
    return sign + (opts.unit || "") + s;
  }
  function fmtPct(v, digits) {
    if (typeof v !== "number" || !isFinite(v)) return "—";
    digits = digits == null ? 1 : digits;
    return (v * 100).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + " %";
  }

  // ---- Control: Slider + Stepper + numeric readout (mobile-first) --------
  // config: { label, value, min, max, step, format(v), onChange(v), hint }
  function createControl(config) {
    var value = config.value;
    var wrap = el("div", { class: "vu-a-control" });
    var head = el("div", { class: "vu-a-control-head" });
    var label = el("span", { class: "vu-a-control-label", text: config.label });
    var valueEl = el("span", { class: "vu-a-control-value" });
    head.appendChild(label);
    head.appendChild(valueEl);

    var row = el("div", { class: "vu-a-control-row" });
    var minus = el("button", { class: "vu-a-stepper", type: "button", "aria-label": "Verringern", text: "−" });
    var slider = el("input", {
      class: "vu-a-slider", type: "range",
      min: String(config.min), max: String(config.max), step: String(config.step),
      value: String(value), "aria-label": config.label
    });
    var plus = el("button", { class: "vu-a-stepper", type: "button", "aria-label": "Erhöhen", text: "+" });
    row.appendChild(minus); row.appendChild(slider); row.appendChild(plus);

    wrap.appendChild(head);
    wrap.appendChild(row);
    if (config.hint) wrap.appendChild(el("p", { class: "vu-a-control-hint", text: config.hint }));

    function render() {
      valueEl.textContent = config.format ? config.format(value) : String(value);
      slider.value = String(value);
    }
    function setValue(v, notify) {
      v = Math.min(config.max, Math.max(config.min, v));
      // Runden auf Step-Genauigkeit vermeidet Float-Drift bei wiederholtem +/-.
      var decimals = (String(config.step).split(".")[1] || "").length;
      v = parseFloat(v.toFixed(decimals));
      value = v;
      render();
      if (notify !== false && config.onChange) config.onChange(value);
    }
    minus.addEventListener("click", function () { setValue(value - config.step); });
    plus.addEventListener("click", function () { setValue(value + config.step); });
    slider.addEventListener("input", function () { setValue(parseFloat(slider.value)); });

    render();
    return { el: wrap, get: function () { return value; }, set: function (v) { setValue(v, false); } };
  }

  // ---- Evidence tag (FACT/MODEL/ASSUMPTION/ESTIMATE) ----------------------
  var EVIDENCE_LABEL = { FACT: "Fakt", MODEL: "Modellwert", ASSUMPTION: "Annahme", ESTIMATE: "Schätzung" };
  function createEvidenceTag(type) {
    return el("span", { class: "vu-a-evidence", "data-evidence": type, text: EVIDENCE_LABEL[type] || type });
  }

  // ---- Live metric tile ---------------------------------------------------
  function createMetric(label, valueText, tone) {
    var v = el("div", { class: "vu-a-metric-value" + (tone ? " is-" + tone : ""), text: valueText });
    return el("div", { class: "vu-a-metric" }, [
      el("div", { class: "vu-a-metric-label", text: label }),
      v
    ]);
  }

  // ---- Waterfall / bridge chart (SVG, accessible via aria-label) --------
  // items: [{ label, value, kind: 'total'|'increase'|'decrease' }]
  // 'total' bars are drawn from 0. 'increase'/'decrease' float between the
  // running cumulative total (research: Waterfall = "Woher kommt die Zahl?").
  function renderWaterfall(container, items, opts) {
    opts = opts || {};
    var width = opts.width || 520, height = opts.height || 240;
    var padTop = 18, padBottom = 34, padSide = 6;
    var plotH = height - padTop - padBottom;

    var cumulative = 0;
    var bars = items.map(function (item) {
      var startCum = cumulative;
      if (item.kind === "total") { cumulative = item.value; }
      else { cumulative += item.value; }
      return { item: item, from: item.kind === "total" ? 0 : startCum, to: item.kind === "total" ? item.value : cumulative };
    });
    var maxVal = Math.max.apply(null, bars.map(function (b) { return Math.max(b.from, b.to); }).concat([0]));
    var minVal = Math.min.apply(null, bars.map(function (b) { return Math.min(b.from, b.to); }).concat([0]));
    var range = (maxVal - minVal) || 1;
    function y(v) { return padTop + plotH - ((v - minVal) / range) * plotH; }

    var n = bars.length;
    var gap = 10;
    var barW = (width - padSide * 2 - gap * (n - 1)) / n;

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", "100%");
    svg.setAttribute("role", "img");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var ariaLabel = items.map(function (it) { return it.label + " " + Math.round(it.value); }).join(", ");
    svg.setAttribute("aria-label", opts.title ? opts.title + ": " + ariaLabel : ariaLabel);

    var baseline = document.createElementNS(svg.namespaceURI, "line");
    baseline.setAttribute("x1", padSide); baseline.setAttribute("x2", width - padSide);
    baseline.setAttribute("y1", y(0)); baseline.setAttribute("y2", y(0));
    baseline.setAttribute("stroke", "rgba(255,255,255,.14)");
    svg.appendChild(baseline);

    var baselineY = y(0);
    var animatedRects = [];
    bars.forEach(function (b, i) {
      var x = padSide + i * (barW + gap);
      var top = y(Math.max(b.from, b.to));
      var bottom = y(Math.min(b.from, b.to));
      var h = Math.max(2, bottom - top);
      var color = b.item.kind === "total"
        ? "var(--vu-acad-neutral)"
        : (b.item.value >= 0 ? "var(--vu-acad-positive)" : "var(--vu-acad-negative)");

      var rect = document.createElementNS(svg.namespaceURI, "rect");
      rect.setAttribute("class", "vu-a-chart-bar");
      // Startzustand an der Nulllinie — wird nach dem Einhängen ins DOM auf
      // die Zielposition gesetzt, damit die CSS-Transition greift (kleine,
      // informative 2D-Animation statt Deko-Effekt).
      rect.setAttribute("x", x); rect.setAttribute("y", baselineY);
      rect.setAttribute("width", barW); rect.setAttribute("height", 0);
      rect.setAttribute("rx", 4);
      rect.setAttribute("fill", color);
      var title = document.createElementNS(svg.namespaceURI, "title");
      title.textContent = b.item.label + ": " + fmtCurrency(b.item.value, { unit: opts.unit || "" });
      rect.appendChild(title);
      svg.appendChild(rect);
      animatedRects.push({ rect: rect, top: top, h: h });

      // Connector zwischen den Bars (typisches Waterfall-Merkmal)
      if (i > 0 && b.item.kind !== "total") {
        var prevX = padSide + (i - 1) * (barW + gap) + barW;
        var connY = y(b.from);
        var connector = document.createElementNS(svg.namespaceURI, "line");
        connector.setAttribute("x1", prevX); connector.setAttribute("x2", x);
        connector.setAttribute("y1", connY); connector.setAttribute("y2", connY);
        connector.setAttribute("stroke", "rgba(255,255,255,.2)");
        connector.setAttribute("stroke-dasharray", "3,3");
        svg.insertBefore(connector, rect);
      }

      var valueLabel = document.createElementNS(svg.namespaceURI, "text");
      valueLabel.setAttribute("x", x + barW / 2);
      valueLabel.setAttribute("y", top - 6);
      valueLabel.setAttribute("text-anchor", "middle");
      valueLabel.setAttribute("font-size", "10.5");
      valueLabel.setAttribute("fill", "#cfd2df");
      valueLabel.textContent = fmtCurrency(b.item.value, { unit: opts.unit || "", forceSign: b.item.kind !== "total" });
      svg.appendChild(valueLabel);

      var nameLabel = document.createElementNS(svg.namespaceURI, "text");
      nameLabel.setAttribute("x", x + barW / 2);
      nameLabel.setAttribute("y", height - padBottom + 16);
      nameLabel.setAttribute("text-anchor", "middle");
      nameLabel.setAttribute("font-size", "9.5");
      nameLabel.setAttribute("fill", "#8b90a3");
      if (b.item.shortLabel) {
        nameLabel.textContent = b.item.shortLabel;
      } else {
        var words = b.item.label.split(" ");
        nameLabel.textContent = words.length > 1 && b.item.label.length > 12 ? words[0] + "…" : b.item.label;
      }
      var fullTitle = document.createElementNS(svg.namespaceURI, "title");
      fullTitle.textContent = b.item.label;
      nameLabel.appendChild(fullTitle);
      svg.appendChild(nameLabel);
    });

    container.innerHTML = "";
    var wrap = el("div", { class: "vu-a-chart-wrap" });
    wrap.appendChild(svg);

    requestAnimationFrame(function () {
      animatedRects.forEach(function (r) {
        r.rect.setAttribute("y", r.top);
        r.rect.setAttribute("height", r.h);
      });
    });

    var summary = el("ul", { class: "vu-a-chart-summary" });
    items.forEach(function (it) {
      var li = el("li", { class: it.kind === "total" ? "is-total" : "" });
      li.appendChild(el("span", { text: it.label }));
      li.appendChild(el("b", { text: fmtCurrency(it.value, { unit: opts.unit || "", forceSign: it.kind !== "total" }) }));
      summary.appendChild(li);
    });
    wrap.appendChild(summary);
    container.appendChild(wrap);
    return wrap;
  }

  // ---- Methodology / Sources panel ---------------------------------------
  function renderMethodologyAndSources(container, methodology, sources) {
    container.innerHTML = "";
    var mPanel = el("div", { class: "vu-a-panel" }, [el("h3", { text: "Methodik" })]);
    var dl = el("dl", { class: "vu-a-def-list" });
    (methodology || []).forEach(function (m) {
      dl.appendChild(el("dt", { text: m.term }));
      dl.appendChild(el("dd", { text: m.detail }));
    });
    mPanel.appendChild(dl);
    container.appendChild(mPanel);

    var sPanel = el("div", { class: "vu-a-panel" }, [el("h3", { text: "Quellen" })]);
    var ul = el("ul", { class: "vu-a-source-list" });
    (sources || []).forEach(function (s) { ul.appendChild(el("li", { text: s })); });
    sPanel.appendChild(ul);
    container.appendChild(sPanel);
  }

  // ---- Related concepts: klickbare Chips + Detailkarte (Concept Registry) -
  // Ein Tap/Klick zeigt Definition, Formel und "Warum wichtig" direkt unter
  // den Chips — kein reines title-Tooltip mehr (auf Touch nicht bedienbar).
  function renderRelatedConcepts(container, conceptIds, registry) {
    container.innerHTML = "";
    var chips = el("div", { class: "vu-a-chips" });
    var detail = el("div", { id: "vu-a-concept-detail-mount" });
    var openId = null;

    function renderDetail(id) {
      detail.innerHTML = "";
      if (!id) return;
      var c = registry && registry.concepts && registry.concepts[id];
      if (!c) return;
      var card = el("div", { class: "vu-a-concept-detail" }, [
        el("h4", { text: c.title }),
        el("p", { text: c.shortDefinition })
      ]);
      if (c.formula) card.appendChild(el("p", { class: "vu-a-concept-formula", text: c.formula }));
      if (c.whyItMatters) card.appendChild(el("p", { class: "vu-a-concept-why", text: "Warum wichtig: " + c.whyItMatters }));
      detail.appendChild(card);
    }

    (conceptIds || []).forEach(function (id) {
      var c = registry && registry.concepts && registry.concepts[id];
      if (!c) return;
      var chip = el("button", { class: "vu-a-chip", type: "button", "aria-expanded": "false" }, [
        el("b", { text: c.title })
      ]);
      chip.addEventListener("click", function () {
        var wasOpen = openId === id;
        openId = wasOpen ? null : id;
        $all(".vu-a-chip", chips).forEach(function (b) { b.classList.remove("is-open"); b.setAttribute("aria-expanded", "false"); });
        if (!wasOpen) { chip.classList.add("is-open"); chip.setAttribute("aria-expanded", "true"); }
        renderDetail(openId);
      });
      chips.appendChild(chip);
    });
    container.appendChild(chips);
    container.appendChild(detail);
  }

  // ---- Scrollytelling: marks the Act nearest to viewport center active --
  function initScrollytelling(actEls, onChange) {
    if (!("IntersectionObserver" in global)) {
      actEls.forEach(function (a) { a.classList.add("is-active"); });
      return;
    }
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      var best = null, bestRatio = 0;
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
          bestRatio = entry.intersectionRatio; best = entry.target;
        }
      });
      if (best && best !== current) {
        current = best;
        actEls.forEach(function (a) { a.classList.toggle("is-active", a === best); });
        if (onChange) onChange(best);
      }
    }, { threshold: [.2, .4, .6, .8], rootMargin: "-10% 0px -35% 0px" });
    actEls.forEach(function (a) { io.observe(a); });
  }

  // ---- World/Concept icon badges (kleine 2D-Glyphen statt Textwand) ------
  // Ein Icon pro World (siehe academy/data/worlds.json "icon"-Feld). Bewusst
  // handgezeichnete, einfache Linien-Icons statt einer externen Icon-Library
  // (Repo hat keine npm-Abhaengigkeiten, siehe ARCHITECTURE.md).
  var ICON_PATHS = {
    "bar-chart": "M4 19V10 M10 19V5 M16 19V13 M4 19H20",
    "coins": "M8 8a5 3 0 1 0 8 0a5 3 0 1 0 -8 0 M3 8v5a5 3 0 0 0 8 2.9 M8 13a5 3 0 0 0 8 0v-5",
    "building": "M5 20V6l7-3 7 3v14 M5 20h14 M9 9h1 M14 9h1 M9 13h1 M14 13h1 M9 20v-4h6v4",
    "ledger": "M6 3h9l3 3v15H6z M15 3v3h3 M9 11h6 M9 14h6 M9 17h4",
    "target": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "globe": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9 M12 3c-2.5 2.6-3.8 5.7-3.8 9s1.3 6.4 3.8 9",
    "trend": "M4 17l5-6 4 3 7-9 M14 5h6v6",
    "pie": "M12 3a9 9 0 1 0 9 9h-9z",
    "brain": "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8 3 3 0 0 0 3 4.2 3 3 0 0 0 5-1M9 4a3 3 0 0 1 3 3v10a3 3 0 0 1-5 2.2M9 4v14",
    "magnifier": "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
    "briefcase": "M4 8h16v11H4z M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2 M4 13h16"
  };
  function createIcon(key, color) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", ICON_PATHS[key] || ICON_PATHS["bar-chart"]);
    path.setAttribute("stroke", color || "currentColor");
    path.setAttribute("stroke-width", "1.7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }
  function createIconBadge(key, accentVar) {
    var badge = el("div", { class: "vu-a-icon-badge", style: "--vu-world-accent: " + accentVar });
    badge.appendChild(createIcon(key, accentVar));
    return badge;
  }

  async function loadJSON(url) {
    var res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed: " + url + " (" + res.status + ")");
    return res.json();
  }

  global.AcademyShell = {
    $: $, $all: $all, el: el,
    fmtCurrency: fmtCurrency, fmtPct: fmtPct,
    createControl: createControl,
    createEvidenceTag: createEvidenceTag,
    createMetric: createMetric,
    renderWaterfall: renderWaterfall,
    renderMethodologyAndSources: renderMethodologyAndSources,
    renderRelatedConcepts: renderRelatedConcepts,
    initScrollytelling: initScrollytelling,
    createIcon: createIcon,
    createIconBadge: createIconBadge,
    loadJSON: loadJSON
  };
})(window);
