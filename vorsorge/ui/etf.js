/* =========================================================================
   VISION UNIVERSE® VORSORGE — ui/etf.js
   ETF Intelligence: Screener & Suche, ETF-Detail (DNA, X-Ray, Einordnung),
   ETF-Vergleich, Watchlist.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, A = V.Analytics, F = VS.fmt, esc = VS.esc;

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
    { id: "vol", label: "Schwankung", get: function (e) { return e.m && e.m.vol; }, pct: true, neutral: true },
    { id: "mdd", label: "Max. Rückgang", get: function (e) { return e.m && e.m.mdd; }, pct: true },
    { id: "trend", label: "Trend (Abst. Ø)", get: function (e) { return e.m && e.m.trend; }, pct: true },
    { id: "rs", label: "Rel. Stärke vs. SPY", get: function (e) { return e.m && e.m.rs; }, pct: true },
    { id: "hy", label: "Historie", get: function (e) { return e.m && e.m.hy; }, years: true }
  ];

  VS.views.etfs = function (r) {
    var q = r.query || {};
    var st = { q: q.q || "", ac: q.ac || "", region: q.region || "", theme: q.theme || "", issuer: q.issuer || "", exchange: q.exchange || "", currency: q.currency || "",
      index: q.index || "", hist: q.hist || "", complex: q.complex === "1", inactive: false, sort: q.sort || "p1Y", dir: -1, limit: 60 };
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF Intelligence</p><h1>Alle ETFs.<br>Klar eingeordnet.</h1><p class="vs-lead">Jeder ETF, den unser Datenanbieter Tiingo führt und für den Daten vorliegen – mit echter Kurshistorie, Schwankung, größtem Rückgang und Trend. Komplexe Produkte sind markiert.</p>' +
      '<form id="vs-search-form" class="vs-search" role="search"><span aria-hidden="true">⌕</span><input id="vs-q" autocomplete="off" value="' + esc(st.q) + '" placeholder="Ticker, Name, Index, Thema, Region, Anbieter …" aria-label="ETFs durchsuchen"><button type="submit">Suchen</button></form><div class="vs-suggest" id="vs-suggest"></div></section>' +
      '<section class="vs-section" id="vs-screener"><div class="vs-loading">ETF-Verzeichnis wird geladen …</div></section>');
    VS.master().then(function (m) {
      var host = root.querySelector("#vs-screener");
      var all = m.etfs;
      var input = root.querySelector("#vs-q");
      root.querySelector("#vs-search-form").addEventListener("submit", function (ev) { ev.preventDefault(); st.q = input.value; st.limit = 60; draw(); VS.analytics.track("etf_search", { query: st.q.slice(0, 40) }); });
      input.addEventListener("input", function () { st.q = input.value; st.limit = 60; draw(); });
      function controls() {
        var hist = [["", "Jede Historie"], ["1", "≥ 1 Jahr"], ["3", "≥ 3 Jahre"], ["10", "≥ 10 Jahre"]];
        return '<div class="vs-filters" role="group" aria-label="Filter">' +
          '<select data-k="ac" aria-label="Assetklasse"><option value="">Alle Assetklassen</option>' + uniq(all, "assetClass").map(function (k) { return opt(k, VS.ASSET[k] || k, st.ac); }).join("") + '</select>' +
          '<select data-k="region" aria-label="Region"><option value="">Alle Regionen</option>' + uniq(all, "region").map(function (k) { return opt(k, VS.REGION[k] || k, st.region); }).join("") + '</select>' +
          '<select data-k="theme" aria-label="Thema"><option value="">Alle Themen</option>' + uniq(all, "theme").map(function (k) { return opt(k, k, st.theme); }).join("") + '</select>' +
          '<select data-k="index" aria-label="Index"><option value="">Alle Indizes</option>' + uniq(all, "index").map(function (k) { return opt(k, k, st.index); }).join("") + '</select>' +
          '<select data-k="issuer" aria-label="Anbieter"><option value="">Alle Anbieter</option>' + uniq(all, "issuer").map(function (k) { return opt(k, k, st.issuer); }).join("") + '</select>' +
          '<select data-k="exchange" aria-label="Börse"><option value="">Alle Börsen</option>' + uniq(all, "exchange").map(function (k) { return opt(k, k, st.exchange); }).join("") + '</select>' +
          '<select data-k="currency" aria-label="Währung"><option value="">Alle Währungen</option>' + uniq(all, "currency").map(function (k) { return opt(k, k, st.currency); }).join("") + '</select>' +
          '<select data-k="hist" aria-label="Historie">' + hist.map(function (h) { return opt(h[0], h[1], st.hist); }).join("") + '</select>' +
          '<select disabled aria-label="Ausschüttung" title="Ausschüttungsart: Datenquelle (Emittent) folgt"><option>Ausschüttend/Thesaurierend · Daten folgen</option></select>' +
          '<select disabled aria-label="Fondsgröße" title="Fondsvolumen: Datenquelle folgt"><option>Fondsgröße · Daten folgen</option></select>' +
          '<label class="vs-check"><input type="checkbox" data-k="complex"' + (st.complex ? " checked" : "") + '> Komplexe Produkte zeigen</label>' +
          '<label class="vs-check"><input type="checkbox" data-k="inactive"' + (st.inactive ? " checked" : "") + '> Nicht mehr gehandelte zeigen</label></div>';
      }
      function filtered() {
        var list = st.q ? V.Master.search(all, st.q, 5000) : all.slice();
        return list.filter(function (e) {
          if (e.status === "REVIEW") return false;
          if (!st.inactive && e.status === "INACTIVE") return false;
          if (!st.complex && e.complex) return false;
          if (st.ac && e.assetClass !== st.ac) return false;
          if (st.region && e.region !== st.region) return false;
          if (st.theme && e.theme !== st.theme) return false;
          if (st.index && e.index !== st.index) return false;
          if (st.issuer && e.issuer !== st.issuer) return false;
          if (st.exchange && e.exchange !== st.exchange) return false;
          if (st.currency && e.currency !== st.currency) return false;
          if (st.hist && !(e.m && e.m.hy >= Number(st.hist))) return false;
          return true;
        });
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
        var hiddenComplex = st.complex ? 0 : all.filter(function (e) { return e.complex && e.status === "ACTIVE"; }).length;
        host.innerHTML = '<div class="vs-section-head"><div><h2>' + list.length + ' ETFs</h2><p class="vs-sub">' + (hiddenComplex ? hiddenComplex + ' komplexe Produkte ausgeblendet · ' : "") + 'Stand ' + F.date(m.asOf) + ' · Kursentwicklung ohne Ausschüttungen · Quelle Tiingo</p></div><a class="vs-pill small" href="#/daten">Datenabdeckung</a></div>' +
          controls() +
          '<div class="vs-table-wrap"><table class="vs-table"><thead><tr>' + COLS.map(function (c) {
            return '<th scope="col" data-sort="' + c.id + '"' + (c.id === st.sort ? ' aria-sort="' + (st.dir < 0 ? "descending" : "ascending") + '"' : "") + ' tabindex="0">' + esc(c.label) + '</th>';
          }).join("") + '</tr></thead><tbody>' + list.slice(0, st.limit).map(function (e) {
            return '<tr><td><a href="#/etf/' + encodeURIComponent(e.symbol) + '">' + esc(e.symbol) + '</a> ' + (e.complex ? '<span class="vs-badge complex" title="Komplexes Produkt">⚠</span>' : "") + '<span class="t-name">' + esc(e.name) + '</span><span class="t-name">' + esc(e.category) + '</span></td>' +
              COLS.slice(1).map(function (c) {
                var v = c.get(e);
                return '<td class="num ' + (c.pct && !c.neutral && c.id !== "mdd" ? F.cls(v) : "") + '">' + (c.years ? F.years(v) : c.id === "mdd" || c.neutral ? F.pct(v) : F.spct(v)) + '</td>';
              }).join("") + '</tr>';
          }).join("") + '</tbody></table></div>' +
          (list.length > st.limit ? '<div style="text-align:center;margin-top:14px"><button class="vs-pill" id="vs-more">Weitere ' + Math.min(60, list.length - st.limit) + ' anzeigen</button></div>' : "") +
          (list.length === 0 ? '<div class="vs-empty">Kein ETF passt zu diesen Filtern.</div>' : "") +
          '<p class="vs-fine" style="margin-top:12px">Später ergänzt: Quality-, Value-, Growth- und Small-Cap-Exposure sowie Sektor- und Länderkonzentration – sobald Holdings-Daten der Emittenten angeschlossen sind.</p>';
        host.querySelectorAll("select[data-k]").forEach(function (s) { s.addEventListener("change", function () { st[s.dataset.k] = s.value; st.limit = 60; draw(); }); });
        host.querySelectorAll("input[data-k]").forEach(function (c) { c.addEventListener("change", function () { st[c.dataset.k] = c.checked; draw(); }); });
        host.querySelectorAll("th[data-sort]").forEach(function (th) {
          function go() { var id = th.dataset.sort; if (st.sort === id) st.dir *= -1; else { st.sort = id; st.dir = id === "vol" || id === "name" ? 1 : -1; } draw(); }
          th.addEventListener("click", go); th.addEventListener("keydown", function (ev) { if (ev.key === "Enter") go(); });
        });
        var more = host.querySelector("#vs-more"); if (more) more.onclick = function () { st.limit += 60; draw(); };
      }
      draw();
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

  function whatIsIt(e) {
    var parts = [];
    var ac = VS.ASSET[e.assetClass] || null;
    if (e.structure === "LEVERAGED_OR_INVERSE") parts.push("Ein Hebel- oder Short-Produkt" + (e.singleStockUnderlying ? " auf die Einzelaktie " + e.singleStockUnderlying : "") + ". Es soll die " + (e.inverse ? "umgekehrte " : "") + (e.leverage > 1 ? e.leverage + "-fache " : "") + "Tagesbewegung abbilden. Über längere Zeit weicht das Ergebnis deutlich davon ab – für langfristige Vorsorge ungeeignet konstruiert.");
    else if (e.structure === "OPTIONS_STRATEGY") parts.push("Ein ETF mit Optionsstrategie (z. B. Puffer, Barriere oder Prämieneinnahmen). Chancen und Risiken sind begrenzt bzw. verschoben – das Ergebnis hängt stark von der Konstruktion ab.");
    else if (e.assetClass === "CRYPTO") parts.push("Ein Krypto-Produkt. Sehr hohe Schwankungen; kein klassischer, breit gestreuter Fonds.");
    else parts.push("Ein " + (e.management === "ACTIVE" ? "aktiv gemanagter " : e.index ? "Index-" : "") + "ETF" + (ac ? " auf " + ac : "") + (e.region ? " (" + (VS.REGION[e.region] || e.region) + ")" : "") + (e.index ? ", der den " + e.index + " abbildet" : "") + ".");
    if (e.issuer) parts.push("Anbieter: " + e.issuer + ".");
    return parts.join(" ");
  }
  function einordnung(e, d) {
    var m = d.metrics, out = [];
    if (e.complex) out.push(["warn", "Komplexes Produkt: nicht wie einen breit gestreuten, langfristigen ETF behandeln."]);
    if (!m) { out.push(["info", "Für diesen ETF liegen noch keine Kursdaten vor."]); return out; }
    if (m.historyYears < 1) out.push(["info", "Sehr kurze Historie (" + F.years(m.historyYears) + "): Kennzahlen sind wenig aussagekräftig."]);
    else if (m.historyYears >= 10) out.push(["ok", "Lange Historie (" + F.years(m.historyYears) + ") – inklusive mindestens eines größeren Marktrückgangs."]);
    if (m.volatility.value !== null) out.push(["info", m.volatility.value < 0.08 ? "Geringe Schwankung (" + F.pct(m.volatility.value) + " p.a.) – typisch für Anleihen/Geldmarkt." : m.volatility.value < 0.22 ? "Schwankung im Rahmen breiter Aktienmärkte (" + F.pct(m.volatility.value) + " p.a.)." : "Hohe Schwankung (" + F.pct(m.volatility.value) + " p.a.) – deutlich über breiten Aktienmärkten."]);
    if (m.maxDrawdown.value !== null && m.maxDrawdown.value < -0.3) out.push(["info", "Größter Rückgang " + F.pct(m.maxDrawdown.value) + (m.maxDrawdown.recovered ? ", Erholung nach " + Math.round(m.maxDrawdown.recoveryDays / 30) + " Monaten." : ", bis heute nicht vollständig erholt.")]);
    if (e.region === "GLOBAL") out.push(["ok", "Breite regionale Streuung laut Fondsname."]);
    if (e.currency && e.currency !== "EUR") out.push(["info", "Gehandelt in " + e.currency + ": Für Euro-Anleger kommt ein Währungsrisiko hinzu."]);
    if (e.country === "US") out.push(["info", "US-Listing: Für Privatanleger in der EU meist nicht direkt handelbar (kein Basisinformationsblatt). Dient hier als Marktabbild."]);
    return out;
  }

  VS.views.etf = function (r) {
    var sym = decodeURIComponent(r.args[0] || "").toUpperCase();
    var tab = r.query.tab || "uebersicht";
    var root = VS.render('<section class="vs-section"><div class="vs-loading">' + esc(sym) + ' wird geladen …</div></section>');
    VS.master().then(function (m0) {
      if (!m0._bySymbol[sym]) throw new Error("NOT_IN_MASTER");
      return Promise.all([m0, VS.etf(sym)]);
    }).then(function (res) {
      var m = res[0], d = res[1], e = m._bySymbol[sym] || d;
      VS.analytics.track("etf_view", { symbol: sym });
      var mt = d.metrics, watched = VS.state.watchlist.indexOf(sym) >= 0;
      var TABS = [["uebersicht", "Übersicht"], ["performance", "Performance"], ["risiko", "Risiko"], ["inhalte", "Inhalte"], ["faktoren", "Faktoren"], ["kosten", "Kosten"], ["vergleich", "Vergleich"]];
      root.innerHTML = '<section class="vs-hero"><p class="vs-eyebrow"><a href="#/etfs" style="text-decoration:none">ETF Intelligence</a> · ' + esc(e.category || "") + '</p>' +
        '<div class="vs-etf-head"><div style="min-width:0"><h1 style="font-size:clamp(28px,5vw,52px)">' + esc(d.name || sym) + '</h1><p class="vs-sub" style="margin-top:8px"><b style="color:var(--ink)">' + esc(sym) + '</b> · ' + esc(d.exchange || "Börse unbekannt") + ' · ' + esc(d.currency || "") + (d.issuer ? " · " + esc(d.issuer) : "") + '</p><div style="margin-top:10px">' + VS.badges(e) + '</div></div>' +
        '<div style="text-align:right"><div class="vs-price num">' + F.price(mt && mt.price, d.currency) + '</div><div class="num ' + F.cls(mt && mt.change1D) + '" style="font-weight:800">' + F.spct(mt && mt.change1D, 2) + ' <span class="vs-sub">1 Tag · ' + F.date(mt && mt.priceDate) + '</span></div></div></div>' +
        '<div class="vs-tabs"><button class="vs-pill' + (watched ? " primary" : "") + '" id="vs-watch">' + (watched ? "♥ Beobachtet" : "♡ Beobachten") + '</button><a class="vs-pill" href="#/vergleich?s=' + encodeURIComponent(sym) + (sym !== "URTH" ? ",URTH" : ",SPY") + '">Vergleichen</a><a class="vs-pill" href="#/portfolio?add=' + encodeURIComponent(sym) + '">Zum Portfolio</a></div></section>' +
        '<div class="vs-seg" role="tablist" style="margin-top:18px">' + TABS.map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + t[1] + '</button>'; }).join("") + '</div>' +
        '<div id="vs-etf-body"></div>' + '<p class="vs-disclaimer">' + esc(VS.DISCLAIMER) + '</p>';
      root.querySelector("#vs-watch").onclick = function () { var on = watchToggle(sym); this.textContent = on ? "♥ Beobachtet" : "♡ Beobachten"; this.classList.toggle("primary", on); };
      root.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; root.querySelectorAll("[data-tab]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); body(); }; });
      function body() { var el = root.querySelector("#vs-etf-body"); (TAB_VIEWS[tab] || TAB_VIEWS.uebersicht)(el, e, d, m); }
      body();
    }).catch(function () {
      VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF Intelligence</p><h1>' + esc(sym) + ' nicht gefunden.</h1><p class="vs-lead">Dieser Ticker ist nicht im ETF-Verzeichnis. Vielleicht ist er bei Tiingo als Aktie geführt oder (noch) nicht im aufgenommenen Universum.</p><div class="vs-tabs"><a class="vs-pill primary" href="#/etfs?q=' + encodeURIComponent(sym) + '">Im Screener suchen</a></div></section>');
    });
  };

  function quality(d) {
    var q = d.quality || {}, mt = d.metrics;
    return '<div class="vs-card soft"><p class="vs-label">Datenqualität</p>' +
      '<div class="vs-row"><span>Quelle</span><span>' + esc((d.sources || []).join(", ")) + '</span></div>' +
      '<div class="vs-row"><span>Stand</span><span>' + F.date(mt && mt.asOf) + '</span></div>' +
      '<div class="vs-row"><span>Renditebasis</span><span>' + esc(mt ? mt.basisLabel : "–") + '</span></div>' +
      '<div class="vs-row"><span>Kurshistorie ab</span><span>' + F.date(mt && mt.firstDate) + '</span></div>' +
      '<div class="vs-row"><span>Stammdaten-Abdeckung</span><span>' + F.pct(q.coverage, 0) + ' · Konfidenz ' + esc(q.confidence || "–") + '</span></div>' +
      '<div class="vs-row"><span>Fehlende Felder</span><span style="text-align:right">' + esc((q.missingFields || []).join(", ") || "–") + '</span></div>' +
      (d.providerStartDate && mt && mt.firstDate && d.providerStartDate < mt.firstDate.slice(0, 4) - 1 + mt.firstDate.slice(4) ? '<p class="vs-fine" style="margin-top:8px">Hinweis: Der Anbieter führt den Ticker seit ' + F.date(d.providerStartDate) + '. Das Kürzel wurde früher vermutlich von einem anderen Wertpapier genutzt; Kennzahlen beginnen mit der hier gelieferten Kursreihe.</p>' : "") +
      '<p class="vs-fine" style="margin-top:8px">Ableitungen aus dem Fondsnamen (Region, Index, Thema, Anbieter) sind als solche gekennzeichnet; fehlende Werte werden nicht geschätzt.</p></div>';
  }

  var TAB_VIEWS = {
    uebersicht: function (el, e, d) {
      var mt = d.metrics, dna = d.dna || {};
      el.innerHTML = '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">Was ist das?</p><p style="margin-top:8px;font-size:16px">' + esc(whatIsIt(e)) + '</p>' +
        '<div class="vs-row" style="margin-top:10px"><span>Index / Strategie</span><span>' + esc(e.index || (e.structure === "ACTIVE" ? "Aktiv gemanagt" : "nicht im Namen genannt")) + '</span></div>' +
        '<div class="vs-row"><span>Assetklasse</span><span>' + esc(VS.ASSET[e.assetClass] || "nicht zugeordnet") + '</span></div><div class="vs-row"><span>Region</span><span>' + esc(VS.REGION[e.region] || "nicht im Namen genannt") + '</span></div>' +
        '<div class="vs-row"><span>Thema</span><span>' + esc(e.theme || "–") + '</span></div><div class="vs-row"><span>Listings dieses Fonds</span><span>' + (d.listingsOfFund || 1) + '</span></div></div>' +
        '<div class="vs-card app"><p class="vs-label">Vision Universe Einordnung</p><div style="margin-top:8px">' + einordnung(e, d).map(function (x) { return '<div class="vs-row"><span style="color:var(--app-ink)">' + (x[0] === "warn" ? "⚠ " : x[0] === "ok" ? "✓ " : "• ") + esc(x[1]) + '</span></div>'; }).join("") + '</div><p class="vs-fine" style="margin-top:8px">Einordnung aus Daten, keine Empfehlung.</p></div></div></section>' +
        '<section class="vs-section"><div class="vs-card"><div class="vs-section-head"><div><p class="vs-label">Kursverlauf</p><p class="vs-fine">' + esc(mt ? mt.basisLabel : "") + '</p></div><div class="vs-seg" id="vs-range">' + RANGES.map(function (rg) { return '<button data-m="' + rg[1] + '" aria-pressed="' + (rg[0] === "1J") + '">' + rg[0] + '</button>'; }).join("") + '</div></div><div id="vs-etf-chart"></div></div></section>' +
        '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">ETF-DNA</p><div class="vs-dna" style="margin-top:10px">' + Object.keys(dna).map(function (k) {
          var x = dna[k];
          return '<div class="vs-bar"><span>' + esc(x.label) + '</span>' + (x.value === null ? '<span class="vs-fine" style="grid-column:span 2">' + esc(VS.STATUS_TEXT[x.status] || "Noch nicht verfügbar") + '</span>'
            : '<span class="track"><span class="fill" style="display:block;width:' + x.value + '%;background:var(--s1)"></span></span><span class="v num">' + x.value + '/100</span>') + '</div>';
        }).join("") + '</div></div>' + quality(d) + '</div></section>';
      if (!mt) { el.querySelector("#vs-etf-chart").innerHTML = VS.pending("Keine Kursdaten", "Für diesen ETF liefert der Anbieter derzeit keine Kursreihe."); return; }
      function draw(months) { var pts = chartSeries(d, months); VS.lineChart(el.querySelector("#vs-etf-chart"), [{ label: d.symbol, points: pts, area: true }], { label: "Kursverlauf " + d.symbol, fmtY: function (v) { return v.toLocaleString("de-DE", { maximumFractionDigits: 2 }); } }); }
      el.querySelectorAll("#vs-range button").forEach(function (b) { b.onclick = function () { el.querySelectorAll("#vs-range button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); draw(Number(b.dataset.m)); }; });
      draw(12);
    },
    performance: function (el, e, d) {
      var mt = d.metrics;
      if (!mt) { el.innerHTML = '<section class="vs-section">' + VS.pending("Keine Kursdaten", "Performance lässt sich ohne Kursreihe nicht berechnen.") + '</section>'; return; }
      var W = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"];
      el.innerHTML = '<section class="vs-section"><div class="vs-card"><p class="vs-label">Performance · ' + esc(mt.basisLabel) + '</p><div class="vs-perf" style="margin-top:12px">' + W.map(function (k) {
        var w = mt.windows[k], v = w.annualized !== null && w.annualized !== undefined ? w.annualized : w.value;
        return '<div><span>' + k.replace("Y", "J") + (w.annualized !== null && w.annualized !== undefined ? " p.a." : "") + '</span><b class="num ' + F.cls(v) + '">' + F.spct(v) + '</b>' + (v === null ? '<span>' + esc(VS.STATUS_TEXT[w.status] || "") + '</span>' : "") + '</div>';
      }).join("") + '</div><p class="vs-fine" style="margin-top:10px">' + (mt.basis === "TOTAL_RETURN" ? "Gesamtrendite: Ausschüttungen sind reinvestiert." : "Kursentwicklung ohne Ausschüttungen. Bei ausschüttenden ETFs liegt die Gesamtrendite höher; sie wird erst angezeigt, wenn Dividenden korrekt in den Daten enthalten sind.") + '</p></div></section>' +
        '<section class="vs-section"><div class="vs-card"><p class="vs-label">Kalenderjahre</p>' + (mt.yearlyReturns.length ? '<div class="vs-bars" style="margin-top:12px">' + mt.yearlyReturns.slice(-12).reverse().map(function (y) {
          return '<div class="vs-bar"><span>' + y.year + '</span><span class="track"><span class="fill" style="display:block;width:' + Math.min(100, Math.abs(y.value) * 200).toFixed(1) + '%;background:' + (y.value >= 0 ? "var(--up)" : "var(--down)") + '"></span></span><span class="v num ' + F.cls(y.value) + '">' + F.spct(y.value) + '</span></div>';
        }).join("") + '</div>' : VS.pending("Noch kein vollständiges Kalenderjahr", "Die Kurshistorie ist kürzer als ein volles Kalenderjahr.")) + '</div></section>';
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
        '<p class="vs-fine" style="margin-top:10px">Volatilität über die letzten 5 Jahre (bzw. die vorhandene Historie); Rückgang, Monate und Jahre über die gesamte gelieferte Historie ab ' + F.date(mt.firstDate) + '.</p></div></section>';
    },
    inhalte: function (el) {
      el.innerHTML = '<section class="vs-section"><div class="vs-card"><p class="vs-label">ETF X-Ray · Inhalte</p><div class="vs-grid g2" style="margin-top:12px">' +
        ["Top-Holdings", "Länder", "Sektoren", "Marktkapitalisierung", "Faktor-Exposure", "Themen"].map(function (t) { return VS.pending(t + " · Daten folgen", "Holdings liefert unser Kursdatenanbieter nicht. Die Durchschau ist vorbereitet (Holdings-Vertrag etf-holdings-1.0.0) und startet, sobald Emittenten-Holdings angeschlossen sind. Wir simulieren keine Inhalte."); }).join("") +
        '</div></div></section>';
    },
    faktoren: function (el, e, d) {
      var mt = d.metrics;
      el.innerHTML = '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">Aus der Kursreihe berechnet</p>' +
        '<div class="vs-row"><span>Momentum (6 Monate)</span><span class="num ' + F.cls(mt && mt.windows["6M"].value) + '">' + F.spct(mt && mt.windows["6M"].value) + '</span></div>' +
        '<div class="vs-row"><span>Momentum (12 Monate)</span><span class="num ' + F.cls(mt && mt.windows["1Y"].value) + '">' + F.spct(mt && mt.windows["1Y"].value) + '</span></div>' +
        '<div class="vs-row"><span>Trend: Abstand zum Durchschnitt (' + esc(mt && mt.trend.window || "–") + ')</span><span class="num ' + F.cls(mt && mt.trend.value) + '">' + F.spct(mt && mt.trend.value) + '</span></div>' +
        '<div class="vs-row"><span>Relative Stärke vs. S&P 500 (SPY, 12 M)</span><span class="num ' + F.cls(mt && mt.relativeStrengthVsSPY.value) + '">' + F.spct(mt && mt.relativeStrengthVsSPY.value) + '</span></div></div>' +
        '<div class="vs-card">' + ["Quality", "Value", "Growth", "Small Cap"].map(function (f) { return '<div class="vs-row"><span>' + f + '-Exposure</span><span class="vs-fine">Daten folgen (Holdings)</span></div>'; }).join("") + '</div></div></section>';
    },
    kosten: function (el, e) {
      el.innerHTML = '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card">' + VS.pending("Laufende Kosten (TER) · Daten folgen", "Die Kostenquote steht im Factsheet bzw. Basisinformationsblatt des Emittenten" + (e.issuer ? " (" + e.issuer + ")" : "") + ". Diese Quelle ist noch nicht angeschlossen – wir zeigen keine geschätzte TER.") +
        '<div class="vs-row" style="margin-top:12px"><span>Tracking Difference</span><span class="vs-fine">Daten folgen</span></div><div class="vs-row"><span>Fondsvolumen</span><span class="vs-fine">Daten folgen</span></div><div class="vs-row"><span>Replikation</span><span class="vs-fine">Daten folgen</span></div><div class="vs-row"><span>Ausschüttung</span><span class="vs-fine">Daten folgen</span></div></div>' +
        '<a class="vs-card app link" href="#/kosten"><p class="vs-label">Selbst rechnen</p><p class="vs-kpi small" style="margin-top:6px">Was kostet mich 0,2 % vs. 1,5 %?</p><p class="vs-sub" style="margin-top:8px">Trage die TER aus dem Factsheet in die Kostenanalyse ein und sieh den Effekt über deine Laufzeit.</p></a></div></section>';
    },
    vergleich: function (el, e, d, m) {
      var peers = m.etfs.filter(function (x) { return x.symbol !== e.symbol && x.consumerVisible && !x.complex && x.assetClass === e.assetClass && x.priceHistoryAvailable; })
        .sort(function (a, b) { return (b.m ? b.m.hy : 0) - (a.m ? a.m.hy : 0); }).slice(0, 6);
      el.innerHTML = '<section class="vs-section"><div class="vs-card"><p class="vs-label">Vergleichen mit …</p><div class="vs-tabs">' + peers.map(function (p) { return '<a class="vs-pill" href="#/vergleich?s=' + encodeURIComponent(e.symbol + "," + p.symbol) + '">' + esc(p.symbol) + ' <span class="vs-sub">' + esc(p.category) + '</span></a>'; }).join("") +
        '<a class="vs-pill primary" href="#/vergleich?s=' + encodeURIComponent(e.symbol) + '">Eigene Auswahl</a></div></div></section>';
    }
  };

  /* ============================================================ COMPARE */
  VS.views.vergleich = function (r) {
    var syms = (r.query.s || "URTH,SPY").split(",").map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 4);
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">ETF-Vergleich</p><h1>Wo unterscheiden<br>sie sich wirklich?</h1><p class="vs-lead">2 bis 4 ETFs nebeneinander. Kein Gewinner – nur die größten Unterschiede.</p>' +
      '<form class="vs-search" id="vs-cmp-form"><span aria-hidden="true">+</span><input id="vs-cmp-q" placeholder="ETF hinzufügen (Ticker oder Name)" autocomplete="off" aria-label="ETF hinzufügen"><button type="submit">Hinzufügen</button></form><div class="vs-suggest" id="vs-cmp-s"></div>' +
      '<div class="vs-tabs" id="vs-cmp-chips"></div></section><section class="vs-section" id="vs-cmp"><div class="vs-loading">…</div></section>');
    VS.master().then(function (m) {
      syms = syms.filter(function (s) { return m._bySymbol[s]; });
      var chips = root.querySelector("#vs-cmp-chips");
      chips.innerHTML = syms.map(function (s) { return '<a class="vs-pill small primary" href="#/vergleich?s=' + encodeURIComponent(syms.filter(function (x) { return x !== s; }).join(",")) + '" aria-label="' + s + ' entfernen">' + esc(s) + ' ×</a>'; }).join("");
      var q = root.querySelector("#vs-cmp-q"), box = root.querySelector("#vs-cmp-s");
      q.addEventListener("input", function () {
        var res = V.Master.search(m.etfs.filter(function (e) { return e.status !== "REVIEW"; }), q.value, 6);
        box.innerHTML = res.length ? '<ul>' + res.map(function (e) { return '<li><a href="#/vergleich?s=' + encodeURIComponent(syms.concat(e.symbol).slice(-4).join(",")) + '"><span><b>' + esc(e.symbol) + '</b> · ' + esc(e.name) + '</span></a></li>'; }).join("") + '</ul>' : "";
      });
      root.querySelector("#vs-cmp-form").addEventListener("submit", function (ev) { ev.preventDefault(); var hit = V.Master.search(m.etfs, q.value, 1)[0]; if (hit) VS.go("#/vergleich?s=" + encodeURIComponent(syms.concat(hit.symbol).slice(-4).join(","))); });
      var host = root.querySelector("#vs-cmp");
      if (syms.length < 2) { host.innerHTML = VS.pending("Mindestens zwei ETFs", "Füge oben einen weiteren ETF hinzu."); return; }
      VS.analytics.track("etf_compare", { symbols: syms.join(",") });
      Promise.all(syms.map(VS.etf)).then(function (ds) { drawCompare(host, ds, m); });
    });
  };

  function drawCompare(host, ds, m) {
    function val(d, path) { try { return path.split(".").reduce(function (o, k) { return o === null || o === undefined ? null : o[k]; }, d); } catch (e) { return null; } }
    var rows = [
      ["Kategorie", function (d) { return esc((m._bySymbol[d.symbol] || {}).category || "–"); }],
      ["Index", function (d) { return esc(d.index || "–"); }], ["Anbieter", function (d) { return esc(d.issuer || "–"); }],
      ["Börse · Währung", function (d) { return esc((d.exchange || "–") + " · " + (d.currency || "–")); }],
      ["Region", function (d) { return esc(VS.REGION[d.region] || "–"); }],
      ["Kursentwicklung 1J", function (d) { return F.spct(val(d, "metrics.windows.1Y.value")); }, "metrics.windows.1Y.value"],
      ["3J p.a.", function (d) { return F.spct(val(d, "metrics.windows.3Y.annualized")); }, "metrics.windows.3Y.annualized"],
      ["5J p.a.", function (d) { return F.spct(val(d, "metrics.windows.5Y.annualized")); }, "metrics.windows.5Y.annualized"],
      ["Schwankung p.a.", function (d) { return F.pct(val(d, "metrics.volatility.value")); }, "metrics.volatility.value"],
      ["Größter Rückgang", function (d) { return F.pct(val(d, "metrics.maxDrawdown.value")); }, "metrics.maxDrawdown.value"],
      ["Historie", function (d) { return F.years(val(d, "metrics.historyYears")); }],
      ["Kosten (TER)", function () { return '<span class="vs-fine">Daten folgen</span>'; }], ["Fondsgröße", function () { return '<span class="vs-fine">Daten folgen</span>'; }],
      ["Ausschüttung", function () { return '<span class="vs-fine">Daten folgen</span>'; }], ["Replikation", function () { return '<span class="vs-fine">Daten folgen</span>'; }],
      ["Tracking Difference", function () { return '<span class="vs-fine">Daten folgen</span>'; }],
      ["Overlap / Top-Holdings / Branchen", function () { return '<span class="vs-fine">Daten folgen (Holdings)</span>'; }],
      ["Komplex", function (d) { return d.complex ? '<span class="vs-badge complex">⚠ ja</span>' : "nein"; }]
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
    spread("vol", "metrics.volatility.value", 0.05, function (lo, hi) { return hi.s + " schwankt deutlich stärker als " + lo.s + " (" + F.pct(hi.v) + " vs. " + F.pct(lo.v) + " p.a.)."; });
    spread("mdd", "metrics.maxDrawdown.value", 0.1, function (lo, hi) { return "Größter Rückgang: " + lo.s + " " + F.pct(lo.v) + ", " + hi.s + " " + F.pct(hi.v) + " – beachte die unterschiedlich langen Historien."; });
    spread("1y", "metrics.windows.1Y.value", 0.05, function (lo, hi) { return "Im letzten Jahr lag " + hi.s + " " + F.pct(hi.v - lo.v) + "-Punkte vor " + lo.s + "."; });
    spread("hy", "metrics.historyYears", 3, function (lo, hi) { return hi.s + " hat " + F.years(hi.v) + " Kurshistorie, " + lo.s + " nur " + F.years(lo.v) + "."; });
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
  }

  /* ========================================================== WATCHLIST */
  VS.views.watchlist = function () {
    var root = VS.render('<section class="vs-hero"><p class="vs-eyebrow">Watchlist</p><h1>ETFs beobachten.</h1><p class="vs-lead">Performance, Status und Änderungen deiner beobachteten ETFs. Gespeichert nur in diesem Browser.</p></section><section class="vs-section" id="vs-wl"><div class="vs-loading">…</div></section>');
    Promise.all([VS.master(), VS.getJSON("/vorsorge/data/changes.json").catch(function () { return { events: [] }; })]).then(function (res) {
      var m = res[0], ch = res[1], list = VS.state.watchlist.map(function (s) { return m._bySymbol[s]; }).filter(Boolean);
      var host = root.querySelector("#vs-wl");
      if (!list.length) { host.innerHTML = '<div class="vs-card soft vs-empty">Noch keine ETFs beobachtet. Öffne einen ETF und tippe auf „♡ Beobachten“.<div class="vs-tabs" style="justify-content:center"><a class="vs-pill primary" href="#/etfs">ETFs entdecken</a></div></div>'; return; }
      host.innerHTML = '<div class="vs-table-wrap"><table class="vs-table"><thead><tr><th>ETF</th><th>Kurs</th><th>1 Tag</th><th>1J</th><th>Schwankung</th><th>Status</th><th>Kosten</th><th>Fondsgröße</th><th>Änderungen</th></tr></thead><tbody>' + list.map(function (e) {
        var evs = ch.events.filter(function (x) { return x.symbol === e.symbol; });
        return '<tr><td><a href="#/etf/' + e.symbol + '">' + esc(e.symbol) + '</a><span class="t-name">' + esc(e.name) + '</span><span class="t-name">' + esc(e.index || e.category) + '</span></td><td class="num">' + F.price(e.m && e.m.price, e.currency) + '</td><td class="num ' + F.cls(e.m && e.m.d1) + '">' + F.spct(e.m && e.m.d1, 2) + '</td><td class="num ' + F.cls(e.m && e.m.p["1Y"]) + '">' + F.spct(e.m && e.m.p["1Y"]) + '</td><td class="num">' + F.pct(e.m && e.m.vol) + '</td><td>' + (e.status === "ACTIVE" ? "aktiv" : "nicht gehandelt") + '</td><td class="vs-fine">Daten folgen</td><td class="vs-fine">Daten folgen</td><td>' + (evs.length ? esc(evs[0].text) : "–") + '</td></tr>';
      }).join("") + '</tbody></table></div>';
    });
  };
})(window);
