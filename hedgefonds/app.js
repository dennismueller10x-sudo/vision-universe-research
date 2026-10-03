/* =========================================================================
   VISION UNIVERSE® HEDGEFONDS — app.js
   Liest die serverseitig erzeugten 13F-Daten (scripts/hedgefonds/
   fetch_edgar_data.py). Kein SEC-Abruf im Browser.
     #/                 Übersicht
     #/fonds/<slug>     Fonds-Detail mit Kuchendiagramm, Verlauf, Trades
   ========================================================================= */
(function () {
  "use strict";

  var DATA_URL = window.HF_DATA_URL || "./data/hedgefonds.json";
  var FUND_URL = function (slug) { return "/hedgefonds/data/funds/" + encodeURIComponent(slug) + ".json"; };
  var THEME_KEY = "vu-discover-theme-v1";
  var SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
  var FEATURED = ["pershing-square", "berkshire", "scion", "appaloosa", "duquesne", "icahn", "third-point",
    "greenlight", "baupost", "tci", "himalaya", "dalal-street", "bridgewater", "ark", "tiger-global", "coatue"];
  var STATUS = {
    "new": { label: "Neu", cls: "new" }, added: { label: "Aufgestockt", cls: "up" },
    reduced: { label: "Reduziert", cls: "down" }, sold: { label: "Verkauft", cls: "down" },
    unchanged: { label: "Unverändert", cls: "" }
  };

  var S = { data: null, bySlug: {}, details: {}, style: "Alle", sort: "value", q: "", tab: "holdings" };
  var root = document.getElementById("hf-root");

  /* ------------------------------------------------------------- Helfer */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  var nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  function usd(n) {
    if (n == null || isNaN(n)) return "–";
    var a = Math.abs(n), s = n < 0 ? "−" : "";
    if (a >= 1e12) return s + nf1.format(a / 1e12) + " Bio. $";
    if (a >= 1e9) return s + nf1.format(a / 1e9) + " Mrd. $";
    if (a >= 1e6) return s + nf0.format(a / 1e6) + " Mio. $";
    if (a >= 1e3) return s + nf0.format(a / 1e3) + " Tsd. $";
    return s + nf0.format(a) + " $";
  }
  function shares(n) {
    if (n == null) return "–";
    var a = Math.abs(n);
    if (a >= 1e9) return nf1.format(n / 1e9) + " Mrd.";
    if (a >= 1e6) return nf1.format(n / 1e6) + " Mio.";
    return nf0.format(n);
  }
  function pct(n, signed) {
    if (n == null || isNaN(n)) return "–";
    var s = signed && n > 0 ? "+" : n < 0 ? "−" : "";
    return s + nf1.format(Math.abs(n)) + " %";
  }
  function dateDE(iso) {
    if (!iso) return "–";
    var p = iso.slice(0, 10).split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function quarter(iso) {
    if (!iso) return "–";
    return "Q" + (Math.floor((+iso.slice(5, 7) - 1) / 3) + 1) + " " + iso.slice(0, 4);
  }
  function qShort(iso) { return "Q" + (Math.floor((+iso.slice(5, 7) - 1) / 3) + 1) + "/" + iso.slice(2, 4); }
  function initials(name) {
    var w = String(name || "?").replace(/\(.*?\)|†|&/g, " ").split(/\s+/).filter(Boolean);
    return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }
  function hueVar(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    return SERIES[h % SERIES.length];
  }
  function cssVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function prettyIssuer(s) {
    // SEC-Namen sind GROSS geschrieben – für die Anzeige behutsam normalisieren
    if (!s || s !== s.toUpperCase()) return s || "";
    return s.toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); })
      .replace(/\b(Inc|Corp|Co|Ltd|Plc|Llc|Lp|Nv|Sa|Ag|Se|Etf|Tr|Spdr|Adr|Reit)\b/g, function (m) {
        return { Inc: "Inc", Corp: "Corp", Co: "Co", Ltd: "Ltd", Plc: "plc", Llc: "LLC", Lp: "LP", Nv: "NV", Sa: "SA", Ag: "AG", Se: "SE", Etf: "ETF", Tr: "Tr", Spdr: "SPDR", Adr: "ADR", Reit: "REIT" }[m];
      })
      .replace(/ (Of|And|The|For|De) /g, function (m) { return m.toLowerCase(); });
  }
  function secLink(f) {
    if (!f.accession) return "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F-HR&CIK=" + f.cik;
    return "https://www.sec.gov/Archives/edgar/data/" + (+f.cik) + "/" + f.accession.replace(/-/g, "") + "/";
  }

  function avatar(f, size) {
    var cls = "hf-avatar" + (size ? " " + size : "");
    var style = ' style="--tt:var(' + hueVar(f.slug || "x") + ')"';
    var label = f.manager || f.name;
    if (f.photo && f.photo.src) {
      return '<span class="' + cls + '"' + style + '><img src="/hedgefonds/' + esc(f.photo.src) + '" alt="' + esc(label) +
        '" loading="lazy" decoding="async" onerror="this.parentNode.textContent=\'' + esc(initials(label)) + '\'"></span>';
    }
    return '<span class="' + cls + '"' + style + ' aria-hidden="true">' + esc(initials(label)) + "</span>";
  }
  function logo(item, big) {
    var t = item.ticker || "";
    var txt = esc((t || item.issuer || "?").slice(0, 4));
    if (item.logo && t) {
      return '<span class="hf-logo' + (big ? " lg" : "") + '"><img src="/discover/logos/files/' + encodeURIComponent(t) +
        '.png" alt="" loading="lazy" onerror="this.parentNode.textContent=\'' + txt + '\'"></span>';
    }
    return '<span class="hf-logo' + (big ? " lg" : "") + '" aria-hidden="true">' + txt + "</span>";
  }
  function issuerName(item) { return prettyIssuer(item.displayName || item.issuer); }
  function stockName(item) {
    var name = esc(issuerName(item));
    if (item.discover && item.ticker) {
      return '<a href="/discover/#/s/US_REAL/' + encodeURIComponent(item.ticker) + '" title="In Discover ansehen">' + name + "</a>";
    }
    return name;
  }
  function optTag(item) {
    return item.putCall ? ' <span class="hf-badge warn">' + (item.putCall === "PUT" ? "Put" : "Call") + "</span>" : "";
  }
  function statusBadge(t) {
    var s = STATUS[t.status];
    if (!s || t.status === "unchanged") return '<span class="hf-badge">Unverändert</span>';
    var extra = (t.status === "added" || t.status === "reduced") && t.deltaPct != null ? " " + pct(t.deltaPct, true) : "";
    return '<span class="hf-badge ' + s.cls + '">' + s.label + extra + "</span>";
  }

  /* ------------------------------------------------------------- Theme */
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.setAttribute("data-theme-mode", t);
    var nav = document.querySelector("vu-navigation");
    if (nav) nav.setAttribute("theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0b0d10" : "#ffffff");
    try { if (t === "dark") localStorage.setItem(THEME_KEY, "dark"); else localStorage.removeItem(THEME_KEY); } catch (e) {}
    var b = document.getElementById("hf-theme");
    if (b) b.textContent = t === "dark" ? "☀ Hell" : "☾ Dunkel";
    if (location.hash.indexOf("#/fonds/") === 0) route();
  }

  /* -------------------------------------------------------------- Daten */
  function load() {
    return fetch(DATA_URL, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      if (!d.schema || d.schema.indexOf("hedgefonds-2") !== 0) throw new Error("Datenformat veraltet");
      S.data = d;
      d.funds.forEach(function (f) { S.bySlug[f.slug] = f; });
    });
  }
  function loadFund(slug) {
    if (S.details[slug]) return Promise.resolve(S.details[slug]);
    return fetch(FUND_URL(slug), { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) { S.details[slug] = d; return d; });
  }
  function investors() { return S.data.funds.filter(function (f) { return f.category === "Investoren"; }); }
  function institutions() { return S.data.funds.filter(function (f) { return f.category === "Institutionen"; }); }

  /* -------------------------------------------------- 13F-Meldefristen */
  function nextDeadline() {
    var now = new Date(), y = now.getFullYear();
    var list = [[y, 1, 14], [y, 4, 15], [y, 7, 14], [y, 10, 14], [y + 1, 1, 14]].map(function (a) {
      return new Date(a[0], a[1], a[2], 23, 59);
    });
    for (var i = 0; i < list.length; i++) if (list[i] > now) return list[i];
    return list[list.length - 1];
  }

  function deadlineQuarter(dl) {
    var m = dl.getMonth(); // Feb -> Q4 Vorjahr, Mai -> Q1, Aug -> Q2, Nov -> Q3
    return m === 1 ? "Q4 " + (dl.getFullYear() - 1) : "Q" + ((m - 1) / 3) + " " + dl.getFullYear();
  }

  /* ---------------------------------------------------------- Übersicht */
  function card(f, featured) {
    var chg = f.aumChangePct;
    var top = (f.top || []).filter(function (h) { return !h.putCall; }).slice(0, 3);
    var tc = f.tradeCounts;
    var foot = [];
    var behind = S.data.latestPeriod && f.reportDate < S.data.latestPeriod;
    foot.push('<span class="hf-badge' + (behind ? " warn" : "") + '"' + (behind ? ' title="Für ' + esc(S.data.latestPeriodLabel) + ' liegt noch keine Meldung vor"' : "") + ">" +
      (behind ? "Stand " : "") + quarter(f.reportDate) + "</span>");
    if (tc) {
      if (tc["new"]) foot.push('<span class="hf-badge new">' + tc["new"] + " neu</span>");
      if (tc.sold) foot.push('<span class="hf-badge down">' + tc.sold + " verkauft</span>");
    }
    if (f.stale) foot.push('<span class="hf-badge warn">Meldet nicht mehr</span>');
    return '<a class="hf-card' + (featured ? " featured" : "") + '" href="#/fonds/' + esc(f.slug) + '" style="--tt:var(' + hueVar(f.slug) + ')">' +
      '<div class="hf-card-top">' + avatar(f) + "<div><h3>" + esc(f.manager || f.name) + '</h3><div class="fund">' + esc(f.name) +
      '</div><span class="style">' + esc(f.style || "") + "</span></div></div>" +
      '<div class="hf-card-val"><b class="num">' + usd(f.totalValueUSD) + "</b>" +
      (chg != null ? '<small class="num ' + (chg >= 0 ? "pos" : "neg") + '">' + pct(chg, true) + " ggü. Vorquartal</small>" : "<small>Portfoliowert</small>") + "</div>" +
      '<div class="hf-card-hold">' + top.map(function (h) {
        return '<div class="row">' + logo(h) + "<span>" + esc(h.ticker || issuerName(h)) + '</span><em>' + pct(h.weightPct) + "</em></div>";
      }).join("") + "</div>" +
      '<div class="hf-card-foot">' + foot.join("") + "</div></a>";
  }

  function fundStack(list, max) {
    max = max || 5;
    var html = list.slice(0, max).map(function (x) {
      var f = S.bySlug[x.slug];
      return f ? '<a href="#/fonds/' + esc(f.slug) + '" title="' + esc((f.manager || f.name) + " · " + f.name) + '">' + avatar(f, "xs") + "</a>" : "";
    }).join("");
    return '<span class="hf-stack">' + html + (list.length > max ? '<span class="more">+' + (list.length - max) + "</span>" : "") + "</span>";
  }

  function stockList(list, kind) {
    if (!list || !list.length) return '<p class="hf-empty">Keine Daten für dieses Quartal.</p>';
    var max = Math.max.apply(null, list.map(function (a) { return kind === "consensus" ? a.fundCount : Math.abs(a.estValueUSD); }));
    return '<ol class="hf-list">' + list.map(function (a, i) {
      var right, sub;
      if (kind === "consensus") {
        right = "<b>" + a.fundCount + " Fonds</b><small>Ø " + pct(a.avgWeightPct) + " Anteil</small>";
      } else {
        var n = a.newCount, s = a.soldCount;
        right = '<b class="' + (kind === "buys" ? "pos" : "neg") + '">' + usd(a.estValueUSD) + "</b><small>" + a.fundCount + " Fonds" +
          (kind === "buys" && n ? " · " + n + " neu" : "") + (kind === "sells" && s ? " · " + s + " komplett" : "") + "</small>";
      }
      var w = (kind === "consensus" ? a.fundCount : Math.abs(a.estValueUSD)) / max * 100;
      sub = (a.ticker ? "<span>" + esc(a.ticker) + "</span>" : "") + fundStack(a.funds, 5);
      return '<li class="hf-li"><span class="rk">' + (i + 1) + "</span>" + logo(a, true) +
        '<div class="nm"><b>' + stockName(a) + "</b><span>" + sub + '</span><div class="hf-meter" aria-hidden="true"><i style="width:' + w.toFixed(1) +
        "%;background:var(" + (kind === "sells" ? "--down" : kind === "buys" ? "--up" : "--s1") + ')"></i></div></div><div class="val">' + right + "</div></li>";
    }).join("") + "</ol>";
  }

  function filteredInvestors() {
    var q = S.q.trim().toLowerCase();
    var list = investors().filter(function (f) {
      if (S.style !== "Alle" && f.style !== S.style) return false;
      if (!q) return true;
      var hay = [f.name, f.manager, f.secName, f.style].join(" ").toLowerCase();
      if (hay.indexOf(q) >= 0) return true;
      return (f.top || []).some(function (h) { return (h.ticker || "").toLowerCase() === q || (h.issuer || "").toLowerCase().indexOf(q) >= 0; });
    });
    var sorters = {
      value: function (a, b) { return b.totalValueUSD - a.totalValueUSD; },
      change: function (a, b) { return (b.aumChangePct == null ? -1e9 : b.aumChangePct) - (a.aumChangePct == null ? -1e9 : a.aumChangePct); },
      name: function (a, b) { return String(a.manager || a.name).localeCompare(String(b.manager || b.name), "de"); },
      filed: function (a, b) { return String(b.filedDate).localeCompare(String(a.filedDate)); },
      concentration: function (a, b) {
        var ca = (a.top || []).slice(0, 5).reduce(function (s, h) { return s + h.weightPct; }, 0);
        var cb = (b.top || []).slice(0, 5).reduce(function (s, h) { return s + h.weightPct; }, 0);
        return cb - ca;
      }
    };
    return list.sort(sorters[S.sort] || sorters.value);
  }

  function renderGrid() {
    var el = document.getElementById("hf-grid");
    if (!el) return;
    var list = filteredInvestors();
    el.innerHTML = list.length ? list.map(function (f) { return card(f); }).join("") :
      '<p class="hf-empty">Kein Investor passt zu „' + esc(S.q) + "“.</p>";
    var n = document.getElementById("hf-grid-count");
    if (n) n.textContent = list.length + " von " + investors().length + " Investoren";
  }

  function renderStyleChips() {
    var counts = {};
    investors().forEach(function (f) { counts[f.style] = (counts[f.style] || 0) + 1; });
    var styles = ["Alle"].concat(Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }));
    return styles.map(function (s) {
      return '<button class="hf-chip" type="button" data-style="' + esc(s) + '" aria-pressed="' + (S.style === s) + '">' + esc(s) +
        '<span class="c">' + (s === "Alle" ? investors().length : counts[s]) + "</span></button>";
    }).join("");
  }

  function renderHome() {
    var d = S.data, inv = investors(), agg = d.aggregates || {};
    var total = inv.reduce(function (s, f) { return s + (f.totalValueUSD || 0); }, 0);
    var dl = nextDeadline(), days = Math.ceil((dl - new Date()) / 864e5);
    var featured = FEATURED.map(function (s) { return S.bySlug[s]; }).filter(Boolean);
    var aggNames = (agg.funds || []).length;
    document.title = "Hedgefonds — Vision Universe®";

    root.innerHTML =
      '<section class="hf-hero">' +
        '<div class="hf-eyebrow">13F-Meldungen der SEC · ' + esc(d.latestPeriodLabel || "") + "</div>" +
        "<h1>Was die besten Investoren gerade kaufen.</h1>" +
        '<p class="lead">Die Portfolios von Bill Ackman, Warren Buffett, Michael Burry, David Tepper und ' + (inv.length - 4) +
          " weiteren Top-Investoren – mit allen Käufen und Verkäufen des Quartals, direkt aus den Pflichtmeldungen an die US-Börsenaufsicht.</p>" +
        '<div class="hf-actions"><a class="hf-pill primary" href="#investoren">Alle Investoren →</a>' +
          '<a class="hf-pill" href="#kaeufe">Größte Käufe</a><a class="hf-pill" href="#konsens">Meistgehaltene Aktien</a></div>' +
        '<label class="hf-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input id="hf-q" type="search" placeholder="Investor, Fonds oder Aktie suchen (z. B. Ackman, NVDA)" autocomplete="off" value="' + esc(S.q) + '" aria-label="Investor oder Aktie suchen"></label>' +
        '<div class="hf-stats">' +
          '<div class="hf-stat"><small>Investoren</small><b class="num">' + inv.length + "</b><span>einzeln von der SEC geladen</span></div>" +
          '<div class="hf-stat"><small>Gemeldetes Vermögen</small><b class="num">' + usd(total) + "</b><span>13F-pflichtige US-Positionen</span></div>" +
          '<div class="hf-stat"><small>Aktuelles Quartal</small><b>' + esc(d.latestPeriodLabel || "–") + "</b><span>Daten geprüft am " + dateDE(d.generatedAt) + "</span></div>" +
          '<div class="hf-stat"><small>Nächste Meldefrist</small><b class="num">' + dateDE(dl.toISOString()) + "</b><span>in " + days + " Tagen · für " + deadlineQuarter(dl) + "</span></div>" +
        "</div>" +
      "</section>" +

      '<section class="hf-section"><div class="hf-head"><div><h2>Star-Investoren</h2><p>Die bekanntesten Namen und ihre größten Positionen.</p></div>' +
        '<a class="hf-more" href="#investoren">Alle ansehen →</a></div>' +
        '<div class="hf-track">' + featured.map(function (f) { return card(f, true); }).join("") + "</div></section>" +

      '<section class="hf-section" id="kaeufe"><div class="hf-head"><div><h2>Käufe und Verkäufe im Quartal</h2>' +
        "<p>Summe über " + aggNames + " Star-Investoren (ohne Quant- und Multi-Strategy-Fonds mit tausenden Positionen). Volumen = Stückzahländerung × Kurs zum Quartalsende, daher geschätzt.</p></div></div>" +
        '<div class="hf-two"><div class="hf-panel"><h3><span class="dot" style="background:var(--up)"></span>Größte Käufe</h3>' + stockList((agg.buys || []).slice(0, 12), "buys") + "</div>" +
        '<div class="hf-panel"><h3><span class="dot" style="background:var(--down)"></span>Größte Verkäufe</h3>' + stockList((agg.sells || []).slice(0, 12), "sells") + "</div></div></section>" +

      '<section class="hf-section" id="konsens"><div class="hf-head"><div><h2>Meistgehaltene Aktien</h2><p>Welche Aktien die meisten Star-Investoren gleichzeitig im Depot haben.</p></div></div>' +
        '<div class="hf-two"><div class="hf-panel">' + stockList((agg.consensus || []).slice(0, 10), "consensus") + "</div>" +
        ((agg.consensus || []).length > 10 ? '<div class="hf-panel">' + stockList((agg.consensus || []).slice(10, 20), "consensus").replace(/<span class="rk">(\d+)<\/span>/g, function (m, n) { return '<span class="rk">' + (+n + 10) + "</span>"; }) + "</div>" : "") + "</div></section>" +

      '<section class="hf-section" id="investoren"><div class="hf-head"><div><h2>Alle Investoren</h2><p id="hf-grid-count"></p></div></div>' +
        '<div class="hf-tools"><div class="hf-chips" id="hf-styles">' + renderStyleChips() + "</div>" +
        '<select class="hf-select" id="hf-sort" aria-label="Sortierung">' +
          [["value", "Größtes Portfolio"], ["change", "Stärkstes Wachstum"], ["concentration", "Am konzentriertesten"], ["filed", "Neueste Meldung"], ["name", "Name A–Z"]].map(function (o) {
            return '<option value="' + o[0] + '"' + (S.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
          }).join("") + "</select></div>" +
        '<div class="hf-grid" id="hf-grid"></div></section>' +

      renderInstitutions() + footer();

    renderGrid();
    bindHome();
  }

  function renderInstitutions() {
    var list = institutions();
    if (!list.length) return "";
    return '<section class="hf-section" id="institutionen"><div class="hf-head"><div><h2>Weitere Institutionen</h2>' +
      "<p>Die größten übrigen 13F-Melder (Vermögensverwalter, Banken, Marktmacher) aus dem SEC-Sammeldatensatz " + quarter(S.data.bulkPeriod) +
      ". Diese Portfolios bilden überwiegend Indizes und Kundendepots ab.</p></div></div>" +
      '<div class="hf-table-wrap"><table class="hf-table"><thead><tr><th>#</th><th>Institution</th><th>Art</th><th class="r">Portfolio</th><th class="r">ggü. Vorquartal</th><th class="r">Positionen</th></tr></thead><tbody>' +
      list.map(function (f, i) {
        return '<tr data-slug="' + esc(f.slug) + '" tabindex="0"><td class="num">' + (i + 1) + '</td><td><div class="sec"><b>' + esc(f.name) + "</b></div></td><td>" + esc(f.style) +
          '</td><td class="r">' + usd(f.totalValueUSD) + '</td><td class="r ' + (f.aumChangePct >= 0 ? "pos" : "neg") + '">' + pct(f.aumChangePct, true) +
          '</td><td class="r">' + nf0.format(f.positionCount) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  function footer() {
    var d = S.data;
    var errs = (d.errors || []).length;
    return '<footer class="hf-footer"><b>VISION UNIVERSE®</b><p>Quelle: Form 13F-HR der US-Börsenaufsicht SEC (EDGAR, data.sec.gov). ' +
      "13F-Meldungen zeigen nur US-Aktien, ETFs und börsennotierte Optionen zum Quartalsende, werden bis zu 45 Tage später veröffentlicht und enthalten keine Short-Positionen, Anleihen oder ausländischen Aktien. " +
      "Käufe und Verkäufe sind aus dem Vergleich zweier Quartale abgeleitet; der tatsächliche Handelszeitpunkt und -preis sind nicht bekannt. Put/Call-Positionen sind mit dem Wert des Basiswerts gemeldet. " +
      "Ticker-Zuordnung: OpenFIGI. Porträts: Wikimedia Commons, jeweilige Urheber und Lizenz in der Detailansicht. Keine Anlageberatung.</p>" +
      "<p>Daten zuletzt geprüft: " + dateDE(d.generatedAt) + (errs ? " · " + errs + " Fonds derzeit nicht abrufbar" : "") + "</p></footer>";
  }

  function bindHome() {
    var q = document.getElementById("hf-q");
    if (q) q.addEventListener("input", function () {
      S.q = q.value;
      renderGrid();
      if (S.q.length === 1) { var g = document.getElementById("investoren"); if (g && g.getBoundingClientRect().top > innerHeight) g.scrollIntoView({ behavior: "smooth" }); }
    });
    document.getElementById("hf-styles").addEventListener("click", function (e) {
      var b = e.target.closest("[data-style]");
      if (!b) return;
      S.style = b.getAttribute("data-style");
      [].forEach.call(this.querySelectorAll("[data-style]"), function (x) { x.setAttribute("aria-pressed", x === b); });
      renderGrid();
    });
    document.getElementById("hf-sort").addEventListener("change", function () { S.sort = this.value; renderGrid(); });
    var t = document.querySelector("#institutionen tbody");
    if (t) {
      t.addEventListener("click", function (e) { var r = e.target.closest("tr[data-slug]"); if (r) location.hash = "#/fonds/" + r.getAttribute("data-slug"); });
      t.addEventListener("keydown", function (e) { if (e.key === "Enter") { var r = e.target.closest("tr[data-slug]"); if (r) location.hash = "#/fonds/" + r.getAttribute("data-slug"); } });
    }
  }

  /* ------------------------------------------------------------- Detail */
  function donut(d) {
    var hs = d.holdings || [];
    var total = d.totalValueUSD || 1;
    var top = hs.slice(0, 8);
    var rest = total - top.reduce(function (s, h) { return s + h.valueUSD; }, 0);
    var segs = top.map(function (h, i) {
      return { label: h.ticker || issuerName(h), sub: h.ticker ? issuerName(h) : "", value: h.valueUSD,
        color: cssVar(SERIES[i]), put: h.putCall };
    });
    if (rest / total > 0.0005) segs.push({ label: "Sonstige", sub: nf0.format(Math.max(0, d.positionCount - top.length)) + " Positionen", value: rest, color: cssVar("--s-other") });
    var R = 80, C = 2 * Math.PI * R, gap = segs.length > 1 ? 2.2 : 0, off = 0;
    var circles = segs.map(function (s, i) {
      var len = s.value / total * C;
      var dash = Math.max(0.6, len - gap);
      var c = '<circle class="seg" data-i="' + i + '" r="' + R + '" cx="100" cy="100" stroke="' + s.color + '" stroke-width="30" stroke-dasharray="' +
        dash.toFixed(2) + " " + (C - dash).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"><title>' + esc(s.label) + ": " + pct(s.value / total * 100) + "</title></circle>";
      off += len;
      return c;
    }).join("");
    var legend = segs.map(function (s, i) {
      return '<li data-i="' + i + '"><span class="sw" style="background:' + s.color + '"></span><span class="lb">' + esc(s.label) +
        (s.put ? " (" + (s.put === "PUT" ? "Put" : "Call") + ")" : "") + (s.sub ? "<small>" + esc(s.sub) + "</small>" : "") +
        '</span><span class="pc">' + pct(s.value / total * 100) + "</span></li>";
    }).join("");
    var conc = top.slice(0, 5).reduce(function (s, h) { return s + h.valueUSD; }, 0) / total * 100;
    return { segs: segs, html:
      '<div class="hf-box"><h3>Portfolio-Aufteilung</h3><p class="cap">Top 5 = ' + pct(conc) + " des Portfolios · " + nf0.format(d.positionCount) + " Positionen</p>" +
      '<div class="hf-donut-wrap"><div class="hf-donut" id="hf-donut"><svg viewBox="0 0 200 200" role="img" aria-label="Kuchendiagramm der größten Positionen">' + circles + "</svg>" +
      '<div class="hf-donut-center"><b id="hf-dc-v">' + usd(d.totalValueUSD) + '</b><span id="hf-dc-l">Portfoliowert ' + quarter(d.reportDate) + "</span></div></div>" +
      '<ul class="hf-legend" id="hf-legend">' + legend + "</ul></div></div>" };
  }

  function bindDonut(d, segs) {
    var wrap = document.getElementById("hf-donut"), legend = document.getElementById("hf-legend");
    if (!wrap) return;
    var v = document.getElementById("hf-dc-v"), l = document.getElementById("hf-dc-l");
    var total = d.totalValueUSD || 1;
    function on(i) {
      wrap.classList.add("dim");
      [].forEach.call(wrap.querySelectorAll(".seg"), function (c) { c.classList.toggle("on", +c.getAttribute("data-i") === i); });
      [].forEach.call(legend.children, function (li) { li.classList.toggle("on", +li.getAttribute("data-i") === i); });
      v.textContent = pct(segs[i].value / total * 100);
      l.textContent = segs[i].label + " · " + usd(segs[i].value);
    }
    function off() {
      wrap.classList.remove("dim");
      [].forEach.call(legend.children, function (li) { li.classList.remove("on"); });
      v.textContent = usd(d.totalValueUSD);
      l.textContent = "Portfoliowert " + quarter(d.reportDate);
    }
    [wrap, legend].forEach(function (el) {
      el.addEventListener("mouseover", function (e) { var t = e.target.closest("[data-i]"); if (t) on(+t.getAttribute("data-i")); });
      el.addEventListener("mouseleave", off);
    });
  }

  function history(d) {
    var h = (d.history || []).filter(function (x) { return x.valueUSD > 0; });
    if (h.length < 2) return '<div class="hf-box"><h3>Portfoliowert im Verlauf</h3><p class="cap">Noch kein Verlauf verfügbar.</p></div>';
    var max = Math.max.apply(null, h.map(function (x) { return x.valueUSD; }));
    var first = h[0].valueUSD, last = h[h.length - 1].valueUSD;
    var chg = first ? (last - first) / first * 100 : null;
    return '<div class="hf-box"><h3>Portfoliowert im Verlauf</h3><p class="cap">' + h.length + " Quartale · " +
      '<span class="' + (chg >= 0 ? "pos" : "neg") + '">' + pct(chg, true) + "</span> seit " + quarter(h[0].period) + '</p><div class="hf-hist">' +
      h.map(function (x, i) {
        var lbl = i === 0 || i === h.length - 1 || x.valueUSD === max;
        return '<div class="col' + (lbl ? " lbl" : "") + '"><span class="tip num">' + usd(x.valueUSD) + '</span><div class="bar" style="height:' +
          Math.max(1.5, x.valueUSD / max * 100).toFixed(1) + '%"></div><span class="q">' + qShort(x.period) + "</span></div>";
      }).join("") + "</div></div>";
  }

  function positionsTable(d) {
    var hs = d.holdings || [];
    return '<div class="hf-table-wrap"><table class="hf-table hf-pos"><thead><tr><th>#</th><th>Aktie</th><th class="r">Anteil</th><th class="r">Wert</th><th class="r">Stück</th><th>Veränderung</th></tr></thead><tbody>' +
      hs.map(function (h, i) {
        return "<tr><td class=\"num\">" + (i + 1) + '</td><td><div class="sec">' + logo(h, true) + "<div><b>" + stockName(h) + optTag(h) + "</b><small>" + esc(h.ticker || "") +
          (h.ticker ? " · " : "") + esc(h.cls || "") + '</small></div></div></td><td class="r"><span class="hf-wbar"><i style="width:' + Math.min(100, h.weightPct / (hs[0].weightPct || 1) * 100).toFixed(1) +
          '%"></i></span>' + pct(h.weightPct) + '</td><td class="r">' + usd(h.valueUSD) + '</td><td class="r">' + shares(h.shares) + "</td><td>" + (h.status ? statusBadge(h) : "–") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      (d.holdingsTruncated ? '<p class="hf-foot-note">Gezeigt werden die ' + hs.length + " größten von " + nf0.format(d.positionCount) + " Positionen.</p>" : "");
  }

  function tradesTable(list, sells) {
    if (!list.length) return '<p class="hf-empty">Keine ' + (sells ? "Verkäufe" : "Käufe") + " in diesem Quartal.</p>";
    return '<div class="hf-table-wrap"><table class="hf-table hf-pos"><thead><tr><th>Aktie</th><th>Aktion</th><th class="r">Stück vorher</th><th class="r">Stück jetzt</th><th class="r">Geschätztes Volumen</th><th class="r">Wert jetzt</th></tr></thead><tbody>' +
      list.map(function (t) {
        return '<tr><td><div class="sec">' + logo(t, true) + "<div><b>" + stockName(t) + optTag(t) + "</b><small>" + esc(t.ticker || t.cls || "") + "</small></div></div></td><td>" + statusBadge(t) +
          '</td><td class="r">' + shares(t.prevShares) + '</td><td class="r">' + shares(t.shares) + '</td><td class="r ' + (t.estValueUSD >= 0 ? "pos" : "neg") + '">' + usd(t.estValueUSD) +
          '</td><td class="r">' + usd(t.valueUSD) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function renderTab(d) {
    var el = document.getElementById("hf-tabbody");
    if (!el) return;
    var tr = d.trades || {};
    if (S.tab === "holdings") el.innerHTML = positionsTable(d);
    else if (S.tab === "buys") el.innerHTML = tradesTable((tr["new"] || []).concat(tr.added || []).sort(function (a, b) { return b.estValueUSD - a.estValueUSD; }), false);
    else el.innerHTML = tradesTable((tr.sold || []).concat(tr.reduced || []).sort(function (a, b) { return a.estValueUSD - b.estValueUSD; }), true);
    [].forEach.call(document.querySelectorAll(".hf-tab"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === S.tab); });
  }

  function renderDetail(slug) {
    var f = S.bySlug[slug];
    if (!f) { root.innerHTML = '<a class="hf-back" href="#/">← Alle Investoren</a><p class="hf-empty">Fonds nicht gefunden.</p>'; return; }
    document.title = (f.manager ? f.manager + " – " : "") + f.name + " · Hedgefonds — Vision Universe®";
    root.innerHTML = '<a class="hf-back" href="#/">← Alle Investoren</a><div class="hf-skeleton"></div>';
    window.scrollTo(0, 0);
    loadFund(slug).then(function (d) {
      if (location.hash !== "#/fonds/" + slug) return;
      var tc = d.tradeCounts || {}, chg = d.aumChangePct;
      var nBuys = (tc["new"] || 0) + (tc.added || 0), nSells = (tc.sold || 0) + (tc.reduced || 0);
      var dn = donut(d);
      var photo = d.photo;
      root.innerHTML = '<div class="hf-detail"><a class="hf-back" href="#/">← Alle Investoren</a>' +
        '<section class="hf-dhero">' + avatar(f, "xl") + "<div>" +
          '<div class="hf-eyebrow">' + esc(f.style || "") + (f.role ? " · " + esc(f.role) : "") + "</div>" +
          "<h1>" + esc(f.manager || f.name) + "</h1>" +
          '<p class="sub">' + esc(f.manager ? f.name : d.secName) + (d.secName && f.manager ? ' · <span style="color:var(--muted)">SEC-Filer: ' + esc(d.secName) + "</span>" : "") + "</p>" +
          (f.bio ? '<p class="bio">' + esc(f.bio) + "</p>" : "") +
          (f.note ? '<p class="hf-note">' + esc(f.note) + "</p>" : f.reportDate < S.data.latestPeriod ? '<p class="hf-note">Für ' + esc(S.data.latestPeriodLabel) +
            " liegt von diesem Fonds bei der SEC noch keine 13F-Meldung vor. Gezeigt wird der Stand " + quarter(f.reportDate) + ".</p>" : "") +
          '<div class="tags"><a class="hf-pill dark" href="' + secLink(d) + '" target="_blank" rel="noopener">13F bei der SEC ↗</a></div>' +
          (photo ? '<p class="hf-credit">Foto: ' + esc(photo.artist) + ", " + (photo.licenseUrl ? '<a href="' + esc(photo.licenseUrl) + '" target="_blank" rel="noopener">' + esc(photo.license) + "</a>" : esc(photo.license)) +
            (photo.sourceUrl ? ' · <a href="' + esc(photo.sourceUrl) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' : "") + "</p>" : "") +
        "</div></section>" +
        '<div class="hf-dstats">' +
          '<div class="hf-stat"><small>Portfoliowert</small><b class="num">' + usd(d.totalValueUSD) + "</b><span>" + quarter(d.reportDate) + "</span></div>" +
          '<div class="hf-stat"><small>ggü. Vorquartal</small><b class="num ' + (chg >= 0 ? "pos" : "neg") + '">' + pct(chg, true) + "</b><span>" + (d.prevTotalValueUSD ? "vorher " + usd(d.prevTotalValueUSD) : "kein Vorquartal") + "</span></div>" +
          '<div class="hf-stat"><small>Positionen</small><b class="num">' + nf0.format(d.positionCount) + "</b><span>" + (d.prevPositionCount != null ? "vorher " + nf0.format(d.prevPositionCount) : "") + (d.optionCount ? " · " + d.optionCount + " Optionen" : "") + "</span></div>" +
          '<div class="hf-stat"><small>Gemeldet am</small><b class="num">' + dateDE(d.filedDate) + "</b><span>" + esc(d.form || "13F-HR") + " · Stichtag " + dateDE(d.reportDate) + "</span></div>" +
        "</div>" +
        '<div class="hf-dgrid">' + dn.html + history(d) + "</div>" +
        '<div class="hf-tabs" role="tablist">' +
          '<button class="hf-tab" role="tab" data-tab="holdings">Positionen<span class="c">' + nf0.format(d.positionCount) + "</span></button>" +
          '<button class="hf-tab" role="tab" data-tab="buys">Käufe<span class="c">' + nBuys + "</span></button>" +
          '<button class="hf-tab" role="tab" data-tab="sells">Verkäufe<span class="c">' + nSells + "</span></button></div>" +
        '<div id="hf-tabbody"></div>' +
        (d.tradeCounts ? '<p class="hf-foot-note">' + (tc["new"] || 0) + " neue Positionen, " + (tc.added || 0) + " aufgestockt, " + (tc.reduced || 0) + " reduziert, " + (tc.sold || 0) +
          " komplett verkauft (Vergleich " + quarter(d.prevReportDate) + " → " + quarter(d.reportDate) + ").</p>" : "") +
        footer() + "</div>";
      bindDonut(d, dn.segs);
      renderTab(d);
      document.querySelector(".hf-tabs").addEventListener("click", function (e) {
        var b = e.target.closest("[data-tab]");
        if (!b) return;
        S.tab = b.getAttribute("data-tab");
        renderTab(d);
      });
    }).catch(function (err) {
      root.innerHTML = '<a class="hf-back" href="#/">← Alle Investoren</a><p class="hf-empty">Details konnten nicht geladen werden (' + esc(err.message) + ").</p>";
    });
  }

  /* ------------------------------------------------------------ Routing */
  var lastHome = 0;
  function route() {
    var h = location.hash;
    var m = h.match(/^#\/fonds\/([\w-]+)/);
    if (m) { lastHome = lastHome || 0; S.tab = S.tab || "holdings"; renderDetail(m[1]); return; }
    var anchor = h && h.length > 1 && h.indexOf("#/") !== 0 ? h.slice(1) : null;
    if (!document.getElementById("hf-grid")) renderHome();
    if (anchor) { var a = document.getElementById(anchor); if (a) a.scrollIntoView({ behavior: "smooth" }); }
    else if (h === "#/" || !h) window.scrollTo(0, lastHome);
  }
  window.addEventListener("hashchange", function () {
    if (location.hash.indexOf("#/fonds/") === 0) { if (document.getElementById("hf-grid")) lastHome = window.scrollY; S.tab = "holdings"; }
    route();
  });

  document.getElementById("hf-theme").addEventListener("click", function () {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
  setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

  root.innerHTML = '<div class="hf-skeleton" style="margin-top:24px;height:420px"></div>';
  load().then(route).catch(function (err) {
    root.innerHTML = '<p class="hf-empty">Die 13F-Daten konnten nicht geladen werden (' + esc(err.message) + ").</p>";
  });
})();
