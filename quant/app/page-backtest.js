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
    var s = svg(W, H, opts.label || "Typischer Verlauf nach dem Regelereignis");
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
          line("Markt (gleiche Wochen)", A.baseRate, B.baseRate, D.baseRate, function (v) { return share(v); }),
          line("Abstand zum Markt", A.delta, B.delta, D.delta, function (v) { return pp(v); }),
          line("Median", A.median, B.median, D.median, function (v) { return pct(v, 1, true); }),
          line("Rückgang (Median)", A.maxDrawdownMedian, B.maxDrawdownMedian, D.maxDrawdownMedian, function (v) { return pct(v, 1, true); })])])]),
      el("p", { class: "qx-small", text: int(B.censored) + " Fälle reichen über das Ende eines delisteten Titels hinaus. Ihr Ausgang (Übernahme, Insolvenz oder Rückzug) ist unbekannt; sie werden nicht gewertet. Vor 2016 fehlen delistete Titel ganz. Aus diesem Vergleich folgt keine höhere Vertrauensstufe." })]);
  }

  function ruleBody(r, study, kind) {
    var out = [], h = r.horizons, m6 = h.m6, unitDays = kind === "setup";
    var hz = ["m1", "m3", "m6", "m12"];
    if (kind === "signal") out.push(X.section("Auf einen Blick", "Wie oft lag das Regelereignis nach 6 Monaten höher – und wie oft der Markt in denselben Wochen.", [evidenceFlags(r, study), global.QXEvidence.signalEvidence(ruleEvidence(r)), global.QXEvidence.certifiedLine(null)]));
    out.push(X.section("Regel", null, [el("p", { class: "dx-bewertung-lesart", text: X.say(r.plain) }),
      el("dl", { class: "qx-kv" }, [].concat.apply([], [
        ["Version", (r.version ? r.id + " " + r.version : r.id) + " · " + (study.engineVersion || "")],
        r.dailyDefinition ? ["Tagessignal im Radar", r.dailyDefinition] : null,
        ["Raster", r.grain === "WEEKLY" ? "Wochenschluss" : "Handelstag"],
        ["Einstieg", "Schluss " + (r.grain === "WEEKLY" ? "der Woche" : "des Tages") + " nach dem Regelereignis"],
        ["Ausstieg", "nach festem Zeitraum (1, 3, 6, 12 Monate)" + (r.contractTrade && r.contractTrade.n ? "; daneben Ausstieg nach Setup-Vertrag" : r.oppositeExit && r.oppositeExit.n ? "; daneben beim Gegensignal" : "")],
        ["Rendite", returnWord(r.returnType) + ", abzüglich " + r.semantics.frictionsBps + " bps je Runde"]
      ].filter(Boolean).map(function (x) { return [el("dt", { text: x[0] }), el("dd", { text: x[1] })]; })))]));
    out.push(X.section("Zeitraum & Universum", null, [el("dl", { class: "qx-kv" }, [].concat.apply([], [
      ["Zeitraum", (r.firstEvent ? X.dateDe(r.firstEvent) : study.source.titles ? "seit " + (study.source.titles.map(function (t) { return t.from; }).sort()[0] || "–") : "–") + " – " + X.dateDe(r.lastEvent || study.asOf)],
      ["Universum", study.source.titles && study.source.titles.length ? study.source.titles.length + " Titel mit vollständiger Tageshistorie (" + study.source.titles.map(function (t) { return t.ticker; }).slice(0, 12).join(", ") + ")" : int(study.source.titles) + " US-Aktien mit Wochenhistorie"],
      ["Titel mit Regelereignis", int(r.titles)],
      ["Überlebende", study.survivorship ? study.survivorship.plain : "Nur heute gelistete Titel – Ergebnisse eher zu günstig."]
    ].map(function (x) { return [el("dt", { text: x[0] }), el("dd", { text: x[1] })]; })))]));
    if (kind === "signal") { var sb = sensitivityBlock(r, study); if (sb) out.push(X.section("Überlebenden-Effekt", null, [sb])); }

    var years = (r.rolling || []);
    var timeline = years.length ? bars(years.map(function (y) { return { label: y.year.slice(2), value: y.n, tone: "" }; }), { label: "Regelereignisse je Jahr", fmt: int }) : null;
    out.push(X.section("Regelereignisse", r.display.sentence, [timeline, el("p", { class: "qx-small", text: "Regelereignisse je Jahr" + (r.semantics.cooldownWeeks ? "; nach einem Signal zählt dasselbe Regelereignis derselben Aktie erst nach " + r.semantics.cooldownWeeks + " Wochen wieder." : ".") })]));

    if (!r.display.allowed) {
      out.push(X.section("Historischer Backtest noch nicht freigegeben", null, [
        el("ul", { class: "q-trust" }, r.trustReasons.map(function (t) { return el("li", { text: t.label + ": " + reasonText(t.reason) }); })
          .concat(study.certification && study.certification !== "CERTIFIED" ? [el("li", { text: reasonText("NOT_CERTIFIED") })] : [])),
        el("p", { class: "qx-small", text: "Ergebniszahlen erscheinen erst, wenn die Vertrauensregel sie trägt. Gemessen und geprüft wird trotzdem – siehe Vertrauen." })]));
    } else {
      out.push(X.section("Ergebnis", "Was nach dem Regelereignis geschah – alle Fälle zusammen, kein einzelner herausgegriffen.", [
        el("div", { class: "q-evidence" }, [
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: int(m6.n) }), el("span", { text: "Fälle" }), el("small", { text: "≈ " + int(r.independence ? r.independence.effectiveN : null) + " unabhängig (" + int(r.independence ? r.independence.independentClusters : null) + " Quartale)" })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num " + (m6.baseRate && m6.baseRate.deltaPositiveShare > 0 ? "up" : m6.baseRate && m6.baseRate.deltaPositiveShare < 0 ? "down" : ""), text: m6.baseRate ? pp(m6.baseRate.deltaPositiveShare) : share(m6.positiveShare) }),
            el("span", { text: "gegenüber dem Markt" }), el("small", { text: share(m6.positiveShare) + " im Plus vs. " + (m6.baseRate ? share(m6.baseRate.matchedPositiveShare) : "–") + " derselben Wochen" + (m6.baseRate && m6.baseRate.ci ? " · 95 %: " + pp(m6.baseRate.ci[0]) + " bis " + pp(m6.baseRate.ci[1]) : "") })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: pct(m6.median, 1, true) }), el("span", { text: "Median 6 M." }), el("small", { text: "Markt derselben Woche: Abstand " + pct(m6.vsMarket.medianExcess, 1, true) + " · Mittel " + pct(m6.mean, 1, true) })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num down", text: pct(m6.maxDrawdown.median, 1) }), el("span", { text: "typischer Rückgang" }), el("small", { text: "größter Rückgang im Zeitraum (Median)" })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: num(m6.chanceRisk) }), el("span", { text: "Anstieg / Rückgang (historisch)" }), el("small", { text: "Median größter Anstieg ÷ größter Rückgang" })])]),
        el("p", { class: "qx-small", text: "Kosten je Runde: " + ["LOW", "BASE", "HIGH"].map(function (k) { var c = m6.costSensitivity && m6.costSensitivity[k]; return k + " " + (c ? c.bps + " bps → Median " + pct(c.median, 1, true) : "–"); }).join(" · ") + ". Base Rate und SPY tragen keine Kosten." }),
        el("h3", { class: "qx-sub", text: "Ergebnis nach Zeitraum" }),
        bars(hz.map(function (k) { return { label: h[k].label, value: h[k].median }; }), { label: "Median nach Zeitraum", fmt: function (v) { return pct(v, 1, true); }, signed: true }),
        el("h3", { class: "qx-sub", text: "Typischer Verlauf nach dem Regelereignis (Equity-Kurve je Fall)" }),
        pathChart(r.path, { label: "Median-Verlauf nach dem Regelereignis mit mittlerer Hälfte und Marktbasis", unit: unitDays ? "Tage" : "Wochen" }),
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
        areaChart(r.path.drawdownMedian || [], [unitDays ? "0 Tage" : "0 Wochen", (r.path.weeks || r.path.days || []).slice(-1)[0] + (unitDays ? " Tage" : " Wochen")], { label: "Typischer Rückgang vom bisherigen Hoch nach dem Regelereignis" }),
        el("p", { class: "qx-small", text: "Median des Abstands zum bisherigen Hoch seit dem Einstieg. Schlimmste 10 % der Fälle nach 6 Monaten: " + pct(m6.maxDrawdown.p10, 1) + "." })].filter(Boolean)));
      var vs = hz.map(function (k) { return [h[k].label, pct(h[k].median, 1, true), pct(h[k].base.median, 1, true), h[k].vsMarket ? pct(h[k].vsMarket.medianExcess, 1, true) : "–", h[k].vsMarket ? share(h[k].vsMarket.shareAboveMarket) : "–", h[k].vsSpy ? pct(h[k].vsSpy.medianExcess, 1, true) : "–"]; });
      out.push(X.section("Vergleich", "Eine Rendite ohne Vergleich sagt nichts über das Regelereignis.", [
        el("div", { class: "q-bt-table", role: "region", "aria-label": "Vergleich mit Markt und SPY", tabindex: "0" }, [el("table", {}, [
          el("thead", {}, [el("tr", {}, ["Zeitraum", "Regelereignis (Median)", "Alle Aktien", "Abstand zum Marktmedian derselben Woche", "Anteil über Marktmedian", "Abstand zu SPY"].map(function (t) { return el("th", { text: t }); }))]),
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
      el("p", { class: "qx-small", text: X.say(study.trustRule.plain) })]));

    out.push(X.section("Methodik", null, [el("ul", { class: "q-trust" }, [
      el("li", { text: "Alle Regeln und Parameter stehen vor dem Lauf fest; es wird nichts auf die Daten optimiert." }),
      el("li", { text: "Ein Regelereignis liest nur Kurse bis zur Signalwoche; der Einstieg liegt danach. Geprüft an echten Fällen mit abgeschnittener und verfälschter Zukunft." }),
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
      }).concat((r.parameterStability.entryDelay || []).map(function (d) { return el("li", { text: "Einstieg " + d.delayWeeks + " Woche(n) nach dem Regelereignis: Median-Abstand " + pct(d.medianExcessM6, 1, true) }); }))));
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
      el("p", { class: "qx-small", text: "Einstieg zum Schluss des Folgetags (Vergleich: Schluss des Stichtags); Ausstieg bei Schluss unter der Ungültig-Marke laut Methode, an der ersten Marke der Methode oberhalb, bei veröffentlichtem Abstieg oder nach 126 Handelstagen. Kosten LOW/BASE/HIGH. Ergebniszahlen erscheinen erst nach der Zertifizierung." }),
      kindCert.replay ? el("p", { class: "qx-small", text: "Nachgeprüft: " + kindCert.replay.parity + " veröffentlichte Setup-Stände wurden aus Kursen bis zum jeweiligen Tag exakt nachgerechnet. Die Rekonstruktion ist kein Ersatz für veröffentlichte Stände und liefert keine Ergebnisse." }) : null
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

  /* Konzept Quant 2026-11 (QX07, Screen q-backtest): Backtesting heißt „Forschung“ (#/forschung) und trägt immer das Etikett
     „Forschung, nicht zertifiziert“. Stand in drei Zahlen, „Marktweit geprüft“ mit Balken um die Null in Prozentpunkten,
     „Sammelt noch Historie“, „Was zur Zertifizierung fehlt“ (die bisherige Übersicht, aufklappbar). Nur vorhandene Zahlen. */
  var KIND_SHORT = { SETUP_BACKTEST: null, STRATEGY_BACKTEST: "Anlagestile", FACTOR_RANKING_BACKTEST: "Eigenschaften-Rang" };
  /* BACKTEST-FORSCHUNG (backtest-research-v1.json, Erzeuger scripts/quant/research/build-backtest-research.cjs):
     feste Prueffaelle mit den sieben Zusatzmethoden. Forschung, nicht zertifiziert, nur interne Ansicht hinter der
     Zugangsmaske; Zahlen unveraendert aus dem Ergebnisvertrag, keine neue Rechnung. */
  var BR_KIND = { SAME_STOCK_REPLAY: "Rückblick einer Aktie", PATTERN_EVIDENCE: "Muster", SIGNAL_BACKTEST: "Meldungsregeln", SETUP_BACKTEST: "Setups",
    STRATEGY_BACKTEST: "Anlagestil-Depot", FACTOR_RANKING_BACKTEST: "Eigenschaften-Rang" };
  var BR_SCEN = { STRONG_WINNER: "starker Gewinner", STRONG_LOSER: "starker Verlierer", CORPORATE_ACTION_SPLIT: "mit Aktiensplit", SIDEWAYS: "Seitwärtsmarkt",
    BEAR_CRASH: "Crash", RECOVERY: "Erholung", RECONSTRUCTION: "Rekonstruktion", BULL: "Aufwärtsmarkt", DIVIDENDS: "mit Dividenden", STATE_B: "Daten begrenzt",
    DELISTED: "Börsenrückzug", ACQUISITION: "Übernahme" };
  var BR_METHOD = [["MONTE_CARLO", "Monte Carlo"], ["WALK_FORWARD", "Walk-Forward"], ["OUT_OF_SAMPLE", "Spätere Testfenster"], ["MARKET_REGIME", "Marktlage"],
    ["PARAMETER_SENSITIVITY", "Sensitivität"], ["EVENT_DRIVEN", "Dividenden-Ereignis"], ["PORTFOLIO_REBALANCING", "Depot mit Umschichtung"]];
  var BR_REGIME = { "NEGATIVE_TREND/HIGH_VOLATILITY": "Abwärtstrend, unruhig", "NEGATIVE_TREND/LOW_VOLATILITY": "Abwärtstrend, ruhig",
    "POSITIVE_TREND/HIGH_VOLATILITY": "Aufwärtstrend, unruhig", "POSITIVE_TREND/LOW_VOLATILITY": "Aufwärtstrend, ruhig" };
  function brTitle(c) { return (BR_KIND[c.kind] || c.kind) + (c.scenarios && c.scenarios.length ? " · " + c.scenarios.map(function (x) { return BR_SCEN[x] || x; }).join(", ") : ""); }
  function brYears(p) { return p && p.from ? String(p.from).slice(0, 4) + (p.to && String(p.to).slice(0, 4) !== String(p.from).slice(0, 4) ? "–" + String(p.to).slice(0, 4) : "") : ""; }
  function brRan(c) { return BR_METHOD.filter(function (m) { return c.methods[m[0]] && c.methods[m[0]].state === "EXECUTED"; }); }
  var BR_TAG = '<span class="qk-tag qk-tag--ink">Forschung, nicht zertifiziert · intern</span>';
  /* Für Kunden in fünf Sekunden: je Methode eine Frage in Alltagssprache und ein Urteil. Die Fachtabelle steht darunter aufgeklappt. */
  var BR_PLAIN_Q = { SAME_STOCK_REPLAY: "Was wäre passiert, wenn man eine Aktie nach der Quant-Regel gekauft hätte?",
    PATTERN_EVIDENCE: "Wie ging es weiter, nachdem eine Aktie deutlich gefallen war?",
    SIGNAL_BACKTEST: "Lohnten sich die Quant-Meldungen, zum Beispiel ein neues Jahreshoch?",
    SETUP_BACKTEST: "Lösten sich Setups früher nach oben auf?",
    STRATEGY_BACKTEST: "Wie hätte ein Depot nach einem Anlagestil abgeschnitten?",
    FACTOR_RANKING_BACKTEST: "Schnitten Aktien mit starken Eigenschaften besser ab als der Rest?" };
  function brPlainVerdict(res, k) {
    var cert = brCert(res, k), n = { PROVEN: 0, REGIME_DEPENDENT: 0, LIMITED: 0, FAILED: 0 };
    BR_METHOD.forEach(function (m) { var v = brVerdictOf(res.matrix[k][m[0]]); if (v) n[v] += 1; });
    var total = n.PROVEN + n.REGIME_DEPENDENT + n.LIMITED + n.FAILED;
    if (total && n.LIMITED * 2 >= total && !n.FAILED) return ["none", "eingeschränkt geprüft"];
    if (!total || (cert && cert.status !== "CERTIFIED")) return ["none", "noch offen"];
    if (n.FAILED * 2 > total) return ["weak", "nicht bewährt"];
    if (!n.REGIME_DEPENDENT && !n.FAILED) return ["strong", "bewährt"];
    if (n.PROVEN * 2 > total) return ["strong", "meist bewährt"];
    return ["mid", "nur manchmal"];
  }
  function brPlainException(res, k) {
    var bad = (res.cases || []).filter(function (c) { return c.kind === k && BR_METHOD.some(function (m) { return brVerdictOf(c.methods[m[0]]) === "FAILED"; }); });
    var crash = bad.find(function (c) { return (c.scenarios || []).indexOf("BEAR_CRASH") >= 0; });
    if (crash) return "Aber nicht im Crash " + brYears(crash.period) + ".";
    if (bad.length) return "Aber nicht bei jeder Aktie.";
    return "";
  }
  function brSimple(res) {
    var U = global.VUUI;
    if (!res.matrix) return "";
    return '<div class="vu-box qk-list qk-br-simple">' + res.kinds.map(function (k) {
      var v = brPlainVerdict(res, k), ex = v[0] === "strong" || v[0] === "mid" ? brPlainException(res, k) : "";
      return '<a class="qk-bt-c" href="' + U.esc(X.routes.backtestKind(k)) + '"><span><b>' + U.esc(BR_PLAIN_Q[k] || BR_KIND[k] || k) + "</b><span>" + U.esc(BR_KIND[k] || k) + (ex ? " · " + ex : "") + "</span></span>" + U.verdict(v[0], v[1]) + "</a>";
    }).join("") + "</div>";
  }
  async function researchSection(page, ctx, top) {
    var U = global.VUUI, res = await ctx.api.getBacktest("research").catch(function () { return null; });
    var host = el("section", { class: "qk-bt-research", "aria-label": "Was können die Quant-Methoden?" });
    page.append(host);
    if (!res || res.state !== "AVAILABLE") {
      host.innerHTML = '<div class="qk-rh"><div class="qk-rh-t"><h2>Robustheit der Prüffälle</h2></div></div>' + U.blank("Die Ergebnisse der Zusatzmethoden liegen noch nicht vor. Sie entstehen im Wochenlauf (sonntags).");
      return;
    }
    host.innerHTML = (top ? '<p class="vu-xs vu-mu">Stand ' + U.esc(String(res.asOf).split("-").reverse().join(".")) + "</p>" :
      '<div class="qk-rh"><div class="qk-rh-t"><h2>Was können die Quant-Methoden?</h2><span class="vu-xs vu-mu qk-sort">Stand ' + U.esc(String(res.asOf).split("-").reverse().join(".")) + "</span></div>" +
      "<p>Wir haben jede Methode rückwärts auf echte Kurse angewendet. „Bewährt“ heißt: besser als der Vergleich, also der S&P 500 oder bei Ranglisten das unterste Fünftel. Keine Prognose.</p></div>" + BR_TAG) +
      brSimple(res) +
      '<details class="vu-box qk-bt-more"><summary><b>Alle Prüfungen im Detail</b></summary>' + brMatrix(res) + "</details>" +
      '<details class="vu-box qk-bt-more"><summary><b>Alle ' + res.cases.length + ' Prüffälle</b></summary><div class="qk-list">' + res.cases.map(function (c) {
        var ran = brRan(c);
        return '<a class="qk-bt-c" href="' + U.esc(X.routes.backtestCase(c.id)) + '"><span><b>' + U.esc(brTitle(c)) + "</b><span>" + U.esc(brYears(c.period)) +
          (c.state === "PREPARED_DATA_LIMITED" ? " · Daten begrenzt" : " · " + ran.length + " von 7 Methoden") + "</span></span>" +
          U.verdict(c.state === "PREPARED_DATA_LIMITED" ? "none" : "mid", c.state === "PREPARED_DATA_LIMITED" ? "wartet" : "gerechnet") + "</a>";
      }).join("") + "</div></details>";
  }
  /* Diagramme (SVG, ohne Bibliothek): Monte-Carlo-Band, Testfenster-Zeitleiste, Marktlage-Balken. Farben aus dem Konzept:
     positiv lime mit schwarzem Rand, negativ schwarz, Nulllinie grau. */
  function brScale(vals) { var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals)); if (hi - lo < 1e-9) hi = lo + 1; return function (v) { return 8 + (v - lo) / (hi - lo) * 304; }; }
  function brBand(q, label) {
    if (!q || typeof q.p5 !== "number") return "";
    var x = brScale([q.p5, q.p50, q.p95]), z = x(0), a = x(q.p5), b = x(q.p95), m = x(q.p50);
    return '<figure class="qk-br-fig"><svg viewBox="0 0 320 54" role="img" aria-label="' + global.VUUI.esc(label + ": 5 % " + brPct(q.p5) + ", Mitte " + brPct(q.p50) + ", 95 % " + brPct(q.p95)) + '">' +
      '<line x1="' + z + '" x2="' + z + '" y1="6" y2="40" class="qk-br-zero"/><rect x="' + a + '" y="14" width="' + Math.max(2, b - a) + '" height="18" rx="4" class="qk-br-band"/>' +
      '<line x1="' + m + '" x2="' + m + '" y1="10" y2="36" class="qk-br-mid"/>' +
      '<text x="' + a + '" y="52" class="qk-br-t" text-anchor="start">' + brPct(q.p5) + '</text><text x="' + b + '" y="52" class="qk-br-t" text-anchor="end">' + brPct(q.p95) + "</text></svg>" +
      '<figcaption class="vu-xs vu-mu">' + global.VUUI.esc(label) + ": Band = 5 % bis 95 % der Neuziehungen, Strich = mittlerer Fall.</figcaption></figure>";
  }
  function brBars(rows, label) {
    rows = rows.filter(function (r) { return typeof r[1] === "number"; });
    if (!rows.length) return "";
    var x = brScale(rows.map(function (r) { return r[1]; })), z = x(0), h = rows.length * 26 + 8;
    return '<figure class="qk-br-fig"><svg viewBox="0 0 320 ' + h + '" role="img" aria-label="' + global.VUUI.esc(label) + '">' + '<line x1="' + z + '" x2="' + z + '" y1="2" y2="' + (h - 2) + '" class="qk-br-zero"/>' +
      rows.map(function (r, i) { var v = x(r[1]), y = 6 + i * 26; return '<rect x="' + Math.min(z, v) + '" y="' + y + '" width="' + Math.max(2, Math.abs(v - z)) + '" height="16" rx="3" class="' + (r[1] >= 0 ? "qk-br-up" : "qk-br-dn") + '"><title>' + global.VUUI.esc(r[0] + ": " + brPct(r[1])) + "</title></rect>"; }).join("") +
      "</svg><figcaption class=\"vu-xs vu-mu\">" + global.VUUI.esc(label) + "</figcaption></figure>";
  }
  var BR_STATE = { EXECUTED: ["mid", "gerechnet"], NOT_APPLICABLE: ["none", "passt nicht"], DATA_MISSING: ["weak", "Daten fehlen"], NOT_RUN: ["none", "nicht gerechnet"], NO_CASE: ["none", "kein Fall"] };
  var BR_MISSING = { PRIVATE_FACTOR_PANEL: "privates Faktorpanel", PRIVATE_DATA_UNAVAILABLE: "private Reihen zurückgezogener Aktien", PROFILE_TARGETS_REQUIRE_PIT_FACTOR_SNAPSHOTS_WITH_ROW_AVAILABILITY: "historische Faktorstände je Stichtag" };
  var BR_REASON = { RECONSTRUCTION_IS_NOT_OOS_EVIDENCE: "Rekonstruktion ist kein Beleg auf späteren Testfenstern", NO_TR_REGISTER_EVENTS_FOR_POPULATION_IN_WINDOW: "keine Dividendentermine im Zeitraum",
    PURGE_OPERATION_BUDGET: "zu viele Ereignisse für die Fensterteilung (Rechenbudget)" };
  function brCellNote(c) { return c.state === "DATA_MISSING" ? "Daten fehlen: " + (c.missing || []).map(function (x) { return BR_MISSING[x] || x; }).join(", ") : c.state === "NOT_RUN" && c.reason ? BR_REASON[c.reason] || c.reason : ""; }
  var BR_SHORT = { MONTE_CARLO: "Monte Carlo", WALK_FORWARD: "Walk-Fwd", OUT_OF_SAMPLE: "Test~fenster", MARKET_REGIME: "Markt~lage", PARAMETER_SENSITIVITY: "Sensi~tivität", EVENT_DRIVEN: "Divi~dende", PORTFOLIO_REBALANCING: "Depot" };
  /* Methoden-Ampel (Erzeuger build-backtest-research.cjs#verdict): feste Regel je Methode, Forschung, keine Prognose. */
  var BR_VERDICT = { PROVEN: ["strong", "hat sich bewährt", "✓"], REGIME_DEPENDENT: ["mid", "nur in bestimmten Marktlagen", "◐"], LIMITED: ["none", "eingeschränkt geprüft", "◇"], FAILED: ["weak", "hat versagt", "✗"] };
  function brVerdictOf(x) { var v = x && (typeof x.verdict === "string" ? x.verdict : x.verdict && x.verdict.verdict); return BR_VERDICT[v] ? v : null; }
  function brCert(res, k) { var c = res.certification && res.certification.kinds && res.certification.kinds[k]; return c || null; }
  function brCertBadge(res, k) {
    var c = brCert(res, k), U = global.VUUI; if (!c) return "";
    return U.verdict(c.status === "CERTIFIED" ? "strong" : c.status === "LIMITED" ? "mid" : "weak", c.label || c.status);
  }
  /* Pflichtangaben je Backtest-Ansicht (assets/legal-notices.json, Schluessel backtest, required). */
  function brFacts(c) {
    var d = c.disclosure || {}, p = d.period || c.period || {};
    var bps = function (x) { return typeof x === "number" ? x.toLocaleString("de-DE") + " Bp" : "–"; };
    return { "Zeitraum": p.from ? String(p.from).split("-").reverse().join(".") + " – " + String(p.to).split("-").reverse().join(".") : "–",
      "Kosten je Trade": d.costs ? bps(d.costs.feeBpsPerSide) + " Gebühr + " + bps(d.costs.slippageBpsPerSide) + " Schlupf je Seite" : "–",
      "Vergleichsmaßstab (z. B. S&P 500 Gesamtrendite)": d.benchmark ? (d.benchmark.label || d.benchmark.id) + (d.benchmark.returnBasis === "PRICE_RETURN" ? ", Kursrendite" : d.benchmark.returnBasis ? ", Gesamtrendite" : "") : "–",
      "Enthält delistete Titel: ja/nein": d.delistedIncluded ? "ja" : "nein",
      "Anzahl getesteter Varianten": d.variants != null ? String(d.variants) : "–",
      "größter Verlust (max. Drawdown)": typeof d.maxDrawdown === "number" ? brPct(d.maxDrawdown) : "–" };
  }
  function brMatrix(res) {
    var U = global.VUUI;
    if (!res.matrix) return "";
    return '<div class="qk-br-mx" role="table" aria-label="Arten und Methoden"><div class="qk-br-mxr qk-br-mxh" role="row"><span role="columnheader">Art</span>' +
      BR_METHOD.map(function (m) { return '<a role="columnheader" href="' + U.esc(X.routes.backtestMethod(m[0])) + '" title="' + U.esc(m[1]) + '">' + U.esc(BR_SHORT[m[0]]).replace(/~/g, "&shy;") + "</a>"; }).join("") + "</div>" +
      res.kinds.map(function (k) {
        var cc = brCert(res, k);
        return '<div class="qk-br-mxr" role="row"><a role="rowheader" href="' + U.esc(X.routes.backtestKind(k)) + '">' + U.esc(BR_KIND[k] || k) + (cc && cc.status === "CERTIFIED" ? '<small class="qk-br-cert">methodisch geprüft</small>' : cc ? '<small class="qk-br-cert is-lim">' + U.esc(cc.label || "") + "</small>" : "") + "</a>" + BR_METHOD.map(function (m) {
          var c = res.matrix[k][m[0]], st = BR_STATE[c.state] || BR_STATE.NOT_RUN;
          var vd = c.state === "EXECUTED" ? brVerdictOf(c) : null, vw = vd ? BR_VERDICT[vd] : null;
          return '<span role="cell" class="qk-br-cell is-' + c.state.toLowerCase().replace(/_/g, "-") + (vd ? " is-" + vd.toLowerCase().replace(/_/g, "-") : "") + '" title="' + U.esc((vw ? vw[1] : st[1]) + (brCellNote(c) ? " – " + brCellNote(c) : "")) + '">' + (vw ? vw[2] : c.state === "EXECUTED" ? "●" : c.state === "NOT_APPLICABLE" ? "·" : c.state === "DATA_MISSING" ? "◌" : "○") + '<span class="qk-sr">' + U.esc(vw ? vw[1] : st[1]) + "</span></span>";
        }).join("") + "</div>";
      }).join("") + '</div><p class="vu-xs vu-mu qk-br-legend">✓ hat sich bewährt (besser als der Vergleich) · ◐ nur in bestimmten Marktlagen · ◇ eingeschränkt geprüft (nur heutige Überlebende) · ✗ hat versagt (nicht besser als der Vergleich) · ● gerechnet, noch ohne Einordnung · ◌ Daten fehlen · ○ nicht gerechnet · · passt methodisch nicht</p>' +
      (res.certification ? '<p class="vu-xs vu-mu qk-br-legend">' + U.esc(res.certification.certifiedKinds.length + " von " + res.kinds.length + " Arten methodisch geprüft: nachvollziehbar gerechnet und alle zulässigen Robustheitsprüfungen bestanden. Das sagt nichts über die Höhe des Ergebnisses.") + "</p>" : "");
  }
  async function brLoad(ctx) { var x = await ctx.api.getBacktest("research").catch(function () { return null; }); return x && x.state === "AVAILABLE" ? x : null; }
  function brHead(title, lead) {
    var U = global.VUUI;
    return '<a class="qv3-back" href="' + U.esc(X.routes.backtest()) + '"><span class="vu-round" aria-hidden="true">' + U.glyph("back", 18) + '</span><span class="vu-sm vu-mu">Forschung</span></a>' + BR_TAG +
      '<h1 class="vu-lt qk-bt-t">' + U.esc(title) + "</h1>" + (lead ? '<p class="vu-lead">' + U.esc(lead) + "</p>" : "");
  }
  var BR_KIND_LEAD = { SAME_STOCK_REPLAY: "Eine feste Regel auf einer einzelnen Aktie, Woche für Woche nachgespielt.", PATTERN_EVIDENCE: "Wie es nach einem Kursmuster weiterging, über viele Aktien.",
    SIGNAL_BACKTEST: "Die Meldungsregeln von Quant, rückwirkend auf viele Aktien angewendet.", SETUP_BACKTEST: "Setups aus der Chartanalyse, rückwirkend rekonstruiert.",
    STRATEGY_BACKTEST: "Ein Depot nach fester Regel, mit Umschichtung und Kosten.", FACTOR_RANKING_BACKTEST: "Aktien nach einer Eigenschaft sortiert und in Gruppen verglichen." };
  var BR_METHOD_LEAD = { MONTE_CARLO: "Zieht die beobachteten Ergebnisse vielfach neu und zeigt die Spanne. Keine Prognose.", WALK_FORWARD: "Teilt die Zeit in Fenster; die Regel bleibt fest, es wird nichts angepasst.",
    OUT_OF_SAMPLE: "Ergebnis in späteren Testfenstern einer vorab festen Regel.", MARKET_REGIME: "Ergebnis getrennt nach Marktlage (Trend und Schwankung des S&P 500).",
    PARAMETER_SENSITIVITY: "Wie stark das Ergebnis von einer vorab festgelegten Stellschraube abhängt.", EVENT_DRIVEN: "Verlauf rund um Dividendentermine.", PORTFOLIO_REBALANCING: "Ein Rechendepot mit Umschichtung, verglichen mit dem S&P 500." };
  async function renderKind(main, ctx, kind) {
    var U = global.VUUI, page = el("div", { class: "vu-ui qv3 qk qk-bt" }); main.append(page);
    var res = await brLoad(ctx), K = String(kind || "").toUpperCase();
    if (!res || !res.matrix || !res.matrix[K]) { page.innerHTML = brHead("Art nicht gefunden") + U.blank(res ? "Diese Backtest-Art gibt es nicht." : "Die Ergebnisse der Zusatzmethoden liegen noch nicht vor."); return; }
    var cases = res.cases.filter(function (c) { return c.kind === K; });
    var cc = brCert(res, K);
    var certHtml = cc ? '<div class="vu-box qk-br-m"><h2 class="vu-h3">Prüfstand</h2>' + brRow("Stand", brCertBadge(res, K)) +
      (cc.status !== "CERTIFIED" && cc.reason ? '<p class="vu-xs vu-mu">' + U.esc("Grund: " + (BR_REASON[cc.reason] || cc.reason)) + "</p>" : "") +
      (cc.disclosures && cc.disclosures.length ? '<p class="vu-xs vu-mu">' + U.esc("Offengelegt: " + cc.disclosures.map(function (d) { return d.label || d.id; }).join(", ")) + "</p>" : "") + "</div>" : "";
    page.innerHTML = brHead(BR_KIND[K] || K, BR_KIND_LEAD[K]) + certHtml + '<div class="vu-box qk-list">' + BR_METHOD.map(function (m) {
      var c = res.matrix[K][m[0]], st = BR_STATE[c.state] || BR_STATE.NOT_RUN, link = c.state === "EXECUTED" && c.cases && c.cases[0] ? X.routes.backtestCase(c.cases[0]) : X.routes.backtestMethod(m[0]);
      var vd = c.state === "EXECUTED" ? brVerdictOf(c) : null;
      return '<a class="qk-bt-c" href="' + U.esc(link) + '"><span><b>' + U.esc(m[1]) + "</b><span>" + U.esc(brCellNote(c) || (c.state === "EXECUTED" ? c.cases.length + (c.cases.length === 1 ? " Prüffall" : " Prüffälle") : st[1])) + "</span></span>" + (vd ? U.verdict(BR_VERDICT[vd][0], BR_VERDICT[vd][1]) : U.verdict(st[0], st[1])) + "</a>";
    }).join("") + '</div><div class="qk-rh"><div class="qk-rh-t"><h2>Prüffälle</h2></div></div><div class="vu-box qk-list">' + cases.map(function (c) {
      return '<a class="qk-bt-c" href="' + U.esc(X.routes.backtestCase(c.id)) + '"><span><b>' + U.esc(brTitle(c)) + "</b><span>" + U.esc(brYears(c.period)) + " · " + (c.state === "PREPARED_DATA_LIMITED" ? "Daten begrenzt" : brRan(c).length + " Methoden") + "</span></span></a>";
    }).join("") + "</div>" + '<div class="qk-help">' + U.help("Vergangenheit, keine Prognose und kein Renditeversprechen. Forschung, nicht zertifiziert.") + "</div>";
  }
  async function renderMethod(main, ctx, method) {
    var U = global.VUUI, page = el("div", { class: "vu-ui qv3 qk qk-bt" }); main.append(page);
    var res = await brLoad(ctx), M = String(method || "").toUpperCase(), def = BR_METHOD.filter(function (x) { return x[0] === M; })[0];
    if (!res || !res.matrix || !def) { page.innerHTML = brHead("Methode nicht gefunden") + U.blank(res ? "Diese Methode gibt es nicht." : "Die Ergebnisse der Zusatzmethoden liegen noch nicht vor."); return; }
    var blocks = res.cases.filter(function (c) { return c.methods[M] && c.methods[M].state === "EXECUTED"; });
    page.innerHTML = brHead(def[1], BR_METHOD_LEAD[M]) + '<div class="vu-box qk-list">' + res.kinds.map(function (k) {
      var c = res.matrix[k][M], st = BR_STATE[c.state] || BR_STATE.NOT_RUN;
      return '<a class="qk-bt-c" href="' + U.esc(X.routes.backtestKind(k)) + '"><span><b>' + U.esc(BR_KIND[k] || k) + "</b><span>" + U.esc(brCellNote(c) || st[1]) + "</span></span>" + U.verdict(st[0], st[1]) + "</a>";
    }).join("") + "</div>" + blocks.map(function (c) {
      return '<div class="qk-rh"><div class="qk-rh-t"><h2><a href="' + U.esc(X.routes.backtestCase(c.id)) + '">' + U.esc(brTitle(c)) + "</a></h2><span class=\"vu-xs vu-mu qk-sort\">" + U.esc(brYears(c.period)) + "</span></div></div>" + brMethod(M, c.methods[M]);
    }).join("") + '<div class="qk-help">' + U.help("Vergangenheit, keine Prognose und kein Renditeversprechen. Forschung, nicht zertifiziert.") + "</div>";
  }
  function brPct(v) { return pct(v, 1, true); }
  function brRow(label, value) { return '<div class="qk-br-row"><span>' + global.VUUI.esc(label) + '</span><b class="vu-num">' + value + "</b></div>"; }
  function brMethod(id, m) {
    var U = global.VUUI, rows = "", note = "";
    if (id === "MONTE_CARLO") {
      rows = brRow("Gesamtergebnis, mittlerer Fall", brPct(m.totalReturn.p50)) + brRow("Spanne (5 % bis 95 % der Ziehungen)", brPct(m.totalReturn.p5) + " bis " + brPct(m.totalReturn.p95)) +
        brRow("Größter Rückgang, mittlerer Fall", brPct(m.maxDrawdown.p50));
      rows += brBand(m.totalReturn, "Gesamtergebnis");
      note = m.simulations + " Neuziehungen aus " + m.sourceObservations + " beobachteten Werten über " + m.horizon + " Schritte. Bedingte Neuziehung, keine Prognose.";
    } else if (id === "WALK_FORWARD") {
      rows = brRow("Zeitfenster", String(m.folds)) + brRow("Ausgeschlossen (Überlappung, unreif)", String(Object.values(m.excludedByReason || {}).reduce(function (a, b) { return a + b; }, 0)));
      note = "Die Regel ist fest; die Fenster teilen nur die Zeit auf, es wird nichts angepasst.";
    } else if (id === "OUT_OF_SAMPLE") {
      rows = brRow("Mittel über alle Testfenster (" + m.n + " Fälle)", brPct(m.mean)) + (m.perFold || []).map(function (f) {
        return brRow((f.test ? String(f.test[0]).slice(0, 4) + "–" + String(f.test[1]).slice(0, 4) : "Fenster " + f.fold) + " (" + f.n + ")", brPct(f.mean)); }).join("");
      rows += brBars((m.perFold || []).map(function (f) { return [f.test ? String(f.test[0]).slice(0, 4) + "–" + String(f.test[1]).slice(0, 4) : "Fenster " + f.fold, f.mean]; }), "Mittel je Testfenster, zeitlich geordnet");
      note = "Testfenster einer vorab festen Regel, kein unberührter Rest.";
    } else if (id === "MARKET_REGIME") {
      rows = (m.states || []).filter(function (s) { return s.n; }).map(function (s) { return brRow((BR_REGIME[s.state] || s.state) + " (" + s.n + ")", brPct(s.mean)); }).join("");
      rows += brBars((m.states || []).filter(function (s) { return s.n; }).map(function (s) { return [BR_REGIME[s.state] || s.state, s.mean]; }), "Mittel je Marktlage");
      note = "Marktlage nach dem Wochentrend und der Schwankung des S&P 500 (zum jeweiligen Zeitpunkt bekannt).";
    } else if (id === "PARAMETER_SENSITIVITY") {
      rows = (m.grid || []).map(function (g) { var k = Object.keys(g.parameters || {}).map(function (x) { return x === "holdingPeriods" ? g.parameters[x] + " Wochen gehalten" : x + " " + g.parameters[x]; }).join(", ");
        return brRow(k + " (" + g.n + ")", brPct(g.estimate)); }).join("");
      note = "Nur das vorab festgelegte Raster; p-Werte im Raster korrigiert.";
    } else if (id === "EVENT_DRIVEN") {
      rows = brRow("Mittel netto je Ereignis", brPct(m.meanNet)) + brRow("Median netto", brPct(m.medianNet));
      note = "Dividendentermine aus dem Gesamtrendite-Register.";
    } else if (id === "PORTFOLIO_REBALANCING") {
      rows = (m.totalReturn != null ? brRow("Depot gesamt", brPct(m.totalReturn)) : "") + (m.benchmarkTotalReturn != null ? brRow("S&P 500 im selben Zeitraum", brPct(m.benchmarkTotalReturn)) : "") +
        (m.maxDrawdown != null ? brRow("Größter Rückgang", brPct(m.maxDrawdown)) : "") + (m.rebalances != null ? brRow("Umschichtungen", String(m.rebalances)) : "");
      note = m.maxPositions ? "Höchstens " + m.maxPositions + " Positionen, je " + m.holdingWeeks + " Wochen gehalten." : "Rechenmodell, kein echtes Geld.";
    }
    var vd = brVerdictOf(m);
    return '<div class="vu-box qk-br-m"><h2 class="vu-h3">' + U.esc(BR_METHOD.filter(function (x) { return x[0] === id; })[0][1]) + "</h2>" + (vd ? brRow("Einordnung", U.verdict(BR_VERDICT[vd][0], BR_VERDICT[vd][1])) : "") + rows + '<p class="vu-xs vu-mu">' + U.esc(note + (m.basis ? " Einordnung nach: " + m.basis + "." : "")) + "</p></div>";
  }
  async function renderCase(main, ctx, fall) {
    var U = global.VUUI, page = el("div", { class: "vu-ui qv3 qk qk-bt" });
    main.append(page);
    var back = '<a class="qv3-back" href="' + U.esc(X.routes.backtest()) + '"><span class="vu-round" aria-hidden="true">' + U.glyph("back", 18) + '</span><span class="vu-sm vu-mu">Forschung</span></a>';
    var res = await ctx.api.getBacktest("research").catch(function () { return null; });
    var c = res && res.state === "AVAILABLE" ? res.cases.filter(function (x) { return x.id === fall; })[0] : null;
    if (!c) { page.innerHTML = back + BR_TAG + '<h1 class="vu-lt qk-bt-t">Prüffall nicht gefunden</h1>' + U.blank(res && res.state === "AVAILABLE" ? "Diesen Prüffall gibt es nicht." : "Die Ergebnisse der Zusatzmethoden liegen noch nicht vor."); return; }
    var ran = brRan(c);
    page.innerHTML = back + BR_TAG + '<h1 class="vu-lt qk-bt-t">' + U.esc(brTitle(c)) + "</h1>" +
      '<p class="vu-lead">' + U.esc(brYears(c.period)) + (c.purpose ? " · " + U.esc(c.purpose) : "") + "</p>" +
      (c.state === "PREPARED_DATA_LIMITED" ? U.blank("Dieser Fall braucht private Daten (" + U.esc((c.missingInputs || []).join(", ").replace(/MISSING_INPUT:/g, "") || c.privateData || "–") + "). Ohne sie wird nichts geschätzt.") :
        ran.map(function (m) { return brMethod(m[0], c.methods[m[0]]); }).join("") +
        '<p class="vu-xs vu-mu">Nicht gerechnet: ' + U.esc(BR_METHOD.filter(function (m) { return ran.indexOf(m) < 0; }).map(function (m) { return m[1]; }).join(", ") || "–") + ".</p>") +
      (U.legal ? U.legal("backtest", { facts: brFacts(c) }) : "") +
      '<div class="qk-help">' + U.help("Vergangenheit, keine Prognose und kein Renditeversprechen. Forschung; nur intern sichtbar.") + "</div>";
  }
  async function renderV4(main, ctx, ruleId) {
    var U = global.VUUI, page = el("div", { class: "vu-ui qv3 qk qk-bt" });
    main.append(page);
    var all = await Promise.all([ctx.api.getBacktest("signal"), ctx.api.getBacktest("certification"), ctx.api.getBacktest("outcomes")]);
    var signal = all[0], cert = all[1];
    var head = '<span class="qk-tag qk-tag--ink">Forschung, nicht zertifiziert</span>';
    if (signal.state !== "AVAILABLE" || cert.state !== "AVAILABLE") { page.innerHTML = head + U.blank("Die Studien konnten gerade nicht geladen werden."); return; }
    if (ruleId) {
      page.innerHTML = '<a class="qv3-back" href="' + U.esc(X.routes.backtest()) + '"><span class="vu-round" aria-hidden="true">' + U.glyph("back", 18) + '</span><span class="vu-sm vu-mu">Forschung</span></a>' + head;
      var legacy = el("div", { class: "qk-bt-legacy" }); page.append(legacy);
      await render(legacy, ctx, ruleId, true);
      var hero = legacy.querySelector(".q-hero"); if (hero) hero.remove();
      var picks = legacy.querySelector(".q-bt-picks"); if (picks) picks.remove();
      /* Die Regelseite braucht eine eigene Hauptüberschrift (der alte Kopf mit h1 entfällt); Name der Regel bzw. des Setups. */
      var rh = el("h1", { class: "vu-lt qk-bt-t", text: RULE_LABEL[ruleId] || "Regel" });
      var sub = legacy.querySelector(".q-bt-head h2"); if (sub && sub.textContent === rh.textContent) sub.remove();
      legacy.before(rh);
      return;
    }
    var nOf = function (st) { return cert.kinds.filter(function (k) { return k.status === st; }).length; };
    var rules = signal.rules.filter(function (r) { return r.horizons.m6 && r.horizons.m6.baseRate && typeof r.horizons.m6.baseRate.deltaPositiveShare === "number"; })
      .sort(function (a, b) { return b.horizons.m6.baseRate.deltaPositiveShare - a.horizons.m6.baseRate.deltaPositiveShare; });
    var max = Math.max.apply(null, [0.005].concat(rules.map(function (r) { return Math.abs(r.horizons.m6.baseRate.deltaPositiveShare); })));
    var ppTxt = function (v) { var x = v * 100; return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
    var setupCert = cert.kinds.filter(function (k) { return k.id === "SETUP_BACKTEST"; })[0];
    var collecting = [];
    if (setupCert && setupCert.status !== "CERTIFIED") collecting.push(["Setup bestätigt", X.routes.backtest("SETUP_CONFIRMED")], ["Setup entsteht", X.routes.backtest("SETUP_NEW")]);
    cert.kinds.forEach(function (k) { if (KIND_SHORT[k.id] && k.status === "COLLECTING_HISTORY") collecting.push([KIND_SHORT[k.id], null]); });
    var h = head + '<h1 class="vu-lt qk-bt-t">Hatte eine Meldung früher einen Vorteil?</h1><p class="vu-lead">Für jede Meldung: wie es 6 Monate danach im Vergleich zum Markt derselben Wochen lief.</p>' +
      '<div class="qk-today qk-bt-stand"><span class="qk-tg">' + [[nOf("CERTIFIED") + " von " + cert.kinds.length, "zertifiziert"], [String(nOf("LIMITED")), "eingeschränkt geprüft"], [String(nOf("COLLECTING_HISTORY")), "sammeln Historie"]].map(function (x) { return '<span><b class="vu-num">' + x[0] + "</b><span>" + x[1] + "</span></span>"; }).join("") + "</span></div>" +
      '<div class="qk-rh"><div class="qk-rh-t"><h2>Marktweit geprüft</h2><span class="vu-xs vu-mu qk-sort">Prozentpunkte zum Markt</span></div></div><div class="vu-box qk-list">' +
      rules.map(function (r) {
        var d = r.horizons.m6.baseRate.deltaPositiveShare, w = Math.max(2, Math.round(Math.abs(d) / max * 50)), edge = global.QXEvidence.edgeOf(ruleEvidence(r));
        return '<a class="qk-bt-r" href="' + U.esc(X.routes.backtest(r.id)) + '"><span><b>' + U.esc(RULE_LABEL[r.id] || r.id) + '</b><span>' + U.esc(edge.label) + '</span></span><span class="qk-bt-bar" aria-hidden="true"><i class="' + (d >= 0 ? "is-up" : "is-dn") + '" style="width:' + w + "%;" + (d >= 0 ? "left:50%" : "right:50%") + '"></i></span><b class="vu-num">' + ppTxt(d) + "</b></a>";
      }).join("") + "</div>" +
      '<div class="qk-help">' + U.help("+1,4 heißt: Nach der Meldung lagen 1,4 Prozentpunkte mehr Fälle nach 6 Monaten höher als im Markt derselben Wochen. Vergangenheit, keine Prognose.") + "</div>" +
      (collecting.length ? '<div class="qk-rh"><div class="qk-rh-t"><h2>Sammelt noch Historie</h2></div></div><div class="vu-box qk-list">' + collecting.map(function (c) {
        return (c[1] ? '<a class="qk-bt-c" href="' + U.esc(c[1]) + '">' : '<div class="qk-bt-c">') + "<b>" + U.esc(c[0]) + "</b>" + U.verdict("none", "sammelt") + (c[1] ? "</a>" : "</div>"); }).join("") + "</div>" : "");
    /* Für Kunden zuerst die einfache Übersicht (eine Frage und ein Urteil je Methode); der Meldungsvergleich in Prozentpunkten steht aufgeklappt darunter. */
    var simple = await ctx.api.getBacktest("research").catch(function () { return null; });
    if (simple && simple.state === "AVAILABLE" && simple.matrix) {
      page.innerHTML = head + '<h1 class="vu-lt qk-bt-t">Was können die Quant-Methoden?</h1><p class="vu-lead">Wir haben jede Methode rückwärts auf echte Kurse angewendet. „Bewährt“ heißt: besser als der Vergleich, also der S&P 500 oder bei Ranglisten das unterste Fünftel. Keine Prognose.</p>';
      await researchSection(page, ctx, true);
      var byRule = el("details", { class: "vu-box qk-bt-more" }, [el("summary", {}, [el("b", { text: "Meldungen im Einzelnen" })])]);
      var byRuleBody = el("div", {}); byRuleBody.innerHTML = h.replace(head, "").replace('<h1 class="vu-lt qk-bt-t">Hatte eine Meldung früher einen Vorteil?</h1>', '<h2 class="vu-h3">Hatte eine Meldung früher einen Vorteil?</h2>');
      byRule.append(byRuleBody); page.append(byRule);
    } else {
      page.innerHTML = h;
      await researchSection(page, ctx);
    }
    var more = el("details", { class: "vu-box qk-bt-more" }, [el("summary", {}, [el("b", { text: "Was zur Zertifizierung fehlt" })])]);
    var body = el("div", { class: "qk-bt-legacy" }); more.append(body); page.append(more);
    await render(body, ctx, null, true);
    var hero = body.querySelector(".q-hero"); if (hero) hero.remove();
    var picks = body.querySelector(".q-bt-picks"); if (picks) picks.remove();
  }
  async function render(main, ctx, ruleId, inner, fall) {
    if (!inner && global.VUUI) {
      if (fall && fall.art) return renderKind(main, ctx, fall.art);
      if (fall && fall.methode) return renderMethod(main, ctx, fall.methode);
      return fall ? renderCase(main, ctx, fall.fall || fall) : renderV4(main, ctx, ruleId);
    }
    main.append(el("header", { class: "q-hero q-hero--page" }, [X.globe(), el("p", { class: "q-kicker", text: "Backtesting" }),
      el("h1", { class: "qx-h1", text: "Hatte ein Regelereignis früher wirklich einen Vorteil?" }),
      el("p", { class: "q-hero-lead v2-lead", text: "Für jede Regel: wie oft die Fälle nach 6 Monaten höher lagen – und wie oft der ganze Markt in denselben Wochen. Dazu, wie belastbar der Vergleich ist und was noch fehlt. Keine Prognose, keine Empfehlung." })]));
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

  /* Aktienseite, Ebene 1: „Was die Geschichte zu diesem Signal sagt“. Nur bei öffentlichem Schalter (display.public) und
     nur aus der Forschung: Trefferquote des auslösenden Signals (marktweit), schlechtester geprüfter Fall (Finanzkrise),
     Marktlage aller Meldungsregeln zusammen, Pflichtangaben. Keine Prognose. */
  function historyCard(res, card) {
    var U = global.VUUI;
    if (!U || !res || res.state !== "AVAILABLE" || !res.display || res.display.public !== true || !res.matrix) return null;
    var all = (res.cases || []).find(function (c) { return c.id === "matrix-signal"; });
    if (!all) return null;
    var T = global.VUQuantRadar ? global.VUQuantRadar.TYPE : {};
    var ev = ((card && card.events) || []).filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE" && typeof e.backtest.positiveShare === "number"; })[0];
    var share = ev ? ev.backtest.positiveShare : all.metrics && all.metrics.hitRate;
    if (typeof share !== "number") return null;
    var name = ev ? "„" + ((T[ev.eventType] || {}).label || ev.eventType) + "“" : null;
    var v = brPlainVerdict(res, "SIGNAL_BACKTEST"), ex = v[0] === "strong" || v[0] === "mid" ? brPlainException(res, "SIGNAL_BACKTEST") : "";
    var cmp = all.comparison, pp = cmp && typeof cmp.value === "number" ? Math.abs(cmp.value * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : null;
    var vsMarket = pp ? (cmp.value > 0 ? "Im Schnitt " + pp + " Prozentpunkte besser als der S&P 500 im selben Zeitraum." : "Im Schnitt " + pp + " Prozentpunkte schlechter als der S&P 500 im selben Zeitraum.") : "";
    var facts = brFacts(all);
    var html = '<div class="qk-br-hist">' +
      '<h3>' + U.esc(name ? "Hat das Signal " + name + " früher funktioniert?" : "Haben die Quant-Meldungen früher funktioniert?") + "</h3>" +
      '<p class="qk-br-big"><b class="vu-num">' + Math.round(share * 100) + " von 100</b> Fällen lagen ein halbes Jahr später höher.</p>" +
      (vsMarket ? '<p class="vu-sm">' + U.esc(vsMarket) + "</p>" : "") +
      '<p class="qk-br-verdict">' + U.verdict(v[0], v[1]) + (ex ? '<span class="vu-sm">' + U.esc(ex) + "</span>" : "") + "</p>" +
      (U.legal ? U.legal("backtest") : "") +
      '<details class="qk-br-facts"><summary class="vu-sm">Wie wurde gerechnet?</summary><ul class="vu-sm">' + Object.keys(facts).map(function (k) {
        return "<li><b>" + U.esc(k.replace(/\s*\(z\. B\.[^)]*\)/, "").replace(/:\s*ja\/nein$/, "")) + ":</b> " + U.esc(facts[k]) + "</li>"; }).join("") +
      "</ul>" + '<p class="vu-sm"><a href="' + U.esc(X.routes.backtestKind("SIGNAL_BACKTEST")) + '">Alle Prüfungen ansehen</a></p></details></div>';
    var box = document.createElement("div"); box.className = "q-ev-history"; box.innerHTML = html;
    return box;
  }

  global.QXBacktest = { TRUST_WORD: TRUST_WORD, STATUS_WORD: STATUS_WORD, tierWord: tierWord, statusBadge: statusBadge, reasonText: reasonText, evidenceBlock: evidenceBlock, trackingSection: trackingSection, render: render, pathChart: pathChart, historyCard: historyCard };
})(typeof window !== "undefined" ? window : globalThis);
