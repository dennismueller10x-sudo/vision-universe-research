/* =========================================================================
   VISION UNIVERSE QUANT — app/page-tools.js
   Vertiefung: Kursstruktur (Technik & Elliott) · Zahlen über die Jahre ·
   Vergleich

   Diese Werkzeuge sind die Profi-Tiefe der Aktienanalyse. Sie lesen die
   bestehenden Workspace-Vertraege (getTechnicalWorkspace,
   getHistoricalFundamentals, getComparison) und zeichnen mit den
   bestehenden Chart-Komponenten (QuantCharts.technicalChart, barChart).
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el;
  function price(v) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "–"; }
  function select(label, options, value) {
    var s = el("select", { class: "qx-select", "aria-label": label }, options.map(function (o) { return el("option", { value: o[0], text: o[1] }); }));
    if (value) s.value = value; return s;
  }

  /* =============================================================== TECHNIK */
  async function technical(main, ctx, ticker, elliott) {
    main.append(el("a", { class: "v2-back qx-back", href: X.routes.stock(ticker), text: "← Zur Aktienanalyse " + ticker }),
      el("span", { class: "v2-eyebrow", text: "Kursstruktur · " + ticker }),
      el("h1", { class: "qx-h1", text: "Technische Analyse & Elliott-Wellen" }),
      el("p", { class: "v2-lead qx-lead", text: "Trend, Unterstützungen, Szenarien und Elliott-Zählungen – mit den Bedingungen, unter denen sie gelten, und denen, die sie ungültig machen." }));
    var host = el("div", {}, [X.loading()]); main.append(host);
    var data = await ctx.api.getTechnicalWorkspace(ticker).catch(function () { return null; });
    host.replaceChildren();
    if (!data || data.state !== "AVAILABLE") {
      host.append(X.notice("Technische Analyse nicht verfügbar", "Für diesen Titel ist keine vollständige technische Auswertung veröffentlicht."), el("div", { class: "qx-actions" }, [X.btn("Zur Aktienanalyse", X.routes.stock(ticker), "secondary")]));
      return;
    }
    var chart = el("div", { class: "qx-card", style: "padding:12px;overflow-x:auto", tabindex: "0", role: "region", "aria-label": "Kursstruktur-Chart" });
    var layer = select("Chart-Ebene", [["AUTO", "Übersicht"], ["STRUCTURE", "Marktstruktur"], ["TREND", "Trend"], ["MOMENTUM", "Momentum"], ["SUPPORT_RESISTANCE", "Unterstützung / Widerstand"], ["FIBONACCI", "Fibonacci"], ["ELLIOTT", "Elliott-Wellen"]], elliott ? "ELLIOTT" : "AUTO");
    var range = select("Zeitraum", [["3M", "3 Monate"], ["6M", "6 Monate"], ["YTD", "Seit Jahresbeginn"], ["1Y", "1 Jahr"], ["MAX", "Analysefenster"]], "1Y");
    var mode = select("Darstellung", [["candles", "Kerzen"], ["line", "Linie"]], "candles");
    var alt = el("input", { type: "checkbox", id: "qx-alt" });
    function draw() {
      var ann = (data.chart.annotations || []).filter(function (a) { var l = a.layers || []; return l.indexOf(layer.value) >= 0 || (alt.checked && (l.indexOf("ALTERNATIVE") >= 0 || (layer.value === "ELLIOTT" && l.indexOf("ELLIOTT_ALT") >= 0))); });
      chart.replaceChildren(global.QuantCharts.technicalChart({ bars: data.chart.bars, series: data.chart.series, annotations: ann, annotationLabels: innerWidth >= 650, range: range.value, mode: mode.value,
        width: Math.max(300, Math.min(1150, main.clientWidth - 30)), height: innerWidth < 650 ? 340 : 460, title: ticker + " · Kursstruktur",
        description: "Historische Kurse und ausdrücklich gekennzeichnete Projektionen. Keine Zukunftsdaten im Kursverlauf." }));
    }
    layer.onchange = range.onchange = mode.onchange = alt.onchange = draw;
    var primary = (data.scenarios || []).filter(function (s) { return s.kind === "PRIMARY"; })[0];
    host.append(el("div", { class: "qx-rule", style: "grid-template-columns:repeat(3,minmax(0,1fr)) auto;margin-bottom:12px" }, [layer, range, mode, el("label", { class: "qx-small", for: "qx-alt", style: "display:flex;gap:6px;align-items:center" }, [alt, document.createTextNode("Alternativen")])]),
      chart, el("p", { class: "qx-small", text: "Durchgezogen: Historie · gestrichelt: Projektion. Analysestand " + X.dateDe(data.asOf) + " · Kursbasis " + (data.priceBasis === "SPLIT_ADJUSTED" ? "splitbereinigt" : data.priceBasis) + "." }));
    draw();
    if (primary) host.append(X.section(primary.label, "Szenarien beschreiben Bedingungen – keine gesicherten Vorhersagen.", [el("div", { class: "qx-grid qx-grid-2" }, (data.scenarios || []).map(function (s) {
      return X.card([el("span", { class: "v2-eyebrow", text: s.kind === "PRIMARY" ? "Hauptszenario" : "Alternative" }), el("h3", { class: "qx-h3", text: s.label }),
        el("dl", { class: "qx-kv" }, [el("dt", { text: "Bestätigung" }), el("dd", { style: "text-align:left", text: s.confirmation || "–" }),
          el("dt", { text: "Ungültig bei" }), el("dd", { text: price(s.invalidation && s.invalidation.price) }),
          el("dt", { text: "Zielzonen" }), el("dd", { text: (s.targets || []).map(function (t) { return price(t.zoneLow) + "–" + price(t.zoneHigh); }).join(" · ") || "–" })]),
        X.more("Dafür und dagegen", function () { return (s.support || []).map(function (e) { return el("p", { class: "qx-small", text: "Dafür: " + e.statement }); }).concat((s.conflicts || []).map(function (e) { return el("p", { class: "qx-small", text: "Dagegen: " + e.statement }); })); })]);
    }))], null, "Szenarien"));
    var E = data.elliott;
    if (E && E.primary) {
      var count = function (c, label) {
        if (!c) return X.notice(label, "Keine validierte Zählung verfügbar.");
        return X.card([el("h3", { class: "qx-h3", text: label }),
          el("p", { text: "Aktuelle Welle: " + ((c.currentWave && c.currentWave.label) || "–") + (c.currentWave && c.currentWave.status === "DEVELOPING" ? " (noch in Entwicklung)" : "") }),
          el("p", { class: "qx-small", text: "Ungültig bei " + price(c.invalidation && c.invalidation.price) + " · " + ((c.invalidation && c.invalidation.statement) || "") }),
          X.more("Vollständige Zählung", function () {
            return el("div", { class: "qx-table-wrap", tabindex: "0" }, [el("table", { class: "qx-table" }, [el("thead", {}, [el("tr", {}, ["Welle", "Von", "Bis", "Status"].map(function (t) { return el("th", { text: t }); }))]),
              el("tbody", {}, (c.waves || []).map(function (w) { return el("tr", {}, [el("td", { text: w.label }), el("td", { text: w.fromTime + " · " + price(w.fromPrice) }), el("td", { text: w.toTime + " · " + price(w.toPrice) }), el("td", { text: { CONFIRMED: "Bestätigt", DEVELOPING: "In Entwicklung", PROJECTED: "Projektion" }[w.status] || w.status })]); }))])]);
          })]);
      };
      host.append(X.section("Elliott-Wellen", "Eine Zählung ist eine Lesart des Kursverlaufs nach festen Regeln. Die Regelpassung ist keine Eintrittswahrscheinlichkeit.", [
        el("div", { class: "qx-grid qx-grid-2" }, [count(E.primary, "Basiszählung"), count(E.alternative, "Alternative Zählung")]),
        el("p", { class: "qx-small", text: "Regelpassung: " + price(E.methodFit) + " von 100. " + (E.disclaimer || "") })], null, "Elliott", "elliott"));
    }
    if (elliott) global.setTimeout(function () { var n = document.getElementById("elliott"); if (n) n.scrollIntoView(); }, 50);
  }

  /* ================================================================ ZAHLEN */
  async function fundamentals(main, ctx, ticker, params) {
    var C = global.VUFundamentalsContract;
    main.append(el("a", { class: "v2-back qx-back", href: X.routes.stock(ticker), text: "← Zur Aktienanalyse " + ticker }),
      el("span", { class: "v2-eyebrow", text: "Unternehmenszahlen · " + ticker }),
      el("h1", { class: "qx-h1", text: "Wie entwickelt sich das Geschäft?" }),
      el("p", { class: "v2-lead qx-lead", text: "Geschäftszahlen über die Jahre – mit Berichtszeitraum, Meldedatum und Herkunft aus SEC-Meldungen." }));
    var metricId = C.metrics.some(function (m) { return m.id === params.get("kennzahl"); }) ? params.get("kennzahl") : "revenue";
    var periodId = ["annual", "quarterly", "ttm"].indexOf(params.get("periode")) >= 0 ? params.get("periode") : "annual";
    var metric = select("Kennzahl", C.metrics.map(function (m) { return [m.id, m.label]; }), metricId);
    var period = select("Berichtsart", [["annual", "Geschäftsjahre"], ["quarterly", "Quartale"], ["ttm", "Letzte 12 Monate"]], periodId);
    var target = el("section", { "aria-live": "polite" });
    main.append(el("div", { class: "qx-rule", style: "grid-template-columns:2fr 1fr;margin-bottom:12px" }, [metric, period]), target);
    var req = 0;
    async function update() {
      var mine = ++req;
      history.replaceState(null, "", X.routes.fundamentals(ticker) + "?kennzahl=" + metric.value + "&periode=" + period.value);
      target.replaceChildren(X.loading());
      var r = await ctx.api.getHistoricalFundamentals(ticker, { metric: metric.value, period: period.value }).catch(function () { return null; });
      if (mine !== req) return;
      if (!r || r.state !== "AVAILABLE") {
        target.replaceChildren(X.notice(r && r.reason === "TTM_NOT_VALIDATED" ? "Zwölfmonatswerte noch nicht verfügbar" : r && r.reason === "PERIOD_SEMANTICS_NOT_VALIDATED" ? "Quartalsabgrenzung noch nicht bestätigt" : "Historie nicht verfügbar",
          r && r.reason === "TTM_NOT_VALIDATED" ? "Für diese Ansicht liegt noch keine geprüfte Zwölfmonatsreihe vor. Geschäftsjahre bleiben verfügbar." : "Für diese Auswahl fehlen belastbare Daten. Werte werden nicht geschätzt."));
        return;
      }
      var known = r.rows.filter(function (x) { return x.state === "AVAILABLE"; }), latest = known[known.length - 1];
      var perShare = /\/shares$/.test(r.metric.unit), scale = perShare ? 1 : 1e9;
      var unit = perShare ? r.metric.unit.replace("/shares", " je Aktie") : r.metric.unit === "shares" ? "Mrd. Aktien" : "Mrd. " + r.metric.unit;
      var fmt = function (x) { return (x.value / scale).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      if (!latest) { target.replaceChildren(X.notice("Keine Werte", "Für diese Kennzahl liegen keine gemeldeten Werte vor.")); return; }
      target.replaceChildren(
        X.card([el("span", { class: "v2-eyebrow", text: r.name || ticker }), el("h2", { class: "qx-h2", text: r.metric.label }),
          el("div", { class: "dx-price qx-quote" }, [el("b", { class: "num", style: "font-size:36px", text: fmt(latest) + " " + unit }), el("small", { text: latest.label + " · " + (latest.start ? X.dateDe(latest.start) + " bis " : "Stichtag ") + X.dateDe(latest.end) })]),
          global.QuantCharts.barChart({ title: r.metric.label + " nach Berichtsperiode", description: "Gemeldete Werte je Periode.", width: Math.min(1100, main.clientWidth - (innerWidth < 760 ? 76 : 100)), maxLabels: innerWidth < 650 ? 4 : 10, height: 280,
            items: known.map(function (x) { return { label: period.value === "annual" ? String(x.fiscalYear) : x.fiscalPeriod + " " + String(x.fiscalYear).slice(-2), value: x.value / scale }; }),
            yFormat: function (v) { return v.toLocaleString("de-DE", { maximumFractionDigits: 1 }); } }),
          el("p", { class: "qx-small", text: known.length + " Perioden mit Wert, " + r.missing + " ohne darstellbaren Wert. Quelle: SEC EDGAR, Aufbereitung vom " + X.dateDe(String(r.generatedAt).slice(0, 10)) + ". Rückblickende Ansicht, kein damaliger Informationsstand." })]),
        X.more("Alle Perioden als Tabelle", function () {
          return el("div", { class: "qx-table-wrap", tabindex: "0" }, [el("table", { class: "qx-table" }, [el("thead", {}, [el("tr", {}, ["Periode", r.metric.label, "Zeitraum", "Bekannt seit"].map(function (t) { return el("th", { text: t }); }))]),
            el("tbody", {}, r.rows.slice().reverse().map(function (x) {
              return el("tr", {}, [el("td", { text: x.label + (x.derived ? " · abgeleitet" : "") }), el("td", { text: x.state === "AVAILABLE" ? fmt(x) + " " + unit : "–" }),
                el("td", { text: x.state === "AVAILABLE" ? (x.start ? x.start + " → " : "") + x.end : "–" }), el("td", { text: x.state === "AVAILABLE" && x.availableFrom ? String(x.availableFrom).slice(0, 10) : "–" })]);
            }))])]);
        }, { open: innerWidth >= 1000 }));
    }
    metric.onchange = period.onchange = update;
    await update();
    main.append(el("div", { class: "qx-actions" }, [X.btn("SEC-Daten im Dateninspektor", "/quant/data-inspector/", "secondary")]));
  }

  /* ============================================================= VERGLEICH */
  async function compare(main, ctx, list) {
    main.append(el("span", { class: "v2-eyebrow", text: "Vergleich" }), el("h1", { class: "qx-h1", text: "Aktien im direkten Vergleich" }),
      el("p", { class: "v2-lead qx-lead", text: "Ertragskraft, Wachstum, Bewertung und Kursverhalten aus derselben Kennzahlenbasis – ohne Rangfolge und ohne Empfehlung." }));
    var selected;
    try { selected = global.VUCompareWorkspace.validate(list && list.length > 1 ? list : (list && list.length === 1 ? [list[0], list[0] === "MSFT" ? "AAPL" : "MSFT"] : ["NVDA", "MSFT"])); }
    catch (e) { main.append(X.notice("Auswahl prüfen", "Wähle zwei bis vier unterschiedliche Kürzel. Diese Auswahl wird nicht automatisch ersetzt.")); return; }
    var input = el("input", { class: "qx-select", value: selected.join(", "), "aria-label": "Kürzel, mit Komma getrennt" });
    var go = el("button", { type: "button", class: "qx-btn", text: "Vergleichen" });
    go.onclick = function () { location.hash = X.routes.compare(input.value.toUpperCase().split(/[\s,;]+/).filter(Boolean)); };
    var target = el("section", { "aria-live": "polite" });
    main.append(el("div", { class: "qx-rule", style: "grid-template-columns:1fr auto" }, [input, go]), target);
    target.append(X.loading());
    var data = await ctx.api.getComparison(selected).catch(function () { return null; });
    if (!data || data.state !== "AVAILABLE") { target.replaceChildren(X.notice("Vergleich nicht auswertbar", "Für die gewählten Unternehmen fehlen belastbare Daten.")); return; }
    var head = [el("th", { text: "Kennzahl" })].concat(data.companies.map(function (c) { return el("th", {}, [el("a", { href: X.routes.stock(c.ticker), text: c.ticker })]); }));
    var rows = [];
    data.families.forEach(function (f) {
      rows.push(el("tr", {}, [el("th", { colspan: String(data.companies.length + 1), style: "text-align:left;padding-top:16px", text: f.label })]));
      f.metrics.forEach(function (m) {
        rows.push(el("tr", {}, [el("td", { text: m.label })].concat(m.values.map(function (v) {
          return el("td", { class: "num", text: typeof v.value === "number" ? v.value.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + (m.unit === "pct" ? " %" : m.unit === "x" ? " ×" : "") : "–" });
        }))));
      });
    });
    target.replaceChildren(el("div", { class: "qx-card qx-table-wrap", tabindex: "0", "aria-label": "Vergleichstabelle, seitlich scrollbar" }, [el("table", { class: "qx-table" }, [el("thead", {}, [el("tr", {}, head)]), el("tbody", {}, rows)])]),
      el("p", { class: "qx-small", text: "Berichtszeiträume können abweichen; Datenstände je Unternehmen: " + data.companies.map(function (c) { return c.ticker + " " + (c.fundamentalsAsOf ? X.dateDe(c.fundamentalsAsOf) : "–"); }).join(", ") + "." }),
      data.partial ? X.notice("Nicht alle Unternehmen auswertbar", "Spalten ohne passende Daten bleiben leer und werden nicht mit Ersatzwerten gefüllt.") : null);
  }

  global.QXTools = { technical: technical, fundamentals: fundamentals, compare: compare };
})(window);
