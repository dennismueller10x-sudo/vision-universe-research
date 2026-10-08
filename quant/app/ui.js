/* =========================================================================
   VISION UNIVERSE QUANT — app/ui.js                  Oberflaechen-Bausteine

   Die Bausteine der Konzepttafeln vom 30.09.2026: Abschnittskopf mit
   "Alle ansehen →", helle Kacheln (Quick Access), Aktienkarten mit Logo
   und Wert (Heute interessant), Trefferzeilen mit Wert-Kasten, dunkle
   Zahlen-Streifen, Pillen, Aufklapper, die Weltkugel.

   Die qx-/qc-Klassen tragen keine eigene Bedeutung fuer die Gestaltung,
   sie sind Anker fuer Tests und QA. Keine Berechnung, keine Daten: was
   hier steht, zeichnet nur, was das View Model sagt.
   ========================================================================= */
(function (global) {
  "use strict";
  var S = global.QuantShell, el = S.el;

  /* Die Bereiche von Quant stehen seit der UI-Vereinheitlichung (10/2026)
     in der gemeinsamen Produkt-Leiste (assets/site-navigation.js, PRODUCTS):
     Quant | Screener | Strategien | Aktien | ☰. Der Eintrag "Screener" steht
     dort unter dem Produktnamen Quant und traegt die Bezeichnung
     "Quant Screener" fuer Screenreader: das eigenstaendige Produkt unter
     /screener/ gehoert nicht zu Quant. Methodik ist sekundaer (Hero, Fuss). */
  /* Linien-Icons in der Strichstaerke der Discover-Leiste (1,7 px auf 19 px). */
  var ICON = {
    home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
    screener: "M4 5h16M7 12h10M10 19h4",
    strategien: "M4 20V11M10 20V5M16 20v-7M22 20H2",
    aktien: "M3 17l5-5 4 4 8-9M15 7h5v5",
    methodik: "M12 3 4 6.2v5.3c0 4.4 3.2 8.2 8 9.5 4.8-1.3 8-5.1 8-9.5V6.2L12 3Zm-3 8.6 2.2 2.2L15.4 10",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2",
    setups: "M3 17l5-5 4 4 8-9M15 7h5v5",
    bars: "M5 20V13M11 20V7M17 20V4M3 20h18",
    filter: "M4 5h16l-6 8v5l-4 2v-7L4 5Z",
    network: "M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM12 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7.5 7.5 11 16M16.5 7.5 13 16M8.5 5.5h7",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
    bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z",
    data: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
    nodata: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 8.5l7 7M15.5 8.5l-7 7",
    warn: "M12 3 2 20h20L12 3ZM12 10v4M12 17h.01",
    trend: "M3 17l5-5 4 4 8-9",
    ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
    doc: "M6 3h8l4 4v14H6V3ZM14 3v4h4M9 12h6M9 16h6",
    shield: "M12 3 4 6.2v5.3c0 4.4 3.2 8.2 8 9.5 4.8-1.3 8-5.1 8-9.5V6.2L12 3Zm-3 8.6 2.2 2.2L15.4 10",
    news: "M5 5h11v14H5a2 2 0 0 1-2-2V7M16 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5",
    star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4 6.4 20.3l1.1-6.2L3 9.7l6.2-.9L12 3Z"
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
    radar: function (q) { return "#/radar" + (q ? "?" + q : ""); },
    backtest: function (id) { return "#/backtest" + (id ? "/" + encodeURIComponent(id) : ""); },
    screener: function (q) { return "#/screener" + (q ? "?" + q : ""); },
    screenerPro: function (q) { return "#/screener/profi" + (q ? "?" + q : ""); },
    strategies: function () { return "#/strategien"; },
    strategy: function (id) { return "#/strategien/" + encodeURIComponent(id); },
    stocks: function () { return "#/aktien"; },
    method: function (topic) { return "#/methodik" + (topic ? "/" + topic : ""); },
    technical: function (t) { return "#/aktie/" + encodeURIComponent(t) + "/technik"; },
    chartbild: function (t) { return "#/aktie/" + encodeURIComponent(t) + "/chartbild"; },
    chartlagen: function (q) { return "#/chartlagen" + (q ? "?" + q : ""); },
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
    return el("a", { href: href, class: "qx-btn " + (kind === "secondary" || kind === "ghost" ? "v2-pill-ghost" : "v2-pill-dark") + (kind ? " " + kind : ""), text: text });
  }
  function actions(kids) { return el("div", { class: "qx-actions" }, kids); }

  /* Ein Abschnitt wie auf den Tafeln: Kopfzeile mit Titel und "Alle
     ansehen →", darunter ein Satz und der Inhalt. Der Kicker steht, wo es
     einen gibt, ueber dem Titel. */
  function section(title, intro, kids, more, eyebrow, id, cls) {
    return el("section", { class: "qx-section" + (cls ? " " + cls : ""), id: id || null }, [
      eyebrow ? el("p", { class: "q-kicker", text: eyebrow }) : null,
      el("div", { class: "q-sec-head" }, [el("h2", { text: title }), more ? el("a", { href: more.href, text: more.label.replace(/\s*→$/, "") }) : null]),
      intro ? el("p", { class: "q-sec-intro", text: intro }) : null
    ].concat(kids || []));
  }
  function world(title, subtitle, kids, more, cls) { return section(title, subtitle, kids, more, null, null, cls); }
  function card(kids, cls) { return el("div", { class: "qx-card" + (cls ? " " + cls : "") }, kids); }
  function notice(title, text) {
    return el("div", { class: "qx-notice", role: "note" }, [el("b", { text: title }), el("p", { text: text })]);
  }
  function pill(text, tone) { return el("span", { class: "qx-pill " + toneClass(tone), dataset: { tone: tone || "unknown" }, text: text }); }
  /* Ein Aufklapper in Discovers Form ("WEITERE PUNKTE (6) +"), dessen
     Inhalt erst beim Oeffnen entsteht - die Tiefe kostet nichts, solange
     niemand hineinsieht. */
  function more(title, build, opts) {
    opts = opts || {};
    var body = el("div", { class: "qx-more-body" });
    var d = el("details", { class: "qx-more", id: opts.id || null }, [
      el("summary", {}, [el("span", { text: title }), opts.hint ? el("small", { text: " · " + opts.hint }) : null]), body]);
    var built = false;
    function fill() { if (built) return; built = true; var kids = build(); (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (k) body.append(k); }); }
    d.addEventListener("toggle", function () { if (d.open) fill(); });
    if (opts.open) { d.open = true; fill(); }
    return d;
  }
  function loading(text) { return el("div", { class: "qx-loading", role: "status" }, [el("span", { text: text || "Wird geladen …" })]); }
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
    opts = opts || {};
    /* In langen Listen (Screener, Mitglieder einer Strategie) steht die
       Buchstaben-Marke - vierzig Einzelbilder waeren vierzig Anfragen fuer
       ein Erkennungszeichen, das die Zeile ohnehin mit Namen traegt. */
    if (!L || opts.initialOnly) return el("span", { class: "dx-logo dx-logo--" + (size || "md"), "aria-hidden": "true", text: L && L.initial ? L.initial(name, ticker) : String(name || ticker || "·").charAt(0).toUpperCase() });
    return L.mark(ticker, { name: name, size: size || "md", onlyLogo: !!opts.onlyLogo, wide: !!opts.wide });
  }

  /* Ein Wert-Kasten wie auf der Screener-Tafel ("Score 87"). Beschriftet
     wird er mit dem, was er ist - der Wert EINER Eigenschaft, keine
     Gesamtnote. */
  function scoreBox(label, value, tone) {
    return el("span", { class: "q-scorebox " + (value === null || value === undefined ? "none" : toneClass(tone)) }, [el("small", { text: label }), el("b", { text: value === null || value === undefined ? "–" : String(value) })]);
  }
  /* Eine Trefferzeile: Logo, (Anlagestil), Name, Kuerzel, Grund, Wert. */
  function stockRow(o) {
    return el("a", { class: "qx-row", href: routes.stock(o.ticker), dataset: { symbol: o.ticker } }, [
      logo(o.ticker, o.name, "sm", { initialOnly: !o.withLogo }),
      el("div", { class: "qx-row-main" }, [
        o.kicker ? el("span", { class: "qx-row-kicker", text: o.kicker }) : null,
        el("div", { class: "qx-row-title" }, [el("span", { class: "qx-row-name", text: o.name || o.ticker }), el("span", { class: "qx-ticker", text: o.ticker })]),
        o.why ? el("div", { class: "qx-row-why", text: o.why }) : null,
        o.verdict ? el("span", { class: "qx-row-verdict" }, [pill(o.verdict.text, o.verdict.tone)]) : null
      ]),
      el("div", { class: "qx-row-side" }, [
        o.score ? scoreBox(o.score.label, o.score.value, o.score.tone) : null,
        o.pill ? pill(o.pill.text, o.pill.tone) : null,
        o.side ? el("b", { class: "num", text: o.side }) : null,
        o.sideNote ? el("small", { text: o.sideNote }) : null
      ])
    ]);
  }
  /* Eine Aktienkarte wie "Heute interessant": Logo, Name, ein Satz, Wert. */
  function poster(o) {
    return el("a", { class: "q-card qx-poster", href: routes.stock(o.ticker), dataset: { symbol: o.ticker },
      "aria-label": (o.name || o.ticker) + (o.story ? " — " + o.story : "") + " – Analyse öffnen" }, [
      logo(o.ticker, o.name, "md", { initialOnly: !!o.initialOnly }),
      el("b", { class: "q-card-name", text: o.name || o.ticker }),
      el("span", { class: "q-card-why", text: o.story || o.ticker }),
      el("span", { class: "q-card-foot" }, [el("span", { class: "q-score " + (o.big ? toneClass(o.tone) : "none"), text: o.big ? (o.bigLabel ? o.bigLabel + " " : "") + o.big : (o.foot || o.ticker) })])
    ]);
  }
  /* Waagerechte Kartenreihe (wischen). */
  function rail(items, label) {
    return el("div", { class: "q-cards qx-rail", role: "list", "aria-label": label || null, tabindex: "0" }, items.map(function (it) { var li = el("div", { role: "listitem", style: "display:contents" }); li.append(it); return li; }));
  }
  /* Kuerzel als Pillen. */
  function tickerChips(list, max) {
    var shown = (list || []).slice(0, max || 12);
    return el("p", { class: "dx-index-badges qx-tickers" }, shown.map(function (t) { return el("a", { class: "dx-index-badge", href: routes.stock(t), text: t }); }));
  }
  /* Eine helle Kachel (Quick Access): Symbol, Titel, Satz, Pfeil. Ohne
     Ziel ist sie gedaempft und sagt, warum. */
  function tile(o) {
    return el(o.href ? "a" : "div", { class: "q-tile" + (o.href ? "" : " is-off") + (o.cls ? " " + o.cls : ""), href: o.href || null, "aria-disabled": o.href ? null : "true" }, [
      el("span", { class: "q-icon", "aria-hidden": "true" }, [icon(o.icon)]), el("span", {}, [el("strong", { text: o.title }), el("small", { text: o.text })])]);
  }
  /* Eine Kennzahl in einem Zahlen-Streifen. */
  function stat(label, value, sub, tone) {
    return el("div", { class: "q-stat qx-stat" }, [el("b", { class: "num " + toneClass(tone), text: value }), el("span", { text: label }), sub ? el("small", { text: sub }) : null]);
  }
  function stats(list) { return el("div", { class: "q-stats qx-stats" }, list); }

  /* Die Weltkugel der Tafeln - als Linienzeichnung, ohne Bilddatei.
     Farben kommen aus CSS-Variablen (--q-globe-*, app.css) und werden vom
     Browser bei jedem Wechsel Hell/Dunkel neu aufgeloest - kein Neuzeichnen. */
  function globe() {
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 400 400"); svg.setAttribute("class", "q-globe"); svg.setAttribute("aria-hidden", "true");
    var html = '<defs><radialGradient id="qg-s" cx="38%" cy="32%" r="70%"><stop offset="0" style="stop-color:var(--q-globe-1)"/><stop offset=".55" style="stop-color:var(--q-globe-2)"/><stop offset="1" style="stop-color:var(--q-globe-3)"/></radialGradient>' +
      '<radialGradient id="qg-g" cx="50%" cy="50%" r="50%"><stop offset=".7" style="stop-color:var(--q-globe-glow);stop-opacity:0"/><stop offset=".92" style="stop-color:var(--q-globe-glow)"/><stop offset="1" style="stop-color:var(--q-globe-glow);stop-opacity:0"/></radialGradient></defs>' +
      '<circle cx="200" cy="200" r="198" fill="url(#qg-g)"/><circle cx="200" cy="200" r="170" fill="url(#qg-s)" style="stroke:var(--q-globe-rim)" stroke-width="1"/>';
    var lines = "";
    for (var i = 1; i < 6; i++) { var ry = 170 * Math.cos(i * Math.PI / 12); lines += '<ellipse cx="200" cy="200" rx="170" ry="' + (170 - i * 28).toFixed(1) + '" fill="none" style="stroke:var(--q-globe-grid)"/>'; void ry; }
    for (var k = 1; k < 7; k++) lines += '<ellipse cx="200" cy="200" rx="' + (k * 26).toFixed(1) + '" ry="170" fill="none" style="stroke:var(--q-globe-grid)"/>';
    var pts = [[120, 150], [170, 110], [240, 130], [280, 190], [230, 240], [160, 230], [110, 210], [200, 180], [300, 150], [260, 280], [150, 290], [90, 260]];
    var links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [7, 1], [7, 3], [7, 5], [2, 8], [4, 9], [5, 10], [6, 11], [9, 10]];
    links.forEach(function (l) { lines += '<line x1="' + pts[l[0]][0] + '" y1="' + pts[l[0]][1] + '" x2="' + pts[l[1]][0] + '" y2="' + pts[l[1]][1] + '" style="stroke:var(--q-globe-link)" stroke-width="1"/>'; });
    pts.forEach(function (p, j) { lines += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (j % 3 ? 2.2 : 3.4) + '" style="fill:var(--q-globe-dot)"/>'; });
    svg.innerHTML = html + lines;
    return svg;
  }

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
    icon: icon, routes: routes, link: link, btn: btn, actions: actions, section: section, world: world, card: card, notice: notice,
    pill: pill, more: more, loading: loading, dateDe: dateDe, money: money, signed: signed, companyName: companyName, logo: logo,
    stockRow: stockRow, poster: poster, rail: rail, tickerChips: tickerChips, stat: stat, stats: stats, toneClass: toneClass,
    tile: tile, scoreBox: scoreBox, globe: globe,
    watch: watch, recent: recent, el: el
  };
})(window);
