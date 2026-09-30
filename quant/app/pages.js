/* =========================================================================
   VISION UNIVERSE QUANT — app/pages.js
   Home · Quant Screener · Strategien · Aktien

   Jede Seite startet bei einer Frage des Nutzers, nicht bei einer Engine.
   Zahlen erscheinen nur mit Bedeutung und Stichtag; wo nichts belegt ist,
   steht nichts - oder ein Satz, warum.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;
  var FIELD = function (id) { return "quantV2.factorEvidence." + id; };

  /* Die vier Einstiege als Discovers farbige Tueren (v2-world-door). */
  /* Die Wege als helle Kacheln (Quick Access der Tafeln). */
  function doors(items) {
    return el("div", { class: "q-tiles qx-doors" }, items.map(function (d) {
      var t = X.tile({ icon: d.icon, title: d.title, text: d.text, href: d.href });
      t.classList.add("qx-door"); t.dataset.kicker = d.kicker;
      return t;
    }));
  }
  function nameOf(ctx, t) { var s = ctx.names && ctx.names[t]; return s || ""; }
  /* Eine Aktienkarte mit eigener Aussage: die staerkste gemessene
     Eigenschaft als Wert ("Kursstärke 92"), die Quant-Einordnung als Satz -
     aus den veroeffentlichten Faktorwerten. Beschriftet wird der Wert mit
     der Eigenschaft, die er misst; eine Gesamtnote gibt es nicht. */
  function quantPoster(ctx, t, rowBy, opts) {
    opts = opts || {};
    var v = rowBy && rowBy[t] ? VM.fromScreeningRow(rowBy[t]) : null;
    var best = v ? v.factors.filter(function (f) { return f.state === "AVAILABLE"; }).sort(function (a, b) { return b.score - a.score; })[0] : null;
    return X.poster({ ticker: t, name: nameOf(ctx, t),
      big: best ? String(Math.round(best.score)) : null, bigLabel: best ? best.name : null, tone: best ? best.tone : null,
      story: opts.story || (v && v.overall.id !== "KEINE_DATEN" ? v.overall.text : null), foot: opts.foot });
  }
  function screeningRows(ctx) {
    return ctx.api.getFactorEvidenceScreening().then(function (sc) {
      var by = {}; if (sc && sc.state === "AVAILABLE") sc.rows.forEach(function (r) { by[r.ticker] = r; }); return by;
    }).catch(function () { return {}; });
  }
  var REGIME = { BROAD_WEAKNESS: "Breite Schwäche", BROAD_STRENGTH: "Breite Stärke", NARROW_LEADERSHIP: "Schmale Führung", MIXED: "Gemischte Lage" };
  var STRATEGY_ART = function (id) { return global.QXStock && global.QXStock.strategyArt ? global.QXStock.strategyArt(id) : null; };

  /* ================================================================ HOME
     Nach den Tafeln "Quant Home & Einstieg" und "Neuer Aufbau": Hero mit
     Weltkugel und Suche, Chips, Quick Access, Heute interessant, dann die
     Wege Backtesting und Historische Faelle, zuletzt der Aufbau in vier
     Schritten. */
  async function home(main, ctx) {
    var page = el("div", { class: "q-home" });
    main.append(page);
    page.append(el("header", { class: "q-hero v2-intro qx-intro qx-hero" }, [
      X.globe(),
      el("p", { class: "q-kicker", text: "Vision Universe Quant" }),
      el("h1", { text: "Was möchtest du heute analysieren?" }),
      el("p", { class: "q-hero-lead qx-lead", text: "Quant prüft über 6.000 US-Aktien nach festen Daten und Regeln – was für eine Aktie spricht, was dagegen, was sich verändert und was früher in ähnlichen Situationen geschah." }),
      el("p", { class: "q-hero-tag", "aria-hidden": "true" }, [el("span", { text: "Mehr" }), el("br"), el("span", { text: "Daten." }), el("br"), el("span", { text: "Klarere" }), el("br"), el("span", { text: "Entscheidungen." })]),
      el("button", { type: "button", class: "q-searchbar qx-searchbox", onclick: ctx.openSearch, "aria-label": "Aktie suchen und analysieren" }, [
        X.icon("search"), el("span", { text: "Aktie, Setup oder Strategie suchen …" }), el("i", { "aria-hidden": "true", text: "→" })]),
      el("nav", { class: "q-chips", "aria-label": "Schnellwahl" }, [
        el("a", { class: "q-chip", href: X.routes.stocks(), text: "Aktien" }),
        el("a", { class: "q-chip", href: X.routes.method("faktoren"), text: "Faktoren" }),
        el("a", { class: "q-chip", href: X.routes.screener("frage=setups"), text: "Setups" }),
        el("a", { class: "q-chip", href: X.routes.method("historie"), text: "Backtesting" }),
        el("a", { class: "q-chip", href: X.routes.strategies(), text: "Strategien" })])
    ]));

    page.append(X.section("Quick Access", null, [doors([
      { kicker: "Aktie", icon: "bars", title: "Aktie analysieren", text: "Fundamentaldaten, Faktoren und Setups", href: X.routes.stocks() },
      { kicker: "Quant Screener", icon: "filter", title: "Quant Screener", text: "Aktien nach deinen Kriterien finden", href: X.routes.screener() },
      { kicker: "Strategien", icon: "network", title: "Strategien", text: "Anlagestile und wer heute passt", href: X.routes.strategies() },
      { kicker: "Kursbild", icon: "setups", title: "Aktuelle Setups", text: "Konkrete Chancen aus dem Kursbild", href: X.routes.screener("frage=setups") }
    ])], { href: X.routes.method(), label: "Alle Tools" }));

    var cardsHost = el("div", {}, [X.loading("Aktien werden geladen …")]);
    page.append(X.section("Heute interessant", null, [cardsHost], { href: X.routes.stocks(), label: "Alle ansehen" }));
    page.append(el("div", { class: "q-tiles", style: "margin-top:14px;grid-template-columns:repeat(2,minmax(0,1fr))" }, [
      X.tile({ icon: "bars", title: "Backtesting", text: "Noch nicht freigegeben – deshalb keine Trefferquote." }),
      X.tile({ icon: "clock", title: "Historische Fälle", text: "Was in ähnlichen Situationen früher geschah", href: X.routes.method("historie") })]));

    var kpis = el("div", { class: "q-stats qx-kpis" }, [X.loading("Aktuelle Stände werden geladen …")]);
    page.append(X.world("Heute bei Quant", "Belegte Veränderungen aus den letzten veröffentlichten Ständen – mit Datum.", [kpis], null, "v2-market-today"));
    var rails = el("div", { class: "qx-rails" });
    page.append(rails);

    var recent = X.recent.list(), watched = X.watch.list();
    if (recent.length || watched.length) {
      var mine = ctx.commonFirst(watched.concat(recent.filter(function (t) { return watched.indexOf(t) < 0; }))).slice(0, 14);
      page.append(X.world("Deine Aktien", watched.length ? "Gemerkt und zuletzt analysiert." : "Zuletzt analysiert.", [X.rail(mine.map(function (t) {
        return X.poster({ ticker: t, name: nameOf(ctx, t), story: watched.indexOf(t) >= 0 ? "Gemerkt" : "Zuletzt analysiert", foot: "Analyse" });
      }), "Deine Aktien")], { href: X.routes.stocks(), label: "Alle ansehen" }));
    }
    page.append(X.world("Neuer Aufbau von Quant", "Von der Frage zur Entscheidung.", [el("div", { class: "q-rows" }, [
      ["search", "01 · Frage", "Welche Aktie, welches Setup oder welche Strategie ist interessant?", X.routes.stocks()],
      ["bars", "02 · Analyse", "Quant ordnet Daten, Faktoren und historische Fälle ein.", X.routes.method("faktoren")],
      ["bulb", "03 · Entscheidung", "Einstieg und Ausstieg, Chancen, Risiken und Trigger werden sichtbar.", X.routes.screener("frage=setups")],
      ["shield", "04 · Validierung", "Frühere vergleichbare Phasen machen Ergebnisse greifbar.", X.routes.method("historie")]
    ].map(function (r) { return el("a", { class: "q-rowlink", href: r[3] }, [el("span", { class: "q-icon", "aria-hidden": "true" }, [X.icon(r[0])]), el("span", {}, [el("strong", { text: r[1] }), el("small", { text: r[2] })])]); }))]));
    page.append(X.actions([X.btn("Warum kann ich dem vertrauen?", X.routes.method(), "secondary")]),
      el("p", { class: "qx-small", text: "Quant gibt keine Anlageempfehlungen und macht keine Prognosen. Einstieg, Stop-Loss und Ziele sind Szenarien der technischen Analyse." }));

    var r = await Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }),
      /* Kein Radar auf Home: er laedt das ganze Faehigkeitsverzeichnis
         (1,2 MB) plus Signale - fuer eine Karte. Home bleibt im Budget. */
      null, ctx.api.getMarketRegime().catch(function () { return null; }),
      ctx.api.getStrategyProfiles().catch(function () { return null; }), screeningRows(ctx)]);
    var setupIdx = r[0], stratIdx = r[1], regime = r[3], profiles = r[4], rowBy = r[5];
    var tiles = [], sections = [], today = [];
    var open = function (st) { return st && st.availability && st.availability.state === "AVAILABLE" && typeof st.count === "number"; };
    if (setupIdx && setupIdx.state === "AVAILABLE") {
      /* Nur offene Stufen tragen eine Zahl; eine geschlossene hat count null. */
      var conf = setupIdx.states.filter(function (st) { return st.state === "CONFIRMED" && open(st); })[0], form = setupIdx.states.filter(function (st) { return st.state === "SETUP_FORMING" && open(st); })[0];
      tiles.push(X.stat("Bestätigte Setups", (conf ? conf.count : 0).toLocaleString("de-DE"), (form ? "bei weiteren " + form.count.toLocaleString("de-DE") + " entsteht eines · " : "") + "Stand " + X.dateDe(setupIdx.asOf)));
      var confRows = conf ? [].concat.apply([], conf.rules.map(function (x) { return (x.tickers || []).map(function (t) { return { t: t, plain: x.plain }; }); })) : [];
      ctx.commonFirst(confRows.map(function (x) { return x.t; })).slice(0, 4).forEach(function (t) { today.push(quantPoster(ctx, t, rowBy, { story: "Setup bestätigt" })); });
    }
    if (stratIdx && stratIdx.state === "AVAILABLE" && stratIdx.historicalEvidence && stratIdx.historicalEvidence.transitions) {
      var labels = {}; ((profiles && profiles.contract && profiles.contract.profiles) || stratIdx.profiles || []).forEach(function (p) { labels[p.profileId] = p.label; });
      var he = stratIdx.historicalEvidence;
      var entered = he.transitions.filter(function (t) { return t.entered && t.entered.length; });
      var total = entered.reduce(function (n, t) { return n + t.entered.length; }, 0);
      tiles.push(X.stat("Neu in einer Strategie", total.toLocaleString("de-DE"), "zwischen den Ständen " + X.dateDe(he.from) + " und " + X.dateDe(he.to) + " – kein Ereignis von heute"));
      entered.slice().sort(function (a, b) { return b.entered.length - a.entered.length; }).forEach(function (t, i) {
        var label = (labels[t.profileId] || t.profileId).split(" · ")[0];
        var list = ctx.commonFirst(t.entered);
        if (i < 2) list.slice(0, 2).forEach(function (tk) { today.push(quantPoster(ctx, tk, rowBy, { story: "Neu in " + label })); });
        /* Eine Reihe je Strategie - das Datum steht EINMAL im Kopf. */
        if (i < 3) sections.push(X.world("Neu in „" + label + "“", t.entered.length + (t.entered.length === 1 ? " Aktie erfüllt" : " Aktien erfüllen") + " seit dem Stand vom " + X.dateDe(he.to) + " neu alle Bedingungen (vorher " + X.dateDe(he.from) + ")" +
          (t.exited && t.exited.length ? "; " + t.exited.length + (t.exited.length === 1 ? " ist" : " sind") + " herausgefallen" : "") + ".", [X.rail(list.slice(0, 14).map(function (tk) {
          return quantPoster(ctx, tk, rowBy, { story: "Erfüllt jetzt alle Bedingungen" });
        }), "Neu in " + label)], { href: X.routes.strategy(t.profileId), label: "Strategie ansehen" }));
      });
    }
    if (regime && regime.state === "AVAILABLE") {
      var above = (regime.measures || []).filter(function (m) { return m.id === "above200"; })[0];
      tiles.push(X.stat("Marktlage", REGIME[regime.regime] || "Marktlage", (above ? Math.round(above.share * 100) + " % über der 200-Tage-Linie · " : "") + "Stand " + X.dateDe(regime.asOf)));
    }
    cardsHost.replaceChildren(today.length ? X.rail(today, "Heute interessant") : X.notice("Gerade keine Veränderungen abrufbar", "Die aktuellen Stände konnten nicht geladen werden. Suche und Screener funktionieren weiterhin."));
    kpis.replaceChildren.apply(kpis, tiles.length ? tiles : [X.notice("Gerade keine Veränderungen abrufbar", "Die aktuellen Stände konnten nicht geladen werden. Suche und Screener funktionieren weiterhin.")]);
    rails.replaceChildren.apply(rails, sections);
  }

  /* ============================================================ SCREENER */
  var QUESTIONS = [
    { id: "qualitaet", chip: "Qualität", title: "Ich suche starke Qualitätsunternehmen", hint: "Profitabel und mit belastbarer Bilanz", factors: ["profitability", "quality"],
      sentence: "Du suchst Aktien, die profitabel sind und eine belastbare Bilanz haben." },
    { id: "momentum", chip: "Momentum", title: "Ich suche Aktien mit Momentum", hint: "Kurs läuft stark, auch gegenüber dem Markt", factors: ["momentum"],
      sentence: "Du suchst Aktien mit starker Kursentwicklung." },
    { id: "wachstum-qualitaet", chip: "Wachstum + Qualität", title: "Ich suche Wachstum + Qualität", hint: "Wächst kräftig und verdient gut", factors: ["growth", "profitability"],
      sentence: "Du suchst wachsende Unternehmen, die dabei gut verdienen." },
    { id: "guenstig", chip: "Günstig bewertet", title: "Ich suche günstig bewertete Aktien", hint: "Viel Gewinn und Substanz für den Preis", factors: ["value"],
      sentence: "Du suchst Aktien, die im Verhältnis zu Gewinn und Substanz günstig sind." },
    { id: "ruhig", chip: "Ruhige Aktien", title: "Ich suche ruhige Aktien", hint: "Geringe Schwankung, kleine Rückschläge", factors: ["risk"],
      sentence: "Du suchst Aktien mit ruhigem Kursverlauf." },
    { id: "setups", chip: "Setups", title: "Ich suche neue Setups", hint: "Bestätigt oder gerade im Aufbau", setups: true,
      sentence: "Du suchst Aktien, bei denen sich im Kursbild ein Setup zeigt." },
    { id: "hoch", chip: "Nahe 52-Wochen-Hoch", title: "Ich suche Aktien nahe am 52-Wochen-Hoch", hint: "Höchstens 3 % unter dem Jahreshoch", high: true,
      sentence: "Du suchst Aktien, die höchstens 3 % unter ihrem 52-Wochen-Hoch stehen." }
  ];
  /* Dieselbe Schwelle wie bisher im einfachen Screener (70): stark heisst
     hier "Wert 70 oder mehr" - fuer jede Frage gleich, nicht angepasst,
     damit eine Frage mehr Treffer liefert. */
  var SIMPLE_THRESHOLD = 70;

  function screeningWhy(row, factorIds) {
    return factorIds.map(function (id) {
      var v = row[FIELD(id)];
      return VM.FACTORS[id].name + ": " + (typeof v === "number" ? VM.factorLabel(id, v).toLowerCase() : "ohne Wert");
    }).join(" · ");
  }

  /* Die Filter-Chips der Screener-Tafel. Nur, was Quant misst, ist
     waehlbar; Erwartungstrend und Sentiment stehen da, sind aber ohne Datenbasis
     und deshalb gesperrt - mit dem Grund am Chip. */
  var FILTER_CHIPS = [
    { id: "momentum", label: "Momentum" }, { id: "quality", label: "Qualität" }, { id: "value", label: "Value" }, { id: "risk", label: "Low Volatility" },
    { id: "growth", label: "Wachstum" }, { id: "profitability", label: "Profitabilität" },
    { id: "revisions", label: "Erwartungstrend", off: "Für den Erwartungstrend gibt es keine lizenzierte, zeitpunktgenaue Datenquelle." },
    { id: "sentiment", label: "Sentiment", off: "Quant verwendet keine Sentiment-Daten." }
  ];
  function shortName(id) { var c = FILTER_CHIPS.filter(function (x) { return x.id === id; })[0]; return c ? c.label : (VM.FACTORS[id] ? VM.FACTORS[id].name : id); }

  async function screener(main, ctx, params, pro) {
    main.append(el("header", { class: "q-hero q-hero--screener" }, [
      X.globe(),
      el("p", { class: "q-kicker", text: "Vision Universe Quant" }),
      el("h1", { class: "qx-h1", text: pro ? "Quant Screener · Profi" : "Quant Screener" }),
      el("p", { class: "q-hero-lead v2-lead qx-lead", text: pro ? "Alle Kennzahlen und Faktoren, frei kombinierbar. Jede Regel ist sichtbar und teilbar." : "Finde datenbasierte Ideen. Prüfe, warum eine Aktie dabei ist. Nutze sie direkt für deine Analyse." }),
      el("p", { class: "q-note-box" }, [el("span", { text: "In Vision Universe Quant " }), el("b", { text: "integriert" }), el("span", { text: " – kein separates Produkt." })]),
      el("nav", { class: "qx-mode", "aria-label": "Screener-Modus" }, [
        el("a", { href: X.routes.screener(), "aria-current": pro ? null : "page", text: "Einfach" }),
        el("a", { href: X.routes.screenerPro(), "aria-current": pro ? "page" : null, text: "Profi" })])
    ]));
    if (pro) return screenerPro(main, ctx, params);

    /* Die Fragen der ersten Fassung sind die Schnellwahl-Chips; jede setzt
       Faktoren und Schwelle. Eigene Filter entstehen aus den Faktor-Chips
       und dem Wertebereich. */
    var chosen = QUESTIONS.filter(function (q) { return q.id === params.get("frage"); })[0] || (params.get("faktoren") ? null : QUESTIONS[0]);
    var sel = { factors: chosen && chosen.factors ? chosen.factors.slice() : (params.get("faktoren") || "momentum").split(",").filter(function (id) { return VM.FACTORS[id]; }),
      min: Number(params.get("min")) || SIMPLE_THRESHOLD, max: Number(params.get("max")) || 100 };
    if (!sel.factors.length) sel.factors = ["momentum"];
    var list = el("div", { class: "qx-questions", role: "group", "aria-label": "Schnellwahl" });
    QUESTIONS.forEach(function (q) {
      list.append(el("button", { type: "button", class: "qx-question", "aria-pressed": q === chosen ? "true" : "false", dataset: { question: q.id }, title: q.hint,
        onclick: function () { history.replaceState(null, "", X.routes.screener("frage=" + q.id)); chosen = q; if (q.factors) { sel.factors = q.factors.slice(); sel.min = SIMPLE_THRESHOLD; sel.max = 100; } sync(); run(); } },
        [el("strong", { text: q.chip }), el("span", { text: q.hint })]));
    });
    /* Faktor-Filter */
    var chipsHost = el("div", { class: "q-chips", role: "group", "aria-label": "Faktoren" });
    FILTER_CHIPS.forEach(function (c) {
      var b = el("button", { type: "button", class: "q-chip" + (c.off ? " is-off" : ""), dataset: { factor: c.id }, "aria-pressed": "false", disabled: c.off ? true : null, title: c.off || null, text: c.label });
      if (!c.off) b.addEventListener("click", function () {
        var i = sel.factors.indexOf(c.id);
        if (i >= 0 && sel.factors.length > 1) sel.factors.splice(i, 1); else if (i < 0) sel.factors.push(c.id);
        chosen = null; custom(); });
      chipsHost.append(b);
    });
    var minIn = el("input", { type: "range", min: "0", max: "100", step: "5", "aria-label": "Mindestwert" });
    var maxIn = el("input", { type: "range", min: "0", max: "100", step: "5", "aria-label": "Höchstwert" });
    var fill = el("span", { class: "q-range-fill" }), rangeText = el("b");
    function onRange(which) {
      var a = Number(minIn.value), b = Number(maxIn.value);
      if (a > b) { if (which === "min") maxIn.value = String(a); else minIn.value = String(b); }
      sel.min = Number(minIn.value); sel.max = Number(maxIn.value); chosen = null; drawRange();
    }
    minIn.addEventListener("input", function () { onRange("min"); }); maxIn.addEventListener("input", function () { onRange("max"); });
    minIn.addEventListener("change", custom); maxIn.addEventListener("change", custom);
    function drawRange() { fill.style.left = sel.min + "%"; fill.style.width = (sel.max - sel.min) + "%"; rangeText.textContent = "Min. " + sel.min + " – Max. " + sel.max; }
    var panel = el("section", { class: "q-filter", "aria-label": "Faktor-Filter" }, [
      el("h3", {}, [el("span", { text: "Faktor-Filter" }), el("a", { href: X.routes.method("faktoren"), text: "Alle Faktoren →" })]),
      chipsHost,
      el("div", { class: "q-range" }, [el("div", { class: "q-range-head" }, [el("span", { text: "Wertebereich (0–100) je gewählter Eigenschaft" }), rangeText]),
        el("div", { class: "q-range-track" }, [fill, minIn, maxIn]), el("div", { class: "q-range-ends" }, [el("span", { text: "0" }), el("span", { text: "100" })]),
        el("div", { class: "q-selects" }, [
          el("label", {}, [el("span", { text: "Region" }), el("select", { disabled: true, "aria-label": "Region" }, [el("option", { text: "USA" })])]),
          el("label", {}, [el("span", { text: "Universum" }), el("select", { disabled: true, "aria-label": "Universum" }, [el("option", { text: "US-Aktien" })])]),
          el("label", {}, [el("span", { text: "Stand" }), el("select", { disabled: true, "aria-label": "Stand" }, [el("option", { text: "letzter Lauf" })])])])]),
      el("div", { class: "q-filter-foot" }, [el("span", { class: "qx-small", style: "margin:0", text: "Quant prüft US-Aktien; Region und Universum sind deshalb fest." }),
        el("a", { class: "q-toggle", href: X.routes.screenerPro(), "aria-pressed": "false" }, [el("i", { "aria-hidden": "true" }), el("span", { text: "Pro Modus" })])])
    ]);
    function syncChips() { chipsHost.querySelectorAll("button[data-factor]").forEach(function (b) { b.setAttribute("aria-pressed", sel.factors.indexOf(b.dataset.factor) >= 0 ? "true" : "false"); }); minIn.value = String(sel.min); maxIn.value = String(sel.max); drawRange(); }
    function sync() { list.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", chosen && b.dataset.question === chosen.id ? "true" : "false"); }); syncChips(); }
    function custom() {
      history.replaceState(null, "", X.routes.screener("faktoren=" + sel.factors.join(",") + "&min=" + sel.min + "&max=" + sel.max));
      sync(); run();
    }
    var sentence = el("p", { class: "qx-sentence", "aria-live": "polite" });
    var out = el("div", { "aria-live": "polite" });
    var results = el("section", { class: "q-results", "aria-label": "Ergebnisse" }, [out]);
    main.append(el("p", { class: "q-kicker", style: "margin-top:20px", text: "Schnellwahl" }), list, panel, sentence, results);
    var run_id = 0;
    async function run() {
      var mine = ++run_id, q = chosen;
      sentence.textContent = q ? q.sentence : "Du suchst Aktien mit " + sel.factors.map(shortName).join(" und ") + " zwischen " + sel.min + " und " + sel.max + " von 100.";
      out.replaceChildren(X.loading("Wird gesucht …"));
      var result;
      try {
        if (q && q.setups) result = await setupHits(ctx);
        else if (q && q.high) result = await highHits(ctx);
        else result = await factorHits(ctx, sel.factors, sel.min, sel.max);
      } catch (e) { result = { error: true }; }
      if (mine !== run_id) return;
      if (result.error) { out.replaceChildren(X.notice("Treffer derzeit nicht verfügbar", "Die Auswertung konnte nicht geladen werden. Bitte versuche es erneut.")); return; }
      var total = result.total || result.rows.length;
      out.replaceChildren(el("div", { class: "q-results-head" }, [el("b", { text: total.toLocaleString("de-DE") + " Ergebnisse" }), el("span", { text: result.sortLabel || "Nach Wert" })]),
        el("p", { class: "qx-count", text: result.summary }),
        result.rows.length ? el("div", { class: "qx-list" }, result.rows.slice(0, 40)) : X.notice("Keine Treffer", "Heute erfüllt keine Aktie alle Bedingungen dieser Auswahl."),
        total > 40 ? el("p", { class: "qx-small", text: "Gezeigt werden die ersten 40 von " + total.toLocaleString("de-DE") + " Treffern. Im Profi-Modus lassen sich alle Treffer sortieren und weiter eingrenzen." }) : null,
        el("p", { class: "qx-small", text: result.method }),
        X.actions([X.btn("Im Profi-Modus verfeinern", X.routes.screenerPro(result.query ? "query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(result.query)) : ""), "secondary")]));
    }
    sync(); await run();
  }

  var strategyByTicker = null;
  function strategyLabels(ctx) {
    if (!strategyByTicker) strategyByTicker = Promise.all([ctx.api.getStrategyIndex().catch(function () { return null; }), ctx.api.getStrategyProfiles().catch(function () { return null; })]).then(function (r) {
      var labels = {}, by = {};
      ((r[1] && r[1].contract && r[1].contract.profiles) || []).forEach(function (p) { labels[p.profileId] = p.label.split(" · ")[0]; });
      ((r[0] && r[0].profiles) || []).forEach(function (p) { (p.tickers || []).forEach(function (t) { if (!by[t]) by[t] = labels[p.profileId] || p.profileId; }); });
      return by;
    }).catch(function () { return {}; });
    return strategyByTicker;
  }

  async function factorHits(ctx, factors, min, max) {
    var W = global.VUScreenerWorkspace;
    var filters = factors.map(function (id) { return { field: FIELD(id), operator: "gte", value: min, scale: "raw" }; });
    if (max < 100) factors.forEach(function (id) { filters.push({ field: FIELD(id), operator: "lte", value: max, scale: "raw" }); });
    var sortBy = [{ field: FIELD(factors[0]), direction: "desc" }];
    var query = W.build(filters, sortBy);
    /* Dieselbe Abfrage, nur mit dem groessten zulaessigen Limit: der
       Editor begrenzt auf 50, die Frage soll alle Treffer zaehlen. */
    var wide = global.VUQuery.createQuery({ filters: filters, sort: sortBy, limit: global.VUQuery.MAX_LIMIT || 500 });
    var r = await Promise.all([ctx.api.screen(wide), strategyLabels(ctx)]);
    var res = r[0], strat = r[1];
    if (!res || res.state !== "AVAILABLE") return { error: true };
    var rows = (res.stocks || []).map(function (s, i) {
      var v = VM.fromScreeningRow(s.evidence), val = s.evidence && s.evidence[FIELD(factors[0])];
      return X.stockRow({ ticker: s.ticker, name: X.companyName(s), kicker: strat[s.ticker] || null, why: screeningWhy(s.evidence, factors), withLogo: i < 8,
        score: { label: shortName(factors[0]), value: typeof val === "number" ? Math.round(val) : null, tone: typeof val === "number" ? VM.factorView({ id: factors[0], state: "AVAILABLE", score: val, components: [] }).tone : null },
        verdict: v && v.overall.id !== "KEINE_DATEN" ? { text: "Eigenschaften: " + v.overall.text.charAt(0).toLowerCase() + v.overall.text.slice(1), tone: v.overall.tone } : null });
    });
    /* Die Zahl der Treffer wird gezaehlt, nicht aus der begrenzten Liste
       abgelesen: dieselben veroeffentlichten Faktorwerte, dieselbe Regel. */
    var total = rows.length;
    if (rows.length >= (global.VUQuery.MAX_LIMIT || 500)) {
      var scr = await ctx.api.getFactorEvidenceScreening().catch(function () { return null; });
      if (scr && scr.state === "AVAILABLE") total = scr.rows.filter(function (row) { return factors.every(function (id) { var v = row[FIELD(id)]; return typeof v === "number" && v >= min && v <= max; }); }).length;
    }
    var names = factors.map(function (id) { return VM.FACTORS[id].name; }).join(" und ");
    return { rows: rows, total: total, query: query, sortLabel: "Nach " + shortName(factors[0]),
      summary: total.toLocaleString("de-DE") + " von " + (res.eligible || 0).toLocaleString("de-DE") + " bewerteten Aktien erfüllen das · Stand " + X.dateDe(res.asOf) + ".",
      method: (min === SIMPLE_THRESHOLD && max === 100 ? "„Stark“ heißt hier: Wert 70 oder mehr (von 100) in " + names + "." : "Gefiltert: Wert zwischen " + min + " und " + max + " (von 100) in " + names + ".") +
        " Sortiert nach " + VM.FACTORS[factors[0]].name + "; der Wert rechts ist dieser eine Faktor, keine Gesamtnote. Die Zeile nennt dazu die Gesamteinordnung aus allen gemessenen Eigenschaften – eine Aktie kann in der gesuchten Eigenschaft stark und insgesamt gemischt sein." };
  }
  async function setupHits(ctx) {
    var idx = await ctx.api.getSetupScreenIndex();
    if (!idx || idx.state !== "AVAILABLE") return { error: true };
    var rows = [], count = 0;
    ["CONFIRMED", "SETUP_FORMING"].forEach(function (state) {
      var st = idx.states.filter(function (s) { return s.state === state; })[0];
      if (!st) return;
      st.rules.forEach(function (rule) {
        (rule.tickers || []).forEach(function (t) {
          count++;
          if (rows.length < 400) rows.push(X.stockRow({ ticker: t, name: nameOf(ctx, t), why: rule.plain, pill: { text: VM.setupLabel(state), tone: state === "CONFIRMED" ? "good" : "neutral" } }));
        });
      });
    });
    return { rows: rows, summary: count.toLocaleString("de-DE") + " Aktien mit bestätigtem oder entstehendem Setup · Stand " + X.dateDe(idx.asOf) + ".",
      method: "Setups folgen der freigegebenen Zuordnung " + idx.mappingVersion + ". Ein Setup beschreibt das Kursbild am Stichtag – kein Kursziel und keine Einstiegsregel." };
  }
  async function highHits(ctx) {
    var u = await ctx.api.getUniverse();
    if (!u || u.state !== "AVAILABLE") return { error: true };
    var measured = u.stocks.filter(function (s) { return s.distanceTo52wHigh && typeof s.distanceTo52wHigh.value === "number"; });
    var hits = measured.filter(function (s) { return s.distanceTo52wHigh.value >= -0.03; })
      .sort(function (a, b) { return b.distanceTo52wHigh.value - a.distanceTo52wHigh.value || (b.momentum6m && b.momentum6m.value || 0) - (a.momentum6m && a.momentum6m.value || 0); });
    var rows = hits.map(function (s) {
      var d = s.distanceTo52wHigh.value;
      return X.stockRow({ ticker: s.ticker, name: X.companyName(s), why: d >= -0.0005 ? "Auf dem 52-Wochen-Hoch" : VM.pct(-d, 1) + " unter dem 52-Wochen-Hoch",
        side: s.price && typeof s.price.value === "number" ? X.money(s.price.value) : null, sideNote: s.price && s.price.asOf ? X.dateDe(s.price.asOf) : null });
    });
    return { rows: rows, summary: rows.length.toLocaleString("de-DE") + " von " + measured.length.toLocaleString("de-DE") + " Aktien mit Kurshistorie stehen höchstens 3 % unter ihrem 52-Wochen-Hoch.",
      method: "Abstand des letzten Schlusskurses zum höchsten Schlusskurs der letzten 52 Wochen, aus den veröffentlichten Tageskursen. Ein Jahreshoch beschreibt den bisherigen Verlauf – keine Prognose." };
  }

  /* -------------------------------------------------------- Profi-Modus */
  async function screenerPro(main, ctx, params) {
    var W = global.VUScreenerWorkspace, api = ctx.api;
    var initial, invalidLink = false;
    try { initial = params.get("query") ? W.decode(params.get("query")) : W.build([{ field: FIELD("momentum"), operator: "gte", value: 70, scale: "raw" }], [{ field: FIELD("momentum"), direction: "desc" }]); }
    catch (e) { invalidLink = true; main.append(X.notice("Gespeicherte Regeln konnten nicht geöffnet werden", "Die Abfrage enthält ungültige Kriterien. Es wurden keine Ersatzregeln ausgeführt – stelle unten eigene Regeln zusammen und tippe auf „Treffer anzeigen“.")); initial = W.build([{ field: FIELD("momentum"), operator: "gte", value: 70, scale: "raw" }], [{ field: FIELD("momentum"), direction: "desc" }]); }
    var current = W.methodologyOf(initial) || W.methodologies[0];
    var methodSelect = el("select", { class: "qx-select", "aria-label": "Datenbasis" }, W.methodologies.map(function (m) { return el("option", { value: m.id, text: m.label }); }));
    methodSelect.value = current.id;
    var note = el("span");
    var rulesHost = el("div", { class: "qx-rules" }), rows = [];
    var sort = el("select", { class: "qx-select", "aria-label": "Sortieren nach" }), dir = el("select", { class: "qx-select", "aria-label": "Reihenfolge" }, [el("option", { value: "desc", text: "Absteigend" }), el("option", { value: "asc", text: "Aufsteigend" })]);
    var out = el("section", { "aria-live": "polite" }), code = el("pre", { class: "qx-code" }), share = el("a", { class: "qx-btn secondary", href: "#", text: "Link zu dieser Auswahl" });
    function fields() { return current.fields; }
    function fillSort(v) { sort.replaceChildren.apply(sort, fields().filter(function (f) { return f.type === "number"; }).map(function (f) { return el("option", { value: f.id, text: f.label }); })); if (v) sort.value = v; }
    function describe() { note.textContent = current.label + " · " + current.methodologyVersion + ". " + current.note; }
    function addRule(filter) {
      if (rows.length >= W.maxFilters) return;
      filter = filter || { field: current.defaultField, operator: "gte", value: 0 };
      var field = el("select", { "aria-label": "Kennzahl" }, fields().map(function (f) { return el("option", { value: f.id, text: f.label }); }));
      var op = el("select", { "aria-label": "Vergleich" }), value = el("input", { type: "number", step: "any", "aria-label": "Vergleichswert" });
      var row = el("div", { class: "qx-rule" }), item = { row: row, field: field, op: op, get value() { return value; } };
      field.value = filter.field;
      function configure(raw, pref) {
        var def = fields().filter(function (f) { return f.id === field.value; })[0] || fields()[0];
        var next = def.type === "number" ? el("input", { type: "number", step: "any", value: String(raw === undefined || raw === null ? 0 : raw), "aria-label": "Vergleichswert" })
          : el("select", { "aria-label": "Vergleichswert" }, def.values.map(function (v) { return el("option", { value: v, text: v.replace(/_/g, " ") }); }));
        if (def.type !== "number") next.value = def.values.indexOf(raw) >= 0 ? raw : def.values[0];
        value.replaceWith(next); value = next;
        op.replaceChildren.apply(op, W.operators.filter(function (o) { return def.operatorIds.indexOf(o.id) >= 0; }).map(function (o) { return el("option", { value: o.id, text: o.label }); }));
        op.value = def.operatorIds.indexOf(pref) >= 0 ? pref : def.operatorIds[0];
      }
      field.onchange = function () { configure(undefined, op.value); };
      row.append(field, op, value, el("button", { type: "button", class: "qx-remove", text: "Entfernen", "aria-label": "Kriterium entfernen", onclick: function () { rows = rows.filter(function (r) { return r !== item; }); row.remove(); } }));
      rows.push(item); rulesHost.append(row);
      configure(filter.value, filter.operator);
    }
    methodSelect.onchange = function () { current = W.methodology(methodSelect.value); rows = []; rulesHost.replaceChildren(); fillSort(); describe(); addRule(); };
    fillSort(initial.sort && initial.sort[0] && initial.sort[0].field); if (initial.sort && initial.sort[0]) dir.value = initial.sort[0].direction; describe();
    initial.filters.forEach(addRule);
    var request = 0;
    async function apply() {
      var mine = ++request, filters;
      try {
        filters = rows.map(function (r) {
          var def = fields().filter(function (f) { return f.id === r.field.value; })[0], raw = r.value.value;
          if (!String(raw).trim()) throw Error("invalid");
          var v = def.type === "number" ? Number(raw) : raw; if (def.type === "number" && !isFinite(v)) throw Error("invalid");
          return { field: r.field.value, operator: r.op.value, value: v, scale: "raw" };
        });
      } catch (e) { out.replaceChildren(X.notice("Regel unvollständig", "Bitte gib für jede Regel einen gültigen Wert ein.")); return; }
      var query;
      try { query = W.build(filters, [{ field: sort.value, direction: dir.value }]); }
      catch (e) { out.replaceChildren(X.notice("Regeln nicht ausführbar", "Mindestens eine Regel liegt außerhalb dessen, was die Kennzahl zulässt. Es werden keine Treffer gezeigt, bis die Regeln gültig sind.")); return; }
      out.replaceChildren(X.loading("Wird gesucht …"));
      var res = await api.screen(query).catch(function () { return null; });
      if (mine !== request) return;
      code.textContent = JSON.stringify(query, null, 2);
      share.href = X.routes.screenerPro("query=" + encodeURIComponent(W.encode(query)));
      if (!res || res.state !== "AVAILABLE") { out.replaceChildren(X.notice("Ergebnisse derzeit nicht verfügbar", "Die Daten konnten nicht geladen werden. Deine Regeln bleiben erhalten.")); return; }
      var sel = fields().filter(function (f) { return f.id === sort.value; })[0];
      var v2 = current.id !== "legacy";
      out.replaceChildren(el("p", { class: "qx-count", text: res.stocks.length.toLocaleString("de-DE") + " Treffer in " + (res.eligible || 0).toLocaleString("de-DE") + " auswertbaren Aktien · " + current.label + (res.asOf ? " · Stand " + X.dateDe(res.asOf) : "") }),
        res.stocks.length ? el("div", { class: "qx-list" }, res.stocks.slice(0, 100).map(function (s) {
          var why, side = null;
          if (v2 && s.evidence) {
            var ids = filters.map(function (f) { return f.field.replace("quantV2.factorEvidence.", ""); }).filter(function (id) { return VM.FACTORS[id]; });
            why = screeningWhy(s.evidence, ids.length ? ids : ["momentum"]);
          } else {
            var m = sel && s[sel.productKey];
            why = sel ? sel.label + ": " + (m && typeof m.value === "number" ? m.value.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + (m.unit === "percent" ? " %" : m.unit === "ratio" ? "" : "") : "ohne Wert") : null;
            side = s.price && typeof s.price.value === "number" ? X.money(s.price.value) : null;
          }
          return X.stockRow({ ticker: s.ticker, name: X.companyName(s), why: why, side: side });
        })) : X.notice("Keine Treffer", "Keine Aktie erfüllt alle Regeln."),
        res.stocks.length > 100 ? el("p", { class: "qx-small", text: "Gezeigt werden die ersten 100 Treffer." }) : null);
    }
    share.className = "v2-pill v2-pill-ghost qx-btn secondary";
    main.append(el("section", { class: "qx-editor" }, [
      el("label", { text: "Datenbasis" }), methodSelect, el("p", { class: "qx-small", style: "max-width:70ch" }, [note]),
      el("label", { style: "margin-top:24px", text: "Regeln" }), rulesHost,
      X.actions([el("button", { type: "button", class: "v2-pill v2-pill-ghost qx-btn secondary", text: "+ Regel", onclick: function () { addRule(); } })]),
      el("label", { style: "margin-top:24px", text: "Sortieren" }),
      el("div", { class: "qx-rule", style: "grid-template-columns:minmax(0,2fr) minmax(0,1fr)" }, [sort, dir]),
      X.actions([el("button", { type: "button", class: "v2-pill v2-pill-dark qx-btn", text: "Treffer anzeigen", onclick: apply }), share])
    ]), el("div", { class: "qx-section", style: "margin-top:30px" }, [out]), X.more("Die Abfrage als Regeltext", function () { return code; }));
    if (!invalidLink) await apply();
  }

  /* ========================================================== STRATEGIEN */
  function conditionText(c) {
    var id = String(c.field || "").replace("quantV2.factorEvidence.", "");
    var name = VM.FACTORS[id] ? VM.FACTORS[id].name : c.label || id;
    return name + " " + (c.operator === "gte" ? "mindestens " : c.operator === "lte" ? "höchstens " : "") + c.value + " von 100";
  }
  async function strategies(main, ctx, id) {
    var r = await Promise.all([ctx.api.getStrategyProfiles().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; })]);
    var profiles = r[0], index = r[1];
    if (!profiles || profiles.state !== "AVAILABLE") {
      main.append(el("h1", { class: "qx-h1", text: "Strategien" }), X.notice("Strategien derzeit nicht verfügbar", "Die Strategieprofile konnten nicht geladen werden."));
      return;
    }
    var byId = {}; ((index && index.profiles) || []).forEach(function (p) { byId[p.profileId] = p; });
    var list = profiles.contract.profiles;
    if (id) return strategyDetail(main, ctx, list.filter(function (p) { return p.profileId === id; })[0], byId[id], index, profiles.contract);
    /* Wie Discovers Strategien-Seite: Bild, Name, ein Satz, Pfeil. */
    main.append(el("header", { class: "q-hero q-hero--page" }, [X.globe(), el("p", { class: "q-kicker", text: "Strategien" }),
      el("h1", { class: "qx-h1", text: "Welche Art von Unternehmen suchst du?" }),
      el("p", { class: "q-hero-lead v2-lead", text: "Jeder Anlagestil sucht eine bestimmte Art von Unternehmen. Quant prüft täglich, welche Aktien alle Bedingungen erfüllen – für jede Aktie mit denselben Regeln." })]));
    main.append(el("div", { class: "v2-collection-links qx-strats" }, list.map(function (p) {
      var ix = byId[p.profileId], art = STRATEGY_ART(p.profileId);
      var blocked = ix && ix.availability && ix.availability.state !== "AVAILABLE";
      var countText = blocked || !ix || typeof ix.count !== "number" ? "Derzeit nicht prüfbar: " + VM.reasonText(ix && ix.availability && ix.availability.reason, "Eine benötigte Eigenschaft hat für keine Aktie Werte.") : ix.count.toLocaleString("de-DE") + " Aktien erfüllen heute alle Bedingungen";
      return el("a", { class: "v2-collection-link qx-strat", href: X.routes.strategy(p.profileId), dataset: { profile: p.profileId } }, [
        el("span", { class: "v2-collection-art" + (art ? " has-image" : ""), "aria-hidden": "true" }, [art ? el("img", { class: "v2-collection-image", src: art, alt: "", width: "1254", height: "1254", loading: "lazy", decoding: "async" }) : el("span", { class: "v2-collection-glyph", text: "↗" }),
          el("span", { class: "v2-collection-art-label", text: p.label.split(" · ")[0] })]),
        el("span", { class: "v2-collection-copy" }, [el("strong", { text: p.label }), el("span", { text: p.plain }),
          el("small", { text: p.conditions.map(function (c) { return (VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id) + " ≥ " + c.value; }).join(" · ") + " — " + countText })]),
        el("span", { class: "v2-collection-arrow", text: "→" })]);
    })), el("p", { class: "qx-small", style: "margin-top:20px;max-width:70ch", text: "Es gibt bewusst keine Erfolgs- oder Trefferquote: Wie ein Stil in der Vergangenheit abgeschnitten hätte, ist ein Backtest – und der bleibt geschlossen, bis Universum, Kapitalmaßnahmen und Ausführung zertifiziert sind. Stand " + X.dateDe(index && index.asOf) + "." }),
      X.actions([X.btn("Wie Strategien geprüft werden", X.routes.method("strategien"), "secondary")]));
  }

  async function strategyDetail(main, ctx, p, ix, index, contract) {
    main.append(el("a", { class: "v2-back qx-back", href: X.routes.strategies(), text: "← Strategien" }));
    if (!p) { main.append(el("h1", { class: "qx-h1", text: "Strategie nicht gefunden" }), X.notice("Unbekannte Strategie", "Diese Strategie gibt es in der veröffentlichten Methodik nicht.")); return; }
    document.title = p.label + " – Quant-Strategie · Vision Universe®";
    var art = STRATEGY_ART(p.profileId);
    if (art) main.append(el("div", { class: "v2-collection-hero qx-strat-hero" }, [el("img", { src: art, alt: "", width: "1254", height: "1254", decoding: "async" })]));
    main.append(el("h1", { class: "qx-h1", text: p.label }), el("p", { class: "v2-lead", text: p.plain }));
    main.append(el("details", { class: "v2-rule qx-rules-box", open: true }, [el("summary", { text: "Welche Bedingungen gelten?" }),
      el("ul", { class: "qx-conds" }, p.conditions.map(function (c) {
        return el("li", { class: "tone-unknown" }, [el("i", { class: "dx-waage-marke", "aria-hidden": "true", text: "•" }), el("div", {}, [el("b", { text: conditionText(c) }), el("span", { text: c.rationale })])]);
      })),
      el("p", { class: "qx-small", text: "Die Schwellen sind für jede Aktie gleich und nicht an vergangenen Ergebnissen optimiert. Typisches Risiko dieses Stils: " + (p.mainRisk || "–") }),
      el("p", { class: "qx-small", text: "Ob eine Aktie passt, wird täglich neu geprüft: gezählt wird, welche Bedingungen sie heute erfüllt. Eine Aktie kann morgen herausfallen, ohne dass sich an ihrem Geschäft etwas geändert hat." })]));
    var members = (ix && ix.tickers) || [];
    var membersHost = el("div");
    var countable = ix && typeof ix.count === "number" && (!ix.availability || ix.availability.state === "AVAILABLE");
    main.append(X.world("Wer passt heute?", countable ? ix.count.toLocaleString("de-DE") + " Aktien erfüllen am " + X.dateDe(index.asOf) + " alle Bedingungen." : "Diese Strategie ist derzeit nicht prüfbar: " + VM.reasonText(ix && ix.availability && ix.availability.reason, "eine benötigte Eigenschaft hat für keine Aktie Werte."), [membersHost]));
    var tr = index && index.historicalEvidence && (index.historicalEvidence.transitions || []).filter(function (t) { return t.profileId === p.profileId; })[0];
    var screening = await ctx.api.getFactorEvidenceScreening().catch(function () { return null; });
    var rowBy = {}; ((screening && screening.rows) || []).forEach(function (r) { rowBy[r.ticker] = r; });
    var ids = p.conditions.map(function (c) { return c.id; });
    membersHost.append(!countable ? X.notice("Keine Zuordnung", "Solange eine benötigte Eigenschaft keine Werte hat, wird keine Aktie diesem Stil zugeordnet – auch nicht näherungsweise.") : members.length ? el("div", { class: "qx-list" }, members.slice(0, 30).map(function (t) {
      var row = rowBy[t];
      return X.stockRow({ ticker: t, name: nameOf(ctx, t), why: row ? screeningWhy(row, ids) : null });
    })) : X.notice("Heute kein Treffer", "Keine Aktie erfüllt derzeit alle Bedingungen."),
      members.length > 30 ? el("div", { style: "margin-top:16px" }, [el("p", { class: "qx-small", text: "Weitere Treffer:" }), X.tickerChips(members.slice(30), 80)]) : null);
    if (tr) {
      main.append(X.world("Was hat sich verändert?", "Seit dem Stand vom " + X.dateDe(index.historicalEvidence.from) + " (jetzt " + X.dateDe(index.historicalEvidence.to) + ").", [
        el("div", { class: "dv2-valuation-grid qx-stats" }, [X.stat("Neu dabei", String((tr.entered || []).length)), X.stat("Herausgefallen", String((tr.exited || []).length))]),
        (tr.entered || []).length ? X.rail(ctx.commonFirst(tr.entered).slice(0, 14).map(function (t) { return quantPoster(ctx, t, rowBy, { story: "Neu dabei", foot: "Neu seit " + X.dateDe(index.historicalEvidence.to) }); }), "Neu dabei") : null,
        (tr.exited || []).length ? el("div", {}, [el("p", { class: "qx-small", text: "Herausgefallen:" }), X.tickerChips(tr.exited, 30)]) : null]));
    }
    /* Was einen Match verhindert: unter den Aktien, die GENAU EINE
       Bedingung verfehlen, wird gezaehlt, welche es ist. Aus denselben
       veroeffentlichten Faktorwerten, keine neue Rechnung. */
    if (screening && screening.state === "AVAILABLE") {
      var misses = {}, near = [];
      screening.rows.forEach(function (r) {
        var failed = [], unknown = 0;
        p.conditions.forEach(function (c) {
          var v = r[c.field];
          if (typeof v !== "number") unknown++;
          else if (c.operator === "gte" ? v < c.value : v > c.value) failed.push(c.id);
        });
        if (!unknown && failed.length === 1) { misses[failed[0]] = (misses[failed[0]] || 0) + 1; near.push({ t: r.ticker, c: failed[0], v: r[FIELD(failed[0])] }); }
      });
      var total = near.length;
      if (total) main.append(X.world("Was verhindert einen Match?", total.toLocaleString("de-DE") + " Aktien verfehlen genau eine Bedingung. So verteilt es sich:", [
        el("div", { class: "dx-bewertung-bild qx-bars2" }, p.conditions.map(function (c) {
          var n = misses[c.id] || 0;
          return el("div", { class: "dx-bewertung-zeile" }, [el("span", { class: "dx-bewertung-name", text: VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id }),
            el("span", { class: "dx-bewertung-balken", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.max(1, n / total * 100).toFixed(1) + "%" })]), el("b", { class: "num", text: String(n) })]);
        })),
        el("p", { class: "qx-small", text: "Knapp daneben (nur eine Bedingung verfehlt):" }),
        X.tickerChips(near.sort(function (a, b) { return (b.v || 0) - (a.v || 0); }).map(function (x) { return x.t; }), 16)
      ]));
    }
    main.append(X.actions([X.btn("Methodik der Strategien", X.routes.method("strategien"), "secondary"),
      X.btn("Im Quant Screener öffnen", X.routes.screenerPro("query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(global.VUScreenerWorkspace.build(p.conditions.map(function (c) { return { field: c.field, operator: c.operator, value: c.value, scale: "raw" }; }), [{ field: p.conditions[0].field, direction: "desc" }])))), "secondary")]),
      el("p", { class: "qx-small", text: "Keine Erfolgs- oder Trefferquote: Ein Strategy Match zählt erfüllte Bedingungen. Methodik " + contract.methodologyVersion + "." }));
  }

  /* ============================================================== AKTIEN */
  var KNOWN = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "KO", "PG", "JNJ", "XOM", "T", "SO", "O"];
  async function stocks(main, ctx) {
    var input = el("input", { type: "search", class: "qx-stock-search",
      placeholder: "Name oder Kürzel, z. B. Apple oder NVDA", "aria-label": "Aktie suchen", autocomplete: "off" });
    var results = el("div", { "aria-live": "polite", style: "margin-top:12px" });
    main.append(el("header", { class: "q-hero q-hero--page" }, [X.globe(), el("p", { class: "q-kicker", text: "Aktien" }),
      el("h1", { class: "qx-h1", text: "Welche Aktie möchtest du verstehen?" }),
      el("label", { class: "q-searchbar qx-search-field" }, [X.icon("search"), input, el("i", { "aria-hidden": "true", text: "→" })])]), results);
    var req = 0;
    input.addEventListener("input", async function () {
      var mine = ++req, q = input.value.trim();
      if (!q) { results.replaceChildren(); return; }
      results.replaceChildren(el("p", { class: "qx-small", text: "Wird gesucht …" }));
      var r = await ctx.api.searchInstruments(q, 12).catch(function () { return { state: "SOURCE_MISSING", entries: [] }; });
      if (mine !== req) return;
      if (r.state !== "AVAILABLE") { results.replaceChildren(X.notice("Suche derzeit nicht verfügbar", "Das Verzeichnis konnte nicht geladen werden.")); return; }
      results.replaceChildren(r.entries.length ? el("div", { class: "qx-list" }, r.entries.map(function (e) { return X.stockRow({ ticker: e.ticker, name: X.companyName(e) === "Firmenname nicht veröffentlicht" ? "" : e.name }); }))
        : el("p", { class: "qx-small", text: "Keine passenden Aktien gefunden." }));
    });
    var recent = X.recent.list(), watched = X.watch.list();
    if (watched.length) main.append(X.world("Gemerkt", watched.length + (watched.length === 1 ? " Aktie" : " Aktien") + " auf deiner Merkliste.", [X.rail(watched.slice(0, 24).map(function (t) { return X.poster({ ticker: t, name: nameOf(ctx, t), story: "Gemerkt" }); }), "Gemerkt"),
      watched.length > 1 ? X.actions([X.btn("Gemerkte vergleichen", X.routes.compare(watched.slice(0, 4)), "secondary")]) : null]));
    main.append(X.world("Zuletzt analysiert", recent.length ? null : "Aktien, die du analysierst oder merkst, erscheinen hier. Tippe auf einer Aktienseite auf „Merken“.",
      recent.length ? [X.rail(recent.slice(0, 12).map(function (t) { return X.poster({ ticker: t, name: nameOf(ctx, t), story: "Zuletzt analysiert" }); }), "Zuletzt analysiert")] : []));
    var interesting = el("div", {}, [X.loading()]);
    main.append(interesting);
    main.append(X.world("Bekannte Aktien", "Ein schneller Einstieg.", [X.rail(KNOWN.map(function (t) { return X.poster({ ticker: t, name: nameOf(ctx, t), story: "Analyse öffnen" }); }), "Bekannte Aktien")]));
    var r = await Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }), screeningRows(ctx)]);
    var parts = [], rowBy = r[2];
    /* Neu in einer Strategie: EINE Reihe je Strategie, das Datum einmal im
       Kopf - statt derselben Klammer an jeder Zeile. */
    if (r[1] && r[1].historicalEvidence && r[1].historicalEvidence.transitions) {
      var he = r[1].historicalEvidence;
      he.transitions.filter(function (t) { return t.entered && t.entered.length; }).forEach(function (t) {
        var label = ((r[1].profiles || []).filter(function (p) { return p.profileId === t.profileId; })[0] || {}).label || t.profileId;
        parts.push(X.world("Neu in „" + label.split(" · ")[0] + "“", "Zwischen den veröffentlichten Ständen vom " + X.dateDe(he.from) + " und " + X.dateDe(he.to) + " – kein Ereignis von heute.",
          [X.rail(ctx.commonFirst(t.entered).slice(0, 12).map(function (tk) { return quantPoster(ctx, tk, rowBy, { story: "Erfüllt jetzt alle Bedingungen", foot: "Neu seit " + X.dateDe(he.to) }); }), "Neu in " + label)],
          { href: X.routes.strategy(t.profileId), label: "Strategie ansehen →" }));
      });
    }
    if (r[0] && r[0].state === "AVAILABLE") {
      var conf = r[0].states.filter(function (st) { return st.state === "CONFIRMED"; })[0];
      var rows = conf ? [].concat.apply([], conf.rules.map(function (x) { return (x.tickers || []).map(function (t) { return { t: t, plain: x.plain }; }); })) : [];
      if (rows.length) parts.unshift(X.world("Setup bestätigt", "Alle Bedingungen eines Setups erfüllt · Stand " + X.dateDe(r[0].asOf) + ".",
        [X.rail(ctx.commonFirst(rows.map(function (x) { return x.t; })).slice(0, 12).map(function (t) { return quantPoster(ctx, t, rowBy, { story: "Setup bestätigt", foot: "Setup bestätigt" }); }), "Setup bestätigt")], { href: X.routes.screener("frage=setups"), label: "Alle Setups →" }));
    }
    interesting.replaceChildren.apply(interesting, parts.length ? parts : [X.notice("Gerade nichts abrufbar", "Die aktuellen Stände konnten nicht geladen werden.")]);
  }

  global.QXPages = { home: home, screener: screener, strategies: strategies, stocks: stocks, QUESTIONS: QUESTIONS, SIMPLE_THRESHOLD: SIMPLE_THRESHOLD };
})(window);
