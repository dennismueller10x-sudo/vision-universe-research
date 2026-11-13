/* =========================================================================
   VISION UNIVERSE QUANT — app/app.js                   Shell und Routing

   /quant/ ist die kanonische Adresse. Innerhalb von Quant wird ueber den
   Hash navigiert:

     #/                      Home
     #/screener              Quant Screener (einfach)   ?frage=<id>
     #/screener/profi        Quant Screener (Profi)     ?query=<regeln>
     #/stile                 Anlagestile (#/strategien leitet weiter)
     #/stile/<id>            ein Anlagestil
     #/aktien                Aktien (Suche, zuletzt, gemerkt)
     #/aktie/<TICKER>        Aktienanalyse
     #/elliott/<T>           ALT, wird zu /elliott/#/<T> (Elliott ist ein eigenes Produkt)
     #/aktie/<T>/technik     ALT, wird zu /elliott/#/<T> (?elliott=1 -> ansicht=profi)
     #/aktie/<T>/chartbild   ALT, wird zu /elliott/#/<T>

   GAST-BETRIEB (window.QX_HOST = "elliott"): /elliott/ laedt dieses Buendel hinter seiner Aktien-Route (/elliott/#/<T>) und
   haengt das Chartbild ueber QXApp.mountElliott in seine Seite. Dann startet app.js KEINEN eigenen Router und keine Suche
   (kein hashchange, kein "/"-Kuerzel): die Adresse gehoert dem Produkt.
     #/chartlagen            Technische Lagen im Ueberblick
     #/aktie/<T>/zahlen      Unternehmenszahlen ueber die Jahre
     #/vergleich/<A,B,...>   Vergleich
     #/methodik[/<thema>]    Methodik

   Alte Links (?view=stock&ticker=NVDA, /vu2/?view=...) werden beim Laden
   EINMAL auf die neue Route abgebildet - mit replaceState, also ohne
   Umleitungskette und ohne zusaetzlichen Eintrag im Verlauf.
   ========================================================================= */
(function (global) {
  "use strict";
  var S = global.QuantShell, X = global.QX, el = X.el;
  var HOSTED = !!global.QX_HOST;      // Gast im Elliott-Produkt (siehe Kopf)

  /* ---------------------------------------------- Alte Routen -> neue */
  /* VU3: eine Lage ohne Titel ("Klare Elliott-Strukturen (0)") ist kein nutzbares Angebot. Die Uebersicht
     (page-chartbild.js#overview) zeichnet jede Reihe als Reiter mit ihrer Zahl; Reiter mit 0 Titeln werden hier
     ausgeblendet - ausser, die Adresse waehlt genau diese Reihe. Daten und Regeln bleiben unberuehrt. */
  function hideEmptyLagen(main, params) {
    var chosen = params && params.get ? params.get("reihe") : null;
    [].forEach.call(main.querySelectorAll(".cb-chips button[data-id]"), function (b) {
      if (/\(0\)\s*$/.test(b.textContent || "") && b.dataset.id !== chosen && b.getAttribute("aria-selected") !== "true") { b.hidden = true; b.setAttribute("aria-hidden", "true"); }
    });
  }

  function legacyRoute(search) {
    var p = new URLSearchParams(search || "");
    var view = p.get("view");
    if (!view) return null;
    var t = String(p.get("ticker") || "").toUpperCase();
    var okT = /^[A-Z0-9.-]{1,12}$/.test(t);
    var map = {
      home: "#/", stock: okT ? "#/aktie/" + t : "#/aktien", quant: okT ? "#/aktie/" + t : "#/aktien",
      aktien: "#/aktien", stocks: "#/aktien", screener: "#/screener", strategies: "#/stile", strategien: "#/stile",
      explain: "#/methodik", methodik: "#/methodik", methodology: "#/methodik",
      technical: okT ? "#/aktie/" + t + "/technik" : "#/aktien", elliott: okT ? "/elliott/#/" + t + "?ansicht=profi" : "/elliott/",
      fundamentals: okT ? "#/aktie/" + t + "/zahlen" : "#/aktien",
      compare: "#/vergleich" + (p.get("tickers") ? "/" + p.get("tickers") : okT ? "/" + t : ""),
      watchlist: "#/aktien", signals: "#/meldungen", radar: "#/meldungen", meldungen: "#/meldungen", backtest: "#/forschung", backtesting: "#/forschung", forschung: "#/forschung", discover: "#/screener", markets: "#/", research: "#/methodik", portfolio: "#/", atlas: "#/methodik"
    };
    var target = map[view] || "#/";
    if (view === "screener") {
      if (p.get("query")) target = "#/screener/profi?query=" + encodeURIComponent(p.get("query"));
      else if (p.get("faktoren")) target = "#/screener?frage=" + ({ momentum: "momentum", value: "guenstig", risk: "ruhig", growth: "wachstum-qualitaet" }[p.get("faktoren").split(",")[0]] || "qualitaet");
    }
    return target;
  }

  /* #/aktie/<T>/technik[?elliott=1] und #/aktie/<T>/chartbild -> #/elliott/<T> (Mission IV: die Technikseite zeigt ohnehin das Chartbild). */
  function canonicalElliott(r) {
    var q = new URLSearchParams(r.params.toString());
    if (q.get("elliott") === "1") { q.set("ansicht", "profi"); }
    q.delete("elliott");
    var qs = q.toString();
    return "/elliott/#/" + encodeURIComponent(r.ticker) + (qs ? "?" + qs : "");
  }

  /* Alte Namen → neue Namen (Konzept Quant 2026-11, Entscheidung 3). Pfad und Parameter bleiben erhalten. */
  var RENAMED = { radar: "meldungen", strategien: "stile", backtest: "forschung" };
  function renamed(hash) {
    var h = String(hash || "").replace(/^#\/?/, ""), q = h.indexOf("?"), path = q >= 0 ? h.slice(0, q) : h, qs = q >= 0 ? h.slice(q) : "";
    var parts = path.split("/");
    if (RENAMED[parts[0]]) parts[0] = RENAMED[parts[0]];
    if (parts[0] === "meldungen") qs = qs.replace(/([?&]filter=)strategien\b/, "$1stile");
    return "#/" + parts.join("/") + qs;
  }
  function parse(hash) {
    var h = String(hash || "").replace(/^#/, "");
    if (!h || h === "/") return { view: "home", params: new URLSearchParams() };
    var q = h.indexOf("?"), path = q >= 0 ? h.slice(0, q) : h, params = new URLSearchParams(q >= 0 ? h.slice(q + 1) : "");
    var parts = path.split("/").filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var r = { params: params, parts: parts };
    switch (parts[0]) {
      case "screener": r.view = "screener"; r.pro = parts[1] === "profi"; break;
      case "stile": r.view = "strategien"; r.id = parts[1] || null; break;
      case "strategien": r.view = "renamed"; break;
      case "aktien": r.view = "aktien"; break;
      case "elliott":
        r.ticker = String(parts[1] || "").toUpperCase();
        r.view = !parts[1] ? "elliottHome" : /^[A-Z0-9.-]{1,12}$/.test(r.ticker) ? "elliott" : "notfound";
        break;
      case "meldungen": r.view = "radar"; break;
      case "radar": r.view = "renamed"; break;
      case "chartlagen": r.view = "chartlagen"; break;
      case "forschung": r.view = "backtest"; if (parts[1] === "fall") { r.id = null; r.fall = parts[2] ? String(parts[2]).toLowerCase() : null; } else r.id = parts[1] ? String(parts[1]).toUpperCase() : null; break;
      case "backtest": r.view = "renamed"; break;
      case "aktie":
        r.ticker = String(parts[1] || "").toUpperCase();
        r.view = !/^[A-Z0-9.-]{1,12}$/.test(r.ticker) ? "notfound" : parts[2] === "technik" ? "technik" : parts[2] === "chartbild" ? "chartbild" : parts[2] === "chart" ? "chart" : parts[2] === "zahlen" ? "zahlen" : "aktie";
        break;
      case "vergleich": r.view = "vergleich"; r.list = (parts[1] || "").split(",").map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean); break;
      case "methodik": r.view = "methodik"; r.topic = parts[1] || null; break;
      default: r.view = "notfound";
    }
    return r;
  }
  var SECTION = { home: "home", radar: "home", renamed: "home", backtest: "methodik", screener: "screener", strategien: "strategien", aktien: "aktien", aktie: "aktien", technik: "aktien", chartbild: "aktien", chart: "aktien", elliott: "elliott", chartlagen: "aktien", zahlen: "aktien", vergleich: "aktien", methodik: "methodik" };
  var TITLE = { home: "Quant – Aktien verstehen", radar: "Meldungen", backtest: "Forschung", screener: "Quant Screener", strategien: "Anlagestile", aktien: "Aktien", aktie: "Aktienanalyse", technik: "Kursstruktur", chartbild: "Chartbild", chart: "Chartbild", elliott: "Elliott", chartlagen: "Technische Lagen", zahlen: "Unternehmenszahlen", vergleich: "Vergleich", methodik: "Methodik", notfound: "Nicht gefunden" };

  /* -------------------------------------------------------- Kontext */
  /* CHARTBILD (Technical Intelligence v3) LAEDT NUR, WO ES GEBRAUCHT WIRD.
     Seite, Chart und Stile (rund 130 KB) gehoeren nicht ins Buendel jeder Quant-Ansicht (Ressourcen-Budget der
     Startseite und des Screeners). Im Buendel bleiben nur die Lese-API und die Texte (Teaser, Beobachtungsliste).
     Stile und ti-chart.js vor page-chartbild.js. */
  var CB_CSS = "/quant/app/chartbild.css", cbCss = null;
  function chartbildCss() {
    if (!cbCss) cbCss = new Promise(function (ok) {
      var own = global.VUReleaseGuard && global.VUReleaseGuard.identity(), l = document.createElement("link"); l.rel = "stylesheet"; l.href = CB_CSS + (own ? "?v=" + own.id : "");
      l.onload = function () { ok(true); }; l.onerror = function () { cbCss = null; ok(false); };
      document.head.appendChild(l);
    });
    return cbCss;
  }
  /* Ueber loadScript (wie Backtesting): gleiche Versionsmarke wie das Buendel, Fehler wird beim naechsten Aufruf erneut versucht. */
  function loadChartbild() {
    return Promise.all([chartbildCss(), global.QXChartbild ? true : loadScript("/quant/ui/ti-chart.js").then(function () { return loadScript("/quant/app/page-chartbild.js"); })])
      .then(function () { if (!global.QXChartbild) throw new Error("CHARTBILD_LOAD_FAILED"); return global.QXChartbild; });
  }
  global.QXLoadChartbild = loadChartbild;
  global.QXChartbildCss = chartbildCss;
  /* Stile der Aktienseite (UI-Konzept 23.10.2026) - nur dort gebraucht, deshalb nicht im Buendel jeder Ansicht. */
  var STOCK_CSS = "/quant/app/stock.css", stCss = null;
  global.QXLoadStockCss = function () {
    if (!stCss && global.VUQuantBoot && global.VUQuantBoot.styleReady) stCss = global.VUQuantBoot.styleReady.then(function (ok) { if (!ok) stCss = null; return ok; });
    if (!stCss) stCss = new Promise(function (ok) {
      var own = global.VUReleaseGuard && global.VUReleaseGuard.identity(), l = document.createElement("link"); l.rel = "stylesheet"; l.href = (document.querySelector("link[data-vu-stock-style]") || {}).href || STOCK_CSS + (own ? "?v=" + own.id : "");
      l.onload = function () { ok(true); }; l.onerror = function () { stCss = null; ok(false); };
      document.head.appendChild(l);
    });
    return stCss;
  };

  var NAMES_VIEW = "/quant/data/product/universe-names-v1.json.gz";
  var api = global.VUProductServices.create({ loadJSON: S.loadJSON, displayPolicy: global.VUDisplayPolicy, queryEngine: global.VUQuery });
  var namesPromise = null, distPromise = null, wordsPromise = null, langPromise = null, hubPromise = null;
  /* Backtesting nur dort laden, wo es gebraucht wird (Startseite, Radar,
     Aktienseite, Backtesting) - nicht im gemeinsamen Buendel, damit der
     Screener sein Ressourcenbudget behaelt. Version wie das Buendel. */
  var lazy = {};
  function loadScript(src) {
    if (!lazy[src]) lazy[src] = new Promise(function (resolve) {
      var bundle = document.querySelector('script[src*="release-bundle.js"]'), v = bundle ? (bundle.getAttribute("src").split("?v=")[1] || "") : "";
      /* Kennung der Pipeline (release-guard.js): gilt dem ganzen Produktcode, also auch dem Nachlade-Skript, das das Buendel nicht enthaelt. */
      var own = global.VUReleaseGuard && global.VUReleaseGuard.identity();
      if (own) v = own.id;
      var s = document.createElement("script");
      s.src = src + (v ? "?v=" + v : ""); s.async = false;
      s.onload = function () { resolve(true); };
      s.onerror = function () { delete lazy[src]; resolve(false); };
      /* Nachgeladener Code muss zum Buendel dieses Tabs passen: ist seit dem Laden ein neuer Release ausgeliefert, laedt der
         Waechter die Seite neu (oder lehnt ab), statt ein neues Skript neben das alte Buendel zu setzen. */
      var guard = global.VUReleaseGuard;
      (guard ? guard.beforeLoad() : Promise.resolve()).then(function () { document.head.appendChild(s); }, function () { delete lazy[src]; resolve(false); });
    });
    return lazy[src];
  }
  /* Release: der Code der Aktienseite, der Methodik und der Werkzeuge liegt je in einem Paket (scripts/vu2/build-release.mjs,
     QUANT_PACKS), nicht im Buendel jeder Ansicht. Lokal stehen die Skripte in der Seite: kein Paket, sofort fertig. */
  function pack(name) {
    var p = global.VUQuantPacks && global.VUQuantPacks[name];
    return p ? loadScript(p.src).then(function (ok) { if (!ok) throw new Error("PACK_LOAD_FAILED " + name); }) : Promise.resolve();
  }
  var ctx = {
    api: api, names: {}, types: {}, entries: {},
    /* Signal-Engine und Backtest-Ansichten (quant/engines/signal-backtest.js, quant/app/page-backtest.js). */
    /* Nur die Ansicht (Evidenz auf Karten, Radar-Status) - ohne Engines. */
    loadBacktestView: function () {
      if (global.QXEvidence) return Promise.resolve(true);
      return loadScript("/quant/app/page-evidence.js");
    },
    loadBacktest: function () {
      if (global.QXBacktest && global.VUSignalBacktest && global.VUBacktestCertification) return Promise.resolve(true);
      return loadScript("/quant/engines/signal-backtest.js").then(function () { return loadScript("/quant/engines/backtest-certification.js"); }).then(function () { return loadScript("/quant/app/page-evidence.js"); }).then(function () { return loadScript("/quant/app/page-backtest.js"); });
    },
    /* Stammaktien zuerst - Vorzugsaktien und Anleihen bleiben gezaehlt, stehen aber hinten. */
    commonFirst: function (list) { return (list || []).slice().sort(function (a, b) { return (ctx.types[a] === "COMMON_STOCK" ? 0 : 1) - (ctx.types[b] === "COMMON_STOCK" ? 0 : 1); }); },
    openSearch: function () { search.open(); },
    /* Warm only the canonical stock and its critical styles. Evidence,
       distributions and the live hub start after the visible head. */
    prefetchStock: function (ticker) {
      if (ctx.prefetched && ctx.prefetched.ticker === ticker && Date.now() - ctx.prefetched.at < 30000) return;
      global.QXLoadStockCss();
      var pending = { ticker: ticker, at: Date.now(), stock: null };
      pending.stock = api.getStockIntelligence(ticker).catch(function () { return null; }).finally(function () { if (ctx.prefetched === pending) ctx.prefetched = null; });
      ctx.prefetched = pending;
    },
    // A request owned by this actual navigation may settle before its lazy
    // page module arrives. Consume it once; never reuse it across navigations.
    startStock: function (ticker) { global.QXLoadStockCss(); ctx.routeStock = { ticker: ticker, stock: api.getStockIntelligence(ticker).catch(function () { return null; }) }; },
    takePrefetched: function (ticker) { var p = ctx.routeStock || ctx.prefetched; ctx.routeStock = null; ctx.prefetched = null; return p && p.ticker === ticker ? p.stock : null; },
    routeStock: null,
    prefetched: null,
    /* Im Release liegt neben der Liste eine Namensansicht (s, n, t, il; 78 statt 126 KB gzip, scripts/vu2/build-release.mjs,
       universeListViews) - dieselben Namen und Arten. Lokal und in aelteren Staenden: die volle Liste. ctx.entries traegt aus
       der Ansicht nur s, n, t, il; den ganzen Eintrag eines Titels liefert api.getUniverseEntry.
       full = true: die Ansicht braucht die ganze Liste ohnehin (Screener: getUniverse). Dann gilt sie auch hier - ueber
       denselben Ladepfad, damit der Dienst sie nicht ein zweites Mal abruft. */
    loadNames: function (full) {
      if (!namesPromise) namesPromise = (full ? Promise.reject(new Error("FULL_LIST_WANTED")) : S.loadCompressedJSON(NAMES_VIEW).then(function (d) {
        if (!d || d.schemaVersion !== "universe-names-1.0.0" || !Array.isArray(d.entries)) throw new Error("NAMES_VIEW_CONTRACT");
        return d;
      })).catch(function () { return S.loadCompressedJSON("/quant/data/product/universe-list-v1.json.gz"); }).then(function (d) {
        (d.entries || []).forEach(function (e) { if (!e || !e.s) return; if (e.n && e.n !== e.s) ctx.names[e.s] = e.n; if (e.t) ctx.types[e.s] = e.t; ctx.entries[e.s] = e; });
        return ctx.names;
      }).catch(function () { return ctx.names; });
      return namesPromise;
    },
    /* Alle veroeffentlichten Faktorwerte je Faktor, aufsteigend - fuer die
       gezaehlte Position ("hoeher als bei X %") und die Methodik. */
    distributionRows: function () {
      if (!distPromise) distPromise = api.getFactorEvidenceScreening().then(function (s) {
        if (!s || s.state !== "AVAILABLE") throw Error("unavailable");
        var out = {};
        global.VUQuantViewModel.ORDER.forEach(function (id) {
          out[id] = s.rows.map(function (r) { return r["quantV2.factorEvidence." + id]; }).filter(function (v) { return typeof v === "number" && isFinite(v); }).sort(function (a, b) { return a - b; });
        });
        return out;
      });
      distPromise.catch(function () { distPromise = null; });
      return distPromise;
    },
    distribution: function () { return ctx.distributionRows(); },
    patternWords: function () {
      if (!wordsPromise) wordsPromise = S.loadJSON("/quant/methodology/pattern-research-v1.json").then(function (m) {
        var w = {};
        (function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === "object") { if (o.id && o.plain) w[o.id] = o.plain; Object.keys(o).forEach(function (k) { walk(o[k]); }); } })(m);
        return w;
      }).catch(function () { return {}; });
      return wordsPromise;
    },
    /* Realtime: derselbe Hub wie Discover, mit derselben Konfiguration -
       erst geladen, wenn eine Aktienseite einen Chart zeichnet. */
    hubReady: function () {
      if (!hubPromise) hubPromise = Promise.all([S.loadJSON("/discover/data/meta.json").catch(function () { return null; }), S.loadJSON("/quant/config/market-calendar.json").catch(function () { return null; }), pack("stock").catch(function () { return null; })]).then(function (v) {
        var Hub = global.VUDiscover && global.VUDiscover.LiveHub;
        if (Hub && v[0] && v[0].realtime) Hub.init({ realtime: v[0].realtime, calendar: v[1] });
        return !!(Hub && Hub.enabled && Hub.enabled());
      });
      return hubPromise;
    },
    language: function () {
      if (!langPromise) langPromise = S.loadJSON("/quant/methodology/product-language-v1.json").then(function (d) {
        global.VUProductLanguage.load(d); global.VUQuantViewModel.useLanguage(global.VUProductLanguage); return true;
      }).catch(function () { return false; });
      return langPromise;
    }
  };

  /* ------------------------------------------------------------ Shell
     Gemeinsame Vision-Universe-Shell (assets/site-navigation.js): Kopf mit
     Marke, AI Atlas und Farbschema, unten die Produkt-Leiste
     Quant | Screener | Strategien | Aktien | ☰. Quant baut keine eigene
     Kopf- oder Bereichsleiste mehr; Quant meldet der Leiste nur, welcher
     Bereich aktiv ist (Router als Quelle der Wahrheit). Die Suche bleibt
     Quant-Suche: im Hero, auf "Aktien", mit / und Strg+K. */
  var main;
  function buildShell(rootEl) {
    var root = rootEl || document.getElementById("qx-app");
    var earlyMain = !HOSTED && global.VUQuantBoot && global.VUQuantBoot.takeMain(root);
    main = earlyMain || el("main", { class: "qx-main", id: "qx-main", tabindex: "-1" });
    var foot = HOSTED ? el("footer", { class: "q-foot qx-foot" }, [
      el("b", { text: "VISION UNIVERSE® ELLIOTT" }),
      el("p", {}, [el("span", { class: "q-beta", text: "Experimentell" }), el("span", { text: " Elliott ist ein experimentelles Strukturmodell. Projektion ≠ Wahrscheinlichkeit: Szenarien beschreiben Bedingungen, keine Vorhersage, kein Kursziel, keine Anlageempfehlung." })]),
      el("p", {}, [el("a", { href: "/quant/#/methodik", text: "Methodik" }), el("span", { text: " · " }), el("a", { href: "/elliott/#/", text: "Zur Elliott-Übersicht" })])
    ]) : el("footer", { class: "q-foot qx-foot" }, [
      el("b", { text: "VISION UNIVERSE® QUANT" }),
      /* VU3-Finalisierung: ein Absatz Hinweis statt drei; Quellen und Stichtage stehen je Seite in "Daten & Methodik". */
      el("p", {}, [el("span", { class: "q-beta", text: "Beta" }), el("span", { text: " Keine Anlageempfehlung, keine Prognose, kein Kursziel. Zone und Ungültig-Marke laut Methode beschreiben Szenarien der technischen Analyse." })]),
      el("p", {}, [el("a", { href: "#/methodik", text: "Methodik" }), el("span", { text: " · " }), el("a", { href: "/quant/methodology/", text: "Methodik im Detail" }), el("span", { text: " · " }), el("a", { href: "#/backtest", text: "Backtesting" }), el("span", { text: " · " }), el("a", { href: "/quant/data-inspector/", text: "Dateninspektor" }), el("span", { text: " · " }), el("a", { href: "/discover/", text: "Discover" })])
    ]);
    if (earlyMain) root.appendChild(foot); else root.replaceChildren(main, foot);
    var skip = document.querySelector(".qx-skip");
    if (skip) skip.addEventListener("click", function (e) { e.preventDefault(); main.focus(); main.scrollIntoView(); });
  }
  /* Bereich -> Eintrag der Produkt-Leiste. Methodik und Backtesting sind
     sekundaere Bereiche (Hero, Fuss, Menue) und markieren nur das Produkt. */
  var DOCK = { home: "quant", screener: "screener", strategien: "strategien", aktien: "aktien", methodik: "quant", elliott: null }; /* Q00: Methodik und Backtest gehören zum Start „Quant“ */
  function markNav(section) {
    if (global.VUNavigation) global.VUNavigation.dock({ active: Object.prototype.hasOwnProperty.call(DOCK, section) ? DOCK[section] : null });
  }

  /* ------------------------------------------------------------ Suche */
  var search = (function () {
    var dialog = el("dialog", { class: "qx-dialog", "aria-label": "Aktie suchen" });
    var input = el("input", { type: "search", placeholder: "Aktie, Name oder Kürzel …", "aria-label": "Aktie suchen", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": "qx-search-list" });
    var closeBtn = el("button", { type: "button", class: "q-dialog-close", text: "Schließen", onclick: function () { close(); } });
    var list = el("div", { class: "qx-dialog-results", id: "qx-search-list", role: "listbox" });
    var status = el("p", { class: "qx-dialog-status", role: "status", "aria-live": "polite" });
    dialog.append(el("div", { class: "q-dialog-in" }, [el("p", { class: "q-kicker", text: "Vision Universe Quant" }), el("h2", { text: "Was möchtest du analysieren?" }),
      el("div", { class: "q-searchbar" }, [X.icon("search"), input, closeBtn]), status, list]));
    var req = 0, sel = -1;
    function items() { return Array.prototype.slice.call(list.querySelectorAll(".qx-hit")); }
    function select(i) { var it = items(); sel = Math.max(0, Math.min(it.length - 1, i)); it.forEach(function (a, k) { a.setAttribute("aria-selected", k === sel ? "true" : "false"); }); if (it[sel]) it[sel].scrollIntoView({ block: "nearest" }); }
    async function update() {
      var mine = ++req, q = input.value.trim();
      if (!q) { list.replaceChildren(); status.textContent = "Tippe einen Namen oder ein Kürzel · ↑ ↓ zum Auswählen · Enter öffnet die Analyse"; input.setAttribute("aria-expanded", "false"); return; }
      status.textContent = "Wird gesucht …";
      var r = await api.searchInstruments(q, 12).catch(function () { return { state: "SOURCE_MISSING", entries: [] }; });
      if (mine !== req) return;
      if (r.state !== "AVAILABLE") { list.replaceChildren(); status.textContent = "Die Suche ist derzeit nicht verfügbar."; return; }
      list.replaceChildren.apply(list, r.entries.map(function (e) {
        var name = X.companyName(e) === "Firmenname nicht veröffentlicht" ? e.ticker : e.name;
        return el("a", { class: "qx-hit", role: "option", href: X.routes.stock(e.ticker), "aria-selected": "false", onclick: function () { close(); } }, [
          X.logo(e.ticker, name, "sm"), el("span", {}, [el("b", { text: name }), el("em", { text: e.ticker })]), el("span", { class: "val", text: "Analyse →" })]);
      }));
      sel = -1; input.setAttribute("aria-expanded", r.entries.length ? "true" : "false");
      status.textContent = r.entries.length ? r.entries.length + " Treffer – mit Pfeiltasten wählen, Enter öffnet." : "Keine passenden Aktien gefunden.";
    }
    input.addEventListener("input", update);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); select(sel + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); select(sel - 1); }
      else if (e.key === "Enter") { var it = items(); var t = it[sel >= 0 ? sel : 0]; if (t) { e.preventDefault(); location.hash = t.getAttribute("href"); close(); } }
    });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) close(); });
    var opener = null;
    function open(prefill) {
      if (!dialog.isConnected) document.body.append(dialog);
      if (dialog.open) { input.focus(); return; }
      opener = document.activeElement;
      dialog.showModal ? dialog.showModal() : dialog.setAttribute("open", "");
      input.value = typeof prefill === "string" ? prefill : ""; update(); input.focus();
    }
    /* Der Fokus bleibt im Dialog, solange er offen ist. */
    dialog.addEventListener("keydown", function (e) {
      /* Escape schliesst den Dialog sofort - in einem Suchfeld wuerde der
         Browser sonst zuerst nur die Eingabe leeren. */
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var f = [input, closeBtn].concat(items());
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      var next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i >= f.length - 1 ? 0 : i + 1);
      f[next].focus();
    });
    /* Das close-Ereignis kommt verzoegert. Wurde der Dialog inzwischen
       wieder geoeffnet (Escape, sofort Strg+K), darf es den Fokus nicht
       wegnehmen. */
    dialog.addEventListener("close", function () { if (dialog.open) return; if (opener && opener.focus) opener.focus(); });
    function close() { if (dialog.open) dialog.close ? dialog.close() : dialog.removeAttribute("open"); }
    document.addEventListener("keydown", function (e) {
      if (HOSTED) return;      // im Elliott-Produkt gehoeren "/" und Strg+K der Elliott-Suche
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); open(); }
    });
    return { open: open, close: close, node: dialog };
  })();

  var intentTimer = null, intentWindow = 0, intentCount = 0;
  function intent(event) {
    if (global.navigator.connection && global.navigator.connection.saveData) return;
    var a = event.target.closest && event.target.closest('a[href]'); if (!a) return;
    var url; try { url = new URL(a.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || url.pathname !== '/quant/') return;
    var r = parse(url.hash); if (r.view !== 'aktie' || !/^[A-Z0-9.-]{1,12}$/.test(r.ticker)) return;
    if (Date.now() - intentWindow > 30000) { intentWindow = Date.now(); intentCount = 0; }
    if (intentCount >= 3 || ctx.prefetched && ctx.prefetched.ticker === r.ticker) return;
    clearTimeout(intentTimer);
    function warm() { intentCount++; ctx.prefetchStock(r.ticker); }
    if (event.type === 'pointerover') intentTimer = setTimeout(warm, 100); else warm();
  }
  document.addEventListener('pointerover', intent, { passive: true });
  document.addEventListener('pointerdown', intent, { passive: true });
  document.addEventListener('focusin', intent);
  document.addEventListener('pointerout', function () { clearTimeout(intentTimer); }, { passive: true });

  /* --------------------------------------------------------- Router */
  var dispose = null, generation = 0;
  async function route() {
    var gen = ++generation;
    if (dispose) { try { dispose(); } catch (e) { /* bereits beendet */ } dispose = null; }
    var r = parse(location.hash);
    /* Alte Chartbild-/Technik-Adressen und der Elliott-Hauptlink: eine Adresse, ohne Verlaufseintrag (location.replace loest hashchange aus). */
    if (r.view === "chartbild" || r.view === "technik" || r.view === "elliott") { global.location.replace(canonicalElliott(r)); return; }
    if (r.view === "elliottHome") { global.location.replace("/elliott/"); return; }
    /* Konzept Quant 2026-11 (Entscheidung 3): alte Adressen leiten mit ihren Parametern weiter, ohne Verlaufseintrag. */
    if (r.view === "renamed") { global.location.replace(renamed(location.hash)); return; }
    search.close();
    markNav(SECTION[r.view] || null);
    document.title = (TITLE[r.view] || "Quant") + " · Vision Universe®";
    ctx.routeStock = null;
    var preserveHead = (r.view === "aktie" || r.view === "home") && global.VUQuantBoot && global.VUQuantBoot.get(r.view === "home" ? "home" : r.ticker, main);
    var bootLoading = preserveHead ? null : X.loading();
    if (bootLoading) main.replaceChildren(bootLoading);
    main.setAttribute("aria-busy", preserveHead ? "false" : "true");
    main.dataset.ready = "false";
    main.dataset.view = r.view;
    /* Die Aktienseite traegt dieselbe Klasse wie in Discover (dx-detail). */
    main.className = "qx-main";
    global.scrollTo(0, 0);
    try {
      /* Die Voraussetzungen der Ansicht starten ZUSAMMEN (vorher nacheinander: Sprache, dann Namen, dann Skript - je ein
         Umlauf mit 150 ms und ihrer eigenen Wartezeit). Dieselben Dateien, dieselben Versprechen, nur ohne Warteschlange.
         Das Woerterbuch gilt weiter vor jeder Seite. */
      if (r.view === "home") { ctx.loadNames(); ctx.loadBacktestView(); }
      else {
        if (/^(radar|screener|strategien|aktien)$/.test(r.view)) ctx.loadNames(r.view === "screener");
        if (r.view === "radar" || r.view === "aktie") ctx.loadBacktestView();
        if (r.view === "aktie" && /^[A-Z0-9.-]{1,12}$/.test(r.ticker)) ctx.startStock(r.ticker);
      }
      /* Das Paket der Ansicht startet mit den uebrigen Voraussetzungen; ein Fehler zeigt sich dort, wo die Ansicht es braucht. */
      var viewPack = r.view === "aktie" ? pack("stock") : r.view === "methodik" ? pack("method") : r.view === "zahlen" || r.view === "vergleich" ? pack("tools") : null;
      if (viewPack) viewPack.catch(function () { /* gemeldet ueber await in der Ansicht */ });
      await ctx.language();
      if (gen !== generation) return;
      if (/^(screener|strategien|aktien)$/.test(r.view)) await ctx.loadNames();
      if (bootLoading) bootLoading.remove();
      switch (r.view) {
        case "home": await global.QXPages.home(main, ctx); break;
        case "radar": await Promise.all([ctx.loadNames(), ctx.loadBacktestView()]); await global.QXPages.radar(main, ctx, r.params); break;
        case "backtest": await ctx.loadBacktest(); await global.QXBacktest.render(main, ctx, r.id, false, r.fall); break;
        case "screener": await ctx.loadNames(); await global.QXPages.screener(main, ctx, r.params, r.pro); break;
        case "strategien": await ctx.loadNames(); await global.QXPages.strategies(main, ctx, r.id); break;
        case "aktien": await global.QXPages.stocks(main, ctx); break;
        case "aktie": await Promise.all([ctx.loadBacktestView(), viewPack]); dispose = await global.QXStock.render(main, r.ticker, ctx); break;
        /* Mission IV §55: die V1-Technikseite ist abgeloest — die Route bleibt (Links, Lesezeichen), zeigt aber das Chartbild;
           der alte Elliott-Link oeffnet die Profi-Ansicht. Keine zweite, widerspruechliche Szenario-Darstellung mehr. */
        /* Redesign 2027 (Q09): Perspektive „Chart“ bleibt in Quant (eigene Adresse; #/aktie/<T>/chartbild fuehrt weiter zu Elliott). */
        case "chart": await Promise.all([ctx.loadNames(), pack("stock")]); await (await loadChartbild()).chartV3(main, ctx, r.ticker, r.params, global.VUChart); break; /* der Kurschart (C06) liegt im Paket der Aktienseite */
        case "chartlagen": await (await loadChartbild()).overview(main, ctx, r.params); hideEmptyLagen(main, r.params); break;
        case "zahlen": await viewPack; await global.QXTools.fundamentals(main, ctx, r.ticker, r.params); break;
        case "vergleich": await viewPack; await global.QXTools.compare(main, ctx, r.list); break;
        case "methodik": await viewPack; await global.QXMethod.render(main, ctx, r.topic, r.params); break;
        default:
          main.append(el("section", { class: "v2-message" }, [el("h1", { class: "qx-h1", text: "Diese Seite gibt es nicht" }), X.notice("Unbekannte Adresse", "Diese Adresse gehört zu keinem Bereich von Quant. Öffne einen der fünf Bereiche über die Navigation."),
            X.actions([X.btn("Zur Startseite", "#/")])]));
      }
    } catch (err) {
      if (gen !== generation) return;
      main.replaceChildren(el("section", { class: "v2-message" }, [el("h1", { class: "qx-h1", text: "Gerade nicht erreichbar" }), el("p", { class: "v2-lead", text: "Die Seite konnte nicht aufgebaut werden: Die Daten konnten nicht geladen werden. Bitte versuche es noch einmal." }),
        el("button", { type: "button", class: "v2-button qx-btn", text: "Erneut versuchen", onclick: route })]));
      if (global.console) console.error("Quant route", err);
    } finally {
      if (gen === generation) { main.setAttribute("aria-busy", "false"); main.dataset.ready = "true"; }
    }
  }

  /* Anker innerhalb einer Seite (#faktor-quality, #setup) sind keine
     Routen: sie scrollen, oeffnen einen Aufklapper und lassen die Adresse
     stehen. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href^='#']");
    if (!a || e.defaultPrevented) return;
    var href = a.getAttribute("href");
    if (href.indexOf("#/") === 0) return;
    var target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    if (target.tagName === "DETAILS" && !target.open) { target.open = true; target.dispatchEvent(new Event("toggle")); }
    /* Ziele hinter einem zugeklappten Abschnitt (z. B. Einzelheiten des Rueckblicks) oeffnen ihn mit. */
    for (var up = target.parentElement; up; up = up.parentElement) if (up.tagName === "DETAILS" && !up.open) up.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function boot() {
    buildShell();
    var legacy = legacyRoute(location.search);
    /* Absolute Ziele (Elliott: /elliott/#/<T>) verlassen /quant/ - sonst entstuende /quant//elliott/… */
    if (legacy && legacy.charAt(0) === "/") { global.location.replace(legacy); return; }
    if (legacy) history.replaceState(null, "", location.pathname + legacy);
    else if (!location.hash) history.replaceState(null, "", location.pathname + "#/");
    global.addEventListener("hashchange", function () { return global.VUUI && global.VUUI.transition ? global.VUUI.transition(route) : route(); });
    route();
  }
  /* ------------------------------------------------- Gast im Elliott-Produkt
     /elliott/ ruft mountElliott(root, ticker, params) fuer #/<TICKER> auf. Jeder Aufruf baut ein eigenes <main>: ein spaeter
     Abschluss einer verworfenen Darstellung haengt dann an einem entfernten Knoten und nie an der neuen Seite.
     Quant-Links im Chartbild ("#/aktie/T", "#/methodik" ...) zeigen im Gast-Betrieb auf /quant/ (MutationObserver, auch fuer
     Mittelklick und neuen Tab); Elliott-Links sind schon absolut (X.routes.elliott). */
  var hostedGen = 0, hostedObserver = null;
  function toQuantHref(a) {
    var h = a.getAttribute && a.getAttribute("href");
    if (h && h.indexOf("#/") === 0) a.setAttribute("href", "/quant/" + h);
  }
  function rewriteQuantLinks(node) {
    if (node.nodeType !== 1) return;
    if (node.tagName === "A") toQuantHref(node);
    var list = node.querySelectorAll ? node.querySelectorAll('a[href^="#/"]') : [];
    for (var i = 0; i < list.length; i++) toQuantHref(list[i]);
  }
  async function mountElliott(rootEl, ticker, params) {
    var gen = ++hostedGen;
    if (hostedObserver) hostedObserver.disconnect();
    var shellMain = (buildShell(rootEl), main);
    main = shellMain;
    shellMain.dataset.view = "elliott"; shellMain.dataset.ready = "false"; shellMain.setAttribute("aria-busy", "true");
    hostedObserver = new MutationObserver(function (list) { list.forEach(function (m) { m.addedNodes.forEach(rewriteQuantLinks); }); });
    hostedObserver.observe(shellMain, { childList: true, subtree: true });
    shellMain.append(X.loading("Elliott-Analyse wird geladen …"));
    try {
      await Promise.all([ctx.language(), ctx.loadNames()]);
      if (gen !== hostedGen) return null;
      var page = await loadChartbild();
      if (gen !== hostedGen) return null;
      shellMain.replaceChildren();
      await page.chartbild(shellMain, ctx, ticker, params, { product: "elliott", host: "elliott" });
    } catch (err) {
      if (gen !== hostedGen) return null;
      shellMain.replaceChildren(el("section", { class: "v2-message" }, [el("h1", { class: "qx-h1", text: "Gerade nicht erreichbar" }), el("p", { class: "v2-lead", text: "Die Elliott-Analyse konnte nicht geladen werden. Bitte versuche es erneut." }),
        el("a", { class: "v2-button qx-btn", href: "/elliott/#/" + encodeURIComponent(ticker), text: "Erneut versuchen", onclick: function (e) { e.preventDefault(); mountElliott(rootEl, ticker, params); } })]));
      if (global.console) console.error("Elliott mount", err);
    } finally {
      if (gen === hostedGen) { shellMain.setAttribute("aria-busy", "false"); shellMain.dataset.ready = "true"; }
    }
    return shellMain;
  }
  function unmountElliott() {
    hostedGen++;
    if (hostedObserver) { hostedObserver.disconnect(); hostedObserver = null; }
  }

  global.QXApp = { parse: parse, renamed: renamed, canonicalElliott: canonicalElliott, legacyRoute: legacyRoute, ctx: ctx, route: route, mountElliott: mountElliott, unmountElliott: unmountElliott, hosted: HOSTED };
  if (HOSTED) { /* kein eigener Router */ }
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(window);
