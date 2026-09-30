/* =========================================================================
   VISION UNIVERSE QUANT — app/ui.js                  Oberflaechen-Bausteine

   Kleine, gemeinsam genutzte Bausteine. Keine Berechnung, keine Daten:
   was hier steht, zeichnet nur, was das View Model sagt.
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

  function link(text, href, cls) { return el("a", { href: href, class: cls || null, text: text }); }
  function btn(text, href, kind) { return el("a", { href: href, class: "qx-btn" + (kind ? " " + kind : ""), text: text }); }
  function section(title, intro, kids, more, eyebrow, id) {
    return el("section", { class: "qx-section", id: id || null }, [
      el("div", { class: "qx-section-head" }, [
        el("div", {}, [eyebrow ? el("span", { class: "qx-eyebrow", text: eyebrow }) : null,
          el("h2", { class: "qx-h2", text: title }), intro ? el("p", { text: intro }) : null]),
        more ? link(more.label, more.href) : null
      ])
    ].concat(kids || []));
  }
  function card(kids, cls) { return el("div", { class: "qx-card" + (cls ? " " + cls : "") }, kids); }
  function notice(title, text) { return el("div", { class: "qx-notice", role: "note" }, [el("strong", { text: title }), el("p", { text: text })]); }
  function pill(text, tone) { return el("span", { class: "qx-pill tone-" + (tone || "unknown"), text: text }); }
  /* Ein Aufklapper, dessen Inhalt erst beim Oeffnen entsteht - die Tiefe
     kostet nichts, solange niemand hineinsieht. */
  function more(title, build, opts) {
    opts = opts || {};
    var body = el("div", { class: "qx-more-body" });
    var d = el("details", { class: "qx-more", id: opts.id || null }, [
      el("summary", {}, [el("span", { text: title }), opts.hint ? el("small", { text: opts.hint }) : null]), body]);
    var built = false;
    function fill() { if (built) return; built = true; var kids = build(); (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (k) body.append(k); }); }
    d.addEventListener("toggle", function () { if (d.open) fill(); });
    if (opts.open) { d.open = true; fill(); }
    return d;
  }
  function loading(text) { return el("div", { class: "qx-loading", role: "status" }, [el("span", { text: text || "Wird geladen …" }), el("div", { class: "qx-skel" }), el("div", { class: "qx-skel", style: "width:70%" })]); }
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

  /* Eine Aktienzeile: Name, Kuerzel, Grund, Einordnung. Kein Wert ohne
     Bedeutung, keine Bedeutung ohne Wert. */
  function stockRow(o) {
    return el("a", { class: "qx-row", href: routes.stock(o.ticker) }, [
      el("div", { class: "qx-row-main" }, [
        el("div", { class: "qx-row-title" }, [el("strong", { class: "qx-ticker", text: o.ticker }), el("span", { text: o.name || "" })]),
        o.why ? el("div", { class: "qx-row-why", text: o.why }) : null
      ]),
      el("div", { class: "qx-row-side" }, [
        o.pill ? pill(o.pill.text, o.pill.tone) : null,
        o.side ? el("div", { class: "num", text: o.side }) : null,
        o.sideNote ? el("small", { text: o.sideNote }) : null
      ])
    ]);
  }
  function tickerChips(list, max) {
    var shown = (list || []).slice(0, max || 12);
    return el("div", { class: "qx-tickers" }, shown.map(function (t) { return el("a", { href: routes.stock(t), text: t }); }));
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
    NAV: NAV, icon: icon, routes: routes, link: link, btn: btn, section: section, card: card, notice: notice,
    pill: pill, more: more, loading: loading, dateDe: dateDe, money: money, signed: signed, companyName: companyName,
    stockRow: stockRow, tickerChips: tickerChips, watch: watch, recent: recent, el: el
  };
})(window);
