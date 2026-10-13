/* =========================================================================
   VISION UNIVERSE ELLIOTT — app.js                                  Produkt-Shell

   /elliott/ besitzt die Adresse des Produkts:
     /elliott/                        Startseite (Entdeckung: Was sieht Elliott gerade?)
     /elliott/#/?welle=3&...          Filter (teilbar), #/?reihe=<id> eine Reihe als Liste
     /elliott/#/<TICKER>[?ansicht=profi]   Aktie im Elliott-Bild (Chartbild)

   Die Startseite ist klein und eigenstaendig (eine Datenanfrage, kein Quant-Buendel). Das Aktienbild nutzt die vorhandene
   Chartbild-Implementierung: beim ersten Oeffnen laedt diese Seite genau das Buendel, das /quant/index.html nennt (Release:
   ein gebuendeltes, langlebig gecachtes Skript; lokal: die Einzelskripte), setzt window.QX_HOST und haengt die Ansicht ueber
   QXApp.mountElliott in die eigene Seite. Es gibt keine zweite Implementierung und keine Liste der Skripte an dieser Stelle.
   Das Buendel wird bei Absicht (Zeiger, Fokus, Beruehrung auf einer Karte oder einem Treffer) vorgewaermt, nie beim Laden
   der Startseite.
   ========================================================================= */
(function (global) {
  "use strict";
  var M = global.VUElliottHome;
  var root = document.getElementById("el-main");
  var state = { home: null, status: "idle", names: null, namesPromise: null, shown: M.PAGE, view: "home", homeKey: null, homeScroll: 0, rendered: false };

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
  function fetchRes(path) {
    return fetch(path, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) { var e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
      return res;
    });
  }
  function loadHome() {
    return fetchRes(M.INDEX_PATH).then(function (r) { return r.json(); }).then(function (home) {
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
      state.namesPromise = fetchRes("/quant/data/product/universe-names-v1.json.gz").then(gunzipJson)
        .catch(function () { return fetchRes("/quant/data/product/universe-list-v1.json.gz").then(gunzipJson); })
        .then(function (d) { state.names = (d.entries || []).filter(function (e) { return e && e.s; }); return state.names; })
        .catch(function (e) { state.namesPromise = null; throw e; });
    }
    return state.namesPromise;
  }
  function ensureHome() {
    if (state.status === "ready" || state.status === "loading") return;
    state.status = "loading";
    loadHome().then(function (home) { state.home = home; state.status = "ready"; if (state.view === "home") render(); })
      .catch(function (e) { if (global.console) console.error("Elliott home", e); state.status = "error"; if (state.view === "home") render(); });
  }

  /* ------------------------------------------------------------ Aktienbild: das vorhandene Chartbild im Gast-Betrieb */
  var stackPromise = null, stackLinks = [];
  function loadStack() {
    if (!stackPromise) {
      global.QX_HOST = "elliott";     // vor dem Buendel: app.js startet dann keinen eigenen Router
      stackPromise = fetchRes("/quant/index.html").then(function (r) { return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html"), loads = [];
        doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
          var href = l.getAttribute("href");
          if (!href || /site-navigation\.css/.test(href)) return;
          /* media "not all": wird geladen (onload feuert), wirkt aber erst im Aktienbild - die Startseite bleibt unberuehrt. */
          var link = el("link", { rel: "stylesheet", href: href, media: "not all", dataset: { qxHost: "1" } });
          stackLinks.push(link);
          loads.push(new Promise(function (ok) { link.onload = link.onerror = function () { ok(); }; }));
          document.head.append(link);
        });
        /* Skripte in Dokumentreihenfolge: parallel laden, in Reihenfolge ausfuehren (async=false). */
        doc.querySelectorAll("script[src]").forEach(function (sc) {
          var src = sc.getAttribute("src");
          if (!src || /site-navigation\.js/.test(src)) return;
          var node = document.createElement("script");
          node.src = src; node.async = false;
          loads.push(new Promise(function (ok, fail) { node.onload = function () { ok(); }; node.onerror = function () { fail(new Error("STACK_SCRIPT " + src)); }; }));
          document.head.append(node);
        });
        return Promise.all(loads);
      }).then(function () { if (!global.QXApp || !global.QXApp.mountElliott) throw new Error("STACK_API"); })
        .catch(function (e) { stackPromise = null; throw e; });
    }
    return stackPromise;
  }
  function stackStyles(on) { stackLinks.forEach(function (l) { l.media = on ? "all" : "not all"; }); }
  var detail = null, detailRoot = null;
  function ensureDetailHost() {
    if (detail) return;
    detailRoot = el("div", { id: "qx-app" });
    detail = el("div", { id: "el-detail", class: "el-detail", hidden: true }, [detailRoot]);
    root.after(detail);
  }
  function setBodyMode(mode) {
    var c = document.body.classList;
    if (mode === "detail") { c.remove("el-body"); c.add("dx", "qd", "qx"); } else { c.remove("dx", "qd", "qx"); c.add("el-body"); }
  }
  /** Bei Absicht das Buendel warmlaufen lassen (nur laden, nichts anzeigen). */
  function warm() { loadStack().catch(function () { /* beim Oeffnen erneut */ }); }
  document.addEventListener("pointerover", function (ev) { if (ev.target.closest && ev.target.closest(".el-card, .el-hit")) warm(); }, { passive: true });
  document.addEventListener("focusin", function (ev) { if (ev.target.closest && ev.target.closest(".el-card, .el-hit")) warm(); });
  /* Kein Aufwaermen bei touchstart: Wischen ueber eine Reihe ist keine Absicht, ein Aktienbild zu oeffnen. */
  document.addEventListener("pointerdown", function (ev) { if (ev.pointerType !== "touch" && ev.target.closest && ev.target.closest(".el-card, .el-hit")) warm(); }, { passive: true });

  function showDetail(s) {
    ensureDetailHost();
    if (state.view !== "detail") { state.homeScroll = global.scrollY; }
    state.view = "detail";
    root.hidden = true; detail.hidden = false;
    var q = new URLSearchParams(s.detailQuery || "");
    document.title = s.ticker + " · Elliott · Vision Universe®";
    detailRoot.replaceChildren(el("main", { class: "qx-main", "aria-busy": "true" }, [el("div", { class: "el-skel-row el-skel-detail", "aria-hidden": "true" }), el("p", { class: "el-sr", role: "status", text: "Elliott-Analyse wird geladen …" })]));
    global.scrollTo(0, 0);
    var mine = s.ticker + "?" + s.detailQuery;
    state.detailKey = mine;
    loadStack().then(function () {
      if (state.view !== "detail" || state.detailKey !== mine) return;
      stackStyles(true); setBodyMode("detail");
      return global.QXApp.mountElliott(detailRoot, s.ticker, q);
    }).then(function (m) { if (m && state.detailKey === mine) { var h = m.querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) { /* ohne Fokus */ } } if (h && h.textContent) document.title = (h.textContent.length < 60 ? h.textContent + " · " : "") + s.ticker + " · Elliott · Vision Universe®"; } })
      .catch(function (e) {
        if (global.console) console.error("Elliott detail", e);
        if (state.detailKey !== mine) return;
        detailRoot.replaceChildren(el("main", { class: "qx-main" }, [el("section", { class: "el-empty", role: "alert" }, [el("h2", { text: "Die Elliott-Analyse ist gerade nicht verfügbar" }),
          el("p", { text: "Die Analyse konnte nicht geladen werden." }), el("a", { class: "el-btn", href: "/elliott/#/" + encodeURIComponent(s.ticker), onclick: function (ev) { ev.preventDefault(); showDetail(s); }, text: "Erneut versuchen" }),
          el("a", { class: "el-all", href: "#/", text: "Zur Elliott-Übersicht" })])]));
      });
    if (global.VUNavigation) global.VUNavigation.dock({});
  }
  function leaveDetail() {
    if (state.view !== "detail") return;
    state.view = "home";
    var lastTicker = String(state.detailKey || "").split("?")[0];
    if (global.QXApp && global.QXApp.unmountElliott) global.QXApp.unmountElliott();
    stackStyles(false); setBodyMode("home");
    if (detail) { detail.hidden = true; detailRoot.replaceChildren(); }
    root.hidden = false;
    /* Fokus zurueck auf die Karte, von der aus die Analyse geoeffnet wurde. */
    var back = lastTicker && root.querySelector('a.el-card[data-symbol="' + lastTicker.replace(/[^A-Za-z0-9.-]/g, "") + '"]');
    if (back) { try { back.focus({ preventScroll: true }); } catch (e) { /* ohne Fokus */ } }
  }
  /* Sprunglink: im Aktienbild ist #el-main verborgen - der Fokus geht in den sichtbaren Hauptbereich. */
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a.el-skip");
    if (!a) return;
    ev.preventDefault();
    var m = state.view === "detail" && detailRoot ? detailRoot.querySelector("main") : document.getElementById("el-main");
    if (m) { m.setAttribute("tabindex", "-1"); m.focus(); }
  });

  /* ------------------------------------------------------------ Karte */
  function card(c, opts) {
    opts = opts || {};
    var head = M.headlineTier(c), others = M.otherTiers(c), chips = M.contextChips(c);
    var dirUp = c.dir === "UP";
    return el("a", { class: "el-card el-role-" + c.role.toLowerCase() + (opts.flagship ? " is-flagship" : ""), href: M.detailHref(c.t), "aria-label": M.ariaLabel(c), dataset: { id: c.id, symbol: c.t, role: c.role } }, [
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
      el("p", { class: "el-meta" }, [el("b", { text: M.STATUS_LABEL[c.st] })]),
      chips.length ? el("ul", { class: "el-ctx", "aria-label": "Kontext" }, chips.map(function (x) { return el("li", {}, [el("span", { text: x.k }), " ", el("b", { text: x.v })]); })) : null,
      c.fr === "DELAYED" ? el("p", { class: "el-delayed", role: "note", text: "Kursdaten verzögert · letzter Stand " + M.dateDe(c.last) }) : null,
      el("span", { class: "el-cta", "aria-hidden": "true", text: "Analyse öffnen →" })
    ]);
  }

  /* ------------------------------------------------------------ Bausteine */
  function rowSection(row, eager) {
    var more = row.total > row.cards.length, flagship = row.kind === "flagship";
    var track = el("ul", { class: "el-track", role: "list" });
    var fill = function () { row.cards.forEach(function (c) { track.append(el("li", { class: "el-slot" }, [card(c, { flagship: flagship })])); }); track.dataset.ready = "true"; };
    var section = el("section", { class: "el-row is-" + row.kind, "aria-labelledby": "el-h-" + row.id, dataset: { row: row.id } }, [
      el("header", { class: "el-row-head" }, [
        el("div", {}, [el("h2", { id: "el-h-" + row.id, class: "el-row-title", text: row.title }), el("p", { class: "el-row-rule", text: row.rule })]),
        el("a", { class: "el-all", href: M.rowHref(row), text: more ? "Alle " + row.total : "Als Liste" })
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
    wrap.append(el("a", { class: "el-chip" + (M.isFiltered(s) ? "" : " is-on"), href: "#/", "aria-current": M.isFiltered(s) ? null : "true", text: "Alle" }));
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
    var sm = home.summary || {}, up = sm.bullish || 0, down = sm.bearish || 0, tot = up + down || 1;
    var tile = function (n, label, href, on, tone) { return el("a", { class: "el-stat" + (on ? " is-on" : "") + (tone ? " tone-" + tone : ""), href: href }, [el("strong", { class: "num", text: String(n) }), el("span", { text: label })]); };
    return el("div", { class: "el-statwrap" }, [
      el("nav", { class: "el-stats", "aria-label": "Überblick" }, [
        tile(sm.highlights || 0, "Highlights", M.buildHash({ rolle: "highlight" }), s.rolle === "highlight"),
        tile(sm.wave3 || 0, "Welle 3", M.buildHash({ welle: "3" }), s.welle === "3"),
        tile(up, "Aufwärts", M.buildHash({ richtung: "auf" }), s.richtung === "auf", "up"),
        tile(down, "Abwärts", M.buildHash({ richtung: "ab" }), s.richtung === "ab", "down"),
        sm.newlyConfirmed ? tile(sm.newlyConfirmed, "Neu bestätigt", M.buildHash({ reihe: "confirmed" }), s.reihe === "confirmed") : null
      ]),
      el("div", { class: "el-split", role: "img", "aria-label": up + " Aufwärts, " + down + " Abwärts" }, [
        el("span", { class: "el-split-up", style: "flex-grow:" + up }), el("span", { class: "el-split-down", style: "flex-grow:" + down })])
    ]);
  }

  /* ------------------------------------------------------------ Suche */
  var form = null, closeSearch = function () {}, formFocusOut = null;
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
    formFocusOut = function (ev) { if (form && !form.contains(ev.relatedTarget)) close(); };
    input.addEventListener("focus", function () { loadNames().catch(function () { /* beim Tippen erneut */ }); if (input.value.trim()) run(); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (!list.hidden && hits.length) mark((active + 1) % hits.length); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (!list.hidden && hits.length) mark((active - 1 + hits.length) % hits.length); }
      else if (ev.key === "Escape") { if (!list.hidden) { ev.preventDefault(); close(); } }
      else if (ev.key === "Enter") {
        ev.preventDefault();
        var pick = hits[active >= 0 ? active : 0], raw = input.value.trim().toUpperCase();
        if (pick) global.location.hash = "#/" + encodeURIComponent(pick.s);
        else if (/^[A-Z0-9.-]{1,12}$/.test(raw) && (!state.names || state.names.some(function (e) { return String(e.s).toUpperCase() === raw; }))) global.location.hash = "#/" + encodeURIComponent(raw);   // Namensliste nicht geladen: Kuerzel direkt oeffnen; geladen: nur bekannte Kuerzel
      }
    });
    closeSearch = close;
    form = el("form", { class: "el-search", role: "search", onsubmit: function (e) { e.preventDefault(); } }, [
      el("label", { class: "el-sr", for: "el-q", text: "Aktie suchen" }), input,
      el("button", { class: "el-clear", type: "button", "aria-label": "Eingabe löschen", text: "×", onclick: function () { input.value = ""; hits = []; paint(""); input.focus(); } }),
      list, live
    ]);
    form.addEventListener("focusout", formFocusOut);
    if (autofocus) global.requestAnimationFrame(function () { input.focus(); });
    if (initialQ) run();
    return form;
  }
  /* "/" fokussiert die Suche der Startseite (wie in Quant und Discover). */
  document.addEventListener("keydown", function (ev) {
    if (state.view !== "home" || ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
    var i = document.getElementById("el-q"); if (i) { ev.preventDefault(); i.focus(); }
  });

  /* ------------------------------------------------------------ Seite */
  function hero(s) {
    var home = state.home;
    return el("header", { class: "el-hero" }, [
      el("div", { class: "el-hero-main" }, [
        el("p", { class: "el-eyebrow", text: "Vision Universe" }),
        el("h1", { class: "el-title" }, [el("span", { class: "el-mark" }, [icon()]), "Elliott"]),
        el("p", { class: "el-lead" }, [el("span", { text: "Strukturelle Marktszenarien." }), " ", el("span", { text: "Klare Projektionen." }), " ", el("span", { text: "Transparente Invalidierung." })]),
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
    if (state.status === "loading" || state.status === "idle") { host.append(el("div", { class: "el-skel-row", "aria-hidden": "true" }), el("p", { class: "el-sr", role: "status", text: "Elliott wird geladen …" })); return host; }
    if (state.status === "error") {
      host.append(el("section", { class: "el-empty", role: "alert" }, [el("h2", { text: "Die Elliott-Übersicht ist gerade nicht verfügbar" }),
        el("p", { text: "Die Übersicht konnte nicht geladen werden. Die Suche oben funktioniert weiter und öffnet jede Aktie direkt." }),
        el("button", { class: "el-btn", type: "button", text: "Erneut versuchen", onclick: function () { state.status = "idle"; ensureHome(); render(); } })]));
      return host;
    }
    host.append(chips(s));
    var list = M.isFiltered(s) ? M.filterCards(home.cards, s, home.rows) : null;
    var empty = M.emptyState(home, s, null, list ? list.length : null);
    if (empty) { host.append(emptyBox(empty)); return host; }
    if (list) {
      var rule = s.reihe ? ((home.rows.filter(function (r) { return r.id === s.reihe; })[0] || {}).rule || "") : "";
      var shown = list.slice(0, state.shown);
      host.append(el("div", { class: "el-result-head" }, [el("div", {}, [el("h2", { class: "el-row-title", text: M.filterTitle(s, home.rows) }), el("p", { class: "el-row-rule", text: list.length + (list.length === 1 ? " Lesart" : " Lesarten") + (rule ? " · " + rule : "") })]), el("a", { class: "el-all", href: "#/", text: "Zurücksetzen" })]));
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

  function render() {
    var s = M.parseHash(global.location.hash);
    if (s.ticker) { showDetail(s); return; }
    var returning = state.view === "detail";
    leaveDetail();
    ensureHome();
    var key = M.buildHash(Object.assign({}, s, { suche: false, q: "" }));
    var same = key === state.homeKey && state.rendered && state.status === state.renderedStatus;
    if (returning && same) {
      /* Zurueck aus dem Aktienbild: die Startseite steht noch, genau dort, wo man sie verlassen hat. */
      document.title = (M.isFiltered(s) ? M.filterTitle(s, state.home && state.home.rows) + " · " : "") + "Elliott · Vision Universe®";
      var y = state.homeScroll; global.requestAnimationFrame(function () { global.scrollTo(0, y); });
      if (global.VUNavigation) global.VUNavigation.dock({});
      return;
    }
    if (key !== state.homeKey) { state.shown = M.PAGE; state.homeKey = key; }
    var searchHadFocus = document.activeElement && document.activeElement.id === "el-q", q = searchHadFocus ? document.activeElement.value : s.q;
    root.setAttribute("aria-busy", "true");
    root.replaceChildren(hero(Object.assign({}, s, { q: q })), content(s));
    if (searchHadFocus) { var i = document.getElementById("el-q"); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* type=search */ } } }
    restoreFocus();
    document.title = (M.isFiltered(s) ? M.filterTitle(s, state.home && state.home.rows) + " · " : "") + "Elliott · Vision Universe®";
    root.setAttribute("aria-busy", "false"); root.dataset.ready = state.status === "ready" || state.status === "error" ? "true" : "false"; root.dataset.state = state.status;
    state.rendered = true; state.renderedStatus = state.status;
    if (returning) global.scrollTo(0, 0);
    if (global.VUNavigation) global.VUNavigation.dock({});
  }

  /* "Zurueck" aus einem anderen Dokument landet dort, wo man war (Seitenwechsel: eigenes kleines Gedaechtnis). */
  var SCROLL_KEY = "vu-elliott-scroll-v1";
  function rememberScroll() { try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ h: global.location.hash, y: Math.round(state.view === "home" ? global.scrollY : state.homeScroll) })); } catch (e) { /* nur dieser Tab */ } }
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
    render();
    if (state.view === "home") { var tries = 0, done = function () { if (state.status === "ready") restoreScroll(); else if (state.status !== "error" && ++tries < 50) global.setTimeout(done, 100); }; done(); }
  }
  global.addEventListener("hashchange", function () { if (global.location.pathname.indexOf("/elliott/") === 0) render(); });
  global.VUElliottApp = { state: state, render: render, start: start, loadStack: loadStack };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(window);
