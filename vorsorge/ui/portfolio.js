/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/portfolio.js
   Vorsorge-Portfolio: Strategiemodelle (Beispiel-Strukturen, keine Empfehlung), eigene
   Gewichtung, Portfolio-X-Ray, Overlap-Engine, Szenario-Lab.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, X = V.XRay, F = VS.fmt, esc = VS.esc;

  VS.views.portfolio = function (r) {
    var sub = r.args[0] === "szenarien" ? "szenarien" : "xray";
    if (r.query.add) {
      var s = r.query.add.toUpperCase();
      if (!VS.state.portfolio.some(function (p) { return p.symbol === s; })) { VS.state.portfolio.push({ symbol: s, weight: 0.1 }); VS.save(); }
    }
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Vorsorge-Portfolio</p><h1>Was steckt wirklich<br>in deinem Portfolio?</h1><p class="vs-lead">Wähle ein Strategiemodell als Beispiel-Struktur oder baue dein eigenes. Wir zeigen Regionen, Risiko, Kursverlauf, Konzentration und Überschneidungen – keine Kaufempfehlung.</p>' +
      '<div class="vs-tabs"><a class="vs-pill' + (sub === "xray" ? " primary" : "") + '" href="#/portfolio">Portfolio-X-Ray</a><a class="vs-pill' + (sub === "szenarien" ? " primary" : "") + '" href="#/portfolio/szenarien">Szenario-Lab</a></div></section>' +
      '<section class="vs-section"><div class="vs-section-head"><h2>Strategiemodelle</h2><p class="vs-sub">Beispiel-Strukturen zum Verstehen – keine Empfehlung</p></div><div class="vs-grid g4" id="vs-models"><div class="vs-loading">…</div></div></section>' +
      '<section class="vs-section"><div class="vs-grid side"><div class="vs-card app" id="vs-editor"></div><div id="vs-pf-out"><div class="vs-loading">Berechne …</div></div></div></section>');
    Promise.all([VS.master(), VS.getJSON("/vorsorge/data/model-portfolios.json")]).then(function (res) {
      var m = res[0], models = res[1];
      root.querySelector("#vs-models").innerHTML = models.portfolios.map(function (p) {
        var regions = {}; p.positions.forEach(function (x) { var e = m._bySymbol[x.symbol]; var k = e && e.region ? (VS.REGION[e.region] || e.region) : "nicht zugeordnet"; regions[k] = 1; });
        var vols = p.positions.map(function (x) { var e = m._bySymbol[x.symbol]; return e && e.m ? e.m.vol : null; }).filter(function (v) { return v !== null; });
        return '<button class="vs-card link" style="text-align:left;cursor:pointer;border:1px solid var(--line-soft)" data-model="' + esc(p.id) + '"><p class="vs-label">' + esc(p.label) + '</p><p style="margin-top:6px;font-size:14px">' + esc(p.idea) + '</p>' +
          '<div class="vs-row" style="margin-top:8px"><span>Bausteine</span><span>' + p.positions.length + '</span></div><div class="vs-row"><span>Regionen</span><span style="text-align:right">' + esc(Object.keys(regions).join(", ")) + '</span></div>' +
          '<div class="vs-row"><span>Schwankung der Bausteine</span><span>' + (vols.length ? F.pct(Math.min.apply(null, vols), 0) + "–" + F.pct(Math.max.apply(null, vols), 0) : "–") + '</span></div><div class="vs-row"><span>Kosten</span><span class="vs-fine">Quelle nicht angebunden</span></div>' +
          '<p class="vs-fine" style="margin-top:8px">' + p.positions.map(function (x) { return esc(x.symbol) + " " + F.pct(x.weight, 0); }).join(" · ") + '</p></button>';
      }).join("") + '<p class="vs-fine" style="grid-column:1/-1">' + esc(models.note) + '</p>';
      root.querySelectorAll("[data-model]").forEach(function (b) {
        b.onclick = function () { var p = models.portfolios.filter(function (x) { return x.id === b.dataset.model; })[0]; VS.state.portfolio = p.positions.map(function (x) { return { symbol: x.symbol, weight: x.weight }; }); VS.save(); editor(); compute(); };
      });
      function editor() {
        var el = root.querySelector("#vs-editor");
        el.innerHTML = '<p class="vs-label">Dein Portfolio</p><div style="margin-top:10px">' + VS.state.portfolio.map(function (p, i) {
          var e = m._bySymbol[p.symbol];
          return '<div class="vs-row" style="align-items:center"><span style="min-width:0"><a href="#/etf/' + esc(p.symbol) + '" style="color:var(--app-ink);font-weight:800">' + esc(p.symbol) + '</a> <span class="vs-fine">' + esc(e ? e.category : "nicht im Verzeichnis") + '</span></span>' +
            '<span style="display:flex;gap:6px;align-items:center"><input aria-label="Gewicht ' + esc(p.symbol) + '" data-i="' + i + '" type="number" min="0" max="100" step="1" value="' + Math.round(p.weight * 100) + '" style="width:70px;border-radius:10px;border:1px solid var(--app-line);background:var(--app-2);color:var(--app-ink);padding:8px;font-size:16px"> %<button data-del="' + i + '" aria-label="' + esc(p.symbol) + ' entfernen" style="background:none;border:0;color:var(--app-muted);cursor:pointer;font-size:18px;padding:4px">×</button></span></div>';
        }).join("") + '</div><form id="vs-add" style="margin-top:12px;display:flex;gap:8px"><input id="vs-add-q" placeholder="ETF hinzufügen" autocomplete="off" aria-label="ETF hinzufügen" style="flex:1;min-width:0;border-radius:12px;border:1px solid var(--app-line);background:var(--app-2);color:var(--app-ink);padding:10px;font-size:16px"><button class="vs-pill lime small" type="submit">+</button></form><div class="vs-suggest" id="vs-add-s"></div>' +
          '<p class="vs-fine" style="margin-top:10px">Gewichte werden auf 100 % normiert. Summe: ' + Math.round(VS.state.portfolio.reduce(function (a, p) { return a + p.weight; }, 0) * 100) + ' %</p>';
        el.querySelectorAll("input[data-i]").forEach(function (inp) { inp.addEventListener("change", function () { VS.state.portfolio[+inp.dataset.i].weight = Math.max(0, (+inp.value || 0) / 100); VS.save(); editor(); compute(); }); });
        el.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { VS.state.portfolio.splice(+b.dataset.del, 1); VS.save(); editor(); compute(); }; });
        var q = el.querySelector("#vs-add-q"), box = el.querySelector("#vs-add-s");
        function add(sym) { if (!VS.state.portfolio.some(function (p) { return p.symbol === sym; })) VS.state.portfolio.push({ symbol: sym, weight: 0.1 }); VS.save(); editor(); compute(); }
        q.addEventListener("input", function () {
          var res = V.Master.search(m.etfs.filter(function (e) { return e.consumerVisible; }), q.value, 6);
          box.innerHTML = res.length ? '<ul>' + res.map(function (e) { return '<li><a href="#" data-add="' + esc(e.symbol) + '" style="color:var(--ink)"><span><b>' + esc(e.symbol) + '</b> · ' + esc(e.name) + '</span></a></li>'; }).join("") + '</ul>' : "";
          box.querySelectorAll("[data-add]").forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); add(a.dataset.add); }; });
        });
        el.querySelector("#vs-add").addEventListener("submit", function (ev) { ev.preventDefault(); var hit = V.Master.search(m.etfs, q.value, 1)[0]; if (hit) add(hit.symbol); });
      }
      function compute() {
        var out = root.querySelector("#vs-pf-out");
        if (!VS.state.portfolio.length) { out.innerHTML = VS.pending("Leeres Portfolio", "Wähle ein Strategiemodell oder füge ETFs hinzu."); return; }
        out.innerHTML = '<div class="vs-loading">Berechne …</div>';
        VS.seriesFor(VS.state.portfolio.map(function (p) { return p.symbol; })).then(function (s) {
          (sub === "szenarien" ? drawScenarios : drawXRay)(out, m, s);
        });
      }
      editor(); compute();
    }).catch(function (e) { root.querySelector("#vs-models").innerHTML = VS.pending("Daten nicht erreichbar", String(e.message || e)); });
  };

  function drawXRay(out, m, s) {
    var holdings = {}; Object.keys(s.details).forEach(function (k) { var h = s.details[k].holdings; if (X.validHoldings(h)) holdings[k] = h; });
    var x = X.portfolioXRay(VS.state.portfolio, m._bySymbol, s.series, { regionLabels: VS.REGION, baseCurrency: "EUR", holdingsBySymbol: holdings });
    VS.analytics.track("portfolio_xray", { positions: x.positions.length });
    var lt = X.lookThrough(x.positions, holdings);
    var pairs = [];
    for (var i = 0; i < x.positions.length; i++) for (var j = i + 1; j < x.positions.length; j++) pairs.push(X.overlap(holdings[x.positions[i].symbol], holdings[x.positions[j].symbol]));
    var hist = x.series.status === "CALCULATED" ? (Date.parse(x.series.to) - Date.parse(x.series.from)) / (365.25 * 864e5) : 0;
    var x2 = X.portfolioXRay(VS.state.portfolio, m._bySymbol, s.series, { holdingsBySymbol: holdings });
    var STATE = { FULL_DATA: ["Vollständige Daten", "Kurse und Holdings für alle Positionen."], PARTIAL_DATA: ["Teilweise Daten", "Holdings nur für einen Teil der Positionen."],
      PRICE_ONLY_DATA: ["Nur Kursdaten", "Berechnet aus Kursreihen und Stammdaten: Schwankung, Rückgang, Gleichlauf, Assetklassen, Regionen laut Fondsname, Handelswährung. Nicht berechenbar ohne Holdings: Länder- und Branchengewichte, Top-Unternehmen, Overlap."],
      NO_DATA: ["Keine Daten", "Für die Positionen liegen keine Kurse vor."] }[x2.dataState];
    out.innerHTML = '<div class="vs-note" style="margin-bottom:14px"><b>Datenstand: ' + esc(STATE[0]) + '</b> – ' + esc(STATE[1]) + ' (' + x2.coverage.withPrices + '/' + x2.coverage.positions + ' mit Kursen, ' + x2.coverage.withHoldings + '/' + x2.coverage.positions + ' mit Holdings)</div>' +
      (x.complexPositions.length ? '<div class="vs-warnbox" style="margin-bottom:14px">⚠ Komplexe Produkte im Portfolio: ' + esc(x.complexPositions.join(", ")) + '. Hebel-, Short-, Options- und Krypto-Produkte verhalten sich anders als breit gestreute ETFs.</div>' : "") +
      '<div class="vs-grid g3">' +
      '<div class="vs-card"><p class="vs-label">Schwankung</p><p class="vs-kpi">' + F.pct(x.risk && x.risk.volatility.value) + '</p><p class="vs-fine">p.a., Wochenwerte, gemeinsame Historie</p></div>' +
      '<div class="vs-card"><p class="vs-label">Größter Rückgang</p><p class="vs-kpi down">' + F.pct(x.risk && x.risk.maxDrawdown.value) + '</p><p class="vs-fine">' + (x.risk ? F.date(x.risk.maxDrawdown.peakDate) + " → " + F.date(x.risk.maxDrawdown.troughDate) : "") + '</p></div>' +
      '<div class="vs-card"><p class="vs-label">Kursentwicklung p.a.</p><p class="vs-kpi ' + F.cls(x.performance && x.performance.windows.MAX.annualized) + '">' + F.spct(x.performance && (x.performance.windows.MAX.annualized !== undefined ? x.performance.windows.MAX.annualized : x.performance.windows.MAX.value)) + '</p><p class="vs-fine">seit ' + F.date(x.series.from) + ' · ohne Ausschüttungen</p></div></div>' +
      (hist < 3 ? '<div class="vs-note" style="margin-top:14px">Gemeinsame Kurshistorie nur ' + F.years(hist) + ' – begrenzt durch den jüngsten ETF im Portfolio. Risiko-Kennzahlen sind entsprechend wenig belastbar.</div>' : "") +
      (x.missingSeries.length ? '<div class="vs-warnbox" style="margin-top:14px">Ohne Kursreihe (nicht in Rechnung): ' + esc(x.missingSeries.join(", ")) + '</div>' : "") +
      '<div class="vs-card" style="margin-top:14px"><p class="vs-label">Portfolio-Verlauf (Start = 100, Gewichte wöchentlich zurückgesetzt)</p><div id="vs-pf-chart" style="margin-top:8px"></div></div>' +
      '<div class="vs-grid g2" style="margin-top:14px">' +
      '<div class="vs-card"><p class="vs-label">Assetklassen</p><div style="margin-top:10px">' + VS.bars(x.assetClasses.map(function (a) { return { key: a.key, label: VS.ASSET[a.key] || a.key, weight: a.weight }; })) + '</div></div>' +
      '<div class="vs-card"><p class="vs-label">Regionen (laut Fondsname)</p><div style="margin-top:10px">' + VS.bars(x.regions) + '</div></div>' +
      '<div class="vs-card"><p class="vs-label">Handelswährung</p><p class="vs-kpi small" style="margin-top:6px">' + F.pct(x.fxExposure.share, 0) + ' nicht in Euro gehandelt</p><p class="vs-fine" style="margin-top:6px">Gemessen ist nur die Handelswährung der Listings. Underlying-Währungsrisiko noch nicht verfügbar (dafür braucht es die Holdings).</p><div style="margin-top:10px">' + VS.bars(x.currencies) + '</div></div>' +
      '<div class="vs-card"><p class="vs-label">Konzentration</p><p class="vs-kpi small" style="margin-top:6px">' + x.concentration.effectiveNumber.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + ' effektive ETFs</p><p class="vs-fine" style="margin-top:6px">Größte Position: ' + esc(x.concentration.largest ? x.concentration.largest.symbol + " " + F.pct(x.concentration.largest.weight, 0) : "–") + '. Auf Ebene der Unternehmen folgt die Konzentration mit Holdings-Daten.</p>' +
      '<p class="vs-label" style="margin-top:14px">Gleichlauf (Korrelation, Wochenrenditen)</p>' + (x.correlations.length ? x.correlations.map(function (c) { return '<div class="vs-row"><span>' + esc(c.a) + ' ↔ ' + esc(c.b) + '</span><span class="num">' + (c.value === null ? '<span class="vs-fine">zu wenig Überlappung</span>' : c.value.toLocaleString("de-DE", { maximumFractionDigits: 2 })) + '</span></div>'; }).join("") : '<p class="vs-fine">Ab zwei ETFs.</p>') + '</div></div>' +
      '<div class="vs-card" style="margin-top:14px"><p class="vs-label">Durchschau: Länder, Branchen, Top-Unternehmen, Overlap</p>' +
      (lt.status === "CALCULATED" || lt.status === "PARTIAL" ? '<div style="margin-top:10px">' + lt.multiplyHeld.map(function (h) { return '<div class="vs-row"><span>' + esc(h.text) + '</span><span class="num">' + F.pct(h.weight, 2) + '</span></div>'; }).join("") + '</div>'
        : '<div class="vs-grid g2" style="margin-top:10px">' + VS.pending("Effektive Länder- und Branchengewichtung · Daten folgen", "Dafür braucht es die Holdings jedes ETFs. Die Engine ist fertig (z. B. „Du besitzt NVIDIA indirekt über drei ETFs.“) und startet, sobald Emittenten-Holdings angeschlossen sind.") +
          VS.pending("ETF-Overlap · Daten folgen", pairs.length ? pairs.length + " ETF-Paare vorbereitet. Gewichteter Overlap und gemeinsame Holdings erscheinen mit den Holdings-Daten – wir simulieren keine Überschneidungen." : "Ab zwei ETFs.") + '</div>') + '</div>';
    if (x.series.status === "CALCULATED") VS.lineChart(out.querySelector("#vs-pf-chart"), [{ label: "Portfolio", points: x.series.points, area: true }], { label: "Portfolio-Verlauf", fmtY: function (v) { return v.toFixed(0); } });
    else out.querySelector("#vs-pf-chart").innerHTML = VS.pending("Kein gemeinsamer Verlauf", "Die Kursreihen der Positionen überschneiden sich nicht ausreichend.");
  }

  function drawScenarios(out, m) {
    var plan = VS.currentPlan(), base = plan.scenarios[1];
    var wealth = base.nominal;
    var results = X.SCENARIOS.map(function (s) { return { s: s, r: X.applyScenario(s, VS.state.portfolio, m._bySymbol) }; });
    var infl = global.VUVorsorge.Math.plan(Object.assign({}, VS.state.plan, { inflation: VS.state.plan.inflation + 0.01 }), [{ id: "basis", label: "Basis", annualReturn: VS.state.plan.returns.basis }]).scenarios[0];
    out.innerHTML = '<div class="vs-card"><p class="vs-label">Szenario-Lab · Modellrechnung</p><p class="vs-fine" style="margin-top:4px">Vereinfachtes Modell, keine Prognose: sofortiger Schock auf die heutigen Gewichte. Angewendet nur, wo die Eigenschaft belegt ist (Assetklasse, Region und Währung aus dem ETF-Stamm). Hebel/Short werden berücksichtigt.</p>' +
      '<div class="vs-table-wrap" style="margin-top:12px"><table class="vs-table" style="min-width:560px"><thead><tr><th>Szenario</th><th>Wirkung aufs Portfolio</th><th>Betroffener Anteil</th><th>Auf 10.000 €</th><th>Status</th></tr></thead><tbody>' +
      results.map(function (x) {
        var r = x.r;
        var status = r.status === "CALCULATED" ? '<span class="vs-badge ok">berechnet</span>' : r.status === "LOW_COVERAGE" ? '<span class="vs-badge complex">geringe Abdeckung</span>' : r.status === "SEE_PLANNER" ? '<span class="vs-badge">siehe unten</span>' : '<span class="vs-badge">Daten fehlen</span>';
        return '<tr><td>' + esc(x.s.label) + (r.reason ? '<span class="t-name">' + esc(r.reason) + '</span>' : "") + '</td><td class="num ' + F.cls(r.impact) + '">' + (r.impact === null ? "–" : F.spct(r.impact)) + '</td><td class="num">' + (r.affected === undefined ? "–" : F.pct(r.affected, 0)) + '</td><td class="num">' + (r.impact === null ? "–" : F.eur(10000 * r.impact)) + '</td><td>' + status + '</td></tr>';
      }).join("") + '</tbody></table></div>' +
      '<div class="vs-note" style="margin-top:14px"><b>Inflation dauerhaft +1 %-Punkt:</b> Dein Basisplan erreicht dann ' + F.eurK(infl.real) + ' statt ' + F.eurK(base.real) + ' in heutiger Kaufkraft (Zielerreichung ' + F.pct(infl.goalAttainment, 0) + ' statt ' + F.pct(base.goalAttainment, 0) + ').</div>' +
      '<p class="vs-fine" style="margin-top:10px">Auf dein geplantes Endvermögen (Basis, nominal ' + F.eurK(wealth) + ') übertragen wirkt z. B. „Aktien −40 %“ kurz vor Rentenbeginn mit ' + F.eurK(wealth * (results[1].r.impact || 0)) + '. Zum Vergleich der größte Rückgang in den gelieferten Kursdaten: URTH (Industrieländer) ' + F.pct(m._bySymbol.URTH && m._bySymbol.URTH.m && m._bySymbol.URTH.m.mdd) + ', SPY (S&P 500) ' + F.pct(m._bySymbol.SPY && m._bySymbol.SPY.m && m._bySymbol.SPY.m.mdd) + '.</p></div>';
  }
})(window);
