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
  function doors(items) {
    return el("div", { class: "v2-world-directory qx-doors" }, items.map(function (d, i) {
      return el("a", { class: "v2-world-door qx-door", href: d.href, dataset: { tone: String(i % 4) } }, [
        el("span", { class: "v2-world-door-count", text: d.kicker }), el("h2", { text: d.title }), el("p", { text: d.text }), el("span", { class: "v2-world-door-arrow", text: d.cta + " →" })]);
    }));
  }
  function nameOf(ctx, t) { var s = ctx.names && ctx.names[t]; return s || ""; }
  /* Eine Aktienkarte mit eigener Aussage: die staerkste gemessene
     Eigenschaft als grosse Zahl, die Quant-Einordnung als Satz - aus den
     veroeffentlichten Faktorwerten (dieselbe Datei wie der Screener). */
  function quantPoster(ctx, t, rowBy, opts) {
    opts = opts || {};
    var v = rowBy && rowBy[t] ? VM.fromScreeningRow(rowBy[t]) : null;
    var best = v ? v.factors.filter(function (f) { return f.state === "AVAILABLE"; }).sort(function (a, b) { return b.score - a.score; })[0] : null;
    return X.poster({ ticker: t, name: nameOf(ctx, t),
      big: best ? String(Math.round(best.score)) : null, bigLabel: best ? best.name + " · " + (best.word || best.label) : null, tone: best ? best.tone : null,
      story: v && v.overall.id !== "KEINE_DATEN" ? v.overall.text : opts.story, foot: opts.foot });
  }
  function screeningRows(ctx) {
    return ctx.api.getFactorEvidenceScreening().then(function (sc) {
      var by = {}; if (sc && sc.state === "AVAILABLE") sc.rows.forEach(function (r) { by[r.ticker] = r; }); return by;
    }).catch(function () { return {}; });
  }
  var REGIME = { BROAD_WEAKNESS: "Breite Schwäche", BROAD_STRENGTH: "Breite Stärke", NARROW_LEADERSHIP: "Schmale Führung", MIXED: "Gemischte Lage" };
  var STRATEGY_ART = function (id) { return global.QXStock && global.QXStock.strategyArt ? global.QXStock.strategyArt(id) : null; };

  /* ================================================================ HOME
     Aufgebaut wie Discovers Startseite: Intro mit Bild und Suche, "Heute
     bei ..." als Kennzahl-Kacheln, dann Reihen mit Aktienkarten. */
  async function home(main, ctx) {
    var page = el("div", { class: "v2-home" });
    main.append(page);
    page.append(el("header", { class: "v2-intro qx-intro qx-hero" }, [
      el("div", { class: "v2-intro-copy" }, [
        el("p", { class: "v2-intro-kicker", text: "Verstehen. Prüfen. Einordnen." }),
        el("h1", { text: "Aktien verstehen – mit nachvollziehbaren Gründen." }),
        el("p", { class: "v2-intro-lead qx-lead", text: "Quant prüft über 6.000 US-Aktien nach festen Daten und Regeln. Du siehst, was für eine Aktie spricht, was dagegen, was sich gerade verändert – und wo die Daten enden." }),
        el("div", { class: "v2-intro-actions" }, [
          el("a", { class: "v2-pill v2-pill-dark v2-intro-cta", href: X.routes.stocks(), text: "Aktie analysieren →" }),
          el("a", { class: "v2-pill v2-pill-ghost", href: X.routes.screener(), text: "Quant Screener" }),
          el("a", { class: "v2-pill v2-pill-ghost", href: X.routes.strategies(), text: "Strategien" })]),
        el("button", { type: "button", class: "v2-search-prompt qx-searchbox", onclick: ctx.openSearch, "aria-label": "Aktie suchen und analysieren" }, [
          el("span", { text: "⌕" }), el("span", { text: "Aktie analysieren – Name oder Kürzel" }), el("span", { class: "v2-search-arrow", text: "↗" })])
      ]),
      el("div", { class: "v2-intro-visual", "aria-hidden": "true" }, [
        el("img", { src: "/assets/themen/05-quantencomputing.webp", alt: "", width: "1672", height: "941", decoding: "async", fetchpriority: "high" }),
        el("p", { class: "v2-intro-tag", text: "Keine Blackbox: Jede Einschätzung hat einen Grund." })])
    ]));
    var journey = el("div", { class: "v2-journey" });
    page.append(journey);

    var kpis = el("div", { class: "v2-market-today-grid qx-kpis" }, [X.loading("Aktuelle Stände werden geladen …")]);
    journey.append(X.world("Heute bei Quant", "Belegte Veränderungen aus den letzten veröffentlichten Ständen – mit Datum.", [kpis], { href: X.routes.method(), label: "Wie Quant rechnet →" }, "v2-market-today"));
    journey.append(X.world("Was möchtest du herausfinden?", null, [doors([
      { kicker: "Aktie", title: "Aktie analysieren", text: "Wie gut ist eine konkrete Aktie – und warum?", cta: "Aktie suchen", href: X.routes.stocks() },
      { kicker: "Quant Screener", title: "Aktien finden", text: "Starte mit einer Frage – etwa nach Kursstärke oder solider Bilanz.", cta: "Fragen ansehen", href: X.routes.screener() },
      { kicker: "Strategien", title: "Strategien entdecken", text: "Welche Art von Unternehmen sucht ein Stil – und wer passt heute?", cta: "Strategien", href: X.routes.strategies() },
      { kicker: "Kursbild", title: "Aktuelle Setups", text: "Wo baut sich im Kursbild gerade etwas auf?", cta: "Setups ansehen", href: X.routes.screener("frage=setups") }
    ])]));
    var rails = el("div", { class: "qx-rails" }, [X.loading("Aktien werden geladen …")]);
    journey.append(rails);

    var recent = X.recent.list(), watched = X.watch.list();
    if (recent.length || watched.length) {
      var mine = ctx.commonFirst(watched.concat(recent.filter(function (t) { return watched.indexOf(t) < 0; }))).slice(0, 14);
      journey.append(X.world("Deine Aktien", watched.length ? "Gemerkt und zuletzt analysiert." : "Zuletzt analysiert.", [X.rail(mine.map(function (t) {
        return X.poster({ ticker: t, name: nameOf(ctx, t), story: watched.indexOf(t) >= 0 ? "Gemerkt" : "Zuletzt analysiert" });
      }), "Deine Aktien")], { href: X.routes.stocks(), label: "Alle ansehen →" }));
    }
    var pulseHost = el("div");
    journey.append(pulseHost);
    journey.append(X.world("So kommt Quant zu seiner Einschätzung", "Quant gibt keine Anlageempfehlungen, macht keine Prognosen und nennt keine Kursziele.", [
      el("div", { class: "qx-steps" }, [
        el("div", {}, [el("span", { class: "v2-eyebrow", text: "01 · Daten" }), el("b", { text: "Belegte Quellen" }), el("p", { text: "Geschäftszahlen aus SEC-Meldungen, Kurse von Tiingo – jeweils mit Stichtag. Fehlt etwas, wird nichts ersetzt." })]),
        el("div", {}, [el("span", { class: "v2-eyebrow", text: "02 · Regeln" }), el("b", { text: "Für jede Aktie gleich" }), el("p", { text: "Sieben Eigenschaften, Setups und Strategien folgen versionierten Regeln – dieselben für jeden Titel, nicht an Ergebnissen optimiert." })]),
        el("div", {}, [el("span", { class: "v2-eyebrow", text: "03 · Gründe" }), el("b", { text: "Bis zu den Rohdaten" }), el("p", { text: "Jede Aussage lässt sich aufklappen: Bedeutung, Erklärung, Belege, Daten, Methodik." })])
      ]), X.actions([X.btn("Warum kann ich dem vertrauen?", X.routes.method(), "secondary")])]));

    var r = await Promise.all([ctx.api.getSetupScreenIndex().catch(function () { return null; }), ctx.api.getStrategyIndex().catch(function () { return null; }),
      /* Kein Radar auf Home: er laedt das ganze Faehigkeitsverzeichnis
         (1,2 MB) plus Signale - fuer eine Karte. Home bleibt im Budget. */
      null, ctx.api.getMarketRegime().catch(function () { return null; }),
      ctx.api.getStrategyProfiles().catch(function () { return null; }), screeningRows(ctx)]);
    var setupIdx = r[0], stratIdx = r[1], regime = r[3], profiles = r[4], rowBy = r[5];
    var tiles = [], sections = [];
    var open = function (st) { return st && st.availability && st.availability.state === "AVAILABLE" && typeof st.count === "number"; };
    if (setupIdx && setupIdx.state === "AVAILABLE") {
      /* Nur offene Stufen tragen eine Zahl; eine geschlossene hat count null. */
      var conf = setupIdx.states.filter(function (st) { return st.state === "CONFIRMED" && open(st); })[0], form = setupIdx.states.filter(function (st) { return st.state === "SETUP_FORMING" && open(st); })[0];
      tiles.push(el("a", { class: "v2-market-kpi qx-kpi", href: X.routes.screener("frage=setups") }, [el("span", { class: "v2-market-name", text: "Bestätigte Setups" }),
        el("span", { class: "v2-market-change", text: (conf ? conf.count : 0).toLocaleString("de-DE") }),
        el("span", { class: "v2-market-fresh", text: (form ? "Bei weiteren " + form.count.toLocaleString("de-DE") + " entsteht eines · " : "") + "Stand " + X.dateDe(setupIdx.asOf) })]));
      var confRows = conf ? [].concat.apply([], conf.rules.map(function (x) { return (x.tickers || []).map(function (t) { return { t: t, plain: x.plain }; }); })) : [];
      var ordered = ctx.commonFirst(confRows.map(function (x) { return x.t; })).slice(0, 14);
      var plainOf = {}; confRows.forEach(function (x) { plainOf[x.t] = x.plain; });
      if (ordered.length) sections.push(X.world("Setups bestätigt", "Bei diesen Aktien sind im Kursbild alle Bedingungen eines Setups erfüllt · Stand " + X.dateDe(setupIdx.asOf) + ".", [X.rail(ordered.map(function (t) {
        return quantPoster(ctx, t, rowBy, { story: plainOf[t], foot: "Setup bestätigt" });
      }), "Setups bestätigt")], { href: X.routes.screener("frage=setups"), label: "Alle Setups →" }));
    }
    if (stratIdx && stratIdx.state === "AVAILABLE" && stratIdx.historicalEvidence && stratIdx.historicalEvidence.transitions) {
      var labels = {}; ((profiles && profiles.contract && profiles.contract.profiles) || stratIdx.profiles || []).forEach(function (p) { labels[p.profileId] = p.label; });
      var he = stratIdx.historicalEvidence;
      var entered = he.transitions.filter(function (t) { return t.entered && t.entered.length; });
      var total = entered.reduce(function (n, t) { return n + t.entered.length; }, 0);
      tiles.push(el("a", { class: "v2-market-kpi qx-kpi", href: X.routes.stocks() }, [el("span", { class: "v2-market-name", text: "Neu in einer Strategie" }),
        el("span", { class: "v2-market-change", text: total.toLocaleString("de-DE") }),
        el("span", { class: "v2-market-fresh", text: "Zwischen den Ständen " + X.dateDe(he.from) + " und " + X.dateDe(he.to) + " – kein Ereignis von heute" })]));
      /* Eine Reihe je Strategie - das Datum steht EINMAL im Kopf der Reihe,
         nicht an jeder Karte. Home zeigt die drei groessten Bewegungen; alle
         stehen unter Aktien. */
      entered.slice().sort(function (a, b) { return b.entered.length - a.entered.length; }).slice(0, 3).forEach(function (t) {
        var label = labels[t.profileId] || t.profileId;
        sections.push(X.world("Neu in „" + label.split(" · ")[0] + "“", t.entered.length + (t.entered.length === 1 ? " Aktie erfüllt" : " Aktien erfüllen") + " seit dem Stand vom " + X.dateDe(he.to) + " neu alle Bedingungen (vorher " + X.dateDe(he.from) + ")" +
          (t.exited && t.exited.length ? "; " + t.exited.length + (t.exited.length === 1 ? " ist" : " sind") + " herausgefallen" : "") + ".", [X.rail(ctx.commonFirst(t.entered).slice(0, 14).map(function (tk) {
          return quantPoster(ctx, tk, rowBy, { story: "Erfüllt jetzt alle Bedingungen", foot: "Neu seit " + X.dateDe(he.to) });
        }), "Neu in " + label)], { href: X.routes.strategy(t.profileId), label: "Strategie ansehen →" }));
      });
    }
    if (regime && regime.state === "AVAILABLE") {
      var above = (regime.measures || []).filter(function (m) { return m.id === "above200"; })[0];
      tiles.push(el("a", { class: "v2-market-kpi qx-kpi", href: X.routes.method("grenzen") }, [el("span", { class: "v2-market-name", text: "Marktlage" }),
        el("span", { class: "v2-market-change qx-kpi-word", text: REGIME[regime.regime] || "Marktlage" }),
        el("span", { class: "v2-market-fresh", text: (above ? Math.round(above.share * 100) + " % über der 200-Tage-Linie · " : "") + "Stand " + X.dateDe(regime.asOf) })]));
      pulseHost.append(el("section", { class: "v2-pulse-teaser qx-pulse" }, [
        el("div", {}, [el("p", { class: "v2-eyebrow", text: "Quant · Marktlage" }), el("h2", { text: REGIME[regime.regime] || "Marktlage" }),
          el("p", { class: "v2-pulse-statement", text: (regime.matchedRule && regime.matchedRule.plain) || "" })]),
        above ? el("div", { class: "v2-pulse-state" }, [el("span", { text: "Über der 200-Tage-Linie" }), el("strong", { text: Math.round(above.share * 100) + " %" }),
          el("small", { text: "von " + above.observed.toLocaleString("de-DE") + " Aktien · Stand " + X.dateDe(regime.asOf) })]) : null]));
    }
    kpis.replaceChildren.apply(kpis, tiles.length ? tiles : [X.notice("Gerade keine Veränderungen abrufbar", "Die aktuellen Stände konnten nicht geladen werden. Suche und Screener funktionieren weiterhin.")]);
    rails.replaceChildren.apply(rails, sections);
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
    main.append(el("p", { class: "v2-eyebrow", text: "Quant Screener" }),
      el("h1", { class: "qx-h1", text: pro ? "Eigene Regeln, volle Kontrolle." : "Welche Aktien suchst du?" }),
      el("p", { class: "v2-lead qx-lead", text: pro ? "Alle Kennzahlen und Faktoren des Quant Screeners, frei kombinierbar. Jede Regel ist sichtbar und teilbar." : "Wähle eine Frage. Quant zeigt die passenden Aktien – und bei jeder, warum sie dabei ist." }),
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
      out.replaceChildren(el("p", { class: "qx-count", text: result.summary }),
        result.rows.length ? el("div", { class: "qx-list" }, result.rows.slice(0, 40)) : X.notice("Keine Treffer", "Heute erfüllt keine Aktie alle Bedingungen dieser Frage."),
        (result.total || result.rows.length) > 40 ? el("p", { class: "qx-small", text: "Gezeigt werden die ersten 40 von " + (result.total || result.rows.length).toLocaleString("de-DE") + " Treffern. Im Profi-Modus lassen sich alle Treffer sortieren und weiter eingrenzen." }) : null,
        el("p", { class: "qx-small", text: result.method }),
        X.actions([X.btn("Im Profi-Modus verfeinern", X.routes.screenerPro(result.query ? "query=" + encodeURIComponent(global.VUScreenerWorkspace.encode(result.query)) : ""), "secondary")]));
    }
    sync(); await run();
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
    main.append(el("p", { class: "v2-eyebrow", text: "Strategien" }),
      el("h1", { class: "qx-h1", text: "Welche Art von Unternehmen suchst du?" }),
      el("p", { class: "v2-lead", text: "Jeder Anlagestil sucht eine bestimmte Art von Unternehmen. Quant prüft täglich, welche Aktien alle Bedingungen erfüllen – für jede Aktie mit denselben Regeln." }));
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
    main.append(el("p", { class: "v2-eyebrow", text: "Aktien" }), el("h1", { class: "qx-h1", text: "Welche Aktie möchtest du verstehen?" }));
    var input = el("input", { type: "search", class: "qx-select qx-stock-search",
      placeholder: "Name oder Kürzel, z. B. Apple oder NVDA", "aria-label": "Aktie suchen", autocomplete: "off" });
    var results = el("div", { "aria-live": "polite", style: "margin-top:12px" });
    main.append(el("div", { class: "v2-search-prompt qx-search-field" }, [el("span", { "aria-hidden": "true", text: "⌕" }), input]), results);
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
