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

  function doors(items) {
    return el("div", { class: "qx-grid qx-grid-4" }, items.map(function (d) {
      return el("a", { class: "qx-door", href: d.href, onclick: d.onclick || null }, [
        el("span", { class: "qx-door-icon" }, [X.icon(d.icon)]), el("strong", { text: d.title }), el("span", { text: d.text }), el("em", { text: d.cta + " →" })]);
    }));
  }
  function nameOf(ctx, t) { var s = ctx.names && ctx.names[t]; return s || ""; }

  /* ================================================================ HOME */
  async function home(main, ctx) {
    main.append(el("section", { class: "qx-hero" }, [
      el("span", { class: "qx-eyebrow", text: "Vision Universe® Quant" }),
      el("h1", { class: "qx-h1", text: "Aktien verstehen – mit nachvollziehbaren Gründen." }),
      el("p", { class: "qx-lead", text: "Quant prüft über 6.000 US-Aktien nach festen Daten und Regeln. Du siehst, was für eine Aktie spricht, was dagegen, was sich gerade verändert – und wo die Daten enden." }),
      el("button", { type: "button", class: "qx-searchbox", onclick: ctx.openSearch, "aria-label": "Aktie suchen und analysieren" }, [X.icon("search"), el("span", { text: "Aktie analysieren – Name oder Kürzel" }), el("b", { text: "Suchen" })]),
      el("p", { class: "qx-small", style: "margin-top:12px", text: "Keine Blackbox: Jede Einschätzung hat einen Grund, jeder Grund führt bis zu den Rohdaten." })
    ]));
    main.append(X.section("Was möchtest du herausfinden?", null, [doors([
      { icon: "aktien", title: "Aktie analysieren", text: "Wie gut ist eine konkrete Aktie – und warum?", cta: "Aktie suchen", href: X.routes.stocks() },
      { icon: "screener", title: "Aktien finden", text: "Starte mit einer Frage – etwa nach Kursstärke oder solider Bilanz.", cta: "Quant Screener", href: X.routes.screener() },
      { icon: "strategien", title: "Strategien entdecken", text: "Welche Art von Unternehmen sucht ein Anlagestil – und wer passt heute?", cta: "Strategien", href: X.routes.strategies() },
      { icon: "setups", title: "Aktuelle Setups", text: "Wo baut sich im Kursbild gerade etwas auf?", cta: "Setups ansehen", href: X.routes.screener("frage=setups") }
    ])]));

    var today = el("div", { class: "qx-grid qx-grid-2" }, [X.loading("Aktuelle Veränderungen werden geladen …")]);
    main.append(X.section("Heute interessant", "Belegte Veränderungen aus den letzten veröffentlichten Ständen – mit Datum.", [today]));
    var mine = el("div");
    main.append(mine);
    var recent = X.recent.list(), watched = X.watch.list();
    if (recent.length || watched.length) {
      mine.append(X.section("Deine Aktien", null, [el("div", { class: "qx-grid qx-grid-2" }, [
        watched.length ? X.card([el("h3", { class: "qx-h3", text: "Gemerkt" }), X.tickerChips(watched, 16)]) : null,
        recent.length ? X.card([el("h3", { class: "qx-h3", text: "Zuletzt analysiert" }), X.tickerChips(recent, 12)]) : null
      ])]));
    }
    main.append(X.section("So kommt Quant zu seiner Einschätzung", null, [el("div", { class: "qx-grid qx-grid-3" }, [
      X.card([el("span", { class: "qx-eyebrow", text: "1 · Daten" }), el("h3", { class: "qx-h3", text: "Belegte Quellen" }), el("p", { class: "qx-small", text: "Geschäftszahlen aus SEC-Meldungen, Kurse von Tiingo – jeweils mit Stichtag. Fehlt etwas, wird nichts ersetzt." })]),
      X.card([el("span", { class: "qx-eyebrow", text: "2 · Regeln" }), el("h3", { class: "qx-h3", text: "Für jede Aktie gleich" }), el("p", { class: "qx-small", text: "Sieben Eigenschaften, Setups und Strategien folgen versionierten Regeln – dieselben für jeden Titel, nicht an Ergebnissen optimiert." })]),
      X.card([el("span", { class: "qx-eyebrow", text: "3 · Gründe" }), el("h3", { class: "qx-h3", text: "Nachvollziehbar bis zu den Rohdaten" }), el("p", { class: "qx-small", text: "Jede Aussage lässt sich aufklappen: Bedeutung, Erklärung, Belege, Daten, Methodik." })])
    ]), el("div", { class: "qx-actions" }, [X.btn("Warum kann ich dem vertrauen?", X.routes.method(), "secondary")]),
      el("p", { class: "qx-small", text: "Quant gibt keine Anlageempfehlungen, macht keine Prognosen und nennt keine Kursziele." })]));

    var r = await Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }),
      ctx.api.getRadarIntelligence({ lookback: 5, limit: 12 }).catch(function () { return null; }), ctx.api.getMarketRegime().catch(function () { return null; }),
      ctx.api.getStrategyProfiles().catch(function () { return null; })]);
    var setupIdx = r[0], stratIdx = r[1], radar = r[2], regime = r[3], profiles = r[4];
    var cards = [];
    if (setupIdx && setupIdx.state === "AVAILABLE") {
      var conf = setupIdx.states.filter(function (s) { return s.state === "CONFIRMED"; })[0], form = setupIdx.states.filter(function (s) { return s.state === "SETUP_FORMING"; })[0];
      var confT = conf ? [].concat.apply([], conf.rules.map(function (x) { return x.tickers || []; })) : [];
      cards.push(X.card([el("span", { class: "qx-eyebrow", text: "Setups · Stand " + X.dateDe(setupIdx.asOf) }),
        el("h3", { class: "qx-h3", text: (conf ? conf.count : 0).toLocaleString("de-DE") + " bestätigte Setups" }),
        el("p", { class: "qx-small", text: "Bei diesen Aktien sind alle Bedingungen eines Setups erfüllt" + (form ? "; bei weiteren " + form.count.toLocaleString("de-DE") + " entsteht eines gerade." : ".") }),
        X.tickerChips(ctx.commonFirst(confT), 10), el("div", { class: "qx-actions" }, [X.btn("Alle Setups", X.routes.screener("frage=setups"), "secondary")])]));
    }
    if (stratIdx && stratIdx.state === "AVAILABLE" && stratIdx.historicalEvidence && stratIdx.historicalEvidence.transitions) {
      var labels = {}; ((profiles && profiles.contract && profiles.contract.profiles) || stratIdx.profiles || []).forEach(function (p) { labels[p.profileId] = p.label; });
      var he = stratIdx.historicalEvidence;
      var entered = he.transitions.filter(function (t) { return t.entered && t.entered.length; });
      if (entered.length) cards.push(X.card([el("span", { class: "qx-eyebrow", text: "Strategien · " + X.dateDe(he.from) + " → " + X.dateDe(he.to) }),
        el("h3", { class: "qx-h3", text: "Neu in einer Strategie" }),
        el("p", { class: "qx-small", text: "Aktien, die seit dem letzten Stand alle Bedingungen eines Anlagestils erfüllen." })].concat(entered.slice(0, 3).map(function (t) {
          return el("div", { style: "margin-top:10px" }, [el("a", { href: X.routes.strategy(t.profileId), style: "font-weight:700;text-decoration:none", text: labels[t.profileId] || t.profileId }),
            el("span", { class: "qx-small", text: " · " + t.entered.length + " neu" + (t.exited && t.exited.length ? ", " + t.exited.length + " herausgefallen" : "") }), X.tickerChips(ctx.commonFirst(t.entered), 8)]);
        }))));
    }
    if (radar && radar.state === "AVAILABLE") {
      var up = radar.modules.filter(function (m) { return m.id === "trend-entered"; })[0], down = radar.modules.filter(function (m) { return m.id === "trend-exited"; })[0];
      if (up && up.items.length) cards.push(X.card([el("span", { class: "qx-eyebrow", text: "Trendwechsel · " + X.dateDe(up.items[0].asOf) }),
        el("h3", { class: "qx-h3", text: "Über die 200-Tage-Linie gestiegen" }),
        el("p", { class: "qx-small", text: up.description + (down && down.items.length ? " Umgekehrt sind " + down.items.length + (down.items.length >= 12 ? "+" : "") + " Aktien darunter gefallen." : "") }),
        X.tickerChips(ctx.commonFirst(up.items.map(function (i) { return i.ticker; })), 10)]));
    }
    if (regime && regime.state === "AVAILABLE") {
      var above = (regime.measures || []).filter(function (m) { return m.id === "above200"; })[0];
      cards.push(X.card([el("span", { class: "qx-eyebrow", text: "Marktlage · Stand " + X.dateDe(regime.asOf) }),
        el("h3", { class: "qx-h3", text: { BROAD_WEAKNESS: "Breite Schwäche", BROAD_STRENGTH: "Breite Stärke", NARROW_LEADERSHIP: "Schmale Führung", MIXED: "Gemischte Lage" }[regime.regime] || "Marktlage" }),
        el("p", { class: "qx-small", text: regime.matchedRule && regime.matchedRule.plain }),
        above ? el("p", { class: "qx-small", text: Math.round(above.share * 100) + " % von " + above.observed.toLocaleString("de-DE") + " Aktien stehen über ihrer 200-Tage-Linie." }) : null]));
    }
    today.replaceChildren.apply(today, cards.length ? cards : [X.notice("Gerade keine Veränderungen abrufbar", "Die aktuellen Stände konnten nicht geladen werden. Suche und Screener funktionieren weiterhin.")]);
  }

  /* ============================================================ SCREENER */
  var QUESTIONS = [
    { id: "qualitaet", title: "Ich suche starke Qualitätsunternehmen", hint: "Profitabel und mit belastbarer Bilanz", factors: ["profitability", "quality"],
      sentence: "Du suchst Aktien, die profitabel sind und eine belastbare Bilanz haben." },
    { id: "momentum", title: "Ich suche Aktien mit Momentum", hint: "Kurs läuft stark, auch gegenüber dem Markt", factors: ["momentum"],
      sentence: "Du suchst Aktien mit starker Kursentwicklung." },
    { id: "wachstum-qualitaet", title: "Ich suche Wachstum + Qualität", hint: "Wächst kräftig und verdient gut", factors: ["growth", "profitability"],
      sentence: "Du suchst wachsende Unternehmen, die dabei gut verdienen." },
    { id: "guenstig", title: "Ich suche günstig bewertete Aktien", hint: "Viel Gewinn und Substanz für den Preis", factors: ["value"],
      sentence: "Du suchst Aktien, die im Verhältnis zu Gewinn und Substanz günstig sind." },
    { id: "ruhig", title: "Ich suche ruhige Aktien", hint: "Geringe Schwankung, kleine Rückschläge", factors: ["risk"],
      sentence: "Du suchst Aktien mit ruhigem Kursverlauf." },
    { id: "setups", title: "Ich suche neue Setups", hint: "Bestätigt oder gerade im Aufbau", setups: true,
      sentence: "Du suchst Aktien, bei denen sich im Kursbild ein Setup zeigt." },
    { id: "hoch", title: "Ich suche Aktien nahe am 52-Wochen-Hoch", hint: "Höchstens 3 % unter dem Jahreshoch", high: true,
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

  async function screener(main, ctx, params, pro) {
    main.append(el("span", { class: "qx-eyebrow", text: "Quant Screener" }),
      el("h1", { class: "qx-h1", text: pro ? "Eigene Regeln, volle Kontrolle." : "Welche Aktien suchst du?" }),
      el("p", { class: "qx-lead", text: pro ? "Alle Kennzahlen und Faktoren des Quant Screeners, frei kombinierbar. Jede Regel ist sichtbar und teilbar." : "Wähle eine Frage. Quant zeigt die passenden Aktien – und bei jeder, warum sie dabei ist." }),
      el("nav", { class: "qx-mode", "aria-label": "Screener-Modus" }, [
        el("a", { href: X.routes.screener(), "aria-current": pro ? null : "page", text: "Einfach" }),
        el("a", { href: X.routes.screenerPro(), "aria-current": pro ? "page" : null, text: "Profi" })]));
    if (pro) return screenerPro(main, ctx, params);
    var chosen = QUESTIONS.filter(function (q) { return q.id === params.get("frage"); })[0] || QUESTIONS[0];
    var list = el("div", { class: "qx-questions", role: "group", "aria-label": "Fragen" });
    var sentence = el("p", { class: "qx-sentence", "aria-live": "polite" });
    var out = el("div", { "aria-live": "polite" });
    QUESTIONS.forEach(function (q) {
      list.append(el("button", { type: "button", class: "qx-question", "aria-pressed": q === chosen ? "true" : "false", dataset: { question: q.id },
        onclick: function () { history.replaceState(null, "", X.routes.screener("frage=" + q.id)); chosen = q; sync(); run(); } },
        [el("strong", { text: q.title }), el("span", { text: q.hint })]));
    });
    function sync() { list.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.question === chosen.id ? "true" : "false"); }); }
    main.append(list, sentence, out);
    var run_id = 0;
    async function run() {
      var mine = ++run_id, q = chosen;
      sentence.textContent = q.sentence;
      out.replaceChildren(X.loading("Wird gesucht …"));
      var result;
      try {
        if (q.setups) result = await setupHits(ctx);
        else if (q.high) result = await highHits(ctx);
        else result = await factorHits(ctx, q);
      } catch (e) { result = { error: true }; }
      if (mine !== run_id) return;
      if (result.error) { out.replaceChildren(X.notice("Treffer derzeit nicht verfügbar", "Die Auswertung konnte nicht geladen werden. Bitte versuche es erneut.")); return; }
      out.replaceChildren(el("p", { class: "qx-small", text: result.summary }),
        result.rows.length ? el("div", { class: "qx-list" }, result.rows.slice(0, 40)) : X.notice("Keine Treffer", "Heute erfüllt keine Aktie alle Bedingungen dieser Frage."),
        (result.total || result.rows.length) > 40 ? el("p", { class: "qx-small", text: "Gezeigt werden die ersten 40 von " + (result.total || result.rows.length).toLocaleString("de-DE") + " Treffern. Im Profi-Modus lassen sich alle Treffer sortieren und weiter eingrenzen." }) : null,
        el("p", { class: "qx-small", text: result.method }),
        el("div", { class: "qx-actions" }, [X.btn("Im Profi-Modus verfeinern", X.routes.screenerPro(result.query ? "query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(result.query)) : ""), "secondary")]));
    }
    sync(); run();
  }

  async function factorHits(ctx, q) {
    var W = global.VUScreenerWorkspace;
    var filters = q.factors.map(function (id) { return { field: FIELD(id), operator: "gte", value: SIMPLE_THRESHOLD, scale: "raw" }; });
    var sortBy = [{ field: FIELD(q.factors[0]), direction: "desc" }];
    var query = W.build(filters, sortBy);
    /* Dieselbe Abfrage, nur mit dem groessten zulaessigen Limit: der
       Editor begrenzt auf 50, die Frage soll alle Treffer zaehlen. */
    var wide = global.VUQuery.createQuery({ filters: filters, sort: sortBy, limit: global.VUQuery.MAX_LIMIT || 500 });
    var res = await ctx.api.screen(wide);
    if (!res || res.state !== "AVAILABLE") return { error: true };
    var rows = (res.stocks || []).map(function (s) {
      var v = VM.fromScreeningRow(s.evidence);
      return X.stockRow({ ticker: s.ticker, name: X.companyName(s), why: screeningWhy(s.evidence, q.factors),
        pill: v && v.overall.id !== "KEINE_DATEN" ? { text: "Gesamt: " + v.overall.text.charAt(0).toLowerCase() + v.overall.text.slice(1), tone: v.overall.tone } : null });
    });
    /* Die Zahl der Treffer wird gezaehlt, nicht aus der begrenzten Liste
       abgelesen: dieselben veroeffentlichten Faktorwerte, dieselbe Regel. */
    var total = rows.length;
    if (rows.length >= (global.VUQuery.MAX_LIMIT || 500)) {
      var scr = await ctx.api.getFactorEvidenceScreening().catch(function () { return null; });
      if (scr && scr.state === "AVAILABLE") total = scr.rows.filter(function (r) { return q.factors.every(function (id) { var v = r[FIELD(id)]; return typeof v === "number" && v >= SIMPLE_THRESHOLD; }); }).length;
    }
    return { rows: rows, total: total, query: query,
      summary: total.toLocaleString("de-DE") + " von " + (res.eligible || 0).toLocaleString("de-DE") + " bewerteten Aktien erfüllen das · Stand " + X.dateDe(res.asOf) + ".",
      method: "„Stark“ heißt hier: Wert 70 oder mehr (von 100) in " + q.factors.map(function (id) { return VM.FACTORS[id].name; }).join(" und ") + ". Sortiert nach " + VM.FACTORS[q.factors[0]].name + ". Rechts steht die Gesamteinordnung aus allen gemessenen Eigenschaften – eine Aktie kann in der gesuchten Eigenschaft stark und insgesamt gemischt sein." };
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
    var initial;
    try { initial = params.get("query") ? W.decode(params.get("query")) : W.build([{ field: FIELD("momentum"), operator: "gte", value: 70, scale: "raw" }], [{ field: FIELD("momentum"), direction: "desc" }]); }
    catch (e) { main.append(X.notice("Gespeicherte Regeln konnten nicht geöffnet werden", "Die Abfrage enthält ungültige Kriterien. Es wurden keine Ersatzregeln ausgeführt.")); initial = W.build([{ field: FIELD("momentum"), operator: "gte", value: 70, scale: "raw" }], [{ field: FIELD("momentum"), direction: "desc" }]); }
    var current = W.methodologyOf(initial) || W.methodologies[0];
    var methodSelect = el("select", { class: "qx-select", "aria-label": "Datenbasis" }, W.methodologies.map(function (m) { return el("option", { value: m.id, text: m.label }); }));
    methodSelect.value = current.id;
    var note = el("p", { class: "qx-small" });
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
      var query = W.build(filters, [{ field: sort.value, direction: dir.value }]);
      out.replaceChildren(X.loading("Wird gesucht …"));
      var res = await api.screen(query).catch(function () { return null; });
      if (mine !== request) return;
      code.textContent = JSON.stringify(query, null, 2);
      share.href = X.routes.screenerPro("query=" + encodeURIComponent(W.encode(query)));
      if (!res || res.state !== "AVAILABLE") { out.replaceChildren(X.notice("Ergebnisse derzeit nicht verfügbar", "Die Daten konnten nicht geladen werden. Deine Regeln bleiben erhalten.")); return; }
      var sel = fields().filter(function (f) { return f.id === sort.value; })[0];
      var v2 = current.id !== "legacy";
      out.replaceChildren(el("p", { class: "qx-small", text: res.stocks.length.toLocaleString("de-DE") + " Treffer in " + (res.eligible || 0).toLocaleString("de-DE") + " auswertbaren Aktien · " + current.label + (res.asOf ? " · Stand " + X.dateDe(res.asOf) : "") }),
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
    main.append(X.card([
      el("label", { class: "qx-small", text: "Datenbasis" }), methodSelect, note,
      el("h3", { class: "qx-h3", style: "margin-top:16px", text: "Regeln" }), rulesHost,
      el("div", { class: "qx-actions" }, [el("button", { type: "button", class: "qx-btn secondary", text: "+ Regel", onclick: function () { addRule(); } })]),
      el("div", { class: "qx-rule", style: "margin-top:16px;grid-template-columns:2fr 1fr" }, [sort, dir]),
      el("div", { class: "qx-actions" }, [el("button", { type: "button", class: "qx-btn", text: "Treffer anzeigen", onclick: apply }), share])
    ]), el("div", { class: "qx-section" }, [out]), X.more("Die Abfrage als Regeltext", function () { return code; }));
    await apply();
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
    main.append(el("span", { class: "qx-eyebrow", text: "Strategien" }),
      el("h1", { class: "qx-h1", text: "Welche Art von Unternehmen suchst du?" }),
      el("p", { class: "qx-lead", text: "Jeder Anlagestil sucht eine bestimmte Art von Unternehmen. Quant prüft täglich, welche Aktien alle Bedingungen erfüllen – für jede Aktie mit denselben Regeln." }));
    main.append(el("div", { class: "qx-grid qx-grid-3", style: "margin-top:12px" }, list.map(function (p) {
      var ix = byId[p.profileId];
      var blocked = ix && ix.availability && ix.availability.state !== "AVAILABLE";
      return el("a", { class: "qx-card qx-strat", href: X.routes.strategy(p.profileId), style: "text-decoration:none", dataset: { profile: p.profileId } }, [
        el("h3", { class: "qx-h3", text: p.label }), el("p", { text: p.plain }),
        el("div", { class: "qx-chips" }, p.conditions.map(function (c) { var fid = c.id; return el("span", { class: "qx-tag", text: (VM.FACTORS[fid] ? VM.FACTORS[fid].name : fid) + " ≥ " + c.value }); })),
        el("span", { class: "qx-strat-count", text: blocked ? "Derzeit nicht prüfbar: " + VM.reasonText(ix.availability.reason, "Eine benötigte Eigenschaft hat keine Daten.") : ix ? ix.count.toLocaleString("de-DE") + " Aktien erfüllen heute alle Bedingungen" : "" })]);
    })), el("p", { class: "qx-small", style: "margin-top:16px", text: "Es gibt bewusst keine Erfolgs- oder Trefferquote: Wie ein Stil in der Vergangenheit abgeschnitten hätte, ist ein Backtest – und der bleibt geschlossen, bis Universum, Kapitalmaßnahmen und Ausführung zertifiziert sind. Stand " + X.dateDe(index && index.asOf) + "." }),
      el("div", { class: "qx-actions" }, [X.btn("Wie Strategien geprüft werden", X.routes.method("strategien"), "secondary")]));
  }

  async function strategyDetail(main, ctx, p, ix, index, contract) {
    main.append(el("a", { class: "qx-back", href: X.routes.strategies(), text: "← Alle Strategien" }));
    if (!p) { main.append(el("h1", { class: "qx-h1", text: "Strategie nicht gefunden" }), X.notice("Unbekannte Strategie", "Diese Strategie gibt es in der veröffentlichten Methodik nicht.")); return; }
    document.title = p.label + " – Quant-Strategie · Vision Universe®";
    main.append(el("span", { class: "qx-eyebrow", text: "Strategie" }), el("h1", { class: "qx-h1", text: p.label }), el("p", { class: "qx-lead", text: p.plain }));
    main.append(el("div", { class: "qx-grid qx-grid-2" }, [
      X.card([el("h2", { class: "qx-h3", text: "Welche Bedingungen gelten?" }),
        el("ul", { class: "qx-conds" }, p.conditions.map(function (c) {
          return el("li", { class: "tone-neutral" }, [el("span", { "aria-hidden": "true", text: "•" }), el("div", {}, [el("span", { text: conditionText(c) }), el("small", { text: c.rationale })])]);
        })),
        el("p", { class: "qx-small", text: "Die Schwellen sind für jede Aktie gleich und nicht an vergangenen Ergebnissen optimiert." })]),
      X.card([el("h2", { class: "qx-h3", text: "Das typische Risiko dieses Stils" }),
        el("p", { text: p.mainRisk || "–" }),
        el("p", { class: "qx-small", text: "Ob eine Aktie passt, wird täglich neu geprüft: gezählt wird, welche Bedingungen sie heute erfüllt. Eine Aktie kann morgen herausfallen, ohne dass sich an ihrem Geschäft etwas geändert hat." })])
    ]));
    var members = (ix && ix.tickers) || [];
    var membersHost = el("div");
    main.append(X.section("Wer passt heute?", ix ? ix.count.toLocaleString("de-DE") + " Aktien erfüllen am " + X.dateDe(index.asOf) + " alle Bedingungen." : "Derzeit nicht verfügbar.", [membersHost]));
    var tr = index && index.historicalEvidence && (index.historicalEvidence.transitions || []).filter(function (t) { return t.profileId === p.profileId; })[0];
    var screening = await ctx.api.getFactorEvidenceScreening().catch(function () { return null; });
    var rowBy = {}; ((screening && screening.rows) || []).forEach(function (r) { rowBy[r.ticker] = r; });
    var ids = p.conditions.map(function (c) { return c.id; });
    membersHost.append(members.length ? el("div", { class: "qx-list" }, members.slice(0, 30).map(function (t) {
      var row = rowBy[t];
      return X.stockRow({ ticker: t, name: nameOf(ctx, t), why: row ? screeningWhy(row, ids) : null });
    })) : X.notice("Heute kein Treffer", "Keine Aktie erfüllt derzeit alle Bedingungen."),
      members.length > 30 ? el("div", { style: "margin-top:12px" }, [el("p", { class: "qx-small", text: "Weitere Treffer:" }), X.tickerChips(members.slice(30), 80)]) : null);
    if (tr) main.append(X.section("Was hat sich verändert?", "Seit dem Stand vom " + X.dateDe(index.historicalEvidence.from) + ".", [el("div", { class: "qx-grid qx-grid-2" }, [
      X.card([el("h3", { class: "qx-h3", text: (tr.entered || []).length + " neu dabei" }), X.tickerChips(tr.entered || [], 30)]),
      X.card([el("h3", { class: "qx-h3", text: (tr.exited || []).length + " herausgefallen" }), X.tickerChips(tr.exited || [], 30)])])]));
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
      if (total) main.append(X.section("Was verhindert einen Match?", total.toLocaleString("de-DE") + " Aktien verfehlen genau eine Bedingung. So verteilt es sich:", [X.card([
        el("div", { class: "qx-bars2" }, p.conditions.map(function (c) {
          var n = misses[c.id] || 0;
          return el("div", { class: "qx-bar2 tone-bad" }, [el("span", { text: VM.FACTORS[c.id] ? VM.FACTORS[c.id].name : c.id }), el("div", {}, [el("i", { style: "width:" + Math.max(1, n / total * 100) + "%" })]), el("b", { class: "num", text: String(n) })]);
        })),
        el("p", { class: "qx-small", text: "Knapp daneben (nur eine Bedingung verfehlt):" }),
        X.tickerChips(near.sort(function (a, b) { return (b.v || 0) - (a.v || 0); }).map(function (x) { return x.t; }), 16)
      ])]));
    }
    main.append(el("div", { class: "qx-actions" }, [X.btn("Methodik der Strategien", X.routes.method("strategien"), "secondary"),
      X.btn("Im Quant Screener öffnen", X.routes.screenerPro("query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(global.VUScreenerWorkspace.build(p.conditions.map(function (c) { return { field: c.field, operator: c.operator, value: c.value, scale: "raw" }; }), [{ field: p.conditions[0].field, direction: "desc" }])))), "secondary")]),
      el("p", { class: "qx-small", text: "Keine Erfolgs- oder Trefferquote: Ein Strategy Match zählt erfüllte Bedingungen. Methodik " + contract.methodologyVersion + "." }));
  }

  /* ============================================================== AKTIEN */
  async function stocks(main, ctx) {
    main.append(el("span", { class: "qx-eyebrow", text: "Aktien" }), el("h1", { class: "qx-h1", text: "Welche Aktie möchtest du verstehen?" }));
    var input = el("input", { type: "search", class: "qx-select", style: "font-size:18px;border-radius:999px;padding:14px 20px;max-width:640px",
      placeholder: "Name oder Kürzel, z. B. Apple oder NVDA", "aria-label": "Aktie suchen", autocomplete: "off" });
    var results = el("div", { "aria-live": "polite", style: "margin-top:12px" });
    main.append(input, results);
    var req = 0;
    input.addEventListener("input", async function () {
      var mine = ++req, q = input.value.trim();
      if (!q) { results.replaceChildren(); return; }
      results.replaceChildren(el("p", { class: "qx-small", text: "Wird gesucht …" }));
      var r = await ctx.api.searchInstruments(q, 12).catch(function () { return { state: "SOURCE_MISSING", entries: [] }; });
      if (mine !== req) return;
      if (r.state !== "AVAILABLE") { results.replaceChildren(X.notice("Suche derzeit nicht verfügbar", "Das Verzeichnis konnte nicht geladen werden.")); return; }
      results.replaceChildren(r.entries.length ? el("div", { class: "qx-list" }, r.entries.map(function (e) { return X.stockRow({ ticker: e.ticker, name: X.companyName(e) }); }))
        : el("p", { class: "qx-small", text: "Keine passenden Aktien gefunden." }));
    });
    var recent = X.recent.list(), watched = X.watch.list();
    main.append(X.section("Deine Aktien", recent.length || watched.length ? null : "Aktien, die du analysierst oder merkst, erscheinen hier.", [el("div", { class: "qx-grid qx-grid-2" }, [
      X.card([el("h3", { class: "qx-h3", text: "Zuletzt analysiert" }), recent.length ? X.tickerChips(recent, 12) : el("p", { class: "qx-small", text: "Noch keine." })]),
      X.card([el("h3", { class: "qx-h3", text: "Gemerkt" }), watched.length ? X.tickerChips(watched, 24) : el("p", { class: "qx-small", text: "Tippe auf einer Aktienseite auf „Merken“." }),
        watched.length > 1 ? el("div", { class: "qx-actions" }, [X.btn("Gemerkte vergleichen", X.routes.compare(watched.slice(0, 4)), "secondary")]) : null])
    ])]));
    var interesting = el("div", {}, [X.loading()]);
    main.append(X.section("Aktuell interessant", "Aktien mit einem bestätigten Setup oder neu in einer Strategie – aus den letzten Ständen.", [interesting]));
    main.append(X.section("Bekannte Aktien", "Ein schneller Einstieg.", [X.tickerChips(["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "KO", "PG", "JNJ", "XOM", "T", "SO", "O"], 16)]));
    var r = await Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; })]);
    var rows = [];
    if (r[1] && r[1].historicalEvidence && r[1].historicalEvidence.transitions) {
      r[1].historicalEvidence.transitions.forEach(function (t) {
        var label = ((r[1].profiles || []).filter(function (p) { return p.profileId === t.profileId; })[0] || {}).label || t.profileId;
        (t.entered || []).slice(0, 3).forEach(function (tk) { rows.push(X.stockRow({ ticker: tk, name: nameOf(ctx, tk), why: "Neu in der Strategie " + label + " (seit " + X.dateDe(r[1].historicalEvidence.to) + ")", pill: { text: "Neu", tone: "good" } })); });
      });
    }
    if (r[0] && r[0].state === "AVAILABLE") {
      var conf = r[0].states.filter(function (s) { return s.state === "CONFIRMED"; })[0];
      (conf ? [].concat.apply([], conf.rules.map(function (x) { return (x.tickers || []).map(function (t) { return { t: t, plain: x.plain }; }); })) : []).slice(0, 6).forEach(function (x) {
        rows.push(X.stockRow({ ticker: x.t, name: nameOf(ctx, x.t), why: x.plain, pill: { text: "Setup bestätigt", tone: "good" } }));
      });
    }
    interesting.replaceChildren(rows.length ? el("div", { class: "qx-list" }, rows.slice(0, 14)) : X.notice("Gerade nichts abrufbar", "Die aktuellen Stände konnten nicht geladen werden."));
  }

  global.QXPages = { home: home, screener: screener, strategies: strategies, stocks: stocks, QUESTIONS: QUESTIONS, SIMPLE_THRESHOLD: SIMPLE_THRESHOLD };
})(window);
