/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/etf.js
   ETF Intelligence: Screener & Suche, ETF-Detail (DNA, X-Ray, Einordnung),
   ETF-Vergleich, Watchlist.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, A = V.Analytics, X = V.XRay, F = VS.fmt, esc = VS.esc;

  function uniq(list, f) { var s = {}; list.forEach(function (e) { var k = e[f]; if (k !== null && k !== undefined) s[k] = (s[k] || 0) + 1; }); return Object.keys(s).sort(); }
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? " selected" : "") + '>' + esc(label) + '</option>'; }

  function watchToggle(sym) {
    var i = VS.state.watchlist.indexOf(sym);
    if (i >= 0) VS.state.watchlist.splice(i, 1); else VS.state.watchlist.push(sym);
    VS.save();
    return i < 0;
  }

  /* ============================================================ SCREENER */
  var COLS = [
    { id: "name", label: "ETF", get: function (e) { return e.symbol; } },
    { id: "p1M", label: "1M", get: function (e) { return e.m && e.m.p["1M"]; }, pct: true },
    { id: "p6M", label: "6M (Momentum)", get: function (e) { return e.m && e.m.p["6M"]; }, pct: true },
    { id: "p1Y", label: "1J", get: function (e) { return e.m && e.m.p["1Y"]; }, pct: true },
    { id: "p3Y", label: "3J p.a.", get: function (e) { return e.m && e.m.p["3Y"]; }, pct: true },
    { id: "p5Y", label: "5J p.a.", get: function (e) { return e.m && e.m.p["5Y"]; }, pct: true },
    { id: "p10Y", label: "10J p.a.", get: function (e) { return e.m && e.m.p["10Y"]; }, pct: true },
    { id: "vol", label: "Schwankung", get: function (e) { return e.m && e.m.vol; }, pct: true, neutral: true },
    { id: "mdd", label: "Max. Rückgang", get: function (e) { return e.m && e.m.mdd; }, pct: true },
    { id: "trend", label: "Trend (Abst. Ø)", get: function (e) { return e.m && e.m.trend; }, pct: true },
    { id: "rs", label: "Rel. Stärke vs. SPY", get: function (e) { return e.m && e.m.rs; }, pct: true },
    { id: "hy", label: "Historie", get: function (e) { return e.m && e.m.hy; }, years: true },
    { id: "cost", label: "Expense Ratio (US)", get: function (e) { return e.cost; }, cost: true },
    { id: "aum", label: "Fondsvermögen (Fonds)", get: function (e) { return e.aum; }, money: true },
    { id: "t10", label: "Top-10-Anteil", get: function (e) { return e.top10; }, pct: true, neutral: true }
  ];
  VS.etfHref = function (e) { return "#/etf/" + encodeURIComponent(e.slug || e.symbol); };

  /* Consumer-Reihen: nur Standard-Bauart, nur belegte Klassifikation, sortiert nach Historienlaenge (keine Rangliste nach Rendite) */
  var ROWS = [
    { id: "welt", label: "Breite Welt-ETFs", test: function (e) { return e.assetClass === "EQUITY" && e.region === "GLOBAL"; } },
    { id: "usa", label: "USA", test: function (e) { return e.assetClass === "EQUITY" && e.region === "USA" && !e.theme; } },
    { id: "europa", label: "Europa", test: function (e) { return e.assetClass === "EQUITY" && e.region === "EUROPE"; } },
    { id: "em", label: "Schwellenländer", test: function (e) { return e.assetClass === "EQUITY" && e.region === "EMERGING_MARKETS"; } },
    { id: "anleihen", label: "Anleihen", test: function (e) { return e.assetClass === "BOND"; } },
    { id: "geldmarkt", label: "Geldmarkt & ultrakurz", test: function (e) { return e.assetClass === "MONEY_MARKET"; } },
    { id: "small", label: "Nebenwerte (Small Caps)", test: function (e) { return e.theme === "Nebenwerte"; } },
    { id: "dividende", label: "Dividende", test: function (e) { return e.theme === "Dividende"; } },
    { id: "faktor", label: "Faktor (Qualität, Value, Wachstum)", test: function (e) { return ["Qualität", "Value", "Wachstum"].indexOf(e.theme) >= 0; } },
    { id: "themen", label: "Themen", test: function (e) { return e.strategy === "THEMATIC"; } }
  ];

  /* Markt-Umschalter: US-Listings (Tiingo, SEC) und europaeische Anteilklassen (ESMA) haben verschiedene Datenabdeckung. */
  VS.marketSwitch = function (active) {
    return '<div class="vs-seg" role="tablist" aria-label="Markt" style="margin-top:16px"><a role="tab" class="vs-seg-link" href="#/etfs" aria-pressed="' + (active === "us") + '">USA · Kurse, Holdings, Kosten</a>' +
      '<a role="tab" class="vs-seg-link" href="#/europa" aria-pressed="' + (active === "eu") + '">Europa · UCITS-Anteilklassen</a></div>';
  };
  /* V03 (Redesign 2027): „Einfach“ zeigt zuerst breite, günstige ETFs; „Themen“ mit Warnung; „Alle“ ist der
     bisherige Screener (jede Abfrage mit Parametern landet dort). Filter-Sheet in Alltagssprache. */
  function etfTabs(active) {
    return '<div class="vs-segwrap">' + VS.U.seg([{ id: "einfach", label: "Einfach", href: "#/etfs" }, { id: "alle", label: "Alle", href: "#/etfs?tab=alle" }, { id: "themen", label: "Themen", href: "#/etfs?tab=themen" }], active, { label: "Ansicht" }) + '</div>';
  }
  function filterSheet() {
    var U = VS.U, st = { region: "GLOBAL", maxcost: "0.003", hist: true, holdings: false, complex: false };
    var el = VS.sheet("vs-etf-filter", "Filter", '<p class="vu-ltag" style="margin-top:4px">Region</p><div class="vu-chips" style="margin-top:8px;flex-wrap:wrap">' +
      [["GLOBAL", "Welt"], ["USA", "USA"], ["EUROPE", "Europa"], ["EMERGING_MARKETS", "Schwellenländer"]].map(function (x) { return '<button type="button" class="vu-chip" data-region="' + x[0] + '" aria-pressed="' + (x[0] === st.region) + '">' + x[1] + '</button>'; }).join("") + '</div>' +
      '<p class="vu-ltag" style="margin-top:14px">Kosten höchstens</p><div style="margin-top:8px">' + U.seg([{ id: "0.001", label: "0,1 %" }, { id: "0.003", label: "0,3 %" }, { id: "0.005", label: "0,5 %" }, { id: "", label: "egal" }], st.maxcost, { label: "Kosten höchstens" }) + '</div>' +
      '<div style="margin-top:8px">' + [["hist", "Mindestens 10 Jahre Historie", true], ["holdings", "Nur mit Beständen (X-Ray)", false], ["complex", "Hebel- und Short-ETFs zeigen", false]].map(function (x) {
        return '<div class="vs-kv"><span class="vu-sm"><b>' + x[1] + '</b></span>' + U.toggle(x[2], "", x[0]) + '</div>'; }).join("") + '</div>' +
      VS.help("Hebel-ETFs verstärken Gewinne und Verluste. Für die Vorsorge sind sie nicht gedacht, deshalb sind sie aus.") +
      '<button type="button" class="vu-btn vu-btn--block" id="vs-ff-go" style="margin-top:14px">Treffer zeigen</button>');
    if (!el) return;
    el.addEventListener("click", function (ev) {
      var r = ev.target.closest("[data-region]"), c = ev.target.closest(".vu-seg [data-id]");
      if (r) { st.region = r.dataset.region; el.querySelectorAll("[data-region]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === r)); }); }
      if (c) { st.maxcost = c.dataset.id; el.querySelectorAll(".vu-seg [data-id]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === c)); }); }
      if (ev.target.id === "vs-ff-go") {
        var on = function (n) { return el.querySelector('input[name="' + n + '"]').checked; };
        VS.U.closeSheet(el);
        VS.go("#/etfs?tab=alle&ac=EQUITY&region=" + st.region + (st.maxcost ? "&maxcost=" + st.maxcost : "") + (on("hist") ? "&hist=10" : "") + (on("holdings") ? "&holdings=1" : "") + (on("complex") ? "&complex=1" : ""));
      }
    });
  }
  function simpleEtfs(tab) {
    var U = VS.U;
    var root = VS.render(VS.intro("Die ETF-Welt", "") +
      '<form class="vs-termsearch" id="vs-es-form" role="search">' + U.glyph("search", 18) + '<input id="vs-es-q" type="search" placeholder="ETF, ISIN, Index oder Thema" aria-label="ETFs durchsuchen" autocomplete="off"><button type="button" class="vu-round" id="vs-es-filter" aria-label="Filter">' + U.glyph("filter", 17) + '</button></form>' +
      '<div class="vs-count" id="vs-es-count"></div>' + etfTabs(tab) + '<div id="vs-es-body"><div class="vs-loading">ETF-Verzeichnis wird geladen …</div></div>',
      { dm: [["Was gezeigt wird", "US-gelistete ETFs als Marktabbild: echte Kurshistorie, Schwankung, größter Rückgang; Kosten und Bestände aus SEC-Daten, wo vorhanden. „Einfach“ und „Themen“ sind Ausschnitte, keine Empfehlung."]] });
    root.querySelector("#vs-es-form").addEventListener("submit", function (ev) {
      ev.preventDefault(); var v = root.querySelector("#vs-es-q").value.trim(); if (!v) return;
      VS.go(/^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(v) ? "#/europa/" + v.toUpperCase() : "#/etfs?tab=alle&q=" + encodeURIComponent(v));
    });
    root.querySelector("#vs-es-filter").onclick = filterSheet;
    var counts = function (m) { root.querySelector("#vs-es-count").innerHTML = '<span class="num">' + m.counts.publicAnalysis.toLocaleString("de-DE") + '</span><b>ETFs</b><small>' + m.counts.complex.toLocaleString("de-DE") + ' komplexe ausgeblendet</small>'; };
    var body = root.querySelector("#vs-es-body");
    if (tab === "themen") {
      VS.master().then(function (m) {
        counts(m);
        var list = m.etfs.filter(function (e) { return e.layer === "PUBLIC_ANALYSIS" && e.strategy === "THEMATIC" && e.m && e.m.p["1Y"] !== null && e.m.p["1Y"] !== undefined && e.m.hy >= 1; })
          .sort(function (a, b) { return b.m.p["1Y"] - a.m.p["1Y"]; }).slice(0, 15);
        body.innerHTML = '<div class="vu-box vu-box--ink vs-row-sb" style="margin-top:12px;flex-wrap:nowrap;justify-content:flex-start">' + VS.verdict("weak", "Hohes Auf und Ab") + '<span class="vu-sm">Themen-ETFs schwanken stark. Als Beimischung, nicht als Basis.</span></div>' +
          VS.sect("Stärkste 12 Monate") + '<div class="vs-erows">' + list.map(function (e) { return VS.etfRow(e, { title: e.index || e.theme || VS.displayName(e.name), sub: "Kosten · Schw. " + (e.cost !== null ? VS.costPct(e.cost) : "k. A.") + " · " + F.pct(e.m.vol, 0), noSpark: true }).replace('class="vs-erow"', 'class="vs-erow vs-erow--nospark"'); }).join("") + '</div>' +
          VS.help("Hohe Gewinne in einem Jahr sagen nichts über die nächsten Jahre.") +
          '<a class="vu-btn vu-btn--line vu-btn--block" style="margin-top:12px" href="#/etfs?tab=alle&strat=THEMATIC">Alle Themen-ETFs</a>';
      }).catch(function () { body.innerHTML = U.blank("Das ETF-Verzeichnis ist nicht erreichbar."); });
      return;
    }
    var CORE = ["URTH", "SPY", "EEM", "QQQ", "FEZ", "IWM"];
    VS.masterFor(CORE).then(function (m) {
      counts(m);
      var row = function (s) { var e = m.find(s); return e ? VS.etfRow(e, { title: VS.CORE_TITLE[s], sub: e.index }) : ""; };
      body.innerHTML = '<div class="vu-box vs-row-sb" style="margin-top:12px;flex-wrap:nowrap;justify-content:flex-start">' + VS.verdict("strong", "Für den Anfang") + '<span class="vu-sm">breit gestreut, günstig, lange Historie</span></div>' +
        VS.sect("Breit und günstig") + '<div class="vs-erows">' + CORE.slice(0, 2).map(row).join("") + '</div>' +
        VS.sect("Bausteine dazu") + '<div class="vs-erows">' + CORE.slice(2).map(row).join("") + '</div>' +
        VS.help("Schwankung: wie stark der Kurs im Jahr typisch hoch und runter geht. Mehr Schwankung heißt mehr Auf und Ab.") +
        '<section id="vs-es-worlds">' + VS.sect("ETF-Welten") + '<div class="vs-loading">…</div></section>' +
        '<div class="vu-box" style="margin-top:14px">' + VS.help("Alle Kurse sind US-Listings. In der EU kaufst du meist die UCITS-Version auf denselben Index. Wir zeigen dir, wonach du bei deiner Bank suchst.") + '<a class="vu-xs vs-link" href="#/europa" style="display:inline-block;margin-top:8px">Europäische UCITS-Anteilklassen ansehen</a></div>';
      VS.fillSparks(body);
      return VS.master().then(function (full) {
        var std = full.etfs.filter(function (e) { return e.layer === "PUBLIC_ANALYSIS"; });
        var rows = ROWS.map(function (rw) { return { rw: rw, n: std.filter(rw.test).length }; }).filter(function (x) { return x.n; });
        var mx = Math.max.apply(null, rows.map(function (x) { return x.n; }));
        body.querySelector("#vs-es-worlds").innerHTML = VS.sect("ETF-Welten") + rows.map(function (x, i) { return '<a class="vs-wlink" href="#/etfs?row=' + x.rw.id + '">' + VS.wbar(x.rw.label, x.n.toLocaleString("de-DE"), x.n / mx * 100, i === 0) + '</a>'; }).join("");
      });
    }).catch(function () { body.innerHTML = U.blank("Das ETF-Verzeichnis ist nicht erreichbar."); });
  }
  /* Seitenweise Liste: 25 kompakte Zeilen, dann „Weitere“. */
  var PAGE = 25;
  VS.views.etfs = function (r) {
    var q = r.query || {};
    var tab = q.tab || (Object.keys(q).filter(function (k) { return k !== "keepScroll"; }).length ? "alle" : "einfach");
    if (tab !== "alle") return simpleEtfs(tab);
    var st = { q: q.q || "", ac: q.ac || "", region: q.region || "", theme: q.theme || "", issuer: q.issuer || "", exchange: q.exchange || "", currency: q.currency || "",
      index: q.index || "", hist: q.hist || "", ptype: q.ptype || "", strat: q.strat || "", rc: q.rc || "", maxvol: "", maxdd: "", trendUp: false, dist: false,
      maxcost: q.maxcost || "", minaum: q.minaum || "", minpos: "", maxt10: "", hasHoldings: q.holdings === "1", dom: q.dom || "",
      complex: q.complex === "1", inactive: false, hasPrice: q.price === "1", hasCost: q.cost === "1", sort: q.sort || "hy", dir: -1, limit: PAGE, row: q.row || "" };
    var root = VS.render('<section class="vs-etf-alle">' + VS.intro("Die ETF-Welt", "") + etfTabs("alle") +
      '<form id="vs-search-form" class="vs-search" role="search"><span aria-hidden="true">⌕</span><input id="vs-q" autocomplete="off" value="' + esc(st.q) + '" placeholder="Ticker, ISIN, Name, Index, Thema, Anbieter …" aria-label="ETFs durchsuchen"><button type="submit">Suchen</button></form><div class="vs-suggest" id="vs-suggest"></div></section>' +
      '<section class="vs-section vs-section--first" id="vs-screener"><div class="vs-loading">ETF-Verzeichnis wird geladen …</div></section><section class="vu-sec" id="vs-rows"></section>', { dm: [
        ["Was gezeigt wird", "US-gelistete ETFs mit echter Kurshistorie, Schwankung und größtem Rückgang – und, wo die SEC-Daten reichen, mit Holdings, X-Ray und Kosten laut Prospekt. Hebel-, Short-, Options- und Krypto-Produkte sind getrennt und markiert. Europäische UCITS-Anteilklassen: <a href=\"#/europa\">eigener Bereich</a> (Suche über ISIN)."],
        ["Kennzahlen", "Rendite = Kursentwicklung ohne Ausschüttungen. Kosten (Expense Ratio) und Fondsvermögen aus SEC-Daten, Holdings aus SEC N-PORT – nur für US-registrierte Fonds. Fehlende Werte zählen bei Filtern nicht als null."],
        ["ETF-Welten", "Nur Standard-Bauart, sortiert nach Länge der Kurshistorie, nicht nach Rendite. Kategorien aus dem Fondsnamen abgeleitet."]] });
    (q.inactive === "1" ? VS.masterAll() : VS.master()).then(function (m) {
      var t0 = (global.performance && performance.now()) || 0;
      var host = root.querySelector("#vs-screener");
      var all = m.etfs.filter(function (e) { return e.layer !== "REVIEW"; });
      var input = root.querySelector("#vs-q"), timer = null;
      root.querySelector("#vs-search-form").addEventListener("submit", function (ev) { ev.preventDefault();
        if (/^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(input.value.trim())) { VS.go("#/europa/" + input.value.trim().toUpperCase()); return; }
        st.q = input.value; st.limit = PAGE; draw(); VS.analytics.track("etf_search", { query: st.q.slice(0, 40) }); });
      input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { st.q = input.value; st.limit = PAGE; draw(); }, 140); });
      var hasDist = all.some(function (e) { return e.distributionPolicy; });
      drawRows();
      function drawRows() {
        var el = root.querySelector("#vs-rows");
        var std = all.filter(function (e) { return e.layer === "PUBLIC_ANALYSIS"; });
        var rows = ROWS.map(function (rw) {
          var list = std.filter(rw.test).sort(function (a, b) { return ((b.m && b.m.hy) || 0) - ((a.m && a.m.hy) || 0); });
          return { rw: rw, list: list };
        }).filter(function (x) { return x.list.length; });
        el.innerHTML = rows.length ? '<div class="vu-sec-head"><h2 class="vu-sec-title">ETF-Welten</h2></div><p class="vs-sub" style="margin:-8px 0 14px">Standard-ETFs nach Region und Thema · längste Historie zuerst</p>' +
          '<div class="vs-worlds" role="group" aria-label="ETF-Welten">' + rows.map(function (x) {
            var mx = Math.max.apply(null, rows.map(function (y) { return y.list.length; })), open = st.row === x.rw.id;
            return '<button class="vs-world" data-row="' + x.rw.id + '" aria-expanded="' + open + '"><span class="vs-world-l">' + esc(x.rw.label) + '</span><b class="num">' + x.list.length.toLocaleString("de-DE") + '</b>' +
              '<span class="vu-bar" aria-hidden="true"><i style="width:' + Math.max(2, x.list.length / mx * 100).toFixed(1) + '%"></i></span></button>' +
              (open ? '<div class="vs-list vs-world-list">' + x.list.slice(0, 8).map(card).join("") + '</div>' : "");
          }).join("") + '</div>' : "";
        el.querySelectorAll("[data-row]").forEach(function (b) { b.onclick = function () { st.row = st.row === b.dataset.row ? "" : b.dataset.row; drawRows(); }; });
      }
      function card(e) {
        return '<a class="vs-item" href="' + VS.etfHref(e) + '"><span class="vs-ava c-' + esc(e.assetClass || "") + '" title="' + esc(e.issuer || "") + '">' + esc(VS.issuerShort(e)) + '</span>' +
          '<span class="vs-item-main"><span class="vs-item-top"><b>' + esc(e.symbol) + '</b><span class="vs-item-name">' + esc(VS.displayName(e.name)) + '</span></span>' +
          '<span class="vs-item-meta">Schwankung ' + F.pct(e.m && e.m.vol, 0) + ' · Max. Rückgang ' + F.pct(e.m && e.m.mdd, 0) + '</span></span>' +
          '<span class="vs-item-perf"><b class="num">' + F.years(e.m && e.m.hy) + '</b><small>Historie</small></span></a>';
      }
      function sel(k, label, values, labeler) { return '<select data-k="' + k + '" aria-label="' + esc(label) + '"><option value="">' + esc(label) + ': alle</option>' + values.map(function (v) { return opt(v, labeler ? labeler(v) : v, st[k]); }).join("") + '</select>'; }
      function controls(pool) {
        return '<div class="vs-filters" role="group" aria-label="Filter">' +
          sel("ptype", "Produkttyp", uniq(pool, "productType")) +
          sel("strat", "Bauart", uniq(pool, "strategy"), function (k) { return VS.STRATEGY[k] || k; }) +
          sel("ac", "Assetklasse", uniq(pool, "assetClass"), function (k) { return VS.ASSET[k] || k; }) +
          sel("region", "Region", uniq(pool, "region"), function (k) { return VS.REGION[k] || k; }) +
          sel("theme", "Thema / Kategorie", uniq(pool, "theme")) + sel("index", "Index", uniq(pool, "index")) + sel("issuer", "Anbieter", uniq(pool, "issuer")) +
          sel("exchange", "Börse", uniq(pool, "exchange")) + sel("currency", "Währung", uniq(pool, "currency")) +
          '<select data-k="hist" aria-label="Historie">' + [["", "Historie: jede"], ["1", "≥ 1 Jahr"], ["3", "≥ 3 Jahre"], ["5", "≥ 5 Jahre"], ["10", "≥ 10 Jahre"]].map(function (h) { return opt(h[0], h[1], st.hist); }).join("") + '</select>' +
          '<select data-k="maxvol" aria-label="Schwankung">' + [["", "Schwankung: jede"], ["0.1", "bis 10 %"], ["0.15", "bis 15 %"], ["0.2", "bis 20 %"], ["0.3", "bis 30 %"]].map(function (h) { return opt(h[0], h[1], st.maxvol); }).join("") + '</select>' +
          '<select data-k="maxdd" aria-label="Größter Rückgang">' + [["", "Max. Rückgang: jeder"], ["-0.1", "nicht tiefer als −10 %"], ["-0.2", "nicht tiefer als −20 %"], ["-0.35", "nicht tiefer als −35 %"], ["-0.5", "nicht tiefer als −50 %"]].map(function (h) { return opt(h[0], h[1], st.maxdd); }).join("") + '</select>' +
          '<label class="vs-check"><input type="checkbox" data-k="trendUp"' + (st.trendUp ? " checked" : "") + '> Über Durchschnittslinie</label>' +
          (hasDist ? '<label class="vs-check"><input type="checkbox" data-k="dist"' + (st.dist ? " checked" : "") + '> Ausschüttungen beobachtet</label>' : '<select disabled aria-label="Ausschüttung" title="Ausschüttungsart: Datenquelle folgt"><option>Ausschüttungsart · Daten folgen</option></select>') +
          '<select data-k="maxcost" aria-label="Expense Ratio (US-Prospekt)">' + [["", "Expense Ratio: jede"], ["0.001", "bis 0,10 %"], ["0.002", "bis 0,20 %"], ["0.005", "bis 0,50 %"], ["0.01", "bis 1,00 %"]].map(function (h) { return opt(h[0], h[1], st.maxcost); }).join("") + '</select>' +
          '<select data-k="minaum" aria-label="Fondsvermögen">' + [["", "Fondsvermögen: jedes"], ["1e8", "ab 100 Mio. $"], ["1e9", "ab 1 Mrd. $"], ["1e10", "ab 10 Mrd. $"], ["1e11", "ab 100 Mrd. $"]].map(function (h) { return opt(h[0], h[1], st.minaum); }).join("") + '</select>' +
          '<select data-k="minpos" aria-label="Positionen">' + [["", "Positionen: beliebig"], ["50", "ab 50"], ["200", "ab 200"], ["500", "ab 500"], ["1000", "ab 1.000"]].map(function (h) { return opt(h[0], h[1], st.minpos); }).join("") + '</select>' +
          '<select data-k="maxt10" aria-label="Top-10-Konzentration">' + [["", "Top-10-Anteil: jeder"], ["0.2", "bis 20 %"], ["0.3", "bis 30 %"], ["0.4", "bis 40 %"], ["0.6", "bis 60 %"]].map(function (h) { return opt(h[0], h[1], st.maxt10); }).join("") + '</select>' +
          '<span class="vs-fine" style="align-self:center;font-weight:700">Datenabdeckung:</span>' +
          '<label class="vs-check"><input type="checkbox" data-k="hasPrice"' + (st.hasPrice ? " checked" : "") + '> Mit Kursanalyse</label>' +
          '<label class="vs-check"><input type="checkbox" data-k="hasHoldings"' + (st.hasHoldings ? " checked" : "") + '> Mit Holdings & X-Ray</label>' +
          '<label class="vs-check"><input type="checkbox" data-k="hasCost"' + (st.hasCost ? " checked" : "") + '> Mit Kosten</label>' +
          '<label class="vs-check"><input type="checkbox" data-k="complex"' + (st.complex ? " checked" : "") + '> Komplexe Produkte zeigen</label>' +
          '<label class="vs-check"><input type="checkbox" data-k="inactive"' + (st.inactive ? " checked" : "") + '> Inaktive zeigen</label></div>';
      }
      function filtered() {
        var list = st.q ? V.Master.search(all, st.q, 20000) : all.slice();
        return list.filter(function (e) {
          if (e.layer === "ARCHIVE" && !st.inactive) return false;
          // Komplexe Produkte: per Schalter oder als Suchtreffer (immer mit Bauart markiert)
          if (e.layer === "COMPLEX" && !st.complex && !st.q) return false;
          if (st.ptype && e.productType !== st.ptype) return false;
          if (st.strat && e.strategy !== st.strat) return false;
          if (st.ac && e.assetClass !== st.ac) return false;
          if (st.region && e.region !== st.region) return false;
          if (st.theme && e.theme !== st.theme) return false;
          if (st.index && e.index !== st.index) return false;
          if (st.issuer && e.issuer !== st.issuer) return false;
          if (st.exchange && e.exchange !== st.exchange) return false;
          if (st.currency && e.currency !== st.currency) return false;
          if (st.hist && !(e.m && e.m.hy >= Number(st.hist))) return false;
          if (st.maxvol && !(e.m && e.m.vol !== null && e.m.vol <= Number(st.maxvol))) return false;
          if (st.maxdd && !(e.m && e.m.mdd !== null && e.m.mdd >= Number(st.maxdd))) return false;
          if (st.trendUp && !(e.m && e.m.trend > 0)) return false;
          if (st.dist && !e.distributionPolicy) return false;
          // Fehlender Wert ist nicht 0: wer nach Kosten/Größe filtert, sieht nur Fonds mit belegtem Wert.
          if (st.maxcost && !(e.cost !== null && e.cost <= Number(st.maxcost))) return false;
          if (st.minaum && !(e.aum !== null && e.aum >= Number(st.minaum))) return false;
          if (st.minpos && !(e.positions !== null && e.positions >= Number(st.minpos))) return false;
          if (st.maxt10 && !(e.top10 !== null && e.top10 <= Number(st.maxt10))) return false;
          if (st.hasHoldings && !e.series) return false;
          if (st.hasPrice && !(e.m && e.m.hy > 0)) return false;
          if (st.hasCost && !(e.cost !== null && e.cost !== undefined)) return false;
          return true;
        });
      }
      // Schnellfilter (Chips) und Sortierung; alle Detailfilter im aufklappbaren Filter-Sheet. Liste statt Tabelle (Tabelle optional am Desktop).
      var QUICK = [["hasHoldings", "Mit Holdings & X-Ray"], ["hasCost", "Mit Kosten"], ["hist10", "≥ 10 Jahre Historie"], ["lowcost", "Kosten ≤ 0,20 %"], ["complex", "Komplexe zeigen"]];
      var SORTS = [["p1Y", "Rendite 1 Jahr"], ["p5Y", "Rendite 5 J. p. a."], ["p10Y", "Rendite 10 J. p. a."], ["hy", "Längste Historie"], ["vol", "Geringste Schwankung"], ["cost", "Niedrigste Kosten"], ["aum", "Größtes Fondsvermögen"], ["name", "Name A–Z"]];
      function qOn(k) { return k === "hist10" ? st.hist === "10" : k === "lowcost" ? st.maxcost === "0.002" : !!st[k]; }
      function qSet(k, on) { if (k === "hist10") st.hist = on ? "10" : ""; else if (k === "lowcost") st.maxcost = on ? "0.002" : ""; else st[k] = on; }
      var FKEYS = ["ptype", "strat", "ac", "region", "theme", "index", "issuer", "exchange", "currency", "hist", "maxvol", "maxdd", "maxcost", "minaum", "minpos", "maxt10"];
      function activeCount() { return FKEYS.filter(function (k) { return st[k]; }).length + ["trendUp", "dist", "hasHoldings", "hasPrice", "hasCost", "complex", "inactive"].filter(function (k) { return st[k]; }).length; }
      function primary(e) {
        var col = COLS.filter(function (c) { return c.id === st.sort; })[0];
        if (!col || col.id === "name" || col.id === "p1Y") return [e.m && e.m.p["1Y"], "1 Jahr", "pct"];
        var v = col.get(e);
        return [v, ({ p5Y: "5 J. p. a.", p10Y: "10 J. p. a.", p3Y: "3 J. p. a.", hy: "Historie", vol: "Schwankung", cost: "Kosten", aum: "Fondsvermögen", mdd: "Max. Rückgang", t10: "Top-10-Anteil" })[col.id] || col.label,
          col.cost ? "cost" : col.money ? "money" : col.years ? "years" : col.neutral || col.id === "mdd" ? "neutral" : "pct"];
      }
      function fmtP(x) { var v = x[0]; return x[2] === "cost" ? VS.costPct(v) : x[2] === "money" ? VS.money(v, "USD") : x[2] === "years" ? F.years(v) : x[2] === "neutral" ? F.pct(v) : F.spct(v); }
      function item(e) {
        var pr = primary(e), chips = [];
        if (e.cost !== null && e.cost !== undefined) chips.push('Kosten ' + VS.costPct(e.cost));
        if (e.m && e.m.vol !== null && e.m.vol !== undefined) chips.push('Schwankung ' + F.pct(e.m.vol, 0));
        if (e.m && e.m.hy && chips.length < 2) chips.push(F.years(e.m.hy));
        if (e.series) chips.push('<span class="vs-item-on">Holdings ✓</span>');
        return '<a class="vs-item" href="' + VS.etfHref(e) + '"><span class="vs-ava c-' + esc(e.assetClass || "") + (e.complex ? " cx" : "") + '" title="' + esc(e.issuer || "") + '">' + esc(VS.issuerShort(e)) + '</span>' +
          '<span class="vs-item-main"><span class="vs-item-top"><b>' + esc(e.symbol) + '</b>' + (e.retirementClass === "SEHR_KOMPLEX" ? '<span class="vs-badge bad">sehr komplex</span>' : e.complex ? '<span class="vs-badge complex">komplex</span>' : "") + (e.status === "INACTIVE" ? '<span class="vs-badge bad">inaktiv</span>' : "") + '</span>' +
          '<span class="vs-item-name">' + esc(VS.displayName(e.name)) + '</span><span class="vs-item-meta">' + chips.join(" · ") + '</span></span>' +
          '<span class="vs-item-perf"><b class="num ' + (pr[2] === "pct" ? F.cls(pr[0]) : "") + '">' + fmtP(pr) + '</b><small>' + esc(pr[1]) + '</small></span></a>';
      }
      function draw() {
        var list = filtered();
        var col = COLS.filter(function (c) { return c.id === st.sort; })[0] || COLS[3];
        list.sort(function (a, b) {
          var x = col.get(a), y = col.get(b);
          if (col.id === "name") return st.dir * String(x).localeCompare(String(y));
          var nx = x === null || x === undefined, ny = y === null || y === undefined;
          if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
          return st.dir * (x - y);
        });
        var nComplex = all.filter(function (e) { return e.layer === "COMPLEX"; }).length, nArch = all.filter(function (e) { return e.layer === "ARCHIVE"; }).length, nA = activeCount();
        var wasOpen = host.querySelector("details.vs-sheet") ? host.querySelector("details.vs-sheet").open : false;
        var asTable = st.view === "table" && (global.innerWidth || 1000) >= 760;
        host.innerHTML = '<div class="vs-etfs-head"><p class="vs-etfs-count"><b class="num">' + list.length.toLocaleString("de-DE") + '</b> ETFs</p><p class="vs-sub">' + (st.complex ? "Standard und komplex" : nComplex.toLocaleString("de-DE") + ' komplexe ausgeblendet') + VS.stale(m.asOf) + '</p></div>' +
          '<div class="vs-quickchips" role="group" aria-label="Schnellfilter">' + QUICK.map(function (q) { return '<button class="vs-qc" data-q="' + q[0] + '" aria-pressed="' + qOn(q[0]) + '">' + esc(q[1]) + '</button>'; }).join("") + '</div>' +
          '<div class="vs-toolbar"><select class="vs-sort" id="vs-sortsel" aria-label="Sortieren">' + SORTS.map(function (x) { return '<option value="' + x[0] + '"' + (st.sort === x[0] ? " selected" : "") + '>Sortiert: ' + esc(x[1]) + '</option>'; }).join("") + '</select>' +
          '<div class="vs-seg vs-viewsel" id="vs-viewsel" style="margin-left:auto"><button data-v="list" aria-pressed="' + !asTable + '">Liste</button><button data-v="table" aria-pressed="' + asTable + '">Tabelle</button></div></div>' +
          '<details class="vs-sheet"' + (wasOpen ? " open" : "") + '><summary><span>Alle Filter' + (nA ? '<span class="vs-badge lime">' + nA + ' aktiv</span>' : "") + '</span></summary><div class="vs-sheet-body">' + controls(all) + (nA ? '<button class="vs-pill small" id="vs-reset" style="margin-top:12px">Filter zurücksetzen</button>' : "") + '</div></details>' +
          (asTable ? '<div class="vs-table-wrap"><table class="vs-table"><caption class="vs-sr">ETF-Screener, sortierbar</caption><thead><tr>' + COLS.map(function (c) {
            return '<th scope="col" data-sort="' + c.id + '"' + (c.id === st.sort ? ' aria-sort="' + (st.dir < 0 ? "descending" : "ascending") + '"' : "") + ' tabindex="0">' + esc(c.label) + '</th>';
          }).join("") + '</tr></thead><tbody>' + list.slice(0, st.limit).map(function (e) {
            return '<tr><td><a href="' + VS.etfHref(e) + '">' + esc(e.symbol) + '</a> ' + (e.retirementClass === "SEHR_KOMPLEX" ? '<span class="vs-badge bad" title="Sehr komplex">⚠</span>' : e.complex ? '<span class="vs-badge complex" title="Komplexes Produkt">⚠</span>' : "") + (e.status === "INACTIVE" ? ' <span class="vs-badge bad">inaktiv</span>' : "") + '<span class="t-name">' + esc(e.name) + '</span><span class="t-name">' + esc(e.category) + '</span></td>' +
              COLS.slice(1).map(function (c) {
                var v = c.get(e);
                return '<td class="num ' + (c.pct && !c.neutral && c.id !== "mdd" ? F.cls(v) : "") + '">' + (c.cost ? VS.costPct(v) : c.money ? VS.money(v, "USD") : c.years ? F.years(v) : c.id === "mdd" || c.neutral ? F.pct(v) : F.spct(v)) + '</td>';
              }).join("") + '</tr>';
          }).join("") + '</tbody></table></div>'
            : '<div class="vs-list">' + list.slice(0, st.limit).map(item).join("") + '</div>') +
          (list.length > st.limit ? '<div style="text-align:center;margin-top:16px"><button class="vs-pill" id="vs-more">Weitere ' + Math.min(PAGE, list.length - st.limit) + ' von ' + (list.length - st.limit).toLocaleString("de-DE") + ' anzeigen</button></div>' : "") +
          (list.length === 0 ? '<div class="vs-empty">Kein ETF passt zu diesen Filtern.</div>' : "") +
          (st.q && list.length < 10 ? '<p class="vs-sub" style="margin-top:12px">Europäische UCITS-Anteilklassen: <a href="#/europa?q=' + encodeURIComponent(st.q) + '">„' + esc(st.q) + '“ in Europa suchen</a></p>' : "");
        host.querySelectorAll("select[data-k]").forEach(function (sx) { sx.addEventListener("change", function () { st[sx.dataset.k] = sx.value; st.limit = PAGE; draw(); }); });
        host.querySelectorAll("input[data-k]").forEach(function (c) { c.addEventListener("change", function () {
          if (c.dataset.k === "inactive" && c.checked && !m.extraLoaded) { VS.masterAll().then(function (full) { all = full.etfs.filter(function (e) { return e.layer !== "REVIEW"; }); m.extraLoaded = true; st.inactive = true; draw(); }); return; }
          st[c.dataset.k] = c.checked; st.limit = PAGE; draw(); }); });
        host.querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { qSet(b.dataset.q, !qOn(b.dataset.q)); st.limit = PAGE; draw(); }; });
        host.querySelector("#vs-sortsel").onchange = function () { st.sort = this.value; st.dir = /^(vol|cost|name)$/.test(st.sort) ? 1 : -1; st.limit = PAGE; draw(); };
        host.querySelectorAll("#vs-viewsel [data-v]").forEach(function (b) { b.onclick = function () { st.view = b.dataset.v; draw(); }; });
        var rs = host.querySelector("#vs-reset"); if (rs) rs.onclick = function () { FKEYS.forEach(function (k) { st[k] = ""; }); ["trendUp", "dist", "hasHoldings", "hasPrice", "hasCost", "complex", "inactive"].forEach(function (k) { st[k] = false; }); draw(); };
        host.querySelectorAll("th[data-sort]").forEach(function (th) {
          function go() { var id = th.dataset.sort; if (st.sort === id) st.dir *= -1; else { st.sort = id; st.dir = id === "vol" || id === "name" ? 1 : -1; } draw(); }
          th.addEventListener("click", go); th.addEventListener("keydown", function (ev) { if (ev.key === "Enter") go(); });
        });
        var more = host.querySelector("#vs-more"); if (more) more.onclick = function () { st.limit += PAGE; draw(); };
      }
      draw();
      VS.dm([["Herkunft", "Kosten, Fondsvermögen und Holdings aus Prospekt und Pflichtmeldungen · <a href=\"#/daten\">Datenabdeckung</a>"]], m.asOf);
      VS.lastRenderMs = ((global.performance && performance.now()) || 0) - t0;
    }).catch(function (e) { root.querySelector("#vs-screener").innerHTML = VS.pending("ETF-Verzeichnis nicht erreichbar", String(e.message || e)); });
  };

  /* ========================================================= ETF DETAIL */
  var RANGES = [["1M", 1], ["3M", 3], ["6M", 6], ["1J", 12], ["3J", 36], ["5J", 60], ["MAX", 0]];
  function slice(points, months) {
    if (!months) return points;
    var last = Date.parse(points[points.length - 1][0]), d = new Date(last); d.setUTCMonth(d.getUTCMonth() - months);
    var from = d.getTime();
    return points.filter(function (p) { return Date.parse(p[0]) >= from; });
  }
  function chartSeries(d, months) {
    if (!d.series) return [];
    var daily = d.series.daily || [], weekly = d.series.weekly || [];
    if (months && months <= 12 && daily.length > 20) return slice(daily, months);
    return slice(A.splice(weekly, daily).points, months);
  }

  var US_EX = { "NYSE": 1, "NYSE ARCA": 1, "NASDAQ": 1, "BATS": 1, "AMEX": 1, "NYSE MKT": 1 };
  function whatIsIt(e, d) {
    var parts = [], ac = VS.ASSET[e.assetClass] || null, s = (d && d.strategies) || [e.strategy];
    var has = function (k) { return s.indexOf(k) >= 0; };
    var type = { ETN: "eine Schuldverschreibung (ETN) – kein Fondsvermögen, Emittentenrisiko", ETC: "ein börsengehandeltes Rohstoffzertifikat (ETC)", ETP: "ein börsengehandeltes Produkt (ETP, z. B. Trust)", CEF: "ein geschlossener Fonds", MUTUAL_FUND: "ein offener Investmentfonds" }[e.productType];
    if (e.leverage > 1 || e.inverse) parts.push("Ein " + (e.inverse && e.leverage > 1 ? "Short-Hebelprodukt (" + e.leverage + "x)" : e.inverse ? "Short-Produkt" : e.leverage + "x-Hebelprodukt") + (e.singleStockUnderlying ? " auf die Einzelaktie " + e.singleStockUnderlying : "") + ". Es bildet die " + (e.inverse ? "umgekehrte " : "") + (e.leverage > 1 ? e.leverage + "-fache " : "") + "tägliche Bewegung ab; über längere Zeit weicht das Ergebnis deutlich davon ab.");
    else if (has("COVERED_CALL") || has("OPTION_INCOME")) parts.push("Ein ETF mit Optionsstrategie: Er verkauft Optionen, um Prämien einzunehmen. Steigende Kurse werden dadurch teilweise abgegeben.");
    else if (has("BUFFER") || has("DEFINED_OUTCOME")) parts.push("Ein Puffer- bzw. Defined-Outcome-ETF: Verluste und Gewinne sind über Optionen in einem festen Zeitraum begrenzt. Das Ergebnis hängt vom Einstiegszeitpunkt ab.");
    else if (e.assetClass === "CRYPTO") parts.push("Ein Krypto-Produkt mit sehr hohen Schwankungen – kein breit gestreuter Fonds.");
    else if (e.assetClass === "COMMODITY") parts.push("Ein Rohstoff-Produkt. Es hält Rohstoffe oder Terminkontrakte, keine Unternehmen.");
    else parts.push("Ein " + (d && d.management === "ACTIVE" ? "aktiv gemanagter " : e.index ? "Index-" : "") + "ETF" + (ac ? " auf " + ac : "") + (e.region ? " (" + (VS.REGION[e.region] || e.region) + ")" : "") + (e.index ? ", der den " + e.index + " abbildet" : "") + ".");
    if (type) parts.push("Rechtlich " + type + ".");
    if (e.issuer) parts.push("Anbieter: " + e.issuer + ".");
    return parts.join(" ");
  }
  function einordnung(e, d) {
    var m = d.metrics, out = [];
    var T = V.Taxonomy;
    out.push([e.retirementClass === "STANDARD" ? "ok" : "warn", (VS.RETIRE[e.retirementClass] || "") + ": " + (T ? T.RETIREMENT_TEXT[e.retirementClass] : "") + ((d.retirementReasons || []).length ? " (" + d.retirementReasons.join(", ") + ")" : "")]);
    if (!m) { out.push(["info", "Für diesen ETF liegen noch keine Kursdaten vor."]); return out; }
    if (m.historyYears < 1) out.push(["info", "Sehr kurze Historie (" + F.years(m.historyYears) + "): Kennzahlen sind wenig aussagekräftig."]);
    else if (m.historyYears >= 10) out.push(["ok", "Lange Historie (" + F.years(m.historyYears) + ")."]);
    if (m.volatility.value !== null) out.push(["info", m.volatility.value < 0.08 ? "Geringe Schwankung (" + F.pct(m.volatility.value) + " p.a.) – typisch für Anleihen/Geldmarkt." : m.volatility.value < 0.22 ? "Schwankung im Rahmen breiter Aktienmärkte (" + F.pct(m.volatility.value) + " p.a.)." : "Hohe Schwankung (" + F.pct(m.volatility.value) + " p.a.) – deutlich über breiten Aktienmärkten."]);
    if (m.maxDrawdown.value !== null && m.maxDrawdown.value < -0.3) out.push(["info", "Größter historischer Rückgang " + F.pct(m.maxDrawdown.value) + (m.maxDrawdown.recovered ? ", Erholung nach " + m.maxDrawdown.recoveryMonths + " Monaten." : ", bis heute nicht vollständig erholt.")]);
    if (e.region === "GLOBAL") out.push(["ok", "Breite regionale Ausrichtung laut Fondsname."]);
    if (e.currency && e.currency !== "EUR") out.push(["info", "Handelswährung " + e.currency + ". Das sagt nichts über die Währungen der Fondsinhalte – dieses Währungsrisiko ist ohne Holdings noch nicht verfügbar."]);
    if (US_EX[e.exchange]) out.push(["info", "US-Listing: Für Privatanleger in der EU meist nicht direkt handelbar (kein Basisinformationsblatt). Dient hier als Marktabbild."]);
    return out;
  }

  /** Zaehlt dieselben Punkte wie die Liste darunter: ✓ passt, ⚠ Achtung, • Hinweis. */
  function einordnungBilanz(list) {
    var kinds = [["ok", "✓", "passt"], ["warn", "⚠", "Achtung"], ["info", "•", list.filter(function (x) { return x[0] === "info"; }).length === 1 ? "Hinweis" : "Hinweise"]];
    var n = kinds.map(function (k) { return list.filter(function (x) { return x[0] === k[0]; }).length; });
    return '<p class="vs-bilanz" role="img" aria-label="' + kinds.map(function (k, i) { return n[i] + " " + k[2]; }).join(", ") + '">' + kinds.map(function (k, i) {
      return '<span class="' + k[0] + (n[i] ? "" : " is-zero") + '"><i>' + k[1] + '</i><b class="num">' + n[i] + '</b> ' + k[2] + '</span>'; }).join("") + '</p>';
  }

  VS.views.etf = function (r) {
    var sym = decodeURIComponent(r.args[0] || "").toUpperCase();
    var tab = r.query.tab || "uebersicht";
    var root = VS.render('<section class="vs-section"><div class="vs-loading">' + esc(sym) + ' wird geladen …</div></section>');
    VS.master().then(function (m) { return m.find(sym) ? m : VS.masterAll(); }).then(function (m0) {
      if (!m0.find(sym)) throw new Error("NOT_IN_INDEX");
      return Promise.all([m0, VS.etf(sym)]);
    }).then(function (res) {
      var m = res[0], d = res[1], e = m.find(sym);
      sym = e.slug;
      VS.analytics.track("etf_view", { symbol: e.symbol });
      var mt = d.metrics, watched = VS.state.watchlist.indexOf(sym) >= 0;
      // ETFs ohne eigenen N-PORT-Bestand (z. B. SPY, DIA, MDY als Unit Investment Trust): Referenzbestand eines
      // US-ETFs auf GENAU denselben Index (groesstes Fondsvermoegen) - klar als fremder Bestand gekennzeichnet.
      if (!(d.holdings && d.holdings.status === "AVAILABLE") && !e.complex && e.index && !/familie/i.test(e.index) && /^(NYSE|NASDAQ|BATS|ARCA|NYSE ARCA|AMEX|NYSE MKT)$/i.test(String(e.exchange || ""))) {
        var ref = m.etfs.filter(function (x) { return x.index === e.index && x.series && x.layer === "PUBLIC_ANALYSIS" && x.slug !== e.slug && /^(NYSE|NASDAQ|BATS|ARCA|NYSE ARCA|AMEX|NYSE MKT)$/i.test(String(x.exchange || "")); })
          .sort(function (a, b) { return (b.aum || 0) - (a.aum || 0); })[0];
        if (ref) d.holdings = { status: "AVAILABLE", source: "SEC_NPORT", sourceType: "REGULATORY", series: ref.series, path: "/vorsorge/data/holdings/" + ref.series + ".json",
          asOf: ref.holdingsAsOf, positions: ref.positions, top10: ref.top10, proxy: { symbol: ref.symbol, slug: ref.slug, name: ref.name, index: e.index, own: d.holdings } };
      }
      // Nur Tabs mit Daten: Kurse -> Performance/Risiko, Holdings -> Bestandteile/X-Ray/Aenderungen, Kostenquote -> Kosten.
      var hasH = d.holdings && d.holdings.status === "AVAILABLE", hasC = d.costs && d.costs.status === "AVAILABLE";
      var TABS = [["uebersicht", "Übersicht", true], ["performance", "Performance", !!mt], ["risiko", "Risiko", !!mt], ["bestandteile", "Bestandteile", hasH], ["xray", "ETF X-Ray", hasH],
        ["aenderungen", "Was hat sich geändert?", hasH || !!(hasC && d.costs.previousFiling)], ["kosten", "Kosten", hasC], ["daten", "Daten", true]].filter(function (t) { return t[2]; });
      tab = { inhalte: "bestandteile", faktoren: "xray", vergleich: "uebersicht" }[tab] || tab;
      var missingTab = !TABS.some(function (t) { return t[0] === tab; }) ? tab : null;
      if (missingTab) tab = "uebersicht";
      /* ETF-Kopf wie Aktienkopf C04 (ohne Perspektiven-Leiste), Reiter Überblick / Bestände / Risiko / Kosten, der Rest unter „Mehr“. */
      var MAIN = { uebersicht: "Überblick", bestandteile: "Bestände", risiko: "Risiko", kosten: "Kosten" };
      var mainTabs = TABS.filter(function (t) { return MAIN[t[0]]; }), moreTabs = TABS.filter(function (t) { return !MAIN[t[0]]; });
      var head = VS.U.stockHead({ ticker: e.symbol, name: VS.displayName(d.name || sym), what: "ETF · " + (e.category || VS.STRATEGY[e.strategy] || ""), price: mt && mt.price, currency: d.currency,
        changePct: mt && Number.isFinite(mt.change1D) ? mt.change1D * 100 : null, dateLabel: mt && mt.priceDate ? "Schluss " + F.date(mt.priceDate) : "", eurLabel: null, backHref: "#/etfs", saved: watched }, { persp: false });
      head = head.replace('<span class="vu-stockhead__meta">', '<span class="vu-stockhead__meta">' + esc((d.exchange || "") + (d.currency ? " · " + d.currency : "")) + '<br>');
      root.innerHTML = '<div class="vs-etfhead">' + head + (e.complex ? '<div style="margin-top:8px">' + VS.verdict("weak", VS.RETIRE[e.retirementClass] || "Komplexes Produkt") + '</div>' : "") + '</div>' +
        '<div class="vs-etf-sticky"><div class="vu-seg" role="tablist" aria-label="Bereiche">' + mainTabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + MAIN[t[0]] + '</button>'; }).join("") + '</div>' +
        (moreTabs.length ? '<div class="vs-moretabs"><span class="vu-xs vu-mu">Mehr:</span>' + moreTabs.map(function (t) { return '<button type="button" class="vu-chip" data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + t[1] + '</button>'; }).join("") + '</div>' : "") + '</div>' +
        (missingTab ? '<p class="vs-note" style="margin-top:12px">Für ' + esc(e.symbol) + ' gibt es diesen Bereich nicht: ' + esc({ performance: "keine Kursreihe", risiko: "keine Kursreihe", bestandteile: "keine Holdings (SEC N-PORT)", xray: "keine Holdings (SEC N-PORT)", aenderungen: "keine Holdings- oder Kostenhistorie", kosten: "keine Kostenquote aus dem Prospekt" }[missingTab] || "keine Daten") + '. Du siehst die Übersicht.</p>' : "") +
        '<div id="vs-etf-body"></div>' + VS.footer({ asOf: mt && mt.asOf, dm: [["Herkunft", "Kosten, Fondsvermögen und Holdings aus Prospekt und Pflichtmeldungen · Region, Index und Thema aus dem Fondsnamen abgeleitet"]] });
      root.querySelector("[data-vu-watch]").onclick = function () { var on = watchToggle(sym); this.setAttribute("aria-pressed", String(on)); };
      root.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; root.querySelectorAll("[data-tab]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); body(); }; });
      function body() {
        var host = root.querySelector("#vs-etf-body");
        var px = d.holdings && d.holdings.proxy && /^(bestandteile|xray|aenderungen)$/.test(tab) ? d.holdings.proxy : null;
        host.innerHTML = (px ? '<div class="vs-note" style="margin-top:16px"><b>Referenzbestand:</b> ' + esc(e.symbol) + ' meldet keinen eigenen Bestand an die SEC (N-PORT). Gezeigt wird der Bestand von <a href="#/etf/' + encodeURIComponent(px.slug) + '?tab=' + tab + '">' + esc(px.symbol) + '</a> (' + esc(px.name) + '), der denselben Index (' + esc(px.index) + ') abbildet. Die Zusammensetzung ist praktisch gleich; Gewichte können leicht abweichen.</div>' : "") + '<div id="vs-tab-c"></div>';
        (TAB_VIEWS[tab] || TAB_VIEWS.uebersicht)(host.querySelector("#vs-tab-c"), e, d, m);
        if (r.query.play === "1" && tab === "uebersicht" && VS.openPlanspiel) VS.openPlanspiel();
      }
      body();
    }).catch(function () {
      VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF Intelligence</p><h1>' + esc(sym) + ' nicht gefunden.</h1><p class="vs-lead">Dieser Ticker ist nicht im ETF-Verzeichnis. Vielleicht ist er als Aktie geführt oder (noch) nicht im aufgenommenen Universum.</p><div class="vs-tabs"><a class="vs-pill primary" href="#/etfs?q=' + encodeURIComponent(sym) + '">Im Screener suchen</a></div></section>');
    });
  };

  function quality(d) {
    var q = d.quality || {}, mt = d.metrics, pv = d.provenance || {};
    return '<div class="vs-card soft"><p class="vs-label">Datenqualität & Stand</p>' +
      '<div class="vs-row"><span>Quelle</span><span>' + esc((pv.sources || d.sources || []).join(", ")) + '</span></div>' +
      '<div class="vs-row"><span>Stand der Kurse</span><span>' + F.date(mt && mt.asOf) + VS.stale(mt && mt.asOf, d.status === "INACTIVE" ? 100000 : 7) + '</span></div>' +
      '<div class="vs-row"><span>Stand der Stammdaten</span><span>' + (pv.retrievedAt ? F.date(pv.retrievedAt) : "Repository-Auszug") + '</span></div>' +
      '<div class="vs-row"><span>Klassifikation</span><span style="text-align:right">' + esc(pv.classificationMethod || "–") + ' · Konfidenz ' + esc(pv.classificationConfidence || "–") + '</span></div>' +
      '<div class="vs-row"><span>Renditebasis</span><span>' + esc(mt ? mt.basisLabel : "–") + (d.metricsTotal ? " + Gesamtrendite" : "") + '</span></div>' +
      '<div class="vs-row"><span>Kurshistorie ab</span><span>' + F.date(d.priceHistoryFrom || (mt && mt.firstDate)) + '</span></div>' +
      '<div class="vs-row"><span>Fonds-Zuordnung</span><span style="text-align:right">' + esc(pv.canonicalizationMethod || "–") + '</span></div>' +
      '<div class="vs-row"><span>Stammdaten-Abdeckung</span><span>' + F.pct(q.coverage, 0) + '</span></div>' +
      '<div class="vs-row"><span>Fehlende Felder</span><span style="text-align:right">' + esc((q.missingFields || []).join(", ") || "–") + '</span></div>' +
      (pv.manualOverride ? '<div class="vs-row"><span>Manuelle Festlegung</span><span style="text-align:right">' + esc(pv.manualOverride) + '</span></div>' : "") +
      (d.tickerReuseSuspected ? '<p class="vs-fine" style="margin-top:8px">Hinweis: Das Kürzel wurde früher vermutlich von einem anderen Wertpapier genutzt (Anbieter-Startdatum ' + F.date(d.providerStartDate) + '). Ältere Kurse sind abgetrennt; die Historie beginnt am ' + F.date(d.priceHistoryFrom) + '.</p>' : "") +
      '<p class="vs-fine" style="margin-top:8px">Region, Index, Thema und Anbieter sind aus dem Fondsnamen abgeleitet; fehlende Werte werden nicht geschätzt. Das Kursdatum ist nicht das Auflagedatum des Fonds.</p></div>';
  }

  var TAB_VIEWS = {
    uebersicht: function (el, e, d) {
      /* V04 (Redesign 2027): ein Satz, der eine Chart, vier Zahlen mit Erklärung, Einordnung mit Urteilen,
         größte Firmen und Länder als Gewichtsbalken, „Bei deiner Bank“, dann Planspiel; DNA, Steckbrief und Qualität unter „Mehr“. */
      var mt = d.metrics, dna = d.dna || {}, U = VS.U;
      var trM = d.metricsTotal && d.metricsTotal.windows && d.metricsTotal.windows.MAX, prM = mt && mt.windows && mt.windows.MAX, useM = trM && Number.isFinite(trM.annualized) ? trM : prM;
      var hasH = d.holdings && d.holdings.status === "AVAILABLE", isUS = /^(NYSE|NASDAQ|BATS|ARCA|NYSE ARCA|AMEX|NYSE MKT)$/i.test(String(e.exchange || ""));
      var cost = d.costs && Number.isFinite(d.costs.value) ? d.costs.value : null;
      var ein = einordnung(e, d), VKIND = { ok: ["strong", "Passt"], warn: ["weak", "Achtung"], info: ["mid", "Hinweis"] };
      el.innerHTML = '<div class="vu-box vu-box--lime vs-oneline"><span class="vu-ltag">In einem Satz</span><p id="vs-hsum">' + esc(whatIsIt(e, d)) + '</p></div>' +
        '<section class="vs-etf-chart-sec"><div id="vs-etf-chart" style="margin-top:14px"></div><p class="vu-xs vu-mu">' + esc(mt ? mt.basisLabel : "") + '</p></section>' +
        '<div class="vu-grid" style="margin-top:12px">' +
        VS.tile(useM && useM.from ? "Pro Jahr seit " + useM.from.slice(0, 4) : "Pro Jahr", useM && Number.isFinite(useM.annualized) ? F.spct(useM.annualized) : "–", useM === trM ? "mit Ausschüttungen" : "nur Kurs", "Durchschnittliche Entwicklung pro Jahr seit Beginn der Kurshistorie.") +
        VS.tile("Schwankung", mt && mt.volatility && Number.isFinite(mt.volatility.value) ? F.pct(mt.volatility.value, 0) : "–", "pro Jahr", "Wie stark der Kurs typisch hoch und runter geht.") +
        VS.tile("Kosten", cost !== null ? VS.costPct(cost) : "k. A.", cost !== null ? "pro Jahr laut Prospekt" : "keine amtliche Quelle", "Laufende Kosten, automatisch vom Fondsvermögen abgezogen.") +
        VS.tile("Firmen", hasH && d.holdings.positions ? Number(d.holdings.positions).toLocaleString("de-DE") : "–", hasH ? (d.holdings.proxy ? "über " + d.holdings.proxy.symbol + " (gleicher Index)" : "SEC N-PORT " + F.date(d.holdings.asOf)) : "keine Bestandsdaten", "Anzahl der Positionen laut letztem Bestandsbericht.") + '</div>' +
        '<div class="vu-stack" style="margin-top:10px">' + (cost !== null ? VS.help("Kosten " + VS.costPct(cost) + ": Bei 1.000 € im ETF zahlst du rund " + (1000 * cost).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " € im Jahr. Sie werden automatisch abgezogen.") : "") + VS.help("Vergangene Entwicklung ist kein Versprechen für die Zukunft.") + '</div>' +
        VS.sect("Einordnung") + einordnungBilanz(ein) + '<div class="vu-box vs-kvbox">' + ein.map(function (x) { var k = VKIND[x[0]] || VKIND.info; return '<div class="vs-kv"><span class="vu-sm"><b>' + esc(x[1]) + '</b></span>' + VS.verdict(k[0], k[1]) + '</div>'; }).join("") + '</div>' +
        '<p class="vu-xs vu-mu" style="margin-top:6px">Einordnung aus Daten, keine Empfehlung.</p>' +
        '<section id="vs-ov-hold"></section><section id="vs-ov-bank"></section>' +
        '<div class="vs-btnrow"><button type="button" class="vu-btn" id="vs-goplay">' + U.glyph("target", 18) + ' Planspiel</button><a class="vu-btn vu-btn--line" href="#/vergleichen?s=' + encodeURIComponent(e.slug + (e.symbol !== "URTH" ? ",URTH" : ",SPY")) + '">Vergleichen</a></div>' +
        '<p class="vu-xs" style="margin-top:8px;text-align:center"><a class="vs-link" href="#/portfolio?add=' + encodeURIComponent(e.slug) + '">Zum Portfolio hinzufügen</a></p>' +
        '<details class="vu-more"><summary>Steckbrief</summary><div class="vu-more-body">' + VS.quickHeader(e, d) +
        '<div class="vs-row" style="margin-top:10px"><span>Produkttyp</span><span>' + esc(e.productType || "–") + ' · ' + esc(VS.STRATEGY[e.strategy] || "–") + '</span></div>' +
        '<div class="vs-row"><span>Index / Strategie</span><span>' + esc(e.index || (d.structure === "ACTIVE" ? "Aktiv gemanagt" : "nicht im Namen genannt")) + '</span></div>' +
        '<div class="vs-row"><span>Assetklasse</span><span>' + esc(VS.ASSET[e.assetClass] || "nicht zugeordnet") + '</span></div><div class="vs-row"><span>Region</span><span>' + esc(VS.REGION[e.region] || "nicht im Namen genannt") + '</span></div>' +
        '<div class="vs-row"><span>Thema</span><span>' + esc(e.theme || "–") + '</span></div><div class="vs-row"><span>Listings dieses Fonds</span><span>' + (d.listingsOfFund || 1) + '</span></div>' +
        (d.description ? '<p class="vu-ltag" style="margin-top:12px">Beschreibung des Datenanbieters (Originalsprache)</p><p class="vs-fine" style="margin-top:6px">' + esc(d.description) + '</p>' : "") + '</div></details>' +
        '<details class="vu-more"><summary>ETF-DNA</summary><div class="vu-more-body">' + Object.keys(dna).map(function (k) {
          var x = dna[k];
          return x.value === null ? '<div class="vs-kv"><span class="vu-sm"><b>' + esc(x.label) + '</b></span><span class="vu-xs vu-mu">' + esc(VS.STATUS_TEXT[x.status] || "Noch nicht verfügbar") + '</span></div>' : VS.wbar(x.label, x.value + "/100", x.value);
        }).join("") + '</div></details>' +
        '<details class="vu-more"><summary>Datenqualität & Stand</summary><div class="vu-more-body">' + quality(d) + '</div></details>';
      /* Planspiel als Sheet (C16), klar als Beispielrechnung markiert. */
      var playCtx = { symbol: e.symbol, slug: e.slug, name: d.name, complex: e.complex, us: isUS,
        cagr: useM ? useM.annualized : null, vol: mt && mt.volatility ? mt.volatility.value : null, since: useM && useM.from ? useM.from.slice(0, 4) : "", years: mt ? mt.historyYears : 0,
        basis: useM === trM ? "Gesamtrendite mit Ausschüttungen" : "nur Kurs – Ausschüttungen nicht enthalten" };
      VS.openPlanspiel = function () {
        var sh = VS.sheet("vs-play-s", "Planspiel", '<div class="vs-row-sb">' + VS.bsp() + '</div><p class="vu-sm vu-mu" style="margin-top:6px">Was wäre, wenn sich ' + esc(e.index || e.symbol) + ' so entwickelt wie bisher?</p><div id="vs-play" style="margin-top:10px"></div>');
        if (sh) VS.renderPlanspiel(sh.querySelector("#vs-play"), playCtx);
      };
      el.querySelector("#vs-goplay").onclick = VS.openPlanspiel;
      if (hasH) VS.holdings(d.holdings.series).then(function (f) {
        if (!f) return;
        var x = el.querySelector("#vs-hsum");
        if (f.summary) x.textContent = (d.holdings.proxy ? "Referenzbestand " + d.holdings.proxy.symbol + " (gleicher Index): " : "") + f.summary;
        var top = f.rows.slice(0, 6), mx = top.length ? top[0].weight : 1, c = ((f.exposures || {}).countries || []).filter(function (k) { return k.key !== "UNKNOWN"; });
        var shown = c.slice(0, 5), rest = c.slice(5).reduce(function (a, k) { return a + k.weight; }, 0), cmx = shown.length ? shown[0].weight : 1;
        el.querySelector("#vs-ov-hold").innerHTML = VS.sect("Größte Firmen im Korb", null) + top.map(function (h) {
          var id = VS.holdingIdentity ? VS.holdingIdentity(h) : {}, t = h.vuTicker || h.ticker || id.ticker || "";
          return '<div class="vs-hrow">' + VS.logo(t || "·") + '<span><b class="vu-sm">' + esc(h.name || t) + '</b><span class="vs-wbar-track"><i style="width:' + (h.weight / mx * 100).toFixed(1) + '%"></i></span></span><b class="num vu-sm">' + F.pct(h.weight, 2) + '</b></div>';
        }).join("") + '<p class="vu-xs vu-mu" style="margin-top:6px">Die 10 größten zusammen: ' + F.pct(f.concentration && f.concentration.top10, 1) + ' · Stand ' + F.date(f.asOf) + '</p>' +
          (shown.length ? VS.sect("Länder") + shown.map(function (k, i) { return VS.wbar(VS.countryName(k.key), F.pct(k.weight, 1), k.weight / cmx * 100, i === 0); }).join("") + (rest > 0.0005 ? VS.wbar("Weitere", F.pct(rest, 1), rest / cmx * 100) : "") : "");
      });
      if (isUS && e.index && !e.complex) VS.ucitsExamples(e.index, 4).then(function (list) {
        el.querySelector("#vs-ov-bank").innerHTML = '<div class="vu-box vu-box--ink vs-bank"><span class="vu-ltag">Bei deiner Bank</span><p class="vu-mt" style="font-size:17px">Such nach einem UCITS-ETF auf den „' + esc(e.index) + '“.</p>' +
          '<p class="vu-sm" style="opacity:.7">Das ist dieselbe Idee als europäisches Produkt. ' + (list.length ? "Beispiele aus dem ESMA-Register, keine Empfehlung:" : "Im ESMA-Register haben wir keine passende Anteilklasse mit diesem Indexnamen gefunden.") + '</p>' +
          (list.length ? '<p class="vs-mono" style="margin-top:8px">' + list.map(function (x) { return '<a href="#/europa/' + esc(x.isin) + '" style="color:inherit">' + esc(x.isin) + '</a>'; }).join(" · ") + '</p>' : "") + '</div>';
      });
      if (!mt) { el.querySelector("#vs-etf-chart").innerHTML = VS.pending("Keine Kursdaten", "Für diesen ETF liefert der Anbieter derzeit keine Kursreihe."); return; }
      if (global.VUChart) {
        // Gleiches Kursbild wie die Aktienseiten (assets/vu-chart.js): eine Linie, Startlinie, Achse rechts.
        global.VUChart.mount(el.querySelector("#vs-etf-chart"), { currency: d.currency || "USD", initial: "1J", label: "Kursverlauf " + d.symbol,
          ranges: RANGES.map(function (rg) { return { id: rg[0], label: rg[0], points: chartSeries(d, rg[1]) }; }).filter(function (x) { return x.points && x.points.length > 1; }) });
        return;
      }
      function draw(months) { var pts = chartSeries(d, months); VS.lineChart(el.querySelector("#vs-etf-chart"), [{ label: d.symbol, points: pts, area: true }], { label: "Kursverlauf " + d.symbol, fmtY: function (v) { return v.toLocaleString("de-DE", { maximumFractionDigits: 2 }); } }); }
      el.querySelectorAll("#vs-range button").forEach(function (b) { b.onclick = function () { el.querySelectorAll("#vs-range button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); draw(Number(b.dataset.m)); }; });
      draw(12);
    },
    performance: function (el, e, d) {
      var mt = d.metrics;
      if (!mt) { el.innerHTML = '<section class="vs-section">' + VS.pending("Keine Kursdaten", "Performance lässt sich ohne Kursreihe nicht berechnen.") + '</section>'; return; }
      var tr = d.metricsTotal, trState = (d.totalReturn || {}).state, mode = tr ? "total" : "price";
      var W = [["1M", "1 Monat"], ["3M", "3 Monate"], ["6M", "6 Monate"], ["YTD", "lfd. Jahr"], ["1Y", "1 Jahr"], ["3Y", "3 Jahre"], ["5Y", "5 Jahre"], ["10Y", "10 Jahre"], ["MAX", "Seit Start"]];
      function draw() {
        var mm = mode === "total" ? tr : mt, max = mm.windows.MAX || {};
        var items = W.map(function (w) { var x = mm.windows[w[0]] || {}, ann = x.annualized !== null && x.annualized !== undefined; return { label: w[1] + (ann ? " p.a." : ""), v: ann ? x.annualized : x.value, status: x.status }; });
        var lim = Math.max(0.05, Math.max.apply(null, items.map(function (x) { return Math.abs(x.v || 0); })));
        var years = (mm.yearlyReturns && mm.yearlyReturns.length ? mm.yearlyReturns : mt.yearlyReturns).slice(-20);
        var ylim = Math.max(0.05, Math.max.apply(null, years.map(function (y) { return Math.abs(y.value); })));
        var since = (max.from || mt.firstDate || "").slice(0, 4);
        el.innerHTML = '<section class="vs-section"><div class="vs-grid g2">' +
          '<div class="vs-card app"><p class="vs-label">' + (mode === "total" ? "Gesamtrendite seit " : "Kursentwicklung seit ") + esc(since) + '</p>' +
          '<p class="vs-kpi" style="margin-top:8px">' + F.pct(max.annualized, 1) + ' <span style="font-size:16px;color:var(--app-muted)">pro Jahr</span></p>' +
          (Number.isFinite(max.value) ? '<p style="margin-top:10px;font-size:16px">Aus <b>1.000 €</b> wurden <b style="color:var(--accent)">' + F.eur(1000 * (1 + max.value)) + '</b>.</p>' : "") +
          '<p class="vs-fine" style="margin-top:10px">' + (mode === "total" ? "Ausschüttungen reinvestiert, nach Fondskosten" : "ohne Ausschüttungen") + ' · in ' + esc(d.currency || "USD") + ' · vergangene Entwicklung, keine Prognose</p></div>' +
          '<div class="vs-card"><div class="vs-section-head" style="margin:0"><p class="vs-label">Rendite je Zeitraum</p>' + (tr ? '<div class="vs-seg" id="vs-pm"><button data-m="total" aria-pressed="' + (mode === "total") + '">mit Ausschüttungen</button><button data-m="price" aria-pressed="' + (mode === "price") + '">nur Kurs</button></div>' : "") + '</div>' +
          '<div class="vs-hbars">' + items.map(function (x) {
            if (x.v === null || x.v === undefined) return '<div class="vs-hbar"><span>' + esc(x.label) + '</span><span class="vs-fine">' + esc(VS.STATUS_TEXT[x.status] || "zu kurze Historie") + '</span><b></b></div>';
            var w = Math.min(50, Math.abs(x.v) / lim * 50), left = x.v >= 0 ? 50 : 50 - w;
            return '<div class="vs-hbar"><span>' + esc(x.label) + '</span><span class="rail"><span class="mid" style="left:50%"></span><i style="left:' + left.toFixed(1) + '%;width:' + Math.max(0.6, w).toFixed(1) + '%;background:' + (x.v >= 0 ? "var(--up)" : "var(--down)") + '"></i></span><b class="num ' + F.cls(x.v) + '">' + F.spct(x.v) + '</b></div>';
          }).join("") + '</div></div></div></section>' +
          '<section class="vs-section"><div class="vs-card"><p class="vs-label">Kalenderjahre' + (years.length ? " · " + years[0].year + "–" + years[years.length - 1].year : "") + '</p>' +
          (years.length ? '<div class="vs-years" role="img" aria-label="Rendite je Kalenderjahr"><span class="zero" style="bottom:calc(22px + 50% - 11px)"></span>' + years.map(function (y) {
            var h = Math.abs(y.value) / ylim * 50;
            return '<div class="y' + (y.value < 0 ? " neg" : "") + '" title="' + y.year + ': ' + F.spct(y.value) + '"><span style="position:absolute;left:0;right:0;display:flex;justify-content:center;' + (y.value >= 0 ? "bottom:50%" : "top:50%") + '"><i style="height:' + Math.max(1, h * 1.58).toFixed(1) + 'px;background:' + (y.value >= 0 ? "var(--up)" : "var(--down)") + '"></i></span><small>' + (years.length > 12 ? "’" + String(y.year).slice(2) : y.year) + '</small></div>';
          }).join("") + '</div><div class="vs-chips" style="margin-top:12px">' +
            '<span class="vs-chip">Positive Jahre: ' + years.filter(function (y) { return y.value > 0; }).length + ' von ' + years.length + '</span>' +
            (mt.bestYear ? '<span class="vs-chip">Bestes Jahr seit ' + esc((mt.firstDate || "").slice(0, 4)) + ': ' + esc(mt.bestYear.period || "") + ': ' + F.spct(mt.bestYear.value) + '</span>' : "") +
            (mt.worstYear ? '<span class="vs-chip">Schlechtestes Jahr seit ' + esc((mt.firstDate || "").slice(0, 4)) + ': ' + esc(mt.worstYear.period || "") + ': ' + F.spct(mt.worstYear.value) + '</span>' : "") + '</div>'
            : VS.pending("Noch kein vollständiges Kalenderjahr", "Die Kurshistorie ist kürzer als ein volles Kalenderjahr.")) + '</div></section>' +
          (!tr ? '<section class="vs-section">' + VS.pending("Gesamtrendite nicht verfügbar", trState === "TOTAL_RETURN_UNAVAILABLE" ? "Die Ausschüttungsdaten dieser Reihe ließen sich nicht widerspruchsfrei rekonstruieren. Wir zeigen deshalb nur die Kursentwicklung." : "Diese Kursreihe enthält keine Ausschüttungen. Wir nennen keine Gesamtrendite, solange Dividenden nicht korrekt enthalten sind.") + '</section>' : "");
        el.querySelectorAll("#vs-pm button").forEach(function (b) { b.onclick = function () { mode = b.dataset.m; draw(); }; });
      }
      draw();
    },
    risiko: function (el, e, d) {
      var mt = d.metrics;
      if (!mt) { el.innerHTML = '<section class="vs-section">' + VS.pending("Keine Kursdaten", "Risiko lässt sich ohne Kursreihe nicht berechnen.") + '</section>'; return; }
      var dd = mt.maxDrawdown;
      el.innerHTML = '<section class="vs-section"><div class="vs-grid g3">' +
        '<div class="vs-card app"><p class="vs-label">Schwankung</p><p class="vs-kpi">' + F.pct(mt.volatility.value) + '</p><p class="vs-fine">pro Jahr (annualisierte Volatilität, ' + esc(mt.volatility.basis === "weekly" ? "Wochenwerte" : "Tageswerte") + ')</p></div>' +
        '<div class="vs-card app"><p class="vs-label">Größter Rückgang</p><p class="vs-kpi down">' + F.pct(dd.value) + '</p><p class="vs-fine">vom Hoch ' + F.date(dd.peakDate) + ' bis zum Tief ' + F.date(dd.troughDate) + '</p></div>' +
        '<div class="vs-card app"><p class="vs-label">Erholungsdauer</p><p class="vs-kpi">' + (dd.recoveryDays !== null ? Math.round(dd.recoveryDays / 30.4) + " Mon." : dd.value === 0 ? "–" : "offen") + '</p><p class="vs-fine">' + (dd.recoveryDays !== null ? "bis das alte Hoch wieder erreicht war" : "altes Hoch bis heute nicht wieder erreicht") + '</p></div></div></section>' +
        '<section class="vs-section"><div class="vs-card"><div class="vs-grid g2"><div>' +
        '<div class="vs-row"><span>Bester Monat</span><span class="num up">' + F.spct(mt.bestMonth.value) + ' <span class="vs-fine">' + esc(mt.bestMonth.period || "") + '</span></span></div>' +
        '<div class="vs-row"><span>Schlechtester Monat</span><span class="num down">' + F.spct(mt.worstMonth.value) + ' <span class="vs-fine">' + esc(mt.worstMonth.period || "") + '</span></span></div></div><div>' +
        '<div class="vs-row"><span>Bestes Jahr</span><span class="num up">' + F.spct(mt.bestYear.value) + ' <span class="vs-fine">' + esc(mt.bestYear.period || "") + '</span></span></div>' +
        '<div class="vs-row"><span>Schlechtestes Jahr</span><span class="num down">' + F.spct(mt.worstYear.value) + ' <span class="vs-fine">' + esc(mt.worstYear.period || "") + '</span></span></div></div></div>' +
        '<div class="vs-row"><span>Abwärtsschwankung (nur Verluste, p.a.)</span><span class="num">' + F.pct(mt.downsideDeviation && mt.downsideDeviation.value) + '</span></div>' +
        '<div class="vs-row"><span>Dauer des größten Rückgangs (Hoch → Tief)</span><span class="num">' + (dd.durationDays !== null && dd.durationDays !== undefined ? Math.round(dd.durationDays / 30.44) + " Monate" : "–") + '</span></div>' +
        '<p class="vs-fine" style="margin-top:10px">Volatilität über die letzten 5 Jahre (bzw. die vorhandene Historie); Rückgang, Monate und Jahre über die gesamte gelieferte Historie ab ' + F.date(mt.firstDate) + '.</p></div></section>' +
        '<section class="vs-section"><div class="vs-grid g2">' + [["Rollierende 1-Jahres-Ergebnisse", mt.rolling1Y, false], ["Rollierende 3-Jahres-Ergebnisse (p.a.)", mt.rolling3Y, true]].map(function (x) {
          var r = x[1] || {};
          return '<div class="vs-card"><p class="vs-label">' + x[0] + '</p>' + (r.worst === undefined ? VS.pending("Historie zu kurz", "Dafür braucht es mindestens " + (x[2] ? "4" : "2") + " Jahre Kurshistorie.")
            : '<div class="vs-row"><span>Schlechtester Zeitraum</span><span class="num down">' + F.spct(r.worst) + '</span></div><div class="vs-row"><span>Median</span><span class="num">' + F.spct(r.median) + '</span></div><div class="vs-row"><span>Bester Zeitraum</span><span class="num up">' + F.spct(r.best) + '</span></div><div class="vs-row"><span>Anteil positiver Zeiträume</span><span class="num">' + F.pct(r.positiveShare, 0) + '</span></div><p class="vs-fine">' + r.count + ' überlappende Zeiträume, Wochenwerte. Vergangenheit, keine Prognose.</p>') + '</div>';
        }).join("") + '</div></section>';
    },
    bestandteile: function (el, e, d) { VS.renderBestandteile(el, e, d); },
    xray: function (el, e, d) { VS.renderXray(el, e, d); },
    aenderungen: function (el, e, d) { VS.renderChanges(el, e, d); },
    kosten: function (el, e, d) { VS.renderKosten(el, e, d); },
    daten: function (el, e, d) { VS.renderDaten(el, e, d, quality(d)); }
  };

  /* ============================================================ COMPARE */
  VS.views.vergleich = function (r) {
    var syms = (r.query.s || "URTH,SPY").split(",").map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 4);
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF-Vergleich</p><h1>Wo unterscheiden<br>sie sich wirklich?</h1><p class="vs-lead">2 bis 4 ETFs nebeneinander. Kein Gewinner – nur die größten Unterschiede.</p>' +
      '<form class="vs-search" id="vs-cmp-form"><span aria-hidden="true">+</span><input id="vs-cmp-q" placeholder="ETF hinzufügen (Ticker oder Name)" autocomplete="off" aria-label="ETF hinzufügen"><button type="submit">Hinzufügen</button></form><div class="vs-suggest" id="vs-cmp-s"></div>' +
      '<div class="vs-tabs" id="vs-cmp-chips"></div></section><section class="vs-section" id="vs-cmp"><div class="vs-loading">…</div></section>');
    VS.master().then(function (m) {
      syms = syms.map(function (s) { var e = m.find(s); return e ? e.slug : null; }).filter(Boolean);
      var chips = root.querySelector("#vs-cmp-chips");
      chips.innerHTML = syms.map(function (s) { return '<a class="vs-pill small primary" href="#/vergleich?s=' + encodeURIComponent(syms.filter(function (x) { return x !== s; }).join(",")) + '" aria-label="' + s + ' entfernen">' + esc(s) + ' ×</a>'; }).join("");
      var q = root.querySelector("#vs-cmp-q"), box = root.querySelector("#vs-cmp-s");
      q.addEventListener("input", function () {
        var res = V.Master.search(m.etfs.filter(function (e) { return e.layer !== "REVIEW"; }), q.value, 6);
        box.innerHTML = res.length ? '<ul>' + res.map(function (e) { return '<li><a href="#/vergleich?s=' + encodeURIComponent(syms.concat(e.slug).slice(-4).join(",")) + '"><span><b>' + esc(e.symbol) + '</b> · ' + esc(e.name) + '</span></a></li>'; }).join("") + '</ul>' : "";
      });
      root.querySelector("#vs-cmp-form").addEventListener("submit", function (ev) { ev.preventDefault();
        // Europaeische ISIN: kein Kurs-/Holdings-/Kostenvergleich mit US-Listings (keine gemeinsamen Kennzahlen) -> EU-Vergleich der Stammdaten
        if (/^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(q.value.trim())) { box.innerHTML = '<p class="vs-sub" style="margin-top:8px">Europäische Anteilklassen haben hier keine Kurse, Holdings oder Kosten – ein Vergleich mit US-ETFs wäre Scheingenauigkeit. <a href="#/europa/vergleich?i=' + encodeURIComponent(q.value.trim().toUpperCase()) + '">Europäische Anteilklassen vergleichen</a> (Stamm- und Registerdaten).</p>'; return; }
        var hit = V.Master.search(m.etfs, q.value, 1)[0]; if (hit) VS.go("#/vergleich?s=" + encodeURIComponent(syms.concat(hit.slug).slice(-4).join(","))); });
      var host = root.querySelector("#vs-cmp");
      if (syms.length < 2) { host.innerHTML = VS.pending("Mindestens zwei ETFs", "Füge oben einen weiteren ETF hinzu."); return; }
      VS.analytics.track("etf_compare", { symbols: syms.join(",") });
      Promise.all(syms.map(VS.etf)).then(function (ds) { drawCompare(host, ds, m); });
    });
  };

  function drawCompare(host, ds, m) {
    function val(d, path) { try { return path.split(".").reduce(function (o, k) { return o === null || o === undefined ? null : o[k]; }, d); } catch (e) { return null; } }
    var rows = [
      ["Kategorie", function (d) { return esc((m.find(d.slug) || {}).category || "–"); }],
      ["Produkttyp · Bauart", function (d) { var e = m.find(d.slug) || {}; return esc((e.productType || "–") + " · " + (VS.STRATEGY[e.strategy] || "–")); }],
      ["Vorsorge-Einordnung", function (d) { return esc(VS.RETIRE[d.retirementClass] || "–"); }],
      ["Index", function (d) { return esc(d.index || "–"); }], ["Anbieter", function (d) { return esc(d.issuer || "–"); }],
      ["Börse · Währung", function (d) { return esc((d.exchange || "–") + " · " + (d.currency || "–")); }],
      ["Region", function (d) { return esc(VS.REGION[d.region] || "–"); }],
      ["Kursentwicklung 1J", function (d) { return F.spct(val(d, "metrics.windows.1Y.value")); }, "metrics.windows.1Y.value"],
      ["3J p.a.", function (d) { return F.spct(val(d, "metrics.windows.3Y.annualized")); }, "metrics.windows.3Y.annualized"],
      ["5J p.a.", function (d) { return F.spct(val(d, "metrics.windows.5Y.annualized")); }, "metrics.windows.5Y.annualized"],
      ["Schwankung p.a.", function (d) { return F.pct(val(d, "metrics.volatility.value")); }, "metrics.volatility.value"],
      ["Größter Rückgang", function (d) { return F.pct(val(d, "metrics.maxDrawdown.value")); }, "metrics.maxDrawdown.value"],
      ["Historie", function (d) { return F.years(val(d, "metrics.historyYears")); }],
      ["Expense Ratio (US-Prospekt)", function (d) { return d.costs && d.costs.status === "AVAILABLE" && d.costs.value !== null ? VS.costPct(d.costs.value) : '<span class="vs-fine">Quelle fehlt</span>'; }, "costs.value"],
      ["Fondsvermögen (alle Anteilklassen)", function (d) { var a = d.fundamentals && d.fundamentals.aum; return a ? VS.money(a.value, "USD") + ' <span class="vs-fine">' + F.date(a.asOf) + '</span>' : '<span class="vs-fine">Quelle fehlt</span>'; }],
      ["Positionen", function (d) { return d.holdings && d.holdings.positions ? d.holdings.positions.toLocaleString("de-DE") : '<span class="vs-fine">keine Holdings</span>'; }],
      ["Top-10-Anteil", function (d) { return d.holdings && d.holdings.top10 !== undefined && d.holdings.top10 !== null ? F.pct(d.holdings.top10) : '<span class="vs-fine">–</span>'; }, "holdings.top10"],
      ["Domizil · UCITS", function (d) { var f = d.fundamentals || {}; return f.domicile ? esc(f.domicile.value) + " · " + (f.ucits && f.ucits.value === false ? "kein UCITS" : "–") : '<span class="vs-fine">unbekannt</span>'; }],
      ["Ausschüttung", function (d) { return d.distributionPolicy === "DISTRIBUTING_OBSERVED" ? "beobachtet" : '<span class="vs-fine">unbekannt</span>'; }],
      ["Replikation · Tracking Difference", function () { return '<span class="vs-fine">Quelle fehlt</span>'; }],
      ["Gesamtrendite 1J", function (d) { return d.metricsTotal ? F.spct(d.metricsTotal.windows["1Y"].value) : '<span class="vs-fine">nicht verfügbar</span>'; }],
      ["Kurshistorie ab", function (d) { return F.date(d.priceHistoryFrom || (d.metrics && d.metrics.firstDate)); }]
    ];
    // Die groessten Unterschiede: normierte Spannweite je Kennzahl
    var diffs = [];
    function spread(label, path, scale, text) {
      var vals = ds.map(function (d) { return { s: d.symbol, v: val(d, path) }; }).filter(function (x) { return x.v !== null && x.v !== undefined; });
      if (vals.length < 2) return;
      vals.sort(function (a, b) { return a.v - b.v; });
      var lo = vals[0], hi = vals[vals.length - 1];
      diffs.push({ score: (hi.v - lo.v) / scale, text: text(lo, hi) });
    }
    spread("vol", "metrics.volatility.value", 0.05, function (lo, hi) { return hi.s + ": höhere Schwankung (" + F.pct(hi.v) + " p.a.) · " + lo.s + ": geringere Schwankung (" + F.pct(lo.v) + " p.a.)."; });
    spread("mdd", "metrics.maxDrawdown.value", 0.1, function (lo, hi) { return "Größter Rückgang: " + lo.s + " " + F.pct(lo.v) + ", " + hi.s + " " + F.pct(hi.v) + " – beachte die unterschiedlich langen Historien."; });
    spread("1y", "metrics.windows.1Y.value", 0.05, function (lo, hi) { return "Kursentwicklung der letzten 12 Monate: " + hi.s + " " + F.spct(hi.v) + ", " + lo.s + " " + F.spct(lo.v) + " (Vergangenheit, kein Qualitätsurteil)."; });
    spread("cost", "costs.value", 0.001, function (lo, hi) { return "Laufende Kosten laut Prospekt: " + hi.s + " " + VS.costPct(hi.v) + " · " + lo.s + " " + VS.costPct(lo.v) + "."; });
    spread("t10", "holdings.top10", 0.1, function (lo, hi) { return "Konzentration: Die zehn größten Positionen machen bei " + hi.s + " " + F.pct(hi.v) + " aus, bei " + lo.s + " " + F.pct(lo.v) + "."; });
    spread("hy", "metrics.historyYears", 3, function (lo, hi) { return hi.s + ": längere Historie (" + F.years(hi.v) + ") · " + lo.s + ": " + F.years(lo.v) + " – Kennzahlen sind nur begrenzt vergleichbar."; });
    var regions = ds.map(function (d) { return d.region; }); if (regions.some(function (r) { return r !== regions[0]; })) diffs.push({ score: 2, text: "Unterschiedliche Regionen: " + ds.map(function (d) { return d.symbol + " " + (VS.REGION[d.region] || "unbekannt"); }).join(", ") + "." });
    if (ds.some(function (d) { return d.complex; }) && ds.some(function (d) { return !d.complex; })) diffs.push({ score: 3, text: "Mindestens ein komplexes Produkt im Vergleich: " + ds.filter(function (d) { return d.complex; }).map(function (d) { return d.symbol; }).join(", ") + "." });
    diffs.sort(function (a, b) { return b.score - a.score; });
    // gemeinsame Basis 100
    var common = A.portfolioSeries(ds.map(function (d) { return { weight: 1, points: (d.series && d.series.weekly) || [] }; }));
    var from = common.from;
    var series = ds.map(function (d) {
      var pts = A.clean((d.series && d.series.weekly) || []).filter(function (p) { return !from || p[0] >= from; });
      var b = pts.length ? pts[0][1] : 1;
      return { label: d.symbol, points: pts.map(function (p) { return [p[0], p[1] / b * 100]; }) };
    });
    host.innerHTML = '<div class="vs-card app"><p class="vs-label">Die größten Unterschiede</p><div style="margin-top:8px">' + (diffs.length ? diffs.slice(0, 5).map(function (x, i) { return '<div class="vs-row"><span style="color:var(--app-ink)">' + (i + 1) + '. ' + esc(x.text) + '</span></div>'; }).join("") : '<p class="vs-sub">Zu wenige Daten für einen Vergleich.</p>') + '</div></div>' +
      '<div class="vs-card" style="margin-top:14px"><p class="vs-label">Entwicklung seit gemeinsamem Start ' + F.date(from) + ' (= 100)</p><div id="vs-cmp-chart" style="margin-top:8px"></div></div>' +
      '<div class="vs-table-wrap" style="margin-top:14px"><table class="vs-table"><thead><tr><th scope="col">Merkmal</th>' + ds.map(function (d) { return '<th scope="col"><a href="#/etf/' + d.symbol + '">' + esc(d.symbol) + '</a></th>'; }).join("") + '</tr></thead><tbody>' +
      rows.map(function (rw) { return '<tr><td>' + esc(rw[0]) + '</td>' + ds.map(function (d) { return '<td>' + rw[1](d) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div>';
    if (common.status === "CALCULATED") VS.lineChart(host.querySelector("#vs-cmp-chart"), series, { label: "Vergleich normiert", fmtY: function (v) { return v.toFixed(0); } });
    else host.querySelector("#vs-cmp-chart").innerHTML = VS.pending("Keine gemeinsame Historie", "Die Kursreihen überschneiden sich zeitlich nicht ausreichend.");
    // Ueberschneidung der Bestaende (paarweise)
    var ov = document.createElement("div"); ov.className = "vs-card"; ov.style.marginTop = "14px"; host.appendChild(ov);
    ov.innerHTML = '<p class="vs-label">Überschneidung der Bestände</p><div class="vs-loading">…</div>';
    Promise.all(ds.map(function (d) { return d.holdings && d.holdings.status === "AVAILABLE" ? VS.holdings(d.holdings.series) : Promise.resolve(null); })).then(function (hs) {
      var pairs = [];
      for (var i = 0; i < ds.length; i++) for (var j = i + 1; j < ds.length; j++) pairs.push([i, j]);
      ov.innerHTML = '<p class="vs-label">Überschneidung der Bestände</p>' + pairs.map(function (pr) {
        var a = hs[pr[0]], b = hs[pr[1]], A_ = ds[pr[0]].symbol, B_ = ds[pr[1]].symbol;
        if (!a || !b) return '<div class="vs-row"><span>' + esc(A_ + " ↔ " + B_) + '</span><span class="vs-fine">Für mindestens einen ETF liegen keine Bestandsdaten vor.</span></div>';
        if (a.seriesId === b.seriesId) return '<div class="vs-row"><span>' + esc(A_ + " ↔ " + B_) + '</span><span>derselbe Fonds (Anteilklassen einer Serie)</span></div>';
        var o = X.overlap(VS.xrayFile(a), VS.xrayFile(b));
        return '<div class="vs-row"><span><b>' + esc(A_ + " ↔ " + B_) + '</b><span class="t-name">gemeinsam: ' + esc(o.top.slice(0, 5).map(function (c) { return c.name; }).join(", ") || "–") + '</span></span><span class="num" style="text-align:right">' + F.pct(o.weightedOverlap) + ' gewichtet<br><span class="vs-fine">' + o.commonCount + ' gemeinsame Positionen</span></span></div>';
      }).join("") + '<p class="vs-fine" style="margin-top:8px">Gewichtete Überschneidung = Summe der jeweils kleineren Gewichte gemeinsamer Positionen. Basis: die bis zu 100 größten Positionen je ETF (SEC N-PORT); Stichtage können sich unterscheiden.</p>';
    });
  }

  /* ========================================================== WATCHLIST */
  VS.views.watchlist = function () {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Watchlist</p><h1>ETFs beobachten.</h1><p class="vs-lead">Performance, Status und Änderungen deiner beobachteten ETFs. Gespeichert nur in diesem Browser.</p></section><section class="vs-section" id="vs-wl"><div class="vs-loading">…</div></section>');
    var isIsin = function (s) { return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s); };
    Promise.all([VS.masterAll(), VS.getJSON("/vorsorge/data/changes.json").catch(function () { return { events: [] }; }),
      VS.state.watchlist.some(isIsin) ? VS.euIndex().catch(function () { return null; }) : null]).then(function (res) {
      var m = res[0], ch = res[1], ej = res[2], list = VS.state.watchlist.map(function (s) { return m.find(s); }).filter(Boolean);
      // Europaeische Anteilklassen (ISIN): Stammdaten und Register, keine Kurse/Holdings/Kosten
      var euItems = ej ? VS.state.watchlist.filter(isIsin).map(function (s) { return ej.byIsin[s]; }).filter(Boolean) : [];
      var missing = VS.state.watchlist.filter(function (s) { return !m.find(s) && !(ej && ej.byIsin[s]); });
      var host = root.querySelector("#vs-wl");
      var euBlock = euItems.length ? '<div class="vs-card" style="margin-top:14px"><p class="vs-label">Europäische Anteilklassen</p>' + euItems.map(function (x) {
        return '<div class="vs-row"><span><a href="#/europa/' + esc(x.isin) + '"><b>' + esc(x.isin) + '</b></a> ' + esc(x.name) + '</span><span class="vs-fine" style="text-align:right">' + (x.reg ? "UCITS-Zuordnung über ESMA-Register" + (x.reg.hosts.indexOf("DE") >= 0 ? " · Vertrieb in Deutschland gemeldet" : "") : "kein Registertreffer") + '</span></div>'; }).join("") +
        '<p class="vs-fine" style="margin-top:6px">Für europäische Anteilklassen sind Kurse, Holdings und Kosten noch nicht verfügbar.</p></div>' : "";
      if (!list.length && euItems.length) { host.innerHTML = euBlock; return; }
      if (!list.length) { host.innerHTML = '<div class="vs-card soft vs-empty">Noch keine ETFs beobachtet. Öffne einen ETF und tippe auf „♡ Beobachten“.<div class="vs-tabs" style="justify-content:center"><a class="vs-pill primary" href="#/etfs">ETFs entdecken</a></div></div>'; return; }
      var changed = list.filter(function (e) { return e.holdingsChanges > 0; });
      host.innerHTML = '<div class="vs-card app"><p class="vs-label">Seit dem letzten Holdings-Update</p><p style="margin-top:6px;color:var(--app-ink);font-size:17px">' +
        (changed.length ? changed.length + " von " + list.length + " beobachteten ETFs mit relevanten Änderungen im Bestand." : "Keine relevanten Bestandsänderungen bei deinen beobachteten ETFs.") + '</p><p class="vs-fine" style="color:var(--app-muted)">Quelle: SEC N-PORT (quartalsweise, rund 60 Tage verzögert). Für Fonds ohne N-PORT-Meldung gibt es keine Bestandsänderungen.</p></div>' +
        '<div class="vs-table-wrap" style="margin-top:14px"><table class="vs-table"><thead><tr><th>ETF</th><th>Kurs</th><th>1 Tag</th><th>1J</th><th>Schwankung</th><th>Status</th><th>Kostenquote</th><th>Fondsvermögen (Fonds)</th><th>Bestand</th></tr></thead><tbody>' + list.map(function (e) {
        var evs = ch.events.filter(function (x) { return x.symbol === e.symbol; });
        var hc = e.holdingsAsOf ? (e.holdingsChanges > 0 ? '<a href="' + VS.etfHref(e) + '?tab=aenderungen">' + e.holdingsChanges + ' relevante Änderung' + (e.holdingsChanges === 1 ? "" : "en") + '</a>' : '<span class="vs-fine">keine relevanten Änderungen</span>') + '<span class="t-name">Stand ' + F.date(e.holdingsAsOf) + '</span>' : '<span class="vs-fine">keine Bestandsdaten</span>';
        return '<tr><td><a href="' + VS.etfHref(e) + '">' + esc(e.symbol) + '</a><span class="t-name">' + esc(e.name) + '</span><span class="t-name">' + esc(e.index || e.category) + '</span></td><td class="num">' + F.price(e.m && e.m.price, e.currency) + '</td><td class="num ' + F.cls(e.m && e.m.d1) + '">' + F.spct(e.m && e.m.d1, 2) + '</td><td class="num ' + F.cls(e.m && e.m.p["1Y"]) + '">' + F.spct(e.m && e.m.p["1Y"]) + '</td><td class="num">' + F.pct(e.m && e.m.vol) + '</td><td>' + (e.status === "INACTIVE" ? '<span class="vs-badge bad">inaktiv</span>' : e.layer === "REVIEW" ? '<span class="vs-badge bad">in Prüfung</span>' : "aktiv") + (evs.length ? '<span class="t-name">' + esc(evs[0].text) + '</span>' : "") + '</td>' +
          '<td class="num">' + (e.cost !== null ? VS.costPct(e.cost) : '<span class="vs-fine">–</span>') + '</td><td class="num">' + (e.aum !== null ? VS.money(e.aum, "USD") : '<span class="vs-fine">–</span>') + '</td><td>' + hc + '</td></tr>';
      }).join("") + '</tbody></table></div>' + euBlock + (missing.length ? '<p class="vs-fine" style="margin-top:10px">Nicht mehr im Verzeichnis: ' + esc(missing.join(", ")) + ' (Ticker entfernt oder umbenannt).</p>' : "");
    });
  };
})(window);
