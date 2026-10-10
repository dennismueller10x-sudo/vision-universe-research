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

  function attachSearch(root, master) {
    var input = root.querySelector("#vs-q"), box = root.querySelector("#vs-suggest");
    if (!input) return;
    var timer = null;
    function show() {
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
    input.addEventListener("input", show);
    root.querySelector("#vs-search-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var q = input.value.trim(); if (!q) return;
      var hint = ROUTE_HINTS.filter(function (h) { return h[0].test(q); })[0];
      var exact = master.find(q);
      VS.go(exact ? VS.etfHref(exact) : hint ? hint[1] : "#/etfs?q=" + encodeURIComponent(q));
    });
    document.addEventListener("click", function (ev) { if (!box.contains(ev.target) && ev.target !== input) box.innerHTML = ""; });
  }
  VS.attachSearch = attachSearch;

  VS.views.home = function () {
    var p = VS.currentPlan(), base = p.scenarios[1];
    var track = V.Monitor.onTrack(VS.state.planDone ? base.goalAttainment : null);
    var lever = M.leverAnalysis(VS.state.plan, VS.state.plan.returns.basis).levers[0];
    var fee = M.feeImpact({ start: VS.state.plan.start, monthly: VS.state.plan.monthly, years: p.years, annualReturn: VS.state.plan.returns.basis, costA: 0.002, costB: 0.015 });
    var root = VS.render(
      '<section class="vs-hero vs-product-hero vu-product-hero vu-hero-fidelity" data-product="vorsorge" aria-labelledby="vs-product-title"><div class="vu-hero-scene" aria-hidden="true"></div><span class="vu-product-icon vu-product-icon--hero" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/product-icons.svg#vorsorge"></use></svg></span>' +
      '<p class="vu-hero-name">Vorsorge</p><h1 class="vu-hero-headline" id="vs-product-title">Plane deine Zukunft.<br>Verstehe deine ETFs.</h1>' +
      '<p class="vu-hero-description">ETFs verstehen. Dein Portfolio durchleuchten. Veränderungen erkennen. Mit amtlichen Daten, offener Datenabdeckung und ohne Produktverkauf.</p>' +
      '<form id="vs-search-form" class="vs-search" role="search"><svg class="vs-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4.5 4.5"></path></svg><input id="vs-q" autocomplete="off" placeholder="ETF, Ziel oder Frage eingeben …" aria-label="ETF, Ziel oder Frage eingeben"><button type="submit">Suchen</button></form>' +
      '<div class="vs-suggest" id="vs-suggest"></div>' +
      '<nav class="vs-tabs vs-hero-actions" aria-label="Vorsorge-Bereiche"><a class="vs-pill primary" href="#/plan">Planen</a><a class="vs-pill" href="#/etfs">ETFs</a><a class="vs-pill" href="#/portfolio">Portfolio</a></nav>' +
      '<p class="vs-hero-more"><a href="#/vergleichen">Vergleichen</a><a href="#/foerderung">Förderung</a><a href="#/monitor">Veränderungen</a><a href="#/wissen">Wissen</a></p></section>' +

      '<section class="vs-section" aria-label="So gehst du vor"><div class="vs-steps">' + [["#/plan", "Planen"], ["#/etfs", "ETFs entdecken"], ["#/etf/VT", "ETF verstehen"], ["#/portfolio", "Portfolio durchleuchten"], ["#/monitor", "Veränderungen erkennen"]].map(function (x, i) {
        return '<a class="vs-step" href="' + x[0] + '"><b>' + (i + 1) + '</b><span>' + x[1] + '</span></a>'; }).join("") + '</div><p class="vs-fine" style="margin-top:8px">Nichts davon ist Pflicht. Jeder Schritt funktioniert für sich.</p></section>' +
      '<section class="vs-section"><div class="vs-grid g2">' +
      '<a class="vs-card app link" href="#/plan"><span class="vs-num-badge">1</span><p class="vs-label">Dein Plan</p>' +
      (VS.state.planDone ? '<p class="vs-light ' + track.state + '" style="margin-top:8px"><i></i>' + esc(track.label) + '</p>' +
        '<div class="vs-progress" aria-label="Zielerreichung"><i style="width:' + Math.min(100, base.goalAttainment * 100).toFixed(0) + '%"></i></div>' +
        '<p class="vs-sub" style="margin-top:10px">Zielerreichung im Basisszenario: <b style="color:var(--app-ink)">' + F.pct(base.goalAttainment, 0) + '</b> · Vermögen mit ' + p.input.targetAge + ' in heutiger Kaufkraft: <b style="color:var(--app-ink)">' + F.eurK(base.real) + '</b></p>'
        : '<p class="vs-kpi small" style="margin-top:8px">Noch kein Plan gespeichert</p><p class="vs-sub" style="margin-top:8px">In zwei Minuten: Alter, Sparrate, Wunscheinkommen. Wir rechnen drei Szenarien.</p>' +
          '<div class="vs-progress" aria-label="Beispiel-Zielerreichung"><i style="width:' + Math.min(100, base.goalAttainment * 100).toFixed(0) + '%"></i></div>' +
          '<p class="vs-fine" style="margin-top:10px">Beispielrechnung mit Standardannahmen (' + p.input.age + ' Jahre, ' + F.eur(p.input.monthly) + ' im Monat, Ziel ' + F.eur(p.input.desiredIncome) + ' Einkommen): Zielerreichung ' + F.pct(base.goalAttainment, 0) + '.</p>' +
          '<span class="vs-pill lime" style="margin-top:16px">Eigenen Plan erstellen →</span>') +
      '</a>' +
      '<div class="vs-card" id="vs-home-world"><span class="vs-num-badge">2</span><p class="vs-label">Deine ETF-Welt</p><div class="vs-loading">ETF-Verzeichnis wird geladen …</div></div>' +
      '</div></section>' +

      '<section class="vs-section"><div class="vs-grid g3">' +
      '<div class="vs-card" id="vs-home-changes"><span class="vs-num-badge">3</span><p class="vs-label">Was hat sich verändert?</p><div class="vs-loading">…</div></div>' +
      '<a class="vs-card link" href="#/plan"><span class="vs-num-badge">4</span><p class="vs-label">Nächster Schritt</p><p class="vs-kpi small" style="margin-top:6px">' + esc(lever.label) + '</p>' +
      '<p class="vs-sub" style="margin-top:8px">Größter Hebel in deinem Plan: Zielerreichung ' + F.spct(lever.delta, 0) + '-Punkte. Gerechnet im Basisszenario, keine Empfehlung.</p></a>' +
      '<a class="vs-card link" href="#/kosten"><span class="vs-num-badge">5</span><p class="vs-label">Kosten</p><p class="vs-kpi small" style="margin-top:6px">' + F.eurK(fee.a.endValue - fee.b.endValue) + '</p>' +
      '<p class="vs-sub" style="margin-top:8px">So viel Unterschied machen 0,2 % statt 1,5 % laufende Kosten bei deinem Plan über ' + p.years + ' Jahre.</p></a>' +
      '</div></section>' +

      '<section class="vs-section"><div class="vs-card app"><span class="vs-num-badge">6</span><div class="vs-section-head"><div><p class="vs-label">Zielerreichung' + (VS.state.planDone ? "" : " · Beispielrechnung") + '</p><h2 style="margin-top:6px">Drei Szenarien statt einer Prognose</h2></div><a class="vs-pill lime" href="#/plan">Plan anpassen</a></div>' +
      '<div class="vs-scen">' + p.scenarios.map(function (s) {
        return '<div class="' + (s.id === "basis" ? "base" : "") + '"><p class="vs-label">' + esc(s.label) + ' · ' + F.pct(s.annualReturn, 0) + ' p.a.</p><p class="vs-kpi small">' + F.eurK(s.real) + '</p><p class="vs-fine">heutige Kaufkraft · Ziel ' + F.pct(s.goalAttainment, 0) + '</p></div>';
      }).join("") + '</div><p class="vs-fine" style="margin-top:12px">' + (VS.state.planDone ? "" : "Beispiel mit Standardannahmen – noch nicht deine Zahlen. ") + 'Annahmen, keine Vorhersage. Renditen nach Kosten von ' + F.pct(p.input.cost, 2) + ' und Inflation von ' + F.pct(p.input.inflation, 1) + '.</p></div></section>'
    );
    VS.master().then(function (m) {
      attachSearch(root, m);
      var world = root.querySelector("#vs-home-world");
      var core = ["URTH", "SPY", "EEM", "QQQ", "FEZ", "IWM"].map(function (s) { return m._bySymbol[s]; }).filter(Boolean);
      world.innerHTML = '<span class="vs-num-badge">2</span><p class="vs-label">Deine ETF-Welt</p><p class="vs-kpi small" style="margin-top:6px">' + m.counts.publicAnalysis.toLocaleString("de-DE") + ' Standard-ETFs</p>' +
        '<p class="vs-sub" style="margin:6px 0 10px">' + m.counts.listings.toLocaleString("de-DE") + ' Listings insgesamt · ' + m.counts.withHistory3Y.toLocaleString("de-DE") + ' mit ≥ 3 Jahren Kurshistorie · ' + m.counts.complex.toLocaleString("de-DE") + ' komplexe Produkte separat · Stand ' + F.date(m.asOf) + '</p>' +
        core.map(function (e) { return '<div class="vs-row"><span><a href="' + VS.etfHref(e) + '"><b style="color:var(--ink)">' + esc(e.symbol) + '</b></a> ' + esc(e.category) + '</span><span class="num ' + F.cls(e.m && e.m.p["1Y"]) + '">1J ' + F.spct(e.m && e.m.p["1Y"]) + '</span></div>'; }).join("") +
        '<div class="vs-tabs"><a class="vs-pill small primary" href="#/etfs">Alle ETFs</a><a class="vs-pill small" href="#/watchlist">Watchlist (' + VS.state.watchlist.length + ')</a></div>';
    }).catch(function () { root.querySelector("#vs-home-world").innerHTML = VS.pending("ETF-Verzeichnis nicht erreichbar", "Die ETF-Daten konnten nicht geladen werden. Planer und Rechner funktionieren weiter."); });
    Promise.all([VS.getJSON("/vorsorge/data/changes.json").catch(function () { return { events: [] }; }), VS.getJSON("/vorsorge/data/holdings/index.json").catch(function () { return null; }), VS.master().catch(function () { return null; })]).then(function (res) {
      var c = res[0], hi = res[1], m = res[2];
      var plan = VS.state.snapshot ? V.Monitor.diffPlan(VS.state.snapshot, V.Monitor.snapshotPlan(p, VS.state.portfolio)) : [];
      var mine = {}; VS.state.watchlist.concat(VS.state.portfolio.map(function (x) { return x.symbol; })).forEach(function (s) { var e = m && m.find(s); if (e) mine[e.symbol] = e; });
      var mineList = Object.keys(mine).map(function (k) { return mine[k]; });
      var changed = mineList.filter(function (e) { return e.holdingsChanges > 0; });
      var feed = hi ? hi.feed : [];
      var feedMine = feed.filter(function (f) { return mine[f.symbol]; });
      var lines = plan.map(function (x) { return esc(x.text); });
      if (mineList.length) lines.push(changed.length ? '<b>' + changed.length + ' deiner ' + mineList.length + ' ETFs</b> mit relevanten Bestandsänderungen: ' + changed.slice(0, 4).map(function (e) { return '<a href="' + VS.etfHref(e) + '?tab=aenderungen">' + esc(e.symbol) + '</a>'; }).join(", ") : "Keine relevanten Bestandsänderungen bei deinen " + mineList.length + " ETFs.");
      (feedMine.length ? feedMine : feed).slice(0, mineList.length ? 2 : 3).forEach(function (f) { lines.push('<a href="#/etf/' + encodeURIComponent(f.symbol) + '?tab=aenderungen"><b>' + esc(f.symbol) + '</b></a> ' + esc(f.text)); });
      // Produkt- und Kostenmeldungen nur zu eigenen ETFs - keine zufaelligen Exoten auf der Startseite
      c.events.filter(function (x) { return x.symbol && mine[x.symbol]; }).slice(0, 2).forEach(function (x) { lines.push(esc(x.text)); });
      root.querySelector("#vs-home-changes").innerHTML = '<span class="vs-num-badge">3</span><p class="vs-label">Was hat sich in deiner ETF-Welt geändert?</p>' +
        (lines.length ? lines.slice(0, 6).map(function (t) { return '<div class="vs-row"><span style="color:var(--ink)">' + t + '</span></div>'; }).join("")
          : '<p class="vs-sub" style="margin-top:8px">Keine Änderungen seit dem letzten Datenstand.</p>') +
        '<p class="vs-fine" style="margin-top:6px">Bestände: SEC N-PORT, Stand ' + (hi ? esc(hi.quarters.join(", ")) : "–") + ' · Kurse: Tiingo ' + F.date(c.asOf) + '</p>' +
        '<a class="vs-pill small" style="margin-top:10px" href="#/watchlist">Watchlist</a> <a class="vs-pill small" style="margin-top:10px" href="#/monitor">Monitor</a>';
    }).catch(function () { root.querySelector("#vs-home-changes").innerHTML = VS.pending("Änderungen nicht verfügbar", "Die Änderungsliste konnte nicht geladen werden."); });
  };

  /* ============================================================== PLANER */
  var started = false;
  VS.views.plan = function (r) {
    var tab = r.args[0] === "luecke" ? "luecke" : "planer";
    var pl = VS.state.plan;
    var root = VS.render(
      '<section class="vs-hero"><p class="vs-eyebrow">Vorsorgeplaner</p><h1>Wie viel muss ich sparen?</h1><p class="vs-lead">Gib ein, wo du stehst und was du willst. Wir rechnen drei Szenarien – nominal und in heutiger Kaufkraft.</p>' +
      '<div class="vs-tabs"><a class="vs-pill' + (tab === "planer" ? " primary" : "") + '" href="#/plan">Planer</a><a class="vs-pill' + (tab === "luecke" ? " primary" : "") + '" href="#/plan/luecke">Vorsorgelücke</a><a class="vs-pill" href="#/kosten">Kosten</a><a class="vs-pill" href="#/portfolio/szenarien">Szenarien</a></div></section>' +
      '<section class="vs-section"><div class="vs-grid side"><form class="vs-card app" id="vs-plan-form" novalidate><p class="vs-label">Deine Angaben</p><div class="vs-form" style="margin-top:12px">' +
      VS.field("age", "Aktuelles Alter", pl.age, { min: 0, max: 90, unit: "Jahre" }) + VS.field("targetAge", "Zielalter", pl.targetAge, { min: 1, max: 100, unit: "Rentenbeginn" }) +
      VS.field("start", "Startvermögen", pl.start, { min: 0, unit: "€" }) + VS.field("lumpSum", "Einmalanlage", pl.lumpSum, { min: 0, unit: "€ heute" }) +
      VS.field("monthly", "Monatliche Sparrate", pl.monthly, { min: 0, unit: "€ / Monat" }) + VS.field("cost", "Laufende Kosten", (pl.cost * 100).toFixed(2), { min: 0, max: 5, step: 0.05, unit: "% p.a. (TER + Depot)" }) +
      VS.field("inflation", "Inflation", (pl.inflation * 100).toFixed(1), { step: 0.1, unit: "% p.a." }) + VS.field("payoutYears", "Auszahldauer", pl.payoutYears, { min: 1, max: 50, unit: "Jahre" }) +
      VS.field("desiredIncome", "Wunscheinkommen im Alter", pl.desiredIncome, { min: 0, unit: "€ / Monat, heutige Kaufkraft" }) + VS.field("existingIncome", "Erwartete Rente & Einkünfte", pl.existingIncome, { min: 0, unit: "€ / Monat, heutige Kaufkraft" }) +
      VS.field("rk", "Rendite konservativ", (pl.returns.konservativ * 100).toFixed(1), { step: 0.5, unit: "% p.a. vor Kosten" }) + VS.field("rb", "Rendite Basis", (pl.returns.basis * 100).toFixed(1), { step: 0.5, unit: "% p.a." }) +
      VS.field("ro", "Rendite optimistisch", (pl.returns.optimistisch * 100).toFixed(1), { step: 0.5, unit: "% p.a." }) +
      '</div><button type="submit" class="vs-pill lime" style="margin-top:16px;width:100%;justify-content:center">Plan speichern</button><p class="vs-fine" style="margin-top:10px">Wird nur in diesem Browser gespeichert.</p></form>' +
      '<div id="vs-plan-out"></div></div></section>'
    );
    var form = root.querySelector("#vs-plan-form");
    function read() {
      var n = function (id, f, s) { return VS.readNum(form, id, f, s); };
      VS.state.plan = { age: n("age", 35), targetAge: n("targetAge", 67), start: n("start", 0), lumpSum: n("lumpSum", 0), monthly: n("monthly", 0),
        cost: n("cost", 0.3, 0.01), inflation: n("inflation", 2, 0.01), payoutYears: n("payoutYears", 25), desiredIncome: n("desiredIncome", 0), existingIncome: n("existingIncome", 0),
        returns: { konservativ: n("rk", 3, 0.01), basis: n("rb", 5, 0.01), optimistisch: n("ro", 7, 0.01) } };
      VS.save();
    }
    function draw() { (tab === "luecke" ? drawGap : drawPlan)(root.querySelector("#vs-plan-out")); }
    form.addEventListener("input", function () { if (!started) { VS.analytics.track("planner_start", {}); started = true; } read(); draw(); });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); read();
      var p = VS.currentPlan();
      VS.state.planDone = true; VS.state.snapshot = V.Monitor.snapshotPlan(p, VS.state.portfolio, new Date().toISOString().slice(0, 10)); VS.save();
      VS.snapshotContext().then(function (ctx) { VS.state.snapshot = V.Monitor.snapshotPlan(p, VS.state.portfolio, VS.state.snapshot.at, ctx); VS.save(); });
      VS.analytics.track("planner_complete", { years: p.years });
      var b = form.querySelector("button[type=submit]"); b.textContent = "✓ Gespeichert – im Monitor sichtbar"; setTimeout(function () { b.textContent = "Plan speichern"; }, 2500);
    });
    draw();
  };

  function drawPlan(out) {
    var p = VS.currentPlan(), pl = VS.state.plan;
    var paths = p.scenarios.map(function (s) {
      var pts = [];
      for (var y = 0; y <= p.years; y++) {
        var fv = M.futureValue({ start: pl.start, lumpSum: pl.lumpSum, monthly: pl.monthly, years: y, annualReturn: s.annualReturn, annualCost: pl.cost }).nominal;
        pts.push([p.input.age + y, M.inflationAdjustedValue(fv, y, pl.inflation)]);
      }
      return { label: s.label, points: pts, dash: s.id !== "basis" };
    });
    var base = p.scenarios[1];
    var prob = M.goalProbability({ start: pl.start, lumpSum: pl.lumpSum, monthly: pl.monthly, years: p.years, annualReturn: pl.returns.basis, annualCost: pl.cost, volatility: 0.15,
      target: M.inflate(base.requiredCapitalReal, p.years, pl.inflation), paths: 1500 });
    out.innerHTML =
      '<div class="vs-card"><div class="vs-section-head"><div><p class="vs-label">Ergebnis nach ' + p.years + ' Jahren</p><h2 style="margin-top:6px">' + F.eurK(base.real) + ' <span class="vs-sub" style="font-size:15px;font-weight:600">heutige Kaufkraft · Basis</span></h2></div>' +
      '<span class="vs-light ' + V.Monitor.onTrack(base.goalAttainment).state + '"><i></i>' + esc(V.Monitor.onTrack(base.goalAttainment).label) + '</span></div>' +
      '<div class="vs-table-wrap"><table class="vs-table" style="min-width:520px"><thead><tr><th scope="col">Kennzahl</th>' + p.scenarios.map(function (s) { return '<th scope="col">' + esc(s.label) + ' (' + F.pct(s.annualReturn, 1) + ')</th>'; }).join("") + '</tr></thead><tbody>' +
      row("Endvermögen nominal", p.scenarios.map(function (s) { return F.eur(s.nominal); })) +
      row("Endvermögen real (Kaufkraft heute)", p.scenarios.map(function (s) { return F.eur(s.real); })) +
      row("davon eingezahlt", p.scenarios.map(function (s) { return F.eur(s.invested); })) +
      row("Kaufkraftverlust durch Inflation", p.scenarios.map(function (s) { return F.eur(s.purchasingPowerLoss); })) +
      row("Modellierte Entnahme / Monat (heutige Kaufkraft, " + p.input.payoutYears + " J.)", p.scenarios.map(function (s) { return F.eur(s.monthlyIncomeReal); })) +
      row("Zielerreichung", p.scenarios.map(function (s) { return F.pct(s.goalAttainment, 0); })) +
      row("Verbleibende Lücke / Monat", p.scenarios.map(function (s) { return F.eur(s.gapMonthlyReal); })) +
      row("Nötige Sparrate fürs Ziel", p.scenarios.map(function (s) { return s.requiredMonthly === null ? "–" : F.eur(s.requiredMonthly); })) +
      '</tbody></table></div>' +
      '<h3 style="margin-top:22px">Vermögensverlauf in heutiger Kaufkraft</h3><div id="vs-plan-chart" style="margin-top:8px"></div>' +
      '<div class="vs-note" style="margin-top:16px"><b>Modellrechnung Schwankung:</b> Bei 15 % jährlicher Schwankung (grob ein breiter Aktien-ETF) erreichen in ' + prob.paths.toLocaleString("de-DE") + ' simulierten Verläufen <b>' + F.pct(prob.probability, 0) + '</b> das Kapitalziel von ' + F.eurK(M.inflate(base.requiredCapitalReal, p.years, pl.inflation)) + ' (nominal). Spanne (10 %–90 %): ' + F.eurK(prob.percentiles ? prob.percentiles.p10 : null) + ' bis ' + F.eurK(prob.percentiles ? prob.percentiles.p90 : null) + '. Feste Saat – gleiche Eingabe, gleiches Ergebnis.</div>' +
      '<p class="vs-fine" style="margin-top:12px">Rechenweg: monatliche Verzinsung, Sparrate am Monatsende, Kosten als laufender Abzug ((1+Rendite)×(1−Kosten)−1), Entnahme: gleichbleibende Kaufkraft über ' + p.input.payoutYears + ' Jahre, danach ist das Kapital aufgebraucht; das Restkapital bleibt in der Auszahlphase mit derselben Rendite nach Kosten und Inflation angelegt. Das ist eine modellierte Entnahme, keine garantierte Rente. Steuern und Sozialabgaben sind nicht berücksichtigt.</p></div>';
    VS.lineChart(out.querySelector("#vs-plan-chart"), paths, { label: "Vermögensverlauf je Szenario", zero: true, fmtY: function (v) { return F.eurK(v); }, fmtX: function (v) { return Math.round(v) + " J."; }, fmtTipX: function (v) { return "Alter " + Math.round(v); } });
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
  VS.views.monitor = function () {
    var p = VS.currentPlan(), base = p.scenarios[1], snap = VS.state.snapshot;
    var track = V.Monitor.onTrack(VS.state.planDone ? base.goalAttainment : null);
    var levers = M.leverAnalysis(VS.state.plan, VS.state.plan.returns.basis);
    var LBL = V.Monitor.CATEGORY_LABEL;
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Vorsorge-Monitor</p><h1>Bin ich auf Kurs?</h1><p class="vs-lead">Dein Plan, dein Portfolio und die Daten – mit allem, was sich seit deinem letzten gespeicherten Stand nachweislich verändert hat.</p></section>' +
      '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card app"><p class="vs-label">Status</p><p class="vs-light ' + track.state + '" style="margin-top:10px"><i></i>' + esc(track.label) + '</p>' +
      (VS.state.planDone ? '<div class="vs-progress"><i style="width:' + Math.min(100, base.goalAttainment * 100).toFixed(0) + '%"></i></div>' +
        '<div class="vs-row" style="margin-top:12px"><span>Zielerreichung (Basis)</span><span class="num">' + F.pct(base.goalAttainment, 0) + '</span></div>' +
        '<div class="vs-row"><span>Sparrate</span><span class="num">' + F.eur(p.input.monthly) + ' / Monat</span></div>' +
        '<div class="vs-row"><span>Nötige Sparrate fürs Ziel</span><span class="num">' + F.eur(base.requiredMonthly) + ' / Monat</span></div>' +
        '<div class="vs-row"><span>Kostenannahme</span><span class="num">' + F.pct(p.input.cost, 2) + ' p.a.</span></div>' +
        '<div class="vs-row"><span>Plan gespeichert am</span><span class="num">' + F.date(snap && snap.at) + '</span></div>'
        : '<p class="vs-sub" style="margin-top:10px">Noch kein Plan gespeichert. Ohne Plan zeigt der Monitor nur Daten- und Produktänderungen.</p><a class="vs-pill lime" style="margin-top:12px" href="#/plan">Zum Planer</a>') + '</div>' +
      '<div class="vs-card"><p class="vs-label">Welche Stellschraube wirkt am stärksten?</p><div style="margin-top:10px">' + levers.levers.map(function (l, i) {
        return '<div class="vs-row"><span>' + (i + 1) + '. ' + esc(l.label) + '</span><span class="num ' + F.cls(l.delta) + '">' + F.spct(l.delta, 0) + '-Pkt.</span></div>';
      }).join("") + '</div><p class="vs-fine" style="margin-top:8px">Veränderung der Zielerreichung im Basisszenario. Modellrechnung, keine Empfehlung.</p></div></div></section>' +
      '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card" id="vs-mon-plan"><p class="vs-label">Was hat sich bei dir verändert?</p><div class="vs-loading">…</div></div>' +
      '<div class="vs-card" id="vs-mon-portfolio"><p class="vs-label">Portfolio · Risiko & Allokation</p><div class="vs-loading">…</div></div></div></section>' +
      '<section class="vs-section"><div class="vs-card" id="vs-mon-holdings"><p class="vs-label">Bestandsänderungen deiner ETFs</p><div class="vs-loading">…</div></div></section>' +
      '<section class="vs-section"><div class="vs-card" id="vs-mon-changes"><p class="vs-label">Daten & Produkte – was hat sich verändert?</p><div class="vs-loading">…</div></div></section>');
    function evRow(e) { return '<div class="vs-row"><span style="color:var(--ink)">' + esc(e.text) + '</span><span class="vs-badge">' + esc(LBL[e.category] || e.category) + '</span></div>'; }
    VS.snapshotContext().then(function (ctx) {
      var d = snap ? V.Monitor.diffPlan(snap, V.Monitor.snapshotPlan(p, VS.state.portfolio, null, ctx)) : [];
      root.querySelector("#vs-mon-plan").innerHTML = '<p class="vs-label">Was hat sich bei dir verändert?</p><div style="margin-top:8px">' +
        (snap ? (d.length ? d.map(evRow).join("") : '<p class="vs-sub">Keine Veränderung gegenüber deinem gespeicherten Stand.</p>') : '<p class="vs-sub">Speichere einen Plan, dann vergleicht der Monitor Plan, Portfolio, Regelversionen und Datenstand.</p>') + '</div>';
    });
    Promise.all([VS.getJSON("/vorsorge/data/changes.json"), VS.master().catch(function () { return null; })]).then(function (res) {
      var c = res[0], m = res[1], mineSym = {};
      VS.state.watchlist.concat(VS.state.portfolio.map(function (x) { return x.symbol; })).forEach(function (s) { var e = m && m.find(s); if (e) mineSym[e.symbol] = 1; });
      // Prioritaet: eigene ETFs, dann Kosten, Fondsstatus, Produkt; Datenmeldungen (Pipeline) gebuendelt am Ende
      var RANK = { COST_CHANGE: 0, CLOSED_OR_DELISTED: 1, STATUS_CHANGE: 1, REMOVED: 1 };
      var rank = function (e) { return RANK[e.type] === undefined ? 2 : RANK[e.type]; };
      var prod = c.events.filter(function (e) { return e.category !== "DATA_UPDATE"; }), data = c.events.filter(function (e) { return e.category === "DATA_UPDATE"; });
      prod = prod.map(function (e, i) { return [e, i]; }).sort(function (a, b) { return (mineSym[b[0].symbol] ? 1 : 0) - (mineSym[a[0].symbol] ? 1 : 0) || rank(a[0]) - rank(b[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; });
      root.querySelector("#vs-mon-changes").innerHTML = '<p class="vs-label">Produkte & Kosten – was hat sich verändert? · Stand ' + F.date(c.asOf) + '</p><div style="margin-top:8px">' +
        (prod.length ? prod.slice(0, 20).map(function (e) { return mineSym[e.symbol] ? evRow(e).replace('<span class="vs-badge">', '<span class="vs-badge lime">Dein ETF · ') : evRow(e); }).join("") : '<p class="vs-sub">Keine Produkt- oder Kostenänderungen gegenüber dem vorherigen Datenstand.</p>') +
        (data.length ? '<details style="margin-top:10px"><summary class="vs-fine">Datenaktualisierungen (' + data.length + ')</summary>' + data.map(evRow).join("") + '</details>' : "") +
        '</div><h3 style="margin-top:16px">Noch nicht überwacht</h3><div style="margin-top:6px">' + (V.Monitor.UNMONITORED || c.unmonitored).map(function (u) { return '<div class="vs-row"><span>' + esc(u.label) + '</span><span class="vs-fine" style="text-align:right">' + esc(u.reason) + '</span></div>'; }).join("") +
        '<div class="vs-row"><span>Regulatorische Änderung</span><span class="vs-fine" style="text-align:right">Nur über neue Versionen der Förderregeln mit Quelle.</span></div></div>';
    }).catch(function () { root.querySelector("#vs-mon-changes").innerHTML = VS.pending("Änderungen nicht verfügbar", "Die Änderungsliste konnte nicht geladen werden."); });
    Promise.all([VS.master(), VS.getJSON("/vorsorge/data/holdings/index.json").catch(function () { return null; })]).then(function (res) {
      var m = res[0], hi = res[1], seen = {}, mine = [];
      VS.state.watchlist.concat(VS.state.portfolio.map(function (x) { return x.symbol; })).forEach(function (s) { var e = m.find(s); if (e && !seen[e.symbol]) { seen[e.symbol] = 1; mine.push(e); } });
      var feed = hi ? hi.feed : [];
      var head = '<p class="vs-label">Bestandsänderungen deiner ETFs' + (hi ? ' · Quartale ' + esc(hi.quarters.join(", ")) : "") + '</p><div style="margin-top:8px">';
      var body = mine.length ? mine.map(function (e) {
        var st = e.holdingsAsOf ? (e.holdingsChanges > 0 ? e.holdingsChanges + " relevante Änderung" + (e.holdingsChanges === 1 ? "" : "en") : "keine relevante Änderung") : "keine Bestandsdaten (nicht in SEC N-PORT)";
        return '<div class="vs-row"><span><a href="' + VS.etfHref(e) + (e.holdingsAsOf ? "?tab=aenderungen" : "") + '"><b style="color:var(--ink)">' + esc(e.symbol) + '</b></a> ' + esc(e.name || "") + '</span><span class="vs-fine" style="text-align:right">' + esc(st) + (e.holdingsAsOf ? " · Stand " + F.date(e.holdingsAsOf) : "") + '</span></div>';
      }).join("") : '<p class="vs-sub">Noch keine ETFs in Watchlist oder Portfolio. Auffällige Änderungen im gesamten Bestand:</p>' +
        feed.slice(0, 6).map(function (f) { return '<div class="vs-row"><span><a href="#/etf/' + encodeURIComponent(f.symbol) + '?tab=aenderungen"><b>' + esc(f.symbol) + '</b></a> ' + esc(f.text) + '</span></div>'; }).join("");
      root.querySelector("#vs-mon-holdings").innerHTML = head + body + '</div><p class="vs-fine" style="margin-top:8px">Quelle: SEC N-PORT (Quartalsberichte US-registrierter Fonds). Änderungen unter 0,25 Prozentpunkten zählen als Rauschen. Europäische ETFs: Bestände noch nicht angebunden.</p>';
    }).catch(function () { root.querySelector("#vs-mon-holdings").innerHTML = VS.pending("Bestandsänderungen nicht verfügbar", "Die Holdings-Übersicht konnte nicht geladen werden."); });
    Promise.all([VS.master(), VS.seriesFor(VS.state.portfolio.map(function (x) { return x.symbol; }))]).then(function (res) {
      var m = res[0], x = V.XRay.portfolioXRay(VS.state.portfolio, m._bySymbol, res[1].series, { regionLabels: VS.REGION });
      root.querySelector("#vs-mon-portfolio").innerHTML = '<p class="vs-label">Portfolio · Risiko & Allokation</p>' +
        '<div class="vs-row" style="margin-top:8px"><span>Positionen</span><span>' + VS.state.portfolio.map(function (p) { return esc(p.symbol) + " " + F.pct(p.weight, 0); }).join(" · ") + '</span></div>' +
        '<div class="vs-row"><span>Schwankung (p.a.)</span><span class="num">' + F.pct(x.risk && x.risk.volatility.value) + '</span></div>' +
        '<div class="vs-row"><span>Größter historischer Rückgang</span><span class="num down">' + F.pct(x.risk && x.risk.maxDrawdown.value) + '</span></div>' +
        '<div class="vs-row"><span>Kursentwicklung 1 Jahr</span><span class="num ' + F.cls(x.performance && x.performance.windows["1Y"].value) + '">' + F.spct(x.performance && x.performance.windows["1Y"].value) + '</span></div>' +
        '<div class="vs-row"><span>Nicht in Euro gehandelt</span><span class="num">' + F.pct(x.fxExposure.share, 0) + '</span></div>' +
        '<div style="margin-top:12px">' + VS.bars(x.assetClasses.map(function (a) { return { key: a.key, label: VS.ASSET[a.key] || a.key, weight: a.weight }; })) + '</div>' +
        '<a class="vs-pill small" style="margin-top:12px" href="#/portfolio">Portfolio-X-Ray öffnen</a>';
    }).catch(function () { root.querySelector("#vs-mon-portfolio").innerHTML = VS.pending("Portfolio nicht berechenbar", "ETF-Daten nicht erreichbar."); });
  };

})(window);
