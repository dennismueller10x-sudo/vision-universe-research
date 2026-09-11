/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/cards.js

   Die Bausteine der Discovery-Flaeche: Poster, Rang-Poster, Sektorkachel,
   Reihen, Verlaufsbilder, Zustaende.

   DER UNTERSCHIED ZUR ERSTEN FASSUNG

   Eine Karte ist hier kein Datenbankeintrag mit Kennzahlen, sondern eine
   Flaeche mit einem Verlauf darin. Der Chart traegt das untere Drittel;
   Signal und Kennzahl stehen darueber. Auf den ersten Blick soll erkennbar
   sein, WELCHES UNTERNEHMEN, WELCHES SIGNAL und WIE DER VERLAUF AUSSIEHT -
   und erst danach die Zahl.

   WAS GEZEICHNET WIRD, WENN ES KEINE KURSREIHE GIBT

   Fuer reale Titel bleiben absolute Kursniveaus nach der
   Redistributionsregel zurueck. Statt einer leeren Flaeche zeichnet die
   Karte dann den REBASIERTEN RENDITEPFAD: fuenf Stuetzstellen (12M, 6M,
   3M, 1M, heute), zurueckgerechnet aus den freigegebenen Renditen und auf
   100 normiert. Die Stuetzstellen sind sichtbar markiert - zwischen ihnen
   wird nichts behauptet, was nicht ausgeliefert wurde.
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
    var scaled = v * 100;
    var d = digits === undefined ? (Math.abs(scaled) < 1 ? 2 : 1) : digits;
    return (scaled >= 0 ? "+" : "") + scaled.toFixed(d) + " %";
  }
  function pctPoints(v, digits) {
    if (!isNum(v)) return "–";
    return (v >= 0 ? "+" : "") + v.toFixed(digits === undefined ? 2 : digits) + " %";
  }
  function money(v) {
    if (!isNum(v)) return "–";
    return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " $";
  }
  function score(v) { return isNum(v) ? String(Math.round(v)) : "–"; }
  function times(v) { return isNum(v) ? v.toFixed(1) + "x" : "–"; }
  function toneClass(v) { return !isNum(v) ? "" : v > 0 ? "up" : v < 0 ? "down" : ""; }

  var STATUS_TEXT = {
    WITHHELD_REDISTRIBUTION: "Anbieterkurs, nicht auslieferbar",
    SOURCE_MISSING: "Quelle liefert den Wert nicht",
    INSUFFICIENT_HISTORY: "Zu wenig Historie",
    NOT_APPLICABLE: "Nicht anwendbar"
  };

  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === "text") node.textContent = String(attrs[k]);
      else node.setAttribute(k, String(attrs[k]));
    });
    return node;
  }

  /* Verlaufsfuellungen einmal je Dokument. Ohne gemeinsame defs traegt
     jede Karte ihre eigene Definition - bei 150 Karten sind das 150
     ueberfluessige Knoten. */
  function ensureDefs() {
    if (document.getElementById("dx-defs")) return;
    var holder = svg("svg", { id: "dx-defs", width: 0, height: 0,
                              style: "position:absolute;width:0;height:0;overflow:hidden" });
    var defs = svg("defs", {});
    [["dxUp", "63,208,127"], ["dxDown", "240,103,92"], ["dxHeroFill", "63,208,127"]].forEach(function (pair) {
      var grad = svg("linearGradient", { id: pair[0], x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.appendChild(svg("stop", { offset: "0%", "stop-color": "rgb(" + pair[1] + ")", "stop-opacity": ".30" }));
      grad.appendChild(svg("stop", { offset: "100%", "stop-color": "rgb(" + pair[1] + ")", "stop-opacity": "0" }));
      defs.appendChild(grad);
    });
    holder.appendChild(defs);
    document.body.appendChild(holder);
  }

  /* ------------------------------------------------------- Verlaufsbilder */

  /**
   * Flaechenchart aus einer Kursreihe (Sparkline-Punkte).
   * @param {number[]} values
   * @param {object} opts {width, height, label, showLast}
   */
  function areaChart(values, opts) {
    opts = opts || {};
    ensureDefs();
    var w = opts.width || 300, h = opts.height || 104, padTop = 10, padBottom = 6;
    var node = svg("svg", { class: "dx-spark", viewBox: "0 0 " + w + " " + h,
                            preserveAspectRatio: "none", role: "img",
                            "aria-label": opts.label || "Kursverlauf" });
    var clean = values.filter(isNum);
    if (clean.length < 3) return node;
    var lo = Math.min.apply(null, clean), hi = Math.max.apply(null, clean);
    if (lo === hi) { lo -= 1; hi += 1; }
    var up = clean[clean.length - 1] >= clean[0];
    var x = function (i) { return (i / (values.length - 1)) * w; };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };

    var d = "", started = false;
    values.forEach(function (v, i) {
      if (!isNum(v)) { started = false; return; }
      d += (started ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
      started = true;
    });
    if (!d) return node;
    node.appendChild(svg("path", { class: "area" + (up ? "" : " down"),
      d: d + "L" + w + " " + h + " L0 " + h + " Z" }));
    node.appendChild(svg("path", { class: "line" + (up ? "" : " down"), d: d.trim() }));
    if (opts.showLast !== false) {
      node.appendChild(svg("circle", { class: "node" + (up ? "" : " down"),
        cx: x(values.length - 1).toFixed(1), cy: y(clean[clean.length - 1]).toFixed(1), r: 2.6 }));
    }
    return node;
  }

  /**
   * Rebasierter Renditepfad: fuenf Stuetzstellen, sichtbar markiert.
   *
   * Bewusst mit Knoten und ohne Glaettung. Eine weiche Kurve durch vier
   * Punkte sieht aus wie eine Kursreihe, und genau das ist sie nicht.
   */
  function pathChart(points, opts) {
    opts = opts || {};
    ensureDefs();
    var w = opts.width || 300, h = opts.height || 104;
    var padTop = 14, padBottom = opts.labels === false ? 8 : 18, padX = 10;
    var node = svg("svg", { class: "dx-spark", viewBox: "0 0 " + w + " " + h,
                            preserveAspectRatio: "none", role: "img",
                            "aria-label": opts.label || "Renditepfad der letzten zwölf Monate" });
    if (!points || points.length < 2) return node;
    var werte = points.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, werte), hi = Math.max.apply(null, werte);
    if (lo === hi) { lo -= 1; hi += 1; }
    var spanne = hi - lo;
    lo -= spanne * 0.12; hi += spanne * 0.12;
    var up = werte[werte.length - 1] >= werte[0];
    var x = function (i) { return padX + (i / (points.length - 1)) * (w - padX * 2); };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };

    /* Nulllinie: der Stand vor zwoelf Monaten. Ohne sie sagt die Form
       nichts darueber, ob der Titel ueberhaupt gestiegen ist. */
    node.appendChild(svg("line", { class: "grid", x1: 0, x2: w,
      y1: y(werte[0]).toFixed(1), y2: y(werte[0]).toFixed(1) }));

    var d = points.map(function (p, i) {
      return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1);
    }).join(" ");
    node.appendChild(svg("path", { class: "area" + (up ? "" : " down"),
      d: d + " L" + x(points.length - 1).toFixed(1) + " " + h + " L" + x(0).toFixed(1) + " " + h + " Z" }));
    node.appendChild(svg("path", { class: "line" + (up ? "" : " down"), d: d }));
    points.forEach(function (p, i) {
      node.appendChild(svg("circle", { class: "node" + (up ? "" : " down"),
        cx: x(i).toFixed(1), cy: y(p.value).toFixed(1), r: i === points.length - 1 ? 3 : 1.9 }));
    });
    if (opts.labels !== false) {
      [0, points.length - 1].forEach(function (i) {
        node.appendChild(svg("text", { class: "tick", x: i === 0 ? 2 : w - 2,
          y: h - 5, "text-anchor": i === 0 ? "start" : "end", text: points[i].label }));
      });
    }
    return node;
  }

  /**
   * Das Artwork einer Karte. Es ersetzt die frühere Sparkline: dieselbe
   * Datengrundlage, aber als Komposition aus Verlauf, Schwankungsband,
   * Jahresspanne, Lichtschein und - wo Platz ist - dem Kürzel als Fläche.
   * Die Herleitung steht in discover/ui/artwork.js.
   */
  function posterMedia(card, opts) {
    opts = opts || {};
    var host = el("div", { class: "dx-poster-media" });
    host.appendChild(D().Artwork.stockArtwork(card, {
      width: opts.width || 300, height: opts.height || 104,
      ticker: opts.ticker === true, band: opts.band !== false,
      scale: opts.scale || "poster"
    }));
    return host;
  }

  function D() { return global.VUDiscover; }

  /* ------------------------------------------------------------- Signale */
  /* Welche Farbwelt gehört zu welchem Signal? Dieselbe Zuordnung wie im
     Build (discover-v1.json → visualLanguage.signalWorlds); sie steht hier
     noch einmal, weil die Karte auch ohne geladene Methodik rendern muss. */
  var SIGNAL_TONE = {
    new52WeekHigh: "highs", nearHigh: "highs", marketLeader: "leadership",
    momentumLeader: "momentum", relativeStrengthLeader: "strength",
    breakout: "breakout", trendIntact: "quality", sectorLeader: "sectors",
    notTrading: "muted"
  };

  function signalChip(badge) {
    if (!badge) return null;
    return el("span", { class: "dx-sig dx-sig--" + (SIGNAL_TONE[badge.id] || "muted") }, [
      document.createTextNode(badge.label),
      badge.detail ? el("small", { text: badge.detail }) : null
    ]);
  }

  /* Welche Kennzahl steht oben rechts? Die Zeile entscheidet - in
     "MOMENTUM LEADERS" interessiert die Halbjahresrendite, in "BREAKOUT"
     das Volumen. */
  var PRIMARY_BY_ROW = {
    "new-52-week-highs": { key: "distanceTo52wHigh", label: "zum Hoch", format: pct, neutral: true },
    "market-leaders": { key: "leadershipScore", label: "Leadership", format: score, neutral: true },
    "momentum-leaders": { key: "return6M", label: "6 Monate", format: pct },
    "breakout-watch": { key: "volumeSpikeRatio", label: "Volumen", format: times, neutral: true },
    "relative-strength": { key: "relativeStrength12M", label: "RS 12M", format: pct },
    "trend-quality": { key: "return3M", label: "3 Monate", format: pct },
    "sector-leaders": { key: "leadershipScore", label: "Leadership", format: score, neutral: true },
    "top-10": { key: "leadershipScore", label: "Leadership", format: score, neutral: true }
  };

  /**
   * Ein Stock Poster.
   * @param {object} card    Contract.toCard-Form
   * @param {object} options {rowId, universeId, variant: "poster"|"compact", rank}
   */
  function poster(card, options) {
    options = options || {};
    var m = card.metrics || {};
    var config = PRIMARY_BY_ROW[options.rowId] || PRIMARY_BY_ROW["market-leaders"];
    var preis = valueOf(card.price);
    var change = valueOf(card.changePercent);
    var kompakt = options.variant === "compact";
    var breit = options.variant === "wide";

    /* Oben rechts steht die Zahl, die diese Reihe begruendet - ausser bei
       Titeln mit freigegebenem Kurs, dort steht der Kurs. */
    var rechts;
    if (isNum(preis)) {
      rechts = el("div", { class: "dx-poster-right" }, [
        el("b", { class: "num", text: money(preis) }),
        el("span", { class: isNum(change) ? toneClass(change) : "",
                     text: isNum(change) ? pctPoints(change) + " heute" : "Kurs" })
      ]);
    } else {
      var wert = m[config.key];
      rechts = el("div", { class: "dx-poster-right" }, [
        el("b", { class: "num " + (config.neutral ? "" : toneClass(wert)),
                  text: config.format(wert) }),
        el("span", { text: config.label })
      ]);
    }

    var node = el("a", {
      class: "dx-poster" + (kompakt ? " dx-poster--compact" : "") + (breit ? " dx-poster--wide" : ""),
      href: "#/s/" + (options.universeId || "US_REAL") + "/" + card.symbol,
      /* Die Karte trägt die Welt ihrer REIHE; das Signal darauf trägt seine
         eigene. So bleibt die Reihe als Welt erkennbar, ohne dass ein
         abweichendes Signal verschwiegen wird. */
      "data-world": options.world || card.world || null,
      "aria-label": (card.companyName || card.symbol) + " öffnen"
    }, [
      el("div", { class: "dx-poster-top" }, [
        el("div", { class: "dx-poster-id" }, [
          el("span", { class: "dx-poster-name",
                       text: card.companyName || card.sector || card.exchange || "—" }),
          el("b", { class: "dx-poster-sym", text: card.symbol })
        ]),
        rechts
      ]),
      signalChip((card.badges || [])[0]),
      /* Eine Zweitnennung ist kein Duplikat, sondern ein Befund: dieser
         Titel steht in mehreren Ranglisten weit vorn. Damit sie nicht wie
         ein Fehler aussieht, sagt sie, woher man ihn kennt - als Text,
         nicht als Farbe. */
      options.hinweis ? el("span", { class: "dx-echo" }, [
        el("span", { class: "dx-echo-dot", "aria-hidden": "true" }),
        document.createTextNode("auch in " + options.hinweis)
      ]) : null,
      posterMedia(card, {
        height: kompakt ? 74 : (breit ? 148 : 104),
        width: breit ? 392 : (kompakt ? 224 : 300),
        ticker: breit === true || options.variant === "rank",
        scale: kompakt ? "mini" : "poster"
      })
    ]);

    /* Fusszeile: Leadership als feiner Balken. Eine Zahl, die man nicht
       lesen muss, um sie zu verstehen. */
    if (isNum(m.leadershipScore)) {
      node.appendChild(el("div", { class: "dx-poster-foot" }, [
        el("span", { text: "LEAD" }),
        el("div", { class: "dx-meter" }, [
          el("i", { style: "width:" + Math.max(3, Math.min(100, m.leadershipScore)).toFixed(0) + "%" })
        ]),
        el("span", { class: "num", text: Math.round(m.leadershipScore) })
      ]));
    }

    /* Der Hover-Vorhang. Er ergaenzt, er ersetzt nichts: alles hier steht
       auch auf der Detailseite, und ohne Zeiger ist er gar nicht da. */
    if (!kompakt) {
      node.appendChild(el("div", { class: "dx-reveal", "aria-hidden": "true" }, [
        revealItem("Leadership", score(m.leadershipScore)),
        revealItem("RS", isNum(m.relativeStrengthPercentile)
          ? String(Math.round(m.relativeStrengthPercentile)) : "–"),
        revealItem("Momentum", isNum(m.momentumPercentile)
          ? String(Math.round(m.momentumPercentile)) : "–"),
        el("span", { class: "dx-open", text: "Öffnen →" })
      ]));
    }

    if (card.dataMode === "mock") node.setAttribute("data-mock", "true");
    return node;
  }

  function revealItem(label, value) {
    return el("div", {}, [el("span", { text: label }), el("b", { class: "num", text: value })]);
  }

  /** Rang-Poster der Signature-Reihe: Ziffer neben der Karte. */
  function rankPoster(card, options) {
    options = options || {};
    var nummer = String(options.rank);
    return el("div", { class: "dx-rank", "data-world": options.world || null }, [
      el("div", { class: "dx-rank-num", "aria-hidden": "true",
                  text: nummer.length < 2 ? "0" + nummer : nummer }),
      poster(card, options)
    ]);
  }

  /** Sektorkachel: drei Titel, ein Sektor, kein Kartenstapel. */
  function sectorTile(sector, options) {
    options = options || {};
    var rows = sector.cards.slice(0, 4).map(function (card, index) {
      var m = card.metrics || {};
      return el("div", { class: "dx-sector-row" }, [
        el("i", { text: String(index + 1) }),
        el("div", { style: "min-width:0" }, [
          el("b", { text: card.symbol }),
          el("em", { text: card.companyName || card.exchange || "" })
        ]),
        el("span", { class: "val num", text: isNum(m.return12M) ? pct(m.return12M) : "–" }),
        el("span", { class: "val num", text: score(m.leadershipScore) })
      ]);
    });
    var node = el("a", {
      class: "dx-sector", "data-world": options.world || null,
      href: "#/c/" + (options.universeId || "US_REAL") + "/sector-leaders",
      "aria-label": "Sektor " + sector.sector + " ansehen"
    }, [
      el("div", { class: "dx-sector-head" }, [
        el("h3", { text: sector.sector }),
        el("span", { text: sector.count + " Titel" })
      ])
    ].concat(rows).concat([
      el("div", { class: "dx-sector-foot", text: "Sektor ansehen →" })
    ]));
    return node;
  }

  /* --------------------------------------------------------------- Reihen */
  function skeletonRail(count) {
    var rail = el("div", { class: "dx-rail" });
    for (var i = 0; i < (count || 5); i++) rail.appendChild(el("div", { class: "dx-skeleton" }));
    return rail;
  }

  function emptyState(title, message) {
    return el("div", { class: "dx-empty" }, [el("b", { text: title }), document.createTextNode(message)]);
  }

  function note(title, message, variant) {
    return el("div", { class: "dx-note" + (variant === "warm" ? " dx-note--warm" : "") }, [
      title ? el("b", { text: title }) : null, document.createTextNode(message)
    ]);
  }

  function railHead(title, subtitle, options) {
    options = options || {};
    return el("div", { class: "dx-rail-head" }, [
      el("h2", { text: title }),
      subtitle ? el("p", { text: subtitle }) : null,
      options.count ? el("span", { class: "dx-rail-count", text: options.count }) : null,
      options.href ? el("a", { class: "dx-more", href: options.href }, [
        document.createTextNode(options.moreLabel || "Alle anzeigen"),
        document.createTextNode(" →")
      ]) : null
    ]);
  }

  /**
   * Eine Discovery-Reihe.
   * @param {object} row     Zeilen-Payload
   * @param {object} options {universeId, variant: "poster"|"compact"|"rank", limit}
   */
  function rail(row, options) {
    options = options || {};
    var variant = options.variant || "poster";
    var section = el("section", { class: "dx-rail-section dx-fade", "data-row": row.rowId });

    section.appendChild(railHead(row.title, row.subtitle, {
      count: row.coverage
        ? row.coverage.matched + " von " + row.coverage.universeSize + (options.countSuffix || "")
        : null,
      href: options.showMore === false ? null : "#/c/" + row.universeId + "/" + row.rowId
    }));

    var welt = options.world || row.world || null;
    if (welt) section.setAttribute("data-world", welt);
    var cards = (row.cards || []).slice(0, options.limit || 24);
    if (!cards.length) {
      section.appendChild(emptyState("Keine Treffer",
        "In dieser Kategorie erfüllt derzeit kein Titel des Universums »" + row.universeLabel +
        "« die Bedingung. Das ist ein Befund, kein Fehler — Stand " + (row.asOf || "unbekannt") + "."));
      return section;
    }

    var track = el("div", { class: "dx-rail", role: "list", "aria-label": row.title });
    cards.forEach(function (card, index) {
      var hinweis = options.hinweise ? options.hinweise[card.symbol] : null;
      var item = variant === "rank"
        ? rankPoster(card, { rowId: row.rowId, universeId: row.universeId, rank: index + 1,
                             world: welt, variant: "rank" })
        : poster(card, { rowId: row.rowId, universeId: row.universeId, variant: variant,
                         world: welt, hinweis: hinweis });
      item.setAttribute("role", "listitem");
      track.appendChild(item);
    });

    section.appendChild(withRailNav(track));
    return section;
  }

  /** Pfeile am Rand. Sie erscheinen nur mit Zeiger und nur, wo es weitergeht. */
  function withRailNav(track) {
    var prev = el("button", { class: "dx-rail-nav dx-rail-nav--prev", type: "button",
                              "aria-label": "Zurück", hidden: true }, [chevron(true)]);
    var next = el("button", { class: "dx-rail-nav dx-rail-nav--next", type: "button",
                              "aria-label": "Weiter" }, [chevron(false)]);
    var wrap = el("div", { class: "dx-rail-wrap" }, [prev, track, next]);

    function schritt(richtung) {
      track.scrollBy({ left: richtung * Math.max(280, track.clientWidth * 0.8), behavior: "smooth" });
    }
    prev.addEventListener("click", function () { schritt(-1); });
    next.addEventListener("click", function () { schritt(1); });
    function pruefen() {
      prev.hidden = track.scrollLeft < 12;
      next.hidden = track.scrollLeft + track.clientWidth >= track.scrollWidth - 12;
    }
    track.addEventListener("scroll", pruefen, { passive: true });
    global.setTimeout(pruefen, 60);
    return wrap;
  }

  function chevron(left) {
    var icon = svg("svg", { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none",
                            stroke: "currentColor", "stroke-width": 2.4,
                            "stroke-linecap": "round", "stroke-linejoin": "round" });
    icon.appendChild(svg("polyline", { points: left ? "15 18 9 12 15 6" : "9 18 15 12 9 6" }));
    return el("i", {}, [icon]);
  }

  /** Gitter statt Reihe - fuer Kategorieseiten. */
  function grid(cards, options) {
    options = options || {};
    var host = el("div", { class: "dx-grid" });
    cards.forEach(function (card, index) {
      host.appendChild(poster(card, { rowId: options.rowId, universeId: options.universeId,
                                      rank: index + 1, world: options.world }));
    });
    return host;
  }

  /* Einblendung beim ersten Sichtbarwerden - mit Notbremse, damit eine
     Seite ohne Scrollereignis nicht unsichtbar bleibt. */
  function revealOnScroll(root) {
    var nodes = Array.prototype.slice.call((root || document).querySelectorAll(".dx-fade"));
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
    }, { rootMargin: "120px" });
    nodes.forEach(function (n) { io.observe(n); });
    global.setTimeout(function () {
      nodes.forEach(function (n) { if (!n.classList.contains("in")) n.classList.add("in"); });
    }, 2000);
  }

  var api = {
    pct: pct, pctPoints: pctPoints, money: money, score: score, times: times,
    toneClass: toneClass, valueOf: valueOf, statusOf: statusOf, STATUS_TEXT: STATUS_TEXT,
    svg: svg, ensureDefs: ensureDefs,
    areaChart: areaChart, pathChart: pathChart, posterMedia: posterMedia,
    SIGNAL_TONE: SIGNAL_TONE,
    signalChip: signalChip, poster: poster, rankPoster: rankPoster, sectorTile: sectorTile,
    rail: rail, railHead: railHead, withRailNav: withRailNav, grid: grid,
    skeletonRail: skeletonRail, emptyState: emptyState, note: note,
    revealOnScroll: revealOnScroll, PRIMARY_BY_ROW: PRIMARY_BY_ROW
  };

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Cards = api;
})(window);
