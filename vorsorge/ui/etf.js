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
  VS.views.etfs = function (r) {
    var q = r.query || {};
    var st = { q: q.q || "", ac: q.ac || "", region: q.region || "", theme: q.theme || "", issuer: q.issuer || "", exchange: q.exchange || "", currency: q.currency || "",
      index: q.index || "", hist: q.hist || "", ptype: q.ptype || "", strat: q.strat || "", rc: q.rc || "", maxvol: "", maxdd: "", trendUp: false, dist: false,
      maxcost: q.maxcost || "", minaum: q.minaum || "", minpos: "", maxt10: "", hasHoldings: q.holdings === "1", dom: q.dom || "",
      complex: q.complex === "1", inactive: false, hasPrice: q.price === "1", hasCost: q.cost === "1", sort: q.sort || "p1Y", dir: -1, limit: 50, row: q.row || "" };
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF Intelligence</p><h1>Die ETF-Welt.<br>Klar eingeordnet.</h1><p class="vs-lead">US-gelistete ETFs mit echter Kurshistorie, Schwankung und größtem Rückgang – und, wo die SEC-Daten reichen, mit Holdings, X-Ray und Kosten laut Prospekt. Hebel-, Short-, Options- und Krypto-Produkte sind getrennt und markiert. Europäische UCITS-Anteilklassen findest du über ISIN im Bereich Europa.</p>' + VS.marketSwitch("us") +
      '<form id="vs-search-form" class="vs-search" role="search"><span aria-hidden="true">⌕</span><input id="vs-q" autocomplete="off" value="' + esc(st.q) + '" placeholder="Ticker, ISIN, Name, Index, Thema, Anbieter …" aria-label="ETFs durchsuchen"><button type="submit">Suchen</button></form><div class="vs-suggest" id="vs-suggest"></div></section>' +
      '<section class="vs-section" id="vs-rows"></section><section class="vs-section" id="vs-screener"><div class="vs-loading">ETF-Verzeichnis wird geladen …</div></section>');
    (q.inactive === "1" ? VS.masterAll() : VS.master()).then(function (m) {
      var t0 = (global.performance && performance.now()) || 0;
      var host = root.querySelector("#vs-screener");
      var all = m.etfs.filter(function (e) { return e.layer !== "REVIEW"; });
      var input = root.querySelector("#vs-q"), timer = null;
      root.querySelector("#vs-search-form").addEventListener("submit", function (ev) { ev.preventDefault();
        if (/^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(input.value.trim())) { VS.go("#/europa/" + input.value.trim().toUpperCase()); return; }
        st.q = input.value; st.limit = 50; draw(); VS.analytics.track("etf_search", { query: st.q.slice(0, 40) }); });
      input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { st.q = input.value; st.limit = 50; draw(); }, 140); });
      var hasDist = all.some(function (e) { return e.distributionPolicy; });
      drawRows();
      function drawRows() {
        var el = root.querySelector("#vs-rows");
        var std = all.filter(function (e) { return e.layer === "PUBLIC_ANALYSIS"; });
        var rows = ROWS.map(function (rw) {
          var list = std.filter(rw.test).sort(function (a, b) { return ((b.m && b.m.hy) || 0) - ((a.m && a.m.hy) || 0); });
          return { rw: rw, list: list };
        }).filter(function (x) { return x.list.length; });
        el.innerHTML = rows.length ? '<div class="vs-section-head"><div><h2>ETF-Welten</h2><p class="vs-sub">Nur Standard-Bauart · sortiert nach Länge der Kurshistorie, nicht nach Rendite · Kategorien aus dem Fondsnamen abgeleitet</p></div></div>' +
          '<div class="vs-chips" role="group" aria-label="ETF-Welten">' + rows.map(function (x) { return '<button class="vs-pill small' + (st.row === x.rw.id ? " primary" : "") + '" data-row="' + x.rw.id + '" aria-pressed="' + (st.row === x.rw.id) + '">' + esc(x.rw.label) + ' <span class="vs-sub">' + x.list.length + '</span></button>'; }).join("") + '</div>' +
          (st.row ? (function () { var x = rows.filter(function (y) { return y.rw.id === st.row; })[0]; return x ? '<div class="vs-grid g4" style="margin-top:12px">' + x.list.slice(0, 8).map(card).join("") + '</div>' : ""; })() : "") : "";
        el.querySelectorAll("[data-row]").forEach(function (b) { b.onclick = function () { st.row = st.row === b.dataset.row ? "" : b.dataset.row; drawRows(); }; });
      }
      function card(e) {
        return '<a class="vs-card link" href="' + VS.etfHref(e) + '"><p class="vs-label">' + esc(e.symbol) + ' · ' + esc(e.exchange || "") + '</p><p style="margin-top:4px;font-weight:750">' + esc(e.name) + '</p>' +
          '<p class="vs-fine" style="margin-top:6px">' + esc(e.category || "") + '</p><div class="vs-row" style="margin-top:6px"><span>Historie</span><span>' + F.years(e.m && e.m.hy) + '</span></div>' +
          '<div class="vs-row"><span>Schwankung</span><span class="num">' + F.pct(e.m && e.m.vol) + '</span></div><div class="vs-row"><span>Max. Rückgang</span><span class="num">' + F.pct(e.m && e.m.mdd) + '</span></div></a>';
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
        if (e.m && e.m.vol !== null && e.m.vol !== undefined) chips.push('<span class="vs-chip">Schwankung ' + F.pct(e.m.vol, 0) + '</span>');
        if (e.cost !== null && e.cost !== undefined) chips.push('<span class="vs-chip">Kosten ' + VS.costPct(e.cost) + '</span>');
        if (e.m && e.m.hy) chips.push('<span class="vs-chip">' + F.years(e.m.hy) + '</span>');
        if (e.series) chips.push('<span class="vs-chip on">Holdings ✓</span>');
        return '<a class="vs-item" href="' + VS.etfHref(e) + '"><span class="vs-ava c-' + esc(e.assetClass || "") + (e.complex ? " cx" : "") + '" title="' + esc(e.issuer || "") + '">' + esc(VS.issuerShort(e)) + '</span>' +
          '<span class="vs-item-main"><span class="vs-item-top"><b>' + esc(e.symbol) + '</b>' + (e.retirementClass === "SEHR_KOMPLEX" ? '<span class="vs-badge bad">sehr komplex</span>' : e.complex ? '<span class="vs-badge complex">komplex</span>' : "") + (e.status === "INACTIVE" ? '<span class="vs-badge bad">inaktiv</span>' : "") + '</span>' +
          '<span class="vs-item-name">' + esc(VS.displayName(e.name)) + '</span><span class="vs-item-chips">' + chips.join("") + '</span></span>' +
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
        host.innerHTML = '<div class="vs-section-head"><div><h2>' + list.length.toLocaleString("de-DE") + ' ETFs</h2><p class="vs-sub">' + (st.complex ? "" : nComplex.toLocaleString("de-DE") + ' komplexe ausgeblendet · ') + 'Stand ' + F.date(m.asOf) + VS.stale(m.asOf) + ' · Quelle Tiingo, SEC</p></div><a class="vs-pill small" href="#/daten">Datenabdeckung</a></div>' +
          '<div class="vs-quickchips" role="group" aria-label="Schnellfilter">' + QUICK.map(function (q) { return '<button class="vs-qc" data-q="' + q[0] + '" aria-pressed="' + qOn(q[0]) + '">' + esc(q[1]) + '</button>'; }).join("") + '</div>' +
          '<div class="vs-toolbar"><select class="vs-sort" id="vs-sortsel" aria-label="Sortieren">' + SORTS.map(function (x) { return '<option value="' + x[0] + '"' + (st.sort === x[0] ? " selected" : "") + '>Sortiert: ' + esc(x[1]) + '</option>'; }).join("") + '</select>' +
          '<div class="vs-seg" id="vs-viewsel" style="margin-left:auto"><button data-v="list" aria-pressed="' + !asTable + '">Liste</button><button data-v="table" aria-pressed="' + asTable + '">Tabelle</button></div></div>' +
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
          (list.length > st.limit ? '<div style="text-align:center;margin-top:16px"><button class="vs-pill" id="vs-more">Weitere ' + Math.min(50, list.length - st.limit) + ' von ' + (list.length - st.limit).toLocaleString("de-DE") + ' anzeigen</button></div>' : "") +
          (list.length === 0 ? '<div class="vs-empty">Kein ETF passt zu diesen Filtern.</div>' : "") +
          (st.q && list.length < 10 ? '<p class="vs-sub" style="margin-top:12px">Europäische UCITS-Anteilklassen: <a href="#/europa?q=' + encodeURIComponent(st.q) + '">„' + esc(st.q) + '“ in Europa suchen</a></p>' : "") +
          '<p class="vs-fine" style="margin-top:12px">Rendite = Kursentwicklung ohne Ausschüttungen. Kosten (Expense Ratio) und Fondsvermögen aus SEC-Daten, Holdings aus SEC N-PORT – nur für US-registrierte Fonds. Fehlende Werte zählen bei Filtern nicht als null. Europäische UCITS-ETFs: <a href="#/europa">eigener Bereich</a>.</p>';
        host.querySelectorAll("select[data-k]").forEach(function (sx) { sx.addEventListener("change", function () { st[sx.dataset.k] = sx.value; st.limit = 50; draw(); }); });
        host.querySelectorAll("input[data-k]").forEach(function (c) { c.addEventListener("change", function () {
          if (c.dataset.k === "inactive" && c.checked && !m.extraLoaded) { VS.masterAll().then(function (full) { all = full.etfs.filter(function (e) { return e.layer !== "REVIEW"; }); m.extraLoaded = true; st.inactive = true; draw(); }); return; }
          st[c.dataset.k] = c.checked; st.limit = 50; draw(); }); });
        host.querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { qSet(b.dataset.q, !qOn(b.dataset.q)); st.limit = 50; draw(); }; });
        host.querySelector("#vs-sortsel").onchange = function () { st.sort = this.value; st.dir = /^(vol|cost|name)$/.test(st.sort) ? 1 : -1; st.limit = 50; draw(); };
        host.querySelectorAll("#vs-viewsel [data-v]").forEach(function (b) { b.onclick = function () { st.view = b.dataset.v; draw(); }; });
        var rs = host.querySelector("#vs-reset"); if (rs) rs.onclick = function () { FKEYS.forEach(function (k) { st[k] = ""; }); ["trendUp", "dist", "hasHoldings", "hasPrice", "hasCost", "complex", "inactive"].forEach(function (k) { st[k] = false; }); draw(); };
        host.querySelectorAll("th[data-sort]").forEach(function (th) {
          function go() { var id = th.dataset.sort; if (st.sort === id) st.dir *= -1; else { st.sort = id; st.dir = id === "vol" || id === "name" ? 1 : -1; } draw(); }
          th.addEventListener("click", go); th.addEventListener("keydown", function (ev) { if (ev.key === "Enter") go(); });
        });
        var more = host.querySelector("#vs-more"); if (more) more.onclick = function () { st.limit += 50; draw(); };
      }
      draw();
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
      if (!(d.holdings && d.holdings.status === "AVAILABLE") && e.index && !/familie/i.test(e.index) && /^(NYSE|NASDAQ|BATS|ARCA|NYSE ARCA|AMEX|NYSE MKT)$/i.test(String(e.exchange || ""))) {
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
      var trM = d.metricsTotal && d.metricsTotal.windows && d.metricsTotal.windows.MAX, prM = mt && mt.windows && mt.windows.MAX, retM = trM && Number.isFinite(trM.annualized) ? trM : prM;
      var kp = [["Rendite p. a.", retM && Number.isFinite(retM.annualized) ? F.spct(retM.annualized) : "–", retM && retM.from ? "seit " + retM.from.slice(0, 4) + (retM === trM ? " · mit Ausschüttungen" : " · nur Kurs") : "keine Historie"],
        ["Schwankung", mt && mt.volatility && Number.isFinite(mt.volatility.value) ? F.pct(mt.volatility.value, 0) : "–", "pro Jahr"],
        ["Kosten", d.costs && Number.isFinite(d.costs.value) ? VS.costPct(d.costs.value) : "–", d.costs && d.costs.status === "AVAILABLE" ? "Expense Ratio (Prospekt)" : "nicht verfügbar"],
        ["Positionen", d.holdings && d.holdings.status === "AVAILABLE" && d.holdings.positions ? Number(d.holdings.positions).toLocaleString("de-DE") : "–", d.holdings && d.holdings.proxy ? "über " + d.holdings.proxy.symbol + " (gleicher Index)" : d.holdings && d.holdings.status === "AVAILABLE" ? "SEC N-PORT " + F.date(d.holdings.asOf) : "keine Holdings"]];
      root.innerHTML = '<section class="vs-hero"><p class="vs-eyebrow"><a href="#/etfs" style="text-decoration:none">ETF Intelligence</a> · ' + esc(e.category || "") + '</p>' +
        '<div class="vs-etf-head"><div style="min-width:0"><div class="vs-item-top"><span class="vs-ticker">' + esc(e.symbol) + '</span>' + (e.complex ? '<span class="vs-badge complex">⚠ ' + esc(VS.RETIRE[e.retirementClass] || "komplex") + '</span>' : '<span class="vs-badge ok">Standard-Bauart</span>') + '<span class="vs-badge">' + esc(d.currency || "") + '</span></div>' +
        '<h1 style="font-size:clamp(26px,4.6vw,46px);margin-top:10px">' + esc(VS.displayName(d.name || sym)) + '</h1><p class="vs-sub" style="margin-top:6px">' + esc(VS.STRATEGY[e.strategy] || "") + ' · ' + esc(d.exchange || "Börse unbekannt") + (d.issuer ? " · " + esc(d.issuer) : "") + '</p></div>' +
        '<div style="text-align:right"><div class="vs-price num">' + F.price(mt && mt.price, d.currency) + '</div><div class="num ' + F.cls(mt && mt.change1D) + '" style="font-weight:800">' + F.spct(mt && mt.change1D, 2) + ' <span class="vs-sub">1 Tag · ' + F.date(mt && mt.priceDate) + '</span></div></div></div>' +
        '<div class="vs-kpis">' + kp.map(function (k) { return '<div><span>' + esc(k[0]) + '</span><b class="num">' + k[1] + '</b><small>' + esc(k[2]) + '</small></div>'; }).join("") + '</div>' +
        '<div class="vs-tabs"><button class="vs-pill' + (watched ? " primary" : "") + '" id="vs-watch">' + (watched ? "♥ Beobachtet" : "♡ Beobachten") + '</button><a class="vs-pill lime" href="#/etf/' + encodeURIComponent(sym) + '?tab=uebersicht&play=1">Planspiel: ins Vorsorgedepot</a><a class="vs-pill" href="#/vergleich?s=' + encodeURIComponent(sym) + (sym !== "URTH" ? ",URTH" : ",SPY") + '">Vergleichen</a><a class="vs-pill" href="#/portfolio?add=' + encodeURIComponent(sym) + '">Zum Portfolio</a></div></section>' +
        '<div class="vs-etf-sticky"><div class="vs-seg" role="tablist">' + TABS.map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + t[1] + '</button>'; }).join("") + '</div></div>' +
        (missingTab ? '<p class="vs-note" style="margin-top:12px">Für ' + esc(e.symbol) + ' gibt es diesen Bereich nicht: ' + esc({ performance: "keine Kursreihe", risiko: "keine Kursreihe", bestandteile: "keine Holdings (SEC N-PORT)", xray: "keine Holdings (SEC N-PORT)", aenderungen: "keine Holdings- oder Kostenhistorie", kosten: "keine Kostenquote aus dem Prospekt" }[missingTab] || "keine Daten") + '. Du siehst die Übersicht.</p>' : "") +
        '<div id="vs-etf-body"></div>' + '<p class="vs-disclaimer">' + esc(VS.DISCLAIMER) + '</p>';
      root.querySelector("#vs-watch").onclick = function () { var on = watchToggle(sym); this.textContent = on ? "♥ Beobachtet" : "♡ Beobachten"; this.classList.toggle("primary", on); };
      root.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; root.querySelectorAll("[data-tab]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); body(); }; });
      function body() {
        var host = root.querySelector("#vs-etf-body");
        var px = d.holdings && d.holdings.proxy && /^(bestandteile|xray|aenderungen)$/.test(tab) ? d.holdings.proxy : null;
        host.innerHTML = (px ? '<div class="vs-note" style="margin-top:16px"><b>Referenzbestand:</b> ' + esc(e.symbol) + ' meldet keinen eigenen Bestand an die SEC (N-PORT). Gezeigt wird der Bestand von <a href="#/etf/' + encodeURIComponent(px.slug) + '?tab=' + tab + '">' + esc(px.symbol) + '</a> (' + esc(px.name) + '), der denselben Index (' + esc(px.index) + ') abbildet. Die Zusammensetzung ist praktisch gleich; Gewichte können leicht abweichen.</div>' : "") + '<div id="vs-tab-c"></div>';
        (TAB_VIEWS[tab] || TAB_VIEWS.uebersicht)(host.querySelector("#vs-tab-c"), e, d, m);
        if (r.query.play === "1" && tab === "uebersicht") setTimeout(function () { var pl = root.querySelector("#vs-play"); if (pl && pl.scrollIntoView) pl.scrollIntoView({ behavior: "smooth", block: "start" }); }, 250);
      }
      body();
    }).catch(function () {
      VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF Intelligence</p><h1>' + esc(sym) + ' nicht gefunden.</h1><p class="vs-lead">Dieser Ticker ist nicht im ETF-Verzeichnis. Vielleicht ist er bei Tiingo als Aktie geführt oder (noch) nicht im aufgenommenen Universum.</p><div class="vs-tabs"><a class="vs-pill primary" href="#/etfs?q=' + encodeURIComponent(sym) + '">Im Screener suchen</a></div></section>');
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
      var mt = d.metrics, dna = d.dna || {};
      el.innerHTML = '<section class="vs-section">' + VS.quickHeader(e, d) + '</section><section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">Was ist das?</p><p style="margin-top:8px;font-size:16px">' + esc(whatIsIt(e, d)) + '</p><p id="vs-hsum" class="vs-sub" style="margin-top:8px"></p>' +
        (d.description ? '<details style="margin-top:10px"><summary class="vs-fine" style="cursor:pointer">Beschreibung des Anbieters (Tiingo, Originalsprache)</summary><p class="vs-fine" style="margin-top:6px">' + esc(d.description) + '</p></details>' : "") +
        '<div class="vs-row" style="margin-top:10px"><span>Produkttyp</span><span>' + esc(e.productType || "–") + ' · ' + esc(VS.STRATEGY[e.strategy] || "–") + '</span></div>' +
        '<div class="vs-row" style="margin-top:10px"><span>Index / Strategie</span><span>' + esc(e.index || (d.structure === "ACTIVE" ? "Aktiv gemanagt" : "nicht im Namen genannt")) + '</span></div>' +
        '<div class="vs-row"><span>Assetklasse</span><span>' + esc(VS.ASSET[e.assetClass] || "nicht zugeordnet") + '</span></div><div class="vs-row"><span>Region</span><span>' + esc(VS.REGION[e.region] || "nicht im Namen genannt") + '</span></div>' +
        '<div class="vs-row"><span>Thema</span><span>' + esc(e.theme || "–") + '</span></div><div class="vs-row"><span>Listings dieses Fonds</span><span>' + (d.listingsOfFund || 1) + '</span></div></div>' +
        '<div class="vs-card app"><p class="vs-label">Vision Universe Einordnung</p><div style="margin-top:8px">' + einordnung(e, d).map(function (x) { return '<div class="vs-row"><span style="color:var(--app-ink)">' + (x[0] === "warn" ? "⚠ " : x[0] === "ok" ? "✓ " : "• ") + esc(x[1]) + '</span></div>'; }).join("") + '</div><p class="vs-fine" style="margin-top:8px">Einordnung aus Daten, keine Empfehlung.</p></div></div></section>' +
        '<section class="vs-section"><div class="vs-card"><div class="vs-section-head"><div><p class="vs-label">Kursverlauf</p><p class="vs-fine">' + esc(mt ? mt.basisLabel : "") + '</p></div><div class="vs-seg" id="vs-range">' + RANGES.map(function (rg) { return '<button data-m="' + rg[1] + '" aria-pressed="' + (rg[0] === "1J") + '">' + rg[0] + '</button>'; }).join("") + '</div></div><div id="vs-etf-chart"></div></div></section>' +
        '<section class="vs-section" id="vs-play"></section>' +
        '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">ETF-DNA</p><div class="vs-dna" style="margin-top:10px">' + Object.keys(dna).map(function (k) {
          var x = dna[k];
          return '<div class="vs-bar"><span>' + esc(x.label) + '</span>' + (x.value === null ? '<span class="vs-fine" style="grid-column:span 2">' + esc(VS.STATUS_TEXT[x.status] || "Noch nicht verfügbar") + '</span>'
            : '<span class="track"><span class="fill" style="display:block;width:' + x.value + '%;background:var(--s1)"></span></span><span class="v num">' + x.value + '/100</span>') + '</div>';
        }).join("") + '</div></div>' + quality(d) + '</div></section>';
      var trM = d.metricsTotal && d.metricsTotal.windows && d.metricsTotal.windows.MAX, prM = mt && mt.windows && mt.windows.MAX, useM = trM && Number.isFinite(trM.annualized) ? trM : prM;
      VS.renderPlanspiel(el.querySelector("#vs-play"), { symbol: e.symbol, slug: e.slug, name: d.name, complex: e.complex, us: /^(NYSE|NASDAQ|BATS|ARCA|NYSE ARCA|AMEX|NYSE MKT)$/i.test(String(e.exchange || "")),
        cagr: useM ? useM.annualized : null, vol: mt && mt.volatility ? mt.volatility.value : null, since: useM && useM.from ? useM.from.slice(0, 4) : "", years: mt ? mt.historyYears : 0,
        basis: useM === trM ? "Tiingo, Gesamtrendite mit Ausschüttungen" : "Tiingo, nur Kurs – Ausschüttungen nicht enthalten" });
      if (d.holdings && d.holdings.status === "AVAILABLE") VS.holdings(d.holdings.series).then(function (f) { var x = el.querySelector("#vs-hsum"); if (f && x) x.innerHTML = (d.holdings.proxy ? "Referenzbestand " + esc(d.holdings.proxy.symbol) + " (gleicher Index): " : "") + esc(f.summary || "") + (f.changes && f.changes.sentence ? " " + esc(f.changes.sentence) + ' <a href="#" data-goto="aenderungen">Details</a>' : ""); var g = x && x.querySelector("[data-goto]"); if (g) g.onclick = function (ev) { ev.preventDefault(); var b = document.querySelector('[data-tab="aenderungen"]'); if (b) b.click(); }; });
      if (!mt) { el.querySelector("#vs-etf-chart").innerHTML = VS.pending("Keine Kursdaten", "Für diesen ETF liefert der Anbieter derzeit keine Kursreihe."); return; }
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
