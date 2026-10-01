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

  var TRUST_WORD = { NOT_READY: "nicht bereit", LIMITED: "eingeschränkt", USABLE: "belastbar", ROBUST: "robust" };
  var REASON = {
    TOO_FEW_TITLES_OR_CASES: "Zu wenige Titel mit vollständiger Tageshistorie – die Stichprobe wächst mit jedem Pipeline-Lauf.",
    FACTOR_HISTORY_TOO_SHORT: "Die Faktorhistorie ist noch zu kurz.",
    MEMBERSHIP_AND_FACTOR_HISTORY_TOO_SHORT: "Historische Index-Zugehörigkeit und Faktorhistorie sind noch zu kurz.",
    PATTERN_MATCH_HISTORY_TOO_SHORT: "Die Musterhistorie hat gerade erst begonnen.",
    PATH_STATES_CLOSED: "Die Pfadzustände der Setup-Engine sind noch nicht freigeschaltet.",
    NOT_A_TRADABLE_EVENT: "Beschreibt die Datenlage, kein Kursereignis.",
    STUDY_NOT_PUBLISHED: "Die Studie ist nicht veröffentlicht.",
    TRUST_NOT_READY: "Die Vertrauensstufe reicht nicht.",
    HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING: "Die historische Index-Zugehörigkeit fehlt – das heutige Universum wird nie eingesetzt.",
    TOTAL_RETURN_SERIES_NOT_PUBLISHED: "Es gibt keine Gesamtrendite-Reihen (Dividenden fehlen).",
    TODAYS_UNIVERSE_ONLY: "Nur heute gelistete Aktien – später delistete fehlen.",
    HAND_PICKED_SURVIVORS: "Nur ausgewählte, heute gelistete Titel.",
    DAILY_HISTORY_ONLY_IN_PRIVATE_STORE: "Die volle Tageshistorie liegt nur in der Pipeline vor.",
    STUDY_DECLARES_BACKTEST_NOT_CERTIFIED: "Die Studie ist als Häufigkeitsauswertung freigegeben, nicht als Backtest.",
    PRESENT_AND_UNQUANTIFIED_IN_PART: "Der Überlebenden-Effekt ist nicht quantifiziert.",
    NO_INDEX_LEVEL_SERIES_PUBLISHED: "Es gibt keine Indexreihe mit Gesamtrendite.",
    OOS_DIRECTION_NOT_CONFIRMED: "Die Richtung bestätigt sich außerhalb des Lernzeitraums nicht.",
    FOLDS_DISAGREE: "Die Walk-Forward-Abschnitte zeigen in verschiedene Richtungen.",
    REGIME_UNDERSAMPLED: "Zu wenige Fälle in mindestens einer Marktphase.",
    NEIGHBOURS_DISAGREE: "Benachbarte Parameter zeigen in eine andere Richtung.",
    FIXED_MAPPING_NOT_SWEPT: "Die freigegebene Zuordnung wird nicht variiert.",
    OUTCOMES_INCOMPLETE: "Zu viele Fälle ohne vollständigen Ausgang.",
    PIT_NOT_PROVEN: "Point-in-Time ist nicht belegt.",
    PIT_OR_PARITY_MISMATCH: "Die Nachrechnung weicht von veröffentlichten Ständen ab.",
    PARITY_NOT_MEASURED: "Die Nachrechnung ist nicht gemessen.",
    NO_REBALANCE_CONTRACT: "Es gibt keinen Rebalancing-Vertrag.",
    PIT_FUNDAMENTALS_MISSING: "Zeitpunktgenaue Fundamentaldaten fehlen.",
    SETUP_OUTCOMES_NOT_CERTIFIED: "Die Setup-Methodik gibt Ausgangszahlen erst nach ihrer Zertifizierung frei.",
    NOT_CERTIFIED: "Die Setup-Methodik gibt Ausgangszahlen erst nach ihrer Zertifizierung frei.",
    HISTORY_TOO_SHORT: "Die Historie ist zu kurz.",
    NO_STUDY: "Es gibt keine Studie.",
    TOTAL_RETURN_MISSING: "Die Gesamtrendite fehlt."
  };
  function reasonText(code) { return REASON[code] || "Eine Bedingung der Vertrauensregel ist nicht erfüllt."; }
  function pct(v, d, signed) { return typeof v === "number" && isFinite(v) ? VM.pct(v, d === undefined ? 1 : d, signed) : "–"; }
  function share(v) { return typeof v === "number" && isFinite(v) ? Math.round(v * 100) + " %" : "–"; }
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("de-DE", { maximumFractionDigits: d === undefined ? 2 : d }) : "–"; }
  function int(v) { return typeof v === "number" && isFinite(v) ? Math.round(v).toLocaleString("de-DE") : "–"; }
  function trustPill(trust) { return el("span", { class: "q-trust-badge trust-" + String(trust || "NOT_READY").toLowerCase(), text: "Vertrauen: " + (TRUST_WORD[trust] || "nicht bereit") }); }
  function returnWord(t) { return t === "TOTAL_RETURN" ? "Gesamtrendite (mit Dividenden)" : "Kursrendite ohne Dividenden"; }

  var RULE_LABEL = {
    MOMENTUM_IMPROVED: "Momentum verbessert", MOMENTUM_DETERIORATED: "Momentum verschlechtert", TREND_UP: "Über der langfristigen Linie",
    TREND_DOWN: "Unter die langfristige Linie", NEW_52W_HIGH: "Neues 52-Wochen-Hoch",
    SETUP_CONFIRMED: "Setup bestätigt", SETUP_NEW: "Setup entsteht", SETUP_WEAKENED: "Setup schwächt sich ab"
  };

  /* ------------------------------------------------- Radar-Karte: Evidenz */
  function evidenceBlock(events, opts) {
    opts = opts || {};
    var T = global.VUQuantRadar ? global.VUQuantRadar.TYPE : {};
    var hit = (events || []).filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; })[0];
    if (hit) {
      var b = hit.backtest, label = (T[hit.eventType] || {}).label || hit.eventType;
      return el("div", { class: "q-rc-hist" }, [
        el("p", { class: "q-rc-hist-head" }, [el("b", { text: "Historische Evidenz" }), trustPill(b.trust)]),
        el("p", { class: "q-rc-hist-what", text: "„" + label + "“ wurde " + int(b.n) + "-mal historisch beobachtet (marktweit, " + (b.horizon === "m6" ? "6 Monate" : b.horizon) + ")." }),
        el("dl", { class: "q-rc-hist-kv" }, [
          el("dt", { text: "im Plus" }), el("dd", { class: "num", text: share(b.positiveShare) }),
          el("dt", { text: "Median 6 M." }), el("dd", { class: "num " + (b.median > 0 ? "up" : b.median < 0 ? "down" : ""), text: pct(b.median, 1, true) }),
          el("dt", { text: "typ. Rückgang" }), el("dd", { class: "num down", text: pct(b.typicalDrawdown, 1) }),
          el("dt", { text: "Chance/Risiko" }), el("dd", { class: "num", text: num(b.chanceRisk) })]),
        opts.compact ? null : el("small", { class: "q-rc-hist-note", text: returnWord(b.returnType) + " · gegenüber dem Marktmedian derselben Woche " + pct(b.medianExcess, 1, true) + " · keine Prognose" })
      ]);
    }
    var first = (events || [])[0], w = first && first.backtest;
    if (!w) return null;
    return el("div", { class: "q-rc-hist is-off" }, [el("b", { text: "Historischer Backtest noch nicht freigegeben" }), el("small", { text: reasonText(w.reason) })]);
  }

  /* --------------------------------------------- Aktienseite: Radar-Status */
  function trackingSection(tr, ctx) {
    if (!tr || tr.state !== "AVAILABLE") return null;
    var R = global.VUQuantRadar, label = function (id) { var l = R ? R.LIFECYCLE.filter(function (x) { return x.id === id; })[0] : null; return l ? l.label : id || "–"; };
    var rows = [
      ["Zustand jetzt", label(tr.current)],
      ["Davor", tr.previous ? label(tr.previous) : "–"],
      ["Seit", tr.enteredAt ? (tr.enteredAtIsLowerBound ? "mindestens seit " : "") + X.dateDe(tr.enteredAt) : "–"],
      ["Dauer", typeof tr.durationDays === "number" ? (tr.enteredAtIsLowerBound ? "≥ " : "") + tr.durationDays + (tr.durationDays === 1 ? " Tag" : " Tage") : "–"],
      ["Auslöser", tr.trigger || "–"],
      ["Ungültig unter", typeof tr.invalidation === "number" ? num(tr.invalidation) + " $" : "–"],
      ["Nächste Bedingung", tr.nextCondition ? "für „" + tr.nextCondition.label + "“ fehlen " + tr.nextCondition.open + " von " + tr.nextCondition.total : "–"],
      ["Rückblick (dieselbe Aktie)", { BROAD: "breit", THIN: "dünn", WITHHELD: "zurückgehalten", UNAVAILABLE: "nicht verfügbar", NONE: "keine Vergleichsfälle" }[tr.evidenceState] + (tr.episodes ? " · " + tr.episodes + " Fälle" : "")],
      ["Setup-Backtest", tr.backtest ? (tr.backtest.state === "AVAILABLE" ? TRUST_WORD[tr.backtest.trust] : "noch nicht freigegeben – " + reasonText(tr.backtest.reason)) : "kein Setup"]
    ];
    var kids = [el("dl", { class: "qx-kv q-track" }, [].concat.apply([], rows.map(function (r) { return [el("dt", { text: r[0] }), el("dd", { text: r[1] })]; })))];
    if (tr.events && tr.events.length) {
      var T = R ? R.TYPE : {};
      kids.push(el("ul", { class: "q-track-events" }, tr.events.map(function (e) {
        var t = T[e.eventType] || {};
        return el("li", { class: "tone-" + (e.direction || t.tone || "info") }, [el("b", { text: (t.label || e.eventType) + " · " + X.dateDe(e.occurredAt) }), el("span", { text: e.explanation }),
          e.backtest ? el("small", { text: e.backtest.state === "AVAILABLE" ? "Historisch: " + int(e.backtest.n) + "-mal beobachtet · " + share(e.backtest.positiveShare) + " im Plus nach 6 M. · Vertrauen " + TRUST_WORD[e.backtest.trust]
            : "Historischer Backtest noch nicht freigegeben: " + reasonText(e.backtest.reason) }) : null]);
      })));
    } else kids.push(el("p", { class: "qx-small", text: "Zum letzten Stand kein neues Ereignis bei dieser Aktie." }));
    kids.push(el("p", { class: "qx-small", text: "Stand " + X.dateDe(tr.asOf) + ". Beobachten ist kein Portfolio: keine Stückzahl, kein Einstand, keine Rendite." }));
    return kids;
  }

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
  function selectorCard(r, kindLabel, href) {
    var shown = r.display && r.display.allowed;
    return el("a", { class: "q-bt-pick" + (shown ? " is-on" : " is-off"), href: href }, [
      el("small", { text: kindLabel }), el("b", { text: RULE_LABEL[r.id] || r.label || r.id }),
      el("span", { text: shown ? int(r.sample.n) + " Fälle · " + TRUST_WORD[r.trust] : "noch nicht freigegeben" })]);
  }

  function ruleBody(r, study, kind) {
    var out = [], h = r.horizons, m6 = h.m6, unitDays = kind === "setup";
    var hz = ["m1", "m3", "m6", "m12"];
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
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: int(m6.n) }), el("span", { text: "Fälle" }), el("small", { text: "mit Ausgang nach 6 Monaten" })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: share(m6.positiveShare) }), el("span", { text: "im Plus (Trefferquote)" }), el("small", { text: "Markt: " + share(m6.base.positiveShare) })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num " + (m6.median > 0 ? "up" : "down"), text: pct(m6.median, 1, true) }), el("span", { text: "Median 6 M." }), el("small", { text: "Mittel " + pct(m6.mean, 1, true) + " = Ergebnis je Fall" })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num down", text: pct(m6.maxDrawdown.median, 1) }), el("span", { text: "typischer Rückgang" }), el("small", { text: "größter Rückgang im Zeitraum (Median)" })]),
          el("div", { class: "q-ev-tile" }, [el("b", { class: "num", text: num(m6.chanceRisk) }), el("span", { text: "Chance / Risiko" }), el("small", { text: "Median größter Anstieg ÷ größter Rückgang" })])]),
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

    out.push(X.section("Vertrauen", null, [el("p", {}, [trustPill(r.trust)]),
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
        var s = r.oos[k]; return el("li", { text: { train: "Lernen", validation: "Prüfen", test: "Testen" }[k] + ": " + int(s.n) + " Fälle, Median-Abstand " + pct(s.medianExcess, 1, true) });
      })));
      if (r.regimes) kids.push(el("h3", { class: "qx-sub", text: "Marktphasen (SPY über 26 Wochen)" }), el("ul", { class: "qx-small" }, Object.keys(r.regimes).map(function (k) {
        var g = r.regimes[k]; return el("li", { text: { UP: "steigend", DOWN: "fallend", SIDEWAYS: "seitwärts" }[k] + ": " + int(g.n) + " Fälle" + (r.display.allowed ? ", " + share(g.positiveShare) + " im Plus, Median " + pct(g.median, 1, true) : "") });
      })));
      if (r.parameterStability) kids.push(el("h3", { class: "qx-sub", text: "Parameter-Stabilität" }), el("ul", { class: "qx-small" }, [r.parameterStability.main].concat(r.parameterStability.neighbours).map(function (p, i) {
        return el("li", { text: (i ? "Nachbar " : "Regel ") + p.params.weeks + " Wochen: Median-Abstand " + pct(p.medianExcessM6, 1, true) });
      })));
      if (r.display.allowed && r.oppositeExit && r.oppositeExit.n) kids.push(el("h3", { class: "qx-sub", text: "Ausstieg beim Gegensignal" }), el("p", { class: "qx-small", text: int(r.oppositeExit.n) + " Fälle, Median " + pct(r.oppositeExit.median, 1, true) + ", " + share(r.oppositeExit.positiveShare) + " im Plus, Haltedauer im Median " + r.oppositeExit.medianHoldingWeeks + " Wochen; " + share(r.oppositeExit.shareEndedByOpposite) + " endeten durch das Gegensignal, der Rest nach 12 Monaten." }));
      if (r.display.allowed && r.timeToOutcome) kids.push(el("h3", { class: "qx-sub", text: "Zeit bis zum Ausgang (±10 %)" }), el("p", { class: "qx-small", text: share(r.timeToOutcome.upFirstShare) + " erreichten zuerst +10 % (Median " + (r.timeToOutcome.medianWeeksUp || r.timeToOutcome.medianDaysUp) + (unitDays ? " Tage" : " Wochen") + "), " + share(r.timeToOutcome.downFirstShare) + " zuerst −10 % (Median " + (r.timeToOutcome.medianWeeksDown || r.timeToOutcome.medianDaysDown) + (unitDays ? " Tage" : " Wochen") + ")." }));
      if (r.display.allowed) kids.push(el("h3", { class: "qx-sub", text: "Alle Zeiträume" }), el("ul", { class: "qx-small" }, hz.map(function (k) {
        var x = h[k]; return el("li", { text: x.label + ": " + int(x.n) + " Fälle, " + share(x.positiveShare) + " im Plus, Median " + pct(x.median, 1, true) + ", Mittel " + pct(x.mean, 1, true) + ", 10–90 %: " + pct(x.p10, 0, true) + " bis " + pct(x.p90, 0, true) });
      })));
      return el("div", {}, kids);
    }));
    return out;
  }

  async function render(main, ctx, ruleId) {
    main.append(el("header", { class: "q-hero q-hero--page" }, [X.globe(), el("p", { class: "q-kicker", text: "Backtesting" }),
      el("h1", { class: "qx-h1", text: "Wähle eine Regel oder ein Setup" }),
      el("p", { class: "q-hero-lead v2-lead", text: "Was geschah früher, nachdem dieselbe Regel galt? Gemessen über viele Aktien und Jahre, mit Vergleich, Vertrauensstufe und klaren Grenzen – keine Prognose, keine Empfehlung." })]));
    var all = await Promise.all([ctx.api.getBacktest("signal"), ctx.api.getBacktest("setup"), ctx.api.getBacktest("readiness")]);
    var signal = all[0], setup = all[1], ready = all[2];
    if (signal.state !== "AVAILABLE" && setup.state !== "AVAILABLE") { main.append(X.notice("Backtests derzeit nicht verfügbar", "Die Studien konnten nicht geladen werden.")); return; }
    var picks = [];
    if (signal.state === "AVAILABLE") signal.rules.forEach(function (r) { picks.push(selectorCard(r, "Radar-Signal · marktweit", X.routes.backtest(r.id))); });
    if (setup.state === "AVAILABLE") setup.rules.forEach(function (r) { picks.push(selectorCard(r, "Setup-Wechsel", X.routes.backtest(r.id))); });
    if (ready.state === "AVAILABLE") ready.kinds.filter(function (k) { return k.id === "D" || k.id === "E"; }).forEach(function (k) {
      picks.push(el("div", { class: "q-bt-pick is-off" }, [el("small", { text: k.id === "D" ? "Strategie" : "Faktor-Ranking" }), el("b", { text: k.label }), el("span", { text: "noch nicht freigegeben" })]));
    });
    main.append(el("nav", { class: "q-bt-picks", "aria-label": "Regel oder Setup wählen" }, picks));

    var rule = null, study = null, kind = null;
    if (ruleId && signal.state === "AVAILABLE") { rule = signal.rules.filter(function (r) { return r.id === ruleId; })[0] || null; if (rule) { study = signal; kind = "signal"; } }
    if (!rule && ruleId && setup.state === "AVAILABLE") { rule = setup.rules.filter(function (r) { return r.id === ruleId; })[0] || null; if (rule) { study = setup; kind = "setup"; } }
    main.querySelectorAll(".q-bt-pick").forEach(function (a) { if (rule && a.getAttribute("href") === X.routes.backtest(rule.id)) a.setAttribute("aria-current", "page"); });
    if (rule) {
      main.append(el("div", { class: "q-bt-head" }, [el("p", { class: "q-kicker", text: kind === "signal" ? "Radar-Signal · marktweit" : "Setup-Wechsel" }),
        el("h2", { class: "qx-h2", text: RULE_LABEL[rule.id] || rule.id }), el("p", { class: "qx-muted", text: rule.display.sentence }), trustPill(rule.trust)]));
      ruleBody(rule, study, kind).forEach(function (n) { if (n) main.append(n); });
    } else if (ruleId) main.append(X.notice("Regel nicht gefunden", "Diese Regel gibt es nicht. Wähle oben eine Regel oder ein Setup."));

    if (ready.state === "AVAILABLE") {
      main.append(X.section("Stand je Backtest-Art", "Gemessen, nicht behauptet: welche Art freigegeben ist und woran es bei den übrigen fehlt.", [el("div", { class: "q-evkinds" }, ready.kinds.map(function (k) {
        var pub = k.decision === "PUBLISHED";
        return el("div", { class: "q-evkind " + (pub ? "is-on" : "is-off") }, [el("b", { text: k.id + " · " + k.label }), el("span", { class: "q-evkind-state", text: pub ? "freigegeben" + (k.trust ? " · " + TRUST_WORD[k.trust] : "") : "noch nicht freigegeben" }),
          el("ul", {}, k.gates.map(function (g) { return el("li", { class: g.state === "PASS" ? "is-pass" : "is-fail" }, [el("span", { text: (g.state === "PASS" ? "✓ " : "✗ ") + g.label }), el("small", { text: " – " + g.value })]); })),
          k.note ? el("p", { class: "qx-small", text: k.note }) : null]);
      }))], { href: X.routes.method("historie"), label: "Methodik" }));
    }
  }

  global.QXBacktest = { TRUST_WORD: TRUST_WORD, reasonText: reasonText, evidenceBlock: evidenceBlock, trackingSection: trackingSection, render: render, pathChart: pathChart };
})(typeof window !== "undefined" ? window : globalThis);
