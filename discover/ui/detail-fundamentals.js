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
  /* --------------------------------------------------------------------
     GELDFORMATIERUNG: ZENTRAL, NICHT HIER (O-12)
     --------------------------------------------------------------------

     Diese Datei formatierte Betraege selbst - mit eigener Skalenleiter
     und einem fest verdrahteten Dollarzeichen. Sie war damit eine von
     mehreren Stellen, die dasselbe taten und auseinanderlaufen konnten;
     der Currency Debt Register fuehrte sie als Klasse A.

     Jetzt ruft sie quant/engines/fx/money-format.js. Was sie NICHT tut:
     rechnen. Die Umrechnung gehoert in den Core, hier steht nur noch die
     Darstellung (§49: Presentation Helpers sind erlaubt, Currency
     Mathematics nicht).

     `numberLocale: "de-DE"` haelt das Aussehen fest, das das Produkt
     heute hat - deutsche Zahlen mit Dollarzeichen. Eine Migration, die
     nebenbei die Oberflaeche umgestaltet, ist keine Migration (§28).

     Ist der Core nicht geladen, bleibt die bisherige Darstellung als
     Rueckfall. Eine zentrale Formatierung, die eine Seite leer laesst,
     waere schlechter als die verteilte, die sie ersetzt.
  */
  function vuFormat(fn, value, currency, opts) {
    var F = (typeof VUFx !== "undefined" && VUFx && VUFx.Format) ? VUFx.Format : null;
    if (F && typeof F[fn] === "function") {
      return F[fn](value, currency || "USD", opts);
    }
    return null;
  }

  function geld(v, unit) {
    if (!isNum(v)) return "–";
    /* Stueckzahlen sind kein Geld - sie tragen nie ein Waehrungszeichen. */
    if (unit === "shares") return Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2).replace(".", ",") + " Mrd." : (v / 1e6).toFixed(0) + " Mio.";

    var cur = (typeof unit === "string" && unit.indexOf("/") > 0) ? unit.split("/")[0] : (unit || "USD");
    var a = Math.abs(v);
    var zentral = (unit === "USD/shares")
      ? vuFormat("formatPrice", v, cur, { numberLocale: "de-DE", decimals: 2 })
      : (a >= 1e6
          ? vuFormat("formatCompact", v, cur, { numberLocale: "de-DE", decimals: a >= 1e9 ? 1 : 0 })
          : vuFormat("formatPrice", v, cur, { numberLocale: "de-DE", decimals: 0 }));
    if (zentral) return zentral;

    if (unit === "USD/shares") return (Math.round(v * 100) / 100).toFixed(2).replace(".", ",") + " $";
    if (a >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mrd. $";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + " Mio. $";
    return Math.round(v).toLocaleString("de-DE") + " $";
  }
  function prozent(v, digits) {
    if (!isNum(v)) return "–";
    var d = digits === undefined ? 0 : digits;
    var abs = Math.abs(v * 100);
    var text = abs >= 1000 ? Math.round(abs).toLocaleString("de-DE") : abs.toFixed(d).replace(".", ",");
    return (v > 0 ? "+" : v < 0 ? "−" : "") + text + " %";
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
  /* V4.1 §11: kein Quellenblock im Kapitel - eine Zeile mit dem Zeitraum
     und dem Weg zu Daten & Quellen, wo alles steht. */
  function fussLink(f) {
    var jahre = f && f.fiscalYears && f.fiscalYears.length ? "Geschäftsjahre " + f.fiscalYears[0] + "–" + f.fiscalYears[f.fiscalYears.length - 1] : "Geschäftszahlen";
    return el("p", { class: "dx-kapitel-fuss dx-kapitel-fuss--link" }, [
      document.createTextNode(jahre + " aus den Jahresabschlüssen · "),
      el("a", { href: "#/daten", text: "Daten & Quellen" })
    ]);
  }
  function quelleFuss(f) { return fussLink(f); }

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
    /* Ein Split im Zeitraum: die Je-Aktie-Zeilen fehlen, und der Grund steht da. */
    if (c.note) section.appendChild(el("p", { class: "dx-damals-note", text: c.note }));
    section.appendChild(fussLink(f));
    return section;
  }

  /* ----------------------------------------------------------- JOURNEY */
  /* V4.1 §7-8: die Journey ist eine Buehne. Ein Balken je Geschaeftsjahr,
     pixelgenau, auf dem Telefon rund 40 % des Bildschirms hoch; Farbe:
     Weltfarbe fuer positive, Rot fuer negative Werte; der letzte Balken
     hervorgehoben, der erste und der letzte Wert beschriftet. */
  function balken(points, opts) {
    opts = opts || {};
    var w = opts.width || 640, h = opts.height || 180, pad = 26, padTop = 30;
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
    var slot = (w - 2 * pad) / n, bw = Math.max(6, Math.min(slot * 0.62, 46));
    var innen = h - padTop - pad - 14;
    var y0 = padTop + (max / span) * innen;
    var axis = document.createElementNS(ns, "line");
    axis.setAttribute("x1", pad); axis.setAttribute("x2", w - pad); axis.setAttribute("y1", y0); axis.setAttribute("y2", y0);
    axis.setAttribute("class", "dx-journey-axis");
    svg.appendChild(axis);
    points.forEach(function (p, i) {
      var x = pad + i * slot + (slot - bw) / 2;
      var hh = Math.abs(p.v) / span * innen;
      var rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x); rect.setAttribute("width", bw);
      rect.setAttribute("y", p.v >= 0 ? y0 - hh : y0); rect.setAttribute("height", Math.max(1.5, hh));
      rect.setAttribute("rx", Math.min(4, bw / 3));
      rect.setAttribute("class", "dx-journey-bar" + (p.v < 0 ? " down" : "") + (i === n - 1 ? " last" : ""));
      var t = document.createElementNS(ns, "title");
      t.textContent = "GJ " + p.fy + ": " + (opts.format ? opts.format(p.v) : p.v);
      rect.appendChild(t);
      svg.appendChild(rect);
      if (n <= 10 || i % 2 === (n - 1) % 2) {
        var lbl = document.createElementNS(ns, "text");
        lbl.setAttribute("x", x + bw / 2); lbl.setAttribute("y", h - 6); lbl.setAttribute("text-anchor", "middle");
        lbl.setAttribute("class", "dx-journey-year");
        lbl.textContent = String(p.fy).slice(2);
        svg.appendChild(lbl);
      }
      /* Der erste und der letzte Wert stehen am Balken - die Spanne, die
         der Satz darunter beschreibt. */
      if ((i === 0 || i === n - 1) && opts.format) {
        var wert = document.createElementNS(ns, "text");
        var oben = p.v >= 0 ? y0 - hh - 7 : y0 + hh + 14;
        wert.setAttribute("x", x + bw / 2); wert.setAttribute("y", Math.max(12, oben)); wert.setAttribute("text-anchor", i === 0 ? "start" : "end");
        wert.setAttribute("class", "dx-journey-wert" + (i === n - 1 ? " last" : ""));
        wert.textContent = opts.format(p.v);
        svg.appendChild(wert);
      }
    });
    return svg;
  }

  /* Eine Zahl, wie man sie sagt: "mehr als verneunzehnfacht", "+61 %",
     "von Verlust zu Gewinn", "um 12 Prozentpunkte gestiegen". */
  var VIELFACHE = { 2: "verdoppelt", 3: "verdreifacht", 4: "vervierfacht", 5: "verfünffacht", 6: "versechsfacht", 7: "versiebenfacht", 8: "verachtfacht", 9: "verneunfacht", 10: "verzehnfacht",
                    11: "verelffacht", 12: "verzwölffacht", 13: "verdreizehnfacht", 14: "vervierzehnfacht", 15: "verfünfzehnfacht", 16: "versechzehnfacht", 17: "versiebzehnfacht", 18: "verachtzehnfacht", 19: "verneunzehnfacht", 20: "verzwanzigfacht" };
  function journeySatz(sp, erst, letzt, jahre) {
    if (!isNum(erst.v) || !isNum(letzt.v)) return null;
    var was = sp.satzName || sp.label;
    if (sp.kind === "margin") {
      var pp = (letzt.v - erst.v) * 100;
      if (Math.abs(pp) < 1) return was + " ist über " + jahre + " Jahre nahezu unverändert (" + prozentOhneVz(letzt.v) + ").";
      return was + " ist in " + jahre + " Jahren um " + Math.abs(pp).toFixed(0).replace(".", ",") + " Prozentpunkte " + (pp > 0 ? "gestiegen" : "gesunken") + " — von " + prozentOhneVz(erst.v) + " auf " + prozentOhneVz(letzt.v) + ".";
    }
    if (erst.v <= 0 && letzt.v > 0) return was + " war vor " + jahre + " Jahren negativ — heute " + sp.fmt(letzt.v) + ".";
    if (erst.v > 0 && letzt.v <= 0) return was + " war vor " + jahre + " Jahren positiv (" + sp.fmt(erst.v) + ") — heute negativ.";
    if (erst.v <= 0 && letzt.v <= 0) return was + " ist über " + jahre + " Jahre negativ geblieben.";
    var faktor = letzt.v / erst.v;
    if (faktor >= 2) {
      var ganz = Math.floor(faktor);
      if (!VIELFACHE[ganz]) return was + " ist in " + jahre + " Jahren auf " + (faktor - ganz > 0.05 ? "mehr als " : "") + "das " + ganz + "-Fache gestiegen.";
      return was + " hat sich in " + jahre + " Jahren " + (faktor - ganz > 0.05 ? "mehr als " : "") + VIELFACHE[ganz] + ".";
    }
    var pct = (faktor - 1) * 100;
    if (Math.abs(pct) < 3) return was + " ist über " + jahre + " Jahre nahezu unverändert.";
    return was + " ist in " + jahre + " Jahren um " + Math.abs(pct).toFixed(0) + " % " + (pct > 0 ? "gestiegen" : "gesunken") + ".";
  }

  var SPUREN = [
    { id: "revenue", label: "Umsatz", satzName: "Der Umsatz", frage: "Wie viel setzt das Unternehmen um?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "net_income", label: "Gewinn", satzName: "Der Nettogewinn", frage: "Was bleibt unter dem Strich?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "free_cash_flow", label: "Cashflow", satzName: "Der freie Cashflow", frage: "Wie viel Geld bleibt nach Investitionen?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "margins.gross", label: "Bruttomarge", satzName: "Die Bruttomarge", kind: "margin", frage: "Wie viel vom Umsatz bleibt nach den direkten Kosten?", fmt: function (v) { return prozentOhneVz(v); } },
    { id: "margins.operating", label: "Op. Marge", satzName: "Die operative Marge", kind: "margin", frage: "Wie viel vom Umsatz bleibt operativ?", fmt: function (v) { return prozentOhneVz(v); } },
    { id: "margins.net", label: "Nettomarge", satzName: "Die Nettomarge", kind: "margin", frage: "Wie viel vom Umsatz bleibt als Gewinn?", fmt: function (v) { return prozentOhneVz(v); } },
    { id: "eps_diluted", label: "Gewinn je Aktie", satzName: "Der Gewinn je Aktie", frage: "Was verdient eine einzelne Aktie?", fmt: function (v) { return geld(v, "USD/shares"); } },
    { id: "cash", label: "Kasse", satzName: "Die Kasse", frage: "Wie viel Geld liegt auf dem Konto?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "debt", label: "Schulden", satzName: "Die Verschuldung", frage: "Wie hoch sind die Schulden?", fmt: function (v) { return geld(v, "USD"); } },
    { id: "shares", label: "Aktien", satzName: "Die Aktienanzahl", frage: "Wird verwässert oder zurückgekauft?", fmt: function (v) { return geld(v, "shares"); } }
  ];
  function spurPunkte(tracks, id) {
    if (id.indexOf("margins.") === 0) return (tracks.margins && tracks.margins[id.slice(8)]) || [];
    return tracks[id] || [];
  }
  function journeyMass(host) {
    var mobil = global.innerWidth < 860;
    var w = Math.round(host.getBoundingClientRect().width || host.clientWidth || 0);
    if (!w) w = mobil ? Math.max(320, global.innerWidth - 32) : 1120;
    var h = mobil ? Math.round(Math.max(230, Math.min(global.innerHeight * 0.38, 360))) : 340;
    return { w: w, h: h };
  }

  function journey(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available) return null;
    var j = f.journey;
    if (!j || !j.available) return null;
    var name = detail.companyName || detail.symbol;
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--journey", id: "journey" }, [
      el("p", { class: "dx-kicker", text: "Fundamental Journey" }),
      el("h2", { text: "Wie sich " + name + " entwickelt hat" })
    ]);
    var story = f.story;
    if (story && story.available && story.statements.length) {
      section.appendChild(el("ul", { class: "dx-story-list dx-story-list--detail" }, story.statements.slice(0, 3).map(function (s) {
        return el("li", {}, [
          el("i", { class: "dx-story-dot", "aria-hidden": "true" }),
          el("span", { text: s.text }),
          el("small", { text: " GJ " + s.evidence.periodStart.fy + " → " + s.evidence.periodEnd.fy })
        ]);
      })));
    }
    var host = el("div", { class: "dx-journey dx-journey--stage" });
    var spuren = SPUREN.filter(function (sp) { var p = spurPunkte(j.tracks, sp.id); return p && p.length >= 2; });
    if (!spuren.length) return null;
    var tabs = el("div", { class: "dx-journey-tabs", role: "tablist", "aria-label": "Kennzahl" });
    var kopf = el("div", { class: "dx-journey-kopf" });
    var bild = el("div", { class: "dx-journey-bild" });
    var satz = el("p", { class: "dx-journey-satz" });
    var aktiv = 0;
    function zeichne(i) {
      aktiv = i;
      S.clear(bild); S.clear(kopf);
      var sp = spuren[i];
      Array.prototype.forEach.call(tabs.children, function (b, k) { b.setAttribute("aria-selected", String(k === i)); });
      var aktiverTab = tabs.children[i];
      if (aktiverTab && aktiverTab.scrollIntoView) { try { aktiverTab.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); } catch (e) { /* alte Browser */ } }
      var p = spurPunkte(j.tracks, sp.id);
      var erst = p[0], letzt = p[p.length - 1];
      var jahre = letzt.fy - erst.fy;
      var caveat = (j.caveats || {})[sp.id] || null;
      /* Der Kopf der Buehne: von -> nach, die Veraenderung gross. */
      var delta = null;
      if (!caveat && isNum(erst.v) && isNum(letzt.v)) {
        if (sp.kind === "margin") delta = { text: ((letzt.v - erst.v) >= 0 ? "+" : "−") + Math.abs((letzt.v - erst.v) * 100).toFixed(1).replace(".", ",") + " Pp.", ton: ton(letzt.v - erst.v) };
        else if (erst.v > 0) delta = { text: prozent(letzt.v / erst.v - 1), ton: ton(letzt.v / erst.v - 1) };
      }
      kopf.appendChild(el("div", { class: "dx-journey-von" }, [el("b", { class: "num", text: sp.fmt(erst.v) }), el("span", { text: "GJ " + erst.fy })]));
      kopf.appendChild(el("span", { class: "dx-journey-pfeil", "aria-hidden": "true", text: "→" }));
      kopf.appendChild(el("div", { class: "dx-journey-nach" }, [el("b", { class: "num", text: sp.fmt(letzt.v) }), el("span", { text: "GJ " + letzt.fy })]));
      if (delta) kopf.appendChild(el("div", { class: "dx-journey-delta num " + (delta.ton || "") }, [el("b", { text: delta.text }), el("span", { text: jahre + " Jahre" })]));
      var mass = journeyMass(bild);
      bild.appendChild(balken(p, { label: sp.label + " je Geschäftsjahr", format: sp.fmt, width: mass.w, height: mass.h }));
      var text = caveat ? null : journeySatz(sp, erst, letzt, jahre);
      satz.textContent = text || sp.frage;
      satz.className = "dx-journey-satz" + (caveat ? " dx-journey-satz--caveat" : "");
      if (caveat) satz.textContent = caveat;
      if (D.Analytics && D.Analytics.track && i !== 0) D.Analytics.track("detail:journey", { symbol: detail.symbol, track: sp.id });
    }
    spuren.forEach(function (sp, i) {
      var b = el("button", { type: "button", role: "tab", class: "dx-journey-tab", text: sp.label, "aria-selected": String(i === 0), "data-track": sp.id });
      b.addEventListener("click", function () { zeichne(i); });
      tabs.appendChild(b);
    });
    host.appendChild(tabs); host.appendChild(kopf); host.appendChild(bild); host.appendChild(satz);
    section.appendChild(host);
    /* Von aussen anwaehlbar (die Zahlen-Karten unten springen hierher). */
    section.__zeige = function (trackId) {
      var i = spuren.map(function (sp) { return sp.id; }).indexOf(trackId);
      if (i >= 0) zeichne(i);
      return i >= 0;
    };
    var resizeTimer = null, breite = global.innerWidth;
    global.addEventListener("resize", function () {
      if (global.innerWidth === breite || !section.isConnected) return;
      breite = global.innerWidth;
      if (resizeTimer) global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(function () { zeichne(aktiv); }, 180);
    });
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
        ])
      ]));
    }
    section.appendChild(fussLink(f));
    return section;
  }

  /* --------------------------------------- DAS UNTERNEHMEN IN ZAHLEN */
  /* V4.1 §9: keine Liste, vier Karten - Wachstum, Profitabilitaet,
     Cashflow, Bilanz. Je Karte eine grosse Zahl, eine Einordnung, ein Satz;
     Tippen zeigt die Spur in der Journey. Alles Weitere hinter "Weitere
     Kennzahlen". Nichts wird weggelassen, es wird nur geordnet. */
  function heute(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available) return null;
    var l = f.latest;
    if (!l || !l.available) return null;
    var g = detail.geschaeftszahlen || {};
    var name = detail.companyName || detail.symbol;
    var a = l.annual || {}, t = l.ttm || {}, dv = l.derived || {};
    var cats = {}; ((f.health && f.health.categories) || []).forEach(function (c) { cats[c.id] = c; });
    var story = {}; (((f.story || {}).statements) || []).forEach(function (s) { story[s.id] = s; });
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--zahlen" }, [
      el("p", { class: "dx-kicker", text: "Das Unternehmen in Zahlen" }),
      el("h2", { text: "Wie steht " + name + " da?" }),
      el("p", { class: "dx-chapter-lead", text: "Geschäftsjahr " + l.fiscalYear + " aus dem Jahresabschluss. Tippen zeigt die Entwicklung über die Jahre." })
    ]);
    function satzAus(ids, sonst) {
      for (var i = 0; i < ids.length; i++) if (story[ids[i]]) return story[ids[i]].text;
      return sonst || null;
    }
    var karten = [];
    if (a.revenue) {
      var wachs = cats.growth;
      karten.push({ id: "growth", track: "revenue", label: "Wachstum", grade: wachs ? wachs.grade : null, ton: gradeTon(wachs),
        zahl: geld(a.revenue.v, a.revenue.unit), einheit: "Umsatz GJ " + l.fiscalYear,
        sub: isNum(g.umsatzWachstum) ? prozent(g.umsatzWachstum) + (g.basis === "FY" ? " zum Vorjahr" : " zu den zwölf Monaten davor") : (wachs ? wachs.detail : null),
        satz: satzAus(["revenue_doubled", "revenue_down"], wachs ? wachs.detail : null) });
    }
    if (a.net_income) {
      var prof = cats.profitability;
      karten.push({ id: "profitability", track: "net_income", label: "Profitabilität", grade: prof ? prof.grade : null, ton: gradeTon(prof),
        zahl: geld(a.net_income.v, a.net_income.unit), einheit: (a.net_income.v < 0 ? "Verlust" : "Gewinn") + " GJ " + l.fiscalYear,
        sub: isNum(dv.netMargin) ? "Nettomarge " + prozentOhneVz(dv.netMargin) : (isNum(dv.operatingMargin) ? "Operative Marge " + prozentOhneVz(dv.operatingMargin) : null),
        satz: satzAus(["turned_profitable", "profit_faster", "profit_slower", "margin_up", "margin_down", "turned_loss"], prof ? prof.detail : null) });
    }
    if (a.free_cash_flow) {
      var cf = cats.cashflow;
      karten.push({ id: "cashflow", track: "free_cash_flow", label: "Cashflow", grade: cf ? cf.grade : null, ton: gradeTon(cf),
        zahl: geld(a.free_cash_flow.v, a.free_cash_flow.unit), einheit: "Free Cashflow GJ " + l.fiscalYear,
        sub: isNum(dv.fcfMargin) ? prozentOhneVz(dv.fcfMargin) + " vom Umsatz bleiben frei" : null,
        satz: satzAus(["fcf_up", "fcf_down", "fcf_negative"], cf ? cf.detail : null) });
    }
    if (a.cash_and_equivalents || a.total_debt) {
      var bal = cats.balance;
      var kasse = a.cash_and_equivalents ? geld(a.cash_and_equivalents.v, a.cash_and_equivalents.unit) : null;
      karten.push({ id: "balance", track: a.cash_and_equivalents ? "cash" : "debt", label: "Bilanz", grade: bal ? bal.grade : null, ton: gradeTon(bal),
        zahl: kasse || geld(a.total_debt.v, a.total_debt.unit), einheit: (kasse ? "Kasse" : "Schulden") + " Ende GJ " + l.fiscalYear,
        sub: a.total_debt ? (kasse ? "Schulden " + geld(a.total_debt.v, a.total_debt.unit) : null) : "Keine Finanzschulden gemeldet",
        satz: bal ? bal.detail : null });
    }
    if (!karten.length) return null;
    var gitter = el("div", { class: "dx-zahlen" });
    karten.forEach(function (k) {
      var karte = el("button", { type: "button", class: "dx-zahlen-karte", "data-cluster": k.id, "data-track": k.track,
                                 "aria-label": k.label + ": " + k.zahl + " " + k.einheit + ". Entwicklung anzeigen." }, [
        el("div", { class: "dx-zahlen-kopf" }, [
          el("span", { class: "dx-zahlen-label", text: k.label }),
          k.grade ? el("span", { class: "dx-zahlen-grade " + (k.ton || ""), text: k.grade }) : null
        ]),
        el("b", { class: "dx-zahlen-zahl num", text: k.zahl }),
        el("span", { class: "dx-zahlen-einheit", text: k.einheit }),
        k.sub ? el("span", { class: "dx-zahlen-sub", text: k.sub }) : null,
        k.satz ? el("p", { class: "dx-zahlen-satz", text: k.satz }) : null,
        el("span", { class: "dx-zahlen-cta", text: "Entwicklung ansehen →" })
      ]);
      karte.addEventListener("click", function () {
        var j = document.querySelector(".dx-chapter--journey");
        if (j && j.__zeige && j.__zeige(k.track)) { j.scrollIntoView({ behavior: "smooth", block: "start" }); }
        if (D.Analytics && D.Analytics.track) D.Analytics.track("detail:cluster", { symbol: detail.symbol, cluster: k.id });
      });
      gitter.appendChild(karte);
    });
    section.appendChild(gitter);
    /* Alles Weitere - nichts fehlt, es steht nur nicht im Weg. */
    var weitere = [
      t.revenue ? { label: "Umsatz zwölf Monate (bis " + t.revenue.through.replace("FY", "GJ ").replace("Q", " Q") + ")", wert: geld(t.revenue.v, t.revenue.unit) } : null,
      t.net_income ? { label: "Nettogewinn zwölf Monate", wert: geld(t.net_income.v, t.net_income.unit), ton: ton(t.net_income.v) } : null,
      isNum(dv.grossMargin) ? { label: "Bruttomarge GJ " + l.fiscalYear, wert: prozentOhneVz(dv.grossMargin) } : null,
      isNum(dv.operatingMargin) ? { label: "Operative Marge GJ " + l.fiscalYear, wert: prozentOhneVz(dv.operatingMargin) } : null,
      isNum(dv.netMargin) ? { label: "Nettomarge GJ " + l.fiscalYear, wert: prozentOhneVz(dv.netMargin) } : null,
      isNum(dv.fcfMargin) ? { label: "Free-Cashflow-Marge GJ " + l.fiscalYear, wert: prozentOhneVz(dv.fcfMargin) } : null,
      isNum(dv.roe) ? { label: "Eigenkapitalrendite GJ " + l.fiscalYear, wert: prozentOhneVz(dv.roe) } : null,
      a.eps_diluted ? { label: "Gewinn je Aktie GJ " + l.fiscalYear, wert: geld(a.eps_diluted.v, "USD/shares") } : null,
      a.cash_and_equivalents ? { label: "Kasse (Ende GJ " + l.fiscalYear + ")", wert: geld(a.cash_and_equivalents.v, a.cash_and_equivalents.unit) } : null,
      a.total_debt ? { label: "Schulden (Ende GJ " + l.fiscalYear + ")", wert: geld(a.total_debt.v, a.total_debt.unit) } : null,
      a.shares_outstanding ? { label: "Aktien (Ende GJ " + l.fiscalYear + ")", wert: geld(a.shares_outstanding.v, "shares") } : null,
      isNum(g.dividendenRendite) ? { label: "Dividendenrendite", wert: prozentOhneVz(g.dividendenRendite) } : null
    ].filter(Boolean);
    if (weitere.length) {
      var auf = el("details", { class: "dx-weitere" }, [
        el("summary", { text: "Weitere Kennzahlen (" + weitere.length + ")" }),
        el("div", { class: "dx-firma dx-firma--heute" }, weitere.map(function (z) {
          return el("div", {}, [el("span", { text: z.label }), el("b", { class: "num " + (z.ton || ""), text: z.wert })]);
        })),
        el("p", { class: "dx-kapitel-fuss", text: "Geschäftsjahr aus dem Jahresabschluss, zwölf Monate aus den vier jüngsten Quartalen — getrennt, nie gemischt." })
      ]);
      section.appendChild(auf);
    }
    section.appendChild(fussLink(f));
    return section;
  }
  function gradeTon(cat) {
    if (!cat) return "";
    var g = cat.grade;
    if (/Sehr stark|Stark|Sehr solide|Rückkäufe/.test(g)) return "up";
    if (/Angespannt|Negativ|Rückläufig/.test(g)) return "down";
    if (/Moderat|Belastet|Hoch/.test(g)) return "warm";
    return "";
  }

  /* --------------------------------------------------------- BEWERTUNG */
  /* V4.1 §10: zuerst ein Satz, dann ein Bild - der Titel gegen den Markt
     als zwei Balken; Gewinn, Umsatz, Cashflow als Sichten. Ein KGV mit
     winzigem Nenner (Nettomarge unter 3 % oder KGV ueber 75) heisst
     "nur eingeschraenkt aussagekraeftig", und die Umsatz-Sicht kommt zuerst. */
  var BEWERTUNG_SANITY = { maxPe: 75, minNetMargin: 0.03 };
  function bewertung(detail) {
    var f = detail.fundamentals;
    if (!f || !f.available) return null;
    var v = f.valuation;
    var name = detail.companyName || detail.symbol;
    if (!v || !v.available) {
      return el("section", { class: "dx-chapter dx-fade" }, [
        el("p", { class: "dx-kicker", text: "Bewertung" }),
        el("h2", { text: "Ist " + name + " teuer?" }),
        el("p", { class: "dx-why-empty", text: v && v.reason === "NO_PRICE" ? "Ohne ausgelieferten Kurs lässt sich die Bewertung nicht berechnen." : "Für diesen Titel liegen keine Gewinn- oder Umsatzzahlen vor, gegen die sich der Kurs messen ließe." })
      ]);
    }
    var section = el("section", { class: "dx-chapter dx-fade dx-chapter--bewertung" }, [
      el("p", { class: "dx-kicker", text: "Bewertung" }),
      el("h2", { text: "Ist " + name + " teuer?" })
    ]);
    var rel = v.relative, ctx = v.context || {};
    var netMargin = f.latest && f.latest.derived ? f.latest.derived.netMargin : null;
    var eingeschraenkt = !!(v.pe && (v.pe.value > BEWERTUNG_SANITY.maxPe || (isNum(netMargin) && netMargin < BEWERTUNG_SANITY.minNetMargin)));
    var runde = function (x) { return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); };
    /* Der Satz zuerst. */
    if (eingeschraenkt) {
      section.appendChild(el("p", { class: "dx-bewertung-satz", "data-stufe": "eingeschraenkt" }, [
        el("b", { text: "Das Kurs-Gewinn-Verhältnis ist derzeit nur eingeschränkt aussagekräftig." }),
        document.createTextNode(" Bei " + runde(v.pe.value) + " ist der Gewinn sehr klein im Verhältnis zum Kurs" +
          (isNum(netMargin) ? " (Nettomarge " + prozentOhneVz(netMargin) + ")" : "") + " — ein solches Vielfaches misst eher, wie wenig Gewinn übrig bleibt, als wie teuer die Aktie ist." +
          (v.ps && isNum(ctx.psMedian) ? " Aussagekräftiger ist hier das Kurs-Umsatz-Verhältnis: " + runde(v.ps.value) + " gegenüber " + runde(ctx.psMedian) + " im breiten Markt." : ""))
      ]));
    } else if (rel && rel.label) {
      section.appendChild(el("p", { class: "dx-bewertung-satz", "data-stufe": rel.stufe }, [
        el("b", { text: rel.label + "." }),
        document.createTextNode(" Die Aktie kostet das " + runde(v.pe.value) + "-Fache des Jahresgewinns; im breiten Markt sind es " + runde(rel.peMedian) + " (Median von " + rel.universeCount.toLocaleString("de-DE") + " Unternehmen mit Gewinn).")
      ]));
    } else if (v.peReason) {
      section.appendChild(el("p", { class: "dx-bewertung-satz", text: v.peReason === "SOURCE_MISSING" ? "Kein Kurs-Gewinn-Verhältnis: das Unternehmen schreibt zuletzt keinen Gewinn oder es fehlt der Gewinn je Aktie." : "Kein Kurs-Gewinn-Verhältnis berechenbar." }));
    }
    /* Das Bild: der Titel gegen den Markt, drei Sichten. */
    var sichten = [];
    if (v.pe && isNum(ctx.peMedian)) sichten.push({ id: "pe", label: "Gewinn", titel: "Kurs-Gewinn-Verhältnis", wert: v.pe.value, markt: ctx.peMedian, fmt: runde,
      erklaerung: "Das Wievielfache des Jahresgewinns (" + v.pe.basis + ") die Aktie kostet. Höher heißt: mehr Erwartung im Kurs.", eingeschraenkt: eingeschraenkt });
    if (v.ps && isNum(ctx.psMedian)) sichten.push({ id: "ps", label: "Umsatz", titel: "Kurs-Umsatz-Verhältnis", wert: v.ps.value, markt: ctx.psMedian, fmt: runde,
      erklaerung: "Der Marktwert im Verhältnis zum Umsatz (" + v.ps.basis + "). Unabhängig davon, ob gerade Gewinn übrig bleibt." });
    if (v.fcfYield) sichten.push({ id: "fcf", label: "Cashflow", titel: "Free-Cashflow-Rendite", wert: v.fcfYield.value, markt: null, fmt: function (x) { return prozentOhneVz(x); },
      erklaerung: "Wie viel freier Cashflow (" + v.fcfYield.basis + ") je Jahr auf den Marktwert entfällt — wie ein Zins, den das Geschäft selbst erwirtschaftet." });
    if (sichten.length) {
      var start = eingeschraenkt && sichten.some(function (s) { return s.id === "ps"; }) ? "ps" : sichten[0].id;
      var tabs = el("div", { class: "dx-journey-tabs dx-bewertung-tabs", role: "tablist", "aria-label": "Bewertungssicht" });
      var bild = el("div", { class: "dx-bewertung-bild" });
      function zeige(id) {
        S.clear(bild);
        var s = sichten.filter(function (x) { return x.id === id; })[0];
        Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-id") === id)); });
        bild.appendChild(el("h3", { text: s.titel + (s.eingeschraenkt ? " · nur eingeschränkt aussagekräftig" : "") }));
        var maxWert = Math.max(s.wert, s.markt || 0, 1e-9);
        var breite = function (x) { return Math.max(3, Math.min(100, x / maxWert * 100)); };
        var zeilen = [{ name: name, wert: s.wert, eigen: true }];
        if (isNum(s.markt)) zeilen.push({ name: "Breiter Markt (Median)", wert: s.markt, eigen: false });
        zeilen.forEach(function (z) {
          bild.appendChild(el("div", { class: "dx-bewertung-zeile" + (z.eigen ? " dx-bewertung-zeile--eigen" : "") }, [
            el("span", { class: "dx-bewertung-name", text: z.name }),
            el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [el("i", { style: "width:" + breite(z.wert).toFixed(1) + "%" })]),
            el("b", { class: "num", text: s.fmt(z.wert) })
          ]));
        });
        if (isNum(s.markt) && s.wert > 0 && s.markt > 0) {
          var faktor = s.wert / s.markt;
          bild.appendChild(el("p", { class: "dx-bewertung-lesart", text: faktor >= 1.5 ? "Das " + runde(faktor) + "-Fache des Markts." : faktor <= 0.67 ? "Rund " + Math.round((1 - faktor) * 100) + " % unter dem Markt." : "Im Bereich des Markts." }));
        }
        bild.appendChild(el("p", { class: "dx-bewertung-erklaerung", text: s.erklaerung }));
      }
      sichten.forEach(function (s) {
        var b = el("button", { type: "button", role: "tab", class: "dx-journey-tab", text: s.label, "data-id": s.id, "aria-selected": "false" });
        b.addEventListener("click", function () { zeige(s.id); });
        tabs.appendChild(b);
      });
      section.appendChild(tabs); section.appendChild(bild);
      zeige(start);
    }
    var weitere = [
      v.marketCap ? { label: "Marktwert", wert: geld(v.marketCap.value, "USD"), zusatz: "Kurs × " + geld(v.marketCap.shares, "shares") + " Aktien" } : null,
      v.pe ? { label: "Gewinn je Aktie (" + v.pe.basis + ")", wert: geld(v.pe.eps, "USD/shares"), zusatz: null } : null,
      isNum(v.price) ? { label: "Kurs der Rechnung", wert: v.price.toFixed(2).replace(".", ",") + " $", zusatz: "Stand " + (f.asOf || "") } : null
    ].filter(Boolean);
    if (weitere.length) {
      section.appendChild(el("details", { class: "dx-weitere" }, [
        el("summary", { text: "Wie gerechnet wird" }),
        el("div", { class: "dx-firma" }, weitere.map(function (z) {
          return el("div", {}, [el("span", { text: z.label }), el("b", { class: "num", text: z.wert }), z.zusatz ? el("em", { text: z.zusatz }) : null]);
        })),
        el("p", { class: "dx-kapitel-fuss", text: "Bewertung ist ein Verhältnis, kein Urteil" + (ctx.rule ? " — " + ctx.rule : "") + ". Keine Empfehlung." })
      ]));
    }
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
                   "Flach": null, "Knapp": null, "Moderat": "warm", "Belastet": "warm", "Hoch": "warm", "Angespannt": "down", "Negativ": "down", "Rückläufig": "down" };
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
                                          fehlt: fehlt, geld: geld, journeySatz: journeySatz, BEWERTUNG_SANITY: BEWERTUNG_SANITY };
})(window);
