/* =========================================================================
   VISION UNIVERSE ELLIOTT — app.js                       Startseite des Produkts

   /elliott/ ist die Entdeckungsansicht: Was sieht Elliott gerade? Eine kleine, eigene
   Seite (kein Quant-Buendel). Daten: EINE kompakte Datei (elliott-home-1.0.0, ca. 15 KB
   gzip). Die Aktie selbst (Chartbild) liegt in der Quant-SPA unter #/elliott/<TICKER>;
   Karten und Suchtreffer fuehren dorthin (VUElliottHome.detailHref).

   Hash-Zustand:  #/?welle=3&richtung=ab&status=bestaetigt&rolle=highlight&neu=1&suche=1
   Alias:         #/<TICKER>  ->  /quant/#/elliott/<TICKER>
   Kein Shard-Abruf, keine Berechnung im Browser, Detaildaten erst beim Oeffnen einer Aktie.
   ========================================================================= */
(function (global) {
  "use strict";
  var M = global.VUElliottHome;
  var root = document.getElementById("el-main");
  var state = { home: null, status: "loading", names: null, namesPromise: null, shown: M.PAGE };

  /* ------------------------------------------------------------ DOM-Helfer */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "dataset") Object.keys(v).forEach(function (d) { n.dataset[d] = v[d]; });
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  }
  function icon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "/assets/product-icons.svg#elliott"); svg.append(use);
    return svg;
  }

  /* ------------------------------------------------------------ Daten */
  function fetchBuffer(path) {
    return fetch(path, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) { var e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
      return res;
    });
  }
  function loadHome() {
    return fetchBuffer(M.INDEX_PATH).then(function (r) { return r.json(); }).then(function (home) {
      var v = M.validate(home);
      if (!v.ok) { var e = new Error("INDEX_" + v.reason); e.status = 0; throw e; }
      return home;
    });
  }
  function gunzipJson(res) {
    if (typeof DecompressionStream !== "function") return Promise.reject(new Error("GZIP_UNSUPPORTED"));
    return new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json();
  }
  /* Namensansicht der Auslieferung (kleiner), sonst die volle Universumsliste (lokal). Erst bei der ersten Suche. */
  function loadNames() {
    if (!state.namesPromise) {
      state.namesPromise = fetchBuffer("/quant/data/product/universe-names-v1.json.gz").then(gunzipJson)
        .catch(function () { return fetchBuffer("/quant/data/product/universe-list-v1.json.gz").then(gunzipJson); })
        .then(function (d) { state.names = (d.entries || []).filter(function (e) { return e && e.s; }); return state.names; })
        .catch(function (e) { state.namesPromise = null; throw e; });
    }
    return state.namesPromise;
  }

  /* ------------------------------------------------------------ Karte */
  function card(c) {
    var head = M.headlineTier(c), others = M.otherTiers(c), ctx = M.contextLine(c);
    var dirUp = c.dir === "UP";
    return el("a", { class: "el-card el-role-" + c.role.toLowerCase(), href: M.detailHref(c.t), "aria-label": M.ariaLabel(c), dataset: { id: c.id, symbol: c.t, role: c.role } }, [
      el("div", { class: "el-card-top" }, [
        el("span", { class: "el-role", text: M.roleLabel(c.role), title: M.ROLE_NOTE[c.role] }),
        c.chg ? el("span", { class: "el-chg", text: M.CHANGE_LABEL[c.chg.k] || "Neu" }) : null
      ]),
      el("h3", { class: "el-name", text: c.n }),
      el("p", { class: "el-sub" }, [el("b", { text: c.t }), M.price(c) ? " · " + M.price(c) : ""]),
      el("p", { class: "el-wave" }, [
        el("span", { text: M.waveLabel(c) }),
        el("span", { class: "el-dir " + (dirUp ? "is-up" : "is-down"), text: (dirUp ? "↗ " : "↘ ") + M.DIR_LABEL[c.dir] })
      ]),
      head ? el("div", { class: "el-proj" }, [
        el("span", { class: "el-proj-k", text: head.label + " · Projektionszone" }),
        el("strong", { class: "el-proj-v num", text: head.text }),
        others.length ? el("span", { class: "el-proj-o", text: others.map(function (o) { return o.label + " " + o.text; }).join(" · ") }) : null
      ]) : null,
      c.role === "EXPLORE_HIGHLIGHT" ? el("p", { class: "el-note-role", text: "Explorativ – nicht als reguläre Alternative freigegeben" }) : null,
      el("p", { class: "el-meta" }, [M.STATUS_LABEL[c.st]].concat(ctx.length ? [" · " + ctx[0]] : [])),
      c.fr === "DELAYED" ? el("p", { class: "el-delayed", role: "note", text: "Kursdaten verzögert · letzter Stand " + M.dateDe(c.last) }) : null,
      el("span", { class: "el-cta", "aria-hidden": "true", text: "Analyse öffnen →" })
    ]);
  }

  /* ------------------------------------------------------------ Bausteine */
  function rowSection(row, eager) {
    var f = M.rowFilter(row.id), more = row.total > row.cards.length;
    var track = el("ul", { class: "el-track", role: "list" });
    var fill = function () { row.cards.forEach(function (c) { track.append(el("li", { class: "el-slot" }, [card(c)])); }); track.dataset.ready = "true"; };
    var section = el("section", { class: "el-row", "aria-labelledby": "el-h-" + row.id, dataset: { row: row.id } }, [
      el("header", { class: "el-row-head" }, [
        el("div", {}, [el("h2", { id: "el-h-" + row.id, class: "el-row-title", text: row.title }), el("p", { class: "el-row-rule", text: row.rule })]),
        f ? el("a", { class: "el-all", href: M.buildHash(Object.assign({ welle: null, richtung: null, status: null, rolle: null, neu: false }, f)), text: more || row.total > 6 ? "Alle " + row.total : "Filtern" }) : null
      ]),
      track
    ]);
    if (eager || typeof IntersectionObserver !== "function") fill();
    else {
      track.append(el("li", { class: "el-skel", "aria-hidden": "true" }));
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); track.replaceChildren(); fill(); } }, { rootMargin: "400px 0px" });
      io.observe(section);
    }
    return section;
  }
  function emptyBox(e) {
    return el("section", { class: "el-empty", role: "status" }, [el("h2", { text: e.title }), el("p", { text: e.text }),
      e.kind === "FILTER" ? el("a", { class: "el-btn", href: "#/", text: "Filter zurücksetzen" }) : null]);
  }
  function chips(s) {
    var wrap = el("div", { class: "el-chips", role: "group", "aria-label": "Lesarten filtern" });
    var all = el("a", { class: "el-chip" + (M.isFiltered(s) ? "" : " is-on"), href: "#/", "aria-current": M.isFiltered(s) ? null : "true", text: "Alle" });
    wrap.append(all);
    M.chipGroups(state.home, s).forEach(function (g) {
      wrap.append(el("span", { class: "el-chip-sep", "aria-hidden": "true" }));
      g.options.forEach(function (o) {
        wrap.append(el("a", { class: "el-chip" + (o.active ? " is-on" : ""), href: M.buildHash(M.withChip(s, g.id, o.value)), "aria-current": o.active ? "true" : null, title: g.label },
          [o.label, el("span", { class: "el-chip-n", text: String(o.count) })]));
      });
    });
    return wrap;
  }
  function stats(home, s) {
    var sm = home.summary || {};
    var tile = function (n, label, href, on) { return el("a", { class: "el-stat" + (on ? " is-on" : ""), href: href }, [el("strong", { class: "num", text: String(n) }), el("span", { text: label })]); };
    return el("nav", { class: "el-stats", "aria-label": "Überblick" }, [
      tile(sm.theses || 0, "Lesarten", "#/", !M.isFiltered(s)),
      tile(sm.bullish || 0, "Aufwärts", M.buildHash({ richtung: "auf" }), s.richtung === "auf"),
      tile(sm.bearish || 0, "Abwärts", M.buildHash({ richtung: "ab" }), s.richtung === "ab"),
      sm.recent ? tile(sm.recent, "Neu und verändert", M.buildHash({ neu: true }), s.neu) : null
    ]);
  }

  /* ------------------------------------------------------------ Suche */
  var form = null, closeSearch = function () {}, form_focusout = null;
  document.addEventListener("click", function (ev) { if (form && !form.contains(ev.target)) closeSearch(); });
  function buildSearch(initialQ, autofocus) {
    var input = el("input", { id: "el-q", class: "el-input", type: "search", placeholder: "Aktie oder Kürzel suchen …", autocomplete: "off", autocapitalize: "off", spellcheck: "false", role: "combobox", "aria-expanded": "false", "aria-controls": "el-results", "aria-autocomplete": "list", "aria-label": "Aktie suchen", value: initialQ || "" });
    var list = el("ul", { id: "el-results", class: "el-results", role: "listbox", hidden: true });
    var live = el("p", { class: "el-sr", role: "status", "aria-live": "polite" });
    var active = -1, hits = [];
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; input.removeAttribute("aria-activedescendant"); }
    function mark(i) {
      active = i;
      [].forEach.call(list.children, function (li, k) { li.classList.toggle("is-active", k === i); li.setAttribute("aria-selected", String(k === i)); });
      if (i >= 0) input.setAttribute("aria-activedescendant", "el-hit-" + i); else input.removeAttribute("aria-activedescendant");
    }
    function paint(q) {
      list.replaceChildren();
      if (!q) { close(); return; }
      var byT = state.home ? M.cardsByTicker(state.home) : {};
      if (!hits.length) {
        var e = M.emptyState(state.home, {}, q);
        list.append(el("li", { class: "el-hit-none", role: "presentation" }, [el("b", { text: e.title }), el("span", { text: e.text })]));
        live.textContent = e.title;
      } else {
        hits.forEach(function (h, i) {
          var cards = byT[h.s];
          list.append(el("li", { id: "el-hit-" + i, role: "option", "aria-selected": "false", class: "el-hit" }, [
            el("a", { href: M.detailHref(h.s), tabindex: "-1" }, [el("b", { text: h.n || h.s }), el("span", { class: "el-hit-t", text: h.s }), el("span", { class: "el-hit-h" + (cards ? " has" : ""), text: M.searchHint(cards) })])
          ]));
        });
        live.textContent = hits.length + (hits.length === 1 ? " Treffer" : " Treffer");
      }
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    var seq = 0;
    function run() {
      var q = input.value.trim(), mine = ++seq;
      if (!q) { hits = []; paint(""); return; }
      loadNames().then(function (names) { if (mine !== seq) return; hits = M.searchEntries(names, q, 8); paint(q); })
        .catch(function () {
          if (mine !== seq) return;
          hits = []; list.replaceChildren(el("li", { class: "el-hit-none", role: "presentation" }, [el("b", { text: "Suche gerade nicht verfügbar" }), el("span", { text: "Die Aktienliste konnte nicht geladen werden. Du kannst ein Kürzel direkt öffnen: Enter." })]));
          list.hidden = false; input.setAttribute("aria-expanded", "true");
        });
    }
    input.addEventListener("input", run);
    form_focusout = function (ev) { if (form && !form.contains(ev.relatedTarget)) close(); };
    input.addEventListener("focus", function () { loadNames().catch(function () { /* beim Tippen erneut */ }); if (input.value.trim()) run(); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (!list.hidden && hits.length) mark((active + 1) % hits.length); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (!list.hidden && hits.length) mark((active - 1 + hits.length) % hits.length); }
      else if (ev.key === "Escape") { if (!list.hidden) { ev.preventDefault(); close(); } }
      else if (ev.key === "Enter") {
        ev.preventDefault();
        var pick = hits[active >= 0 ? active : 0], raw = input.value.trim().toUpperCase();
        if (pick) global.location.assign(M.detailHref(pick.s));
        else if (/^[A-Z0-9.-]{1,12}$/.test(raw) && (!state.names || state.names.some(function (e) { return String(e.s).toUpperCase() === raw; }))) global.location.assign(M.detailHref(raw));   // Namensliste nicht geladen: Kuerzel direkt oeffnen; geladen: nur bekannte Kuerzel
      }
    });
    closeSearch = close;
    form = el("form", { class: "el-search", role: "search", onsubmit: function (e) { e.preventDefault(); } }, [
      el("label", { class: "el-sr", for: "el-q", text: "Aktie suchen" }), input,
      el("button", { class: "el-clear", type: "button", "aria-label": "Eingabe löschen", text: "×", onclick: function () { input.value = ""; hits = []; paint(""); input.focus(); } }),
      list, live
    ]);
    form.addEventListener("focusout", form_focusout);
    if (autofocus) global.requestAnimationFrame(function () { input.focus(); });
    if (initialQ) run();
    return form;
  }

  /* ------------------------------------------------------------ Seite */
  function hero(s) {
    var home = state.home;
    return el("header", { class: "el-hero" }, [
      el("div", { class: "el-hero-main" }, [
        el("p", { class: "el-eyebrow", text: "Vision Universe" }),
        el("h1", { class: "el-title" }, [el("span", { class: "el-mark" }, [icon()]), "Elliott"]),
        el("p", { class: "el-lead", text: "Strukturelle Marktszenarien und Projektionen." }),
        buildSearch(s.q, s.suche)
      ]),
      el("div", { class: "el-hero-side" }, [
        home ? stats(home, s) : null,
        home ? el("p", { class: "el-asof" }, ["Datenstand ", el("b", { text: M.dateDe(home.dataAsOf) }), " · experimentelles Strukturmodell"]) : null,
        el("details", { class: "el-about" }, [
          el("summary", { text: "Wie ist das gemeint?" }),
          el("p", { text: "Elliott liest Kursverläufe als Wellenstruktur und leitet daraus rechnerische Zonen ab. Eine Projektion beschreibt, wohin eine Welle rechnerisch laufen könnte – sie ist keine Wahrscheinlichkeit, keine Prognose und kein Kursziel. Jede Lesart nennt, wann sie ungültig wird." }),
          el("p", { text: "Das Modell ist experimentell: Für Projektionszonen liegt noch keine ausreichende historische Prüfung vor. Rangfolgen richten sich nicht nach der Größe der Projektion." }),
          el("p", {}, [el("a", { href: "/quant/#/methodik", text: "Methodik ansehen" })])
        ])
      ])
    ]);
  }

  function content(s) {
    var home = state.home, host = el("div", { class: "el-content", id: "el-content" });
    if (state.status === "loading") { host.append(el("div", { class: "el-skel-row", "aria-hidden": "true" }), el("p", { class: "el-sr", role: "status", text: "Elliott wird geladen …" })); return host; }
    if (state.status === "error") {
      host.append(el("section", { class: "el-empty", role: "alert" }, [el("h2", { text: "Die Elliott-Übersicht ist gerade nicht verfügbar" }),
        el("p", { text: "Die Übersicht konnte nicht geladen werden. Die Suche oben funktioniert weiter und öffnet jede Aktie direkt." }),
        el("button", { class: "el-btn", type: "button", text: "Erneut versuchen", onclick: function () { start(); } })]));
      return host;
    }
    host.append(chips(s));
    var empty = M.emptyState(home, s, null, M.isFiltered(s) ? M.filterCards(home.cards, s).length : null);
    if (empty) { host.append(emptyBox(empty)); return host; }
    if (M.isFiltered(s)) {
      var list = M.filterCards(home.cards, s), shown = list.slice(0, state.shown);
      host.append(el("div", { class: "el-result-head" }, [el("div", {}, [el("h2", { class: "el-row-title", text: M.filterTitle(s) }), el("p", { class: "el-row-rule", text: list.length + (list.length === 1 ? " Lesart" : " Lesarten") })]), el("a", { class: "el-all", href: "#/", text: "Zurücksetzen" })]));
      var grid = el("ul", { class: "el-grid", role: "list" });
      shown.forEach(function (c) { grid.append(el("li", { class: "el-slot" }, [card(c)])); });
      host.append(grid);
      if (list.length > shown.length) host.append(el("button", { class: "el-btn el-more", type: "button", text: "Mehr anzeigen (" + (list.length - shown.length) + ")", onclick: function () { state.shown += M.PAGE; render(); var g = document.querySelectorAll(".el-grid .el-card"); if (g[shown.length]) g[shown.length].focus(); } }));
    } else {
      M.rowsOf(home).forEach(function (r, i) { host.append(rowSection(r, i < 2)); });
      var note = M.missingRowNote(home, "wave5");
      if (note) host.append(el("p", { class: "el-note", text: note }));
    }
    host.append(el("aside", { class: "el-more-links" }, [
      el("a", { href: "/screener/", text: "Weitere Filter im Screener" }),
      el("a", { href: "/quant/", text: "Quantitative Einordnung in Quant" })
    ]));
    return host;
  }

  /* Tastatur: nach einem Filterwechsel baut render() die Seite neu; der Fokus kehrt auf das gleiche Ziel zurueck. */
  var focusHref = null;
  document.addEventListener("click", function (ev) { var a = ev.target.closest && ev.target.closest(".el-chip, .el-stat, .el-all"); focusHref = a ? a.getAttribute("href") : null; });
  function restoreFocus() {
    if (!focusHref) return;
    var target = [].filter.call(root.querySelectorAll(".el-chip, .el-stat, .el-all"), function (a) { return a.getAttribute("href") === focusHref; })[0] || root.querySelector(".el-row-title, .el-chip.is-on");
    focusHref = null;
    if (target) { if (!target.matches("a,button")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  }
  var lastKey = null;
  function render() {
    var s = M.parseHash(global.location.hash);
    if (s.ticker) { global.location.replace(M.detailHref(s.ticker)); return; }      // Alias #/<TICKER>
    var key = M.buildHash(Object.assign({}, s, { suche: false, q: "" }));
    if (key !== lastKey) { state.shown = M.PAGE; lastKey = key; }
    var searchHadFocus = document.activeElement && document.activeElement.id === "el-q", q = searchHadFocus ? document.activeElement.value : s.q;
    root.setAttribute("aria-busy", "true");
    root.replaceChildren(hero(Object.assign({}, s, { q: q })), content(s));
    if (searchHadFocus) { var i = document.getElementById("el-q"); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* type=search */ } } }
    restoreFocus();
    document.title = (M.isFiltered(s) ? M.filterTitle(s) + " · " : "") + "Elliott · Vision Universe®";
    root.setAttribute("aria-busy", "false"); root.dataset.ready = state.status === "loading" ? "false" : "true"; root.dataset.state = state.status;
    if (global.VUNavigation) global.VUNavigation.dock({});
  }

  /* "Zurueck" aus einem Aktienbild landet dort, wo man war (anderes Dokument, deshalb eigenes kleines Gedaechtnis). */
  var SCROLL_KEY = "vu-elliott-scroll-v1";
  function rememberScroll() { try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ h: global.location.hash, y: Math.round(global.scrollY) })); } catch (e) { /* nur dieser Tab */ } }
  function restoreScroll() {
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (!nav || nav.type !== "back_forward") return;
    try {
      var m = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "null");
      if (!m || m.h !== global.location.hash || !(m.y > 0)) return;
      /* Spaetere Reihen entstehen erst beim Annaehern: solange die Seite zu niedrig ist, nachfassen (hoechstens 2,5 s, Eingabe bricht ab). */
      var t0 = Date.now(), touched = false, stop = function () { touched = true; };
      global.addEventListener("wheel", stop, { once: true, passive: true }); global.addEventListener("touchstart", stop, { once: true, passive: true });
      (function step() {
        if (touched || Date.now() - t0 > 2500) return;
        global.scrollTo(0, m.y);
        if (Math.abs(global.scrollY - m.y) > 2) global.setTimeout(step, 80);
      })();
    } catch (e) { /* ohne Speicher: oben */ }
  }
  global.addEventListener("pagehide", rememberScroll);

  function start() {
    state.status = "loading"; render();
    loadHome().then(function (home) { state.home = home; state.status = "ready"; render(); restoreScroll(); })
      .catch(function (e) { if (global.console) console.error("Elliott home", e); state.status = "error"; render(); });
  }
  global.addEventListener("hashchange", function () { if (global.location.pathname.indexOf("/elliott/") === 0) render(); });
  global.VUElliottApp = { state: state, render: render, start: start };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(window);
