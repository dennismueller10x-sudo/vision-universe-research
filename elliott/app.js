/* VISION UNIVERSE ELLIOTT — app.js (Produkt-Shell). /elliott/ Startseite (W01), #/?welle=3|richtung=…|neu=1|reihe=<id> teilbare
   Filter (W02–W04), #/<TICKER>[?ansicht=profi] Aktienbild (W05). Das Aktienbild ist das vorhandene Chartbild: beim ersten Oeffnen
   laedt diese Seite genau das Buendel, das /quant/index.html nennt, und haengt es ueber QXApp.mountElliott ein (keine zweite
   Implementierung). Vorgewaermt wird nur bei Absicht (Zeiger, Fokus), nie beim Laden der Startseite. */
(function (global) {
  "use strict";
  var M = global.VUElliottHome;
  var root = document.getElementById("el-main");
  var state = { home: null, status: "idle", names: null, namesPromise: null, shown: 10, view: "home", homeKey: null, homeScroll: 0, rendered: false };

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

  var stackPromise = null, stackLinks = [];
  function loadStack() {
    if (!stackPromise) {
      global.QX_HOST = "elliott";     // vor dem Buendel: app.js startet dann keinen eigenen Router
      stackPromise = fetchRes("/quant/index.html").then(function (r) { return r.text(); }).then(function (html) {
        var gate = new DOMParser().parseFromString(html, "text/html").querySelector("script[data-content]");
        return gate ? fetchRes(gate.getAttribute("data-content")).then(function (r) { return r.text(); }) : html;
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html"), loads = [];
        Array.prototype.slice.call(doc.querySelectorAll('link[rel="stylesheet"]')).concat([{ getAttribute: function () { return "/elliott/wellen.css"; } }]).forEach(function (l) {
          var href = l.getAttribute("href");
          if (!href || /site-navigation\.css/.test(href)) return;
          var link = el("link", { rel: "stylesheet", href: href, media: "not all", dataset: { qxHost: "1" } });
          stackLinks.push(link);
          loads.push(new Promise(function (ok) { link.onload = link.onerror = function () { ok(); }; }));
          document.head.append(link);
        });
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
  function warm() { loadStack().catch(function () { /* beim Oeffnen erneut */ }); }
  document.addEventListener("pointerover", function (ev) { if (ev.target.closest && ev.target.closest(".el-card, .el-hit")) warm(); }, { passive: true });
  document.addEventListener("focusin", function (ev) { if (ev.target.closest && ev.target.closest(".el-card, .el-hit")) warm(); });
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
    var back = lastTicker && root.querySelector('a.el-card[data-symbol="' + lastTicker.replace(/[^A-Za-z0-9.-]/g, "") + '"]');
    if (back) { try { back.focus({ preventScroll: true }); } catch (e) { /* ohne Fokus */ } }
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a.el-skip");
    if (!a) return;
    ev.preventDefault();
    var m = state.view === "detail" && detailRoot ? detailRoot.querySelector("main") : document.getElementById("el-main");
    if (m) { m.setAttribute("tabindex", "-1"); m.focus(); }
  });

  var U = global.VUUI, LIST = 10;
  function frag(html) { var t = document.createElement("template"); t.innerHTML = html; return t.content; }
  function p0(v) { var r = Math.round(v * 100); return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toLocaleString("de-DE"); }
  var ROLE_SHORT = { PRIMARY: "Hauptlesart", ALTERNATIVE: "Alternative", HIGH_UPSIDE: "Alternative", MOTIVE_ALTERNATIVE: "Motiv-Alternative", EXPLORE_HIGHLIGHT: "Explorativ" };
  var TYPE_SHORT = { NEXT_MOVE: "Folgebewegung", REVERSAL: "Gegenbewegung", THRUST: "Ausbruch" };
  var ART = { neu: "NEW", bestaetigt: "CONFIRMED", ueberarbeitet: "REVISED", zone: "ZONE", rolle: "ROLE" };
  var KIND = { NEW: ["Neue Lesart", "erstmals erkannt", "neu"], CONFIRMED: ["Bestätigt", "Struktur steht jetzt", "bestaetigt"], REVISED: ["Überarbeitet", "Zählung angepasst", "ueberarbeitet"], ZONE: ["Zone erreicht", "Kurs in der Zone", "zone"], ROLE: ["Rolle gewechselt", "Hauptlesart oder Alternative getauscht", "rolle"] };
  var PRIO = ["CONFIRMED", "NEW", "ZONE", "REVISED", "ROLE"];
  var EXP = "<b>Experimentell.</b> Eine Lesart beschreibt eine mögliche Struktur mit klarer Grenze. Keine Vorhersage, kein Kursziel, keine Empfehlung.";

  function card(c, n) {
    var t = c.tiers || {}, k = t.ext ? "ext" : t.base ? "base" : t.xtr ? "xtr" : null, up = c.dir === "UP", inv = c.inv && c.inv.p > 0 ? c.inv : null;
    var spark = el("span", { class: "el-spark", "aria-hidden": "true", dataset: { t: c.t } });
    if (global.VUElliottSpark) global.VUElliottSpark.observe(spark);
    return el("a", { class: "el-card", href: M.detailHref(c.t), "aria-label": M.ariaLabel(c), dataset: { id: c.id, symbol: c.t, role: c.role } }, [
      el("div", { class: "el-c-top" }, [n ? el("span", { class: "el-c-n num", text: String(n) }) : null,
        el("span", { class: "el-c-name" }, [el("b", { class: "el-name", text: c.n }), el("span", { class: "el-sub", text: [c.t, M.price(c), ROLE_SHORT[c.role] || M.roleLabel(c.role)].filter(Boolean).join(" · "), title: M.ROLE_NOTE[c.role] })]), spark]),
      el("div", { class: "el-pills" }, [el("span", { class: "el-pill", text: c.wave ? "Welle " + c.wave : TYPE_SHORT[c.type] || "Lesart" }),
        el("span", { class: "el-pill el-dir " + (up ? "is-up" : "is-down"), text: (up ? "▲ " : "▼ ") + M.DIR_LABEL[c.dir] }),
        el("span", { class: "el-pill el-meta", text: M.STATUS_LABEL[c.st] })]),
      el("div", { class: "el-zg" }, [
        el("span", {}, [el("span", { class: "el-k", text: "Zone " + (k ? M.TIER_LABEL[k] : "") }), el("b", { class: "el-proj-v num", text: k ? p0(t[k][0]) + " bis " + p0(t[k][1]) + " %" : "–" })]),
        el("span", {}, [el("span", { class: "el-k", text: "Ungültig " + (inv && inv.dir === "above" ? "über" : "unter") }), el("b", { class: "num", text: inv ? U.money(inv.p, c.cur) : "–" })])]),
      c.fr === "DELAYED" ? el("p", { class: "el-delayed", role: "note", text: "Kurs verzögert · " + M.dateDe(c.last) }) : null
    ]);
  }
  function list(cards, num, cls) { return el("ul", { class: "el-list " + (cls || ""), role: "list" }, cards.map(function (c, i) { return el("li", {}, [card(c, num ? i + 1 : 0)]); })); }
  function sect(title, href, link) { return frag(U.sect(title, href ? { href: href, link: link } : null)); }
  function note(html, cls) { return el("div", { class: "vu-box vu-box--line el-note " + (cls || "") }, [frag(U.glyph("book", 18)), el("span", {}, [frag(html)])]); }
  function chip(label, n, href, on) { return el("a", { class: "vu-chip el-chip" + (on ? " is-on" : ""), href: href, "aria-current": on ? "page" : null }, [label, n !== null && n !== undefined ? el("span", { class: "el-chip-n", text: String(n) }) : null]); }
  function filterBtn(label) { return el("button", { class: "vu-chip el-chip", type: "button", onclick: function () { openFilter(M.parseHash(global.location.hash)); } }, [frag(U.glyph("filter", 14)), label]); }
  function count(s) { return M.filterCards(state.home.cards, s).length; }
  function emptyBox(e) {
    return el("section", { class: "el-empty", role: "status" }, [el("h2", { text: e.title }), el("p", { text: e.text }),
      e.kind === "FILTER" ? el("a", { class: "vu-btn vu-btn--sm", href: "#/", text: "Filter zurücksetzen" }) : null]);
  }

  function chips(s) {
    var rows = [], shown = {}, row = el("div", { class: "vu-chips el-chips", role: "group", "aria-label": "Lesarten filtern" });
    if (s.welle && !s.reihe && !s.neu) {
      shown.welle = shown.richtung = 1;
      row.append(chip("Alle", count({ welle: s.welle }), M.buildHash({ welle: s.welle }), !s.richtung && !M.isFiltered(Object.assign({}, s, { welle: null }))));
      [["auf", "▲ Aufwärts"], ["ab", "▼ Abwärts"]].forEach(function (o) { row.append(chip(o[1], count({ welle: s.welle, richtung: o[0] }), M.buildHash({ welle: s.welle, richtung: o[0] }), s.richtung === o[0])); });
      row.append(filterBtn("Filter"));
    } else {
      var one = function (k, v) { var x = {}; x[k] = v; return x; }, only = function (k, v) { return !s.reihe && !s.neu && s[k] === v && M.buildHash(s) === M.buildHash(one(k, v)); };
      row.append(chip("Alle", state.home.cards.length, "#/", !M.isFiltered(s)));
      [["welle", "3", "Welle 3"], ["welle", "C", "Welle C"], ["richtung", "auf", "Aufwärts"], ["richtung", "ab", "Abwärts"]].forEach(function (o) {
        if (only(o[0], o[1])) shown[o[0]] = 1;
        var n = count(one(o[0], o[1])); if (n) row.append(chip(o[2], n, M.buildHash(one(o[0], o[1])), only(o[0], o[1])));
      });
      if (!s.richtung || s.welle || s.status || s.reihe || s.neu) row.append(filterBtn("Filter"));
    }
    rows.push(row);
    if (s.richtung && !s.welle && !s.reihe && !s.neu) {
      shown.richtung = 1;
      var sub = el("div", { class: "vu-chips el-chips el-chips-sub", role: "group", "aria-label": "Weiter eingrenzen" });
      [["welle", "3", "Welle 3"], ["welle", "C", "Welle C"], ["status", "bestaetigt", "Bestätigt"]].forEach(function (o) {
        var p = {}; p[o[0]] = o[1]; var n = count(Object.assign({}, s, p));
        if (s[o[0]] === o[1]) shown[o[0]] = 1;
        if (n) sub.append(chip(o[2] + " · " + n, null, M.buildHash(M.withChip(s, o[0], o[1])), s[o[0]] === o[1]));
      });
      sub.append(filterBtn("Mehr")); rows.push(sub);
    }
    var extra = ["welle", "richtung", "status", "rolle"].filter(function (k) { return s[k] && !shown[k]; });
    if (extra.length) rows[0].append.apply(rows[0], extra.map(function (k) { var x = {}; x[k] = s[k]; return chip(M.filterTitle(x) + " ×", null, M.buildHash(M.withChip(s, k, s[k])), true); }));
    return rows;
  }

  var FGROUPS = [["Welle", "welle", [["3", "Welle 3"], ["5", "Welle 5"], ["C", "Welle C"]]], ["Richtung", "richtung", [["auf", "▲ Aufwärts"], ["ab", "▼ Abwärts"]]],
    ["Status", "status", [["bestaetigt", "Bestätigt"], ["aufbau", "Im Aufbau"]]], ["Rolle", "rolle", [["primaer", "Hauptlesart"], ["alternative", "Alternative"], ["motiv", "Motiv-Alternative"], ["highlight", "Explorativ"]]]];
  var sheetNode = null;
  function sheetShell(title) {
    if (!sheetNode) { sheetNode = frag(U.sheet("el-sheet", title, "")).firstChild; document.body.append(sheetNode); }
    sheetNode.querySelector(".vu-sheet-ui").setAttribute("aria-label", title);
    return sheetNode.querySelector(".vu-sheet-ui");
  }
  function openFilter(s0) {
    var d = Object.assign({}, s0, { reihe: null, suche: false, q: "" }), box = sheetShell("Filter");
    function paint() {
      var body = [el("div", { class: "el-sheet-head" }, [el("h2", { class: "vu-mt", text: "Filter" }), el("button", { class: "el-link", type: "button", text: "Zurücksetzen", onclick: function () { d = M.parseHash("#/"); paint(); } })])];
      FGROUPS.forEach(function (g) {
        var opts = g[2].map(function (o) { var p = {}; p[g[1]] = o[0]; var n = count(p), on = d[g[1]] === o[0];
          return n || on ? el("button", { type: "button", role: "checkbox", "aria-checked": String(on), class: "vu-chip el-chip" + (on ? " is-on" : ""), onclick: function () { d[g[1]] = on ? null : o[0]; paint(); } }, [o[1], el("span", { class: "el-chip-n", text: String(n) })]) : null; }).filter(Boolean);
        if (opts.length) body.push(el("p", { class: "vu-ltag el-fl", text: g[0] }), el("div", { class: "el-fwrap" }, opts));
      });
      var sw = frag(U.toggle(d.neu, "Nur neu und verändert")).firstChild; sw.classList.add("el-fswitch");
      sw.querySelector("input").addEventListener("change", function (e) { d.neu = e.target.checked; paint(); });
      var n = count(d);
      body.push(sw, frag(U.help("Die Zahlen zeigen, wie viele Lesarten es insgesamt gibt.")),
        el("a", { class: "vu-btn vu-btn--block el-fgo", href: M.buildHash(d), onclick: function () { U.closeSheet(sheetNode); }, text: n + (n === 1 ? " Lesart" : " Lesarten") + " zeigen" }));
      box.replaceChildren.apply(box, body);
    }
    paint(); U.openSheet(sheetNode);
  }
  function openAbout() {
    var box = sheetShell("Was ist eine Elliott-Welle?"), P = [[0, 70], [58, 46], [116, 58], [174, 18], [232, 34], [290, 6], [340, 12]];
    var svg = '<svg class="el-schema" viewBox="-8 0 356 90" role="img" aria-label="Schema: fünf Schritte, drei nach vorn und zwei zurück"><path d="M' + P.map(function (p) { return p.join(" "); }).join(" L") + ' L340 90 L0 90Z" fill="#c8f531" opacity=".35"/><path d="M' + P.map(function (p) { return p.join(" "); }).join(" L") + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>' +
      P.slice(1, 6).map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="currentColor"/><text x="' + p[0] + '" y="' + (p[1] + 4) + '" text-anchor="middle" class="el-schema-n">' + (i + 1) + "</text>"; }).join("") + '<circle cx="340" cy="12" r="5" fill="#c8f531" stroke="currentColor" stroke-width="2"/></svg>';
    var term = function (k, v) { return el("div", { class: "el-term" }, [el("b", { text: k }), el("span", { text: v })]); };
    box.replaceChildren(el("p", { class: "vu-ltag", text: "Kurz erklärt" }), el("h2", { class: "vu-mt", text: "Was ist eine Elliott-Welle?" }),
      el("p", { class: "el-sheet-p", text: "Kurse laufen oft in 5 Schritten: 3 nach vorn, 2 zurück. Welle 3 ist meist die stärkste." }), frag(svg), el("p", { class: "vu-mu vu-xs", text: "Schema, keine echten Kurse." }),
      term("Zone (Projektionszone)", "Bereich, in den die Welle nach den Regeln rechnerisch laufen kann."), term("Ungültig unter …", "Schließt der Kurs jenseits dieser Grenze, stimmt die Zählung nicht mehr."), term("Bestätigt / Im Aufbau", "Wie weit die Struktur schon steht."),
      frag(U.help("Eine Projektion ist keine Wahrscheinlichkeit, keine Prognose und kein Kursziel. Für Projektionszonen liegt noch keine ausreichende historische Prüfung vor.")),
      el("p", { class: "vu-xs" }, [el("a", { href: "/quant/#/methodik", text: "Methodik ansehen" })]),
      el("button", { class: "vu-btn vu-btn--block", type: "button", text: "Verstanden", onclick: function () { U.closeSheet(sheetNode); } }));
    U.openSheet(sheetNode);
  }
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
  var de = document.documentElement;
  document.addEventListener("keydown", function (ev) { if (ev.key === "Tab") de.setAttribute("data-kbd", ""); });
  document.addEventListener("pointerdown", function () { de.removeAttribute("data-kbd"); });
  document.addEventListener("keydown", function (ev) {
    if (state.view !== "home" || ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
    var i = document.getElementById("el-q"); if (i) { ev.preventDefault(); i.focus(); }
  });

  function artOf() { var h = String(global.location.hash), i = h.indexOf("?"); var a = i >= 0 ? new URLSearchParams(h.slice(i + 1)).get("art") : null; return ART[a] ? a : null; }
  function head(title, lead, kids) {
    return el("header", { class: "el-hero" }, [kids || null, el("h1", { class: "vu-lt el-title", text: title }), lead ? el("p", { class: "vu-lead el-lead", text: lead }) : null]);
  }
  function hero(s) {
    var home = state.home, sm = (home && home.summary) || {}, up = sm.bullish || 0, down = sm.bearish || 0;
    var out = [head("Welche Wellen laufen gerade?", "Wir zählen Wellen in US-Charts nach festen Regeln. Jede Lesart hat eine Grenze, ab der sie nicht mehr gilt.",
      el("p", { class: "el-tag" }, [el("span", { class: "vu-ltag", text: "Elliott" }), frag(U.pro())])), buildSearch(s.q, s.suche)];
    if (s.suche) { out.push(el("p", { class: "el-suche-hint" }, ["Name oder Kürzel eingeben – jede abgedeckte US-Aktie öffnet ihr Elliott-Bild. ", el("a", { href: "#/", text: "Zur Übersicht" })])); return out; }
    if (!home) return out;
    var tile = function (href, label, v, sub) { var a = el(href ? "a" : "div", { class: "el-tile", href: href }); a.append(frag(U.tile(label, String(v), sub))); return a; };
    out.push(el("nav", { class: "vu-grid el-tiles", "aria-label": "Überblick" }, [tile(null, "Lesarten", sm.theses || home.cards.length, "in " + (sm.securities || "–") + " Aktien"),
      tile(M.buildHash({ welle: "3" }), "Welle 3", sm.wave3 || 0, "die stärkste Welle"), tile(M.buildHash({ neu: true }), "Neu", sm.recent || 0, "letzte 2 Tage")]));
    out.push(el("div", { class: "vu-box el-split", role: "img", "aria-label": up + " Aufwärts, " + down + " Abwärts" }, [
      el("div", { class: "el-split-n", "aria-hidden": "true" }, [el("span", { text: "▲ " + up + " aufwärts" }), el("span", { text: down + " abwärts ▼" })]),
      el("div", { class: "el-bar", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.round(100 * up / ((up + down) || 1)) + "%" })]),
      el("p", { class: "vu-mu vu-xs", text: (up === down ? "Gleich viele Aufwärts- und Abwärts-Lesarten" : up > down ? "Mehr Aufwärts-Lesarten als Abwärts" : "Mehr Abwärts-Lesarten als Aufwärts") + " · Stand " + M.dateDe(home.dataAsOf) })]));
    out.push(el("button", { class: "el-about", type: "button", onclick: openAbout }, [frag(U.glyph("book", 18)), el("span", { text: "Wie ist das gemeint?" }), frag(U.glyph("next", 16))]));
    return out;
  }
  var NAV_GLYPH = { trend: "line", strength: "spark", engine: "target", span: "grid", recent: "bell" };
  var RULE_SHORT = { wave3: "Bestätigt vor im Aufbau, dann Trend und Stärke. Nie nach Größe der Zone." };
  function homeRows(host) {
    var rows = M.rowsOf(state.home), big = rows.filter(function (r) { return r.id === "wave3" || r.id === "confirmed"; });
    big.forEach(function (r) {
      var n = r.id === "wave3" ? 4 : 3;
      host.append(el("section", { class: "el-row", "aria-label": r.title, dataset: { row: r.id } }, [sect(r.title, M.rowHref(r), "Alle " + r.total),
        el("p", { class: "vu-mu vu-xs el-rule", text: RULE_SHORT[r.id] || r.rule }), list(r.cards.slice(0, n), r.id === "wave3")]));
    });
    var rest = rows.filter(function (r) { return big.indexOf(r) < 0; });
    if (rest.length) host.append(sect("Weitere Reihen"), el("div", { class: "vu-stack el-nav" }, rest.map(function (r) {
      return frag(U.navcard({ href: M.rowHref(r), glyph: NAV_GLYPH[r.id], icon: NAV_GLYPH[r.id] ? null : "elliott", title: r.title, sub: r.total + " Lesarten" }));
    })));
    var miss = M.missingRowNote(state.home, "wave5");
    if (miss) host.append(el("p", { class: "vu-mu vu-xs el-gap", text: miss }));
  }
  function leadFor(s, n, rows) {
    var L = n + (n === 1 ? " Lesart" : " Lesarten");
    if (s.reihe) { var r = (rows || []).filter(function (x) { return x.id === s.reihe; })[0]; return L + (r ? ". " + r.rule : ""); }
    if (s.welle === "3") return L + ", in denen gerade die stärkste Welle laufen könnte.";
    if (s.welle) return L + ", in denen eine Welle " + s.welle + " laufen könnte.";
    if (s.richtung) return L + ", die " + (s.richtung === "auf" ? "steigende" : "fallende") + " Kurse beschreiben.";
    return L + " in dieser Auswahl.";
  }
  function ordered(s, cards) {
    var r = s.welle && !s.reihe ? (state.home.rows || []).filter(function (x) { return x.id === "wave" + s.welle; })[0] : null, pos = {};
    if (!r) return cards;
    r.ids.forEach(function (id, i) { pos[id] = i; });
    return cards.map(function (c, i) { return { c: c, k: pos[c.id] !== undefined ? pos[c.id] : 1e6 + i }; }).sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.c; });
  }
  function more(host, total, shown) {
    if (total > shown) host.append(el("button", { class: "vu-btn vu-btn--line vu-btn--block el-more", type: "button", text: "Weitere " + Math.min(total - shown, LIST) + " laden", onclick: function () { state.shown += LIST; render(); var g = root.querySelectorAll(".el-grid .el-card"); if (g[shown]) g[shown].focus(); } }));
  }
  function newsView(host, s) {
    var art = artOf(), base = M.filterCards(state.home.cards, s), by = {};
    base.forEach(function (c) { (by[c.chg.k] = by[c.chg.k] || []).push(c); });
    var dates = {}; base.forEach(function (c) { dates[c.chg.d] = 1; });
    host.append(head("Neu und verändert", "Was sich in den letzten " + (Object.keys(dates).length || 2) + " Handelstagen getan hat."));
    var kinds = PRIO.filter(function (k) { return by[k]; }).sort(function (a, b) { return ["NEW", "CONFIRMED", "REVISED", "ZONE", "ROLE"].indexOf(a) - ["NEW", "CONFIRMED", "REVISED", "ZONE", "ROLE"].indexOf(b); });
    var hrefArt = function (k) { return M.buildHash(s) + (k ? "&art=" + KIND[k][2] : ""); };
    host.append(el("nav", { class: "vu-grid el-tiles el-tiles2", "aria-label": "Arten der Änderung" }, kinds.map(function (k) { var a = el("a", { class: "el-tile", href: hrefArt(k) }); a.append(frag(U.tile(KIND[k][0], String(by[k].length), KIND[k][1]))); return a; })));
    var row = el("div", { class: "vu-chips el-chips", role: "group", "aria-label": "Art der Änderung" }, [chip("Alle", base.length, hrefArt(null), !art)]);
    kinds.forEach(function (k) { row.append(chip(k === "NEW" ? "Neu" : KIND[k][0], by[k].length, hrefArt(k), art === KIND[k][2])); });
    host.append(row);
    if (!base.length) { host.append(emptyBox(M.emptyState(state.home, s, null, 0) || { title: "Keine Änderung", text: "In den letzten Handelstagen hat sich keine Lesart geändert." })); return; }
    var groups = [], ds = Object.keys(dates).sort().reverse();
    PRIO.forEach(function (k) {
      if (!by[k] || (art && ART[art] !== k)) return;
      if (!art) return groups.push([k, by[k][0].chg.d, by[k].filter(function (c) { return c.chg.d === by[k][0].chg.d; }).slice(0, 3)]);
      ds.forEach(function (d) { var cs = by[k].filter(function (c) { return c.chg.d === d; }); if (cs.length) groups.push([k, d, cs]); });
    });
    groups.forEach(function (g) {
      var all = by[g[0]].length;
      host.append(el("section", { class: "el-row", dataset: { row: "chg-" + g[0] } }, [sect(KIND[g[0]][0] + " · " + M.dateDe(g[1]).slice(0, 6), !art && all > 3 ? hrefArt(g[0]) : null, "Alle " + all), list(g[2], false, "el-grid")]));
    });
    host.append(frag(U.help("Zone erreicht: Der Kurs ist in den Bereich gelaufen, den die Lesart beschrieben hat. Danach kann sie enden.")));
    /* Z4: echte Schalter im Konto, zugestellt nur über die App (konto/push-settings.js, erst hier geladen).
       Elliott-Lesarten sind noch keine Ereignisart: der Schalter bleibt gesperrt und sagt es. */
    var bell = el("div", { class: "vu-box vu-box--lime", style: "margin-top:12px" }, [el("b", { text: "Bei Änderungen an meinen Aktien melden" }), el("p", { class: "vu-xs", text: "Benachrichtigungen kommen über die App." })]);
    host.append(bell);
    var pp = global.__vuPushP || (global.__vuPushP = global.VUPush ? Promise.resolve() : new Promise(function (done) {
      var s = document.createElement("script"); s.src = "/konto/push-settings.js"; s.onload = s.onerror = function () { done(); }; document.head.appendChild(s); }));
    pp.then(function () { if (global.VUPush) global.VUPush.mount(bell, { keys: ["ELLIOTT_CHANGE"], more: true }); });
  }

  function content(s) {
    var home = state.home, host = el("div", { class: "el-content", id: "el-content" });
    if (state.status === "loading" || state.status === "idle") { host.append(el("div", { class: "el-skel-row", "aria-hidden": "true" }), el("p", { class: "el-sr", role: "status", text: "Elliott wird geladen …" })); return host; }
    if (state.status === "error") {
      host.append(el("section", { class: "el-empty", role: "alert" }, [el("h2", { text: "Die Elliott-Übersicht ist gerade nicht verfügbar" }),
        el("p", { text: "Die Übersicht konnte nicht geladen werden. Die Suche oben funktioniert weiter und öffnet jede Aktie direkt." }),
        el("button", { class: "vu-btn vu-btn--sm", type: "button", text: "Erneut versuchen", onclick: function () { state.status = "idle"; ensureHome(); render(); } })]));
      return host;
    }
    if (s.neu && !s.reihe) { newsView(host, s); host.append(note(EXP)); return host; }
    var list0 = M.isFiltered(s) ? ordered(s, M.filterCards(home.cards, s, home.rows)) : null;
    if (list0) host.append(head(M.filterTitle(s, home.rows), leadFor(s, list0.length, home.rows)));
    if (!s.reihe) chips(s).forEach(function (r) { host.append(r); });
    var empty = M.emptyState(home, s, null, list0 ? list0.length : null);
    if (empty) { host.append(emptyBox(empty)); return host; }
    if (list0) {
      if (s.welle) host.append(note("Reihenfolge: bestätigt vor im Aufbau, dann Trend, Rang und relative Stärke. <b>Nie nach Größe der Zone.</b>", "el-order"));
      var shown = Math.min(list0.length, state.shown);
      host.append(list(list0.slice(0, shown), true, "el-grid"));
      more(host, list0.length, shown);
      host.append(frag(U.help(s.welle ? "Motiv-Alternative: eine zweite Zählung, die nach den Regeln ebenfalls passt." : "Hauptlesart: die Zählung, die die Engine bevorzugt. Alternative: eine zweite mögliche Zählung derselben Aktie.")));
    } else homeRows(host);
    host.append(note(EXP), el("aside", { class: "el-more-links" }, [el("a", { href: "/screener/", text: "Weitere Filter im Screener" }), el("a", { href: "/quant/", text: "Quantitative Einordnung in Quant" })]));
    return host;
  }

  var focusHref = null;
  document.addEventListener("click", function (ev) { var a = ev.target.closest && ev.target.closest(".el-chip, .el-tile, .vu-sect a"); focusHref = a ? a.getAttribute("href") : null; });
  function restoreFocus() {
    if (!focusHref) return;
    var target = [].filter.call(root.querySelectorAll(".el-chip, .el-tile, .vu-sect a"), function (a) { return a.getAttribute("href") === focusHref; })[0] || root.querySelector(".el-title, .el-chip.is-on");
    focusHref = null;
    if (target) { if (!target.matches("a,button")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  }

  function render() {
    var s = M.parseHash(global.location.hash);
    if (s.ticker) { showDetail(s); return; }
    var returning = state.view === "detail";
    leaveDetail();
    ensureHome();
    var key = M.buildHash(Object.assign({}, s, { suche: false, q: "" })) + "|" + artOf();
    var same = key === state.homeKey && state.rendered && state.status === state.renderedStatus;
    if (returning && same) {
      document.title = (M.isFiltered(s) ? M.filterTitle(s, state.home && state.home.rows) + " · " : "") + "Elliott · Vision Universe®";
      var y = state.homeScroll; global.requestAnimationFrame(function () { global.scrollTo(0, y); });
      if (global.VUNavigation) global.VUNavigation.dock({});
      return;
    }
    if (key !== state.homeKey) { state.shown = LIST; state.homeKey = key; }
    var searchHadFocus = document.activeElement && document.activeElement.id === "el-q", q = searchHadFocus ? document.activeElement.value : s.q;
    root.setAttribute("aria-busy", "true");
    root.classList.toggle("is-suche", !!s.suche);
    root.replaceChildren.apply(root, (M.isFiltered(s) && !s.suche ? [] : hero(Object.assign({}, s, { q: q }))).concat(s.suche ? [] : [content(s)]));
    if (s.suche) global.scrollTo(0, 0);
    if (searchHadFocus) { var i = document.getElementById("el-q"); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* type=search */ } } }
    restoreFocus();
    root.querySelectorAll(".el-chips .is-on").forEach(function (c) { var p = c.parentNode; if (c.offsetLeft + c.offsetWidth > p.clientWidth) p.scrollLeft = c.offsetLeft - 16; });
    document.title = (M.isFiltered(s) ? M.filterTitle(s, state.home && state.home.rows) + " · " : "") + "Elliott · Vision Universe®";
    root.setAttribute("aria-busy", "false"); root.dataset.ready = state.status === "ready" || state.status === "error" ? "true" : "false"; root.dataset.state = state.status;
    state.rendered = true; state.renderedStatus = state.status;
    if (returning) global.scrollTo(0, 0);
    if (global.VUNavigation) global.VUNavigation.dock({});
  }

  var SCROLL_KEY = "vu-elliott-scroll-v1";
  function rememberScroll() { try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ h: global.location.hash, y: Math.round(state.view === "home" ? global.scrollY : state.homeScroll) })); } catch (e) { /* nur dieser Tab */ } }
  function restoreScroll() {
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (!nav || nav.type !== "back_forward") return;
    try {
      var m = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "null");
      if (!m || m.h !== global.location.hash || !(m.y > 0)) return;
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
