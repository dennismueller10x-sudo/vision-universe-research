/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/cards.js

   Die Bausteine der Discovery-Oberflaeche: Karte, Reihe, Abzeichen,
   Jahresspanne, Sparkline, Skelett, Leerzustand.

   Wiederverwendet QuantShell.el (dieselbe DOM-Hilfe wie alle Quant-Seiten,
   ohne innerHTML-Hintertuer) und QuantCharts fuer die Sparkline-Geometrie.
   Keine der beiden Dateien wird veraendert.

   EINE KARTE, EINE AUSSAGE

   Sie zeigt hoechstens drei Zahlen. Welche das sind, haengt davon ab, was
   fuer diesen Titel tatsaechlich ausgeliefert wird:

     mit Kursreihe    Preis, Tagesveraenderung, Sparkline
     ohne Kursreihe   Jahresspanne, Renditekennzahl, Fuehrerschaftsbalken

   Der zweite Fall ist in diesem Repository der haeufigere: absolute
   Kursniveaus realer Titel bleiben nach der Redistributionsregel zurueck.
   Eine Karte, die dann "0,00 $" zeigte, waere falsch; eine leere Karte
   waere nutzlos. Sie zeigt deshalb die Groessen, die erlaubt sind - und
   benennt die Luecke im Detail.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;
  var NS = "http://www.w3.org/2000/svg";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function valueOf(f) { return f && typeof f === "object" ? f.value : (isNum(f) ? f : null); }
  function statusOf(f) { return f && typeof f === "object" ? f.status : "SOURCE_MISSING"; }

  function pct(v, digits) {
    if (!isNum(v)) return "–";
    var d = digits === undefined ? (Math.abs(v * 100) < 1 ? 2 : 1) : digits;
    return (v >= 0 ? "+" : "") + (v * 100).toFixed(d) + " %";
  }
  function pctPoints(v, digits) {
    if (!isNum(v)) return "–";
    return (v >= 0 ? "+" : "") + v.toFixed(digits === undefined ? 2 : digits) + " %";
  }
  function money(v) {
    if (!isNum(v)) return "–";
    return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " $";
  }
  function toneClass(v) { return !isNum(v) ? "" : v > 0 ? "pos" : v < 0 ? "neg" : ""; }

  var STATUS_TEXT = {
    WITHHELD_REDISTRIBUTION: "Nicht auslieferbar (Anbieterkurs)",
    SOURCE_MISSING: "Quelle liefert den Wert nicht",
    INSUFFICIENT_HISTORY: "Zu wenig Historie",
    NOT_APPLICABLE: "Fuer dieses Instrument nicht anwendbar"
  };

  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      node.setAttribute(k, String(attrs[k]));
    });
    return node;
  }

  /* ---------------------------------------------------------- Sparkline */
  function sparkline(values, options) {
    options = options || {};
    var w = 200, h = 46, pad = 3;
    var node = svg("svg", { class: "d-spark", viewBox: "0 0 " + w + " " + h,
                            preserveAspectRatio: "none", role: "img",
                            "aria-label": options.label || "Kursverlauf der letzten 52 Wochen" });
    var clean = values.filter(isNum);
    if (clean.length < 3) return node;
    var lo = Math.min.apply(null, clean), hi = Math.max.apply(null, clean);
    if (lo === hi) { lo -= 1; hi += 1; }
    var up = clean[clean.length - 1] >= clean[0];
    var x = function (i) { return pad + (i / (values.length - 1)) * (w - pad * 2); };
    var y = function (v) { return h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2); };

    var d = "", started = false;
    values.forEach(function (v, i) {
      if (!isNum(v)) { started = false; return; }
      d += (started ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
      started = true;
    });
    if (!d) return node;
    node.appendChild(svg("path", { class: up ? "fill-up" : "fill-down",
      d: d + "L" + x(values.length - 1).toFixed(1) + " " + h + " L" + x(0).toFixed(1) + " " + h + " Z" }));
    node.appendChild(svg("path", { class: up ? "up" : "down", d: d.trim() }));
    return node;
  }

  /* -------------------------------------------------------- Jahresspanne

     Die Alternative zur Sparkline, wenn keine Kursreihe ausgeliefert wird.
     Sie entsteht ausschliesslich aus den beiden Abstaenden zum Hoch und
     zum Tief - also ohne ein einziges absolutes Kursniveau. */
  function rangeBar(metrics, options) {
    options = options || {};
    var high = metrics.distanceTo52wHigh;
    var low = metrics.distanceTo52wLow;
    var position = null;
    if (isNum(high) && isNum(low)) {
      var ratioHigh = 1 + high, ratioLow = 1 + low;
      if (ratioHigh > 0 && ratioLow > 0) {
        var lowOverHigh = ratioHigh / ratioLow;
        var span = 1 - lowOverHigh;
        if (span > 0) position = Math.max(0, Math.min(1, (ratioHigh - lowOverHigh) / span));
      }
    }
    if (position === null) {
      return el("div", { class: "d-range" }, [
        el("div", { class: "d-range-caption", text: "Jahresspanne nicht berechenbar" })
      ]);
    }
    var track = el("div", { class: "d-range-track", role: "img",
      "aria-label": "Position in der 52-Wochen-Spanne: " + Math.round(position * 100) + " Prozent" });
    track.appendChild(el("i", { class: "d-range-fill", style: "width:" + (position * 100).toFixed(1) + "%" }));
    track.appendChild(el("i", { class: "d-range-mark", style: "left:" + (position * 100).toFixed(1) + "%" }));
    return el("div", { class: "d-range" }, [
      track,
      el("div", { class: "d-range-labels" }, [
        el("span", { text: "52W TIEF" }),
        el("span", { text: options.hideHigh ? "" : "52W HOCH" })
      ])
    ]);
  }

  /* ------------------------------------------------------------ Abzeichen */
  function badge(b) {
    return el("span", { class: "d-badge d-badge--" + (b.tone || "muted"), title: b.detail || "" }, [
      document.createTextNode(b.label),
      b.detail ? el("small", { text: b.detail }) : null
    ]);
  }

  /* ------------------------------------------------------------ Kennzahl */
  function metric(label, value, options) {
    options = options || {};
    var body;
    if (options.missingReason) {
      body = el("b", { class: "d-na", text: "–", title: options.missingReason });
    } else {
      body = el("b", { class: options.tone || "", text: value });
    }
    return el("div", { class: "d-metric" + (options.small ? " d-metric--sm" : "") }, [
      el("span", { text: label }), body
    ]);
  }

  /**
   * Welche zwei Kennzahlen stehen unten auf der Karte?
   * Die Zeile bestimmt die erste - in "MOMENTUM LEADERS" interessiert die
   * 6-Monats-Rendite, in "NEW 52-WEEK HIGHS" der Abstand zum Hoch.
   */
  var PRIMARY_BY_ROW = {
    "new-52-week-highs": { key: "distanceTo52wHigh", label: "Zum 52W-Hoch", format: pct },
    "market-leaders": { key: "leadershipScore", label: "Leadership", format: score },
    "momentum-leaders": { key: "return6M", label: "6 Monate", format: pct },
    "breakout-watch": { key: "volumeSpikeRatio", label: "Volumen", format: times },
    "relative-strength": { key: "relativeStrength12M", label: "RS 12M", format: pct },
    "trend-quality": { key: "return3M", label: "3 Monate", format: pct },
    "sector-leaders": { key: "leadershipScore", label: "Leadership", format: score }
  };

  function score(v) { return isNum(v) ? String(Math.round(v)) : "–"; }
  function times(v) { return isNum(v) ? v.toFixed(1) + "x" : "–"; }

  /**
   * Eine Discovery Card.
   * @param {object} card   Contract.toCard-Form
   * @param {object} options {rowId, rank, universeId, onOpen}
   */
  function stockCard(card, options) {
    options = options || {};
    var m = card.metrics || {};
    var price = valueOf(card.price);
    var change = valueOf(card.changePercent);
    var hasSpark = Array.isArray(card.sparkline) && card.sparkline.length > 2;

    var visual = hasSpark
      ? el("div", { class: "d-visual" }, [sparkline(card.sparkline, { label: card.symbol + " Verlauf" })])
      : el("div", { class: "d-visual" }, [rangeBar(m)]);

    var primaryConfig = PRIMARY_BY_ROW[options.rowId] || PRIMARY_BY_ROW["market-leaders"];
    var primaryValue = m[primaryConfig.key];

    var left, right;
    if (isNum(price)) {
      left = metric("Kurs", money(price));
      right = metric(primaryConfig.label, primaryConfig.format(primaryValue),
                     { small: true, tone: primaryConfig.key === "distanceTo52wHigh" ? "" : toneClass(primaryValue) });
      if (isNum(change)) {
        right = metric("Heute", pctPoints(change), { small: true, tone: toneClass(change) });
      }
    } else {
      /* Der Abstand zum Jahreshoch ist fast immer negativ - ihn rot zu
         faerben hiesse, Normalzustand als Warnung zu zeichnen. */
      var neutralKeys = ["leadershipScore", "distanceTo52wHigh", "volumeSpikeRatio"];
      left = metric(primaryConfig.label, primaryConfig.format(primaryValue),
                    { tone: neutralKeys.indexOf(primaryConfig.key) !== -1 ? "" : toneClass(primaryValue),
                      missingReason: isNum(primaryValue) ? null
                        : (STATUS_TEXT[card.metricStatus && card.metricStatus[primaryConfig.key]] || "Nicht verfuegbar") });
      right = metric("12 Monate", pct(m.return12M), { small: true, tone: toneClass(m.return12M),
                     missingReason: isNum(m.return12M) ? null : "Zu wenig Historie" });
    }

    var node = el("a", {
      class: "d-card",
      href: "#/s/" + (options.universeId || "US_REAL") + "/" + card.symbol,
      "aria-label": card.symbol + (card.companyName ? " — " + card.companyName : "") + " oeffnen"
    }, [
      el("div", { class: "d-card-top" }, [
        el("div", { style: "min-width:0" }, [
          el("b", { class: "d-sym", text: card.symbol }),
          el("span", { class: "d-name",
                       text: card.companyName || card.sector || (card.exchange || "") })
        ]),
        options.rank ? el("span", { class: "d-rank", text: "#" + options.rank }) : null
      ]),
      el("div", { class: "d-badges" }, (card.badges || []).slice(0, 2).map(badge)),
      visual,
      el("div", { class: "d-metrics" }, [left, right])
    ]);

    if (isNum(m.leadershipScore)) {
      node.appendChild(el("div", { class: "d-meter-row" }, [
        el("span", { text: "LEAD" }),
        el("div", { class: "d-meter", role: "img",
                    "aria-label": "Leadership Score " + Math.round(m.leadershipScore) + " von 100" }, [
          el("i", { style: "width:" + Math.max(2, Math.min(100, m.leadershipScore)).toFixed(0) + "%" })
        ]),
        el("span", { text: Math.round(m.leadershipScore) + (isNum(m.leadershipPercentile)
          ? " · P" + Math.round(m.leadershipPercentile) : "") })
      ]));
    }
    if (card.dataMode === "mock") {
      node.appendChild(el("span", { class: "d-mock-tag", text: "Modelltitel" }));
    }
    return node;
  }

  /* ------------------------------------------------------------- Reihe */
  function skeletonRail(count) {
    var rail = el("div", { class: "d-rail" });
    for (var i = 0; i < (count || 6); i++) rail.appendChild(el("div", { class: "d-skeleton" }));
    return rail;
  }

  function emptyState(title, message) {
    return el("div", { class: "d-empty" }, [el("b", { text: title }), document.createTextNode(message)]);
  }

  function notice(title, message, variant) {
    return el("div", { class: "d-notice" + (variant === "info" ? " d-notice--info" : "") }, [
      el("span", { class: "d-dot" }),
      el("div", {}, [title ? el("b", { text: title }) : null, document.createTextNode(message)])
    ]);
  }

  /**
   * Eine Discovery-Reihe mit horizontalem Rail.
   * @param {object} row     Zeilen-Payload
   * @param {object} options {universeId, limit, showMore}
   */
  function discoveryRow(row, options) {
    options = options || {};
    var head = el("div", { class: "d-row-head" }, [
      el("div", { class: "d-row-title" }, [
        el("h2", { text: row.title }),
        row.subtitle ? el("p", { text: row.subtitle }) : null
      ]),
      el("div", { class: "d-row-actions" }, [
        row.coverage ? el("span", { class: "d-row-count",
          text: row.coverage.matched + " von " + row.coverage.universeSize }) : null,
        options.showMore !== false
          ? el("a", { class: "d-more", href: "#/c/" + (options.universeId || "US_REAL") + "/" + row.rowId,
                      text: "Alle ansehen" })
          : null
      ])
    ]);

    var section = el("section", { class: "d-row d-fade", "data-row": row.rowId }, [head]);

    if (!row.cards || !row.cards.length) {
      section.appendChild(emptyState("Keine Treffer",
        "In dieser Kategorie erfuellt derzeit kein Titel des Universums »" +
        row.universeLabel + "« die Bedingung. Das ist ein Befund, kein Fehler — " +
        "Stand " + (row.asOf || "unbekannt") + "."));
      return section;
    }

    var rail = el("div", { class: "d-rail", role: "list", "aria-label": row.title });
    row.cards.forEach(function (card, i) {
      var item = stockCard(card, { rowId: row.rowId, rank: i + 1, universeId: row.universeId });
      item.setAttribute("role", "listitem");
      rail.appendChild(item);
    });

    var prev = el("button", { class: "d-nav d-nav--prev", type: "button",
                              "aria-label": "Zurueck", hidden: true }, [arrow(true)]);
    var next = el("button", { class: "d-nav d-nav--next", type: "button",
                              "aria-label": "Weiter" }, [arrow(false)]);
    var wrap = el("div", { class: "d-rail-wrap" }, [prev, rail, next]);

    function scrollBy(dir) {
      rail.scrollBy({ left: dir * Math.max(240, rail.clientWidth * 0.82), behavior: "smooth" });
    }
    prev.addEventListener("click", function () { scrollBy(-1); });
    next.addEventListener("click", function () { scrollBy(1); });
    rail.addEventListener("scroll", function () {
      prev.hidden = rail.scrollLeft < 12;
      next.hidden = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 12;
    }, { passive: true });

    section.appendChild(wrap);
    return section;
  }

  function arrow(left) {
    var node = svg("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none",
                            stroke: "currentColor", "stroke-width": 2.4,
                            "stroke-linecap": "round", "stroke-linejoin": "round" });
    node.appendChild(svg("polyline", { points: left ? "15 18 9 12 15 6" : "9 18 15 12 9 6" }));
    return node;
  }

  /** Ein Gitter statt eines Rails - fuer Kategorieseiten. */
  function cardGrid(cards, options) {
    options = options || {};
    var grid = el("div", { class: "d-rail", style: "flex-wrap:wrap;overflow:visible;scroll-snap-type:none" });
    cards.forEach(function (card, i) {
      grid.appendChild(stockCard(card, { rowId: options.rowId, rank: options.ranked ? i + 1 : null,
                                         universeId: options.universeId }));
    });
    return grid;
  }

  /* Einblendung beim ersten Sichtbarwerden. Ohne IntersectionObserver
     (aeltere Browser) sind die Reihen einfach sofort da. */
  function revealOnScroll(root) {
    var nodes = Array.prototype.slice.call((root || document).querySelectorAll(".d-fade"));
    if (!global.IntersectionObserver) {
      nodes.forEach(function (n) { n.classList.add("in"); });
      return;
    }
    var io = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "80px" });
    nodes.forEach(function (n) { io.observe(n); });
    /* Notbremse: eine Einblendung, die nie ausloest, ist eine unsichtbare
       Seite. Nach zwei Sekunden ist alles sichtbar - egal, ob der
       Beobachter ausgeloest hat, ob gescrollt wurde oder ob die Seite in
       einem Screenshot-Werkzeug ohne Scrollereignisse laeuft. */
    global.setTimeout(function () {
      nodes.forEach(function (n) {
        if (!n.classList.contains("in")) { n.classList.add("in"); io.unobserve(n); }
      });
    }, 2000);
  }

  var api = {
    pct: pct, pctPoints: pctPoints, money: money, score: score, times: times,
    toneClass: toneClass, valueOf: valueOf, statusOf: statusOf, STATUS_TEXT: STATUS_TEXT,
    sparkline: sparkline, rangeBar: rangeBar, badge: badge, metric: metric,
    stockCard: stockCard, discoveryRow: discoveryRow, cardGrid: cardGrid,
    skeletonRail: skeletonRail, emptyState: emptyState, notice: notice,
    revealOnScroll: revealOnScroll, PRIMARY_BY_ROW: PRIMARY_BY_ROW
  };

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Cards = api;
})(window);
