/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/detail-fundamentals.js

   WIE HAT SICH DAS UNTERNEHMEN ENTWICKELT?

   Die Kapitel der Aktienseite, die aus den Jahresabschluessen kommen
   (discover/engines/fundamentals.js, gerechnet im Build):

     damalsHeute   DAMALS VS. HEUTE - zwei Spalten, exakte Perioden
     journey       DIE ENTWICKLUNG DES UNTERNEHMENS - Umsatz, Gewinn, Free
                   Cashflow, Margen, Aktienanzahl als Jahresbalken; Ebene 1
                   zeigt eine Spur, die anderen liegen einen Klick darunter
     heute         WIE STEHT DAS GESCHAEFT HEUTE DA - letztes Geschaeftsjahr
                   und Zwoelfmonatswerte, getrennt benannt
     bewertung     BEWERTUNG - zuerst ein Satz gegen den Markt, darunter
                   KGV, KUV, Free-Cashflow-Rendite mit Basis
     nextDiscovery NEXT DISCOVERY - aehnliche Aktien, gleicher Sektor,
                   gleiches Thema, aehnliches Wachstum, guenstigere
                   Alternativen: eine Aktie fuehrt zur naechsten

   Kein Kapitel behauptet etwas ohne Daten: fehlt das Bundle, sagt die
   Seite in einem Satz, warum - und sonst nichts.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;
  var D = global.VUDiscover;
  function C() { return D.Cards; }
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /* ----------------------------------------------------------- Format */
  function geld(v, unit) {
    if (!isNum(v)) return "–";
    if (unit === "USD/shares") return (Math.round(v * 100) / 100).toFixed(2).replace(".", ",") + " $";
    if (unit === "shares") return Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2).replace(".", ",") + " Mrd." : (v / 1e6).toFixed(0) + " Mio.";
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mrd. $";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + " Mio. $";
    return Math.round(v).toLocaleString("de-DE") + " $";
  }
  function prozent(v, digits) {
    if (!isNum(v)) return "–";
    var d = digits === undefined ? 0 : digits;
    return (v >= 0 ? "+" : "") + (v * 100).toFixed(d).replace(".", ",") + " %";
  }
  function prozentOhneVz(v, digits) {
    if (!isNum(v)) return "–";
    return (v * 100).toFixed(digits === undefined ? 1 : digits).replace(".", ",") + " %";
  }
  function ton(v) { return !isNum(v) ? "" : v > 0 ? "up" : v < 0 ? "down" : ""; }
  function wert(row, seite) {
    var v = row[seite].value;
    if (row.kind === "margin") return isNum(v) ? prozentOhneVz(v) : "–";
    return geld(v, row.unit);
  }
  function aenderung(row) {
    var c = row.change || {};
    if (row.kind === "margin") return isNum(c.pp) ? ((c.pp >= 0 ? "+" : "") + c.pp.toFixed(1).replace(".", ",") + " Pp.") : "–";
    if (isNum(c.pct)) return prozent(c.pct);
    if (isNum(c.abs)) return (c.abs >= 0 ? "+" : "") + geld(c.abs, row.unit);
    return "–";
  }
  function tonAenderung(row) {
    var c = row.change || {};
    return row.kind === "margin" ? ton(c.pp) : ton(isNum(c.pct) ? c.pct : c.abs);
  }

  function fehlt(detail, titel) {
    var f = detail.fundamentals || {};
    return el("section", { class: "dx-chapter dx-fade" }, [
      el("h2", { text: titel }),
      el("p", { class: "dx-why-empty", text: f.message || "Für diesen Titel liegen keine Geschäftszahlen der SEC vor." })
    ]);
  }
  function quelleFuss(f, extra) {
    return el("p", { class: "dx-kapitel-fuss", text: "Aus den Jahresabschlüssen bei der SEC (XBRL Company Facts), Geschäftsjahre " +
      (f.fiscalYears && f.fiscalYears.length ? f.fiscalYears[0] + "–" + f.fiscalYears[f.fiscalYears.length - 1] : "–") +
      ", Stand " + (f.asOf || "") + ". " + (extra || "") });
  }

  /* -------------------------------------------------- DAMALS VS. HEUTE */
  function damalsHeute(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available) return null;
    var c = f.compare;
    if (!c || !c.available || !c.rows.length) return null;
    var h = c.horizon;
    var name = detail.companyName || detail.symbol;
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--damals" }, [
      el("p", { class: "dx-kicker", text: "Damals vs. heute" }),
      el("h2", { text: name + " vor " + h.years + " Jahren und heute" }),
      el("p", { class: "dx-chapter-lead", text: h.kind === "FIRST_VS_LATEST"
        ? "Der längste echte Vergleich, den die Daten hergeben: erstes gegen letztes Geschäftsjahr."
        : "Geschäftsjahr " + h.from + " gegen Geschäftsjahr " + h.to + " — der längste valide Vergleich, den die Daten hergeben." })
    ]);
    var tabelle = el("table", { class: "dx-damals dx-damals--gross" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", { text: "" }),
        el("th", {}, [el("b", { text: "Vor " + h.years + " Jahren" }), el("span", { text: "GJ " + h.from })]),
        el("th", {}, [el("b", { text: "Heute" }), el("span", { text: "GJ " + h.to })]),
        el("th", { text: "Veränderung" })
      ])]),
      el("tbody", {}, c.rows.map(function (r) {
        return el("tr", {}, [
          el("th", { scope: "row" }, [el("b", { text: r.label }), r.kind === "margin" ? el("span", { text: "Operativer Gewinn zu Umsatz" }) : null]),
          el("td", { class: "num", text: wert(r, "then") }),
          el("td", { class: "num", text: wert(r, "now") }),
          el("td", { class: "num " + tonAenderung(r) }, [
            el("b", { text: aenderung(r) }),
            r.change && isNum(r.change.cagr) ? el("span", { text: prozent(r.change.cagr, 1) + " p. a." }) : null
          ])
        ]);
      }))
    ]);
    section.appendChild(tabelle);
    section.appendChild(quelleFuss(f, "Vor-Ort-Perioden sind Geschäftsjahresenden (" +
      (c.rows[0].then.end || "") + " und " + (c.rows[0].now.end || "") + "). Nur tatsächlich berichtete Werte; eine fehlende Zeile ist eine fehlende Zahl."));
    return section;
  }

  /* ----------------------------------------------------------- JOURNEY */
  function balken(points, opts) {
    opts = opts || {};
    var w = opts.width || 640, h = opts.height || 180, pad = 26;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("class", "dx-journey-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.label || "Jahresreihe");
    var vals = points.map(function (p) { return p.v; });
    var max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
    var span = (max - min) || 1;
    var n = points.length;
    var slot = (w - 2 * pad) / n, bw = Math.max(6, slot * 0.62);
    var y0 = pad + (max / span) * (h - 2 * pad - 14);
    var axis = document.createElementNS(ns, "line");
    axis.setAttribute("x1", pad); axis.setAttribute("x2", w - pad); axis.setAttribute("y1", y0); axis.setAttribute("y2", y0);
    axis.setAttribute("class", "dx-journey-axis");
    svg.appendChild(axis);
    points.forEach(function (p, i) {
      var x = pad + i * slot + (slot - bw) / 2;
      var hh = Math.abs(p.v) / span * (h - 2 * pad - 14);
      var rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x); rect.setAttribute("width", bw);
      rect.setAttribute("y", p.v >= 0 ? y0 - hh : y0); rect.setAttribute("height", Math.max(1, hh));
      rect.setAttribute("rx", 3);
      rect.setAttribute("class", "dx-journey-bar" + (p.v < 0 ? " down" : "") + (i === n - 1 ? " last" : ""));
      var t = document.createElementNS(ns, "title");
      t.textContent = "GJ " + p.fy + ": " + (opts.format ? opts.format(p.v) : p.v);
      rect.appendChild(t);
      svg.appendChild(rect);
      if (n <= 12 || i % 2 === 0 || i === n - 1) {
        var lbl = document.createElementNS(ns, "text");
        lbl.setAttribute("x", x + bw / 2); lbl.setAttribute("y", h - 6); lbl.setAttribute("text-anchor", "middle");
        lbl.setAttribute("class", "dx-journey-year");
        lbl.textContent = String(p.fy).slice(2);
        svg.appendChild(lbl);
      }
    });
    return svg;
  }

  var SPUREN = [
    { id: "revenue", label: "Umsatz", frage: "Wie viel setzt das Unternehmen um?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "net_income", label: "Nettogewinn", frage: "Was bleibt unter dem Strich?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "free_cash_flow", label: "Free Cashflow", frage: "Wie viel Geld bleibt nach Investitionen?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "margins.operating", label: "Operative Marge", frage: "Wie viel vom Umsatz bleibt operativ?", fmt: function (v) { return prozentOhneVz(v); } },
    { id: "eps_diluted", label: "Gewinn je Aktie", frage: "Was verdient eine einzelne Aktie?", fmt: function (v) { return geld(v, "USD/shares"); } },
    { id: "debt_cash", label: "Schulden und Kasse", frage: "Wie steht die Bilanz?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "shares", label: "Aktienanzahl", frage: "Wird verwässert oder zurückgekauft?", fmt: function (v) { return geld(v, "shares"); } }
  ];
  function spurPunkte(tracks, id) {
    if (id === "margins.operating") return (tracks.margins && tracks.margins.operating) || [];
    if (id === "debt_cash") return null;
    return tracks[id] || [];
  }

  function journey(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available) return null;
    var j = f.journey;
    if (!j || !j.available) return null;
    var name = detail.companyName || detail.symbol;
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--journey" }, [
      el("p", { class: "dx-kicker", text: "Fundamental Journey" }),
      el("h2", { text: "Die Entwicklung von " + name }),
      el("p", { class: "dx-chapter-lead", text: "Geschäftsjahr für Geschäftsjahr — was das Unternehmen gemacht hat, nicht die Aktie. Ein Balken je Jahr, jeder Wert aus einem Jahresabschluss." })
    ]);
    var story = f.story;
    if (story && story.available && story.statements.length) {
      section.appendChild(el("ul", { class: "dx-story-list dx-story-list--detail" }, story.statements.slice(0, 4).map(function (s) {
        return el("li", {}, [
          el("i", { class: "dx-story-dot", "aria-hidden": "true" }),
          el("span", { text: s.text }),
          el("small", { text: " GJ " + s.evidence.periodStart.fy + " → " + s.evidence.periodEnd.fy })
        ]);
      })));
    }
    var host = el("div", { class: "dx-journey" });
    var spuren = SPUREN.filter(function (sp) {
      if (sp.id === "debt_cash") return (j.tracks.debt && j.tracks.debt.length >= 2) || (j.tracks.cash && j.tracks.cash.length >= 2);
      var p = spurPunkte(j.tracks, sp.id); return p && p.length >= 2;
    });
    if (!spuren.length) return null;
    var tabs = el("div", { class: "dx-journey-tabs", role: "tablist" });
    var bild = el("div", { class: "dx-journey-bild" });
    var aktiv = 0;
    function zeichne(i) {
      aktiv = i;
      S.clear(bild);
      var sp = spuren[i];
      Array.prototype.forEach.call(tabs.children, function (b, k) { b.setAttribute("aria-selected", String(k === i)); });
      if (sp.id === "debt_cash") {
        var debt = j.tracks.debt || [], cash = j.tracks.cash || [];
        var both = el("div", { class: "dx-journey-doppel" });
        if (debt.length) both.appendChild(el("div", {}, [el("h4", { text: "Schulden" }), balken(debt, { label: "Schulden je Geschäftsjahr", format: sp.fmt, height: 140 })]));
        if (cash.length) both.appendChild(el("div", {}, [el("h4", { text: "Kasse" }), balken(cash, { label: "Kasse je Geschäftsjahr", format: sp.fmt, height: 140 })]));
        bild.appendChild(both);
      } else {
        var p = spurPunkte(j.tracks, sp.id);
        bild.appendChild(balken(p, { label: sp.label + " je Geschäftsjahr", format: sp.fmt }));
        var erst = p[0], letzt = p[p.length - 1];
        bild.appendChild(el("p", { class: "dx-journey-legende" }, [
          el("span", {}, [el("b", { text: "GJ " + erst.fy }), document.createTextNode(" " + sp.fmt(erst.v))]),
          el("span", {}, [el("b", { text: "GJ " + letzt.fy }), document.createTextNode(" " + sp.fmt(letzt.v))]),
          (isNum(erst.v) && erst.v > 0 && isNum(letzt.v)) ? el("span", { class: ton(letzt.v / erst.v - 1) }, [el("b", { text: prozent(letzt.v / erst.v - 1) }), document.createTextNode(" über " + (letzt.fy - erst.fy) + " Jahre")]) : null
        ]));
      }
      bild.appendChild(el("p", { class: "dx-journey-frage", text: sp.frage }));
    }
    spuren.forEach(function (sp, i) {
      var b = el("button", { type: "button", role: "tab", class: "dx-journey-tab", text: sp.label, "aria-selected": String(i === 0) });
      b.addEventListener("click", function () { zeichne(i); });
      tabs.appendChild(b);
    });
    host.appendChild(tabs); host.appendChild(bild);
    section.appendChild(host);
    zeichne(0);
    /* Kurs und Unternehmen nebeneinander - ohne Ursache und Wirkung. */
    var pvf = f.priceVsFundamentals;
    if (pvf && pvf.available) {
      section.appendChild(el("div", { class: "dx-pvf" }, [
        el("h3", { text: "Der Kurs zeigt, was die Aktie gemacht hat. Die Zahlen zeigen, was das Unternehmen gemacht hat." }),
        el("div", { class: "dx-pvf-grid" }, [
          el("div", {}, [el("span", { text: "Kurs " + pvf.price.from + " → " + pvf.price.to }), el("b", { class: "num " + ton(pvf.price.change), text: prozent(pvf.price.change) })]),
          pvf.revenueChange ? el("div", {}, [el("span", { text: "Umsatz GJ " + pvf.fiscal.from + " → " + pvf.fiscal.to }), el("b", { class: "num " + ton(pvf.revenueChange.value), text: prozent(pvf.revenueChange.value) })]) : null,
          pvf.netIncomeChange ? el("div", {}, [el("span", { text: "Nettogewinn GJ " + pvf.fiscal.from + " → " + pvf.fiscal.to }), el("b", { class: "num " + ton(pvf.netIncomeChange.value), text: prozent(pvf.netIncomeChange.value) })]) : null
        ]),
        el("p", { class: "dx-kapitel-fuss", text: "Nebeneinander, nicht Ursache und Wirkung: der Kurs über die ausgelieferte Reihe, die Zahlen über die Geschäftsjahre, die in diese Zeit fallen." })
      ]));
    }
    section.appendChild(quelleFuss(f, "Margen nur, wo Zähler und Nenner aus demselben Geschäftsjahr stammen."));
    return section;
  }

  /* ----------------------------------------------------- HEUTE STAND */
  function heute(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available) return null;
    var l = f.latest;
    if (!l || !l.available) return null;
    var g = detail.geschaeftszahlen || {};
    var name = detail.companyName || detail.symbol;
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--heute" }, [
      el("p", { class: "dx-kicker", text: "Heute" }),
      el("h2", { text: "Wie steht das Geschäft von " + name + " heute da?" })
    ]);
    var cats = (f.health && f.health.categories) || [];
    if (cats.length) {
      section.appendChild(el("div", { class: "dx-health" }, cats.map(function (c) {
        return el("div", { class: "dx-health-zelle", "data-grade": c.grade }, [
          el("span", { class: "dx-30-label", text: c.label }),
          el("b", { class: "dx-30-wert", text: c.grade }),
          el("span", { class: "dx-30-beleg", text: c.detail })
        ]);
      })));
    }
    var a = l.annual, t = l.ttm;
    var zeilen = [
      a.revenue ? { label: "Umsatz GJ " + l.fiscalYear, wert: geld(a.revenue.v, a.revenue.unit) } : null,
      t.revenue ? { label: "Umsatz zwölf Monate (bis " + t.revenue.through.replace("FY", "GJ ").replace("Q", " Q") + ")", wert: geld(t.revenue.v, t.revenue.unit) } : null,
      a.net_income ? { label: "Nettogewinn GJ " + l.fiscalYear, wert: geld(a.net_income.v, a.net_income.unit), ton: ton(a.net_income.v) } : null,
      t.net_income ? { label: "Nettogewinn zwölf Monate", wert: geld(t.net_income.v, t.net_income.unit), ton: ton(t.net_income.v) } : null,
      a.free_cash_flow ? { label: "Free Cashflow GJ " + l.fiscalYear, wert: geld(a.free_cash_flow.v, a.free_cash_flow.unit), ton: ton(a.free_cash_flow.v) } : null,
      isNum(l.derived.operatingMargin) ? { label: "Operative Marge GJ " + l.fiscalYear, wert: prozentOhneVz(l.derived.operatingMargin) } : null,
      isNum(l.derived.netMargin) ? { label: "Nettomarge GJ " + l.fiscalYear, wert: prozentOhneVz(l.derived.netMargin) } : null,
      isNum(l.derived.roe) ? { label: "Eigenkapitalrendite GJ " + l.fiscalYear, wert: prozentOhneVz(l.derived.roe) } : null,
      a.cash_and_equivalents ? { label: "Kasse (Ende GJ " + l.fiscalYear + ")", wert: geld(a.cash_and_equivalents.v, a.cash_and_equivalents.unit) } : null,
      a.total_debt ? { label: "Schulden (Ende GJ " + l.fiscalYear + ")", wert: geld(a.total_debt.v, a.total_debt.unit) } : null,
      a.shares_outstanding ? { label: "Aktien (Ende GJ " + l.fiscalYear + ")", wert: geld(a.shares_outstanding.v, "shares") } : null
    ].filter(Boolean);
    section.appendChild(el("div", { class: "dx-firma dx-firma--heute" }, zeilen.map(function (z) {
      return el("div", {}, [el("span", { text: z.label }), el("b", { class: "num " + (z.ton || ""), text: z.wert })]);
    })));
    section.appendChild(el("p", { class: "dx-kapitel-fuss", text: "Geschäftsjahr und Zwölfmonatswerte stehen getrennt: das Geschäftsjahr aus dem Jahresabschluss (10-K), die zwölf Monate aus den vier jüngsten Quartalen" +
      (g.basis ? " (Basis " + g.basis + ")" : "") + ". Nichts davon ist gemischt oder geschätzt." }));
    return section;
  }

  /* --------------------------------------------------------- BEWERTUNG */
  function bewertung(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available) return null;
    var v = f.valuation;
    if (!v || !v.available) {
      return el("section", { class: "dx-chapter dx-fade" }, [
        el("p", { class: "dx-kicker", text: "Bewertung" }),
        el("h2", { text: "Ist die Aktie teuer?" }),
        el("p", { class: "dx-why-empty", text: v && v.reason === "NO_PRICE" ? "Ohne ausgelieferten Kurs lässt sich die Bewertung nicht berechnen." : "Für diesen Titel liegen keine Gewinn- oder Umsatzzahlen vor, gegen die sich der Kurs messen ließe." })
      ]);
    }
    var name = detail.companyName || detail.symbol;
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--bewertung" }, [
      el("p", { class: "dx-kicker", text: "Bewertung" }),
      el("h2", { text: "Ist " + name + " teuer?" })
    ]);
    var rel = v.relative;
    if (rel && rel.label) {
      section.appendChild(el("p", { class: "dx-bewertung-satz", "data-stufe": rel.stufe }, [
        el("b", { text: rel.label + "." }),
        document.createTextNode(" Das Kurs-Gewinn-Verhältnis liegt bei " + (Math.round(v.pe.value * 10) / 10).toFixed(1).replace(".", ",") +
          ", der Median von " + rel.universeCount.toLocaleString("de-DE") + " Unternehmen mit Gewinn bei " + (Math.round(rel.peMedian * 10) / 10).toFixed(1).replace(".", ",") + ".")
      ]));
    } else if (v.peReason) {
      section.appendChild(el("p", { class: "dx-bewertung-satz", text: v.peReason === "SOURCE_MISSING" ? "Kein Kurs-Gewinn-Verhältnis: das Unternehmen schreibt zuletzt keinen Gewinn oder es fehlt der Gewinn je Aktie." : "Kein Kurs-Gewinn-Verhältnis berechenbar." }));
    }
    var zeilen = [
      v.pe ? { label: "Kurs-Gewinn-Verhältnis", wert: (Math.round(v.pe.value * 10) / 10).toFixed(1).replace(".", ","), zusatz: "Kurs / Gewinn je Aktie (" + v.pe.basis + ")" } : null,
      v.ps ? { label: "Kurs-Umsatz-Verhältnis", wert: (Math.round(v.ps.value * 10) / 10).toFixed(1).replace(".", ","), zusatz: "Marktwert / Umsatz (" + v.ps.basis + ")" } : null,
      v.fcfYield ? { label: "Free-Cashflow-Rendite", wert: prozentOhneVz(v.fcfYield.value), zusatz: "Free Cashflow (" + v.fcfYield.basis + ") / Marktwert" } : null,
      v.marketCap ? { label: "Marktwert", wert: geld(v.marketCap.value, "USD"), zusatz: "Kurs × " + geld(v.marketCap.shares, "shares") + " Aktien (Ende GJ " + v.marketCap.sharesFy + ")" } : null
    ].filter(Boolean);
    section.appendChild(el("div", { class: "dx-firma" }, zeilen.map(function (z) {
      return el("div", {}, [el("span", { text: z.label }), el("b", { class: "num", text: z.wert }), el("em", { text: z.zusatz })]);
    })));
    section.appendChild(el("p", { class: "dx-kapitel-fuss", text: "Bewertung ist ein Verhältnis, kein Urteil: " + (v.context && v.context.rule ? v.context.rule + ". " : "") +
      "Kurs " + (isNum(v.price) ? v.price.toFixed(2).replace(".", ",") + " $" : "–") + ", Stand der Fundamentals " + (f.asOf || "") + ". Keine Empfehlung." }));
    return section;
  }

  /* ---------------------------------------------------- NEXT DISCOVERY */
  function nextDiscovery(detail, options) {
    var nd = detail.discoverNext;
    if (!nd) return null;
    var universeId = options.universeId || detail.universeId;
    var reihen = ["similar", "sameTheme", "similarGrowth", "cheaperAlternatives", "similarQuality", "sameSector"]
      .map(function (k) { return nd[k] ? Object.assign({ key: k }, nd[k]) : null; }).filter(function (r) { return r && r.cards && r.cards.length; });
    if (!reihen.length) return null;
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--next" }, [
      el("p", { class: "dx-kicker", text: "Weiter entdecken" }),
      el("h2", { text: "Die nächste Aktie" })
    ]);
    reihen.forEach(function (r) {
      section.appendChild(C().railHead(r.title.toUpperCase(), r.rule, r.rowId ? { href: "#/c/" + universeId + "/" + r.rowId, moreLabel: "Thema öffnen" } : {}));
      var track = el("div", { class: "dx-rail", role: "list", style: "padding-left:0;padding-right:0" });
      r.cards.forEach(function (card, i) {
        var item = C().poster(card, { rowId: r.key, universeId: universeId, variant: "compact", position: i + 1 });
        item.setAttribute("role", "listitem");
        track.appendChild(item);
      });
      section.appendChild(C().withRailNav(track, {
        label: "next-" + r.key,
        prefetch: function (index) {
          var karte = r.cards[index];
          if (!karte || !D.Swipe) return;
          D.Swipe.vorladen("/discover/data/stocks/" + universeId + "/" + karte.symbol + ".json");
        }
      }));
    });
    section.appendChild(el("div", { class: "dx-cta", style: "margin-top:20px" }, [
      el("a", { class: "dx-btn", href: "#/einzeln/" + universeId, text: "Einzeln weiter entdecken →" }),
      el("a", { class: "dx-btn dx-btn--ghost", href: "#/u/" + universeId, text: "Zurück zu Discover" })
    ]));
    return section;
  }

  /* --------------------------------------------- fuer Einordnung/Waage */
  /** Fundamentale Zeilen fuer "in 30 Sekunden" (Profitabilitaet, Cashflow, Bilanz, Verwaesserung). */
  function healthZeilen(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available || !f.health || !f.health.available) return [];
    var tonVon = { "Sehr stark": "up", "Stark": "up", "Sehr solide": "up", "Solide": null, "Rückkäufe": "up", "Gering": null,
                   "Flach": null, "Knapp": null, "Moderat": "warm", "Belastet": "warm", "Hoch": "warm", "Angespannt": "down", "Negativ": "down", "Ruecklaeufig": "down" };
    return f.health.categories.filter(function (c) { return c.id !== "growth"; }).map(function (c) {
      return { id: "f_" + c.id, label: c.label, wert: c.grade, ton: tonVon[c.grade] || null, beleg: c.detail };
    });
  }

  /** Belegte Chancen und Risiken aus den Fundamentals. */
  function waageZeilen(detail) {
    var f = detail.fundamentals;
    var dafuer = [], beachten = [];
    if (!f || !f.available) return { dafuer: dafuer, beachten: beachten };
    var cats = (f.health && f.health.categories) || [];
    var byId = {}; cats.forEach(function (c) { byId[c.id] = c; });
    var st = (f.story && f.story.statements) || [];
    st.forEach(function (s) {
      if (["revenue_doubled", "profit_faster", "margin_up", "turned_profitable", "shares_down", "fcf_up"].indexOf(s.id) !== -1)
        dafuer.push({ id: "f_" + s.id, text: s.text.replace(/\.$/, ""), beleg: "GJ " + s.evidence.periodStart.fy + " → " + s.evidence.periodEnd.fy });
      if (["revenue_down", "profit_slower", "margin_down", "turned_loss", "shares_up", "fcf_down", "fcf_negative", "debt_faster"].indexOf(s.id) !== -1)
        beachten.push({ id: "f_" + s.id, text: s.text.replace(/\.$/, ""), beleg: "GJ " + s.evidence.periodStart.fy + " → " + s.evidence.periodEnd.fy });
    });
    if (byId.balance && byId.balance.grade === "Sehr solide") dafuer.push({ id: "f_netcash", text: "Mehr Kasse als Schulden", beleg: byId.balance.detail });
    if (byId.balance && (byId.balance.grade === "Belastet" || byId.balance.grade === "Angespannt")) beachten.push({ id: "f_debt", text: "Die Verschuldung ist hoch im Verhältnis zum freien Cashflow", beleg: byId.balance.detail });
    if (byId.dilution && (byId.dilution.grade === "Hoch" || byId.dilution.grade === "Moderat")) beachten.push({ id: "f_dilution", text: "Die Aktienanzahl steigt — bestehende Anteile werden verwässert", beleg: byId.dilution.detail });
    if (byId.cashflow && byId.cashflow.grade === "Negativ") beachten.push({ id: "f_fcfneg", text: "Das Unternehmen verbrennt Geld", beleg: byId.cashflow.detail });
    var v = f.valuation;
    if (v && v.relative && v.relative.stufe === "hoch") beachten.push({ id: "f_val", text: "Die Aktie ist deutlich höher bewertet als der breite Markt", beleg: "KGV " + (Math.round(v.pe.value * 10) / 10).toFixed(1).replace(".", ",") + " gegen Median " + (Math.round(v.relative.peMedian * 10) / 10).toFixed(1).replace(".", ",") });
    if (v && v.relative && v.relative.stufe === "niedrig" && byId.profitability && (byId.profitability.grade === "Stark" || byId.profitability.grade === "Sehr stark"))
      dafuer.push({ id: "f_valniedrig", text: "Günstiger bewertet als der breite Markt — bei guter Profitabilität", beleg: "KGV " + (Math.round(v.pe.value * 10) / 10).toFixed(1).replace(".", ",") });
    return { dafuer: dafuer, beachten: beachten };
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.DetailFundamentals = { damalsHeute: damalsHeute, journey: journey, heute: heute, bewertung: bewertung,
                                          nextDiscovery: nextDiscovery, healthZeilen: healthZeilen, waageZeilen: waageZeilen,
                                          fehlt: fehlt, geld: geld };
})(window);
