/* =========================================================================
   VISION UNIVERSE QUANT — app/app.js                   Shell und Routing

   /quant/ ist die kanonische Adresse. Innerhalb von Quant wird ueber den
   Hash navigiert:

     #/                      Home
     #/screener              Quant Screener (einfach)   ?frage=<id>
     #/screener/profi        Quant Screener (Profi)     ?query=<regeln>
     #/strategien            Strategien
     #/strategien/<id>       eine Strategie
     #/aktien                Aktien (Suche, zuletzt, gemerkt)
     #/aktie/<TICKER>        Aktienanalyse
     #/aktie/<T>/technik     Kursstruktur, Technik & Elliott
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

  /* ---------------------------------------------- Alte Routen -> neue */
  function legacyRoute(search) {
    var p = new URLSearchParams(search || "");
    var view = p.get("view");
    if (!view) return null;
    var t = String(p.get("ticker") || "").toUpperCase();
    var okT = /^[A-Z0-9.-]{1,12}$/.test(t);
    var map = {
      home: "#/", stock: okT ? "#/aktie/" + t : "#/aktien", quant: okT ? "#/aktie/" + t : "#/aktien",
      aktien: "#/aktien", stocks: "#/aktien", screener: "#/screener", strategies: "#/strategien", strategien: "#/strategien",
      explain: "#/methodik", methodik: "#/methodik", methodology: "#/methodik",
      technical: okT ? "#/aktie/" + t + "/technik" : "#/aktien", elliott: okT ? "#/aktie/" + t + "/technik?elliott=1" : "#/aktien",
      fundamentals: okT ? "#/aktie/" + t + "/zahlen" : "#/aktien",
      compare: "#/vergleich" + (p.get("tickers") ? "/" + p.get("tickers") : okT ? "/" + t : ""),
      watchlist: "#/aktien", signals: "#/", radar: "#/", discover: "#/screener", markets: "#/", research: "#/methodik", portfolio: "#/", atlas: "#/methodik"
    };
    var target = map[view] || "#/";
    if (view === "screener") {
      if (p.get("query")) target = "#/screener/profi?query=" + encodeURIComponent(p.get("query"));
      else if (p.get("faktoren")) target = "#/screener?frage=" + ({ momentum: "momentum", value: "guenstig", risk: "ruhig", growth: "wachstum-qualitaet" }[p.get("faktoren").split(",")[0]] || "qualitaet");
    }
    return target;
  }

  function parse(hash) {
    var h = String(hash || "").replace(/^#/, "");
    if (!h || h === "/") return { view: "home", params: new URLSearchParams() };
    var q = h.indexOf("?"), path = q >= 0 ? h.slice(0, q) : h, params = new URLSearchParams(q >= 0 ? h.slice(q + 1) : "");
    var parts = path.split("/").filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var r = { params: params, parts: parts };
    switch (parts[0]) {
      case "screener": r.view = "screener"; r.pro = parts[1] === "profi"; break;
      case "strategien": r.view = "strategien"; r.id = parts[1] || null; break;
      case "aktien": r.view = "aktien"; break;
      case "aktie":
        r.ticker = String(parts[1] || "").toUpperCase();
        r.view = !/^[A-Z0-9.-]{1,12}$/.test(r.ticker) ? "notfound" : parts[2] === "technik" ? "technik" : parts[2] === "zahlen" ? "zahlen" : "aktie";
        break;
      case "vergleich": r.view = "vergleich"; r.list = (parts[1] || "").split(",").map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean); break;
      case "methodik": r.view = "methodik"; r.topic = parts[1] || null; break;
      default: r.view = "notfound";
    }
    return r;
  }
  var SECTION = { home: "home", screener: "screener", strategien: "strategien", aktien: "aktien", aktie: "aktien", technik: "aktien", zahlen: "aktien", vergleich: "aktien", methodik: "methodik" };
  var TITLE = { home: "Quant – Aktien verstehen", screener: "Quant Screener", strategien: "Strategien", aktien: "Aktien", aktie: "Aktienanalyse", technik: "Kursstruktur", zahlen: "Unternehmenszahlen", vergleich: "Vergleich", methodik: "Methodik", notfound: "Nicht gefunden" };

  /* -------------------------------------------------------- Kontext */
  var api = global.VUProductServices.create({ loadJSON: S.loadJSON, displayPolicy: global.VUDisplayPolicy, queryEngine: global.VUQuery });
  var namesPromise = null, distPromise = null, wordsPromise = null, langPromise = null, hubPromise = null;
  var ctx = {
    api: api, names: {}, types: {}, entries: {},
    /* Stammaktien zuerst - Vorzugsaktien und Anleihen bleiben gezaehlt, stehen aber hinten. */
    commonFirst: function (list) { return (list || []).slice().sort(function (a, b) { return (ctx.types[a] === "COMMON_STOCK" ? 0 : 1) - (ctx.types[b] === "COMMON_STOCK" ? 0 : 1); }); },
    openSearch: function () { search.open(); },
    loadNames: function () {
      if (!namesPromise) namesPromise = S.loadCompressedJSON("/quant/data/product/universe-list-v1.json.gz").then(function (d) {
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
      if (!hubPromise) hubPromise = Promise.all([S.loadJSON("/discover/data/meta.json").catch(function () { return null; }), S.loadJSON("/quant/config/market-calendar.json").catch(function () { return null; })]).then(function (v) {
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

  /* ------------------------------------------------------------ Shell */
  var main, navLinks = [], tabLinks = [];
  function buildShell() {
    var root = document.getElementById("qx-app");
    var bar = el("header", { class: "qx-bar" }, [el("div", { class: "qx-bar-in" }, [
      el("a", { class: "qx-brand", href: "#/", "aria-label": "Quant – Startseite" }, [el("b", {}, [document.createTextNode("Quant"), el("i", { text: "." })]), el("span", { class: "qx-beta", text: "Beta" }), el("span", { text: "Aktien verstehen. Mit Gründen." })]),
      el("nav", { class: "qx-nav", "aria-label": "Quant" }, X.NAV.map(function (n) { var a = el("a", { href: n.href, dataset: { nav: n.id } }, [X.icon(n.id), el("span", { text: n.label })]); navLinks.push(a); return a; })),
      el("button", { type: "button", class: "qx-search-btn", "aria-label": "Aktie suchen", onclick: function () { search.open(); } }, [X.icon("search"), el("span", { text: "Suchen" }), el("kbd", { text: "/" })])
    ])]);
    main = el("main", { class: "qx-main", id: "qx-main", tabindex: "-1" });
    var tabs = el("nav", { class: "qx-tabbar", "aria-label": "Quant" }, X.NAV.map(function (n) { var a = el("a", { href: n.href, dataset: { nav: n.id } }, [X.icon(n.id), el("span", { text: n.label })]); tabLinks.push(a); return a; }));
    var foot = el("footer", { class: "qx-foot" }, [
      el("p", {}, [el("b", { text: "Vision Universe® Quant" }), document.createTextNode(" · Beta: Gesamtnote und historische Strategietests sind noch nicht freigegeben. Keine Anlageempfehlung, keine Prognose, kein Kursziel.")]),
      el("p", {}, [document.createTextNode("Daten: SEC EDGAR (Geschäftszahlen), Tiingo (Kurse) – jeweils mit Stichtag. "), el("a", { href: "#/methodik", text: "Methodik" }), document.createTextNode(" · "), el("a", { href: "/quant/methodology/", text: "Methodik im Detail" }), document.createTextNode(" · "), el("a", { href: "/quant/data-inspector/", text: "SEC-Dateninspektor" })])
    ]);
    root.replaceChildren(bar, main, foot, tabs);
    document.querySelector(".qx-skip").addEventListener("click", function (e) { e.preventDefault(); main.focus(); main.scrollIntoView(); });
  }
  function markNav(section) {
    navLinks.concat(tabLinks).forEach(function (a) { if (a.dataset.nav === section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  }

  /* ------------------------------------------------------------ Suche */
  var search = (function () {
    var dialog = el("dialog", { class: "qx-dialog", "aria-label": "Aktie suchen" });
    var input = el("input", { type: "search", placeholder: "Name oder Kürzel", "aria-label": "Aktie suchen", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": "qx-search-list" });
    var list = el("div", { class: "qx-dialog-results", id: "qx-search-list", role: "listbox" });
    var status = el("p", { class: "qx-dialog-status", role: "status", "aria-live": "polite" });
    dialog.append(el("div", { class: "qx-dialog-in" }, [input, list, status]));
    var req = 0, sel = -1;
    function items() { return Array.prototype.slice.call(list.querySelectorAll(".qx-hit")); }
    function select(i) { var it = items(); sel = Math.max(0, Math.min(it.length - 1, i)); it.forEach(function (a, k) { a.setAttribute("aria-selected", k === sel ? "true" : "false"); }); if (it[sel]) it[sel].scrollIntoView({ block: "nearest" }); }
    async function update() {
      var mine = ++req, q = input.value.trim();
      if (!q) { list.replaceChildren(); status.textContent = "Tippe einen Namen oder ein Kürzel."; input.setAttribute("aria-expanded", "false"); return; }
      status.textContent = "Wird gesucht …";
      var r = await api.searchInstruments(q, 12).catch(function () { return { state: "SOURCE_MISSING", entries: [] }; });
      if (mine !== req) return;
      if (r.state !== "AVAILABLE") { list.replaceChildren(); status.textContent = "Die Suche ist derzeit nicht verfügbar."; return; }
      list.replaceChildren.apply(list, r.entries.map(function (e) {
        return el("a", { class: "qx-hit", role: "option", href: X.routes.stock(e.ticker), "aria-selected": "false", onclick: function () { close(); } }, [el("strong", { text: e.ticker }), el("span", { text: X.companyName(e) })]);
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
    function open() {
      if (!dialog.isConnected) document.body.append(dialog);
      if (dialog.open) { input.focus(); return; }
      opener = document.activeElement;
      dialog.showModal ? dialog.showModal() : dialog.setAttribute("open", "");
      input.value = ""; update(); input.focus();
    }
    /* Der Fokus bleibt im Dialog, solange er offen ist. */
    dialog.addEventListener("keydown", function (e) {
      /* Escape schliesst den Dialog sofort - in einem Suchfeld wuerde der
         Browser sonst zuerst nur die Eingabe leeren. */
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var f = [input].concat(items());
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      var next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i >= f.length - 1 ? 0 : i + 1);
      f[next].focus();
    });
    dialog.addEventListener("close", function () { if (opener && opener.focus) opener.focus(); });
    function close() { if (dialog.open) dialog.close ? dialog.close() : dialog.removeAttribute("open"); }
    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); open(); }
    });
    return { open: open, close: close, node: dialog };
  })();

  /* --------------------------------------------------------- Router */
  var dispose = null, generation = 0;
  async function route() {
    var gen = ++generation;
    if (dispose) { try { dispose(); } catch (e) { /* bereits beendet */ } dispose = null; }
    var r = parse(location.hash);
    search.close();
    markNav(SECTION[r.view] || null);
    document.title = (TITLE[r.view] || "Quant") + " · Vision Universe®";
    main.replaceChildren();
    main.setAttribute("aria-busy", "true");
    main.dataset.ready = "false";
    main.dataset.view = r.view;
    global.scrollTo(0, 0);
    try {
      await ctx.language();
      if (gen !== generation) return;
      if (/^(home|screener|strategien|aktien)$/.test(r.view)) await ctx.loadNames();
      switch (r.view) {
        case "home": await global.QXPages.home(main, ctx); break;
        case "screener": await ctx.loadNames(); await global.QXPages.screener(main, ctx, r.params, r.pro); break;
        case "strategien": await ctx.loadNames(); await global.QXPages.strategies(main, ctx, r.id); break;
        case "aktien": await global.QXPages.stocks(main, ctx); break;
        case "aktie": dispose = await global.QXStock.render(main, r.ticker, ctx); break;
        case "technik": await global.QXTools.technical(main, ctx, r.ticker, r.params.get("elliott") === "1"); break;
        case "zahlen": await global.QXTools.fundamentals(main, ctx, r.ticker, r.params); break;
        case "vergleich": await global.QXTools.compare(main, ctx, r.list); break;
        case "methodik": await global.QXMethod.render(main, ctx, r.topic, r.params); break;
        default:
          main.append(el("h1", { class: "qx-h1", text: "Diese Seite gibt es nicht" }), X.notice("Unbekannte Adresse", "Öffne einen der fünf Bereiche von Quant über die Navigation."),
            el("div", { class: "qx-actions" }, [X.btn("Zur Startseite", "#/")]));
      }
    } catch (err) {
      if (gen !== generation) return;
      main.replaceChildren(el("h1", { class: "qx-h1", text: "Gerade nicht erreichbar" }), X.notice("Die Seite konnte nicht aufgebaut werden", "Die Daten konnten nicht geladen werden. Bitte versuche es noch einmal."), el("div", { class: "qx-actions" }, [el("button", { type: "button", class: "qx-btn", text: "Erneut versuchen", onclick: route })]));
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
    if (!a) return;
    var href = a.getAttribute("href");
    if (href.indexOf("#/") === 0) return;
    var target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    if (target.tagName === "DETAILS" && !target.open) { target.open = true; target.dispatchEvent(new Event("toggle")); }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function boot() {
    buildShell();
    var legacy = legacyRoute(location.search);
    if (legacy) history.replaceState(null, "", location.pathname + legacy);
    else if (!location.hash) history.replaceState(null, "", location.pathname + "#/");
    global.addEventListener("hashchange", route);
    route();
  }
  global.QXApp = { parse: parse, legacyRoute: legacyRoute, ctx: ctx, route: route };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(window);
