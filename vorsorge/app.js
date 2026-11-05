/* =========================================================================
   VISION UNIVERSE® VORSORGE — app.js   (Kern)

   Router, Zustand, Formatierung, Charts, Datenzugriff, Analytics-Vertrag.
   Die Bildschirme liegen in ui/*.js und melden sich bei VS.views an.
   Gerechnet wird nur in den Engines (vorsorge/engines/*.js).

   DISCLAIMER (Pflichttext, auf jeder Ansicht):
   "Die dargestellten Informationen dienen der Analyse und Information und
   stellen keine individuelle Anlage-, Steuer- oder Rechtsberatung dar."
   ========================================================================= */
(function (global) {
  "use strict";
  var V = global.VUVorsorge;
  var VS = global.VS = { views: {}, cache: {} };
  var DISCLAIMER = "Die dargestellten Informationen dienen der Analyse und Information und stellen keine individuelle Anlage-, Steuer- oder Rechtsberatung dar.";
  VS.DISCLAIMER = DISCLAIMER;

  /* --------------------------------------------------------- Analytics
     Ein Ereignisvertrag wie in Discover: feste Namen, keine Senke
     voreingestellt, nichts wird gesendet, solange niemand eine setzt. */
  var EVENTS = { vorsorge_open: 1, retirement_open: 1, planner_start: 1, planner_complete: 1, etf_view: 1, etf_compare: 1,
    etf_search: 1, portfolio_xray: 1, cost_simulation: 1, provider_compare: 1 };
  var sinks = [], buffer = [];
  VS.analytics = {
    EVENTS: Object.keys(EVENTS),
    track: function (name, props) {
      if (!EVENTS[name]) return null;
      var ev = { name: name, at: new Date().toISOString(), props: props || {} };
      buffer.push(ev); if (buffer.length > 50) buffer.shift();
      sinks.forEach(function (s) { try { s(ev); } catch (e) { /* nie stoeren */ } });
      return ev;
    },
    addSink: function (fn) { if (typeof fn === "function") sinks.push(fn); },
    recent: function () { return buffer.slice(); }
  };

  /* ------------------------------------------------------------- Store */
  var KEY = "vu-vorsorge-v1";
  var defaults = {
    plan: { age: 35, targetAge: 67, start: 5000, lumpSum: 0, monthly: 250, cost: 0.003, inflation: 0.02,
      desiredIncome: 2800, existingIncome: 1700, payoutYears: 25,
      returns: { konservativ: 0.03, basis: 0.05, optimistisch: 0.07 } },
    planDone: false,
    portfolio: [{ symbol: "URTH", weight: 0.88 }, { symbol: "EEM", weight: 0.12 }],
    watchlist: [],
    snapshot: null
  };
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) { var s = JSON.parse(raw); return Object.assign({}, defaults, s, { plan: Object.assign({}, defaults.plan, s.plan || {}) }); } }
    catch (e) { /* privater Modus */ }
    return JSON.parse(JSON.stringify(defaults));
  }
  VS.state = load();
  VS.save = function () { try { localStorage.setItem(KEY, JSON.stringify(VS.state)); } catch (e) { /* ignorieren */ } };

  /* -------------------------------------------------------- Formatierung */
  var nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  VS.fmt = {
    eur: function (v) { return v === null || v === undefined || !isFinite(v) ? "–" : nf0.format(Math.round(v)) + " €"; },
    eurK: function (v) {
      if (v === null || v === undefined || !isFinite(v)) return "–";
      var a = Math.abs(v);
      if (a >= 1e6) return (v / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Mio. €";
      if (a >= 1e4) return nf0.format(Math.round(v / 1000)) + " Tsd. €";
      return nf0.format(Math.round(v)) + " €";
    },
    price: function (v, cur) { return v === null || v === undefined ? "–" : nf2.format(v) + " " + (cur === "USD" ? "$" : cur || ""); },
    pct: function (v, d) { if (v === null || v === undefined || !isFinite(v)) return "–"; if (Math.abs(v) >= 0.9995 && Math.abs(v) < 1) return (v < 0 ? "-" : "") + (Math.floor(Math.abs(v) * 10000) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " %"; var s = (v * 100).toLocaleString("de-DE", { minimumFractionDigits: d === undefined ? 1 : d, maximumFractionDigits: d === undefined ? 1 : d }); return s + " %"; },
    spct: function (v, d) { if (v === null || v === undefined || !isFinite(v)) return "–"; return (v > 0 ? "+" : v < 0 ? "−" : "") + VS.fmt.pct(Math.abs(v), d); },
    cls: function (v) { return v === null || v === undefined ? "" : v > 0 ? "up" : v < 0 ? "down" : ""; },
    date: function (d) { if (!d) return "–"; var p = String(d).split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : d; },
    years: function (y) { return y === null || y === undefined ? "–" : y < 1 ? Math.round(y * 12) + " Monate" : y.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Jahre"; }
  };

  /** Veralteter Datenstand: mehr als `days` Kalendertage seit dem letzten Kurstag. */
  VS.stale = function (asOf, days) {
    if (!asOf) return '<span class="vs-badge bad">Datenstand unbekannt</span>';
    var age = Math.floor((Date.now() - Date.parse(asOf + "T00:00:00Z")) / 864e5);
    return age > (days || 7) ? ' <span class="vs-badge complex" title="Der letzte Kurstag liegt ' + age + ' Tage zurück.">Daten ' + age + ' Tage alt</span>' : "";
  };
  VS.esc = function (s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  VS.REGION = (V.Master && V.Master.REGION_LABEL) || {};
  VS.ASSET = { EQUITY: "Aktien", BOND: "Anleihen", MONEY_MARKET: "Geldmarkt", COMMODITY: "Rohstoffe", CRYPTO: "Krypto", REAL_ESTATE: "Immobilien", MULTI_ASSET: "Mischfonds", UNKNOWN: "Nicht zugeordnet" };
  VS.STATUS_TEXT = {
    INSUFFICIENT_HISTORY: "Historie zu kurz", NO_HISTORY: "Keine Kursdaten", NEEDS_DAILY_DATA: "Nur mit Tagesdaten",
    HOLDINGS_PENDING: "Datenquelle noch nicht angebunden (Holdings)", TER_SOURCE_PENDING: "Datenquelle noch nicht angebunden (Kosten)",
    REGION_UNKNOWN: "Noch nicht verfügbar (Region unbekannt)", DATA_PENDING: "Daten folgen"
  };

  /* ------------------------------------------------------------- Daten */
  function getJSON(url) {
    if (VS.cache[url]) return VS.cache[url];
    VS.cache[url] = fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status + " " + url); return r.json(); })
      .catch(function (e) { delete VS.cache[url]; throw e; });
    return VS.cache[url];
  }
  VS.getJSON = getJSON;
  /** Indexzeile -> Objekt (gleiche Form fuer alle Bildschirme). */
  function decodeRow(f, r) {
    var o = {}; for (var i = 0; i < f.length; i++) o[f[i]] = r[i];
    var e = { slug: o.slug, listingId: o.id, symbol: o.symbol, name: o.name, issuer: o.issuer, exchange: o.exchange, currency: o.currency,
      productType: o.productType, assetClass: o.assetClass, region: o.region, index: o.index, theme: o.theme, category: o.category,
      strategy: o.strategy, retirementClass: o.retirementClass, layer: o.layer, leverage: o.leverage || 1, inverse: !!o.inverse,
      status: o.status, singleStockUnderlying: o.single, from: o.from, coverage: o.coverage, distributionPolicy: o.dist, ucits: o.ucits,
      complex: o.retirementClass !== "STANDARD", consumerVisible: o.layer === "PUBLIC_ANALYSIS" || o.layer === "COMPLEX",
      priceHistoryAvailable: o.hy !== null && o.hy !== undefined,
      cost: o.ter === undefined ? null : o.ter, aum: o.aum === undefined ? null : o.aum, positions: o.hp === undefined ? null : o.hp, top10: o.t10 === undefined ? null : o.t10,
      holdingsAsOf: o.hAsOf || null, holdingsChanges: o.hch === undefined ? null : o.hch, usShare: o.us === undefined ? null : o.us, series: o.hs || null, domicile: o.dom || null };
    e.m = e.priceHistoryAvailable ? { price: o.price, priceDate: o.priceDate, d1: o.d1, hy: o.hy, vol: o.vol, mdd: o.mdd, trend: o.trend, rs: o.rs,
      t1Y: o.t1Y, t5Y: o.t5Y, p: { "1W": o.p1W, "1M": o.p1M, "3M": o.p3M, "6M": o.p6M, "YTD": o.pYTD, "1Y": o.p1Y, "3Y": o.p3Y, "5Y": o.p5Y, "10Y": o.p10Y, "MAX": o.pMAX } } : null;
    return e;
  }
  VS.decodeRow = decodeRow;
  /* Anzeige-Namen: Tiingo liefert viele Namen in Grossbuchstaben ("ISHARES MSCI SOUTH KOREA ETF") -> lesbare Schreibweise,
     Abkuerzungen (ETF, MSCI, S&P, USA …) bleiben gross. Gemischte Schreibweise bleibt unveraendert. */
  var KEEP = { ETF: 1, ETFS: 1, ETN: 1, MSCI: 1, "S&P": 1, USA: 1, US: 1, UK: 1, EM: 1, ESG: 1, FTSE: 1, CRSP: 1, REIT: 1, REITS: 1, TIPS: 1, AI: 1, SPDR: 1, ACWI: 1, EAFE: 1, NASDAQ: 1, DJ: 1, II: 1, III: 1, IV: 1, ESGU: 1, ADR: 1, MLP: 1, BDC: 1, ETC: 1, NYSE: 1, ICE: 1, CSI: 1, KOSPI: 1, DAX: 1, STOXX: 1, SRI: 1, PAB: 1, CTB: 1, "&": 1 };
  var CASE = { ISHARES: "iShares", VANECK: "VanEck", WISDOMTREE: "WisdomTree", PROSHARES: "ProShares", JPMORGAN: "JPMorgan", ISHRS: "iShares", BLACKROCK: "BlackRock", YIELDMAX: "YieldMax", GRANITESHARES: "GraniteShares", ROUNDHILL: "Roundhill", KRANESHARES: "KraneShares", DIREXION: "Direxion", "IBONDS": "iBonds" };
  VS.displayName = function (n) {
    n = String(n || "");
    if (!n || n !== n.toUpperCase() || !/[A-Z]{3}/.test(n)) return n;
    return n.split(/(\s+|-|\/)/).map(function (w) {
      if (!w.trim() || w === "-" || w === "/") return w;
      if (KEEP[w] || /\d/.test(w) || /^[A-Z]{1,2}$/.test(w)) return w;
      if (CASE[w]) return CASE[w];
      return w.charAt(0) + w.slice(1).toLowerCase();
    }).join("");
  };
  var BRAND = [[/ishares|blackrock/i, "iS"], [/vanguard/i, "VG"], [/spdr|state street/i, "SPDR"], [/xtrackers|dws/i, "X"], [/invesco/i, "IV"], [/schwab/i, "SW"], [/first trust/i, "FT"],
    [/franklin/i, "FR"], [/proshares/i, "PS"], [/direxion/i, "DX"], [/global x/i, "GX"], [/wisdomtree/i, "WT"], [/vaneck/i, "VE"], [/j\.?p\.? ?morgan/i, "JPM"], [/fidelity/i, "FI"], [/amundi/i, "AM"],
    [/\bark\b/i, "ARK"], [/pimco/i, "PI"], [/dimensional/i, "DFA"], [/goldman/i, "GS"], [/janus/i, "JH"], [/american century|avantis/i, "AV"], [/krane/i, "KW"], [/roundhill/i, "RH"], [/yieldmax/i, "YM"], [/graniteshares/i, "GR"]];
  VS.issuerShort = function (e) {
    var x = String((e && e.issuer) || "") + " " + String((e && e.name) || "");
    for (var i = 0; i < BRAND.length; i++) if (BRAND[i][0].test(x)) return BRAND[i][1];
    var w = String((e && e.issuer) || (e && e.name) || "").replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter(Boolean);
    return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : w.length ? w[0].slice(0, 2).toUpperCase() : "ETF";
  };

  function indexObject(m, rows) {
    m.etfs = rows.map(function (r) { return decodeRow(m.fields, r); });
    m._bySymbol = {}; m._bySlug = {};
    var rank = { PUBLIC_ANALYSIS: 3, COMPLEX: 2, REVIEW: 1, ARCHIVE: 0 };
    m.etfs.forEach(function (e) {
      m._bySlug[e.slug] = e;
      var cur = m._bySymbol[e.symbol];
      if (!cur || rank[e.layer] > rank[cur.layer]) m._bySymbol[e.symbol] = e;
    });
    m.find = function (key) { key = String(key || "").toUpperCase(); return m._bySlug[key] || m._bySymbol[key] || null; };
    return m;
  }
  /** Haupt-Index: Public Analysis + Komplex (schnell, fuer Screener und Suche). */
  VS.master = function () {
    return getJSON("/vorsorge/data/etf-index.json").then(function (m) { if (!m.etfs) indexObject(m, m.rows); return m; });
  };
  /** Startseiten-Auszug (etf-index-home.json): Zaehler, Stand und die Zeilen der Kern-ETFs, unveraendert
      aus etf-index.json kopiert. null, wenn der Auszug fehlt oder unvollstaendig ist -> dann gilt VS.master(). */
  VS.homeIndex = function () {
    if (VS._home) return VS._home;
    VS._home = getJSON("/vorsorge/data/etf-index-home.json").then(function (h) {
      if (!h || !Array.isArray(h.fields) || !Array.isArray(h.rows) || !Array.isArray(h.symbols) || !h.counts || h.fields.indexOf("symbol") < 0) return null;
      var m = indexObject(Object.assign({}, h), h.rows);
      m._covers = {}; h.symbols.forEach(function (s) { m._covers[String(s).toUpperCase()] = 1; });
      return m;
    }).catch(function () { return null; });
    return VS._home;
  };
  /** Index fuer die Schluessel `keys` (Slug oder Ticker): der Auszug, wenn er alle abdeckt, sonst der Haupt-Index. */
  VS.masterFor = function (keys) {
    return VS.homeIndex().then(function (h) {
      var ok = h && (keys || []).every(function (k) { return h._covers[String(k || "").toUpperCase()]; });
      return ok ? h : VS.master();
    });
  };
  /** Holdings-Feed und Quartale (holdings/feed.json); faellt auf holdings/index.json zurueck. */
  VS.holdingsFeed = function () {
    if (VS._feed) return VS._feed;
    var valid = function (x) { return x && Array.isArray(x.feed) && Array.isArray(x.quarters); };
    VS._feed = getJSON("/vorsorge/data/holdings/feed.json").then(function (f) { if (!valid(f)) throw new Error("INVALID_FEED"); return f; })
      .catch(function () { return getJSON("/vorsorge/data/holdings/index.json"); })
      .catch(function (e) { delete VS._feed; throw e; });
    return VS._feed;
  };
  /** Vollstaendig: zusaetzlich Archiv und Pruefschicht - nur bei Bedarf geladen. */
  VS.masterAll = function () {
    if (VS._all) return VS._all;
    VS._all = Promise.all([getJSON("/vorsorge/data/etf-index.json"), getJSON("/vorsorge/data/etf-index-extra.json").catch(function () { return { rows: [] }; })]).then(function (r) {
      var m = Object.assign({}, r[0]); return indexObject(m, r[0].rows.concat(r[1].rows));
    });
    return VS._all;
  };
  /** Detail + dekodierte Reihen. key = Slug oder Ticker. */
  VS.etf = function (key) {
    return VS.master().then(function (m) { return m.find(key) ? m : VS.masterAll(); }).then(function (m) {
      var e = m.find(key);
      if (!e) throw new Error("NOT_IN_INDEX");
      return getJSON("/vorsorge/data/etf/" + encodeURIComponent(e.slug) + ".json");
    }).then(function (d) {
      if (d.series !== undefined || !d.seriesPath) { d.series = d.series || null; return d; }
      return getJSON(d.seriesPath).then(function (s) {
        var C = V.Codec;
        d.series = { daily: C.decode(s.price.daily), weekly: C.decode(s.price.weekly), basis: "PRICE_RETURN",
          total: s.total ? { daily: C.decode(s.total.daily), weekly: C.decode(s.total.weekly) } : null, record: s };
        return d;
      }).catch(function () { d.series = null; d.seriesError = true; return d; });
    });
  };
  VS.rules = function () {
    return Promise.all(["2027-DE", "2026-DE-riester", "fruehstart-DE"].map(function (f) { return getJSON("/vorsorge/data/funding-rules/" + f + ".json"); }));
  };
  /** Kursreihen fuer Portfolio-Rechnungen: Wochenreihe (laengste Abdeckung). */
  VS.seriesFor = function (symbols) {
    return Promise.all(symbols.map(function (s) { return VS.etf(s).catch(function () { return null; }); })).then(function (list) {
      var out = {}, meta = {};
      list.forEach(function (d, i) { if (d) { out[symbols[i]] = (d.series && d.series.weekly) || []; meta[symbols[i]] = d; } });
      return { series: out, details: meta };
    });
  };

  /* --------------------------------------------------------------- DOM */
  VS.h = function (html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; };
  VS.root = function () { return document.getElementById("vs-root"); };
  /* Seitenende jeder Ansicht (VU3): der Pflichthinweis bleibt als eine kurze Zeile sichtbar; Quellen,
     Datenstaende, Methodik und die Rolle von Vision Universe stehen gebuendelt in EINEM „Daten & Methodik“.
     opts.dm: [[Begriff, HTML]] (bereits escaped), opts.asOf: Datenstand (ISO) fuer die Zusammenfassung. */
  VS.render = function (html, opts) { var r = VS.root(); r.innerHTML = html + footer(opts); return r; };
  function dmRows(rows) { return (rows || []).map(function (x) { return '<dt>' + VS.esc(x[0]) + '</dt><dd>' + x[1] + '</dd>'; }).join(""); }
  function footer(opts) {
    opts = opts || {};
    return '<details class="vu-dm vs-dm" id="vs-dm"><summary>Daten & Methodik' + (opts.asOf ? ' <small>Stand ' + VS.fmt.date(opts.asOf) + '</small>' : '<small hidden></small>') + '</summary><dl>' +
      dmRows(opts.dm) + '<dt class="vs-dm-fixed">Rolle</dt><dd>Vision Universe ist kein Broker, kein Depotanbieter und kein Vermittler: Wir verwahren kein Kapital und eröffnen keine Depots. Die Umsetzung erfolgt bei einem Anbieter deiner Wahl.</dd>' +
      '<dt>Datenquellen</dt><dd><a href="#/daten">Datenquellen & Datenqualität</a></dd></dl></details>' +
      '<p class="vs-disclaimer vs-legal">' + VS.esc(DISCLAIMER) + '</p>';
  }
  VS.footer = footer;
  /** Ergaenzt „Daten & Methodik“ einer bereits gezeigten Ansicht (z. B. Datenstand nach dem Laden). */
  VS.dm = function (rows, asOf) {
    var box = document.getElementById("vs-dm"); if (!box) return;
    var fixed = box.querySelector(".vs-dm-fixed"), t = document.createElement("template"); t.innerHTML = dmRows(rows);
    box.querySelector("dl").insertBefore(t.content, fixed);
    if (asOf) { var sm = box.querySelector("summary small"); sm.hidden = false; sm.textContent = "Stand " + VS.fmt.date(asOf); }
  };
  VS.pending = function (title, text) { return '<div class="vs-pending" role="note"><strong>' + VS.esc(title) + '</strong>' + VS.esc(text) + '</div>'; };
  VS.RETIRE = { STANDARD: "Standard", KOMPLEX: "Komplex", SEHR_KOMPLEX: "Sehr komplex", NICHT_EINORDENBAR: "Nicht einordenbar" };
  VS.STRATEGY = { LEVERAGED: "Hebel", INVERSE: "Short", LEVERAGED_INVERSE: "Hebel + Short", SINGLE_STOCK: "Einzelaktie", OPTION_INCOME: "Optionsprämien",
    COVERED_CALL: "Covered Call", BUFFER: "Puffer", DEFINED_OUTCOME: "Defined Outcome", CRYPTO: "Krypto", COMMODITY: "Rohstoff", THEMATIC: "Thema",
    BOND: "Anleihen", EQUITY: "Aktien", MULTI_ASSET: "Mischfonds", MONEY_MARKET: "Geldmarkt / ultrakurz", ALTERNATIVE: "Alternative Strategie", UNKNOWN: "Unbekannt" };
  VS.badges = function (e) {
    var b = [];
    var rc = e.retirementClass || (e.complex ? "KOMPLEX" : "STANDARD");
    if (rc === "SEHR_KOMPLEX") b.push('<span class="vs-badge bad" title="Hebel, Short oder Einzelaktie – für langfristige Vorsorge nicht konstruiert.">⚠ Sehr komplex</span>');
    else if (rc === "KOMPLEX") b.push('<span class="vs-badge complex" title="Optionen, Puffer, Krypto oder Rohstoff – Verhalten weicht von breit gestreuten ETFs ab.">⚠ Komplexes Produkt</span>');
    else if (rc === "NICHT_EINORDENBAR") b.push('<span class="vs-badge">Nicht einordenbar</span>');
    else b.push('<span class="vs-badge ok">Standard-Bauart</span>');
    if (e.productType && e.productType !== "ETF") b.push('<span class="vs-badge">' + VS.esc(e.productType) + '</span>');
    if (e.leverage > 1) b.push('<span class="vs-badge complex">' + e.leverage + 'x Hebel</span>');
    if (e.inverse) b.push('<span class="vs-badge complex">Short</span>');
    if (e.singleStockUnderlying) b.push('<span class="vs-badge complex">Einzelaktie ' + VS.esc(e.singleStockUnderlying) + '</span>');
    if (e.status === "INACTIVE") b.push('<span class="vs-badge bad">Inaktiv · nicht mehr gehandelt</span>');
    if (e.layer === "REVIEW") b.push('<span class="vs-badge bad">In Prüfung</span>');
    if (e.m && e.m.hy !== undefined && e.m.hy !== null && e.m.hy < 1) b.push('<span class="vs-badge">Historie &lt; 1 Jahr</span>');
    if (e.currency && e.currency !== "EUR") b.push('<span class="vs-badge">' + VS.esc(e.currency) + '</span>');
    return '<span class="vs-badges">' + b.join("") + '</span>';
  };
  VS.bars = function (list, opts) {
    opts = opts || {};
    var colors = ["var(--ink)", "var(--ink)", "var(--ink)", "var(--ink)", "var(--ink)"];
    if (!list || !list.length) return VS.pending("Keine Daten", "Für diese Aufteilung liegen keine Werte vor.");
    var shown = list.slice(0, 5), rest = list.slice(5).reduce(function (a, x) { return a + x.weight; }, 0);
    if (rest > 0) shown.push({ label: "Weitere", weight: rest, other: true });
    return '<div class="vs-bars" role="list">' + shown.map(function (x, i) {
      var c = x.key === "UNKNOWN" || x.other ? "var(--s-other)" : colors[i % colors.length];
      return '<div class="vs-bar" role="listitem"><span>' + VS.esc(x.label || x.key) + '</span><span class="track"><span class="fill" style="display:block;width:' +
        Math.max(1, Math.min(100, x.weight * 100)).toFixed(1) + '%;background:' + c + '"></span></span><span class="v num">' + VS.fmt.pct(x.weight, 0) + '</span></div>';
    }).join("") + '</div>';
  };

  /* ------------------------------------------------- Redesign 2027: Muster
     Bausteine aus assets/vu-ui.js (VUUI) plus die Vorsorge-Muster der Vorlage
     (docs/design/redesign-2027, Kapitel 10): Beispiel-Marke, Gewichtsbalken,
     ETF-Zeile, Regler, Ablauf-Kopf. Nur Weiss, Schwarz, Neongruen, Grau. */
  var U = global.VUUI || null;
  VS.U = U;
  /** Seitenkopf: Etikett, Titel als Frage, ein Satz. */
  VS.intro = function (title, lead, tag) {
    return '<header class="vs-intro"><p class="vu-ltag">' + VS.esc(tag || "Vorsorge") + '</p><h1 class="vu-lt">' + VS.esc(title) + '</h1>' + (lead ? '<p class="vu-lead">' + VS.esc(lead) + '</p>' : "") + '</header>';
  };
  /** Vorsorge-Muster Beispiel-Marke: jede Rechnung mit Annahmen ist so markiert. */
  VS.bsp = function (text) { return '<span class="vs-bsp">' + VS.esc(text || "Beispielrechnung") + '</span>'; };
  /** Abschnittstitel (C13). */
  VS.sect = function (title, href, link) { return U ? U.sect(title, href ? { href: href, link: link } : {}) : '<h2>' + VS.esc(title) + '</h2>'; };
  /** Vorsorge-Muster Gewichtsbalken: Bezeichnung, Wert, Balken (lime = hervorgehoben). */
  VS.wbar = function (label, value, share, lime, sub) {
    var w = Math.max(0, Math.min(100, Number(share) || 0));
    return '<div class="vs-wbar"><div class="vs-wbar-top"><span>' + VS.esc(label) + (sub ? ' <small>' + VS.esc(sub) + '</small>' : "") + '</span><b class="num">' + VS.esc(value) + '</b></div>' +
      '<span class="vs-wbar-track"><i class="' + (lime ? "is-lime" : "") + '" style="width:' + w.toFixed(1) + '%"></i></span></div>';
  };
  /** Kachel (C11) mit optionaler Erklaerung (C09 „?“). */
  VS.tile = function (label, value, sub, helpText) {
    return '<div class="vu-tile"><div class="vu-tile__label">' + VS.esc(label) + (helpText && U ? " " + U.q(helpText, label) : "") + '</div><div class="vu-tile__value num">' + VS.esc(value === null || value === undefined || value === "" ? "–" : value) + '</div>' + (sub ? '<div class="vu-tile__sub">' + VS.esc(sub) + '</div>' : "") + '</div>';
  };
  VS.help = function (text) { return U ? U.help(text) : '<p class="vs-fine">' + VS.esc(text) + '</p>'; };
  VS.verdict = function (kind, text) { return U ? U.verdict(kind, text) : '<span>' + VS.esc(text) + '</span>'; };
  /** Kursbewegung C07 (Plus neongruene Pille, Minus schwarze Pille); Bruchteil (0.12 = 12 %). Traegt .vs-chg fuer die Regressions-QA. */
  VS.chg = function (v, digits) {
    var ok = v !== null && v !== undefined && isFinite(v);
    return '<span class="vs-chg">' + (U ? U.chg(ok ? v * 100 : null, { digits: digits === undefined ? 2 : digits }) : VS.fmt.spct(v)) + '</span>';
  };
  /** Urteil zur Zielerreichung (Auf Kurs / Knapp / Nicht auf Kurs) als C08. */
  VS.trackVerdict = function (t) {
    var k = { ON_TRACK: "strong", CLOSE: "mid", OFF_TRACK: "weak" }[t && t.state] || "none";
    return VS.verdict(k, t ? t.label : "Keine Aussage");
  };
  /** Vorsorge-Muster Regler: Bezeichnung, Wert gross, Schieberegler (echtes input type=range). */
  VS.slider = function (id, label, value, o) {
    o = o || {};
    return '<div class="vs-slider"><label for="' + id + '"><span>' + VS.esc(label) + '</span><b class="num"><output id="' + id + '-out">' + VS.esc(o.fmt ? o.fmt(value) : value) + '</output> <small>' + VS.esc(o.unit || "") + '</small></b></label>' +
      '<input type="range" id="' + id + '" name="' + id + '" min="' + o.min + '" max="' + o.max + '" step="' + (o.step || 1) + '" value="' + VS.esc(value) + '"></div>';
  };
  /* Zusatz-Symbole der Vorsorge-Mockups (Stern, Kreis-Anteil, Abspielen, Saeulen); alle anderen aus VUUI.glyph. */
  var GLYPH_VS = {
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    play: '<path d="M8 5.5v13l10-6.5z"/>',
    bars: '<path d="M5 20V11M10 20V5M15 20v-7M20 20V8"/>'
  };
  VS.glyph = function (name, size) {
    if (!GLYPH_VS[name]) return U ? U.glyph(name, size) : "";
    var z = size || 18;
    return '<svg width="' + z + '" height="' + z + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + GLYPH_VS[name] + '</svg>';
  };
  /** Navigationskarte (C12) mit Vorsorge-Symbolen. */
  VS.navcard = function (o) {
    return '<a class="vu-navcard" href="' + VS.esc(o.href) + '"><span class="vu-hud" style="--vu-hud:42px">' + VS.glyph(o.glyph, 21) + '</span><span class="vu-navcard__text"><b>' + VS.esc(o.title) + '</b>' + (o.sub ? '<span>' + VS.esc(o.sub) + '</span>' : "") + '</span>' + VS.glyph("next", 18).replace("<svg ", '<svg class="vu-navcard__go" ') + '</a>';
  };
  /** Logo-Kachel (C10) fuer ETFs: Kuerzel. */
  VS.logo = function (sym) { return U ? U.logo(sym) : '<span class="vs-ava">' + VS.esc(sym) + '</span>'; };
  /** Vorsorge-Muster ETF-Zeile: Logo, Alltagsname + Index, Mini-Chart, 1-Jahres-Bewegung. */
  VS.etfRow = function (e, o) {
    o = o || {};
    var v = e.m && e.m.p ? e.m.p["1Y"] : null;
    return '<a class="vs-erow" href="' + (VS.etfHref ? VS.etfHref(e) : "#/etf/" + encodeURIComponent(e.slug || e.symbol)) + '" data-sym="' + VS.esc(e.symbol) + '">' + VS.logo(e.symbol) +
      '<span class="vs-erow-n"><b>' + VS.esc(o.title || e.category || e.symbol) + '</b><span>' + VS.esc(o.sub || e.index || VS.displayName(e.name)) + '</span></span>' +
      (o.noSpark ? "" : '<span class="vs-erow-mini" aria-hidden="true"></span>') +
      '<span class="vs-erow-p"><small>' + VS.esc(o.label || "1 Jahr") + '</small>' + VS.chg(v) + '</span></a>';
  };
  /** Wochenreihe eines ETFs (series/<slug>.json) – nur fuer Mini-Charts und Beispiele; null, wenn sie fehlt. */
  VS.weekly = function (slug) {
    return getJSON("/vorsorge/data/series/" + encodeURIComponent(slug) + ".json").then(function (s) { return V.Codec.decode(s.price.weekly); }).catch(function () { return null; });
  };
  /** Mini-Charts (C06 klein) in alle ETF-Zeilen eines Bereichs: die letzten 53 Wochen. */
  VS.fillSparks = function (root) {
    if (!global.VUChart) return;
    [].forEach.call(root.querySelectorAll(".vs-erow[data-sym] .vs-erow-mini:empty"), function (el) {
      var sym = el.parentNode.getAttribute("data-sym");
      VS.weekly(sym).then(function (w) { if (w && w.length > 2) el.innerHTML = global.VUChart.sparkline(w.slice(-53).map(function (p) { return p[1]; }), { width: 58, height: 30 }); });
    });
  };
  /** Sheet (C16) einmalig je Seite anlegen und oeffnen. */
  VS.sheet = function (id, title, body) {
    var old = document.getElementById(id); if (old) old.remove();
    var wrap = document.createElement("div"); wrap.innerHTML = U ? U.sheet(id, title, body) : "";
    var el = wrap.firstChild; if (!el) return null;
    el.classList.add("vu-ui", "vs-vsheet");
    document.body.appendChild(el);
    if (U) U.openSheet(el);
    el.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest("[data-close]")) U.closeSheet(el); });
    return el;
  };
  var helpBound = false;
  VS.bindHelp = function () { if (!helpBound && U) { U.bindHelp(document); helpBound = true; } };

  /* ------------------------------------------------------------ Charts
     Linien-/Flaechendiagramm in SVG mit Fadenkreuz und Tooltip. Eine
     Achse, duenne Linien, Legende ab zwei Reihen. */
  VS.lineChart = function (el, series, opts) {
    opts = opts || {};
    var W = Math.max(300, Math.min(1100, Math.round(el.clientWidth || 720)));
    var H = opts.height || (W < 500 ? 220 : 260), P = { l: opts.padL || (W < 500 ? 46 : 58), r: 12, t: 12, b: 26 };
    var all = [];
    series.forEach(function (s) { s.points.forEach(function (p) { all.push(p); }); });
    if (all.length < 2) { el.innerHTML = VS.pending("Keine Kurshistorie", "Für diesen Zeitraum liegen keine Kurse vor."); return; }
    var xs = all.map(function (p) { return typeof p[0] === "number" ? p[0] : Date.parse(p[0]); });
    var ys = all.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys.concat(opts.zero ? [0] : [])), y1 = Math.max.apply(null, ys);
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    var pad = (y1 - y0) * 0.06; if (!opts.zero) y0 -= pad; y1 += pad;
    function X(v) { return P.l + (v - x0) / (x1 - x0 || 1) * (W - P.l - P.r); }
    function Y(v) { return H - P.b - (v - y0) / (y1 - y0) * (H - P.t - P.b); }
    var fmtY = opts.fmtY || function (v) { return v.toLocaleString("de-DE", { maximumFractionDigits: 0 }); };
    var spanDays = (x1 - x0) / 864e5;
    var fmtX = opts.fmtX || function (v) {
      var d = new Date(v), mm = ("0" + (d.getUTCMonth() + 1)).slice(-2);
      if (spanDays <= 100) return ("0" + d.getUTCDate()).slice(-2) + "." + mm + ".";
      if (spanDays <= 1200) return mm + "/" + String(d.getUTCFullYear()).slice(2);
      return d.getUTCFullYear();
    };
    var ticks = 4, grid = "", axis = "";
    for (var i = 0; i <= ticks; i++) {
      var v = y0 + (y1 - y0) * i / ticks, y = Y(v);
      grid += '<line class="grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>';
      axis += '<text x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + VS.esc(fmtY(v)) + '</text>';
    }
    var xt = 4;
    for (var j = 0; j <= xt; j++) {
      var xv = x0 + (x1 - x0) * j / xt;
      axis += '<text x="' + X(xv) + '" y="' + (H - 6) + '" text-anchor="' + (j === 0 ? "start" : j === xt ? "end" : "middle") + '">' + VS.esc(fmtX(xv)) + '</text>';
    }
    /* C06 (Redesign 2027): eine schwarze Linie, weitere Reihen grau gestrichelt – keine Reihenfarben. */
    var colors = opts.colors || ["var(--ink)", "var(--dim)", "var(--dim)", "var(--dim)", "var(--dim)"];
    var paths = series.map(function (s, k) {
      var d = s.points.map(function (p, n) { var xv = typeof p[0] === "number" ? p[0] : Date.parse(p[0]); return (n ? "L" : "M") + X(xv).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join("");
      var col = s.color || colors[k % colors.length];
      var area = (s.area || (k === 0 && opts.area !== false && !s.color)) ? '<path d="' + d + "L" + X(typeof s.points[s.points.length - 1][0] === "number" ? s.points[s.points.length - 1][0] : Date.parse(s.points[s.points.length - 1][0])).toFixed(1) + "," + Y(Math.max(y0, 0)) + "L" + X(typeof s.points[0][0] === "number" ? s.points[0][0] : Date.parse(s.points[0][0])).toFixed(1) + "," + Y(Math.max(y0, 0)) + 'Z" fill="' + (k === 0 ? "var(--accent)" : col) + '" opacity="' + (k === 0 ? ".28" : ".14") + '"/>' : "";
      return area + '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + ((s.dash !== undefined ? s.dash : k > 0) ? ' stroke-dasharray="5 4"' : "") + '/>';
    }).join("");
    var legend = series.length > 1 ? '<div class="vs-legend">' + series.map(function (s, k) { var dashed = s.dash !== undefined ? s.dash : k > 0; return '<span><i class="' + (dashed ? "is-dash" : "") + '" style="background:' + (s.color || colors[k % colors.length]) + '"></i>' + VS.esc(s.label) + '</span>'; }).join("") + '</div>' : "";
    el.innerHTML = '<div class="vs-chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + VS.esc(opts.label || "Diagramm") + '"><g class="axis">' + grid + axis + '</g>' + paths +
      '<line class="xh" y1="' + P.t + '" y2="' + (H - P.b) + '" stroke="var(--dim)" stroke-width="1" visibility="hidden"/></svg><div class="tip" hidden></div></div>' + legend;
    var svg = el.querySelector("svg"), tip = el.querySelector(".tip"), xh = el.querySelector(".xh");
    var main = series[0].points;
    function move(ev) {
      var r = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var xv = x0 + ((cx / r.width * W) - P.l) / (W - P.l - P.r) * (x1 - x0);
      var best = null;
      series.forEach(function (s) {
        s.points.forEach(function (p) { var pv = typeof p[0] === "number" ? p[0] : Date.parse(p[0]); if (!best || Math.abs(pv - xv) < Math.abs(best.x - xv)) best = { x: pv }; });
      });
      if (!best) return;
      var lines = series.map(function (s) {
        var near = null; s.points.forEach(function (p) { var pv = typeof p[0] === "number" ? p[0] : Date.parse(p[0]); if (!near || Math.abs(pv - best.x) < Math.abs(near[0] - best.x)) near = [pv, p[1]]; });
        return (series.length > 1 ? VS.esc(s.label) + ": " : "") + VS.esc((opts.fmtTip || fmtY)(near[1]));
      });
      var px = X(best.x) / W * r.width;
      xh.setAttribute("x1", X(best.x)); xh.setAttribute("x2", X(best.x)); xh.setAttribute("visibility", "visible");
      tip.hidden = false; tip.style.left = Math.max(60, Math.min(r.width - 60, px)) + "px"; tip.style.top = "20px";
      tip.innerHTML = '<b>' + VS.esc((opts.fmtTipX || function (v) { return VS.fmt.date(new Date(v).toISOString().slice(0, 10)); })(best.x)) + '</b><br>' + lines.join("<br>");
    }
    svg.addEventListener("mousemove", move); svg.addEventListener("touchmove", move, { passive: true });
    svg.addEventListener("mouseleave", function () { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
    void main;
  };

  /* ------------------------------------------------------------ Router */
  /* Navigation: die gemeinsame Produkt-Leiste der Vision-Universe-Shell
     traegt Vorsorge | Plan | ETFs | Portfolio | ☰. Die weiteren Bereiche
     stehen am Ende jeder Ansicht (#vs-more) und im globalen Menue. */
  var DOCK = { home: "vorsorge", plan: "plan", etfs: "etfs", portfolio: "portfolio", foerderung: "plan", monitor: "portfolio", vergleichen: "etfs", wissen: "vorsorge" };
  var MORE = [["vergleichen", "#/vergleichen", "Vergleichen", "grid", "ETFs und Kosten"], ["foerderung", "#/foerderung", "Förderung", "star", "Zulagen 2027"],
    ["monitor", "#/monitor", "Veränderungen", "bell", "Bin ich auf Kurs?"], ["wissen", "#/wissen", "Wissen", "book", "Begriffe, je ein Satz"]];
  VS.SECTION_OF = { home: "home", rechner: "plan", plan: "plan", luecke: "plan", kosten: "vergleichen", szenarien: "portfolio", etfs: "etfs", etf: "etfs",
    vergleich: "vergleichen", vergleichen: "vergleichen", portfolio: "portfolio", xray: "portfolio", foerderung: "foerderung", riester: "vergleichen",
    fruehstart: "foerderung", anbieter: "vergleichen", monitor: "monitor", watchlist: "etfs", wissen: "wissen", daten: "wissen", start: "home" };

  function sections(active) {
    if (global.VUNavigation) global.VUNavigation.dock({ active: DOCK[active] || null });
    var el = document.getElementById("vs-more"); if (!el) return;
    var G = global.VUUI;
    el.className = "vs-more vs-wrap vu-ui";
    el.innerHTML = '<h2 class="vs-more-t">Mehr in Vorsorge</h2><div class="vs-more-grid">' + MORE.map(function (n) {
      return '<a href="' + n[1] + '"' + (n[0] === active ? ' aria-current="page"' : "") + '><span class="vu-hud" style="--vu-hud:34px;border-radius:10px">' + VS.glyph(n[3], 18) + '</span><b>' + n[2] + '</b><small>' + n[4] + '</small></a>';
    }).join("") + '</div>';
  }

  VS.parseHash = function () {
    var h = location.hash.replace(/^#\/?/, "");
    var q = {}, qi = h.indexOf("?");
    if (qi >= 0) { h.slice(qi + 1).split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); }); h = h.slice(0, qi); }
    var parts = h.split("/").filter(Boolean);
    return { name: parts[0] || "home", args: parts.slice(1), query: q };
  };

  var first = true;
  function route() {
    var r = VS.parseHash();
    var view = VS.views[r.name] || VS.views.notfound;
    /* V10: Vollbild-Ablauf ohne Kopf und Produkt-Leiste. */
    document.documentElement.classList.toggle("vs-flow", r.name === "start");
    [].forEach.call(document.querySelectorAll(".vs-vsheet"), function (x) { if (VS.U) VS.U.closeSheet(x); x.remove(); });
    sections(VS.SECTION_OF[r.name] || "home");
    if (first) { VS.analytics.track("vorsorge_open", {}); VS.analytics.track("retirement_open", {}); first = false; }
    try { view(r); }
    catch (e) { VS.render('<section class="vs-section"><h2>Diese Ansicht konnte nicht geladen werden.</h2><p class="vs-sub">' + VS.esc(e.message) + '</p></section>'); if (global.console) console.error(e); }
    if (!r.query.keepScroll) global.scrollTo(0, 0);
    var t = { home: "Vorsorge", rechner: "Altersvorsorge-Rechner", plan: "Vorsorgeplaner", etfs: "ETF Intelligence", etf: (r.args[0] || "") + " · ETF", portfolio: "Vorsorge-Portfolio",
      vergleichen: "Vergleichen", foerderung: "Förderung", monitor: "Bin ich auf Kurs?", wissen: "Wissen", europa: "Europäische ETFs", start: "Der 10-Euro-Sparplan" }[r.name] || "Vorsorge";
    document.title = t + " — Vision Universe®";
  }
  VS.go = function (hash) { if (location.hash === hash) route(); else location.hash = hash; };
  VS.views.notfound = function () {
    VS.render('<section class="vs-hero"><p class="vs-eyebrow">Vorsorge</p><h1>Diese Seite gibt es nicht.</h1><div class="vs-tabs"><a class="vs-pill primary" href="#/">Zur Vorsorge-Startseite</a></div></section>');
  };

  /* ---------------------------------------------------- Formular-Helfer */
  VS.field = function (id, label, value, opts) {
    opts = opts || {};
    return '<div class="vs-field' + (opts.full ? " full" : "") + '"><label for="' + id + '">' + VS.esc(label) + '</label><input id="' + id + '" name="' + id + '" type="' + (opts.type || "number") + '" inputmode="decimal" value="' + VS.esc(value) + '"' +
      (opts.min !== undefined ? ' min="' + opts.min + '"' : "") + (opts.max !== undefined ? ' max="' + opts.max + '"' : "") + (opts.step !== undefined ? ' step="' + opts.step + '"' : "") + '>' + (opts.unit ? '<span class="unit">' + VS.esc(opts.unit) + '</span>' : "") + '</div>';
  };
  VS.readNum = function (form, id, fallback, scale) {
    var el = form.querySelector("#" + id); if (!el) return fallback;
    var v = parseFloat(String(el.value).replace(",", "."));
    return isFinite(v) ? v * (scale || 1) : fallback;
  };

  /* Theme: Hell/Dunkel schaltet der Knopf im gemeinsamen Kopf (theme-switch,
     dieselbe gemerkte Wahl vu-discover-theme-v1 wie alle Produkte). */
  VS.start = function () {
    VS.bindHelp();
    global.addEventListener("hashchange", route);
    route();
  };
})(window);
