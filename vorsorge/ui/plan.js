/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/plan.js
   Home, Vorsorgeplaner, Vorsorgeluecke, Kostenanalyse, Vorsorge-Monitor.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, M = V.Math, F = VS.fmt, esc = VS.esc;

  function scenarios(plan) {
    var r = plan.returns || {};
    return [{ id: "konservativ", label: "Konservativ", annualReturn: r.konservativ }, { id: "basis", label: "Basis", annualReturn: r.basis }, { id: "optimistisch", label: "Optimistisch", annualReturn: r.optimistisch }];
  }
  /** Kontext fuer Plan-Schnappschuesse: Datenstand, Regelversionen, Portfolio-Schwankung. */
  VS.snapshotContext = function () {
    return Promise.all([VS.master().catch(function () { return null; }), VS.rules().catch(function () { return []; }),
      VS.seriesFor(VS.state.portfolio.map(function (p) { return p.symbol; })).catch(function () { return null; })]).then(function (r) {
      var m = r[0], rules = r[1], s = r[2], vol = null;
      if (m && s) { var x = V.XRay.portfolioXRay(VS.state.portfolio, m._bySymbol, s.series, {}); vol = x.risk ? x.risk.volatility.value : null; }
      var rv = {}; (rules || []).forEach(function (x) { rv[x.ruleId] = x.ruleVersion; });
      return { dataAsOf: m ? m.asOf : null, ruleVersions: rv, portfolioVol: vol };
    });
  };
  VS.currentPlan = function () { return M.plan(VS.state.plan, scenarios(VS.state.plan)); };

  /* ================================================================ HOME */
  var ROUTE_HINTS = [
    [/spar|rente|ruhestand|plan|wie viel|lücke|luecke|ziel/i, "#/plan", "Vorsorgeplaner: Wie viel muss ich sparen?"],
    [/kost|ter|gebühr|gebuehr/i, "#/kosten", "Kostenanalyse: Was kosten mich Gebühren langfristig?"],
    [/förder|foerder|zulage|altersvorsorgedepot|staat/i, "#/foerderung", "Förderrechner: Altersvorsorgedepot & Zulagen"],
    [/riester/i, "#/riester", "Riester-Analyse: Behalten oder neu ausrichten?"],
    [/kind|frühstart|fruehstart|baby/i, "#/fruehstart", "Frühstart: Vorsorge für Kinder"],
    [/anbieter|depot|broker/i, "#/anbieter", "Anbieter-Vergleich"],
    [/overlap|überschneid|ueberschneid|x-ray|xray/i, "#/portfolio", "Portfolio-X-Ray: Überschneidungen & Konzentration"],
    [/vergleich/i, "#/vergleich", "ETF-Vergleich"],
    [/was ist|erklär|erklaer|lernen|wissen/i, "#/wissen", "Wissen: Begriffe einfach erklärt"]
  ];

  /** master: Index-Objekt oder Funktion, die ein Promise darauf liefert (Startseite: erst bei Fokus/Eingabe laden). */
  function attachSearch(root, master) {
    var input = root.querySelector("#vs-q"), box = root.querySelector("#vs-suggest");
    if (!input) return;
    var get = typeof master === "function" ? master : function () { return Promise.resolve(master); };
    var timer = null;
    function show(master) {
      var q = input.value.trim();
      if (!q) { box.innerHTML = ""; return; }
      var items = [];
      if (/^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(q)) items.push('<li><a href="#/europa/' + esc(q.toUpperCase()) + '"><span>ISIN ' + esc(q.toUpperCase()) + ' im EU-Register öffnen</span><span class="vs-sub">Europa →</span></a></li>');
      ROUTE_HINTS.forEach(function (h) { if (h[0].test(q)) items.push('<li><a href="' + h[1] + '"><span>' + esc(h[2]) + '</span><span class="vs-sub">Öffnen →</span></a></li>'); });
      V.Master.search(master.etfs.filter(function (e) { return e.layer !== "REVIEW"; }), q, 6).forEach(function (e) {
        items.push('<li><a href="' + VS.etfHref(e) + '"><span><b>' + esc(e.symbol) + '</b> · ' + esc(e.name) + '</span><span class="vs-sub">' + esc(e.category) + '</span></a></li>');
      });
      if (!items.length) items.push('<li><a href="#/etfs?q=' + encodeURIComponent(q) + '"><span>Keine direkte Übereinstimmung – im ETF-Screener suchen</span><span>→</span></a></li>');
      box.innerHTML = '<ul role="listbox">' + items.slice(0, 9).join("") + '</ul>';
      clearTimeout(timer);
      timer = setTimeout(function () { VS.analytics.track("etf_search", { query: q.slice(0, 40) }); }, 800);
    }
    input.addEventListener("focus", function () { get().catch(function () { /* Fehler zeigt die Eingabe */ }); });
    input.addEventListener("input", function () { get().then(show, function () { /* ETF-Verzeichnis nicht erreichbar */ }); });
    root.querySelector("#vs-search-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var q = input.value.trim(); if (!q) return;
      var hint = ROUTE_HINTS.filter(function (h) { return h[0].test(q); })[0];
      get().then(function (m) { return m.find(q); }, function () { return null; }).then(function (exact) {
        VS.go(exact ? VS.etfHref(exact) : hint ? hint[1] : "#/etfs?q=" + encodeURIComponent(q));
      });
    });
    document.addEventListener("click", function (ev) { if (!box.contains(ev.target) && ev.target !== input) box.innerHTML = ""; });
  }
  VS.attachSearch = attachSearch;

  /* V01 (Redesign 2027): ein Hauptweg „Starte mit 10 €“, drei Wege nach Lage, eine markierte Beispielrechnung,
     Förderung in drei Zahlen, Kern-ETFs mit Mini-Chart, drei Änderungen. Die Lage aus dem ersten Besuch steuert die Reihenfolge. */
  var CORE = ["URTH","SPY","EEM","QQQ","FEZ","IWM"];
  var CORE_TITLE = { URTH: "Aktien Welt", SPY: "Aktien USA", EEM: "Schwellenländer", QQQ: "USA Technik", FEZ: "Aktien Europa", IWM: "US-Nebenwerte" };
  VS.CORE_TITLE = CORE_TITLE;
  var LAGEN = [["neu", "spark", "Ich habe noch nie gespart", "10-Euro-Sparplan, Schritt für Schritt"], ["plan", "target", "Ich will wissen, ob es reicht", "Planer mit drei Beispielen"],
    ["etfs", "pie", "Ich habe schon ETFs", "Portfolio-X-Ray und Veränderungen"], ["profi", "bars", "Ich kenne mich aus", "Alle ETFs, Kosten, Bestände"]];
  function firstVisit() {
    var U = VS.U, el = VS.sheet("vs-lage", "Womit fängst du an?", '<p class="vu-ltag">Erster Besuch</p><p class="vu-lead" style="margin-top:4px">Wir zeigen dir zuerst, was zu dir passt. Ändern kannst du es jederzeit.</p><div class="vu-stack vs-lagen">' +
      LAGEN.map(function (l, i) { return '<button type="button" class="vs-lage' + (i === 0 ? " is-ink" : "") + '" data-lage="' + l[0] + '"><span class="vu-hud" style="--vu-hud:38px;border-radius:11px">' + VS.glyph(l[1], 20) + '</span><span><b>' + esc(l[2]) + (l[0] === "profi" ? " " + U.pro() : "") + '</b><small>' + esc(l[3]) + '</small></span>' + VS.glyph("next", 16) + '</button>'; }).join("") + '</div>');
    if (!el) return;
    el.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-lage]");
      if (!b) return;
      VS.state.lage = b.getAttribute("data-lage"); VS.save(); U.closeSheet(el); VS.views.home({ query: {} });
    });
  }

  VS.views.home = function (r) {
    var U = VS.U, pl = VS.state.plan, done = VS.state.planDone;
    var p = VS.currentPlan(), base = p.scenarios[1];
    var lage = VS.state.lage || "neu";
    var mx = Math.max.apply(null, p.scenarios.map(function (s) { return s.real; }).concat([1]));
    var LBL = { konservativ: "Vorsichtig", basis: "Mittel", optimistisch: "Gut" };
    var calc = VS.sect(done ? "Dein Plan" : "So könnte es aussehen") + '<div class="vu-box vs-calc">' +
      '<div class="vs-row-sb">' + (done ? VS.trackVerdict(V.Monitor.onTrack(base.goalAttainment)) : VS.bsp()) + '<span class="vu-xs vu-mu"><b>' + F.eur(pl.monthly) + ' im Monat · ' + p.input.age + ' → ' + p.input.targetAge + ' J.</b></span></div>' +
      '<p class="vs-big num">' + F.eurK(base.real) + '</p><p class="vu-sm vu-mu">mit ' + p.input.targetAge + ', in heutiger Kaufkraft, bei ' + F.pct(base.annualReturn, 0) + ' pro Jahr</p>' +
      '<div class="vs-wbars">' + p.scenarios.map(function (s) { return VS.wbar((LBL[s.id] || s.label) + " · " + F.pct(s.annualReturn, 0), F.eurK(s.real), s.real / mx * 100, s.id === "basis"); }).join("") + '</div>' +
      VS.help("Heutige Kaufkraft: was das Geld nach " + F.pct(p.input.inflation, 0) + " Inflation pro Jahr heute wert wäre. Keine Prognose.") + '</div>';
    var hero = '<a class="vu-box vu-box--lime vs-start-card" href="#/start"><span class="vu-ltag">Neu hier?</span><span class="vs-start-t">Starte mit 10&nbsp;€ im Monat.</span><span class="vu-sm">In 6 Schritten zu deinem ersten ETF-Sparplan. Dauert 3 Minuten.</span><span class="vu-btn vu-btn--ink vu-btn--block">10-Euro-Sparplan starten ' + VS.glyph("next", 18) + '</span></a>';
    var ways = VS.sect("Wo stehst du?") + '<div class="vu-stack">' + VS.navcard({ href: "#/start", glyph: "spark", title: "Ich fange an", sub: "Sparplan in 6 Schritten" }) +
      VS.navcard({ href: "#/plan", glyph: "target", title: "Ich plane meine Rente", sub: "Planer: wie viel muss ich sparen?" }) + VS.navcard({ href: "#/portfolio", glyph: "pie", title: "Ich habe schon ETFs", sub: "Portfolio durchleuchten" }) + '</div>' +
      '<p class="vu-xs vs-lage-link"><button type="button" class="vs-link" id="vs-lage-open">Lage ändern</button></p>';
    var funding = '<section id="vs-home-fd">' + VS.sect("Was der Staat ab 2027 dazulegt") + '<div class="vu-grid" style="--vu-cols:3">' + VS.tile("Grundzulage", "…") + VS.tile("Je Kind", "…") + VS.tile("Unter 25", "…") + '</div></section>';
    var etfs = '<section id="vs-home-world">' + VS.sect("Kern-ETFs", "#/etfs", "Alle") + '<div class="vs-loading">ETF-Verzeichnis wird geladen …</div></section>';
    var changes = '<section id="vs-home-changes">' + VS.sect("Was hat sich geändert?", "#/monitor", "Alle") + '<div class="vs-loading">…</div></section>';
    var order = lage === "profi" ? [etfs, hero, ways, calc, funding, changes] : lage === "etfs" ? [ways, hero, calc, etfs, changes, funding] : lage === "plan" ? [calc, hero, ways, funding, etfs, changes] : [hero, ways, calc, funding, etfs, changes];
    var root = VS.render(VS.intro("Was wird aus deiner Rente?", "Rechnen, verstehen, anfangen. Ohne Produktverkauf, mit amtlichen Regeln.") + order.join(""), { dm: [["Beispielrechnung", "Planer-Formel mit " + (done ? "deinen gespeicherten Angaben" : "Standardannahmen") + ": " + F.eur(pl.monthly) + " im Monat, " + F.eur(pl.start) + " Startvermögen, Kosten " + F.pct(pl.cost, 2) + ", Inflation " + F.pct(pl.inflation, 1) + ", Szenarien 3 / 5 / 7 % pro Jahr vor Kosten."]] });
    root.querySelector("#vs-lage-open").onclick = firstVisit;
    if ((!VS.state.lage && !(global.navigator && global.navigator.webdriver)) || (r && r.query && r.query.lage === "1")) firstVisit();

    VS.rules().then(function (rules) {
      var avd = rules.filter(function (x) { return x.ruleId === "DE-ALTERSVORSORGEDEPOT"; })[0] || rules[0], mf = avd.maximumFunding || {}, cr = avd.contributionRules || {};
      var min = cr.minimumAnnualOwnContribution, z = V.Funding.altersvorsorgedepot(avd, { ownContribution: min });
      root.querySelector("#vs-home-fd").innerHTML = VS.sect("Was der Staat ab 2027 dazulegt") + '<div class="vu-grid" style="--vu-cols:3">' + VS.tile("Grundzulage", F.eur(mf.basicAllowancePerYear), "höchstens / Jahr") +
        VS.tile("Je Kind", F.eur(mf.childAllowancePerChildPerYear), "höchstens / Jahr") + VS.tile("Unter 25", F.eur(mf.careerStarterOneTime), "einmalig") + '</div>' +
        VS.help("Gilt für das neue geförderte Altersvorsorgedepot. Schon ab " + F.eur(min / 12) + " im Monat gibt es " + F.eur(z.total) + " Zulage im Jahr.") +
        '<div style="margin-top:10px">' + VS.navcard({ href: "#/foerderung", glyph: "star", title: "Förderung ausrechnen", sub: "Altersvorsorgedepot ab " + F.date(avd.validFrom) }) + '</div>';
    }).catch(function () { root.querySelector("#vs-home-fd").innerHTML = VS.sect("Was der Staat ab 2027 dazulegt") + U.blank("Die Förderregeln konnten nicht geladen werden."); });

    VS.masterFor(CORE).then(function (m) {
      var world = root.querySelector("#vs-home-world");
      var core = CORE.map(function (s) { return m._bySymbol[s]; }).filter(Boolean);
      world.innerHTML = VS.sect("Kern-ETFs", "#/etfs", "Alle " + m.counts.publicAnalysis.toLocaleString("de-DE")) + '<div class="vs-erows">' + core.map(function (e) { return VS.etfRow(e, { title: CORE_TITLE[e.symbol], sub: e.index || "" }); }).join("") + '</div>' +
        VS.help("Ein ETF ist ein Korb mit vielen Aktien. „1 Jahr“ zeigt, wie sich der Kurs in 12 Monaten bewegt hat.");
      VS.fillSparks(world);
      VS.dm([["ETF-Daten", "Kurse · Holdings aus den Pflichtmeldungen der Fonds · Kategorien aus dem Fondsnamen"]], m.asOf);
    }).catch(function () { root.querySelector("#vs-home-world").innerHTML = VS.sect("Kern-ETFs") + U.blank("Das ETF-Verzeichnis ist nicht erreichbar. Planer und Rechner funktionieren weiter."); });

    VS.holdingsFeed().then(function (hi) {
      var mine = {}; VS.state.watchlist.concat(VS.state.portfolio.map(function (x) { return x.symbol; })).forEach(function (s) { mine[String(s).toUpperCase()] = 1; });
      var feed = (hi.feed || []).slice(), own = feed.filter(function (f) { return mine[f.symbol]; });
      var list = (own.length ? own : feed).slice(0, 3);
      root.querySelector("#vs-home-changes").innerHTML = VS.sect("Was hat sich geändert?", "#/monitor", "Alle") + (list.length ? '<div class="vu-box vs-kvbox">' + list.map(function (f) {
        return '<a class="vs-kv" href="#/etf/' + encodeURIComponent(f.symbol) + '?tab=aenderungen"><span class="vu-sm"><b>' + esc(f.symbol) + '</b> ' + esc(String(f.text || "").replace(/\s*\([^)]*Prozentpunkte\)\.?$/, "")) + '</span>' + VS.glyph("next", 15) + '</a>'; }).join("") + '</div>' : U.blank("Keine Änderungen seit dem letzten Datenstand."));
      VS.dm([["Veränderungen", "Bestände: Quartalsmeldungen, Stand " + esc((hi.quarters || []).join(", "))]]);
    }).catch(function () { root.querySelector("#vs-home-changes").innerHTML = VS.sect("Was hat sich geändert?") + U.blank("Die Änderungsliste konnte nicht geladen werden."); });
  };


  /* ============================================================== PLANER */
  var started = false;
  /* V02 (Redesign 2027): Regler oben, ein Ergebnis mit Urteil, der eine Chart (Basis als Linie, Szenarien
     gestrichelt), Stellschrauben, Kosten, Annahmen im Sheet, Profi-Tabelle. Gerechnet wird nur in der Engine. */
  var SLIDERS = [["age", "Dein Alter", "Jahre", 18, 70, 1], ["targetAge", "Rente ab", "Jahre", 55, 75, 1], ["monthly", "Sparrate", "€ / Monat", 0, 2000, 10],
    ["start", "Schon gespart", "€", 0, 200000, 1000], ["desiredIncome", "Wunsch im Alter", "€ / Monat", 500, 6000, 50]];
  var SC_LBL = { konservativ: "vorsichtig", basis: "mittel", optimistisch: "gut" };
  function fill(inp) { inp.style.setProperty("--p", ((inp.value - inp.min) / (inp.max - inp.min) * 100).toFixed(1) + "%"); }
  VS.views.plan = function (r) {
    var pl = VS.state.plan, sp = VS.state.sparplan;
    var nf = function (v) { return Number(v).toLocaleString("de-DE"); };
    var root = VS.render(VS.intro("Wie viel muss ich sparen?", "Fünf Angaben, drei Beispiele. In heutiger Kaufkraft gerechnet.") +
      (sp && !VS.state.planDone ? '<div class="vu-box vu-box--line vs-row-sb" style="margin-top:14px"><span class="vu-sm">Dein Sparplan aus dem 10-Euro-Ablauf: <b>' + F.eur(sp.amount) + ' im Monat</b>, ' + esc(sp.index) + '.</span><button type="button" class="vu-btn vu-btn--sm" id="vs-take-sp">Als Sparrate nehmen</button></div>' : "") +
      '<form class="vu-box vs-sliders" id="vs-plan-form" style="margin-top:16px" novalidate>' + SLIDERS.map(function (s) { return VS.slider(s[0], s[1], pl[s[0]], { unit: s[2], min: s[3], max: s[4], step: s[5], fmt: nf }); }).join("") + '</form>' +
      '<p class="vu-xs vu-mu" style="margin-top:6px">Gesetzliche Rente und andere Einkünfte: <b>' + F.eur(pl.existingIncome) + ' / Monat</b> · <button type="button" class="vs-link" data-open="annahmen">ändern</button></p>' +
      '<div id="vs-plan-out"></div>' +
      '<details class="vu-more" id="vs-luecke"' + (r.args[0] === "luecke" ? " open" : "") + '><summary>Vorsorgelücke und was Warten kostet</summary><div class="vu-more-body" id="vs-gap-out"></div></details>',
      { dm: [["Annahmen", "Szenarien " + F.pct(pl.returns.konservativ, 0) + " / " + F.pct(pl.returns.basis, 0) + " / " + F.pct(pl.returns.optimistisch, 0) + " pro Jahr vor Kosten, Kosten " + F.pct(pl.cost, 2) + ", Inflation " + F.pct(pl.inflation, 1) + ", Auszahldauer " + pl.payoutYears + " Jahre. Gespeichert wird nur in diesem Browser."]] });
    var form = root.querySelector("#vs-plan-form");
    form.querySelectorAll("input[type=range]").forEach(fill);
    function read() {
      SLIDERS.forEach(function (s) { var el = form.querySelector("#" + s[0]); VS.state.plan[s[0]] = Number(el.value); root.querySelector("#" + s[0] + "-out").textContent = nf(el.value); fill(el); });
      if (VS.state.plan.targetAge <= VS.state.plan.age) VS.state.plan.targetAge = VS.state.plan.age + 1;
      VS.save();
    }
    function draw() { drawPlan(root.querySelector("#vs-plan-out")); drawGap(root.querySelector("#vs-gap-out")); }
    form.addEventListener("input", function () { if (!started) { VS.analytics.track("planner_start", {}); started = true; } read(); draw(); });
    var take = root.querySelector("#vs-take-sp");
    if (take) take.onclick = function () { form.querySelector("#monthly").value = sp.amount; read(); draw(); take.closest(".vu-box").remove(); };
    root.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-open],[data-save]");
      if (!b) return;
      if (b.hasAttribute("data-save")) return save(b);
      assumptions();
    });
    function save(b) {
      var p = VS.currentPlan();
      VS.state.planDone = true; VS.state.snapshot = V.Monitor.snapshotPlan(p, VS.state.portfolio, new Date().toISOString().slice(0, 10)); VS.save();
      VS.snapshotContext().then(function (ctx) { VS.state.snapshot = V.Monitor.snapshotPlan(p, VS.state.portfolio, VS.state.snapshot.at, ctx); VS.save(); });
      VS.analytics.track("planner_complete", { years: p.years });
      b.textContent = "Gespeichert"; setTimeout(function () { b.textContent = "Plan speichern"; }, 2500);
    }
    function assumptions() {
      var x = VS.state.plan;
      var el = VS.sheet("vs-ann", "Annahmen", '<div class="vs-row-sb">' + VS.bsp("Beispiel") + '</div><p class="vu-sm vu-mu" style="margin-top:6px">So rechnen wir. Alles änderbar, nichts davon ist versprochen.</p>' +
        '<form id="vs-ann-form" class="vs-form" style="margin-top:12px">' +
        VS.field("existingIncome", "Rente und andere Einkünfte", x.existingIncome, { min: 0, unit: "€ / Monat, heutige Kaufkraft" }) +
        VS.field("rk", "Rendite vorsichtig", (x.returns.konservativ * 100).toFixed(1), { step: 0.5, unit: "% pro Jahr vor Kosten" }) + VS.field("rb", "Rendite mittel", (x.returns.basis * 100).toFixed(1), { step: 0.5, unit: "% pro Jahr" }) +
        VS.field("ro", "Rendite gut", (x.returns.optimistisch * 100).toFixed(1), { step: 0.5, unit: "% pro Jahr" }) + VS.field("cost", "Laufende Kosten (ETF + Depot)", (x.cost * 100).toFixed(2), { min: 0, max: 5, step: 0.05, unit: "% pro Jahr" }) +
        VS.field("inflation", "Inflation", (x.inflation * 100).toFixed(1), { step: 0.1, unit: "% pro Jahr" }) + VS.field("lumpSum", "Einmalanlage", x.lumpSum, { min: 0, unit: "€ heute" }) +
        VS.field("payoutYears", "Auszahldauer", x.payoutYears, { min: 1, max: 50, unit: "Jahre" }) + '</form>' +
        VS.help("Rendite: wie stark das Geld im Jahr im Schnitt wächst. Auch Jahre mit Verlust sind möglich.") +
        '<button type="button" class="vu-btn vu-btn--block" id="vs-ann-ok" style="margin-top:14px">Übernehmen</button>');
      el.querySelector("#vs-ann-ok").onclick = function () {
        var f = el.querySelector("#vs-ann-form"), n = function (id, d, s) { return VS.readNum(f, id, d, s); };
        Object.assign(VS.state.plan, { existingIncome: n("existingIncome", 0), cost: n("cost", 0.3, 0.01), inflation: n("inflation", 2, 0.01), lumpSum: n("lumpSum", 0), payoutYears: n("payoutYears", 25),
          returns: { konservativ: n("rk", 3, 0.01), basis: n("rb", 5, 0.01), optimistisch: n("ro", 7, 0.01) } });
        VS.save(); VS.U.closeSheet(el); VS.views.plan(r);
      };
    }
    draw();
  };

  function drawPlan(out) {
    var p = VS.currentPlan(), pl = VS.state.plan, base = p.scenarios[1], U = VS.U;
    var track = V.Monitor.onTrack(base.goalAttainment);
    var order = [p.scenarios[1], p.scenarios[0], p.scenarios[2]];
    var paths = order.map(function (s) {
      var pts = [];
      for (var y = 0; y <= p.years; y++) {
        var fv = M.futureValue({ start: pl.start, lumpSum: pl.lumpSum, monthly: pl.monthly, years: y, annualReturn: s.annualReturn, annualCost: pl.cost }).nominal;
        pts.push([p.input.age + y, M.inflationAdjustedValue(fv, y, pl.inflation)]);
      }
      return { label: F.pct(s.annualReturn, 0) + " · " + (SC_LBL[s.id] || s.label), points: pts };
    });
    var levers = M.leverAnalysis(pl, pl.returns.basis).levers;
    var fee = M.feeImpact({ start: pl.start, monthly: pl.monthly, years: p.years, annualReturn: pl.returns.basis, costA: 0.002, costB: 0.015 });
    var prob = M.goalProbability({ start: pl.start, lumpSum: pl.lumpSum, monthly: pl.monthly, years: p.years, annualReturn: pl.returns.basis, annualCost: pl.cost, volatility: 0.15,
      target: M.inflate(base.requiredCapitalReal, p.years, pl.inflation), paths: 1500 });
    var kT = function (v) { return F.eurK(v).replace(" €", ""); };
    out.innerHTML =
      '<div class="vu-box vu-box--ink vs-result"><div class="vs-row-sb">' + VS.bsp() + VS.trackVerdict(track) + '</div>' +
      '<p class="vs-big num">' + F.pct(base.goalAttainment, 0) + '</p><p class="vu-sm" style="opacity:1">deines Ziels erreichst du bei ' + F.pct(base.annualReturn, 0) + ' pro Jahr.</p>' +
      '<p class="vu-sm" style="margin-top:4px">Lücke: ' + F.eur(base.gapMonthlyReal) + ' im Monat · Vermögen mit ' + p.input.targetAge + ': ' + F.eurK(base.real) + '</p></div>' +
      VS.sect("Dein Vermögen bis " + p.input.targetAge) +
      '<div class="vs-chipline">' + VS.bsp("Beispiel") + '<span class="vu-chip">Linie: ' + F.pct(base.annualReturn, 0) + '</span><span class="vu-chip">gestrichelt: ' + F.pct(p.scenarios[0].annualReturn, 0) + ' und ' + F.pct(p.scenarios[2].annualReturn, 0) + '</span></div>' +
      '<div id="vs-plan-chart"></div>' +
      '<div class="vu-grid" style="--vu-cols:3;margin-top:12px">' + p.scenarios.map(function (s) { return VS.tile(F.pct(s.annualReturn, 0) + " · " + (SC_LBL[s.id] || s.label), kT(s.real), "€ · Ziel " + F.pct(s.goalAttainment, 0)); }).join("") + '</div>' +
      VS.help("Ziel " + F.pct(base.goalAttainment, 0) + ": So viel der Lücke zwischen Rente und Wunsch deckt dein Vermögen für " + p.input.payoutYears + " Jahre. In heutiger Kaufkraft.") +
      VS.sect("Was am meisten bewirkt") + '<div class="vu-box vs-kvbox">' + levers.map(function (l, i) {
        return '<div class="vs-kv"><span class="vu-sm"><b>' + (i + 1) + '. ' + esc(l.label) + '</b></span>' + (U ? U.chg(Math.round(l.delta * 100), { digits: 0 }).replace(" %", " %-Pkt.") : F.spct(l.delta, 0)) + '</div>'; }).join("") + '</div>' +
      '<p class="vu-xs vu-mu" style="margin-top:6px">Veränderung der Zielerreichung im Beispiel mit ' + F.pct(pl.returns.basis, 0) + '.</p>' +
      VS.sect("Kosten über " + p.years + " Jahre") + '<div class="vu-box"><p class="vs-big num" style="font-size:28px;margin-top:0">' + F.eurK(fee.difference) + '</p><p class="vu-sm vu-mu">Unterschied zwischen 0,2 % und 1,5 % laufenden Kosten</p>' +
      '<div class="vs-wbars">' + VS.wbar("0,2 % Kosten", F.eurK(fee.a.endValue), 100, true) + VS.wbar("1,5 % Kosten", F.eurK(fee.b.endValue), fee.b.endValue / Math.max(1, fee.a.endValue) * 100) + '</div>' +
      '<a class="vu-xs vs-link" href="#/kosten">Kosten selbst durchrechnen</a></div>' +
      '<div class="vs-btnrow"><button type="button" class="vu-btn" data-save>Plan speichern</button><button type="button" class="vu-btn vu-btn--line" data-open="annahmen">Annahmen</button></div>' +
      '<details class="vu-more"><summary>Profi: alle Kennzahlen je Szenario</summary><div class="vu-more-body">' +
      '<div class="vs-tbl"><span></span>' + p.scenarios.map(function (s) { return '<span>' + F.pct(s.annualReturn, 0) + '</span>'; }).join("") + '</div>' +
      [["Vermögen nominal", function (s) { return kT(s.nominal); }], ["in Kaufkraft", function (s) { return kT(s.real); }], ["davon eingezahlt", function (s) { return kT(s.invested); }],
        ["Entnahme / Monat", function (s) { return F.eur(s.monthlyIncomeReal); }], ["Zielerreichung", function (s) { return F.pct(s.goalAttainment, 0); }], ["Lücke / Monat", function (s) { return F.eur(s.gapMonthlyReal); }],
        ["Nötige Sparrate", function (s) { return s.requiredMonthly === null ? "–" : F.eur(s.requiredMonthly); }]].map(function (rw) {
        return '<div class="vs-tbl"><b>' + esc(rw[0]) + '</b>' + p.scenarios.map(function (s) { return '<span class="num' + (s.id === "basis" ? " is-hi" : "") + '">' + rw[1](s) + '</span>'; }).join("") + '</div>'; }).join("") +
      '<p class="vu-xs vu-mu" style="margin-top:6px">Vermögen in Tsd. € mit ' + p.input.targetAge + ' · nötige Sparrate für 100 % Ziel · Beispielrechnung</p>' +
      '<h3 class="vu-mt" style="font-size:16px;margin-top:16px">Wie sicher ist das Ziel?</h3><div class="vs-row-sb" style="margin-top:8px;justify-content:flex-start">' + VS.verdict("none") + '<span class="vu-sm">Wir rechnen feste Szenarien, keine Wahrscheinlichkeiten.</span></div>' +
      '<p class="vu-xs vu-mu" style="margin-top:8px">Zur Einordnung der Schwankung: In ' + prob.paths.toLocaleString("de-DE") + ' simulierten Verläufen mit 15 % Schwankung lag das Endvermögen (nominal) zwischen ' + F.eurK(prob.percentiles ? prob.percentiles.p10 : null) + ' und ' + F.eurK(prob.percentiles ? prob.percentiles.p90 : null) + ' (10.–90. Perzentil, feste Saat). Das ist eine Spanne, keine Wahrscheinlichkeit für dein Ziel.</p>' +
      '<h3 class="vu-mt" style="font-size:16px;margin-top:16px">Formel</h3><div class="vu-box vs-mono" style="margin-top:8px">V(t+1) = V(t) · (1 + r − k) + 12 · Rate<br>Kaufkraft = V / (1 + i)^t</div>' +
      '<p class="vu-xs vu-mu" style="margin-top:8px">Monatliche Verzinsung, Sparrate am Monatsende, Kosten als laufender Abzug. Entnahme mit gleichbleibender Kaufkraft über ' + p.input.payoutYears + ' Jahre; modellierte Entnahme, keine garantierte Rente. Steuern und Sozialabgaben nicht berücksichtigt.</p></div></details>';
    VS.lineChart(out.querySelector("#vs-plan-chart"), paths, { height: 180, padL: 64, label: "Vermögensverlauf je Szenario in heutiger Kaufkraft", zero: true, fmtY: function (v) { return F.eurK(v); }, fmtX: function (v) { return Math.round(v) + " J."; }, fmtTipX: function (v) { return "Alter " + Math.round(v); } });
  }
  function row(label, cells) { return '<tr><td>' + esc(label) + '</td>' + cells.map(function (c) { return '<td class="num">' + c + '</td>'; }).join("") + '</tr>'; }
  VS.row = row;

  function drawGap(out) {
    var pl = VS.state.plan;
    var g = M.retirementGap(Object.assign({}, pl, { annualReturn: pl.returns.basis }));
    out.innerHTML = '<div class="vs-card"><p class="vs-label">Vorsorgelücke</p><div class="vs-grid g3" style="margin-top:10px">' +
      '<div><p class="vs-sub">Wunscheinkommen − erwartete Einkünfte</p><p class="vs-kpi">' + F.eur(g.gapMonthlyReal) + '</p><p class="vs-fine">pro Monat, heutige Kaufkraft · zum Rentenbeginn nominal ' + F.eur(g.gapMonthlyNominalAtRetirement) + '</p></div>' +
      '<div><p class="vs-sub">Benötigtes Kapital</p><p class="vs-kpi">' + F.eurK(g.requiredCapitalReal) + '</p><p class="vs-fine">heutige Kaufkraft · nominal ' + F.eurK(g.requiredCapitalNominal) + '</p></div>' +
      '<div><p class="vs-sub">Benötigte Sparrate ab heute</p><p class="vs-kpi">' + (g.starts[0].monthly === null ? "–" : F.eur(g.starts[0].monthly)) + '</p><p class="vs-fine">pro Monat bei ' + F.pct(g.annualReturn, 1) + ' p.a. vor Kosten</p></div></div>' +
      '<h3 style="margin-top:22px">Was kostet Warten?</h3><div class="vs-grid g3" style="margin-top:10px">' + g.starts.map(function (s, i) {
        return '<div class="vs-card ' + (i === 0 ? "app" : "soft") + '"><p class="vs-label">' + (s.delayYears === 0 ? "Start heute" : "Start in " + s.delayYears + " Jahren") + '</p><p class="vs-kpi small">' + (s.possible ? F.eur(s.monthly) + ' <span class="vs-sub">/ Monat</span>' : "nicht möglich") + '</p>' +
          '<p class="vs-fine">' + (s.possible ? s.years + " Jahre Sparzeit · insgesamt " + F.eurK(s.totalPaid) + " eingezahlt" : "Start läge nach dem Rentenbeginn.") + '</p></div>';
      }).join("") + '</div>' +
      (g.delayCost ? '<div class="vs-note" style="margin-top:14px">Fünf Jahre später anfangen heißt: <b>' + F.eur(g.delayCost) + ' mehr pro Monat</b> für dasselbe Ziel.</div>' : "") +
      '<p class="vs-fine" style="margin-top:12px">Die gesetzliche Rente und andere Einkünfte gibst du selbst ein (z. B. aus deiner Renteninformation). Vision Universe schätzt sie nicht.</p></div>';
  }

  /* ============================================================== KOSTEN */
  VS.views.kosten = function (r) {
    var pl = VS.state.plan;
    // Kostenquote aus ETF-Detail oder Portfolio uebernehmen (?ter=0.07 in Prozent) - nur laufende Produktkosten.
    var terQ = r && r.query && r.query.ter && isFinite(Number(r.query.ter)) ? Number(r.query.ter) : null;
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Kostenanalyse</p><h1>Was kosten mich Gebühren wirklich?</h1><p class="vs-lead">Ein Prozentpunkt klingt nach wenig. Über Jahrzehnte frisst er durch den Zinseszins einen großen Teil des Vermögens.</p></section>' +
      '<section class="vs-section"><div class="vs-grid side"><form class="vs-card app" id="vs-fee-form"><p class="vs-label">Annahmen</p><div class="vs-form" style="margin-top:12px">' +
      VS.field("start", "Startkapital", pl.start, { min: 0, unit: "€" }) + VS.field("monthly", "Sparrate", pl.monthly, { min: 0, unit: "€ / Monat" }) +
      VS.field("years", "Laufzeit", Math.max(1, pl.targetAge - pl.age), { min: 1, max: 70, unit: "Jahre" }) + VS.field("ret", "Rendite vor Kosten", (pl.returns.basis * 100).toFixed(1), { step: 0.5, unit: "% p.a." }) +
      VS.field("ca", terQ !== null ? "Kosten A (übernommen)" : "Kosten A", terQ !== null ? terQ.toFixed(2) : "0.20", { step: 0.01, min: 0, unit: terQ !== null ? "% p.a. laufende Produktkosten (Prospekt)" : "% p.a. (z. B. ETF)" }) + VS.field("cb", "Kosten B", "1.50", { step: 0.05, min: 0, unit: "% p.a. (z. B. aktiver Fonds, Versicherung)" }) +
      '</div></form><div id="vs-fee-out"></div></div></section>');
    var form = root.querySelector("#vs-fee-form"), sent = false;
    function draw() {
      var n = function (id, f, s) { return VS.readNum(form, id, f, s); };
      var inp = { start: n("start", 0), monthly: n("monthly", 0), years: n("years", 30), annualReturn: n("ret", 5, 0.01), costA: n("ca", 0.2, 0.01), costB: n("cb", 1.5, 0.01) };
      var r = M.feeImpact(inp);
      if (!sent) { VS.analytics.track("cost_simulation", { years: inp.years }); sent = true; }
      var pts = function (c) { var a = []; for (var y = 0; y <= inp.years; y++) a.push([y, M.futureValue({ start: inp.start, monthly: inp.monthly, years: y, annualReturn: inp.annualReturn, annualCost: c }).nominal]); return a; };
      var out = root.querySelector("#vs-fee-out");
      out.innerHTML = '<div class="vs-card"><div class="vs-grid g2">' + [["A", r.a], ["B", r.b]].map(function (x) {
        return '<div class="vs-card soft"><p class="vs-label">Kosten ' + x[0] + ' · ' + F.pct(x[1].annualCost, 2) + '</p><p class="vs-kpi">' + F.eurK(x[1].endValue) + '</p>' +
          '<div class="vs-row"><span>Kosten absolut</span><span class="num">' + F.eur(x[1].costsAbsolute) + '</span></div>' +
          '<div class="vs-row"><span>Kosten relativ zum kostenfreien Vermögen</span><span class="num">' + F.pct(x[1].costsRelative, 1) + '</span></div>' +
          '<div class="vs-row"><span>direkt gezahlte Gebühren</span><span class="num">' + F.eur(x[1].directFees) + '</span></div>' +
          '<div class="vs-row"><span>entgangener Zinseszins</span><span class="num">' + F.eur(x[1].lostCompounding) + '</span></div></div>';
      }).join("") + '</div><div class="vs-note" style="margin-top:14px">Unterschied nach ' + inp.years + ' Jahren: <b>' + F.eur(r.difference) + '</b>. Ohne jede Kosten wären es ' + F.eur(r.withoutCosts) + '.</div>' +
        '<div id="vs-fee-chart" style="margin-top:14px"></div><p class="vs-fine" style="margin-top:10px">Kosten werden monatlich anteilig vom Vermögen abgezogen. "Entgangener Zinseszins" ist die Rendite, die die gezahlten Gebühren selbst noch erwirtschaftet hätten.</p></div>';
      VS.lineChart(out.querySelector("#vs-fee-chart"), [{ label: "Kosten A", points: pts(inp.costA) }, { label: "Kosten B", points: pts(inp.costB) }],
        { label: "Vermögen mit Kosten A und B", zero: true, fmtY: function (v) { return F.eurK(v); }, fmtX: function (v) { return "J. " + Math.round(v); }, fmtTipX: function (v) { return "Jahr " + Math.round(v); } });
    }
    form.addEventListener("input", draw); draw();
  };

  /* ============================================================= MONITOR */
  /* V08 (Redesign 2027): oben das eine Urteil „auf Kurs?“, die stärkste Stellschraube, danach Portfolio,
     Bestandsänderungen und Kostenänderungen als Zeilen mit Urteil. Ohne Plan: ehrlicher Leerzustand. */
  /** Richtung einer Änderungszeile aus ihrem Text: „a % → b %“ oder „(±x Prozentpunkte)“. */
  VS.changeDirection = function (text) {
    var t = String(text || ""), m = t.match(/(-?\d+(?:\.\d{3})*(?:,\d+)?)\s*%\s*→\s*(-?\d+(?:\.\d{3})*(?:,\d+)?)\s*%/);
    var n = function (x) { return Number(x.replace(/\./g, "").replace(",", ".")); };
    if (m) { var a = n(m[1]), b = n(m[2]); return b > a ? 1 : b < a ? -1 : 0; }
    if (/neu unter|aufgenommen|neu im/i.test(t)) return 1;
    if (/nicht mehr unter|entfernt|verkauft/i.test(t)) return -1;
    return 0;
  };
  function changeRow(f, kindUp, kindDown) {
    var d = VS.changeDirection(f.text), txt = String(f.text || "").replace(/\s*\([^)]*Prozentpunkte\)\.?$/, "").replace(/^[A-Z0-9.]+ · /, "").replace(/\s*\(Prospekt[^)]*\)\.?$/, "");
    var v = d > 0 ? VS.verdict(kindUp[0], kindUp[1]) : d < 0 ? VS.verdict(kindDown[0], kindDown[1]) : VS.verdict("mid", "geändert");
    return '<a class="vs-kv vs-chrow" href="#/etf/' + encodeURIComponent(f.symbol) + '?tab=aenderungen">' + VS.logo(f.symbol) + '<span class="vu-sm"><b>' + esc(txt) + '</b></span>' + v + '</a>';
  }
  VS.views.monitor = function () {
    var U = VS.U, p = VS.currentPlan(), base = p.scenarios[1], snap = VS.state.snapshot, sp = VS.state.sparplan, done = VS.state.planDone;
    var track = V.Monitor.onTrack(done ? base.goalAttainment : null);
    var lever = M.leverAnalysis(VS.state.plan, VS.state.plan.returns.basis).levers[0];
    var top = done ? '<div class="vu-box vu-box--ink vs-result"><div class="vs-row-sb"><span class="vu-ltag" style="color:#8a8a8a">Dein Plan · gespeichert ' + F.date(snap && snap.at) + '</span>' + VS.trackVerdict(track) + '</div>' +
        '<p class="vs-big num">' + F.pct(base.goalAttainment, 0) + '</p><p class="vu-sm">deines Ziels bei ' + F.pct(base.annualReturn, 0) + ' pro Jahr (Beispielrechnung)</p></div>' +
        VS.sect("Stärkste Stellschraube") + '<a class="vu-box vu-box--lime vs-row-sb" href="#/plan" style="text-decoration:none;flex-wrap:nowrap"><span><b>' + esc(lever.label) + '</b><span class="vu-sm" style="display:block">bringt dich ' + Math.round(lever.delta * 100) + ' %-Punkte näher ans Ziel</span></span>' + U.glyph("next", 18) + '</a>'
      : '<div class="vu-box vs-noplan"><div>' + VS.verdict("none", "Noch kein Plan") + '</div><h2 class="vu-mt" style="margin-top:12px">Ohne Plan kein Kurs.</h2><p class="vu-sm vu-mu" style="margin-top:8px">Speichere einen Plan im Planer. Dann zeigen wir hier, ob du auf Kurs bist und was sich ändert.</p>' +
        '<a class="vu-btn vu-btn--block" href="#/start" style="margin-top:14px">10-Euro-Sparplan starten</a><a class="vu-btn vu-btn--line vu-btn--block" href="#/plan" style="margin-top:8px">Zum Planer</a></div>';
    var spCard = sp ? VS.sect("Dein Sparplan") + '<a class="vu-box vs-kvbox" href="#/start/6" style="display:block;text-decoration:none;color:inherit">' + [["Sparrate", F.eur(sp.amount) + " im Monat"], ["Index", sp.index], ["Form", sp.form === "avd" ? "Altersvorsorgedepot" : "Freier Sparplan"], ["Angelegt", F.date(sp.saved)]].map(function (x) {
        return '<span class="vs-kv"><span class="vu-sm"><b>' + esc(x[0]) + '</b></span><span class="vu-sm">' + esc(x[1]) + '</span></span>'; }).join("") + '</a>' : "";
    var root = VS.render(VS.intro("Bin ich auf Kurs?", "Was sich seit deinem letzten Stand verändert hat.") + '<div style="margin-top:14px">' + top + '</div>' + spCard +
      (done ? '<section id="vs-mon-portfolio">' + VS.sect("Dein Portfolio", "#/portfolio", "X-Ray") + '<div class="vs-loading">…</div></section>' : "") +
      '<section id="vs-mon-holdings">' + VS.sect(done ? "In deinen ETFs" : "Bis dahin: Änderungen bei Kern-ETFs") + '<div class="vs-loading">…</div></section>' +
      '<section id="vs-mon-changes">' + VS.sect("Kosten von Produkten") + '<div class="vs-loading">…</div></section>' +
      VS.sect("Bei Änderungen benachrichtigen") + '<div class="vu-box" id="vs-mon-push"><p class="vu-sm vu-mu">Benachrichtigungen kommen über die App.</p></div>' +
      '<details class="vu-more" id="vs-mon-plan"><summary>Was hat sich bei dir verändert?</summary><div class="vu-more-body"><div class="vs-loading">…</div></div></details>' +
      '<details class="vu-more" id="vs-mon-more"><summary>Datenmeldungen und was nicht überwacht wird</summary><div class="vu-more-body"></div></details>');
    /* Z4: Schalter im Konto, zugestellt nur über die App (konto/push-settings.js, erst hier geladen). ETF-Änderungen
       sind noch keine Ereignisart: der Schalter bleibt gesperrt und sagt es; die Änderungen stehen auf dieser Seite. */
    var pp = global.__vuPushP || (global.__vuPushP = global.VUPush ? Promise.resolve() : new Promise(function (done) {
      var s = document.createElement("script"); s.src = "/konto/push-settings.js"; s.onload = s.onerror = function () { done(); }; document.head.appendChild(s); }));
    pp.then(function () { if (global.VUPush) global.VUPush.mount(root.querySelector("#vs-mon-push"), { keys: ["VORSORGE_CHANGE"], more: true }); });
    function evRow(e) { return '<div class="vs-kv"><span class="vu-sm">' + esc(e.text) + '</span></div>'; }
    VS.snapshotContext().then(function (ctx) {
      var d = snap ? V.Monitor.diffPlan(snap, V.Monitor.snapshotPlan(p, VS.state.portfolio, null, ctx)) : [];
      root.querySelector("#vs-mon-plan .vu-more-body").innerHTML = snap ? (d.length ? d.map(evRow).join("") : '<p class="vu-sm">Keine Veränderung gegenüber deinem gespeicherten Stand.</p>') : '<p class="vu-sm">Speichere einen Plan, dann vergleicht der Monitor Plan, Portfolio, Regelversionen und Datenstand.</p>';
    });
    Promise.all([VS.getJSON("/vorsorge/data/changes.json"), VS.master().catch(function () { return null; })]).then(function (res) {
      var c = res[0], mineSym = {};
      VS.state.watchlist.concat(VS.state.portfolio.map(function (x) { return x.symbol; })).forEach(function (s) { mineSym[String(s).toUpperCase()] = 1; });
      var cost = c.events.filter(function (e) { return e.type === "COST_CHANGE" && e.symbol; }).sort(function (a, b) { return (mineSym[b.symbol] ? 1 : 0) - (mineSym[a.symbol] ? 1 : 0); });
      var other = c.events.filter(function (e) { return e.type !== "COST_CHANGE" || !e.symbol; });
      root.querySelector("#vs-mon-changes").innerHTML = VS.sect("Kosten von Produkten") + (cost.length ? '<div class="vu-box vs-kvbox">' + cost.slice(0, 6).map(function (e) {
        var dir = VS.changeDirection(e.text), m = String(e.text).match(/(\d+(?:,\d+)?\s*%\s*→\s*\d+(?:,\d+)?\s*%)/);
        return '<a class="vs-kv" href="#/etf/' + encodeURIComponent(e.symbol) + '?tab=kosten"><span class="vu-sm"><b>' + esc(e.symbol) + '</b> ' + esc(m ? m[1] : e.text) + (mineSym[e.symbol] ? ' · dein ETF' : "") + '</span>' + (dir > 0 ? VS.verdict("weak", "teurer") : dir < 0 ? VS.verdict("strong", "günstiger") : VS.verdict("mid", "geändert")) + '</a>';
      }).join("") + '</div>' : U.blank("Keine Kostenänderungen gegenüber dem vorherigen Datenstand.")) +
        VS.help("Kostenquote laut Prospekt, brutto. Stand " + F.date(c.asOf) + ". Neue Prospekte prüfen wir automatisch.");
      root.querySelector("#vs-mon-more .vu-more-body").innerHTML = (other.length ? other.map(evRow).join("") : '<p class="vu-sm">Keine weiteren Meldungen.</p>') +
        '<p class="vu-ltag" style="margin-top:12px">Noch nicht überwacht</p>' + (V.Monitor.UNMONITORED || c.unmonitored || []).map(function (u) { return '<div class="vs-kv"><span class="vu-sm"><b>' + esc(u.label) + '</b></span><span class="vu-xs vu-mu" style="text-align:right">' + esc(u.reason) + '</span></div>'; }).join("");
    }).catch(function () { root.querySelector("#vs-mon-changes").innerHTML = VS.sect("Kosten von Produkten") + U.blank("Die Änderungsliste konnte nicht geladen werden."); });
    VS.holdingsFeed().then(function (hi) {
      var mine = {}; (done ? VS.state.watchlist.concat(VS.state.portfolio.map(function (x) { return x.symbol; })) : ["URTH", "EEM", "SPY"]).forEach(function (s) { mine[String(s).toUpperCase()] = 1; });
      var list = (hi.feed || []).filter(function (f) { return mine[f.symbol]; });
      root.querySelector("#vs-mon-holdings").innerHTML = VS.sect(done ? "In deinen ETFs" : "Bis dahin: Änderungen bei Kern-ETFs") +
        (list.length ? '<div class="vs-chrows">' + list.slice(0, 8).map(function (f) { return changeRow(f, ["mid", "gestiegen"], ["mid", "gesunken"]); }).join("") + '</div>' : U.blank("Keine relevanten Bestandsänderungen bei diesen ETFs.")) +
        '<p class="vu-xs vu-mu" style="margin-top:6px">Bestände laut Quartalsmeldungen, Quartale ' + esc((hi.quarters || []).join(", ")) + '</p>';
    }).catch(function () { root.querySelector("#vs-mon-holdings").innerHTML = VS.sect("In deinen ETFs") + U.blank("Die Bestandsänderungen konnten nicht geladen werden."); });
    if (done) Promise.all([VS.master(), VS.seriesFor(VS.state.portfolio.map(function (x) { return x.symbol; }))]).then(function (res) {
      var m = res[0], x = V.XRay.portfolioXRay(VS.state.portfolio, m._bySymbol, res[1].series, { regionLabels: VS.REGION });
      var y1 = x.performance && x.performance.windows["1Y"].value;
      root.querySelector("#vs-mon-portfolio").innerHTML = VS.sect("Dein Portfolio", "#/portfolio", "X-Ray") + '<div class="vu-box vs-kvbox">' +
        [["Schwankung", F.pct(x.risk && x.risk.volatility.value)], ["Größter Rückgang", F.spct(x.risk && x.risk.maxDrawdown.value)], ["Letzte 12 Monate", VS.chg(y1, 1)], ["Nicht in Euro", F.pct(x.fxExposure.share, 0)]].map(function (k) {
          return '<div class="vs-kv"><span class="vu-sm"><b>' + k[0] + '</b></span><b class="num">' + k[1] + '</b></div>'; }).join("") + '</div>' +
        '<p class="vu-xs vu-mu" style="margin-top:6px">' + VS.state.portfolio.map(function (q) { return esc(q.symbol) + " " + F.pct(q.weight, 0); }).join(" · ") + '</p>';
    }).catch(function () { root.querySelector("#vs-mon-portfolio").innerHTML = VS.sect("Dein Portfolio") + U.blank("ETF-Daten nicht erreichbar."); });
  };


})(window);
