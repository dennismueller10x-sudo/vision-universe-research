/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/portfolio.js
   Vorsorge-Portfolio: Strategiemodelle (Beispiel-Strukturen, keine Empfehlung), eigene
   Gewichtung, Portfolio-X-Ray, Overlap-Engine, Szenario-Lab.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, X = V.XRay, F = VS.fmt, esc = VS.esc;

  VS.views.portfolio = function (r) {
    var sub = r.args[0] === "szenarien" ? "szenarien" : r.args[0] === "modelle" ? "modelle" : "xray";
    if (r.query.add) {
      var s = r.query.add.toUpperCase();
      if (!VS.state.portfolio.some(function (p) { return p.symbol === s; })) { VS.state.portfolio.push({ symbol: s, weight: 0.1 }); VS.save(); }
    }
    /* V05 (Redesign 2027, Screens v05-a/v05-b): Titel als Frage, oben deine ETFs, darunter X-Ray in einer Spalte.
       Beispiel-Mischungen auf eigener Seite (#/portfolio/modelle), Szenario-Lab unter „Mehr“ (#/portfolio/szenarien). */
    var U = VS.U, head = sub === "modelle" ? VS.intro("Beispiel-Mischungen", "Zum Verstehen, wie Bausteine wirken. Keine Empfehlung, Gewichte frei änderbar.", "Portfolio")
      : sub === "szenarien" ? VS.intro("Szenario-Lab", "Was passiert mit deinem Portfolio bei einem Schock? Vereinfachte Modellrechnung.", "Portfolio")
      : VS.intro("Was steckt in deinem Portfolio?", "");
    var root = VS.render(head +
      '<section class="vs-section vs-section--first vs-pf"' + (sub === "modelle" ? " hidden" : "") + '><div class="vu-box vs-pf-list" id="vs-editor"></div><div id="vs-pf-out"><div class="vs-loading">Berechne …</div></div>' +
      (sub === "szenarien" ? '<a class="vu-chip vs-pf-back" href="#/portfolio">‹ Zurück zum X-Ray</a>' : "") + '</section>' +
      '<section class="vs-section vs-section--first vs-mods"' + (sub === "modelle" ? "" : " hidden") + '><div class="vu-stack" id="vs-models"><div class="vs-loading">…</div></div><a class="vu-chip vs-pf-back" href="#/portfolio">‹ Zurück zu deinem Portfolio</a></section>', { dm: [
        ["Portfolio-Kennzahlen", "Kurse als Wochenwerte (gemeinsame Historie), Bestände aus den Pflichtmeldungen der Fonds, Kostenquoten laut US-Prospekt. Vergangene Entwicklung, keine Prognose."]] });
    Promise.all([VS.master(), VS.getJSON("/vorsorge/data/model-portfolios.json")]).then(function (res) {
      var m = res[0], models = res[1];
      function modelCost(p) {
        var w = 0, c = 0; p.positions.forEach(function (x) { var e = m._bySymbol[x.symbol]; if (e && e.cost !== null) { w += x.weight; c += x.weight * e.cost; } });
        return w >= 0.999 ? VS.costPct(c) : w > 0 ? VS.costPct(c / w) + "*" : "–";
      }
      // Gewichtete Kennzahlen aus der bisherigen Entwicklung der Bausteine (nur wenn alle Bausteine die Kennzahl haben)
      function wavg(p, f) { var w = 0, s = 0, ok = true; p.positions.forEach(function (x) { var e = m._bySymbol[x.symbol], v = e ? f(e) : null; if (v === null || v === undefined || !isFinite(v)) ok = false; else { w += x.weight; s += x.weight * v; } }); return ok && w > 0 ? s / w : null; }
      function modelStats(p) {
        var r10 = wavg(p, function (e) { return e.m && e.m.p["10Y"]; });
        return { r10: r10, vol: wavg(p, function (e) { return e.m && e.m.vol; }), hy: Math.min.apply(null, p.positions.map(function (x) { var e = m._bySymbol[x.symbol]; return e && e.m ? e.m.hy || 0 : 0; })),
          short: p.positions.filter(function (x) { var e = m._bySymbol[x.symbol]; return !(e && e.m && e.m.p["10Y"] !== null && e.m.p["10Y"] !== undefined); }).map(function (x) { var e = m._bySymbol[x.symbol]; return { s: x.symbol, hy: e && e.m ? e.m.hy : null }; }) };
      }
      function same(p) {
        var a = VS.state.portfolio, t = a.reduce(function (s, x) { return s + x.weight; }, 0) || 1;
        return a.length === p.positions.length && p.positions.every(function (x) { var y = a.filter(function (z) { return z.symbol === x.symbol; })[0]; return y && Math.abs(y.weight / t - x.weight) < 0.005; });
      }
      function drawModels() {
        var notes = [];
        root.querySelector("#vs-models").innerHTML = models.portfolios.map(function (p) {
          var st = modelStats(p), mine = same(p);
          if (st.r10 === null && st.short.length) (function () { var hy = Math.min.apply(null, st.short.map(function (x) { return x.hy || 0; })), y = Math.floor(hy);
            notes.push(p.label + ": Für " + st.short.map(function (x) { return x.s; }).join(", ") + " gibt es " + (y >= 1 ? "erst " + y + (y === 1 ? " Jahr" : " Jahre") : "weniger als ein Jahr") + " Daten, deshalb kein 10-Jahres-Wert."); })();
          var acc = 0;
          return '<button type="button" class="vu-box vs-mod' + (mine ? " vu-box--ink" : "") + '" data-model="' + esc(p.id) + '" aria-pressed="' + mine + '"><span class="vs-mod-h"><span class="vu-ltag">' + esc(p.label) + '</span>' + (mine ? '<span class="vu-chip vu-chip--lime vs-mod-mine">dein Portfolio</span>' : "") + '</span>' +
            '<b class="vs-mod-idea">' + esc(p.idea) + '</b><span class="vu-xs vs-mod-pos">' + p.positions.map(function (x) { return esc(x.symbol) + " " + F.pct(x.weight, 0); }).join(" · ") + '</span>' +
            '<span class="vs-mod-bar" aria-hidden="true">' + p.positions.map(function (x, k) { var a = acc; acc += x.weight; return '<i style="width:' + (x.weight * 100).toFixed(1) + '%" data-k="' + (k % 4) + '"></i>'; }).join("") + '</span>' +
            '<span class="vs-mod-k"><span><span class="vu-xs">10 J. pro Jahr</span><b class="num">' + (st.r10 === null ? "–" : F.spct(st.r10)) + '</b></span><span><span class="vu-xs">Schwankung</span><b class="num">' + F.pct(st.vol, 0) + '</b></span><span><span class="vu-xs">Kosten</span><b class="num">' + modelCost(p) + '</b></span></span></button>';
        }).join("") + notes.map(function (t) { return '<div style="margin-top:2px">' + VS.help(t) + '</div>'; }).join("") +
          '<details class="vu-more"><summary>Wie werden die Mischungen gerechnet?</summary><div class="vu-more-body">Antippen übernimmt die Mischung als dein Portfolio (Gewichte danach frei änderbar). Rendite: gewichtete Kursentwicklung der Bausteine über 10 Jahre (ohne Ausschüttungen), Schwankung: gewichteter Durchschnitt (überschätzt die Schwankung gemischter Portfolios leicht). Kosten mit * nur für einen Teil der Bausteine belegt. Vergangene Entwicklung, keine Prognose. ' + esc(models.note) + '</div></details>';
        root.querySelectorAll("[data-model]").forEach(function (b) {
          b.onclick = function () { var p = models.portfolios.filter(function (x) { return x.id === b.dataset.model; })[0]; VS.state.portfolio = p.positions.map(function (x) { return { symbol: x.symbol, weight: x.weight }; }); VS.save(); VS.go("#/portfolio"); };
        });
      }
      drawModels();
      function editor() {
        var el = root.querySelector("#vs-editor");
        el.innerHTML = VS.state.portfolio.map(function (p, i) {
          var e = m._bySymbol[p.symbol], eu = euMap[p.symbol];
          return '<div class="vs-pf-row">' + VS.logo(p.symbol) + '<a class="vs-pf-n" href="' + (eu ? "#/europa/" : "#/etf/") + esc(p.symbol) + '"><b class="vu-sm">' + esc(e ? (VS.CORE_TITLE && VS.CORE_TITLE[p.symbol]) || e.category || p.symbol : eu ? eu.name : p.symbol) + '</b><span class="vu-xs vu-mu">' + esc(p.symbol) + (eu ? " · Europa, ohne Kurse und Bestände" : e ? "" : " · nicht im Verzeichnis") + '</span></a>' +
            '<label class="vs-pf-w"><input aria-label="Gewicht ' + esc(p.symbol) + '" data-i="' + i + '" type="number" inputmode="numeric" min="0" max="100" step="1" value="' + Math.round(p.weight * 100) + '"><b>%</b></label><button type="button" class="vs-pf-del" data-del="' + i + '" aria-label="' + esc(p.symbol) + ' entfernen">×</button></div>';
        }).join("") + '<form id="vs-add" class="vs-pf-add"><span aria-hidden="true">' + (U ? U.glyph("plus", 15) : "+") + '</span><input id="vs-add-q" placeholder="ETF hinzufügen" autocomplete="off" aria-label="ETF hinzufügen"></form><div class="vs-suggest" id="vs-add-s"></div>' +
          (VS.state.portfolio.length > 1 ? '<p class="vu-xs vu-mu vs-pf-sum">Gewichte werden auf 100 % normiert. Summe: ' + Math.round(VS.state.portfolio.reduce(function (a, p) { return a + p.weight; }, 0) * 100) + ' %</p>' : "");
        el.querySelectorAll("input[data-i]").forEach(function (inp) { inp.addEventListener("change", function () { VS.state.portfolio[+inp.dataset.i].weight = Math.max(0, (+inp.value || 0) / 100); VS.save(); editor(); compute(); drawModels(); }); });
        el.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { VS.state.portfolio.splice(+b.dataset.del, 1); VS.save(); editor(); compute(); drawModels(); }; });
        var q = el.querySelector("#vs-add-q"), box = el.querySelector("#vs-add-s");
        q.addEventListener("focus", function () { loadEu(false); });   // EU-Index erst bei Bedarf
        function add(sym) { if (!VS.state.portfolio.some(function (p) { return p.symbol === sym; })) VS.state.portfolio.push({ symbol: sym, weight: 0.1 }); VS.save(); editor(); compute(); drawModels(); }
        q.addEventListener("input", function () {
          var res = V.Master.search(m.etfs.filter(function (e) { return e.consumerVisible; }), q.value, 6);
          // Europaeische Anteilklassen (ISIN) zusaetzlich, klar gekennzeichnet
          var qq = q.value.trim().toLowerCase(), euRes = euList && qq.length >= 3 ? euList.filter(function (x) { return x.isin.toLowerCase() === qq || (qq.length >= 4 && x.name.toLowerCase().indexOf(qq) >= 0); }).slice(0, 3) : [];
          box.innerHTML = res.length || euRes.length ? '<ul>' + res.map(function (e) { return '<li><a href="#" data-add="' + esc(e.symbol) + '" style="color:var(--ink)"><span><b>' + esc(e.symbol) + '</b> · ' + esc(e.name) + '</span></a></li>'; }).join("") +
            euRes.map(function (x) { return '<li><a href="#" data-add="' + esc(x.isin) + '" style="color:var(--ink)"><span><b>' + esc(x.isin) + '</b> · ' + esc(x.name) + ' <span class="vs-badge">Europa</span></span></a></li>'; }).join("") + '</ul>' : "";
          box.querySelectorAll("[data-add]").forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); add(a.dataset.add); }; });
        });
        el.querySelector("#vs-add").addEventListener("submit", function (ev) { ev.preventDefault(); var iq = q.value.trim().toUpperCase(); if (euMap[iq]) return add(iq); var hit = V.Master.search(m.etfs, q.value, 1)[0]; if (hit) add(hit.symbol); });
      }
      function compute() {
        var out = root.querySelector("#vs-pf-out");
        if (!VS.state.portfolio.length) { out.innerHTML = '<div style="margin-top:14px">' + (U ? U.blank("Dein Portfolio ist leer. Füge oben ETFs hinzu oder übernimm eine Beispiel-Mischung.") : "") + '</div><a class="vu-btn vu-btn--block vs-pf-mods" href="#/portfolio/modelle">' + (U ? U.glyph("grid", 18) : "") + ' Beispiel-Mischungen ansehen</a>'; return; }
        out.innerHTML = '<div class="vs-loading">Berechne …</div>';
        VS.seriesFor(VS.state.portfolio.map(function (p) { return p.symbol; })).then(function (s) {
          s.eu = euMap;
          if (sub === "szenarien") return drawScenarios(out, m, s);
          var syms = Object.keys(s.details);
          return Promise.all(syms.map(function (k) { var d = s.details[k]; return d.holdings && d.holdings.status === "AVAILABLE" ? VS.holdings(d.holdings.series) : Promise.resolve(null); })).then(function (files) {
            s.holdingFiles = {}; syms.forEach(function (k, i) { if (files[i]) s.holdingFiles[k] = files[i]; });
            drawXRay(out, m, s);
          });
        });
      }
      // EU-Anteilklassen (ISIN) im Portfolio: Stammdaten aus dem ESMA-Index, keine Kurse und Holdings
      var euMap = {}, euList = null;
      var needEu = VS.state.portfolio.some(function (p) { return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(p.symbol); });
      editor(); compute();
      function loadEu(rerender) { return VS.euIndex().then(function (j) { if (!euList) { euList = j.items; j.items.forEach(function (x) { euMap[x.isin] = x; }); if (rerender) { editor(); compute(); } } }).catch(function () {}); }
      if (needEu) loadEu(true);
    }).catch(function (e) { root.querySelector("#vs-models").innerHTML = VS.pending("Daten nicht erreichbar", String(e.message || e)); });
  };

  /* X-Ray (v05-a): der eine Chart seit Beginn der gemeinsamen Historie, drei Kacheln, „Was du wirklich besitzt“, Firmen und Länder
     als Gewichtsbalken, „Auf einen Blick“ mit Urteil; Fachdaten (Assetklassen, Regionen, Währungen, Wirtschaftszweige,
     Bestandsänderungen, Prüfweg) unter „Mehr“. Rechnung unverändert (V.XRay). */
  var MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
  function monthLabel(a, b) {
    if (!a || !b) return "";
    var ma = MONTHS[+a.slice(5, 7) - 1], mb = MONTHS[+b.slice(5, 7) - 1];
    return a.slice(0, 4) === b.slice(0, 4) ? (ma === mb ? mb + " " + b.slice(0, 4) : ma + "–" + mb + " " + b.slice(0, 4)) : ma + " " + a.slice(0, 4) + "–" + mb + " " + b.slice(0, 4);
  }
  function drawXRay(out, m, s) {
    var holdings = {}; Object.keys(s.holdingFiles || {}).forEach(function (k) { var h = VS.xrayFile(s.holdingFiles[k]); if (X.validHoldings(h)) holdings[k] = h; });
    var bySym = Object.assign({}, m._bySymbol), euPos = [];
    VS.state.portfolio.forEach(function (p) { var eu = s.eu && s.eu[p.symbol]; if (eu && !bySym[p.symbol]) { bySym[p.symbol] = { symbol: p.symbol, currency: eu.currency || null }; euPos.push(p.symbol); } });
    var x = X.portfolioXRay(VS.state.portfolio, bySym, s.series, { regionLabels: VS.REGION, baseCurrency: "EUR", holdingsBySymbol: holdings });
    VS.analytics.track("portfolio_xray", { positions: x.positions.length });
    var lt = X.lookThrough(x.positions, holdings);
    var hist = x.series.status === "CALCULATED" ? (Date.parse(x.series.to) - Date.parse(x.series.from)) / (365.25 * 864e5) : 0;
    var x2 = X.portfolioXRay(VS.state.portfolio, bySym, s.series, { holdingsBySymbol: holdings });
    var STATE = { FULL_DATA: ["Vollständige Daten", "Kurse und Bestände für alle Positionen."], PARTIAL_DATA: ["Teilweise Daten", "Bestände nur für einen Teil der Positionen."],
      PRICE_ONLY_DATA: ["Nur Kursdaten", "Berechnet aus Kursreihen und Stammdaten: Schwankung, Rückgang, Gleichlauf, Assetklassen, Regionen laut Fondsname, Handelswährung. Ohne Bestände nicht berechenbar: Länder, Wirtschaftszweige, Firmen, Überschneidung."],
      NO_DATA: ["Keine Daten", "Für die Positionen liegen keine Kurse vor."] }[x2.dataState];
    var covTxt = x2.coverage.withPrices + "/" + x2.coverage.positions + " mit Kursen, " + x2.coverage.withHoldings + "/" + x2.coverage.positions + " mit Beständen";
    var ann = x.performance && (x.performance.windows.MAX.annualized !== undefined ? x.performance.windows.MAX.annualized : x.performance.windows.MAX.value);
    var dd = x.risk && x.risk.maxDrawdown;
    out.innerHTML = (x2.dataState === "FULL_DATA" ? "" : '<div class="vu-alert" style="margin-top:12px"><span><b>Datenstand: ' + esc(STATE[0]) + '</b> – ' + esc(STATE[1]) + ' (' + esc(covTxt) + ')</span></div>') +
      (x.complexPositions.length ? '<div class="vs-warnbox" style="margin-top:12px">Komplexe Produkte im Portfolio: ' + esc(x.complexPositions.join(", ")) + '. Hebel-, Short-, Options- und Krypto-Produkte verhalten sich anders als breit gestreute ETFs.</div>' : "") +
      VS.sect(x.series.status === "CALCULATED" ? "Seit " + x.series.from.slice(0, 4) + " · Start = 100" : "Verlauf") + '<div id="vs-pf-chart"></div>' +
      '<div class="vu-grid vs-pf-tiles" style="--vu-cols:3">' + VS.tile("Pro Jahr", F.spct(ann), "ohne Ausschütt.") + VS.tile("Schwankung", F.pct(x.risk && x.risk.volatility.value), "pro Jahr") +
      VS.tile("Größter Rückgang", dd ? "−" + F.pct(Math.abs(dd.value)).replace(/^[−-]/, "") : "–", dd ? monthLabel(dd.peakDate, dd.troughDate) : "") + '</div>' +
      '<div style="margin-top:10px">' + VS.help("Größter Rückgang: der tiefste Fall vom Höchststand. So viel hättest du zwischendurch aushalten müssen.") + '</div>' +
      (hist && hist < 3 ? '<div class="vs-note" style="margin-top:10px">Gemeinsame Kurshistorie nur ' + F.years(hist) + ' – begrenzt durch den jüngsten ETF im Portfolio. Die Kennzahlen sind entsprechend wenig belastbar.</div>' : "") +
      (euPos.length ? '<div class="vs-note" style="margin-top:10px">Europäische Anteilklassen ohne Kurs- und Bestandsdaten: ' + esc(euPos.join(", ")) + '. Sie zählen zum Gewicht, gehen aber nicht in Verlauf, Risiko und Durchschau ein.</div>' : "") +
      (x.missingSeries.filter(function (k) { return euPos.indexOf(k) < 0; }).length ? '<div class="vs-warnbox" style="margin-top:10px">Ohne Kursreihe (nicht in Rechnung): ' + esc(x.missingSeries.filter(function (k) { return euPos.indexOf(k) < 0; }).join(", ")) + '</div>' : "") +
      '<div id="vs-lt"></div>';
    drawLookThrough(out.querySelector("#vs-lt"), x, lt, holdings, s);
    var chartEl = out.querySelector("#vs-pf-chart");
    if (x.series.status === "CALCULATED" && global.VUChart) global.VUChart.mount(chartEl, { label: "Portfolio-Verlauf, Start = 100", height: 170, bleed: false, ranges: [{ id: "Max", label: "Max", points: x.series.points }] });
    else if (x.series.status === "CALCULATED") VS.lineChart(chartEl, [{ label: "Portfolio", points: x.series.points }], { label: "Portfolio-Verlauf", fmtY: function (v) { return v.toFixed(0); } });
    else chartEl.innerHTML = VS.pending("Kein gemeinsamer Verlauf", "Die Kursreihen der Positionen überschneiden sich nicht ausreichend.");
  }

  /* ---------------------------------------------- Durchschau */
  function drawLookThrough(el, x, lt, holdings, s) {
    var U = VS.U, pos = x.positions, total = pos.reduce(function (a, p) { return a + p.weight; }, 0) || 1;
    // gewichtete laufende Produktkosten
    var costW = 0, cost = 0;
    pos.forEach(function (p) { var d = s.details[p.symbol]; var c = d && d.costs && d.costs.status === "AVAILABLE" ? d.costs.value : null; if (c !== null) { costW += p.weight / total; cost += p.weight / total * c; } });
    var costV = costW > 0 ? cost / costW : null;
    var fx = x.fxExposure && x.fxExposure.share;
    var corr = x.correlations.filter(function (c) { return c.value !== null; });
    // Urteile (Schwellen dokumentiert in PROGRESS.md, Folie V05): Kosten ≤ 0,30 % günstig, ≤ 0,60 % mittel; Gleichlauf < 0,5 gering, < 0,85 mittel; Überschneidung < 5 % gering, < 25 % mittel.
    var vCost = costV === null ? null : costV <= 0.003 ? ["strong", "günstig"] : costV <= 0.006 ? ["mid", "mittel"] : ["weak", "teuer"];
    function vCorr(v) { return v < 0.5 ? ["strong", "gering"] : v < 0.85 ? ["mid", "mittel"] : ["weak", "hoch"]; }
    function vOver(v) { return v < 0.005 ? ["strong", "keine"] : v < 0.05 ? ["strong", "gering"] : v < 0.25 ? ["mid", "mittel"] : ["weak", "hoch"]; }
    var pairs = [];
    for (var i = 0; i < pos.length; i++) for (var j = i + 1; j < pos.length; j++) { var a = holdings[pos[i].symbol], b = holdings[pos[j].symbol]; if (a && b) pairs.push({ a: pos[i].symbol, b: pos[j].symbol, o: X.overlap(a, b) }); }
    var kv = function (k, v, vd) { return '<div class="vs-kv"><span class="vu-sm"><b>' + esc(k) + '</b></span><b class="num">' + esc(v) + '</b>' + (vd ? VS.verdict(vd[0], vd[1]) : "") + '</div>'; };
    var glance = '<div class="vu-box vs-kvbox vs-glance">' +
      kv("Kosten pro Jahr", costV === null ? "–" : VS.costPct(costV), vCost) +
      corr.slice(0, 3).map(function (c) { return kv("Gleichlauf " + c.a + " ↔ " + c.b, c.value.toLocaleString("de-DE", { maximumFractionDigits: 2 }), vCorr(c.value)); }).join("") +
      pairs.slice(0, 3).map(function (p) { return kv(pairs.length > 1 ? "Überschneidung " + p.a + " ↔ " + p.b : "Überschneidung", F.pct(p.o.weightedOverlap, 1), vOver(p.o.weightedOverlap)); }).join("") +
      (Number.isFinite(fx) ? kv("Nicht in Euro gehandelt", F.pct(fx, 0), fx > 0.5 ? ["weak", "Währung"] : fx > 0 ? ["mid", "teilweise"] : ["strong", "Euro"]) : "") + '</div>' +
      (corr.length ? '<div style="margin-top:10px">' + VS.help("Gleichlauf " + corr[0].value.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + ": " + (corr[0].value >= 0.85 ? "Die ETFs bewegen sich fast immer gemeinsam; sie streuen wenig zusätzlich." : corr[0].value >= 0.5 ? "Die beiden ETFs bewegen sich meist in dieselbe Richtung, aber nicht immer." : "Die ETFs bewegen sich oft unterschiedlich; das streut das Risiko.")) + '</div>' : "");
    var cta = '<a class="vu-btn vu-btn--block vs-pf-mods" href="#/portfolio/modelle">' + (U ? U.glyph("grid", 18) : "") + ' Beispiel-Mischungen ansehen</a>';
    var costMore = costV !== null ? '<p class="vu-sm">Kostenquote laut US-Prospekt (Pflichtmeldungen), gewichtet über ' + F.pct(costW, 0) + ' des Portfolios. Depot-, Handels- und Steuerkosten sind nicht enthalten. <a href="#/kosten?ter=' + (costV * 100).toFixed(3) + '">Über die Laufzeit rechnen</a></p>' : "";
    var basics = '<p class="vs-label">Assetklassen</p>' + VS.bars(x.assetClasses.map(function (a) { return { key: a.key, label: VS.ASSET[a.key] || a.key, weight: a.weight }; })) +
      '<p class="vs-label" style="margin-top:14px">Regionen (laut Fondsname)</p>' + VS.bars(x.regions) +
      '<p class="vs-label" style="margin-top:14px">Handelswährung</p><p class="vu-xs vu-mu">Gemessen ist die Handelswährung der Listings, nicht die Länder der Firmen.</p>' + VS.bars(x.currencies) +
      '<p class="vs-label" style="margin-top:14px">Konzentration</p><p class="vu-sm">' + x.concentration.effectiveNumber.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + ' effektive ETFs. Größte Position: ' + esc(x.concentration.largest ? x.concentration.largest.symbol + " " + F.pct(x.concentration.largest.weight, 0) : "–") + '.</p>' + costMore;
    var more = function (inner) { return '<details class="vu-more vs-pf-more"><summary>Mehr: Fachdaten und Szenario-Lab</summary><div class="vu-more-body">' + inner + '<p style="margin-top:14px"><a class="vu-chip" href="#/portfolio/szenarien">Szenario-Lab öffnen</a></p></div></details>'; };
    if (!(lt.status === "CALCULATED" || lt.status === "PARTIAL")) {
      el.innerHTML = '<div class="vu-box vu-box--ink vs-own"><span class="vu-ltag">Was du wirklich besitzt</span><b>Für diese ETFs liegen keine Bestandsdaten vor.</b><span class="vu-sm">Etwa bei Unit Investment Trusts wie SPY oder Nicht-US-Fonds. Wir schätzen keine Inhalte.</span></div>' +
        VS.sect("Auf einen Blick") + glance + cta + more(basics);
      return;
    }
    // Länder/Wirtschaftszweige exakt: je ETF aus ALLEN Positionen (Datei-Exposures) × ETF-Gewicht
    function effective(field) {
      var mm = {}, cov = 0;
      pos.forEach(function (p) { var f = s.holdingFiles[p.symbol]; if (!f || f.derivativeHeavy) return; var w = p.weight / total; cov += w;
        (f.exposures[field] || []).forEach(function (q) { if (q.key === "CASH") return; mm[q.key] = (mm[q.key] || 0) + w * q.weight; }); });
      var list = Object.keys(mm).map(function (k) { return { key: k, weight: mm[k] }; }).sort(function (a, b) { return b.weight - a.weight; });
      return { list: list, coverage: cov };
    }
    function withRest(eff, n, labelFn) { var top = eff.list.slice(0, n).map(function (c) { return { key: c.key, label: labelFn(c.key), weight: c.weight }; }); if (eff.coverage < 0.995) top.push({ key: "NO_HOLDINGS", label: "Ohne Bestandsdaten", weight: 1 - eff.coverage }); return top; }
    var effCountries = effective("countries"), effSectors = effective("sectors");
    var derivSkipped = pos.filter(function (p) { var f = s.holdingFiles[p.symbol]; return f && f.derivativeHeavy; }).map(function (p) { return p.symbol; });
    var trueCov = pos.reduce(function (a, p) { var q = holdings[p.symbol]; if (!q) return a; var sec = q.holdings.reduce(function (t, h) { return t + h.weight; }, 0); return a + p.weight / total * Math.min(1, sec); }, 0);
    // Was hat sich geändert (Portfolio): Ereignisse je ETF x Portfolio-Gewicht
    var agg = {};
    pos.forEach(function (p) { var f = s.holdingFiles[p.symbol]; if (!f || f.derivativeHeavy || !f.changes || !f.changes.events) return; var w = p.weight / total;
      f.changes.events.forEach(function (e) { if (!/^(WEIGHT_INCREASED|WEIGHT_DECREASED|HOLDING_ADDED|HOLDING_REMOVED)$/.test(e.eventType)) return;
        var mt = /^(ISIN|CUSIP):(.+)$/.exec(e.entityId || ""), k = mt ? VS.holdingIdentity(mt[1] === "ISIN" ? { isin: mt[2] } : { cusip: mt[2] }) : "N:" + String(e.entityName || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        var dlt = (e.newValue || 0) - (e.oldValue || 0); if (!agg[k]) agg[k] = { name: e.entityName, d: 0 }; agg[k].d += w * dlt; }); });
    var moves = Object.keys(agg).map(function (k) { return agg[k]; }).filter(function (q) { return Math.abs(q.d) >= 0.001; }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); }).slice(0, 6);
    var shown = Object.keys(holdings).map(function (k) { return k + " " + F.pct((s.holdingFiles[k] || {}).shownWeight, 0); }).join(", ");
    var eqTop25 = lt.companies.slice(0, 25).reduce(function (a, c) { return a + c.weight; }, 0);
    // Anzahl Firmen: Positionen je ETF minus gemeinsame Positionen der Paare (nur ETFs mit Beständen)
    var firms = pos.reduce(function (a, p) { var f = s.holdingFiles[p.symbol]; return a + (f && !f.derivativeHeavy && f.positions ? f.positions : 0); }, 0) - pairs.reduce(function (a, p) { return a + (p.o.commonCount || 0); }, 0);
    var firmsTxt = firms >= 1000 ? "über " + (Math.floor(firms / 100) * 100).toLocaleString("de-DE") : firms.toLocaleString("de-DE");
    var sentence = pos.length + " ETF" + (pos.length > 1 ? "s, aber " : ", aber ") + firmsTxt + " Firmen. " + F.pct(eqTop25 / Math.max(lt.coverage, 1e-9), 0) + " deines Geldes stecken in den 25 größten.";
    // Kürzel je Firma für das Logo (aus den Beständen des ersten ETFs, über den sie gehalten wird)
    function tickerOf(c) { var h = holdings[c.via[0]]; if (!h) return ""; var hit = h.holdings.filter(function (q) { return q.name === c.name; })[0]; return hit && hit.ticker || ""; }
    var top = lt.companies.slice(0, 6), mx = top.length ? top[0].weight : 1;
    var cl = withRest(effCountries, 5, VS.countryName), cmx = cl.length ? Math.max.apply(null, cl.map(function (c) { return c.weight; })) : 1;
    el.innerHTML = '<div class="vu-box vu-box--ink vs-own"><span class="vu-ltag">Was du wirklich besitzt</span><b>' + esc(sentence) + '</b>' +
      (lt.coverage < 0.995 ? '<span class="vu-sm">Bestände liegen für ' + F.pct(lt.coverage, 0) + ' deines Portfolios vor; der Rest wird nicht als 0 gezählt.</span>' : "") + '</div>' +
      VS.sect("Größte Firmen · effektiv") + top.map(function (c) {
        var t = tickerOf(c);
        return '<div class="vs-firm">' + VS.logo(t || c.name.slice(0, 4).toUpperCase()) + '<span class="vs-firm-n"><b class="vu-sm">' + esc(VS.displayName ? VS.displayName(c.name) : c.name) + '</b><span class="vs-wbar-track"><i style="width:' + (c.weight / mx * 100).toFixed(1) + '%"></i></span></span><b class="num vu-sm">' + F.pct(c.weight, 2) + '</b></div>';
      }).join("") +
      (lt.effectiveDuplicateExposure > 0.001 ? '<p class="vu-xs vu-mu" style="margin-top:6px">' + F.pct(lt.effectiveDuplicateExposure, 1) + ' deines Portfolios stecken in Firmen, die du über mehrere ETFs hältst.</p>' : "") +
      VS.sect("Länder · effektiv") + cl.map(function (c, k) { return VS.wbar(c.label, F.pct(c.weight, 0), c.weight / cmx * 100, k === 0); }).join("") +
      VS.sect("Auf einen Blick") + glance + cta +
      more(basics +
        '<p class="vs-label" style="margin-top:14px">Wirtschaftszweige (effektiv, SIC)</p>' + (effSectors.list.length ? VS.bars(withRest(effSectors, 11, VS.sectorName)) : '<p class="vu-xs vu-mu">Keine Zuordnung.</p>') +
        (moves.length ? '<p class="vs-label" style="margin-top:14px">Seit dem letzten Bestandsbericht je ETF</p><div class="vs-kvbox">' + moves.map(function (q) { return '<div class="vs-kv"><span class="vu-sm">' + esc(q.name) + ' <span class="vu-mu">' + (q.d > 0 ? "+" : "−") + (Math.abs(q.d) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + ' PP</span></span>' + VS.verdict("mid", q.d > 0 ? "gestiegen" : "gesunken") + '</div>'; }).join("") +
          '</div><p class="vu-xs vu-mu">Gewichtsänderung je ETF (Quartalsmeldungen im Vergleich) mal Portfolio-Gewicht. Enthält Kursbewegungen.</p>' : "") +
        '<p class="vs-label" style="margin-top:14px">Wie wird durchgeschaut?</p><p class="vu-xs vu-mu">Durchschau über ' + F.pct(lt.coverage, 0) + ' des Portfolios (davon tatsächlich durchschaut: ' + F.pct(trueCov, 0) + ') mit Bestandsdaten aus den Quartalsmeldungen. Je ETF die bis zu 100 größten Positionen (' + esc(shown) + '); Firmen und Überschneidung beruhen auf diesen Positionen, Länder und Wirtschaftszweige auf allen Positionen. Die Zahl der Firmen zählt alle Positionen je ETF abzüglich der gemeinsamen. Stichtage der Bestände können sich unterscheiden.' + (derivSkipped.length ? ' Nicht durchgeschaut (Hebel-/Derivatefonds): ' + esc(derivSkipped.join(", ")) + '.' : "") + '</p>');
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
