/* =========================================================================
   VISION UNIVERSE QUANT — app/ui.js                  Oberflaechen-Bausteine

   Quant spricht dieselbe Gestaltungssprache wie Discover - nicht nach-
   gebaut, sondern mit DENSELBEN Klassen und Stylesheets (discover.css,
   app.css, home.css, detail.css), die Discover in Produktion benutzt:

     v2-bar / v2-main / v2-footer / v2-dock      Rahmen der Seite
     dx-chapter / dx-kicker / dx-chapter-lead    Kapitel wie auf der Aktienseite
     v2-world / v2-world-head / v2-world-more    Reihen wie auf der Startseite
     dx-poster / dx-rail / dx-grid               Aktienkarten und Schienen
     dx-weitere / dx-zahlen-grade / v2-pill      Aufklapper, Stufen, Knoepfe

   Die qx-/qc-Klassen daneben tragen KEINE Gestaltung. Sie sind Anker fuer
   Tests und QA, damit diese pruefen, was da ist - nicht, wie es aussieht.

   Keine Berechnung, keine Daten: was hier steht, zeichnet nur, was das
   View Model sagt.
   ========================================================================= */
(function (global) {
  "use strict";
  var S = global.QuantShell, el = S.el;

  /* DIE FUENF BEREICHE VON QUANT - Owner-Entscheid 29.09.2026.
     "Quant Screener", nicht "Screener": so heisst das eigenstaendige
     Produkt unter /screener/, das NICHT zu Quant gehoert. */
  var NAV = [
    { id: "home", label: "Home", href: "#/" },
    { id: "screener", label: "Quant Screener", href: "#/screener" },
    { id: "strategien", label: "Strategien", href: "#/strategien" },
    { id: "aktien", label: "Aktien", href: "#/aktien" },
    { id: "methodik", label: "Methodik", href: "#/methodik" }
  ];
  /* Linien-Icons in der Strichstaerke der Discover-Leiste (1,7 px auf 19 px). */
  var ICON = {
    home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
    screener: "M4 5h16M7 12h10M10 19h4",
    strategien: "M4 20V11M10 20V5M16 20v-7M22 20H2",
    aktien: "M3 17l5-5 4 4 8-9M15 7h5v5",
    methodik: "M12 3 4 6.2v5.3c0 4.4 3.2 8.2 8 9.5 4.8-1.3 8-5.1 8-9.5V6.2L12 3Zm-3 8.6 2.2 2.2L15.4 10",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2",
    setups: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"
  };
  function icon(id) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICON[id] || ICON.aktien); svg.append(p); return svg;
  }

  var routes = {
    home: function () { return "#/"; },
    stock: function (t) { return "#/aktie/" + encodeURIComponent(String(t || "").toUpperCase()); },
    screener: function (q) { return "#/screener" + (q ? "?" + q : ""); },
    screenerPro: function (q) { return "#/screener/profi" + (q ? "?" + q : ""); },
    strategies: function () { return "#/strategien"; },
    strategy: function (id) { return "#/strategien/" + encodeURIComponent(id); },
    stocks: function () { return "#/aktien"; },
    method: function (topic) { return "#/methodik" + (topic ? "/" + topic : ""); },
    technical: function (t) { return "#/aktie/" + encodeURIComponent(t) + "/technik"; },
    fundamentals: function (t) { return "#/aktie/" + encodeURIComponent(t) + "/zahlen"; },
    compare: function (list) { return "#/vergleich" + (list && list.length ? "/" + list.map(encodeURIComponent).join(",") : ""); }
  };

  /* Die Tonwerte des View Models in Discovers Farbklassen. */
  var TONE = { good: "up", bad: "down", neutral: "warm", unknown: "" };
  function toneClass(tone) { return TONE[tone] || ""; }

  function link(text, href, cls) { return el("a", { href: href, class: cls || null, text: text }); }
  /* Knoepfe sind Discovers Pillen: dunkel fuer den naechsten Schritt,
     hell fuer alles Weitere. */
  function btn(text, href, kind) {
    return el("a", { href: href, class: "v2-pill " + (kind === "secondary" || kind === "ghost" ? "v2-pill-ghost" : "v2-pill-dark") + " qx-btn" + (kind ? " " + kind : ""), text: text });
  }
  function actions(kids) { return el("div", { class: "qx-actions" }, kids); }

  /* Ein Kapitel wie auf Discovers Aktienseite: Kicker, grosse Zeile, Lead. */
  function section(title, intro, kids, more, eyebrow, id, cls) {
    return el("section", { class: "dx-chapter qx-section" + (cls ? " " + cls : ""), id: id || null }, [
      eyebrow ? el("p", { class: "dx-kicker", text: eyebrow }) : null,
      el("h2", { text: title }),
      intro ? el("p", { class: "dx-chapter-lead", text: intro }) : null
    ].concat(kids || [], more ? [el("p", { class: "dx-kapitel-fuss dx-kapitel-fuss--link" }, [link(more.label, more.href)])] : []));
  }
  /* Eine Reihe wie auf Discovers Startseite: Titel, Unterzeile, "Alle ansehen". */
  function world(title, subtitle, kids, more, cls) {
    return el("section", { class: "v2-world qx-section" + (cls ? " " + cls : "") }, [
      el("div", { class: "v2-world-head" }, [
        el("div", {}, [el("h2", { text: title }), subtitle ? el("p", { class: "v2-world-subtitle", text: subtitle }) : null]),
        more ? el("a", { class: "v2-world-more", href: more.href, text: more.label }) : null
      ])
    ].concat(kids || []));
  }
  function card(kids, cls) { return el("div", { class: "qx-card" + (cls ? " " + cls : "") }, kids); }
  function notice(title, text) {
    return el("div", { class: "dx-note qx-notice", role: "note" }, [el("b", { text: title }), el("p", { text: text })]);
  }
  function pill(text, tone) { return el("span", { class: "dx-zahlen-grade qx-pill " + toneClass(tone), dataset: { tone: tone || "unknown" }, text: text }); }
  /* Ein Aufklapper in Discovers Form ("WEITERE PUNKTE (6) +"), dessen
     Inhalt erst beim Oeffnen entsteht - die Tiefe kostet nichts, solange
     niemand hineinsieht. */
  function more(title, build, opts) {
    opts = opts || {};
    var body = el("div", { class: "qx-more-body" });
    var d = el("details", { class: "dx-weitere qx-more", id: opts.id || null }, [
      el("summary", {}, [el("span", { text: title }), opts.hint ? el("small", { text: " · " + opts.hint }) : null]), body]);
    var built = false;
    function fill() { if (built) return; built = true; var kids = build(); (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (k) body.append(k); }); }
    d.addEventListener("toggle", function () { if (d.open) fill(); });
    if (opts.open) { d.open = true; fill(); }
    return d;
  }
  function loading(text) { return el("div", { class: "qx-loading", role: "status" }, [el("span", { class: "dx-art-skeleton", text: text || "Wird geladen …" })]); }
  function dateDe(iso) {
    if (!iso) return "–";
    var p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(iso);
  }
  function money(v, unit) {
    if (typeof v !== "number" || !isFinite(v)) return "–";
    var X = global.VUFx && global.VUFx.Format, R = global.VUFx && global.VUFx.Registry;
    if (X && typeof X.formatPrice === "function" && (!R || !R.isKnown || R.isKnown(unit || "USD"))) {
      var f = X.formatPrice(v, unit || "USD", { numberLocale: "de-DE", decimals: 2 });
      if (f) return f;
    }
    return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (unit === "USD" || !unit ? " $" : " " + unit);
  }
  function signed(v, digits) {
    if (typeof v !== "number" || !isFinite(v)) return "–";
    return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: digits === undefined ? 1 : digits, maximumFractionDigits: digits === undefined ? 1 : digits }) + " %";
  }
  function companyName(s) {
    if (!s) return "Firmenname nicht veröffentlicht";
    return s.name && s.name !== s.ticker ? s.name : "Firmenname nicht veröffentlicht";
  }
  /* Das Firmenlogo aus Discovers Logo-Verzeichnis - wo keins vorliegt, der
     Anfangsbuchstabe. Erfunden wird keins. */
  function logo(ticker, name, size, opts) {
    var L = global.VUDiscover && global.VUDiscover.Logos;
    if (!L) return el("span", { class: "dx-logo dx-logo--" + (size || "md"), "aria-hidden": "true", text: String(name || ticker || "·").charAt(0).toUpperCase() });
    opts = opts || {};
    return L.mark(ticker, { name: name, size: size || "md", onlyLogo: !!opts.onlyLogo, wide: !!opts.wide });
  }

  /* Eine Aktienzeile: Logo, Name, Kuerzel, Grund, Einordnung - in der Form
     der Discover-Suchtreffer. Kein Wert ohne Bedeutung. */
  function stockRow(o) {
    return el("a", { class: "qx-row", href: routes.stock(o.ticker), dataset: { symbol: o.ticker } }, [
      logo(o.ticker, o.name, "sm"),
      el("div", { class: "qx-row-main" }, [
        el("div", { class: "qx-row-title" }, [el("strong", { class: "qx-row-name", text: o.name || o.ticker }), el("span", { class: "qx-ticker", text: o.ticker })]),
        o.why ? el("div", { class: "qx-row-why", text: o.why }) : null
      ]),
      el("div", { class: "qx-row-side" }, [
        o.pill ? pill(o.pill.text, o.pill.tone) : null,
        o.side ? el("b", { class: "num", text: o.side }) : null,
        o.sideNote ? el("small", { text: o.sideNote }) : null
      ])
    ]);
  }
  /* Eine Aktienkarte in Discovers Posterform: Logo und Name oben, eine
     grosse Aussage, ein Satz, der Weg zur Analyse. */
  function poster(o) {
    return el("a", { class: "dx-poster dx-poster--compact qx-poster", href: routes.stock(o.ticker), dataset: { symbol: o.ticker },
      "aria-label": (o.name || o.ticker) + (o.story ? " — " + o.story : "") + " – Analyse öffnen" }, [
      el("div", { class: "dx-poster-top" }, [logo(o.ticker, o.name, "md"),
        el("div", { class: "dx-poster-id" }, [el("b", { class: "dx-poster-name", text: o.name || o.ticker }),
          el("span", { class: "dx-poster-sub" }, [el("span", { class: "dx-poster-sym", text: o.ticker })])])]),
      o.big ? el("div", { class: "dx-zahl" }, [el("b", { class: "num " + toneClass(o.tone), text: o.big }), o.bigLabel ? el("span", { text: o.bigLabel }) : null]) : null,
      o.story ? el("p", { class: "dx-story" }, [el("i", { class: "dx-story-dot", "aria-hidden": "true" }), document.createTextNode(o.story)]) : null,
      el("div", { class: "dx-poster-foot" }, [o.foot ? el("span", { class: "dx-zusatz", text: o.foot }) : el("span"), el("span", { class: "dx-poster-cta", text: "Analyse →" })])
    ]);
  }
  /* Eine waagerechte Schiene wie in Discover, mit Vor- und Zurueck-Knopf. */
  function rail(items, label) {
    var track = el("div", { class: "dx-rail", role: "list", "aria-label": label || null, tabindex: "0" });
    items.forEach(function (it) { var li = el("div", { role: "listitem" }); li.append(it); track.append(li); });
    function chevron(left) {
      var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
      var p = document.createElementNS("http://www.w3.org/2000/svg", "polyline"); p.setAttribute("points", left ? "15 18 9 12 15 6" : "9 18 15 12 9 6");
      p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2"); s.append(p);
      return el("i", {}, [s]);
    }
    var prev = el("button", { class: "dx-rail-nav dx-rail-nav--prev", type: "button", "aria-label": "Zurück", hidden: true }, [chevron(true)]);
    var next = el("button", { class: "dx-rail-nav dx-rail-nav--next", type: "button", "aria-label": "Weiter" }, [chevron(false)]);
    function step(dir) { track.scrollBy({ left: dir * Math.max(280, track.clientWidth * 0.8), behavior: "smooth" }); }
    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    function check() { prev.hidden = track.scrollLeft < 12; next.hidden = track.scrollLeft + track.clientWidth >= track.scrollWidth - 12; }
    track.addEventListener("scroll", check, { passive: true });
    global.setTimeout(check, 60);
    return el("div", { class: "dx-rail-wrap qx-rail" }, [prev, track, next]);
  }
  /* Kuerzel als Discover-Chips ("S&P 500", "NASDAQ-100"). */
  function tickerChips(list, max) {
    var shown = (list || []).slice(0, max || 12);
    return el("p", { class: "dx-index-badges qx-tickers" }, shown.map(function (t) { return el("a", { class: "dx-index-badge", href: routes.stock(t), text: t }); }));
  }
  /* Eine Kennzahl-Kachel in Discovers Raster (dv2-valuation-card). */
  function stat(label, value, sub, tone) {
    return el("div", { class: "dv2-valuation-card qx-stat" }, [el("span", { text: label }), el("b", { class: "num " + toneClass(tone), text: value }), sub ? el("small", { text: sub }) : null]);
  }
  function stats(list) { return el("div", { class: "dv2-valuation-grid qx-stats" }, list); }

  /* ----------------------------------------------------------- Merkliste
     Der Schluessel ist Quants eigener (vu.quant.watchlist.v1) - geteilt mit
     den klassischen Quant-Seiten, nicht mit dem eigenstaendigen Screener. */
  var WATCH_KEY = "vu.quant.watchlist.v1", RECENT_KEY = "vu.quant.recent.v1";
  function readList(key) {
    try { var v = JSON.parse(global.localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string" && /^[A-Z0-9.-]{1,12}$/.test(x); }) : []; }
    catch (e) { return []; }
  }
  function writeList(key, list) { try { global.localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* privat oder voll */ } }
  var watch = {
    list: function () { return readList(WATCH_KEY); },
    has: function (t) { return readList(WATCH_KEY).indexOf(t) >= 0; },
    toggle: function (t) { var l = readList(WATCH_KEY), i = l.indexOf(t); if (i >= 0) l.splice(i, 1); else l.unshift(t); writeList(WATCH_KEY, l.slice(0, 50)); return i < 0; }
  };
  var recent = {
    list: function () { return readList(RECENT_KEY); },
    add: function (t) { var l = readList(RECENT_KEY).filter(function (x) { return x !== t; }); l.unshift(t); writeList(RECENT_KEY, l.slice(0, 12)); }
  };

  global.QX = {
    NAV: NAV, icon: icon, routes: routes, link: link, btn: btn, actions: actions, section: section, world: world, card: card, notice: notice,
    pill: pill, more: more, loading: loading, dateDe: dateDe, money: money, signed: signed, companyName: companyName, logo: logo,
    stockRow: stockRow, poster: poster, rail: rail, tickerChips: tickerChips, stat: stat, stats: stats, toneClass: toneClass,
    watch: watch, recent: recent, el: el
  };
})(window);
