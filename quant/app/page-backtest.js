/* =========================================================================
   VISION UNIVERSE QUANT — app/page-backtest.js
   Backtesting · Historische Evidenz auf Radar-Karten · Radar-Status

   Die Seite beginnt mit einer Frage: "Wähle eine Regel oder ein Setup".
   Danach Regel, Zeitraum, Universum, Signale, Ergebnis, Rückgang,
   Vergleich, Vertrauen, Methodik - und darunter das Profi-Niveau.

   Jede Zahl stammt aus signal-backtest-v1 / setup-backtest-v1 /
   backtest-readiness-v2 und traegt ihre Renditebasis. Eine Regel, deren
   Vertrauensstufe "nicht bereit" ist, zeigt keine Ergebniszahl, sondern
   "Historischer Backtest noch nicht freigegeben" mit dem gemessenen Grund.
   Keine Prognose, keine Empfehlung, keine Gesamtnote.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;
  var SVG = "http://www.w3.org/2000/svg";

  var E = global.QXEvidence;
  var TRUST_WORD = E.TRUST_WORD, STATUS_WORD = E.STATUS_WORD, RULE_LABEL = E.RULE_LABEL, tierWord = E.tierWord, statusBadge = E.statusBadge, pp = E.pp, baseLine = E.baseLine,
    reasonText = E.reasonText, pct = E.pct, share = E.share, num = E.num, int = E.int, trustPill = E.trustPill, returnWord = E.returnWord,
    evidenceBlock = E.evidenceBlock, trackingSection = E.trackingSection;
  /* ------------------------------------------------------------- Grafiken */
  function svg(w, h, label) {
    var s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 " + w + " " + h); s.setAttribute("class", "q-bt-svg"); s.setAttribute("role", "img"); s.setAttribute("aria-label", label);
    s.setAttribute("preserveAspectRatio", "none");
    return s;
  }
  function node(tag, attrs, text) { var n = document.createElementNS(SVG, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (text) n.textContent = text; return n; }
  function scale(min, max, a, b) { return function (v) { return max === min ? (a + b) / 2 : a + (v - min) / (max - min) * (b - a); }; }
  function finiteAll(list) { return list.filter(function (v) { return typeof v === "number" && isFinite(v); }); }

  /* Verlauf nach dem Signal (Wochen 0..52): Median, mittlere Haelfte, Marktbasis. */
  function pathChart(path, opts) {
    opts = opts || {};
    var W = 640, H = 220, P = { l: 44, r: 10, t: 12, b: 26 };
    var vals = finiteAll([].concat(path.median, path.p25, path.p75, path.baseMedian || [], [0]));
    var y = scale(Math.min.apply(null, vals), Math.max.apply(null, vals), H - P.b, P.t), x = scale(0, path.weeks.length - 1, P.l, W - P.r);
    var s = svg(W, H, opts.label || "Typischer Verlauf nach dem Signal");
    function line(arr, cls) { var d = ""; arr.forEach(function (v, i) { if (typeof v === "number") d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }); return node("path", { d: d, class: cls, fill: "none" }); }
    var band = ""; path.p75.forEach(function (v, i) { band += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); });
    for (var i = path.p25.length - 1; i >= 0; i--) band += "L" + x(i).toFixed(1) + " " + y(path.p25[i]).toFixed(1);
    s.append(node("line", { x1: P.l, x2: W - P.r, y1: y(0), y2: y(0), class: "q-bt-zero" }));
    s.append(node("path", { d: band + "Z", class: "q-bt-band" }));
    if (path.baseMedian) s.append(line(path.baseMedian, "q-bt-base"));
    s.append(line(path.median, "q-bt-line"));
    [Math.max.apply(null, vals), 0, Math.min.apply(null, vals)].forEach(function (v) { s.append(node("text", { x: 4, y: y(v) + 4, class: "q-bt-ax" }, pct(v, 0, true))); });
    var unit = opts.unit || "Wochen";
    [0, Math.round((path.weeks.length - 1) / 2), path.weeks.length - 1].forEach(function (i) { s.append(node("text", { x: x(i), y: H - 6, class: "q-bt-ax", "text-anchor": "middle" }, path.weeks[i] + (i ? "" : " " + unit))); });
    return s;
  }
  function areaChart(values, labels, opts) {
    var W = 640, H = 160, P = { l: 44, r: 10, t: 10, b: 24 };
    var vals = finiteAll(values.concat([0])), y = scale(Math.min.apply(null, vals), 0, H - P.b, P.t), x = scale(0, values.length - 1, P.l, W - P.r);
    var s = svg(W, H, opts.label), d = "M" + x(0) + " " + y(0);
    values.forEach(function (v, i) { d += "L" + x(i).toFixed(1) + " " + y(v || 0).toFixed(1); });
    d += "L" + x(values.length - 1) + " " + y(0) + "Z";
    s.append(node("path", { d: d, class: "q-bt-dd" }));
    [0, Math.min.apply(null, vals)].forEach(function (v) { s.append(node("text", { x: 4, y: y(v) + 4, class: "q-bt-ax" }, pct(v, 0))); });
    [0, values.length - 1].forEach(function (i) { s.append(node("text", { x: x(i), y: H - 6, class: "q-bt-ax", "text-anchor": i ? "end" : "start" }, labels[i])); });
    return s;
  }
  /* Saeulen; values: [{label, value, tone}], fmt */
  function bars(items, opts) {
    var most = Math.max.apply(null, items.map(function (d) { return Math.abs(d.value || 0); })) || 1;
    return el("div", { class: "q-dist q-bt-bars" + (opts.signed ? " is-signed" : "") + (items.length > 16 ? " is-many" : ""), style: "--n:" + items.length, role: "img", "aria-label": opts.label + ": " + items.map(function (d) { return d.label + " " + opts.fmt(d.value); }).join(", ") }, items.map(function (d) {
      var tone = d.tone || (d.value > 0 ? "up" : d.value < 0 ? "down" : "");
      return el("div", { class: "q-dist-bar " + tone + (opts.signed && d.value < 0 ? " is-neg" : "") }, [el("i", { style: "--h:" + Math.max(2, Math.round(Math.abs(d.value || 0) / most * 100)) + "%" }),
        el("b", { class: "num", text: opts.fmt(d.value) }), el("small", { text: d.label })]);
    }));
  }
  function bucketLabel(b) {
    if (b.from === null) return "< " + pct(b.to, 0);
    if (b.to === null) return "> " + pct(b.from, 0, true);
    return pct(b.from, 0, b.from > 0) + " bis " + pct(b.to, 0, b.to > 0);
  }

  /* ------------------------------------------------------------ Seite */
  /* Die acht Bausteine des Vertrauens einzeln, in fester Reihenfolge - nie
     nur eine Gesamtplakette. Klartext statt interner Codes. */
  var COMPONENTS = [["returnBasis", "Gesamtrendite"], ["pit", "Point-in-Time"], ["lookahead", "Kein Blick in die Zukunft"], ["survivorship", "Überlebende"],
    ["oos", "Test außerhalb des Lernzeitraums"], ["walkForward", "Walk-Forward"], ["sample", "Stichprobe"], ["independence", "Unabhängige Fälle"]];
  function componentWord(id, k) {
    if (!k || !k.state) return "nicht gemessen";
    if (k.state === "PASS") return "erfüllt";
    if (id === "survivorship") return "nicht vollständig kontrolliert";
    return "nicht erfüllt";
  }
  function trustComponents(r) {
    return el("ul", { class: "q-trustparts", "aria-label": "Vertrauen nach Bausteinen" }, COMPONENTS.map(function (c) {
      var k = r.checks[c[0]] || {};
      return el("li", { class: k.state === "PASS" ? "is-pass" : "is-fail" }, [el("b", { text: c[1] }), el("span", { text: componentWord(c[0], k) })]);
    }));
  }
  function evidenceFlags(r, study) {
    var flags = [el("span", { class: "q-flag is-tested", text: "Historisch getestet" })];
    if (r.trust !== "ROBUST" && r.trust !== "USABLE") flags.push(el("span", { class: "q-flag is-limited", text: "Evidenz eingeschränkt" }));
    if (!r.checks.survivorship || r.checks.survivorship.state !== "PASS") flags.push(el("span", { class: "q-flag is-surv", text: "Überlebenden-Effekt nicht vollständig kontrolliert" }));
    return el("p", { class: "q-flags" }, flags);
  }
  var SURVIVORSHIP_PLAIN = "Historische Ergebnisse können verzerrt sein, wenn Unternehmen fehlen, die damals existierten, heute aber nicht mehr gelistet sind.";
  function sensitivityBlock(r, study) {
    var z = study.survivorshipSensitivity;
    if (!z || !z.computed) return el("p", { class: "qx-small", text: SURVIVORSHIP_PLAIN + " Für diese Studie liegt noch keine Vergleichsrechnung mit delisteten Titeln vor." });
    var row = (z.rules || []).filter(function (x) { return x.id === r.id; })[0];
    if (!row) return null;
    var A = row.CURRENT_SURVIVORS_ONLY, B = row.HISTORICAL_ELIGIBLE_SUBSET, D = row.historicalMinusSurvivors;
    var line = function (label, a, b, d, f) { return el("tr", {}, [el("th", { text: label }), el("td", { class: "num", text: f(a) }), el("td", { class: "num", text: f(b) }), el("td", { class: "num", text: f(d) })]); };
    return el("div", {}, [el("p", { class: "qx-small", text: SURVIVORSHIP_PLAIN + " Deshalb rechnen wir ab " + X.dateDe(z.window.from) + " zweimal: nur mit heute gelisteten Aktien und mit allen damals gehandelten, die wir sauber zuordnen können (" + int(z.delistedInVariant) + " delistete Titel)." }),
      el("div", { class: "q-bt-table", role: "region", "aria-label": "Vergleich mit und ohne delistete Titel", tabindex: "0" }, [el("table", {}, [
        el("caption", { class: "qx-small", text: "Nach 6 Monaten, ab " + X.dateDe(z.window.from) }),
        el("thead", {}, [el("tr", {}, ["", "Nur heutige Aktien", "Mit delisteten Titeln", "Unterschied"].map(function (t) { return el("th", { text: t }); }))]),
        el("tbody", {}, [
          line("Fälle", A.cases, B.cases, B.cases - A.cases, int),
          line("Anteil im Plus", A.positiveShare, B.positiveShare, D.positiveShare, function (v) { return share(v); }),
          line("Base Rate", A.baseRate, B.baseRate, D.baseRate, function (v) { return share(v); }),
          line("Abstand zur Base Rate", A.delta, B.delta, D.delta, function (v) { return pp(v); }),
          line("Median", A.median, B.median, D.median, function (v) { return pct(v, 1, true); }),
          line("Rückgang (Median)", A.maxDrawdownMedian, B.maxDrawdownMedian, D.maxDrawdownMedian, function (v) { return pct(v, 1, true); })])])]),
      el("p", { class: "qx-small", text: int(B.censored) + " Fälle reichen über das Ende eines delisteten Titels hinaus. Ihr Ausgang (Übernahme, Insolvenz oder Rückzug) ist unbekannt; sie werden nicht gewertet. Vor 2016 fehlen delistete Titel ganz. Aus diesem Vergleich folgt keine höhere Vertrauensstufe." })]);
  }

  function ruleBody(r, study, kind) {
    var out = [], h = r.horizons, m6 = h.m6, unitDays = kind === "setup";
    var hz = ["m1", "m3", "m6", "m12"];
    if (kind === "signal") out.push(X.section("Auf einen Blick", "Wie oft lag das Signal nach 6 Monaten höher – und wie oft der Markt in denselben Wochen.", [evidenceFlags(r, study), global.QXEvidence.signalEvidence(ruleEvidence(r)), global.QXEvidence.certifiedLine(null)]));
    out.push(X.section("Regel", null, [el("p", { class: "dx-bewertung-lesart", text: r.plain }),
      el("dl", { class: "qx-kv" }, [].concat.apply([], [
        ["Version", (r.version ? r.id + " " + r.version : r.id) + " · " + (study.engineVersion || "")],
        r.dailyDefinition ? ["Tagessignal im Radar", r.dailyDefinition] : null,
        ["Raster", r.grain === "WEEKLY" ? "Wochenschluss" : "Handelstag"],
        ["Einstieg", "Schluss " + (r.grain === "WEEKLY" ? "der Woche" : "des Tages") + " nach dem Signal"],
        ["Ausstieg", "nach festem Zeitraum (1, 3, 6, 12 Monate)" + (r.contractTrade && r.contractTrade.n ? "; daneben Ausstieg nach Setup-Vertrag" : r.oppositeExit && r.oppositeExit.n ? "; daneben beim Gegensignal" : "")],
        ["Rendite", returnWord(r.returnType) + ", abzüglich " + r.semantics.frictionsBps + " bps je Runde"]
      ].filter(Boolean).map(function (x) { return [el("dt", { text: x[0] }), el("dd", { text: x[1] })]; })))]));
    out.push(X.section("Zeitraum & Universum", null, [el("dl", { class: "qx-kv" }, [].concat.apply([], [
      ["Zeitraum", (r.firstEvent ? X.dateDe(r.firstEvent) : study.source.titles ? "seit " + (study.source.titles.map(function (t) { return t.from; }).sort()[0] || "–") : "–") + " – " + X.dateDe(r.lastEvent || study.asOf)],
      ["Universum", study.source.titles && study.source.titles.length ? study.source.titles.length + " Titel mit vollständiger Tageshistorie (" + study.source.titles.map(function (t) { return t.ticker; }).slice(0, 12).join(", ") + ")" : int(study.source.titles) + " US-Aktien mit Wochenhistorie"],
      ["Titel mit Signal", int(r.titles)],
      ["Überlebende", study.survivorship ? study.survivorship.plain : "Nur heute gelistete Titel – Ergebnisse eher zu günstig."]
    ].map(function (x) { return [el("dt", { text: x[0] }), el("dd", { text: x[1] })]; })))]));
    if (kind === "signal") { var sb = sensitivityBlock(r, study); if (sb) out.push(X.section("Überlebenden-Effekt", null, [sb])); }

    var years = (r.rolling || []);
    var timeline = years.length ? bars(years.map(function (y) { return { label: y.year.slice(2), value: y.n, tone: "" }; }), { label: "Signale je Jahr", fmt: int }) : null;
    out.push(X.section("Signale", r.display.sentence, [timeline, el("p", { class: "qx-small", text: "Signale je Jahr" + (r.semantics.cooldownWeeks ? "; nach einem Signal zählt dasselbe Signal derselben Aktie erst nach " + r.semantics.cooldownWeeks + " Wochen wieder." : ".") })]));

    if (!r.display.allowed) {
      out.push(X.section("Historischer Backtest noch nicht freigegeben", null, [
        el("ul", { class: "q-trust" }, r.trustReasons.map(function (t) { return el("li", { text: t.label + ": " + reasonText(t.reason) }); })
          .concat(study.certification && study.certification !== "CERTIFIED" ? [el("li", { text: reasonText("NOT_CERTIFIED") })] : [])),
        el("p", { class: "qx-small", text: "Ergebniszahlen erscheinen erst, wenn die Vertrauensregel sie trägt. Gemessen und geprüft wird trotzdem – siehe Vertrauen." })]));
    } else {
      out.push(X.section("Ergebnis", "Was nach dem Signal geschah – alle Fälle zusammen, kein einzelner herausgegriffen.", [
        el("div", { class: "q-evidence" }, [
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: int(m6.n) }), el("span", { text: "Fälle" }), el("small", { text: "≈ " + int(r.independence ? r.independence.effectiveN : null) + " unabhängig (" + int(r.independence ? r.independence.independentClusters : null) + " Quartale)" })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num " + (m6.baseRate && m6.baseRate.deltaPositiveShare > 0 ? "up" : m6.baseRate && m6.baseRate.deltaPositiveShare < 0 ? "down" : ""), text: m6.baseRate ? pp(m6.baseRate.deltaPositiveShare) : share(m6.positiveShare) }),
            el("span", { text: "gegenüber Base Rate" }), el("small", { text: share(m6.positiveShare) + " im Plus vs. " + (m6.baseRate ? share(m6.baseRate.matchedPositiveShare) : "–") + " derselben Wochen" + (m6.baseRate && m6.baseRate.ci ? " · 95 %: " + pp(m6.baseRate.ci[0]) + " bis " + pp(m6.baseRate.ci[1]) : "") })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: pct(m6.median, 1, true) }), el("span", { text: "Median 6 M." }), el("small", { text: "Markt derselben Woche: Abstand " + pct(m6.vsMarket.medianExcess, 1, true) + " · Mittel " + pct(m6.mean, 1, true) })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num down", text: pct(m6.maxDrawdown.median, 1) }), el("span", { text: "typischer Rückgang" }), el("small", { text: "größter Rückgang im Zeitraum (Median)" })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: num(m6.chanceRisk) }), el("span", { text: "Chance / Risiko" }), el("small", { text: "Median größter Anstieg ÷ größter Rückgang" })])]),
        el("p", { class: "qx-small", text: "Kosten je Runde: " + ["LOW", "BASE", "HIGH"].map(function (k) { var c = m6.costSensitivity && m6.costSensitivity[k]; return k + " " + (c ? c.bps + " bps → Median " + pct(c.median, 1, true) : "–"); }).join(" · ") + ". Base Rate und SPY tragen keine Kosten." }),
        el("h3", { class: "qx-sub", text: "Ergebnis nach Zeitraum" }),
        bars(hz.map(function (k) { return { label: h[k].label, value: h[k].median }; }), { label: "Median nach Zeitraum", fmt: function (v) { return pct(v, 1, true); }, signed: true }),
        el("h3", { class: "qx-sub", text: "Typischer Verlauf nach dem Signal (Equity-Kurve je Fall)" }),
        pathChart(r.path, { label: "Median-Verlauf nach dem Signal mit mittlerer Hälfte und Marktbasis", unit: unitDays ? "Tage" : "Wochen" }),
        el("p", { class: "q-bt-legend" }, [el("i", { class: "l-line" }), el("span", { text: "Median" }), el("i", { class: "l-band" }), el("span", { text: "mittlere Hälfte der Fälle" }), r.path.baseMedian ? el("i", { class: "l-base" }) : null, r.path.baseMedian ? el("span", { text: "alle Aktien, beliebige Woche" }) : null]),
        el("h3", { class: "qx-sub", text: "Verteilung nach 6 Monaten" }),
        bars(r.distribution.events.map(function (b, i) {
          var tot = r.distribution.events.reduce(function (s, x) { return s + x.count; }, 0) || 1;
          return { label: bucketLabel(b), value: b.count / tot, tone: b.to !== null && b.to <= 0 ? "down" : "up" };
        }), { label: "Verteilung der Ausgänge nach 6 Monaten", fmt: function (v) { return share(v); } }),
        el("h3", { class: "qx-sub", text: "Gewinne und Verluste" }),
        el("div", { class: "qx-bars2 dx-bewertung-bild q-bt-winloss" }, [
          el("div", { class: "dx-bewertung-zeile tone-good" }, [el("span", { class: "dx-bewertung-name", text: "im Plus · Ø " + pct(m6.avgWin, 1, true) }), el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.round((m6.positiveShare || 0) * 100) + "%" })]), el("b", { class: "num", text: share(m6.positiveShare) })]),
          el("div", { class: "dx-bewertung-zeile tone-bad" }, [el("span", { class: "dx-bewertung-name", text: "im Minus · Ø " + pct(m6.avgLoss, 1, true) }), el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.round((1 - (m6.positiveShare || 0)) * 100) + "%" })]), el("b", { class: "num", text: share(1 - (m6.positiveShare || 0)) })])])
      ]));
      out.push(X.section("Rückgang", "Wie tief es zwischendurch typischerweise ging.", [
        areaChart(r.path.drawdownMedian || [], [unitDays ? "0 Tage" : "0 Wochen", (r.path.weeks || r.path.days || []).slice(-1)[0] + (unitDays ? " Tage" : " Wochen")], { label: "Typischer Rückgang vom bisherigen Hoch nach dem Signal" }),
        el("p", { class: "qx-small", text: "Median des Abstands zum bisherigen Hoch seit dem Einstieg. Schlimmste 10 % der Fälle nach 6 Monaten: " + pct(m6.maxDrawdown.p10, 1) + "." })].filter(Boolean)));
      var vs = hz.map(function (k) { return [h[k].label, pct(h[k].median, 1, true), pct(h[k].base.median, 1, true), h[k].vsMarket ? pct(h[k].vsMarket.medianExcess, 1, true) : "–", h[k].vsMarket ? share(h[k].vsMarket.shareAboveMarket) : "–", h[k].vsSpy ? pct(h[k].vsSpy.medianExcess, 1, true) : "–"]; });
      out.push(X.section("Vergleich", "Eine Rendite ohne Vergleich sagt nichts über das Signal.", [
        el("div", { class: "q-bt-table", role: "region", "aria-label": "Vergleich mit Markt und SPY", tabindex: "0" }, [el("table", {}, [
          el("thead", {}, [el("tr", {}, ["Zeitraum", "Signal (Median)", "Alle Aktien", "Abstand zum Marktmedian derselben Woche", "Anteil über Marktmedian", "Abstand zu SPY"].map(function (t) { return el("th", { text: t }); }))]),
          el("tbody", {}, vs.map(function (row) { return el("tr", {}, row.map(function (t, i) { return el(i ? "td" : "th", { class: i ? "num" : null, text: t }); })); }))])]),
        el("h3", { class: "qx-sub", text: "Abstand zum Marktmedian je Jahr (rollierend)" }),
        bars(years.map(function (y) { return { label: y.year.slice(2), value: y.medianExcess }; }), { label: "Median-Abstand zum Markt je Jahr", fmt: function (v) { return pct(v, 0, true); }, signed: true })]));
    }

    out.push(X.section("Vertrauen im Detail", "Alle Prüfungen der Vertrauensregel mit Messwert – für alle, die es genau wissen wollen.", [el("p", {}, [trustPill(r.trust)]), trustComponents(r),
      el("ul", { class: "q-checks" }, study.trustChecks.map(function (c) {
        var k = r.checks[c.id] || {};
        return el("li", { class: k.state === "PASS" ? "is-pass" : "is-fail" }, [el("span", { text: (k.state === "PASS" ? "✓ " : "✗ ") + c.label }),
          el("small", { text: typeof k.value === "string" ? k.value : k.reason ? reasonText(k.reason) : "" })]);
      })),
      el("p", { class: "qx-small", text: study.trustRule.plain })]));

    out.push(X.section("Methodik", null, [el("ul", { class: "q-trust" }, [
      el("li", { text: "Alle Regeln und Parameter stehen vor dem Lauf fest; es wird nichts auf die Daten optimiert." }),
      el("li", { text: "Ein Signal liest nur Kurse bis zur Signalwoche; der Einstieg liegt danach. Geprüft an echten Fällen mit abgeschnittener und verfälschter Zukunft." }),
      el("li", { text: "Lernen, Prüfen, Testen: bis 2010, 2010–2017, ab 2018 – dazu fünf zeitliche Walk-Forward-Abschnitte." }),
      el("li", { text: returnWord(r.returnType) + "; Kosten " + study.frictions.roundTripBps + " bps und Ausführungsabschlag " + study.frictions.slippageBps + " bps je Runde." }),
      el("li", { text: "Keine Prognose und keine Empfehlung: beschrieben wird, was früher folgte." })]),
      X.btn("Methodik: Historische Evidenz", X.routes.method("historie"), "secondary")]));

    out.push(X.more("Profi-Niveau: Walk-Forward, Prüfzeiträume, Marktphasen, Parameter", function () {
      var kids = [];
      if (r.walkForward && r.walkForward.folds) kids.push(el("h3", { class: "qx-sub", text: "Walk-Forward" }), el("ul", { class: "qx-small" }, r.walkForward.folds.map(function (f) {
        return el("li", { text: "Abschnitt " + f.fold + " ab " + X.dateDe(f.from) + ": Lernen " + int(f.trainN) + " Fälle (" + pct(f.trainMedianExcess, 1, true) + "), Test " + int(f.testN) + " Fälle (" + pct(f.testMedianExcess, 1, true) + ")" + (f.agree ? " – gleiche Richtung" : " – andere Richtung") });
      })));
      if (r.oos) kids.push(el("h3", { class: "qx-sub", text: "Lernen, Prüfen, Testen" }), el("ul", { class: "qx-small" }, ["train", "validation", "test"].map(function (k) {
        var s = r.oos[k]; return el("li", { text: { train: "Lernen", validation: "Prüfen", test: "Testen" }[k] + ": " + int(s.n) + " Fälle, Median-Abstand " + pct(s.medianExcess, 1, true) + (typeof s.deltaPositiveShare === "number" ? ", gegenüber Base Rate " + pp(s.deltaPositiveShare) + (s.ci ? " (95 %: " + pp(s.ci[0]) + " bis " + pp(s.ci[1]) + ")" : "") : "") });
      })), el("p", { class: "qx-small", text: r.edgeOutOfSample ? "Der Abstand zur Base Rate hält im Testzeitraum (Intervall ohne Null, gleiche Richtung wie beim Lernen)." : "Ein Abstand zur Base Rate bestätigt sich im Testzeitraum nicht eindeutig – keine Zertifizierung." }));
      if (r.regimes) kids.push(el("h3", { class: "qx-sub", text: "Marktphasen (SPY über 26 Wochen)" }), el("ul", { class: "qx-small" }, Object.keys(r.regimes).map(function (k) {
        var g = r.regimes[k]; return el("li", { text: { UP: "steigend", DOWN: "fallend", SIDEWAYS: "seitwärts" }[k] + ": " + int(g.n) + " Fälle" + (r.display.allowed ? ", " + share(g.positiveShare) + " im Plus, Median " + pct(g.median, 1, true) : "") });
      })));
      if (r.parameterStability) kids.push(el("h3", { class: "qx-sub", text: "Parameter-Stabilität" }), el("ul", { class: "qx-small" }, [r.parameterStability.main].concat(r.parameterStability.neighbours).map(function (p, i) {
        return el("li", { text: (i ? "Nachbar " : "Regel ") + p.params.weeks + " Wochen: Median-Abstand " + pct(p.medianExcessM6, 1, true) });
      }).concat((r.parameterStability.entryDelay || []).map(function (d) { return el("li", { text: "Einstieg " + d.delayWeeks + " Woche(n) nach dem Signal: Median-Abstand " + pct(d.medianExcessM6, 1, true) }); }))));
      if (r.independence) kids.push(el("h3", { class: "qx-sub", text: "Unabhängigkeit" }), el("p", { class: "qx-small", text: int(r.independence.uniqueTitles) + " Titel, " + int(r.independence.uniquePeriods) + " Wochen, " + int(r.independence.independentClusters) + " Quartale. Weil Fälle derselben Zeit zusammenhängen, entsprechen die Fälle etwa " + int(r.independence.effectiveN) + " unabhängigen (Design-Effekt " + num(r.independence.designEffect) + ")." }));
      if (r.display.allowed && r.oppositeExit && r.oppositeExit.n) kids.push(el("h3", { class: "qx-sub", text: "Ausstieg beim Gegensignal" }), el("p", { class: "qx-small", text: int(r.oppositeExit.n) + " Fälle, Median " + pct(r.oppositeExit.median, 1, true) + ", " + share(r.oppositeExit.positiveShare) + " im Plus, Haltedauer im Median " + r.oppositeExit.medianHoldingWeeks + " Wochen; " + share(r.oppositeExit.shareEndedByOpposite) + " endeten durch das Gegensignal, der Rest nach 12 Monaten." }));
      if (r.display.allowed && r.timeToOutcome) kids.push(el("h3", { class: "qx-sub", text: "Zeit bis zum Ausgang (±10 %)" }), el("p", { class: "qx-small", text: share(r.timeToOutcome.upFirstShare) + " erreichten zuerst +10 % (Median " + (r.timeToOutcome.medianWeeksUp || r.timeToOutcome.medianDaysUp) + (unitDays ? " Tage" : " Wochen") + "), " + share(r.timeToOutcome.downFirstShare) + " zuerst −10 % (Median " + (r.timeToOutcome.medianWeeksDown || r.timeToOutcome.medianDaysDown) + (unitDays ? " Tage" : " Wochen") + ")." }));
      if (r.display.allowed) kids.push(el("h3", { class: "qx-sub", text: "Alle Zeiträume" }), el("ul", { class: "qx-small" }, hz.map(function (k) {
        var x = h[k]; return el("li", { text: x.label + ": " + int(x.n) + " Fälle, " + share(x.positiveShare) + " im Plus, Median " + pct(x.median, 1, true) + ", Mittel " + pct(x.mean, 1, true) + ", 10–90 %: " + pct(x.p10, 0, true) + " bis " + pct(x.p90, 0, true) });
      })));
      return el("div", {}, kids);
    }));
    return out;
  }

  /* Setup-Backtest aus veroeffentlichten Staenden: Fortschritt statt Zahlen. */
  function setupProgress(kindCert, outcomes, ruleId) {
    var out = [];
    var st = outcomes && outcomes.study && outcomes.study[ruleId];
    out.push(X.section("Setup-Backtest aus veröffentlichten Ständen", "Gezählt wird nur, was am jeweiligen Tag tatsächlich veröffentlicht war – keine nachträgliche Rekonstruktion.", [
      el("p", {}, [statusBadge(kindCert.status, kindCert.tier)]),
      el("ul", { class: "q-checks" }, kindCert.gates.map(function (g) { return el("li", { class: g.state === "PASS" ? "is-pass" : "is-fail" }, [el("span", { text: (g.state === "PASS" ? "✓ " : "✗ ") + g.label }),
        el("small", { text: (g.value !== null && g.value !== undefined ? String(g.value) : "") + (g.required !== null && g.required !== undefined ? " · nötig " + g.required : "") + (g.state !== "PASS" && g.reason ? " · " + reasonText(g.reason) : "") })]); })),
      outcomes ? el("dl", { class: "qx-kv" }, [].concat.apply([], [
        ["Veröffentlichte Stände", int(outcomes.history.dates) + " seit " + X.dateDe(outcomes.history.from)],
        ["Wechsel dieser Art", int(st ? st.events : 0)],
        ["Abgeschlossene 6-Monats-Ergebnisse", int(st ? st.variants.NEXT_CLOSE.m6.status.COMPLETED : 0) + " (offen: " + int(st ? st.variants.NEXT_CLOSE.m6.status.PENDING : 0) + ")"],
        ["Erste 6-Monats-Ergebnisse", kindCert.eta && kindCert.eta.firstCompletedM6 ? "ab etwa " + X.dateDe(kindCert.eta.firstCompletedM6) : "–"],
        ["Genug Stichtage", kindCert.eta && kindCert.eta.historyDates && kindCert.eta.historyDates.date ? "etwa " + X.dateDe(kindCert.eta.historyDates.date) : "–"],
        ["Freigabe", kindCert.ownerApproval && kindCert.ownerApproval.required ? "Die Setup-Methodik verlangt nach bestandenen Gates eine ausdrückliche Owner-Freigabe." : "automatisch"]
      ].map(function (x) { return [el("dt", { text: x[0] }), el("dd", { text: x[1] })]; }))) : null,
      el("p", { class: "qx-small", text: "Einstieg zum Schluss des Folgetags (Vergleich: Schluss des Stichtags); Ausstieg bei Schluss unter der Invalidierung, Schluss an der ersten Zielzone, veröffentlichtem Abstieg oder nach 126 Handelstagen. Kosten LOW/BASE/HIGH. Ergebniszahlen erscheinen erst nach der Zertifizierung." }),
      kindCert.replay ? el("p", { class: "qx-small", text: "Nachweis der Engine: " + kindCert.replay.parity + " veröffentlichte Setup-Stände wurden aus Kursen bis zum jeweiligen Tag exakt nachgerechnet. Die Rekonstruktion ist kein Ersatz für veröffentlichte Stände und liefert keine Ergebnisse." }) : null
    ]));
    return out;
  }

  /* Renditebasis der Signal-Studie in Klartext: eigene Gesamtrendite (aus
     Kurs, Splits und Dividenden) oder nur Kursrendite - nie gemischt. */
  function returnBasisLine(study) {
    var tr = study.returnBasis === "CANONICAL_TOTAL_RETURN";
    var cov = study.source && study.source.totalReturnCoverage;
    var detail = cov && cov.titles ? " Gesamtrendite vollständig belegt für " + int(cov.TOTAL_RETURN_CONFIRMED_AFTER) + " von " + int(cov.titles) + " Aktien." : "";
    return el("p", { class: "q-bt-basis qx-small", "data-return-basis": tr ? "total" : "price" }, [
      el("b", { text: "Renditebasis: " + (tr ? "Gesamtrendite mit Dividenden (selbst berechnet)" : "Nur Kursrendite, ohne Dividenden") }),
      el("span", { text: " " + (study.returnTypeNote || "") + detail })]);
  }

  /* Studienregel -> dieselbe Evidenzform wie auf Radar und Aktienseite. */
  function ruleEvidence(r) {
    var m = r.horizons && r.horizons.m6, br = (m && m.baseRate) || {};
    if (!m) return null;
    var checks = r.checks || {};
    return { state: "AVAILABLE", positiveShare: m.positiveShare, basePositiveShare: br.matchedPositiveShare, deltaPositiveShare: br.deltaPositiveShare, deltaCi: br.ci,
      n: m.n, effectiveN: r.independence ? r.independence.effectiveN : null, typicalDrawdown: m.maxDrawdown ? m.maxDrawdown.median : null, median: m.median,
      returnType: r.returnType, trust: r.trust, edgeOutOfSample: r.edgeOutOfSample,
      openChecks: Object.keys(checks).filter(function (k) { return checks[k] && checks[k].state !== "PASS"; }), checkedIds: Object.keys(checks) };
  }
  function lowerFirst(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  /* Was allen getesteten Regeln zur Zertifizierung fehlt - aus den offenen Pruefungen. */
  function missingForCertification(signal, cert) {
    var E = global.QXEvidence, common = null;
    signal.rules.forEach(function (r) {
      var open = Object.keys(r.checks || {}).filter(function (k) { return r.checks[k] && r.checks[k].state !== "PASS"; });
      common = common === null ? open : common.filter(function (k) { return open.indexOf(k) >= 0; });
    });
    var words = (common || []).map(function (id) { var w = E.CHECK_WORDS.filter(function (c) { return c[0] === id; })[0]; return w ? w[2] : null; }).filter(Boolean);
    return words.length ? " Allen getesteten Signalen fehlt noch: " + words.join(" ") : "";
  }
  /* WAS IST HIER BEREITS BELASTBAR? Drei Gruppen aus dem Zertifizierungsstand. */
  function trustOverview(signal, cert) {
    var E = global.QXEvidence;
    var by = function (tier) { return cert.kinds.filter(function (k) { return k.tier === tier && k.status !== "CERTIFIED"; }); };
    var certified = cert.kinds.filter(function (k) { return k.status === "CERTIFIED"; });
    var obs = by("OBSERVED"), tested = by("TESTED");
    var group = function (cls, title, plain, items) {
      return el("div", { class: "q-belast-col " + cls }, [el("span", { class: "q-ev-tier " + cls, text: title }), el("p", { class: "q-belast-plain", text: plain }), el("ul", {}, items)]);
    };
    var signalItems = signal.rules.map(function (r) {
      var b = ruleEvidence(r);
      return el("li", {}, [el("a", { href: X.routes.backtest(r.id), text: RULE_LABEL[r.id] || r.id }), el("span", { text: ": " + (b ? E.pp(b.deltaPositiveShare) + " gegenüber dem Markt – " + lowerFirst(E.edgeOf(b).label) : "–") })]);
    });
    return el("section", { class: "q-belast", "aria-label": "Was ist hier bereits belastbar?" }, [
      el("h2", { class: "qx-h2", text: "Was ist hier bereits belastbar?" }),
      el("div", { class: "q-belast-grid" }, [
        group("tier-observed", "Historisch beobachtet", "Beschreibt, was früher geschah – ohne eine Regel zu prüfen und ohne Vergleich mit dem Markt.",
          obs.map(function (k) { return el("li", { text: k.label + ": verfügbar" }); })),
        group("tier-tested", "Historisch getestet", "Feste Regeln, marktweit ausgewertet und mit dem Markt derselben Wochen verglichen. Evidenz vorhanden, aber noch nicht vollständig belastbar.",
          signalItems.concat(tested.filter(function (k) { return k.id !== "SIGNAL_BACKTEST"; }).map(function (k) { return el("li", { text: k.label + ": " + (STATUS_WORD[k.status] || k.status) }); }))),
        group("tier-certified" + (certified.length ? "" : " is-off"), "Zertifiziert", certified.length ? "Alle methodischen Prüfungen bestanden." : "Noch keine Backtest-Art ist zertifiziert. Das ist der ehrliche Stand, kein Fehler." + missingForCertification(signal, cert),
          certified.map(function (k) { return el("li", { text: k.label }); }))
      ])]);
  }

  async function render(main, ctx, ruleId) {
    main.append(el("header", { class: "q-hero q-hero--page" }, [X.globe(), el("p", { class: "q-kicker", text: "Backtesting" }),
      el("h1", { class: "qx-h1", text: "Wähle eine Regel oder ein Setup" }),
      el("p", { class: "q-hero-lead v2-lead", text: "Was geschah früher, nachdem dieselbe Regel galt – im Vergleich zur Base Rate derselben Wochen, mit Vertrauensstufe und klaren Grenzen. Keine Prognose, keine Empfehlung." })]));
    var all = await Promise.all([ctx.api.getBacktest("signal"), ctx.api.getBacktest("certification"), ctx.api.getBacktest("outcomes")]);
    var signal = all[0], cert = all[1], outcomes = all[2].state === "AVAILABLE" ? all[2] : null;
    if (signal.state !== "AVAILABLE" || cert.state !== "AVAILABLE") { main.append(X.notice("Backtests derzeit nicht verfügbar", "Die Studien konnten nicht geladen werden.")); return; }
    var kindOf = function (id) { return cert.kinds.filter(function (k) { return k.id === id; })[0]; };
    var sigCert = kindOf("SIGNAL_BACKTEST"), setupCert = kindOf("SETUP_BACKTEST");
    var ruleCert = function (id) { return (sigCert.rules || []).filter(function (r) { return r.id === id; })[0] || null; };
    var picks = [];
    signal.rules.forEach(function (r) { var rc = ruleCert(r.id);
      picks.push(el("a", { class: "q-bt-pick" + (r.display.allowed ? " is-on" : " is-off"), href: X.routes.backtest(r.id) }, [el("small", { text: "Radar-Signal · marktweit" }), el("b", { text: RULE_LABEL[r.id] || r.id }),
        el("span", { text: r.horizons.m6.baseRate ? pp(r.horizons.m6.baseRate.deltaPositiveShare) + " gegenüber dem Markt · " + global.QXEvidence.edgeOf(ruleEvidence(r)).label : STATUS_WORD.LIMITED })])); });
    ["SETUP_CONFIRMED", "SETUP_NEW"].forEach(function (id) {
      picks.push(el("a", { class: "q-bt-pick is-off", href: X.routes.backtest(id) }, [el("small", { text: "Setup-Wechsel · veröffentlicht" }), el("b", { text: RULE_LABEL[id] }), el("span", { text: STATUS_WORD[setupCert.status] })]));
    });
    ["STRATEGY_BACKTEST", "FACTOR_RANKING_BACKTEST"].forEach(function (id) { var k = kindOf(id);
      picks.push(el("div", { class: "q-bt-pick is-off" }, [el("small", { text: id === "STRATEGY_BACKTEST" ? "Anlagestil" : "Faktor-Ranking" }), el("b", { text: k.label }), el("span", { text: STATUS_WORD[k.status] })])); });
    main.append(trustOverview(signal, cert));
    main.append(el("nav", { class: "q-bt-picks", "aria-label": "Regel oder Setup wählen" }, picks));
    main.append(returnBasisLine(signal));

    var rule = ruleId ? signal.rules.filter(function (r) { return r.id === ruleId; })[0] || null : null;
    main.querySelectorAll(".q-bt-pick").forEach(function (a) { if (ruleId && a.getAttribute("href") === X.routes.backtest(ruleId)) a.setAttribute("aria-current", "page"); });
    if (rule) {
      var rc = ruleCert(rule.id);
      main.append(el("div", { class: "q-bt-head" }, [el("p", { class: "q-kicker", text: "Radar-Signal · marktweit" }),
        el("h2", { class: "qx-h2", text: RULE_LABEL[rule.id] || rule.id }), el("p", { class: "qx-muted", text: rule.display.sentence }),
        el("p", {}, [statusBadge(rc ? rc.status : "LIMITED", sigCert.tier), el("span", { text: " " }), trustPill(rule.trust)])]));
      ruleBody(rule, signal, "signal").forEach(function (n) { if (n) main.append(n); });
    } else if (ruleId && /^SETUP_/.test(ruleId) && RULE_LABEL[ruleId]) {
      main.append(el("div", { class: "q-bt-head" }, [el("p", { class: "q-kicker", text: "Setup-Wechsel" }), el("h2", { class: "qx-h2", text: RULE_LABEL[ruleId] })]));
      setupProgress(setupCert, outcomes, ruleId).forEach(function (n) { main.append(n); });
    } else if (ruleId) main.append(X.notice("Regel nicht gefunden", "Diese Regel gibt es nicht. Wähle oben eine Regel oder ein Setup."));

    var nOf = function (st) { return cert.kinds.filter(function (k) { return k.status === st; }).length; };
    main.append(X.section("Stand der Zertifizierung", "Zertifiziert: " + nOf("CERTIFIED") + " von " + cert.kinds.length + " Backtest-Arten · eingeschränkt " + nOf("LIMITED") + " · sammelt Historie " + nOf("COLLECTING_HISTORY") + " · zurückgehalten " + nOf("WITHHELD") + ". Jeder Status folgt aus gemessenen Gates.", [el("div", { class: "q-evkinds" }, cert.kinds.map(function (k) {
      var eta = k.eta && (k.eta.membership || k.eta.factor || k.eta.historyDates);
      return el("div", { class: "q-evkind " + (k.status === "CERTIFIED" ? "is-on" : k.status === "LIMITED" ? "is-limited" : "is-off") }, [el("b", { text: k.label }), statusBadge(k.status, k.tier),
        el("ul", {}, k.gates.map(function (g) { return el("li", { class: g.state === "PASS" ? "is-pass" : "is-fail" }, [el("span", { text: (g.state === "PASS" ? "✓ " : "✗ ") + g.label }),
          el("small", { text: (g.value !== null && g.value !== undefined ? " – " + g.value : "") + (g.required !== null && g.required !== undefined ? " (nötig " + g.required + ")" : "") })]); })),
        k.reason ? el("p", { class: "qx-small", text: reasonText(k.reason) }) : null,
        eta && eta.date ? el("p", { class: "qx-small", text: "Voraussichtlich genug Historie: " + X.dateDe(eta.date) + " (wird täglich neu geprüft)." }) : null,
        k.ownerApproval && k.ownerApproval.required ? el("p", { class: "qx-small", text: "Nach bestandenen Gates ist eine Owner-Freigabe nötig." }) : null]);
    })), el("p", { class: "qx-small", text: "Überlebende: Gate " + (cert.survivorship.gate === "PASS" ? "bestanden (kein Backtest steht deshalb über „eingeschränkt“)" : "nicht bestanden") + ", Kontrolle " + (cert.survivorship.control === "PASS" ? "aktiv" : cert.survivorship.control === "PARTIAL" ? "teilweise – delistete Titel ab 2016 nur in einer Vergleichsrechnung, nicht in den Ergebnissen" : "nicht vorhanden – delistete Titel fehlen in den Ergebnissen, sie wirken eher zu günstig") + ". " +
      int(cert.survivorship.DELISTED_IDENTIFIED) + " delistete Titel bekannt, davon " + int(cert.survivorship.DELISTED_WITH_HISTORY) + " mit sauberer Kurshistorie. " + SURVIVORSHIP_PLAIN })], { href: X.routes.method("historie"), label: "Methodik" }));
  }

  global.QXBacktest = { TRUST_WORD: TRUST_WORD, STATUS_WORD: STATUS_WORD, tierWord: tierWord, statusBadge: statusBadge, reasonText: reasonText, evidenceBlock: evidenceBlock, trackingSection: trackingSection, render: render, pathChart: pathChart };
})(typeof window !== "undefined" ? window : globalThis);
